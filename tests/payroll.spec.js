// ════════════════════════════════════════════════════════════════════════════
// Staff & Payroll, end to end (docs/STAFF_PAYROLL_PLAN_2026-09-30.md).
//
// Through the real screens: the rail item; the empty state; Add employee;
// Give advance (booked to Expenses at once, and locked there); the Payroll
// run — the advance comes off, Pay one through the payslip dialog, Pay the rest
// together; a payslip voided puts the advance back and removes its expense; a
// warden without Manage users can give an advance but not pay; everything
// survives a restart; a final settlement marks the employee Left.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const { settleFreshInstall } = require('./_fresh-install');
const { resetProfile } = require('./_profile');
const path = require('path');

function launchOpts() {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env };
}
async function login(win, fresh) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
  await win.selectOption('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 30000 });
  if (fresh) await settleFreshInstall(win);
}
const setVal = (win, sel, v) => win.evaluate(([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);

test.beforeAll(() => { resetProfile(); });

test('staff, advance, payroll run, void, permissions, restart, settlement', async () => {
  test.setTimeout(300000);
  let app = await electron.launch(launchOpts());
  let win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; b.unmaximize(); b.setContentSize(1366, 728); });
  await login(win, true);
  const M = await win.evaluate(() => thisMonth());

  // ── The rail offers it to the administrator; the page opens empty ─────────
  expect(await win.evaluate(() => { const n = document.querySelector('.nav-item[data-page="payroll"]'); return !!n && n.style.display !== 'none'; })).toBe(true);
  await win.evaluate(() => navigate('payroll'));
  await win.waitForSelector('.pr-page', { timeout: 10000 });
  expect(await win.textContent('.pr-empty--big')).toContain('No staff yet');

  // ── Add employee through the form ─────────────────────────────────────────
  await win.click('.pr-empty--big .btn-primary');
  await win.waitForSelector('#prf-name', { timeout: 8000 });
  await win.fill('#prf-name', 'Shaukat Masih');
  await win.fill('#prf-cnic', '36302-7788990-3');
  await win.fill('#prf-phone', '0322-4455667');
  await win.fill('#prf-role', 'Electrician / Plumber');
  await win.fill('#prf-dept', 'Maintenance');
  await setVal(win, '#prf-join', '2026-01-20');
  await win.fill('#prf-basic', '28000');
  await win.click('text=Add allowance');
  await win.fill('#prf-allow .pr-arow:last-child [data-a="label"]', 'Transport');
  await win.fill('#prf-allow .pr-arow:last-child [data-a="amount"]', '2000');
  await win.dispatchEvent('#prf-basic', 'input');
  expect(await win.textContent('#prf-gross')).toBe('Rs. 30,000');
  await win.click('#prf-save');
  await win.waitForFunction(() => (DB.employees || []).length === 1, null, { timeout: 8000 });
  const e1 = await win.evaluate(() => ({ id: DB.employees[0].id, ref: DB.employees[0].ref, gross: prGross(DB.employees[0].pay) }));
  expect(e1).toEqual(expect.objectContaining({ ref: 'EMP-0001', gross: 30000 }));
  await win.waitForSelector('#pr-panel.is-open', { timeout: 8000 });   // the new employee's profile opens
  await win.evaluate(() => closeEmployeePanel());

  // A second employee, and a third who joins mid-month (prorated).
  const [e2, e3] = await win.evaluate(async (M) => {
    const a = prAddEmployee({ name: 'Gul Khan', phone: '0301-3344556', role: 'Security Guard', department: 'Security', joinDate: '2026-02-01', basic: 26000 }).record;
    const b = prAddEmployee({ name: 'Boota Masih', phone: '0334-5566778', role: 'Cleaner', department: 'Housekeeping', joinDate: M + '-16', basic: 22000 }).record;
    await saveDB(); renderPage('payroll'); return [a.id, b.id];
  }, M);

  // ── Give advance through the form ─────────────────────────────────────────
  await win.evaluate((id) => showAdvanceForm(id), e1.id);
  await win.waitForSelector('#pra-amount', { timeout: 8000 });
  await win.fill('#pra-amount', '5000');
  await win.fill('#pra-reason', 'Family emergency');
  expect(await win.textContent('#pra-conseq')).toContain('Rs. 25,000');   // next salary, before saving
  await win.click('#pra-save');
  await win.waitForFunction(() => (DB.salaryAdvances || []).length === 1, null, { timeout: 8000 });
  const adv = await win.evaluate(() => { const a = DB.salaryAdvances[0]; const x = DB.expenses.find(e => e.id === a.expenseId);
    return { ref: a.ref, exp: x && [x.amount, x.category, x.source.kind] }; });
  expect(adv).toEqual({ ref: 'ADV-0001', exp: [5000, 'Salaries & Wages', 'advance'] });

  // ── NEVER ABOVE THE UPCOMING SALARY: 25,000 left of 30,000, so 25,001 is blocked ──
  await win.evaluate((id) => showAdvanceForm(id), e1.id);
  await win.waitForSelector('#pra-amount', { timeout: 8000 });
  await win.fill('#pra-amount', '25001');
  expect(await win.textContent('#pra-conseq')).toContain('The most you can give Shaukat Masih is Rs. 25,000');
  expect(await win.isDisabled('#pra-save')).toBe(true);
  await win.fill('#pra-amount', '25000');
  expect(await win.isDisabled('#pra-save')).toBe(false);
  await win.evaluate(() => closeModal());

  // ── A bonus with the next salary (through the form), and one paid now ─────
  await win.evaluate((id) => showBonusForm(id), e2);
  await win.waitForSelector('#prbn-amount', { timeout: 8000 });
  await win.fill('#prbn-amount', '3000');
  await win.selectOption('#prbn-type', 'Eid / festival');
  await win.fill('#prbn-reason', 'Eid');
  expect(await win.textContent('#prbn-conseq')).toContain('Rs. 29,000');     // 26,000 + 3,000 on the payslip
  await win.click('#prbn-save');
  await win.waitForFunction(() => (DB.bonuses || []).length === 1, null, { timeout: 8000 });
  const bonNow = await win.evaluate(async (id) => { const r = prGiveBonus({ employeeId: id, amount: 2000, type: 'Performance', reason: 'Best month', date: today(), payWith: 'now' });
    await saveDB(); const x = DB.expenses.find(e => e.id === r.record.expenseId); return x && [x.amount, x.source.kind]; }, e2);
  expect(bonNow).toEqual([2000, 'bonus']);

  // ── Documents: CNIC front through the real file picker ────────────────────
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
  await win.evaluate((id) => showEmployeePanel(id), e1.id);
  await win.waitForSelector('#pr-panel.is-open [data-doc="cnicFront"]', { timeout: 8000 });
  await win.evaluate((id) => { _prDocTarget = { empId: id, kind: 'cnicFront' }; }, e1.id);
  await win.setInputFiles('#pr-doc-file', { name: 'cnic-front.png', mimeType: 'image/png', buffer: png });
  await win.waitForFunction((id) => ((prFindEmployee(id).documents) || []).some(d => d.kind === 'cnicFront'), e1.id, { timeout: 8000 });
  await win.waitForFunction(() => /cnic-front\.png/.test((document.querySelector('[data-doc="cnicFront"]') || {}).textContent || ''), null, { timeout: 8000 });
  expect(await win.evaluate((id) => prFindEmployee(id).documents[0].type, e1.id)).toBe('image/jpeg');   // stored as JPEG
  await win.evaluate(() => closeEmployeePanel());

  // ── The profile and the terms sheet are built from the record ────────────
  const docs = await win.evaluate((id) => {
    DB.settings.hostelName = 'Test Boys Hostel';   // nothing prints under the placeholder name
    const got = [], keep = window._electronPDF;
    window._electronPDF = (html, name) => got.push({ html, name });
    try { employeeProfilePDF(id); employeeTermsPDF(id); } finally { window._electronPDF = keep; }
    return got.map(g => ({ name: g.name, confidential: g.html.includes('CONFIDENTIAL'), cnicImg: g.html.includes('data:image/jpeg'),
      name2: g.html.includes('Shaukat Masih'), salary: g.html.includes('Rs. 30,000'), sign: g.html.includes('signature and date') }));
  }, e1.id);
  expect(docs.length).toBe(2);
  expect(docs[0]).toEqual(expect.objectContaining({ confidential: true, cnicImg: true, name2: true, salary: true }));
  expect(docs[1]).toEqual(expect.objectContaining({ name2: true, salary: true, sign: true }));

  // ── Expenses shows it, locked ─────────────────────────────────────────────
  await win.evaluate(() => navigate('expenses'));
  await win.waitForSelector('.exp-payroll', { timeout: 10000 });
  expect(await win.textContent('.exp-payroll')).toContain('Advance');
  await win.evaluate(() => deleteExpense(DB.salaryAdvances[0].expenseId));
  await win.waitForTimeout(300);
  expect(await win.evaluate(() => DB.expenses.some(e => e.id === DB.salaryAdvances[0].expenseId)), 'Expenses cannot delete it').toBe(true);
  expect(await win.evaluate(() => !!document.querySelector('.modal-overlay.show #f-ecat, .modal-overlay.open #f-ecat')), 'nor open its form').toBe(false);

  // ── Payroll run: the advance comes off; pay one through the dialog ────────
  await win.evaluate(() => { navigate('payroll'); prTab('run'); });
  await win.waitForSelector('#pr-run', { timeout: 10000 });
  const row = await win.evaluate((id) => { const r = document.querySelector(`#pr-run tr[data-emp="${id}"]`); return r.textContent.replace(/\s+/g, ' '); }, e1.id);
  const row2 = await win.evaluate((id) => document.querySelector(`#pr-run tr[data-emp="${id}"]`).textContent.replace(/\s+/g, ' '), e2);
  expect(row2).toContain('Rs. 29,000');          // the Eid bonus is on Gul Khan's gross
  expect(row2).toContain('incl. Rs. 3,000 bonus');
  expect(row).toContain('− Rs. 5,000');
  expect(row).toContain('Rs. 25,000');
  await win.click(`#pr-run tr[data-emp="${e1.id}"] .btn`);
  await win.waitForSelector('#prp-slip', { timeout: 8000 });
  expect(await win.textContent('#prp-slip')).toContain('Twenty-Five Thousand Rupees only');
  await win.click('#prp-save');
  await win.waitForFunction(() => (DB.payslips || []).length === 1, null, { timeout: 8000 });
  const ps1 = await win.evaluate(() => { const p = DB.payslips[0]; const x = DB.expenses.find(e => e.id === p.expenseId);
    return { ref: p.ref, net: p.net, exp: x.amount, adv: DB.salaryAdvances[0].status }; });
  expect(ps1).toEqual({ ref: 'PS-0001', net: 25000, exp: 25000, adv: 'Recovered' });

  // The joining month is prorated on the run: 15 of the days not employed.
  const e3net = await win.evaluate(([id, M]) => prDraft(id, M).net, [e3, M]);
  expect(e3net).toBeLessThan(22000);

  // ── Pay the rest together ────────────────────────────────────────────────
  await win.evaluate(() => prToggleAll(true));
  await win.waitForSelector('#pr-paysel:not([disabled])', { timeout: 8000 });
  await win.click('#pr-paysel');
  await win.waitForSelector('#prb-save', { timeout: 8000 });
  await win.click('#prb-save');
  await win.waitForFunction(() => (DB.payslips || []).filter(p => p.status === 'Paid').length === 3, null, { timeout: 8000 });
  const month = await win.evaluate((M) => { const s = prMonthSummary(M);
    return { paid: s.paid, staff: s.staff, payroll: DB.expenses.filter(e => e.category === 'Salaries & Wages' && e.date.startsWith(M)).reduce((t, e) => t + e.amount, 0),
             gross: s.gross }; }, M);
  expect(month.paid).toBe(3);
  // What left the hostel: the gross less proration, plus the 2,000 bonus paid in hand.
  expect(month.payroll).toBe(month.gross - (22000 - e3net) + 2000);
  expect(await win.evaluate(() => DB.bonuses.map(b => b.status).sort())).toEqual(['Paid', 'Paid']);

  // ── Void a payslip: expense gone, advance open, month payable again ───────
  await win.evaluate(() => showPayslip(DB.payslips[0].id));
  await win.waitForSelector('.pr-psview', { timeout: 8000 });
  await win.click('.modal-overlay .btn-danger');
  await win.waitForSelector('#prv-reason', { timeout: 8000 });
  await win.fill('#prv-reason', 'Paid the wrong amount');
  await win.click('.modal-overlay .btn-danger');
  await win.waitForFunction(() => DB.payslips[0].status === 'Void', null, { timeout: 8000 });
  expect(await win.evaluate(() => ({ exp: DB.expenses.some(e => e.source && e.source.id === DB.payslips[0].id),
    adv: DB.salaryAdvances[0].status, payable: !prPayslipFor(DB.payslips[0].employeeId, DB.payslips[0].month) })))
    .toEqual({ exp: false, adv: 'Open', payable: true });

  // ── A warden without Manage users: may give an advance, may not pay ───────
  const warden = await win.evaluate(async (id) => {
    WARDENS.w_pay = { username: 'sara', name: 'Sara Warden', active: true, perms: { payroll: true, payments: true, add: true, edit: true } };
    const keep = [CUR_ROLE, CUR_USER];
    CUR_ROLE = 'w_pay'; CUR_USER = WARDENS.w_pay;
    const give = prGiveAdvance({ employeeId: id, amount: 1000, date: today(), reason: 'Tea money' });
    const pay = prPay(id, thisMonth(), {});
    renderPage('payroll'); await new Promise(r => setTimeout(r, 400));
    const btn = document.querySelector(`#pr-run tr[data-emp="${id}"] .btn`);
    const out = { give: give.ok, pay: pay.ok, why: pay.reason, disabled: !!(btn && btn.disabled) };
    if (give.ok) prAdvances().splice(prAdvances().indexOf(give.record), 1), DB.expenses = DB.expenses.filter(e => e.id !== give.record.expenseId);
    CUR_ROLE = keep[0]; CUR_USER = keep[1]; delete WARDENS.w_pay; await saveDB();
    return out;
  }, e1.id);
  expect(warden).toEqual({ give: true, pay: false, why: 'Only an administrator can pay salaries or void payroll records', disabled: true });

  // ── Restart: all of it is still there ─────────────────────────────────────
  await app.close();
  app = await electron.launch(launchOpts());
  win = await app.firstWindow();
  await login(win, false);
  expect(await win.evaluate(() => [DB.employees.length, DB.salaryAdvances.length, DB.payslips.length, DB.bonuses.length,
    DB.employees.find(e => e.name === 'Shaukat Masih').documents.length])).toEqual([3, 1, 3, 2, 1]);

  // ── Final settlement: the employee leaves the payroll ─────────────────────
  const settle = await win.evaluate((id) => { const r = prSettle(id, { leftDate: today(), date: today(), reason: 'Resigned' });
    return { ok: r.ok, status: prFindEmployee(id).status, reason: r.reason }; }, e2);
  expect(settle.ok, settle.reason).toBe(true);
  expect(settle.status).toBe('Left');

  await app.close();
});
