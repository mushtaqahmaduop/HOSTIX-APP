# Phase 2 — Integration shape against the Hostyllo SaaS

**Closes:** `docs/ENTERPRISE_UPGRADE_DECISIONS.md` §"Still open" → *"`C:\hostyllo`
integration shape — not yet inspected (D-1). Blocks Phase 2, not Phase 1."*
**Date:** 2026-08-19
**Inspected:** `C:\hostyllo` @ branch `Develop`
**Status:** findings are verified against the code; the proposed contract is a
design and is **not** agreed yet — see §7.

---

## 1. What was inspected

`C:\hostyllo` is a pnpm/turbo monorepo: `apps/api` (Fastify), `apps/web`
(Next.js), `apps/admin` (**empty — directory exists, contains no source**),
`packages/db`, `packages/config`, `packages/ui`.

Read: `apps/api/src/app.ts`, `server.ts`, `middleware/auth.ts`, `lib/jwt.ts`,
`lib/db.ts`, `lib/crypto.ts`, `routes/auth.ts`, all 14 files in
`packages/db/migrations/`, and the root `CLAUDE.md`.

---

## 2. What the SaaS already gives us

| Thing | Where | Fits Phase 2? |
|---|---|---|
| Fastify app with prefixed route modules | `apps/api/src/app.ts` | Yes — `/desktop/v1` registers exactly like `/api/v1/*` |
| Response envelope `{success, data}` / `{success, code, message}` | `app.ts` error handler | Yes — reuse verbatim |
| Global error handler that never leaks stacks | `app.ts:37` | Yes |
| Liveness `/api/v1/health`, readiness `/api/v1/ready` | `app.ts:84,101` | Pattern to copy for the desktop probe |
| **Asymmetric JWT signing already in use** — RS256 via `jose` | `lib/jwt.ts:40` | **Yes, and it matters** — see §5 |
| Untenanted queries via `pool`, tenant-scoped via `withTenant` | `routes/auth.ts:60` vs `:265` | Yes — registration is a pre-auth route, same shape as login |
| Redis token blocklist keyed on `jti` | `middleware/auth.ts:23` | Yes — device token revocation gets this for free |
| `hostels` with `plan`, `plan_status`, `trial_ends_at` | `migrations/001` | Partially — see §3 |
| `subscriptions` (status, period start/end) | `migrations/006` | Partially — see §3 |
| `api_keys` (hostel-scoped, `key_hash`, `expires_at`, `is_active`) | `migrations/007` | Nearest analogue to a device credential, but it is a *user-facing* API key, not device identity |

The API conventions are consistent and clean. Nothing about the existing server
argues against hosting the desktop surface here; D-1 holds up.

---

## 3. What does not exist — and it is bigger than "some endpoints"

**There is no `devices` table, no `licenses` table, and no representation of a
desktop installation anywhere in the schema.** Fourteen migrations, 28 tables,
none of them know the desktop product exists.

That is expected. The consequence is not:

> **A desktop install has no identity on either side of the wire.**

- On the SaaS side, everything is scoped to a `hostels` row. RLS policies are
  all `hostel_id::text = current_setting('app.hostel_id')`. There is no other
  tenancy concept.
- On the desktop side, a licence is a machine-bound `license.enc` — a hardware
  fingerprint and an expiry, encrypted with a key derived from that fingerprint.
  It carries **no customer identifier at all**. Nothing in it says which hostel
  or which person it belongs to.
- The only record that a given key was ever issued is
  `DAMAM_License_History.json`, which lives in the admin's **browser
  localStorage** and is auto-downloaded to their Downloads folder.

So "register this device" has no object to register *against*. Choosing what
that object is, is the real Phase 2 decision, and it is not implied by D-1.

---

## 4. The identity model — the decision D-1 left open

### Option A — a desktop install is a `hostels` row

Every desktop customer gets a tenant record. `plan_status` and `subscriptions`
carry the licence state. Devices hang off the hostel.

- Reuses RLS, plan/subscription machinery, and the future admin console.
- A desktop customer who later buys the SaaS is already a tenant — the upsell
  path is a plan change, not a migration.
- Cost: ~50 tenant rows that hold no hostel data, and `hostels.plan` CHECK
  constraints (`starter|pro|enterprise`) were written for SaaS plans, so they
  need a desktop plan value or a separate column.

### Option B — separate `desktop_licenses` + `desktop_devices` tables

Not tied to `hostels` at all. Own primary keys, own status column, no RLS
entanglement (they are not tenant data — they are *about* tenants).

- Simplest to build and reason about; no risk to live SaaS tenancy.
- Cost: a permanent second identity system. A desktop customer who buys the
  SaaS exists twice, and the admin console has two places to look. Every later
  "which customers do we have" question has to union two tables.

### Option C — `desktop_licenses` keyed to an *optional* `hostel_id`

