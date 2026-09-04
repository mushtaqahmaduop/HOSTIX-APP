# Enterprise Baseline — Phase 0

**Deliverable of:** `HOSTYLLO_ENTERPRISE_IMPLEMENTATION_SPEC.md` §33, Phase 0 —
*Freeze and Baseline*
**Baseline commit:** `faf9abc` (`origin/master`)
**Date:** 2026-09-05
**Scope rule for this phase:** *"Do not refactor broadly yet."* **No production
source file was modified.** Everything added here is additive test
infrastructure and documentation.

This document is the fixed point the rest of the programme is measured against.
When a later phase claims to have improved something, this is what "before"
means.

---

## 0. Three corrections to the spec's premises

The spec was written from the *Complete Project Intelligence Brief*. Three of
its stated premises do not match the repository at `faf9abc`, and each one
changes what a phase should do. Recording them here rather than silently
working around them.

| Spec says | Actually | Consequence |
|---|---|---|
| §0: *"the source brief … explicitly states that it did not execute the application or test suite"* | The brief executed **14 suites plus two live-infrastructure checks**, and drove a real Electron build four times with probe specs. §6 below reproduces the numbers | Phase 0's *"create baseline test report"* was already satisfied; the blanket "must not claim runtime verification" would have the team re-derive existing evidence |
| §0: *"EOL Electron"* | **Electron 43.4.0**, upgraded 22 → 43 on 2026-08-15 (`4c48808`) | Phase 4 (*Electron and Runtime Security*) is largely already done. What remains of it is code signing, not an upgrade |
| §0: *"incomplete update UX"* | Fixed at `868b964`, on master. `checkForUpdates()` now reads `isUpdateAvailable`; the `update:check` IPC no longer reports every current machine as having an update; the false install-on-quit promise is gone. 9 tests | Phase 7 (*Update System*) starts from a smaller gap than the spec assumes |

Two further gaps, in the other direction — the spec covers these only as
principles and does not name them, though both were **reproduced empirically**:

* **B-1** (§10.2 *"no renderer-only capacity checks"*) — the concrete defect is
  that `submitEditStudent` counts `status === 'Active'` rather than calling
  `roomFreeBeds()`, so a student can be transferred into a room the app is
  displaying as FULL, with no warning. Fixture: `edge-occupancy.db`, room `room_B`.
* **B-7** (§8 *"do not seed fake/demo customer data"*) — the concrete defect is
  an ordering one: 42 demo rooms are seeded by `_initDBFields()` before
  `needsSetup()` is evaluated, and that predicate refuses to run when rooms
  exist. The wizard is therefore unreachable on a genuinely fresh install.

---

## 1. Frozen identifier register

§1.1 requires these to be recorded. Changing any of them without an explicit
migration points existing installations at an empty profile or installs
side-by-side.

| Identifier | Value | Where it binds | Consequence of changing it |
|---|---|---|---|
| npm package `name` | `hostix-app` | `package.json` → `app.getName()` | userData **is** `%APPDATA%\hostix-app`. ~50 installs open an empty profile |
| Database filename | `hostix.db` | `main.js:64` | Same folder; also `hostix.db.pre-v1.bak` and ~20 specs |
| `build.appId` | `com.zeerak.hostix` | NSIS upgrade identity | A new appId installs **alongside** the old app |
| `build.publish.repo` | `HOSTIX-APP` | electron-updater feed | Auto-update breaks |
| `build.publish.owner` | `mushtaqahmaduop` | feed + `services/discovery.js` `DISCOVERY_URL` | Update feed **and** control-plane discovery both 404. `tests/services.test.js` asserts the two agree |
| Licence AES salt | `damam_salt_v1` | `main.js:293` `scryptSync` | Every `license.enc` in the field becomes undecryptable |
| v1 password salt | `DAMAM_WARDEN_PW_SALT_v1_2025` | `auth-nev.js:122` | Blocks the v1 → v2 hash migration; pre-migration accounts locked out |
| Account store key | `damam_auth_<hostelId>_wardens` | `auth-nev.js:36`, `localStorage` | **Every user account on every install is lost** |
| Session/lockout keys | `damam_auth_<hostelId>_session` / `_remember` / `_attempts` | `auth-nev.js` | Sessions invalidated (recoverable) |
| Entitlement `kid` | `ent-20260819` | `services/entitlement-keys.js` | Builds stop verifying entitlements signed by the live key |
| Schema version key | `schema_meta.version` = `1` | `migrations/001` | Migration re-runs or is skipped incorrectly |

