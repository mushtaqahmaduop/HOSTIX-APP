/* --- HOSTYLLO -- the §14 financial matrix -------------------------------------

   Spec §14 names the cases a financial layer has to answer for: exact, partial,
   overpayment, multiple months, concessions, extras, cancellation, checkout,
   reversal, refund, zero, invalid/negative, large amounts, rounding boundaries.
   Until now they had no home — reversal and refund had no implementation to
   test, and rounding boundaries had no policy to test against.

   These load config.js, utils.js and finance.js the way the app loads them and
   drive the real functions, so what is asserted here is what the screens do.
   tests/outstanding.test.js is the companion: it proves outstandingOf(), which
   this layer calls rather than reimplementing.

   Run:  node tests/finance.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
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
vm.runInContext(R('config.js'),  sandbox, { filename: 'config.js' });
vm.runInContext(R('utils.js'),   sandbox, { filename: 'utils.js' });
vm.runInContext(R('finance.js'), sandbox, { filename: 'finance.js' });

// config.js declares DB with `let`, so it lives in the context's lexical scope
// and never becomes a property of the sandbox object. Function declarations do.
const F = vm.runInContext(`({
  DB, money, moneyIsSafe, moneySum, moneyPct, MONEY_SAFE_MAX,
  calculateCharges, calculateOutstanding, calculateBill,
  applyPayment, reversePayment, calculateRefund,
  calculateSettlement, calculateReportTotals
})`, sandbox);
const { DB } = F;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

/** One hostel, one room type at 8000 rent + 6500 mess, one student in it. */
function setup(model) {
  DB.settings.serviceModel = model || 'rent_mess_bundled';
  DB.settings.roomTypes = [{ id: 't1', name: '2-Seater', capacity: 2, defaultRent: 8000, defaultMess: 6500 }];
  DB.rooms    = [{ id: 'r1', number: '1', typeId: 't1' }];
  DB.students = [{ id: 's1', name: 'Test Student', roomId: 'r1' }];
  DB.payments = [];
}

/** A modern record: 14,500 billed, nothing collected yet. */
const bill = extra => Object.assign({
  id: 'p1', studentId: 's1', month: '2026-08',
  amount: 0, monthlyRent: 8000, totalRent: 8000,
  messCharge: 6500, messIncluded: true,
  extraCharges: [], extraTotal: 0,
  admissionFee: 0, concession: 0, discount: 0,
  status: 'Pending', paidDate: '',
  unpaid: 14500,
}, extra || {});

// ═══ MONEY REPRESENTATION AND ROUNDING ══════════════════════════════════════
console.log('\nmoney is a whole rupee, and rounding is a policy');

ok('CASE rounding boundaries — .5 rounds away from zero, in both directions', () => {
  assert.strictEqual(F.money(0.5),   1);
  assert.strictEqual(F.money(1.5),   2);
  assert.strictEqual(F.money(2.5),   3);   // NOT banker's rounding: 2.5 -> 3
  assert.strictEqual(F.money(-0.5), -1);
  assert.strictEqual(F.money(-1.5), -2);
});

ok('CASE rounding boundaries — negation is symmetric, so a reversal is exact', () => {
  // Math.round(-0.5) is -0, so Math.round(-x) !== -Math.round(x) at every half.
  // reversePayment() negates amounts; that asymmetry would leave a rupee behind
  // on the record every time, forever.
  for (const v of [0.5, 1.5, 2.5, 1234.5, -0.5, -7.5]) {
    assert.strictEqual(F.money(-v), -F.money(v), 'asymmetric at ' + v);
  }
});

ok('CASE rounding boundaries — just below and just above a half', () => {
  assert.strictEqual(F.money(0.49), 0);
  assert.strictEqual(F.money(0.51), 1);
  assert.strictEqual(F.money(8000.4), 8000);
  assert.strictEqual(F.money(8000.6), 8001);
});

