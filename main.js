// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — Main Process  (Merged v3 — SECURITY PATCHED)
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
// The live database file. Held at module scope because the restore path needs
// to snapshot it before it mutates it, and initDatabase() is long finished by
// then. Set once, in initDatabase().
let dbPath = null;

/* THE TABLE LIST, ONCE.
   It used to be written out twice — once in db:exportFull and once in
   db:importFull — with nothing keeping the two in step. A table added to the
   export but not the import would have been backed up faithfully and then
   silently dropped by the next restore, which is the kind of data loss nobody
   notices until they need the data. */
const BACKUP_TABLES = ['rooms','students','payments','expenses','cancellations',
  'maintenance','complaints','checkinlog','notices','fines',
  'activitylog','inspections','billsplits','transfers','archive'];

/* DATABASE HEALTH  —  spec §17.
 *
 * Until now a corrupt database was an unhandled crash. initDatabase() was
 * called bare inside app.whenReady(), so `new Database()` throwing on a damaged
 * file took the whole boot with it: no window, no message, no way for the
 * warden to tell a broken file apart from a broken app. §17 asks for the
 * opposite — detect, stop writing, and show somebody what to do about it.
 *
 * HEALTHY   the file opened and passed PRAGMA integrity_check
 * CORRUPT   it did not, and nothing may write to it
 * DISK_FULL a write failed for space; reads still work, the data is intact
 *
 * The state is deliberately separate from licence enforcement. A suspended
 * hostel has a healthy database it is not allowed to write to; a corrupt one is
 * a licensed hostel that CANNOT write. Collapsing them would tell a customer
 * with a damaged disk that their licence expired.
 */
let dbHealth = { state: 'HEALTHY', reason: null, detail: null, at: null };

function _setDbHealth(state, reason, detail) {
  dbHealth = { state, reason: reason || null, detail: detail || null,
               at: new Date().toISOString() };
  if (state !== 'HEALTHY') console.error('[HOSTYLLO] DB health →', state, '—', reason);
  return dbHealth;
}

/* PRAGMA integrity_check, not quick_check.
 *
 * quick_check skips the index-vs-table consistency pass, which is exactly the
 * damage a half-written page produces and exactly what silently returns wrong
 * query results afterwards. A hostel database is a few megabytes; the extra
 * time is not worth the class of corruption it would miss. */
/* What schema version does this file claim, WITHOUT writing to it?
 *
 * migration001.currentVersion() cannot be used here: it does
 * `CREATE TABLE IF NOT EXISTS schema_meta` first, which is a write, and the
 * whole point of this check is to run before we have decided the file is one
 * we may write to. Reading sqlite_master instead keeps it inert. */
function _readSchemaVersion(handle) {
  try {
    const t = handle.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'").get();
    if (!t) return 0;
    const row = handle.prepare("SELECT value FROM schema_meta WHERE key='version'").get();
    return row ? (Number(row.value) || 0) : 0;
  } catch (_) { return 0; }
}

function _integrityCheck(handle) {
  try {
    const rows = handle.pragma('integrity_check');
    // better-sqlite3 returns [{ integrity_check: 'ok' }] when the file is sound.
    const first = rows && rows[0] &&
      (rows[0].integrity_check !== undefined ? rows[0].integrity_check : rows[0]);
    if (String(first).toLowerCase() === 'ok') return { ok: true };
    return { ok: false, reason: 'integrity_check reported damage',
             detail: JSON.stringify(rows).slice(0, 2000) };
  } catch (e) {
    return { ok: false, reason: e.message, detail: e.code || null };
  }
}

/* WHAT A FAILED WRITE ACTUALLY MEANS.
 *
 * §17's rule is "no false success", and §12's is that a success message may
 * only follow durable persistence. Both were already honoured — every write
 * handler returns { ok:false, error } — but the error was a raw SQLite string,
 * so a full disk and a damaged file reached the warden as the same
 * indistinguishable sentence. They need opposite actions: one is "free some
 * space and try again", the other is "stop, and restore".
 *
 * Classifying here also lets a full disk flip dbHealth to DISK_FULL, so the
 * next write is refused with guidance instead of failing the same way again. */
function _classifyWriteError(e) {
  const code = (e && e.code) || '';
  const msg  = String((e && e.message) || '');

  if (code === 'ENOSPC' || /SQLITE_FULL|database or disk is full/i.test(code + msg)) {
    _setDbHealth('DISK_FULL', 'the disk is full', msg);
    return { code: 'DISK_FULL',
      error: 'Not saved — this computer has run out of disk space. Free up space, then try again.' };
  }
  if (code === 'EACCES' || code === 'EPERM' ||
      /SQLITE_READONLY|SQLITE_PERM|attempt to write a readonly/i.test(code + msg)) {
    return { code: 'PERMISSION_DENIED',
      error: 'Not saved — Hostyllo cannot write to its data folder. Check the folder’s permissions, or run Hostyllo as the same user who installed it.' };
  }
  if (/SQLITE_CORRUPT|SQLITE_NOTADB|malformed|not a database/i.test(code + msg)) {
    _setDbHealth('CORRUPT', 'a write reported corruption', msg);
    return { code: 'DB_CORRUPT',
      error: 'Not saved — the database file is damaged. Hostyllo has stopped writing to it to prevent further loss. Restart to open the recovery screen.' };
  }
  if (code === 'SQLITE_IOERR' || /disk I\/O error/i.test(msg)) {
    return { code: 'IO_ERROR',
      error: 'Not saved — the disk reported a read/write error. If this repeats, back up immediately and check the drive.' };
  }
  return { code: 'WRITE_FAILED', error: msg || 'The change could not be saved.' };
}

