/* ─── HOSTIX — Data-retention losslessness test (pure JS, plain Node) ─────────
   Guards the P0 regression where enforceDataRetention() pruned payments and
   expenses older than 7 months while writing the "archive" to a local variable
   that was thrown away — silently destroying client financial history on every
   saveDB() call.

   The invariant this file exists to defend:
       NOTHING may leave DB.payments / DB.expenses without landing in DB.archive.

   Run:  node tests/retention.test.js

   enforceDataRetention() is a global in renderer/src/modules/settings.js, which
   is a plain <script> with no exports (this app has no build step). So the test
   extracts the function's source by brace-matching and evaluates it against a
   minimal fake `DB`. If the extraction ever fails, the test fails loudly rather
   than silently passing.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

// ── Extract enforceDataRetention() from settings.js ──────────────────────────
const SETTINGS = path.join(__dirname, '..', 'renderer', 'src', 'modules', 'settings.js');
const src = fs.readFileSync(SETTINGS, 'utf8');
const start = src.indexOf('function enforceDataRetention');
assert.notStrictEqual(start, -1, 'could not find enforceDataRetention() in settings.js');

let depth = 0, end = -1, seenBrace = false;
for (let i = start; i < src.length; i++) {
  if (src[i] === '{') { depth++; seenBrace = true; }
  else if (src[i] === '}') { depth--; if (seenBrace && depth === 0) { end = i + 1; break; } }
}
assert.notStrictEqual(end, -1, 'could not brace-match enforceDataRetention() body');
const fnSource = src.slice(start, end);

// Build the function in an isolated scope with `DB` as its only free variable.
const makeFn = new Function('DB', fnSource + '\nreturn enforceDataRetention;');
function run(DB) { makeFn(DB)(); return DB; }

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Dates relative to "now" so the test never rots.
const now = new Date();
const monthsAgo = n => {
  const d = new Date(now.getFullYear(), now.getMonth() - n, 15);
  return d.toISOString().slice(0, 10);
};
const OLD    = monthsAgo(14); // comfortably past the 7-month window
const OLDER  = monthsAgo(25);
const RECENT = monthsAgo(1);  // inside the window

const baseDB = () => ({
  payments: [
    { id: 'pay_old1',   studentId: 's1', studentName: 'Ali Khan', month: OLD.slice(0,7),   amount: 16000, status: 'Paid',    paidDate: OLD },
    { id: 'pay_old2',   studentId: 's2', studentName: 'محمد بلال', month: OLDER.slice(0,7), amount: 18000, status: 'Paid',    date: OLDER },
    { id: 'pay_recent', studentId: 's1', studentName: 'Ali Khan', month: RECENT.slice(0,7), amount: 16000, status: 'Paid',    paidDate: RECENT },
    { id: 'pay_unpaid', studentId: 's3', studentName: 'Sana',     month: OLD.slice(0,7),   amount: 16000, status: 'Pending', date: OLD },
  ],
  expenses: [
    { id: 'exp_old',    category: 'Electricity', amount: 4200, date: OLD,    description: 'Bill' },
    { id: 'exp_recent', category: 'Water',       amount: 1100, date: RECENT, description: 'Bill' },
  ],
  archive: [],
});

const ids = arr => arr.map(r => r.id).sort();

// ── Tests ────────────────────────────────────────────────────────────────────
console.log('\nenforceDataRetention() — losslessness');

ok('nothing is destroyed: every pruned record lands in the archive', () => {
  const DB = baseDB();
  const before = [...DB.payments, ...DB.expenses].map(r => r.id).sort();
  run(DB);
  const after = [...DB.payments, ...DB.expenses, ...DB.archive].map(r => r.id).sort();
  assert.deepStrictEqual(after, before,
    'record count changed — data was destroyed rather than moved');
});

ok('old paid payments are moved out of the live table', () => {
  const DB = run(baseDB());
  assert.ok(!DB.payments.some(p => p.id === 'pay_old1'), 'pay_old1 should have left DB.payments');
  assert.ok(!DB.payments.some(p => p.id === 'pay_old2'), 'pay_old2 should have left DB.payments');
});

ok('old records are present in DB.archive with their fields intact', () => {
  const DB = run(baseDB());
  const a = DB.archive.find(r => r.id === 'pay_old1');
  assert.ok(a, 'pay_old1 missing from archive');
  assert.strictEqual(a.amount, 16000);
  assert.strictEqual(a.studentName, 'Ali Khan');
  assert.strictEqual(a.status, 'Paid');
  const u = DB.archive.find(r => r.id === 'pay_old2');
  assert.strictEqual(u.studentName, 'محمد بلال', 'unicode field corrupted');
});

ok('Pending payments are never archived, however old', () => {
  const DB = run(baseDB());
  assert.ok(DB.payments.some(p => p.id === 'pay_unpaid'),
    'outstanding debt was pruned — Pending must always stay live');
  assert.ok(!DB.archive.some(r => r.id === 'pay_unpaid'));
});

ok('recent records are untouched', () => {
  const DB = run(baseDB());
  assert.ok(DB.payments.some(p => p.id === 'pay_recent'));
  assert.ok(DB.expenses.some(e => e.id === 'exp_recent'));
  assert.ok(!DB.archive.some(r => r.id === 'pay_recent'));
});

ok('old expenses are archived too', () => {
  const DB = run(baseDB());
  assert.ok(!DB.expenses.some(e => e.id === 'exp_old'));
  const a = DB.archive.find(r => r.id === 'exp_old');
  assert.ok(a, 'exp_old missing from archive');
  assert.strictEqual(a.category, 'Electricity');
});

ok('archived records are tagged with their source table', () => {
  const DB = run(baseDB());
  assert.strictEqual(DB.archive.find(r => r.id === 'pay_old1')._src, 'payments');
  assert.strictEqual(DB.archive.find(r => r.id === 'exp_old')._src,  'expenses');
});

ok('running repeatedly does not duplicate archive entries', () => {
  const DB = baseDB();
  run(DB); const first = ids(DB.archive);
  run(DB); run(DB); run(DB);
  assert.deepStrictEqual(ids(DB.archive), first,
    'archive grew on re-run — dedupe by id is broken');
});

ok('is a no-op when there is nothing old to archive', () => {
  const DB = { payments: [{ id: 'p', status: 'Paid', paidDate: RECENT }], expenses: [], archive: [] };
  run(DB);
  assert.strictEqual(DB.archive.length, 0);
  assert.strictEqual(DB.payments.length, 1);
});

ok('id-less records are never pruned (they cannot be persisted)', () => {
  // saveDB() skips rows with a null id on upsert, so archiving one would write
  // it nowhere while deleting it from the live table.
  const DB = { payments: [{ studentId: 's1', amount: 500, status: 'Paid', paidDate: OLD }], expenses: [], archive: [] };
  run(DB);
  assert.strictEqual(DB.payments.length, 1, 'id-less record was pruned — it would have been lost');
  assert.strictEqual(DB.archive.length, 0);
});

ok('records already in the archive are still pruned from the live table', () => {
  const DB = baseDB();
  DB.archive.push(Object.assign({}, DB.payments[0], { _src: 'payments' }));
  run(DB);
  assert.ok(!DB.payments.some(p => p.id === 'pay_old1'), 'already-archived record left stranded live');
  assert.strictEqual(DB.archive.filter(r => r.id === 'pay_old1').length, 1);
});

ok('an existing archive is appended to, not replaced', () => {
  const DB = baseDB();
  DB.archive.push({ id: 'legacy_1', studentName: 'Old Record', amount: 9000, month: '2019-03' });
  run(DB);
  assert.ok(DB.archive.some(r => r.id === 'legacy_1'), 'pre-existing archive rows were wiped');
});

ok('a missing DB.archive is created rather than throwing', () => {
  const DB = baseDB(); delete DB.archive;
  run(DB);
  assert.ok(Array.isArray(DB.archive));
  assert.ok(DB.archive.length > 0);
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
