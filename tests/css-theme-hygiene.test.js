// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — theme hygiene, checked against the CSS on disk
//
// The owner's standing complaint, 2026-09-08: "remember the light/dark mode
// issues you always make". They are right that it is always the same handful,
// and they are always the same SHAPE — which means they can be checked instead
// of remembered.
//
// This runs in plain Node in about a second, so it can be run before anything
// is even launched. `theme-parity.spec.js` covers what a token RESOLVES to at
// runtime; this covers what the stylesheets SAY, which is where the mistake is
// actually made.
//
// Run: npm run test:theme
//
// ── THE FOUR SHAPES ─────────────────────────────────────────────────────────
//
//  1. WHITE INK ON AN ACCENT FILL. Dark mode lifts `--accent` to #4E7DFF,
//     where white measures 3.68:1 — under AA. `--text-on-accent` exists for
//     exactly this and is #FFFFFF in light, near-black in dark. On 2026-09-08
//     there were 43 rules doing it by hand, in 12 files.
//
//  2. A RAW HEX IN A RENDERER COMPONENT. CLAUDE.md's rule, with one documented
//     exception: the print and PDF documents, which render in a window with no
//     stylesheet and must NOT follow the app's theme onto a sheet of paper.
//
//  3. A COLOUR DECLARED IN ONE THEME BLOCK ONLY. A token given a value under
//     `body.light-theme` but never in the dark palette (or the reverse) falls
//     back to the other theme's value — which is how `--accent-100` painted
//     every focus ring in the app white for months.
//
//  4. A `var()` ALIAS DECLARED ON `:root`. A custom property whose value is a
//     var() is substituted WHERE IT IS DECLARED, so an alias on :root freezes
//     the dark value and light mode inherits it. This is the trap that made
//     the primary button 3.77:1 in light, and it caught `--text-link` again on
//     2026-09-08.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

const CSS_DIR = path.join(__dirname, '..', 'renderer');
/* RECURSIVE since 2026-09-16: the design-spec tokens and base live in
   renderer/css/ (HOSTYLLO_DESIGN_SPEC Part 5). vendor/ holds only the bundled
   @font-face file and is not scanned. */
const files = (function walk(dir, pre) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory()
      ? (e.name === 'vendor' ? [] : walk(path.join(dir, e.name), pre + e.name + '/'))
      : (e.name.endsWith('.css') ? [pre + e.name] : []));
})(CSS_DIR, '');

let passed = 0;
const problems = [];

function ok(cond, what, detail) {
  if (cond) { passed++; console.log('  ok    ' + what); return; }
  process.exitCode = 1;
  console.log('  FAIL  ' + what);
  if (detail) String(detail).split('\n').forEach(l => console.log('          ' + l));
  problems.push(what);
}

/** Every `selector { body }` pair in a stylesheet, comments stripped.
 *
 *  COMMENTS ARE STRIPPED FIRST, and that is not a nicety. Several files in
 *  this repo document a bug by QUOTING the CSS that caused it — including
 *  braces — so anything that reasons about structure here has to remove them
 *  or it will count a comment as a rule. That mistake deleted a paragraph out
 *  of dashboard.css on 2026-09-07. */
function rules(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const sel = m[1].trim().split('\n').pop().trim();
    out.push({ sel, body: m[2] });
  }
  return out;
}

const read = f => fs.readFileSync(path.join(CSS_DIR, f), 'utf8');

console.log('\n── 1. white ink on an accent fill ' + '─'.repeat(28));

const ACCENT_BG = /background(-color)?\s*:\s*[^;]*var\(\s*--(accent|accent-strong|accent-600|accent-700|sb-active|sb-avatar)\s*\)/;
const LITERAL_WHITE = /color\s*:\s*#(fff|ffffff)\b/i;

const whiteOnAccent = [];
for (const f of files) {
  for (const r of rules(read(f))) {
    if (ACCENT_BG.test(r.body) && LITERAL_WHITE.test(r.body)) {
      whiteOnAccent.push(f + '  ' + r.sel);
    }
  }
}
ok(whiteOnAccent.length === 0,
   'no rule paints a literal white on an accent fill (use --text-on-accent)',
   whiteOnAccent.join('\n'));

console.log('\n── 2. a var() alias declared on :root ' + '─'.repeat(24));

/* `:root` is the DARK context in this app — `body.light-theme` is a child. An
   alias declared on :root therefore resolves against the dark palette once,
   and light mode inherits the finished dark colour. Colour aliases must be
   restated inside each palette. Non-colour aliases (a radius, a font) are
   fine, because they are the same in both themes by design. */
const COLOUR_NAME = /(colou?r|accent|bg|background|border|surface|text|ink|shadow|fill|hue|link|brand|danger|success|warning|info|green|red|amber|blue|teal|purple|gray|grey)/i;

