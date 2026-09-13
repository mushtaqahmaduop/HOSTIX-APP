# Warden Collection Ledger — implementation plan & build order

## Context
Owner spec `Downloads\hostix-warden-ledger-spec.md`: hostels with several wardens reconcile cash by hand from paper receipt copies. Goal: every collection attributed automatically, an immutable trail no warden or admin can quietly alter, and handover becomes "system total vs. counted cash". Same spec adds concessions with approval, mess exemption, daily-rate proration, PIN option, and a profile/admission/undertaking document.

The code already carries most of the raw material — the plan **extends** it, it does not replace it:
- `p.partialPayments` (per-instalment trail, `finance.js:218`) and `p.reversals` (`finance.js:281`) — ~80% of a payment ledger, but stored inside a mutable record.
- `applyPayment()` / `reversePayment()` in `renderer/src/finance.js` — the money authority; `outstandingOf()` / `resolveCharges()` in `utils.js` feed 52 read sites.
- Three service models already exist (`config.js:21`); rent and mess already stored separately.
- Concession fields on the month record; checkout pro-rata refund policy in Settings; 30-min idle logout; login eye toggle.

Proven holes the plan closes: Amount Paid is freely editable and **lowering it records nothing** (`payments.js:3501`); merge paths overwrite the record's `collectedBy` (`payments.js:2451`, `:3166`); two write paths push instalments without `applyPayment` (`payments.js:3179`, `:3515`); Delete leaves only an activity-log line.

## Decisions taken (owner, 2026-09-14)
| # | Decision |
|---|---|
| Enforcement | Ledger table is **insert-only in main.js**. Who-may-do-what stays a renderer permission check (main has no session; accounts live in renderer localStorage). |
| Approver | Holders of the `users` permission. No new role. |
| Receipts | **One receipt number per month record** (as today, `receipt.js:44`). A wrong collection is corrected by a reversal ledger entry; the receipt reprints under the same number with corrected figures. |
| Old data | One-time import of existing `partialPayments`/`reversals` (live + archive) as read-only `imported` entries. |
| students.js | Owner's uncommitted Add Student redesign is **committed first**. |
| Lock scope | **Amount Paid read-only** once anything is collected. Delete stays allowed with `delete` permission (but is recorded in the ledger). |
| Handover | **All payment methods** appear; approval does **not** change Available Fund. |
| Receipt history | Re-add compact history, **newest 5 lines** + "+N earlier". |

## Architecture

### New table `ledger` (JSON blob, like every other table)
- `main.js`: `CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, data TEXT NOT NULL)`; add to `BACKUP_TABLES` (`main.js:45`).
- `renderer/src/storage.js` `_TABLE_MAP`: `ledger: 'ledger'`; default `DB.ledger = []` beside the `d.transfers` guard in `modals.js:257`.
- No `SCHEMA_VERSION` bump needed (additive table). Known downgrade cost: an older build ignores the `ledger` key on restore — recorded, acceptable.

**Insert-only guard in main** (the real enforcement):
- `db:upsert` on `ledger`: plain `INSERT`; if the id exists, succeed only if the stored JSON is byte-identical (idempotent resend), otherwise refuse.
- `db:delete` on `ledger`: always refuse.
- `db:bulkReplace` on `ledger` (the `_saveDBFull` fallback, `storage.js:268`): insert missing rows only, never delete, refuse differing rows.
- `db:importFull` (restore) remains the one sanctioned replacement — already behind backup permission + pre-restore snapshot.

**Entry shape** (all money through `money()`):
`{ id:'lg_'+uid(), type, studentId, studentName, paymentId, month, amount, method, reason, days?, rate?, before?, after?, refId?, byId, byName, approvedById?, approvedByName?, imported?, createdAt }`
- `type`: `payment | reversal | adjustment | record_deleted | concession_request | concession | mess_exemption_request | mess_exemption | prorated_charge`.
- `byId` = `CUR_ROLE` (the WARDENS key — stable across renames, `modals.js:1050`); `byName` = name snapshot, because user accounts are **not** in backups and the name is what survives a restore to a new PC.
- Approvals are **new entries referencing `refId`**, never edits of the request.
- **Running balance is derived at read time, not stored** (deviation from spec): arrears post to earlier months and entries can be backdated, so a stored balance goes wrong on the first out-of-order insert.

**The month payment record stays the aggregate** every screen reads. `finance.js` gains `ledgerAppend(entry)` and `ledgerFor(paymentId|studentId)`; `applyPayment` / `reversePayment` append their entries. No read site changes.

### New table `handovers` (mutable status only)
`{ id, wardenId, wardenName, entryIds[], totalsByMethod{}, systemTotal, status: pending|approved|discrepancy, countedAmount?, notes?, createdAt, decidedById?, decidedByName?, decidedAt? }`
- Main guard: refuse delete; refuse changes to `wardenId / entryIds / totalsByMethod / systemTotal / createdAt` after insert.
- An entry's handover status is **derived** (in a handover → that handover's status; else pending). A reversal or deletion of an already-handed-over collection appears as a negative line in the warden's next handover — visible, never silent.

