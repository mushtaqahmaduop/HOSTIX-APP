// ════════════════════════════════════════════════════════════════════════════
// /admin/api/* — the portal's API
//
// People, not machines. Session cookies, CSRF on every state change, and every
// privileged action written to the audit log.
//
// The separation from /v1/* is absolute: a device token cannot reach anything
// here, because the only thing that resolves a session is a row in
// admin_sessions, and a device token is never in that table.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db');
const keys = require('../lib/keys');
const features = require('../lib/features');
const ent = require('../lib/entitlement');
const sessions = require('../lib/sessions');
const audit = require('../lib/audit');

const HOUR_SECONDS = 3600;

/**
 * Every :id on this router is a UUID column.
 *
 * Without this, `/admin/api/licenses/not-a-uuid` handed the string straight to
 * Postgres, which raised 22P02 and surfaced as a 500 INTERNAL_ERROR — a
 * mistyped id read as "the control plane is broken" rather than "no such
 * licence". Fastify enforces `format: 'uuid'`, so the bad id is refused before
 * any query runs.
 */
const UUID_PARAMS = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
};

/**
 * Add whole calendar months, clamping to the end of the target month.
 *
 * `setMonth(getMonth() + n)` overflows: 31 January + 1 month became 3 MARCH,
 * so renewing a month-end licence by one month silently granted an extra 31
 * days and skipped February altogether. UTC throughout, so the result does not
 * depend on the server's timezone.
 */
function addCalendarMonths(from, months) {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();
  // Day 0 of the month AFTER the target is the target month's last day.
  const lastDay = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  const next = new Date(from.getTime());
  next.setUTCFullYear(y, m + months, Math.min(d, lastDay));
  return next;
}

/**
 * Escape the LIKE wildcards in an admin's search box.
 *
 * A search for "%" is a search for the character, not for every customer.
 */
function likeLiteral(v) {
  return String(v).trim().replace(/[\\%_]/g, '\\$&');
}

/**
 * What each role may do.
 *
 * The three roles existed in the schema, were shown in the portal, and were
 * enforced NOWHERE — `requireAdmin` checked that you were signed in and stopped
 * there. A 'support' account could issue keys, revoke a paying customer and
 * grant ten free years. Ranked rather than listed per-route, so a new route
 * picks a floor instead of restating a matrix.
 *
 *   support   read everything. Answering the phone needs the whole picture.
 *   admin     operate: renew, suspend, edit, feature flags, device limits.
 *   owner     the two that create and destroy commercial value — issuing a
 *             licence key, and revoking one.
 */
const ROLE_RANK = { support: 1, admin: 2, owner: 3 };

function roleAtLeast(user, min) {
  return (ROLE_RANK[user && user.role] || 0) >= ROLE_RANK[min];
}

const ROLE_MESSAGE = {
  admin: 'Your account can view licences but not change them.',
  owner: 'Only the account owner can issue or revoke a licence.'
};

/**
 * preHandler guard. Runs after requireAdmin, so request.admin is set and the
 * caller is already authenticated — this decides only whether they may.
 *
 * A refusal is audited. "Who tried to revoke this hostel" is worth as much as
 * who did.
 */
function requireRole(min) {
  return async function roleGuard(request, reply) {
    if (roleAtLeast(request.admin, min)) return;
    await audit.record({
      user: request.admin, action: 'admin.denied',
      details: { need: min, has: request.admin && request.admin.role,
                 method: request.method, route: request.url },
      ip: request.ip
    });
    return reply.code(403).send({
      success: false, code: 'FORBIDDEN',
      message: ROLE_MESSAGE[min] || 'Your account cannot do that.'
    });
  };
}

async function bumpLogin(ip) {
  const { rows } = await db.query(
    `INSERT INTO rate_limits (bucket, ip, window_start, hits)
     VALUES ('admin_login', $1, NOW(), 1)
     ON CONFLICT (bucket, ip) DO UPDATE
       SET hits = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes'
                       THEN 1 ELSE rate_limits.hits + 1 END,
           window_start = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes'
                       THEN NOW() ELSE rate_limits.window_start END
     RETURNING hits`,
    [ip]
  );
  return rows[0].hits;
}

