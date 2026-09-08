# Where the Reports page gets its numbers

Owner's question, 2026-09-07: *"tell from where the report renders data"*.

Short answer: **the same place the dashboard does, through the same two
authorities.** There is no separate reporting store, no cache, and no second
arithmetic. Reports is a different *window* onto `DB`, not a different *source*.

---

## 1. The store

`DB` — the in-memory mirror of `hostix.db` (SQLite, via better-sqlite3 in the
main process). Reports reads six collections and writes none of them:

| Collection | Used for |
|---|---|
| `DB.payments` | revenue, pending, collection-by-method, every payment table |
| `DB.expenses` | outgoings, the category register |
| `DB.transfers` | legacy fund transfers, merged into outgoings |
| `DB.students` | roster, joined/left counts |
| `DB.rooms` | occupancy |
| `DB.settings` | room types, payment methods, prices |

## 2. The window

`_rptKeys()` (`reports.js:354`) turns the period control into a list of date
**prefixes**, and everything downstream filters on those:

- `This Month` → `["2026-09"]`
- `This Year` → `["2026"]`
- `Custom Range` → every `YYYY-MM` between the two pickers (`_rptMonthsBetween`)

`_rptPrevKeys()` builds the equivalent window immediately before it, which is
the only thing the "vs last month" deltas are ever compared against.

## 3. The arithmetic — two authorities, both shared with the dashboard

`_rptTotals(keys)` (`reports.js:516`) is the single place the page computes
anything. It calls out to:

**a. `finance.js` — the §14 money layer.**
`calculateReportTotals(pays)` returns billed / collected / credit / concessions /
extras / admissionFees / reversed / outstanding, plus a `safe` flag. Reports
never sums a money column itself.

**b. `calcRevenue()` / `calcExpenses()` / `calcTransfers()`.**
These are declared in `dashboard.js` (lines 13, 159, 167) under a banner that
says what they are for:

> `SINGLE SOURCE OF TRUTH FOR REVENUE — used by dashboard, reports, CSVs, PDFs,
> WhatsApp/email share — everywhere.`

So the dashboard's Total Revenue and the Reports Revenue card are literally the
same function over the same rows; they can differ only by which month keys were
passed in.

`_rptOutgoings(keys)` (`reports.js:401`) is the one place the two shapes of
outgoing are reconciled: `DB.expenses` rows, plus legacy `DB.transfers` rows
re-labelled into `FUND_TRANSFER_CAT` so old and new transfers land in the same
category and total together.

## 4. The honesty check

`_rptTotals` returns `safe: totals.safe && rev === totals.collected`. It is
false when a total has left the range where integer rupee arithmetic is exact,
**or when the accrual figure and the finance layer disagree about the same
rupees**. A report that would print a figure the layer will not vouch for says
so instead.

---

## Two things worth knowing

**`calcRevenue` and friends live in `dashboard.js`, not `finance.js`.** Their own
comment says they are used "everywhere", which makes a page module an odd home:
loading order now means Reports depends on the dashboard module being present.
Nothing is broken — `index.html` loads `dashboard.js` before `reports.js` — but
they belong beside `calculateReportTotals` in `finance.js`. Not moved in this
pass: it touches every caller in the app and deserves its own change.

**Reports is read-only over the ledger.** The only writes on the page are the
funds-transfer editor (`showEditTransferModal` / `submitEditTransfer` /
`deleteTransfer`). Everything else — every table, chart, CSV and PDF — is a
projection.