ok('an integer is returned untouched, which is the common path', () => {
  assert.strictEqual(F.money(14500), 14500);
  assert.strictEqual(F.money(0), 0);
});

ok('CASE invalid — non-numbers are 0, never NaN', () => {
  // A NaN reaching a total poisons every figure downstream of it silently.
  for (const v of [null, undefined, '', 'abc', {}, [], NaN, Infinity, -Infinity]) {
    const r = F.money(v);
    assert.ok(Number.isFinite(r), 'not finite for ' + JSON.stringify(v));
    assert.strictEqual(r, 0);
  }
});

ok('a numeric string is honoured — forms hand over strings', () => {
  assert.strictEqual(F.money('2500'), 2500);
  assert.strictEqual(F.money('2500.5'), 2501);
});

ok('CASE invalid/negative — a negative is preserved, not clamped', () => {
  // Clamping here would hide a bad import. The layer floors where it is a rule
  // (a bill, a balance), not in the primitive.
  assert.strictEqual(F.money(-3000), -3000);
});

ok('the fraction is removed at the boundary, so sums stay exact', () => {
  // The floating-point hazard is the fraction, not the double: 0.1+0.2 !== 0.3,
  // but every integer sum below 2^53 is exact.
  assert.notStrictEqual(0.1 + 0.2, 0.3);
  let t = 0;
  for (let i = 0; i < 1000; i++) t += F.money(0.1) + F.money(14500.4);
  assert.strictEqual(t, 14500 * 1000);
});

ok('CASE large amounts — exact to MAX_SAFE_INTEGER, and flagged past it', () => {
  assert.strictEqual(F.money(9007199254740991), 9007199254740991);
  assert.strictEqual(F.moneyIsSafe(F.MONEY_SAFE_MAX), true);
  assert.strictEqual(F.moneyIsSafe(F.MONEY_SAFE_MAX + 2), false);
  // A hostel-scale large figure is nowhere near the edge and stays exact.
  assert.strictEqual(F.moneySum([999999999, 1]), 1000000000);
});

ok('a percentage is the one multiplication, and it rounds once', () => {
  assert.strictEqual(F.moneyPct(8000, 7.5), 600);
  assert.strictEqual(F.moneyPct(14500, 33), 4785);
  assert.strictEqual(F.moneyPct(1005, 50), 503);      // 502.5 -> away from zero
  assert.strictEqual(F.moneyPct(8000, 'abc'), 0);
});

// ═══ THE BILL ═══════════════════════════════════════════════════════════════
console.log('\none bill expression, and it carries every line');

ok('rent + mess is the monthly charge', () => {
  setup();
  assert.strictEqual(F.calculateBill(bill()), 14500);
});

ok('CASE concessions — a concession reduces the bill', () => {
  setup();
  assert.strictEqual(F.calculateBill(bill({ concession: 2000 })), 12500);
});

ok('CASE concessions — a concession beyond the charge is a free month, not a debt', () => {
  setup();
  // Floored at 0. Money owed BACK comes from over-collection, never from
  // over-discount — that is calculateRefund()'s job, not this one's.
  assert.strictEqual(F.calculateBill(bill({ concession: 99000 })), 0);
});

ok('CASE extras — extra charges are part of the bill', () => {
  setup();
  assert.strictEqual(F.calculateBill(bill({ extraTotal: 1500 })), 16000);
});

ok('CASE extras — line items are summed when no total was recorded', () => {
  setup();
  const p = bill({ extraCharges: [{ label: 'Laundry', amount: 1500 }, { label: 'Fine', amount: 500 }] });
  delete p.extraTotal;
  assert.strictEqual(F.calculateBill(p), 16500);
});

ok('an admission fee is part of the bill', () => {
  setup();
  assert.strictEqual(F.calculateBill(bill({ admissionFee: 3000 })), 17500);
});

ok('mess off removes only the mess', () => {
  setup();
  assert.strictEqual(F.calculateBill(bill({ messIncluded: false })), 8000);
});

