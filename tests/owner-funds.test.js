/* Owner Funds, step 1: the rules (renderer/src/owner-funds.js).

   Money between the owner and the hostel, both ways. The rules pinned here are
   the ones agreed with the owner on 2026-09-28:
     · it is never revenue and never an expense — profit/loss does not move;
     · each month stands alone, nothing carries over;
     · a movement is never deleted — a mistake is reversed, with a reason, and
       stops counting in the month it was dated in;
     · categories belong to one direction.

     npm run test:ownerfunds */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
for (const f of ['config.js', 'utils.js', 'finance.js', 'periods.js', 'owner-funds.js']) {
  vm.runInContext(R(f), sandbox, { filename: f });
}
// A stand-in activity log, so the log lines can be asserted on.
vm.runInContext(`var __log = []; function logActivity(a, d, c) { __log.push({ a, d, c }); }
                 var CUR_ROLE = 'warden1'; var CUR_USER = { name: 'Hostyllo' };`, sandbox);

const F = vm.runInContext(`({ DB, get log() { return __log; },
  OF_IN, OF_OUT, OF_CATEGORIES, ofValidate, ofAdd, ofFind, ofReverse, ofIsLive,
  ofInScope, ofListFor, ofTotals, ofStatement, ofCategoryLabel, ofCategoryDirection,
  ofDirectionLabel, calcRevenue, calcExpenses, calcAvailableFund })`, sandbox);

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};
function reset() {
  F.DB.ownerFunds = []; F.DB.payments = []; F.DB.expenses = []; F.DB.transfers = [];
  F.log.length = 0;
}
const give = (amount, date, category, extra) =>
  F.ofAdd(Object.assign({ direction: 'in', amount, date, category: category || 'shortfall', method: 'Cash' }, extra));
const take = (amount, date, category, extra) =>
  F.ofAdd(Object.assign({ direction: 'out', amount, date, category: category || 'pocket', method: 'Cash' }, extra));

console.log('\nOwner Funds — the rules');

/* ── recording ────────────────────────────────────────────────────────────── */

ok('a movement is recorded with who entered it and when', () => {
  reset();
  const r = give(100000, '2026-09-28', 'emergency', { method: 'Bank Transfer', refNo: '  TXN 7781 ', note: 'No budget left' });
  assert.strictEqual(r.ok, true);
  const rec = r.record;
  assert.strictEqual(rec.direction, 'in');
  assert.strictEqual(rec.amount, 100000);
  assert.strictEqual(rec.method, 'Bank Transfer');
  assert.strictEqual(rec.refNo, 'TXN 7781', 'whitespace from a pasted reference is cleaned');
  assert.strictEqual(rec.createdBy, 'warden1');
  assert.strictEqual(rec.createdByName, 'Hostyllo');
  assert.ok(/^of_/.test(rec.id) && rec.createdAt);
  assert.strictEqual(F.DB.ownerFunds.length, 1);
  assert.strictEqual(F.log.length, 1);
  assert.ok(/Owner gave to hostel/.test(F.log[0].d));
});

ok('optional fields left blank are absent, not stored empty', () => {
  reset();
  const rec = take(5000, '2026-09-02').record;
  for (const k of ['note', 'refNo', 'receipt']) {
    assert.ok(!Object.prototype.hasOwnProperty.call(rec, k), k + ' stored empty');
  }
});

ok('a missing method defaults to Cash', () => {
  reset();
  const rec = F.ofAdd({ direction: 'out', amount: 300, date: '2026-09-02', category: 'own_bill' }).record;
  assert.strictEqual(rec.method, 'Cash');
});

/* ── refusals ─────────────────────────────────────────────────────────────── */

ok('bad input is refused with the field and a plain reason, and nothing is written', () => {
  reset();
  const cases = [
    [{ amount: 100, date: '2026-09-01', category: 'shortfall' },                        'direction'],
    [{ direction: 'in', amount: '', date: '2026-09-01', category: 'shortfall' },        'amount'],
    [{ direction: 'in', amount: 0, date: '2026-09-01', category: 'shortfall' },         'amount'],
    [{ direction: 'in', amount: -500, date: '2026-09-01', category: 'shortfall' },      'amount'],
    [{ direction: 'in', amount: 99.5, date: '2026-09-01', category: 'shortfall' },      'amount'],
    [{ direction: 'in', amount: 'abc', date: '2026-09-01', category: 'shortfall' },     'amount'],
    [{ direction: 'in', amount: 100, date: '2026-02-30', category: 'shortfall' },       'date'],
    [{ direction: 'in', amount: 100, date: '', category: 'shortfall' },                 'date'],
    [{ direction: 'in', amount: 100, date: '2026-09-01', category: '' },                'category'],
    [{ direction: 'in', amount: 100, date: '2026-09-01', category: 'unknown' },         'category'],
    [{ direction: 'in', amount: 100, date: '2026-09-01', category: 'shortfall', note: 'x'.repeat(251) }, 'note'],
  ];
  for (const [input, field] of cases) {
    const r = F.ofAdd(input);
    assert.strictEqual(r.ok, false, JSON.stringify(input));
    assert.strictEqual(r.field, field, JSON.stringify(input));
    assert.ok(r.reason && r.reason.length > 5);
  }
  assert.strictEqual(F.DB.ownerFunds.length, 0);
});

