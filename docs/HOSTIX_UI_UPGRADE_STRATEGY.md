# HOSTIX-APP — Enterprise UI/UX Upgrade Strategy

**Target:** HOSTIX-APP (Electron desktop, vanilla JS/HTML/CSS)
**Owner:** Mushtaq (Zeerak Hostix)
**Status:** Active migration plan
**Prerequisite reading:** This document. Do not start any phase without reading the whole file first.

---

## 0. Why we're doing this

The current UI reads as a consumer app (fitness tracker / crypto dashboard vibes) because **color is doing decoration work instead of information work**. Enterprise UI follows one rule:

> **Color = meaning. If a color isn't telling the user something, it shouldn't be there.**

Reference points (open these in another window while working): Stripe Dashboard, Linear, Vercel, Plaid, Notion. Count the colors on any of their screens — you'll find one accent and a lot of restraint.

### The diagnosis (what's wrong right now)

1. **Money is colored.** Neon cyan numbers, fire-red zeros. Money should be plain text; the number itself is the headline.
2. **Every stat-card icon has a different color.** Rainbow icons = consumer app. Enterprise apps use one neutral icon color.
3. **Status pills all compete.** Five different chip colors shouting at once means nothing has priority.
4. **Headers glow.** Luminous text-shadow on dark mode = crypto vibes, not B2B.
5. **Multiple accents fighting.** Violet sidebar, cyan numbers, orange CTA, pink expense indicator. Pick one.
6. **Dark mode is over-saturated.** Dark backgrounds amplify saturation; dark mode needs *more* desaturation, not the same colors with the lights off.

### Known active bug

`PKR PKR 34,000` is double-printing on Total Revenue card and the "of PKR PKR 34,000" subtitle. Same regression pattern as the previous `fmtPKR()` + `<span class="pkr">` collision. The dashboard de-inlining refactor likely reintroduced one of the two layers. **Fix this in its own commit before anything else.**

---

## 1. Ground rules (read before touching code)

These are non-negotiable. They exist because we've burned ourselves on past refactors (the CSS dedup that broke layout, the force-reset to `6629fb1b`).

1. **One screen per PR.** No multi-screen refactors. No "while I'm in here" edits.
2. **Launch the app and click through three screens before merging anything.** This is the rule from the previous burn. It still applies.
3. **Never push to master.** All work goes through a feature branch → PR → manual smoke test → merge.
4. **Keep old tokens as aliases for 4 weeks.** Any unmigrated view must still render. No big-bang token swap.
5. **Take before/after screenshots for every PR.** Both light and dark. Attach to the PR description.
6. **If you're unsure whether a change is safe, it isn't.** Stop, hand off to Claude, ask for a review.

---

## 2. Phase 0 — Audit (no code changes)

Do this entire phase before writing a single line of code. Output is a markdown report committed to `docs/ui-audit/2026-06-audit.md`.

### 2.1 Inventory existing color usage

Run these from the repo root:

```bash
# Every color declaration
grep -rEn '(color|background|border-color|fill|stroke):' --include='*.css' --include='*.html' --include='*.js' src/ > /tmp/color-inventory.txt

# Every hex literal
grep -rEoh '#[0-9a-fA-F]{3,8}' --include='*.css' --include='*.html' --include='*.js' src/ | sort | uniq -c | sort -rn > /tmp/hex-frequency.txt

# Every CSS variable usage
grep -rEoh 'var\(--[a-z0-9-]+\)' --include='*.css' --include='*.html' src/ | sort | uniq -c | sort -rn > /tmp/var-usage.txt
```

Expected finding: 30+ ad-hoc hex codes bypassing the token system. List the top 20 offenders in the audit report.

### 2.2 Screenshot every screen, both themes

Required screens, light + dark = 14 screenshots minimum:
- Dashboard
- Rooms
- Students
- Cancellation List
- Complaints & Maintenance
- Payments
- Expenses
- Reports
- Settings
- Backup & Restore
- Activity Log
- Login/Lock screen
- Receipt/PDF preview
- Any modal (Add Payment, Add Student)

Store under `docs/ui-audit/before/` with naming `screen-name__theme.png`.

