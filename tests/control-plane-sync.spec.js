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
    await waitForState('SUSPENDED');

    // ── 5. And it BITES ────────────────────────────────────────────────────
    const susp = await win.evaluate(() => window.electronAPI.licenseEnforcement());
    expect(susp.state).toBe('SUSPENDED');
    expect(susp.readOnly, 'a suspended licence must stop new work').toBe(true);
    expect(susp.blocked, 'suspended must not lock them out of their own records').toBe(false);

    const blocked = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'cp-2', { id: 'cp-2', name: 'Blocked' }));
    expect(blocked.ok, 'a suspended licence still accepted a write').toBe(false);
    expect(blocked.code).toBe('LICENCE_READ_ONLY');

    // Nothing is held hostage.
    const rows = await win.evaluate(() => window.electronAPI.dbAll('students'));
    expect(rows.some((s) => s && s.id === 'cp-1'), 'existing records must remain').toBe(true);
    expect(await win.evaluate(() => window.electronAPI.dbExportFull())).toBeTruthy();

    // The customer is told why.
    await expect(win.locator('#licence-banner')).toBeVisible();
    expect(await win.locator('#licence-banner').innerText()).toMatch(/suspend/i);

    // ── 6. Lifting it restores full use ────────────────────────────────────
    await setStatus('active', 'automated test — restore');
    await win.evaluate(() => window.online.checkNow());
    await waitForState('ACTIVE');

    const restored = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'cp-3', { id: 'cp-3', name: 'Allowed again' }));
    expect(restored.ok, 'lifting a suspension must restore full use').toBe(true);
  } finally {
    await app.close();
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
