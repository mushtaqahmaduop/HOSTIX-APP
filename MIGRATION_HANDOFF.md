# HOSTIX-APP — SQLite Migration & Modularization Handoff

**Repo:** `https://github.com/mushtaqahmaduop/HOSTIX-APP`  
**Stack:** Electron 22 + vanilla JS (no bundler, no TypeScript)  
**Author:** Mushtaq Ahmad, Peshawar PK  
**Status as of handoff:** localStorage → SQLite migration NOT started. Codebase cleaned up and rethemed. Ready to execute.

---

## 1. Current Architecture (what exists)

```
HOSTIX-APP/
├── main.js                    ← Electron main process (868 lines)
├── preload.js                 ← IPC bridge (contextIsolation: true)
├── renderer/
│   ├── index.html             ← App shell; loads scripts in strict order
│   ├── app.js                 ← 9,269-line monolith (ALL UI logic)
│   ├── style.css              ← Themed CSS (2,897 lines, dark+light)
│   ├── license.html / license-settings.html / license.js
│   └── src/
│       ├── config.js          ← (54 lines)  DB schema, LS_KEY, global DB var
│       ├── utils.js           ← (298 lines) formatters, uid, debounce, autocomplete
│       ├── auth.js            ← (320 lines) warden login, SHA-256 hashing, session
│       ├── storage.js         ← (245 lines) loadDB, saveDB, backup, cross-tab sync
│       ├── license.js         ← license renderer stubs
│       └── receipt.js         ← (411 lines) PDF receipt builder
```

### Script load order in index.html (MUST NOT change):
```html
<script src="src/config.js"></script>    <!-- 1. defines global DB, LS_KEY -->
<script src="src/utils.js"></script>     <!-- 2. pure helpers -->
<script src="src/auth.js"></script>      <!-- 3. WARDENS, CUR_USER, login -->
<script src="src/storage.js"></script>   <!-- 4. loadDB, saveDB -->
<script src="src/license.js"></script>   <!-- 5. license stubs -->
<script src="src/receipt.js"></script>   <!-- 6. PDF receipt -->
<script src="app.js" defer></script>     <!-- 7. ALL UI — depends on everything above -->
```

### Data model (from `config.js`):
```js
DB = {
  settings: { hostelName, roomTypes[], paymentMethods[], expenseCategories[], floors[], ... },
  rooms: [],         students: [],      payments: [],
  expenses: [],      cancellations: [], maintenance: [],
  complaints: [],    checkinlog: [],    notices: [],
  fines: [],         activityLog: [],   inspections: [],
  billSplits: [],    transfers: []
}
```

### localStorage keys currently in use:
| Key | Contents |
|-----|----------|
| `dbh2_v3_hostel_1` | Main DB (all above arrays + settings) |
| `dbh2_v3_hostel_1_pending` | Atomic write temp key (FIX-S2) |
| `warden_config_hostel_1` | Warden passwords (SHA-256 hashed) |
| `hostel_logo_hostel_1` | Base64 logo image |
| `dbh2_archive` | Archived old payments (data retention) |
| `theme` | `'light'` or `'dark'` |

---

## 2. Migration Plan: localStorage → better-sqlite3

### Why better-sqlite3 (not sql.js):
- **Synchronous API** — drop-in replacement for `localStorage` pattern (no async refactor of 92 `saveDB()` calls)
- **Native Node module** — runs in Electron main process via IPC, safe with `contextIsolation: true`
- **File-based** — survives app restarts, no 5MB limit, no corruption on crash

### Architecture after migration:
```
Renderer (index.html) 
  → calls window.electronAPI.dbQuery(sql, params)  [preload IPC bridge]
    → ipcMain handles 'db:query' 
      → better-sqlite3 executes synchronously
        → returns result to renderer
```

All DB reads/writes go through IPC. The renderer never touches SQLite directly (contextIsolation prevents it).

---

## 3. Phase 1 — Install & Setup (main.js)

### Step 1: Install better-sqlite3
```bash
npm install better-sqlite3
```

> ⚠️ better-sqlite3 is a native module. It must be rebuilt for your Electron version.
> Add to package.json:
> ```json
> "scripts": {
>   "postinstall": "electron-rebuild -f -w better-sqlite3"
> },
> "devDependencies": {
>   "electron-rebuild": "^3.2.9"
> }
> ```
> Then run: `npm install && npm run postinstall`

### Step 2: Create DB in main.js

Add near top of `main.js` after existing requires:

