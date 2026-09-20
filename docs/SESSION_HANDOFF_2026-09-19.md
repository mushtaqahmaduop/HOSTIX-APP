# Session handoff — 2026-09-19 / 20

Branch **`design/dashboard`**, tree clean apart from untracked scratch
(`tests/tmp-*.spec.js`, `.shots/`). Nothing pushed — 35 commits ahead of
`origin/master`.

Continues `docs/SESSION_HANDOFF_2026-09-18.md`. That file's "phases still to
run" list is **stale from Phase 3 onward**; this one supersedes it.

## What landed

| Commit | What |
|---|---|
| `31264f5` | Reports: the tab strip leads the page (owner: "move the overview and revenue and payments strip above all") |
| `2b8c69c` | **Finance Phase 5 / G8** — stays: who lived here, when, in which room |
| `e799c81` | Reports page + its exports report the period's residents, in the rooms they had then |
| `31703b8` | Same for the dashboard month window, its export, and the Annual Archive |
| `9a7fbf2` | Same for the students monthly PDF |
| `ce91fb9` | **Available Fund is revenue − expenses again** — owner reverses Phase 3 |
| `2d56c9d` | Edit Payment: the pending amount is this record's, not the last form's |

## Phase 5 — stays (`renderer/src/periods.js`)

A student record holds the PRESENT: one room, one status. Every historical view
needed the past, so they all printed **today's** roster in **today's** rooms
under a heading naming a past month.

No new table and nothing guessed — the history was already on disk as dated
events and was simply never read as history:

    joinDate / leftDate     the stay's two ends
    DB.roomShifts           every move between rooms, dated, from → to
    DB.cancellations        a confirmed departure's vacateDate
    s.pastStays             a finished stay, frozen at re-admission

