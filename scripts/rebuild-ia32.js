#!/usr/bin/env node
/* ─── 32-BIT NATIVE REBUILD ─────────────────────────────────────────────────
   Produces a 32-bit better_sqlite3.node for the ia32 installer.

   WHY THIS EXISTS
   better-sqlite3 12+ ships prebuilt binaries for x64/arm64 only — there is no
   32-bit prebuild. Worse, its binding.gyp asks `lib/binding.js` whether a
   prebuild exists, and that check reads the *host* process's arch. On an x64
   build machine it always answers "yes", so the ia32 compile is skipped:

       npx electron-rebuild -f -w better-sqlite3 --arch ia32
       → "✔ Rebuild Complete"   ← lies; emits nothing

   A packaged ia32 build would therefore ship an app that cannot open its
   database, with completely clean build logs. This script hides prebuilds/ so
   the detection answers "no", forces a real source compile against the current
   Electron's headers, and always puts prebuilds/ back.

   Requires: Visual Studio Build Tools with the C++ x86 toolchain.

   Usage:  npm run rebuild:ia32
   Output: node_modules/better-sqlite3/build/Release/better_sqlite3.node (i386)

   NOTE: the x64 runtime loads from prebuilds/ and ignores build/Release, so an
   ia32 binary sitting there is harmless for local x64 dev. Run `npm run rebuild`
   to get back to a pristine state if you want to be sure.
   ────────────────────────────────────────────────────────────────────────── */
'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const BSQ       = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const PREBUILDS = path.join(BSQ, 'prebuilds');
const HIDDEN    = path.join(BSQ, 'prebuilds.hidden');
const OUTPUT    = path.join(BSQ, 'build', 'Release', 'better_sqlite3.node');

function electronVersion() {
  const p = path.join(__dirname, '..', 'node_modules', 'electron', 'package.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).version;
}

/* Read the PE header so we assert on what was actually produced rather than
   trusting node-gyp's exit code — which is exactly what misled us before. */
function peMachine(file) {
  const fd  = fs.openSync(file, 'r');
  const b4  = Buffer.alloc(4);
  const b2  = Buffer.alloc(2);
  fs.readSync(fd, b4, 0, 4, 0x3c);
  fs.readSync(fd, b2, 0, 2, b4.readInt32LE(0) + 4);
  fs.closeSync(fd);
  const m = b2.readUInt16LE(0);
  return m === 0x14c ? 'i386' : m === 0x8664 ? 'x64' : m === 0xaa64 ? 'arm64' : `0x${m.toString(16)}`;
}

if (!fs.existsSync(BSQ)) {
  console.error('[ia32] better-sqlite3 is not installed. Run npm install first.');
  process.exit(1);
}

const target = electronVersion();
console.log(`[ia32] building better-sqlite3 for Electron ${target}, arch ia32`);

let hid = false;
try {
  if (fs.existsSync(PREBUILDS)) {
    fs.renameSync(PREBUILDS, HIDDEN);
    hid = true;
    console.log('[ia32] prebuilds/ hidden so the source build is not skipped');
  }

  try { fs.rmSync(OUTPUT, { force: true }); } catch (_) {}

  // Run node-gyp's entry script with this Node directly. Going through `npx`
  // needs a shell on Windows and spawns with status null when it is not found,
  // which reads like a build failure rather than a missing launcher.
  const gyp = path.join(__dirname, '..', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
  if (!fs.existsSync(gyp)) {
    throw new Error(`node-gyp not found at ${gyp} — run npm install`);
  }

  const r = spawnSync(
    process.execPath,
    [gyp, 'rebuild',
     '--arch=ia32', '--runtime=electron',
     `--target=${target}`, '--dist-url=https://electronjs.org/headers'],
    { cwd: BSQ, stdio: 'inherit' }
  );
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`node-gyp exited ${r.status}`);
} finally {
  if (hid) {
    try { fs.rmSync(PREBUILDS, { recursive: true, force: true }); } catch (_) {}
    fs.renameSync(HIDDEN, PREBUILDS);
    console.log('[ia32] prebuilds/ restored');
  }
}

if (!fs.existsSync(OUTPUT)) {
  console.error('[ia32] FAILED: node-gyp reported success but produced no binary.');
  process.exit(1);
}

const arch = peMachine(OUTPUT);
if (arch !== 'i386') {
  console.error(`[ia32] FAILED: produced a ${arch} binary, expected i386.`);
  process.exit(1);
}

console.log(`[ia32] OK — ${OUTPUT} (${arch}, ${fs.statSync(OUTPUT).size} bytes)`);
