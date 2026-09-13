// ════════════════════════════════════════════════════════════════════════════
// Collected money is not edited, and a warden can still take the rest of a
// month — warden ledger spec, Phase 2.
//
// The owner's risk, in the spec's words: an admin silently inflating or
// deflating a warden's recorded collection. Before this, four screens could
// rewrite a collected figure with nothing left to say it had happened: the
// Edit Payment form (lowering Amount Paid wrote no trace anywhere), the two Add
// Payment merges, and the dashboard month view's click-to-edit amount.
//
// The merges were the worst of it. Their box was the month's RUNNING TOTAL,
// seeded with what had been collected, so a warden typing the 1,000 in their
// hand against 4,000 already taken saved 1,000. The owner's ruling
// (2026-09-14): the box is the cash RECEIVED NOW, added to what the month
// holds, and each receipt is its own ledger entry under the account that took
// it. A correction is a reversal, which states a reason; a bill can still be
// corrected, and is recorded with before, after and why.
//
// Each test uses its own student, because the merge paths find "the pending
// record for this student and month" and would otherwise find another test's.
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

test.describe.configure({ mode: 'serial' });

let app, win;
const pageErrors = [];

test.beforeAll(async () => {
  resetProfile();
  app = await electron.launch(launchOpts());
  win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(String(e)));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);
});

test.afterAll(async () => { if (app) await app.close(); });

const RENT = 8000, MESS = 6500, FULL = RENT + MESS, SOFAR = 4000;

/** One student, one record for this month. `extra` overrides record fields. */
async function seed(id, extra) {
  await win.evaluate(async ([id, rent, mess, full, sofar, extra]) => {
    if (typeof closeModal === 'function') closeModal();
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    if (!DB.rooms.some(r => r.id === 'rm_lock'))
      DB.rooms.push({ id: 'rm_lock', number: 'L1', floor: 'Ground', typeId: '2s',
        studentIds: [], amenities: [], notes: '', rent });
    const sid = 's_' + id;
    DB.students.push({ id: sid, name: 'Lock ' + id, roomId: 'rm_lock', rent, mess,
      messOptIn: true, status: 'Active', joinDate: today(), paymentMethod: 'Cash' });
    DB.payments.push(Object.assign({
      id, studentId: sid, studentName: 'Lock ' + id, roomId: 'rm_lock', roomNumber: 'L1',
      month: thisMonthLabel(), monthlyRent: rent, messCharge: mess, messIncluded: true,
      amount: sofar, unpaid: full - sofar, status: 'Pending', date: today(), method: 'Cash',
      extraCharges: [], extraTotal: 0,
    }, extra || {}));
    await saveDB();
  }, [id, RENT, MESS, FULL, SOFAR, extra || null]);
  return 's_' + id;
}

async function confirmDialog() {
  await win.waitForTimeout(500);
  await win.evaluate(() => {
    const btn = document.getElementById('confirm-ok')
      || [...document.querySelectorAll('#modal-container button')]
           .find(b => /ok|confirm|yes|update/i.test(b.textContent));
    if (btn) btn.click();
  });
  await win.waitForTimeout(1200);
}

async function openPage(sid) {
  await win.evaluate(s => openAddPayment(s), sid);
  await win.waitForSelector('#f-pcharge', { timeout: 8000 });
  await win.waitForFunction(s => document.getElementById('f-pstudent')?.value === s, sid, { timeout: 8000 });
  await win.waitForTimeout(300);
}

const collected = id => win.evaluate(pid => {
  const p = DB.payments.find(x => x.id === pid);
  return {
    amount: p.amount, unpaid: p.unpaid, status: p.status,
    net: ledgerNet(pid),
    payments: ledgerFor({ paymentId: pid }).filter(e => e.type === 'payment')
                .map(e => ({ amount: e.amount, byId: e.byId, source: e.source })),
    reversals: ledgerFor({ paymentId: pid }).filter(e => e.type === 'reversal').length,
    role: CUR_ROLE,
  };
}, id);

