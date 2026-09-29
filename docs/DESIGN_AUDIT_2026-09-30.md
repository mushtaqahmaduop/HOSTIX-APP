# Design audit: HOSTIX-APP renderer (2026-09-30)

**Mode:** report only. No app code was changed.

**Asked for by:** the owner, against the design-system-blueprint.pdf checklist
(roadmap step 1, `docs/FEATURE_ROADMAP_2026-09-30.md`).

**Bound to:**
- `renderer/css/tokens.css`
- the Design governance rules in `CLAUDE.md`:
  - type: six steps, weights 400 / 500 / 600
  - spacing: a 4px grid
  - radius: 4 / 8 / 12 / 999
  - elevation: borders; only menus, modals and toasts carry a shadow

**References:** `docs/COLOR_AUDIT_2026-09-28.md` is referenced, not repeated.

**Method:**
- Static analysis of every `.css` under `renderer/` (about 26,000 lines, 44 files) and every UI-building `.js` / `.html`.
- Declarations were counted per rule, with comments stripped.
- Four claims were re-verified by hand before this report was filed: no generic disabled/busy style, `HEX_CEILING` still 370, the 18px clear button, and the overshoot easing on modals.

**Not measured:**
- Nothing was observed live at 1366 or 1120.
- Only the CSS was read for runtime appearance, reduced motion and theme.

**Exempt from the colour rules (printed on white paper):**
- the export engine, `receipt.js` and `owner-brief.js`;
- the payslip and profile documents in `payroll-page.js`;
- the student print documents;
- the seat-availability print.

Not verified: whether `license.html`, `license-settings.html` and `recovery.html` are themed windows.

## Summary

| # | Checklist item | Status | Evidence |
|---|---|---|---|
| 1 | Spacing (4px base) | **Drifting** | 56% of 2,601 spacing values are off the 4px grid. `--space-*` is used in 353 declarations. |
| 2 | Type scale | **Broken** | 30 raw font sizes. 133 declarations are below the 11px floor. Weights 700/800/900 appear in 435 declarations. |
| 3 | Colour, tokens only | **Drifting** | 153 hex in CSS. Colour Phase 1/2 (`dh-*` ×356, `.badge-*` ×32) is still open. The hex ceiling of 370 has 142 of slack. |
| 4 | Component states | **Drifting** | The global focus ring is good. 6+ button families have no disabled style. 6+ parallel button systems exist. |
| 5 | Empty / loading | **Drifting** | 14 empty-state designs plus 26 bare lines. No spinner, and `aria-busy` is unstyled. |
| 6 | Icons | **Drifting** | One Lucide set, but 319 hand-written SVGs with about 20 sizes and 18 stroke widths. Emoji are used as icons. |
| 7 | Click targets | **Broken** | 12 interactive controls are under 28px: an 18px clear button, 15px checkboxes, 22–26px icon buttons. |
| 8 | Radius / shadow | **Broken** | 372 of 775 radii are off-scale and 75 are above 12px. 98 shadows sit on things that don't float. |
| 9 | Motion | **Drifting** | 30 durations and 15 easings. A springy overshoot on modals. 18 infinite animations are not stopped under reduced motion. |

## A. Breaks the visual system now

**A1. Tiny text, below the system's own minimum.**
- **What:** 133 CSS declarations are under 11px (8.5–10.5), plus 67 in JS inline styles.
- **Where:** worst in `style.css` (31), `payments.css` (26), `students.css`, `reports.css`, `dashboard.css`, `listkit.css`, `rooms.css`, `settings.css` and `users.css`.
- **Why it matters:** unreadable on the client's 1120 window at 150% scaling.
- **Fix:** raise everything to `--text-xs`, file by file.
- **Effort:** M.

**A2. Small buttons are hard to hit.**
- **Controls under 28px:**
  - sidebar collapse button, 24px (`chrome.css:199`)
  - month-picker arrow, 26px
  - search clear ×, 18px (`css/components/input.css:107`)
  - kebab menus, 26px (`students.css:1766`, `dashboard.css:1029`)
  - `.dash-icon-btn`, 26px
  - settings icon buttons, 26px
  - payment chips, 26–27px
  - login checkbox, 18px
  - row checkboxes, 15–16px (payments, students, settings, users)
- **Fix:** a 28px minimum (32px for icon buttons), growing the click area and not the glyph; one shared kebab class.
- **Effort:** S–M.

**A3. A button disabled during a save may not look disabled.**
- **What:** `submitOnce()` disables the pressed button and sets `aria-busy`, but there is no generic `button:disabled` or `[aria-busy]` style.
- **Families with no disabled style:** `.sf-btn`, `.pf-btn`, `.lk-btn`, `.rms-btn`, `.arc-btn`, `.hdr-btn`, `.dash-icon-btn`, `.settings-tab`, `.lk-chip`, `.lk-select`.
- **Fix:** one low-specificity global rule in `css/base.css`.
- **Effort:** S.

