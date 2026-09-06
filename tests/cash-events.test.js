/* --- HOSTYLLO -- _cashEvents() conserves money, reversals included ------------

   `calcCashReceived()` answers "what physically arrived in this month", and it
   works by asking _cashEvents() to distribute each record's collections across
   the dates they actually landed on. The invariant the whole reconciliation
   rests on is stated in dashboard.js itself: every branch distributes exactly
   `p.amount` — never more, never less — so summing the twelve months of a year
   returns the same total the year's records hold. A tool that could invent or
   lose a rupee would be worse than none.

   §14's reversePayment() puts that invariant at risk, because a reversal is
   money leaving the drawer. These tests hold it: for every record shape,
   including reversed ones, the events must sum to what the record holds.

   Run:  node tests/cash-events.test.js
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
for (const f of ['config.js', 'utils.js', 'finance.js', 'modules/dashboard.js']) {
  vm.runInContext(R(f), sandbox, { filename: f });
}

const S = vm.runInContext(
  '({ DB, _cashEvents, calcCashReceived, applyPayment, reversePayment })', sandbox);
const { DB, _cashEvents } = S;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

const sum = evs => evs.reduce((s, e) => s + e.amount, 0);

/** Conservation: the events must account for exactly what the record holds. */
const conserves = p => assert.strictEqual(
  sum(_cashEvents(p)), Number(p.amount || 0),
  'events sum to ' + sum(_cashEvents(p)) + ' but the record holds ' + p.amount);

function setup() {
  DB.settings.serviceModel = 'rent_mess_bundled';
  DB.settings.roomTypes = [{ id: 't1', name: '2-Seater', capacity: 2, defaultRent: 8000, defaultMess: 6500 }];
  DB.rooms    = [{ id: 'r1', number: '1', typeId: 't1' }];
  DB.students = [{ id: 's1', name: 'Test Student', roomId: 'r1' }];
  DB.payments = [];
}
const bill = extra => Object.assign({
  id: 'p1', studentId: 's1', month: '2026-08', date: '2026-08-05',
  amount: 0, monthlyRent: 8000, messCharge: 6500, messIncluded: true,
  extraTotal: 0, admissionFee: 0, concession: 0,
  status: 'Pending', unpaid: 14500,
}, extra || {});

console.log('\nthe shapes that already existed still conserve');

ok('a record with no trail is one event on its own date', () => {
  setup();
  const p = bill({ amount: 14500, unpaid: 0, status: 'Paid' });
  const evs = _cashEvents(p);
  assert.strictEqual(evs.length, 1);
  assert.strictEqual(evs[0].date, '2026-08-05');
  conserves(p);
});

ok('a record with nothing collected produces no events', () => {
  setup();
  assert.strictEqual(_cashEvents(bill()).length, 0);
});

ok('a two-instalment trail is two events, dated where they landed', () => {
  setup();
  const p = bill();
  S.applyPayment(p, { amount: 4000,  date: '2026-07-28' });
  S.applyPayment(p, { amount: 10500, date: '2026-08-03' });
  const evs = _cashEvents(p);
  assert.strictEqual(evs.length, 2);
  assert.strictEqual(evs.map(e => e.date).join(), '2026-07-28,2026-08-03');
  conserves(p);
});

ok('a trail that accounts for less than was collected keeps the residual', () => {
  setup();
  // The first collection is not always written to the trail; whatever the trail
  // does not account for is attributed to the record's own date.
  const p = bill({ amount: 14500, unpaid: 0, status: 'Paid',
                   partialPayments: [{ date: '2026-08-20', amount: 10500 }] });
  const evs = _cashEvents(p);
  assert.strictEqual(evs.length, 2);
  conserves(p);
});

ok('a trail claiming MORE than was collected is distrusted entirely', () => {
  setup();
  // Known to exist on disk — repairPaymentComposition() documents the two bugs
  // that wrote them. Such a trail cannot date anything, so the record falls
  // back to its own date rather than being partly believed.
  const p = bill({ amount: 4000, partialPayments: [{ date: '2026-08-02', amount: 9999 }] });
  const evs = _cashEvents(p);
  assert.strictEqual(evs.length, 1);
  conserves(p);
});

