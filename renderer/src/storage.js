/* ─── HOSTYLLO — STORAGE / DATABASE (v4.0 — SQLite via better-sqlite3) ─────────
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
  /* ONE REGISTER (owner, 2026-09-21). `issues` is the live collection; the
     other two are kept so a restore of a pre-merge backup has somewhere to
     land, and as migration 003's rollback path. Nothing reads them. */
  maintenance:   'maintenance',
  complaints:    'complaints',
  issues:        'issues',
  checkinlog:    'checkinlog',
  notices:       'notices',
  fines:         'fines',
  activityLog:   'activitylog',
  inspections:   'inspections',
  billSplits:    'billsplits',
  transfers:     'transfers',
  archive:       'archive',
  // Warden ledger step 4 — ordinary mutable tables (statuses move), unlike the ledger.
  wardenCollections: 'warden_collections',
  handovers:         'handovers',
  handoverItems:     'handover_items',
  // Warden ledger step 8 — standing concessions: requested, decided, ended.
  concessions:       'concessions',
  // Owner Funds (2026-09-28) — money between the owner and the hostel.
  ownerFunds:        'owner_funds'
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
        console.info('[HOSTYLLO] Migrating localStorage → SQLite...');
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
          console.info('[HOSTYLLO] Migration complete.');
          setTimeout(function () {
            if (typeof toast === 'function')
              toast('Data migrated to SQLite — faster and safer.', 'success', 'Upgraded');
          }, 1500);
        } catch (e) {
          console.error('[HOSTYLLO] Migration failed:', e);
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
    // The student ledger has its own channel and is not in _TABLE_MAP: that
    // map's save path upserts and deletes, and the ledger refuses both.
    if (window.electronAPI.ledgerAll) {
      const led = await window.electronAPI.ledgerAll();
      DB.studentLedger = (led && Array.isArray(led.entries)) ? led.entries : [];
    }

  } else {
    // Fallback: no Electron API (browser dev mode)
    _loadFromLocalStorage();
  }

  /* A FOLD DONE HERE MUST REACH THE DISK (bug audit BUG-013, 2026-09-28).
     _initDBFields() folds a pre-merge maintenance/complaints shape into
     `issues` and stamps settings.issuesMergedAt. The snapshot below is taken
     AFTER that, so the folded rows looked already saved and were never
     written — while the stamp, in settings, was saved by the next saveDB().
     Restart: no issues, and the stamp stops the fold from ever running again.
     Reproduced by restoring a pre-merge backup. Forgetting only the rows the
     fold added (not ones already on disk, whose deletes must still be seen)
     makes the next save write them alongside the stamp. */
  const _foldPending = !(DB.settings && DB.settings.issuesMergedAt);
  const _issuesOnDisk = new Set((DB.issues || []).map(r => r && r.id));
  if (typeof _initDBFields === 'function') DB = _initDBFields(DB);
  if (typeof ledgerLoaded === 'function') ledgerLoaded();
  _takeFullSnapshot();
  if (_foldPending && _dbSnapshot.issues) {
    for (const id of Array.from(_dbSnapshot.issues.keys())) if (!_issuesOnDisk.has(id)) _dbSnapshot.issues.delete(id);
  }
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
    console.error('[HOSTYLLO] localStorage fallback load failed:', e);
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
/* ── WHAT THIS SAVE CHANGES ──────────────────────────────────────────────────
   The diff the surgical save has always computed, lifted out so it can be sent
   as one changeset instead of driven as a loop of IPC calls. `remove` rather
   than `delete`, which is a reserved word and reads badly as a property.     */
function _buildChangeset() {
  const tables = {};
  let n = 0;
  for (const [dbKey, table] of Object.entries(_TABLE_MAP)) {
    const prev = _dbSnapshot[dbKey] || new Map();
    const cur  = DB[dbKey] || [];
    const seen = new Set();
    const upsert = [], remove = [];
    for (const r of cur) {
      if (!r || r.id == null) continue;
      seen.add(r.id);
      if (prev.get(r.id) !== JSON.stringify(r)) upsert.push(r);
    }
    for (const id of prev.keys()) if (!seen.has(id)) remove.push(id);
    if (upsert.length || remove.length) { tables[table] = { upsert, remove }; n += upsert.length + remove.length; }
  }
  return { tables, count: n };
}

