# Hostyllo Offline — release audit, 2026-09-24

Branch `claude/funny-dijkstra-c68mqn`: the owner's
`feature/students-register-2026-09-22` merged with the control-plane branch
`claude/new-session-fd63wc`, plus the fixes below. This is the build intended
for the paying clients who are on the free v1 today.

Everything here was checked, not assumed. Where something could not be checked
from this environment it says so, and says who has to check it.

## Verdict

**Not ready to build yet — two owner decisions and one Windows test pass stand
between this branch and a release.** The code itself is in good shape: every
automated suite passes except for failures traced to this container (listed
below), and the defects found in this audit are fixed on the branch. What is
left is not code:

1. **The licence secret is public** (C1). Decide how to contain it before more
   keys are sold.
2. **Where updates come from** (C2). The address is baked into the build, so it
   must be decided *before* `npm run build`.
3. **A Windows pass** (R1–R3): build the installer, install it over a copy of a
   real v1 client, click WhatsApp support on a real PC.

## Critical — owner decisions

### C1 · The licence signing secret is in a public repository

`github.com/mushtaqahmaduop/HOSTIX-APP` is public (unauthenticated API: 200).
`main.js` carries `_SECRET`, hex-encoded — decoding it is one line. With it,
anyone can generate **v3 and v4 keys that the app accepts offline, forever**.

