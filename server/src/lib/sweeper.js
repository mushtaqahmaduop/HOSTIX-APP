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
  const tick = () => sweepOnce().catch((e) => log && log.warn && log.warn({ err: e }, 'sweeper failed'));
  tick();
  const t = setInterval(tick, every);
  if (t.unref) t.unref();
  return () => clearInterval(t);
}

module.exports = { sweepOnce, start };
