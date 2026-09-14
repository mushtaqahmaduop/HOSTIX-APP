# Warden Ledger — Step 7: mess display fix and mess exemption (spec §3.6, §2.6, §5 step 7)

Status: **BUILT 2026-09-14** — design approved by the owner ("approve and commit sidebar
with step 7"). The two choices shown for confirmation went in as written: a decline needs
a note, and the warden's bell carries the outcome.
Owner answers: `WARDEN_LEDGER_SCHEMA_PROPOSAL.md` → "Step 7 decisions" (and §2.6 / Q14,
feature decisions second round).

## What the code does today

| Surface | "Rent + mess together" hostel today |
|---|---|
| Edit Payment form (`showEditPaymentModal`) | Two inputs — **Room rent** and **Mess charges** ("Included for every student"). |
| Student row "Add Payment" modal (`showAddPaymentForStudent`) | Two inputs — **Room Rent** and **Mess Charges**. |
| Add Payment page, line 01 (`pfPaintCharge`) | One figure, but the note spells the split: "Mess included — Rs. 10,000 rent + Rs. 7,000 mess". |
| Admission form, room shift form | Already one "Monthly charge". |
| Settings → Rent & Mess | Rent and mess per room type, and a per-student override table. **Stays split** (owner). |
| Billing (`resolveCharges`, `generateMonthlyRents`) | Mess billed to every student; no exemption exists. |

## Part A — one combined field in a bundled hostel

Only when `serviceModel() === 'rent_mess_bundled'`. Optional and rent-only hostels
are unchanged.

- **Edit Payment**: one input **"Rent + Mess (PKR)"** holding rent + mess. Behind the
  scenes the record keeps both halves: mess stays the record's `messCharge`, and rent
  is the combined figure less that mess. An exempt student's record shows rent only.
- **Student Add Payment modal**: the same single input.
- **Add Payment page**: the line-01 note says "Rent + Mess" with no split.
- Receipts, registers and exports already say "Rent + Mess" (step 4 fixes).

```
Monthly charge (PKR)
[ Rent + Mess (PKR)  17,000 ]   [ Amount paid  8,000 🔒 ]
```

## Part B — mess exemption

### Data (on the student record — schema §2.6, Q14: no start date field)

| Field | Meaning |
|---|---|
| `messExempt` | `true` while exempt |
| `messExemptReason` | the approved reason |
| `messExemptApprovedBy` / `messExemptApprovedByName` / `messExemptApprovedAt` | who approved it |
| `messExemptRequest` | the pending request, or `null`: `{ kind: 'start' \| 'end', reason, requestedBy, requestedByName, requestedAt }` |

Every request, approval and decline is also written to the activity log.

### Rules (`renderer/src/messExempt.js`, unit-tested)

1. Offered **only in a "Rent + mess together" hostel**. Elsewhere an existing flag is
   kept but ignored by billing.
2. A **warden** requests start or end, with a reason (required). One pending request
   per student.
3. An **admin** (Manage users) approves or declines. A decline needs a note. An admin's
   own request is approved at once.
4. **Start approved**: `resolveCharges()` bills rent only from now on
   (`messBilled = 0`), so generated months are rent only. The **current month's**
   record, if not fully paid, has its mess taken off now — `messIncluded = false`,
   balance recomputed, and a ledger adjustment reading
   `Mess exemption: <reason>`. Paid and older months are untouched.
5. **End approved** (also warden request → admin): mess is billed again from the next
   generated month; the current month is not re-billed.
6. Step 6 is respected: the adjustment is a bill change made by an admin approval, so
   it needs no extra reason beyond the exemption's own; collected money is never
   touched.

### Screens

**Student panel** (header actions): a chip `Mess exempt` when exempt, `Exemption requested`
while pending; an action **Request mess exemption** / **Request end of exemption**
(warden) or **Exempt from mess** / **End exemption** (admin, immediate).

```
┌ Request mess exemption — Ali Khan ─────────────┐
│ Mess Rs. 7,000/month stops once an admin        │
│ approves. This month's unpaid bill drops too.   │
│ Reason *  [ Medical — doctor's diet plan      ] │
│                      [Cancel]  [Send request]   │
└─────────────────────────────────────────────────┘
```

**Users → Wardens** — "Waiting for approval" gains a second list under handovers:

```
Mess exemptions            2 waiting
Student       Room   Asked by  Request  Reason           
Ali Khan      A 01   Sara      Start    Medical diet     [Approve] [Decline]
Bilal         B 03   Ali       End      Back on mess     [Approve] [Decline]
```

**Header bell**: admins see "Mess exemption requested — Ali Khan (by Sara)"; the warden
sees the outcome, like handovers.

**Settings → Rent & Mess**, per-student table: an exempt student's Mess cell reads
"Exempt" (read-only there — the exemption is changed through the request flow).

## Files

- new `renderer/src/messExempt.js` (+ `index.html`, `globals.d.ts`, `tsconfig.json`)
- `renderer/src/utils.js` — `resolveCharges()` honours `messExempt` in a bundled hostel
- `renderer/src/modules/payments.js` — Edit form and student modal combined field;
  line-01 note
- `renderer/src/modules/students.js` — panel chip + actions + request dialog
- `renderer/src/modules/users.js` — exemption queue in the Wardens view
- `renderer/src/modules/nav.js` — bell alerts
- `renderer/src/modules/settings.js` — "Exempt" in the override table
- tests: new `tests/messExempt.test.js`, `tests/mess-exemption.spec.js`
