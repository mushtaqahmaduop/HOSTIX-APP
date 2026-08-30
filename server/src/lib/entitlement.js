// ════════════════════════════════════════════════════════════════════════════
// Entitlements — signing, and the one place licence policy is decided
//
// An entitlement is this server's signed statement about one device's licence.
// The app verifies it against a public key compiled into the build
// (`services/entitlement-keys.js`) and validates the claims STRICTLY: an
// unknown status, a missing field or an unparseable date is rejected outright.
// So `buildClaims` below is a WIRE CONTRACT, not an internal shape. Changing it
// breaks installs in the field.
//
// ── This file must never ship inside the app ────────────────────────────────
// It holds the code path that uses the PRIVATE key. `server/` is absent from
// the electron-builder `files` allowlist in the root package.json, which is an
// allowlist rather than a blocklist, so nothing here is packaged. The app only
// ever gets the public half — which is the entire point of moving off the old
// symmetric secret (audit C2): unpacking app.asar must yield nothing a forger
// can sign with.
//
// ── Signing is plain Node crypto, deliberately ──────────────────────────────
// A compact JWS is three base64url segments and an Ed25519 signature over
// `header.payload`. Node signs and verifies Ed25519 natively, so a JOSE library
// would add a dependency to produce bytes we can produce in ten lines — and the
// app's verifier is already hand-written against the same three segments. One
// fewer moving part between two implementations that have to agree.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const features = require('./features');

/** Matches STATUS in the app's services/entitlement.js. */
const STATUS = {
  ACTIVE: 'ACTIVE',
  GRACE: 'GRACE',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED'
};

const DAY_MS = 86400000;

// ── Policy ──────────────────────────────────────────────────────────────────

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Every tunable in one place, so a policy question has one answer and one file
 * to read — not a constant rediscovered in four route handlers.
 */
function policy() {
  return {
    /** Days past expiry the app still runs fully, with a renewal warning. */
    graceDays: intFromEnv('GRACE_DAYS', 14),
    /** Past grace the app goes read-only. Never destructive. */
    readOnlyOnExpiry: process.env.READONLY_ON_EXPIRY !== 'false',
    /** How long the app may keep answering from a cached entitlement offline. */
    cacheDays: intFromEnv('ENTITLEMENT_CACHE_DAYS', 14)
  };
}

/**
 * What an `unverified` licence is granted.
 *
 * Defaults to ACTIVE, and that is a deliberate call. Admitting an unrecognised
 * key is what keeps the ~50 hostels whose keys this database has no record of
 * working. Issuing them all GRACE would technically be "admitted", but GRACE
 * means "full operation plus a renewal warning" — so every one of those paying
 * customers would see a renewal warning for a perfectly valid licence, on day
 * one, because of a record-keeping gap that is not their fault.
 *
 * Set UNVERIFIED_STATUS=GRACE once the unverified queue is actually being
 * worked and the warning would mean something.
 */
function unverifiedStatus() {
  return process.env.UNVERIFIED_STATUS === 'GRACE' ? STATUS.GRACE : STATUS.ACTIVE;
}

/**
 * The licence lifecycle, in one function.
 *
 * Order matters: an administrative decision outranks the calendar. A revoked
 * licence that has not yet expired is still revoked — the other order would let
 * a customer whose dates are fine ignore a suspension.
 *
 * @param {{status:string, verification:string, expiresAt:Date}} licence
 * @param {Date} now
 */
function resolveStatus(licence, now) {
  if (licence.status === 'revoked' || licence.verification === 'rejected') return STATUS.REVOKED;
  if (licence.status === 'suspended') return STATUS.SUSPENDED;

  const expiry = licence.expiresAt.getTime();
  const graceEnds = expiry + policy().graceDays * DAY_MS;
  const t = now.getTime();

  if (t > graceEnds) return STATUS.EXPIRED;
  if (t > expiry) return STATUS.GRACE;

  return licence.verification === 'unverified' ? unverifiedStatus() : STATUS.ACTIVE;
}

// ── Claims ──────────────────────────────────────────────────────────────────

/**
 * @param {object} input
 * @param {string} input.deviceId
 * @param {string} input.licenseId
 * @param {string} input.machineId
 * @param {{status:string, verification:string, expiresAt:Date, features:object}} input.licence
 * @param {Date} [input.now]
 */
