# Handoff — the licence chain and the update channel, checked end to end

**Date:** 2026-09-05 · **Branch:** `fix/control-plane-demo-ready` (off `feature/dashboard-1c`)
**Commits:** `868b964`, `2297a9c`, `fa8c5b7`, `d6a57ce`, `f134850`
**Purpose:** make the app ready for clients and a demo — verify the control
plane's licensing end to end, verify the client-side update path end to end,
and close what was left half-finished.

---

## 1. The headline

Two chains were walked end to end against live infrastructure rather than
reasoned about. Both hold. One real client-facing defect fell out of the second
one, and the rollout blocker that has sat open since 2026-08-31 is now closed
by a mechanism instead of by a domain purchase.

| Chain | Result |
|---|---|
| Licence — machine half, live control plane | **28/28** |
| Update channel — live GitHub release feed | **16/16** |
| Discovery — live, over the real network | **7/7** |
| Licence — portal half (issue/suspend/revoke) | **not run** — see §6 |

### Tests, all green

| Suite | Result |
|---|---|
| `npx playwright test` | **84 passed, 2 skipped, 0 failed** (13.0 min) |
| `npm run test:services` | **136 passed** (was 115) |
| `npm run test:update` | 17 passed (8 existing + 9 new) |
| `npm run test:license` | 39 passed |
| `npm run test:retention` | 13 passed |
| `npm run typecheck` | 0 errors |
| `server: node test/run.js` | 29 passed |
| `server: node test/http.js` | 21 passed |

The Playwright figure is identical to the 2026-09-04 baseline, which is the
claim that matters: none of this session's work moved the app's behaviour.

---

## 2. The licence chain, machine half — 28 checks, all live

Run against `https://control-plane-production-924b.up.railway.app/v1` with a
key minted locally from `LEGACY_KEY_SECRET`, so it exercised the path the ~50
existing hostels are on: a key the database has never seen.

The entitlement was verified with **the app's own `verifyEntitlement()`**, not
with a re-implementation — signature against the public key in
`services/entitlement-keys.js`, `kid ent-20260819`, bound to the machine id,
`features: archive, backup, expenses, multiUser, printDocs, reports`,
`policy: {graceDays:14, readOnlyOnExpiry:true}`.

What was proven beyond the happy path, in the order it is likely to matter:

- An entitlement copied to another machine is **rejected** (`WRONG_MACHINE`).
- A payload edited to say ACTIVE and expire in 2099 is **rejected**
  (`BAD_SIGNATURE`). The trust boundary is real.
- The v4 one-device cap holds: a second machine on the same key gets **409**
  with a message that names the fix.
- A reinstall on the same machine re-registers to the **same device row**,
  rotates the secret, and **invalidates the token the old secret bought** — so
  a leaked secret stops working the moment the customer re-registers.
- A wrong secret, a bad checksum, a malformed key and an unfingerprintable
  machine each get their own correct code, and the four failure modes of
  `/devices/token` all answer with one indistinguishable 401.

`/v1/healthz` answered in 798ms and does not touch the database, which is what
lets every install poll it every 60 seconds.

**The sleeping-database fix is live.** The first request of the session woke
Postgres and took 6.5s to return `{"db":"ok","signing":"ok"}`. Under the code
before `2d3e7ea` that is the request that returned 500 in 256ms. Evidence, not
assumption — but see §5, because that commit is not on master.

---

## 3. The update channel — and the defect it turned up

### 3.1 The channel itself is intact

Walked in the exact order `electron-updater`'s `GitHubProvider` walks it:

```
GET  releases.atom                      200  → newest tag v5.0.0
GET  v5.0.0/latest.yml                  200  → version 5.0.0
     fallback path:                          → …-x64.exe  (correctly pinned)
HEAD …/Hostyllo-Offline-Setup-5.0.0-x64.exe  200
HEAD …/Hostyllo-Offline-Setup-5.0.0-ia32.exe 200
```

The 116 MB x64 installer was **downloaded and hashed**: its sha512 matches the
feed byte for byte, and the feed's top-level `sha512` matches its own `files:`
entry. An integrity mismatch there would fail every client update with nothing
in the UI to explain it, so it is worth the download.

### 3.2 `Help → Check for Updates` did nothing at all

The defect, and it is not a corner case — it is what every machine in the field
does today, since the app is 5.0.0 and 5.0.0 is the newest release.

`checkForUpdates()` resolves with the **parsed feed whether or not there is
anything newer in it**. `electron-updater`'s `AppUpdater.js:404` returns
`{ isUpdateAvailable: false, updateInfo }` on the up-to-date path. So

