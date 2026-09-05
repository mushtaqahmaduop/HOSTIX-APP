/* ─── HOSTYLLO — PRELOAD (Secure IPC Bridge — PATCHED) ────────────────
   contextIsolation: true  |  nodeIntegration: false
   All renderer ↔ main communication goes through this file only.

   SECURITY FIXES:
   FIX-P1  licenseActivate validates key is a string before sending to main.
   FIX-P2  receiptSavePDF validates htmlContent is string and suggestedName is safe.
   FIX-P3  openExternal validates url is a string (protocol validation in main.js).
   FIX-P4  writeFile (exportBackup) validates filePath is a non-empty string.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Main app API (used by index.html / app.js) ─────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {

  // Backup & file
  onExportBackup: (cb) => ipcRenderer.on('export-backup', (_e, fp)   => cb(fp)),
  onImportBackup: (cb) => ipcRenderer.on('import-backup', (_e, json) => cb(json)),

  // [FIX-P4] Validate filePath and json before sending
  exportBackup: (filePath, json) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      console.error('[Preload] exportBackup: invalid filePath');
      return;
    }
    if (typeof json !== 'string') {
      console.error('[Preload] exportBackup: data must be a string');
      return;
    }
    ipcRenderer.send('write-file', filePath, json);
  },

  onPdfSaved:   (cb) => ipcRenderer.on('pdf-saved', (_e, result)   => cb(result)),

  // [FIX-P3] Validate URL is a string before sending
  openExternal: (url) => {
    if (typeof url !== 'string' || url.length > 2048) {
      console.warn('[Preload] openExternal: invalid url');
      return;
    }
    ipcRenderer.send('open-external', url);
  },

  // License — basic
  licenseCheck: () => ipcRenderer.invoke('license:check'),

  /**
   * What the app is currently allowed to do — the licence state, whether it is
   * read-only, days remaining, and the message to show.
   *
   * The renderer uses this to render the banner and disable controls. It is NOT
   * the enforcement: the real gate is in the main process at the database IPC
   * boundary, because anything the renderer can choose not to do it can also
   * choose to do. This is the courtesy, not the lock.
   */
  licenseEnforcement: () => ipcRenderer.invoke('license:enforcement'),

  /** @param {(decision:object)=>void} cb @returns {()=>void} unsubscribe */
  onEnforcementChanged: (cb) => {
    if (typeof cb !== 'function') return () => {};
    // The IpcRendererEvent is never handed across — it carries a `sender` that
    // would widen this bridge well past a status snapshot.
    const listener = (_e, decision) => { try { cb(decision); } catch (_) {} };
    ipcRenderer.on('license:enforcementChanged', listener);
    return () => ipcRenderer.removeListener('license:enforcementChanged', listener);
  },

  // [FIX-P1] Validate key is a string before sending to main process
  licenseActivate: (key) => {
    if (typeof key !== 'string') {
      return Promise.resolve({ success: false, reason: 'Invalid key type.' });
    }
    const trimmed = key.trim().toUpperCase();
    if (trimmed.length === 0 || trimmed.length > 50) {
      return Promise.resolve({ success: false, reason: 'Invalid key format.' });
    }
    return ipcRenderer.invoke('license:activate', trimmed);
  },

  licenseDeactivate: () => ipcRenderer.invoke('license:deactivate'),
  licenseMachineId:  () => ipcRenderer.invoke('license:machineId'),
  reloadApp:         () => ipcRenderer.invoke('license:loadApp'),

  // License — management (with native confirmation dialogs)
  licenseDeactivateWithDialog: () => ipcRenderer.invoke('license:deactivateWithDialog'),
  licenseReset:                () => ipcRenderer.invoke('license:reset'),
  licensePrepareUninstall:     () => ipcRenderer.invoke('license:prepareUninstall'),
  licenseOpenSettings:         () => ipcRenderer.invoke('license:openSettings'),


  // ── SQLite DB API ─────────────────────────────────────────────────────────
  dbAll:         (table, where)      => ipcRenderer.invoke('db:all',         table, where),
  dbUpsert:      (table, id, record) => ipcRenderer.invoke('db:upsert',      table, id, record),
  dbDelete:      (table, id)         => ipcRenderer.invoke('db:delete',      table, id),
  dbBulkReplace: (table, records)    => ipcRenderer.invoke('db:bulkReplace', table, records),
  dbGetSetting:  (key)               => ipcRenderer.invoke('db:getSetting',  key),
  dbSetSetting:  (key, value)        => ipcRenderer.invoke('db:setSetting',  key, value),
  // §17. dbHealth answers even when the database does not open — that is the
  // situation it exists to describe — so it must never be gated on a live handle.
  dbHealth:        ()      => ipcRenderer.invoke('db:health'),
  recoveryList:    ()      => ipcRenderer.invoke('recovery:list'),
  recoveryRestore: (p)     => ipcRenderer.invoke('recovery:restore', p),
  recoveryRestart: ()      => ipcRenderer.invoke('recovery:restart'),
  dbExportFull:  ()                  => ipcRenderer.invoke('db:exportFull'),
  dbImportFull:  (data)              => ipcRenderer.invoke('db:importFull',  data),
  // Open PDF report in a separate window
  openPdfWindow: (htmlContent, title) => {
    if (typeof htmlContent !== 'string' || htmlContent.length > 2 * 1024 * 1024) {
      console.warn('[Preload] openPdfWindow: invalid content');
      return;
    }
    ipcRenderer.send('open-pdf-window', htmlContent, typeof title === 'string' ? title.slice(0, 200) : 'Report');
  },

  // [FIX-P2] Receipt PDF — validate htmlContent and suggestedName; supports opts {landscape}
  receiptSavePDF: (htmlContent, suggestedName, opts) => {
    if (typeof htmlContent !== 'string') {
      return Promise.resolve({ success: false, reason: 'Invalid HTML content.' });
    }
    if (htmlContent.length > 2 * 1024 * 1024) { // 2MB limit
      return Promise.resolve({ success: false, reason: 'Receipt content is too large.' });
    }
    // Sanitize suggestedName — keep only safe filename characters
    const safeName = (typeof suggestedName === 'string')
      ? suggestedName.replace(/[^a-zA-Z0-9._\- ]/g, '').slice(0, 100)
      : `Receipt_${new Date().toISOString().slice(0, 10)}.pdf`;
    // opts: { landscape: bool, pageSize: string }
    const safeOpts = (opts && typeof opts === 'object') ? {
      landscape: opts.landscape === true,
      pageSize:  typeof opts.pageSize === 'string' ? opts.pageSize : 'A4'
    } : {};
    return ipcRenderer.invoke('receipt:savePDF', htmlContent, safeName, safeOpts);
  }
});

