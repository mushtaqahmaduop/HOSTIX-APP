// ════════════════════════════════════════════════════════════════════════════
// Migration runner
//
//   node src/migrate.js            apply everything pending
//   node src/migrate.js --status   show applied vs pending, change nothing
//
// Each file runs exactly once, in filename order, inside its own transaction,
// and its checksum is recorded. Editing a migration that has already run
// somewhere is the one thing this cannot save you from — the live database
// keeps the old version — so it warns loudly and you add a new file instead.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DIR = path.join(__dirname, '..', 'migrations');

function files() {
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();   // 001_, 002_ … filename order IS apply order
}

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

async function ensureLedger() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applied() {
  const { rows } = await db.query('SELECT filename, checksum FROM schema_migrations');
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

async function status() {
  await ensureLedger();
  const done = await applied();
  const all = files();
  console.log('');
  for (const f of all) {
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    const recorded = done.get(f);
    if (!recorded) {
      console.log('  PENDING  ' + f);
    } else if (recorded !== checksum(sql)) {
      console.log('  DRIFT    ' + f + '   <-- the file changed after it was applied');
    } else {
      console.log('  applied  ' + f);
    }
  }
  console.log('');
  return all.filter((f) => !done.has(f));
}

async function migrate() {
  await ensureLedger();
  const done = await applied();
  const pending = files().filter((f) => !done.has(f));

  // Drift is a warning, not a failure: the live database already has the old
  // version and re-running would not fix it. Refusing to apply UNRELATED new
  // migrations because of it would be worse.
  for (const [filename, recorded] of done) {
    const full = path.join(DIR, filename);
    if (!fs.existsSync(full)) continue;
    if (checksum(fs.readFileSync(full, 'utf8')) !== recorded) {
      console.warn('  WARNING: ' + filename + ' changed after it was applied. '
        + 'The database still has the original. Add a new migration instead.');
    }
  }

  if (pending.length === 0) {
    console.log('  nothing to apply');
    return;
  }

  for (const f of pending) {
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    process.stdout.write('  applying ' + f + ' … ');
    await db.withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [f, checksum(sql)]
      );
    });
    console.log('ok');
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  try {
    if (process.argv.includes('--status')) await status();
    else await migrate();
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n  migration failed: ' + err.message + '\n');
    process.exit(1);
  });
}

module.exports = { files, checksum, migrate, status };
