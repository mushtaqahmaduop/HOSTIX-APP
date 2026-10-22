/* ─── HOSTYLLO — STAFF & PAYROLL: THE RULES ───────────────────────────────────
   Plan: docs/STAFF_PAYROLL_PLAN_2026-09-30.md (owner-approved, 2026-09-30).
   Every rule lives here; the page (modules/payroll-page.js) only draws and
   collects. Plain globals, like owner-funds.js, so tests/payroll.test.js loads
   this file into a sandbox and pins the arithmetic without a screen.

   THE MONEY RULE — one truth, in DB.expenses
     · An ADVANCE is an expense the day the cash leaves: Salaries & Wages,
       "Advance — <name>".
     · A SALARY is an expense of the NET actually paid, on the day it is paid:
       gross − advance recovered − other deductions.
     · So an employee's cost for a month is exactly the gross, counted once:
       5,000 advance on the 10th + 25,000 net on pay day = 30,000.
     · Payroll OWNS those expense rows (`source: {kind, id}`). Expenses shows
       them with a Payroll badge and refuses to edit or delete them; they change
       only here, which is how the two screens can never disagree.
     · Nothing is deleted. A payslip or an advance is VOIDED with a reason; its
       expense row is removed at the same moment and the void stays on file,
       with the figures it carried, in the activity log.

   OWNER DECISIONS (plan §9)
     1. Admin pays only. Paying a salary, voiding and final settlement need an
        account that manages users; payroll never touches the warden ledger or
        any handover. A warden with the Payroll permission may record an advance.
     2. An advance is recovered in full from the next salary by default;
        instalments are the alternative.
     3. Absence deductions wait for attendance; "other deductions" covers a
        one-off meanwhile.
     4. Every hostel has it (control-plane flag `payroll`, default on).
     5. An employee may be linked to one app login (`accountId`).

   REFERENCES are never reused (refSeqTake, restore high-water): EMP-0001,
   ADV-0001, PS-0001.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const PR_EXPENSE_CAT = 'Salaries & Wages';
const PR_STATUSES    = ['Active', 'On leave', 'Left'];
const PR_TYPES       = ['Full-time', 'Part-time', 'Contract'];
const PR_ROLES_DEFAULT = ['Warden', 'Assistant Warden', 'Accountant', 'Cook', 'Kitchen Helper',
  'Security Guard', 'Cleaner', 'Electrician / Plumber', 'Driver', 'Office Assistant'];
const PR_DEPTS_DEFAULT = ['Management', 'Kitchen', 'Security', 'Housekeeping', 'Maintenance', 'Office'];
const PR_NAME_MAX = 80, PR_TEXT_MAX = 200;

/* ── small helpers ─────────────────────────────────────────────────────────── */
const _prMoney = v => (typeof money === 'function' ? money(v) : Math.round(Number(v) || 0));
const _prText  = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || PR_TEXT_MAX);
/* A real calendar day. new Date('2026-02-30') quietly becomes 2 March, so the
   date is rebuilt from its parts and must come back unchanged. */
function _prIsDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return false;
  const x = new Date(+m[1], +m[2] - 1, +m[3]);
  return x.getFullYear() === +m[1] && x.getMonth() === +m[2] - 1 && x.getDate() === +m[3];
}
const _prIsMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const _prToday = () => (typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10));
const _prUid = () => (typeof uid === 'function' ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
const _prFail = (field, reason, code) => (code ? { ok: false, field, reason, code } : { ok: false, field, reason });
function _prActor() {
  return {
    by: (typeof CUR_ROLE !== 'undefined' && CUR_ROLE) || null,
    byName: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) || '',
  };
}
function _prLog(what, detail) { if (typeof logActivity === 'function') logActivity(what, detail, 'Payroll'); }
const _prRs = n => (typeof fmtPKR === 'function' ? fmtPKR(n) : 'Rs. ' + n);
function _prMonthDays(m) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); }
function _prMonthLabel(m) { return typeof monthLabel === 'function' ? monthLabel(m) : m; }

/* The collections, created on first use (and by _initDBFields). */
function prEmployees() { if (!Array.isArray(DB.employees)) DB.employees = []; return DB.employees; }
function prAdvances()  { if (!Array.isArray(DB.salaryAdvances)) DB.salaryAdvances = []; return DB.salaryAdvances; }
function prPayslips()  { if (!Array.isArray(DB.payslips)) DB.payslips = []; return DB.payslips; }

/* ── who may do what ─────────────────────────────────────────────────────── */
function prAllowed() {
  const feat = typeof hasFeature !== 'function' || hasFeature('payroll');
  const perm = typeof canDo !== 'function' || canDo('payroll');
  return feat && perm;
}
/** Paying and voiding are admin actions (decision 1): Payroll AND Manage users. */
function prIsAdmin() { return prAllowed() && (typeof canDo !== 'function' || canDo('users')); }
function _prGate(admin) {
  if (!prAllowed()) return _prFail(null, 'Your account does not have the Payroll permission');
  if (admin && !prIsAdmin()) return _prFail(null, 'Only an administrator can pay salaries or void payroll records');
  return null;
}

