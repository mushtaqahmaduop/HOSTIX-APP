/* --- HOSTYLLO -- prorated charging (warden ledger spec §2.5, §3.10, §5 step 9) ---

   Loads config.js, utils.js, finance.js and ledger.js the way the app loads them
   and drives the real rules: which month a label names, how many days By days
   suggests (join day included), the wording, and what the ledger says for a
   month charged by days — as a first charge and as a change to a full month.

   Run:  node tests/prorate.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const assert = require('assert');

const R = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', f), 'utf8');

const sandbox = {
  console,
  sessionStorage: { getItem: () => null, setItem: () => {} },
  localStorage:   { getItem: () => null, setItem: () => {} },
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null,
              querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }) },
  navigator: { userAgent: 'node' },
  setTimeout, clearTimeout, Intl, Date, Math, JSON,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['config.js', 'utils.js', 'finance.js', 'ledger.js']
  .forEach(f => vm.runInContext(R(f), sandbox, { filename: f }));
vm.runInContext(`
  var WARDENS = { w_sara: { name: 'Sara Warden', perms: { payments: true } } };
  var CUR_ROLE = 'w_sara', CUR_USER = WARDENS.w_sara;
  function canDo(p) { return !!(CUR_USER && CUR_USER.perms && CUR_USER.perms[p] === true); }
  function logActivity() {}
`, sandbox);

const C = vm.runInContext(`({
  DB, calculateBill, ledgerTrack, ledgerLoaded, ledgerImportIfEmpty,
  prorateMonthOf, prorateDefaultDays, prorateText,
})`, sandbox);
const { DB } = C;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

// ── the month ────────────────────────────────────────────────────────────────

ok('a stored key and a label name the same month', () => {
  assert.deepStrictEqual(Object.assign({}, C.prorateMonthOf('2026-09')), { y: 2026, m: 9, days: 30 });
  assert.deepStrictEqual(Object.assign({}, C.prorateMonthOf('September 2026')), { y: 2026, m: 9, days: 30 });
  assert.strictEqual(C.prorateMonthOf('Feb 2028').days, 29);
  assert.strictEqual(C.prorateMonthOf(''), null);
  assert.strictEqual(C.prorateMonthOf('2026-13'), null);
  assert.strictEqual(C.prorateMonthOf('Smarch 2026'), null);
});

// ── the days By days suggests ────────────────────────────────────────────────

ok('a join date in the month counts from the join day, join day included', () => {
  assert.strictEqual(C.prorateDefaultDays('September 2026', '2026-09-15', '2026-09-20'), 16);
  assert.strictEqual(C.prorateDefaultDays('2026-09', '2026-09-01', '2026-09-20'), 30);
  assert.strictEqual(C.prorateDefaultDays('2026-09', '2026-09-30', '2026-09-02'), 1);
});

ok('otherwise this month counts from today, and any other month from the 1st', () => {
  assert.strictEqual(C.prorateDefaultDays('2026-09', '2026-01-10', '2026-09-20'), 11);
  assert.strictEqual(C.prorateDefaultDays('2026-08', '2026-01-10', '2026-09-20'), 31);
  assert.strictEqual(C.prorateDefaultDays('2026-10', '', '2026-09-20'), 31);
  assert.strictEqual(C.prorateDefaultDays('not a month', '2026-09-15', '2026-09-20'), 0);
});

ok('the wording', () => {
  assert.strictEqual(C.prorateText({ days: 16, rate: 700 }), 'Prorated: 16 days @ 700/day');
  assert.strictEqual(C.prorateText({ days: 1, rate: 1500 }), 'Prorated: 1 day @ 1,500/day');
  assert.strictEqual(C.prorateText(null), '');
});

// ── the ledger ───────────────────────────────────────────────────────────────

function start() {
  DB.settings.serviceModel = 'rent_mess_optional';
  DB.students = [{ id: 's1', name: 'Ali Khan', status: 'Active' }];
  DB.payments = []; DB.archive = []; DB.studentLedger = [];
  C.ledgerLoaded(); C.ledgerImportIfEmpty();
}
function rec(o) {
  const p = Object.assign({ id: 'p1', studentId: 's1', studentName: 'Ali Khan', month: 'September 2026',
    monthlyRent: 10000, messCharge: 7000, messIncluded: true, extraCharges: [], extraTotal: 0,
    admissionFee: 0, concession: 0, concessionDesc: '', amount: 0, method: 'Cash', date: '2026-09-15' }, o || {});
  p.unpaid = C.calculateBill(p); p.overpaid = 0; p.status = 'Pending';
  DB.payments.push(p);
  return p;
}
const entries = id => DB.studentLedger.filter(e => e.paymentRecordId === id);

ok('a month charged by days posts one charge with the numbers used', () => {
  start();
  const p = rec({ monthlyRent: 11200, messIncluded: false, prorate: { days: 16, rate: 700 } });
  C.ledgerTrack(p);
  const e = entries('p1').filter(x => x.type === 'charge');
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].amount, 11200);
  assert.strictEqual(e[0].reason, 'Prorated: 16 days @ 700/day = 11,200 · September 2026');
});

ok('a full month changed to by days posts the difference with the same wording', () => {
  start();
  const p = rec();
  C.ledgerTrack(p);
  assert.strictEqual(entries('p1').find(x => x.type === 'charge').amount, 17000);
  p.monthlyRent = 11200; p.messIncluded = false; p.prorate = { days: 16, rate: 700 };
  p.unpaid = C.calculateBill(p);
  C.ledgerTrack(p, { why: 'Updated on the payment form' });
  const adj = entries('p1').filter(x => x.type === 'adjustment');
  assert.strictEqual(adj.length, 1);
  assert.strictEqual(adj[0].amount, -5800);
  assert.strictEqual(adj[0].reason, 'Prorated: 16 days @ 700/day = 11,200 · September 2026');
  const last = DB.studentLedger[DB.studentLedger.length - 1];
  assert.strictEqual(last.runningBalance, 11200);
});

ok('an ordinary month keeps its ordinary wording', () => {
  start();
  const p = rec();
  C.ledgerTrack(p);
  assert.strictEqual(entries('p1').find(x => x.type === 'charge').reason, 'Monthly charges · September 2026');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
