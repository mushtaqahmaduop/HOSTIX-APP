# Handoff — control plane proven live, demo runbook

**Date:** 2026-09-04 · **Branch:** `design/anthropic-pass` · **Commit:** `2d3e7ea`
**Context:** client demo on 2026-09-05, full stack including the control plane.

---

## 1. The headline

**The Phase 2 chain has now actually run against the deployed control plane.**
It was built and wired months ago but had never been executed end to end, because
no build knew the server's address. Pointed at it by hand, the whole sequence
works:

```
POST /v1/devices/register   201   -> device b681c984-0c2c-4d3c-92c6-95ecb257752d
POST /v1/devices/token      200   -> device token
GET  /v1/entitlement        200   -> signed, kid ent-20260819
                                     state ACTIVE, expires 2027-03-02
                                     features: archive, backup, expenses,
                                               multiUser, printDocs, reports
```

The licence registered as `unverified`, which is the designed behaviour for a key
the database has no record of — it is admitted, not trusted, until confirmed in
the portal.

`services/config.js` `DEFAULT_API_BASE` is **still empty, deliberately.** Nothing
was baked in. See §4.

---

## 2. Two bugs found and fixed (commit `2d3e7ea`)

### 2.1 The control plane answered 500 on first contact

Railway's Postgres sleeps when idle. On wake, the database's IPv6 address times
out while its IPv4 address refuses, so node-postgres raises an `AggregateError`
and the route returned **500 in 256ms**.

This was not theoretical. It hit `POST /v1/devices/register` on this machine's
first activation, and the server log shows the same error hitting `bumpLogin` on
2026-09-03 — **the admin portal was answering 500 to a correct password.**

The desktop client cannot recover from this itself: a POST without an idempotency
key is deliberately not retryable (`services/api-client.js`), so `willRetry` was
`false`. It only survived because `DeviceService` happened to try again on its
next tick.

`connectionTimeoutMillis` was never going to help — nothing timed out. Both
addresses answered immediately.

**Fix:** `server/src/db.js` retries the *connect* only, three attempts over
~1.8s. `isConnectError()` matches errnos and the children of an `AggregateError`,
never a SQLSTATE, so a statement Postgres actually rejected is rethrown on the
first try. That distinction is the safety argument — the retry sits below the
routes and cannot tell a duplicate INSERT from a real one, and
`/devices/register` writes. Three unit tests pin it.

### 2.2 The deployed server was running a stale copy of the app's shared module

`server/src/lib/vendor/app-utils.js` is a committed, generated copy of
`renderer/src/utils.js` — it exists because Railway builds from `server/` alone,
where the original is absent. It had drifted by the service-model billing work
and was failing its own staleness test.

The drift did **not** touch the licence-key functions, so nothing was mis-parsed.
But that copy is what production runs. Regenerated with `npm run sync-shared`.

---

## 3. State of the estate

| Thing | State |
|---|---|
| Control plane | **Deployed and healthy.** `railway up` 2026-09-04, healthcheck passed first try |
| `/v1/healthz` | 200 — liveness, no DB, what every install polls |
| `/healthz` | `{db:ok, signing:ok}` — the deploy gate, probes Postgres |
| Admin portal | Serves at `/admin/` (**trailing slash required**; `/admin` 404s) |
| Admin account | Already existed. Password reset 2026-09-04 — it is in the owner's password manager, not in this file |
| Signing key | Present on the server. `ENTITLEMENT_SIGNING_JWK` is set |
| `hostyllo.com` | **Still does not resolve.** Neither does `license.hostyllo.com` |
| Update channel | Intact — release `v5.0.0` carries x64 + ia32 installers and `latest.yml` |
| App version | 5.0.0, same as the latest release, so "check for updates" reports up to date |

### Tests, all green

