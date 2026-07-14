# HOSTIX-APP — Audit Remediation Kickoff Prompt

**Purpose:** Paste this whole file into Claude Code as the opening prompt for the remediation project. It is written to be handed to an agent cold — it assumes no prior conversation context beyond what's in this file and the repo itself.

---

## 0. Mission

You are working on **HOSTIX-APP**, a shipping Electron desktop hostel-management app currently running on 50+ client machines. A senior audit was just completed (full text below, also save it as `AUDIT_REPORT.md` at repo root before you do anything else). The app **works and must keep working** — every client site is production, not staging. Your job is to close the gap identified in the audit **without ever breaking a machine that's already running this app.**

This is not a rewrite. This is disciplined, incremental debt removal, ordered exactly as the audit recommends: **Do Now → Do Next → Later**. You do not skip ahead to "Later" items because they're more interesting. You do not batch unrelated fixes into one commit. You do not touch anything not explicitly listed in the current phase's task list.

Read the full audit below before writing a single line of code.

---

## 1. Hard Rules (non-negotiable, apply to every phase)

1. **Never commit to `master`.** Every phase gets its own branch: `fix/phase-0-safety-net`, `fix/phase-1-do-now`, `fix/phase-2-do-next`, `fix/phase-3-later`. Sub-tasks within a phase get their own commits on that branch, not separate branches, unless a task is large enough to risk destabilizing the others (TS/Vite migration = its own sub-branch off the phase branch).
2. **Never merge a branch you haven't personally verified boots.** "Verify boots" means: `npm run build` (once Vite exists) or the current start script succeeds, the app launches, login works, and you can navigate to at least Students, Payments, and Dashboard without a console error. Screenshot or paste console output as proof in your summary before asking for merge approval.
3. **One conceptual change per commit.** "Delete dead file X" is a commit. "Merge duplicate `fmtPhone`" is a commit. Don't combine them even though both are in Phase 1.
4. **No new dependencies without stating why.** If you add a package, say in the commit message what it replaces or what CDN/global it removes.
5. **Do not silently change behavior.** If removing a duplicate function changes which implementation wins (e.g., `safeOpenWindow` in `utils.js` vs `app.js`), you MUST diff the two implementations, tell me what the behavioral difference is, and ask which one is correct before deleting either — do not assume the currently-winning one (app.js, loaded last) is the intended one. It may be the accidental one.
6. **Every phase ends with a written summary**, not just working code: what changed, what you verified, what risk remains, what you deliberately did NOT touch and why.
7. **If a fix requires a decision only the product owner (Mushtaq) can make** — brand name, which color token is canonical, whether SQLite gets a real schema or gets dropped for flat JSON — **stop and ask**. Do not guess and do not pick the "more modern" option by default. See Section 4 for the specific decisions needed before Phase 2 can start.
8. **Preserve the license/activation system's external behavior exactly** unless a task explicitly says to change it. Clients have already activated on existing keys — anything that invalidates those breaks 50 live installs.

---

## 2. Full Audit (source of truth — do not deviate from its findings without checking first)

> The complete audit report is pasted below. Treat every file path and line number as a starting point to verify against the actual current repo state (line numbers may have shifted since the audit was written) — do not assume they're still exact.

