/* The display scale — the page fits the screen it is on.

   Owner, 2026-09-28: on a client's 1680x1050 desktop at 150% Windows scaling
   the app looked nothing like it does on the 1366x768 laptop it was designed
   on, and zooming out twice by hand fixed it. services/display-scale.js does
   that automatically; these pin the numbers for the screens that matter.

     npm run test:displayscale */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { computeAutoScale, stepUserScale, combine, USER_STEPS } = require('../services/display-scale');

let passed = 0, failed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\nDisplay scale');

// Content sizes are what a maximized frameless window gets: the screen in
// DIPs minus the 40-DIP taskbar.
ok('the owner\'s laptop (1366x768 @100%) renders at exactly 100%', () => {
  assert.strictEqual(computeAutoScale(1366, 728, 1), 1);
});

ok('the client desktop (1680x1050 @150% = 1120x660) lays out at 1366 wide', () => {
  const f = computeAutoScale(1120, 660, 1.5);
  assert.strictEqual(f, 0.82);
  assert.ok(Math.abs(1120 / f - 1366) < 10, 'layout width ' + (1120 / f));
});

ok('a 1920x1080 @125% laptop (1536x824) is left alone', () => {
  assert.strictEqual(computeAutoScale(1536, 824, 1.25), 1);
});

ok('1920x1080 @100% is left alone — the size most screens already are', () => {
  assert.strictEqual(computeAutoScale(1920, 1040, 1), 1);
});

ok('a 1280x720 @100% screen shrinks a little, not a lot', () => {
  const f = computeAutoScale(1280, 680, 1);
  assert.ok(f >= 0.9 && f < 1, String(f));
});

ok('at 100% Windows scale the page never goes under 80% — text stays readable', () => {
  assert.strictEqual(computeAutoScale(900, 600, 1), 0.8);
});

ok('at 150% there are pixels to spare, so it may go further — but never under 67%', () => {
  assert.strictEqual(computeAutoScale(900, 600, 1.5), 0.67);
  assert.ok(computeAutoScale(900, 600, 1.5) * 1.5 >= 0.8);
});

ok('a short window shrinks on its height too', () => {
  assert.ok(computeAutoScale(1600, 600, 1) < 1);
});

ok('a 27-inch 1440p @100% (2560x1400) grows, capped at 125%', () => {
  assert.strictEqual(computeAutoScale(2560, 1400, 1), 1.25);
});

ok('a 4K @150% (2560x1400 DIPs) grows the same way', () => {
  assert.strictEqual(computeAutoScale(2560, 1400, 1.5), 1.25);
});

ok('an ultrawide that is wide but not tall grows only as far as its height allows', () => {
  const f = computeAutoScale(3440, 1400, 1);
  assert.strictEqual(f, 1.25);
  assert.ok(computeAutoScale(2560, 1040, 1) === 1, 'a 1080-tall ultrawide stays at 100%');
});

ok('junk input falls back to 100%, never NaN', () => {
  assert.strictEqual(computeAutoScale(undefined, undefined, undefined), 1);
  assert.strictEqual(computeAutoScale(0, 0, 0), 1);
});

ok('user zoom steps up and down through the ladder and stops at the ends', () => {
  assert.strictEqual(stepUserScale(1, 1), 1.1);
  assert.strictEqual(stepUserScale(1, -1), 0.9);
  assert.strictEqual(stepUserScale(USER_STEPS[USER_STEPS.length - 1], 1), USER_STEPS[USER_STEPS.length - 1]);
  assert.strictEqual(stepUserScale(USER_STEPS[0], -1), USER_STEPS[0]);
});

ok('the user\'s zoom multiplies the fit instead of replacing it', () => {
  assert.strictEqual(combine(0.82, 1.1), 0.9);
  assert.strictEqual(combine(0.82, 1), 0.82);
});

ok('main.js zooms only through the controller — no Chromium zoom roles left', () => {
  const src = code('main.js');
  assert.ok(!/role:\s*'(zoomIn|zoomOut|resetZoom)'/.test(src), 'a role-based zoom item would bypass the fit');
  assert.ok(!/setZoomLevel\(/.test(src), 'setZoomLevel would overwrite the fit');
  assert.ok(/attachDisplayScale\(mainWindow/.test(src));
});

ok('the title bar counter-zooms, so window chrome keeps its physical size', () => {
  const css = code('renderer/titlebar.css');
  assert.ok(/#hz-titlebar\s*\{[^}]*zoom:\s*calc\(1 \/ var\(--hz-zoom\)\)/.test(css));
  assert.ok(/--titlebar-offset:\s*calc\(var\(--titlebar-h\) \/ var\(--hz-zoom\)\)/.test(css));
});

console.log('\n  ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
