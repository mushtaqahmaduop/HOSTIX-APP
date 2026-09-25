/* ─── HOSTYLLO — Migration 003 transform test (plain Node) ───────────────────
   Proves the pure half of the maintenance + complaints merge: that a record
   survives it with nothing lost, that the three named changes happen and
   NOTHING else does, and that a reference number cannot move.

   Run:  node migrations/003-issues-merge.test.js
   (The SQLite half runs inside Electron — better-sqlite3 is built for the
   Electron ABI and will not load here. Same split as 001.)
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const assert = require('assert');
const M = require('./003-issues-merge');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

// Shaped from the actual constructors in issues.js saveIssue().
const MAINT = {
  id: 'mt_abc123', seq: 7, title: 'Leaking pipe', roomId: 'room_a1',
  category: 'Plumbing', priority: 'High', location: 'Bathroom',
  description: 'Water under the basin', date: '2026-09-04', expectedDate: '2026-09-06',
  assignedTo: 'Plumber', raisedBy: 'محمد بلال', raisedById: 'stu_9',
  status: 'InProgress', resolvedDate: '',
};
const COMP = {
  id: 'cp_def456', seq: 3, subject: 'No water in bathroom', studentId: 'stu_2',
  category: 'Plumbing', priority: 'Medium', description: 'Since Tuesday',
  date: '2026-09-05', expectedDate: '', assignedTo: '', status: 'UnderReview',
  resolvedDate: '', response: 'Plumber booked',
};

console.log('\n003 — the three named changes, and nothing else');

ok('a maintenance ticket keeps every field it had', () => {
  const out = M.mergeRecord('maintenance', MAINT, 1);
  for (const k of Object.keys(MAINT)) {
    assert.deepStrictEqual(out[k], MAINT[k], 'field `' + k + '` was changed or lost');
  }
});

ok('a complaint keeps every field except the one that is renamed', () => {
  const out = M.mergeRecord('complaint', COMP, 1);
  for (const k of Object.keys(COMP)) {
    if (k === 'subject' || k === 'status') continue;   // renamed / remapped below
    assert.deepStrictEqual(out[k], COMP[k], 'field `' + k + '` was changed or lost');
  }
  assert.strictEqual(out.response, 'Plumber booked', 'the response to the student was lost');
});

ok('subject becomes title, and subject does not linger', () => {
  const out = M.mergeRecord('complaint', COMP, 1);
  assert.strictEqual(out.title, 'No water in bathroom');
  assert.ok(!('subject' in out), 'both spellings survived, so one form has two names for one field');
});

ok('a record carrying BOTH spellings keeps the one the form writes', () => {
  const out = M.mergeRecord('complaint', { id: 'cp_1', subject: 'from the form', title: 'stale' }, 1);
  assert.strictEqual(out.title, 'from the form');
});

ok('UnderReview becomes InProgress', () => {
  assert.strictEqual(M.mergeRecord('complaint', COMP, 1).status, 'InProgress');
});

ok('Open and Resolved are NOT touched', () => {
  assert.strictEqual(M.mergeRecord('complaint', { id: 'c', status: 'Open' }, 1).status, 'Open');
  assert.strictEqual(M.mergeRecord('maintenance', { id: 'm', status: 'Resolved' }, 1).status, 'Resolved');
  assert.strictEqual(M.mergeRecord('maintenance', { id: 'm', status: 'InProgress' }, 1).status, 'InProgress');
});

ok('kind is stamped, because it is what MA-/CO- reads', () => {
  assert.strictEqual(M.mergeRecord('maintenance', MAINT, 1).kind, 'maintenance');
  assert.strictEqual(M.mergeRecord('complaint', COMP, 1).kind, 'complaint');
});

console.log('\n003 — a reference number cannot move');

ok('an existing seq is never renumbered', () => {
  assert.strictEqual(M.mergeRecord('maintenance', MAINT, 99).seq, 7, 'MA-0007 would have become MA-0099');
  assert.strictEqual(M.mergeRecord('complaint', COMP, 99).seq, 3);
});

ok('a record with NO seq is stamped from its position in its own collection', () => {
  // The pre-seq records. After the merge there is no "position in its own
  // collection" left to fall back on, so this is the last chance to fix it.
  assert.strictEqual(M.mergeRecord('maintenance', { id: 'mt_old', title: 'x' }, 4).seq, 4);
  assert.strictEqual(M.mergeRecord('complaint', { id: 'cp_old', subject: 'y' }, 2).seq, 2);
});

ok('seq 0 and a non-numeric seq are treated as absent, not kept', () => {
  assert.strictEqual(M.mergeRecord('maintenance', { id: 'a', seq: 0 }, 5).seq, 5);
  assert.strictEqual(M.mergeRecord('maintenance', { id: 'b', seq: 'oops' }, 6).seq, 6);
});

console.log('\n003 — the awkward records');

ok('a record with unknown extra fields keeps them', () => {
  // The reason mergeRecord copies the whole record instead of listing fields:
  // a whitelist destroys whatever it forgot, and it forgets the next field
  // somebody adds to the form.
  const odd = { id: 'mt_x', title: 't', somethingAddedLater: { deep: [1, 2] }, photos: ['a.jpg'] };
  const out = M.mergeRecord('maintenance', odd, 1);
  assert.deepStrictEqual(out.somethingAddedLater, { deep: [1, 2] });
  assert.deepStrictEqual(out.photos, ['a.jpg']);
});

ok('an empty complaint does not become an empty-titled crash', () => {
  const out = M.mergeRecord('complaint', { id: 'cp_empty' }, 1);
  assert.strictEqual(out.title, '');
  assert.strictEqual(out.kind, 'complaint');
});

ok('the source record is not mutated', () => {
  const src = JSON.parse(JSON.stringify(COMP));
  M.mergeRecord('complaint', src, 1);
  assert.deepStrictEqual(src, COMP, 'the migration edited the row it was reading');
});

ok('cost is left exactly as found — the phantom READ is what goes, in issues.js', () => {
  assert.ok(!('cost' in M.mergeRecord('maintenance', { id: 'a', title: 't' }, 1)),
    'a key nothing ever wrote was invented by the migration');
  assert.strictEqual(M.mergeRecord('maintenance', { id: 'b', cost: 500 }, 1).cost, 500,
    'a value somebody did record was destroyed');
});

console.log('\n003 - folding a backup written before the merge');

const { issuesFoldLegacy } = require('../renderer/src/utils');

function legacyDb() {
  return {
    settings: {},
    maintenance: [JSON.parse(JSON.stringify(MAINT))],
    complaints:  [JSON.parse(JSON.stringify(COMP))],
    issues: [],
  };
}

ok('a pre-merge backup lands in the register instead of vanishing', () => {
  const d = issuesFoldLegacy(legacyDb());
  assert.strictEqual(d.issues.length, 2, 'the restored records did not reach the register');
  assert.ok(d.issues.find(x => x.id === 'mt_abc123' && x.kind === 'maintenance'));
  assert.ok(d.issues.find(x => x.id === 'cp_def456' && x.kind === 'complaint'));
});

ok('the fold is recorded, so it happens once', () => {
  const d = issuesFoldLegacy(legacyDb());
  assert.ok(d.settings.issuesMergedAt, 'nothing recorded that this database has been folded');
});

ok('A DELETED ISSUE DOES NOT COME BACK ON THE NEXT LOAD', () => {
  /* The legacy arrays are deliberately left populated as the rollback path.
     Without the once-only flag every launch would fold them again, and an
     issue the warden deleted would reappear. This is the test for that. */
  const d = issuesFoldLegacy(legacyDb());
  d.issues = d.issues.filter(x => x.id !== 'mt_abc123');   // the warden deletes it
  issuesFoldLegacy(d);                                      // next launch
  assert.strictEqual(d.issues.length, 1, 'a deleted issue was resurrected from the legacy table');
  assert.ok(!d.issues.some(x => x.id === 'mt_abc123'));
});

