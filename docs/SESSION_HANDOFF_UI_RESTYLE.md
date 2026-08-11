# Handoff — UI v5 (branch `ui/preview-all`)

**Last updated:** 2026-08-11 (evening) · **Branch:** `ui/preview-all`
(26 commits ahead of `master`, **not pushed**)

> ## ⚠️ The approach changed at commit `3e23099`
>
> Steps 1–12 below were a **neutral restyle**: keep each screen's markup, strip
> decorative colour. From `3e23099` onward the work is a **rebuild against the
> owner's reference designs** — new markup, and a dedicated stylesheet per
> screen so the shared sheet stays untouched.
>
> Sections 1–3 are kept for the reasoning behind colour decisions, which still
> holds. The step list in §3–4 is **done, not pending**. Current state is §7.

---

## 1. The rule this whole branch follows

> **Colour that decorates goes neutral. Colour that reports genuine state stays.**

Concretely, as applied in steps 1–12:

| Thing | Treatment |
|---|---|
| Uppercase mini-labels / captions | `var(--text3)` |
| Headline numbers, money, names, row IDs, room #s | `var(--text)` |
| Section headers inside cards | `var(--text2)` |
| Avatars / icon chips | `background:var(--bg3); color:var(--text2)` |
| Progress-bar fills (non-danger) | `var(--text3)` |
| Decorative badges (categories, methods, types) | `badge-gray` |
| **Selected / active state** | `var(--accent)` — border, 3px top-rule, and `--accent-strong` label |
| Genuine danger / destructive | keep `--red` / `--red-dim` |
| Genuine lifecycle status | keep the status badge (`badge-gold` = Pending, `badge-gray` = settled, `badge-green` = restored/active, `badge-red` = blacklisted) |
| PDF / print templates | **do not touch** — hardcoded hex by design |
| Room-type DATA colours | **do not touch** — they are data, not styling |

Two structural notes learned the hard way:

