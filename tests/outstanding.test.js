/* --- HOSTYLLO -- outstandingOf(), the single answer to "what is still owed" --

   D-1: the same payment record was worth nothing on the Payments screen and
   its full amount in Reports. 29 call sites fell back to `p.amount` when a
   record carried no `unpaid` field, 26 fell back to 0, and reports.js did both
   — its Pending card one way, its own transaction table the other. A warden
   chasing arrears from one screen collected a different set than one chasing
   them from the other, and neither figure was labelled as an estimate.

   These tests load config.js and utils.js the way the app loads them and drive
   the real outstandingOf(), so what is asserted here is what the screens print.

   The two properties that matter most: a recorded balance is never overruled
   by a status, and a record with no balance recorded is priced from
   resolveCharges() rather than guessed at.

   Run:  node tests/outstanding.test.js
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
vm.runInContext(R('config.js'), sandbox, { filename: 'config.js' });
vm.runInContext(R('utils.js'),  sandbox, { filename: 'utils.js' });

// config.js declares DB with `let`, so it lives in the context's lexical scope
// and never becomes a property of the sandbox object. Function declarations do.
const { DB, outstandingOf, resolveCharges } =
  vm.runInContext('({ DB, outstandingOf, resolveCharges })', sandbox);

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
}
const pay = extra => Object.assign({ id: 'p1', studentId: 's1', month: '2026-08' }, extra || {});

console.log('\na recorded balance is the answer');

ok('an explicit unpaid is returned as recorded', () => {
  setup();
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 4000, unpaid: 10500 })), 10500);
});

ok('an explicit unpaid of 0 is 0, not a fallback', () => {
  setup();
  // `p.unpaid || p.amount` (receipt.js, students.js) got this wrong: a settled
  // record fell through the || and reported the whole amount as still owed.
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 14500, unpaid: 0 })), 0);
});

ok('a recorded balance survives a Paid status', () => {
  setup();
  // Reachable: the Edit Payment form takes status from a free dropdown while
  // the balance beside it is readonly. That money is owed to someone.
  assert.strictEqual(outstandingOf(pay({ status: 'Paid', amount: 4000, unpaid: 10500 })), 10500);
});

console.log('\nwith no balance recorded, the charge authority decides');

ok('a legacy Pending record is priced from resolveCharges, not from amount', () => {
  setup();
  // 8000 rent + 6500 mess = 14500 billed, 4000 collected.  D-1 in one line:
  // Payments used to say 0 and Reports used to say 4000. Both were wrong.
  const p = pay({ status: 'Pending', amount: 4000 });
  assert.strictEqual(resolveCharges(DB.students[0]).total, 14500);
  assert.strictEqual(outstandingOf(p), 10500);
});

ok('a legacy record with nothing collected owes the whole charge', () => {
  setup();
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0 })), 14500);
});

ok('a legacy Paid record owes nothing, so unfiltered sums stay honest', () => {
  setup();
  // payments.js sums over the whole filtered list, never just Pending. Without
  // this the Outstanding card would count every settled legacy record in full.
  assert.strictEqual(outstandingOf(pay({ status: 'Paid', amount: 14500 })), 0);
});

ok('collections beyond the charge settle at 0 rather than going negative', () => {
  setup();
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 20000 })), 0);
});

console.log('\nthe derivation follows the same rules the bill does');

ok('a concession reduces what is owed', () => {
  setup();
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0, concession: 2000 })), 12500);
});

ok('an admission fee increases it', () => {
  setup();
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0, admissionFee: 3000 })), 17500);
});

ok('a rent-only hostel bills no food, whatever the record says', () => {
  setup('rent');
  // The hostel's answer overrides the record's — the resolveCharges rule.
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0, messIncluded: true })), 8000);
});

ok('a student taken off the mess owes rent only', () => {
  setup('rent_mess_optional');
  DB.students[0].messOptIn = false;
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0 })), 8000);
});

ok('a bundled hostel still bills mess when the record says otherwise', () => {
  setup('rent_mess_bundled');
  // The under-billing case. A hostel that switched from optional to bundled
  // carries records stamped messIncluded:false; honouring them would quietly
  // drop 6500 a month off its arrears for every one of them.
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0, messIncluded: false })), 14500);
});

ok('an optional hostel lets the record decide, because there it is a fact', () => {
  setup('rent_mess_optional');
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0, messIncluded: false })), 8000);
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0, messIncluded: true  })), 14500);
});

console.log('\nrecords whose student is gone still print a number');

ok('a deleted student falls back to the rent recorded on the payment', () => {
  setup();
  DB.students = [];
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', amount: 0, monthlyRent: 7000, messCharge: 5000 })), 12000);
});

ok('a record with no student and no recorded rent owes 0, not NaN', () => {
  setup();
  DB.students = [];
  const r = outstandingOf(pay({ status: 'Pending', amount: 0 }));
  assert.ok(Number.isFinite(r), 'must be a finite number, got ' + r);
  assert.strictEqual(r, 0);
});

console.log('\nnothing throws on the shapes the field actually holds');

ok('a null or undefined payment is 0', () => {
  setup();
  assert.strictEqual(outstandingOf(null), 0);
  assert.strictEqual(outstandingOf(undefined), 0);
});

ok('an unparseable unpaid does not poison a total', () => {
  setup();
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', unpaid: 'abc', amount: 0 })), 0);
});

ok('a numeric string balance is honoured', () => {
  setup();
  assert.strictEqual(outstandingOf(pay({ status: 'Pending', unpaid: '2500', amount: 0 })), 2500);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