`build.productName` (`Hostyllo Offline`) is **not** frozen — it sits under
`build`, so Electron never sees a top-level `productName` and `app.getName()`
still returns `hostix-app`.

---

## 2. Persistence inventory

### 2.1 Stores in play

| Store | Location | Holds | In backup? |
|---|---|---|---|
| SQLite | `<userData>\hostix.db` (WAL, `foreign_keys=ON`) | all business data — 15 collections + `settings` | **Yes** |
| `localStorage` | renderer origin | **user accounts + PBKDF2 hashes**, session, remember-me, lockout | **No** |
| `sessionStorage` | renderer origin | `active_hostel` (always `hostel_1`) | No |
| Encrypted file | `<userData>\license.enc` | licence key, machineId, expiry, activatedAt | No |
| Plain file | `<userData>\last_run.dat` | clock-rollback watermark (ISO string) | No |
| Plain file | `<userData>\machine.json` | corroboration factors for the fingerprint | No |
| Plain file | `<userData>\control-plane.json` | discovered API base | No |
| Log files | `<userData>\logs\hostyllo-YYYY-MM-DD.log` | redacted service logs | No |

### 2.2 Shape

Every collection table is `(id TEXT PRIMARY KEY, …promoted columns…, data TEXT NOT NULL)`
where `data` is the whole record as JSON. **No foreign keys between business
tables, no CHECK constraints, no triggers, no views.** Migration 001 promoted 22
fields to typed columns on 4 tables and created 10 indexes.

### 2.3 Read and write paths — the complete set

| Path | Call sites | Notes |
|---|---|---|
| Read | `dbAll(table)` — **exactly 2 call sites**, `storage.js:42` and `storage.js:93`, **neither passes a `where`** | The whole database is loaded into renderer memory at launch. The 10 promoted indexes are therefore **unused by the application** |
| Write | `saveDB()` → `dbUpsert` / `dbDelete` per changed row, diffed against a snapshot | ~92 call sites `await saveDB()`; **2 do not** (`receipt.js:57`, `storage.js:346`) |
| Bulk | `dbBulkReplace` | used by the localStorage→SQLite one-time migration |
| Settings | `dbGetSetting` / `dbSetSetting` | `dbSetSetting` is written on **every** `saveDB()` |
| Export | `dbExportFull` | 15 tables + settings. **Excludes accounts** |
| Import | `dbImportFull` | single transaction, `DELETE` then re-insert |

### 2.4 Failure behaviour today

* `saveDB()` returns `false` on failure and falls back to a full rewrite first.
* A failed save raises a **non-dismissable red bar** offering *Try saving again*
  and *Download a copy now*; it clears only when a save succeeds.
* **There is a production `localStorage` fallback** (`_loadFromLocalStorage()`,
  `storage.js:129`) reached when `window.electronAPI` is absent. §1.2.13 of the
  spec forbids this in production — Phase 1 owns it.
* No `PRAGMA integrity_check` anywhere. No `db.close()` and no WAL checkpoint on
  quit.

---

## 3. Licence inventory

