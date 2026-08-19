/* ─── HOSTYLLO — Phase 1 online-services unit tests (pure Node) ───────────────

   Covers the four Phase 1 subsystems without launching Electron:
     redact.js        §25 / §40 — nothing sensitive reaches a log or the wire
     config.js        the "no control plane yet" state is real, not a stub
     api-client.js    §36 — timeouts, bounded retries, backoff, idempotency
     online-queue.js  §37 — and the PHASE 1 GATE: the queue survives restart

   The queue tests use a real on-disk SQLite database and genuinely close and
   reopen it. A queue that only survives in memory is not durable, and an
   in-memory test would have passed for a queue that loses everything on exit —
   which is the exact failure §26 exists to prevent.

   better-sqlite3 v13 ships an N-API prebuild, so it loads under plain Node as
   well as Electron. (Under v9 it did not — hence the note in
   migrations/001-relational-schema.test.js.)

   Run:  npm run test:services
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Database = require('better-sqlite3');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
async function okAsync(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

// Keep every test off the real config: an env var on the dev machine must not
// silently point these tests at a live endpoint.
delete process.env.HOSTYLLO_API_BASE;

const redact = require('../services/redact');
const config = require('../services/config');
const api    = require('../services/api-client');
const logger = require('../services/logger');
const { OnlineQueue, STATUS } = require('../services/online-queue');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hostyllo-p1-'));

// Logging to a temp dir, console off — otherwise every test line is buried
// under the services' own INFO output.
logger.init({ dir: path.join(TMP, 'logs'), level: 'ERROR', console: false });

(async function run() {

// ══════════════════════════════════════════════════════════════════════════
console.log('\nredact.js — §25 privacy-safe diagnostics');
// ══════════════════════════════════════════════════════════════════════════

ok('redacts a value by key name', () => {
  const out = redact.redact({ password: 'hunter2', token: 'abc', ok: 'keep' });
  assert.strictEqual(out.password, '[redacted]');
  assert.strictEqual(out.token, '[redacted]');
  assert.strictEqual(out.ok, 'keep');
});

ok('distinguishes a redacted empty field from a redacted value', () => {
  const out = redact.redact({ token: '', cnic: 'x' });
  assert.strictEqual(out.token, '[redacted:empty]');
  assert.strictEqual(out.cnic, '[redacted]');
});

ok('redacts a CNIC hidden in an innocent-looking field', () => {
  const out = redact.redact({ notes: 'student cnic is 35202-1234567-1 ok' });
  assert.ok(out.notes.includes('[redacted:cnic]'), out.notes);
  assert.ok(!out.notes.includes('35202'), out.notes);
});

ok('redacts a bare 13-digit CNIC', () => {
  const out = redact.redactString('id 3520212345671 here');
  assert.ok(out.includes('[redacted:cnic]'), out);
});

ok('redacts Pakistani mobile numbers in both common forms', () => {
  for (const n of ['03001234567', '0300-1234567', '+923001234567']) {
    const out = redact.redactString('call ' + n);
    assert.ok(out.includes('[redacted:phone]'), n + ' -> ' + out);
    assert.ok(!/\d{7}/.test(out), n + ' -> ' + out);
  }
});

ok('redacts email addresses and JWTs', () => {
  assert.ok(redact.redactString('a@b.com').includes('[redacted:email]'));
  const jwt = 'eyJhbGciOi.eyJzdWIiOjEyMw.SflKxwRJSM';
  assert.ok(redact.redactString(jwt).includes('[redacted:jwt]'));
});

ok('collapses the user home directory out of paths', () => {
  const out = redact.redactString(os.homedir() + '\\AppData\\hostix.db');
  assert.ok(!out.includes(os.homedir()), out);
  assert.ok(out.startsWith('~'), out);
});

ok('collapses another account name out of a Windows path', () => {
  const out = redact.redactString('C:\\Users\\someone\\hostix.db');
  assert.ok(!out.includes('someone'), out);
});

ok('keeps genuinely useful keys that merely look sensitive', () => {
  const out = redact.redact({ authState: 'expired', accountStatus: 'active' });
  assert.strictEqual(out.authState, 'expired');
  assert.strictEqual(out.accountStatus, 'active');
});

ok('survives a circular object instead of blowing the stack', () => {
  const a = { name: 'a' }; a.self = a;
  const out = redact.redact(a);
  assert.strictEqual(out.self, '[circular]');
});

ok('caps depth, array length and string length', () => {
  const deep = { a: { b: { c: { d: { e: 'too deep' } } } } };
  assert.strictEqual(redact.redact(deep).a.b.c.d, '[depth-limit]');

  const arr = redact.redact({ xs: Array.from({ length: 25 }, (_, i) => i) });
  assert.strictEqual(arr.xs.length, redact._limits.MAX_ARRAY_ITEMS + 1);
  assert.ok(String(arr.xs[arr.xs.length - 1]).includes('more'));

  const long = redact.redactString('x'.repeat(1000));
  assert.ok(long.length < 1000, 'long string was not truncated');
});

ok('redacts an Error without losing its message shape', () => {
  const e = new Error('failed for 03001234567');
  const out = redact.redact({ err: e });
  // `err` is not a sensitive key name, so the Error is structured, not dropped.
  assert.ok(out.err.message.includes('[redacted:phone]'), JSON.stringify(out.err));
});

ok('truncates the machine ID to a correlatable prefix', () => {
  const id = 'a'.repeat(64);
  assert.strictEqual(redact.redactMachineId(id), 'aaaaaaaa…');
  assert.strictEqual(redact.redactMachineId('short'), '[invalid]');
});

ok('never returns raw input when redaction fails', () => {
  const hostile = { get boom() { throw new Error('nope'); } };
  const out = redact.redact(hostile);
  assert.strictEqual(out, '[unredactable]');
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nconfig.js — unconfigured is a first-class state');
// ══════════════════════════════════════════════════════════════════════════

ok('defaults to no control plane at all', () => {
  const c = config.load({ userDataDir: TMP });
  assert.strictEqual(c.apiBase, null);
  assert.strictEqual(c.apiBaseSource, 'none');
  assert.strictEqual(config.isConfigured(), false);
  assert.strictEqual(config.url('/healthz'), null);
});

ok('telemetry is off by default (§38)', () => {
  assert.strictEqual(config.load({ userDataDir: TMP }).telemetryEnabled, false);
});

ok('rejects cleartext http except on localhost', () => {
  assert.strictEqual(config._normaliseBase('http://api.example.com'), null);
  assert.strictEqual(config._normaliseBase('http://localhost:3000'), 'http://localhost:3000');
  assert.strictEqual(config._normaliseBase('https://api.example.com/desktop/v1/'),
    'https://api.example.com/desktop/v1');
  assert.strictEqual(config._normaliseBase('not a url'), null);
  assert.strictEqual(config._normaliseBase(''), null);
});

ok('a malformed override file does not stop the app booting', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'badcfg-'));
  fs.writeFileSync(path.join(dir, 'online-config.json'), '{ this is not json');
  const c = config.load({ userDataDir: dir });
  assert.strictEqual(c.apiBase, null);
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\napi-client.js — §36 reliability');
// ══════════════════════════════════════════════════════════════════════════

ok('backoff is bounded by the cap and always non-negative', () => {
  const cfg = { backoffBaseMs: 1000, backoffMaxMs: 30000 };
  for (let attempt = 1; attempt <= 20; attempt++) {
    for (let i = 0; i < 50; i++) {
      const d = api._internal.backoffDelay(attempt, cfg);
      assert.ok(d >= 0 && d <= cfg.backoffMaxMs, `attempt ${attempt} -> ${d}`);
    }
  }
});

ok('a POST is only retryable with an idempotency key', () => {
  const r = api._internal.isRetryableRequest;
  assert.strictEqual(r('GET'), true);
  assert.strictEqual(r('PUT'), true);
  assert.strictEqual(r('POST'), false);
  assert.strictEqual(r('POST', 'key-123'), true);
});

ok('maps HTTP status onto stable error codes', () => {
  const c = api._internal.classifyStatus;
  assert.strictEqual(c(200), null);
  assert.strictEqual(c(204), null);
  assert.strictEqual(c(401), api.ERRORS.UNAUTHORIZED);
  assert.strictEqual(c(403), api.ERRORS.UNAUTHORIZED);
  assert.strictEqual(c(404), api.ERRORS.NOT_FOUND);
  assert.strictEqual(c(408), api.ERRORS.TIMEOUT);
  assert.strictEqual(c(429), api.ERRORS.RATE_LIMITED);
  assert.strictEqual(c(500), api.ERRORS.SERVER);
  assert.strictEqual(c(418), api.ERRORS.CLIENT);
});

ok('parses Retry-After as seconds and as a date, and caps it', () => {
  const p = api._internal.parseRetryAfter;
  assert.strictEqual(p('30'), 30000);
  assert.strictEqual(p(null), null);
  assert.strictEqual(p('99999'), 300000);
  const soon = new Date(Date.now() + 5000).toUTCString();
  assert.ok(p(soon) > 0 && p(soon) <= 6000);
});

function fakeResponse(status, body, headers) {
  const h = new Map(Object.entries(headers || { 'content-type': 'application/json' }));
  return {
    status,
    headers: { get: (k) => h.get(String(k).toLowerCase()) || null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

await okAsync('makes NO request at all when unconfigured', async () => {
  config.load({ userDataDir: TMP });
  let called = 0;
  api._setFetch(async () => { called++; return fakeResponse(200, {}); });
  const res = await api.request({ path: '/healthz' });
  assert.strictEqual(called, 0, 'a request was made with no control plane configured');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.errorCode, api.ERRORS.NOT_CONFIGURED);
  api._setFetch(null);
});

await okAsync('retries a 500 up to maxAttempts and then gives up', async () => {
  config.load({ userDataDir: TMP,
    overrides: { apiBase: 'https://example.test', backoffBaseMs: 1, backoffMaxMs: 2 } });
  let calls = 0;
  api._setFetch(async () => { calls++; return fakeResponse(500, { message: 'boom' }); });
  const res = await api.request({ path: '/healthz', maxAttempts: 3 });
  assert.strictEqual(calls, 3, 'expected exactly 3 attempts, got ' + calls);
  assert.strictEqual(res.errorCode, api.ERRORS.SERVER);
  assert.strictEqual(res.attempts, 3);
  api._setFetch(null);
});

await okAsync('does not retry a 400', async () => {
  config.load({ userDataDir: TMP,
    overrides: { apiBase: 'https://example.test', backoffBaseMs: 1, backoffMaxMs: 2 } });
  let calls = 0;
  api._setFetch(async () => { calls++; return fakeResponse(400, { message: 'bad' }); });
  const res = await api.request({ path: '/x', maxAttempts: 5 });
  assert.strictEqual(calls, 1);
  assert.strictEqual(res.errorCode, api.ERRORS.CLIENT);
  api._setFetch(null);
});

await okAsync('does not retry a POST that has no idempotency key', async () => {
  config.load({ userDataDir: TMP,
    overrides: { apiBase: 'https://example.test', backoffBaseMs: 1, backoffMaxMs: 2 } });
  let calls = 0;
  api._setFetch(async () => { calls++; return fakeResponse(503, {}); });
  const res = await api.request({ path: '/tickets', method: 'POST', body: {}, maxAttempts: 4 });
  assert.strictEqual(calls, 1, 'a POST without an idempotency key must not be replayed');
  assert.strictEqual(res.errorCode, api.ERRORS.SERVER);
  api._setFetch(null);
});

await okAsync('retries a POST that does carry an idempotency key', async () => {
  config.load({ userDataDir: TMP,
    overrides: { apiBase: 'https://example.test', backoffBaseMs: 1, backoffMaxMs: 2 } });
  let calls = 0, seenKey = null;
  api._setFetch(async (_u, opts) => {
    calls++; seenKey = opts.headers['Idempotency-Key'];
    return calls < 3 ? fakeResponse(503, {}) : fakeResponse(200, { ok: true });
  });
  const res = await api.request({
    path: '/tickets', method: 'POST', body: {},
    idempotencyKey: 'idem-1', maxAttempts: 4
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(calls, 3);
  assert.strictEqual(seenKey, 'idem-1', 'the same key must be replayed, not a new one');
  api._setFetch(null);
});

await okAsync('classifies a DNS failure as offline, not as a crash', async () => {
  config.load({ userDataDir: TMP,
    overrides: { apiBase: 'https://example.test', backoffBaseMs: 1, backoffMaxMs: 2 } });
  api._setFetch(async () => { const e = new Error('getaddrinfo ENOTFOUND'); e.code = 'ENOTFOUND'; throw e; });
  const res = await api.request({ path: '/healthz', maxAttempts: 2 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.errorCode, api.ERRORS.OFFLINE);
  api._setFetch(null);
});

await okAsync('a hung server produces E_TIMEOUT, not a hang', async () => {
  config.load({ userDataDir: TMP,
    overrides: { apiBase: 'https://example.test', backoffBaseMs: 1, backoffMaxMs: 2 } });
  api._setFetch((_u, opts) => new Promise((_res, rej) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
    });
  }));
  const started = Date.now();
  const res = await api.request({ path: '/healthz', timeoutMs: 60, maxAttempts: 1 });
  assert.strictEqual(res.errorCode, api.ERRORS.TIMEOUT);
  assert.ok(Date.now() - started < 5000, 'timeout did not fire');
  api._setFetch(null);
});

await okAsync('a caller abort is E_ABORTED, distinct from a timeout', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  const ac = new AbortController();
  api._setFetch((_u, opts) => new Promise((_res, rej) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
    });
  }));
  setTimeout(() => ac.abort(), 20);
  const res = await api.request({ path: '/healthz', signal: ac.signal, maxAttempts: 1 });
  assert.strictEqual(res.errorCode, api.ERRORS.ABORTED);
  api._setFetch(null);
});

await okAsync('rejects an unparseable JSON body rather than passing it on', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => fakeResponse(200, '{ not json', { 'content-type': 'application/json' }));
  const res = await api.request({ path: '/x', maxAttempts: 1 });
  assert.strictEqual(res.errorCode, api.ERRORS.BAD_RESPONSE);
  api._setFetch(null);
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nconnectivity.js — §7 four separate states');
// ══════════════════════════════════════════════════════════════════════════

const { ConnectivityService, MODE } = require('../services/connectivity');

function connCfg(extra) {
  return Object.assign({
    probeTimeoutMs: 50, requestTimeoutMs: 50, maxAttempts: 1,
    backoffBaseMs: 1, backoffMaxMs: 2,
    pollIntervalMs: 100000, pollIntervalMaxMs: 200000, checkNowMinGapMs: 10000
  }, extra || {});
}

await okAsync('unconfigured: reports it honestly and probes nothing', async () => {
  config.load({ userDataDir: TMP });                 // no apiBase
  let called = 0;
  api._setFetch(async () => { called++; return fakeResponse(200, {}); });

  const c = new ConnectivityService({ cfg: connCfg() });
  c.start();
  await c.checkNow({ force: true });
  const s = c.getStatus();

  assert.strictEqual(called, 0, 'probed a control plane that does not exist');
  assert.strictEqual(s.configured, false);
  assert.strictEqual(s.mode, MODE.UNCONFIGURED);
  assert.strictEqual(s.reason, 'not_configured');
  assert.strictEqual(c.isOnline(), false);
  assert.strictEqual(c.getLastSuccessfulConnection(), null);
  c.stop();
  api._setFetch(null);
});

await okAsync('reachable control plane: online, and records the success time', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => fakeResponse(200, { ok: true }));

  const c = new ConnectivityService({ cfg: connCfg() });
  await c.checkNow({ force: true });
  const s = c.getStatus();

  assert.strictEqual(s.apiReachable, true);
  assert.strictEqual(s.mode, MODE.ONLINE);
  assert.strictEqual(c.isOnline(), true);
  assert.ok(c.getLastSuccessfulConnection() > 0);
  assert.strictEqual(s.consecutiveFailures, 0);
  c.stop();
  api._setFetch(null);
});

await okAsync('network up but API down is DEGRADED, not offline', async () => {
  // The distinction §7 exists for: the hostel has internet, the control plane
  // does not answer, local data is fine. Calling this "offline" would be a lie
  // and would drive the wrong message in the UI (§29, §39).
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => fakeResponse(500, { message: 'down' }));

  const c = new ConnectivityService({ cfg: connCfg() });
  await c.checkNow({ force: true });
  const s = c.getStatus();

  assert.strictEqual(s.networkAvailable, true);
  assert.strictEqual(s.apiReachable, false);
  assert.strictEqual(s.mode, MODE.DEGRADED);
  assert.strictEqual(s.reason, api.ERRORS.SERVER);
  c.stop();
  api._setFetch(null);
});

await okAsync('a DNS failure is OFFLINE even when the OS claims a network', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => { const e = new Error('getaddrinfo ENOTFOUND'); e.code = 'ENOTFOUND'; throw e; });

  const c = new ConnectivityService({ cfg: connCfg() });
  await c.checkNow({ force: true });
  assert.strictEqual(c.getStatus().mode, MODE.OFFLINE);
  c.stop();
  api._setFetch(null);
});

await okAsync('LICENSE_VALID is separate from API_REACHABLE', async () => {
  // A valid cached licence with an unreachable API is the single most common
  // real-world state for this product. Both facts must survive independently.
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => { const e = new Error('ENOTFOUND'); e.code = 'ENOTFOUND'; throw e; });

  const c = new ConnectivityService({
    cfg: connCfg(),
    licenseProvider: () => ({ ok: true, reason: 'cached' })
  });
  await c.checkNow({ force: true });
  const s = c.getStatus();

  assert.strictEqual(s.licenseValid, true);
  assert.strictEqual(s.apiReachable, false);
  c.stop();
  api._setFetch(null);
});

await okAsync('AUTHENTICATED is false until Phase 2 wires a device token', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => fakeResponse(200, {}));
  const c = new ConnectivityService({ cfg: connCfg() });
  await c.checkNow({ force: true });
  assert.strictEqual(c.getStatus().authenticated, false);
  c.stop();
  api._setFetch(null);
});

await okAsync('a throwing licence provider does not take down the poll', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => fakeResponse(200, {}));
  const c = new ConnectivityService({
    cfg: connCfg(),
    licenseProvider: () => { throw new Error('licence read failed'); }
  });
  await c.checkNow({ force: true });
  assert.strictEqual(c.getStatus().mode, MODE.ONLINE);
  assert.strictEqual(c.getStatus().licenseValid, false);
  c.stop();
  api._setFetch(null);
});

await okAsync('emits only on a real transition, not on every tick', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => fakeResponse(200, {}));

  const c = new ConnectivityService({ cfg: connCfg() });
  let events = 0;
  const off = c.onStatusChanged(() => { events++; });

  await c.checkNow({ force: true });       // unconfigured -> online : 1 event
  await c.checkNow({ force: true });       // online -> online       : 0 events
  await c.checkNow({ force: true });
  assert.strictEqual(events, 1, 'got ' + events + ' events for one transition');

  api._setFetch(async () => fakeResponse(503, {}));
  await c.checkNow({ force: true });       // online -> degraded     : 1 event
  assert.strictEqual(events, 2);

  off();
  await c.checkNow({ force: true });
  assert.strictEqual(events, 2, 'unsubscribe did not work');
  c.stop();
  api._setFetch(null);
});

await okAsync('a throwing subscriber cannot break the poll loop', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => fakeResponse(200, {}));
  const c = new ConnectivityService({ cfg: connCfg() });
  c.onStatusChanged(() => { throw new Error('bad subscriber'); });
  await c.checkNow({ force: true });
  assert.strictEqual(c.getStatus().mode, MODE.ONLINE);
  c.stop();
  api._setFetch(null);
});

await okAsync('checkNow is rate-limited and concurrent callers share one probe', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  let probes = 0;
  api._setFetch(async () => { probes++; await new Promise(r => setTimeout(r, 20)); return fakeResponse(200, {}); });

  const c = new ConnectivityService({ cfg: connCfg({ checkNowMinGapMs: 10000 }) });
  await Promise.all([c.checkNow(), c.checkNow(), c.checkNow()]);
  assert.strictEqual(probes, 1, 'concurrent checks fanned out into ' + probes + ' probes');

  await c.checkNow();                       // inside the rate-limit window
  assert.strictEqual(probes, 1, 'rate limit did not hold');
  c.stop();
  api._setFetch(null);
});

await okAsync('backs off while the control plane stays down', async () => {
  config.load({ userDataDir: TMP, overrides: { apiBase: 'https://example.test' } });
  api._setFetch(async () => fakeResponse(503, {}));
  const c = new ConnectivityService({ cfg: connCfg({ pollIntervalMs: 1000, pollIntervalMaxMs: 8000 }) });

  await c.checkNow({ force: true });
  const after1 = c._currentIntervalMs;
  await c.checkNow({ force: true });
  const after2 = c._currentIntervalMs;
  assert.ok(after2 > after1, 'interval did not grow: ' + after1 + ' -> ' + after2);
  assert.ok(after2 <= 8000, 'interval exceeded its cap: ' + after2);

  api._setFetch(async () => fakeResponse(200, {}));
  await c.checkNow({ force: true });
  assert.strictEqual(c._currentIntervalMs, 1000, 'interval did not reset after recovery');
  c.stop();
  api._setFetch(null);
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nonline-queue.js — §37, and the Phase 1 durability gate');
// ══════════════════════════════════════════════════════════════════════════

function freshQueue(file, cfg) {
  const db = new Database(file);
  const q = new OnlineQueue({
    db,
    cfg: Object.assign({
      queueDrainIntervalMs: 1000, queueMaxAttempts: 3, queueBatchSize: 5,
      backoffBaseMs: 1, backoffMaxMs: 2
    }, cfg || {})
  });
  q.attachConnectivity(() => true);
  return { db, q };
}

ok('enqueues a task as pending', () => {
  const file = path.join(TMP, 'q1.db');
  const { db, q } = freshQueue(file);
  const r = q.enqueue('support.ticket', { subject: 'printer' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(q.get(r.id).status, STATUS.PENDING);
  assert.strictEqual(q.stats().pending, 1);
  db.close();
});

ok('THE GATE: a queued task survives closing and reopening the database', () => {
  const file = path.join(TMP, 'durable.db');

  const first = freshQueue(file);
  const { id } = first.q.enqueue('support.ticket', { subject: 'no hot water' });
  first.db.close();                       // simulate the app exiting

  const second = freshQueue(file);        // simulate the app starting again
  const task = second.q.get(id);
  assert.ok(task, 'the task did not survive the restart');
  assert.strictEqual(task.status, STATUS.PENDING);
  assert.strictEqual(task.payload.subject, 'no hot water');
  assert.strictEqual(second.q.stats().pending, 1);
  second.db.close();
});

ok('reclaims a task that was in flight when the process died', () => {
  const file = path.join(TMP, 'inflight.db');
  const first = freshQueue(file);
  const { id } = first.q.enqueue('support.ticket', { subject: 'x' });
  // Exactly the state a crash between claiming and recording leaves behind.
  first.db.prepare('UPDATE online_queue SET status = ?, attempts = 1 WHERE id = ?')
    .run(STATUS.INFLIGHT, id);
  first.db.close();

  const second = freshQueue(file);
  const task = second.q.get(id);
  assert.strictEqual(task.status, STATUS.PENDING, 'inflight task was stranded');
  assert.strictEqual(task.attempts, 1, 'the attempt count must be preserved');
  second.db.close();
});

ok('an idempotency key survives the restart with its task', () => {
  const file = path.join(TMP, 'idem.db');
  const first = freshQueue(file);
  const { id } = first.q.enqueue('support.ticket', { a: 1 }, { idempotencyKey: 'idem-xyz' });
  first.db.close();
  const second = freshQueue(file);
  // Without this, a resend after a crash creates a SECOND ticket server-side.
  assert.strictEqual(second.q.get(id).idempotencyKey, 'idem-xyz');
  second.db.close();
});

ok('refuses an oversized payload instead of storing it', () => {
  const file = path.join(TMP, 'big.db');
  const { db, q } = freshQueue(file);
  const r = q.enqueue('support.ticket', { blob: 'x'.repeat(100 * 1024) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'payload_too_large');
  assert.strictEqual(q.stats().pending, 0);
  db.close();
});

await okAsync('a successful handler moves the task to done', async () => {
  const file = path.join(TMP, 'q-ok.db');
  const { db, q } = freshQueue(file);
  let seenIdem = null;
  q.register('t', async (_p, task) => { seenIdem = task.idempotencyKey; return { ok: true }; });
  const { id } = q.enqueue('t', { a: 1 });
  const s = await q.drain();
  assert.strictEqual(s.ok, 1);
  assert.strictEqual(q.get(id).status, STATUS.DONE);
  assert.ok(seenIdem, 'the handler must receive an idempotency key');
  db.close();
});

await okAsync('a failing handler is retried, then dead-lettered — never forever', async () => {
  const file = path.join(TMP, 'q-fail.db');
  const { db, q } = freshQueue(file, { queueMaxAttempts: 3 });
  let calls = 0;
  q.register('t', async () => { calls++; return { ok: false, error: 'server down' }; });
  const { id } = q.enqueue('t', { a: 1 });

  for (let i = 0; i < 10; i++) {
    // next_attempt_at is in the future after each failure; fast-forward it so
    // the test does not have to sleep through the backoff.
    db.prepare('UPDATE online_queue SET next_attempt_at = 0 WHERE id = ?').run(id);
    await q.drain();
    if (q.get(id).status === STATUS.FAILED) break;
  }
  assert.strictEqual(q.get(id).status, STATUS.FAILED);
  assert.strictEqual(calls, 3, 'attempts must stop at queueMaxAttempts, got ' + calls);
  assert.strictEqual(q.stats().failed, 1);
  db.close();
});

await okAsync('a non-retryable failure is dead-lettered on the first attempt', async () => {
  const file = path.join(TMP, 'q-perm.db');
  const { db, q } = freshQueue(file);
  let calls = 0;
  q.register('t', async () => { calls++; return { ok: false, retryable: false, error: 'rejected' }; });
  const { id } = q.enqueue('t', {});
  await q.drain();
  assert.strictEqual(calls, 1);
  assert.strictEqual(q.get(id).status, STATUS.FAILED);
  db.close();
});

await okAsync('a task type with no handler fails fast instead of looping', async () => {
  const file = path.join(TMP, 'q-nohandler.db');
  const { db, q } = freshQueue(file);
  const { id } = q.enqueue('nobody.handles.this', {});
  await q.drain();
  const t = q.get(id);
  assert.strictEqual(t.status, STATUS.FAILED);
  assert.strictEqual(t.lastError, 'no_handler_registered');
  db.close();
});

await okAsync('a throwing handler is caught and retried, not propagated', async () => {
  const file = path.join(TMP, 'q-throw.db');
  const { db, q } = freshQueue(file, { queueMaxAttempts: 2 });
  q.register('t', async () => { throw new Error('kaboom'); });
  const { id } = q.enqueue('t', {});
  await q.drain();          // survives the throw
  assert.strictEqual(q.get(id).status, STATUS.PENDING);
  db.close();
});

await okAsync('does not drain while offline', async () => {
  const file = path.join(TMP, 'q-offline.db');
  const db = new Database(file);
  const q = new OnlineQueue({ db, cfg: {
    queueDrainIntervalMs: 1000, queueMaxAttempts: 3, queueBatchSize: 5,
    backoffBaseMs: 1, backoffMaxMs: 2
  }});
  q.attachConnectivity(() => false);
  let calls = 0;
  q.register('t', async () => { calls++; return { ok: true }; });
  q.enqueue('t', {});
  const s = await q.drain();
  assert.strictEqual(s.skipped, 'offline');
  assert.strictEqual(calls, 0);
  assert.strictEqual(q.stats().pending, 1, 'the task must still be waiting');
  db.close();
});

await okAsync('a dead-lettered task can be retried deliberately', async () => {
  const file = path.join(TMP, 'q-retry.db');
  const { db, q } = freshQueue(file, { queueMaxAttempts: 1 });
  q.register('t', async () => ({ ok: false, error: 'nope' }));
  const { id } = q.enqueue('t', {});
  await q.drain();
  assert.strictEqual(q.get(id).status, STATUS.FAILED);
  assert.strictEqual(q.retryFailed(id).ok, true);
  const t = q.get(id);
  assert.strictEqual(t.status, STATUS.PENDING);
  assert.strictEqual(t.attempts, 0);
  db.close();
});

ok('stores a redacted error, never the raw one', () => {
  const file = path.join(TMP, 'q-redact.db');
  const { db, q } = freshQueue(file);
  const { id } = q.enqueue('t', {});
  q._markFailed(id, 'upload failed for 03001234567');
  const t = q.get(id);
  assert.ok(t.lastError.includes('[redacted:phone]'), t.lastError);
  assert.ok(!t.lastError.includes('03001234567'), t.lastError);
  db.close();
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nlogger.js — §40 structured logging');
// ══════════════════════════════════════════════════════════════════════════

ok('writes one redacted JSON object per line', () => {
  const dir = path.join(TMP, 'loglines');
  logger.init({ dir, level: 'DEBUG', console: false });
  const log = logger.forService('test');
  log.info('probe', { studentPhone: '03001234567', note: 'cnic 35202-1234567-1', count: 3 });
  logger.close();

  const file = logger._paths().file;
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(last.level, 'INFO');
  assert.strictEqual(last.service, 'test');
  assert.strictEqual(last.event, 'probe');
  assert.ok(last.ts, 'no timestamp');
  assert.strictEqual(last.meta.studentPhone, '[redacted]');     // key pass
  assert.ok(last.meta.note.includes('[redacted:cnic]'));        // value pass
  assert.strictEqual(last.meta.count, 3);
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes('03001234567'), 'a phone number reached the log file');
});

ok('honours the minimum level', () => {
  const dir = path.join(TMP, 'loglevel');
  logger.init({ dir, level: 'WARN', console: false });
  logger.forService('test').debug('should_not_appear', {});
  logger.forService('test').error('should_appear', {});
  logger.close();
  const raw = fs.readFileSync(logger._paths().file, 'utf8');
  assert.ok(!raw.includes('should_not_appear'));
  assert.ok(raw.includes('should_appear'));
});

ok('correlation ids are unique', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(logger.newCorrelationId());
  assert.strictEqual(seen.size, 500);
});

// This runs in a real child process because the two things being asserted —
// that the crash line reaches disk, and that the process still dies with
// exit(1) — cannot both be observed from inside the crashing process. It is
// also the reason the logger writes synchronously: a buffered stream would
// drop this line every time.
await okAsync('a crash is logged AND still exits 1, exactly as Node would', async () => {
  const { spawnSync } = require('child_process');
  const dir = path.join(TMP, 'crash');
  const script = path.join(TMP, 'crash-child.js');
  fs.writeFileSync(script, `
    const logger = require(${JSON.stringify(path.join(__dirname, '..', 'services', 'logger.js'))});
    logger.init({ dir: ${JSON.stringify(dir)}, level: 'DEBUG', console: false });
    logger.installCrashHandlers();
    setTimeout(() => { throw new Error('boom in 03001234567'); }, 0);
  `);
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });

  assert.strictEqual(r.status, 1, 'crash semantics changed — expected exit code 1');
  assert.ok(/boom/.test(r.stderr), 'the stack no longer reaches stderr');

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
  assert.strictEqual(files.length, 1, 'no crash log was written');
  const raw = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.ok(raw.includes('uncaught_exception'), raw);
  assert.ok(!raw.includes('03001234567'), 'a phone number reached the crash log');
});

await okAsync('an unhandled rejection crashes exactly once, and is logged', async () => {
  const { spawnSync } = require('child_process');
  const dir = path.join(TMP, 'crash-rej');
  const script = path.join(TMP, 'crash-rej-child.js');
  fs.writeFileSync(script, `
    const logger = require(${JSON.stringify(path.join(__dirname, '..', 'services', 'logger.js'))});
    logger.init({ dir: ${JSON.stringify(dir)}, level: 'DEBUG', console: false });
    logger.installCrashHandlers();
    Promise.reject(new Error('rejected'));
  `);
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
  const raw = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.ok(raw.includes('unhandled_rejection'), raw);
  // The re-throw routes through uncaughtException; the crash must be recorded
  // once as a rejection and once as the exception it becomes — not looping.
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length <= 3, 'crash handling looped: ' + lines.length + ' lines');
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nentitlement.js — §10 licence states, §11 trust root (audit C2/H1)');
// ══════════════════════════════════════════════════════════════════════════

// Signed with an EPHEMERAL keypair generated right here, and injected through
// the service's `keys` option. The suite therefore does not depend on the real
// private key, which lives in the control plane's secret store and is not on
// this machine — a test that needed it could only ever be run by one person.
const ent = require('../services/entitlement');
const TEST_KID = 'test-kid';
const _entPair = crypto.generateKeyPairSync('ed25519');
const TEST_KEYS = { [TEST_KID]: _entPair.publicKey.export({ type: 'spki', format: 'pem' }) };

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** Mint a compact JWS the way the control plane will. */
function signEnt(claims, opts) {
  const o = opts || {};
  const header = Object.assign({ alg: 'EdDSA', typ: 'JWT', kid: TEST_KID }, o.header || {});
  const h = b64u(JSON.stringify(header));
  const c = b64u(JSON.stringify(claims));
  const input = Buffer.from(h + '.' + c, 'ascii');
  const sig = o.badSignature
    ? Buffer.alloc(64, 7)
    : crypto.sign(null, input, o.key || _entPair.privateKey);
  return h + '.' + c + '.' + b64u(sig);
}

