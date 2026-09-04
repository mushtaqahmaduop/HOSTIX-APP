// ════════════════════════════════════════════════════════════════════════════
// EntitlementService  —  Phase 2  (spec §10 licence states, §11 trust root)
//
// An entitlement is the control plane's signed statement about one device's
// licence. It is a compact JWS, `alg: EdDSA`, verified against a public key
// shipped in `entitlement-keys.js`.
//
// WHY THIS EXISTS — it closes two logged risks, and neither is cosmetic:
//
//   audit C2  The licensing secret ships inside the asar. `_SECRET` is
//             SYMMETRIC, so anyone who unpacks the app can mint licences with
//             any expiry they like. An entitlement is signed by a key the app
//             does not have. Unpacking the asar yields a PUBLIC key, which is
//             worth nothing to a forger.
//
//   audit H1  Licence expiry trusts the local clock. `checkLicenseValidity()`
//             compares `new Date()` against a stored expiry, so winding the
//             clock back extends any licence indefinitely. An entitlement
//             carries `issuedAt` — a time the SERVER asserts — and this
//             service keeps a high-water mark of the latest one it has ever
//             seen. A clock behind that watermark is provably wrong.
//
// ── THIS FILE STILL DECIDES NOTHING — BUT SOMETHING ELSE NOW DOES ───────────
//
// This heading used to read "THIS PHASE ENFORCES NOTHING", and it went on to
// say the app behaved byte-for-byte as it did before. That stopped being true
// when enforcement was wired, and a comment that confidently states the
// opposite of the code is worse than no comment: it invites the next reader to
// extend this file as if nothing downstream were listening.
//
// What is still true, and is the reason to keep a note here at all: this
// service VERIFIES, CACHES and REPORTS. It gates nothing itself. Keep it that
// way — the split is what makes the trust boundary reviewable in one file.
//
// What changed:
//
//   services/enforcement.js   turns this report into a decision. REVOKED
//                             blocks the app; SUSPENDED and EXPIRED make it
//                             read-only (D-3: view everything, create nothing,
//                             never destructive).
//   main.js                   blocks the write at the IPC layer, so reaching a
//                             control that slipped past the UI still fails.
//   services/device.js        registers the machine and fetches what this file
//                             verifies. `/v1/devices/register` exists and has
//                             been exercised against the live control plane.
//
// `checkLicenseValidity()` in main.js is therefore no longer the sole
// authority. A fresh entitlement outranks the local licence file, because it
// is the only thing that can know about a suspension, revocation or renewal
// decided after this machine activated. With no apiBase — still the state of
// every build shipped before services/discovery.js — this reports `NONE` and
// the licence file decides everything, exactly as it always did.
//
// ── Offline is the normal case, not the error case ──────────────────────────
//
// These are Pakistani hostels; the internet is frequently absent. Spec §3.1
// Rule 6 is absolute: the control plane being unreachable must never stop
// hostel operations. So the entitlement is cached on disk and keeps answering
// from cache while offline, up to `notAfter`. Past `notAfter` it reports STALE
// — which means "fall back to the local licence", never "stop working". That
// is not aspirational any more; it is what enforcement.js does with a STALE
// report.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const config = require('./config');
const logger = require('./logger');
const api    = require('./api-client');
const { KEYS, ACTIVE_KID } = require('./entitlement-keys');

const log = logger.forService('entitlement');

/** Licence states, per D-3. The server decides which one applies; we render it. */
const STATUS = {
  ACTIVE:    'ACTIVE',
  GRACE:     'GRACE',
  EXPIRED:   'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  REVOKED:   'REVOKED'
};
const SERVER_STATUSES = new Set(Object.keys(STATUS));

/** Local-only outcomes. Never sent by the server; produced by this file. */
const LOCAL = {
  NONE:  'NONE',   // nothing cached — the state every machine is in today
  STALE: 'STALE'   // cached, validly signed, but past its notAfter
};

/** Stable reason codes, in the `E_*` style api-client.js established (§39). */
const E = {
  NONE:          'E_ENT_NONE',
  MALFORMED:     'E_ENT_MALFORMED',
  ALG:           'E_ENT_ALG',
  UNKNOWN_KID:   'E_ENT_UNKNOWN_KID',
  BAD_SIGNATURE: 'E_ENT_BAD_SIGNATURE',
  BAD_CLAIMS:    'E_ENT_BAD_CLAIMS',
  WRONG_MACHINE: 'E_ENT_WRONG_MACHINE',
  STALE:         'E_ENT_STALE',
  CLOCK:         'E_ENT_CLOCK'
};

const CACHE_FILE = 'entitlement.json';

