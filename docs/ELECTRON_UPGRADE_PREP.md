# Phase 1 §5.1 — Electron Upgrade Prep Note

**Status:** DEFERRED to a focused session with GUI access (Mushtaq's call, 2026-07-16).
Everything below is groundwork so the upgrade is a clean, low-surprise task.

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