**A4. Rounded corners, shadows, lifts and press-shrinks the system forbids.**
- **Radius:**
  - 372 of 775 radii are off-scale: 10px ×76, 9px ×65, 11px ×51, 14px ×30.
  - 75 are above 12px, e.g. archive cards 16px, backup 14px, payments 20px.
- **Shadows:**
  - 98 sit on non-floating things: `.card:hover`, `.stat-card:hover`, `.room-card:hover`, quick actions, the active nav item, primary button hover, report tiles, sticky footers.
  - There are five shadow vocabularies.
- **Press and lift:**
  - `.btn:active { scale(.97) }`
  - 16 hover rules that lift or scale
- **Fix:**
  - Snap radii to 4/8/12/999 (**owner ruling needed** on the 9–11px range).
  - Remove the non-floating shadows and replace them with hover surface or border colour.
  - Remove the scale-on-press.
- **Effort:** L.

**A5. The date picker ignores the theme.**
- **Where:** `modals.js:513-574` injects its own CSS.
- **What:**
  - the clear button is `rgba(255,255,255,.08)`, which is invisible on the light theme
  - radius 14px and a heavy shadow
  - a scale animation
  - `z-index:10000`
  - the unbundled 'DM Sans' font
  - 15px/700 text
- **Why it matters:** it is on every date field.
- **Fix:** a token-based `css/components/datepicker.css`.
- **Effort:** M.

**A6. Emoji used as icons.**
- **Where:**
  - command palette nav: 🏠🚪🎓💳📉📋📊🛠🕑
  - `students.js` ⚠️ / ✅
  - `payments.js` 💳 / ➕
  - `license.js` ✅ / ⚠️
  - `reports.js` 🎉
- **Why it matters:** they render differently per Windows version.
- **Fix:** replace them with `icon()`.
- **Effort:** S.

## B. Will break it as the product grows

**B1. A spacing scale exists but is barely used.**
- **Most common off-grid values:** 10px ×285, 14 ×231, 6 ×162, 9 ×138, 3 ×111, 11 ×110, 7 ×99, 13 ×94, 5 ×90.
- **Gap in the scale:** no 20px rung (20px appears 43 times).
- **Fix:** an owner-approved map (10 → 8/12, 14 → 12/16, 6 → 4/8, odd values → nearest), then migrate file by file with a ceiling in the hygiene test.
- **Effort:** L.

**B2. Thirty raw font sizes and four type scales.**
- **Sizes:** the most common are 11, 11.5, 12.5, 12 and 13. Only 413 of 1,013 raw declarations match the scale.
- **Weights:** 700 ×261 and 800 ×170, against the 400/500/600 rule.
- **Line-heights:** 22 values.
- **Parallel scales:** `--fs-*` / `--fw-*` in `style.css`, and legacy `--text-md` / `--text-3xl` / `--weight-bold` in tokens.
- **Fix:** an owner-approved collapse map, then retire the duplicate scales.
- **Effort:** L.

**B3. Parallel token families.**
- **Families:**
  - type: `--text-*` / `--fs-*`
  - radius: `--radius-*` / `--r-*` (`--r-xl` is 14px) / `--radius-card: 22px`
  - shadow: five families
  - motion: `--dur-*` / `--transition`
- **Fix:** a "no new name" check in the hygiene test, then delete the duplicates.
- **Effort:** M.