/* The single shape a failed write comes back in.
 *
 * A licence refusal and a full disk must not be run through the same
 * classifier: the licence errors are deliberate decisions carrying their own
 * message, and re-describing "this licence is suspended" as "the change could
 * not be saved" would lose the only sentence that explains anything. So the
 * sentinels pass through untouched and everything else gets classified. */
const _SENTINEL_CODES = ['LICENCE_READ_ONLY', 'DB_CORRUPT', 'DB_UNAVAILABLE', 'INVALID_BACKUP'];

function _writeFailure(e) {
  if (e && _SENTINEL_CODES.includes(e.code)) {
    return { ok: false, error: e.message, code: e.code,
             licenceState: e.licenceState || undefined };
  }
  const c = _classifyWriteError(e);
  return { ok: false, error: c.error, code: c.code };
}

/* The gate every write passes before it is attempted.
 *
 * Reads are never gated — the same reasoning as the licence read-only rule.
 * A hostel whose database is damaged still needs to look up a student and
 * print what it can while it recovers. */
function _assertDbWritable() {
  /* Refused for the opposite reason to CORRUPT: the file is intact and it is
     this build that cannot be trusted with it. Writing would quietly strip
     whatever a newer version added, so the way out is to update the app, not
     to restore over the data. */
  if (dbHealth.state === 'UNSUPPORTED_SCHEMA') {
    const err = new Error(dbHealth.reason ||
      'This data was created by a newer version of Hostyllo. Update the app to open it.');
    err.code = 'UNSUPPORTED_SCHEMA';
    throw err;
  }
  if (dbHealth.state === 'CORRUPT') {
    const err = new Error('The database file is damaged. Hostyllo has stopped writing to it to prevent further loss.');
    err.code = 'DB_CORRUPT';
    throw err;
  }
  if (!db) {
    const err = new Error('The database is not open.');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
}
let _schemaMigrated = false;

// ── Online services (Phase 1) ─────────────────────────────────────────────────
// Connectivity, API client, durable queue, structured logging. Inert until a
// control plane URL is configured — see services/config.js.
const onlineServices = require('./services');
const appLogger = require('./services/logger');
const enforcement = require('./services/enforcement');
/* Shown to a customer who cannot use the app, so it must be somewhere they can
   actually reach. Matches the SUPPORT constant on the activation screen. */
const SUPPORT_CONTACT = 'mushtaqahmadicp@gmail.com';
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
  dbPath = path.join(app.getPath('userData'), 'hostix.db');
  const dbExisted = fs.existsSync(dbPath);

  /* OPEN, THEN PROVE IT IS SOUND, BEFORE WRITING A SINGLE BYTE.
     The CREATE TABLE block below is a write. Running it against a damaged file
     is how a recoverable problem becomes an unrecoverable one, so the integrity
     check has to come first — and a failure has to return rather than throw,
     because throwing here is what used to kill the boot outright. */
  /* THE HANDLE IS CLOSED ON EVERY FAILURE PATH, AND THAT IS NOT TIDINESS.
     new Database() can succeed on a damaged file and the failure surface a
     moment later on the first pragma. Dropping the reference without closing
     leaves the file open, and on Windows an open file cannot be renamed — so
     recovery failed with EBUSY at the exact moment it mattered, on the one
     machine that needed it. Caught by db-recovery.spec.js, which is the whole
     argument for testing the recovery path rather than reasoning about it. */
  let handle = null;
  try {
    handle = new Database(dbPath);
    handle.pragma('journal_mode = WAL');
    handle.pragma('foreign_keys = ON');
  } catch (e) {
    if (handle) { try { handle.close(); } catch (_) {} }
    db = null;
    _setDbHealth('CORRUPT', 'the database file could not be opened', e.message);
    return null;
  }

  if (dbExisted) {
    const chk = _integrityCheck(handle);
    if (!chk.ok) {
      try { handle.close(); } catch (_) {}
      db = null;
      _setDbHealth('CORRUPT', chk.reason, chk.detail);
      return null;
    }

    /* §27 "unknown schema → safe recovery", and §15's "never auto-downgrade an
       unsupported schema".

       migrateDatabase() only ever migrates UP: it returns early when the file
       is already at or beyond SCHEMA_VERSION. So a database written by a NEWER
       build used to sail straight past it and be opened normally — an older
       client reading and WRITING a shape it does not know. That is worse than
       refusing: nothing looks wrong, and every record this build saves is
       written without whatever the newer one added.

       It is a reachable state, not a hypothetical. An update installs, the
       customer reinstalls an older build or rolls one back, or a backup taken
       on an updated machine is restored onto a stale one.

       Checked HERE, before `db = handle` and before the CREATE TABLE block for
       the same reason the integrity check is: that block is a write, and this
       file is one we have just decided we do not understand. The data is fine —
       it is the app that is behind — so nothing is migrated, renamed or
       touched. */
    const found = _readSchemaVersion(handle);
    if (found > migration001.SCHEMA_VERSION) {
      try { handle.close(); } catch (_) {}
      db = null;
      _setDbHealth('UNSUPPORTED_SCHEMA',
        'This data was created by a newer version of Hostyllo (database format v' +
        found + '; this version understands up to v' + migration001.SCHEMA_VERSION + ').',
        'schema v' + found + ' > supported v' + migration001.SCHEMA_VERSION);
      return null;
    }
  }

  db = handle;

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
        console.log('[HOSTYLLO] Pre-migration backup written:', bak);
      }
    }
    const migRes = migration001.migrateDatabase(db);
    if (migRes.migrated) console.log('[HOSTYLLO] Schema migrated to v' + migRes.version);
  } catch (e) {
    console.error('[HOSTYLLO] Schema migration failed (continuing on existing schema):', e.message);
  }
  _schemaMigrated = migration001.currentVersion(db) >= migration001.SCHEMA_VERSION;

  console.log('[HOSTYLLO] SQLite DB initialized at:', dbPath, '| schema v' +
    migration001.currentVersion(db));
  return db;
}