```js
const Database = require('better-sqlite3');

let db = null; // SQLite db instance

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'hostix.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');  // WAL mode = safe concurrent reads
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id      TEXT PRIMARY KEY,
      data    TEXT NOT NULL,
      status  TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
      roomId  TEXT GENERATED ALWAYS AS (json_extract(data, '$.roomId')) VIRTUAL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id         TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      studentId  TEXT GENERATED ALWAYS AS (json_extract(data, '$.studentId')) VIRTUAL,
      status     TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cancellations (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkinlog (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notices (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fines (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activitylog (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billsplits (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archive (
      id    TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    );
  `);

  console.log('[HOSTIX] SQLite DB initialized at:', dbPath);
  return db;
}
```

**Design note:** Using JSON blobs per record (`data TEXT`) keeps the migration simple — the renderer sends the exact same JS objects it already builds, just serialized. No schema changes needed in app.js. Generated columns on `status`, `studentId`, `roomId` enable fast IPC queries without full deserialization.

---

## 4. Phase 2 — IPC Bridge (main.js + preload.js)

### In main.js — add these IPC handlers:

```js
// ── DB IPC handlers ──────────────────────────────────────────────────────────

// Generic query handler (SELECT)
ipcMain.handle('db:all', (_e, table, where) => {
  try {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
    if (where) {
      const [col, val] = where;
      return db.prepare(`SELECT data FROM ${table} WHERE ${col} = ?`).all(val)
        .map(r => JSON.parse(r.data));
    }
    return db.prepare(`SELECT data FROM ${table}`).all()
      .map(r => JSON.parse(r.data));
  } catch (e) {
    console.error('[DB] all failed:', e.message);
    return [];
  }
});

// Upsert a single record
ipcMain.handle('db:upsert', (_e, table, id, record) => {
  try {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
    db.prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`)
      .run(id, JSON.stringify(record));
    return { ok: true };
  } catch (e) {
    console.error('[DB] upsert failed:', e.message);
    return { ok: false, error: e.message };
  }
});

// Delete a single record
ipcMain.handle('db:delete', (_e, table, id) => {
  try {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Bulk replace a table (used by saveDB for full-sync fallback)
ipcMain.handle('db:bulkReplace', (_e, table, records) => {
  try {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
    const insert = db.prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`);
    const transaction = db.transaction((rows) => {
      db.prepare(`DELETE FROM ${table}`).run();
      for (const r of rows) insert.run(r.id, JSON.stringify(r));
    });
    transaction(records);
    return { ok: true };
  } catch (e) {
    console.error('[DB] bulkReplace failed:', e.message);
    return { ok: false, error: e.message };
  }
});

// Settings get/set
ipcMain.handle('db:getSetting', (_e, key) => {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  } catch (e) { return null; }
});

