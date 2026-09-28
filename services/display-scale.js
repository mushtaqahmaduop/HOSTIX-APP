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
     2. A READABILITY FLOOR in PHYSICAL pixels. Shrinking stops where 14px body
        text would fall below ~11 physical pixels, so a 100% screen never goes
        under 80% while a 150% screen, which has pixels to spare, can go to 67%.
        Below the floor the page is simply narrower and the responsive CSS
        takes over; it never becomes unreadable.
     3. GENTLE GROWTH on very large screens. Past 1920 CSS px wide (a 27-inch
        1440p at 100%, a 4K at 150%) the app grows up to 125%, so it does not
        sit as a small island of text in the middle of a wall of screen.
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
const LARGE_W  = 1920;          // above this, the app starts to grow
const LARGE_H  = 1040;          // 1080 minus the taskbar
const MAX_GROW = 1.25;
const MIN_PHYSICAL = 0.8;       // factor x Windows scale never below this…
const MIN_FACTOR   = 0.67;      // …and the page itself never below this
const USER_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

const round2 = (n) => Math.round(n * 100) / 100;

/** The factor the page should render at for a window of `width` x `height`
 *  DIPs on a display at Windows scale `scaleFactor` (1, 1.25, 1.5 …). */
function computeAutoScale(width, height, scaleFactor) {
  const w = Number(width) || DESIGN_W;
  const h = Number(height) || DESIGN_H;
  const s = Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;

  const fit = Math.min(w / DESIGN_W, h / DESIGN_H);
  if (fit < 1) {
    const floor = Math.max(MIN_FACTOR, MIN_PHYSICAL / s);
    return round2(Math.max(floor, fit));
  }
  const grow = Math.min(w / LARGE_W, h / LARGE_H);
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
