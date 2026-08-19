// ════════════════════════════════════════════════════════════════════════════
// The Fastify app
//
// Built without listening, so tests can drive it with `app.inject()` and the
// entrypoint can start it. Two route groups with two different audiences:
//
//   /v1/*      machines. Device secrets and opaque device tokens.
//   /admin/*   people. Session cookies. (Arrives with the portal.)
//
// They never share a credential. A device token cannot reach an admin route and
// an admin session cannot mint an entitlement, because neither verifier knows
// how to read the other's token at all.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const Fastify = require('fastify');
const configModule = require('./config');
const db = require('./db');
const { deviceRoutes } = require('./routes/devices');

async function buildApp(opts) {
  const options = opts || {};
  const config = options.config || configModule.load();

  const app = Fastify({
    logger: options.logger === undefined
      ? { level: process.env.LOG_LEVEL || 'info' }
      : options.logger,
    trustProxy: config.trustProxy,
    // The app posts nothing large. A cap here means a malformed or hostile
    // request is refused before it is parsed rather than after.
    bodyLimit: 64 * 1024
  });

  app.decorate('config', config);

  // ── Errors ────────────────────────────────────────────────────────────────
  // One envelope everywhere: {success, code, message} on failure, {success,
  // data} on success. A second shape on one surface is how a client ends up
  // with two parsers.
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        success: false, code: 'VALIDATION_ERROR', message: error.message
      });
    }
    const status = error.statusCode || 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
      // Never leak an internal message or a stack to a caller. The log has it.
      return reply.code(status).send({
        success: false, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred'
      });
    }
    return reply.code(status).send({
      success: false, code: error.code || 'ERROR', message: error.message
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ success: false, code: 'NOT_FOUND', message: 'Not found' });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.register(deviceRoutes, { prefix: '/v1' });

  /**
   * The platform's deploy gate — a DIFFERENT endpoint from /v1/healthz.
   *
   * This one probes the database, because a process that cannot reach Postgres
   * should not be promoted. /v1/healthz deliberately probes nothing, because
   * every install polls it every 60 seconds. Same word, opposite requirements;
   * do not point one at the other.
   */
  app.get('/healthz', async (_request, reply) => {
    const dbOk = await db.healthCheck();
    return reply.code(dbOk ? 200 : 503).send({
      success: dbOk,
      data: { db: dbOk ? 'ok' : 'down', signing: config.signingConfigured ? 'ok' : 'not_configured' }
    });
  });

  return app;
}

module.exports = { buildApp };
