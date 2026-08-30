/* ─── HOSTYLLO — LOGO PIPELINE ───────────────────────────────────────────────
   Turns the owner's supplied artwork into the assets the app and the installer
   need, so the brand mark is generated from ONE source file rather than a set
   of hand-exported images that drift apart.

     node scripts/make-logo.js [source.png]

   WHY THE SOURCE CANNOT BE USED AS-IS

   `logo 20.png` is 247x199 black artwork on a SOLID WHITE background — zero
   transparent pixels. Dropped onto the navy sidebar or the dark login screen it
   renders as a white rectangle with a logo in it. It is also not square, so it
   cannot become a Windows icon without being letterboxed.

   HOW THE BACKGROUND IS REMOVED

   Not by keying out pure white, which leaves a hard white fringe wherever the
   artwork was antialiased. Instead alpha is taken FROM LUMINANCE: a white pixel
   becomes fully transparent, a black pixel fully opaque, and the grey pixels
   along every curved edge become proportionally translucent — which is exactly
   what an antialiased edge is. The result composites cleanly onto any colour.

   The ink is then re-stated as flat black, so the mark stays crisp instead of
   inheriting the grey it was averaged with.

   WHAT IT WRITES

     assets/logo-wordmark.png   the full lockup, trimmed, transparent
     assets/logo-mark.png       just the H, square, for tight spaces
     assets/icon.png            512x512 square app icon source
     assets/icon.ico            multi-size Windows icon (16..256)

   No dependencies: PNG decode/encode is done here with zlib, because adding an
   image library to a no-build-step app to run one script would be a worse
   trade than eighty lines of format code.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'OneDrive', 'Desktop', 'logo 20.png');
const OUT = path.join(__dirname, '..', 'assets');

// ── PNG decode (RGBA8 only, which is what the source is) ────────────────────
function decodePNG(buf) {
  const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);
  const depth = buf[24], ct = buf[25];
  if (depth !== 8 || (ct !== 6 && ct !== 2))
    throw new Error('expected 8-bit RGB or RGBA, got depth ' + depth + ' colorType ' + ct);
  const ch = ct === 6 ? 4 : 3;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.slice(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * ch;
  const img = Buffer.alloc(H * stride);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++];
    const line = raw.slice(p, p + stride); p += stride;
    const prev = y > 0 ? img.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = img.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += Math.floor((a + b) / 2);
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  // Normalise to RGBA.
  if (ch === 4) return { W, H, px: img };
  const px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = img[i * 3]; px[i * 4 + 1] = img[i * 3 + 1];
    px[i * 4 + 2] = img[i * 3 + 2]; px[i * 4 + 3] = 255;
  }
  return { W, H, px };
}

// ── PNG encode ──────────────────────────────────────────────────────────────
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(W, H, px) {
  const stride = W * 4;
  const raw = Buffer.alloc(H * (stride + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0;                       // filter: none
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Operations ──────────────────────────────────────────────────────────────

/* White -> transparent, via luminance. See the header: this is what keeps
   antialiased edges clean instead of leaving a white halo. */
function keyOutWhite(img) {
  const { W, H, px } = img;
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let alpha = Math.round(255 - lum);
    if (a < 255) alpha = Math.round(alpha * (a / 255));
    out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0;   // flat black ink
    out[i * 4 + 3] = alpha < 6 ? 0 : alpha;                    // clamp dust to 0
  }
  return { W, H, px: out };
}

/** Bounding box of everything with meaningful alpha. */
function bbox(img, x0, y0, x1, y1) {
  const { W, px } = img;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (px[(y * W + x) * 4 + 3] > 24) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('image is entirely transparent');
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Rows that contain no ink — used to find where the H ends and the text starts. */
function inkRows(img) {
  const { W, H, px } = img;
  const rows = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 24) n++;
    rows[y] = n;
  }
  return rows;
}

function crop(img, r) {
  const out = Buffer.alloc(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++)
    img.px.copy(out, y * r.w * 4, ((r.y + y) * img.W + r.x) * 4, ((r.y + y) * img.W + r.x + r.w) * 4);
  return { W: r.w, H: r.h, px: out };
}

