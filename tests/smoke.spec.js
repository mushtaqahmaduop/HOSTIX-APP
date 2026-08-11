// ════════════════════════════════════════════════════════════════════════════
// HOSTIX — Phase 0 safety-net smoke test
//
// Proves the critical path still works before any audit refactor:
//   1. App boots to the real app (valid license) — NOT the activation screen.
//   2. Warden login works.
//   3. Every main page renders with no render-error block.
//   4. Add Room + Add Student through the app's REAL submit functions.
//   5. That data is persisted to SQLite (via IPC) and survives a full app restart.
//   6. The Add Payment modal opens (UI path).
//   7. The backup export data path returns the seeded data.
//
// Runs against an ISOLATED throwaway profile (HOSTIX_TEST_PROFILE) that has a
// copied license.enc but a FRESH empty database. A safety guard aborts before
// writing anything if the DB isn't empty (i.e. isolation failed) so real client
// data can never be touched.
//
// NOTE: full end-to-end *payment submission* is intentionally deferred to Phase 2
// (plan §6.2) — the payment modal is complex and blind-automating it would make
// this safety net flaky. Phase 0 asserts the modal opens; that's the safety line.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron'); // resolves to the electron.exe path

const PAGES = ['rooms', 'students', 'payments', 'expenses', 'cancellations',
  'reports', 'issues', 'activitylog', 'settings', 'dashboard'];

function launchOpts() {
  // Critical: strip ELECTRON_RUN_AS_NODE — if set, electron.exe runs as plain Node
  // and `require('electron').app` is undefined, so main.js crashes on launch.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'], // stability in headless/CI-like shells
    env,
  };
}

async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  // Wait for async warden-config boot to finish so the default password exists.
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 30000 });
  // Login is username + password now; a fresh profile seeds warden1 with its
  // username as the default password.
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'warden1');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
}

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
  // Fresh DB each invocation; keep the copied license.enc.
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  // Also reset Chromium localStorage so wardens re-seed to the default and any
  // lockout left by a prior spec (e.g. regression.spec.js) can't fail login here.
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('HOSTIX smoke: login → all pages render → add room+student → persist across restart → backup', async () => {
  const consoleErrors = [];

  // ───────────────────────── Launch 1 ─────────────────────────
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await win.waitForLoadState('domcontentloaded');

  // Reached the real app, not the activation screen? (#login-input only exists in index.html)
  await login(win);

  // Dashboard rendered without error.
  await win.waitForTimeout(500);
  const dash = await win.evaluate(() => document.getElementById('content').innerHTML);
  expect(dash, 'dashboard produced a render error').not.toContain('Render Error on');

  // SAFETY GUARD — the isolated DB must be empty before we write anything.
  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length,
    'SAFETY ABORT: expected an EMPTY isolated DB before seeding — profile isolation may have ' +
    'failed and this could be pointing at real client data. Not writing anything.').toBe(0);

  // Every main page renders with no render-error block.
  for (const p of PAGES) {
    await win.evaluate((pg) => navigate(pg), p);
    await win.waitForTimeout(350);
    const html = await win.evaluate(() => document.getElementById('content').innerHTML);
    expect(html, `page "${p}" produced a render error`).not.toContain('Render Error on');
    expect(html.length, `page "${p}" rendered empty`).toBeGreaterThan(0);
  }

  // Add a room via the real submit path.
  await win.evaluate(() => showAddRoomModal());
  await win.waitForSelector('#f-rnum');
  await win.fill('#f-rnum', 'T01');
  await win.evaluate(() => {
    document.getElementById('f-rfloor').value = 'Ground';
    document.getElementById('f-rtype').value = '1s';
  });
  await win.evaluate(() => submitAddRoom());
  await win.waitForTimeout(300);
  const roomId = await win.evaluate(() => (DB.rooms[0] || {}).id);
  expect(roomId, 'room was not created by submitAddRoom()').toBeTruthy();

  // Add a student into that room via the real submit path (saveOnly=true).
  await win.evaluate(() => showAddStudentModal());
  await win.waitForSelector('#f-tname');
  await win.fill('#f-tname', 'Test Student QA');
  await win.evaluate((rid) => { document.getElementById('f-troom').value = rid; }, roomId);
  await win.evaluate(() => submitAddStudent('', false, true));
  await win.waitForTimeout(400);
  await win.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });

  // Persisted to SQLite (via IPC round-trip)?
  const dbRooms = await win.evaluate(() => window.electronAPI.dbAll('rooms'));
  const dbStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(dbRooms.length, 'room not persisted to SQLite').toBeGreaterThan(0);
  expect(dbStuds.some(s => s.name === 'Test Student QA'),
    'student not persisted to SQLite').toBeTruthy();

  // Add Payment modal opens (UI path; submission deferred to Phase 2).
  await win.evaluate(() => navigate('payments'));
  await win.waitForTimeout(300);
  await win.evaluate(() => showAddPaymentModal());
  await win.waitForSelector('#f-pamt', { timeout: 8000 });
  await win.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });

  // Backup export data path.
  const exp = await win.evaluate(() => window.electronAPI.dbExportFull());
  expect(exp.ok, 'backup export failed').toBeTruthy();
  expect(exp.data.students.length, 'backup export missing seeded student').toBeGreaterThan(0);

  await app.close();

  // ───────────────────────── Launch 2 (restart persistence) ─────────────────────────
  const app2 = await electron.launch(launchOpts());
  const win2 = await app2.firstWindow();
  await win2.waitForLoadState('domcontentloaded');
  await login(win2);
  await win2.evaluate(() => navigate('students'));
  await win2.waitForTimeout(600);
  const studentsHtml = await win2.evaluate(() => document.getElementById('content').innerHTML);
  expect(studentsHtml, 'seeded student missing after full app restart')
    .toContain('Test Student QA');
  await app2.close();

  if (consoleErrors.length) {
    // Non-fatal: printed for visibility (CDN/font/chart timing noise is expected).
    console.log('\n[note] ' + consoleErrors.length +
      ' console error(s) during run (non-fatal):\n  - ' +
      consoleErrors.slice(0, 20).join('\n  - '));
  }
});
