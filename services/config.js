// ════════════════════════════════════════════════════════════════════════════
// Online services configuration  —  Phase 1 / Phase 2
//
// Resolution order (first hit wins):
//   1. HOSTYLLO_API_BASE                  environment variable (dev / tests)
//   2. <userData>/online-config.json      per-machine override, key "apiBase"
//   3. DEFAULT_API_BASE                   baked into the build — see below
//   4. null                               → offline-only, ZERO network requests
//
// Steps 1 and 2 exist so a single machine can be pointed at a staging server
// without a release. Step 3 is how the ~50 machines in the field learn the
// address at all: nothing on a customer's PC will ever create an
// online-config.json, so without a baked default they resolve to `null`, make
// no requests, and can never be told anything — which is exactly the state
// every shipped build has been in until now. A licence could be revoked in the
// portal all day and no app was listening.
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
 * @param {object} opts
 * @param {string} [opts.userDataDir] app.getPath('userData')
 * @param {object} [opts.overrides]   test injection
 */
function load(opts) {
  const o = opts || {};
  const fileCfg = _readFileConfig(o.userDataDir);

  const base =
    _normaliseBase(process.env.HOSTYLLO_API_BASE) ||
    _normaliseBase(fileCfg.apiBase) ||
    _normaliseBase(DEFAULT_API_BASE) ||
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

module.exports = { load, get, isConfigured, url, DEFAULTS, DEFAULT_API_BASE, _normaliseBase };