/** Shape a licence row for the portal, without ever leaking a key. */
function presentLicense(row) {
  return {
    id: row.id,
    hostelName: row.hostel_name,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    city: row.city,
    notes: row.notes,
    keyVersion: row.key_version,
    // Enough to match against the issuance log by eye. The checksum is never
    // stored and never sent.
    //
    // It does NOT follow that the key cannot be rebuilt, and an earlier comment
    // here claimed it did. A v4 checksum is HMAC(LEGACY_KEY_SECRET,
    // 'V4:' + expPart + ':' + serial) — a pure function of the two parts this
    // hint prints, under a secret that ships inside app.asar and is documented
    // one file over as filtering typos and nothing more. So anyone holding the
    // desktop app AND portal access can reconstruct a working key from what is
    // on this screen; it was verified end to end, and the rebuilt key
    // registered a device.
    //
    // That is bounded by portal access, which is the owner and whoever they
    // trust. It is recorded here rather than quietly patched because narrowing
    // the hint costs the "match it by eye" job it exists to do, and that is the
    // owner's call to make.
    keyHint: 'HOSTEL-' + row.key_expiry_part + (row.serial ? '-' + row.serial : '') + '-····',
    serial: row.serial,
    status: row.status,
    verification: row.verification,
    expiresAt: row.expires_at,
    keyExpiresAt: row.key_expires_at,
    // Extending expires_at only reaches a customer whose app connects. This
    // tells the admin which renewal path applies before they pick one.
    renewed: row.expires_at && row.key_expires_at
      && new Date(row.expires_at).getTime() !== new Date(row.key_expires_at).getTime(),
    maxDevices: row.max_devices,
    features: features.resolve(row.features),
    featureOverrides: features.diffFromDefaults(row.features),
    deviceCount: row.device_count !== undefined ? row.device_count : undefined,
    lastSeenAt: row.last_seen_at,
    appVersion: row.app_version,
    firstSeenAt: row.first_seen_at,
    createdAt: row.created_at
  };
}

