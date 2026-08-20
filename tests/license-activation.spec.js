// ════════════════════════════════════════════════════════════════════════════
// HOSTIX — license activation, end to end
//
// Every other spec starts from a profile that is ALREADY licensed, so nothing
// in the suite covered the one screen a new client actually sees first. This
// one launches against a throwaway profile with NO license.enc, types a freshly
// cut key into the activation screen, and proves the app comes up licensed.
//
// It runs the whole chain in one go — keygen builder → the input's format gate
// → license:activate IPC → main.js activateLicense → license.enc →
// checkLicenseValidity on the next boot — which is the only way to catch the
// key format and the screen that accepts it drifting apart.
//
// Both formats are covered: the current four-group key, and the three-group key
// the 50+ machines in the field were activated with.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');
const { buildLicenseKey, buildLegacyLicenseKey } = require('../renderer/src/utils');

// Same secret main.js compiles in. If these ever diverge the activation screen
// rejects every key this file produces, which is exactly what should happen.
const _SECRET = Buffer.from(
  '44344d344d5f483053543333545f5333435233545f5334344c545f7631', 'hex'
).toString();

/** A profile directory that has never been licensed. */
function freshProfile(tag) {
  const dir = path.join(os.tmpdir(), 'hostix_lic_' + tag + '_' + process.pid);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function launchOpts(profile) {
  // Critical: strip ELECTRON_RUN_AS_NODE — if set, electron.exe runs as plain
  // Node and require('electron').app is undefined, so main.js crashes on launch.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + profile,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
}

/** Type a key into the activation screen and press Activate. */
async function activate(win, key) {
  await win.waitForSelector('#key-input', { state: 'visible', timeout: 60000 });
  await win.fill('#key-input', key);
  // The field auto-formats as it fills; if it mangled the key the app would
  // reject a key that is in fact valid, so assert what actually landed there.
  expect(await win.inputValue('#key-input')).toBe(key);
  await win.click('#activate-btn');
}

async function expiryDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

test('7-day key activates and the app boots licensed', async () => {
  const profile = freshProfile('v4');
  const { year, month, day } = await expiryDays(7);
  const key = buildLicenseKey(year, month, day, _SECRET);

  let app = await electron.launch(launchOpts(profile));
  let win = await app.firstWindow();

  // No licence yet → the activation screen, not the login screen.
  await win.waitForSelector('#key-input', { state: 'visible', timeout: 60000 });

  await activate(win, key);
  await expect(win.locator('#msg.success')).toBeVisible({ timeout: 30000 });
  expect(fs.existsSync(path.join(profile, 'license.enc'))).toBe(true);
  await app.close();

  // Second cold boot: the stored licence must validate on its own.
  app = await electron.launch(launchOpts(profile));
  win = await app.firstWindow();
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });

  const status = await win.evaluate(() => window.electronAPI.licenseCheck());
  expect(status.valid).toBe(true);
  expect(status.key).toBe(key);

  // A 7-day key must expire ~7 days out — not at a month boundary, which is
  // all the previous key format could express.
  const daysLeft = Math.ceil((new Date(status.expiry) - Date.now()) / 86400000);
  expect(daysLeft).toBeGreaterThanOrEqual(7);
  expect(daysLeft).toBeLessThanOrEqual(8);

  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test('legacy three-group key still activates', async () => {
  const profile = freshProfile('v3');
  const d = new Date();
  const key = buildLegacyLicenseKey(d.getFullYear() + 1, d.getMonth() + 1, _SECRET);

  const app = await electron.launch(launchOpts(profile));
  const win = await app.firstWindow();

  await activate(win, key);
  await expect(win.locator('#msg.success')).toBeVisible({ timeout: 30000 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });

  const status = await win.evaluate(() => window.electronAPI.licenseCheck());
  expect(status.valid).toBe(true);

  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test('a key with an edited serial is refused', async () => {
  const profile = freshProfile('bad');
  const { year, month, day } = await expiryDays(30);
  const parts = buildLicenseKey(year, month, day, _SECRET).split('-');
  parts[2] = parts[2] === 'ZZZZ' ? 'YYYY' : 'ZZZZ';

  const app = await electron.launch(launchOpts(profile));
  const win = await app.firstWindow();

  await activate(win, parts.join('-'));
  await expect(win.locator('#msg.error')).toBeVisible({ timeout: 30000 });
  expect(fs.existsSync(path.join(profile, 'license.enc'))).toBe(false);

  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
