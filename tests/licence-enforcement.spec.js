// ════════════════════════════════════════════════════════════════════════════
// Licence enforcement, end to end in the real app.
//
// The unit tests prove the decision. This proves the CONSEQUENCE: that an
// expired hostel still gets their app, still sees every record, still prints —
// and cannot add anything new.
//
// It builds an expired licence for real, because there is no way to fake one:
// activateLicense() refuses an expired key, and license.enc is AES-encrypted
// with a key derived from the machine's own fingerprint. So the test reads the
// machine id from the RUNNING Electron process (it differs from what plain Node
// computes — the fingerprint shells out to reg/wmic, which answer differently
// in a Playwright child process) and encrypts a licence for that id.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');
const { buildLicenseKey } = require('../renderer/src/utils');

const _SECRET = Buffer.from(
  '44344d344d5f483053543333545f5333435233545f5334344c545f7631', 'hex'
).toString();

function launchOpts(profile) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + profile, '--no-sandbox', '--disable-gpu'],
    env,
  };
}

function freshProfile(tag) {
  const dir = path.join(os.tmpdir(), 'hostix_enf_' + tag + '_' + process.pid);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** The same container main.js writes: iv | hmac | aes-256-cbc, base64. */
function encryptLicence(data, machineId) {
  const aesKey = crypto.scryptSync(machineId + _SECRET, 'damam_salt_v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const hmac = crypto.createHmac('sha256', aesKey).update(enc).digest();
  return Buffer.concat([iv, hmac, enc]).toString('base64');
}

/**
 * Launch once to learn the machine id, then write a licence that expired
 * `daysAgo` days ago.
 */
async function seedExpiredLicence(profile, daysAgo) {
  let app = await electron.launch(launchOpts(profile));
  let win = await app.firstWindow();
  await win.waitForSelector('#key-input', { state: 'visible', timeout: 60000 });
  const machineId = await win.evaluate(() => window.licenseAPI.getMachineId());
  await app.close();

  const expiry = new Date(Date.now() - daysAgo * 86400000);
  // A key whose own date matches, so the stored licence is internally coherent.
  const key = buildLicenseKey(
    expiry.getFullYear(), expiry.getMonth() + 1, expiry.getDate(), _SECRET);

  fs.writeFileSync(path.join(profile, 'license.enc'), encryptLicence({
    key,
    machineId,
    expiry: expiry.toISOString(),
    // Activated well before it expired — otherwise the anti-rollback check
    // sees a licence activated in the future and refuses it.
    activatedAt: new Date(expiry.getTime() - 365 * 86400000).toISOString()
  }, machineId), 'utf8');

  // Last run just before expiry: an honest history, and it keeps the effective
  // clock from being dragged forward by a watermark this test did not intend.
  fs.writeFileSync(path.join(profile, 'last_run.dat'),
    new Date(expiry.getTime() - 86400000).toISOString(), 'utf8');

  return { machineId, expiry, key };
}

async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForTimeout(600);
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(() => typeof CUR_USER !== 'undefined' && !!CUR_USER,
    null, { timeout: 30000 });
}

test('an EXPIRED licence goes read-only — it does NOT lock the hostel out', async () => {
  const profile = freshProfile('expired');
  const seeded = await seedExpiredLicence(profile, 400);   // long past any grace

  const app = await electron.launch(launchOpts(profile));
  const win = await app.firstWindow();
  try {
    // ── 1. The app OPENS. This is the whole point of D-3. ──────────────────
    // Before enforcement, an expired licence meant the activation screen and
    // no access to your own records at all.
    await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
    expect(await win.locator('#key-input').count(), 'expired must not block the app').toBe(0);

    const decision = await win.evaluate(() => window.electronAPI.licenseEnforcement());
    expect(decision.state).toBe('EXPIRED');
    expect(decision.readOnly).toBe(true);
    expect(decision.blocked, 'a paying customer must keep their records').toBe(false);

    await login(win);

    // ── 2. Reads keep working ──────────────────────────────────────────────
    const rooms = await win.evaluate(() => window.electronAPI.dbAll('rooms'));
    expect(Array.isArray(rooms), 'reading must never be gated').toBe(true);

    // Export is the promise that nothing is held hostage.
    const dump = await win.evaluate(() => window.electronAPI.dbExportFull());
    expect(dump, 'an expired customer must still be able to export').toBeTruthy();

    // ── 3. Writes are refused, by the MAIN process ─────────────────────────
    const write = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'enf-test-1', { id: 'enf-test-1', name: 'Blocked' }));
    expect(write.ok, 'an expired licence still accepted a write').toBe(false);
    expect(write.code).toBe('LICENCE_READ_ONLY');

    // And it really did not land.
    const after = await win.evaluate(() => window.electronAPI.dbAll('students'));
    expect(after.some((s) => s && s.id === 'enf-test-1')).toBe(false);

    const del = await win.evaluate(() => window.electronAPI.dbDelete('rooms', 'anything'));
    expect(del.ok).toBe(false);

    // ── 4. The audit trail keeps recording ─────────────────────────────────
    // Freezing it would make the one period a support call cares about the one
    // period with no record.
    const logged = await win.evaluate(() =>
      window.electronAPI.dbUpsert('activitylog', 'enf-log-1', { id: 'enf-log-1', action: 'test' }));
    expect(logged.ok, 'the activity log must keep working during a lockout').toBe(true);

    // ── 5. The customer is told why ────────────────────────────────────────
    const banner = win.locator('#licence-banner');
    await expect(banner).toBeVisible();
    const text = await banner.innerText();
    expect(text).toMatch(/expired/i);
    expect(text, 'the message must say their data is safe').toMatch(/view|print/i);
    expect(await win.evaluate(() => document.body.classList.contains('is-readonly'))).toBe(true);
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test('inside GRACE the app is unrestricted, and says so', async () => {
  const profile = freshProfile('grace');
  await seedExpiredLicence(profile, 3);        // 3 days past, inside the 14-day grace

  const app = await electron.launch(launchOpts(profile));
  const win = await app.firstWindow();
  try {
    await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });

    const decision = await win.evaluate(() => window.electronAPI.licenseEnforcement());
    expect(decision.state).toBe('GRACE');
    expect(decision.readOnly, 'grace must not restrict anything').toBe(false);

    await login(win);

    // Writes still work — the customer has room to pay.
    const write = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'grace-1', { id: 'grace-1', name: 'Allowed' }));
    expect(write.ok).toBe(true);

    const banner = win.locator('#licence-banner');
    await expect(banner).toBeVisible();
    expect(await banner.innerText()).toMatch(/keeps working|renew/i);
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test('a healthy licence is unrestricted and shows no banner', async () => {
  const profile = freshProfile('healthy');

  // Activate normally, the way a customer does.
  const d = new Date();
  const key = buildLicenseKey(d.getFullYear() + 2, d.getMonth() + 1, d.getDate(), _SECRET);
  let app = await electron.launch(launchOpts(profile));
  let win = await app.firstWindow();
  await win.waitForSelector('#key-input', { state: 'visible', timeout: 60000 });
  await win.fill('#key-input', key);
  await win.click('#activate-btn');
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });

  try {
    const decision = await win.evaluate(() => window.electronAPI.licenseEnforcement());
    expect(decision.state).toBe('ACTIVE');
    expect(decision.readOnly).toBe(false);
    expect(decision.blocked).toBe(false);

    await login(win);

    const write = await win.evaluate(() =>
      window.electronAPI.dbUpsert('students', 'ok-1', { id: 'ok-1', name: 'Fine' }));
    expect(write.ok, 'a valid licence must not be affected by any of this').toBe(true);

    // Two years out — nothing to warn about.
    await expect(win.locator('#licence-banner')).toBeHidden();
    expect(await win.evaluate(() => document.body.classList.contains('is-readonly'))).toBe(false);
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
