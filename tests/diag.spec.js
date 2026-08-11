// Temporary diagnostic (NOT for commit).
'use strict';
const { test, _electron: electron } = require('@playwright/test');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

test('diagnose account menu', async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForTimeout(800);

  const info = await win.evaluate(() => {
    const m = document.getElementById('user-menu');
    const wrap = document.querySelector('.sb-user-wrap');
    const aside = document.getElementById('sidebar');
    if (!m) return { error: 'user-menu not in DOM' };
    toggleUserMenu();
    const cs = getComputedStyle(m);
    const r = m.getBoundingClientRect();
    const ar = aside ? aside.getBoundingClientRect() : null;
    return {
      menuInDom: true,
      parent: m.parentElement && m.parentElement.className,
      display: cs.display, position: cs.position, visibility: cs.visibility,
      opacity: cs.opacity, zIndex: cs.zIndex,
      top: cs.top, bottom: cs.bottom, left: cs.left, right: cs.right,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      wrapRect: wrap ? { y: Math.round(wrap.getBoundingClientRect().y), h: Math.round(wrap.getBoundingClientRect().height) } : null,
      asideRect: ar ? { y: Math.round(ar.y), h: Math.round(ar.height) } : null,
      asideOverflow: aside ? getComputedStyle(aside).overflow + ' / ' + getComputedStyle(aside).overflowY : null,
      itemsVisible: Array.from(m.querySelectorAll('.hdr-menu__item')).map(b => ({
        text: b.textContent.trim().slice(0, 20),
        display: getComputedStyle(b).display,
      })),
      canDoUsers: typeof canDo === 'function' ? canDo('users') : 'canDo missing',
      curUserPerms: (typeof CUR_USER !== 'undefined' && CUR_USER) ? CUR_USER.perms : null,
    };
  });
  console.log('DIAG ' + JSON.stringify(info.rect));
  await win.waitForTimeout(300);
  await win.screenshot({ path: process.env.HOSTIX_SHOT_DIR + '/menu-fixed.png' });
  await app.close();
});
