# HOSTIX-APP — SQLite Migration & Modularization Plan
**For:** Next agent / Claude Code session  
**Repo:** https://github.com/mushtaqahmaduop/HOSTIX-APP  
**Owner:** mushtaqahmaduop  
**Status:** localStorage → SQLite migration NOT started. Codebase analyzed, plan is complete.

---

## 0. Context — What This App Is

Electron desktop app (`damam-hostel v3.0.0`) for hostel management.  
- **Main process:** `main.js` (868 lines) — license, IPC, auto-updater  
- **Preload:** `preload.js` — contextBridge (contextIsolation: true, nodeIntegration: false)  
- **Renderer:** `renderer/app.js` (9,269 lines monolith) + `renderer/src/` (6 modular files)  
- **CSS:** `renderer/style.css` (2,897 lines) — DO NOT touch during migration  
- **Data:** Currently ALL in `localStorage` via `DB` global object (JSON blob)

### Current DB Schema (from `renderer/src/config.js`)
```js
DB = {
  settings:      { hostelName, roomTypes[], paymentMethods[], expenseCategories[], floors[], ... },
  rooms:         [],   // { id, num, floor, typeId, forceAdded?, ... }
  students:      [],   // { id, name, roomId, status, rent, photo(base64), ... }
  payments:      [],   // { id, studentId, amount, status, month, dueDate, paidDate, method, ... }
  expenses:      [],   // { id, category, amount, date, note, ... }
  cancellations: [],   // { id, studentId, vacateDate, confirmed, ... }
  maintenance:   [],   // { id, roomId, issue, status, ... }
  complaints:    [],   // { id, studentId, text, status, ... }
  checkinlog:    [],   // { id, studentId, date, ... }
  notices:       [],   // { id, text, date, ... }
  fines:         [],   // { id, studentId, amount, reason, paid, ... }
  activityLog:   [],   // { id, action, details, category, by, date, time }
  inspections:   [],   // { id, roomId, date, notes, ... }
  billSplits:    [],   // { id, month, total, perHead, ... }
  transfers:     []    // { id, amount, from, to, date, note, ... }
}
```

### IPC Channels Already in `main.js`
```
license:check, license:activate, license:deactivate, license:deactivateWithDialog,
license:reset, license:prepareUninstall, license:openSettings, license:machineId,
license:loadApp, receipt:savePDF, open-external, write-file, update:check, update:install
```

### Script Load Order in `renderer/index.html` (STRICT — do not reorder)
```
1. src/config.js    — DB schema, LS_KEY, _ACTIVE_HOSTEL
2. src/utils.js     — uid(), escHtml(), fmtDate(), fmtPKR(), debounce()
3. src/auth.js      — warden login, SHA-256 password hashing
4. src/storage.js   — loadDB(), saveDB(), logActivity(), backup/restore
5. src/license.js   — renderer-side license check
6. src/receipt.js   — receipt builder, PDF export
7. app.js (defer)   — ALL UI, pages, modals, charts (9,269 lines)
```

---

## 1. Migration Strategy — Safe Incremental Approach

> **Golden rule: DO NOT break existing functionality. Keep localStorage as fallback during transition.**

### Phase A — Add SQLite to Main Process (no renderer changes yet)
### Phase B — New IPC channels for DB operations  
### Phase C — Replace `loadDB()` / `saveDB()` in `src/storage.js`  
### Phase D — One-time data migration on first launch  
### Phase E — Modularize `app.js` into feature modules  

---

## 2. Phase A — SQLite Setup in `main.js`

### Install dependency
```bash
npm install better-sqlite3
```
> `better-sqlite3` is synchronous, which is perfect for Electron main process. Do NOT use `sqlite3` (async, more complex).

### Add to `package.json` build config
In the `"files"` array, add:
```json
"node_modules/better-sqlite3/**/*"
```
Also add to `"asarUnpack"`:
```json
"asarUnpack": ["node_modules/better-sqlite3/**/*"]
```
This is required because `better-sqlite3` is a native Node module (`.node` binary).

