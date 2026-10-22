// ════════════════════════════════════════════════════════════════════════════
// In-memory rate limiting — the first line, before any database work
//
// The Postgres counters in the routes (register, token, admin login) are the
// durable, cross-instance limit for the few endpoints where a guess is worth
// something. This is different: it is CHEAP, per process, and runs on every
// machine-facing request BEFORE a query is issued, so a flood — a buggy build
// in a tight loop, a script — costs a Map lookup instead of a round trip to
// the database it would otherwise take down with it.
//
// Fixed-window counters with a hard ceiling on how many keys are tracked, so
// the limiter itself cannot be turned into a memory leak by rotating IPs.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

class WindowLimiter {
  /**
   * @param {object} o
   * @param {number} o.limit      requests allowed per window
   * @param {number} o.windowMs
   * @param {number} [o.maxKeys]  keys tracked before the oldest windows are dropped
   * @param {function} [o.now]
   */
  constructor(o) {
    this.limit = o.limit;
    this.windowMs = o.windowMs;
    this.maxKeys = o.maxKeys || 50000;
    this.now = o.now || Date.now;
    this.map = new Map();
    this._sweepAt = 0;
  }

  /** @returns {{ok:boolean, retryAfterMs:number, remaining:number}} */
  hit(key) {
    const t = this.now();
    if (t >= this._sweepAt) this._sweep(t);
    let e = this.map.get(key);
    if (!e || t - e.start >= this.windowMs) {
      if (!e && this.map.size >= this.maxKeys) this._sweep(t, true);
      e = { start: t, n: 0 };
      this.map.set(key, e);
    }
    e.n++;
    if (e.n > this.limit) {
      return { ok: false, retryAfterMs: e.start + this.windowMs - t, remaining: 0 };
    }
    return { ok: true, retryAfterMs: 0, remaining: this.limit - e.n };
  }

  _sweep(t, force) {
    for (const [k, e] of this.map) if (t - e.start >= this.windowMs) this.map.delete(k);
    // Still full after dropping expired windows: drop the oldest insertions.
    // Map iteration order is insertion order, so this is O(dropped).
    if (force && this.map.size >= this.maxKeys) {
      let drop = Math.ceil(this.maxKeys / 10);
      for (const k of this.map.keys()) { if (drop-- <= 0) break; this.map.delete(k); }
    }
    this._sweepAt = t + this.windowMs;
  }
}

/** Send a 429 with Retry-After — every client this service has honours it. */
function tooMany(reply, retryAfterMs, message) {
  const secs = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return reply.code(429).header('Retry-After', String(secs)).send({
    success: false, code: 'RATE_LIMIT', message: message || 'Too many requests. Try again later.'
  });
}

module.exports = { WindowLimiter, tooMany };