async function adminRoutes(app) {
  const cfg = app.config;

  // ── Session plumbing ──────────────────────────────────────────────────────
  async function currentSession(request) {
    return sessions.resolve(request.cookies[sessions.SESSION_COOKIE]);
  }

  /**
   * Guard for everything except login.
   *
   * Registered as onRequest, NOT preHandler, so it runs BEFORE body parsing and
   * schema validation. As a preHandler an anonymous POST to a route with a body
   * schema was answered with a 400 describing the schema rather than a flat 401 —
   * not exploitable, but it told an unauthenticated caller what the route expects.
   */
  async function requireAdmin(request, reply) {
    const session = await currentSession(request);
    if (!session) {
      return reply.code(401).send({
        success: false, code: 'UNAUTHENTICATED', message: 'Please sign in.'
      });
    }
    request.admin = session.user;

    // CSRF on anything that changes state. A GET is exempt because it changes
    // nothing; if a GET here ever starts changing something, that is the bug.
    if (request.method !== 'GET') {
      const presented = request.headers[sessions.CSRF_HEADER];
      if (!sessions.csrfMatches(presented, session.csrf)) {
        return reply.code(403).send({
          success: false, code: 'CSRF', message: 'Session check failed. Reload and try again.'
        });
      }
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', maxLength: 200 },
          password: { type: 'string', maxLength: 200 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    if (await bumpLogin(request.ip) > 10) {
      return reply.code(429).send({
        success: false, code: 'RATE_LIMIT',
        message: 'Too many sign-in attempts. Try again in 15 minutes.'
      });
    }

    const email = String(request.body.email).trim().toLowerCase();
    const { rows } = await db.query(
      'SELECT id, email, name, role, password_hash, is_active FROM admin_users WHERE email = $1',
      [email]
    );

    // One message for a wrong email and a wrong password. Telling them apart
    // turns this into an account-enumeration endpoint.
    const deny = () => reply.code(401).send({
      success: false, code: 'INVALID_CREDENTIALS', message: 'Wrong email or password.'
    });

    if (rows.length === 0) {
      // Keep the timing shape of a real check, so a missing account is not
      // measurably faster than a wrong password.
      await bcrypt.compare(String(request.body.password), '$2b$12$' + 'x'.repeat(53));
      return deny();
    }

    const user = rows[0];
    const ok = await bcrypt.compare(String(request.body.password), user.password_hash);
    if (!ok || !user.is_active) return deny();

    const session = await sessions.create(user.id, cfg.sessionTtlHours, {
      ip: request.ip, userAgent: request.headers['user-agent']
    });

    await db.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    await audit.record({
      user, action: 'admin.login', targetType: 'admin_user', targetId: user.id, ip: request.ip
    });

    const maxAge = cfg.sessionTtlHours * HOUR_SECONDS;
    reply.setCookie(sessions.SESSION_COOKIE, session.token, sessions.cookieOptions(cfg, maxAge));
    // Readable by the portal's own JS so it can echo it in a header — that is
    // the whole point of a double-submit token.
    reply.setCookie(sessions.CSRF_COOKIE, session.csrf,
      Object.assign(sessions.cookieOptions(cfg, maxAge), { httpOnly: false }));

    return reply.send({
      success: true,
      data: { user: { email: user.email, name: user.name, role: user.role } }
    });
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[sessions.SESSION_COOKIE];
    const session = await sessions.resolve(token);
    if (session) {
      await sessions.destroy(token);
      await audit.record({ user: session.user, action: 'admin.logout', ip: request.ip });
    }
    reply.clearCookie(sessions.SESSION_COOKIE, { path: '/' });
    reply.clearCookie(sessions.CSRF_COOKIE, { path: '/' });
    return reply.send({ success: true, data: {} });
  });

  app.get('/me', async (request, reply) => {
    const session = await currentSession(request);
    if (!session) {
      return reply.code(401).send({ success: false, code: 'UNAUTHENTICATED', message: 'Please sign in.' });
    }
    return reply.send({
      success: true,
      data: {
        user: session.user,
        featureCatalogue: features.CATALOGUE,
        signingConfigured: cfg.signingConfigured,
        keyIssuingConfigured: !!cfg.legacyKeySecret
      }
    });
  });

  // ── Overview ──────────────────────────────────────────────────────────────
  app.get('/summary', { onRequest: requireAdmin }, async (_request, reply) => {
    const { rows } = await db.query(`
      SELECT
        COUNT(*)                                                        AS total,
        COUNT(*) FILTER (WHERE status = 'active')                       AS active,
        COUNT(*) FILTER (WHERE status = 'suspended')                    AS suspended,
        COUNT(*) FILTER (WHERE status = 'revoked')                      AS revoked,
        COUNT(*) FILTER (WHERE verification = 'unverified')             AS unverified,
        COUNT(*) FILTER (WHERE expires_at < NOW())                      AS expired,
        COUNT(*) FILTER (WHERE expires_at >= NOW()
                           AND expires_at < NOW() + INTERVAL '30 days') AS expiring_soon
      FROM licenses
    `);
    const devices = await db.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days') AS seen_week
        FROM devices WHERE status = 'active'
    `);
    return reply.send({
      success: true,
      data: { licenses: rows[0], devices: devices.rows[0] }
    });
  });

  // ── Licences ──────────────────────────────────────────────────────────────
  app.get('/licenses', { onRequest: requireAdmin }, async (request, reply) => {
    const q = request.query || {};
    const where = [];
    const params = [];

    if (q.status) { params.push(q.status); where.push('l.status = $' + params.length); }
    if (q.verification) { params.push(q.verification); where.push('l.verification = $' + params.length); }
    if (q.expiring === 'true') where.push("l.expires_at < NOW() + INTERVAL '30 days'");
    if (q.search) {
      params.push('%' + likeLiteral(q.search) + '%');
      where.push('(l.hostel_name ILIKE $' + params.length
        + ' OR l.city ILIKE $' + params.length
        + ' OR l.contact_name ILIKE $' + params.length
        + ' OR l.contact_phone ILIKE $' + params.length + ')');
    }

    const { rows } = await db.query(
      `SELECT l.*,
              COUNT(d.id) FILTER (WHERE d.status = 'active') AS device_count,
              MAX(d.last_seen_at)                            AS last_seen_at,
              (ARRAY_AGG(d.app_version ORDER BY d.last_seen_at DESC NULLS LAST))[1] AS app_version
         FROM licenses l
         LEFT JOIN devices d ON d.license_id = l.id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        GROUP BY l.id
        ORDER BY l.expires_at ASC
        LIMIT 500`,
      params
    );
    return reply.send({ success: true, data: rows.map(presentLicense) });
  });

  app.get('/licenses/:id', {
    onRequest: requireAdmin, schema: { params: UUID_PARAMS }
  }, async (request, reply) => {
    const { rows } = await db.query('SELECT * FROM licenses WHERE id = $1', [request.params.id]);
    if (rows.length === 0) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such licence.' });
    }
    const devices = await db.query(
      `SELECT id, machine_id, label, status, admin_blocked,
              app_version, os, first_seen_at, last_seen_at
         FROM devices WHERE license_id = $1 ORDER BY last_seen_at DESC`,
      [request.params.id]
    );
    return reply.send({
      success: true,
      data: {
        license: presentLicense(rows[0]),
        devices: devices.rows.map((d) => ({
          id: d.id,
          machineId: d.machine_id,
          machineShort: String(d.machine_id).slice(0, 12),
          label: d.label,
          status: d.status,
          // So the portal can say "deactivated by you" rather than leaving an
          // admin wondering why a live hostel shows a dead computer.
          adminBlocked: d.admin_blocked,
          appVersion: d.app_version,
          os: d.os,
          firstSeenAt: d.first_seen_at,
          lastSeenAt: d.last_seen_at
        })),
        audit: await audit.forTarget('license', request.params.id, 50)
      }
    });
  });

  /** Details the owner keeps about a customer — free text, no behaviour. */
  app.patch('/licenses/:id', {
    onRequest: requireAdmin,
    preHandler: requireRole('admin'),
    schema: {
      params: UUID_PARAMS,
      // Without a body schema an empty PATCH reached `k in request.body` with
      // request.body undefined and came back as a 500. Naming the fields also
      // means a typo is refused rather than silently dropped.
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          hostelName: { type: ['string', 'null'], maxLength: 500 },
          contactName: { type: ['string', 'null'], maxLength: 500 },
          contactPhone: { type: ['string', 'null'], maxLength: 500 },
          city: { type: ['string', 'null'], maxLength: 500 },
          notes: { type: ['string', 'null'], maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const allowed = ['hostelName', 'contactName', 'contactPhone', 'city', 'notes'];
    const cols = { hostelName: 'hostel_name', contactName: 'contact_name',
                   contactPhone: 'contact_phone', city: 'city', notes: 'notes' };
    const sets = [];
    const params = [request.params.id];
    for (const k of allowed) {
      if (k in request.body) {
        const v = request.body[k];
        params.push(v === '' || v === null ? null : String(v).slice(0, 500));
        sets.push(cols[k] + ' = $' + params.length);
      }
    }
    if (sets.length === 0) {
      return reply.code(400).send({ success: false, code: 'NOTHING_TO_UPDATE', message: 'No fields given.' });
    }
    const { rows } = await db.query(
      'UPDATE licenses SET ' + sets.join(', ') + ' WHERE id = $1 RETURNING *', params);
    if (rows.length === 0) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such licence.' });
    }
    await audit.record({
      user: request.admin, action: 'license.update', targetType: 'license',
      targetId: request.params.id, details: request.body, ip: request.ip
    });
    return reply.send({ success: true, data: presentLicense(rows[0]) });
  });

  /**
   * Status and verification. One endpoint because they are the same kind of
   * decision — an administrative judgement about a customer — and because
   * having them in one place makes the audit trail read as one story.
   */
  app.post('/licenses/:id/status', {
    onRequest: requireAdmin,
    preHandler: requireRole('admin'),
    schema: {
      params: UUID_PARAMS,
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'suspended', 'revoked'] },
          verification: { type: 'string', enum: ['unverified', 'verified', 'rejected'] },
          reason: { type: 'string', maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { status, verification, reason } = request.body;
    if (!status && !verification) {
      return reply.code(400).send({ success: false, code: 'NOTHING_TO_UPDATE', message: 'No change given.' });
    }

    // Revoking is owner-only, and this route is the only way to reach it, so
    // the check sits here rather than in the preHandler — the floor depends on
    // the body, not on the route. `verification: 'rejected'` counts: it resolves
    // to REVOKED in the entitlement, so it is revocation spelled differently.
    const isRevocation = status === 'revoked' || verification === 'rejected';
    if (isRevocation && !roleAtLeast(request.admin, 'owner')) {
      await audit.record({
        user: request.admin, action: 'admin.denied', targetType: 'license',
        targetId: request.params.id,
        details: { need: 'owner', has: request.admin.role, attempted: { status, verification } },
        ip: request.ip
      });
      return reply.code(403).send({
        success: false, code: 'FORBIDDEN', message: ROLE_MESSAGE.owner
      });
    }

    const before = await db.query('SELECT status, verification FROM licenses WHERE id = $1', [request.params.id]);
    if (before.rows.length === 0) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such licence.' });
    }

    const sets = [];
    const params = [request.params.id];
    if (status) { params.push(status); sets.push('status = $' + params.length); }
    if (verification) { params.push(verification); sets.push('verification = $' + params.length); }

    const { rows } = await db.query(
      'UPDATE licenses SET ' + sets.join(', ') + ' WHERE id = $1 RETURNING *', params);

    await audit.record({
      user: request.admin, action: 'license.status', targetType: 'license',
      targetId: request.params.id,
      details: { from: before.rows[0], to: { status, verification }, reason: reason || null },
      ip: request.ip
    });

    return reply.send({ success: true, data: presentLicense(rows[0]) });
  });

  /**
   * Renew — move the control plane's expiry.
   *
   * This reaches a customer only when their app connects. For a hostel that
   * stays offline, renewal means issuing a NEW KEY (see /issue-key); the
   * response says which case this licence is in so the portal can say so too.
   */
  app.post('/licenses/:id/renew', {
    onRequest: requireAdmin,
    preHandler: requireRole('admin'),
    schema: {
      params: UUID_PARAMS,
      body: {
        type: 'object',
        properties: {
          expiresAt: { type: 'string', minLength: 10, maxLength: 30 },
          addMonths: { type: 'integer', minimum: 1, maximum: 120 },
          reason: { type: 'string', maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { expiresAt, addMonths, reason } = request.body;
    const current = await db.query(
      'SELECT expires_at, status FROM licenses WHERE id = $1', [request.params.id]);
    if (current.rows.length === 0) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such licence.' });
    }

    let next;
    if (expiresAt) {
      next = new Date(expiresAt);
      if (isNaN(next.getTime())) {
        return reply.code(400).send({ success: false, code: 'INVALID_DATE', message: 'That is not a real date.' });
      }
    } else if (addMonths) {
      // Extend from whichever is later: a licence that lapsed three months ago
      // should get its full period from today, not have it swallowed by the gap.
      const base = new Date(Math.max(Date.now(), new Date(current.rows[0].expires_at).getTime()));
      next = addCalendarMonths(base, addMonths);
    } else {
      return reply.code(400).send({
        success: false, code: 'NOTHING_TO_UPDATE', message: 'Give a date or a number of months.'
      });
    }

    const { rows } = await db.query(
      'UPDATE licenses SET expires_at = $2 WHERE id = $1 RETURNING *',
      [request.params.id, next.toISOString()]
    );

    const lastSeen = await db.query(
      'SELECT MAX(last_seen_at) AS seen FROM devices WHERE license_id = $1', [request.params.id]);

    await audit.record({
      user: request.admin, action: 'license.renew', targetType: 'license',
      targetId: request.params.id,
      details: { from: current.rows[0].expires_at, to: next.toISOString(), reason: reason || null },
      ip: request.ip
    });

    return reply.send({
      success: true,
      data: {
        license: presentLicense(rows[0]),
        // The portal turns this into the sentence the admin needs to read.
        reachesCustomerOnline: !!lastSeen.rows[0].seen,
        lastSeenAt: lastSeen.rows[0].seen
      }
    });
  });

  app.post('/licenses/:id/devices-limit', {
    onRequest: requireAdmin,
    preHandler: requireRole('admin'),
    schema: {
      params: UUID_PARAMS,
      body: {
        // maxDevices is REQUIRED, and null is how "unlimited" is said out loud.
        // It used to be optional, so an empty body — a portal bug, a truncated
        // request — read as `undefined` and silently uncapped a one-computer
        // licence. "I did not mention it" and "let them have every computer"
        // must not be the same request.
        type: 'object',
        required: ['maxDevices'],
        properties: { maxDevices: { type: ['integer', 'null'], minimum: 1, maximum: 1000 } },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { rows } = await db.query(
      'UPDATE licenses SET max_devices = $2 WHERE id = $1 RETURNING *',
      [request.params.id, request.body.maxDevices]
    );
    if (rows.length === 0) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such licence.' });
    }
    await audit.record({
      user: request.admin, action: 'license.device_limit', targetType: 'license',
      targetId: request.params.id, details: { maxDevices: request.body.maxDevices }, ip: request.ip
    });
    return reply.send({ success: true, data: presentLicense(rows[0]) });
  });

  /** Feature flags. Unknown keys are refused rather than stored. */
  app.put('/licenses/:id/features', {
    onRequest: requireAdmin,
    preHandler: requireRole('admin'),
    schema: {
      params: UUID_PARAMS,
      // `features` is REQUIRED. A PUT with no body used to validate as "no
      // overrides" and overwrite the row with {}, silently resetting every flag
      // an admin had set. Clearing the overrides is now something you have to
      // ask for, by sending {}.
      body: {
        type: 'object',
        required: ['features'],
        properties: { features: { type: 'object' } },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const checked = features.validateOverrides(request.body.features);
    if (!checked.ok) {
      return reply.code(400).send({ success: false, code: 'INVALID_FEATURES', message: checked.error });
    }
    const before = await db.query('SELECT features FROM licenses WHERE id = $1', [request.params.id]);
    if (before.rows.length === 0) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such licence.' });
    }
    const { rows } = await db.query(
      'UPDATE licenses SET features = $2 WHERE id = $1 RETURNING *',
      [request.params.id, JSON.stringify(checked.value)]
    );
    await audit.record({
      user: request.admin, action: 'license.features', targetType: 'license',
      targetId: request.params.id,
      details: { from: before.rows[0].features, to: checked.value }, ip: request.ip
    });
    return reply.send({ success: true, data: presentLicense(rows[0]) });
  });

  // ── Devices ───────────────────────────────────────────────────────────────
  app.post('/devices/:id/status', {
    onRequest: requireAdmin,
    preHandler: requireRole('admin'),
    schema: {
      params: UUID_PARAMS,
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'deactivated'] },
          reason: { type: 'string', maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const out = await db.withTransaction(async (client) => {
      // admin_blocked tracks the DECISION, which is what registration has to
      // respect; status tracks the state. Reactivating from the portal clears
      // the block, so restoring a machine is one action and not two.
      const { rows } = await client.query(
        `UPDATE devices SET status = $2, admin_blocked = $3
          WHERE id = $1
          RETURNING id, license_id, machine_id, status, admin_blocked`,
        [request.params.id, request.body.status, request.body.status === 'deactivated']
      );
      if (rows.length === 0) return null;
      // Deactivating must end the device's live sessions, or it keeps working
      // until its token happens to expire — which is exactly the window an
      // admin deactivating a machine is trying to close.
      if (request.body.status === 'deactivated') {
        await client.query('DELETE FROM device_tokens WHERE device_id = $1', [request.params.id]);
      }
      return rows[0];
    });

    if (!out) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such device.' });
    }
    await audit.record({
      user: request.admin, action: 'device.status', targetType: 'license', targetId: out.license_id,
      details: { deviceId: out.id, machineId: out.machine_id, status: out.status,
                 reason: request.body.reason || null },
      ip: request.ip
    });
    return reply.send({ success: true, data: { id: out.id, status: out.status } });
  });

  app.patch('/devices/:id', {
    onRequest: requireAdmin,
    preHandler: requireRole('admin'),
    schema: {
      params: UUID_PARAMS,
      body: {
        type: 'object',
        properties: { label: { type: ['string', 'null'], maxLength: 120 } },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const label = request.body && request.body.label;
    const { rows } = await db.query(
      'UPDATE devices SET label = $2 WHERE id = $1 RETURNING id, label',
      [request.params.id, label ? String(label).slice(0, 120) : null]
    );
    if (rows.length === 0) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such device.' });
    }
    return reply.send({ success: true, data: rows[0] });
  });

  // ── Issuing keys ──────────────────────────────────────────────────────────
  /**
   * Mint a licence key and RECORD it.
   *
   * This is the fix for the gap that made the migration so awkward: keys were
   * cut by a CLI that logged nothing and a browser page that logged to
   * localStorage, so the issuance history is 12 strings for ~50 hostels. Every
   * key issued here creates its licence row up front, with the customer's
   * details attached — so it is known before the app ever registers, and the
   * key is v4, which means it is unique to this issuance.
   *
   * The key is shown ONCE. Only its fingerprint is stored, exactly as with a
   * customer-supplied key: it is a credential, and this table is not where
   * credentials live.
   */
  app.post('/issue-key', {
    onRequest: requireAdmin,
    preHandler: requireRole('owner'),
    schema: {
      body: {
        type: 'object',
        required: ['expiresOn'],
        properties: {
          expiresOn: { type: 'string', minLength: 10, maxLength: 10 },   // YYYY-MM-DD
          hostelName: { type: 'string', maxLength: 200 },
          contactName: { type: 'string', maxLength: 200 },
          contactPhone: { type: 'string', maxLength: 50 },
          city: { type: 'string', maxLength: 100 },
          notes: { type: 'string', maxLength: 500 },
          maxDevices: { type: 'integer', minimum: 1, maximum: 1000 },
          renewalOf: { type: 'string', format: 'uuid' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    if (!cfg.legacyKeySecret) {
      return reply.code(503).send({
        success: false, code: 'SERVICE_NOT_CONFIGURED',
        message: 'Key issuing is not enabled on this server.'
      });
    }

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(request.body.expiresOn);
    if (!m) {
      return reply.code(400).send({ success: false, code: 'INVALID_DATE', message: 'Use YYYY-MM-DD.' });
    }
    const year = +m[1], month = +m[2], day = +m[3];
    // Reject 31 April rather than let Date roll it forward to 1 May.
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      return reply.code(400).send({ success: false, code: 'INVALID_DATE', message: 'That is not a real date.' });
    }

    const key = keys.buildLicenseKey(year, month, day, cfg.legacyKeySecret);
    const parsed = keys.parseLicenseKey(key);
    const expiry = keys.licenseKeyExpiry(key);

    const { rows } = await db.query(
      `INSERT INTO licenses
         (key_fingerprint, key_version, key_expiry_part, serial, key_expires_at, expires_at,
          max_devices, verification, hostel_name, contact_name, contact_phone, city, notes)
       VALUES ($1,$2,$3,$4,$5,$5,$6,'verified',$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        keys.keyFingerprint(parsed), parsed.version, parsed.expPart, parsed.serial,
        expiry.toISOString(),
        request.body.maxDevices || keys.defaultMaxDevices(parsed),
        request.body.hostelName || null, request.body.contactName || null,
        request.body.contactPhone || null, request.body.city || null, request.body.notes || null
      ]
    );

    await audit.record({
      user: request.admin, action: 'license.issue', targetType: 'license', targetId: rows[0].id,
      details: {
        expiresOn: request.body.expiresOn, serial: parsed.serial,
        hostelName: request.body.hostelName || null,
        renewalOf: request.body.renewalOf || null
      },
      ip: request.ip
    });

    return reply.code(201).send({
      success: true,
      data: {
        // Shown once. Send it to the customer now; it cannot be recovered.
        key,
        license: presentLicense(rows[0])
      }
    });
  });

  // ── Audit ─────────────────────────────────────────────────────────────────
  app.get('/audit', { onRequest: requireAdmin }, async (request, reply) => {
    // Clamped, not just capped. `?limit=-5` used to reach Postgres as
    // `LIMIT -5`, which is a syntax error and surfaced as a 500.
    const q = request.query || {};
    const rawLimit = parseInt(q.limit, 10);
    const rawOffset = parseInt(q.offset, 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
    return reply.send({ success: true, data: await audit.recent(limit, offset) });
  });

  // ── Preview ───────────────────────────────────────────────────────────────
  /**
   * What this licence's entitlement says right now, without minting one for a
   * device. Answers "what will the customer actually see?" — the question an
   * admin has immediately after changing anything on this page.
   */
  app.get('/licenses/:id/preview', {
    onRequest: requireAdmin, schema: { params: UUID_PARAMS }
  }, async (request, reply) => {
    const { rows } = await db.query('SELECT * FROM licenses WHERE id = $1', [request.params.id]);
    if (rows.length === 0) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'No such licence.' });
    }
    const l = rows[0];
    const claims = ent.buildClaims({
      deviceId: '(preview)', licenseId: l.id, machineId: '(preview)',
      licence: {
        status: l.status, verification: l.verification,
        expiresAt: new Date(l.expires_at), features: l.features
      }
    });
    return reply.send({
      success: true,
      data: { status: claims.status, features: claims.features, policy: claims.policy }
    });
  });
}

module.exports = { adminRoutes };
