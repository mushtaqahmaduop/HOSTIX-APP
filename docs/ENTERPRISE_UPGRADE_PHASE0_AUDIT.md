# Phase 0 — Discovery & Audit

**Spec:** `HOSTYLLO_HOSTIX_ENTERPRISE_UPGRADE_SPEC.md` (Enterprise Online Services, Licensing, Updates & Support)
**Repo audited:** `C:\HOSTIX-APP` @ `feature/custom-titlebar`, app version `4.0.1`
**Date:** 2026-08-14
**Status:** No feature code written. This document is the §47 Phase 0 / §52 deliverable.

Everything below is cited to a file and line read during this audit. Where a prior
finding in `AUDIT_REPORT.md` (2026-07-15) has since been fixed, that is stated —
several have been, and the spec should not be planned against stale findings.

---

## 1. Current architecture assessment

```
Electron 22.3.27  (EOL — see C1)
│
├── main.js  (51 KB, single file)
│     ├── better-sqlite3 9.4.3   WAL, foreign_keys=ON
│     ├── licensing  (offline, keygen-based — §8 already partly exists)
│     ├── electron-updater 6.8.3 (GitHub provider)
│     ├── 26 explicit IPC channels
│     └── native menu + frameless title bar
│
├── preload.js  (7.5 KB) — contextIsolation:true, nodeIntegration:false
│     exposes 3 namespaces: electronAPI, titlebar, licenseAPI
│
└── renderer/  vanilla JS, no build step, no framework
      app.js + 13 feature modules + utils/receipt/auth
      vendored chart.umd.js + xlsx.full.min.js (no CDN)
```

**Storage model.** SQLite is used as a document store: every business table is
`(id TEXT PRIMARY KEY, data TEXT NOT NULL)` holding a JSON blob (`main.js:87`).
`migrations/001-relational-schema.js` promotes selected fields to real columns
behind a `PROMOTED` map, and `main.js:40` keeps a dual read/write path so writes
work identically before and after migration. The renderer loads the **whole
database into memory** as a global `DB` object and persists with `saveDB()` →
`db:bulkReplace`.

**Network posture.** The CSP is a single header (`main.js`, no competing `<meta>`)
with `default-src 'self'` and **`connect-src 'self'`**. Zero remote references
remain anywhere in `renderer/` — the CDN dependency flagged in the July audit
(§3 of `AUDIT_REPORT.md`) **has been fixed**; Chart.js and SheetJS are vendored.

This is architecturally lucky: `connect-src 'self'` means the renderer *cannot*
reach the Hostyllo API even if someone tries. All online traffic is forced through
the main process, which is exactly what spec §3.5 demands. **Do not relax it.**

---

## 2. Existing capability inventory

The spec's Rule 5 says evaluate what exists before adding a second implementation.
Here is what is already there.

| Spec area | Status | Evidence |
|---|---|---|
| Licensing | **Exists** (offline) | `main.js:134–365`, `license.enc`, `keygen.js` |
| Device binding | **Exists** | `getMachineId()` `main.js:199` — sha256 of machine identifiers, cached |
| License tamper detection | **Exists** | AES-256-CBC + HMAC-SHA256, key = scrypt(machineId + `_SECRET`) `main.js:218–238` |
| Auto-update | **Exists but half-wired** | electron-updater `main.js:121–128`, `setupAutoUpdater()` `:953` |
| Update UI | **Missing** | `update:check` / `update:install` handlers exist (`main.js:1009,1019`) but **preload exposes nothing** (0 matches) and no renderer code calls them — dead code |
| Pre-migration backup | **Partial** | `hostix.db.pre-v1.bak` written once before first migration `main.js:100–108` |
| Backup / restore | **Exists** | JSON export/import, 50 MB cap, native dialogs `main.js:410–438` |
| Activity log | **Exists** | `activitylog` table — business audit trail, not diagnostics |
| Connectivity service | **Missing** | — |
| Structured logging | **Missing** | `console.log` only; no `uncaughtException` / `unhandledRejection` handler in main |
| Crash reporting | **Missing** | — |
| Help & Support | **Missing** | — |
| Release pipeline / CI | **Missing** | `.github/workflows/` holds only a stock `npm-publish-github-packages.yml` |
| Code signing | **Disabled** | `signAndEditExecutable:false`, `verifyUpdateCodeSignature:false` (`package.json`) |

**Test baseline that already exists** and must not regress: 20 Playwright Electron
specs, currently **18 pass / 2 fail**. Both failures are pre-existing and unrelated
to this spec — `settings-is-source` needs a `HOSTIX_REAL_PROFILE` env var, and
`zz-boot-diag` asserts `#f-pamt`, a field that only exists in the retired payment
modal.

