/* --- HOSTYLLO -- mess exemption (warden ledger spec §2.6, §3.6, §5 step 7) -------

   Loads config.js, utils.js, finance.js, ledger.js and messExempt.js the way the
   app loads them and drives the real rules: who may request, approve and
   decline; what an approval does to billing and to this month's unpaid record;
   that nothing happens outside a "rent + mess together" hostel.

   Run:  node tests/messExempt.test.js
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
['config.js', 'utils.js', 'finance.js', 'ledger.js', 'messExempt.js']
  .forEach(f => vm.runInContext(R(f), sandbox, { filename: f }));
vm.runInContext(`
  var WARDENS = {
    owner:  { name: 'Owner Admin', perms: { users: true, payments: true } },
    w_sara: { name: 'Sara Warden', perms: { payments: true } },
  };
  var CUR_ROLE = 'w_sara', CUR_USER = WARDENS.w_sara;
  var LOG = [];
  function canDo(p) { return !!(CUR_USER && CUR_USER.perms && CUR_USER.perms[p] === true); }
  function logActivity(a, d) { LOG.push(a + ': ' + d); }
  // dashboard.js owns this; the month records here carry a YYYY-MM key.
  function _payMatchesMonth(p, k) { return p && p.month === k; }
`, sandbox);

const M = vm.runInContext(`({
  DB, money, calculateBill, calculateOutstanding, ledgerTrack, ledgerLoaded, ledgerImportIfEmpty,
  resolveCharges, thisMonth,
  meApplies, meIsAdmin, mePending, meQueue, meRequest, meApprove, meDecline, meMarkSeen, meAlerts,
  as: id => { CUR_ROLE = id; CUR_USER = WARDENS[id]; },
  log: () => LOG,
})`, sandbox);
const { DB } = M;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

const S = () => DB.students.find(s => s.id === 's1');
const NOW = M.thisMonth();

function start(model) {
  DB.settings.serviceModel = model || 'rent_mess_bundled';
  DB.settings.roomTypes = [{ id: 'rt2', name: '2-Seater', capacity: 2, defaultRent: 10000, defaultMess: 7000 }];
  DB.rooms = [{ id: 'r1', number: 'A1', floor: 'Ground', typeId: 'rt2' }];
  DB.students = [{ id: 's1', name: 'Ali Khan', roomId: 'r1', status: 'Active' }];
  DB.payments = []; DB.archive = []; DB.studentLedger = [];
  M.ledgerLoaded(); M.ledgerImportIfEmpty();
  const rec = (id, month, amount) => {
    const p = { id, studentId: 's1', studentName: 'Ali Khan', month, monthlyRent: 10000, messCharge: 7000,
                messIncluded: true, extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0,
                amount, method: 'Cash', date: month + '-01' };
    const bill = M.calculateBill(p);
    p.unpaid = Math.max(0, bill - amount); p.overpaid = 0; p.status = p.unpaid > 0 ? 'Pending' : 'Paid';
    DB.payments.push(p); M.ledgerTrack(p);
    return p;
  };
  rec('pOld', '2020-01', 17000);    // an older, paid month
  rec('pNow', NOW, 5000);           // this month, part paid
  M.as('w_sara');
}

// ── requesting ───────────────────────────────────────────────────────────────

ok('a bundled hostel bills everyone rent + mess until an exemption is approved', () => {
  start();
  assert.strictEqual(M.meApplies(), true);
  assert.strictEqual(M.resolveCharges(S()).total, 17000);
});

ok('a warden request waits for an admin and changes nothing yet', () => {
  const r = M.meRequest('s1', 'start', 'Medical diet');
  assert.ok(r.ok && r.pending, r.reason);
  assert.strictEqual(S().messExempt, undefined);
  assert.strictEqual(M.resolveCharges(S()).total, 17000);
  assert.strictEqual(M.meQueue().length, 1);
});

ok('a reason is required, and one request waits at a time', () => {
  assert.strictEqual(M.meRequest('s1', 'start', 'again').ok, false);
  start();
  assert.strictEqual(M.meRequest('s1', 'start', '   ').ok, false);
});

ok('a warden cannot approve; an admin sees the request on the bell', () => {
  start();
  M.meRequest('s1', 'start', 'Medical diet');
  assert.strictEqual(M.meApprove('s1').ok, false);
  M.as('owner');
  const alerts = M.meAlerts();
  assert.strictEqual(alerts.length, 1);
  assert.ok(/Mess exemption requested — Ali Khan \(by Sara Warden\)/.test(alerts[0].msg), alerts[0].msg);
});

// ── approving ────────────────────────────────────────────────────────────────

ok('approval bills rent only and takes the mess off this month\'s unpaid bill', () => {
  const r = M.meApprove('s1');
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.adjusted, 1);
  assert.strictEqual(S().messExempt, true);
  assert.strictEqual(S().messExemptReason, 'Medical diet');
  assert.strictEqual(S().messExemptApprovedBy, 'owner');
  assert.strictEqual(S().messExemptRequest, null);
  assert.strictEqual(M.resolveCharges(S()).total, 10000);
  const now = DB.payments.find(p => p.id === 'pNow');
  assert.strictEqual(now.messIncluded, false);
  assert.strictEqual(now.unpaid, 5000);
  assert.strictEqual(now.amount, 5000, 'collected money was touched');
  const adj = DB.studentLedger.filter(e => e.paymentRecordId === 'pNow' && e.type === 'adjustment').pop();
  assert.ok(adj && /Mess exemption: Medical diet/.test(adj.reason), adj && adj.reason);
});

ok('paid and older months are untouched', () => {
  const old = DB.payments.find(p => p.id === 'pOld');
  assert.strictEqual(old.messIncluded, true);
  assert.strictEqual(old.unpaid, 0);
});

ok('the warden sees the outcome once', () => {
  M.as('w_sara');
  let mine = M.meAlerts();
  assert.strictEqual(mine.length, 1);
  assert.ok(/was approved/.test(mine[0].msg), mine[0].msg);
  assert.strictEqual(M.meMarkSeen('s1'), true);
  assert.strictEqual(M.meAlerts().length, 0);
});

// ── ending ───────────────────────────────────────────────────────────────────

ok('ending goes through the same request; a decline needs a note', () => {
  const r = M.meRequest('s1', 'end', 'Back on the mess');
  assert.ok(r.ok && r.pending, r.reason);
  M.as('owner');
  assert.strictEqual(M.meDecline('s1', '').ok, false);
  assert.ok(M.meDecline('s1', 'Diet plan runs to December').ok);
  assert.strictEqual(S().messExempt, true, 'a declined end changed the exemption');
  assert.strictEqual(S().messExemptLast.outcome, 'declined');
});

ok('an approved end bills mess again; this month stays as it is', () => {
  M.as('w_sara');
  M.meRequest('s1', 'end', 'Back on the mess');
  M.as('owner');
  assert.ok(M.meApprove('s1').ok);
  assert.strictEqual(S().messExempt, false);
  assert.strictEqual(M.resolveCharges(S()).total, 17000);
  assert.strictEqual(DB.payments.find(p => p.id === 'pNow').messIncluded, false);
});

ok("an admin's own request is decided at once", () => {
  start();
  M.as('owner');
  const r = M.meRequest('s1', 'start', 'Medical diet');
  assert.ok(r.ok, r.reason);
  assert.strictEqual(r.pending, false);
  assert.strictEqual(S().messExempt, true);
  assert.strictEqual(M.meQueue().length, 0);
});

// ── other hostels ────────────────────────────────────────────────────────────

ok('outside a bundled hostel there are no exemptions, and a stored flag is ignored', () => {
  start('rent_mess_optional');
  assert.strictEqual(M.meApplies(), false);
  assert.strictEqual(M.meRequest('s1', 'start', 'Medical diet').ok, false);
  S().messExempt = true;
  assert.strictEqual(M.resolveCharges(S()).total, 17000);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