console.log('\na reversal is a negative cash event, and money still balances');

ok('a partial reversal shows as money out, on the day it happened', () => {
  setup();
  const p = bill();
  S.applyPayment(p,   { amount: 14500, date: '2026-08-05' });
  S.reversePayment(p, { amount: 4500,  date: '2026-09-02', reason: 'Mis-keyed' });
  const evs = _cashEvents(p);
  assert.strictEqual(evs.length, 2);
  assert.strictEqual(evs.map(e => e.amount).join(), '14500,-4500');
  assert.strictEqual(evs[1].date, '2026-09-02');
  conserves(p);
});

ok('a full reversal leaves two events that cancel to nothing held', () => {
  setup();
  const p = bill();
  S.applyPayment(p,   { amount: 14500, date: '2026-08-05' });
  S.reversePayment(p, { amount: 14500, date: '2026-09-02' });
  assert.strictEqual(p.amount, 0);
  const evs = _cashEvents(p);
  // Both days moved money. Netting them into nothing would hide a refund the
  // drawer has to account for.
  assert.strictEqual(evs.length, 2);
  assert.strictEqual(sum(evs), 0);
  conserves(p);
});

ok('the reversal lands in ITS month, not the collection month', () => {
  setup();
  const p = bill();
  S.applyPayment(p,   { amount: 14500, date: '2026-08-05' });
  S.reversePayment(p, { amount: 4500,  date: '2026-09-02' });
  DB.payments = [p];
  assert.strictEqual(S.calcCashReceived('2026-08'), 14500);
  assert.strictEqual(S.calcCashReceived('2026-09'), -4500);
  // And the year still sums to what is held.
  assert.strictEqual(S.calcCashReceived('2026'), p.amount);
});

ok('several reversals across months all conserve', () => {
  setup();
  const p = bill();
  S.applyPayment(p,   { amount: 14500, date: '2026-08-05' });
  S.reversePayment(p, { amount: 2000,  date: '2026-08-20' });
  S.reversePayment(p, { amount: 3000,  date: '2026-09-11' });
  DB.payments = [p];
  assert.strictEqual(p.amount, 9500);
  assert.strictEqual(S.calcCashReceived('2026-08'), 12500);
  assert.strictEqual(S.calcCashReceived('2026-09'), -3000);
  assert.strictEqual(S.calcCashReceived('2026'), 9500);
  conserves(p);
});

ok('a reversal after several instalments still conserves', () => {
  setup();
  const p = bill();
  S.applyPayment(p,   { amount: 4000,  date: '2026-07-28' });
  S.applyPayment(p,   { amount: 6000,  date: '2026-08-03' });
  S.applyPayment(p,   { amount: 4500,  date: '2026-08-19' });
  S.reversePayment(p, { amount: 6000,  date: '2026-08-25' });
  DB.payments = [p];
  conserves(p);
  assert.strictEqual(S.calcCashReceived('2026'), p.amount);
});

ok('an over-collection then reversed conserves, credit and all', () => {
  setup();
  const p = bill();
  S.applyPayment(p,   { amount: 20000, date: '2026-08-05' });   // 5500 credit
  assert.strictEqual(p.overpaid, 5500);
  S.reversePayment(p, { amount: 5500,  date: '2026-08-09' });   // hand the credit back
  assert.strictEqual(p.overpaid, 0);
  assert.strictEqual(p.unpaid, 0);
  assert.strictEqual(p.status, 'Paid');
  conserves(p);
});

ok('reversals alone, with no trail, still produce both events', () => {
  setup();
  // A legacy record collected before the trail existed, then reversed.
  const p = bill({ amount: 14500, unpaid: 0, status: 'Paid' });
  delete p.partialPayments;
  S.reversePayment(p, { amount: 4500, date: '2026-09-02' });
  conserves(p);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
