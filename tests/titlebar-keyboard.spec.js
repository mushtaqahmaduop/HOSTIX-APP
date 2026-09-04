// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the custom title bar must be reachable from the keyboard
//
// The window is frame:false, so the OS menu bar is gone and with it Alt+F, the
// arrow keys and Escape. The accelerators in main.js survived (Ctrl+S/O/Q, F11,
// zoom), but the bar itself was mouse-only: Export Backup, About and License
// Info had no keyboard route at all, on a product whose users sit at hostel
// counters with whatever mouse still works.
//
// Nothing here is visible to node --check or to a render-error assertion — the
// bar renders perfectly and simply ignores the keyboard — so this asserts the
// interaction: what opens, what has focus afterwards, and where focus returns.
//
// The bar mounts on the login screen too, so no login is needed. That is
// deliberate: it keeps this spec off the warden-password path entirely.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

function launchOpts() {
  // Strip ELECTRON_RUN_AS_NODE — with it set, electron.exe runs as plain Node
  // and main.js crashes on `require('electron').app`.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
}

/** What the bar looks like right now: which menu is open, and what has focus. */
const STATE = () => {
  const menus = Array.from(document.querySelectorAll('#hz-titlebar .hz-menu'));
  const active = document.activeElement;
  return {
    labels: menus.map(m => m.querySelector('.hz-menu-btn').textContent.trim()),
    open: menus.filter(m => m.classList.contains('hz-open'))
      .map(m => m.querySelector('.hz-menu-btn').textContent.trim()),
    expanded: menus.filter(m => m.querySelector('.hz-menu-btn').getAttribute('aria-expanded') === 'true')
      .map(m => m.querySelector('.hz-menu-btn').textContent.trim()),
    hints: document.body.classList.contains('hz-alt-hints'),
    focusText: active ? active.textContent.replace(/\s+/g, ' ').trim() : null,
    focusRole: active ? (active.getAttribute('role') || active.className || active.tagName) : null,
  };
};

/**
 * STATE, sampled once focus has actually landed somewhere.
 *
 * Opening a menu and focusing its first item are not the same tick. Reading
 * STATE straight after a keypress therefore races: on a loaded machine the
 * menu is already open — `open` reads `['Help']` — while `document.activeElement`
 * is still the body, so `focusText` comes back as `''` and the assertion fails
 * on timing rather than on behaviour.
 *
 * That is exactly how this spec failed in a full-suite run on 2026-09-04 while
 * passing every time in isolation. A flake in a pre-demo test run costs more
 * than the bug it is pretending to be, so the wait is explicit rather than a
 * sleep: it blocks until focus holds something with text, then samples once.
 *
 * Only for the steps that expect focus to be ON something. The final step
 * deliberately checks that focus is NOT parked on a menu, and still uses a
 * plain evaluate.
 */
async function stateWithFocus(win, want) {
  // `want` is what focus is expected to be holding. Waiting for merely
  // "something focused" is not enough on its own: moving from a menu item to a
  // menu button is text-to-text, so a stale read satisfies it and the race
  // survives. Waiting for the expected text closes both directions.
  //
  // Passing nothing keeps the weaker condition — used for the one step that
  // asserts the open menu and the focus ROLE rather than any particular label.
  await win.waitForFunction((expected) => {
    const a = document.activeElement;
    const t = a && a.textContent ? a.textContent.replace(/\s+/g, ' ').trim() : '';
    if (!t) return false;
    return expected ? t.includes(expected) : true;
  }, want || null, { timeout: 5000 });
  return win.evaluate(STATE);
}

