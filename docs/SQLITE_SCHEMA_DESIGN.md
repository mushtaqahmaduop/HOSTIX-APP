# Phase 2 §6.3 — SQLite Relational Schema (PROTOTYPE / design for review)

**Status:** prototype only. The migration is written and tested in isolation
(`migrations/001-relational-schema.js` + `.test.js`). **It is NOT wired into the
running app.** No client machine is affected until we review this and do the
integration in a focused session with GUI QA.

---

## The problem (from the audit)

Today every table is `(id TEXT, data TEXT)` — the whole record is a JSON blob.
`dbAll()` is called only twice and **never with a `WHERE`**, there are **no
indexes**, and the `VIRTUAL` columns + `db:all` whitelist machinery are dead.
So the app pays better-sqlite3's cost but gets none of SQLite's benefits.

Mushtaq's §4 decision: **add a real relational schema + indexes**, with a
**tested, lossless migration** of every client's existing blob data.

## The approach: hybrid "search columns + document blob"

Each promoted table keeps the **full record verbatim in a `data` JSON column**
*and* promotes the fields the UI actually filters/searches to **real, typed,
INDEXED columns**.

Why this over full normalisation:

- **Provably lossless.** The `data` column stores exactly what the blob stored
  today (`JSON.stringify(record)`), so nothing a record holds can be dropped —
  losslessness is guaranteed by construction, not by enumerating every field of
  14 evolving entities.
- **Fixes the actual finding.** Indexed columns let `dbAll()` finally use
  `WHERE status=?`, `WHERE studentId=?`, etc. — the audit's real complaint.
- **Low blast radius.** The read path barely changes: `SELECT data FROM t`
  still returns whole records; filtered reads add a `WHERE` on an indexed
  column. No rewrite of every module's read/write.
- **Incremental.** More columns/tables can be promoted later without another
  data migration (they're derived from `data`).

Full 3NF normalisation (separate rows for `extraCharges`, `studentIds`, etc.)
was rejected for now: high risk, forces rewriting every read/write, and buys
little for a single-user desktop app with hundreds of students.

## Schema

**Promoted tables** (typed indexed columns + `data` blob):

| Table | Promoted columns (indexed *) | Kept in `data` |
|---|---|---|
| `students` | name*, phone, cnic, roomId*, status*, joinDate, rent | everything else (fatherName, email, deposit, docs, …) |
| `payments` | studentId*, roomId, status*, month*, date, amount, unpaid | extraCharges, concession, method, notes, … |
| `rooms` | number*, floor*, typeId, rent | studentIds, amenities, notes |
| `expenses` | category*, date*, amount | description |

**Blob-only tables** (unchanged `(id, data)`, still lossless — low volume /
rarely filtered): `cancellations`, `maintenance`, `complaints`, `checkinlog`,
`notices`, `fines`, `activitylog`, `inspections`, `billsplits`, `transfers`,
`archive`. Promoting these is a later follow-up, not required by the audit.

`settings` (key/value) is unchanged. A new `schema_meta(key,value)` row records
`version` for idempotency.

## Migration behaviour

`migrateDatabase(db)` (better-sqlite3 handle):

- **Transactional** — the whole rebuild runs in one `db.transaction`, so a
  failure rolls back and leaves the original data untouched.
- **Idempotent + versioned** — records `schema_meta.version`; a second run is a
  no-op.
- **Lossless** — for each existing `(id, data)` row it re-inserts the same
  `data` blob and derives the promoted columns via the shared `promoteRecord()`
  transform (missing fields → `NULL` column, value stays in `data`).
- **Coercion** — `REAL` columns take finite numbers or `NULL` (so `rent: 0`
  stays `0`, `rent: undefined` → `NULL`); `TEXT` takes strings as-is.

## Verification (already run in this prototype)

- **Unit (Node):** `node migrations/001-relational-schema.test.js` — 6/6 green.
  Lossless round-trip across all 14 collections (unicode, nested arrays, quotes,
  nulls, missing fields), column coercion, blob-only shape, DDL correctness.
- **End-to-end (Electron):** seeded an old-schema blob DB, ran the real
  migration, and asserted: row counts preserved, every `data` blob reconstructs
  to the original record, promoted columns populated (incl. `NULL` for missing
  `rent`), indexed `WHERE` queries return correct rows, `EXPLAIN QUERY PLAN`
  shows `SEARCH students USING INDEX idx_students_status`, and a second run is a
  no-op.

## NOT done yet (needs the focused session + your review)

1. **Wire `migrateDatabase()` into `main.js` `initDatabase()`** so it runs once
   on boot after opening `hostix.db` (guarded by `schema_meta.version`).
2. **Back up before migrating** — copy `hostix.db` → `hostix.db.pre-v1.bak` on
   the client before the first migration runs (extra safety net beyond the
   transaction).
3. **Add `WHERE`-based reads** — convert the hot `dbAll()` paths to filtered
   queries (e.g. payments by month, students by status) to actually cash in the
   indexes. Optional; the schema supports it immediately.
4. **Test against a real client DB structure** — run the migration against a
   *copy* of an actual `hostix.db` (never the live file) and confirm counts +
   round-trip before shipping.
5. **Full manual QA** after wiring — the app must read/write/search identically.