| Suite | Result |
|---|---|
| `server: node test/run.js` | 29 passed, 0 failed |
| `server: node test/http.js` | 21 passed, 0 failed |
| `npm run test:services` | 115 passed, 0 failed |
| `npm run test:license` | 39 passed, 0 failed |
| `npm run test:retention` | 13 passed, 0 failed |
| `npx playwright test` | **81 passed, 2 skipped, 0 failed** |
| `npm run typecheck` | 0 errors |

---

## 4. Demo runbook

### Before the client arrives

1. **Wake the database.** Even with the retry fix, waking takes a few seconds.
   Open `https://control-plane-production-924b.up.railway.app/healthz` and
   refresh until it reads `{"db":"ok","signing":"ok"}`.
2. **Sign in to the portal** at `.../admin/` — with the trailing slash — and
   leave the tab open.
3. **Point the demo machine at the control plane.** Do NOT bake the URL into a
   build. Write `<userData>/online-config.json`:

   ```json
   { "apiBase": "https://control-plane-production-924b.up.railway.app/v1" }
   ```

   `userData` is `%APPDATA%\hostix-app` for the installed app, `.devdata` for
   `npm start`. The app picks it up at launch; `apiBaseSource` reads `"file"` in
   the log and in Settings → Connection.

### The loop worth showing

1. **Settings → Connection** — the four-state readout, now genuinely online
   rather than diagnostic.
2. **Issue a licence** in the portal (`/admin/` → issue key). It mints a v4 key
   and shows it once.
3. **Activate** it in the app.
4. **Suspend** that licence in the portal.
5. **In the app, Settings → Connection → check now.** That forces
   `device.sync()` rather than waiting for the six-hourly tick. The app drops to
   read-only: `body.is-readonly` greys out every primary and danger button, a
   banner explains why, and `main.js` blocks the write at the IPC layer even if
   someone reaches a control. **Nothing is deleted or hidden** — every student,
   payment, report and export still works. That is decision D-3, and it is the
   part worth saying out loud to a client.
6. **Reactivate** and check again to bring it back.

### Do not demo

- **Auto-update receiving a new version.** The channel works, but the app and the
  latest release are both 5.0.0, so it will correctly report "up to date". Show
  the check, not a download.

---

## 5. Known, not fixed — deliberately

### 5.1 Rooms falls below the fold on a common laptop

`tests/rail-reach.spec.js` measures the rail budget at six sizes. At
**1366x768 @125%** — the common OEM default — and at **1024x768**, the nav
scroller overflows by ~250px and five of twelve items sit below the fold,
**including Rooms**, which is a daily screen.

The spec asserts only at the stated QA floor (1366x768 @100%), where the daily
five do fit. The tighter sizes are measured and printed but not gated, so this is
visible rather than silent.

Not fixed tonight on purpose: redensifying the rail means editing `chrome.css`
and `index.html`, which are exactly the files carrying uncommitted redesign work,
the night before a demo. The auto-scroll added to `nav.js` mitigates the worst of
it — the lit item is always scrolled into view — but does not help discovery.

### 5.2 `rail-reach.spec.js` was unfinished

It failed with `ReferenceError: reach is not defined`, and despite a header
claiming it "pins" the daily screens above the fold, it had **no assertion at
all**. Now: `reach` is declared, it collects stable `data-page` keys rather than
label text, and it asserts the daily five at the QA floor. It is still untracked
— it belongs to the in-flight design work, not to this commit.

### 5.3 The domain is still the real blocker

Nothing can be baked into a build until `license.hostyllo.com` exists. Until
then every shipped install resolves `apiBase` to `null`, makes no network
requests, and cannot be told anything. The per-machine `online-config.json` in
§4 is a demo mechanism, not a rollout mechanism.

Do not bake `*.up.railway.app`. Generated subdomains are recycled when a service
is deleted, and this string ships inside 50+ installers where it can only be
changed by cutting a release.

---

## 6. Working tree

`2d3e7ea` contains **server files only**. Left untouched and uncommitted:
`renderer/chrome.css`, `renderer/index.html`, `renderer/src/modules/nav.js`, and
untracked `tests/rail-reach.spec.js`.
