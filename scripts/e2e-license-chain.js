/* ─── HOSTYLLO — the licence chain, end to end against the LIVE control plane ─

   Everything between "a customer types a key" and "the app holds a signed
   statement of what it may do", walked against the deployed server rather than
   reasoned about. The entitlement is checked with the APP'S OWN verifier, so a
   pass here means the shipped code would accept what production issues.

   It also drives the paths that are easy to get wrong and impossible to notice:
   an entitlement copied to another machine, a payload edited to say ACTIVE, the
   one-device cap, and a reinstall rotating a secret out from under a live token.

   WRITES to production. It creates one `licenses` row and up to two `devices`
   rows, all under randomly generated machine ids, and touches nothing existing.

   The address comes from control-plane.json — the same file the estate reads —
   so this cannot drift from what the app would actually talk to.

   IT SPENDS SIX OF A SHARED HOURLY BUDGET. `/devices/register` is rate limited
   to 20 per IP per hour, and this script registers six times, so it can run
   about three times an hour from one address and no more. That budget is shared
   with anything else activating from the same IP — INCLUDING A REAL CUSTOMER
   ACTIVATION, and including the demo machine if it is on the same connection.
   Do not run it in a loop before a demo; a locked-out activation looks exactly
   like a broken product.

   Run:  node scripts/e2e-license-chain.js
         BASE=https://…/v1 node scripts/e2e-license-chain.js
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

const ROOT = path.join(__dirname, '..');
const shared = require(path.join(ROOT, 'server/src/lib/vendor/app-utils.js'));
const { verifyEntitlement } = require('../services/entitlement.js');

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SECRET = env.LEGACY_KEY_SECRET;
// The address the estate itself reads, so this test and the field cannot
// disagree about which server is being checked.
const BASE = process.env.BASE ||
  JSON.parse(fs.readFileSync(path.join(ROOT, 'control-plane.json'), 'utf8')).apiBase;
if (!BASE) { console.error('control-plane.json names no apiBase (kill switch?). Set BASE=…'); process.exit(2); }

let pass = 0, fail = 0;
const t0 = Date.now();
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  -- ' + detail : '')); }
  else    { fail++; console.log('  FAIL  ' + name + (detail ? '  -- ' + detail : '')); }
}
/**
 * Abort loudly on a rate limit rather than letting the next line fail on
 * `undefined.deviceId`, which is what it did and which reads like a server
 * fault rather than the budget in the header.
 */
function stopIfRateLimited(res, where) {
  if (res.status !== 429) return;
  console.log('\n  ' + '!'.repeat(66));
  console.log('  RATE LIMITED at ' + where + ' — 20 registrations per IP per hour.');
  console.log('  This is the server behaving correctly, not a failure of the chain.');
  console.log('  Wait for the window to roll over, or run from another address.');
  console.log('  ' + '!'.repeat(66) + '\n');
  process.exitCode = 3; throw Object.assign(new Error('rate_limited'), { _quiet: true });
}

async function req(method, p, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const started = Date.now();
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ms = Date.now() - started;
  let json = null;
  try { json = await r.json(); } catch (_) {}
  return { status: r.status, json, ms };
}
const machineId = () => crypto.randomBytes(32).toString('hex');

