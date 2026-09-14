# Warden Collection Ledger — Schema Proposal (spec §5 step 1)

**Status: APPROVED SCHEMA (owner, 2026-09-14). Nothing in this document has been built.**
Every question below is decided; the answers are marked in place.
Source: `hostix-warden-ledger-spec.md`. This follows the spec's own instruction:
*"Confirm/propose exact schema against current DB … do not just apply the tables
above verbatim without checking existing structure."*

Every section below is the spec's §2 section, in its order. For each: what the
spec says, what exists in the app today, the proposed shape, and the questions
that need your answer before anything is written. Nothing is decided where the
spec leaves a choice — each choice is a question with a recommendation.

---

## 0. How this app stores data (the facts the schema must fit)

| Fact | Consequence for the ledger |
|---|---|
| Every table is SQLite `(id TEXT PRIMARY KEY, data TEXT)` holding one JSON record (`main.js` CREATE TABLE block). Field names are camelCase (`studentId`, `monthlyRent`). | New tables use the same shape. Spec's `student_id` is written `studentId` etc. |
| The whole database is loaded into memory at boot and saved record-by-record (`storage.js` `loadDB` / `saveDB`). | A new table is one line in `_TABLE_MAP` plus a CREATE TABLE. |
| Payments are **one record per student per month**: the bill (`monthlyRent`, `messCharge`, `extraCharges`, `admissionFee`, `concession`), what was collected (`amount`), what is owed (`unpaid`), an instalment trail (`partialPayments[]`) and `reversals[]`. 52 screens read balances off these records. | The spec's ledger has to live alongside these records, or replace them — see Q1. |
| Receipt numbers are **one per month record** (`receiptNo`, reused on reprint). | Spec's `receipt_id` and "void a receipt" — see Q6. |
| User accounts live in the renderer's `localStorage`, keyed by an id like `warden1` / `u…`; they are **not in backups**. The main process has no idea who is logged in. | `created_by` needs a name snapshot beside the id (Q3); server-side checks are limited (Q4). |
| Backups and the recovery screen list tables in `BACKUP_TABLES`; the recovery check refuses a snapshot missing any of them. | New tables must be exempt from that check, or every existing recovery snapshot becomes unrestorable. |

---

## §2.1 `student_ledger`

**Spec:** `id, student_id, type (charge|payment|concession), amount (positive),
reason (required for charge and concession), created_by, approved_by (nullable),
receipt_id (nullable), running_balance, created_at`. Rows never edited or
deleted; corrections are new entries.

**Proposed table:** `student_ledger`

| Field | From spec | Notes |
|---|---|---|
| `id` | yes | `sl_<unique>` |
| `studentId` | yes | |
| `type` | yes | `charge` \| `payment` \| `concession` \| `adjustment` (Q2, decided) |
| `amount` | yes | positive whole rupees; signed on `adjustment` entries only (Q2) |
| `reason` | yes | required for `charge`, `concession` and `adjustment` |
| `createdBy` | yes | account id of the logged-in user |
| `approvedBy` | yes | nullable |
| `receiptId` | yes | nullable — the month record's `receiptNo`; several `payment` entries in one month share it (Q6, decided) |
| `runningBalance` | yes | student's balance after this entry — see Q5 |
| `createdAt` | yes | ISO timestamp |
| `createdByName` | **addition** | Q3 |
| `month` | **addition** | which billing month the entry belongs to (the app bills per month) — Q1 |
| `paymentRecordId` | **addition** | the month record the entry belongs to — Q1 |
| `method` | **addition** | Cash / JazzCash / … on `payment` entries — needed for handover totals by method |

**Immutability:** rows are only ever inserted — Q4 decides where that is enforced.

**Questions**

- **Q1. Alongside the month records, or replacing them?** The spec calls the ledger the replacement for ad-hoc payment tracking, and also says *do not break existing receipt/payment/student flows*.
  **DECIDED (owner, 2026-09-14): alongside.** Every new month's bill is posted as a `charge` entry, every collection as a `payment` entry, every concession as a `concession` entry, each linked to its month record. The 52 existing screens keep reading the month records unchanged. Replacing them is a separate, later decision.
- **Q2. How is a correction recorded?** The spec says corrections are *"a negative adjustment with a reason"*, but its `type` list has no adjustment type and `amount` is always positive.
  **DECIDED (owner, 2026-09-14): a fourth type `adjustment`**, carrying a signed amount and a required reason.
- **Q3. `createdBy` when accounts are not backed up.** After a restore on a new PC the account ids in the ledger point at no account.
  **DECIDED (owner, 2026-09-14):** store `createdByName` (the name at the time) beside `createdBy`.