async function saveDB() {
  if (typeof enforceDataRetention === 'function') enforceDataRetention();

  /* ── ONE SAVE, ONE TRANSACTION (finance Phase 7, audit G10) ────────────────
     This walked the tables and awaited an IPC call PER CHANGED ROW, then the
     settings, then the ledger — each its own implicit transaction. A crash, a
     power cut or a licence refusal partway through left some of the save on
     disk and the rest gone: a payment written while the student's balance was
     not, or money recorded with no ledger entry behind it.

     The whole save now goes as one changeset, applied inside a single
     db.transaction() in the main process. The ledger travels with it, so the
     records and the entries that explain them commit together or not at all.

     THE OLD PATH IS KEPT BELOW, not deleted: an installed build whose preload
     predates this channel still has to be able to save. */
  if (window.electronAPI && window.electronAPI.dbApplyChangeset) {
    try {
      const cs = _buildChangeset();
      const pending = (typeof ledgerPending === 'function') ? ledgerPending() : [];
      const res = await window.electronAPI.dbApplyChangeset({
        tables: cs.tables, settings: DB.settings, ledger: pending,
      });
      /* A REFUSAL IS NOT A REASON TO FALL BACK. The main process answering
         ok:false is a decision — the licence blocks this table, the file is
         damaged, the ledger will not have history rewritten — and the whole
         transaction has already rolled back. Retrying it down the full-rewrite
         path would write every table with dbBulkReplace and only THEN hit the
         same refusal, leaving on disk exactly the records the refusal existed
         to prevent. The fallback below is for a broken CHANNEL, not a No. */
      if (res && res.ok === false) {
        console.error('[HOSTYLLO] save refused:', res.error, res.code || '');
        _showSaveFailure(res.error);
        return false;
      }
      if (!res) throw new Error('The save got no answer.');
      // Only once the transaction has committed. Dropping these earlier would
      // lose the only immutable record of a money movement on a failed save.
      if (pending.length && typeof ledgerMarkFlushed === 'function') ledgerMarkFlushed(pending.length);
      _takeFullSnapshot();
      _clearSaveFailure();
      if (typeof updateSidebar         === 'function') updateSidebar();
      if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
      return true;
    } catch (e) {
      // The channel itself broke — not an answer, so there is nothing to trust
      // about what is on disk. The full rewrite is the safety net for that.
      console.error('[HOSTYLLO] changeset save could not be sent, rewriting in full:', e);
      return _saveDBFull();
    }
  }

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
      // New ledger entries go with the save that carries their records. A
      // refusal throws, and the fallback below tries once more before the
      // not-saved bar is raised; the entries stay queued either way.
      if (typeof ledgerFlush === 'function') await ledgerFlush();

      _takeFullSnapshot();
      _clearSaveFailure();
      if (typeof updateSidebar         === 'function') updateSidebar();
      if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
      return true;
    } catch (e) {
      console.error('[HOSTYLLO] surgical saveDB failed, falling back to full rewrite:', e);
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
      if (typeof ledgerFlush === 'function') await ledgerFlush();

      _takeFullSnapshot();
      _clearSaveFailure();
      if (typeof updateSidebar         === 'function') updateSidebar();
      if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
      return true;
    } catch (e) {
      console.error('[HOSTYLLO] SQLite saveDB failed:', e);
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
    console.error('[HOSTYLLO] localStorage save failed:', e);
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

  /* A REPORT THAT COULD NOT BE OPENED SAYS SO (owner brief, 2026-09-10). The
     main process used to return in silence when it refused a document, so the
     button did nothing at all and there was nowhere to look — which is the
     "no response" the brief describes. */
  if (window.electronAPI.onPdfFailed) {
    window.electronAPI.onPdfFailed(function (reason) {
      if (typeof toast === 'function') {
        toast(reason || 'That report could not be opened.', 'error', 'Report');
      }
    });
  }

  window.electronAPI.onImportBackup(async function (jsonString) {
    try {
      if (typeof jsonString !== 'string' || jsonString.length > 50 * 1024 * 1024) {
        if (typeof toast === 'function') toast('Backup file is too large or invalid', 'error');
        return;
      }
      const data = JSON.parse(jsonString);
      const r = await importBackupData(data.db || data);
      if (r.ok) {
        if (typeof renderPage === 'function') renderPage('dashboard');
        if (typeof toast === 'function') toast('Backup imported successfully', 'success');
      }
    } catch (e) {
      console.error('[HOSTYLLO] Import failed:', e);
      if (typeof toast === 'function') toast('Import failed: ' + e.message, 'error');
    }
  });
}

