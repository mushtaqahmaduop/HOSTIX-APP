/* ─── HOSTYLLO — XLSX WRITER ──────────────────────────────────────────────────
   Writes a real .xlsx (Office Open XML) workbook from a plain description
   object. No dependency, no network, no build step — it emits the OOXML parts
   as strings and zips them in the browser.

   WHY THIS EXISTS AND SHEETJS DOES NOT DO IT
   ------------------------------------------
   `vendor/js/xlsx.full.min.js` is the SheetJS *community* build. It writes
   values, column widths, merges and autofilters, and nothing else: cell styles,
   frozen panes and the whole page-setup block are the paid build's features.
   The export specification treats four of those as non-negotiable — a branded
   header row (§23), frozen panes (§24), A4 + fit-to-width print configuration
   (§27) and column headings that repeat on every printed page (§28) — so a
   workbook written by the community build cannot satisfy it however the caller
   is written.

   The parts emitted here are the minimum Excel needs, in the order the schema
   demands. Element order inside <worksheet> is NOT free: a file that puts
   <autoFilter> before <sheetData> opens as "unreadable content".

   SheetJS is still loaded and still used — the Settings screen READS uploaded
   .xlsx files with it. This module only writes.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── ZIP ──────────────────────────────────────────────────────────────────────
   An .xlsx is a ZIP of XML. Only one direction is needed (write) and only one
   feature set (no encryption, no zip64), which is about a hundred lines.

   Entries are DEFLATE-compressed through CompressionStream where the runtime
   has it — Electron 43 does — and stored uncompressed where it does not. A
   10,000-row register is ~20 MB of XML and well under 2 MB deflated; stored it
   would still open, but nobody wants to mail that.                           */

const _XW_CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function _xwCrc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _XW_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function _xwDeflate(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const w  = cs.writable.getWriter();
    w.write(bytes); w.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) { return null; }   // stored is always a valid fallback
}

/* MS-DOS date/time, which is what a ZIP directory stores. Excel ignores it;
   Windows Explorer shows it on the entries inside the file. */
function _xwDosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
}
function _xwDosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
}

function _xwU8(str) { return new TextEncoder().encode(str); }

/* files: [{ name, data:Uint8Array }] -> Uint8Array holding a complete ZIP. */
async function _xwZip(files) {
  const now   = new Date();
  const time  = _xwDosTime(now), date = _xwDosDate(now);
  const local = [];         // local headers + payloads, in order
  const dir   = [];         // central directory records
  let offset  = 0;

  for (const f of files) {
    const nameBytes  = _xwU8(f.name);
    const raw        = f.data;
    const crc        = _xwCrc32(raw);
    const packed     = await _xwDeflate(raw);
    const useDeflate = !!packed && packed.length < raw.length;
    const body       = useDeflate ? packed : raw;
    const method     = useDeflate ? 8 : 0;

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);            // version needed to extract
    lh.setUint16(6, 0x0800, true);        // UTF-8 filename flag
    lh.setUint16(8, method, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    local.push(new Uint8Array(lh.buffer), nameBytes, body);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);            // version made by
    cd.setUint16(6, 20, true);            // version needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    dir.push(new Uint8Array(cd.buffer), nameBytes);

    offset += 30 + nameBytes.length + body.length;
  }

  const dirBytes = dir.reduce((n, b) => n + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8,  files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, dirBytes, true);
  eocd.setUint32(16, offset, true);

  const chunks = local.concat(dir, [new Uint8Array(eocd.buffer)]);
  const total  = chunks.reduce((n, b) => n + b.length, 0);
  const out    = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/* ── XML helpers ───────────────────────────────────────────────────────────── */

/* Everything written into an XML text node goes through this. A warden may
   type "Ali & Sons <urgent>" into a description, and one raw ampersand makes
   the whole workbook unreadable — Excel reports the FILE as corrupt, not the
   cell. Control characters below 0x20 are illegal in XML 1.0 outside tab, CR
   and LF, and pasted data does carry them, so they are dropped, not escaped. */
