# Session handoff — Hostyllo Offline 6.0.0 release, 2026-09-24

Local Claude Code session on the owner's PC, working through
`docs/PROMPT_local-claude-code_release-6.0.0.md`. The audit behind it is
`docs/RELEASE_AUDIT_2026-09-24.md`.

Branch `claude/funny-dijkstra-c68mqn`, **pushed to origin at `6993bf2`**.
No pull request yet. Master was not touched.

## Where each step stands

| Step | Result |
|---|---|
| 0 · Get the branch | **Done.** Pulled to `4984197`; `npm install` clean. Untracked `.shots/`, `docs/design/shots/`, `tests/_tmp-cam.spec.js` left alone (owner's choice). |
| 1 · Releases repository | **Done.** `mushtaqahmaduop/hostyllo-releases` is public; `control-plane.json` + README on `main` (the owner ran the push — auto mode blocked it). Verified: the raw URL returns 200, parses, and `apiBase` = `https://control-plane-production-924b.up.railway.app/v1`. |
| 2 · Deploy the server | **Done.** `railway up` from `C:\HOSTIX-deploy\server` at `4984197` (owner ran it; deployment `9bf3f742`, SUCCESS). Verified: migrate:status shows 001 + 002 applied, no drift; `/healthz` db ok + signing ok; `/admin` → 301 `/admin/`; `/admin/` sends `x-frame-options: DENY`, a CSP, nosniff, no-referrer, HSTS. **Not verified (needs the owner's login):** Register hostel offers no v4 option. **Owner to do:** turn on 2FA (portal → My security). |
| 3 · Tests on this PC | **Done**, with two findings (below). |
| 4 · Build 6.0.0 | **Done, rebuilt after the fixes** at `6993bf2`. `dist\Hostyllo-Offline-Setup-6.0.0-x64.exe` (107.5 MB) + `latest.yml` (`version: 6.0.0`, sha512 matches the exe); no ia32 file; `Hostyllo Offline.exe` reports ProductName `Hostyllo Offline`, 6.0.0. The packed app was unpacked and holds all five fixes, and no test files. |
| 5 · R1–R5 hand checks | **Owner's — not started.** |
| 6 · Publish the release | Waiting on R1–R5. Ask first. |
| 7 · PR, make HOSTIX-APP private, remove worktree | Waiting. Ask for each. |

## What changed on the branch this session

| Commit | Change |
|---|---|
| `bc9b33f` | `test:security` and `test:whatsapp` read sources as LF. With `core.autocrlf=true` the files check out CRLF and both suites' `\n` patterns matched nothing (security 2/6, whatsapp 12/13 on Windows). Test-only. |
| `8df158e` | **Setup wizard:** "Skip for now" opened its confirm at z-index 350 *under* the wizard (9000), so it looked dead; the logo's Remove / Choose another the same. Dialogs now stack at 9100 while the wizard is open. New click-only spec fails without the fix. |
| `62db16a` | **Student roster PDF:** each contact number on one line (a hyphen in `0326-0408880` was a break point). The roster is `dense` now so it still fits Letter landscape — measured 988px on a 988px page. |
| `9677d25` | **Expense PDFs:** new engine option `oneTable` — one heading row (repeated per page), each category a row + records + Sub-Total. On for all five expense documents: Expenses page, Reports ×2, annual archive, dashboard month report. |
| `fe2112b` | **Support email** opens Gmail's compose page with address, subject and message (`gmailLink()` in utils.js), not `mailto:`, which most PCs cannot open. Licence screen too. |
| `6993bf2` | **Pending Payments quick report** prints a Contact column (student's phone) after Student. |

## Test results (this PC, after all fixes)

- Non-UI: typecheck 0 · services 166 · license 39 · activation 6 · retention 13 · export 71 · theme 4 · update 9 · whatsapp 17 · security 6 · server 29 + 29.
- Playwright, all 83 spec files (`_tmp-cam` excluded): everything passes except `_trendbug-tmp` (O6, stale — fills a login field that is now a `<select>`). 2 skipped by the specs themselves (`control-plane-sync` suspend, `settings-is-source` untouched real data) — the same two as before the fixes.
- The cloud's four "environment" failures **pass here**: `license-activation`, `licence-enforcement`, `write-failure`.
- **O7 does not reproduce on Windows:** `students-panel` passes 13/13 including "a Blacklisted student fits their own status cell". Likely Linux font metrics — look at it on screen before closing O7.

The full run was done in pieces: this PC has ~6 GB RAM, and Claude Code stopped two long background runs for low memory. Run 4 spec files per batch with `NODE_OPTIONS=--max-old-space-size=512 --max-semi-space-size=2`, and close `npm start` first.

## For the owner, tomorrow

Install `C:\HOSTIX-APP\dist\Hostyllo-Offline-Setup-6.0.0-x64.exe` and check:

- **R1** clean Windows user: login → dashboard → add student → record payment → receipt; the setup wizard appears.
- **R2** over a COPY of a real v1 `%APPDATA%\hostix-app`: data there, licence valid, no activation screen.
- **R3** Support → WhatsApp to **+92 342 8521842**, message pre-filled, on a PC without WhatsApp Desktop (WhatsApp Web) and one with it (the app). Support → **Email** opens Gmail, written.
- **R4** activate a v5 key from the portal, online.
- **R5** the wizard end to end including a password; "Skip for now" shows its confirm and closes the wizard.
- The three PDFs: roster contacts on one line each; expense register with one heading strip and categories by row + Sub-Total; Pending Payments with a Contact column.
- Portal: no v4 option in Register hostel; turn on 2FA.

## Surprises worth knowing

- Claude Code's auto mode blocks creating a public repo, pushing to it and `railway up` even after a "yes"; the owner ran those by hand. Expect the same for `gh release create` and making a repo private.
- `server/src/lib/vendor/app-utils.js` shows as modified after running the server tests — `sync-shared` rewrites its line endings; `git diff` on it is empty. Left alone.
- `dist\` also holds `Hostyllo-Offline-Portable-6.0.0-x64.exe`; the plan does not publish it (O4: the portable build cannot self-update).
