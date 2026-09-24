// ════════════════════════════════════════════════════════════════════════════
// Local backups  —  Phase 1 (spec §14)
//
// THE GAP THIS CLOSES
//
// At baseline there was NO automatic backup. A hostel's only copy of its data
// was whatever a warden had remembered to export, and a corrupt database had no
// route back. The intelligence brief rated recovery NOT READY for exactly this
// reason, and it is the risk most likely to end a customer relationship.
//
// ── WHY `VACUUM INTO` AND NOT A FILE COPY ──────────────────────────────────
//
// The database runs in WAL mode. Copying `hostix.db` while the app is live
// copies a file whose most recent transactions are still in `hostix.db-wal`,
// so the copy is silently behind — and "silently behind" is the worst kind of
// backup, because it restores successfully and loses the last hour.
//
// `VACUUM INTO` asks SQLite to write a fresh, fully checkpointed, defragmented
// database at a new path, inside a read transaction. The result is a complete
// single-file snapshot with no sidecars, consistent as of the moment it ran.
// It is also what `main.js` already uses for the pre-migration snapshot, so
// this is the same mechanism rather than a second opinion about how to copy a
// database.
//
// ── NO FAILED BACKUP MAY BE PRESENTED AS HEALTHY (§14.2) ───────────────────
//
// A backup that cannot be restored is worse than no backup, because it stops
// anyone looking for a real one. So every snapshot is VERIFIED before it is
// allowed to count: reopened, integrity-checked, and its row counts compared
// against the source it was taken from. A snapshot that fails verification is
// deleted, not kept with a warning — a file in the backups folder is a promise.
//
// ── RETENTION ──────────────────────────────────────────────────────────────
//
// Bounded and rotating (§14.1). Keeping every backup fills a hostel's disk and
// then breaks the writes it was protecting, which turns the safety net into the
// hazard. Oldest-first pruning, and the newest verified backup is never pruned
// even if it is the only one over the limit.
//
// The state machine of §14.2 is reported in the result rather than held as
// instance state: every caller here is a one-shot operation, and a status field
// that outlives the operation is a thing that can go stale.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const health = require('./db-health');

/** §14.2. Reported per operation, never stored. */
const PHASE = Object.freeze({
  PREPARING:    'PREPARING',
  SNAPSHOTTING: 'SNAPSHOTTING',
  VALIDATING:   'VALIDATING',
  COMPLETED:    'COMPLETED',
  FAILED:       'FAILED',
  INVALID:      'INVALID',
});

const DIR_NAME     = 'backups';
const PREFIX       = 'hostix-';
const EXT          = '.db';
/** Enough for a fortnight of daily snapshots plus the pre-operation ones. */
const DEFAULT_KEEP = 14;
/** A snapshot needs room for a second copy; refuse rather than half-write one. */
const HEADROOM     = 1.25;

const RE_BACKUP = /^hostix-(\d{8}-\d{6})(?:-([a-z0-9-]+))?\.db$/;

function backupDir(userDataDir) {
  return path.join(userDataDir, DIR_NAME);
}

/** `20260905-143012` — sorts lexically, which is why it is not ISO. */
function stamp(now) {
  const d = new Date(now);
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
         p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/**
 * Every backup on disk, newest first.
 * @returns {Array<{file:string, path:string, stamp:string, label:string|null,
 *                  bytes:number, mtimeMs:number}>}
 */
function list(userDataDir) {
  const dir = backupDir(userDataDir);
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return []; }
  const out = [];
  for (const file of names) {
    const m = RE_BACKUP.exec(file);
    if (!m) continue;
    const full = path.join(dir, file);
    let st;
    try { st = fs.statSync(full); } catch (_) { continue; }
    out.push({ file, path: full, stamp: m[1], label: m[2] || null,
      bytes: st.size, mtimeMs: st.mtimeMs });
  }
  // By the stamp in the NAME, not mtime — a file copied or restored from
  // elsewhere carries a new mtime and would sort as though it were recent.
  out.sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));
  return out;
}

