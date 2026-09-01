#!/usr/bin/env node
/* ─── HOSTYLLO — SINGLE-FILE WEB BUNDLE ───────────────────────────────────────
   Folds renderer/index.html and everything it links into ONE self-contained
   HTML file, so the UI can be opened in an ordinary browser — a phone, a
   tablet, a machine with no installer — for review.

   THIS IS A PREVIEW BUILD, NOT THE PRODUCT. Read this before showing anyone:

     • No Electron, so `window.electronAPI` is undefined and storage.js takes
       its documented "browser dev mode" branch — data goes to localStorage,
       not SQLite. It lives in that one browser on that one device.
     • Anything behind IPC is therefore inert: backup/restore to a file, PDF
       export, print, Excel import, the licence check (license.js logs
       "electronAPI not available — skipping" and lets the UI through).
     • A fresh browser gets a fresh install: username `warden1`, password
       `admin123`, and the 42 demo rooms the app seeds on first boot.

   The licence gate being skipped is the reason this must never be published
   anywhere a customer could reach it. It is a screenshot you can tap, nothing
   more.

   Usage:
     node scripts/build-web-bundle.js [--out FILE] [--standalone]

     --out FILE     where to write (default: dist-web/hostyllo-preview.html)
     --title TEXT   override the <title> (an artifact gallery shows it as the
                    page's name, where index.html's
                    "HOSTYLLO | Hostel Management System" reads as a caption)
     --standalone   emit a complete document with <!doctype>/<html>/<head>.
                    Default emits body-level content only (title + styles +
                    markup + scripts), which is what an Artifact host wants —
                    it supplies the document skeleton itself.

   ICON FONT — the one thing worth knowing about size:
   renderer/vendor/fonts/material-symbols-rounded.woff2 is 5.3 MB, the entire
   Material Symbols set. The app draws its icons as inline Lucide SVG
   (src/icons.js) and uses the FONT for exactly eight ligatures — close,
   delete, history, payments, person, person_add, print, save — across 14
   call sites. Base64 inflates the 5.3 MB to ~7.1 MB of the bundle.

   If a subset exists next to the original as `material-symbols-rounded.subset.woff2`
   this script uses it instead. Build one (10 KB, same eight icons) with:

     pip install fonttools brotli
     # resolve the 8 ligature glyphs, then:
     pyftsubset renderer/vendor/fonts/material-symbols-rounded.woff2 \
       --glyphs-file=keep.txt --no-layout-closure \
       --layout-features=liga,calt,rlig --flavor=woff2 \
       --output-file=renderer/vendor/fonts/material-symbols-rounded.subset.woff2

   The subset file is intentionally NOT committed — it is a preview artefact,
   and the shipped app keeps the full font.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'renderer');

const args       = process.argv.slice(2);
const standalone = args.includes('--standalone');
const outIdx     = args.indexOf('--out');
const titleIdx   = args.indexOf('--title');
const TITLE      = titleIdx > -1 ? args[titleIdx + 1] : null;
const OUT        = outIdx > -1 && args[outIdx + 1]
  ? path.resolve(args[outIdx + 1])
  : path.join(ROOT, 'dist-web', 'hostyllo-preview.html');

const MIME = {
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

let inlined = 0, bytesIn = 0;

function dataURI(file) {
  const buf = fs.readFileSync(file);
  bytesIn += buf.length;
  const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Rewrite url(...) references in a stylesheet to data: URIs. */
