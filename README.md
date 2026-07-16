# HOSTIX — Offline Hostel Management System

Desktop app built with Electron. Runs fully offline — application data is stored
locally in a **SQLite** database on the device; no internet is required.

---

## Quick Start

```bash
npm install
npm start          # launches in dev mode (DevTools enabled)
```

> `npm install` runs `electron-rebuild` (postinstall) to build the native
> `better-sqlite3` module against the project's Electron ABI.

## Build .exe for Windows

```bash
npm run build:installer   # NSIS installer (.exe)
npm run build:portable    # single portable .exe
npm run build             # both targets
```

Output goes to: `dist/`

## Tests

```bash
npm run test:license   # license system unit tests (node)
npm run test:e2e       # Playwright smoke test (see tests/smoke.spec.js)
```

The e2e smoke test needs an isolated profile — see `QA_CHECKLIST.md` for the
manual release checklist it automates.

---

## Architecture

- **Runtime:** Electron (main process `main.js`, secure IPC via `preload.js`
  with `contextIsolation: true`, `nodeIntegration: false`).
- **Data layer:** SQLite via `better-sqlite3` — `hostix.db` in the Electron
  userData folder. The whole DB is loaded into memory on boot and persisted
  through the async, diff-based `saveDB()` in `storage.js`. **All writes go
  through `await saveDB()`.**
- **Warden logins / theme / sidebar prefs:** `localStorage`.
- **UI:** vanilla JS/HTML/CSS — no build step, no framework, no bundler. Modules
  share one global script scope and load in a strict order (below).
- **Offline assets:** fonts, Chart.js (+ datalabels), and SheetJS are bundled
  locally under `renderer/vendor/` — nothing is fetched from a CDN at runtime.
- **CSP:** a single header-based policy in `main.js` (no remote hosts).

### Folder structure

```
HOSTIX-APP/
├── main.js             ← Electron main — SQLite IPC, license engine, auto-updater, CSP
├── preload.js          ← Secure IPC bridge (contextIsolation: true)
├── package.json        ← Scripts & electron-builder config
├── test-license.js     ← License system test suite
├── tests/smoke.spec.js ← Playwright e2e smoke test
│
├── renderer/
│   ├── index.html      ← App shell, login screen, sidebar, script load order
│   ├── tokens.css      ← Design tokens (violet --accent set)
│   ├── components.css  ← Shared component styles
│   ├── style.css       ← Main stylesheet
│   ├── license.html    ← Activation screen (shown when no valid license)
│   ├── license-settings.html
│   ├── app.js          ← Orchestrator: boot, keyboard, misc
│   ├── vendor/         ← Offline-bundled libs (js/) and fonts (fonts/, fonts.css)
│   └── src/            ← Modular feature files (strict load order)
│       ├── config.js       LS keys, active hostel, default DB schema
│       ├── utils.js        Pure helpers: escHtml, uid, fmtPKR, print/PDF styles …
│       ├── icons.js        SVG icon set
│       ├── auth-nev.js     Warden login, role management, session
│       ├── storage.js      loadDB, saveDB (diff-based), logActivity, backups
│       ├── license.js      Renderer-side license check + activation UI
│       ├── receipt.js      Receipt builder, PDF export, WhatsApp reminder
│       └── modules/        Feature modules (theme, nav, dashboard, rooms,
│                           students, payments, expenses, reports, settings,
│                           modals, cancellations, issues, sidebar_calendar,
│                           command-palette)
│
└── assets/
    ├── icon.png        ← App icon 512×512 px
    └── icon.ico        ← Windows taskbar icon
```

> **Script load order is mandatory.** `index.html` loads the vendor libs first,
> then `src/` files in dependency order, then `src/modules/*`, then `app.js`.
> Never reorder them — each file depends on the ones before it.

---

## Keyboard Shortcuts

| Shortcut   | Action               |
| ---------- | -------------------- |
| `Ctrl+S`   | Export backup        |
| `Ctrl+O`   | Import backup        |
| `F11`      | Toggle full screen   |
| `F12`      | Dev tools (dev only) |
| `Escape`   | Close modal          |
| `Enter`    | Save form            |

---

## License System

| Feature         | Detail                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Storage         | AES-256-CBC encrypted `license.enc` in Electron userData              |
| Key derivation  | `scrypt(machineId + secret, salt, 32)`                                 |
| Machine binding | SHA-256(platform \| arch \| cpu \| WinMachineGuid \| DriveSerial)      |
| Key format      | `HOSTEL-XXXX-XXXX-XXXX` (HMAC-SHA256 checksum)                        |
| Anti-time-cheat | `last_run.dat` blocks clock rollback                                   |
| Hardening       | DevTools blocked, `--inspect` flag rejected in production              |

Keys are generated with `keygen.js` (excluded from builds via `package.json`).

---

## Data & Backup

Application data (students, rooms, payments, expenses, settings, …) lives in the
SQLite `hostix.db` in the Electron userData folder. Warden logins and UI
preferences are in `localStorage`.

- **Backup & Restore** in the sidebar → export a `.json` backup file
- **Ctrl+S** → quick export
- Auto-backup reminder toast fires if no backup in 7 days
- Midnight auto-backup scheduler runs in the background

Backups are format-agnostic on import (validated by shape: students/rooms/
settings), so older-named backup files still restore.
