/* ─── Control plane — integration tests against a REAL Postgres ──────────────

   test/http.js drives the same routes against a STUBBED database, which proves
   the authorisation layer and proves nothing about the SQL: the stub answers
   with canned rows, so a wrong column name, a constraint that does not fire, or
   an ON CONFLICT clause that updates the wrong thing sails straight through.
   That file says so itself, in its header, and ends by printing the gap.

   This file closes it. Same Fastify app, same `app.inject()`, but every query
   reaches a real Postgres — so the things that only exist in the database are
   actually exercised:

     * the registration UPSERT, and the invariant that re-registering must NOT
       undo a renewal the owner granted in the portal
     * the device cap, counted inside the transaction that takes the row lock
     * the rate-limit window CASE expression, including its reset
     * the audit_log insert-only trigger, and the updated_at triggers
     * the CHECK constraints, which are the last line under every route

   It is SKIPPED, loudly, when TEST_DATABASE_URL is unset, so `npm test` still
   runs end to end on a laptop with no database. It is not skipped quietly:
   silence would read as "covered".

   ── The database is WIPED ──────────────────────────────────────────────────
   Every test truncates. Point TEST_DATABASE_URL at a scratch database and
   nothing else; the guard below refuses anything whose name does not look
   disposable, because the cost of getting this wrong is the licence table for
   50+ paying hostels.

   Run:  TEST_DATABASE_URL=postgres://…/cp_test npm run test:integration
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

const URL_ENV = process.env.TEST_DATABASE_URL;

if (!URL_ENV) {
  console.log('\ncontrol plane — integration (real Postgres)');
  console.log('  SKIPPED — set TEST_DATABASE_URL to run these.');
  console.log('  Without them the SQL is unproven: the stubbed suite cannot see a');
  console.log('  wrong column name, a constraint that never fires, or an UPSERT');
  console.log('  that updates the wrong row.\n');
  process.exit(0);
}

// A scratch database, or nothing. Truncating the wrong one is unrecoverable.
if (!/(test|scratch|tmp|ci)/i.test(URL_ENV)) {
  console.error('\nRefusing to run: TEST_DATABASE_URL does not look like a scratch database.');
  console.error('These tests TRUNCATE every table. Name the database so it is obvious.\n');
  process.exit(1);
}

process.env.DATABASE_URL = URL_ENV;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'i'.repeat(48);
process.env.LEGACY_KEY_SECRET = 'integration-key-secret';

// A throwaway signing key, so the entitlement round-trip is real end to end:
// this server signs it, and the APP's own verifier checks it.
const pair = crypto.generateKeyPairSync('ed25519');
process.env.ENTITLEMENT_SIGNING_JWK = JSON.stringify({
  kid: 'integration-kid', alg: 'EdDSA', use: 'sig',
  ...pair.privateKey.export({ format: 'jwk' })
});
const APP_KEYS = { 'integration-kid': pair.publicKey.export({ type: 'spki', format: 'pem' }) };

const bcrypt = require('bcryptjs');
const db = require('../src/db');
const configModule = require('../src/config');
const { buildApp } = require('../src/app');
const keys = require('../src/lib/keys');
const ent = require('../src/lib/entitlement');
const appVerifier = require('../../services/entitlement');

const SECRET = process.env.LEGACY_KEY_SECRET;
const M1 = 'a'.repeat(64);
const M2 = 'b'.repeat(64);
const M3 = 'c'.repeat(64);
const PASSWORD = 'correct-horse-battery';

// A key whose expiry is comfortably ahead, so no test accidentally depends on
// the calendar. v3 and v4 of the same period, because they are capped
// differently and that difference is the point.
const V4_KEY = keys.buildLicenseKey(2030, 6, 30, SECRET);
const V3_KEY = keys.buildLegacyLicenseKey(2030, 6, SECRET);

let pass = 0, fail = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Empty every table. Each test starts from nothing so order never matters. */
async function wipe() {
  await db.query(`TRUNCATE licenses, devices, device_tokens, rate_limits,
                           admin_users, admin_sessions RESTART IDENTITY CASCADE`);
  // audit_log has an insert-only trigger, so TRUNCATE is the only way to clear
  // it — the trigger is FOR EACH ROW on UPDATE/DELETE and TRUNCATE fires
  // neither. That it survives a DELETE is itself asserted further down.
  await db.query('TRUNCATE audit_log');
}

async function makeAdmin(role) {
  const { rows } = await db.query(
    `INSERT INTO admin_users (email, password_hash, name, role)
     VALUES ($1, $2, 'Owner', $3) RETURNING id`,
    ['owner@example.com', bcrypt.hashSync(PASSWORD, 10), role || 'owner']
  );
  return rows[0].id;
}

