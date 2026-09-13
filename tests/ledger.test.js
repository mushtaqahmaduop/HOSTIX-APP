/* --- HOSTYLLO -- the warden collection ledger (Phase 1) ----------------------

   The owner's problem, in their words: several wardens take cash, and at night
   the admin rebuilds who collected what from paper receipt copies. The ledger
   is the answer — one immutable entry per movement of money, attributed to the
   account that recorded it — and these tests hold the property everything else
   stands on:

       for every live payment record,  ledgerNet(record.id) === record.amount

   If that ever breaks, a warden's handover total is a number the system cannot
   stand behind, which is worse than no total at all.

   HOW ENTRIES ARRIVE. Explicitly, from applyPayment() and reversePayment(),
   which know the method, note and reason. And as a safety net, from
   ledgerSync(), which saveDB() calls before every write: any record whose
   collected amount no longer matches its ledger gets an entry for the
   difference. That net exists because collected money is written in more
   places than the §14 functions — two "update the pending record" merges, the
   Edit form, a dashboard inline edit, admission, the Excel import — and a
   ledger that only instruments the paths someone remembered is a ledger that
   silently disagrees with the records.

   OLD DATA. ledgerBackfill() imports each existing record's instalment trail
   and reversals once, as `imported` entries, with a residual entry for any
   collected money the trail does not account for. Deterministic ids make a
   second run a no-op, and main.js accepts an identical resend.

   Run:  node tests/ledger.test.js
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
  // The session, as auth-nev.js leaves it: CUR_ROLE is the account KEY (stable
  // across renames), CUR_USER the account itself.
  CUR_ROLE: 'uA',
  CUR_USER: { name: 'Warden A', username: 'wardena' },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(R('config.js'),  sandbox, { filename: 'config.js' });
vm.runInContext(R('utils.js'),   sandbox, { filename: 'utils.js' });
vm.runInContext(R('finance.js'), sandbox, { filename: 'finance.js' });

const F = vm.runInContext(`({
  DB, money, applyPayment, reversePayment,
  ledgerAppend, ledgerIndex, ledgerNet, ledgerFor, ledgerSync, ledgerBackfill, LEDGER_SIGN
})`, sandbox);
const { DB } = F;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

const as = (role, name) => { sandbox.CUR_ROLE = role; sandbox.CUR_USER = { name }; };

function setup() {
  as('uA', 'Warden A');
  DB.settings.serviceModel = 'rent_mess_bundled';
  DB.settings.roomTypes = [{ id: 't1', name: '2-Seater', capacity: 2, defaultRent: 8000, defaultMess: 2000 }];
  DB.rooms    = [{ id: 'r1', number: '1', typeId: 't1' }];
  DB.students = [{ id: 's1', name: 'Test Student', roomId: 'r1' }];
  DB.payments = [];
  DB.archive  = [];
  DB.ledger   = [];
}

/** A 10,000 bill, nothing collected. */
const record = extra => Object.assign({
  id: 'p1', studentId: 's1', studentName: 'Test Student', month: '2026-09',
  amount: 0, monthlyRent: 8000, messCharge: 2000, messIncluded: true,
  extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0,
  unpaid: 10000, status: 'Pending', method: 'Cash', date: '2026-09-01',
}, extra || {});

/** The invariant, over every live record. */
function assertConserved(label) {
  const idx = F.ledgerIndex();
  for (const p of DB.payments) {
    assert.strictEqual(F.ledgerNet(p.id, idx), F.money(p.amount),
      `${label || ''} record ${p.id}: ledger nets ${F.ledgerNet(p.id, idx)} but the record holds ${p.amount}`);
  }
}

console.log('\nexplicit entries from the §14 functions');

ok('applyPayment writes one payment entry, attributed to the account key and name', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 5000, method: 'Cash', date: '2026-09-03', note: 'First instalment' });
  assert.strictEqual(DB.ledger.length, 1);
  const e = DB.ledger[0];
  assert.strictEqual(e.type, 'payment');
  assert.strictEqual(e.amount, 5000);
  assert.strictEqual(e.paymentId, 'p1');
  assert.strictEqual(e.studentId, 's1');
  assert.strictEqual(e.month, '2026-09');
  assert.strictEqual(e.method, 'Cash');
  assert.strictEqual(e.date, '2026-09-03');
  assert.strictEqual(e.byId, 'uA');
  assert.strictEqual(e.byName, 'Warden A');
  assert.ok(/^lg_/.test(e.id), 'entry id is not lg_-prefixed');
  assert.ok(!isNaN(Date.parse(e.createdAt)), 'createdAt is not a timestamp');
  assert.ok(!e.imported, 'a live collection must not be marked imported');
  assertConserved();
});

ok('two wardens collecting on one record keep their own entries', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 5000, method: 'Cash' });
  as('uB', 'Warden B');
  F.applyPayment(p, { amount: 3000, method: 'JazzCash' });
  const byWho = F.ledgerFor({ paymentId: 'p1' }).map(e => e.byId + ':' + e.amount);
  assert.deepStrictEqual(byWho, ['uA:5000', 'uB:3000']);
  assertConserved();
});

