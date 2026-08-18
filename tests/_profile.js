// ════════════════════════════════════════════════════════════════════════════
// Shared test-profile reset.
//
// Every spec launches Electron against the SAME isolated profile
// (HOSTIX_TEST_PROFILE), and roughly half of them used to leave whatever they
// had seeded behind. Playwright runs this suite single-worker and in file
// order, so a spec that did not reset inherited the previous file's fixtures
// and quietly measured the wrong hostel: month-name-mess.spec.js asserted
// August revenue was 0 and got 17,000 — a student admitted by
// admit-to-payment.spec.js three files earlier. It passed alone and failed in
// the suite, which is the worst way for a test to be wrong, because the failure
// looks like a regression in the code under test.
//
// Wiping is safe for every spec: the app seeds its demo rooms on first boot, so
// specs that reach for DB.rooms[0] still find one.
//
// Not named *.spec.js on purpose — Playwright's testMatch would try to run it.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

/** The isolated profile, verified to be one we are allowed to destroy. */
function profileDir() {
  const p = process.env.HOSTIX_TEST_PROFILE;
  if (!p) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  // A profile with no licence boots to the activation screen instead of login,
  // and every spec then dies 30s later on #login-input looking like a boot
  // regression. Fail here instead, where the message says what is wrong.
  if (!fs.existsSync(path.join(p, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + p);
  return p;
}

/** Drop the database and any renderer state, so the next launch is a cold one. */
function resetProfile() {
  const p = profileDir();
  for (const f of fs.readdirSync(p)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(p, f), { force: true });
  }
  fs.rmSync(path.join(p, 'Local Storage'), { recursive: true, force: true });
  return p;
}

module.exports = { profileDir, resetProfile };