ok('THE :1778 BUG — the merge path dropped everything but rent', () => {
  setup();
  /* payments.js:1778 computed the merged balance as `monthlyRent - paid`, so at
     a bundled hostel merging into an existing pending record understated it by
     the whole mess charge — plus extras, admission fee and concession. The
     neighbouring path at :2480 had had exactly this bug and carries a comment
     about the fix; this copy was missed. One expression now. */
  const p = bill({ extraTotal: 1500, admissionFee: 3000, concession: 1000 });
  assert.strictEqual(F.calculateBill(p), 18000);   // NOT 8000
});

// ═══ APPLYING A PAYMENT ═════════════════════════════════════════════════════
console.log('\ncollecting money');

ok('CASE exact — the full charge settles the record', () => {
  setup();
  const p = bill();
  const r = F.applyPayment(p, { amount: 14500, date: '2026-08-05' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.applied, 14500);
  assert.strictEqual(r.credit, 0);
  assert.strictEqual(p.amount, 14500);
  assert.strictEqual(p.unpaid, 0);
  assert.strictEqual(p.status, 'Paid');
  assert.strictEqual(p.paidDate, '2026-08-05');
});

ok('CASE partial — a part payment leaves the balance and stays Pending', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 4000, date: '2026-08-05' });
  assert.strictEqual(p.amount, 4000);
  assert.strictEqual(p.unpaid, 10500);
  assert.strictEqual(p.status, 'Pending');
  assert.strictEqual(p.paidDate, '');
});

ok('CASE partial — instalments accumulate and settle', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 4000,  date: '2026-08-05' });
  F.applyPayment(p, { amount: 10500, date: '2026-08-20' });
  assert.strictEqual(p.amount, 14500);
  assert.strictEqual(p.unpaid, 0);
  assert.strictEqual(p.status, 'Paid');
  assert.strictEqual(p.partialPayments.length, 2);
  // The trail sums to what was collected — dashboard.js _cashEvents() depends
  // on exactly that to distribute the cash across months without losing any.
  assert.strictEqual(p.partialPayments.reduce((s, e) => s + e.amount, 0), p.amount);
});

ok('THE WRITE-SIDE TAIL OF D-1 — a legacy record collects its real balance', () => {
  setup();
  /* All three "mark paid" paths read the balance as `Number(p.unpaid) || 0`. On
     a record written before that field existed it is 0, so Mark Paid collected
     NOTHING and stamped it Paid — the debt was not settled, it was deleted.
     applyPayment reads calculateOutstanding(), which prices it from the charge
     authority: 14,500 billed, 4,000 in, 10,500 owed. */
  const p = { id: 'p9', studentId: 's1', month: '2026-08', amount: 4000, status: 'Pending' };
  assert.strictEqual(F.calculateOutstanding(p), 10500);
  const r = F.applyPayment(p, { amount: 10500, date: '2026-08-20' });
  assert.strictEqual(r.applied, 10500);
  assert.strictEqual(p.amount, 14500);
  assert.strictEqual(p.unpaid, 0);
  assert.strictEqual(p.status, 'Paid');
});

ok('CASE zero — a zero collection changes nothing', () => {
  setup();
  const p = bill();
  const r = F.applyPayment(p, { amount: 0 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'non-positive');
  assert.strictEqual(p.amount, 0);
  assert.strictEqual(p.unpaid, 14500);
  assert.ok(!p.partialPayments || !p.partialPayments.length, 'no trail entry for nothing');
});

ok('CASE invalid/negative — a negative collection is refused, not applied', () => {
  setup();
  const p = bill();
  const r = F.applyPayment(p, { amount: -5000 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(p.amount, 0);
  assert.strictEqual(p.unpaid, 14500);
});

ok('CASE invalid — an unparseable amount is refused', () => {
  setup();
  const p = bill();
  assert.strictEqual(F.applyPayment(p, { amount: 'abc' }).ok, false);
  assert.strictEqual(F.applyPayment(null,  { amount: 100 }).ok, false);
  assert.strictEqual(p.amount, 0);
});

ok('a fractional collection is stored as a whole rupee', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 4000.6, date: '2026-08-05' });
  assert.strictEqual(p.amount, 4001);
  assert.strictEqual(p.unpaid, 10499);
});

