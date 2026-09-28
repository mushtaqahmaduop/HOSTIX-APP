# Colour audit — light and dark (2026-09-28)

Brief: `Downloads/Hostyllo_Cross_Theme_Color_Consistency_Audit.md`.
Mode: **audit and propose only — nothing in this report has been changed in
the app.** The owner's one standing colour decision, "use red everywhere" for
expenses, was already applied (bug-audit fix 5) and is treated here as settled.

## Verdict in five lines

1. The token core is sound. `tokens.css` has one set of role tokens, and the
   old names (`--text3`, `--green`, `--red`, `--amber`, `--blue`) are aliases
   of those roles in both themes, not a second palette. The existing checks
   pass (`npm run test:theme`, 4/4; `theme-parity.spec.js`, 2/2).
2. There **is** a competing palette: the `dh-*` tones in `ui-kit.css` (359
   uses in 20 files) carry their own raw hex values. They are not derived
   from the role tokens, so "danger" has two reds and "success" two greens.
3. Measured contrast: **5,129 text elements** on 19 pages plus a confirm
   dialog, toasts and the expense form, in both themes. **13 of 22 screens pass
   in both themes**, apart from two app-frame badges that fail on every screen
   (C1, C2). The failures come from 8 root causes (§3). Two are
   serious: the count badge on the page you are viewing, and the room-type chips
   in Reports.
4. The same status is drawn differently on different pages ("Partial" is grey
   on the dashboard and amber on Payments; "Active" has two greens). Two
   status meanings need an owner decision (§4).
5. There are 1,110 raw colour literals in 443 distinct values (§5). 68 of them
   belong to the print and export documents, which by design do not follow the
   theme.

## 1. Method, and what it does not cover

- **Runtime sweep.** A Playwright harness (kept at `HOSTIX-backups	ools\contrast-sweep.spec.js`; copy it into `tests/` to run) logs
  in and seeds six students, four rooms, paid/partial/pending payments,
  expenses, three issues and two owner-fund movements. It then visits every
  page at 1366×728 in light and in dark and waits 2.2s for animations to
  settle. For every visible text node it composites the computed `color` over
  the real background (walking up the ancestors through translucent layers and
  including opacity), then computes the WCAG 2.x ratio. The threshold is 4.5:1,
  or 3:1 for large text (≥24px, or ≥18.66px bold). Disabled controls are
  exempt, as WCAG allows. Output: `%TEMP%/hostyllo-fit/contrast5.json`.
- **Static reading** for anything animated: the sidebar badges pulse forever
  (`style.css:1175`, `pulseDot`), so they were re-measured with animations
  switched off.
