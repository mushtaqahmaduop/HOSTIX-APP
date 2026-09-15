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