// ═══ OVERPAYMENT AND REFUND ═════════════════════════════════════════════════
console.log('\nmoney collected beyond the bill');

ok('CASE overpayment — the excess is recorded, not swallowed', () => {
  setup();
  const p = bill();
  const r = F.applyPayment(p, { amount: 15000, date: '2026-08-05' });
  assert.strictEqual(r.applied, 14500);
  assert.strictEqual(r.credit, 500);
  assert.strictEqual(p.unpaid, 0);
  assert.strictEqual(p.overpaid, 500);
  assert.strictEqual(p.status, 'Paid');
});

ok('CASE overpayment — the whole amount lands in p.amount, so cash is conserved', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 15000, date: '2026-08-05' });
  // _cashEvents() distributes exactly p.amount across months. Anything less
  // here and the cash reconciliation loses the 500.
  assert.strictEqual(p.amount, 15000);
  assert.strictEqual(p.partialPayments.reduce((s, e) => s + e.amount, 0), 15000);
});

ok('CASE refund — the credit is what is refundable', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 15000, date: '2026-08-05' });
  const r = F.calculateRefund(p);
  assert.strictEqual(r.refundable, 500);
  assert.strictEqual(r.derived, false);
});

ok('CASE refund — a settled record refunds nothing', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 14500, date: '2026-08-05' });
  assert.strictEqual(F.calculateRefund(p).refundable, 0);
});

ok('CASE refund — a legacy over-collection is derived, and says so', () => {
  setup();
  // No `overpaid` field at all: 14,500 billed, 15,000 collected.
  const p = bill({ amount: 15000, unpaid: 0, status: 'Paid' });
  delete p.overpaid;
  const r = F.calculateRefund(p);
  assert.strictEqual(r.refundable, 500);
  assert.strictEqual(r.derived, true);
});

ok('a lowered bill does not invent a refund', () => {
  setup();
  /* Deliberately NOT "bill - collected, if negative". A rent corrected downward
     after the fact would otherwise conjure a refund out of a correction. The
     credit is what applyPayment() saw arrive in excess, and nothing else. */
  const p = bill();
  F.applyPayment(p, { amount: 14500, date: '2026-08-05' });
  p.monthlyRent = 5000;                       // the bill is edited afterwards
  assert.strictEqual(F.calculateRefund(p).refundable, 0);
});

// ═══ REVERSAL ═══════════════════════════════════════════════════════════════
console.log('\nundoing a collection');

ok('CASE reversal — a full reversal returns the record to where it started', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 14500, date: '2026-08-05' });
  const r = F.reversePayment(p, { reason: 'Keyed twice', date: '2026-08-06' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.reversed, 14500);
  assert.strictEqual(p.amount, 0);
  assert.strictEqual(p.unpaid, 14500);
  assert.strictEqual(p.status, 'Pending');
  assert.strictEqual(p.paidDate, '');
});

ok('CASE reversal — a partial reversal re-opens exactly that much', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 14500, date: '2026-08-05' });
  F.reversePayment(p, { amount: 4500, reason: 'Mis-keyed', date: '2026-08-06' });
  assert.strictEqual(p.amount, 10000);
  assert.strictEqual(p.unpaid, 4500);
  assert.strictEqual(p.status, 'Pending');
});

ok('CASE reversal — the credit is taken back before the debt is re-opened', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 15000, date: '2026-08-05' });   // 500 credit
  const r = F.reversePayment(p, { amount: 800, date: '2026-08-06' });
  assert.strictEqual(r.fromCredit, 500);
  assert.strictEqual(r.fromApplied, 300);
  assert.strictEqual(p.overpaid, 0);
  assert.strictEqual(p.unpaid, 300);
  // Otherwise one undone keystroke leaves the record owing money AND holding a
  // refundable credit at the same time.
});

