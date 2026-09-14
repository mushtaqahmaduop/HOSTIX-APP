// ════════════════════════════════════════════════════════════════════════════
// The toast (owner references: `success sign.png`, `error sign1.png`,
// `backup due sign.png`, 6 Sep 2026).
//
// Three of these assertions exist because the thing they pin is invisible when
// it breaks:
//
//   · The stack is CENTRED. At top-right it sat over the first two KPI cards
//     and over the student drawer's action band, so a toast reporting on a
//     click covered the button that made it. A regression here looks like a
//     cosmetic nudge and is a usability fault.
//   · Hovering PAUSES the dwell. Without it, moving the pointer onto a warning
//     to press Close races the timer, which is the exact frustration the close
//     button was added to fix.
//   · `warning` is its own tone. Callers have passed it for a long time; until
//     6 Sep there was no icon and no colour for it, so those toasts came out
//     titled "Info" in the accent blue — a backup reminder that read as news.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env };
}

async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
}

/** Wait out the boot warnings, THEN clear, so each case counts its own toasts.

    Two checks fire on their own timers after login — the default-password
    warning at 2s (auth-nev.js) and the backup reminder after it — and the login
    queue releases anything it held at 700ms intervals. Clearing once at the top
    of a test therefore clears nothing: the boot toasts arrive afterwards and
    land in the middle of somebody's count. Settle until the container has been
    quiet for 900ms, and only then empty it. */
async function clearToasts(win) {
  const seen = async () => win.evaluate(() =>
    document.querySelectorAll('#toast-container .toast').length);
  let quietFor = 0, last = await seen();
  for (let i = 0; i < 40 && quietFor < 900; i++) {
    await win.waitForTimeout(150);
    const n = await seen();
    quietFor = (n === last) ? quietFor + 150 : 0;
    last = n;
  }
  await win.evaluate(() => {
    document.querySelectorAll('#toast-container .toast').forEach(t => t.remove());
  });
}


/** Count only the toasts THIS test raised.

    The boot warnings do not all arrive inside any settle window worth waiting
    for — the backup reminder in particular lands late — and a stray one landing
    mid-count reads as "the toast never left", which is a failure in the one
    assertion that has nothing to do with it. Matching on the message keeps each
    case counting its own. */
async function mine(win, text) {
  return win.evaluate((t) => [...document.querySelectorAll('#toast-container .toast')]
    .filter(el => (el.querySelector('.toast-msg') || {}).textContent === t).length, text);
}

test.beforeAll(() => { resetProfile(); });

test('the stack is centred, and clears the controls it used to cover', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await win.setViewportSize({ width: 1366, height: 768 });
  await clearToasts(win);

  await win.evaluate(() => toast('Payment recorded', 'success'));
  await win.waitForSelector('#toast-container .toast');

  const geo = await win.evaluate(() => {
    const t = document.querySelector('#toast-container .toast');
    const r = t.getBoundingClientRect();
    /* clientWidth, NOT innerWidth: innerWidth counts the scrollbar gutter that
       a fixed element is not centred within, which reads as a 5px drift. */
    const vw = document.documentElement.clientWidth;
    return { left: r.left, right: vw - r.right, top: r.top, vw };
  });

  /* CENTRED, within a pixel of rounding. The old stack was pinned 20px from
     the right edge; the test that would have caught that is this one. */
  expect(Math.abs(geo.left - geo.right)).toBeLessThan(2);
  expect(geo.left).toBeGreaterThan(100);

  /* And it starts below the title bar rather than under it — #hz-titlebar is
     z-index 100000, above everything, so a toast at top:0 loses its close
     button to it. */
  // Since 2026-09-14 the bar auto-hides and takes no height, so "below it"
  // means below wherever its bottom edge is now.
  const barBottom = await win.evaluate(() => {
    const b = document.getElementById('hz-titlebar');
    return b ? Math.max(0, b.getBoundingClientRect().bottom) : 0;
  });
  expect(geo.top).toBeGreaterThanOrEqual(barBottom);

  await app.close();
});

test('every part the reference draws is on the element', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await clearToasts(win);

  await win.evaluate(() =>
    toast('Gauhar Rehman is on notice — bed held until 30-Sept-2026.', 'success'));
  await win.waitForSelector('#toast-container .toast');

  const parts = await win.evaluate(() => {
    const t = document.querySelector('#toast-container .toast');
    const cs = getComputedStyle(t);
    return {
      tone:     cs.borderLeftWidth,
      well:     !!t.querySelector('.toast-icon'),
      disc:     !!t.querySelector('.toast-icon__disc svg'),
      rule:     !!t.querySelector('.toast-rule'),
      title:    (t.querySelector('.toast-title') || {}).textContent,
      msg:      (t.querySelector('.toast-msg') || {}).textContent,
      close:    !!t.querySelector('.toast-x'),
      closeLbl: (t.querySelector('.toast-x') || {}).getAttribute
                  ? t.querySelector('.toast-x').getAttribute('aria-label') : null,
      timer:    !!t.querySelector('.toast-progress'),
      role:     t.getAttribute('role'),
    };
  });

  expect(parts.tone).toBe('6px');            // the tone bar, not a 3px hairline
  expect(parts.well).toBe(true);
  expect(parts.disc).toBe(true);
  expect(parts.rule).toBe(true);
  expect(parts.title).toBe('Success');
  expect(parts.msg).toContain('bed held until');
  expect(parts.timer).toBe(true);

  /* THE OWNER'S ASK. An icon-only control needs a name (§21). */
  expect(parts.close).toBe(true);
  expect(parts.closeLbl).toBeTruthy();

  /* A success confirmation read out over whatever the warden is doing is
     noise; only the tones that report a failure announce themselves. */
  expect(parts.role).toBe('status');

  await app.close();
});