/** Sign in and return the headers a portal request carries. */
async function signIn(app) {
  const res = await app.inject({
    method: 'POST', url: '/admin/api/login',
    payload: { email: 'owner@example.com', password: PASSWORD }
  });
  assert.strictEqual(res.statusCode, 200, 'sign-in failed: ' + res.body);
  const jar = {};
  for (const c of res.cookies) jar[c.name] = c.value;
  return {
    cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '),
    'x-csrf-token': jar.cp_csrf
  };
}

const register = (app, licenseKey, machineId) => app.inject({
  method: 'POST', url: '/v1/devices/register',
  payload: { licenseKey, machineId, appVersion: '4.0.0', os: 'win32' }
});

const getToken = (app, deviceId, deviceSecret) => app.inject({
  method: 'POST', url: '/v1/devices/token', payload: { deviceId, deviceSecret }
});

const getEntitlement = (app, token) => app.inject({
  method: 'GET', url: '/v1/entitlement', headers: { authorization: 'Bearer ' + token }
});

const body = (res) => JSON.parse(res.body);

/** Register and take a token in one step — the app's whole startup handshake. */
async function onboard(app, key, machine) {
  const reg = body(await register(app, key, machine));
  assert.ok(reg.success, 'register failed: ' + JSON.stringify(reg));
  const tok = body(await getToken(app, reg.data.deviceId, reg.data.deviceSecret));
  assert.ok(tok.success, 'token failed: ' + JSON.stringify(tok));
  return { ...reg.data, token: tok.data.token };
}

// ══════════════════════════════════════════════════════════════════════════
// Schema — the constraints and triggers every route leans on
// ══════════════════════════════════════════════════════════════════════════

test('the audit log is insert-only, enforced by the DATABASE', async () => {
  await wipe();
  await db.query(
    `INSERT INTO audit_log (actor, action, details) VALUES ('a@b.c', 'test.action', '{}')`);

  // Convention is not enforcement. A refactor that starts editing history must
  // hit a wall in Postgres, not a code review.
  await assert.rejects(
    () => db.query("UPDATE audit_log SET actor = 'someone else'"),
    /insert-only/, 'an UPDATE on audit_log must be refused');
  await assert.rejects(
    () => db.query('DELETE FROM audit_log'),
    /insert-only/, 'a DELETE on audit_log must be refused');

  const { rows } = await db.query('SELECT actor FROM audit_log');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].actor, 'a@b.c');
});

test('updated_at moves on its own, and created_at does not', async () => {
  await wipe();
  const { rows } = await db.query(
    `INSERT INTO licenses (key_fingerprint, key_version, key_expiry_part,
                           key_expires_at, expires_at)
     VALUES ('fp-1', 4, '0FYR', NOW(), NOW())
     RETURNING id, created_at, updated_at`);
  const before = rows[0];
  await new Promise((r) => setTimeout(r, 10));
  const after = (await db.query(
    "UPDATE licenses SET notes = 'touched' WHERE id = $1 RETURNING created_at, updated_at",
    [before.id])).rows[0];

  assert.ok(after.updated_at > before.updated_at, 'the updated_at trigger did not fire');
  assert.strictEqual(after.created_at.getTime(), before.created_at.getTime(),
    'created_at must never move');
});

test('the CHECK constraints refuse states no route should ever produce', async () => {
  await wipe();
  const insert = (cols, vals) => db.query(
    `INSERT INTO licenses (key_fingerprint, key_version, key_expiry_part,
                           key_expires_at, expires_at${cols})
     VALUES ($1, 4, '0FYR', NOW(), NOW()${vals})`, ['fp-' + Math.random()]);

  await assert.rejects(() => insert(', max_devices', ", 0"),
    /max_devices/, 'a licence for zero computers is not a licence');
  await assert.rejects(() => insert(', status', ", 'cancelled'"),
    /status/, 'an unknown status must be refused, not stored');
  await assert.rejects(() => insert(', verification', ", 'maybe'"),
    /verification/, 'an unknown verification must be refused');
  await assert.rejects(
    () => db.query(`INSERT INTO licenses (key_fingerprint, key_version, key_expiry_part,
                                          key_expires_at, expires_at)
                    VALUES ('fp-v9', 9, '0FYR', NOW(), NOW())`),
    /key_version/, 'only v3 and v4 keys exist');
});

// ══════════════════════════════════════════════════════════════════════════
// Registration — the UPSERT, and what it must NOT overwrite
// ══════════════════════════════════════════════════════════════════════════