function inlineCssUrls(css, cssFile) {
  const dir = path.dirname(cssFile);
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, q, ref) => {
    if (/^(data:|https?:|\/\/)/i.test(ref)) return whole;   // already inline or remote
    let target = path.resolve(dir, ref.split(/[?#]/)[0]);

    // Prefer a pre-built subset of the icon font when one is sitting next to it.
    if (path.basename(target) === 'material-symbols-rounded.woff2') {
      const subset = target.replace(/\.woff2$/, '.subset.woff2');
      if (fs.existsSync(subset)) target = subset;
    }
    if (!fs.existsSync(target)) {
      console.warn('  ! missing asset, left as-is:', ref);
      return whole;
    }
    inlined++;
    return `url(${dataURI(target)})`;
  });
}

// ── Split BEFORE inlining ────────────────────────────────────────────────────
// index.html has to be cut into <head> and <body> while it is still the
// original file. Once the vendor bundles and app.js are inlined the document
// contains their source, and app.js (3x) and xlsx.full.min.js (1x) each carry
// a literal `</head>` and `</body>` inside the print/export markup they build
// as strings — so a regex run over the ASSEMBLED file closes the head on
// SheetJS's string and silently drops two megabytes of stylesheet and script.
// That produced a bundle that loaded to a blank page. Cut first, inline after.
const source = fs.readFileSync(path.join(RENDERER, 'index.html'), 'utf8');
const headRaw = (source.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [, ''])[1];
const bodyRaw = (source.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, ''])[1];
if (!headRaw || !bodyRaw) throw new Error('could not split renderer/index.html into head and body');

/** Fold every local stylesheet, image and script reference into the fragment. */
function inlineAll(frag) {
  // Stylesheets → <style>
  frag = frag.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (whole, href) => {
      if (/^(https?:)?\/\//i.test(href)) return whole;
      const file = path.join(RENDERER, href);
      if (!fs.existsSync(file)) { console.warn('  ! missing stylesheet:', href); return whole; }
      inlined++;
      return `<style data-src="${href}">\n${inlineCssUrls(fs.readFileSync(file, 'utf8'), file)}\n</style>`;
    }
  );

  // <img src> → data URI. MUST run before the script pass: half the modules
  // build markup as template strings, so `<img src="${photo}">` appears in
  // inlined JS and this regex would otherwise chew on it.
  frag = frag.replace(/(<img\b[^>]*\bsrc=)["']([^"']+)["']/gi, (whole, pre, src) => {
    if (/^(data:|https?:|\/\/)/i.test(src)) return whole;
    const file = path.join(RENDERER, src);
    if (!fs.existsSync(file)) { console.warn('  ! missing image:', src); return whole; }
    inlined++;
    return `${pre}"${dataURI(file)}"`;
  });

  // Scripts → inline. `defer` is dropped deliberately: every <script src> in
  // index.html sits in document order and app.js is the last node before
  // </body>, so inlining in place preserves both the order and the
  // fully-parsed DOM that `defer` was buying. Wrapping it in a
  // DOMContentLoaded callback would be worse — it would put app.js's top-level
  // functions inside a closure where the inline onclick= handlers in the
  // markup can no longer see them.
  frag = frag.replace(
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    (whole, pre, src, post) => {
      if (/^(https?:)?\/\//i.test(src)) return whole;
      const file = path.join(RENDERER, src);
      if (!fs.existsSync(file)) { console.warn('  ! missing script:', src); return whole; }
      inlined++;
      const code = fs.readFileSync(file, 'utf8');
      bytesIn += Buffer.byteLength(code);
      // A literal </script> inside the source would close this tag early.
      return `<script data-src="${src}">\n${code.replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
    }
  );
  return frag;
}

const head = inlineAll(headRaw);
const body = inlineAll(bodyRaw);

// ── Shape the output ─────────────────────────────────────────────────────────
let html;
if (standalone) {
  html = `<!DOCTYPE html>\n<html lang="en">\n<head>${head}</head>\n<body>${body}</body>\n</html>\n`;
} else {
  // Artifact hosts supply <!doctype>/<html>/<head>/<body> themselves and want
  // body-level content only. Keep <title> — it names the tab — and keep the
  // <style>/<script> blocks that were in <head>; both are legal in <body>.
  // The host's own <head> already carries charset and viewport.
  html = `${head.replace(/<meta\b[^>]*>/gi, '')}\n${body}`;
}

if (TITLE) html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${TITLE}</title>`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

const mb = n => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log(`  inlined ${inlined} files (${mb(bytesIn)} of source)`);
console.log(`  wrote   ${OUT} — ${mb(Buffer.byteLength(html))}${standalone ? '' : ' (body-level, for an artifact host)'}`);
