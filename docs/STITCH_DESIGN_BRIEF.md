# HOSTIX-APP — Stitch Design Brief & Prompts

**Purpose:** Feed these prompts to Google Stitch so it generates *realistic* prototypes
grounded in what the app actually does — real screens, real data fields, real flows —
instead of generic SaaS filler. Built for a **full deep rebrand**.

**How to use:** Paste **Section 1 (Master Context)** into Stitch first to set the system
context. Then paste one **Section 3 screen prompt** at a time to generate each screen.
Keep all screens in one Stitch project so the design system stays consistent.

---

## 1. MASTER CONTEXT (paste this first)

> I'm designing a complete visual rebrand of **HOSTIX** — an offline desktop application
> for hostel (student-accommodation) management, used by hostel wardens and managers in
> Pakistan. It is a serious, data-dense **B2B operations tool**, not a consumer app.
> Think the polish of Stripe Dashboard, Linear, and Notion — restrained, professional,
> trustworthy. It runs on Windows desktop (Electron), so design for a **desktop web app
> at 1440px wide** with a persistent left sidebar, not mobile-first.
>
> **Product:** Hostel managers use HOSTIX every day to track students, rooms, rent
> payments, expenses, complaints, and financial reports for one or more hostels.
>
> **Brand personality:** Calm, precise, reliable, "money-grade" trust. One primary accent
> color used sparingly; neutral grays do 90% of the work. Color carries *meaning* (status),
> never decoration. Support both **light and dark themes**.
>
> **Accent color (the ONE accent):** refined **indigo/violet** — primary `#6366f1`
> (indigo-500) with `#7c3aed` (violet-600) for hover/strong states. Use it ONLY for primary
> buttons, active nav, links, focus rings, and the single data series in charts. Everything
> else is neutral gray. In dark mode, brighten the accent slightly (~`#8b5cf6`) for contrast.
>
> **Currency:** Pakistani Rupee, shown as `PKR 34,000` (tabular/monospaced numerals).
>
> **Layout system every screen shares:**
> - Left **sidebar** (~240px): hostel name + logo at top, vertical nav list with icons,
>   version label at the bottom. Nav items: Dashboard, Rooms, Students, Finance, Expenses,
>   Cancellations, Reports, Complaints & Maintenance, Activity Log, Settings.
>   Some nav items show a small numeric **badge** (e.g. pending cancellations, open issues).
> - Top **header bar**: page title on the left, a global search / command palette (⌘K),
>   theme toggle, and 1–2 primary action buttons on the right (e.g. "Add Student").
> - **Main content area**: scrollable, with generous whitespace and a max content width.
>
> **Component vocabulary to reuse across all screens:** stat/KPI cards, data tables with
> sortable column headers, status pills/badges (success / warning / danger / neutral),
> a three-tier button system (primary / secondary / tertiary), modals for add/edit forms,
> empty states, and toast notifications.
>
> **Hard rules (enterprise discipline):**
> - Exactly **one** primary (filled) button visible per screen; everything else is
>   secondary (outline) or tertiary (text).
> - **Money is plain text**, never colored green/red. The number is the headline.
> - All KPI-card icons share **one** neutral color — no rainbow icons.
> - Pills are **neutral gray by default**; only use color when the state is actionable
>   (overdue = danger, pending = warning, paid = success).
> - No glowing text, no decorative gradients, no pure black (#000) or pure white (#fff).
> - Dark mode is *more* desaturated than light mode, never just "lights off".
>
> I'll give you one screen at a time. Generate each as a desktop layout that reuses this
> shared sidebar + header shell and this component vocabulary, so all screens feel like one
> coherent product. First, propose a clean **design system**: color palette (pick ONE accent
> — suggest a refined option and show it), type scale, and the core components above.

---

## 2. REBRAND DIRECTION NOTES (for your decision before generating)

The current app uses a **violet `#7c3aed`** accent on an enterprise neutral base. For the
rebrand, decide ONE accent direction and tell Stitch. Options worth considering:

- **Refined violet/indigo** — keeps continuity with today's app, modern SaaS feel.
- **Deep teal / emerald** — "financial trust + growth", distinct from competitors.
- **Slate blue** — most conservative, maximally enterprise (Stripe/Plaid territory).

Whatever you pick: ONE accent, neutral grays everywhere else, semantic colors reserved for
status only. Tell Stitch the hex you chose in the master prompt.

---

## 3. PER-SCREEN PROMPTS

### 3.1 Dashboard
> Design the **Dashboard** — the landing screen after login. Top row: a row of **KPI stat
> cards** showing: Total Students, Occupancy Rate (% of beds filled), Total Revenue (this
> month, in PKR), Outstanding/Unpaid amount, Total Expenses, and Net. Each card: small
> neutral icon, uppercase label, large tabular number, a small sublabel or trend.
> Below the KPIs: a two-column section — left, a **revenue/collection trend line chart**
> (monthly); right, a **room-occupancy donut chart** (Occupied vs Vacant beds). Below that:
> a compact "Recent Activity" or "Recent Payments" list. Header action buttons: primary
> "Add Student", secondary "Add Payment". Calm, scannable, executive-summary feel.

### 3.2 Rooms
> Design the **Rooms** screen — a visual grid of room cards. Each room card shows: room
> number/name, room type (e.g. 2-seater, 4-seater), a capacity/occupancy indicator
> (e.g. "3 / 4 beds filled"), monthly rent (PKR), and a status pill (Full / Has Vacancy).
> Color the occupancy subtly (neutral, with a single accent for fill level). Include a
> search bar and filters (by room type, by availability). Primary header button: "Add Room".
> Clicking a room opens a detail modal listing the students in that room.

### 3.3 Students
> Design the **Students** screen — a dense, sortable **data table**. Columns: Name (with
> small avatar/initials), Room, Phone / Emergency contact, CNIC (national ID), Course,
> rent status, and an Actions column (view / edit / record payment). Above the table: a
> search bar, filters (by room, by payment status, active/inactive), and a result count.
> Pagination at 50 rows per page. Primary button: "Add Student" (opens a multi-field modal:
> name, father name, CNIC, phone, emergency contact, address, course, room assignment,
> monthly rent, security deposit, join date). Also show a secondary "Add Payment".

### 3.4 Finance / Payments
> Design the **Finance** screen — the most-used screen by daily operators. A **payments
> data table** with columns: Month, Monthly Rent, Concession, Paid (+Extras), Unpaid,
> Method (Cash / Bank / JazzCash / EasyPaisa), Status pill (Paid / Partial / Unpaid /
> Overdue), Date, Actions. Frozen Actions column on the right. Clickable rows. Above the
> table: month/period filter, search by student, a "show all vs current" toggle, and small
> summary stats (Collected this month, Outstanding). Primary button: "Add Payment" — opens
> a modal to record a rent payment against a student for a given month, with method,
> amount, optional extra charges, and concession. A printed **PDF receipt** is generated
> after — show a clean receipt preview layout too.

### 3.5 Expenses
> Design the **Expenses** screen — a data table of hostel operating expenses. Columns:
> Date, Category (Utilities, Maintenance, Salaries, Food, Misc), Description, Amount (PKR),
> Added by, Actions. Above: category filter, date-range filter, search, and a "Total
> Expenses" summary stat. Primary button: "Add Expense" (modal: date, category, description,
> amount). Include CSV export. Same neutral table styling as Finance.

