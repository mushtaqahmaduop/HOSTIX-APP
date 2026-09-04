// ════════════════════════════════════════════════════════════════════════════
// Postgres access
//
// One pool, one transaction helper, and the NUMERIC/INT8 parsing fix.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const pg = require('pg');

// ── Result parsing ──────────────────────────────────────────────────────────
// node-postgres returns INT8 (what COUNT() gives back) as a STRING, because an
// int8 can exceed what a JS double holds exactly. Nothing here comes close —
// these are counts of hostels and devices. Left unparsed the strings are a live
// bug generator: `"3" + 1` is `"31"`, and `"10" < "9"` is true. Parsing at the
// driver ends the class rather than patching each call site, which only works
// until someone forgets.
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));   // int8
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));   // numeric

let _pool = null;

function pool() {
  if (_pool) return _pool;
  _pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Managed Postgres (Railway, Supabase) terminates TLS with a certificate
    // chain the container does not carry, and refusing it would mean no
    // connection at all. Verification is disabled only when the connection
    // string asks for it, so a local dev database stays plain.
    ssl: /sslmode=require|supabase|railway/i.test(process.env.DATABASE_URL || '')
      ? { rejectUnauthorized: false }
      : undefined,
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  _pool.on('error', (err) => {
    // A pooled connection dropping is normal on managed Postgres. Losing the
    // process over it is not.
    console.error('[db] idle client error:', err.message);
  });
  return _pool;
}

// ── Waking a sleeping database ──────────────────────────────────────────────
//
// Managed Postgres goes to sleep when idle and takes a few seconds to accept
// connections again. The first request after that window does not get a slow
// answer — it gets no connection at all, and the route turns that into a 500.
//
// Observed in production on 2026-09-04: `POST /v1/devices/register` failed with
// an AggregateError pairing `ETIMEDOUT` on the database's IPv6 address with
// `ECONNREFUSED` on its IPv4 one, and returned 500 in 256ms. A device
// activating for the first time saw an outright failure; it only recovered
// because the desktop client happened to try again on its next tick. The same
// error hit `bumpLogin` the day before, so the admin portal's login was
// answering 500 to a correct password.
//
// `connectionTimeoutMillis` does not help: nothing timed out. Both addresses
// answered immediately — one refusing, one unreachable — so the pool gave up in
// a quarter of a second while the database was still on its way up.
//
// So retry, but ONLY on the connect. A statement that reached Postgres and
// failed there must never be resent: at this layer we cannot tell a duplicate
// INSERT from a genuine one, and `/devices/register` writes.
const CONNECT_ERRNOS = new Set([
  'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH',
  'ECONNRESET', 'EAI_AGAIN'
]);

/**
 * True only for a failure that happened BEFORE any statement was sent.
 *
 * node-postgres raises an AggregateError when a host resolves to several
 * addresses and every one of them fails, so the code worth reading is often on
 * the children rather than the error itself.
 */
function isConnectError(err) {
  if (!err) return false;
  if (err.code && CONNECT_ERRNOS.has(err.code)) return true;
  const kids = err.errors || err.aggregateErrors;
  if (Array.isArray(kids)) return kids.some(e => e && CONNECT_ERRNOS.has(e.code));
  return false;
}

// Three attempts over ~1.8s. Deliberately short: it has to fit inside the
// deploy gate's 30s healthcheck and inside the desktop client's 15s request
// timeout, and a database that is genuinely down should be reported as down
// rather than held open while every request waits on it.
const CONNECT_ATTEMPTS   = 3;
const CONNECT_BACKOFF_MS = [400, 1400];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Run `fn`, retrying only connection-level failures.
 * Anything Postgres itself rejected is rethrown on the first try.
 */
async function _withConnectRetry(fn) {
  let lastErr;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isConnectError(err) || attempt === CONNECT_ATTEMPTS) throw err;
      lastErr = err;
      console.warn('[db] connect failed (' + (err.code || 'unknown') +
        '), attempt ' + attempt + '/' + CONNECT_ATTEMPTS + ' — waking?');
      await sleep(CONNECT_BACKOFF_MS[attempt - 1]);
    }
  }
  throw lastErr;
}

function query(text, params) {
  return _withConnectRetry(() => pool().query(text, params));
}

/**
 * Run a unit of work inside a REAL transaction.
 *
 * `query('BEGIN')` on a pool is not a transaction: the pool hands out a
 * different connection per call, so BEGIN can open on one connection while the
 * writes autocommit on others and COMMIT fires against a connection with no
 * open transaction. Borrowing one client for the whole unit is what makes it
 * real.
 */
async function withTransaction(fn) {
  // Only the checkout is retried. Once BEGIN is sent the unit of work is in
  // flight and resending it is a duplicate write, not a recovery.
  const client = await _withConnectRetry(() => pool().connect());
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      // The connection may already be unusable; the rollback failing is not the
      // error worth reporting, and swallowing it keeps the original cause.
    });
    throw err;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  try {
    const { rows } = await query('SELECT 1 AS ok');
    return rows[0].ok === 1;
  } catch (_) {
    return false;
  }
}

async function close() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

// isConnectError is exported for its test. It is the whole safety argument for
// the retry — if it ever returns true for an error Postgres raised, a write
// gets resent — so it is worth pinning directly rather than only through a
// route.
module.exports = { pool, query, withTransaction, healthCheck, close, isConnectError };
