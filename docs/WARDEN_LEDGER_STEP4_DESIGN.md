# Warden Ledger — Step 4 design: Hand over cash + admin approval

**Status: BUILT 2026-09-14 — awaiting owner review before commit.** Design approved by the owner
(two rounds of answers below); design-governance and regression reviews run, their fixes applied.
Spec §3.3 and §5 step 4. Owner decisions it rests on: `docs/WARDEN_LEDGER_SCHEMA_PROPOSAL.md`
("Feature decisions", "Step 4 decisions"). Built on step 3 (`docs/WARDEN_LEDGER_STEP3_DESIGN.md`).

Produced by the design-studio pipeline: UX brief from the code, seven proposals, scored
review (winner: Design Systems proposal, 81%), and this decision.

## Director decision — hybrid (B)

| Taken | From | Why |
|---|---|---|
| Everything built from the app's existing parts; every state defined | Proposal 7 (1st) | Consistent, nothing new to learn |
| Approve is only possible when the counted money matches | Proposal 1 (2nd) | Nobody can approve a total nobody counted |
| One plain sentence saying what will happen | Proposal 3 (3rd) | Partial approval is understood at a glance |
| Tick or untick all lines of one method at once | Proposal 5 | A 60-line handover is ticked in seconds |

**Changed from the review's advice:** no separate "workspace" for long handovers. The review
dialog is split in two instead — the lines scroll on the left, the counting panel stays fixed
on the right — which fits a 60-line handover at 1366×768.
**Rejected:** side-sheet cards (squeeze the Wardens table again), a send dialog that hides the
lines, and any display that guesses *which* line was short. **Deferred:** a "count your own
cash" helper for wardens (new scope, not asked for).

## The rules (acceptance criteria)

1. **Approve** is enabled only when, for every payment method in the handover, the counted
   figure typed by the admin **equals** what the ticked lines expect. Otherwise only
   **Flag discrepancy** is available, and it needs a note.
2. **Unticked lines** go back to the warden's "to hand over" list **when the handover is
   approved** — not the moment the box is unticked.
3. Every note keeps **who wrote it and when**, and cannot be edited afterwards.
4. A handover is a **snapshot**. Money collected after it was sent never changes it; it shows
   as "to hand over" for the next one, to both warden and admin.
5. **One open handover per warden.** While one is waiting (or in discrepancy), the Hand over
   button explains why it is unavailable.
6. **Take back** is available to the warden only while the handover is waiting and the admin
   has not acted.
7. Counted figures are typed, **or** confirmed with a per-method **Matches** button that copies
   the expected amount (owner, 2026-09-14). The handover records which figures were typed and
   which were confirmed with Matches, and the export and history say so.
7a. **Reversal lines are always included** — ticked and locked; unticking one would make the
    warden owe cash they never had.
7b. **Exact match only** — no tolerance; any difference is a discrepancy with a note.
8. Approving never changes the dashboard's Available Fund. A read-only licence disables every
   button here with the licence's own reason.

## Second round of answers (owner, 2026-09-14)

| Question | Answer |
|---|---|
| Small difference when counting | Must match exactly |
| Counted entry | Typed, or a **Matches** button per method (recorded as such) |
| Settling a discrepancy | Review again, count, approve with a note saying how it was settled |
| Reversal lines | Always included, cannot be unticked |
| "Taken back" status | Added, shown grey in history |
| Warden told of the outcome | Yes — header bell: approved / flagged, until they open My Collections |
| Warden counters | 4 tiles: To hand over · Waiting approval · Today · This month |
| Admin table | *Holding* becomes **To hand over** + **Waiting** |
| Who approves | Any account with Manage users; each approval records the admin |
| Warden's history | All handovers, 10 per page, newest first |
| Review extras | Export PDF of the handover; **receipt number** beside each line (from its month record, when printed) |

## Warden — My Collections

```
My Collections                               [Export ▾] [ Hand over cash ]
┌ To hand over ─┐ ┌ Waiting approval ┐ ┌ Today ─────┐ ┌ This month ─┐
│ Rs 7,000      │ │ —                │ │ Rs 8,000   │ │ Rs 41,500   │
│ 4 lines       │ │ nothing sent     │ │ 3 lines    │ │ 19 lines    │
└───────────────┘ └──────────────────┘ └────────────┘ └─────────────┘

HANDOVERS
 Sent          Lines  Amount     Status             Note
 Today 18:40   4      Rs 7,000   [Waiting]          —            [Take back]
 12 Sep 19:05  11     Rs 21,500  [Part approved]    "Bilal's 3,000 not received" — Owner, 12 Sep 19:30
 11 Sep 18:55  9      Rs 18,000  [Approved]         —
(then the collections register from step 3, each line tagged To hand over / Sent / Approved)
```

