# Session handoff — 2026-09-28 (evening)

Written 19:45 PST. The next session resumes automatically at 20:20 with the
work order in **§4**. Read §1–§3 first; they say what is on disk and what is
only on this machine.

---

## 00. LATER THE SAME NIGHT — the owner said "decide best possible answer for me"

All eight questions decided. Everything local is done; the outward steps wait for a "go".

| # | Question | Decision | State |
|---|---|---|---|
| 1 | Staff accounts in backups (BUG-012) | Include them, hashed only | Done `d1c5623`, fix 9 |
| 2 | BUG-011 | Fix | Done `779566b`, fix 8 |
| 3 | S3 Pending vs Arrears | Red = late money: Pending/Partial amber, Arrears/Overdue red | Done `f58313a` |
| 4 | S4 Open issue | Neutral; red = High priority | Done `f58313a` |
| 5 | Colour scope | Phase 0 now; Phase 1 after a visual review | Phase 0 done `f58313a` |
| 6 | Move commits to a 6.1 branch | Yes | **Blocked** — resetting the PR branch was refused by the permission check; the owner runs the 3 commands in the final report |
| 7 | Reverse: required choice | Yes, nothing preselected | Done `6edc296` |
| 8 | Control-plane redeploy + installer | Redeploy first (the flag defaults off, so no hostel changes), then build 6.1.0 | **Waiting for the owner's go** — outward-facing |

Also found: a fourth restore path (`importData()` in settings.js, unreachable) still did the old unsafe restore; it now uses `importBackupData()`.

Why Owner Funds did not show in the owner's dev app: it is opt-in, and the control plane has not been redeployed, so
nothing turns it on. Dev switch (DevTools): `localStorage.setItem('hx_feat_on_ownerFunds','1'); location.reload()`,
then sign in as the Super Admin. Restart `npm start` first if it was running before these commits.

Known flake: `tests/services.test.js` "a fleet-wide nudge waits the delay the server hands out" fails
now and then while the machine is loaded (1 of 3 runs during the full e2e); untouched code.

## 0. STATUS AT 22:30 — READ THIS FIRST (supersedes §3b, §4 and §6)

Everything in the §4 work order is DONE. 29 local commits on
`claude/funny-dijkstra-c68mqn` on top of `9200c98`, **none pushed**.

- **Bug audit finished** — `docs/BUG_AUDIT_2026-09-28.md`. Fixed and verified:
  - fixes 1–5: double press (BUG-001..007), student numbers (BUG-008), one
    safe restore (BUG-009/010), expenses red;
  - fix 6 (BUG-013): a restored pre-merge backup lost its maintenance and
    complaints on restart;
  - fix 7 (BUG-014): restoring an older backup reissued receipt numbers already
    printed.

  Checked and sound: camera error messages, interrupted and hostile restore.
  Open: BUG-011 (P3) and BUG-012 (P1, needs a decision).
