// ════════════════════════════════════════════════════════════════════════════
// Online services bootstrap  —  Phase 1
//
// One entry point that main.js calls once, so the 1,198-line main.js gains a
// handful of lines rather than five more subsystems.
//
// Wires: config → logger → ConnectivityService → OnlineQueue, and registers
// the narrow `online:*` IPC surface (§3.5: no generic filesystem, shell, HTTP
// or database primitive is exposed to the renderer — the renderer can ask for
// a status snapshot and nothing else).
//
// Everything here is inert until a control plane URL exists. With none set —
// which is the state today — nothing polls, nothing dials out, and the app
// behaves exactly as the version running in production.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const path = require('path');

const config = require('./config');
const logger = require('./logger');
const api    = require('./api-client');
const { ConnectivityService, MODE } = require('./connectivity');
const { OnlineQueue, STATUS } = require('./online-queue');

// Tables owned by the online services. The legacy `db:*` bridge is generic by
// design (audit M1 — freeze, don't rewrite), but it must not be a way for
// renderer code to read or clear the machine's own queue.
const INTERNAL_TABLES = new Set(['online_queue']);

let _services = null;

/**
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db
 * @param {string}  opts.userDataDir
 * @param {boolean} [opts.isDev]
 * @param {object}  [opts.electron] { ipcMain, BrowserWindow } — injectable for tests
 */
function start(opts) {
  if (_services) return _services;
  const o = opts || {};

  const cfg = config.load({ userDataDir: o.userDataDir });

  logger.init({
    dir: path.join(o.userDataDir, 'logs'),
    level: o.isDev ? 'DEBUG' : cfg.logLevel,
    console: !!o.isDev
  });
  const log = logger.forService('boot');

  log.info('online_services_starting', {
    configured: config.isConfigured(),
    apiBaseSource: cfg.apiBaseSource,
    telemetryEnabled: cfg.telemetryEnabled
  });

  // ── Licence state ─────────────────────────────────────────────────────────
  // Deliberately a CACHE, not a live call.
  //
  // checkLicenseValidity() in main.js calls _writeLastRun() as a side effect
  // (main.js:332) — it advances the anti-clock-rollback watermark. Polling it
  // once a minute from the connectivity loop would rewrite last_run.dat all
  // day and tighten a tamper check that 50+ machines already depend on. So the
  // service never calls it; main.js reports the result of checks the app was
  // going to make anyway.
  let _license = { ok: false, reason: 'not_checked', at: null };

  const connectivity = new ConnectivityService({
    cfg,
    licenseProvider: () => ({ ok: _license.ok, reason: _license.reason })
  });

  const queue = new OnlineQueue({ db: o.db, cfg });
  queue.attachConnectivity(() => connectivity.isOnline());

  connectivity.start();
  // Drain on every transition into a reachable control plane, not just on the
  // timer — a ticket queued offline should go out seconds after reconnect,
  // not up to 30s later.
  connectivity.onStatusChanged((s) => {
    if (s.apiReachable) queue.drain().catch(() => {});
  });
  if (config.isConfigured()) queue.start();

  _services = {
    config, logger, api, connectivity, queue, MODE, STATUS,

    /** Called by main.js's existing license:check handler. No extra I/O. */
    noteLicenseResult(result) {
      _license = {
        ok: !!(result && result.valid),
        reason: (result && result.reason) || (result && result.valid ? 'valid' : 'unknown'),
        at: Date.now()
      };
    },

    isInternalTable: (t) => INTERNAL_TABLES.has(String(t)),

    stop() {
      try { connectivity.stop(); } catch (_) {}
      try { queue.stop(); } catch (_) {}
      try { logger.close(); } catch (_) {}
      _services = null;
    }
  };

  registerIpc(_services, o.electron);
  return _services;
}

/**
 * The complete renderer-facing surface for Phase 1. Four read-only channels.
 * No URL, no method, no payload ever crosses from the renderer — §3.5.
 */
function registerIpc(services, electron) {
  let ipcMain, BrowserWindow;
  try {
    const e = electron || require('electron');
    ipcMain = e.ipcMain;
    BrowserWindow = e.BrowserWindow;
  } catch (_) { return; }
  if (!ipcMain) return;

  ipcMain.handle('online:getStatus', () => services.connectivity.getStatus());

  ipcMain.handle('online:checkNow', async () => {
    // Rate-limiting lives in the service, so a renderer loop cannot turn this
    // into an outbound request amplifier.
    return services.connectivity.checkNow();
  });

  // Counts only — never the payloads, which are queued work items, not the
  // renderer's business.
  ipcMain.handle('online:queueStats', () => {
    try { return services.queue.stats(); }
    catch (_) { return { pending: 0, inflight: 0, done: 0, failed: 0, cancelled: 0 }; }
  });

  ipcMain.handle('online:lastSuccess', () => services.connectivity.getLastSuccessfulConnection());

  // Push transitions to every open window.
  services.connectivity.onStatusChanged((status) => {
    if (!BrowserWindow) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try { win.webContents.send('online:statusChanged', status); } catch (_) {}
    }
  });
}

function get() { return _services; }

module.exports = { start, get, INTERNAL_TABLES };