**B4. Six-plus button systems.**
- **Where:**
  - legacy `.btn`: about 776 class mentions across the app, including the newest page, `payroll-page.js` (38)
  - `.ui-btn` (the system's button): about 58
  - `.set-btn`: 67
  - others: `.sf-btn`, `.pf-btn`, `.rms-btn`, `.arc-btn`, `.lk-btn`, `.lk-act`, `.dash-icon-btn`, `.hdr-btn`, `.pager-btn`
  - no CSS at all: `.pdf-print-btn`, `.copy-btn`
- **Fix:** migrate to `.ui-btn`, starting with the payroll page.
- **Effort:** L.

**B5. Other duplicated components.**
- **Inputs:** `.form-control` ×220 while `.ui-input` is unused.
- **Also duplicated:** five tab systems, six table styles, four chip systems, two card systems.
- **Fix:** a canonical-component table in `CLAUDE.md`, then migrate per screen.
- **Effort:** L.

**B6. The newest screens are only partly on the system.**
- **Payroll** (`payroll.css`):
  - no spacing tokens (100 off-grid values)
  - 78 raw font sizes at weight 800
  - its own tabs, search, select, table and empty state
- **Inspections:** similar.
- **The real references:** `owner-funds.css`, `expenses.css`, `issues.css`, `components.css`.
- **Fix:** rebase payroll and inspections on `ui-*`.
- **Effort:** M.

**B7. Colour: the follow-up to the 28 September audit.**
- **Fixed since then:** C1 (nav badge contrast) and C2 (header count).
- **Still open:** Phase 1 (`dh-*` ×356) and Phase 2 (`.badge-*` ×32).
- **Test gap:** the hex ceiling is 370 against 228 actual (loosened slack), and the test does not scan JS.
- **New finding:** most of the "JS hex" the colour audit counted is in exempt print documents.
  - In-app JS hex is small: charts, `license.js` 26, `pmBadge` 12, the date picker, `index.html` 16, `app.js` 10.
  - There are 941 inline `style=""` attributes.
- **Fix:** ceiling to 230, plus a JS hex check with a print allow-list.
- **Effort:** S + M.

**B8. The z-index layer system is barely used.**
- **What:** the tokens exist and are used once. Raw values range from 1 to 2147483647.
- **Constraint:** the 331/350 panel/modal order is load-bearing.
- **Fix:** tokenise one layer at a time.
- **Effort:** M.

**B9. No loading indicator.**
- **What:**
  - no spinner component
  - `.skeleton` is used once
  - `aria-busy` is unstyled
  - export gives a toast only above 200 rows
  - restore and activation only swap the button text
- **Fix:** a `ui-spinner`, a busy state, and a busy overlay for export, backup and restore.
- **Effort:** M.

**B10. Fourteen empty-state designs plus 26 bare lines.**
- **What:**
  - `.lk-empty` is defined but unused.
  - `.ui-empty` is used 17 times.
  - The 26 bare "No …" lines are in `dashboard.js`, `reports.js`, `archive.js` and `payments.js`.
- **Fix:** one `emptyState()` helper.
- **Effort:** M.

**B11. Icons: one consistent set, but inconsistent sizes and strokes.**
- **What:**
  - 319 literal SVGs with hand-set widths from 11 to 100
  - 18 stroke widths
  - 74 CSS rules that override the icon sizes
- **Fix:** move them to `icon()` and allow one stroke width.
- **Effort:** M.

## C. Cosmetic drift

- **C1. Motion:** 30 durations and 15 easings. `ease` is written raw 120 times. There are 7 `transition: all`. A springy overshoot on modals and login. **S–M**
- **C2. Reduced motion:** 18 infinite animations (pulse, shimmer, glow, orbs, rainbow) have no iteration cap under reduced motion. **S**
- **C3. Gradients:** 73 declarations, against a no-gradient system. **M**
- **C4. Control heights:** raw values 26–44 against the `--h-*` tokens. **M**, with B4.
- **C5. `!important`:** 63 uses. Low value to chase.
- **C6. `.ui-input`:** defined but unused (see B5).

## Phased remediation plan

Each phase ships and is verified on its own.

1. **Guard rails (S).**
   - Hex ceiling to 230.
   - Ceilings for sub-11px text, radius above 12px, weights outside 400/500/600 and scale-on-hover/press.
   - A JS hex check with a print allow-list.
   - Verify: `npm run test:theme`.
2. **Usability (S–M): A2, A3, C2.**
   - Disabled/busy styling.
   - 28/32px click targets and checkboxes.
   - The reduced-motion iteration cap.
   - Verify: screenshots at 1366 and 1120 in both themes, and manual kebab, checkbox and save.
3. **Text floor (M): A1.**
   - Sub-11 text to `--text-xs`, one file per commit.
   - Verify: screenshots at 1120.
4. **Elevation, radius and press (L): A4, C1.** Needs the owner's ruling on 9–11px radii and the shadow removal. Verify: screenshots in both themes and `theme-parity`.
5. **Date picker and emoji (M): A5, A6.**
6. **Re-base the newest screens (M): B6 and part of B4.** Payroll and inspections on `ui-*`, and payroll's `.btn` to `.ui-btn`. Verify: the payroll and inspections specs.
7. **Type, weight and spacing collapse (L): B1–B3.** Needs the owner's mapping table.
8. **One of each component (L): B4, B5, B7, B9, B10, B11.** Includes colour Phase 1/2, `emptyState()`, the spinner and icon clean-up.
9. **Layers and motion (M): B8, C1.** Keep 331/350.

## Already good (keep)

- **The token core:** both themes, documented contrast; colour C1/C2 are closed.
- **Keyboard focus:** a global focus ring (`base.css:40`).
- **The hygiene test:** fast, and passing.
- **The component layer** (`css/components/*`): complete states, and a 32/36px height scale.
- **Tokenised screens:** owner-funds, expenses and issues are truly on the tokens.
- **Icons:** one Lucide set with 4 size classes, across 677 call sites.
- **Print documents** correctly keep their own palette.
- **Inline colour:** 398 of 504 inline colours already use tokens.
- **Numbers:** tabular figures are applied globally.
- **Double-submit protection:** `submitOnce` is in place.
