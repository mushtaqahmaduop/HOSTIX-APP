/* --- HOSTYLLO -- who may change collected money (warden ledger spec §3.2, §5 step 6) ---

   Loads config.js, utils.js, finance.js, ledger.js, handovers.js and
   ownership.js the way the app loads them and drives the real rules: who owns a
   record's money, who may edit, reverse and delete it, and how a handover
   narrows what a warden may reverse. The screens are proven in
   tests/ownership.spec.js.

   Run:  node tests/ownership.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
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
['config.js', 'utils.js', 'finance.js', 'ledger.js', 'handovers.js', 'ownership.js']
  .forEach(f => vm.runInContext(R(f), sandbox, { filename: f }));
vm.runInContext(`
  var WARDENS = {
    owner:  { name: 'Owner Admin', perms: { users: true, payments: true } },
    w_sara: { name: 'Sara Warden', perms: { payments: true } },
    w_ali:  { name: 'Ali Warden',  perms: { payments: true } },
  };
  var CUR_ROLE = 'w_sara', CUR_USER = WARDENS.w_sara;
  function canDo(p) { return !!(CUR_USER && CUR_USER.perms && CUR_USER.perms[p] === true); }
  function logActivity() {}
`, sandbox);

const O = vm.runInContext(`({
  DB, money, calculateBill, applyPayment, reversePayment,
  ledgerTrack, ledgerLoaded, ledgerImportIfEmpty,
  hoSend, hoTakeBack, hoApprove, hoEvaluate, hoItems,
  ownIsAdmin, ownHeld, ownOwner, ownCanEdit, ownCanDelete, ownReversible,
  as: id => { CUR_ROLE = id; CUR_USER = WARDENS[id]; },
})`, sandbox);
const { DB } = O;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

function rec(o) {
  const p = Object.assign({ id: 'p1', studentId: 's1', studentName: 'Fixture', month: 'September 2026',
    monthlyRent: 20000, messCharge: 0, messIncluded: true, extraCharges: [], extraTotal: 0,
    admissionFee: 0, concession: 0, amount: 0, method: 'Cash', date: '2026-09-01', status: 'Pending' }, o || {});
  p.unpaid = Math.max(0, O.calculateBill(p) - O.money(p.amount)); p.overpaid = 0;
  return p;
}

let P;
function start() {
  DB.payments = []; DB.archive = []; DB.studentLedger = [];
  DB.wardenCollections = []; DB.handovers = []; DB.handoverItems = [];
  O.ledgerLoaded(); O.ledgerImportIfEmpty();
  P = rec(); DB.payments.push(P); O.ledgerTrack(P);
  O.as('w_sara'); O.applyPayment(P, { amount: 5000, method: 'Cash' });
  O.as('w_ali');  O.applyPayment(P, { amount: 3000, method: 'Cash' });
}

// ── holding and owning ───────────────────────────────────────────────────────

ok('a record with nothing collected holds nothing and anyone may change or delete it', () => {
  start();
  const empty = rec({ id: 'p0' }); DB.payments.push(empty); O.ledgerTrack(empty);
  O.as('w_sara');
  assert.strictEqual(O.ownHeld(empty), false);
  assert.strictEqual(O.ownCanEdit(empty).ok, true);
  assert.strictEqual(O.ownCanDelete(empty).ok, true);
});

ok('the owner is whoever took the latest money', () => {
  const o = O.ownOwner(P);
  assert.strictEqual(o.id, 'w_ali');
  assert.strictEqual(o.name, 'Ali Warden');
});

// ── editing ──────────────────────────────────────────────────────────────────

ok('only the owner or an admin may edit a record holding money', () => {
  O.as('w_sara');
  const r = O.ownCanEdit(P);
  assert.strictEqual(r.ok, false);
  assert.ok(/Collected by Ali Warden/.test(r.reason) && /Only Ali or an admin/.test(r.reason), r.reason);
  O.as('w_ali');  assert.strictEqual(O.ownCanEdit(P).ok, true);
  O.as('owner');  assert.strictEqual(O.ownCanEdit(P).ok, true);
});

ok('history imported before the ledger has no owner account, so only an admin may edit it', () => {
  DB.payments = []; DB.archive = []; DB.studentLedger = [];
  DB.wardenCollections = []; DB.handovers = []; DB.handoverItems = [];
  const old = rec({ id: 'old', amount: 4000, partialPayments: [{ date: '2026-01-02', amount: 4000, collectedBy: 'Old Warden' }] });
  DB.payments.push(old);
  O.ledgerLoaded(); O.ledgerImportIfEmpty();
  O.as('w_sara');
  const r = O.ownCanEdit(old);
  assert.strictEqual(r.ok, false);
  assert.ok(/Collected by Old Warden/.test(r.reason) && /Only an admin/.test(r.reason), r.reason);
  assert.strictEqual(O.ownReversible(old).max, 0);
  O.as('owner');
  assert.strictEqual(O.ownCanEdit(old).ok, true);
  assert.strictEqual(O.ownReversible(old).max, 4000);
});

// ── deleting ─────────────────────────────────────────────────────────────────

ok('a record holding money cannot be deleted by anyone, admin included', () => {
  start();
  O.as('owner');
  const r = O.ownCanDelete(P);
  assert.strictEqual(r.ok, false);
  assert.ok(/Reverse the collection first/.test(r.reason), r.reason);
});

ok('once everything is reversed it can be deleted', () => {
  O.as('owner');
  O.reversePayment(P, { amount: 8000, reason: 'Wrong student' });
  assert.strictEqual(O.ownCanDelete(P).ok, true);
});

// ── reversing ────────────────────────────────────────────────────────────────

ok('a warden may reverse only what they collected on the record', () => {
  start();
  O.as('w_ali');
  let rv = O.ownReversible(P);
  assert.strictEqual(rv.max, 3000);
  assert.strictEqual(rv.admin, false);
  O.as('w_sara');
  assert.strictEqual(O.ownReversible(P).max, 5000);
  O.as('owner');
  rv = O.ownReversible(P);
  assert.strictEqual(rv.admin, true);
  assert.strictEqual(rv.max, 8000);
});

ok('what a warden already reversed comes off what they may still reverse', () => {
  O.as('w_ali');
  O.reversePayment(P, { amount: 1000, reason: 'Keyed too much' });
  assert.strictEqual(O.ownReversible(P).max, 2000);
});

ok('a waiting handover blocks the warden until it is taken back', () => {
  O.as('w_sara');
  const sent = O.hoSend('w_sara');
  assert.ok(sent.ok, sent.reason);
  let rv = O.ownReversible(P);
  assert.strictEqual(rv.max, 0);
  assert.strictEqual(rv.waiting, 5000);
  assert.ok(/Take the handover back first/.test(rv.reason), rv.reason);
  assert.ok(O.hoTakeBack(sent.handover.id, 'w_sara').ok);
  assert.strictEqual(O.ownReversible(P).max, 5000);
});

ok('once a handover is approved only an admin may reverse that money', () => {
  O.as('w_sara');
  const sent = O.hoSend('w_sara');
  assert.ok(sent.ok, sent.reason);
  const h = sent.handover;
  O.as('owner');
  const ticked = O.hoItems(h.id).map(x => x.item.ledgerEntryId);
  const ap = O.hoApprove(h.id, { ticked, counted: { Cash: String(h.totalAmount) } });
  assert.ok(ap.ok, ap.reason);
  O.as('w_sara');
  const rv = O.ownReversible(P);
  assert.strictEqual(rv.max, 0);
  assert.strictEqual(rv.approved, 5000);
  assert.ok(/Only an admin can reverse it now/.test(rv.reason), rv.reason);
  O.as('owner');
  assert.strictEqual(O.ownReversible(P).max, O.money(P.amount));
});

ok('a warden who collected nothing on the record may not reverse it', () => {
  WARDENS_add();
  O.as('w_new');
  const rv = O.ownReversible(P);
  assert.strictEqual(rv.max, 0);
  assert.ok(/Only its collector or an admin/.test(rv.reason), rv.reason);
});

function WARDENS_add() {
  vm.runInContext(`WARDENS.w_new = { name: 'New Warden', perms: { payments: true } };`, sandbox);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
