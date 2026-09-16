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
talks to it only when `apiBase` is set, so the desktop app still runs start to
finish with no network. Treat any change that makes the app *require* the
control plane as a breaking change.

**`control-plane.json` on `master` is the rollout lever, and it is live
infrastructure — not a config file.** `services/discovery.js` fetches it from
raw.githubusercontent.com once a day; it is how a shipped build learns the
address at all, because `DEFAULT_API_BASE` is baked empty and cannot be changed
without a release. Editing that one file re-points every install.

Three things follow from that, and each is a way to break 50 hostels quietly:

- Setting `"apiBase": null` is the **kill switch** — it clears every install's
  cache and returns them to offline-only. That is a supported state, not a
  fault, but do not reach for it by accident.
- Change the file **before** deleting or re-provisioning a Railway service, and
  give it a day. Generated `*.up.railway.app` names are recycled, and an install
  still pointing at one sends its licence key and machine id to whoever claims
  it. Nothing can be granted that way — entitlements are signed by a key that is
  not on that host — but it would be received.
- Resolution order is `env > online-config.json > DEFAULT_API_BASE > discovered`.
  Discovery sits *below* the baked default deliberately, so a build that
  eventually bakes `license.hostyllo.com` trusts itself and this goes dormant.

## Code structure
- `app.js` was a 9,270-line monolith — now split into 13 modular feature files.
- All DB writes go through async `saveDB()`. Never call it without await.
- CSS uses a single accent token set: `--accent`, `--accent-hover`, `--accent-bg`, `--accent-fg`, `--on-accent`. **Blue** — `#2451D6` light, `#7BA0FF` dark — set in `renderer/css/tokens.css` (HOSTYLLO_DESIGN_SPEC Part 2, adopted 2026-09-16). It was violet once; blue is decided (spec Part 9).

## Exports — one engine, nine modules

**Every PDF and Excel export goes through `renderer/src/export/`.** A module
supplies a *definition* — its rows, columns, filters, summary and totals — and
`EXPORT.pdf(def)` / `EXPORT.excel(def)` render it. The engine owns branding,
page size, orientation, headers, footers, repeated headings, page breaks,
number and date formatting, file naming, empty states and print configuration.
The contract is documented at the top of `export/engine.js`; built 2026-09-07
to the owner's export specification, and `docs/SESSION_HANDOFF_2026-09-07-exports.md`
records what each module carries.

- **PDF and Excel are rendered from ONE definition.** They may differ in
  presentation and in which columns they carry — a workbook can hold a CNIC
  column that would not fit a printed page — but never in their dataset.
- **`export/xlsx-writer.js` writes the .xlsx, not SheetJS.** The vendored
  SheetJS is the community build: it cannot write cell styles, frozen panes or
  page setup, which is four of the specification's non-negotiables. SheetJS is
  still loaded and still used — Settings READS uploaded workbooks with it.
