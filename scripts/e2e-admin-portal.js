/* ─── HOSTYLLO — the portal half of the licence chain, end to end ────────────

   Issue a key, activate it on a machine, suspend it, watch the app go
   read-only, reactivate, revoke — against the LIVE control plane, through the
   real admin routes with cookies and CSRF.

   The app side is not simulated. The fetched entitlement goes through the real
   EntitlementService and the real enforcement.resolve(), so what this asserts
   is what a warden would see, not what a mock was told to say.

   Credentials come from the environment and are never written to a file:
     HOSTYLLO_ADMIN_EMAIL, HOSTYLLO_ADMIN_PASSWORD

   WRITES to production: one `licenses` row and one `devices` row, named as a
   test and left revoked at the end. The ids are printed so they can be deleted.

   Run:  node scripts/e2e-admin-portal.js
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const ROOT = path.join(__dirname, '..');
const { EntitlementService } = require('../services/entitlement.js');
const enforcement = require('../services/enforcement.js');
const logger      = require('../services/logger.js');

// Derived from control-plane.json, so this and the estate cannot disagree
// about which server is being checked. /v1 is the machine surface, /admin
// is the human one; they share an origin and nothing else.
const _cp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'control-plane.json'), 'utf8'));
const ORIGIN = process.env.ORIGIN || (_cp.apiBase ? new URL(_cp.apiBase).origin : null);
if (!ORIGIN) { console.error('control-plane.json names no apiBase. Set ORIGIN=…'); process.exit(2); }
const V1     = ORIGIN + '/v1';
const ADMIN  = ORIGIN + '/admin';

const EMAIL = process.env.HOSTYLLO_ADMIN_EMAIL;
const PASS  = process.env.HOSTYLLO_ADMIN_PASSWORD;
if (!EMAIL || !PASS) {
  console.error('Set HOSTYLLO_ADMIN_EMAIL and HOSTYLLO_ADMIN_PASSWORD.');
  process.exit(2);
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hostyllo-admin-e2e-'));
logger.init({ dir: path.join(TMP, 'logs'), level: 'ERROR', console: false });

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  -- ' + detail : '')); }
  else    { fail++; console.log('  FAIL  ' + name + (detail ? '  -- ' + detail : '')); }
}

// ── A cookie jar, because the portal is a browser surface ──────────────────
const jar = new Map();
function setCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => k + '=' + v).join('; ');

async function adminReq(method, p, body) {
  const headers = { 'content-type': 'application/json', cookie: cookieHeader() };
  const csrf = jar.get('cp_csrf') || jar.get('csrf') || jar.get('cp_csrf_token');
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
  const res = await fetch(ADMIN + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  setCookies(res);
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}
async function v1Req(method, p, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(V1 + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

const machineId = crypto.randomBytes(32).toString('hex');

/** Fetch the entitlement and run it through the app's real services. */
async function appSees(deviceId, deviceSecret) {
  const tok = await v1Req('POST', '/devices/token', { deviceId, deviceSecret });
  if (tok.status !== 200) return { httpStatus: tok.status, code: tok.json && tok.json.code };
  const ent = await v1Req('GET', '/entitlement', null, tok.json.data.token);
  if (ent.status !== 200) return { httpStatus: ent.status, code: ent.json && ent.json.code };

  const svc = new EntitlementService({
    cfg: {}, userDataDir: fs.mkdtempSync(path.join(TMP, 'ud-')),
    machineIdProvider: () => machineId
  });
  svc.store(ent.json.data.entitlement);
  const status = svc.getStatus();
  const decision = enforcement.resolve({
    // A valid local licence, so the entitlement is what moves the answer.
    licence: { valid: true, expiry: new Date(Date.now() + 300 * 864e5).toISOString() },
    entitlement: status
  });
  return { httpStatus: 200, entState: status.state, decision };
}

