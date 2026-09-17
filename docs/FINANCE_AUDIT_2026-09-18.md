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
2. UI punch list (owner review 2026-09-17, items 7, 8, 10, 11, 15, 16).
3. Month-domain layer — G7, and G9 with it.
4. Historical snapshots — G8.
5. Bill immutability — G6.
6. Persistence atomicity — G10.

Receipt identity (G5) lands with 3 or 5, whichever reaches it first.
