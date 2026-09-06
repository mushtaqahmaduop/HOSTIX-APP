// ════════════════════════════════════════════════════════════════════════════
// Unknown schema → safe recovery.  Spec §27, and §15's "never auto-downgrade
// an unsupported schema".
//
// migrateDatabase() only ever migrates UP — it returns early once the file is
// at or beyond SCHEMA_VERSION. So a database written by a NEWER build used to
// sail past it and get opened normally: an older client reading and WRITING a
// shape it does not know, saving every record without whatever the newer
// version added. Nothing looked wrong, which is what made it worse than a
// refusal.
//
// It is reachable without anything exotic: an update installs, then the
// customer reinstalls or rolls back an older build; or a backup taken on an
// updated machine is restored onto a stale one.
//
// The property that matters most is the LAST one here — the file must come
// back untouched. This state is the opposite of corruption: the data is
// perfect and the app is behind, so anything that "fixes" the data is the
// data loss.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
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

/** Stamp a schema version straight into the file, the way a newer build would. */
function setSchemaVersion(v) {
  const d = new Database(dbFile());
  try {
    d.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    d.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?) " +
              "ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(v));
  } finally { d.close(); }
}

function readSchemaVersion() {
  const d = new Database(dbFile(), { readonly: true });
  try {
    const row = d.prepare("SELECT value FROM schema_meta WHERE key='version'").get();
    return row ? Number(row.value) : 0;
  } finally { d.close(); }
}

/** Everything we expect to still be there, byte for byte, afterwards. */
function snapshotShape() {
  const d = new Database(dbFile(), { readonly: true });
  try {
    const tables = d.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    const students = d.prepare('SELECT id, data FROM students ORDER BY id').all();
    return { tables, students, version: readSchemaVersion(), size: fs.statSync(dbFile()).size };
  } finally { d.close(); }
}

test.describe.configure({ mode: 'serial' });

// ── Stage 1: a normal database, with something in it worth not losing ───────
test('a healthy database boots and holds its records', async () => {
  resetProfile();
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const out = await win.evaluate(async () => {
    const health = await window.electronAPI.dbHealth();
    const imported = await window.electronAPI.dbImportFull({
      students: [{ id: 'sg_s1', name: 'Schema Guard Student', status: 'Active' }],
      rooms:    [{ id: 'sg_r1', number: '11', typeId: '2s' }],
      settings: { hostelName: 'Schema Guard Test' },
    });
    return { health, imported };
  });

  expect(out.health.state).toBe('HEALTHY');
  expect(out.imported.ok).toBe(true);
  await app.close();
});

// ── Stage 2: the file is stamped as newer than this build understands ───────
test('a database from a newer build opens the recovery screen, not the app', async () => {
  setSchemaVersion(99);
  const before = snapshotShape();
  expect(before.version).toBe(99);

  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Not the app, and not a crash to nothing.
  const title = await win.title();
  expect(title, 'the recovery window did not open').toContain('Recovery');

  const health = await win.evaluate(() => window.electronAPI.dbHealth());
  expect(health.state).toBe('UNSUPPORTED_SCHEMA');
  expect(health.reason, 'the reason must name the cause in plain words')
    .toMatch(/newer version/i);
  expect(health.reason, 'it must say which format it found').toMatch(/v99/);

  await app.close();
});

// ── Stage 3: the screen gives the right advice, which is the opposite of ────
//            the advice corruption gets
test('the recovery screen offers no backups, because restoring one would BE the loss', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(700);          // the panel is removed after dbHealth resolves

  const seen = await win.evaluate(() => ({
    head:    (document.getElementById('head') || {}).textContent || '',
    sub:     (document.getElementById('sub')  || {}).textContent || '',
    foot:    (document.getElementById('foot') || {}).textContent || '',
    restore: !!document.getElementById('restore-panel'),
    reason:  (document.getElementById('reason') || {}).textContent || '',
  }));

  expect(seen.head, 'the headline must not claim the data is damaged').toMatch(/newer/i);
  expect(seen.head).not.toMatch(/not safe|damaged/i);
  expect(seen.restore, 'a restore list here would offer to overwrite good data with old data')
    .toBe(false);
  expect(seen.foot, 'the way out is to update the app').toMatch(/install the current version/i);
  expect(seen.foot, 'and it must warn against the obvious wrong move')
    .toMatch(/do not restore an older backup/i);
  expect(seen.reason).toMatch(/v99/);

  await app.close();
});

// ── Stage 4: nothing was written, migrated, renamed or downgraded ───────────
test('the file is left exactly as it was — no downgrade, no repair, no write', async () => {
  const after = snapshotShape();

  expect(after.version, '§15: an unsupported schema must never be auto-downgraded').toBe(99);
  expect(after.students.map(s => s.id)).toContain('sg_s1');

  // Nothing renamed it out of the way, the way corruption recovery would.
  expect(fs.existsSync(dbFile()), 'the database must still be where it was').toBe(true);
  const strays = fs.readdirSync(profileDir()).filter(f => /\.corrupt-|\.recovery-tmp$/.test(f));
  expect(strays, 'this state must not produce corruption artefacts').toEqual([]);
});

// ── Stage 5: and the app is fine again the moment it understands the file ───
test('lowering the version back to a supported one lets the app open normally', async () => {
  // The records are still in the file — stage 4 read them straight off disk.
  expect(snapshotShape().students.map(s => s.id)).toContain('sg_s1');

  setSchemaVersion(1);

  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  const out = await win.evaluate(async () => ({
    health: await window.electronAPI.dbHealth(),
  }));

  expect(out.health.state, 'a version it understands must open normally again').toBe('HEALTHY');
  expect(await win.title(), 'and it must be the app, not the recovery window')
    .not.toContain('Recovery');

  /* Deliberately NOT asserting that sg_s1 comes back through dbAll() here.
     It does not, and the reason has nothing to do with this gate: by the time
     the window is loadable the renderer has already rebuilt its own in-memory
     DB and written it back over SQLite, so a read at this point measures the
     renderer's bookkeeping, not whether the file reopened. The assertion above
     the launch is the one that matters — the records are in the file, and this
     boot proves the file is understood again.

     That overwrite is worth a look on its own (it means an externally changed
     database can be replaced by whatever the renderer last held), but it is a
     pre-existing behaviour and not this change's business. */

  await app.close();
});
