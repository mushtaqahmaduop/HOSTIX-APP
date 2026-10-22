/* ─── Control plane — load test ───────────────────────────────────────────────

   The question the owner asked (2026-09-24): can any loop overload the server?
   This holds N simulated installs on the live stream at once, makes a
   FLEET-WIDE change — the worst case, because it reaches every install — and
   has each simulated app do exactly what the real one does: wait the delay the
   server names, then fetch its signed entitlement.

   It reports how long N streams take to open, how the fetches spread over
   time, the busiest second, latency, errors, database connections and the
   server's memory. It FAILS if any request errors or if the fetches arrive as a
   single spike.

   Needs a disposable database (it drops the schema):

     TEST_DATABASE_URL=postgres://cp:cp@localhost/cp_load node test/load.js [N]

   The per-IP ceilings are raised for the run — every simulated install comes
   from 127.0.0.1, which in production would be a thousand different addresses.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const pg = require('pg');

const URL_ = process.env.TEST_DATABASE_URL;
if (!URL_) { console.log('load test SKIPPED (set TEST_DATABASE_URL)'); process.exit(0); }
if (/railway|supabase|rlwy|amazonaws/i.test(URL_)) { console.error('Refusing a hosted database.'); process.exit(1); }

const N = parseInt(process.argv[2] || '1000', 10);
const PORT = 8793;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

(async () => {
  const c = new pg.Client({ connectionString: URL_ });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE');
  await c.query('CREATE SCHEMA public');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  }

  // N hostels, one PC each, one live token each — inserted directly.
  const tokens = [];
  await c.query('BEGIN');
  for (let i = 0; i < N; i++) {
    const lic = await c.query(
      `INSERT INTO licenses (key_fingerprint, key_version, key_expiry_part, key_expires_at, expires_at, verification, hostel_name)
       VALUES ($1, 4, '0ZZZ', NOW() + INTERVAL '1 year', NOW() + INTERVAL '1 year', 'verified', $2) RETURNING id`,
      [sha('lic' + i), 'Load Hostel ' + i]);
    const dev = await c.query(
      `INSERT INTO devices (license_id, machine_id, secret_hash, app_version) VALUES ($1, $2, 'x', '5.2.0') RETURNING id`,
      [lic.rows[0].id, sha('m' + i)]);
    const tok = crypto.randomBytes(32).toString('base64url');
    await c.query(`INSERT INTO device_tokens (token_hash, device_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [sha(tok), dev.rows[0].id]);
    tokens.push(tok);
  }
  await c.query('COMMIT');

  const kp = crypto.generateKeyPairSync('ed25519');
  const srv = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      DATABASE_URL: URL_, SESSION_SECRET: 'l'.repeat(48), LEGACY_KEY_SECRET: 'load', PORT: String(PORT),
      HOST: '127.0.0.1', NODE_ENV: 'production', LOG_LEVEL: 'error',
      ENTITLEMENT_SIGNING_JWK: JSON.stringify(Object.assign({ kid: 'load' }, kp.privateKey.export({ format: 'jwk' }))),
      V1_IP_PER_MIN: '1000000', STREAM_OPENS_PER_10MIN: '1000000', MAX_STREAMS: String(N + 100)
    }),
    stdio: ['ignore', 'inherit', 'inherit']
  });
  for (let i = 0; i < 100; i++) {
    try { await new Promise((ok, no) => http.get('http://127.0.0.1:' + PORT + '/v1/healthz', (r) => { r.resume(); ok(); }).on('error', no)); break; }
    catch (_) { await sleep(100); }
  }

  const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
  const fetches = [];   // {at, ms, status}
  let changed = 0, hello = 0, errors = 0;
  const delays = [];

  function getEntitlement(tok) {
    const t0 = Date.now();
    http.get({ host: '127.0.0.1', port: PORT, path: '/v1/entitlement', agent,
      headers: { authorization: 'Bearer ' + tok } }, (r) => {
      r.resume();
      r.on('end', () => fetches.push({ at: Date.now(), ms: Date.now() - t0, status: r.statusCode }));
    }).on('error', () => { errors++; });
  }

  // ── Open N streams ──
  const t0 = Date.now();
  const opened = tokens.map((tok) => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/v1/devices/stream', agent,
      headers: { authorization: 'Bearer ' + tok, accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) { errors++; res.resume(); return resolve(); }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block);
          const da = /^data: (.*)$/m.exec(block);
          if (!ev) continue;
          if (ev[1] === 'hello') { hello++; resolve(); }
          if (ev[1] === 'changed') {
            changed++;
            const delay = (da && JSON.parse(da[1]).delayMs) || 0;
            delays.push(delay);
            // Exactly what services/stream.js does: wait, then fetch.
            setTimeout(() => getEntitlement(tok), Math.max(250, delay));
          }
        }
      });
      res.on('error', () => {});
    });
    req.on('error', () => { errors++; resolve(); });
  }));
  await Promise.all(opened);
  const openMs = Date.now() - t0;
  await sleep(1500);

  const conns = await c.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()");

  // ── The worst case: a fleet-wide change ──
  const tChange = Date.now();
  await c.query(`UPDATE fleet_settings SET restrictions = '{"exporting": false}'::jsonb WHERE id`);
  // Wait until every install has fetched (or 90s).
  for (let i = 0; i < 900 && fetches.length < N; i++) await sleep(100);

  const perSecond = {};
  for (const f of fetches) { const k = Math.floor((f.at - tChange) / 1000); perSecond[k] = (perSecond[k] || 0) + 1; }
  const peak = Math.max(0, ...Object.values(perSecond));
  const lat = fetches.map((f) => f.ms).sort((a, b) => a - b);
  const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] || 0;
  const bad = fetches.filter((f) => f.status !== 200).length;
  const spanS = fetches.length ? (Math.max(...fetches.map((f) => f.at)) - tChange) / 1000 : 0;
  const rss = fs.existsSync('/proc/' + srv.pid + '/status')
    ? (/VmRSS:\s+(\d+)/.exec(fs.readFileSync('/proc/' + srv.pid + '/status', 'utf8')) || [])[1] : null;

  console.log('\ncontrol plane — load test, ' + N + ' installs on the live stream\n');
  console.log('  streams opened            ' + hello + '/' + N + ' in ' + openMs + ' ms');
  console.log('  server memory (RSS)       ' + (rss ? Math.round(rss / 1024) + ' MB' : 'n/a'));
  console.log('  database connections      ' + conns.rows[0].n + ' (pool max 10 + listener)');
  console.log('  fleet change delivered    ' + changed + '/' + N);
  console.log('  entitlement fetches       ' + fetches.length + '/' + N + ', spread over ' + spanS.toFixed(1) + ' s');
  console.log('  busiest second            ' + peak + ' fetches (unspread it would be ' + N + ')');
  console.log('  fetch latency p50/p95/p99 ' + p(0.5) + ' / ' + p(0.95) + ' / ' + p(0.99) + ' ms');
  console.log('  errors                    ' + (errors + bad));

  let ok = true;
  try {
    assert.strictEqual(hello, N, 'not every stream opened');
    assert.strictEqual(changed, N, 'the fleet change did not reach every stream');
    assert.strictEqual(fetches.length, N, 'not every install fetched');
    assert.strictEqual(errors + bad, 0, 'requests failed under load');
    if (N >= 200) assert.ok(peak < N / 3, 'the fetches arrived as one spike (' + peak + ' in one second)');
    assert.ok(conns.rows[0].n <= 14, 'streams are holding database connections');
  } catch (e) { ok = false; console.log('\n  FAIL ' + e.message); }
  console.log(ok ? '\n  PASS\n' : '');

  srv.kill('SIGTERM');
  await sleep(500);
  await c.end();
  agent.destroy();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