/* ── settings lists ──────────────────────────────────────────────────────── */
function prRoles() {
  const s = DB.settings || (DB.settings = {});
  if (!Array.isArray(s.staffRoles) || !s.staffRoles.length) s.staffRoles = PR_ROLES_DEFAULT.slice();
  return s.staffRoles;
}
function prDepartments() {
  const s = DB.settings || (DB.settings = {});
  if (!Array.isArray(s.staffDepartments) || !s.staffDepartments.length) s.staffDepartments = PR_DEPTS_DEFAULT.slice();
  return s.staffDepartments;
}
/** The expense category payroll writes to, added to the hostel's list if missing. */
function prEnsureExpenseCategory() {
  const s = DB.settings || (DB.settings = {});
  if (!Array.isArray(s.expenseCategories)) s.expenseCategories = [];
  if (!s.expenseCategories.includes(PR_EXPENSE_CAT)) {
    const i = s.expenseCategories.indexOf('Other');
    if (i >= 0) s.expenseCategories.splice(i, 0, PR_EXPENSE_CAT); else s.expenseCategories.push(PR_EXPENSE_CAT);
  }
  return PR_EXPENSE_CAT;
}

/* ── employees ───────────────────────────────────────────────────────────── */
function prFindEmployee(id) { return prEmployees().find(e => e.id === id) || null; }

function prAllowanceTotal(list) { return (list || []).reduce((s, a) => s + _prMoney(a && a.amount), 0); }
function prGross(pay) { return pay ? _prMoney(pay.basic) + prAllowanceTotal(pay.allowances) : 0; }

/** The pay structure in force for month `m`: the latest history entry from that month or before. */
function prPayFor(emp, m) {
  if (!emp) return null;
  const hist = (emp.payHistory || []).filter(h => h && _prIsMonth(h.from) && h.from <= m)
    .sort((a, b) => a.from.localeCompare(b.from));
  const h = hist[hist.length - 1];
  return h ? { basic: h.basic, allowances: h.allowances || [] } : (emp.pay || null);
}

function _prValidAllowances(list) {
  const out = [];
  for (const a of (list || [])) {
    const label = _prText(a && a.label, 60);
    const raw = a && a.amount;
    if (!label && (raw === '' || raw == null || Number(raw) === 0)) continue;   // an empty row is ignored
    if (!label) return _prFail('allowances', 'Name every allowance');
    const n = Number(String(raw).replace(/,/g, ''));
    if (!isFinite(n) || n < 0 || Math.round(n) !== n) return _prFail('allowances', 'Allowance "' + label + '" needs a whole-rupee amount');
    out.push({ label, amount: n });
  }
  return { ok: true, value: out };
}

function prValidateEmployee(input, existing) {
  const i = input || {};
  const name = _prText(i.name, PR_NAME_MAX);
  if (!name) return _prFail('name', 'Enter the employee\'s name');
  const cnic = _prText(i.cnic, 20);
  if (cnic && !/^\d{5}-?\d{7}-?\d$/.test(cnic)) return _prFail('cnic', 'CNIC must be 13 digits, as 12345-1234567-1');
  const cnicNorm = cnic ? cnic.replace(/-/g, '').replace(/^(\d{5})(\d{7})(\d)$/, '$1-$2-$3') : '';
  if (cnicNorm && prEmployees().some(e => e.cnic === cnicNorm && e.id !== (existing && existing.id) && e.status !== 'Left'))
    return _prFail('cnic', 'Another current employee has this CNIC');
  const phone = _prText(i.phone, 20);
  if (!phone) return _prFail('phone', 'Enter a phone number');
  const role = _prText(i.role, 60);
  if (!role) return _prFail('role', 'Pick a role');
  const joinDate = String(i.joinDate || '');
  if (!_prIsDate(joinDate)) return _prFail('joinDate', 'Pick the joining date');
  const basicRaw = String(i.basic == null ? '' : i.basic).replace(/,/g, '').trim();
  const basic = Number(basicRaw);
  if (basicRaw === '' || !isFinite(basic)) return _prFail('basic', 'Enter the basic salary');
  if (basic < 0 || Math.round(basic) !== basic) return _prFail('basic', 'Enter the salary in whole rupees');
  const al = _prValidAllowances(i.allowances);
  if (!al.ok) return al;
  const payDay = Math.min(28, Math.max(1, parseInt(i.payDay, 10) || 1));
  const type = PR_TYPES.includes(i.employmentType) ? i.employmentType : 'Full-time';
  const status = PR_STATUSES.includes(i.status) ? i.status : 'Active';
  const accountId = i.accountId ? String(i.accountId) : '';
  if (accountId && prEmployees().some(e => e.accountId === accountId && e.id !== (existing && existing.id) && e.status !== 'Left'))
    return _prFail('accountId', 'That login is already linked to another employee');
  return { ok: true, value: {
    name, fatherName: _prText(i.fatherName, PR_NAME_MAX), cnic: cnicNorm, phone,
    altPhone: _prText(i.altPhone, 20), emergency: _prText(i.emergency, 120), address: _prText(i.address),
    role, department: _prText(i.department, 60), employmentType: type, shift: _prText(i.shift, 40),
    joinDate, status, accountId, photo: typeof i.photo === 'string' ? i.photo : '',
    notes: _prText(i.notes, 500),
    pay: { basic, allowances: al.value, payDay, method: _prText(i.method || 'Cash', 40) || 'Cash',
           accountTitle: _prText(i.accountTitle, 80), accountNo: _prText(i.accountNo, 40) },
  } };
}

