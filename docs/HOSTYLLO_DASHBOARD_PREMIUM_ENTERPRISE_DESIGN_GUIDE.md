# HOSTYLLO DASHBOARD — PREMIUM ENTERPRISE COLOR & GRADIENT IMPLEMENTATION GUIDE

## 1. Purpose

Rebuild the Hostyllo dashboard so it matches the approved premium enterprise reference design.

The goal is **not** to make the dashboard plain white. Use a refined light workspace combined with a deep navy/blue navigation system, restrained color gradients, colorful KPI accents, and subtle tinted surfaces.

Preserve all existing dashboard functionality, data, labels, interactions, routing, and responsive behavior. This document defines the visual implementation.

---

## 2. Design Direction

Use these principles throughout the dashboard:

- Premium enterprise SaaS
- Light-mode only
- Deep navy navigation
- Royal/electric blue as the primary brand color
- Green for positive financial/availability states
- Red for expenses/danger
- Orange for warnings/due payments
- Purple for secondary analytics
- Very light blue-gray page background instead of pure white
- White cards with subtle tinted surfaces
- Soft gradients, never loud/neon gradients
- Thin borders and restrained shadows
- High information density without visual clutter
- Rounded 14–16px cards
- Strong typography hierarchy
- Consistent 8px spacing system

Do NOT introduce dark mode for this dashboard.

---

# 3. Core Color Tokens

Define these as CSS variables/design tokens.

## Brand

```css
--brand-primary: #2563EB;
--brand-dark: #1E40AF;
--brand-light: #3B82F6;
--brand-soft: #DBEAFE;
```

### Usage

- `#2563EB` — primary buttons, active navigation, main charts, progress bars
- `#1E40AF` — deep brand accents and hover states
- `#3B82F6` — secondary blue accents
- `#DBEAFE` — blue icon backgrounds, selected/tinted surfaces

---

## Enterprise Navy

```css
--navy-950: #071A3A;
--navy-900: #0F172A;
--navy-800: #12315F;
--navy-700: #173F7A;
```

Use `#071A3A` / `#0F172A` as the dominant sidebar base.

Do NOT use pure black.

---

## Semantic Colors

### Success / Green

```css
--success: #10B981;
--success-dark: #059669;
--success-soft: #DCFCE7;
--success-text: #047857;
```

Use for:

- Available fund
- Positive net balance
- Revenue-positive indicators
- Free seats
- Occupancy improvement
- Successful status badges

### Danger / Red

```css
--danger: #EF4444;
--danger-dark: #DC2626;
--danger-soft: #FEE2E2;
--danger-text: #B91C1C;
```

Use for:

- Expenses
- Overdue payments
- Critical alerts
- Negative financial states

### Warning / Orange

```css
--warning: #F59E0B;
--warning-dark: #D97706;
--warning-soft: #FEF3C7;
--warning-text: #B45309;
```

Use for:

- Pending payments
- Due soon
- Warning states
- Outstanding amounts

### Purple

```css
--purple: #8B5CF6;
--purple-dark: #7C3AED;
--purple-soft: #EDE9FE;
```

Use for:

- Active students
- Secondary analytics
- Occupancy visualization
- Pending chart series where appropriate

---

# 4. Workspace Background

Do NOT use `#FFFFFF` as the entire application background.

Use:

```css
--app-background: #F4F7FC;
```

Recommended subtle background:

```css
background:
  radial-gradient(
    circle at 80% 0%,
    rgba(37, 99, 235, 0.045),
    transparent 32%
  ),
  #F4F7FC;
```

The effect must remain extremely subtle.

The user should perceive the page as a premium light enterprise workspace, not a colorful marketing page.

---

# 5. Sidebar

The sidebar is one of the strongest visual anchors.

Use a deep navy gradient:

```css
background: linear-gradient(
  180deg,
  #071A3A 0%,
  #0B2A5B 52%,
  #082B69 100%
);
```

Recommended:

```css
color: #FFFFFF;
```

Secondary sidebar text:

```css
color: #CBD5E1;
```

Muted labels:

```css
color: #94A3B8;
```

---

## 5.1 Active Navigation

Use a premium blue gradient:

```css
background: linear-gradient(
  135deg,
  #2563EB 0%,
  #3B82F6 100%
);
```

