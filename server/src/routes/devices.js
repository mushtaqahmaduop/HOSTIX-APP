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

/** How often an idle stream says something, so proxies do not reap it. */
const STREAM_HEARTBEAT_MS = 25000;
/**
 * A stream is re-opened at least this often. The token that opened it lasts
 * 15 minutes; closing on this cadence makes the app re-authenticate, so a
 * stream can never outlive the credential that opened it by much.
 */
const STREAM_MAX_AGE_MS = 14 * 60 * 1000;

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

/** The fleet row. Never fails a request — an empty fleet is the default. */
async function loadFleet() {
  try {
    const { rows } = await db.query('SELECT features, restrictions, revision FROM fleet_settings WHERE id');
    return rows[0] || {};
  } catch (_) {
    return {};
  }
}

/** Resolve a Bearer device token to its device and licence, or null. */
async function deviceForToken(request) {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const { rows } = await db.query(
    `SELECT d.id AS device_id, d.machine_id, d.status AS device_status, d.status_reason AS device_reason,
            l.id AS license_id, l.status, l.status_until, l.status_before, l.status_reason,
            l.verification, l.expires_at, l.features, l.restrictions, l.revision
       FROM device_tokens t
       JOIN devices d  ON d.id = t.device_id
       JOIN licenses l ON l.id = d.license_id
      WHERE t.token_hash = $1 AND t.expires_at > NOW()`,
    [tokenHash(auth.slice(7))]
  );
  return rows[0] || null;
}

