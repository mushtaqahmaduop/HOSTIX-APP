// ════════════════════════════════════════════════════════════════════════════
// Admin sessions
//
// Server-side, hashed, in Postgres. A session is an admin session because it is
// in the admin_sessions table — which is why an admin cookie can never be
// mistaken for a device token and a device token can never reach an admin
// route. Neither verifier can read the other's credential at all, so the
// guarantee comes from the storage rather than from a claim someone could
// forget to check.
//
// ── CSRF ────────────────────────────────────────────────────────────────────
// The cookie is SameSite=Strict, which stops the ordinary cross-site form POST.
// A double-submit token is the second lock, and it is warranted here: the
// actions behind this session suspend and revoke paying customers' software.
// The token is issued with the session, held in a non-HttpOnly cookie the
// portal's own JS reads, and echoed in a header — an attacker on another origin
// can cause the browser to send the session cookie but cannot read the CSRF
// cookie to echo it.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const db = require('../db');

const SESSION_COOKIE = 'cp_session';
const CSRF_COOKIE = 'cp_csrf';
const CSRF_HEADER = 'x-csrf-token';

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * @returns {{token:string, csrf:string, expiresAt:Date}}
 */
async function create(adminUserId, ttlHours, meta) {
  const token = newToken();
  const csrf = newToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

  await db.query(
    `INSERT INTO admin_sessions (token_hash, admin_user_id, csrf_token, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [hash(token), adminUserId, csrf, (meta && meta.ip) || null,
     ((meta && meta.userAgent) || '').slice(0, 300) || null, expiresAt.toISOString()]
  );

  // Opportunistic sweep. A scheduled job for a table with a handful of rows
  // would be more moving parts than the problem deserves.
  await db.query('DELETE FROM admin_sessions WHERE expires_at < NOW()').catch(() => {});

  return { token, csrf, expiresAt };
}

/** The session and its user, or null. Expired rows never resolve. */
async function resolve(token) {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT s.token_hash, s.csrf_token, s.expires_at,
            u.id, u.email, u.name, u.role, u.is_active
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hash(token)]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  // A deactivated admin's existing sessions must stop working immediately,
  // not when they happen to expire.
  if (!r.is_active) return null;
  return {
    csrf: r.csrf_token,
    expiresAt: r.expires_at,
    user: { id: r.id, email: r.email, name: r.name, role: r.role }
  };
}

async function destroy(token) {
  if (!token) return;
  await db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hash(token)]);
}

/** Every session for one user — used when a password changes or an admin is disabled. */
async function destroyAllFor(adminUserId) {
  await db.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [adminUserId]);
}

/**
 * Constant-time comparison of a presented CSRF token against the session's.
 *
 * `!==` leaks, through timing, how many leading characters a guess got right,
 * which is enough to walk a token out one character at a time. Cheap to do
 * properly, so do it properly.
 */
function csrfMatches(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string') return false;
  if (presented.length === 0 || presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(presented, 'utf8'), Buffer.from(expected, 'utf8'));
}

function cookieOptions(cfg, maxAgeSeconds) {
  return {
    httpOnly: true,
    // Strict rather than Lax: there is no legitimate cross-site navigation into
    // this portal, and Lax still sends the cookie on a top-level GET.
    sameSite: 'strict',
    // Off in development so the portal works over plain http on localhost.
    secure: cfg.env === 'production',
    path: '/',
    maxAge: maxAgeSeconds
  };
}

module.exports = {
  SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER,
  create, resolve, destroy, destroyAllFor, cookieOptions, hash, csrfMatches
};
