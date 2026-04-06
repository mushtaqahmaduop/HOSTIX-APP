// ════════════════════════════════════════════════════════════════════════════
// DAMAM Boys Hostel — Main Process  (Merged v3 — SECURITY PATCHED)
//
// SECURITY FIXES APPLIED:
//  FIX-01  write-file IPC validates path — only allowed dirs (downloads/docs/desktop)
//  FIX-02  open-external IPC whitelists protocols (https/http/whatsapp/mailto only)
//  FIX-03  license:activate rate-limited to 5 attempts per 60 seconds
//  FIX-04  Machine ID: hostname removed (unstable), drive serial added (stable)
//  FIX-05  Machine ID cached — avoids repeated scryptSync calls on startup
//  FIX-06  activatedAt check — rejects time rollback before activation date
//  FIX-07  Error messages sanitized — internal paths not sent to renderer
//  FIX-08  Import backup file size limited to 50MB
//  FIX-09  receipt:savePDF validates htmlContent is string and < 2MB
//  FIX-10  license:activate validates key is string and < 50 chars
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const os     = require('os');

let mainWindow;

// Hex-encoded secret — MUST match _SECRET in keygen.js exactly
const _SECRET = Buffer.from(
  '44344d344d5f483053543333545f5333435233545f5334344c545f7631', 'hex'
).toString();

const LICENSE_PATH  = path.join(app.getPath('userData'), 'license.enc');
const LAST_RUN_PATH = path.join(app.getPath('userData'), 'last_run.dat');

const IS_PROD = !process.argv.includes('--dev');

// Anti-Debug: block --inspect / --inspect-brk in production
if (IS_PROD && process.argv.some(a => /^--inspect(-brk)?/.test(a))) {
  process.stderr.write('[DAMAM] Debugger attachment not permitted in production.\n');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// [FIX-04 + FIX-05] Machine Fingerprint
// hostname REMOVED — too easy to change/spoof, breaks legit users on rename.
// DriveSerial ADDED — stable hardware-level binding.
// Result is cached to avoid repeated slow calls.
// ─────────────────────────────────────────────────────────────────────────────
let _cachedMachineId = null;

function _getWinMachineGuid() {
  if (os.platform() !== 'win32') return '';
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: 'utf8', timeout: 2000, windowsHide: true }
    );
    const m = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/);
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}

function _getDriveSerial() {
  // [FIX-04] Add drive serial for stronger, stable hardware binding
  if (os.platform() !== 'win32') return '';
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      'wmic diskdrive get SerialNumber /format:list',
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    );
    const m = out.match(/SerialNumber=([^\r\n]+)/);
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}

function getMachineId() {
  if (_cachedMachineId) return _cachedMachineId; // [FIX-05] use cached value
  try {
    const raw = [
      // hostname intentionally excluded — see FIX-04
      os.platform(),
      os.arch(),
      (os.cpus()[0] && os.cpus()[0].model) || 'cpu',
      _getWinMachineGuid(),
      _getDriveSerial()
    ].join('|');
    _cachedMachineId = crypto.createHash('sha256').update(raw).digest('hex');
  } catch (e) {
    _cachedMachineId = 'UNKNOWN_MACHINE_ID_FALLBACK_' + '0'.repeat(36);
  }
  return _cachedMachineId;
}

// ── AES-256-CBC Encrypt / Decrypt with HMAC Tamper Detection ─────────────────
function encryptLicense(data, machineId) {
  const aesKey    = crypto.scryptSync(machineId + _SECRET, 'damam_salt_v1', 32);
  const iv        = crypto.randomBytes(16);
  const cipher    = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const hmac      = crypto.createHmac('sha256', aesKey).update(encrypted).digest();
  return Buffer.concat([iv, hmac, encrypted]).toString('base64');
}

function decryptLicense(encStr, machineId) {
  const buf = Buffer.from(encStr, 'base64');
  if (buf.length < 49) throw new Error('CORRUPT');
  const iv         = buf.slice(0,  16);
  const storedHmac = buf.slice(16, 48);
  const encrypted  = buf.slice(48);
  const aesKey     = crypto.scryptSync(machineId + _SECRET, 'damam_salt_v1', 32);
  const calcHmac   = crypto.createHmac('sha256', aesKey).update(encrypted).digest();
  if (!crypto.timingSafeEqual(storedHmac, calcHmac)) throw new Error('TAMPERED');
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString());
}

