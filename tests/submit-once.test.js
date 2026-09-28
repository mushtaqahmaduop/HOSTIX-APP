/* submitOnce() — one press, one save (bug audit BUG-006, 2026-09-28).

   A double-click on any money button used to post the money twice. The guard
   refuses to run a second call while the first with the same key is running,
   and hands the caller the running call's promise instead.

     npm run test:submitonce */
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
const submitOnce = vm.runInContext('submitOnce', sandbox);

let pass = 0, fail = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const tick = () => new Promise(r => setTimeout(r, 5));

console.log('\nsubmitOnce');

ok('a second call while the first is running does not run again', async () => {
  let runs = 0;
  const slow = () => new Promise(r => setTimeout(() => { runs++; r('saved'); }, 20));
  const [a, b] = await Promise.all([submitOnce('k1', slow), submitOnce('k1', slow)]);
  assert.strictEqual(runs, 1);
  assert.strictEqual(a, 'saved');
  assert.strictEqual(b, 'saved', 'the second caller still waits for the real save');
});

ok('once it has finished, the next press runs normally', async () => {
  let runs = 0;
  const f = async () => { runs++; };
  await submitOnce('k2', f);
  await submitOnce('k2', f);
  assert.strictEqual(runs, 2);
});

ok('different keys do not block each other (two different payments)', async () => {
  let runs = 0;
  const slow = () => new Promise(r => setTimeout(() => { runs++; r(); }, 15));
  await Promise.all([submitOnce('payment:reverse:a', slow), submitOnce('payment:reverse:b', slow)]);
  assert.strictEqual(runs, 2);
});

ok('a failed save frees the key, so the warden can press again', async () => {
  await assert.rejects(submitOnce('k3', async () => { throw new Error('disk full'); }), /disk full/);
  let ran = false;
  await submitOnce('k3', async () => { ran = true; });
  assert.strictEqual(ran, true);
});

ok('a submit that stops at validation (returns at once) frees the key at once', async () => {
  let runs = 0;
  await submitOnce('k4', () => { runs++; return undefined; });
  await tick();
  await submitOnce('k4', () => { runs++; });
  assert.strictEqual(runs, 2);
});

ok('the pressed button is disabled while saving and re-enabled after', async () => {
  const btn = { tagName: 'BUTTON', disabled: false, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  sandbox.document.activeElement = btn;
  let during = null;
  await submitOnce('k5', async () => { await tick(); during = { disabled: btn.disabled, busy: btn.attrs['aria-busy'] }; });
  sandbox.document.activeElement = null;
  assert.deepStrictEqual(during, { disabled: true, busy: 'true' });
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(btn.attrs['aria-busy'], undefined);
});

ok('every money-writing entry point goes through it', () => {
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', 'modules', f), 'utf8');
  const want = {
    'payments.js': ['payBulkMarkPaid', 'generateMonthlyRents', 'markPaymentPaid', 'markPaymentPaidFromStudentView',
                    'submitPaymentForStudent', 'submitAddPayment', 'submitEditPayment', 'submitReversePayment'],
    'cancellations.js': ['submitCancellationSettlement'],
    'owner-funds-page.js': ['submitOwnerFund', 'submitReverseOwnerFund'],
    'expenses.js': ['submitExpense'],
    'students.js': ['submitAddStudent'],
  };
  for (const [f, names] of Object.entries(want)) {
    const s = src(f);
    for (const n of names) {
      assert.ok(new RegExp('async function ' + n + '\\(\\.\\.\\.a\\) \\{ return submitOnce\\(').test(s),
        f + ': ' + n + ' is not guarded');
    }
  }
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
  }
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
