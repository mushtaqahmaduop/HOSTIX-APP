// ════════════════════════════════════════════════════════════════════════════
// HOSTIX — user-model migration safety net
//
// The auth model changed from a fixed two-warden map to an open user list with
// per-user permissions. 50+ paying hostels already hold the OLD shape:
//
//   { warden1: {name, phone, canEdit, canDelete, canSettings, pw, photo},
//     warden2: {...} }
//
// If the migration is wrong those installs cannot sign in to their own data.
// The smoke test only ever sees a FRESH profile, so it would not catch that.
// This spec builds a genuine old-format config and proves:
//   1. an existing password still works after migration,
//   2. permissions are derived, never silently reduced,
//   3. only an account that could reach settings inherits user management,
//   4. an inactive account cannot sign in,
//   5. a newly added user can sign in and is correctly restricted.
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
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
}

async function waitForLogin(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
}

/** Drive the real login handler; returns whether the login screen went away. */
async function tryLogin(win, username, password) {
  return await win.evaluate(async ([u, p]) => {
    document.getElementById('login-user').value = u;
    document.getElementById('login-input').value = p;
    await checkLogin();
    // checkLogin hides the screen on a 420ms delay after success.
    await new Promise(r => setTimeout(r, 700));
    return document.getElementById('login-screen').style.display === 'none';
  }, [username, password]);
}

// fs.rmSync(..., { force: true }) swallows EBUSY, so while a just-closed
// Electron still holds leveldb's LOCK the wipe is a silent no-op. Retry until
// the directory is really gone, and fail loudly if it never is — a test that
// inherits the previous test's warden config asserts nothing.
async function wipeProfileState() {
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  const ls = path.join(PROFILE, 'Local Storage');
  for (let i = 0; i < 25; i++) {
    try { fs.rmSync(ls, { recursive: true, force: true }); } catch { /* retry */ }
    if (!fs.existsSync(ls)) return;
    await new Promise(r => setTimeout(r, 120));
  }
  throw new Error('could not clear ' + ls + ' — an Electron process is still holding it');
}

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
});

// Was beforeAll, which wiped once for the whole file — so the migration test's
// legacy config leaked into the test after it. That went unnoticed only because
// the legacy password and the fresh-install default were the same string.
test.beforeEach(async () => {
  await wipeProfileState();
});

test('an existing two-warden install migrates without losing access', async () => {
  // ── Launch 1: let the app create a real PBKDF2 hash we can reuse ──────────
  let app = await electron.launch(launchOpts());
  let win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await waitForLogin(win);

  // Take the genuine hash of the OLD default password (the username), then
  // rewrite the stored config into the OLD shape — exactly what a live client
  // machine holds. Hash it explicitly rather than borrowing WARDENS.warden1.pw,
  // which now hashes DEFAULT_PASSWORD and would make this test assert nothing.
  const storageKey = await win.evaluate(async () => {
    const realHash = await hashPassword('warden1');
    const key = Object.keys(localStorage).find(k => k.endsWith('_wardens'));
    const legacy = {
      warden1: { name: 'Faheem Ullah', phone: '0300-1111111',
                 canDelete: true, canSettings: true,  canEdit: true, pw: realHash },
      warden2: { name: 'Warden 2',     phone: '',
                 canDelete: true, canSettings: false, canEdit: true, pw: realHash },
    };
    localStorage.setItem(key, JSON.stringify(legacy));
    return key;
  });
  expect(storageKey, 'could not find the wardens storage key').toBeTruthy();
  await app.close();

  // ── Launch 2: boot against the legacy config ─────────────────────────────
  app = await electron.launch(launchOpts());
  win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await waitForLogin(win);

  const migrated = await win.evaluate(() => JSON.parse(JSON.stringify(WARDENS)));

  // 1. Both accounts survived and gained a username.
  expect(Object.keys(migrated).sort()).toEqual(['warden1', 'warden2']);
  expect(migrated.warden1.username).toBe('warden1');
  expect(migrated.warden2.username).toBe('warden2');

  // 2. Existing details are untouched.
  expect(migrated.warden1.name).toBe('Faheem Ullah');
  expect(migrated.warden1.phone).toBe('0300-1111111');

  // 3. Permissions derived from the old flags. Nothing that was allowed before
  //    may come out denied — every old flag here was true except canSettings.
  expect(migrated.warden1.perms.edit).toBe(true);
  expect(migrated.warden1.perms.delete).toBe(true);
  expect(migrated.warden1.perms.settings).toBe(true);
  expect(migrated.warden1.perms.payments).toBe(true);
  expect(migrated.warden1.perms.reports).toBe(true);
  expect(migrated.warden1.perms.backup).toBe(true);

  // 4. Only the account that could already reach settings inherits user
  //    management — otherwise every warden could grant themselves anything.
  expect(migrated.warden1.perms.users).toBe(true);
  expect(migrated.warden2.perms.settings).toBe(false);
  expect(migrated.warden2.perms.users).toBe(false);

  // 5. THE ONE THAT MATTERS: the existing password still signs in.
  expect(await tryLogin(win, 'warden1', 'warden1'),
    'a migrated account could not sign in with its existing password').toBe(true);

  await app.close();
});

