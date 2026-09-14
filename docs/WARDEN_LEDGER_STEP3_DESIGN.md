# Warden Ledger — Step 3 design: My Collections (read-only)

**Status: DESIGN FOR OWNER REVIEW. Nothing built.**
Spec §5 step 3: *"Read-only 'My Collections' / ledger view for a warden (verify data
correctness before adding write actions)."* Decisions it rests on:
`docs/WARDEN_LEDGER_SCHEMA_PROPOSAL.md` (Users page placement; step 3 decisions).

Produced by the design-studio pipeline: a UX brief from the code, seven independent
proposals, a scored review, and this decision. Bound design system: `renderer/tokens.css`.

## Director decision — hybrid (B)

| Taken | From | Why |
|---|---|---|
| Page built only from what the Users page already owns: counters, card, table, detail rail, empty states | Proposal 7 (scored 1st, 7.65) | Consistent with the rest of the app, every state defined, cheapest to verify |
| Tabs only when there is somewhere else to go | Proposal 1 (2nd, 7.55), corrected | A warden has one destination, so a warden sees **no tab row** at all |
| Per-method columns on the admin's Wardens table | Proposal 5 | "How much physical cash" is what an admin reconciles |
| One honest line about payments typed against a manual name | Proposal 6 | They are not in the ledger, and a warden will notice |

**Rejected, and what that costs:** Proposal 2's hero sparkline and card grid (more premium,
but a new component family, and cards compare wardens worse than a table); Proposal 3's
sentence layout (most readable for one person, fails an admin with six wardens); Proposal 6's
cash-vs-digital split (the method list is editable, so "digital" would be a guess — per-method
totals are shown instead); Proposal 5's five counters and five filters (fails 1366×768).

## What each account sees

| Account | Users page shows |
|---|---|
| Without Manage users (a warden) | **My Collections** only — no tabs, no lock screen |
| With Manage users (admin) | Tabs: **Users** (today's page, unchanged) · **Wardens** · **My Collections** |

## Every figure, and where it comes from

Collections = ledger `payment` entries **created by this account**, not imported.
Reversed = ledger adjustments (reversal, amount edited down) **recorded by this account**.

| Figure | Rule |
|---|---|
| **Holding** | collections − reversed, since go-live. Nothing is handed over until step 4. |
| **Today** | same, entries created today |
| **This month** | same, entries created this calendar month |
| **By method** | holding split by each entry's `method`; blank = "Not recorded" |
| **Wardens table** | the same four figures per account, plus last collection time |

A deleted record's collection **stays** in the total, tagged *Record deleted*. Imported
history appears in **no** account's collections. Accounts with Manage users show
"No handover needed" (owner, 2026-09-14).

## Layout — warden (1366×768)

```
┌ User Management · My Collections ─────────────── [Export ▾] [Hand over cash 🔒] ┐
│ Money you have collected and not yet handed over.                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ┌ Holding ─────────┐ ┌ Today ───────────┐ ┌ This month ──────┐                  │
│ │ Rs 23,000        │ │ Rs 8,000         │ │ Rs 41,500        │                  │
│ │ 11 collections   │ │ 3 collections    │ │ 19 collections   │                  │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘                  │
│ By method:  [Cash 18,000]  [JazzCash 5,000]        (neutral chips, no colour)   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Student or room]  [All methods ▾]  [All time ▾ / Today / This month]  Reset │
│ When         Student · Room        Month billed    Method      Amount           │
│ Today 14:05  Ali Khan · A 01       September 2026  Cash         5,000           │
│ Today 11:20  Reversed · Usman Ali  October 2026    Cash        −1,000           │
│              "wrong amount keyed"                                               │
│ Yesterday    Bilal · B 03          September 2026  JazzCash     3,000           │
│  17:40       [Record deleted]                                                   │
│ …                                                                               │
│ 1–25 of 118 · Total shown Rs 118,500                         ‹ 1 2 3 4 5 ›      │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ⓘ Payments typed against a name with no student record are not counted here.   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Layout — admin, Wardens tab

```
┌ User Management ─────────────────────────────────────────────── [Export ▾] ┐
│ [ Users ]  [ Wardens ]  [ My Collections ]                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Account          Holding   Cash     JazzCash  Today   Last collection  Handover       │
│ Sara (Warden)    12,500    10,000   2,500     4,000   Today 13:10      —              │
│ Bilal (Warden)    7,000     7,000       —         0   Yesterday 18:02  —              │
│ Owner (Admin)     3,500     3,500       —         0   2 Sep            No handover needed│
│ Total            23,000    20,500   2,500     4,000                                  │
└─────────────────────────────────────────────────────────────────────────────┘
 click a row → right rail: that account's collections register (same rows, compact)
```

Method columns appear only for methods that hold money in the table, so an unused method
never draws an empty column.

## Components and states

- **Header:** existing `bk-head`. *Hand over cash* is drawn **disabled**, neutral, with the
  tooltip "Handing over and approval arrive in the next update" — the place step 4 attaches.
- **Counters:** existing `usr-kpi` tiles, tabular numerals.
- **Method chips:** existing `pmBadge()` — methods are categories, never coloured.
- **Register:** existing `set-table`, **25 rows per page with a pager** (hard requirement:
  ~500 entries per six months), newest first (the owner's stated exception to room order).
- **Reversal rows:** the word **Reversed** + a minus sign + the reason on a second line;
  the amount also uses the danger text colour. Never colour alone.
- **Deleted:** neutral chip *Record deleted*.
- **Empty:** "No collections yet. Money you collect from now on appears here."
- **No match:** existing `bk-empty` with Reset.
- **Wardens rail:** existing `usr-rail`, closed with ✕ like the account rail.
- **Export:** through the one export engine (PDF / Excel of the filtered list). Read-only.
- Light and dark themes; keyboard-reachable tabs (existing `set-tabs` row).

## As built (2026-09-14) — changes from the design above

- **Handover column:** an administrator reads **Not needed**; a warden reads **—** until step 4.
- **With an account open** beside the Wardens table, the per-method columns move into
  the rail as a *By method* list, so Today, Last collection and Handover stay in view at
  1366×768.
- **A deleted account keeps its row** (owner, 2026-09-14), under the name it last
  collected with and tagged *Account deleted*, so its money stays in the Total and exports.
- **Reason line** shows only the typed reason (or what an edit changed); the word
  *Reversed* and the month are already on the row.
- Checks run: design-governance (no blockers; three fixes applied) and regression review
  (nothing breaking; the deleted-account gap above was its finding).

## Files it would touch

`renderer/src/modules/users.js` (branch at page entry, two new views),
`renderer/users.css` (a few `usr-` classes), `renderer/src/ledger.js` (one read-only
helper: collections by account — no write paths), a new spec test. No database change.
