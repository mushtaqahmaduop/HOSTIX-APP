// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — Remember me and Switch account
//
// Owner, 2026-09-15: an installed app that had been signed into once kept
// opening with no password asked. Remember me now keeps USERNAMES only: every
// launch asks for the password, and "Switch account" on the login screen steps
// through the usernames remembered on this PC without ever filling a password.
//
// What is under test is what Chromium keeps on disk between two separate
// launches of Electron, so this spec relaunches against one profile. The
// profile is reset once, in beforeAll, and deliberately NOT between launches:
// what carries over is the whole point.
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

/** The login screen is up and the accounts are loaded. */
async function atLogin(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
}

async function signIn(win, { user = 'warden1', pass = 'admin123', remember }) {
  await atLogin(win);
  await win.fill('#login-user', user);
  await win.fill('#login-input', pass);
  const box = win.locator('#login-remember');
  if (remember) await box.check(); else await box.uncheck();
  await win.click('#login-btn');
  await insideApp(win);
}

const stored = win => win.evaluate(() => {
  const k = 'damam_auth_' + (sessionStorage.getItem('active_hostel') || 'hostel_1') + '_';
  return { session: localStorage.getItem(k + 'session'),
           remember: JSON.parse(localStorage.getItem(k + 'remember') || 'null') };
});

const loginView = win => win.evaluate(() => ({
  shown:  document.getElementById('login-screen').style.display !== 'none',
  user:   document.getElementById('login-user').value,
  pass:   document.getElementById('login-input').value,
  ticked: document.getElementById('login-remember').checked,
  swap:   !document.getElementById('login-swap').hidden,
  forget: !document.getElementById('login-forget').hidden,
}));

test('remember me keeps the username, never the session: the next launch asks for the password', async () => {
  let { app, win } = await open();
  await signIn(win, { remember: true });
  const s1 = await stored(win);
  expect(s1.session, 'the session was written where the next launch can read it').toBeNull();
  expect(s1.remember).toEqual({ users: ['warden1'], user: 'warden1' });
  expect(JSON.stringify(s1).includes('admin123'), 'the password reached disk').toBe(false);
  await app.close();

  ({ app, win } = await open());
  await atLogin(win);
  await win.waitForTimeout(400);
  const v = await loginView(win);
  expect(v.shown, 'the app opened without asking for the password').toBe(true);
  expect(v.user, 'the remembered username was not filled in').toBe('warden1');
  expect(v.pass).toBe('');
  expect(v.ticked).toBe(true);
  expect(v.swap, 'Switch account showed with only one remembered name').toBe(false);
  expect(v.forget).toBe(true);
  await app.close();
});

test('a session the older build left on disk does not open the app', async () => {
  let { app, win } = await open();
  await signIn(win, { remember: true });
  await win.evaluate(() => {
    const k = 'damam_auth_' + (sessionStorage.getItem('active_hostel') || 'hostel_1') + '_';
    localStorage.setItem(k + 'session', JSON.stringify({
      token: 'a'.repeat(64), role: 'warden1', name: 'Warden', remembered: true,
      createdAt: Date.now(), expiresAt: Date.now() + 3600e3, lastActive: Date.now() }));
  });
  await app.close();

  ({ app, win } = await open());
  await atLogin(win);
  await win.waitForTimeout(400);
  expect((await loginView(win)).shown, 'the old stored session opened the app').toBe(true);
  expect((await stored(win)).session, 'the old session was left on disk').toBeNull();
  await app.close();
});

test('switch account steps through remembered usernames and never fills a password', async () => {
  let { app, win } = await open();
  await signIn(win, { remember: true });                       // warden1 remembered
  await win.evaluate(async () => {
    WARDENS.w_sara = { username: 'sara', name: 'Sara Warden', active: true,
      perms: { payments: true }, pw: await hashNewPassword('Sara@12345') };
    saveWardenConfig();
  });
  await win.evaluate(() => logout());
  await signIn(win, { user: 'sara', pass: 'Sara@12345', remember: true });
  await app.close();

  ({ app, win } = await open());
  await atLogin(win);
  await win.waitForTimeout(400);
  let v = await loginView(win);
  expect(v.user).toBe('sara');
  expect(v.swap, 'Switch account is missing with two remembered names').toBe(true);

  await win.fill('#login-input', 'typed-before-switching');
  await win.click('#login-swap');
  v = await loginView(win);
  expect(v.user).toBe('warden1');
  expect(v.pass, 'switching kept the password that was typed').toBe('');
  expect(await win.evaluate(() => document.activeElement && document.activeElement.id)).toBe('login-input');
  await win.click('#login-swap');
  expect((await loginView(win)).user).toBe('sara');

  // Switch account belongs to Remember me.
  await win.locator('#login-remember').uncheck();
  expect((await loginView(win)).swap).toBe(false);
  await win.locator('#login-remember').check();
  expect((await loginView(win)).swap).toBe(true);

  // × forgets the name shown, on this PC only.
  await win.click('#login-forget');
  v = await loginView(win);
  expect(v.user).toBe('warden1');
  expect(v.swap).toBe(false);
  expect((await stored(win)).remember).toEqual({ users: ['warden1'], user: 'warden1' });
  expect(await win.evaluate(() => !!WARDENS.w_sara), 'forgetting the name touched the account').toBe(true);

  // Signing in unticked takes the name off the list.
  await signIn(win, { remember: false });
  expect((await stored(win)).remember).toBeNull();
  await app.close();
});