test('added users can sign in, and inactive ones cannot', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await waitForLogin(win);
  expect(await tryLogin(win, 'warden1', 'admin123')).toBe(true);

  // Add a restricted user through the real save path.
  await win.evaluate(async () => {
    showUserEditor(null);
    document.getElementById('u-name').value = 'Night Warden';
    document.getElementById('u-username').value = 'night';
    document.getElementById('u-pw').value = 'night-pass';
    document.getElementById('u-active').checked = true;
    // Everyday access only — no settings, no users.
    ['edit', 'payments', 'reports'].forEach(k => { document.getElementById('up-' + k).checked = true; });
    ['delete', 'backup', 'settings', 'users']
      .forEach(k => { document.getElementById('up-' + k).checked = false; });
    await saveUser(null);
  });

  const added = await win.evaluate(() =>
    Object.values(WARDENS).find(u => u.username === 'night'));
  expect(added, 'the new user was not stored').toBeTruthy();
  expect(added.perms.settings).toBe(false);
  expect(added.perms.users).toBe(false);

  // Sign in as the new user and confirm the permission gate really denies.
  await win.evaluate(() => { logout(); });
  await win.waitForLoadState('domcontentloaded');
  await waitForLogin(win);
  expect(await tryLogin(win, 'night', 'night-pass'),
    'a newly added user could not sign in').toBe(true);

  const gate = await win.evaluate(() => ({
    edit: canDo('edit'), settings: canDo('settings'),
    users: canDo('users'),
  }));
  expect(gate).toEqual({ edit: true, settings: false, users: false });

  // The restricted page renders the refusal rather than the settings screen.
  await win.evaluate(() => navigate('settings'));
  await win.waitForTimeout(400);
  const html = await win.evaluate(() => document.getElementById('content').innerHTML);
  expect(html).toContain('Not permitted');

  // Deactivating an account must stop it signing in.
  await win.evaluate(() => {
    const id = Object.keys(WARDENS).find(k => WARDENS[k].username === 'night');
    WARDENS[id].active = false;
    saveWardenConfig();
    logout();
  });
  await win.waitForLoadState('domcontentloaded');
  await waitForLogin(win);
  expect(await tryLogin(win, 'night', 'night-pass'),
    'an inactive account was still able to sign in').toBe(false);

  await app.close();
});

/* ── THE PROFILE PHOTO, AT ADD TIME ──────────────────────────────────────────
   Owner, 2026-09-10: "the add user profile picture could not uploads at the
   time of ading user."

   Two faults, and the second was the quiet one:
     · the Add form drew a dead box reading "Add after saving", because the
       handler wrote into WARDENS[key] and a user being created has no key;
     · the control the Edit form DID draw called .click() on an element id that
       nothing in this app ever rendered, so it threw on a null and did nothing
       at all — no picker, no error the warden could see.

   This test drives the real handler with a real file, on both forms. */
test('a profile photo can be chosen while the account is still being created', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await waitForLogin(win);
  expect(await tryLogin(win, 'warden1', 'admin123')).toBe(true);

  const pageErrors = [];
  win.on('pageerror', e => pageErrors.push(String(e)));

  // A 2x2 PNG, small enough to inline and real enough for Image() to decode.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF'
            + 'ElEQVR4nGP8z8Dwn4GBgYERRIAAIvsD/1lCQZ4AAAAASUVORK5CYII=';

  const opened = await win.evaluate(() => {
    showUserEditor(null);
    return {
      input:  !!document.getElementById('u-photo-input'),
      avatar: !!document.getElementById('u-avatar'),
      // The dead box said this. It must not be on the form any more.
      deadBox: document.querySelector('.usf-photo').textContent.indexOf('Add after saving') !== -1,
    };
  });
  expect(opened.input,  'the file input the avatar opens does not exist').toBe(true);
  expect(opened.avatar, 'the Add form still offers no photo control').toBe(true);
  expect(opened.deadBox, 'the Add form still says the photo comes later').toBe(false);

  // Clicking the avatar must reach the picker rather than throw on a null.
  await win.evaluate(() => {
    let opened = false;
    const inp = document.getElementById('u-photo-input');
    inp.click = () => { opened = true; };
    document.getElementById('u-avatar').click();
    window.__pickerOpened = opened;
  });
  expect(await win.evaluate(() => window.__pickerOpened),
    'clicking the avatar did not open the file picker').toBe(true);

  // Drive the real handler, then save. The photo must land on the new account.
  await win.evaluate(async (png) => {
    const bin = atob(png.split(',')[1]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const file = new File([buf], 'face.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const inp = document.getElementById('u-photo-input');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change'));
  }, PNG);
  await win.waitForTimeout(500);

  const held = await win.evaluate(() => ({
    pending: !!_uPendingPhoto,
    shown: (document.getElementById('u-avatar') || {}).outerHTML || '',
  }));
  expect(held.pending, 'the chosen photo was dropped instead of held for the new account').toBe(true);
  expect(held.shown, 'the form does not show the photo that was chosen').toContain('<img');

  await win.evaluate(async () => {
    document.getElementById('u-name').value = 'Photo Warden';
    document.getElementById('u-username').value = 'photow';
    document.getElementById('u-pw').value = 'photo-pass';
    await saveUser(null);
  });

  const saved = await win.evaluate(() =>
    Object.values(WARDENS).find(u => u.username === 'photow'));
  expect(saved, 'the new user was not stored').toBeTruthy();
  expect(String(saved.photo || ''), 'the photo chosen at add time was not saved')
    .toMatch(/^data:image\//);

  // And it must not follow the next account that gets created.
  const leaked = await win.evaluate(() => {
    showUserEditor(null);
    return _uPendingPhoto;
  });
  expect(leaked, 'the photo leaked into the next new account').toBeNull();

  await app.close();
  expect(pageErrors, 'uncaught JS error').toEqual([]);
});