`studentStays(s)` rebuilds the stays from those. `studentRoomAt(s, date)` walks
the room shifts; `studentRoomIn(s, key)` answers for a period (falling back to
the room the period's own bill — live **or archived** — was raised against);
`studentInPeriodInfo(s, key)` gives the room at the end of their time in the
period plus `joined` / `left` flags. `_studentInPeriod()` reads the stays.

**Where a record is silent, the rule is stated, not invented:**

* no join date → `createdAt`, or the earliest month billed (audit G9); a
  resident with neither counts for the current period onward only
* left, no `leftDate` → the confirmed cancellation's vacate date, else the end
  of the last month billed, else the end of the month they arrived
  (owner, 2026-09-18: "yes stay ended")

**`studentCloseStay(s)` is THE ONE WRITE** — call it *before* joinDate,
leftDate or roomId change for a new stay. Three write sites were destroying
history and now do not: re-admission overwrote joinDate and blanked leftDate;
Left/Blacklisted set in the edit form got no leftDate; a restored cancellation
kept its leftDate.

**Left open, filed here:** a student whose status is Left with a join date but
no `leftDate` was the G9 family; it is now closed by the rule above. What is
NOT closed: Blacklisted carries no date at all, so the Reports tile for it says
"On record today" rather than pretending to be a figure for the period.

## Available Fund — Phase 3 reversed

Owner, 2026-09-19: *"now what you did with the available fund, it shows now an
amount I don't have: it should be as revenue − expenses"*.

Phase 3 had made it cash received − expenses. Cash counts an arrear collected
this month for last, and money paid ahead for next — neither is this month's
revenue. `calcAvailableFund()`, `_rptTotals().net` and the archive's net are
**revenue − expenses**, and every site Phase 3 moved follows. The duplicate
"Earned" sub-line and the "(cash)" labels are gone.

**Unchanged on purpose:** `calcCashReceived()` and `cashBreakdown()`. The
Advance / Arrears drawer reconciliation is what cash is for.

## The owner's Add / Edit Payment punch list (`44.png`) — all 10 done

The screenshot is the **Edit Payment** modal, not Add Payment.

| # | Item | Where |
|---|---|---|
| 1 | No pending amount though 4,000 of 8,000 is paid | `2d56c9d` |
| 2 | "Full pending" is locked | `2d56c9d` — same cause |
| 3 | Search bar more vivid / visible | `0017dde` |
| 4 | The small grey lines under the headings are too dim | `0017dde` |
| 5 | The form opens awkwardly | `0017dde` |
| 6 | "Receiving money field is very small" | `0017dde` — 103px → 204px |
| 7 | Payment type changeable on a record holding money | `0017dde` — locked |
| 8 | "Crowded and looking as a slop" | `edea6fb` — partly; see below |
| 9 | "No refund strategy there" | `617e306` |
| 10 | Recent payments shows no instalment history | `0017dde`, fixed again in `617e306` |

**1 and 2 were one bug.** `_pfAlready` is module state holding what the selected
month has already collected. The ADD form writes it; the EDIT form never did,
and keeps its own copy in the hidden `f-ppaid`. After any Add Payment form had
run, the collection was subtracted twice. Reproduced exactly, down to the
"Rs. 1,000 over what is outstanding" note.

**Owner's rulings taken this session**, for the record:

* the payment type is **locked once the record holds money** (nothing reads
  `f-ptype` on save — the mess decision is the hidden `f-pmess-on` — so this is
  display-only)
* a refund is **recorded against this month, through `p.reversals`**. The entry
  point on the Edit form calls the SAME `reversePayment()` the row menu does.
  There is no second refund engine and there must not be one.
* the hint lines were **too dim**, not unwanted — keep the wording, raise the
  contrast

**Item 8 is only part done, and the rest is the owner's call.** Measured on a
1440x860 window: the sheet is now 1,034px of content in a 661px modal body
(was 1,183). The remaining fat is the **Student information card, 241px**
restating the name, room and status that the sheet's own title bar already
carries. Trimming it to the identity strip plus the phone is worth about 120px
more — but it is his screen, so ask before deleting fields from it.

## Known-failing at HEAD, NOT caused by the above

`tests/ownership.spec.js` — "collected money is locked, and only its collector
or an admin may change it": a held record's `method` reads **Cash** where the
test expects **JazzCash**, i.e. editing the bill appears to rewrite the
recorded payment method. Verified failing with and without `2d56c9d`. It
matters beyond the test: the payments-by-method donut and the method register
both read `p.method`. Not diagnosed.

`tests/handovers.test.js` — 2 of 14 fail about one run in five, before and
after Phase 4. Not investigated.

## Running the tests

    HOSTIX_TEST_PROFILE=C:\Users\PCS\HOSTIX-testprofile
    NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=2"
    npx playwright test <6-8 spec files at a time — more and the worker OOMs>
    node --test tests/finance.test.js tests/periods.test.js …

The profile must hold a `license.enc` or every spec times out at `#login-input`.

## Next

The punch list is done bar the Student-information question in item 8.
Then finance **Phase 6** (bill immutability: `p.generated` snapshot frozen once
money is held, later changes in `p.adjustments[]`) and **Phase 7** (`saveDB()`
atomicity). One phase at a time, report after each.

## 2026-09-20 — the second punch list

| Item | Result |
|---|---|
| Chase the `method` defect in ownership.spec.js | **No defect** — stale test, `bc9ab79` |
| Features in the code not visible in the UI | Audited; see below |
| Move Payments' Export button right | `bc4020a` (Rooms too) |
| PDF + Excel inside one Export button everywhere | `bc4020a` — 4 screens converted |
| The payment PIN "not visible / can't apply" | **It works** — see below |
| No date of admission / date of payment | `bc4020a` — two new sortable columns |

### The `method` defect was not a defect

Traced in the running app: the bill is raised as Cash, Sara collects Cash,
Ali collects JazzCash — and `p.method` stays **Cash** throughout, with the
trail reading `5000:Cash, 3000:JazzCash`. That is §14 Rule 1, closed in
`2d770c9`: the record's method is the collection that OPENED it, and each
later collection carries its own method on its own trail entry, which is where
a receipt reads it. The test was last touched 40 commits BEFORE that fix and
still expected the old restamping behaviour. **My note in `2d56c9d` calling
this a `method` defect was wrong.**

### Unreachable code audit — nothing is actually lost

1,438 functions across `renderer/`; **40 are never referenced anywhere but
their own definition**. Every one that looked like a user-facing entry point
was checked by hand, and they are all **superseded dead code**, not features
hidden from the UI:

| Orphan | Superseded by |
|---|---|
| `addPaymentMethod`, `addFloor` | `cfgAddPrompt()` / `cfgAdd()` — the generic adder. The old pair reads `#new-pm` / `#new-fl`, which no longer exist |
| `saveRoomTypes` | `_rtTouch()` + auto-save |
| `showVacantRoomsModal`, `showOccupiedRoomsModal` | the Rooms page's own All / Occupied / Vacant filter |
| `addStudentExtraChargeRow`, `getStudentExtraChargesData` | the Add Student form no longer has `#student-extra-charges-list` |
| `showBackupRestorePage` | backup is a page now (`renderBackupPage`) |
| `exportMonthCSV`, `downloadArchiveCSV` | the Excel exports |
| `sendBackupToGmail`, `sendBackupToDrive` | stubs — both just call `exportBackup('json')` |
| `calcProfit` | an alias of `calcEarned()` with no callers |

**Conclusion: no built feature is unreachable.** Deleting the 40 is a worthwhile
cleanup but it is its own phase, not a side-effect of a UI pass.

Caveat on the method: a function named only inside a COMMENT still counts as
referenced, so the true orphan count is slightly higher —
`_dashOccupancyOverview()` is retired but survives the scan that way.

### The payment PIN works

Driven end to end: **Users → Edit user → Role & access → "Require PIN to post
payments"**. The switch is present and visible, saving sets `pinRequired`, and
the next collection is gated — `markPaymentPaid()` stopped at Rs. 0 with the
`pin-layer` asking for it. The account sets its own PIN the first time it is
asked; an admin can only CLEAR one, never read or choose it.

So this is a "where is it" problem, not a broken feature. It was deliberately
**not** duplicated into Settings: a second switch would be a second answer to
"does this account need a PIN". Ask the owner where he looked before adding a
pointer there.

### The two new date columns

* Students → **Admitted**, sortable, from `joinDate`. The roster carried no date
  at all for someone still living here: `statusDateNote()` under Status only
  speaks for a student Leaving or Left.
* Payments → **Paid on**, sortable — the day money LAST came in.
  `payLastCollectedOn()` reads the latest date on the instalment trail; it is
  not a new figure. A record that has collected nothing shows an em dash.

Both use `fmtDateShort()`, which drops the year when it IS this year. With the
full date, Paid on ran 106px and pushed the payments table 39px past the 1366
floor, clipping Actions. Measured after: 1070px table in a 1070px wrap.

## Dead-code cleanup (2026-09-20, `63459ec`) — 40 removed, 22 left for the owner

The scan counts a function dead only when its name appears nowhere in the
repo's CODE but its own declaration. Two refinements matter, and the earlier
orphan audit in this file got both wrong:

* **comments are stripped first** — `_dashOccupancyOverview` is named only in a
  comment saying it is "retired, not deleted", which is not a call site;
* **`.md` is excluded** — the orphan table in this very handoff names these
  functions, which made every one of them look used.

Two dispatch sites take a function name as a string (`command-palette.js`, and
`_dashRowAct` in `dashboard.js`). Both are called with literals written in the
source, so a text scan does see them. Checked before deleting anything.

**Removed (40):** orphaned wrappers whose target is still called by its own
name; stubs that promise what they do not do (`sendBackupToGmail` and
`sendBackupToDrive` both just call `exportBackup('json')`); the four config
adders superseded by `cfgAddPrompt`/`cfgAdd` (the old ones read `#new-pm`,
`#new-fl`, `#new-ec`, which no longer exist); and unused helpers.

### The 22 left, and why

These are the ONLY implementation of a feature with no way in. Deleting them
is a product decision, not a cleanup — git keeps them either way, so nothing is
lost by leaving them until the owner rules.

| Feature with no UI | Functions |
|---|---|
| Bill splitting | `calcBillSplit` (60L), `saveBillSplit` |
| Fines | `payFine`, `deleteFine` |
| Notices | `deleteNotice` |
| Check-in log | `saveCheckin`, `deleteCheckin` |
| Inspections | `deleteInspection` |
| Maintenance (settings copy) | `saveMaintenance` |
| Warden photo upload | `handleWardenPhoto` (41L), `removeWardenPhoto` |
| Add Student documents | `asfDocLoad` (69L) |
| Extra charges at admission | `addStudentExtraChargeRow`, `getStudentExtraChargesData` |
| Reset All Data | `resetAllData` (34L) — destructive, and no button reaches it |
| Licence settings window | `openLicenseSettingsWindow` |
| Checkout settle cell | `cancSettleCell` |
| Dashboard occupancy panel | `_dashOccupancyOverview` — comment says retired |
| **Dashboard month dialog** | `showMonthDetailModal` — see below |
| Misc helpers | `safeOpenWindow`, `toggleOccField`, `_getSession` |

### The month dialog has no way in

Removing `calPopSelect` (a dead calendar-popover wrapper) orphaned
`showMonthDetailModal`. It was ALREADY unreachable — `navigateToMonth()`, which
the sidebar calendar calls, only re-filters the page it is on; it never opens
the dialog. The wrapper's removal just made the chain visible.

This matters because that dialog is a real, finished screen — a month's fee
records, its expense register, and an Export control that `bc4020a` converted
to the combined menu. **Either wire it up or retire it**; it should not sit
there finished and unopenable.