| Component | Location |
|---|---|
| Key format (v3 + v4), checksum, expiry | `renderer/src/utils.js:920-1040`, shared with the server via the generated copy `server/src/lib/vendor/app-utils.js` |
| Checksum secret | `main.js:161` — **hex-encoded in the client**, therefore a typo filter, not a trust boundary (spec §1.4.1 violation, known) |
| At-rest encryption | `main.js:292-312` — AES-256-CBC + HMAC-SHA256, key `scryptSync(machineId + secret, 'damam_salt_v1', 32)` |
| Startup validation | `main.js:344` `checkLicenseValidity()` — 8 ordered checks; **writes `last_run.dat` as a side effect** |
| Machine fingerprint | `services/machine-id.js` — 6 facts, 2 probe mechanisms each, `clean` / corroborated / `degraded` |
| Activation | `main.js:501` — refuses to seal against a `degraded` reading |
| Entitlement verification | `services/entitlement.js:151` — `alg` pinned to EdDSA, `kid` from a compiled-in map, machine-bound, `notAfter` staleness |
| Public keys | `services/entitlement-keys.js` — `{ ent-20260819 }` |
| Decision | `services/enforcement.js:156` `resolve()` |
| Write gate | `main.js:1441` `_assertWritable()` — main process, on 4 of 5 write channels |
| Renderer courtesy layer | `renderer/src/enforcement-ui.js` |
| Control-plane routes | `server/src/routes/devices.js` (`/v1/*`), `server/src/routes/admin.js` (`/admin/*`) |

**Write-gate matrix at baseline** (asked of the module directly):

| State | readOnly | blocked | `writeBlocked('students')` | `writeBlocked('settings')` |
|---|---|---|---|---|
| ACTIVE | false | false | false | false |
| GRACE | false | false | false | false |
| EXPIRED | true | false | true | true |
| SUSPENDED | true | false | true | true |
| REVOKED | false | true | true | true |
| UNLICENSED | false | true | true | true |

`ALWAYS_WRITABLE = ['activitylog']`.
**Gap:** `db:setSetting` (`main.js:1491`) does **not** call `_assertWritable`,
so settings persist while read-only even though the matrix says they should not.

---

## 4. IPC inventory

**33 channels.** Full table in the intelligence brief §4.5. Summary by risk:

| Group | Channels | Gated by the write gate |
|---|---|---|
| Generic database | `db:all`, `db:upsert`, `db:delete`, `db:bulkReplace`, `db:getSetting`, `db:setSetting`, `db:exportFull`, `db:importFull` | upsert / delete / bulkReplace / importFull **yes**; setSetting **no**; reads never |
| Licence | 11 channels (`license:*`) | n/a |
| Window / title bar | 6 | n/a |
| File + PDF | `receipt:savePDF`, `open-pdf-window`, `open-external`, `write-file`, `pdf-saved`, `export-backup`, `import-backup` | no |
| Update | `update:check`, `update:install`, `update-download-progress` | n/a — **none exposed to the renderer** |
| Online status | 6 (`online:*`) | read-only by construction |

The preload validates types, lengths, filename characters, a 2 MB HTML cap and a
2048-char URL cap, and never passes `IpcRendererEvent` across the bridge.