test('a first registration creates the licence and the device', async (app) => {
  await wipe();
  const res = await register(app, V4_KEY, M1);
  assert.strictEqual(res.statusCode, 201, res.body);
  const d = body(res).data;

  assert.ok(d.deviceSecret && d.deviceSecret.length >= 40, 'no device secret returned');
  assert.strictEqual(d.verification, 'unverified',
    'a key this database has never seen is admitted, and flagged for the owner');

  // The secret is a credential. Only its hash may exist in the table.
  const { rows } = await db.query('SELECT secret_hash, status FROM devices WHERE id = $1',
    [d.deviceId]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].status, 'active');
  assert.notStrictEqual(rows[0].secret_hash, d.deviceSecret, 'the secret was stored in the clear');
  assert.strictEqual(rows[0].secret_hash, keys.hashDeviceSecret(d.deviceSecret));

  // Nor may the key itself.
  const lic = await db.query('SELECT * FROM licenses WHERE id = $1', [d.licenseId]);
  const serialised = JSON.stringify(lic.rows[0]);
  assert.ok(!serialised.includes(V4_KEY), 'the licence row contains the licence key');
});

test('re-registering the same machine rotates the secret without adding a row', async (app) => {
  await wipe();
  const first = body(await register(app, V4_KEY, M1)).data;
  const second = body(await register(app, V4_KEY, M1)).data;

  assert.strictEqual(first.deviceId, second.deviceId, 'a reinstall must not create a second device');
  assert.notStrictEqual(first.deviceSecret, second.deviceSecret, 'the secret must rotate');

  const { rows } = await db.query('SELECT COUNT(*) AS n FROM devices WHERE license_id = $1',
    [first.licenseId]);
  assert.strictEqual(rows[0].n, 1);
});

test('rotating the secret invalidates the old secret AND its live tokens', async (app) => {
  await wipe();
  const first = await onboard(app, V4_KEY, M1);

  // A customer re-registers precisely to get rid of a secret they think is
  // compromised. If the old one keeps working, that did nothing.
  await register(app, V4_KEY, M1);

  assert.strictEqual((await getEntitlement(app, first.token)).statusCode, 401,
    'a token bought with the old secret still works');
  assert.strictEqual((await getToken(app, first.deviceId, first.deviceSecret)).statusCode, 401,
    'the old secret still buys tokens');
});

test('re-registering must NOT undo a renewal granted in the portal', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const first = body(await register(app, V4_KEY, M1)).data;

  // The owner extends the licence past what the key itself encodes.
  const renewed = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + first.licenseId + '/renew',
    headers, payload: { addMonths: 12 }
  });
  assert.strictEqual(renewed.statusCode, 200, renewed.body);
  const extendedTo = body(renewed).data.license.expiresAt;

  // …and then the customer retypes their ORIGINAL key, because they reinstalled.
  // The ON CONFLICT deliberately touches only updated_at. If it wrote expires_at
  // from the key again, the extension the owner just granted would vanish and
  // nothing would say why.
  await register(app, V4_KEY, M1);

  const { rows } = await db.query('SELECT expires_at, key_expires_at FROM licenses WHERE id = $1',
    [first.licenseId]);
  assert.strictEqual(new Date(rows[0].expires_at).toISOString(), new Date(extendedTo).toISOString(),
    're-registration silently rolled back the renewal');
  assert.ok(rows[0].key_expires_at < rows[0].expires_at,
    "the key's own date must stay where it was");
});

test('a v4 licence caps at one computer; a v3 licence does not', async (app) => {
  await wipe();
  assert.strictEqual((await register(app, V4_KEY, M1)).statusCode, 201);

  const blocked = await register(app, V4_KEY, M2);
  assert.strictEqual(blocked.statusCode, 409, blocked.body);
  assert.strictEqual(body(blocked).code, 'DEVICE_LIMIT_REACHED');

  await wipe();
  // A v3 key was a pure function of its expiry month, so ONE key string
  // legitimately belongs to many hostels. Capping it would let whoever
  // registered first lock out every other paying customer holding it.
  assert.strictEqual((await register(app, V3_KEY, M1)).statusCode, 201);
  assert.strictEqual((await register(app, V3_KEY, M2)).statusCode, 201);
  assert.strictEqual((await register(app, V3_KEY, M3)).statusCode, 201);

  const { rows } = await db.query("SELECT max_devices FROM licenses");
  assert.strictEqual(rows[0].max_devices, null, 'a v3 licence must be uncapped');
});

test('the cap counts ACTIVE devices only, and never counts the caller twice', async (app) => {
  await wipe();
  const first = body(await register(app, V4_KEY, M1)).data;
  await db.query('UPDATE licenses SET max_devices = 2 WHERE id = $1', [first.licenseId]);

  assert.strictEqual((await register(app, V4_KEY, M2)).statusCode, 201, 'second seat');
  assert.strictEqual((await register(app, V4_KEY, M3)).statusCode, 409, 'third must be refused');

  // The machine already holding a seat re-registers: it is not competing with
  // itself, so the count excludes it and a reinstall never needs a ticket.
  assert.strictEqual((await register(app, V4_KEY, M1)).statusCode, 201,
    'an existing machine was blocked by its own seat');

  // Freeing a seat lets the waiting machine in.
  await db.query("UPDATE devices SET status = 'deactivated' WHERE machine_id = $1", [M2]);
  assert.strictEqual((await register(app, V4_KEY, M3)).statusCode, 201,
    'a deactivated device must not keep holding its seat');
});