/* ── ONE RESTORE (bug audit BUG-009, 2026-09-28) ───────────────────────────────
   There were three ways to put a backup back — File → Import, the Backup
   page's "Restore this file", and pasted JSON — and only the first went through
   the main process's db:importFull: validate, snapshot the live database to a
   *.pre-restore-*.bak, replace every table in one transaction. The other two
   replaced DB in memory and saved it like any edit: no safety copy, and only a
   rooms/students/settings presence check instead of validateBackup(). A wrong
   or old file restored from the Backup page could not be undone.

   Every path calls this now. It validates (the shared validator, plus size
   limits), hands the document to db:importFull, and reloads from disk — so what
   is on screen afterwards is what the database actually holds. Returns
   {ok, reason, preRestoreBackup}; refusals are toasted here. */
async function importBackupData(dbData) {
  const fail = (reason, title) => {
    if (typeof toast === 'function') toast(reason, 'error', title);
    return { ok: false, reason: reason };
  };
  if (!dbData || typeof dbData !== 'object') return fail('Invalid backup file — not a Hostyllo backup');
  if (!Array.isArray(dbData.rooms) || !Array.isArray(dbData.students)) {
    return fail('Invalid backup file — it has no rooms or students');
  }
  if (typeof validateBackup === 'function') {
    const check = validateBackup(dbData);
    if (!check.ok) {
      if (typeof logActivity === 'function') logActivity('Backup Import Rejected', check.reason, 'Settings');
      return fail(check.reason, 'Backup rejected');
    }
  }
  const MAX_STUDENTS = 10000, MAX_PAYMENTS = 100000;
  if (dbData.students.length > MAX_STUDENTS) return fail('Backup contains too many student records');
  if (Array.isArray(dbData.payments) && dbData.payments.length > MAX_PAYMENTS) {
    return fail('Backup contains too many payment records');
  }
  if (!window.electronAPI || !window.electronAPI.dbImportFull) return fail('Restore is only available in the desktop app');

  /* NUMBERS ALREADY HANDED OUT STAY HANDED OUT (bug audit BUG-014, 2026-09-28).
     A restore replaces settings wholesale, so restoring last week's file put
     receiptCounter back to last week's value and the next receipt reused a
     number already printed on paper. The same held for studentSeq (BUG-008's
     counter). Each counter keeps the higher of this PC's and the file's. */
  const _cs = (typeof DB !== 'undefined' && DB && DB.settings) || {};
  const _highWater = { receiptCounter: Number(_cs.receiptCounter) || 0, studentSeq: Number(_cs.studentSeq) || 0 };
  const result = await window.electronAPI.dbImportFull(dbData);
  if (!result || !result.ok) return fail('Import failed: ' + ((result && result.error) || 'unknown error'));
  await loadDB();
  if (DB.settings) {
    let raised = false;
    for (const k of Object.keys(_highWater)) {
      if ((Number(DB.settings[k]) || 0) < _highWater[k]) { DB.settings[k] = _highWater[k]; raised = true; }
    }
    if (raised) await saveDB();
  }
  // A backup from before the ledger restores an empty one; rebuild it from
  // the records that were just restored.
  if (typeof ledgerImportIfEmpty === 'function' && ledgerImportIfEmpty() > 0) await saveDB();
  if (typeof handoverSync === 'function' && handoverSync() > 0) await saveDB();
  if (typeof updateSidebar === 'function') updateSidebar();
  markBackupDone();
  return { ok: true, preRestoreBackup: result.preRestoreBackup || null };
}
