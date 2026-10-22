// ════════════════════════════════════════════════════════════════════════════
// /admin/api/* — the portal's API
//
// People, not machines. Session cookies, CSRF on every state change, and every
// privileged action written to the audit log.
//
// The separation from /v1/* is absolute: a device token cannot reach anything
// here, because the only thing that resolves a session is a row in
// admin_sessions, and a device token is never in that table.
//
// ── Roles (owner, 2026-09-24) ───────────────────────────────────────────────
//   support  reads everything, edits notes
//   admin    + changes levels (not revoke), expiry, features, restrictions,
//              devices, bulk actions, issues keys
//   owner    + revokes, fleet-wide switches, manages admins
//
// The destructive owner actions — revoke, fleet, admin management — also ask for
// the password again. A session left open on a shared PC must not be enough to
// switch off every hostel.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db');
const keys = require('../lib/keys');
const features = require('../lib/features');
const access = require('../lib/access');
const ent = require('../lib/entitlement');
const sessions = require('../lib/sessions');
const audit = require('../lib/audit');
const totp = require('../lib/totp');

const HOUR_SECONDS = 3600;
const DAY_MS = 86400000;

/** A device holding a stream within this window is "online now". */
const ONLINE_WINDOW_SECONDS = 120;   // presence is written every ~50s (devices.js)

const ROLE_RANK = { support: 1, admin: 2, owner: 3 };

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

async function loadFleet(runner) {
  const { rows } = await (runner || db).query(
    'SELECT features, restrictions, revision, updated_at FROM fleet_settings WHERE id');
  return rows[0] || { features: {}, restrictions: {}, revision: 0 };
}

/**
 * The licence columns plus what the portal needs to know about its devices:
 * how many, how many online now, the newest app version, and the lowest
 * revision any active device has applied (so "change received" means ALL of
 * them).
 */
const LICENCE_SELECT = `
  SELECT l.*,
         COUNT(d.id) FILTER (WHERE d.status = 'active')                        AS device_count,
         COUNT(d.id) FILTER (WHERE d.status = 'active'
             AND d.stream_connected_at > NOW() - INTERVAL '${ONLINE_WINDOW_SECONDS} seconds') AS online_count,
         MAX(d.last_seen_at)                                                    AS last_seen_at,
         MIN(d.last_revision_applied) FILTER (WHERE d.status = 'active')       AS min_revision_applied,
         (ARRAY_AGG(d.app_version ORDER BY d.last_seen_at DESC NULLS LAST))[1]  AS app_version
    FROM licenses l
    LEFT JOIN devices d ON d.license_id = l.id`;

