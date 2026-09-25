# One issues register, one table — what was built

**Owner's decisions, 2026-09-21:** one register for maintenance and complaints;
"Maintenance" becomes a value in the Category dropdown; MA-/CO- reference
numbers stay; the two tables merge into one; "In Progress" is the one word for
the middle state; the phantom `cost` field goes.

Supersedes `ISSUES-MERGE-PROPOSAL-2026-09-21.md`, which was the schema put up
for review before any of this was written.

---

## The shape of it

`DB.issues` is the one collection. A record carries `kind` — `'maintenance'` or
`'complaint'` — and that is what the reference number reads: MA-#### or CO-####,
two independent series, both continuing exactly where they were.

**The category decides the kind, but only once.** A new record filed under
Maintenance is a job; anything else is a complaint. An EXISTING record keeps the
kind it was created with, because the kind is what numbers it — re-categorising
CO-0012 must not silently reissue it as MA-0034 on a sheet somebody has printed.

## What the warden sees

- **One list.** The three-tab strip (All issues / Maintenance / Complaints) is
  gone. The toolbar's Category filter is what narrows the register now.
- **One form.** The Maintenance/Complaint switcher is gone. It is the
  *maintenance* form that survived, because it was the superset — the complaint
  form asked for nothing this does not, while this asks for Location.
- **"Raised by: Student / Staff" stays**, and it is NOT the old switcher. It
  answers *who reported this*, not *which register this is*. The complaint form
  required a student; a burst pipe reported by the cook has none, and without
  that switch a whole class of record would be unloggable.
- Both dashboard alerts and both Needs Action rows survive as separate counts —
  "3 open maintenance jobs" and "2 unresolved complaints" are different things
  to a warden — but both now open the same page.

## Two rules that look like inconsistencies and are not

**The two kinds derive their room differently.** A complaint's room is wherever
its student lives *now*, derived on read. A maintenance ticket's room is where
the *fault* is, and it is stored: a leaking tap in room 12 is still in room 12
after the student who reported it moves to 15. Merging these into one expression
looks tidier and quietly gives every student-raised ticket the wrong room the
day that student moves. `issues.js` says so at the line.

**`studentId` and `raisedById` are still two fields.** They mean nearly the same
thing and folding them would be tidier, but a migration that only moves rows can
be re-run and one that reinterprets them cannot.

## The migration

`migrations/003-issues-merge.js`, schema v1 → v2.

- **Copies, does not move.** `maintenance` and `complaints` stay populated as the
  rollback path for one release. Nothing reads them.
- `hostix.db.pre-v2.bak` written first, on its own doorstep — `pre-v1.bak`
  predates everything since and is not the file anyone would want back.
- Three named changes and nothing else: `kind` stamped, `subject` → `title`,
  `UnderReview` → `InProgress`. It starts from a copy of the whole record, so a
  field nobody listed still survives.
- **`seq` is stamped when absent**, from the record's position in its original
  collection. That is the last moment the original order is knowable — records
  written before `seq` existed fell back to it for their number, and after the
  merge there is no such position. Without this every one of them renumbers.
- Idempotent: returns early at or beyond v2.

**The transform lives in `renderer/src/utils.js`, not in the migration.** A
restored backup written before the merge has to be folded by the RENDERER too
(`_initDBFields`), or the register comes back empty with the records sitting in
the file, unread. Two implementations of one data migration will disagree.

That fold is recorded in `settings.issuesMergedAt` and runs once per database.
The flag is load-bearing, not tidy: the legacy arrays are deliberately left
populated, so without it every launch would fold them again and an issue the
warden **deleted would come back**.

### The one-way door

`main.js` refuses to open a database newer than the build understands. Once a
hostel is at v2, **the previous installer cannot open their database.** If this
release is pulled, those machines need `hostix.db.pre-v2.bak` restored by hand.
Accepted by the owner with that stated.

## Also done, and worth knowing

- **`cost` is gone from the code.** It was read by `_issAll()` and written by
  nothing — no form field, no line in `saveIssue()` — so every record's cost was
  0 and always had been. The migration does not touch the data; there was never
  any to touch.
- **A legacy record with no priority now prints a dash instead of "Medium".**
  The old maintenance branch invented that default on read. Nothing in the field
  is affected (the form has always set one), and inventing a value nobody typed
  is the rule CLAUDE.md states outright.
- **`saveMaintenance()` and `saveComplaint()` in `settings.js` are deleted.**
  They pushed straight into the old collections and had no callers — they
  outlived the 2026-09-08 redesign and the dead-function sweep missed them. Left
  in place they would have become live damage rather than clutter.
- **`raisedById` is now remapped with `studentId`** when student ids are
  renumbered (`utils.js`). It never was, because maintenance was not in that
  table list at all; now that both kinds share a collection, missing it would
  point every "raised by" at whoever inherits the code.

## Verification

| | |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run test:migrate` | 21 passed (14 transform + 7 backup-fold) |
| `test:services` / `test:license` / `test:retention` / `test:export` / `test:update` | 146 / 39 / 13 / 67 / 9 |
| `issues-register.spec.js` | 6 passed, including the two new merge tests |
| `dashboard-cards`, `toolbar-shared`, `html-escaping`, `backup-page` | 19 passed |
| `permissions.spec.js` | 7 passed |
| `dashboard-lower`, `dashboard-wiring`, `rail-reach`, `reports-page` | passed |

**The SQLite half was run for real**, under Electron's node mode against a copy
of the dev database: v1 → v2, records copied, kinds stamped, MA-/CO- numbering
preserved across seq-less records, `UnderReview` → `InProgress`, `subject`
renamed, response and student links intact, source tables kept, and a second run
a no-op.

Four spec files carried fixtures that seeded the old collections directly —
`dashboard-cards`, `permissions`, `toolbar-shared` and `issues-register`. They
seed `DB.issues` now. That is the class of failure this merge causes everywhere:
not a crash, an empty list.
