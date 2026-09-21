/* ─── 003 — ONE ISSUES REGISTER, ONE TABLE ───────────────────────────────────

   Owner, 2026-09-21: one register for maintenance and complaints, "Maintenance"
   as a value in the Category dropdown, MA-/CO- reference numbers kept.

   `maintenance` and `complaints` become one `issues` table. The screen already
   read them as one list — `_issAll()` has normalised them onto a single shape
   since the 2026-09-08 redesign — so this changes the storage to match what the
   app has been pretending for a fortnight, not the behaviour.

   ── COPY, DO NOT MOVE ──────────────────────────────────────────────────────

   Both source tables are left in place and fully populated. They are the
   rollback path for one release and they cost a few kilobytes. Nothing reads
   them after this; `main.js` still CREATEs them so a restore of an older backup
   lands somewhere.

   ── THE ONE-WAY DOOR ───────────────────────────────────────────────────────

   main.js refuses to open a database newer than the build understands, on
   purpose — an older app half-reading a newer file is worse than a refusal. So
   once a hostel is at v2, THE PREVIOUS INSTALLER CANNOT OPEN THEIR DATABASE. If
   this release has to be pulled, those machines need hostix.db.pre-v2.bak
   restored by hand. Accepted by the owner, 2026-09-21, with that stated.

   ── LOSSLESS BY CONSTRUCTION ───────────────────────────────────────────────

   mergeRecord() starts from a COPY OF THE WHOLE RECORD and then applies three
   named changes. It does not build a new object out of a list of fields it
   knows about — a whitelist silently destroys anything the list forgot, and the
   list would be wrong the first time somebody adds a field to the form.

   The three changes, and nothing else:

     1. `kind`               stamped, 'maintenance' or 'complaint'. It is what
                             _issSeq() reads for the MA-/CO- prefix.
     2. `subject` → `title`  a complaint's subject and a ticket's title are one
                             thing under two names, and one form cannot have
                             both.
     3. `UnderReview` → `InProgress`
                             one register, one form, one word for the middle
                             state (owner, 2026-09-21). _issBucket() already
                             collapsed the two, so no counter moves.

   `cost` is NOT touched here. It is read by _issAll() and has never been
   written by any form, so no record carries the key — there is nothing to drop
   in the data. The phantom READ is what goes, in issues.js.

   ── seq IS STAMPED, AND THIS IS THE ONLY MOMENT IT CAN BE ──────────────────

   A record written before `seq` existed has none, and _issSeq() falls back to
   its POSITION IN ITS OWN COLLECTION. After the merge there is no such
   position — one list holds both kinds — so every one of those references would
   silently renumber. This is the last point at which the original order is
   still known, so the number is stamped here and becomes permanent.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const SCHEMA_VERSION = 2;
const TABLE = 'issues';

/* The transform itself lives in renderer/src/utils.js, NOT here.

   A restored backup written before the merge has to be folded by the RENDERER
   too (see _initDBFields), and a data migration performed by two separate
   implementations is a data migration that will disagree. main.js already
   requires this module the same way for the licence-key helpers. */
const { ISSUE_MIDDLE_STATUS, issueMergeRecord } = require('../renderer/src/utils');

const MIDDLE_STATUS = ISSUE_MIDDLE_STATUS;
const mergeRecord = issueMergeRecord;

function tableDDL() {
  return 'CREATE TABLE IF NOT EXISTS ' + TABLE +
         ' (id TEXT PRIMARY KEY, data TEXT NOT NULL);';
}

// ── SQLite ──────────────────────────────────────────────────────────────────

function currentVersion(db) {
  try {
    db.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    const row = db.prepare("SELECT value FROM schema_meta WHERE key='version'").get();
    return row ? Number(row.value) : 0;
  } catch (_) { return 0; }
}

function _rows(db, table) {
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return exists ? db.prepare('SELECT id, data FROM ' + table).all() : [];
}

/**
 * Idempotent and transactional, like 001. Returns early at or beyond v2, so a
 * second launch does not copy anything twice.
 */
function migrateDatabase(db) {
  if (currentVersion(db) >= SCHEMA_VERSION) {
    return { migrated: false, reason: 'already at version ' + SCHEMA_VERSION };
  }

  let copied = 0;
  const run = db.transaction(() => {
    db.exec(tableDDL());

    const before = db.prepare('SELECT COUNT(*) AS n FROM ' + TABLE).get().n;

    // A plain INSERT, not INSERT OR REPLACE: maintenance ids are `mt_…` and
    // complaint ids are `cp_…`, so a collision is impossible unless something
    // is wrong — and if something is wrong, throwing rolls the whole thing back
    // rather than quietly overwriting one record with another.
    const ins = db.prepare('INSERT INTO ' + TABLE + ' (id, data) VALUES (?, ?)');

    for (const [table, kind] of [['maintenance', 'maintenance'], ['complaints', 'complaint']]) {
      const rows = _rows(db, table);
      rows.forEach((r, i) => {
        let rec;
        try { rec = JSON.parse(r.data); } catch (_) { rec = { id: r.id }; }
        if (rec.id == null) rec.id = r.id;
        const merged = mergeRecord(kind, rec, i + 1);
        ins.run(merged.id, JSON.stringify(merged));
        copied++;
      });
    }

    const after = db.prepare('SELECT COUNT(*) AS n FROM ' + TABLE).get().n;
    if (after - before !== copied) {
      throw new Error('issues merge lost records: expected ' + copied +
                      ' copied, table moved by ' + (after - before));
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(SCHEMA_VERSION));
  });
  run();

  return { migrated: true, version: SCHEMA_VERSION, copied };
}

module.exports = {
  SCHEMA_VERSION, TABLE, MIDDLE_STATUS,
  mergeRecord, tableDDL, migrateDatabase, currentVersion,
};
