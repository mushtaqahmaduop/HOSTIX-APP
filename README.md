# HOSTIX — Offline Hostel Management System

Desktop app built with Electron. All data stored locally in `localStorage` — no internet required.

---

## Quick Start

```bash
npm install
npm start          # launches in dev mode (DevTools enabled)
```

## Build .exe for Windows

```bash
npm run build:installer   # NSIS installer (.exe)
npm run build:portable    # single portable .exe
npm run build             # both targets
```

Output goes to: `dist/`

## Run License Tests

```bash
npm run test:license
```

---

## Folder Structure

```
HOSTIX-APP/
├── main.js             ← Electron main process — license engine, IPC, auto-updater
├── preload.js          ← Secure IPC bridge (contextIsolation: true)
├── package.json        ← Scripts & electron-builder config
├── test-license.js     ← License system test suite
├── .gitignore
│
├── renderer/
│   ├── index.html      ← App shell, login screen, sidebar, script load order
│   ├── style.css       ← All CSS
│   ├── license.html    ← Activation screen (shown when no valid license)
│   ├── app.js          ← Main application logic
│   └── src/            ← Modular support files (strict load order)
│       ├── config.js       1. LS_KEY, active hostel, default DB schema
│       ├── utils.js        2. Pure helpers: escHtml, uid, fmtDate, fmtPKR …
│       ├── auth.js         3. Warden login, role management, session
│       ├── storage.js      4. loadDB, saveDB, logActivity, backup handlers
│       ├── license.js      5. Renderer-side license check + activation UI
│       └── receipt.js      6. Receipt builder, PDF export, WhatsApp reminder
│
└── assets/
    ├── icon.png        ← App icon 512×512 px
    └── icon.ico        ← Windows taskbar icon
```

> **Script load order is mandatory.** `index.html` loads scripts in the order
> shown above. Never reorder them — each file depends on the ones before it.

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

## License System (v3)

| Feature         | Detail                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Storage         | AES-256-CBC encrypted `license.enc` in Electron userData              |
| Key derivation  | `scrypt(machineId + secret, salt, 32)`                                 |
| Machine binding | SHA-256(platform \| arch \| cpu \| WinMachineGuid \| DriveSerial) |
| Key format      | `HOSTEL-XXXX-XXXX-XXXX` (HMAC-SHA256 checksum)                        |
| Anti-time-cheat | `last_run.dat` blocks clock rollback                                   |
| Hardening       | DevTools blocked, `--inspect` flag rejected in production              |

Keys are generated with `keygen.js` (excluded from builds via `package.json`).

---

## Data & Backup

All data is stored in **localStorage** on this device.

- **Backup & Restore** in the sidebar → export a `.json` backup file
- **Ctrl+S** → quick export
- Auto-backup reminder toast fires if no backup in 7 days
- Midnight auto-backup scheduler runs in background

---

## What Changed in v3

### Security
- License file AES-256-CBC encrypted (was plain JSON + HMAC)
- Machine fingerprint: full SHA-256 + WinMachineGuid + DriveSerial
- Key derivation uses `scrypt` (memory-hard)
- `--inspect` / `--inspect-brk` blocked in production
- `keygen.js` / `keygen.html` excluded from all builds

### Bug Fixes
- Cross-tab sync guard uses `Array.isArray()` — empty arrays no longer overwrite live data
- `mainWindow` null-guard in `write-file` IPC handler (crash fix)
- `allowRunningInsecureContent` unconditionally `false`
- Backup export includes archive collection

### New Features
- 7-day backup reminder toast
- Midnight auto-backup scheduler
- Receipt PDF via native `printToPDF`
- 25-test license suite (`npm run test:license`)
