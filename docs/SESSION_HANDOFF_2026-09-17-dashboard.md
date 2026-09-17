# Session handoff — 2026-09-17 (second) — the dashboard, spec stage 5

Branch **`design/dashboard`**, four commits, **not merged and not pushed**.
It sits on `fix/dashboard-month`, which is itself unmerged. `master` is at
**5.1.0** and still **97 commits ahead of `origin/master`** — nothing in either
of today's sessions has left this machine.

Continues `docs/SESSION_HANDOFF_2026-09-17.md`, which closed with stage 5 (the
dashboard) as the next screen. It is now built, rows A, B and C.

```
850a563  design(dashboard): row C, and Occupancy by Room Type rebuilt to methods.png
0b33449  design(dashboard): row B on tokens, and the KPI cards lose 10%
7c257e6  design(dashboard): row A on the component layer, and the KPI row goes neutral
7ec1263  design(dashboard): remove what the browser was already throwing away
17b174d  fix(month): the dashboard's picked month no longer reaches writes   (previous session)
```

`renderer/dashboard.css`: **3,235 → 1,954 lines.**

---

## Owner decisions taken this session

Each was asked before it was built, and each is written into the CSS at the
place it applies.

| # | Decision |
|---|---|
| 1 | **Honour the 11px floor and re-win the fold from chrome.** Not a dashboard-only exception, not letting it scroll. |
| 2 | **KPI icon chips are neutral**, extending the 2026-09-16 Rooms ruling. Available Fund keeps green/red on the sign of the figure; the Total Revenue delta keeps its hue. |
| 3 | **Branch `design/dashboard` off `fix/dashboard-month`**, keeping the month fix underneath. |
| 4 | **"Reduce the height of kpis upto 10% more"** — 194px → 174px, 10.3%, all of it chrome. |
| 5 | **Occupancy by Room Type is built to `methods.png`** (`C:\Users\PCS\OneDrive\Desktop\methods.png`). |
| 6 | **The donut centre counts ROOMS, not seats** — rooms with at least one student in them, over every room on the books. |
| 7 | **Bars are capped, not stretched** — "reduce the length of the bars to fit in the card beside the pie chart". |
| 8 | **Row D keeps its old places.** Untouched this session. |

---

## What is still open, in the order it matters

### 1. Row C is 18px past the fold at 1366×738

Row C is **246px** against the **202** it used to be. Measured on the running
app, all four shipped sizes:

| Size | row A | row B | row C | row C bottom | viewport |
|---|---|---|---|---|---|
| 1366×768 | 174 | 254 | 246 | 756 | 768 |
| **1366×738** | 174 | 254 | 246 | **756** | **738** |
| 1280×660 | 157 | 254 | 237 | 716 | 660 |
| 1093×614 | 157 | 254 | 202 | 673 | 614 |

`dashboard-cards.spec.js` passes — it asserts row C *starts* above the fold,
and it does (510 of 738). What is broken is the 2026-09-09 result, which landed
row C's **bottom** exactly on 738.

The reference's two-line row (a free count over its bar) is inherently taller
than the one-line row it replaces, and the footnote it restores costs 24 more.
Every pixel available in chrome is already taken and the list is bounded to the
donut's own 118px. **The last 18px has to come from a decision, not a trim:**

- lose a room type from view (the list already scrolls at 5 types), or
- drop the footnote again (row C hid it before; the reference draws it), or
- break the 11px floor on this card.

All three are the owner's call.

### 2. Two values do not map to a token

Both are chrome rather than type, and both are stated in the CSS where they
apply rather than hidden:

- `.dash-row-b .dl-glance__row { padding: 2px … }`. The glance card holds a
  head, six counts and a computed verdict inside a row locked at 254px. At
  `--space-1` (4px, the smallest spacing token) it loses two rows.
- `.dl-need { padding: 2px … }` and `.dl-needs { gap: 2px }` in row C, for the
  same reason.

### 3. `.dash-sec` is still the card shell

Rows B and C both still use it rather than `.ui-card`. That is deliberate and
it is recorded in both blocks: `.dash-sec` is shared with **row D's two cards**,
so converting it is a single move that lands there too. It waits for row D's
own pass. It paints the new palette in the meantime — `--card` and `--border`
are legacy-bridge aliases.

### 4. Row D and Recent Payments are not rebuilt

Untouched, as instructed. They are the rest of stage 5 whenever it is wanted.

---

## Traps this session cost time to

