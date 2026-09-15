# Warden Ledger — Step 9: prorated charging (spec §2.5, §3.10, §5 step 9)

Status: **BUILT** — approved by the owner 2026-09-15 ("Proceed to 9").

Build notes beyond the design, each following from it:
- Days can not exceed the days in the month being charged.
- A month already charged by days reopens on Add Payment as By days, with its
  own days and rate, so collecting more for it does not quietly turn it back
  into a full month.
- Edit Payment shows a by-days month's own rent (not the student's current
  price), so opening it and pressing Save does not un-prorate it.
- Settings → Rent & Mess changes, a room type's rent change and a room shift
  leave a by-days month's charge as it is.
- Tests: `tests/prorate.test.js` (7), `tests/prorate.spec.js` (1).
Owner answers: `WARDEN_LEDGER_SCHEMA_PROPOSAL.md` → Q13 and "Step 9 decisions"; feature
decision §3.10 (post the charge entry **and** set that month record's rent).

## What the code does today

- Every month is billed whole: rent + mess from Settings (`resolveCharges`), whether a
  student joined on the 1st or the 25th.
- Admission opens the Add Payment page for the new student; line 01 "Monthly charge" is a
  read-only figure.
- There is no daily rate anywhere.

## Part A — the daily rate (Settings → Rent & Mess)

One hostel-wide figure, `settings.dailyRate` (whole rupees), under the room-type rates:

```
Daily rate for part-month stays (Rs.)  [ 700 ]
A suggestion for "By days" on Add Payment — it covers rent + mess together.
Changing it never changes a month already charged.
```

## Part B — By days on Add Payment, line 01

```
01 Monthly charge*        [ Full month | By days ]
   By days →  Days [ 16 ]   Rate/day [ 700 ]                 + 11,200
              Prorated: 16 days @ 700/day
```

- **Opens on Full month** every time (owner). Pressing **By days** shows two editable boxes:
  - **Days** — defaults to the days left in the month being charged, **join day
    included**: from the student's join date when it falls in that month, otherwise from
    today (or the 1st, for a past month); never more than the month's days.
  - **Rate/day** — defaults to `settings.dailyRate`; empty when none is saved.
- The total, days × rate, replaces the monthly charge on line 01 and in the receipt stub,
  live as either box changes. Admission fee, extras, concession and the amount paid work
  as before.
- In a mess-optional hostel the Rent + mess / Rent only switch is set aside while By days
  is on — the daily rate is the whole charge (owner).
- Both boxes must be whole numbers above zero to post.

## What is saved

- The month record's **rent becomes days × rate** (`monthlyRent`), its mess is kept but
  not billed (`messIncluded: false`), and it remembers what was used:
  `prorate: { days, rate }`.
- The ledger `charge` entry reads **`Prorated: 16 days @ 700/day = 11,200 · September 2026`**
  — the numbers actually used, even when they differ from Settings. If the month already
  had a full charge (generated earlier), the change posts as an adjustment with the same
  wording.
- The next month is generated whole as usual — billing resumes on its own.
- The receipt's Fee Breakdown line reads **Prorated (16 days @ 700)** instead of
  Rent + Mess.
- **Edit Payment** shows "Prorated: 16 days @ 700/day" under the charge. Changing the
  charge there turns the month back into an ordinary charge (the `prorate` note is removed,
  and the step-6 reason rule applies if money is held).

## Files

- `renderer/src/modules/settings.js` — the daily rate field
- `renderer/src/modules/payments.js` — line 01 switch, Days / Rate boxes, totals, submit;
  Edit Payment note
- `renderer/src/ledger.js` — the charge / adjustment wording from `prorate`
- `renderer/src/receipt.js` — the Fee Breakdown label
- tests: `tests/prorate.test.js` (days counting, ledger wording), `tests/prorate.spec.js`
