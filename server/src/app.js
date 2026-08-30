// ════════════════════════════════════════════════════════════════════════════
// The Fastify app
//
// Built without listening, so tests can drive it with `app.inject()` and the
// entrypoint can start it. Two route groups with two different audiences:
//
//   /v1/*      machines. Device secrets and opaque device tokens.
//   /admin/*   people. Session cookies and CSRF.
//
// They never share a credential. A device token cannot reach an admin route and
// an admin session cannot mint an entitlement, because the only thing that
// resolves either one is a row in its own table — neither verifier can read the
// other's credential at all.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const path = require('path');
const Fastify = require('fastify');
const configModule = require('./config');
const db = require('./db');
const { deviceRoutes } = require('./routes/devices');
const { adminRoutes } = require('./routes/admin');

async function buildApp(opts) {
  const options = opts || {};
  const config = options.config || configModule.load();

  const app = Fastify({
    logger: options.logger === undefined
      ? { level: process.env.LOG_LEVEL || 'info' }
      : options.logger,
    trustProxy: config.trustProxy,
    // The app posts nothing large. A cap means a malformed or hostile request
    // is refused before it is parsed rather than after.
    bodyLimit: 64 * 1024,
    // Fastify defaults to removeAdditional:true, which STRIPS unknown body
    // fields rather than rejecting them — so `additionalProperties: false` on a
    // route schema silently does nothing. A client sending hostelId, or a typo,
    // would be quietly humoured instead of told. Reject instead.
    ajv: { customOptions: { removeAdditional: false } }
  });

  app.decorate('config', config);

  // Cookies carry the admin session, signed with SESSION_SECRET so a tampered
  // one is rejected before anything is looked up.
  await app.register(require('@fastify/cookie'), { secret: config.sessionSecret });

  // The portal: plain HTML/CSS/JS, no build step, matching the app this service
  // exists for.
  await app.register(require('@fastify/static'), {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/admin/',
    index: ['index.html']
  });

  // ── Errors ────────────────────────────────────────────────────────────────
  // One envelope everywhere: {success, code, message} on failure and
  // {success, data} on success. A second shape on one surface is how a client
  // ends up with two parsers.
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
  app.register(adminRoutes, { prefix: '/admin/api' });

  // A bare visit to the host lands on the portal rather than a 404.
  app.get('/', async (_request, reply) => reply.redirect('/admin/'));

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
      data: {
        db: dbOk ? 'ok' : 'down',
        signing: config.signingConfigured ? 'ok' : 'not_configured'
      }
    });
  });

  return app;
}

module.exports = { buildApp };
