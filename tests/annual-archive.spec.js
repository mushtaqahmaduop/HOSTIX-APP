// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — Annual Archive
//
// The archive is the hostel's historical record, so the things worth pinning
// down are the ones that would quietly lie:
//   1. It reads the LIVE tables and DB.archive TOGETHER. A year whose records
//      have been moved into DB.archive by enforceDataRetention() must still
//      report its revenue — reading either half alone gives a wrong total, and
//      an archive that says PKR 0 for a real year is worse than no archive.
//   2. Year and month scoping are real: a month shows only its own records, a
//      year sums its months, and neither leaks into the other.
//   3. Every section is present — students, payments, pending, expenses,
//      cancellations — and the expense register is grouped by category with a
//      total per category and a grand total, like the rest of the app.
//   4. A student can be opened for any period, and the figures in that modal
//      match the row that opened it.
//   5. The printed document carries every section, not just the open tab.
//
// Runs against the ISOLATED throwaway profile (HOSTIX_TEST_PROFILE).
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');
const { resetProfile } = require('./_profile');

test.beforeAll(() => {
  resetProfile();   // suite-order independence — see _profile.js
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
});

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  };
}

// Two fields, and CUR_USER is the only proof the login landed — see the note in
// fund-transfer-and-category-register.spec.js.
async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForTimeout(1500);
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.press('#login-input', 'Enter');
  await win.waitForFunction(() => typeof CUR_USER !== 'undefined' && !!CUR_USER, null, { timeout: 30000 });
  await win.waitForTimeout(900);
}

const kpis = win => win.evaluate(() => {
  const out = {};
  document.querySelectorAll('.arc-kpi').forEach(k => {
    out[k.querySelector('.arc-kpi__l').textContent.trim()] =
      k.querySelector('.arc-kpi__v').textContent.replace(/[^0-9-]/g, '');
  });
  return out;
});

