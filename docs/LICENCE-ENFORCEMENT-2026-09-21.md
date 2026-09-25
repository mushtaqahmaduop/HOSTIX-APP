# Suspend and revoke — why neither bit, and what is fixed

**2026-09-21.** Owner: "the suspend and revoking in control plane still does not
work and cant suspend a hostel license or revoke actions."

They are two different faults that produce the same symptom. Neither is in the
portal: the portal writes the status correctly and always has.

---

## Evidence, before any of the reasoning

Read off this machine, not inferred.

| Fact | Where |
|---|---|
| The installed app **received** `SUSPENDED` and then `ACTIVE` again | `%APPDATA%\hostix-app\logs\hostyllo-2026-09-20.log`, `entitlement_synced state=SUSPENDED changed=true` at 17:16:15Z |
| Its device is now **refused** by the live control plane | `POST /v1/devices/token` → `401 DEVICE_UNAUTHORIZED`, with the app still running normally |
| The dev profile syncs hourly and always reads `ACTIVE` | `.devdata/logs/*`, `entitlement_accepted status=ACTIVE` |
| The live service is healthy and signing | `GET /v1/healthz` 200; entitlements carry `kid: ent-20260819` |

So: suspension **arrives** and does nothing. Revocation **never arrives**.

---

## 1. Suspend — it reaches the app; the shipped build does not act on it

The delivery chain is fine end to end. What is missing is the enforcement, and
it is missing *only from what the customers run*:

- `a33c363` — suspension locks the app
- `0763108` — the owner's own 2026-09-20 report, "only the warning issues but
  still the warden can enter data": `requireWritable()` was called on eleven
  paths and none of the ones that matter

Both are on `design/dashboard`. **Neither is on `master`, and no installer
carries them.** On `master`, `SUSPENDED` is still a read-only state whose
refusal happens in the main process where nobody sees it.

**Nothing further to write for this half. It needs a merge and a build.**

## 2. Revoke — the control plane refused to tell the app

`/v1/devices/token` answered `401` to a revoked licence and
`/v1/devices/register` answered `403 LICENSE_REVOKED`. The reasoning was
account-enumeration: do not let a caller learn whether a licence is live.

The cost was the whole feature:

1. A device token lasts **15 minutes**; the app syncs every **6 hours**. Every
   real sync therefore begins at `/devices/token`.
2. It gets `401`, reads that as "my secret was rejected", and re-registers.
3. Registration answers `403`. The sync fails.
4. `services/device.js` cleared the credentials file **before** that attempt, so
   the machine is now unregistered with no way back. Every later sync dies at
   registration.
5. The cached `ACTIVE` entitlement keeps answering for its full 14 days, then
   the local `license.enc` takes over. The hostel is revoked in the portal and
   working normally on the desk — permanently.

An HTTP refusal could not have fixed this either: it is **unsigned**, so the app
must not act on it. `CLAUDE.md` names the reason — a recycled
`*.up.railway.app` name must not be able to switch 50 hostels off. Revocation
has to travel the way a suspension does, inside the Ed25519-signed entitlement.

### Fixed

- `server/src/routes/devices.js` — `/devices/token` authenticates and no longer
  decides licence policy; `/devices/register` admits a revoked licence, on the
  same argument already written in that file for a suspended one. Both then let
  `/v1/entitlement` hand back a **signed `REVOKED`** statement, which is what
  locks the app. A deactivated *device* and a wrong secret are still `401` —
  those are authentication answers.
- `services/device.js` — re-register first, discard the old credentials only
  once a replacement exists, and re-register at most once per sync. The old code
  also looped forever between the two endpoints against a server that issued
  credentials it then refused.

### Why no test caught it

`tests/control-plane-sync.spec.js` revokes while the app still holds a token
fetched seconds earlier, so it goes straight to `/v1/entitlement`. **No install
in the field is ever on that path.** `scripts/e2e-admin-portal.js` was worse: it
asserted the `401` and the `403` as the requirement, so the bug had a passing
test of its own.

Both now assert what matters — that the app *ends up* `REVOKED` and blocked,
from the entitlement and not from the licence file. The spec adds a **cold
start**: close the app with the licence revoked, open it again, and require the
lock. That is the field path and it needs no test seam, because a fresh process
holds no token.

---

## Tests

| Suite | Result |
|---|---|
| `server/test/http.js` | 26 passed (5 new; 2 of them fail against the old routes) |
| `npm run test:services` | 148 passed (2 new; both fail against the old `device.js`) |
| `npm run test:license` | 39 passed |
| `npm run test:update` | 9 passed |
| `npm run test:retention` | 13 passed |
| `npm run typecheck` | 0 errors |

`server/test/run.js` has one pre-existing failure — *the vendored copy is
IDENTICAL to the app source*. `server/src/lib/vendor/app-utils.js` has been
stale since `63459ec` (the dead-function sweep). `npm test` in `server/` hides
it, because `pretest` runs `sync-shared` first. Re-vendoring changes what the
deployed control plane runs, so it is left alone here.

---

## Yours, in this order

1. **Merge and ship the enforcement half**, or suspension keeps doing nothing on
   every machine in the field however the control plane behaves.
2. **Deploy `server/`** — the revoke fix is server-side and only takes effect
   there. Root Directory stays `server`; the gate is `/healthz`.
3. **Re-run the end-to-end proof with a portal login:**
   ```powershell
   $env:CONTROL_PLANE_URL = "https://control-plane-production-924b.up.railway.app"
   $env:CP_ADMIN_EMAIL = "..."
   $env:CP_ADMIN_PASSWORD = "..."
   npx playwright test tests/control-plane-sync.spec.js
   node scripts/e2e-admin-portal.js
   ```
   It skips without those three, which is why it has been silently not running.
4. **The installed copy on this PC is currently refused by the control plane**
   (`401` at `/devices/token`, licence `26c2abf5-4c7c-4329-9c10-811c6f1d73e6`).
   Once the server is deployed it will pull a signed entitlement and show its
   real state. If that licence is meant to be live, set it back to active.

## Still open, not changed here

**Deactivating a computer is undone by the app.** `/devices/register` upserts
`status = 'active'`, so the next sync silently reactivates a device an operator
deactivated — the app clears nothing and the portal button has no lasting
effect. Fixing it means deciding what a reinstall of a deactivated machine
should do, which is your call, not a bug fix.
