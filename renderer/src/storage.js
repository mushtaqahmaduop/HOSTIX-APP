/* ─── HOSTIX — STORAGE / DATABASE (v4.0 — SQLite via better-sqlite3) ─────────
   Loaded after config.js, utils.js, auth.js.
   Contains: loadDB, saveDB, logActivity, backup/restore.

   v4.0 CHANGES:
   - localStorage → SQLite via Electron IPC (window.electronAPI.db*)
   - One-time migration from localStorage on first run (shows toast)
   - localStorage fallback preserved for browser dev mode
   - Cross-tab sync listener removed (SQLite is file-based, single process)
   - _checkStorageUsage() removed (no 5MB limit with SQLite)
   - backup/restore now use db:exportFull / db:importFull IPC channels
   - saveDB() is now async — all 92 call sites in app.js use await saveDB()
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const _LS_PENDING_KEY = LS_KEY + '_pending';

// ── Table name map: DB key → SQLite table name ────────────────────────────────
const _TABLE_MAP = {
  rooms:         'rooms',
  students:      'students',
  payments:      'payments',
  expenses:      'expenses',
  cancellations: 'cancellations',
  maintenance:   'maintenance',
  complaints:    'complaints',
  checkinlog:    'checkinlog',
  notices:       'notices',
  fines:         'fines',
  activityLog:   'activitylog',
  inspections:   'inspections',
  billSplits:    'billsplits',
  transfers:     'transfers',
  archive:       'archive'
};

// ── Load DB ───────────────────────────────────────────────────────────────────
async function loadDB() {
  if (window.electronAPI && window.electronAPI.dbAll) {
    // Check if SQLite already has data
    const existingStudents = await window.electronAPI.dbAll('students');

    if (existingStudents.length === 0) {
      // SQLite empty — attempt one-time migration from localStorage
      const lsRaw = localStorage.getItem(LS_KEY);
      if (lsRaw) {
        console.info('[HOSTIX] Migrating localStorage → SQLite...');
        try {
          const lsData = JSON.parse(lsRaw);
          for (const [dbKey, table] of Object.entries(_TABLE_MAP)) {
            const records = lsData[dbKey] || [];
            await window.electronAPI.dbBulkReplace(table, records);
          }
          if (lsData.settings) {
            await window.electronAPI.dbSetSetting('hostelSettings', lsData.settings);
          }
          // Migrate archive
          const archiveRaw = localStorage.getItem('dbh2_archive');
          if (archiveRaw) {
            try {
              const archive = JSON.parse(archiveRaw);
              const payments = (archive.payments || []).concat(archive.expenses || []);
              for (const r of payments) {
                if (r && r.id) await window.electronAPI.dbUpsert('archive', r.id, r);
              }
            } catch (_) {}
          }
          // Clear old localStorage data
          localStorage.removeItem(LS_KEY);
          localStorage.removeItem(_LS_PENDING_KEY);
          localStorage.removeItem('dbh2_archive');
          console.info('[HOSTIX] Migration complete.');
          setTimeout(function () {
            if (typeof toast === 'function')
              toast('Data migrated to SQLite — faster and safer.', 'success', 'Upgraded');
          }, 1500);
        } catch (e) {
          console.error('[HOSTIX] Migration failed:', e);
          setTimeout(function () {
            if (typeof toast === 'function')
              toast('⚠️ Migration failed — existing data preserved in localStorage.', 'error');
          }, 1500);
        }
      }
    }

    // Load from SQLite into memory DB object
    const settingsRow = await window.electronAPI.dbGetSetting('hostelSettings');
    if (settingsRow) DB.settings = settingsRow;

    for (const [dbKey, table] of Object.entries(_TABLE_MAP)) {
      DB[dbKey] = await window.electronAPI.dbAll(table);
    }

  } else {
    // Fallback: no Electron API (browser dev mode)
    _loadFromLocalStorage();
  }

  if (typeof _initDBFields === 'function') DB = _initDBFields(DB);
  _takeFullSnapshot();
  _checkBackupReminder();
}

// ── Save snapshot (for surgical, change-only saves) ─────────────────────────────
// We keep a per-table map of id → JSON.stringify(record) representing the last
// persisted state. saveDB() diffs the in-memory DB against this snapshot and only
// writes the rows that actually changed/were added/deleted — instead of wiping and
// rewriting all 14 tables on every single mutation (the old behaviour, which made
// the app crawl once there were hundreds of students + thousands of payments).
let _dbSnapshot = {};

function _snapshotTable(records) {
  const m = new Map();
  for (const r of (records || [])) {
    if (r && r.id != null) m.set(r.id, JSON.stringify(r));
  }
  return m;
}

function _takeFullSnapshot() {
  _dbSnapshot = {};
  for (const dbKey of Object.keys(_TABLE_MAP)) {
    _dbSnapshot[dbKey] = _snapshotTable(DB[dbKey]);
  }
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

/* ── A FAILED SAVE MUST NOT LOOK LIKE A SAVE ─────────────────────────────────
   saveDB() returns false when the write fails. Every one of its ~92 call sites
   awaits it and then unconditionally toasts success and closes the modal — so a
   warden saw "Payment recorded" for a record that only ever existed in memory,
   and lost it at the next restart. The only warning was an error toast that
   appeared 50ms later and disappeared 4.5 seconds after that, usually behind
   the success toast the call site had just fired.

   Rewriting 92 call sites is a wide, risky edit. Making the failure impossible
   to miss is not. A failed write raises a bar across the top of the app that
   does not time out and cannot be dismissed by accident. It clears only when a
   save actually succeeds, so a success toast fired a moment later cannot bury
   it, and it offers the two things that are actually useful at that moment:
   try the write again, or get the data out of memory and onto disk as JSON
   while it still exists.

   Styles are inline on purpose — this has to render even if a stylesheet
   failed to load, which is one of the ways a machine gets into this state. */
