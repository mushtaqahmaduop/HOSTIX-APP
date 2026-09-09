# Session handoff — 2026-09-09

Branch `feature/dashboard-1c`. **29 commits ahead of `origin/feature/dashboard-1c`,
nothing pushed.** Eight commits from this session, listed at the bottom.

The owner's in-flight **Add Student redesign is still uncommitted** in
`renderer/src/modules/students.js` and `renderer/students.css`, as it has been
since 5 Sep. Everything here was committed around it with
`HOSTIX-backups\tools\split_panel.py` — see the trap note below, because its
guard needed fixing today.

---

## Part 1 — the programme's last two items

`docs/design/REDESIGN_PROGRAMME_2026-09-07.md` had two items left. Both are
built, and that file carries the full record; this is the short version.

### Cancellations — the Add form

Built to `add and edit cancellation.png`, in the same design as the edit form
that landed on 8 Sep.

**Two owner decisions, both recorded in code:**

- **Dues WARN, they do not block.** The reference disables "Add to Cancellation
  List" until dues are zero. The button stays live: a warden must be able to put
  a leaver on notice while they still owe, the bed is held and billed until the
  vacate date, and the money is settled at Confirm — which is where this app
  already collects it. Blocking would make a student who owes PKR 500
  impossible to check out, and there is no draft status to fall back on.
- **The dues panel is `calculateSettlement()`, not a second sum.** The reference
  draws Pending Fees / Fine / Other Dues / Total Due and *three of those four
  are not fields this app has*: `extraCharges` is free text, and a part payment
  lands on the RECORD, not on a component of it. The four shown — Billed,
  Collected, Advance credit, Total due — come from the same function the CONFIRM
  step reads, so the figure seen when filing cannot disagree with the one
  offered when confirming.

`CANC_REASONS` is now module-level. It was a `const` inside the edit modal, so
the add form offered free text and the edit form a picker, and one departure
could be filed as "shifting to own house" and edited into "Shifting to own
house".

### Expenses — the page and both forms

Built to `expense.png` and `add and edit expense.png`. **Closes Q5**, open since
7 Sep: the two fields are CAPTURED, not derived.

An expense was `{id, category, amount, date, description}`. It now carries
`method`, `handedTo` and `receipt`. A record written before today prints §21's
dash, and the method filter carries **Not recorded** so those records are
reachable and can be completed rather than merely noticed.

- **A blank is an ABSENT key, never `''`.** The "Not recorded" filter and the
  export's dash both read absence; a stored empty string makes them disagree
  about the same row.
- **`EXP_METHODS` is §20's four and is closed.** A free-text method column stops
  being filterable and becomes four spellings of "cash".
- **The chips are neutral**, overruling `status-badges.png` on the owner's own
  two-documents-to-one rule: how a bill was paid is a category, not a state.
- **Nothing is back-filled from the signed-in user** — that would be a guess
  about who was on shift in July.
- Images are re-encoded at 1400px as JPEG before storage (a 12MP photo of a bill
  is 4MB of JSON in a database read whole on every boot; the same bill is
  legible at ~150KB). PDFs are stored as they came.
- **A stored receipt needed a way back out.** The window's CSP declares no
  `frame-src`, so `default-src 'self'` applies and a `data:` URL cannot be
  framed — an attached PDF would have been write-only. `file:saveDataUrl`
  (main.js) + `saveDataUrl` (preload.js) decode it and write it where the warden
  says.

**Two defects the reference's Delete button exposed.** Raising `showConfirm()`
from the open edit form DESTROYED that form — showConfirm calls showModal, which
replaces `#modal-container` wholesale — so answering Cancel left the warden
looking at the register with their correction gone and nothing said. The first
fix then asked the same question twice. The deletion is `_expDoDelete()` now:
no confirmation of its own, exactly one from each caller, and Cancel reopens the
form with the staged receipt still on it.

---

## Part 2 — the owner's visual pass (five rounds, same day)

