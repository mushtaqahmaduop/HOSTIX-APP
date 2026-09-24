// ════════════════════════════════════════════════════════════════════════════
// Suspension reaches the app — end to end, against the LIVE control plane.
//
// The test for "I suspended a hostel and the app still works". It runs the
// whole chain for real: a fresh profile activates a key, registers itself with
// the deployed control plane, pulls a signed entitlement and enforces it. Then
// the licence is suspended THROUGH THE PORTAL'S OWN API — not by editing the
// database — and the app must go read-only.
//
// Going through the admin API is the point: it proves the path an operator
// actually uses, including the session and CSRF handling, rather than a state
// the database could be put into by hand.
//
// Skips without credentials, because a laptop that cannot reach the control
// plane is not a regression:
//
//   CONTROL_PLANE_URL   https://control-plane-production-xxxx.up.railway.app
//   CP_ADMIN_EMAIL      portal login
//   CP_ADMIN_PASSWORD
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');
const { buildLicenseKey } = require('../renderer/src/utils');

const _SECRET = Buffer.from(
  '44344d344d5f483053543333545f5333435233545f5334344c545f7631', 'hex'
).toString();

const BASE = process.env.CONTROL_PLANE_URL;
const EMAIL = process.env.CP_ADMIN_EMAIL;
const PASSWORD = process.env.CP_ADMIN_PASSWORD;
const CAN_RUN = !!(BASE && EMAIL && PASSWORD);

function launchOpts(profile) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // The one thing a machine in the field is missing. With no apiBase the app
  // makes no requests at all and never learns anything the control plane says.
  env.HOSTYLLO_API_BASE = BASE + '/v1';
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + profile, '--no-sandbox', '--disable-gpu'],
    env,
  };
}

