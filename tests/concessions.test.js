/* --- HOSTYLLO -- standing concessions (warden ledger spec §2.4, §3.9, §5 step 8) ---

   Loads config.js, utils.js, finance.js, ledger.js and concessions.js the way
   the app loads them and drives the real rules: request and approval, which
   months change, caps and overlaps, a hand-typed concession left alone, ending
   early, and what the ledger says.

   Run:  node tests/concessions.test.js
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
['config.js', 'utils.js', 'finance.js', 'ledger.js', 'concessions.js']
  .forEach(f => vm.runInContext(R(f), sandbox, { filename: f }));
vm.runInContext(`
  var WARDENS = {
    owner:  { name: 'Owner Admin', perms: { users: true, payments: true } },
    w_sara: { name: 'Sara Warden', perms: { payments: true } },
  };
  var CUR_ROLE = 'w_sara', CUR_USER = WARDENS.w_sara;
  function canDo(p) { return !!(CUR_USER && CUR_USER.perms && CUR_USER.perms[p] === true); }
  function logActivity() {}
`, sandbox);

const C = vm.runInContext(`({
  DB, money, calculateBill, calculateOutstanding, ledgerTrack, ledgerLoaded, ledgerImportIfEmpty, thisMonth,
  cnRequest, cnApprove, cnDecline, cnRequestEnd, cnApplyToRecord, cnQueue, cnAlerts, cnMarkSeen, cnForStudent,
  as: id => { CUR_ROLE = id; CUR_USER = WARDENS[id]; },
})`, sandbox);
const { DB } = C;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

const NOW = C.thisMonth();
const shift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const NEXT = shift(NOW, 1), PREV = shift(NOW, -1);
const P = id => DB.payments.find(p => p.id === id);

function rec(id, month, amount, o) {
  const p = Object.assign({ id, studentId: 's1', studentName: 'Ali Khan', month, monthlyRent: 10000, messCharge: 7000,
    messIncluded: true, extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0, concessionDesc: '',
    amount, method: 'Cash', date: month + '-01' }, o || {});
  const bill = C.calculateBill(p);
  p.unpaid = Math.max(0, bill - amount); p.overpaid = 0; p.status = p.unpaid > 0 ? 'Pending' : 'Paid';
  DB.payments.push(p); C.ledgerTrack(p);
  return p;
}

function start() {
  DB.settings.serviceModel = 'rent_mess_optional';
  DB.students = [{ id: 's1', name: 'Ali Khan', status: 'Active' }];
  DB.payments = []; DB.archive = []; DB.studentLedger = []; DB.concessions = [];
  C.ledgerLoaded(); C.ledgerImportIfEmpty();
  rec('pPrev', PREV, 17000);      // last month, paid
  rec('pNow', NOW, 5000);         // this month, part paid
  C.as('w_sara');
}

// ── requesting ───────────────────────────────────────────────────────────────

ok('a warden request waits and changes nothing', () => {
  start();
  const r = C.cnRequest({ studentId: 's1', type: 'rent', value: 1500, reason: 'Financial hardship', startMonth: PREV });
  assert.ok(r.ok && r.pending, r.reason);
  assert.strictEqual(P('pNow').concession, 0);
  assert.strictEqual(C.cnQueue().length, 1);
});

ok('whole rupees only, a reason, and a start month are required', () => {
  const base = { studentId: 's1', type: 'rent', value: 1500, reason: 'x', startMonth: NOW };
  assert.strictEqual(C.cnRequest(Object.assign({}, base, { value: 12.5 })).ok, false);
  assert.strictEqual(C.cnRequest(Object.assign({}, base, { value: 0 })).ok, false);
  assert.strictEqual(C.cnRequest(Object.assign({}, base, { reason: ' ' })).ok, false);
  assert.strictEqual(C.cnRequest(Object.assign({}, base, { startMonth: '' })).ok, false);
  assert.strictEqual(C.cnRequest(Object.assign({}, base, { endMonth: PREV })).ok, false);
});

ok('a warden cannot approve; the admin bell names the request', () => {
  assert.strictEqual(C.cnApprove(C.cnQueue()[0].c.id).ok, false);
  C.as('owner');
  const a = C.cnAlerts();
  assert.strictEqual(a.length, 1);
  assert.ok(/Concession requested — Ali Khan \(by Sara Warden\)/.test(a[0].msg), a[0].msg);
});

// ── approving ────────────────────────────────────────────────────────────────

ok('approval gives unpaid months in range the concession; paid months stay', () => {
  const id = C.cnQueue()[0].c.id;
  const r = C.cnApprove(id);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.applied, 1);
  const now = P('pNow');
  assert.strictEqual(now.concession, 1500);
  assert.strictEqual(now.unpaid, 17000 - 1500 - 5000);
  assert.strictEqual(now.amount, 5000);
  assert.ok(/Financial hardship, approved by Owner Admin/.test(now.concessionDesc), now.concessionDesc);
  assert.strictEqual(P('pPrev').concession, 0, 'a paid month was rewritten');
  const e = DB.studentLedger.filter(x => x.paymentRecordId === 'pNow' && x.type === 'concession').pop();
  assert.ok(e && e.amount === 1500 && /approved by Owner Admin/.test(e.reason), e && e.reason);
});

ok('a month generated later inside the range gets it when generated', () => {
  const p = rec('pNext', NEXT, 0);
  assert.strictEqual(C.cnApplyToRecord(p), true);
  assert.strictEqual(p.concession, 1500);
});

ok('the warden sees the outcome once', () => {
  C.as('w_sara');
  assert.strictEqual(C.cnAlerts().length, 1);
  assert.ok(C.cnMarkSeen(DB.concessions[0].id));
  assert.strictEqual(C.cnAlerts().length, 0);
});

// ── caps, overlaps and the typed box ─────────────────────────────────────────

ok('overlapping concessions add up, and never take the month below zero', () => {
  start();
  C.as('owner');
  assert.ok(C.cnRequest({ studentId: 's1', type: 'mess', value: 9000, reason: 'Mess off', startMonth: NOW }).ok);
  assert.strictEqual(P('pNow').concession, 7000, 'a mess concession took more than the mess');
  assert.ok(C.cnRequest({ studentId: 's1', type: 'both', value: 50000, reason: 'Full waiver', startMonth: NOW }).ok);
  assert.strictEqual(P('pNow').concession, 17000, 'the month went below zero');
  assert.strictEqual(P('pNow').overpaid, 5000);
});

ok('a hand-typed concession is kept, and the standing one adds to it', () => {
  start();
  const p = P('pNow');
  p.concession = 500; p.concessionDesc = 'Late arrival'; p.discount = 500;
  p.unpaid = C.calculateBill(p) - 5000; C.ledgerTrack(p);
  C.as('owner');
  assert.ok(C.cnRequest({ studentId: 's1', type: 'rent', value: 1500, reason: 'Hardship', startMonth: NOW }).ok);
  assert.strictEqual(p.concession, 2000);
  assert.ok(/^Late arrival · Hardship, approved by Owner Admin$/.test(p.concessionDesc), p.concessionDesc);
});

// ── declining and ending ─────────────────────────────────────────────────────

ok('a decline needs a note and changes nothing', () => {
  start();
  C.cnRequest({ studentId: 's1', type: 'rent', value: 1000, reason: 'Hardship', startMonth: NOW });
  C.as('owner');
  const id = C.cnQueue()[0].c.id;
  assert.strictEqual(C.cnDecline(id, '').ok, false);
  assert.ok(C.cnDecline(id, 'Fees already reduced').ok);
  assert.strictEqual(DB.concessions[0].status, 'declined');
  assert.strictEqual(P('pNow').concession, 0);
});

ok('ending early stops it from next month; this month keeps it', () => {
  start();
  C.as('owner');
  const r = C.cnRequest({ studentId: 's1', type: 'rent', value: 1500, reason: 'Hardship', startMonth: NOW });
  const next = rec('pNext', NEXT, 0);
  C.cnApplyToRecord(next);
  assert.strictEqual(next.concession, 1500);
  C.as('w_sara');
  const q = C.cnRequestEnd(r.concession.id, 'Paid back');
  assert.ok(q.ok && q.pending, q.reason);
  C.as('owner');
  assert.ok(C.cnApprove(r.concession.id).ok);
  assert.strictEqual(r.concession.status, 'ended');
  assert.strictEqual(P('pNow').concession, 1500, 'this month lost it');
  assert.strictEqual(next.concession, 0, 'next month kept it');
});

ok('a month edited below its standing concession keeps what was typed', () => {
  start();
  C.as('owner');
  assert.ok(C.cnRequest({ studentId: 's1', type: 'rent', value: 1500, reason: 'Hardship', startMonth: NOW }).ok);
  const p = P('pNow');
  assert.strictEqual(p.concession, 1500);
  // What submitEditPayment does when the box is lowered to 500.
  p.concessionsOverridden = true;
  p.concession = 500; p.discount = 500;
  // An unrelated concession for the same student re-applies everything…
  assert.ok(C.cnRequest({ studentId: 's1', type: 'mess', value: 200, reason: 'Other', startMonth: NEXT }).ok);
  assert.strictEqual(p.concession, 500, 'the standing concession came back over the edit');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