// ── Custom title bar API (used by index.html AND license.html) ─────────────
// Frameless window controls + the File/View/Help actions, routed to the same
// main-process handlers the native accelerators use.
// The build's own version, for the login footer and for support calls. The
// renderer had no way to ask: it was printing DB.settings.version, a stored
// data field that has read 'v3.0' since long before this build.
contextBridge.exposeInMainWorld('appInfo', {
  version: () => ipcRenderer.invoke('app:version'),
});

contextBridge.exposeInMainWorld('titlebar', {
  minimize:         () => ipcRenderer.send('window:minimize'),
  toggleMaximize:   () => ipcRenderer.send('window:toggleMaximize'),
  close:            () => ipcRenderer.send('window:close'),
  isMaximized:      () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (cb) => {
    if (typeof cb === 'function') ipcRenderer.on('window:maximized', (_e, v) => cb(!!v));
  },
  isDev:            () => ipcRenderer.invoke('app:isDev'),
  menu:             (action) => {
    if (typeof action === 'string') ipcRenderer.send('titlebar:menu', action);
  }
});

// ── License page & settings window API ────────────────────────────────────
contextBridge.exposeInMainWorld('licenseAPI', {
  getMachineId:    ()    => ipcRenderer.invoke('license:machineId'),

  // [FIX-P1] Validate key in licenseAPI too
  activateLicense: (key) => {
    if (typeof key !== 'string' || key.trim().length === 0 || key.length > 50) {
      return Promise.resolve({ success: false, reason: 'Invalid key format.' });
    }
    return ipcRenderer.invoke('license:activate', key.trim().toUpperCase());
  },

  checkLicense:      ()    => ipcRenderer.invoke('license:check'),
  reloadApp:         ()    => ipcRenderer.invoke('license:loadApp'),
  deactivateLicense: ()    => ipcRenderer.invoke('license:deactivateWithDialog'),
  resetLicense:      ()    => ipcRenderer.invoke('license:reset'),
  prepareUninstall:  ()    => ipcRenderer.invoke('license:prepareUninstall')
});

// ── Online status API (Phase 1 — spec §3.5, §7, §29) ──────────────────────
// Read-only and deliberately tiny. The renderer cannot supply a URL, a method,
// a header or a payload; it can ask what the connection looks like and
// subscribe to changes. All outbound HTTP stays in the main process, behind
// the renderer's `connect-src 'self'` CSP.
//
// Shape returned by getStatus():
//   { networkAvailable, apiReachable, authenticated, licenseValid,
//     mode: 'unconfigured'|'offline'|'degraded'|'online',
//     reason, lastCheckedAt, lastSuccessAt, consecutiveFailures, configured }
contextBridge.exposeInMainWorld('online', {
  getStatus:  () => ipcRenderer.invoke('online:getStatus'),
  checkNow:   () => ipcRenderer.invoke('online:checkNow'),
  queueStats: () => ipcRenderer.invoke('online:queueStats'),
  getLastSuccessfulConnection: () => ipcRenderer.invoke('online:lastSuccess'),

  // Phase 2 diagnostics. A description of this machine's entitlement —
  // state, expiry, which key signed it — and never the signed token itself,
  // which is a credential and has no business in the renderer.
  // `enforced: false` until device registration exists; nothing gates on this.
  entitlement: () => ipcRenderer.invoke('online:entitlement'),

  /** @param {(status:object)=>void} cb @returns {()=>void} unsubscribe */
  onStatusChanged: (cb) => {
    if (typeof cb !== 'function') return () => {};
    // The IpcRendererEvent is never handed to the renderer — it carries a
    // `sender` that would widen this bridge well past a status snapshot.
    const listener = (_e, status) => { try { cb(status); } catch (_) {} };
    ipcRenderer.on('online:statusChanged', listener);
    return () => ipcRenderer.removeListener('online:statusChanged', listener);
  }
});