const DAY = 86400000;
function claimsFor(over) {
  const now = Date.now();
  return Object.assign({
    ver: 1,
    deviceId:  'dev_1',
    licenseId: 'lic_1',
    machineId: 'MACHINE_A',
    status:    'ACTIVE',
    issuedAt:  new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * DAY).toISOString(),
    notAfter:  new Date(now + 7 * DAY).toISOString(),
    policy:    { graceDays: 14, readOnlyOnExpiry: true }
  }, over || {});
}

const entOpts = { keys: TEST_KEYS, machineId: 'MACHINE_A' };

ok('a well-formed entitlement verifies', () => {
  const r = ent.verifyEntitlement(signEnt(claimsFor()), entOpts);
  assert.strictEqual(r.valid, true, r.reason);
  assert.strictEqual(r.claims.status, 'ACTIVE');
  assert.strictEqual(r.kid, TEST_KID);
});

ok('a tampered payload is rejected', () => {
  const jws = signEnt(claimsFor());
  const parts = jws.split('.');
  parts[1] = b64u(JSON.stringify(claimsFor({ expiresAt: new Date(Date.now() + 3650 * DAY).toISOString() })));
  const r = ent.verifyEntitlement(parts.join('.'), entOpts);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, ent.E.BAD_SIGNATURE);
});

