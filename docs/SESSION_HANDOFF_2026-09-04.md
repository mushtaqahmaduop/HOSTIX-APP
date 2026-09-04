# Handoff — control plane proven live, demo runbook

**Date:** 2026-09-04 · **Branch:** `design/anthropic-pass`
**Commits:** `2d3e7ea`, `3d40ae6`, `c72aa4e` (+ this doc) · see §7
**Context:** client demo on 2026-09-05, full stack including the control plane.
**Gate:** full suite green — **84 passed, 2 skipped, 0 failed**, with the rail
fix of §5.1 in the tree.

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
| `npx playwright test` | **84 passed, 2 skipped, 0 failed** (10.7 min) |
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

## 5. The rail, and the one blocker that remains

### 5.1 Rooms fell below the fold on a common laptop — now fixed

`tests/rail-reach.spec.js` measures the rail budget at six sizes. It found that
at **1366x768 @125%** — the common OEM default — and at **1024x768**, five of
twelve items sat below the fold **including Rooms**, a daily screen. A warden on
a standard laptop had to scroll the rail to reach it.

Two changes, both taking space from chrome rather than from type size, which
`chrome.css` rules out ("section 9 rules out buying space with type size"):

1. **The group gap was being paid for twice.** `.sb-section` carried 10px of
   padding above the label AND four inline `style="margin-top:6px"` attributes
   in `index.html` — 16px of blank rail per group break before a pixel of text.
   Now one rule in `chrome.css`: 6+4 padding, 4px margin. Seven pixels back per
   break. This alone fixed 1024x768 and 150%, but not 125%.

2. **Annual Archive was breaking the frequency rule the file states.** The nav
   comment orders by frequency — "Rooms is weekly and Settings monthly" — but
   Archive, opened once a YEAR, sat at position seven and was the last item that
   fit at 125%. A yearly screen was occupying the fold while a weekly one sat
   below it. Moved to System.

Content came down **674 -> 640px**. At 125% the visible seven are now Dashboard,
Students, Cancellations, Payments, Expenses, Reports, **Rooms**. Complaints is
the first item below the fold there, and is half-visible, which reads as the
scroll affordance it is.

**One approach that looks obvious and is wrong:** moving the System items into a
pinned bottom block. The CSS for it still exists (`#sidebar .sidebar__bottom`),
so it invites the attempt. The rail is fixed-height — a pinned block steals
~110px of scroller while removing ~142px of content, a net gain of ~30px against
a 440-vs-418px problem. It would have pushed Rooms further down, not up.

### 5.2 `rail-reach.spec.js` — finished, and now gates every size

It arrived failing with `ReferenceError: reach is not defined`, and despite a
header claiming it "pins" the daily screens above the fold it had **no assertion
at all**. Now `reach` is declared, it collects stable `data-page` keys rather
than label text — labels are copy and get reworded — and it asserts.

It first gated the QA floor only, on the reasoning that 125% could not hold the
daily five and pinning it would freeze the design against the hardest case.
After the fix above that is no longer true, so it now gates **all six sizes**.
The claim is the plain one: the rail may scroll to reach Archive or the Activity
Log, never to record a payment or look up a room.

Still untracked — it belongs with the in-flight design work.

### 5.3 The domain is still the real blocker

Nothing can be baked into a build until `license.hostyllo.com` exists. Until
then every shipped install resolves `apiBase` to `null`, makes no network
requests, and cannot be told anything. The per-machine `online-config.json` in
§4 is a demo mechanism, not a rollout mechanism.

Do not bake `*.up.railway.app`. Generated subdomains are recycled when a service
is deleted, and this string ships inside 50+ installers where it can only be
changed by cutting a release.

---

## 6. The app-side sweep

A sweep of the daily flows found **no defect a client would see**, which is
worth recording as a result rather than leaving as an absence.

Held under test: the three bed numbers (a bed on notice reads
`2/2 · 1 bed free on 30-Sept-2026 — reservable`); "never invent a number" (an
unpriced student prints **not set**, never `PKR 0`); room numbers sort as
strings, so `"A 01"` lands after `"12"`; every `showModal`/`showConfirm` title
carrying user data is escaped; no `fmtPKR` inside a `.pkr` span; and the service
model defaults to `rent_mess_optional`, which is the OLD behaviour — so no
install's billing moves when it upgrades.

Two things that looked like bugs were bad test seeds, not code. Both are worth
knowing before someone else chases them:

- **Notice is a Pending `DB.cancellations` row**, not a `noticeDate` field on
  the student. Seeding the field alone leaves `getRoomVacating()` at 0, which
  looks exactly like the bug it is not.
- The real flow also sets `student.status = 'Cancelling'`.

**The one real finding was a comment that had inverted its own meaning.**
`cancellations.js` said marking a student `Cancelling` "removes from occupancy".
Since the 2026-08-30 ruling `Cancelling` is one of `RESIDENT_STATUSES`, so they
are still counted and still billed; what the status changes is
`getRoomVacating()`. Left alone it invites someone to "fix" an occupancy count
that is already right. Corrected in `3d40ae6`.

`tests/daily-flow-sweep.spec.js` is the net that came out of it: it walks all
twelve screens twice — once on seeded data, once on the records a live hostel
accumulates — and fails on rendered `NaN` / `undefined` / `[object Object]` /
`Invalid Date` or any console error. Both passes are clean.

### `titlebar-keyboard` was flaky, not broken

It failed a full-suite run and passed 3/3 in isolation. The assertion that lost
says why: `open` read `['Help']`, so the menu HAD opened, while `focusText` read
`''` because `activeElement` was still the body. Every step sampled state
immediately after the keypress. Each now waits for the focus it expects
(`c72aa4e`).

Worth the fix beyond tidiness: a flaky red in a pre-demo test run costs more
than the bug it is imitating.

---

## 7. Working tree

Committed on `design/anthropic-pass`:

| Commit | What |
|---|---|
| `2d3e7ea` | control plane: sleeping-DB 500 fix (**deployed**) |
| `2266e5a` | this document |
| `3d40ae6` | daily-flow sweep + the occupancy comment |
| `c72aa4e` | titlebar spec de-flaked |
| `8d57551` | the rail fix of §5.1, with `rail-reach.spec.js` |

**Still uncommitted:** `renderer/chrome.css` only — the Phase 4 theme work
(the dead `--sb-bg` token, and the light-theme rail gradient the brief rules
out). That is a separate body of work from the rail, so `8d57551` was staged
hunk-by-hunk to take the rail change and leave the theme change behind, rather
than sweeping two unrelated concerns into one commit.

**One thing that commit does not carry proof of.** The suite was run against
the working tree, which is `8d57551` PLUS the theme work. The rail commit has
not been tested in isolation. Nothing in it reads a theme token, so the risk is
small — but "small" is not "measured", and if the theme work is ever dropped
rather than committed, re-run before trusting the rail on its own.