// ── Key Validation ────────────────────────────────────────────────────────────
function _validateKeyFormat(key) {
  return /^HOSTEL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.toUpperCase().trim());
}

function _validateKeyChecksum(key) {
  try {
    const parts    = key.toUpperCase().trim().split('-');
    const expPart  = parts[1];
    const chk      = parts[2] + parts[3];
    const expected = crypto.createHmac('sha256', _SECRET)
      .update(expPart).digest('hex').toUpperCase().slice(0, 8);
    return chk === expected;
  } catch (e) { return false; }
}

function _getExpiryFromKey(key) {
  const expPart = key.toUpperCase().trim().split('-')[1];
  const months  = parseInt(expPart, 36);
  return new Date(Math.floor(months / 12), months % 12 + 1, 0);
}

// ── Anti-Time-Cheat ───────────────────────────────────────────────────────────
function _readLastRun() {
  try {
    if (fs.existsSync(LAST_RUN_PATH)) {
      const d = new Date(fs.readFileSync(LAST_RUN_PATH, 'utf8').trim());
      if (!isNaN(d.getTime())) return d;
    }
    if (fs.existsSync(LICENSE_PATH)) _writeLastRun();
  } catch (e) {}
  return null;
}

function _writeLastRun() {
  try { fs.writeFileSync(LAST_RUN_PATH, new Date().toISOString(), 'utf8'); } catch (e) {}
}

// ── Full Startup Validation ───────────────────────────────────────────────────
function checkLicenseValidity() {
  if (!fs.existsSync(LICENSE_PATH)) {
    return { valid: false, reason: 'not_activated',
      message: 'No license found on this device. Please activate your license to continue.' };
  }

  let data;
  try {
    data = decryptLicense(fs.readFileSync(LICENSE_PATH, 'utf8'), getMachineId());
  } catch (e) {
    if (e.message === 'TAMPERED') {
      return { valid: false, reason: 'tampered',
        message: 'License file has been modified or is corrupted.\nPlease contact support to reactivate.' };
    }
    return { valid: false, reason: 'corrupt',
      message: 'License file cannot be read.\nPlease delete it and reactivate, or contact support.' };
  }

  if (data.machineId !== getMachineId()) {
    return { valid: false, reason: 'wrong_machine',
      message: 'This license is registered to a different computer.\nContact support if you changed hardware.' };
  }

  if (!_validateKeyChecksum(data.key)) {
    return { valid: false, reason: 'tampered',
      message: 'License key has been tampered with.\nPlease contact support for reactivation.' };
  }

  const expiry = new Date(data.expiry);
  const now    = new Date();
  if (now > expiry) {
    const expStr = expiry.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
    return { valid: false, reason: 'expired',
      message: `Your license expired on ${expStr}.\nPlease contact support to renew.`,
      expiry: data.expiry };
  }

  // [FIX-06] Reject if clock is rolled back before activation date (> 1 day tolerance)
  if (data.activatedAt) {
    const activatedAt = new Date(data.activatedAt);
    if (!isNaN(activatedAt.getTime()) && now < new Date(activatedAt.getTime() - 86400000)) {
      return { valid: false, reason: 'time_cheat',
        message: `System time is set before this license's activation date.\nPlease set your clock to the correct time and restart.` };
    }
  }

  const lastRun = _readLastRun();
  if (lastRun && now < lastRun) {
    return { valid: false, reason: 'time_cheat',
      message: `System time manipulation detected.\n\nSystem time : ${now.toLocaleString()}\nLast run     : ${lastRun.toLocaleString()}\n\nSet your system clock to the correct time and restart.` };
  }

  _writeLastRun();

  return { valid: true, key: data.key, expiry: data.expiry,
    machineId: data.machineId, activatedAt: data.activatedAt };
}

// ── Activate License ──────────────────────────────────────────────────────────
function activateLicense(key) {
  const k = key.toUpperCase().trim();
  if (!_validateKeyFormat(k))
    return { success: false, reason: 'Invalid key format. Expected: HOSTEL-XXXX-XXXX-XXXX' };
  if (!_validateKeyChecksum(k))
    return { success: false, reason: 'Invalid license key — signature mismatch. Check the key and try again.' };
  const expiry = _getExpiryFromKey(k);
  if (new Date() > expiry) {
    const expStr = expiry.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
    return { success: false, reason: `This key expired on ${expStr}. Contact support for a new key.` };
  }
  try {
    const machineId   = getMachineId();
    const licenseData = { key: k, machineId, expiry: expiry.toISOString(),
      activatedAt: new Date().toISOString() };
    fs.writeFileSync(LICENSE_PATH, encryptLicense(licenseData, machineId), 'utf8');
    _writeLastRun();
    return {
      success: true,
      message: 'License activated successfully!',
      expiry:  expiry.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' }),
      lifetime: false
    };
  } catch (e) {
    // [FIX-07] Do NOT expose internal file paths in the error message sent to renderer
    console.error('[DAMAM] License write error:', e.message);
    return { success: false, reason: 'Could not save license file. Please check app permissions or contact support.' };
  }
}