ok('alg:none is rejected — the classic JWT break', () => {
  const h = b64u(JSON.stringify({ alg: 'none', typ: 'JWT', kid: TEST_KID }));
  const c = b64u(JSON.stringify(claimsFor()));
  const r = ent.verifyEntitlement(h + '.' + c + '.', entOpts);
  assert.strictEqual(r.valid, false);
  // An empty third segment trips the structural check before alg is read;
  // either refusal is correct, neither may pass.
  assert.ok(r.reason === ent.E.ALG || r.reason === ent.E.MALFORMED, r.reason);
});

ok('an HMAC alg is rejected even with a correct-looking signature', () => {
  // Algorithm confusion: sign with HS256 using the PUBLIC key as the shared
  // secret. A verifier that trusts the header's alg accepts this.
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: TEST_KID }));
  const c = b64u(JSON.stringify(claimsFor()));
  const mac = crypto.createHmac('sha256', TEST_KEYS[TEST_KID]).update(h + '.' + c).digest();
  const r = ent.verifyEntitlement(h + '.' + c + '.' + b64u(mac), entOpts);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, ent.E.ALG);
});

ok('a signature from the wrong key is rejected', () => {
  const other = crypto.generateKeyPairSync('ed25519');
  const r = ent.verifyEntitlement(signEnt(claimsFor(), { key: other.privateKey }), entOpts);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, ent.E.BAD_SIGNATURE);
});