---

## 3. Risk register

Classified per §6.2. "Blocks?" = does this stop the upgrade proceeding.

### Critical

**C1 — Electron 22.3.27 is end-of-life. Blocks: yes (for the "enterprise" claim).**
No Chromium security patches since ~2023, on 50+ production machines. Already
investigated: `docs/ELECTRON_UPGRADE_PREP.md` records the upgrade as **deferred
because the build machine needs Node ≥ 22.12**. Shipping a connected,
internet-facing product on an EOL runtime is the single largest liability in this
plan, and it is a prerequisite for Upgrades A and B, not a parallel task.

**C2 — The licensing secret ships inside the application. Blocks: yes (for §11).**
`main.js:134` — *"Hex-encoded secret — MUST match `_SECRET` in keygen.js exactly."*
It is a **symmetric** secret packed into `app.asar`. Key validity is an HMAC over
the expiry encoded in the key itself (`_getExpiryFromKey` `main.js:252`,
`validateKeyChecksum` in `renderer/src/utils.js:567`). Anyone who unpacks the asar
can mint unlimited licenses with any expiry. This is precisely what spec §11 and
Rules 7–8 forbid. It also means **the current scheme cannot be the trust root** for
the new control plane.

**C3 — Unsigned artifacts with silent auto-download. Blocks: yes (for §20).**
`autoUpdater.autoDownload = true` and `autoInstallOnAppQuit = true` (`main.js:124–125`)
against GitHub releases, with code signing switched off in `package.json`.
electron-updater does verify the SHA-512 from `latest.yml`, so this is not
"download and execute anything" — but there is **no publisher authenticity**, and
`verifyUpdateCodeSignature:false` disables the one check that would catch a
substituted installer. §20 requires signed artifacts and a trusted release source.

### High

**H1 — License expiry trusts the local clock.** `main.js:299–301` compares
`new Date()` against the stored expiry. Winding the system clock back extends any
license indefinitely. §13 calls this out explicitly.

**H2 — No rollout control.** Every published GitHub release reaches every
installation immediately and silently. §18 forbids exactly this; a defective
release currently has a blast radius of 100% of customers.

**H3 — No user-visible update state.** Because the update IPC is unreachable from
the UI, there is no release-notes screen, no update history, no progress, and no
failure surface. §39's "The update could not be installed…" state cannot be shown.

**H4 — Inconsistent HTML escaping into a privileged bridge.** The July audit found
`escHtml()` applied unevenly across renderer string interpolation while the preload
exposes `dbUpsert` / `dbDelete` / `openExternal`. `contextIsolation` limits blast
radius but does not remove it. **Not re-verified in this pass** — needs its own
sweep before the support module (which will render server-supplied content) lands.

**H5 — No diagnostics substrate.** §24 requires app version, OS version, schema
version, device ID and connectivity state on every ticket, and §40 requires
structured, redacted logs. None of that exists today.

### Medium

- **M1 — Generic DB primitives are exposed to the renderer** (`db:all`, `db:upsert`,
  `db:bulkReplace`, `db:importFull`). §3.5 says never do this. But it *is* the
  application's core architecture, and Rule 3 forbids rewriting working subsystems
  without evidence. **Recommendation: freeze, don't rewrite.** New online features
  get their own narrow channels; the legacy DB bridge is not extended.
- **M2 — `'unsafe-eval'` remains in `script-src`.** Narrow it or document why.
- **M3 — Releases are manual.** §44's pipeline does not exist.
- **M4 — JSON-blob storage** limits per-field migration and any future delta sync.
- **M5 — Version confusion.** App version (`4.0.1`) and `migration001.SCHEMA_VERSION`
  are separate; §41 requires they never be conflated. They currently are not, but
  nothing enforces it.

---

## 4. Proposed target architecture

Additive. Nothing existing is replaced.

```
Renderer  (unchanged; still cannot reach the network — connect-src 'self')
   │
Preload   + window.online   { status, onStatusChanged }
          + window.support  { createTicket, listTickets, reply, attach }
          + window.updates  { check, state, install, releaseNotes }
          + window.license  (extends existing licenseAPI)
   │  narrow, validated, one method per use case
Main process
   ├── existing: SQLite, licensing, menus, backup/restore
   ├── ConnectivityService   NETWORK → API → AUTHENTICATED → LICENSE_VALID
   ├── ApiClient             timeouts, backoff+jitter, retry cap, idempotency
   ├── EntitlementService    Ed25519 verify, secure cache, offline window
   ├── UpdateService         wraps existing electron-updater; adds gating + backup
   ├── SupportService        durable queue, attachment policy
   ├── Diagnostics           structured logs + redaction layer
   └── OnlineQueue           SQLite-backed, survives restart
```

