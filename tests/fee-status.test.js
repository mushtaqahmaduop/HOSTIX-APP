/* --- HOSTYLLO -- Paid / Pending / Overdue for a whole student ----------------

   The Students directory's Fee Status column and the details panel's Financial
   tab. The spec asks for three states; this app had dropped Overdue as a KPI
   card and a top-level filter on the owner's call — "every overdue record is
   also pending, so the two cards double-counted the same money" — but KEPT the
   per-row mark, "because that IS row-level information".

   So `calculateFeeStatus()` adds no rule of its own. It aggregates the two
   answers that already exist: `calculateOutstanding()` for what a record still
   owes, and payments.js's `payIsOverdue()` for whether its due date has passed.
   That is the whole point — a Fee Status the Students page invented for itself
   would be free to disagree with Payments about the same student, which is D-1
   wearing a different hat.

   Run:  node tests/fee-status.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const assert = require('assert');

const R = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', f), 'utf8');

const el = () => ({ style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){} },
                    addEventListener(){}, appendChild(){},
                    querySelector: () => null, querySelectorAll: () => [] });

const sandbox = {
  console,
  sessionStorage: { getItem: () => null, setItem() {} },
  localStorage:   { getItem: () => null, setItem() {} },
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null,
              querySelectorAll: () => [], createElement: el, body: el() },
  navigator: { userAgent: 'node' },
  addEventListener() {}, removeEventListener() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: () => 0,
  Intl, Date, Math, JSON,
  Chart: function () {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// payments.js is required, not optional: payIsOverdue() lives there and is the
// rule this function reuses rather than restates.
for (const f of ['config.js', 'utils.js', 'finance.js',
                 'modules/dashboard.js', 'modules/payments.js']) {
  vm.runInContext(R(f), sandbox, { filename: f });
}

const S = vm.runInContext(
  '({ DB, calculateFeeStatus, calculateOutstanding, payIsOverdue, applyPayment, today })', sandbox);
const { DB } = S;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

const RENT = 8000, MESS = 6500, FULL = RENT + MESS;
const TODAY = S.today();
const past   = '2020-01-01';
const future = '2099-01-01';

function setup() {
  DB.settings.serviceModel = 'rent_mess_bundled';
  DB.settings.roomTypes = [{ id: 't1', name: '2-Seater', capacity: 2, defaultRent: RENT, defaultMess: MESS }];
  DB.rooms    = [{ id: 'r1', number: '1', typeId: 't1' }];
  DB.students = [{ id: 's1', name: 'Test Student', roomId: 'r1' }];
  DB.payments = [];
}

const rec = extra => Object.assign({
  id: 'p1', studentId: 's1', studentName: 'Test Student', month: '2026-08', date: '2026-08-05',
  amount: 0, monthlyRent: RENT, totalRent: RENT,
  messCharge: MESS, messIncluded: true,
  extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0, discount: 0,
  status: 'Pending', unpaid: FULL, paidDate: '', dueDate: '',
}, extra || {});

console.log('\nthe three states');

ok('nothing owed is Paid', () => {
  setup();
  DB.payments = [rec({ amount: FULL, unpaid: 0, overpaid: 0, status: 'Paid', paidDate: '2026-08-05' })];
  const f = S.calculateFeeStatus('s1');
  assert.strictEqual(f.status, 'Paid');
  assert.strictEqual(f.outstanding, 0);
});

ok('owed with no due date is Pending, never Overdue', () => {
  setup();
  /* Auto-generated monthly rents ship with `dueDate: ''` (payments.js), so
     guessing a date would mark most of a hostel overdue on a field nobody
     filled in. */
  DB.payments = [rec()];
  const f = S.calculateFeeStatus('s1');
  assert.strictEqual(f.status, 'Pending');
  assert.strictEqual(f.outstanding, FULL);
  assert.strictEqual(f.overdue, 0);
});

ok('owed with a due date still ahead is Pending', () => {
  setup();
  DB.payments = [rec({ dueDate: future })];
  assert.strictEqual(S.calculateFeeStatus('s1').status, 'Pending');
});

ok('owed with a due date already passed is Overdue', () => {
  setup();
  DB.payments = [rec({ dueDate: past })];
  const f = S.calculateFeeStatus('s1');
  assert.strictEqual(f.status, 'Overdue');
  assert.strictEqual(f.overdue, 1);
  assert.strictEqual(f.overdueAmount, FULL);
});

ok('a settled record with a passed due date is NOT overdue', () => {
  setup();
  // Overdue is about money still owed, not about a date in the past.
  DB.payments = [rec({ amount: FULL, unpaid: 0, overpaid: 0, status: 'Paid', dueDate: past })];
  assert.strictEqual(S.calculateFeeStatus('s1').status, 'Paid');
});

console.log('\nit aggregates the records, and reuses the row-level rule');