function prAddEmployee(input) {
  const gate = _prGate(false); if (gate) return gate;
  const v = prValidateEmployee(input, null); if (!v.ok) return v;
  const who = _prActor();
  const highest = prEmployees().reduce((m, e) => Math.max(m, Number(String(e.ref || '').replace(/\D/g, '')) || 0), 0);
  const seq = typeof refSeqTake === 'function' ? refSeqTake('emp', highest) : highest + 1;
  const rec = Object.assign({ id: 'emp_' + _prUid(), ref: 'EMP-' + String(seq).padStart(4, '0') }, v.value, {
    payHistory: [{ from: v.value.joinDate.slice(0, 7), basic: v.value.pay.basic, allowances: v.value.pay.allowances,
                   reason: 'Joining salary', by: who.byName, at: new Date().toISOString() }],
    addedBy: who.by, addedByName: who.byName, createdAt: new Date().toISOString(),
  });
  if (rec.status === 'Left') rec.status = 'Active';
  prEmployees().push(rec);
  _prLog('Employee Added', rec.ref + ' ' + rec.name + ' · ' + rec.role);
  return { ok: true, record: rec };
}

/** Edit. A change to basic or allowances needs a reason and an effective month,
    and is kept in payHistory, so a past month's payslip is never re-priced. */
function prUpdateEmployee(id, input, change) {
  const gate = _prGate(false); if (gate) return gate;
  const e = prFindEmployee(id); if (!e) return _prFail(null, 'That employee could not be found');
  const v = prValidateEmployee(Object.assign({}, input, { status: e.status === 'Left' ? 'Left' : input.status }), e);
  if (!v.ok) return v;
  const payChanged = v.value.pay.basic !== e.pay.basic
    || JSON.stringify(v.value.pay.allowances) !== JSON.stringify(e.pay.allowances || []);
  if (payChanged) {
    const c = change || {};
    const from = String(c.from || '');
    if (!_prIsMonth(from)) return _prFail('payFrom', 'Say from which month the new salary applies');
    if (from < e.joinDate.slice(0, 7)) return _prFail('payFrom', 'The new salary cannot start before the joining month');
    const paid = prPayslips().filter(p => p.employeeId === e.id && p.status !== 'Void' && p.month >= from);
    if (paid.length) return _prFail('payFrom', _prMonthLabel(paid[0].month) + ' is already paid — start the new salary after it, or void that payslip first');
    const reason = _prText(c.reason, 120);
    if (!reason) return _prFail('payReason', 'Say why the salary changed (e.g. annual increment)');
    const who = _prActor();
    e.payHistory = (e.payHistory || []).filter(h => h.from !== from);
    e.payHistory.push({ from, basic: v.value.pay.basic, allowances: v.value.pay.allowances, reason, by: who.byName, at: new Date().toISOString() });
    _prLog('Salary Changed', e.ref + ' ' + e.name + ': ' + _prRs(prGross(e.pay)) + ' → ' + _prRs(prGross(v.value.pay)) + ' from ' + _prMonthLabel(from) + ' (' + reason + ')');
  }
  const keepStatus = e.status;
  Object.assign(e, v.value, { updatedAt: new Date().toISOString() });
  if (keepStatus === 'Left') e.status = 'Left';
  _prLog('Employee Updated', e.ref + ' ' + e.name);
  return { ok: true, record: e };
}