**The four states of §7 map onto real conditions here:** `NETWORK_AVAILABLE` from
the OS, `API_REACHABLE` from a cheap `/healthz`, `AUTHENTICATED` from device token,
`LICENSE_VALID` from the cached entitlement. `navigator.onLine` is unavailable to us
anyway — the renderer has no network — which conveniently satisfies §7's warning.

---

## 5. Database impact assessment

| Feature | Storage | Schema change |
|---|---|---|
| Entitlement cache | Extend the existing `license.enc` file pattern | **None** |
| Device identity | `license.enc` + existing `getMachineId()` | **None** |
| Update state/history | New `updates` table | **v2** |
| Support tickets + messages | New `support_tickets`, `support_messages` | **v2** |
| Online queue | New `online_queue` | **v2** |
| Help article cache | New `help_articles` (or a file cache) | **v2** |

Upgrades A and B need **no schema change at all** if the entitlement stays outside
SQLite — which is the right call, because it keeps licensing working even if the
database is being restored. Only Upgrade C forces schema v2.

Schema v2 must follow §21 exactly. The good news is that the pattern already exists
and has run in production: `main.js:100–108` snapshots to `.pre-v1.bak`, migrates in
a transaction, and on failure **logs and continues on the existing schema rather
than destroying it**. What is missing versus §21 is the *post*-migration integrity
check and an explicit "migration successful" marker. Add both.

---

## 6. API / control-plane architecture — **decision required**

The spec (§35) assumes a control plane may need building. Before building one, note
that a Hostyllo SaaS control plane **already exists** at `C:\hostyllo`: Railway
staging/prod, two Supabase projects, a deployed frontend. The endpoints §35 lists
(devices, licenses, updates, support) are a natural module of that system.

Against it: `CLAUDE.md` in this repo states plainly — *"This is the offline desktop
product. The separate cloud SaaS lives at `C:\hostyllo` — different repo, different
rules. **Nothing here depends on it.**"* Wiring the desktop app to that control
plane deliberately breaks that separation.

**This is your call, not mine.** The options:

- **(a) Extend the existing Hostyllo SaaS** — fastest, one auth model, one ops
  burden, one bill. Requires amending the CLAUDE.md separation rule.
- **(b) A small dedicated control plane** — preserves the separation, but is a
  second service to deploy, secure, monitor and pay for.

I recommend **(a)**, with the desktop app talking only to a versioned
`/desktop/v1/*` surface so the coupling is explicit and narrow. But I have not
inspected `C:\hostyllo` in this pass, so treat that as a recommendation to validate,
not a finding.

---

## 7. Security model

```
Server holds Ed25519 private key  ──────────── never ships
        │ signs
        ▼
Entitlement { license_id, hostel_id, plan, status, issued_at, expires_at,
              grace_until, device_id, last_verified_at, server_timestamp }
        │
        ▼
Client verifies with the PUBLIC key baked into the app
        │
        ▼
Cache in license.enc (existing AES-256-CBC + HMAC, machine-bound)
```

The existing `license.enc` container is sound and stays — it is machine-bound and
tamper-evident. What changes is **what goes inside it**: today a self-authorising
key, tomorrow a server-signed entitlement. The symmetric `_SECRET` stops being a
trust root and survives only for the migration window (§9).

**Clock tampering (§13, fixes H1):** store `server_timestamp` and `last_verified_at`
from each successful verification, and a monotonic local marker. If the system clock
ever reads *earlier* than the last recorded server timestamp, treat the clock as
untrusted and require online verification. Document the limit honestly: this raises
the cost of tampering, it does not eliminate it, and an air-gapped machine with a
rolled-back clock remains defeatable.

---

## 8. Update strategy

Extend electron-updater — do not add a second updater (Rule 5).

1. **Sign the artifacts.** C3 is a hard prerequisite; everything else is theatre
   without it. Acquire an OV/EV code-signing certificate, then set
   `signAndEditExecutable:true` and `verifyUpdateCodeSignature:true`.
2. **Turn `autoDownload` off.** Move to server-gated checks so §19 eligibility
   (license status, channel, rollout %, minimum supported version) is evaluated
   *before* a download starts.
3. **Point the feed at the control plane** (generic provider) instead of GitHub
   directly, so rollout percentage becomes controllable. GitHub can remain the
   artifact host.