1. **THE ASSEMBLY TRAP, twice.** The screen is built by concatenating
   `rowA.css + rowB.css + rowC.css + tail`. The "tail" has to be the cut file
   **with the earlier row blocks stripped off**, because each cut was taken from
   a file that already contained them. Concatenating the raw cut file duplicates
   row A, and the stale copy — being later — wins. It cost twenty minutes of
   "why is my padding not applying". The scratch files are
   `<scratchpad>/rowA.css`, `rowB.css`, `rowC.css`, `dash-tail2.css`.

2. **`min-height` never clamps downward.** `#trend-chart-wrap` carried **seven**
   `min-height` declarations across six height tiers, every one of them smaller
   than the `height` that applied there, so not one had ever bitten. The file's
   own comment says four. Removing them is safe; removing the `height` ladder
   with them is not — see trap 3.

3. **A flex item's automatic minimum size is its CONTENT.** Take the explicit
   height off `#trend-chart-wrap` and the card overflows at 660px and below,
   because the content is a canvas Chart.js has already sized in pixels.
   `min-height: 0` is what lets it shrink.

4. **Width-tier order is load-bearing and it is the reverse of what reads
   naturally.** `@media (max-width:1200px)` and
   `@media (min-width:1000px) and (max-width:1200px)` both match at 1093px and
   neither out-specifies the other, so **the three-column rule must come
   second**. With it first, 1093×614 fell to two columns, the glance card went
   full width, row B went 254 → 461 and row C left the screen.

5. **A cut can strand a cross-file dependency.** `_dashSpark()` looked dead from
   the dashboard and is not — `reports.js:910` draws it in the report KPI tiles.
   Its `stroke` and area-fill rules lived in `dashboard.css`; without them the
   polyline has no stroke and the area polygon takes the SVG default fill, which
   is solid black. They now live in `reports.css` with their caller. **Grep the
   whole renderer before deleting a rule, not just the screen's own module.**

6. **An SVG with no width renders at 300×150.** Cutting `.dash-pill__ic` with
   the `.dash-pill` block tore the Advance/Arrears card apart. Same trap the
   print documents carry a note about.

7. **Boot toasts sit over the KPI row for ~3s** and made a before/after pixel
   diff read 3.9% when nothing had moved. The scratch capture silences
   `window.toast` before shooting.

8. **Mixed line endings.** `dashboard.js` is pure CRLF. One patch introduced
   four bare LFs; they were normalised before the commit. Check after every
   scripted edit.

---

## The tools this session left behind

All in the scratchpad, none committed. They are worth re-creating rather than
re-deriving:

| File | What it does |
|---|---|
| `cssparse.py` | Parses CSS to rules with exact spans, comments masked. **A comment in this repo is not inert text** — several quote CSS at themselves, braces and all. |
| `flatten.py` | Flattens a sheet to an effective `(condition, selector, property) → value` map. This is how you see what a 3,000-line file actually does. |
| `prune.py` | Removes only what provably cannot render, and **refuses to write** if one effective value is lost, changed or added. |
| `cutrules.py` | Removes every rule whose selector list matches a pattern, and reports the mixed rules it left for hand-splitting. |
| `imgdiff.py` | Pure-python PNG pixel diff, no dependencies. Used to prove the prune changed 1 pixel. |

Untracked scratch specs: `tests/tmp-dash5.spec.js` (captures the dashboard in
both themes) and `tests/tmp-rowb.spec.js` (reports row heights, card overflow
and the fold at four sizes). **Neither is part of the suite; do not `git add -A`.**

---

## Verified

- **Specs:** dashboard-cards (including the five-size fold), dashboard-lower,
  dashboard-wiring, dashboard-recent-payments, dashboard-month-scope,
  counter-flow-decisions, fund-transfer-and-category-register, zz-v6-redesign,
  reports-page, theme-parity, responsive-floor — green after every commit.
- `npm run typecheck` — 0 errors.
- `npm run test:theme` — 4/4. Raw hex **224 → 220**; 24 more deleted from
  `tokens.css` with the `--kpi-*` family.
- Rendered and read at 1366×768 in both themes after each row.
- One spec selector updated, deliberately:
  `fund-transfer-and-category-register.spec.js` finds the Expenses card's pill
  by `.ui-chip` now, because the KPI row moved onto the shared chip component.
  It asserts the COUNT, which is the same either way.

---

## What to do first, next session

1. **Decide the 18px** (open item 1). It is the only thing blocking row C from
   being finished rather than merely built.
2. **Row D + Recent Payments**, which is also where `.dash-sec` becomes
   `.ui-card` for all six cards at once.
3. Then the file moves to `renderer/css/screens/dashboard.css` and joins the
   rebuilt screens at index.html lines 48–55. **It must sit with them, after
   `listkit.css`** — the listkit specificity trap applies in reverse.
4. **`design/dashboard` → `fix/dashboard-month` → master**, and master needs
   pushing. 97 commits have never left this machine.
