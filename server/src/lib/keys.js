// ════════════════════════════════════════════════════════════════════════════
// Licence keys — one implementation, shared with the app
//
// This module contains almost no logic of its own. The key format lives in
// `renderer/src/utils.js`, the same file `main.js`, `keygen.js` and
// `test-license.js` use, and that single source is the whole reason the control
// plane lives in this repository. When the server was going to sit in the SaaS
// repo the format had to be written twice — once in JavaScript for the app,
// once in TypeScript for the server — and held in step by committed fixtures,
// because drift means a customer whose key works in their app and is rejected
// on registration, or worse the reverse.
//
// It is reached through a VENDORED copy rather than a relative require, because
// a deployment platform builds a service from one directory and the app's
// source tree is not inside it. The copy is generated and committed by
// `scripts/sync-shared.js`; `test/run.js` fails if it has drifted, so it is an
// artifact rather than a fork.
//
// Do not hand-edit the vendored file, and do not reimplement these functions
// here. Change `renderer/src/utils.js` and run `npm run sync-shared`.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');

// A VENDORED copy of renderer/src/utils.js, refreshed by scripts/sync-shared.js
// and committed so that server/ is a self-contained deployable unit — a build
// platform gives a service one directory, and the app's source tree is not in
// it. The copy is a generated artifact, not a second implementation: test/run.js
// fails if it has drifted, so it cannot quietly become a fork.
const shared = require('./vendor/app-utils.js');

const {
  parseLicenseKey,
  validateKeyChecksum,
  licenseKeyExpiry,
  buildLicenseKey,
  buildLegacyLicenseKey
} = shared;

/**
 * The stored identity of a key. The key itself is a credential — anyone holding
 * it can register a device — so it is never persisted; this is.
 */
function keyFingerprint(parsed) {
  return crypto.createHash('sha256').update(parsed.key).digest('hex');
}

/**
 * How many devices a licence of this format may carry by default.
 *
 * v3 → unlimited (`null`), and this is not laziness. A v3 key was a pure
 * function of its expiry month, so one key string legitimately belongs to many
 * hostels. Capping it at one device would let whichever hostel registered first
 * claim the key and lock out every other paying customer holding the same
 * string.
 *
 * v4 → 1, because each issuance is unique. Raise it per licence in the portal
 * for a customer with two offices.
 */
function defaultMaxDevices(parsed) {
  return parsed.version === 4 ? 1 : null;
}

/** The app's hardware fingerprint: SHA-256 hex, lower case. */
const RE_MACHINE_ID = /^[0-9a-f]{64}$/;

/**
 * The app falls back to a fixed placeholder when hardware fingerprinting
 * throws. It is 64 characters like a real id but is not hex, so the pattern
 * rejects it anyway — this constant exists so the endpoint can say WHY rather
 * than "invalid machineId".
 *
 * Admitting it would be worse than refusing: every machine in that state sends
 * the SAME string, so they would collide onto one device row and rotate each
 * other's secrets indefinitely.
 */
const MACHINE_ID_FALLBACK_PREFIX = 'UNKNOWN_MACHINE_ID_FALLBACK_';

function isValidMachineId(v) {
  return typeof v === 'string' && RE_MACHINE_ID.test(v);
}

function isFingerprintFailure(v) {
  return typeof v === 'string' && v.startsWith(MACHINE_ID_FALLBACK_PREFIX);
}

/** A fresh device secret. Returned to the app once; only its hash is stored. */
function generateDeviceSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash a device secret for storage. Plain SHA-256 rather than bcrypt is correct
 * here and only here: the input is 32 bytes from a CSPRNG, so there is no
 * dictionary to slow down and no human choice to protect.
 */
function hashDeviceSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/** Constant-time compare of two hex digests of equal length. */
function secretMatches(presentedHash, storedHash) {
  const a = Buffer.from(String(presentedHash), 'utf8');
  const b = Buffer.from(String(storedHash || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  parseLicenseKey, validateKeyChecksum, licenseKeyExpiry,
  buildLicenseKey, buildLegacyLicenseKey,
  keyFingerprint, defaultMaxDevices,
  isValidMachineId, isFingerprintFailure, MACHINE_ID_FALLBACK_PREFIX,
  generateDeviceSecret, hashDeviceSecret, secretMatches
};
