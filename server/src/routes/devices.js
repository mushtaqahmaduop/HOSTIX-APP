// ════════════════════════════════════════════════════════════════════════════
// /v1/* — the surface the desktop app talks to
//
// Four endpoints, all machine-facing. Nothing here serves a human; the admin
// portal is a separate router with a separate authentication model, and the two
// must never share a credential.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const db = require('../db');
const keys = require('../lib/keys');
const ent = require('../lib/entitlement');

const HOUR_SECONDS = 3600;

/** Rate limit in Postgres — see the note in devices/register. */
async function bump(bucket, ip, windowSeconds) {
  const { rows } = await db.query(
    `INSERT INTO rate_limits (bucket, ip, window_start, hits)
     VALUES ($1, $2, NOW(), 1)
     ON CONFLICT (bucket, ip) DO UPDATE
       SET hits = CASE
             WHEN rate_limits.window_start < NOW() - ($3 || ' seconds')::interval THEN 1
             ELSE rate_limits.hits + 1
           END,
           window_start = CASE
             WHEN rate_limits.window_start < NOW() - ($3 || ' seconds')::interval THEN NOW()
             ELSE rate_limits.window_start
           END
     RETURNING hits`,
    [bucket, ip, String(windowSeconds)]
  );
  return rows[0].hits;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function deviceRoutes(app) {

  // ── Reachability ──────────────────────────────────────────────────────────
  /**
   * GET /v1/healthz — "is the control plane there?"
   *
   * Feeds API_REACHABLE, one of the four connectivity states the app tracks
   * separately, because a hostel on working WiFi with a dead control plane is a
   * different situation from a hostel with no internet.
   *
   * IT MUST NOT TOUCH THE DATABASE. Every install polls this every 60 seconds;
   * a health check that probes Postgres would spend ~50 round-trips a minute
   * answering a question that does not need the database. Measured on the
   * previous implementation of this idea: 880ms with a DB+cache probe against
   * 10.5ms without. The client is asking whether this process is serving HTTP.
   */
  app.get('/healthz', async (_request, reply) => {
    return reply.code(200).send({
      success: true,
      data: {
        service: 'control-plane',
        v: 1,
        // Diagnostics only, NOT a trust anchor. This response is unauthenticated
        // and unsigned, so anything on the path can change it. The only server
        // time the app may trust is `issuedAt` inside a signed entitlement.
        time: new Date().toISOString()
      }
    });
  });

  // ── Registration ──────────────────────────────────────────────────────────
  /**
   * POST /v1/devices/register — first contact.
   *
   * Where a desktop customer acquires an identity. Before this, a licence key
   * identified nobody: it carries an expiry and nothing about who bought it.
   *
   * An unrecognised key is ADMITTED and flagged `unverified`, not refused —
   * ~50 paying hostels hold keys this database has no record of. It is not
   * trusted either: the checksum's secret ships inside app.asar, so it filters
   * typos and nothing more. Trust is the owner confirming the licence in the
   * portal.
   */
  app.post('/devices/register', {
    schema: {
      body: {
        type: 'object',
        required: ['licenseKey', 'machineId'],
        properties: {
          licenseKey: { type: 'string', minLength: 21, maxLength: 32 },
          machineId: { type: 'string', minLength: 64, maxLength: 64 },
          appVersion: { type: 'string', maxLength: 32 },
          os: { type: 'string', maxLength: 64 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { licenseKey, machineId, appVersion, os } = request.body;

    const secret = app.config.legacyKeySecret;
    if (!secret) {
      return reply.code(503).send({
        success: false, code: 'SERVICE_NOT_CONFIGURED',
        message: 'Device registration is not enabled on this server.'
      });
    }

    // Rate limited per IP. Registration is a once-per-machine event, so a
    // generous ceiling still leaves no room for grinding keys at a public
    // endpoint. Not applied to /healthz, which does no work — but this writes.
    if (await bump('register', request.ip, HOUR_SECONDS) > 20) {
      return reply.code(429).send({
        success: false, code: 'RATE_LIMIT',
        message: 'Too many registration attempts. Try again later.'
      });
    }

    const parsed = keys.parseLicenseKey(licenseKey);
    if (!parsed) {
      return reply.code(400).send({
        success: false, code: 'INVALID_KEY_FORMAT',
        message: 'That licence key is not in a recognised format.'
      });
    }
    if (!keys.validateKeyChecksum(parsed.key, secret)) {
      return reply.code(400).send({
        success: false, code: 'INVALID_KEY',
        message: 'That licence key is not valid. Check it and try again.'
      });
    }

    // Every machine whose hardware fingerprinting failed sends the SAME
    // placeholder. Admitting it would collide them all onto one device row,
    // rotating each other's secrets forever, so it is refused with a message
    // that says which problem this is.
    if (keys.isFingerprintFailure(machineId)) {
      return reply.code(400).send({
        success: false, code: 'MACHINE_ID_UNAVAILABLE',
        message: 'This computer could not be identified. Contact support with your licence key.'
      });
    }
    if (!keys.isValidMachineId(machineId)) {
      return reply.code(400).send({
        success: false, code: 'INVALID_MACHINE_ID',
        message: 'This computer could not be identified.'
      });
    }

    const expiresAt = keys.licenseKeyExpiry(parsed.key);
    if (!expiresAt) {
      return reply.code(400).send({
        success: false, code: 'INVALID_KEY',
        message: 'That licence key is not valid. Check it and try again.'
      });
    }

    // Returned once and never again — only its hash is stored.
    const deviceSecret = keys.generateDeviceSecret();

    const outcome = await db.withTransaction(async (client) => {
      // Upsert rather than select-then-insert: two machines registering the
      // same v3 key in the same second would otherwise race to INSERT and one
      // would take a unique violation.
      const lic = await client.query(
        // key_expires_at is written once and never touched again; expires_at is what the
        // portal moves on renewal. On a re-registration the ON CONFLICT deliberately leaves
        // BOTH alone — a customer re-typing their original key must not silently undo an
        // extension the owner granted.
        `INSERT INTO licenses
           (key_fingerprint, key_version, key_expiry_part, serial,
            key_expires_at, expires_at, max_devices)
         VALUES ($1, $2, $3, $4, $5, $5, $6)
         ON CONFLICT (key_fingerprint) DO UPDATE SET updated_at = NOW()
         RETURNING id, status, verification, max_devices, expires_at`,
        [
          keys.keyFingerprint(parsed), parsed.version, parsed.expPart,
          parsed.serial || null, expiresAt.toISOString(), keys.defaultMaxDevices(parsed)
        ]
      );
      const license = lic.rows[0];

      // Serialise concurrent registrations for this licence, so the device cap
      // below cannot be raced past by two machines counting at the same time.
      await client.query('SELECT id FROM licenses WHERE id = $1 FOR UPDATE', [license.id]);

      if (license.status === 'revoked') return { kind: 'revoked' };

      // A SUSPENDED licence still registers. The customer needs to be told why
      // their app is read-only, and that answer arrives in the entitlement —
      // refusing here would leave the app saying nothing at all.

      if (license.max_devices !== null) {
        const count = await client.query(
          `SELECT COUNT(*) AS n FROM devices
            WHERE license_id = $1 AND status = 'active' AND machine_id <> $2`,
          [license.id, machineId]
        );
        if (count.rows[0].n >= license.max_devices) {
          return { kind: 'device_limit', max: license.max_devices };
        }
      }

      // Re-registering the same machine rotates its secret rather than adding a
      // row. A reinstall or a wiped profile is the common case and must not
      // need a support ticket.
      const dev = await client.query(
        `INSERT INTO devices (license_id, machine_id, secret_hash, app_version, os, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (license_id, machine_id) DO UPDATE
           SET secret_hash = EXCLUDED.secret_hash,
               app_version = EXCLUDED.app_version,
               os          = EXCLUDED.os,
               status      = 'active',
               last_seen_at = NOW()
         RETURNING id`,
        [license.id, machineId, keys.hashDeviceSecret(deviceSecret), appVersion || null, os || null]
      );

      // Rotating the secret must invalidate whatever sessions the old one
      // bought, or a stolen secret keeps working for its full token lifetime
      // after the customer re-registers to get rid of it.
      await client.query('DELETE FROM device_tokens WHERE device_id = $1', [dev.rows[0].id]);

      return {
        kind: 'ok',
        deviceId: dev.rows[0].id,
        licenseId: license.id,
        status: license.status,
        verification: license.verification,
        expiresAt: license.expires_at,
        maxDevices: license.max_devices
      };
    });

    if (outcome.kind === 'revoked') {
      return reply.code(403).send({
        success: false, code: 'LICENSE_REVOKED',
        message: 'This licence has been revoked. Contact support.'
      });
    }
    if (outcome.kind === 'device_limit') {
      return reply.code(409).send({
        success: false, code: 'DEVICE_LIMIT_REACHED',
        message: outcome.max === 1
          ? 'This licence is already active on another computer. Deactivate it there first.'
          : 'This licence allows ' + outcome.max + ' computers and all of them are in use.'
      });
    }

    return reply.code(201).send({
      success: true,
      data: {
        deviceId: outcome.deviceId,
        licenseId: outcome.licenseId,
        deviceSecret,                       // shown once; only its hash is stored
        licenseStatus: outcome.status,
        verification: outcome.verification,
        expiresAt: new Date(outcome.expiresAt).toISOString(),
        maxDevices: outcome.maxDevices
      }
    });
  });

  // ── Token exchange ────────────────────────────────────────────────────────
  /**
   * POST /v1/devices/token — trade the device secret for a short-lived token.
   *
   * The secret is long-lived and sits on the customer's disk, so it should
   * cross the wire as rarely as possible. Everything after this uses the token.
   */
  app.post('/devices/token', {
    schema: {
      body: {
        type: 'object',
        required: ['deviceId', 'deviceSecret'],
        properties: {
          deviceId: { type: 'string', format: 'uuid' },
          deviceSecret: { type: 'string', minLength: 20, maxLength: 128 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { deviceId, deviceSecret } = request.body;

    if (await bump('token', request.ip, HOUR_SECONDS) > 60) {
      return reply.code(429).send({
        success: false, code: 'RATE_LIMIT',
        message: 'Too many token requests. Try again later.'
      });
    }

    const { rows } = await db.query(
      `SELECT d.id, d.secret_hash, d.status AS device_status, l.status AS license_status
         FROM devices d JOIN licenses l ON l.id = d.license_id
        WHERE d.id = $1`,
      [deviceId]
    );

    // One code and one message for every failure below — unknown device, wrong
    // secret, deactivated device, revoked licence. Telling them apart would let
    // anyone holding a device id learn whether it exists and whether its
    // licence is live.
    const deny = () => reply.code(401).send({
      success: false, code: 'DEVICE_UNAUTHORIZED',
      message: 'This device could not be authenticated. Re-activate it from the app.'
    });

    if (rows.length === 0) {
      keys.hashDeviceSecret(deviceSecret);   // keep the timing shape of a real check
      return deny();
    }
    const device = rows[0];
    if (!keys.secretMatches(keys.hashDeviceSecret(deviceSecret), device.secret_hash)) return deny();
    if (device.device_status !== 'active') return deny();
    if (device.license_status === 'revoked') return deny();

    const token = ent.generateDeviceToken();
    const expiresAt = new Date(Date.now() + ent.DEVICE_TOKEN_TTL_SECONDS * 1000);

    await db.query(
      `INSERT INTO device_tokens (token_hash, device_id, expires_at) VALUES ($1, $2, $3)`,
      [tokenHash(token), device.id, expiresAt.toISOString()]
    );
    await db.query('UPDATE devices SET last_seen_at = NOW() WHERE id = $1', [device.id]);

    // Opportunistic sweep. A dedicated job for a table this small would be more
    // moving parts than the problem deserves.
    await db.query('DELETE FROM device_tokens WHERE expires_at < NOW()').catch(() => {});

    return reply.code(200).send({
      success: true,
      data: { token, expiresIn: ent.DEVICE_TOKEN_TTL_SECONDS }
    });
  });

  // ── Entitlement ───────────────────────────────────────────────────────────
  /**
   * GET /v1/entitlement — the signed statement of what this device may do.
   *
   * The one endpoint that matters; everything else exists to make it possible.
   * The app verifies the Ed25519 signature against a public key compiled into
   * the build, caches the whole signed blob, and keeps answering from it while
   * offline. That cache is not a nicety: the control plane being unreachable
   * must never stop hostel operations, and these hostels lose internet
   * routinely.
   */
  app.get('/entitlement', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false, code: 'DEVICE_UNAUTHORIZED', message: 'Missing device token.'
      });
    }

    const { rows } = await db.query(
      `SELECT d.id AS device_id, d.machine_id, d.status AS device_status,
              l.id AS license_id, l.status, l.verification, l.expires_at, l.features
         FROM device_tokens t
         JOIN devices d  ON d.id = t.device_id
         JOIN licenses l ON l.id = d.license_id
        WHERE t.token_hash = $1 AND t.expires_at > NOW()`,
      [tokenHash(auth.slice(7))]
    );

    if (rows.length === 0) {
      return reply.code(401).send({
        success: false, code: 'DEVICE_TOKEN_EXPIRED',
        message: 'This session has expired. The app will reconnect automatically.'
      });
    }
    const row = rows[0];
    if (row.device_status !== 'active') {
      return reply.code(401).send({
        success: false, code: 'DEVICE_UNAUTHORIZED',
        message: 'This device could not be authenticated. Re-activate it from the app.'
      });
    }

    const issued = ent.issue({
      deviceId: row.device_id,
      licenseId: row.license_id,
      machineId: row.machine_id,
      licence: {
        status: row.status,
        verification: row.verification,
        expiresAt: new Date(row.expires_at),
        features: row.features
      }
    });

    if (!issued) {
      // Say so plainly rather than return something unsigned, which the app
      // would reject anyway and which would be a far worse thing to invent.
      return reply.code(503).send({
        success: false, code: 'SERVICE_NOT_CONFIGURED',
        message: 'Licence signing is not enabled on this server.'
      });
    }

    await db.query('UPDATE devices SET last_seen_at = NOW() WHERE id = $1', [row.device_id]);

    return reply.code(200).send({
      success: true,
      data: {
        entitlement: issued.jws,
        // Unsigned, for logs and support only. The app must read the signed
        // blob and never these.
        status: issued.claims.status,
        expiresAt: issued.claims.expiresAt,
        notAfter: issued.claims.notAfter
      }
    });
  });
}

module.exports = { deviceRoutes };
