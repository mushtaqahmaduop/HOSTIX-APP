# Handoff — Phase B closed, Phase C opened, dashboard rebuilt to the sketch

**Date:** 2026-09-05 · **Branch:** `feature/dashboard-1c`
**Committed:** `c9822a4` (D-1), `3195b46` (Phase B/D + §27 rows)
**Also committed:** the dashboard redesign — see §4
**Gate:** Playwright **102 passed / 2 skipped / 0 failed** (all 43 spec files, batched) ·
node suites **224 passed / 0 failed** · typecheck **0 errors**

---

## 1. Read this first

`docs/ENTERPRISE_LIVE_STATUS.md` is still the authoritative state document (spec
§31) and is current through `3195b46`. It does **not** cover the dashboard
redesign, which is product work rather than an enterprise-spec phase — that is
§4–§6 here.

---

## 2. What landed in `c9822a4` — D-1

**The defect report understated it by an order of magnitude.** Phase A recorded
D-1 as "three call sites in two files". It was **55 sites by grep, 52 actually
routed, across eight modules**: 29 fell back to `p.amount`, 26 to `0`, and
`reports.js`, `students.js` and `receipt.js` each contained **both** — so
`reports.js` disagreed with itself, its Pending card summing one way and its own
transaction table the other.

`outstandingOf(p)` now sits beside `resolveCharges()` in `renderer/src/utils.js`
and is the single answer. **Do not add a new fallback anywhere; call it.**

Three things in it that look like preferences and are not:

1. **A recorded `unpaid` is answered first, even on a record marked Paid.**
   Every automatic settlement writes `unpaid = 0` with the status, but the Edit
   Payment form takes the status from a free dropdown while the balance beside
   it is readonly (`payments.js:2759`), so a Paid record carrying a real balance
   is reachable. That is money someone is owed.
2. **The `Paid → 0` short-circuit guards only the DERIVED path.** It is needed
   because `payments.js:311` sums a list that was never filtered to Pending.
3. **Mess obeys "the hostel's answer overrides the record's".** A hostel that
   switched optional→bundled carries `messIncluded:false` records; honouring
   them would under-state its arrears on every one.

**The sharpest consequence was never in the defect report:** `payIsArrear()`
gated on `Number(p.unpaid || 0) <= 0`, so a legacy debtor could **never register
as an arrear at all** — absent from the arrears list, the banner and its total.

