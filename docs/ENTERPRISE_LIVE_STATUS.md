# Enterprise Live Status

**Spec:** `HOSTYLLO_OFFLINE_ENTERPRISE_PRODUCTION_MASTER_SPEC_v2.md` (v2.0)
**Reconciled:** 2026-09-05
**Branch:** `feature/dashboard-1c` — 38 commits ahead of `master`, 0 behind (it is the tip)
**App version:** 5.0.0 · Electron 43.4.0

> **How to read this.** Phase A reconciled every section of the spec against the
> real tree; Phase B then closed the data-safety gaps it found. Anything not
> stated here is not implied to pass.
>
> Three defects were found. **D-2 is fixed** (Phase B). **D-1** (Phase C) and
> **D-3** (Phase D) are recorded and deliberately not fixed — §32.2 says inspect
> before changing, and both need specs run against them that belong to their own
> phase.

---

## Current Phase

**Phase B — Remaining Data Safety — SUBSTANTIALLY COMPLETE.** Three of its four
items are closed: **D-2** (validation moved to the main process), the
**pre-restore backup**, and the whole **§17 recovery chain**. Remaining: §27's
"unknown schema → safe recovery", and an end-to-end disk-full test.

**Next is Phase C (Remaining Financial Gaps)**, which opens on **D-1**.

**Phase A — Live-State Reconciliation — COMPLETE.** Spec §28 was correct that
implementation is well advanced; it was *not* correct that Phase A had begun —
this file did not exist before today.

Every Phase A section is reconciled, including the full §27 failure matrix.

Phases C–I have not started, and nothing in §29/§33 has been signed off.

---

## Verified

Executed on this tip, 2026-09-05: **203 passed, 0 failed** across seven node
suites, plus a clean typecheck. Full results in *Tests Executed* below. Only
what those suites actually assert is promoted here.

| § | Requirement | Executed evidence |
|---|---|---|
| 8 | Licence integrity — machine binding, tamper rejection, device limits, reinstall | `npm run test:license` — **39/39**. |
| 8 | A degraded machine-ID probe cannot fake a licence failure *or* rescue a real one | `npm run test:activation` — **6/6**, including "a degraded reading is never recorded", "once recorded, the same missing fact is substituted and the id holds", and "a genuinely different machine is not rescued by substitution". This closes the `getMachineId()` fragility where three `wmic` calls timing out could read a valid licence as TAMPERED. |
| 14 | `resolveCharges()` is the charge authority, and the service model cannot move an existing install's billing | `npm run test:servicemodel` — **16/16**, including "a pinned student keeps their own rent under every model" and "a pinned mess is still refused by a rent-only hostel". |
| 15 | A migration preserves unknown fields | `npm run test:migrate` — **6/6**: "missing fields → null column, still preserved in data blob". This is 1 of §15's 12 required properties — see Partial. |
| 21 | The update check degrades safely | `npm run test:update` — **8/8**: a malformed feed does not throw out of the click handler, URL-hostile characters are encoded, and an empty feed falls back to the releases page. This is the §2 "already up to date" correction, still present and still passing. |
| 16 | Archive/retention pruning preserves records | `npm run test:retention` — **13/13**, including "an existing archive is appended to, not replaced". |
| 11 | Connectivity/device/entitlement probe behaviour | `npm run test:services` — **115/115**, including "a probe falls back to a second mechanism before giving up" and "a first-ever boot with a failing probe is reported, not hidden". |

| 16 | Restore refuses a bad document at the privileged handler, and snapshots before it commits | `tests/backup-main-guard.spec.js` — **4/4**, calling `dbImportFull()` directly rather than through the renderer. |
| 17 | The whole corruption-recovery chain | `tests/db-recovery.spec.js` — **6/6**: detection, writes refused, verified restore, atomic switch, the damaged file kept, the app healthy afterwards, and a damaged backup refused without touching the live database. |

Everything else in this document remains unverified.

---

## Implemented but Unverified