ok('reversePayment writes a reversal carrying its reason, and conservation holds', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 10000 });
  F.reversePayment(p, { amount: 1500, reason: 'Keyed 10,000 for 8,500' });
  const r = DB.ledger[1];
  assert.strictEqual(r.type, 'reversal');
  assert.strictEqual(r.amount, 1500);
  assert.strictEqual(r.reason, 'Keyed 10,000 for 8,500');
  assertConserved();
});

ok('a refused collection or reversal writes nothing', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 0 });
  F.applyPayment(p, { amount: -50 });
  F.reversePayment(p, { amount: 100 });          // nothing collected yet
  assert.strictEqual(DB.ledger.length, 0);
});

ok('a fractional amount is recorded as the whole rupee the record holds', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 2500.5 });
  assert.strictEqual(DB.ledger[0].amount, 2501);
  assertConserved();
});

console.log('\nledgerSync — the net under every other write path');

ok('an amount raised outside applyPayment (a merge path) becomes a payment for the difference', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 4000 });
  as('uB', 'Warden B');
  p.amount = 7000;                                // what payments.js:3170 does
  const r = F.ledgerSync([ 'p1' ]);
  assert.strictEqual(r.added, 1);
  const e = DB.ledger[1];
  assert.strictEqual(e.type, 'payment');
  assert.strictEqual(e.amount, 3000);
  assert.strictEqual(e.byId, 'uB');
  assert.strictEqual(e.source, 'sync');
  assert.strictEqual(e.method, 'Cash');
  assertConserved();
});

ok('an amount LOWERED on the Edit form is recorded as a reversal, not lost', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 9000 });
  p.amount = 6000;                                // what submitEditPayment does
  F.ledgerSync([ 'p1' ]);
  const e = DB.ledger[1];
  assert.strictEqual(e.type, 'reversal');
  assert.strictEqual(e.amount, 3000);
  assert.ok(e.reason, 'a lowered amount must say why it is in the ledger');
  assertConserved();
});

ok('a record created with money already on it (admission, Excel import) is recorded', () => {
  setup();
  DB.payments.push(record({ id: 'p9', amount: 12000, method: 'Bank Transfer' }));
  F.ledgerSync([]);
  assert.strictEqual(DB.ledger.length, 1);
  assert.strictEqual(DB.ledger[0].amount, 12000);
  assert.strictEqual(DB.ledger[0].method, 'Bank Transfer');
  assertConserved();
});

ok('a record created with nothing collected writes nothing', () => {
  setup();
  DB.payments.push(record({ id: 'p0', amount: 0 }));
  F.ledgerSync([]);
  assert.strictEqual(DB.ledger.length, 0);
});

ok('sync is idempotent: a second save with no change adds nothing', () => {
  setup();
  const p = record(); DB.payments.push(p);
  p.amount = 5000;
  F.ledgerSync([]);
  F.ledgerSync(['p1']);
  F.ledgerSync(['p1']);
  assert.strictEqual(DB.ledger.length, 1);
  assertConserved();
});

ok('a deleted record leaves a record_deleted entry that nets it to zero', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 6000 });
  F.reversePayment(p, { amount: 1000, reason: 'x' });
  DB.payments = [];                               // what deletePayment() does
  F.ledgerSync(['p1']);
  const e = DB.ledger[DB.ledger.length - 1];
  assert.strictEqual(e.type, 'record_deleted');
  assert.strictEqual(e.amount, 5000);
  assert.strictEqual(e.paymentId, 'p1');
  assert.strictEqual(F.ledgerNet('p1'), 0);
});

ok('deleting a record that collected nothing writes nothing', () => {
  setup();
  DB.payments = [];
  F.ledgerSync(['p_never_paid']);
  assert.strictEqual(DB.ledger.length, 0);
});

ok('a record moved to the archive by retention is NOT a deletion', () => {
  setup();
  const p = record({ status: 'Paid' }); DB.payments.push(p);
  F.applyPayment(p, { amount: 10000 });
  DB.archive.push(Object.assign({}, p, { _src: 'payments' }));
  DB.payments = [];
  F.ledgerSync(['p1']);
  assert.strictEqual(DB.ledger.length, 1, 'archiving wrote a ledger entry');
});

ok('money is conserved across a mixed day of every write path', () => {
  setup();
  const a = record({ id: 'a' }), b = record({ id: 'b' }), c = record({ id: 'c' });
  DB.payments.push(a, b, c);
  F.applyPayment(a, { amount: 5000 });
  as('uB', 'Warden B');
  b.amount = 2500;                                          // merge
  F.applyPayment(c, { amount: 10000 });
  F.reversePayment(c, { amount: 400, reason: 'miscount' });
  as('uA', 'Warden A');
  a.amount = 3000;                                          // edit lowered
  DB.payments.push(record({ id: 'd', amount: 700 }));       // created paid
  F.ledgerSync(['a', 'b', 'c']);
  assertConserved('mixed day');
});