test('annual archive: live + archived data, period scoping, sections, drill-down, print', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => console.log('PAGEERROR ' + e.message));
  await login(win);
  expect(await win.evaluate(() => canDo('reports'))).toBe(true);

  await win.evaluate(async () => {
    DB.rooms = []; DB.students = []; DB.payments = []; DB.expenses = [];
    DB.transfers = []; DB.cancellations = []; DB.archive = []; DB.fines = [];
    for (let i = 0; i < 5; i++) {
      const t = DB.settings.roomTypes[i % DB.settings.roomTypes.length];
      DB.rooms.push({ id: 'r' + i, number: String(101 + i), floor: 'Ground', typeId: t.id, rent: 16000 });
    }
    ['Abdul Rehman', 'Zeeshan Malik', 'Bilal Ahmad', 'Hafiz Usman'].forEach((n, i) =>
      DB.students.push({ id: 'st' + i, name: n, fatherName: n.split(' ')[0] + ' Sr',
        phone: '030011122' + i, cnic: '17301-00000' + i, roomId: 'r' + i, status: 'Active',
        rent: 16000, mess: 0, messOptIn: true, joinDate: '2025-03-01' }));

    const pay = (id, sid, month, date, status, amount, unpaid) => ({
      id, studentId: sid, studentName: DB.students.find(s => s.id === sid).name,
      roomNumber: '101', month, date, status, amount,
      unpaid: unpaid == null ? null : unpaid, method: 'Cash',
    });

    // 2025 lives ONLY in DB.archive — the retention pass moved it there.
    DB.archive.push(Object.assign(pay('a1', 'st0', '2025-11', '2025-11-05', 'Paid', 16000), { _src: 'payments' }));
    DB.archive.push(Object.assign(pay('a2', 'st1', '2025-11', '2025-11-07', 'Paid', 16000), { _src: 'payments' }));
    DB.archive.push({ id: 'ax', date: '2025-11-10', category: 'Electricity',
      description: 'WAPDA Nov', amount: 9000, _src: 'expenses' });

    // 2026 is live.
    DB.payments.push(pay('p1', 'st0', '2026-08', '2026-08-03', 'Paid', 16000));
    DB.payments.push(pay('p2', 'st1', '2026-08', '2026-08-04', 'Paid', 16000));
    DB.payments.push(pay('p3', 'st2', '2026-08', '2026-08-06', 'Pending', 6000, 10000)); // part-paid
    DB.payments.push(pay('p4', 'st3', '2026-08', '2026-08-01', 'Pending', 0, 16000));
    DB.payments.push(pay('p5', 'st0', '2026-07', '2026-07-02', 'Paid', 16000));

    DB.expenses.push({ id: 'e1', date: '2026-08-02', category: 'Electricity', description: 'WAPDA bill', amount: 12000 });
    DB.expenses.push({ id: 'e2', date: '2026-08-11', category: 'Electricity', description: 'Generator fuel', amount: 3000 });
    DB.expenses.push({ id: 'e3', date: '2026-08-09', category: 'Cleaning', description: 'Sweeper salary', amount: 8000 });
    DB.expenses.push({ id: 'e4', date: '2026-07-04', category: 'Gas', description: 'Cylinder', amount: 4200 });
    DB.transfers.push({ id: 'tr1', date: '2026-08-20', amount: 25000, method: 'Cash',
      description: 'Handed to owner', receivedBy: 'Owner' });

    DB.cancellations.push({ id: 'c1', seq: 1, studentId: 'st3', studentName: 'Hafiz Usman',
      roomId: 'r3', roomNumber: '104', requestDate: '2026-08-12', vacateDate: '2026-08-31',
      reason: 'Moved city', status: 'Approved', createdAt: '2026-08-12' });
    DB.fines.push({ id: 'f1', studentId: 'st2', amount: 500, reason: 'Late payment',
      date: '2026-08-15', paid: false });
    await saveDB();
  });

  // ── 1. Whole year 2026 ────────────────────────────────────────────────────
  await win.evaluate(() => { archiveFilter = { year: '2026', month: '', tab: 'overview' }; navigate('archive'); });
  await win.waitForTimeout(1200);
  expect(await win.evaluate(() => document.body.innerText.includes('Render Error'))).toBe(false);

  const y26 = await kpis(win);
  console.log('Y2026 ' + JSON.stringify(y26));
  // Revenue = 16000 + 16000 + 6000 (the part payment) + 16000 (July) = 54000.
  expect(y26['Revenue']).toBe('54000');
  // Expenses = 12000 + 3000 + 8000 + 4200 + 25000 transfer = 52200.
  expect(y26['Expenses']).toBe('52200');
  expect(y26['Available Fund']).toBe('1800');
  expect(y26['Pending']).toBe('26000');
  expect(y26['Cancellations']).toBe('1');

  // The year view lists every month and its own total row adds up.
  const monthTable = await win.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.arc-table tbody tr'));
    const last = rows[rows.length - 1];
    return {
      rowCount: rows.length,
      julRevenue: rows.find(r => /^Jul/.test(r.children[0].textContent))?.children[1].textContent.replace(/[^0-9]/g,''),
      augRevenue: rows.find(r => /^Aug/.test(r.children[0].textContent))?.children[1].textContent.replace(/[^0-9]/g,''),
      janRevenue: rows.find(r => /^Jan/.test(r.children[0].textContent))?.children[1].textContent.trim(),
      totalLabel: last.children[0].textContent.trim(),
      totalRevenue: last.children[1].textContent.replace(/[^0-9]/g,''),
    };
  });
  console.log('MONTHS ' + JSON.stringify(monthTable));
  expect(monthTable.rowCount).toBe(13);             // 12 months + year total
  expect(monthTable.julRevenue).toBe('16000');
  expect(monthTable.augRevenue).toBe('38000');
  expect(monthTable.janRevenue).toBe('—');          // empty month, no fake zero
  expect(monthTable.totalLabel).toBe('Year total');
  expect(monthTable.totalRevenue).toBe('54000');

  // ── 2. One month — no leakage from the rest of the year ───────────────────
  await win.evaluate(() => arcSetMonth('08'));
  await win.waitForTimeout(900);
  const aug = await kpis(win);
  console.log('AUG ' + JSON.stringify(aug));
  expect(aug['Revenue']).toBe('38000');             // July's 16000 excluded
  expect(aug['Expenses']).toBe('48000');            // July's 4200 excluded
  expect(aug['Available Fund']).toBe('-10000');
  const augBody = await win.evaluate(() => document.body.innerText);
  expect(augBody).not.toContain('Cylinder');        // that is July's expense

  // ── 3. Sections all render, expenses grouped with totals ──────────────────
  for (const tab of ['students', 'payments', 'pending', 'expenses', 'cancellations']) {
    await win.evaluate(t => arcSetTab(t), tab);
    await win.waitForTimeout(500);
    const err = await win.evaluate(() => document.body.innerText.includes('Render Error'));
    expect(err, `${tab} tab render error`).toBe(false);
  }

  await win.evaluate(() => arcSetTab('expenses'));
  await win.waitForTimeout(600);
  const reg = await win.evaluate(() => {
    const subs = Array.from(document.querySelectorAll('.arc-table tr.arc-sub'))
      .map(tr => ({ label: tr.children[0].textContent.trim(),
                    amount: tr.children[1].textContent.replace(/[^0-9]/g, '') }));
    return { subs, grand: document.querySelector('.arc-grand__v')?.textContent.replace(/[^0-9]/g, '') };
  });
  console.log('REGISTER ' + JSON.stringify(reg));
  const byCat = Object.fromEntries(reg.subs.map(s => [s.label.replace('Total — ', ''), s.amount]));
  expect(byCat['Fund Transfer']).toBe('25000');     // legacy transfer, under its category
  expect(byCat['Electricity']).toBe('15000');
  expect(byCat['Cleaning']).toBe('8000');
  expect(reg.grand).toBe('48000');                  // and it matches the KPI

  // ── 4. A year that exists ONLY in DB.archive ──────────────────────────────
  await win.evaluate(() => { arcSetTab('overview'); arcSetMonth(''); arcSetYear('2025'); });
  await win.waitForTimeout(900);
  const y25 = await kpis(win);
  console.log('Y2025 ' + JSON.stringify(y25));
  expect(y25['Revenue']).toBe('32000');   // both archived payments
  expect(y25['Expenses']).toBe('9000');   // the archived expense
  expect(y25['Available Fund']).toBe('23000');

  await win.evaluate(() => arcSetMonth('11'));
  await win.waitForTimeout(800);
  expect((await kpis(win))['Revenue']).toBe('32000');
  await win.evaluate(() => arcSetMonth('10'));
  await win.waitForTimeout(800);
  expect((await kpis(win))['Revenue'], 'October 2025 had nothing').toBe('0');

  // ── 5. Student drill-down agrees with the row that opened it ──────────────
  await win.evaluate(() => { arcSetYear('2026'); arcSetMonth('08'); arcSetTab('students'); });
  await win.waitForTimeout(900);
  const rowFigures = await win.evaluate(() => {
    const tr = Array.from(document.querySelectorAll('.arc-table tbody tr'))
      .find(r => /Bilal Ahmad/.test(r.children[0]?.textContent || ''));
    return { paid: tr.children[6].textContent.replace(/[^0-9]/g, ''),
             pending: tr.children[7].textContent.replace(/[^0-9]/g, '') };
  });
  await win.evaluate(() => showArchiveStudent('st2'));
  await win.waitForTimeout(800);
  const modal = await win.evaluate(() => {
    const ks = {};
    document.querySelectorAll('.arc-sd-k').forEach(k => {
      ks[k.querySelector('.arc-sd-k__l').textContent.trim()] =
        k.querySelector('.arc-sd-k__v').textContent.replace(/[^0-9]/g, '');
    });
    const subs = Array.from(document.querySelectorAll('.arc-table tr.arc-sub'))
      .map(tr => Array.from(tr.children).map(td => td.textContent.replace(/[^0-9]/g, '')));
    return { ks, subs, text: document.body.innerText };
  });
  console.log('STUDENT ' + JSON.stringify({ row: rowFigures, modal: modal.ks }));
  expect(modal.ks['Paid']).toBe(rowFigures.paid);
  expect(modal.ks['Outstanding']).toBe(rowFigures.pending);
  expect(modal.ks['Paid']).toBe('6000');            // the PART payment counts
  expect(modal.ks['Outstanding']).toBe('10000');
  // The payments table's own total row must agree with the KPI above it —
  // summing only status==='Paid' made this read 0 under a column showing 6,000.
  expect(modal.subs.some(r => r.includes('6000'))).toBe(true);
  expect(modal.text).toContain('Late payment');     // the period's fine is shown

  // ── 6. Print carries every section, not just the open tab ─────────────────
  await win.evaluate(() => closeModal());
  await win.waitForTimeout(400);
  const pdfWinPromise = app.waitForEvent('window');
  await win.evaluate(() => printArchive());
  const pdfWin = await pdfWinPromise;
  await pdfWin.waitForLoadState('domcontentloaded');
  const doc = await pdfWin.evaluate(() => document.documentElement.outerHTML);
  await pdfWin.close();
  console.log('PRINT len=' + doc.length);
  ['Students', 'Payments', 'Outstanding', 'Expenses by Category', 'Cancellations']
    .forEach(section => expect(doc, `print is missing ${section}`).toContain(section));
  expect(doc).toContain('Bilal Ahmad');
  expect(doc).toContain('Handed to owner');   // the transfer, under its category
  expect(doc).toContain('GRAND TOTAL');
  expect(doc).not.toContain('Cylinder');      // July's expense, not August's

  await app.close();
});