| § | Requirement | Evidence |
|---|---|---|
| 8 | Client contains **no private signing material** — asymmetric verification is real | `services/entitlement-keys.js` ships a `KEYS` map of Ed25519 **public** keys only (`ent-20260819`); verification goes by the token's `kid`, not a constant. Private keys are documented as living in the control plane's secret store. |
| 8 | `keygen.js` / `keygen.html` cannot reach a customer machine | `package.json` `build.files` explicitly excludes `!keygen.js`, `!keygen.html`, `!test-license.js`. Satisfies the §29 gate "client cannot manufacture licences" **at the packaging layer** — needs a built-artifact check to close. |
| 21 | Auto-install is not promised | `main.js:143-144` sets `autoDownload = false` and `autoInstallOnAppQuit = false`; install is user-initiated (`main.js:1332`). |
| 23 | Electron security baseline | `contextIsolation: true` / `nodeIntegration: false` on **all four** BrowserWindows (`main.js:625, 792, 1100, 1143`); `webSecurity: true` at `:795`. |
| 15 | Pre-migration backup exists | `main.js:115` writes a snapshot before migrating. |
| 7 | Control-plane bootstrap holds no secrets and does not block local work | `services/config.js` `DEFAULT_API_BASE` is deliberately empty; every field install resolves `apiBase` to `null` and makes no network calls. |
| 11 | **No ordinary business operation depends on an API call** | The strongest result in this pass. A sweep of all 18 business modules in `renderer/src/modules/` for `fetch(`, `XMLHttpRequest` and any `api-client` reference returns **zero hits**. `services/api-client.js` is reachable only from `connectivity.js`, `device.js`, `entitlement.js` and `services/index.js` — the entitlement layer alone. The offline architecture §11 asks for is real and structural, not incidental. |
| 20 | Revocation is data-preserving | No `REVOKED → delete` path exists. Nothing in the licence or enforcement code deletes, moves or truncates the database. |
| 16 | Restore rolls back cleanly on interruption | `db:importFull` (`main.js:1478`) wraps all 15 table replacements in a single `db.transaction()`. |

---

## Partial

| § | Requirement | What exists / what is missing |
|---|---|---|
| 23 | "Strict CSP" | A CSP **is** enforced (`main.js:1533`, plus per-page meta in `renderer/license.html` and `renderer/license-settings.html`), but it carries `script-src 'unsafe-inline'`. This is a *documented, deliberate* decision (comment at `main.js:1525-1532`): the UI is built from inline `onclick`/`oninput` handlers across every module, and the escaping sweep is the compensating control. It is defensible — but it is not "strict CSP" as §23 words it, and the spec should be reconciled to the decision rather than the code to the spec. |
| 13 | Typed IPC operations | **8 of 24** `ipcMain.handle` registrations are the generic primitives §13 names as migration targets: `db:all` (1377), `db:upsert` (1415), `db:delete` (1424), `db:bulkReplace` (1433), `db:getSetting` (1446), `db:setSetting` (1453), `db:exportFull` (1461), `db:importFull` (1478). None of the typed operations (`students.create`, `payments.create`, …) exist yet. §13 itself says *do not* big-bang this — so it is a sequenced backlog item, not a defect. |
| 14 | One authoritative financial layer | **Half true.** `resolveCharges()` (`renderer/src/utils.js:235`) *is* a real single authority for charge derivation — rent/mess resolution, override precedence, the service-model rule — with 36 call sites across `archive.js` (5), `payments.js` (11), `students.js` (15), `config.js` (1), `utils.js` (4). But **`reports.js` calls it zero times** and recomputes every figure inline (~10 independent `reduce` expressions). §14's "reports must reconcile against the same financial authority" therefore fails, and it fails concretely — see **D-1** below. §14's named operations `applyPayment()`, `reversePayment()` and `calculateRefund()` do not exist in any form: reversal exists only as a *cancellation status* (`cancellations.js:129,145`), refund not at all. |
| 14 | Money representation | Money is JS `Number` — IEEE-754 binary floating point — which §14 explicitly rules out. In practice PKR is billed in whole rupees so the exposure is small, but no canonical representation, precision or rounding policy is defined anywhere. The only `Math.round` on a money path is a half-payment split (`payments.js:2244`); the rest round percentages. Rounding boundaries are untested. |
| 16 | Restore is safe against a bad file | The protections exist and are genuinely tested — `tests/backup-hostile-input.spec.js` asserts every malformed or hostile shape is **refused with a reason** (:98-100), that a refused import leaves the live data **byte-identical** (:145), that `Object.prototype` is not polluted (:149), and that a genuine backup is still accepted (:103). `db:importFull` is wrapped in `db.transaction()`, so an interrupted restore rolls back and §27's "interrupted restore → live DB remains safe" holds. **But every one of those checks lives in the renderer** (`restoreBackup()`, `modals.js:305`). The privileged handler itself validates nothing beyond `Array.isArray` — see **D-2**. |
| 17 | Disk full → no false success | Handled, with genuinely actionable messages for `ENOSPC` / `EACCES` / `EPERM` / `ENOENT` — but **only on the PDF path** (`main.js:1119-1125`). The database write path has no equivalent, which is where §17 actually points. |
| 18 | Read-only blocks writes at the IPC layer | Enforced in the **main process**, not merely by greying out buttons — which is the stronger of the two and worth recording as a pass. `_assertWritable()` (`main.js:1403`) guards `db:upsert` (:1418), `db:delete` (:1427), `db:bulkReplace` (:1436) and `db:importFull` (:1479). **One hole — see D-3.** |
| 22 | Centralized redaction | Real machinery exists: `services/redact.js` provides `isSensitiveKey`, `redactPaths`, `redactString`, `redactMachineId`, a recursive `walk` and a top-level `redact`. Not yet checked against §22's 13 required support fields or its 8-file diagnostic bundle. |