function deactivateLicense() {
  try {
    if (fs.existsSync(LICENSE_PATH))  fs.unlinkSync(LICENSE_PATH);
    if (fs.existsSync(LAST_RUN_PATH)) fs.unlinkSync(LAST_RUN_PATH);
    _cachedMachineId = null; // [FIX-05] clear cache on deactivation
    return { success: true };
  } catch (e) {
    return { success: false, message: 'Could not remove license files. Please contact support.' };
  }
}

function openLicenseSettings() {
  if (!mainWindow) return;
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'license-settings.html'));
}

// ════════════════════════════════════════════════════════════════════════════
// WINDOW
// ════════════════════════════════════════════════════════════════════════════
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'HOSTIX — Hostel Management System',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !IS_PROD
    },
    backgroundColor: '#060c18',
    show: false
  });

  const lic = checkLicenseValidity();

  if (lic.valid) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'license.html'), {
      query: { reason: lic.reason, message: encodeURIComponent(lic.message) }
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();

    if (IS_PROD) {
      mainWindow.webContents.on('before-input-event', (_evt, input) => {
        const k = input.key.toUpperCase();
        const blocked =
          k === 'F12' ||
          (input.control && input.shift && ['I', 'J', 'C'].includes(k)) ||
          (input.control && k === 'U');
        if (blocked) _evt.preventDefault();
      });
    }
  });

  const viewSubmenu = [
    { role: 'resetZoom' },
    { role: 'zoomIn',  accelerator: 'CmdOrCtrl+=' },
    { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Full Screen', accelerator: 'F11' }
  ];

  if (!IS_PROD) {
    viewSubmenu.unshift(
      { role: 'reload',         label: 'Reload',          accelerator: 'CmdOrCtrl+R' },
      { role: 'forceReload',    label: 'Force Reload',    accelerator: 'CmdOrCtrl+Shift+R' },
      { role: 'toggleDevTools', label: 'Developer Tools', accelerator: 'F12' },
      { type: 'separator' }
    );
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Export Backup…',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            if (!mainWindow) return;
            const { filePath } = await dialog.showSaveDialog(mainWindow, {
              title: 'Export Backup',
              defaultPath: `DAMAM_Backup_${new Date().toISOString().slice(0, 10)}.json`,
              filters: [{ name: 'JSON Backup', extensions: ['json'] }]
            });
            if (filePath) mainWindow.webContents.send('export-backup', filePath);
          }
        },
        {
          label: 'Import Backup…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const { filePaths } = await dialog.showOpenDialog(mainWindow, {
              title: 'Import Backup',
              filters: [{ name: 'JSON Backup', extensions: ['json'] }],
              properties: ['openFile']
            });
            if (filePaths && filePaths[0]) {
              try {
                // [FIX-08] Limit file size to 50MB to prevent memory exhaustion
                const stat = fs.statSync(filePaths[0]);
                if (stat.size > 50 * 1024 * 1024) {
                  dialog.showErrorBox('Import Failed', 'Backup file is too large (maximum 50MB).');
                  return;
                }
                const data = fs.readFileSync(filePaths[0], 'utf8');
                mainWindow.webContents.send('import-backup', data);
              } catch (e) {
                dialog.showErrorBox('Import Failed', 'Could not read the backup file.');
              }
            }
          }
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    { label: 'View', submenu: viewSubmenu },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About DAMAM Hostel',
          click: () => {
            if (!mainWindow) return;
            dialog.showMessageBox(mainWindow, {
              type: 'info', title: 'About',
              message: 'DAMAM Boys Hostel Management System',
              detail: 'Version 3.0 (Security Patched)\n4/1 Kakakhel Street, Danishabad Shaheen Town, Peshawar\n\nOffline app — all data stored locally on this device.\nDeveloped by: MUSHTAQ AHMAD'
            });
          }
        },
        { label: 'License Settings', click: () => openLicenseSettings() },
        {
          label: 'License Info',
          click: () => {
            if (!mainWindow) return;
            const result    = checkLicenseValidity();
            const machineId = getMachineId();
            dialog.showMessageBox(mainWindow, {
              type: result.valid ? 'info' : 'warning',
              title: 'License Information',
              message: result.valid ? '✅ License Active' : '❌ License Problem',
              detail: [
                `Status   : ${result.valid ? 'Active' : 'INVALID'}`,
                `Reason   : ${result.valid ? 'All checks passed' : result.reason}`,
                `Expiry   : ${result.expiry ? new Date(result.expiry).toLocaleDateString('en-PK') : '—'}`,
                `Machine  : ${machineId.slice(0, 16)}…`,
                `Activated: ${result.activatedAt ? new Date(result.activatedAt).toLocaleDateString('en-PK') : '—'}`
              ].join('\n')
            });
          }
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ════════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ════════════════════════════════════════════════════════════════════════════

ipcMain.handle('license:check', () => {
  const result = checkLicenseValidity();
  return { ...result, valid: result.valid };
});

// [FIX-03] Rate-limited license:activate — max 5 attempts per 60 seconds
const _licRateLimit = { times: [] };
ipcMain.handle('license:activate', (_e, key) => {
  const now = Date.now();
  _licRateLimit.times = _licRateLimit.times.filter(t => now - t < 60000);
  if (_licRateLimit.times.length >= 5) {
    const waitSec = Math.ceil((_licRateLimit.times[0] + 60000 - now) / 1000);
    return { success: false, reason: `Too many activation attempts. Please wait ${waitSec} seconds.` };
  }
  _licRateLimit.times.push(now);
  // [FIX-10] Validate key input type and length before processing
  if (typeof key !== 'string' || key.length > 50) {
    return { success: false, reason: 'Invalid key format.' };
  }
  return activateLicense(key);
});

ipcMain.handle('license:deactivate', () => deactivateLicense());

ipcMain.handle('license:deactivateWithDialog', async () => {
  if (!mainWindow) return { success: false, reason: 'No main window' };
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Deactivate License',
    message: 'Deactivate this license?',
    detail: [
      'This will remove the license from this computer.',
      'You will need a new license key to use the app again.',
      '',
      'If you are moving to a new computer, contact your software',
      'provider first so they can issue a key for the new machine.'
    ].join('\n'),
    buttons: ['Cancel', 'Deactivate'],
    defaultId: 0, cancelId: 0
  });
  if (response !== 1) return { success: false, cancelled: true };
  const result = deactivateLicense();
  if (result.success && mainWindow) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'license.html'), {
      query: { reason: 'not_activated', message: encodeURIComponent('License deactivated. Please enter a new license key.') }
    });
  }
  return result;
});

