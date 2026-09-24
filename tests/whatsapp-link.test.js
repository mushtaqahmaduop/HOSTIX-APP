/* The WhatsApp links the app opens: Support's "Chat on WhatsApp", the licence
   screen's support row and the receipt's "Send on WhatsApp".

   Owner, 2026-09-24: "the whatsapp support is broken". Two causes, both held
   here: `whatsapp://send` does nothing on a PC without WhatsApp Desktop, and a
   link over 2048 characters is dropped silently by preload.js and main.js.

     npm run test:whatsapp */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { waLink } = require('../renderer/src/utils.js');

let passed = 0, failed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// Code only: comments may quote the old scheme or number as history.
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\nWhatsApp links');

ok('a local 03xx number becomes the international 92 form on wa.me', () => {
  assert.strictEqual(waLink('03428521842', 'hi'), 'https://wa.me/923428521842?text=hi');
});

ok('+92, spaces and 0092 all normalise to the same number', () => {
  assert.strictEqual(waLink('+92 342 8521842', ''), 'https://wa.me/923428521842?text=');
  assert.strictEqual(waLink('0092-342-8521842', ''), 'https://wa.me/923428521842?text=');
});

ok('no number gives no link, so no button opens a broken chat', () => {
  assert.strictEqual(waLink('', 'hi'), '');
  assert.strictEqual(waLink(null, 'hi'), '');
});

ok('the message is URL-encoded, newlines and Urdu included', () => {
  const url = waLink('03428521842', 'Line 1\nLine 2 — السلام علیکم');
  assert.ok(url.startsWith('https://wa.me/923428521842?text='));
  assert.strictEqual(decodeURIComponent(url.split('?text=')[1]), 'Line 1\nLine 2 — السلام علیکم');
});

ok('a very long support request still produces a link the app will open (< 2048)', () => {
  const url = waLink('03428521842', 'x'.repeat(5000) + ' é'.repeat(800));
  assert.ok(url.length <= 2048, 'link is ' + url.length + ' characters');
  decodeURIComponent(url.split('?text=')[1]);   // throws if an escape was cut in half
});

ok('an escape is never cut in half at the trim point', () => {
  for (let pad = 0; pad < 6; pad++) {
    const url = waLink('03428521842', 'a'.repeat(pad) + 'é'.repeat(2000));
    decodeURIComponent(url.split('?text=')[1]);
  }
});

ok('Support uses the owner\'s number and opens it through waLink, not whatsapp://', () => {
  const src = read('renderer/src/modules/support.js');
  assert.ok(/whatsapp:\s*'\+92 342 8521842'/.test(src), 'support.js does not carry +92 342 8521842');
  assert.ok(/openExternalLink\(waLink\(raw, body\)\)/.test(src), 'supReach does not open waLink()');
  assert.ok(!/whatsapp:\/\/send/.test(code('renderer/src/modules/support.js')), 'support.js still builds a whatsapp:// link');
});

ok('Support email is hostyllo.info@gmail.com', () => {
  assert.ok(/email:\s*'hostyllo\.info@gmail\.com'/.test(read('renderer/src/modules/support.js')));
  assert.ok(/SUPPORT_CONTACT = 'hostyllo\.info@gmail\.com'/.test(read('main.js')));
});

ok('the licence screen shows the same number and opens a chat, not tel:', () => {
  const src = read('renderer/license.html');
  assert.ok(/whatsapp:\s*'\+92 342 8521842'/.test(src), 'license.html does not carry +92 342 8521842');
  assert.ok(/openExternal\('https:\/\/wa\.me\/' \+ num\)/.test(src), 'licence row does not open wa.me');
  assert.ok(!/'tel:'/.test(src), 'licence row still builds a tel: link');
  assert.ok(/email:\s*'hostyllo\.info@gmail\.com'/.test(src));
});

ok('the receipt sends through waLink too', () => {
  const src = read('renderer/src/receipt.js');
  assert.ok(/openExternalLink\(waLink\(phone, msg\)\)/.test(src));
  assert.ok(!/whatsapp:\/\/send/.test(code('renderer/src/receipt.js')), 'receipt.js still builds a whatsapp:// link');
});

ok('the old number appears nowhere the app reads', () => {
  for (const f of ['renderer/src/modules/support.js', 'renderer/license.html', 'main.js']) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '');   // comments may quote history
    assert.ok(!/8524842/.test(code), f + ' still carries the old number');
  }
});

ok('the student reminders trim whole characters too', () => {
  const src = read('renderer/src/modules/whatsapp.js');
  const sandbox = { waFitText: require('../renderer/src/utils.js').waFitText };
  const fn = new Function('waFitText', src.slice(src.indexOf('function waBuildLinks'),
    src.indexOf('\n}\n', src.indexOf('function waBuildLinks')) + 3) + '; return waBuildLinks;')(sandbox.waFitText);
  const links = fn('923001234567', encodeURIComponent('é'.repeat(3000)));
  assert.ok(links.app.length <= 2048 && links.web.length <= 2048);
  decodeURIComponent(links.web.split('?text=')[1]);
  decodeURIComponent(links.app.split('&text=')[1]);
});

ok('main.js lets https: through open-external (wa.me depends on it)', () => {
  assert.ok(/ALLOWED_PROTOCOLS = \[[^\]]*'https:'/.test(read('main.js')));
});

console.log('\n  ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
