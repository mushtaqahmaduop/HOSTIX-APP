// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — Phase 1 online services, inside a real Electron app
//
// The unit suite (tests/services.test.js) proves the services behave. This
// spec proves the thing that only a real launch can:
//
//   1. The app still boots with the services wired in.
//   2. The renderer's window.online bridge exists and reports the honest
//      Phase 1 state — `unconfigured`, because no control plane exists yet.
//   3. The app makes NO outbound request. This is the Phase 1 gate: behaviour
//      on the 50+ production machines must be unchanged.
//   4. The `online_queue` table is NOT reachable through the legacy generic
//      db:* bridge (§3.5).
//   5. A structured log file is actually produced.
//
// It deliberately does not log in — window.online is a preload global and is
// present on the licence screen as well as the app, so asserting it here keeps
// this spec independent of the login flow that the other specs already cover.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');
const { resetProfile } = require('./_profile');

// Each spec starts from a cold database, so running the suite in one go gives
// the same answer as running this file alone. See _profile.js.
test.beforeAll(() => { resetProfile(); });

// Falls back to a throwaway profile so this spec runs even without a licensed
// HOSTIX_TEST_PROFILE — it never needs to get past the licence screen.
const PROFILE = process.env.HOSTIX_TEST_PROFILE ||
  fs.mkdtempSync(path.join(os.tmpdir(), 'hostyllo-online-'));

function launchOpts() {
  // Critical: strip ELECTRON_RUN_AS_NODE — if set, electron.exe runs as plain
  // Node and require('electron').app is undefined, so main.js dies on launch.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // Guarantee the "unconfigured" precondition regardless of the dev machine.
  delete env.HOSTYLLO_API_BASE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
}

test('Phase 1 services boot, stay offline, and expose a narrow bridge', async () => {
  const app = await electron.launch(launchOpts());
  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');

    // ── 1 + 2. The bridge exists and answers ────────────────────────────────
    await win.waitForFunction(() => typeof window.online === 'object' && window.online !== null,
      null, { timeout: 30000 });

    const status = await win.evaluate(() => window.online.getStatus());

    // §7's four states must all be present and separate — a single `isOnline`
    // boolean is exactly what the spec forbids.
    expect(status).toHaveProperty('networkAvailable');
    expect(status).toHaveProperty('apiReachable');
    expect(status).toHaveProperty('authenticated');
    expect(status).toHaveProperty('licenseValid');

    // The honest Phase 1 answer: there is no control plane yet.
    expect(status.configured).toBe(false);
    expect(status.mode).toBe('unconfigured');
    expect(status.reason).toBe('not_configured');
    expect(status.apiReachable).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.lastSuccessAt).toBeNull();

    // ── 3. No network activity, and none scheduled ──────────────────────────
    const last = await win.evaluate(() => window.online.getLastSuccessfulConnection());
    expect(last).toBeNull();

    // checkNow() must resolve rather than dial out or hang.
    const rechecked = await win.evaluate(() => window.online.checkNow());
    expect(rechecked.mode).toBe('unconfigured');

    const stats = await win.evaluate(() => window.online.queueStats());
    expect(stats).toEqual({ pending: 0, inflight: 0, done: 0, failed: 0, cancelled: 0 });

    // ── 4. online_queue is not reachable through the legacy db bridge ───────
    // The table exists (the queue created it), and db:* accepts any /^[a-z_]+$/
    // name — so without the guard this call would return its rows and
    // dbBulkReplace would wipe the machine's pending uploads.
    const rows = await win.evaluate(() => window.electronAPI.dbAll('online_queue'));
    expect(rows).toEqual([]);   // db:all swallows the throw and returns []

    const wiped = await win.evaluate(() =>
      window.electronAPI.dbBulkReplace('online_queue', []));
    expect(wiped.ok).toBe(false);
    expect(wiped.error).toBe('Reserved table');

    const upserted = await win.evaluate(() =>
      window.electronAPI.dbUpsert('online_queue', 'x', { id: 'x' }));
    expect(upserted.ok).toBe(false);

    // A real table must still work — the guard must not have broken the app.
    const roomsOk = await win.evaluate(() => window.electronAPI.dbAll('rooms'));
    expect(Array.isArray(roomsOk)).toBe(true);

    // ── 5. Nothing sensitive, and no URL, crossed the bridge ────────────────
    // An exact set, so accidentally widening the bridge fails the build.
    // 'entitlement' joined it in Phase 2 and returns a description of the
    // licence state — no token, no signed blob, nothing replayable.
    const keys = await win.evaluate(() => Object.keys(window.online).sort());
    expect(keys).toEqual([
      'checkNow', 'entitlement', 'getLastSuccessfulConnection', 'getStatus',
      'onStatusChanged', 'queueStats'
    ]);

    // And what it hands back must be a description, never a credential.
    const ent = await win.evaluate(() => window.online.entitlement());
    expect(ent.state, 'no machine can hold an entitlement yet').toBe('NONE');
    expect(ent.enforced, 'this phase gates nothing').toBe(false);
    expect(Object.keys(ent)).not.toContain('jws');
  } finally {
    await app.close();
  }

  // ── 5b. A structured log file was produced ────────────────────────────────
  const logDir = path.join(PROFILE, 'logs');
  expect(fs.existsSync(logDir)).toBe(true);
  const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
  expect(files.length).toBeGreaterThan(0);

  const raw = fs.readFileSync(path.join(logDir, files[0]), 'utf8');
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const entry = JSON.parse(line);      // JSONL — every line must parse
    expect(entry).toHaveProperty('ts');
    expect(entry).toHaveProperty('level');
    expect(entry).toHaveProperty('service');
    expect(entry).toHaveProperty('event');
  }
  expect(raw).toContain('online_services_starting');
});