/** Shape a licence row for the portal, without ever leaking a key. */
function presentLicense(row, fleet) {
  const f = fleet || {};
  const now = new Date();
  const level = access.effectiveLevel(row, now);
  const revision = Number(row.revision || 0) + Number(f.revision || 0);
  const status = ent.resolveStatus({
    status: row.status, status_until: row.status_until, status_before: row.status_before,
    verification: row.verification, expiresAt: new Date(row.expires_at)
  }, now);
  return {
    id: row.id,
    hostelName: row.hostel_name,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    city: row.city,
    notes: row.notes,
    plan: row.plan,
    keyVersion: row.key_version,
    // Enough to match against the issuance log by eye, never enough to rebuild
    // the key: the checksum is not stored at all.
    keyHint: 'HOSTEL-' + row.key_expiry_part + (row.serial ? '-' + row.serial : '') + '-····',
    serial: row.serial,
    // The stored level, and the one in force now (a timed level that has passed
    // is already over, whether or not the sweeper has run).
    status: row.status,
    level,
    statusUntil: row.status_until,
    statusBefore: row.status_before,
    statusReason: row.status_reason,
    // What the app is told: ACTIVE / GRACE / EXPIRED / SUSPENDED / REVOKED.
    appStatus: status,
    verification: row.verification,
    expiresAt: row.expires_at,
    keyExpiresAt: row.key_expires_at,
    // Extending expires_at only reaches a customer whose app connects. This
    // tells the admin which renewal path applies before they pick one.
    renewed: row.expires_at && row.key_expires_at
      && new Date(row.expires_at).getTime() !== new Date(row.key_expires_at).getTime(),
    maxDevices: row.max_devices,
    features: access.resolveFeatures(row.features, f.features),
    featureOverrides: features.diffFromDefaults(row.features),
    restrictions: access.resolveRestrictions(level, row.restrictions, f.restrictions),
    restrictionOverrides: row.restrictions || {},
    revision,
    deviceCount: row.device_count !== undefined ? row.device_count : undefined,
    onlineCount: row.online_count !== undefined ? row.online_count : undefined,
    // True only when every active device has fetched the current revision.
    delivered: row.min_revision_applied != null
      ? Number(row.min_revision_applied) >= revision : null,
    lastSeenAt: row.last_seen_at,
    appVersion: row.app_version,
    firstSeenAt: row.first_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const notFound = (reply, what) => reply.code(404).send({
  success: false, code: 'NOT_FOUND', message: 'No such ' + (what || 'licence') + '.'
});

async function adminRoutes(app) {
  const cfg = app.config;

  // ── Session plumbing ──────────────────────────────────────────────────────
  async function currentSession(request) {
    return sessions.resolve(request.cookies[sessions.SESSION_COOKIE]);
  }

  /**
   * Guard factory. Registered as onRequest, NOT preHandler, so it runs BEFORE
   * body parsing and schema validation — an anonymous POST gets a flat 401
   * rather than a 400 describing what the route expects.
   */
  function requireRole(min) {
    return async function guard(request, reply) {
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
        if (!presented || presented !== session.csrf) {
          return reply.code(403).send({
            success: false, code: 'CSRF', message: 'Session check failed. Reload and try again.'
          });
        }
      }

      if ((ROLE_RANK[session.user.role] || 0) < ROLE_RANK[min]) {
        return reply.code(403).send({
          success: false, code: 'FORBIDDEN',
          message: 'Your role (' + session.user.role + ') cannot do this. It needs ' + min + '.'
        });
      }
    };
  }
  const requireAdmin = requireRole('support');   // any signed-in portal user
  const requireEditor = requireRole('admin');
  const requireOwner = requireRole('owner');

  /** Re-check the password for the actions that can switch off every hostel. */
  async function confirmPassword(request, reply) {
    const pw = request.body && request.body.password;
    if (!pw) {
      reply.code(403).send({ success: false, code: 'PASSWORD_REQUIRED',
        message: 'Enter your password to confirm this action.' });
      return false;
    }
    const { rows } = await db.query('SELECT password_hash FROM admin_users WHERE id = $1', [request.admin.id]);
    if (!rows.length || !(await bcrypt.compare(String(pw), rows[0].password_hash))) {
      reply.code(403).send({ success: false, code: 'PASSWORD_WRONG', message: 'That password is not right.' });
      return false;
    }
    return true;
  }

  async function licenceById(id, runner) {
    const { rows } = await (runner || db).query(
      LICENCE_SELECT + ' WHERE l.id = $1 GROUP BY l.id', [id]);
    return rows[0] || null;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', maxLength: 200 },
          password: { type: 'string', maxLength: 200 },
          code: { type: 'string', maxLength: 12 }
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
      `SELECT id, email, name, role, password_hash, is_active, totp_enabled, totp_secret
         FROM admin_users WHERE email = $1`,
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

    // Second factor. Asked for only AFTER the password is right, so the
    // TOTP_REQUIRED answer reveals nothing to someone guessing passwords.
    if (user.totp_enabled) {
      if (!request.body.code) {
        return reply.code(401).send({
          success: false, code: 'TOTP_REQUIRED', message: 'Enter the 6-digit code from your authenticator app.'
        });
      }
      if (!totp.verify(user.totp_secret, request.body.code)) {
        return reply.code(401).send({
          success: false, code: 'TOTP_INVALID', message: 'That code is not right. Codes change every 30 seconds.'
        });
      }
    }

    const session = await sessions.create(user.id, cfg.sessionTtlHours, {
      ip: request.ip, userAgent: request.headers['user-agent']
    });

    await db.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    await audit.record({
      user, action: 'admin.login', targetType: 'admin_user', targetId: user.id, ip: request.ip,
      details: { totp: !!user.totp_enabled }
    });

    const maxAge = cfg.sessionTtlHours * HOUR_SECONDS;
    reply.setCookie(sessions.SESSION_COOKIE, session.token, sessions.cookieOptions(cfg, maxAge));
    // Readable by the portal's own JS so it can echo it in a header — that is
    // the whole point of a double-submit token.
    reply.setCookie(sessions.CSRF_COOKIE, session.csrf,
      Object.assign(sessions.cookieOptions(cfg, maxAge), { httpOnly: false }));

    return reply.send({
      success: true,
      data: { user: { email: user.email, name: user.name, role: user.role, totpEnabled: !!user.totp_enabled } }
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
    const t = await db.query('SELECT totp_enabled FROM admin_users WHERE id = $1', [session.user.id]);
    return reply.send({
      success: true,
      data: {
        user: Object.assign({}, session.user, { totpEnabled: !!(t.rows[0] && t.rows[0].totp_enabled) }),
        featureCatalogue: features.CATALOGUE,
        restrictionCatalogue: access.RESTRICTION_LABELS,
        levels: access.LEVELS,
        signingConfigured: cfg.signingConfigured,
        keyIssuingConfigured: !!cfg.legacyKeySecret
      }
    });
  });

  // ── My account: password and 2FA ──────────────────────────────────────────
  app.post('/me/password', {
    onRequest: requireAdmin,
    schema: { body: { type: 'object', required: ['password', 'newPassword'],
      properties: { password: { type: 'string', maxLength: 200 },
                    newPassword: { type: 'string', minLength: 12, maxLength: 200 } },
      additionalProperties: false } }
  }, async (request, reply) => {
    if (!(await confirmPassword(request, reply))) return;
    const hash = await bcrypt.hash(String(request.body.newPassword), 12);
    await db.query('UPDATE admin_users SET password_hash = $2 WHERE id = $1', [request.admin.id, hash]);
    // Every other session goes — a password change is often BECAUSE of one.
    const current = request.cookies[sessions.SESSION_COOKIE];
    await db.query('DELETE FROM admin_sessions WHERE admin_user_id = $1 AND token_hash <> $2',
      [request.admin.id, sessions.hash(current)]);
    await audit.record({ user: request.admin, action: 'admin.password', targetType: 'admin_user',
      targetId: request.admin.id, ip: request.ip });
    return reply.send({ success: true, data: {} });
  });

  /** Start enrolment. Stores a PENDING secret, so 2FA stays as it was until confirmed. */
  app.post('/me/totp/setup', { onRequest: requireAdmin }, async (request, reply) => {
    const secret = totp.generateSecret();
    await db.query('UPDATE admin_users SET totp_pending = $2 WHERE id = $1', [request.admin.id, secret]);
    return reply.send({ success: true, data: { secret, uri: totp.uri(secret, request.admin.email) } });
  });

  app.post('/me/totp/enable', {
    onRequest: requireAdmin,
    schema: { body: { type: 'object', required: ['code'],
      properties: { code: { type: 'string', maxLength: 12 } }, additionalProperties: false } }
  }, async (request, reply) => {
    const { rows } = await db.query('SELECT totp_pending FROM admin_users WHERE id = $1', [request.admin.id]);
    const pending = rows[0] && rows[0].totp_pending;
    if (!pending || !totp.verify(pending, request.body.code)) {
      return reply.code(400).send({ success: false, code: 'TOTP_INVALID',
        message: 'That code does not match. Check the time on your phone and try the next code.' });
    }
    await db.query(
      'UPDATE admin_users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled = TRUE WHERE id = $1',
      [request.admin.id]);
    await audit.record({ user: request.admin, action: 'admin.totp_enable', targetType: 'admin_user',
      targetId: request.admin.id, ip: request.ip });
    return reply.send({ success: true, data: { totpEnabled: true } });
  });

  app.post('/me/totp/disable', {
    onRequest: requireAdmin,
    schema: { body: { type: 'object', required: ['password', 'code'],
      properties: { password: { type: 'string', maxLength: 200 }, code: { type: 'string', maxLength: 12 } },
      additionalProperties: false } }
  }, async (request, reply) => {
    if (!(await confirmPassword(request, reply))) return;
    const { rows } = await db.query('SELECT totp_secret FROM admin_users WHERE id = $1', [request.admin.id]);
    if (!rows[0] || !totp.verify(rows[0].totp_secret, request.body.code)) {
      return reply.code(400).send({ success: false, code: 'TOTP_INVALID', message: 'That code is not right.' });
    }
    await db.query(
      'UPDATE admin_users SET totp_secret = NULL, totp_enabled = FALSE, totp_pending = NULL WHERE id = $1',
      [request.admin.id]);
    await audit.record({ user: request.admin, action: 'admin.totp_disable', targetType: 'admin_user',
      targetId: request.admin.id, ip: request.ip });
    return reply.send({ success: true, data: { totpEnabled: false } });
  });

  // ── Overview ──────────────────────────────────────────────────────────────
  app.get('/summary', { onRequest: requireAdmin }, async (_request, reply) => {
    // Levels counted as they are IN FORCE — a timed ban that has passed counts
    // under the level it fell back to.
    const { rows } = await db.query(`
      WITH eff AS (
        SELECT l.*,
               CASE WHEN l.status <> 'revoked' AND l.status_until IS NOT NULL AND l.status_until <= NOW()
                    THEN COALESCE(l.status_before, 'active') ELSE l.status END AS level
          FROM licenses l
      )
      SELECT
        COUNT(*)                                                        AS total,
        COUNT(*) FILTER (WHERE level = 'active')                        AS active,
        COUNT(*) FILTER (WHERE level = 'readonly')                      AS readonly,
        COUNT(*) FILTER (WHERE level = 'restricted')                    AS restricted,
        COUNT(*) FILTER (WHERE level = 'suspended')                     AS suspended,
        COUNT(*) FILTER (WHERE level = 'revoked')                       AS revoked,
        COUNT(*) FILTER (WHERE status_until IS NOT NULL AND status_until > NOW()) AS timed,
        COUNT(*) FILTER (WHERE verification = 'unverified')             AS unverified,
        COUNT(*) FILTER (WHERE expires_at < NOW())                      AS expired,
        COUNT(*) FILTER (WHERE expires_at >= NOW()
                           AND expires_at < NOW() + INTERVAL '7 days')  AS expiring_7,
        COUNT(*) FILTER (WHERE expires_at >= NOW()
                           AND expires_at < NOW() + INTERVAL '30 days') AS expiring_soon
      FROM eff
    `);
    const devices = await db.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE stream_connected_at > NOW() - INTERVAL '${ONLINE_WINDOW_SECONDS} seconds') AS online,
             COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '1 day')   AS seen_day,
             COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days')  AS seen_week,
             COUNT(*) FILTER (WHERE last_seen_at <= NOW() - INTERVAL '7 days') AS stale
        FROM devices WHERE status = 'active'
    `);
    const versions = await db.query(`
      SELECT COALESCE(app_version, 'unknown') AS version, COUNT(*) AS n
        FROM devices WHERE status = 'active'
       GROUP BY 1 ORDER BY n DESC LIMIT 12
    `);
    const expiring = await db.query(
      LICENCE_SELECT + ` WHERE l.expires_at >= NOW() - INTERVAL '14 days'
                         AND l.expires_at < NOW() + INTERVAL '30 days' AND l.status <> 'revoked'
                       GROUP BY l.id ORDER BY l.expires_at ASC LIMIT 8`);
    const fleet = await loadFleet();
    return reply.send({
      success: true,
      data: {
        licenses: rows[0], devices: devices.rows[0], versions: versions.rows,
        expiring: expiring.rows.map((r) => presentLicense(r, fleet)),
        recent: await audit.recent(10, 0),
        fleet: { features: fleet.features, restrictions: fleet.restrictions }
      }
    });
  });

  // ── Licences ──────────────────────────────────────────────────────────────
  app.get('/licenses', { onRequest: requireAdmin }, async (request, reply) => {
    const q = request.query || {};
    const where = [];
    const params = [];

    const levelExpr = `(CASE WHEN l.status <> 'revoked' AND l.status_until IS NOT NULL AND l.status_until <= NOW()
                            THEN COALESCE(l.status_before, 'active') ELSE l.status END)`;
    if (q.level && access.LEVELS.includes(q.level)) { params.push(q.level); where.push(levelExpr + ' = $' + params.length); }
    if (q.status) { params.push(q.status); where.push('l.status = $' + params.length); }
    if (q.verification) { params.push(q.verification); where.push('l.verification = $' + params.length); }
    if (q.expiring === 'true') where.push("l.expires_at < NOW() + INTERVAL '30 days'");
    if (q.expired === 'true') where.push('l.expires_at < NOW()');
    if (q.timed === 'true') where.push('l.status_until IS NOT NULL AND l.status_until > NOW()');
    if (q.search) {
      params.push('%' + String(q.search).trim() + '%');
      const n = '$' + params.length;
      where.push('(l.hostel_name ILIKE ' + n + ' OR l.city ILIKE ' + n + ' OR l.contact_name ILIKE ' + n
        + ' OR l.contact_phone ILIKE ' + n + ' OR l.serial ILIKE ' + n + ' OR l.plan ILIKE ' + n + ')');
    }
    const having = [];
    if (q.online === 'true') having.push(`COUNT(d.id) FILTER (WHERE d.status = 'active'
      AND d.stream_connected_at > NOW() - INTERVAL '${ONLINE_WINDOW_SECONDS} seconds') > 0`);
    if (q.stale === 'true') having.push("(MAX(d.last_seen_at) IS NULL OR MAX(d.last_seen_at) < NOW() - INTERVAL '7 days')");

    const { rows } = await db.query(
      LICENCE_SELECT + `
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        GROUP BY l.id
        ${having.length ? 'HAVING ' + having.join(' AND ') : ''}
        ORDER BY l.expires_at ASC
        LIMIT 1000`,
      params
    );
    const fleet = await loadFleet();
    return reply.send({ success: true, data: rows.map((r) => presentLicense(r, fleet)) });
  });

  app.get('/licenses/:id', { onRequest: requireAdmin }, async (request, reply) => {
    const row = await licenceById(request.params.id);
    if (!row) return notFound(reply);
    const fleet = await loadFleet();
    const lic = presentLicense(row, fleet);
    const devices = await db.query(
      `SELECT id, machine_id, label, status, status_reason, app_version, os, first_seen_at, last_seen_at,
              last_revision_applied,
              (stream_connected_at > NOW() - INTERVAL '${ONLINE_WINDOW_SECONDS} seconds') AS online
         FROM devices WHERE license_id = $1 ORDER BY status ASC, last_seen_at DESC`,
      [request.params.id]
    );
    return reply.send({
      success: true,
      data: {
        license: lic,
        devices: devices.rows.map((d) => ({
          id: d.id,
          machineId: d.machine_id,
          machineShort: String(d.machine_id).slice(0, 12),
          label: d.label,
          status: d.status,
          statusReason: d.status_reason,
          appVersion: d.app_version,
          os: d.os,
          online: !!d.online,
          lastRevisionApplied: d.last_revision_applied,
          upToDate: d.last_revision_applied != null && Number(d.last_revision_applied) >= lic.revision,
          firstSeenAt: d.first_seen_at,
          lastSeenAt: d.last_seen_at
        })),
        audit: await audit.forTarget('license', request.params.id, 100)
      }
    });
  });

  /** Details the owner keeps about a customer — free text, no behaviour. */
  app.patch('/licenses/:id', {
    onRequest: requireAdmin,
    schema: { body: { type: 'object',
      properties: {
        hostelName: { type: 'string', maxLength: 200 }, contactName: { type: 'string', maxLength: 200 },
        contactPhone: { type: 'string', maxLength: 50 }, city: { type: 'string', maxLength: 100 },
        notes: { type: 'string', maxLength: 2000 }, plan: { type: 'string', maxLength: 60 }
      }, additionalProperties: false } }
  }, async (request, reply) => {
    const cols = { hostelName: 'hostel_name', contactName: 'contact_name', contactPhone: 'contact_phone',
                   city: 'city', notes: 'notes', plan: 'plan' };
    // Support staff may keep notes and nothing else.
    const allowed = request.admin.role === 'support' ? ['notes'] : Object.keys(cols);
    const sets = [];
    const params = [request.params.id];
    for (const k of allowed) {
      if (k in request.body) {
        params.push(request.body[k] === '' ? null : String(request.body[k]));
        sets.push(cols[k] + ' = $' + params.length);
      }
    }
    if (sets.length === 0) {
      return reply.code(400).send({ success: false, code: 'NOTHING_TO_UPDATE', message: 'No fields given.' });
    }
    const { rowCount } = await db.query('UPDATE licenses SET ' + sets.join(', ') + ' WHERE id = $1', params);
    if (!rowCount) return notFound(reply);
    await audit.record({
      user: request.admin, action: 'license.update', targetType: 'license',
      targetId: request.params.id, details: request.body, ip: request.ip
    });
    return reply.send({ success: true, data: presentLicense(await licenceById(request.params.id), await loadFleet()) });
  });

  /**
   * Set a level — the ladder. Optional `until` (or `hours`) makes it temporary:
   * the licence falls back to the level it had when the sweeper lifts it.
   *
   * Also carries verification, because both are administrative judgements
   * about a customer and one endpoint keeps the audit trail one story.
   */
  const statusSchema = {
    type: 'object',
    properties: {
      status: { type: 'string', enum: access.LEVELS.slice() },
      verification: { type: 'string', enum: ['unverified', 'verified', 'rejected'] },
      until: { type: 'string', minLength: 10, maxLength: 40 },
      hours: { type: 'integer', minimum: 1, maximum: 24 * 3650 },
      reason: { type: 'string', maxLength: 500 },
      password: { type: 'string', maxLength: 200 }
    },
    additionalProperties: false
  };

  /** Shared by the single and bulk routes. Returns an error string or null. */
  function planLevel(body, current, now) {
    const { status } = body;
    let until = null;
    if (body.until) {
      until = new Date(body.until);
      if (isNaN(until.getTime())) return { error: 'That is not a real date.' };
    } else if (body.hours) {
      until = new Date(now.getTime() + body.hours * HOUR_SECONDS * 1000);
    }
    if (until && until.getTime() <= now.getTime()) return { error: 'The end date must be in the future.' };
    if (until && (status === 'revoked' || status === 'active')) {
      return { error: status === 'revoked'
        ? 'Revoking is permanent — suspend with an end date for a temporary ban.'
        : 'Active needs no end date.' };
    }
    // What a timed level falls back to: the level in force now. Never revoked,
    // and never itself — a timed ban on top of a timed ban falls back to what
    // the first one would have.
    let before = null;
    if (until) {
      const eff = current ? access.effectiveLevel(current, now) : 'active';
      before = eff === status ? (current.status_before || 'active') : eff;
      if (!access.RESTORABLE.includes(before)) before = 'active';
    }
    return { until, before };
  }

  app.post('/licenses/:id/status', {
    onRequest: requireEditor, schema: { body: statusSchema }
  }, async (request, reply) => {
    const b = request.body;
    if (!b.status && !b.verification) {
      return reply.code(400).send({ success: false, code: 'NOTHING_TO_UPDATE', message: 'No change given.' });
    }
    const before = await db.query(
      'SELECT status, status_until, status_before, status_reason, verification FROM licenses WHERE id = $1',
      [request.params.id]);
    if (before.rows.length === 0) return notFound(reply);
    const cur = before.rows[0];

    // Revoking, and bringing a licence back from revoked, are the owner's alone
    // — and ask for the password again.
    const touchesRevoked = b.status === 'revoked' || (b.status && cur.status === 'revoked')
      || b.verification === 'rejected';
    if (touchesRevoked) {
      if (request.admin.role !== 'owner') {
        return reply.code(403).send({ success: false, code: 'FORBIDDEN',
          message: 'Only the owner can revoke or un-revoke a licence.' });
      }
      if (!(await confirmPassword(request, reply))) return;
    }

    const sets = [];
    const params = [request.params.id];
    let plan = null;
    if (b.status) {
      plan = planLevel(b, cur, new Date());
      if (plan.error) return reply.code(400).send({ success: false, code: 'INVALID_LEVEL', message: plan.error });
      params.push(b.status); sets.push('status = $' + params.length);
      params.push(plan.until ? plan.until.toISOString() : null); sets.push('status_until = $' + params.length);
      params.push(plan.before); sets.push('status_before = $' + params.length);
      params.push(b.status === 'active' ? null : (b.reason || null)); sets.push('status_reason = $' + params.length);
    }
    if (b.verification) { params.push(b.verification); sets.push('verification = $' + params.length); }

    await db.query('UPDATE licenses SET ' + sets.join(', ') + ' WHERE id = $1', params);

    await audit.record({
      user: request.admin, action: 'license.status', targetType: 'license',
      targetId: request.params.id,
      details: {
        from: { status: cur.status, until: cur.status_until, verification: cur.verification },
        to: { status: b.status, until: plan && plan.until ? plan.until.toISOString() : null,
              verification: b.verification },
        reason: b.reason || null
      },
      ip: request.ip
    });

    return reply.send({ success: true, data: presentLicense(await licenceById(request.params.id), await loadFleet()) });
  });

  /**
   * Expiry — extend OR shorten. `expiresAt` sets a date; `days` moves it by a
   * signed number of days from the current expiry; `addMonths` (kept for the
   * old portal) extends from the later of today and the current expiry.
   *
   * Reaches a customer only when their app connects. The response says whether
   * this licence has ever connected, so the portal can say which case it is.
   */
  async function changeExpiry(request, reply, action) {
    const { expiresAt, days, addMonths, reason } = request.body;
    const current = await db.query('SELECT expires_at FROM licenses WHERE id = $1', [request.params.id]);
    if (current.rows.length === 0) return notFound(reply);
    const from = new Date(current.rows[0].expires_at);

    let next;
    if (expiresAt) {
      next = new Date(expiresAt);
      if (isNaN(next.getTime())) {
        return reply.code(400).send({ success: false, code: 'INVALID_DATE', message: 'That is not a real date.' });
      }
      // A bare date means the END of that day, as a key's expiry does.
      if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) next = new Date(expiresAt + 'T23:59:59.999Z');
    } else if (Number.isInteger(days) && days !== 0) {
      next = new Date(from.getTime() + days * DAY_MS);
    } else if (addMonths) {
      // Extend from whichever is later: a licence that lapsed three months ago
      // should get its full period from today, not have it swallowed by the gap.
      const base = new Date(Math.max(Date.now(), from.getTime()));
      next = new Date(base);
      next.setMonth(next.getMonth() + addMonths);
    } else {
      return reply.code(400).send({
        success: false, code: 'NOTHING_TO_UPDATE', message: 'Give a date, a number of days or a number of months.'
      });
    }

    await db.query('UPDATE licenses SET expires_at = $2 WHERE id = $1', [request.params.id, next.toISOString()]);
    const lastSeen = await db.query('SELECT MAX(last_seen_at) AS seen FROM devices WHERE license_id = $1',
      [request.params.id]);

    await audit.record({
      user: request.admin, action, targetType: 'license', targetId: request.params.id,
      details: { from: from.toISOString(), to: next.toISOString(),
                 direction: next < from ? 'shorten' : 'extend', reason: reason || null },
      ip: request.ip
    });

    return reply.send({
      success: true,
      data: {
        license: presentLicense(await licenceById(request.params.id), await loadFleet()),
        // The portal turns this into the sentence the admin needs to read.
        reachesCustomerOnline: !!lastSeen.rows[0].seen,
        lastSeenAt: lastSeen.rows[0].seen
      }
    });
  }

  const expirySchema = {
    type: 'object',
    properties: {
      expiresAt: { type: 'string', minLength: 10, maxLength: 30 },
      days: { type: 'integer', minimum: -3650, maximum: 3650 },
      addMonths: { type: 'integer', minimum: 1, maximum: 120 },
      reason: { type: 'string', maxLength: 500 }
    },
    additionalProperties: false
  };
  app.post('/licenses/:id/expiry', { onRequest: requireEditor, schema: { body: expirySchema } },
    (request, reply) => changeExpiry(request, reply, 'license.expiry'));
  app.post('/licenses/:id/renew', { onRequest: requireEditor, schema: { body: expirySchema } },
    (request, reply) => changeExpiry(request, reply, 'license.renew'));

  app.post('/licenses/:id/devices-limit', {
    onRequest: requireEditor,
    schema: {
      body: {
        type: 'object',
        properties: { maxDevices: { type: ['integer', 'null'], minimum: 1, maximum: 1000 } },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { rowCount } = await db.query('UPDATE licenses SET max_devices = $2 WHERE id = $1',
      [request.params.id, request.body.maxDevices === undefined ? null : request.body.maxDevices]);
    if (!rowCount) return notFound(reply);
    await audit.record({
      user: request.admin, action: 'license.device_limit', targetType: 'license',
      targetId: request.params.id, details: { maxDevices: request.body.maxDevices }, ip: request.ip
    });
    return reply.send({ success: true, data: presentLicense(await licenceById(request.params.id), await loadFleet()) });
  });

  /** Feature flags. Unknown keys are refused rather than stored. */
  app.put('/licenses/:id/features', { onRequest: requireEditor }, async (request, reply) => {
    const checked = features.validateOverrides(request.body && request.body.features);
    if (!checked.ok) {
      return reply.code(400).send({ success: false, code: 'INVALID_FEATURES', message: checked.error });
    }
    const before = await db.query('SELECT features FROM licenses WHERE id = $1', [request.params.id]);
    if (before.rows.length === 0) return notFound(reply);
    await db.query('UPDATE licenses SET features = $2 WHERE id = $1',
      [request.params.id, JSON.stringify(checked.value)]);
    await audit.record({
      user: request.admin, action: 'license.features', targetType: 'license',
      targetId: request.params.id,
      details: { from: before.rows[0].features, to: checked.value }, ip: request.ip
    });
    return reply.send({ success: true, data: presentLicense(await licenceById(request.params.id), await loadFleet()) });
  });

  /** Data entry / printing / exporting, switched off one at a time. */
  app.put('/licenses/:id/restrictions', { onRequest: requireEditor }, async (request, reply) => {
    const checked = access.validateRestrictions(request.body && request.body.restrictions);
    if (!checked.ok) {
      return reply.code(400).send({ success: false, code: 'INVALID_RESTRICTIONS', message: checked.error });
    }
    const before = await db.query('SELECT restrictions FROM licenses WHERE id = $1', [request.params.id]);
    if (before.rows.length === 0) return notFound(reply);
    await db.query('UPDATE licenses SET restrictions = $2 WHERE id = $1',
      [request.params.id, JSON.stringify(checked.value)]);
    await audit.record({
      user: request.admin, action: 'license.restrictions', targetType: 'license',
      targetId: request.params.id,
      details: { from: before.rows[0].restrictions, to: checked.value, reason: request.body.reason || null },
      ip: request.ip
    });
    return reply.send({ success: true, data: presentLicense(await licenceById(request.params.id), await loadFleet()) });
  });

  /** Re-send: nudge every stream for this licence to re-fetch, with no change. */
  app.post('/licenses/:id/push', { onRequest: requireEditor }, async (request, reply) => {
    const { rows } = await db.query('SELECT revision FROM licenses WHERE id = $1', [request.params.id]);
    if (!rows.length) return notFound(reply);
    await db.query("SELECT pg_notify('cp_changes', $1)", ['L:' + request.params.id + ':' + rows[0].revision]);
    return reply.send({ success: true, data: {} });
  });

  // ── Bulk ──────────────────────────────────────────────────────────────────
  /**
   * One action across many licences, in ONE transaction: either every hostel
   * is changed or none is. A half-applied fleet change is the hardest state to
   * explain on the phone.
   */
  app.post('/bulk', {
    onRequest: requireEditor,
    schema: {
      body: {
        type: 'object',
        required: ['ids', 'action'],
        properties: {
          ids: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string', format: 'uuid' } },
          action: { type: 'string', enum: ['status', 'expiry', 'features', 'restrictions'] },
          status: { type: 'string', enum: access.LEVELS.slice() },
          until: { type: 'string', maxLength: 40 },
          hours: { type: 'integer', minimum: 1, maximum: 24 * 3650 },
          days: { type: 'integer', minimum: -3650, maximum: 3650 },
          features: { type: 'object' },
          restrictions: { type: 'object' },
          reason: { type: 'string', maxLength: 500 },
          password: { type: 'string', maxLength: 200 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const b = request.body;
    const ids = Array.from(new Set(b.ids));
    if (b.action === 'status' && !b.status) {
      return reply.code(400).send({ success: false, code: 'NOTHING_TO_UPDATE', message: 'Pick a level.' });
    }
    if (b.action === 'status' && b.status === 'revoked' && request.admin.role !== 'owner') {
      return reply.code(403).send({ success: false, code: 'FORBIDDEN', message: 'Only the owner can revoke.' });
    }
    // A bulk change is always a confirmed one.
    if (!(await confirmPassword(request, reply))) return;

    let featuresValue = null, restrictionsValue = null;
    if (b.action === 'features') {
      const c = features.validateOverrides(b.features);
      if (!c.ok) return reply.code(400).send({ success: false, code: 'INVALID_FEATURES', message: c.error });
      featuresValue = c.value;
    }
    if (b.action === 'restrictions') {
      const c = access.validateRestrictions(b.restrictions);
      if (!c.ok) return reply.code(400).send({ success: false, code: 'INVALID_RESTRICTIONS', message: c.error });
      restrictionsValue = c.value;
    }
    if (b.action === 'expiry' && !b.days) {
      return reply.code(400).send({ success: false, code: 'NOTHING_TO_UPDATE', message: 'Give a number of days.' });
    }

    let failure = null;
    const changed = await db.withTransaction(async (client) => {
      const now = new Date();
      const { rows } = await client.query(
        `SELECT id, status, status_until, status_before, expires_at, features, restrictions
           FROM licenses WHERE id = ANY($1::uuid[]) FOR UPDATE`, [ids]);
      for (const cur of rows) {
        if (b.action === 'status') {
          // Un-revoking in bulk is refused outright: that decision is made one
          // hostel at a time.
          if (cur.status === 'revoked' && b.status !== 'revoked') continue;
          const plan = planLevel(b, cur, now);
          if (plan.error) { failure = plan.error; throw new Error('abort'); }
          await client.query(
            `UPDATE licenses SET status = $2, status_until = $3, status_before = $4, status_reason = $5 WHERE id = $1`,
            [cur.id, b.status, plan.until ? plan.until.toISOString() : null, plan.before,
             b.status === 'active' ? null : (b.reason || null)]);
        } else if (b.action === 'expiry') {
          const next = new Date(new Date(cur.expires_at).getTime() + b.days * DAY_MS);
          await client.query('UPDATE licenses SET expires_at = $2 WHERE id = $1', [cur.id, next.toISOString()]);
        } else if (b.action === 'features') {
          const merged = Object.assign({}, cur.features || {}, featuresValue);
          await client.query('UPDATE licenses SET features = $2 WHERE id = $1', [cur.id, JSON.stringify(merged)]);
        } else if (b.action === 'restrictions') {
          await client.query('UPDATE licenses SET restrictions = $2 WHERE id = $1',
            [cur.id, JSON.stringify(restrictionsValue)]);
        }
        await audit.record({
          user: request.admin, action: 'license.bulk_' + b.action, targetType: 'license', targetId: cur.id,
          details: { status: b.status, until: b.until, hours: b.hours, days: b.days,
                     features: featuresValue, restrictions: restrictionsValue, reason: b.reason || null,
                     batch: ids.length },
          ip: request.ip
        }, client);
      }
      return rows.length;
    }).catch((e) => { if (failure) return null; throw e; });

    if (failure) return reply.code(400).send({ success: false, code: 'INVALID_LEVEL', message: failure });
    return reply.send({ success: true, data: { changed } });
  });

  // ── Fleet ─────────────────────────────────────────────────────────────────
  app.get('/fleet', { onRequest: requireAdmin }, async (_request, reply) => {
    const f = await loadFleet();
    return reply.send({ success: true, data: {
      features: f.features || {}, restrictions: f.restrictions || {}, revision: f.revision,
      updatedAt: f.updated_at, catalogue: features.CATALOGUE, restrictionCatalogue: access.RESTRICTION_LABELS
    } });
  });

  /**
   * Every hostel at once. Owner only, password again, audited with before and
   * after. Reaches every connected app in seconds through the fleet NOTIFY.
   */
  app.put('/fleet', {
    onRequest: requireOwner,
    schema: { body: { type: 'object', required: ['password'],
      properties: { features: { type: 'object' }, restrictions: { type: 'object' },
                    reason: { type: 'string', maxLength: 500 }, password: { type: 'string', maxLength: 200 } },
      additionalProperties: false } }
  }, async (request, reply) => {
    if (!(await confirmPassword(request, reply))) return;
    const fc = features.validateOverrides(request.body.features || {});
    if (!fc.ok) return reply.code(400).send({ success: false, code: 'INVALID_FEATURES', message: fc.error });
    const rc = access.validateRestrictions(request.body.restrictions || {});
    if (!rc.ok) return reply.code(400).send({ success: false, code: 'INVALID_RESTRICTIONS', message: rc.error });
    const before = await loadFleet();
    await db.query('UPDATE fleet_settings SET features = $1, restrictions = $2 WHERE id',
      [JSON.stringify(fc.value), JSON.stringify(rc.value)]);
    await audit.record({
      user: request.admin, action: 'fleet.update', targetType: 'fleet',
      details: { from: { features: before.features, restrictions: before.restrictions },
                 to: { features: fc.value, restrictions: rc.value }, reason: request.body.reason || null },
      ip: request.ip
    });
    const f = await loadFleet();
    return reply.send({ success: true, data: { features: f.features, restrictions: f.restrictions, revision: f.revision } });
  });

  // ── Devices ───────────────────────────────────────────────────────────────
  /**
   * `deactivated` is RELEASE: the PC leaves the licence, its seat is free for a
   * new PC, and the released PC is LOCKED at its next sync (it still
   * authenticates, so it can be told). `active` puts it back.
   */
  app.post('/devices/:id/status', {
    onRequest: requireEditor,
    schema: {
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
      const { rows } = await client.query(
        `UPDATE devices SET status = $2, status_reason = $3 WHERE id = $1
         RETURNING id, license_id, machine_id, status`,
        [request.params.id, request.body.status,
         request.body.status === 'deactivated' ? (request.body.reason || null) : null]
      );
      if (rows.length === 0) return { none: true };
      // Re-activating must respect the seat limit, or "release, activate the new
      // PC, re-activate the old one" puts two PCs on a one-PC licence.
      if (request.body.status === 'active') {
        const lim = await client.query(
          `SELECT l.max_devices,
                  (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') AS n
             FROM licenses l WHERE l.id = $1`, [rows[0].license_id]);
        const l = lim.rows[0];
        if (l.max_devices !== null && l.n > l.max_devices) {
          throw Object.assign(new Error('This licence already has ' + l.max_devices
            + ' active computer' + (l.max_devices === 1 ? '' : 's') + '. Release one first, or raise the limit.'),
          { statusCode: 409, code: 'DEVICE_LIMIT_REACHED' });
        }
      }
      return rows[0];
    });

    if (out.none) return notFound(reply, 'device');
    await audit.record({
      user: request.admin, action: out.status === 'deactivated' ? 'device.release' : 'device.reactivate',
      targetType: 'license', targetId: out.license_id,
      details: { deviceId: out.id, machineId: out.machine_id, status: out.status,
                 reason: request.body.reason || null },
      ip: request.ip
    });
    return reply.send({ success: true, data: { id: out.id, status: out.status } });
  });

  app.patch('/devices/:id', { onRequest: requireEditor }, async (request, reply) => {
    const label = request.body && request.body.label;
    const { rows } = await db.query(
      'UPDATE devices SET label = $2 WHERE id = $1 RETURNING id, label',
      [request.params.id, label ? String(label).slice(0, 120) : null]
    );
    if (rows.length === 0) return notFound(reply, 'device');
    return reply.send({ success: true, data: rows[0] });
  });

  // ── Issuing keys ──────────────────────────────────────────────────────────
  /**
   * Register a hostel and mint its key — the licence row is created FIRST,
   * with the customer's details, plan, device limit, features and restrictions,
   * so the hostel exists in the portal before anyone types the key.
   *
   * Every key is v5 (owner, 2026-09-24): activated online once, which binds it
   * to one PC (decision D3). v4 keys are NO LONGER ISSUED — their checksum
   * secret ships inside the app and the source was public, so a v4 key can be
   * forged; a v5 key cannot activate unless this server issued it. Keys already
   * sold keep working. A request for 4 is refused with V4_RETIRED rather than
   * quietly upgraded, so a caller that asked for 4 learns why it did not get one.
   *
   * The key is shown ONCE. Only its fingerprint is stored.
   */
  app.post('/issue-key', {
    onRequest: requireEditor,
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
          notes: { type: 'string', maxLength: 2000 },
          plan: { type: 'string', maxLength: 60 },
          maxDevices: { type: 'integer', minimum: 1, maximum: 1000 },
          keyVersion: { type: 'integer', enum: [4, 5] },
          features: { type: 'object' },
          restrictions: { type: 'object' },
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
    const b = request.body;

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.expiresOn);
    if (!m) {
      return reply.code(400).send({ success: false, code: 'INVALID_DATE', message: 'Use YYYY-MM-DD.' });
    }
    const year = +m[1], month = +m[2], day = +m[3];
    // Reject 31 April rather than let Date roll it forward to 1 May.
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      return reply.code(400).send({ success: false, code: 'INVALID_DATE', message: 'That is not a real date.' });
    }
    const fc = features.validateOverrides(b.features || {});
    if (!fc.ok) return reply.code(400).send({ success: false, code: 'INVALID_FEATURES', message: fc.error });
    const rc = access.validateRestrictions(b.restrictions || {});
    if (!rc.ok) return reply.code(400).send({ success: false, code: 'INVALID_RESTRICTIONS', message: rc.error });

    if (b.keyVersion === 4) {
      return reply.code(400).send({
        success: false, code: 'V4_RETIRED',
        message: 'v4 keys are no longer issued. Issue a v5 key: it needs internet for the first activation and Hostyllo Offline 6.0.0 or later.'
      });
    }
    const version = 5;
    const key = keys.buildLicenseKey(year, month, day, cfg.legacyKeySecret, undefined, version);
    const parsed = keys.parseVerified(key, cfg.legacyKeySecret);
    const expiry = keys.licenseKeyExpiry(key);

    const { rows } = await db.query(
      `INSERT INTO licenses
         (key_fingerprint, key_version, key_expiry_part, serial, key_expires_at, expires_at,
          max_devices, verification, hostel_name, contact_name, contact_phone, city, notes, plan,
          features, restrictions)
       VALUES ($1,$2,$3,$4,$5,$5,$6,'verified',$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        keys.keyFingerprint(parsed), parsed.version, parsed.expPart, parsed.serial,
        expiry.toISOString(),
        b.maxDevices || keys.defaultMaxDevices(parsed),
        b.hostelName || null, b.contactName || null, b.contactPhone || null, b.city || null,
        b.notes || null, b.plan || null, JSON.stringify(fc.value), JSON.stringify(rc.value)
      ]
    );

    await audit.record({
      user: request.admin, action: 'license.issue', targetType: 'license', targetId: rows[0].id,
      details: {
        expiresOn: b.expiresOn, serial: parsed.serial, keyVersion: parsed.version,
        hostelName: b.hostelName || null, plan: b.plan || null, renewalOf: b.renewalOf || null
      },
      ip: request.ip
    });

    return reply.code(201).send({
      success: true,
      data: {
        // Shown once. Send it to the customer now; it cannot be recovered.
        key,
        license: presentLicense(await licenceById(rows[0].id), await loadFleet())
      }
    });
  });

  // ── Audit ─────────────────────────────────────────────────────────────────
  app.get('/audit', { onRequest: requireAdmin }, async (request, reply) => {
    const q = request.query || {};
    const limit = Math.min(parseInt(q.limit || '100', 10) || 100, 500);
    const offset = parseInt(q.offset || '0', 10) || 0;
    const where = [];
    const params = [];
    if (q.action) { params.push(String(q.action) + '%'); where.push('a.action LIKE $' + params.length); }
    if (q.actor) { params.push('%' + String(q.actor) + '%'); where.push('a.actor ILIKE $' + params.length); }
    params.push(limit); const lim = '$' + params.length;
    params.push(offset); const off = '$' + params.length;
    const { rows } = await db.query(
      `SELECT a.actor, a.action, a.target_type, a.target_id, a.details, a.ip, a.created_at,
              l.hostel_name
         FROM audit_log a
         LEFT JOIN licenses l ON a.target_type = 'license' AND l.id = a.target_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.created_at DESC
        LIMIT ${lim} OFFSET ${off}`, params);
    return reply.send({ success: true, data: rows });
  });

  // ── System ────────────────────────────────────────────────────────────────
  app.get('/system', { onRequest: requireAdmin }, async (_request, reply) => {
    const started = Date.now();
    const dbOk = await db.healthCheck();
    const dbMs = Date.now() - started;
    const rt = app.realtime;
    let online = 0;
    try {
      const r = await db.query(`SELECT COUNT(*) AS n FROM devices
        WHERE stream_connected_at > NOW() - INTERVAL '${ONLINE_WINDOW_SECONDS} seconds'`);
      online = r.rows[0].n;
    } catch (_) {}
    return reply.send({ success: true, data: {
      db: dbOk ? 'ok' : 'down', dbLatencyMs: dbMs,
      signing: cfg.signingConfigured ? 'ok' : 'not_configured',
      keyIssuing: cfg.legacyKeySecret ? 'ok' : 'not_configured',
      realtime: rt && rt.listening ? 'listening' : 'not_listening',
      streamsThisInstance: rt ? rt.streams.size : 0,
      devicesOnline: online,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      env: cfg.env,
      policy: ent.policy()
    } });
  });

  // ── Admin users ───────────────────────────────────────────────────────────
  app.get('/admins', { onRequest: requireOwner }, async (_request, reply) => {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.is_active, u.totp_enabled, u.last_login_at, u.created_at,
              (SELECT COUNT(*) FROM admin_sessions s WHERE s.admin_user_id = u.id AND s.expires_at > NOW()) AS sessions
         FROM admin_users u ORDER BY u.created_at ASC`);
    return reply.send({ success: true, data: rows });
  });

  app.post('/admins', {
    onRequest: requireOwner,
    schema: { body: { type: 'object', required: ['email', 'role', 'tempPassword', 'password'],
      properties: {
        email: { type: 'string', maxLength: 200 }, name: { type: 'string', maxLength: 200 },
        role: { type: 'string', enum: ['owner', 'admin', 'support'] },
        tempPassword: { type: 'string', minLength: 12, maxLength: 200 },
        password: { type: 'string', maxLength: 200 }
      }, additionalProperties: false } }
  }, async (request, reply) => {
    if (!(await confirmPassword(request, reply))) return;
    const email = String(request.body.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return reply.code(400).send({ success: false, code: 'INVALID_EMAIL', message: 'That is not an email address.' });
    }
    const hash = await bcrypt.hash(String(request.body.tempPassword), 12);
    let row;
    try {
      const { rows } = await db.query(
        `INSERT INTO admin_users (email, name, role, password_hash) VALUES ($1,$2,$3,$4)
         RETURNING id, email, name, role, is_active`,
        [email, request.body.name || null, request.body.role, hash]);
      row = rows[0];
    } catch (e) {
      if (e.code === '23505') {
        return reply.code(409).send({ success: false, code: 'EXISTS', message: 'That email already has an account.' });
      }
      throw e;
    }
    await audit.record({ user: request.admin, action: 'admin.create', targetType: 'admin_user',
      targetId: row.id, details: { email, role: row.role }, ip: request.ip });
    return reply.code(201).send({ success: true, data: row });
  });

  app.patch('/admins/:id', {
    onRequest: requireOwner,
    schema: { body: { type: 'object', required: ['password'],
      properties: {
        role: { type: 'string', enum: ['owner', 'admin', 'support'] },
        isActive: { type: 'boolean' },
        signOut: { type: 'boolean' },
        resetTotp: { type: 'boolean' },
        password: { type: 'string', maxLength: 200 }
      }, additionalProperties: false } }
  }, async (request, reply) => {
    if (!(await confirmPassword(request, reply))) return;
    const b = request.body;
    const target = await db.query('SELECT id, role, is_active FROM admin_users WHERE id = $1', [request.params.id]);
    if (!target.rows.length) return notFound(reply, 'admin');
    const demotingOwner = target.rows[0].role === 'owner'
      && ((b.role && b.role !== 'owner') || b.isActive === false);
    if (demotingOwner) {
      const owners = await db.query("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND is_active");
      if (owners.rows[0].n <= 1) {
        return reply.code(409).send({ success: false, code: 'LAST_OWNER',
          message: 'This is the only active owner. Make someone else owner first.' });
      }
    }
    const sets = [];
    const params = [request.params.id];
    if (b.role) { params.push(b.role); sets.push('role = $' + params.length); }
    if (b.isActive !== undefined) { params.push(b.isActive); sets.push('is_active = $' + params.length); }
    if (b.resetTotp) sets.push('totp_enabled = FALSE, totp_secret = NULL, totp_pending = NULL');
    if (sets.length) await db.query('UPDATE admin_users SET ' + sets.join(', ') + ' WHERE id = $1', params);
    if (b.signOut || b.isActive === false || b.role) await sessions.destroyAllFor(request.params.id);
    await audit.record({ user: request.admin, action: 'admin.update', targetType: 'admin_user',
      targetId: request.params.id,
      details: { role: b.role, isActive: b.isActive, signOut: !!b.signOut, resetTotp: !!b.resetTotp },
      ip: request.ip });
    return reply.send({ success: true, data: {} });
  });

  // ── Preview ───────────────────────────────────────────────────────────────
  /**
   * What this licence's entitlement says right now, without minting one for a
   * device. Answers "what will the customer actually see?" — the question an
   * admin has immediately after changing anything on this page.
   */
  app.get('/licenses/:id/preview', { onRequest: requireAdmin }, async (request, reply) => {
    const { rows } = await db.query('SELECT * FROM licenses WHERE id = $1', [request.params.id]);
    if (rows.length === 0) return notFound(reply);
    const l = rows[0];
    const claims = ent.buildClaims({
      deviceId: '(preview)', licenseId: l.id, machineId: '(preview)',
      licence: {
        status: l.status, status_until: l.status_until, status_before: l.status_before,
        status_reason: l.status_reason, verification: l.verification,
        expiresAt: new Date(l.expires_at), features: l.features,
        restrictions: l.restrictions, revision: l.revision
      },
      fleet: await loadFleet()
    });
    return reply.send({
      success: true,
      data: {
        status: claims.status, level: claims.level, features: claims.features,
        restrictions: claims.restrictions, reason: claims.reason, until: claims.until,
        revision: claims.revision, policy: claims.policy
      }
    });
  });
}

module.exports = { adminRoutes, presentLicense };
