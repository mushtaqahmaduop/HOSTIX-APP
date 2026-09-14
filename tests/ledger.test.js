/* --- HOSTYLLO -- the student ledger (warden ledger spec §2.1, §5 step 2) --------

   Loads config.js, utils.js, finance.js and ledger.js the way the app loads
   them and drives the real functions: every collection path in the app goes
   through applyPayment()/reversePayment() or calls ledgerTrack() itself, so what
   is asserted here is what those paths post.

   The table's guards (triggers, reserved channels, append-only writes) need
   better-sqlite3, which is built for the Electron ABI; they are proven in
   tests/ledger-store.spec.js. validateEntry() is pure and is checked here.

   Run:  node tests/ledger.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const assert = require('assert');
const store  = require('../migrations/002-student-ledger');

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
vm.runInContext(R('ledger.js'),  sandbox, { filename: 'ledger.js' });
vm.runInContext('var CUR_USER = { name: "Ali Warden" }; var CUR_ROLE = "warden1";', sandbox);

const L = vm.runInContext(`({
  DB, money, calculateBill, applyPayment, reversePayment, calculateOutstanding,
  ledgerTrack, ledgerTrackAll, ledgerTrackDeleted, ledgerLoaded, ledgerImportIfEmpty,
  ledgerBalance, ledgerEntriesFor, ledgerDrift, ledgerEffect,
  ledgerCollections, ledgerCollectionTotals,
  setUser: (u, r) => { CUR_USER = u; CUR_ROLE = r; },
})`, sandbox);
const { DB } = L;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

/* Values made inside the sandbox have the sandbox's Array prototype, which
   deepStrictEqual treats as a different structure. Compare their JSON. */
const same = (actual, expected, msg) =>
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), msg);
const noDrift = () => same(L.ledgerDrift(), []);

/** An install with no history, so the ledger is ready at once. */
function fresh() {
  DB.payments = []; DB.archive = []; DB.studentLedger = [];
  L.ledgerLoaded();
  L.ledgerImportIfEmpty();
}

/** Recompute a record's balance the way the payment forms do after an edit. */
function reprice(p) {
  const bill = L.calculateBill(p);
  p.unpaid   = Math.max(0, bill - L.money(p.amount));
  p.overpaid = Math.max(0, L.money(p.amount) - bill);
  return p;
}

/** One month record at 8,000 rent + 6,500 mess, nothing collected. */
function rec(o) {
  return reprice(Object.assign({
    id: 'p1', studentId: 's1', studentName: 'Fixture Student', month: 'September 2026',
    monthlyRent: 8000, totalRent: 8000, messCharge: 6500, messIncluded: true,
    extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0, concessionDesc: '',
    amount: 0, method: 'Cash', date: '2026-09-01', status: 'Pending',
  }, o || {}));
}

const last = sid => { const a = L.ledgerEntriesFor(sid); return a[a.length - 1]; };

// ── posting from a record ────────────────────────────────────────────────────

let P;
ok('a new month record posts one charge, with a reason and its owner', () => {
  fresh();
  P = rec(); DB.payments.push(P);
  const out = L.ledgerTrack(P);
  assert.strictEqual(out.length, 1);
  const e = out[0];
  assert.strictEqual(e.type, 'charge');
  assert.strictEqual(e.amount, 14500);
  assert.strictEqual(e.reason, 'Monthly charges · September 2026');
  assert.strictEqual(e.runningBalance, 14500);
  assert.strictEqual(e.createdBy, 'warden1');
  assert.strictEqual(e.createdByName, 'Ali Warden');
  assert.strictEqual(e.paymentRecordId, 'p1');
  assert.strictEqual(e.receiptId, null);
  assert.strictEqual(e.approvedBy, null);
});

ok('tracking a record that has not changed posts nothing', () => {
  assert.strictEqual(L.ledgerTrack(P).length, 0);
  assert.strictEqual(L.ledgerTrack(P).length, 0);
});

