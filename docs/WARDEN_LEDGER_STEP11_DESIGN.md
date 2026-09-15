# Warden Ledger — Step 11: Profile, Admission Form, Undertaking (spec §2.7, §3.7, §3.8, §5 step 11)

Status: **BUILT** — approved by the owner 2026-09-15 ("approve and build step 11"), with
the three choices as shown (own Settings tab; the undertaking counts toward the 5-document
limit; the Print tile becomes Admission Form).

## Owner decisions this design follows

| Question | Answer |
|---|---|
| Where the signed scan lives (Q15, 2026-09-14) | A **student document of kind `undertaking`** in the documents store that already exists |
| Where the rules text lives (Q16, 2026-09-14) | **Editable in Settings**; the version goes up on each save; earlier versions are kept so a reprint shows what was signed |
| Profile print (§3.7 row) | **Summary only**; a separate **Print Payment History** prints the full ledger, any number of pages |
| Undertaking gaps (§3.8 row) | A **filter on the Students page** |
| Rules text to start with (2026-09-15) | **A starter template to edit** — generic, no hostel or person named; the full form can not be printed until an admin has saved it once |
| When the undertaking becomes the original (2026-09-15) | **The first Print Full Admission Form** freezes the signing date and rules version; every later print is a **REPRINT** |
| Reprinting the signed scan (2026-09-15) | **Image scans print watermarked; PDF scans are view/download only** |
| Look (2026-09-15, with HOSTYLLO_DESIGN_SPEC.md) | **Today's styles now**, restyled when the design rebuild reaches Students and Settings. Prints follow the spec's Part 8 now: **hostel name is the masthead, HOSTYLLO a small footer line** |

## What the code does today

- `printStudentCard()` (students.js) prints an A4 "Resident Record": identity, room, four
  totals, **the full month-by-month payment table**, and an "Authorised By" signature line.
  It is reached from the panel header ("Print Profile"), the panel's **Print** tile, and the
  older profile modal.
- There is **no rules text, no undertaking and no signing record** anywhere.
- Documents: `docs.files` on the student, kinds `studentId`, `fatherCnic`, `por` plus
  `other`; images or PDF, 3 MB each, **5 per student**.

---

## Part A — Rules & Undertaking in Settings (new tab)

A seventh Settings tab, **Rules & Undertaking**, for accounts with the Settings permission.

```
Rules & Undertaking                                   Version 3 · saved 15 Sep 2026 by Owner
─────────────────────────────────────────────────────────────────────────────────────────
Rules (one per line — printed as a numbered list)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Residents must carry their hostel ID and show it when asked.                          │
│ Monthly charges are due by the date set by the hostel …                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
Responsibility declaration
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ I have read the rules above, understood them, and agree to follow them …              │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                                              [ Save as new version ]
Earlier versions
  v2 · 02 Sep 2026 by Owner · signed by 14 students            [ View ]
  v1 · 20 Aug 2026 by Owner · signed by 31 students            [ View ]
```

- Stored in `DB.settings.undertaking = { starter, versions: [{ v, rules, declaration, savedAt, savedByName }] }`
  — settings are already in every backup.
- **Save as new version** only when the text actually changed; it never rewrites an old
  version. "Signed by N students" counts `rulesVersionAtSigning`.
- Until an admin saves once, a banner reads **"Starter text — review and save it before
  printing admission forms."**

### The starter text (for your review)

Rules:
1. Residents must carry their hostel ID and show it when asked.
2. Monthly charges are due by the date set by the hostel. Late payment may carry a fine.
3. Guests are allowed only in the visitors' area and only during visiting hours.
4. Residents must be back inside the hostel before the closing time set by the management.
5. Smoking, drugs, alcohol and weapons are not allowed anywhere on the premises.
6. Rooms, furniture and fittings must be kept in good condition. Damage is charged to the resident responsible.
7. Noise must be kept low, and quiet hours set by the management must be respected.
8. Only electrical appliances allowed by the management may be used in rooms.
9. Leaving the hostel needs one month's written notice to the management.
10. The management may inspect rooms, and may cancel a seat for breaking these rules.

Declaration:
> I have read the rules above, understood them, and agree to follow them for as long as I
> live in this hostel. I accept responsibility for any damage I cause and for paying my
> charges on time. My guardian has read these rules with me and accepts responsibility for
> my conduct and my dues.

