// ════════════════════════════════════════════════════════════════════════════
// Database health  —  Phase 1 (spec §19.2, §26)
//
// WHAT THIS EXISTS TO PREVENT
//
// At baseline a corrupt `hostix.db` made `new Database(path)` throw inside
// `initDatabase()`, which is called unguarded from `app.whenReady`. The app
// failed to start with no message, no diagnosis and no route back — and the
// `.pre-v1.bak` snapshot sitting next to it was never offered, because nothing
// got far enough to look. That is the single worst outcome in the product: the
// customer's data may be perfectly recoverable and they cannot tell.
//
// So the database is now CHECKED before it is trusted, and the result is a
// value the caller can act on rather than an exception it has to guess at.
//
// ── WHY TWO PRAGMAS, AND WHY quick_check FIRST ─────────────────────────────
//
// `integrity_check` reads every page and validates every index. On the scale
// baseline (500 students, 8,179 payments, ~6 MB) that is fine, but it is O(size)
// and it runs on every boot, in front of a warden waiting for a login screen.
// `quick_check` skips the index cross-checks and is dramatically cheaper.
//
// The compromise: `quick_check` on every open, and the full `integrity_check`
// only when quick_check reports a problem — at which point the extra time is
// obviously worth spending — or when a caller explicitly asks (support, or
// after a restore). A `quick_check` pass does not prove an index is consistent;
// it does prove the pages are readable, which is what stands between the
// customer and the failure above.
//
// ── STATES ─────────────────────────────────────────────────────────────────
//
//   OK          the database opened and quick_check said ok
//   CORRUPT     it opened but the check failed, OR opening raised one of
//               SQLite's corruption codes. Recoverable from a backup.
//   UNREADABLE  the file cannot be opened at all — permissions, a lock, a
//               missing directory. NOT a corruption, and telling the two apart
//               matters: one needs a restore, the other needs a permission fix,
//               and offering a restore for a locked file would destroy a
//               healthy database to solve a problem it does not have.
//   MISSING     no file. A first run, not a fault.
//
// Nothing here writes, and nothing here deletes. Recovery is a decision for the
// main process to take with the user watching; this module only reports.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

const STATE = Object.freeze({
  OK:         'OK',
  CORRUPT:    'CORRUPT',
  UNREADABLE: 'UNREADABLE',
  MISSING:    'MISSING',
});

/**
 * SQLite's own corruption signals. `SQLITE_NOTADB` is the one a truncated or
 * overwritten file produces, and it is the shape `corrupt.db` in the fixture
 * set was built to raise.
 */
const CORRUPT_CODES = new Set([
  'SQLITE_CORRUPT', 'SQLITE_NOTADB', 'SQLITE_FORMAT',
]);
const CORRUPT_PATTERNS = [
  /file is not a database/i,
  /database disk image is malformed/i,
  /database corruption/i,
  /malformed database schema/i,
];

function _looksCorrupt(err) {
  if (!err) return false;
  if (err.code && CORRUPT_CODES.has(err.code)) return true;
  const msg = String(err.message || '');
  return CORRUPT_PATTERNS.some(re => re.test(msg));
}

/**
 * Check a database file without modifying it.
 *
 * @param {string} file                      path to hostix.db
 * @param {object} [opts]
 * @param {boolean} [opts.full]              run the full integrity_check too
 * @param {Function} [opts.DatabaseCtor]     injected for tests
 * @returns {{state:string, ok:boolean, detail:string|null, durationMs:number,
 *            quickCheck:string|null, integrityCheck:string|null}}
 */
