// ════════════════════════════════════════════════════════════════════════════
// Regression cover for the four data-consistency fixes:
//
//   1. Month authority   — a payment belongs to exactly ONE month (p.month),
//                          not to every month any of its date fields touch.
//   2. Snapshot sync     — renaming a student rewrites the name frozen into
//                          their payment records, so the dashboard and the
//                          reports/PDFs can no longer disagree.
//   3. Arrears           — an unpaid record from an earlier month is visible
//                          (and collectable) while the current month is shown.
//   4. Rent + mess       — the two charges are stored and billed separately,
//                          and a student off the mess is billed rent only.
//
// Runs against the ISOLATED throwaway profile (HOSTIX_TEST_PROFILE), same as
// smoke.spec.js. Data is built in memory and saved through the app's own
// saveDB(), then cleaned up at the end of the test.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');
const { resetProfile } = require('./_profile');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  };
}

async function loginAndReady(win) {
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
  await win.waitForFunction(() => typeof DB !== 'undefined' && Array.isArray(DB.payments),
    null, { timeout: 30000 });
}

test.beforeAll(() => {
  resetProfile();   // suite-order independence — see _profile.js
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
});

test('months do not mix, names stay in sync, arrears carry forward, mess bills separately', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1440, height: 900 });
  await loginAndReady(win);

  // ── Seed: one student, a July bill paid in August, and an unpaid June bill ──
  const seeded = await win.evaluate(async () => {
    const room = DB.rooms[0];
    const t = {
      id: 'ZZTEST1', name: 'Test Student One', fatherName: 'Test Father',
      roomId: room.id, rent: 10000, mess: 7000, messOptIn: true,
      status: 'Active', joinDate: '2026-06-01', paymentMethod: 'Cash',
    };
    DB.students.push(t);

    // July's rent, handed over on 3 August. It is JULY money.
    DB.payments.push({
      id: 'ZZPAY_JUL', studentId: t.id, studentName: t.name,
      roomId: room.id, roomNumber: room.number,
      month: 'July 2026', monthlyRent: 10000, totalRent: 10000,
      messCharge: 7000, messIncluded: true,
      amount: 17000, unpaid: 0, status: 'Paid',
      date: '2026-08-03', paidDate: '2026-08-03', dueDate: '',
      method: 'Cash', notes: 'seeded',
    });
    // June's rent, never settled — this is the arrear.
    DB.payments.push({
      id: 'ZZPAY_JUN', studentId: t.id, studentName: t.name,
      roomId: room.id, roomNumber: room.number,
      month: 'June 2026', monthlyRent: 10000, totalRent: 10000,
      messCharge: 7000, messIncluded: true,
      amount: 0, unpaid: 17000, status: 'Pending',
      date: '2026-06-05', paidDate: '', dueDate: '',
      method: 'Cash', notes: 'seeded',
    });
    await saveDB();
    return { roomNumber: room.number };
  });
  expect(seeded.roomNumber).toBeTruthy();

  // ── 1. MONTH AUTHORITY ────────────────────────────────────────────────────
  const months = await win.evaluate(() => {
    const jul = DB.payments.find(p => p.id === 'ZZPAY_JUL');
    return {
      key: _payMonthKey(jul),
      inJuly:   _payMatchesMonth(jul, '2026-07'),
      inAugust: _payMatchesMonth(jul, '2026-08'),   // paidDate month — must NOT match
      inYear:   _payMatchesMonth(jul, '2026'),      // year prefix still works
      julyRevenue:   calcRevenue('2026-07'),
      augustRevenue: calcRevenue('2026-08'),
    };
  });
  expect(months.key, 'p.month is authoritative').toBe('2026-07');
  expect(months.inJuly).toBe(true);
  expect(months.inAugust, 'July rent collected in August must not also count as August')
    .toBe(false);
  expect(months.inYear, 'a year prefix must still match').toBe(true);
  expect(months.julyRevenue).toBe(17000);
  expect(months.augustRevenue, 'revenue must not be double-counted across months').toBe(0);

  // ── 2. SNAPSHOT SYNC ──────────────────────────────────────────────────────
  const renamed = await win.evaluate(async () => {
    const t = DB.students.find(s => s.id === 'ZZTEST1');
    t.name = 'Renamed Student One';
    const touched = syncStudentSnapshots(t);
    await saveDB();
    return {
      touched,
      names: DB.payments.filter(p => p.studentId === 'ZZTEST1').map(p => p.studentName),
    };
  });
  expect(renamed.touched).toBeGreaterThan(0);
  expect(renamed.names, 'every payment must carry the corrected name')
    .toEqual(['Renamed Student One', 'Renamed Student One']);

  // The boot-time repair must be idempotent — a second pass finds nothing.
  const repairAgain = await win.evaluate(() => repairStudentSnapshots());
  expect(repairAgain, 'repair must be a no-op once data is already in sync').toBe(0);

  // ── 3. ARREARS ────────────────────────────────────────────────────────────
  const arrears = await win.evaluate(() => {
    // Pretend "now" is August 2026 via the dashboard month selector, which is
    // what thisMonth() reads.
    _dashboardMonth = '2026-08';
    payFilter.month = 'All'; payFilter.showAll = false; payFilter.search = '';
    payFilter.room = 'All'; payFilter.method = 'All'; payFilter.status = 'All';
    payFilter.unpaidOnly = false; payFilter.page = 1;

    payFilter.arrears = true;
    const withArrears = payFiltered().map(p => p.id);
    payFilter.arrears = false;
    const withoutArrears = payFiltered().map(p => p.id);

    payFilter.arrears = true;
    return {
      withArrears, withoutArrears,
      isArrear: payIsArrear(DB.payments.find(p => p.id === 'ZZPAY_JUN'), '2026-08'),
      paidIsNotArrear: payIsArrear(DB.payments.find(p => p.id === 'ZZPAY_JUL'), '2026-08'),
    };
  });
  expect(arrears.isArrear, "June's unpaid balance is an arrear in August").toBe(true);
  expect(arrears.paidIsNotArrear, 'a settled record is never an arrear').toBe(false);
  expect(arrears.withArrears, 'the unpaid June record must be collectable from August')
    .toContain('ZZPAY_JUN');
  expect(arrears.withoutArrears, 'and must disappear when the toggle is off')
    .not.toContain('ZZPAY_JUN');

  // ── 4. RENT + MESS ────────────────────────────────────────────────────────
  const mess = await win.evaluate(async () => {
    const t = DB.students.find(s => s.id === 'ZZTEST1');
    // On the mess: 10,000 room + 7,000 food.
    _applyChargesToStudent(t, 10000, 7000, true);
    const jun = DB.payments.find(p => p.id === 'ZZPAY_JUN');
    const onMess = { rent: t.rent, mess: t.mess, unpaid: jun.unpaid, charge: jun.messCharge };

    // Off the mess: the same room, food not billed.
    _applyChargesToStudent(t, 10000, 7000, false);
    const offMess = { unpaid: jun.unpaid, charge: jun.messCharge, included: jun.messIncluded };

    // A settled record is a receipt and must never be rewritten.
    const jul = DB.payments.find(p => p.id === 'ZZPAY_JUL');
    const paidUntouched = { amount: jul.amount, unpaid: jul.unpaid, charge: jul.messCharge };

    await saveDB();
    return { onMess, offMess, paidUntouched };
  });
  expect(mess.onMess).toEqual({ rent: 10000, mess: 7000, unpaid: 17000, charge: 7000 });
  expect(mess.offMess, 'a rent-only student is billed the room alone')
    .toEqual({ unpaid: 10000, charge: 0, included: false });
  expect(mess.paidUntouched, 'a paid record must not be restated')
    .toEqual({ amount: 17000, unpaid: 0, charge: 7000 });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await win.evaluate(async () => {
    _dashboardMonth = null;
    DB.students = DB.students.filter(s => s.id !== 'ZZTEST1');
    DB.payments = DB.payments.filter(p => !String(p.id).startsWith('ZZPAY_'));
    await saveDB();
  });

  await app.close();
});