---

## Missing

| § | Requirement | Finding |
|---|---|---|
| 10 | **"No fake/demo customer data may be silently seeded into production onboarding."** | Violated. `renderer/src/modules/modals.js:243` seeds rooms whenever the set is empty, calling `generateRooms()` (`renderer/src/modules/dashboard.js:207-232`), which invents **42 rooms across 4 floors** with amenities `['Fan','Bed','Wardrobe']`. There is no dev-only guard on that path. A new paying customer's first sight of the product is 42 rooms they do not have. |
| 21 / 29 | **Signed production installer** | Not signed. `package.json` `build.win` sets `verifyUpdateCodeSignature: false` **and** `signAndEditExecutable: false`, and there is no certificate configuration. Every shipped installer and every update artifact is unsigned, so §27's "unsigned artifact → release blocked" and "signature mismatch → update rejected" rows cannot hold. |
| 21 | **Pre-update DB backup** | A pre-*migration* backup exists (`main.js:115`); no pre-*update* backup was found. §21 and the §29 Updates gate both require one before installation. |
| 31 | Live status document | Was missing. This file closes it. |
| 16 | ~~**Pre-restore backup**~~ | **CLOSED, Phase B.** `_preRestoreSnapshot()` now runs before the transaction, using the same `VACUUM INTO` idiom as the pre-migration backup. Snapshots are **timestamped and the newest three kept**, not written to one fixed name — a fixed name means the second restore captures the first restore's bad state on top of the good one, which breaks §16's "never overwrite the only known-good copy" exactly when it matters. A snapshot failure does not block the restore (that would strand a customer with a full disk on the database they are escaping); the reason is returned instead. Proved by `tests/backup-main-guard.spec.js`. |
| 16 | Scheduled local backup | §16 requires four backup types (scheduled local, manual export, pre-migration, pre-restore). Only two exist: manual export (`db:exportFull`) and pre-migration (`main.js:115`). No scheduler was found. |
| 17 | ~~DB corruption detection and recovery~~ | **CLOSED, Phase B.** The whole §17 chain now exists — see below. |
| 14 | Financial test matrix | §14 names 15 required cases (exact, partial, overpayment, multiple months, concessions, extras, cancellation, checkout, reversal, refund, zero, invalid/negative, large amounts, rounding boundaries). Reversal and refund have no implementation to test; rounding boundaries and large amounts have no policy to test against. |

---

## §22 — support and diagnostics

| Element | Status | Detail |
|---|---|---|
| Diagnostic bundle | **MISSING** | No `createDiagnosticsBundle` exists, and none of §22's eight files (`diagnostics.json`, `app.log`, `error.log`, `environment.json`, `license-status.json`, `db-health.json`, `migration-status.json`, `update-status.json`) is produced. |
| Support ID | **MISSING** | Nothing generates or displays one. §5 lists it as part of what the customer receives. |
| The 13 support fields | **PARTIAL — 4 of 13** | The Connection panel reports Internet, Hostyllo API, License and Application state (`tests/connection-panel.spec.js:91-94`, which also asserts the panel makes no network requests). Absent: app version, OS, architecture, schema version, DB health, truncated machine identifier, backup health, update health, support ID. |
| Logging substrate | **IMPLEMENTED-UNVERIFIED** | `services/logger.js` is a real rotating file logger — levels, 7-file retention, 5 MB rotation — with `redact` and `redactString` imported at `:29`, so redaction is wired into the log path rather than bolted on. |
| Centralized redaction | **IMPLEMENTED-UNVERIFIED** | `services/redact.js` is substantial and clearly considered. But §22 forbids exposing licence keys and CNICs specifically, and **no test feeds it either one**. |

