/* --- HOSTYLLO -- reports reconcile against the financial authority (§14) ------

   §14: "Reports must reconcile against the same financial authority."

   `_rptTotals()` in reports.js is the single place every figure on the Reports
   page, its detail cards, its CSVs and its PDFs comes from. Its money half now
   comes from `calculateReportTotals()` rather than from sums written out again
   in that file — three of which existed, all recomputing a figure `_rptTotals()
   had already produced from the same records.

   THE ONE THAT MATTERS MOST is the last assertion group below. `rev` comes from
   `calcRevenue()` — the ACCRUAL authority the dashboard and every share sheet
   read — and `collected` comes from the layer. Both sum `p.amount` over the same
   scope, so they must agree; if they ever do not, a record carries a stored
   status that is neither Paid nor Pending and the report is quietly missing its
   money. `_rptTotals().safe` reports that, and the page prints a caveat instead
   of a figure it cannot stand behind.

   Run:  node tests/report-totals.test.js
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
for (const f of ['config.js', 'utils.js', 'finance.js',
                 'modules/dashboard.js', 'modules/payments.js', 'modules/reports.js']) {
  vm.runInContext(R(f), sandbox, { filename: f });
}

const S = vm.runInContext(`({
  DB, _rptTotals, calcRevenue, calcExpenses,
  calculateReportTotals, calculateOutstanding, calculateBill, applyPayment, reversePayment
})`, sandbox);
const { DB } = S;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

const RENT = 8000, MESS = 6500, FULL = RENT + MESS;   // 14,500

function setup() {
  DB.settings.serviceModel = 'rent_mess_bundled';
  DB.settings.roomTypes = [{ id: 't1', name: '2-Seater', capacity: 2, defaultRent: RENT, defaultMess: MESS }];
  DB.rooms    = [{ id: 'r1', number: '1', typeId: 't1' }];
  DB.students = [{ id: 's1', name: 'Test Student', roomId: 'r1' }];
  DB.payments = [];
  DB.expenses = [];
  DB.transfers = [];
}

const rec = extra => Object.assign({
  id: 'p1', studentId: 's1', studentName: 'Test Student', roomNumber: '1',
  month: '2026-08', date: '2026-08-05',
  amount: 0, monthlyRent: RENT, totalRent: RENT,
  messCharge: MESS, messIncluded: true,
  extraCharges: [], extraTotal: 0, admissionFee: 0,
  concession: 0, discount: 0, method: 'Cash',
  status: 'Pending', unpaid: FULL, paidDate: '',
}, extra || {});

/** July settled, August part-paid, September untouched — one month in scope. */
function august() {
  setup();
  DB.payments = [
    rec({ id: 'p_jul', month: '2026-07', date: '2026-07-05',
          amount: FULL, unpaid: 0, overpaid: 0, status: 'Paid', paidDate: '2026-07-05' }),
    rec({ id: 'p_aug', month: '2026-08', amount: 4000, unpaid: FULL - 4000 }),
    rec({ id: 'p_sep', month: '2026-09', date: '2026-09-01', amount: 0, unpaid: FULL }),
  ];
  return DB.payments;
}

console.log('\n_rptTotals scopes to its window and totals it once');

ok('the window selects its own records and nothing else', () => {
  august();
  const t = S._rptTotals(['2026-08']);
  assert.strictEqual(t.pays.length, 1);
  assert.strictEqual(t.pays[0].id, 'p_aug');
});

ok('a whole year is a prefix, and takes all three months', () => {
  august();
  const t = S._rptTotals(['2026']);
  assert.strictEqual(t.pays.length, 3);
  assert.strictEqual(t.billed, FULL * 3);
});

ok('billed, collected and outstanding come from the layer', () => {
  august();
  const t = S._rptTotals(['2026']);
  const direct = S.calculateReportTotals(t.pays);
  assert.strictEqual(t.billed,      direct.billed);
  assert.strictEqual(t.collected,   direct.collected);
  assert.strictEqual(t.credit,      direct.credit);
  assert.strictEqual(t.concessions, direct.concessions);
  assert.strictEqual(t.extras,      direct.extras);
  assert.strictEqual(t.reversed,    direct.reversed);
});

ok('pending is the outstanding of the records the app calls Pending', () => {
  august();
  const t = S._rptTotals(['2026']);
  // July is settled; August owes 10,500 and September owes 14,500.
  assert.strictEqual(t.pending, (FULL - 4000) + FULL);
  assert.strictEqual(t.pendingCount, 2);
});

ok('pending equals what the detail card would compute from the same rows', () => {
  august();
  const t = S._rptTotals(['2026']);
  // The Pending detail card and the PDF both used to sum this again themselves.
  // They now read t.pending, and this is the figure they used to arrive at.
  const byHand = t.pays.filter(p => p.status === 'Pending')
                       .reduce((s, p) => s + S.calculateOutstanding(p), 0);
  assert.strictEqual(t.pending, byHand);
});

