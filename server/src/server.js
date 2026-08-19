// ════════════════════════════════════════════════════════════════════════════
// Entrypoint
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const configModule = require('./config');
const db = require('./db');
const { buildApp } = require('./app');

async function main() {
  const config = configModule.assertValid(configModule.load());

  // Say once, at boot, which optional capabilities are off. A control plane
  // that cannot sign entitlements looks perfectly healthy from the outside —
  // devices register, tokens issue — and only fails at the one endpoint that
  // matters. Better to state it where someone reading the deploy log sees it.
  if (!config.signingConfigured) {
    console.warn('[control-plane] ENTITLEMENT_SIGNING_JWK is not set — /v1/entitlement will return 503');
  }
  if (!config.legacyKeySecret) {
    console.warn('[control-plane] LEGACY_KEY_SECRET is not set — /v1/devices/register will return 503');
  }

  const app = await buildApp({ config });

  const shutdown = async (signal) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info({ port: config.port, env: config.env }, 'control plane listening');
}

main().catch((err) => {
  console.error('[control-plane] failed to start:', err.message);
  process.exit(1);
});
