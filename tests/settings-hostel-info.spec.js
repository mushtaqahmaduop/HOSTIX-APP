// ════════════════════════════════════════════════════════════════════════════
// Settings → Hostel Info — rebuilt 2026-09-08 to `hostel profile.png`.
//
// The redesign is layout, but three things under it are behaviour, and each of
// the three was found broken while drawing the page:
//
//  · THE FONT PICKER OFFERED FACES THAT DO NOT EXIST. Thirteen of its twenty
//    entries were Google families (DM Serif Display, Playfair, Cinzel …) that
//    this app has never bundled and its CSP cannot fetch (`font-src 'self'`).
//    All thirteen rendered as the default serif, so thirteen tiles drew ONE
//    face under thirteen names — and the shipped default was one of them.
//  · NOTHING APPLIED THE CHOSEN FACE. `hostelNameFont` was written, toasted,
//    and read back by no surface in the app: the picker's own preview tile was
//    the only place it ever appeared. The title bar — the thing the setting is
//    named after — set the interface font like every other strip of chrome.
//  · THE LOGIN SCREEN'S ADDRESS LINE WAS AN HTML SINK. `liveUpdateSetting`
//    wrote the location field into `innerHTML` on every keystroke.
//
// The panel also has no Save button, on purpose: every field writes through on
// input and always did, so the button that used to sit at the bottom saved
// nothing that was not already saved.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 60000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 60000 });
  await win.evaluate(() => { navigate('settings'); settingsTab = 'hostel'; renderPage('settings'); });
  await win.waitForSelector('#hi-name', { timeout: 20000 });
  return { app, win };
}

