// ════════════════════════════════════════════════════════════════════════════
// Control-plane discovery  —  how a shipped build learns the server's address
//
// THE PROBLEM THIS SOLVES
//
// `DEFAULT_API_BASE` in config.js is baked at build time, and it is empty. Its
// own comment explains why filling it in is dangerous: the string ships inside
// 50+ installers and can only be changed by cutting a release and getting every
// hostel to run it. A platform hostname that moves — a re-provision, a new
// project, a move off Railway — strands every install, and the mechanism that
// could have told them otherwise is the one that broke.
//
// Waiting for a project-owned domain has left every shipped build resolving to
// `null`: no requests, and no way to be told anything. A licence could be
// revoked in the portal all day with nobody listening.
//
// So the address is FETCHED from a location this project already controls and
// every install already trusts for its updates: a small JSON document in the
// GitHub repository. Re-pointing 50 hostels becomes one commit, taking effect
// within a day, with no release and no support call.
//
// ── WHAT THIS DOCUMENT CAN AND CANNOT DO ───────────────────────────────────
//
// It supplies an ADDRESS. That is all it can ever supply.
//
// It cannot grant, extend or forge an entitlement. Entitlements are Ed25519
// signatures verified against a public key compiled into app.asar
// (services/entitlement-keys.js) and bound to this machine's fingerprint, so
// whoever answers at the address it names cannot mint one — they do not have
// the private key, and a token minted for another machine is rejected by
// `verifyEntitlement`. The worst a wrong address can do is deny service, which
// is indistinguishable from the server being down, and the app already treats
// that as normal: unconfigured and unreachable are first-class states, not
// errors.
//
// What it WOULD hand a wrong address is the registration request — a licence
// key and a machine id. That is the residual risk, and it is the reason the
// document is served from the repository rather than from the control plane
// itself: re-pointing is a commit that takes effect in minutes, so a platform
// hostname must be released only AFTER this file stops naming it. Recycling a
// `*.up.railway.app` subdomain out from under a baked constant is the failure
// this whole module exists to make survivable.
//
// ── FAILING SAFE ───────────────────────────────────────────────────────────
//
// Every failure here leaves the app exactly as it is today. No network, no
// document, malformed JSON, an http:// URL, a hostile payload — all of them
// return without writing, and `config.load()` falls through to `null`, which
// is offline-only operation. Nothing in this module is allowed to make the app
// REQUIRE the control plane; that is a breaking change (CLAUDE.md).
//
// `refresh()` is fire-and-forget with its own timeout and is never awaited on
// the boot path.
//
// ── THE KILL SWITCH ────────────────────────────────────────────────────────
//
// `{"apiBase": null}` in the published document CLEARS every install's cache
// and returns them to offline-only. It exists so that a control plane that has
// to be taken down, or a rollout that has to be stopped, does not need a
// release either. It is the one case where an empty value is an instruction
// rather than an absence, so it is spelled explicitly (`null`, not a missing
// key) and a document without the key at all is treated as malformed.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

const config = require('./config');
const logger = require('./logger');

/**
 * Where the address comes from.
 *
 * `raw.githubusercontent.com` rather than the GitHub API: no rate limit worth
 * worrying about for ~50 installs checking once a day, no token, and the same
 * host reputation the update channel already depends on.
 *
 * Pinned to a BRANCH, not a tag or a commit — the point is that editing one
 * file re-points the estate. `tests/discovery.test.js` asserts the owner and
 * repo still match `package.json`'s publish config, so a repository rename
 * cannot leave updates working and discovery pointing at a 404.
 */
const DISCOVERY_URL =
  'https://raw.githubusercontent.com/mushtaqahmaduop/HOSTIX-APP/master/control-plane.json';

/** The cache `config.load()` reads synchronously at every boot. */
const CACHE_FILE = config.DISCOVERY_CACHE_FILE;

/**
 * At most one check a day. The address changes approximately never; this is a
 * rollout lever, not a control channel, and a suspension travels by
 * entitlement sync (hourly) rather than by this.
 */
const MIN_REFRESH_MS = 24 * 60 * 60 * 1000;

/** A discovery fetch must never be the reason a boot feels slow. */
const FETCH_TIMEOUT_MS = 8000;

/** Nothing legitimate is anywhere near this large. */
const MAX_BYTES = 4096;

// ── The cache ───────────────────────────────────────────────────────────────

function _cachePath(userDataDir) {
  return userDataDir ? path.join(userDataDir, CACHE_FILE) : null;
}