ok('a database already merged is left alone', () => {
  const d = { settings: { issuesMergedAt: '2026-09-21' }, maintenance: [MAINT], complaints: [COMP],
              issues: [{ id: 'mt_abc123', kind: 'maintenance', title: 'edited since' }] };
  issuesFoldLegacy(d);
  assert.strictEqual(d.issues.length, 1);
  assert.strictEqual(d.issues[0].title, 'edited since', 'the fold overwrote a record edited after it');
});

ok('a half-folded database does not duplicate what it already holds', () => {
  const d = legacyDb();
  d.issues = [{ id: 'cp_def456', kind: 'complaint', title: 'already here' }];
  issuesFoldLegacy(d);
  assert.strictEqual(d.issues.length, 2, 'got ' + d.issues.length + ' - a record was folded twice');
});

ok('missing collections do not throw - an empty install restores fine', () => {
  const d = issuesFoldLegacy({ settings: {} });
  assert.deepStrictEqual(d.issues, []);
});

ok('a legacy record with no id is skipped rather than pushed unreachable', () => {
  const d = issuesFoldLegacy({ settings: {}, maintenance: [{ title: 'no id' }], complaints: [] });
  assert.strictEqual(d.issues.length, 0);
});


console.log('\n' + '-'.repeat(60));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