---

## Part B — Three prints from the student panel

| Where | Action |
|---|---|
| Panel header | **Print Profile** (as today) |
| Panel action grid | the **Print** tile becomes **Admission Form** |
| Financial tab, on the payment history card | **Print Payment History** |

### 1. Print Profile — front page only, one A4

- Masthead: **hostel name** and address. Title "Student Profile".
- Student information, room, hostel plan (Rent + Mess / Rent only), status, join date — as today.
- **Balance summary** from the student ledger: **Total paid · Pending balance · Last payment
  (date · amount · collected by)**.
- **Removed:** the month-by-month payment table and the "Authorised By" signature line.
- Footer (small): `Printed 15 Sep 2026, 07:49 pm by Sara · HOSTYLLO Offline`.

### 2. Print Full Admission Form — profile + Rules & Undertaking

- Page 1 is the profile above. **Page 2** (its own page, for double-sided printing):
  "Rules & Undertaking · Version N", the numbered rules, the declaration, and **three
  signature lines** — Student, Guardian, Warden / Admin — with the student's name, the
  father/guardian name on file and the signed-in account's name printed under each line,
  and a date line.
- **First time** (no signing on record) — a confirmation first:
  *"This prints the original admission form. Today (15 Sep 2026) and rules version 3 will be
  recorded as the signing. Every later print will be marked REPRINT."*
  On confirm: `firstSignedAt`, `rulesVersionAtSigning`, `firstSignedByName` are written to
  the student and the activity log records it. Late filing is fine — the date is simply the
  day it was first printed.
- **Every later print** uses **the version that was signed** (not today's rules), carries a
  diagonal **"REPRINT — originally signed 15 Sep 2026"** watermark on both pages, and asks
  nothing. The original can never be generated twice.
- Blocked, with the reason, while the rules are still the unsaved starter text.

### 3. Print Payment History — any number of pages

- From the **student ledger**, every entry oldest first:
  `Date · Month · Entry · By · Charged (+) · Received (−) · Balance`
  (Entry uses the same short tags as the receipt: `Sep rent+mess`, `concession`,
  `reversed`, `adj`, …, with the full reason in small type under it).
- Column headings repeat on every page; totals charged, received and the closing balance
  at the end. Hostel masthead, same footer as the profile.

---

## Part C — The signed scan (Documents tab)

- A new named row **Signed undertaking** (document kind `undertaking`) — Attach, View,
  Download, Remove, exactly like the other named documents. It counts toward the
  5-document limit.
- Under it: **"Original printed 15 Sep 2026 · rules v3"** or **"Admission form not printed yet"**.
- **Reprint** beside an **image** scan prints the image on A4 with the diagonal
  **"REPRINT — originally signed 15 Sep 2026"** (the signing date on record; the date the
  scan was attached when the form was never printed from the app). A **PDF** scan shows
  View and Download only, with the reason on hover.

## Part D — Students page filter

A new toolbar select, **Undertaking**: `All` · `Signed scan on file` · `No signed scan`.
It resets with the other filters, and exports follow it like every other filter.

---

## Three choices shown for confirmation

1. Rules & Undertaking is **its own Settings tab** (not a card inside Hostel Info).
2. The signed undertaking **counts toward the 5-document limit**.
3. The panel's **Print** tile becomes **Admission Form**; **Print Profile** stays in the
   panel header.

## Files

- `renderer/src/undertaking.js` (new) — rules versions (`undRules`, `undVersion`,
  `undSave`, `undIsStarter`), signing (`undSignOriginal`, `undSignedVersion`), scan state
  (`undScanOf`), the filter predicate — unit-tested
- `renderer/src/modules/settings.js` — the tab and its panel
- `renderer/src/modules/students.js` — the three prints, the panel tile, the Financial-tab
  button, the Documents row and scan reprint, `STU_DOC_KINDS`, the filter select
- `renderer/src/modules/rooms.js` — the filter's default
- `renderer/index.html`, `renderer/globals.d.ts`
- tests: `tests/undertaking.test.js` (versions, first print freezes once, reprint reads the
  signed version, filter), `tests/undertaking.spec.js` (Settings save → first full print
  confirms and records → second print is a reprint with the watermark → profile has no
  payment table or signature → payment history prints every ledger entry → scan attach,
  image reprint watermarked, PDF has no reprint → filter)