- **Q4. Where is "never edited or deleted" enforced?**
  **DECIDED (owner, 2026-09-14):** the main process refuses any change or delete of an existing ledger row; a full restore is the only thing that replaces the table.
- **Q5. `runningBalance` stored, as the spec says?** Storing it matches the spec and the receipt example. The risk: an entry dated earlier than existing ones (arrears for a past month) makes later stored balances wrong, because rows can never be corrected.
  **DECIDED (owner, 2026-09-14):** store it as the spec says, computed at insert in the order entries are created (not the order of the months they belong to), and state on screen that it is the balance after each entry as recorded.
- **Q6. `receiptId` and voiding.** The spec voids a wrong receipt and issues a fresh one. Earlier answer (to re-confirm): receipt numbers stay one per month record. Then several `payment` entries share one `receiptId`, and "void" cannot mean one receipt per collection.
  Choose: **(a)** one receipt number per collection, as the spec implies; or **(b)** keep one per month record and record a mistake as an `adjustment`, with no void status.
  **DECIDED (owner, 2026-09-14): (b).** Receipt numbers stay one per month record, and a month's `payment` entries share its `receiptId`. There is no void status on receipts; a wrong collection is corrected by an `adjustment` entry with a reason.

---

## §2.2 `warden_collections`

**Spec:** links each payment entry to the collecting warden for handover; status
`pending_handover → handed_over → approved (or disputed)`. The spec leaves "table
or filtered view" to the implementer.

**Proposed:** a **table**, because `student_ledger` rows can never change, so a
status that moves through four values cannot live on them.

| Field | Notes |
|---|---|
| `id` | |
| `ledgerEntryId` | the `payment` entry |
| `wardenId` | = that entry's `createdBy` |
| `amount`, `method` | copied from the entry, so handover totals read one table |
| `status` | `pending_handover` \| `handed_over` \| `approved` \| `disputed` |
| `handoverId` | nullable, set when handed over |
| `updatedAt` | |

- **Q7. DECIDED (owner, 2026-09-14): a table.**
- **Q8. Which payment methods need handing over?**
  **DECIDED (owner, 2026-09-14): all** methods appear; approval does not change the dashboard's Available Fund.

---

## §2.3 `handovers` and `handover_items`

**Spec:** `handovers: id, warden_id, admin_id, total_amount, status
(pending|approved|discrepancy), notes, created_at, approved_at`;
`handover_items: handover_id, ledger_entry_id`.

**Proposed:** both tables as the spec writes them, camelCased. Two additions:

| Addition | Why |
|---|---|
| `handover_items.id` | every table in this app is keyed by `id` |
| `handovers.countedAmount` | spec §3.3 has the admin compare counted cash to the system total; recording what was counted makes a discrepancy checkable later |

- **Q9. DECIDED (owner, 2026-09-14): yes**, record `countedAmount`.
- **Q10. Who is "admin"?**
  **DECIDED (owner, 2026-09-14):** any account with the **Manage users** permission.

---

## §2.4 `concessions`

**Spec:** `student_id, type (rent|mess|both), amount_or_percent, reason,
requested_by, approved_by (admin, required; auto-approved if admin created it),
start_date, end_date` — table, or a specialisation of `student_ledger`.

**Proposed:** a **table**, because a request waits for approval and has a date
range, and neither fits an immutable ledger row. When a concession applies to a
billed month, a `concession` entry is posted to `student_ledger` with the reason.

| Field | Notes |
|---|---|
| `id`, `studentId` | |
| `type` | `rent` \| `mess` \| `both` |
| `value` | the concession's number — Q11 |
| `isPercent` | `true` = `value` is a percent, `false` = rupees — Q11 |
| `reason` | required |
| `requestedBy`, `approvedBy`, `approvedAt` | `approvedBy` set immediately when an admin creates it |
| `startDate`, `endDate` | `endDate` nullable |

- **Q11. DECIDED (owner, 2026-09-14): one number plus a flag** — `value` + `isPercent`.
- **Q12. DECIDED (owner, 2026-09-14): yes.** An approved concession fills the month record's existing `concession` field for each month it covers (so existing screens show it), as well as posting the ledger entry.

---

## §2.5 Hostel-type rate settings

**Spec:** existing `monthly_rent`, `monthly_mess`; new `daily_rate`, independent of
the monthly rate, a default suggestion only; changing it never alters past rows.