ok('a collection through applyPayment() posts a payment owned by whoever collected it', () => {
  L.setUser({ name: 'Bilal Warden' }, 'warden2');
  L.applyPayment(P, { amount: 5000, method: 'JazzCash' });
  const e = last('s1');
  assert.strictEqual(e.type, 'payment');
  assert.strictEqual(e.amount, 5000);
  assert.strictEqual(e.method, 'JazzCash');
  assert.strictEqual(e.part, 'instalment');
  assert.strictEqual(e.createdBy, 'warden2');
  assert.strictEqual(e.createdByName, 'Bilal Warden');
  assert.strictEqual(e.runningBalance, 9500);
  assert.ok(!('reason' in e), 'a payment carries no empty reason');
  noDrift();
  L.setUser({ name: 'Ali Warden' }, 'warden1');
});

ok('a new extra charge posts as a charge; a changed rent posts as an adjustment', () => {
  P.extraCharges = [{ label: 'Late fee', amount: 2000 }];
  P.extraTotal = 2000;
  P.monthlyRent = 9000;
  reprice(P);
  const out = L.ledgerTrack(P, { why: 'Edited on the payment form' });
  const late = out.find(e => e.part === 'extra:Late fee');
  const rent = out.find(e => e.part === 'monthly');
  assert.strictEqual(late.type, 'charge');
  assert.strictEqual(late.amount, 2000);
  assert.strictEqual(late.reason, 'Late fee · September 2026');
  assert.strictEqual(rent.type, 'adjustment');
  assert.strictEqual(rent.amount, 1000);
  assert.ok(/changed 14,500 → 15,500/.test(rent.reason), rent.reason);
  assert.ok(/Edited on the payment form/.test(rent.reason), rent.reason);
  assert.strictEqual(L.ledgerBalance('s1'), 9500 + 3000);
  noDrift();
});

ok('a concession posts once with its reason; reducing it is an adjustment', () => {
  P.concession = 1500; P.concessionDesc = 'Financial hardship';
  reprice(P);
  let out = L.ledgerTrack(P);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'concession');
  assert.strictEqual(out[0].amount, 1500);
  assert.strictEqual(out[0].reason, 'Financial hardship · September 2026');
  P.concession = 1000;
  reprice(P);
  out = L.ledgerTrack(P);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'adjustment');
  assert.strictEqual(out[0].amount, 500);
  assert.strictEqual(out[0].part, 'concession');
  noDrift();
});

ok('a reversal posts an adjustment that raises what is owed, with its reason', () => {
  const before = L.ledgerBalance('s1');
  L.reversePayment(P, { amount: 1000, reason: 'Mis-keyed' });
  const e = last('s1');
  assert.strictEqual(e.type, 'adjustment');
  assert.strictEqual(e.part, 'reversal');
  assert.strictEqual(e.amount, 1000);
  assert.ok(/Collection reversed: Mis-keyed/.test(e.reason), e.reason);
  assert.strictEqual(L.ledgerBalance('s1'), before + 1000);
  noDrift();
});

ok('Amount Paid edited down is an adjustment, never a negative payment', () => {
  P.amount = L.money(P.amount) - 500;
  reprice(P);
  const out = L.ledgerTrack(P, { why: 'Edited on the payment form' });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'adjustment');
  assert.strictEqual(out[0].part, 'collected');
  assert.strictEqual(out[0].amount, 500);
  assert.ok(DB.studentLedger.every(x => x.type !== 'payment' || x.amount > 0));
  noDrift();
});

ok('the ledger balance equals what the Payments page says is owed', () => {
  assert.strictEqual(L.ledgerBalance('s1'), L.calculateOutstanding(P));
});

ok('deleting a record keeps its entries and cancels their effect', () => {
  const n = DB.studentLedger.length;
  const e = L.ledgerTrackDeleted(P);
  assert.strictEqual(e.type, 'adjustment');
  assert.strictEqual(e.part, 'deleted');
  assert.strictEqual(DB.studentLedger.length, n + 1);
  assert.strictEqual(L.ledgerBalance('s1'), 0);
  DB.payments = DB.payments.filter(x => x.id !== P.id);
  noDrift();
  assert.strictEqual(L.ledgerTrack(P).length, 0, 'a deleted record posts nothing more');
});