```js
if (!result || !result.updateInfo) { …show "Up to Date"… }
```

was false in both cases and that dialog could never open, while
`update-not-available` only wrote to the console. A warden clicked the menu
item and nothing happened.

Three branches now, each owing the user a different thing:

| `result` | what it means | what is shown |
|---|---|---|
| `null` | the updater refused to run — **not** the same as "up to date" | Update Check Failed |
| `isUpdateAvailable: true` | `update-available` already spoke from inside the call | nothing; saying it twice is worse |
| otherwise | current | Up to Date, naming the version so the answer is checkable |

The same `!!result` bug was in the `update:check` IPC, which reported every
up-to-date machine as having an update waiting. Nothing in the renderer calls it
yet, so it was fixed rather than deleted — the next caller would have inherited
it.

Also removed: `update-downloaded`'s promise that the update "will install
automatically when you next close the app". `autoInstallOnAppQuit` is false
[D-2], so the build does not keep that promise. The handler is unreachable
while `autoDownload` is false, and is kept correct so that enabling downloads
alongside code signing does not ship a lie with them.

`tests/update-check.test.js` covers all seven paths and pins the two source
invariants. `npm run test:update` runs it alongside `update-url`.

### 3.3 What still cannot be demonstrated

**An update being received.** The app and the latest release are both 5.0.0, so
the correct answer is "up to date" — which, as of this session, is now actually
displayed. Showing a download needs a release above 5.0.0 to exist. Show the
check, not the download.

---

## 4. The rollout blocker is closed — by a mechanism, not a domain

Since 2026-08-31 the position has been: the control plane is built, deployed and
correct, and **no shipped build knows its address**. `DEFAULT_API_BASE` is baked
empty, so every install resolves `apiBase` to `null`, makes no requests, and can
never be told anything. A licence could be suspended in the portal all day with
nobody listening.

`license.hostyllo.com` still does not resolve (checked again today; neither does
`hostyllo.com`). Waiting for it has cost five weeks.

### 4.1 `services/discovery.js`

The address is **fetched** from `control-plane.json` on `master`, over
`raw.githubusercontent.com` — the same host the update channel already depends
on. Re-pointing 50 hostels becomes one commit.

Resolution order gains a fourth step, **below** the baked default:

```
env  >  online-config.json  >  DEFAULT_API_BASE  >  discovered  >  null
```

Below, deliberately: a build that eventually bakes `license.hostyllo.com` should
trust its own build, and this goes dormant the moment one does.

### 4.2 What the document can and cannot do

It supplies an **address**. That is all it can ever supply. It cannot grant,
extend or forge an entitlement — those are Ed25519 signatures verified against a
public key compiled into `app.asar` and bound to a machine fingerprint, and §2
proves both checks bite. The worst a wrong address achieves is denial of
service, which is indistinguishable from the server being down, and the app
already treats that as normal.

The residual risk is the registration request: a licence key and a machine id
would be **sent** to whoever answers. That is precisely why the document lives
in the repository rather than at the control plane — re-pointing is a commit
that takes effect in minutes. **Change `control-plane.json` before deleting or
re-provisioning a Railway service, and give it a day.** Generated
`*.up.railway.app` names are recycled.

### 4.3 Failing safe, which is most of the code

No network, a 404, malformed JSON, a wrong `v`, an `http://` base, an oversized
body — every one of them returns without writing, leaves any existing cache
alone, and falls through to `null`, which is offline-only operation and a
supported state rather than an error. `refresh()` is fire-and-forget, has its
own 8s timeout, and is never awaited on the boot path. Nothing here can make the
app *require* the control plane; that would be a breaking change.

**The kill switch:** `"apiBase": null` in the published document clears every
install's cache and returns the estate to offline-only, for taking the control
plane down without cutting a release. A document that merely *forgets* the key
is malformed and changes nothing — that distinction is deliberate, so "I made a
typo" and "switch everyone off" can never be the same document.

### 4.4 Same session, not next launch

A fresh install has no cache, so its first boot resolves `null` and the fetch
lands a second or two later. `config.adoptDiscoveredBase()` mutates the resolved
object **in place** and `index.js` re-enters the three lifecycles, so the machine
comes online in that session — for a customer activating a licence, the
alternative was the whole of their first session offline.

In-place mutation is safe **only** because every URL-critical path re-reads
through `isConfigured()` and `url()` at call time (`api-client.js:193,199`,
`device.js:149,236,287`, `connectivity.js:124,171`). The captured `cfg` is used
for numeric tunables. *Do not start caching `apiBase` in a service without
revisiting this* — `tests/services.test.js` has one test whose only job is to
fail if someone does.

