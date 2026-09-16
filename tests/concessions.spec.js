// ════════════════════════════════════════════════════════════════════════════
// Standing concessions on screen (warden ledger spec §2.4, §3.9, §5 step 8).
//
// tests/concessions.test.js proves the rules. This proves the screens and the
// storage: a warden asks from the student panel, the request waits in
// Users → Wardens, an admin approves it with one tap, this month's unpaid
// bill carries it, the Financial tab lists it, and the concessions table
// survives a reload from SQLite.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env };
}

async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForFunction(
    () => typeof _ledgerReady !== 'undefined' && _ledgerReady === true, null, { timeout: 30000 });
}

test.beforeAll(() => { resetProfile(); });

const actAs = (win, id) => win.evaluate(id => {
  CUR_ROLE = id; CUR_USER = WARDENS[id];
  if (typeof applyPermissionsToChrome === 'function') applyPermissionsToChrome();
}, id);

test('a warden asks, an admin approves with one tap, and the month carries it', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    const pid = await win.evaluate(async () => {
      DB.settings.serviceModel = 'rent_mess_optional';
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 10000; rt.defaultMess = 7000;
      DB.rooms = [{ id: 'rmC', number: 'C1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuC', name: 'Concession Student', roomId: 'rmC', status: 'Active', messOptIn: true,
                       joinDate: '2026-01-01', paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = []; DB.concessions = [];
      await saveDB();
      WARDENS.w_sara = { username: 'sara', name: 'Sara Warden', active: true,
        perms: { add: true, edit: true, payments: true, reports: true },
        pw: await hashNewPassword('Sara@12345') };
      saveWardenConfig();
      await generateMonthlyRents();
      await saveDB();
      return DB.payments[0].id;
    });

    // ── The warden asks from the student panel ───────────────────────────────
    await actAs(win, 'w_sara');
    await win.evaluate(() => showStudentPanel('stuC'));
    await win.waitForSelector('#stu-panel .stu-pan__tile');
    expect(await win.evaluate(() =>
      [...document.querySelectorAll('#stu-panel .stu-pan__tile span')].map(s => s.textContent))).toContain('Concession');
    await win.evaluate(() => stuCnShowRequest('stuC'));
    await win.waitForSelector('#cn-value');
    await win.evaluate(async () => {
      document.getElementById('cn-value').value = '1500';
      document.getElementById('cn-reason').value = 'Financial hardship';
      await stuCnDoRequest('stuC');
    });
    const waiting = await win.evaluate(pid => ({
      n: DB.concessions.length, status: DB.concessions[0] && DB.concessions[0].status,
      conc: DB.payments.find(p => p.id === pid).concession,
    }), pid);
    expect(waiting).toEqual({ n: 1, status: 'pending', conc: 0 });

    // ── The admin approves it from Users → Wardens ───────────────────────────
    await actAs(win, 'warden1');
    expect(await win.evaluate(() => chromeAlerts().some(a => /Concession requested/.test(a.msg)))).toBe(true);
    await win.evaluate(() => { usersTab = 'wardens'; navigate('users'); });
    const cid = await win.evaluate(() => DB.concessions[0].id);
    await win.waitForSelector(`tr[data-concession-request="${cid}"]`);
    await win.evaluate(cid => usrCnApprove(cid), cid);
    await win.waitForFunction(cid => !document.querySelector(`tr[data-concession-request="${cid}"]`), cid);

    const after = await win.evaluate(pid => {
      const p = DB.payments.find(x => x.id === pid);
      return { status: DB.concessions[0].status, conc: p.concession, unpaid: p.unpaid,
               ledger: DB.studentLedger.filter(e => e.paymentRecordId === pid && e.type === 'concession').length };
    }, pid);
    expect(after).toEqual({ status: 'approved', conc: 1500, unpaid: 15500, ledger: 1 });

    // ── The Financial tab lists it, with End for an admin ────────────────────
    await win.evaluate(() => { showStudentPanel('stuC', 'financial'); });
    await win.waitForSelector(`#stu-panel [data-concession="${cid}"]`);
    const row = await win.evaluate(cid => document.querySelector(`#stu-panel [data-concession="${cid}"]`).innerText, cid);
    expect(row).toContain('Active');
    expect(row).toContain('End');
    await win.evaluate(() => closeStudentPanel());

    // ── The table survives a reload from SQLite ──────────────────────────────
    const stored = await win.evaluate(async () => (await window.electronAPI.dbAll('concessions')).map(c => c.status));
    expect(stored).toEqual(['approved']);
  } finally {
    await app.close();
  }
});
