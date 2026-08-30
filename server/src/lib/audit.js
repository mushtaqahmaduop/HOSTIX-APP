// ════════════════════════════════════════════════════════════════════════════
// Audit log
//
// Every privileged action lands here. "Who suspended this hostel, and when, and
// why" is a question that gets asked precisely when the answer matters most —
// a customer on the phone insisting they were switched off by mistake.
//
// The table is INSERT-ONLY, enforced by a database trigger rather than by
// convention, so a later refactor cannot quietly start editing history.
//
// `actor` stores the email as it was at the time, alongside the FK. The FK is
// SET NULL if an admin is ever deleted; the email survives, because a log entry
// that says "someone deleted" is not a log entry.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const db = require('../db');

/**
 * @param {object} entry
 * @param {object} entry.user      the acting admin ({id, email})
 * @param {string} entry.action    'license.suspend', 'license.renew', …
 * @param {string} [entry.targetType]
 * @param {string} [entry.targetId]
 * @param {object} [entry.details] before/after, or whatever explains the action
 * @param {string} [entry.ip]
 * @param {object} [client]        run inside an open transaction when given
 */
async function record(entry, client) {
  const runner = client || db;
  await runner.query(
    `INSERT INTO audit_log (admin_user_id, actor, action, target_type, target_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.user ? entry.user.id : null,
      entry.user ? entry.user.email : 'system',
      entry.action,
      entry.targetType || null,
      entry.targetId || null,
      JSON.stringify(entry.details || {}),
      entry.ip || null
    ]
  );
}

async function forTarget(targetType, targetId, limit) {
  const { rows } = await db.query(
    `SELECT actor, action, details, ip, created_at
       FROM audit_log
      WHERE target_type = $1 AND target_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [targetType, targetId, limit || 50]
  );
  return rows;
}

async function recent(limit, offset) {
  const { rows } = await db.query(
    `SELECT actor, action, target_type, target_id, details, ip, created_at
       FROM audit_log
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit || 100, offset || 0]
  );
  return rows;
}

module.exports = { record, forTarget, recent };