Driven by screenshots handed over through the session: `buy1.png`,
`students red.png`, `dashboard-now.png`, `dashb.png`, `ff.png`.

### The report window's print bar moved three times

Each move fixed a real fault, and the reasoning is in `renderer/app.js`:

| position | why it moved |
|---|---|
| top-right | sat on the letterhead's own document title and the right-hand KPI tile — and covered the closing figure of every register |
| bottom centre | clear of the report, but not where the document announces itself |
| **top centre** | the letterhead puts the brand hard left and the document block hard right, so its middle is empty by construction |

Still `position:fixed`, not inside the header element: a control that scrolls
away with the letterhead is the fault this started with (the button used to be
appended before `</body>`, putting the only way to save a nine-page report at
the end of the ninth page). The caption is hidden until it has something to say
— standing text made the pill ~520px, wider than the gap it sits in.

### Students and Payments — the row action

- **The actions column was a strip laid over the table, and looked like one.**
  `position:sticky; right:0` with its own background, a left drop shadow on
  Students and a left border on Payments. It is an ordinary last column now.
  **THE COST, STATED:** the pin existed because these tables scroll
  horizontally. Payments carries 13 columns and pans by dragging, so on a narrow
  window its kebab is now reached by panning to it.
- The kebab is a bordered button at rest. `background:none` with a transparent
  border made it three bare dots that only became a control on hover.
- The room cell is one light label — a pale ground gathering the number and the
  floor. Pale, not tinted: what sits under the number is a category.

### The dashboard, in three passes

1. **Needs Action and Quick Actions went back to the OLD cards**
   (`dashboard-now.png`, handed over as "the actual viewport design"). The 8 Sep
   build to `redesign nedd And quick actions.png` is gone rather than trimmed a
   third time: that reference is drawn at nearly twice the width row C gives
   these panels, so at 1366 every quick-action label wrapped and the card
   measured 96px against the 79px tile it replaced.
2. **Then the finish from `dashb.png` on top of that shape** — a chip and a
   count badge on the heads, rows wearing their own tone, arrows on the tiles,
   and a computed closing line on each ("1 open job to clear today" when there
   is one).
3. **Then `ff.png`** — `PKR` stacked above the figure on the KPI tiles, and rows
   B and C cut to the pencil lines.

**The seat counts were not sitting low — the head was WRAPPING.**
`.dash-sec__head` is a wrap row and at 1366 the chip, a two-line title and three
counts did not fit: the head measured 61px where two lines of it are 32, so the
figures sat under the subtitle instead of beside the title. `nowrap` plus 10px
of measured gap (the head is 325px and holds 22 + 118 + 177) put them on the
card's top-right edge and dropped row B by 29px. They read **Total Seats /
Filled / Free** in bounded boxes now.

### The final layout, measured

At 1366x768 (738px of viewport once the title bar is out), 40 students,
17 rooms:

```
chrome    108   (40 title bar + 56 header + 12 content padding)
row A     160   set by Advance / Arrears
row B     254   LOCKED
row C     202   natural height, set by Needs Action
row C bottom = 738 of 738, and all three row-C cards report ZERO overflow
```

**Row B carries the lock; row C deliberately does not.** Cut to the drawn 180px
row C clipped all three of its cards by 32–35px — the second rank of
quick-action tiles, the last Needs Action row's closing line, and the room
list's fourth type. Left to its content it lands the row exactly on the fold.

**Row B has no headroom left.** The next increase has to come from content in
row A or row C. The largest single candidate is the Advance tile's two split
rows (41px).

---

## Traps found today — read these before editing these files

### 1. `split_panel.py`'s guard went stale and aborted on work that was not the owner's

`Contact information`, `Record summary` and `sec('01', ico.person` were unique
to the owner's Add Student form when the guard was written. The **Edit** Student
form was later rebuilt in the same design and says all three. The list now holds
full `${sec(...)` call sites plus `GUARDIAN, NOT EMERGENCY`, each verified
unique. `for="f-temerg">Guardian` matched nothing at all and was dropped.
**If it aborts again, check for a false positive before weakening anything.**

