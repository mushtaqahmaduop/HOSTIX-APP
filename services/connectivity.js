// ════════════════════════════════════════════════════════════════════════════
// ConnectivityService  —  Phase 1  (spec §7, §29)
//
// §7 is explicit that these are FOUR DIFFERENT STATES and must not be collapsed
// into one boolean:
//
//     NETWORK_AVAILABLE   the machine has a network
//     API_REACHABLE       the Hostyllo control plane answered
//     AUTHENTICATED       this device holds a valid device token
//     LICENSE_VALID       the cached entitlement is good
//
// A hostel on a working WiFi with a dead control plane and a valid cached
// licence is a completely different situation from a hostel with no internet,
// and §29 requires the UI to be able to say which one it is:
//
//     Internet:      Connected
//     Hostyllo API:  Unreachable
//     License:       Last known valid
//     Application:   Offline mode
//
// `navigator.onLine` is not used — §7 forbids it as the sole source, and it is
// unavailable to us anyway: the renderer has no network (CSP connect-src
// 'self') and this service runs in the main process. Chromium's own
// `net.isOnline()` is used as a cheap hint, but only a real probe is allowed to
// set API_REACHABLE.
//
// UNCONFIGURED IS NOT A FAILURE. Until Phase 2 supplies a control-plane URL,
// this service performs no requests at all and reports `apiReachable: false,
// reason: 'not_configured'`. It never invents a reachable state and never
// polls a URL that does not exist.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const { EventEmitter } = require('events');
const config = require('./config');
const logger = require('./logger');
const api    = require('./api-client');

const log = logger.forService('connectivity');

/** Application-level summary, for §29's fourth line. */
const MODE = {
  UNCONFIGURED: 'unconfigured', // no control plane exists yet (Phase 1 default)
  OFFLINE:      'offline',      // no network
  DEGRADED:     'degraded',     // network up, control plane unreachable
  ONLINE:       'online'        // control plane answering
};

class ConnectivityService extends EventEmitter {
  constructor(opts) {
    super();
    const o = opts || {};
    this.cfg = o.cfg || config.get();

    // Phase 2 replaces these two. Until then they answer honestly rather than
    // optimistically — an unimplemented check is not a passing check.
    this._authProvider    = o.authProvider    || (() => ({ ok: false, reason: 'no_device_token' }));
    this._licenseProvider = o.licenseProvider || (() => ({ ok: false, reason: 'not_wired' }));

    this._state = {
      networkAvailable: false,
      apiReachable:     false,
      authenticated:    false,
      licenseValid:     false,
      mode:             MODE.UNCONFIGURED,
      reason:           'not_configured',
      lastCheckedAt:    null,
      lastSuccessAt:    null,   // last time the control plane actually answered
      consecutiveFailures: 0,
      configured:       config.isConfigured()
    };

    this._timer = null;
    this._inFlight = null;
    this._lastCheckNowAt = 0;
    this._currentIntervalMs = this.cfg.pollIntervalMs;
  }

  // ── §7 public surface ─────────────────────────────────────────────────────

  /** Current snapshot. Cheap, never performs I/O. */
  getStatus() {
    return Object.assign({}, this._state);
  }

  /** True only when the control plane is actually reachable right now. */
  isOnline() {
    return this._state.apiReachable === true;
  }

  /** Epoch ms of the last successful control-plane contact, or null. */
  getLastSuccessfulConnection() {
    return this._state.lastSuccessAt;
  }

  /** @param {(status:object) => void} cb  @returns {() => void} unsubscribe */
  onStatusChanged(cb) {
    if (typeof cb !== 'function') return () => {};
    this.on('status', cb);
    return () => this.off('status', cb);
  }

  /**
   * Force a check now. Rate-limited, and concurrent callers share one probe —
   * a UI that fires this on every click must not become a request amplifier.
   */
  async checkNow(opts) {
    const o = opts || {};
    const now = Date.now();
    if (this._inFlight) return this._inFlight;
    if (!o.force && now - this._lastCheckNowAt < this.cfg.checkNowMinGapMs) {
      return this.getStatus();
    }
    this._lastCheckNowAt = now;
    this._inFlight = this._check().finally(() => { this._inFlight = null; });
    return this._inFlight;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    if (this._timer) return;
    if (!config.isConfigured()) {
      // Nothing to poll. Say so once, loudly enough to find in a log, and do
      // not schedule a timer that would wake the machine to do nothing.
      this._apply({
        configured: false, mode: MODE.UNCONFIGURED, reason: 'not_configured',
        networkAvailable: this._readNetworkHint()
      });
      log.info('not_configured', { apiBaseSource: this.cfg.apiBaseSource });
      return;
    }
    this._schedule(0);
    log.info('started', { intervalMs: this.cfg.pollIntervalMs });
  }