/**
 * Read the cached document. The parse lives in config.js, which owns "where
 * does apiBase come from" — one implementation of the file format, and no
 * require cycle, since config.js does not import this module.
 *
 * @returns {{apiBase:string|null, fetchedAt:number}|null}
 */
function readCache(userDataDir) {
  return config.readDiscoveryCache(userDataDir);
}

/** The base URL the cache holds, or null. */
function cachedBase(userDataDir) {
  const c = readCache(userDataDir);
  return c ? c.apiBase : null;
}

function _writeCache(userDataDir, apiBase, now) {
  const file = _cachePath(userDataDir);
  if (!file) return false;
  const body = JSON.stringify({
    v: 1,
    apiBase: apiBase || null,
    fetchedAt: now,
    // A human opening this file in %APPDATA% should be able to tell what wrote
    // it and where to change it, without reading the source.
    source: DISCOVERY_URL
  }, null, 2);
  try {
    // Write-then-rename: a machine losing power mid-write must not leave a
    // truncated address that reads as "no cache" on every subsequent boot.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (_) {
    return false;
  }
}

// ── The fetch ───────────────────────────────────────────────────────────────

async function _get(url, fetchImpl) {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return { ok: false, reason: 'no_fetch' };

  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await f(url, {
      signal: ac ? ac.signal : undefined,
      redirect: 'follow',
      headers: { accept: 'application/json' }
    });
    if (!res || res.status !== 200) {
      return { ok: false, reason: 'http_' + ((res && res.status) || 'error') };
    }
    const text = await res.text();
    if (typeof text !== 'string' || text.length > MAX_BYTES) {
      return { ok: false, reason: 'too_large' };
    }
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch the discovery document and update the cache.
 *
 * Never throws and never rejects — the caller is a fire-and-forget call on the
 * boot path, and there is no failure here worth interrupting a hostel over.
 *
 * @param {object} opts
 * @param {string}   opts.userDataDir
 * @param {boolean}  [opts.force]      ignore MIN_REFRESH_MS
 * @param {function} [opts.fetchImpl]  test injection
 * @param {number}   [opts.now]
 * @param {string}   [opts.url]        test injection
 * @returns {Promise<{ok:boolean, reason:string, base:string|null, changed:boolean}>}
 */
async function refresh(opts) {
  const o    = opts || {};
  const now  = Number.isFinite(o.now) ? o.now : Date.now();
  const log  = logger.forService('discovery');
  const done = (ok, reason, base, changed) =>
    ({ ok, reason, base: base || null, changed: !!changed });

  const cache = readCache(o.userDataDir);

  if (!o.force && cache && (now - cache.fetchedAt) < MIN_REFRESH_MS) {
    return done(true, 'fresh', cache.apiBase, false);
  }

  const got = await _get(o.url || DISCOVERY_URL, o.fetchImpl);
  if (!got.ok) {
    // Deliberately not a warning. A hostel with no internet hits this on every
    // boot, and that is the normal case here, not a fault.
    log.info('discovery_unavailable', { reason: got.reason });
    return done(false, got.reason, cache ? cache.apiBase : null, false);
  }

  let doc;
  try { doc = JSON.parse(got.text); }
  catch (_) {
    log.warn('discovery_malformed', { reason: 'json' });
    return done(false, 'malformed', cache ? cache.apiBase : null, false);
  }

  if (!doc || typeof doc !== 'object' || doc.v !== 1 || !('apiBase' in doc)) {
    log.warn('discovery_malformed', { reason: 'shape' });
    return done(false, 'malformed', cache ? cache.apiBase : null, false);
  }

  // `null` is the kill switch — an instruction to go back to offline-only.
  // Anything else that fails to normalise is a mistake, and a mistake must not
  // silently switch off 50 hostels' control plane, so it is refused and the
  // existing cache is left alone.
  const isKill = doc.apiBase === null;
  const base   = isKill ? null : config._normaliseBase(doc.apiBase);
  if (!isKill && !base) {
    log.warn('discovery_rejected_base', { reason: 'not_https_or_unparseable' });
    return done(false, 'bad_base', cache ? cache.apiBase : null, false);
  }

  const changed = (cache ? cache.apiBase : null) !== base;
  _writeCache(o.userDataDir, base, now);

  if (changed) {
    log.info('discovery_changed', { from: cache ? cache.apiBase : null, to: base });
  }
  return done(true, isKill ? 'cleared' : 'ok', base, changed);
}

module.exports = {
  refresh, cachedBase, readCache,
  DISCOVERY_URL, CACHE_FILE, MIN_REFRESH_MS, FETCH_TIMEOUT_MS, MAX_BYTES
};