Devices and licences get their own tables (B's simplicity), with a nullable
`hostel_id` FK that is filled in if and when that customer becomes a SaaS
tenant. One row to migrate, not two systems to merge.

**Recommendation: C.** It buys B's isolation — nothing touches live tenant
tables or RLS on day one — without B's permanent fork. The nullable FK is the
whole cost.

---

## 5. Two existing critical risks that Phase 2 can close for free

**C2 (the licensing secret ships in the asar).** Today `_SECRET` is symmetric
and packed into `app.asar`; anyone who unpacks it can mint unlimited licences.
An Ed25519 entitlement fixes this properly: the **server** holds the private
key, the app embeds only the **public** key, and unpacking the asar yields
nothing an attacker can sign with. `apps/api` already signs RS256 with `jose`,
which supports `EdDSA` — this is a key-generation and config task, not new
infrastructure.

**H1 (licence expiry trusts the local clock).** The entitlement carries a
server-issued `issuedAt`. The desktop caches it and can then detect a clock
that has moved backwards relative to the last server-observed time, instead of
trusting `new Date()` alone as `checkLicenseValidity()` does today.

Neither is a new workstream. They fall out of doing Phase 2 correctly, and
both are logged as **Critical/High** in the Phase 0 audit.

---

## 6. Proposed `/desktop/v1/*` contract

Written for Option C. Envelope and error handler are the existing ones.

Registered in `app.ts` as `app.register(desktopRoutes, { prefix: '/desktop/v1' })`.
Note this deliberately sits **outside** `/api/v1` per D-1, so the desktop
surface can be versioned and deprecated independently of the SaaS API.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/healthz` | none | Cheap probe. Feeds `ConnectivityService.API_REACHABLE`. Must not touch the DB — it is polled by every install. |
| `POST` | `/devices/register` | licence key + machine id | First contact. Binds a device to a licence, returns a long-lived device secret. |
| `POST` | `/devices/token` | device secret | Exchange for a short-lived access token (`jti` → existing Redis blocklist). |
| `GET` | `/entitlement` | device token | The signed Ed25519 entitlement. The one endpoint that matters. |
| `POST` | `/devices/deactivate` | device token | Releases the binding so the customer can move machines. |
| `GET` | `/release` | device token | Latest version + release notes. **Read-only** — no download, no install (D-2 descoped Upgrade B). |

### The entitlement

A compact JWS, `alg: EdDSA`, verified against a public key embedded in the app:

```
{
  ver: 1,
  deviceId, licenseId,
  machineId,                  // binding — see below
  status:    ACTIVE | GRACE | EXPIRED | SUSPENDED | REVOKED,
  expiresAt,                  // licence expiry, server's opinion
  issuedAt,                   // server time — this is what closes H1
  notAfter,                   // how long the desktop may cache this offline
  policy: { graceDays, readOnlyOnExpiry }   // D-3, server-side configurable
}
```

`machineId` was added during implementation and is not optional. The signature
proves the *server* issued the entitlement; it does not prove it was issued to
*this computer*. Without the binding, a valid entitlement copied from one
hostel's machine to another's would verify perfectly — which is exactly the
sharing a licence exists to prevent.

`status` maps onto D-3's table. `policy` being server-side is D-3's explicit
requirement ("the exact policy must be configurable server-side"). The desktop
caches the whole signed blob and keeps working from the cache while offline —
which is spec §3.1 Rule 6, and non-negotiable for a product whose customers
lose internet regularly.

### Desktop-side wiring

`services/config.js` already resolves `apiBase` from `HOSTYLLO_API_BASE` or
`<userData>/online-config.json`, normalises it, and returns `null` when unset —
and **every service performs zero network requests while it is null**. So the
desktop side of Phase 2 is: point `apiBase` at `https://<host>/desktop/v1`, add
an `EntitlementService` beside the existing four services, and leave the
rollout controlled by that one config value. Phase 1 was built for exactly this.

---

## 7. The migration problem — and why it needs an answer before code

50+ machines hold keygen licences with **no server record**. To bring them onto
entitlements, `/devices/register` has to decide whether to believe a licence
key it has never seen.

**Trust-on-first-use** — accept any key that passes the HMAC check, mint a
licence row. Simple, no data needed from the owner, and every existing install
migrates itself silently. But the HMAC secret is in the asar (C2), so this
**imports the forgery vulnerability into the server**: anyone who unpacked the
app can now register unlimited legitimate-looking licences on the control plane.
It turns a local crack into a permanent server-side account.

**Pre-seeded allowlist** — load the owner's issued-key history into
`desktop_licenses` first; `/devices/register` accepts only keys on that list.
Closes C2 at the boundary. **Checked, and it does not work — see §7.1.**

**Hybrid** — accept unknown keys but mark the licence `unverified`, admit it
read-only or on a short grace, and require the owner to confirm it in the admin
console before it goes `ACTIVE`. Nobody gets locked out by a lost record; nobody
forges their way to a full licence either.

### 7.1 The key history cannot identify customers — checked 2026-08-19

All 25 `DAMAM_License_History*.json` snapshots across `Downloads` and
`Downloads/Code` were merged and de-duplicated:

| | |
|---|---|
| Distinct keys on record | **12** |
| Carrying a client note | **1** (the note reads `mm`) |
| Date range | 24 Apr 2026 – 14 Aug 2026 |
| Format | all v3; no v4 keys recorded |

Twelve keys against a product described as running at 50+ hostels. That is not
a gap in record-keeping — it is the **direct consequence of the v3 format bug**
fixed on 2026-08-19: a v3 key was a pure function of its expiry month, so every
customer whose licence ended in the same month received the *identical key
string*. Twelve rows can legitimately cover fifty hostels, because dozens of
hostels were issued the same twelve strings.

Three things follow, and they are what actually shapes the migration:

1. **A key does not identify a customer, and never did.** An allowlist keyed on
   key strings would admit anybody holding a shared string — a paying hostel and
   whoever they forwarded it to are indistinguishable to the server. The
   allowlist option is not merely incomplete; it cannot express the thing it
   would need to express.
2. **There is no per-customer record to migrate.** The control plane does not
   inherit a customer list. The first entitlement registration is the moment
   customer identity is created for this product for the first time.
3. **Only `keygen.html` ever logged anything.** `keygen.js` (the CLI) writes no
   history at all, so keys cut from the terminal left no record even in
   principle. Issuing keys server-side once the control plane exists closes
   this permanently; until then, prefer the browser tool.

This makes the **hybrid** option the only one that both preserves service and
produces real records: an unknown key registers, is admitted (grace or
read-only per D-3), and surfaces in the admin console as an `unverified`
licence carrying its machine id, first-seen time and app version — which is the
first per-customer data this product will ever have had. The owner confirms or
rejects it there.

Note this also means the **v4 serial is load-bearing for the control plane**,
not just a bug fix: from now on each issued key is unique, so a v4 key
registering at `/devices/register` genuinely identifies one issuance.

---

## 8. What is blocked, and on whom

| # | Question | Blocks |
|---|---|---|
| 1 | Identity model — A, B or C (§4) | Schema, endpoints, admin console, migration |
| 2 | Migration trust — TOFU, allowlist or hybrid (§7) | `/devices/register` |
| 3 | ~~Is `DAMAM_License_History.json` complete?~~ | **Answered — §7.1. It is not, and cannot be. Allowlist is out.** |
| 4 | Does the desktop surface deploy to the **existing** Railway API service, or its own? | Deploy config, `CORS_ORIGIN`, env |

Nothing here should be guessed. Every one of them changes the shape of the code
that follows.

## 9. What is NOT blocked

These can proceed against any of the above.

### Done — 2026-08-19, desktop side only, no SaaS change

- **Ed25519 keypair generated.** `scripts/gen-entitlement-keypair.js` — key id
  `ent-20260819`. The script refuses to write a private key anywhere inside the
  repo, and `scripts/` is absent from the electron-builder allowlist, so the
  generator itself never ships. Public key committed to
  `services/entitlement-keys.js` as a **map keyed by `kid`**, so rotating the
  signing key does not strand machines on an older build. Private key and JWK
  written to `C:\Users\PCS\HOSTIX-backups\entitlement-keys\` — to be moved into
  the Railway secret store as `ENTITLEMENT_SIGNING_JWK` and deleted.
- **`services/entitlement.js`.** Verify path, strict claim validation, machine
  binding, on-disk cache, staleness against `notAfter`, and the server-time
  high-water mark that closes H1. 21 unit tests in `npm run test:services`
  (81 total, up from 60), signed with an ephemeral keypair so the suite never
  needs the real private key.
- **Wired into `services/index.js`** and exposed as `window.online.entitlement()`
  — a description of the licence state, never the signed token.

**It enforces nothing.** `checkLicenseValidity()` in `main.js` remains the sole
authority over whether the app runs, and `connectivity`'s `licenseProvider` was
deliberately NOT rewired: no machine in the field can obtain an entitlement
until `/devices/register` exists, so gating on one would lock out 50+ installs
in exchange for nothing. Every state reports `NONE`, `enforced: false`, and the
full suite (38 Playwright + 81 services + 39 licence + 13 retention + 6
migration) is green and unchanged.

### Still available without a decision

- The `GET /healthz` route — no schema, no identity, and it is what makes
  `ConnectivityService` show a real state instead of `NOT_CONFIGURED`.
- Amending `CLAUDE.md`'s "Nothing here depends on it" sentence, which D-1
  already flagged as becoming false.
