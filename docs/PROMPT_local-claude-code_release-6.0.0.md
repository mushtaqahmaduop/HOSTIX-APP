You are working on my PC in C:\HOSTIX-APP (Windows, PowerShell). Your job is to
take Hostyllo Offline 6.0.0 from "code finished" to "released to clients". A
cloud session already did the code work and a full audit today (2026-09-24). It
could not do the steps below because it had no Windows, no Railway login and no
permission to create GitHub repositories. You have all three.

Read CLAUDE.md first and follow it. Then read docs/RELEASE_AUDIT_2026-09-24.md —
it is the full audit and the source of truth for everything summarised here.

## Ground rules

- Never commit to or push master. Work on branch `claude/funny-dijkstra-c68mqn`.
- Ask me before every outward-facing step: `railway up`, creating the GitHub
  repository, publishing a release, opening a pull request, making a repository
  private. Show me what you will run, and wait for "yes".
- Stop at the first step that does not give the result it says to expect. Show
  me the output. Never run the next step on top of a failed one.
- Report honestly. If you could not check something, say so. Do not call a step
  done because a command exited without an error — check the result.
- PowerShell blocks npm and railway scripts until you run, in each new window:
  `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` (answer Y).
- Never write a file with PowerShell's `>`: it saves UTF-16, which breaks JSON.
  Use Copy-Item, or `Out-File -Encoding ascii` for plain text.
- Never print or paste secrets: Railway variables, database URLs, licence keys,
  passwords.

## What is already done (branch claude/funny-dijkstra-c68mqn)

- My branch `feature/students-register-2026-09-22` is merged with the
  control-plane branch `claude/new-session-fd63wc`: admin panel, access levels,
  live updates, app enforcement, v5 one-PC keys.
- The control-plane server on Railway was deployed from `claude/new-session-fd63wc`
  earlier today, with migration 002 applied. The service has a pre-deploy step
  `npm run migrate && npm run migrate:status`. The server fixes made after that
  deploy are NOT live yet (step 2).
- The Railway Postgres database was wiped of test hostels today, on purpose.
- My decisions: version **6.0.0**; updates come from a new public repository
  **mushtaqahmaduop/hostyllo-releases**; **only v5 keys** are issued (the server
  now refuses v4).

### Bugs fixed today (all on the branch, all tested)

| # | Bug |
|---|---|
| F1 | WhatsApp support did nothing on a PC without WhatsApp Desktop (`whatsapp://`). It now opens `https://wa.me/…` (the app if installed, WhatsApp Web if not). Number +92 342 8521842, email hostyllo.info@gmail.com. The licence screen's `tel:` link now opens WhatsApp too. |
| F2 | Long WhatsApp messages were cut mid-character (Urdu), which broke the link. |
| F3 | Any app window could be sent to a website, and that page kept full `electronAPI` access (database, licence, file writes). A navigation guard in main.js now blocks it. |
| F4 | The admin portal had no security headers, and `/admin` gave a 404. Fixed in server code; not deployed yet. |
| F5 | The 32-bit installer cannot open its database. Release builds are x64 only now. |
| F6/F7 | 42 fake rooms were created on every fresh install, which also meant the first-run setup wizard never ran. Removed; new installs now get the wizard. |
| F8 | Title-bar menus stopped responding to the arrow keys after login. |
| F9 | After a support request opened WhatsApp, its row still said "not sent yet". |

### Open issues (not blocking; do not fix unless I ask)

- **C1:** the licence secret is in the source, and HOSTIX-APP is public, so v4
  keys can be forged. That is why keys are v5-only now and why HOSTIX-APP goes
  private in step 7.
- **O1:** no code-signing certificate, so Windows SmartScreen warns on every
  install.
- **O2:** the default password `admin123` is never forced to change.
- **O3:** the control-plane database has no backups (Railway Hobby plan).
- **O7:** in the students register, a "Blacklisted" status pill overflows its
  cell by 5px. The `students-panel` spec fails because of it.
- **O6:** `tests/_trendbug-tmp.spec.js` is a stale temporary spec that fails.

### Test results in the cloud (headless Linux)

The final full run of all 83 spec files: 254 passed, 10 failed. Four of those
were fixed afterwards and pass when re-run. The six still failing:
- `license-activation` ×2, `licence-enforcement`, `write-failure`: limits of
  that environment, because the cloud machine had no hardware fingerprint and
  ran as root. **On this PC they are expected to PASS.** If they fail here,
  that is a real finding.
- `students-panel` (O7) and `_trendbug-tmp` (O6): known.

All the non-UI suites pass: services 166, license, activation, retention,
export, theme, update, whatsapp, security, typecheck, server 29 + 29, server
test:pg 27/27.

## Steps, in this order

### 0. Get the branch
```
cd C:\HOSTIX-APP
git status                       # must be clean; if not, show me and stop
git fetch origin
git switch claude/funny-dijkstra-c68mqn
git pull
git log --oneline -1             # show me
npm install
```

