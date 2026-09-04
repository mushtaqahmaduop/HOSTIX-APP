// ════════════════════════════════════════════════════════════════════════════
// Online services configuration  —  Phase 1 / Phase 2
//
// Resolution order (first hit wins):
//   1. HOSTYLLO_API_BASE                  environment variable (dev / tests)
//   2. <userData>/online-config.json      per-machine override, key "apiBase"
//   3. DEFAULT_API_BASE                   baked into the build — see below
//   4. <userData>/control-plane.json      DISCOVERED — see services/discovery.js
//   5. null                               → offline-only, ZERO network requests
//
// Steps 1 and 2 exist so a single machine can be pointed at a staging server
// without a release. Neither is a rollout mechanism: nothing on a customer's
// PC will ever create an online-config.json.
//
// Step 4 is how the ~50 machines in the field actually learn the address.
// Until it existed they resolved to `null`, made no requests, and could never
// be told anything — a licence could be revoked in the portal all day with no
// app listening. It is a cache written by services/discovery.js from a JSON
// document in the GitHub repository, so the estate can be re-pointed with one
// commit instead of a release. Read that file for what the document can and
// cannot do; the short version is that it supplies an ADDRESS and nothing
// else, because entitlements are signed by a key it does not have.
//
// Step 4 sits BELOW step 3 on purpose. A build that bakes in a project-owned
// domain should trust its own build; discovery is what carries builds that
// shipped before that domain existed, and it goes dormant the moment one is
// baked in.
//
// ── WHY THIS CONSTANT IS EMPTY, AND WHAT TO PUT IN IT ───────────────────────
//
// Empty means every install behaves byte-for-byte as it does today. That is a
// safe default, not an oversight, and it must stay safe: the app treats
// "unconfigured" as a first-class state, never an error.
//
// When it is filled in, it should be a hostname THIS PROJECT OWNS — e.g.
// `https://licence.hostyllo.com/v1` with a CNAME at the host — and NOT the
// platform's generated hostname (`*.up.railway.app`, `*.onrender.com`).
//
// That is not tidiness. Three reasons, in order of how much they hurt:
//
//   1. This string ships inside 50+ installers and can only be changed by
//      cutting a release and getting every hostel to run it. If the platform
//      hostname changes — a re-provision, a new project, a move off Railway —
//      every install is pointing at nothing and the one mechanism that could
//      have told them otherwise is the mechanism that broke.
//
//   2. A generated subdomain is RECYCLED when the service is deleted. If it is
//      released and someone else claims it, every install starts talking to a
//      stranger, sending its machine id and licence key. A signed entitlement
//      cannot be forged by whoever answers — the private key is not theirs —
//      so they could not grant anything; but they would receive.
//
//   3. A domain you own survives changing hosts, which this project has
//      already done once.
//
// `_normaliseBase` rejects plain http for anything but localhost, so a typo
// here fails closed to `null` — offline — rather than shipping 50 machines
// talking cleartext.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * The control plane's public base URL, baked into the build.
 *
 * '' → unconfigured → the app makes no network requests at all.
 * Set it to the deployed origin plus its API prefix, e.g.
 *   'https://licence.hostyllo.com/v1'
 */
const DEFAULT_API_BASE = '';

/** Written by services/discovery.js, read by load(). See that file. */
const DISCOVERY_CACHE_FILE = 'control-plane.json';

const DEFAULTS = {
  // ── ApiClient (§36) ───────────────────────────────────────────────────────
  requestTimeoutMs: 15000,   // per attempt, not per request
  probeTimeoutMs:   5000,    // health probe — must not stall a UI check
  maxAttempts:      3,       // total attempts, NOT retries. Never unbounded.
  backoffBaseMs:    1000,
  backoffMaxMs:     30000,

  // ── ConnectivityService (§7) ──────────────────────────────────────────────
  pollIntervalMs:     60000,   // when the last probe succeeded
  pollIntervalMaxMs:  600000,  // backs off to 10 min while it keeps failing
  checkNowMinGapMs:   3000,    // rate-limit for renderer-triggered checks

  // ── OnlineQueue (§37) ─────────────────────────────────────────────────────
  queueDrainIntervalMs: 30000,
  queueMaxAttempts:     8,     // then dead-lettered, never retried forever
  queueBatchSize:       5,

  // ── DeviceService (Phase 2) ───────────────────────────────────────────────
  // How often the app re-reads its entitlement. This is the latency on a
  // suspension, a revocation or a renewal reaching a hostel with a stable
  // connection, so it is a support-call length rather than a tuning knob: an
  // hour is a customer noticing after lunch, six hours is a customer noticing
  // tomorrow. The request is tiny and there are ~50 of them.
  entitlementSyncIntervalMs: 3600000,

  // ── Telemetry (§38) ───────────────────────────────────────────────────────
  // Off by default and stays off until there is something to send it to and a
  // documented list of what it contains. §38: no invasive analytics by default.
  telemetryEnabled: false,

  logLevel: 'INFO'
};

let _resolved = null;