function _xwEsc(s) {
  return String(s == null ? '' : s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/* 1 -> A, 27 -> AA. Column letters, one-based. */
function _xwCol(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}
function _xwRef(row, col) { return _xwCol(col) + row; }

/* A Date (or 'YYYY-MM-DD') -> the Excel serial number.

   Excel's zero is 1899-12-30, an artefact of the 1900 leap year it believes in
   and history does not. The serial is computed from the LOCAL calendar parts:
   five hours east of Greenwich a UTC-based conversion lands a join date on the
   day before, which is the bug fmtDate() already had to fix once. */
function _xwSerial(v) {
  let y, m, d, hh = 0, mm = 0, ss = 0;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate();
    hh = v.getHours(); mm = v.getMinutes(); ss = v.getSeconds();
  } else {
    const t = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v || ''));
    if (!t) return null;
    y = +t[1]; m = +t[2]; d = +t[3]; hh = +(t[4] || 0); mm = +(t[5] || 0); ss = +(t[6] || 0);
  }
  const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  return days + (hh * 3600 + mm * 60 + ss) / 86400;
}

/* ── STYLES ───────────────────────────────────────────────────────────────────
   styles.xml is one flat table of formatting records that cells index into.
   The palette is the export design system's (§3) with no local invention, and
   every colour is written ARGB because that is what OOXML stores.

   Style slots are named rather than numbered at the call site: HXW.S.MONEY
   reads as a decision, `s="14"` reads as a magic number, and the numbers move
   whenever a slot is inserted.                                              */

const XW_PALETTE = {
  blue:      'FF155EEF',
  blueDark:  'FF123B8F',
  ink:       'FF172B4D',
  muted:     'FF64748B',
  border:    'FFD9E2F2',
  soft:      'FFF8FAFD',
  white:     'FFFFFFFF',
  positive:  'FF087443',
  warning:   'FFA15C00',
  danger:    'FFB42318',
};

/* Number formats. Ids below 164 are Excel's built-ins; custom formats must
   start at 164. The money format carries the currency inside the FORMAT, not
   inside the value — §62's whole point is that the cell holds 17000 and can be
   summed, while the sheet still reads "PKR 17,000". */
/* Rs., NOT PKR, IN THE WORKBOOK (owner brief, 2026-09-10: "Rs. is preferred
   for this operational Pakistani hostel spreadsheet"). It is the number FORMAT
   that changes, not the value: the cell still holds 17000 and still sums,
   sorts and filters as a number. A currency written into the string — "Rs.
   17,000" — is the thing this format exists to prevent. */
/* TWO DECIMALS, AND NO CURRENCY IN THE CELL (owner, 2026-09-10: "format the
   money as 17000.00" and "if heading uses Rs or PKR then do not again mention
   it with the money in that column"). Every money column's heading now names
   the currency, so repeating it 200 times down the column is 200 copies of a
   fact stated once — and it is the widest thing in a sixteen-column sheet.

   WITH A THOUSANDS SEPARATOR (owner, 2026-09-10: "use thousand separator").
   It was `0.00` for a day because the brief wrote the format out twice without
   one; asked directly, the grouping is wanted. Excel groups by the FORMAT, so
   the cell still holds a plain 17000 and still sums, sorts and filters.

   AN EMPTY MONEY CELL IS 0.00, not blank (owner: "put 0.00 in the cells for
   numbers if empty"). It costs the SUM nothing — a blank and a zero add the
   same — and it removes the reading where a gap might mean "not recorded". */
const XW_NUMFMT = {
  164: '#,##0.00',
  165: '#,##0.00;[Red]-#,##0.00',
  166: 'dd\\-mmm\\-yyyy',
  167: '#,##0',
  168: '0.0%',
  169: 'dd\\-mmm\\-yyyy\\ hh:mm\\ AM/PM',
};

