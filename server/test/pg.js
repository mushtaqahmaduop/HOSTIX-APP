/* ─── Control plane — against a REAL Postgres ────────────────────────────────

   The stubbed suite (test/http.js) proves the authorisation layer and says
   plainly that it does not prove the SQL. This one does: it migrates a scratch
   database from empty, runs the real server on a real port, and drives the
   whole owner's brief end to end — issue a key, bind it to one PC, hold a live
   stream, change a level and watch the change ARRIVE, lift a timed ban,
   revoke, release a PC, fleet switches, bulk actions, 2FA and roles.

   Every licence decision is read back the way the app reads it: the signed
   entitlement is verified with the APP's verifier, against the public key.

   Needs a disposable database — it DROPS the public schema first:

     TEST_DATABASE_URL=postgres://cp:cp@localhost/cp_test node test/pg.js

   Skips (exit 0) without TEST_DATABASE_URL, so `npm test` stays runnable on a
   machine with no Postgres. NEVER point it at production.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const URL_ = process.env.TEST_DATABASE_URL;
if (!URL_) {
  console.log('\ncontrol plane — real Postgres: SKIPPED (set TEST_DATABASE_URL to a scratch database)\n');
  process.exit(0);
}
if (/railway|supabase|rlwy|amazonaws/i.test(URL_)) {
  console.error('Refusing: TEST_DATABASE_URL looks like a hosted database. This suite drops the schema.');
  process.exit(1);
}
process.env.DATABASE_URL = URL_;

const SECRET = 'control-plane-test-secret';
const pair = crypto.generateKeyPairSync('ed25519');
process.env.ENTITLEMENT_SIGNING_JWK = JSON.stringify({
  kid: 'pg-kid', alg: 'EdDSA', use: 'sig', ...pair.privateKey.export({ format: 'jwk' })
});
const APP_KEYS = { 'pg-kid': pair.publicKey.export({ type: 'spki', format: 'pem' }) };

const db = require('../src/db');
const { buildApp } = require('../src/app');
const sweeper = require('../src/lib/sweeper');
const totp = require('../src/lib/totp');
const keys = require('../src/lib/keys');
const appVerifier = require('../../services/entitlement');

const CONFIG = {
  env: 'test', port: 0, host: '127.0.0.1', databaseUrl: URL_,
  sessionSecret: 'y'.repeat(48), sessionTtlHours: 12,
  legacyKeySecret: SECRET, signingConfigured: true, trustProxy: false
};

const OWNER = { email: 'owner@example.com', password: 'owner-password-123' };
const M1 = crypto.createHash('sha256').update('pc-one').digest('hex');
const M2 = crypto.createHash('sha256').update('pc-two').digest('hex');
const M3 = crypto.createHash('sha256').update('pc-three').digest('hex');

let pass = 0, fail = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Plumbing ────────────────────────────────────────────────────────────────
let app, base;

async function resetDatabase() {
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  await db.query(
    "INSERT INTO admin_users (email, name, role, password_hash) VALUES ($1, 'Owner', 'owner', $2)",
    [OWNER.email, await bcrypt.hash(OWNER.password, 4)]);
}

/** A tiny cookie-carrying portal client. */
function portal() {
  const jar = {};
  const c = {
    jar,
    async call(method, path, body) {
      const headers = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      const cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
      if (cookie) headers.cookie = cookie;
      if (jar.cp_csrf) headers['x-csrf-token'] = jar.cp_csrf;
      const res = await fetch(base + '/admin/api' + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body)
      });
      for (const sc of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
        const [kv] = sc.split(';');
        const i = kv.indexOf('=');
        jar[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
      }
      const json = await res.json().catch(() => null);
      return { status: res.status, json };
    },
    async login(email, password, code) {
      const r = await c.call('POST', '/login', Object.assign({ email, password }, code ? { code } : {}));
      return r;
    }
  };
  return c;
}

