# Hostyllo — Offline Edition — Claude Code Context

## What this is
Offline Electron desktop app for hostel management. Deployed to 50+ Pakistani hostels under the Hostyllo brand (formerly Zeerak Hostix). Vanilla JS/HTML/CSS — NO build step, NO framework, NO bundler. SQLite via better-sqlite3.

User-visible branding is **HOSTYLLO** — set by `appName` in `renderer/src/config.js`. Do not reintroduce "HOSTIX" in any user-facing string. The repo folder and remote are still named `HOSTIX-APP`; that is expected, leave paths alone.

The product is **one brand, two editions**: this desktop app is *Hostyllo Offline*,
the SaaS at `C:\hostyllo` is the cloud edition. They share a name deliberately —
Phase 2 has this app fetching its entitlement from the Hostyllo control plane, so a
customer must never see two vendor names for one purchase. Write the wordmark as
`HOSTYLLO`, prose as `Hostyllo`, and the full product name as `Hostyllo Offline`.

**Four names are identifiers, not branding, and must not be renamed** (rename swept
2026-08-30; see commit `04e73f2`):

| Name | Why it is frozen |
|---|---|
| `package.json` `"name": "hostix-app"` | `app.getName()` resolves it, so it *is* `%APPDATA%\hostix-app` — the folder holding every client's `hostix.db`, `license.enc` and `last_run.dat`. Renaming points 50+ installs at an empty folder. Needs a userData migration, not a rename. |
| `hostix.db` | Same, plus the `hostix.db.pre-v1.bak` migration snapshot and ~20 specs. |
| `appId: com.zeerak.hostix` | NSIS upgrade identity. A new appId installs *alongside* the old app instead of replacing it. |
| `publish.repo: "HOSTIX-APP"` | Must match the GitHub repository name or auto-update breaks. |

`build.productName` **was** safe to change (now `Hostyllo Offline`): it sits under
`build`, so Electron never sees it as a top-level `productName` and `app.getName()`
still returns `hostix-app`. That is the same behaviour behind the 2026-08-15
dev-data incident, and the reason userData does not move.

`DAMAM` is likewise frozen — but **only** where it is load-bearing: `damam_salt_v1`
(derives the licence AES key), `DAMAM_WARDEN_PW_SALT_v1_2025` (hashes warden
passwords), the `damam_auth_*` localStorage keys (hold the user accounts), and the
keygen history store. Those are storage keys nobody reads; renaming them destroys
live data.

**No seeded default may name a real hostel, person or address** (owner's ruling,
2026-08-30). "DAMAM Boys Hostel" and the Kakakhel Street address used to be the
seed values in `config.js`, the fallbacks behind `DB.settings.hostelName` on the
dashboard, receipt, reports, students and settings screens, and — worst — the
backfill `restoreBackup()` applies when a backup arrives missing its identity
fields, which stamped one customer's hostel name and street address onto another's
install. The neutral default is now `'Hostel Name'`, and `location` seeds empty.
Placeholders follow the same rule: describe the field ("Full name"), never name a
person.

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

9. **A bed has three numbers, and they are not interchangeable.** Owner's
   ruling, 2026-08-30, from how notice actually works here: you tell the warden
   by the 25th, and the next student wants that exact room the same week.

   - `getRoomOccupancy(room)` — beds **slept in**. Counts `isResident()`, so a
     student on notice still holds theirs and is still billed for it.
   - `getRoomVacating(room)` — beds whose occupant has given notice.
   - `roomFreeBeds(room)` — `capacity - occupancy + vacating`. **Every capacity
     gate reads this one.** A bed on notice is not free, it is *reservable*.

   `getRoomOccupancy()` counted `status==='Active'` until this ruling while
   `renderRooms()` counted `isResident()`, so the Rooms page drew a room full
   while the Add Student picker offered the same room a free bed — the answer
   depended on which screen the warden happened to be looking at. Do not
   reintroduce a second definition of "occupied"; `roomAvailLabel()` is the one
   phrase every picker prints.

