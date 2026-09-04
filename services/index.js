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
// Everything here is inert until a control plane URL exists. With none set,
// nothing polls, nothing dials out, and the app behaves exactly as the version
// running in production.
//
// A build can now LEARN that URL after boot — services/discovery.js fetches it
// from the repository, and `config.adoptDiscoveredBase()` applies it in place.
// That is the one thing here that starts subsystems outside `start()`, and it
// is why every start() below has to be idempotent. It stays fire-and-forget:
// no boot path waits on it, and every failure leaves the app offline-only,
// which is a supported state rather than an error.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const path = require('path');

const config    = require('./config');
const discovery = require('./discovery');
const logger    = require('./logger');
const api    = require('./api-client');
const { ConnectivityService, MODE } = require('./connectivity');
const { OnlineQueue, STATUS } = require('./online-queue');
const { EntitlementService } = require('./entitlement');
const { DeviceService } = require('./device');

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

  // ── Entitlements (Phase 2) ────────────────────────────────────────────────
  // Verifies and caches the control plane's signed statement about this
  // device. services/enforcement.js consults it: a fresh entitlement outranks
  // the local licence file, because it is the only thing that can know about a
  // suspension, revocation or renewal decided after this machine activated.
  //
  // With no apiBase it reports NONE and the licence file decides everything,
  // which is the state every machine in the field is in until the URL is set.
  const entitlement = new EntitlementService({
    cfg,
    userDataDir: o.userDataDir,
    machineIdProvider: o.machineIdProvider
  });
  try { entitlement.load(); } catch (e) {
    log.warn('entitlement_load_failed', { message: e.message });
  }

  // ── The client that fetches one ───────────────────────────────────────────
  // Everything above could verify and cache an entitlement; nothing fetched
  // one. This closes the chain: register the machine, exchange its secret for
  // a token, pull the entitlement, hand it to the enforcement decision.
  //
  // Inert with no apiBase, like everything else here.
  const device = new DeviceService({
    cfg,
    userDataDir: o.userDataDir,
    machineIdProvider: o.machineIdProvider,
    licenceProvider: o.licenceProvider,
    entitlement,
    onChanged: o.onEntitlementChanged || (() => {})
  });

  device.start();
  connectivity.start();
  // Drain on every transition into a reachable control plane, not just on the
  // timer — a ticket queued offline should go out seconds after reconnect,
  // not up to 30s later.
  connectivity.onStatusChanged((s) => {
    if (s.apiReachable) {
      queue.drain().catch(() => {});
      // A hostel that has been offline for a week should learn about a
      // suspension seconds after their internet returns, not at the next
      // six-hourly tick.
      device.sync().catch(() => {});
    }
  });
  if (config.isConfigured()) queue.start();

  // ── Learning the address, for builds that shipped without one ─────────────
  //
  // Every installer in the field bakes an empty DEFAULT_API_BASE, so without
  // this they resolve to `null` for the life of the build and no portal action
  // can ever reach them. The document is fetched at most once a day; read
  // services/discovery.js for what it can and cannot say.
  //
  // Never awaited. A hostel with no internet takes the `catch` and boots
  // exactly as it does today, which is the normal case here, not a fault.
  //
  // Adoption re-enters the three lifecycles above rather than restarting the
  // module, so a machine that learns its address at 09:00:02 does not have to
  // be relaunched before anything reaches the control plane — the first thing
  // a customer does after activating a licence is use the app, not restart it.
  discovery.refresh({ userDataDir: o.userDataDir })
    .then((r) => {
      if (!r || !r.ok || !r.base) return;
      if (!config.adoptDiscoveredBase(r.base)) return;
      log.info('control_plane_address_adopted', {
        apiBaseSource: cfg.apiBaseSource, changed: r.changed
      });
      queue.start();
      connectivity.start();
      device.start();
    })
    .catch(() => {});

  _services = {
    config, logger, api, connectivity, queue, entitlement, device, MODE, STATUS,

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
      try { device.stop(); } catch (_) {}
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
    await services.connectivity.checkNow();
    // Read the state from getStatus() rather than from checkNow()'s return —
    // that one resolves to whatever the internal probe hands back, and this
    // handler should not be coupled to its shape.
    const status = services.connectivity.getStatus();
    // Refresh the entitlement as well. Syncing only on a connectivity
    // TRANSITION meant a machine with a stable connection never re-synced
    // between six-hourly ticks — so a suspension applied at 10am did not reach
    // the hostel until 4pm, and pressing "check connection" did nothing about
    // it. Someone asking the app to check is asking about all of it.
    if (status && status.apiReachable) {
      try { await services.device.sync(); } catch (_) {}
    }
    return services.connectivity.getStatus();
  });

  // Counts only — never the payloads, which are queued work items, not the
  // renderer's business.
  ipcMain.handle('online:queueStats', () => {
    try { return services.queue.stats(); }
    catch (_) { return { pending: 0, inflight: 0, done: 0, failed: 0, cancelled: 0 }; }
  });

  ipcMain.handle('online:lastSuccess', () => services.connectivity.getLastSuccessfulConnection());

  // Diagnostics only. A snapshot of what this machine's entitlement says —
  // no token, no signed blob, nothing the renderer could replay. Added as its
  // own channel rather than folded into `online:getStatus`, so the payload the
  // Settings page already reads keeps exactly the shape it has today.
  ipcMain.handle('online:entitlement', () => {
    try {
      return Object.assign({}, services.entitlement.getStatus(),
        { device: services.device.getStatus() });
    } catch (_) { return null; }
  });

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