test('Edit Payment: a collected amount is read-only, and a changed figure is ignored on save', async () => {
  await seed('p_l1');
  await win.evaluate(() => showEditPaymentModal('p_l1'));
  await win.waitForSelector('#f-pamt', { timeout: 8000 });

  const form = await win.evaluate(() => {
    const paid = document.getElementById('f-ppaid');
    const buttons = [...document.querySelectorAll('#modal-container button')].map(b => b.textContent);
    return { readOnly: paid.readOnly, locked: paid.dataset.locked,
             reason: !!document.getElementById('f-padjreason'),
             reverse: buttons.some(t => /Reverse a collection/.test(t)),
             receive: buttons.some(t => /Receive payment/.test(t)) };
  });
  expect(form.readOnly, 'Amount paid is still editable on a record that took money').toBe(true);
  expect(form.locked).toBe('1');
  expect(form.reason, 'no place to give a reason for a bill change').toBe(true);
  expect(form.reverse, 'the form does not point at Reverse').toBe(true);
  expect(form.receive, 'the form offers no way to take the rest of the month').toBe(true);

  // Around the read-only attribute, straight at the field, then save.
  await win.evaluate(async () => {
    document.getElementById('f-ppaid').value = '1000';
    await submitEditPayment('p_l1');
  });
  await win.waitForTimeout(500);
  const r = await collected('p_l1');
  expect(r.amount, 'the save handler accepted a different collected amount').toBe(SOFAR);
  expect(r.reversals, 'a lowered figure reached the ledger').toBe(0);
});

test('Edit Payment: Receive payment opens Add Payment on that student and month', async () => {
  const sid = await seed('p_l1b');
  await win.evaluate(() => showEditPaymentModal('p_l1b'));
  await win.waitForSelector('#f-pamt', { timeout: 8000 });
  await win.evaluate(() => {
    [...document.querySelectorAll('#modal-container button')]
      .find(b => /Receive payment/.test(b.textContent)).click();
  });
  await win.waitForSelector('#f-pcharge', { timeout: 8000 });
  await win.waitForFunction(s => document.getElementById('f-pstudent')?.value === s, sid, { timeout: 8000 });
  await win.waitForTimeout(400);
  const page = await win.evaluate(() => ({
    month: document.getElementById('f-pmonth').value,
    banner: (document.getElementById('pf-month-state') || {}).innerText || '',
    box: document.getElementById('f-ppaid').value,
    wanted: thisMonthLabel(),
  }));
  expect(page.month).toBe(page.wanted);
  expect(page.banner).toContain('part paid');
  expect(page.box, 'the box should wait for today\'s cash').toBe('');
});

test('Edit Payment: a record that has collected nothing keeps an editable amount and asks no reason', async () => {
  await seed('p_l2', { amount: 0, unpaid: FULL });
  await win.evaluate(() => showEditPaymentModal('p_l2'));
  await win.waitForSelector('#f-pamt', { timeout: 8000 });
  const form = await win.evaluate(() => ({
    readOnly: document.getElementById('f-ppaid').readOnly,
    reason: !!document.getElementById('f-padjreason'),
  }));
  expect(form.readOnly).toBe(false);
  expect(form.reason).toBe(false);
  await win.evaluate(() => closeModal());
});