### 2.3 Find the `PKR PKR` regression

```bash
grep -rn 'fmtPKR\|pkr"' --include='*.js' --include='*.html' --include='*.css' src/
```

Look for one of these patterns:
- `<span class="pkr">${fmtPKR(value)}</span>` — `fmtPKR` is already prefixing, the span double-adds it
- A CSS `::before { content: "PKR "; }` on `.pkr` while `fmtPKR()` also prefixes
- A template literal that prepends `"PKR "` manually around an `fmtPKR()` call

Fix in its own commit titled `fix(dashboard): remove duplicate PKR currency prefix`. Do not bundle with any styling work.

### 2.4 Deliverable

`docs/ui-audit/2026-06-audit.md` containing:
- Count of unique hex literals
- Top 20 most-used hex codes with their locations
- List of every CSS variable currently declared vs actually used
- Screenshot index
- The `PKR PKR` root cause + fix commit hash

**Do not proceed to Phase 1 until this report is committed.**

---

## 3. Phase 1 — Token system reset

One file, one PR, no component changes yet. Just the tokens.

### 3.1 Create `src/styles/tokens.css`

```css
:root {
  /* ============================================
     NEUTRALS — workhorse, 90% of the UI
     ============================================ */
  --gray-50:  #fafafa;
  --gray-100: #f5f5f5;
  --gray-200: #e5e5e5;
  --gray-300: #d4d4d4;
  --gray-400: #a3a3a3;
  --gray-500: #737373;
  --gray-600: #525252;
  --gray-700: #404040;
  --gray-800: #262626;
  --gray-900: #171717;
  --gray-950: #0a0a0a;

  /* ============================================
     ACCENT — violet, used sparingly
     ============================================ */
  --accent-50:  #f5f3ff;
  --accent-100: #ede9fe;
  --accent-200: #ddd6fe;
  --accent-300: #c4b5fd;
  --accent-400: #a78bfa;
  --accent-500: #8b5cf6;
  --accent-600: #7c3aed;  /* primary CTA */
  --accent-700: #6d28d9;
  --accent-800: #5b21b6;
  --accent-900: #4c1d95;

  /* ============================================
     SEMANTIC — only for status, never decoration
     ============================================ */
  --success-bg:     #ecfdf5;
  --success-fg:     #047857;
  --success-border: #a7f3d0;

  --warning-bg:     #fffbeb;
  --warning-fg:     #b45309;
  --warning-border: #fde68a;

  --danger-bg:      #fef2f2;
  --danger-fg:      #b91c1c;
  --danger-border:  #fecaca;

  --info-bg:        #eff6ff;
  --info-fg:        #1d4ed8;
  --info-border:    #bfdbfe;

  /* ============================================
     SURFACE
     ============================================ */
  --surface:        #ffffff;
  --surface-muted:  var(--gray-50);
  --surface-sunken: var(--gray-100);
  --surface-border: var(--gray-200);
  --surface-divider: var(--gray-200);

  /* ============================================
     TEXT
     ============================================ */
  --text-primary:   var(--gray-900);
  --text-secondary: var(--gray-600);
  --text-tertiary:  var(--gray-400);
  --text-on-accent: #ffffff;
  --text-link:      var(--accent-700);

  /* ============================================
     ELEVATION (flat, no glow)
     ============================================ */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 4px 8px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);

  /* ============================================
     RADIUS & SPACING
     ============================================ */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* ============================================
     TYPOGRAPHY
     ============================================ */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  --text-xs:   11px;
  --text-sm:   13px;
  --text-base: 14px;
  --text-md:   15px;
  --text-lg:   17px;
  --text-xl:   20px;
  --text-2xl:  24px;
  --text-3xl:  30px;

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;

  --leading-tight:  1.25;
  --leading-normal: 1.5;
  --leading-loose:  1.75;
}

/* ============================================
   DARK MODE — MORE desaturated, not less
   ============================================ */
[data-theme="dark"] {
  --surface:         #141414;   /* never pure black */
  --surface-muted:   #1c1c1c;
  --surface-sunken:  #0f0f0f;
  --surface-border:  #2a2a2a;
  --surface-divider: #262626;

  --text-primary:    #e5e5e5;   /* never pure white */
  --text-secondary:  #a3a3a3;
  --text-tertiary:   #737373;

  /* Accent stays same hue, slightly brighter for contrast */
  --accent-600:      #8b5cf6;
  --accent-700:      #a78bfa;

  /* Semantic — drop 15-20% saturation for dark backgrounds */
  --success-bg:      rgba(52, 211, 153, 0.1);
  --success-fg:      #34d399;
  --success-border:  rgba(52, 211, 153, 0.2);

  --warning-bg:      rgba(251, 191, 36, 0.1);
  --warning-fg:      #fbbf24;
  --warning-border:  rgba(251, 191, 36, 0.2);

  --danger-bg:       rgba(248, 113, 113, 0.1);
  --danger-fg:       #f87171;
  --danger-border:   rgba(248, 113, 113, 0.2);

  --info-bg:         rgba(96, 165, 250, 0.1);
  --info-fg:         #60a5fa;
  --info-border:     rgba(96, 165, 250, 0.2);

  /* Elevation — flat depth, no emission */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 4px 8px rgba(0, 0, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.4);
}

/* ============================================
   LEGACY ALIASES — keep until Phase 4 complete
   Do NOT remove early. Any unmigrated view depends on these.
   ============================================ */
:root {
  --accent:           var(--accent-600);
  --accent-soft:      var(--accent-100);
  --accent-strong:    var(--accent-700);
  /* Add aliases for every old --gold*, --royal*, --accent* token
     currently in use. Audit output from Phase 0 tells you which. */
}
```

