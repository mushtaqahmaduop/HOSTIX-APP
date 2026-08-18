// ════════════════════════════════════════════════════════════════════════════
// Online services configuration  —  Phase 1
//
// THE CONTROL PLANE DOES NOT EXIST YET.
//
// Decision D-1 chose "extend the Hostyllo SaaS with a versioned /desktop/v1/*
// surface", but `C:\hostyllo` has still not been inspected and no endpoint has
// been designed, deployed or agreed. So this module ships with NO default base
// URL, and every online service treats "unconfigured" as a first-class state
// rather than an error.
//
// Consequence, and the Phase 1 gate: with no base URL set, the app performs
// ZERO network requests. Behaviour on the 50+ production machines is byte-for-
// byte what it is today. Phase 2 sets the URL; nothing before then does.
//
// Resolution order (first hit wins):
//   1. HOSTYLLO_API_BASE                  environment variable (dev / tests)
//   2. <userData>/online-config.json      per-machine override, key "apiBase"
//   3. null                               → offline-only, no requests
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

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
                 : (fileCfg.apiBase ? 'file' : 'none')
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

module.exports = { load, get, isConfigured, url, DEFAULTS, _normaliseBase };