/* Resize. The two directions need different filters and the source forces both:
   the artwork's H is only 60x69, so every icon at 16-64px is a DOWNSCALE (box
   filter, averaging — correct, and crisp) while 128/256/512 are UPSCALES.

   Box-filtering an upscale degenerates to nearest-neighbour, which left visibly
   stepped diagonals on the H. Bilinear is used above 1:1 instead: still soft,
   because no filter invents detail the 60px source never had, but smooth rather
   than blocky. The taskbar sizes are the crisp ones, which is where the icon is
   actually read. */
function resize(img, nw, nh) {
  if (nw > img.W || nh > img.H) return resizeBilinear(img, nw, nh);
  return resizeBox(img, nw, nh);
}

function resizeBilinear(img, nw, nh) {
  const out = Buffer.alloc(nw * nh * 4);
  const sx = img.W / nw, sy = img.H / nh;
  const at = (x, y) => img.px[((Math.min(img.H - 1, Math.max(0, y)) * img.W) +
                                Math.min(img.W - 1, Math.max(0, x))) * 4 + 3];
  for (let y = 0; y < nh; y++) {
    const fy = (y + 0.5) * sy - 0.5, y0 = Math.floor(fy), wy = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = (x + 0.5) * sx - 0.5, x0 = Math.floor(fx), wx = fx - x0;
      const a = at(x0, y0) * (1 - wx) * (1 - wy) + at(x0 + 1, y0) * wx * (1 - wy)
              + at(x0, y0 + 1) * (1 - wx) * wy + at(x0 + 1, y0 + 1) * wx * wy;
      const i = (y * nw + x) * 4;
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0;
      out[i + 3] = Math.round(a);
    }
  }
  return { W: nw, H: nh, px: out };
}

function resizeBox(img, nw, nh) {
  const out = Buffer.alloc(nw * nh * 4);
  const sx = img.W / nw, sy = img.H / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < img.H; yy++)
        for (let xx = x0; xx < x1 && xx < img.W; xx++) { a += img.px[(yy * img.W + xx) * 4 + 3]; n++; }
      const i = (y * nw + x) * 4;
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0;
      out[i + 3] = n ? Math.round(a / n) : 0;
    }
  }
  return { W: nw, H: nh, px: out };
}

/** Centre on a square canvas with a margin, so the icon has breathing room. */
function square(img, size, marginPct) {
  const inner = Math.round(size * (1 - marginPct * 2));
  const scale = Math.min(inner / img.W, inner / img.H);
  const w = Math.max(1, Math.round(img.W * scale)), h = Math.max(1, Math.round(img.H * scale));
  const small = resize(img, w, h);
  const out = Buffer.alloc(size * size * 4);
  const ox = Math.round((size - w) / 2), oy = Math.round((size - h) / 2);
  for (let y = 0; y < h; y++)
    small.px.copy(out, ((oy + y) * size + ox) * 4, y * w * 4, (y + 1) * w * 4);
  return { W: size, H: size, px: out };
}

/* ICO with PNG payloads. Windows has accepted PNG-compressed icon entries
   since Vista, so this is valid for every OS this app targets — including the
   Windows 8 build. A 256px entry MUST be stored as 0 in the size byte. */