**What exists:** rent and mess are set per **room type** in Settings
(`roomTypes[].defaultRent`, `defaultMess`). The app's *service model*
(`rent` / `rent_mess_optional` / `rent_mess_bundled`) is a hostel-wide setting
with no amounts on it.

- **Q13. Per room type or one hostel-wide figure?**
  **DECIDED (owner, 2026-09-14): one hostel-wide figure** — `settings.dailyRate`, a default suggestion only.

---

## §2.6 Student mess exemption

**Spec:** `mess_exempt`, `mess_exempt_reason`, `mess_exempt_approved_by`.

**Proposed:** three fields on the student record: `messExempt`,
`messExemptReason`, `messExemptApprovedBy`. The app already has `messOptIn` for
hostels where mess is optional; the exemption applies to bundled hostels.

- **Q14. DECIDED (owner, 2026-09-14): spec fields only** — no `messExemptFrom`.

---

## §2.7 Admission / undertaking tracking

**Spec:** `first_signed_at`, `rules_version_at_signing`, `undertaking_file`.

**Proposed:** `firstSignedAt` and `rulesVersionAtSigning` on the student record.
`undertakingFile` uses the **student documents store that already exists**
(`docs.files` on the student, added in 7955fa4) as a document of kind
`undertaking`, rather than a new file mechanism.

- **Q15. DECIDED (owner, 2026-09-14): yes**, the signed scan is a student document of kind `undertaking`.
- **Q16. Where does the rules text and its version live?**
  **DECIDED (owner, 2026-09-14):** an editable rules text in Settings whose version increases on each save, with earlier versions kept so a reprint shows what was signed.

---

## Migration (nothing destructive)

- New tables `student_ledger`, `warden_collections`, `handovers`,
  `handover_items`, `concessions`: `CREATE TABLE IF NOT EXISTS`, added to
  backups, exempt from the recovery check's "missing table" rule.
- New fields on students, room types and settings are optional; absent means
  "not set". No existing field is renamed or removed.
- **Q17. Existing history. DECIDED (owner, 2026-09-14):** import it once as
  read-only entries. On the Q1 recommendation that means, per existing month
  record: one `charge` entry for its bill, one `payment` entry per instalment
  (named collector only, no account id), a `concession` entry where it has one,
  and reversals as `adjustment` entries (Q2 decided).

---

## Answers beyond the schema

| Topic | Status |
|---|---|
| Amount Paid read-only once collected (spec step 6) | **CONFIRMED 2026-09-14** |
| Add Payment box = cash received now, added to what the month holds | **CONFIRMED 2026-09-14** |
| Receipt shows the student's newest 5 ledger lines (spec step 5) | **CONFIRMED 2026-09-14** |
| Where the ledger screens live | **DECIDED 2026-09-14: the Users page**, replacing the earlier "Finance Collections page" answer. Reason (owner): a warden opening Users today sees only "You cannot manage users" (`users.js` `renderUsers()`), so the page is empty for them. A warden gets **My Collections** there; an account with Manage users keeps the user list and also gets the **Wardens** view (handovers to approve). |

---

## Feature decisions (spec §3, second round — owner, 2026-09-14)

What the code does today was checked first; each answer is against that.

| Spec | Today | Decided |
|---|---|---|
| §3.3 discrepancy | — | Handover stays `discrepancy` with the note; its entries are `disputed` until the admin approves it after settling (a fix is an `adjustment`). |
| §3.3 admin's own collections | — | **No handover.** A Manage-users account's `payment` entries are recorded and auto-approved. |
| §3.3 partial approval | — | **YES — admin ticks entries.** Ticked entries → `approved`; unticked go back to the warden's `pending_handover` and leave that handover. Consequence: a handover needs `approvedAmount` beside `totalAmount`. |
| §3.3 visibility | — | A warden sees **only their own** collections. Only Manage-users accounts see the Wardens view. |
| §3.2 server-side check | main process has no session | Main process **locks ledger rows only** (Q4). The "who may view an entry" check lives in the screens. No new login system. |
| §3.1 collector | `collectedBy = CUR_USER.name`, falls back to `'Warden'` / `'Auto'` (`payments.js`) | **Block collecting when nobody is logged in.** |
| §3.1 receipt line | — | Collector written as **first name**: `Ali: 5,000 (bal 5,000)`. |
| §3.1 Add Payment context | — | Newest **5** entries, same as the receipt. |
| §3.6 bundled mess | receipt prints Room Rent + Mess Charges as two lines in every model (`receipt.js`) | **One combined line on every student-facing surface** (receipt, payment form, profile print); rent and mess stay stored separately. |
| §2.6 mess exemption | — | **Warden requests, admin approves** (same one-tap flow as concessions). Consequence: the student record also needs `messExemptRequestedBy` and a pending state until approved. |
| §3.7 profile print | `printStudentCard()` prints the full payment history | Profile prints a **summary only**; a new **Print Payment History** prints the full ledger, any number of pages. |
| §3.5 PIN | no PIN exists; eye toggle only on the login field | **Per warden**, off by default, switched on in the Users page; a warden sets/changes their own PIN. Eye toggle added to every password/PIN field (Users editor, onboarding, PIN). |
| §3.9 concession approval | — | Approved from the **Users page Wardens view**, beside pending handovers. |
| §3.10 prorated | — | Posts the `charge` entry (`12 days @ 650/day = 7,800`) **and** sets that month record's rent. |
| §3.8 undertaking gaps | — | A **filter on the Students page**. |
| §5 order | — | **Spec order 1 → 11, each step shown working and approved before the next.** |

