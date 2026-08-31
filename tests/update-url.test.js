/* ─── HOSTYLLO — the update link points at a file, not at GitHub ─────────────

   "Get Update" used to open the releases PAGE. That page is built for
   programmers, and it asks a hostel warden to choose between three .exe files
   on the strength of "x64" and "ia32" — with GitHub's sign-up popup over the
   top of it for anyone not logged in. Nothing there blocks them (the repo is
   public and the installers download anonymously), but it reads like it does.
   The v5.0.0 installers sat at zero downloads.

   `updateDownloadUrl()` now builds a link to the installer itself, read out of
   the update feed. The failure mode it must never have is a 404: that only
   shows up on a client's machine, after a release, with nobody able to see why.
   So every unknown falls back to the releases page — worse, never broken.

   main.js requires Electron, so the function is sliced out of the source and
   evaluated rather than imported. The slice is anchored on the function's own
   name, so deleting or renaming it fails this file loudly instead of silently
   testing nothing.

   Run:  node tests/update-url.test.js
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}

// ── Lift the function out of main.js ────────────────────────────────────────
const SRC   = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const start = SRC.indexOf("const RELEASES_URL");
const end   = SRC.indexOf('function setupAutoUpdater');
assert.ok(start > 0 && end > start,
  'updateDownloadUrl() is no longer where this test slices it out of main.js');

// `arch` is a parameter of the slice rather than a global, so both branches can
// be driven without pretending to be a 32-bit process.
function load(arch) {
  const shim = { arch };
  const fn = new Function('process', 'console',
    SRC.slice(start, end) + '\nreturn updateDownloadUrl;');
  return fn(shim, console);
}

const BASE = 'https://github.com/mushtaqahmaduop/HOSTIX-APP/releases';

// The real v5.0.0 feed, as electron-updater parses latest.yml.
const FEED = {
  version: '5.0.0',
  path: 'Hostyllo-Offline-Setup-5.0.0-x64.exe',
  files: [
    { url: 'Hostyllo-Offline-Setup-5.0.0-ia32.exe', sha512: 'x' },
    { url: 'Hostyllo-Offline-Setup-5.0.0-x64.exe',  sha512: 'y' },
    { url: 'Hostyllo-Offline-Setup-5.0.0.exe',      sha512: 'z' },
  ],
};

console.log('\nupdate download URL\n');

ok('a 64-bit copy is handed the 64-bit installer', () => {
  assert.strictEqual(load('x64')(FEED),
    BASE + '/download/v5.0.0/Hostyllo-Offline-Setup-5.0.0-x64.exe');
});

ok('a 32-bit copy is handed the 32-bit installer, not the best one available', () => {
  // Deliberate: an in-place upgrade keeps the architecture it is replacing.
  // Moving a hostel from 32- to 64-bit is a migration, not a dialog default.
  assert.strictEqual(load('ia32')(FEED),
    BASE + '/download/v5.0.0/Hostyllo-Offline-Setup-5.0.0-ia32.exe');
});

ok('arm64 and anything else are treated as 64-bit', () => {
  assert.ok(load('arm64')(FEED).endsWith('-x64.exe'));
});

ok('a feed with only the combined installer still resolves', () => {
  const combined = { version: '5.1.0', path: 'Hostyllo-Offline-Setup-5.1.0.exe',
                     files: [{ url: 'Hostyllo-Offline-Setup-5.1.0.exe' }] };
  assert.strictEqual(load('x64')(combined),
    BASE + '/download/v5.1.0/Hostyllo-Offline-Setup-5.1.0.exe');
});

ok('a renamed artifact is followed, not guessed at', () => {
  // The filename comes from the feed. If nsis.artifactName changes in
  // package.json, the link changes with it — it is not a template built here
  // that would quietly 404 on a client machine.
  const renamed = { version: '6.0.0', path: 'Hostyllo-6.0.0-win-x64.exe',
                    files: [{ url: 'Hostyllo-6.0.0-win-x64.exe' }] };
  assert.strictEqual(load('x64')(renamed),
    BASE + '/download/v6.0.0/Hostyllo-6.0.0-win-x64.exe');
});

// ── Every unknown lands on the page, never on a 404 ─────────────────────────
ok('no info, no version, no files, no exe → the releases page', () => {
  const page = BASE + '/latest';
  assert.strictEqual(load('x64')(null),                                    page);
  assert.strictEqual(load('x64')({}),                                      page);
  assert.strictEqual(load('x64')({ version: '5.0.0' }),                    page);
  assert.strictEqual(load('x64')({ version: '5.0.0', files: [] }),         page);
  // A feed listing something that is not an installer must not be linked as one.
  assert.strictEqual(load('x64')({ version: '5.0.0', files: [{ url: 'latest.yml' }] }), page);
});

ok('a malformed feed does not throw out of the click handler', () => {
  const page = BASE + '/latest';
  assert.strictEqual(load('x64')({ version: '5.0.0', files: 'not-an-array' }), page);
  assert.strictEqual(load('x64')({ version: '5.0.0', files: [null, {}, { url: 5 }] }), page);
});

ok('a version or filename with URL-hostile characters is encoded', () => {
  const odd = { version: '5.0.0 beta', files: [{ url: 'Hostyllo Setup #1.exe' }] };
  const url = load('x64')(odd);
  assert.ok(!/ /.test(url), 'a space reached the URL: ' + url);
  assert.ok(url.includes('%20'), url);
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
