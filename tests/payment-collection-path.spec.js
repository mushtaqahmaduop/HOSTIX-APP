/* ─── ONE COLLECTION PATH, AND IT NEVER OVERWRITES MONEY ──────────────────────

   Regression cover for the defect the finance audit named (finance spec §19,
   Rule 3): both Add Payment merge paths read their amount box as the month's
   CUMULATIVE paid figure and wrote it straight over the record's collected
   total.

     payments.js  alreadyPending.amount  = money(newPaid)
     payments.js  alreadyPending2.amount = newPaid
                  const instalment = newPaid - prevPaid

   A student who had already paid Rs.5,000 and handed over Rs.5,000 more had to
   be entered as 10,000. Entering the 5,000 actually received rewrote the
   collected total DOWNWARDS — and on the second path the derived instalment
   went negative, so no trail entry was written and the first collection was
   gone without a trace.

   These tests drive the real submit handlers with the real form DOM. They do
   not drive the mouse: the defect was in the handler, and a test that clicks
   its way there would break on any layout change and stop covering it.

   §26 rows 5–8 and 12 of the finance specification.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');
const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

/** Sign in, clear the demo data, and give us one student on a known charge. */
async function boot() {
  const PROFILE = resetProfile();
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env });
  const win = await app.firstWindow();
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(() => {
    const s = document.getElementById('login-screen'); return s && s.style.display === 'none';
  }, null, { timeout: 30000 });

  await win.evaluate(async () => {
    window.toast = () => {};
    // The merge branch asks before it writes; the test is about what it writes.
    window.showConfirm = (t, b, onOk) => { if (typeof onOk === 'function') onOk(); };
    window.pinNeeded = () => false;
    DB.students = []; DB.payments = []; DB.studentLedger = DB.studentLedger || [];
    DB.students.push({
      id: 'stu_collect', name: 'Collection Test', status: 'Active',
      roomId: (DB.rooms[0] || {}).id, joinDate: thisMonth() + '-01',
      phone: '03001234567', fatherName: 'Guardian',
    });
    await saveDB();
  });
  return { app, win };
}

/** The month record for our student, as the DB holds it. */
const recOf = win => win.evaluate(() => {
  const p = (DB.payments || []).find(x => x.studentId === 'stu_collect');
  if (!p) return null;
  return {
    amount: p.amount, unpaid: p.unpaid, overpaid: p.overpaid, status: p.status,
    method: p.method, date: p.date, collectedBy: p.collectedBy, month: p.month,
    trail: (p.partialPayments || []).map(e => ({
      amount: e.amount, date: e.date, method: e.method, collectedBy: e.collectedBy, note: e.note,
    })),
  };
});

/* Opens the Add Payment modal and fills the charge side. `received` is what the
   box now means: money handed over NOW. */
async function collectViaModal(win, { received, month, rent = 10000, mess = 7000, method = 'Cash', date }) {
  await win.evaluate(({ received, month, rent, mess, method, date }) => {
    showAddPaymentForStudent('stu_collect');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    set('f-ps-amt', rent);
    set('f-ps-mess', mess);
    const on = document.getElementById('f-ps-mess-on'); if (on) on.checked = true;
    set('f-ps-admfee', 0);
    set('f-ps-concession', 0);
    set('f-ps-paid', received);
    set('f-ps-month', month);
    set('f-ps-method', method);
    if (date) set('f-ps-date', date);
  }, { received, month, rent, mess, method, date });
  await win.evaluate(() => submitPaymentForStudent());
  await win.waitForTimeout(500);
}

test('a second collection is ADDED to the first, never written over it', async () => {
  test.setTimeout(180000);
  const { app, win } = await boot();
  const month = await win.evaluate(() => thisMonth());

  // Bill 17,000. First Rs.5,000.
  await collectViaModal(win, { received: 5000, month, rent: 10000, mess: 7000 });
  let r = await recOf(win);
  expect(r).not.toBeNull();
  expect(r.amount).toBe(5000);
  expect(r.unpaid).toBe(12000);
  expect(r.trail.length).toBe(1);

  /* THE DEFECT. Under the old model this had to be entered as the cumulative
     10,000; entering the 5,000 actually received set amount = 5000 — no change
     — and the first collection's trail entry was never written. */
  await collectViaModal(win, { received: 5000, month, rent: 10000, mess: 7000 });
  r = await recOf(win);
  expect(r.amount).toBe(10000);          // 5,000 + 5,000, not 5,000
  expect(r.unpaid).toBe(7000);
  expect(r.status).toBe('Pending');
  expect(r.trail.length).toBe(2);        // two collections, two entries
  expect(r.trail.every(e => e.amount === 5000)).toBe(true);

  // And a third clears it.
  await collectViaModal(win, { received: 7000, month, rent: 10000, mess: 7000 });
  r = await recOf(win);
  expect(r.amount).toBe(17000);
  expect(r.unpaid).toBe(0);
  expect(r.status).toBe('Paid');
  expect(r.trail.length).toBe(3);

  await app.close();
});

test('the first collection leaves a trail entry of its own', async () => {
  test.setTimeout(180000);
  const { app, win } = await boot();
  const month = await win.evaluate(() => thisMonth());

  /* The record used to be created with the cash already inside it and no
     instalment entry, so the opening collection had no date, method or
     collector of its own — only the record's loose fields. */
  await collectViaModal(win, { received: 4000, month, rent: 10000, mess: 7000, method: 'JazzCash' });
  const r = await recOf(win);
  expect(r.amount).toBe(4000);
  expect(r.trail.length).toBe(1);
  expect(r.trail[0].amount).toBe(4000);
  expect(r.trail[0].method).toBe('JazzCash');
  expect(String(r.trail[0].collectedBy || '').length).toBeGreaterThan(0);

  await app.close();
});

