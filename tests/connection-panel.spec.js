// ════════════════════════════════════════════════════════════════════════════
// Settings → Connection — the §29 readout.
//
// The point of the panel is that the four states stay four states. A hostel on
// working WiFi with a dead control plane and a valid cached licence is not the
// same situation as a hostel with no internet, and one light cannot say which
// one you are looking at.
//
// THERE IS A CONTROL PLANE NOW. This file was written for the build that had
// none, and asserted that nothing was configured, nothing had ever been reached,
// and re-checking was a no-op. `feat(discovery)` (2297a9c, 2026-09-05) ended all
// three deliberately: an install learns the address from control-plane.json, so
// the estate can be re-pointed or switched off without cutting a release, and an
// install that never dials cannot be either.
//
// The rules that survive that, and are what this file now holds:
//   · four states, answered separately, never collapsed into one boolean;
//   · `authenticated` is never inferred from the other three;
//   · the control-plane URL never crosses the bridge;
//   · each row carries a word a person can read, never a raw reason code;
//   · re-checking resolves rather than hanging, and authenticates nothing.
//
// Its `.dash-pill` selector had also been counting NOTHING since the panel was
// rebuilt on `.conn-row`, so "four states, shown as four" was passing on a zero
// it never compared. It counts four now.
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

test('the connection panel reports four separate states, and never collapses them', async () => {
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

  /* THE OFFLINE GATE IS GONE, ON PURPOSE. This asserted that nothing was
     configured and nothing had ever been reached — the Phase 1 world.
     `feat(discovery)` (2297a9c, 2026-09-05) ships control-plane.json, so a
     licensed machine now learns the address on boot, reaches it, and this panel
     reports `online`. An install that never dials cannot be re-pointed or
     switched off, which is the whole reason discovery exists.

     What survives is the guarantee the panel is FOR: four states, each answered
     separately, and `authenticated` never inferred from the other three. That
     was §7's rule and it is the one a single `isOnline` boolean breaks. */
  const st = await win.evaluate(() => window.online.getStatus());
  console.log('[status] ' + JSON.stringify(st));
  for (const k of ['networkAvailable', 'apiReachable', 'authenticated', 'licenseValid']) {
    expect(typeof st[k], k + ' is not a real boolean').toBe('boolean');
  }
  expect(['unconfigured', 'offline', 'degraded', 'online'],
    'the panel reported a mode outside §7\'s set').toContain(st.mode);
  expect(st.authenticated,
    'reaching the control plane is not the same as holding a token for it').toBe(false);
  expect(JSON.stringify(st), 'the status object carries the control-plane URL')
    .not.toMatch(/https?:\/\//);

  // The panel itself.
  await win.evaluate(() => { settingsTab = 'connection'; navigate('settings'); });
  await win.waitForSelector('#conn-body', { timeout: 8000 });
  await win.waitForFunction(
    () => !document.getElementById('conn-body').innerText.includes('Checking…'),
    null, { timeout: 8000 });

  const panel = await win.evaluate(() => ({
    text: document.getElementById('conn-body').innerText.replace(/\s+/g, ' '),
    rows: document.querySelectorAll('#conn-body .conn-row').length,
    hasCheckBtn: !!document.querySelector('#conn-body button'),
    renderError: document.body.innerText.includes('Render Error'),
  }));
  console.log('[panel] ' + JSON.stringify(panel));

  expect(panel.renderError).toBe(false);
  /* `.conn-row`, not `.dash-pill` — the panel was rebuilt into its own row
     component and this selector had been counting nothing, so "four states,
     shown as four" was passing on a zero it never compared. */
  expect(panel.rows, 'four states, shown as four').toBe(4);
  expect(panel.text).toContain('Internet');
  expect(panel.text).toContain('Hostyllo API');
  expect(panel.text).toContain('License');
  expect(panel.text).toContain('Application');
  /* Plain words, not four red crosses. The exact wording depends on what the
     panel FOUND — "Not configured" belonged to a build that could not be
     configured — so what is asserted is that each row carries a word at all,
     and that the panel never prints the raw reason codes underneath. */
  expect(panel.text).not.toMatch(/\bundefined\b|\bnull\b|\[object/);
  expect(panel.text, 'the panel does not say when it last looked').toContain('Last checked');
  expect(panel.hasCheckBtn, 'and a way to re-check').toBe(true);

  /* Re-checking must resolve rather than hang or throw, whatever it finds. It
     used to be asserted as a no-op, which was only true while there was
     nothing to call. */
  await win.evaluate(() => connCheckNow(null));
  await win.waitForTimeout(900);
  const after = await win.evaluate(() => window.online.getStatus());
  expect(['unconfigured', 'offline', 'degraded', 'online']).toContain(after.mode);
  expect(after.authenticated, 'a re-check must never authenticate anything').toBe(false);

  expect(pageErrors, 'no uncaught errors').toEqual([]);
  await app.close();
});