### 1. Create the releases repository (ask me first)
It must be PUBLIC, and hold only what is in docs/releases-repo/.
```
gh repo create mushtaqahmaduop/hostyllo-releases --public --description "Hostyllo Offline releases - installers and update feed only"
cd C:\
git clone https://github.com/mushtaqahmaduop/hostyllo-releases.git
cd C:\hostyllo-releases
git checkout -B main
Copy-Item C:\HOSTIX-APP\docs\releases-repo\* .
git add . ; git commit -m "control-plane.json and README" ; git push -u origin main
```
If `gh` is missing, install it (`winget install GitHub.cli`, then `gh auth login`),
or ask me to create the repository on github.com.

**Verify:** fetch
https://raw.githubusercontent.com/mushtaqahmaduop/hostyllo-releases/main/control-plane.json
and parse it as JSON. `apiBase` must be
`https://control-plane-production-924b.up.railway.app/v1`.

### 2. Deploy the server (ask me first)
C:\HOSTIX-deploy is a git worktree that is already linked to the Railway
service `control-plane`.
```
cd C:\HOSTIX-deploy
git fetch origin
git checkout --detach origin/claude/funny-dijkstra-c68mqn
git status                       # must be clean (a changed package-lock.json: git checkout -- server/package-lock.json)
cd server
railway status                   # must say project harmonious-gentleness, service control-plane
railway up
```
**Verify:**
- The deploy log shows `migrate:status` with 001 and 002 applied and no DRIFT.
- `https://control-plane-production-924b.up.railway.app/healthz` returns
  `{"db":"ok","signing":"ok"}`.
- `/admin` answers 301 and redirects to `/admin/`.
- `/admin/` sends the headers `x-frame-options: DENY` and a
  `content-security-policy`.
- In the portal, Register hostel offers no v4 option.

Remind me to turn on 2FA (portal → My security).

### 3. Run the tests on this PC
```
npm run typecheck
npm run test:services ; npm run test:license ; npm run test:activation ; npm run test:retention
npm run test:export ; npm run test:theme ; npm run test:update ; npm run test:whatsapp ; npm run test:security
cd server ; npm test ; cd ..
```
Then Playwright, as CLAUDE.md describes: a scratch profile with
`.devdata\license.enc` copied into it, `$env:HOSTIX_TEST_PROFILE` set, and 5–7
spec files at a time. Report passed/failed per batch, and for every failure the
spec, the assertion and your diagnosis. Compare against the known list above.
Do not edit specs or app code to make anything pass. Report, and ask me.

### 4. Build 6.0.0
```
npm run build
```
**Verify:**
- `dist\` has `Hostyllo-Offline-Setup-6.0.0-x64.exe` and `latest.yml`, and no
  ia32 installer.
- `latest.yml` says `version: 6.0.0`.
- `(Get-Item "dist\win-unpacked\Hostyllo Offline.exe").VersionInfo` shows
  ProductName `Hostyllo Offline`, not Electron.

### 5. Hand-checks — mine, not yours
Tell me to do these and wait. Do not mark them done yourself.
- **R1:** Install the 6.0.0 exe on a clean Windows user account. Run through
  login → dashboard → add student → record payment → receipt. The setup wizard
  should appear on first run.
- **R2:** Install it over a COPY of a real v1 client's `%APPDATA%\hostix-app`.
  The data must still be there, the licence still valid, and there must be no
  activation screen.
- **R3:** Support → Chat on WhatsApp, on one PC without WhatsApp Desktop
  (WhatsApp Web should open) and one with it (the app should open). The message
  should be pre-filled and go to +92 342 8521842. **Confirm this number with me
  first:** the old code had +92 342 852**4**842.
- **R4:** Activate a v5 key from the portal on the installed app, with internet.
- **R5:** Run the first-run wizard end to end, including setting a password.

### 6. Publish the release (ask me first, only after R1–R5 pass)
```
gh release create v6.0.0 --repo mushtaqahmaduop/hostyllo-releases --title "Hostyllo Offline 6.0.0" --notes "Hostyllo Offline 6.0.0" "dist\Hostyllo-Offline-Setup-6.0.0-x64.exe" "dist\latest.yml"
```
**Verify:** https://github.com/mushtaqahmaduop/hostyllo-releases/releases/latest/download/latest.yml
returns `version: 6.0.0`.

### 7. Afterwards (ask me for each)
- Open a pull request from `claude/funny-dijkstra-c68mqn` to `master`. Do not
  merge it.
- Make HOSTIX-APP private, only after 6.0.0 is published and verified. Builds
  before 6.0.0 read discovery from HOSTIX-APP/master; installs that already
  have the address keep their cached copy.
- Remove the temporary worktree: `git worktree remove C:\HOSTIX-deploy`.

At the end, write me a short report: every step with its result (done, failed
or skipped), anything you could not verify, and anything that surprised you.
