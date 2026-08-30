// ════════════════════════════════════════════════════════════════════════════
// A backup file is the ONE arbitrary document this app ingests, and what it
// becomes is the whole database. These are the shapes a hostile or simply
// corrupt file can take, each asserted to be REFUSED — and, just as important,
// asserted to leave the existing data untouched when it is.
//
// The last of those is the part that was actually wrong: the old importData()
// set DB to the parsed file and saved afterwards, so a file that failed on the
// way to disk left memory and disk disagreeing.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

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

test.beforeAll(() => { resetProfile(); });

test('every malformed or hostile backup shape is refused, with a reason', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const results = await win.evaluate(() => {
    const good = {
      students: [{ id: 's1', name: 'Real Student', status: 'Active' }],
      rooms:    [{ id: 'r1', number: '1', typeId: '2s' }],
      settings: { hostelName: 'Test' },
    };
    const cases = {
      // Not our document at all.
      'not an object':        JSON.parse('[1,2,3]'),
      'a bare string':        'hello',
      'null':                 null,
      'unrelated json':       { some: 'other', app: true },

      // Prototype pollution, at the root and nested. JSON.parse itself is safe,
      // but this object is merged and spread across the whole app afterwards.
      'root __proto__':       JSON.parse('{"students":[],"rooms":[],"__proto__":{"polluted":true}}'),
      'nested __proto__':     JSON.parse('{"students":[{"id":"s1","__proto__":{"polluted":true}}],"rooms":[]}'),
      'constructor key':      JSON.parse('{"students":[],"rooms":[],"constructor":{"x":1}}'),

      // Truthy non-arrays. _initDBFields' `if (!d.students)` guard lets these
      // through, and then every .filter on DB.students throws.
      'students is a string': { students: 'abc', rooms: [] },
      'rooms is a number':    { students: [], rooms: 7 },
      'payments is an object':{ students: [], rooms: [], payments: { a: 1 } },

      // Records that cannot be written.
      'record is not object': { students: [ 'just a string' ], rooms: [] },
      'record has no id':     { students: [ { name: 'No Id' } ], rooms: [] },
      'record id is empty':   { students: [ { id: '', name: 'Blank' } ], rooms: [] },

      // Damaged settings.
      'settings is an array': { students: [], rooms: [], settings: [1, 2] },
    };
    const out = {};
    for (const [name, doc] of Object.entries(cases)) {
      let r;
      try { r = validateBackup(doc); }
      catch (e) { r = { ok: false, reason: 'THREW: ' + e.message }; }
      out[name] = r;
    }
    out['__good__'] = validateBackup(good);
    return out;
  });

  for (const [name, r] of Object.entries(results)) {
    if (name === '__good__') continue;
    expect(r.ok, `"${name}" was ACCEPTED and should not have been`).toBe(false);
    expect(r.reason, `"${name}" gave no reason`).toBeTruthy();
    expect(r.reason, `"${name}" threw instead of returning a reason`).not.toContain('THREW');
  }
  // …and a real backup still passes, or the validator is just a wall.
  expect(results['__good__'].ok, 'a genuine backup must still be accepted').toBe(true);

  expect(pageErrors, 'no page errors').toEqual([]);
  await app.close();
});

test('a refused import leaves the existing data exactly as it was', async () => {
  resetProfile();
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  await win.evaluate(async () => {
    DB.rooms = [{ id: 'keep-r', number: '9', floor: 'Ground', typeId: '2s',
                  studentIds: [], amenities: [], notes: '', rent: 5000 }];
    DB.students = [{ id: 'keep-s', name: 'Must Survive', roomId: 'keep-r',
                     status: 'Active', joinDate: '2026-01-01', rent: 5000 }];
    await saveDB();
  });

  // Drive the real handler with a hostile file, exactly as the file picker does.
  const before = await win.evaluate(() => JSON.stringify({
    s: DB.students.map(x => x.id), r: DB.rooms.map(x => x.id) }));

  await win.evaluate(async () => {
    const hostile = JSON.stringify({ students: 'abc', rooms: [], __proto__: { bad: 1 } });
    const file = new File([hostile], 'evil-backup.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: dt.files });
    await importData(input);
  });
  await win.waitForTimeout(900);

  const after = await win.evaluate(() => JSON.stringify({
    s: DB.students.map(x => x.id), r: DB.rooms.map(x => x.id) }));
  expect(after, 'a refused import must not touch the live data').toBe(before);

  // And nothing was polluted on the way past.
  const polluted = await win.evaluate(() => ({}).bad !== undefined || ({}).polluted !== undefined);
  expect(polluted, 'Object.prototype was polluted by a backup file').toBe(false);

  // It survives a restart — i.e. the real database on disk was never rewritten.
  await app.close();
  const app2 = await electron.launch(launchOpts());
  const win2 = await app2.firstWindow();
  await win2.waitForLoadState('domcontentloaded');
  await login(win2);
  await win2.waitForTimeout(600);
  const persisted = await win2.evaluate(() =>
    DB.students.map(x => x.name).join(','));
  expect(persisted).toContain('Must Survive');

  expect(pageErrors, 'no page errors').toEqual([]);
  await app2.close();
});