ok('a payment against a manual name stays out of the ledger', () => {
  const m = rec({ id: 'm1', studentId: '', studentName: 'Walk-in' });
  assert.strictEqual(L.ledgerTrack(m).length, 0);
  assert.strictEqual(L.ledgerTrackDeleted(m), null);
});

ok('running balances follow entry order across a student\'s months', () => {
  fresh();
  const a = rec({ id: 'pa', month: 'August 2026', monthlyRent: 10000, messCharge: 0 });
  const b = rec({ id: 'pb', month: 'September 2026', monthlyRent: 10000, messCharge: 0 });
  DB.payments.push(a, b);
  L.ledgerTrack(a); L.ledgerTrack(b);
  L.applyPayment(a, { amount: 10000 });
  L.applyPayment(b, { amount: 4000 });
  let bal = 0;
  for (const e of L.ledgerEntriesFor('s1')) {
    bal += L.ledgerEffect(e);
    assert.strictEqual(e.runningBalance, bal, 'entry ' + e.id);
  }
  assert.strictEqual(bal, 6000);
  assert.strictEqual(bal, L.calculateOutstanding(a) + L.calculateOutstanding(b));
});

ok('an overpayment leaves the balance below zero, as money held for the student', () => {
  fresh();
  const p = rec({ monthlyRent: 14000, messCharge: 0 });
  DB.payments.push(p); L.ledgerTrack(p);
  L.applyPayment(p, { amount: 15000 });
  assert.strictEqual(L.money(p.overpaid), 1000);
  assert.strictEqual(L.ledgerBalance('s1'), -1000);
  noDrift();
});

ok('a record whose stored balance disagrees with its rent fields is posted as the screen reads it', () => {
  fresh();
  // Fields say 14,500; the record — and so every screen — says 12,000 is owed.
  const p = rec(); p.unpaid = 12000;
  DB.payments.push(p);
  assert.strictEqual(L.ledgerTrack(p)[0].amount, 12000);
  assert.strictEqual(L.ledgerBalance('s1'), L.calculateOutstanding(p));
});

ok('a Settings price change that re-prices a pending month posts an adjustment', () => {
  fresh();
  const p = rec(); DB.payments.push(p); L.ledgerTrack(p);
  p.monthlyRent = 9000; reprice(p);          // what _applyChargesToStudent() writes
  assert.strictEqual(L.ledgerTrackAll('Rent & mess changed in Settings'), 1);
  assert.strictEqual(last('s1').amount, 1000);
  assert.ok(/Rent & mess changed in Settings/.test(last('s1').reason));
});

ok('a start-up repair that only corrects how a record describes itself posts nothing', () => {
  fresh();
  // The pre-split signature: all-in rent beside a separate mess line, booked at 14,500.
  const p = rec({ monthlyRent: 14500 }); p.unpaid = 14500; p.overpaid = 0;
  DB.payments.push(p); L.ledgerTrack(p);
  assert.strictEqual(L.ledgerBalance('s1'), 14500);
  p.monthlyRent = 8000;                      // what repairPaymentComposition() writes
  assert.strictEqual(L.ledgerTrackAll('Record repaired at start-up'), 0);
});

ok('extras whose total disagrees with their lines are posted as the billed total', () => {
  fresh();
  const p = rec({ extraCharges: [{ label: 'Fan', amount: 500 }], extraTotal: 800 });
  DB.payments.push(p);
  const parts = L.ledgerTrack(p).map(e => e.part + '=' + e.amount).sort();
  same(parts, ['extra:Extra charges=800', 'monthly=14500']);
  noDrift();
});

// ── the one-time import ──────────────────────────────────────────────────────