let _saveFailed = false;

function _clearSaveFailure() {
  if (!_saveFailed) return;
  _saveFailed = false;
  const el = document.getElementById('save-failed-bar');
  if (el) el.remove();
}

function _showSaveFailure(detail) {
  _saveFailed = true;
  if (!document.body) return;                 // failed before the UI existed
  let el = document.getElementById('save-failed-bar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'save-failed-bar';
    el.setAttribute('role', 'alert');
    el.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'gap:12px',
      'padding:10px 16px', 'background:#b91c1c', 'color:#fff',
      'font-family:system-ui,-apple-system,Segoe UI,sans-serif', 'font-size:13px',
      'box-shadow:0 2px 10px rgba(0,0,0,.35)'
    ].join(';');
    document.body.appendChild(el);
  }
  const btn = 'background:#fff;color:#b91c1c;border:none;border-radius:7px;'
            + 'padding:6px 12px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit';
  el.innerHTML =
      '<strong style="flex-shrink:0">Not saved to disk.</strong>'
    + '<span style="flex:1;min-width:0">Your most recent change is only in memory and will be lost if the app closes.'
    + (detail ? ' <span style="opacity:.85">(' + String(detail).slice(0, 120) + ')</span>' : '')
    + '</span>'
    + '<button id="save-failed-retry" style="' + btn + '">Try saving again</button>'
    + '<button id="save-failed-export" style="' + btn + '">Download a copy now</button>';

  const retry = /** @type {HTMLButtonElement|null} */ (document.getElementById('save-failed-retry'));
  if (retry) retry.onclick = async function () {
    retry.disabled = true; retry.textContent = 'Saving…';
    const ok = await saveDB();
    if (!ok) { retry.disabled = false; retry.textContent = 'Try saving again'; }
    else if (typeof toast === 'function') toast('Saved — everything is on disk again.', 'success');
  };
  const exp = document.getElementById('save-failed-export');
  // exportData() serialises the in-memory DB straight to a file, so it still
  // works when the database write is the thing that is broken.
  if (exp) exp.onclick = function () {
    if (typeof exportData === 'function') exportData();
    else if (typeof toast === 'function') toast('Open Settings → Data Management to export.', 'info');
  };
}