ok('one overdue month makes the student Overdue, whatever else is clean', () => {
  setup();
  DB.payments = [
    rec({ id: 'a', month: '2026-07', amount: FULL, unpaid: 0, overpaid: 0, status: 'Paid' }),
    rec({ id: 'b', month: '2026-08', dueDate: past }),
    rec({ id: 'c', month: '2026-09', dueDate: future }),
  ];
  const f = S.calculateFeeStatus('s1');
  assert.strictEqual(f.status, 'Overdue');
  assert.strictEqual(f.outstanding, FULL * 2);
  assert.strictEqual(f.overdue, 1);
  assert.strictEqual(f.records, 3);
});

ok('the overdue verdict agrees with payments.js row by row', () => {
  setup();
  /* The point of the whole function: no third rule. If payIsOverdue() ever
     changes, this must follow it rather than drift. */
  const rows = [rec({ id: 'a', dueDate: past }), rec({ id: 'b', dueDate: future }), rec({ id: 'c' })];
  DB.payments = rows;
  const byRow = rows.filter(p => S.calculateOutstanding(p) > 0 && S.payIsOverdue(p)).length;
  assert.strictEqual(S.calculateFeeStatus('s1').overdue, byRow);
  assert.strictEqual(byRow, 1);
});

ok('another student\'s records are not counted', () => {
  setup();
  DB.payments = [rec({ id: 'a', dueDate: past }),
                 rec({ id: 'b', studentId: 's2', dueDate: past })];
  assert.strictEqual(S.calculateFeeStatus('s1').outstanding, FULL);
  assert.strictEqual(S.calculateFeeStatus('s2').outstanding, FULL);
});

ok('a part payment leaves the balance, and the state follows the date', () => {
  setup();
  const p = rec({ dueDate: past });
  DB.payments = [p];
  S.applyPayment(p, { amount: 4000, date: '2026-08-06' });
  const f = S.calculateFeeStatus('s1');
  assert.strictEqual(f.outstanding, FULL - 4000);
  assert.strictEqual(f.status, 'Overdue');
});

console.log('\nthe figures the Financial tab prints');

ok('the last payment date comes from the instalment trail', () => {
  setup();
  const p = rec();
  DB.payments = [p];
  S.applyPayment(p, { amount: 4000, date: '2026-08-06' });
  S.applyPayment(p, { amount: 4000, date: '2026-08-20' });
  assert.strictEqual(S.calculateFeeStatus('s1').lastPaymentDate, '2026-08-20');
});

ok('a legacy record with no trail still dates its payment', () => {
  setup();
  // Records written before partialPayments existed carry only paidDate/date.
  DB.payments = [rec({ amount: FULL, unpaid: 0, overpaid: 0, status: 'Paid',
                       paidDate: '2026-08-11', date: '2026-08-01' })];
  assert.strictEqual(S.calculateFeeStatus('s1').lastPaymentDate, '2026-08-11');
});

ok('never-paid students report no last payment rather than a made-up one', () => {
  setup();
  DB.payments = [rec()];
  assert.strictEqual(S.calculateFeeStatus('s1').lastPaymentDate, '');
});

ok('the next due date is the soonest one still owed', () => {
  setup();
  DB.payments = [
    rec({ id: 'a', dueDate: '2026-12-01' }),
    rec({ id: 'b', dueDate: '2026-10-01' }),
    // Settled — its date must not be offered as something to chase.
    rec({ id: 'c', dueDate: '2026-09-01', amount: FULL, unpaid: 0, overpaid: 0, status: 'Paid' }),
  ];
  assert.strictEqual(S.calculateFeeStatus('s1').nextDueDate, '2026-10-01');
});

ok('an over-collection is reported as credit, not as a negative balance', () => {
  setup();
  const p = rec();
  DB.payments = [p];
  S.applyPayment(p, { amount: 20000, date: '2026-08-05' });
  const f = S.calculateFeeStatus('s1');
  assert.strictEqual(f.status, 'Paid');
  assert.strictEqual(f.outstanding, 0);
  assert.strictEqual(f.credit, 20000 - FULL);
});

console.log('\nthe shapes a real roster holds');

ok('a student with no records at all owes nothing, and says so', () => {
  setup();
  DB.payments = [];
  const f = S.calculateFeeStatus('s1');
  assert.strictEqual(f.status, 'Paid');
  assert.strictEqual(f.records, 0, 'callers need this to avoid claiming they paid');
  assert.strictEqual(f.outstanding, 0);
});

ok('an unknown student id does not throw', () => {
  setup();
  const f = S.calculateFeeStatus('nobody');
  assert.strictEqual(f.records, 0);
  assert.ok(Number.isFinite(f.outstanding));
});

ok('a legacy record with no unpaid field is priced from the charge authority', () => {
  setup();
  // D-1's shape: the fee status must not read it as settled.
  const p = rec({ amount: 4000 });
  delete p.unpaid;
  DB.payments = [p];
  const f = S.calculateFeeStatus('s1');
  assert.strictEqual(f.outstanding, FULL - 4000);
  assert.strictEqual(f.status, 'Pending');
});

ok('a malformed due date is ignored rather than treated as passed', () => {
  setup();
  DB.payments = [rec({ dueDate: 'next Friday' })];
  assert.strictEqual(S.calculateFeeStatus('s1').status, 'Pending');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