ok('an unknown kid is rejected', () => {
  const r = ent.verifyEntitlement(signEnt(claimsFor(), { header: { kid: 'nope' } }), entOpts);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, ent.E.UNKNOWN_KID);
});

ok('an entitlement for another machine is rejected', () => {
  const r = ent.verifyEntitlement(signEnt(claimsFor({ machineId: 'MACHINE_B' })), entOpts);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, ent.E.WRONG_MACHINE);
});

ok('claims are validated strictly, not plausibly', () => {
  const bad = [
    claimsFor({ ver: 2 }),
    claimsFor({ status: 'TOTALLY_FINE' }),
    claimsFor({ status: undefined }),
    claimsFor({ expiresAt: 'soon' }),
    claimsFor({ policy: undefined }),
    claimsFor({ policy: { graceDays: -1, readOnlyOnExpiry: true } }),
    claimsFor({ policy: { graceDays: 14, readOnlyOnExpiry: 'yes' } }),
    claimsFor({ machineId: '' })
  ];
  for (const c of bad) {
    const r = ent.verifyEntitlement(signEnt(c), entOpts);
    assert.strictEqual(r.valid, false, 'accepted: ' + JSON.stringify(c));
  }
});

ok('garbage input never throws', () => {
  for (const bad of [null, undefined, '', 'x', 'a.b', 'a.b.c.d', '...', 42, {}]) {
    const r = ent.verifyEntitlement(bad, entOpts);
    assert.strictEqual(r.valid, false);
  }
});

