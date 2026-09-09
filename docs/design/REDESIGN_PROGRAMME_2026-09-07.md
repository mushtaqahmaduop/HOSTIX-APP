# Redesign programme — opened 2026-09-07

Owner handed over 7 written specs and ~30 design references overnight, with
"work continuously following docs, designs and prds and claude.md". This file is
the work order and the running progress log. Branch: `feature/dashboard-1c`
(RULE 0 satisfied — not master; not switched, because the owner has uncommitted
work in `students.js` / `students.css`).

## Sources

### Written specs (`C:\Users\PCS\Downloads\`)
| Spec | Target screen |
|---|---|
| `hostyllo-payments-spec.md` | Payments / Finance |
| `Hostyllo_Reports_Page_Implementation_Spec.md` + `..._Design_...` | Reports |
| `Hostyllo_Expenses_Page_Implementation_Spec.md` | Expenses |
| `Hostyllo_Annual_Archive_Implementation_Spec.md` | Annual Archive |
| `Hostyllo_Student_Profile_Admission_Print_Spec.md` | Student profile + admission print |
| `Hostyllo_Global_Export_Design_Implementation_Spec.md` | CSV/PDF/print, all screens |
| `Hostyllo_Dark_Mode_Brief_Specs(1).md` | Dark theme, all screens |

### Design references
Payments (`payment page.png`, `edit pay form.png`) · badges (`status-badges.png`)
· students (`edit student.png`, `former student page.png`,
`re admit former student form.png`) · expenses (`expense.png`,
`add and edit expense.png`) · rooms (`add and edit rooms.png`) · complaints
(`complaints2.png`, `add complaaint and maintinanace.png`) · cancellations
(`cancellations.2.png`, `add and edit cancellation.png`) · reports
(`reports2.png`, `reports overviev.png`) · annual archive (`annual archive.png`)
· logs (`activity logs.png`, `audit logs.png`) · users (`user managemnt.png`,
`add user.png`, `user profile.png`, `profile.png`) · settings
(`hostel profile.png`, `hostel configuration.png`, `hostel name.png`, `mess.png`,
`connectin.png`, `license page2.png`, `backup and restore.png`, `backup.png`) ·
dashboard (`seats availability model.png`) · `moving form.png`

## Order of work

Cross-cutting first where it is cheap, because every later screen consumes it.

