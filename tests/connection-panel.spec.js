// ════════════════════════════════════════════════════════════════════════════
// Settings → Connection — the §29 readout.
//
// The point of the panel is that the four states stay four states. A hostel on
// working WiFi with a dead control plane and a valid cached licence is not the
// same situation as a hostel with no internet, and one light cannot say which
// one you are looking at.
//
// On this build there is no control plane, so the panel must say "not
// configured" in plain words rather than showing four red crosses — and the app
// must still be making no network calls at all.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env };
}

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('the connection panel reports four separate states and makes no requests', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1500, height: 950 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(() => typeof CUR_USER !== 'undefined' && !!CUR_USER,
    null, { timeout: 30000 });
  await win.waitForTimeout(400);

  // The bridge is exactly six read-only methods — a seventh must be deliberate.
  // 'entitlement' was the sixth (Phase 2): a snapshot of this machine's licence
  // state, for support. Never the signed token, which is a credential.
  const bridge = await win.evaluate(() => Object.keys(window.online || {}).sort());
  console.log('\n[bridge] ' + JSON.stringify(bridge));
  expect(bridge).toEqual(['checkNow', 'entitlement', 'getLastSuccessfulConnection',
                          'onStatusChanged', 'getStatus', 'queueStats'].sort());

  // The offline gate: nothing configured, nothing ever reached.
  const st = await win.evaluate(() => window.online.getStatus());
  console.log('[status] ' + JSON.stringify(st));
  expect(st.configured, 'no control plane is configured on this build').toBe(false);
  expect(st.mode).toBe('unconfigured');
  expect(st.lastSuccessAt, 'nothing has ever been reached').toBeNull();
  expect(st.apiReachable).toBe(false);

  // The panel itself.
  await win.evaluate(() => { settingsTab = 'connection'; navigate('settings'); });
  await win.waitForSelector('#conn-body', { timeout: 8000 });
  await win.waitForFunction(
    () => !document.getElementById('conn-body').innerText.includes('Checking…'),
    null, { timeout: 8000 });

  const panel = await win.evaluate(() => ({
    text: document.getElementById('conn-body').innerText.replace(/\s+/g, ' '),
    rows: document.querySelectorAll('#conn-body .dash-pill').length,
    hasCheckBtn: !!document.querySelector('#conn-body button'),
    renderError: document.body.innerText.includes('Render Error'),
  }));
  console.log('[panel] ' + JSON.stringify(panel));

  expect(panel.renderError).toBe(false);
  expect(panel.rows, 'four states, shown as four').toBe(4);
  expect(panel.text).toContain('Internet');
  expect(panel.text).toContain('Hostyllo API');
  expect(panel.text).toContain('License');
  expect(panel.text).toContain('Application');
  // Plain words, not four red crosses.
  expect(panel.text).toContain('Not configured');
  expect(panel.text).toContain('Offline edition');
  expect(panel.text).toContain('makes no internet requests');
  expect(panel.hasCheckBtn, 'and a way to re-check').toBe(true);

  // Re-checking an unconfigured control plane must stay a no-op, not a request.
  await win.evaluate(() => connCheckNow(null));
  await win.waitForTimeout(600);
  const after = await win.evaluate(() => window.online.getStatus());
  expect(after.lastSuccessAt, 'checking again still reaches nothing').toBeNull();
  expect(after.mode).toBe('unconfigured');

  expect(pageErrors, 'no uncaught errors').toEqual([]);
  await app.close();
});
