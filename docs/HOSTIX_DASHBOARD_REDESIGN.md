# HOSTIX-APP — Dashboard Redesign Spec

**Companion to:** `HOSTIX_UI_UPGRADE_STRATEGY.md`
**Scope:** Sidebar structure + Dashboard layout refinements
**Target screen:** Dashboard only (other screens follow main strategy doc)

This spec is **layout/structure only**. Color, typography, and component tokens follow the main strategy doc. Do not mix concerns — sticky sidebar work is one PR, color migration is a different PR.

---

## 1. Sidebar — three-section sticky layout

### 1.1 The problem

Currently the entire sidebar scrolls together. On short viewports or when menu items overflow, users lose either the HOSTIX brand at the top or the Settings/Backup/Activity controls at the bottom. Enterprise pattern: pin brand to the top, pin system controls to the bottom, scroll only the middle.

### 1.2 Target structure

```
┌──────────────────────────────────┐
│ STICKY TOP (flex-shrink: 0)      │
│ ┌──────────────────────────────┐ │
│ │ [Hostel logo] DAMAM BOYS...  │ │  ← hostel brand block
│ │ SAFE & COMFORTABLE LIVING    │ │
│ │ 4/1 Kakakhel Street...       │ │
│ │              [HOSTIX V3.0]   │ │  ← HOSTIX brand badge
│ ├──────────────────────────────┤ │
│ │ [📅 Sun, Jun 21        ▾]    │ │  ← date selector
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ SCROLLABLE MIDDLE (flex: 1)      │
│ ┌──────────────────────────────┐ │
│ │ MAIN                         │ │
│ │   Dashboard                  │ │
│ │   Rooms                      │ │
│ │   Students                   │ │
│ │   Cancellation List          │ │
│ │   Complaints & Maintenance   │ │
│ │                              │ │
│ │ FINANCE                      │ │
│ │   Payments                   │ │
│ │   Expenses                   │ │
│ │   Reports                    │ │
│ │                              │ │
│ │ ↕ scrolls when overflow      │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ STICKY BOTTOM (flex-shrink: 0)   │
│ ┌──────────────────────────────┐ │
│ │ SYSTEM                       │ │
│ │   Settings                   │ │
│ │   Backup & Restore           │ │
│ │   Activity Log               │ │
│ │   Help & Support             │ │
│ │   Clear All Data             │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### 1.3 Implementation

The sidebar container becomes a flex column with three children:

```css
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;             /* fill viewport */
  background: var(--surface);
  border-right: 1px solid var(--surface-border);
  width: 260px;
  flex-shrink: 0;            /* don't compress when main content pushes */
}

.sidebar__top {
  flex-shrink: 0;            /* never shrink, always visible */
  border-bottom: 1px solid var(--surface-divider);
  padding: var(--space-4);
}

.sidebar__middle {
  flex: 1 1 auto;            /* take remaining space */
  overflow-y: auto;          /* scroll when overflow */
  overflow-x: hidden;
  padding: var(--space-3) 0;

  /* Custom scrollbar — invisible until hover */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.sidebar__middle:hover {
  scrollbar-color: var(--gray-300) transparent;
}
.sidebar__middle::-webkit-scrollbar { width: 6px; }
.sidebar__middle::-webkit-scrollbar-track { background: transparent; }
.sidebar__middle::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
}
.sidebar__middle:hover::-webkit-scrollbar-thumb {
  background: var(--gray-300);
}

.sidebar__bottom {
  flex-shrink: 0;            /* never shrink, always visible */
  border-top: 1px solid var(--surface-divider);
  padding: var(--space-3) 0;
  background: var(--surface-muted); /* slight visual separation */
}
```

### 1.4 HTML structure

```html
<aside class="sidebar">

  <!-- STICKY TOP -->
  <div class="sidebar__top">
    <div class="brand-block">
      <img src="..." alt="" class="brand-block__logo">
      <div class="brand-block__name">DAMAM BOYS HOSTEL</div>
      <div class="brand-block__tagline">SAFE &amp; COMFORTABLE LIVING</div>
      <div class="brand-block__address">
        4/1 Kakakhel Street, Danishabad Shaheen Town, Peshawar
      </div>
      <div class="brand-block__hostix">HOSTIX · V3.0</div>
    </div>
    <button class="date-selector">
      <svg>...</svg>
      <span>Sun, Jun 21</span>
      <svg class="chevron">...</svg>
    </button>
  </div>

  <!-- SCROLLABLE MIDDLE -->
  <nav class="sidebar__middle">
    <div class="nav-group">
      <div class="nav-group__label">MAIN</div>
      <a class="nav-item nav-item--active" href="#dashboard">Dashboard</a>
      <a class="nav-item" href="#rooms">Rooms</a>
      <a class="nav-item" href="#students">Students</a>
      <a class="nav-item" href="#cancellations">Cancellation List</a>
      <a class="nav-item" href="#complaints">Complaints &amp; Maintenance</a>
    </div>
    <div class="nav-group">
      <div class="nav-group__label">FINANCE</div>
      <a class="nav-item" href="#payments">Payments</a>
      <a class="nav-item" href="#expenses">Expenses</a>
      <a class="nav-item" href="#reports">Reports</a>
    </div>
  </nav>

  <!-- STICKY BOTTOM -->
  <div class="sidebar__bottom">
    <div class="nav-group">
      <div class="nav-group__label">SYSTEM</div>
      <a class="nav-item" href="#settings">Settings</a>
      <a class="nav-item" href="#backup">Backup &amp; Restore</a>
      <a class="nav-item" href="#activity">Activity Log</a>
      <a class="nav-item" href="#help">Help &amp; Support</a>
      <a class="nav-item nav-item--danger" href="#clear">Clear All Data</a>
    </div>
  </div>