ipcMain.handle('license:reset', async () => {
  if (!mainWindow) return { success: false, reason: 'No main window' };
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Full License Reset',
    message: 'Reset everything?',
    detail: [
      'This will permanently:',
      '  • Delete the license file',
      '  • Clear the last-run timestamp',
      '  • Reset all activation state',
      '',
      'The app will return to the activation screen.',
      'You will need a new license key to continue.'
    ].join('\n'),
    buttons: ['Cancel', 'Reset Everything'],
    defaultId: 0, cancelId: 0
  });
  if (response !== 1) return { success: false, cancelled: true };
  const result = deactivateLicense();
  if (result.success && mainWindow) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'license.html'), {
      query: { reason: 'not_activated', message: encodeURIComponent('License has been fully reset. Please enter your license key.') }
    });
  }
  return result;
});

ipcMain.handle('license:prepareUninstall', async () => {
  if (!mainWindow) return { success: false, reason: 'No main window' };
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Prepare for Uninstall',
    message: 'Clear all license data before uninstalling?',
    detail: [
      'This will delete license and activation files.',
      '',
      'After this, uninstall the app normally from',
      'Windows Settings → Apps & Features.',
      '',
      'Contact your provider if you need the license',
      'transferred to another machine.'
    ].join('\n'),
    buttons: ['Cancel', 'Clear & Prepare'],
    defaultId: 0, cancelId: 0
  });
  if (response !== 1) return { success: false, cancelled: true };

  const results = [];
  for (const p of [LICENSE_PATH, LAST_RUN_PATH]) {
    try {
      if (fs.existsSync(p)) { fs.unlinkSync(p); results.push({ file: path.basename(p), deleted: true }); }
      else results.push({ file: path.basename(p), deleted: false, note: 'Already absent' });
    } catch (e) { results.push({ file: path.basename(p), deleted: false, error: 'Permission denied' }); }
  }

  await dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Ready to Uninstall',
    message: '✅ License data cleared',
    detail: 'You can now safely uninstall the app from\nWindows Settings → Apps & Features.\n\nThank you for using DAMAM Hostel Management!'
  });

  return { success: true, results };
});