test('Edit Payment: changing the bill on a collected record needs a reason, and is recorded', async () => {
  await seed('p_l3');
  await win.evaluate(() => showEditPaymentModal('p_l3'));
  await win.waitForSelector('#f-pamt', { timeout: 8000 });

  await win.evaluate(async () => {
    document.getElementById('f-pamt').value = '9000';
    recalcUnpaid();
    await submitEditPayment('p_l3');
  });
  await win.waitForTimeout(400);
  const refused = await win.evaluate(() => ({
    rent: DB.payments.find(p => p.id === 'p_l3').monthlyRent,
    adjustments: ledgerFor({ paymentId: 'p_l3' }).filter(e => e.type === 'adjustment').length,
    stillOpen: !!document.getElementById('f-padjreason'),
  }));
  expect(refused.rent, 'the bill changed with no reason given').toBe(RENT);
  expect(refused.adjustments).toBe(0);
  expect(refused.stillOpen, 'the form closed instead of asking for the reason').toBe(true);

  await win.evaluate(async () => {
    document.getElementById('f-padjreason').value = 'Rent corrected to the room rate';
    await submitEditPayment('p_l3');
  });
  await win.waitForTimeout(500);
  const saved = await win.evaluate(() => ({
    rent: DB.payments.find(p => p.id === 'p_l3').monthlyRent,
    amount: DB.payments.find(p => p.id === 'p_l3').amount,
    adj: ledgerFor({ paymentId: 'p_l3' }).filter(e => e.type === 'adjustment'),
    role: CUR_ROLE,
  }));
  expect(saved.rent).toBe(9000);
  expect(saved.amount, 'correcting the bill moved the collected amount').toBe(SOFAR);
  expect(saved.adj.length, 'the bill change is not in the ledger').toBe(1);
  expect(saved.adj[0].reason).toBe('Rent corrected to the room rate');
  expect(saved.adj[0].before.rent).toBe(RENT);
  expect(saved.adj[0].after.rent).toBe(9000);
  expect(saved.adj[0].amount).toBe(1000);
  expect(saved.adj[0].byId).toBe(saved.role);
});

test('Add Payment page: the box is the cash received now, and it is ADDED to what was collected', async () => {
  const sid = await seed('p_l4');
  await openPage(sid);

  const opened = await win.evaluate(() => ({
    box: document.getElementById('f-ppaid').value,
    unpaid: Number(document.getElementById('f-punpaid').value),
    banner: (document.getElementById('pf-month-state') || {}).innerText || '',
  }));
  expect(opened.box, 'the box is seeded with the running total again').toBe('');
  expect(opened.unpaid, 'the balance ignores what was already collected').toBe(FULL - SOFAR);
  expect(opened.banner).toContain('part paid');

  // The warden types the 1,000 in their hand — not 5,000.
  await win.fill('#f-ppaid', '1000');
  await win.evaluate(() => recalcUnpaid());
  const live = await win.evaluate(() => Number(document.getElementById('f-punpaid').value));
  expect(live, 'the live balance does not count the 4,000 already in').toBe(FULL - SOFAR - 1000);

  await win.evaluate(() => submitAddPayment());
  await confirmDialog();

  const r = await collected('p_l4');
  expect(r.amount, '1,000 received against 4,000 collected must leave 5,000').toBe(SOFAR + 1000);
  expect(r.unpaid).toBe(FULL - SOFAR - 1000);
  expect(r.status).toBe('Pending');
  expect(r.net, 'the ledger does not add up to the record').toBe(SOFAR + 1000);
  expect(r.reversals, 'receiving money wrote a reversal').toBe(0);
  const today1000 = r.payments.filter(e => e.amount === 1000);
  expect(today1000.length, 'today\'s 1,000 is not its own ledger entry').toBe(1);
  expect(today1000[0].byId, 'today\'s 1,000 is not attributed to the warden who took it').toBe(r.role);
  expect(today1000[0].source).toBe('collect');
});

test('Add Payment page: receiving the rest settles the month', async () => {
  const sid = await seed('p_l5');
  await openPage(sid);
  await win.fill('#f-ppaid', String(FULL - SOFAR));
  await win.evaluate(() => { recalcUnpaid(); submitAddPayment(); });
  await confirmDialog();

  const r = await collected('p_l5');
  expect(r.amount).toBe(FULL);
  expect(r.unpaid).toBe(0);
  expect(r.status).toBe('Paid');
  expect(r.net).toBe(FULL);
});

