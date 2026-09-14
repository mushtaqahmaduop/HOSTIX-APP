# Warden Ledger — Step 6: amount lock and ownership (spec §3.2, §5 step 6)

Status: **BUILT 2026-09-14** — design approved by the owner ("ok lock and proceed"),
which also answered the open question: method, month and payment date lock once
money is collected.
Owner answers: `WARDEN_LEDGER_SCHEMA_PROPOSAL.md` → "Step 6 decisions".

## What the code does today

| Surface | Today |
|---|---|
| Edit Payment form (`showEditPaymentModal` / `submitEditPayment`) | Amount paid editable by anyone with `payments`; lowering it posts an `adjustment` "Amount collected changed", raising it adds an instalment. Bill fields editable; the ledger reason is automatic ("Edited on the payment form"). Delete button in the footer. |
| Payments row ⋮ (`payRowMenu`) | Edit, Print receipt, Reverse a collection (when money > 0), Delete — for anyone with the permission. |
| Reverse a collection (`showReversePaymentModal`) | Up to everything collected on the record, whoever collected it. |
| Delete (`deletePayment`, `deletePaymentFromStudentView`, `deleteMonthPayment`) | Allowed with `delete`; the ledger keeps the entries and posts a cancelling adjustment. |
| Dashboard month modal (`editMonthFeeField`) | The Paid cell is click-to-edit — it overwrites `amount` directly. |
| Student panel ledger ⋮ (`stuLedgerMenu`) | Mark paid, Print receipt, Edit, Delete. |
| Enforcement | Screens only; the main process locks ledger rows (schema Q4). No session in main. |

## The rules

1. **Who owns a record's money.** The owner is the account of the *latest*
   `payment` entry on the record (the receipt's "Collected by"). Imported
   history has no account, so only an admin may change it.
2. **Admin** = an account with Manage users (`canDo('users')`).
3. **Amount paid** is read-only once the record holds money — for everyone.
   A record holding nothing keeps the field (typing there is a collection by
   the signed-in person, as today).
4. **Edit** (bill fields, notes, due date): owner or admin. If any charge
   changed, Save asks for a reason; the ledger adjustment carries it.
5. **Reverse**: a warden up to *what they collected* on the record, net of what
   they already reversed, and only from money still **pending handover**. Money
   in a waiting handover → "Take back your handover first". Approved money →
   admin only. An admin may reverse any amount.
6. **Delete**: only when the record holds no money. Otherwise: "Reverse the
   collection first".
7. **Everyone still sees** every record, receipt and ledger line.
8. **Method / month / payment date** — open question; recommended: locked once
   money is collected.

Every rule is checked twice: the button is disabled with its reason, and the
submit function refuses on its own (a stale modal or a console call cannot
get past it). Rules live in one place — `renderer/src/ownership.js` —
unit-tested in the vm sandbox like `ledger.test.js`.

## Sketches

Edit Payment, record holding 15,000 (Sara collected, Ali signed in):

```
┌ Edit Payment — Ali Khan ──────────────────────────────────────┐
│ ⓘ Collected by Sara. Only Sara or an admin can change it.     │
│   Everything below is read-only.                              │
│ Room rent [10,000]  Mess [7,000]  Amount paid [15,000] 🔒      │
│   To add money: Add Payment · To take money back: Reverse     │
│ …                                                             │
│                              [Close]                          │
└───────────────────────────────────────────────────────────────┘
```

Same form, Sara (owner) or an admin, bill changed:

```
│ Amount paid [15,000] 🔒                                        │
│ Reason for changing the bill *  [ Mess stopped from 10th   ]  │
│              [Cancel]  [Delete — disabled: holds money]  [Save]│
```

Row ⋮ for a non-owner:

```
  Edit payment            (view only)
  Print receipt
  Reverse a collection    disabled · Collected by Sara
  ─────
  Delete payment          disabled · Reverse the collection first
```

Reverse a collection, Ali on a record with Sara 5,000 + Ali 3,000:

```
  Collected on this record    8,000
  You collected               3,000   (pending handover)
  Amount to reverse [ 3,000 ]  max 3,000
  Reason *  [ ............ ]
```

Dashboard month modal: the Paid cell is plain text (no click-to-edit).

## Files

- new `renderer/src/ownership.js` (+ `index.html` script tag, `globals.d.ts`)
- `renderer/src/modules/payments.js` — Edit form, submit, row menu, reverse
  modal/submit, both deletes
- `renderer/src/modules/dashboard.js` — month modal Paid cell, delete
- `renderer/src/modules/students.js` — ledger ⋮
- `renderer/src/ledger.js` — `ledgerCollectedOnRecord(recordId, accountId)`
- tests: new `tests/ownership.test.js`; Electron spec `tests/ownership.spec.js`
