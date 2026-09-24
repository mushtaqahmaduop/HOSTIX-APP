/* Main-process hardening that a code change could quietly undo.

   Audit, 2026-09-24: every window runs preload.js, so any page a window
   navigates to receives electronAPI — the database, licence activation, file
   writes. Verified on the unguarded build: `location.href = 'https://…'` took
   the main window off the app, and the page it landed on still had
   window.electronAPI. main.js now confines every window to the app's own files.

   The behaviour itself is exercised in Electron (see the audit report); this
   holds the wiring in place without launching it.

     npm run test:security */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const guard = (main.match(/app\.on\('web-contents-created'[\s\S]*?\n  \}\);\n/) || [''])[0];

console.log('\nMain-process hardening');

ok('every window gets the guard (web-contents-created)', () => {
  assert.ok(guard, 'no app.on(\'web-contents-created\') handler in main.js');
});

ok('it is registered before the first window is created', () => {
  const at = main.indexOf("app.on('web-contents-created'");
  const initDb = main.indexOf('  initDatabase();', main.indexOf('setPermissionCheckHandler'));
  assert.ok(at > 0 && initDb > at, 'guard must come before initDatabase()/createWindow() in whenReady');
});

ok('navigation away from the app\'s own files is prevented', () => {
  assert.ok(/will-navigate/.test(guard), 'no will-navigate handler');
  assert.ok(/\^file:/.test(guard) && /ev\.preventDefault\(\)/.test(guard), 'will-navigate does not confine to file:');
});

ok('pop-ups: about:blank print windows allowed, anything remote denied', () => {
  assert.ok(/setWindowOpenHandler/.test(guard), 'no setWindowOpenHandler');
  assert.ok(/about:blank/.test(guard), 'print windows (about:blank) would be refused');
  assert.ok(/action: 'deny'/.test(guard), 'nothing is ever denied');
});

ok('a web or mail link goes to the system browser, nothing else does', () => {
  assert.ok(/\^\(https\?\|mailto\):/.test(guard), 'external() does not limit itself to http(s)/mailto');
  assert.ok(/shell\.openExternal/.test(guard));
});

ok('the renderer CSP still refuses eval and remote hosts', () => {
  const csp = (main.match(/'Content-Security-Policy': \[([\s\S]*?)\]/) || [])[1] || '';
  assert.ok(/default-src 'self'/.test(csp), 'default-src is not self');
  assert.ok(!/unsafe-eval/.test(csp), 'unsafe-eval is back');
  assert.ok(/connect-src 'self'/.test(csp), 'connect-src is not self');
});

console.log('\n  ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
