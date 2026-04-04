# DAMAM Boys Hostel — Management System (v3 Merged)

Offline desktop app built with Electron.
All data stored locally in browser `localStorage` — no internet required.

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
damam-hostel/
├── main.js             ← Electron main process — license engine, IPC, menus
├── preload.js          ← Secure IPC bridge (contextIsolation: true)
├── package.json        ← Scripts & electron-builder config
├── test-license.js     ← License system test suite (node test-license.js)
├── .gitignore
│
├── renderer/
│   ├── index.html      ← App shell, login screen, sidebar, script load order
│   ├── style.css       ← All CSS
│   ├── license.html    ← Activation screen (shown when no valid license)
│   ├── app.js          ← Main application logic
│   └── src/            ← Modular support files (load order is strict)
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

> **Script load order is mandatory.** index.html loads scripts in the order
> shown above. Never reorder them — each file depends on the ones before it.

---

## Keyboard Shortcuts

| Shortcut       | Action             |
| -------------- | ------------------ |
| `Ctrl+S`       | Export backup      |
| `Ctrl+O`       | Import backup      |
| `F11`          | Toggle full screen |
| `F12`          | Dev tools (dev only) |
| `Escape`       | Close modal        |
| `Enter`        | Save form          |

---

## License System (v3)

| Feature | Detail |
|---|---|
| Storage | AES-256-CBC encrypted `license.enc` in Electron userData |
| Key derivation | `scrypt(machineId + secret, salt, 32)` |
| Machine binding | SHA-256(hostname \| platform \| arch \| cpu \| WinMachineGuid) → 64 chars |
| Key format | `HOSTEL-XXXX-XXXX-XXXX` (HMAC-SHA256 checksum) |
| Anti-time-cheat | `last_run.dat` blocks clock rollback |
| Production hardening | DevTools blocked, `--inspect` flag rejected |

Keys are generated with `keygen.js` (not included in builds — excluded by `package.json`).

---

## Data & Backup

All data is stored in **localStorage** on this device.

- **Backup & Restore** in the sidebar → export a `.json` backup file
- **File → Export Backup** (Ctrl+S) → quick export
- A reminder toast appears automatically if no backup has been made in 7 days
- Store backups on a USB drive or Google Drive

---

## What Changed in v3 (Merged)

### Security upgrades
- License file now AES-256-CBC encrypted (was plain JSON + HMAC)
- Machine fingerprint uses full 64-char SHA-256 + Windows MachineGuid
- Key derivation uses `scrypt` (memory-hard, not plain HMAC)
- `--inspect` / `--inspect-brk` blocked in production (anti-debug)
- `keygen.html` and `keygen.js` excluded from all builds

### Bug fixes
- `_checkDefaultPasswords` now correctly checks each warden against their own default
- Cross-tab sync guard uses `Array.isArray()` — empty arrays no longer overwrite live data
- `mainWindow` null-guard added to `write-file` IPC handler (crash fix on rapid close)
- `allowRunningInsecureContent` is now unconditionally `false`
- Backup export now includes the archive collection

### New features
- 7-day backup reminder toast
- Receipt PDF uses native `printToPDF` (no popup window needed)
- `npm run test:license` runs the full 25-test license suite