### 3.6 Cancellation List
> Design the **Cancellation List** screen — students who have requested to leave / vacate.
> A table with: Student, Room, Request date, Reason, Refund/settlement amount, Status pill
> (Pending / Approved / Completed). Filter tabs at top (All / Pending / Approved /
> Completed). The Pending count drives a sidebar badge. Primary button: "Add Cancellation".
> Approving a cancellation frees the bed in Rooms.

### 3.7 Reports
> Design the **Reports** screen — data-dense analytics. An overview grid of report tiles
> (Revenue, Occupancy, Collections vs Outstanding, Expenses breakdown, Defaulters list).
> Clicking a tile opens a detail view with charts (bar + line) and an exportable table.
> Include a date-range / month selector at the top and an "Export" (CSV / PDF) action.
> Neutral palette, charts use the single accent plus grays — no rainbow series.

### 3.8 Complaints & Maintenance
> Design the **Complaints & Maintenance** screen — two tabs: "Complaints" and "Maintenance".
> Each is a list/table of issues with: title, reported by (student/staff), room, date,
> priority pill (Low / Medium / High), and status pill (Open / In Progress / Resolved).
> Open issues drive a sidebar badge. Primary button: "Add Issue" (modal: type, room,
> description, priority). Card or table layout, calm and triage-friendly.

### 3.9 Activity Log
> Design the **Activity Log** — an audit trail. A clean, reverse-chronological feed/table
> of system events: timestamp, user (warden/admin), action (created student, recorded
> payment, edited room, voided payment), and affected entity. Filter by user, by action
> type, and by date range. Read-only, monospace timestamps, very neutral.

### 3.10 Settings
> Design the **Settings** screen — a vertical sub-nav (left) with sections: Hostel Profile
> (name, logo, address), Room Types & Rents, Users & Roles (Warden / Admin / Super Admin),
> Billing preferences, Backup & Restore (manual backup, restore from file, auto-backup
> schedule), Theme (light/dark/system), License & Activation. Right pane shows the active
> section's form. Clean form design with grouped fields, labels, helper text, save bar.

### 3.11 Login / Lock screen
> Design the **Login / Activation** screen — a centered card on a calm neutral background
> with the HOSTIX logo, a username + password (or PIN) field, a primary "Unlock" button,
> and a subtle footer with version + license status. Professional, secure, minimal.

---

## 4. AFTER STITCH — handoff back to Claude Code

Once designs look right in Stitch:
1. Either **export to Figma** (then share the Figma URL — Claude reads it via Figma MCP)
   or use the **Stitch MCP** tools directly from Claude Code.
2. Migrate **one screen per PR**, reusing existing design tokens in `renderer/tokens.css`.
3. Follow `HOSTIX_UI_UPGRADE_STRATEGY.md` rules: branch off master, smoke-test in the
   launched Electron app, before/after screenshots in both themes.