- **Do not invent a column for a field this app does not record — CAPTURE the
  field instead, or print a dash.** An expense was `{date, category,
  description, amount}`. On 2026-09-09 it gained `method`, `handedTo` and
  `receipt`, because the reference's Payment Method and Added By columns had to
  come from somewhere and a form is where a field belongs before an export is.
  Records written before that carry none of the three, and print `—`. There is
  still no vendor. Two rules survive the change and are the point of it: a
  blank is stored as an ABSENT key, never `''` (the "Not recorded" filter and
  the export's dash both read absence), and a page of em dashes is still worse
  than an honest set of fields.
- The **room visit sheet** and the **student card** deliberately stay outside
  the engine. They are physical objects with a signed-off design, not exports.
- `npm run test:export` holds the engine to the specification without Electron.

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
npx playwright test          # 50 spec files — run 5-7 at a time or the worker OOMs
npm run test:export          # the export engine, against the export spec (no Electron)
npm run test:services        # 136
npm run test:retention       # 13
npm run test:license         # licence system
npm run test:update          # the update channel + the "Check for Updates" dialog
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

**`renderer/css/tokens.css` is the bound design system**, and
`HOSTYLLO_DESIGN_SPEC.md` (owner, 2026-09-15; adopted 2026-09-16) is the
document it implements: tokens (Part 2), base (Part 3), component rules
(Part 4), file structure (Part 5), screen order (Part 6) and the per-screen
prompt (Part 7). Where this section and the spec disagree, the spec wins —
except for the owner decisions under "Decided against the spec" below.

> Rewritten 2026-09-16 when the spec was adopted. The previous section bound
> `renderer/tokens.css` (removed), kept shadows as elevation, kept a warm dark
> ground and kept the `dh-*` hue classes. The spec reverses all four.

### Hard rules

- Never edit on master. Branch first — one spec step, one branch, one commit.
- Verify the app boots, and check the screen in BOTH themes, before declaring
  any rebuild done.
- Colours come from `var()` tokens in `renderer/css/tokens.css`: neutral
  surfaces, one accent (blue — decided), four status roles. A raw hex anywhere
  else is a bug, **except** the print and PDF documents, whose hex is
  deliberate: they render on white paper in a window with no stylesheet.
- Type, spacing, radius, control heights, motion and z-index come from their
  tokens too — six text sizes, weights 400/500/600, a 4px spacing grid, radius
  4/8/12/999. A value that does not map is a question for the owner, never a new
  token and never a kept raw value.
- Elevation is borders. Only floating things — menus, modals, toasts — carry a
  shadow, from `--shadow-menu` / `--shadow-modal` / `--shadow-toast`.
- Chips have five roles only — success, warning, danger, accent, neutral — at
  12px weight 500, a `*-bg` with its matching `*-fg`. The `dh-*` hue classes and
  the per-screen pill variants retire as each screen is rebuilt.
- A screen stylesheet may PLACE components (grid, position, width, order). It
  may not RESTYLE them (font-size, colour, radius, padding on a component's own
  class). A missing component is built in `renderer/css/components/`.
- The component layer lives in `renderer/css/components/` and every class in it
  is `ui-` prefixed: `.ui-btn` (`--primary` / `--secondary` / `--ghost` /
  `--danger`, plus `--icon` and `--sm`), `.ui-input` / `.ui-select` /
  `.ui-selectw` / `.ui-search` / `.ui-field` + `.ui-label`, `.ui-chip` and its
  five roles, `.ui-card` (+ `--flush`), `.ui-table` with `.ui-table-wrap`,
  `.ui-th-sort`, `.ui-td-num` and `--dense` for a ten-column-plus register,
  `.ui-empty`, `.ui-pagebar` / `.ui-pager`, `.ui-avatar`, `.ui-menu` (+ `__t`,
  `__item`, `__read`, `__sep`) and `.ui-tabs` / `.ui-tab`. Screen files live in
  `renderer/css/screens/`. Expenses and students are on the layer
  (2026-09-16); each screen joins as it is rebuilt.
- A tab is a `<button role="tab">` and its state is `aria-selected`, not a
  class. A menu item is a `<button role="menuitem">`; a line a menu merely
  states is a `.ui-menu__read`, with no handler and no pointer.
- A sortable column header is a `<button class="ui-th-sort">` inside the `<th>`,
  and the `<th>` carries `aria-sort`. An `onclick` on the `th` itself is not
  reachable by keyboard.
- The old names (`--card`, `--text`, `--text2`, `--text3`, `--border2`, `--bg3`,
  `--green` …) are aliases in the LEGACY BRIDGE of tokens.css, so screens not yet
  rebuilt paint the new palette. Nothing new is written against them; the bridge
  is deleted after the last screen.
- An alias of a themed token is declared in BOTH `:root` (dark) and
  `body.light-theme`. Declared on :root alone it freezes the dark value.
  `npm run test:theme` and `theme-parity.spec.js` check both halves.
- One primary accent action per screen. Colour means "act", never "look".
- Payment methods and other CATEGORIES are neutral. Hue is reserved for state.
- Money on screen goes through ONE formatter in `utils.js`. Never duplicate it,
  never double-prefix (`fmtPKR()` or a `.pkr` span, not both).
- Money a user might compare is tabular figures (`base.css` sets them on every
  table).
- A monthly figure means the whole charge — rent **and** mess. `paymentCharges()`
  for a record, `resolveCharges()` for a student. Quoting `monthlyRent` alone is
  the bug fixed on 2026-08-31; it is not a shortcut.
- Every list, table, export, report and PDF is ordered by room number ascending,
  through `cmpRoomNo` / `studentsByRoom` / `roomsByNumber`. Room numbers are
  strings — `Number(r.number)` is a bug, "A 01" is a legal room.
- Icons are SVG only, through `icon()`. No emoji, no icon font.
- 1366x768 is the QA floor. If it fails there, it does not ship.

### Decided against the spec (owner, 2026-09-16)

- **Register alignment stays as approved on 2026-09-10 and 2026-09-15**: values
  centred; names, course, address and "raised by" on one left edge. The spec's
  right-aligned numeric columns are not applied — the shared table component
  carries this rule when `registers-center.css` is dissolved.
- **Money on screen is 14,000.00 below a million and 1.25M above**, the exact
  figure in its title, through one formatter.
- **No brand colour anywhere, including WhatsApp's** (owner, 2026-09-16): the
  student's WhatsApp mark and the guardian's handset are both
  `--text-tertiary`, and the two icons are what tell them apart. A green that
  cannot follow the theme, on a mark that repeats on every row, marks nothing.
- **A wide register may use `.ui-table--dense`** rather than scrolling: it
  takes air out of the cells and never shrinks the type, which is how the
  students roster holds eleven columns at the 1366 floor. Where even dense does
  not fit — the drawer's nine-column ledger — the table scrolls inside its own
  wrapper, as the spec says, and the type stays at the 11px floor.

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
