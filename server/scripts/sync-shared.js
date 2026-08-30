// ════════════════════════════════════════════════════════════════════════════
// Vendor the app's shared module into server/
//
// THE PROBLEM THIS SOLVES
//
// `src/lib/keys.js` needs the licence-key implementation from
// `renderer/src/utils.js` — the same module the app, keygen.js and
// test-license.js use. One implementation is the whole reason the control plane
// lives in this repository.
//
// But a deployment platform builds a service from ONE directory. Railway's root
// directory for this service is `server/`, so `../../renderer/src/utils.js`
// does not exist at build time and the service would crash on its first
// require.
//
// SO: the file is copied here, and the copy is COMMITTED so a deploy from
// `server/` alone works. That is a generated artifact, not a second
// implementation — and `test/run.js` fails if it has drifted from the original,
// so the copy cannot quietly become a fork.
//
//   npm run sync-shared     refresh the copy
//   npm test                fails if it is stale
//
// It also runs before `start` and `test`, so in development it self-heals and
// nobody has to remember. On Railway the source is absent and it skips.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', '..', 'renderer', 'src', 'utils.js');
const DEST_DIR = path.join(__dirname, '..', 'src', 'lib', 'vendor');
const DEST = path.join(DEST_DIR, 'app-utils.js');

const HEADER = [
  '// ══════════════════════════════════════════════════════════════════════════',
  '// GENERATED FILE — DO NOT EDIT',
  '//',
  '// A verbatim copy of renderer/src/utils.js, vendored so that server/ is a',
  '// self-contained deployable unit. The original is the source of truth.',
  '//',
  '// Refresh:  npm run sync-shared',
  '// Drift is a test failure, not a silent fork — see test/run.js.',
  '// ══════════════════════════════════════════════════════════════════════════',
  ''
].join('\n');

/**
 * The copy's payload, with the generated header removed.
 *
 * An exact prefix match rather than searching for the header's closing rule:
 * that rule line is identical to its opening one, so `indexOf` found the first
 * and left the rest of the header in the payload — which made every comparison
 * fail and would have reported a current copy as stale forever.
 *
 * Returning null when the prefix does not match is also right: a hand-edited or
 * differently-generated file is not a copy of anything, and should be rewritten.
 */
function strippedCopy() {
  if (!fs.existsSync(DEST)) return null;
  const raw = fs.readFileSync(DEST, 'utf8');
  return raw.startsWith(HEADER) ? raw.slice(HEADER.length) : null;
}

function sourceExists() {
  return fs.existsSync(SOURCE);
}

/** @returns {'written'|'unchanged'|'skipped'} */
function sync() {
  // Deployed: only server/ was uploaded, so there is nothing to copy from and
  // the committed copy is already correct. Not an error.
  if (!sourceExists()) return 'skipped';

  const source = fs.readFileSync(SOURCE, 'utf8');
  if (strippedCopy() === source) return 'unchanged';

  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.writeFileSync(DEST, HEADER + source);
  return 'written';
}

/** True when the copy matches the original. Vacuously true if there is no original. */
function isCurrent() {
  if (!sourceExists()) return true;
  return strippedCopy() === fs.readFileSync(SOURCE, 'utf8');
}

if (require.main === module) {
  const result = sync();
  const where = path.relative(path.join(__dirname, '..'), DEST);
  if (result === 'skipped') console.log('  sync-shared: source not present (deployed build) — using the committed copy');
  else if (result === 'unchanged') console.log('  sync-shared: ' + where + ' already current');
  else console.log('  sync-shared: refreshed ' + where);
}

module.exports = { sync, isCurrent, sourceExists, SOURCE, DEST };
