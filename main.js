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
//  FIX-11  Context menu (right-click → Inspect) blocked in production
//  FIX-12  Removed duplicate _readLastRun() (buggy async version) and duplicate _writeLastRun()
//  FIX-13  db:all column name whitelisted — prevents SQL injection via where[0]
//  FIX-14  BIOS serial added as 6th machine ID factor (harder to spoof than registry/drive)
//  FIX-15  Clock-rollback tolerance reduced from 1 day to 5 minutes
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const os = require('os');
// ── SQLite Database ───────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const migration001 = require('./migrations/001-relational-schema');
let db = null;
let _schemaMigrated = false;

// ── Online services (Phase 1) ─────────────────────────────────────────────────
// Connectivity, API client, durable queue, structured logging. Inert until a
// control plane URL is configured — see services/config.js.
const onlineServices = require('./services');
const appLogger = require('./services/logger');
const enforcement = require('./services/enforcement');
let online = null;

// Insert/replace a row, populating the promoted typed columns for the tables that
// have them (post-migration) and falling back to (id, data) otherwise — so writes
// work identically before and after the relational-schema migration.
function _dbInsert(table, id, record) {
  if (_schemaMigrated && migration001.PROMOTED[table]) {
    const rec = Object.assign({}, record, { id: (record && record.id != null) ? record.id : id });
    const row = migration001.promoteRecord(table, rec);
    const cols = Object.keys(row);
    return db.prepare(
      `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => '@' + c).join(', ')})`
    ).run(row);
  }
  return db.prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`)
    .run(id, JSON.stringify(record));
}

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'hostix.db');
  const dbExisted = fs.existsSync(dbPath);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id   TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS students (
      id     TEXT PRIMARY KEY,
      data   TEXT NOT NULL,
      status TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
      roomId TEXT GENERATED ALWAYS AS (json_extract(data, '$.roomId')) VIRTUAL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id        TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      studentId TEXT GENERATED ALWAYS AS (json_extract(data, '$.studentId')) VIRTUAL,
      status    TEXT GENERATED ALWAYS AS (json_extract(data, '$.status'))    VIRTUAL
    );
    CREATE TABLE IF NOT EXISTS expenses      (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cancellations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS maintenance   (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS complaints    (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS checkinlog    (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notices       (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fines         (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activitylog   (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inspections   (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS billsplits    (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transfers     (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS archive       (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  `);

  // ── Relational-schema migration (Phase 2 §6.3) ──────────────────────────────
  // Promotes UI-filtered fields to real indexed columns while keeping the full
  // record in the `data` blob (lossless). Idempotent + transactional. Existing
  // client DBs are snapshotted to hostix.db.pre-v1.bak once, before the first
  // migration, as an extra safety net beyond the transaction rollback.
  try {
    if (dbExisted && migration001.currentVersion(db) < migration001.SCHEMA_VERSION) {
      const bak = dbPath + '.pre-v1.bak';
      if (!fs.existsSync(bak)) {
        db.exec(`VACUUM INTO '${bak.replace(/'/g, "''")}'`);
        console.log('[HOSTIX] Pre-migration backup written:', bak);
      }
    }
    const migRes = migration001.migrateDatabase(db);
    if (migRes.migrated) console.log('[HOSTIX] Schema migrated to v' + migRes.version);
  } catch (e) {
    console.error('[HOSTIX] Schema migration failed (continuing on existing schema):', e.message);
  }
  _schemaMigrated = migration001.currentVersion(db) >= migration001.SCHEMA_VERSION;

  console.log('[HOSTIX] SQLite DB initialized at:', dbPath, '| schema v' +
    migration001.currentVersion(db));
  return db;
}


// ── Auto Updater ──────────────────────────────────────────────────────────────
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  // [D-2] Unattended install is OFF. There is no code-signing certificate
  // (signAndEditExecutable/verifyUpdateCodeSignature are both false in
  // package.json), so silently downloading and installing a release on 50+
  // production machines has no publisher authenticity behind it — the one
  // check that would catch a substituted installer is disabled. Spec §20
  // requires signed artifacts; until a certificate exists, updates are
  // announced and the owner installs deliberately.
  // Re-enable both ONLY together with real code signing.
  autoUpdater.autoDownload         = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = require('electron').app ? null : console; // silent in prod
} catch (e) {
  console.warn('[DAMAM] electron-updater not available:', e.message);
  console.error('Stack Trace:', e.stack);
}

