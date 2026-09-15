// ════════════════════════════════════════════════════════════════════════════
// Prorated charging on screen (warden ledger spec §2.5, §3.10, §5 step 9).
//
// tests/prorate.test.js proves the rules. This proves the screens: the daily
// rate from Settings, By days on Add Payment line 01 (defaults, the live total,
// the mess switch set aside, whole numbers required), what the saved record,
// the ledger and the receipt say, that a Settings rent change leaves the month
// alone, that the month reopens as By days, and that changing the charge on
// Edit Payment turns it back into an ordinary month.
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

test('by days: days × rate is the charge, and the record, ledger, receipt and Edit form agree', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    const join = await win.evaluate(async () => {
      DB.settings.serviceModel = 'rent_mess_optional';
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 10000; rt.defaultMess = 7000;
      DB.rooms = [{ id: 'rmP', number: 'P1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      const joinDate = thisMonth() + '-15';
      DB.students = [{ id: 'stuP', name: 'Prorate Student', roomId: 'rmP', status: 'Active', messOptIn: true,
                       joinDate, paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = []; DB.concessions = [];
      await saveDB();
      await setDailyRate('700');
      return joinDate;
    });
    expect(await win.evaluate(() => DB.settings.dailyRate)).toBe(700);

    // ── Add Payment, line 01 ───────────────────────────────────────────────
    await win.evaluate(() => navigate('addpayment'));
    await win.waitForSelector('#f-pro-seg', { state: 'visible', timeout: 15000 });
    await win.evaluate(() => selectStudentForPayment('stuP'));
    expect(await win.evaluate(() => document.getElementById('f-pro-on').checked), 'did not open on Full month').toBe(false);

    await win.click('#f-pro-seg .ws__seg-b[data-on="1"]');
    const opened = await win.evaluate(j => ({
      days: document.getElementById('f-pro-days').value,
      want: String(prorateDefaultDays(document.getElementById('f-pmonth').value, j, today())),
      rate: document.getElementById('f-pro-rate').value,
      messHidden: document.getElementById('f-pmess-wrap').style.display === 'none',
    }), join);
    expect(opened.days).toBe(opened.want);
    expect(opened.rate).toBe('700');
    expect(opened.messHidden, 'the mess switch stayed on screen').toBe(true);

    await win.fill('#f-pro-days', '16');
    const live = await win.evaluate(() => ({
      charge: document.getElementById('f-pcharge').value,
      note: document.getElementById('f-pcharge-note').textContent,
    }));
    expect(live.charge).toBe('11,200');
    expect(live.note).toBe('Prorated: 16 days @ 700/day');
    await win.locator('.ap-wrap').screenshot({ path: path.join(REPO_ROOT, '.shots', 'step9-addpayment-bydays.png') });

    // Whole numbers above zero, or nothing posts.
    await win.fill('#f-pro-rate', '');
    await win.evaluate(() => submitAddPayment());
    expect(await win.evaluate(() => DB.payments.length), 'posted with an empty rate').toBe(0);

    await win.fill('#f-pro-rate', '700');
    await win.fill('#f-ppaid', '5000');
    await win.evaluate(() => submitAddPayment());
    await win.waitForFunction(() => DB.payments.length === 1, null, { timeout: 15000 });

    const saved = await win.evaluate(() => {
      const p = DB.payments[0];
      const charge = DB.studentLedger.filter(e => e.paymentRecordId === p.id && e.type === 'charge').pop();
      return { id: p.id, rent: p.monthlyRent, messIncluded: p.messIncluded, mess: p.messCharge,
               prorate: p.prorate, unpaid: p.unpaid, reason: charge && charge.reason,
               receipt: buildReceiptHTML(p.id) };
    });
    expect(saved.rent).toBe(11200);
    expect(saved.messIncluded).toBe(false);
    expect(saved.mess).toBe(7000);
    expect(saved.prorate).toEqual({ days: 16, rate: 700 });
    expect(saved.unpaid).toBe(6200);
    expect(saved.reason).toMatch(/^Prorated: 16 days @ 700\/day = 11,200 · /);
    expect(saved.receipt).toContain('Prorated (16 days @ 700)');

    // ── A Settings rent change leaves the month alone ─────────────────────
    const afterSettings = await win.evaluate(() => {
      _applyChargesToStudent(DB.students.find(s => s.id === 'stuP'), 12000, 7000, true);
      return DB.payments[0].monthlyRent;
    });
    expect(afterSettings).toBe(11200);

    // ── The month reopens as By days, with its own figures ─────────────────
    await win.evaluate(() => navigate('addpayment'));
    await win.waitForSelector('#f-pro-seg', { state: 'visible', timeout: 15000 });
    await win.evaluate(() => selectStudentForPayment('stuP'));
    const reopened = await win.evaluate(() => ({
      on: document.getElementById('f-pro-on').checked,
      days: document.getElementById('f-pro-days').value,
      rate: document.getElementById('f-pro-rate').value,
    }));
    expect(reopened).toEqual({ on: true, days: '16', rate: '700' });

    // ── Edit Payment: the note, then a changed charge ends it ─────────────
    await win.evaluate(id => { navigate('payments'); showEditPaymentModal(id); }, saved.id);
    await win.waitForSelector('#f-pamt', { state: 'visible', timeout: 15000 });
    const edit = await win.evaluate(() => ({
      rent: document.getElementById('f-pamt').value,
      note: document.getElementById('f-pamt').closest('.field').textContent,
    }));
    expect(edit.rent).toBe('11200');
    expect(edit.note).toContain('Prorated: 16 days @ 700/day');

    await win.fill('#f-pamt', '12000');
    await win.fill('#f-pedit-reason', 'Stayed the whole month after all');
    await win.evaluate(id => submitEditPayment(id), saved.id);
    await win.waitForFunction(() => DB.payments[0].monthlyRent === 12000, null, { timeout: 15000 });
    expect(await win.evaluate(() => DB.payments[0].prorate), 'the prorate note outlived the charge').toBeUndefined();
  } finally {
    await app.close();
  }
});