ok('CASE reversal — never more than was collected', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 4000, date: '2026-08-05' });
  const r = F.reversePayment(p, { amount: 9000 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'exceeds-collected');
  assert.strictEqual(r.max, 4000);
  assert.strictEqual(p.amount, 4000, 'the record must be untouched');
  assert.strictEqual(p.unpaid, 10500);
});

ok('CASE reversal — nothing collected, nothing to reverse', () => {
  setup();
  const p = bill();
  assert.strictEqual(F.reversePayment(p, { amount: 100 }).ok, false);
  assert.strictEqual(p.amount, 0);
});

ok('CASE reversal — it is recorded as a fact, with its reason', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 14500, date: '2026-08-05' });
  F.reversePayment(p, { amount: 500, reason: 'Counted twice', by: 'Warden A', date: '2026-08-06' });
  assert.strictEqual(p.reversals.length, 1);
  assert.deepStrictEqual(
    { a: p.reversals[0].amount, r: p.reversals[0].reason, b: p.reversals[0].by, d: p.reversals[0].date },
    { a: 500, r: 'Counted twice', b: 'Warden A', d: '2026-08-06' });
});

ok('CASE reversal — the instalment trail is not rewritten', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 14500, date: '2026-08-05' });
  F.reversePayment(p, { amount: 4500, date: '2026-08-06' });
  /* A negative entry in partialPayments would break _cashEvents(): it filters
     that array to positive amounts when it dates cash but sums it whole when it
     sanity-checks, so the two halves would disagree and the record's cash would
     be over-counted. Reversals live in their own array. */
  assert.strictEqual(p.partialPayments.length, 1);
  assert.strictEqual(p.partialPayments[0].amount, 14500);
  assert.strictEqual(
    p.partialPayments.reduce((s, e) => s + e.amount, 0) -
    p.reversals.reduce((s, e) => s + e.amount, 0), p.amount,
    'trail minus reversals must equal what is held');
});

ok('reverse then re-collect lands exactly where it started', () => {
  setup();
  const p = bill();
  F.applyPayment(p, { amount: 14500, date: '2026-08-05' });
  F.reversePayment(p, { amount: 14500, date: '2026-08-06' });
  F.applyPayment(p, { amount: 14500, date: '2026-08-06' });
  assert.strictEqual(p.amount, 14500);
  assert.strictEqual(p.unpaid, 0);
  assert.strictEqual(p.status, 'Paid');
});

// ═══ MULTIPLE MONTHS, CANCELLATION, CHECKOUT ════════════════════════════════
console.log('\nacross months, and at the door');

/** Three months for s1: July settled, August part-paid, September untouched. */
function threeMonths() {
  setup();
  DB.payments = [
    bill({ id: 'p_jul', month: '2026-07', amount: 14500, unpaid: 0, status: 'Paid' }),
    bill({ id: 'p_aug', month: '2026-08', amount: 4000,  unpaid: 10500 }),
    bill({ id: 'p_sep', month: '2026-09', amount: 0,     unpaid: 14500 }),
  ];
  return DB.payments;
}

ok('CASE multiple months — arrears total across every record held', () => {
  threeMonths();
  const s = F.calculateSettlement('s1');
  assert.strictEqual(s.records, 3);
  assert.strictEqual(s.billed, 43500);
  assert.strictEqual(s.collected, 18500);
  assert.strictEqual(s.outstanding, 25000);
});

ok('CASE multiple months — a record from another student is not counted', () => {
  threeMonths();
  DB.payments.push(bill({ id: 'p_x', studentId: 's2', amount: 0, unpaid: 14500 }));
  assert.strictEqual(F.calculateSettlement('s1').outstanding, 25000);
});

ok('CASE checkout — the settlement says collect, and how much', () => {
  threeMonths();
  const s = F.calculateSettlement('s1');
  assert.strictEqual(s.net, 25000);
  assert.strictEqual(s.action, 'collect');
  assert.strictEqual(s.amount, 25000);
});