---

## Step 2 decisions (owner, 2026-09-14, asked before code)

| Case | Decided |
|---|---|
| A month's bill changes after it was created (Edit form, merge into pending, Settings re-pricing) | **Adjustment entry with an automatic reason**, e.g. `Monthly charges changed 14,500 → 15,500 · Edited on the payment form`. A new extra charge posts as a charge. |
| A payment record is deleted | **One adjustment cancels its net effect**; its entries stay. |
| Settings → Reset ALL Data | **Clears the ledger too** — treated as a restore to empty. |
| Payments typed against a manual name (no student) | **Left out** of the ledger. |

---

## Step 2 — as built (2026-09-14, not yet committed, awaiting your review)

**Files:** `migrations/002-student-ledger.js` (table + guards), `renderer/src/ledger.js`
(posting), hooks in `finance.js`, `storage.js`, `app.js`, `payments.js`, `dashboard.js`,
`settings.js`, `students.js`, `cancellations.js`, `modals.js`; `main.js` + `preload.js`
channels; tests `tests/ledger.test.js` (22) and `tests/ledger-store.spec.js`.

**How rows are protected (Q4):** SQLite triggers abort any UPDATE or DELETE on
`student_ledger`; the generic `db:upsert / db:delete / db:bulkReplace` channels refuse
the table; new rows go through `ledger:append`, which refuses an existing id with
different content. Only `ledger:replaceAll` (restore, Reset All Data) and a menu
backup import replace the table, inside one transaction.

**How entries are posted:** each place that creates, changes or deletes a month
record calls `ledgerTrack(record)` afterwards. It compares the record with what the
ledger already holds for it and posts only the difference, so calling it twice posts
nothing. Collections and reversals are posted from `applyPayment()` /
`reversePayment()`, which every Mark Paid, bulk settle, arrears and checkout path
already uses.

**What a month bills is read from the Payments page's own answer**
(`calculateOutstanding()` + collected − credit), never re-added from the rent fields.
Records whose stored balance disagrees with their fields exist, and every screen
believes the balance; the ledger does the same, so a student's ledger balance always
equals what the Payments page says they owe.

**Fields added beyond the approved schema — for your OK:**

| Field | Why |
|---|---|
| `part` | Which part of the month record an entry posts (`monthly`, `admission`, `extra:<label>`, `concession`, `instalment`, `collected`, `reversal`, `deleted`). This is how the ledger knows what it has already posted, so an edit posts only the change. |
| `imported` | `true` on entries from the one-time history import (Q17). |
| `seq` (table column, not in the entry) | Keeps entries in creation order even after a database VACUUM, which the running balance depends on (Q5). |

**Two things to know before step 3:**

1. **`receiptId` is empty on most entries.** A receipt number is given to a month
   record the first time its receipt is printed, which is usually *after* the money
   is collected, and a ledger row cannot be filled in later. Every entry carries
   `paymentRecordId`, so the receipt number is always one step away; step 5 reads it
   that way.
2. **Checkout part-month refund.** The app writes that refund as a concession but
   does not lower the record's balance, so the Payments page's figure does not move.
   The ledger follows the Payments page: it posts the concession and an equal
   `Monthly charges changed` adjustment, netting to zero. The wording is misleading;
   whether the checkout should lower the balance is an existing-app question, listed
   here rather than changed.

**First boot on a client's install:** after the start-up repairs, the whole payment
history (live and archived) is posted once in date order, marked `imported`, with
collectors named and no account id.

---

## What happens next

Your review of step 2 above. Then spec §5 step 3: the read-only **My Collections**
view on the Users page — shown to you before code — and steps 4 → 11 in the spec's
order, each approved before the next.