4. **Wire the dead IPC** — `update:check` / `update:install` already exist. Expose
   them through preload and build the UI. Cheapest win in the whole spec.
5. **Pre-update backup hook** before `quitAndInstall`, per §16.

---

## 9. Licensing strategy — and the migration that matters

Introduce the five explicit states (`ACTIVE / GRACE / EXPIRED / SUSPENDED / REVOKED`)
in place of today's valid/invalid/expired booleans, with enforcement configured
server-side (§10) and — non-negotiably — **never destructive**.

The hard part is the **50+ hostels already running keygen licences**. They must not
be locked out by an update. Proposed dual-trust window:

```
v4.x  (today)      keygen key only
v5.0  transitional accepts EITHER a keygen key OR a signed entitlement;
                   silently exchanges a valid keygen key for an entitlement
                   on first successful contact with the control plane
v5.x  (later)      entitlement only; keygen path removed once telemetry shows
                   every active install has migrated
```

Existing installs that never come online keep working on the keygen path until
their key expires. That satisfies §42 and Rule 4.

---

## 10. Support strategy

New `support/*` IPC namespace, schema v2 tables, and a durable `OnlineQueue` so a
ticket raised offline is never lost (§26). The **redaction layer (§25) is a
prerequisite, not a follow-up** — this database holds student CNICs, phone numbers
and payment records. The auto-attached metadata of §24 (hostel ID, licence ID, app
version, OS, schema version, device ID, connectivity, timestamp) contains no PII and
is safe; anything beyond it must be explicitly opted into per-ticket.

---

## 11. Migration strategy for existing installations

1. Ship the transitional release on the **existing** update channel.
2. On first run: back up the DB, migrate to schema v2, verify, mark successful.
3. Register the device against the control plane using the existing machine ID.
4. Exchange the keygen key for a signed entitlement; keep the keygen path alive.
5. No re-installation, no re-activation, no data re-entry for the customer.

---

## 12. Test strategy

Extend the existing Playwright Electron suite rather than starting a new one. It
already boots a real Electron app against an isolated licensed profile, which is
exactly the harness the §45 matrix needs.

Add: connectivity (online / offline / flaky / API down / DNS fail / slow),
licensing (all five states + renewal + reactivation + device deactivation + offline
past the verification window + **clock rolled back**), updates (no update / patch /
major / interrupted download / interrupted install / migration success / migration
failure / corrupt artifact / rollout disabled), support (create online, create
offline, queue, retry, attachment size and type rejection, reply, resolve, reopen).

Fix the two pre-existing failures first so red means red.

---

## 13. Phased plan

Ordered by dependency, not by the spec's numbering — two blockers come first
because the rest is unsafe without them.

| Phase | Work | Gate |
|---|---|---|
| **0.5** | **C1** Electron upgrade (unblock Node ≥22.12 on the build machine) | Full suite green on the new major |
| **0.6** | **C3** Code-signing certificate + signed build | A signed installer verifies on a clean Windows box |
| 1 | ConnectivityService, ApiClient, OnlineQueue, structured logging + redaction, design tokens | Offline behaviour unchanged; queue survives restart |
| 2 | Control-plane decision (§6) + device registration + Ed25519 entitlements + dual-trust migration | An existing keygen install upgrades without lockout |
| 3 | Update gating, rollout %, channels, pre-update backup, update UI (wire the dead IPC) | Failed update leaves data and install intact |
| 4 | Help & Support, offline ticket queue, sanitised diagnostics | Ticket raised offline arrives after reconnect |
| 5 | Admin control plane: hostels, licences, devices, releases, tickets, audit log | Every privileged action audited |
| 6 | Hardening: H4 escaping sweep, M2 CSP, failure/migration/perf testing | Security review passes |
| 7 | Internal → pilot → beta → staged stable | Rollback rehearsed |

---

## Answers needed before Phase 1

1. **Control plane: extend the Hostyllo SaaS, or build a dedicated service?** (§6)
   This changes the shape of everything downstream.
2. **Code-signing certificate — is one being purchased?** If not, Upgrade B cannot
   meet §20 and should be descoped rather than shipped insecurely.
3. **Enforcement policy for `EXPIRED`** — the spec's default is read-only. Confirm,
   since it decides what 50+ paying hostels see the day a licence lapses.
4. **Is the Electron upgrade authorised now?** It is the prerequisite for the rest,
   and it is the riskiest single change to a stable production app.

---

## Note on repository state

This audit was read-only. The working tree currently carries substantial uncommitted
work on `feature/custom-titlebar` (Add Payment page, settings rebuild, report fixes)
that is unrelated to this spec and untouched by it.
