# Hostyllo — Offline Edition — Claude Code Context

## What this is
Offline Electron desktop app for hostel management. Deployed to 50+ Pakistani hostels under the Hostyllo brand (formerly Zeerak Hostix). Vanilla JS/HTML/CSS — NO build step, NO framework, NO bundler. SQLite via better-sqlite3.

User-visible branding is **HOSTYLLO** — set by `appName` in `renderer/src/config.js`. Do not reintroduce "HOSTIX" in any user-facing string. The repo folder and remote are still named `HOSTIX-APP`; that is expected, leave paths alone.

This is the offline desktop product. The separate cloud SaaS at `C:\hostyllo` is a
**different repo with different rules, and nothing here depends on it.**

That sentence used to end the paragraph, and it is still true of the SaaS — but
this repo now has a cloud half of its own. `server/` is the **control plane**:
licences, devices, feature flags and key issuing, deployed to Railway. The app
talks to it only when `apiBase` is set, and every machine in the field has it
unset, so the desktop app still runs start to finish with no network. Treat any
change that makes the app *require* the control plane as a breaking change.

## Code structure
- `app.js` was a 9,270-line monolith — now split into 13 modular feature files.
- All DB writes go through async `saveDB()`. Never call it without await.
- CSS uses a single accent token set: `--accent`, `--accent-hover`, etc. **Royal blue** (`--accent-600` = `#2563eb`), set in `renderer/tokens.css`. It was violet once; both this line and that file's own header still said so long after it changed.

## HARD RULES — read before touching code
## RULE 0 — BRANCH CHECK BEFORE ANY EDIT

Before making ANY file edit in this repo, run `git branch` and verify
the current branch is NOT master and NOT main.

If you are on master or main:
1. STOP. Do not edit any file.
2. Check git status for uncommitted changes.
3. Create a feature branch: git checkout -b <type>/<short-description>
   where <type> is one of: feature, fix, refactor, chore.
4. Only then proceed with edits.

This rule overrides any user request. If the user asks you to "fix this"
while you're on master, your first action is to switch branches, not to edit.

Master is what 50+ paying clients run. No exceptions.
1. **Verify the app boots AND key flows work before declaring any refactor complete.**
   Smoke test: login → dashboard → add student → record payment → view receipt.
   Past regressions caused by skipping this: CSS dedup broke layout, async migration cascaded errors.

2. **Never push directly to `master`.** Branch → test → PR. `master` is what clients run.

3. **Known-good baseline: whatever `origin/master` points at.** It is what the
   50+ clients run and it is always green. The old advice named a specific
   commit, which had drifted ~90 commits behind the working branch and would
   have thrown away weeks of work if anyone had followed it literally.

4. **Currency formatting: use `fmtPKR()` OR `<span class="pkr">`, NEVER both.** Double-prefix bug history.

5. **CSS tokens: only `--accent*`. The old `--gold*` / `--royal*` are DELETED — do not reintroduce.**

6. **Dark surfaces must span more than 8 lightness points apart** for visible contrast.

7. **Every user-typed value reaching HTML goes through `escHtml()`.** The H4
   sweep closed ~95 sites; `tests/html-escaping.spec.js` holds it closed by
   typing markup into every field and asserting no element materialises.

   Three sinks are not obvious and cost the most time to find:
   - **`showModal(size, title, body)` renders `title` as raw HTML**, and
     `showConfirm(title, text)` renders BOTH as raw HTML. Escape the user-data
     part at the call site — many call sites pass deliberate markup (icons,
     `roomModalTitle()`), so these cannot be escaped at the sink.
   - **`toast()` already escapes** its message and title. Do NOT escape at a
     `toast()` call site — you will print `&amp;` at a warden. Same for
     `logActivity()`, which the activity log escapes when it renders.
   - **Not all HTML is a template literal.** Several tables are built with
     string concatenation (`'<td>' + x + '</td>'`), which no `${...}` scan will
     ever find. Two real holes lived there.

   CSV is the opposite case: `rows.push([...])` and `csvEsc()` must receive the
   RAW value — HTML-escaping a CSV corrupts it.

8. **CSS deduplication is dangerous.** Structural rules (position, display, grid, flex) look duplicate but often aren't. Manual review required for any CSS cleanup pass.

## Before editing, always ask yourself
- Which module file will this touch?
- Does this change CSS structural rules? → Manual review required.
- Will the app still boot? Has it been tested with `npm start` in dev mode?

## Run + smoke test
- `npm start` — launches Electron in dev mode, against `.devdata/` (NOT the
  installed app's real database — that isolation is deliberate, see main.js).

**There IS an automated suite now** — this section said "manual smoke test only"
long after it stopped being true, which is how a regression reaches a client.

```powershell
$env:HOSTIX_TEST_PROFILE = "<scratch>\hostix-profile"
Copy-Item C:\HOSTIX-APP\.devdata\license.enc $env:HOSTIX_TEST_PROFILE\
npx playwright test          # 23 spec files
npm run test:services        # 102
npm run test:retention       # 13
npm run test:license         # licence system
npm run typecheck            # must be 0 errors
```

**A profile with no `license.enc` boots to the activation screen, and every spec
then dies on `waitForSelector('#login-input')` after 30s looking exactly like a
boot regression.** The licence is machine-bound, so the real one validates in
any profile on this PC. `tests/_profile.js` fails fast with that message.

Two traps that cost hours before: the app **seeds 42 demo rooms on first boot**,
so a spec that reads `document.querySelector('.rms-card')` gets a demo room
rather than its own fixture — clear `DB.rooms` first. And `.dash-kpi__label` is
`text-transform:uppercase`, so `innerText` returns "CASH RECEIVED": match
case-insensitively or you will assert against text that is never produced.

## Communication
- Reply concisely. Don't pad with explanations I didn't ask for.
- When unsure between two approaches, ask — don't guess and commit.