ok('CASE checkout — a student who owes nothing is settled', () => {
  setup();
  DB.payments = [bill({ id: 'p_jul', month: '2026-07', amount: 14500, unpaid: 0, status: 'Paid' })];
  const s = F.calculateSettlement('s1');
  assert.strictEqual(s.net, 0);
  assert.strictEqual(s.action, 'settled');
});

ok('CASE cancellation — a credit at checkout is refunded, not left behind', () => {
  setup();
  DB.payments = [bill({ id: 'p_aug', month: '2026-08' })];
  F.applyPayment(DB.payments[0], { amount: 20000, date: '2026-08-05' });   // 5500 over
  const s = F.calculateSettlement('s1');
  assert.strictEqual(s.credit, 5500);
  assert.strictEqual(s.net, -5500);
  assert.strictEqual(s.action, 'refund');
  assert.strictEqual(s.amount, 5500);
});

ok('CASE cancellation — arrears and credit net against each other', () => {
  setup();
  DB.payments = [
    bill({ id: 'p_aug', month: '2026-08' }),
    bill({ id: 'p_sep', month: '2026-09', amount: 0, unpaid: 14500 }),
  ];
  F.applyPayment(DB.payments[0], { amount: 20000, date: '2026-08-05' });   // 5500 credit
  const s = F.calculateSettlement('s1');
  assert.strictEqual(s.outstanding, 14500);
  assert.strictEqual(s.credit, 5500);
  assert.strictEqual(s.net, 9000);
  assert.strictEqual(s.action, 'collect');
});

ok('CASE checkout — a balance recorded on a Paid record is still owed', () => {
  setup();
  /* Reachable: the Edit form takes status from a free dropdown while the
     balance beside it is readonly. Settlement counts records by what they hold,
     not by what their status claims — the same ordering rule as outstandingOf. */
  DB.payments = [bill({ id: 'p_aug', amount: 4000, unpaid: 10500, status: 'Paid' })];
  assert.strictEqual(F.calculateSettlement('s1').outstanding, 10500);
});

ok('CASE checkout — a student with no records settles at zero, not NaN', () => {
  setup();
  const s = F.calculateSettlement('s_nobody');
  assert.strictEqual(s.records, 0);
  assert.strictEqual(s.net, 0);
  assert.strictEqual(s.action, 'settled');
  assert.ok(Number.isFinite(s.outstanding) && Number.isFinite(s.credit));
});

ok('no pro-rata is invented for a mid-month departure', () => {
  threeMonths();
  /* There is no daily rate anywhere in this product — not in settings, not on
     the room type, not on the student. A settlement screen that improvised one
     would hand a departing student a figure the hostel never agreed to. The
     September record is owed in full or it is not owed; nothing here halves it. */
  const s = F.calculateSettlement('s1', { asOf: '2026-09-12' });
  assert.strictEqual(s.outstanding, 25000);
});

// ═══ REPORTS RECONCILE AGAINST THE SAME AUTHORITY ═══════════════════════════
console.log('\nreports answer to the same figures');

ok('report totals agree with the per-record functions', () => {
  const list = threeMonths();
  const t = F.calculateReportTotals(list);
  assert.strictEqual(t.count, 3);
  assert.strictEqual(t.billed,      list.reduce((s, p) => s + F.calculateBill(p), 0));
  assert.strictEqual(t.collected,   list.reduce((s, p) => s + p.amount, 0));
  assert.strictEqual(t.outstanding, list.reduce((s, p) => s + F.calculateOutstanding(p), 0));
});

ok('collected is the same figure the cash reconciliation distributes', () => {
  const list = threeMonths();
  // _cashEvents() spreads exactly p.amount across months, so a report total and
  // the cash view cannot disagree about how much money exists.
  assert.strictEqual(F.calculateReportTotals(list).collected,
                     list.reduce((s, p) => s + p.amount, 0));
});