test('Add Payment page: the Full chip offers what is still owed, not the whole bill again', async () => {
  const sid = await seed('p_l5b');
  await openPage(sid);
  const full = await win.evaluate(() => { pfPayQuick('full'); return Number(document.getElementById('f-ppaid').value); });
  expect(full, 'Full would charge the 4,000 already collected a second time').toBe(FULL - SOFAR);
});

test('the per-student Add Payment modal takes the cash received now the same way', async () => {
  const sid = await seed('p_l6');
  await win.evaluate(s => showAddPaymentForStudent(s), sid);
  await win.waitForSelector('#f-ps-paid', { timeout: 8000 });
  const opened = await win.evaluate(() => ({
    box: document.getElementById('f-ps-paid').value,
    unpaid: Number(document.getElementById('f-ps-unpaid').value),
  }));
  expect(opened.box, 'the modal seeds the running total again').toBe('');
  expect(opened.unpaid).toBe(FULL - SOFAR);

  await win.evaluate(() => {
    document.getElementById('f-ps-paid').value = '1000';
    recalcUnpaidPS();
    submitPaymentForStudent();
  });
  await confirmDialog();

  const r = await collected('p_l6');
  expect(r.amount, 'the modal merge did not add to what was collected').toBe(SOFAR + 1000);
  expect(r.net).toBe(SOFAR + 1000);
  expect(r.reversals).toBe(0);
  await win.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
});

test('the dashboard month view no longer edits a collected amount in place', async () => {
  await seed('p_l7');
  const r = await win.evaluate(async () => {
    const cell = document.createElement('span');
    document.body.appendChild(cell);
    await editMonthFeeField('p_l7', 'amount', cell);
    const stillThere = cell.isConnected;
    cell.remove();
    return { amount: DB.payments.find(p => p.id === 'p_l7').amount, stillThere };
  });
  expect(r.stillThere, 'the cell was swapped for an input').toBe(true);
  expect(r.amount).toBe(SOFAR);
});

test('a reversal cannot be recorded without a reason', async () => {
  await seed('p_l8');
  await win.evaluate(() => showReversePaymentModal('p_l8'));
  await win.waitForSelector('#f-prev-amt', { timeout: 8000 });

  await win.evaluate(async () => {
    document.getElementById('f-prev-amt').value = '1000';
    document.getElementById('f-prev-reason').value = '';
    await submitReversePayment('p_l8');
  });
  await win.waitForTimeout(400);
  const blank = await win.evaluate(() => ({
    amount: DB.payments.find(p => p.id === 'p_l8').amount,
    revs: ledgerFor({ paymentId: 'p_l8' }).filter(e => e.type === 'reversal').length,
    stillOpen: !!document.getElementById('f-prev-reason'),
  }));
  expect(blank.amount, 'a reversal with no reason was applied').toBe(SOFAR);
  expect(blank.revs).toBe(0);
  expect(blank.stillOpen, 'the modal closed instead of asking for the reason').toBe(true);

  await win.evaluate(async () => {
    document.getElementById('f-prev-reason').value = 'Counted twice at the desk';
    await submitReversePayment('p_l8');
  });
  await win.waitForTimeout(500);
  const done = await win.evaluate(() => ({
    amount: DB.payments.find(p => p.id === 'p_l8').amount,
    revs: ledgerFor({ paymentId: 'p_l8' }).filter(e => e.type === 'reversal'),
    net: ledgerNet('p_l8'),
  }));
  expect(done.amount).toBe(SOFAR - 1000);
  expect(done.revs.length).toBe(1);
  expect(done.revs[0].reason).toBe('Counted twice at the desk');
  expect(done.net, 'the ledger does not add up to the record after a reversal').toBe(SOFAR - 1000);
});

test('no uncaught errors on any of these paths', async () => {
  expect(pageErrors).toEqual([]);
});
