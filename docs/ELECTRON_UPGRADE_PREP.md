# Phase 1 §5.1 — Electron Upgrade Prep Note

**Status:** BLOCKED — the Node ≥ 22.12 build-machine prerequisite is now satisfied
(this container runs Node 22.22.2), but a **new, higher-priority blocker** was found
on 2026-08-15: client OS support. See below before touching the Electron version.

## ⚠️ NEW BLOCKER (2026-08-15) — Windows 8 clients vs. Electron EOL

Client base was confirmed to include **Windows 8 through 10** machines, plus Mac
users. Electron 22.3.27 (current) is the **last** major version that supports
Windows 7/8/8.1 — Electron 23+ (Feb 2023, Chromium 110) requires Windows 10 or
later. Upgrading Electron and keeping Windows 8 clients working are mutually
exclusive; the original audit recommendation ("upgrade to latest supported major")
did not account for this.

**Needs a decision from Mushtaq before any upgrade work resumes:**
1. How many/which live clients are actually still on Windows 8 (vs. 8.1/10)?
2. Is dropping Windows 8 support acceptable going forward (new builds only —
   existing installs keep running their current version either way)?
3. If Windows 8 must stay supported indefinitely, the Electron 22 EOL/Chromium-108
   security debt from the audit is accepted as a permanent constraint, not a
   deferred task.

Do not bump the `electron` devDependency past `^22.x` until this is answered.

## Node-version blocker (RESOLVED 2026-08-15)

The prerequisite below (Node ≥ 22.12 on the build machine) is no longer a
blocker in this environment — noted here for history, not as an active gate.

An upgrade attempt to Electron 43 + better-sqlite3 12 failed at the native
build. Root cause is the **build machine's Node version**, not the code:

- This machine runs **Node 20.19.2**.
- Electron 43 requires **Node ≥ 22.12** (`EBADENGINE` on install).
- better-sqlite3 12 ships no prebuilt for Node 20 and falls back to source
  build via **node-gyp 12, which also requires Node ≥ 22** → the build dies with
  `AssignProcessToJobObject: (87) The parameter is incorrect`.
- Not a sandbox issue (failed identically with the sandbox disabled).

**Unblock:** install **Node 22 LTS** on the build machine (nvm-windows:
`nvm install 22 && nvm use 22`, or the Node 22 MSI), then re-run the procedure
below. The failed attempt was fully reverted; the app is back on the working
Electron 22 / better-sqlite3 9.4.3 stack (smoke test green).

Note: the app *ships* fine on Node 20 today — this prerequisite is only for
*building* the newer Electron/native-module toolchain.

## Why deferred
The upgrade needs a native `better-sqlite3` rebuild against the new Electron ABI
**and** a real GUI verification pass. The headless agent session can only run the
Playwright smoke test (boot + login + all pages + persistence) — it cannot see the
window, so the visual/UX side (menus, dialogs, print preview, charts) must be
eyeballed by a human. This is the audit's #1 security item and it ships to 50 live
machines, so it gets its own focused session, not a blind headless attempt.

## Current state
| Thing | Version |
|---|---|
| electron | `^22.3.27` (EOL, Chromium 108) |
| better-sqlite3 | `^9.4.3` (installed 9.6.0) |
| electron-rebuild | `^3.2.9` |
| electron-builder | `^26.8.1` |
| electron-updater | `^6.8.3` |
| Node ABI (current dev node) | 115 |

Rebuild is wired already: `postinstall` and `rebuild` scripts both run
`electron-rebuild -f -w better-sqlite3`.

## Recommended target
- Go to the latest **supported/stable Electron major** (verify EOL calendar at
  upgrade time — releases.electronjs.org). Prefer the highest major that still has
  a known-good `better-sqlite3` prebuilt for its ABI to avoid a source rebuild.
- Consider stepping (e.g. 22 → recent LTS-ish major) rather than one giant jump if
  renderer/CSP breakage appears; test each step with the smoke test.

## Procedure (in the focused session)
1. Branch stays `fix/phase-1-do-now` (or a sub-branch `fix/phase-1-electron` off it).
2. `npm i electron@<target> -D` (and bump `better-sqlite3` if the current version
   has no prebuilt for the new ABI).
3. `npm run rebuild` — confirm `better_sqlite3.node` builds/loads with **no** ABI error.
4. `npm start` — confirm the app boots, login works, DB reads/writes persist.
5. `npm run test:e2e` (set `HOSTIX_TEST_PROFILE` to an isolated profile with a copied
   `license.enc` + fresh DB — see `QA_CHECKLIST.md`). Run it 3× for flakiness.
6. Full **manual** QA (QA_CHECKLIST.md §A + §B): receipt/print preview, charts render,
   Excel import/export, theme toggle, license Info dialog, menus/About box.
7. `npm run build:installer` on Windows — confirm the packaged app launches and the
   native module is correctly `asarUnpack`-ed (it already is in package.json).

## Known risk areas to watch
- **Native ABI:** `better-sqlite3` must match the new Electron's Node ABI. If the
  installed 9.x has no prebuilt, either upgrade better-sqlite3 or ensure the source
  rebuild toolchain (VS Build Tools) is present.
- **CSP behavior:** we just consolidated to a single header CSP (§5.2). Newer Electron
  is stricter about some CSP/`webSecurity` defaults — re-verify no console CSP
  violations after upgrade (the offline-acceptance check pattern used in §5.2 is a
  good template).
- **Renderer API deprecations:** check `main.js` for any removed/renamed APIs
  (`remote` is long gone; watch `session`, `webRequest`, `dialog`, `Menu`,
  `printToPDF` option shapes used by receipts).
- **auto-updater:** `electron-updater` ^6.8.3 should be fine on modern Electron, but
  re-test the update dialogs (they were just rebranded to HOSTIX in §5.5a).
- **Preserve license behavior exactly** (Hard Rule #8) — do not touch the machine-id
  / `license.enc` / `last_run.dat` logic during the upgrade.

## Definition of done
Old→new version recorded, native module loads, smoke test green 3×, full manual QA
passed (incl. print/charts/Excel offline), packaged build launches. Report before merge.