- `.stat-card.red/.teal/.green/.gold/...` only supply a top gradient bar + a
  coloured `.stat-icon` chip. The **base `.stat-icon` rule has no background of
  its own**, so dropping the colour class leaves the chip bare. Add
  `background:var(--bg3);color:var(--text2)` inline on the chip when you drop
  the class. (Dashboard steps 2–3 dropped the class without this, so the
  dashboard's stat icons are currently bare — a cheap follow-up if you want it.)
- `badge-gold` is **not** amber. It resolves to the accent (violet) pill. That
  is exactly what the Stitch mockups show for "Pending".

Scope discipline: **one screen per commit**, and stay inside that screen's
module file. Do not edit `renderer/style.css` for a single screen unless there
is no inline alternative — shared CSS touches every screen, including ones not
yet restyled. (CLAUDE.md rule 7: CSS dedup/structural edits are dangerous.)

---

## 2. Done so far

| Step | Screen | Commit |
|---|---|---|
| 1–7 | Dashboard (KPIs, trend chrome, occupancy strip, seat/room modals, month-detail, search) | `0bedbe3`…`20506a3` |
| — | Rooms | `7f4d8cd` (merged from `ui/rooms-stitch`) |
| 8 | Students list | `5b3fc3e` |
| 9 | Finance / Payments list | `73fda78` |
| 10 | Expenses list | `0c7bcb9` |
| 11 | Shared modals + date picker | `dbc15f2` |
| 12 | Cancellations | `8377e1f` |

Two real bugs were fixed along the way (both visual, both genuine):
- **step 11** — date picker `.today` was accent fill with `#000` text (3.1:1,
  fails contrast) and `.selected` was `--blue`, the last off-brand hue in the
  component. Now: today = accent ring, selected = accent fill with `#fff`.
- **step 12** — Cancellations drew `Confirmed` with an inline red override on
  `badge-gray`, i.e. **the same red as `Pending`** — the two states were
  indistinguishable in the list. The PDF export already carried a fix-comment
  for this exact defect; the on-screen path had never been fixed.

---

## 3. Next up — step 13: Reports (`renderer/src/modules/reports.js`)

**This is the biggest remaining screen by far.** Mockup:
`stitch-prototypes/images/15-reports-light.png` — charts in accent violet +
neutral grays, money figures plain `--text`, no green/red tinted panels, only a
small green delta chip.

Full inventory of what needs changing, by line (verified 2026-08-11):

**Filter card row (L386–432)** — seven `stat-card green/gold/red/purple/teal/blue`
cards, each with its own hue for label, selected border and top-rule. Apply the
Cancellations treatment exactly: drop the colour class, labels `--text3`,
values `--text`, neutral `--bg3`/`--text2` icon chips, and move **all** selected
states to `--accent` / `--accent-strong`. (Note L421 already uses `--accent` for
its selected border while L428 uses `--blue` — inconsistent today.)

**Tinted summary panels** — L46–59 (revenue green / expenses red / available
fund), L87–97 (outstanding amber / records red / partially-paid blue),
L128–130, L192–197, L260–262, L502–516, L950–954. All are `X-dim` background +
coloured border + coloured value. Go to neutral card surfaces with `--text`
values and `--text3` labels. **Exception:** keep the red/green split on
"Available Fund" when `net < 0` — a negative fund is genuine danger.

**Table cells** — L64–67, L102–106, L173–177, L233–235, L342–343: `--blue`
student names, `text-gold` room numbers, `text-green` money. Same as the
students pass: all → `--text` / plain `fw-700`. Keep `text-red` on the
*unpaid/outstanding* column (L106) — that is a genuine arrears signal.

**Badges** — L136 income/expense, L215 expense category (`badge-amber` →
`badge-gray`, it is a category not a status), L270/L488 Cash vs Bank
(`badge-green`/`badge-blue` → `badge-gray`, payment method is a category — same
call already made in `modals.js pmBadge()` in step 11).

**Charts / progress** — L322 (`--red` fill), L332 (`--green` fill), L364–365
(revenue/expense bars), L442 (legend dots). The mockup uses accent + neutral
gray for chart series. Recommend: primary series `--accent`, secondary
`--text3`, and update the legend dots to match.

**`csvBtn(type, color)` (L25)** — every call site passes a different hue
(`--green`, `--amber`, `--blue`, `--teal`, `--red`). Simplify the helper to a
single neutral/secondary button and drop the `color` argument at all 7 call
sites. Also L26 `pdfBtn` uses `color:#000` on accent — same contrast failure
fixed in step 11; make it `#fff`. L380 has a stray `color:var(--green)` on a
secondary button.

**Do NOT touch** the PDF/print blocks: L648–830 and L700–745 (hardcoded hex is
intentional and matches the printed brand).

---

## 4. After Reports

| Step | Screen | Remaining coloured spots |
|---|---|---|
| 14 | Complaints & Maintenance (`issues.js`) | 2 |
| 15 | Settings (`settings.js`) | 1 |
| 16 | Students (`students.js`) — leftovers | 9 (verify which are genuine status first) |
| 17 | Activity Log, Annual Archive, Login | not yet audited |

Quick re-audit command:

```
rg 'var\(--(teal|blue|green|gold|red|amber|purple)[a-z0-9-]*\)|text-(gold|green|blue|red)|badge-(teal|purple|blue|amber|green|red)' renderer/src/modules --count
```

---

## 5. Before this branch merges

Per `CLAUDE.md` rule 1 — **none of these 15 commits have been run in the app yet.**
Smoke test is mandatory and non-negotiable:

```
npm start
```
→ login → dashboard → add student → record payment → view receipt.

Also visually check, since these are pure-CSS-value changes that `node --check`
cannot catch: the Cancellations filter cards in **both** themes (dark surfaces
must stay >8 lightness points apart, rule 6), and the date picker with a day
that is both today and selected.

Then: push, PR into `master` (`master` is the direct PR target; `main` is
retired). **Never push straight to `master`** — 50+ paying hostels run it.

```
git push -u origin ui/preview-all
```

---

## 6. Verification used per step

- `node --check renderer/src/modules/<file>.js` after every edit (catches JS
  syntax, **not** CSS — a broken CSS rule inside a template string parses fine
  and fails silently at render; this has bitten this repo before).
- One commit per screen, with the reasoning for every *kept* colour written
  into the commit body, so the next session can tell a deliberate keep from a
  miss.

---

## 7. Current state — 2026-08-11 evening

### Rebuilt to the owner reference designs

| Screen | Stylesheet | Commit |
|---|---|---|
| Dashboard | `dashboard.css` | `3e23099`, `14b3672` |
| Payments + app chrome | `payments.css`, `chrome.css` | `d8ecf99` |
| Students (list + full-page add/edit form) | `students.css` | `b07b914` |
| Rooms + payment modal | `rooms.css` | `9cff193` |
| Login | `login.css` | `e683a4d` |
| Reports | `reports.css` | `9b321b4` |
| Complaints & Maintenance | `issues.css` | `3e89bd6` |
| Cancellations | `listkit.css` | `d45c260` |

`listkit.css` is shared: stat strip, toolbar, table and pager chrome. New list
screens should build on it rather than restyling `style.css`.

### Accent

`--accent*` in `tokens.css` is **royal blue** (`#2563eb`), moved from violet on
the owner's call. Token names are unchanged per CLAUDE.md rule 5. Every screen
reads the accent through these tokens, so this block is the only place the
app's accent is decided.

The login reference sheet was drawn in **orange**; that was not adopted. Its
three brand tokens mirror `--accent-500/600/50`. The illustration keeps a warm
window glow deliberately — lit windows are naturalistic, not branding.

### Brand

The app is **HOSTYLLO** in UI text. The rename is confined to what the user
reads. These are unchanged and **must stay unchanged**:

| Key | Value | Why |
|---|---|---|
| `package.json` `"name"` | `hostix-app` | resolves `app.getPath('userData')` → `%APPDATA%\hostix-app`, which holds `hostix.db` and `license.enc` |
| `appId` | `com.zeerak.hostix` | installer + licence identity |
| db filename | `hostix.db` | 50+ live client databases |

Renaming any of them points existing installs at an empty profile: data loss
plus deactivation.

**Known gap:** `DB.settings.appName` is read by receipts and PDF exports, and
existing client databases already hold `'HOSTIX'`. The new `'HOSTYLLO'` default
only applies to fresh installs, and the setting is not editable in the Settings
UI, so existing clients keep printing HOSTIX on receipts. Closing that needs
either a one-time migration on client DBs or a Settings field — an owner call,
deliberately not made here.

### Verification

`npx playwright test` — 6/6 green (smoke + regression) against an isolated
profile. Set `HOSTIX_TEST_PROFILE` to a throwaway dir holding a copy of
`license.enc`; the spec refuses to write if the DB it finds is not empty.

Every screen was captured in both themes and reviewed. A capture spec is not
committed; recreate it by driving `navigate(page)` and `toggleTheme()` through
Playwright if needed.

### Still to do

1. **Not yet rebuilt:** Settings, Activity Log, Annual Archive.
2. `docs/ui-v5-preview.html` is untracked (~500 KB) — decide whether it belongs
   in the repo.
3. **Not pushed.** Branch off `master`, PR into `master`; `main` is retired.
   Never push straight to `master` — 50+ paying hostels run it.
