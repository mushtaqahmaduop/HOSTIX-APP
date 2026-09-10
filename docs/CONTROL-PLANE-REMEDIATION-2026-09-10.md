# Control-plane incident — remediation status

**Worked 2026-09-10, against `CONTROL-PLANE-ACCESS-INCIDENT.md` (2026-09-09).**

Three of the eight cleanup items were already done. Two of the remaining five are
mine and are in this branch. Three need the Railway console and are yours — they
are at the bottom, in the order they have to happen.

One item in the incident notes should **not** be done as written. That is
explained under *Corrections* and is the most important part of this document.

---

## Already done — verified, not assumed

| Item | Evidence |
|---|---|
| Delete `reset-password.js` / `check-db.js` | Neither is tracked by git nor present on disk anywhere outside `node_modules`. `server/scripts/` holds one file, `sync-shared.js`. |
| `server/.env` is off the public proxy | Its `DATABASE_URL` points at `127.0.0.1:11418` — a `railway connect --tunnel-only` local port, not `autorack.proxy.rlwy.net`. |
| The "do NOT demo" blocker | `showClearAllMenu` does not exist as live code on this branch or on `origin/master`; the whole Clear All Data feature was retired on 2026-08-31. The branch the note names, `feature/icon-system-dashboard`, no longer exists locally or on the remote. The only remaining hits are a docs file, an old HTML preview and a test comment. |

`server/.env` is gitignored and untracked, so no secret from this incident is in
the repository's history.

---

## Done in this branch

### The entitlement signing key is rotated — the safe half of it

`scripts/gen-entitlement-keypair.js` was run and produced **`ent-20260910`**.

* Private key and private JWK: `C:\Users\PCS\HOSTIX-backups\entitlement-keys\`
  (outside the repo — the script refuses to write one inside it).
* The **public** key was added to `services/entitlement-keys.js`, which is a
  map keyed by `kid` and now holds both `ent-20260819` and `ent-20260910`.
  Both parse. `ACTIVE_KID` moved to the new one.

Adding a public key breaks nothing: verification goes by the `kid` in each
token's header, never by `ACTIVE_KID`, so every entitlement already issued keeps
verifying. `ACTIVE_KID` is a diagnostics hint and is briefly ahead of reality
until you switch the server — that is the intended order, not a mistake.

### Two specs that had gone stale, and one that was passing on nothing

Not part of the incident, but found while proving the above, and the first of
them matters to what follows.

**`tests/online-services.spec.js`** asserted the Phase 1 world: no control plane
exists, the app makes no outbound request, no machine can hold an entitlement.
`feat(discovery)` (`2297a9c`, 2026-09-05) ended all three deliberately. Running
it against the live service showed this machine reaching
`control-plane-production-924b.up.railway.app` on boot and coming back holding a
signed, **ACTIVE** entitlement.

**`tests/connection-panel.spec.js`** carried the same premise — nothing
configured, nothing reached, re-check a no-op — and one worse thing: it counted
its four rows with `.dash-pill`, a class the panel stopped using when it was
rebuilt on `.conn-row`. So *"four states, shown as four"* had been comparing
zero against four and passing. It counts four now, and really does.

Both now state the rules rather than that moment: the mode is one of §7's four,
`authenticated` stays separate from `configured` and is never inferred from it,
the URL never crosses the bridge, the signed blob never does either, and a
re-check resolves without authenticating anything.

**The entitlement result is the empirical proof for the warning below.**
Machines in the field are really on the entitlement channel; they are not
theoretically on it. That is exactly what a premature key switch would take away
from them, silently.

---

## Corrections to the incident notes

### 1. Do NOT rotate `LEGACY_KEY_SECRET`

The notes list it as a routine rotation. It is not one, and rotating it would
break every hostel in the field.

* It is the secret the **app's licence-key checksum** is computed with. It is
  baked into `keygen.js` and ships inside `app.asar` to every customer.
* `server/src/config.js` says so in as many words: *"this is NOT a trust
  boundary; it ships inside app.asar, so it filters typos and nothing more."*
* Changing it on the server alone makes every existing licence key fail its
  checksum at `/v1/devices/register`.

Its appearance in a chat log changes nothing, because it is public by
construction — it is in the hands of all ~50 customers already. Rotating it is a
coordinated change to `keygen.js`, a new app build, and every key ever issued. It
buys no security. **Leave it.**

### 2. "Revert `server/.env`" does not affect production

The deployed service reads Railway's own Variables, not this file. `server/.env`
is the local development copy.

`server/.env.example` also documents the opposite of what the notes ask for: from
a laptop you are *supposed* to use the public or tunnelled address, because
`postgres.railway.internal` does not resolve outside Railway's network. The file
is currently on a tunnel port, which is the right local answer. The item that
actually matters is **Public Access off**, below.

### 3. The signing-key rotation has an order, and getting it wrong is silent

The desktop app ships a hard-coded map of public keys. Until a build carrying
`ent-20260910` reaches a machine, that machine cannot verify anything signed with
it — it returns `E_ENT_UNKNOWN_KID`.

That is not a crash. `enforcement.js` falls back to the local licence file, and
*"it always can"*. Nothing stops working. But the machine silently stops
receiving suspensions, revocations and renewals, and nothing on its screen says
so. Switching the server's key before shipping the app update would take every
field install off the entitlement channel quietly.

**So: ship the app update first, switch the server second.**

---

## Yours — Railway console, in this order

1. **Rotate the Postgres password.** Railway → Postgres → Variables → regenerate.
   Update the control-plane service's `DATABASE_URL` and redeploy. Update your
   local `server/.env` too.
2. **Rotate `SESSION_SECRET`.** Any 32+ byte random value; `openssl rand -hex 32`.
   It only signs admin session cookies, so the whole cost is that admins sign in
   again.
3. **Turn Public Access OFF** on the Postgres service (Settings → Networking).
   This is the one item from the incident that is still genuinely open exposure,
   and it also stops the egress billing.

Then, and only in this order:

4. **Ship an app build carrying `services/entitlement-keys.js` from this branch**
   (both keys). Give it long enough to reach the estate.
5. **Set `ENTITLEMENT_SIGNING_JWK`** on Railway to the contents of
   `entitlement-ent-20260910.private.jwk.json`, one line, then redeploy.
6. **Delete both private key files** from `HOSTIX-backups\entitlement-keys\` once
   Railway holds the value.
7. **Later**, once nothing in the field can still hold an entitlement signed by
   the old key — the cache is 14 days, so a month is comfortable — remove
   `ent-20260819` from the map and ship again. Until that happens the compromised
   key can still mint entitlements the estate will accept, so this step is the
   one that actually closes the incident.

The remaining item in the notes — a real admin password-reset flow — is a
feature, not cleanup. Worth doing; not blocking anything.

---

## Verified after the change

* Live service healthy: `GET /v1/healthz` → `200 {"success":true,...}`.
* Both public keys parse with `crypto.createPublicKey`.
* `tests/services.test.js` — 145 checks pass.
* `licence-enforcement`, `license-activation`, `control-plane-sync`,
  `online-services`, `connection-panel`, `settings-license-connection` — 13
  pass, 1 skipped (the portal-suspension test, which needs a live admin
  session).
* The Connection panel, read from the running app: Internet **Connected**,
  Hostyllo API **Reachable**, License **Checked on this device**, Application
  **Online**, `Waiting to send: 0`.
