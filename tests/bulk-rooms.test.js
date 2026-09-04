/* bulkRoomPlan() unit tests -- pure function, driven straight out of rooms.js
   without a browser. Extracts the function source and evaluates it against a
   fake DB, so the test exercises the SHIPPED code rather than a copy. */
'use strict';
const fs = require('fs');
const assert = require('assert');

const path = require('path');
const src = fs.readFileSync(
  path.join(__dirname, '..', 'renderer', 'src', 'modules', 'rooms.js'), 'utf8');

// Pull out the constants and the planner.
const grab = (name, kind) => {
  const re = new RegExp('(?:^|\\n)' + kind + '\\s+' + name + '\\b');
  const m = re.exec(src);
  if (!m) throw new Error('could not find ' + name);
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  if (kind === 'const') return src.slice(start, src.indexOf('\n', start) + 1);
  // function: balance braces
  let i = src.indexOf('{', start), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(start, j + 1);
};

const code = grab('BULK_ROOM_MAX', 'const') + '\n' + grab('bulkRoomPlan', 'function');

let DB;
const bulkRoomPlan = new Function('getDB', code + '; return bulkRoomPlan;')
  .call({}, () => DB);
// bulkRoomPlan closes over the global DB, so expose one.
global.DB = null;
const plan = (rooms, o) => { global.DB = { rooms }; return bulkRoomPlan(o); };

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

console.log('\nbulkRoomPlan()');

ok('a plain range creates every number, inclusive', () => {
  const r = plan([], { from: '1', to: '12' });
  assert.strictEqual(r.error, '');
  assert.strictEqual(r.create.length, 12);
  assert.strictEqual(r.create[0], '1');
  assert.strictEqual(r.create[11], '12');
});

ok('a leading zero in the start sets the padding', () => {
  const r = plan([], { from: '01', to: '03' });
  assert.deepStrictEqual(r.create, ['01', '02', '03']);
});

ok('no leading zero means no padding', () => {
  const r = plan([], { from: '1', to: '3' });
  assert.deepStrictEqual(r.create, ['1', '2', '3']);
});

ok('a prefix produces a wing', () => {
  const r = plan([], { prefix: 'A', from: '01', to: '02' });
  assert.deepStrictEqual(r.create, ['A 01', 'A 02']);
});

ok('THE POINT: an existing room is skipped, not failed, and is reported', () => {
  const r = plan([{ number: '6' }], { from: '1', to: '8' });
  assert.strictEqual(r.error, '', 'one collision must not fail the batch');
  assert.strictEqual(r.create.length, 7);
  assert.deepStrictEqual(r.skip, ['6']);
  assert.ok(!r.create.includes('6'));
});

ok('collisions are case-insensitive, like submitAddRoom', () => {
  const r = plan([{ number: 'a 01' }], { prefix: 'A', from: '01', to: '02' });
  assert.deepStrictEqual(r.skip, ['A 01']);
  assert.deepStrictEqual(r.create, ['A 02']);
});

ok('a range entirely inside existing rooms creates nothing', () => {
  const r = plan([{ number: '1' }, { number: '2' }], { from: '1', to: '2' });
  assert.strictEqual(r.create.length, 0);
  assert.strictEqual(r.skip.length, 2);
});

ok('a reversed range is refused', () => {
  assert.ok(/comes before/.test(plan([], { from: '10', to: '2' }).error));
});

ok('a missing bound is refused', () => {
  assert.ok(/start and an end/.test(plan([], { from: '', to: '5' }).error));
  assert.ok(/start and an end/.test(plan([], { from: '5', to: '' }).error));
});

ok('a typo cannot create ten thousand rooms', () => {
  const r = plan([], { from: '1', to: '100000' });
  assert.ok(/most this adds at once/.test(r.error), r.error);
  assert.strictEqual(r.create.length, 0);
});

ok('the cap boundary is inclusive', () => {
  assert.strictEqual(plan([], { from: '1', to: '200' }).error, '');
  assert.ok(plan([], { from: '1', to: '201' }).error !== '');
});

ok('a single room is a legal range', () => {
  const r = plan([], { from: '7', to: '7' });
  assert.deepStrictEqual(r.create, ['7']);
});

ok('an empty database is fine', () => {
  assert.strictEqual(plan(undefined, { from: '1', to: '2' }).create.length, 2);
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