/* Fonts, fills and borders, then the cellXfs records that combine them.
   Written out longhand: this file is read far more often than it is changed,
   and a generated style table is unreadable in a diff. */
function _xwStylesXml() {
  const fonts = [
    // 0 body
    '<font><sz val="10"/><name val="Calibri"/><color rgb="' + XW_PALETTE.ink + '"/></font>',
    // 1 document title
    '<font><b/><sz val="16"/><name val="Calibri"/><color rgb="' + XW_PALETTE.blueDark + '"/></font>',
    // 2 section / subtitle
    '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="' + XW_PALETTE.ink + '"/></font>',
    // 3 metadata
    '<font><sz val="9"/><name val="Calibri"/><color rgb="' + XW_PALETTE.muted + '"/></font>',
    // 4 table header — white on blue
    '<font><b/><sz val="10"/><name val="Calibri"/><color rgb="' + XW_PALETTE.white + '"/></font>',
    // 5 bold body (totals)
    '<font><b/><sz val="10"/><name val="Calibri"/><color rgb="' + XW_PALETTE.ink + '"/></font>',
    // 6 positive
    '<font><sz val="10"/><name val="Calibri"/><color rgb="' + XW_PALETTE.positive + '"/></font>',
    // 7 negative
    '<font><sz val="10"/><name val="Calibri"/><color rgb="' + XW_PALETTE.danger + '"/></font>',
    // 8 wordmark
    '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="' + XW_PALETTE.blue + '"/></font>',
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',                   // 0 (required)
    '<fill><patternFill patternType="gray125"/></fill>',                // 1 (required)
    '<fill><patternFill patternType="solid"><fgColor rgb="' + XW_PALETTE.blue + '"/><bgColor indexed="64"/></patternFill></fill>',  // 2 header
    '<fill><patternFill patternType="solid"><fgColor rgb="' + XW_PALETTE.soft + '"/><bgColor indexed="64"/></patternFill></fill>',  // 3 zebra / summary
  ];
  const thin = '<left style="thin"><color rgb="' + XW_PALETTE.border + '"/></left>' +
               '<right style="thin"><color rgb="' + XW_PALETTE.border + '"/></right>' +
               '<top style="thin"><color rgb="' + XW_PALETTE.border + '"/></top>' +
               '<bottom style="thin"><color rgb="' + XW_PALETTE.border + '"/></bottom>';
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',       // 0 none
    '<border>' + thin + '<diagonal/></border>',                          // 1 grid
    '<border><left/><right/><top style="medium"><color rgb="' + XW_PALETTE.blueDark + '"/></top><bottom/><diagonal/></border>', // 2 totals rule
  ];

  /* [numFmtId, fontId, fillId, borderId, alignment] */
  const xf = [
    [0, 0, 0, 0, ''],                                                                  // 0  GENERAL
    [0, 1, 0, 0, ' applyAlignment="1"><alignment vertical="center"/>'],                // 1  TITLE
    [0, 8, 0, 0, ' applyAlignment="1"><alignment vertical="center"/>'],                // 2  WORDMARK
    [0, 2, 0, 0, ' applyAlignment="1"><alignment vertical="center"/>'],                // 3  SUBTITLE
    [0, 3, 0, 0, ' applyAlignment="1"><alignment vertical="center"/>'],                // 4  META
    [0, 4, 2, 1, ' applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/>'],   // 5  HEAD
    [0, 4, 2, 1, ' applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/>'],  // 6  HEAD_R
    [0, 4, 2, 1, ' applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/>'], // 7  HEAD_C
    [0, 0, 0, 1, ' applyAlignment="1"><alignment horizontal="left" vertical="center"/>'],                // 8  TEXT
    [0, 0, 0, 1, ' applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/>'],      // 9  WRAP
    [0, 0, 0, 1, ' applyAlignment="1"><alignment horizontal="center" vertical="center"/>'],              // 10 CENTER
    [167, 0, 0, 1, ' applyAlignment="1"><alignment horizontal="right" vertical="center"/>'],             // 11 NUMBER
    [164, 0, 0, 1, ' applyAlignment="1"><alignment horizontal="right" vertical="center"/>'],             // 12 MONEY
    [165, 7, 0, 1, ' applyAlignment="1"><alignment horizontal="right" vertical="center"/>'],             // 13 MONEY_NEG
    [164, 6, 0, 1, ' applyAlignment="1"><alignment horizontal="right" vertical="center"/>'],             // 14 MONEY_POS
    [166, 0, 0, 1, ' applyAlignment="1"><alignment horizontal="left" vertical="center"/>'],              // 15 DATE
    [169, 0, 0, 1, ' applyAlignment="1"><alignment horizontal="left" vertical="center"/>'],              // 16 DATETIME
    [168, 0, 0, 1, ' applyAlignment="1"><alignment horizontal="right" vertical="center"/>'],             // 17 PERCENT
    [0, 5, 3, 2, ' applyAlignment="1"><alignment horizontal="left" vertical="center"/>'],                // 18 TOTAL_LABEL
    [164, 5, 3, 2, ' applyAlignment="1"><alignment horizontal="right" vertical="center"/>'],             // 19 TOTAL_MONEY
    [167, 5, 3, 2, ' applyAlignment="1"><alignment horizontal="right" vertical="center"/>'],             // 20 TOTAL_NUMBER
    [0, 3, 3, 1, ' applyAlignment="1"><alignment horizontal="left" vertical="center"/>'],                // 21 KPI_LABEL
    [0, 5, 3, 1, ' applyAlignment="1"><alignment horizontal="left" vertical="center"/>'],                // 22 KPI_VALUE
    [164, 5, 3, 1, ' applyAlignment="1"><alignment horizontal="left" vertical="center"/>'],              // 23 KPI_MONEY
  ];

  const xfXml = xf.map(function (r) {
    const attrs = 'numFmtId="' + r[0] + '" fontId="' + r[1] + '" fillId="' + r[2] +
                  '" borderId="' + r[3] + '" xfId="0"' +
                  (r[0] ? ' applyNumberFormat="1"' : '') +
                  (r[1] ? ' applyFont="1"' : '') +
                  (r[2] ? ' applyFill="1"' : '') +
                  (r[3] ? ' applyBorder="1"' : '');
    return r[4] ? '<xf ' + attrs + r[4] + '</xf>' : '<xf ' + attrs + '/>';
  }).join('');

  const numFmts = Object.keys(XW_NUMFMT).map(function (id) {
    return '<numFmt numFmtId="' + id + '" formatCode="' + _xwEsc(XW_NUMFMT[id]) + '"/>';
  }).join('');

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="' + Object.keys(XW_NUMFMT).length + '">' + numFmts + '</numFmts>' +
    '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
    '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
    '<borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + xf.length + '">' + xfXml + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

