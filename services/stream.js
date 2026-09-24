// ════════════════════════════════════════════════════════════════════════════
// LicenceStream — the live channel from the control plane (owner, 2026-09-24)
//
// "If the admin locks a feature it should lock instantly, and unlock again."
// The hourly poll could not do that. This holds ONE request open to
// GET /v1/devices/stream; the server writes `changed` the moment an admin
// saves, and the app fetches its signed entitlement and applies it — the lock
// screen, a banner, a greyed-out Print button — without a restart.
//
// ── It carries no policy ────────────────────────────────────────────────────
// A stream message means only "ask again". Everything the app acts on still
// comes from the signed entitlement, verified against the public key. So the
// stream is safe to trust exactly as far as it goes: the worst a forged
// message can do is make the app fetch one more entitlement.
//
// ── Offline is still the normal case ────────────────────────────────────────
// No internet, a dead control plane, a router that drops idle connections —
// all end in a quiet reconnect with back-off, never an error on screen. The
// 10-minute poll in DeviceService keeps working underneath regardless.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const config = require('./config');
const api = require('./api-client');
const logger = require('./logger');

const log = logger.forService('stream');

class LicenceStream {
  /**
   * @param {object} opts
   * @param {object}   opts.device        DeviceService (token + sync)
   * @param {object}   [opts.entitlement] EntitlementService, for the revision
   * @param {object}   [opts.cfg]
   * @param {function} [opts.transport]   fetch-compatible, for tests
   */
  constructor(opts) {
    const o = opts || {};
    this.device = o.device;
    this.entitlement = o.entitlement || null;
    this.cfg = o.cfg || config.get();
    this._transport = o.transport || null;
    this._running = false;
    this._abort = null;
    this._retryMs = this.cfg.streamRetryMinMs || 2000;
    this._timer = null;
    this._debounce = null;
    this.connected = false;
    this.connectedAt = null;
    this.lastEventAt = null;
    this.lastError = null;
  }

  start() {
    if (this._running) return;
    if (this.cfg.streamEnabled === false || !config.isConfigured()) return;
    this._running = true;
    this._loop();
  }

  stop() {
    this._running = false;
    if (this._timer) clearTimeout(this._timer);
    if (this._debounce) clearTimeout(this._debounce);
    this._timer = null;
    if (this._abort) { try { this._abort.abort(); } catch (_) {} }
    this.connected = false;
  }

  getStatus() {
    return {
      running: this._running,
      connected: this.connected,
      connectedAt: this.connectedAt ? new Date(this.connectedAt).toISOString() : null,
      lastEventAt: this.lastEventAt ? new Date(this.lastEventAt).toISOString() : null,
      lastError: this.lastError
    };
  }

  /** Several nudges in a burst (a bulk change) become one sync. */
  _nudge(why) {
    if (this._debounce) clearTimeout(this._debounce);
    this._debounce = setTimeout(() => {
      this._debounce = null;
      log.info('licence_changed_nudge', { why });
      this.device.sync({ force: true }).catch(() => {});
    }, 250);
  }

  _schedule(ms) {
    if (!this._running) return;
    const jitter = Math.floor(Math.random() * 500);
    this._timer = setTimeout(() => { this._timer = null; this._loop(); }, ms + jitter);
  }

  _backoff() {
    const wait = this._retryMs;
    this._retryMs = Math.min(this._retryMs * 2, this.cfg.streamRetryMaxMs || 60000);
    this._schedule(wait);
  }

  async _loop() {
    if (!this._running) return;
    const doFetch = this._transport || api.transport();
    const url = config.url('/devices/stream');
    if (!doFetch || !url) { this.lastError = 'E_NOT_CONFIGURED'; return this._backoff(); }

    let token = null;
    try { token = await this.device._ensureToken(); } catch (_) { token = null; }
    if (!token) { this.lastError = 'E_NO_TOKEN'; return this._backoff(); }

    const ctrl = new AbortController();
    this._abort = ctrl;
    let idle = null;
    const armIdle = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => { this.lastError = 'E_IDLE'; try { ctrl.abort(); } catch (_) {} },
        this.cfg.streamIdleTimeoutMs || 70000);
    };

    let openedAt = null;
    let reconnectNow = false;
    try {
      armIdle();
      const res = await doFetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'text/event-stream' },
        signal: ctrl.signal,
        credentials: 'omit'
      });
      if (res.status === 401) {
        // The token lapsed between _ensureToken and here. Drop it; the next
        // attempt mints a fresh one.
        this.device._token = null;
        this.lastError = 'E_UNAUTHORIZED';
      } else if (res.status !== 200 || !res.body) {
        this.lastError = 'HTTP_' + res.status;
      } else {
        openedAt = Date.now();
        this.connected = true;
        this.connectedAt = openedAt;
        this.lastError = null;
        log.info('licence_stream_open');

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          armIdle();
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = /^event: (.*)$/m.exec(block);
            if (!ev) continue;             // a ': ping' comment
            this.lastEventAt = Date.now();
            let data = null;
            const da = /^data: (.*)$/m.exec(block);
            if (da) { try { data = JSON.parse(da[1]); } catch (_) { data = null; } }
            if (ev[1] === 'hello') {
              // Anything that changed while this machine was disconnected: the
              // stream opens at the server's revision; if ours differs, sync.
              const have = this.entitlement ? this.entitlement.getStatus().revision : null;
              if (!data || have == null || data.revision !== have) this._nudge('hello');
            } else if (ev[1] === 'changed') {
              this._nudge(data && data.scope ? data.scope : 'changed');
            } else if (ev[1] === 'reconnect') {
              reconnectNow = true;
            }
          }
          if (reconnectNow) { try { ctrl.abort(); } catch (_) {} break; }
        }
      }
    } catch (e) {
      if (!this.lastError || this.lastError === null) this.lastError = 'E_STREAM';
    } finally {
      if (idle) clearTimeout(idle);
      if (this._abort === ctrl) this._abort = null;
      if (this.connected) log.info('licence_stream_closed', { lastError: this.lastError });
      this.connected = false;
    }

    if (!this._running) return;
    // A stream that lived a while was healthy: start the back-off over.
    if (openedAt && Date.now() - openedAt > 60000) this._retryMs = this.cfg.streamRetryMinMs || 2000;
    if (reconnectNow) { this._retryMs = this.cfg.streamRetryMinMs || 2000; return this._schedule(0); }
    this._backoff();
  }
}

module.exports = { LicenceStream };
