// ════════════════════════════════════════════════════════════════════════════
// Sweeper — lifts timed levels when their `status_until` passes
//
// The entitlement already treats an expired timed level as over (see
// access.effectiveLevel), so a hostel is never held a minute past its ban. This
// makes the DATABASE say so too, and — the part that matters to the owner —
// writes the audit row, so "why is this hostel open again?" has an answer.
//
// The UPDATE bumps `revision` through the trigger, which NOTIFYs, so every app
// holding a stream is told the moment the ban lifts.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const db = require('../db');
const audit = require('./audit');

/** Housekeeping the request path should never pay for. */
async function housekeep() {
  // Rate-limit windows are an hour at most; a day-old row counts nothing.
  await db.query("DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'").catch(() => {});
  await db.query('DELETE FROM device_tokens WHERE expires_at < NOW()').catch(() => {});
  await db.query('DELETE FROM admin_sessions WHERE expires_at < NOW()').catch(() => {});
  // A stream that ended with the process (a crash, a redeploy) never cleared
  // its presence; a stale mark must not show a PC online.
  await db.query("UPDATE devices SET stream_connected_at = NULL WHERE stream_connected_at < NOW() - INTERVAL '10 minutes'").catch(() => {});
}

async function sweepOnce() {
  const { rows } = await db.query(
    `UPDATE licenses
        SET status        = COALESCE(status_before, 'active'),
            status_until  = NULL,
            status_before = NULL,
            status_reason = NULL
      WHERE status_until IS NOT NULL
        AND status_until <= NOW()
        AND status <> 'revoked'
      RETURNING id, status`
  );
  for (const r of rows) {
    await audit.record({
      user: null, action: 'license.level_auto_lift', targetType: 'license', targetId: r.id,
      details: { to: r.status }
    }).catch(() => {});
  }
  return rows.length;
}

function start(intervalMs, log) {
  const every = intervalMs || 60000;
  // Never overlapping: a slow database must not stack sweeps on top of each other.
  let running = false;
  let n = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweepOnce();
      if (n++ % 15 === 0) await housekeep();     // every ~15 minutes
    } catch (e) {
      if (log && log.warn) log.warn({ err: e }, 'sweeper failed');
    } finally {
      running = false;
    }
  };
  tick();
  const t = setInterval(tick, every);
  if (t.unref) t.unref();
  return () => clearInterval(t);
}

module.exports = { sweepOnce, housekeep, start };
