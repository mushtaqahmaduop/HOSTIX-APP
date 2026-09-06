// ════════════════════════════════════════════════════════════════════════════
// Database corruption: detect, stop writing, recover.  Spec §17.
//
// Before this, a damaged hostix.db was an unhandled crash. initDatabase() was
// called bare inside app.whenReady(), so `new Database()` throwing on a broken
// file took the whole boot with it — no window, no message, and no way for a
// warden to tell a damaged file apart from a damaged app. Their data was
// usually sitting intact in a backup one directory listing away.
//
// The order these assert in is the order that matters:
//   detect → refuse to write → offer a verified backup → restore beside the
//   live file → check the copy → swap → keep the original.
//
// The last one is the point people skip. A recovery that writes straight over
// the live file has, for the length of the copy, destroyed the evidence and not
// yet produced a working replacement.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { resetProfile, profileDir } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env };
}

async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
}

const dbFile = () => path.join(profileDir(), 'hostix.db');

/** Ruin the header. SQLite refuses the file outright, which is the common shape
 *  of real damage — a half-written first page after a power cut. */
function corruptDatabase() {
  const p = dbFile();
  const fd = fs.openSync(p, 'r+');
  fs.writeSync(fd, Buffer.from('NOT-A-SQLITE-FILE-AT-ALL-'.repeat(4)), 0, 100, 0);
  fs.closeSync(fd);
  // The WAL belongs to the old database and would be replayed over anything we
  // put in its place.
  for (const side of ['-wal', '-shm']) {
    try { fs.rmSync(p + side, { force: true }); } catch (_) {}
  }
}

test.describe.configure({ mode: 'serial' });

// ── Stage 1: a healthy app, made to leave a backup behind ───────────────────
test('a healthy database reports HEALTHY, and a restore leaves a backup to recover from', async () => {
  resetProfile();
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const out = await win.evaluate(async () => {
    const health = await window.electronAPI.dbHealth();

    // TWO restores, and the second is the one that matters.
    //
    // A pre-restore snapshot is, by definition, the database as it was BEFORE
    // that restore. So the snapshot taken during the first import holds the
    // empty starting state, not the record the import introduced — recovering
    // from it correctly produces a hostel with no students, which is right and
    // useless as a fixture.
    //
    // The second import's snapshot is the state left by the first, so it is the
    // one that carries Recovery Student and the one stage 5 expects back.
    const first = await window.electronAPI.dbImportFull({
      students: [{ id: 'rec_s1', name: 'Recovery Student', status: 'Active' }],
      rooms:    [{ id: 'rec_r1', number: '7', typeId: '2s' }],
      settings: { hostelName: 'Recovery Test' },
    });
    const second = await window.electronAPI.dbImportFull({
      students: [{ id: 'rec_s2', name: 'Later Student', status: 'Active' }],
      rooms:    [{ id: 'rec_r2', number: '8', typeId: '2s' }],
      settings: { hostelName: 'Recovery Test' },
    });
    return { health, first, second };
  });

  expect(out.health.state, 'a sound database must report HEALTHY').toBe('HEALTHY');
  expect(out.first.ok).toBe(true);
  expect(out.second.ok).toBe(true);
  expect(out.second.preRestoreBackup, 'no snapshot to recover from').toBeTruthy();

  await app.close();
});

// ── Stage 2: corruption is detected instead of crashing the boot ────────────
test('a damaged database opens the recovery screen instead of taking the boot down', async () => {
  corruptDatabase();

  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // The window we get is the recovery screen, not the app and not nothing.
  const title = await win.title();
  expect(title, 'the recovery window did not open').toContain('Recovery');

  const health = await win.evaluate(() => window.electronAPI.dbHealth());
  expect(health.state, 'corruption was not detected').toBe('CORRUPT');
  expect(health.reason, 'no reason was recorded').toBeTruthy();

  // It says what happened, and it says the data is not gone.
  const body = await win.evaluate(() => document.body.innerText);
  expect(body).toContain('stopped writing');
  expect(body).toContain('Nothing has been deleted');

  await app.close();
});