> **Trap worth recording.** `tests/diag.spec.js` reads like diagnostics coverage
> and is not — its only test is `diagnose account menu`, a UI check. Do not
> count it as §22 evidence.

---

## §27 — failure matrix, row by row

| Failure | Required result | Status |
|---|---|---|
| Internet unavailable | Local operations continue | IMPLEMENTED-UNVERIFIED — structural, see §11 |
| DNS failure | Backoff; no data loss | IMPLEMENTED-UNVERIFIED |
| API 500 | Preserve cached entitlement | **PARTIAL** — this fired for real on 2026-09-04. A POST without an idempotency key is deliberately non-retryable, so `willRetry` was `false`; it survived only because `DeviceService` happened to retry on its next tick. Recovery is incidental, not designed. |
| Timeout | Backoff | IMPLEMENTED-UNVERIFIED |
| Expired entitlement | Deterministic restricted state | IMPLEMENTED-UNVERIFIED |
| Remote suspension | Enforce after authenticated receipt | IMPLEMENTED-UNVERIFIED — exercised by hand 2026-09-04 |
| Remote revocation | Enforce after authenticated receipt | IMPLEMENTED-UNVERIFIED |
| Wrong machine | Reject | IMPLEMENTED-UNVERIFIED — see the `getMachineId()` fragility note |
| Tampered entitlement | Reject | IMPLEMENTED-UNVERIFIED |
| Disk full | No false success | **PARTIAL** — classified and surfaced on the DB path too, but never tested against a genuinely full disk |
| Permission denied | Actionable failure | **PARTIAL** — classified on the DB path, untested |
| Invalid/corrupt backup | Reject before mutation | **VERIFIED** — main-process guard, `backup-main-guard.spec.js` |
| Interrupted restore | Live DB remains safe | IMPLEMENTED-UNVERIFIED — `db.transaction()` |
| DB corruption | Recovery workflow | **VERIFIED** — `db-recovery.spec.js` 6/6 |
| Migration crash | Transaction/recovery | IMPLEMENTED-UNVERIFIED — pre-migration backup + transactions |
| Update interruption | DB preserved | **MISSING** — no pre-update backup |
| Unsigned artifact | Release blocked | **MISSING** — nothing is signed |
| Signature mismatch | Update rejected | **MISSING** — `verifyUpdateCodeSignature: false` |
| XSS payload | Inert | IMPLEMENTED-UNVERIFIED — escaping sweep + `tests/html-escaping.spec.js` |
| Invalid IPC | Rejected | **PARTIAL** — the backup surface is closed; the other handlers are unaudited |
| Unknown schema | Safe recovery | **NOT ASSESSED** — §15 also requires never auto-downgrading an unsupported schema |

Six of twenty-one rows are now PARTIAL, MISSING or unassessed — down from nine.
The remaining MISSING rows are all downstream of code signing.

---

## §17 recovery — built in Phase B

The chain §17 specifies, end to end:

`detect → stop unsafe writes → recovery screen → verified backup → restore to a temporary DB → integrity checks → atomic switch → restart`

| Step | Where |
|---|---|
| Detect | `_integrityCheck()` runs `PRAGMA integrity_check` in `initDatabase()` **before** the `CREATE TABLE` block, because that block is itself a write and running it against a damaged file is how a recoverable problem becomes an unrecoverable one. `integrity_check`, not `quick_check` — the latter skips the index-vs-table pass, which is exactly the damage a half-written page leaves and exactly what returns silently wrong query results. |
| Stop unsafe writes | `dbHealth` state + `_assertDbWritable()` on every write handler. Reads are never gated: a hostel with a damaged file still needs to look up a student and print what it can. |
| Recovery screen | `renderer/recovery.html`, shown instead of the main window. Self-contained — no token file, no shared stylesheet, no webfont — because it has to render when the rest of the app cannot. |
| Verified backup | `_verifySnapshot()` checks integrity **and** that every expected table is present. An intact file carrying someone else's schema passes `integrity_check` and would still leave the app broken. |
| Restore to a temporary DB | `_recoverFromSnapshot()` copies to `hostix.db.recovery-tmp` first. |
| Integrity checks | The copy is verified *before* it is allowed near the original. |
| Atomic switch | Stale `-wal`/`-shm` removed (they belong to the old database and would be replayed over the new one), original renamed to `hostix.db.corrupt-<stamp>.bak`, temp renamed into place. |
| Restart | `recovery:restart`, deliberately a **separate** call from `recovery:restore` — see the commit message. |

