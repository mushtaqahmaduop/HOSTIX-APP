/* ─── Control plane — HTTP layer tests ───────────────────────────────────────

   Drives the real Fastify app with `app.inject()` against a STUBBED database,
   so the whole request path is exercised — routing, cookies, CSRF, schema
   validation, error envelopes, and the separation between the machine surface
   and the human one.

   WHAT THIS DOES NOT PROVE: that the SQL runs. The stub answers queries with
   canned rows; a typo in a column name or a missing constraint would sail
   straight through. There is no Postgres on this machine and `pg-mem` is not a
   Postgres. Those need a real database, and until one exists this file is
   deliberately silent about them rather than reassuring.

   What it does prove is the layer where an authorisation mistake lives — and
   an authorisation mistake is the one that matters, because the actions behind
   this API switch off paying customers' software.

   Run:  node test/http.js
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ── Stub the database BEFORE anything requires it ───────────────────────────
const db = require('../src/db');

const stub = {
  handlers: [],
  calls: [],
  on(pattern, fn) { this.handlers.push([pattern, fn]); return this; },
  reset() { this.handlers = []; this.calls = []; }
};

function fakeQuery(text, params) {
  stub.calls.push({ text, params });
  for (const [pattern, fn] of stub.handlers) {
    if (pattern.test(text)) return Promise.resolve(fn(params, text));
  }
  return Promise.resolve({ rows: [], rowCount: 0 });
}

db.query = fakeQuery;
db.healthCheck = async () => true;
db.withTransaction = async (fn) => fn({ query: fakeQuery });

const { buildApp } = require('../src/app');

const CONFIG = {
  env: 'test',
  port: 0,
  host: '127.0.0.1',
  databaseUrl: 'postgres://stub',
  sessionSecret: 'x'.repeat(48),
  sessionTtlHours: 12,
  legacyKeySecret: 'control-plane-test-secret',
  signingConfigured: false,
  trustProxy: false
};

let pass = 0, fail = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ── Fixtures ────────────────────────────────────────────────────────────────
const ADMIN = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'owner@example.com',
  name: 'Owner',
  role: 'owner',
  is_active: true
};
const PASSWORD = 'correct-horse-battery';
let PASSWORD_HASH;

const LICENSE = {
  id: '22222222-2222-2222-2222-222222222222',
  key_fingerprint: 'f'.repeat(64),
  key_version: 4, key_expiry_part: '0FYR', serial: 'RS3M',
  key_expires_at: new Date(Date.now() + 90 * 86400000),
  expires_at: new Date(Date.now() + 90 * 86400000),
  status: 'active', verification: 'unverified', max_devices: 1,
  features: {}, hostel_name: 'Test Hostel', contact_name: null, contact_phone: null,
  city: null, notes: null, first_seen_at: new Date(), created_at: new Date()
};

/** Reset the stub to a world where the admin exists and one licence exists. */
function baseWorld() {
  stub.reset();
  stub.on(/FROM admin_users WHERE email/, () => ({
    rows: [Object.assign({ password_hash: PASSWORD_HASH }, ADMIN)]
  }));
  stub.on(/INSERT INTO rate_limits/, () => ({ rows: [{ hits: 1 }] }));
  stub.on(/INSERT INTO admin_sessions/, () => ({ rows: [] }));
  stub.on(/UPDATE admin_users SET last_login_at/, () => ({ rows: [] }));
  stub.on(/INSERT INTO audit_log/, () => ({ rows: [] }));
  stub.on(/FROM licenses WHERE id/, () => ({ rows: [LICENSE] }));
  stub.on(/FROM devices WHERE license_id/, () => ({ rows: [] }));
  stub.on(/FROM audit_log/, () => ({ rows: [] }));
}

/** Make the session lookup succeed for whatever cookie the login handed out. */
function acceptSessions(csrf) {
  stub.on(/FROM admin_sessions s/, () => ({
    rows: [{
      token_hash: 'x', csrf_token: csrf, expires_at: new Date(Date.now() + 3600000),
      id: ADMIN.id, email: ADMIN.email, name: ADMIN.name, role: ADMIN.role, is_active: true
    }]
  }));
}

function cookiesFrom(res) {
  const jar = {};
  for (const c of res.cookies || []) jar[c.name] = c.value;
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
}