test('a revoked licence is refused; a suspended one still registers', async (app) => {
  await wipe();
  const first = body(await register(app, V4_KEY, M1)).data;

  // Suspended must still register. The customer needs to be TOLD why their app
  // is read-only, and that answer only arrives inside an entitlement.
  await db.query("UPDATE licenses SET status = 'suspended' WHERE id = $1", [first.licenseId]);
  const suspended = await register(app, V4_KEY, M1);
  assert.strictEqual(suspended.statusCode, 201, suspended.body);

  await db.query("UPDATE licenses SET status = 'revoked' WHERE id = $1", [first.licenseId]);
  const revoked = await register(app, V4_KEY, M1);
  assert.strictEqual(revoked.statusCode, 403, revoked.body);
  assert.strictEqual(body(revoked).code, 'LICENSE_REVOKED');
});

test('a licence key is never accepted on the strength of its shape alone', async (app) => {
  await wipe();
  // Right format, wrong checksum — what a typo or a guess produces.
  const forged = 'HOSTEL-' + keys.parseLicenseKey(V4_KEY).expPart + '-ZZZZ-0000-0000';
  const res = await register(app, forged, M1);
  assert.strictEqual(res.statusCode, 400, res.body);
  assert.strictEqual(body(res).code, 'INVALID_KEY');

  const { rows } = await db.query('SELECT COUNT(*) AS n FROM licenses');
  assert.strictEqual(rows[0].n, 0, 'a rejected key must not leave a licence row behind');
});

// ══════════════════════════════════════════════════════════════════════════
// Tokens and entitlements
// ══════════════════════════════════════════════════════════════════════════

test('the full handshake round-trips, and the APP verifies what this server signed', async (app) => {
  await wipe();
  const dev = await onboard(app, V4_KEY, M1);
  const res = await getEntitlement(app, dev.token);
  assert.strictEqual(res.statusCode, 200, res.body);

  const verified = appVerifier.verifyEntitlement(
    body(res).data.entitlement, { keys: APP_KEYS, machineId: M1 });
  assert.ok(verified.valid, 'the app rejected this server\'s entitlement: ' + verified.reason);
  assert.strictEqual(verified.claims.status, 'ACTIVE');
  assert.strictEqual(verified.claims.deviceId, dev.deviceId);

  // Every flag, never a partial map — a missing flag reads as undefined in the
  // app, which is falsy, and would switch a feature off for everyone.
  assert.deepStrictEqual(Object.keys(verified.claims.features).sort(),
    ['archive', 'backup', 'expenses', 'multiUser', 'printDocs', 'reports']);
});

test('the entitlement is bound to the machine the database holds', async (app) => {
  await wipe();
  const dev = await onboard(app, V4_KEY, M1);
  const jws = body(await getEntitlement(app, dev.token)).data.entitlement;

  // Copied to a second hostel's machine, it must not verify — that is the
  // sharing a licence exists to prevent.
  const elsewhere = appVerifier.verifyEntitlement(jws, { keys: APP_KEYS, machineId: M2 });
  assert.strictEqual(elsewhere.valid, false);
  assert.strictEqual(elsewhere.reason, appVerifier.E.WRONG_MACHINE);
});

test('a portal suspension reaches the customer on their next sync', async (app) => {
  await wipe();
  const dev = await onboard(app, V4_KEY, M1);
  await db.query("UPDATE licenses SET status = 'suspended' WHERE id = $1", [dev.licenseId]);

  const verified = appVerifier.verifyEntitlement(
    body(await getEntitlement(app, dev.token)).data.entitlement,
    { keys: APP_KEYS, machineId: M1 });
  assert.ok(verified.valid);
  assert.strictEqual(verified.claims.status, 'SUSPENDED');
});

test('an expired device token is refused, and the sweep clears it', async (app) => {
  await wipe();
  const dev = await onboard(app, V4_KEY, M1);
  await db.query("UPDATE device_tokens SET expires_at = NOW() - INTERVAL '1 minute'");

  const res = await getEntitlement(app, dev.token);
  assert.strictEqual(res.statusCode, 401, res.body);
  assert.strictEqual(body(res).code, 'DEVICE_TOKEN_EXPIRED');

  // The next token exchange sweeps the dead rows, so the table does not grow
  // forever without a scheduled job to run.
  await getToken(app, dev.deviceId, dev.deviceSecret);
  const { rows } = await db.query('SELECT COUNT(*) AS n FROM device_tokens WHERE expires_at < NOW()');
  assert.strictEqual(rows[0].n, 0, 'expired tokens were never swept');
});

