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

const S = vm.runInContext(`({ DB, _studentInPeriod, thisMonth, studentStays, studentRoomAt,
  studentInPeriodInfo, studentCloseStay })`, sandbox);
const { DB, _studentInPeriod, studentStays, studentRoomAt, studentInPeriodInfo, studentCloseStay } = S;

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

const reset = (payments = [], extra = {}) => {
  DB.payments = payments;
  DB.roomShifts = extra.shifts || [];
  DB.cancellations = extra.cancellations || [];
  DB.archive = extra.archive || [];
  DB.rooms = [{ id: 'r1', number: 1 }, { id: 'r2', number: 2 }, { id: 'r3', number: 3 }];
};

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

ok('left, no join date: placed by the record, ended by the last bill', () => {
  reset([{ id: 'p3', studentId: 'g', month: M2, amount: 5000 }]);
  const s = { id: 'g', status: 'Left', createdAt: M3 + '-01' };
  assert.strictEqual(_studentInPeriod(s, shift(-4)), false);
  assert.strictEqual(_studentInPeriod(s, M3), true);
  assert.strictEqual(_studentInPeriod(s, M2), true);
  assert.strictEqual(_studentInPeriod(s, M1), false);
  assert.strictEqual(_studentInPeriod(s, NOW), false);
});

/* ── Phase 5 — stays ─────────────────────────────────────────────────────── */

ok('a room shift splits the stay: the old room before it, the new from it', () => {
  reset([], { shifts: [{ studentId: 'h', fromRoomId: 'r1', toRoomId: 'r2', date: M2 + '-15' }] });
  const s = { id: 'h', status: 'Active', joinDate: M3 + '-05', roomId: 'r2' };
  assert.strictEqual(studentRoomAt(s, M3 + '-20'), 'r1');
  assert.strictEqual(studentRoomAt(s, M2 + '-14'), 'r1');
  assert.strictEqual(studentRoomAt(s, M2 + '-15'), 'r2');
  assert.strictEqual(studentRoomAt(s, M3 + '-01'), null, 'not yet admitted');
  assert.strictEqual(studentInPeriodInfo(s, M3).roomId, 'r1', 'the report for M3 names the M3 room');
  assert.strictEqual(studentInPeriodInfo(s, M1).roomId, 'r2');
});

ok('stay ended: left with no leftDate ends on the confirmed vacate date', () => {
  reset([{ id: 'q', studentId: 'i', month: M1 }],
        { cancellations: [{ studentId: 'i', status: 'Confirmed', vacateDate: M2 + '-20' }] });
  const s = { id: 'i', status: 'Left', joinDate: M3 + '-01', roomId: 'r1' };
  assert.strictEqual(studentStays(s).pop().to, M2 + '-20');
  assert.strictEqual(_studentInPeriod(s, M1), false);
  assert.strictEqual(studentInPeriodInfo(s, M2).left, true);
});

ok('stay ended: with no vacate date, the end of the last month billed', () => {
  reset([{ id: 'q1', studentId: 'j', month: M3 }, { id: 'q2', studentId: 'j', month: M2 }]);
  const s = { id: 'j', status: 'Left', joinDate: M3 + '-01' };
  assert.strictEqual(_studentInPeriod(s, M2), true);
  assert.strictEqual(_studentInPeriod(s, M1), false);
});

ok('stay ended: with nothing at all, the end of the month they arrived', () => {
  reset();
  const s = { id: 'k', status: 'Left', joinDate: M3 + '-10' };
  assert.strictEqual(_studentInPeriod(s, M3), true);
  assert.strictEqual(_studentInPeriod(s, M2), false);
});

ok('archived bills count as evidence too', () => {
  reset([], { archive: [{ _src: 'payments', studentId: 'l', month: shift(-8) }] });
  const s = { id: 'l', status: 'Active' };
  assert.strictEqual(_studentInPeriod(s, shift(-8)), true);
  assert.strictEqual(_studentInPeriod(s, shift(-9)), false);
});

ok('a resident is never ended by a stale leftDate', () => {
  reset();
  const s = { id: 'm', status: 'Active', joinDate: M3 + '-01', leftDate: M2 + '-01' };
  assert.strictEqual(_studentInPeriod(s, NOW), true);
});

