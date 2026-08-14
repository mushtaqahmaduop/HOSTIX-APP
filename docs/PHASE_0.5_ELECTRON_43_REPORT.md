# Phase 0.5 — Electron 22 → 43 Upgrade Report

**Branch:** `chore/electron-43` (git worktree at `C:\HOSTIX-APP-electron43`, off `6bbf45c`)
**Date:** 2026-08-15
**Closes:** audit finding **C1** (EOL runtime) — the #1 security item in `ENTERPRISE_UPGRADE_PHASE0_AUDIT.md`
**Decision record:** `docs/ENTERPRISE_UPGRADE_DECISIONS.md` (D-4, D-5)

Per spec §49, this reports what was inspected, changed, preserved, discovered, and tested.

---

## 1. What changed

| Package | From | To | Note |
|---|---|---|---|
| `electron` | `^22.3.27` (EOL, Chromium 108) | `^43.4.0` | Current stable |
| `better-sqlite3` | `^9.4.3` | `^13.0.3` | N-API (`node-addon-api ^8`) |
| `electron-rebuild` | `^3.2.9` | **removed** | Deprecated; `@electron/rebuild ^4.0.4` was already a devDependency and provides the same `electron-rebuild` binary |

Build config (`package.json`), forced by better-sqlite3's new layout — see §4:

- `asarUnpack` — dropped `node_modules/bindings/**/*` and `node_modules/file-uri-to-path/**/*`.
  Both were better-sqlite3 9's loader dependencies and **no longer exist in the tree** at v13.
- `extraResources` — repointed from `node_modules/better-sqlite3/build/Release` to
  `node_modules/better-sqlite3/prebuilds`. The old path is now an empty directory, so
  that block was silently copying nothing.

## 2. The documented blocker is gone

`docs/ELECTRON_UPGRADE_PREP.md` deferred this upgrade on 2026-07-17:

> "This machine runs **Node 20.19.2**. Electron 43 requires **Node ≥ 22.12** (`EBADENGINE`)…
> node-gyp 12, which also requires Node ≥ 22 → the build dies."

The build machine now runs **Node v24.16.0**. `npm install` completed clean and
`electron-rebuild -f -w better-sqlite3` reported `✔ Rebuild Complete` with no
`EBADENGINE` and no `AssignProcessToJobObject` failure. That prep note is now stale.

## 3. Test results

Isolated licensed profile (`license.enc` copied from the live profile — same machine, so
the machine-bound license validates).

| Run | Result |
|---|---|
| Full suite ×1 | **14/14 passed** (1.6m) |
| Full suite ×2 | **14/14 passed** (1.5m) |
| Full suite ×3 | **14/14 passed** (1.6m) |

Three consecutive clean runs — no flakiness.

Covered by the passing suite: login and lockout, warden migration, add room, add student,
persistence across a full app restart, SQLite indexed WHERE queries through `dbAll`,
schema migration, payments (partial + overpayment), receipt rendering with no PKR-PKR
double prefix, CSV export column order, archive page, sidebar permissions, backup export,
reports overview with Chart.js canvas, dashboard trend, license page (badge `Active`,
expiry 28 February 2027). Renderer error array was empty on every page.

That is the CLAUDE.md mandatory smoke path — *login → dashboard → add student → record
payment → view receipt* — plus persistence and backup.

### ⚠ Coverage gap, stated honestly

The suite here is **14 tests across 6 spec files**. The owner's working tree has **12 spec
files**; six are **untracked** and have never been committed:

```
admit-to-payment.spec.js   month-name-mess.spec.js   payment-redesign.spec.js
rent-drift-repair.spec.js  settings-is-source.spec.js  zz-boot-diag.spec.js
```

They do not exist at `6bbf45c`, so they could not run. The audit's "20 specs, 18 pass /
2 fail" baseline was counted against the working tree, not the branch. **Electron 43 is
green against everything that is committed, and unverified against those six.**

### What was NOT tested (requires a human at the screen)

Per `ELECTRON_UPGRADE_PREP.md`, a headless agent cannot verify: print/PDF preview
appearance, chart visual correctness, Excel import/export round-trip, theme toggle,
native menus and About box, the license Info dialog. `QA_CHECKLIST.md` §A/§B still needs
a manual pass before merge.

## 4. Discovered — better-sqlite3 changed how it loads

v13 resolves its native binary through `lib/binding.js`:

```
prebuilds/<platform>-<arch>.node     ← tried first
build/Release/better_sqlite3.node    ← fallback (node-gyp layout)
```

