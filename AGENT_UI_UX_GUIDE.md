# AGENT UI/UX & REPO GUIDE — HOSTIX-APP

This file is written for an assistant agent (bot) that will work on, audit, and make changes to the HOSTIX-APP repository. It focuses on UI/UX, CSS/theming, features, and the dashboard layout, and provides direct links to important files and entry points so the agent has full context and access to the repo.

Repository
- Name: mushtaqahmaduop/HOSTIX-APP
- URL: https://github.com/mushtaqahmaduop/HOSTIX-APP
- Issues: https://github.com/mushtaqahmaduop/HOSTIX-APP/issues
- Pull requests: https://github.com/mushtaqahmaduop/HOSTIX-APP/pulls
- Actions: https://github.com/mushtaqahmaduop/HOSTIX-APP/actions

Important top-level files (quick links)
- README.md: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/README.md
- AGENT_GUIDE_FOR_AGENT.md: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/AGENT_GUIDE_FOR_AGENT.md
- UI_UX_SUMMARY.md: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/UI_UX_SUMMARY.md
- MIGRATION_HANDOFF.md: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/MIGRATION_HANDOFF.md
- package.json: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/package.json

Main app entry points and renderer (UI)
- main.js (Electron main process): https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/main.js
- preload.js (contextBridge / IPC whitelist): https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/preload.js
- renderer/index.html (UI shell): https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/index.html
- renderer/app.js (front-end JS / view logic): https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/app.js
- renderer/style.css (single large stylesheet / tokens & components): https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/style.css
- renderer/license.html: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/license.html
- renderer/license-settings.html: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/license-settings.html
- renderer/license.js: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/license.js
- renderer/src/ (additional UI source files): https://github.com/mushtaqahmaduop/HOSTIX-APP/tree/master/renderer/src

Other useful files
- test-license.js: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/test-license.js
- LICENSE: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/LICENSE

High-level summary
HOSTIX-APP is an Electron desktop application for DAMAM Boys Hostel Management (local-first). The UI layer is built without a heavy framework (plain HTML/CSS/JS) inside the renderer/ directory; theming and components are implemented in a single stylesheet (renderer/style.css) using CSS custom properties (tokens).

UI / UX (what the agent should know)
- Theme approach: The project uses CSS variables defined on :root and overrides for a .light-theme class. Tokens cover colors (--bg, --card, --gold, --teal, etc.), layout (--sidebar-w, --header-h), spacing/radii, shadows, and fonts.
- Primary layout: A fixed-width sidebar (260px) on the left, a sticky header at the top (header height 64px), and a content area that hosts cards, grids, tables and forms.
- Visual language: Modern, rounded cards, subtle shadows, and color-coded badges/status chips. Uses backdrop-filter on header for blur effect (desktop platform appropriate).
- Interaction patterns:
  - Sidebar navigation with grouped nav-items and a logo area.
  - Header includes quick actions and status indicators.
  - Cards and stat-cards present KPIs in a responsive grid.
  - Forms use .form-control, .field and focus states with box-shadows for accessibility.
- Agent tasks related to UI/UX:
  - Review renderer/index.html and renderer/app.js to map all view routes and modal flows.
  - Run accessibility (a11y) audits (axe or Lighthouse) on major pages (index.html, license.html) and produce prioritized fixes.
  - Propose and optionally apply a refactor to split style.css into modular files (tokens, layout, components, utilities) and update build/serve steps accordingly.

CSS & Theming (detailed)
- Single-file design system: style.css contains tokens, component rules, and page-level styles. The agent should open renderer/style.css and look for these sections:
  - :root token declarations
  - .light-theme overrides
  - layout (sidebar, header, grids)
  - components (buttons, cards, inputs, tables, modals)
- Key tokens & values to inspect and document:
  - Color tokens: --bg, --bg2, --card, --gold, --royal, --teal, --red, --green
  - Layout tokens: --sidebar-w (260px), --header-h (64px)
  - Radius & shadow tokens: --radius, --shadow, --shadow-gold
  - Typography: --font, --font-display, --font-mono
- Recommended CSS improvements for the repo (agent can implement):
  - Split style.css into smaller partials and add a small build step (npm script) if desired.
  - Introduce utility classes and a spacing scale (4/8/12/16/24) to avoid magic numbers.
  - Ensure prefers-color-scheme support and toggle persistence (localStorage) for user theme preference.
  - Respect prefers-reduced-motion for motion/animation toggles.

