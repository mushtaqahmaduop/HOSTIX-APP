// ════════════════════════════════════════════════════════════════════════════
// Theme parity — the two themes must actually be two themes.
//
// This exists because of a bug that was invisible to every other kind of test.
// A custom property declared as `var(--other)` is substituted WHERE IT IS
// DECLARED. The aliases were declared on :root; the light palette is declared
// on body.light-theme, one level below. So the aliases resolved once, against
// the DARK palette, and light mode inherited the finished dark value.
//
// Nothing looked broken. The app booted, every screen rendered, all 79 specs
// passed, and light mode quietly painted its primary button in the dark lift
// #4B7BFF at 3.77:1 — below WCAG AA — instead of #2451D6 at 6.52:1.
//
// So this spec asserts the two things that would have caught it:
//   1. a colour token must not resolve to the SAME value in both themes;
//   2. the pairs a user actually reads must clear AA, in BOTH themes.
//
// It reads getComputedStyle on BODY, not on documentElement. The theme class
// lives on body, and :root is its parent — measuring the parent is how the
// original audit initially missed this and reported both themes as identical.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

/* Colour tokens. Each must differ between themes — a ground, an ink or a hue
   that is identical in both is a token that stopped being themed. */
const MUST_DIFFER = [
  '--surface', '--surface-muted', '--surface-sunken', '--surface-border', '--surface-divider',
  '--text-primary', '--text-secondary', '--text-tertiary', '--muted',
  '--bg', '--bg2', '--bg3', '--card', '--card2', '--border', '--border2',
  '--accent', '--accent-600', '--accent-700', '--primary',
  '--danger-fg', '--success-fg', '--warning-fg', '--info-fg',
  '--background', '--surface-secondary', '--border-token',
  '--success', '--danger', '--warning', '--sidebar-bg',
  /* THE LEGACY SET, AND THE REASON THIS LIST IS NOT JUST THE PRETTY NAMES.
     --text3 is used 552 times against --text-tertiary's 5; --green 128 against
     --success-fg's 7; --amber 49 against --warning-fg's 8. When the semantic
     tokens were corrected for contrast and these were not, this spec went green
     over a live, app-wide AA failure — it was checking the names the design
     system wished were in use. A parity spec must track what renders. */
  '--text3', '--text2', '--green', '--amber', '--red', '--teal', '--blue', '--purple',
];

/* The opposite error. Shape, type and spacing are NOT themed — if one of these
   ever differs, a theme block has picked up something that is not a colour. */
const MUST_MATCH = [
  '--font', '--font-mono', '--font-display', '--font-sans',
  '--radius', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl',
  '--fs-body', '--fs-label', '--text-xs', '--text-sm', '--text-base',
  '--space-1', '--space-2', '--space-4',
];

/* Pairs a warden reads. `big` marks text at or above ~18.5px, which AA allows
   at 3:1; everything else is body copy and needs 4.5:1. */