function buildClaims(input) {
  const now = input.now || new Date();
  const p = policy();

  return {
    ver: 1,
    deviceId: input.deviceId,
    licenseId: input.licenseId,

    // The signature proves this SERVER issued the entitlement. It does not
    // prove it was issued to THIS computer. Without the binding, a valid
    // entitlement copied from one hostel's machine to another's would verify
    // perfectly — which is exactly the sharing a licence exists to prevent.
    machineId: input.machineId,

    status: resolveStatus(input.licence, now),
    expiresAt: input.licence.expiresAt.toISOString(),

    // Server time. This is the claim that lets the app detect a clock wound
    // backwards, because it cannot be forged the way a local timestamp can.
    issuedAt: now.toISOString(),

    // How long the app may run on this cached copy while offline.
    notAfter: new Date(now.getTime() + p.cacheDays * DAY_MS).toISOString(),

    policy: { graceDays: p.graceDays, readOnlyOnExpiry: p.readOnlyOnExpiry },

    // Always the COMPLETE resolved set, never only the overrides. A missing
    // flag reads as `undefined` in the app, which is falsy — so sending a
    // partial map would switch a feature off for everyone the moment a new
    // flag is added to the catalogue.
    features: features.resolve(input.licence.features),

    verification: input.licence.verification
  };
}

// ── Signing ─────────────────────────────────────────────────────────────────

let _key = null;
let _kid = null;

function b64u(buf) {
  return Buffer.from(buf).toString('base64url');
}

/**
 * The Ed25519 private key, from ENTITLEMENT_SIGNING_JWK.
 *
 * Deliberately lazy and deliberately optional: a server that has not been given
 * a signing key must start and serve everything else, and say plainly that
 * licence signing is off. Failing to boot would take the portal down with it.
 */
function signingKey() {
  if (_key && _kid) return { key: _key, kid: _kid };

  const raw = process.env.ENTITLEMENT_SIGNING_JWK;
  if (!raw) return null;

  let jwk;
  try {
    jwk = JSON.parse(raw);
  } catch (e) {
    throw new Error('ENTITLEMENT_SIGNING_JWK is not valid JSON');
  }
  if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d) {
    throw new Error('ENTITLEMENT_SIGNING_JWK must be an Ed25519 PRIVATE key (kty OKP, crv Ed25519, with d)');
  }
  if (!jwk.kid) {
    // The app looks keys up by kid and holds a map, so a rotation does not
    // strand builds signed under the old one. An unlabelled key cannot be
    // rotated away from.
    throw new Error('ENTITLEMENT_SIGNING_JWK must carry a kid');
  }

  _key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  _kid = jwk.kid;
  return { key: _key, kid: _kid };
}

/** Test seam — forces the next call to re-read the environment. */
function _resetSigningKey() {
  _key = null;
  _kid = null;
}

/**
 * Mint a signed entitlement, or null when no signing key is configured.
 *
 * `typ: 'JWT'` because the app rejects any other value when the header carries
 * one.
 */
function issue(input) {
  const signer = signingKey();
  if (!signer) return null;

  const claims = buildClaims(input);
  const header = { alg: 'EdDSA', typ: 'JWT', kid: signer.kid };

  const signingInput = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(claims));
  const signature = crypto.sign(null, Buffer.from(signingInput, 'ascii'), signer.key);

  return { jws: signingInput + '.' + b64u(signature), claims };
}

// ── Device tokens ───────────────────────────────────────────────────────────

/**
 * Device tokens are OPAQUE random bytes held server-side, not JWTs.
 *
 * A self-describing token would have to be verified by something, and every
 * verifier is a place where "is this a device or a person?" can be got wrong.
 * An opaque token is a lookup: it is a device token because it is in the device
 * token store, and it cannot be mistaken for an admin session because it is not
 * in the admin session store. Revocation is a delete.
 */
const DEVICE_TOKEN_TTL_SECONDS = 15 * 60;

function generateDeviceToken() {
  return crypto.randomBytes(32).toString('base64url');
}

module.exports = {
  STATUS, policy, resolveStatus, buildClaims, issue,
  signingKey, _resetSigningKey,
  generateDeviceToken, DEVICE_TOKEN_TTL_SECONDS
};