v5 keys are safe: the control plane refuses a key it never issued and binds a
key to one PC (`test:pg`, "a v5 key the portal never issued is refused", "the
first PC binds the key; a second PC is refused").

**It cannot simply be rotated.** The same secret derives the AES key that
encrypts every client's `license.enc`; a new secret would lock every install
out. Options, in order of strength:

- Issue **only v5 keys** from this release on (the console already defaults to
  v5). This protects every sale from now on.
- Make the source repository **private** (see C2 first — updates and discovery
  depend on it being reachable).
- Later: a build that asks the control plane about any v4 key issued after a
  cut-off date. That needs a design decision about offline-only hostels.

### C2 · Updates and discovery are wired to the public source repository

Three addresses are baked into every build:

| Where | Points at |
|---|---|
| `package.json` `build.publish` | releases of `mushtaqahmaduop/HOSTIX-APP` |
| `main.js` `RELEASES_URL` | the same, for the "Download" button |
| `services/discovery.js` `DISCOVERY_URL` | `raw.githubusercontent.com/…/HOSTIX-APP/master/control-plane.json` |

Today that works because the repository is public. Making it private (C1)
would silently stop updates **and** control-plane discovery for every install.

**Recommendation:** a separate public repository that holds only what clients
download — installers, `latest.yml`, `control-plane.json` — e.g.
`mushtaqahmaduop/hostyllo-releases`. Point the three addresses there in *this*
build, publish this release there, then make `HOSTIX-APP` private.

**Clients on v1 have no updater at all.** They must install this version by
hand, once. The installer keeps the same `appId` (`com.zeerak.hostix`) and data
folder (`%APPDATA%\hostix-app`), so it installs over v1 and keeps the data —
**provided v1 used the same identifiers and licence secret. That has not been
verified against a real v1 install (R2).** Every later version then reaches them
through the updater.

## Fixed in this audit

| # | Finding | Fix | Verified by |
|---|---|---|---|
| F1 | **WhatsApp support did nothing** on a PC without WhatsApp Desktop: it opened `whatsapp://send`, which has no handler there, and the error only reached the console. The licence screen offered the number as a `tel:` link. | Support, the receipt's "Send on WhatsApp" and the licence screen open `https://wa.me/…` (desktop app if installed, WhatsApp Web if not). Number **+92 342 8521842**, email **hostyllo.info@gmail.com**. | `npm run test:whatsapp` 13/13 |
| F2 | Long WhatsApp messages were trimmed between the `%XX` escapes of one Urdu or accented letter → malformed link. Same bug in the student reminders. | Trimmed in whole characters (`waFitText`). | `test:whatsapp` |
| F3 | **App windows could be navigated to any website, and that page kept the full `electronAPI`** (database, licence, file writes). Proven on the unguarded build. | `web-contents-created` guard: windows stay on the app's files; web links open in the browser; print windows still allowed. | Electron probe; smoke, exports-pdf, students-export, receipt-identity, backup-main-guard pass on the guarded build; `npm run test:security` 6/6 |
| F4 | **The admin portal had no security headers.** `/admin` without the slash was a 404. | X-Frame-Options, nosniff, Referrer-Policy, CSP, HSTS in production; `/admin` → `/admin/`. **Not deployed yet** — needs `railway up`. | server `npm test` 29 + 29; `test:pg` 27/27 on real Postgres; every portal view in Chromium, both themes, 1366 and 390 px, no CSP violations |
| F5 | **The 32-bit installer cannot open its database** (open since the 2026-09-10 audit). v5.0.0 on GitHub ships one. | Release builds are x64 only; `build:ia32` compiles SQLite for i386 first. | `test:update` 9/9 |
| F6 | **42 invented rooms** on every fresh install, restored backup and data reset. | Removed. A new hostel starts empty. | typecheck; `test:services` 166/166 |
| F8 | **Title-bar menus were dead to the keyboard after sign-in** (File: ArrowDown/End/Home did nothing) and focused invisible items on the login screen. Introduced when admin-only items started being hidden (2026-09-23). | Arrow keys walk the items that are shown, read at the keypress. | `titlebar-keyboard` 2/2 in Electron (it failed on the owner's branch) |
| F7 | Because of F6, **the first-run setup wizard never ran** for anyone (it only opens on an install with no rooms and no students). | Nothing to change — it now runs on a fresh install, as designed. | 26 older specs relied on the fake rooms; they now use a test fixture (`tests/_fresh-install.js`) |

## Open — not blocking, owner's call

| # | Finding |
|---|---|
| O1 | **No code-signing certificate.** Every install shows SmartScreen's "Windows protected your PC". Unattended updates are correctly disabled until there is one. An OV/EV certificate is a purchase. |
| O2 | **The default password `admin123` is never forced to change.** A toast warns once per session; the setup wizard's password step can be skipped with the rest of the wizard. |
| O3 | **The control-plane database has no backups** (Railway Hobby plan). A scheduled `pg_dump` over `railway ssh`, or Railway Pro. |
| O4 | The portable `.exe` cannot update itself (electron-updater does not support portable). Give clients the installer. |
| O5 | The control plane is on a generated `*.up.railway.app` name. A custom domain (e.g. `license.hostyllo.com`) makes it movable. |
| O7 | **A "Blacklisted" status pill overflows its cell by 5px** in the students register and runs under Actions (`students-panel` spec). Pre-existing on the owner's branch. A restyle of a component in a dense register — left for design review rather than patched in an audit. |
| O6 | `tests/_trendbug-tmp.spec.js` is a stale temporary spec (it types into a login field that is now a dropdown). |

## Withdrawn

- *"The main window runs with no Content-Security-Policy."* **Wrong.** A first
  probe suggested it; measured properly (a remote script and image injected,
  violations recorded, `eval` blocked) the policy **is** enforced. No change made.

## Verified healthy

- **Licence cryptography in the app:** entitlements are Ed25519 with the
  algorithm pinned and key ids allow-listed.
- **Control plane:** bcrypt passwords, sign-in lockout, CSRF on every change,
  SameSite=strict cookies, TOTP 2FA; unauthenticated calls get 401.
- **Main-process file access:** writes limited to Downloads, Documents, Desktop
  and temp, after resolving `..`; table and column names allow-listed.
- **Updates:** announce-and-download, never silent install; the release feed is
  reachable.

## Test results

_A final full run of all 83 spec files is in progress; its numbers replace this line._

## What only a Windows PC can check (before release)

- **R1** `npm run build` on the release PC; install `dist\Hostyllo-Offline-Setup-<version>-x64.exe`
  on a clean Windows user and run the smoke flow (login → dashboard → add
  student → record payment → receipt).
- **R2** Install over a **copy** of a real v1 client's `%APPDATA%\hostix-app`:
  data present, licence still valid, no activation screen.
- **R3** Support → Chat on WhatsApp, on a PC *without* WhatsApp Desktop (opens
  WhatsApp Web) and one *with* it (opens the app), message pre-filled.
- **R4** `railway up` from `server/`, then `/healthz` and the portal headers.
- **R5** The first-run wizard end to end on a fresh install, including setting
  a password.