```
# HOSTIX — Senior Audit Report

Full-codebase audit: tech-stack critique, modern-stack comparison, and a bug / dead-code / quality inventory.

Audited version: 4.0.1 · Date: 2026-07-15
(A rendered copy of this text also lives at repo root as AUDIT_REPORT.md — keep the two in sync.)

## Verdict up front

The app works and ships, and for a solo-developer offline desktop tool that's the thing that matters
most. But under the hood it's carrying the scars of an unfinished migration: a dead architecture living
beside a new one, four product names, two color systems, two auth files, an end-of-life Electron, and an
"offline" app that quietly depends on the internet. None of these are fatal. Together they're the
difference between "runs on 50 machines" and "maintainable for the next 5 years." The core stack choice
(Electron + vanilla JS + SQLite) is defensible; the execution is where the debt is.

## 1. Tech stack — what you used vs. what today's stack would be

| Concern | You used | Modern default (2026) | Why it matters here |
|---|---|---|---|
| Desktop runtime | Electron 22.3.27 (EOL, Chromium 108) | Electron 3x or Tauri (Rust) | Electron 22 stopped getting security patches ~late 2023. Tauri would cut the installer from ~150MB to ~10MB and drop the bundled Chromium attack surface. |
| Language | Vanilla JS (ES5-ish, var, function) | TypeScript | TS would have caught at compile time every duplicate-function and typo bug found below. Highest-ROI change. |
| UI rendering | 130KB modules of innerHTML += string concatenation | Components (Svelte / React / Vue) or Web Components | String-building HTML is the root cause of the XSS surface and why students.js is 136KB. |
| Build/bundler | None ("no build step") | Vite | No build = can't vendor deps offline, can't use TS, can't tree-shake, can't code-split. It's why libraries load from CDNs (see section 3). |
| Data layer | SQLite used as a JSON-blob key-value store | SQLite + a real schema via Drizzle / Kysely / Prisma | You pay better-sqlite3's price but throw away joins, indexes, and constraints. See section 2. |
| App state | One global mutable DB object | A store (Zustand / Pinia / Svelte stores) | Every module reaches into and mutates DB directly; no single writer, no reactivity. |
| Styling | Two parallel token systems (violet --accent and orange --gold) | One token set + optionally Tailwind | See section 4 — the design system is mid-migration and contradicts its own docs. |
| Testing | Only test-license.js | Vitest + Playwright | Zero UI/flow tests for an app handling people's rent money. |
| Licensing | Symmetric secret baked into main.js | Server activation + Ed25519 (private key never ships) | Current scheme is security theater — see section 5. |

The honest take: you didn't pick wrong tools, you picked dated ones and then stopped halfway through
modernizing. Starting today: Tauri + TypeScript + Svelte + Vite + Drizzle/SQLite. Minimal disruption to
what exists: stay Electron but upgrade it, add TypeScript + Vite, and vendor the CDN libs.

## 2. Architecture: SQLite is being used as a JSON file

In main.js (initDatabase, lines 40-73) every table is (id TEXT, data TEXT) — the entire record is a JSON
string. Then:

- The whole database is loaded into memory on boot (storage.js, lines 91-93) and all filtering/searching
  happens in JS.
- dbAll() is called exactly twice, and never with a where filter. That means the generated VIRTUAL columns
  (status, roomId, studentId) and the entire db:all column-whitelist security machinery (FIX-13) are dead —
  nothing queries by them.
- There are no indexes (CREATE INDEX appears nowhere).

So you get none of SQLite's benefits (relational queries, indexed lookups, constraints, partial reads) and
all of its costs (native module, electron-rebuild, ABI pinning, asarUnpack). The clever diff-based saveDB()
in storage.js (lines 150-193) is a smart workaround — but it's solving a performance problem the
architecture created. Either use SQLite properly (columns + indexes + queries) or drop to a flat JSON file
and skip the native dependency.

## 3. The "offline app" isn't offline

README says "no internet required." But index.html (lines 11-18) loads at runtime from the network: Google
Fonts, SheetJS (cdn.sheetjs.com), Chart.js + datalabels (cdn.jsdelivr.net).

On a hostel PC with no/poor internet: charts don't render and Excel import silently dies. Worse, the
main-process CSP (main.js, lines 1016-1023) allows 'unsafe-eval' and remote script hosts — so a CDN
compromise = arbitrary code in the app. Fix: npm install chart.js xlsx, bundle locally. A one-hour change
that removes both a reliability failure and a supply-chain risk.

Bonus bug: there are two conflicting CSPs — a <meta> one in index.html line 7 (connect-src 'self') and a
header one in main.js line 1012. Browsers enforce the intersection, so they partly cancel each other and
make the real policy hard to reason about. Pick one (the header).

## 4. Two color systems + four brand names (the migration schism)

- Colors: tokens.css defines a violet --accent-* system and says the app is violet. CLAUDE.md rule #5 says
  "only --accent*; --gold*/--royal* are DELETED." Reality: --gold is defined in style.css line 19 and
  referenced ~150 times across the modules (29x in dashboard.js alone), and it renders orange (#ffb780).
  --royal is aliased to the same orange. The project's own rule is violated everywhere and the "deleted"
  tokens are load-bearing. The token migration is stuck at "Phase 4" (tokens.css, lines 203-216).
- Branding: the app calls itself HOSTYLLO (UI title + hostyllo.com/support link), HOSTIX (package/
  productName), DAMAM Boys Hostel (every main-process dialog, About box, default config), and Zeerak Hostix
  (package description). Four identities in one binary shipped to paying clients.

Neither breaks functionality, but both signal that documentation and code have drifted apart — which is
exactly how the next regression sneaks in.

## 5. Security findings

1. Electron 22 is EOL — no Chromium security updates since ~2023. For software on 50+ machines, this is the
   #1 liability. Upgrade to a supported Electron major.
2. License scheme is bypassable. _SECRET is embedded in main.js (lines 95-97) and ships in app.asar; the
   checksum (utils.js, lines 469-481) is HMAC over the expiry field only, with a symmetric key everyone has.
   Anyone who extracts the secret can mint unlimited keys. Inherent to offline licensing, but the current
   build gives a false sense of security. If revenue protection matters, sign licenses with an asymmetric
   key (Ed25519) so the private key never leaves your server.
3. Stored-XSS surface into a privileged API. The renderer builds HTML by concatenating user data, and
   escHtml() is applied inconsistently (many ${s.name} / ${p.roomNumber} interpolations are unescaped).
   Because preload.js exposes dbDelete, dbUpsert, openExternal, etc. to the renderer, a malicious student
   name (<img onerror=...>) could in principle drive the DB API or exfiltrate via openExternal.
   contextIsolation limits the blast radius, but the exposed DB surface makes escaping non-optional. Route
   all dynamic values through escHtml (a component framework would do this for free).

Credit where due: contextIsolation:true + nodeIntegration:false, protocol whitelisting on open-external,
path allow-listing on write-file, HMAC tamper detection, and rate-limited activation are all done correctly.
The security fundamentals are here; the maintenance (Electron) and encoding discipline are the gaps.

## 6. Bugs, dead code & duplication

Dead files (~24KB of stale code):

- renderer/src/auth.js (14KB) — not loaded; index.html loads auth-nev.js. It's a stale mirror that still
  defines canDo, logout, selectWarden, updateRoleBadge, saveWardenConfig. Dangerous because it looks live.
- renderer/license.js (10.6KB, root) — not loaded; index.html loads src/license.js. Dead.

Live duplicate function definitions (no build step = the last one silently wins):

- safeOpenWindow — defined in utils.js line 76 and app.js line 27 with different signatures/behavior. app.js
  loads last, so utils.js's version is silently ignored.
- fmtPhone — defined in both students.js and app.js. If they ever diverge, phone formatting changes based on
  load order, not intent. Precisely the class of bug TypeScript/modules eliminate.

(Audit-writer's note: the other duplicated top-level names — canDo, logout, selectWarden, saveWardenConfig,
updateRoleBadge — are duplicated only between auth-nev.js (loaded) and auth.js (dead). They are NOT live
shadows and disappear once auth.js is deleted. Expect ~2 live collisions, not 6.)

Documentation contradicting code: CLAUDE.md says "SQLite… 13 modular feature files" while README.md still
describes "localStorage… renderer/src/app.js." The README is a full major version behind (documents
v3/localStorage; you're on v4/SQLite). Anyone onboarding — human or AI — starts from a false map.

## 7. Prioritized recommendations

Do now (days, high value / low risk):
1. Upgrade Electron to a supported major (test the better-sqlite3 rebuild). Biggest security win.
2. Vendor the CDN libraries (Chart.js, SheetJS, fonts) into the app. Makes "offline" actually true.
3. Delete the two dead files and de-duplicate safeOpenWindow / fmtPhone. Pure debt removal.
4. Pick one brand name and one accent color; update README to match the v4/SQLite reality.

Do next (weeks, structural):
5. Introduce Vite + TypeScript incrementally (convert utils.js / storage.js first). Prevents the
   duplicate-function and encoding bugs from recurring.
6. Add a Playwright smoke test for the documented flow (login → add student → payment → receipt).
7. Decide SQLite's fate: add real columns + indexes + where queries, or drop to flat JSON and remove the
   native dependency.

Later (months, only if it pays off):
8. Move HTML-string modules to components (Svelte is the lightest lift for a no-framework codebase).
9. Consider Tauri if install size / footprint becomes a selling point.
```