ok('past notAfter → stale, with claims preserved for the UI', () => {
  const c = claimsFor({ notAfter: new Date(Date.now() - DAY).toISOString() });
  const r = ent.verifyEntitlement(signEnt(c), entOpts);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.stale, true);
  assert.strictEqual(r.reason, ent.E.STALE);
  assert.strictEqual(r.claims.licenseId, 'lic_1', 'a stale token must still explain itself');
});

ok('the shipped public key map parses and is addressed by kid', () => {
  const keys = require('../services/entitlement-keys');
  assert.ok(Object.keys(keys.KEYS).length >= 1);
  assert.ok(keys.KEYS[keys.ACTIVE_KID], 'ACTIVE_KID is not in the map');
  const parsed = crypto.createPublicKey(keys.KEYS[keys.ACTIVE_KID]);
  assert.strictEqual(parsed.asymmetricKeyType, 'ed25519');
});

// ── The service: cache, staleness, clock watermark ────────────────────────

function newEntService(dir, over) {
  return new ent.EntitlementService(Object.assign({
    userDataDir: dir,
    keys: TEST_KEYS,
    machineIdProvider: () => 'MACHINE_A'
  }, over || {}));
}

ok('with no cache the state is NONE — which is every machine today', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  const st = newEntService(dir).load();
  assert.strictEqual(st.state, ent.LOCAL.NONE);
  assert.strictEqual(st.enforced, false, 'this phase must enforce nothing');
});