`device.start()` gained the idempotence guard the other two lifecycles already
had; without it the second call would have left two sync intervals running
forever.

21 tests, most of them about failing safe. Discovery is skipped under
`HOSTIX_TEST_PROFILE`: the Playwright suite launches the app ~85 times, and a
suite that reaches GitHub on every launch goes red when the network does.

### 4.5 MERGED — and it resolves

Merged as **PR #22** (`324a5fc`), and the chain was then run for real rather
than declared done.

```
GET raw.githubusercontent…/master/control-plane.json   200
refresh()  → {ok:true, base:"…railway.app/v1", changed:true}
config     → apiBaseSource "discovered"
GET  that address /healthz                             200
```

And in a real Electron boot, from a cold profile with no cache:

```
online_services_starting        configured:false  apiBaseSource:"none"
discovery_changed               null → https://…railway.app/v1     (+1.5s)
control_plane_address_adopted   apiBaseSource:"discovered"
device_service_started
device_register_failed          E_RATE_LIMITED  429
```

The app configured itself, in one session, with no relaunch and nothing written
by hand. The 429 is the budget this session spent testing (see the runbook
warning); it is the rate limiter working, and the app logged it at WARN, kept
running, and will retry on its next tick.

The cache it wrote names its own source, so someone finding it in `%APPDATA%`
can tell what put it there:

```json
{ "v": 1, "apiBase": "https://…/v1", "fetchedAt": …,
  "source": "https://raw.githubusercontent.com/…/master/control-plane.json" }
```

---

## 5. Two things that are true and were not written down

### 5.1 The deployed server fix was not on master — it is now

`2d3e7ea` — the sleeping-Postgres retry — was deployed to Railway and running in
production, but existed only on branches. Anyone redeploying the control plane
from master would have reintroduced the 500-on-wake bug, the one that answered
500 to a *correct* portal password on 2026-09-03.

It came across with **PR #22**, along with the other 33: the rail fix, the
Anthropic design pass, the daily-flow sweep, and all of the licensing work.
`origin/master` had been 34 commits and 81 files behind.

**What made that merge safe to do, since master is what 50+ clients run:**

- PRs #19 and #20 changed **no files** relative to the merge base — their
  content was already in this lineage — so the merged tree is byte-identical to
  the branch head, and every suite run against that head applies to master.
- The suite had run against a tree that ALSO held in-flight uncommitted Phase 4
  theme work, which is not in the merge. That gap was closed rather than
  assumed: `theme-parity`, `rail-reach`, `students-export`,
  `students-profile-archive`, `zz-v6-redesign` and `zz-boot-diag` were re-run in
  a throwaway worktree at the exact merge commit — **13/13**.
- The owner's four uncommitted files were never touched. The worktree's
  `node_modules` junction was removed with `rmdir` **before** the worktree was,
  and the real `node_modules` was counted afterwards to prove it survived — that
  exact deletion cost an `npm ci` on 2026-09-03.

### 5.2 A hostel still on v4.0.0 auto-installs whatever you publish next

Checked against the tags rather than assumed:

| Build | `autoDownload` | `autoInstallOnAppQuit` |
|---|---|---|
| `v4.0.0` | **true** | **true** |
| `v5.0.0` | false | false |

So D-2's standing concern — "the shipped app already has both true on 50+
machines" — is **closed for anyone on 5.0.0**, and the note saying otherwise is
stale. It is still live for anyone on v4: that machine will silently download
and install the next release you cut. Self-healing, because landing on 5.0.0
stops it, but it means **publishing 5.0.1 pushes it to every v4 hostel without
asking them.** Worth deciding deliberately rather than discovering.

---

## 6. What is still not proven

**The portal half of the licence loop.** Issue a key → activate → suspend →
watch the app go read-only → reactivate → revoke, with the audit trail behind
it. The script is written and ready (`e2e-admin.js`, in the session scratchpad):
it drives the real admin routes over HTTPS with cookies and CSRF, and runs the
fetched entitlement through the **real** `EntitlementService` and
`enforcement.resolve()`, so what it asserts is what a warden would see.

It needs portal credentials, which are in the owner's password manager. Creating
a throwaway admin over `railway ssh` was blocked by the permission classifier.

Until it runs, the suspend→read-only path is covered by unit tests
(`enforcement.js`, 115+ of the services suite) and by the 2026-09-04 manual walk,
but not by an automated end-to-end run against production.

---

## 7. Demo runbook

Unchanged from 2026-09-04 except where marked.

### A trap that will bite on demo day

