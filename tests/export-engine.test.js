// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the global export engine
//
// Students, Payments, Expenses, Rooms, Cancellations, Complaints, Reports, the
// Annual Archive and the user list all export through ONE engine now
// (src/export/engine.js + src/export/xlsx-writer.js). This test holds the
// engine to the export specification directly, without Electron: the parts of
// that specification that can actually be wrong are properties of the produced
// FILE, and a Playwright test that clicks a button proves only that a file
// arrived.
//
// What is guarded here, and why each one is a real failure mode:
//
//   §9/§28  A table that runs onto a second page must repeat its column
//           headings — on paper (thead as a header group) and in Excel
//           (_xlnm.Print_Titles). Page 2 of a roster with no headings is a
//           column of names nobody can read.
//   §24     Frozen panes on the ACTUAL header row. This is the reason the
//           SheetJS community build could not be used: it cannot write them.
//   §27     A4, fit-to-width 1 and fit-to-height 0. Fitting the HEIGHT to one
//           page shrinks a 200-row register to nothing.
//   §62     Amounts are numbers and dates are dates — but a phone number is
//           TEXT, because 03310045835 stored as a number comes back as
//           3,310,045,835 with its leading zero gone.
//   §42     An empty export is still a document that says what was asked for.
//   §5/§13  Orientation follows the columns. A wide table goes landscape
//           instead of shrinking the type until it cannot be read.
//   §49     A user-typed value is escaped. One raw ampersand from a warden's
//           description makes Excel call the whole workbook corrupt.
//
// Run: npm run test:export
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const zlib = require('zlib');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'renderer', 'src', 'export');

let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('  FAIL  ' + msg); process.exitCode = 1; }
  else { passed++; console.log('  ok    ' + msg); }
}

/* ── The engine, outside the browser ─────────────────────────────────────────
   Both files are classic scripts sharing ONE global lexical scope in the
   renderer, which is how engine.js reaches xlsx-writer.js's `const HXW`.
   vm.runInContext gives each script its own lexical scope, so they are
   concatenated here — that is what reproduces the browser rather than
   inventing a module boundary the shipped app does not have. */
function loadEngine(stubs) {
  const ctx = Object.assign({
    console, Blob: global.Blob, TextEncoder, Response,
    CompressionStream: global.CompressionStream,
    Date, Math, JSON, Number, String, Object, Array, Map, Set, isFinite, parseInt,
    module: { exports: {} },
  }, stubs);
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = ['xlsx-writer.js', 'engine.js']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(';\n')
    + ';\nglobalThis.EXPORT = EXPORT; globalThis.HXW = HXW; globalThis._xwSerial = _xwSerial;';
  vm.runInContext(src, ctx, { filename: 'export-bundle.js' });
  return ctx;
}

const ctx = loadEngine({
  DB: { settings: { hostelName: 'Test Hostel' } },
  escHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtPKR: n => 'PKR ' + Number(n || 0).toLocaleString('en-PK'),
  today: () => '2026-09-07',
  toast: () => {},
});

/* Read our own zip back. Walking the local headers is enough — this reader
   only ever sees files this writer produced. */
function unzip(bytes) {
  const buf = Buffer.from(bytes);
  const out = {};
  let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method  = buf.readUInt16LE(i + 8);
    const csize   = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extLen  = buf.readUInt16LE(i + 28);
    const name    = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const start   = i + 30 + nameLen + extLen;
    const body    = buf.slice(start, start + csize);
    out[name] = (method === 8 ? zlib.inflateRawSync(body) : body).toString('utf8');
    i = start + csize;
  }
  return out;
}

// ── A definition with one of everything ─────────────────────────────────────
const rows = [];
for (let i = 1; i <= 42; i++) {
  rows.push({
    room: i <= 40 ? String(i) : 'A 0' + (i - 40),
    name: i === 3 ? 'Ali & Sons <b>x</b>' : 'Student ' + i,
    charge: 14500,
    paid: i % 3 === 0 ? 0 : 14500,
    method: 'Cash',
    status: i % 3 === 0 ? 'Pending' : 'Paid',
    date: '2026-09-0' + ((i % 9) + 1),
    phone: '03310045835',
  });
}