ok('before the import has run, tracking posts nothing', () => {
  DB.payments = [rec({ id: 'old' })]; DB.archive = []; DB.studentLedger = [];
  L.ledgerLoaded();
  assert.strictEqual(L.ledgerTrack(DB.payments[0]).length, 0);
  assert.strictEqual(DB.studentLedger.length, 0);
});

ok('existing history is imported once, oldest first, with collectors named and no account id', () => {
  const july = rec({
    id: 'jul', month: 'July 2026', date: '2026-07-01', paidDate: '2026-07-05',
    concession: 1000, concessionDesc: 'Hardship', amount: 4500,
    reversals: [{ amount: 500, date: '2026-07-20', reason: 'Refund', by: 'Admin' }],
  });
  const august = rec({
    id: 'aug', month: 'August 2026', date: '2026-08-01', amount: 14500, status: 'Paid',
    partialPayments: [
      { date: '2026-08-03', amount: 10000, method: 'Cash', collectedBy: 'Bilal' },
      { date: '2026-08-10', amount: 4500, method: 'JazzCash', collectedBy: 'Sara' },
    ],
  });
  const june = Object.assign(rec({ id: 'jun', month: 'June 2026', date: '2026-06-01',
    amount: 14500, status: 'Paid', paidDate: '2026-06-02' }), { _src: 'payments' });
  DB.payments = [august, july]; DB.archive = [june, { id: 'x', _src: 'expenses', amount: 99 }];
  DB.studentLedger = [];
  L.ledgerLoaded();

  const n = L.ledgerImportIfEmpty();
  assert.ok(n > 0);
  const all = DB.studentLedger;
  assert.strictEqual(all.length, n);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].createdAt <= all[i].createdAt, 'date order at ' + i);
  assert.ok(all.every(e => e.imported === true && e.createdBy === null));
  same(all.filter(e => e.part === 'instalment').map(e => e.createdByName), ['Bilal', 'Sara']);
  assert.strictEqual(all[0].paymentRecordId, 'jun', 'the archived June record comes first');
  assert.ok(!all.some(e => e.paymentRecordId === 'x'), 'archived expenses are not imported');
  assert.strictEqual(all.find(e => e.part === 'reversal').amount, 500);
  assert.strictEqual(all.find(e => e.type === 'concession').reason, 'Hardship · July 2026');
  noDrift();
  assert.strictEqual(L.ledgerBalance('s1'), L.calculateOutstanding(july) + L.calculateOutstanding(august));
  assert.strictEqual(L.ledgerImportIfEmpty(), 0, 'a second import does nothing');
  assert.strictEqual(store.validateAll(all), null);
});

ok('a legacy record with no rent on it is priced the way the Payments page prices it', () => {
  const legacy = { id: 'leg', studentId: 's9', month: 'March 2025', date: '2025-03-01',
                   amount: 3000, unpaid: 2000, status: 'Pending' };
  DB.payments = [legacy]; DB.archive = []; DB.studentLedger = [];
  L.ledgerLoaded(); L.ledgerImportIfEmpty();
  assert.strictEqual(DB.studentLedger[0].type, 'charge');
  assert.strictEqual(DB.studentLedger[0].amount, 5000);
  assert.strictEqual(L.ledgerBalance('s9'), L.calculateOutstanding(legacy));
});

// ── reading collections back (spec §5 step 3) ────────────────────────────────

ok('an account\'s collections are the payments it posted, newest first, by method', () => {
  fresh();
  const p = rec(); DB.payments.push(p); L.ledgerTrack(p);
  L.setUser({ name: 'Sara Warden' }, 'w_sara');
  L.applyPayment(p, { amount: 5000, method: 'JazzCash' });
  L.applyPayment(p, { amount: 3000, method: 'Cash' });
  const rows = L.ledgerCollections('w_sara');
  same(rows.map(r => r.kind + ':' + r.amount), ['collected:3000', 'collected:5000']);
  const t = L.ledgerCollectionTotals(rows);
  assert.strictEqual(t.holding, 8000);
  assert.strictEqual(t.count, 2);
  assert.strictEqual(t.today, 8000);
  assert.strictEqual(t.month, 8000);
  same(t.byMethod.map(m => m.method + '=' + m.amount), ['Cash=3000', 'JazzCash=5000']);
  assert.strictEqual(L.ledgerCollections('warden1').length, 0, 'the charge posted by nobody\'s collection');
});