test('deactivating a device closes the window immediately', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const dev = await onboard(app, V4_KEY, M1);

  const { rows } = await db.query('SELECT id FROM devices WHERE machine_id = $1', [M1]);
  const res = await app.inject({
    method: 'POST', url: '/admin/api/devices/' + rows[0].id + '/status',
    headers, payload: { status: 'deactivated', reason: 'sold the PC' }
  });
  assert.strictEqual(res.statusCode, 200, res.body);

  // The point of deactivating is to stop it NOW, not when the token happens to
  // expire fifteen minutes later.
  const live = await db.query('SELECT COUNT(*) AS n FROM device_tokens WHERE device_id = $1',
    [rows[0].id]);
  assert.strictEqual(live.rows[0].n, 0, 'the device kept its live tokens');
  assert.strictEqual((await getEntitlement(app, dev.token)).statusCode, 401);
  assert.strictEqual((await getToken(app, dev.deviceId, dev.deviceSecret)).statusCode, 401);
});

test('every device failure gives the SAME answer', async (app) => {
  await wipe();
  const dev = await onboard(app, V4_KEY, M1);
  const shape = (res) => [res.statusCode, body(res).code];

  const unknown = await getToken(app, '00000000-0000-0000-0000-000000000000', 'x'.repeat(43));
  const wrongSecret = await getToken(app, dev.deviceId, 'y'.repeat(43));

  // Telling them apart would let anyone holding a device id learn whether it
  // exists and whether its licence is live.
  assert.deepStrictEqual(shape(unknown), shape(wrongSecret));
  assert.deepStrictEqual(shape(unknown), [401, 'DEVICE_UNAUTHORIZED']);
});

// ══════════════════════════════════════════════════════════════════════════
// Rate limiting — the window CASE expression, which only Postgres evaluates
// ══════════════════════════════════════════════════════════════════════════

test('registration is rate limited per IP, and the window resets', async (app) => {
  await wipe();
  let last;
  for (let i = 0; i < 21; i++) last = await register(app, V4_KEY, M1);
  assert.strictEqual(last.statusCode, 429, 'the ceiling was never reached: ' + last.body);
  assert.strictEqual(body(last).code, 'RATE_LIMIT');

  const { rows } = await db.query("SELECT hits FROM rate_limits WHERE bucket = 'register'");
  assert.ok(rows[0].hits > 20, 'the counter did not accumulate');

  // Age the window past its hour. The CASE must RESET the count rather than
  // keep adding — an IP locked out forever is the failure this guards.
  await db.query("UPDATE rate_limits SET window_start = NOW() - INTERVAL '2 hours'");
  const after = await register(app, V4_KEY, M1);
  assert.strictEqual(after.statusCode, 201, 'the window never reset: ' + after.body);

  const reset = await db.query("SELECT hits FROM rate_limits WHERE bucket = 'register'");
  assert.strictEqual(reset.rows[0].hits, 1, 'the window reset did not zero the count');
});

test('sign-in is rate limited on its own 15-minute window', async (app) => {
  await wipe();
  await makeAdmin();
  let last;
  for (let i = 0; i < 11; i++) {
    last = await app.inject({
      method: 'POST', url: '/admin/api/login',
      payload: { email: 'owner@example.com', password: 'wrong' }
    });
  }
  assert.strictEqual(last.statusCode, 429, last.body);

  // A separate bucket from the device endpoints — a hostel hammering register
  // must never lock the owner out of the portal.
  const { rows } = await db.query('SELECT bucket FROM rate_limits ORDER BY bucket');
  assert.deepStrictEqual(rows.map((r) => r.bucket), ['admin_login']);
});

// ══════════════════════════════════════════════════════════════════════════
// The portal, against real SQL
// ══════════════════════════════════════════════════════════════════════════

test('the summary counts what the owner is actually looking at', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  await register(app, V4_KEY, M1);
  await register(app, V3_KEY, M2);
  await db.query(`UPDATE licenses SET status = 'suspended'
                   WHERE key_version = 3`);

  const data = body(await app.inject({
    method: 'GET', url: '/admin/api/summary', headers })).data;

  // INT8 comes back from node-postgres as a STRING unless the driver is told
  // otherwise; "3" + 1 is "31" and "10" < "9" is true. The parser in db.js is
  // what stops that, and this is where it is actually proven.
  for (const [k, v] of Object.entries(data.licenses)) {
    assert.strictEqual(typeof v, 'number', 'licenses.' + k + ' came back as a ' + typeof v);
  }
  assert.strictEqual(data.licenses.total, 2);
  assert.strictEqual(data.licenses.suspended, 1);
  assert.strictEqual(data.licenses.unverified, 2);
  assert.strictEqual(data.devices.total, 2);
});

