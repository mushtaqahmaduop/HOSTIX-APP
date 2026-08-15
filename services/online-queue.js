// ════════════════════════════════════════════════════════════════════════════
// OnlineQueue  —  Phase 1  (spec §37 local queue architecture)
//
// A durable, SQLite-backed queue for work that needs the network. A support
// ticket raised at 2am on a dead ADSL line has to still be there at 9am
// (§26) — which means the queue survives process restart, power loss and the
// app being killed mid-send. That is the Phase 1 gate for this module.
//
// Columns are §37's, unchanged:
//   id, type, payload, created_at, attempts, next_attempt_at, status, last_error
//
// SCHEMA NOTE. This is a CREATE TABLE IF NOT EXISTS of a brand-new table. No
// existing table is altered and no data is transformed, so it is additive and
// downgrade-safe: an older build simply ignores it. SCHEMA_VERSION is
// deliberately NOT bumped here — the first *altering* change takes v2, per §41
// and audit finding M5. The table is also absent from db:exportFull /
// db:importFull on purpose: the queue is device-local machine state, not
// hostel data, and restoring a backup onto another machine must not replay
// another machine's pending uploads.
//
// §37: "Never queue sensitive raw data unnecessarily." Enforced here — every
// payload is size-capped and every stored error string is redacted.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const logger = require('./logger');
const config = require('./config');
const { redactString } = require('./redact');

const log = logger.forService('queue');

const STATUS = {
  PENDING:  'pending',
  INFLIGHT: 'inflight',
  DONE:     'done',
  FAILED:   'failed',    // dead-lettered: attempts exhausted, never retried
  CANCELLED:'cancelled'
};

// A queued task is a reference plus a small envelope. Anything approaching
// this size is a file, and files belong in attachment storage (Phase 4), not
// in a queue row.
const MAX_PAYLOAD_BYTES = 64 * 1024;