let mainWindow;

// Hex-encoded secret — MUST match _SECRET in keygen.js exactly
const _SECRET = Buffer.from(
  '44344d344d5f483053543333545f5333435233545f5334344c545f7631', 'hex'
).toString();

// ── DEV DATA ISOLATION ────────────────────────────────────────────────────────
// The packaged app and `npm start` both identify as "hostix-app", so Electron
// hands them the SAME userData folder — meaning a development run opens the
// real client database. On 2026-08-15 a dev build was found running live
// against 55 students / 98 payments of production data.
//
// In dev, redirect userData to `.devdata` inside the repo. Must run BEFORE the
// two constants below, which resolve userData at module load.
//
// An explicit --user-data-dir always wins: the Playwright suite passes its own
// isolated profile and must keep it.
if (process.argv.includes('--dev') &&
    !process.argv.some(a => a.startsWith('--user-data-dir'))) {
  const devData = path.join(__dirname, '.devdata');
  fs.mkdirSync(devData, { recursive: true });
  app.setPath('userData', devData);
  console.log('[HOSTYLLO] DEV MODE — data isolated at:', devData);
}

const LICENSE_PATH  = path.join(app.getPath('userData'), 'license.enc');
const LAST_RUN_PATH = path.join(app.getPath('userData'), 'last_run.dat');

const IS_PROD = !process.argv.includes('--dev');

// Anti-Debug: block --inspect / --inspect-brk in production
if (IS_PROD && process.argv.some(a => /^--inspect(-brk)?/.test(a))) {
  process.stderr.write('[DAMAM] Debugger attachment not permitted in production.\n');
  process.exit(1);
}

// ── Crash logging (Phase 1, §40 / audit H5) ───────────────────────────────────
// Installed here rather than in the services bootstrap so a crash during
// database init or window creation is still captured.
//
// CRASH BEHAVIOUR IS UNCHANGED. The handler writes a log line and then does
// exactly what Node does with no handler installed: stack to stderr, exit(1).
// Swallowing crashes would alter how the app fails on 50+ production machines,
// which is not this phase's business.
try {
  appLogger.init({
    dir: path.join(app.getPath('userData'), 'logs'),
    level: IS_PROD ? 'INFO' : 'DEBUG',
    console: !IS_PROD
  });
  appLogger.installCrashHandlers();
} catch (_) { /* logging must never be the reason the app fails to start */ }

// ─────────────────────────────────────────────────────────────────────────────
// [FIX-04 + FIX-05] Machine Fingerprint
// hostname REMOVED — too easy to change/spoof, breaks legit users on rename.
// DriveSerial ADDED — stable hardware-level binding.
// Result is cached to avoid repeated slow calls.
// ─────────────────────────────────────────────────────────────────────────────
let _cachedMachineId = null;

/* Local calendar date. toISOString() is UTC, and at UTC+5 that names yesterday
   from 7pm onward — a backup taken after the evening rent round was filed under
   the previous day's date. Mirrors ymd() in the renderer. */
function _ymdLocal(d) {
  const x = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}

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
  try {
    const { execSync } = require('child_process');
    const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get VolumeSerialNumber /value', { encoding: 'utf8', timeout: 2000, windowsHide: true });
    const m = out.match(/VolumeSerialNumber=(\w+)/);
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}