- **Colour audit delivered as a report** — `docs/COLOR_AUDIT_2026-09-28.md`.
  Nothing in the app changed. 7 measured contrast root causes (worst: the
  active page's sidebar badge at 1.6:1, Reports room-type chips at 1.75:1),
  the `dh-*` competing palette, status colours that differ by page, and a
  4-phase plan.
- **Owner Funds step 5 done** (`a55d4f7`): an "After owner" line under
  Available Fund, and Excel/PDF export on the page. **Step 6 done**: 5/5 in
  `tests/owner-funds.spec.js`; both themes at 1366×728 and at the client's
  size (auto-fit lays it out 1365 wide) — no wrap, no overflow; switched off,
  the nav item, the line and the export all go.
- Reusable harnesses saved to `C:\Users\PCS\HOSTIX-backups\tools\`:
  - `contrast-sweep.spec.js`;
  - `screen-check-2sizes.spec.js`;
  - `colour-inventory.js`.

  All the `_tmp-*` specs are deleted, except the owner's `_tmp-cam`.

**Open questions for the owner (replaces §6):**
1. BUG-012: should staff accounts (PBKDF2 hashes) go into backups, or does a
   restore on a new PC always mean re-creating staff?
2. BUG-011 (display numbers reused after deleting the latest, P3): fix now or
   later?
3. Colour S3: should Pending be amber and Arrears/overdue red?
4. Colour S4: should an Open issue be neutral, with red for High priority only?
5. Colour plan: Phase 0 only (the measured failures), or Phase 1 as well (one
   palette, a visible change to chip reds and greens)?
6. Move the 29 commits to a `6.1` branch before any push?
7. Reverse window: make Correction/Refund a required choice?
8. When to redeploy the control plane (needed for the `ownerFunds` switch) and
   build the installer?

---

## 1. Where the code is

- Repo `C:\HOSTIX-APP`, branch **`claude/funny-dijkstra-c68mqn`** — this is the
  **open 6.0.0 release PR #26**.
- **11 commits today, all LOCAL, none pushed** (on top of `9200c98`):

  | Commit | What |
  |---|---|
  | `edd38af` | feat(display): the app fits the screen it is on (auto-fit, fit-figures, header subtitle, expenses table floor, stale tooltip) |
  | `d6ac423` | feat(expenses): optional receipt / reference number |
  | `07e2a7f` | fix(payments): a refund is never put back on the month as unpaid (`settledTotal`) |
  | `d1b435d` | feat(dashboard): Needs Action lands on its rows; room-type and seat colours |
  | `6ffccd9` | feat(owner-funds): steps 1–2, rules + opt-in control-plane flag + permission |
  | `dac363c` | feat(dashboard): trend range as a dropdown; expenses in the pending red |
  | `9e260b4` | feat(owner-funds): step 3, the Owner Funds page |
  | `d3094ab` | feat(expenses): no "Fund Transfer" where Owner Funds is on |
  | `ebdb357` | feat(owner-funds): step 4, Owner Funds in the Reports |
  | (this doc) | docs: session handoff |

- Untracked and **not ours — leave alone**: `docs/design/shots/`,
  `tests/_tmp-cam.spec.js`.
- **Pushing would add all of this to the 6.0.0 release PR.** The owner has not
  decided; offered to move the commits onto a `6.1` branch first. Do not push.

## 2. What was agreed today (the owner's rulings)

- **Screen fit.** Client desktop is 1680×1050 @150% = 1120×660 CSS px, less
  room than the owner's 1366×768 laptop. `services/display-scale.js` auto-fits
  to a 1366 layout; View → Auto-fit to Screen switches it off.
- **Refunds.** A refund must never come back as unpaid. Every recompute uses
  `settledTotal(p)` (finance.js). The Reverse window still preselects
  *Correction* — suggested making the choice mandatory; **not answered**.
- **Revenue Trend.** Keep the original chart; range is a dropdown in the same
  place (same height, chart stays 192px); expenses in the **dh-red** of the
  pending-payments row; revenue blue. No net line.
- **Owner Funds** (client feature, one hostel, per-hostel switch):
  never revenue/expense; profit/loss unchanged, owner lines beside it; no
  carry-over between months; "paying a bill" = the owner's OWN bill; Available
  Fund unchanged with an "After owner" line (step 5); "Fund Transfer" expense
  category hidden where Owner Funds is on (done). Plan and rules in
  `renderer/src/owner-funds.js` header.

## 3. Things that exist only on this machine / need someone

- **Control plane deploy.** `server/src/lib/features.js` has the new opt-in
  flag `ownerFunds` (`default:false, optIn:true, since:'6.1.0'`). The portal
  will not show the switch until the control plane is **redeployed**. Not done.
- **No installer built.** The client gets none of today's work until a build
  (6.0.1 / 6.1.0) is made — the owner said "we will build later".
- **Vendored copy.** `server/src/lib/vendor/app-utils.js` must equal
  `renderer/src/utils.js`; after any utils.js edit run `npm run sync-shared`
  in `server/` or `server/test/run.js` fails.

## 3b. SUPERSEDED BY THE OWNER, 2026-09-28 ~20:00 — READ THIS FIRST

- **AUDIT ONLY. Change no code** until the owner approves fixes. The rest of the
  audit continues "after the issues are fixed, before the release".
- **Expenses are RED everywhere** — the red-vs-amber question in §4a is
  ANSWERED; do not ask it again. Apply it only when fixing starts.
- The active work is the **bug audit**:
  `docs/BUG_AUDIT_2026-09-28.md` (spec `Downloads/Hostyllo_Enterprise_Bug_Audit_and_Fixation.md`).
  As of 20:45: **8 reproduced defects** — BUG-001..005 and 007 (double posting:
  Add Payment ×2 paths, Reverse, Expense, Owner Fund, Edit-Payment receive),
  BUG-008 (a deleted student's id and payments pass to the next admission),
  BUG-009 (Backup-page restore takes no safety copy). Verified sound: reversals
  in reports, restore replacement, receipt numbers, backup round-trip on both
  paths, checkout-collect and Add Student double press.
- Evidence harnesses (untracked, temporary): `tests/_tmp-dbl|sid|rst|rev|bk|chk.spec.js`.
- Owner Funds step 5 is ON HOLD (it is a code change).

## 4. WORK ORDER FOR THE 20:20 RESUME (partly superseded — see §3b)

### 4a. FIRST — the colour audit (owner, 2026-09-28)

Brief: `C:\Users\PCS\Downloads\Hostyllo_Cross_Theme_Color_Consistency_Audit.md`.
It asks for an AUDIT before changes ("Do not blindly replace all colors. First
determine what the color means.") — so the first deliverable is a report, and
fixes follow owner approval (memory: follow an owner spec literally, propose
before applying).

Inventory taken at 19:45 (raw `#hex` / `rgb(` / `hsl(` counts):

- CSS outside `css/tokens.css`: **622**. `style.css` 403, `chrome.css` 62,
  `ui-kit.css` 41 (the `dh-*` hue families, hex per theme), `login.css` 36,
  `dashboard.css` 12, `whatsapp.css` 11, `rooms.css` 9, `components.css` 9,
  `reports.css` 8. The newer `css/components/*` and `css/screens/*` are nearly
  clean.
- JS inline colours: `students.js` 186, `dashboard.js` 90, `receipt.js` 40,
  `reports.js` 37, `license.js` 31, `utils.js` 30, `modals.js` 28.
- Known structural issue (memory): `style.css` loads after `tokens.css` and
  wins on 5 tokens; legacy aliases `--green/--red/--amber/--blue` sit beside
  the role tokens `--success-fg/--danger-fg/--warning-fg/--accent`, and
  `ui-kit.css` `.dh-*` is a THIRD system with its own hex.

**A CONFLICT TO PUT TO THE OWNER FIRST:** the audit's §7 says
*expenses/outflow = muted amber; red = owed/overdue/danger only*. Today the
owner asked for the dashboard trend's expense bars in **red** (commit
`dac363c`). The Reports chart and Owner Funds "took" use amber
(`--warning-solid` / warning role). One of the two has to give — ask; do not
decide.