// Completed rows are kept briefly so the UI can show "sent", then swept.
const DONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS online_queue (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    payload         TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    status          TEXT NOT NULL,
    last_error      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_online_queue_due
    ON online_queue (status, next_attempt_at);
`;

class OnlineQueue {
  /**
   * @param {object} opts
   * @param {import('better-sqlite3').Database} opts.db
   * @param {object} [opts.cfg] config override (tests)
   */
  constructor(opts) {
    const o = opts || {};
    if (!o.db) throw new Error('OnlineQueue requires a database handle');
    this.db  = o.db;
    this.cfg = o.cfg || config.get();
    this.handlers = new Map();
    this._timer = null;
    this._draining = false;
    this._onlineCheck = () => false;   // replaced by attachConnectivity()

    this.db.exec(SCHEMA);
    this._recoverInflight();
  }

  // ── Recovery ──────────────────────────────────────────────────────────────
  /**
   * Anything left `inflight` was interrupted — the process died between
   * claiming a task and recording its outcome. Without this, one crash strands
   * a support ticket in a state nothing ever looks at again.
   *
   * The task keeps its attempt count and its idempotency key, so a resend is
   * recognisable as a duplicate server-side rather than creating a second
   * ticket.
   */
  _recoverInflight() {
    const now = Date.now();
    const res = this.db.prepare(
      `UPDATE online_queue SET status = ?, updated_at = ?, next_attempt_at = ?
       WHERE status = ?`
    ).run(STATUS.PENDING, now, now, STATUS.INFLIGHT);
    if (res.changes > 0) {
      log.warn('recovered_inflight', { count: res.changes });
    }
    return res.changes;
  }

  // ── Producer API ──────────────────────────────────────────────────────────
  /**
   * @param {string} type    matches a registered handler
   * @param {object} payload small JSON envelope, NOT raw records
   * @param {object} [opts]  { idempotencyKey, delayMs }
   * @returns {{ok:boolean, id?:string, error?:string}}
   */
  enqueue(type, payload, opts) {
    const o = opts || {};
    if (typeof type !== 'string' || !type.trim()) {
      return { ok: false, error: 'invalid_type' };
    }
    let body;
    try {
      body = JSON.stringify(payload === undefined ? null : payload);
    } catch (_) {
      return { ok: false, error: 'unserialisable_payload' };
    }
    if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
      log.warn('payload_too_large', { type, bytes: Buffer.byteLength(body, 'utf8') });
      return { ok: false, error: 'payload_too_large' };
    }

    const now = Date.now();
    const id  = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const idem = o.idempotencyKey || id;

    this.db.prepare(
      `INSERT INTO online_queue
         (id, type, payload, idempotency_key, created_at, updated_at,
          attempts, next_attempt_at, status, last_error)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`
    ).run(id, type, body, idem, now, now,
          now + (Number.isFinite(o.delayMs) ? o.delayMs : 0), STATUS.PENDING);

    log.info('enqueued', { id, type });
    return { ok: true, id };
  }

  /**
   * @param {string} type
   * @param {(payload:object, task:object) => Promise<{ok:boolean, retryable?:boolean, error?:string}>} fn
   */
  register(type, fn) {
    if (typeof fn !== 'function') throw new Error('handler must be a function');
    this.handlers.set(type, fn);
  }

  /** Supply the "may I use the network right now" predicate. */
  attachConnectivity(isOnlineFn) {
    if (typeof isOnlineFn === 'function') this._onlineCheck = isOnlineFn;
  }

  // ── Inspection ────────────────────────────────────────────────────────────
  stats() {
    const rows = this.db.prepare(
      `SELECT status, COUNT(*) AS n FROM online_queue GROUP BY status`
    ).all();
    const out = { pending: 0, inflight: 0, done: 0, failed: 0, cancelled: 0 };
    for (const r of rows) if (r.status in out) out[r.status] = r.n;
    return out;
  }

  get(id) {
    const row = this.db.prepare(`SELECT * FROM online_queue WHERE id = ?`).get(id);
    return row ? this._hydrate(row) : null;
  }

  list(status, limit) {
    const rows = status
      ? this.db.prepare(
          `SELECT * FROM online_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?`
        ).all(status, Math.min(200, limit || 50))
      : this.db.prepare(
          `SELECT * FROM online_queue ORDER BY created_at DESC LIMIT ?`
        ).all(Math.min(200, limit || 50));
    return rows.map(r => this._hydrate(r));
  }

  _hydrate(row) {
    let payload = null;
    try { payload = JSON.parse(row.payload); } catch (_) { payload = null; }
    return {
      id: row.id, type: row.type, payload,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at, updatedAt: row.updated_at,
      attempts: row.attempts, nextAttemptAt: row.next_attempt_at,
      status: row.status, lastError: row.last_error
    };
  }

  cancel(id) {
    const now = Date.now();
    const res = this.db.prepare(
      `UPDATE online_queue SET status = ?, updated_at = ?
       WHERE id = ? AND status IN (?, ?)`
    ).run(STATUS.CANCELLED, now, id, STATUS.PENDING, STATUS.FAILED);
    return { ok: res.changes > 0 };
  }

  /** Put a dead-lettered task back in play — an explicit user action only. */
  retryFailed(id) {
    const now = Date.now();
    const res = this.db.prepare(
      `UPDATE online_queue SET status = ?, attempts = 0, next_attempt_at = ?,
              updated_at = ?, last_error = NULL
       WHERE id = ? AND status = ?`
    ).run(STATUS.PENDING, now, now, id, STATUS.FAILED);
    return { ok: res.changes > 0 };
  }

  // ── Drain ─────────────────────────────────────────────────────────────────
  start() {
    if (this._timer) return;
    const every = this.cfg.queueDrainIntervalMs;
    this._timer = setInterval(() => { this.drain().catch(() => {}); }, every);
    if (this._timer.unref) this._timer.unref();
    log.info('started', { intervalMs: every });
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  /**
   * Process every task that is due, once. Returns a summary.
   * Re-entrant calls are ignored — two overlapping drains would claim the same
   * rows twice.
   */
  async drain() {
    if (this._draining) return { skipped: 'busy' };
    if (!this._onlineCheck()) return { skipped: 'offline' };

    this._draining = true;
    const summary = { processed: 0, ok: 0, retried: 0, failed: 0 };
    try {
      const now  = Date.now();
      const due  = this.db.prepare(
        `SELECT * FROM online_queue
          WHERE status = ? AND next_attempt_at <= ?
          ORDER BY next_attempt_at ASC
          LIMIT ?`
      ).all(STATUS.PENDING, now, this.cfg.queueBatchSize);

      for (const row of due) {
        // Stop early rather than hammer a control plane that just went away
        // mid-batch.
        if (!this._onlineCheck()) break;
        summary.processed++;
        const outcome = await this._runOne(row);
        summary[outcome]++;
      }
      this._sweep();
    } finally {
      this._draining = false;
    }
    return summary;
  }

  async _runOne(row) {
    const task = this._hydrate(row);
    const handler = this.handlers.get(task.type);
    const now = Date.now();

    if (!handler) {
      // A task type with no handler is a code bug, not a transient failure.
      // Retrying it forever would be exactly the infinite loop §36 forbids.
      this._markFailed(task.id, 'no_handler_registered');
      log.error('no_handler', { id: task.id, type: task.type });
      return 'failed';
    }

    // Claim the row before doing anything slow. If the process dies now, the
    // row is `inflight` and _recoverInflight() reclaims it at next boot.
    this.db.prepare(
      `UPDATE online_queue SET status = ?, attempts = attempts + 1, updated_at = ?
       WHERE id = ?`
    ).run(STATUS.INFLIGHT, now, task.id);
    const attempts = task.attempts + 1;

    let result;
    try {
      result = await handler(task.payload, {
        id: task.id, type: task.type, attempts,
        idempotencyKey: task.idempotencyKey
      });
    } catch (e) {
      result = { ok: false, retryable: true, error: (e && e.message) || String(e) };
    }

    if (result && result.ok) {
      this.db.prepare(
        `UPDATE online_queue SET status = ?, updated_at = ?, last_error = NULL WHERE id = ?`
      ).run(STATUS.DONE, Date.now(), task.id);
      log.info('task_done', { id: task.id, type: task.type, attempts });
      return 'ok';
    }

    const error = redactString(String((result && result.error) || 'unknown_error'));
    const retryable = !result || result.retryable !== false;

    if (!retryable || attempts >= this.cfg.queueMaxAttempts) {
      this._markFailed(task.id, error);
      log.warn('task_dead_lettered', {
        id: task.id, type: task.type, attempts, retryable, errorCode: 'E_QUEUE_EXHAUSTED'
      });
      return 'failed';
    }

    // Same full-jitter curve as the ApiClient, for the same reason.
    const exp = Math.min(
      this.cfg.backoffMaxMs,
      this.cfg.backoffBaseMs * Math.pow(2, attempts - 1)
    );
    const delay = Math.floor(Math.random() * exp);
    this.db.prepare(
      `UPDATE online_queue SET status = ?, next_attempt_at = ?, updated_at = ?, last_error = ?
       WHERE id = ?`
    ).run(STATUS.PENDING, Date.now() + delay, Date.now(), error, task.id);
    log.debug('task_retry_scheduled', { id: task.id, type: task.type, attempts, delayMs: delay });
    return 'retried';
  }

  _markFailed(id, error) {
    this.db.prepare(
      `UPDATE online_queue SET status = ?, updated_at = ?, last_error = ? WHERE id = ?`
    ).run(STATUS.FAILED, Date.now(), redactString(String(error || '')), id);
  }

  /** Drop long-completed rows. Failed rows are kept — they need a human. */
  _sweep() {
    try {
      this.db.prepare(
        `DELETE FROM online_queue WHERE status IN (?, ?) AND updated_at < ?`
      ).run(STATUS.DONE, STATUS.CANCELLED, Date.now() - DONE_RETENTION_MS);
    } catch (_) { /* best effort */ }
  }
}

module.exports = { OnlineQueue, STATUS, SCHEMA, MAX_PAYLOAD_BYTES };