ok('an empty window totals to zero rather than NaN, and is safe', () => {
  setup();
  const t = S._rptTotals(['2026-08']);
  assert.strictEqual(t.pays.length, 0);
  assert.strictEqual(t.billed, 0);
  assert.strictEqual(t.collected, 0);
  assert.strictEqual(t.pending, 0);
  assert.strictEqual(t.rev, 0);
  assert.strictEqual(t.net, 0);
  assert.strictEqual(t.safe, true);
});

console.log('\nthe figures reconcile with each other');

ok('billed − collected is what is still owed, when nothing is over-collected', () => {
  august();
  const t = S._rptTotals(['2026']);
  assert.strictEqual(t.billed - t.collected, t.pending);
});

ok('an over-collection appears as credit, and the identity still closes', () => {
  setup();
  DB.payments = [rec({ id: 'p_aug' })];
  S.applyPayment(DB.payments[0], { amount: 20000, date: '2026-08-05' });
  const t = S._rptTotals(['2026-08']);
  assert.strictEqual(t.collected, 20000);
  assert.strictEqual(t.pending, 0);
  assert.strictEqual(t.credit, 5500);
  assert.strictEqual(t.billed - t.collected + t.credit, t.pending);
});

ok('a reversal is reported, and the collected total drops with it', () => {
  setup();
  DB.payments = [rec({ id: 'p_aug' })];
  S.applyPayment(DB.payments[0],   { amount: FULL, date: '2026-08-05' });
  S.reversePayment(DB.payments[0], { amount: 4500, date: '2026-08-20' });
  const t = S._rptTotals(['2026-08']);
  assert.strictEqual(t.collected, FULL - 4500);
  assert.strictEqual(t.reversed, 4500);
  assert.strictEqual(t.pending, 4500);
});

ok('net is revenue minus the whole outgoing, transfers included', () => {
  august();
  DB.expenses = [{ id: 'e1', category: 'Utilities', date: '2026-08-09', amount: 3000 }];
  const t = S._rptTotals(['2026-08']);
  assert.strictEqual(t.totalExp, 3000);
  assert.strictEqual(t.net, t.rev - t.totalExp);
});

console.log('\n§14: the report and the accrual authority agree about the same rupees');

ok('rev and the layer\'s collected are the same figure', () => {
  august();
  for (const keys of [['2026-07'], ['2026-08'], ['2026-09'], ['2026']]) {
    const t = S._rptTotals(keys);
    assert.strictEqual(t.rev, t.collected,
      keys.join() + ': calcRevenue says ' + t.rev + ', the layer says ' + t.collected);
    assert.strictEqual(t.safe, true);
  }
});

ok('they still agree once money has been over-collected and partly reversed', () => {
  setup();
  DB.payments = [
    rec({ id: 'p_a', month: '2026-08' }),
    rec({ id: 'p_b', month: '2026-08', studentId: 's1' }),
  ];
  S.applyPayment(DB.payments[0],   { amount: 20000, date: '2026-08-05' });  // credit
  S.applyPayment(DB.payments[1],   { amount: 4000,  date: '2026-08-06' });  // partial
  S.reversePayment(DB.payments[0], { amount: 1000,  date: '2026-08-07' });
  const t = S._rptTotals(['2026-08']);
  assert.strictEqual(t.rev, t.collected);
  assert.strictEqual(t.safe, true);
});

ok('a record with an unexpected stored status is CAUGHT, not silently dropped', () => {
  setup();
  /* calcRevenue() filters on the stored status and knows only 'Paid' and
     'Pending' ('Partial' is derived for display and is never written). A record
     stamped anything else contributes to the layer's collected total and to no
     revenue figure anywhere — the report would be missing that money with
     nothing on screen to say so. This is what `safe` exists to catch. */
  DB.payments = [rec({ id: 'p_odd', month: '2026-08', amount: 5000,
                       unpaid: FULL - 5000, status: 'Cancelled' })];
  const t = S._rptTotals(['2026-08']);
  assert.strictEqual(t.rev, 0);
  assert.strictEqual(t.collected, 5000);
  assert.strictEqual(t.safe, false, 'the mismatch must be reported, not printed');
});

ok('the pending scope is unchanged by this refactor, deliberately', () => {
  setup();
  /* A Paid record carrying a recorded balance is reachable — the Edit form's
     status dropdown is free while the balance beside it is readonly — and
     outstandingOf() returns that balance. No Pending card in the app counts it,
     here or on the dashboard. That inconsistency pre-dates the §14 layer and is
     NOT changed here: moving a headline figure on 50+ live installs is the
     owner's call, and doing it silently inside a refactor is how a report loses
     trust. This test pins the current behaviour so the change, when it comes,
     is deliberate and visible. */
  DB.payments = [rec({ id: 'p_paid_owing', month: '2026-08',
                       amount: 4000, unpaid: 10500, status: 'Paid' })];
  const t = S._rptTotals(['2026-08']);
  assert.strictEqual(S.calculateOutstanding(DB.payments[0]), 10500);
  assert.strictEqual(t.pending, 0, 'today the Pending card does not see this');
  assert.strictEqual(t.totals.outstanding, 10500, 'but the layer does');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