test('warning is its own tone, and not the info blue', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await clearToasts(win);

  const tones = await win.evaluate(async () => {
    const read = (type, title) => {
      document.querySelectorAll('#toast-container .toast').forEach(t => t.remove());
      toast('x', type, title);
      const t = document.querySelector('#toast-container .toast');
      return { cls: t.className, bar: getComputedStyle(t).borderLeftColor,
               title: t.querySelector('.toast-title').textContent,
               icon: !!t.querySelector('.toast-icon__disc svg path') };
    };
    return { warn: read('warning', ''), info: read('info', ''), err: read('error', ''),
             ok: read('success', '') };
  });

  expect(tones.warn.cls).toContain('warning');
  expect(tones.warn.icon).toBe(true);         // it used to render with none
  expect(tones.warn.title).toBe('Heads up');  // it used to read "Info"
  expect(tones.warn.bar).not.toBe(tones.info.bar);
  // and all four tones differ from each other
  const bars = [tones.warn.bar, tones.info.bar, tones.err.bar, tones.ok.bar];
  expect(new Set(bars).size).toBe(4);

  await app.close();
});

test('a success goes on its own; close ends one early; hover holds it', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);

  // ── it goes on its own ────────────────────────────────────────────────────
  await clearToasts(win);
  await win.evaluate(() => toast('probe-goes', 'success'));
  expect(await mine(win, 'probe-goes')).toBe(1);
  await win.waitForTimeout(1500 + 500);
  expect(await mine(win, 'probe-goes')).toBe(0);

  // ── close ends it before the timer ────────────────────────────────────────
  await clearToasts(win);
  await win.evaluate(() => toast('probe-close', 'warning', 'Backup due'));
  await win.locator('#toast-container .toast', { hasText: 'probe-close' })
           .locator('.toast-x').click();
  await win.waitForTimeout(320);
  expect(await mine(win, 'probe-close')).toBe(0);

  // ── hovering holds it past its dwell ──────────────────────────────────────
  await clearToasts(win);
  /* PARK THE POINTER OFF THE STACK FIRST. The close-button click above leaves
     it exactly where the next toast will draw, and a pointer already inside
     the box when the element appears generates no mousemove - so hover() is a
     no-op, mouseenter never fires, and the toast is never held. That is real
     behaviour too (a toast drawn under a resting pointer does not pause), but
     it is not what this case is testing. It only shows up in a batch run. */
  await win.mouse.move(10, 400);
  await win.evaluate(() => toast('probe-hold', 'success'));
  await win.locator('#toast-container .toast', { hasText: 'probe-hold' }).hover();
  await win.waitForTimeout(1500 + 900);       // well past the 1.5s success dwell
  const held = await win.evaluate(() => {
    const t = [...document.querySelectorAll('#toast-container .toast')]
      .find(el => (el.querySelector('.toast-msg') || {}).textContent === 'probe-hold');
    return t ? { there: true, cls: t.className,
                 paused: getComputedStyle(t.querySelector('.toast-progress')).animationPlayState }
             : { there: false };
  });
  expect(held.there, 'a hovered toast is still on screen past its dwell').toBe(true);
  expect(held.cls).toContain('is-held');
  expect(held.paused).toBe('paused');

  /* And it leaves once the pointer does — a held toast that never goes is a
     worse bug than one that goes too fast. */
  await win.mouse.move(10, 400);
  await win.waitForTimeout(1500 + 700);
  expect(await mine(win, 'probe-hold')).toBe(0);

  await app.close();
});

test('an error dwells longer than a success, because it is read', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await clearToasts(win);

  await win.evaluate(() => { toast('probe-ok', 'success'); toast('probe-err', 'error'); });
  expect(await mine(win, 'probe-ok')).toBe(1);
  expect(await mine(win, 'probe-err')).toBe(1);

  // past the success dwell, before the error's
  await win.waitForTimeout(1500 + 500);
  expect(await mine(win, 'probe-ok'), 'the success has gone').toBe(0);
  expect(await mine(win, 'probe-err'), 'the error is still being read').toBe(1);

  await app.close();
});
