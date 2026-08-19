// ════════════════════════════════════════════════════════════════════════════
// Create or reset a portal admin
//
//   node src/scripts/create-admin.js <email> [name] [role]
//
// The password is generated here rather than accepted as an argument: an
// argument lands in the shell history and in the process list, where anything
// on the machine can read it. It is printed once.
//
// Re-running for an existing email RESETS that password — which is the recovery
// path when the owner is locked out — and destroys their live sessions, because
// a password reset that leaves old sessions working is not a reset.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

/** Readable aloud over a phone: no O/0, no l/1/I. */
function generatePassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 20; i++) out += alphabet[bytes[i] % alphabet.length];
  return out.slice(0, 5) + '-' + out.slice(5, 10) + '-' + out.slice(10, 15) + '-' + out.slice(15, 20);
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const name = process.argv[3] || null;
  const role = process.argv[4] || 'owner';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('usage: node src/scripts/create-admin.js <email> [name] [owner|admin|support]');
    process.exit(2);
  }
  if (!['owner', 'admin', 'support'].includes(role)) {
    console.error('role must be one of: owner, admin, support');
    process.exit(2);
  }

  const password = generatePassword();
  // 12 rounds. The cost is paid once per sign-in by one or two people, and it
  // is the difference between a leaked hash being crackable and not.
  const hash = await bcrypt.hash(password, 12);

  const { rows } = await db.query(
    `INSERT INTO admin_users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = COALESCE(EXCLUDED.name, admin_users.name),
           is_active = TRUE
     RETURNING id, email, name, role, (xmax = 0) AS created`,
    [email, hash, name, role]
  );
  const user = rows[0];

  if (!user.created) {
    await db.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [user.id]);
  }

  await db.query(
    `INSERT INTO audit_log (admin_user_id, actor, action, target_type, target_id, details)
     VALUES ($1, 'cli', $2, 'admin_user', $1, $3)`,
    [user.id, user.created ? 'admin.create' : 'admin.password_reset', JSON.stringify({ email, role })]
  );

  console.log('');
  console.log('  ' + (user.created ? 'Created' : 'Password reset for') + ' portal admin');
  console.log('  ────────────────────────────────────────────');
  console.log('  Email     ' + user.email);
  console.log('  Password  ' + password);
  console.log('  Role      ' + user.role);
  console.log('');
  console.log('  Shown once. Store it in a password manager now.');
  if (!user.created) console.log('  Existing sessions for this account have been signed out.');
  console.log('');
}

main()
  .catch((err) => { console.error('\n  failed: ' + err.message + '\n'); process.exitCode = 1; })
  .finally(() => db.close());
