// ════════════════════════════════════════════════════════════════════════════
// Finance Phase 6 (audit G6) — the bill as it was first raised.
//
// A record's charge fields are written in place, so once a rent is corrected or
// an extra added, the figure the month was ORIGINALLY billed at was gone: the
// student ledger records that it CHANGED, but recovering the opening bill meant
// replaying every entry on the record in order.
//
// `p.generated` is written once by whichever path raises the record and never
// rewritten. It is a frozen copy, not a live figure — calculateBill() and
// outstandingOf() stay the only authorities on what the month bills now.
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

test('the bill a month was raised at survives every change to it', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    // ── Generate Month raises the bill, and it is snapshotted ──────────────
    const born = await win.evaluate(async () => {
      window.toast = () => {};
      DB.settings.serviceModel = 'rent_mess_optional';
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 10000; rt.defaultMess = 5000;
      DB.rooms = [{ id: 'rmG', number: 'G1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuG', name: 'Snapshot Student', roomId: 'rmG', rent: 10000, mess: 5000,
                       messOptIn: true, status: 'Active', joinDate: thisMonth() + '-01',
                       paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = [];
      await saveDB();
      await generateMonthlyRents();
      const p = DB.payments[0];
      return { id: p.id, generated: p.generated, bill: calculateBill(p), drift: billDrift(p) };
    });
    expect(born.generated, 'Generate Month raised a bill with no snapshot').toBeTruthy();
    expect(born.generated.total).toBe(15000);
    expect(born.generated.monthlyRent).toBe(10000);
    expect(born.generated.messCharge).toBe(5000);
    expect(born.generated.source).toBe('monthly-generate');
    expect(born.bill).toBe(15000);
    expect(born.drift, 'a bill nobody has touched reports drift').toBeNull();

    // ── The warden corrects the rent and adds an extra, through the form ───
    await win.evaluate(id => { navigate('payments'); showEditPaymentModal(id); }, born.id);
    await win.waitForSelector('#f-precv', { timeout: 15000 });
    await win.waitForTimeout(250);
    const changed = await win.evaluate(async id => {
      // f-pcombo is the COMBINED charge (rent + mess), not the rent: 16,000
      // here is rent 11,000 + mess 5,000, i.e. the rent up by a thousand.
      document.getElementById('f-pcombo').value = '16000';
      pfComboInput();
      addExtraChargeRow('Cooler', 700);
      recalcUnpaid();
      const reason = document.getElementById('f-pedit-reason');
      if (reason) reason.value = 'Rent revised, cooler added';
      await submitEditPayment(id);
      await new Promise(r => setTimeout(r, 400));
      const p = DB.payments.find(x => x.id === id);
      return { bill: calculateBill(p), generatedTotal: p.generated.total,
               generatedRent: p.generated.monthlyRent, drift: billDrift(p) };
    }, born.id);

    // What the month bills NOW has moved; what it was raised at has not.
    expect(changed.bill).toBe(16700);
    expect(changed.generatedTotal, 'the opening bill was overwritten').toBe(15000);
    expect(changed.generatedRent).toBe(10000);
    expect(changed.drift.was).toBe(15000);
    expect(changed.drift.now).toBe(16700);
    expect(changed.drift.delta).toBe(1700);
    expect(changed.drift.parts.map(x => x.key).sort().join(','))
      .toBe('extraTotal,monthlyRent');

    // ── The form says so, and only because it moved ────────────────────────
    await win.evaluate(id => { closeModal(); showEditPaymentModal(id); }, born.id);
    await win.waitForSelector('#f-precv', { timeout: 15000 });
    await win.waitForTimeout(250);
    const shown = await win.evaluate(() => {
      const row = document.querySelector('.pef-sum__was');
      return row ? { text: row.textContent.replace(/\s+/g, ' ').trim(),
                     tip: row.getAttribute('title') } : null;
    });
    expect(shown, 'the sheet does not say what the month was first billed').toBeTruthy();
    expect(shown.text).toContain('Billed when raised');
    expect(shown.text).toContain('15,000');
    expect(shown.tip).toContain('rent');
    expect(shown.tip).toContain('extras');

    // ── Collecting money is not a change to the bill ───────────────────────
    const afterPay = await win.evaluate(async id => {
      /* Through applyPayment() — the one collection path — rather than the Edit
         form. Reopening that form on a record holding NO money deliberately
         re-prices it from the student's CURRENT rate (a bill follows the
         student's price until money is taken; see the `_own` rule in
         showEditPaymentModal), which would undo the rent change above and make
         this assertion about the form rather than about the snapshot. */
      closeModal();
      const p = DB.payments.find(x => x.id === id);
      applyPayment(p, { amount: 5000, method: 'Cash', date: today(), note: 'Collected' });
      await saveDB();
      return { amount: p.amount, generatedTotal: p.generated.total, driftNow: billDrift(p).now };
    }, born.id);
    expect(afterPay.amount).toBe(5000);
    expect(afterPay.generatedTotal, 'a collection rewrote the opening bill').toBe(15000);
    expect(afterPay.driftNow).toBe(16700);

    // ── A record raised before this existed invents nothing ────────────────
    const legacy = await win.evaluate(async () => {
      const p = { id: 'p_legacy', studentId: 'stuG', studentName: 'Snapshot Student',
        month: monthLabel(thisMonth()), monthlyRent: 9000, totalRent: 9000, messCharge: 0,
        messIncluded: false, admissionFee: 0, concession: 0, extraCharges: [], extraTotal: 0,
        amount: 0, unpaid: 9000, status: 'Pending', method: 'Cash', date: thisMonth() + '-01',
        partialPayments: [] };
      DB.payments.push(p);
      await saveDB();
      return { noSnapshot: p.generated === undefined, drift: billDrift(p) };
    });
    expect(legacy.noSnapshot, 'a snapshot was invented for a legacy record').toBe(true);
    expect(legacy.drift).toBeNull();
  } finally {
    await app.close();
  }
});