(async () => {
  console.log('BASE = ' + BASE + '\n');

  console.log('1. Reachability');
  const hz = await req('GET', '/healthz');
  check('GET /v1/healthz 200', hz.status === 200, hz.ms + 'ms');
  check('healthz does not touch the DB (fast)', hz.ms < 1500, hz.ms + 'ms');

  console.log('\n2. Registration -- a key the database has never seen');
  const d = new Date(Date.now() + 365 * 864e5);
  const key = shared.buildLicenseKey(d.getFullYear(), d.getMonth() + 1, d.getDate(), SECRET);
  const m1 = machineId();
  const reg = await req('POST', '/devices/register', {
    licenseKey: key, machineId: m1, appVersion: '5.0.0-e2e', os: 'win32-e2e'
  });
  stopIfRateLimited(reg, 'the first registration');
  check('POST /devices/register 201', reg.status === 201, reg.ms + 'ms ' + ((reg.json && reg.json.code) || ''));
  const dev = (reg.json && reg.json.data) || {};
  check('returns deviceSecret once', !!dev.deviceSecret);
  check('licence admitted as unverified', dev.verification === 'unverified', dev.verification);
  check('licence status active', dev.licenseStatus === 'active', dev.licenseStatus);
  check('v4 key defaults to maxDevices 1', dev.maxDevices === 1, String(dev.maxDevices));

  console.log('\n3. Token exchange');
  const tok = await req('POST', '/devices/token', { deviceId: dev.deviceId, deviceSecret: dev.deviceSecret });
  check('POST /devices/token 200', tok.status === 200, tok.ms + 'ms');
  const token = tok.json && tok.json.data && tok.json.data.token;
  check('returns a token with a TTL', !!token && tok.json.data.expiresIn > 0, 'ttl=' + (tok.json && tok.json.data && tok.json.data.expiresIn));

  const badSecret = await req('POST', '/devices/token', { deviceId: dev.deviceId, deviceSecret: crypto.randomBytes(24).toString('base64url') });
  check('wrong secret 401 DEVICE_UNAUTHORIZED', badSecret.status === 401 && badSecret.json.code === 'DEVICE_UNAUTHORIZED', badSecret.status + ' ' + (badSecret.json && badSecret.json.code));

  console.log('\n4. Entitlement -- verified with the app own verifier');
  const ent = await req('GET', '/entitlement', null, token);
  check('GET /entitlement 200', ent.status === 200, ent.ms + 'ms');
  const jws = ent.json && ent.json.data && ent.json.data.entitlement;
  const v = verifyEntitlement(jws, { machineId: m1 });
  check('signature verifies against the shipped public key', v.valid, v.reason || ('kid=' + v.kid));
  check('bound to THIS machine', !!v.claims && v.claims.machineId === m1);
  check('status ACTIVE', !!v.claims && v.claims.status === 'ACTIVE', v.claims && v.claims.status);
  check('carries a feature list', !!(v.claims && v.claims.features), v.claims && v.claims.features && Object.keys(v.claims.features).join(','));
  check('policy present', !!(v.claims && v.claims.policy), v.claims && JSON.stringify(v.claims.policy));

  const wrong = verifyEntitlement(jws, { machineId: machineId() });
  check('rejects an entitlement copied to another machine', !wrong.valid, wrong.reason);

  const tampered = (() => {
    const p = jws.split('.');
    const c = JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8'));
    c.status = 'ACTIVE'; c.expiresAt = '2099-01-01T00:00:00.000Z';
    p[1] = Buffer.from(JSON.stringify(c)).toString('base64url');
    return p.join('.');
  })();
  const tv = verifyEntitlement(tampered, { machineId: m1 });
  check('rejects a tampered payload', !tv.valid, tv.reason);

  const noAuth = await req('GET', '/entitlement');
  check('entitlement without a token 401', noAuth.status === 401, String(noAuth.status));

  console.log('\n5. Device cap (v4 key = 1 machine)');
  const m2 = machineId();
  const second = await req('POST', '/devices/register', { licenseKey: key, machineId: m2, appVersion: '5.0.0-e2e', os: 'win32-e2e' });
  stopIfRateLimited(second, 'the device-cap check');
  check('second machine refused 409 DEVICE_LIMIT_REACHED', second.status === 409 && second.json.code === 'DEVICE_LIMIT_REACHED', second.status + ' ' + (second.json && second.json.code));
  check('the message names the fix', !!(second.json && /Deactivate it there first/.test(second.json.message)), second.json && second.json.message);

  console.log('\n6. Reinstall on the same machine');
  const again = await req('POST', '/devices/register', { licenseKey: key, machineId: m1, appVersion: '5.0.0-e2e', os: 'win32-e2e' });
  stopIfRateLimited(again, 'the reinstall check');
  check('re-register 201 (not a device-limit error)', again.status === 201, String(again.status));
  check('same deviceId, not a new row', again.json && again.json.data.deviceId === dev.deviceId);
  check('secret rotated', again.json && again.json.data.deviceSecret !== dev.deviceSecret);
  const oldTok = await req('GET', '/entitlement', null, token);
  check('the old token is invalidated by the rotation', oldTok.status === 401, String(oldTok.status));

  // Three more registrations, and the ones worth dropping first if the budget
  // is tight — they prove input validation, not the chain.
  console.log('\n7. Rejections' + (process.env.SKIP_REJECTIONS ? ' — skipped (SKIP_REJECTIONS)' : ''));
  if (process.env.SKIP_REJECTIONS) return summarise();
  const badKey = await req('POST', '/devices/register', { licenseKey: 'HOSTEL-ZZZZ-ZZZZ-ZZZZ-ZZZZ', machineId: machineId() });
  check('bad checksum 400 INVALID_KEY', badKey.status === 400 && badKey.json.code === 'INVALID_KEY', badKey.status + ' ' + (badKey.json && badKey.json.code));
  const junk = await req('POST', '/devices/register', { licenseKey: 'NOTAKEYATALLXXXXXXXXXX', machineId: machineId() });
  check('malformed key 400 INVALID_KEY_FORMAT', junk.status === 400 && junk.json.code === 'INVALID_KEY_FORMAT', junk.status + ' ' + (junk.json && junk.json.code));
  const fp = await req('POST', '/devices/register', { licenseKey: key, machineId: 'UNKNOWN_MACHINE_ID_FALLBACK_' + 'a'.repeat(36) });
  check('fingerprint failure 400 MACHINE_ID_UNAVAILABLE', fp.status === 400 && fp.json.code === 'MACHINE_ID_UNAVAILABLE', fp.status + ' ' + (fp.json && fp.json.code));

  return summarise();

  function summarise() {
    console.log('\n' + '-'.repeat(70));
    console.log(pass + ' passed, ' + fail + ' failed   (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
    console.log('test licence key: ' + key);
    console.log('test device id:   ' + dev.deviceId);
    console.log('test licence id:  ' + dev.licenseId);
    process.exitCode = fail ? 1 : 0;
  }
})().catch(e => { if (!(e && e._quiet)) { console.error('THREW: ' + ((e && e.stack) || e)); process.exitCode = 2; } });