const CONTRAST = [
  { fg: '--text-primary',   bg: '--surface', min: 4.5, what: 'primary text on a card' },
  { fg: '--text-secondary', bg: '--surface', min: 4.5, what: 'secondary text on a card' },
  { fg: '--text-tertiary',  bg: '--surface', min: 4.5, what: 'metadata on a card' },
  { fg: '--text-primary',   bg: '--bg',      min: 4.5, what: 'primary text on the workspace' },
  { fg: '--accent',         bg: '--surface', min: 4.5, what: 'accent text on a card' },
  { fg: '--danger-fg',      bg: '--surface', min: 4.5, what: 'an overdue figure on a card' },
  { fg: '--success-fg',     bg: '--surface', min: 4.5, what: 'a settled figure on a card' },
  { fg: '--warning-fg',     bg: '--surface', min: 4.5, what: 'an amount due on a card' },
  { fg: '--info-fg',        bg: '--surface', min: 4.5, what: 'an informational figure on a card' },

  /* The WORKSPACE ground, not the card. Every one of these is a step darker
     against #F5F6F9 than against #FFFFFF, and measuring only the card is how
     three tokens passed review and still failed in the app: --text-tertiary
     was 3.09:1 on a card and 2.86:1 on the ground it actually sits on. */
  { fg: '--text-secondary', bg: '--bg',      min: 4.5, what: 'secondary text on the workspace' },
  { fg: '--text-tertiary',  bg: '--bg',      min: 4.5, what: 'metadata on the workspace' },
  { fg: '--success-fg',     bg: '--bg',      min: 4.5, what: 'a settled figure on the workspace' },
  { fg: '--warning-fg',     bg: '--bg',      min: 4.5, what: 'an amount due on the workspace' },
  { fg: '--danger-fg',      bg: '--bg',      min: 4.5, what: 'an overdue figure on the workspace' },
  { fg: '--accent',         bg: '--bg',      min: 4.5, what: 'accent text on the workspace' },

  /* The legacy names, on both grounds. These are the ones that actually paint. */
  { fg: '--text2',  bg: '--surface', min: 4.5, what: 'secondary text (--text2) on a card' },
  { fg: '--text3',  bg: '--surface', min: 4.5, what: 'metadata (--text3) on a card' },
  { fg: '--text3',  bg: '--bg',      min: 4.5, what: 'metadata (--text3) on the workspace' },
  { fg: '--green',  bg: '--surface', min: 4.5, what: 'a paid figure (--green) on a card' },
  { fg: '--green',  bg: '--bg',      min: 4.5, what: 'a paid figure (--green) on the workspace' },
  { fg: '--amber',  bg: '--surface', min: 4.5, what: 'a pending figure (--amber) on a card' },
  { fg: '--amber',  bg: '--bg',      min: 4.5, what: 'a pending figure (--amber) on the workspace' },
  { fg: '--red',    bg: '--surface', min: 4.5, what: 'an overdue figure (--red) on a card' },
  { fg: '--red',    bg: '--bg',      min: 4.5, what: 'an overdue figure (--red) on the workspace' },
  { fg: '--teal',   bg: '--surface', min: 4.5, what: 'a transfer figure (--teal) on a card' },
  { fg: '--teal',   bg: '--bg',      min: 4.5, what: 'a transfer figure (--teal) on the workspace' },
  { fg: '--blue',   bg: '--surface', min: 4.5, what: 'an info figure (--blue) on a card' },
  { fg: '--purple', bg: '--surface', min: 4.5, what: 'a purple-coded figure on a card' },
];

/* White label on the filled primary button — the exact pair that was failing. */
const ON_ACCENT = { fg: '--text-on-accent', bg: '--accent', min: 4.5,
                    what: 'the label on a filled primary button' };

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env };
}