/* ── advances ────────────────────────────────────────────────────────────── */
function prFindAdvance(id) { return prAdvances().find(a => a.id === id) || null; }
function prAdvanceRecovered(a) {
  return (a.recovered || []).reduce((s, r) => s + _prMoney(r.amount), 0) + _prMoney(a.writtenOff);
}
function prAdvanceBalance(a) {
  if (!a || a.status === 'Void') return 0;
  return Math.max(0, _prMoney(a.amount) - prAdvanceRecovered(a));
}
function prOpenAdvances(empId) {
  return prAdvances().filter(a => a.employeeId === empId && a.status === 'Open' && prAdvanceBalance(a) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}
function prAdvanceOutstanding(empId) {
  return prOpenAdvances(empId).reduce((s, a) => s + prAdvanceBalance(a), 0);
}
/** What this advance asks of the next payslip: the whole balance, or one instalment. */
function prAdvanceDue(a) {
  const bal = prAdvanceBalance(a);
  if (!bal) return 0;
  if (a.recovery && a.recovery.mode === 'instalments') {
    const n = Math.max(1, parseInt(a.recovery.instalments, 10) || 1);
    return Math.min(bal, Math.ceil(_prMoney(a.amount) / n));
  }
  return bal;
}

/* ── THE UPCOMING SALARY (owner, 2026-09-30: "never above upcoming salary") ──
   An advance is part of the next salary, paid early. So the most anyone can be
   advanced is that salary — the gross of the first month not yet paid — less
   what is already advanced and not yet recovered. No override, for anyone. */
function _prNextMonth(m) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function prUpcomingMonth(emp) {
  let m = (typeof thisMonth === 'function' ? thisMonth() : _prToday().slice(0, 7));
  if (m < emp.joinDate.slice(0, 7)) m = emp.joinDate.slice(0, 7);
  for (let guard = 0; guard < 36 && prPayslipFor(emp.id, m); guard++) m = _prNextMonth(m);
  return m;
}
function prAdvanceRoom(emp) {
  const month = prUpcomingMonth(emp);
  const gross = prGross(prPayFor(emp, month) || emp.pay);
  const open = prAdvanceOutstanding(emp.id);
  return { month, gross, open, room: Math.max(0, gross - open) };
}

function prValidateAdvance(input) {
  const i = input || {};
  const emp = prFindEmployee(i.employeeId);
  if (!emp) return _prFail('employeeId', 'Pick the employee');
  if (emp.status === 'Left') return _prFail('employeeId', emp.name + ' has left — settle instead');
  const raw = String(i.amount == null ? '' : i.amount).replace(/,/g, '').trim();
  const n = Number(raw);
  if (raw === '' || !isFinite(n)) return _prFail('amount', 'Enter the amount');
  if (n <= 0) return _prFail('amount', 'Enter an amount greater than zero');
  if (Math.round(n) !== n) return _prFail('amount', 'Enter whole rupees');
  const lim = prAdvanceRoom(emp);
  if (n > lim.room) {
    return _prFail('amount', lim.room <= 0
      ? emp.name + '\'s ' + _prMonthLabel(lim.month) + ' salary (' + _prRs(lim.gross) + ') is already fully advanced'
      : 'The most you can give is ' + _prRs(lim.room) + ' — ' + emp.name + '\'s ' + _prMonthLabel(lim.month) + ' salary is '
        + _prRs(lim.gross) + (lim.open ? ' and ' + _prRs(lim.open) + ' is already advanced' : ''), 'overLimit');
  }
  const date = String(i.date || '');
  if (!_prIsDate(date)) return _prFail('date', 'Pick the date the money was given');
  if (date < emp.joinDate) return _prFail('date', 'That is before ' + emp.name + ' joined');
  const reason = _prText(i.reason, 120);
  if (!reason) return _prFail('reason', 'Say what the advance is for');
  const mode = i.recoveryMode === 'instalments' ? 'instalments' : 'next';
  const instalments = mode === 'instalments' ? parseInt(i.instalments, 10) : 1;
  if (mode === 'instalments' && !(instalments >= 2 && instalments <= 12)) return _prFail('instalments', 'Choose 2 to 12 instalments');
  return { ok: true, value: { employee: emp, amount: n, date, reason,
    method: _prText(i.method || 'Cash', 40) || 'Cash', recovery: { mode, instalments } } };
}

/** Give an advance: the advance and its expense, together. */
function prGiveAdvance(input) {
  const gate = _prGate(false); if (gate) return gate;
  const v = prValidateAdvance(input); if (!v.ok) return v;
  const emp = v.value.employee, who = _prActor();
  const highest = prAdvances().reduce((m, a) => Math.max(m, Number(String(a.ref || '').replace(/\D/g, '')) || 0), 0);
  const seq = typeof refSeqTake === 'function' ? refSeqTake('adv', highest) : highest + 1;
  const adv = {
    id: 'adv_' + _prUid(), ref: 'ADV-' + String(seq).padStart(4, '0'),
    employeeId: emp.id, employeeName: emp.name, amount: v.value.amount, date: v.value.date,
    method: v.value.method, reason: v.value.reason, recovery: v.value.recovery,
    recovered: [], writtenOff: 0, status: 'Open',
    givenBy: who.by, givenByName: who.byName, createdAt: new Date().toISOString(),
  };
  adv.expenseId = _prWriteExpense({ kind: 'advance', id: adv.id }, v.value.amount, v.value.date, v.value.method,
    'Advance — ' + emp.name + ' · ' + adv.ref + ' · ' + v.value.reason, emp.name);
  prAdvances().push(adv);
  _prLog('Salary Advance', adv.ref + ' · ' + emp.name + ' · ' + _prRs(adv.amount) + ' (' + adv.reason + ')');
  return { ok: true, record: adv };
}

/** Void an advance that nothing has been recovered from yet. */
function prVoidAdvance(id, reason) {
  const gate = _prGate(true); if (gate) return gate;
  const a = prFindAdvance(id); if (!a) return _prFail(null, 'That advance could not be found');
  if (a.status === 'Void') return _prFail(null, 'That advance is already void');
  if ((a.recovered || []).length) return _prFail(null, 'Part of this advance has been recovered on a payslip — void that payslip first');
  const why = _prText(reason, 120); if (!why) return _prFail('reason', 'Say why the advance is being voided');
  _prDropExpense(a.expenseId);
  Object.assign(a, { status: 'Void', voidReason: why, voidedAt: new Date().toISOString(), voidedBy: _prActor().byName, expenseId: '' });
  _prLog('Advance Voided', a.ref + ' · ' + (a.employeeName || '') + ' · ' + _prRs(a.amount) + ' — ' + why);
  return { ok: true, record: a };
}

/* ── payslips ────────────────────────────────────────────────────────────── */
function prFindPayslip(id) { return prPayslips().find(p => p.id === id) || null; }
function prPayslipFor(empId, m) { return prPayslips().find(p => p.employeeId === empId && p.month === m && p.status !== 'Void') || null; }

/** Days in month `m` the employee was not employed (joined after the 1st, or left before the end). */
function prUnemployedDays(emp, m) {
  const dim = _prMonthDays(m), first = m + '-01', last = m + '-' + String(dim).padStart(2, '0');
  const from = emp.joinDate > first ? emp.joinDate : first;
  const to = emp.leftDate && emp.leftDate < last ? emp.leftDate : last;
  if (from > last || to < first || to < from) return dim;
  const d = s => Number(s.slice(8, 10));
  return dim - (d(to) - d(from) + 1);
}

/** Is `emp` on the payroll for month m at all? */
function prOnPayroll(emp, m) {
  if (!emp || !_prIsMonth(m)) return false;
  if (emp.joinDate.slice(0, 7) > m) return false;
  if (emp.leftDate && emp.leftDate.slice(0, 7) < m) return false;
  return true;
}

/** The payslip that WOULD be paid now: gross, proration, advance recovery, other, net.
    `opts.prorate` (default true) takes the days not employed off a joining or leaving
    month; `opts.other` is a list of {label, amount} one-off deductions;
    `opts.recoverAll` recovers every open advance in full (final settlement);
    `opts.date` is the payment date — an advance given AFTER it is not in this
    payslip's hands and waits for the next one (default today). */
function prDraft(empId, m, opts) {
  const o = opts || {};
  const emp = prFindEmployee(empId);
  if (!emp || !prOnPayroll(emp, m)) return null;
  const pay = prPayFor(emp, m) || emp.pay;
  const base = prGross(pay);
  const payDate = _prIsDate(o.date) ? o.date : _prToday();
  /* Bonuses waiting for this salary are earnings on it — given on or before the
     payment date (a settlement takes every one still waiting). */
  const bonuses = prPendingBonuses(empId).filter(b => o.recoverAll || String(b.date) <= payDate)
    .map(b => ({ label: 'Bonus — ' + b.type + ' (' + b.ref + ')', amount: _prMoney(b.amount), bonusId: b.id }));
  const gross = base + bonuses.reduce((s, b) => s + b.amount, 0);
  const deductions = [];
  const days = prUnemployedDays(emp, m), dim = _prMonthDays(m);
  if (o.prorate !== false && days > 0) {
    // Proration is of the salary only — a bonus is given whole.
    deductions.push({ kind: 'proration', label: 'Not employed ' + days + ' of ' + dim + ' days', amount: _prMoney(base * days / dim) });
  }
  for (const x of (o.other || [])) {
    const amt = _prMoney(x && x.amount);
    const label = _prText(x && x.label, 60);
    if (amt > 0) deductions.push({ kind: 'other', label: label || 'Other deduction', amount: amt });
  }
  let room = gross - deductions.reduce((s, x) => s + x.amount, 0);
  for (const a of prOpenAdvances(empId).filter(x => String(x.date) <= payDate)) {
    if (room <= 0) break;
    const want = o.recoverAll ? prAdvanceBalance(a) : prAdvanceDue(a);
    const take = Math.min(want, room);
    if (take > 0) {
      deductions.push({ kind: 'advance', label: 'Advance ' + a.ref, amount: take, advanceId: a.id });
      room -= take;
    }
  }
  const total = deductions.reduce((s, x) => s + x.amount, 0);
  return {
    employeeId: emp.id, month: m, basic: _prMoney(pay.basic), allowances: (pay.allowances || []).map(a => ({ label: a.label, amount: _prMoney(a.amount) })),
    bonuses, gross, deductions, totalDeductions: total, net: Math.max(0, gross - total),
    carriedAdvance: prAdvanceOutstanding(empId) - deductions.filter(d => d.kind === 'advance').reduce((s, d) => s + d.amount, 0),
  };
}

/** Pay one employee for month m: the payslip, its expense, and the advance recoveries — together. */
function prPay(empId, m, input) {
  const gate = _prGate(true); if (gate) return gate;
  const i = input || {};
  const emp = prFindEmployee(empId); if (!emp) return _prFail(null, 'That employee could not be found');
  if (!_prIsMonth(m)) return _prFail('month', 'Pick the month being paid');
  if (!prOnPayroll(emp, m)) return _prFail('month', emp.name + ' was not employed in ' + _prMonthLabel(m));
  if (prPayslipFor(empId, m)) return _prFail('month', emp.name + ' is already paid for ' + _prMonthLabel(m));
  const date = String(i.date || _prToday());
  if (!_prIsDate(date)) return _prFail('date', 'Pick the payment date');
  const d = prDraft(empId, m, { prorate: i.prorate, other: i.other, recoverAll: i.recoverAll, date });
  const who = _prActor();
  const highest = prPayslips().reduce((mx, p) => Math.max(mx, Number(String(p.ref || '').replace(/\D/g, '')) || 0), 0);
  const seq = typeof refSeqTake === 'function' ? refSeqTake('ps', highest) : highest + 1;
  const ps = Object.assign({ id: 'ps_' + _prUid(), ref: 'PS-' + String(seq).padStart(4, '0') }, d, {
    employeeName: emp.name, employeeRef: emp.ref, role: emp.role, department: emp.department,
    paidDate: date, method: _prText(i.method || emp.pay.method || 'Cash', 40) || 'Cash',
    note: _prText(i.note, 200), status: 'Paid', paidBy: who.by, paidByName: who.byName,
    createdAt: new Date().toISOString(),
  });
  for (const x of ps.deductions.filter(x => x.kind === 'advance')) {
    const a = prFindAdvance(x.advanceId);
    if (!a) continue;
    a.recovered = (a.recovered || []).concat([{ payslipId: ps.id, amount: x.amount, month: m }]);
    if (prAdvanceBalance(a) === 0) a.status = 'Recovered';
  }
  for (const x of (ps.bonuses || [])) {
    const b = prFindBonus(x.bonusId);
    if (b) Object.assign(b, { status: 'Paid', payslipId: ps.id, paidDate: date });
  }
  ps.expenseId = ps.net > 0
    ? _prWriteExpense({ kind: 'salary', id: ps.id }, ps.net, date, ps.method,
        'Salary — ' + emp.name + ' · ' + _prMonthLabel(m) + ' · ' + ps.ref, emp.name)
    : '';
  prPayslips().push(ps);
  _prLog('Salary Paid', ps.ref + ' · ' + emp.name + ' · ' + _prMonthLabel(m) + ' · net ' + _prRs(ps.net)
    + (ps.totalDeductions ? ' (gross ' + _prRs(ps.gross) + ')' : ''));
  return { ok: true, record: ps };
}

/** Void a paid payslip: its expense goes, its advance recoveries are undone. */
function prVoidPayslip(id, reason) {
  const gate = _prGate(true); if (gate) return gate;
  const ps = prFindPayslip(id); if (!ps) return _prFail(null, 'That payslip could not be found');
  if (ps.status === 'Void') return _prFail(null, 'That payslip is already void');
  const why = _prText(reason, 120); if (!why) return _prFail('reason', 'Say why the payslip is being voided');
  const emp = prFindEmployee(ps.employeeId);
  // Voiding a final settlement brings the employee back: the leaving is undone with it.
  if (emp && emp.status === 'Left' && ps.final) { emp.status = 'Active'; delete emp.leftDate; delete emp.leftReason; }
  _prDropExpense(ps.expenseId);
  for (const a of prAdvances()) {
    const before = (a.recovered || []).length;
    a.recovered = (a.recovered || []).filter(r => r.payslipId !== ps.id);
    if (a.recovered.length !== before && a.status === 'Recovered' && prAdvanceBalance(a) > 0) a.status = 'Open';
  }
  for (const b of prBonuses()) {
    if (b.payslipId === ps.id && b.status === 'Paid') { b.status = 'Pending'; delete b.payslipId; delete b.paidDate; }
  }
  Object.assign(ps, { status: 'Void', voidReason: why, voidedAt: new Date().toISOString(), voidedBy: _prActor().byName, expenseId: '' });
  _prLog('Payslip Voided', ps.ref + ' · ' + (ps.employeeName || '') + ' · ' + _prMonthLabel(ps.month) + ' · ' + _prRs(ps.net) + ' — ' + why);
  return { ok: true, record: ps };
}

/** Final settlement: pay the leaving month's worked days, recover every open advance,
    and mark the employee Left. Whatever cannot be recovered is written off (the
    cash already left as an expense, so nothing more is booked). */
function prSettle(empId, input) {
  const gate = _prGate(true); if (gate) return gate;
  const i = input || {};
  const emp = prFindEmployee(empId); if (!emp) return _prFail(null, 'That employee could not be found');
  if (emp.status === 'Left') return _prFail(null, emp.name + ' has already left');
  const leftDate = String(i.leftDate || '');
  if (!_prIsDate(leftDate)) return _prFail('leftDate', 'Pick the last working day');
  if (leftDate < emp.joinDate) return _prFail('leftDate', 'That is before the joining date');
  const m = leftDate.slice(0, 7);
  const later = prPayslips().find(p => p.employeeId === emp.id && p.status !== 'Void' && p.month > m);
  if (later) return _prFail('leftDate', _prMonthLabel(later.month) + ' is already paid, after the last working day');
  emp.leftDate = leftDate;
  let ps = prPayslipFor(emp.id, m);
  if (!ps) {
    const r = prPay(emp.id, m, Object.assign({}, i, { recoverAll: true, prorate: true }));
    if (!r.ok) { delete emp.leftDate; return r; }
    ps = r.record; ps.final = true;
  }
  const writtenOff = [];
  for (const a of prOpenAdvances(emp.id)) {
    const bal = prAdvanceBalance(a);
    if (bal > 0 && i.writeOff !== false) { a.writtenOff = _prMoney(a.writtenOff) + bal; a.status = 'Recovered'; writtenOff.push(a.ref + ' ' + _prRs(bal)); }
  }
  // The leaving month was already paid: a bonus still waiting is paid now, on its own.
  for (const b of prPendingBonuses(emp.id)) _prPayBonusNow(b, String(i.date || _prToday()), b.method || emp.pay.method);
  emp.status = 'Left';
  emp.leftReason = _prText(i.reason, 120);
  _prLog('Employee Settled', emp.ref + ' ' + emp.name + ' · left ' + leftDate + ' · final ' + _prRs(ps.net)
    + (writtenOff.length ? ' · written off ' + writtenOff.join(', ') : ''));
  return { ok: true, record: emp, payslip: ps, writtenOff };
}

/* ── bonuses (owner, 2026-09-30: "bonuses for rewarding or any extra money") ─
   A reward decision, so an administrator's. Paid one of two ways:
     · WITH THE NEXT SALARY (default): an earning on that payslip, so it is in
       the salary's own expense, and a void of the payslip sends it back to wait;
     · NOW: an expense on the day, like an advance — but never recovered. */
const PR_BONUS_TYPES = ['Performance', 'Eid / festival', 'Overtime', 'Attendance', 'Reward', 'Other'];
function prBonuses() { if (!Array.isArray(DB.bonuses)) DB.bonuses = []; return DB.bonuses; }
function prFindBonus(id) { return prBonuses().find(b => b.id === id) || null; }
function prPendingBonuses(empId) {
  return prBonuses().filter(b => b.employeeId === empId && b.status === 'Pending')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function prValidateBonus(input) {
  const i = input || {};
  const emp = prFindEmployee(i.employeeId);
  if (!emp) return _prFail('employeeId', 'Pick the employee');
  if (emp.status === 'Left') return _prFail('employeeId', emp.name + ' has left');
  const raw = String(i.amount == null ? '' : i.amount).replace(/,/g, '').trim();
  const n = Number(raw);
  if (raw === '' || !isFinite(n)) return _prFail('amount', 'Enter the amount');
  if (n <= 0) return _prFail('amount', 'Enter an amount greater than zero');
  if (Math.round(n) !== n) return _prFail('amount', 'Enter whole rupees');
  const type = PR_BONUS_TYPES.includes(i.type) ? i.type : 'Reward';
  const reason = _prText(i.reason, 120);
  if (!reason) return _prFail('reason', 'Say what the bonus is for');
  const date = String(i.date || '');
  if (!_prIsDate(date)) return _prFail('date', 'Pick the date');
  if (date < emp.joinDate) return _prFail('date', 'That is before ' + emp.name + ' joined');
  const payWith = i.payWith === 'now' ? 'now' : 'salary';
  return { ok: true, value: { employee: emp, amount: n, type, reason, date, payWith, method: _prText(i.method || 'Cash', 40) || 'Cash' } };
}
function _prPayBonusNow(b, date, method) {
  b.expenseId = _prWriteExpense({ kind: 'bonus', id: b.id }, b.amount, date, method || 'Cash',
    'Bonus — ' + b.employeeName + ' · ' + b.ref + ' · ' + b.type + ' · ' + b.reason, b.employeeName);
  Object.assign(b, { status: 'Paid', paidDate: date, method: method || b.method || 'Cash', paidNow: true });
}
function prGiveBonus(input) {
  const gate = _prGate(true); if (gate) return gate;
  const v = prValidateBonus(input); if (!v.ok) return v;
  const emp = v.value.employee, who = _prActor();
  const highest = prBonuses().reduce((m, b) => Math.max(m, Number(String(b.ref || '').replace(/\D/g, '')) || 0), 0);
  const seq = typeof refSeqTake === 'function' ? refSeqTake('bon', highest) : highest + 1;
  const b = { id: 'bon_' + _prUid(), ref: 'BON-' + String(seq).padStart(4, '0'), employeeId: emp.id, employeeName: emp.name,
    amount: v.value.amount, type: v.value.type, reason: v.value.reason, date: v.value.date, payWith: v.value.payWith,
    method: v.value.method, status: 'Pending', givenBy: who.by, givenByName: who.byName, createdAt: new Date().toISOString() };
  if (b.payWith === 'now') _prPayBonusNow(b, b.date, b.method);
  prBonuses().push(b);
  _prLog('Bonus Given', b.ref + ' · ' + emp.name + ' · ' + _prRs(b.amount) + ' · ' + b.type
    + (b.payWith === 'now' ? ' · paid now' : ' · with next salary'));
  return { ok: true, record: b };
}
function prVoidBonus(id, reason) {
  const gate = _prGate(true); if (gate) return gate;
  const b = prFindBonus(id); if (!b) return _prFail(null, 'That bonus could not be found');
  if (b.status === 'Void') return _prFail(null, 'That bonus is already void');
  if (b.payslipId) return _prFail(null, 'This bonus was paid on payslip ' + ((prFindPayslip(b.payslipId) || {}).ref || '') + ' — void that payslip first');
  const why = _prText(reason, 120); if (!why) return _prFail('reason', 'Say why the bonus is being voided');
  _prDropExpense(b.expenseId);
  Object.assign(b, { status: 'Void', voidReason: why, voidedAt: new Date().toISOString(), voidedBy: _prActor().byName, expenseId: '' });
  _prLog('Bonus Voided', b.ref + ' · ' + b.employeeName + ' · ' + _prRs(b.amount) + ' — ' + why);
  return { ok: true, record: b };
}

/* ── documents (owner, 2026-09-30: CNIC front and back and the agreement,
   "for records and legal purposes") ─────────────────────────────────────────
   Kept on the employee, each with who added it and when. A CNIC side or the
   agreement REPLACES the one before it (one current copy of each), and the
   replacement is logged; "Other" documents accumulate. The file itself is a
   data URL, read and sized by the page before it reaches here. */
const PR_DOC_KINDS = { cnicFront: 'CNIC — front', cnicBack: 'CNIC — back', agreement: 'Signed agreement', other: 'Other document' };
const PR_DOC_MAX = 8 * 1024 * 1024;
function prDocLabel(kind) { return PR_DOC_KINDS[kind] || 'Document'; }
function prAddDocument(empId, doc) {
  const gate = _prGate(false); if (gate) return gate;
  const e = prFindEmployee(empId); if (!e) return _prFail(null, 'That employee could not be found');
  const d = doc || {};
  const kind = PR_DOC_KINDS[d.kind] ? d.kind : 'other';
  const type = String(d.type || '');
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(type)) return _prFail('file', 'Attach an image or a PDF');
  if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(String(d.data || ''))) return _prFail('file', 'That file could not be read');
  if (String(d.data).length > PR_DOC_MAX * 1.4) return _prFail('file', 'That file is larger than 8 MB');
  const who = _prActor();
  if (!Array.isArray(e.documents)) e.documents = [];
  const replaced = kind !== 'other' ? e.documents.filter(x => x.kind === kind) : [];
  if (replaced.length) e.documents = e.documents.filter(x => x.kind !== kind);
  const rec = { id: 'doc_' + _prUid(), kind, name: _prText(d.name, 120) || prDocLabel(kind), type, size: Number(d.size) || 0,
    data: d.data, addedAt: new Date().toISOString(), addedBy: who.by, addedByName: who.byName };
  e.documents.push(rec);
  _prLog(replaced.length ? 'Staff Document Replaced' : 'Staff Document Added', e.ref + ' ' + e.name + ' · ' + prDocLabel(kind) + ' · ' + rec.name);
  return { ok: true, record: rec, replaced: replaced.length > 0 };
}
function prRemoveDocument(empId, docId) {
  const gate = _prGate(false); if (gate) return gate;
  const e = prFindEmployee(empId); if (!e) return _prFail(null, 'That employee could not be found');
  const d = (e.documents || []).find(x => x.id === docId); if (!d) return _prFail(null, 'That document could not be found');
  e.documents = e.documents.filter(x => x.id !== docId);
  _prLog('Staff Document Removed', e.ref + ' ' + e.name + ' · ' + prDocLabel(d.kind) + ' · ' + d.name);
  return { ok: true };
}