// ── Save DB ───────────────────────────────────────────────────────────────────
async function saveDB() {
  if (typeof enforceDataRetention === 'function') enforceDataRetention();

  if (window.electronAPI && window.electronAPI.dbUpsert) {
    try {
      for (const [dbKey, table] of Object.entries(_TABLE_MAP)) {
        const prev = _dbSnapshot[dbKey] || new Map();
        const cur  = DB[dbKey] || [];
        const seen = new Set();

        // Upsert new + changed rows only
        for (const r of cur) {
          if (!r || r.id == null) continue;
          seen.add(r.id);
          const js = JSON.stringify(r);
          if (prev.get(r.id) !== js) {
            const res = await window.electronAPI.dbUpsert(table, r.id, r);
            if (res && res.ok === false) throw new Error(res.error || ('upsert ' + table));
          }
        }
        // Delete rows that were removed in memory
        for (const id of prev.keys()) {
          if (!seen.has(id)) {
            const res = await window.electronAPI.dbDelete(table, id);
            if (res && res.ok === false) throw new Error(res.error || ('delete ' + table));
          }
        }
      }
      await window.electronAPI.dbSetSetting('hostelSettings', DB.settings);

      _takeFullSnapshot();
      _clearSaveFailure();
      if (typeof updateSidebar         === 'function') updateSidebar();
      if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
      return true;
    } catch (e) {
      console.error('[HOSTIX] surgical saveDB failed, falling back to full rewrite:', e);
      // Safety net: if anything goes wrong with the diff path, guarantee
      // consistency by rewriting everything the old way.
      return _saveDBFull();
    }
  } else {
    return _saveToLocalStorage();
  }
}

// Full rewrite of every table — kept as a fallback for the surgical saveDB() path.
async function _saveDBFull() {
  if (window.electronAPI && window.electronAPI.dbBulkReplace) {
    try {
      for (const [dbKey, table] of Object.entries(_TABLE_MAP)) {
        await window.electronAPI.dbBulkReplace(table, DB[dbKey] || []);
      }
      await window.electronAPI.dbSetSetting('hostelSettings', DB.settings);

      _takeFullSnapshot();
      _clearSaveFailure();
      if (typeof updateSidebar         === 'function') updateSidebar();
      if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
      return true;
    } catch (e) {
      console.error('[HOSTIX] SQLite saveDB failed:', e);
      _showSaveFailure(e && e.message);
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
    _clearSaveFailure();
    if (typeof updateSidebar         === 'function') updateSidebar();
    if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
    return true;
  } catch (e) {
    console.error('[HOSTIX] localStorage save failed:', e);
    _showSaveFailure('storage full');
    return false;
  }
}

// ── Activity log ──────────────────────────────────────────────────────────────
function logActivity(action, details, category) {
  details  = details  || '';
  category = category || 'General';
  if (!DB.activityLog) DB.activityLog = [];
  const byName  = (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : '';
  const _logNow = new Date();
  DB.activityLog.unshift({
    id: 'al_' + uid(), action, details, category, by: byName,
    date: ymd(_logNow),
    time: _logNow.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
  });
  if (DB.activityLog.length >= 180 && DB.activityLog.length < 200) {
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('📋 Activity log is almost full (' + DB.activityLog.length + '/200). Export before it auto-trims.', 'warning', 'Activity log');
    }, 500);
  }
  if (DB.activityLog.length > 200) DB.activityLog = DB.activityLog.slice(0, 200);
}