</aside>
```

### 1.5 HOSTIX brand block — hardcoded

The `HOSTIX · V3.0` label and the layout shell are hardcoded. The hostel name, tagline, and address come from settings (per-tenant data). The HOSTIX badge sits at the bottom of the brand block as a fixed identity mark — never editable by the user.

```css
.brand-block__hostix {
  display: inline-block;
  margin-top: var(--space-2);
  padding: 2px var(--space-2);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.05em;
  color: var(--accent-700);
  background: var(--accent-50);
  border-radius: var(--radius-sm);
}
```

In dark mode this becomes a subtle violet pill — visible but not loud.

### 1.6 Acceptance criteria

- [ ] Sidebar top (brand + date) stays pinned when middle scrolls
- [ ] Sidebar bottom (system menu) stays pinned when middle scrolls
- [ ] Middle scrolls only when content overflows
- [ ] Scrollbar appears only on hover
- [ ] Sidebar fills full viewport height regardless of main content
- [ ] No horizontal scroll inside any sidebar section
- [ ] Works at 1366×768 (your dev resolution) and 1920×1080

---

## 2. Top header — verify it's truly fixed

The main content area has a header row (Dashboard title + search + date + user + buttons). Per the request, this should be fixed (sticky to top of main area, not the viewport — main area only).

### 2.1 Structure

```css
.main-content {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;          /* containment for sticky header */
}

.main-content__header {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border);
  padding: var(--space-4) var(--space-6);
}