/* An alias on :root is only a bug if LIGHT MODE NEVER RESTATES IT. Most of the
   aliases here are restated inside `body.light-theme`, which is what makes
   them resolve correctly; the handful that are not are the ones that freeze.
   Checking for the alias alone flags 25 correct declarations and trains the
   reader to ignore the output. */
const tokensCss = read('css/tokens.css');
/* Across EVERY stylesheet, not just tokens.css: the cascade is global, and
   `style.css` restates --red / --green / --amber / --text3 in its own
   `body.light-theme` block. Looking in one file reported those four as frozen
   when they resolve correctly. */
const restatedInLight = new Set();
for (const f of files) {
  for (const n of declaredIn(read(f), 'body.light-theme')) restatedInLight.add(n);
}

const frozen = [];
for (const f of files) {
  const text = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while ((i = text.indexOf(':root', i)) !== -1) {
    const open = text.indexOf('{', i);
    const close = text.indexOf('}', open);
    if (open !== -1 && close !== -1 && /^[\s,]*$/.test(text.slice(i + 5, open))) {
      for (const line of text.slice(open + 1, close).split(';')) {
        const d = /^\s*(--[A-Za-z0-9_-]+)\s*:\s*var\(\s*(--[A-Za-z0-9_-]+)/.exec(line);
        if (!d || !COLOUR_NAME.test(d[1])) continue;
        if (restatedInLight.has(d[1])) continue;    // resolved per theme, fine
        frozen.push(f + '  ' + d[1] + ': var(' + d[2] + ')');
      }
    }
    i += 5;
  }
}
ok(frozen.length === 0,
   'no colour alias on :root is left un-restated by the light palette',
   frozen.join('\n') +
   (frozen.length ? '\n\nEach of these freezes the DARK value; light mode then\n' +
                    'inherits it. Restate the alias inside body.light-theme too.' : ''));

console.log('\n── 3. a colour declared in one theme only ' + '─'.repeat(20));

/* Collect the custom properties declared inside each palette block and compare
   the two sets. A colour in one and not the other is a token that falls back
   to the other theme's value — which is what `--accent-100` did. */
function declaredIn(text, selector) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set();
  /* Every block whose selector list contains this selector, found by scanning
     for the token and reading to the next closing brace.

     NOT a regex anchored on the preceding `}`: in tokens.css nearly every
     block is preceded by a long explanatory comment, and once comments are
     stripped the anchor stops matching. That version found ONE of the two
     palettes and reported the other's tokens as missing — a check that
     silently matches nothing is worse than no check at all. */
  let i = 0;
  while ((i = clean.indexOf(selector, i)) !== -1) {
    const open = clean.indexOf('{', i);
    const close = clean.indexOf('}', open);
    const between = open === -1 ? 'x' : clean.slice(i + selector.length, open);
    // Guard against matching the name inside a longer selector or a value.
    if (open !== -1 && close !== -1 && /^[\s,]*$/.test(between)) {
      for (const d of clean.slice(open + 1, close).split(';')) {
        const n = /^\s*(--[A-Za-z0-9_-]+)\s*:/.exec(d);
        if (n) names.add(n[1]);
      }
    }
    i += selector.length;
  }
  return names;
}

/* Only tokens.css declares the two palettes; the screen sheets legitimately
   define local values (e.g. chrome.css's --sb-* family) in one block. */

const inLight = declaredIn(tokensCss, 'body.light-theme');
const inDark  = declaredIn(tokensCss, ':root');
const lightOnly = [...inLight].filter(n => COLOUR_NAME.test(n) && !inDark.has(n));
ok(lightOnly.length === 0,
   'every colour the light palette declares is also declared for dark',
   lightOnly.join('\n'));

console.log('\n── 4. raw hex outside the print documents ' + '─'.repeat(20));

/* The count, not the presence: this app has a long tail of legacy hex and
   fixing all of it is its own piece of work. What matters is that it does not
   GROW. The ceiling is the count on 2026-09-08, after the 43 above were
   repointed — raise it only with a reason, never to make a run go green. */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
let hexCount = 0;
const perFile = {};
for (const f of files) {
  const body = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
  const n = (body.match(HEX) || []).length;
  if (n) { perFile[f] = n; hexCount += n; }
}
const HEX_CEILING = 370;   // actual on 2026-09-08: 357
ok(hexCount <= HEX_CEILING,
   'raw hex count has not grown past its ceiling (' + hexCount + ' <= ' + HEX_CEILING + ')',
   Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 8)
     .map(([f, n]) => '  ' + f + ': ' + n).join('\n'));

console.log('\n' + passed + ' checks passed'
  + (problems.length ? ' — ' + problems.length + ' FAILED' : ''));