/** Row counts per business table, for comparing a snapshot with its source. */
function _counts(db) {
  const out = {};
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  for (const { name } of tables) {
    if (name.startsWith('sqlite_')) continue;
    try { out[name] = db.prepare('SELECT COUNT(*) c FROM "' + name + '"').get().c; }
    catch (_) { /* a table we cannot count is reported by integrity_check */ }
  }
  return out;
}

/**
 * Verify a snapshot can actually be restored from.
 *
 * Integrity first, then a row-count comparison against the source. The counts
 * matter because `VACUUM INTO` can succeed against a database whose pages are
 * fine but whose content was mid-write; comparing what came out with what went
 * in is the only cheap check that the snapshot is COMPLETE rather than merely
 * well-formed.
 *
 * @returns {{ok:boolean, reason:string|null, counts:object|null}}
 */
function verify(snapshotPath, expectedCounts, opts) {
  const o = opts || {};
  const Database = o.DatabaseCtor || require('better-sqlite3');

  const h = health.check(snapshotPath, { full: true, DatabaseCtor: Database });
  if (!h.ok) return { ok: false, reason: 'integrity: ' + (h.detail || h.state), counts: null };

  let db = null;
  try {
    db = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    const got = _counts(db);
    if (expectedCounts) {
      for (const [table, n] of Object.entries(expectedCounts)) {
        if (got[table] === undefined) return { ok: false, reason: 'missing table: ' + table, counts: got };
        if (got[table] !== n) {
          return { ok: false, counts: got,
            reason: 'row count differs for ' + table + ': expected ' + n + ', snapshot has ' + got[table] };
        }
      }
    }
    return { ok: true, reason: null, counts: got };
  } catch (e) {
    return { ok: false, reason: e.message, counts: null };
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

/**
 * Take a verified snapshot of the LIVE database.
 *
 * @param {object} opts
 * @param {object}  opts.db            an open better-sqlite3 handle (the live one)
 * @param {string}  opts.userDataDir
 * @param {string}  [opts.label]       'pre-restore', 'pre-migration', 'scheduled', 'manual'
 * @param {number}  [opts.now]
 * @param {number}  [opts.keep]        retention, default 14
 * @param {Function}[opts.DatabaseCtor]
 * @returns {{ok:boolean, phase:string, path:string|null, bytes:number|null,
 *            reason:string|null, code:string|null, pruned:string[]}}
 */
function snapshot(opts) {
  const o = opts || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const dir = backupDir(o.userDataDir);
  const fail = (phase, reason, code) =>
    ({ ok: false, phase, path: null, bytes: null, reason, code: code || null, pruned: [] });

  // ── PREPARING ────────────────────────────────────────────────────────────
  if (!o.db) return fail(PHASE.PREPARING, 'no database handle');
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { return fail(PHASE.PREPARING, 'cannot create ' + dir + ': ' + e.message); }

  let sourceBytes = 0, expected = null;
  try {
    expected = _counts(o.db);
    const f = o.db.name;                     // better-sqlite3 exposes the file path
    if (f && fs.existsSync(f)) sourceBytes = fs.statSync(f).size;
  } catch (e) {
    return fail(PHASE.PREPARING, 'cannot read the live database: ' + e.message);
  }

  /* Refuse rather than half-write. A snapshot that runs out of disk leaves a
     truncated file in the backups folder, and §14.2 forbids a failed backup
     being presented as healthy — the cheapest way to honour that is not to
     start one that cannot finish. */
  const free = health.freeSpaceBytes(dir);
  if (free !== null && sourceBytes > 0 && free < sourceBytes * HEADROOM) {
    return fail(PHASE.PREPARING,
      'not enough free disk space for a backup (' + Math.round(sourceBytes * HEADROOM / 1048576) +
      ' MB needed, ' + Math.round(free / 1048576) + ' MB free)', health.WRITE_ERROR.DISK_FULL);
  }

  const name = PREFIX + stamp(now) + (o.label ? '-' + o.label : '') + EXT;
  const dest = path.join(dir, name);
  if (fs.existsSync(dest)) {
    // Same second, same label. Not an error worth failing an app over.
    return { ok: true, phase: PHASE.COMPLETED, path: dest,
      bytes: fs.statSync(dest).size, reason: 'already exists', code: null, pruned: [] };
  }

  // ── SNAPSHOTTING ─────────────────────────────────────────────────────────
  try {
    o.db.exec("VACUUM INTO '" + dest.replace(/'/g, "''") + "'");
  } catch (e) {
    try { fs.rmSync(dest, { force: true }); } catch (_) {}
    const c = health.classifyWriteError(e);
    return fail(PHASE.FAILED, c.message, c.code);
  }

  // ── VALIDATING ───────────────────────────────────────────────────────────
  const v = verify(dest, expected, { DatabaseCtor: o.DatabaseCtor });
  if (!v.ok) {
    /* Delete it. A file in the backups folder is a promise that it can be
       restored from, and keeping a broken one would stop somebody looking for
       a backup that actually works. */
    try { fs.rmSync(dest, { force: true }); } catch (_) {}
    return fail(PHASE.INVALID, 'the snapshot failed verification and was discarded: ' + v.reason);
  }

  const pruned = rotate(o.userDataDir, Number.isFinite(o.keep) ? o.keep : DEFAULT_KEEP);

  return { ok: true, phase: PHASE.COMPLETED, path: dest,
    bytes: fs.statSync(dest).size, reason: null, code: null, pruned };
}

/**
 * Keep the newest `keep` backups, delete the rest.
 * The newest is never pruned, whatever `keep` says — a retention setting of 0
 * should not be a way to end up with nothing.
 * @returns {string[]} filenames removed
 */
function rotate(userDataDir, keep) {
  const n = Number.isFinite(keep) ? Math.max(1, keep) : DEFAULT_KEEP;
  const all = list(userDataDir);
  const doomed = all.slice(n);
  const removed = [];
  for (const b of doomed) {
    try { fs.rmSync(b.path, { force: true }); removed.push(b.file); } catch (_) {}
  }
  return removed;
}

/**
 * The scheduled backup. Does nothing unless the newest one is older than
 * `intervalMs`, so it is safe to call on a timer or at every boot.
 *
 * @returns {{ran:boolean, ...snapshotResult}|{ran:false, reason:string}}
 */
function runScheduled(opts) {
  const o = opts || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const every = Number.isFinite(o.intervalMs) ? o.intervalMs : 24 * 60 * 60 * 1000;

  const newest = list(o.userDataDir).find(b => b.label === 'scheduled' || b.label === null);
  if (newest) {
    const age = now - _stampToMs(newest.stamp);
    if (age >= 0 && age < every) {
      return { ran: false, reason: 'a backup from ' + newest.stamp + ' is still current' };
    }
  }
  return Object.assign({ ran: true },
    snapshot({ db: o.db, userDataDir: o.userDataDir, label: 'scheduled',
      now, keep: o.keep, DatabaseCtor: o.DatabaseCtor }));
}

/** `20260905-143012` → ms. Local time, matching how it was written. */
function _stampToMs(s) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(String(s || ''));
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

/**
 * The newest backup that passes verification — what a recovery screen offers.
 * Verifying costs a full integrity check per candidate, so it stops at the
 * first good one rather than ranking them all.
 */
function newestVerified(userDataDir, opts) {
  for (const b of list(userDataDir)) {
    const v = verify(b.path, null, opts);
    if (v.ok) return Object.assign({}, b, { counts: v.counts });
  }
  return null;
}

module.exports = {
  PHASE, DIR_NAME, DEFAULT_KEEP,
  backupDir, list, snapshot, verify, rotate, runScheduled, newestVerified,
  _stampToMs, _counts,
};