ok('a verified entitlement is cached and survives a restart', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  const a = newEntService(dir);
  a.store(signEnt(claimsFor()));
  assert.strictEqual(a.getStatus().state, 'ACTIVE');

  // A genuinely new instance reading only what is on disk.
  const b = newEntService(dir);
  const st = b.load();
  assert.strictEqual(st.state, 'ACTIVE');
  assert.strictEqual(st.deviceId, 'dev_1');
});

ok('an entitlement that does not verify is never written to disk', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  const svc = newEntService(dir);
  svc.store(signEnt(claimsFor(), { badSignature: true }));
  assert.strictEqual(svc.getStatus().state, ent.LOCAL.NONE);
  assert.strictEqual(fs.existsSync(path.join(dir, ent.CACHE_FILE)), false,
    'a rejected entitlement reached the cache');
});

ok('a corrupt cache file degrades to NONE rather than throwing', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  fs.writeFileSync(path.join(dir, ent.CACHE_FILE), '{not json');
  assert.strictEqual(newEntService(dir).load().state, ent.LOCAL.NONE);
});

ok('a cached entitlement goes STALE once notAfter passes', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  newEntService(dir).store(signEnt(claimsFor()));
  // The same bytes on disk, read 8 days later.
  const later = Date.now() + 8 * DAY;
  const st = newEntService(dir, { now: () => later }).load();
  assert.strictEqual(st.state, ent.LOCAL.STALE);
  assert.strictEqual(st.licenseId, 'lic_1');
});