async function v1(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(base + '/v1' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function register(key, machineId) {
  return v1('POST', '/devices/register', { licenseKey: key, machineId, appVersion: '5.2.0', os: 'win32' });
}

async function tokenFor(reg) {
  const r = await v1('POST', '/devices/token', { deviceId: reg.deviceId, deviceSecret: reg.deviceSecret });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  return r.json.data.token;
}

/** Fetch the entitlement and verify it exactly as the app does. */
async function entitlement(token, machineId) {
  const r = await v1('GET', '/entitlement', undefined, token);
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const v = appVerifier.verifyEntitlement(r.json.data.entitlement, { keys: APP_KEYS, machineId });
  assert.ok(v.valid, 'the app would reject this entitlement: ' + v.reason);
  return v.claims;
}

/** Open an SSE stream and collect its events. */
function openStream(token) {
  const events = [];
  const ctrl = new AbortController();
  const ready = (async () => {
    const res = await fetch(base + '/v1/devices/stream', {
      headers: { authorization: 'Bearer ' + token }, signal: ctrl.signal
    });
    if (res.status !== 200) { events.push({ event: 'http', data: res.status }); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /^event: (.*)$/m.exec(block);
            const da = /^data: (.*)$/m.exec(block);
            if (ev) events.push({ event: ev[1], data: da ? JSON.parse(da[1]) : null });
          }
        }
      } catch (_) {}
    })();
  })();
  return {
    events, ready, close: () => ctrl.abort(),
    async waitFor(pred, ms) {
      const until = Date.now() + (ms || 3000);
      while (Date.now() < until) {
        const hit = events.find(pred);
        if (hit) return hit;
        await sleep(25);
      }
      return null;
    }
  };
}

// Shared across tests — they run in order and tell one story.
const S = {};

// ════════════════════════════════════════════════════════════════════════════

test('the owner signs in', async () => {
  S.owner = portal();
  const r = await S.owner.login(OWNER.email, OWNER.password);
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
});

test('registering a hostel issues an online-bound v5 key and records it first', async () => {
  const r = await S.owner.call('POST', '/issue-key', {
    expiresOn: '2030-06-30', hostelName: 'Test Hostel One', city: 'Test City', plan: 'Standard'
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.json));
  S.key = r.json.data.key;
  S.licId = r.json.data.license.id;
  assert.strictEqual(keys.resolveKeyVersion(S.key, SECRET), 5);
  assert.strictEqual(r.json.data.license.keyVersion, 5);
  assert.strictEqual(r.json.data.license.maxDevices, 1);
  assert.strictEqual(r.json.data.license.hostelName, 'Test Hostel One');
});

test('a v5 key the portal never issued is refused', async () => {
  const forged = keys.buildLicenseKey(2031, 1, 1, SECRET, 'ZZZZ', 5);
  const r = await register(forged, M1);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.json.code, 'KEY_NOT_ISSUED');
});

test('the first PC binds the key; a second PC is refused', async () => {
  const a = await register(S.key, M1);
  assert.strictEqual(a.status, 201, JSON.stringify(a.json));
  assert.strictEqual(a.json.data.effectiveStatus, 'ACTIVE');
  assert.strictEqual(a.json.data.keyVersion, 5);
  S.devA = a.json.data;
  const b = await register(S.key, M2);
  assert.strictEqual(b.status, 409);
  assert.strictEqual(b.json.code, 'DEVICE_LIMIT_REACHED');
  // The same PC again (a reinstall) is fine.
  const again = await register(S.key, M1);
  assert.strictEqual(again.status, 201);
  S.devA = again.json.data;
});

test('an active licence: everything allowed, and the app verifies it', async () => {
  S.tokA = await tokenFor(S.devA);
  const c = await entitlement(S.tokA, M1);
  assert.strictEqual(c.status, 'ACTIVE');
  assert.strictEqual(c.level, 'active');
  assert.deepStrictEqual(c.restrictions, { dataEntry: true, printing: true, exporting: true });
  assert.strictEqual(c.reason, null);
});

