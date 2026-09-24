# Session handoff — 2026-09-24 — the owner's control panel

Branch `claude/new-session-fd63wc`, based on `origin/master` (5.1.0, `7ab6472`).
Plan: `docs/ADMIN_PANEL_PLAN_2026-09-24.md` (decisions D1–D5 in §8).
Nothing is merged, deployed or released.

## What was built

| Plan phase | What | Where |
|---|---|---|
| 1 — server model | Five-level access ladder (active / read-only / restricted / suspended / revoked); any level except revoked can be timed and lifts itself; per-hostel switches for data entry, printing, exporting; revision bumped by trigger; fleet-wide features and switches; roles (support / admin / owner); password re-check for revoke, bulk and fleet; TOTP 2FA; expiry extend **and** shorten; bulk actions in one transaction | `server/migrations/002_access_control.sql`, `server/src/lib/access.js`, `totp.js`, `sweeper.js`, `routes/admin.js` |
| 2 — live delivery | `GET /v1/devices/stream` (SSE) fed by Postgres `LISTEN/NOTIFY`; the app holds it open and syncs on `changed`. Presence ("online now") and "change received" ride on it. Poll fallback 60 → 10 min | `server/src/lib/realtime.js`, `routes/devices.js`, `services/stream.js` |
| 3 — app enforcement | Suspended **locks** (D1, no data download); restrictions enforced in the main process on every print/export path including a `will-download` hook; a lock takes the screen within ~0.4 s and lifting it brings the app back with no restart | `services/enforcement.js`, `main.js`, `renderer/src/enforcement-ui.js` |
| 4 — console | Rebuilt on the super-admin prototype: overview, hostels (filters, bulk, CSV), tabbed hostel detail, register hostel, fleet, audit, system, admins, my security | `server/public/` |
| 5 — one key, one PC | **v5 keys**: v4 layout, checksum under a `V5:` tag, issued only by the console, activated online once (D3), one PC. Old builds reject them outright. "Release PC" frees the seat and locks the old PC | `renderer/src/utils.js`, `main.js` (`_registerOnline`), `routes/devices.js` |

Also fixed on the way: **revocation could never reach the app** (same
diagnosis as `f79b114`, which exists only on the owner's PC). `/devices/token`
and `/devices/register` now authenticate only; policy lives in the signed
entitlement. The client re-registers before discarding its identity.

## How it was verified

| Check | Result |
|---|---|
| `server` `npm test` (stubbed HTTP + unit) | 29 + 21 passed |
| `server` `npm run test:pg` — **real Postgres**, real server, real SSE, every entitlement verified with the app's verifier | 23 / 23 |
| `npm run test:services` | 158 / 158 (13 new) |
| `test:license`, `test:activation`, `test:theme`, `test:export`, `test:update`, `typecheck` | all pass |
| **Real Electron app against a local control plane** (scratch harness, not committed) | 22 / 22 — v5 activation, read-only banner, save refused, export refused, feature lock, suspend → lock screen in 408 ms, lift → back in 410 ms, revoke, release PC, "change received" |
| Playwright specs (smoke, admit-to-payment, exports-pdf, toolbar-shared, backup-main-guard, licence-enforcement, students-export, backup-page, connection-panel, online-services, settings-license-connection, titlebar-keyboard, write-failure) | 39 / 41. Both failures are the container, not the code: `licence-enforcement:201` activates in a fresh profile and the container has no hardware fingerprint (reproduced on the unmodified repo); `write-failure:76` relies on `chmod 0444`, which root ignores |
| Console in Chromium, both themes, 1366×768 and 390 px | no script errors, no horizontal scroll |

`test:pg` needs a disposable database and refuses a hosted one:
`TEST_DATABASE_URL=postgres://…/scratch npm run test:pg` (from `server/`).

## Deploying — in this order

1. **Push the owner's local branch first** (`feature/students-register-2026-09-22`).
   It carries `a33c363`, `0763108`, `f79b114` and finance 1–7, none of which are
   on GitHub. Merging it with this branch conflicts in `main.js`,
   `services/device.js`, `server/src/routes/devices.js`, `services/enforcement.js`
   and `renderer/src/titlebar.js` — this branch re-does the same fixes, so keep
   this branch's versions of those hunks and the owner's for everything else.
2. **Migrate before deploying.** `002_access_control.sql` is additive and the
   server now on Railway runs fine on top of it; the NEW server code does not run
   without it.
   ```
   cd server
   railway service control-plane      # NOT Postgres — see the 09-24 handoff
   railway run npm run migrate
   railway run npm run migrate:status # 001, 002 applied
   ```
3. **Deploy the server** (`railway up` from `server/`). Health gate `/healthz`.
   No new environment variables.
4. **Turn on 2FA for the owner account** straight away (My security). The
   console shows a warning until you do.
5. **Release the app.** Nothing in phases 2, 3 or 5 reaches a hostel until a
   build carrying it ships. What changes for 5.1 installs with only the server
   deployed: revocation now reaches them (they lock); suspended stays read-only
   for them; read-only / restricted / the switches / the stream do nothing.
6. Issue **v5** keys only to hostels on the new build. The console defaults to
   v5 and offers v4 for a hostel on an old build or with no internet.

## Limits, stated plainly

- **An install that never connects never hears about a change** (D2, no
  check-in deadline). It runs to its key's own date. The console shows "last
  seen" and "change pending" so this is never a surprise.
- Printing through `window.print()` is gated in the renderer (a wrapper), not
  the main process — Electron offers no cancellable print hook. Every PDF path,
  the report window and every download are gated in the main process.
- Undo is a button on the confirmation toast (it sends the reverse change), not
  a 30-second hold before sending as the plan first said.
- Not built: an alert on mass revokes, an IP allowlist, a QR code for 2FA
  enrolment (the key and `otpauth://` link are shown instead — deliberately no
  third-party script on this page).
- The console loads Figtree / DM Mono from Google Fonts; it falls back to
  system fonts if blocked.
