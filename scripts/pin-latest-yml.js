#!/usr/bin/env node
/* ─── PIN latest.yml's FALLBACK TO THE 64-BIT INSTALLER ──────────────────────

   electron-builder writes dist/latest.yml — the feed electron-updater reads to
   decide whether a hostel is out of date and what to download. It lists every
   installer under `files:`, and then repeats ONE of them at the top level:

       path:   Hostyllo-Offline-Setup-5.0.0-ia32.exe
       sha512: 4uS6ZXrHHM…

   Which one it picks falls out of the build order, and a `--win --x64 --ia32`
   build leaves it pointing at the 32-BIT installer.

   Modern electron-updater matches on architecture from the `files:` list, so a
   64-bit machine gets the 64-bit build and this hardly matters. It matters for
   a client old enough to read the legacy top-level `path` instead: that hostel
   would be handed the 32-bit build on 64-bit hardware. It runs, but it is not
   what we meant to ship, and "why is my new install 32-bit" is a support call
   nobody can answer from the outside.

   So the fallback is pinned to x64 after every build that produces both. This
   is a script rather than a note in a release checklist because a note gets
   skipped on the release where it matters.

   Run:  node scripts/pin-latest-yml.js [path-to-latest.yml]
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const YML = process.argv[2] || path.join(__dirname, '..', 'dist', 'latest.yml');

function fail(msg) {
  console.error('[pin-latest-yml] ' + msg);
  process.exit(1);
}

if (!fs.existsSync(YML)) {
  // A build that produced no update feed (portable-only, say) is not an error.
  console.log('[pin-latest-yml] no ' + YML + ' — nothing to pin');
  process.exit(0);
}

const original = fs.readFileSync(YML, 'utf8');

// The x64 entry, as electron-builder wrote it.
const entry = original.match(/- url: (\S*?-x64\.exe)\s*\r?\n\s+sha512: (\S+)(?:\s*\r?\n\s+size: (\d+))?/);
if (!entry) {
  // An x64-only or ia32-only build has nothing to disambiguate.
  if (!/-ia32\.exe/.test(original)) {
    console.log('[pin-latest-yml] single-architecture feed — nothing to pin');
    process.exit(0);
  }
  fail('no x64 installer listed in ' + YML + ', but ia32 is — refusing to guess');
}

const [, url, sha512] = entry;

// Trust the file on disk over the yml: if they disagree, the feed is wrong and
// every download would fail its integrity check.
const onDisk = path.join(path.dirname(YML), url);
if (fs.existsSync(onDisk)) {
  const actual = crypto.createHash('sha512').update(fs.readFileSync(onDisk)).digest('base64');
  if (actual !== sha512) fail('sha512 in ' + YML + ' does not match ' + url + ' on disk');
}

let out = original;
out = out.replace(/^path: .*$/m, 'path: ' + url);
out = out.replace(/^sha512: .*$/m, 'sha512: ' + sha512);

if (!/^path: /m.test(out) || !/^sha512: /m.test(out)) fail('could not rewrite path/sha512');

if (out === original) {
  console.log('[pin-latest-yml] already pinned to ' + url);
} else {
  fs.writeFileSync(YML, out, 'utf8');
  console.log('[pin-latest-yml] fallback pinned to ' + url);
}
