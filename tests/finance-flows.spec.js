// ════════════════════════════════════════════════════════════════════════════
// The §14 layer as the warden meets it: reversing a collection at the Payments
// row, and settling a student at the door.
//
// tests/finance.test.js proves the arithmetic in isolation. This proves the
// screens are wired to it — which is the half D-1 was actually about. The read
// side was fixed across 52 call sites while the three "mark paid" WRITE paths
// still read `p.unpaid || 0`, so a legacy debtor could be marked Paid having
// handed over nothing at all.
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
}

test.beforeAll(() => { resetProfile(); });

const RENT = 8000, MESS = 6500, FULL = RENT + MESS;   // 14,500

/* One student, one room, and whatever payment records the test needs. The 42
   demo rooms the app seeds on first boot are cleared: the Payments table would
   otherwise be read against a demo record rather than the fixture.

   THE FIRST-BOOT RACE. On a cold profile that seeding is still in flight when a
   spec logs in, and it saves over anything written underneath it — so the first
   test in the file seeded correctly, was overwritten, and then waited eight
   seconds for a row that no longer existed. Every later test in the file ran
   against an already-seeded profile and passed, which made it look like the
   test rather than the timing. Seed, then wait until the DB agrees. */
async function seed(win, payments) {
  const write = () => win.evaluate(async ([rent, mess, pays]) => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    DB.rooms = [{ id: 'rmV', number: 'V1', floor: 'Ground', typeId: '2s',
                  studentIds: [], amenities: [], notes: '', rent }];
    DB.students = [{ id: 'stu1', name: 'Fixture Student', roomId: 'rmV', rent, mess,
                     messOptIn: true, status: 'Active', joinDate: '2026-01-01',
                     paymentMethod: 'Cash' }];
    DB.payments = JSON.parse(JSON.stringify(pays));
    DB.cancellations = [];
    await saveDB();
  }, [RENT, MESS, payments]);

  await write();
  const holds = () => win.evaluate(n =>
    DB.payments.length === n && DB.students.length === 1 && DB.rooms.length === 1,
    payments.length);
  for (let i = 0; i < 10 && !(await holds()); i++) {
    await win.waitForTimeout(300);
    await write();
  }
  await win.evaluate(n => {
    if (DB.payments.length !== n) throw new Error(
      'fixture did not stick: DB.payments is ' + DB.payments.length + ', expected ' + n);
  }, payments.length);
}

const rec = extra => Object.assign({
  id: 'pay1', studentId: 'stu1', studentName: 'Fixture Student',
  roomId: 'rmV', roomNumber: 'V1', month: '2026-08', date: '2026-08-05',
  amount: 0, monthlyRent: RENT, totalRent: RENT,
  messCharge: MESS, messIncluded: true,
  extraCharges: [], extraTotal: 0, admissionFee: 0,
  concession: 0, discount: 0, method: 'Cash',
  status: 'Pending', paidDate: '', notes: '',
}, extra || {});

// ─────────────────────────────────────────────────────────────────────────────
// Reversing a collection
// ─────────────────────────────────────────────────────────────────────────────
test('a mis-keyed collection can be reversed from the row, and the record says so', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  const pre = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(pre.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  await seed(win, [rec({ amount: FULL, unpaid: 0, overpaid: 0, status: 'Paid',
                         paidDate: '2026-08-05' })]);
  /* Dated into the CURRENT month on purpose. The Payments table's default scope
     is this month plus arrears carried in, and a settled record from an earlier
     month is neither — so a fixed August date put the fixture off screen and
     the wait below timed out looking like a missing button. This is also the
     realistic case: the collection being reversed is the one just taken. */
  await win.evaluate(async () => {
    DB.payments[0].month = thisMonth();
    DB.payments[0].date  = today();
    DB.payments[0].paidDate = today();
    await saveDB();
  });
  await win.evaluate(() => navigate('payments'));
  await win.waitForSelector('.pay-act', { timeout: 8000 });

  // The action is offered because there is something to reverse.
  await win.click('.pay-act.dh-amber');
  await win.waitForSelector('#f-prev-amt', { timeout: 8000 });

  // It opens defaulted to the whole collection, and says what the record holds.
  const opened = await win.evaluate(() => ({
    amount: document.getElementById('f-prev-amt').value,
    max:    document.getElementById('f-prev-amt').max,
    lines:  [...document.querySelectorAll('.pay-rev__line')]
              .map(l => l.innerText.replace(/\s+/g, ' ').trim()),
  }));
  expect(Number(opened.amount)).toBe(FULL);
  expect(Number(opened.max)).toBe(FULL);
  expect(opened.lines.join(' | ')).toMatch(/Collected on this record/i);

  await win.fill('#f-prev-amt', '4500');
  await win.fill('#f-prev-reason', 'Counted twice at the desk');
  await win.evaluate(() => { document.getElementById('f-prev-date').value = '2026-09-02'; });
  await win.click('.modal-footer .btn-danger, .modal .btn-danger');
  await win.waitForTimeout(700);

  const after = await win.evaluate(() => {
    const p = DB.payments[0];
    return {
      amount: p.amount, unpaid: p.unpaid, status: p.status, paidDate: p.paidDate,
      trail: (p.partialPayments || []).map(e => e.amount),
      reversals: (p.reversals || []).map(r => ({ a: r.amount, why: r.reason, on: r.date })),
      logged: (DB.activityLog || []).some(l => /Reversed/i.test(l.action || '')),
      // The reconciliation still balances: events must sum to what is held.
      cash: _cashEvents(p).reduce((s, e) => s + e.amount, 0),
    };
  });

  expect(after.amount).toBe(FULL - 4500);       // 10,000 still collected
  expect(after.unpaid).toBe(4500);              // and 4,500 owed again
  expect(after.status).toBe('Pending');
  expect(after.paidDate).toBe('');
  // The original collection is NOT rewritten — that is the whole difference
  // between a reversal and an edit.
  expect(after.reversals.length).toBe(1);
  expect(after.reversals[0].a).toBe(4500);
  expect(after.reversals[0].why).toBe('Counted twice at the desk');
  expect(after.reversals[0].on).toBe('2026-09-02');
  expect(after.logged, 'a reversal must reach the activity log').toBe(true);
  expect(after.cash, 'cash events must still sum to what the record holds').toBe(after.amount);

  expect(pageErrors).toEqual([]);
  await app.close();
});