async function deviceRoutes(app) {
  const realtime = app.realtime || null;

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

    if (!keys.parseLicenseKey(licenseKey)) {
      return reply.code(400).send({
        success: false, code: 'INVALID_KEY_FORMAT',
        message: 'That licence key is not in a recognised format.'
      });
    }
    // The TRUE version, from the checksum tag — the layout cannot tell v4 from v5.
    const parsed = keys.parseVerified(licenseKey, secret);
    if (!parsed) {
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
      // A v5 key is only ever cut by the portal, which records it first. One
      // this database has never seen was not issued here — refuse it rather than
      // admit it as 'unverified' the way the ~50 legacy keys are admitted.
      if (parsed.version === 5) {
        const known = await client.query(
          'SELECT 1 FROM licenses WHERE key_fingerprint = $1', [keys.keyFingerprint(parsed)]);
        if (known.rows.length === 0) return { kind: 'not_issued' };
      }

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
         RETURNING id, status, status_until, status_before, verification, max_devices, expires_at`,
        [
          keys.keyFingerprint(parsed), parsed.version, parsed.expPart,
          parsed.serial || null, expiresAt.toISOString(), keys.defaultMaxDevices(parsed)
        ]
      );
      const license = lic.rows[0];

      // Serialise concurrent registrations for this licence, so the device cap
      // below cannot be raced past by two machines counting at the same time.
      await client.query('SELECT id FROM licenses WHERE id = $1 FOR UPDATE', [license.id]);

      // A REVOKED or SUSPENDED licence still registers. Registration
      // authenticates a machine; it decides nothing about the licence. Refusing
      // here is what made revocation unreachable (f79b114, 2026-09-21): a
      // device whose token lapsed re-registered into a 403, lost its
      // credentials, and ran on its cached ACTIVE entitlement for good. The
      // verdict travels in the signed entitlement, where the app acts on it.

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

      // A released machine re-registering must not count against the seat it
      // gave up, and must not take one: it registers (so it can be told it is
      // locked) but the cap above only counts active devices.
      //
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
               -- A machine the owner RELEASED stays released. Reinstalling the
               -- app must not be a way to put it back on the licence; only the
               -- portal re-activates it.
               status      = devices.status,
               last_seen_at = NOW()
         RETURNING id, status`,
        [license.id, machineId, keys.hashDeviceSecret(deviceSecret), appVersion || null, os || null]
      );

      // Rotating the secret must invalidate whatever sessions the old one
      // bought, or a stolen secret keeps working for its full token lifetime
      // after the customer re-registers to get rid of it.
      await client.query('DELETE FROM device_tokens WHERE device_id = $1', [dev.rows[0].id]);

      return {
        kind: 'ok',
        deviceId: dev.rows[0].id,
        deviceStatus: dev.rows[0].status,
        licenseId: license.id,
        // What the entitlement will say, so an activating app can refuse to
        // activate onto a locked licence instead of activating and bouncing.
        effectiveStatus: dev.rows[0].status === 'deactivated'
          ? ent.STATUS.REVOKED
          : ent.resolveStatus({
            status: license.status, status_until: license.status_until,
            status_before: license.status_before, verification: license.verification,
            expiresAt: new Date(license.expires_at)
          }, new Date()),
        status: license.status,
        verification: license.verification,
        expiresAt: license.expires_at,
        maxDevices: license.max_devices
      };
    });

    if (outcome.kind === 'not_issued') {
      return reply.code(403).send({
        success: false, code: 'KEY_NOT_ISSUED',
        message: 'This licence key was not issued by Hostyllo. Check it and try again.'
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
        effectiveStatus: outcome.effectiveStatus,
        deviceStatus: outcome.deviceStatus,
        keyVersion: parsed.version,
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
      'SELECT d.id, d.secret_hash FROM devices d WHERE d.id = $1',
      [deviceId]
    );

    // AUTHENTICATION ONLY. A deactivated device or a revoked licence still gets
    // a token: refusing it here meant the app could never fetch the entitlement
    // that tells it it is locked, so it carried on from its cache (f79b114).
    // What a device may DO is decided in /entitlement.
    //
    // One code and one message for both failures — unknown device, wrong
    // secret — so a device id reveals nothing.
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
    if (!request.headers.authorization || !request.headers.authorization.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false, code: 'DEVICE_UNAUTHORIZED', message: 'Missing device token.'
      });
    }

    const row = await deviceForToken(request);
    if (!row) {
      return reply.code(401).send({
        success: false, code: 'DEVICE_TOKEN_EXPIRED',
        message: 'This session has expired. The app will reconnect automatically.'
      });
    }

    const fleet = await loadFleet();
    const issued = ent.issue({
      deviceId: row.device_id,
      licenseId: row.license_id,
      machineId: row.machine_id,
      licence: {
        status: row.status,
        status_until: row.status_until,
        status_before: row.status_before,
        status_reason: row.status_reason,
        verification: row.verification,
        expiresAt: new Date(row.expires_at),
        features: row.features,
        restrictions: row.restrictions,
        revision: row.revision
      },
      fleet,
      // A released device is locked, not refused — see buildClaims.
      device: { status: row.device_status, reason: row.device_reason }
    });

    if (!issued) {
      // Say so plainly rather than return something unsigned, which the app
      // would reject anyway and which would be a far worse thing to invent.
      return reply.code(503).send({
        success: false, code: 'SERVICE_NOT_CONFIGURED',
        message: 'Licence signing is not enabled on this server.'
      });
    }

    // Recording the revision served is how the portal says "change received":
    // the app fetches this only to apply it.
    await db.query(
      'UPDATE devices SET last_seen_at = NOW(), last_revision_applied = $2 WHERE id = $1',
      [row.device_id, issued.claims.revision]
    );

    return reply.code(200).send({
      success: true,
      data: {
        entitlement: issued.jws,
        // Unsigned, for logs and support only. The app must read the signed
        // blob and never these.
        status: issued.claims.status,
        level: issued.claims.level,
        revision: issued.claims.revision,
        expiresAt: issued.claims.expiresAt,
        notAfter: issued.claims.notAfter
      }
    });
  });

  // ── Live stream ───────────────────────────────────────────────────────────
  /**
   * GET /v1/devices/stream — Server-Sent Events: "your licence changed".
   *
   * The app holds this open and, on `changed`, fetches /v1/entitlement. It
   * carries no policy, so there is nothing in it worth forging. Plain HTTP
   * rather than a WebSocket: it is one-way, it passes proxies and hostel
   * routers, and it needs no extra dependency.
   *
   * Presence rides on it: `stream_connected_at` is refreshed on every
   * heartbeat, so "online now" in the portal means "holding a stream within the
   * last minute and a half" — not a guess from the last sync.
   */
  app.get('/devices/stream', async (request, reply) => {
    const row = await deviceForToken(request);
    if (!row) {
      return reply.code(401).send({
        success: false, code: 'DEVICE_TOKEN_EXPIRED',
        message: 'This session has expired. The app will reconnect automatically.'
      });
    }
    const fleet = await loadFleet();

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // nginx-style proxies buffer event streams without this.
      'X-Accel-Buffering': 'no'
    });

    let closed = false;
    const write = (text) => { if (!closed) { try { res.write(text); } catch (_) {} } };
    const send = (event, data) => write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');

    // The revision this stream opened at. The app compares it with the one it
    // holds and syncs at once if they differ — that covers anything that
    // changed while it was disconnected.
    send('hello', {
      revision: Number(row.revision || 0) + Number(fleet.revision || 0),
      heartbeatMs: STREAM_HEARTBEAT_MS
    });

    const touch = () => db.query(
      'UPDATE devices SET stream_connected_at = NOW(), last_seen_at = NOW() WHERE id = $1',
      [row.device_id]).catch(() => {});
    touch();

    const onLicence = (id, rev) => { if (id === row.license_id) send('changed', { scope: 'licence', revision: rev }); };
    const onDevice = (id) => { if (id === row.device_id) send('changed', { scope: 'device' }); };
    const onFleet = (rev) => send('changed', { scope: 'fleet', revision: rev });
    const onResync = () => send('changed', { scope: 'resync' });

    if (realtime) {
      realtime.on('licence', onLicence);
      realtime.on('device', onDevice);
      realtime.on('fleet', onFleet);
      realtime.on('resync', onResync);
    }
    const entry = { deviceId: row.device_id, licenseId: row.license_id, openedAt: Date.now() };
    if (realtime) realtime.streams.add(entry);

    const beat = setInterval(() => { write(': ping\n\n'); touch(); }, STREAM_HEARTBEAT_MS);
    const maxAge = setTimeout(() => { send('reconnect', {}); cleanup(); try { res.end(); } catch (_) {} },
      STREAM_MAX_AGE_MS);

    function cleanup() {
      if (closed) return;
      closed = true;
      clearInterval(beat);
      clearTimeout(maxAge);
      if (realtime) {
        realtime.off('licence', onLicence);
        realtime.off('device', onDevice);
        realtime.off('fleet', onFleet);
        realtime.off('resync', onResync);
        realtime.streams.delete(entry);
      }
      db.query('UPDATE devices SET stream_connected_at = NULL WHERE id = $1', [row.device_id]).catch(() => {});
    }
    request.raw.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  });
}

module.exports = { deviceRoutes, STREAM_HEARTBEAT_MS };