ok('a copied entitlement is refused on a different machine', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  newEntService(dir).store(signEnt(claimsFor()));
  const other = newEntService(dir, { machineIdProvider: () => 'MACHINE_B' });
  assert.strictEqual(other.load().state, ent.LOCAL.NONE);
});

ok('a clock wound back behind server time is detectable (audit H1)', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  const issuedAt = new Date().toISOString();
  newEntService(dir).store(signEnt(claimsFor({ issuedAt })));

  const rolledBack = Date.parse(issuedAt) - 30 * DAY;
  const svc = newEntService(dir, { now: () => rolledBack });
  svc.load();
  assert.strictEqual(svc.clockSuspect(), true,
    'a clock behind a time the server already asserted must be detectable');
});

ok('the server-time watermark only ever moves forward', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  const svc = newEntService(dir);
  const newer = new Date(Date.now()).toISOString();
  const older = new Date(Date.now() - 10 * DAY).toISOString();
  svc.store(signEnt(claimsFor({ issuedAt: newer })));
  svc.store(signEnt(claimsFor({ issuedAt: older })));
  assert.strictEqual(svc.getStatus().serverTimeSeen, newer,
    'an older entitlement lowered the watermark');
});

ok('clear() drops the cache but not the watermark', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  const svc = newEntService(dir);
  svc.store(signEnt(claimsFor()));
  const seen = svc.getStatus().serverTimeSeen;
  const st = svc.clear();
  assert.strictEqual(st.state, ent.LOCAL.NONE);
  assert.strictEqual(fs.existsSync(path.join(dir, ent.CACHE_FILE)), false);
  assert.strictEqual(svc.getStatus().serverTimeSeen, seen,
    'deactivation must not be a way to launder a wound-back clock');
});

await okAsync('refresh() makes ZERO network calls while unconfigured', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ent-'));
  let called = 0;
  api._setFetch(() => { called++; throw new Error('the wire must not be touched'); });
  try {
    config.load({ overrides: { apiBase: null } });
    const r = await newEntService(dir).refresh('tok');
    assert.strictEqual(r.errorCode, 'E_NOT_CONFIGURED');
    assert.strictEqual(called, 0, 'an unconfigured install reached the network');
  } finally {
    api._setFetch(null);
    config.load({});
  }
});

// ══════════════════════════════════════════════════════════════════════════
console.log('\nenforcement.js — what the app is allowed to do');
// ══════════════════════════════════════════════════════════════════════════

const enf = require('../services/enforcement');   // DAY is already defined above

const licenceValid = (over) => Object.assign({
  valid: true,
  expiry: new Date(Date.now() + 90 * DAY).toISOString(),
  activatedAt: new Date(Date.now() - 200 * DAY).toISOString()
}, over || {});

ok('a healthy licence is ACTIVE and unrestricted', () => {
  const d = enf.resolve({ licence: licenceValid() });
  assert.strictEqual(d.state, 'ACTIVE');
  assert.strictEqual(d.readOnly, false);
  assert.strictEqual(d.blocked, false);
  assert.strictEqual(d.source, 'local');
});

ok('past expiry it enters GRACE and STILL works', () => {
  // The customer gets room to pay. Locking on the stroke of midnight would
  // punish a hostel whose renewal is already in the post.
  const d = enf.resolve({ licence: licenceValid({ expiry: new Date(Date.now() - 3 * DAY).toISOString() }) });
  assert.strictEqual(d.state, 'GRACE');
  assert.strictEqual(d.readOnly, false, 'grace must not restrict anything');
});

ok('past grace it is EXPIRED and read-only', () => {
  const d = enf.resolve({ licence: licenceValid({ expiry: new Date(Date.now() - 90 * DAY).toISOString() }) });
  assert.strictEqual(d.state, 'EXPIRED');
  assert.strictEqual(d.readOnly, true);
  assert.strictEqual(d.blocked, false, 'expired must NOT lock them out of their own records');
});

ok('an unusable licence file still sends them to activation', () => {
  // Unchanged from what 50+ machines already do. None of these is a licensing
  // policy decision this module should soften.
  for (const reason of ['not_activated', 'tampered', 'wrong_machine', 'corrupt']) {
    const d = enf.resolve({ licence: { valid: false, reason } });
    assert.strictEqual(d.state, 'UNLICENSED', reason);
    assert.strictEqual(d.blocked, true, reason);
  }
});

ok('EXPIRED never blocks, and REVOKED always does', () => {
  const expired = enf.resolve({ licence: licenceValid({ expiry: new Date(Date.now() - 900 * DAY).toISOString() }) });
  assert.strictEqual(expired.blocked, false);
  const revoked = enf.resolve({
    licence: licenceValid(),
    entitlement: { state: 'REVOKED', policy: enf.DEFAULT_POLICY }
  });
  assert.strictEqual(revoked.blocked, true);
});

ok('a fresh entitlement outranks the local file', () => {
  // The only thing that can know about a suspension decided after activation.
  const d = enf.resolve({
    licence: licenceValid(),                       // local says: fine for 90 days
    entitlement: { state: 'SUSPENDED', policy: enf.DEFAULT_POLICY, expiresAt: licenceValid().expiry }
  });
  assert.strictEqual(d.state, 'SUSPENDED');
  assert.strictEqual(d.source, 'entitlement');
  assert.strictEqual(d.readOnly, true);
});

ok('a STALE or missing entitlement falls back to the licence file', () => {
  // Offline is the normal case. A hostel with no internet for six months and a
  // valid licence must keep working exactly as before.
  for (const ent of [null, { state: 'NONE' }, { state: 'STALE', reason: 'E_ENT_STALE' }]) {
    const d = enf.resolve({ licence: licenceValid(), entitlement: ent });
    assert.strictEqual(d.state, 'ACTIVE', JSON.stringify(ent));
    assert.strictEqual(d.source, 'local', JSON.stringify(ent));
    assert.strictEqual(d.readOnly, false);
  }
});

