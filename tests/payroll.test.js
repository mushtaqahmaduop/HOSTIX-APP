/* Staff & Payroll, step 1: the rules (renderer/src/payroll.js).
   Plan and the owner's decisions: docs/STAFF_PAYROLL_PLAN_2026-09-30.md.

     node tests/payroll.test.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', f), 'utf8');
const el = () => ({ style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){} },
                    addEventListener(){}, appendChild(){}, querySelector: () => null, querySelectorAll: () => [] });
const sandbox = {
  console,
  sessionStorage: { getItem: () => null, setItem() {} },
  localStorage:   { getItem: () => null, setItem() {} },
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null,
              querySelectorAll: () => [], createElement: el, body: el() },
  navigator: { userAgent: 'node' },
  addEventListener() {}, removeEventListener() {},
  setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: () => 0,
  Intl, Date, Math, JSON, Chart: function () {},
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['config.js', 'utils.js', 'finance.js', 'periods.js', 'payroll.js']) vm.runInContext(R(f), sandbox, { filename: f });
vm.runInContext(`var __log = []; function logActivity(a, d, c) { __log.push({ a, d, c }); }
  var CUR_ROLE = 'warden1'; var CUR_USER = { name: 'Admin' };
  var __perms = { payroll: true, users: true }; function canDo(k) { return !!__perms[k]; }`, sandbox);
const P = vm.runInContext(`({ DB, get log() { return __log; }, perms: __perms,
  PR_EXPENSE_CAT, prAddEmployee, prUpdateEmployee, prFindEmployee, prGiveAdvance, prVoidAdvance, prAdvanceBalance,
  prPay, prVoidPayslip, prDraft, prSettle, prPayFor, prGross, prOwnsExpense, prMonthSummary, prUnemployedDays,
  prAdvanceRoom, prGiveBonus, prVoidBonus, prFindBonus, prAddDocument, prRemoveDocument, prFindPayslip,
  calcExpenses })`, sandbox);

let passed = 0, failed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
}
function reset() {
  P.DB.employees = []; P.DB.salaryAdvances = []; P.DB.payslips = []; P.DB.bonuses = []; P.DB.expenses = []; P.DB.transfers = [];
  P.DB.settings.refSeq = {}; P.DB.settings.expenseCategories = ['Electricity', 'Other'];
  P.perms.payroll = true; P.perms.users = true;
}
const emp = (over) => P.prAddEmployee(Object.assign({ name: 'Shaukat Masih', cnic: '36302-7788990-3', phone: '0322-4455667',
  role: 'Electrician / Plumber', department: 'Maintenance', joinDate: '2026-01-20', basic: 28000,
  allowances: [{ label: 'Transport', amount: 2000 }] }, over || {}));
const payrollExpense = key => P.DB.expenses.filter(e => e.category === P.PR_EXPENSE_CAT && e.date.startsWith(key))
  .reduce((s, e) => s + e.amount, 0);

console.log('\nStaff & Payroll — rules');

ok('adding an employee gives EMP-0001, the joining salary in history, and a log line', () => {
  reset();
  const r = emp();
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.record.ref, 'EMP-0001');
  assert.strictEqual(P.prGross(r.record.pay), 30000);
  assert.strictEqual(JSON.stringify(r.record.payHistory.map(h => [h.from, h.basic])), JSON.stringify([['2026-01', 28000]]));
  assert.ok(P.log.some(l => l.a === 'Employee Added' && l.c === 'Payroll'));
});

ok('an employee needs a name, a phone, a role, a joining date and a whole-rupee salary; CNIC is checked', () => {
  reset();
  assert.strictEqual(emp({ name: ' ' }).field, 'name');
  assert.strictEqual(emp({ phone: '' }).field, 'phone');
  assert.strictEqual(emp({ role: '' }).field, 'role');
  assert.strictEqual(emp({ joinDate: '2026-02-30' }).field, 'joinDate');
  assert.strictEqual(emp({ basic: '28000.5' }).field, 'basic');
  assert.strictEqual(emp({ cnic: '123' }).field, 'cnic');
  assert.ok(emp().ok);
  assert.strictEqual(emp({ name: 'Someone Else' }).field, 'cnic', 'the same CNIC twice is refused');
});

ok('THE MONEY RULE: advance is an expense on its day, salary is the NET, the month totals the gross', () => {
  reset();
  const e = emp().record;
  const a = P.prGiveAdvance({ employeeId: e.id, amount: 5000, date: '2026-09-10', reason: 'Family emergency' });
  assert.ok(a.ok, a.reason);
  assert.strictEqual(a.record.ref, 'ADV-0001');
  assert.ok(P.DB.settings.expenseCategories.includes(P.PR_EXPENSE_CAT), 'the category is added');
  const ax = P.DB.expenses.find(x => x.id === a.record.expenseId);
  assert.deepStrictEqual([ax.amount, ax.date, ax.category, ax.source.kind], [5000, '2026-09-10', P.PR_EXPENSE_CAT, 'advance']);
  assert.strictEqual(P.calcExpenses('2026-09'), 5000, 'it is in the expense totals at once');

  const p = P.prPay(e.id, '2026-09', { date: '2026-09-30' });
  assert.ok(p.ok, p.reason);
  assert.deepStrictEqual([p.record.gross, p.record.totalDeductions, p.record.net], [30000, 5000, 25000]);
  assert.strictEqual(P.DB.expenses.find(x => x.id === p.record.expenseId).amount, 25000);
  assert.strictEqual(payrollExpense('2026-09'), 30000, 'advance + net = gross, counted once');
  assert.strictEqual(P.DB.salaryAdvances[0].status, 'Recovered');
  assert.ok(P.prOwnsExpense(ax));
});

ok('an advance given after the payment date is not recovered from that payslip', () => {
  reset();
  const e = emp().record;
  P.prGiveAdvance({ employeeId: e.id, amount: 5000, date: '2026-09-10', reason: 'x' });
  const aug = P.prPay(e.id, '2026-08', { date: '2026-08-28' }).record;
  assert.strictEqual(aug.net, 30000, 'August was paid before the advance existed');
  assert.strictEqual(P.prPay(e.id, '2026-09', { date: '2026-09-30' }).record.net, 25000);
});

ok('a month is paid once', () => {
  reset();
  const e = emp().record;
  assert.ok(P.prPay(e.id, '2026-09', { date: '2026-09-30' }).ok);
  assert.strictEqual(P.prPay(e.id, '2026-09', { date: '2026-09-30' }).field, 'month');
});

ok('voiding a payslip removes its expense and gives the advance its balance back; it can be paid again', () => {
  reset();
  const e = emp().record;
  P.prGiveAdvance({ employeeId: e.id, amount: 5000, date: '2026-09-10', reason: 'x' });
  const p = P.prPay(e.id, '2026-09', { date: '2026-09-30' }).record;
  assert.strictEqual(P.prVoidPayslip(p.id, '').field, 'reason', 'a void needs a reason');
  assert.ok(P.prVoidPayslip(p.id, 'Paid the wrong amount').ok);
  assert.strictEqual(p.status, 'Void');
  assert.ok(!P.DB.expenses.some(x => x.source && x.source.id === p.id), 'the salary expense is gone');
  assert.strictEqual(P.DB.salaryAdvances[0].status, 'Open');
  assert.strictEqual(P.prAdvanceBalance(P.DB.salaryAdvances[0]), 5000);
  const again = P.prPay(e.id, '2026-09', { date: '2026-09-30' });
  assert.ok(again.ok);
  assert.strictEqual(again.record.ref, 'PS-0002', 'a voided number is never handed out again');
  assert.strictEqual(payrollExpense('2026-09'), 30000);
});

ok('instalments: 6,000 over 3 comes off 2,000 a month', () => {
  reset();
  const e = emp().record;
  P.prGiveAdvance({ employeeId: e.id, amount: 6000, date: '2026-06-05', reason: 'x', recoveryMode: 'instalments', instalments: 3 });
  const nets = ['2026-06', '2026-07', '2026-08', '2026-09'].map(m => P.prPay(e.id, m, { date: m + '-28' }).record.net);
  assert.deepStrictEqual(nets, [28000, 28000, 28000, 30000]);
  assert.strictEqual(P.DB.salaryAdvances[0].status, 'Recovered');
});

ok('NEVER ABOVE THE UPCOMING SALARY — for anyone, administrators included (owner, 2026-09-30)', () => {
  reset();
  const e = emp().record;
  const over = P.prGiveAdvance({ employeeId: e.id, amount: 30001, date: '2026-08-02', reason: 'x', overLimit: true });
  assert.strictEqual(over.code, 'overLimit');
  assert.ok(/most you can give is Rs\. 30,000/.test(over.reason), over.reason);
  assert.ok(P.prGiveAdvance({ employeeId: e.id, amount: 20000, date: '2026-08-02', reason: 'x' }).ok);
  const r2 = P.prGiveAdvance({ employeeId: e.id, amount: 10001, date: '2026-08-03', reason: 'x' });
  assert.ok(/most you can give is Rs\. 10,000 .* Rs\. 20,000 is already advanced/.test(r2.reason), r2.reason);
  assert.ok(P.prGiveAdvance({ employeeId: e.id, amount: 10000, date: '2026-08-03', reason: 'x' }).ok);
  assert.ok(/already fully advanced/.test(P.prGiveAdvance({ employeeId: e.id, amount: 1, date: '2026-08-04', reason: 'x' }).reason));
});

ok('recovery never takes pay below zero; the rest carries to the next salary', () => {
  reset();
  // Joins mid-month: the upcoming salary is the full 30,000, but half of it is prorated away.
  const e = emp({ joinDate: '2026-09-16' }).record;
  assert.ok(P.prGiveAdvance({ employeeId: e.id, amount: 30000, date: '2026-09-16', reason: 'x' }).ok);
  const sep = P.prPay(e.id, '2026-09', { date: '2026-09-30' }).record;
  assert.deepStrictEqual([sep.net, sep.carriedAdvance], [0, 15000]);
  assert.strictEqual(sep.expenseId, '', 'a zero payslip books no expense');
  assert.strictEqual(P.prPay(e.id, '2026-10', { date: '2026-10-30' }).record.net, 15000);
});

ok('a joining month is prorated by the days not employed', () => {
  reset();
  const e = emp({ joinDate: '2026-09-16' }).record;
  assert.strictEqual(P.prUnemployedDays(e, '2026-09'), 15);
  const d = P.prDraft(e.id, '2026-09');
  assert.deepStrictEqual([d.gross, d.net], [30000, 15000]);
  assert.strictEqual(P.prDraft(e.id, '2026-09', { prorate: false }).net, 30000);
  assert.strictEqual(P.prDraft(e.id, '2026-08'), null, 'not on the payroll before joining');
});

ok('a salary change needs a month and a reason, never re-prices a paid month, and is kept in history', () => {
  reset();
  const e = emp().record;
  P.prPay(e.id, '2026-09', { date: '2026-09-30' });
  const input = Object.assign({}, e, { basic: 32000, allowances: e.pay.allowances });
  assert.strictEqual(P.prUpdateEmployee(e.id, input, {}).field, 'payFrom');
  assert.strictEqual(P.prUpdateEmployee(e.id, input, { from: '2026-09', reason: 'raise' }).field, 'payFrom', 'September is paid');
  assert.strictEqual(P.prUpdateEmployee(e.id, input, { from: '2026-10' }).field, 'payReason');
  assert.ok(P.prUpdateEmployee(e.id, input, { from: '2026-10', reason: 'Annual increment' }).ok);
  assert.strictEqual(P.prGross(P.prPayFor(e, '2026-09')), 30000);
  assert.strictEqual(P.prGross(P.prPayFor(e, '2026-10')), 34000);
  assert.strictEqual(P.prDraft(e.id, '2026-10').gross, 34000);
});

ok('an advance can be voided only before anything is recovered from it; its expense goes with it', () => {
  reset();
  const e = emp().record;
  const a = P.prGiveAdvance({ employeeId: e.id, amount: 3000, date: '2026-09-02', reason: 'x' }).record;
  assert.ok(P.prVoidAdvance(a.id, 'Typed twice').ok);
  assert.strictEqual(P.calcExpenses('2026-09'), 0);
  const b = P.prGiveAdvance({ employeeId: e.id, amount: 3000, date: '2026-09-03', reason: 'x' }).record;
  P.prPay(e.id, '2026-09', { date: '2026-09-30' });
  assert.ok(/void that payslip first/.test(P.prVoidAdvance(b.id, 'no').reason));
});

ok('final settlement pays the worked days, recovers what it can and writes off the rest', () => {
  reset();
  const e = emp().record;
  P.prGiveAdvance({ employeeId: e.id, amount: 20000, date: '2026-09-01', reason: 'x' });
  const r = P.prSettle(e.id, { leftDate: '2026-09-10', date: '2026-09-10', reason: 'Resigned' });
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.payslip.gross, 30000);
  assert.strictEqual(r.payslip.deductions.find(d => d.kind === 'proration').amount, 20000, '20 of 30 days not worked');
  assert.strictEqual(r.payslip.net, 0, 'the 10,000 earned all goes to the advance');
  assert.strictEqual(JSON.stringify(r.writtenOff), JSON.stringify(['ADV-0001 Rs. 10,000']));
  assert.strictEqual(P.prFindEmployee(e.id).status, 'Left');
  assert.strictEqual(payrollExpense('2026-09'), 20000, 'the cost is the cash that left: the advance');
  assert.ok(P.prGiveAdvance({ employeeId: e.id, amount: 100, date: '2026-09-11', reason: 'x' }).field === 'employeeId');
});

ok('ADMIN PAYS ONLY: a warden with Payroll may give an advance but not pay or void', () => {
  reset();
  const e = emp().record;
  P.perms.users = false;
  assert.ok(P.prGiveAdvance({ employeeId: e.id, amount: 1000, date: '2026-09-02', reason: 'x' }).ok);
  assert.ok(/Only an administrator/.test(P.prPay(e.id, '2026-09', {}).reason));
  P.perms.payroll = false;
  assert.ok(/Payroll permission/.test(P.prAddEmployee({ name: 'X' }).reason));
});

ok('the month summary counts the staff on the payroll, paid and due', () => {
  reset();
  const a = emp().record;
  emp({ name: 'Gul Khan', cnic: '31202-6677889-1', basic: 26000, allowances: [] });
  P.prPay(a.id, '2026-09', { date: '2026-09-30' });
  const s = P.prMonthSummary('2026-09');
  assert.deepStrictEqual([s.staff, s.paid, s.unpaid, s.gross, s.paidNet, s.dueNet], [2, 1, 1, 56000, 30000, 26000]);
});

ok('a bonus WITH THE SALARY is an earning on the next payslip and in its expense, never prorated', () => {
  reset();
  const e = emp({ joinDate: '2026-09-16' }).record;
  const b = P.prGiveBonus({ employeeId: e.id, amount: 3000, type: 'Eid / festival', reason: 'Eid', date: '2026-09-20' });
  assert.ok(b.ok, b.reason);
  assert.strictEqual(b.record.ref, 'BON-0001');
  assert.strictEqual(P.calcExpenses('2026-09'), 0, 'nothing is booked until it is paid');
  const ps = P.prPay(e.id, '2026-09', { date: '2026-09-30' }).record;
  assert.strictEqual(ps.gross, 33000);
  assert.strictEqual(ps.deductions.find(d => d.kind === 'proration').amount, 15000, 'half the salary, none of the bonus');
  assert.strictEqual(ps.net, 18000);
  assert.strictEqual(P.calcExpenses('2026-09'), 18000);
  assert.strictEqual(P.prFindBonus(b.record.id).status, 'Paid');
  assert.ok(/void that payslip first/.test(P.prVoidBonus(b.record.id, 'x').reason));
  P.prVoidPayslip(ps.id, 'redo');
  assert.strictEqual(P.prFindBonus(b.record.id).status, 'Pending', 'a voided payslip gives the bonus back to wait');
});

ok('a bonus paid NOW is an expense on its day, owned by payroll, and voids with its expense', () => {
  reset();
  const e = emp().record;
  const b = P.prGiveBonus({ employeeId: e.id, amount: 5000, type: 'Performance', reason: 'Best month', date: '2026-09-12', payWith: 'now' }).record;
  const x = P.DB.expenses.find(r => r.id === b.expenseId);
  assert.deepStrictEqual([x.amount, x.date, x.source.kind, b.status], [5000, '2026-09-12', 'bonus', 'Paid']);
  assert.ok(P.prOwnsExpense(x));
  assert.strictEqual(P.prPay(e.id, '2026-09', { date: '2026-09-30' }).record.gross, 30000, 'not paid twice');
  assert.ok(P.prVoidBonus(b.id, 'Given to the wrong person').ok);
  assert.ok(!P.DB.expenses.some(r => r.id === b.expenseId));
});

ok('a bonus is an administrator\'s decision', () => {
  reset();
  const e = emp().record;
  P.perms.users = false;
  assert.ok(/Only an administrator/.test(P.prGiveBonus({ employeeId: e.id, amount: 100, reason: 'x', date: '2026-09-02' }).reason));
});

ok('documents: CNIC sides and the agreement replace their old copy, others accumulate, junk is refused', () => {
  reset();
  const e = emp().record;
  const img = 'data:image/jpeg;base64,AAAA', pdf = 'data:application/pdf;base64,JVBERi0=';
  assert.ok(P.prAddDocument(e.id, { kind: 'cnicFront', type: 'image/jpeg', data: img, name: 'front.jpg' }).ok);
  const again = P.prAddDocument(e.id, { kind: 'cnicFront', type: 'image/jpeg', data: img, name: 'front-new.jpg' });
  assert.ok(again.ok && again.replaced);
  P.prAddDocument(e.id, { kind: 'agreement', type: 'application/pdf', data: pdf, name: 'agreement.pdf' });
  P.prAddDocument(e.id, { kind: 'other', type: 'application/pdf', data: pdf, name: 'a.pdf' });
  P.prAddDocument(e.id, { kind: 'other', type: 'application/pdf', data: pdf, name: 'b.pdf' });
  assert.strictEqual(JSON.stringify(e.documents.map(d => d.kind).sort()), JSON.stringify(['agreement', 'cnicFront', 'other', 'other']));
  assert.strictEqual(e.documents.find(d => d.kind === 'cnicFront').name, 'front-new.jpg');
  assert.strictEqual(e.documents[0].addedByName, 'Admin', 'who added it is kept');
  assert.strictEqual(P.prAddDocument(e.id, { kind: 'other', type: 'text/html', data: 'data:text/html;base64,AA' }).field, 'file');
  assert.ok(P.prRemoveDocument(e.id, e.documents[0].id).ok);
  assert.ok(P.log.some(l => l.a === 'Staff Document Replaced'));
});

console.log('\n  ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
