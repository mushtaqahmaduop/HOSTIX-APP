/* --- HOSTYLLO -- _studentInPeriod(): who was on the roster in a period -------

   Finance Phase 4, audit G9. A student with no join date used to be on EVERY
   period's roster merely for being Active today. "Active" is a fact about
   today; it may only speak for today. Before that, a student is placed only by
   what their own records prove — the day the record was entered, or the
   earliest month billed to them.

   Also holds the load-order guarantee of G7: periods.js stands on utils.js
   alone, with no screen module loaded.

   Run:  node tests/periods.test.js
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
for (const f of ['config.js', 'utils.js', 'periods.js']) {
  vm.runInContext(R(f), sandbox, { filename: f });
}

const S = vm.runInContext('({ DB, _studentInPeriod, thisMonth })', sandbox);
const { DB, _studentInPeriod } = S;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

// Months relative to today, so the test does not rot.
const NOW = S.thisMonth();
const shift = n => {
  const [y, m] = NOW.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
const M3 = shift(-3), M2 = shift(-2), M1 = shift(-1), NEXT = shift(1);

const reset = (payments = []) => { DB.payments = payments; };

ok('a join date still decides, as before', () => {
  reset();
  const s = { id: 'a', status: 'Active', joinDate: M2 + '-10' };
  assert.strictEqual(_studentInPeriod(s, M3), false);
  assert.strictEqual(_studentInPeriod(s, M2), true);
  assert.strictEqual(_studentInPeriod(s, NOW), true);
});

ok('a leave date still ends the tenancy, as before', () => {
  reset();
  const s = { id: 'b', status: 'Left', joinDate: M3 + '-01', leftDate: M2 + '-15' };
  assert.strictEqual(_studentInPeriod(s, M2), true);
  assert.strictEqual(_studentInPeriod(s, M1), false);
});

ok('G9: Active with no join date and no other evidence counts for today only', () => {
  reset();
  const s = { id: 'c', status: 'Active' };
  assert.strictEqual(_studentInPeriod(s, M3), false);
  assert.strictEqual(_studentInPeriod(s, M1), false);
  assert.strictEqual(_studentInPeriod(s, NOW), true);
  assert.strictEqual(_studentInPeriod(s, NEXT), true);
});

ok('G9: the day the record was entered places them from then', () => {
  reset();
  const s = { id: 'd', status: 'Active', createdAt: M2 + '-20' };
  assert.strictEqual(_studentInPeriod(s, M3), false);
  assert.strictEqual(_studentInPeriod(s, M2), true);
  assert.strictEqual(_studentInPeriod(s, M1), true);
});

ok('G9: the earliest month billed to them places them, if sooner', () => {
  reset([{ id: 'p1', studentId: 'e', month: M3, amount: 0 },
         { id: 'p2', studentId: 'x', month: shift(-9), amount: 0 }]);   // someone else's
  const s = { id: 'e', status: 'Active', createdAt: M1 + '-01' };
  assert.strictEqual(_studentInPeriod(s, shift(-4)), false);
  assert.strictEqual(_studentInPeriod(s, M3), true);
});

ok('G9: a year key covering today includes them; an earlier year does not', () => {
  reset();
  const s = { id: 'f', status: 'Active' };
  assert.strictEqual(_studentInPeriod(s, NOW.slice(0, 4)), true);
  assert.strictEqual(_studentInPeriod(s, String(Number(NOW.slice(0, 4)) - 1)), false);
});

ok('not Active, no join date: off the roster, as before', () => {
  reset([{ id: 'p3', studentId: 'g', month: M2, amount: 5000 }]);
  const s = { id: 'g', status: 'Left', createdAt: M3 + '-01' };
  assert.strictEqual(_studentInPeriod(s, M2), false);
  assert.strictEqual(_studentInPeriod(s, NOW), false);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
