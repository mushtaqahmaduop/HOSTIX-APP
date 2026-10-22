// ════════════════════════════════════════════════════════════════════════════
// TOTP (RFC 6238) — second factor for the portal
//
// The portal can switch off paying customers' software, so a password alone is
// not enough (owner, 2026-09-24). SHA-1, 30-second steps, 6 digits: the
// parameters every authenticator app (Google Authenticator, Microsoft
// Authenticator, Authy, 1Password) accepts without configuration.
//
// Plain Node crypto rather than a library: the algorithm is twenty lines, and
// one fewer dependency in the service that holds the signing key is worth more
// than the convenience.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the previous and next step too: phone clocks drift. */
const WINDOW = 1;

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, base32 — what the authenticator app is given. */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuf, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** The code for `atMs` (default now). Exposed for tests. */
function codeAt(secret, atMs) {
  const counter = Math.floor((atMs == null ? Date.now() : atMs) / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/** Constant-time check of a 6-digit code within ±WINDOW steps. */
function verify(secret, code, atMs) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return false;
  const key = base32Decode(secret);
  const counter = Math.floor((atMs == null ? Date.now() : atMs) / 1000 / STEP_SECONDS);
  let ok = false;
  for (let w = -WINDOW; w <= WINDOW; w++) {
    const expected = Buffer.from(hotp(key, counter + w));
    if (crypto.timingSafeEqual(expected, Buffer.from(c))) ok = true;
  }
  return ok;
}

/** The otpauth:// URI an authenticator app imports. */
function uri(secret, account, issuer) {
  const iss = issuer || 'Hostyllo Control';
  return 'otpauth://totp/' + encodeURIComponent(iss + ':' + account)
    + '?secret=' + secret + '&issuer=' + encodeURIComponent(iss)
    + '&algorithm=SHA1&digits=' + DIGITS + '&period=' + STEP_SECONDS;
}

module.exports = { generateSecret, codeAt, verify, uri, base32Encode, base32Decode };
