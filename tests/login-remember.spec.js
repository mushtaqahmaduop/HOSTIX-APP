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
  await win.selectOption('#login-user', user);
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
  // #login-user is a <select> of the accounts on this PC (owner, 2026-09-23).
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
  expect(v.user, 'the list did not open on the remembered account').toBe('warden1');
  expect(v.pass).toBe('');
  expect(v.ticked).toBe(true);
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

test('the account list holds every active account, and Remember me decides where it opens', async () => {
  /* ══ REWRITTEN 2026-09-23 ═════════════════════════════════════
     This test drove Switch account and the forget × — a text box, a control
     that stepped through remembered names, and one that dropped a name. The
     owner replaced the box with a dropdown of every account on this PC, so
     there is nothing to step through and nothing to forget: picking IS the
     list, and the remembered name only decides which option it opens on.

     What the old test actually protected is all still asserted: a password is
     never carried from one account to another, and choosing an account never
     fills one. */
  let { app, win } = await open();
  await signIn(win, { remember: true });                       // warden1 remembered
  await win.evaluate(async () => {
    WARDENS.w_sara = { username: 'sara', name: 'Sara Warden', active: true,
      perms: { payments: true }, pw: await hashNewPassword('Sara@12345') };
    WARDENS.w_left = { username: 'left', name: 'Left Staff', active: false,
      perms: { payments: true }, pw: await hashNewPassword('Left@12345') };
    saveWardenConfig();
  });
  await win.evaluate(() => logout());
  await signIn(win, { user: 'sara', pass: 'Sara@12345', remember: true });
  await app.close();

  ({ app, win } = await open());
  await atLogin(win);
  await win.waitForTimeout(400);

  const list = await win.evaluate(() => {
    const s = document.getElementById('login-user');
    return { tag: s.tagName, values: [...s.options].map(o => o.value), value: s.value,
             labels: [...s.options].map(o => o.textContent) };
  });
  expect(list.tag, 'the account field is not a dropdown').toBe('SELECT');
  // Every ACTIVE account, and no inactive one — checkLogin() refuses those,
  // so offering one is offering a door that cannot open.
  expect(list.values.slice().sort()).toEqual(['sara', 'warden1']);
  // Each carries the role its permission ticks add up to.
  expect(list.labels.join(' | ')).toMatch(/Sara Warden — \w+/);
  // Remember me decided where it opened.
  expect(list.value, 'the list did not open on the remembered account').toBe('sara');

  // A password typed for one account is never carried to another.
  await win.fill('#login-input', 'typed-before-switching');
  await win.selectOption('#login-user', 'warden1');
  let v = await loginView(win);
  expect(v.user).toBe('warden1');
  expect(v.pass, 'switching kept the password that was typed').toBe('');
  expect(await win.evaluate(() => document.activeElement && document.activeElement.id)).toBe('login-input');

  // And the chosen account is the one that signs in.
  await win.fill('#login-input', 'Sara@12345');
  await win.selectOption('#login-user', 'sara');
  await win.fill('#login-input', 'Sara@12345');
  await win.click('#login-btn');
  await insideApp(win);
  expect(await win.evaluate(() => CUR_USER && CUR_USER.name)).toBe('Sara Warden');

  /* Signing in unticked takes THAT name off the list. The whole record is not
     cleared, because another account is still remembered on this PC — which is
     the case the single-account test above cannot cover. */
  await win.evaluate(() => logout());
  await signIn(win, { user: 'warden1', pass: 'admin123', remember: false });
  const after = (await stored(win)).remember;
  expect(after && after.users, 'warden1 was signed in unticked and stayed remembered')
    .not.toContain('warden1');
  await app.close();
});