Deliverable for 4a: `docs/COLOR_AUDIT_2026-09-28.md` with
1. the inventory, classified (semantic / structural / decorative / chart /
   legacy / accidental / duplicate / invalid-for-dark);
2. the three token systems and how they map to one (existing role tokens in
   `tokens.css` are the target — no new naming scheme);
3. the regression matrix of §22 filled from real screenshots, light + dark,
   every major screen (capturePage method below), with contrast measured;
4. a phased fix plan. Then stop for approval.

### 4b. THEN — Owner Funds step 5 (after 4a is delivered)

- Dashboard: a small "After owner: Rs. X" line under the Available Fund card,
  only where `ofAllowed()`; Available Fund itself unchanged.
- Owner Funds page: Excel / PDF export buttons using `ofExportColumns()`
  (already shared by Reports) and the export engine (`EXPORT.pdf/excel`).

### 4c. Owner Funds step 6 — final pass

Full Owner Funds e2e, both themes, 1366×728 and the client's 1120×660
(`setContentSize(1120,660)`), switched off → nothing visible anywhere.

## 5. How to run things

- Unit: `for f in tests/*.test.js; do node $f; done` — 665 checks passed.
- Typecheck: `npm run -s typecheck`.
- E2E: `HOSTIX_TEST_PROFILE=/c/Users/PCS/HOSTIX-testprofile NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=2" npx playwright test <files>` — 6-8 files at a time.
- Owner Funds needs the opt-in flag in tests:
  `localStorage.setItem('hx_feat_on_ownerFunds','1')`.
- Screenshots of the real window (zoom-correct): in a temp spec,
  `app.evaluate(async ({BrowserWindow}) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))`;
  write to `C:/Users/PCS/AppData/Local/Temp/hostyllo-fit/`. Playwright
  deletes `test-results/` on each run — never keep inputs there.
- Traps hit today: repo files are CRLF — a heredoc/`cat >>` appends LF and
  breaks string-replace patches (normalise first); Python heredocs lose
  backslashes in JS `\'` — use the Edit tool for those lines; `sed -i` is
  CRLF-safe.

## 6. Open questions for the owner (in order)

1. Expenses colour: red (today's request) or amber (the audit)?
2. Move today's commits to a `6.1` branch before anything is pushed?
3. Reverse window: make Correction/Refund a required choice (no preselect)?
4. When to redeploy the control plane and build the installer.
