# Handoff — §14 has a financial layer, and money stopped disappearing

**Date:** 2026-09-06 · **Branch:** `feature/dashboard-1c`
**Committed:** `213ba19` (the layer), `86d3b27` (the wiring), `575d341` (the two
screens), `4f76bfc` (reports onto the authority), `b88e862` (four dashboard
defects the owner reported)
**Gate:** Playwright **113 passed / 2 skipped / 0 failed** (all 45 spec files, batched) ·
node suites **324 passed / 0 failed** · typecheck **0 errors**

Continues `SESSION_HANDOFF_2026-09-05-dashboard.md` §7 item 3. The owner chose
the full scope: the layer, a reversal UI, and checkout settlement.

---

## 1. Read this first

`docs/ENTERPRISE_LIVE_STATUS.md` is still the authoritative state document
(spec §31) and is current through `4f76bfc`. Its three §14 rows are now closed,
and it has a new **Open Questions** section — read that before touching any
arrears total.

**One contradiction in that file is older than this session and was left alone:**
its "How to read this" block still says D-4 is "not yet fixed" while the Current
Phase section two screens below says D-3 and D-4 are closed. The second is
right. Fix the header when something else takes you into it.

---

## 2. The layer — `renderer/src/finance.js`

§14 names six functions. **Two of them already existed and were already proven,
so this file does not reimplement them.** `calculateCharges()` and
`calculateOutstanding()` call `resolveCharges()` and `outstandingOf()` and
nothing else. That is the whole design decision: D-1 was 52 call sites each
answering "what is owed" its own way, and a second implementation here — however
careful — would have been the 53rd. The §14 name and the existing answer have to
be the same function or the layer is not authoritative.

The other four are new: `applyPayment()`, `reversePayment()`,
`calculateRefund()`, `calculateReportTotals()`. Plus two the spec implies but
does not name: `calculateBill()` and `calculateSettlement()`.

### Money is a whole rupee, held as an integer

§14 bans binary floating-point financial calculations. **The hazard is the
fraction, not the double.** `0.1 + 0.2 !== 0.3` because tenths are not
representable in binary; `8000 + 6500` is exact, and so is every integer sum
below 2^53. So money enters through `money()`, which rounds it to an integer
once at the boundary, and after that every `+`, `−` and comparison in the layer
is exact because no fraction exists to be wrong.

**Rounding is half AWAY FROM ZERO, and that is not a preference.**
`Math.round(-0.5)` is `-0` — it rounds toward +∞ — so `Math.round(-x) !==
-Math.round(x)` at every half. `reversePayment()` negates amounts; that
asymmetry would leave a rupee on the record every single time a reversal was
meant to exactly undo a collection.

Integer paisa was considered and rejected: a schema migration across 50+ live
installs for a sub-unit nothing in this app bills or displays. **`finance.js`
names the one line to change** if that ever stops being true — the call sites
already all go through `money()`.

### Overpayment is recorded, not swallowed

Every write path ended in `Math.max(0, due - paid)`. A student handing over a
round 15,000 against a 14,500 bill produced a balance of 0 and 500 rupees
recorded nowhere — not owed, not refundable, in no report.

The balance still floors at 0, because 52 call sites read it and negative
balances would have to be understood by all of them. The excess goes to
`p.overpaid` and is what `calculateRefund()` returns.

> **`overpaid` is written even when it is 0, and that matters.** Its presence
> means the layer has observed every collection on the record, so
> `calculateRefund()` answers from it and stops deriving. Written only when
> non-zero, a record settled exactly would keep falling through to the derived
> path — and a bill corrected *downwards* later would then read as a refund the
> hostel owes. Same convention as `unpaid`: once recorded, the record is the
> answer.

---

## 3. Three defects found in the wiring, none of them in the defect report

All the same family — a write path reading `Number(p.unpaid) || 0` instead of
the one answer.

### The three "mark paid" paths collected nothing from a legacy debtor

`markPaymentPaid()`, `markPaymentPaidFromStudentView()` and `payBulkMarkPaid()`
all read the balance that way. On a record written before `unpaid` existed it is
**0** — so pressing Mark Paid took no money, wrote `unpaid = 0`, stamped the
record Paid, and the debtor then dropped out of the arrears list, the banner and
its total with nothing left to say they had ever owed anything.

**The debt was not settled. It was deleted.** This is D-1's write side; the
52-site sweep in `c9822a4` fixed the reads only.

### The arrears panel disagreed with itself, on screen