// ── Colour maths, run in Node so a broken page cannot fake a pass ───────────
function parse(c, over) {
  c = String(c || '').trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    const [r, g, b] = p;
    const a = p.length > 3 ? p[3] : 1;
    // A translucent token is only readable over something. Composite it.
    if (a < 1 && over) {
      const o = parse(over);
      if (o) return [0, 1, 2].map(i => Math.round(p[i] * a + o[i] * (1 - a)));
    }
    return [r, g, b];
  }
  return null;
}
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function ratio(fg, bg) {
  const f = parse(fg, bg), b = parse(bg);
  if (!f || !b) return null;
  const lum = ([r, g, bl]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  const l1 = lum(f), l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('both themes resolve independently, and both are readable', async () => {
  test.setTimeout(180000);
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
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

  const ALL = [...MUST_DIFFER, ...MUST_MATCH, '--text-on-accent'];
  // BODY, not documentElement — the theme class is on body.
  const read = names => {
    const cs = getComputedStyle(document.body);
    const out = {};
    for (const n of names) out[n] = cs.getPropertyValue(n).trim();
    return out;
  };


  /* ── The RENDERED button, not the token ─────────────────────────────────
     Injected into #content so it inherits the app's real cascade, then read
     back with getComputedStyle. A gradient fill is also a failure: it makes
     background-color transparent, so no contrast can be computed against it,
     and this design system does not permit gradients on a control. */
  const probeBtn = async () => win.evaluate(() => {
    const host = document.getElementById('content') || document.body;
    let b = document.getElementById('__parity_btn');
    if (!b) {
      b = document.createElement('button');
      b.id = '__parity_btn';
      b.className = 'btn btn-primary';
      b.textContent = 'Post payment';
      host.appendChild(b);
    }
    const cs = getComputedStyle(b);
    return { color: cs.color, bg: cs.backgroundColor, bgImage: cs.backgroundImage,
             textShadow: cs.textShadow };
  });

  // The app restores a saved theme on boot, so neither state may be assumed.
  /* `no-transition` is the app's OWN class for exactly this (style.css) — the
     tokens carry a 0.15s background/color transition, and toggling the theme
     class directly bypasses the guard that toggleTheme() applies. Reading
     without it samples a colour MID-ANIMATION: the first version of this probe
     measured the button at rgb(61,108,241) on rgb(98,102,109) — 1.27:1 — which
     is not a state the app is ever in, only a frame between two that it is. */
  await win.evaluate(() => document.body.classList.add('no-transition'));

  await win.evaluate(() => document.body.classList.remove('light-theme'));
  await win.waitForTimeout(400);
  const dark = await win.evaluate(read, ALL);
  const darkBtn = await probeBtn();

  await win.evaluate(() => document.body.classList.add('light-theme'));
  await win.waitForTimeout(400);
  const light = await win.evaluate(read, ALL);
  const lightBtn = await probeBtn();

  await app.close();

  const rendered = [];
  for (const [theme, b] of [['dark', darkBtn], ['light', lightBtn]]) {
    if (b.bgImage && b.bgImage !== 'none') {
      rendered.push(`${theme}: .btn-primary is painted with a gradient (${b.bgImage.slice(0, 60)}…) — ` +
        'no contrast can be measured against it, and the system forbids it');
      continue;
    }
    if (b.textShadow && b.textShadow !== 'none') {
      rendered.push(`${theme}: .btn-primary has a text-shadow (${b.textShadow}) — decoration, not hierarchy`);
    }
    const r = ratio(b.color, b.bg);
    if (r === null) { rendered.push(`${theme}: could not read .btn-primary colours (${b.color} on ${b.bg})`); continue; }
    if (r < 4.5) {
      rendered.push(`${theme}: the RENDERED .btn-primary label is ${b.color} on ${b.bg} = ` +
                    `${r.toFixed(2)}:1, needs 4.5:1`);
    }
  }

  // ── 1. Nothing unset ──────────────────────────────────────────────────────
  const unset = ALL.filter(n => !dark[n] || !light[n]);
  expect(unset, 'these tokens resolve to nothing at all').toEqual([]);

  // ── 2. Colour tokens must differ ──────────────────────────────────────────
  const frozen = MUST_DIFFER.filter(n => dark[n] === light[n])
    .map(n => `${n} is ${dark[n]} in BOTH themes`);
  expect(frozen,
    'a colour token identical in both themes has stopped being themed — the usual\n' +
    'cause is an alias declared on :root whose target is overridden on body').toEqual([]);

  // ── 3. Shape and type must NOT differ ─────────────────────────────────────
  const drifted = MUST_MATCH.filter(n => dark[n] !== light[n])
    .map(n => `${n}: dark ${dark[n]} vs light ${light[n]}`);
  expect(drifted, 'shape, type and spacing are not themed').toEqual([]);

  // ── 4. Both themes readable ───────────────────────────────────────────────
  const fails = [];
  for (const [theme, vals] of [['dark', dark], ['light', light]]) {
    for (const c of [...CONTRAST, ON_ACCENT]) {
      const r = ratio(vals[c.fg], vals[c.bg]);
      if (r === null) { fails.push(`${theme}: could not read ${c.fg} on ${c.bg}`); continue; }
      if (r < c.min) {
        fails.push(`${theme}: ${c.what} — ${vals[c.fg]} on ${vals[c.bg]} = ` +
                   `${r.toFixed(2)}:1, needs ${c.min}:1`);
      }
    }
  }
  expect(fails, 'every pair a warden reads must clear WCAG AA in both themes').toEqual([]);

  expect(rendered,
    'A TOKEN IS NOT A PIXEL. The checks above read token VALUES; these read what\n' +
    'an actual .btn-primary element resolves to after the whole cascade.\n\n' +
    'That distinction is not academic — it is the bug this block was added for.\n' +
    '--text-on-accent was fixed to near-black in dark mode, the token check went\n' +
    'green, and the real button stayed white-on-#4B7BFF at 3.77:1, because THREE\n' +
    'rules defined .btn-primary and the winner (chrome.css, loaded last) hardcoded\n' +
    'color:#fff. A token nothing reads is decoration.').toEqual([]);
});