### 3.2 Import order

`tokens.css` must load **first**. In your main HTML/entry:

```html
<link rel="stylesheet" href="styles/tokens.css">
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/components.css">
<!-- everything else after -->
```

### 3.3 Phase 1 deliverable

- `src/styles/tokens.css` committed
- Import order verified
- App still renders identically (because aliases are in place)
- Screenshot diff: ~zero visual change expected

If the app looks different after this PR, an alias is wrong. Fix the alias, don't proceed.

---

## 4. Phase 2 — Component discipline

Three components carry 80% of the visual weight. Fix these and the rest follows naturally.

### 4.1 Stat cards

**Current state:** Rainbow icons, neon numbers, five-color pill rave.

**Target state:**

```css
.stat-card {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
}

.stat-card__icon {
  color: var(--gray-500);          /* ONE color for all icons */
  background: var(--gray-100);
  width: 36px; height: 36px;
  border-radius: var(--radius-md);
}

.stat-card__label {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-card__value {
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);      /* NO color on numbers */
  font-variant-numeric: tabular-nums;
  line-height: var(--leading-tight);
}

.stat-card__sublabel {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
```

**Pill rules inside the stat card:**
- Default: gray (`.pill--default`) — for neutral metadata like "0 items", "2 paid"
- Only switch to semantic when the value requires user action
- Maximum one semantic pill per card

### 4.2 Pills / badges

Build exactly three variants. Ban the rest.

```css
/* Default — neutral metadata */
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  border-radius: 999px;
  background: var(--gray-100);
  color: var(--gray-700);
}

/* Status — only for actionable states */
.pill--success { background: var(--success-bg); color: var(--success-fg); }
.pill--warning { background: var(--warning-bg); color: var(--warning-fg); }
.pill--danger  { background: var(--danger-bg);  color: var(--danger-fg);  }
.pill--info    { background: var(--info-bg);    color: var(--info-fg);    }

/* Outline — for tags/categories */
.pill--outline {
  background: transparent;
  border: 1px solid var(--gray-300);
  color: var(--text-secondary);
}
```

**When to use which:**
- "2 paid" → `.pill` (default gray)
- "Overdue" → `.pill--danger`
- "Pending review" → `.pill--warning`
- "Profit" → `.pill--success` (but only if it's the meaningful state — if everything is always "profit" it's noise)
- "Room A" / category tags → `.pill--outline`

### 4.3 Buttons — three tiers, no more

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
  font-family: inherit;
}

/* Primary — ONE per screen maximum */
.btn--primary {
  background: var(--accent-600);
  color: var(--text-on-accent);
}
.btn--primary:hover { background: var(--accent-700); }

