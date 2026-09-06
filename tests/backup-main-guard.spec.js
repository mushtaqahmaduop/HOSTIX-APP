// ════════════════════════════════════════════════════════════════════════════
// The backup guard on the MAIN-PROCESS side of the bridge.
//
// backup-hostile-input.spec.js already proves validateBackup() refuses every
// bad shape. It proves it by calling validateBackup() — which is what
// restoreBackup() chooses to do before asking for the import, not something
// the import requires. So the whole tested safety net sat on the untrusted
// side of the boundary, and db:importFull, which DELETEs fifteen tables, took
// its payload on trust past `Array.isArray`.
//
// These tests skip the renderer's check entirely and call the bridge the way a
// bug in another module would: electronAPI.dbImportFull(hostileDocument). The
// handler has to refuse on its own.
//
// They also pin the pre-restore snapshot, because a restore that succeeds is
// the case with no undo — the transaction only covers a crash.
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

// ONE app for the whole file, and the tests run in order.
//
// Four launches in four tests is what this started as, and two of them failed
// on waitForLoadState while passing alone — the same flakiness that cost
// titlebar-keyboard a red in a pre-demo run. Nothing here needs a cold boot
// between tests; they need each other's order, which serial mode gives them.
test.describe.configure({ mode: 'serial' });

let app, win;

test.beforeAll(async () => {
  resetProfile();
  app = await electron.launch(launchOpts());
  win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);
});

test.afterAll(async () => { if (app) await app.close(); });

test('the import handler refuses a bad document on its own, without the renderer check', async () => {
  const results = await win.evaluate(async () => {
    const cases = {
      // Not our document at all.
      'not an object':          [1, 2, 3],
      'a bare string':          'hello',
      'null':                   null,
      // Valid JSON, none of our tables. Without the "contains no Hostyllo data"
      // check this would validate and then empty every table it did not mention.
      'unrelated json':         { some: 'other', app: true },

      // Truthy non-arrays. The old handler's `Array.isArray(data[t])` skipped
      // the insert but the DELETE above it had already run.
      'students is a string':   { students: 'abc', rooms: [] },
      'rooms is a number':      { students: [], rooms: 7 },
      'payments is an object':  { students: [], rooms: [], payments: { a: 1 } },

      // Records that cannot be written. id binds straight into the INSERT, so
      // undefined, null and '' all become NULL and collide on the primary key.
      'record is not object':   { students: ['just a string'], rooms: [] },
      'record has no id':       { students: [{ name: 'No Id' }], rooms: [] },
      'record id is empty':     { students: [{ id: '', name: 'Blank' }], rooms: [] },
      'record id is whitespace':{ students: [{ id: '   ', name: 'Blank' }], rooms: [] },

      // Damaged settings.
      'settings is an array':   { students: [], rooms: [], settings: [1, 2] },
    };
    const out = {};
    for (const [name, doc] of Object.entries(cases)) {
      try { out[name] = await window.electronAPI.dbImportFull(doc); }
      catch (e) { out[name] = { ok: null, error: 'THREW: ' + e.message }; }
    }
    return out;
  });

  for (const [name, r] of Object.entries(results)) {
    expect(r.ok, `"${name}" was ACCEPTED by the handler and should not have been`).toBe(false);
    expect(r.error, `"${name}" gave no reason`).toBeTruthy();
    expect(String(r.error), `"${name}" threw instead of returning a reason`).not.toContain('THREW');
    expect(r.code, `"${name}" was refused for the wrong reason`).toBe('INVALID_BACKUP');
  }

});

test('a document the handler refuses leaves every table exactly as it was', async () => {
  const { before, after, refused } = await win.evaluate(async () => {
    const snapshot = async () => {
      const r = await window.electronAPI.dbExportFull();
      return JSON.stringify(r.data);
    };
    const before = await snapshot();
    // Names a real table, so the DELETE would run — then fails on the record.
    const r = await window.electronAPI.dbImportFull({ students: [{ name: 'no id' }], rooms: [] });
    const after = await snapshot();
    return { before, after, refused: r };
  });

  expect(refused.ok, 'the handler accepted a record with no id').toBe(false);
  expect(after, 'a refused import must not touch the live data').toBe(before);

});

test('a genuine restore is accepted, and snapshots the database before it commits', async () => {
  const result = await win.evaluate(async () => {
    const good = {
      students: [{ id: 'guard_s1', name: 'Guard Student', status: 'Active' }],
      rooms:    [{ id: 'guard_r1', number: '1', typeId: '2s' }],
      settings: { hostelName: 'Guard Test' },
    };
    const r = await window.electronAPI.dbImportFull(good);
    const back = await window.electronAPI.dbExportFull();
    return { r, names: (back.data.students || []).map(s => s.name) };
  });

  expect(result.r.ok, 'a genuine backup must still be accepted').toBe(true);
  expect(result.names, 'the restored record is not there').toContain('Guard Student');

  // The snapshot is the point: a successful restore over the wrong file has no
  // undo, and the transaction does not help because it committed.
  expect(result.r.preRestoreBackupError, 'the pre-restore snapshot failed').toBeNull();
  expect(result.r.preRestoreBackup, 'no pre-restore snapshot path was reported').toBeTruthy();
  expect(fs.existsSync(result.r.preRestoreBackup),
    'the reported pre-restore snapshot does not exist on disk').toBe(true);

});

test('pre-restore snapshots accumulate rather than overwriting the last good one', async () => {
  // Restore twice. A single fixed filename would mean the second snapshot
  // captured the first restore's state on top of the original — so noticing a
  // bad restore one step too late would leave nothing to go back to.
  const paths = await win.evaluate(async () => {
    const doc = n => ({
      students: [{ id: 'acc_s' + n, name: 'Accumulate ' + n, status: 'Active' }],
      rooms:    [{ id: 'acc_r' + n, number: String(n), typeId: '2s' }],
    });
    // Deliberately back to back. This used to need a 1.1s wait because the
    // snapshot name was only accurate to the second and VACUUM INTO will not
    // overwrite — so the second snapshot was quietly lost. The name carries
    // milliseconds now, and racing it is the point of the test.
    const a = await window.electronAPI.dbImportFull(doc(1));
    const b = await window.electronAPI.dbImportFull(doc(2));
    return [a.preRestoreBackup, b.preRestoreBackup];
  });

  expect(paths[0], 'first restore took no snapshot').toBeTruthy();
  expect(paths[1], 'second restore took no snapshot').toBeTruthy();
  expect(paths[1], 'the second snapshot overwrote the first').not.toBe(paths[0]);
  expect(fs.existsSync(paths[0]), 'the first snapshot was destroyed by the second').toBe(true);
  expect(fs.existsSync(paths[1]), 'the second snapshot is missing').toBe(true);

  // And they are pruned, not left to fill the disk.
  const dir = profileDir();
  const kept = fs.readdirSync(dir).filter(f => f.includes('.pre-restore-') && f.endsWith('.bak'));
  expect(kept.length, 'pre-restore snapshots are not being pruned').toBeLessThanOrEqual(3);

});
