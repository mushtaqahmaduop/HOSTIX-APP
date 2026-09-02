/* --- HOSTYLLO - activation fingerprint guard (pure Node) --------------------

   ONE FAILURE, PROVEN THREE WAYS.

   activateLicense() seals the licence against getMachineId(), and every later
   boot checks `data.machineId !== getMachineId()`. So a fingerprint read badly
   ONCE, at activation, locks the customer out forever - with a valid licence,
   on the correct machine.

   The window is specific to a brand-new install: machine.json does not exist
   yet, so resolveFactors() has nothing to corroborate a missing reading
   against and can only report `degraded`. These tests pin all three halves:

     1. degraded and clean readings of the SAME machine hash differently
     2. a fresh install with a missing fact really is `degraded` (no net)
     3. once machine.json exists, the same missing fact is `substituted` and
        the id is STABLE - which is why the guard belongs at activation only

   Run:  node tests/activation-guard.test.js
   -------------------------------------------------------------------------- */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const m = require('../services/machine-id');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hostyllo-actguard-'));
const SYS = { platform: 'win32', arch: 'x64', cpu: 'Test CPU @ 2.00GHz' };
const FULL = { guid: 'G-1111', drive: 'D-2222', bios: 'B-3333' };

console.log('\nmachine-id - the activation window');

ok('a degraded reading hashes differently from a clean one', () => {
  const degraded = m.computeMachineId({ system: SYS, factors: { ...FULL, bios: '' } });
  const clean    = m.computeMachineId({ system: SYS, factors: FULL });
  assert.strictEqual(degraded.reason, 'degraded');
  assert.strictEqual(clean.reason, 'clean');
  assert.notStrictEqual(degraded.id, clean.id,
    'a licence sealed on the degraded id would not open on the next clean boot');
});

ok('any one missing fact is enough to change the id', () => {
  const clean = m.computeMachineId({ system: SYS, factors: FULL });
  for (const k of m.HW) {
    const r = m.computeMachineId({ system: SYS, factors: { ...FULL, [k]: '' } });
    assert.strictEqual(r.reason, 'degraded', k + ' should read degraded');
    assert.notStrictEqual(r.id, clean.id, 'missing ' + k + ' must change the id');
  }
});

ok('a fresh install has no safety net - resolveFactors says degraded', () => {
  const r = m.resolveFactors({ ...FULL, bios: '' }, null);
  assert.strictEqual(r.reason, 'degraded');
  assert.strictEqual(r.confirmed, 0);
});

ok('once recorded, the same missing fact is substituted and the id holds', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'state-'));
  const first = m.computeMachineId({ system: SYS, factors: FULL, stateDir: dir });
  assert.strictEqual(first.reason, 'clean');
  assert.ok(m.readKnownFactors(dir), 'a clean read must record machine.json');

  const later = m.computeMachineId({ system: SYS, factors: { ...FULL, bios: '' }, stateDir: dir });
  assert.strictEqual(later.reason, 'substituted');
  assert.strictEqual(later.id, first.id,
    'a recorded machine must survive a later probe failure');
});

ok('a degraded reading is never recorded', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'state-'));
  m.computeMachineId({ system: SYS, factors: { ...FULL, bios: '' }, stateDir: dir });
  assert.strictEqual(m.readKnownFactors(dir), null,
    'recording a degraded reading would teach the install a wrong fact');
});

ok('a genuinely different machine is not rescued by substitution', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'state-'));
  m.computeMachineId({ system: SYS, factors: FULL, stateDir: dir });
  const other = m.computeMachineId({
    system: SYS, factors: { guid: 'OTHER', drive: 'D-2222', bios: '' }, stateDir: dir });
  assert.strictEqual(other.reason, 'changed',
    'copying license.enc + machine.json to another PC must not activate it');
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
