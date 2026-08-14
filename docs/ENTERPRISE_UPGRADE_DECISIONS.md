# Enterprise Upgrade — Owner Decisions

**Date:** 2026-08-15
**Follows:** `docs/ENTERPRISE_UPGRADE_PHASE0_AUDIT.md` §"Answers needed before Phase 1"
**Spec:** `HOSTYLLO_HOSTIX_ENTERPRISE_UPGRADE_SPEC.md`

The Phase 0 audit closed with four blocking questions. These are the owner's answers,
recorded so no later session re-litigates them.

---

## D-1 — Control plane: **extend the existing Hostyllo SaaS**

The desktop app will talk to a versioned `/desktop/v1/*` surface on the existing
Hostyllo SaaS (`C:\hostyllo` — Railway staging/prod, Supabase). Not a second service.

**Consequence — `CLAUDE.md` must be amended.** It currently states:

> "This is the offline desktop product. The separate cloud SaaS lives at `C:\hostyllo`
> — different repo, different rules. **Nothing here depends on it.**"

That sentence becomes false the moment Phase 2 lands. It must be rewritten to describe
the *narrow, versioned, optional* dependency, not deleted — the point it was making
(the desktop app is not a client of the SaaS's hostel-management features) still holds.

**Constraint that survives:** the dependency is optional at runtime. The control plane
being unreachable must never stop hostel operations (spec §3.1, Rule 6).

**Unvalidated:** `C:\hostyllo` was not inspected during Phase 0. The integration shape
must be confirmed against that repo before Phase 2 work starts.

---

## D-2 — Code signing: **not being purchased → Upgrade B is descoped**

No Windows code-signing certificate will be acquired. Per spec §20, auto-updates cannot
meet the integrity bar without one, so **Upgrade B (Automatic Updates) is shelved** rather
than shipped insecurely.

### ⚠ Descoping is not the same as being safe today

The app as it currently ships already does the risky thing. `main.js:124–125`:

```js
autoUpdater.autoDownload = true;          // downloads silently in background
autoUpdater.autoInstallOnAppQuit = true;  // installs when the user quits
```

…against GitHub releases, with `signAndEditExecutable: false` and
`verifyUpdateCodeSignature: false` in `package.json`.

So 50+ production machines currently accept silent, unattended installation of
**unsigned** artifacts. electron-updater does check the SHA-512 from `latest.yml`, so
this is not arbitrary-code-execution — but there is no publisher authenticity, and the
one check that would catch a substituted installer is switched off.

**Descoping Upgrade B leaves that live.** It is a build-forward decision, not a
remediation.

### ✅ Remediated on `chore/electron-43` (owner: "decide for me", 2026-08-15)

- `autoDownload = false`, `autoInstallOnAppQuit = false` (`main.js:121–131`).
- `update-available` no longer claims "downloading in the background". It now offers
  **Get Update** / **Later**; Get Update opens the GitHub releases page via
  `shell.openExternal` and the owner installs deliberately.
- The manual `doCheckUpdates()` path and the `update:check` / `update:install` IPC are
  untouched, so nothing is lost and re-enabling is a two-line change.

Customers stay informed about new versions; nothing installs itself. **Re-enable both
flags only together with real code signing.**

---

## D-3 — `EXPIRED` enforcement: **read-only**

Spec §10's default is adopted. Past the grace window:

| State | Behaviour |
|---|---|
| `ACTIVE` | Full operation |
| `GRACE` | Full operation + renewal warning |
| `EXPIRED` | **Read-only** — all existing data and reports viewable; no new students, payments, expenses or edits. Renewal clearly presented. |
| `SUSPENDED` | Read-only + suspension reason + support/renewal route |
| `REVOKED` | Restricted access |

**Never destructive** (spec §10): no data deletion, no punitive encryption, no hidden
history, no deleted backups. Enforcement is an access policy applied at the write path.

The exact policy must be configurable server-side, and it is centralised in one module —
not scattered across feature files (spec §12).

---

## D-4 — Electron upgrade: **authorised, and it goes first**

Phase 0.5 (`C1`) proceeds ahead of all feature work.

**The July blocker is gone.** `docs/ELECTRON_UPGRADE_PREP.md` deferred this on
2026-07-17 because the build machine ran Node 20.19.2 and Electron 43 / node-gyp 12
require Node ≥ 22.12. The machine now runs **Node v24.16.0**, so the documented
prerequisite is satisfied and that note is stale.

| | From | To |
|---|---|---|
| electron | `^22.3.27` (EOL, Chromium 108) | `^43.4.0` (current stable) |
| better-sqlite3 | `^9.4.3` | `^13.0.3` |
| electron-rebuild | `^3.2.9` (deprecated) | **removed** — `@electron/rebuild ^4.0.4` already present and provides the same `electron-rebuild` bin |

---

## D-5 — Workspace: **isolated git worktree**

The upgrade runs in `C:\HOSTIX-APP-electron43` on branch `chore/electron-43`, branched
from the last clean commit `6bbf45c`.

Reason: `feature/custom-titlebar` carries ~2,045 uncommitted lines of unrelated
in-progress work (Add Payment page, settings rebuild, report fixes). Running the upgrade
on top of that would make every Playwright failure ambiguous — Electron 43, or the
half-finished work? The worktree gives a clean attribution and leaves the owner's editor
untouched.

---

## Revised phase plan

Reordered from the audit's table to reflect D-2 (Upgrade B out) and D-4 (Electron first).

| Phase | Work | Gate |
|---|---|---|
| **0.5** | Electron 22 → 43, better-sqlite3 9 → 13, native rebuild | Suite green ×3 + manual GUI QA (`QA_CHECKLIST.md` §A/§B) |
| **0.6** | ~~Code-signing certificate~~ | **Dropped per D-2** |
| **0.7** | Disable unattended unsigned auto-install (see D-2 follow-up) | Pending owner confirmation |
| 1 | ConnectivityService, ApiClient, OnlineQueue, structured logging + redaction layer, design tokens | Offline behaviour unchanged; queue survives restart |
| 2 | `/desktop/v1/*` on Hostyllo SaaS; device registration; Ed25519 entitlements; dual-trust keygen migration | An existing keygen install upgrades without lockout |
| 3 | ~~Update gating, rollout %, channels~~ | **Descoped per D-2.** Manual update check + release-notes surface only |
| 4 | Help & Support, offline ticket queue, sanitised diagnostics | Ticket raised offline arrives after reconnect |
| 5 | Admin control plane: hostels, licences, devices, tickets, audit log | Every privileged action audited |
| 6 | Hardening: H4 escaping sweep, M2 CSP, failure/migration testing | Security review passes |
| 7 | Internal → pilot → beta → staged stable | Rollback rehearsed |

---

## D-6 — 32-bit Windows: **keep it**

better-sqlite3 13 has no ia32 prebuild and its build system silently skips the ia32
source compile, so Electron 43 would have shipped a dead 32-bit app with clean build
logs. Rather than drop 32-bit, the compile was forced and verified (genuine i386 PE
binary against Electron 43 headers) and wrapped in `npm run rebuild:ia32`.

Reasoning: dropping 32-bit silently breaks paying hostels, spec §43 forbids it without
documented migration and communication, and there was no evidence that no hostel runs
32-bit Windows. A build step is the cheaper price. Full detail in
`docs/PHASE_0.5_ELECTRON_43_REPORT.md` §R1.

---

## Still open

- **`C:\hostyllo` integration shape** — not yet inspected (D-1). Blocks Phase 2, not Phase 1.
- **Packaged installers** — neither x64 nor ia32 has been built and launched yet. The
  packaging config changes are reasoned from loader source, not proven.
- **Manual GUI QA** — print/PDF, charts, Excel, menus, About, License Info. Needs a human.
- **H1 clock trust** — the entitlement design in the audit §7 fixes it; unchanged by these
  decisions.
