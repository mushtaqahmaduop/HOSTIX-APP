# Owner review — 2026-09-16

Punch list from the owner's walkthrough of the 5.1.0 build, in the order given.
The owner is still reviewing, so this list grows.

Status: `todo` · `doing` · `done` · `answered` (a question, no code change)

| # | Screen | Item | Status |
|---|--------|------|--------|
| 1 | Students | "S/O" / "D/O" before the father's name does not show for some students | done |
| 2 | Students | Edit form has no gender, nationality, or document upload | done |
| 3 | Cancellations | Row action buttons lost their borders | done |
| 4 | Cancellations | Confirm button should be a centre-filled SVG | done |
| 5 | Payments | What does Reverse do? Amount goes back to pending | answered |
| 6 | Payments | Fit the toolbar dropdowns onto one line | done |
| 7 | Payments | Concession and extra charges need their reason stated under the figure | done |
| 8 | Payments | The +N% delta on Total Collected is hidden behind the trend bars | done |
| 9 | Payments | Partial vs Pending — which does a half-paid student get? | done |
| 10 | Expenses | Align the categories and the amounts | done |
| 11 | Expenses | "Handed by" should name the RECEIVER of the money | done |
| 12 | Rooms | KPI icons are coloured; every rebuilt screen is neutral | todo |
| 13 | Rooms | The Bulk Add button needs to be more visible | todo |
| 14 | All | KPI card heights should match the rooms page | todo |
| 15 | Rooms | The Occupied card should also state free seats, as a small label | todo |
| 16 | Complaints | The student field in the add form must be a search box | todo |
| 17 | Complaints | In Add Maintenance, move the student field up beside the issue title | todo |

---

## Decisions taken with the owner, 2026-09-16

**#9 — Partial vs Pending.** The three states are not overlapping and the row
badge is right: `Pending` = nothing collected, `Partial` = something collected
with a balance remaining, `Paid` = settled. The bug is the KPI card, which
counts every student who still owes (partial payers included) but, when
clicked, filters to `status === 'Pending'` and so shows fewer rows than it
counted. **Decision: the card becomes "Still owing" and both counts and filters
Partial + Pending.** The row badge keeps the finer distinction.

**#12 — KPI icons are NEUTRAL everywhere.** The spec reserves colour for state,
and the six rebuilt screens already follow it. Rooms is changed now rather than
waiting for its own stage.

**#10 — The 2026-09-10 "centre every value" ruling is REVERSED for the
registers.** Centring is what made the columns ragged: a column of chips of
different widths shares no edge at all, and centred money loses the alignment
that makes money scannable. Text, dates, chips and names read from the left;
money and counts read from the right with tabular figures; every header follows
its own column. The thousand-separator half of that ruling is untouched, and
the exports already align by column type, so they need no change.

**#14 — The rooms card height is the standard.** The other pages change to
match it, which means the shared `.ui-stat` height moves and every rebuilt
screen moves with it.

---

## #5 — What Reverse does (answered, no code change)

Reverse is not Delete. Delete removes the record and everything it says.
Reverse records that money LEFT THE DRAWER AGAIN: it writes an entry into
`p.reversals` carrying the reason and who did it, leaves the original
collection in the audit trail untouched, and `dashboard.js` counts it as cash
out on the day it happened.

So the balance going back to pending is correct and deliberate — you collected
Rs. 5,000, you reversed it, the student owes it again. It is for a bounced
transfer, a miscounted note, or money physically handed back.

**If the warden simply typed the wrong figure, the right control is Edit, not
Reverse** — Reverse would leave a false collection and a false refund in the
trail where there was only ever a typo. `renderer/src/modules/payments.js`
around `showReversePaymentModal()` states this; the modal should probably say
it too, and that is worth deciding once the list is worked through.

---

## #1 — Why S/O and D/O go missing (root cause)

Three gaps that only bite together:

1. `students.js` prints the prefix from `t.gender`, falling back to
   `_stuDefaultGender()`. With neither, it prints the father's name bare rather
   than guessing a prefix — which is the right call on its own.
2. **The edit form cannot set a gender.** Its identity section holds name,
   father's name, CNIC, course, status and join date, and nothing else. The ADD
   form has gender, date of birth, marital status and nationality; edit has
   none of them. So a record that arrived without a gender can never be given
   one. (This is item #2.)
3. `_stuDefaultGender()` reads `DB.settings.hostelGender`, which is **written
   only by the onboarding wizard**. An install that skipped onboarding, or one
   that predates the field, has it unset — so the fallback never fires either,
   for any student.

Fixing #2 fixes this going forward. Making `hostelGender` editable in Settings
fixes the whole existing roster at once, which is why both are in the same
commit.