test('the licence list aggregates devices without multiplying the rows', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  await register(app, V3_KEY, M1);
  await register(app, V3_KEY, M2);

  const data = body(await app.inject({
    method: 'GET', url: '/admin/api/licenses', headers })).data;

  // One licence, two devices. A LEFT JOIN without the GROUP BY would return the
  // licence twice and the portal would show a duplicate customer.
  assert.strictEqual(data.length, 1);
  assert.strictEqual(data[0].deviceCount, 2);
  assert.strictEqual(typeof data[0].deviceCount, 'number');
  assert.strictEqual(data[0].appVersion, '4.0.0');
});

test('the list never carries the key itself, nor its checksum', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  await register(app, V4_KEY, M1);

  const raw = (await app.inject({ method: 'GET', url: '/admin/api/licenses', headers })).body;
  assert.ok(!raw.includes(V4_KEY), 'the portal returned a live licence key');
  assert.ok(!raw.includes(keys.parseLicenseKey(V4_KEY).checksum),
    'the portal returned the key checksum');

  // Deliberately NOT claiming more than that. keyHint prints the expiry part
  // and the serial, and a v4 checksum is a pure function of those two under a
  // secret that ships in app.asar — so this asserts the key is not TRANSMITTED,
  // not that it cannot be derived. See the note on keyHint in routes/admin.js.
});

test('search matches a hostel by name, and a wildcard is a literal', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  await register(app, V4_KEY, M1);
  await db.query("UPDATE licenses SET hostel_name = 'Al-Noor Boys Hostel', city = 'Peshawar'");

  const hit = body(await app.inject({
    method: 'GET', url: '/admin/api/licenses?search=noor', headers })).data;
  assert.strictEqual(hit.length, 1, 'search must be case-insensitive and partial');

  // '%' is a character an admin can type. It must not silently mean "everyone".
  const wildcard = body(await app.inject({
    method: 'GET', url: '/admin/api/licenses?search=%25', headers })).data;
  assert.strictEqual(wildcard.length, 0, 'a LIKE wildcard leaked out of the search box');
});

test('renewing by months lands on the right day at a month end', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const first = body(await register(app, V4_KEY, M1)).data;

  // 31 January + 1 month. `setMonth(getMonth() + 1)` overflowed to 3 MARCH,
  // silently granting an extra month and skipping February altogether.
  await db.query("UPDATE licenses SET expires_at = '2031-01-31T00:00:00Z' WHERE id = $1",
    [first.licenseId]);
  const res = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + first.licenseId + '/renew',
    headers, payload: { addMonths: 1 }
  });
  assert.strictEqual(res.statusCode, 200, res.body);
  assert.strictEqual(body(res).data.license.expiresAt.slice(0, 10), '2031-02-28');

  // And a leap year lands on the 29th, not the 1st of March.
  await db.query("UPDATE licenses SET expires_at = '2032-01-31T00:00:00Z' WHERE id = $1",
    [first.licenseId]);
  const leap = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + first.licenseId + '/renew',
    headers, payload: { addMonths: 1 }
  });
  assert.strictEqual(body(leap).data.license.expiresAt.slice(0, 10), '2032-02-29');
});

test('renewing extends from today when the licence already lapsed', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const first = body(await register(app, V4_KEY, M1)).data;

  // Lapsed three months ago. The customer is paying for twelve months from now,
  // not for twelve months of which three are already gone.
  await db.query("UPDATE licenses SET expires_at = NOW() - INTERVAL '3 months' WHERE id = $1",
    [first.licenseId]);
  const res = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + first.licenseId + '/renew',
    headers, payload: { addMonths: 12 }
  });
  const landed = new Date(body(res).data.license.expiresAt);
  const monthsOut = (landed - Date.now()) / (30.44 * 86400000);
  assert.ok(monthsOut > 11.5, 'the renewal was swallowed by the lapsed gap: ' + monthsOut);
});

test('renewal tells the admin whether it will actually reach the customer', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);

  // A licence issued in the portal that has never phoned home. Extending the
  // date here reaches nobody — the portal has to say so, or the owner thinks a
  // customer is renewed when they are about to be locked out.
  const issued = body(await app.inject({
    method: 'POST', url: '/admin/api/issue-key', headers,
    payload: { expiresOn: '2030-12-31', hostelName: 'Offline Hostel' }
  })).data;

  const offline = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + issued.license.id + '/renew',
    headers, payload: { addMonths: 12 }
  });
  assert.strictEqual(body(offline).data.reachesCustomerOnline, false);

  // Once their app connects, the online path applies.
  await register(app, issued.key, M1);
  const online = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + issued.license.id + '/renew',
    headers, payload: { addMonths: 12 }
  });
  assert.strictEqual(body(online).data.reachesCustomerOnline, true);
});