/** A tiny cookie-aware admin client — the portal's own API, nothing privileged. */
function adminClient() {
  let jar = {};
  let csrf = '';

  async function call(p, opts) {
    const o = Object.assign({ headers: {} }, opts || {});
    if (o.body !== undefined) {
      o.headers['content-type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    const cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (cookie) o.headers.cookie = cookie;
    if ((o.method || 'GET') !== 'GET' && csrf) o.headers['x-csrf-token'] = csrf;

    const res = await fetch(BASE + '/admin/api' + p, o);
    for (const raw of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const [pair] = raw.split(';');
      const i = pair.indexOf('=');
      jar[pair.slice(0, i)] = pair.slice(i + 1);
    }
    if (jar.cp_csrf) csrf = decodeURIComponent(jar.cp_csrf);
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, json };
  }

  return {
    call,
    async login() {
      const r = await call('/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
      if (r.status !== 200) throw new Error('portal login failed: ' + JSON.stringify(r.json));
    }
  };
}

test.describe.configure({ mode: 'serial' });
test.skip(!CAN_RUN, 'needs CONTROL_PLANE_URL, CP_ADMIN_EMAIL and CP_ADMIN_PASSWORD');

test('suspending in the portal makes the app read-only, and lifting it restores use', async () => {
  const profile = path.join(os.tmpdir(), 'hostix_cp_' + process.pid);
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });

  const d = new Date();
  const key = buildLicenseKey(d.getFullYear() + 2, d.getMonth() + 1, d.getDate(), _SECRET);
  // Match on the SERIAL, not the expiry group. Every run of this test builds a
  // key for the same date, so the expiry group is identical across runs and a
  // search by it finds whichever earlier test licence happens to sort first —
  // which is then suspended instead of this one, and the app under test never
  // changes state. The serial is unique per issuance; that is what it is for.
  const serial = key.split('-')[2];

  const admin = adminClient();
  await admin.login();

  const app = await electron.launch(launchOpts(profile));
  // The relaunch in step 8. Declared out here so `finally` can close it.
  let app2 = null;
  const win = await app.firstWindow();
  let licenceId = null;

  const setStatus = async (status, reason) => {
    const r = await admin.call('/licenses/' + licenceId + '/status',
      { method: 'POST', body: { status, reason } });
    expect(r.status, 'portal refused the status change: ' + JSON.stringify(r.json)).toBe(200);
  };

  /**
   * Poll from the NODE side, not with waitForFunction.
   *
   * `waitForFunction(async () => ...)` returns a Promise, and a Promise is
   * always truthy — so the wait resolves on the first tick no matter what the
   * predicate actually found. It made this test pass instantly against an
   * entitlement that was still NONE, which is worse than failing.
   */
  const waitForState = async (want, timeoutMs) => {
    const deadline = Date.now() + (timeoutMs || 120000);
    let last = null;
    while (Date.now() < deadline) {
      last = await win.evaluate(() => window.online.entitlement());
      if (last && last.state === want) return last;
      await win.waitForTimeout(2000);
    }
    throw new Error('timed out waiting for entitlement ' + want
      + ' — last saw ' + JSON.stringify(last));
  };

  try {
    // ── 1. Activate, as a customer does ────────────────────────────────────
    await win.waitForSelector('#key-input', { state: 'visible', timeout: 60000 });
    await win.fill('#key-input', key);
    await win.click('#activate-btn');
    await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });

    // ── 2. It registers itself and pulls an entitlement ────────────────────
    await waitForState('ACTIVE');

    const ent = await win.evaluate(() => window.online.entitlement());
    expect(ent.device.registered, 'the app never registered itself').toBe(true);

    const active = await win.evaluate(() => window.electronAPI.licenseEnforcement());
    expect(active.state).toBe('ACTIVE');
    expect(active.source, 'the entitlement should outrank the local licence file').toBe('entitlement');
    expect(active.readOnly).toBe(false);

    const ok1 = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'cp-1', { id: 'cp-1', name: 'Allowed' }));
    expect(ok1.ok).toBe(true);

    // ── 3. Find it in the portal and suspend it ────────────────────────────
    const list = await admin.call('/licenses');
    expect(list.status).toBe(200);
    const row = list.json.data.find((l) => l.serial === serial);
    expect(row, 'the portal has no record of this licence').toBeTruthy();
    licenceId = row.id;

    // Label it, so a leftover row is obviously a test and not a customer.
    await admin.call('/licenses/' + licenceId, {
      method: 'PATCH',
      body: { hostelName: 'E2E TEST — safe to delete', notes: 'Created by control-plane-sync.spec.js' }
    });

    await setStatus('suspended', 'automated test');

    // ── 4. The app learns about it ─────────────────────────────────────────
    // checkNow() drives a connectivity probe, whose reachable transition makes
    // DeviceService sync. The real app also does this on its own timer; a test
    // should not wait six hours for a tick.
    await win.evaluate(() => window.online.checkNow());
    // The suspension takes the window to the licence screen, so wait on that
    // rather than on window.online, which that page does not have.
    await expect.poll(() => win.url(), { timeout: 120000 }).toMatch(/license\.html/i);

    // ── 5. And it BITES ────────────────────────────────────────────────────
    /* SUSPENSION LOCKS THE APP (owner, 2026-09-20). It used to be read-only:
       the app stayed open behind a banner and only the save failed, in the
       main process, where the customer could not see it. Expiry is still
       read-only — that reasoning is about late payment — but a suspension is
       the control plane being used deliberately, and an install that can work
       through it is not suspended. */
    const susp = await win.evaluate(() => window.electronAPI.licenseEnforcement());
    expect(susp.state).toBe('SUSPENDED');
    expect(susp.blocked, 'a suspension must lock the app').toBe(true);
    expect(susp.readOnly, 'read-only is for expiry, not suspension').toBe(false);

    const blocked = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'cp-2', { id: 'cp-2', name: 'Blocked' }));
    expect(blocked.ok, 'a suspended licence still accepted a write').toBe(false);

    // It bites NOW, not at the next launch: the window is on the licence
    // screen already, which is also why there is no banner to read any more.
    await expect.poll(() => win.url(), { timeout: 20000 }).toMatch(/license\.html/i);
    await expect(win.locator('body')).toContainText(/suspend/i);

    /* AND THE DATA IS STILL THEIRS. This is the half of D-3 the owner kept:
       locked out of working, never out of their own records. The export is a
       READ, so it answers on the licence screen itself. */
    expect(await win.evaluate(() => window.electronAPI.dbExportFull())).toBeTruthy();
    await expect(win.locator('text=Download my data')).toBeVisible();
    const rows = await win.evaluate(() => window.electronAPI.dbAll('students'));
    expect(rows.some((s) => s && s.id === 'cp-1'), 'existing records must remain').toBe(true);

    /* Lifting it brings the app BACK, without a restart — the suspension is
       reversible from the portal and so is the lock (_unlockFromLicenceScreen).
       Everything after this point needs the app window again. */
    await setStatus('active', 'automated test — lift the lock');
    await expect.poll(() => win.url(), { timeout: 90000 }).toMatch(/index\.html/i);
    await win.waitForFunction(() => typeof window.online !== 'undefined', null, { timeout: 30000 });

    // ── 5b. Feature flags reach the app and remove the page ────────────────
    await setStatus('active', 'restore before feature test');
    await win.evaluate(() => window.online.checkNow());
    await waitForState('ACTIVE');

    // Reports is on by default — the catalogue defaults are generous so that
    // existing customers lose nothing.
    expect(await win.evaluate(() => hasFeature('reports'))).toBe(true);
    await win.evaluate(() => navigate('reports'));
    await win.waitForTimeout(500);
    expect(await win.evaluate(() => document.getElementById('content').innerText))
      .not.toMatch(/Not included/i);

    const off = await admin.call('/licenses/' + licenceId + '/features',
      { method: 'PUT', body: { features: { reports: false } } });
    expect(off.status, JSON.stringify(off.json)).toBe(200);

    await win.evaluate(() => window.online.checkNow());
    await expect.poll(async () => win.evaluate(() => hasFeature('reports')),
      { timeout: 60000 }).toBe(false);

    // The rail item goes.
    expect(await win.evaluate(() =>
      document.querySelector('.nav-item[data-page="reports"]').style.display)).toBe('none');

    // And the page itself refuses — hiding the rail is not enough, because the
    // command palette and direct navigate() calls never touch it.
    await win.evaluate(() => navigate('reports'));
    await win.waitForTimeout(500);
    expect(await win.evaluate(() => document.getElementById('content').innerText))
      .toMatch(/Not included/i);

    // Turning it back on restores the page.
    const on = await admin.call('/licenses/' + licenceId + '/features',
      { method: 'PUT', body: { features: {} } });
    expect(on.status).toBe(200);
    await win.evaluate(() => window.online.checkNow());
    await expect.poll(async () => win.evaluate(() => hasFeature('reports')),
      { timeout: 60000 }).toBe(true);

    await setStatus('suspended', 're-suspend for the restore step');
    await win.evaluate(() => window.online.checkNow());
    // The lock takes the window with it, so from here the renderer has no
    // window.online to drive — the app's own timer is what picks the change up.
    await expect.poll(() => win.url(), { timeout: 90000 }).toMatch(/license\.html/i);

    // ── 6. Lifting it restores full use, without a restart ─────────────────
    await setStatus('active', 'automated test — restore');
    await expect.poll(() => win.url(), { timeout: 90000 }).toMatch(/index\.html/i);
    await win.waitForFunction(() => typeof window.online !== 'undefined', null, { timeout: 30000 });
    await waitForState('ACTIVE');

    const restored = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'cp-3', { id: 'cp-3', name: 'Allowed again' }));
    expect(restored.ok, 'lifting a suspension must restore full use').toBe(true);

    /* ── 7. REVOKING IS STRONGER THAN SUSPENDING, AND IT MUST REACH THE APP ──

       Revocation was exercised here only as CLEANUP, in the finally block with
       its result thrown away — so the strongest action the control plane has
       was the one action never asserted. That matters more than it sounds:
       resolve() previously tested `!BLOCKED_STATES.has(ent.state)` before
       trusting an entitlement, which discarded REVOKED and fell back to the
       local licence, meaning revoking a customer did precisely nothing. The
       unit tests cover that decision; nothing proved it survived the whole
       chain from the portal to a running app.

       Since 2026-09-20 SUSPENDED and REVOKED both block; EXPIRED is the only
       read-only state left. The two still differ in remedy, and the screen has
       to say WHICH — a suspension is lifted from the portal, a revocation is
       not. */
    await setStatus('revoked', 'automated test — revocation reaches the app');
    await win.evaluate(() => window.online.checkNow());
    // waitForState() reads window.online, which the licence screen does not
    // have — and reaching that screen IS the assertion now. licenseEnforcement()
    // is on the preload, so it answers from either page.
    await expect.poll(() => win.url(), { timeout: 90000 }).toMatch(/license\.html/i);
    await expect.poll(async () => (await win.evaluate(
      () => window.electronAPI.licenseEnforcement())).state, { timeout: 30000 }).toBe('REVOKED');

    const afterRevoke = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'cp-4', { id: 'cp-4', name: 'Must not land' }));
    expect(afterRevoke.ok, 'a revoked licence still accepted a write').toBe(false);

    // The record really is not there — the refusal is at the IPC boundary, not
    // a message the renderer chose to show.
    const afterRows = await win.evaluate(() => window.electronAPI.dbAll('students'));
    expect(afterRows.some((s) => s && s.id === 'cp-4'),
      'a write refused under revocation must not have landed').toBe(false);

    // And the customer is told which of the two it is, since the remedies
    // differ. On the licence screen now, not in a banner over a usable app.
    await expect.poll(() => win.url(), { timeout: 20000 }).toMatch(/license\.html/i);
    await expect(win.locator('body')).toContainText(/revok/i);
    await expect(win.locator('text=Download my data')).toBeVisible();

    /* ── 8. AND IT STILL BITES ON A COLD START — THE ONLY PATH THE FIELD TAKES ──

       Everything above revokes while this app still holds a device token it
       fetched moments earlier, so it goes straight to /v1/entitlement and is
       told. NO INSTALL IN THE FIELD IS EVER ON THAT PATH: a device token lasts
       15 minutes and the app syncs every 6 hours, so every real sync begins by
       exchanging the device secret at /v1/devices/token.

       That is where revocation used to die. The endpoint answered 401 to a
       revoked licence, the app read that as "my secret was rejected", wiped its
       credentials and re-registered — and registration answered 403. The sync
       failed, the cached ACTIVE entitlement kept answering for its full 14 days,
       and then the local licence file took over. The customer was revoked in the
       portal and working normally on the desk, indefinitely.

       A restart is exactly that path and needs no test seam: a fresh process
       holds no token. So close the app with the licence still revoked, open it
       again, and require that it comes up locked. */
    await app.close();

    app2 = await electron.launch(launchOpts(profile));
    const win2 = await app2.firstWindow();
    await expect.poll(() => win2.url(), { timeout: 120000 }).toMatch(/license\.html/i);
    await expect.poll(async () => (await win2.evaluate(
      () => window.electronAPI.licenseEnforcement())).state, { timeout: 60000 }).toBe('REVOKED');

    const coldStart = await win2.evaluate(() => window.electronAPI.licenseEnforcement());
    expect(coldStart.source,
      'it fell back to the local licence file, which is revocation doing nothing')
      .toBe('entitlement');
    expect(coldStart.blocked).toBe(true);

    const afterRestart = await win2.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'cp-5', { id: 'cp-5', name: 'Must not land either' }));
    expect(afterRestart.ok, 'a revoked licence accepted a write after a restart').toBe(false);

    // Their records are still theirs, on this screen, after a restart too.
    await expect(win2.locator('text=Download my data')).toBeVisible();
  } finally {
    await app.close().catch(() => {});
    if (app2) await app2.close().catch(() => {});
    // The portal has no delete — deliberately, since a licence is a customer
    // record. Revoke it and leave it labelled, so it cannot be reused and is
    // obviously not a real hostel.
    if (licenceId) {
      await admin.call('/licenses/' + licenceId + '/status',
        { method: 'POST', body: { status: 'revoked', reason: 'end of automated test' } }).catch(() => {});
    }
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
