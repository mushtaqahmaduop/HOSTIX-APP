/* Student numbers are never handed out twice (bug audit BUG-008, 2026-09-28).

   Deleting the highest-numbered student freed the number while their payments
   still pointed at it; the next admission was given it and inherited them.

     npm run test:studentid */
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
const S = vm.runInContext('({ DB, nextStudentId, noteStudentId, STUDENT_REF_TABLES })', sandbox);
const { DB } = S;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};
function reset() {
  DB.settings = DB.settings || {};
  delete DB.settings.studentSeq;
  DB.students = []; DB.payments = []; DB.archive = []; DB.studentLedger = [];
  DB.cancellations = []; DB.concessions = []; DB.issues = [];
}
const stu = id => ({ id, name: 'S' + id });

console.log('\nStudent numbers');

ok('a fresh hostel starts at 001', () => {
  reset();
  assert.strictEqual(S.nextStudentId(), '001');
});

ok('the next number follows the highest student on file', () => {
  reset();
  DB.students = [stu('001'), stu('002'), stu('007')];
  assert.strictEqual(S.nextStudentId(), '008');
});

ok('THE BUG: deleting the top student must not free their number while their payments remain', () => {
  reset();
  DB.students = [stu('001'), stu('002')];
  DB.payments = [{ id: 'p', studentId: '003', unpaid: 5000 }];   // #003 was deleted; the payment stays
  assert.strictEqual(S.nextStudentId(), '004');
});

ok('a number referenced only by the archive, the ledger or a cancellation is also taken', () => {
  for (const col of ['archive', 'studentLedger', 'cancellations', 'concessions']) {
    reset();
    DB.students = [stu('001')];
    DB[col] = [{ id: 'x', studentId: '010' }];
    assert.strictEqual(S.nextStudentId(), '011', col);
  }
  reset();
  DB.issues = [{ id: 'i', raisedById: '020' }];
  assert.strictEqual(S.nextStudentId(), '021', 'issues.raisedById');
});

ok('the counter remembers a number even after every record naming it is gone', () => {
  reset();
  DB.students = [stu('001'), stu('002'), stu('003')];
  S.noteStudentId('003');
  DB.students = [stu('001'), stu('002')];   // #003 deleted, and it had no records
  assert.strictEqual(S.nextStudentId(), '004');
});

ok('looking at the next number does not use it up (the form preview)', () => {
  reset();
  DB.students = [stu('001')];
  assert.strictEqual(S.nextStudentId(), '002');
  assert.strictEqual(S.nextStudentId(), '002');
});

ok('the counter only goes up, and ignores ids that are not student codes', () => {
  reset();
  S.noteStudentId('050');
  S.noteStudentId('012');
  S.noteStudentId('stuX');
  assert.strictEqual(DB.settings.studentSeq, 50);
  DB.payments = [{ id: 'p', studentId: 'manual-name' }];
  assert.strictEqual(S.nextStudentId(), '051');
});

ok('both places that admit a student record the number', () => {
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', 'modules', f), 'utf8');
  const s = src('students.js');
  assert.strictEqual((s.match(/DB\.students\.push\(t\); noteStudentId\(t\.id\);/g) || []).length, 2);
  assert.ok(/const studentId = nextStudentId\(\);\s*\n?\s*noteStudentId\(studentId\);/.test(src('settings.js').replace(/\r\n/g, '\n')));
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
