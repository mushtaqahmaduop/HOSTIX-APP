// ════════════════════════════════════════════════════════════════════════════
// DeviceService — the client that actually talks to the control plane
//
// Everything else was in place and nothing joined it up: EntitlementService
// could verify and cache a signed entitlement, but nothing ever fetched one,
// because fetching needs a device token, and getting a token needs a device
// secret, and getting a secret needs registration. This is that chain.
//
//   register  →  device secret   (once, kept)
//   token     →  short-lived     (renewed as needed)
//   sync      →  entitlement     (verified, cached, enforced)
//
// ── Offline is the normal case, not the error case ──────────────────────────
//
// Every step here is allowed to fail, quietly, forever. These are Pakistani
// hostels; the internet is frequently absent, and the control plane being
// unreachable must never stop hostel operations. A failure logs at DEBUG and
// the app carries on from the local licence exactly as it did before any of
// this existed.
//
// ── It does nothing at all until configured ─────────────────────────────────
//
// With no `apiBase` this service performs ZERO network requests. That is the
// Phase 1 gate and it still holds: installing this build changes nothing for
// the machines in the field until someone sets the URL.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const logger = require('./logger');
const api = require('./api-client');

const log = logger.forService('device');

const CREDENTIALS_FILE = 'device.enc';

// Renew the token a minute before it lapses, rather than discovering it has
// lapsed mid-request and paying for a second round trip.
const TOKEN_SKEW_MS = 60000;

class DeviceService {
  /**
   * @param {object} opts
   * @param {string}   opts.userDataDir
   * @param {function} opts.machineIdProvider  () => string
   * @param {function} opts.licenceProvider    () => ({ key, valid }) — the licence file
   * @param {object}   opts.entitlement        EntitlementService
   * @param {object}   [opts.cfg]
   * @param {function} [opts.onChanged]        called after the entitlement changes
   */
  constructor(opts) {
    const o = opts || {};
    this.cfg = o.cfg || config.get();
    this.userDataDir = o.userDataDir || null;
    this._machineId = o.machineIdProvider || (() => null);
    this._licence = o.licenceProvider || (() => null);
    this.entitlement = o.entitlement || null;
    this._onChanged = o.onChanged || (() => {});

    this._creds = null;          // { deviceId, deviceSecret }
    this._token = null;          // { value, expiresAt }
    this._timer = null;
    this._syncing = false;
    this._lastSyncAt = null;     // last SUCCESSFUL read — printed by getStatus()
    this._lastAttemptAt = null;  // last attempt — what the minimum gap measures
    this._lastError = null;
  }

  get credentialsFile() {
    return this.userDataDir ? path.join(this.userDataDir, CREDENTIALS_FILE) : null;
  }

  // ── Credential storage ────────────────────────────────────────────────────
  //
  // Encrypted with a key derived from the machine fingerprint, so the file is
  // not a plaintext credential sitting in a folder the customer browses.
  //
  // This is defence in depth rather than the load-bearing control: an
  // entitlement is bound to a machineId, so a secret copied to another computer
  // buys an entitlement that computer will refuse. The encryption stops casual
  // copying; the binding is what actually enforces it.

  _key() {
    const machineId = this._machineId();
    if (!machineId) return null;
    return crypto.scryptSync(machineId, 'hostyllo_device_v1', 32);
  }

