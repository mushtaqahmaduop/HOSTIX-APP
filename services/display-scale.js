/* ─── DISPLAY SCALE — the app fits the screen it is on ───────────────────────
   Owner, 2026-09-28. Installed on a client desktop, the app did not look like
   it does on the owner's laptop. The client's monitor is 1680x1050 at 150%
   Windows scaling, which gives the page 1120x660 CSS pixels to lay out in —
   LESS room than the laptop (1366x768 at 100%, about 1366x728), not more. Every
   screen was designed at 1366 wide, so on the client's machine all of them
   squeezed: money truncated, tables scrolled sideways, filter bars wrapped.
   Zooming out twice by hand (0.83) made it "look like the laptop" again.

   This does that automatically, on every screen, and keeps doing it:

     1. AUTO-FIT. The layout width the app is designed for is DESIGN_W. A window
        narrower than that renders at `width / DESIGN_W`, so the page still lays
        out at 1366 and everything shrinks evenly — the same result as the
        client's manual zoom, without anyone having to know about it.
     2. THE SAME LOOK ON EVERY SCREEN (owner, 2026-09-29). Every resolution in
        the Windows list — 800x600 up to 1920x1080 and beyond — must look like
        the owner's 1366x768 laptop, not merely fit. So the page ALWAYS lays out
        at 1366 wide and is zoomed to fill: DOWN on a small screen, and UP on a
        large one (1920x1080 @100% renders at 141%). A wider page used to spread
        the same screens across more room; now it shows the same arrangement,
        bigger. Growth is capped at 200% (a 4K at 100%).
     3. A FLOOR AT 58%, which is what 800x600 needs (800 / 1366). The owner
        asked for 800x600 to look the same, knowing 14px text becomes ~8px
        there. Below the floor — only a window dragged smaller than any real
        screen — the page is simply narrower and the responsive CSS takes over.
     4. THE USER'S OWN ZOOM on top. Ctrl +/-, Ctrl+wheel and View → Zoom
        multiply the auto factor, and are remembered between launches. Ctrl+0
        returns to the fit. Auto-fit itself can be switched off from the View
        menu for anyone who wants Windows' own scale left exactly as it is.

   Re-evaluated on resize, maximize, moving to another monitor, and a change of
   Windows scaling — a laptop docked to a big screen fits both.

   The maths is pure and lives in computeAutoScale(), which
   tests/display-scale.test.js pins. HOSTYLLO_DISPLAY_SCALE=off disables
   auto-fit entirely (the e2e specs measure layout at an exact viewport).
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');

const DESIGN_W = 1366;          // the laptop every screen was designed on
const DESIGN_H = 660;           // shortest height a page is expected to need
const REF_H    = 728;           // the laptop's own height (768 minus the taskbar)
const MAX_GROW = 2;
const MIN_FACTOR = 0.58;        // 800x600: 800 / 1366
const USER_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

const round2 = (n) => Math.round(n * 100) / 100;

/** The factor the page should render at for a window of `width` x `height`
 *  DIPs. Windows scaling (125%, 150% …) is already inside the DIPs, so it
 *  needs no term of its own. */
function computeAutoScale(width, height) {
  const w = Number(width) || DESIGN_W;
  const h = Number(height) || DESIGN_H;

  // Shrinking: enough to keep the 1366 layout, and 660 of height, on screen.
  const fit = Math.min(w / DESIGN_W, h / DESIGN_H);
  if (fit < 1) return round2(Math.max(MIN_FACTOR, fit));
  // Growing: as far as the laptop's proportions allow, so a tall screen does
  // not overflow sideways and a wide one does not overflow downwards.
  const grow = Math.min(w / DESIGN_W, h / REF_H);
  if (grow > 1) return round2(Math.min(MAX_GROW, grow));
  return 1;
}

