// ════════════════════════════════════════════════════════════════════════════
// Add Payment — the two things a warden does at the counter that the form used
// to get wrong.
//
//  1. A month that is already settled must not block collecting an EARLIER one.
//     The duplicate guard returned before the arrears were posted, so once
//     August was paid, July's balance could not be taken until September.
//  2. A part paid month must arrive on the form as a part paid month: what has
//     already been collected shown, the box seeded with it, and saving ADDING
//     to that figure rather than replacing it. It used to open blank, charge
//     the whole month again, and overwrite the earlier collection on save.
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

const RENT = 8000, MESS = 6500, FULL = RENT + MESS;   // 14,500

/* A SETTLED payment dated outside the retention window deletes itself.

   enforceDataRetention() runs at the top of every saveDB(), and archives any
   payment whose status is not Pending and whose paidDate/date falls before the
   first of the month six months back (settings.js). So a fixture that hardcodes
   a paid date does not merely go stale — it is silently carried out of
   DB.payments by the very saveDB() that seeds it, and the test then measures a
   month with no record in it.

   That is exactly what happened here: 'paidDate: 2026-02-02' fell outside the
   window once the calendar reached September 2026, the settled September record
   vanished during seeding, and the banner assertion failed as though the banner
   were broken. The month LABELS below were already derived from now for this
   very reason (see months()); the dates were not. Anything that has to stay in
   the live table is dated today. */
const _now = new Date();
const TODAY = _now.getFullYear() + '-'
  + String(_now.getMonth() + 1).padStart(2, '0') + '-'
  + String(_now.getDate()).padStart(2, '0');

