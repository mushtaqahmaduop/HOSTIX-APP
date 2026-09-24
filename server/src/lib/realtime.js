// ════════════════════════════════════════════════════════════════════════════
// Realtime — Postgres LISTEN/NOTIFY fanned out to live device streams
//
// How a change in the portal reaches a running app in seconds (owner,
// 2026-09-24). The chain:
//
//   admin writes a licence  →  trigger bumps `revision`, NOTIFY cp_changes
//   this module LISTENs      →  emits 'licence' / 'device' / 'fleet'
//   /v1/devices/stream       →  writes `event: changed` to the matching apps
//   the app                  →  fetches /v1/entitlement, verifies, applies
//
// The stream carries NO policy — only "your licence changed". Policy only ever
// travels in the signed entitlement, so a forged or replayed stream message can
// at worst make an app ask for its entitlement one more time.
//
// Postgres rather than Redis for the same reason device tokens and rate limits
// are in Postgres: this service does not otherwise need Redis. NOTIFY is
// delivered on COMMIT, so an app is never told to fetch a change that was
// rolled back, and every server instance LISTENs, so a change made through one
// instance reaches streams held by another.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const { EventEmitter } = require('events');
const pg = require('pg');

const CHANNEL = 'cp_changes';

class Realtime extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.databaseUrl]
   * @param {object} [opts.logger]
   */
  constructor(opts) {
    super();
    const o = opts || {};
    this.databaseUrl = o.databaseUrl || null;
    this.log = o.logger || console;
    this._client = null;
    this._stopped = true;
    this._retryMs = 1000;
    this._timer = null;
    this.listening = false;
    // Every stream this process holds. Counted for the System page.
    this.streams = new Set();
    // Many streams listen; lifting the default ceiling is deliberate.
    this.setMaxListeners(0);
  }

  start() {
    if (!this.databaseUrl || !this._stopped) return;
    this._stopped = false;
    this._connect();
  }

  async stop() {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    const c = this._client;
    this._client = null;
    this.listening = false;
    if (c) await c.end().catch(() => {});
  }

  async _connect() {
    if (this._stopped) return;
    const client = new pg.Client({
      connectionString: this.databaseUrl,
      ssl: /sslmode=require|supabase|railway/i.test(this.databaseUrl)
        ? { rejectUnauthorized: false } : undefined
    });
    const retry = (why) => {
      if (this._client !== client) return;
      this._client = null;
      this.listening = false;
      client.end().catch(() => {});
      if (this._stopped) return;
      this.log.warn && this.log.warn('[realtime] listener lost (' + why + '), reconnecting in ' + this._retryMs + 'ms');
      this._timer = setTimeout(() => this._connect(), this._retryMs);
      this._retryMs = Math.min(this._retryMs * 2, 30000);
      // A reconnect may have missed notifications. Tell every stream to re-sync
      // once rather than leave an app holding a change it never heard about.
      this.emit('resync');
    };
    this._client = client;
    client.on('error', (e) => retry(e.code || e.message));
    client.on('end', () => retry('end'));
    client.on('notification', (msg) => {
      if (msg.channel === CHANNEL) this._dispatch(msg.payload);
    });
    try {
      await client.connect();
      await client.query('LISTEN ' + CHANNEL);
      this.listening = true;
      this._retryMs = 1000;
    } catch (e) {
      retry(e.code || e.message);
    }
  }

  /** 'L:<id>:<rev>' | 'D:<id>' | 'F:<rev>' → typed events. Public for tests. */
  _dispatch(payload) {
    const p = String(payload || '').split(':');
    if (p[0] === 'L' && p[1]) this.emit('licence', p[1], Number(p[2]) || null);
    else if (p[0] === 'D' && p[1]) this.emit('device', p[1]);
    else if (p[0] === 'F') this.emit('fleet', Number(p[1]) || null);
  }
}

module.exports = { Realtime, CHANNEL };