/* The named slots. Order matches the xf table above. */
const XW_S = {
  GENERAL: 0, TITLE: 1, WORDMARK: 2, SUBTITLE: 3, META: 4,
  HEAD: 5, HEAD_R: 6, HEAD_C: 7,
  TEXT: 8, WRAP: 9, CENTER: 10, NUMBER: 11,
  MONEY: 12, MONEY_NEG: 13, MONEY_POS: 14,
  DATE: 15, DATETIME: 16, PERCENT: 17,
  TOTAL_LABEL: 18, TOTAL_MONEY: 19, TOTAL_NUMBER: 20,
  KPI_LABEL: 21, KPI_VALUE: 22, KPI_MONEY: 23,
};

/* ── CELLS ────────────────────────────────────────────────────────────────────
   A cell is written from { v, t, s }: value, type, style slot.

   Strings go out as inline strings rather than through a shared-string table.
   The table saves space on repetitive data and costs a second pass plus an
   index; these workbooks are written once and read by Excel, and inline is
   what keeps this file short enough to audit.                               */
function _xwCell(row, col, cell) {
  if (cell == null) return '';
  const ref = _xwRef(row, col);
  const s   = cell.s ? ' s="' + cell.s + '"' : '';
  const t   = cell.t || 'text';

  if (t === 'blank' || cell.v == null || cell.v === '') {
    return s ? '<c r="' + ref + '"' + s + '/>' : '';
  }
  if (t === 'number' || t === 'money' || t === 'percent') {
    const n = Number(cell.v);
    if (!isFinite(n)) return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t>' + _xwEsc(cell.v) + '</t></is></c>';
    return '<c r="' + ref + '"' + s + '><v>' + n + '</v></c>';
  }
  if (t === 'date') {
    const n = _xwSerial(cell.v);
    if (n == null) return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t>' + _xwEsc(cell.v) + '</t></is></c>';
    return '<c r="' + ref + '"' + s + '><v>' + n + '</v></c>';
  }
  if (t === 'formula') {
    return '<c r="' + ref + '"' + s + '><f>' + _xwEsc(cell.v) + '</f></c>';
  }
  // Text. `xml:space="preserve"` keeps a leading or trailing space, which an
  // address pasted out of a form very often has.
  return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' +
         _xwEsc(cell.v) + '</t></is></c>';
}

