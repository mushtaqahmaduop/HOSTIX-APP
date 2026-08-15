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

  // The header must no longer carry an account chip, a hamburger or a Back
  // button — all three were removed on the owner's call.
  // Help & Support is checked by walking real elements, not by searching
  // innerHTML — innerHTML carries comments too, and index.html has one that
  // explains the removal, so a substring match reports the item as still there.
  const removed = await win.evaluate(() => ({
    chip: !!document.getElementById('hdr-user'),
    burger: !!document.getElementById('sidebar-toggle'),
    back: !!document.getElementById('hdr-back-btn'),
    help: Array.from(document.querySelectorAll('.nav-item, .hdr-menu__item, a'))
      .some(el => el.textContent.replace(/\s+/g, ' ').trim() === 'Help & Support'),
  }));
  expect(removed).toEqual({ chip: false, burger: false, back: false, help: false });

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
  expect(info.items).toEqual(['Former Students', 'Manage Users', 'Logout']);
  expect(info.settingsInRail, 'Settings must be reachable from the sidebar').toBe(true);

  await app.close();
});