`Receive Outstanding` computed its header total with `outstandingOf()` while
each row printed `p.unpaid` and capped its input at the same. A legacy arrear
therefore showed **"owes PKR 0"** in a panel whose header showed the real
figure, and the input refused to accept the collection.

### `payments.js:1778` dropped four of the five bill lines

The merge-into-existing-pending path computed `monthlyRent − paid`, dropping
mess, extras, admission fee and concession — and did not carry those fields onto
the record at all. At a bundled hostel, merging a payment into an existing
pending record understated the balance by the whole mess charge, while creating
a fresh record from the identical form got it right.

The neighbouring merge path (`:2480`) had had exactly this bug and carries a
comment about the fix. **This copy was missed because there were two copies.**
There are now none: `calculateBill()` replaced six hand-written copies of
`rent + mess + extras + admission − concession`.

---

## 4. The two screens

### Reverse a collection — a Payments row action

Offered only where something was actually collected. A freshly generated month
is a table full of records that collected nothing, and a dead control on every
row of it is worse than no control.

**It is not Edit and it is not Delete, and the modal says so because it sits
between them.** Edit restates the whole record — the wrong figure is
overwritten, the trail is rewritten around it, and nothing is left saying a
mistake was made, which on a shared warden screen is indistinguishable from
money going missing. Delete removes the record and everything it said. This
removes an amount, keeps the original collection where it is, and records the
reason, who and when beside it.

Order matters inside `reversePayment()`: **credit first, then the balance.**
Reversing 800 of the 15,000 taken against a 14,500 bill takes back the 500
credit before it re-opens 300 of debt — otherwise one undone keystroke leaves
the record simultaneously owing money and holding a refundable credit.

### Settle at the door — confirming a cancellation

It used to be a yes/no box that set a status, so a leaver's arrears stayed on
the books against somebody who had gone and their credit stayed where nobody
would look again. It now shows the net position month by month and offers to
settle it: arrears collected against the records that hold them, or a credit
handed back as a reversal.

**Confirming and settling stay two actions.** A student is allowed to leave
owing money, and a warden who cannot collect today must not be pushed into
recording that they did. Either way `c.settlement` is written onto the
cancellation — the payment records stay editable forever, and that is the only
thing that remembers what was owed on the day the student walked out.

**There is no pro-rata, deliberately.** No daily rate exists anywhere in this
product — not in settings, not on the room type, not on the student. Every line
in the settlement traces to a record the warden can open. If a hostel ever gets
a pro-rata rule it belongs in Settings and arrives here as a real charge on a
real record, not as a rate improvised at checkout.

---

## 5. Traps worth knowing

1. **A reversal must NOT be a negative entry in `partialPayments`.**
   `_cashEvents()` filters that array to positive amounts when it dates cash but
   sums it whole when it sanity-checks, so a negative there is counted by one
   half and dropped by the other — and the record's cash comes out over-stated
   by exactly the amount handed back. Reversals live in `p.reversals` and
   `_cashEvents()` reads them as their own negative events, which is also more
   truthful: the money left the drawer on the day it was handed back.
   `tests/cash-events.test.js` holds that invariant.
2. **The Add Payment form's cap was silently truncating real collections.** It
   capped the typed amount at the bill to catch `1600000` for `16000`, and
   caught the counter case too. The threshold is **plausibility** now: up to
   twice the bill is accepted and the excess recorded as a credit (the form says
   so under the field); beyond that it is still capped as a typo.
3. **Cross-realm `assert.deepStrictEqual` fails in the `vm` sandbox tests.** An
   array built inside the sandbox is not reference-equal to a host array even
   when the contents match — "Values have same structure but are not
   reference-equal". Compare `.join()` or `.length` instead.
4. **The Payments table's default scope is this month plus arrears carried in.**
   A settled record from an earlier month is neither, so a spec that seeds one
   with a fixed past date waits out its timeout on a row that is not on screen.
   It looks exactly like a missing button.
5. **First-boot seeding can land on top of a spec's fixture.** On a cold profile
   it is still in flight when the spec logs in and saves over what was written
   underneath it. `seed()` in `finance-flows.spec.js` writes, checks, and rewrites
   until the DB agrees.
6. **`declare var` in `globals.d.ts` for something inside the typecheck scope is
   a redeclaration error, not a convenience.** `MONEY_SAFE_MAX` is deliberately
   not declared there; `finance.js`'s own `const` is the declaration.
7. Playwright still needs `HOSTIX_TEST_PROFILE` with a `license.enc`, and still
   must be run **6–8 spec files at a time** or the worker OOMs and reports a
   cascade as ~32 assertion failures.