ok('a category from the other direction is refused (pocket money cannot come IN)', () => {
  reset();
  const r = F.ofAdd({ direction: 'in', amount: 100, date: '2026-09-01', category: 'pocket' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.field, 'category');
});

ok('every category belongs to exactly one direction, and keys never repeat', () => {
  const keys = F.OF_CATEGORIES.in.concat(F.OF_CATEGORIES.out).map(c => c.key);
  assert.strictEqual(new Set(keys).size, keys.length);
  F.OF_CATEGORIES.in.forEach(c => assert.strictEqual(F.ofCategoryDirection(c.key), 'in'));
  F.OF_CATEGORIES.out.forEach(c => assert.strictEqual(F.ofCategoryDirection(c.key), 'out'));
  assert.strictEqual(F.ofCategoryLabel('own_bill'), "Owner's own bill");
  assert.strictEqual(F.ofCategoryLabel('gone_key'), 'gone_key', 'an unknown key prints as itself, not blank');
});

/* ── totals and the month statement ───────────────────────────────────────── */

ok('the brief\'s example: 100,000 in, 40,000 out → net 60,000', () => {
  reset();
  give(100000, '2026-09-28', 'emergency');
  take(25000, '2026-09-30', 'pocket');
  take(15000, '2026-09-30', 'investment_out');
  const t = F.ofTotals('2026-09');
  assert.strictEqual(t.in, 100000);
  assert.strictEqual(t.out, 40000);
  assert.strictEqual(t.net, 60000);
  assert.strictEqual(t.count, 3);
  assert.deepStrictEqual(Object.assign({}, t.byCategory), { emergency: 100000, pocket: 25000, investment_out: 15000 });
});

ok('the statement: profit/loss first, owner money beside it, nothing inside it', () => {
  reset();
  give(100000, '2026-09-05');
  take(40000, '2026-09-20');
  const s = F.ofStatement('2026-09', { revenue: 800000, expenses: 850000 });
  assert.strictEqual(s.result, -50000, 'the loss is still a loss');
  assert.strictEqual(s.ownerIn, 100000);
  assert.strictEqual(s.ownerOut, 40000);
  assert.strictEqual(s.afterOwner, 10000);
});

ok('owner money never reaches revenue, expenses or Available Fund', () => {
  reset();
  F.DB.expenses = [{ id: 'e1', date: '2026-09-10', category: 'Electricity', amount: 4000 }];
  const before = [F.calcRevenue('2026-09'), F.calcExpenses('2026-09'), F.calcAvailableFund('2026-09')];
  give(250000, '2026-09-05');
  take(90000, '2026-09-06', 'own_bill');
  const after = [F.calcRevenue('2026-09'), F.calcExpenses('2026-09'), F.calcAvailableFund('2026-09')];
  assert.deepStrictEqual(after, before);
  // …and the statement reads the real figures when none are passed in.
  const s = F.ofStatement('2026-09');
  assert.strictEqual(s.expenses, 4000);
  assert.strictEqual(s.result, -4000);
  assert.strictEqual(s.afterOwner, -4000 + 250000 - 90000);
});

ok('each month stands alone — nothing carries over', () => {
  reset();
  give(100000, '2026-08-15');
  take(10000, '2026-09-02');
  assert.strictEqual(F.ofTotals('2026-09').in, 0, 'August\'s money is not September\'s');
  assert.strictEqual(F.ofTotals('2026-09').net, -10000);
  assert.strictEqual(F.ofTotals('2026-08').net, 100000);
});

ok('a year and all time add up their months', () => {
  reset();
  give(100000, '2026-08-15');
  take(10000, '2026-09-02');
  give(5000, '2025-12-31');
  assert.strictEqual(F.ofTotals('2026').net, 90000);
  assert.strictEqual(F.ofTotals('').net, 95000);
  const y = F.ofStatement('2026', { revenue: 0, expenses: 0 });
  assert.strictEqual(y.afterOwner, 90000);
});

ok('with no revenue figures to read, the statement states only the owner lines', () => {
  reset();
  give(1000, '2026-09-01');
  const s = F.ofStatement('');
  assert.strictEqual(s.revenue, null);
  assert.strictEqual(s.result, null);
  assert.strictEqual(s.afterOwner, null, 'never a figure it could not compute');
  assert.strictEqual(s.ownerIn, 1000);
});

/* ── reversal ─────────────────────────────────────────────────────────────── */

ok('a reversal keeps the record, needs a reason, and stops it counting', () => {
  reset();
  const rec = give(50000, '2026-09-10').record;
  assert.strictEqual(F.ofReverse(rec, { reason: '  ' }).ok, false, 'a reason is required');
  const r = F.ofReverse(rec.id, { reason: 'Entered twice', date: '2026-10-02' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(F.DB.ownerFunds.length, 1, 'never deleted');
  assert.strictEqual(rec.reversed.reason, 'Entered twice');
  assert.strictEqual(rec.reversed.byName, 'Hostyllo');
  assert.strictEqual(F.ofIsLive(rec), false);
  assert.strictEqual(F.ofTotals('2026-09').in, 0, 'it leaves the month it was dated in');
  assert.strictEqual(F.ofTotals('2026-09').reversed, 1);
  assert.strictEqual(F.ofTotals('2026-10').in, 0, 'and does not appear in the month of the reversal');
  assert.ok(F.log.some(l => /reversed: Entered twice/.test(l.d)));
});

ok('a movement is reversed once', () => {
  reset();
  const rec = take(700, '2026-09-10').record;
  F.ofReverse(rec, { reason: 'Mistake' });
  const again = F.ofReverse(rec, { reason: 'Again' });
  assert.strictEqual(again.ok, false);
  assert.strictEqual(rec.reversed.reason, 'Mistake');
});

ok('the list is newest first and hides reversed ones unless asked', () => {
  reset();
  give(1, '2026-09-01');
  const mid = take(2, '2026-09-15').record;
  give(3, '2026-09-30');
  F.ofReverse(mid, { reason: 'x' });
  assert.deepStrictEqual(F.ofListFor('2026-09').map(r => r.amount), [3, 1]);
  assert.deepStrictEqual(F.ofListFor('2026-09', { withReversed: true }).map(r => r.amount), [3, 2, 1]);
});

/* ── the gates (step 2) ───────────────────────────────────────────────────── */

ok('switched off for this hostel, nothing can be recorded or reversed', () => {
  reset();
  const rec = give(500, '2026-09-01').record;
  vm.runInContext('var hasFeature = k => false;', sandbox);
  try {
    const a = F.ofAdd({ direction: 'in', amount: 1, date: '2026-09-01', category: 'shortfall' });
    assert.strictEqual(a.ok, false);
    assert.ok(/not switched on/.test(a.reason));
    assert.strictEqual(F.ofReverse(rec, { reason: 'x' }).ok, false);
    assert.strictEqual(F.DB.ownerFunds.length, 1);
    assert.ok(!rec.reversed);
  } finally { vm.runInContext('hasFeature = undefined;', sandbox); }
});

ok('an account without the permission cannot record either', () => {
  reset();
  vm.runInContext('var canDo = k => k !== "ownerFunds";', sandbox);
  try {
    const a = F.ofAdd({ direction: 'out', amount: 1, date: '2026-09-01', category: 'pocket' });
    assert.strictEqual(a.ok, false);
    assert.ok(/permission/.test(a.reason));
  } finally { vm.runInContext('canDo = undefined;', sandbox); }
});

/* ── wiring ───────────────────────────────────────────────────────────────── */

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
ok('the table is created, saved, backed up and loaded', () => {
  assert.ok(/CREATE TABLE IF NOT EXISTS owner_funds/.test(read('main.js')));
  assert.ok(/HANDOVER_TABLES = \[[^\]]*'owner_funds'/.test(read('main.js')),
    'optional in a backup, so an older backup still restores');
  assert.ok(/ownerFunds:\s*'owner_funds'/.test(read('renderer/src/storage.js')));
  assert.ok(/d\.ownerFunds = \[\]/.test(read('renderer/src/modules/modals.js')));
  assert.ok(/src\/owner-funds\.js/.test(read('renderer/index.html')));
});

ok('no revenue or expense calculation reads owner funds', () => {
  for (const f of ['renderer/src/periods.js', 'renderer/src/finance.js']) {
    assert.ok(!/ownerFunds/.test(read(f)), f + ' reads owner funds');
  }
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