## Build order
Each phase: its own commit(s) on `feature/warden-ledger`, full test gate before the next, push. PR to master only on owner's word.

**Phase 0 — Prep**
- Owner confirms students.js/students.css ready → commit as-is on `feature/dashboard-1c`. Leave `package-lock.json` and `tests/tmp-*` untouched (ask separately).
- Branch `feature/warden-ledger` from the `feature/dashboard-1c` tip (receipt/payments changed there; it is 65 ahead of master).
- Record baseline: node suites, typecheck, Playwright in batches of 6–8.

**Phase 1 — Ledger foundation (no UI change)** — *design refined 2026-09-14 after reading every write path*
- Table wiring + main insert-only guard (above).
- `finance.js`: `LEDGER_SIGN`, `ledgerAppend`, `ledgerIndex`, `ledgerNet`, `ledgerFor`, `ledgerSync`, `ledgerBackfill`; declared in `renderer/globals.d.ts`. `applyPayment` / `reversePayment` append their own entries (method, note, reason).
- **Reconciliation instead of per-site instrumentation.** Collected money is written in at least eight places outside §14: both "update the pending record" merges (`payments.js:2444` writes no instalment at all; `:3170`), `submitEditPayment` (`:3527`, lowering is silent), the dashboard inline edit (`dashboard.js:3112`), admission/restore (`students.js:4563`), the Excel import (`settings.js:3548`), and three delete paths. `saveDB()` calls `ledgerSync(prevPaymentIds)` before writing: any live record whose `amount` ≠ its ledger net gets an entry for the difference (payment up / reversal down, current user, `source:'sync'`); a record gone from `DB.payments` and not in `DB.archive` gets `record_deleted`. Every path is covered by construction, no Phase-1 edit to the merge flows, and the invariant `ledgerNet(p.id) === p.amount` holds for every record.
- **Restore and Reset move onto `db:importFull`.** `restoreBackup()` / `restoreFromPaste()` (`modals.js:325/374`) replaced `DB` in memory and `saveDB()`d it — skipping main-side validation and the pre-restore snapshot that Settings → Import Data (`storage.js:427`) already gets. `resetAllData()` (`settings.js:3585`) had no snapshot either. All three go through one shared import function, so the insert-only guard has exactly one sanctioned exception, and Reset becomes undoable. Reset keeps today's scope (archive, transfers, settings preserved) and clears the ledger with the payments it describes.
- **Backfill** (no settings flag — idempotent): any record (live, or `_src:'payments'` in archive) with no ledger entries imports its trail, reversals and an unaccounted residual as `imported` entries, ids `lg_imp_<paymentId>_p<n>/_r<n>/_x`; a trail claiming more than was collected is not believed (one entry). Runs after `loadDB()`; persisted only when `!isReadOnly()` — an expired licence keeps it in memory and recomputes identically next boot.
- Tests: `tests/ledger.test.js` (written first, 23 cases: attribution, conservation across every write path, sync idempotence, deletion vs archiving, backfill shapes and determinism); `tests/ledger-main-guard.spec.js` (bridge-level refusal of overwrite/delete/bulk rewrite, identical resend accepted, restore replaces, backup export carries `ledger`, a real collection round-trips to disk).

**Phase 2 — Amount lock + audited edits** — *as built 2026-09-14:* Amount Paid read-only once collected on Edit Payment (and ignored on save), with "Receive payment…" → `openAddPayment(studentId, month)` and "Reverse a collection…" beside it. **Owner ruling: the Add Payment box is the cash RECEIVED NOW**, not the running total — it opens empty, already-collected rides on `f-ppaid.dataset.already` and in the banner, and both merges set the bill then `applyPayment(received)` (they had REPLACED the collected amount with the typed figure). The dashboard month-view cell no longer edits a collected amount. `showConfirm()` replaces the open modal, so the per-student modal now captures its form before asking; the owner chose to retire that modal next. Bill changes (rent, mess, extras, admission, concession) need a reason on a collected record and every one becomes an `adjustment` entry (absent from `LEDGER_SIGN` — never moves cash); merges record theirs with an automatic reason. A reversal now requires a reason. Delete stays as Phase 1 left it (`record_deleted` via sync). Tests: ledger.test.js +6, new `tests/amount-lock.spec.js`.
- Edit Payment: `f-ppaid` read-only once `amount > 0`; a "Reverse…" action beside it (existing `reversePayment`, reason required).
- Rent / mess / extras / admission fee / concession stay editable (lock scope decision) but, on a record with collections, require a reason and write an `adjustment` entry with `before/after`.
- Delete (still `delete` perm): writes `record_deleted` carrying collected amount per method before removal.
- Update `tests/finance-flows.spec.js`; add a spec that lowering Amount Paid is impossible from the form.

**Phase 3 — Read-only views (verify data before write actions)**
- Student panel ledger (`students.js` ~1159–1309): lines with collector, type, reason, derived balance.
- "My Collections" page: current user's un-handed entries, totals by method, live.
- Add Payment page: "Previous payments" panel for the selected student (last N ledger lines with collector).