---

## 3. Phase 0 — Safety Net (do this before touching any audit item)

Nothing below is optional. This phase exists because everything after it is a refactor of a system with zero automated coverage.

- [ ] Create branch `fix/phase-0-safety-net` off current `master`.
- [ ] Tag current `master` HEAD as `pre-audit-baseline` so we always have a clean rollback point.
- [ ] Write down the exact manual QA flow currently used to sign off a release (login → add student → record payment → generate receipt → export → dashboard load). If no such checklist exists, create `QA_CHECKLIST.md` from what you can infer the app does, and confirm the flow with me before relying on it.
- [ ] Add a **minimal** Playwright smoke test that automates that exact flow against the current, unmodified app. This is Phase 0 not because it's glamorous but because every subsequent phase needs a fast way to prove "I didn't break login/payments." Keep it to one file, one test, real assertions (not just "didn't crash").
- [ ] Confirm the smoke test passes against current `master` before merging Phase 0. If it doesn't pass against unmodified `master`, that itself is a finding — report it, don't silently fix the underlying bug as part of "writing the test."
- [ ] Merge Phase 0 to `master` only after the smoke test is green and documented in a short summary.

**Definition of done for Phase 0:** `npm run test:e2e` (or equivalent) runs the smoke test against unmodified app behavior and passes reliably (run it 3x to rule out flakiness) before any audit fix begins.