ok('billed − collected reconciles to outstanding when nothing is over-collected', () => {
  const list = threeMonths();
  const t = F.calculateReportTotals(list);
  assert.strictEqual(t.billed - t.collected, t.outstanding);
});

ok('an over-collection shows up as credit, and the identity still holds', () => {
  setup();
  const list = [bill({ id: 'p_aug' })];
  F.applyPayment(list[0], { amount: 20000, date: '2026-08-05' });
  const t = F.calculateReportTotals(list);
  assert.strictEqual(t.collected, 20000);
  assert.strictEqual(t.outstanding, 0);
  assert.strictEqual(t.credit, 5500);
  assert.strictEqual(t.billed - t.collected + t.credit, t.outstanding);
});

ok('concessions, extras, admission fees and reversals are each reported', () => {
  setup();
  const p = bill({ concession: 1000, extraTotal: 1500, admissionFee: 3000, unpaid: 18000 });
  F.applyPayment(p, { amount: 18000, date: '2026-08-05' });
  F.reversePayment(p, { amount: 500, date: '2026-08-06' });
  const t = F.calculateReportTotals([p]);
  assert.strictEqual(t.concessions, 1000);
  assert.strictEqual(t.extras, 1500);
  assert.strictEqual(t.admissionFees, 3000);
  assert.strictEqual(t.reversed, 500);
});

ok('a filter narrows the set without changing the arithmetic', () => {
  const list = threeMonths();
  const t = F.calculateReportTotals(list, { filter: p => p.status === 'Pending' });
  assert.strictEqual(t.count, 2);
  assert.strictEqual(t.outstanding, 25000);
});

ok('CASE large amounts — a total past exact range is flagged rather than printed', () => {
  setup();
  const t = F.calculateReportTotals([
    bill({ id: 'a', amount: F.MONEY_SAFE_MAX, unpaid: 0, status: 'Paid' }),
    bill({ id: 'b', amount: F.MONEY_SAFE_MAX, unpaid: 0, status: 'Paid' }),
  ]);
  assert.strictEqual(t.safe, false);
});

ok('ordinary hostel figures are safe', () => {
  assert.strictEqual(F.calculateReportTotals(threeMonths()).safe, true);
});

ok('an empty set totals to zero, and is safe', () => {
  const t = F.calculateReportTotals([]);
  assert.strictEqual(t.count, 0);
  assert.strictEqual(t.billed, 0);
  assert.strictEqual(t.collected, 0);
  assert.strictEqual(t.safe, true);
});

// ═══ THE LAYER IS ONE LAYER ═════════════════════════════════════════════════
console.log('\nthe §14 names are the existing answers, not second opinions');

ok('calculateOutstanding is outstandingOf', () => {
  setup();
  const p = bill({ amount: 4000, unpaid: null });
  delete p.unpaid;
  const viaUtils = vm.runInContext('outstandingOf', sandbox)(p);
  assert.strictEqual(F.calculateOutstanding(p), F.money(viaUtils));
  assert.strictEqual(F.calculateOutstanding(p), 10500);
});

ok('calculateCharges is resolveCharges', () => {
  setup();
  const viaUtils = vm.runInContext('resolveCharges', sandbox)(DB.students[0]);
  const c = F.calculateCharges(DB.students[0]);
  assert.strictEqual(c.total, 14500);
  assert.strictEqual(c.total, F.money(viaUtils.total));
  assert.strictEqual(c.rentSource, viaUtils.rentSource);
});

ok('the hostel service model still overrides the record, through the layer', () => {
  setup('rent');
  // The resolveCharges rule survives the §14 wrapper: a rent-only hostel bills
  // no food whatever a record written under an older setting carries.
  assert.strictEqual(F.calculateCharges(DB.students[0]).total, 8000);
  const p = { id: 'p1', studentId: 's1', month: '2026-08', amount: 0, status: 'Pending', messIncluded: true };
  assert.strictEqual(F.calculateOutstanding(p), 8000);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
