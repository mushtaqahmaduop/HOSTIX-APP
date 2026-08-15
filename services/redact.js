// ════════════════════════════════════════════════════════════════════════════
// Redaction  —  Phase 1  (spec §25 privacy-safe diagnostics, §40 logging)
//
// This database holds student CNICs, phone numbers, guardian details and
// payment records. Nothing here is allowed to leave the machine, or land in a
// log file, without passing through this module first.
//
// Two independent passes, because either alone leaks:
//   1. KEY pass    — a field named `password`/`cnic`/`token` is redacted
//                    whatever it contains.
//   2. VALUE pass  — a CNIC pasted into a free-text `notes` field is redacted
//                    even though the key looks innocent.
//
// Fail closed: unknown object shapes are truncated rather than trusted, and an
// error inside redaction returns '[unredactable]', never the raw input.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const os = require('os');

// ── Limits ──────────────────────────────────────────────────────────────────
// A log line is diagnostics, not a data export. §40 forbids logging full
// student or financial records, so shape is capped hard — even for
// non-sensitive keys. Anything bigger than this is a record, not metadata.
const MAX_DEPTH        = 4;
const MAX_ARRAY_ITEMS  = 10;
const MAX_OBJECT_KEYS  = 40;
const MAX_STRING_CHARS = 512;

// ── Key pass ────────────────────────────────────────────────────────────────
// Matched case-insensitively against the key name, as a substring, so
// `guardianCnic`, `student_cnic` and `CNIC` all hit.
const SENSITIVE_KEY_PATTERNS = [
  // credentials & secrets
  'password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key',
  'authorization', 'auth', 'credential', 'privatekey', 'private_key',
  'signature', 'hmac', 'salt', 'seed', 'licensekey', 'license_key',
  'licencekey', 'licence_key', 'activationkey', 'activation_key',
  // direct identifiers
  'cnic', 'nic', 'nationalid', 'national_id', 'passport',
  // contact details
  'phone', 'mobile', 'contact', 'whatsapp', 'email', 'address',
  // people
  'guardian', 'father', 'nextofkin', 'next_of_kin', 'emergency',
  // financial
  'account', 'iban', 'card', 'cvv'
];

// Keys that look sensitive by the list above but are safe and genuinely useful
// in diagnostics. Without this, `accountStatus` and `authState` vanish from
// every log line and the logs stop being able to explain anything.
const SAFE_KEY_EXACT = new Set([
  'accountstatus', 'authstate', 'authenticated', 'tokenexpiresin',
  'hastoken', 'contactcount', 'emailcount', 'phonecount'
]);

function isSensitiveKey(key) {
  const k = String(key).toLowerCase();
  if (SAFE_KEY_EXACT.has(k)) return false;
  return SENSITIVE_KEY_PATTERNS.some(p => k.includes(p));
}

// ── Value pass ──────────────────────────────────────────────────────────────
// Order matters. CNIC runs before phone: a bare 13-digit CNIC would otherwise
// be partially eaten by the mobile-number pattern and leak its remaining
// digits.
const VALUE_RULES = [
  // JWT — three base64url segments
  { tag: 'jwt',   re: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g },
  // Authorization header values
  { tag: 'bearer', re: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi },
  // CNIC — 12345-1234567-1, or bare 13 digits
  { tag: 'cnic',  re: /\b\d{5}-\d{7}-\d\b/g },
  { tag: 'cnic',  re: /\b\d{13}\b/g },
  // Pakistani mobile — +923001234567 / 03001234567 / 0300-1234567
  { tag: 'phone', re: /\b(?:\+92|0092|92)[-\s]?3\d{2}[-\s]?\d{7}\b/g },
  { tag: 'phone', re: /\b03\d{2}[-\s]?\d{7}\b/g },
  // Email
  { tag: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // This app's licence key format — groups of 4-6 alphanumerics joined by '-'
  { tag: 'licensekey', re: /\b[A-Z0-9]{4,6}(?:-[A-Z0-9]{4,6}){3,}\b/g }
];

const HOME = (() => { try { return os.homedir(); } catch (_) { return null; } })();

// Absolute paths carry the Windows account name, which is PII and also tells a
// reader more about the machine than a log needs. Collapse to '~'.
function redactPaths(str) {
  let out = str;
  if (HOME && HOME.length > 3) {
    // Windows paths appear with both separators depending on who built them.
    const variants = [HOME, HOME.replace(/\\/g, '/')];
    for (const v of variants) {
      out = out.split(v).join('~');
      out = out.split(v.toLowerCase()).join('~');
    }
  }
  // C:\Users\<someone>\… when the path did not come from this account
  out = out.replace(/([A-Za-z]:[\\/])Users[\\/][^\\/\s"']+/gi, '$1Users/~');
  return out;
}

function redactString(str) {
  let out = str;
  for (const { tag, re } of VALUE_RULES) {
    // Rules are module-level and /g, so lastIndex must be reset per use.
    re.lastIndex = 0;
    out = out.replace(re, `[redacted:${tag}]`);
  }
  out = redactPaths(out);
  if (out.length > MAX_STRING_CHARS) {
    out = out.slice(0, MAX_STRING_CHARS) + `…[+${out.length - MAX_STRING_CHARS} chars]`;
  }
  return out;
}

// ── Machine ID ──────────────────────────────────────────────────────────────
// The machine ID is a sha256 hex digest. It is not secret, but it is a stable
// device identifier, so logs keep only enough to correlate one machine's own
// lines with each other.
function redactMachineId(id) {
  if (typeof id !== 'string' || id.length < 12) return '[invalid]';
  return id.slice(0, 8) + '…';
}

// ── Deep walk ───────────────────────────────────────────────────────────────
function walk(value, depth, seen) {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'number' || t === 'boolean') return value;
  if (t === 'bigint')   return String(value) + 'n';
  if (t === 'function') return '[function]';
  if (t === 'symbol')   return '[symbol]';
  if (t === 'string')   return redactString(value);

  if (value instanceof Date)  return value.toISOString();
  if (value instanceof Error) {
    return {
      name:    value.name,
      message: redactString(String(value.message || '')),
      code:    value.code,
      stack:   value.stack ? redactString(String(value.stack)) : undefined
    };
  }
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}b]`;

  if (depth >= MAX_DEPTH) return '[depth-limit]';

  // Cycles would otherwise recurse until the stack dies, taking the log call —
  // and whatever it was reporting — with it.
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map(v => walk(v, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) {
        items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
      }
      return items;
    }

    const out = {};
    const keys = Object.keys(value);
    for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
      if (isSensitiveKey(key)) {
        // Keep the fact that the field was present and non-empty — that is
        // often the whole diagnostic ("the token was missing") — but never
        // the value.
        const v = value[key];
        out[key] = (v === null || v === undefined || v === '')
          ? '[redacted:empty]'
          : '[redacted]';
        continue;
      }
      out[key] = walk(value[key], depth + 1, seen);
    }
    if (keys.length > MAX_OBJECT_KEYS) {
      out['…'] = `[+${keys.length - MAX_OBJECT_KEYS} keys]`;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Redact any value for logging or transmission.
 * Never throws — a redaction failure must not take down its caller, and must
 * never fall back to the raw input.
 */
function redact(value) {
  try {
    return walk(value, 0, new Set());
  } catch (_) {
    return '[unredactable]';
  }
}

module.exports = {
  redact,
  redactString,
  redactPaths,
  redactMachineId,
  isSensitiveKey,
  // exported for the test suite
  _limits: { MAX_DEPTH, MAX_ARRAY_ITEMS, MAX_OBJECT_KEYS, MAX_STRING_CHARS }
};