**The damaged file is never deleted.** It holds whatever was written since the
last snapshot and is often still partly readable by hand; deleting it would be
the one irreversible act in an operation that exists to avoid those.

### The bug this found

Before this work, `initDatabase()` was called bare inside `app.whenReady()`, so
a damaged database was an **unhandled crash** — no window, no message, and no
way for a warden to tell a broken file from a broken app while their data sat
intact in a backup one directory listing away.

Writing the tests then found a second, worse one. `new Database()` can succeed
on a damaged file and fail a moment later on the first pragma; the first draft
dropped the reference without closing the handle. On Windows an open file cannot
be renamed, so **recovery failed with `EBUSY` at the exact moment it was needed**
— on the one machine that needed it. `tests/db-recovery.spec.js` caught it. That
is the argument for testing this path rather than reasoning about it.

**`tests/db-recovery.spec.js` — 6/6 passing**, walking the whole chain plus the
case that must not work: a damaged backup is refused and the live database is
left healthy and intact.

### Still open in §17

Disk-full on the **DB write path** is now classified and surfaced
(`_classifyWriteError` → `DISK_FULL`, `PERMISSION_DENIED`, `DB_CORRUPT`,
`IO_ERROR`, each with an actionable sentence, and a full disk flips `dbHealth`
so the next write is refused with guidance rather than failing identically).
What is **not** yet done is an end-to-end test that actually fills a disk — the
mapping is proven by inspection only, so those §27 rows stay PARTIAL.

---

## Defects found during reconciliation

These are concrete, reproducible, and were not previously recorded. They belong
to Phases B/C but were surfaced by Phase A, so they are logged here.

### D-1 — Payments and Reports disagree on what is outstanding

Two screens answer the same question with different arithmetic, on a record
whose `unpaid` field is absent:

| Site | Expression | A legacy record contributes |
|---|---|---|
| `renderer/src/modules/payments.js:311` | `p.unpaid != null ? Number(p.unpaid) : 0` | **0** |
| `renderer/src/modules/reports.js:94` | `p.unpaid != null ? Number(p.unpaid) : Number(p.amount)` | **the full amount** |
| `renderer/src/modules/reports.js:488` | same as `:94` | **the full amount** |

So a hostel carrying pre-`unpaid` Pending payments sees them as **nothing owed**
on the Payments screen and as **fully owed** in Reports. Neither figure is
labelled as an estimate.

This is not hypothetical: the Phase 0 fixture `edge-money.db` already encodes
`m_legacy_no_unpaid` precisely because records without `unpaid` exist in the
field. **Customer-data risk: none** (nothing is written wrongly) — **financial
correctness risk: high**, and §14 places financial correctness second only to
data integrity.

Fix direction: one `outstandingOf(payment)` helper beside `resolveCharges()`,
with the fallback decided once and deliberately, and both call sites routed
through it. Small, contained, and it is the natural first step of Phase C.

### D-2 — Backup validation is renderer-side only — **FIXED, Phase B**

Closed in `main.js`. `_validateBackupPayload()` now runs inside `db:importFull`
before a single `DELETE` executes, refusing with `code: 'INVALID_BACKUP'`. It is
deliberately a *duplicate* of the renderer's `validateBackup()` rather than a
refactor: the renderer's copy explains itself to the user in the restore dialog,
this one is the copy that cannot be skipped.

It also catches a case the old handler could not: a valid JSON document naming
none of our tables ("this file contains no Hostyllo data") previously passed
`Array.isArray` on every key and emptied all fifteen tables.

The 15-table list is now the single `BACKUP_TABLES` constant, consumed by both
`db:exportFull` and `db:importFull`, so the two can no longer drift.

**Proved by `tests/backup-main-guard.spec.js` — 4/4 passing.** It calls
`electronAPI.dbImportFull()` directly, bypassing the renderer check entirely,
which is the thing the pre-existing `backup-hostile-input.spec.js` could not do.

### Original finding