// ── Backup reminder (7-day nudge) ─────────────────────────────────────────────
function _checkBackupReminder() {
  try {
    const last = DB.settings && DB.settings.lastBackupReminder
      ? new Date(DB.settings.lastBackupReminder)
      : null;
    const daysSince = last ? (Date.now() - last.getTime()) / 86400000 : 999;
    if (daysSince < 7) return;
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('Over a week since your last backup. Export one from Backup & Restore.', 'warning', 'Backup due');
    }, 4000);
  } catch (e) {}
}

function markBackupDone() {
  if (DB.settings) DB.settings.lastBackupReminder = new Date().toISOString();
  saveDB();
}

// ── Electron menu backup handlers ─────────────────────────────────────────────
if (window.electronAPI) {

  window.electronAPI.onExportBackup(async function (filePath) {
    const result = await window.electronAPI.dbExportFull();
    if (!result.ok) {
      if (typeof toast === 'function') toast('❌ Backup export failed: ' + result.error, 'error');
      return;
    }
    const exportData = {
      db:         result.data,
      exportedAt: new Date().toISOString(),
      version:    '4.0'
    };
    window.electronAPI.exportBackup(filePath, JSON.stringify(exportData, null, 2));
    markBackupDone();
  });

  if (window.electronAPI.onPdfSaved) {
    window.electronAPI.onPdfSaved(function (result) {
      if (result.success) {
        if (typeof toast === 'function') toast('PDF saved: ' + result.filePath.split(/[\\\/]/).pop(), 'success');
      } else {
        if (typeof toast === 'function') toast('PDF failed: ' + (result.error || 'Unknown error'), 'error');
      }
    });
  }

  window.electronAPI.onImportBackup(async function (jsonString) {
    try {
      if (typeof jsonString !== 'string' || jsonString.length > 50 * 1024 * 1024) {
        if (typeof toast === 'function') toast('❌ Backup file is too large or invalid', 'error');
        return;
      }
      const data   = JSON.parse(jsonString);
      const dbData = data.db || data;

      // BUG FIX (B6): was && — only caught case where BOTH were missing
      if (!Array.isArray(dbData.rooms) || !Array.isArray(dbData.students)) {
        if (typeof toast === 'function') toast('❌ Invalid backup file — missing required data', 'error');
        return;
      }

      // BUG FIX (B6): validate each record has an id field to prevent silent import failures
      if (dbData.students.some(function(s){ return !s || typeof s !== 'object' || !s.id; })) {
        if (typeof toast === 'function') toast('❌ Backup has corrupted student records — missing id fields', 'error');
        return;
      }
      if (dbData.rooms.some(function(r){ return !r || typeof r !== 'object' || !r.id; })) {
        if (typeof toast === 'function') toast('❌ Backup has corrupted room records — missing id fields', 'error');
        return;
      }

      const MAX_STUDENTS = 10000, MAX_PAYMENTS = 100000;
      if (Array.isArray(dbData.students) && dbData.students.length > MAX_STUDENTS) {
        if (typeof toast === 'function') toast('❌ Backup contains too many student records', 'error');
        return;
      }
      if (Array.isArray(dbData.payments) && dbData.payments.length > MAX_PAYMENTS) {
        if (typeof toast === 'function') toast('❌ Backup contains too many payment records', 'error');
        return;
      }

      const result = await window.electronAPI.dbImportFull(dbData);
      if (!result.ok) {
        if (typeof toast === 'function') toast('❌ Import failed: ' + result.error, 'error');
        return;
      }
      await loadDB();
      if (typeof updateSidebar === 'function') updateSidebar();
      if (typeof renderPage    === 'function') renderPage('dashboard');
      if (typeof toast         === 'function') toast('✅ Backup imported successfully!', 'success');
      markBackupDone();
    } catch (e) {
      console.error('[HOSTIX] Import failed:', e);
      if (typeof toast === 'function') toast('❌ Import failed: ' + e.message, 'error');
    }
  });
}