const wideDef = {
  module: 'Payments',
  title: 'Payment Register',
  scope: 'September 2026',
  sheet: 'Payments',
  filters: [['Month', 'September 2026'], ['Status', null]],
  summary: [{ label: 'Payments', value: '42' }],
  columns: [
    { label: 'Room',    type: 'id',     width: 9,  value: r => r.room },
    { label: 'Student', type: 'text',   width: 24, value: r => r.name },
    { label: 'Month',   type: 'text',   width: 16, value: () => 'September 2026' },
    { label: 'Charge',  type: 'money',  width: 14, total: 'sum', value: r => r.charge },
    { label: 'Paid',    type: 'money',  width: 14, total: 'sum', value: r => r.paid || null },
    { label: 'Phone',   type: 'text',   width: 16, pdf: false, value: r => r.phone },
    { label: 'Method',  type: 'text',   width: 13, value: r => r.method },
    { label: 'Status',  type: 'status', width: 11, value: r => r.status },
    { label: 'Date',    type: 'date',   width: 13, value: r => r.date },
  ],
  rows,
  grand: { label: 'Collected', value: 'PKR 406,000' },
  empty: 'No payment records match the selected filters.',
};

(async () => {
  console.log('\n── the PDF document ──────────────────────────────────────────');
  const doc = ctx.EXPORT.document(wideDef);

  ok(doc.landscape === true, '§5 nine columns choose the long edge of the paper');
  ok(/@page\{size:A4 landscape/.test(doc.html), '§5 the page is A4 landscape');
  ok(/margin:9mm 9mm 14mm/.test(doc.html), '§6 landscape margins are inside the print-safe band');
  ok(doc.html.includes('thead{display:table-header-group}'),
     '§9 column headings repeat on every printed page');
  ok(doc.html.includes('tr{break-inside:avoid'), '§10 a record is never split across pages');
  ok(/font-size:9pt/.test(doc.html), '§14 body type is at the specification floor, not below it');
  ok(doc.html.includes('HOSTYLLO') && doc.html.includes('Hostel Management System'),
     '§7 the header band identifies the product');
  ok(doc.html.includes('Test Hostel'), '§4 …and the hostel');
  ok(doc.html.includes('Month: September 2026'), '§16 the active filters are stated');
  ok(doc.html.includes('This is a computer generated document'), '§8 the closing statement');
  ok(doc.html.includes('&lt;b&gt;x&lt;/b&gt;') && !doc.html.includes('<b>x</b>'),
     'a warden-typed tag is escaped, not rendered');
  ok(!/<thead>[\s\S]*?Phone[\s\S]*?<\/thead>/.test(doc.html),
     '§33 an Excel-only column stays out of the printed page');
  ok(doc.filename === 'Hostyllo_Payments_September-2026_2026-09-07.pdf',
     '§32 the filename is predictable: ' + doc.filename);

  const narrow = ctx.EXPORT.document({
    module: 'Room', title: 'Room Record',
    columns: wideDef.columns.slice(0, 3), rows: rows.slice(0, 2),
  });
  ok(narrow.landscape === false, '§5 a narrow table stays portrait');

  const forced = ctx.EXPORT.document(Object.assign({}, wideDef, { orientation: 'portrait' }));
  ok(forced.landscape === false, 'a module may override the orientation deliberately');

  console.log('\n── the workbook ──────────────────────────────────────────────');
  const parts = unzip(await ctx.HXW.build(ctx.EXPORT.workbook(wideDef)));
  const sheet = parts['xl/worksheets/sheet1.xml'];
  const book  = parts['xl/workbook.xml'];

  ok(!!parts['[Content_Types].xml'] && !!parts['xl/styles.xml'] && !!sheet,
     'the workbook has the parts Excel requires');
  ok(/<pane [^>]*ySplit="\d+"[^>]*state="frozen"/.test(sheet), '§24 the header row is frozen');
  ok(/<autoFilter ref="A\d+:I\d+"\/>/.test(sheet), '§25 the data carries an autofilter');
  ok(/paperSize="9"/.test(sheet) && /orientation="landscape"/.test(sheet), '§27 A4, landscape');
  ok(/fitToWidth="1" fitToHeight="0"/.test(sheet),
     '§27 fit to ONE page wide and as many as it takes tall');
  ok(/_xlnm.Print_Titles/.test(book), '§28 the column headings repeat on every printed page');
  ok(/_xlnm.Print_Area/.test(book), '§30 the print area is exactly the export');
  ok(/Page &amp;P of &amp;N/.test(sheet), '§31 the printed footer carries a page number');
  ok(/<oddHeader>[^<]*HOSTYLLO/.test(sheet), '§31 …and the header carries the product');

  // Freeze must sit on the row the header was actually written to (§24).
  const ySplit = Number(/ySplit="(\d+)"/.exec(sheet)[1]);
  const headerRow = (function () {
    const m = /<row r="(\d+)"[^>]*ht="26"/.exec(sheet);
    return m ? Number(m[1]) : -1;
  })();
  ok(ySplit === headerRow, '§24 the frozen row IS the table header (' + ySplit + ')');

  /* ── THE OPERATIONAL SHEET (owner brief, 2026-09-10) ─────────────────────
     "Do NOT create a large vertical report header or stacked KPI cards … the
     table must appear near the top of the worksheet so the user gets maximum
     usable viewport", and the summary as "ordinary cells in the upper-right".

     It was six band lines plus a stacked label/value row for EVERY summary
     figure — seventeen rows of chrome on the student sheet before the first
     heading, on a document somebody opens to scroll a register. Each of these
     is one line of that brief, and each was a real property of the file. */
  console.log('\n── the operational spreadsheet ───────────────────────────────');
  ok(headerRow === 5,
     'the table header is row 5: three band rows, one spacer, then the columns ('
     + headerRow + ')');
  ok(ySplit === 5, '…and only the header is frozen, not the branding above it');
  ok(/showGridLines="1"/.test(sheet), 'gridlines are visible');
  ok(/borderId="1"/.test(parts['xl/styles.xml']),
     '…and the table carries its own borders as well, so a copied block keeps them');
  /* The summary is on rows 1 and 2, out to the right of the identity band —
     labels above figures, in cells a formula can reference. */
  const row1 = /<row r="1"[^>]*>([\s\S]*?)<\/row>/.exec(sheet)[1];
  const row2 = /<row r="2"[^>]*>([\s\S]*?)<\/row>/.exec(sheet)[1];
  ok(/<c r="I1"[\s\S]*?Payments<\/t>/.test(row1),
     'the summary LABEL sits in the upper right, not in a stack down column A');
  ok(/<c r="I2"[\s\S]*?>42</.test(row2), '…with its figure directly under it');
  ok(!/<row r="[6-9]"[^>]*>[\s\S]*?Payments<\/t>[\s\S]*?<\/row>/.test(sheet),
     '…and nothing restates it below the table header');

  ok(/<c r="D\d+" s="12"><v>14500<\/v><\/c>/.test(sheet),
     '§62 an amount is a NUMBER, not the string "PKR 14,500"');
  /* Rs., not PKR, since the owner's brief of 2026-09-10 — "Rs. is preferred for
     this operational Pakistani hostel spreadsheet". What this check is really
     about is unchanged and is the line above it: the currency lives in the
     number FORMAT, so the cell still holds 17000 and still sums. */
  ok(/&quot;Rs\.&quot;/.test(parts['xl/styles.xml']),
     '§18 …and the currency lives in the number format, where it can still be summed');
  ok(/<c r="I\d+" s="15"><v>462\d\d<\/v>/.test(sheet),
     '§62 a date is a real Excel date, not the string it was typed as');
  ok(/<c r="F\d+" s="8" t="inlineStr"><is><t xml:space="preserve">03310045835<\/t>/.test(sheet),
     '§62 a phone stays TEXT and keeps its leading zero');
  ok(/<f>SUM\(D\d+:D\d+\)<\/f>/.test(sheet), '§64 a total is a formula, not a frozen number');
  ok(/Ali &amp; Sons/.test(sheet), 'an ampersand is escaped rather than corrupting the file');
  ok(/<col min="1" max="1" width="9"/.test(sheet) && /<col min="2" max="2" width="24"/.test(sheet),
     '§12/§26 columns are sized by what they hold, not uniformly');
  ok(/FF155EEF/.test(parts['xl/styles.xml']), '§23 the header band is Hostyllo blue');

  console.log('\n── the empty export (§42) ────────────────────────────────────');
  const emptyDef = Object.assign({}, wideDef, { rows: [] });
  const edoc = ctx.EXPORT.document(emptyDef);
  ok(edoc.html.includes('No payment records match the selected filters.'),
     'the page explains that nothing matched');
  ok(edoc.html.includes('Month: September 2026'), '…and still states what was asked for');
  const eparts = unzip(await ctx.HXW.build(ctx.EXPORT.workbook(emptyDef)));
  ok(eparts['xl/worksheets/sheet1.xml'].includes('No payment records match'),
     'the workbook explains it too, rather than being a blank sheet');
  ok(!/<autoFilter/.test(eparts['xl/worksheets/sheet1.xml']),
     'and it does not filter a table that has no rows');

  console.log('\n── a sectioned export (§39/§40) ──────────────────────────────');
  const multi = {
    module: 'Annual-Archive', title: 'Annual Archive', scope: '2026',
    sheetPerSection: true,
    sections: [
      { title: 'Students', columns: wideDef.columns.slice(0, 3), rows: rows.slice(0, 4) },
      { title: 'Payments', columns: wideDef.columns, rows: rows },
      { title: 'Expenses', columns: wideDef.columns.slice(0, 4), groupLabel: 'Category',
        groups: [{ label: 'Electricity', rows: rows.slice(0, 2),
                   total: { label: 'Total', value: 'PKR 2' } },
                 { label: 'Cleaning', rows: rows.slice(2, 4),
                   total: { label: 'Total', value: 'PKR 2' } }] },
      { title: 'Cancellations', columns: wideDef.columns.slice(0, 3), rows: [],
        empty: 'None this year.' },
    ],
  };
  const mdoc = ctx.EXPORT.document(multi);
  ok((mdoc.html.match(/<h2>/g) || []).length === 4, '§39 four sections on one document');
  ok(mdoc.html.includes('None this year.'), 'an empty section still says so');
  ok((mdoc.html.match(/class="group__t"/g) || []).length === 2,
     '§35 a grouped section prints a table per group');

  const mspec = ctx.EXPORT.workbook(multi);
  ok(mspec.sheets.map(s => s.name).join(',') === 'Students,Payments,Expenses,Cancellations',
     '§39 the workbook puts each section on its own sheet');
  const mparts = unzip(await ctx.HXW.build(mspec));
  ok(mparts['xl/worksheets/sheet3.xml'].includes('Category'),
     'a grouped section becomes a real Category COLUMN in the workbook, not headings');
  ok(/_xlnm.Print_Titles" localSheetId="3"/.test(mparts['xl/workbook.xml']),
     'every sheet repeats its own headings, not just the first');

  console.log('\n── formatting rules (§17, §18, §48) ──────────────────────────');
  ok(ctx.EXPORT.fmt.date('2026-09-07') === '07-Sep-2026', '§17 one date format');
  ok(ctx.EXPORT.fmt.date('') === '—', '§48 a missing value is one em dash');
  ok(/^07-Sep-2026, \d{2}:\d{2} [AP]M$/.test(ctx.EXPORT.fmt.stamp(new Date(2026, 8, 7, 1, 25))),
     '§17 the generated stamp: ' + ctx.EXPORT.fmt.stamp(new Date(2026, 8, 7, 1, 25)));
  ok(ctx.EXPORT.fmt.money(1250000) === 'PKR 1,250,000', '§18 one currency shape');
  ok(ctx.EXPORT.fileName({ module: 'Annual Archive', scope: '2026' }, 'xlsx')
       === 'Hostyllo_Annual-Archive_2026_2026-09-07.xlsx', '§32 the workbook filename');

  console.log('\n── a sheet name Excel would refuse ───────────────────────────');
  const namedParts = unzip(await ctx.HXW.build(ctx.EXPORT.workbook({
    module: 'X', title: 'T', sheet: 'Payments/2026: a very long name indeed [draft]',
    columns: wideDef.columns, rows: rows.slice(0, 2),
  })));
  const sheetName = /<sheet name="([^"]*)"/.exec(namedParts['xl/workbook.xml'])[1];
  ok(sheetName.length <= 31 && !/[\\\/\?\*\[\]:]/.test(sheetName),
     'an illegal sheet name is corrected rather than producing a file that will not open: '
     + sheetName);
  // A name with a space has to be quoted inside a defined name, and the quote
  // is an XML apostrophe entity by the time it reaches the file.
  ok(namedParts['xl/workbook.xml'].indexOf('&apos;' + sheetName + '&apos;!$') !== -1,
     '…and the defined names quote the CORRECTED name, or the headings quietly stop repeating');

  /* ── A DATE LANDS ON ITS OWN DAY ────────────────────────────────────────
     Excel stores a date as a serial counted from 1899-12-30, and a UTC-based
     conversion puts 2007-03-01 on 28-Feb for every reader east of Greenwich —
     which is where this app is used. _xwSerial() computes from the LOCAL
     calendar parts for exactly that reason, and it had no test of its own:
     students-export.spec.js asserted it through a Date of Birth column, and
     that column left the roster when the owner's sheet arrived on 2026-09-10.
     It is asserted here now, on the function, where it does not depend on any
     register happening to have a date column. */
  console.log('\n── a date keeps its own day ──────────────────────────────');
  {
    const serial = ctx._xwSerial('2007-03-01');
    // 1899-12-30 + 39142 days = 2007-03-01. A UTC-shifted answer is 39141.
    ok(serial === 39142, 'a YYYY-MM-DD date converts to its own local day: ' + serial);
    const back = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    ok(back.getUTCMonth() === 2 && back.getUTCDate() === 1,
       '…and reads back as 01-Mar, not the 28-Feb a UTC parse lands on');
    // A Date object takes the same path, from its local parts.
    ok(ctx._xwSerial(new Date(2007, 2, 1)) === 39142,
       '…and a Date object converts to the same day as its string');
  }

  console.log('\n' + passed + ' checks passed'
    + (process.exitCode ? ' — WITH FAILURES' : ''));
})();
