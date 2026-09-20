// ════════════════════════════════════════════════════════════════════════════
// Edit Payment: receive the pending amount (owner reference
// `edit pay model.png`, 2026-09-15).
//
// A month paid in full gets a cooler charge added afterwards. The Edit form
// shows the new pending amount, the receive box starts empty, more than is
// pending is refused, Full pending fills the balance, and Save records it as a
// new collection — with its own method and Reference No. — without touching
// what was collected before. The reference reaches the ledger, the receipt and
// the payments export.
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

const txt = (win, id) => win.evaluate(i => (document.getElementById(i) || {}).textContent || '', id);

test.beforeAll(() => { resetProfile(); });

test('edit payment: an extra added after full payment is received here, with its reference', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    const pid = await win.evaluate(async () => {
      DB.settings.hostelName = 'Test Hostel';
      DB.settings.serviceModel = 'rent_mess_optional';
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 10000; rt.defaultMess = 7000;
      DB.rooms = [{ id: 'rmE', number: 'E5', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuE', name: 'Edit Student', fatherName: 'Guardian E', phone: '0300-1112223',
                       roomId: 'rmE', status: 'Active', messOptIn: true, joinDate: '2026-01-01', paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = []; DB.concessions = [];
      await saveDB();
      await generateMonthlyRents();
      const p = DB.payments.find(x => x.studentId === 'stuE');
      applyPayment(p, { amount: 17000, method: 'Cash' });
      await saveDB();
      return p.id;
    });

    // ── Opens settled: nothing pending, the receive box empty ──────────────
    await win.evaluate(id => { navigate('payments'); showEditPaymentModal(id); }, pid);
    await win.waitForSelector('#f-precv', { timeout: 15000 });
    await win.waitForFunction(() => document.getElementById('pef-pend').textContent !== '-', null, { timeout: 5000 });
    const opened = await win.evaluate(() => ({
      receive: document.getElementById('f-precv').value,
      type: document.getElementById('f-ptype').value,
      combo: document.getElementById('f-pcombo').value,
      month: document.getElementById('f-pmonth').disabled,
      full: document.getElementById('pef-full').disabled,
    }));
    expect(opened).toEqual({ receive: '', type: 'both', combo: '17000', month: true, full: true });
    expect(await txt(win, 'pef-pend')).toBe('Rs. 0');
    expect(await txt(win, 'pef-mstat')).toBe('Fully paid');

    // ── A cooler charge added: 500 is now pending ──────────────────────────
    await win.evaluate(() => addExtraChargeRow('Cooler', 500));
    expect(await txt(win, 'pef-exp')).toBe('Rs. 17,500');
    expect(await txt(win, 'pef-pend')).toBe('Rs. 500');
    expect(await txt(win, 'pef-mstat')).toBe('Part paid');
    await win.fill('#f-pedit-reason', 'Cooler charge added');

    // More than is pending is refused, and nothing is written.
    await win.fill('#f-precv', '600');
    expect(await txt(win, 'pef-newbal-s')).toContain('More than is pending');
    await win.evaluate(id => submitEditPayment(id), pid);
    const refused = await win.evaluate(id => { const p = DB.payments.find(x => x.id === id); return { amount: p.amount, extra: p.extraTotal || 0 }; }, pid);
    expect(refused, 'saved while receiving more than is pending').toEqual({ amount: 17000, extra: 0 });

    // Full pending fills the balance; method and reference for this money.
    await win.click('#pef-full');
    expect(await win.evaluate(() => document.getElementById('f-precv').value)).toBe('500');
    expect(await txt(win, 'pef-newbal-v')).toBe('Rs. 0');
    await win.evaluate(() => {
      const sel = document.getElementById('f-pmethod');
      if (![...sel.options].some(o => o.value === 'JazzCash')) sel.add(new Option('JazzCash', 'JazzCash'));
      sel.value = 'JazzCash';
    });
    await win.fill('#f-pref', 'TX-123');
    await win.locator('.pef-modal').screenshot({ path: path.join(REPO_ROOT, '.shots', 'edit-payment-receive.png') });

    await win.evaluate(id => submitEditPayment(id), pid);
    await win.waitForFunction(id => DB.payments.find(x => x.id === id).amount === 17500, pid, { timeout: 15000 });
    const saved = await win.evaluate(id => {
      const p = DB.payments.find(x => x.id === id);
      const last = p.partialPayments[p.partialPayments.length - 1];
      const pay = DB.studentLedger.filter(e => e.paymentRecordId === id && e.type === 'payment').pop();
      return { status: p.status, unpaid: p.unpaid, extra: p.extraTotal,
               last: { amount: last.amount, method: last.method, reference: last.reference, note: last.note },
               ledger: { amount: pay.amount, reference: pay.reference, method: pay.method },
               first: p.partialPayments[0].method,
               remarks: _payRemarkLines(p), receipt: buildReceiptHTML(id) };
    }, pid);
    expect(saved.status).toBe('Paid');
    expect(saved.unpaid).toBe(0);
    expect(saved.extra).toBe(500);
    expect(saved.last).toEqual({ amount: 500, method: 'JazzCash', reference: 'TX-123', note: 'Pending received' });
    expect(saved.ledger).toEqual({ amount: 500, reference: 'TX-123', method: 'JazzCash' });
    expect(saved.first, 'the first collection lost its own method').toBe('Cash');
    expect(saved.remarks).toContain('Ref: TX-123');
    expect(saved.receipt).toContain('Ref TX-123');

    // ── Reopened and saved without receiving: no money moves ───────────────
    await win.evaluate(id => { closeModal(); showEditPaymentModal(id); }, pid);
    await win.waitForSelector('#f-precv', { timeout: 15000 });
    await win.waitForTimeout(200);
    const before = await win.evaluate(id => DB.payments.find(x => x.id === id).partialPayments.length, pid);
    await win.evaluate(id => submitEditPayment(id), pid);
    await win.waitForTimeout(400);
    const after = await win.evaluate(id => { const p = DB.payments.find(x => x.id === id); return { n: p.partialPayments.length, amount: p.amount }; }, pid);
    expect(after).toEqual({ n: before, amount: 17500 });
  } finally {
    await app.close();
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   THE PENDING AMOUNT IS THIS RECORD'S, NOT THE LAST FORM'S (owner, 2026-09-19:
   "no pending amount is showing as the student has paid 4000").

   `_pfAlready` is module state holding what the selected month has already
   collected. The ADD form writes it; the EDIT form never did, and carries its
   own copy of that figure in the hidden `f-ppaid` — so after any Add Payment
   form had run, recalcUnpaid() subtracted a collection twice, once from each.
   A part-paid month then showed Pending Rs. 0 with "Full pending" disabled and
   a nonsense "over what is outstanding" note under the amount.

   The journey matters: the Add form has to be visited FIRST and left, exactly
   as a warden takes a payment and then goes to the register to fix another.
   ════════════════════════════════════════════════════════════════════════════ */
test('edit payment: a part-paid month shows ITS pending, after an Add Payment form has run', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    await win.evaluate(async () => {
      window.toast = () => {};
      DB.settings.serviceModel = 'rent_mess_optional';
      const M = thisMonth(), L = monthLabel(M);
      DB.rooms = [{ id: 'rmP', number: 'P1', floor: 'Ground', typeId: '2s' }];
      const stu = (id, name) => ({ id, name, fatherName: 'F', phone: '0300', status: 'Active',
        roomId: 'rmP', joinDate: M + '-01', monthlyRent: 6000, mess: 2000, messOptIn: true,
        createdAt: M + '-01' });
      DB.students = [stu('PS1', 'Part Paid'), stu('PS2', 'Other Payer')];
      const rec = (id, sid, name, taken, owed, day) => ({ id, studentId: sid, studentName: name,
        month: L, monthlyRent: 6000, messCharge: 2000, messIncluded: true, admissionFee: 0,
        concession: 0, extraCharges: [], extraTotal: 0, amount: taken, unpaid: owed,
        status: 'Pending', method: 'Cash', date: M + '-' + day,
        partialPayments: [{ amount: taken, date: M + '-' + day, method: 'Cash' }] });
      // 8,000 billed, 4,000 taken — and a DIFFERENT student with 5,000 taken,
      // which is the figure the Add form leaves behind in `_pfAlready`.
      DB.payments = [rec('PP1', 'PS1', 'Part Paid', 4000, 4000, '06'),
                     rec('PP2', 'PS2', 'Other Payer', 5000, 3000, '04')];
      await saveDB();
    });

    // The Add Payment form runs first, on the OTHER student's part-paid month.
    await win.evaluate(() => navigate('addpayment'));
    await win.waitForSelector('#f-pmonth', { timeout: 15000 });
    await win.evaluate(async () => {
      selectStudentForPayment('PS2');
      await new Promise(r => setTimeout(r, 400));
      const sel = document.getElementById('f-pmonth'), want = monthLabel(thisMonth());
      if (sel) for (const o of sel.options) if (o.value === want) sel.value = want;
      pfMonthChanged();
    });
    await win.waitForTimeout(400);
    const banner = await txt(win, 'pf-month-state');
    expect(banner, 'the Add form did not load the other month, so nothing was staged')
      .toContain('part paid');

    // ...and the warden goes back to the register and edits the FIRST student.
    await win.evaluate(() => navigate('payments'));
    await win.waitForTimeout(400);
    await win.evaluate(() => showEditPaymentModal('PP1'));
    await win.waitForSelector('#f-precv', { timeout: 15000 });
    await win.waitForTimeout(300);

    expect(await txt(win, 'pef-exp')).toBe('Rs. 8,000');
    expect(await txt(win, 'pef-already')).toBe('Rs. 4,000');
    expect(await txt(win, 'pef-pend'), 'the collection was subtracted twice').toBe('Rs. 4,000');
    expect(await txt(win, 'pef-rem')).toBe('Rs. 4,000');
    expect(await win.evaluate(() => document.getElementById('pef-full').disabled),
      'Full pending is locked when the pending amount reads zero').toBe(false);
    expect(await win.evaluate(() => !!document.getElementById('f-ppaid-cap-warn')),
      'a spurious over-payment note under the amount').toBe(false);

    // Full pending fills the real balance and settles the month.
    await win.evaluate(() => pefReceiveFull());
    await win.waitForTimeout(250);
    expect(await win.evaluate(() => document.getElementById('f-precv').value)).toBe('4000');
    expect(await txt(win, 'pef-newbal-v')).toBe('Rs. 0');
    expect(await txt(win, 'pef-mstat')).toBe('Fully paid');

    await win.evaluate(() => submitEditPayment('PP1'));
    await win.waitForTimeout(600);
    const saved = await win.evaluate(() => {
      const p = DB.payments.find(x => x.id === 'PP1');
      return { status: p.status, unpaid: p.unpaid, amount: p.amount, n: p.partialPayments.length };
    });
    expect(saved).toEqual({ status: 'Paid', unpaid: 0, amount: 8000, n: 2 });
  } finally {
    await app.close();
  }
});