**Hand over cash** opens:
```
┌ Hand over cash ──────────────────────────────────────────────┐
│ When         Student · Room       Method     Amount          │
│ Today 14:05  Ali Khan · A 01      Cash        5,000          │
│ Today 11:20  Reversed · Usman     Cash       −1,000          │
│ Today 10:02  Bilal · B 03         JazzCash    3,000          │
│ …(scrolls)                                                   │
│ Cash 4,000 · JazzCash 3,000                                  │
│ You are handing over Rs 7,000 in 3 lines to the administrator.│
│                              [Cancel] [Send Rs 7,000]        │
└──────────────────────────────────────────────────────────────┘
```

## Admin — Wardens tab

```
WAITING FOR APPROVAL
 Warden        Sent          Lines  Amount     Status          
 Sara Warden   Today 18:40   4      Rs 7,000   [Waiting]        [Review]
 Bilal Warden  12 Sep 19:05  2      Rs 3,000   [Discrepancy]    [Review]

Account        To hand over  Waiting   Today    Last collection  Handover
Sara Warden    Rs 1,500      Rs 7,000  Rs 8,500 Today 19:10      Waiting
Owner (Admin)  Rs 17,000     —         Rs 0     2 Sep            Not needed
```
The header bell shows *"Handover waiting from Sara Warden — Rs 7,000"* to accounts that can
approve; clicking it opens the Wardens tab.

**Review** opens a wide dialog, two columns:
```
┌ Review handover — Sara Warden · sent Today 18:40 · 4 lines ───────────────────┐
│ Tick what you received:  [✓ All] [Cash ✓] [JazzCash ✓]                        │
│ ┌ lines (scroll) ──────────────────────────────┐ ┌ Count ─────────────────────────────────┐ │
│ │ ☑ 14:05 Ali Khan  RCP-000412  Cash     5,000 │ │ Method    Expected  Counted       Diff │ │
│ │ 🔒 11:20 Reversed  —          Cash    −1,000 │ │ Cash       4,000    [4,000][Matches] 0 │ │
│ │ ☐ 10:02 Bilal     RCP-000409  JazzCash 3,000 │ │ JazzCash       0    [    0][Matches] 0 │ │
│ │ ☑ 09:40 Hamza     —           Cash     1,000 │ │ Total      4,000     4,000           0 │ │
│ └─────────────────────────────────────┘ │ Note (needed to flag)             │ │
│                                          │ [...............................]│ │
│                                          └──────────────────────────────────┘ │
│ Approving Rs 5,000 of Rs 8,000. 1 line (Rs 3,000) goes back to Sara.          │
│                    [Cancel] [Export PDF] [Flag discrepancy] [Approve Rs 5,000]│
└───────────────────────────────────────────────────────────────────────────────┘
```
**Discrepancy:** the handover stays in the queue, marked red, with the note and the counted
figures. Reviewing it again works the same way; approving it then needs a resolving note.

## States

| State | Chip | Warden can | Admin can |
|---|---|---|---|
| To hand over | — | Hand over | — |
| Waiting | amber *Waiting* | Take back | Review |
| Approved | green *Approved* | — | Export |
| Part approved | blue *Part approved* | — | Export |
| Discrepancy | red *Discrepancy* | see note | Review again |
| Taken back | grey *Taken back* | — | — |
| Licence read-only | buttons disabled with the licence reason | — | — |

Every state is written as a word, never shown by colour alone.

## Data (to the approved schema)

- `warden_collections` — one row per line the warden holds: the ledger entry, the warden,
  signed amount (a reversal is negative — owner: net cash), method, status
  (`pending_handover → handed_over → approved / disputed`), handover id.
- `handovers` — warden, admin, total, **expected and counted per method**, approved amount,
  status (`pending / approved / discrepancy`, plus **`taken_back`** — an addition for the
  owner's "take back" answer), notes as a list of *{who, when, text}*, times.
- `handover_items` — handover ↔ ledger entry.
- Collections from before step 4 get their `pending_handover` row once at start-up.
- Backed up with the rest; a backup from before step 4 still restores.

## Files

`main.js` (three tables, backup lists), `renderer/src/storage.js` (table map),
`renderer/src/handovers.js` (new: the rules above, no screens), `renderer/src/modules/users.js`
+ `renderer/users.css` (screens), `renderer/src/modules/nav.js` (one bell entry), tests.
