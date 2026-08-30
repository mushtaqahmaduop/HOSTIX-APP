// ════════════════════════════════════════════════════════════════════════════
// Configuration
//
// Two classes of setting, and the distinction is the point:
//
//   REQUIRED   the service cannot do its job without them, so it refuses to
//              start rather than run in a state that looks healthy and is not.
//
//   OPTIONAL   a capability is off until configured, and says so at the point
//              of use. Signing is the example: a control plane with no signing
//              key must still boot and still serve the portal, because taking
//              the whole service down would remove the one place the owner
//              could go to find out what is wrong.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const REQUIRED = ['DATABASE_URL', 'SESSION_SECRET'];

function load() {
  const cfg = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '8080', 10),
    host: process.env.HOST || '0.0.0.0',

    databaseUrl: process.env.DATABASE_URL || null,

    // Signs admin session cookies. A weak value here means anyone can mint an
    // admin session, so it is required and length-checked rather than defaulted.
    sessionSecret: process.env.SESSION_SECRET || null,
    sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '12', 10),

    // The secret the app's licence-key checksum is computed with — the hex blob
    // at the top of keygen.js. OPTIONAL: without it, device registration is off
    // and says so. Note this is NOT a trust boundary; it ships inside app.asar,
    // so it filters typos and nothing more.
    legacyKeySecret: process.env.LEGACY_KEY_SECRET || null,

    // OPTIONAL. Without it, entitlements cannot be signed and /entitlement
    // returns 503 rather than something unsigned, which the app would reject
    // anyway and which would be a far worse thing to invent.
    signingConfigured: !!process.env.ENTITLEMENT_SIGNING_JWK,

    // Trust the proxy's X-Forwarded-For. True on Railway, which terminates TLS
    // in front of the process — without it every client looks like the proxy
    // and per-IP rate limits become one shared bucket.
    trustProxy: process.env.TRUST_PROXY !== 'false'
  };

  return cfg;
}

/**
 * Fail fast, in every environment, on anything whose absence would make the
 * service quietly insecure rather than obviously broken.
 */
function assertValid(cfg) {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error('Missing required environment variable(s): ' + missing.join(', '));
  }
  if (cfg.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters — generate one with `openssl rand -hex 32`');
  }
  if (!/^postgres(ql)?:\/\//.test(cfg.databaseUrl)) {
    throw new Error('DATABASE_URL must be a postgres:// connection string');
  }
  return cfg;
}

module.exports = { load, assertValid, REQUIRED };