/* ── the expense rows payroll owns ───────────────────────────────────────── */
function _prWriteExpense(source, amount, date, method, description, handedTo) {
  prEnsureExpenseCategory();
  if (!Array.isArray(DB.expenses)) DB.expenses = [];
  const who = _prActor();
  const rec = { id: 'e_' + _prUid(), category: PR_EXPENSE_CAT, amount: _prMoney(amount), date,
    description, method: method || 'Cash', handedTo, source,
    addedBy: who.by, addedByName: who.byName };
  DB.expenses.push(rec);
  return rec.id;
}
function _prDropExpense(id) {
  if (!id || !Array.isArray(DB.expenses)) return;
  DB.expenses = DB.expenses.filter(e => e.id !== id);
}
/** Is this expense row owned by payroll (and so not editable from Expenses)? */
function prOwnsExpense(e) { return !!(e && e.source && ['salary', 'advance', 'bonus'].includes(e.source.kind)); }

/* ── the month, for the page and the dashboard ───────────────────────────── */
function prMonthSummary(m) {
  const staff = prEmployees().filter(e => prOnPayroll(e, m));
  let gross = 0, net = 0, paidNet = 0, paid = 0;
  for (const e of staff) {
    const ps = prPayslipFor(e.id, m);
    if (ps) { paid++; paidNet += ps.net; gross += ps.gross; net += ps.net; }
    else { const d = prDraft(e.id, m); if (d) { gross += d.gross; net += d.net; } }
  }
  return { staff: staff.length, paid, unpaid: staff.length - paid, gross, net, paidNet, dueNet: net - paidNet };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PR_EXPENSE_CAT, PR_BONUS_TYPES, prGross, prDraft, prAdvanceDue, prUnemployedDays };
}