test('a record holding money keeps its date, method and collector', async () => {
  test.setTimeout(180000);
  const { app, win } = await boot();
  const month = await win.evaluate(() => thisMonth());

  await collectViaModal(win, {
    received: 5000, month, rent: 10000, mess: 7000, method: 'Cash', date: month + '-03',
  });
  const first = await recOf(win);
  expect(first.date).toBe(month + '-03');
  expect(first.method).toBe('Cash');

  /* Rule 1: the second visit is a new event. It must not restamp the record's
     own date, method or collector — those describe a collection that already
     happened. The NEW money carries the new method on its own trail entry. */
  await collectViaModal(win, {
    received: 3000, month, rent: 10000, mess: 7000, method: 'Bank Transfer', date: month + '-19',
  });
  const second = await recOf(win);
  expect(second.date).toBe(month + '-03');            // unchanged
  expect(second.method).toBe('Cash');                 // unchanged
  expect(second.collectedBy).toBe(first.collectedBy); // unchanged
  const latest = second.trail[second.trail.length - 1];
  expect(latest.amount).toBe(3000);
  expect(latest.method).toBe('Bank Transfer');        // the new fact, on the new event
  expect(latest.date).toBe(month + '-19');

  await app.close();
});

test('one hand-over splits across an arrear and the current month', async () => {
  test.setTimeout(180000);
  const { app, win } = await boot();

  /* The spec's §3 scenario: August owes 5,000, September owes 17,000, the
     student hands over 10,000 and says 5,000 each. September's bill must not
     become 10,000 or 5,000 — the allocations are what move. */
  const out = await win.evaluate(async () => {
    const mo = thisMonth();
    const [y, m] = mo.split('-').map(Number);
    const prevD = new Date(y, m - 2, 1);
    const prev = prevD.getFullYear() + '-' + String(prevD.getMonth() + 1).padStart(2, '0');

    DB.payments = [
      { id: 'p_prev', studentId: 'stu_collect', studentName: 'Collection Test', month: prev,
        monthlyRent: 5000, messCharge: 0, messIncluded: false, amount: 0, unpaid: 5000,
        overpaid: 0, status: 'Pending', method: 'Cash', date: prev + '-01' },
      { id: 'p_cur', studentId: 'stu_collect', studentName: 'Collection Test', month: mo,
        monthlyRent: 10000, messCharge: 7000, messIncluded: true, amount: 0, unpaid: 17000,
        overpaid: 0, status: 'Pending', method: 'Cash', date: mo + '-01' },
    ];
    await saveDB();

    // The arrears allocator, driven the way the form drives it.
    const prevRec = DB.payments.find(p => p.id === 'p_prev');
    const curRec  = DB.payments.find(p => p.id === 'p_cur');
    applyPayment(prevRec, { amount: 5000, method: 'Cash', date: mo + '-18', note: 'Arrears collected' });
    applyPayment(curRec,  { amount: 5000, method: 'Cash', date: mo + '-18', note: 'Collected' });
    await saveDB();

    const pick = p => ({ month: p.month, amount: p.amount, unpaid: p.unpaid,
                         status: p.status, bill: calculateBill(p), trail: (p.partialPayments || []).length });
    return { prev: pick(prevRec), cur: pick(curRec) };
  });

  expect(out.prev.amount).toBe(5000);
  expect(out.prev.unpaid).toBe(0);
  expect(out.prev.status).toBe('Paid');

  expect(out.cur.bill).toBe(17000);     // the BILL is untouched by the allocation
  expect(out.cur.amount).toBe(5000);
  expect(out.cur.unpaid).toBe(12000);
  expect(out.cur.status).toBe('Pending');

  expect(out.prev.trail).toBe(1);
  expect(out.cur.trail).toBe(1);

  await app.close();
});

test('over-collection is held as a credit, and reversing it is exact', async () => {
  test.setTimeout(180000);
  const { app, win } = await boot();
  const month = await win.evaluate(() => thisMonth());

  // 17,000 bill, 20,000 handed over.
  await collectViaModal(win, { received: 20000, month, rent: 10000, mess: 7000 });
  let r = await recOf(win);
  expect(r.amount).toBe(20000);
  expect(r.unpaid).toBe(0);
  expect(r.overpaid).toBe(3000);        // §14: recorded, not swallowed

  // Reversing the whole collection puts the record back exactly where it began.
  const after = await win.evaluate(async () => {
    const p = DB.payments.find(x => x.studentId === 'stu_collect');
    const res = reversePayment(p, { reason: 'Duplicate entry' });
    await saveDB();
    return { ok: res.ok, amount: p.amount, unpaid: p.unpaid, overpaid: p.overpaid,
             reversals: (p.reversals || []).length, trail: (p.partialPayments || []).length };
  });
  expect(after.ok).toBe(true);
  expect(after.amount).toBe(0);
  expect(after.unpaid).toBe(17000);
  expect(after.overpaid).toBe(0);
  expect(after.reversals).toBe(1);
  expect(after.trail).toBe(1);          // the original collection is still visible

  await app.close();
});