ok('the server can extend grace, and can switch the lock off entirely', () => {
  const expiry = new Date(Date.now() - 20 * DAY).toISOString();
  const strict = enf.resolve({ licence: licenceValid({ expiry }) });
  assert.strictEqual(strict.state, 'EXPIRED');   // 14-day default

  const lenient = enf.resolve({
    licence: licenceValid({ expiry }),
    entitlement: { state: 'GRACE', expiresAt: expiry, policy: { graceDays: 60, readOnlyOnExpiry: true } }
  });
  assert.strictEqual(lenient.state, 'GRACE');
  assert.strictEqual(lenient.readOnly, false);

  const noLock = enf.resolve({
    licence: licenceValid({ expiry }),
    entitlement: { state: 'EXPIRED', expiresAt: expiry, policy: { graceDays: 14, readOnlyOnExpiry: false } }
  });
  assert.strictEqual(noLock.state, 'EXPIRED');
  assert.strictEqual(noLock.readOnly, false, 'readOnlyOnExpiry:false must actually unlock');
});

// ── Effective time ────────────────────────────────────────────────────────

ok('with an honest clock, the clock is used', () => {
  const t = enf.effectiveNow({
    systemNow: Date.parse('2026-08-20T10:00:00Z'),
    lastRun: '2026-08-19T10:00:00Z',
    activatedAt: '2026-01-01T00:00:00Z'
  });
  assert.strictEqual(t.source, 'system');
  assert.strictEqual(t.clockSuspect, false);
});

ok('a clock wound back is replaced by the watermark, not rejected', () => {
  // Using the watermark AS the clock rather than raising a tamper error: an
  // error screen is a puzzle to solve, and a customer who learns to trigger it
  // has learned something useful.
  const t = enf.effectiveNow({
    systemNow: Date.parse('2026-01-01T00:00:00Z'),
    lastRun: '2026-08-19T10:00:00Z'
  });
  assert.strictEqual(t.source, 'last_run');
  assert.strictEqual(t.clockSuspect, true);
  assert.strictEqual(t.now.toISOString(), '2026-08-19T10:00:00.000Z');
});

ok('rolling the clock back does NOT extend a licence', () => {
  // The whole point. Expiry is enforced locally, so this is the attack.
  const expiry = '2026-06-01T00:00:00Z';
  const t = enf.effectiveNow({
    systemNow: Date.parse('2026-05-01T00:00:00Z'),   // "it is still May"
    lastRun: '2026-08-19T00:00:00Z'                  // but the app ran in August
  });
  const d = enf.resolve({ licence: licenceValid({ expiry }), now: t.now });
  assert.strictEqual(d.state, 'EXPIRED', 'a wound-back clock bought more time');
});

ok('the LATEST watermark wins, and a signed one counts', () => {
  const t = enf.effectiveNow({
    systemNow: Date.parse('2026-01-01T00:00:00Z'),
    lastRun: '2026-03-01T00:00:00Z',
    activatedAt: '2026-02-01T00:00:00Z',
    serverTimeSeen: '2026-08-01T00:00:00Z'
  });
  assert.strictEqual(t.source, 'server');
  assert.strictEqual(t.now.toISOString(), '2026-08-01T00:00:00.000Z');
});

ok('small drift is a lazy clock, not an accusation', () => {
  const t = enf.effectiveNow({
    systemNow: Date.parse('2026-08-20T10:00:00Z'),
    lastRun: '2026-08-20T10:01:00Z'          // one minute ahead
  });
  assert.strictEqual(t.clockSuspect, false, 'a minute of drift must not accuse anyone');
});

ok('no watermarks at all is not a failure', () => {
  const t = enf.effectiveNow({ systemNow: 1000 });
  assert.strictEqual(t.source, 'system');
  assert.strictEqual(t.clockSuspect, false);
});

// ── The write gate ────────────────────────────────────────────────────────

ok('an active licence blocks nothing', () => {
  const d = enf.resolve({ licence: licenceValid() });
  for (const t of ['students', 'payments', 'expenses', 'rooms', 'activitylog']) {
    assert.strictEqual(enf.writeBlocked(d, t), false, t);
  }
});

ok('read-only blocks business writes', () => {
  const d = enf.resolve({ licence: licenceValid({ expiry: new Date(Date.now() - 90 * DAY).toISOString() }) });
  assert.strictEqual(d.readOnly, true);
  for (const t of ['students', 'payments', 'expenses', 'rooms', 'cancellations']) {
    assert.strictEqual(enf.writeBlocked(d, t), true, t);
  }
});

ok('the activity log keeps recording during a lockout', () => {
  // Freezing it would make the one period a support call cares about the one
  // period with no record.
  const d = enf.resolve({ licence: licenceValid({ expiry: new Date(Date.now() - 90 * DAY).toISOString() }) });
  assert.strictEqual(enf.writeBlocked(d, 'activitylog'), false);
});

ok('GRACE blocks nothing at all', () => {
  const d = enf.resolve({ licence: licenceValid({ expiry: new Date(Date.now() - 3 * DAY).toISOString() }) });
  for (const t of ['students', 'payments']) {
    assert.strictEqual(enf.writeBlocked(d, t), false, t);
  }
});

// ── What the customer is told ─────────────────────────────────────────────

ok('an active licence says nothing until renewal is near', () => {
  assert.strictEqual(enf.message(enf.resolve({ licence: licenceValid() })), null);
  const soon = enf.message(enf.resolve({
    licence: licenceValid({ expiry: new Date(Date.now() + 10 * DAY).toISOString() }) }));
  assert.ok(soon && /10 days left/.test(soon.text), soon && soon.text);
});

ok('every restricted state explains itself and offers a way out', () => {
  const cases = [
    enf.resolve({ licence: licenceValid({ expiry: new Date(Date.now() - 3 * DAY).toISOString() }) }),
    enf.resolve({ licence: licenceValid({ expiry: new Date(Date.now() - 90 * DAY).toISOString() }) }),
    enf.resolve({ licence: licenceValid(), entitlement: { state: 'SUSPENDED', policy: enf.DEFAULT_POLICY } })
  ];
  for (const d of cases) {
    const m = enf.message(d, { supportContact: 'Hostyllo support' });
    assert.ok(m && m.text.length > 20, d.state);
    assert.ok(/renew|restore|contact/i.test(m.text), d.state + ': ' + m.text);
  }
});

ok('read-only messages promise the data is still there', () => {
  const m = enf.message(enf.resolve({
    licence: licenceValid({ expiry: new Date(Date.now() - 90 * DAY).toISOString() }) }));
  assert.ok(/view|print/i.test(m.text), m.text);
});

// ── Summary ────────────────────────────────────────────────────────────────
logger.close();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

})();