`/devices/register` is rate limited to **20 per IP per hour**, and it is shared
across everything activating from that address. `scripts/e2e-license-chain.js`
spends six of them per run, so about three runs an hour is the whole budget —
and this session used it up, which is how the limit was found.

**If you rehearse activation from the same connection as the demo, a real
activation can be refused with 429.** To a client that looks exactly like a
broken product. Do not loop the check before a demo; if you have been testing,
either wait for the window to roll over or activate from a different network.
The script now aborts with that explanation instead of a stack trace, and
`SKIP_REJECTIONS=1` halves what it spends.

### Before the client arrives

1. **Wake the database.** Open `…/healthz` and refresh until it reads
   `{"db":"ok","signing":"ok"}`. It took 6.5s cold today.
2. **Sign in to the portal** at `…/admin/` — *with* the trailing slash; `/admin`
   404s — and leave the tab open.
3. **Point the demo machine at the control plane.** Write
   `<userData>/online-config.json`:
   ```json
   { "apiBase": "https://control-plane-production-924b.up.railway.app/v1" }
   ```
   `userData` is `%APPDATA%\hostix-app` installed, `.devdata` for `npm start`.

   **New:** once `control-plane.json` is on master this step disappears — the app
   finds the address itself. The per-machine file still outranks discovery, so
   it also remains the way to point one machine somewhere else.

### The loop worth showing

1. **Settings → Connection** — the four-state readout, genuinely online.
2. **Issue a licence** in the portal. It mints a v4 key and shows it once.
3. **Activate** it in the app. Activation registers with the control plane
   immediately (`main.js` calls `device.sync()` on success), so the machine
   appears in the portal straight away rather than at the six-hourly tick.
4. **Suspend** that licence in the portal.
5. **Settings → Connection → check now.** The app drops to read-only: every
   primary and danger button greys out, a banner explains why, and `main.js`
   blocks the write at the IPC layer even if someone reaches a control.
   **Nothing is deleted or hidden** — every student, payment, report and export
   still works. That is D-3, and it is the part worth saying out loud.
6. **Reactivate** and check again.
7. **New: Help → Check for Updates.** It now answers. Before today it was
   silent, so this was not showable at all.

### Do not demo

- **An update being received.** The channel is proven healthy, but 5.0.0 is
  current, so the honest answer is "up to date" — which is now what it says.

---

## 8. Working tree

Committed on `fix/control-plane-demo-ready`:

| Commit | What |
|---|---|
| `868b964` | `Check for Updates` answers when the app is current, + 9 tests |
| `2297a9c` | `services/discovery.js`, `control-plane.json`, config chain, 20 tests |
| `fa8c5b7` | entitlement.js header stopped claiming the opposite of the code |
| `d6a57ce` | CLAUDE.md — `control-plane.json` as live infrastructure |
| `f134850` | the adoption integration test, and this branch's CLAUDE.md counts |

**Still uncommitted, and untouched by this session:** `renderer/chrome.css`,
`renderer/src/modules/students.js`, `renderer/students.css`, `renderer/style.css`
— the in-flight dashboard design work. The branch was cut from
`feature/dashboard-1c` so those four files followed along with nothing on disk
changing. Nothing here reads them.

## 9. In order, what to do next

Merged to master as PR #22, so the two blocking items on the old list are gone.
What is left:

1. **Run `scripts/e2e-admin-portal.js`** (§6) once portal credentials are to
   hand. It is the last unproven link in the chain, and it is one command.
   Wait out the registration window first — see the runbook warning.
2. **Decide about 5.0.1 before publishing it** (§5.2). It reaches every
   remaining v4 machine unattended.
3. **Build and launch a packaged installer** with all of this in it. Nothing in
   this session was tested from an installer, and `electron-builder`'s `files`
   allowlist has caught a missing `services/**` before.
4. Only then bake `DEFAULT_API_BASE`, and only once `license.hostyllo.com`
   answers `/v1/healthz`. Discovery removes the urgency, which is the point.

### A follow-up worth someone's time, found in the boot log

**A machine coming online for the first time registers TWICE**, 1.4s apart —
once from the connectivity probe's status change (`index.js` syncs on every
transition into reachable) and once from `device.start()`'s five-second timer.
`sync()`'s `_syncing` flag only guards *overlapping* calls, so two sequential
ones both proceed.

This predates the discovery work; adoption merely made both fire close enough
together to see. It is self-correcting — each `/devices/register` rotates the
secret, so the second wins — and it only happens on the first online boot,
because afterwards `_ensureToken()` uses `/devices/token` instead. But it spends
two of a 20-per-hour budget instead of one, and there is a short window where
the first sync's token has been deleted by the second registration.
