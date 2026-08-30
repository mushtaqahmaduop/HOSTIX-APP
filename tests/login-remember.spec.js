// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — Remember me
//
// The owner asked for this because wardens were retyping a password every time
// the app opened. The feature is only worth anything if the session actually
// survives closing the app, and it is only safe if unticking the box actually
// stops it surviving — neither of which any amount of reading the code proves,
// because the thing under test is what Chromium keeps on disk between two
// separate launches of Electron.
//
// So this spec launches the app four times against one profile:
//   1. sign in with the box TICKED
//   2. relaunch  → must land inside the app, no password asked
//   3. sign out, sign in again with the box UNTICKED
//   4. relaunch  → must be back at the login screen
//
// The profile is reset once, in beforeAll, and deliberately NOT between
// launches: what carries over is the whole point.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
}

/** Launch and return { app, win } with the renderer ready. */
async function open() {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** True once the login screen is gone, i.e. we are inside the app. */
function insideApp(win, timeout = 30000) {
  return win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout });
}

async function signIn(win, { remember }) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  const box = win.locator('#login-remember');
  if (remember) await box.check(); else await box.uncheck();
  await win.click('#login-btn');
  await insideApp(win);
}

test('a remembered session survives closing the app, and unticking ends it', async () => {
  // ── 1. Sign in, remembering ───────────────────────────────────────────────
  let { app, win } = await open();
  await signIn(win, { remember: true });
  const stored = await win.evaluate(() => {
    const k = 'damam_auth_' + (sessionStorage.getItem('active_hostel') || 'hostel_1') + '_';
    const sess = JSON.parse(localStorage.getItem(k + 'session') || 'null');
    return {
      persisted: !!(sess && sess.token),
      remembered: !!(sess && sess.remembered),
      user: JSON.parse(localStorage.getItem(k + 'remember') || 'null'),
      // The password must not be anywhere in what we just wrote.
      leaksPassword: JSON.stringify(sess || {}).includes('admin123'),
    };
  });
  expect(stored.persisted, 'nothing was persisted for next time').toBe(true);
  expect(stored.remembered).toBe(true);
  expect(stored.user).toEqual({ user: 'warden1' });
  expect(stored.leaksPassword, 'the password reached disk').toBe(false);
  await app.close();

  // ── 2. Relaunch: straight in, no password ────────────────────────────────
  ({ app, win } = await open());
  await insideApp(win);
  const who = await win.evaluate(() => (CUR_USER && CUR_USER.username) || null);
  expect(who, 'restored the session as the wrong account').toBe('warden1');

  // Sign out. The username is deliberately kept so the warden does not retype
  // who they are; the session is not.
  await win.evaluate(() => logout());
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  const afterLogout = await win.evaluate(() => ({
    user: document.getElementById('login-user').value,
    boxTicked: document.getElementById('login-remember').checked,
    focused: document.activeElement && document.activeElement.id,
  }));
  expect(afterLogout.user, 'the remembered username was thrown away too').toBe('warden1');
  expect(afterLogout.boxTicked).toBe(true);

  // ── 3. Sign in again, this time NOT remembering ──────────────────────────
  await signIn(win, { remember: false });
  const cleared = await win.evaluate(() => {
    const k = 'damam_auth_' + (sessionStorage.getItem('active_hostel') || 'hostel_1') + '_';
    return { session: localStorage.getItem(k + 'session'), remember: localStorage.getItem(k + 'remember') };
  });
  expect(cleared.session, 'unticking left the session on disk').toBeNull();
  expect(cleared.remember, 'unticking left the username on disk').toBeNull();
  await app.close();

  // ── 4. Relaunch: the login screen is back ────────────────────────────────
  ({ app, win } = await open());
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  const stillOut = await win.evaluate(() => {
    const s = document.getElementById('login-screen');
    return s && s.style.display !== 'none';
  });
  expect(stillOut, 'an unremembered session came back anyway').toBe(true);
  await app.close();
});

test('an expired shift is not remembered, however the box was ticked', async () => {
  // The 8h ceiling is the whole safety argument for the feature, so it gets its
  // own proof: a persisted session whose expiresAt has passed must not restore.
  let { app, win } = await open();
  await signIn(win, { remember: true });
  await win.evaluate(() => {
    const k = 'damam_auth_' + (sessionStorage.getItem('active_hostel') || 'hostel_1') + '_';
    const s = JSON.parse(localStorage.getItem(k + 'session'));
    s.expiresAt = Date.now() - 1000;          // the shift ended a second ago
    localStorage.setItem(k + 'session', JSON.stringify(s));
  });
  await app.close();

  ({ app, win } = await open());
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  const asked = await win.evaluate(() => {
    const s = document.getElementById('login-screen');
    return { shown: s && s.style.display !== 'none',
             user: document.getElementById('login-user').value };
  });
  expect(asked.shown, 'an expired session restored anyway').toBe(true);
  // …but it still knows who they are. Only the proof expired, not the name.
  expect(asked.user).toBe('warden1');
  await app.close();
});