1. **Palettes saved** — `docs/design/PALETTES_2026-09-07.md` ✅
2. **Payments page** — the owner's named starting point
3. **Edit Payment modal**
4. **Badge system** (`status-badges.png`) — cross-cutting, consumed by every screen
5. Reports · Expenses · Annual Archive (the spec'd pages)
6. Complaints · Cancellations · Rooms · Students forms
7. Settings family · Users family · Logs
8. Global export spec · Dark mode brief (both cross-cutting, both large)

## Open questions for the owner

Recorded rather than guessed. Each has a **documented default already applied**,
chosen so reversing it is a one-line change.

### Q1 — Colour on categories. `status-badges.png` vs CLAUDE.md.

`status-badges.png` §4 colours the payment METHODS (Cash green, Easypaisa pink,
JazzCash red, Bank Transfer blue, Crypto amber), and `hostyllo-payments-spec.md`
§15 colours the pricing PLAN (RENT + MESS green, RENT ONLY amber).

CLAUDE.md's hard rule says the opposite, with its reasoning:

> Payment methods and other CATEGORIES are neutral. Hue is reserved for state —
> see `pmBadge()` versus `statusBadge()`.

Both cannot hold. If every chip on a row is coloured, colour stops meaning
"needs attention" and the red Overdue badge loses the only job it has.

**Applied default:** CLAUDE.md — method and plan chips stay neutral; STATUS
badges take the full colour set from `status-badges.png`, which both documents
agree on. Reversing is a token swap in one badge function.

### Q2 — Neutral palettes vs the tinted ladders.

See `PALETTES_2026-09-07.md`. The four palettes are pure neutral; `tokens.css` is
deliberately warm (dark) and cool-blue (light). **Applied default:** nothing
repainted; palettes saved as reference only.

### Q3 — `hostyllo-payments-spec.md` §6 asks for a "Paid / Pending records + %"
KPI pair, but the app's existing Payments KPIs may differ. Where the spec and the
live page disagree on a FIGURE (not a style), the live financial authority
(`renderer/src/finance.js`) wins — spec §2 and §36 both say so themselves
("use the existing Hostyllo financial calculation … rather than implementing a
competing calculation"). Any KPI the spec asks for that finance.js cannot answer
is reported, not fabricated — spec §46 forbids inventing financial records.

### Q4 — Twelve columns do not fit 1366 without losing something

The payments spec makes twelve columns mandatory (§11) and forbids hiding any of
them (§23, §46). At the 1366 QA floor, minus the 212px rail and content padding,
the table gets **1060px**. The twelve columns measured **1285px**.

Compact currency (§7) and the density pass (§43) brought that to **1157px**, all
without touching a figure — but it is still 97px over, so Concession sits under
the pinned Actions column until the table is panned. It fits fully at 1440+, and
with the rail collapsed.

Note the reference image `payment page.png` is drawn on a **1536px** canvas, so
the mockup never had to solve this.

**Applied default:** the existing drag-pan with a sticky Actions column is kept
(§41 allows horizontal scroll below 1280, and Actions stays reachable). Nothing
is hidden. The remaining 97px would have to come out of the Method labels
("Bank Transfer"), the student phone line, or the coverage badge — all of them
information. **Owner's call** which, if any, is worth losing.

### Q5 — Expenses: two spec'd columns have no data behind them

Expenses spec §15 wants Payment Method and Added By columns. The expense record
is `{id, category, amount, date, description}` — it has neither field, and
nothing captures the logged-in warden at write time.

§15, §20 and §21 all forbid fabricating them, so they are **not implemented**.
Adding them is a data-model change plus capture in the Add Expense form, not a
reskin. **Owner's call** whether that is wanted.

### Q6 — Expenses spec contradicts its own reference image

Spec §6 and §8 require compact notation with a worked table
(1,245,600 → `PKR 1.25M`). The reference `expense.png` shows `PKR 1,245,600`
uncompacted in the same cards. **Applied default:** the written spec, since it
is explicit, gives a conversion table, and matches what Payments now does.

### Q7 — `status-badges.png` vs the Expenses spec, on method chips

Expenses spec §20 says payment-method badges must be "compact **neutral**
badges". `status-badges.png` §4 colours them. The Expenses spec and CLAUDE.md
agree against the badge sheet, which is two documents to one — **method chips
stay neutral**, and this is now a settled default rather than an open question.

## Progress log

- **2026-09-07** — Palettes sampled and saved. Payments spec + references read.
  UX analysis of the live Payments page delegated per CLAUDE.md.
- **Payments page — DONE.** Month cell prints `September 2026` instead of the
  raw `2026-09` key; Charge/Mo gained the existing `chargeCoverage()` badge in
  place of a prose sub-line; all money compact via `fmtPKRk()` with the exact
  figure in a title; both money KPIs compact; "Extra Chrgs" header corrected to
  "Extra Charges"; arrears rows gained the §24 amber tint; row actions gained a
  40x40 hit area without widening the pinned column; density pass per §43.
  A stale comment claiming the secondary columns were "hidden until the sidebar
  is collapsed" was corrected — `.pay-col-x` styles nothing anywhere in the app
  and never did.
- **Edit Payment modal — DONE.** Restructured from one flat `.form-grid` into
  four numbered sections, with a live Payment Summary panel (Total Due / Total
  Paid / Remaining + a verdict line) fed from the arithmetic `recalcUnpaid()`
  already performed. `submitEditPayment()` deliberately untouched: it restates a
  whole record rather than posting a delta, so routing it through
  `applyPayment()` would double-post.
- **Expenses page — core done.** Compact money in the KPI cards and the Amount
  column (spec §19's own examples now render verbatim: PKR 40K / PKR 7K /
  PKR 4.5K / PKR 25.6K); period-over-period trend on the headline card with an
  honest "No comparison" state (§7); Average Daily now names the divisor. Its
  existing days-elapsed divisor was kept — §6.2 explicitly prefers it over a
  fixed 30.
- **Status badges — every state now carries a glyph, not just Paid.** The pill
  drew a tick on Paid and nothing on Partial or Pending, separating them by hue
  alone; "Overdue" was bare red text. Both the dark-mode brief §6 and the badge
  sheet forbid meaning carried by colour alone, and at 9.5px an amber/slate
  distinction survives neither a colour deficiency nor a cheap panel at a
  counter. Overdue is now a pill of its own, kept beside the status rather than
  replacing it — a record can be Partial *and* overdue.
- **Both trend percentages bounded.** Payments' month-over-month printed
  "850.0%" against a small previous month in my own test data — the exact figure
  payments spec §6 forbids by name. Past ten-fold it now reads ">10x", and the
  previous month is named in the tooltip. The same guard was applied to the
  Expenses trend, which had the identical weakness.
- 15 payments-related Playwright specs pass after the change, plus the 26 from
  the earlier dashboard fold work, plus the expenses register spec.

### Dashboard — owner's three asks, 7 Sep (after the payments batch)

> "start from vividing the dashboard content a little, the seat availability
> rooms number cards should be center filled like cards, and also use vivid svg
> for the kpi card"

- **Room tiles centred — DONE.** Back to what `db3.png`, the reference this card
  was drawn from, actually draws: the room number over its fraction, centred, in
  a filled tile with a hairline in its own hue. They had been made left-aligned
  earlier the same day from the wider `seats availability model.png`, where each
  tile also carries a type, a floor, a bar and a sentence. At six tiles to a row
  holding two short tokens, that produced a ragged left edge with most of the
  tile empty. No height changed, so the two rows of rooms survive.
- **KPI glyphs vivid — DONE.** The five flat silhouettes became duotone (a plate
  at 38% plus a crisp mark), and the chip went from a pale tint with a coloured
  glyph to the hue at full strength with a white glyph, via per-card `--kpi-a` /
  `--kpi-b` custom properties. Same five hues, taken at their 600/800 steps
  rather than their 100. Amber moved from `#F59E0B` to `#D97706` because white
  on the former is 2.16:1, under the 3:1 WCAG 1.4.11 asks of a non-text graphic.
- **A negative Available Fund now turns its chip red.** The card already swapped
  itself to `.dh-red` when the fund went negative — value, tint and bar all
  followed — but the chip was pinned green by `nth-child`, so the one card that
  is bad news wore the success colour.

#### Three defects found while doing it, all pre-existing, all fixed

1. **The KPI row was ~140px narrower than every row below it** between 1000 and
   1200px — which includes the QA floor (1366x768 at 125% is a 1093px
   viewport). The note above the unconditional `repeat(5)` describes this as
   fixed; it was only fixed there, and the `min-width:1000px` block still said
   `repeat(6)` for five cards. It was also what squeezed the labels: at six
   tracks "AVAILABLE FUND" ran under a `flex-shrink:0` pill stack.
2. **"Occupancy by Room Type" showed five unlabelled bars** under 1200px. The
   `max-width:1200px` query hides the ring and collapses `.rt-body` to one
   column; an unconditional `grid-template-columns: 130px minmax(0,1fr)` added
   later for the height pass put the ring's track back. The list auto-placed
   into the now-empty ring track and `.rt-row__name`, being `flex:1;
   min-width:0; overflow:hidden`, measured 0px. The card could not answer the
   question in its own title, and no spec noticed.
3. **The scroll track inside a card was painted `--bg2`**, the workspace ground,
   so the seat grid grew a 5px tan stripe hard against the last column of tiles
   that read as a mis-drawn tile edge.

All three are the same failure this file documents by name: an unconditional
later rule beating a media rule of equal specificity. Each is fixed by
restating, not reordering.

- `tests/dashboard-cards.spec.js` 6/6 (including the rows A-C fold at every
  shipped size on a 40-room hostel) and `tests/dashboard-lower.spec.js` 4/4.
- Shots: `shots/dashboard-before.png`, `shots/dashboard-after.png`,
  `shots/dashboard-after-dark.png`.

#### A fourth: a spec that had been red on the branch since 5 Sep

`counter-flow-decisions.spec.js:366` found its tile with `/cash\s+received/i`
against the tile's text. The tile was renamed "Advance / Arrears" on 2026-09-05
and the finder was not updated, so the spec had been failing on HEAD ever since
— verified against `git show HEAD:renderer/src/modules/dashboard.js`, which
already carries the new label. Nothing to do with this session's diff.

It now finds the tile by its `showCashReceivedModal` handler. That is what the
test's own comment says it is asserting — "the figure is on the dashboard, and
it opens the reconciliation rather than just linking to Payments" — and the
label over it is the owner's to change without breaking a test.
`counter-flow-decisions.spec.js` 3/3.

#### Audits

`qa-regression` and `design-governance` both run, per CLAUDE.md.

**Applied from `design-governance`:**

- **The `.rt-body` fix only won by being last in the file.** My first version
  appended a fourth `(0,2,0)` rule and the note blamed a single competitor. In
  fact three compete, and at the QA floor (1093x614) *two* of them match at
  once - the `max-width:1200px` collapse and a `max-height:720px` rule setting a
  118px ring track. The fix now wins on specificity instead
  (`.dash-row-c .dash-sec .rt-body`, `(0,3,0)`), so source order stops
  mattering. Being one collision short of the real picture is exactly how this
  bug got made in the first place.
- **`13.5px` on the room number is off the type ladder** (11/13/14/15/17). It is
  back to 13px, which is what it already was; centring was the ask, not size.
- **`--text-on-accent` was flagged as the token I should have used for the white
  glyph, and it is the wrong one.** It exists for the filled accent button,
  where dark mode *lifts* the accent to `#4B7BFF` and therefore inverts the ink
  to near-black. These chips step *down* in dark precisely so white keeps
  working, and every stop is measured for it. Recorded in the code so the next
  reader does not "fix" it.

**Confirmed by the audit, not changed:** all six contrast figures recomputed and
matched (one 0.02 rounding drift on orange); the dark stops measure 3.40-5.92
against white, so the treatment holds in both themes; the `repeat(5)` and
full-room-hover fixes were confirmed correct as diagnosed.

### Q10 - The KPI row now carries five saturated category hues

`design-governance` is right that this pulls against CLAUDE.md's *"colour means
'act', never 'look'"*: five equally-clickable cards each wearing a loud,
permanent, non-accent hue is decoration, not an affordance.

Two things temper it. The five-hue mapping is not new - it predates this session
and was approved on 7 Sep; this diff only takes the same hues from their 100 step
to their 600. And three of the five are arguably state rather than category:
amber Pending is money not collected, orange Expenses is money out, and Available
Fund genuinely swaps green/red on the sign of the figure. Blue Revenue and violet
Advance/Arrears are the two that are pure category.

**Default applied:** built as asked ("use vivid svg for the kpi card").
**To revert:** one rule. Delete the `background`/`box-shadow` on
`.dash-kpi-grid .dash-chip` and the chips fall back to the pale tint; the duotone
glyphs work either way, since both tones are `currentColor`.

### Q11 - The dashboard's clickable cards are not keyboard-reachable

Pre-existing and not caused by this work, but it sits on the elements this
session made read much more like buttons. The five KPI cards and all 24 room
tiles are plain `<div onclick=...>` with no `tabindex`, no `role`, and no
`:focus-visible` rule, so none of them can be reached or fired from the keyboard.

Not built, because the fix is a decision rather than a style: making 24 room
tiles individually tabbable puts 24 stops between the header and Needs Action,
which is plausibly worse than none. The likely right answer is roving tabindex
over the grid plus real buttons for the five KPI cards - a contained piece of
work, but its own piece, and it changes behaviour rather than appearance.

### Q8 — The coverage badge is neutral, against payments spec §15

§15 asks for a green `RENT + MESS` and an amber `RENT ONLY` badge. It was built
that way and then changed, for a reason that only appears on this table: the
Status pill sits three columns away in the same row, drawn from the same three
hues for a different axis. A row read amber "RENT ONLY" beside amber "Partial" —
a billing arrangement and missing money wearing the same colour. Students draws
the identical badge in colour and is fine, because nothing coloured sits beside
it there.

**Applied default:** neutral chip, label carries the fact. The `dh-*` hue class
is still on the element, so restoring the spec's colours is one CSS rule.

### Q9 — Dark mode: the brief asks to undo a ruling this repo already made twice

**This is the biggest open item and the one I deliberately did not start.**

`Hostyllo_Dark_Mode_Brief_Specs(1).md` specifies a pure-neutral dark ladder
(`#111111 / #171717 / #1C1C1C / #222222 / #2A2A2A`). The four palette images sent
with it are the same neutral greys, so the two are one request — **that answers
Q2**: the palettes were the dark-mode reference, not a proposal for light mode.

But `tokens.css` records that this exact ladder was already tried and dropped:

> The old ladder was pure neutral grey (#141414…#2a2a2a), which went muddy the
> moment the surrounding chrome turned blue.

and the dark surfaces were then warmed on 2026-09-04. So the brief asks to revert
a decision this repo made deliberately and wrote down.

**The brief may well be right, and it is not naive.** The original failure was
neutral grey against a *saturated* blue; the brief also restrains the blue
(§5: `#315BC2` primary, `#3F6FE5` hover, `#7FA7FF` light). Measured:

| Check | Result |
|---|---|
| Ladder span, `#111111` → `#2A2A2A` | **9.8** lightness points — clears CLAUDE.md rule 6 (>8) |
| `#E7E7E7` on `#171717` | 14.50:1 — pass |
| `#B0B0B0` on `#171717` | 8.27:1 — pass |
| `#858585` on `#171717` | 4.86:1 — pass (clears AA, just) |
| `#5F5F5F` on `#171717` | 2.81:1 — fails, but it is the *disabled* token, which is exempt |
| **`#315BC2` on `#171717`** | **2.91:1 — fails as text** |
| white on `#315BC2` | 6.17:1 — pass |
| `#7FA7FF` on `#171717` | 7.58:1 — pass |

So the palette is sound **provided the accent is split by role**: `#315BC2` as a
button FILL with a white label, `#7FA7FF` for accent-coloured TEXT, icons and
links on dark. That is exactly the split `tokens.css` already documents
("--accent-700 stays the LIGHTER of the two here because in dark mode it is used
for accent-coloured TEXT"). Applied flat as "primary = #315BC2" everywhere, the
brief would make every accent label on a dark card unreadable.

**Why it is not started:** the dark ladder does not live in one place. `tokens.css`
defines it, and `style.css` — which loads later and wins — redefines
`--card`, `--bg3`, `--bg4`, `--text2`, `--text3` and others per theme. Repainting
means reconciling two files that currently disagree about who owns the ladder,
across every screen. Half-done, that leaves the app worse than either endpoint,
and it is not something to leave in an unverified state overnight.

**Needs the owner's decision on one question:** confirm the move from the warm
ground back to neutral is intended, knowing it reverses the 2026-09-04 warming.
If yes, this is a contained piece of work with a clear plan: reconcile the ladder
into one file, split the accent by role as measured above, then verify with
`theme-parity.spec.js` and screenshots of six screens in both themes.

Other parts of the brief that are safe and independent of the palette question —
§3 (remove glow), §6 (icon + text on every badge, never colour alone), §13
(focus states) — are not blocked by it and can be done first.

## Audits

`design-governance` and `qa-regression` were run against the Payments work, as
CLAUDE.md requires. Between them they found four things; three were real.

1. **A cascade collision I introduced.** The new
   `tr.is-arrear td.pay-col-act` rule had the same (0,3,3) specificity as the
   pre-existing `:hover` and `.is-picked` rules for that cell and sat later in
   the file, so it silently beat both: the pinned Actions cell was the one cell
   in the row that never answered the pointer, and a selected arrears row showed
   amber there while the rest of the row showed selection blue. This is the
   third instance of the "later block wins" failure this file documents. Fixed
   by stating all three states explicitly rather than by reordering — ordering
   is what broke it.
2. **A silent functional regression I introduced.** The Charge/Mo tooltip called
   `chargesBreakdown(paymentCharges(...))`. That helper reads
   `resolveCharges()`'s shape and opens on `if (!c.configured)`, a field
   `paymentCharges()` does not return — so it took the first branch every time
   and every row's tooltip read "No rent configured — set it in Settings" on a
   table full of correctly configured rents. It does not throw, and no spec
   asserts tooltip text, so nothing caught it. Replaced with `payChargeTitle()`,
   built from the record's own numbers. The two helpers answer different
   questions (`resolveCharges` = what this STUDENT pays now, `paymentCharges` =
   what THIS RECORD billed) and must not be made interchangeable — a row months
   old should quote what it billed, not today's price.
3. **The accent ramp spent on a passive badge** — `.pay-cov.dh-blue` used
   `--accent-soft`/`--accent-strong`, the pair reserved for the one primary
   action per screen. Resolved by Q8 above (the badge is neutral now).
4. Everything else passed with evidence: no raw hex, every token defined in both
   themes, `color-mix()` already an established convention in this repo,
   tabular-nums present on all new money, CSV/PDF exports still exact, tab order
   preserved, `monthLabel()` safe on both stored month formats, and
   `submitEditPayment()` confirmed untouched.

### A mistake worth recording

The first attempt at the Edit Payment restructure anchored a string replacement
on `<div class="form-grid">` + `Room Rent (PKR) *` against the whole file.
`renderAddPayment()` contains the same markup and sits earlier, so `str.index()`
found it and the replacement ran 68,000 characters past the end of the edit
form, deleting `renderAddPayment` and `showEditPaymentModal` outright (86
functions to 64). Caught immediately by the replaced-length figure, reverted
with `git checkout HEAD --`, and re-applied.

Two rules came out of it, both now in the patch scripts:
- Bound any replacement to the target function's own slice, and refuse to run if
  that slice is unexpectedly large.
- Assert every anchor matches exactly once, and print the replaced length.

Also: `grep -c $'$'` is NOT a reliable CRLF check in this shell — the quoting
collapses and it matches every line. Detect line endings with Python. The repo
stores LF and git's autocrlf rewrites the worktree to CRLF on checkout, so a
patch script must normalise on read.


---

## Dashboard, second pass — the 7 Sep batch

Owner's list, verbatim, with what was done to each.

| Ask | Done |
|---|---|
| "use svgs of emojis" on the six lower cards | Six multi-colour SVGs, every colour a token |
| Seat card: remove the progress bar, show another line of rooms | Bar deleted; grid 81px -> 124px, three rows |
| Remove "status" from "Live room occupancy status" | Done |
| No navbar on the three bed counts | They were `<button>`; now `<span>` |
| "has free beds"/"full" colours, bottom left of the card | `.seat-key`, blue and grey swatches |
| Remove "PKR 1T - PKR 7B" from Available Fund | Sub-line deleted |
| Remove "click to collect" from Pending | Deleted |
| Lock every KPI card except Advance / Arrears | Four lost `onclick` + `dsh-card--click` |
| Neutral navbar on the trend range control | Neutral in both themes, separated by weight and edge |
| Occupancy by room type: 4-Seater visible by default | 4 of 5 types, from density not height |
| Small dashboard type is thin / washed out | `--text3` -> `--text2` at 600, no size changes |
| Reports method colours = dashboard's | One `methodHue()` in utils.js, both screens read it |
| Move-out animation on the pie | Bisector offset, matching Reports' `hoverOffset` |
| Reports' fill animation on the dashboard pie | `_dnutPlay()` + a dasharray transition |
| Reports KPIs still print full numbers | Now `moneyValue(compact)`, same helper as the dashboard |
| Same in Annual Archive | Same helper on its four money cards |
| "tell from where the report renders data" | `docs/design/REPORTS_DATA_SOURCE.md` |
| Premium neutral sidebar | Neutral raised pill + accent edge; gradient and glow gone |

### The two words that had to be settled first

"navbar" appeared three times in the brief and meant a *segmented control* each
time, not a sidebar and not a colour — the owner confirmed it: "use navbar only
the quarter, 6 months, and year only". That reading makes the whole list
consistent: the range control, the three bed counts and the sidebar's active
item were all saturated-accent selections, and all three go neutral.

### Four defects found on the way

1. **THE QA FLOOR HAS BEEN FAILING AND THE SPEC COULD NOT SEE IT.**
   `dashboard-cards.spec.js` tested "1366x768 @100%" at a **768px viewport**,
   which is the whole screen. The real web-contents box is ~730-740 once the
   taskbar is off. There was no height tier anywhere between 720px and
   unlimited, so every viewport in that band drew the full-height layout: on a
   five-room-type hostel, row C ended **21px below the bottom of the screen**,
   at the one size the owner names as the floor. The spec passed throughout,
   because at 768 the same layout clears by 9.
   Fixed both ends — a new range-bounded `@media (min-height:721px) and
   (max-height:800px)` tier, and the spec now tests 738.

2. **The occupancy bar was styled in FIVE places.** :1509, :1637, :1670, :1715
   and :2284, each partly overriding the last. All dead once the markup went.
   Removed with a script; see the mistake below for how that went the first time.

3. **`counter-flow-decisions.spec.js` had been red since 5 Sep** — it found its
   tile by a label renamed that day. Now finds it by handler; 3/3.

4. **`regression.spec.js`'s pan test asserted a stale premise.** It required the
   payments table to pan more than 30px. The 7 Sep density pass narrowed the
   table until it overflows its container by **11px** on that fixture, so the
   drag reaches the right edge after 11 and the assertion failed on a table that
   pans perfectly. Now asserts "pans to its end", which is the behaviour the
   test's own sentence describes.

### Measured fold slack, five sizes, five room types

| Size | Content box | Slack | Room rows | Room types shown |
|---|---|---|---|---|
| 1366x768 @100% | 1366x738 | +9 | 3 | 4 of 5 |
| 1920x1080 @125% | 1536x824 | +66 | 3 | 4 of 5 |
| 1920x1080 @150% | 1280x660 | +17 | 3 | 3 of 5 |
| 1366x768 @125% | 1093x614 | +14 | 2 | 3 of 5 |

### A mistake worth recording

The script that stripped the dead `.seat-occbar` rules walked brace nesting to
find rule boundaries — and this stylesheet's comments **quote CSS at
themselves**, including `` `@media (max-height:665px) { .seat-occbar {
display:none } }` `` inside backticks. Those braces were read as real nesting,
the walk desynchronised, and it deleted a paragraph out of the middle of a
comment and split others at their commas. Caught by reading the diff, reverted
from a backup taken before the run, and re-run with comments masked to
equal-length runs of spaces first, so every offset still pointed at the same
character in the original.

The lesson is narrow and worth keeping: **in this repo, a comment is not inert
text.** Several files document a bug by quoting the selector that caused it, so
any tool that reasons about CSS or JS structure here has to strip comments
before it counts anything.

### Two things deliberately NOT done

- **The emoji chips are hidden below 1200px in row B.** At that width the three
  cards are 300, 300 and 145px; measured, the chip pushed the Revenue Trend
  header from 27px to 59px and the glance panel's from 51px to 96px, because
  `.dash-sec__head` wraps and a wrapped header is a whole line off the fold. An
  icon exists to make a card findable, which is worth a few pixels and is not
  worth a line of the card's own content. Row C keeps all three at every size.
- **The KPI cards are locked but not un-styled as links.** They keep their card
  shape and their hover shadow is gone with `dsh-card--click`. If the owner
  wants them to look flatter still, that is a one-line change.

### Audits on the second pass

`qa-regression` found no regressions. It confirmed the bulk CSS deletion left
the file intact (comment pairs 218/218, brace walk ends at depth 0, all four
`#trend-chart-wrap` tiers present), that `METHOD_HUES` is now defined exactly
once across the two classic scripts, and that `_dnutPlay()` is scheduled inside
`_dashDonut()` rather than per call-site — which is what stops the worst case
here, every ring rendering empty. It also ran `tests/report-totals.test.js`
(14/14), which I had not.

`design-governance` returned six real findings. All six are fixed:

1. **`color:#fff` on `var(--accent)`** for the sidebar's count badge. This is
   the exact failure `tokens.css:189-196` documents — dark lifts `--accent` to
   `#4E7DFF` and white on it is 3.77:1, under AA — and it is *why*
   `--text-on-accent` exists. Reproduced at a brand-new call site. Now the token.
2. **The donut's reduced-motion block only won by file position.** A second
   `@media (prefers-reduced-motion: reduce) { .dnut__seg ... }` already existed
   at :1253 at the same (0,1,0). Raised to `.dnut .dnut__seg`, (0,2,0).
3. **`body.light-theme .sidebar { box-shadow: none }` matched nothing.** The
   element is `<aside id="sidebar">`; there is no `class="sidebar"` in the app.
   So did the `style.css:259` rule it was cancelling. A fix for a symptom that
   was not there is worse than no fix, because the next reader believes it.
   Removed and recorded.
4. **24 raw hex values in the KPI chip block.** CLAUDE.md is unambiguous. They
   are now a `--kpi-*` token family in `tokens.css`, per theme, and the six dark
   restatement rules in `dashboard.css` are gone with them — they were a second
   place to change a colour.
5. **`--amber` and `--red` used decoratively** in the Occupancy building's
   windows and the Quick Actions bolt. Both hues carry specific meanings on the
   same screen (Pending, Expenses). Both icons moved to the accent. The `alert`
   triangle keeps its amber and the `trend` arrow its green — those two encode
   what they mean, which is the distinction.
6. **A 701-720px band** where neither `chrome.css`'s `max-height:700px` nor the
   new 721-800 tier applied. `chrome.css` now steps at 720 to match
   `dashboard.css`.

Not changed, with reasons recorded: the `--sb-*` sidebar values stay local raw
literals, because every token in that family already is and inventing a second
convention inside one file is worse than following the existing one; and
`rgba(15,23,42,…)` box-shadows stay, which CLAUDE.md's own exception list allows
and both files already use throughout.

Final: `dashboard-cards` 6/6, `dashboard-wiring` 5/5, `theme-parity` 1/1,
`regression` 7/7, `counter-flow-decisions` 3/3, `responsive-floor` 84/84,
`report-totals` 14/14, plus dashboard-lower, annual-archive, chrome,
payment-method-chip, rail-reach, smoke, zz-v6-redesign.


---

## 2026-09-08 — order item 6 opens: Complaints & Maintenance

References: `complaints2.png` (the register) and
`add complaaint and maintinanace.png` (both forms). Item 8's export half
shipped on 7 Sep (`docs/SESSION_HANDOFF_2026-09-07-exports.md`); this is the
first of the four screens in item 6.

### The screen was the wrong shape, not badly painted

`renderIssues()` drew a feed of cards. The reference draws a REGISTER — one row
per issue, one column per fact. That is the right shape for the question this
screen is asked: *what is still open, and who has it*. A table answers it by
column; a card feed answers it only by reading every card.

Ten columns now: **# · Issue · Student · Room · Category · Priority · Status ·
Reported On · Assigned To · Actions**, on listkit's `.lk-table`, which already
supplied the header, the cell furniture (`.lk-who`, `.lk-chip`, `.lk-when`),
the pager and the empty state. `issues.css` shrank to the two things listkit
has no idiom for.

### Four fields the reference asks for that this app did not record

Category, priority-on-a-complaint, assigned staff, and an expected completion
date. §38 of the export spec asked for the first and third back on 7 Sep and
they were left out, correctly, because the app recorded neither and a column of
em dashes is worse than an honest one.

They are not invented into the table now either — **the FORM captures them**,
which is where the owner's own form reference puts them. A record written
before today has them empty and the cell prints a dash, which is the truth
about that record: nobody ever typed one. `maintenance` also gained
`location`, which the reference's "Location / Area" field asks for.

That distinction is the whole rule: do not invent a COLUMN for a field the app
does not record — **recording it first is the fix, not the violation**. The
exports carry the two new columns for the same reason.

### The screen had no edit at all

Not "an edit that needed redesigning" — none. A warden who mistyped a room had
to delete the record, losing its reference number, and re-add it. The same
`showIssueModal(id)` now serves both, because an add form and an edit form that
drift apart is how a field ends up writable in one and not the other. Edit
keeps the record's `seq`, so `MA-0001` stays `MA-0001`.

### Q12 — the reference colours the categories, and CLAUDE.md forbids it

`complaints2.png` paints Plumbing blue, Electrical amber, Furniture violet,
Network blue. This is Q1 again on a new screen, and this screen is the
strongest case for the rule: the red **Open** pill is the only thing on a row
that means *act now*, and it stops meaning that when four other chips beside it
are equally loud.

**Applied default (settled, not open):** the category chip is NEUTRAL and
carries a glyph — nine categories, nine icons, so Plumbing and Network still
separate at a glance without spending hue on a category. Priority and status
keep their hues, because both are state. `issues-register.spec.js` asserts this
on *computed colour*, since the rule is invisible to markup.

### Q13 — the register is 1265px wide and the floor gives it ~1065

Measured 2026-09-08, at 1440:

| # | Issue | Student | Room | Category | Priority | Status | Reported | Assigned | Actions |
|---|---|---|---|---|---|---|---|---|---|
| 72 | 230 | 174 | 57 | 126 | 84 | 133 | 116 | 129 | 144 |

Total **1265**. The content box is ~1065 at 1440 and ~1000 at the QA floor, so
`.lk-table-wrap` pans it — the same answer Payments reached for the identical
conflict (Q4), and the one export spec §41 allows below 1280. Nothing is
hidden. `responsive-floor.spec.js` passes: the overflow is inside a scroller,
which is what it checks for.

**Owner's call, with one obvious place to take it from:** fold the Category
chip under the issue title, where the description already sits, and drop the
column. That is 126px, and it costs the ability to scan categories down a
column — which the toolbar's category filter and the stat strip largely already
answer. Built with the column because the reference draws one.

### Two things the reference asks for that are deliberately NOT built

- **Attachments** ("drag & drop images, PDF, max 5MB", on both forms). Storing
  files needs somewhere to put them, a size budget inside the backup, and a
  main-process handler. That is a feature, not a form field. **Owner's call.**
- **Estimated Cost (PKR)** on maintenance. Money in this app has exactly one
  home and it is Expenses. An estimate parked on a ticket becomes a second,
  unreconciled answer to "what did maintenance cost this month" — the failure
  CLAUDE.md's finance rule exists to prevent. The right shape is a resolved
  ticket that WRITES an expense; that is a piece of work, not a text box.
  **Owner's call.**

Also deliberately different from the reference: the footer strip carrying
*Avg Response Time · Resolution Rate · **4.8 Satisfaction (Internal)***. The
first two are computable and the export summary already states them. The third
is a number this app cannot know — nobody is ever asked — and the mandate is
explicit that no invented figure goes on a screen.

### Four defects found on the way, all fixed

1. **The action column set the height of every row.** `.lk-acts` wraps by
   default; at 132px the four icon buttons wrapped into THREE rows, a 102px
   cell against a 77px content maximum. Rows measured 127–163px. Fixed with
   `flex-wrap:nowrap`, a 144px column and 27px buttons: rows are 62–97px now.
2. **Two accent-filled "Add Issue" buttons on one screen.** The page header
   already carries one (`nav.js`, `issues.action`); the toolbar had grown a
   second. One primary action per screen, broken twice over. The toolbar's is
   gone; the empty state keeps its own, because there is no table under it.
3. **`.hf-num` painted `color:#fff` on `var(--accent)`.** This is the exact
   failure `tokens.css:189-196` documents — dark lifts the accent and white on
   it measures 3.77:1 — and it is *why* `--text-on-accent` exists. It reached
   `forms.css` on 7 Sep and is on Payments' and Students' edit forms too, so
   the fix lands on three screens.
4. **The modal header kept the wrench over a complaint form.** The header is
   rendered once at open time; switching kind now swaps its glyph.

### One shared-file decision worth recording

`.hf-sec` (the numbered section block) is **promoted into `forms.css`**, not
copied. Payments grew `.pef-sec` privately on 7 Sep and Complaints needed the
identical block on 8 Sep; a second private copy is how two forms start drifting
apart. `.hf-form` deliberately declares no `display`, because the two forms in
one modal are swapped with the `hidden` attribute and any author `display`
would beat the UA rule that makes `hidden` work.

### Verified

- `npm run typecheck` — 0 errors. `npm run test:export` — 50 checks.
- Playwright, in two batches: smoke · responsive-floor · daily-flow-sweep ·
  html-escaping · month-scope (8), then dashboard-cards · dashboard-wiring ·
  regression · theme-parity · counter-flow-decisions (22). All pass.
- **`tests/issues-register.spec.js` is new** — four tests, and each holds a
  decision above closed: the ten named columns and a legacy record rendering
  with dashes in exactly the two cells it never filled; category chips paying
  identical computed colour while priority and status do not; the form adding,
  editing in place without duplicating or renumbering, and filling a
  complaint's room from its student; and the register and its export reading
  one filtered feed.
- Shots at `docs/design/shots/`: `issues-after-1440.png`,
  `issues-after-1366.png`, `issues-after-dark.png`,
  `issues-form-maintenance.png`, `issues-form-complaint.png`.

### Audits — `design-governance` and `qa-regression`, both run, per CLAUDE.md

**`qa-regression` found no functional regression** and confirmed the things a
green suite would not have: all three `showAddIssueModal()` call sites (nav's
header action, the command palette, the dashboard Quick Action) still hold,
because the alias passes `undefined` and the add path is `id ? … : null`; the
five action conditions in `mkRow()` are byte-identical to the pre-redesign
version, so nothing that used to be reachable stopped being; every other reader
of `DB.maintenance` / `DB.complaints` (`nav.js`'s rail badge, the dashboard's
two counters, `settings.js`'s reset, and `main.js`, which persists both tables
as opaque JSON) reads only `status` and `date`, so the five new fields cannot
disturb them; and `_issAll()` cannot throw on a complaint whose student was
deleted or has no room.

It also turned up two pieces of **pre-existing dead code**, neither introduced
here and neither fixed here:

- the five legacy aliases (`resolveMaintenance` … `deleteComplaint`) have no
  caller anywhere — the dashboard navigates to this page instead. Verified
  independently across the whole renderer. The comment above them claimed
  "so dashboard alerts still work"; it now says what is true.
- `settings.js:17-44` still holds `saveMaintenance()` / `saveComplaint()`,
  which read the SAME DOM ids as the live form (`mt-title`, `cp-subject`, …).
  Also uncalled, so not a collision today — but it is a second writer sharing
  an id namespace with a live form, and it should go.

**`design-governance` returned four findings. Three were real and all three
are fixed; the fourth is precedent, not a defect.**

1. **The Kind badge coloured a category — in the one file that argues against
   it.** `KIND` gave Maintenance `dh-violet` and Complaint `dh-blue`, and the
   student avatar took the same hue. Which register a row belongs to is a
   category, exactly like the category chip four columns along that this pass
   deliberately made neutral. The badge is neutral now; `MA-` versus `CO-` and
   the glyph carry it. **The spec missed this because it only inspected column
   5** — it now asserts the Kind mark's computed colour too.

2. **Two accent-filled Add buttons could still meet.** The toolbar's was
   removed earlier in the pass, but the header's own button is shown on
   permission, not on whether the register has rows — so on an empty database
   it sits beside the empty state's accent-filled one. The empty state's is a
   plain `lk-btn` now; the header keeps the accent. `cancellations.js:300` has
   the identical pattern and was left alone.

3. **`.hf-sec` was not the promotion its comment claimed.** `payments.js` still
   emits `.pef-sec` and `payments.css` still styles it, and the two had already
   drifted *in the same commit that claimed to have unified them* — radius 12px
   against 10px, padding `12px 13px 13px` against `12px 14px`. Only `.hf-num`
   is genuinely shared. The comment now says that plainly. **Finishing it is a
   follow-up:** move `payments.js`'s five `.pef-sec` sites onto `.hf-sec` and
   delete `.pef-sec*` from `payments.css`. Deliberately not done on 8 Sep,
   because the owner has uncommitted work in `payments.js`.

4. **The one equal-specificity override is deliberate.** `.iss-table tbody td`
   beats `.lk-table tbody td` on load order, not specificity — normally the
   exact failure this file documents three times. `payments.css` and
   `students.css` set their own cell padding against the same shared rule in
   the same way, and `index.html` links shared sheets before screen sheets on
   purpose. Raising specificity here alone would leave three conventions where
   there is one. Recorded in the CSS so nobody "fixes" it in isolation.

**And one the audit did not look for, found while reading its output:**
`.hf-mh__ico` — the modal header's icon tile — carried `color:#fff` on
`var(--accent)`, the identical failure to `.hf-num`, written the same day and
missed on the same pass. It is on Payments' and Students' edit forms as well as
this one. Now `var(--text-on-accent)`.

Re-verified after all of it: typecheck 0 errors; `issues-register` 4/4,
`theme-parity` 1/1, `html-escaping` 2/2; and — because `forms.css` is shared —
`payment-redesign`, `payment-method-chip`, `students-panel`,
`admit-to-payment`, `students-profile-archive`, 23/23.

### Cancellations: checked against `cancellations.2.png`, mostly already there

Photographed live before starting it. The stat strip, the freed-seats banner,
the six toolbar controls and the sortable `lk-table` already match the
reference. Two things do not, and one is fixed:

- **Fixed:** the PDF button read **"Download Report"** and was accent-filled —
  a second primary action beside the header's Add Cancellation, and a name §50
  of the export spec renamed everywhere else on 7 Sep. It reads "Export PDF"
  now, neutral, beside "Export Excel".
- **Open:** the reference's **Type** column carries the departure type
  (*Student Left* / *Notice Given*); the live one carries the ROOM type
  (*3-Seater*), painted with the owner's per-type colour from Settings — a
  category wearing a hue, three columns from a Status chip drawn from the same
  palette. That is Q8 on a second screen. The reference puts room type in the
  **Room** cell instead (`#3 / 3-Seater / Ground Floor`), which resolves both:
  it frees the Type column and takes the colour off a category. Not built yet.

### Still to do in item 6

Cancellations (the Type/Room column swap above) · Rooms · Students forms.

## 2026-09-08, later — the rest of the Settings family

Configuration was rebuilt earlier the same day. This is the other five tabs.

**Two of the five needed nothing.** Rent & Mess and Data Management were both
already built to their references — `mess.png`'s mode chooser, stat strip,
quick-set-by-room-type cards and Individual Override table are all on screen,
and `data management.png`'s split of Import / System Stats over a summary strip
is drawn as the owner drew it, down to the five figures the reference repeats
in both halves. Photographed both before touching anything; nothing was.

That left **Hostel Info**, **License** and **Connection**, all three still on
the pre-redesign vocabulary — emoji card titles, inline styles, `.card` rather
than `.set-card`.

### Hostel Info — and a setting that controlled nothing

Rebuilt to `hostel profile.png`: the fields on the left, a profile card on the
right that draws the same six values the login screen prints, with the name in
the face the picker below is choosing.

Three things under the layout turned out to be broken.

**1. Thirteen of the twenty faces did not exist.** The picker offered DM Serif
Display, Playfair, Cinzel, Cormorant, Libre Baskerville, IM Fell English,
Philosopher, Yeseva One, Bebas Neue, Rajdhani, Teko, Josefin Sans and
Righteous. `vendor/fonts.css` bundles Inter, Outfit, Barlow, Barlow Condensed
and JetBrains Mono, and nothing else; `main.js`'s CSP is `font-src 'self'
data:`, so a webfont cannot be fetched from anywhere, ever. All thirteen fell
back to the default serif — thirteen tiles drawing ONE face under thirteen
names. Measured it rather than assuming: a canvas probe of all twenty against
the three generics, in the running app.

**The shipped default was one of the thirteen.** Every install since v2 has
been drawing the browser's default serif under the name DM Serif Display.

The list is now the five faces the installer carries plus the Windows faces
that resolve, each measured before it is offered (`hiFontAvailable()`), grouped
under headings that say which is which. The default is Georgia. A database that
still stores one of the dead thirteen keeps it, and the card says in one line
that the face is not installed and the title bar is drawing the interface font
— rather than a silent migration of somebody's stored choice.

**2. Nothing applied the chosen face.** `hostelNameFont` was written to the
database, toasted "Font updated", and read back by no surface in the app. The
only place the face ever appeared was the picker's own preview tile.
`setTitlebarHostel()` — the function that paints the exact string the setting
is named after — set `textContent` and nothing else. It sets the family now,
falling back to `var(--font)` so an uninstalled face leaves the bar as it was.

**3. The login screen's address line was an HTML sink.** `liveUpdateSetting`
wrote the location field into `innerHTML` on every keystroke. It is
`textContent` now. This is the same class as the H4 sweep of 2026-08-20 and was
missed by it because the value is concatenated, not interpolated.

**There is no Save button, on purpose.** Every field on this panel has written
through on input since long before the redesign, so the "💾 Save Hostel Info"
button at the bottom saved nothing that was not already saved — it
re-serialised the database and toasted. A button that looks like the thing that
commits your edit, and is not, teaches a warden that leaving the tab loses
work. The header carries a "Saved as you type" mark instead, and
`saveSettings()`, whose only caller it was, is gone.

### License — the facts the file actually carries

Rebuilt to `license page2.png`. The reference lists nine facts about a licence;
`checkLicenseValidity()` returns five — key, expiry, machine id, activation
date, and whether it all still verifies. **`Licensed To`, an issue date
distinct from the activation on this computer, and a module list are not drawn**,
because a row reading "Hostel Administrator" under a heading that says License
Information is this app inventing a term of somebody's contract. Edition is
drawn: that one is a property of the build, and the Connection panel has always
said it.

Two things the reference does not have are drawn, because they answer the
question a warden actually arrives with:

- **Enforcement state and whether saving is enabled.** `license:enforcement`
  has resolved ACTIVE / GRACE / EXPIRED / SUSPENDED / REVOKED since the
  enterprise upgrade, and no settings panel showed it. On the two read-only
  states every save in the app refuses at the main-process gate, and until now
  nothing in Settings said why.
- **The three startup checks**, shown as the three the app performs, each
  derived from `valid` and `reason` rather than asserted.

The destructive actions are called straight from the panel rather than through
the licence window: each already confirms in the MAIN process with a native
dialog listing exactly what it destroys. Routing them through a second window
adds a click, not a safeguard — and two dialogs for one decision is how people
learn to click through both. (There were three of them until the governance
audit below; there are two now, and the reason is worth reading.)

The key stays masked by position, and **the copy button names the value rather
than carrying it** — `licCopy(this,'key')` reads the licence cache, so the
unmasked key is not sitting in an onclick attribute under a row that exists to
not show it.

### Connection — a summary that is not always green

Same four §29 lines, now in the reference's shape: an icon tile, what is being
reported, the state as a pill, and the sentence support needs beside it.

`connectin.png` puts "All Systems Operational" in the head. **This build has no
control plane**, so that phrase would be a claim about a service that is not
there. The summary follows the mode — *Running offline* when nothing is
configured, *All systems operational* only when the mode is actually online,
*Working from cached data* when degraded.

### Verified

- `npm run typecheck` — 0 errors. `npm run test:theme` — 4 checks, raw-hex
  ceiling unmoved.
- Playwright, in two batches: smoke · responsive-floor · theme-parity ·
  settings-configuration · html-escaping (13), then regression ·
  dashboard-wiring · issues-register · settings-hostel-info ·
  settings-license-connection (26). All 39 pass, re-run after the audit fixes.
- **Two new spec files**, each holding a decision above closed.
  `settings-hostel-info.spec.js`: every offered face measurably draws and no
  three tiles measure alike; picking one moves the title bar and survives a
  repaint; the fields write through with no Save button and the profile card
  follows a keystroke, including back to "No phone recorded"; a location typed
  with a tag in it is text on the login screen.
  `settings-license-connection.spec.js`: the fact table's labels are exactly
  the seven the app can source and none of the reference's unbacked three; the
  key is masked by position and its middle groups are nowhere in the DOM; copy
  hands over the whole key; the enforcement readout follows the decision; and
  the Connection summary never says "all systems operational" on an
  unconfigured build.
- Shots at `docs/design/shots/`: `settings-hostel.png`, `settings-hostel-b.png`,
  `settings-license.png`, `settings-license-b.png`, `settings-connection.png`,
  and all three in dark.

### Audits — `design-governance` and `qa-regression`, both run, per CLAUDE.md

**`qa-regression` found no functional regression.** Every one of the seven
renamed field ids has zero references left anywhere — `onboarding.js`,
`license.html`, `preload.js`, `main.js` and the test tree included; every
inline handler in the three rewritten panels resolves to a defined function;
every `getElementById` added is null-guarded, so nothing throws while its panel
is off screen; and all four IPC bridges the new panels use are exposed with
working absence branches. It also named what the suite could not have covered:
the dev/browser degrade paths, because the test profile always has the bridges,
and rendered focus-ring contrast.

Its one finding — `saveSettings()` left with no callers — is fixed by deleting
it, along with the two other things found while acting on the audits.

**`design-governance` returned four findings. All four were real; all four are
fixed, and one of them turned out to be the surface of something worse.**

1. **A stored value interpolated raw into a `style` attribute.**
   `hostelNameFont` went into `style="font-family:'${font}'"` unescaped, on the
   one line of that card where the hostel NAME beside it was escaped correctly.
   The value is only ever defaulted, never sanitised, and a restored backup is
   a file the customer chose — so it is not trusted input. There is now one
   `hiSafeFace()` that drops everything a family name cannot legitimately
   contain. `titlebar.js` was already safe by a different route: it assigns the
   DOM property instead of building markup.

2. **The three licence actions were graded by a severity that does not exist —
   and this panel and the licence window graded them differently.** Chasing it
   into `main.js`: `license:deactivateWithDialog` and `license:reset` **both
   call `deactivateLicense()`**, and `license:prepareUninstall` unlinks the same
   two files by hand. All three delete `license.enc` and `last_run.dat` and end
   at the activation screen. The colour ranking could not have been right in
   either surface, because there is no ranking. Worse, the panel's own
   description of Deactivate — "frees the licence so it can be activated
   somewhere else" — **contradicted the main-process dialog**, which tells the
   customer they will need a new key.

   The tab now offers **two** actions, drawn identically because they do the
   same thing, with copy that matches the dialog each one opens. "Reset
   activation" is gone from it: a third door into the same room, under a third
   name, is how a warden ends up pressing all three. The note says where Full
   Reset still is and that it is the same removal.
   `license-settings.html`'s three are all one severity now too, with the
   reason written above them.

3. **`.set-btn` had no `:disabled` state**, and `connCheckNow()` is the first
   caller in the file that disables one — so Check again kept its accent fill,
   its hover and its pointer while its probe was in flight.

4. **The Connection panel borrowed the accent for a passive status.**
   `tokens.css` declares `--conn-online / degraded / offline / unconfigured`,
   restates every one per theme, and says in as many words that unconfigured is
   `--text-tertiary` — and **nothing in the app had ever read one of them.** The
   panel painted itself from the generic `dh-*` set instead, which put the
   "Running offline" pill in `dh-blue`: the same blue, to the hex, as the Check
   again button beside it. One screen, one accent, two meanings. The four states
   are now one class on the row driving `--c-fg` / `--c-bg` from those tokens,
   and the spec asserts no status pill resolves to the accent.

Re-verified after all of it: typecheck 0 errors; `test:theme` 4 checks with the
raw-hex ceiling unmoved; `settings-hostel-info` 4/4 and
`settings-license-connection` 5/5 — the fifth being new, and holding finding 2
open: the two actions must stay the same title, the same glyph hue and the same
button hue as each other.

### Still open, deliberately

- **The `--conn-*` tokens are consumed now, but nothing else in the app uses a
  connectivity colour**, so there is no second reader to keep them honest.
- **`data management.png` shows the same five figures twice** — the System
  Stats rail and the summary strip below it. The build matches the reference
  because the owner drew it that way; worth one question rather than a
  unilateral deletion.
- **Backup & Restore is a modal**, and `backup and restore.png` draws it as a
  page. That is the next item in this family, with Users and Logs behind it.

## 2026-09-08, third pass — the owner's correction, and three more pages

The owner read the Settings work and gave a ruling that changes how every
reference is read from here on:

> "you are throwing out content from my design references without asking
> whether I need it — because if there is no function present for a feature
> then just lock it and show a warning or info"

They were right, and it is a better rule than the one I was applying. Dropping
a control the owner drew is a decision made silently on their behalf; drawing
it locked, with one line saying what the app does instead, keeps the design
intact, keeps the app honest, and leaves the decision where it belongs. It also
turns out to be more useful: "Rooms are chosen by hand on the admission form"
is information a warden can act on, and an absent row is not.

**The pattern is now a component.** `_setRow()` draws a preference as glyph,
name, description and control; a locked one keeps a `.set-lock` chip, a
disabled control showing its REAL state, and an ⓘ that opens one sentence.
Three rules hold it:

- the sentence says what the app does TODAY, never "coming soon";
- a locked switch shows the state of the world — auto-assignment is off because
  there is no auto-assignment, room sharing is on because a room's capacity is
  its room type's — and never a decorative "enabled";
- the row stays at full contrast. Disabled-and-silent is indistinguishable from
  broken, and a warden clicks it twice and then telephones.

`.set-row__why[hidden]` needed its own rule, because an author `display:flex`
beats the UA rule that makes `hidden` work — the same trap `forms.css`
documents for `.hf-form`. Every note sat open on first paint until it was
added.

### Hostel Info, rebuilt against the reference rather than against my summary of it

What the last pass dropped and this one draws: **General Settings** (system
language, date format, time format, currency, academic year, default page) and
**Operational Settings** (room auto assignment, room sharing, auto receipts,
late fee grace days, student ID, image upload) — twelve rows, of which
**exactly one is live**: currency. The other eleven are locked, and each one's
sentence is a fact about this build:

- dates and times come from one formatter, so a format picker in one place
  would leave the printed documents disagreeing with the screen;
- records are filed by calendar month and a closed year is moved to the Annual
  Archive by hand — there is no academic-year boundary;
- every student already gets an ID, and it cannot be turned off because the
  payment and archive records key on it;
- photos and documents already upload from the student form;
- this build charges no late fee at all.

**The rail** now carries the reference's four cards: the Hostel Profile
(with the licence's own Active state, registration date and expiry, and a
locked "Current plan" — the file carries no plan tier), Storage Usage, Quick
Actions, and Need Help.

**Storage is a composition, not a percentage.** The reference draws "48% of
10.00 GB". The database is a file on the customer's own disk: there is no
quota, so there is no percentage, and the second figure would be invented. The
ring shows what the payload is MADE OF, from the same serialisation `saveDB()`
writes, with the total in the middle — and says so underneath.

**Two of the four Quick Actions are real** (System logs opens the Activity Log;
Database health calls `db:health` and prints what the main process answers) and
two are locked, because this build keeps no search index and no render cache.

### The version stopped being typed

`DB.settings.version` was a text field. The sidebar showed it, support asked
for it, and it said **v3.0 on a v5.0.0 build** — three numbers for one fact.
The field is gone. The profile card and the sidebar both read
`app.getVersion()` over `window.appInfo`, which is what the login screen was
already doing and what the updater compares. The stored value survives as the
first paint before the IPC answers.

### The hostel can upload its own logo

Stored in the database as a data URI, so the backup carries it, and
**downscaled to 256px on the way in** — the database is one JSON document
rewritten on every save, and a photograph off a phone would be re-serialised on
every keystroke of every form in the app.

It is drawn on the profile card and **on the header of every document the app
prints**. That is the interesting one: `exHeaderBand()` deliberately draws the
product mark rather than linking it, because an `<img>` to a path the print
window cannot resolve leaves a broken icon on a document that goes to an owner.
A data URI has no path and makes no request, so it is exempt — and it sits on
the hostel's side of the band, never the product's. **The sidebar mark stays
un-uploadable**, which was a decision recorded in `index.html`; this does not
walk it back.

### License, restored to the reference

The last pass dropped four rows and a whole card. All of it is back, and the
rows the licence file cannot answer — **Licensed to**, **Issue date**,
**Licensed modules** — are drawn, locked, and read "Not recorded", with a
tooltip saying the file carries no such field. A warden reading this card down
a telephone can now say "it says Not recorded" instead of wondering which line
they are missing.

Also restored: the third action (Full reset), **Reactivation & Transfer**
(Export licence details, and a Transfer guide that puts the five steps in the
order that does not strand you), and the **System Status** strip. `Last
verified` is a real timestamp now — `license.js` stamps
`_hostyllo_license_checked_at` when the startup check runs.

The three actions are still drawn identically, because in `main.js` they are
still the same removal.

### Backup & Restore is a page

It was the only item in the rail's SYSTEM group that opened a dialog. Built to
`backup.png` and `backup and restore.png`, five tabs: **Backup & Restore ·
Auto Backup · Backup History · Restore History · Storage**.

Live: the four counters, Create & download, Preview data (what is in the file,
before it is written), Copy to clipboard, restore by picker or by **drag and
drop**, restore from pasted text, and the storage composition.

**Backup history and restore history are new and real.** Nothing recorded a
backup before today, so both tables start empty and say exactly that rather
than showing an invented row; every export and every restore writes one from
now on, capped at fifty. The restore row is written into the database that was
just restored, which is the truthful account: restoring an older backup brings
that backup's history with it.

**The whole Auto Backup tab is locked**, and its notice is the honest version of
the reference's own annotation: Hostyllo is a desktop application, not a
service — it cannot run while it is closed, so a scheduled backup would run
when the app is next opened and not at the hour you picked; and saving to a
folder of your choosing needs the main process to write files on the app's
behalf, which this build does not do. Each of the seven controls carries its
own sentence. The rail beside them lists what IS real today.

`backup.png` draws six tabs and `backup and restore.png` draws four, and the
second one's "Settings" tab holds the same eight controls as the first one's
"Auto Backup". They are one tab here rather than two showing the same locked
controls twice — worth an owner's ruling if that is wrong.

### Activity Log is the audit page

Built to `audit logs.png`, with the detail view from `activity logs.png`.

The log holds six fields per row — action, details, category, by, date, time —
and **everything on the page is computed from those**: the counters and their
month-over-month deltas, the fourteen-day trend, the split by type, the busiest
users, the filters (search · user · action · module · date range), the paged
register, and a detail panel with the raw entry.

**Action type is derived only from the app's own verbs.** Every action string
this app logs ends in one — Added, Collected, Updated, Reversed, Deleted — and
`alType()` maps those and nothing else; an action it does not recognise is
"Other" rather than guessed into a bucket. The spec holds that: "Payment
Collected" is a Create, "Payment Reversed" is a Delete, and an unmapped verb
lands in Other.

**Three things the reference asks for are drawn and locked**, and all three are
locked for the same reason — the record does not contain them:

- **IP address.** One computer, no server, `connect-src 'self'`. The column
  keeps its heading, a lock, and a dash in every cell.
- **Status.** A row is written AFTER the action succeeded, so a Status column
  would say Success on every row for ever. What a real audit trail adds is the
  failures, and those are not recorded.
- **Login events.** The app does not log signing in or out. The counter is
  drawn, reads zero, and says "not recorded" — and its tooltip says plainly
  that adding it is one line in the sign-in path, deliberately not slipped into
  a redesign.

The detail panel shows the raw entry as JSON, and says why there is no
before-and-after: this log stores what happened, not the row it happened to.

`renderActivityLog()` also **moved out of `settings.js`**, where it had been
sixty lines of inline style and Material-icon glyphs, into
`src/modules/activitylog.js`.

### Verified

- `npm run typecheck` — 0 errors. `test:theme` — 4 checks, raw-hex ceiling
  unmoved. `test:export` — 50 checks.
- Playwright: smoke · responsive-floor · theme-parity · settings-configuration
  · html-escaping (13) · regression · dashboard-wiring · issues-register ·
  exports-pdf (23) · settings-hostel-info (7) · settings-license-connection (5)
  · backup-page (4) · activity-log (4). All pass. **Two apparent failures in a
  large batch were reproduced as passing in isolation** — this repo's Playwright
  worker OOMs on big batches and reports false failures, which is why the suite
  is run six to eight files at a time.
- **Two new spec files**, `backup-page.spec.js` and `activity-log.spec.js`, and
  three new tests on `settings-hostel-info.spec.js`: that every locked
  preference is really disabled and carries a sentence over thirty characters
  that never says "coming soon"; that the version is the build's and no input
  writes it; and that an uploaded logo is downscaled to exactly 256px, kept in
  ratio, drawn on the card AND present in the printed header while the product
  mark stays.

## 2026-09-09 — the demo batch

Owner's brief, the day before a client demo: Students, Cancellations, Annual
Archive and User Management, plus six global rules. Built in that order, with
the globals folded into whichever screen met them first.

### The global rules

**1. Every search box clears itself.** All six list screens share `.lk-sin`, so
the × is one component (`lkSearchX()` in `src/toolbar.js`) dropped in beside
each input, and its visibility is CSS — `.lk-sin:placeholder-shown + .lk-sx`
hides it while the field is empty. That is live as you type and cannot fall out
of step with a debounced re-render the way a JS toggle would; it works because
all six have placeholders, so keep them.

**The toolbar's "Clear all" is gone** from all six. It sat at the far end of the
bar and reset every filter on the page when what you wanted was to stop
searching.

*One bug found by its own test:* the first cut resolved the filter with
`window[filterVar]`. Every screen declares its filter with `let`, which does
**not** put it on `window` — so the × emptied the box, the filter kept the old
search, and the next render put it straight back. The handler takes the object
now, which an inline attribute can see because it is evaluated in global
lexical scope.

**2. No screen prints the arithmetic.** "PKR 16,000 rent + PKR 2,000 mess" is
gone from `chargesBreakdown()`, the students table's tooltip and the profile's
month table. The label — Rent + Mess / Rent only / Rent / Mess only — comes
from `chargeCoverage()`, which already named the four cases, so the phrasing is
not written twice.

**3. Action buttons are labelled.** Students had a bare kebab and Payments had
four coloured glyphs in a 124px strip. Both are one labelled button now, and
the menu behind it moved out of `students.css` into `listkit.css` as `.lk-rmenu`
— Payments draws the same component, and a menu defined in the Students
stylesheet was going to be copied rather than reused. Delete is separated and
red at the bottom of the list rather than one pixel from Edit.

**4. Print and Download at the top of every document.** The action bar existed
but was appended before `</body>` — so on a nine-page register the only way to
save it was at the end of the ninth page. It is a sticky strip after `<body>`
now, still `no-print`, and the buttons say **Download PDF** and **Print**
rather than naming the mechanism.

**5. "This Month at a Glance" became "Today at a Glance"** — *and the figures
moved with it*. The file already recorded a rename in the other direction,
because the card once said Today over a month's numbers. `_dlGlance()` is
scoped to the calendar date now and the pill carries that date; it is the one
panel on the dashboard that deliberately ignores the sidebar's month picker,
because "what did we do today" is not a question about the selected month. The
payments row changes meaning with it and the change is the right one: it counts
what was **collected today**, so a warden who takes August arrears on 9
September sees their own day's work.

**6. Forms and modals open smoothly.** Two motions, both small: the scrim fades
over 160ms and the panel rises 8px while scaling up from 98.5% over 220ms on a
hard-decelerating curve. Slide-overs come from the edge they are docked to. The
global `prefers-reduced-motion` rule already collapses both.

### Students

Type came up across the table — 12.5 to 13.5px in the cells, 13 to 14.5px on
the name — because the owner reads this register all day and reported eye
strain. The stat strip came *down* (22px to 18px, tighter padding) so the table
gets the page.

- **The WhatsApp mark moved to the student's own number.** The first number the
  intake form asks for IS the student's WhatsApp; the second is the guardian's
  voice line. The glyphs were the wrong way round, which told a warden to
  message the father and telephone the son.
- **Fee Status left the table.** Whether this month is paid is a question about
  a PAYMENT, and the payments register answers it with the record attached;
  here it was a pill that went stale the moment money was taken on another
  screen. It survives as a filter in Advanced Filters, which is how it is
  actually used — "show me who has not paid", not "read down this column".
- **The seat count left the room cell**, replaced by a short floor:
  `stuFloorShort()` gives Base-Floor / G-Floor / 1st-Floor / 2nd-Floor. The
  seater was the room TYPE repeated on every one of its rooms, in a column
  whose job is to say where.

### Cancellations

**Refund was already implemented and completely invisible.**
`confirmCancellation()` settles a leaver — collecting what is owed, or handing
a credit back through `reversePayment()` — and writes the position at departure
to `c.settlement`. Nothing displayed it, so "did we refund Azat?" was answered
by opening the payments page and reading dates. The register now names the
outcome in the column the room type used to occupy (Refunded / Collected / Part
collected / Settled) with the amount under it, and the edit form reads the
whole position back. **The method is kept too** — it was handed to
`reversePayment()` and then forgotten, so a refund could not say whether it was
cash or a transfer.

**The Type column swap** that has been open since 8 September is done with it:
the room type sits inside the Room cell, as `cancellations.2.png` draws it,
which also takes the owner's per-type colour off a category three columns from
a Status chip drawn out of the same palette.

**Both dates are editable.** Vacate always was; **Requested on** was a read-only
line in a strip at the bottom — and it is what the register sorts and filters
by, so a request entered on the wrong day could only be fixed by deleting the
record and remaking it, losing its id and its place in the sequence.

The form itself is rebuilt to `add and edit cancellation.png`: student card,
dues position, three numbered sections.

### User Management

A page now (`src/modules/users.js`), built to `user managemnt.png`, with the
form from `add user.png`. It was a modal off the account menu drawn in inline
styles; the reference gives it a stat row, filters, a register and a detail
rail, none of which belongs in a box you dismiss.

Four fields were added because the reference asks for them and each costs one
line to store: `email`, `department`, `role` and `createdAt`. **`lastLogin` is
stamped by the sign-in path** — written after the password verifies and before
the screen goes, so a failed attempt never stamps one. That is what makes the
Last sign-in column real rather than a row of "never".

**Role is a preset, not a second source of truth.** Picking one ticks a set of
the seven permissions the app actually enforces; edit a tick by hand and the
field reads Custom. Access level is derived from the ticks and says so.

**The permission model is the honest one.** The reference draws eight group
cards holding about thirty sub-permissions. This app enforces seven. Each
card's checkbox IS one of the seven, and the lines under it are what that tick
grants, drawn as text. Thirty checkboxes of which twenty-three did nothing
would tell a warden they had revoked something they had not — the worst lie an
access screen can tell.

Locked and explained: Locked users (the sign-in lockout is per session, not
stored per account), Sessions, Security, Sign in as user, Import.

**The rail overflowed** once Users was the thirteenth destination — it and
Backup & Restore fell below the fold at 768px, which on a rail reads as "this
app does not have that screen". The space came from chrome, never type: 8→7px
of row padding, 2→1px of margin, and 5px back from each section label, under a
`max-height: 820px` guard. All thirteen fit; a taller window keeps the
comfortable spacing.

### Annual Archive

Already built to its reference except the two charts, so that is all that was
added: Revenue vs expenses, and Student movement. Both read the **same twelve
rows the month table above them is built from**, so the picture cannot disagree
with the figures. Bars in plain markup — this app ships no chart library, the
dashboard draws its donut by hand for the same reason, and twelve bars do not
justify a dependency in an offline installer. An empty year draws nothing and
says why. The KPI strip is six across in one row instead of wrapping 5 + 1.

*Two bugs worth recording, both mine, both caught by looking at the render:*
`.arc-bar` was **already the page's toolbar** at the top of `archive.css`, so
the chart columns inherited a 12px padding and a 1px border and drew twelve
outlined boxes with hairlines inside; renamed to `.arc-cbar`. Then the bars
vanished entirely, because `padding: 0 12%` on a flex item resolves against the
**container's** width, not its own — 60px either side of a 40px column.

### Verified

- `npm run typecheck` — 0 errors. `test:theme` — 4 checks, raw-hex ceiling
  unmoved. `test:export` — 50 checks.
- **`tests/demo-sweep.spec.js` is new** — seven tests, deliberately one per
  decision rather than a suite per screen, because each is a thing that would
  be visibly wrong in a demo and none is checkable by reading the code.
- Playwright regression: smoke · responsive-floor · regression (9),
  students-export · students-panel · payment-redesign · cancellations (18+13),
  settings-configuration · backup-page · activity-log · theme-parity (17),
  demo-sweep (7). All pass.
- `students-panel.spec.js` needed one update: it found the status cell by
  `td[11]`, and removing Fee Status shifted every cell after it one to the
  left — so it had been measuring the actions cell. It finds the cell by what
  it contains now.

## 2026-09-09, second batch — typography, the two dashboard panels, and the refund rule

### Typography, to `Hostyllo_Typography_Redesign_Spec.md`

Three changes, in the order the spec argues for them.

**One family.** §2 asks for Inter as the single UI typeface and rules out
mixing unrelated sans-serifs. The app was on Barlow for body and Barlow
Condensed for display — the type system from the Add Student mockups. Inter now
leads both stacks and Barlow stays behind it, because both are bundled and a
face that fails to load must land on a real bundled font. `--font-display` is
no longer a *different family*, only the same one at display sizes: a condensed
face beside a normal one is exactly the mixing the spec forbids.

**A named weight set.** §3 caps the everyday range at 400–700, reserves 750 for
major dashboard numbers and says avoid 800. `--fw-regular` … `--fw-strong` are
tokens now so screens stop reaching past the set.

**Softer ink, both ways.** The spec's first two complaints are that dark mode
is too white and light mode too black. Dark `--text` #FAF9F5 → #E7EAF0 and
`--text2` #D8D5CD → #A8B0BE; light `--text` #152238 → #17233A and `--text2`
#5B647A → #52627A.

Worth knowing: **this reverses an argument style.css makes out loud.** That
file records a deliberate WARM ink on a warm ground — "cool ink on a warm card
is the same mistake mirrored" — and the spec's ramp is cool blue-grey. The
owner asked for the spec, so the spec wins, but the warm-ground reasoning is
still in the comment directly above the changed lines and is the thing to
re-read if dark mode starts reading cold rather than soft.

### Needs Action + Quick Actions, to `redesign nedd And quick actions.png`

Same data, same four queues and four forms; the shape is the reference's. Rows
carry their count large with the action as a real control beside it; quick
actions are tinted cards with the job named under the button's own name.

Two things drawn and locked rather than dropped: **View all** on Needs Action —
the four rows go to three different screens and there is no combined
outstanding list, so the button is disabled and its tooltip says why — and the
reference's always-red row tint, which here follows each row's **own** tone: a
pending cancellation is amber business, and painting all four red would leave
the count as the only signal.

**The same collision as the archive's `.arc-bar`, and it is worth naming
twice.** The first cut appended the new rules and left the old `.dl-need*` /
`.dl-act*` blocks in place. Everything I did not restate kept coming from them —
`.dl-need__label`'s nowrap/ellipsis truncated every row, and `.dl-act`'s centred
column stacked the card text down the middle. The old blocks are removed now,
not layered over. `dashboard.css` had also picked up mixed line endings from an
earlier append, which is what silently defeats a line-based patch; it is
normalised to LF.

These two panels are two of three columns in row C, so on a 1366 window they
are ~320px wide however large the screen — the reference draws them at nearly
twice that. A **container query** (not a viewport one, because it is the panel's
width that matters) drops the card descriptions below 380px of panel and gives
the labels the room. Wider windows keep the reference exactly.

### Print and download, top right

Moved again, and this time to where the owner asked: a fixed column in the
top-right corner under the window's close button, rather than a full-width
strip across the top. The strip pushed the report down and put a band of chrome
between the reader and the first heading; a corner column costs the document no
vertical space and stays reachable on page nine.

### The part-month refund

The owner's case: a student cancels mid-month and wants money back, and some
hostels refund the mess only.

**This is built the way `calculateSettlement()` already said it had to be.**
That function carries a paragraph refusing to invent a daily rate, ending: *"If
a hostel ever gets a pro-rata rule, it belongs in Settings first and arrives
here as a real charge on a real record, not as a rate improvised at checkout."*
So:

- **The rule lives in Settings → Rent & Mess.** Four modes — nothing, mess
  only, rent and mess, or the whole month before a cut-off day — with an
  optional cut-off. The default is **nothing**, which is what every install has
  been doing, so no existing hostel's figures move.
- **At checkout it becomes a concession on the vacate month's record.** Not a
  second refund ledger: the bill for that month drops, which is what turns a
  paid month into a credit, and the *existing* checkout path hands that credit
  back through `reversePayment()`. The figure is therefore on the payment, the
  receipt and every export, and the settlement cannot disagree with them.
- **The warden can decline it.** The confirm dialog shows the amount, the rule
  and the arithmetic behind it, with a tick — the person confirming a departure
  is the one who knows whether the rule fits this leaver.

Arithmetic decisions, each pinned by a test: the divisor is the **real length
of the month** (a flat 30 overpays every February), **the day they leave counts
as a day they stayed**, nothing comes back that was never charged, and an
unpaid month reduces the bill but returns no cash.

**One bug found by its own test.** The dialog computed the settlement against
the untouched records, so for exactly the student the refund exists for — a
paid month, square until the concession lands — it said "nothing outstanding"
and never rendered the settle checkbox, and the money never moved. The preview
is computed against **cloned** records with the concession applied; nothing is
written until Confirm.

### Verified

- `typecheck` 0 · `test:theme` 4 · `test:finance` **70** (nine of them new, on
  the refund arithmetic) · `test:outstanding` 21 · `test:cashevents` 12 ·
  `test:reporttotals` 14.
- Playwright: responsive-floor · theme-parity · smoke (4), demo-sweep (7),
  cancellations, and a new `refund-policy.spec.js` (4) covering the wiring the
  arithmetic disappears into.
- **`tests/report-totals.test.js` was broken before today** and is fixed here:
  its sandbox never loaded `nav.js`, so `payments.js` threw a ReferenceError on
  `registerFilter` before a single assertion ran. A broken harness, not a broken
  total.

### Not in this batch

The **Cancellations page** (`cancellations.2.png`) and its **add** form, and
the **Expenses page** (`expense.png`) with its add/edit forms, are still to do.
The cancellation *edit* form, the register's settlement column and the
Type/Room swap landed earlier today; the add form and the two Expenses surfaces
have not been touched.


## 2026-09-09, third batch — the last two items on the order of work

`Cancellations` (the add form) and `Expenses` (the page and both forms) were
the only things left in the programme. Both are built.

### Two owner decisions, taken before anything was written

**Q5 is answered: the two fields are CAPTURED.** The Expenses reference draws a
Payment Method column and an Added By column; the record was `{id, category,
amount, date, description}` and had neither, and this file recorded it on 7 Sep
as the owner's call. The owner chose capture — including the reference's
**Attach Receipt** — so an expense now carries `method`, `handedTo` and
`receipt`. Nothing is back-filled: a record written before today prints §21's
dash, and the method filter carries a **Not recorded** option so those records
are reachable and can be completed rather than merely noticed.

**The cancellation dues rule warns, it does not block.** The reference disables
"Add to Cancellation List" until dues are zero, with "you can still save this
request as draft". Owner's call: the button stays live. A warden must be able to
put a leaver on notice while they still owe — the bed is held and billed until
the vacate date, and the money is settled at Confirm, which is where this app
already collects it. Blocking would make a student who owes PKR 500 impossible
to check out, and this app has no draft status to fall back on.

### The dues panel is the settlement authority, not a second sum

The reference's four boxes are Pending Fees / Fine / Other Dues / Total Due.
**Three of those four are not fields this app has.** A payment carries
`extraCharges` as free text ("Laundry, cooler, fines — anything billed on top"),
and a part payment is applied to the RECORD, not to a component of it — so
splitting an outstanding balance into rent-versus-fine would be an invention
dressed as arithmetic.

The four figures shown are **Billed · Collected · Advance credit · Total due**,
straight from `calculateSettlement()`, with the signed net stated in words
underneath rather than printed as a fifth number. Using the same function the
CONFIRM step uses is the whole point: the figure a warden reads when filing the
request cannot disagree with the one they are asked to settle when they confirm
it. Nothing owed is stated outright — a blank where the panel would be reads as
"not loaded yet", and a warden then opens the ledger to check what the form
already knew.

### One reason list, not two

`CANC_REASONS` was a `const` inside `showEditCancellationModal()`. The Add form
therefore offered a free-text box and the Edit form a picker, and the same
departure could be filed as "shifting to own house" and edited into "Shifting to
own house". It is module-level now, and both forms read it. As in the edit form,
the picker FILLS the notes box rather than replacing it, so a reason chosen
after something was typed does not throw the typing away.

### The receipt, and the bridge it needed

Images are re-encoded at 1400px as JPEG before they are stored: a 12MP phone
photo of an electricity bill is four megabytes of JSON in a database that is
read whole on every boot, and the same bill at 1400px is legible at about 150KB.
PDFs are stored as they came — re-encoding one would mean rendering it, and a
bill is a document, not a picture of one.

**A stored receipt needed a way back out.** The window's CSP declares no
`frame-src`, so `default-src 'self'` applies and a `data:` URL cannot be framed
— an attached PDF would have been write-only. `file:saveDataUrl` (main) and
`saveDataUrl` (preload) decode it and write it wherever the warden says. Images
open in a viewer; PDFs go straight to the save dialog.

### Three defects found on the way

- **Delete-from-the-form ate the form.** Putting the reference's Delete button
  in the edit footer meant raising `showConfirm()` from an open modal — and
  `showConfirm` calls `showModal`, which replaces `#modal-container` wholesale.
  Answering **Cancel** left the warden looking at the register with their
  half-finished correction gone and nothing said about it. The cancel path
  reopens the form and puts back the receipt they had staged but not saved.
- **And then asked twice.** The first fix routed Delete through
  `deleteExpense()`, which raises its own confirmation — two identical questions
  in a row. The deletion is `_expDoDelete()` now, with no confirmation of its
  own, and both callers raise exactly one.
- **`tests/report-totals.test.js` aside, two specs were stale rather than
  broken** — see below.

### Two stale specs, both from earlier owner decisions

Neither was caused by this batch; both asserted a control that had been
deliberately removed and never re-run.

- `exports-pdf.spec.js` looked for a **"Print / Save as PDF"** button. That
  single control was split on 9 Sep into "Download PDF" (main-process
  `printToPDF`, the only path that can put "Page X of Y" on every sheet) and
  "Print" (Chromium's dialog, kept as the second button).
- `toolbar-shared.spec.js` asserted **"Clear all"**, which the owner retired on
  9 Sep when the × moved into the search box. `tbClear()` now has no call sites
  at all. The test follows the behaviour instead: the × clears the SEARCH ALONE
  (the status filter is deliberately untouched), and leaving the page and coming
  back is what puts the rest down.

### Verified

- `typecheck` 0 · `test:export` 50 · `test:finance` 70 · `test:theme` 4 ·
  `test:reporttotals` 14 · `test:outstanding` 21 · `test:cashevents` 12.
- Playwright, in batches: **`expense-form.spec.js` (6, new)**,
  **`cancellation-add.spec.js` (5, new)**, toolbar-shared (6), regression (17),
  students-export (5), annual-archive, counter-flow-decisions, issues-register,
  demo-sweep, responsive-floor, theme-parity, smoke, month-scope,
  fund-transfer-and-category-register, refund-policy, exports-pdf, seat-on-notice.
- **Two failures in the big batch were the known worker-load flake, not
  regressions** — `seat-on-notice` and one `exports-pdf` case each pass alone in
  under 25s and time out at 180s when six spec files share the worker. The
  standing rule holds: 5–7 spec files at a time, with
  `NODE_OPTIONS=--max-old-space-size=512 --max-semi-space-size=2`.

### Not built, deliberately

- **No back-fill of `handedTo` from the signed-in user.** It would be a guess
  about who was on shift in July, and §21 names that as the thing not to do.
- **No fifth payment method.** `EXP_METHODS` is §20's list and is closed: a
  free-text method column stops being filterable and becomes four spellings of
  "cash".
- The **Type/Room column swap** on the cancellations register (this file, 8 Sep)
  is still open. It is a Q8 question about colour on a category, not part of the
  add form.