function check(file, opts) {
  const o = opts || {};
  const Database = o.DatabaseCtor || require('better-sqlite3');
  const started = Date.now();
  const out = (state, detail, extra) => Object.assign({
    state, ok: state === STATE.OK, detail: detail || null,
    durationMs: Date.now() - started,
    quickCheck: null, integrityCheck: null,
  }, extra || {});

  if (!file) return out(STATE.MISSING, 'no path given');
  try {
    if (!fs.existsSync(file)) return out(STATE.MISSING, 'file does not exist');
  } catch (e) {
    return out(STATE.UNREADABLE, e.message);
  }

  // A zero-byte file is what an interrupted create leaves behind. SQLite opens
  // it happily and treats it as a brand-new empty database, which would look
  // like a customer losing everything rather than a file that never formed.
  try {
    if (fs.statSync(file).size === 0) return out(STATE.CORRUPT, 'file is zero bytes');
  } catch (_) { /* fall through to the open */ }

  let db = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
  } catch (e) {
    return out(_looksCorrupt(e) ? STATE.CORRUPT : STATE.UNREADABLE, e.message);
  }

  try {
    const quick = String(db.pragma('quick_check', { simple: true }));
    if (quick !== 'ok') {
      // Now the expensive one is worth its cost — it says WHAT is wrong, which
      // is what a support call needs.
      let full = null;
      try { full = String(db.pragma('integrity_check', { simple: true })); } catch (_) {}
      return out(STATE.CORRUPT, quick, { quickCheck: quick, integrityCheck: full });
    }

    let integrity = null;
    if (o.full) {
      integrity = String(db.pragma('integrity_check', { simple: true }));
      if (integrity !== 'ok') {
        return out(STATE.CORRUPT, integrity, { quickCheck: quick, integrityCheck: integrity });
      }
    }
    return out(STATE.OK, null, { quickCheck: quick, integrityCheck: integrity });
  } catch (e) {
    return out(_looksCorrupt(e) ? STATE.CORRUPT : STATE.UNREADABLE, e.message);
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

// ── Write-failure classification (spec §11.1, §19.3) ───────────────────────

const WRITE_ERROR = Object.freeze({
  DISK_FULL:     'DISK_FULL',
  READ_ONLY:     'READ_ONLY',
  PERMISSION:    'PERMISSION',
  LOCKED:        'LOCKED',
  CORRUPT:       'CORRUPT',
  LICENCE:       'LICENCE_READ_ONLY',
  UNKNOWN:       'UNKNOWN',
});

/**
 * Turn a thrown write error into a code the UI can act on.
 *
 * §19.3 requires DISK_FULL to be distinguishable, because the remedy is
 * something only the customer can do and the message has to say so. The rest
 * are separated for the same reason: "the folder is read-only" and "the disk is
 * full" both fail a save, and telling a warden the wrong one wastes their day.
 *
 * @returns {{code:string, message:string, retryable:boolean}}
 */
function classifyWriteError(err) {
  const code = (err && err.code) || '';
  const msg  = String((err && err.message) || '');

  if (err && err.code === 'LICENCE_READ_ONLY') {
    return { code: WRITE_ERROR.LICENCE, retryable: false,
      message: msg || 'This licence does not currently allow new entries.' };
  }
  if (code === 'SQLITE_FULL' || /disk is full|database or disk is full|ENOSPC/i.test(msg)) {
    return { code: WRITE_ERROR.DISK_FULL, retryable: true,
      message: 'The disk is full, so nothing could be saved. Free some space and try again.' };
  }
  if (code === 'SQLITE_READONLY' || /readonly database|attempt to write a readonly/i.test(msg)) {
    return { code: WRITE_ERROR.READ_ONLY, retryable: true,
      message: 'The database file is read-only, so nothing could be saved.' };
  }
  if (code === 'SQLITE_PERM' || code === 'SQLITE_CANTOPEN' || /EACCES|EPERM|access is denied/i.test(msg)) {
    return { code: WRITE_ERROR.PERMISSION, retryable: true,
      message: 'Windows would not let the app write its data file.' };
  }
  if (code === 'SQLITE_BUSY' || /database is locked/i.test(msg)) {
    return { code: WRITE_ERROR.LOCKED, retryable: true,
      message: 'The database is in use by another copy of the app. Close the other window and try again.' };
  }
  if (_looksCorrupt(err)) {
    return { code: WRITE_ERROR.CORRUPT, retryable: false,
      message: 'The database file is damaged. Nothing was saved.' };
  }
  return { code: WRITE_ERROR.UNKNOWN, retryable: true,
    message: msg || 'The change could not be saved.' };
}

/** Free bytes on the volume holding `dir`, or null when it cannot be read. */
function freeSpaceBytes(dir) {
  try {
    const s = fs.statfsSync(path.resolve(dir));
    return s.bavail * s.bsize;
  } catch (_) {
    return null;      // statfsSync is Node 18.15+; older runtimes just get null
  }
}

module.exports = {
  STATE, WRITE_ERROR,
  check, classifyWriteError, freeSpaceBytes,
  _looksCorrupt,
};