Every guarantee `tests/backup-hostile-input.spec.js` proves is enforced in
`restoreBackup()` (`modals.js:305`), not in the handler. `db:importFull`
(`main.js:1478`) checks `_assertWritable` and then trusts its payload
completely — `Array.isArray(data[t])` is the only shape check. Because
`DELETE FROM <table>` runs unconditionally per table and the insert is
conditional, a payload that merely *omits* a table empties it and commits.

Against §13's "every privileged handler validates all inputs in the main
process", the tested safety net sits on the wrong side of the trust boundary.

Related: the 15-table list is duplicated as a literal in both `db:exportFull`
(`:1462`) and `db:importFull` (`:1481`). They match today; nothing keeps them
matching, and a table added to one but not the other is silently dropped on
every restore.

### D-3 — Read-only does not block configuration changes

`_assertWritable()` guards four handlers but **not `db:setSetting`**
(`main.js:1453`). §18 explicitly lists "configuration mutation" among the
operations a read-only install must block, so a suspended customer can still
change hostel settings. One line to fix; recorded rather than fixed because
§32.2 says inspect before changing and Phase D owns this surface.

---

## Blocked

| § | Item | Why |
|---|---|---|
| 7 | Rollout of any control-plane URL | `license.hostyllo.com` still does not resolve. Nothing can be baked into a build until it does; the per-machine `online-config.json` is a demo mechanism, not a rollout mechanism. `*.up.railway.app` must not be baked — generated subdomains are recycled, and the string would ship inside 50+ installers where it is changeable only by cutting a release. (`docs/SESSION_HANDOFF_2026-09-04.md` §5.3.) |

---

## Deferred

- §13 full typed-IPC migration — deferred by the spec's own instruction ("prefer
  incremental migration", "do not perform a risky big bang IPC rewrite").
  Sequence after Phases B–G.

---

## Spec contradictions found

Recorded per the owner's instruction to flag stale premises rather than obey them.

1. **§24 "the currently EOL Electron runtime."** Electron is `^43.4.0`
   (`package.json`), which is not EOL. See `docs/PHASE_0.5_ELECTRON_43_REPORT.md`
   — the upgrade §24 describes has already happened. No action.
2. **§25 "Light mode only … no dark mode."** **Superseded by owner ruling,
   2026-09-05: keep both themes; the spec is amended, not the code.**
   The app ships two themes — a dark default plus `body.light-theme` — and
   `tests/theme-parity.spec.js` exists specifically because a var-substitution
   bug once made light mode silently inherit dark values at 3.77:1 contrast.
   Commits `bee7c1b` (make light mode readable), `d3229fb` (one home per token)
   and `1cbfd18` (repoint the dark ground warm) are all on this branch. Removing
   dark mode would discard that work *and* the regression net guarding it, for a
   directive written without knowledge of either. §25's other requirements —
   royal/electric blue primary, no neon, no sci-fi, high information density —
   still stand and are already met (`--accent-600` = `#2563eb`, `renderer/tokens.css`).
   **No further action. Do not re-raise this as a gap.**
3. **§23 "strict CSP."** Reads as unimplemented; is actually an explicit,
   reasoned exception with a compensating control. See Partial.
4. **§28 "Phase A."** Implies reconciliation was already underway. It had not
   started.

---

## Tests Executed

Executed 2026-09-05 on `feature/dashboard-1c` @ `c63ff5f`.

| Test | Result | Evidence |
|---|---|---|
| `npm run test:services` | **115 passed, 0 failed** | executed |
| `npm run test:license` | **39 passed, 0 failed** | executed |
| `npm run test:servicemodel` | **16 passed, 0 failed** | executed |
| `npm run test:retention` | **13 passed, 0 failed** | executed |
| `npm run test:update` | **8 passed, 0 failed** | executed |
| `npm run test:migrate` | **6 passed, 0 failed** | executed |
| `npm run test:activation` | **6 passed, 0 failed** | executed |
| `npm run typecheck` | **0 errors** | executed |
| **Total** | **203 passed, 0 failed** | |
| `npx playwright test` | **94 passed, 2 skipped, 0 failed** | All 41 spec files, run in batches — see the note below. Baseline was 84+2; the four new `backup-main-guard` tests and six new `db-recovery` tests account for the difference exactly, so **no regression** from any Phase B change. |
| `node server/test/run.js`, `server/test/http.js` | **NOT RUN** | control-plane suites; last known 29 + 21 on 2026-09-04. |

