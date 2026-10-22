# Session handoff — 2026-09-20

**Read this first.** It supersedes `SESSION_HANDOFF_2026-09-19.md` as the entry
point; that file keeps the detail on Phase 5, the Available Fund reversal and
the first payment punch list, and is still worth reading for those.

## State

Branch **`design/dashboard`**, tree clean apart from untracked scratch
(`tests/tmp-*.spec.js`, `.shots/`).

**PUSHED** — 50 commits, `origin/design/dashboard` at `2b941f0`. That was a
first push; the remote branch did not exist before. It is **50 ahead of
`origin/master` and 0 behind**, so it is a clean fast-forward, and it is
deliberately **left unmerged with no PR** (owner, 2026-09-20).

> The LOCAL `master` ref drifts in this repo — it is never checked out. Always
> count against `origin/master`.

## The finance audit is closed

All seven phases plus G5. Read `docs/FINANCE_AUDIT_2026-09-18.md` for the
findings; each phase has its own section there.

| | |
|---|---|
| Phase 1–4 | earlier sessions |
| Phase 5 | stays — who lived here, when, in which room (`2b8c69c`) |
| Phase 3 | **reversed**: Available Fund is revenue − expenses (`ce91fb9`) |
| Phase 6 | `p.generated` — the bill as it was first raised (`200f066`) |
| Phase 7 | one save, one SQLite transaction (`a03e9db`) |
| G5 | one hand-over, one `receiptId` (`e2ff2aa`) |

## What landed this session, in order

| Commit | What |
|---|---|
| `2d56c9d` | Edit Payment showed **Pending Rs. 0** on a part-paid month — stale `_pfAlready` |
| `0017dde` | Punch list: search bar, hint lines, receive box 103→204px, type locked, smoother open, instalment history |
| `617e306` | Refund door on the Edit form — reuses `reversePayment()`, no second engine |
| `edea6fb` | Crowding, measured: main column 1066→917, rail 1055→892 |
| `bc9ab79` | The `method` "defect" was a **stale test**, not a bug |
| `bc4020a` | One Export control everywhere, Export last, **Admitted** + **Paid on** columns |
| `200f066` | **Phase 6** — G6 |
| `a03e9db` | **Phase 7** — G10 |
| `e2ff2aa` | **G5** — receipt identity |
| `63459ec` | 40 dead functions removed |
| `62b5d0a` | The month report has a way in, + two caption bugs |

## Open tasks

### The owner's call, deferred — do NOT act unprompted

**21 dead features kept on purpose.** They are the only implementation of a
feature with no way in. Deleting them is a product decision; git keeps them
either way. The full table is in `SESSION_HANDOFF_2026-09-19.md`:

    bill splitting ~73L · Add Student documents 69L · warden photo upload 59L
    Reset All Data 34L (destructive, no button reaches it) · fines · notices
    check-ins · inspections · extra charges at admission · misc helpers

Three more decisions:

* **Student information card** on the Edit sheet — 241px repeating the name,
  room and status the title bar already carries. Worth ~120px.
* **`p.adjustments[]`** — asked for in the Phase 6 decision, not built. The
  ledger already records every charge change immutably, and a second array
  would be a second answer to "how did this bill change" (the D-1 shape §14
  exists to prevent). If it is wanted, the honest form is a read-only accessor
  over the ledger, **not a new store**.
* **Unpaid-record re-pricing** — correcting a rent on a record holding no money
  reverts when the form is reopened. Documented intent (`_own` in
  `showEditPaymentModal`: a bill follows the student's price until money is
  taken), but it surprises.

### Known issue

`tests/handovers.test.js` — 2 of 14 fail about one run in five, before and
after everything this week. Never investigated.

## Traps this session paid for

**Running the tests**

    HOSTIX_TEST_PROFILE=C:\Users\PCS\HOSTIX-testprofile   (needs a license.enc)
    NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=2"
    npx playwright test <6-8 spec files at a time, or the worker OOMs>
    node tests/finance.test.js   (85)   tests/periods.test.js (16)   …

**`_pfAlready` is module state.** Only the ADD form writes it; the EDIT form
keeps its own copy in the hidden `f-ppaid`. Both were being subtracted. The
journey matters in a test: the Add form must be visited *and left* first.

**The two payment forms share field IDs** (`f-pcombo`, `f-ppaid`, …).
`getElementById` returns the first in document order, so opening the Edit modal
while the Add PAGE is mounted reads the page's fields. Navigate to `payments`
first or the numbers are nonsense. And **`f-pcombo` is rent + mess**, not rent.

**`outstandingOf()` prices from the charge authority when a record has no
`unpaid` field** — a fixture without it does not behave like a real record.

**Mixed LF/CRLF per file** silently defeats string-replace patches. Check
before patching; `payments.css` is mixed, `payments.js` is pure CRLF.

**A brace matcher over-runs on a function containing a regex literal with a
quote** (`csvEsc` measured 100 lines, is 4). Any bulk edit must verify the
declaration count dropped by exactly N — that guard is what caught it.

**Dead-code scanning:** strip comments first (a name in prose is not a call
site) and exclude `.md`, or the handoff table naming these functions makes them
all look used. Two dispatch sites take a function name as a string
(`command-palette.js`, `_dashRowAct`) — both are called with literals, so a text
scan does see them.

**`deepStrictEqual` never passes on a value built inside the `vm` sandbox** —
different realm, different prototypes. Compare joined strings or JSON.

**The dashboard KPI tiles are locked by owner ruling (7 Sep)** and
`counter-flow-decisions.spec.js` holds them locked. Advance / Arrears is the
one exception. Do not hang drill-downs there.

## Next

Nothing is in flight. The natural next moves are the four decisions above, or
merging `design/dashboard` to `master` when the owner wants it.