/* ── RECOVERY  —  spec §17 ────────────────────────────────────────────────────
 *
 *   detect → stop unsafe writes → recovery screen → verified backup
 *          → restore to a TEMPORARY db → integrity checks → atomic switch
 *
 * The temporary-database step is the whole point and the easy one to skip. A
 * recovery that writes straight over the live file has, for the length of the
 * copy, destroyed the evidence and not yet produced a working replacement — and
 * if the snapshot turns out to be damaged too, that is where the hostel's data
 * ends. So: restore beside it, prove the copy is sound, and only then move it
 * into place. The damaged original is kept, renamed, never deleted.
 */

/** Every snapshot this app has ever written, newest first. */
function _listRecoverySnapshots() {
  if (!dbPath) return [];
  const dir  = path.dirname(dbPath);
  const base = path.basename(dbPath);
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return []; }

  return names
    .filter(f => f.startsWith(base + '.') && f.endsWith('.bak'))
    .map(f => {
      const full = path.join(dir, f);
      let size = null, mtime = null;
      try { const st = fs.statSync(full); size = st.size; mtime = st.mtime.toISOString(); }
      catch (_) { /* listed but unreadable — still worth showing, marked below */ }
      // What produced it, so the screen can say more than a filename.
      const kind = f.includes('.pre-restore-') ? 'Before a restore'
                 : f.includes('.pre-v1')       ? 'Before the schema upgrade'
                 : f.includes('.corrupt-')     ? 'The damaged file (kept, not a backup)'
                 :                               'Backup';
      return { file: f, path: full, size, mtime, kind,
               restorable: !f.includes('.corrupt-') && size !== null };
    })
    .sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
}