function _readFileConfig(userDataDir) {
  if (!userDataDir) return {};
  const file = path.join(userDataDir, 'online-config.json');
  try {
    if (!fs.existsSync(file)) return {};
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (raw && typeof raw === 'object') ? raw : {};
  } catch (_) {
    // A malformed override must not stop the app booting. Unconfigured is a
    // safe state; a half-parsed URL is not.
    return {};
  }
}

function _normaliseBase(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  let u;
  try { u = new URL(v); } catch (_) { return null; }
  // Plain http is allowed only for localhost, so a typo in a deployed config
  // cannot silently downgrade 50+ machines to cleartext.
  const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal)) return null;
  return u.origin + u.pathname.replace(/\/+$/, '');
}

/**
 * The cache services/discovery.js writes. Read here rather than there so that
 * "where does apiBase come from" has exactly one owner and there is no require
 * cycle between the two files — discovery.js imports this, not the reverse.
 *
 * Total, like _readFileConfig: any problem reads as "no cache". The file sits
 * in a directory the customer can edit, so what comes off disk is re-checked
 * by _normaliseBase rather than trusted.
 *
 * @returns {{apiBase:string|null, fetchedAt:number}|null}
 */
function readDiscoveryCache(userDataDir) {
  if (!userDataDir) return null;
  try {
    const file = path.join(userDataDir, DISCOVERY_CACHE_FILE);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    return {
      apiBase: _normaliseBase(raw.apiBase),
      fetchedAt: Number.isFinite(raw.fetchedAt) ? raw.fetchedAt : 0
    };
  } catch (_) {
    return null;
  }
}

/**
 * Adopt an address discovered AFTER load() ran, without re-running it.
 *
 * A fresh install has no cache, so its first boot resolves to `null` and the
 * discovery fetch lands a second or two later. Without this the machine would
 * sit offline until the next launch — which for a customer activating their
 * licence is the whole of the first session.
 *
 * It mutates the resolved object IN PLACE rather than replacing it, because
 * the services captured `cfg` by reference at construction. That is safe only
 * because every URL-critical path re-reads through `isConfigured()` and
 * `url()` at call time (api-client.js, device.js, connectivity.js) — the
 * captured copy is used for numeric tunables. Do not start caching apiBase in
 * a service without revisiting this.
 *
 * @returns {boolean} whether anything changed
 */
function adoptDiscoveredBase(value) {
  const cfg = get();
  // Never override a more specific source. env, the per-machine file and a
  // baked default all outrank discovery, and a machine deliberately pointed at
  // staging must not be dragged back to production by a background fetch.
  if (cfg.apiBaseSource === 'env' || cfg.apiBaseSource === 'file' || cfg.apiBaseSource === 'default') {
    return false;
  }
  const base = _normaliseBase(value);
  if (cfg.apiBase === base) return false;
  cfg.apiBase = base;
  cfg.apiBaseSource = base ? 'discovered' : 'none';
  return true;
}

/**
 * @param {object} opts
 * @param {string} [opts.userDataDir] app.getPath('userData')
 * @param {object} [opts.overrides]   test injection
 */
function load(opts) {
  const o = opts || {};
  const fileCfg = _readFileConfig(o.userDataDir);

  const discovered = readDiscoveryCache(o.userDataDir);

  const base =
    _normaliseBase(process.env.HOSTYLLO_API_BASE) ||
    _normaliseBase(fileCfg.apiBase) ||
    _normaliseBase(DEFAULT_API_BASE) ||
    (discovered && discovered.apiBase) ||
    null;

  const numeric = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof DEFAULTS[k] === 'number' && Number.isFinite(fileCfg[k])) {
      numeric[k] = fileCfg[k];
    }
  }

  _resolved = Object.assign({}, DEFAULTS, numeric, o.overrides || {}, {
    apiBase: (o.overrides && 'apiBase' in o.overrides)
      ? _normaliseBase(o.overrides.apiBase)
      : base,
    // Where the base URL came from — logged once at boot so a support ticket
    // can answer "which endpoint was this machine talking to".
    apiBaseSource: process.env.HOSTYLLO_API_BASE ? 'env'
                 : fileCfg.apiBase ? 'file'
                 : _normaliseBase(DEFAULT_API_BASE) ? 'default'
                 : (discovered && discovered.apiBase) ? 'discovered'
                 : 'none'
  });

  if (typeof fileCfg.telemetryEnabled === 'boolean') {
    _resolved.telemetryEnabled = fileCfg.telemetryEnabled;
  }
  return _resolved;
}

function get() {
  if (!_resolved) load({});
  return _resolved;
}

/** True only when a usable base URL exists. Guards every outbound call. */
function isConfigured() {
  return !!get().apiBase;
}

/** Build an absolute URL for a /desktop/v1 path. Returns null when unconfigured. */
function url(pathname) {
  const base = get().apiBase;
  if (!base) return null;
  const p = String(pathname || '');
  return base + (p.startsWith('/') ? p : '/' + p);
}

module.exports = {
  load, get, isConfigured, url,
  readDiscoveryCache, adoptDiscoveredBase,
  DEFAULTS, DEFAULT_API_BASE, DISCOVERY_CACHE_FILE, _normaliseBase
};