// [S5-FIX] BIOS serial — harder to spoof than registry GUID or drive serial
function _getBiosSerial() {
  if (os.platform() !== 'win32') return '';
  try {
    const { execSync } = require('child_process');
    const out = execSync('wmic bios get SerialNumber /value', { encoding: 'utf8', timeout: 2000, windowsHide: true });
    const m = out.match(/SerialNumber=([^\r\n]+)/);
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}

async function _writeLastRun() {
  try {
    await fsPromises.writeFile(LAST_RUN_PATH, new Date().toISOString(), 'utf8');
  } catch (e) {
    console.error('[DAMAM] Failed to write last run date:', e.message);
  }
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
      _getDriveSerial(),
      _getBiosSerial()  // [S5-FIX] BIOS serial adds a 6th hardware factor
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
const { validateKeyFormat, validateKeyChecksum, licenseKeyExpiry } = require('./renderer/src/utils');

function _validateKeyFormat(key) {
  return validateKeyFormat(key);
}

function _validateKeyChecksum(key) {
  return validateKeyChecksum(key, _SECRET);
}

// Both key formats decode here: a v3 key expires at the start of its month's
// last day, a v4 key at the end of its exact expiry day. See licenseKeyExpiry.
function _getExpiryFromKey(key) {
  return licenseKeyExpiry(key);
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

  // [FIX-06 / S6-FIX] Reject if clock is rolled back before activation date.
  // Tolerance reduced from 1 day to 5 minutes — 24h window was too generous.
  if (data.activatedAt) {
    const activatedAt = new Date(data.activatedAt);
    if (!isNaN(activatedAt.getTime()) && now < new Date(activatedAt.getTime() - 300000)) {
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

// ── Enforcement ───────────────────────────────────────────────────────────────
// One decision, recomputed at most once a second, consulted by the write gate
// and handed to the renderer for the banner.
//
// Cached because it is consulted on EVERY database write. Recomputing it per
// write would mean decrypting license.enc and reading two files for every row a
// bulk import touches. One second is short enough that a suspension arriving
// mid-session takes effect immediately in human terms.
let _enforceCache = { at: 0, decision: null };

function currentEnforcement(force) {
  const now = Date.now();
  if (!force && _enforceCache.decision && now - _enforceCache.at < 1000) {
    return _enforceCache.decision;
  }

  let licence;
  try {
    licence = _licenceSnapshot();
  } catch (e) {
    // A licence check that throws must not take the app down with it. Treat it
    // as unlicensed — the customer gets the activation screen, which is
    // recoverable, rather than a dead window.
    licence = { valid: false, reason: 'corrupt' };
  }

  const ent = (online && online.entitlement) ? safe(() => online.entitlement.getStatus(), null) : null;

  const time = enforcement.effectiveNow({
    lastRun: safe(() => _readLastRun(), null),
    activatedAt: licence.activatedAt || null,
    serverTimeSeen: ent ? ent.serverTimeSeen : null
  });

  const decision = enforcement.resolve({ licence, entitlement: ent, now: time.now });
  decision.clockSuspect = time.clockSuspect;
  decision.timeSource = time.source;

  _enforceCache = { at: now, decision };
  return decision;
}

function safe(fn, fallback) {
  try { return fn(); } catch (_) { return fallback; }
}

/**
 * The licence WITHOUT the last_run.dat side effect.
 *
 * checkLicenseValidity() advances the anti-clock-rollback watermark every time
 * it runs (main.js _writeLastRun). The write gate calls this on every database
 * write, so using that function here would rewrite the watermark thousands of
 * times a day — and worse, it would keep pushing it forward from a clock we do
 * not yet trust. Read the file, decide nothing, write nothing.
 */
function _licenceSnapshot() {
  if (!fs.existsSync(LICENSE_PATH)) return { valid: false, reason: 'not_activated' };
  let data;
  try {
    data = decryptLicense(fs.readFileSync(LICENSE_PATH, 'utf8'), getMachineId());
  } catch (e) {
    return { valid: false, reason: e.message === 'TAMPERED' ? 'tampered' : 'corrupt' };
  }
  if (data.machineId !== getMachineId()) return { valid: false, reason: 'wrong_machine' };
  if (!_validateKeyChecksum(data.key)) return { valid: false, reason: 'tampered' };
  return { valid: true, expiry: data.expiry, activatedAt: data.activatedAt, key: data.key };
}

/** Invalidate the cache — after activation, deactivation, or a fresh entitlement. */
function refreshEnforcement() {
  _enforceCache = { at: 0, decision: null };
  const decision = currentEnforcement(true);
  try {
    const { BrowserWindow } = require('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('license:enforcementChanged', decision);
    }
  } catch (_) {}
  return decision;
}

// ── Activate License ──────────────────────────────────────────────────────────
function activateLicense(key) {
  const k = key.toUpperCase().trim();
  if (!_validateKeyFormat(k))
    return { success: false, reason: 'Invalid key format. Expected: HOSTEL-XXXX-XXXX-XXXX-XXXX' };
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
    // The cached decision is now stale by definition — a moment ago this
    // machine was unlicensed.
    refreshEnforcement();
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
    refreshEnforcement();
    return { success: true };
  } catch (e) {
    return { success: false, message: 'Could not remove license files. Please contact support.' };
  }
}

// ROOT CAUSE FIX: open license settings in a separate child window so the
// main app (and the user's logged-in session) is never replaced or interrupted.
let _settingsWin = null;
function openLicenseSettings() {
  if (!mainWindow) return;
  // Reuse existing window if already open
  if (_settingsWin && !_settingsWin.isDestroyed()) {
    _settingsWin.focus();
    return;
  }
  _settingsWin = new BrowserWindow({
    // Widened with the v6 redesign: the page is a 660px column plus padding,
    // and the licence-facts strip is a 3-up grid that cramps below ~760.
    width: 780, height: 760,
    parent: mainWindow,
    modal: false,
    title: 'License Settings — HOSTIX',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: !IS_PROD
    },
    backgroundColor: '#1a1c1e',
    show: false
  });
  _settingsWin.loadFile(path.join(__dirname, 'renderer', 'license-settings.html'));
  _settingsWin.setMenuBarVisibility(false);
  _settingsWin.once('ready-to-show', () => _settingsWin.show());
  _settingsWin.on('closed', () => { _settingsWin = null; });
}

// ════════════════════════════════════════════════════════════════════════════
// WINDOW
// ════════════════════════════════════════════════════════════════════════════
// ── Menu / title-bar actions ────────────────────────────────────────────────
// Extracted so the native accelerators (application menu) and the custom title
// bar (IPC → titlebar:menu) run one implementation, never two that can drift.
async function doExportBackup() {
  if (!mainWindow) return;
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Backup',
    defaultPath: `Hostyllo_Backup_${_ymdLocal()}.json`,
    filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });
  if (filePath) mainWindow.webContents.send('export-backup', filePath);
}

async function doImportBackup() {
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

function doAbout() {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'About',
    message: 'Hostyllo — Hostel Management System',
    detail: 'Version 3.0 (Security Patched)\n4/1 Kakakhel Street, Danishabad Shaheen Town, Peshawar\n\nOffline app — all data stored locally on this device.\nDeveloped by: MUSHTAQ AHMAD'
  });
}

