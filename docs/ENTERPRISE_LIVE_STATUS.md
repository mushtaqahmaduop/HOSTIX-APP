# Enterprise Live Status

**Spec:** `HOSTYLLO_OFFLINE_ENTERPRISE_PRODUCTION_MASTER_SPEC_v2.md` (v2.0)
**Reconciled:** 2026-09-05
**Branch:** `feature/dashboard-1c` — 38 commits ahead of `master`, 0 behind (it is the tip)
**App version:** 5.0.0 · Electron 43.4.0

> **Scope of this pass.** This is a *targeted* Phase A reconciliation, not an
> exhaustive per-requirement sweep of all 35 spec sections. It establishes the
> spec's load-bearing claims against the real tree and settles the items that
> gate release. Sections marked "not yet reconciled" below are honest gaps in
> this document, not implied passes.

---

## Current Phase

**Phase A — Live-State Reconciliation.** Spec §28 is correct that implementation
is well advanced; it is *not* correct that Phase A had begun — this file did not
exist before today.

Phases B–I have not started. Nothing in §29/§33 has been signed off.

---

## Verified

Nothing is marked VERIFIED in this pass.

Spec §3 forbids marking a requirement VERIFIED from source inspection alone, and
**no test was executed during this session**. The last recorded green run is in
`docs/SESSION_HANDOFF_2026-09-04.md` (Playwright 84 passed / 2 skipped / 0
failed; services 115; license 39; retention 13; server 29 + 21; typecheck clean)
— but that run predates the 38-commit tip and the four uncommitted files, so it
cannot carry a VERIFIED status forward on its own. Re-running it is the first
action in Phase B.

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

---

## Partial

| § | Requirement | What exists / what is missing |
|---|---|---|
| 23 | "Strict CSP" | A CSP **is** enforced (`main.js:1533`, plus per-page meta in `renderer/license.html` and `renderer/license-settings.html`), but it carries `script-src 'unsafe-inline'`. This is a *documented, deliberate* decision (comment at `main.js:1525-1532`): the UI is built from inline `onclick`/`oninput` handlers across every module, and the escaping sweep is the compensating control. It is defensible — but it is not "strict CSP" as §23 words it, and the spec should be reconciled to the decision rather than the code to the spec. |
| 13 | Typed IPC operations | **8 of 24** `ipcMain.handle` registrations are the generic primitives §13 names as migration targets: `db:all` (1377), `db:upsert` (1415), `db:delete` (1424), `db:bulkReplace` (1433), `db:getSetting` (1446), `db:setSetting` (1453), `db:exportFull` (1461), `db:importFull` (1478). None of the typed operations (`students.create`, `payments.create`, …) exist yet. §13 itself says *do not* big-bang this — so it is a sequenced backlog item, not a defect. |

---

## Missing

| § | Requirement | Finding |
|---|---|---|
| 10 | **"No fake/demo customer data may be silently seeded into production onboarding."** | Violated. `renderer/src/modules/modals.js:243` seeds rooms whenever the set is empty, calling `generateRooms()` (`renderer/src/modules/dashboard.js:207-232`), which invents **42 rooms across 4 floors** with amenities `['Fan','Bed','Wardrobe']`. There is no dev-only guard on that path. A new paying customer's first sight of the product is 42 rooms they do not have. |
| 21 / 29 | **Signed production installer** | Not signed. `package.json` `build.win` sets `verifyUpdateCodeSignature: false` **and** `signAndEditExecutable: false`, and there is no certificate configuration. Every shipped installer and every update artifact is unsigned, so §27's "unsigned artifact → release blocked" and "signature mismatch → update rejected" rows cannot hold. |
| 21 | **Pre-update DB backup** | A pre-*migration* backup exists (`main.js:115`); no pre-*update* backup was found. §21 and the §29 Updates gate both require one before installation. |
| 31 | Live status document | Was missing. This file closes it. |

---

## Blocked

| § | Item | Why |
|---|---|---|
| 25 | **"Light mode only … no dark mode."** | This reverses committed, tested work and needs the owner's decision, not silent implementation. The app ships **two** themes — a dark default plus `body.light-theme` — with `tests/theme-parity.spec.js` existing specifically because a var-substitution bug once made light mode silently inherit dark values at 3.77:1 contrast. Commits `bee7c1b` (make light mode readable), `d3229fb` (one home per token) and `1cbfd18` (repoint the dark ground warm) are all on this branch. Removing dark mode discards that work and the regression net guarding it; keeping it contradicts §25. **Recorded, not acted on.** |
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
2. **§25 "no dark mode."** Contradicts committed and tested work — see Blocked.
3. **§23 "strict CSP."** Reads as unimplemented; is actually an explicit,
   reasoned exception with a compensating control. See Partial.
4. **§28 "Phase A."** Implies reconciliation was already underway. It had not
   started.

---

## Tests Executed

| Test | Result | Evidence |
|---|---|---|
| *(none)* | — | No test was run in this session. Per §3 and §32.13, nothing above is marked VERIFIED. The 2026-09-04 green run is prior evidence only, and predates the current tip. |

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
- **Not yet reconciled:** §14 financial authority, §16/§17 backup–restore–recovery,
  §11 offline matrix, §18–20 read-only enforcement depth, §22 support redaction.
  These carry the highest residual risk precisely because they are unassessed.

---

## Release Blockers

1. Unsigned installer and unsigned update artifacts (§21, §29, §33).
2. 42 demo rooms seeded into production onboarding (§10).
3. No pre-update database backup (§21, §29).
4. `license.hostyllo.com` does not resolve — no shippable control-plane address (§7).
5. §25 light-mode-only directive unresolved against shipped dark mode.
6. No §26 commercial E2E has ever been run.

---

## Next Actions

1. **Re-run the full suite on this tip** (Playwright + services + license +
   retention + migrate + server + typecheck) and record the real numbers here.
   Until that happens nothing can move out of *Implemented but Unverified*.
2. **Owner decision on §25** — keep both themes, or spend the work to remove dark
   mode and retire `theme-parity.spec.js`. Blocking, and cheap to answer.
3. **Gate the 42-room seed** behind dev-only, and give production onboarding the
   §10 room-setup step instead.
4. **Decide the code-signing path** (certificate + signing step), since blockers
   1 and 3 cannot close without it.
5. **Reconcile the remaining sections** — §14 financial, §16/§17 backup and
   recovery, §11 offline, §18–20 entitlement lifecycle, §22 support redaction —
   into this document before Phase B is declared started.
