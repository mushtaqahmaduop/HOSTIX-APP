# Finance audit — 2026-09-18

Against `HOSTYLLO_FINANCE_SYSTEM_PLAN.md`, which asks for a read-only audit
before any code (§34) and a report of what the repository actually does.

Traced: `renderer/src/finance.js`, `ledger.js`, `ownership.js`, `concessions.js`,
`messExempt.js`, both Add Payment submit paths and the Edit Payment path in
`modules/payments.js`, the month helpers in `modules/dashboard.js`, and
`storage.js`.

**Conclusion: the repository is closer to the specification than the document
assumes. The one defect it names explicitly (§19) is real, still live, and
loses money.** The correction is surgical, not a rebuild.

---

## 1. What already satisfies the specification

| Spec | In the repo |
|---|---|
| §14 one financial authority | `finance.js` — integer-rupee `money()`, half-away-from-zero, `applyPayment` / `reversePayment` / `calculateRefund` / `calculateSettlement` / `calculateReportTotals` |
| §7 partial payments stay separate | `p.partialPayments[]` with per-instalment date, amount, method, `collectedBy`, note, reference |
| §8 reversal ≠ refund | `p.reversals[]`, deliberately not negative entries in the trail — `_cashEvents()` filters one array and sums the other |
| §23 immutable audit trail | `ledger.js` + `migrations/002-student-ledger.js`; the **main process refuses** update and delete on that table |
| §22 actor history | `ownership.js` — the owner is whoever took the latest money; reversal is capped at what that account collected and has not handed over |
| §20/§21 no editable collected amount, no delete with money | `ownCanEdit` / `ownCanDelete` / `ownReversible`, enforced at the control *and* at submit |
| §9 structured adjustments | `concessions.js`, `messExempt.js` — type, value, reason, month range, approval workflow |
| §11 month is a hard boundary | `_payMatchesMonth()` keys off `p.month` alone, fixed from a 4-field OR that counted one record in four months |
| §12 historical membership | `_studentInPeriod(s, mk)` |
| §13/§32 cash vs accrual | `calcRevenue()` and `calcCashReceived()` are already two functions; `cashBreakdown()` already splits a month's cash into current / arrears / advance |
| §3–§5 arrears allocation | `pfOutstandingAllocations()` + `pfApplyOutstandings()` — one input per outstanding month, each capped at that month's outstanding, each posted through `applyPayment()` |
| §26 tests | finance, outstanding, ledger, ownership, cash-events, report-totals, fee-status, concessions, messExempt, prorate, handovers |

### Where §2's model would do harm

Making receipts and allocations first-class tables with month records derived
from them would create the second source of truth that `finance.js` and
CLAUDE.md §14 exist to prevent — this codebase has a documented history of
"52 call sites each answering *what is owed* its own way" and a standing rule
against adding a 53rd. Owner's decision: stamp a `receiptId` on the trail
entries written in one posting instead. Same §36 answers, no migration, no
competing authority.

---

## 2. Defects found

### Fixed in this pass

**G1 — §19 is live: two competing collection models.** `applyPayment()` has
correct new-money semantics; the two Add Payment merge paths never called it.

    payments.js  alreadyPending.amount  = money(newPaid)
    payments.js  alreadyPending2.amount = newPaid
                 const instalment = newPaid - prevPaid

The second carried its own comment — *"Amount Paid is the running total for the
month, so today's cash is the difference"* — which is the model §19 rules out.
Entering the amount actually received rewrote the collected total **downwards**,
the derived instalment went negative, no trail entry was written, and the
earlier collection was gone with no trace. The first path wrote no trail entry
at all.

**G1b — the UI taught the model.** `payments.js` pre-seeded the amount box with
the month's collected total, the banner said *"Amount Paid below is the total
for this month and already holds what was taken"*, and the field's own hint read
*"The month's running total, not today's instalment alone"*. The handler was not
the only place the model lived.

**G2 — a first collection left no trail entry.** The new-record paths pushed
`amount: paidAmount` with no `partialPayments`, so the opening collection had no
date, method or collector of its own — `_cashEvents()` attributed it to the
record's own date and `ownOwner()` to a loose `collectedBy` field.

**G3 — Rule 1 breached on merge.** Both merge paths overwrote `method`, `date`,
`collectedBy` and `status` on a record already holding money.

**G3b — and the engine breached it too.** `applyPayment()` set
`p.method = o.method || p.method` unconditionally, so a month opened in cash and
topped up by bank transfer retroactively became a bank transfer, on the record,
on its row and on any receipt reprinted afterwards. Found by the new regression
test, not by reading.

