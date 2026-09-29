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

// Owner, 2026-09-29: every resolution in the Windows display list must look
// like the laptop — the page lays out ~1366 wide on all of them, bigger or
// smaller. Maximized frameless window = the screen minus the 40-DIP taskbar.
const WINDOWS_LIST = [
  [1920, 1080], [1680, 1050], [1600, 1200], [1600, 900], [1440, 900],
  [1400, 1050], [1366, 768], [1360, 768], [1280, 1024], [1280, 960],
  [1280, 800], [1280, 768], [1280, 720], [1152, 864], [1024, 768], [800, 600],
];
WINDOWS_LIST.forEach(([sw, sh]) => {
  ok(sw + 'x' + sh + ' @100% lays the page out at the laptop\'s 1366 width', () => {
    const w = sw, h = sh - 40;
    const f = computeAutoScale(w, h, 1);
    const layoutW = w / f, layoutH = h / f;
    assert.ok(layoutW >= 1340 && layoutW <= 1400, 'layout ' + Math.round(layoutW) + ' wide at ' + f);
    assert.ok(layoutH >= 640, 'layout only ' + Math.round(layoutH) + ' tall at ' + f);
  });
});

ok('800x600 needs 59% — above the 58% floor, so it gets the same look', () => {
  assert.strictEqual(computeAutoScale(800, 560, 1), 0.59);
});

ok('1920x1080 @100% grows to 141% instead of spreading the page out', () => {
  assert.strictEqual(computeAutoScale(1920, 1040, 1), 1.41);
});

ok('a 1920x1080 @125% laptop (1536x824) grows a little', () => {
  assert.strictEqual(computeAutoScale(1536, 824, 1.25), 1.12);
});

ok('a window between 660 and 728 tall at 1366 wide stays at 100%', () => {
  assert.strictEqual(computeAutoScale(1366, 700, 1), 1);
});

ok('a short window shrinks on its height too', () => {
  assert.ok(computeAutoScale(1600, 600, 1) < 1);
});

ok('a tall screen grows only as far as its width allows (no sideways overflow)', () => {
  assert.strictEqual(computeAutoScale(1600, 1160, 1), 1.17);
});

ok('an ultrawide grows only as far as its height allows (no downward overflow)', () => {
  assert.strictEqual(computeAutoScale(3440, 1400, 1), 1.92);
  assert.strictEqual(computeAutoScale(2560, 1040, 1), 1.43);
});

ok('growth is capped at 200% (a 4K at 100%)', () => {
  assert.strictEqual(computeAutoScale(3840, 2120, 1), 2);
});

ok('a window dragged smaller than any screen stops at the 58% floor', () => {
  assert.strictEqual(computeAutoScale(600, 450, 1), 0.58);
});

ok('the main window can be as small as an 800x600 screen', () => {
  const src = code('main.js');
  const m = /mainWindow = new BrowserWindow\(\{\s*width: \d+, height: \d+, minWidth: (\d+), minHeight: (\d+)/.exec(src);
  assert.ok(m, 'main window options not found');
  assert.ok(+m[1] <= 800 && +m[2] <= 560, 'min ' + m[1] + 'x' + m[2]);
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