/** The next user zoom step from `current` in `direction` (+1 / -1). */
function stepUserScale(current, direction) {
  const c = Number(current) || 1;
  if (direction > 0) return USER_STEPS.find((v) => v > c + 0.001) || USER_STEPS[USER_STEPS.length - 1];
  for (let i = USER_STEPS.length - 1; i >= 0; i--) if (USER_STEPS[i] < c - 0.001) return USER_STEPS[i];
  return USER_STEPS[0];
}

/** Final factor Chromium receives: auto x user, held to a sane range. */
function combine(auto, user) {
  return round2(Math.min(3, Math.max(0.5, auto * user)));
}

// ── Preference file ─────────────────────────────────────────────────────────
function readPrefs(file) {
  try {
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      autoFit:   p.autoFit !== false,
      userScale: USER_STEPS.includes(p.userScale) ? p.userScale : 1,
    };
  } catch (_) {
    return { autoFit: true, userScale: 1 };
  }
}
function writePrefs(file, prefs) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(prefs, null, 2));
  } catch (_) { /* a preference that did not save is not worth an error */ }
}

/** Wires the scale to a BrowserWindow. Returns the controls the menus call. */
function attachDisplayScale(win, { screen, userDataDir, env = process.env }) {
  const file = path.join(userDataDir, 'display.json');
  const disabled = String(env.HOSTYLLO_DISPLAY_SCALE || '').toLowerCase() === 'off';
  let prefs = readPrefs(file);
  let applied = null;
  let timer = null;

  function state() {
    const b = win.getContentBounds();
    let sf = 1;
    try { sf = screen.getDisplayMatching(win.getBounds()).scaleFactor || 1; } catch (_) {}
    const auto = (!disabled && prefs.autoFit) ? computeAutoScale(b.width, b.height, sf) : 1;
    return { auto, user: prefs.userScale, autoFit: prefs.autoFit && !disabled,
             factor: combine(auto, prefs.userScale), scaleFactor: sf };
  }

  function apply(reason) {
    if (win.isDestroyed()) return;
    const s = state();
    const wc = win.webContents;
    if (applied === null || Math.abs(wc.getZoomFactor() - s.factor) > 0.004) {
      wc.setZoomFactor(s.factor);
    }
    const changed = applied !== s.factor;
    applied = s.factor;
    if (changed || reason === 'user') wc.send('display:scale', { ...s, reason });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => apply('fit'), 120);
  }

  ['resize', 'maximize', 'unmaximize', 'restore', 'moved', 'enter-full-screen', 'leave-full-screen']
    .forEach((ev) => win.on(ev, schedule));
  const onMetrics = () => schedule();
  screen.on('display-metrics-changed', onMetrics);
  screen.on('display-added', onMetrics);
  screen.on('display-removed', onMetrics);
  win.on('closed', () => {
    clearTimeout(timer);
    screen.removeListener('display-metrics-changed', onMetrics);
    screen.removeListener('display-added', onMetrics);
    screen.removeListener('display-removed', onMetrics);
  });

  // A navigation (login → app, licence screen → app) must land at the same
  // scale, and Chromium's own Ctrl+wheel zoom is routed through the steps
  // below instead of drifting away from what the menus report.
  win.webContents.on('did-finish-load', () => { applied = null; apply('load'); });
  win.webContents.on('zoom-changed', (_e, dir) => zoom(dir === 'in' ? 1 : -1));

  function save() { writePrefs(file, prefs); }
  function zoom(direction) {
    prefs.userScale = direction === 0 ? 1 : stepUserScale(prefs.userScale, direction);
    save(); apply('user');
  }
  function setAutoFit(on) {
    prefs.autoFit = !!on;
    save(); apply('user');
  }

  return {
    zoomIn:  () => zoom(1),
    zoomOut: () => zoom(-1),
    reset:   () => zoom(0),
    setAutoFit,
    toggleAutoFit: () => setAutoFit(!prefs.autoFit),
    state,
    apply,
  };
}

module.exports = {
  computeAutoScale, stepUserScale, combine, attachDisplayScale,
  DESIGN_W, DESIGN_H, USER_STEPS,
};
