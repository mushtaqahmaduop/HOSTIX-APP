/* Display references never hand a number out twice (bug audit BUG-011, 2026-09-28).

   CAN-####, MA-#### and CO-#### were max(existing)+1: delete the newest record
   and the next one got its number, so a printed reference named two records.

     npm run test:refseq */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', f), 'utf8');
const sandbox = { console, setTimeout, clearTimeout, Date, Math, JSON, Promise,
  sessionStorage: { getItem: () => null, setItem() {} },
  localStorage: { getItem: () => null, setItem() {} },
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null,
              querySelectorAll: () => [], activeElement: null } };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(R('config.js'), sandbox);
vm.runInContext(R('utils.js'), sandbox);
const S = vm.runInContext('({ DB, refSeqTake })', sandbox);
const { DB } = S;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};
const reset = () => { DB.settings = DB.settings || {}; delete DB.settings.refSeq; };

console.log('\nReference series');

ok('a fresh series starts at 1, and follows the records on file', () => {
  reset();
  assert.strictEqual(S.refSeqTake('cancellation', 0), 1);
  reset();
  assert.strictEqual(S.refSeqTake('cancellation', 7), 8);
});

ok('THE BUG: deleting the newest record does not free its number', () => {
  reset();
  assert.strictEqual(S.refSeqTake('complaint', 1), 2);   // CO-0002 issued
  // CO-0002 deleted: the highest on file is 1 again
  assert.strictEqual(S.refSeqTake('complaint', 1), 3);
});

ok('the series are independent', () => {
  reset();
  S.refSeqTake('maintenance', 0); S.refSeqTake('maintenance', 1);
  assert.strictEqual(S.refSeqTake('complaint', 0), 1);
  assert.strictEqual(S.refSeqTake('cancellation', 0), 1);
  assert.strictEqual(S.refSeqTake('maintenance', 0), 3);
});

ok('a record on file above the mark (an older database) still wins', () => {
  reset();
  DB.settings.refSeq = { cancellation: 2 };
  assert.strictEqual(S.refSeqTake('cancellation', 10), 11);
});

ok('both allocators take their number through it', () => {
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', 'modules', f), 'utf8');
  assert.ok(/function _cancNextSeq\(\) \{\s*return refSeqTake\('cancellation'/.test(src('cancellations.js')));
  assert.ok(/function _issNextSeq\(kind\) \{\s*return refSeqTake\(kind,/.test(src('issues.js')));
});

ok('a restore keeps the higher mark', () => {
  assert.ok(/_refHigh/.test(R('storage.js')));
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
