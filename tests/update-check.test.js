/* ─── HOSTYLLO — "Check for Updates" has to actually say something ───────────

   Help → Check for Updates was silent on an up-to-date machine, which is every
   machine in the field right now: the app is 5.0.0 and 5.0.0 is the newest
   release. A warden clicked the menu item and nothing happened at all.

   The cause is a contract that reads the opposite way round to how it looks.
   `autoUpdater.checkForUpdates()` resolves with the PARSED FEED whether or not
   there is anything newer in it — electron-updater's AppUpdater returns
   `{ isUpdateAvailable: false, updateInfo }` on the up-to-date path. So

       if (!result || !result.updateInfo) { …show "Up to Date"… }

   is false in both cases, and that dialog could never open. Meanwhile
   `update-not-available` only writes to the console. Nothing reached the user.

   The distinction the fix rests on, and what each branch owes the user:

     result === null            the updater refused to run — say we could not
                                check. NOT the same as "you are up to date".
     result.isUpdateAvailable   the `update-available` handler has already put
                                its own dialog up from inside the call; a
                                second one here would be the same news twice.
     otherwise                  up to date, and say which version that is.

   main.js requires Electron, so the function is sliced out of the source and
   evaluated rather than imported — the same technique as update-url.test.js,
   anchored on the function's own name so a rename fails loudly.

   Every case here is async, and the runner AWAITS each one. An earlier draft
   counted a pass the moment the call returned, which made a rejected assertion
   an unhandled warning on a green run — a test file that asserts nothing is
   worse than no test file, because it is believed.

   Run:  node tests/update-check.test.js
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

let pass = 0, fail = 0;
const queue = [];
function ok(name, fn) { queue.push([name, fn]); }

const SRC   = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const start = SRC.indexOf('async function doCheckUpdates');
const end   = SRC.indexOf('function doLicenseInfo');
assert.ok(start > 0 && end > start,
  'doCheckUpdates() is no longer where this test slices it out of main.js');

/**
 * Build a runnable doCheckUpdates over fake collaborators.
 * Returns the function plus the list of dialogs it opened.
 */
function load(opts) {
  const o = opts || {};
  const shown = [];
  const dialog = { showMessageBox: (_win, spec) => { shown.push(spec); return Promise.resolve({ response: 0 }); } };
  const autoUpdater = o.autoUpdater === undefined
    ? { checkForUpdates: async () => o.result }
    : o.autoUpdater;
  const fn = new Function('mainWindow', 'autoUpdater', 'IS_PROD', 'dialog', 'console',
    SRC.slice(start, end) + '\nreturn doCheckUpdates;')(
    o.mainWindow === undefined ? {} : o.mainWindow,
    autoUpdater,
    o.IS_PROD === undefined ? true : o.IS_PROD,
    dialog, console);
  return { fn, shown };
}

// The shape electron-updater actually hands back. `updateInfo` is present in
// BOTH — that is the whole bug.
const UP_TO_DATE = { isUpdateAvailable: false, updateInfo: { version: '5.0.0' } };
const HAS_UPDATE = { isUpdateAvailable: true,  updateInfo: { version: '5.1.0' } };

ok('an up-to-date app SAYS it is up to date', async () => {
  const { fn, shown } = load({ result: UP_TO_DATE });
  await fn();
  assert.strictEqual(shown.length, 1, 'expected exactly one dialog, got ' + shown.length);
  assert.strictEqual(shown[0].title, 'Up to Date');
});

ok('and names the version, so the answer is checkable', async () => {
  const { fn, shown } = load({ result: UP_TO_DATE });
  await fn();
  assert.ok(/5\.0\.0/.test(shown[0].detail || ''), 'detail did not name the version: ' + shown[0].detail);
});

ok('an available update is announced once, not twice', async () => {
  // `update-available` fires from inside checkForUpdates() and shows its own
  // dialog. doCheckUpdates must add nothing.
  const { fn, shown } = load({ result: HAS_UPDATE });
  await fn();
  assert.strictEqual(shown.length, 0, 'doCheckUpdates opened a second dialog: ' + JSON.stringify(shown));
});

ok('a check that never ran is not reported as up to date', async () => {
  const { fn, shown } = load({ result: null });
  await fn();
  assert.strictEqual(shown.length, 1);
  assert.strictEqual(shown[0].title, 'Update Check Failed');
});

ok('a network failure is reported as a failure', async () => {
  const { fn, shown } = load({ autoUpdater: { checkForUpdates: async () => { throw new Error('ENOTFOUND'); } } });
  await fn();
  assert.strictEqual(shown.length, 1);
  assert.strictEqual(shown[0].title, 'Update Check Failed');
});

ok('a dev run says so rather than pretending to check', async () => {
  const { fn, shown } = load({ result: UP_TO_DATE, IS_PROD: false });
  await fn();
  assert.strictEqual(shown.length, 1);
  assert.strictEqual(shown[0].title, 'Updates');
});

ok('no window, no dialog', async () => {
  const { fn, shown } = load({ result: UP_TO_DATE, mainWindow: null });
  await fn();
  assert.strictEqual(shown.length, 0);
});

// ── The same trap in the IPC surface ────────────────────────────────────────
// `update:check` is not sliceable — it lives inside an ipcMain.handle() call —
// so this is a source assertion rather than a behavioural one. It is worth
// having anyway: the handler returned `available: !!result`, which is true for
// every up-to-date machine on earth, and nothing in the renderer calls it yet,
// so no test anywhere else would notice it coming back.
ok('the update:check IPC reads isUpdateAvailable too', async () => {
  const handler = SRC.slice(SRC.indexOf("ipcMain.handle('update:check'"));
  const body = handler.slice(0, handler.indexOf('});'));
  assert.ok(/isUpdateAvailable/.test(body),
    'update:check no longer reads isUpdateAvailable — it will report every current app as having an update');
  assert.ok(!/available:\s*!!result\s*,/.test(body),
    'update:check is back to `available: !!result`, which is always true');
});

// ── D-2: nothing installs by itself ────────────────────────────────────────
ok('no dialog promises an install the build will not perform', async () => {
  assert.ok(!/install automatically when you next close the app/.test(SRC),
    'a dialog still promises install-on-quit, but autoInstallOnAppQuit is false');
  assert.ok(/autoUpdater\.autoDownload\s*=\s*false/.test(SRC), 'autoDownload is no longer false');
  assert.ok(/autoUpdater\.autoInstallOnAppQuit\s*=\s*false/.test(SRC), 'autoInstallOnAppQuit is no longer false');
});

(async () => {
  console.log('\ncheck for updates\n');
  for (const [name, fn] of queue) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + ((e && e.stack) || e)); }
  }
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
