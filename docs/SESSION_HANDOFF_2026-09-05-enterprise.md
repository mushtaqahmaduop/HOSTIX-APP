# Handoff — v2 master spec adopted, Phase A closed, Phase B mostly built

**Date:** 2026-09-05 · **Branch:** `feature/dashboard-1c`
**Commits:** `837325c`, `68af843`, `f2feaf0`, `c63ff5f`, `53cc78f`, `5eae31b`, `0e1d450`
**Spec:** `C:\Users\PCS\Downloads\HOSTYLLO_OFFLINE_ENTERPRISE_PRODUCTION_MASTER_SPEC_v2.md`
**Gate:** Playwright **94 passed / 2 skipped / 0 failed** (41 spec files, batched) ·
node suites **203 passed / 0 failed** · typecheck **0 errors**

---

## 1. Read this first

`docs/ENTERPRISE_LIVE_STATUS.md` is the authoritative state document (spec §31).
It did not exist before today, which means §28's claim that Phase A was already
underway was **not true** — this session started it.

That file, not this one, is the thing to keep current. This handoff is the
narrative; that one is the contract.

---

## 2. What the v2 spec changed

v2 replaces the old 13-phase programme with **Phase A–I** and says plainly:
*continuation and reconciliation, NOT a restart*. The old Phase 0→12 sequence is
now reference architecture.

**Three of v2's premises are stale**, and they are recorded rather than obeyed:

| v2 says | Actually |
|---|---|
| §24 "the currently EOL Electron runtime" | Electron is **43.4.0**. That upgrade already happened. |
| §23 implies strict CSP is missing | It exists, with a documented `'unsafe-inline'` exception and the escaping sweep as its compensating control. |
| §25 "Light mode only … no dark mode" | **Overruled by the owner, 2026-09-05.** See below. |

v2 was written from the same brief as v1 and inherits its blind spots. **Audit
it, do not obey it.**

### The §25 ruling

The owner's decision: **keep both themes, amend the spec, not the code.**

Removing dark mode would reverse `bee7c1b`, `d3229fb` and `1cbfd18` and retire
`tests/theme-parity.spec.js` — the test that exists because light mode once
silently inherited dark values at 3.77:1 contrast. §25's other clauses (royal
blue primary, no neon, dense) already hold.

**Do not re-raise this as a gap.** It is settled.

---

## 3. Phase A — complete

Every spec section reconciled against the real tree, including the full 21-row
§27 failure matrix. Four release blockers found, three defects named.

### Release blockers

1. **The installer is unsigned.** `build.win` sets `verifyUpdateCodeSignature:
   false` *and* `signAndEditExecutable: false`, with no certificate configured.
   This single fact kills §27's unsigned-artifact and signature-mismatch rows
   and the §33 "signed release" gate. **Everything still MISSING in the matrix
   is downstream of this.**
2. **42 demo rooms seed into production onboarding.** `modals.js:243` calls
   `generateRooms()` (`dashboard.js:207-232`) whenever the room set is empty —
   42 invented rooms across 4 floors, no dev-only guard. Direct §10 violation. A
   new paying customer's first sight of the product is rooms they do not have.
3. `license.hostyllo.com` still does not resolve — nothing is bakeable.
4. No §26 commercial E2E has ever been run.

### Defects

| | Finding | State |
|---|---|---|
| **D-1** | Payments and Reports disagree on what is outstanding. `payments.js:311` treats a payment with no `unpaid` field as owing **0**; `reports.js:94` and `:488` treat the same record as owing its **full amount**. Same records, two answers, neither hedged. | **OPEN — Phase C, next up** |
| **D-2** | Backup validation was renderer-side only. | **FIXED** (`5eae31b`) |
| **D-3** | `_assertWritable` guards four handlers but not `db:setSetting`, so a suspended install can still mutate configuration — which §18 blocks by name. | **OPEN — Phase D, one line** |

D-1 is not hypothetical: the Phase 0 fixture `edge-money.db` already encodes
`m_legacy_no_unpaid` because records without `unpaid` exist in the field.

---

## 4. Phase B — three of four items closed

### `5eae31b` — the backup boundary

`_validateBackupPayload()` now runs inside `db:importFull` before a single
`DELETE`. It is a deliberate **duplicate** of the renderer's `validateBackup()`,
not a refactor: the renderer's copy explains itself to the user in the restore
dialog; this one is the copy that cannot be skipped. Keep them agreeing on what
is valid and let them differ on what they do about it.

It catches a case the old handler could not: a valid JSON document naming none
of our tables passed `Array.isArray` on every key and emptied all fifteen.

**Pre-restore snapshot** via `VACUUM INTO`. Timestamped **with milliseconds**,
newest three kept. Two traps behind that:

- A single fixed filename means the second restore captures the first restore's
  bad state on top of the good one — so noticing a bad restore one step too late
  leaves nothing to go back to.