/* ── WORKSHEET ────────────────────────────────────────────────────────────────
   sheet: {
     name, rows:[{ h, cells:[cell|null] }],
     cols:[{ width }],
     freeze:{ row, col },            frozen ABOVE row / LEFT of col (1-based)
     autofilter:{ r1, c1, r2, c2 },
     merges:['A1:H1', ...],
     landscape:bool, fitToWidth:bool,
     printTitleRow:n,                repeated on every printed page
     printArea:{ r1, c1, r2, c2 },
     header:{ left, right }, footer:{ left, right }
   }                                                                         */
function _xwSheetXml(sheet) {
  const rows = sheet.rows || [];
  const maxCol = rows.reduce(function (m, r) { return Math.max(m, (r.cells || []).length); }, 1);
  const dim = 'A1:' + _xwRef(Math.max(1, rows.length), Math.max(1, maxCol));

  const body = rows.map(function (r, i) {
    const n = i + 1;
    const cells = (r.cells || []).map(function (c, j) { return _xwCell(n, j + 1, c); }).join('');
    const attrs = ' r="' + n + '"' + (r.h ? ' ht="' + r.h + '" customHeight="1"' : '') +
                  ' spans="1:' + maxCol + '"';
    return '<row' + attrs + '>' + cells + '</row>';
  }).join('');

  const cols = (sheet.cols && sheet.cols.length)
    ? '<cols>' + sheet.cols.map(function (c, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' +
               (Number(c.width) || 12) + '" customWidth="1"' +
               (c.wrap ? ' style="' + XW_S.WRAP + '"' : '') + '/>';
      }).join('') + '</cols>'
    : '';

  /* Freeze. `ySplit` counts the rows that stay put, so a header on row 5 needs
     ySplit="5" and a top-left of A6 — the pane below is what scrolls. §24 is
     explicit that this must be the ACTUAL table header, not an arbitrary row,
     which is why the caller passes the row it wrote the header on rather than
     a constant. */
  /* GRIDLINES ON (owner brief, 2026-09-10). They were off, which left the
     sheet reading as a printed report that happened to be in Excel. The data
     cells carry their own thin borders as well — the brief asks for explicit
     table borders, and a sheet whose only separation is the application's own
     gridlines loses it the moment somebody turns them off or copies a block
     into another workbook. Both, therefore: the grid for the whole sheet, and
     real borders on the table. */
  let view = '<sheetView workbookViewId="0" showGridLines="1"';
  if (sheet.tabSelected) view += ' tabSelected="1"';
  view += '>';
  if (sheet.freeze && (sheet.freeze.row || sheet.freeze.col)) {
    const fr = sheet.freeze.row || 0, fc = sheet.freeze.col || 0;
    const topLeft = _xwRef(fr + 1, fc + 1);
    const pane = fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight';
    view += '<pane' + (fc ? ' xSplit="' + fc + '"' : '') + (fr ? ' ySplit="' + fr + '"' : '') +
            ' topLeftCell="' + topLeft + '" activePane="' + pane + '" state="frozen"/>' +
            '<selection pane="' + pane + '" activeCell="' + topLeft + '" sqref="' + topLeft + '"/>';
  }
  view += '</sheetView>';

  const af = sheet.autofilter
    ? '<autoFilter ref="' + _xwRef(sheet.autofilter.r1, sheet.autofilter.c1) + ':' +
      _xwRef(sheet.autofilter.r2, sheet.autofilter.c2) + '"/>' : '';

  const merges = (sheet.merges && sheet.merges.length)
    ? '<mergeCells count="' + sheet.merges.length + '">' +
      sheet.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>'
    : '';

  /* §27: A4, orientation chosen by the caller, fit to ONE page WIDE and as
     many pages tall as the data needs. fitToHeight="0" is what says "as many
     as it takes" — setting it to 1 is the mistake the spec calls out, because
     it shrinks a 200-row register until nobody can read it. */
  const setup = '<pageSetup paperSize="9" orientation="' +
    (sheet.landscape ? 'landscape' : 'portrait') + '"' +
    (sheet.fitToWidth === false ? '' : ' fitToWidth="1" fitToHeight="0"') +
    ' horizontalDpi="300" verticalDpi="300"/>';

  const hf = (sheet.header || sheet.footer)
    ? '<headerFooter>' +
      (sheet.header ? '<oddHeader>' + _xwEsc(
          (sheet.header.left  ? '&L' + sheet.header.left  : '') +
          (sheet.header.right ? '&R' + sheet.header.right : '')) + '</oddHeader>' : '') +
      (sheet.footer ? '<oddFooter>' + _xwEsc(
          (sheet.footer.left  ? '&L' + sheet.footer.left  : '') +
          (sheet.footer.right ? '&R' + sheet.footer.right : '')) + '</oddFooter>' : '') +
      '</headerFooter>'
    : '';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="' + dim + '"/>' +
    '<sheetViews>' + view + '</sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    '<sheetData>' + body + '</sheetData>' +
    af + merges +
    '<pageMargins left="0.35" right="0.35" top="0.4" bottom="0.45" header="0.2" footer="0.2"/>' +
    setup + hf +
    '</worksheet>';
}