ipcMain.handle('db:setSetting', (_e, key, value) => {
  try {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Full DB export (for backup)
ipcMain.handle('db:exportFull', () => {
  try {
    const tables = ['rooms','students','payments','expenses','cancellations',
      'maintenance','complaints','checkinlog','notices','fines',
      'activitylog','inspections','billsplits','transfers'];
    const result = {};
    for (const t of tables) {
      result[t] = db.prepare(`SELECT data FROM ${t}`).all().map(r => JSON.parse(r.data));
    }
    // Settings
    const settings = {};
    db.prepare('SELECT key, value FROM settings').all()
      .forEach(r => { settings[r.key] = JSON.parse(r.value); });
    result.settings = settings;
    return { ok: true, data: result };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Full DB import (restore from backup)
ipcMain.handle('db:importFull', (_e, data) => {
  try {
    const transaction = db.transaction(() => {
      const tables = ['rooms','students','payments','expenses','cancellations',
        'maintenance','complaints','checkinlog','notices','fines',
        'activitylog','inspections','billsplits','transfers'];
      for (const t of tables) {
        db.prepare(`DELETE FROM ${t}`).run();
        if (Array.isArray(data[t])) {
          const ins = db.prepare(`INSERT OR REPLACE INTO ${t} (id, data) VALUES (?, ?)`);
          for (const r of data[t]) ins.run(r.id, JSON.stringify(r));
        }
      }
      if (data.settings) {
        db.prepare('DELETE FROM settings').run();
        const ins = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        Object.entries(data.settings).forEach(([k, v]) => ins.run(k, JSON.stringify(v)));
      }
    });
    transaction();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
```

Call `initDatabase()` inside `app.whenReady().then(...)` before `createWindow()`.

### In preload.js — expose new DB API:

Add to the existing `contextBridge.exposeInMainWorld('electronAPI', { ... })` object:

```js
// DB API
dbAll:         (table, where)       => ipcRenderer.invoke('db:all', table, where),
dbUpsert:      (table, id, record)  => ipcRenderer.invoke('db:upsert', table, id, record),
dbDelete:      (table, id)          => ipcRenderer.invoke('db:delete', table, id),
dbBulkReplace: (table, records)     => ipcRenderer.invoke('db:bulkReplace', table, records),
dbGetSetting:  (key)                => ipcRenderer.invoke('db:getSetting', key),
dbSetSetting:  (key, value)         => ipcRenderer.invoke('db:setSetting', key, value),
dbExportFull:  ()                   => ipcRenderer.invoke('db:exportFull'),
dbImportFull:  (data)               => ipcRenderer.invoke('db:importFull', data),
```

---

## 5. Phase 3 — One-time Data Migration (storage.js)

Replace `loadDB()` in `renderer/src/storage.js` with this:

```js
async function loadDB() {
  // Try SQLite first
  if (window.electronAPI && window.electronAPI.dbAll) {
    const tables = ['rooms','students','payments','expenses','cancellations',
      'maintenance','complaints','checkinlog','notices','fines',
      'activitylog','inspections','billsplits','transfers'];

    // Check if SQLite has data already
    const students = await window.electronAPI.dbAll('students');

    if (students.length === 0) {
      // SQLite is empty — check if localStorage has existing data to migrate
      const lsRaw = localStorage.getItem(LS_KEY);
      if (lsRaw) {
        console.info('[HOSTIX] Migrating localStorage → SQLite...');
        try {
          const lsData = JSON.parse(lsRaw);
          // Migrate each table
          for (const table of tables) {
            const records = lsData[table] || [];
            await window.electronAPI.dbBulkReplace(table, records);
          }
          // Migrate settings
          if (lsData.settings) {
            await window.electronAPI.dbSetSetting('hostelSettings', lsData.settings);
          }
          // Migrate logo & warden config (stay in localStorage — binary/sensitive)
          // theme stays in localStorage too (UI pref, not data)
          
          // Clear old localStorage data after successful migration
          localStorage.removeItem(LS_KEY);
          localStorage.removeItem(_LS_PENDING_KEY);
          console.info('[HOSTIX] Migration complete. localStorage data cleared.');
          if (typeof toast === 'function')
            toast('✅ Data migrated to SQLite. Faster and safer now!', 'success', 4000);
        } catch (e) {
          console.error('[HOSTIX] Migration failed:', e);
          if (typeof toast === 'function')
            toast('⚠️ Migration failed. Using existing data.', 'error');
        }
      }
    }

    // Load from SQLite into memory DB object
    const settingsRow = await window.electronAPI.dbGetSetting('hostelSettings');
    DB.settings = settingsRow || DB.settings;

    for (const table of tables) {
      const dbKey = table === 'activitylog' ? 'activityLog' 
                  : table === 'billsplits'  ? 'billSplits'
                  : table === 'checkinlog'  ? 'checkinlog' 
                  : table;
      DB[dbKey] = await window.electronAPI.dbAll(table);
    }

  } else {
    // Fallback: no electronAPI (e.g. browser dev mode) — use localStorage
    _loadFromLocalStorage();
  }

  if (typeof _initDBFields === 'function') DB = _initDBFields(DB);
  _checkBackupReminder();
}

function _loadFromLocalStorage() {
  try {
    const pending = localStorage.getItem(_LS_PENDING_KEY);
    if (pending) {
      try {
        const p = JSON.parse(pending);
        if (p && Array.isArray(p.students) && Array.isArray(p.rooms)) {
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
    console.error('[HOSTIX] localStorage fallback load failed:', e);
  }
}
```

Replace `saveDB()` with this:

```js
async function saveDB() {
  if (typeof enforceDataRetention === 'function') enforceDataRetention();

  if (window.electronAPI && window.electronAPI.dbBulkReplace) {
    try {
      const tableMap = {
        rooms: DB.rooms,           students: DB.students,
        payments: DB.payments,     expenses: DB.expenses,
        cancellations: DB.cancellations, maintenance: DB.maintenance,
        complaints: DB.complaints, checkinlog: DB.checkinlog,
        notices: DB.notices,       fines: DB.fines,
        activitylog: DB.activityLog, inspections: DB.inspections,
        billsplits: DB.billSplits, transfers: DB.transfers
      };
      for (const [table, records] of Object.entries(tableMap)) {
        await window.electronAPI.dbBulkReplace(table, records || []);
      }
      await window.electronAPI.dbSetSetting('hostelSettings', DB.settings);

      if (typeof updateSidebar         === 'function') updateSidebar();
      if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
      return true;
    } catch (e) {
      console.error('[HOSTIX] SQLite saveDB failed:', e);
      if (typeof toast === 'function')
        toast('⚠️ Save failed! Export a backup immediately.', 'error');
      return false;
    }
  } else {
    return _saveToLocalStorage();
  }
}

function _saveToLocalStorage() {
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
    if (typeof toast === 'function')
      toast('⚠️ Storage full — backup NOW!', 'error');
    return false;
  }
}
```

### ⚠️ Critical: app.js calls saveDB() 92 times

`saveDB()` is now async. All 92 call sites in `app.js` that do:
```js
saveDB();
renderPage(currentPage);
```
must become:
```js
await saveDB();
renderPage(currentPage);
```
...and their containing functions need `async function` prefix.

**Safe approach:** Do a global find-replace in app.js:
1. Add `async` to every `function` that contains `saveDB()` inside it
2. Change every bare `saveDB()` call to `await saveDB()`
3. Leave `return saveDB()` calls as `return await saveDB()`

The total count is 92 — do it with a script, not manually.

---

## 6. Phase 4 — Update backup/restore (storage.js)

The export backup handler (in `storage.js`, triggered by Electron menu) must change:

```js
// OLD:
window.electronAPI.onExportBackup(function (filePath) {
  const exportData = {
    db: JSON.parse(localStorage.getItem(LS_KEY) || '{}'),
    ...
  };
  ...
});

// NEW:
window.electronAPI.onExportBackup(async function (filePath) {
  const result = await window.electronAPI.dbExportFull();
  if (!result.ok) {
    toast('❌ Backup export failed', 'error');
    return;
  }
  const exportData = {
    db: result.data,
    exportedAt: new Date().toISOString(),
    version: '4.0'
  };
  window.electronAPI.exportBackup(filePath, JSON.stringify(exportData, null, 2));
  markBackupDone();
});
```

Import backup handler:
```js
// NEW:
window.electronAPI.onImportBackup(async function (jsonString) {
  try {
    if (typeof jsonString !== 'string' || jsonString.length > 50 * 1024 * 1024) {
      toast('❌ Backup file too large or invalid', 'error'); return;
    }
    const data = JSON.parse(jsonString);
    const dbData = data.db || data;
    if (!Array.isArray(dbData.rooms) && !Array.isArray(dbData.students)) {
      toast('❌ Invalid backup file', 'error'); return;
    }
    const result = await window.electronAPI.dbImportFull(dbData);
    if (!result.ok) { toast('❌ Import failed: ' + result.error, 'error'); return; }
    await loadDB();
    if (typeof updateSidebar === 'function') updateSidebar();
    if (typeof renderPage    === 'function') renderPage('dashboard');
    toast('✅ Backup imported!', 'success');
    markBackupDone();
  } catch (e) {
    toast('❌ Import failed: ' + e.message, 'error');
  }
});
```

---

## 7. Phase 5 — localStorage remnants in app.js

These 8 `localStorage` references remain in `app.js` after the main migration. Handle them:

| Line | Key | Action |
|------|-----|--------|
| L15 | `theme` | Keep in localStorage — UI pref, not data |
| L28 | `theme` | Keep in localStorage |
| L7218 | `hostel_logo_hostel_1` | Keep in localStorage — binary data, not worth SQLite |
| L7226 | `hostel_logo_hostel_1` | Keep in localStorage |
| L7806-7839 | `dbh2_archive` | Migrate to SQLite `archive` table |

For the archive (L7826-7839), replace with:
```js
// OLD: localStorage.getItem('dbh2_archive')
// NEW: use window.electronAPI.dbAll('archive') — already in SQLite after migration
```

---

## 8. Phase 6 — Modularization of app.js

Do this **after** SQLite migration is stable and tested.

### Target module structure:
```
renderer/
└── modules/
    ├── dashboard.js     (L360–741)    renderDashboard, drawTrendChart, calcRevenue
    ├── rooms.js         (L1852–2026)  renderRooms, showAddRoomModal, showRoomDetail
    ├── students.js      (L2027–3158)  renderStudents, showAddStudentModal, showViewStudentModal
    ├── payments.js      (L3159–4032)  renderPayments, generateMonthlyRents, showAddPaymentModal
    ├── expenses.js      (L4033–4135)  renderExpenses, showAddExpenseModal
    ├── reports.js       (L4272–4886)  renderReports, renderReportDetail, printReport
    ├── cancellations.js (L1470–1851)  renderCancellations, saveCancellation, restoreFromCancellation
    ├── maintenance.js   (L8022–8232)  renderIssues, showAddIssueModal
    ├── settings.js      (L5271–5865)  renderSettings, saveSettings, importFromExcel
    ├── search.js        (L7655–7803)  dashGlobalSearch, dashGlobalSearchClear
    ├── calendar.js      (L7247–7393)  toggleSbCal, renderSidebarCalendar
    ├── modals.js        (L6498–6534)  showModal, closeModal, showConfirm
    ├── backup.js        (L6534–6897)  showBackupRestoreModal, exportBackup, restoreBackup
    └── nav.js           (L181–359)    navigate, renderPage, goBack, updateSidebar
```

### How to split safely (no bundler approach):
1. Create each module file
2. Move functions — **cut from app.js, paste into module file**
3. Add `<script src="modules/nav.js"></script>` etc. to `index.html` **before** `app.js`
4. Leave `app.js` as the orchestrator (smaller, just wiring)
5. Test each module one at a time — don't split all at once

### Global state dependencies to be aware of:
Every module uses these globals (defined in `config.js` and `storage.js`):
- `DB` — the main data object
- `CUR_USER`, `CUR_ROLE`, `WARDENS` — from auth.js
- `currentPage`, `pageHistory` — navigation state
- `saveDB()`, `loadDB()`, `logActivity()` — from storage.js
- `toast()`, `escHtml()`, `uid()`, `fmtDate()`, `fmtPKR()` — from utils.js

Since there's no bundler, all these are just window globals — modules can use them freely as long as load order in `index.html` is correct (config → utils → auth → storage → modules → app.js).

---

## 9. Testing Checklist (after each phase)

### After SQLite migration:
- [ ] `npm start` launches without errors
- [ ] First run: data migrates from localStorage, toast appears
- [ ] Dashboard loads with correct student/revenue counts
- [ ] Add a student → close app → reopen → student still there
- [ ] Add a payment → mark paid → data persists
- [ ] Export backup → JSON file contains all data
- [ ] Import backup → all data restored correctly
- [ ] Light/dark theme toggle still works (localStorage)
- [ ] Logo upload still works (localStorage)

### After modularization:
- [ ] Each page renders correctly
- [ ] Add/edit/delete works on every page
- [ ] PDF receipts generate
- [ ] WhatsApp share works
- [ ] Reports page renders all sections
- [ ] Settings save correctly
- [ ] Excel import/export works
- [ ] License system still works

---

## 10. Gotchas & Risks

| Risk | Mitigation |
|------|-----------|
| `saveDB()` is now async but called 92 times synchronously | Script-replace all call sites with `await saveDB()` and wrap parent functions with `async` |
| `loadDB()` is now async but called on startup before UI renders | Call it with `await` from an async IIFE in `index.html` or `app.js` init |
| `better-sqlite3` native rebuild for Electron 22 | Use `electron-rebuild` — version must match exactly |
| `backgroundColor: '#060c18'` in main.js window — hardcoded old color | Change to `'#1a1c1e'` to match new dark theme |
| Archive table (`dbh2_archive`) still in localStorage | Migrate in same pass as main DB, or handle separately |
| `_checkStorageUsage()` in storage.js checks localStorage size | Remove after migration — not relevant for SQLite |
| `cross-tab sync` (storage event listener) in storage.js | Remove after migration — not relevant for SQLite files |
| preload.js must expose ALL new db* methods | Don't miss any — renderer calls them via `window.electronAPI` |

---

## 11. What was already done (do not redo)

- ✅ Repo cleaned: `app_old.js`, `archive_recovery.js`, `.vscode/`, `public/native/` all deleted
- ✅ `.gitignore` updated
- ✅ `README.md` updated (project name HOSTIX, correct folder structure)
- ✅ `renderer/style.css` rethemed: charcoal dark mode + light mode from palette `#f0f5f9/#c9d6df/#52616b/#1e2022`
- ✅ Root-level duplicate `style.css` deleted

---

## 12. Recommended execution order

```
1. Install better-sqlite3 + electron-rebuild
2. Add initDatabase() + all IPC handlers to main.js
3. Expose db* methods in preload.js
4. Replace loadDB() and saveDB() in storage.js
5. Run app — verify migration from localStorage works
6. Fix async/await at all 92 saveDB() call sites in app.js
7. Update backup/restore handlers in storage.js
8. Migrate archive from localStorage to SQLite
9. Remove _checkStorageUsage() and cross-tab storage listener
10. Fix backgroundColor in main.js (optional cosmetic)
11. Full test with checklist above
12. Commit: "feat: migrate localStorage → SQLite (better-sqlite3)"
13. THEN start modularization (Phase 6)
```

---

*Handoff prepared by Claude Sonnet — June 2026*
*Token used: revoke after use — github_pat_11BZWBPBA0eI0246bfI59x_... (already exposed in conversation)*