async function signIn(app) {
  const res = await app.inject({
    method: 'POST', url: '/admin/api/login',
    payload: { email: ADMIN.email, password: PASSWORD }
  });
  assert.strictEqual(res.statusCode, 200, 'sign-in failed: ' + res.body);
  const jar = cookiesFrom(res);
  acceptSessions(jar.cp_csrf);
  return jar;
}

// ══════════════════════════════════════════════════════════════════════════
// The machine surface
// ══════════════════════════════════════════════════════════════════════════

test('GET /v1/healthz answers without touching the database', async (app) => {
  baseWorld();
  const before = stub.calls.length;
  const res = await app.inject({ method: 'GET', url: '/v1/healthz' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json().data.service, 'control-plane');
  assert.strictEqual(stub.calls.length, before, 'healthz issued a query');
});

test('the platform /healthz DOES probe the database — a different job', async (app) => {
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json().data.db, 'ok');
});

test('register rejects a malformed key before any work', async (app) => {
  baseWorld();
  const res = await app.inject({
    method: 'POST', url: '/v1/devices/register',
    payload: { licenseKey: 'NOT-A-KEY-AT-ALL-XXXX', machineId: 'a'.repeat(64) }
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.json().code, 'INVALID_KEY_FORMAT');
});

test('register names the fingerprint-failure case specifically', async (app) => {
  baseWorld();
  const keys = require('../src/lib/keys');
  const key = keys.buildLicenseKey(2027, 6, 1, CONFIG.legacyKeySecret);
  const res = await app.inject({
    method: 'POST', url: '/v1/devices/register',
    payload: { licenseKey: key, machineId: 'UNKNOWN_MACHINE_ID_FALLBACK_' + '0'.repeat(36) }
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.json().code, 'MACHINE_ID_UNAVAILABLE');
});

test('register refuses unknown body fields rather than ignoring them', async (app) => {
  baseWorld();
  const res = await app.inject({
    method: 'POST', url: '/v1/devices/register',
    payload: { licenseKey: 'x'.repeat(26), machineId: 'a'.repeat(64), isAdmin: true }
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR');
});

test('/v1/entitlement without a token is refused', async (app) => {
  baseWorld();
  const res = await app.inject({ method: 'GET', url: '/v1/entitlement' });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.json().code, 'DEVICE_UNAUTHORIZED');
});

// ══════════════════════════════════════════════════════════════════════════
// The human surface
// ══════════════════════════════════════════════════════════════════════════

test('every admin route is closed to an anonymous caller', async (app) => {
  baseWorld();
  const routes = [
    ['GET', '/admin/api/summary'], ['GET', '/admin/api/licenses'],
    ['GET', '/admin/api/licenses/' + LICENSE.id], ['GET', '/admin/api/audit'],
    ['POST', '/admin/api/licenses/' + LICENSE.id + '/status'],
    ['POST', '/admin/api/licenses/' + LICENSE.id + '/renew'],
    ['PUT', '/admin/api/licenses/' + LICENSE.id + '/features'],
    ['POST', '/admin/api/issue-key']
  ];
  for (const [method, url] of routes) {
    const res = await app.inject({ method, url, payload: method === 'GET' ? undefined : {} });
    assert.strictEqual(res.statusCode, 401, method + ' ' + url + ' was open');
  }
});

test('a wrong password and an unknown email give the SAME answer', async (app) => {
  baseWorld();
  const wrongPass = await app.inject({
    method: 'POST', url: '/admin/api/login',
    payload: { email: ADMIN.email, password: 'nope' }
  });

  stub.reset();
  stub.on(/INSERT INTO rate_limits/, () => ({ rows: [{ hits: 1 }] }));
  stub.on(/FROM admin_users WHERE email/, () => ({ rows: [] }));
  const unknown = await app.inject({
    method: 'POST', url: '/admin/api/login',
    payload: { email: 'nobody@example.com', password: 'nope' }
  });

  assert.strictEqual(wrongPass.statusCode, 401);
  assert.strictEqual(unknown.statusCode, 401);
  assert.deepStrictEqual(wrongPass.json(), unknown.json(),
    'the responses differ, which makes this an account-enumeration endpoint');
});

test('sign-in is rate limited', async (app) => {
  baseWorld();
  stub.handlers = stub.handlers.filter(([p]) => !/INSERT INTO rate_limits/.test(String(p)));
  stub.on(/INSERT INTO rate_limits/, () => ({ rows: [{ hits: 99 }] }));
  const res = await app.inject({
    method: 'POST', url: '/admin/api/login',
    payload: { email: ADMIN.email, password: PASSWORD }
  });
  assert.strictEqual(res.statusCode, 429);
});

test('sign-in sets an HttpOnly session cookie and a readable CSRF cookie', async (app) => {
  baseWorld();
  const res = await app.inject({
    method: 'POST', url: '/admin/api/login',
    payload: { email: ADMIN.email, password: PASSWORD }
  });
  assert.strictEqual(res.statusCode, 200);
  const session = res.cookies.find((c) => c.name === 'cp_session');
  const csrf = res.cookies.find((c) => c.name === 'cp_csrf');

  assert.ok(session, 'no session cookie');
  assert.strictEqual(session.httpOnly, true, 'the session cookie must not be readable by JS');
  assert.strictEqual(String(session.sameSite).toLowerCase(), 'strict');

  assert.ok(csrf, 'no csrf cookie');
  assert.notStrictEqual(csrf.httpOnly, true, 'the portal has to read this one to echo it');
  assert.notStrictEqual(csrf.value, session.value, 'the two tokens must not be the same value');
});

test('a signed-in admin can read, and never sees a licence key', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  const res = await app.inject({
    method: 'GET', url: '/admin/api/licenses/' + LICENSE.id,
    headers: { cookie: cookieHeader(jar) }
  });
  assert.strictEqual(res.statusCode, 200);
  const lic = res.json().data.license;
  assert.strictEqual(lic.hostelName, 'Test Hostel');
  // The hint is enough to match against the issuance log; the checksum is not
  // stored anywhere, so nothing here can be turned back into a working key.
  assert.match(lic.keyHint, /^HOSTEL-0FYR-RS3M-····$/);
  assert.ok(!res.body.includes(LICENSE.key_fingerprint), 'the fingerprint leaked to the portal');
});

test('a state change WITHOUT the CSRF header is refused', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  const res = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + LICENSE.id + '/status',
    headers: { cookie: cookieHeader(jar) },      // cookie present, header absent
    payload: { status: 'suspended' }
  });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.json().code, 'CSRF');
});