(async () => {
  console.log('ORIGIN = ' + ORIGIN + '\n');

  // ── 1. sign in ────────────────────────────────────────────────────────────
  console.log('1. Portal sign-in');
  const login = await adminReq('POST', '/login', { email: EMAIL, password: PASS });
  check('POST /admin/login 200', login.status === 200,
    login.status + ' ' + ((login.json && (login.json.code || login.json.message)) || ''));
  if (login.status !== 200) { console.log('\nCannot continue without a session.'); process.exit(1); }
  check('a session cookie was set', jar.size > 0, [...jar.keys()].join(', '));
  const me = await adminReq('GET', '/me');
  check('GET /admin/me identifies the account', me.status === 200,
    me.json && me.json.data && me.json.data.user && me.json.data.user.role);

  const noCsrf = await fetch(ADMIN + '/licenses', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieHeader() }, body: '{}'
  });
  check('a state-changing call without CSRF is refused', noCsrf.status === 403 || noCsrf.status === 404,
    String(noCsrf.status));

  // ── 2. issue a licence ────────────────────────────────────────────────────
  console.log('\n2. Issue a licence');
  const expiresOn = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const issued = await adminReq('POST', '/issue-key', {
    expiresOn,
    hostelName: 'E2E Test Hostel (delete me)',
    contactName: 'Automated check',
    city: 'Peshawar',
    notes: 'Created by the pre-demo end-to-end check on ' + new Date().toISOString()
  });
  check('POST /admin/issue-key 201', issued.status === 201,
    issued.status + ' ' + ((issued.json && issued.json.code) || ''));
  if (issued.status !== 201) { console.log('\nCannot continue without a licence.'); process.exit(1); }
  const key       = issued.json.data.key;
  const licenseId = issued.json.data.license.id;
  check('a v4 key is returned once', /^HOSTEL-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(key), key);
  check('issued licences are VERIFIED, not admitted-unknown',
    issued.json.data.license.verification === 'verified', issued.json.data.license.verification);

  // ── 3. activate it on a machine ───────────────────────────────────────────
  console.log('\n3. Activate on a machine');
  const reg = await v1Req('POST', '/devices/register', {
    licenseKey: key, machineId, appVersion: '5.0.0-e2e', os: 'win32-e2e'
  });
  check('POST /v1/devices/register 201', reg.status === 201, String(reg.status));
  const deviceId = reg.json.data.deviceId, deviceSecret = reg.json.data.deviceSecret;
  check('the portal-issued key registers as verified', reg.json.data.verification === 'verified',
    reg.json.data.verification);

  let seen = await appSees(deviceId, deviceSecret);
  check('the app reads state ACTIVE', seen.entState === 'ACTIVE', seen.entState);
  check('and is fully writable', seen.decision && seen.decision.readOnly === false && seen.decision.blocked === false,
    JSON.stringify({ readOnly: seen.decision && seen.decision.readOnly, blocked: seen.decision && seen.decision.blocked }));

  // ── 4. suspend ────────────────────────────────────────────────────────────
  console.log('\n4. Suspend in the portal (D-3: read-only, never destructive)');
  const susp = await adminReq('POST', '/licenses/' + licenseId + '/status',
    { status: 'suspended', reason: 'e2e check' });
  check('POST /admin/licenses/:id/status 200', susp.status === 200,
    susp.status + ' ' + ((susp.json && susp.json.code) || ''));

  seen = await appSees(deviceId, deviceSecret);
  check('the app now reads SUSPENDED', seen.entState === 'SUSPENDED', seen.entState);
  check('the app goes READ-ONLY', seen.decision && seen.decision.readOnly === true,
    'readOnly=' + (seen.decision && seen.decision.readOnly));
  check('but is NOT blocked — everything is still viewable (D-3)',
    seen.decision && seen.decision.blocked === false, 'blocked=' + (seen.decision && seen.decision.blocked));
  check('and the warden is told why', !!(seen.decision && enforcement.message(seen.decision)),
    seen.decision && JSON.stringify(enforcement.message(seen.decision)).slice(0, 120));

  // ── 5. reactivate ─────────────────────────────────────────────────────────
  console.log('\n5. Reactivate');
  const react = await adminReq('POST', '/licenses/' + licenseId + '/status',
    { status: 'active', reason: 'e2e check' });
  check('status back to active 200', react.status === 200, String(react.status));
  seen = await appSees(deviceId, deviceSecret);
  check('the app is ACTIVE and writable again',
    seen.entState === 'ACTIVE' && seen.decision.readOnly === false, seen.entState);

  // ── 6. revoke ─────────────────────────────────────────────────────────────
  console.log('\n6. Revoke');
  const rev = await adminReq('POST', '/licenses/' + licenseId + '/status',
    { status: 'revoked', reason: 'e2e check' });
  check('status to revoked 200', rev.status === 200, String(rev.status));
  const afterRevoke = await appSees(deviceId, deviceSecret);
  check('a revoked licence can no longer get a token', afterRevoke.httpStatus === 401,
    afterRevoke.httpStatus + ' ' + (afterRevoke.code || ''));
  const reReg = await v1Req('POST', '/devices/register', { licenseKey: key, machineId });
  check('and re-registering is refused 403 LICENSE_REVOKED',
    reReg.status === 403 && reReg.json.code === 'LICENSE_REVOKED',
    reReg.status + ' ' + (reReg.json && reReg.json.code));

  // ── 7. the audit trail ────────────────────────────────────────────────────
  console.log('\n7. Audit trail');
  const audit = await adminReq('GET', '/audit?limit=25');
  check('GET /admin/audit 200', audit.status === 200, String(audit.status));
  const actions = ((audit.json && audit.json.data) || []).map(r => r.action);
  for (const a of ['license.issue', 'license.status', 'admin.login']) {
    check('records ' + a, actions.includes(a), actions.slice(0, 8).join(', '));
  }

  console.log('\n' + '-'.repeat(70));
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log('\nleft behind on production (revoked, safe to delete):');
  console.log('  licence ' + licenseId + '  "E2E Test Hostel (delete me)"');
  console.log('  device  ' + deviceId);
  logger.close();
  process.exitCode = fail ? 1 : 0;
})().catch(e => { if (!(e && e._quiet)) { console.error('THREW: ' + ((e && e.stack) || e)); process.exitCode = 2; } });
