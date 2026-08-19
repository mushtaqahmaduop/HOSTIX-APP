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

function query(text, params) {
  return pool().query(text, params);
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
  const client = await pool().connect();
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

module.exports = { pool, query, withTransaction, healthCheck, close };