ok('re-admission keeps the first stay: studentCloseStay() before the overwrite', () => {
  reset();
  const s = { id: 'n', status: 'Left', joinDate: shift(-6) + '-01', leftDate: shift(-5) + '-28', roomId: 'r3' };
  studentCloseStay(s);
  // what submitRestoreStudent() then does:
  s.joinDate = M1 + '-01'; s.leftDate = ''; s.status = 'Active'; s.roomId = 'r1'; s.restoredAt = M1 + '-01';
  assert.strictEqual(_studentInPeriod(s, shift(-6)), true, 'first stay survives');
  assert.strictEqual(_studentInPeriod(s, M3), false, 'the gap between stays');
  assert.strictEqual(_studentInPeriod(s, NOW), true);
  assert.strictEqual(studentInPeriodInfo(s, shift(-6)).roomId, 'r3', 'in the room of that stay');
  studentCloseStay(s);   // idempotent, and an open stay is never frozen
  assert.strictEqual(s.pastStays.length, 1);
});

ok('re-admitted before pastStays existed: the cancellation recovers the first stay', () => {
  reset([{ id: 'o1', studentId: 'o', month: shift(-7) }],
        { cancellations: [{ studentId: 'o', status: 'Confirmed', vacateDate: shift(-6) + '-10', roomNumber: 3 }] });
  const s = { id: 'o', status: 'Active', joinDate: M2 + '-01', restoredAt: M2 + '-01', roomId: 'r1' };
  assert.strictEqual(_studentInPeriod(s, shift(-7)), true);
  assert.strictEqual(_studentInPeriod(s, shift(-5)), false);
  assert.strictEqual(studentInPeriodInfo(s, shift(-7)).roomId, 'r3');
});

ok('joined / left flags name the period they fall in', () => {
  reset();
  const s = { id: 'p', status: 'Left', joinDate: M3 + '-12', leftDate: M1 + '-03' };
  const f = k => { const i = studentInPeriodInfo(s, k); return [i.joined, i.left]; };
  assert.deepStrictEqual(f(M3), [true, false]);
  assert.deepStrictEqual(f(M2), [false, false]);
  assert.deepStrictEqual(f(M1), [false, true]);
});

/* ── THE ARCHIVE IS IN THE TOTALS (owner, 2026-09-29) ─────────────────────────
   "include the archive in yearly totals". Retention moves settled records
   older than six months into DB.archive; calcRevenue()/calcExpenses() read
   both halves, so an archived month is not a zero month — and a row that sits
   in both halves (a restored backup, a half-finished pass) counts once. */
ok('archived payments and expenses count in their month and their year', () => {
  const M = vm.runInContext('({ calcRevenue, calcExpenses, calcCashReceived, ledgerPayments })', sandbox);
  const save = { p: DB.payments, e: DB.expenses, a: DB.archive, t: DB.transfers };
  try {
    DB.transfers = [];
    DB.payments = [{ id: 'live1', studentId: 's', month: '2026-08', date: '2026-08-03', status: 'Paid', amount: 9000 }];
    DB.expenses = [{ id: 'ex1', date: '2026-08-10', category: 'Gas', amount: 500 }];
    DB.archive = [
      { id: 'old1', studentId: 's', month: '2026-01', date: '2026-01-04', status: 'Paid', amount: 7000, _src: 'payments' },
      { id: 'oldx', date: '2026-01-12', category: 'Electricity', amount: 1200, _src: 'expenses' },
      // v3 rows carry no _src and are told by shape
      { id: 'v3p', studentId: 's', studentName: 'A', month: '2026-02', date: '2026-02-02', status: 'Paid', amount: 3000 },
      { id: 'v3e', date: '2026-02-09', category: 'Water', amount: 300 },
      // the same payment in both halves counts once
      { id: 'live1', studentId: 's', month: '2026-08', date: '2026-08-03', status: 'Paid', amount: 9000, _src: 'payments' },
    ];
    assert.strictEqual(M.calcRevenue('2026-01'), 7000);
    assert.strictEqual(M.calcExpenses('2026-01'), 1200);
    assert.strictEqual(M.calcRevenue('2026-02'), 3000);
    assert.strictEqual(M.calcExpenses('2026-02'), 300);
    assert.strictEqual(M.calcRevenue('2026'), 19000, 'the year is its months, the duplicate once');
    assert.strictEqual(M.calcExpenses('2026'), 2000);
    assert.strictEqual(M.calcCashReceived('2026'), 19000);
    assert.strictEqual(M.ledgerPayments().length, 3);
  } finally {
    DB.payments = save.p; DB.expenses = save.e; DB.archive = save.a; DB.transfers = save.t;
  }
});

ok('no archive at all is the live figure unchanged', () => {
  const M = vm.runInContext('({ calcRevenue })', sandbox);
  const save = { p: DB.payments, a: DB.archive };
  try {
    DB.payments = [{ id: 'x', month: '2026-03', date: '2026-03-01', status: 'Paid', amount: 4000 }];
    DB.archive = undefined;
    assert.strictEqual(M.calcRevenue('2026-03'), 4000);
  } finally { DB.payments = save.p; DB.archive = save.a; }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