async function doCheckUpdates() {
  if (!mainWindow) return;
  if (!autoUpdater || !IS_PROD) {
    dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'Updates',
      message: 'Update checking is only available in production builds.'
    });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo) {
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Up to Date',
        message: '✅ You have the latest version of Hostyllo.'
      });
    }
  } catch (e) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning', title: 'Update Check Failed',
      message: 'Could not check for updates.',
      detail: 'Please check your internet connection and try again.'
    });
  }
}

function doLicenseInfo() {
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

// View actions — used by the custom title bar. The application menu keeps its
// own role-based items (below) for the keyboard accelerators.
function doZoom(delta) {
  if (!mainWindow) return;
  const wc = mainWindow.webContents;
  if (delta === 0) { wc.setZoomLevel(0); return; }
  wc.setZoomLevel(wc.getZoomLevel() + delta);
}
function doToggleFullScreen() {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
}
function doReload(ignoreCache) {
  if (!mainWindow || IS_PROD) return;   // reload is a dev affordance only
  if (ignoreCache) mainWindow.webContents.reloadIgnoringCache();
  else mainWindow.webContents.reload();
}
function doToggleDevTools() {
  if (!mainWindow || IS_PROD) return;
  mainWindow.webContents.toggleDevTools();
}

// Dispatch table for the custom title bar's menu clicks (preload → 'titlebar:menu').
const TITLEBAR_ACTIONS = {
  exportBackup:  doExportBackup,
  importBackup:  doImportBackup,
  quit:          () => app.quit(),
  about:         doAbout,
  licenseSettings: () => openLicenseSettings(),
  checkUpdates:  doCheckUpdates,
  licenseInfo:   doLicenseInfo,
  resetZoom:     () => doZoom(0),
  zoomIn:        () => doZoom(0.5),
  zoomOut:       () => doZoom(-0.5),
  fullScreen:    doToggleFullScreen,
  reload:        () => doReload(false),
  forceReload:   () => doReload(true),
  devTools:      doToggleDevTools
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Hostyllo — Hostel Management System',
    // Frameless: the native title bar and menu bar are replaced by the custom
    // in-app title bar (renderer/src/titlebar.js). The application menu is still
    // set below, so every keyboard accelerator (Ctrl+S/O/Q, F11, zoom, dev
    // reload/devtools) keeps working even though the bar itself is not drawn.
    frame: false,
    // Belt-and-suspenders: keep the native menu bar hidden so it can never
    // stack on top of the custom bar even in a framed fallback.
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !IS_PROD
    },
    backgroundColor: '#1a1c1e',
    show: false
  });

  // Tell the custom title bar when to swap its maximize/restore glyph.
  const _sendMaxState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', _sendMaxState);
  mainWindow.on('unmaximize', _sendMaxState);

  // checkLicenseValidity() still runs, because it is what advances the
  // anti-clock-rollback watermark. What it no longer decides on its own is
  // whether the app opens.
  const lic = checkLicenseValidity();
  const decision = refreshEnforcement();

  // EXPIRED is no longer a locked door. Past its date a hostel gets the app in
  // read-only: every student, payment and report visible, searchable,
  // printable and exportable, with new entries paused (D-3). Only a genuinely
  // unusable licence — never activated, tampered with, bound to another
  // machine, or revoked by the owner — sends them to the activation screen.
  //
  // The write gate at the database IPC boundary is what makes read-only real;
  // this only decides which page loads.
  if (!decision.blocked) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'license.html'), {
      query: { reason: lic.reason || decision.reason, message: lic.message }
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();

    if (IS_PROD) {
      // Block DevTools keyboard shortcuts
      mainWindow.webContents.on('before-input-event', (_evt, input) => {
        const k = input.key.toUpperCase();
        const blocked =
          k === 'F12' ||
          (input.control && input.shift && ['I', 'J', 'C'].includes(k)) ||
          (input.control && k === 'U');
        if (blocked) _evt.preventDefault();
      });
      // [FIX-11] Block right-click → Inspect context menu in production
      mainWindow.webContents.on('context-menu', (e) => e.preventDefault());
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
        { label: 'Export Backup…', accelerator: 'CmdOrCtrl+S', click: doExportBackup },
        { label: 'Import Backup…', accelerator: 'CmdOrCtrl+O', click: doImportBackup },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    { label: 'View', submenu: viewSubmenu },
    {
      label: 'Help',
      submenu: [
        { label: 'About Hostyllo', click: doAbout },
        { label: 'License Settings', click: () => openLicenseSettings() },
        { label: 'Check for Updates', click: doCheckUpdates },
        { label: 'License Info', click: doLicenseInfo }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ════════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ════════════════════════════════════════════════════════════════════════════

// ── Custom title bar: frameless window controls + menu actions ───────────────
// Controls act on the window that sent the message, so they are correct on both
// the licensed app and the licence screen (both load into mainWindow).
ipcMain.on('window:minimize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize();
});
ipcMain.on('window:toggleMaximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (!w) return;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
});
ipcMain.on('window:close', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close();
});
ipcMain.handle('window:isMaximized', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return !!(w && w.isMaximized());
});
// Menu clicks from the custom bar run the exact same actions as the native
// accelerators, via the dispatch table. Unknown ids are ignored.
ipcMain.on('titlebar:menu', (_e, action) => {
  const fn = (typeof action === 'string' &&
    Object.prototype.hasOwnProperty.call(TITLEBAR_ACTIONS, action))
    ? TITLEBAR_ACTIONS[action] : null;
  if (fn) fn();
});
// Lets the title bar show the dev-only View items (reload / devtools) exactly
// when the native menu does.
ipcMain.handle('app:isDev', () => !IS_PROD);