test('every face the picker offers actually draws, and no two draw the same', async () => {
  const { app, win } = await launch();

  const result = await win.evaluate(async () => {
    const tiles = [...document.querySelectorAll('.hi-font')];
    /* The five bundled faces are @font-face rules with `font-display: swap`,
       and a canvas measurement does not itself trigger a download — so ask for
       them first. Without this, a bundled face measures as missing purely
       because the file has not arrived yet. The system faces need nothing. */
    for (const t of tiles) {
      const lbl = t.querySelector('.font-card-label');
      const f = getComputedStyle(lbl).fontFamily.split(',')[0].replace(/["']/g, '').trim();
      try { await document.fonts.load('700 48px "' + f + '"'); } catch (e) {}
    }
    await document.fonts.ready;
    const c = document.createElement('canvas').getContext('2d');
    const S = 'Hostel Name mmmmwwwWM';
    const widths = {};
    const dead = [];
    for (const t of tiles) {
      const label = t.querySelector('.font-card-label');
      const ff = getComputedStyle(label).fontFamily.split(',')[0].replace(/["']/g, '').trim();
      let resolves = false;
      for (const generic of ['serif', 'sans-serif', 'monospace']) {
        c.font = '700 48px ' + generic;
        const base = c.measureText(S).width;
        c.font = '700 48px "' + ff + '", ' + generic;
        if (Math.abs(c.measureText(S).width - base) > 0.5) { resolves = true; break; }
      }
      if (!resolves) dead.push(ff);
      c.font = '700 48px "' + ff + '", serif';
      widths[ff] = Math.round(c.measureText(S).width);
    }
    return { count: tiles.length, dead, widths };
  });

  // Enough faces to be a picker, and every one of them real.
  expect(result.count).toBeGreaterThan(9);
  expect(result.dead).toEqual([]);

  // The old list's failure mode: many names, one face. No more than two tiles
  // may measure identically (metric-compatible pairs are legitimate).
  const byWidth = {};
  for (const [ff, w] of Object.entries(result.widths)) (byWidth[w] = byWidth[w] || []).push(ff);
  const collisions = Object.values(byWidth).filter(g => g.length > 2);
  expect(collisions).toEqual([]);

  await app.close();
});

test('picking a face sets the title bar, which is the surface the setting names', async () => {
  const { app, win } = await launch();

  const before = await win.evaluate(() =>
    getComputedStyle(document.getElementById('hz-tb-title')).fontFamily);

  await win.evaluate(async () => { await applyHostelFont('Impact'); });
  await win.waitForTimeout(400);

  const after = await win.evaluate(() => ({
    face: getComputedStyle(document.getElementById('hz-tb-title')).fontFamily,
    stored: DB.settings.hostelNameFont,
  }));

  expect(after.stored).toBe('Impact');
  expect(after.face).toContain('Impact');
  expect(after.face).not.toBe(before);

  // And it survives a re-render of the chrome rather than being a one-off
  // assignment that the next paint of the title bar undoes.
  await win.evaluate(() => window.setTitlebarHostel());
  expect(await win.evaluate(() =>
    getComputedStyle(document.getElementById('hz-tb-title')).fontFamily)).toContain('Impact');

  await app.close();
});

test('the fields write through on input, and the profile card follows', async () => {
  const { app, win } = await launch();

  await win.fill('#hi-name', 'Continental Boys Hostel-2');
  await win.fill('#hi-loc', 'Cannal Road, Peshawar');
  await win.fill('#hi-phone', '033X-XXXXXXX');
  await win.waitForTimeout(500);

  const state = await win.evaluate(() => ({
    stored: {
      name: DB.settings.hostelName, loc: DB.settings.location, phone: DB.settings.phone,
    },
    card: {
      name: document.getElementById('font-preview-name').textContent.trim(),
      loc: document.getElementById('hi-prev-loc').textContent.trim(),
      phone: document.getElementById('hi-prev-phone').textContent.trim(),
    },
    // No Save button: the panel must not offer one, because pressing it would
    // be the moment a warden believes their edit was committed.
    saveButtons: [...document.querySelectorAll('.settings-panel.active button')]
      .map(b => b.textContent.trim()).filter(t => /save/i.test(t)),
  }));

  expect(state.stored.name).toBe('Continental Boys Hostel-2');
  expect(state.stored.loc).toBe('Cannal Road, Peshawar');
  expect(state.card.name).toBe('Continental Boys Hostel-2');
  expect(state.card.loc).toBe('Cannal Road, Peshawar');
  expect(state.card.phone).toBe('033X-XXXXXXX');
  expect(state.saveButtons).toEqual([]);

  // Clearing a field returns the card to words, not to an empty row.
  await win.fill('#hi-phone', '');
  await win.waitForTimeout(300);
  const cleared = await win.evaluate(() => {
    const el = document.getElementById('hi-prev-phone');
    return { text: el.textContent.trim(), empty: el.classList.contains('is-empty') };
  });
  expect(cleared.text).toBe('No phone recorded');
  expect(cleared.empty).toBe(true);

  await app.close();
});

test('a location typed with markup in it is text on the login screen, not markup', async () => {
  const { app, win } = await launch();

  await win.fill('#hi-loc', '<img src=x onerror="window.__pwned=1">Peshawar');
  await win.waitForTimeout(400);

  const out = await win.evaluate(() => ({
    pwned: !!window.__pwned,
    html: (document.getElementById('login-address') || {}).innerHTML || '',
    text: (document.getElementById('login-address') || {}).textContent || '',
  }));

  expect(out.pwned).toBe(false);
  expect(out.html).not.toContain('<img');
  expect(out.text).toContain('Peshawar');

  await app.close();
});

/* THE OWNER'S RULE, 2026-09-08: a control the reference draws that has no
   feature behind it is drawn anyway — locked, with a warning or an info that
   says what the app does instead — never quietly dropped. These are the three
   ways that could rot: a locked control that is actually clickable, a locked
   control with no explanation, and a locked control showing a made-up state. */
test('every locked preference is really locked, and says why', async () => {
  const { app, win } = await launch();

  const rows = await win.evaluate(() => [...document.querySelectorAll('.set-row')].map(r => {
    const ctl = r.querySelector('.set-row__c');
    const tog = ctl.querySelector('.set-tog');
    const sel = ctl.querySelector('select');
    const why = r.querySelector('.set-row__why');
    return {
      title: r.querySelector('.set-row__t').textContent.trim(),
      locked: r.classList.contains('is-locked'),
      hasLockChip: !!ctl.querySelector('.set-lock'),
      toggleDisabled: tog ? tog.disabled : null,
      liveSelect: !!sel,
      why: why ? why.textContent.trim() : '',
      whyHidden: why ? why.hidden : null,
    };
  }));

  expect(rows.length).toBe(12);            // six general, six operational

  for (const r of rows) {
    if (!r.locked) continue;
    // A lock chip, an explanation, and — for a switch — a switch that cannot
    // be flipped. Everything a warden needs to stop clicking and read.
    expect(r.hasLockChip).toBe(true);
    expect(r.why.length).toBeGreaterThan(30);
    expect(r.why.toLowerCase()).not.toContain('coming soon');
    if (r.toggleDisabled !== null) expect(r.toggleDisabled).toBe(true);
    // The explanation starts hidden behind the ⓘ — an author `display` beating
    // [hidden] left every one of them open on first paint once already.
    expect(r.whyHidden).toBe(true);
  }

  // Currency is the one live control on those two cards, and it must not be
  // wearing a lock.
  const currency = rows.find(r => r.title === 'Currency');
  expect(currency.locked).toBe(false);
  expect(currency.liveSelect).toBe(true);

  // Clicking the ⓘ opens exactly its own row's sentence.
  await win.click('.set-row.is-locked .set-row__i-btn');
  expect(await win.evaluate(() =>
    [...document.querySelectorAll('.set-row__why')].filter(w => !w.hidden).length)).toBe(1);

  await app.close();
});

/* THE BUILD DECIDES ITS OWN VERSION. This was a text field over
   DB.settings.version: the sidebar, this card and the number support asked for
   were three different things, and the stored one said 'v3.0' on a v5 build. */
test('the version is the build\'s, and cannot be typed', async () => {
  const { app, win } = await launch();
  await win.waitForTimeout(600);

  const out = await win.evaluate(async () => ({
    shown: document.getElementById('hi-appver').textContent.trim(),
    real: 'v' + await window.appInfo.version(),
    stored: DB.settings.version,
    // No input anywhere on the panel writes the version any more.
    versionInputs: [...document.querySelectorAll('.settings-panel.active input')]
      .filter(i => /version/i.test(i.id)).length,
    sidebar: (document.getElementById('sb-version') || {}).textContent || '',
  }));

  expect(out.shown).toBe(out.real);
  expect(out.versionInputs).toBe(0);
  // And the sidebar agrees with it rather than with the stored field.
  expect(out.sidebar).toBe(out.real);

  await app.close();
});

/* THE HOSTEL'S OWN LOGO. Stored in the database, so it travels in the backup;
   downscaled on the way in, because the database is one JSON document rewritten
   on every save and a phone photograph would be re-serialised on every
   keystroke of every form in the app. */
test('an uploaded logo is downscaled, stored, and drawn', async () => {
  const { app, win } = await launch();

  const out = await win.evaluate(async () => {
    // A 900x600 image, well over the 256px cap.
    const src = document.createElement('canvas');
    src.width = 900; src.height = 600;
    const g = src.getContext('2d');
    g.fillStyle = '#123456'; g.fillRect(0, 0, 900, 600);
    const blob = await new Promise(r => src.toBlob(r, 'image/png'));
    const file = new File([blob], 'logo.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('hi-logo-file');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 1200));

    const stored = DB.settings.logo || '';
    const dims = await new Promise(res => {
      if (!stored) return res({ w: 0, h: 0 });
      const im = new Image();
      im.onload = () => res({ w: im.width, h: im.height });
      im.onerror = () => res({ w: -1, h: -1 });
      im.src = stored;
    });
    return {
      isData: stored.slice(0, 14),
      dims,
      drawn: !!document.querySelector('.hi-logo.has-img img'),
    };
  });

  expect(out.isData).toBe('data:image/png');
  expect(Math.max(out.dims.w, out.dims.h)).toBe(256);   // the cap, exactly
  expect(out.dims.w).toBe(256);                          // and the ratio kept
  expect(out.dims.h).toBe(171);
  expect(out.drawn).toBe(true);

  // It reaches the printed header too — the one place a hostel's own mark
  // belongs more than the screen does.
  const inDoc = await win.evaluate(() => {
    const html = exHeaderBand({ title: 'Test' }, 'Test Hostel');
    return { hasLogo: /class="ex-logo"/.test(html), hasProductMark: /ex-mark/.test(html) };
  });
  expect(inDoc.hasLogo).toBe(true);
  expect(inDoc.hasProductMark).toBe(true);   // the product mark is not replaced

  await app.close();
});