function encodeICO(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  const blobs = images.map(im => encodePNG(im.W, im.H, im.px));
  let offset = 6 + dir.length;
  images.forEach((im, i) => {
    const o = i * 16;
    dir[o] = im.W >= 256 ? 0 : im.W;
    dir[o + 1] = im.H >= 256 ? 0 : im.H;
    dir[o + 2] = 0; dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32BE(0, o + 8); dir.writeUInt32LE(blobs[i].length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += blobs[i].length;
  });
  return Buffer.concat([head, dir, ...blobs]);
}

// ── Run ─────────────────────────────────────────────────────────────────────
if (!fs.existsSync(SRC)) { console.error('source not found: ' + SRC); process.exit(1); }
const src = keyOutWhite(decodePNG(fs.readFileSync(SRC)));
console.log('source', src.W + 'x' + src.H, '->', path.basename(SRC));

const full = bbox(src, 0, 0, src.W, src.H);
const lockup = crop(src, full);

/* Split the lockup: the H sits above the wordmark, separated by the widest
   blank band in the upper half. Found rather than hardcoded, so a re-export of
   the artwork at another size still splits correctly. */
const rows = inkRows(lockup);
let gapStart = -1, gapLen = 0, bestStart = -1, bestLen = 0;
for (let y = 0; y < Math.floor(lockup.H * 0.7); y++) {
  if (rows[y] === 0) { if (gapStart < 0) { gapStart = y; gapLen = 0; } gapLen++; }
  else { if (gapLen > bestLen) { bestLen = gapLen; bestStart = gapStart; } gapStart = -1; gapLen = 0; }
}
if (gapLen > bestLen) { bestLen = gapLen; bestStart = gapStart; }

let mark = lockup;
if (bestStart > 0 && bestLen >= 2) {
  mark = crop(lockup, bbox(lockup, 0, 0, lockup.W, bestStart));
  console.log('mark split at row', bestStart, '(gap of', bestLen + 'px)');
} else {
  console.log('no clear gap found — using the whole lockup as the mark');
}

/* Two destinations, on purpose.

   assets/  is what electron-builder reads for the executable, installer and
   taskbar icon. The renderer never loads from there.

   renderer/img/brand/ is what the UI loads. It could reach ../assets with a
   relative path, but keeping the renderer's own images inside renderer/ means
   every path in the HTML stays relative to the document with no traversal out
   of the bundle — which is one less thing to be wrong once it is inside an
   asar archive. Both are generated from the same source in the same run, so
   they cannot drift. */
const RENDER_OUT = path.join(__dirname, '..', 'renderer', 'img', 'brand');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RENDER_OUT, { recursive: true });
const write = (name, buf) => {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('  wrote assets/' + name, '(' + buf.length + ' bytes)');
};
const writeUI = (name, buf) => {
  fs.writeFileSync(path.join(RENDER_OUT, name), buf);
  console.log('  wrote renderer/img/brand/' + name, '(' + buf.length + ' bytes)');
};

/* The ink is black, and the navigation rail is navy in both themes — a black
   mark on it is invisible. A white variant is generated from the same alpha
   rather than shipped as a second hand-made file, so the two can never differ
   in shape. Only the RGB changes; the alpha, and therefore every antialiased
   edge, is identical. */
function inked(img, r, g, b) {
  const out = Buffer.from(img.px);
  for (let i = 0; i < img.W * img.H; i++) { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; }
  return { W: img.W, H: img.H, px: out };
}

write('logo-wordmark.png', encodePNG(lockup.W, lockup.H, lockup.px));
write('logo-mark.png', encodePNG(mark.W, mark.H, mark.px));

const lockupLight = inked(lockup, 255, 255, 255);
const markLight   = inked(mark, 255, 255, 255);
write('logo-wordmark-light.png', encodePNG(lockupLight.W, lockupLight.H, lockupLight.px));
write('logo-mark-light.png', encodePNG(markLight.W, markLight.H, markLight.px));

// The same four, where the UI loads them from.
writeUI('wordmark.png',       encodePNG(lockup.W, lockup.H, lockup.px));
writeUI('wordmark-light.png', encodePNG(lockupLight.W, lockupLight.H, lockupLight.px));
writeUI('mark.png',           encodePNG(mark.W, mark.H, mark.px));
writeUI('mark-light.png',     encodePNG(markLight.W, markLight.H, markLight.px));

const icon512 = square(mark, 512, 0.10);
write('icon.png', encodePNG(512, 512, icon512.px));
write('icon.ico', encodeICO([16, 24, 32, 48, 64, 128, 256].map(s => square(mark, s, 0.10))));

console.log('\nlockup', lockup.W + 'x' + lockup.H, '| mark', mark.W + 'x' + mark.H);
console.log('done.');