// An Ed25519 signature is exactly 64 bytes. Checking the length before calling
// crypto.verify turns a class of malformed input into a clean reason code.
const ED25519_SIG_BYTES = 64;

// ── Key handling ────────────────────────────────────────────────────────────
// Parsed once and memoised. A malformed PEM in the shipped map is a build
// defect, not a runtime condition, but it must not throw during boot — an
// unusable key means "cannot verify", which is already a state we handle.
const _keyCache = new Map();
function _publicKey(kid, keys) {
  const map = keys || KEYS;
  if (!Object.prototype.hasOwnProperty.call(map, kid)) return null;
  const cacheKey = kid + '|' + (keys ? 'custom' : 'default');
  if (_keyCache.has(cacheKey)) return _keyCache.get(cacheKey);
  let parsed = null;
  try { parsed = crypto.createPublicKey(map[kid]); }
  catch (e) { log.error('entitlement_key_unparseable', { kid, message: e.message }); }
  _keyCache.set(cacheKey, parsed);
  return parsed;
}

function _b64uToBuf(s) {
  return Buffer.from(String(s), 'base64url');
}

function _isIso(v) {
  if (typeof v !== 'string' || !v) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

// ── Claim shape ─────────────────────────────────────────────────────────────
// Validated strictly. A claim set that is merely *plausible* is how a licence
// system ends up trusting `status: undefined` and treating it as ACTIVE.
function _validateClaims(c) {
  if (!c || typeof c !== 'object') return 'not an object';
  if (c.ver !== 1) return 'unsupported ver';
  for (const k of ['deviceId', 'licenseId', 'machineId']) {
    if (typeof c[k] !== 'string' || !c[k]) return 'missing ' + k;
  }
  if (!SERVER_STATUSES.has(c.status)) return 'unknown status';
  for (const k of ['expiresAt', 'issuedAt', 'notAfter']) {
    if (!_isIso(c[k])) return 'bad ' + k;
  }
  const p = c.policy;
  if (!p || typeof p !== 'object') return 'missing policy';
  if (!Number.isFinite(p.graceDays) || p.graceDays < 0) return 'bad policy.graceDays';
  if (typeof p.readOnlyOnExpiry !== 'boolean') return 'bad policy.readOnlyOnExpiry';
  return null;
}

/**
 * Verify a compact JWS entitlement. Pure — no I/O, no clock reads beyond `now`.
 *
 * @param {string} jws
 * @param {object} [opts]
 * @param {number} [opts.now]         ms epoch; defaults to Date.now()
 * @param {string} [opts.machineId]   if given, the entitlement must be bound to it
 * @param {object} [opts.keys]        kid → PEM, for tests
 * @returns {{valid:boolean, reason:string|null, claims:object|null, stale:boolean, kid:string|null}}
 */
function verifyEntitlement(jws, opts) {
  const o   = opts || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const out = (reason, extra) => Object.assign(
    { valid: false, reason, claims: null, stale: false, kid: null }, extra || {});

  if (typeof jws !== 'string' || !jws) return out(E.NONE);

  const parts = jws.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return out(E.MALFORMED);

  let header;
  try { header = JSON.parse(_b64uToBuf(parts[0]).toString('utf8')); }
  catch (_) { return out(E.MALFORMED); }
  if (!header || typeof header !== 'object') return out(E.MALFORMED);

  // Algorithm is pinned, not read as a suggestion. Accepting whatever `alg`
  // the token names is the classic JWT break — `none` walks straight in, and
  // an HMAC alg lets an attacker sign with the public key as the shared
  // secret. There is exactly one acceptable value here.
  if (header.alg !== 'EdDSA') return out(E.ALG);
  if (header.typ !== undefined && header.typ !== 'JWT') return out(E.MALFORMED);
  if (typeof header.kid !== 'string' || !header.kid) return out(E.MALFORMED);

  const key = _publicKey(header.kid, o.keys);
  if (!key) return out(E.UNKNOWN_KID, { kid: header.kid });

  const sig = _b64uToBuf(parts[2]);
  if (sig.length !== ED25519_SIG_BYTES) return out(E.BAD_SIGNATURE, { kid: header.kid });

  const signingInput = Buffer.from(parts[0] + '.' + parts[1], 'ascii');
  let signatureOk = false;
  try { signatureOk = crypto.verify(null, signingInput, key, sig); }
  catch (_) { signatureOk = false; }
  if (!signatureOk) return out(E.BAD_SIGNATURE, { kid: header.kid });

  let claims;
  try { claims = JSON.parse(_b64uToBuf(parts[1]).toString('utf8')); }
  catch (_) { return out(E.MALFORMED, { kid: header.kid }); }

  const claimError = _validateClaims(claims);
  if (claimError) return out(E.BAD_CLAIMS, { kid: header.kid });

  // Machine binding. The signature proves the SERVER issued this; it does not
  // prove it was issued to THIS computer. Without this check a valid
  // entitlement could be copied from one hostel's machine to another's, which
  // is precisely the sharing the licence exists to prevent.
  if (o.machineId && claims.machineId !== o.machineId) {
    return out(E.WRONG_MACHINE, { kid: header.kid, claims });
  }

  // Past notAfter the token is genuine but too old to act on. Still returned,
  // with `stale: true` — the caller needs the claims to explain itself, and
  // an expired cache is a different situation from a forged one.
  const stale = now > Date.parse(claims.notAfter);
  if (stale) {
    return { valid: false, reason: E.STALE, claims, stale: true, kid: header.kid };
  }

  return { valid: true, reason: null, claims, stale: false, kid: header.kid };
}

// ════════════════════════════════════════════════════════════════════════════
// The service
// ════════════════════════════════════════════════════════════════════════════

class EntitlementService {
  /**
   * @param {object} opts
   * @param {string}   opts.userDataDir
   * @param {object}   [opts.cfg]
   * @param {function} [opts.machineIdProvider] () => string — injected so this
   *        file never reaches into main.js. See §4(a) of the Phase 1 report:
   *        checkLicenseValidity() has a last_run.dat side effect and must not
   *        be called from a service.
   * @param {object}   [opts.keys]   kid → PEM, for tests
   * @param {function} [opts.now]    () => ms epoch, for tests
   */
  constructor(opts) {
    const o = opts || {};
    this.cfg = o.cfg || config.get();
    this.userDataDir = o.userDataDir || null;
    this._machineIdProvider = o.machineIdProvider || (() => null);
    this._keys = o.keys || null;
    this._now  = o.now  || (() => Date.now());

    this._jws = null;
    this._claims = null;
    this._state = LOCAL.NONE;
    this._reason = E.NONE;
    this._kid = null;
    this._storedAt = null;

    // Highest server-asserted time ever seen. Monotonic by construction: it
    // only ever moves forward, so a clock wound backwards cannot lower it.
    this._serverTimeSeen = null;
  }

  get cacheFile() {
    return this.userDataDir ? path.join(this.userDataDir, CACHE_FILE) : null;
  }

  /** Read and verify the cached entitlement. Safe to call when none exists. */
  load() {
    const file = this.cacheFile;
    if (!file) return this.getStatus();
    let raw;
    try {
      if (!fs.existsSync(file)) return this.getStatus();
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      // A corrupt cache is not a licence problem — it is a missing cache.
      // Never let it stop the app; the local licence is still the authority.
      log.warn('entitlement_cache_unreadable', { message: e.message });
      return this.getStatus();
    }
    if (raw && _isIso(raw.serverTimeSeen)) {
      this._serverTimeSeen = raw.serverTimeSeen;
    }
    this._storedAt = (raw && _isIso(raw.storedAt)) ? raw.storedAt : null;
    this._apply(raw && raw.jws, { persist: false });
    return this.getStatus();
  }

  /**
   * Verify a freshly fetched entitlement and, if it verifies, cache it.
   * An entitlement that does not verify is never written to disk — a cache is
   * a store of things already believed, not a parking space for suspect input.
   */
  store(jws) {
    const result = this._apply(jws, { persist: true });
    return result;
  }

  _apply(jws, opts) {
    const persist = !!(opts && opts.persist);
    const machineId = this._machineIdProvider() || null;
    const res = verifyEntitlement(jws, {
      now: this._now(),
      machineId: machineId || undefined,
      keys: this._keys || undefined
    });

    this._kid = res.kid;

    if (res.valid) {
      this._jws = jws;
      this._claims = res.claims;
      this._state = res.claims.status;
      this._reason = null;
      const moved = this._noteServerTime(res.claims.issuedAt);
      if (persist || moved) this._write(jws);
      log.info('entitlement_accepted', {
        status: res.claims.status, kid: res.kid,
        expiresAt: res.claims.expiresAt, notAfter: res.claims.notAfter
      });
      return this.getStatus();
    }

    if (res.stale && res.claims) {
      // Keep the claims: a stale entitlement still tells the UI which licence
      // this machine last held, which is what a support call needs to know.
      this._jws = jws;
      this._claims = res.claims;
      this._state = LOCAL.STALE;
      this._reason = E.STALE;
      if (this._noteServerTime(res.claims.issuedAt)) this._write(jws);
      log.info('entitlement_stale', { notAfter: res.claims.notAfter, kid: res.kid });
      return this.getStatus();
    }

    this._jws = null;
    this._claims = null;
    this._state = LOCAL.NONE;
    this._reason = res.reason || E.NONE;
    if (res.reason && res.reason !== E.NONE) {
      log.warn('entitlement_rejected', { reason: res.reason, kid: res.kid });
    }
    return this.getStatus();
  }

  /**
   * Move the watermark forward only. Never backwards — that is the whole point.
   * Returns whether it moved, so the caller can persist without this method
   * writing the cache file a second time behind its back.
   */
  _noteServerTime(issuedAt) {
    if (!_isIso(issuedAt)) return false;
    if (this._serverTimeSeen && Date.parse(issuedAt) <= Date.parse(this._serverTimeSeen)) {
      return false;
    }
    this._serverTimeSeen = issuedAt;
    return true;
  }

  _write(jws) {
    const file = this.cacheFile;
    if (!file) return;
    try {
      const body = {
        jws: jws || null,
        storedAt: new Date(this._now()).toISOString(),
        serverTimeSeen: this._serverTimeSeen || null
      };
      fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf8');
      this._storedAt = body.storedAt;
    } catch (e) {
      // Losing the cache costs a round trip on next launch. It must never cost
      // a boot.
      log.warn('entitlement_cache_unwritable', { message: e.message });
    }
  }

  /**
   * Is the local clock behind a time the server already asserted? That is not
   * a guess — the server said `issuedAt`, and time does not run backwards.
   * Reported, not enforced; see the header.
   */
  clockSuspect() {
    if (!this._serverTimeSeen) return false;
    return this._now() < Date.parse(this._serverTimeSeen);
  }

  /** A snapshot. No I/O, safe to call from an IPC handler on every keystroke. */
  getStatus() {
    const c = this._claims;
    return {
      state:        this._state,
      reason:       this._reason,
      enforced:     false,          // Phase 2 cutover flips this. See header.
      configured:   config.isConfigured(),
      kid:          this._kid,
      activeKid:    ACTIVE_KID,
      deviceId:     c ? c.deviceId  : null,
      licenseId:    c ? c.licenseId : null,
      expiresAt:    c ? c.expiresAt : null,
      issuedAt:     c ? c.issuedAt  : null,
      notAfter:     c ? c.notAfter  : null,
      policy:       c ? c.policy    : null,

      // What this hostel has bought. Carried all the way from the control
      // plane's catalogue, through the signed claims, to the screens that gate
      // on it — and omitted here at first, which meant the flags arrived and
      // stopped: the app received them in the entitlement and nothing could
      // read them, so every feature stayed on no matter what the portal said.
      //
      // `null` when there are no claims, and that is the honest answer: no
      // entitlement means no opinion, and the app treats no opinion as "yes"
      // rather than stripping features from the machines in the field.
      features:     c ? c.features  : null,

      storedAt:     this._storedAt,
      serverTimeSeen: this._serverTimeSeen,
      clockSuspect: this.clockSuspect()
    };
  }

  /**
   * Fetch a fresh entitlement from the control plane.
   *
   * With no `apiBase` configured — which is every machine today — this makes
   * ZERO network calls and returns `E_NOT_CONFIGURED`. That is the Phase 1
   * gate and it still holds: adding this file does not put a single install on
   * the wire.
   */
  async refresh(deviceToken) {
    if (!config.isConfigured()) {
      return { ok: false, errorCode: 'E_NOT_CONFIGURED', status: this.getStatus() };
    }
    const res = await api.request({
      method: 'GET',
      path: '/entitlement',
      headers: deviceToken ? { authorization: 'Bearer ' + deviceToken } : undefined
    });
    if (!res.ok) {
      return { ok: false, errorCode: res.errorCode, status: this.getStatus() };
    }
    const jws = res.data && (res.data.entitlement || (res.data.data && res.data.data.entitlement));
    if (typeof jws !== 'string' || !jws) {
      return { ok: false, errorCode: 'E_BAD_RESPONSE', status: this.getStatus() };
    }
    const status = this.store(jws);
    return { ok: status.state !== LOCAL.NONE, errorCode: null, status };
  }

  /** Drop the cached entitlement. Used by deactivation. */
  clear() {
    this._jws = null;
    this._claims = null;
    this._state = LOCAL.NONE;
    this._reason = E.NONE;
    this._kid = null;
    const file = this.cacheFile;
    try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
    // The watermark deliberately survives in memory for this session: a
    // deactivation must not be a way to launder a wound-back clock.
    return this.getStatus();
  }
}

module.exports = {
  EntitlementService, verifyEntitlement,
  STATUS, LOCAL, E, CACHE_FILE, ACTIVE_KID
};