test('a state change with a WRONG CSRF token is refused', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  const res = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + LICENSE.id + '/status',
    headers: { cookie: cookieHeader(jar), 'x-csrf-token': 'not-the-token' },
    payload: { status: 'suspended' }
  });
  assert.strictEqual(res.statusCode, 403);
});

test('a state change WITH the CSRF header goes through and is audited', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  stub.on(/UPDATE licenses SET status/, () => ({ rows: [Object.assign({}, LICENSE, { status: 'suspended' })] }));
  stub.on(/SELECT status, verification FROM licenses/, () => ({ rows: [{ status: 'active', verification: 'unverified' }] }));

  const before = stub.calls.filter((c) => /INSERT INTO audit_log/.test(c.text)).length;
  const res = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + LICENSE.id + '/status',
    headers: { cookie: cookieHeader(jar), 'x-csrf-token': jar.cp_csrf },
    payload: { status: 'suspended', reason: 'non-payment' }
  });
  assert.strictEqual(res.statusCode, 200, res.body);
  const after = stub.calls.filter((c) => /INSERT INTO audit_log/.test(c.text)).length;
  assert.ok(after > before, 'a suspension was not written to the audit log');
});

test('a deactivated admin loses their session immediately', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  // Same session row, is_active flipped — the state after "disable this user".
  stub.handlers = stub.handlers.filter(([p]) => !/FROM admin_sessions s/.test(String(p)));
  stub.on(/FROM admin_sessions s/, () => ({
    rows: [{
      csrf_token: jar.cp_csrf, expires_at: new Date(Date.now() + 3600000),
      id: ADMIN.id, email: ADMIN.email, name: ADMIN.name, role: ADMIN.role, is_active: false
    }]
  }));
  const res = await app.inject({
    method: 'GET', url: '/admin/api/summary', headers: { cookie: cookieHeader(jar) }
  });
  assert.strictEqual(res.statusCode, 401, 'a disabled admin kept working until their session expired');
});

