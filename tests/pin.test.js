/* --- HOSTYLLO -- PIN to confirm money (warden ledger spec §3.5, §5 step 10) ---

   Loads pin.js the way the app does, with the account store and the password
   hashing stubbed, and drives the rules: exactly 4 digits, only the account sets
   its own PIN, it is never stored as typed, only an administrator clears one,
   and an account without PIN switched on is never asked.

   Run:  node tests/pin.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const assert = require('assert');

const log = [];
const sandbox = {
  console, Promise, JSON, Math, Date,
  document: { getElementById: () => null },
  WARDENS: {
    owner:  { name: 'Owner Admin', perms: { users: true, payments: true } },
    w_sara: { name: 'Sara Warden', perms: { payments: true }, pinRequired: true },
  },
  CUR_ROLE: 'w_sara',
  hashPassword: async plain => ({ hash: 'h:' + plain.split('').reverse().join(''), salt: 's', v: '2.0' }),
  verifyPassword: async (plain, stored) => stored.hash === 'h:' + plain.split('').reverse().join(''),
  saveWardenConfig() {},
  saveDB: async () => {},
  logActivity: (action, who) => log.push(action + ' · ' + who),
  canDo: p => !!(sandbox.WARDENS[sandbox.CUR_ROLE].perms || {})[p],
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', 'pin.js'), 'utf8'), sandbox, { filename: 'pin.js' });
const P = vm.runInContext('({ pinValid, pinIsRequired, pinHasOne, pinCheck, pinSet, pinClear, pinConfirm })', sandbox);
const W = sandbox.WARDENS;
const as = id => vm.runInContext(`CUR_ROLE = ${JSON.stringify(id)}`, sandbox);

let pass = 0, fail = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

ok('a PIN is exactly 4 digits', () => {
  ['1234', '0000', 1234].forEach(v => assert.strictEqual(P.pinValid(v), true, String(v)));
  ['123', '12345', '12a4', ' 1234', '', null, undefined].forEach(v => assert.strictEqual(P.pinValid(v), false, String(v)));
});

ok('off by default: an account without the tick is never asked', async () => {
  assert.strictEqual(P.pinIsRequired(W.owner), false);
  as('owner');
  assert.strictEqual(await P.pinConfirm({ what: 'posting' }), true);
  as('w_sara');
});

ok('only the account itself sets its PIN, and only 4 digits', async () => {
  as('owner');
  assert.strictEqual((await P.pinSet('w_sara', '1234')).ok, false);
  as('w_sara');
  assert.strictEqual((await P.pinSet('w_sara', '12')).ok, false);
  assert.strictEqual(P.pinHasOne(W.w_sara), false);
});

ok('a set PIN is hashed, checks right and wrong, and is logged without the digits', async () => {
  const r = await P.pinSet('w_sara', '4821');
  assert.ok(r.ok, r.reason);
  assert.strictEqual(P.pinHasOne(W.w_sara), true);
  assert.ok(!JSON.stringify(W.w_sara.pin).includes('4821'), 'the PIN was stored as typed');
  assert.strictEqual(await P.pinCheck('w_sara', '4821'), true);
  assert.strictEqual(await P.pinCheck('w_sara', '0000'), false);
  assert.strictEqual(await P.pinCheck('w_sara', '482'), false);
  assert.strictEqual(log.pop(), 'PIN Set · Sara Warden');
});

ok('changing it is logged as a change', async () => {
  assert.ok((await P.pinSet('w_sara', '7777')).ok);
  assert.strictEqual(log.pop(), 'PIN Changed · Sara Warden');
  assert.strictEqual(await P.pinCheck('w_sara', '4821'), false);
});

ok('only an administrator clears a PIN', async () => {
  assert.strictEqual((await P.pinClear('w_sara')).ok, false);
  assert.strictEqual(P.pinHasOne(W.w_sara), true);
  as('owner');
  assert.ok((await P.pinClear('w_sara')).ok);
  assert.strictEqual(P.pinHasOne(W.w_sara), false);
  assert.strictEqual(log.pop(), 'PIN Cleared · Sara Warden');
  assert.strictEqual((await P.pinClear('w_sara')).ok, false, 'cleared a PIN that was not there');
  as('w_sara');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
