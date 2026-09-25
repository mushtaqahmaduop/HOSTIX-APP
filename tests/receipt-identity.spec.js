// ════════════════════════════════════════════════════════════════════════════
// Audit G5 — one hand-over, one identity.
//
// A warden takes money across a counter once. If it clears an arrear and pays
// the current month, that single act writes a collection on TWO records, and
// nothing on either of them said they were the same hand-over: the student
// holds one slip, the trail held N unrelated entries, and "show me everything
// on this receipt" had no answer.
//
// The decision was deliberately NOT a receipts table — that is the second
// source of truth §14 exists to prevent. The posting stamps an id on the trail
// entries it writes, and that is all.
//
// This drives the REAL Add Payment page, so what is asserted is what a warden
// actually produces, including the arrears allocator.
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
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
  await win.selectOption('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForFunction(
    () => typeof _ledgerReady !== 'undefined' && _ledgerReady === true, null, { timeout: 30000 });
}

test.beforeAll(() => { resetProfile(); });

test('one visit clearing an arrear and paying the month is one posting', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    // ── August owes 5,000; September is billed 12,000 and owes all of it ────
    await win.evaluate(async () => {
      window.toast = () => {};
      DB.settings.serviceModel = 'rent_mess_optional';
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 12000; rt.defaultMess = 0;
      DB.rooms = [{ id: 'rmR', number: 'R1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 12000 }];
      DB.students = [{ id: 'stuR', name: 'Receipt Student', roomId: 'rmR', rent: 12000,
                       mess: 0, messOptIn: false, status: 'Active',
                       joinDate: thisMonth() + '-01', paymentMethod: 'Cash' }];
      const mo = thisMonth();
      const [y, m] = mo.split('-').map(Number);
      const pd = new Date(y, m - 2, 1);
      const prev = pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0');
      DB.payments = [{ id: 'p_arrear', studentId: 'stuR', studentName: 'Receipt Student',
        month: monthLabel(prev), monthlyRent: 5000, totalRent: 5000, messCharge: 0,
        messIncluded: false, admissionFee: 0, concession: 0, extraCharges: [], extraTotal: 0,
        amount: 0, unpaid: 5000, overpaid: 0, status: 'Pending', method: 'Cash',
        date: prev + '-01', partialPayments: [] }];
      DB.cancellations = [];
      await saveDB();
    });

    // ── The visit, through the page a warden actually uses ─────────────────
    await win.evaluate(() => navigate('addpayment'));
    await win.waitForSelector('#f-pmonth', { timeout: 15000 });
    await win.evaluate(async () => {
      selectStudentForPayment('stuR');
      await new Promise(r => setTimeout(r, 500));
      const sel = document.getElementById('f-pmonth');
      const want = monthLabel(thisMonth());
      if (sel) for (const o of sel.options) if (o.value === want) sel.value = want;
      pfMonthChanged();
      await new Promise(r => setTimeout(r, 500));
    });

    const staged = await win.evaluate(async () => {
      // 5,000 onto the arrear…
      pfFillAllOutstandings();
      // …and 12,000 for the month on the form.
      const paid = document.getElementById('f-ppaid');
      if (paid) { paid.value = '12000'; recalcUnpaid(); }
      return { rows: document.querySelectorAll('.pf-out__in').length,
               allocated: pfOutstandingAllocations().reduce((s, a) => s + a.amount, 0) };
    });
    expect(staged.rows, 'the arrears panel offered no earlier month').toBeGreaterThan(0);
    expect(staged.allocated).toBe(5000);

    await win.evaluate(async () => { await submitAddPayment(); });
    await win.waitForTimeout(700);

    // ── Both halves carry one id ───────────────────────────────────────────
    const out = await win.evaluate(() => {
      const arrear = DB.payments.find(p => p.id === 'p_arrear');
      const cur = DB.payments.find(p => p.studentId === 'stuR' && p.id !== 'p_arrear');
      const idOf = p => ((p.partialPayments || [])[0] || {}).receiptId || null;
      return {
        arrearAmount: arrear.amount, arrearStatus: arrear.status,
        curAmount: cur ? cur.amount : null,
        arrearId: idOf(arrear), curId: cur ? idOf(cur) : null,
        curRecordId: cur ? cur.id : null,
      };
    });

    expect(out.arrearAmount, 'the arrear was not collected').toBe(5000);
    expect(out.arrearStatus).toBe('Paid');
    expect(out.curAmount, 'the month on the form was not collected').toBe(12000);
    expect(out.arrearId, 'the arrear collection carries no posting id').toBeTruthy();
    expect(out.curId, 'the month collection carries no posting id').toBeTruthy();
    expect(out.arrearId, 'the two halves of one hand-over are not tied together')
      .toBe(out.curId);

    // ── …and the ledger can be read back as that one hand-over ─────────────
    const led = await win.evaluate(id => {
      const entries = ledgerEntriesForReceipt(id);
      return {
        n: entries.length,
        records: [...new Set(entries.map(e => e.paymentRecordId))].length,
        total: entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0),
        allStamped: entries.every(e => e.receiptId === id),
      };
    }, out.arrearId);

    expect(led.n, 'the ledger has nothing under this posting').toBeGreaterThan(0);
    expect(led.records, 'the posting does not span both records').toBe(2);
    expect(led.total, 'the posting does not add up to what was handed over').toBe(17000);
    expect(led.allStamped).toBe(true);

    // An id nobody used matches nothing — an empty one must not match all the
    // unstamped history at once.
    const empty = await win.evaluate(() => ({
      blank: ledgerEntriesForReceipt('').length,
      unknown: ledgerEntriesForReceipt('rcp_nope').length,
    }));
    expect(empty.blank).toBe(0);
    expect(empty.unknown).toBe(0);

    // ── A second visit is a second posting ─────────────────────────────────
    const second = await win.evaluate(async id => {
      const cur = DB.payments.find(p => p.studentId === 'stuR' && p.id !== 'p_arrear');
      cur.monthlyRent = 20000; cur.totalRent = 20000; cur.unpaid = 8000; cur.status = 'Pending';
      await saveDB();
      await markPaymentPaid(cur.id);
      await new Promise(r => setTimeout(r, 500));
      const trail = (DB.payments.find(p => p.id === cur.id).partialPayments || []);
      return { first: trail[0].receiptId, last: trail[trail.length - 1].receiptId, n: trail.length };
    }, out.arrearId);

    expect(second.n).toBe(2);
    expect(second.first).toBe(out.arrearId);
    expect(second.last, 'a later visit was recorded as part of the first hand-over')
      .not.toBe(second.first);
    expect(second.last, 'the later collection carries no posting id').toBeTruthy();
  } finally {
    await app.close();
  }
});