test('unknown feature flags are refused, not stored', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  const res = await app.inject({
    method: 'PUT', url: '/admin/api/licenses/' + LICENSE.id + '/features',
    headers: { cookie: cookieHeader(jar), 'x-csrf-token': jar.cp_csrf },
    payload: { features: { reports: true, madeUpFlag: true } }
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.json().code, 'INVALID_FEATURES');
  assert.match(res.json().message, /unknown feature flag/);
});

test('issue-key refuses an impossible date', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  const res = await app.inject({
    method: 'POST', url: '/admin/api/issue-key',
    headers: { cookie: cookieHeader(jar), 'x-csrf-token': jar.cp_csrf },
    payload: { expiresOn: '2027-04-31' }        // April has 30 days
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.json().code, 'INVALID_DATE');
});

test('issue-key mints a v4 key, records it, and shows it once', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  stub.on(/INSERT INTO licenses/, () => ({ rows: [LICENSE] }));
  const res = await app.inject({
    method: 'POST', url: '/admin/api/issue-key',
    headers: { cookie: cookieHeader(jar), 'x-csrf-token': jar.cp_csrf },
    payload: { expiresOn: '2027-06-30', hostelName: 'New Hostel' }
  });
  assert.strictEqual(res.statusCode, 201, res.body);
  const key = res.json().data.key;
  assert.match(key, /^HOSTEL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const keys = require('../src/lib/keys');
  assert.ok(keys.validateKeyChecksum(key, CONFIG.legacyKeySecret), 'the issued key does not verify');
  assert.strictEqual(keys.licenseKeyExpiry(key).toISOString().slice(0, 10), '2027-06-30');

  // Two keys for the same date must differ — the v3 bug that started all of this.
  const second = await app.inject({
    method: 'POST', url: '/admin/api/issue-key',
    headers: { cookie: cookieHeader(jar), 'x-csrf-token': jar.cp_csrf },
    payload: { expiresOn: '2027-06-30', hostelName: 'Another Hostel' }
  });
  assert.notStrictEqual(second.json().data.key, key, 'two issued keys were identical');
});

test('sign-out clears both cookies', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  const res = await app.inject({
    method: 'POST', url: '/admin/api/logout', headers: { cookie: cookieHeader(jar) }
  });
  assert.strictEqual(res.statusCode, 200);
  const cleared = res.cookies.filter((c) => c.value === '').map((c) => c.name).sort();
  assert.deepStrictEqual(cleared, ['cp_csrf', 'cp_session']);
});

test('a 500 never leaks an internal message', async (app) => {
  baseWorld();
  const jar = await signIn(app);
  stub.handlers = stub.handlers.filter(([p]) => !/FROM licenses WHERE id/.test(String(p)));
  stub.on(/FROM licenses WHERE id/, () => { throw new Error('column "secret_column" does not exist'); });

  const res = await app.inject({
    method: 'GET', url: '/admin/api/licenses/' + LICENSE.id,
    headers: { cookie: cookieHeader(jar) }
  });
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.json().message, 'An unexpected error occurred');
  assert.ok(!res.body.includes('secret_column'), 'the database error reached the caller');
});

test('the portal is served, and the API prefix still resolves to routes', async (app) => {
  baseWorld();
  const page = await app.inject({ method: 'GET', url: '/admin/' });
  assert.strictEqual(page.statusCode, 200);
  assert.match(page.body, /Control Plane/);

  // /admin/api/* must not be swallowed by the static handler.
  const api = await app.inject({ method: 'GET', url: '/admin/api/summary' });
  assert.strictEqual(api.statusCode, 401);
  assert.strictEqual(api.json().code, 'UNAUTHENTICATED');
});

// ── Run ─────────────────────────────────────────────────────────────────────
(async function run() {
  PASSWORD_HASH = await bcrypt.hash(PASSWORD, 4);   // low rounds: this is a test

  const app = await buildApp({ config: CONFIG, logger: false });
  await app.ready();

  console.log('\ncontrol plane — HTTP layer (stubbed database)\n');
  for (const [name, fn] of tests) {
    try {
      await fn(app);
      pass++; console.log('  ok   ' + name);
    } catch (e) {
      fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e));
    }
  }
  await app.close();

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  console.log('  (SQL correctness is NOT covered here — that needs a real Postgres)\n');
  process.exit(fail === 0 ? 0 : 1);
})();