  stop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  _schedule(delayMs) {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      this._check().finally(() => this._schedule(this._currentIntervalMs));
    }, delayMs);
    // Never hold the process open just to poll.
    if (this._timer.unref) this._timer.unref();
  }

  // ── Probing ───────────────────────────────────────────────────────────────

  /**
   * Chromium's network-state guess. A hint only: it reports "online" for a
   * captive-portal WiFi that resolves nothing, which is exactly the case §7
   * warns about.
   */
  _readNetworkHint() {
    try {
      const { net } = require('electron');
      if (net && typeof net.isOnline === 'function') return !!net.isOnline();
    } catch (_) { /* outside Electron */ }
    return true; // unknown — let the probe decide
  }

  async _check() {
    const correlationId = logger.newCorrelationId();
    const networkAvailable = this._readNetworkHint();

    if (!config.isConfigured()) {
      this._apply({
        configured: false, networkAvailable,
        apiReachable: false, authenticated: false,
        mode: MODE.UNCONFIGURED, reason: 'not_configured',
        lastCheckedAt: Date.now()
      });
      return this.getStatus();
    }

    const started = Date.now();
    const res = await api.probe(correlationId);
    const apiReachable = res.ok;

    // Only ask the licence and auth providers when they can answer cheaply —
    // both are local reads, so this is fine on every tick.
    const auth = this._safeProvider(this._authProvider);
    const lic  = this._safeProvider(this._licenseProvider);

    let mode, reason;
    if (apiReachable) {
      mode = MODE.ONLINE; reason = 'ok';
    } else if (!networkAvailable) {
      mode = MODE.OFFLINE; reason = 'no_network';
    } else {
      mode = MODE.DEGRADED;
      reason = res.errorCode === api.ERRORS.OFFLINE ? 'no_network' : (res.errorCode || 'api_unreachable');
      // Chromium said we have a network but DNS/connect failed: trust the
      // probe over the hint.
      if (res.errorCode === api.ERRORS.OFFLINE) mode = MODE.OFFLINE;
    }

    const failures = apiReachable ? 0 : this._state.consecutiveFailures + 1;

    // Back off while it keeps failing, so a control plane that is down for a
    // day is not probed 1,440 times by every one of 50 machines.
    this._currentIntervalMs = apiReachable
      ? this.cfg.pollIntervalMs
      : Math.min(this.cfg.pollIntervalMaxMs,
                 this.cfg.pollIntervalMs * Math.pow(2, Math.min(6, failures)));

    this._apply({
      configured: true,
      networkAvailable,
      apiReachable,
      authenticated: auth.ok,
      licenseValid:  lic.ok,
      mode, reason,
      lastCheckedAt: Date.now(),
      lastSuccessAt: apiReachable ? Date.now() : this._state.lastSuccessAt,
      consecutiveFailures: failures
    }, { correlationId, durationMs: Date.now() - started, errorCode: res.errorCode });

    return this.getStatus();
  }

  _safeProvider(fn) {
    try {
      const r = fn();
      if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason };
      return { ok: !!r };
    } catch (e) {
      log.warn('provider_failed', { err: e });
      return { ok: false, reason: 'provider_error' };
    }
  }

  /**
   * Merge and emit only on a real change. A status event on every tick would
   * make any subscriber re-render once a minute forever.
   */
  _apply(patch, logFields) {
    const prev = this._state;
    const next = Object.assign({}, prev, patch);

    const changed =
      prev.networkAvailable !== next.networkAvailable ||
      prev.apiReachable     !== next.apiReachable ||
      prev.authenticated    !== next.authenticated ||
      prev.licenseValid     !== next.licenseValid ||
      prev.mode             !== next.mode ||
      prev.reason           !== next.reason ||
      prev.configured       !== next.configured;

    this._state = next;

    if (changed) {
      log.info('status_changed', Object.assign({
        from: prev.mode, to: next.mode, reason: next.reason,
        networkAvailable: next.networkAvailable,
        apiReachable: next.apiReachable,
        consecutiveFailures: next.consecutiveFailures
      }, logFields || {}));
      // A throwing subscriber must not break the poll loop.
      try { this.emit('status', this.getStatus()); }
      catch (e) { log.warn('subscriber_failed', { err: e }); }
    }
  }

  // ── Phase 2 wiring points ─────────────────────────────────────────────────
  setAuthProvider(fn)    { if (typeof fn === 'function') this._authProvider = fn; }
  setLicenseProvider(fn) { if (typeof fn === 'function') this._licenseProvider = fn; }
}

module.exports = { ConnectivityService, MODE };