8. **`waitForSelector` waits for VISIBILITY.** `#canc-student` is the
   cancellation modal's hidden input; waiting on it waits forever for something
   that is hidden by design. Assert on a visible field of the form instead.
9. **An auto margin eats the space after it.** `.seat-inline { margin-left:auto }`
   pushed anything placed after it in the header onto a second line at widths
   with 60px to spare. If something wraps and the arithmetic says it should fit,
   look for the auto margin before shrinking anything.
10. **The OOM does not always look like an assertion failure.** Running seven
   files including two heavy ones produced a single test that ran for 3.5
   minutes and then died with *"Target page, context or browser has been
   closed"* — which reads exactly like a crash in the code under test. It passed
   alone in 19 seconds and passed again in a batch of four. Re-run alone before
   believing it.

---

## 6. Working tree

**Uncommitted and PROTECTED by spec §2 — untouched all session, no change of
mine appears in any of their diffs:**

- `renderer/chrome.css`
- `renderer/src/modules/students.js`
- `renderer/students.css`
- `renderer/style.css`

The owner chose "layer + reversal + checkout settlement" knowing checkout
normally reaches into `students.js`. It did not: the settlement is computed in
`finance.js` and driven from `cancellations.js`, which is not protected. The
student-side seam is `calculateSettlement(studentId)` — call it, do not
reimplement it, when that file lands.

**Committed this session:**

- `renderer/src/finance.js`, `renderer/cancellations.css` (both new)
- `renderer/src/modules/payments.js`, `renderer/src/modules/cancellations.js`,
  `renderer/src/modules/dashboard.js`, `renderer/payments.css`,
  `renderer/index.html`, `renderer/globals.d.ts`, `tsconfig.json`, `package.json`
- `renderer/src/modules/reports.js`, `renderer/reports.css`
- `renderer/src/modules/dashboard.js`, `renderer/dashboard.css`
- `tests/finance.test.js`, `tests/cash-events.test.js`,
  `tests/report-totals.test.js`, `tests/finance-flows.spec.js`,
  `tests/dashboard-cards.spec.js` (all new)
- `docs/ENTERPRISE_LIVE_STATUS.md`

> `renderer/rail-compact.css` is still the deliberate temporary file the previous
> handoff describes. Nothing this session touched it.

---

## 7. Reports moved onto the authority — `4f76bfc`

§14's last open half. `_rptTotals()` in `reports.js` is the single place the
Reports page, its detail cards, its CSVs and its PDFs take their figures from,
and its money half now comes from `calculateReportTotals()`.

**Three duplicate sums went**, each recomputing a figure `_rptTotals()` had
already produced from the very same records: the Pending detail card summed
`outstandingOf()` over rows whose total was *already an argument to the function
drawing them*; the financial PDF re-filtered and re-summed the same thing
inline; the pending PDF summed both the outstanding and the partial-paid totals
again. **None of them was wrong today** — they were three places for the page
and the PDF printed from it to drift apart the moment one was corrected.

### Two things deliberately left alone

**`rev` still comes from `calcRevenue()`.** That is the ACCRUAL authority the
dashboard, the cards and the share sheets read — July's rent handed over in
August is July's revenue to all of them. Replacing it here with the layer's
`collected` would be swapping a shared answer for a second one, which is the
exact shape of D-1. The layer's figure sits *beside* it as a cross-check
instead, and they must agree: both sum `p.amount` over the same scope.

**`pending` still counts records whose STORED status is Pending.** This is the
one worth your attention, and it is written up in
`ENTERPRISE_LIVE_STATUS.md` → *Open Questions*: `outstandingOf()` deliberately
returns a recorded balance even on a record marked Paid, calling it "money
someone is owed" — but every card that totals arrears filters to Pending first,
so that balance reaches no total anywhere except the Payments screen's
Outstanding card, which sums an unfiltered list. **The app holds two answers.**
Either one moves a headline figure on 50+ live installs, so nothing was changed;
`tests/report-totals.test.js` pins today's behaviour so the fix, when it comes,
is deliberate and visible.

### `safe` is now printed

`_rptTotals().safe` is false when a total has left exact integer range **or**
when the accrual and the layer disagree — which means a record carries a stored
status that is neither `Paid` nor `Pending` (`Partial` is derived for display
and never written), contributing to the layer's collected total and to no
revenue figure anywhere. The report would be quietly missing that money. It now
prints a caveat under the figures instead, styled as a full-width row so it does
not read as a third footnote about formatting.

