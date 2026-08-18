# Counter-flow audit — 19 Aug 2026

Started from two bugs reported on the payment form, then walked the app page by
page against what a warden actually does at the desk. Everything below is a real
scenario, not a hypothetical.

Branch: `feature/custom-titlebar`. 30 tests across 14 spec files pass.
New specs: `tests/partial-and-arrears.spec.js`, `tests/audit-scenarios.spec.js`.
Part 2 (below) covers repairing the records already on disk and rebuilding the
Add Payment page to the owner's reference.

---

## The two reported bugs

### 1. A settled month blocked collecting the previous one

`submitAddPayment()` had a hard block: if the selected month already had a `Paid`
record it showed *"No duplicate allowed"* and **returned** — before any of the
arrears entered under **Receive Outstanding** were posted. So once August was
paid, July's balance could not be taken at all until September began. The money
was in the warden's hand and the app had no way to record it.

The block on double-charging *this* month is right; refusing money for an
*earlier* month is not. Arrears now post to the months they belong to and no
duplicate record is created for the settled month. If nothing was entered under
Receive Outstanding, the message now says where to enter it.

`renderer/src/modules/payments.js` — `submitAddPayment()`

### 2. A part-paid month opened as a blank slate

Select a student who had paid 4,000 of 14,500 and the form showed: Amount Paid
empty, Remaining 14,500, no sign the 4,000 existed. Worse, on save the merge path
did `record.amount = whatYouTyped` — a **replace**. Type the 10,500 balance and
the earlier 4,000 was destroyed: the student had paid in full and the app said
they still owed 4,000.

