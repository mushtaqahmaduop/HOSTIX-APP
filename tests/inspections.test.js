/* Room inspection rules (owner, 2026-09-29/30): the overall result from the
   checklist, what stops a save, and how rows from the old form are read.

     node tests/inspections.test.js */
'use strict';

const assert = require('assert');
const { INSPECTION_ITEMS, INSP_ITEM_CATEGORY, inspOverall, inspProblemWith, inspRead } =
  require('../renderer/src/modules/inspections.js');

let passed = 0, failed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const items = (map) => INSPECTION_ITEMS.map(name => ({ name, status: map[name] || 'ok', note: map[name] === 'problem' ? 'broken' : '' }));

console.log('\nRoom inspections');

ok('the checklist is the fixed ten (owner: "fixed 10 for now")', () => {
  assert.strictEqual(INSPECTION_ITEMS.length, 10);
});

ok('every item files its problems under a real Complaints category', () => {
  const cats = ['Maintenance', 'Plumbing', 'Electrical', 'Furniture', 'Network', 'Appliance', 'Cleanliness', 'Mess / Food', 'Security', 'Other'];
  INSPECTION_ITEMS.forEach(n => assert.ok(cats.includes(INSP_ITEM_CATEGORY[n]), n + ' -> ' + INSP_ITEM_CATEGORY[n]));
});

ok('no problems Good, one or two Fair, three or more Poor; N/A is not a problem', () => {
  assert.strictEqual(inspOverall(items({ Lighting: 'na' })), 'Good');
  assert.strictEqual(inspOverall(items({ Plumbing: 'problem' })), 'Fair');
  assert.strictEqual(inspOverall(items({ Plumbing: 'problem', 'Fan / AC': 'problem' })), 'Fair');
  assert.strictEqual(inspOverall(items({ Plumbing: 'problem', 'Fan / AC': 'problem', Flooring: 'problem' })), 'Poor');
});

ok('every item must be marked before a save', () => {
  const it = items({}); it[3].status = '';
  assert.ok(/Mark every item — 1 still to go \(Bathroom\)/.test(inspProblemWith(it)), inspProblemWith(it));
});

ok('a problem must say what is wrong', () => {
  const it = items({ Plumbing: 'problem' }); it[4].note = '   ';
  assert.strictEqual(inspProblemWith(it), 'Say what is wrong with Plumbing');
  it[4].note = 'Tap leaks';
  assert.strictEqual(inspProblemWith(it), '');
});

ok('an old-form row is read, not rewritten: a tick is OK, no tick is Not marked', () => {
  const old = { id: 'ins_1', roomId: 'r', date: '2026-01-01', overallCondition: 'Poor',
                checklist: { 'Walls & Paint': true, 'Plumbing': false } };
  const r = inspRead(old);
  assert.strictEqual(r.legacy, true);
  assert.strictEqual(r.overall, 'Poor');
  assert.strictEqual(r.items.find(i => i.name === 'Walls & Paint').status, 'ok');
  assert.strictEqual(r.items.find(i => i.name === 'Plumbing').status, 'unmarked');
  assert.strictEqual(r.items.length, 10);
  assert.ok(!('items' in old), 'the stored row is untouched');
});

console.log('\n  ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
