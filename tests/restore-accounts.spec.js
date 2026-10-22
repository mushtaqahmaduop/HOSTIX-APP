// ════════════════════════════════════════════════════════════════════════════
// Staff accounts travel with the backup (bug audit BUG-012, 2026-09-28).
// Before: accounts lived only in this profile's localStorage, so a restore on a
// new PC brought back every record and no staff logins.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');
const { settleFreshInstall } = require('./_fresh-install');

const launch = () => { const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env }); };
async function login(win, user, pw) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 60000 });
  await win.selectOption('#login-user', user); await win.fill('#login-input', pw); await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 60000 });
}

test.beforeAll(() => { resetProfile(); });

test('a backup carries the staff accounts, hashed, and a restore brings them back', async () => {
  test.setTimeout(300000);
  let app = await launch(); let win = await app.firstWindow();
  let file;
  try {
    await login(win, 'warden1', 'admin123'); await settleFreshInstall(win);
    file = await win.evaluate(async () => {
      WARDENS.sara = { username: 'sara', name: 'Sara Accounts', phone: '', active: true,
        pw: await hashPassword('sara-pass-77'),
        perms: Object.assign({}, WARDENS.warden1.perms, { users: false, settings: false }) };
      saveWardenConfig();
      return JSON.stringify(backupDocument());
    });
    const doc = JSON.parse(file);
    expect(Object.keys(doc.staffAccounts.users).sort()).toEqual(['sara', 'warden1']);
    expect(file.includes('sara-pass-77'), 'a plain password reached the backup').toBe(false);
    expect(typeof doc.staffAccounts.users.sara.pw.hash).toBe('string');

    // A "new PC": only the default account is left, then the Backup page restores.
    const after = await win.evaluate(async (text) => {
      delete WARDENS.sara; saveWardenConfig();
      navigate('backup'); await new Promise(r => setTimeout(r, 500));
      let input = document.getElementById('restore-file-input');
      if (!input) { input = document.createElement('input'); input.type = 'file'; input.id = 'restore-file-input'; document.body.appendChild(input); }
      const dt = new DataTransfer(); dt.items.add(new File([text], 'b.json', { type: 'application/json' }));
      input.files = dt.files;
      await restoreBackup(); await new Promise(r => setTimeout(r, 600));
      if (typeof _pendingConfirmCb === 'function') _confirmYes();
      await new Promise(r => setTimeout(r, 2500));
      return Object.keys(WARDENS).sort();
    }, file);
    expect(after).toEqual(['sara', 'warden1']);
  } finally { await app.close(); }

  // Across a restart the restored account signs in with its own password.
  app = await launch(); win = await app.firstWindow();
  try {
    await login(win, 'sara', 'sara-pass-77');
    const who = await win.evaluate(() => ({ role: _getSession().role, users: canDo('users') }));
    expect(who).toEqual({ role: 'sara', users: false });
  } finally { await app.close(); }
});

test('a damaged or admin-less accounts section restores the records and keeps this PC\'s accounts', async () => {
  test.setTimeout(240000);
  const app = await launch(); const win = await app.firstWindow();
  try {
    await login(win, 'warden1', 'admin123');
    const r = await win.evaluate(async () => {
      const toasts = []; const ot = window.toast; window.toast = (m, k) => toasts.push(k + ': ' + m);
      const out = {};
      const base = () => JSON.parse(JSON.stringify(backupDocument()));
      // No account that can manage users.
      const noAdmin = base();
      noAdmin.staffAccounts = { v: 1, users: { temp: { username: 'temp', active: true, pw: WARDENS.warden1.pw, perms: { users: false } } } };
      noAdmin.students = [{ id: '777', name: 'Restored Anyway', roomId: '', status: 'Active' }];
      out.noAdmin = (await importBackupData(noAdmin)).staff;
      out.students = DB.students.map(s => s.name);
      out.accountsKept = Object.keys(WARDENS).includes('warden1') && !Object.keys(WARDENS).includes('temp');
      // A password that is not a hash.
      const bad = base(); bad.staffAccounts.users.warden1.pw = { hash: 'not hex!', salt: 'zz' };
      out.bad = (await importBackupData(bad)).staff.reason;
      // A file from before this change: no section at all.
      const old = base(); delete old.staffAccounts;
      out.old = (await importBackupData(old)).staff;
      // The signed-in account is not in the file: it is signed out.
      const other = base();
      other.staffAccounts = { v: 1, users: { boss: { username: 'boss', active: true, pw: WARDENS.warden1.pw, perms: { users: true } } } };
      const ol = window.logout; let loggedOut = 0; window.logout = () => { loggedOut++; };
      out.other = (await importBackupData(other)).staff;
      await new Promise(r => setTimeout(r, 2200));
      out.loggedOut = loggedOut;
      window.logout = ol; window.toast = ot;
      out.warned = toasts.some(t => /not the staff accounts/.test(t));
      return out;
    });
    expect(r.noAdmin).toEqual({ restored: 0, signedOut: false, reason: 'it has no account that can manage users' });
    expect(r.students).toEqual(['Restored Anyway']);
    expect(r.accountsKept).toBe(true);
    expect(r.bad).toBe('a staff account in it has no usable password');
    expect(r.old).toEqual({ restored: 0, signedOut: false, reason: 'none in file' });
    expect(r.other).toEqual({ restored: 1, signedOut: true, reason: '' });
    expect(r.loggedOut).toBe(1);
    expect(r.warned).toBe(true);
  } finally { await app.close(); }
});