test('a key issued in the portal is recorded, shown once, and registers', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);

  const res = await app.inject({
    method: 'POST', url: '/admin/api/issue-key', headers,
    payload: { expiresOn: '2030-09-30', hostelName: 'New Hostel', city: 'Lahore', maxDevices: 2 }
  });
  assert.strictEqual(res.statusCode, 201, res.body);
  const issued = body(res).data;

  // Known BEFORE the app ever registers — the gap that made the migration
  // awkward, where a key was cut by a CLI that logged nothing.
  assert.strictEqual(issued.license.verification, 'verified');
  assert.strictEqual(issued.license.hostelName, 'New Hostel');
  assert.strictEqual(issued.license.maxDevices, 2);

  // Only the fingerprint is stored, exactly as with a customer-supplied key.
  const { rows } = await db.query('SELECT key_fingerprint FROM licenses WHERE id = $1',
    [issued.license.id]);
  assert.strictEqual(rows[0].key_fingerprint,
    keys.keyFingerprint(keys.parseLicenseKey(issued.key)));

  // And it is a real key: the app can register with it, onto the row that
  // already exists rather than creating a second one.
  const reg = await register(app, issued.key, M1);
  assert.strictEqual(reg.statusCode, 201, reg.body);
  assert.strictEqual(body(reg).data.licenseId, issued.license.id,
    'registering an issued key created a DUPLICATE licence');
  assert.strictEqual(body(reg).data.verification, 'verified',
    'a key the owner issued must not come back unverified');
});

test('two keys issued on the same day are different keys', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const mint = () => app.inject({
    method: 'POST', url: '/admin/api/issue-key', headers, payload: { expiresOn: '2030-09-30' }
  });
  const a = body(await mint()).data.key;
  const b = body(await mint()).data.key;

  // v3 keys were a pure function of the expiry month, which is how ~50 hostels
  // ended up sharing 12 strings. v4 carries a random serial so this cannot
  // happen again.
  assert.notStrictEqual(a, b);
  const { rows } = await db.query('SELECT COUNT(DISTINCT key_fingerprint) AS n FROM licenses');
  assert.strictEqual(rows[0].n, 2);
});

test('feature overrides survive the round trip into the entitlement', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const dev = await onboard(app, V4_KEY, M1);

  const res = await app.inject({
    method: 'PUT', url: '/admin/api/licenses/' + dev.licenseId + '/features',
    headers, payload: { features: { reports: false, archive: false } }
  });
  assert.strictEqual(res.statusCode, 200, res.body);
  assert.deepStrictEqual(body(res).data.featureOverrides, { reports: false, archive: false });

  const verified = appVerifier.verifyEntitlement(
    body(await getEntitlement(app, dev.token)).data.entitlement,
    { keys: APP_KEYS, machineId: M1 });
  assert.strictEqual(verified.claims.features.reports, false);
  assert.strictEqual(verified.claims.features.archive, false);
  assert.strictEqual(verified.claims.features.backup, true, 'an untouched flag must keep its default');
});

test('a feature PUT with no body does not wipe the overrides', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const first = body(await register(app, V4_KEY, M1)).data;
  await db.query(`UPDATE licenses SET features = '{"reports":false}'::jsonb WHERE id = $1`,
    [first.licenseId]);

  // This used to validate as "no overrides" and overwrite the row with {},
  // silently switching every flag back on.
  const res = await app.inject({
    method: 'PUT', url: '/admin/api/licenses/' + first.licenseId + '/features', headers });
  assert.strictEqual(res.statusCode, 400, res.body);

  const { rows } = await db.query('SELECT features FROM licenses WHERE id = $1', [first.licenseId]);
  assert.deepStrictEqual(rows[0].features, { reports: false }, 'the overrides were wiped');
});

test('the computer limit cannot be lifted by omission', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const first = body(await register(app, V4_KEY, M1)).data;

  // An empty body used to read as `undefined` and silently uncap the licence.
  const empty = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + first.licenseId + '/devices-limit',
    headers, payload: {} });
  assert.strictEqual(empty.statusCode, 400, empty.body);

  const held = await db.query('SELECT max_devices FROM licenses WHERE id = $1', [first.licenseId]);
  assert.strictEqual(held.rows[0].max_devices, 1, 'the cap was lifted by an empty request');

  // Unlimited is still available — it just has to be asked for out loud.
  const explicit = await app.inject({
    method: 'POST', url: '/admin/api/licenses/' + first.licenseId + '/devices-limit',
    headers, payload: { maxDevices: null } });
  assert.strictEqual(explicit.statusCode, 200, explicit.body);
  const lifted = await db.query('SELECT max_devices FROM licenses WHERE id = $1', [first.licenseId]);
  assert.strictEqual(lifted.rows[0].max_devices, null);
});

