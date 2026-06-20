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
  transfers:     'transfers'
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
              toast('✅ Data migrated to SQLite — faster and safer!', 'success', 4000);
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

// ── Save DB ───────────────────────────────────────────────────────────────────
async function saveDB() {
  if (typeof enforceDataRetention === 'function') enforceDataRetention();

  if (window.electronAPI && window.electronAPI.dbBulkReplace) {
    try {
      for (const [dbKey, table] of Object.entries(_TABLE_MAP)) {
        await window.electronAPI.dbBulkReplace(table, DB[dbKey] || []);
      }
      await window.electronAPI.dbSetSetting('hostelSettings', DB.settings);

      if (typeof updateSidebar         === 'function') updateSidebar();
      if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
      return true;
    } catch (e) {
      console.error('[HOSTIX] SQLite saveDB failed:', e);
      setTimeout(function () {
        if (typeof toast === 'function')
          toast('⚠️ Save failed! Export a backup immediately.', 'error');
      }, 50);
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
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('⚠️ Storage full — data may NOT have saved! Export a backup immediately.', 'error');
    }, 50);
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
    date: _logNow.toISOString().split('T')[0],
    time: _logNow.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
  });
  if (DB.activityLog.length >= 180 && DB.activityLog.length < 200) {
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('📋 Activity log is almost full (' + DB.activityLog.length + '/200). Export before it auto-trims.', 'warning', 5000);
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
    const daysSince = last ? (new Date() - last) / 86400000 : 999;
    if (daysSince < 7) return;
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('💾 Over a week since last backup. Export one from Backup & Restore.', 'warning', 7000);
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