console.log('\nledgerBackfill — existing installs');

ok('a legacy trail imports entry by entry, attributed by name, marked imported', () => {
  setup();
  DB.payments.push(record({
    amount: 4000, collectedBy: 'Latest Name',
    partialPayments: [
      { date: '2026-08-02', amount: 3000, method: 'Cash', collectedBy: 'Ali', note: 'Collected' },
      { date: '2026-08-10', amount: 2000, method: 'Cash', collectedBy: 'Bilal', note: 'Instalment' },
    ],
    reversals: [{ date: '2026-08-11', amount: 1000, method: 'Cash', reason: 'Refund', by: 'Admin' }],
  }));
  const r = F.ledgerBackfill();
  assert.strictEqual(r.added, 3);
  const types = DB.ledger.map(e => e.type + ':' + e.amount + ':' + e.byName);
  assert.deepStrictEqual(types, ['payment:3000:Ali', 'payment:2000:Bilal', 'reversal:1000:Admin']);
  DB.ledger.forEach(e => {
    assert.strictEqual(e.imported, true);
    assert.strictEqual(e.byId, null, 'a legacy name must not be guessed into an account key');
  });
  assertConserved();
});

ok('collected money the trail does not account for arrives as a residual entry', () => {
  setup();
  DB.payments.push(record({
    amount: 9000, collectedBy: 'Warden X',
    partialPayments: [{ date: '2026-08-02', amount: 4000, collectedBy: 'Ali' }],
  }));
  F.ledgerBackfill();
  assert.deepStrictEqual(DB.ledger.map(e => e.amount), [4000, 5000]);
  assert.strictEqual(DB.ledger[1].byName, 'Warden X');
  assertConserved();
});

ok('a record with no trail imports as one entry of what it collected', () => {
  setup();
  DB.payments.push(record({ amount: 8000, collectedBy: 'Old Warden', date: '2026-07-05' }));
  F.ledgerBackfill();
  assert.strictEqual(DB.ledger.length, 1);
  assert.strictEqual(DB.ledger[0].amount, 8000);
  assert.strictEqual(DB.ledger[0].date, '2026-07-05');
  assertConserved();
});

ok('a trail that claims MORE than was collected is not believed — one entry instead', () => {
  setup();
  DB.payments.push(record({
    amount: 5000,
    partialPayments: [{ amount: 5000 }, { amount: 5000 }],   // the duplicated-trail bug
  }));
  F.ledgerBackfill();
  assert.strictEqual(DB.ledger.length, 1);
  assert.strictEqual(DB.ledger[0].amount, 5000);
  assertConserved();
});

ok('backfill is idempotent, and ids are deterministic', () => {
  setup();
  DB.payments.push(record({ amount: 3000, partialPayments: [{ amount: 3000, collectedBy: 'Ali' }] }));
  F.ledgerBackfill();
  const ids = DB.ledger.map(e => e.id);
  F.ledgerBackfill();
  assert.strictEqual(DB.ledger.length, 1, 'a second backfill added entries');
  assert.ok(ids[0].indexOf('p1') !== -1, 'imported id does not name its record');
  // A fresh install of the same data produces the same ids — main.js relies on it.
  DB.ledger = [];
  F.ledgerBackfill();
  assert.deepStrictEqual(DB.ledger.map(e => e.id), ids);
});

ok('a record that already has ledger entries is left alone', () => {
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 2000 });
  p.partialPayments.push({ amount: 999, collectedBy: 'should not import' });
  F.ledgerBackfill();
  assert.strictEqual(DB.ledger.length, 1);
});

ok('archived payment records are imported; archived expenses are not', () => {
  setup();
  DB.archive.push(record({ id: 'old1', amount: 6000, _src: 'payments' }));
  DB.archive.push({ id: 'e1', amount: 900, _src: 'expenses', date: '2026-01-01' });
  F.ledgerBackfill();
  assert.deepStrictEqual(DB.ledger.map(e => e.paymentId), ['old1']);
});

ok('a record with nothing collected and nothing reversed imports nothing', () => {
  setup();
  DB.payments.push(record({ amount: 0 }));
  F.ledgerBackfill();
  assert.strictEqual(DB.ledger.length, 0);
});

console.log('\nthe sign table');

ok('only money-moving types count toward a record\'s net', () => {
  assert.strictEqual(F.LEDGER_SIGN.payment, 1);
  assert.strictEqual(F.LEDGER_SIGN.reversal, -1);
  assert.strictEqual(F.LEDGER_SIGN.record_deleted, -1);
  setup();
  const p = record(); DB.payments.push(p);
  F.applyPayment(p, { amount: 1000 });
  F.ledgerAppend({ type: 'concession_request', paymentId: 'p1', amount: 500, reason: 'hardship' });
  assert.strictEqual(F.ledgerNet('p1'), 1000);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
