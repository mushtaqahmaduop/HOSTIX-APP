/* --- HOSTYLLO -- the paper every printed page is laid out for (owner, 2026-09-15) ---

   Loads paper.js with the app's globals stubbed: Letter by default, only the
   three known sizes are accepted, a change is saved and logged, and the Excel
   code follows the paper.

   Run:  node tests/paper.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const assert = require('assert');

const log = [];
let saves = 0;
const sandbox = {
  console, Promise, JSON, Object,
  DB: { settings: {} },
  logActivity: (a, d) => log.push(a + ' · ' + d),
  saveDB: async () => { saves++; },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', 'paper.js'), 'utf8'), sandbox, { filename: 'paper.js' });
const P = vm.runInContext('({ paperSize, paperXlsxCode, setPaperSize })', sandbox);

let pass = 0, fail = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

ok('Letter until a hostel picks another, and an unknown value reads as Letter', () => {
  assert.strictEqual(P.paperSize(), 'Letter');
  assert.strictEqual(P.paperXlsxCode(), 1);
  sandbox.DB.settings.paperSize = 'Tabloid';
  assert.strictEqual(P.paperSize(), 'Letter');
});

ok('only Letter, A4 and Legal are accepted', async () => {
  assert.strictEqual((await P.setPaperSize('Tabloid')).ok, false);
  assert.strictEqual(saves, 0);
});

ok('a change is saved, logged, and reaches the Excel code', async () => {
  assert.ok((await P.setPaperSize('A4')).ok);
  assert.strictEqual(P.paperSize(), 'A4');
  assert.strictEqual(P.paperXlsxCode(), 9);
  assert.strictEqual(saves, 1);
  assert.strictEqual(log.pop(), 'Settings Updated · Paper size set to A4');
  assert.ok((await P.setPaperSize('A4')).unchanged, 'the same size saved again');
  assert.strictEqual(saves, 1);
  assert.ok((await P.setPaperSize('Legal')).ok);
  assert.strictEqual(P.paperXlsxCode(), 5);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
