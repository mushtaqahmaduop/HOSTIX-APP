/* --- HOSTYLLO -- cash handovers (warden ledger spec §3.3, §5 step 4) ------------

   Loads config.js, utils.js, finance.js, ledger.js and handovers.js the way the
   app loads them and drives the real rules: what a handover contains, who may
   send, take back, flag and approve it, and when Approve is possible. The
   screens are proven in tests/handovers.spec.js.

   Run:  node tests/handovers.test.js
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
vm.runInContext(R('config.js'),    sandbox, { filename: 'config.js' });
vm.runInContext(R('utils.js'),     sandbox, { filename: 'utils.js' });
vm.runInContext(R('finance.js'),   sandbox, { filename: 'finance.js' });
vm.runInContext(R('ledger.js'),    sandbox, { filename: 'ledger.js' });
vm.runInContext(R('handovers.js'), sandbox, { filename: 'handovers.js' });
vm.runInContext(`
  var WARDENS = {
    owner:  { name: 'Owner',       perms: { users: true, payments: true } },
    w_sara: { name: 'Sara Warden', perms: { payments: true } },
    w_ali:  { name: 'Ali Warden',  perms: { payments: true } },
  };
  var CUR_ROLE = 'w_sara', CUR_USER = WARDENS.w_sara;
  var LOG = [];
  function canDo(p) { return !!(CUR_USER && CUR_USER.perms && CUR_USER.perms[p] === true); }
  function logActivity(a, d) { LOG.push(a + ': ' + d); }
`, sandbox);

const H = vm.runInContext(`({
  DB, money, calculateBill, applyPayment, reversePayment,
  ledgerTrack, ledgerLoaded, ledgerImportIfEmpty,
  handoverSync, hoPendingLines, hoSum, hoByMethod, hoOpenFor, hoItems, hoLabel, hoHue,
  hoEvaluate, hoSend, hoTakeBack, hoApprove, hoFlag, hoAlerts, hoMarkSeen,
  as: id => { CUR_ROLE = id; CUR_USER = WARDENS[id]; },
  log: () => LOG,
})`, sandbox);
const { DB } = H;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

function rec(o) {
  const p = Object.assign({ id: 'p1', studentId: 's1', studentName: 'Fixture', month: 'September 2026',
    monthlyRent: 20000, messCharge: 0, messIncluded: true, extraCharges: [], extraTotal: 0,
    admissionFee: 0, concession: 0, amount: 0, method: 'Cash', date: '2026-09-01', status: 'Pending' }, o || {});
  const bill = H.calculateBill(p);
  p.unpaid = Math.max(0, bill - H.money(p.amount)); p.overpaid = 0;
  return p;
}

let P, HO;
function start() {
  DB.payments = []; DB.archive = []; DB.studentLedger = [];
  DB.wardenCollections = []; DB.handovers = []; DB.handoverItems = [];
  H.ledgerLoaded(); H.ledgerImportIfEmpty();
  P = rec(); DB.payments.push(P); H.ledgerTrack(P);
  H.as('w_sara');
  H.applyPayment(P, { amount: 5000, method: 'Cash' });
  H.applyPayment(P, { amount: 3000, method: 'JazzCash' });
  H.reversePayment(P, { amount: 1000, reason: 'Wrong amount', method: 'Cash' });
}

// ── lines ────────────────────────────────────────────────────────────────────

ok('every collection line gets one status row, and only once', () => {
  start();
  assert.strictEqual(H.handoverSync(), 3);
  assert.strictEqual(H.handoverSync(), 0);
  same(DB.wardenCollections.map(r => r.wardenId + ':' + r.amount + ':' + r.status),
       ['w_sara:5000:pending_handover', 'w_sara:3000:pending_handover', 'w_sara:-1000:pending_handover']);
});

ok('a warden hands over net cash: collections less the reversals they recorded', () => {
  const lines = H.hoPendingLines('w_sara');
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(H.hoSum(lines), 7000);
  same(H.hoByMethod(lines), { Cash: 4000, JazzCash: 3000 });
});

ok('imported history is never a line', () => {
  DB.studentLedger.push({ id: 'old', studentId: 's1', type: 'payment', amount: 900, createdBy: null,
    imported: true, runningBalance: 0, createdAt: '2026-01-01T00:00:00' });
  assert.strictEqual(H.handoverSync(), 0);
  DB.studentLedger.pop();
});

// ── sending ──────────────────────────────────────────────────────────────────

ok('sending takes a snapshot of every waiting line', () => {
  const r = H.hoSend('w_sara');
  assert.ok(r.ok, r.reason);
  HO = r.handover;
  assert.strictEqual(HO.status, 'pending');
  assert.strictEqual(HO.totalAmount, 7000);
  assert.strictEqual(HO.lineCount, 3);
  same(HO.expected, { Cash: 4000, JazzCash: 3000 });
  assert.ok(DB.wardenCollections.every(x => x.status === 'handed_over' && x.handoverId === HO.id));
  assert.strictEqual(H.hoLabel(HO), 'Waiting');
});

ok('one open handover at a time', () => {
  assert.strictEqual(H.hoSend('w_sara').ok, false);
});

ok('money collected after sending waits for the next handover', () => {
  H.applyPayment(P, { amount: 2000, method: 'Cash' });
  const lines = H.hoPendingLines('w_sara');
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(H.hoSum(lines), 2000);
  assert.strictEqual(HO.totalAmount, 7000, 'the snapshot does not move');
});

ok('an account that manages users has nothing to hand over', () => {
  H.as('owner');
  assert.strictEqual(H.hoSend('owner').ok, false);
  H.as('w_sara');
});

ok('only the sender may take a handover back, and only while it waits', () => {
  assert.strictEqual(H.hoTakeBack(HO.id, 'w_ali').ok, false);
  const r = H.hoTakeBack(HO.id, 'w_sara');
  assert.ok(r.ok, r.reason);
  assert.strictEqual(H.hoLabel(HO), 'Taken back');
  assert.strictEqual(H.hoPendingLines('w_sara').length, 4);
  const again = H.hoSend('w_sara');
  assert.ok(again.ok);
  HO = again.handover;
  assert.strictEqual(HO.totalAmount, 9000);
});

// ── reviewing ────────────────────────────────────────────────────────────────

const entryOf = (method, amount) =>
  H.hoItems(HO.id).find(x => x.item.method === method && H.money(x.item.amount) === amount).item.ledgerEntryId;

ok('a reversal line is always included, whatever is ticked', () => {
  const ev = H.hoEvaluate(HO, [entryOf('Cash', 5000)], {});
  assert.ok(ev.ticked.has(entryOf('Cash', -1000)));
  assert.strictEqual(ev.approvedAmount, 4000);
});

ok('Approve is possible only when every method\'s count equals what the ticked lines expect', () => {
  const ticked = [entryOf('Cash', 5000), entryOf('Cash', 2000)];     // JazzCash 3,000 unticked
  let ev = H.hoEvaluate(HO, ticked, { Cash: '6000' });
  assert.strictEqual(ev.canApprove, false, 'JazzCash not counted');
  ev = H.hoEvaluate(HO, ticked, { Cash: '5950', JazzCash: '0' });
  assert.strictEqual(ev.canApprove, false, 'no tolerance');
  ev = H.hoEvaluate(HO, ticked, { Cash: '6000', JazzCash: '0' });
  assert.strictEqual(ev.canApprove, true);
  assert.strictEqual(ev.approvedAmount, 6000);
  assert.strictEqual(ev.returnedCount, 1);
  assert.strictEqual(ev.returnedAmount, 3000);
});

ok('a warden cannot review; flagging needs a note and records who and when', () => {
  assert.strictEqual(H.hoFlag(HO.id, { note: 'short' }).ok, false, 'warden');
  H.as('owner');
  assert.strictEqual(H.hoFlag(HO.id, { note: '  ' }).ok, false, 'blank note');
  const r = H.hoFlag(HO.id, { counted: { Cash: '5000' }, note: 'Cash short by 1,000' });
  assert.ok(r.ok, r.reason);
  assert.strictEqual(H.hoLabel(HO), 'Discrepancy');
  assert.strictEqual(HO.notes[0].byName, 'Owner');
  assert.ok(HO.notes[0].at);
  assert.ok(DB.wardenCollections.filter(x => x.handoverId === HO.id).every(x => x.status === 'disputed'));
});

ok('approving a discrepancy needs a note; unticked lines go back when approved', () => {
  const ticked = [entryOf('Cash', 5000), entryOf('Cash', 2000)];
  const counted = { Cash: '6000', JazzCash: '0' };
  assert.strictEqual(H.hoApprove(HO.id, { ticked, counted }).ok, false, 'needs settling note');
  assert.strictEqual(H.hoApprove(HO.id, { ticked, counted: { Cash: '5000', JazzCash: '0' }, note: 'x' }).ok, false,
    'still does not match');
  const r = H.hoApprove(HO.id, { ticked, counted, how: { Cash: 'typed', JazzCash: 'matched' },
                                 note: 'Sara brought the missing 1,000' });
  assert.ok(r.ok, r.reason);
  assert.strictEqual(H.hoLabel(HO), 'Part approved');
  assert.strictEqual(HO.approvedAmount, 6000);
  assert.strictEqual(HO.adminName, 'Owner');
  same(HO.countedHow, { Cash: 'typed', JazzCash: 'matched' });
  const jazz = DB.wardenCollections.find(x => x.ledgerEntryId === entryOf('JazzCash', 3000));
  assert.strictEqual(jazz.status, 'pending_handover');
  assert.strictEqual(jazz.handoverId, null);
  assert.strictEqual(H.hoPendingLines('w_sara').length, 1);
  assert.strictEqual(DB.wardenCollections.filter(x => x.status === 'approved').length, 3);
  assert.strictEqual(HO.notes.length, 2);
});

ok('an approved handover cannot be reviewed again or taken back', () => {
  assert.strictEqual(H.hoApprove(HO.id, { ticked: [], counted: {} }).ok, false);
  assert.strictEqual(H.hoTakeBack(HO.id, 'w_sara').ok, false);
});

// ── alerts ───────────────────────────────────────────────────────────────────

ok('the bell tells an approver what waits, and a warden what happened until seen', () => {
  H.as('w_sara');
  const s = H.hoSend('w_sara');
  assert.ok(s.ok, s.reason);
  H.as('owner');
  assert.ok(H.hoAlerts().some(a => /Handover waiting from Sara Warden/.test(a.msg)));
  H.as('w_sara');
  const mine = H.hoAlerts().map(a => a.msg);
  assert.ok(mine.some(m => /part approved/.test(m)), mine.join(' | '));
  assert.ok(H.hoMarkSeen('w_sara') >= 1);
  assert.ok(!H.hoAlerts().some(a => /part approved/.test(a.msg)));
  assert.ok(H.log().some(l => /Handover Part Approved/.test(l)));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