// ── Stage 3: nothing may write to a database we know is damaged ─────────────
test('every write is refused while the database is damaged, with a reason that is not a licence message', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  const results = await win.evaluate(async () => ({
    upsert: await window.electronAPI.dbUpsert('students', 'x1', { id: 'x1', name: 'Nope' }),
    del:    await window.electronAPI.dbDelete('students', 'x1'),
    bulk:   await window.electronAPI.dbBulkReplace('students', [{ id: 'x2' }]),
    setting:await window.electronAPI.dbSetSetting('hostelSettings', { hostelName: 'Nope' }),
    imp:    await window.electronAPI.dbImportFull({ students: [{ id: 'x3' }], rooms: [] }),
  }));

  for (const [name, r] of Object.entries(results)) {
    expect(r.ok, `${name} reported success against a damaged database`).toBe(false);
    expect(r.code, `${name} gave the wrong code`).toBe('DB_CORRUPT');
    // §17 and the licence rules are separate dimensions. Telling a customer
    // with a damaged disk that their licence expired would be worse than
    // saying nothing.
    expect(String(r.error).toLowerCase(), `${name} blamed the licence`).not.toContain('licence');
  }

  await app.close();
});

// ── Stage 4: the backup is offered, checked, and swapped in ─────────────────
test('recovery verifies the backup beside the live file, swaps it in, and keeps the damaged original', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  const listed = await win.evaluate(() => window.electronAPI.recoveryList());
  expect(listed.ok).toBe(true);
  const usable = listed.snapshots.filter(s => s.restorable);
  expect(usable.length, 'no restorable backup was offered').toBeGreaterThan(0);

  const res = await win.evaluate(p => window.electronAPI.recoveryRestore(p), usable[0].path);
  expect(res.ok, 'recovery failed: ' + (res.error || '')).toBe(true);
  expect(res.damagedFileKept, 'the damaged file was not kept').toBeTruthy();

  await app.close();

  // The swap actually happened on disk, and the original was preserved.
  const dir = profileDir();
  const kept = fs.readdirSync(dir).filter(f => f.includes('.corrupt-') && f.endsWith('.bak'));
  expect(kept.length, 'the damaged database was deleted rather than kept').toBeGreaterThan(0);
  expect(fs.existsSync(path.join(dir, 'hostix.db.recovery-tmp')),
    'the temporary restore file was left behind').toBe(false);
});

// ── Stage 5: and the app comes back ─────────────────────────────────────────
test('the app boots healthy after recovery, with the recovered records present', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  const title = await win.title();
  expect(title, 'still in recovery after a successful restore').not.toContain('Recovery');

  await login(win);
  await win.waitForTimeout(500);

  const out = await win.evaluate(async () => {
    const health = await window.electronAPI.dbHealth();
    const back = await window.electronAPI.dbExportFull();
    return { health, names: (back.data.students || []).map(s => s.name) };
  });

  expect(out.health.state, 'the recovered database is not healthy').toBe('HEALTHY');
  expect(out.names, 'the recovered records are missing').toContain('Recovery Student');

  await app.close();
});

// ── And the case that must not be allowed to work ───────────────────────────
test('a damaged backup is refused, and the live database is left alone', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  // Make a snapshot, then ruin it. Recovery must notice before it swaps.
  const madePath = await win.evaluate(async () => {
    const r = await window.electronAPI.dbImportFull({
      students: [{ id: 'bad_s1', name: 'Before The Bad Backup', status: 'Active' }],
      rooms:    [{ id: 'bad_r1', number: '9', typeId: '2s' }],
    });
    return r.preRestoreBackup;
  });
  expect(madePath).toBeTruthy();

  const fd = fs.openSync(madePath, 'r+');
  fs.writeSync(fd, Buffer.from('RUINED-BACKUP-FILE-'.repeat(6)), 0, 100, 0);
  fs.closeSync(fd);

  const res = await win.evaluate(p => window.electronAPI.recoveryRestore(p), madePath);
  expect(res.ok, 'a damaged backup was accepted').toBe(false);
  expect(res.error, 'no reason was given for refusing it').toBeTruthy();

  // The live database is untouched and still usable.
  const after = await win.evaluate(async () => {
    const health = await window.electronAPI.dbHealth();
    const back = await window.electronAPI.dbExportFull();
    return { health, names: (back.data.students || []).map(s => s.name) };
  });
  expect(after.health.state, 'a refused recovery damaged the live database').toBe('HEALTHY');
  expect(after.names).toContain('Before The Bad Backup');

  expect(fs.existsSync(path.join(profileDir(), 'hostix.db.recovery-tmp')),
    'the temporary file was left behind after a refusal').toBe(false);

  await app.close();
});
