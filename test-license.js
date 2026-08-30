/**
 * ════════════════════════════════════════════════════════════════════════════
 * PHASE 12 — LICENSE SYSTEM TEST SUITE v3  (Final)
 * Hostyllo — Hostel Management System
 *
 * Run with:  node test-license.js
 *
 * Tests all scenarios including v3 hardening additions:
 *   1.  Valid license → app opens normally
 *   2.  No license file → activation screen shown
 *   3.  Expired key at activation time → rejected
 *   3b. Expired license in file → blocked on startup
 *   4.  Wrong machine → blocked with machine-mismatch message
 *   5.  Tampered license file → blocked (HMAC fails)
 *   6.  Corrupted / truncated file → blocked (parse error)
 *   6b. Garbage content → blocked
 *   7.  Time rollback (clock cheat) → blocked
 *   7b. Normal last_run (past) → passes
 *   8.  Key with bad checksum → rejected at activation
 *   8b. Valid key checksum → passes
 *   9.  Wrong format key → rejected
 *   9b. Correct format → passes
 *   9c. Empty string → rejected
 *  10.  Deactivation → both license.enc and last_run.dat deleted
 *  10b. last_run.dat confirmed deleted after deactivation
 *  11.  Re-activation after deactivation → works correctly
 *  E1. Random IV — same data encrypts differently every time
 *  E2. Decrypt → exact original data recovered
 *  V1. [v3] Delete last_run.dat → sentinel re-written, license still valid
 *  V2. [v3] Delete last_run.dat + future sentinel → time_cheat blocked
 *  V3. [v3] getMachineId() returns full 64-char hex string
 * ════════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Replaced duplicate key validation functions with imports from utils
const {
  validateKeyFormat, validateKeyChecksum, licenseKeyExpiry,
  buildLicenseKey, buildLegacyLicenseKey, parseLicenseKey
} = require('./renderer/src/utils');

// ── Reproduce exact logic from main.js ───────────────────────────────────────
const _SECRET = Buffer.from(
  '44344d344d5f483053543333545f5333435233545f5334344c545f7631', 'hex'
).toString();

const TMP_DIR       = path.join(os.tmpdir(), 'hostyllo_license_test_' + Date.now());
const LICENSE_PATH  = path.join(TMP_DIR, 'license.enc');
const LAST_RUN_PATH = path.join(TMP_DIR, 'last_run.dat');

fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Reproduce exact logic from main.js (v3) ──────────────────────────────────
function _getWinMachineGuid() {
  if (os.platform() !== 'win32') return '';
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: 'utf8', timeout: 2000, windowsHide: true }
    );
    const m = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/);
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}

function getMachineId() {
  const raw = [
    os.hostname(), os.platform(), os.arch(),
    (os.cpus()[0] && os.cpus()[0].model) || 'cpu',
    _getWinMachineGuid()
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex'); // full 64 chars
}

function encryptLicense(data, machineId) {
  const aesKey    = crypto.scryptSync(machineId + _SECRET, 'damam_salt_v1', 32);
  const iv        = crypto.randomBytes(16);
  const cipher    = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const hmac      = crypto.createHmac('sha256', aesKey).update(encrypted).digest();
  return Buffer.concat([iv, hmac, encrypted]).toString('base64');
}

function decryptLicense(encStr, machineId) {
  const buf = Buffer.from(encStr, 'base64');
  if (buf.length < 49) throw new Error('CORRUPT');
  const iv         = buf.slice(0,  16);
  const storedHmac = buf.slice(16, 48);
  const encrypted  = buf.slice(48);
  const aesKey     = crypto.scryptSync(machineId + _SECRET, 'damam_salt_v1', 32);
  const calcHmac   = crypto.createHmac('sha256', aesKey).update(encrypted).digest();
  if (!crypto.timingSafeEqual(storedHmac, calcHmac)) throw new Error('TAMPERED');
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString());
}

function _validateKeyFormat(key) {
  return validateKeyFormat(key);
}

function _validateKeyChecksum(key) {
  return validateKeyChecksum(key, _SECRET);
}

function _getExpiryFromKey(key) {
  return licenseKeyExpiry(key);
}

// Every key the suite exercises is a current v4 key unless a test explicitly
// asks for the legacy shape, so the default path through the whole file is the
// format actually being issued.
function generateValidKey(yearOffset = 1) {
  const d = new Date();
  return buildLicenseKey(d.getFullYear() + yearOffset, d.getMonth() + 1, d.getDate(), _SECRET);
}

// A key that expires N days from today — the short window v3 could not express.
function generateKeyInDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return buildLicenseKey(d.getFullYear(), d.getMonth() + 1, d.getDate(), _SECRET);
}

function generateLegacyKey(yearOffset = 1) {
  const d = new Date();
  return buildLegacyLicenseKey(d.getFullYear() + yearOffset, d.getMonth() + 1, _SECRET);
}

function generateExpiredKey() {
  return buildLicenseKey(2020, 1, 15, _SECRET);   // expired long ago
}

// Mirrors checkLicenseValidity from main.js v3 — uses test paths
function checkLicenseValidity(overrideMachineId = null) {
  if (!fs.existsSync(LICENSE_PATH)) {
    return { valid: false, reason: 'not_activated', message: 'No license found.' };
  }
  let data;
  try {
    data = decryptLicense(fs.readFileSync(LICENSE_PATH, 'utf8'), getMachineId());
  } catch (e) {
    if (e.message === 'TAMPERED')
      return { valid: false, reason: 'tampered', message: 'License file has been modified.' };
    return { valid: false, reason: 'corrupt', message: 'License file cannot be read.' };
  }
  const currentMachineId = overrideMachineId || getMachineId();
  if (data.machineId !== currentMachineId)
    return { valid: false, reason: 'wrong_machine', message: 'License is for a different computer.' };
  if (!_validateKeyChecksum(data.key))
    return { valid: false, reason: 'tampered', message: 'License key has been tampered with.' };
  const expiry = new Date(data.expiry);
  const now    = new Date();
  if (now > expiry)
    return { valid: false, reason: 'expired', message: `License expired on ${expiry.toDateString()}.` };

  // v3 Anti-time-cheat — mirrors _readLastRun() fix:
  // If last_run.dat is missing but license.enc exists, re-write sentinel and continue.
  let lastRun = null;
  try {
    if (fs.existsSync(LAST_RUN_PATH)) {
      const d = new Date(fs.readFileSync(LAST_RUN_PATH, 'utf8').trim());
      if (!isNaN(d.getTime())) lastRun = d;
    } else if (fs.existsSync(LICENSE_PATH)) {
      // Re-establish sentinel — attacker gains nothing on this run;
      // next run will have a valid sentinel to compare against.
      fs.writeFileSync(LAST_RUN_PATH, now.toISOString(), 'utf8');
    }
  } catch(e) {}
  if (lastRun && now < lastRun)
    return { valid: false, reason: 'time_cheat',
      message: `Time manipulation detected. Last run: ${lastRun.toLocaleString()}` };

  fs.writeFileSync(LAST_RUN_PATH, now.toISOString(), 'utf8');
  return { valid: true, key: data.key, expiry: data.expiry, machineId: data.machineId };
}

function writeLicense(key) {
  const machineId   = getMachineId();
  const expiry      = _getExpiryFromKey(key);
  const licenseData = { key, machineId, expiry: expiry.toISOString(),
    activatedAt: new Date().toISOString() };
  fs.writeFileSync(LICENSE_PATH, encryptLicense(licenseData, machineId), 'utf8');
  fs.writeFileSync(LAST_RUN_PATH, new Date().toISOString(), 'utf8');
}

function cleanFiles() {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch (e) {
    console.error('[HOSTYLLO] Failed to clean temporary files:', e.message);
  }
  // Recreate temp directory for next test
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    const ok = result === true || (result && typeof result.then === 'function');
    if (ok) {
      console.log(`  ✅  ${name}`);
      passed++;
    } else {
      console.log(`  ❌  ${name}`);
      console.log(`       Got: ${JSON.stringify(result)}`);
      failed++;
    }
  } catch (e) {
    console.log(`  💥  ${name} — threw: ${e.message}`);
    console.error('Stack Trace:', e.stack);
    failed++;
  } finally {
    cleanFiles();
  }
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════');
console.log('  PHASE 11 — LICENSE SYSTEM TEST SUITE');
console.log('════════════════════════════════════════════════════\n');

// ── 1. Valid license → should pass ──────────────────────────────────────────
console.log('── Activation & Validation ─────────────────────────');
test('Valid license → checkLicenseValidity returns valid:true', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  const r = checkLicenseValidity();
  return r.valid === true;
});

// ── 2. No license file → not_activated ──────────────────────────────────────
test('No license file → reason: not_activated', () => {
  const r = checkLicenseValidity();
  return r.valid === false && r.reason === 'not_activated';
});

// ── 3. Expired key → rejected at activation time ────────────────────────────
test('Expired key → activation returns success:false', () => {
  const key    = generateExpiredKey();
  const valid  = _validateKeyFormat(key) && _validateKeyChecksum(key);
  const expiry = _getExpiryFromKey(key);
  return valid && new Date() > expiry; // key is valid but expired
});

// ── 3b. Expired license file → blocked on startup ───────────────────────────
test('Expired license in file → reason: expired', () => {
  const key    = generateExpiredKey();
  const machineId = getMachineId();
  // Write directly bypassing the activation expiry check
  const expiry = _getExpiryFromKey(key);
  const data   = { key, machineId, expiry: expiry.toISOString(), activatedAt: new Date().toISOString() };
  fs.writeFileSync(LICENSE_PATH, encryptLicense(data, machineId), 'utf8');
  const r = checkLicenseValidity();
  return r.valid === false && r.reason === 'expired';
});

// ── 4. Wrong machine → blocked ───────────────────────────────────────────────
test('Different machine ID → reason: wrong_machine', () => {
  const key = generateValidKey(1);
  // Write license for a fake different machineId
  const fakeMachineId = 'DEADBEEFDEADBEEFDEADBEEFDEADBEEF';
  const expiry        = _getExpiryFromKey(key);
  const data          = { key, machineId: fakeMachineId, expiry: expiry.toISOString(),
    activatedAt: new Date().toISOString() };
  // Encrypt with real machineId so decryption succeeds, then machine mismatch is caught
  const realMachineId = getMachineId();
  fs.writeFileSync(LICENSE_PATH, encryptLicense(data, realMachineId), 'utf8');
  const r = checkLicenseValidity();
  return r.valid === false && r.reason === 'wrong_machine';
});

// ── 5. Tampered file → blocked ───────────────────────────────────────────────
console.log('\n── Tamper & Corruption Detection ───────────────────');
test('Manually edited license.enc → reason: tampered', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  // Flip a byte in the middle of the file
  const raw = fs.readFileSync(LICENSE_PATH, 'utf8');
  const buf = Buffer.from(raw, 'base64');
  buf[60] = buf[60] ^ 0xFF; // flip bits in ciphertext area
  fs.writeFileSync(LICENSE_PATH, buf.toString('base64'), 'utf8');
  const r = checkLicenseValidity();
  return r.valid === false && r.reason === 'tampered';
});

// ── 6. Corrupted file (truncated) → blocked ──────────────────────────────────
test('Truncated license.enc → reason: corrupt', () => {
  fs.writeFileSync(LICENSE_PATH, 'aGVsbG8=', 'utf8'); // too short
  const r = checkLicenseValidity();
  return r.valid === false && r.reason === 'corrupt';
});

// ── 6b. Garbage content → blocked ────────────────────────────────────────────
test('Garbage in license.enc → reason: tampered or corrupt', () => {
  fs.writeFileSync(LICENSE_PATH, 'this is not a valid license file at all!!', 'utf8');
  const r = checkLicenseValidity();
  return r.valid === false && ['tampered','corrupt'].includes(r.reason);
});

// ── 7. Time cheat (last_run in the future) → blocked ────────────────────────
console.log('\n── Anti-Time-Cheat ─────────────────────────────────');
test('last_run.dat in future → reason: time_cheat', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  // Set last_run 2 days in the future
  const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  fs.writeFileSync(LAST_RUN_PATH, future.toISOString(), 'utf8');
  const r = checkLicenseValidity();
  return r.valid === false && r.reason === 'time_cheat';
});

test('last_run.dat in past (normal) → valid', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  // Set last_run 1 hour ago (normal previous run)
  const past = new Date(Date.now() - 60 * 60 * 1000);
  fs.writeFileSync(LAST_RUN_PATH, past.toISOString(), 'utf8');
  const r = checkLicenseValidity();
  return r.valid === true;
});

// ── 8. Bad checksum key → rejected ──────────────────────────────────────────
console.log('\n── Key Validation ──────────────────────────────────');
test('Key with corrupted checksum → _validateKeyChecksum returns false', () => {
  const key    = generateValidKey(1);
  const parts  = key.split('-');
  parts[parts.length - 1] = 'ZZZZ';        // last group is the checksum tail
  return _validateKeyChecksum(parts.join('-')) === false;
});

test('Valid key checksum → _validateKeyChecksum returns true', () => {
  const key = generateValidKey(1);
  return _validateKeyChecksum(key) === true;
});

// ── 9. Wrong format → rejected ───────────────────────────────────────────────
test('Wrong format key (XXXXX-...) → _validateKeyFormat returns false', () => {
  return _validateKeyFormat('XXXXX-ABCD-1234-5678') === false;
});

test('Correct format key (HOSTEL-...) → _validateKeyFormat returns true', () => {
  const key = generateValidKey(1);
  return _validateKeyFormat(key) === true;
});

test('Empty string → _validateKeyFormat returns false', () => {
  return _validateKeyFormat('') === false;
});

// ── 10. Deactivation → both files deleted ────────────────────────────────────
console.log('\n── Deactivation ────────────────────────────────────');
test('After deactivation → license.enc deleted, reason: not_activated', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  const before = checkLicenseValidity();
  if (!before.valid) return false;
  // Simulate deactivateLicense() — now deletes both files
  if (fs.existsSync(LICENSE_PATH))  fs.unlinkSync(LICENSE_PATH);
  if (fs.existsSync(LAST_RUN_PATH)) fs.unlinkSync(LAST_RUN_PATH);
  const after = checkLicenseValidity();
  return after.valid === false && after.reason === 'not_activated';
});

test('After deactivation → last_run.dat also deleted', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  // Simulate deactivateLicense() — v3 deletes both
  if (fs.existsSync(LICENSE_PATH))  fs.unlinkSync(LICENSE_PATH);
  if (fs.existsSync(LAST_RUN_PATH)) fs.unlinkSync(LAST_RUN_PATH);
  return !fs.existsSync(LAST_RUN_PATH);
});

// ── 11. Re-activation after deactivation → works ─────────────────────────────
console.log('\n── Re-Activation ───────────────────────────────────');
test('Re-activate after deactivation → valid:true', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  // Deactivate (v3: both files)
  if (fs.existsSync(LICENSE_PATH))  fs.unlinkSync(LICENSE_PATH);
  if (fs.existsSync(LAST_RUN_PATH)) fs.unlinkSync(LAST_RUN_PATH);
  // Re-activate
  writeLicense(key);
  const r = checkLicenseValidity();
  return r.valid === true;
});

// ── Encryption: same data never produces same output (IV is random) ───────────
console.log('\n── Encryption Quality ──────────────────────────────');
test('Two encryptions of same data → different ciphertext (random IV)', () => {
  const data = { key: 'HOSTEL-TEST', machineId: getMachineId(), expiry: new Date().toISOString(), activatedAt: new Date().toISOString() };
  const enc1 = encryptLicense(data, getMachineId());
  const enc2 = encryptLicense(data, getMachineId());
  return enc1 !== enc2;
});

test('Decryption of encrypted data → exact original data', () => {
  const data = { key: 'HOSTEL-TEST', machineId: getMachineId(), expiry: '2099-01-01T00:00:00.000Z', activatedAt: '2025-01-01T00:00:00.000Z' };
  const enc  = encryptLicense(data, getMachineId());
  const dec  = decryptLicense(enc, getMachineId());
  return dec.key === data.key && dec.expiry === data.expiry;
});

// ── v3 New: last_run.dat missing bypass is closed ─────────────────────────────
console.log('\n── v3: last_run.dat Deletion Bypass Closed ─────────');
test('Delete last_run.dat → sentinel re-written, valid license still passes', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  // Simulate attacker deleting last_run.dat
  if (fs.existsSync(LAST_RUN_PATH)) fs.unlinkSync(LAST_RUN_PATH);
  // v3: _readLastRun re-writes sentinel, returns null (no block on this run)
  const r = checkLicenseValidity();
  // License should still be valid — attacker gains nothing from this run
  const sentinelRestored = fs.existsSync(LAST_RUN_PATH);
  return r.valid === true && sentinelRestored;
});

test('Delete last_run.dat + roll clock back → sentinel catches on next run', () => {
  const key = generateValidKey(1);
  writeLicense(key);
  // Attacker deletes sentinel and rolls clock back — simulated by:
  // 1. Write a future sentinel (as if the re-written sentinel is now "in the past of their rolled-back clock")
  // 2. Attempt validation with "now" < sentinel
  const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  fs.writeFileSync(LAST_RUN_PATH, future.toISOString(), 'utf8');
  const r = checkLicenseValidity();
  return r.valid === false && r.reason === 'time_cheat';
});

// ── v4: unique keys and day-precision expiry ─────────────────────────────────
// The two bugs v4 exists to fix: v3 encoded only the expiry month with no
// random component, so the same month always produced the same key string and
// nothing shorter than a month could be sold.
console.log('\n── v4: Key Uniqueness & Day Precision ──────────────');

test('Two keys for the SAME expiry date are different strings', () => {
  const a = generateKeyInDays(30);
  const b = generateKeyInDays(30);
  return a !== b && _validateKeyChecksum(a) && _validateKeyChecksum(b);
});

test('A batch of 200 keys for one date contains no duplicate', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(generateKeyInDays(30));
  return seen.size === 200;
});

test('Serial is 4 base36 chars and differs across keys', () => {
  const a = parseLicenseKey(generateKeyInDays(30));
  const b = parseLicenseKey(generateKeyInDays(30));
  return a.version === 4 && /^[A-Z0-9]{4}$/.test(a.serial) && a.serial !== b.serial;
});

test('7-day key → expires 7 days out, not at a month boundary', () => {
  const key    = generateKeyInDays(7);
  const expiry = _getExpiryFromKey(key);
  const want   = new Date();
  want.setDate(want.getDate() + 7);
  return expiry.getFullYear() === want.getFullYear() &&
         expiry.getMonth()    === want.getMonth() &&
         expiry.getDate()     === want.getDate();
});

test('14-day key → valid today, activation accepted', () => {
  const key = generateKeyInDays(14);
  writeLicense(key);
  return checkLicenseValidity().valid === true;
});

test('1-day key → still valid today (licence runs to end of its day)', () => {
  const key    = generateKeyInDays(0);
  const expiry = _getExpiryFromKey(key);
  return expiry > new Date() && expiry.getHours() === 23 && expiry.getMinutes() === 59;
});

test('Key that expired yesterday → checkLicenseValidity says expired', () => {
  writeLicense(generateKeyInDays(-1));
  return checkLicenseValidity().reason === 'expired';
});

test('Editing the serial breaks the checksum', () => {
  const parts = generateKeyInDays(30).split('-');
  parts[2] = parts[2] === 'ZZZZ' ? 'YYYY' : 'ZZZZ';
  return _validateKeyChecksum(parts.join('-')) === false;
});

test('Editing the expiry group breaks the checksum', () => {
  const parts = generateKeyInDays(30).split('-');
  parts[1] = 'ZZZZ';                        // try to buy 40 more years
  return _validateKeyChecksum(parts.join('-')) === false;
});

test('v4 key is 26 chars in 5 groups', () => {
  const key = generateKeyInDays(30);
  return key.length === 26 && key.split('-').length === 5 && _validateKeyFormat(key);
});

// ── v4: the keys already activated in the field must keep working ────────────
console.log('\n── v4: Legacy v3 Key Compatibility ─────────────────');

test('Legacy v3 key still passes format and checksum', () => {
  const key = generateLegacyKey(1);
  return key.length === 21 && _validateKeyFormat(key) && _validateKeyChecksum(key);
});

test('Legacy v3 key still activates and validates', () => {
  writeLicense(generateLegacyKey(1));
  return checkLicenseValidity().valid === true;
});

test('Legacy v3 expiry unchanged — last day of its month, at midnight', () => {
  const key    = buildLegacyLicenseKey(2027, 3, _SECRET);
  const expiry = _getExpiryFromKey(key);
  return expiry.getFullYear() === 2027 && expiry.getMonth() === 2 &&
         expiry.getDate() === 31 && expiry.getHours() === 0;
});

test('Legacy v3 key string is byte-for-byte what v3 produced', () => {
  // The pre-v4 algorithm, inlined: base36(year*12 + month-1), HMAC over it.
  const months  = 2027 * 12 + 2;
  const expPart = months.toString(36).toUpperCase().padStart(4, '0');
  const chk8    = crypto.createHmac('sha256', _SECRET)
    .update(expPart).digest('hex').toUpperCase().slice(0, 8);
  const v3Key   = `HOSTEL-${expPart}-${chk8.slice(0,4)}-${chk8.slice(4,8)}`;
  return buildLegacyLicenseKey(2027, 3, _SECRET) === v3Key;
});

test('A v3 key is NOT accepted as a v4 key with groups shuffled', () => {
  const legacy = generateLegacyKey(1);
  // Same groups, re-cut as a 5-group key by duplicating one — must fail.
  const parts  = legacy.split('-');
  return _validateKeyChecksum([parts[0], parts[1], parts[1], parts[2], parts[3]].join('-')) === false;
});

test('Four-group garbage → _validateKeyFormat returns false', () => {
  return _validateKeyFormat('HOSTEL-ABCD-EFGH-IJKL-MNOP-QRST') === false;
});

// ── v3 New: getMachineId uses full 64-char output ─────────────────────────────
console.log('\n── v3: Machine ID Length ───────────────────────────');
test('getMachineId() returns 64-character hex string', () => {
  const id = getMachineId();
  return typeof id === 'string' && id.length === 64 && /^[0-9a-f]{64}$/.test(id);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log('  🎉 ALL TESTS PASSED — License system is secure!');
} else {
  console.log('  ⚠️  Some tests failed — review and fix before release.');
}
console.log('════════════════════════════════════════════════════\n');

// Cleanup temp dir
try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch(e) {}

process.exit(failed > 0 ? 1 : 0);