test('a change in the portal reaches a live stream in seconds', async () => {
  S.stream = openStream(S.tokA);
  await S.stream.ready;
  const hello = await S.stream.waitFor((e) => e.event === 'hello');
  assert.ok(hello, 'no hello on the stream');

  const t0 = Date.now();
  const r = await S.owner.call('POST', '/licenses/' + S.licId + '/status',
    { status: 'readonly', reason: 'Dues outstanding' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const changed = await S.stream.waitFor((e) => e.event === 'changed', 3000);
  assert.ok(changed, 'the stream never said the licence changed');
  S.pushMs = Date.now() - t0;

  const c = await entitlement(S.tokA, M1);
  assert.strictEqual(c.status, 'ACTIVE', 'read-only must travel as ACTIVE + restrictions');
  assert.strictEqual(c.level, 'readonly');
  assert.deepStrictEqual(c.restrictions, { dataEntry: false, printing: true, exporting: true });
  assert.strictEqual(c.reason, 'Dues outstanding');
});

test('the portal knows the change was received', async () => {
  const r = await S.owner.call('GET', '/licenses/' + S.licId);
  assert.strictEqual(r.json.data.license.delivered, true);
  assert.strictEqual(r.json.data.devices[0].upToDate, true);
  assert.strictEqual(r.json.data.devices[0].online, true, 'a device holding a stream is online');
});

test('restricted: no data entry, printing or exporting', async () => {
  await S.owner.call('POST', '/licenses/' + S.licId + '/status', { status: 'restricted', reason: 'Audit' });
  const c = await entitlement(S.tokA, M1);
  assert.deepStrictEqual(c.restrictions, { dataEntry: false, printing: false, exporting: false });
});

test('one switch at a time: block exporting alone on an active licence', async () => {
  await S.owner.call('POST', '/licenses/' + S.licId + '/status', { status: 'active' });
  const r = await S.owner.call('PUT', '/licenses/' + S.licId + '/restrictions',
    { restrictions: { exporting: false } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const c = await entitlement(S.tokA, M1);
  assert.deepStrictEqual(c.restrictions, { dataEntry: true, printing: true, exporting: false });
  assert.strictEqual(c.reason, null, 'an active licence carries no reason');
  await S.owner.call('PUT', '/licenses/' + S.licId + '/restrictions', { restrictions: {} });
});

test('a feature lock arrives on the stream and in the entitlement', async () => {
  const before = S.stream.events.length;
  await S.owner.call('PUT', '/licenses/' + S.licId + '/features', { features: { reports: false } });
  const ev = await S.stream.waitFor((e, i) => e.event === 'changed' && S.stream.events.indexOf(e) >= before);
  assert.ok(ev);
  const c = await entitlement(S.tokA, M1);
  assert.strictEqual(c.features.reports, false);
  assert.strictEqual(c.features.archive, true);
  await S.owner.call('PUT', '/licenses/' + S.licId + '/features', { features: {} });
});

test('a timed suspension locks now and lifts itself', async () => {
  await S.owner.call('POST', '/licenses/' + S.licId + '/status', { status: 'readonly', reason: 'Dues' });
  const r = await S.owner.call('POST', '/licenses/' + S.licId + '/status',
    { status: 'suspended', hours: 168, reason: 'Seven-day ban' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.data.statusBefore, 'readonly');
  let c = await entitlement(S.tokA, M1);
  assert.strictEqual(c.status, 'SUSPENDED');
  assert.ok(c.until, 'a timed ban carries its end date');
  assert.deepStrictEqual(c.restrictions, { dataEntry: false, printing: false, exporting: false });

  // Wind the end date into the past, then sweep.
  await db.query("UPDATE licenses SET status_until = NOW() - INTERVAL '1 minute' WHERE id = $1", [S.licId]);
  c = await entitlement(S.tokA, M1);
  assert.strictEqual(c.status, 'ACTIVE', 'a passed ban must not hold the hostel a minute longer');
  assert.strictEqual(c.level, 'readonly', 'it falls back to the level it interrupted');
  assert.strictEqual(await sweeper.sweepOnce(), 1);
  const d = await S.owner.call('GET', '/licenses/' + S.licId);
  assert.strictEqual(d.json.data.license.status, 'readonly');
  assert.strictEqual(d.json.data.license.statusUntil, null);
  assert.ok(d.json.data.audit.some((a) => a.action === 'license.level_auto_lift' && a.actor === 'system'));
});

test('revoking needs the owner password; the app is still TOLD', async () => {
  const noPw = await S.owner.call('POST', '/licenses/' + S.licId + '/status', { status: 'revoked' });
  assert.strictEqual(noPw.status, 403);
  assert.strictEqual(noPw.json.code, 'PASSWORD_REQUIRED');
  const ok = await S.owner.call('POST', '/licenses/' + S.licId + '/status',
    { status: 'revoked', reason: 'Contract ended', password: OWNER.password });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));

  // The token exchange still works — the fix for "revocation never reaches the app".
  const tok = await tokenFor(S.devA);
  const c = await entitlement(tok, M1);
  assert.strictEqual(c.status, 'REVOKED');
  assert.strictEqual(c.reason, 'Contract ended');

  // And re-registering (a reinstall) is not a way out: it registers, and is told.
  const again = await register(S.key, M1);
  assert.strictEqual(again.status, 201);
  assert.strictEqual(again.json.data.effectiveStatus, 'REVOKED');
  S.devA = again.json.data;
  S.tokA = await tokenFor(S.devA);

  const back = await S.owner.call('POST', '/licenses/' + S.licId + '/status',
    { status: 'active', password: OWNER.password });
  assert.strictEqual(back.status, 200);
});

test('a timed revoke is refused — revoking is permanent', async () => {
  const r = await S.owner.call('POST', '/licenses/' + S.licId + '/status',
    { status: 'revoked', hours: 24, password: OWNER.password });
  assert.strictEqual(r.status, 400);
});

test('releasing a PC locks it and frees the seat for a new PC', async () => {
  const detail = await S.owner.call('GET', '/licenses/' + S.licId);
  const devId = detail.json.data.devices[0].id;
  const rel = await S.owner.call('POST', '/devices/' + devId + '/status',
    { status: 'deactivated', reason: 'Moved to the new office PC' });
  assert.strictEqual(rel.status, 200, JSON.stringify(rel.json));

  const c = await entitlement(S.tokA, M1);
  assert.strictEqual(c.status, 'REVOKED');
  assert.strictEqual(c.reason, 'Moved to the new office PC');

  const b = await register(S.key, M2);
  assert.strictEqual(b.status, 201, JSON.stringify(b.json));
  S.devB = b.json.data;
  S.tokB = await tokenFor(S.devB);
  assert.strictEqual((await entitlement(S.tokB, M2)).status, 'ACTIVE');

  // The released PC reinstalling does not put itself back.
  const a = await register(S.key, M1);
  assert.strictEqual(a.status, 409, 'the seat is taken');

  // Nor can the portal put it back while the seat is taken.
  const re = await S.owner.call('POST', '/devices/' + devId + '/status', { status: 'active' });
  assert.strictEqual(re.status, 409);
  S.stream.close();
});

test('fleet switches reach every hostel, on the stream', async () => {
  const s = openStream(S.tokB);
  await s.ready;
  await s.waitFor((e) => e.event === 'hello');
  const noPw = await S.owner.call('PUT', '/fleet', { restrictions: { printing: false } });
  assert.strictEqual(noPw.status, 400, 'password is required by schema');
  const r = await S.owner.call('PUT', '/fleet', {
    restrictions: { printing: false }, features: { backup: false }, password: OWNER.password
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const ev = await s.waitFor((e) => e.event === 'changed' && e.data.scope === 'fleet');
  assert.ok(ev, 'the fleet change was not pushed');
  const c = await entitlement(S.tokB, M2);
  assert.strictEqual(c.restrictions.printing, false);
  assert.strictEqual(c.features.backup, false);
  // A licence override beats the fleet default for features.
  await S.owner.call('PUT', '/licenses/' + S.licId + '/features', { features: { backup: true } });
  assert.strictEqual((await entitlement(S.tokB, M2)).features.backup, true);
  await S.owner.call('PUT', '/fleet', { restrictions: {}, features: {}, password: OWNER.password });
  s.close();
});

test('expiry can be shortened as well as extended', async () => {
  const before = (await S.owner.call('GET', '/licenses/' + S.licId)).json.data.license.expiresAt;
  const r = await S.owner.call('POST', '/licenses/' + S.licId + '/expiry', { days: -30, reason: 'Correction' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const after = new Date(r.json.data.license.expiresAt).getTime();
  assert.strictEqual(new Date(before).getTime() - after, 30 * 86400000);
  const c = await entitlement(S.tokB, M2);
  assert.strictEqual(new Date(c.expiresAt).getTime(), after);
  const set = await S.owner.call('POST', '/licenses/' + S.licId + '/expiry', { expiresAt: '2031-01-15' });
  assert.strictEqual(set.json.data.license.expiresAt.slice(0, 10), '2031-01-15');
});

test('bulk: many hostels, one transaction, password required', async () => {
  // v4 keys are no longer issued (owner, 2026-09-24): asking for one is refused.
  const v4 = await S.owner.call('POST', '/issue-key', { expiresOn: '2030-01-01', hostelName: 'Old Style', keyVersion: 4 });
  assert.strictEqual(v4.status, 400, 'a v4 key was issued');
  assert.strictEqual(v4.json.code, 'V4_RETIRED');
  const two = await S.owner.call('POST', '/issue-key', { expiresOn: '2030-01-01', hostelName: 'Test Hostel Two' });
  assert.strictEqual(two.status, 201);
  assert.strictEqual(keys.resolveKeyVersion(two.json.data.key, SECRET), 5, 'every issued key is v5');
  const ids = [S.licId, two.json.data.license.id];
  const noPw = await S.owner.call('POST', '/bulk', { ids, action: 'status', status: 'readonly' });
  assert.strictEqual(noPw.status, 403);
  const r = await S.owner.call('POST', '/bulk',
    { ids, action: 'status', status: 'readonly', reason: 'Maintenance', password: OWNER.password });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.data.changed, 2);
  const list = await S.owner.call('GET', '/licenses?level=readonly');
  assert.strictEqual(list.json.data.length, 2);
  const ext = await S.owner.call('POST', '/bulk', { ids, action: 'expiry', days: 30, password: OWNER.password });
  assert.strictEqual(ext.json.data.changed, 2);
});

test('the overview counts what is in force', async () => {
  const r = await S.owner.call('GET', '/summary');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.data.licenses.total, 2);
  assert.strictEqual(r.json.data.licenses.readonly, 2);
  assert.ok(Array.isArray(r.json.data.versions));
  const sys = await S.owner.call('GET', '/system');
  assert.strictEqual(sys.json.data.db, 'ok');
  assert.strictEqual(sys.json.data.realtime, 'listening');
});

test('roles: support can read and keep notes, and nothing else', async () => {
  const mk = await S.owner.call('POST', '/admins', {
    email: 'support@example.com', role: 'support', tempPassword: 'support-password-1', password: OWNER.password
  });
  assert.strictEqual(mk.status, 201, JSON.stringify(mk.json));
  const sup = portal();
  assert.strictEqual((await sup.login('support@example.com', 'support-password-1')).status, 200);
  assert.strictEqual((await sup.call('GET', '/licenses')).status, 200);
  const notes = await sup.call('PATCH', '/licenses/' + S.licId, { notes: 'Called about dues', hostelName: 'Renamed' });
  assert.strictEqual(notes.status, 200);
  assert.strictEqual(notes.json.data.notes, 'Called about dues');
  assert.strictEqual(notes.json.data.hostelName, 'Test Hostel One', 'support must not rename a hostel');
  const lvl = await sup.call('POST', '/licenses/' + S.licId + '/status', { status: 'suspended' });
  assert.strictEqual(lvl.status, 403);
  assert.strictEqual((await sup.call('GET', '/admins')).status, 403);
});

test('an admin cannot revoke; only the owner can', async () => {
  await S.owner.call('POST', '/admins', {
    email: 'admin@example.com', role: 'admin', tempPassword: 'admin-password-12', password: OWNER.password
  });
  const adm = portal();
  await adm.login('admin@example.com', 'admin-password-12');
  const sus = await adm.call('POST', '/licenses/' + S.licId + '/status', { status: 'suspended', reason: 'x' });
  assert.strictEqual(sus.status, 200);
  const rev = await adm.call('POST', '/licenses/' + S.licId + '/status',
    { status: 'revoked', password: 'admin-password-12' });
  assert.strictEqual(rev.status, 403);
});

test('the last owner cannot be demoted', async () => {
  const list = await S.owner.call('GET', '/admins');
  const me = list.json.data.find((u) => u.email === OWNER.email);
  const r = await S.owner.call('PATCH', '/admins/' + me.id, { role: 'admin', password: OWNER.password });
  assert.strictEqual(r.status, 409);
});

test('2FA: enrol, then sign-in needs the code', async () => {
  const setup = await S.owner.call('POST', '/me/totp/setup');
  assert.strictEqual(setup.status, 200);
  const secret = setup.json.data.secret;
  assert.match(setup.json.data.uri, /^otpauth:\/\/totp\//);
  const bad = await S.owner.call('POST', '/me/totp/enable', { code: '000000' });
  assert.strictEqual(bad.status, 400);
  const en = await S.owner.call('POST', '/me/totp/enable', { code: totp.codeAt(secret) });
  assert.strictEqual(en.status, 200, JSON.stringify(en.json));

  const fresh = portal();
  const noCode = await fresh.login(OWNER.email, OWNER.password);
  assert.strictEqual(noCode.status, 401);
  assert.strictEqual(noCode.json.code, 'TOTP_REQUIRED');
  const wrong = await fresh.login(OWNER.email, OWNER.password, '123456');
  assert.strictEqual(wrong.json.code, 'TOTP_INVALID');
  const ok = await fresh.login(OWNER.email, OWNER.password, totp.codeAt(secret));
  assert.strictEqual(ok.status, 200);
  // A wrong password never reaches the 2FA question.
  const wrongPw = await portal().login(OWNER.email, 'nope-nope-nope');
  assert.strictEqual(wrongPw.json.code, 'INVALID_CREDENTIALS');
});

test('the audit log records who did what, and cannot be edited', async () => {
  const r = await S.owner.call('GET', '/audit?limit=500');
  const actions = new Set(r.json.data.map((a) => a.action));
  for (const a of ['license.issue', 'license.status', 'license.level_auto_lift', 'device.release',
                   'fleet.update', 'license.bulk_status', 'license.expiry', 'admin.totp_enable']) {
    assert.ok(actions.has(a), 'missing audit action ' + a);
  }
  await assert.rejects(db.query('DELETE FROM audit_log'), /insert-only/);
});

// ── Overload protection — LAST, because the per-IP limiter is shared ─────────

test('one device holding a third stream closes its oldest, with a reconnect delay', async () => {
  const tok = S.tokB;
  const a = openStream(tok); await a.ready; await a.waitFor((e) => e.event === 'hello');
  const b = openStream(tok); await b.ready; await b.waitFor((e) => e.event === 'hello');
  const c = openStream(tok); await c.ready; await c.waitFor((e) => e.event === 'hello');
  const rec = await a.waitFor((e) => e.event === 'reconnect', 2000);
  assert.ok(rec, 'the oldest stream was not closed');
  assert.ok(rec.data.retryMs >= 1000, 'a replaced stream must not reconnect at once');
  assert.ok(app.realtime.streams.size <= 2 + 1, 'streams per device are not capped');
  [a, b, c].forEach((x) => x.close());
});

test('shutdown ends every stream with a jittered reconnect, so a deploy does not hang', async () => {
  const s1 = openStream(S.tokB); await s1.ready; await s1.waitFor((e) => e.event === 'hello');
  app.realtime.closeAll();
  const rec = await s1.waitFor((e) => e.event === 'reconnect', 2000);
  assert.ok(rec && rec.data.retryMs >= 1000 && rec.data.retryMs <= 20000, JSON.stringify(rec));
  s1.close();
});

test('a client re-fetching its entitlement in a loop is stopped with Retry-After', async () => {
  const tok = await tokenFor(S.devB);
  let limited = null;
  for (let i = 0; i < 60 && !limited; i++) {
    const res = await fetch(base + '/v1/entitlement', { headers: { authorization: 'Bearer ' + tok } });
    if (res.status === 429) limited = res;
    else await res.arrayBuffer();
  }
  assert.ok(limited, 'sixty fetches in a row were all served');
  assert.ok(Number(limited.headers.get('retry-after')) > 0, 'a 429 without Retry-After');
});

test('a flood from one address is refused before it reaches the database', async () => {
  const before = await db.query("SELECT sum(xact_commit + xact_rollback)::bigint AS n FROM pg_stat_database WHERE datname = current_database()");
  let first429 = -1;
  for (let i = 0; i < 400; i++) {
    const res = await fetch(base + '/v1/entitlement', { headers: { authorization: 'Bearer nope' } });
    await res.arrayBuffer();
    if (res.status === 429 && first429 < 0) first429 = i;
  }
  assert.ok(first429 > 0 && first429 <= 300, 'no per-IP ceiling (first 429 at ' + first429 + ')');
  const after = await db.query("SELECT sum(xact_commit + xact_rollback)::bigint AS n FROM pg_stat_database WHERE datname = current_database()");
  // Everything past the ceiling must have cost no transaction at all.
  assert.ok(after.rows[0].n - before.rows[0].n < 400, 'refused requests still hit the database');
});

// ── Runner ──────────────────────────────────────────────────────────────────
(async () => {
  console.log('\ncontrol plane — real Postgres, real server, real streams\n');
  await resetDatabase();
  app = await buildApp({ config: CONFIG, logger: false });
  app.realtime.start();
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = 'http://127.0.0.1:' + app.server.address().port;
  // Give LISTEN a moment to attach before the first NOTIFY.
  for (let i = 0; i < 40 && !app.realtime.listening; i++) await sleep(50);

  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
  }
  if (S.pushMs != null) console.log('\n  portal change → app notified in ' + S.pushMs + 'ms');
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  await app.realtime.stop();
  await app.close();
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
