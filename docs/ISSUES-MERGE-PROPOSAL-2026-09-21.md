# One issues register, one table — schema proposal

**Not built. Nothing here is applied.** Owner's decisions, 2026-09-21: one
register for all; "Maintenance" becomes a value in the Category dropdown;
MA-/CO- reference numbers stay; the two tables merge into one.

Put in front of you first because it is a **schema change on 50+ live installs**,
and the last schema I moved on without review was reverted.

---

## 1. What is already true

More of this exists than you may expect:

- The rail has **one** entry already — `index.html:612`, "Complaints",
  → the `issues` page.
- `_issAll()` in `issues.js` already normalises both collections onto one shape.
  The register, the filters, the counters, the stat strip and both exports all
  read that single list.
- `issuesTab` already accepts `'all'`, and that is the default on the `issues`
  route.

So the single register is mostly a matter of **removing** things: the three-tab
strip (`issues.js:471`) and the Maintenance/Complaint switcher on the Add form
(`issues.js:993`).

## 2. Two corrections to what I told you earlier

- **`cost` is not captured.** `_issAll()` reads `cost: Number(x.cost)||0` and
  nothing ever writes it — there is no field on either form and no line in
  `saveIssue()`. Every record's cost is 0 and always has been. So cost is not a
  reason to keep two forms; it is a field to either build properly or drop. My
  earlier "you'd lose the cost" was wrong.
- **`location` is captured and used**; that one is real (maintenance only).

## 3. The merged record

One table `issues`, same `(id TEXT PRIMARY KEY, data TEXT NOT NULL)` shape both
collections use today. **Every field below already exists** on one side or the
other — nothing is invented, nothing is dropped.

| Field | From | Notes |
|---|---|---|
| `id` | both, unchanged | keeps its `mt_`/`cp_` prefix. **Never regenerated** — the activity log and any open modal reference it |
| `kind` | derived | `'maintenance'` or `'complaint'`. This is what MA-/CO- reads |
| `seq` | both, unchanged | per-kind, so MA-0007 stays MA-0007 |
| `title` | `title` / `subject` | one name for one thing |
| `description` | both | |
| `category` | both | now includes `Maintenance` |
| `priority` | both | |
| `status` | both | see the open question below |
| `date` `expectedDate` `resolvedDate` | both | |
| `assignedTo` | both | |
| `roomId` | maintenance | a complaint's room is still derived from its student, never stored |
| `studentId` | complaint | the resident who filed it |
| `raisedById` `raisedBy` | maintenance | the resident or the free-text name who reported it |
| `location` | maintenance | |
| `response` | complaint | |
| `cost` | maintenance | carried across so nothing is lost, still unwritten |

**`studentId` and `raisedById` are deliberately NOT folded into one field.**
They mean nearly the same thing and folding them would be tidier, but it is a
semantic merge that cannot be undone, and `_issAll()` already reads them apart.
A migration that only moves rows can be re-run; one that also reinterprets them
cannot.

## 4. The migration

`migrations/003-issues-merge.js`, `SCHEMA_VERSION` 1 → 2.

- **Copy, do not move.** The `maintenance` and `complaints` tables stay in place
  and populated for one full release. That is the rollback path, and it costs a
  few kilobytes.
- `hostix.db.pre-v2.bak` written before it runs, the way `pre-v1.bak` already is.
- Runs inside the existing transaction, and is a no-op on a database already at
  v2.
- The record count in must equal the count out, or it rolls back.

### The one-way door, stated plainly

`migrateDatabase()` **refuses to open a database newer than the build
understands** (`main.js:290`) — deliberately, so an older app cannot quietly
half-read a newer file. Once a client's database is at v2, **the previous
installer can no longer open it.** If a release has to be pulled after this
ships, those hostels need their `.pre-v2.bak` restored by hand.

That is the real cost of merging the tables, and it buys nothing the warden can
see — the screen already reads both as one list. It is worth it only if the
tidier storage is worth that exposure to you.

### Backups taken before the merge

`restoreBackup()` accepts a file with `maintenance` and `complaints` keys and no
`issues` key. It must run the same merge on the way in, or restoring last
month's backup silently empties the register. `BACKUP_COLLECTIONS`
(`utils.js:1288`) gains `issues` and keeps the other two for exactly this.

## 5. Everything that has to change with it

13 read sites across 7 files: `issues.js` (19 references), `settings.js` (8),
`dashboard.js` (6), `nav.js` (3), `backup-page.js` (3), `reports.js` (1),
`utils.js` (1). Plus `main.js:48` and `:327`, `storage.js:26`, `config.js:113`.

**A dead writer to delete:** `saveMaintenance()` and `saveComplaint()` in
`settings.js:15-40` push straight into `DB.maintenance` / `DB.complaints` and
have **no callers** — they survived the dead-function sweep. Left in place they
would write to a retired table.

## 6. Decisions still needed

1. **The middle status.** A complaint goes `Open → UnderReview → Resolved`; a
   maintenance job goes `Open → InProgress → Resolved`. `_issBucket()` already
   collapses them into one "In Progress" counter. One register with one form
   should have one word. Migrating `UnderReview` → `InProgress` touches existing
   records; keeping both means the dropdown offers two words for one state.
2. **`cost`** — build the field properly on the form, or drop it?
3. **The one-way door** — accept it, or keep the two tables and take only the
   single register and single form (which is all the warden sees either way)?