- Second-granularity was not enough. `VACUUM INTO` refuses to overwrite, so two
  restores inside one second lost the second snapshot and returned a reason
  nobody would read.

`BACKUP_TABLES` replaces the 15-table list that was written out twice.

### `0e1d450` — §17 recovery

The full chain: detect → stop writing → recovery screen → verified backup →
restore to a temporary DB → integrity checks → atomic switch → restart.

**Two real bugs came out of this, and both would have reached customers:**

1. A corrupt database was an **unhandled crash**. `initDatabase()` was called
   bare inside `app.whenReady()`, so `new Database()` throwing took the whole
   boot with it — no window, no message, and no way to tell a broken file from a
   broken app while the data sat intact in a backup beside it.
2. `new Database()` can **succeed** on a damaged file and fail a moment later on
   the first pragma. Dropping the reference without `close()` leaks the handle,
   and **on Windows an open file cannot be renamed** — so recovery failed with
   `EBUSY` at the exact moment it was needed. Only the test caught this.

Design notes that will look like preferences and are not:

- `PRAGMA integrity_check` runs **before** the `CREATE TABLE` block, because that
  block is a write and running it on a damaged file is how a recoverable problem
  becomes an unrecoverable one.
- `integrity_check`, not `quick_check` — the latter skips the index-vs-table
  pass, which is exactly the damage a half-written page leaves.
- Restore **beside** the live file, verify, then swap. Writing straight over the
  original destroys the evidence before producing a replacement.
- `_verifySnapshot` checks structure as well as integrity: an intact file with
  someone else's schema passes `integrity_check` and still leaves the app broken.
- The damaged file is renamed to `.corrupt-<stamp>.bak`, **never deleted**.
- Stale `-wal`/`-shm` are removed first — they belong to the old database and
  would be replayed over the new one.
- `recovery:restore` and `recovery:restart` are **two** calls. Restarting inside
  the restore means the only way to check the swap is to watch an app disappear.

`db:setSetting` gained the **health** guard only. The licence gate on it is D-3
and belongs to Phase D, which owns the specs that would have to prove it.

### Still open in Phase B

- §27's **"unknown schema → safe recovery"** row — unassessed.
- **Disk-full is classified but never tested against a genuinely full disk.**
  `_classifyWriteError` maps `DISK_FULL` / `PERMISSION_DENIED` / `DB_CORRUPT` /
  `IO_ERROR` with actionable sentences, but the mapping is proven by inspection
  only, so those §27 rows stay PARTIAL.

---

## 5. Running the tests — two traps

1. **`HOSTIX_TEST_PROFILE` must point at a directory containing a valid
   `license.enc`**, or `tests/_profile.js:27` throws. Without it every spec dies
   30s later on `#login-input` looking like a boot regression. A working profile
   is at `%LOCALAPPDATA%\Temp\hostix-test-profile` (licence copied from
   `.devdata`, same machine so the binding holds).

2. **The whole suite in one command exhausts memory on this machine.** It reached
   19 passed and the worker died with `code=3221225794`
   (`STATUS_DLL_INIT_FAILED`), which Playwright reported as **32 failed** — every
   one a cascade, not an assertion. **Run 6–8 spec files per invocation.** A red
   naming almost every spec at once is this, not a real break.

Also: a spec file that launches Electron per-test goes flaky. `backup-main-guard`
failed 2 of 4 that way while each passed alone — the `titlebar-keyboard` pattern
from 2026-09-04. One shared instance plus
`test.describe.configure({ mode: 'serial' })` took it from 1.3 min to 11s.

### The two skipped tests are environment-gated, not broken

| Spec | Line | Why |
|---|---|---|
| `control-plane-sync.spec.js` | 91 | `test.skip(!CAN_RUN, …)` — needs `CONTROL_PLANE_URL`, `CP_ADMIN_EMAIL`, `CP_ADMIN_PASSWORD` |
| `settings-is-source.spec.js` | 18 | `test.skip(!PROFILE, …)` — needs `HOSTIX_REAL_PROFILE`, **deliberately opt-in** because it reads the real install |

---

## 6. Working tree

**Four files are uncommitted, in-flight design work, and are PROTECTED by spec
§2. They were not touched at any point this session** — every commit staged by
explicit path, never `git add -A`:

- `renderer/chrome.css`
- `renderer/src/modules/students.js`
- `renderer/students.css`
- `renderer/style.css`

Do not stash, switch branches, or `git add -A` under the owner.

---

## 7. Next

1. Close the last of Phase B — the unknown-schema row, and a real disk-full test.
2. **Phase C opens on D-1.** The fix direction: one `outstandingOf(payment)`
   helper beside `resolveCharges()` in `utils.js`, the fallback decided once and
   deliberately, both call sites routed through it.
3. Then D-3 (Phase D), the §22 diagnostic bundle (still entirely absent), and
   the code-signing decision that unblocks every remaining MISSING matrix row.
