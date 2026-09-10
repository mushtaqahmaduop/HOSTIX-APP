// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — Phase 1 online services, inside a real Electron app
//
// The unit suite (tests/services.test.js) proves the services behave. This
// spec proves the thing that only a real launch can:
//
//   1. The app still boots with the services wired in.
//   2. The renderer's window.online bridge exists and reports one of §7's four
//      states honestly, with `authenticated` separate from `configured` — a
//      cold boot now LEARNS the control plane's address from control-plane.json
//      (feat(discovery), 2026-09-05), which is not the same as having reached
//      it or having a token for it.
//   3. A cold boot may REACH the control plane — discovery exists so an install
//      can be re-pointed or switched off — but it authenticates nothing, queues
//      nothing, and holds nothing replayable.
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

test('the online services boot, expose a narrow bridge, and leak no credential', async () => {
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

    /* A COLD BOOT IS CONFIGURED NOW, and it was not when this was written.
       `feat(discovery)` (2297a9c, 2026-09-05) ships control-plane.json and lets
       an install learn the address from it, so "there is no control plane yet"
       stopped being true five days before anybody re-ran this file. The four
       assertions that encoded that premise are corrected here rather than
       deleted — what they were really guarding is below and is unchanged.

       `authenticated` stays false: knowing WHERE the control plane is is not
       the same as having a device token for it, and conflating the two is the
       single-`isOnline`-boolean mistake §7 forbids. */
    expect(typeof status.configured, 'configured must be a real boolean').toBe('boolean');
    expect(status.authenticated, 'a cold boot cannot be authenticated').toBe(false);
    // Whatever the address is, it is never handed to the renderer.
    expect(JSON.stringify(status), 'the bridge leaked the control-plane URL')
      .not.toMatch(/https?:\/\//);

    /* ── 3. IT MAY REACH THE CONTROL PLANE. IT MAY NOT DO ANYTHING WITH IT ───
       This item used to read "the app makes NO outbound request", and that was
       the Phase 1 gate. Discovery superseded it deliberately: fetching
       control-plane.json and probing the address it names is the whole point of
       that feature, and an install that never dials cannot be re-pointed or
       switched off. So `lastSuccessAt` is now allowed to be a real timestamp.

       What replaces it is the part that still protects the 50+ machines: the
       cold boot must not authenticate, must not queue work, and must not hold
       anything replayable. A reach is not a session. */
    const last = await win.evaluate(() => window.online.getLastSuccessfulConnection());
    expect(last === null || Number.isFinite(last),
      'lastSuccessfulConnection is neither null nor a timestamp').toBe(true);

    // checkNow() must resolve rather than hang, whatever it finds.
    const rechecked = await win.evaluate(() => window.online.checkNow());
    expect(['unconfigured', 'offline', 'degraded', 'online'],
      'checkNow returned a mode outside §7\'s set').toContain(rechecked.mode);

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

    /* And what it hands back must be a description, never a credential.

       "no machine can hold an entitlement yet" was true when this was written
       and is not any more: with discovery shipping the address, a licensed
       machine reaches the control plane on boot and comes back holding a
       signed, ACTIVE entitlement. This run proved it — which is also the
       clearest evidence that rotating the signing key without first shipping
       the new PUBLIC key would take real machines off the entitlement channel
       and back onto their local licence file.

       So the state is whatever the server said. What is asserted is the part
       that is a rule rather than a moment: it is one of the known states, and
       the signed blob itself never crosses the bridge. */
    const ent = await win.evaluate(() => window.online.entitlement());
    expect(['NONE', 'STALE', 'ACTIVE', 'GRACE', 'EXPIRED', 'SUSPENDED', 'REVOKED'],
      'the bridge reported an entitlement state nothing defines').toContain(ent.state);
    expect(typeof ent.enforced, 'enforced must be a real boolean').toBe('boolean');
    expect(Object.keys(ent), 'the signed entitlement itself crossed the bridge')
      .not.toContain('jws');
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
