/* --- HOSTYLLO -- no placeholder hostel name on paper (owner, 2026-09-15) ---

   Loads hostel-name.js with the app's globals stubbed and drives the rules:
   what counts as "no name", that a named hostel prints straight through the
   gate, and what the save accepts and writes.

   Run:  node tests/hostel-name.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const assert = require('assert');

const log = [];
let saves = 0;
const sandbox = {
  console, Promise, JSON, Math, Date,
  document: { getElementById: () => null },
  DB: { settings: { hostelName: 'Hostel Name' } },
  logActivity: (action, detail) => log.push(action + ' · ' + detail),
  saveDB: async () => { saves++; },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', 'hostel-name.js'), 'utf8'),
  sandbox, { filename: 'hostel-name.js' });
const H = vm.runInContext('({ hostelNameMissing, hostelNameGate, hostelNameSave })', sandbox);
const S = sandbox.DB.settings;

let pass = 0, fail = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

ok('the seeded placeholder, empty and blank all count as no name', () => {
  for (const v of ['Hostel Name', 'hostel name', '  HOSTEL NAME ', '', '   ', undefined, null]) {
    S.hostelName = v;
    assert.strictEqual(H.hostelNameMissing(), true, JSON.stringify(v));
  }
  S.hostelName = 'Test Court Hostel';
  assert.strictEqual(H.hostelNameMissing(), false);
});

ok('a named hostel goes straight through the gate, and the retry is not run', () => {
  S.hostelName = 'Test Court Hostel';
  let ran = 0;
  assert.strictEqual(H.hostelNameGate(() => ran++), false);
  assert.strictEqual(ran, 0);
});

ok('the save refuses empty, the placeholder, and over 60 characters', async () => {
  S.hostelName = 'Hostel Name';
  assert.strictEqual((await H.hostelNameSave('  ')).ok, false);
  assert.strictEqual((await H.hostelNameSave('hostel name')).ok, false);
  assert.strictEqual((await H.hostelNameSave('x'.repeat(61))).ok, false);
  assert.strictEqual(S.hostelName, 'Hostel Name', 'a refused save changed the name');
  assert.strictEqual(saves, 0);
});

ok('a good name is tidied, saved, logged, and ends the missing state', async () => {
  const r = await H.hostelNameSave('  Test   Court  Hostel ');
  assert.ok(r.ok, r.reason);
  assert.strictEqual(S.hostelName, 'Test Court Hostel');
  assert.strictEqual(saves, 1);
  assert.ok(/^Hostel Info Updated · Test Court Hostel/.test(log.pop()));
  assert.strictEqual(H.hostelNameMissing(), false);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
