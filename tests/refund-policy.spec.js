// ════════════════════════════════════════════════════════════════════════════
// The part-month refund, end to end (owner, 2026-09-09).
//
// The arithmetic is pinned by tests/finance.test.js, which runs in plain node.
// This file is only about the wiring the arithmetic disappears into, and that
// wiring carries one decision worth guarding: the refund is NOT a second
// ledger. It is written onto the vacate month's payment record as a concession,
// which is what turns a paid month into a credit — and the existing checkout
// path then hands that credit back through reversePayment(). If somebody ever
// "simplifies" it into a standalone refund row, the payment, the receipt and
// every export stop agreeing with the settlement.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 60000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 60000 });
  await win.waitForTimeout(600);

  // One student who paid a full month and is leaving a third of the way in.
  await win.evaluate(async () => {
    const r = DB.rooms[0];
    const mk = thisMonth();
    DB.students = [{ id: '001', name: 'Azat Ullah', roomId: r.id, status: 'Cancelling',
      phone: '0301-9409962', joinDate: mk + '-01', gender: 'Male' }];
    DB.payments = [{ id: 'p1', studentId: '001', studentName: 'Azat Ullah', roomNumber: String(r.number),
      month: mk, monthlyRent: 15000, messCharge: 6000, messIncluded: true,
      amount: 21000, unpaid: 0, method: 'Cash', status: 'Paid', date: mk + '-02' }];
    DB.cancellations = [{ id: 'c1', studentId: '001', studentName: 'Azat Ullah', roomId: r.id,
      roomNumber: String(r.number), roomType: '3-Seater',
      requestDate: mk + '-08', vacateDate: mk + '-10', status: 'Pending', reason: 'Shifting home' }];
    await saveDB();
  });
  return { app, win };
}

test('with no policy set, a checkout offers nothing — which is the default', async () => {
  const { app, win } = await launch();

  const offer = await win.evaluate(() => {
    const c = DB.cancellations[0];
    return { policy: refundPolicy().mode, offer: _cancRefundOffer(c) };
  });
  expect(offer.policy).toBe('none');
  expect(offer.offer).toBe(null);

  await app.close();
});

test('the rule reaches the checkout, and lands on the payment as a concession', async () => {
  const { app, win } = await launch();

  // The hostel chooses "mess only".
  await win.evaluate(async () => {
    DB.settings.refundPolicy = { mode: 'mess', cutoffDay: 0 };
    await saveDB();
  });

  const before = await win.evaluate(() => {
    const c = DB.cancellations[0];
    const o = _cancRefundOffer(c);
    return { amount: o && o.amount, month: o && o.month, concession: DB.payments[0].concession || 0 };
  });
  // The month has 28–31 days; whatever it is, the refund is mess × unused/total
  // and it is strictly between nothing and the whole mess charge.
  expect(before.amount).toBeGreaterThan(0);
  expect(before.amount).toBeLessThan(6000);
  expect(before.concession).toBe(0);

  // Confirm the cancellation, taking the offer.
  await win.evaluate(() => { navigate('cancellations'); });
  await win.waitForTimeout(600);
  await win.evaluate(() => confirmCancellation('c1'));
  await win.waitForTimeout(500);

  const dialog = await win.evaluate(() => ({
    shown: !!document.getElementById('canc-rf-do'),
    text: (document.querySelector('.canc-rf') || {}).textContent || '',
  }));
  expect(dialog.shown).toBe(true);
  expect(dialog.text).toMatch(/part-month refund/i);
  expect(dialog.text).toMatch(/Mess refunded for unused days/);

  await win.evaluate(() => submitCancellationSettlement('c1'));
  await win.waitForTimeout(900);

  const after = await win.evaluate(() => ({
    concession: DB.payments[0].concession || 0,
    desc: DB.payments[0].concessionDesc || '',
    settlement: DB.cancellations[0].settlement || null,
    studentStatus: DB.students[0].status,
  }));

  // The refund is ON THE RECORD, not in a ledger of its own.
  expect(after.concession).toBe(before.amount);
  expect(after.desc).toMatch(/Part-month refund/);
  // …and the checkout handed the resulting credit back.
  expect(after.settlement.refundApplied).toBe(before.amount);
  expect(after.settlement.action).toBe('refund');
  expect(after.settlement.settledNow).toBe(before.amount);
  expect(after.studentStatus).toBe('Left');

  await app.close();
});

test('declining the offer leaves the record untouched', async () => {
  const { app, win } = await launch();

  await win.evaluate(async () => {
    DB.settings.refundPolicy = { mode: 'both', cutoffDay: 0 };
    await saveDB();
    navigate('cancellations');
  });
  await win.waitForTimeout(600);
  await win.evaluate(() => confirmCancellation('c1'));
  await win.waitForTimeout(400);

  // Untick it — the warden's call for this particular leaver.
  await win.evaluate(() => { document.getElementById('canc-rf-do').checked = false; });
  await win.evaluate(() => submitCancellationSettlement('c1'));
  await win.waitForTimeout(800);

  const after = await win.evaluate(() => ({
    concession: DB.payments[0].concession || 0,
    refundApplied: (DB.cancellations[0].settlement || {}).refundApplied,
    policy: (DB.cancellations[0].settlement || {}).refundPolicy,
  }));
  expect(after.concession).toBe(0);
  expect(after.refundApplied).toBe(0);
  expect(after.policy).toBe('');

  await app.close();
});

test('the hostel sets the rule in one place, and the card says what it means', async () => {
  const { app, win } = await launch();

  await win.evaluate(() => { navigate('settings'); settingsTab = 'rentupdate'; renderPage('settings'); });
  await win.waitForTimeout(700);

  const card = await win.evaluate(() => {
    const heads = [...document.querySelectorAll('.set-head__t')].map(e => e.textContent.trim());
    return { heads, options: [...document.querySelectorAll('input[name="refund-mode"]')].length };
  });
  expect(card.heads).toContain('Refund on a Part Month');
  expect(card.options).toBe(4);

  // Choosing "the whole month" without a cut-off would return a full month to
  // somebody leaving on the 29th, so one is set for them.
  const chosen = await win.evaluate(async () => {
    await setRefundMode('full');
    return refundPolicy();
  });
  expect(chosen.mode).toBe('full');
  expect(chosen.cutoff).toBeGreaterThan(0);

  await app.close();
});
