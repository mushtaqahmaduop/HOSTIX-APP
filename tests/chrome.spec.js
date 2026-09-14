// ════════════════════════════════════════════════════════════════════════════
// HOSTIX — app chrome safety net
//
// The account menu moved from the header to the bottom of the sidebar, where it
// has to open UPWARD. It shipped broken once: .sb-user-menu and .hdr-menu had
// equal specificity, so .hdr-menu won on source order, `top` and `bottom` were
// both applied, and the menu collapsed to a 14px sliver just below the window.
// It was in the DOM, "visible", and completely unusable.
//
// Nothing here can be caught by node --check, and a render-error assertion will
// not see it either — the page renders fine, the menu is just off screen. So
// this asserts geometry: the menu must be on screen, a sensible size, and hold
// its items.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
}

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  // Without a license the app boots to the activation screen instead of login,
  // and the failure reads as an opaque 30s timeout on #login-input. Say so.
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('the sidebar account menu opens on screen with all of its items', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1440, height: 900 });

  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForTimeout(800);

  /* The header must no longer carry an account chip, a hamburger or a Back
     button — all three were removed on the owner's call.

     HELP & SUPPORT IS BACK, AND IS NOW A PAGE. It was removed when it was a
     dead menu item pointing at nothing; the owner asked for the screen on
     2026-09-10 and it is the last item in the rail. So what is asserted here
     flipped from "it is gone" to "it exists and it goes somewhere" — a nav
     item that leads nowhere is the thing the original assertion was really
     about, and that is still checked, one line down.

     Walked as real elements rather than matched against innerHTML: innerHTML
     carries comments too, and this file's own history is the reason to be
     careful about that. */
  const chrome = await win.evaluate(() => {
    const help = Array.from(document.querySelectorAll('.nav-item'))
      .find(el => el.textContent.replace(/\s+/g, ' ').trim() === 'Help & Support');
    return {
      chip: !!document.getElementById('hdr-user'),
      burger: !!document.getElementById('sidebar-toggle'),
      back: !!document.getElementById('hdr-back-btn'),
      help: !!help,
      helpGoes: !!(help && /navRail\(['"]support['"]\)/.test(help.getAttribute('onclick') || '')),
    };
  });
  expect(chrome).toEqual({ chip: false, burger: false, back: false,
                           help: true, helpGoes: true });

  // …and pressing it really renders the page, rather than a Render Error.
  await win.evaluate(() => navigate('support'));
  await win.waitForTimeout(600);
  const support = await win.evaluate(() => ({
    drawn: !!document.querySelector('.sup-hero'),
    err: document.getElementById('content').innerText.includes('Render Error'),
  }));
  expect(support).toEqual({ drawn: true, err: false });

  const info = await win.evaluate(() => {
    toggleUserMenu();
    const m = document.getElementById('user-menu');
    const r = m.getBoundingClientRect();
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom },
      viewportH: window.innerHeight,
      viewportW: window.innerWidth,
      items: Array.from(m.querySelectorAll('.hdr-menu__item'))
        .filter(b => getComputedStyle(b).display !== 'none')
        .map(b => b.textContent.trim()),
      // Settings moved out of this menu into the sidebar's System group.
      settingsInRail: Array.from(document.querySelectorAll('.nav-item[data-page="settings"]'))
        .some(el => getComputedStyle(el).display !== 'none'),
    };
  });

  // On screen, both axes.
  expect(info.rect.y, 'menu starts above the top of the window').toBeGreaterThanOrEqual(0);
  expect(info.rect.bottom, 'menu extends below the bottom of the window')
    .toBeLessThanOrEqual(info.viewportH);
  expect(info.rect.x).toBeGreaterThanOrEqual(0);

  // Actually a menu, not a collapsed sliver — this is the shape the bug took.
  expect(info.rect.h, 'menu collapsed to a sliver').toBeGreaterThan(120);
  expect(info.rect.w).toBeGreaterThan(150);

  // A full-access account sees every entry. Settings is deliberately NOT one of
  // them any more — it configures the hostel, not the signed-in account, so it
  // lives in the sidebar's System group with the other configuration items.
  // Former Students and Manage Users left for the sidebar on 2026-09-14 (owner);
  // the menu keeps what is about the signed-in account.
  expect(info.items).toEqual(['My Account', 'Logout']);
  expect(info.settingsInRail, 'Settings must be reachable from the sidebar').toBe(true);

  await app.close();
});
