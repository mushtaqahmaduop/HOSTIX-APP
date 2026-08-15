// ════════════════════════════════════════════════════════════════════════════
// Structured logging  —  Phase 1  (spec §40)
//
// The audit (H5) found no diagnostics substrate at all: `console.log` only, and
// no uncaughtException / unhandledRejection handler in main. When a hostel
// reports "it crashed", there is currently nothing on disk to read.
//
// Format: one JSON object per line (JSONL), so a log file can be tailed by a
// human and parsed by a machine without a second format.
//
//   {"ts":"…","level":"ERROR","service":"api","event":"request_failed",
//    "correlationId":"…","errorCode":"ETIMEDOUT","meta":{…}}
//
// Every `meta` object goes through redact.js first — §40's do-not-log list is
// enforced here, not left to the discretion of each call site.
//
// CRASH SEMANTICS ARE DELIBERATELY UNCHANGED. installCrashHandlers() logs and
// then reproduces Node's own default behaviour (stack to stderr, exit 1).
// Installing a handler that swallowed the crash would change how the app fails
// on 50+ production machines, which is not Phase 1's business.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');
const { redact, redactString } = require('./redact');

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

// Keep 7 days of history. Enough to investigate a report that arrives after a
// weekend; small enough that it is never the reason a disk fills up.
const RETAIN_FILES   = 7;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

let _dir        = null;   // resolved log directory, null until init()
let _lastDay    = null;   // day the rotate/prune check last ran
let _minLevel   = LEVELS.INFO;
let _console    = true;   // mirror to console (always on in dev)
let _writeFailed = false; // stop retrying a broken disk on every single line

function _today() {
  // Local date, not UTC: a hostel manager reading a log expects the day they
  // actually had the problem.
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function _fileFor(day) {
  return path.join(_dir, `hostyllo-${day}.log`);
}

function _prune() {
  try {
    const files = fs.readdirSync(_dir)
      .filter(f => /^hostyllo-\d{4}-\d{2}-\d{2}\.log$/.test(f))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - RETAIN_FILES))) {
      try { fs.unlinkSync(path.join(_dir, f)); } catch (_) { /* best effort */ }
    }
  } catch (_) { /* best effort */ }
}

function _rotateIfNeeded(day) {
  // Same-day size cap: an unexpected log storm must not grow without bound.
  try {
    const file = _fileFor(day);
    if (fs.existsSync(file) && fs.statSync(file).size >= MAX_FILE_BYTES) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.renameSync(file, path.join(_dir, `hostyllo-${day}.${stamp}.log`));
    }
  } catch (_) { /* best effort */ }
}

/**
 * Writes are SYNCHRONOUS, deliberately.
 *
 * A buffered WriteStream loses whatever is still in its buffer when the
 * process exits — which is precisely the moment a crash log matters. The
 * uncaughtException handler calls process.exit(1) immediately after logging,
 * so an async write would drop the one line anyone will ever want to read.
 *
 * Volume here is a handful of lines per minute (status transitions, queue
 * events, errors), not a request log, so the cost of appendFileSync is
 * irrelevant next to the guarantee.
 */
function _write(text) {
  const day = _today();
  if (day !== _lastDay) {
    _rotateIfNeeded(day);
    _prune();
    _lastDay = day;
  }
  fs.appendFileSync(_fileFor(day), text + os.EOL);
}

/**
 * @param {object} opts
 * @param {string} opts.dir      directory for log files (created if missing)
 * @param {string} [opts.level]  DEBUG|INFO|WARN|ERROR — default INFO
 * @param {boolean} [opts.console] mirror lines to stdout — default true
 */
function init(opts) {
  const o = opts || {};
  _dir = o.dir;
  _lastDay = null;                 // force a rotate/prune check on the next write
  _writeFailed = false;            // a new destination deserves a fresh attempt
  _minLevel = (o.level && LEVELS[o.level]) ? LEVELS[o.level] : LEVELS.INFO;
  _console = o.console !== false;
  try {
    fs.mkdirSync(_dir, { recursive: true });
  } catch (e) {
    // No log directory means no file logging. The app still runs; that is the
    // point of logging being non-essential.
    _writeFailed = true;
  }
  return module.exports;
}