`build/Release/` now contains only `obj/`; the real binary is
`prebuilds/win32-x64.node`. Because v13 is **N-API** (`node-addon-api ^8`), that binary is
ABI-stable across Node *and* Electron — which is why the app runs correctly even though
no Electron-specific `.node` was emitted.

Consequence: the two `package.json` build entries in §1 had to change, or the packaged
installer would ship without a loadable native module.

## 5. Discovered — `6bbf45c` is a broken commit (pre-existing, not caused by this upgrade)

The first smoke run failed at `#f-tname`. A diagnostic probe found the cause:

```
ReferenceError: resolveCharges is not defined
    at renderer/src/modules/students.js:543:26  (renderAddStudent)
```

`resolveCharges()` is called in **8 places** in `students.js` at `6bbf45c`, but its only
definition lives at `renderer/src/utils.js:129` in the owner's **uncommitted** working
tree. A fresh checkout of `feature/custom-titlebar` therefore has a non-functional
**Add Student** and **Edit Student** form.

To get a clean verdict on Electron 43, that one function was copied verbatim into this
worktree's `utils.js` behind a clearly marked `[chore/electron-43]` comment block.
`chargesBreakdown()` — the other function added in the same uncommitted diff — is not
referenced by committed code and was not copied.

**This is the owner's in-progress work and will collide on merge. Keep theirs, drop the
imported block.** Nothing in the owner's working tree was modified.

## 6. Preserved

- Licensing untouched — machine ID, `license.enc`, `last_run.dat`, AES-256-CBC + HMAC.
  (Hard Rule #8 / prep-note constraint.) License page verified `Active` under Electron 43.
- CSP unchanged; still `default-src 'self'` / `connect-src 'self'` single header.
- `printToPDF` already used the modern `margins` option shape, not the removed
  `marginsType` — no change needed.
- No renderer, schema, or business-logic change of any kind.

## 7. Remaining risks before this can ship

**R1 — 32-bit (ia32) builds are BROKEN. Confirmed, blocks release.**

`package.json` builds `--x64 --ia32` (nsis + portable), and `dist/` shows ia32 artifacts
were genuinely shipped for both 4.0.0 and 4.0.1 — this is a live target, not vestigial
config.

Electron is not the constraint: Electron 43 still publishes `electron-v43.4.0-win32-ia32.zip`.
**better-sqlite3 13 is.** Its `lib/binding.js` declares `PREBUILD_ARCHS = ['x64','arm64']`
and `prebuilds/` ships only `win32-x64` and `win32-arm64`. On an ia32 runtime
`getPrebuildPath()` returns `null`, the loader falls through to
`build/Release/better_sqlite3.node`, that file does not exist, and `require` throws —
the app cannot open its database at all.

Attempting the source build does **not** fix it and fails silently:

```
npx electron-rebuild -f -w better-sqlite3 --arch ia32
→ "✔ Rebuild Complete"        ← misleading
→ build/Release/ contains only .forge-meta (9 bytes); no win32-ia32.node anywhere
```

electron-rebuild detects the existing prebuild set and does nothing, while still
reporting success. **A packaged ia32 build would therefore ship a broken app and the
build logs would look clean.**

Spec §43 forbids silently dropping supported Windows versions. **Owner decision needed:**

- **(a) Keep 32-bit** — pin better-sqlite3 to a 9.x/11.x line that has an ia32 prebuild,
  or get a real x86 source compile working (VS Build Tools with the x86 toolchain,
  forcing node-gyp past the prebuild short-circuit). More toolchain, more fragility.
- **(b) Drop 32-bit** — build x64 only. Needs confirmation that no hostel among the 50+
  runs 32-bit Windows, plus §43's required documentation: why, who is affected, migration
  path, and customer communication.

Nothing else in this upgrade is blocked by R1 — the x64 path is clean.

**R2 — packaged build not yet produced or launched.** Everything above ran from source
via `npm start`/Playwright. The `asarUnpack`/`extraResources` fixes in §1 are reasoned
from the loader source, **not yet proven by running a packaged installer**.

**R3 — manual GUI QA outstanding** (§3).

**R4 — six untracked spec files unverified** (§3).

## 8. Definition of done — status

| Prep-note criterion | Status |
|---|---|
| Old→new version recorded | ✅ §1 |
| Native module loads | ✅ N-API prebuild, verified at runtime |
| Smoke test green ×3 | ✅ full suite ×3, 14/14 each |
| Full manual QA (print/charts/Excel) | ❌ needs a human |
| Packaged build launches | ❌ R2 |

**Not ready to merge.** Ready for the manual QA session.