  _loadCredentials() {
    if (this._creds) return this._creds;
    const file = this.credentialsFile;
    const key = this._key();
    if (!file || !key || !fs.existsSync(file)) return null;
    try {
      const buf = Buffer.from(fs.readFileSync(file, 'utf8'), 'base64');
      const iv = buf.slice(0, 16);
      const tag = buf.slice(16, 32);
      const enc = buf.slice(32);
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      this._creds = JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString());
      return this._creds;
    } catch (e) {
      // A credentials file this machine cannot read is a credentials file it
      // does not have. Registering again is cheap and always correct.
      log.warn('device_credentials_unreadable', { message: e.message });
      return null;
    }
  }

  _saveCredentials(creds) {
    const file = this.credentialsFile;
    const key = this._key();
    if (!file || !key) return;
    try {
      const iv = crypto.randomBytes(16);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(JSON.stringify(creds), 'utf8'), c.final()]);
      fs.writeFileSync(file,
        Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64'), 'utf8');
      this._creds = creds;
    } catch (e) {
      // Losing the file costs one re-registration on next launch, never a boot.
      log.warn('device_credentials_unwritable', { message: e.message });
    }
  }

  clearCredentials() {
    this._creds = null;
    this._token = null;
    try {
      const file = this.credentialsFile;
      if (file && fs.existsSync(file)) fs.unlinkSync(file);
    } catch (_) {}
  }

  // ── The chain ─────────────────────────────────────────────────────────────

  /**
   * Bind this machine to its licence. Idempotent on the server: re-registering
   * the same machine rotates the secret rather than creating a second device,
   * which is exactly what a reinstall needs.
   */
  async register() {
    if (!config.isConfigured()) return { ok: false, errorCode: 'E_NOT_CONFIGURED' };

    const licence = this._licence();
    const machineId = this._machineId();
    if (!licence || !licence.key || !machineId) {
      return { ok: false, errorCode: 'E_NO_LICENCE' };
    }

    const res = await api.request({
      method: 'POST',
      path: '/devices/register',
      body: {
        licenseKey: licence.key,
        machineId,
        appVersion: this.cfg.appVersion || undefined,
        os: process.platform
      }
    });

    if (!res.ok) {
      this._lastError = res.errorCode;
      log.info('device_register_failed', { errorCode: res.errorCode, status: res.status });
      return { ok: false, errorCode: res.errorCode, status: res.status };
    }

    const data = (res.data && res.data.data) || res.data || {};
    if (!data.deviceId || !data.deviceSecret) {
      return { ok: false, errorCode: 'E_BAD_RESPONSE' };
    }

    this._saveCredentials({ deviceId: data.deviceId, deviceSecret: data.deviceSecret });
    this._token = null;
    log.info('device_registered', { deviceId: data.deviceId, verification: data.verification });
    return { ok: true, deviceId: data.deviceId };
  }

  /** A live token, registering and exchanging as needed. */
  async _ensureToken() {
    if (this._token && this._token.expiresAt - TOKEN_SKEW_MS > Date.now()) {
      return this._token.value;
    }

    let creds = this._loadCredentials();
    if (!creds) {
      const reg = await this.register();
      if (!reg.ok) return null;
      creds = this._creds;
    }

    const res = await api.request({
      method: 'POST',
      path: '/devices/token',
      body: { deviceId: creds.deviceId, deviceSecret: creds.deviceSecret }
    });

    if (!res.ok) {
      // 401 means the server no longer accepts this secret — the device was
      // deactivated, or an admin rotated it. Registering again is the
      // documented way back, and it is what the customer would otherwise have
      // to call support for.
      if (res.errorCode === 'E_UNAUTHORIZED') {
        log.info('device_secret_rejected_reregistering');
        this.clearCredentials();
        const reg = await this.register();
        if (!reg.ok) return null;
        return this._ensureToken();
      }
      this._lastError = res.errorCode;
      return null;
    }

    const data = (res.data && res.data.data) || res.data || {};
    if (!data.token) return null;

    this._token = {
      value: data.token,
      expiresAt: Date.now() + (data.expiresIn || 900) * 1000
    };
    return this._token.value;
  }

  /**
   * Fetch and cache a fresh entitlement. This is the call that carries a
   * suspension, a revocation, a renewal or a feature-flag change from the
   * control plane to the app.
   */
  async sync(opts) {
    const o = opts || {};
    if (!config.isConfigured()) return { ok: false, errorCode: 'E_NOT_CONFIGURED' };
    if (this._syncing) return { ok: false, errorCode: 'E_BUSY' };

    /* THE MINIMUM GAP, AND WHY `_syncing` WAS NOT ENOUGH.

       `_syncing` blocks CONCURRENT syncs. The calls that actually pile up are
       SEQUENTIAL: index.js syncs on every connectivity transition into
       reachable, and ConnectivityService emits on a changed `reason` as well as
       on changed reachability — so a connection settling through two or three
       error codes asked for a full sync each time, each one a device-token
       round trip, an entitlement round trip and a disk write. Every one of them
       fetched the same answer.

       Refused rather than queued: the point of a sync is to hold the freshest
       entitlement, and a sync refused ten seconds ago has already delivered
       that. Queuing it would only spend the round trip later.

       `force` is for someone who has ASKED — the connection panel's "Check
       again". A person pressing a button is entitled to an answer even if the
       app fetched one moments ago. */
    /* Gated on the last ATTEMPT, not the last success. `_lastSyncAt` means
       "when this machine last actually read its entitlement" and is what the
       connection panel prints, so it must keep success semantics. A sync that
       fails at the token step has still spent the round trips, and a flapping
       connection is exactly the case where it fails — gating on success would
       leave the hammering in place for the one connection that causes it. */
    if (!o.force && this._lastAttemptAt != null) {
      const gap = this.cfg.minSyncGapMs != null ? this.cfg.minSyncGapMs : 60000;
      const since = Date.now() - this._lastAttemptAt;
      if (since < gap) {
        log.debug('entitlement_sync_skipped', { reason: 'too_soon', sinceMs: since, gapMs: gap });
        return { ok: false, errorCode: 'E_TOO_SOON', sinceMs: since };
      }
    }

    this._syncing = true;
    this._lastAttemptAt = Date.now();
    try {
      const token = await this._ensureToken();
      if (!token) {
        // Record it: without this the status showed lastError null after a
        // failed sync, which reads as "nothing went wrong" on the connection
        // panel a support call is being read from.
        this._lastError = this._lastError || 'E_NO_TOKEN';
        return { ok: false, errorCode: this._lastError };
      }

      // Compare everything that changes what the app DOES, not just the state.
      // Comparing state alone missed a feature flag being switched off and a
      // renewal date moving — both leave the state ACTIVE, so nothing was
      // pushed to the windows and the change sat invisible until the hourly
      // poll. A licence change the customer cannot see is a support call.
      const signature = (st) => st && JSON.stringify({
        state: st.state, features: st.features, expiresAt: st.expiresAt, policy: st.policy
      });
      const before = this.entitlement ? signature(this.entitlement.getStatus()) : null;
      const result = await this.entitlement.refresh(token);
      this._lastSyncAt = Date.now();

      if (result.ok) {
        this._lastError = null;
        const after = signature(result.status);
        log.info('entitlement_synced', { state: result.status.state, changed: before !== after });
        // Tell the app immediately rather than at the next poll. A suspension
        // that takes an hour to bite is a suspension the customer notices at a
        // random moment with no explanation on screen.
        if (before !== after) { try { this._onChanged(result.status); } catch (_) {} }
      } else {
        this._lastError = result.errorCode;
        log.debug('entitlement_sync_failed', { errorCode: result.errorCode });
      }
      return result;
    } catch (e) {
      // Never let a sync take the app down. This runs on a timer, unattended,
      // on machines nobody is watching.
      log.warn('entitlement_sync_threw', { message: e.message });
      return { ok: false, errorCode: 'E_UNKNOWN' };
    } finally {
      this._syncing = false;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    // Idempotent because it is now called twice on a machine that learns its
    // address after boot: once here with no configuration (returns below), and
    // again from index.js when discovery lands one. Without this guard that
    // second call would leave two sync intervals running forever.
    if (this._timer) return;
    if (!config.isConfigured()) {
      log.info('device_service_idle', { reason: 'not_configured' });
      return;
    }
    /* A short delay so a cold boot renders the app before it reaches for the
       network. The licence already works offline; nothing here is urgent.

       FORCED, and that is the owner's ruling rather than a convenience. This is
       the one guaranteed sync per launch: it is what gets a suspension applied
       overnight in front of the warden the next morning, and it fires exactly
       once, so it is never the thing that hammers. The minimum gap exists for
       the OTHER trigger — the connectivity subscriber, which fires once per
       flap and is unbounded.

       Without the force the two collide on any machine that boots online: the
       first probe lands within a second, its transition sync sets the floor,
       and this one is refused four seconds later. Observed exactly that on
       2026-09-06 — `entitlement_sync_skipped sinceMs: 4204` — which is one of
       the two boot syncs going missing, not a duplicate being suppressed. */
    setTimeout(() => { this.sync({ force: true }).catch(() => {}); }, 5000);

    const every = this.cfg.entitlementSyncIntervalMs || 6 * 3600 * 1000;
    this._timer = setInterval(() => { this.sync().catch(() => {}); }, every);
    if (this._timer.unref) this._timer.unref();
    log.info('device_service_started', { syncIntervalMs: every });
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  /** Diagnostics for the connection panel and support calls. */
  getStatus() {
    const creds = this._loadCredentials();
    return {
      configured: config.isConfigured(),
      registered: !!creds,
      deviceId: creds ? creds.deviceId : null,
      hasToken: !!(this._token && this._token.expiresAt > Date.now()),
      lastSyncAt: this._lastSyncAt ? new Date(this._lastSyncAt).toISOString() : null,
      lastError: this._lastError
    };
  }
}

module.exports = { DeviceService, CREDENTIALS_FILE };