// The month the app itself considers "now" — the fixtures are built around it
// so the test does not go stale the moment the calendar turns over.
async function months(win) {
  return await win.evaluate(() => {
    const lbl = d => d.toLocaleString('default', { month: 'long', year: 'numeric' });
    const n = new Date();
    return { cur: lbl(n), prev: lbl(new Date(n.getFullYear(), n.getMonth() - 1, 1)) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
test('a settled month does not block collecting the previous month', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  const M = await months(win);

  // Fixture: this month PAID in full, last month still owing the lot.
  await win.evaluate(async ([rent, mess, full, cur, prev, today]) => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    DB.rooms.push({ id: 'rm1', number: 'A1', floor: 'Ground', typeId: '2s',
      studentIds: [], amenities: [], notes: '', rent });
    DB.students.push({ id: '600', name: 'Settled Student', roomId: 'rm1',
      rent, mess, messOptIn: true, status: 'Active', joinDate: '2026-01-01',
      paymentMethod: 'Cash' });
    DB.payments.push({ id: 'p_prev', studentId: '600', studentName: 'Settled Student',
      roomId: 'rm1', roomNumber: 'A1', month: prev, monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: 0, unpaid: full,
      status: 'Pending', date: '2026-01-05', extraCharges: [], extraTotal: 0 });
    DB.payments.push({ id: 'p_cur', studentId: '600', studentName: 'Settled Student',
      roomId: 'rm1', roomNumber: 'A1', month: cur, monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: full, unpaid: 0,
      status: 'Paid', paidDate: today, date: today,
      extraCharges: [], extraTotal: 0 });
    await saveDB();
  }, [RENT, MESS, FULL, M.cur, M.prev, TODAY]);

  await win.evaluate(() => openAddPayment('600'));
  await win.waitForSelector('#f-pcharge', { timeout: 8000 });
  await win.waitForFunction(
    () => document.getElementById('f-pstudent')?.value === '600', null, { timeout: 8000 });
  await win.waitForTimeout(300);

  // The form says so before the warden types anything.
  const banner = await win.evaluate(() => {
    const b = document.getElementById('pf-month-state');
    return { shown: b && b.style.display !== 'none', cls: b && b.className, text: b && b.innerText };
  });
  console.log('\n[settled banner] ' + JSON.stringify(banner));
  expect(banner.shown, 'the settled month must announce itself').toBe(true);
  expect(banner.cls).toContain('is-paid');
  expect(banner.text).toContain('already settled');

  // The previous month is offered for collection.
  await win.waitForSelector('#pf-out .pf-out__in', { timeout: 8000 });
  await win.evaluate(() => pfFillAllOutstandings());
  const staged = await win.evaluate(() =>
    [...document.querySelectorAll('.pf-out__in')].map(el => Number(el.value)));
  expect(staged, 'the whole previous-month balance is staged').toEqual([FULL]);

  // Save. The old build stopped dead here with "No duplicate allowed".
  await win.evaluate(() => submitAddPayment());
  await win.waitForTimeout(1500);

  const after = await win.evaluate(() => ({
    prev: DB.payments.find(p => p.id === 'p_prev'),
    total: DB.payments.filter(p => p.studentId === '600').length,
  }));
  console.log('[after arrears] ' + JSON.stringify(after));

  expect(after.prev.amount, 'the previous month was collected in full').toBe(FULL);
  expect(after.prev.unpaid, 'nothing left owing on it').toBe(0);
  expect(after.prev.status).toBe('Paid');
  expect(after.prev.partialPayments && after.prev.partialPayments.length,
    'the collection left a trail').toBe(1);
  expect(after.total, 'no duplicate record was created for the settled month').toBe(2);

  expect(pageErrors, 'no uncaught errors').toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('a part paid month arrives part paid, and the balance adds to it', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const M = await months(win);
  const PAID_SO_FAR = 4000;

  // Fixture: this month part paid — 4,000 of 14,500 collected, 10,500 owing.
  await win.evaluate(async ([rent, mess, full, cur, sofar]) => {
    /* SEED THE PRICE, DO NOT INHERIT IT. This student's charge is resolved from
       the room type, not from the fields on the student record — resolveCharges()
       only reads s.rent when _rentManuallySet pins it, while s.mess does fall
       through. So a student in a room this DB has never heard of resolves to
       rent 0 + mess 6,500, and the form quotes 6,500 against a banner reading
       10,500 still owing: one screen, two balances.

       That is what this test measured for a while. It was reading the room and
       the room-type defaults left behind by the test above, so the moment that
       test failed first, this one failed too — pointing at the payment form
       rather than at its own missing fixture. Idempotent because the DB is reset
       per file, not per test. */
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    if (!DB.rooms.some(r => r.id === 'rm1'))
      DB.rooms.push({ id: 'rm1', number: 'A1', floor: 'Ground', typeId: '2s',
        studentIds: [], amenities: [], notes: '', rent });
    DB.students.push({ id: '700', name: 'Partial Student', roomId: 'rm1',
      rent, mess, messOptIn: true, status: 'Active', joinDate: '2026-01-01',
      paymentMethod: 'Cash' });
    DB.payments.push({ id: 'p_part', studentId: '700', studentName: 'Partial Student',
      roomId: 'rm1', roomNumber: 'A1', month: cur, monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: sofar, unpaid: full - sofar,
      status: 'Pending', date: '2026-02-03', method: 'Cash',
      extraCharges: [], extraTotal: 0 });
    await saveDB();
  }, [RENT, MESS, FULL, M.cur, PAID_SO_FAR]);

  await win.evaluate(() => openAddPayment('700'));
  await win.waitForSelector('#f-pcharge', { timeout: 8000 });
  await win.waitForFunction(
    () => document.getElementById('f-pstudent')?.value === '700', null, { timeout: 8000 });
  await win.waitForTimeout(300);

  const shown = await win.evaluate(() => ({
    banner:  document.getElementById('pf-month-state') ? document.getElementById('pf-month-state').innerText : '',
    cls:     document.getElementById('pf-month-state') ? document.getElementById('pf-month-state').className : '',
    paidBox: document.getElementById('f-ppaid').value,
    unpaid:  document.getElementById('f-punpaid').value,
    summary: document.getElementById('ap-summary').innerText.replace(/\n+/g, ' | '),
  }));
  console.log('\n[partial form] ' + JSON.stringify(shown));

  expect(shown.cls, 'part paid, not settled').toContain('is-partial');
  expect(shown.banner).toContain('part paid');
  expect(Number(shown.paidBox), 'the box is seeded with what was already taken').toBe(PAID_SO_FAR);
  expect(Number(shown.unpaid), 'and the remaining balance is the real one').toBe(FULL - PAID_SO_FAR);
  expect(shown.summary, 'the summary agrees with the record').toContain('10,500');

  // The student hands over the remaining 10,500 → running total 14,500.
  await win.fill('#f-ppaid', String(FULL));
  await win.evaluate(() => recalcUnpaid());
  await win.evaluate(() => submitAddPayment());
  // The merge is behind a confirm; take it.
  await win.waitForTimeout(600);
  await win.evaluate(() => {
    const btn = document.getElementById('confirm-ok')
      || [...document.querySelectorAll('#modal-container button')]
           .find(b => /ok|confirm|yes|update/i.test(b.textContent));
    if (btn) btn.click();
  });
  await win.waitForTimeout(1500);

  const rec = await win.evaluate(() => ({
    rows: DB.payments.filter(p => p.studentId === '700').length,
    p: DB.payments.find(p => p.id === 'p_part'),
  }));
  console.log('[after merge] ' + JSON.stringify(rec));

  expect(rec.rows, 'no duplicate row for the same month').toBe(1);
  expect(rec.p.amount, 'the earlier 4,000 was kept and added to').toBe(FULL);
  expect(rec.p.unpaid, 'the month is clear').toBe(0);
  expect(rec.p.status).toBe('Paid');
  expect(rec.p.partialPayments && rec.p.partialPayments.length,
    'todays instalment is on the record').toBe(1);
  expect(rec.p.partialPayments[0].amount, 'and it is the difference, not the total')
    .toBe(FULL - PAID_SO_FAR);

  expect(pageErrors, 'no uncaught errors').toEqual([]);
  await app.close();
});