### Add to `main.js` — after existing requires
```js
// ── SQLite Database ───────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const DB_PATH  = path.join(app.getPath('userData'), 'hostix.db');
let   db       = null; // initialized in initSQLite()

function initSQLite() {
  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');   // WAL = safe concurrent reads
    db.pragma('foreign_keys = ON');
    createSchema();
    console.log('[HOSTIX] SQLite initialized at:', DB_PATH);
  } catch (e) {
    console.error('[HOSTIX] SQLite init failed:', e.message);
    db = null; // app will fall back to localStorage
  }
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL  -- full JSON row (avoids 15 ALTER TABLE migrations for now)
    );

    CREATE TABLE IF NOT EXISTS students (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cancellations (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkinlog (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notices (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fines (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bill_splits (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  
  // Mark schema version
  const insert = db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)');
  insert.run('schema_version', '1');
  insert.run('migrated_from_ls', 'false');
}
```

Call `initSQLite()` inside `app.whenReady()` before creating the window.

---

## 3. Phase B — New IPC Channels in `main.js`

Add these handlers AFTER `initSQLite()` call:

```js
// ── SQLite IPC handlers ───────────────────────────────────────────────────────

// Generic: load entire DB as JSON (replaces loadDB from localStorage)
ipcMain.handle('db:load', () => {
  if (!db) return null; // renderer falls back to localStorage
  try {
    const tables = [
      'rooms','students','payments','expenses','cancellations',
      'maintenance','complaints','checkinlog','notices','fines',
      'activity_log','inspections','bill_splits','transfers'
    ];
    const result = {};
    for (const t of tables) {
      const rows = db.prepare(`SELECT data FROM ${t}`).all();
      result[t === 'activity_log' ? 'activityLog' : t === 'bill_splits' ? 'billSplits' : t]
        = rows.map(r => JSON.parse(r.data));
    }
    // Load settings
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    result.settings = {};
    for (const row of settingsRows) {
      try { result.settings[row.key] = JSON.parse(row.value); }
      catch { result.settings[row.key] = row.value; }
    }
    return result;
  } catch (e) {
    console.error('[HOSTIX] db:load failed:', e.message);
    return null;
  }
});

// Generic: save entire DB from renderer
ipcMain.handle('db:save', (_e, dbJson) => {
  if (!db) return false;
  try {
    const data = typeof dbJson === 'string' ? JSON.parse(dbJson) : dbJson;
    
    const tableMap = {
      rooms: 'rooms', students: 'students', payments: 'payments',
      expenses: 'expenses', cancellations: 'cancellations',
      maintenance: 'maintenance', complaints: 'complaints',
      checkinlog: 'checkinlog', notices: 'notices', fines: 'fines',
      activityLog: 'activity_log', inspections: 'inspections',
      billSplits: 'bill_splits', transfers: 'transfers'
    };

    const saveAll = db.transaction(() => {
      for (const [key, table] of Object.entries(tableMap)) {
        if (!Array.isArray(data[key])) continue;
        db.prepare(`DELETE FROM ${table}`).run();
        const ins = db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`);
        for (const row of data[key]) {
          ins.run(row.id || ('row_' + Date.now() + Math.random()), JSON.stringify(row));
        }
      }
      // Save settings
      if (data.settings && typeof data.settings === 'object') {
        db.prepare('DELETE FROM settings').run();
        const ins = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(data.settings)) {
          ins.run(k, JSON.stringify(v));
        }
      }
    });
    
    saveAll();
    return true;
  } catch (e) {
    console.error('[HOSTIX] db:save failed:', e.message);
    return false;
  }
});