---

## 4. Decisions Needed From Mushtaq Before Phase 2 (ask these now, don't block Phase 1 on them)

Phase 1 items are independent of these. Phase 2's TypeScript/Vite migration and the SQLite fate decision are not. Ask these up front so the answers are ready when Phase 1 wraps:

> ✅ **ANSWERED — Mushtaq, 2026-07-15:**
> 1. **Brand → HOSTIX.** HOSTYLLO stays reserved for the separate cloud SaaS; DAMAM Boys Hostel and Zeerak Hostix are retired from app chrome. (Note: "DAMAM Boys Hostel" remains valid as a *sample default hostel name* in config — that's client data, not the app brand.)
> 2. **Color → violet `--accent-*`.** Phase 1 purges orange `--gold-*`/`--royal-*` (~150 refs) and re-points them to `--accent`. ⚠️ This is a client-visible look change (orange → violet) — call it out before shipping.
> 3. **Data layer → add real relational schema + indexes** (Phase 2), with a tested, lossless migration of every client's existing JSON-blob data before merge.
> 4. **Licensing → OUT of scope** for this remediation. No Ed25519 redesign now; Phase 1 only hardens what's cheap (CSP consolidation in 5.2). Preserve existing activation behavior exactly (Hard Rule #8).

1. **Brand name:** the audit found four identities shipped in one binary — HOSTYLLO (UI title, support link), HOSTIX (package name), DAMAM Boys Hostel (dialogs, About box, default config), Zeerak Hostix (package description). Which is canonical for *this* desktop app going forward? (Note: HOSTYLLO is reserved for the separate cloud SaaS successor per prior project context — confirm this desktop app should NOT be renamed to HOSTYLLO to avoid confusing the two products.)
2. **Color token:** violet `--accent-*` (per `tokens.css` and `CLAUDE.md` rule #5) or orange `--gold-*`/`--royal-*` (what's actually rendering in ~150 places)? CLAUDE.md says gold/royal are deleted; reality says they're load-bearing. Pick one, and Phase 1 will do the actual purge of the other.
3. **SQLite fate (needed before Phase 2, not Phase 1):** add real columns + indexes + WHERE-based queries (proper relational use), or drop SQLite entirely for a flat JSON file plus the in-memory diff-save approach that's already working? This determines whether Phase 2 includes a schema migration or a data-layer simplification — they are different projects.
4. **Licensing:** the audit flags the symmetric-secret scheme as bypassable. Is server-side Ed25519 activation in scope for this remediation, or is that a separate future project? Default assumption unless told otherwise: **out of scope for this remediation** — Phase 1 will only harden what's cheap (see 5.2), not redesign licensing.

---

## 5. Phase 1 — "Do Now" (days, high value / low risk)

Branch: `fix/phase-1-do-now`, off `master` (post Phase 0).

### 5.1 Electron upgrade
- Upgrade Electron off the EOL 22.3.27 line to the latest supported major.
- This will require rebuilding `better-sqlite3` for the new Electron ABI — do this explicitly with `electron-rebuild` (or the project's existing rebuild mechanism) and verify the native module loads before proceeding to anything else in this phase.
- Run the full manual QA checklist (Section 3) plus the Playwright smoke test against the upgraded Electron before committing.
- If the upgrade breaks anything (renderer APIs, CSP behavior, native module ABI), fix that specific breakage in this commit — do not defer it.
- Report: old version → new version, what broke, what you fixed, smoke test result.

### 5.2 Vendor the CDN dependencies (make "offline" actually offline)
- `npm install` local copies of: Chart.js + the datalabels plugin, SheetJS (xlsx), and the Google Fonts currently loaded remotely.
- Remove every runtime network fetch for these from `index.html` and wherever else they're pulled in.
- Self-host the fonts (woff2 files in the app bundle) rather than `@import`-ing Google Fonts at runtime.
- Fix the CSP so there is **one** policy, not two conflicting ones (currently a `<meta>` CSP in `index.html` and a separate header CSP in `main.js` that only partially agree). Keep the header-based one as canonical per the audit's recommendation; delete or reconcile the meta one so they don't silently intersect into something nobody intended.
- Verify: disconnect from the internet entirely, launch the app, confirm dashboard charts render and Excel import/export works with zero network calls. This is your acceptance test for this task — screenshot the offline run.

### 5.3 Delete dead code
- Delete `renderer/src/auth.js` (14KB, confirmed not loaded — `index.html` loads `auth-nev.js` instead) — but first grep the whole repo for any reference to it (including dynamic imports, string-based requires, or build config) to be certain nothing loads it conditionally.
- Delete `renderer/license.js` (10.6KB, root-level — confirmed not loaded, `index.html` loads `src/license.js`) with the same grep-first check.
- Do this as two separate commits, each with the grep evidence pasted into the commit message.

### 5.4 Resolve duplicate function definitions
For each of these, follow Hard Rule #5 — diff before deleting:
- `safeOpenWindow` (defined in both `utils.js` and `app.js`, with `app.js` currently winning because it loads last). Diff the two implementations, describe the behavioral difference, ask which is correct if it's not obvious, then keep exactly one definition and update all call sites/imports to reference it explicitly rather than relying on global load order.
- `fmtPhone` (defined in both `students.js` and `app.js`). Same process: diff, report, resolve, single source of truth.
- Grep the rest of the codebase for any other duplicate top-level function names across files before declaring this task done — the audit calls out two examples but says "six duplicate function definitions with silent shadowing" existed in the broader codebase audit; confirm you've found and resolved all of them, not just the two named here.
- Pay special attention to `showClearAllMenu()` — a prior finding (from earlier codebase work, referenced in project history) identified this as a **critical safety regression** where the `app.js` version silently wins and bypasses password protection entirely. Confirm this specific bug's current state before touching it, verify which version is live, and fix the security bypass explicitly — do not treat this as a routine dedup, treat it as a security fix and call it out separately in your summary even though it's mechanically similar to the other dedup work.

### 5.5 Unify branding and color tokens
- Using the answers from Section 4 (decisions 1 and 2), do a global find-and-replace to a single brand name across UI title, About box, dialogs, default config, and package metadata.
- Purge the non-canonical color token system. If violet `--accent-*` wins: remove `--gold-*`/`--royal-*` definitions from `style.css` and re-point every one of the ~150 references (29 in `dashboard.js` alone, per audit) to the canonical token. If gold/orange wins: do the reverse and update `CLAUDE.md` rule #5 to match reality instead of fighting it.
- Update `CLAUDE.md` and `README.md` in this same phase so documentation matches the current v4/SQLite reality (the audit notes `README.md` still describes v3/localStorage behavior). This is a documentation-only sub-commit — don't mix it with the color token code changes.

### 5.6 Phase 1 exit criteria
- Playwright smoke test green.
- Manual QA checklist passed.
- Offline launch verified (5.2).
- Single brand name, single color token system, single CSP, zero dead files, zero known duplicate function definitions.
- Written summary covering all of the above plus the `showClearAllMenu()` finding specifically.
- **Do not merge to master without my explicit go-ahead** — this phase touches security-relevant code (5.4's password-bypass fix) and I want to review before it ships to 50 live machines.

---

## 6. Phase 2 — "Do Next" (weeks, structural)

Do not start this phase until Section 4's decisions are answered and Phase 1 is merged and running clean for at least a few days of real use (or explicit sign-off to proceed sooner).

Branch: `fix/phase-2-do-next`, off updated `master`.

### 6.1 Introduce TypeScript + Vite incrementally
- Add Vite as the build tool. TypeScript allows `.js` files to coexist with `.ts` — do not attempt a big-bang conversion.
- Convert `utils.js` and `storage.js` first, per the audit's explicit recommendation, since these are the modules most likely to contain the kind of duplicate-definition and type-confusion bugs TS is meant to catch.
- After each file conversion, run the smoke test and full manual QA before converting the next file.
- Do not convert the entire codebase in this phase — define a small, explicit list of "Phase 2 TS conversion targets" (utils.js, storage.js, and any file directly touched by 5.4's fixes) and stop there. Broader conversion is a future phase, not this one.
- This is a good moment to also resolve any newly-surfaced duplicate-definition bugs TS' compiler catches that weren't visible before — report them as findings, don't silently absorb them into "the migration."

### 6.2 Playwright coverage expansion
- Expand beyond the single Phase 0 smoke test to cover: login failure states, payment recording edge cases (partial payment, overpayment if the app supports it), receipt generation, and the specific `showClearAllMenu()` password-protection path from 5.4 (this one especially — it was a live security bug, it needs a regression test that fails loudly if it ever reopens).

### 6.3 SQLite fate (per Section 4 decision 3)
- **If "add real schema":** design proper columns for the entities currently stored as JSON blobs, add indexes on whatever fields are actually filtered/searched in the UI, migrate existing client data losslessly (write and test a migration script against a copy of real production data structure, not synthetic data), and only then convert `dbAll()` call sites to use real WHERE clauses instead of loading everything into memory.
- **If "drop to flat JSON":** remove the `better-sqlite3` native dependency entirely (this also removes the `electron-rebuild`/ABI-pinning maintenance burden the audit flags), keep the existing diff-based `saveDB()` approach since it already works, and confirm this doesn't regress the app's data integrity guarantees under concurrent access (even though it's single-user desktop, confirm what happens on unexpected shutdown mid-write).
- Either path requires a migration test against realistic existing client data structure before merge — do not ship a data-layer change untested against real-shaped data.

### 6.4 Phase 2 exit criteria
- Expanded Playwright suite green, including the security regression test for 5.4.
- `utils.js` and `storage.js` fully converted to TS with no `any` types used as an escape hatch without justification.
- SQLite decision fully implemented per Section 4's answer, migration tested.
- Written summary, explicit ask for merge approval.

---

## 7. Phase 3 — "Later" (months, only if it pays off — do not start without explicit go-ahead)

Do not touch this phase unless told to. Listed here only so the roadmap is visible:

- Move HTML-string-concatenation modules (e.g. `students.js` at 136KB) to a lightweight component approach (Svelte, per the audit's recommendation as lightest lift for a no-framework codebase).
- Evaluate Tauri as an Electron replacement if install size/footprint becomes a competitive concern — this is an evaluation task (spike + writeup), not a commitment to migrate.

---

## 8. Reporting Format (use this structure for every phase summary)

```
## Phase N Summary

### Changed
- [file/area]: [what changed, one line each]

### Verified
- Smoke test: pass/fail, run count
- Manual QA checklist: pass/fail, what was checked
- [any phase-specific verification, e.g. offline launch, migration test]

### Findings (bugs discovered that weren't in the original audit)
- [if none, say so explicitly — don't omit the section]

### Deliberately not touched
- [what's in scope for a later phase but you saw and left alone, and why]

### Needs decision
- [anything blocking the next phase]

### Requesting merge approval: yes/no
```

---

## 9. Immediate first action

1. Save the audit text (Section 2) as `AUDIT_REPORT.md` at repo root, committed to a throwaway branch, merged to master as a documentation-only commit (this is the one exception to "every phase needs a branch" — a pure doc addition with zero code risk).
   - _Status: `AUDIT_REPORT.md` already created at repo root and inlined into Section 2 above (currently uncommitted, on branch `chore/audit-report`). The doc-only commit/merge to master is still pending your go-ahead._
2. Tag current state `pre-audit-baseline`.
3. Start Phase 0. Report back before starting Phase 1.
