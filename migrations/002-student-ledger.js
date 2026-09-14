/* ─── HOSTYLLO — THE STUDENT LEDGER TABLE (warden ledger spec §2.1, §5 step 2) ──

   One row per money event on a student: a charge, a payment, a concession or
   an adjustment. The renderer decides WHAT to post (renderer/src/ledger.js);
   this file owns the one promise the spec makes about the table:

     "rows in student_ledger are never edited or deleted once created."

   Owner, 2026-09-14 (schema Q4): the main process refuses it, and a full
   restore is the only thing that replaces the table. So the promise is kept in
   three places, each one enough on its own:

     1. SQLite triggers abort any UPDATE or DELETE on the table. Whatever reaches
        the database — a bug here, a future handler, a stray SQL statement —
        cannot change a row.
     2. The generic db:upsert / db:delete / db:bulkReplace channels refuse the
        table outright (main.js _assertRendererTable), so the renderer's
        record-diff save path can never touch it.
     3. append() writes with INSERT, never INSERT OR REPLACE. Re-sending an entry
        that is already stored byte-for-byte is accepted, because a save that is
        retried after a lost reply must not fail; re-sending the same id with
        different content is refused.

   replaceAll() is the restore path. It lifts the triggers, swaps the whole
   table, and puts them back, inside one transaction — so there is no moment,
   even on a crash, where the table is unprotected and committed.

   WHY `seq`. Entries are read back in the order they were created, because
   `runningBalance` is the balance after each entry in THAT order (schema Q5).
   SQLite's implicit rowid is not a safe order: VACUUM may renumber it on a table
   whose primary key is not an INTEGER PRIMARY KEY. `seq` is that key, so the
   order survives a VACUUM INTO backup and a restore.

   Pure JS apart from the db handle it is given, so validateEntry() runs under
   plain Node (tests/ledger.test.js); better-sqlite3 is built for the Electron
   ABI and the SQL path is proven inside Electron (tests/ledger-store.spec.js).
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const TABLE = 'student_ledger';
const TYPES = ['charge', 'payment', 'concession', 'adjustment'];
const MAX_ID = 100;

const TRIGGERS_SQL = `
  CREATE TRIGGER IF NOT EXISTS student_ledger_no_update
    BEFORE UPDATE ON student_ledger
    BEGIN SELECT RAISE(ABORT, 'student_ledger rows are never edited'); END;
  CREATE TRIGGER IF NOT EXISTS student_ledger_no_delete
    BEFORE DELETE ON student_ledger
    BEGIN SELECT RAISE(ABORT, 'student_ledger rows are never deleted'); END;
`;

const DROP_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS student_ledger_no_update;
  DROP TRIGGER IF EXISTS student_ledger_no_delete;
`;

/** Create the table and its guards. Idempotent; safe on every boot. */
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_ledger (
      seq  INTEGER PRIMARY KEY AUTOINCREMENT,
      id   TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL
    );
  ` + TRIGGERS_SQL);
}

/* What an entry must be before it may be stored. Structural only — it says
   nothing about whether the amount is sensible, only that the row can be read
   back and summed. Returns a reason, or null when the entry is sound. */
function validateEntry(e) {
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return 'an entry is not a record';
  if (typeof e.id !== 'string' || !e.id.trim() || e.id.length > MAX_ID) return 'an entry has no usable id';
  if (TYPES.indexOf(e.type) === -1) return 'entry ' + e.id + ' has an unknown type';
  if (typeof e.studentId !== 'string' || !e.studentId.trim()) return 'entry ' + e.id + ' has no student';
  if (!Number.isSafeInteger(e.amount)) return 'entry ' + e.id + ' has an amount that is not whole rupees';
  if (e.type === 'adjustment') {
    if (e.amount === 0) return 'entry ' + e.id + ' is an adjustment of nothing';
  } else if (e.amount <= 0) {
    return 'entry ' + e.id + ' must have a positive amount';
  }
  // Spec §2.1: a reason is required for charge and concession; schema Q2 adds
  // the adjustment, which is a correction and meaningless without one.
  if (e.type !== 'payment' && (typeof e.reason !== 'string' || !e.reason.trim())) {
    return 'entry ' + e.id + ' needs a reason';
  }
  if (!Number.isSafeInteger(e.runningBalance)) return 'entry ' + e.id + ' has no running balance';
  if (typeof e.createdAt !== 'string' || !e.createdAt) return 'entry ' + e.id + ' has no creation time';
  return null;
}

function validateAll(entries) {
  if (!Array.isArray(entries)) return 'the ledger is not a list';
  const seen = new Set();
  for (const e of entries) {
    const bad = validateEntry(e);
    if (bad) return bad;
    if (seen.has(e.id)) return 'entry ' + e.id + ' appears twice';
    seen.add(e.id);
  }
  return null;
}

/** Every entry, in the order it was created. */
function all(db) {
  return db.prepare(`SELECT data FROM ${TABLE} ORDER BY seq`).all()
    .map(r => JSON.parse(r.data));
}

/* Append entries. All or nothing: one refused entry refuses the batch, so a
   save never lands half a collection. */
function append(db, entries) {
  const bad = validateAll(entries);
  if (bad) return { ok: false, error: 'Ledger entry refused: ' + bad + '.', code: 'INVALID_LEDGER_ENTRY' };

  const ins = db.prepare(`INSERT OR IGNORE INTO ${TABLE} (id, data) VALUES (?, ?)`);
  const get = db.prepare(`SELECT data FROM ${TABLE} WHERE id = ?`);
  let inserted = 0;

  const tx = db.transaction(rows => {
    for (const e of rows) {
      const json = JSON.stringify(e);
      if (ins.run(e.id, json).changes === 1) { inserted++; continue; }
      // Already stored. The same bytes again is a retried save; anything else
      // is an attempt to rewrite history under an existing id.
      const have = get.get(e.id);
      if (!have || have.data !== json) {
        const err = new Error('Ledger entry ' + e.id + ' already exists and cannot be changed.');
        err.code = 'LEDGER_IMMUTABLE';
        throw err;
      }
    }
  });

  try { tx(entries); }
  catch (e) {
    if (e && e.code === 'LEDGER_IMMUTABLE') return { ok: false, error: e.message, code: e.code };
    throw e;
  }
  return { ok: true, inserted };
}

/* Replace the whole table — for a full restore or Reset All Data, nothing else.
   Runs inside the caller's transaction when there is one (db:importFull), and
   opens its own otherwise. */
function replaceRows(db, entries) {
  db.exec(DROP_TRIGGERS_SQL);
  db.prepare(`DELETE FROM ${TABLE}`).run();
  const ins = db.prepare(`INSERT INTO ${TABLE} (id, data) VALUES (?, ?)`);
  for (const e of entries) ins.run(e.id, JSON.stringify(e));
  db.exec(TRIGGERS_SQL);
}

function replaceAll(db, entries) {
  const list = entries == null ? [] : entries;
  const bad = validateAll(list);
  if (bad) return { ok: false, error: 'The ledger could not be restored: ' + bad + '.', code: 'INVALID_LEDGER_ENTRY' };
  db.transaction(() => replaceRows(db, list))();
  return { ok: true, count: list.length };
}

/* The ledger inside a backup document. The menu export writes the table name;
   Settings → Export Data serialises the in-memory DB, whose key is camelCase.
   null means the backup has no ledger at all (it predates the ledger). */
function backupEntries(data) {
  if (!data || typeof data !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(data, TABLE)) return data[TABLE];
  if (Object.prototype.hasOwnProperty.call(data, 'studentLedger')) return data.studentLedger;
  return null;
}

module.exports = {
  TABLE, TYPES, ensureSchema, validateEntry, validateAll,
  all, append, replaceRows, replaceAll, backupEntries,
};
