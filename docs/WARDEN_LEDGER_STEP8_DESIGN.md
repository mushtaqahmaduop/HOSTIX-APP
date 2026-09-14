# Warden Ledger — Step 8: concessions (spec §2.4, §3.9, §5 step 8)

Status: **BUILT 2026-09-15** — design approved by the owner ("approve and build step 8").
The two choices shown for confirmation went in as written: a decline needs a note, and
concessions start and end on whole months.
Owner answers: `WARDEN_LEDGER_SCHEMA_PROPOSAL.md` → §2.4 (Q11, Q12), feature decisions
(§3.9 approval from Users → Wardens) and "Step 8 decisions".

## What the code does today

- A concession is a number typed into a month record's **Concession** box on the payment
  forms (`p.concession`, `p.concessionDesc`). No approval; it covers that one month.
- The ledger already posts a `concession` entry whenever a record's concession changes.
- There is no standing concession, no request, no approval.

The free box **stays as it is** (owner). Step 8 adds **standing concessions** on top.

## The concession (new table `concessions`, mutable, like the handover tables)

| Field | Meaning |
|---|---|
| `id`, `studentId` | |
| `type` | `rent` \| `mess` \| `both` — which part of the month it reduces (mess and both only where the hostel serves mess) |
| `value` | whole rupees per month (**no percent** — owner) |
| `reason` | required |
| `startDate`, `endDate` | first day of the first month; last day of the last month, or empty for open-ended |
| `status` | `pending` \| `approved` \| `declined` \| `ended` |
| `requestedBy`, `requestedByName`, `requestedAt` | |
| `approvedBy`, `approvedByName`, `approvedAt` | set at once when an admin creates it |
| `decidedNote` | the decline note |
| `endRequest` | a waiting request to end it early: `{ reason, requestedBy, requestedByName, requestedAt }` or null |

Kept out of the append-only ledger (a request waits and can be declined), backed up with
the other tables, and a backup from before step 8 still restores (the table comes back
empty).

## Rules (`renderer/src/concessions.js`, unit-tested)

1. A **warden requests**; it does nothing until an **admin approves** (one tap). A decline
   needs a note. An **admin's own concession is approved at once**.
2. **Months covered**: every month from `startDate` to `endDate` (or onward).
3. **On approval**: each month record already generated inside the range that is **not fully
   paid** gets it now; each month generated later inside the range gets it when generated
   (`generateMonthlyRents`). **Paid months are never rewritten.**
4. **Applying to a month**: the record keeps a list of what standing concessions it carries
   (`p.concessionsApplied: [{ id, amount }]`). `p.concession` becomes *what was typed in the
   box* **plus** those amounts, so a hand-typed concession is never overwritten.
   `p.concessionDesc` names them. The ledger posts one `concession` entry:
   `Concession: −1,500 (financial hardship, approved by Admin)`.
5. **Cap**: a `rent` concession never takes more than that month's rent, `mess` more than its
   mess, `both` more than rent + mess; several together never take the month below zero.
6. **Ending early**: an admin ends it — `endDate` becomes the end of the current month, so it
   stops from next month; this month keeps it. A warden asks to end it and an admin approves,
   like mess exemptions.

## Screens

**Student panel** — a **Concession** action:

```
┌ Request a concession — Ali Khan ────────────────┐
│ Applies to  (•) Rent  ( ) Mess  ( ) Rent + Mess  │
│ Amount per month (Rs.) *  [ 1,500 ]              │
│ From month *  [ Sep 2026 ▾ ]  Until  [ — open ▾ ]│
│ Reason *  [ Financial hardship               ]  │
│                     [Cancel]  [Send request]     │
└──────────────────────────────────────────────────┘
```

The Financial tab lists the student's concessions — amount, part, months, status
(`Waiting` / `Active` / `Ended` / `Declined`) — with **End** (admin) or **Ask to end** (warden).

**Users → Wardens** — "Waiting for approval" gains a **Concessions** card beside Handovers and
Mess exemptions:

```
Concessions                 2 waiting
Student    Room  Asked by  Part  Rs./month  Months          Reason        
Ali Khan   A 01  Sara      Rent  1,500      Sep 2026 →      Hardship   [Approve] [Decline]
Bilal      B 03  Ali       End   —          ends Sep 2026   Paid up    [Approve] [Decline]
```

**Header bell** — admins see waiting requests; the warden sees the outcome.

## Files

- new `renderer/src/concessions.js` (+ `index.html`, `globals.d.ts`, `tsconfig.json`)
- `main.js` — `concessions` table: create, backup export/import, optional on restore
- `renderer/src/storage.js`, `renderer/src/utils.js`, `renderer/src/modules/modals.js` — the
  table in the load/save map, backups and new-install defaults
- `renderer/src/modules/payments.js` — `generateMonthlyRents` applies active concessions
- `renderer/src/modules/students.js` — panel action, request dialog, Financial tab list
- `renderer/src/modules/users.js` — Concessions card; `nav.js` — bell
- tests: new `tests/concessions.test.js`, `tests/concessions.spec.js`
