/* ─── Control plane — unit tests (pure Node, no database) ────────────────────

   Everything here runs on a laptop with no Postgres, because the parts worth
   proving first are the ones that decide who keeps working: the key format, the
   licence lifecycle, feature resolution, and the signing round-trip.

   The round-trip is the reason this service lives in the app's repository. It
   signs with the real signing code and verifies with the real APP verifier
   (`services/entitlement.js`) in one process. When the control plane was going
   to live in the SaaS repo, that same guarantee needed a ported parser and two
   sets of committed fixtures kept in step by hand.

   Run:  npm test        (from server/)
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keys = require('../src/lib/keys');
const features = require('../src/lib/features');
const ent = require('../src/lib/entitlement');
const appVerifier = require('../../services/entitlement');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

const DAY = 86400000;
const MACHINE = 'a'.repeat(64);
const SECRET = 'control-plane-test-secret';

// A throwaway signing key, as the control plane would hold.
const pair = crypto.generateKeyPairSync('ed25519');
process.env.ENTITLEMENT_SIGNING_JWK = JSON.stringify({
  kid: 'test-kid', alg: 'EdDSA', use: 'sig', ...pair.privateKey.export({ format: 'jwk' })
});
ent._resetSigningKey();
const APP_KEYS = { 'test-kid': pair.publicKey.export({ type: 'spki', format: 'pem' }) };

function licence(over) {
  return Object.assign({
    status: 'active', verification: 'verified',
    expiresAt: new Date(Date.now() + 90 * DAY), features: {}
  }, over || {});
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\nkeys.js — shared with the app, not ported from it');
// ══════════════════════════════════════════════════════════════════════════

ok('the vendored copy is IDENTICAL to the app source', () => {
  // The copy exists so server/ deploys as one directory. It is an artifact, not
  // a fork — if renderer/src/utils.js changes and nobody runs sync-shared, the
  // control plane would validate keys by an older rule than the app that issued
  // them. That is the failure this catches. Vacuous in a deployed build, where
  // the original is not present and the committed copy is all there is.
  const sync = require('../scripts/sync-shared');
  if (!sync.sourceExists()) return;
  assert.ok(sync.isCurrent(),
    'server/src/lib/vendor/app-utils.js is STALE — run: npm run sync-shared');
});

ok('the vendored copy exposes the same functions the app does', () => {
  const shared = require('../../renderer/src/utils.js');
  for (const fn of ['parseLicenseKey', 'licenseKeyExpiry', 'validateKeyChecksum',
                    'buildLicenseKey', 'buildLegacyLicenseKey']) {
    assert.strictEqual(typeof keys[fn], 'function', fn + ' missing');
    assert.strictEqual(typeof shared[fn], 'function', fn + ' missing from the app');
  }
  // Same input, same output — the property that actually matters.
  const key = keys.buildLicenseKey(2027, 3, 15, 'parity-secret');
  assert.ok(shared.validateKeyChecksum(key, 'parity-secret'),
    'a key minted by the server does not validate in the app');
  assert.strictEqual(
    keys.licenseKeyExpiry(key).getTime(),
    shared.licenseKeyExpiry(key).getTime(),
    'the two disagree about when a licence expires');
});

ok('round-trips a v4 key it just minted', () => {
  const key = keys.buildLicenseKey(2027, 3, 15, SECRET);
  const p = keys.parseLicenseKey(key);
  assert.strictEqual(p.version, 4);
  assert.ok(keys.validateKeyChecksum(key, SECRET));
  assert.strictEqual(keys.licenseKeyExpiry(key).getFullYear(), 2027);
});

ok('a v4 licence caps at one device, a v3 licence does not', () => {
  // A v3 key was a pure function of its expiry month, so one string legitimately
  // belongs to many hostels. Capping it would lock out every customer but the
  // first to register.
  assert.strictEqual(keys.defaultMaxDevices(keys.parseLicenseKey(keys.buildLicenseKey(2027, 3, 15, SECRET))), 1);
  assert.strictEqual(keys.defaultMaxDevices(keys.parseLicenseKey(keys.buildLegacyLicenseKey(2027, 3, SECRET))), null);
});

ok('the fingerprint is stable and does not contain the key', () => {
  const key = keys.buildLicenseKey(2027, 3, 15, SECRET);
  const a = keys.keyFingerprint(keys.parseLicenseKey(key));
  const b = keys.keyFingerprint(keys.parseLicenseKey('  ' + key.toLowerCase() + ' '));
  assert.strictEqual(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes(key.split('-')[1]));
});

ok('rejects the fingerprint-failure placeholder specifically', () => {
  const fallback = keys.MACHINE_ID_FALLBACK_PREFIX + '0'.repeat(36);
  assert.strictEqual(fallback.length, 64, 'it is 64 chars, like a real id');
  assert.strictEqual(keys.isValidMachineId(fallback), false);
  assert.strictEqual(keys.isFingerprintFailure(fallback), true);
  assert.strictEqual(keys.isValidMachineId(MACHINE), true);
});

ok('device secrets are unique, hashed, and compared in constant time', () => {
  const a = keys.generateDeviceSecret();
  const b = keys.generateDeviceSecret();
  assert.notStrictEqual(a, b);
  assert.ok(a.length >= 43);
  assert.strictEqual(keys.hashDeviceSecret(a), keys.hashDeviceSecret(a));
  assert.ok(keys.secretMatches(keys.hashDeviceSecret(a), keys.hashDeviceSecret(a)));
  assert.ok(!keys.secretMatches(keys.hashDeviceSecret(a), keys.hashDeviceSecret(b)));
  assert.ok(!keys.secretMatches('short', keys.hashDeviceSecret(a)), 'unequal lengths must not throw');
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nfeatures.js — the catalogue');
// ══════════════════════════════════════════════════════════════════════════

ok('defaults are generous — existing customers lose nothing', () => {
  // The ~50 hostels in the field paid for the app as it is. A flag defaulting
  // to false would silently take something away the first time their app asks
  // the control plane a question.
  const d = features.defaults();
  assert.ok(Object.keys(d).length > 0);
  for (const [k, v] of Object.entries(d)) assert.strictEqual(v, true, k + ' defaults to false');
});

ok('resolve() always returns EVERY flag, never a partial map', () => {
  // A missing flag reads as undefined in the app, which is falsy — a partial
  // map would switch a feature off for everyone the moment one is added.
  const resolved = features.resolve({ reports: false });
  assert.deepStrictEqual(Object.keys(resolved).sort(), features.catalogueKeys());
  assert.strictEqual(resolved.reports, false);
  assert.strictEqual(resolved.archive, true);
});

ok('rejects an unknown flag rather than storing it', () => {
  // Storing it would mean the admin believes they changed something, the
  // customer sees no difference, and nothing anywhere says why.
  const r = features.validateOverrides({ notARealFlag: true });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /unknown feature flag/);
});

ok('rejects a non-boolean flag value', () => {
  assert.strictEqual(features.validateOverrides({ reports: 'yes' }).ok, false);
  assert.strictEqual(features.validateOverrides({ reports: 1 }).ok, false);
  assert.strictEqual(features.validateOverrides(null).ok, true);
});

ok('diffFromDefaults shows only what was changed', () => {
  assert.deepStrictEqual(features.diffFromDefaults({}), {});
  assert.deepStrictEqual(features.diffFromDefaults({ reports: false }), { reports: false });
  assert.deepStrictEqual(features.diffFromDefaults({ reports: true }), {});
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nentitlement.js — licence lifecycle');
// ══════════════════════════════════════════════════════════════════════════

const NOW = new Date();

ok('ACTIVE well before expiry, GRACE just past it, EXPIRED after grace', () => {
  assert.strictEqual(ent.resolveStatus(licence(), NOW), 'ACTIVE');
  assert.strictEqual(ent.resolveStatus(licence({ expiresAt: new Date(NOW - 3 * DAY) }), NOW), 'GRACE');
  assert.strictEqual(ent.resolveStatus(licence({ expiresAt: new Date(NOW - 90 * DAY) }), NOW), 'EXPIRED');
});

ok('an administrative decision outranks the calendar', () => {
  // A revoked licence that has not expired is still revoked. The other order
  // would let a customer whose dates are fine ignore a suspension.
  assert.strictEqual(ent.resolveStatus(licence({ status: 'revoked' }), NOW), 'REVOKED');
  assert.strictEqual(ent.resolveStatus(licence({ status: 'suspended' }), NOW), 'SUSPENDED');
  assert.strictEqual(ent.resolveStatus(licence({ verification: 'rejected' }), NOW), 'REVOKED');
});

ok('grace length is configurable without a code change', () => {
  const expiresAt = new Date(NOW - 20 * DAY);
  assert.strictEqual(ent.resolveStatus(licence({ expiresAt }), NOW), 'EXPIRED');
  process.env.GRACE_DAYS = '30';
  assert.strictEqual(ent.resolveStatus(licence({ expiresAt }), NOW), 'GRACE');
  delete process.env.GRACE_DAYS;
});

ok('an unverified licence is ACTIVE by default, and that is deliberate', () => {
  // Defaulting them to GRACE would show a renewal warning to ~50 paying
  // customers with valid licences, over a record-keeping gap that is not their
  // fault.
  assert.strictEqual(ent.resolveStatus(licence({ verification: 'unverified' }), NOW), 'ACTIVE');
  process.env.UNVERIFIED_STATUS = 'GRACE';
  assert.strictEqual(ent.resolveStatus(licence({ verification: 'unverified' }), NOW), 'GRACE');
  assert.strictEqual(
    ent.resolveStatus(licence({ verification: 'unverified', status: 'revoked' }), NOW), 'REVOKED',
    'must never override a harder state');
  delete process.env.UNVERIFIED_STATUS;
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nentitlement.js — signing, verified by the APP\'s own verifier');
// ══════════════════════════════════════════════════════════════════════════

function issueFor(over) {
  return ent.issue({ deviceId: 'dev-1', licenseId: 'lic-1', machineId: MACHINE, licence: licence(over) });
}

ok('every licence state round-trips: server signs, app verifies', () => {
  const cases = [
    ['ACTIVE', {}],
    ['GRACE', { expiresAt: new Date(NOW - 3 * DAY) }],
    ['EXPIRED', { expiresAt: new Date(NOW - 90 * DAY) }],
    ['SUSPENDED', { status: 'suspended' }],
    ['REVOKED', { status: 'revoked' }]
  ];
  for (const [expected, over] of cases) {
    const issued = issueFor(over);
    const r = appVerifier.verifyEntitlement(issued.jws, { keys: APP_KEYS, machineId: MACHINE });
    assert.ok(r.valid, expected + ' did not verify: ' + r.reason);
    assert.strictEqual(r.claims.status, expected);
  }
});

ok('feature flags survive the round trip', () => {
  const issued = issueFor({ features: { reports: false } });
  const r = appVerifier.verifyEntitlement(issued.jws, { keys: APP_KEYS, machineId: MACHINE });
  assert.strictEqual(r.claims.features.reports, false);
  assert.strictEqual(r.claims.features.archive, true, 'unset flags keep their default');
});

ok('the entitlement is bound to one machine', () => {
  // The signature proves the server issued it; only this claim proves who for.
  const issued = issueFor();
  const r = appVerifier.verifyEntitlement(issued.jws, { keys: APP_KEYS, machineId: 'b'.repeat(64) });
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, appVerifier.E.WRONG_MACHINE);
});

ok('a tampered payload is refused by the app', () => {
  const issued = issueFor({ status: 'revoked' });
  const parts = issued.jws.split('.');
  const forged = Object.assign(JSON.parse(Buffer.from(parts[1], 'base64url').toString()), { status: 'ACTIVE' });
  parts[1] = Buffer.from(JSON.stringify(forged)).toString('base64url');
  const r = appVerifier.verifyEntitlement(parts.join('.'), { keys: APP_KEYS, machineId: MACHINE });
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, appVerifier.E.BAD_SIGNATURE);
});

ok('a key the app does not know is refused', () => {
  const issued = issueFor();
  const r = appVerifier.verifyEntitlement(issued.jws, { keys: { 'other-kid': APP_KEYS['test-kid'] }, machineId: MACHINE });
  assert.strictEqual(r.reason, appVerifier.E.UNKNOWN_KID);
});

ok('issuedAt is server time and notAfter bounds the offline cache', () => {
  const issued = issueFor();
  const gap = Date.parse(issued.claims.notAfter) - Date.parse(issued.claims.issuedAt);
  assert.strictEqual(gap / DAY, ent.policy().cacheDays);
  assert.ok(gap > 0);
});

ok('returns null rather than an unsigned entitlement when no key is set', () => {
  const saved = process.env.ENTITLEMENT_SIGNING_JWK;
  delete process.env.ENTITLEMENT_SIGNING_JWK;
  ent._resetSigningKey();
  try {
    assert.strictEqual(issueFor(), null);
  } finally {
    process.env.ENTITLEMENT_SIGNING_JWK = saved;
    ent._resetSigningKey();
  }
});

ok('refuses a public key, an unlabelled key and junk', () => {
  const saved = process.env.ENTITLEMENT_SIGNING_JWK;
  const p = crypto.generateKeyPairSync('ed25519');
  const bad = [
    ['a public key has no d', JSON.stringify({ kid: 'k', ...p.publicKey.export({ format: 'jwk' }) })],
    ['no kid can never be rotated away from', JSON.stringify(p.privateKey.export({ format: 'jwk' }))],
    ['not JSON', 'nonsense']
  ];
  try {
    for (const [why, jwk] of bad) {
      process.env.ENTITLEMENT_SIGNING_JWK = jwk;
      ent._resetSigningKey();
      assert.throws(() => issueFor(), why);
    }
  } finally {
    process.env.ENTITLEMENT_SIGNING_JWK = saved;
    ent._resetSigningKey();
  }
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\npackaging — the server must never ship inside the app');
// ══════════════════════════════════════════════════════════════════════════

ok('server/ is absent from the electron-builder allowlist', () => {
  // This directory holds the code path that uses the PRIVATE signing key. The
  // whole point of moving off the old symmetric secret is that unpacking
  // app.asar yields nothing a forger can sign with — shipping this would undo
  // it. `files` is an allowlist, so absence is what keeps it out.
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  const allow = pkg.build.files;
  assert.ok(Array.isArray(allow));
  assert.ok(!allow.some((f) => String(f).startsWith('server')),
    'server/ appears in the electron-builder files allowlist');
});

ok('the app ships the PUBLIC key only', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'entitlement-keys.js'), 'utf8');
  assert.ok(src.includes('BEGIN PUBLIC KEY'));
  assert.ok(!src.includes('PRIVATE'), 'a private key reached the shipped key module');
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\ndatabase — a sleeping database must wake, a failed statement must not resend');
// ══════════════════════════════════════════════════════════════════════════

// Requiring db.js does NOT connect — the pool is lazy — so this runs with no
// Postgres, like everything else in this file.
const db = require('../src/db');

ok('a bare connect errno is treated as retryable', () => {
  for (const code of ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET']) {
    assert.strictEqual(db.isConnectError(Object.assign(new Error('x'), { code })), true, code);
  }
});

ok('an AggregateError is judged by its children', () => {
  // The real production shape: a host with both an IPv6 and an IPv4 address,
  // where one times out and the other refuses. The AggregateError's own code
  // is not always the useful one, so the children have to be read.
  const agg = new Error('');
  agg.errors = [
    Object.assign(new Error('connect ETIMEDOUT'),   { code: 'ETIMEDOUT' }),
    Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
  ];
  assert.strictEqual(db.isConnectError(agg), true);
});

ok('an error Postgres raised is NOT retryable', () => {
  // This is the safety property. `/devices/register` writes, and the retry sits
  // below the route with no way to tell a duplicate INSERT from a real one — so
  // anything that reached the server and came back must be rethrown at once.
  // Postgres errors carry SQLSTATEs here, not errnos.
  const dup = Object.assign(new Error('duplicate key value'), { code: '23505' });
  const syntax = Object.assign(new Error('syntax error'), { code: '42601' });
  const readOnly = Object.assign(new Error('cannot execute INSERT'), { code: '25006' });
  for (const e of [dup, syntax, readOnly]) {
    assert.strictEqual(db.isConnectError(e), false, e.code);
  }
  assert.strictEqual(db.isConnectError(new Error('plain')), false);
  assert.strictEqual(db.isConnectError(null), false);
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