### Tracked, deliberately not touched in this pass

**G4 — "Available Fund" is mixed-basis.** `calcProfit(key) = calcRevenue(key) −
calcExpenses(key)`: accrual revenue minus cash expenses, presented as one
number (§14). It appears in **seven** places — dashboard KPI, archive KPI and
yearly table, three in reports, students — all captioned "Revenue − Expenses",
so the formula is not a one-file change.

**G5 — no receipt identity.** One hand-over split across months is N unrelated
trail entries. Decision recorded above.

**G6 — generated charges are overwritten in place.** No `generated` snapshot;
the original figure is gone once changed, and only the ledger diff records that
it changed. Decision: snapshot at generation, freeze once money is held, carry
later changes in `p.adjustments[]`.

**G7 — month-domain functions live in a screen.** `_studentInPeriod`,
`_payMatchesMonth`, `_cashEvents` and `calcRevenue` are defined in
`modules/dashboard.js` and imported by reports, students and archive.

**G8 — no historical room or status.** There is no `roomHistory` and no
assignment event anywhere in the codebase. A student's current room overwrites
their August state in every report (§16). This must not be worked around by
inference — it needs a real historical assignment model.

**G9 — `_studentInPeriod()` falls back to `s.status === 'Active'`** when a
student has no join date. Selecting August must not make a student an August
student merely because they are Active today. Genuine historical-integrity
defect; belongs with G7.

**G10 — `saveDB()` is not atomic** (`storage.js`): a row-by-row upsert loop over
IPC, so a crash mid-loop leaves a partial write (§29). A real limitation, but it
deserves its own controlled persistence phase and was not touched here because
it does not affect the collection transaction being changed.

---

## 3. The principle

`payments.js` is a **client** of the financial engine, not a second engine:

    finance.js    single financial authority
        ↓         applyPayment / reversePayment / calculateRefund /
        ↓         calculateSettlement / calculateReportTotals
    ledger.js     immutable financial history
        ↓
    ownership.js  who collected, who may reverse
        ↓
    payments.js   UI and workflow only

Every collection in the app now posts through `applyPayment()`. There is no
other writer of `p.amount`.

---

## 4. Migration risk

None for this pass. No stored field changed meaning, nothing needs a migration,
and the legacy shapes (`p.amount`, `p.unpaid`, `partialPayments`, records with
no trail) all keep working. Records written before this change are read exactly
as before; only new collections are written differently.

---

## 5. Order from here