**Extra charges (Phase 0's F-1) were fixed in `3195b46`.** The helper was
extracted from `payments.js:2640` and inherited that expression's omission of
`extraTotal`, so it reported less than the record owed. The Phase 0 fixtures
`m_extras` / `m_legacy_no_unpaid` are inlined in `tests/outstanding.test.js` and
both now derive 8500 — the "canonical 8500 vs fallback 7000" gap, closed.

> **The Phase 0 fixture set is NOT on this branch.** It lives only on the
> unmerged `enterprise/phase-0-baseline` (`7605122`). The evidence
> `ENTERPRISE_LIVE_STATUS.md` cites for D-1 was not where it said it was.

**`renderer/src/modules/students.js` still holds 13 unrouted sites.** It is
§2-protected in-flight work and was not touched. Route them when that lands.

---

## 3. What landed in `3195b46` — Phase B closed, D-3, D-4

### D-4 — revenue and cash disagreed about the same rupees

`calcRevenue()` counted a Pending record's collected amount only
`if (p.unpaid != null)`, so a part-payment written before that field existed
contributed **nothing to revenue**. Collected, banked, absent from the books.

The argument was already in the tree: `_cashEvents()` says outright that
"`p.amount` is the total collected on that record" and carries no such
condition, so `calcCashReceived()` had been counting these all along. Removed
from `calcRevenue()`, `_arcCollected()` and three `reports.js` columns.

### D-3 — read-only did not block configuration

`db:setSetting` checked database health and never the licence. Now guarded by
`_assertWritable('settings')`. **It has no callers** — `preload.js:100` exposes
it and nothing invokes it; it is guarded because it is reachable.

### §27 unknown schema — a real gap, not paperwork

`migrateDatabase()` only migrates UP, so a database written by a **newer build**
was opened and written by an older one, saving records without whatever the
newer version added. Detected now before `db = handle` and before the
`CREATE TABLE` block (that block is a write). `_readSchemaVersion()` reads
`sqlite_master` directly because `migration001.currentVersion()` does
`CREATE TABLE IF NOT EXISTS` first.

**The recovery screen needed opposite advice for this state.** Corruption says
"restore a backup"; here the data is perfect and the app is behind, so the
restore list is **removed** and the instruction is to update — offering a backup
would be the data loss. `tests/schema-guard.spec.js` 5/5.

### §27 permission denied

`tests/write-failure.spec.js` makes the database file read-only before launch —
nothing simulated. **Disk-full is still NOT covered** and that §27 row stays
PARTIAL: filling a real volume needs an elevated VHD.

---

## 4. The dashboard, rebuilt to the sketch

Layout authority is the owner's sketch; the upper half follows `db3.png`; the
lower half takes named components from the reference images.

| Row | Cards |
|---|---|
| A | 6 KPIs — Residents · Revenue · Expenses · Available Fund · Pending · **Cash Received** |
| B | **Revenue Trend** · Seat Availability · Today at a Glance |
| C | Occupancy by Room Type · **Occupancy Overview** · **Needs Action** · Quick Actions |
| D | Collection by Method · Pending Payments |
| — | Recent Payments (below the fold, deliberately — a log is what you scroll to) |

**Rows A–C fit above the fold** at four of the five common Windows
screen/scaling combinations, measured on the real app with 40 rooms:

| Screen | Scaling | CSS viewport | Row C bottom | Fits |
|---|---|---|---|---|
| 1366×768 | 100% | 1366×768 | 747 | ✅ |
| 1920×1080 | 100% | 1920×1040 | 820 | ✅ |
| 1920×1080 | 125% | 1536×824 | 713 | ✅ |
| 1920×1080 | 150% | 1280×660 | 652 | ✅ |
| 1366×768 | 125% | 1093×614 | 657 | ❌ 43px short |

The grid holds its full 6/3/4 shape down to 1000px wide — collapsing to
3-across turned one KPI row into two, which is the worst thing to do on a short
screen. Under 700px tall the KPI tiles drop their sparkline, progress track and
sub-line: ~60px taken from decoration rather than from any figure or label.

**1093×614 is left not fitting, deliberately.** It is 154px shorter than the
same laptop at 100%. It came down from 1318px to 657; the last 43 would have to
come out of the chart and the card padding, past the point where either is worth
showing. It scrolls, and nothing is lost.

### New

- **Cash Received KPI** — sixth tile. It opens `showCashReceivedModal()`, **not**
  the Payments page: it replaced a tile that opened that reconciliation, and
  that modal is the only screen explaining why cash and revenue differ.
- **Occupancy Overview** — `occupency 2.png`, bar not donut (owner's choice).
- **Needs Action** — replaces Upcoming Reminders. Every row names the decision
  (View / Collect / Resolve / Assign); zero-count rows are dropped.
- **Trend range switch** — db3's Quarter / 6 Months / Year, wired. Ranges end at
  the current month; active state reads from `_dashTrendRange`, not hard-coded.

### Removed, and why it is not a loss

- **The Occupied/Vacant/Active tile row.** Repeated three figures the page
  answers better below, and made the fold arithmetically impossible.
- **Seat Availability's three-tile block, Print and Expand.** The counts are now
  inline in the header as db3 draws them — ~70px returned to the room grid,
  which is why it shows roughly twice as many rooms. Print is on the Rooms page
  (`rooms.js:328`); Expand is what tapping any room already does.
- **The Revenue/Expenses/Net strip.** Not in db3, and all three are on the KPI
  row two inches above.
- **Chart datalabels.** Not in db3, and on real data they produced
  "▲ +157902725.6%" — a true division against a near-zero baseline.
- **The header "Add Payment" button.** One primary action in the header;
  Add Payment is the first Quick Action.
- **`_dlReminders()`**, deleted rather than left computing into nothing.

### Fixed along the way

- **`fmtCompact()`** in `utils.js`. A KPI tile holds about `PKR 9,999,999`;
  above that it clipped mid-number. Exact below 10M, `M`/`B`/`T` above, and the
  exact figure stays in a `title`. The chart's Y axis had no tier above M and
  was rendering **"1500000.0M"** — it now shares this function.
- **The theme toggle never changed its glyph.** `updateThemeUI()` writes into
  `#theme-icon`, and the button contained a bare `<svg>` — the element did not
  exist. Sun/moon now swap.
- **The header chrome never ran on login.** It lived inside `navigate()`, which
  only fires on a rail click, so a fresh login kept `index.html`'s placeholders
  — the title, the hostel name and the primary button. Extracted as
  `applyHeaderChrome(page)` and called from the login path too.

---

## 5. Traps worth knowing

1. **`${''/* … */}` is the in-template comment idiom in `dashboard.js`.** A
   JSX-style `{/* … */}` renders as visible text on the page. It did.
2. **`#trend-chart-wrap` was pinned by `height:198px !important`** in the
   density block. Anything sizing that chart has to answer in the same terms.
3. **Row B cards must use `flex: 1 1 0`, not `1 1 auto`.** With `auto` the room
   grid contributed its natural height, a 40-room hostel made the card ~410px,
   and row C went under the fold. Basis 0 makes the grid take what is left.
4. **`#sidebar .sb-logo` (chrome.css) beats a bare `.sb-logo`.** Sidebar
   overrides need the id.
5. **A spec that chmods the shared profile can poison every other spec.**
   `write-failure.spec.js` does it deliberately; `resetProfile()` now clears
   read-only before deleting, because `rmSync({force})` ignores a missing file,
   not an unwritable one.
6. **A capture script that fails at `app.close()` leaves Electron holding
   `hostix.db`,** and every later spec then fails with EPERM that looks like a
   permissions bug. Kill strays before blaming the code.
7. Playwright still needs `HOSTIX_TEST_PROFILE` with a `license.enc`, and still
   must be run **6–8 spec files at a time** or the worker OOMs and reports a
   cascade as ~32 assertion failures.

---

## 6. Working tree

**Uncommitted and PROTECTED by spec §2 — untouched all session, no change of
mine appears in any of their diffs:**

- `renderer/chrome.css`
- `renderer/src/modules/students.js`
- `renderer/students.css`
- `renderer/style.css`

**Committed this session (dashboard work):**

- `renderer/dashboard.css`, `renderer/index.html`, `renderer/rail-compact.css` (new)
- `renderer/src/utils.js`, `renderer/src/modules/dashboard.js`,
  `renderer/src/modules/nav.js`, `renderer/src/auth-nev.js`
- `tests/_profile.js`, `tests/permissions.spec.js`,
  `tests/counter-flow-decisions.spec.js`, `tests/zz-v6-redesign.spec.js`

> **`renderer/rail-compact.css` is a deliberate temporary file.** Moving the
> month picker into the sidebar costs the rail ~41px and `rail-reach.spec.js`
> pins the daily five above the fold at six sizes. The height is bought back by
> overriding a few metrics that live in `style.css` and `chrome.css` — both
> protected — so the rules sit in their own sheet loaded last. **Fold them into
> `chrome.css` and delete the file once the in-flight design work lands.**

---

## 7. Next

1. **Route the 13 `students.js` sites** through `outstandingOf()` when that
   file's design work lands. Until then the Students screen is the one place
   still answering "what is owed" the old way.
2. **Fold `rail-compact.css` into `chrome.css`** (see above).
3. **Phase C is open, not finished.** §14's `applyPayment()` /
   `reversePayment()` / `calculateRefund()` do not exist, money is still
   IEEE-754 `Number` with no rounding policy, and the §14 financial matrix is
   15 named cases with no home.
4. **A real disk-full test** — the last §27 PARTIAL that is not downstream of
   code signing. Needs an elevated VHD.
5. **The §22 diagnostic bundle** — still entirely absent.
6. **Code signing** — every remaining MISSING matrix row is downstream of it.