test('the reverse action is not offered on a record that collected nothing', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, [rec({ amount: 0, unpaid: FULL })]);
  await win.evaluate(() => navigate('payments'));
  await win.waitForSelector('.pay-act', { timeout: 8000 });

  // A freshly generated month is a table full of these on the 1st; a dead
  // control on every row of it is worse than no control.
  const n = await win.evaluate(() => document.querySelectorAll('.pay-act.dh-amber').length);
  expect(n).toBe(0);

  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// The write-side tail of D-1
// ─────────────────────────────────────────────────────────────────────────────
test('Mark Paid on a legacy record collects what it actually owes, not nothing', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  // A record from before `unpaid` existed: 4,000 collected against a 14,500
  // charge. `Number(p.unpaid) || 0` reads 0 here, so this used to be stamped
  // Paid having taken nothing — the debt was deleted rather than settled.
  const legacy = rec({ amount: 4000 });
  delete legacy.unpaid;
  await seed(win, [legacy]);

  const owed = await win.evaluate(() => calculateOutstanding(DB.payments[0]));
  expect(owed).toBe(FULL - 4000);

  await win.evaluate(async () => { await markPaymentPaid('pay1'); });
  await win.waitForTimeout(600);

  const after = await win.evaluate(() => {
    const p = DB.payments[0];
    return { amount: p.amount, unpaid: p.unpaid, status: p.status,
             trail: (p.partialPayments || []).map(e => e.amount) };
  });
  expect(after.amount).toBe(FULL);              // the balance was really taken
  expect(after.unpaid).toBe(0);
  expect(after.status).toBe('Paid');
  expect(after.trail).toEqual([FULL - 4000]);   // and it is on the trail

  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// Settling at the door
// ─────────────────────────────────────────────────────────────────────────────
test('confirming a cancellation shows what is owed and can settle every month', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, [
    rec({ id: 'p_jul', month: '2026-07', date: '2026-07-05', amount: FULL, unpaid: 0,
          overpaid: 0, status: 'Paid', paidDate: '2026-07-05' }),
    rec({ id: 'p_aug', month: '2026-08', amount: 4000, unpaid: FULL - 4000 }),
    rec({ id: 'p_sep', month: '2026-09', date: '2026-09-01', amount: 0, unpaid: FULL }),
  ]);
  await win.evaluate(async () => {
    DB.students[0].status = 'Cancelling';
    DB.cancellations = [{ id: 'canc_1', seq: 1, studentId: 'stu1',
      studentName: 'Fixture Student', roomId: 'rmV', roomNumber: 'V1',
      roomType: '2-Seater', requestDate: '2026-09-01', vacateDate: '2026-09-30',
      reason: 'Course ended', status: 'Pending', createdAt: '2026-09-01' }];
    await saveDB();
  });

  await win.evaluate(() => navigate('cancellations'));
  await win.waitForTimeout(500);
  await win.evaluate(() => confirmCancellation('canc_1'));
  await win.waitForSelector('.canc-set__net', { timeout: 8000 });

  const shown = await win.evaluate(() => ({
    net:   document.querySelector('.canc-set__net').innerText.replace(/\s+/g, ' ').trim(),
    rows:  [...document.querySelectorAll('.canc-set__row')]
             .map(r => r.innerText.replace(/\s+/g, ' ').trim()),
    hasOpt: !!document.getElementById('canc-set-do'),
  }));
  // July settled, August 10,500, September 14,500 → collect 25,000.
  expect(shown.net).toMatch(/Collect/i);
  expect(shown.net.replace(/,/g, '')).toMatch(/25000/);
  expect(shown.rows.length).toBe(3);
  expect(shown.hasOpt).toBe(true);

  await win.evaluate(() => { document.getElementById('canc-set-date').value = '2026-09-30'; });
  await win.evaluate(() => submitCancellationSettlement('canc_1'));
  await win.waitForTimeout(800);

  const after = await win.evaluate(() => {
    const c = DB.cancellations[0];
    return {
      status: c.status,
      settlement: c.settlement,
      studentStatus: DB.students[0].status,
      // Settled month by month against the records that hold the debt — a lump
      // written anywhere else leaves each month still reading as unpaid.
      owed: DB.payments.map(p => calculateOutstanding(p)),
      paid: DB.payments.map(p => p.amount),
      allSettled: DB.payments.every(p => p.status === 'Paid'),
    };
  });

  expect(after.status).toBe('Confirmed');
  expect(after.studentStatus).toBe('Left');
  expect(after.owed).toEqual([0, 0, 0]);
  expect(after.paid).toEqual([FULL, FULL, FULL]);
  expect(after.allSettled).toBe(true);
  // The position AT DEPARTURE is kept: the records stay editable forever, and
  // this is the only thing that remembers what was owed on the day.
  expect(after.settlement.action).toBe('collect');
  expect(after.settlement.net).toBe(25000);
  expect(after.settlement.settledNow).toBe(25000);
  expect(after.settlement.on).toBe('2026-09-30');

  expect(pageErrors).toEqual([]);
  await app.close();
});