- **Not covered yet:**
  - hover, focus, active and selected states (the brief's §11);
  - input placeholders;
  - the canvas charts (their colours are set in JS and are not DOM text);
  - receipts and PDFs (deliberately not themed);
  - screens that need special state, such as the licence and lock screens.
  These are Phase 4 in §6.

## 2. The token systems, mapped

| Layer | Where | Uses | Status |
|---|---|---|---|
| Role tokens: `--surface*`, `--text-primary/secondary/tertiary`, `--accent`, `--success/warning/danger-fg/-bg`, `--*-solid` | `css/tokens.css` (light at `body.light-theme`, dark on `:root`) | — | **The authority.** Both themes are declared; the parity spec checks they differ. |
| Legacy aliases: `--text2/3`, `--green`, `--red`, `--amber`, `--blue` | `tokens.css:334-370`, restated for light at `:412-448` | `--text3` 600, `--red` 149, `--green` 111, `--amber` 44 | **Sound**: they are aliases of the roles, restated in the light block so the `:root` var() trap cannot recur. Can be migrated at leisure; not a defect. |
| **`dh-*` tones** (`dh-red/green/amber/blue/violet/slate`) | `ui-kit.css:18-47` | **359** in 20 files | **Competing palette.** It has its own raw hex values in both themes. Light `dh-red` is `#C0402F` where `--danger-fg` is `#9E2F20`; light `dh-green` is `#1F8A5A` where `--success-fg` is `#14663F`. Light `dh-slate` uses a cool blue-grey ground `#EEF1F6` inside a warm ivory system. |
| `ui-chip--success/warning/danger/neutral/cat` | `ui-kit.css` | 69 | Built on the role tokens. **This is the status system to keep.** |
| `lk-chip` + `dh-*` | listkit | 44 | Status chips drawn from the competing palette (see S2). |
| Legacy `.badge-green/gray/red…` | `style.css` | 32 in 5 files | A third chip system, still on the dashboard's recent-payments list. |

## 3. Contrast failures (measured)

| # | Where | Light | Dark | Root cause | Proposed fix |
|---|---|---|---|---|---|
| **C1** | **Sidebar count badge on the page you are on** (Issues, Cancellations) | **1.59** (`#3D3D3A` on `#7A5309`) | **1.9** (`#A2AAB6` on `#E8B84B`) | `index.html:591` and `:641` give these two badges an inline `background:var(--red)` / `var(--amber)`. The active-row rule `chrome.css:893` swaps only the ink, to `--neutral-fg`, and the inline background wins, so the number is unreadable exactly when you are looking at that page. Inactive badges are fine (≈7:1). | Move the tone into a class (`nav-badge--warn`, `nav-badge--danger`) with its own active-state ink, and drop the inline style. |
| **C2** | Header notification count (every page) | 3.76 | 3.76 | `chrome.css:498`: literal `#ef4444` behind literal `#fff`, 10px. | Use a danger solid with `--text-on-danger` ≥4.5 (a new role pair; the other solids already follow this pattern). |
| **C3** | Reports → room-type chips ("1-Seater"…"5-Seater") | **1.75–2.75** | 3.56–4.23 | The room type's own colour is used as the ink on a 20% tint of itself. Pale hues (green `#2EC98A`, amber `#F0A030`, gold `#C8A84B`) cannot carry text. | Keep the hue as a dot or swatch; set the text to `--text-primary`. |
| **C4** | "Active" chip (Settings, Users); "Occupied" (Rooms cards) | 3.87 | ✓ | `dh-green` light `#1F8A5A` on `#E8F5EE`. | Derive `dh-green` from `--success-fg`/`-bg` (≈6.5:1) — this is Phase 1. |
| **C5** | "Pending" chip (Payments, and anywhere else `ui-chip--danger` sits on a card) | ✓ | 4.49 | `--danger-fg #F08A7A` on a 16% danger tint over the dark card: 0.01 under. | Lift dark `--danger-fg` one step, or cut `--danger-bg` alpha to 0.12. One token. |
| **C6** | Dashboard → collection-method rows with Rs. 0 | 2.44–2.97 | 2.81–4.38 | `dashboard.css:1615`: `.dl-meth__row.is-zero { opacity:.55 }` on top of `--text3`. A deliberate "nothing here" dimming, but it takes the text under the floor. | Drop the opacity; `--text-tertiary` alone already reads as secondary. |
| **C7** | Support → "Your installation is working correctly" | ✓ | 4.37 | `--text2` small text on the success tint. | Use `--success-fg` for that line, or `--text-primary`. |
| — | Breadcrumb "/" and dashboard footer "\|" separators | 1.4–1.54 | 1.78–1.91 | Decorative glyphs, not information. | Exempt. Mark them `aria-hidden="true"` so screen readers skip them too. |

Dismissed as measurement artefacts: the toasts, which were mid fade-in on the
first pass and clean once settled; and the varying badge readings caused by the
pulse animation. The static values are the ones given in C1.

### Light / dark matrix (text contrast, after settling)

| Screen | Elements | Light | Dark | Failing elements |
|---|---|---|---|---|
| Dashboard | 236 | ✗ 12 (min 2.44) | ✗ 12 (min 2.81) | C6 |
| Students | 151 | ✓ | ✓ | |
| Rooms | 99 | ✗ 4 (3.87) | ✓ | C4 |
| Payments | 118 | ✓ | ✗ 1 (4.49) | C5 |
| Expenses | 78 | ✓ | ✓ | |
| Reports | 182 | ✗ 5 (1.75) | ✗ 2 (3.56) | C3 |
| Issues | 88 | ✓ | ✓ | |
| Cancellations | 49 | ✓ | ✓ | |
| Former students | 60 | ✓ | ✓ | |
| Archive | 209 | ✓ | ✓ | |
| Owner Funds | 94 | ✓ | ✓ | |
| Backup & Restore | 80 | ✓ | ✓ | |
| Settings | 148 | ✗ 1 (3.87) | ✓ | C4 |
| Users | 72 | ✗ 1 (3.87) | ✓ | C4 |
| Activity log | 89 | ✓ | ✓ | |
| Support | 131 | ✓ | ✗ 1 (4.37) | C7 |
| Add Student | 117 | ✓ | ✓ | |
| Add Payment | 119 | ✓ | ✓ | |
| Check-in log | 122 | ✓ | ✓ | |
| Confirm dialog | 121 | ✓ | ✗ 1 (4.49) | C5 |
| Toasts | 124 | ✓ | ✗ 1 (4.49) | C5 (the chip behind), toasts themselves ✓ |
| Expense form | 82 | ✓ | ✓ | |
| *every screen* | | ✗ | ✗ | C1 (active badge, when it has a count), C2 (header count) |

## 4. Semantic consistency

Every chip, badge and pill was collected with its label and colours on every
page (light shown; dark follows the same classes).

| # | Finding | Evidence | Proposal |
|---|---|---|---|
| S1 | **"Partial" has two meanings** | Dashboard recent payments: grey `.badge-gray` (`#5C5A51` on `#DCDCDC`). Payments: amber `ui-chip--warning`. | One status helper for payment states used by every page. Retire `.badge-*` (32 uses). |
| S2 | **"Active"/"Paid" have three greens** | `ui-chip--success` `#14663F`/`#E4EFE0` (Students, Payments, Issues); `lk-chip.dh-green` `#1F8A5A`/`#E8F5EE` (Settings, Users, Rooms); `.badge-green` on a 10% `#45DFA4` (dashboard). | Phase 1 (`dh-*` from roles) plus S1 makes them one. |
| S3 | **This month's "Pending" is red, older "Arrears" amber** — older debt reads calmer than newer | Payments: `Pending` = `ui-chip--danger`, `Arrears` = `ui-chip--warning`. The brief: pending → warning/neutral, overdue → danger. | **Owner decision.** Suggested: Pending = warning, Arrears/overdue = danger. |
| S4 | **"Open" issue is red**, the same red as "High" priority | Issues: `Open` and `High` both `ui-chip--danger`. | **Owner decision.** Suggested: Open = neutral or info (it is a workflow state), keeping red for High priority and overdue. |
| S5 | Expenses are red, not the brief's amber | Owner's decision 2026-09-28, applied app-wide by `expenseColor()`. | Documented override. The brief's "amber = outflow" does not apply to Hostyllo. |
| S6 | **17 distinct reds** in literal code; danger itself has two values per theme (`--danger-fg` vs `dh-red`), plus the header badge's `#ef4444` | Inventory §5. | Phase 1 + C2. |
| S7 | Cool slate greys in a warm system | `dh-slate` light ground `#EEF1F6`. Tailwind slate literals (`#4B5563` ×22, `#0F172A` ×16, `#374151` ×14, `#475569`, `#1E293B`), mostly inline in `students.js`, and 65 "blue" literals that are mostly these slates. | Map them to `--neutral-*` / the text ladder (Phase 3). |
| S8 | Settings → Data Management tile groups give the same record type different hues | Logged in the bug register on 2026-09-28. | Fold into S1's helper. |
| S9 | Owner Funds: "gave" is green (success) and "took" amber (warning) | Owner Funds page. | Consistent with the Owner Funds rules (never revenue or expense). No change. |

## 5. Inventory of raw colours

Counted outside `css/tokens.css`, skipping comment lines and vendored/minified
libraries. The script is kept at
`HOSTIX-backups	ools\colour-inventory.js`.

- **1,110 literals, 443 distinct values** — 609 in CSS, 501 in JS.
- By file: `style.css` 396 · `students.js` 179 · `dashboard.js` 88 ·
  `chrome.css` 57 · `ui-kit.css` 41 (the `dh-*` palette) · `receipt.js` 40 ·
  `login.css` 36 · `reports.js` 36 · `utils.js` 33 · `license.js` 31 ·
  `export/engine.js` 28 · `modals.js` 28.
- By hue: rgba/other 447 (mostly black-alpha overlays and shadows) · neutral
  230 · blue/slate 224 · green/teal 59 · red 55 · orange/amber 52 · cyan 20 ·
  violet 15.
- Only 23 uses (16 values) exactly equal a `tokens.css` value. The rest are
  near-misses, which is the drift the brief warns about.
- **Classification:**

  | Kind | Count | What it is |
  |---|---|---|
  | print/export (legitimate, never themed) | 68 | `receipt.js`, `export/engine.js` |
  | chart-specific | a few | `expenseColor()` fallback, chart JS |
  | structural overlays/shadows | ≈447 | rgba |
  | legacy | the bulk | `style.css`, cool slates in `students.js`/`dashboard.js` |
  | competing palette | 41 | `ui-kit.css` `dh-*` |
  | accidental | spot items | C2's `#ef4444`, the inline badge backgrounds |

- The existing hygiene check counts raw hex outside the print documents: 223
  today, against a ceiling of 370. The ceiling can come down to 225 now, so
  the count cannot grow back.

## 6. Plan (phased, each phase one reviewable commit or a few)

- **Phase 0 — the measured failures (small, low risk).**
  - C1: badge tone classes plus active ink.
  - C2: header count solid.
  - C3: room-type chips get ink `--text-primary` with a colour dot.
  - C5: one dark token.
  - C6: drop the opacity.
  - C7: one line.
  - Separators get `aria-hidden`.
  - Then add the runtime sweep as a permanent spec, with the separators on an
    allow-list, so the matrix above is re-run on every change.
- **Phase 1 — one palette.** Re-point `dh-*` in `ui-kit.css` at the role tokens:
  - green → success;
  - red → danger;
  - amber → warning;
  - blue → accent;
  - slate → neutral;
  - violet stays as the one decorative category hue, lifted to pass in dark.

  It is one file, but it changes the look of 359 call sites (softer reds and
  greens become the role values), so it needs a visual pass on every screen in
  both themes. Extend `theme-parity.spec.js` with the `dh-*` pairs.
- **Phase 2 — one status language.** After the owner rules on S3/S4, one
  `statusChip(kind, state)` helper is used by every page (payments, issues,
  students, rooms, owner funds), and `.badge-*` is retired.
- **Phase 3 — literals.** The inline colours in `students.js` (179) and
  `dashboard.js` (88) become classes on tokens. Cool slates map to the warm
  neutral ladder. The hygiene ceiling comes down each step.
- **Phase 4 — states.** Hover, focus, selected and disabled on buttons, inputs,
  tabs, rows and nav, in both themes. Also placeholders and chart axis/legend
  colours. The same harness can measure these with `:hover` / `:focus-visible`
  forced.

## 7. Decisions for the owner

1. **S3:** should Pending be amber and Arrears/overdue red (the brief's rule),
   or stay as today?
2. **S4:** should an Open issue be neutral, with red kept for High priority
   only?
3. **Phase 1** visibly changes the reds and greens on about 20 files' worth of
   chips and tiles. Go ahead, or Phase 0 only for 6.0.x?
4. **C2** needs a new role pair (`--danger-solid` / `--text-on-danger`).
   Accept adding it to `tokens.css`?

The sweep harness is kept at `HOSTIX-backups	ools\contrast-sweep.spec.js`;
Phase 0 turns it into a real spec.