ipcMain.handle('license:openSettings', () => openLicenseSettings());
ipcMain.handle('license:machineId', () => getMachineId());

ipcMain.handle('license:loadApp', () => {
  if (!mainWindow) return;
  const lic = checkLicenseValidity();
  if (lic.valid) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'license.html'), {
      query: { reason: lic.reason, message: encodeURIComponent(lic.message) }
    });
  }
});

// [FIX-09] Receipt PDF — validate htmlContent before processing; supports landscape option
ipcMain.handle('receipt:savePDF', async (_e, htmlContent, suggestedName, opts) => {
  if (!mainWindow) return { success: false, reason: 'No main window' };

  if (typeof htmlContent !== 'string' || htmlContent.length > 2 * 1024 * 1024) {
    return { success: false, reason: 'Invalid receipt content.' };
  }

  const landscape = !!(opts && opts.landscape);
  const pageSize  = (opts && opts.pageSize) || 'A4';
  const marginsMM = landscape
    ? { top: 10, bottom: 10, left: 12, right: 12 }
    : { top: 18, bottom: 18, left: 18, right: 18 };

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF',
    defaultPath: suggestedName || `Report_${new Date().toISOString().slice(0, 10)}.pdf`,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return { success: false, reason: 'cancelled' };

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  try {
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    const pdfData = await pdfWin.webContents.printToPDF({
      pageSize, printBackground: true, landscape,
      margins: marginsMM
    });
    fs.writeFileSync(filePath, pdfData);
    return { success: true, filePath };
  } catch (e) {
    console.error('[DAMAM] PDF generation failed:', e.message);
    return { success: false, reason: 'PDF generation failed. Please try again.' };
  } finally {
    pdfWin.destroy();
  }
});

// [FIX-02] open-external — whitelist allowed protocols
ipcMain.on('open-external', (_e, url) => {
  const ALLOWED_PROTOCOLS = ['https:', 'http:', 'whatsapp:', 'mailto:'];
  try {
    if (typeof url !== 'string' || url.length > 2048) {
      console.warn('[DAMAM] open-external: rejected (invalid type or length)');
      return;
    }
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      console.warn('[DAMAM] open-external: blocked protocol:', parsed.protocol);
      return;
    }
    shell.openExternal(url).catch(e => console.error('[DAMAM] open-external failed:', e.message));
  } catch (e) {
    console.error('[DAMAM] open-external: invalid URL:', e.message);
  }
});

// [FIX-01] write-file — only allow writing to user-approved directories
ipcMain.on('write-file', (_e, filePath, data) => {
  // Validate input types
  if (typeof filePath !== 'string' || typeof data !== 'string') {
    if (mainWindow) mainWindow.webContents.send('pdf-saved', { success: false, error: 'Invalid parameters.' });
    return;
  }

  const norm = path.normalize(filePath);
  const sep  = path.sep;
  const ALLOWED_DIRS = [
    path.normalize(app.getPath('downloads')),
    path.normalize(app.getPath('documents')),
    path.normalize(app.getPath('desktop')),
    path.normalize(app.getPath('temp')),
  ];

  const isAllowed = ALLOWED_DIRS.some(dir => norm.startsWith(dir + sep) || norm === dir);
  if (!isAllowed) {
    console.error('[DAMAM] write-file: blocked unauthorized path:', norm);
    if (mainWindow) mainWindow.webContents.send('pdf-saved', {
      success: false, error: 'File location not permitted. Please choose Downloads, Documents, or Desktop.'
    });
    return;
  }

  try {
    fs.writeFileSync(filePath, data, 'utf8');
    if (mainWindow) mainWindow.webContents.send('pdf-saved', { success: true, filePath });
  } catch (e) {
    console.error('[DAMAM] write-file failed:', e.message);
    if (mainWindow) mainWindow.webContents.send('pdf-saved', {
      success: false, error: 'Could not save file. Check folder permissions.' // [FIX-07]
    });
  }
});

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const { session } = require('electron');
  const ALLOWED_PERMS = ['clipboard-read', 'clipboard-sanitized-write'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMS.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMS.includes(permission);
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});