test('a mistyped id is "no such licence", not "the server is broken"', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);

  // A non-UUID reached Postgres as a 22P02 and surfaced as a 500 — which reads
  // to an admin as an outage rather than a typo.
  for (const url of ['/admin/api/licenses/not-a-uuid',
                     '/admin/api/licenses/not-a-uuid/preview']) {
    const res = await app.inject({ method: 'GET', url, headers });
    assert.strictEqual(res.statusCode, 400, url + ' -> ' + res.body);
    assert.strictEqual(body(res).code, 'VALIDATION_ERROR');
  }

  // A well-formed id that simply is not there is a clean 404.
  const missing = await app.inject({
    method: 'GET', url: '/admin/api/licenses/00000000-0000-0000-0000-000000000000', headers });
  assert.strictEqual(missing.statusCode, 404, missing.body);
});

test('the audit log survives a hostile page size', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);

  // `LIMIT -5` is a Postgres syntax error, and it used to reach Postgres.
  for (const qs of ['?limit=-5', '?offset=-1', '?limit=abc', '?limit=99999', '?offset=abc']) {
    const res = await app.inject({ method: 'GET', url: '/admin/api/audit' + qs, headers });
    assert.strictEqual(res.statusCode, 200, qs + ' -> ' + res.body);
    assert.ok(Array.isArray(body(res).data));
  }
});

test('every privileged action leaves a row naming who did it', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const first = body(await register(app, V4_KEY, M1)).data;
  const url = '/admin/api/licenses/' + first.licenseId;

  await app.inject({ method: 'POST', url: url + '/status', headers,
    payload: { status: 'suspended', reason: 'non-payment' } });
  await app.inject({ method: 'POST', url: url + '/renew', headers, payload: { addMonths: 6 } });
  await app.inject({ method: 'PATCH', url, headers, payload: { hostelName: 'Renamed' } });

  const { rows } = await db.query(
    `SELECT actor, action, details FROM audit_log
      WHERE target_id = $1 ORDER BY created_at`, [first.licenseId]);
  assert.deepStrictEqual(rows.map((r) => r.action),
    ['license.status', 'license.renew', 'license.update']);
  assert.ok(rows.every((r) => r.actor === 'owner@example.com'),
    'an audit row that does not name the actor is not an audit row');

  // "Why" is the question asked when it matters most.
  assert.strictEqual(rows[0].details.reason, 'non-payment');
  assert.strictEqual(rows[0].details.from.status, 'active');
  assert.strictEqual(rows[0].details.to.status, 'suspended');
});

test('the preview answers "what will the customer see" before anyone asks them', async (app) => {
  await wipe();
  await makeAdmin();
  const headers = await signIn(app);
  const first = body(await register(app, V4_KEY, M1)).data;
  const url = '/admin/api/licenses/' + first.licenseId + '/preview';

  assert.strictEqual(body(await app.inject({ method: 'GET', url, headers })).data.status, 'ACTIVE');

  await db.query("UPDATE licenses SET expires_at = NOW() - INTERVAL '3 days' WHERE id = $1",
    [first.licenseId]);
  assert.strictEqual(body(await app.inject({ method: 'GET', url, headers })).data.status, 'GRACE',
    'just past expiry is grace, not expired');

  await db.query("UPDATE licenses SET expires_at = NOW() - INTERVAL '90 days' WHERE id = $1",
    [first.licenseId]);
  assert.strictEqual(body(await app.inject({ method: 'GET', url, headers })).data.status, 'EXPIRED');

  // An administrative decision outranks the calendar in both directions.
  await db.query("UPDATE licenses SET status = 'revoked' WHERE id = $1", [first.licenseId]);
  assert.strictEqual(body(await app.inject({ method: 'GET', url, headers })).data.status, 'REVOKED');
});

test('a device token cannot reach the portal, and a session cannot mint one', async (app) => {
  await wipe();
  await makeAdmin();
  const dev = await onboard(app, V4_KEY, M1);
  const headers = await signIn(app);

  // The separation is structural: neither verifier can even read the other's
  // credential, because each resolves a row in its OWN table.
  const asDevice = await app.inject({
    method: 'GET', url: '/admin/api/summary',
    headers: { authorization: 'Bearer ' + dev.token, cookie: 'cp_session=' + dev.token }
  });
  assert.strictEqual(asDevice.statusCode, 401, asDevice.body);

  const sessionCookie = headers.cookie.match(/cp_session=([^;]+)/)[1];
  const asAdmin = await getEntitlement(app, sessionCookie);
  assert.strictEqual(asAdmin.statusCode, 401, asAdmin.body);
});

// ══════════════════════════════════════════════════════════════════════════

async function main() {
  const config = configModule.assertValid(configModule.load());
  const app = await buildApp({ config, logger: false });

  console.log('\ncontrol plane — integration (real Postgres)\n');
  for (const [name, fn] of tests) {
    try { await fn(app); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
  }
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');

  await app.close();
  await db.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