The form now loads the record for the selected month and says what it holds
("*August 2026 is part paid. PKR 4,000 collected so far, PKR 10,500 still
owing*"), seeds Amount Paid with what was already taken, restores the record's
admission fee / concession / extra lines so the merge stops wiping them, and
writes each instalment into `partialPayments` instead of overwriting one figure.

Also fixed on the way: the Summary panel counted the current month's own balance
as "outstanding from earlier months", showing the same debt twice.

`renderer/src/modules/payments.js` — `pfExistingForMonth()`, `pfLoadMonthContext()`,
`pfMonthChanged()`, `pfRenderLedger()`

---

## Found in the walkthrough

### 3. Every date was UTC — wrong for five hours a day  ⚠️ widest reach

`today()` and `thisMonth()` were `new Date().toISOString()`. Pakistan is UTC+5,
so **from 7pm every evening the app's "today" was yesterday** — and the evening
is when rent gets collected. Payment dates, receipt dates, leaving dates, the
activity log and backup filenames were all stamped a day early. A due date built
as "the 6th" came out as the 5th. On the 1st of a month before 5am, the month
selectors still offered the month that had just ended.

Fixed centrally with `ymd()` / `ym()` reading local calendar components, and 18
derived call sites across payments, students, cancellations, dashboard, settings,
storage and `main.js` moved onto them.

### 4. `Cancelling` students fell through every filter in the app  ⚠️

Putting a student on the cancellation list sets `status = 'Cancelling'`. Nothing
in the codebase ever **read** that status. For the three or four weeks until they
actually left:

- **Generate Monthly Rents skipped them** — their final month was never billed.
- **The Add Payment search could not find them** — so even manually, the warden
  could not take that month's rent or their arrears.
- Opening their **Edit Student** form and pressing Save silently flipped them
  back to Active (the status list had no `Cancelling` option, so the browser
  selected the first one) while the cancellation record stayed Pending.
- They appear in none of the four status cards on the Students page.

Added `isResident()` in `utils.js` — Active *or* Cancelling — and routed billing,
the payment search and the room-delete guard through it. The edit form now always
includes the student's own status. The status filter offers `Cancelling` when
anyone is on notice.

### 5. Generate Monthly Rents billed from a stale copy

It read `t.rent` / `t.mess` straight off the student, while every other screen
prices through `resolveCharges()` (student override → room type in Settings).
Two consequences: after a rent rise in Settings the Add Payment form billed the
new figure while the button pressed on the 1st for all 50 students kept raising
the old one; and a student with no pinned per-student rent — the normal case
since price moved into Settings — was **billed PKR 0**, a row that reads as
settled.

Now prices through `resolveCharges()`, and a student whose room type has no rent
configured is *skipped with a warning* rather than issued a bill for nothing.

### 6. Renaming a room never reached its payments

```js
r.number = newNum;            // written first
const oldNumber = r.number;   // read after → always equal
if (String(r.number) !== String(oldNumber)) { /* never runs */ }
```

The sync block had never executed. Renaming a room left every payment and
cancellation stamped with the old number forever, and the room filter on the
Payments page then matched nothing for that room. Also added the duplicate-number
guard Edit Room was missing (Add Room has always had it).

### 7. Boot-time student renumbering re-issued everyone's ID card  ⚠️

`migrateStudentIdsToNumeric()` renumbered **every** student by array position the
moment a *single* id didn't look like a code — one Excel import, one restored
backup, one legacy record was enough. The number printed on a student's ID card
and on their receipts became someone else's.

And it remapped `studentId` on payments, cancellations, room shifts, check-in and
fines — but **not on `DB.archive`**, where every payment older than seven months
lives. A renumbering re-pointed the older half of the ledger at whoever now held
that code.

Now: valid codes are kept exactly as they are; only ids that aren't codes, or
that collide with one already claimed, are reassigned, and they take the next
free number. The remap covers every table that stores a `studentId`, archive
included.

### 8. Receipts died at the seven-month line

`enforceDataRetention()` moves settled payments into `DB.archive`.
`buildReceiptHTML()` looked only in `DB.payments`, returned `null`, and
`printReceipt()` returned silently. A student asking for a duplicate of last
year's receipt got a **dead button with no message** — which is most of the point
of keeping receipts. Receipt lookup now searches the archive too, and a genuinely
missing record says so.

### 9. Money could be destroyed with no trace

`deletePayment()`, `deletePaymentFromStudentView()` and `markPaymentPaid()` wrote
nothing to the activity log, while every other money action did. On a shared
warden screen a receipt could be removed with nothing left to say it existed.
All three now log. `Generate Monthly Rents` logs too.

`confirmDeleteStudent()` also deletes every payment that student ever made —
rewriting months that were already closed and reconciled — behind the words
"delete the student record". The cascade is left as-is (it is the deliberate
"erase them" path, and marking a student *Left* is the soft one), but the dialog
now states the count and the amounts, points at the softer option, and the action
is logged.

### 10. Negative expenses, and settings lists that stranded records

- `submitAddExpense()` checked `if(!amount)`, which a **negative** passes. A
  minus-typo wrote a negative expense, which doesn't reduce spending — it adds to
  the month's profit. `submitEditExpense()` did `parseFloat(...) || e.amount`, so
  correcting an amount to 0 looked accepted and changed nothing. Both now require
  a figure greater than zero.
- Room types and floors have always refused removal while in use; **payment
  methods and expense categories did not**. Removing one left its records
  unreachable (both filters are built from these lists) and the edit modals,
  finding no matching option, rewrote the record's method/category on save. Both
  now refuse removal while records use them, and both edit modals keep a value
  that is already orphaned.

### 11. Smaller things

- Confirming a cancellation stamped `leftDate = today()`, not the vacate date —
  paperwork done on the 20th for a 31st move-out recorded the student as leaving
  eleven days early, and that is the date every historical report reads.
- `student.lastRoom = student.roomNumber` — students have no `roomNumber` field
  outside the restore flow, so it was always `''` and the Former Students list
  never showed which room anyone had. Now read from `roomId`.
- The student picker's rent column showed `t.rent` — "PKR 0" beside students
  charged 14,500. Now resolved like every other screen.
- `addExtraChargeRow()` keyed rows on `Date.now()`; restoring a saved record adds
  every row inside one millisecond, so they shared an id and the second row's
  remove button deleted the first.

---

## Not changed — decisions for you

1. **`saveDB()` failure is invisible.** It returns `false` on error, but all ~92
   call sites `await` it and then unconditionally toast success and close the
   modal. A warden records a payment, the write fails, the app says "Payment
   recorded", and the record is only in memory until restart. This is the single
   biggest remaining risk and it needs a decision on scope before touching that
   many call sites.
2. **Cancelling frees the bed immediately.** The UI says so explicitly ("*seat is
   immediately marked Vacant and available for new bookings*"), so it looks
   deliberate — but the room shows a free bed with nothing marking it as occupied
   until the vacate date. Worth a "vacating <date>" badge on the rooms page.
3. **Students-page cards don't sum.** Active/Left/Blacklisted exclude
   `Cancelling`, so they no longer add up to Total. Fixing means either a fifth
   card or changing what "Active" counts — a design call, and the KPI row order
   is deliberate.
4. **No cash-basis view.** "Collected this month" is revenue for the *billed*
   month: July rent handed over in August counts as July. Correct as designed and
   asserted by `month-name-mess.spec.js` — but there is no figure a warden can
   reconcile the cash box against at month end.

## Test harness notes

- Several specs don't wipe the DB in `beforeAll`, so `npx playwright test` in one
  go contaminates later specs with earlier fixtures (`month-name-mess` fails this
  way and passes alone). Runs above were per-file with a wipe between.
- `zz-boot-diag.spec.js` is a self-declared temporary spec ("delete after use")
  and fails on `#f-pamt`, a field the Add Payment redesign removed. Safe to
  delete.
- `settings-is-source.spec.js` needs `HOSTIX_REAL_PROFILE`; not set here.
- Copying `.devdata/license.enc` into a test profile no longer activates it —
  the machine id resolves differently under Playwright and the license reads as
  tampered. A profile-local license generated with the `keygen.js` scheme works.

---

# Part 2 — repairing the data, and the Add Payment redesign

## The damage already on disk

The bugs above did not only misbehave going forward; they left records behind.
Diagnosed read-only against the live database (98 payments, 55 students):

| What | Records | What it looked like |
|---|---|---|
| Mess counted twice | 8 | `monthlyRent` holds the pre-split all-in 14,500 **and** a 6,500 `messCharge` sits beside it. Add them up and the month reads 21,000 against a student who was billed 14,500. Now that the form loads a month's record and recomputes from it, that phantom 6,500 shows on screen as a balance nobody owes. |
| Mess ticked on a rent-only month | 2 | Rent half correct, mess line present and flagged included, but the total booked is rent alone. |
| Instalment trails that never happened | 21 | `partialPayments` totalling more than was ever collected — including two records that claim **two full collections on a month where nothing was collected**. The fingerprint of the replace-bug (§2) and a double-firing "clear the balance". |

### `repairPaymentComposition()` — runs at boot

Wired into `renderer/app.js` beside the existing `repairStudentSnapshots()`, so it
fixes this database *and* every one of the 50+ client installs carrying the same
drift. Silent on a healthy database.

**The contract: no money moves.** `amount` and `unpaid` are what was collected
and what is owed, and they are treated as fact. Only the *description* of how a
total was made up is corrected, and only where the record's own numbers prove
what the right description is. Verified against a copy of the live database:

```
before   sumAmount 1,082,600   sumUnpaid 54,100   sumBooked 1,136,700
after    sumAmount 1,082,600   sumUnpaid 54,100   sumBooked 1,136,700
repaired {drift: 8, messFlag: 2, students: 2, dupEntries: 4, ghostTrails: 4}
records that no longer describe themselves consistently: 10 → 0
```

What it will and will not touch:

- **Drift** — repaired only on the exact pre-split signature (`monthlyRent ===
  resolvedRent + mess`) *and* a booked total that matches the all-in
  composition. Puts the split rent back; the mess line stays where it is.
- **Rent-only months** — the tick is turned off where the booked total proves
  the mess was not billed. A student **every** one of whose mess-carrying months
  was billed rent-only is taken off the mess as well. That caught M. Haseeb Khan
  and, once the rule also counted months where a concession of exactly the mess
  amount cancels it, "Reserved By Asad" — the two you confirmed. Their ₨13,000
  stays uncharged, as you said it should.
- **Trails** — only what is provably false is removed: byte-identical duplicate
  entries, and every entry on a record where nothing has ever been collected. A
  trail that merely disagrees is left alone, because it cannot be reconstructed.

### The receipt stops printing a contradiction

17 records still carry a trail that disagrees after repair, and the receipt
printed that trail as its "Payment History" — a slip in a student's hand listing
₨29,000 of instalments under a ₨14,500 TOTAL RECEIVED. It now prints those under
**Recorded Instalments** with their own subtotal and a line saying the collected
figure above is the authoritative one. Nothing is hidden and nothing contradicts.

## Add Payment — rebuilt to the reference

Page body only; the sidebar and custom titlebar are untouched, as agreed.

- **Progress row** — three steps across the top. It is driven by the form, not
  fixed: step 1 closes when a student is picked, step 2 when there is money on
  the form (this month's box or a staged arrear). A stepper that always read
  "step 2" would be decoration pretending to be information.
- **Section headers** lose their numbers — the row above carries the sequence.
- **Receive Outstanding** moves from amber to the accent wash with a solid
  *Collect All*. It was amber to mark "not this month's money", which read as a
  warning about something wrong; the note under the heading says it in words.
- **Payment Summary** takes the solid accent header, and reads **one term per
  row** again. It had been folded into two columns to save height, which put
  Total Payable beside Amount Paid as though they were a pair.
- **Remaining Balance** becomes a solid bar. Accent while something is owed,
  green once the month is clear — the fill should not flatten that difference.
- The part-paid banner from §2 picks up the reference's blue info treatment and
  an ⓘ; the settled state stays green.
- The strapline is back, and the charge note is sentence-cased.

The reference's blue **is** this app's accent: `tokens.css` defines `--accent` as
royal blue (`#3b82f6`), despite its own header comment and CLAUDE.md still
describing the scheme as violet. Everything above uses `var(--accent*)`, so no
second accent was introduced — worth correcting those two stale comments.

Checked in light and dark. Screenshots: `.scratch-addpayment-redesign.png`,
`.scratch-addpayment-dark.png` (gitignored).

## Tests

30 tests / 14 spec files, all passing. `audit-scenarios.spec.js` gains a repair
test on synthetic data asserting the no-money-moves contract directly.
`payment-redesign.spec.js` had one assertion made case-insensitive — it pinned
the sentence casing of the charge note rather than its wording.