Dashboard layout & components (what to inspect)
- Sidebar (#sidebar)
  - Fixed width, contains logo, stats, navigation. Inspect DOM structure in index.html and CSS rules in style.css.
- Header (#header)
  - Sticky header with translucent background and blur. Check for performance implications on lower-end hardware.
- Stat Grid / KPI Cards
  - Responsive grid, used to show counts and quick metrics. Validate breakpoints are present for widths < 1400px.
- Main content / Cards
  - Modular cards with header, body and footer sections. Used for listings, quick actions and details.
- Tables
  - Default table styling includes hover states and pagination UI (if present). Check renderer/app.js for table logic.
- Modals
  - Overlay and dialog box with animations and focus management. Ensure ARIA attributes and focus trap exist (or add them).

Features (high level)
- License management: license.html, license-settings.html, license.js, test-license.js. These pages manage license state and settings.
- Local database: better-sqlite3 is used for local storage operations in main process (check package.json for dependency and main.js for DB usage).
- Desktop-first features: menubar, auto-update (electron-updater), native installers (electron-builder) are configured via package.json.

How to run & build (practical access info)
1. Clone repository
   git clone https://github.com/mushtaqahmaduop/HOSTIX-APP.git
2. Install dependencies
   cd HOSTIX-APP
   npm ci
3. Run in development
   npm start
4. Build installers (per package.json)
   npm run build
   npm run build:installer
   npm run build:portable

Notes on native modules and CI
- better-sqlite3 and other native modules require rebuilding per platform. The project uses electron-rebuild in postinstall; ensure CI runners run appropriate rebuild steps or use prebuilt binaries.

Security & a11y checklist for the agent
- Security:
  - Verify BrowserWindow webPreferences in main.js: ensure contextIsolation: true and nodeIntegration: false.
  - Inspect preload.js to confirm only minimal safe APIs are exposed via contextBridge.
  - Audit any SQL usage in main.js for parameterized queries (no string concatenation with user inputs).
- Accessibility:
  - Run axe or Lighthouse to identify low-contrast text, missing ARIA attributes, keyboard focus issues, and small font sizes.
  - Ensure modals use role="dialog" aria-modal="true" and implement focus trapping.
  - Ensure all interactive elements have keyboard focus styles.

Agent responsibilities & suggested tasks (actionable)
- Immediate (small, high-value)
  1. Open and summarize main.js and preload.js security posture.
  2. Run an automated a11y scan for index.html and license.html and open issues for the top 10 failures.
  3. Create a small note (UI_TOKENS.md) documenting CSS tokens and how to use them for new components.

- Medium (requires edits & PRs)
  1. Split renderer/style.css into modular files and update the repo with a new npm script that concatenates them, or introduce a simple dev-time build (npm script using postcss or concat). Submit a PR.
  2. Add a theme toggle button, store preference in localStorage, and ensure the system preference respects prefers-color-scheme.
  3. Add ARIA attributes and focus trapping for modals; include unit tests or E2E Playwright tests to validate keyboard navigation.

- Long-term
  1. Consider migrating the renderer to a lightweight framework (Preact / Svelte) to improve maintainability if feature complexity grows.
  2. Add automated UI tests and GitHub Actions to lint, build, and smoke-run the app in CI.

Where to make changes (suggested files & locations)
- Security & main process checks: main.js (root)
- Preload & IPC: preload.js (root)
- UI behavior and routing: renderer/app.js
- Styles & tokens: renderer/style.css (or split into renderer/styles/*)
- License related feature pages: renderer/license.html, renderer/license-settings.html, renderer/license.js

References and file links (again, for quick access)
- Repo: https://github.com/mushtaqahmaduop/HOSTIX-APP
- main.js: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/main.js
- preload.js: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/preload.js
- renderer/index.html: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/index.html
- renderer/app.js: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/app.js
- renderer/style.css: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/renderer/style.css
- UI_UX_SUMMARY.md: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/UI_UX_SUMMARY.md
- AGENT_GUIDE_FOR_AGENT.md: https://github.com/mushtaqahmaduop/HOSTIX-APP/blob/master/AGENT_GUIDE_FOR_AGENT.md

Commit & file creation
I am creating this file in the repository as `AGENT_UI_UX_GUIDE.md`. The commit message is: "Add AGENT_UI_UX_GUIDE.md: detailed UI/UX, CSS, features, dashboard layout for agent".

If you want any changes to tone, additional sections (e.g., API contract, DB schema details, or test plans), or to name the file differently, tell me and I will update the file and open a follow-up PR.