/* Secondary — most common button */
.btn--secondary {
  background: var(--surface);
  border-color: var(--gray-300);
  color: var(--text-primary);
}
.btn--secondary:hover { background: var(--gray-50); }

/* Tertiary — text-only, for low-priority actions */
.btn--tertiary {
  background: transparent;
  color: var(--text-secondary);
}
.btn--tertiary:hover { color: var(--text-primary); background: var(--gray-100); }

/* Danger variant — destructive actions only */
.btn--danger {
  background: var(--danger-fg);
  color: var(--text-on-accent);
}
```

**The "Add Payment" / "Add Student" decision:** Right now both are primary (green + orange). Only one can be primary per screen. The most common rule: "Add Student" is primary (filled violet), "Add Payment" is secondary (outlined). Reason: adding a student is the action that creates new revenue potential; recording a payment happens many times against an existing student.

### 4.4 Phase 2 PRs (in order)

1. `feat(ui): rebuild stat-card component`
2. `feat(ui): consolidate pill/badge variants`
3. `feat(ui): three-tier button system`

Each PR:
- Migrates only that component class across all uses
- Includes before/after screenshots
- Smoke-tested in launched Electron app
- Both themes verified

---

## 5. Phase 3 — Dark mode rebuild

Dark mode is where the consumer-app vibes concentrate. Rebuild approach:

### 5.1 Kill the glow

```bash
# Find every text-shadow and box-shadow with color
grep -rEn 'text-shadow|box-shadow.*(rgb|#)' --include='*.css' src/
```

Replace:
- Any `text-shadow` on headers/numbers → remove entirely
- Any `box-shadow` with a colored glow → replace with `var(--shadow-md)`
- Any `filter: drop-shadow(... colored ...)` → remove

### 5.2 Surface contrast

Your previous dark surfaces were within an 8-point lightness band — you fixed this once, verify it stayed fixed:

| Surface           | Light Mode | Dark Mode  |
|-------------------|------------|------------|
| Page background   | `#fafafa`  | `#0f0f0f`  |
| Card background   | `#ffffff`  | `#141414`  |
| Elevated card     | `#ffffff`  | `#1c1c1c`  |
| Hover/active      | `#f5f5f5`  | `#262626`  |
| Border            | `#e5e5e5`  | `#2a2a2a`  |

This gives a ~16-point spread between sunken / surface / elevated in dark mode, which is the minimum for visible hierarchy without lighting effects.

### 5.3 Side-by-side calibration

Open Stripe Dashboard in dark mode in Chrome. Open HOSTIX-APP in dark mode. Put them side by side. If yours looks more saturated, more glowing, or more "lit up" — desaturate more. Stripe is the target.

---

## 6. Phase 4 — Rollout sequence

Screen-by-screen migration. Order is intentional:

1. **Dashboard** — showcase screen, biggest perceived improvement
2. **Payments** — most-used screen by daily operators
3. **Students** — second most-used
4. **Rooms** — visual-heavy, benefits from cleanup
5. **Reports** — data-dense, benefits from neutral palette
6. **Expenses** — similar pattern to Payments, fast migration
7. **Cancellation List** + **Complaints & Maintenance** — low traffic, batch together
8. **Settings** + **Backup & Restore** + **Activity Log** — least visible, finish last

### 6.1 Per-screen PR checklist

Copy this into every PR description:

```
## UI Migration Checklist — [SCREEN NAME]

- [ ] No hex literals remain in this screen's CSS (only var() references)
- [ ] No inline `style=""` attributes added (token classes only)
- [ ] No `text-shadow` with color
- [ ] No `box-shadow` with color
- [ ] Maximum one primary button visible at any time
- [ ] Stat-card numbers use --text-primary, not semantic colors
- [ ] Pills use default gray unless state is actionable
- [ ] Tested: light mode, click through 3 actions
- [ ] Tested: dark mode, click through 3 actions
- [ ] Before screenshot attached (light + dark)
- [ ] After screenshot attached (light + dark)
- [ ] No regressions in adjacent screens (check sidebar, header)
- [ ] App launches and runs (not just CSS compiles)
```