/* ── WORKBOOK ─────────────────────────────────────────────────────────────────
   Print_Titles and Print_Area are not worksheet properties in OOXML — they are
   workbook-level defined names scoped to a sheet. That is how §28's repeating
   column headings are actually expressed in the file format, and it is also
   why they must be written here rather than next to the sheet they belong to.

   A sheet name containing a space has to be quoted inside a defined name, and
   an apostrophe inside it doubled, or the reference silently does not resolve
   and the headings quietly stop repeating.                                  */
function _xwSheetRef(name) {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : "'" + String(name).replace(/'/g, "''") + "'";
}

function _xwWorkbookXml(sheets) {
  const tabs = sheets.map(function (s, i) {
    return '<sheet name="' + _xwEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
  }).join('');

  const names = [];
  sheets.forEach(function (s, i) {
    const ref = _xwSheetRef(s.name);
    if (s.printTitleRow) {
      names.push('<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' +
        _xwEsc(ref + '!$' + s.printTitleRow + ':$' + s.printTitleRow) + '</definedName>');
    }
    if (s.printArea) {
      const a = s.printArea;
      names.push('<definedName name="_xlnm.Print_Area" localSheetId="' + i + '">' +
        _xwEsc(ref + '!$' + _xwCol(a.c1) + '$' + a.r1 + ':$' + _xwCol(a.c2) + '$' + a.r2) +
        '</definedName>');
    }
  });

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<workbookPr date1904="false"/>' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews>' +
    '<sheets>' + tabs + '</sheets>' +
    (names.length ? '<definedNames>' + names.join('') + '</definedNames>' : '') +
    '<calcPr calcId="191029"/>' +
    '</workbook>';
}

function _xwContentTypes(n) {
  let overrides = '';
  for (let i = 1; i <= n; i++) {
    overrides += '<Override PartName="/xl/worksheets/sheet' + i +
      '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
}

function _xwRootRels() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
}

function _xwWorkbookRels(n) {
  let rels = '';
  for (let i = 1; i <= n; i++) {
    rels += '<Relationship Id="rId' + i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + i + '.xml"/>';
  }
  rels += '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>';
}

/* Document properties. Not decoration: an exported file that reaches an
   accountant three months later should still say what it is and when it was
   made, and Windows shows these in the file's Properties panel. */
function _xwCoreXml(meta) {
  const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + _xwEsc(meta.title || 'Hostyllo Export') + '</dc:title>' +
    '<dc:subject>' + _xwEsc(meta.subject || '') + '</dc:subject>' +
    '<dc:creator>Hostyllo</dc:creator>' +
    '<cp:lastModifiedBy>Hostyllo</cp:lastModifiedBy>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created>' +
    '<dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified>' +
    '</cp:coreProperties>';
}

function _xwAppXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>Hostyllo</Application><Company>Hostyllo</Company>' +
    '</Properties>';
}