**Phase 5 target (spec §12)** replaces the 8 generic `db:*` channels with ~30
domain channels. Note for whoever executes it: this reverses a recorded decision
(`CLAUDE.md`: *audit M1 — freeze, don't rewrite*), and it touches the seam every
screen depends on, because the renderer's entire model is one in-memory `DB`
object rebuilt from `dbAll` at launch. Sequence it late and behind the suite.

---

## 5. HTML rendering inventory

Measured at `faf9abc` across `renderer/src` and `renderer/app.js`:

| Measure | Count |
|---|---|
| `innerHTML` / `insertAdjacentHTML` / `outerHTML` sinks | **121** |
| `escHtml(...)` call sites | **792** |
| Concatenation-built HTML fragments (`+ '</…'` and similar) | **252**, across 10 files |
| Files with the most sinks | `payments.js` 25, `nav.js` 23, `students.js` 19, `app.js` 10, `modals.js` 9 |
| Files with the most escaping | `students.js` 144, `dashboard.js` 89, `archive.js` 88, `payments.js` 67 |

**Three sinks are not obvious and account for the historical holes:**

1. `showModal(size, title, body)` renders `title` as **raw HTML**;
   `showConfirm(title, text)` renders **both** raw. Escaping happens at the call
   site because many callers pass deliberate markup.
2. `toast()` and `logActivity()` **escape internally** — escaping at those call
   sites is a bug that prints `&amp;` at a warden.
3. **252 concatenation-built fragments are invisible to any `${…}` scan.** Two
   real holes lived there. Any Phase 6 tooling that only inspects template
   literals will report a clean sweep over a third of the surface.

CSP at baseline: `script-src 'self' 'unsafe-inline'` — `'unsafe-eval'` removed
(audit M2); `'unsafe-inline'` retained deliberately because the UI is built from
inline handlers in generated markup. `connect-src 'self'` means the renderer
cannot reach the network at all.

---

## 6. Baseline test report

**Every number below was produced by executing the suite at `faf9abc`.** Nothing
here is inferred.

| Suite | Command | Result |
|---|---|---|
| E2E (real Electron) | `npx playwright test` | **84 passed, 2 skipped, 0 failed** (12.8 min) |
| Online services | `npm run test:services` | **136 passed, 0 failed** |
| Licence system | `npm run test:license` | **39 passed, 0 failed** |
| Update channel + dialog | `npm run test:update` | **8 + 9 = 17 passed, 0 failed** |
| Service model | `npm run test:servicemodel` | **16 passed, 0 failed** |
| Retention | `npm run test:retention` | **13 passed, 0 failed** |
| Bulk rooms | `npm run test:bulkrooms` | **13 passed, 0 failed** |
| Activation guard | `npm run test:activation` | **6 passed, 0 failed** |
| Migration transform | `npm run test:migrate` | **6 passed, 0 failed** |
| Types | `npm run typecheck` | **0 errors** |
| Control plane (unit) | `server: node test/run.js` | **29 passed, 0 failed** |
| Control plane (HTTP) | `server: node test/http.js` | **21 passed, 0 failed** |
| Licence chain — **live production** | `node scripts/e2e-license-chain.js` | **28 passed, 0 failed** |
| Update channel — **live GitHub feed** | `node scripts/e2e-update-channel.js` | **16 passed, 0 failed** |
| **Added by this phase** | `npm run test:fixtures` | **21 passed, 0 failed** |

**Total: ~361 automated checks, all green.**

The two E2E skips are deliberate and opt-in:
`control-plane-sync.spec.js` (needs `CONTROL_PLANE_URL` + admin credentials) and
`settings-is-source.spec.js` (needs `HOSTIX_REAL_PROFILE`).

### 6.1 Required environment

| Suite | Requirement |
|---|---|
| Playwright | `HOSTIX_TEST_PROFILE` pointing at a directory **containing `license.enc`**. Without it every spec dies after 30 s on `#login-input` looking like a boot regression; `tests/_profile.js` fails fast with that message |
| `test:services` | none — better-sqlite3 v13 has an N-API prebuild and loads under plain Node |
| Fixtures | none |
| `e2e-license-chain` | network; **spends 6 of a 20-per-IP-per-hour budget** shared with real customer activations |
| `e2e-admin-portal` | `HOSTYLLO_ADMIN_EMAIL` + `HOSTYLLO_ADMIN_PASSWORD`. **Written and never executed** |

### 6.2 Known coverage gaps at baseline

Onboarding / first-run (zero specs), room-transfer capacity, restore from a real
backup file, Excel import, any packaged build, the portal half of the licence
loop, financial invariants as properties, crash-during-write.

---

## 7. The fixture set (new in this phase)

`tests/fixtures/make-fixtures.js` builds 13 fixtures into `tests/fixtures/out/`
(gitignored). `tests/fixtures.test.js` asserts each one holds the state it
advertises — 21 checks.

| Fixture | State it reproduces | Which phase needs it |
|---|---|---|
| `empty.db` | fresh install, schema v1, zero rows | 1, 10 |
| `legacy-blob.db` | **pre-migration**: `(id, data)` tables, no `schema_meta` | 1, Gate 3 |
| `small-hostel.db` | 12 rooms / 24 students / 91 payments / 30 expenses | all |
| `large-hostel.db` | 200 rooms / 500 students / **8,179 payments** / 1,200 expenses | §30 performance |
| `edge-money.db` | 7 payment shapes incl. **the F-1 record** (extras present, `unpaid` absent) and an **overpayment** whose surplus is nowhere | 2 |
| `edge-occupancy.db` | **`room_B` is the double-booking case** (occ 1, vacating 0, freeBeds 0, `Active` count 0); `room_C` is the mislabelled one; `room_D` is force-added over capacity | 1, 10.2 |
| `corrupt.db` | valid SQLite header, garbage body — opens, then fails on first query | 19, Gate 6 |
| `backup-valid.json` | accepted by `validateBackup()` | 14 |
| `backup-hostile-proto.json` | `__proto__` nested in a record | 14, Gate 7 |
| `backup-damaged-collection.json` | `students` truthy but not an array | 14 |
| `backup-missing-id.json` | a payment with no `id` | 14 |
| `backup-too-deep.json` | nesting beyond `BACKUP_MAX_DEPTH` (24) | 14 |
| `backup-not-ours.json` | valid JSON, not a Hostyllo backup | 14 |

### 7.1 Two design decisions worth knowing

**Generated, not committed.** The later phases need databases in specific
*states*, not specific bytes. A committed binary is invisible in a diff, and a
schema change would silently invalidate it while the tests kept passing against
a database the app no longer produces. The DDL comes from
`migrations/001-relational-schema.js` — the module the app itself runs — so a
fixture cannot drift from the schema it represents.

**The manifest hashes CONTENT, not bytes.** SQLite does not write byte-identical
files for identical data: page allocation, the freelist and an internal change
counter all vary, and `VACUUM` does not normalise them — measured here, three
consecutive VACUUMs of one database produced three different digests. A byte
hash would report drift on every rebuild and teach everyone to ignore it. So
`contentSha256` is taken over the schema version and the sorted records of every
table. `npm run fixtures:verify` compares digests only; it was confirmed to pass
across a full from-scratch rebuild, and to fail loudly when a digest moves.

`corrupt.db` and the JSON fixtures keep a **byte** hash — they are written by
hand rather than by SQLite, so their bytes are stable, and for the hostile
backups the exact bytes are the point.

**No fixture names a real hostel, person or address** (owner's ruling,
2026-08-30). A test asserts it.

---

## 8. Change map

§3.11 requires a change map before implementation. This is the mapping from the
spec's phases to the files they will actually touch, with the risk of each.

| Phase | Primary files | Risk | Note |
|---|---|---|---|
| 1 — Data safety | `renderer/src/storage.js`, `main.js` (db handlers, lifecycle), `migrations/` | **Medium** | Removing the `localStorage` fallback changes behaviour in browser-dev mode only. Scheduled backups are additive. `db.close()`/checkpoint on quit is a 3-line change with a real durability payoff |
| 2 — Financial | `renderer/src/utils.js` (`resolveCharges`, `paymentCharges`), `modules/payments.js` (2,846 lines) | **High** | Every stored `amount`/`unpaid`/`concession` is a float today. A minor-units migration rewrites customer ledgers — it needs `edge-money.db` and a reversible migration. **F-1 is a 1-line fix that does not need any of that** and should land first |
| 3 — Licence security | `main.js` (`_SECRET`), `services/`, `server/src/lib/keys.js` | **High** | Removing the client-side checksum secret changes what an offline activation can validate. v3 keys in the field constrain the design |
| 4 — Electron/runtime | `package.json` | **Low** | Mostly already done (43.4.0). What is left is code signing, which is procurement, not code |
| 5 — IPC hardening | `preload.js`, `main.js`, **every renderer module** | **Highest** | ~30 new channels replacing 8 generic ones, against a renderer whose whole model is one in-memory `DB`. Reverses audit M1. Sequence last |
| 6 — XSS hardening | 10 files with 252 concatenation sites, 121 sinks | **Medium** | Removing `'unsafe-inline'` means rewriting inline handlers to `addEventListener` across every screen |
| 7 — Update system | `main.js` | **Low** | Partly done (`868b964`). Remainder is signing-dependent |
| 8 — Control plane | `server/`, `services/device.js`, `services/index.js` | **Medium** | C-2 (double registration) is a small fix here |
| 9 — Supportability | `services/logger.js`, new diagnostics bundle | **Low** | Additive |
| 10 — Onboarding | `modules/onboarding.js`, `modules/modals.js` (`_initDBFields`), `modules/dashboard.js` (`generateRooms`) | **Medium** | **B-7 lives here.** The fix is ordering, not new UI |
| 11-12 — QA / RC | `tests/`, CI | **Low** | The CI workflow is currently broken boilerplate (`npm test` — no such script) |

### 8.1 Recommended deviation from the spec's order

The spec's Phase 1 begins with architecture. Four **proven, small, isolated**
defects can land before any of it, each with a regression test, and each removes
a risk a customer would meet tomorrow:

| Fix | Files | Size |
|---|---|---|
| **B-1** — route `submitEditStudent` through `roomFreeBeds()` | `modules/students.js:1988` | one predicate + a confirm |
| **B-7** — evaluate `needsSetup()` before seeding, or mark seeded rooms | `modules/modals.js:243` | ordering |
| **S-4** — `_assertWritable` on `db:setSetting` | `main.js:1491` | one line |
| **F-1** — include `extraTotal` in the fallback | `modules/payments.js:2640` | one expression |

Recorded as a recommendation, **not** taken — the instruction for this programme
is to follow the spec in its own order.

---

## 9. What Phase 0 changed

| File | Change |
|---|---|
| `tests/fixtures/make-fixtures.js` | **new** — deterministic fixture generator, 13 fixtures |
| `tests/fixtures.test.js` | **new** — 21 checks that the fixtures hold their advertised states |
| `docs/ENTERPRISE_BASELINE.md` | **new** — this document |
| `.gitignore` | `tests/fixtures/out/` |
| `package.json` | `fixtures`, `fixtures:verify`, `test:fixtures` scripts |

**No production source file was modified.** `main.js`, `preload.js`, every
`renderer/` file, every `services/` file and every `server/` file are byte-identical
to `faf9abc`.

---

## 10. Exit state

Phase 0 defines no exit condition in the spec. What it produced:

- [x] repository inspected
- [x] identifiers frozen and recorded (§1)
- [x] persistence inventoried (§2)
- [x] licence logic inventoried (§3)
- [x] IPC inventoried (§4)
- [x] update flow inventoried (§5 of the brief; corrections in §0)
- [x] HTML rendering inventoried and **counted** (§5)
- [x] tests inventoried, with their required environment (§6.1)
- [x] baseline test report from an actual execution (§6)
- [x] DB fixture set created and self-verified (§7)
- [x] change map produced (§8)

**Next:** Phase 1 — *Data Safety First*.
Exit condition: *no known path may silently report success after persistence
failure.* The known paths at baseline are `receipt.js:57` and `storage.js:346`
(`saveDB()` without `await`) and `_loadFromLocalStorage()` as a production
fallback.