.main-content__body {
  flex: 1 1 auto;
  overflow-y: auto;          /* this is what scrolls */
  padding: var(--space-6);
}
```

### 2.2 Acceptance criteria

- [ ] Page title, search, date, user chip, action buttons stay visible while body scrolls
- [ ] No double scrollbars (only `.main-content__body` scrolls)
- [ ] Header background is opaque (not transparent — content must not show through)

---

## 3. By Room Type — add donut chart

### 3.1 Current state

The "By Room Type" card shows a list of progress bars (1-Seater 0/9, 2-Seater 1/18, etc.). It tells one story: occupancy per type. It doesn't tell the manager about their room mix at a glance.

### 3.2 Target layout

Split the card into two panes:

```
┌─────────────────────────────────────────────────────────┐
│ 🏠 BY ROOM TYPE                          [1% full]       │
├──────────────────────────┬──────────────────────────────┤
│                          │  1-Seater          0/9   ▓░░ │
│         ╭───────╮        │  2-Seater          1/18  ▓░░ │
│        ╱  41%   ╲        │  3-Seater          0/24  ░░░ │
│       │  capacity│       │  4-Seater          0/32  ░░░ │
│        ╲  in 5  ╱        │  5-Seater          0/40  ░░░ │
│         ╲ seater╱        │                              │
│          ╰─────╯         │  Total: 1/123 (1%)           │
│                          │                              │
│   ● 1-Seater    9        │                              │
│   ● 2-Seater   18        │                              │
│   ● 3-Seater   24        │                              │
│   ● 4-Seater   32        │                              │
│   ● 5-Seater   40        │                              │
└──────────────────────────┴──────────────────────────────┘
```

**Left pane (donut):** Capacity distribution — how the 123 total seats split across room types. Answers "what's my room mix?"

**Right pane (bars):** Occupancy per type. Answers "where are my empty beds?"

### 3.3 Donut chart spec

- Library: Chart.js (you already use it for Revenue Trend — don't add a second chart library)
- Type: `doughnut` with `cutout: '65%'`
- Center label: largest segment % or "123 total"
- Legend: right of donut OR below (depending on container width)
- Color palette: **gray scale + one accent**. NOT a rainbow.

```js
new Chart(ctx, {
  type: 'doughnut',
  data: {
    labels: ['1-Seater', '2-Seater', '3-Seater', '4-Seater', '5-Seater'],
    datasets: [{
      data: [9, 18, 24, 32, 40],  // capacity per type
      backgroundColor: [
        'var(--gray-300)',
        'var(--gray-400)',
        'var(--gray-500)',
        'var(--gray-600)',
        'var(--accent-600)',  // largest segment gets the accent
      ],
      borderWidth: 0,
    }]
  },
  options: {
    cutout: '65%',
    plugins: {
      legend: { display: false },  // we build our own
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${ctx.parsed} seats (${pct(ctx)}%)`
        }
      }
    },
    maintainAspectRatio: false,
  }
});
```

**Important:** Chart.js doesn't read CSS variables directly — resolve them at runtime:

```js
function token(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim();
}
// usage: token('--gray-300')
```

Re-render the chart on theme change so dark mode picks up the dark gray scale.

### 3.4 Right pane — progress bars

Keep the existing list but restyle per token system:

```css
.room-type-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}

.room-type-row__name {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.room-type-row__count {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.room-type-row__bar {
  width: 80px;
  height: 4px;
  background: var(--gray-200);
  border-radius: 2px;
  overflow: hidden;
}

.room-type-row__bar-fill {
  height: 100%;
  background: var(--accent-600);
  transition: width 200ms ease;
}
```

**No per-type bar colors.** All bars use the same accent. The metric is occupancy %, not "which type" — type is the row label.

### 3.5 Responsive behavior

Below 900px container width, stack vertically: donut on top, bars below. Use container queries if available, otherwise media query on viewport.

---

## 4. Other dashboard refinements

### 4.1 Stat card row — collapse from 5 to 4

Currently five cards: Total Revenue / Available Fund / Expenses / Funds Transfer / Pending. At 1366px width each card gets ~250px, which crams the labels.

Proposal: **merge Total Revenue + Available Fund** into one card with two values stacked, OR move Funds Transfer to a secondary location since it's an action ("+ New Transfer"), not a metric.

Cleaner option: 4-card row.

| Card               | Value          | Subline              |
|--------------------|----------------|----------------------|
| Total Revenue      | PKR 19,000     | 1 payment received   |
| Available Fund     | PKR 19,000     | After expenses       |
| Expenses (Month)   | PKR 0          | 0 items              |
| Pending Collection | PKR 0          | 0 students unpaid    |

Move "Funds Transfer" to its own action button at the top of the page, or into the Reports section. It's not a dashboard KPI; it's an operation.

### 4.2 Occupancy row — keep at 3

Occupied Rooms / Vacant Rooms / Active Students is good. Don't touch.

### 4.3 Revenue Trend chart

Currently shows yearly trend with one data point (June). At low data volume this looks empty. Two options:

- **Add a "no data" overlay** for months without data: small gray dots, no line interpolation between them.
- **Switch default range to "Last 6 months"** so empty future months don't dominate the chart.

### 4.4 Seat availability grid

The numbered grid (1-42) is information-dense and useful. Keep the layout. Just apply the token system: cells become neutral surfaces, "filled" gets `--danger-bg` background + `--danger-fg` text, "free" gets `--gray-100` background.

### 4.5 Pending Payments card

When "All cleared!" — the green checkmark + happy state is fine. Keep it. This is a case where semantic color earns its place (the user wants to *see* that they're clear).

When there are pending payments, switch to a list with `--warning-bg` accent on the count badge.

### 4.6 Recent Payments table

Already well-structured. Apply token system in Phase 4.2 of main strategy doc. No structural change needed.

---

## 5. Implementation order

Three separate PRs. Do NOT bundle.

### PR 1 — Sticky sidebar

- Refactor sidebar to three-section flex layout
- Brand block at top (sticky)
- Menu groups in middle (scrollable)
- System group at bottom (sticky)
- Add "Help & Support" nav item (placeholder route is fine)
- Verify in launched app: scroll the middle, top and bottom stay
- Verify at 1366×768 and 1920×1080
- Both themes

### PR 2 — Sticky main header

- Refactor main content to flex column
- Header sticky inside main area (not viewport)
- Body scrolls independently
- No double scrollbars
- Verify by scrolling Dashboard to the Recent Payments table — header stays

### PR 3 — Room Type donut chart

- Split By Room Type card into two-column layout
- Donut chart left, bars right
- Token-based color (gray scale + one accent)
- Theme-aware (re-render on theme switch)
- Tooltip with capacity + percentage
- Below 900px container: stack vertically

### Out of scope (defer to other PRs)

- Color/typography migration → main strategy doc
- Stat card row collapse → separate UX decision PR
- Revenue chart range default → separate small PR
- Seat grid token migration → Phase 4.2 of main strategy

---

## 6. Acceptance — full dashboard redesign

When all three PRs are merged:

- [ ] HOSTIX brand visible at all times in sidebar
- [ ] Settings/Backup/Activity/Help visible at all times in sidebar
- [ ] Menu items scroll within sidebar middle
- [ ] Main header (title, search, buttons) visible at all times when scrolling dashboard
- [ ] By Room Type card shows donut + bars
- [ ] Donut respects token system and theme
- [ ] No layout regressions on Students, Rooms, Reports, or any other screen
- [ ] App launches and clicking through Dashboard → Rooms → Students → back to Dashboard works without console errors

---

## 7. Notes for Claude Code session

When picking this up:

1. Read `HOSTIX_UI_UPGRADE_STRATEGY.md` first for context (especially section 1 ground rules)
2. Confirm current commit hash on Develop branch before starting
3. Start with PR 1 (sticky sidebar) — lowest risk, highest visibility win
4. Launch the Electron app after every CSS change, not just every commit
5. Take before/after screenshots for the PR description
6. If a refactor starts touching more than the sidebar/header/room-type card, stop and reassess — that's the scope-creep signal that caused the previous regression