ipcMain.handle('license:check', () => {
  const result = checkLicenseValidity();
  // [Phase 1] Feed the ConnectivityService's LICENSE_VALID state (§7) from a
  // check the app was already performing. It must never call
  // checkLicenseValidity() itself: that function writes last_run.dat as a side
  // effect, and polling it would rewrite the anti-clock-rollback watermark all
  // day on machines that depend on it.
  if (online) online.noteLicenseResult(result);
  return { ...result, valid: result.valid };
});

/**
 * What the app is currently allowed to do. Read-only, cheap, and safe to poll —
 * the renderer uses it to render the banner and to disable the controls that
 * would fail at the gate anyway.
 */
ipcMain.handle('license:enforcement', () => currentEnforcement());

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
      query: { reason: 'not_activated', message: 'License deactivated. Please enter a new license key.' }
    });
  }
  // Close the settings child window (if open) after deactivation
  if (_settingsWin && !_settingsWin.isDestroyed()) _settingsWin.close();
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
      query: { reason: 'not_activated', message: 'License has been fully reset. Please enter your license key.' }
    });
  }
  // Close the settings child window (if open) after reset
  if (_settingsWin && !_settingsWin.isDestroyed()) _settingsWin.close();
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
    detail: 'You can now safely uninstall the app from\nWindows Settings → Apps & Features.\n\nThank you for using HOSTIX!'
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
      query: { reason: lic.reason, message: lic.message }
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
    defaultPath: suggestedName || `Report_${_ymdLocal()}.pdf`,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return { success: false, reason: 'cancelled' };

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  // FIX-PDF: Write HTML to a temp file instead of using data URI.
  // encodeURIComponent() on large HTML bloats size past Chromium's URL limit,
  // causing "PDF generation failed". loadFile() has no such limit.
  const tmpFile = path.join(os.tmpdir(), 'damam_pdf_' + Date.now() + '.html');
  try {
    fs.writeFileSync(tmpFile, htmlContent, 'utf8');
    await pdfWin.loadFile(tmpFile);
    const pdfData = await pdfWin.webContents.printToPDF({
      pageSize, printBackground: true, landscape,
      margins: marginsMM
    });
    fs.writeFileSync(filePath, pdfData);
    return { success: true, filePath };
  } catch (e) {
    console.error('[DAMAM] PDF generation failed:', e.message, e.code);
    // FIX-B4: Surface actionable disk/permission errors instead of a generic message
    let reason = 'PDF generation failed. Please try again.';
    if (e.code === 'ENOSPC') {
      reason = 'PDF failed: your disk is full. Free up space and try again.';
    } else if (e.code === 'EACCES' || e.code === 'EPERM') {
      reason = 'PDF failed: cannot write to temp folder. Check disk permissions.';
    } else if (e.code === 'ENOENT') {
      reason = 'PDF failed: temp folder not found. Restart the app and try again.';
    }
    return { success: false, reason };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(_) {}  // clean up temp file
    pdfWin.destroy();
  }
});