10. **A month's data belongs to that month.** Owner's ruling, 2026-08-30.
    Records belong to the month of the thing they describe, not the month the
    form was filled in — a cancellation filed on 20 July for a 31 August
    move-out is an **August** departure (`_cancMonthKey`).

    People are the exception, and only in one direction: a student belongs to
    every month they were living here (`_stuInMonth` — admitted on or before it,
    not departed before it), so the roster carries forward. Someone admitted in
    September must never appear in August.

    A month total on a card must not move when a record merely changes status.
    The Cancellations headline counts Pending **plus** Confirmed for exactly
    this reason: it read Pending alone, so it fell 20 -> 15 as wardens marked
    leavers Left, and an owner reading it concluded the warden was inventing
    numbers.

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

<!-- Appended 2026-08-31 from design-studio-install.md. The rules ABOVE this
     line are the owner's and take precedence; nothing above was altered. -->

## Design governance

**`renderer/tokens.css` is the bound design system.** It is not a suggestion and
it is not a starting point to riff on.

> Reconciled 2026-08-31. The design studio shipped with its own `BASELINE.css`
> and a rule set written for it. That file defined a DIFFERENT system — accent
> `#cc785c`, `"Anthropic Sans"` — and collided with `tokens.css` on `--accent`,
> `--surface` and `--font-sans`, so a stray `<link>` would have repainted the
> whole app. It was removed rather than kept as a reference, and the rules below
> are its rules restated against the system this app actually has. Four were
> written about the other system and describe nothing here; they are recorded at
> the end rather than deleted, so nobody re-adds them from the original manifest.

### Hard rules

- Never edit on master. Branch first, always.
- Verify the app boots before declaring any refactor or redesign complete.
- Colours come from `var()` tokens in `renderer/tokens.css`. A raw hex in a
  renderer component is a bug — **except** in the print and PDF documents, whose
  hex is deliberate: they render in a separate window with no stylesheet and
  must not follow the app's theme onto a sheet of white paper.
- Rebranding means overriding the `--accent-50 … --accent-900` ramp, from which
  `--accent`, `--accent-strong`, `--accent-soft` and `--accent-dim` derive.
  Nothing else. Never fork the token file.
- One primary accent action per screen. Colour means "act", never "look".
- Payment methods and other CATEGORIES are neutral. Hue is reserved for state —
  see `pmBadge()` versus `statusBadge()`.
- Use `fmtPKR()` for currency. Never duplicate it, never double-prefix.
- Money a user might compare is `font-variant-numeric: tabular-nums`.
- A monthly figure means the whole charge — rent **and** mess. `paymentCharges()`
  for a record, `resolveCharges()` for a student. Quoting `monthlyRent` alone is
  the bug fixed on 2026-08-31; it is not a shortcut.
- Every list, table, export, report and PDF is ordered by room number ascending,
  through `cmpRoomNo` / `studentsByRoom` / `roomsByNumber`. Room numbers are
  strings — `Number(r.number)` is a bug, "A 01" is a legal room.
- New CSS goes in the screen's own `renderer/<screen>.css` under a prefixed
  class. Do not edit shared selectors in `style.css` to fix one screen.
- 1366x768 is the QA floor. If it fails there, it does not ship.

### Rules from the manifest that do NOT apply here

Kept visible on purpose — each was true of `BASELINE.css` and false of this app,
and deleting them silently invites their return.

- ~~"No `box-shadow` for elevation, anywhere."~~ This app has **166** of them and
  `--shadow` is a token. `dashboard.css` states the reasoning: cards on a tinted
  workspace read as outlines rather than surfaces without one. If flat elevation
  is ever wanted it is a design decision to take deliberately, not a lint rule.
- ~~"Filled primary buttons keep the bottom-only 8px radius. It is the
  signature."~~ It is `BASELINE.css`'s signature. This app has one occurrence.
- ~~"Serif appears in three places only."~~ This app is sans throughout; the only
  serif is the optional hostel-name display face in Settings.
- ~~"No new inline `style` attributes. Ever."~~ The renderer builds its markup as
  template strings and uses them extensively. Worth reducing over time, but as
  an absolute rule it fails on the existing code the moment it is enforced.

### When to reach for the studio

Any screen, component, dashboard, table, form, or layout being designed,
redesigned, or critiqued invokes the `design-studio` skill. A screenshot or
reference image pasted into the session invokes it too — treat the reference as
input to be challenged, never as a target to reproduce.

Delegate read-heavy codebase analysis to `ux-analyst` rather than pulling forty
files into the main context. Delegate scoring to `design-critic` so the verdict
comes from a session with no stake in the proposals.

Run `design-governance` and `qa-regression` before presenting any UI work as
finished. Both, every time.
