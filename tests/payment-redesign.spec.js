// ════════════════════════════════════════════════════════════════════════════
// Add / Edit Payment — the redesigned modal.
//
//  1. Monthly Charge is ONE derived figure. The mess tick is the only control:
//     unticked it reads the rent alone, ticked it adds the mess. No mess box.
//  2. Both halves are fetched from Settings, not from the student/room copies.
//  3. Arrears from earlier months can be collected on a later visit, but the
//     money posts to the month it belongs to — the current month is untouched.
//  4. The payment month is PICKED, never typed: a typo'd label used to create a
//     month nothing else could match, stranding the arrear that belonged to it.
//  5. The receipt names the arrears taken in the same visit, so the slip in the
//     student's hand adds up to the cash they actually handed over.
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
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('monthly charge is derived from Settings and arrears post to their own month', async () => {
  const RENT = 8000, MESS = 6500, FULL = RENT + MESS;   // 14,500
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  // Fixture: priced hostel, one student, two unpaid earlier months.
  await win.evaluate(async ([rent, mess, full]) => {
    const t = DB.settings.roomTypes.find(x => x.id === '2s');
    t.defaultRent = rent; t.defaultMess = mess;
    DB.rooms.push({ id: 'rm1', number: 'P1', floor: 'Ground', typeId: '2s',
      studentIds: [], amenities: [], notes: '', rent: rent });
    DB.students.push({ id: '500', name: 'Arrears Student', roomId: 'rm1',
      rent: rent, mess: mess, messOptIn: true, status: 'Active',
      joinDate: '2026-06-01', paymentMethod: 'Cash' });
    // June fully unpaid, July part-paid.
    DB.payments.push({ id: 'p_jun', studentId: '500', studentName: 'Arrears Student',
      roomId: 'rm1', roomNumber: 'P1', month: 'June 2026', monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: 0, unpaid: full,
      status: 'Pending', date: '2026-06-05', extraCharges: [], extraTotal: 0 });
    DB.payments.push({ id: 'p_jul', studentId: '500', studentName: 'Arrears Student',
      roomId: 'rm1', roomNumber: 'P1', month: 'July 2026', monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: 4500, unpaid: full - 4500,
      status: 'Pending', date: '2026-07-05', extraCharges: [], extraTotal: 0 });
    await saveDB();
    navigate('payments');
  }, [RENT, MESS, FULL]);
  await win.waitForTimeout(500);

  // ── 1 + 2. Monthly Charge, derived, tick-driven ───────────────────────────
  // openAddPayment() navigates to the page and preselects once it has rendered.
  await win.evaluate(() => openAddPayment('500'));
  await win.waitForSelector('#f-pcharge', { timeout: 8000 });
  await win.waitForFunction(
    () => document.getElementById('f-pstudent') &&
          document.getElementById('f-pstudent').value === '500',
    null, { timeout: 8000 });
  await win.waitForTimeout(200);

  const noMessBox = await win.evaluate(() => {
    const m = document.getElementById('f-pmess');
    return { exists: !!m, hidden: m ? m.type === 'hidden' : null };
  });
  expect(noMessBox.hidden, 'the mess amount must not be a box the warden types in').toBe(true);

  const ticked = await win.evaluate(() => ({
    charge: document.getElementById('f-pcharge').value,
    note:   document.getElementById('f-pcharge-note').textContent,
    unpaid: document.getElementById('f-punpaid').value,
    // The right-hand Payment Summary on the page.
    summary: document.getElementById('ap-summary').innerText.replace(/\n+/g, ' | '),
  }));
  console.log('\n[mess ticked]   ' + JSON.stringify(ticked));
  expect(ticked.charge.replace(/,/g, ''), 'ticked charge').toBe(String(FULL));
  // Case-insensitive on purpose: the note's wording is the assertion, its
  // sentence casing is presentation and has changed once already.
  expect(ticked.note.toLowerCase()).toContain('mess included');
  expect(Number(ticked.unpaid)).toBe(FULL);
  expect(ticked.summary, 'summary should carry the monthly charge').toContain('14,500');
  expect(ticked.summary, 'summary should show the remaining balance').toContain('Remaining Balance');

  // Untick → rent only, immediately.
  await win.uncheck('#f-pmess-on');
  await win.waitForTimeout(200);
  const unticked = await win.evaluate(() => ({
    charge: document.getElementById('f-pcharge').value,
    note:   document.getElementById('f-pcharge-note').textContent,
    unpaid: document.getElementById('f-punpaid').value,
  }));
  console.log('[mess unticked] ' + JSON.stringify(unticked));
  expect(unticked.charge.replace(/,/g, ''), 'unticked charge is rent only').toBe(String(RENT));
  expect(unticked.note.toLowerCase()).toContain('rent only');
  expect(Number(unticked.unpaid)).toBe(RENT);

  // Re-tick → back to the full charge.
  await win.check('#f-pmess-on');
  await win.waitForTimeout(200);
  const reticked = await win.evaluate(() => document.getElementById('f-pcharge').value);
  expect(reticked.replace(/,/g, ''), 're-ticked charge').toBe(String(FULL));

  // ── 3. Outstandings panel lists the two earlier months ────────────────────
  const outs = await win.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.pf-out__row'));
    return rows.map(r => ({ month: r.querySelector('.pf-out__m').textContent.trim(),
                            owed: r.querySelector('.pf-out__d b').textContent,
                            id: r.querySelector('.pf-out__in').dataset.payid }));
  });
  console.log('[outstandings] ' + JSON.stringify(outs));
  expect(outs.length, 'both earlier unpaid months should be listed').toBe(2);
  expect(outs.map(o => o.month).sort()).toEqual(['July 2026', 'June 2026']);

  // Each row collects its own month in full; with two arrears listed the header
  // keeps the button that fills them all.
  const btns = await win.evaluate(() => ({
    perRow:   Array.from(document.querySelectorAll('.pf-out__row .pf-out__btn')).map(b => b.textContent.trim()),
    inHeader: !!document.querySelector('.pf-out__h .pf-out__btn'),
  }));
  expect(btns.perRow.length, 'every arrear row carries its own collect button').toBe(2);
  expect(btns.inHeader, 'several arrears keep the collect-all button').toBe(true);

  // ── 4. The month is picked, not typed ─────────────────────────────────────
  const monthField = await win.evaluate(() => {
    const el = document.getElementById('f-pmonth');
    return { tag: el.tagName, value: el.value, months: Array.from(el.options).map(o => o.value) };
  });
  console.log('[month picker] ' + JSON.stringify(
    { tag: monthField.tag, value: monthField.value, options: monthField.months.length }));
  expect(monthField.tag, 'the month must be a picker, not a free-text box').toBe('SELECT');
  expect(monthField.value, 'it opens on the current month')
    .toBe(new Date().toLocaleString('default', { month: 'long', year: 'numeric' }));
  // A student's own unpaid months have to be selectable, or an arrear older
  // than the picker's window could never be settled from this form.
  expect(monthField.months, 'the student\'s own months join the list')
    .toEqual(expect.arrayContaining(['June 2026', 'July 2026']));

  // Collect 5,000 against June and pay this month in full.
  await win.evaluate(() => {
    document.getElementById('f-pout-p_jun').value = '5000';
    pfOutstandingInput(document.getElementById('f-pout-p_jun'));
    document.getElementById('f-ppaid').value = '14500';
    recalcUnpaid();
    document.getElementById('f-pmonth').value = 'August 2026';
  });
  await win.waitForTimeout(200);

  // Over-collection is clamped to what the month actually owes.
  const clamped = await win.evaluate(() => {
    const el = document.getElementById('f-pout-p_jul');
    el.value = '999999'; pfOutstandingInput(el);
    return el.value;
  });
  expect(Number(clamped), 'arrear collection must clamp to the amount owed').toBe(FULL - 4500);
  await win.evaluate(() => {
    const el = document.getElementById('f-pout-p_jul'); el.value = ''; pfOutstandingInput(el);
  });

  await win.evaluate(() => submitAddPayment());
  await win.waitForTimeout(900);

  const after = await win.evaluate(() => ({
    jun: DB.payments.find(p => p.id === 'p_jun'),
    jul: DB.payments.find(p => p.id === 'p_jul'),
    aug: DB.payments.find(p => p.month === 'August 2026'),
  }));
  console.log('\n[June  after] ' + JSON.stringify({ amount: after.jun.amount, unpaid: after.jun.unpaid, status: after.jun.status }));
  console.log('[July  after] ' + JSON.stringify({ amount: after.jul.amount, unpaid: after.jul.unpaid, status: after.jul.status }));
  console.log('[August new ] ' + JSON.stringify({ rent: after.aug.monthlyRent, mess: after.aug.messCharge,
                                                  amount: after.aug.amount, unpaid: after.aug.unpaid, status: after.aug.status }));

  // The arrear posted to JUNE, not to August.
  expect(after.jun.amount, 'June should have received the 5,000').toBe(5000);
  expect(after.jun.unpaid, 'June balance').toBe(FULL - 5000);
  expect(after.jun.status, 'June still owes, so still Pending').toBe('Pending');
  expect(after.jun.partialPayments.length, 'June should record the part payment').toBe(1);

  // July untouched — nothing was entered against it.
  expect(after.jul.amount, 'July must not move').toBe(4500);
  expect(after.jul.unpaid, 'July must not move').toBe(FULL - 4500);

  // August is exactly this month's charge — no arrears folded in.
  expect(after.aug.monthlyRent, 'August rent from Settings').toBe(RENT);
  expect(after.aug.messCharge,  'August mess from Settings').toBe(MESS);
  expect(after.aug.amount, 'August must hold only this month\'s payment').toBe(FULL);
  expect(after.aug.unpaid, 'August settled').toBe(0);
  expect(after.aug.status, 'August Paid').toBe('Paid');

  // ── 5. The receipt accounts for the arrear taken alongside it ─────────────
  const rcpt = await win.evaluate(() => {
    const aug  = DB.payments.find(p => p.month === 'August 2026');
    const text = buildReceiptHTML(aug.id).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    return {
      recorded: aug.arrearsCollected,
      hasBlock: /Arrears Received/.test(text),
      total: (text.match(/TOTAL RECEIVED[^P]*PKR [\d,]+/) || ['(missing)'])[0].replace(/\.+/, ' … '),
    };
  });
  console.log('[receipt] ' + JSON.stringify(rcpt));
  expect(rcpt.recorded, 'the visit records which month the arrear went to')
    .toEqual([{ month: 'June 2026', amount: 5000, date: expect.any(String) }]);
  expect(rcpt.hasBlock, 'the receipt must name the arrears received').toBe(true);
  // 14,500 for August + 5,000 posted to June = the cash actually handed over.
  expect(rcpt.total, 'the receipt totals the whole visit').toContain('19,500');

  await app.close();
  expect(pageErrors, 'uncaught JS error').toEqual([]);
});