test('the title-bar menus open, walk and close from the keyboard alone', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#hz-titlebar', { state: 'attached', timeout: 30000 });

  // ── Mounted, and announced to a screen reader ─────────────────────────────
  const mounted = await win.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#hz-titlebar .hz-menu-btn'));
    return {
      labels: btns.map(b => b.textContent.trim()),
      haspopup: btns.every(b => b.getAttribute('aria-haspopup') === 'true'),
      collapsed: btns.every(b => b.getAttribute('aria-expanded') === 'false'),
      mnemonics: Array.from(document.querySelectorAll('#hz-titlebar .hz-menu'))
        .map(m => m.getAttribute('data-mn')),
      // Items must not be in the tab order while their panel is shut.
      itemsUntabbable: Array.from(document.querySelectorAll('#hz-titlebar .hz-drop button'))
        .every(b => b.getAttribute('tabindex') === '-1'),
      menuRoles: Array.from(document.querySelectorAll('#hz-titlebar .hz-drop'))
        .every(d => d.getAttribute('role') === 'menu'),
    };
  });
  expect(mounted.labels).toEqual(['File', 'View', 'Help']);
  expect(mounted.mnemonics).toEqual(['f', 'v', 'h']);
  expect(mounted.haspopup, 'menu buttons do not announce a popup').toBe(true);
  expect(mounted.collapsed, 'menu buttons start expanded').toBe(true);
  expect(mounted.itemsUntabbable, 'hidden menu items sit in the tab order').toBe(true);
  expect(mounted.menuRoles, 'dropdown panels are not role=menu').toBe(true);

  // ── Alt+F opens File with its first item focused ──────────────────────────
  await win.keyboard.press('Alt+f');
  let s = await stateWithFocus(win, 'Export Backup');
  expect(s.open, 'Alt+F did not open the File menu').toEqual(['File']);
  expect(s.expanded).toEqual(['File']);
  expect(s.hints, 'the mnemonic underlines stayed hidden').toBe(true);
  expect(s.focusRole).toBe('menuitem');
  expect(s.focusText).toContain('Export Backup');

  // ── ArrowDown walks the panel ─────────────────────────────────────────────
  await win.keyboard.press('ArrowDown');
  s = await stateWithFocus(win, 'Import Backup');
  expect(s.focusText).toContain('Import Backup');

  // ── End / Home reach the ends ─────────────────────────────────────────────
  await win.keyboard.press('End');
  s = await stateWithFocus(win, 'Quit');
  expect(s.focusText).toContain('Quit');
  await win.keyboard.press('Home');
  s = await stateWithFocus(win, 'Export Backup');
  expect(s.focusText).toContain('Export Backup');

  // ── ArrowRight moves along the bar, the way a menu bar does ───────────────
  await win.keyboard.press('ArrowRight');
  s = await stateWithFocus(win);
  expect(s.open, 'ArrowRight did not move to the next menu').toEqual(['View']);
  expect(s.expanded).toEqual(['View']);
  expect(s.focusRole).toBe('menuitem');

  // ── Escape closes and hands focus back to the button it came from ─────────
  await win.keyboard.press('Escape');
  s = await stateWithFocus(win, 'View');
  expect(s.open, 'Escape left a menu open').toEqual([]);
  expect(s.expanded).toEqual([]);
  expect(s.hints, 'the underlines outlived the menu').toBe(false);
  expect(s.focusText, 'focus was dropped on the floor').toBe('View');

  // ── Alt+H reaches Help, which is the licence + support corner ─────────────
  await win.keyboard.press('Alt+h');
  s = await stateWithFocus(win, 'About Hostyllo');
  expect(s.open).toEqual(['Help']);
  expect(s.focusText).toContain('About Hostyllo');
  await win.keyboard.press('Escape');

  // ── Escape must still reach the app when no menu is open ──────────────────
  // The bar listens in the capture phase; if it swallowed Escape unconditionally
  // a warden would be stranded in any modal that closes on it.
  await win.evaluate(() => {
    window.__escSeen = 0;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') window.__escSeen++; });
  });
  await win.keyboard.press('Escape');
  expect(await win.evaluate(() => window.__escSeen),
    'Escape no longer reaches the app when the bar has nothing open').toBe(1);

  // …and it must NOT reach the app when a menu is open — the menu eats it.
  await win.keyboard.press('Alt+f');
  await win.keyboard.press('Escape');
  expect(await win.evaluate(() => window.__escSeen),
    'Escape closed the menu AND fell through to the app').toBe(1);

  await app.close();
});