### 2. CSS specificity and later-wins cost four failed edits today

`dashboard.css` and `students.css` define components several times over, and a
rule written at the wrong weight changes nothing *and measures identically*:

| what | the rule that actually wins |
|---|---|
| the seat head's wrap | `.dash-row-b .dash-sec__head` at :983 is (0,2,0); a bare `.seat-head` lost silently |
| the trend chart height | an unconditional `height:…!important` at :336 — **four `min-height` ladders for that element (:1695, :2037, :2045, :2046) have never once applied** |
| the room list's cap | `.dash-row-c .dash-sec .rt-right` at :2524 is (0,3,0); padding trims at (0,2,0) moved nothing |
| the panel ledger's padding | `.stu-pan__ledger .svw-t td` at :1523 beats the identical rule at :1428 by position alone |

The habit that caught every one of them: **measure in the running app before and
after**, never assume a rule applied.

### 3. Five specs were stale, not broken

None was caused by this session's code; each asserted a control the owner had
removed and had not been re-run since. All five now assert the current
behaviour:

- `exports-pdf.spec.js` — "Print / Save as PDF" was split into "Download PDF"
  and "Print" on 9 Sep.
- `toolbar-shared.spec.js` — "Clear all" was retired when the × moved into the
  search box; `tbClear()` has no call sites at all.
- `dashboard-cards.spec.js` ×3 — the glance was month-scoped on 6 Sep and made
  a day card on 9 Sep; the Needs Action badge moved class and moved back.
- `students-fee-status.spec.js` — the Fee Status column was removed on 9 Sep and
  survives as a filter and a sort.

### 4. Playwright still needs the licensed profile, and still OOMs

`HOSTIX_TEST_PROFILE` with a `license.enc`, 5–7 spec files at a time, and
`NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=2"`. Two failures
in a six-file batch today were the worker-load flake — each passed alone in
under 25s and timed out at 180s when six files shared the worker.

---

## Verified

- `typecheck` 0 · `test:export` 50 · `test:finance` 70 · `test:theme` 4 ·
  `test:reporttotals` 14 · `test:outstanding` 21 · `test:cashevents` 12 ·
  `test:services` 145 · `test:retention` 13.
- Playwright: **`expense-form.spec.js` (6, new)**, **`cancellation-add.spec.js`
  (5, new)**, dashboard-cards, dashboard-lower, dashboard-wiring,
  responsive-floor, theme-parity, smoke, chrome, regression, students-panel,
  students-fee-status, students-export, annual-archive, toolbar-shared,
  issues-register, counter-flow-decisions, demo-sweep, exports-pdf,
  seat-on-notice, refund-policy, month-scope,
  fund-transfer-and-category-register — all passing.

## Still open

- **The cancellations register's Type/Room column swap** — a Q8 question about
  colour on a category, open since 8 Sep and not part of the add form.
- **Nothing is pushed.** 29 commits sit on the local branch.
- `tests/tmp-look.spec.js` and `tests/tmp-shots.spec.js` are scratch screenshot
  harnesses and stay untracked, as does `docs/design/shots/` (5.4MB; this repo
  has never committed an image).

## This session's commits

```
f53ac10 feat(cancellations): the Add Cancellation Request form, and a dues panel …
93fed87 feat(expenses): the page and both forms, and two columns that finally have data
447411e test+docs: two specs that were stale, not broken, and the programme log
0d48996 fix(report,dashboard): the print bar leaves the report alone …
552b3f5 feat(dashboard): the old cards restored, then finished to dashb.png …
a0a0ba3 fix(students,payments): the row action stops being a second layer …
294a226 feat(dashboard): PKR sits above the figure, and rows A–C fit the window exactly
cd07dee feat(dashboard): the taglines and closing notes come off, and row B takes the height
```
