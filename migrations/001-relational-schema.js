/* ─── HOSTIX — Migration 001: JSON-blob tables → relational (indexed) schema ──
   Phase 2 §6.3 PROTOTYPE — NOT wired into the running app yet.

   Strategy (hybrid "search columns + document blob"):
   Each promoted table keeps the full record verbatim in a `data` JSON column
   (so the migration is provably lossless — nothing a JSON blob holds can be
   dropped) AND promotes the fields the UI actually filters/searches to real,
   typed, INDEXED columns so dbAll() can finally use WHERE clauses. This fixes
   the audit's "no indexes / dbAll never filters" finding without a risky full
   normalisation or rewriting every read in the app.

   This module is pure JS (no native require). `migrateDatabase(db)` takes an
   already-open better-sqlite3 handle, so the transform can be unit-tested under
   plain Node while the SQLite mechanics run inside Electron.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// Promoted tables: field → column spec. `path` is the key on the record.
// type REAL → coerced to a number (or null); TEXT → stored as-is (or null).
const PROMOTED = {
  students: {
    columns: [
      { name: 'name', type: 'TEXT' }, { name: 'phone', type: 'TEXT' },
      { name: 'cnic', type: 'TEXT' }, { name: 'roomId', type: 'TEXT' },
      { name: 'status', type: 'TEXT' }, { name: 'joinDate', type: 'TEXT' },
      { name: 'rent', type: 'REAL' },
    ],
    indexes: [['roomId'], ['status'], ['name']],
  },
  payments: {
    columns: [
      { name: 'studentId', type: 'TEXT' }, { name: 'roomId', type: 'TEXT' },
      { name: 'status', type: 'TEXT' }, { name: 'month', type: 'TEXT' },
      { name: 'date', type: 'TEXT' }, { name: 'amount', type: 'REAL' },
      { name: 'unpaid', type: 'REAL' },
    ],
    indexes: [['studentId'], ['status'], ['month']],
  },
  rooms: {
    columns: [
      { name: 'number', type: 'TEXT' }, { name: 'floor', type: 'TEXT' },
      { name: 'typeId', type: 'TEXT' }, { name: 'rent', type: 'REAL' },
    ],
    indexes: [['number'], ['floor']],
  },
  expenses: {
    columns: [
      { name: 'category', type: 'TEXT' }, { name: 'date', type: 'TEXT' },
      { name: 'amount', type: 'REAL' },
    ],
    indexes: [['date'], ['category']],
  },
};

// Collections kept as (id, data) blobs — low volume / rarely filtered. Still
// lossless; promoting more of these is a follow-up, not required by the audit.
const BLOB_ONLY = [
  'cancellations', 'maintenance', 'complaints', 'checkinlog', 'notices',
  'fines', 'activitylog', 'inspections', 'billsplits', 'transfers', 'archive',
];

const ALL_TABLES = Object.keys(PROMOTED).concat(BLOB_ONLY);
const SCHEMA_VERSION = 1;

// ── Pure transform: record → row for its table (node-testable, no SQLite) ──────
function coerce(type, v) {
  if (v === undefined || v === null) return null;
  if (type === 'REAL') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return typeof v === 'string' ? v : String(v);
}

function promoteRecord(table, record) {
  const row = { id: record.id, data: JSON.stringify(record) };
  const spec = PROMOTED[table];
  if (spec) for (const c of spec.columns) row[c.name] = coerce(c.type, record[c.name]);
  return row;
}

// Reconstruct the original record from a migrated row (losslessness check).
function reconstructRecord(row) { return JSON.parse(row.data); }

// ── DDL builders ──────────────────────────────────────────────────────────────
function tableDDL(table) {
  const spec = PROMOTED[table];
  const cols = ['id TEXT PRIMARY KEY'];
  if (spec) for (const c of spec.columns) cols.push(`${c.name} ${c.type}`);
  cols.push('data TEXT NOT NULL');
  return `CREATE TABLE ${table} (\n  ${cols.join(',\n  ')}\n);`;
}
function indexDDL(table) {
  const spec = PROMOTED[table];
  if (!spec) return [];
  return spec.indexes.map(cols =>
    `CREATE INDEX idx_${table}_${cols.join('_')} ON ${table} (${cols.join(', ')});`);
}
function buildDDL() {
  const out = [];
  for (const t of ALL_TABLES) { out.push(tableDDL(t)); out.push(...indexDDL(t)); }
  return out;
}

// ── SQLite migration (run inside Electron; db = better-sqlite3 handle) ─────────
// Idempotent + transactional: rebuilds each promoted/blob table from its current
// (id, data) rows into the new schema. `settings`/version table are left intact.
function currentVersion(db) {
  try {
    db.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    const row = db.prepare("SELECT value FROM schema_meta WHERE key='version'").get();
    return row ? Number(row.value) : 0;
  } catch (_) { return 0; }
}

function migrateDatabase(db) {
  if (currentVersion(db) >= SCHEMA_VERSION) return { migrated: false, reason: 'already at version ' + SCHEMA_VERSION };

  const run = db.transaction(() => {
    for (const table of ALL_TABLES) {
      // Read existing (id, data) rows if the table exists; else start empty.
      let rows = [];
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (exists) rows = db.prepare(`SELECT id, data FROM ${table}`).all();

      db.exec(`DROP TABLE IF EXISTS ${table};`);
      db.exec(tableDDL(table));
      for (const ddl of indexDDL(table)) db.exec(ddl);

      const spec = PROMOTED[table];
      const colNames = ['id'].concat(spec ? spec.columns.map(c => c.name) : []).concat(['data']);
      const placeholders = colNames.map(n => '@' + n).join(', ');
      const ins = db.prepare(`INSERT INTO ${table} (${colNames.join(', ')}) VALUES (${placeholders})`);
      for (const r of rows) {
        let rec;
        try { rec = JSON.parse(r.data); } catch (_) { rec = { id: r.id }; }
        if (rec.id == null) rec.id = r.id;
        ins.run(promoteRecord(table, rec));
      }
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(SCHEMA_VERSION));
  });
  run();
  return { migrated: true, version: SCHEMA_VERSION };
}

module.exports = {
  PROMOTED, BLOB_ONLY, ALL_TABLES, SCHEMA_VERSION,
  coerce, promoteRecord, reconstructRecord,
  tableDDL, indexDDL, buildDDL, migrateDatabase, currentVersion,
};
