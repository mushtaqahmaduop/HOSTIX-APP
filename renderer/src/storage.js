/* ─── DAMAM HOSTEL — STORAGE / DATABASE ─────────────────────────────────────
   Loaded after config.js, utils.js, auth.js.
   Contains: loadDB, saveDB, logActivity, backup/restore, cross-tab sync.

   BUG FIX (v3): Cross-tab sync guard now checks Array.isArray() — empty arrays
   are truthy in JS so the old check would overwrite live data with a blank DB.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

// ── Load DB from localStorage ────────────────────────────────────────────────
function loadDB() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      DB = parsed;
    }
  } catch (e) {
    console.error('[DAMAM] localStorage data corrupted:', e);
    setTimeout(() => {
      if (typeof toast === 'function')
        toast('⚠️ Saved data appears corrupted. Please restore from a backup file.', 'error');
    }, 1200);
  }
  if (typeof _initDBFields === 'function') DB = _initDBFields(DB);
  _checkBackupReminder();
}

// ── Save DB to localStorage ───────────────────────────────────────────────────
function saveDB() {
  if (typeof enforceDataRetention === 'function') enforceDataRetention();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(DB));
  } catch (e) {
    console.error('[DAMAM] localStorage save failed:', e);
    setTimeout(() => {
      if (typeof toast === 'function')
        toast('⚠️ Storage full — data may NOT have saved! Export a backup immediately.', 'error');
    }, 50);
  }
  if (typeof updateSidebar         === 'function') updateSidebar();
  if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
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
  if (DB.activityLog.length > 200) DB.activityLog = DB.activityLog.slice(0, 200);
}

// ── Backup reminder (7-day nudge) ─────────────────────────────────────────────
function _checkBackupReminder() {
  try {
    var last = DB.settings && DB.settings.lastBackupReminder
      ? new Date(DB.settings.lastBackupReminder)
      : null;
    var now = new Date();
    var daysSince = last ? (now - last) / 86400000 : 999;
    if (daysSince < 7) return;
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('💾 It\'s been over a week since your last backup. Export one now from Backup & Restore.', 'warning', 7000);
    }, 4000);
  } catch (e) {}
}

// Call this whenever a successful backup export completes:
function markBackupDone() {
  if (DB.settings) DB.settings.lastBackupReminder = new Date().toISOString();
  saveDB();
}

// ── Cross-tab sync (storage event) ───────────────────────────────────────────
// BUG FIX: use Array.isArray() guards — empty arrays are truthy so the old
// check would silently overwrite live data with a blank database import.
window.addEventListener('storage', function (e) {
  if (e.key === LS_KEY && e.newValue) {
    try {
      var incoming = JSON.parse(e.newValue);
      if (
        incoming &&
        Array.isArray(incoming.students) &&
        Array.isArray(incoming.rooms) &&
        incoming.settings
      ) {
        DB = typeof _initDBFields === 'function' ? _initDBFields(incoming) : incoming;
        if (typeof renderPage    === 'function') renderPage(currentPage);
        if (typeof updateSidebar === 'function') updateSidebar();
      }
    } catch (err) {}
  }
});

// Live sync from archive iframe via postMessage
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'damam_db_updated') {
    loadDB();
    if (typeof renderPage    === 'function') renderPage(currentPage);
    if (typeof updateSidebar === 'function') updateSidebar();
  }
});

// ── Electron menu backup handlers ─────────────────────────────────────────────
if (window.electronAPI) {

  // Export Backup (File → Export Backup…)
  window.electronAPI.onExportBackup(function (filePath) {
    try {
      const archive    = localStorage.getItem('dbh2_archive') || '{}';
      const exportData = {
        db:         JSON.parse(localStorage.getItem(LS_KEY) || '{}'),
        archive:    JSON.parse(archive),
        exportedAt: new Date().toISOString(),
        version:    '3.0'
      };
      window.electronAPI.exportBackup(filePath, JSON.stringify(exportData, null, 2));
      markBackupDone();
    } catch (e) {
      console.error('Export failed:', e);
    }
  });

  // PDF save result toast
  if (window.electronAPI.onPdfSaved) {
    window.electronAPI.onPdfSaved(function (result) {
      if (result.success) {
        if (typeof toast === 'function') toast('PDF saved: ' + result.filePath.split(/[\\\/]/).pop(), 'success');
      } else {
        if (typeof toast === 'function') toast('PDF failed: ' + result.error, 'error');
      }
    });
  }

  // Import Backup (File → Import Backup…)
  window.electronAPI.onImportBackup(function (jsonString) {
    try {
      const data   = JSON.parse(jsonString);
      const dbData = data.db || data;
      if (!Array.isArray(dbData.rooms) && !Array.isArray(dbData.students)) {
        if (typeof toast === 'function') toast('Invalid backup file', 'error');
        return;
      }
      localStorage.setItem(LS_KEY, JSON.stringify(dbData));
      if (data.archive) localStorage.setItem('dbh2_archive', JSON.stringify(data.archive));
      loadDB();
      if (typeof updateSidebar === 'function') updateSidebar();
      if (typeof renderPage    === 'function') renderPage('dashboard');
      if (typeof toast         === 'function') toast('✅ Backup imported successfully!', 'success');
    } catch (e) {
      if (typeof toast === 'function') toast('❌ Import failed: invalid file', 'error');
    }
  });
}
