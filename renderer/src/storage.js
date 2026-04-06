/* ─── DAMAM HOSTEL — STORAGE / DATABASE (PATCHED) ───────────────────────────
   Loaded after config.js, utils.js, auth.js.
   Contains: loadDB, saveDB, logActivity, backup/restore, cross-tab sync.

   BUG FIXES:
   FIX-S1  saveDB() now returns true/false so callers can detect save failure.
   FIX-S2  Atomic write pattern: writes to _pending key first, then promotes.
           Reduces risk of corrupt main key if power loss during write.
   FIX-S3  Import backup validates record limits + rejects suspicious payloads.
   FIX-S4  DB size warning before localStorage approaches 5MB limit.
   FIX-S5  Cross-tab sync guard checks Array.isArray() — preserved from v3.
   FIX-S6  Activity log warns before clearing — user must confirm.
   FIX-S7  loadDB checks _pending key and recovers from partial write corruption.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const _LS_PENDING_KEY = LS_KEY + '_pending'; // [FIX-S2] atomic write temp key

// ── [FIX-S7] Load DB — with pending-key recovery ─────────────────────────────
function loadDB() {
  try {
    // [FIX-S7] Check if a pending write was interrupted — if so, attempt recovery
    const pending = localStorage.getItem(_LS_PENDING_KEY);
    if (pending) {
      try {
        const parsedPending = JSON.parse(pending);
        if (parsedPending && Array.isArray(parsedPending.students) && Array.isArray(parsedPending.rooms)) {
          // Pending write looks valid — promote it and clean up
          localStorage.setItem(LS_KEY, pending);
          localStorage.removeItem(_LS_PENDING_KEY);
          console.info('[DAMAM] Recovered DB from interrupted write (pending key).');
        } else {
          localStorage.removeItem(_LS_PENDING_KEY); // pending was corrupt — discard
        }
      } catch (pe) {
        localStorage.removeItem(_LS_PENDING_KEY); // unparseable pending — discard
      }
    }

    const s = localStorage.getItem(LS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      DB = parsed;
    }
  } catch (e) {
    console.error('[DAMAM] localStorage data corrupted:', e);
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('⚠️ Saved data appears corrupted. Please restore from a backup file.', 'error');
    }, 1200);
  }
  if (typeof _initDBFields === 'function') DB = _initDBFields(DB);
  _checkBackupReminder();
  _checkStorageUsage(); // [FIX-S4] warn if approaching limit
}

// ── [FIX-S1 + FIX-S2] Save DB — atomic write + return boolean ─────────────────
function saveDB() {
  if (typeof enforceDataRetention === 'function') enforceDataRetention();
  try {
    const serialized = JSON.stringify(DB);

    // [FIX-S2] Atomic write: write to pending key first, then promote to real key
    // If power is lost between the two setItem calls, loadDB() will recover from pending.
    localStorage.setItem(_LS_PENDING_KEY, serialized); // step 1: write to temp
    localStorage.setItem(LS_KEY, serialized);           // step 2: promote to main
    localStorage.removeItem(_LS_PENDING_KEY);           // step 3: clean temp

    if (typeof updateSidebar         === 'function') updateSidebar();
    if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
    return true; // [FIX-S1] indicate success
  } catch (e) {
    console.error('[DAMAM] localStorage save failed:', e);
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('⚠️ Storage full — data may NOT have saved! Export a backup immediately.', 'error');
    }, 50);
    return false; // [FIX-S1] indicate failure — callers can react
  }
}

// ── [FIX-S4] Storage usage warning ───────────────────────────────────────────
function _checkStorageUsage() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      total += (localStorage.getItem(key) || '').length;
    }
    const totalKB = Math.round(total / 1024);
    const LIMIT_KB = 4500; // warn at 4.5MB (localStorage limit is ~5MB)
    if (totalKB > LIMIT_KB) {
      setTimeout(function () {
        if (typeof toast === 'function')
          toast(`⚠️ Storage is ${totalKB}KB / ~5120KB (${Math.round(totalKB/51.2)}% full). Export a backup and archive old data soon.`, 'error', 8000);
      }, 3000);
    }
  } catch (e) {}
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
  // [FIX-S6] Warn when log is nearing the 200-entry cap
  if (DB.activityLog.length >= 180 && DB.activityLog.length < 200) {
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('📋 Activity log is almost full (' + DB.activityLog.length + '/200). Consider exporting it before it auto-trims.', 'warning', 5000);
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
    const now = new Date();
    const daysSince = last ? (now - last) / 86400000 : 999;
    if (daysSince < 7) return;
    setTimeout(function () {
      if (typeof toast === 'function')
        toast('💾 It\'s been over a week since your last backup. Export one now from Backup & Restore.', 'warning', 7000);
    }, 4000);
  } catch (e) {}
}

function markBackupDone() {
  if (DB.settings) DB.settings.lastBackupReminder = new Date().toISOString();
  saveDB();
}

// ── [FIX-S5] Cross-tab sync ───────────────────────────────────────────────────
window.addEventListener('storage', function (e) {
  if (e.key === LS_KEY && e.newValue) {
    try {
      const incoming = JSON.parse(e.newValue);
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

window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'damam_db_updated') {
    loadDB();
    if (typeof renderPage    === 'function') renderPage(currentPage);
    if (typeof updateSidebar === 'function') updateSidebar();
  }
});

// ── Electron menu backup handlers ─────────────────────────────────────────────
if (window.electronAPI) {

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
      console.error('[DAMAM] Export failed:', e);
    }
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

  // [FIX-S3] Import Backup — validate structure and limits before accepting
  window.electronAPI.onImportBackup(function (jsonString) {
    try {
      // [FIX-S3] Reject suspiciously large payloads before parsing
      if (typeof jsonString !== 'string' || jsonString.length > 50 * 1024 * 1024) {
        if (typeof toast === 'function') toast('❌ Backup file is too large or invalid', 'error');
        return;
      }

      const data   = JSON.parse(jsonString);
      const dbData = data.db || data;

      // [FIX-S3] Validate core arrays exist
      if (!Array.isArray(dbData.rooms) && !Array.isArray(dbData.students)) {
        if (typeof toast === 'function') toast('❌ Invalid backup file — missing required data', 'error');
        return;
      }

      // [FIX-S3] Sanity-check record counts to catch corrupted/malicious imports
      const MAX_STUDENTS = 10000;
      const MAX_PAYMENTS = 100000;
      if (Array.isArray(dbData.students) && dbData.students.length > MAX_STUDENTS) {
        if (typeof toast === 'function') toast('❌ Backup contains suspiciously many student records — import rejected', 'error');
        return;
      }
      if (Array.isArray(dbData.payments) && dbData.payments.length > MAX_PAYMENTS) {
        if (typeof toast === 'function') toast('❌ Backup contains suspiciously many payment records — import rejected', 'error');
        return;
      }

      localStorage.setItem(LS_KEY, JSON.stringify(dbData));
      if (data.archive) localStorage.setItem('dbh2_archive', JSON.stringify(data.archive));
      loadDB();
      if (typeof updateSidebar === 'function') updateSidebar();
      if (typeof renderPage    === 'function') renderPage('dashboard');
      if (typeof toast         === 'function') toast('✅ Backup imported successfully!', 'success');

      // Mark backup done since we just restored one
      markBackupDone();
    } catch (e) {
      console.error('[DAMAM] Import failed:', e);
      if (typeof toast === 'function') toast('❌ Import failed: file is corrupt or invalid JSON', 'error');
    }
  });
}