1. ~~Collection-path integrity~~ — done, this document.
2. ~~UI punch list~~ — done (#10 open, not reproduced).
2b. ~~Available Fund on one basis~~ — done, see below.
3. ~~Month-domain layer — G7, and G9 with it~~ — done, see below.
4. ~~Historical snapshots — G8~~ — done (Phase 5, `2b8c69c`).
5. ~~Bill immutability — G6~~ — done, see below.
6. ~~Persistence atomicity — G10~~ — done, see below.

~~Receipt identity (G5) lands with 3 or 5, whichever reaches it first.~~ — it
landed on its own, after 7. See below.

---

## Phase 3 — Available Fund is cash (2026-09-18)

G4 closed. One definition, in `modules/dashboard.js` beside the others:

    calcAvailableFund(key) = calcCashReceived(key) − calcExpenses(key)   cash
    calcEarned(key)        = calcRevenue(key)      − calcExpenses(key)   accrual

`calcCashReceived()` is already net of refunds and reversals — a checkout
refund goes through `reversePayment()` into `p.reversals`, and `_cashEvents()`
emits it as negative cash on the day it went out. No new data was needed.
`calcCashReceivedIn(list, key)` is the same definition over a given record set,
for the Annual Archive, which reads live + archived rows.

**Every site that said "Available Fund" now reads the cash figure,** and the
accrual one is stated beside it as "Earned": the dashboard KPI (chip In hand /
Short, sub-line "Earned Rs.X after expenses"), the dashboard month modal and its
PDF/Excel export, the Reports KPI + sparkline + detail cards + both exports
(all through `_rptTotals().net`), the Annual Archive KPI, summary and yearly
table, and the student monthly report ("Fund in hand"). The revenue-trend
tooltip's "Net" is renamed "Earned" — that chart plots billed months, so its
difference is accrual and should not look like it disagrees with the card.

There were twelve sites, not the seven the audit counted. `calcProfit()` had
no callers; it now aliases `calcEarned()`.

**Measured** on a month where the two bases differ (a last-month arrear
collected this month, a part-paid bill, a partial refund, expenses):
cash 19,000, billed revenue 9,000, expenses 4,000 → Available Fund **15,000**,
Earned **5,000** — identical on the functions, dashboard card, dashboard
export, Reports and the Archive month view. The Archive year view reads
15,000 / 15,000, which is correct: across the year the arrear and its
collection fall in the same period.

**Owner-visible change:** the Available Fund figure on existing installs will
move for any month with arrears collected, money paid ahead, or refunds —
that movement is the point. The Key Highlights "Profit" peaks stay accrual and
say so in their comment.

---

## Phase 4 — the month-domain layer (2026-09-18)

**G7 closed** (`7503623`). `calcRevenue`, `_cashEvents`, `calcCashReceived(In)`,
`cashBreakdown`, `calcExpenses` / `calcExpensesOnly` / `calcTransfers`,
`calcAvailableFund` / `calcEarned` / `calcProfit`, `_toMonthKey`, `_payMonthKey`,
`_payMatchesMonth` and `_studentInPeriod` moved verbatim from
`modules/dashboard.js` to `src/periods.js`, loaded after `finance.js` and before
every screen module. `tests/cash-events.test.js` now loads it with no screen at
all.

**G9 closed** (`00e0031`). An Active student with no join date is placed from
the earliest month their own records prove — `createdAt`, or the earliest month
billed to them — and with neither, counts for the current period onward only.
A non-Active student with no join date stays off, as before (callers already
list anyone with a fee record for the period). `tests/periods.test.js`, 7
tests; against the old rule the 4 G9 tests fail.

**Noticed, not touched:** a student whose status is Left, with a join date but
no `leftDate`, is on every period's roster from the join onward. Same family as
G9, but fixing it means deciding where their tenancy ended — that belongs with
G8, not here.

Also in this pass (`0d02260`): the Reports payment-method donut counted Paid
records only. It now counts every collection by the method on its own trail
entry, and its total equals `calcRevenue()`.

---

## Phase 6 — the bill as it was first raised (2026-09-20)

**G6 closed.** A record's charge fields are written in place, so the figure a
month was ORIGINALLY billed at was gone the moment a rent was corrected or an
extra added. The ledger records that it CHANGED — "Rent changed 8,000 → 9,000",
with a reason, a date and an account — but recovering the opening bill meant
replaying every entry on the record in order. "What did you charge me in
August?" is a question a hostel is asked directly.

`billSnapshot()`, `billFreeze()` and `billDrift()` in **`finance.js`** (§14).
`p.generated` is written ONCE by whichever path raises the record and never
rewritten — `billFreeze()` no-ops on a record that already has one, so it is
safe to call twice and from anywhere. Five creation paths write it:

    monthly-generate   generateMonthlyRents()
    add-payment        submitAddPayment()        — before applyPayment()
    student-panel      submitPaymentForStudent()
    admission          the re-admission form (students.js)
    excel-import       the spreadsheet importer (settings.js)

**It is not a second answer to what is owed.** Nothing asks the snapshot what a
month bills; `calculateBill()` and `outstandingOf()` remain the only
authorities, and the two disagreeing is the whole point of keeping it. Covered
by a test that asserts exactly that.

**Not backfilled.** Records raised before this have no snapshot, `billDrift()`
returns null, and the screens say nothing rather than guessing. Deriving one
from the ledger would state a figure the hostel never billed, on records whose
ledger is incomplete.

The Edit Payment sheet shows **"Billed when raised"** in its summary card, and
only on a record whose bill has actually moved; the hover names what changed,
when it was raised and by whom, and points at the ledger for the reasons.

Cover: `tests/finance.test.js` (+9, 79 total) and `tests/bill-snapshot.spec.js`
— generate, edit through the real form, collect, and a legacy record.

### `p.adjustments[]` was NOT built, deliberately

The decision recorded for this phase was "snapshot at generation, freeze once
money is held, later changes in `p.adjustments[]`". The first two are built.
The third is **already** in the student ledger: `_ledgerDiff()` posts every
charge change as an immutable `adjustment` entry carrying the part, the delta,
"Rent changed 8,000 → 9,000", the reason, the date, the account and a running
balance — and the main process refuses UPDATE and DELETE on that table.

A second array on the record would be a second answer to "how did this bill
change", which is the D-1 shape §14 exists to prevent. Flagged for the owner
rather than built. If he wants it, the honest form is a read-only accessor over
the ledger (`billHistory(p)`), not a new store.

### Noticed, not changed

Reopening the Edit form on a record holding NO money re-prices it from the
student's CURRENT rate — the `_own` rule in `showEditPaymentModal()`. So a rent
corrected on an unpaid record reverts when the form is reopened. That is the
documented intent (a bill follows the student's price until money is taken),
but it surprised this phase's test and may surprise a warden.

---

## Phase 7 — one save, one transaction (2026-09-20)

**G10 closed.** `saveDB()` walked the tables and awaited an IPC call **per
changed row**, then the settings, then the ledger. Every one of those is its own
implicit transaction, so a crash, a power cut or a licence refusal partway
through left part of a save on disk and lost the rest — a payment row written
while the student's balance was not, or money recorded with no ledger entry
behind it.

The renderer now builds ONE changeset (`_buildChangeset()` in `storage.js` —
the same diff the surgical save always computed, lifted out) and sends it on a
new `db:applyChangeset` channel. The main process applies the whole thing
inside a single `db.transaction()`: all of it lands, or none of it does.

**The ledger travels in the same transaction.** It used to be a separate call
after the rows, so a refusal there left money on disk with nothing explaining
it. `ledgerStore.append()` opens its own `db.transaction()`, which
better-sqlite3 runs as a SAVEPOINT when nested, so its append-only guard still
applies — and a refusal now takes the records down with it. `ledgerPending()` /
`ledgerMarkFlushed()` hand the queue to the save and are only cleared once the
transaction has committed.

**The gates run first, for every table, before anything is written** — the
licence, the database health, and the per-table write rules. A blocked table
refuses the save whole rather than committing the allowed tables around it.
`tests/licence-enforcement.spec.js` now covers the new channel, including that
a changeset carrying ONLY the activity log is still allowed during a lockout
(§18 keeps the audit trail recording).

**A refusal does not fall back.** `ok:false` is a decision and the transaction
has already rolled back; retrying down the `_saveDBFull()` path would rewrite
every table with `dbBulkReplace` and only THEN hit the same refusal, leaving on
disk exactly the records the refusal existed to prevent. The full rewrite stays
as the safety net for a broken channel, and the per-row path stays for an
installed build whose preload predates this.

Cover: `tests/save-atomicity.spec.js` — a save carrying record changes AND a
ledger entry that rewrites history is refused, and the database is read back
through `db:all` to prove the rename and the payment row never landed. Against
the same handler with the transaction wrapper removed the test fails with
"the student rename committed although the save was refused".

Measured on the same workload, changeset vs per-row:

    500 new rows    749ms -> 271ms
     50 changed     100ms ->  13ms
      1 changed       4ms ->   5ms

---

## G5 — one hand-over, one identity (2026-09-20)

**Closed.** A warden takes money across a counter once. If it clears an arrear
and pays the current month, that single act writes a collection on TWO records
— and nothing on either said they were the same hand-over. The student holds
one slip; the trail held N unrelated entries, and "show me everything on this
receipt" had no answer.

`newReceiptId()` in **`finance.js`**. A posting generates one id and every
collection it makes carries it on its own trail entry. Written only when the
caller names one, so a record collected by an older build carries no id rather
than a made-up one.

**It is not `p.receiptNo`.** That is the printed, human-facing number, assigned
lazily per RECORD the first time a receipt is printed (`receipt.js`). This is
assigned at COLLECTION time and groups the entries of one posting across
however many records it touched. A receipt reads the first; the trail reads the
second. `_ledgerPost()` prefers the posting id and keeps `receiptNo` as the
fallback, so nothing that used to be grouped by it stops being grouped.

One id per posting, at every site that collects:

    submitAddPayment()          the month on the form AND every arrear, one visit
    submitPaymentForStudent()   the same, from the student panel
    pfApplyOutstandings()       takes the CALLER'S id — generating its own would
                                give each arrear a separate hand-over
    payBulkMarkPaid()           one press settling N rows is one act
    markPaymentPaid() x2        the single-row paths
    submitEditPayment()         receiving the pending amount
    submitReversePayment()      money handed BACK is one act too
    confirmCancellation()       a checkout settles or refunds every month at once

`ledgerEntriesForReceipt(id)` reads one posting back out of the immutable
ledger. An empty id matches NOTHING on purpose: entries written before this
carry no posting, and they must not all group together as one enormous
hand-over that never happened.

**No table, no migration, no second authority** — the decision in §1. The id is
inert: a test asserts a collection stamped with one and a collection without
leave identical `amount`, `unpaid` and `calculateOutstanding()`.

Cover: `tests/finance.test.js` (+6, 85 total) and
`tests/receipt-identity.spec.js`, which drives the real Add Payment page —
arrears allocator included — and reads the posting back across both records.
Against the arrears path with the id removed it fails with "the arrear
collection carries no posting id".