/** A short id to tie one operation's lines together across services (§40). */
function newCorrelationId() {
  return crypto.randomBytes(6).toString('hex');
}

function _emit(level, service, event, fields) {
  if (LEVELS[level] < _minLevel) return;

  const f = fields || {};
  const line = {
    ts:      new Date().toISOString(),
    level,
    service: String(service || 'app'),
    event:   String(event || 'unknown')
  };
  if (f.correlationId) line.correlationId = String(f.correlationId);
  if (f.errorCode)     line.errorCode     = String(f.errorCode);
  if (f.durationMs != null && Number.isFinite(f.durationMs)) {
    line.durationMs = Math.round(f.durationMs);
  }
  if (f.err) {
    const e = f.err;
    line.error = {
      name:    e && e.name    ? String(e.name) : 'Error',
      message: redactString(String((e && e.message) || e || '')),
      code:    e && e.code ? String(e.code) : undefined
    };
    if (level === 'ERROR' && e && e.stack) {
      line.error.stack = redactString(String(e.stack));
    }
    if (!line.errorCode && e && e.code) line.errorCode = String(e.code);
  }
  // Everything the caller supplied beyond the known fields is untrusted
  // metadata and is redacted wholesale.
  const meta = {};
  for (const k of Object.keys(f)) {
    if (k === 'correlationId' || k === 'errorCode' || k === 'durationMs' || k === 'err') continue;
    meta[k] = f[k];
  }
  if (Object.keys(meta).length) line.meta = redact(meta);

  let text;
  try {
    text = JSON.stringify(line);
  } catch (_) {
    text = JSON.stringify({ ts: line.ts, level, service: line.service, event: line.event, meta: '[unserialisable]' });
  }

  if (_console) {
    const out = level === 'ERROR' || level === 'WARN' ? console.error : console.log;
    out(`[${line.service}] ${level} ${line.event}` + (line.errorCode ? ` (${line.errorCode})` : ''));
  }
  if (_dir && !_writeFailed) {
    try { _write(text); } catch (_) { _writeFailed = true; }
  }
}

/**
 * A logger bound to one service name, so call sites read
 * `log.info('probe_ok', { … })` instead of repeating the service everywhere.
 */
function forService(service) {
  return {
    debug: (event, fields) => _emit('DEBUG', service, event, fields),
    info:  (event, fields) => _emit('INFO',  service, event, fields),
    warn:  (event, fields) => _emit('WARN',  service, event, fields),
    error: (event, fields) => _emit('ERROR', service, event, fields),
    child: (sub) => forService(`${service}.${sub}`)
  };
}

/**
 * Log crashes, then behave exactly as Node would have without a handler.
 *
 * Node's default for an uncaught exception is: print the stack to stderr and
 * exit(1). Reproducing that keeps the failure mode identical to what is
 * running in production today — this adds a log file, it does not change when
 * or whether the app dies.
 */
function installCrashHandlers(onBeforeExit) {
  const log = forService('crash');

  process.on('uncaughtException', (err) => {
    try { log.error('uncaught_exception', { err }); } catch (_) {}
    try { if (typeof onBeforeExit === 'function') onBeforeExit(err); } catch (_) {}
    try { console.error(err && err.stack ? err.stack : err); } catch (_) {}
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    // Node >= 15 turns an unhandled rejection into an uncaught exception.
    // Re-throwing preserves that, and routes through the handler above so the
    // crash is logged exactly once.
    try {
      log.error('unhandled_rejection', {
        err: reason instanceof Error ? reason : new Error(String(reason))
      });
    } catch (_) {}
    throw reason;
  });
}

/**
 * Nothing to flush — writes are synchronous — so this only stops further
 * file output. Kept as an explicit lifecycle call so shutdown code reads the
 * same whether or not the implementation buffers.
 */
function close() {
  _lastDay = null;
}

module.exports = {
  init,
  forService,
  newCorrelationId,
  installCrashHandlers,
  close,
  LEVELS,
  // exported for the test suite
  _paths: () => ({ dir: _dir, file: _dir ? _fileFor(_today()) : null })
};