Add a subtle glow:

```css
box-shadow:
  0 8px 20px rgba(37, 99, 235, 0.22);
```

Active text:

```css
color: #FFFFFF;
```

Active icon:

```css
color: #FFFFFF;
```

Border/accent:

```css
border-color: rgba(255,255,255,0.10);
```

Do not make inactive navigation items brightly colored.

---

# 6. Main Workspace

Use:

```css
background: #F4F7FC;
```

The content area should feel spacious and premium.

Maximum content width:

```css
max-width: 1440px;
```

Use generous but controlled spacing.

---

# 7. Cards

Cards should be predominantly white but should NOT look flat.

```css
background: #FFFFFF;
border: 1px solid #E2E8F0;
border-radius: 16px;
```

Shadow:

```css
box-shadow:
  0 8px 24px rgba(15, 23, 42, 0.045);
```

Hover:

```css
box-shadow:
  0 12px 30px rgba(15, 23, 42, 0.075);
```

Transition:

```css
transition:
  transform 180ms ease,
  box-shadow 180ms ease,
  border-color 180ms ease;
```

Avoid heavy shadows.

---

# 8. KPI Cards

The top KPI row should contain:

1. Total Residents
2. Total Revenue
3. Expenses & Transfers
4. Available Fund
5. Outstanding Dues

Each KPI card should have a subtle semantic color identity.

---

## Total Residents

Icon background:

```css
background: #DBEAFE;
color: #2563EB;
```

Progress:

```css
#2563EB
```

---

## Total Revenue

Icon background:

```css
background: #DCFCE7;
color: #059669;
```

Chart:

```css
#10B981
```

Use a subtle chart fill:

```css
rgba(16,185,129,0.10)
```

---

## Expenses & Transfers

Icon background:

```css
background: #FEE2E2;
color: #EF4444;
```

Chart:

```css
#EF4444
```

Chart fill:

```css
rgba(239,68,68,0.08)
```

---

## Available Fund

Icon background:

```css
background: #EDE9FE;
color: #7C3AED;
```

Chart:

```css
#8B5CF6
```

Chart fill:

```css
rgba(139,92,246,0.10)
```

---

## Outstanding Dues

Icon background:

```css
background: #FEF3C7;
color: #D97706;
```

Chart:

```css
#F59E0B
```

Chart fill:

```css
rgba(245,158,11,0.10)
```

---

# 9. KPI Typography

Primary value:

```css
font-size: 28px;
font-weight: 700;
color: #0F172A;
```

Currency prefix:

```css
font-size: 13px;
font-weight: 500;
color: #64748B;
```

Card title:

```css
font-size: 12px;
font-weight: 700;
letter-spacing: 0.06em;
text-transform: uppercase;
color: #334155;
```

Supporting text:

```css
font-size: 12px;
color: #64748B;
```

---

# 10. Status Badges

Use tinted backgrounds instead of solid saturated backgrounds.

### Success

```css
background: #ECFDF5;
color: #059669;
```

### Warning

```css
background: #FFF7ED;
color: #C2410C;
```

### Danger

```css
background: #FEF2F2;
color: #DC2626;
```

### Purple

```css
background: #F5F3FF;
color: #7C3AED;
```

Border radius:

```css
border-radius: 999px;
```

---

# 11. Summary Cards

For:

- Occupied Rooms
- Vacant Rooms
- Active Students

Use white surfaces with colored icon containers.

### Occupied Rooms

```css
icon-bg: #DBEAFE;
icon: #2563EB;
progress: #2563EB;
```

### Vacant Rooms

```css
icon-bg: #DCFCE7;
icon: #059669;
progress: #10B981;
```

### Active Students

```css
icon-bg: #EDE9FE;
icon: #7C3AED;
progress: #8B5CF6;
```

Progress track:

```css
background: #E8EDF5;
```

---

# 12. Revenue Trend Chart

Use the following exact series colors:

```css
Revenue   = #2563EB;
Expenses  = #EF4444;
Transfers = #F59E0B;
Pending   = #8B5CF6;
```

Revenue area fill:

```css
rgba(37,99,235,0.10)
```

Expenses area fill:

```css
rgba(239,68,68,0.06)
```

Grid:

```css
#E2E8F0
```

Axis labels:

```css
#64748B
```

Chart background should remain white.

Do not use gradients that make the chart difficult to read.

---

# 13. Seat Availability

Keep the seat-availability card white, but use semantic tinted cells.

### Available / has free seats

```css
background: #F5F3FF;
color: #7C3AED;
```

### Full

```css
background: #F1F5F9;
color: #475569;
```

### Total

Use blue:

```css
color: #2563EB;
```

### Free

Use green:

```css
color: #059669;
```

### Filled

Use purple:

```css
color: #7C3AED;
```

Avoid dark filled cells.

---

# 14. Occupancy by Room Type

Use a clean donut chart.

Recommended series:

```css
Single = #2563EB;
Double = #10B981;
Triple = #F59E0B;
Quad   = #8B5CF6;
```

Center value:

```css
font-size: 22px;
font-weight: 700;
color: #0F172A;
```

Center subtitle:

```css
color: #64748B;
```

Use a very light track behind the donut:

```css
#E8EDF5
```

---

# 15. Pending Payments

Use:

```css
amount-color: #DC2626;
```

Due Soon:

```css
background: #FFF7ED;
color: #C2410C;
```

Overdue:

```css
background: #FEF2F2;
color: #DC2626;
```

Paid / licensed:

```css
background: #ECFDF5;
color: #059669;
```

Rows should use subtle separators:

```css
border-color: #EEF2F7;
```

Do not use strong table borders.

---

# 16. Buttons

## Primary Button

```css
background: linear-gradient(
  135deg,
  #2563EB 0%,
  #1D4ED8 100%
);

color: #FFFFFF;
border: none;
border-radius: 10px;

box-shadow:
  0 5px 14px rgba(37, 99, 235, 0.20);
```

Hover:

```css
background: linear-gradient(
  135deg,
  #1D4ED8 0%,
  #1E40AF 100%
);
```

---

## Secondary Button

```css
background: #FFFFFF;
color: #334155;
border: 1px solid #CBD5E1;
border-radius: 10px;
```

Hover:

```css
background: #F8FAFC;
border-color: #94A3B8;
```

---

# 17. Header

Header background:

```css
background: rgba(255,255,255,0.88);
```

Use subtle backdrop blur where supported:

```css
backdrop-filter: blur(12px);
```

Bottom border:

```css
#E2E8F0
```

Search box:

```css
background: #F8FAFC;
border: 1px solid #E2E8F0;
```

Focus:

```css
border-color: #93C5FD;
box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
```

---

# 18. Typography

Use **Inter** throughout the dashboard.

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Dashboard title:

```css
font-size: 28px;
font-weight: 700;
color: #0F172A;
```

Section title:

```css
font-size: 14px;
font-weight: 700;
color: #0F172A;
```

Body:

```css
font-size: 14px;
color: #334155;
```

Secondary:

```css
font-size: 12px;
color: #64748B;
```

Never use excessively thin typography.

---

# 19. Borders

Primary border:

```css
#E2E8F0
```

Soft divider:

```css
#EEF2F7
```

Focused border:

```css
#93C5FD
```

Avoid black borders.

---

# 20. Border Radius

Use a consistent hierarchy:

```css
--radius-card: 16px;
--radius-control: 10px;
--radius-small: 8px;
--radius-pill: 999px;
```

Do not mix random corner radii.

---

# 21. Shadows

Default:

```css
box-shadow:
  0 8px 24px rgba(15,23,42,0.045);
```

Elevated:

```css
box-shadow:
  0 14px 35px rgba(15,23,42,0.08);
```

Button:

```css
box-shadow:
  0 5px 14px rgba(37,99,235,0.20);
```

Keep shadows subtle and professional.

---

# 22. Icon Style

Use consistent outline icons.

Recommended:

```css
stroke-width: 1.8–2px;
```

Do not mix filled and outlined icon styles randomly.

Icon containers should normally be:

```css
width: 40px;
height: 40px;
border-radius: 12px;
```

Use semantic tinted backgrounds.

---

# 23. Important Visual Rule

The dashboard should visually read in this order:

1. Deep navy sidebar
2. Blue brand identity
3. KPI numbers
4. Financial status colors
5. Room/student operational metrics
6. Analytics
7. Pending actions

Do not allow gradients to overpower the information.