/** Is this file a database we could actually run on? */
function _verifySnapshot(file) {
  let h = null;
  try {
    h = new Database(file, { readonly: true });
    const chk = _integrityCheck(h);
    if (!chk.ok) return { ok: false, reason: 'This backup is itself damaged.' };

    // Structure, not just integrity: an intact file of somebody else's schema
    // passes integrity_check and would still leave the app broken.
    const have = new Set(h.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
    const missing = ['settings', ...BACKUP_TABLES].filter(t => !have.has(t));
    if (missing.length) {
      return { ok: false, reason: `This backup is missing ${missing.length} table(s): ${missing.slice(0, 4).join(', ')}.` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  } finally {
    if (h) { try { h.close(); } catch (_) {} }
  }
}

/**
 * Restore one snapshot. Returns { ok, error? } and, on success, the caller is
 * expected to restart — the app has been running against a database that is
 * no longer the file on disk.
 */
function _recoverFromSnapshot(snapshotPath) {
  if (!dbPath) return { ok: false, error: 'No database path is known.' };

  const known = _listRecoverySnapshots().find(s => s.path === snapshotPath);
  if (!known)      return { ok: false, error: 'That backup is not one Hostyllo wrote.' };
  if (!known.restorable) return { ok: false, error: 'That file is the damaged database, not a backup.' };

  const tmp = dbPath + '.recovery-tmp';
  try { fs.rmSync(tmp, { force: true }); } catch (_) {}

  try {
    // 1. Restore BESIDE the live file.
    fs.copyFileSync(snapshotPath, tmp);

    // 2. Prove the copy is sound before it is allowed anywhere near the original.
    const v = _verifySnapshot(tmp);
    if (!v.ok) {
      try { fs.rmSync(tmp, { force: true }); } catch (_) {}
      return { ok: false, error: v.reason };
    }

    // 3. Let go of the damaged file, and of the WAL beside it — a stale -wal or
    //    -shm belongs to the old database and would be applied on top of the new
    //    one, which is a corruption of its own.
    if (db) { try { db.close(); } catch (_) {} db = null; }
    for (const side of ['-wal', '-shm']) {
      try { fs.rmSync(dbPath + side, { force: true }); } catch (_) {}
    }

    // 4. Keep the original. It is the only copy of whatever was written since
    //    the snapshot, and a damaged SQLite file is often still partly readable
    //    by someone who knows how. Deleting it here would be the one
    //    irreversible act in an operation that exists to avoid those.
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}` +
                  `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const kept = `${dbPath}.corrupt-${stamp}.bak`;
    if (fs.existsSync(dbPath)) fs.renameSync(dbPath, kept);

    // 5. The switch itself. rename within one directory is as close to atomic
    //    as this filesystem offers.
    fs.renameSync(tmp, dbPath);

    console.log('[HOSTYLLO] Recovered from', known.file, '— damaged file kept at', path.basename(kept));
    return { ok: true, restoredFrom: known.file, damagedFileKept: path.basename(kept) };
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) {}
    return { ok: false, error: e.message };
  }
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
  console.warn('[HOSTYLLO] electron-updater not available:', e.message);
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
  process.stderr.write('[HOSTYLLO] Debugger attachment not permitted in production.\n');
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
let _lastMachineIdReason = null;   // clean | substituted | degraded | changed | error

/* Local calendar date. toISOString() is UTC, and at UTC+5 that names yesterday
   from 7pm onward — a backup taken after the evening rent round was filed under
   the previous day's date. Mirrors ymd() in the renderer. */
function _ymdLocal(d) {
  const x = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}

/* The three hardware probes and the fingerprint they feed now live in
   services/machine-id.js — pure Node, so tests/services.test.js can drive them
   directly. They used to be three bare `wmic` calls that returned '' on a 2s
   timeout, and '' is not an error to a hash function: it is a different fact,
   a different machine id, and a paying customer sent to the activation screen
   holding a valid licence. See the header of that file for the whole story.

   getMachineId() keeps its name, its signature and its per-process cache, and
   on a healthy machine it hashes byte-for-byte the same string it always did,
   so every licence already in the field keeps opening. */
const _machineId = require('./services/machine-id');

async function _writeLastRun() {
  try {
    await fsPromises.writeFile(LAST_RUN_PATH, new Date().toISOString(), 'utf8');
  } catch (e) {
    console.error('[HOSTYLLO] Failed to write last run date:', e.message);
  }
}
function getMachineId() {
  if (_cachedMachineId) return _cachedMachineId;   // [FIX-05] use cached value
  try {
    const r = _machineId.computeMachineId({
      stateDir: app.getPath('userData'),
      logger: console,
    });
    _cachedMachineId = r.id;
    _lastMachineIdReason = r.reason;
  } catch (e) {
    _cachedMachineId = 'UNKNOWN_MACHINE_ID_FALLBACK_' + '0'.repeat(36);
    _lastMachineIdReason = 'error';
  }
  return _cachedMachineId;
}

/** Why the last fingerprint came out the way it did — surfaced in License Info
    so a support call can tell "wrong PC" apart from "the probes failed". */
function getMachineIdReason() { return _lastMachineIdReason; }

/* Throw away the cached fingerprint and read the hardware again.

   getMachineId() caches for the life of the process, which is right for every
   other caller — but it means a probe that failed once has failed for as long
   as the app stays open. On the activation screen that is the difference
   between "click Activate again" working and it being guaranteed not to, so
   the guard below re-reads rather than re-asking the cache the same question.

   Only the activation path uses this. Nothing else should: re-probing after a
   licence is already open would let a transient probe failure change the id
   out from under a running session. */
function _reprobeMachineId() {
  _cachedMachineId = null;
  return getMachineId();
}

/** The same, in words a warden reading it down a phone line can repeat. */
function _machineIdReasonLabel(reason) {
  switch (reason) {
    case 'clean':       return 'All checks read normally';
    case 'substituted': return 'One reading failed, recovered from this PC\'s record';
    case 'degraded':    return 'READINGS FAILED — the ID may not match your licence';
    case 'changed':     return 'Hardware differs from the last recorded reading';
    case 'error':       return 'Could not be read at all';
    default:            return '—';
  }
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

  /* ONE SOURCE FOR WHAT THE CUSTOMER IS TOLD.

     enforcement.message() covers every state — including REVOKED — and was
     EXPORTED AND CALLED BY NOTHING. The renderer had its own copy of the same
     switch in _renderBanner(), and that copy handled GRACE, EXPIRED, SUSPENDED
     and near-expiry but not REVOKED. So revoking a customer blocked their
     writes correctly and told them nothing at all: an app that silently refused
     every save, with an empty banner.

     Attaching it here means the renderer renders a decision rather than
     re-deriving one, so a state added to the enforcement module can no longer
     arrive in the UI with no words attached. */
  decision.banner = enforcement.message(decision, {
    supportContact: SUPPORT_CONTACT
  });

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
  /* NEVER SEAL A LICENCE AGAINST A FINGERPRINT THIS MACHINE CANNOT REPRODUCE.

     The licence is AES-encrypted with a key derived from the machine id, and
     checked on every boot with `data.machineId !== getMachineId()`. So the id
     read HERE, once, is the one this install has to produce for the rest of its
     life.

     On a brand-new install there is no machine.json yet, so resolveFactors()
     has nothing to corroborate a missing reading against and returns `degraded`
     the moment any one probe fails — and a degraded reading is deliberately NOT
     written to machine.json, so nothing remembers it either. Activation would
     succeed, the customer would use the app all day, and the next boot — with
     the probes working normally — would compute a different id, fail the
     comparison above, and refuse to start with `wrong_machine`. A valid licence,
     a correct machine, and an app that will not open.

     Proven, not theorised: the same factors minus the BIOS serial hash to a
     different digest (tests/activation-guard.test.js).

     So refuse. A retry costs the customer thirty seconds; sealing a licence to
     a fingerprint that only existed once costs a support call and a re-issued
     key. The re-probe is what makes the retry meaningful — see
     _reprobeMachineId(). */
  let machineId = getMachineId();
  if (getMachineIdReason() === 'degraded' || getMachineIdReason() === 'error') {
    machineId = _reprobeMachineId();
  }
  const idReason = getMachineIdReason();
  if (idReason === 'degraded' || idReason === 'error') {
    console.error('[HOSTYLLO] Refusing to activate on a ' + idReason + ' hardware reading.');
    return { success: false, reason:
      'Could not read the hardware details of this PC reliably, so the '
    + 'license was NOT activated - activating now would stop the app '
    + 'opening later. Please close the app, wait a few seconds, open it '
    + 'again and enter the key. If it keeps failing, contact support.' };
  }

  try {
    const licenseData = { key: k, machineId, expiry: expiry.toISOString(),
      activatedAt: new Date().toISOString() };
    fs.writeFileSync(LICENSE_PATH, encryptLicense(licenseData, machineId), 'utf8');
    _writeLastRun();

    /* The clean reading above is what every future boot has to match, and
       machine.json is the only thing that lets a LATER degraded boot recover it
       by corroboration. computeMachineId() writes it on a clean read, but
       writeKnownFactors() swallows its own failures by design (it is a safety
       net, never fatal) — which would leave this install with no net at all,
       silently. We know the reading was clean, so make sure it landed. */
    try {
      const stateDir = app.getPath('userData');
      if (!_machineId.readKnownFactors(stateDir)) {
        const again = _machineId.computeMachineId({ stateDir, logger: console });
        if (again.reason === 'clean') _machineId.writeKnownFactors(stateDir, again.factors);
        if (!_machineId.readKnownFactors(stateDir))
          console.error('[HOSTYLLO] Activated, but could not record the hardware ' +
                        'fingerprint — a future probe failure will not self-recover.');
      }
    } catch (e) {
      console.error('[HOSTYLLO] Fingerprint record check failed:', e.message);
    }
    // The cached decision is now stale by definition — a moment ago this
    // machine was unlicensed.
    refreshEnforcement();
    // And register with the control plane NOW. The device service schedules its
    // first sync shortly after boot, which on a new install is before the
    // customer has typed their key — so without this a freshly activated
    // machine would not appear in the portal, or receive its entitlement, until
    // the next connectivity transition or the six-hourly tick.
    try { if (online && online.device) online.device.sync().catch(() => {}); } catch (_) {}
    return {
      success: true,
      message: 'License activated successfully!',
      expiry:  expiry.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' }),
      lifetime: false
    };
  } catch (e) {
    // [FIX-07] Do NOT expose internal file paths in the error message sent to renderer
    console.error('[HOSTYLLO] License write error:', e.message);
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
    title: 'License Settings — Hostyllo',
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
    message: 'Hostyllo — Offline Edition',
    detail: 'Hostel Management System\nVersion ' + app.getVersion() +
      '\n\nAll hostel data is stored locally on this device.' +
      '\nSupport: ' + SUPPORT_CONTACT
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
      `Activated: ${result.activatedAt ? new Date(result.activatedAt).toLocaleDateString('en-PK') : '—'}`,
      // Without this, "my licence suddenly stopped working" and "you are on a
      // different PC" look identical from a support call. 'degraded' means the
      // hardware probes came back short and the id is NOT the one the licence
      // was sealed against — which is a fixable problem, not a wrong machine.
      `Hardware : ${_machineIdReasonLabel(getMachineIdReason())}`
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

/* The window a warden sees instead of a crash.
   Framed on purpose — the custom title bar lives in the main renderer, and a
   frameless window with no way to close it is the last thing somebody needs
   when they are already looking at an error. */
let recoveryWindow = null;

function createRecoveryWindow() {
  recoveryWindow = new BrowserWindow({
    width: 760, height: 620, minWidth: 620, minHeight: 480,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Hostyllo — Recovery',
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
  recoveryWindow.loadFile(path.join(__dirname, 'renderer', 'recovery.html'));
  recoveryWindow.once('ready-to-show', () => recoveryWindow.show());
  recoveryWindow.on('closed', () => { recoveryWindow = null; });
  return recoveryWindow;
}

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
    detail: 'You can now safely uninstall the app from\nWindows Settings → Apps & Features.\n\nThank you for using Hostyllo!'
  });

  return { success: true, results };
});

ipcMain.handle('license:openSettings', () => openLicenseSettings());
ipcMain.handle('license:machineId', () => getMachineId());
ipcMain.handle('app:version', () => app.getVersion());

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
  const tmpFile = path.join(os.tmpdir(), 'hostyllo_pdf_' + Date.now() + '.html');
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
    console.error('[HOSTYLLO] PDF generation failed:', e.message, e.code);
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

  const tmpFile = path.join(os.tmpdir(), 'hostyllo_report_' + Date.now() + '.html');
  try {
    fs.writeFileSync(tmpFile, htmlContent, 'utf8');
    pdfWin.loadFile(tmpFile);
    pdfWin.on('closed', () => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    });
  } catch (e) {
    console.error('[HOSTYLLO] open-pdf-window failed:', e.message);
    pdfWin.destroy();
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

// [FIX-02] open-external — whitelist allowed protocols
ipcMain.on('open-external', (_e, url) => {
  const ALLOWED_PROTOCOLS = ['https:', 'http:', 'whatsapp:', 'mailto:'];
  try {
    if (typeof url !== 'string' || url.length > 2048) {
      console.warn('[HOSTYLLO] open-external: rejected (invalid type or length)');
      return;
    }
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      console.warn('[HOSTYLLO] open-external: blocked protocol:', parsed.protocol);
      return;
    }
    shell.openExternal(url).catch(e => console.error('[HOSTYLLO] open-external failed:', e.message));
  } catch (e) {
    console.error('[HOSTYLLO] open-external: invalid URL:', e.message);
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
    console.error('[HOSTYLLO] write-file: blocked unauthorized path:', norm);
    if (mainWindow) mainWindow.webContents.send('pdf-saved', {
      success: false, error: 'File location not permitted. Please choose Downloads, Documents, or Desktop.'
    });
    return;
  }

  try {
    fs.writeFileSync(filePath, data, 'utf8');
    if (mainWindow) mainWindow.webContents.send('pdf-saved', { success: true, filePath });
  } catch (e) {
    console.error('[HOSTYLLO] write-file failed:', e.message);
    if (mainWindow) mainWindow.webContents.send('pdf-saved', {
      success: false, error: 'Could not save file. Check folder permissions.' // [FIX-07]
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AUTO UPDATER
// ════════════════════════════════════════════════════════════════════════════
const RELEASES_URL = 'https://github.com/mushtaqahmaduop/HOSTIX-APP/releases';

/* Which file "Download" should hand the browser.

   Sending a warden to the releases PAGE was the wrong end of this. That page is
   built for programmers — tags, commits, a collapsed Assets list, and GitHub's
   sign-up popup for anyone not logged in. Nothing there blocks them (the repo
   is public, and the installers download with no account — verified), but it
   READS like it demands one, and it asks a hostel manager to choose between
   three .exe files on the strength of the words "x64" and "ia32". The v5.0.0
   installers sat at zero downloads.

   So link the FILE, not the page: the browser starts downloading immediately
   and GitHub is never seen. This changes no security property — same file, same
   host, same absent signature. It removes a wall, not a check.

   The filename is READ from the update feed rather than assembled from a
   template. `info.files` is latest.yml's own list, so a later change to
   `nsis.artifactName` in package.json cannot leave this pointing at a 404 that
   would only surface on a client's machine, after a release, with nobody able
   to see why.

   Architecture: this hands back the SAME arch the running copy is, not the best
   one the hardware could take. `process.arch` in Electron is the build's arch,
   so a 32-bit install on 64-bit hardware reports ia32 — and staying on ia32 is
   the predictable answer for an in-place upgrade. Moving a hostel from 32- to
   64-bit is a deliberate migration, not something an update dialog does behind
   their back.

   Every unknown falls back to the releases page, which is where this started —
   worse, but never broken. */
function updateDownloadUrl(info) {
  try {
    if (!info || !info.version) return RELEASES_URL + '/latest';
    const want  = process.arch === 'ia32' ? 'ia32' : 'x64';
    const files = Array.isArray(info.files) ? info.files : [];
    const named = f => String((f && f.url) || '');

    const asset =
      // the installer built for this architecture…
      files.find(f => new RegExp('-' + want + '\\.exe$', 'i').test(named(f)))
      // …or the combined installer, which carries no arch suffix at all
      || files.find(f => /\.exe$/i.test(named(f)) && !/-(ia32|x64)\.exe$/i.test(named(f)));

    const file = (asset && asset.url) || info.path;
    if (!file || !/\.exe$/i.test(file)) return RELEASES_URL + '/latest';
    return RELEASES_URL + '/download/v' + encodeURIComponent(info.version)
         + '/' + encodeURIComponent(file);
  } catch (e) {
    console.error('[HOSTYLLO] update url build failed:', e.message);
    return RELEASES_URL + '/latest';
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return;

  // [D-2] Update available — announce only. Nothing downloads or installs by
  // itself; the owner starts the download and runs the installer deliberately.
  autoUpdater.on('update-available', (info) => {
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Hostyllo v${info.version} is available`,
      detail: 'Your current version keeps working normally.\n\n'
            + 'Choose "Download" and the installer starts downloading in your '
            + 'browser. When it finishes, close Hostyllo and run it. Your data '
            + 'and licence are not affected.\n\n'
            + 'Windows will warn that the publisher is unknown — choose '
            + 'More info, then Run anyway.',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        shell.openExternal(updateDownloadUrl(info))
          .catch(e => console.error('[HOSTYLLO] open update url failed:', e.message));
      }
    });
  });

  // No update — silent, no dialog needed
  autoUpdater.on('update-not-available', () => {
    console.log('[HOSTYLLO] App is up to date.');
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
      message: `Hostyllo v${info.version} is ready to install`,
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
    console.error('[HOSTYLLO] Auto-update error:', err.message);
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

/* BACKUP VALIDATION, ON THE SIDE OF THE BOUNDARY THAT COUNTS.
 *
 * validateBackup() in the renderer already refuses every shape this refuses,
 * and tests/backup-hostile-input.spec.js proves it. But that check runs on the
 * untrusted side: it is what restoreBackup() chooses to call before it asks for
 * the import, not something the import requires. A caller reaching db:importFull
 * directly — a bug in another module, a future screen, anything with the bridge
 * — got no check at all, and this handler DELETEs fifteen tables.
 *
 * So this is deliberately a duplicate rather than a refactor. The renderer's
 * copy explains itself to the user in the restore dialog; this one is the one
 * that cannot be skipped. Keep them agreeing on what is valid, and let them
 * differ on what they do about it.
 *
 * Structural only, on purpose. It rejects documents that cannot be written —
 * wrong root type, a table that is not an array, a record with no usable id,
 * settings that are not an object — and says nothing about whether the contents
 * make business sense. A restore of a real hostel's data must not fail because
 * this function had an opinion about their rent.
 */
function _validateBackupPayload(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'Not a backup document — expected a JSON object.' };
  }

  // A backup carrying none of our tables is somebody else's file. Without this
  // an unrelated JSON document would validate and empty every table.
  const present = BACKUP_TABLES.filter(t => Object.prototype.hasOwnProperty.call(data, t));
  if (!present.length) {
    return { ok: false, reason: 'This file contains no Hostyllo data.' };
  }

  for (const t of present) {
    const rows = data[t];
    if (!Array.isArray(rows)) {
      return { ok: false, reason: `"${t}" must be a list of records.` };
    }
    for (const r of rows) {
      if (r === null || typeof r !== 'object' || Array.isArray(r)) {
        return { ok: false, reason: `"${t}" contains an entry that is not a record.` };
      }
      // db:importFull binds r.id straight into an INSERT. undefined, null and
      // '' all bind as NULL and collide on the primary key, so the row that
      // looks saved is the only one of them that survives.
      if (r.id === undefined || r.id === null || String(r.id).trim() === '') {
        return { ok: false, reason: `"${t}" contains a record with no id.` };
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'settings')) {
    const s = data.settings;
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      return { ok: false, reason: 'Settings must be an object.' };
    }
  }

  return { ok: true };
}

/* THE SNAPSHOT TAKEN BEFORE A RESTORE OVERWRITES ANYTHING.
 *
 * The transaction around db:importFull protects against a crash. It does not
 * protect against the restore SUCCEEDING with the wrong file, which commits
 * cleanly over a live hostel's records and has no undo. Spec §16 asks for this
 * snapshot for exactly that case.
 *
 * VACUUM INTO is the same idiom the pre-migration backup uses, and it is the
 * right one: a consistent copy of the whole database taken through SQLite
 * rather than a file copy racing the WAL.
 *
 * TIMESTAMPED, AND THREE ARE KEPT, because a single fixed filename is a trap.
 * Restore a bad file, notice, restore again — and the second snapshot captures
 * the bad state on top of the good one, leaving nothing to go back to. That is
 * precisely the "never overwrite the only known-good copy" rule, and a fixed
 * name breaks it on the second attempt rather than the first.
 *
 * A snapshot failure does NOT block the restore. Refusing to restore because a
 * safety copy could not be written would strand a customer whose disk is full
 * on the broken database they are trying to escape. The reason is returned so
 * the caller can say so.
 */
const PRE_RESTORE_KEEP = 3;

function _preRestoreSnapshot() {
  if (!dbPath) return { ok: false, reason: 'no database path' };
  try {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    // Milliseconds are in the name because seconds are not enough. VACUUM INTO
    // refuses to write a file that already exists, so two restores inside the
    // same second lost the second snapshot — and lost it quietly, reporting a
    // failure reason nobody was going to read. Fixed width keeps the plain
    // lexicographic sort below chronological.
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
                  `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
                  `-${String(d.getMilliseconds()).padStart(3, '0')}`;
    const target = `${dbPath}.pre-restore-${stamp}.bak`;

    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

    // Prune oldest first, and only ever our own snapshots.
    try {
      const dir  = path.dirname(dbPath);
      const base = path.basename(dbPath) + '.pre-restore-';
      const mine = fs.readdirSync(dir)
        .filter(f => f.startsWith(base) && f.endsWith('.bak'))
        .sort();
      for (const f of mine.slice(0, Math.max(0, mine.length - PRE_RESTORE_KEEP))) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (_) { /* a stale copy is not worth failing over */ }
      }
    } catch (_) { /* pruning is housekeeping, never a reason to stop */ }

    console.log('[HOSTYLLO] Pre-restore backup written:', target);
    return { ok: true, path: target };
  } catch (e) {
    console.error('[HOSTYLLO] Pre-restore backup FAILED:', e.message);
    return { ok: false, reason: e.message };
  }
}

ipcMain.handle('db:upsert', (_e, table, id, record) => {
  try {
    _assertRendererTable(table);
    _assertDbWritable();
    _assertWritable(table);
    _dbInsert(table, id, record);
    return { ok: true };
  } catch (e) { return _writeFailure(e); }
});

ipcMain.handle('db:delete', (_e, table, id) => {
  try {
    _assertRendererTable(table);
    _assertDbWritable();
    _assertWritable(table);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return { ok: true };
  } catch (e) { return _writeFailure(e); }
});

ipcMain.handle('db:bulkReplace', (_e, table, records) => {
  try {
    _assertRendererTable(table);
    _assertDbWritable();
    _assertWritable(table);
    const transaction = db.transaction((rows) => {
      db.prepare(`DELETE FROM ${table}`).run();
      for (const r of rows) _dbInsert(table, r.id, r);
    });
    transaction(records);
    return { ok: true };
  } catch (e) { console.error('[DB] bulkReplace:', e.message); return _writeFailure(e); }
});

ipcMain.handle('db:getSetting', (_e, key) => {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  } catch (e) { return null; }
});

ipcMain.handle('db:setSetting', (_e, key, value) => {
  try {
    /* D-3, closed. §18 names "configuration mutation" among the operations a
       read-only install must block, and this handler was the one write path
       that checked health but never the licence — so a suspended hostel could
       still change its settings.

       `settings` is not in enforcement's ALWAYS_WRITABLE set (only the activity
       log is, so a lockout is not the one period with no audit trail), so the
       licence gate applies to it in full.

       Worth knowing: this handler currently has NO callers — nothing in the
       renderer invokes `dbSetSetting`, though preload.js:100 exposes it. It is
       guarded because it is reachable, not because a screen depends on it. */
    _assertDbWritable();
    _assertWritable('settings');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) { return _writeFailure(e); }
});

/* ── Health and recovery IPC ────────────────────────────────────────────────
   db:health is read by the support screen and by the recovery window. It is
   deliberately available even when the database is not: that is the case it
   exists to describe. */
ipcMain.handle('db:health', () => ({
  state:   dbHealth.state,
  reason:  dbHealth.reason,
  at:      dbHealth.at,
  dbPath:  dbPath || null,
  schemaVersion: (() => {
    try { return db ? migration001.currentVersion(db) : null; } catch (_) { return null; }
  })(),
}));

ipcMain.handle('recovery:list', () => {
  try { return { ok: true, snapshots: _listRecoverySnapshots() }; }
  catch (e) { return { ok: false, error: e.message, snapshots: [] }; }
});

/* Restore and restart are two calls, not one.
   A successful recovery leaves the process running against a database that is
   no longer the file on disk, so the restart is mandatory — but doing it inside
   the restore means the only way to check that the swap was correct is to watch
   an app disappear. Separating them lets the recovery screen drive both while
   a test can verify the filesystem in between. */
ipcMain.handle('recovery:restore', (_e, snapshotPath) => _recoverFromSnapshot(snapshotPath));

ipcMain.handle('recovery:restart', () => {
  setTimeout(() => { app.relaunch(); app.exit(0); }, 200);
  return { ok: true };
});

ipcMain.handle('db:exportFull', () => {
  try {
    const tables = BACKUP_TABLES;
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
  try { _assertDbWritable(); _assertWritable('import'); }
  catch (e) { return _writeFailure(e); }

  // Refuse before anything is deleted. The renderer checks this too; that check
  // is the one the user sees, this is the one that cannot be bypassed.
  const valid = _validateBackupPayload(data);
  if (!valid.ok) return { ok: false, error: valid.reason, code: 'INVALID_BACKUP' };

  // Snapshot the live database while it is still the good one.
  const snap = _preRestoreSnapshot();

  try {
    const transaction = db.transaction(() => {
      const tables = BACKUP_TABLES;
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
    // The snapshot's fate is reported, never guessed at. A restore that
    // succeeded without a safety copy is a different thing to one that had one,
    // and the caller is entitled to know which it just did.
    return { ok: true, preRestoreBackup: snap.ok ? snap.path : null,
             preRestoreBackupError: snap.ok ? null : snap.reason };
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
      //
      // 'unsafe-eval' IS GONE (audit M2). It was never needed: nothing in this
      // app or in any bundled library calls eval() or the Function constructor
      // — verified across chart.umd.js, chartjs-plugin-datalabels and
      // xlsx.full.min.js, whose only "Function(" match is a method NAMED
      // _tickFormatFunction. Removing it means a string that reaches a script
      // context can no longer become code, which is the last step of most
      // injection chains and a useful backstop now that the control plane
      // supplies content.
      //
      // 'unsafe-inline' STAYS, and this is a deliberate, documented decision
      // rather than an oversight. The UI is built from inline onclick/oninput
      // handlers in generated HTML across every module; removing it means
      // rewriting every screen's event wiring to addEventListener, which is a
      // far larger change than the audit asks for and would risk exactly the
      // kind of broad regression Rule 1 exists to prevent. The escaping sweep
      // is what protects those handlers: no user-typed value reaches HTML
      // unescaped, so none can close an attribute and open a new one.
      'Content-Security-Policy': [
        "default-src 'self';" +
        "script-src 'self' 'unsafe-inline';" +
        "style-src 'self' 'unsafe-inline';" +
        "font-src 'self' data:;" +
        "img-src 'self' data: blob:;" +
        "connect-src 'self';" +
        "worker-src 'self' blob:;"
      ]
    }
  });
});
  /* THE CAMERA WAS BEING DENIED BY THIS APP, NOT BY WINDOWS.

     Student photos are captured with navigator.mediaDevices.getUserMedia(),
     which Electron gates behind the 'media' permission — and 'media' was not on
     this list, so the handler called back false every time. The camera could
     never work, on any machine, however Windows was configured. The error the
     warden saw then sent them to Windows Settings to fix a Windows setting that
     was not the problem.

     'media' is allowed, but only for VIDEO. The app has no feature that records
     audio, so a microphone request is still refused — a permission nothing
     needs should not be granted just because it arrives on the same channel. */
  const ALLOWED_PERMS = ['clipboard-read', 'clipboard-sanitized-write'];

  function _permitted(permission, details) {
    if (permission === 'media') {
      const want = (details && details.mediaTypes) || [];
      // No mediaTypes at all is the permission CHECK, which Chromium makes
      // without saying what for; allow it and let the request itself decide.
      if (!want.length) return true;
      return want.includes('video') && !want.includes('audio');
    }
    return ALLOWED_PERMS.includes(permission);
  }

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(_permitted(permission, details));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    return _permitted(permission, details);
  });
  initDatabase();

  /* A damaged database stops the boot here, deliberately.
     Online services want a live handle, createWindow() loads a UI whose every
     screen reads from one, and the licence flow writes. None of that is safe or
     meaningful against a file we have just proved is broken — and pressing on
     regardless is how a warden ends up staring at a wall of render errors with
     nothing telling them their data is intact in a backup beside it. */
  if (dbHealth.state === 'CORRUPT' || dbHealth.state === 'UNSUPPORTED_SCHEMA') {
    createRecoveryWindow();
    return;
  }

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
      machineIdProvider: getMachineId,

      // Registration needs the licence key the customer activated with.
      // _licenceSnapshot() reads the file and writes nothing, so calling it
      // from a background service cannot advance the anti-rollback watermark.
      licenceProvider: () => { try { return _licenceSnapshot(); } catch (_) { return null; } },

      // A suspension arriving mid-session must take effect now — recompute the
      // decision and push it to every open window, rather than leaving the
      // warden to discover it when a save fails with no explanation.
      onEntitlementChanged: () => { try { refreshEnforcement(); } catch (_) {} }
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
        console.warn('[HOSTYLLO] Update check failed:', e.message)
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