// Open PDF report in a separate BrowserWindow
ipcMain.on('open-pdf-window', (_e, htmlContent, title) => {
  if (typeof htmlContent !== 'string' || htmlContent.length > 2 * 1024 * 1024) return;
  const safeTitle = (typeof title === 'string' ? title : 'Report').slice(0, 200);

  const pdfWin = new BrowserWindow({
    width: 1050, height: 750, minWidth: 600, minHeight: 400,
    title: safeTitle,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#ffffff',
    autoHideMenuBar: true
  });

  const tmpFile = path.join(os.tmpdir(), 'damam_report_' + Date.now() + '.html');
  try {
    fs.writeFileSync(tmpFile, htmlContent, 'utf8');
    pdfWin.loadFile(tmpFile);
    pdfWin.on('closed', () => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    });
  } catch (e) {
    console.error('[DAMAM] open-pdf-window failed:', e.message);
    pdfWin.destroy();
    try { fs.unlinkSync(tmpFile); } catch (_) {}
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

// ════════════════════════════════════════════════════════════════════════════
// AUTO UPDATER
// ════════════════════════════════════════════════════════════════════════════
function setupAutoUpdater() {
  if (!autoUpdater) return;

  // [D-2] Update available — announce only. Nothing downloads or installs by
  // itself; the owner opens the release page and installs deliberately.
  autoUpdater.on('update-available', (info) => {
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Hostyllo v${info.version} is available`,
      detail: 'Your current version keeps working normally.\n\n'
            + 'Choose "Get Update" to open the download page in your browser, '
            + 'then close Hostyllo and run the installer. Your data and licence '
            + 'are not affected.',
      buttons: ['Get Update', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        shell.openExternal('https://github.com/mushtaqahmaduop/HOSTIX-APP/releases/latest');
      }
    });
  });

  // No update — silent, no dialog needed
  autoUpdater.on('update-not-available', () => {
    console.log('[DAMAM] App is up to date.');
  });

  // Download progress — send to renderer for optional progress bar
  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', {
        percent:  Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      });
    }
  });

  // Downloaded — prompt to restart now or later
  autoUpdater.on('update-downloaded', (info) => {
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `HOSTIX v${info.version} is ready to install`,
      detail: 'Restart now to apply the update, or it will install automatically when you next close the app.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Error — log only, no popup (avoid scaring users for network issues)
  autoUpdater.on('error', (err) => {
    console.error('[DAMAM] Auto-update error:', err.message);
  });
}

// IPC: renderer can manually trigger update check (e.g. from Help menu)
ipcMain.handle('update:check', async () => {
  if (!autoUpdater) return { available: false, reason: 'updater_not_available' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: !!result, version: result?.updateInfo?.version };
  } catch (e) {
    return { available: false, reason: e.message };
  }
});

ipcMain.handle('update:install', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});


// ════════════════════════════════════════════════════════════════════════════
// DB IPC HANDLERS (better-sqlite3)
// ════════════════════════════════════════════════════════════════════════════

// [FIX-13] Whitelist column names in db:all — SQL column names cannot be
// parameterised with ?, so we validate against a known-safe set instead.
const _ALLOWED_WHERE_COLS = new Set(['id', 'status', 'roomId', 'studentId']);

// [Phase 1] The generic db:* bridge stays as it is — it is the application's
// core architecture and audit M1 says freeze, don't rewrite. But `online_queue`
// matches its /^[a-z_]+$/ table check, so without this guard renderer code
// could read or `db:bulkReplace` away the machine's own pending uploads.
// New online features get their own narrow channels; this bridge is not
// extended to reach them.
function _assertRendererTable(table) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
  if (onlineServices.INTERNAL_TABLES.has(table)) throw new Error('Reserved table');
}

ipcMain.handle('db:all', (_e, table, where) => {
  try {
    _assertRendererTable(table);
    if (where) {
      const [col, val] = where;
      if (!_ALLOWED_WHERE_COLS.has(col)) throw new Error('Invalid column: ' + col);
      return db.prepare(`SELECT data FROM ${table} WHERE ${col} = ?`).all(val)
        .map(r => JSON.parse(r.data));
    }
    return db.prepare(`SELECT data FROM ${table}`).all()
      .map(r => JSON.parse(r.data));
  } catch (e) { console.error('[DB] all:', e.message); return []; }
});

/**
 * THE WRITE GATE.
 *
 * In the main process, at the IPC boundary, because the renderer is the
 * untrusted side — anything it can choose not to do it can also choose to do.
 * The renderer gets the same decision so it can grey out buttons and explain
 * itself, but this is the one that counts.
 *
 * Reads are never gated. An expired hostel keeps every record visible,
 * searchable, printable and exportable; that is decision D-3 and the difference
 * between a customer who pays late and an ex-customer.
 */
function _assertWritable(table) {
  const decision = currentEnforcement();
  if (enforcement.writeBlocked(decision, table)) {
    const err = new Error(decision.state === 'SUSPENDED'
      ? 'This licence is suspended — new entries are paused.'
      : 'This licence has expired — new entries are paused until it is renewed.');
    err.code = 'LICENCE_READ_ONLY';
    err.licenceState = decision.state;
    throw err;
  }
}

ipcMain.handle('db:upsert', (_e, table, id, record) => {
  try {
    _assertRendererTable(table);
    _assertWritable(table);
    _dbInsert(table, id, record);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message, code: e.code || null }; }
});

ipcMain.handle('db:delete', (_e, table, id) => {
  try {
    _assertRendererTable(table);
    _assertWritable(table);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message, code: e.code || null }; }
});

ipcMain.handle('db:bulkReplace', (_e, table, records) => {
  try {
    _assertRendererTable(table);
    _assertWritable(table);
    const transaction = db.transaction((rows) => {
      db.prepare(`DELETE FROM ${table}`).run();
      for (const r of rows) _dbInsert(table, r.id, r);
    });
    transaction(records);
    return { ok: true };
  } catch (e) { console.error('[DB] bulkReplace:', e.message); return { ok: false, error: e.message }; }
});

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

ipcMain.handle('db:exportFull', () => {
  try {
    const tables = ['rooms','students','payments','expenses','cancellations',
      'maintenance','complaints','checkinlog','notices','fines',
      'activitylog','inspections','billsplits','transfers','archive'];
    const result = {};
    for (const t of tables) {
      result[t] = db.prepare(`SELECT data FROM ${t}`).all().map(r => JSON.parse(r.data));
    }
    const settings = {};
    db.prepare('SELECT key, value FROM settings').all()
      .forEach(r => { settings[r.key] = JSON.parse(r.value); });
    result.settings = settings;
    return { ok: true, data: result };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('db:importFull', (_e, data) => {
  try { _assertWritable('import'); }
  catch (e) { return { ok: false, error: e.message, code: e.code || null }; }
  try {
    const transaction = db.transaction(() => {
      const tables = ['rooms','students','payments','expenses','cancellations',
        'maintenance','complaints','checkinlog','notices','fines',
        'activitylog','inspections','billsplits','transfers','archive'];
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
        // data.settings may be a flat object (hostelSettings key) or the settings obj directly
        const settingsObj = data.settings.hostelSettings || data.settings;
        ins.run('hostelSettings', JSON.stringify(settingsObj));
      }
    });
    transaction();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const { session } = require('electron');
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      // Single source of truth for CSP (the <meta> CSP in index.html was removed).
      // All libs/fonts are bundled locally, so no remote hosts are allowed.
      // 'unsafe-inline' stays: the UI relies on inline event handlers throughout.
      'Content-Security-Policy': [
        "default-src 'self';" +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval';" +
        "style-src 'self' 'unsafe-inline';" +
        "font-src 'self' data:;" +
        "img-src 'self' data: blob:;" +
        "connect-src 'self';" +
        "worker-src 'self' blob:;"
      ]
    }
  });
});
  const ALLOWED_PERMS = ['clipboard-read', 'clipboard-sanitized-write'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMS.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMS.includes(permission);
  });
  initDatabase();

  // ── Online services (Phase 1) ─────────────────────────────────────────────
  // After initDatabase (the queue needs the handle), before createWindow (so
  // the `online:*` IPC handlers exist before any renderer can call them).
  // A failure here must never stop the app booting — the whole product works
  // offline, and these services are additive.
  try {
    online = onlineServices.start({
      db,
      userDataDir: app.getPath('userData'),
      isDev: !IS_PROD,
      // Injected rather than imported: an entitlement is bound to a machine,
      // and the services layer must not reach back into main.js for it. Note
      // this is getMachineId(), NOT checkLicenseValidity() — that one writes
      // last_run.dat as a side effect (see the Phase 1 report §4a).
      machineIdProvider: getMachineId
    });
  } catch (e) {
    console.error('[HOSTYLLO] Online services failed to start:', e.message);
  }

  createWindow();

  // ── Auto Update (runs silently after window is ready) ─────────────────────
  if (IS_PROD && autoUpdater) {
    // Wait 3 seconds after launch before checking — avoids slowing startup
    setTimeout(() => {
      setupAutoUpdater();
      autoUpdater.checkForUpdates().catch(e =>
        console.warn('[DAMAM] Update check failed:', e.message)
      );
    }, 3000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// [Phase 1] Stop the pollers and flush the log stream on the way out.
app.on('will-quit', () => {
  try { if (online) online.stop(); } catch (_) {}
  online = null;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});