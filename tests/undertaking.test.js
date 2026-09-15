/* --- HOSTYLLO -- rules & undertaking (warden ledger spec §2.7, §3.8, §5 step 11) ---

   Loads config.js, utils.js and undertaking.js the way the app loads them and
   drives the rules: the starter text blocks an original, saving adds versions
   and never edits one, the first full print freezes the signing once, a
   reprint reads the version that was signed, and the scan filter.

   Run:  node tests/undertaking.test.js
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
['config.js', 'utils.js', 'undertaking.js'].forEach(f => vm.runInContext(R(f), sandbox, { filename: f }));
vm.runInContext(`
  var WARDENS = {
    owner:  { name: 'Owner Admin', perms: { settings: true, edit: true } },
    w_sara: { name: 'Sara Warden', perms: { edit: true } },
  };
  var CUR_ROLE = 'owner', CUR_USER = WARDENS.owner;
  function canDo(p) { return !!(CUR_USER && CUR_USER.perms && CUR_USER.perms[p] === true); }
`, sandbox);

const U = vm.runInContext(`({
  DB, today, UND_STARTER, undVersions, undIsStarter, undCurrent, undVersion, undRuleLines, undSave,
  undSignedCount, undSigned, undSignedVersion, undSignOriginal, undReprintLabel, undScanOf,
  undScanIsImage, undFilterMatch,
  as: id => { CUR_ROLE = id; CUR_USER = WARDENS[id]; },
})`, sandbox);
const { DB } = U;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

DB.settings.undertaking = undefined;
DB.students = [
  { id: 's1', name: 'Ali Khan', fatherName: 'Khan Sahib' },
  { id: 's2', name: 'Bilal Ahmed', docs: { files: [{ id: 'd1', kind: 'undertaking', type: 'image/jpeg', addedAt: '2026-09-01', data: 'data:image/jpeg;base64,AA==' }] } },
  { id: 's3', name: 'Omar Farooq', docs: { files: [{ id: 'd2', kind: 'undertaking', type: 'application/pdf', data: 'data:application/pdf;base64,AA==' }] } },
];
const S = id => DB.students.find(s => s.id === id);

ok('the starter text is ten generic rules and a declaration, and names nobody', () => {
  assert.strictEqual(U.undIsStarter(), true);
  assert.strictEqual(U.undCurrent().v, 0);
  assert.strictEqual(U.undRuleLines(U.UND_STARTER.rules).length, 10);
  const all = U.UND_STARTER.rules + U.UND_STARTER.declaration;
  assert.ok(!/Hostel Name|HOSTYLLO|Hostyllo/.test(all), 'the starter names a hostel');
});

ok('no original can be printed on the starter text', () => {
  const r = U.undSignOriginal(S('s1'));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(U.undSigned(S('s1')), false);
});

ok('only the Settings permission saves, and a rule and a declaration are required', () => {
  U.as('w_sara');
  assert.strictEqual(U.undSave({ rules: 'x', declaration: 'y' }).ok, false);
  U.as('owner');
  assert.strictEqual(U.undSave({ rules: '  \n ', declaration: 'y' }).ok, false);
  assert.strictEqual(U.undSave({ rules: 'x', declaration: ' ' }).ok, false);
  assert.strictEqual(U.undIsStarter(), true);
});

ok('the first save makes version 1 even from unchanged starter text', () => {
  const r = U.undSave({ rules: U.UND_STARTER.rules, declaration: U.UND_STARTER.declaration });
  assert.ok(r.ok && r.version === 1, JSON.stringify(r));
  assert.strictEqual(U.undIsStarter(), false);
  assert.strictEqual(U.undCurrent().savedByName, 'Owner Admin');
  const again = U.undSave({ rules: U.UND_STARTER.rules, declaration: U.UND_STARTER.declaration });
  assert.strictEqual(again.unchanged, true);
  assert.strictEqual(U.undVersions().length, 1);
});

ok('typed numbering and blank lines are dropped from the printed list', () => {
  assert.deepStrictEqual([...U.undRuleLines('1. First\n\n2) Second\n  Third  ')], ['First', 'Second', 'Third']);
});

ok('the first full print freezes the signing once, on the current version', () => {
  const r = U.undSignOriginal(S('s1'));
  assert.ok(r.ok, r.reason);
  assert.strictEqual(S('s1').firstSignedAt, U.today());
  assert.strictEqual(S('s1').rulesVersionAtSigning, 1);
  assert.strictEqual(S('s1').firstSignedByName, 'Owner Admin');
  S('s1').firstSignedAt = '2026-09-02';
  const again = U.undSignOriginal(S('s1'));
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.reason, 'already');
  assert.strictEqual(S('s1').firstSignedAt, '2026-09-02', 'a second original overwrote the first');
});

ok('a new version never edits the old one, and a reprint reads the version signed', () => {
  const r = U.undSave({ rules: 'A new rule', declaration: 'A new declaration' });
  assert.strictEqual(r.version, 2);
  assert.strictEqual(U.undVersion(1).rules, U.UND_STARTER.rules);
  assert.strictEqual(U.undSignedVersion(S('s1')).v, 1);
  assert.strictEqual(U.undSignedCount(1), 1);
  assert.strictEqual(U.undSignedCount(2), 0);
  assert.ok(/^REPRINT — originally signed /.test(U.undReprintLabel(S('s1'))));
  assert.ok(!/not recorded/.test(U.undReprintLabel(S('s1'))));
});

ok('a scan never printed from the app is dated by when it was attached', () => {
  const s2 = S('s2');
  assert.ok(!/not recorded/.test(U.undReprintLabel(s2, U.undScanOf(s2))));
  assert.ok(/not recorded/.test(U.undReprintLabel(S('s3'), U.undScanOf(S('s3')))));
});

ok('the scan and the Students filter', () => {
  assert.strictEqual(U.undScanOf(S('s1')), null);
  assert.strictEqual(U.undScanIsImage(U.undScanOf(S('s2'))), true);
  assert.strictEqual(U.undScanIsImage(U.undScanOf(S('s3'))), false);
  const pick = key => DB.students.filter(s => U.undFilterMatch(s, key)).map(s => s.id).join(',');
  assert.strictEqual(pick('All'), 's1,s2,s3');
  assert.strictEqual(pick('scan'), 's2,s3');
  assert.strictEqual(pick('noscan'), 's1');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
