/* ─── DAMAM HOSTEL — PRELOAD (Secure IPC Bridge) ───────────────────────────
   contextIsolation: true  |  nodeIntegration: false
   All renderer ↔ main communication goes through this file only.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Main app API (used by index.html / app.js) ─────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {

  // Backup & file
  onExportBackup: (cb) => ipcRenderer.on('export-backup', (_e, fp)   => cb(fp)),
  onImportBackup: (cb) => ipcRenderer.on('import-backup', (_e, json) => cb(json)),
  exportBackup:   (filePath, json) => ipcRenderer.send('write-file', filePath, json),
  onPdfSaved:     (cb) => ipcRenderer.on('pdf-saved', (_e, result)   => cb(result)),
  openExternal:   (url) => ipcRenderer.send('open-external', url),

  // License — basic
  licenseCheck:      ()    => ipcRenderer.invoke('license:check'),
  licenseActivate:   (key) => ipcRenderer.invoke('license:activate', key),
  licenseDeactivate: ()    => ipcRenderer.invoke('license:deactivate'),
  licenseMachineId:  ()    => ipcRenderer.invoke('license:machineId'),
  reloadApp:         ()    => ipcRenderer.invoke('license:loadApp'),

  // License — management (with native confirmation dialogs)
  licenseDeactivateWithDialog: () => ipcRenderer.invoke('license:deactivateWithDialog'),
  licenseReset:                () => ipcRenderer.invoke('license:reset'),
  licensePrepareUninstall:     () => ipcRenderer.invoke('license:prepareUninstall'),
  licenseOpenSettings:         () => ipcRenderer.invoke('license:openSettings'),

  // Receipt PDF
  receiptSavePDF: (htmlContent, suggestedName) =>
    ipcRenderer.invoke('receipt:savePDF', htmlContent, suggestedName)
});

// ── License page & settings window API ────────────────────────────────────
// Used by license.html AND license-settings.html
contextBridge.exposeInMainWorld('licenseAPI', {
  getMachineId:      ()    => ipcRenderer.invoke('license:machineId'),
  activateLicense:   (key) => ipcRenderer.invoke('license:activate', key),
  checkLicense:      ()    => ipcRenderer.invoke('license:check'),
  reloadApp:         ()    => ipcRenderer.invoke('license:loadApp'),
  // Management actions used by license-settings.html
  deactivateLicense: ()    => ipcRenderer.invoke('license:deactivateWithDialog'),
  resetLicense:      ()    => ipcRenderer.invoke('license:reset'),
  prepareUninstall:  ()    => ipcRenderer.invoke('license:prepareUninstall')
});