---

## 8. Four dashboard defects — `b88e862`

Reported by the owner after the §14 work; unrelated to it.

### Today at a Glance showed six zeros

**The arithmetic was never wrong.** Seeded with records dated today it reports
all six figures correctly — proved before changing anything. What was wrong is
that it was hard-scoped to the literal calendar day on a page where every other
card is month-scoped.

The owner's own dev database settles it: **141 payments, 55 students, latest
activity 2026-09-05, nothing dated today, and the check-in log has never had a
single row written to it in either install.** So the card printed six zeros
until somebody recorded something, and six more the next morning. A card that is
almost always empty teaches a warden to stop looking at it, and six zeros on a
busy hostel is indistinguishable from a card wired to nothing.

It now falls back to the most recent day that HAS activity, and the heading
names that day ("Latest Activity · 05-Sept-2026"). **Falling back is not the
same as widening the window** — it still reports one day, every figure still
comes from records that exist, nothing is summed across days. Switching quietly
to a month total would have put a figure under a heading that does not describe
it. Capped at today, so a payment dated ahead cannot drag the panel into a day
that has not happened.

> If you would rather it simply followed the month like the KPI row, that is a
> two-line change in `_dlGlanceDay()`. The fallback was chosen because it keeps
> the card's meaning; say the word.

### Needs Action keeps all four rows

Owner's call, reversing 2026-09-05. Dropping zero rows made the panel a
different shape every render: rows moved under the cursor as a queue cleared, so
a warden could not learn that "pending payments" is the second line — and an
absent row reads as missing rather than clear. Cleared rows are muted and their
verb becomes "Clear" rather than an instruction to do nothing. The badge counts
what still wants attention, because a badge that always reads 4 is not
information.

**This exposed a pluralisation bug that had never been visible:** `noun + 's'`
produced "0 open maintenances" — and had been producing "2 open maintenances"
all along. Each row now carries both forms explicitly.

### Quick Actions open their forms

They called `navigate()`, so "Add Payment" landed on the Payments table and the
warden then had to find the button. A tile called *Add X* that does not add an X
is a link wearing a verb. All four now call the same entry points as the
header's primary button (`headerAction()` in nav.js), so the form and its
permission check are identical wherever it is opened from. Add Payment is a full
page in this app rather than a modal — still one click, still the form.

### Expand and Print are back on Seat Availability

**In the footer strip, not the header, and that is measured rather than
preferred.** `.seat-inline` carries `margin-left:auto`, which absorbs every
pixel of free space — so anything placed after it wraps onto a second line
however much room the card has. Grouping the counts and the buttons fixed 1536px,
but at 1366 the header genuinely has no room: it went 30px → 62px, and every one
of those pixels comes out of the room grid this card was rebuilt to enlarge.
`printSeatAvailability()` was never deleted; only its button was.

### The fold is unchanged, and that was measured

Two extra Needs Action rows are ~70px, and that card is the tallest in row C at
full height. The height comes back out of **decoration** in the existing density
blocks — the icon tile shrinks, the padding tightens — which is the rule the KPI
tiles already follow. `tests/dashboard-cards.spec.js` measures four rows against
two at four sizes and asserts row C ends at the same pixel; it does.

> **Two sizes do not fit, and did not fit before this change either.**
> 1280×660 and 1093×614 end at 712 and 699 against those viewports — with two
> rows and with four, identically. The handoff of 2026-09-05 recorded 1280×660
> as fitting at 652; that was measured on a lighter fixture. Row B, not row C,
> is what exceeds it here (248px at 660 with 40 rooms and 30 students). Worth a
> look, but it is not this change and the owner has not reported it.

---

## 9. Next

1. **Route the 13 `students.js` sites** through `outstandingOf()` when that
   file's design work lands — still the one screen answering "what is owed" the
   old way. Note the write-side lesson from §3: check what that file *writes*,
   not only what it reads.
2. **Answer the Paid-with-a-balance question** (Open Questions in
   `ENTERPRISE_LIVE_STATUS.md`). It is a one-line change either way; it is the
   owner's call which line.
3. **Fold `rail-compact.css` into `chrome.css`** — unchanged from the last handoff.
4. **A real disk-full test** — the last §27 PARTIAL that is not downstream of
   code signing. Needs an elevated VHD.
5. **The §22 diagnostic bundle** — still entirely absent.
6. **Code signing** — every remaining MISSING matrix row is downstream of it.
