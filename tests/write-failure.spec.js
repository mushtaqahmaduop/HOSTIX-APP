// ════════════════════════════════════════════════════════════════════════════
// A write that cannot happen must FAIL LOUDLY.  Spec §17, §27.
//
// The rule §17 actually cares about is "no false success": a save that did not
// reach the disk must never look like one that did. The classifier in main.js
// maps ENOSPC / EACCES / SQLITE_READONLY / SQLITE_CORRUPT / SQLITE_IOERR to
// four actionable messages, but until now that mapping was proven by reading
// it, so §27's "permission denied" and "disk full" rows sat at PARTIAL.
//
// This closes the permission row against a real, denied write — the file is
// made read-only before the app launches, so nothing is simulated and no error
// is injected. The database is genuinely unwritable and the app genuinely
// cannot save.
//
// DISK FULL IS STILL NOT COVERED HERE. Filling a real volume needs an elevated
// VHD (diskpart / New-VHD), which this suite cannot do unattended, and faking
// ENOSPC would only test the `if` I already read. That row stays PARTIAL and
// says so rather than being quietly marked green.
//
// Worth knowing, because it is why this test can exist at all: on an existing
// database every CREATE TABLE IF NOT EXISTS in initDatabase() is a no-op, and
// SQLite does not need write access for one. So a read-only file still BOOTS —
// it opens, passes integrity_check, and only refuses at the first real write.
// A customer with a locked-down data folder therefore gets their app and a
// sentence about permissions, not a "your database is damaged" screen that
// would send them to restore a backup over healthy data.
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

const dbFile = () => path.join(profileDir(), 'hostix.db');

function setReadOnly(yes) {
  for (const f of [dbFile(), dbFile() + '-wal', dbFile() + '-shm']) {
    if (fs.existsSync(f)) { try { fs.chmodSync(f, yes ? 0o444 : 0o666); } catch (_) {} }
  }
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => { setReadOnly(false); });

test('a healthy database accepts a write, so the refusal below means something', async () => {
  resetProfile();
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  const ok = await win.evaluate(() =>
    window.electronAPI.dbUpsert('students', 'wf_ok', { id: 'wf_ok', name: 'Writable', status: 'Active' }));
  expect(ok.ok, 'the control case must pass or the rest proves nothing').toBe(true);

  await app.close();
});

test('a write to a read-only database is refused, with a reason about permissions', async () => {
  setReadOnly(true);

  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // It still boots, and it does NOT claim the data is damaged.
  const health = await win.evaluate(() => window.electronAPI.dbHealth());
  expect(health.state, 'a permissions problem is not corruption and must not be reported as it')
    .not.toBe('CORRUPT');
  expect(await win.title()).not.toContain('Recovery');

  const res = await win.evaluate(() =>
    window.electronAPI.dbUpsert('students', 'wf_denied', { id: 'wf_denied', name: 'Denied', status: 'Active' }));

  // ── The whole point: no false success ────────────────────────────────────
  expect(res.ok, 'an impossible write reported success').toBe(false);
  expect(res.code, 'a denied write must classify as PERMISSION_DENIED').toBe('PERMISSION_DENIED');

  // ── And the message has to be usable by the person reading it ────────────
  expect(res.error, 'the message must say it was not saved').toMatch(/not saved/i);
  expect(res.error, 'and name permissions as the cause').toMatch(/permission|write to its data folder/i);
  expect(res.error, 'a raw SQLite string is not an actionable message')
    .not.toMatch(/SQLITE_|readonly database/i);

  await app.close();
});

test('the refused record really did not land', async () => {
  setReadOnly(false);

  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  const rows = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(rows.some((s) => s && s.id === 'wf_denied'),
    'a write that reported failure must not have partially landed').toBe(false);

  await app.close();
});