// One-time migration from localStorage JSON blob
ipcMain.handle('db:migrate-from-ls', (_e, lsJson) => {
  if (!db) return { ok: false, reason: 'SQLite not initialized' };
  try {
    const migrated = db.prepare("SELECT value FROM meta WHERE key = 'migrated_from_ls'").get();
    if (migrated && migrated.value === 'true') {
      return { ok: true, already: true };
    }
    // lsJson is the raw DB JSON string from localStorage
    const data = JSON.parse(lsJson);
    // Reuse db:save logic via direct call
    ipcMain.emit('db:save-internal', data); // handled below or inline
    db.prepare("UPDATE meta SET value = 'true' WHERE key = 'migrated_from_ls'").run();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// Check if migration has been done
ipcMain.handle('db:migration-status', () => {
  if (!db) return 'no-sqlite';
  const row = db.prepare("SELECT value FROM meta WHERE key = 'migrated_from_ls'").get();
  return row ? row.value : 'false';
});
```

---

## 4. Phase C — Update `preload.js`

Add to the `electronAPI` contextBridge object:

```js
// SQLite DB operations
dbLoad:            ()        => ipcRenderer.invoke('db:load'),
dbSave:            (dbJson)  => ipcRenderer.invoke('db:save', dbJson),
dbMigrateFromLS:   (lsJson)  => ipcRenderer.invoke('db:migrate-from-ls', lsJson),
dbMigrationStatus: ()        => ipcRenderer.invoke('db:migration-status'),
```

---

## 5. Phase D — Update `renderer/src/storage.js`

Replace `loadDB()` and `saveDB()` with SQLite-first versions. **Keep localStorage as fallback** so the app works even if SQLite fails.

### New `loadDB()`:
```js
async function loadDB() {
  // Try SQLite first (via Electron IPC)
  if (window.electronAPI && window.electronAPI.dbLoad) {
    try {
      // Check if we need to migrate first
      const status = await window.electronAPI.dbMigrationStatus();
      if (status === 'false') {
        // First time — migrate existing localStorage data to SQLite
        const lsData = localStorage.getItem(LS_KEY);
        if (lsData) {
          const result = await window.electronAPI.dbMigrateFromLS(lsData);
          if (result.ok) {
            console.info('[HOSTIX] Migrated localStorage → SQLite successfully');
          } else {
            console.warn('[HOSTIX] Migration failed:', result.reason, '— using localStorage');
          }
        }
      }

      const sqliteData = await window.electronAPI.dbLoad();
      if (sqliteData && Array.isArray(sqliteData.students)) {
        DB = sqliteData;
        if (typeof _initDBFields === 'function') DB = _initDBFields(DB);
        _checkBackupReminder();
        return;
      }
    } catch (e) {
      console.warn('[HOSTIX] SQLite load failed, falling back to localStorage:', e.message);
    }
  }

  // Fallback: localStorage (original logic)
  try {
    const pending = localStorage.getItem(_LS_PENDING_KEY);
    if (pending) {
      try {
        const parsedPending = JSON.parse(pending);
        if (parsedPending && Array.isArray(parsedPending.students) && Array.isArray(parsedPending.rooms)) {
          localStorage.setItem(LS_KEY, pending);
          localStorage.removeItem(_LS_PENDING_KEY);
        } else {
          localStorage.removeItem(_LS_PENDING_KEY);
        }
      } catch { localStorage.removeItem(_LS_PENDING_KEY); }
    }
    const s = localStorage.getItem(LS_KEY);
    if (s) DB = JSON.parse(s);
  } catch (e) {
    console.error('[HOSTIX] localStorage load failed:', e);
    setTimeout(() => { if (typeof toast === 'function') toast('⚠️ Saved data corrupted. Restore from backup.', 'error'); }, 1200);
  }
  if (typeof _initDBFields === 'function') DB = _initDBFields(DB);
  _checkBackupReminder();
}
```

### New `saveDB()`:
```js
async function saveDB() {
  if (typeof enforceDataRetention === 'function') enforceDataRetention();

  // Try SQLite first
  if (window.electronAPI && window.electronAPI.dbSave) {
    try {
      const ok = await window.electronAPI.dbSave(JSON.stringify(DB));
      if (ok) {
        if (typeof updateSidebar         === 'function') updateSidebar();
        if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
        return true;
      }
    } catch (e) {
      console.warn('[HOSTIX] SQLite save failed, falling back to localStorage:', e.message);
    }
  }

  // Fallback: localStorage
  try {
    const serialized = JSON.stringify(DB);
    localStorage.setItem(_LS_PENDING_KEY, serialized);
    localStorage.setItem(LS_KEY, serialized);
    localStorage.removeItem(_LS_PENDING_KEY);
    if (typeof updateSidebar         === 'function') updateSidebar();
    if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
    return true;
  } catch (e) {
    console.error('[HOSTIX] localStorage save failed:', e);
    setTimeout(() => { if (typeof toast === 'function') toast('⚠️ Storage full — backup immediately!', 'error'); }, 50);
    return false;
  }
}
```

> ⚠️ **IMPORTANT:** `loadDB()` is now async. In `app.js`, every call to `loadDB()` must be awaited or converted. Search for `loadDB()` in `app.js` and `storage.js` and add `await`. The main call is at app startup — find it and make the initialization async.

---

## 6. Phase E — Modularization of `app.js`

Split the 9,269-line `app.js` into feature modules. Load order stays strict.

### Target file structure after modularization:
```
renderer/
└── src/
    ├── config.js       (existing)
    ├── utils.js        (existing)
    ├── auth.js         (existing)
    ├── storage.js      (existing — updated)
    ├── license.js      (existing)
    ├── receipt.js      (existing)
    ├── ui/
    │   ├── theme.js         — toggleTheme(), updateThemeUI(), applyThemeColor()
    │   ├── sidebar.js       — updateSidebar(), navigate(), renderSidebarCalendar()
    │   ├── modals.js        — showModal(), closeModal(), showConfirm(), toast()
    │   └── charts.js        — drawTrendChart(), drawCharts()
    ├── pages/
    │   ├── dashboard.js     — renderDashboard(), calcRevenue(), dashGlobalSearch()
    │   ├── rooms.js         — renderRooms(), showAddRoomModal(), showRoomDetail()
    │   ├── students.js      — renderStudents(), showAddStudentModal(), showViewStudentModal()
    │   ├── payments.js      — renderPayments(), showAddPaymentModal(), generateMonthlyRents()
    │   ├── expenses.js      — renderExpenses(), showAddExpenseModal()
    │   ├── reports.js       — renderReports(), renderReportDetail(), printReport()
    │   ├── cancellations.js — renderCancellations(), saveCancellation()
    │   ├── settings.js      — renderSettings(), saveSettings(), bindSettingsEvents()
    │   ├── issues.js        — renderIssues(), showAddIssueModal()
    │   └── activity.js      — renderActivityLog()
    └── app.js               (slim entry — just renderPage() dispatcher + init)
```

### `index.html` updated script load order:
```html
<script src="src/config.js"></script>
<script src="src/utils.js"></script>
<script src="src/auth.js"></script>
<script src="src/storage.js"></script>
<script src="src/license.js"></script>
<script src="src/receipt.js"></script>
<!-- UI helpers -->
<script src="src/ui/theme.js"></script>
<script src="src/ui/sidebar.js"></script>
<script src="src/ui/modals.js"></script>
<script src="src/ui/charts.js"></script>
<!-- Feature pages -->
<script src="src/pages/dashboard.js"></script>
<script src="src/pages/rooms.js"></script>
<script src="src/pages/students.js"></script>
<script src="src/pages/payments.js"></script>
<script src="src/pages/expenses.js"></script>
<script src="src/pages/reports.js"></script>
<script src="src/pages/cancellations.js"></script>
<script src="src/pages/settings.js"></script>
<script src="src/pages/issues.js"></script>
<script src="src/pages/activity.js"></script>
<!-- Main entry -->
<script src="app.js" defer></script>
```

### Line ranges in `app.js` to guide extraction:

| Module | Lines | Key functions |
|--------|-------|---------------|
| theme.js | 12–33 | `toggleTheme`, `updateThemeUI` |
| dashboard.js | 360–1140 | `renderDashboard`, `calcRevenue`, `showRoomSeatDetailModal` |
| rooms.js | 1852–2026 | `renderRooms`, `showAddRoomModal`, `submitAddRoom` |
| students.js | 2027–3012 | `renderStudents`, `showAddStudentModal`, `showViewStudentModal` |
| payments.js | 3159–3887 | `renderPayments`, `generateMonthlyRents`, `showAddPaymentModal` |
| expenses.js | 4033–4135 | `renderExpenses`, `showAddExpenseModal` |
| reports.js | 4272–4886 | `renderReports`, `renderReportDetail`, `printReport` |
| cancellations.js | 1470–1851 | `renderCancellations`, `saveCancellation` |
| settings.js | 5271–6158 | `renderSettings`, `saveSettings`, `bindSettingsEvents` |
| issues.js | 8022–8223 | `renderIssues`, `showAddIssueModal` |
| activity.js | 5006–5072 | `renderActivityLog` |
| sidebar.js | 198–359 | `navigate`, `updateSidebar`, `goBack` |
| modals.js | 6498–6534 | `showModal`, `closeModal`, `showConfirm`, `toast` (L7183) |
| charts.js | 7396–7440 | `drawTrendChart` |

---

## 7. Execution Order

```
1. npm install better-sqlite3
2. Update package.json (files + asarUnpack)
3. Add initSQLite() + createSchema() + IPC handlers to main.js
4. Add db* methods to preload.js contextBridge
5. Update renderer/src/storage.js (loadDB async, saveDB async)
6. Test: npm start → verify app loads, data saves, no console errors
7. Verify migration: open DevTools → Application → localStorage should still have data
8. Modularize app.js — one file at a time, test after each extraction
9. Final test: full smoke test of all pages
```

---

## 8. Gotchas & Warnings

1. **`saveDB()` is called synchronously everywhere in `app.js`.** After making it async, all callers need `await saveDB()` or the UI may update before save completes. Do a global search for `saveDB()` and add `await`.

2. **`loadDB()` is called on startup.** The app init chain needs to be wrapped in an async IIFE. Find where `loadDB()` is called in `app.js` and wrap surrounding init code.

3. **Photos are base64 strings stored in student records.** These can be large. For now keep them in SQLite JSON blob — future optimization is to write them to disk and store path. Do NOT do this in this migration.

4. **`better-sqlite3` is a native module.** Requires `asarUnpack` in electron-builder config or it won't work in production builds. Dev (`npm start`) works fine without it.

5. **Backup/restore still works via JSON export.** The export in `storage.js` reads `localStorage.getItem(LS_KEY)`. After migration, update it to call `db:load` IPC instead and serialize to JSON.

6. **`archive_recovery.js` has been deleted** — do not reference it.

7. **Root `style.css` has been deleted** — only `renderer/style.css` exists.

8. **DO NOT touch `renderer/style.css`** during this migration — theming was just updated.

9. **`_initDBFields()`** in `app.js` (L6777) runs after `loadDB()` to fill missing fields. It must still run after SQLite load — the new `loadDB()` already calls it.

10. **Multi-hostel support:** `_ACTIVE_HOSTEL` from `sessionStorage` and `LS_KEY = 'dbh2_v3_' + _ACTIVE_HOSTEL`. SQLite DB path is per-device, but the `meta` table can store per-hostel info if needed later.

---

## 9. Testing Checklist After Migration

- [ ] App launches without console errors
- [ ] Login works (warden1 / warden2)
- [ ] Dashboard loads with correct data
- [ ] Add a student → data persists after app restart
- [ ] Add a payment → data persists
- [ ] Export backup → valid JSON file
- [ ] Import backup → data restored correctly
- [ ] Light/dark theme toggle works
- [ ] All sidebar pages navigate without errors

---

## 10. Repo State After Previous Agent Session

**Already done:**
- Deleted: `app_old.js`, `archive_recovery.js`, `.vscode/`, `public/native/` (entire dir), root `style.css`
- Updated: `.gitignore` (blocks `.vscode/`, `*.enc`, `*.dat`)
- Updated: `README.md` (renamed to HOSTIX, updated structure)
- Updated: `renderer/style.css` — new charcoal dark mode + light mode from palette `#f0f5f9/#c9d6df/#52616b/#1e2022`

**NOT done (your job):**
- SQLite migration (Phases A–D above)
- Modularization of `app.js` (Phase E above)

**GitHub token:** Generate a new fine-grained PAT with `Contents: Read and Write` on `HOSTIX-APP` repo. Previous tokens were shared in chat and should be revoked.