ok('a reversal counts against whoever records it, as its own row', () => {
  L.setUser({ name: 'Owner' }, 'warden1');
  const p = DB.payments[0];
  L.reversePayment(p, { amount: 1000, reason: 'Wrong amount' });
  assert.strictEqual(L.ledgerCollectionTotals(L.ledgerCollections('w_sara')).holding, 8000);
  const mine = L.ledgerCollections('warden1');
  same(mine.map(r => r.kind + ':' + r.amount), ['reversed:-1000']);
  const t = L.ledgerCollectionTotals(mine);
  assert.strictEqual(t.holding, -1000);
  assert.strictEqual(t.count, 0, 'a reversal is not a collection');
});

ok('an amount edited down counts against the account that edited it', () => {
  const p = DB.payments[0];
  p.amount = L.money(p.amount) - 500; reprice(p);
  L.ledgerTrack(p, { why: 'Edited on the payment form' });
  same(L.ledgerCollections('warden1').map(r => r.kind), ['edited', 'reversed']);
});

ok('a deleted record\'s collections stay in the collector\'s total, marked', () => {
  const p = DB.payments[0];
  L.ledgerTrackDeleted(p);
  DB.payments = [];
  const rows = L.ledgerCollections('w_sara');
  assert.ok(rows.every(r => r.deleted === true));
  assert.strictEqual(L.ledgerCollectionTotals(rows).holding, 8000);
});

ok('imported history is in nobody\'s collections', () => {
  DB.payments = [rec({ id: 'imp', amount: 14500, status: 'Paid',
    partialPayments: [{ date: '2026-08-03', amount: 14500, collectedBy: 'Ali Warden' }] })];
  DB.archive = []; DB.studentLedger = [];
  L.ledgerLoaded(); L.ledgerImportIfEmpty();
  assert.ok(DB.studentLedger.some(e => e.type === 'payment'));
  assert.strictEqual(L.ledgerCollections('warden1').length, 0);
  assert.strictEqual(L.ledgerCollections(null).length, 0);
});

// ── the store's validation ───────────────────────────────────────────────────

ok('every entry this file posts passes the store\'s validation', () => {
  assert.strictEqual(store.validateAll(DB.studentLedger), null);
});

ok('the store refuses entries that cannot be summed or explained', () => {
  const good = { id: 'sl_1', studentId: 's1', type: 'payment', amount: 100,
                 runningBalance: 0, createdAt: '2026-09-14T00:00:00Z' };
  assert.strictEqual(store.validateEntry(good), null);
  const bad = o => store.validateEntry(Object.assign({}, good, o));
  assert.ok(bad({ amount: 0 }));
  assert.ok(bad({ amount: -5 }));
  assert.ok(bad({ amount: 10.5 }));
  assert.ok(bad({ type: 'refund' }));
  assert.ok(bad({ studentId: '' }));
  assert.ok(bad({ id: '' }));
  assert.ok(bad({ runningBalance: undefined }));
  assert.ok(bad({ type: 'charge' }), 'a charge needs a reason');
  assert.ok(bad({ type: 'concession', reason: '  ' }), 'a blank reason is no reason');
  assert.ok(bad({ type: 'adjustment', amount: 0, reason: 'x' }));
  assert.strictEqual(bad({ type: 'adjustment', amount: -300, reason: 'Record deleted' }), null);
  assert.ok(store.validateAll([good, good]), 'a duplicate id is refused');
  assert.ok(store.validateAll('nope'));
});

ok('a backup names its ledger by table name or by the in-memory key', () => {
  assert.strictEqual(store.backupEntries({ rooms: [] }), null);
  same(store.backupEntries({ student_ledger: [1] }), [1]);
  same(store.backupEntries({ studentLedger: [2] }), [2]);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
