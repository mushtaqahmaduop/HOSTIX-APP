// ════════════════════════════════════════════════════════════════════════════
// Mess exemption and the combined charge field (warden ledger spec §2.6, §3.6,
// §5 step 7).
//
// tests/messExempt.test.js proves the rules. This proves the screens: in a
// "rent + mess together" hostel a warden asks from the student panel, the
// request waits in Users → Wardens, an admin approves it, this month's unpaid
// bill loses its mess, and the payment forms show ONE "Rent + Mess" box while
// the record keeps rent and mess apart.
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

test('a warden asks, an admin approves, and the bill drops the mess', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    const pid = await win.evaluate(async () => {
      DB.settings.serviceModel = 'rent_mess_bundled';
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 10000; rt.defaultMess = 7000;
      DB.rooms = [{ id: 'rmM', number: 'M1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuM', name: 'Mess Student', roomId: 'rmM', status: 'Active',
                       joinDate: '2026-01-01', paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = [];
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
    await win.evaluate(() => showStudentPanel('stuM'));
    await win.waitForSelector('#stu-panel .stu-pan__act');
    const actLabel = await win.evaluate(() =>
      [...document.querySelectorAll('#stu-panel .stu-pan__act span')].map(s => s.textContent));
    expect(actLabel).toContain('Mess Exemption');

    await win.evaluate(() => stuMeShowRequest('stuM', 'start'));
    await win.waitForSelector('#me-req-reason');
    await win.evaluate(async () => {
      document.getElementById('me-req-reason').value = 'Medical — diet plan';
      await stuMeDoRequest('stuM', 'start');
    });
    await win.waitForFunction(() => !!document.querySelector('#stu-panel .stu-pan__mechip.is-wait'));
    const waiting = await win.evaluate(pid => ({
      exempt: DB.students[0].messExempt === true,
      mess: DB.payments.find(p => p.id === pid).messIncluded,
    }), pid);
    expect(waiting).toEqual({ exempt: false, mess: true });
    await win.evaluate(() => closeStudentPanel());

    // ── The admin approves it from Users → Wardens ───────────────────────────
    await actAs(win, 'warden1');
    expect(await win.evaluate(() => chromeAlerts().some(a => /Mess exemption requested/.test(a.msg)))).toBe(true);
    await win.evaluate(() => { usersTab = 'wardens'; navigate('users'); });
    await win.waitForSelector('tr[data-mess-request="stuM"]');
    await win.evaluate(() => usrMeApprove('stuM'));
    await win.waitForFunction(() => !document.querySelector('tr[data-mess-request="stuM"]'));

    const after = await win.evaluate(pid => {
      const p = DB.payments.find(x => x.id === pid);
      return { exempt: DB.students[0].messExempt, messIncluded: p.messIncluded, messCharge: p.messCharge,
               unpaid: p.unpaid, total: resolveCharges(DB.students[0]).total };
    }, pid);
    expect(after).toEqual({ exempt: true, messIncluded: false, messCharge: 7000, unpaid: 10000, total: 10000 });

    // The warden's bell carries the outcome.
    await actAs(win, 'w_sara');
    expect(await win.evaluate(() => chromeAlerts().some(a => /was approved/.test(a.msg)))).toBe(true);

    // ── The Edit form shows ONE box; the record keeps both halves ────────────
    await actAs(win, 'warden1');
    await win.evaluate(pid => showEditPaymentModal(pid), pid);
    await win.waitForSelector('#f-pcombo');
    const form = await win.evaluate(() => ({
      combo: document.getElementById('f-pcombo').value,
      rentBox: !!document.getElementById('f-pamt'),
      messBox: !!document.querySelector('#f-pmess:not([type="hidden"])'),
    }));
    expect(form).toEqual({ combo: '10000', rentBox: false, messBox: false });
    const saved = await win.evaluate(async pid => {
      document.getElementById('f-pcombo').value = '9500';
      pfComboInput();
      await submitEditPayment(pid);
      const p = DB.payments.find(x => x.id === pid);
      return { rent: p.monthlyRent, mess: p.messCharge, messIncluded: p.messIncluded, unpaid: p.unpaid };
    }, pid);
    expect(saved).toEqual({ rent: 9500, mess: 7000, messIncluded: false, unpaid: 9500 });

    // ── The student row's Add Payment modal: one box too ─────────────────────
    await win.evaluate(() => { closeModal(); showAddPaymentForStudent('stuM'); });
    await win.waitForSelector('#f-ps-combo');
    /* This month's record is still pending, so the modal loads it — and the
       hidden mess half must be what is billed (0), not the configured 7,000, or
       saving would put the mess back on an exempt student's month. */
    await win.waitForTimeout(300);
    expect(await win.evaluate(() => ({
      combo: document.getElementById('f-ps-combo').value,
      mess:  document.getElementById('f-ps-mess').value,
    }))).toEqual({ combo: '10000', mess: '0' });   // the modal loads the CURRENT resolved rent
    await win.evaluate(() => closeModal());
  } finally {
    await app.close();
  }
});