test('a student who overpaid is shown a refund at checkout, and it is recorded as cash out', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, [rec({ id: 'p_aug', month: '2026-08' })]);
  await win.evaluate(async () => {
    // 20,000 handed over against a 14,500 bill — 5,500 credit. Before §14 the
    // excess was swallowed by Math.max(0, …) and owed to nobody.
    applyPayment(DB.payments[0], { amount: 20000, date: '2026-08-05' });
    DB.students[0].status = 'Cancelling';
    DB.cancellations = [{ id: 'canc_2', seq: 1, studentId: 'stu1',
      studentName: 'Fixture Student', roomId: 'rmV', roomNumber: 'V1',
      roomType: '2-Seater', requestDate: '2026-08-20', vacateDate: '2026-08-31',
      reason: 'Left early', status: 'Pending', createdAt: '2026-08-20' }];
    await saveDB();
  });

  expect(await win.evaluate(() => DB.payments[0].overpaid)).toBe(5500);

  await win.evaluate(() => navigate('cancellations'));
  await win.waitForTimeout(500);
  await win.evaluate(() => confirmCancellation('canc_2'));
  await win.waitForSelector('.canc-set__net', { timeout: 8000 });

  const net = await win.evaluate(() =>
    document.querySelector('.canc-set__net').innerText.replace(/\s+/g, ' ').trim());
  expect(net).toMatch(/Refund/i);
  expect(net.replace(/,/g, '')).toMatch(/5500/);

  await win.evaluate(() => { document.getElementById('canc-set-date').value = '2026-08-31'; });
  await win.evaluate(() => submitCancellationSettlement('canc_2'));
  await win.waitForTimeout(800);

  const after = await win.evaluate(() => {
    const p = DB.payments[0];
    return {
      amount: p.amount, overpaid: p.overpaid, unpaid: p.unpaid, status: p.status,
      reversals: (p.reversals || []).map(r => ({ a: r.amount, on: r.date })),
      cash: _cashEvents(p).reduce((s, e) => s + e.amount, 0),
      settlement: DB.cancellations[0].settlement,
    };
  });

  // Handing a credit back is a reversal, not a deletion: the record holds less
  // and the money is dated leaving the drawer on the day it was handed over.
  expect(after.amount).toBe(14500);
  expect(after.overpaid).toBe(0);
  expect(after.unpaid).toBe(0);
  expect(after.status).toBe('Paid');
  expect(after.reversals).toEqual([{ a: 5500, on: '2026-08-31' }]);
  expect(after.cash).toBe(14500);
  expect(after.settlement.action).toBe('refund');
  expect(after.settlement.settledNow).toBe(5500);

  await app.close();
});