**Phase 4 — Handover & approval**
- Warden: "Hand Over" bundles their pending entries → `handovers` row (pending).
- Admin (`users` perm): "Warden Ledger" page under Users — pending per warden, system totals by method; **Approve** or **Flag discrepancy** (counted amount + note). `logActivity` on each.
- Available Fund untouched.

**Phase 5 — Receipt**
- Re-add compact history in `buildReceiptHTML` (`receipt.js:247`): newest 5 ledger lines for the month record, `Name: 5,000 (bal 5,000)`, charges `+2,000 late fee`, "+N earlier"; keep the 80mm constraints (no emoji, monospace). Collector line already reads the session — confirm.

**Phase 6 — Payment History report + slimmer profile print**
- New per-student "Payment History" definition through `renderer/src/export/engine.js` (PDF + Excel from one def, room-order rules apply).
- `printStudentCard` (`students.js:3274`) drops the full history table → summary (total paid, pending, last payment date/amount).

**Phase 7 — Service-model display + mess exemption**
- Gate: owner names the screen showing rent+mess as two rows in a bundled hostel (receipt itemises on purpose, `receipt.js:179`).
- Bundled: one combined "Monthly charge" line on the named screens; storage split unchanged.
- `student.messExempt {reason, fromMonth, approvedById/Name}` honoured inside `resolveCharges()` (`utils.js:377`) — the single charge authority, so all 52 sites follow. Warden requests, `users` perm approves; ledger entries both ways.
- Extend `tests/service-model.test.js`, `tests/outstanding.test.js`.

**Phase 8 — Concessions with one-tap approval**
- Warden → `concession_request`; admin one-tap → `concession` entry applied to the month record's `concession`/`concessionDesc`. Admin-created = auto-approved. Pending request does not change the bill (default; confirm at phase start).
- Approvals inbox on the Warden Ledger page.

**Phase 9 — Daily rate & prorated charge**
- Gate: per room type or hostel-wide; rent only or rent+mess.
- `roomTypes[].dailyRate` (default: per room type) in Settings → Rent & Mess.
- Prorated form on admission / Add Payment: Days (default remaining days, same day-counting convention as the refund policy) × Rate (default saved rate), both editable, live total → written as an extra-charge line `Prorated: 12 days @ 650` + `prorated_charge` ledger entry with days/rate. Update the no-pro-rata note at `finance.js:331`.

**Phase 10 — Credentials**
- Eye toggle on every password field (users.js, onboarding, change-password, modals) — one shared helper, same pattern as `index.html:247`.
- Optional PIN (gate: separate PIN vs password; per receipt vs per shift): `pinHash` via existing `hashPassword()` PBKDF2; global "Require PIN on receipt issue" + per-user override, off by default; user sets own PIN from own account; reuse lockout counters.
- Idle logout already exists; "Switch user" deferred.

**Phase 11 — Profile + Admission form + Undertaking**
- Gates: rules text source (default: editable in Settings, version increments on save, old versions kept); scan storage (default: file under userData, which means a new IPC — breaks the preload exact-set test deliberately — and backups must carry attachments).
- "Print Profile" (front only) / "Print Full Admission Form" (front + rules + Student/Guardian/Warden signature lines). First generation freezes `firstSignedAt` + `rulesVersionAtSigning`; later prints watermarked "REPRINT — originally signed <date>".
- Upload/view signed scan; Students filter "no signed undertaking on file".

## Constraints carried through every phase
- CLAUDE.md hard rules: never edit on master; `fmtPKR()` once; `escHtml()` on every new user-typed field (reason, notes, rules text) and `showModal`/`showConfirm` titles; room-order sorting; tokens only; 1366×768 floor; both themes.
- No calculation changes outside the ledger's own additions; `outstandingOf()` stays the one answer to "what is owed".
- Playwright profile must contain `license.enc`; clear `DB.rooms` in fixtures (42 demo rooms).

## Verification (per phase)
```powershell
$env:HOSTIX_TEST_PROFILE = "$env:LOCALAPPDATA\Temp\hostix-test-profile"
npm run typecheck
npm run test:services; npm run test:retention; npm run test:license; npm run test:update; npm run test:export
node tests/finance.test.js; node tests/outstanding.test.js; node tests/cash-events.test.js; node tests/ledger.test.js
npx playwright test <6-8 spec files per run>   # incl. ledger-main-guard, finance-flows, backup-main-guard, html-escaping, smoke, theme-parity, responsive-floor
```
- Manual smoke in `npm start`: login → add student → Warden A collects 5,000 → Warden B collects 3,000 → reverse 1,000 with reason → receipt shows 5-line history → each warden hands over → admin approves one, flags one → restore a backup and confirm ledger survives and main still refuses edits.
- UI phases: run `design-governance` and `qa-regression` agents before calling a phase done.

## Parked for later discussion (owner's instruction)
Visual redesign steps 2–5 (ENTERPRISE-AUDIT-2026-09-10), security handoff P1 items (discovery `redirect:'follow'`, BrowserWindow hardening, packaging exclusions), code signing, ia32 installer.
