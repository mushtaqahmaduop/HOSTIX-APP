# Control plane

Licensing server and admin portal for the offline Hostyllo desktop app.

**It has no connection to the Hostyllo SaaS.** Separate service, separate database, separate
deploy, separate secrets. Nothing is shared at runtime — not a table, not a queue, not a domain.
Reusing frameworks the SaaS also uses is not a connection.

---

## What it holds, and what it must never hold

**Holds:** licence records, device registrations, feature flags, admin users, an audit log.

**Never holds:** hostel business data. No students, no payments, no names, no CNICs. The offline
app's promise is that a hostel's records stay on the hostel's own machine, and this schema has
nowhere to put them even if something later tried. If that ever needs to change it is a product
decision with legal weight in Pakistan, not a schema tweak.

---

## Why it lives inside the desktop app's repository

The key format and the entitlement claim shape have to agree **exactly** between the app and this
server. In a separate repository that means two implementations kept in step by fixture tests —
and drift there is a customer whose key works in their app and is rejected on registration, or
worse the reverse.

Here, `src/lib/keys.js` is a thin re-export of `renderer/src/utils.js`, the same file `main.js`,
`keygen.js` and `test-license.js` use. There is only ever one implementation to be wrong.
`test/run.js` proves the full round-trip in one process: this server signs an entitlement, the
app's real verifier (`services/entitlement.js`) checks it. No fixtures, no port.

**Do not "tidy" `src/lib/keys.js` by copying the functions in.**

## It must never ship inside the app

`server/` holds the code path that uses the **private** signing key. The whole point of moving off
the old symmetric secret is that unpacking `app.asar` yields nothing a forger can sign with.

`build.files` in the root `package.json` is an **allowlist**, so `server/` is excluded by absence
rather than by a rule someone could delete. There is a test for it in `test/run.js`.

---

## Running it

```bash
cd server
npm install
npm run migrate:status     # what is applied, what is pending
npm run migrate            # apply
npm start
```

### Environment

| Variable | Required | What happens without it |
|---|---|---|
| `DATABASE_URL` | **yes** | refuses to start |
| `SESSION_SECRET` | **yes** | refuses to start (min 32 chars) |
| `ENTITLEMENT_SIGNING_JWK` | no | `/v1/entitlement` returns 503; everything else works |
| `LEGACY_KEY_SECRET` | no | `/v1/devices/register` returns 503 |
| `GRACE_DAYS` | no | 14 |
| `ENTITLEMENT_CACHE_DAYS` | no | 14 |
| `UNVERIFIED_STATUS` | no | `ACTIVE` — see below |
| `PORT` / `HOST` | no | 8080 / 0.0.0.0 |

The two optional secrets are optional **on purpose**. A control plane with no signing key must
still boot and still serve the portal, because taking the whole service down would remove the one
place the owner could go to find out what is wrong. Both states are warned about at boot.

`ENTITLEMENT_SIGNING_JWK` is the private half of the keypair produced by
`scripts/gen-entitlement-keypair.js` (repo root). `LEGACY_KEY_SECRET` is the hex blob at the top of
`keygen.js` — note that it is **not a trust boundary**: it ships inside `app.asar`, so verifying a
key checksum filters typos and nothing more.

---

## Endpoints

### `/v1/*` — machines

| | |
|---|---|
| `GET /v1/healthz` | Reachability. Touches no database — every install polls it every 60s. |
| `POST /v1/devices/register` | First contact. Binds a machine to a licence, returns a device secret once. |
| `POST /v1/devices/token` | Trades the secret for a short-lived opaque token. |
| `GET /v1/entitlement` | The signed Ed25519 statement of what this device may do. |

### `/healthz` — the platform

Probes the database and is the **deploy gate**. Deliberately a different endpoint from
`/v1/healthz`: same word, opposite requirements. Do not point one at the other.

### `/admin/*` — people

Session cookies. A device token can never reach an admin route and an admin session can never mint
an entitlement, because neither verifier can read the other's token at all.

---

## Two design notes worth not re-litigating

**A v3 licence has no device cap.** `max_devices` is `NULL` for v3 keys and `1` for v4. The v3 key
format encoded only the expiry *month* with no random component, so every customer whose licence
ended in the same month received the identical key string — the whole issuance history is 12
strings across ~50 hostels. Capping a v3 licence at one device would let whichever hostel
registered first claim the key and lock out every other paying customer holding it.

**An unrecognised key is admitted, not refused.** It lands as `unverified` for the owner to confirm
in the portal. Refusing would lock out the ~50 hostels whose keys this database has no record of;
trusting it would be worse, because the checksum secret is inside the asar. `UNVERIFIED_STATUS`
defaults to `ACTIVE` rather than `GRACE` so those customers do not all see a renewal warning for a
perfectly valid licence on day one. Tighten it once the unverified queue is actually being worked.

---

## Tests

```bash
npm test                    # 47 without a database, 83 with one
npm run test:integration    # the real-Postgres suite on its own
```

Three suites, and the split matters because they prove different things.

`test/run.js` (26) is pure Node: the key format, feature resolution, the licence lifecycle, the
signing round-trip against the app's real verifier, and that `server/` cannot be packaged into
the app.

`test/http.js` (21) drives the real Fastify app with `app.inject()` against a **stubbed**
database. It proves the layer where an authorisation mistake lives — routing, cookies, CSRF,
schema validation, the error envelope, and the separation between the machine surface and the
human one. It proves nothing about the SQL: the stub answers with canned rows, so a wrong column
name or an `ON CONFLICT` that updates the wrong thing would sail straight through.

`test/integration.js` (36) closes that gap against a **real Postgres** — the registration upsert
and the renewal it must not roll back, the device cap counted under the row lock, the rate-limit
window and its reset, the `audit_log` insert-only trigger, the `updated_at` triggers, and the
CHECK constraints. It **SKIPS loudly** when `TEST_DATABASE_URL` is unset, so `npm test` still
runs end to end on a laptop with no database; silence would read as "covered".

```bash
createdb cp_test
DATABASE_URL=postgres://localhost/cp_test npm run migrate
TEST_DATABASE_URL=postgres://localhost/cp_test npm run test:integration
```

Every integration test **TRUNCATES every table**, so point `TEST_DATABASE_URL` at a scratch
database and nothing else. The suite refuses to run against a URL whose name does not look
disposable, because the cost of getting that wrong is the licence table for 50+ paying hostels.