### 6.2 Cleanup phase (after all 10 screens migrated)

- Remove legacy alias tokens from `tokens.css`
- Delete unused CSS files
- Run hex-literal grep again — should return near-zero results
- Final before/after comparison: every screen, both themes

---

## 7. Quick wins (do today, before Phase 1)

Three changes that move the needle in under an hour without touching the token system:

### 7.1 Neutralize stat-card numbers

Find every stat-card value rendering and change inline color to default:

```css
/* If you have something like this currently: */
.stat-card .value { color: var(--accent-cyan); }

/* Override to: */
.stat-card .value { color: var(--text-primary, #171717); }
```

### 7.2 Kill header glow in dark mode

```css
[data-theme="dark"] h1,
[data-theme="dark"] h2,
[data-theme="dark"] .dashboard-title,
[data-theme="dark"] .stat-card__value {
  text-shadow: none !important;
  filter: none !important;
}
```

The `!important` is a temporary measure; remove during proper Phase 3.

### 7.3 Fix `PKR PKR`

Locate the duplicate prefix (see Phase 0.3). Fix in a single targeted commit. Verify in launched app.

---

## 8. Beyond Phase 4 — what makes apps feel enterprise (roadmap, not Phase 1)

Once color discipline is done, the next layer of "feels enterprise" comes from things that aren't visual at all. Track these as follow-up issues:

- **Sortable columns** on every table
- **Keyboard shortcuts:** `Ctrl+K` command palette, `N` for new, `/` to focus search, `Esc` to close modals
- **Dignified empty states** — not "No data 😢" but a one-line explanation + clear CTA
- **Loading skeletons** instead of spinners (perceived performance jump)
- **Inline editing** in tables (click cell → edit → tab to next)
- **Bulk actions** with multi-select checkboxes
- **Export to CSV** on every list view
- **Right-click context menus** for power users
- **Saved views / filters** that persist across sessions
- **Toast notifications** with action buttons ("Deleted student. Undo")
- **Optimistic updates** — UI responds instantly, syncs in background

None of these are Phase 1. They are the destination after the visual foundation is solid.

---

## 9. Reference — what NOT to do

A list of patterns to actively avoid, drawn from the current state:

- ❌ Coloring numbers based on what they are (revenue green, expense red)
- ❌ Different icon color per stat card
- ❌ More than one primary button visible at once
- ❌ Pills colored by default (gray is default)
- ❌ Glowing text on dark backgrounds
- ❌ Saturated colors in dark mode (always desaturate vs light)
- ❌ Inline `style=""` attributes (use token classes)
- ❌ Hex literals in component CSS (use vars)
- ❌ Mixing accent colors (one accent: violet, full stop)
- ❌ Pure black (`#000`) or pure white (`#fff`) backgrounds
- ❌ Decorative gradients on UI chrome
- ❌ Emoji as status indicators (use pill components)

---

## 10. Reference apps (open while working)

- **Stripe Dashboard** — gold standard for dark mode + neutral palette
- **Linear** — typography hierarchy + restrained accent
- **Vercel** — flat depth, no glow
- **Plaid Dashboard** — financial UI without color-coding money
- **Notion** — neutral surfaces, sparing accent

If a design decision feels uncertain, open one of these and check what they did. If they didn't do it, you probably shouldn't either.

---

## 11. Session handoff protocol

When continuing this work across Claude sessions:

1. Reference this file by path: `HOSTIX_UI_UPGRADE_STRATEGY.md`
2. State which phase you're in and which screen
3. Attach the latest before-screenshot if available
4. Confirm: "Old token aliases still in place? Yes/No"
5. Confirm: "Last commit hash on Develop branch"

This keeps the work resumable without re-explaining context.

---

## 12. Definition of done

The migration is complete when:

- Hex-literal grep returns near-zero hits in `src/` CSS
- Every screen renders correctly in both themes
- Legacy `--accent*`, `--gold*`, `--royal*` token aliases are removed
- A new developer (or new Claude session) opening the codebase can identify which color to use by reading token names alone
- The app, opened side-by-side with Stripe Dashboard, reads as the same category of product

That's the bar. Anything less is mid-migration.