/* ── PUBLIC API ───────────────────────────────────────────────────────────────
   HXW.build(spec) -> Uint8Array
   HXW.save(spec, filename) -> downloads it

   Excel forbids : \ / ? * [ ] in a sheet name and caps it at 31 characters. A
   name that breaks either rule produces a file that will not open at all, so
   it is corrected here rather than trusted to every call site.              */
function _xwSafeSheetName(name, used) {
  let n = String(name || 'Sheet').replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31).trim() || 'Sheet';
  let i = 2;
  while (used.indexOf(n) !== -1) { n = (n.slice(0, 28) + ' ' + i).trim(); i++; }
  used.push(n);
  return n;
}

const HXW = {
  S: XW_S,
  PALETTE: XW_PALETTE,
  serial: _xwSerial,
  colLetter: _xwCol,

  async build(spec) {
    const used = [];
    const sheets = (spec.sheets || []).map(function (s) {
      return Object.assign({}, s, { name: _xwSafeSheetName(s.name, used) });
    });
    if (!sheets.length) throw new Error('A workbook needs at least one sheet');
    sheets[0].tabSelected = true;

    const files = [
      { name: '[Content_Types].xml', data: _xwU8(_xwContentTypes(sheets.length)) },
      { name: '_rels/.rels',         data: _xwU8(_xwRootRels()) },
      { name: 'docProps/core.xml',   data: _xwU8(_xwCoreXml(spec.meta || {})) },
      { name: 'docProps/app.xml',    data: _xwU8(_xwAppXml()) },
      { name: 'xl/workbook.xml',     data: _xwU8(_xwWorkbookXml(sheets)) },
      { name: 'xl/_rels/workbook.xml.rels', data: _xwU8(_xwWorkbookRels(sheets.length)) },
      { name: 'xl/styles.xml',       data: _xwU8(_xwStylesXml()) },
    ];
    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: _xwU8(_xwSheetXml(s)) });
    });
    return await _xwZip(files);
  },

  async save(spec, filename) {
    const bytes = await HXW.build(spec);
    const blob  = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    return filename;
  },
};

/* Node runs this file directly in tests/xlsx-writer.test.js — the browser gets
   the globals it declares, and there is no bundler to ask. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HXW, _xwSerial, _xwEsc, _xwCol, _xwZip, XW_S, XW_PALETTE };
}