> **Running Playwright on this machine.** Two things are not obvious and cost
> time to rediscover.
>
> 1. **It needs a licensed profile.** `HOSTIX_TEST_PROFILE` must point at a
>    directory containing a valid `license.enc`, or `_profile.js:27` throws.
>    Without it every spec dies 30s later on `#login-input` looking like a boot
>    regression. A working profile is at
>    `%LOCALAPPDATA%\Temp\hostix-test-profile` (licence copied from `.devdata`).
> 2. **The whole suite in one command exhausts memory on this machine.** It got
>    to 19 passed and then the worker died with `code=3221225794`
>    (`STATUS_DLL_INIT_FAILED`), which Playwright reports as **32 failed** —
>    every one of them a cascade, not an assertion. Run it in batches of 6-8
>    spec files. A red that names almost every spec at once is this, not a real
>    break.

---

## Files Changed

This reconciliation added **one** file and modified none:

- `docs/ENTERPRISE_LIVE_STATUS.md` (new)

### Protected working-tree changes — recorded, untouched (§2)

Uncommitted in-flight design work, left exactly as found:

- `renderer/chrome.css`
- `renderer/src/modules/students.js`
- `renderer/students.css`
- `renderer/style.css`

---

## Customer-Data Risk

- **High — none identified in this pass.** No code path was found that deletes a
  customer database, moves userData, or conceals a SQLite failure behind a
  production localStorage fallback. The §4 frozen identifiers (`hostix-app`,
  `hostix.db`, `com.zeerak.hostix`, publish repo `HOSTIX-APP`, `damam_*` keys)
  are all intact.
- **Medium — the 42-room seed.** It writes invented records into a real customer
  database on first boot. Not destructive, but it is customer data the customer
  did not enter, and it must be gone before a paid install.
- **Financial correctness — high (D-1).** No data is written wrongly, but the
  Payments and Reports screens report different amounts owed for the same
  records. A warden chasing arrears from one screen collects a different set
  than a warden chasing them from the other.
- ~~**Medium — no pre-restore backup (§16).**~~ **Closed in Phase B.** Restoring
  the wrong file was irreversible precisely *because* it succeeded — the
  transaction commits cleanly over live data. There are now three rolling
  snapshots to return to.
- ~~**A corrupt database was an unhandled crash.**~~ **Closed in Phase B**, along
  with an `EBUSY` handle leak that would have made recovery impossible on
  Windows.
- **Medium — no support bundle (§22).** When a customer's install misbehaves
  there is currently no way to get its state off their machine. That is a
  support-cost risk rather than a data risk, but §5 sells a support identifier
  as part of the product.
- **Nothing in the Phase A scope is now unassessed.** The one row left open is
  §27's "unknown schema → safe recovery", which belongs to Phase B.

---

## Release Blockers

1. Unsigned installer and unsigned update artifacts (§21, §29, §33).
2. 42 demo rooms seeded into production onboarding (§10).
3. No pre-update database backup (§21, §29).
4. `license.hostyllo.com` does not resolve — no shippable control-plane address (§7).
5. No §26 commercial E2E has ever been run.
6. **D-1** — Payments and Reports disagree on outstanding amounts (§14, §29 "reports reconcile").
7. ~~No pre-restore backup, and no DB-corruption recovery workflow~~ — **both closed in Phase B**.
8. **D-3** — read-only does not block configuration mutation (§18, §29 "suspension tested").

---

## Next Actions

1. **Re-run the full suite on this tip** (Playwright + services + license +
   retention + migrate + server + typecheck) and record the real numbers here.
   Until that happens nothing can move out of *Implemented but Unverified*.
2. **Gate the 42-room seed** behind dev-only, and give production onboarding the
   §10 room-setup step instead.
3. **Decide the code-signing path** (certificate + signing step), since blockers
   1 and 3 cannot close without it.
4. **Fix D-3** (one line: guard `db:setSetting` with `_assertWritable`) and
   **D-1** (one `outstandingOf()` helper, two call sites). Both are contained,
   both are release blockers, and D-1 is the natural opening move of Phase C.
5. **Close the last of Phase B** — §27's unknown-schema row, and a real
   disk-full test rather than a classifier proven by reading it.
6. **Build the §22 diagnostic bundle** — still entirely absent, and §5 sells a
   support identifier as part of the product.