The design should feel like a serious enterprise product, not a gaming dashboard or a colorful consumer app.

---

# 24. Gradients — Approved Only

Use gradients only in these places:

### Sidebar

```css
linear-gradient(
  180deg,
  #071A3A 0%,
  #0B2A5B 52%,
  #082B69 100%
);
```

### Active navigation

```css
linear-gradient(
  135deg,
  #2563EB 0%,
  #3B82F6 100%
);
```

### Primary buttons

```css
linear-gradient(
  135deg,
  #2563EB 0%,
  #1D4ED8 100%
);
```

### Very subtle page atmosphere

```css
radial-gradient(
  circle at 80% 0%,
  rgba(37,99,235,0.045),
  transparent 32%
);
```

Do not add gradients to every card.

Do not use rainbow gradients.

Do not use neon gradients.

---

# 25. Layout Requirements

Desktop dashboard:

- Sidebar: approximately 240px
- Main workspace: flexible
- Content max-width: 1440px
- KPI cards: 5-column layout where screen width permits
- Summary cards: 3-column layout
- Analytics section: 2-column layout
- Bottom section: 2-column layout
- Maintain comfortable gutters

At smaller widths, cards should collapse naturally rather than becoming horizontally cramped.

---

# 26. Responsive Behavior

### ≥ 1440px

Full enterprise layout.

### 1024–1439px

Reduce card gaps and content padding.

### 768–1023px

Collapse KPI cards to 2–3 columns.

### < 768px

Use:

- Collapsible sidebar
- Single-column cards
- Horizontally scrollable chart controls where required
- Touch-friendly controls
- Minimum 44px interactive targets

Do not redesign the information architecture for mobile; adapt the existing dashboard.

---

# 27. Implementation Rules for the Agent

1. First inspect the existing Hostyllo dashboard implementation.
2. Do NOT replace working business logic.
3. Do NOT remove existing metrics.
4. Do NOT remove dashboard sections.
5. Do NOT change API/data contracts.
6. Extract colors into reusable CSS variables/theme tokens.
7. Apply the new visual system consistently.
8. Reuse existing components where possible.
9. Avoid hard-coded colors scattered throughout components.
10. Ensure charts use the exact semantic colors defined above.
11. Ensure the sidebar uses the navy gradient.
12. Ensure the workspace uses `#F4F7FC`, not pure white.
13. Ensure cards remain white with subtle borders/shadows.
14. Ensure gradients are restrained.
15. Keep all existing interactions functional.
16. Preserve accessibility and sufficient text contrast.
17. Verify light mode visually at 100%, 125%, and 150% browser scaling.
18. Test desktop, tablet, and mobile breakpoints.
19. Remove accidental default browser colors and inconsistent component colors.
20. Do a final visual pass against the approved reference before completion.

---

# 28. Definition of Done

The implementation is complete only when:

- [ ] Sidebar has the deep navy enterprise gradient.
- [ ] Active navigation uses the blue gradient.
- [ ] Workspace uses a very light blue-gray background.
- [ ] KPI cards use semantic blue/green/red/purple/orange accents.
- [ ] Revenue chart uses blue.
- [ ] Expenses chart uses red.
- [ ] Transfers chart uses orange.
- [ ] Pending chart uses purple.
- [ ] Occupancy donut uses blue/green/orange/purple.
- [ ] Cards have 16px radius and subtle shadows.
- [ ] Buttons use the approved blue gradient.
- [ ] Status badges use soft tinted backgrounds.
- [ ] Typography uses Inter with the specified hierarchy.
- [ ] No dark mode is introduced.
- [ ] No neon colors are introduced.
- [ ] No rainbow gradients are introduced.
- [ ] Existing functionality remains intact.
- [ ] Responsive behavior remains functional.
- [ ] The final result visually matches the approved premium enterprise reference.

---

## Final Instruction to the Agent

Treat this document as the **visual source of truth for the Hostyllo dashboard**.

Do not merely approximate the colors. Implement the specified HEX values, gradients, semantic mappings, borders, shadows, radii, typography, and chart colors as reusable design tokens.

The final dashboard should feel like a premium enterprise SaaS product: **deep navy + royal blue foundation, light blue-gray workspace, white elevated surfaces, and disciplined green/red/orange/purple semantic accents.**
