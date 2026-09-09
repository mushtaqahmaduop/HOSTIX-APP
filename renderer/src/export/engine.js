/* ─── HOSTYLLO — GLOBAL EXPORT ENGINE ─────────────────────────────────────────
   One export language for every module.

   THE PROBLEM THIS REPLACES
   -------------------------
   Every screen that grew an "Export" grew its own document with it. The
   Cancellations rent summary was violet on navy with emoji headings; the
   Archive hand-rolled six tables and a KPI row; Rooms and Reports emitted CSV
   with no identity on it at all; only Students, Payments and Expenses shared a
   builder, and only for PDF. Held next to each other they did not look like
   one product, and half of them could not tell you which hostel, which month
   or which filter they described.

   THE SHAPE
   ---------
        module  ──►  EXPORT DEFINITION  ──►  ┌── EX.pdf()    ──► A4 document
                     (data + metadata)       └── EX.excel()  ──► .xlsx workbook

   The module owns WHAT: its rows, its columns, its filters, its totals. The
   engine owns HOW: branding, page size, orientation, headers, footers,
   repeated headings, page breaks, number and date formatting, file naming,
   empty states, print configuration. A module that wants a different look is
   almost always a module that has found a gap in here.

   §60 IS THE RULE THAT MATTERS MOST: PDF and Excel are rendered from ONE
   definition. They are allowed to differ in presentation and in which columns
   they carry — a spreadsheet can hold a CNIC column that would not fit a
   printed page — but they may never be built from two datasets, because that
   is how two files exported one second apart end up disagreeing.

   THE DEFINITION
   --------------
   {
     module:   'Payments',            // file naming token, §32
     title:    'Payment Register',    // the document's name
     scope:    'September 2026',      // the period, in words
     filters:  [['Status','Unpaid only'], ['Room','All rooms']],   // §16
     orientation: 'auto'|'portrait'|'landscape',                   // §5
     summary:  [{ label, value, tone }],                           // §15
     columns:  [column],
     rows:     [...]   or   groups: [{ label, meta, rows, total }],
     grand:    { label, value },
     note:     'a closing line',
     empty:    'No payment records match the selected filters.',   // §42
     sections: [ { title, meta, columns, rows|groups, grand, empty } ],
     sheetPerSection: bool            // Excel: one sheet per section, §39
   }

   A COLUMN
   --------
   {
     label:  'Charge / mo',
     type:   'text'|'wrap'|'id'|'number'|'money'|'date'|'datetime'|'status'|'percent',
     value:  row => raw JS value        // the ONE source of truth, §60
     get:    row => HTML                // optional, PDF only, for rich cells
     sub:    row => text                // optional second line in the PDF cell
     width:  18                         // Excel character width
     align:  'left'|'right'|'center'    // defaults from type, §19
     pdf:    false                      // Excel-only column
     excel:  false                      // PDF-only column
     total:  'sum'                      // Excel: a bold sum under the column
   }
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── §3 THE PALETTE ───────────────────────────────────────────────────────────
   Raw hex, deliberately. Design governance forbids hex in a renderer
   component, and exempts the print and PDF documents by name: they render in a
   window with no stylesheet and must not follow the app's dark theme onto a
   sheet of white paper. These are the specification's values, and the same
   ones xlsx-writer.js paints the workbook with — one palette, two renderers. */
const EX_COLOR = {
  blue:     '#155EEF',
  blueDark: '#123B8F',
  blueSoft: '#EEF4FF',
  ink:      '#172B4D',
  muted:    '#64748B',
  faint:    '#94A3B8',
  border:   '#D9E2F2',
  surface:  '#FFFFFF',
  soft:     '#F8FAFD',
  positive: '#087443', positiveSoft: '#EAF8F0',
  warning:  '#A15C00', warningSoft:  '#FFF6E5',
  danger:   '#B42318', dangerSoft:   '#FDECEC',
  neutral:  '#475569', neutralSoft:  '#F1F5F9',
};

/* §48 — one representation for a missing value, everywhere. */
const EX_DASH = '—';

/* ── FORMATTERS (§17, §18, §19, §48) ─────────────────────────────────────────
   One document, one date format. The app's own fmtDate() already produces
   "07 Sep 2026" through en-PK; exports use the hyphenated form the spec names,
   and get it from here so that no module can quietly introduce a second. */
const EXF = {
  date(v) {
    if (!v) return EX_DASH;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return String(d.getDate()).padStart(2, '0') + '-' + M[d.getMonth()] + '-' + d.getFullYear();
  },
  /* "07-Sep-2026, 01:25 AM" — the generated stamp, and the only place a time
     appears in an export. */
  stamp(d) {
    d = d || new Date();
    let h = d.getHours();
    const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return EXF.date(d) + ', ' + String(h).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  },
  /* §18 — "PKR 17,000", one shape, everywhere. This defers to the app's own
     fmtPKR() rather than reimplementing it: a figure on the screen and the
     same figure in the export must be the same string, and two formatters is
     how they stop being. en-PK groups in thousands, which is the shape the
     specification's own examples use. */
  money(n) {
    if (typeof fmtPKR === 'function') return fmtPKR(Math.round(Number(n || 0)));
    const v = Math.round(Number(n || 0));
    return 'PKR ' + (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-PK');
  },
  number(n) { return Number(n || 0).toLocaleString('en-PK'); },
  percent(n) { return (Math.round(Number(n || 0) * 1000) / 10) + '%'; },
  /* A value the module did not supply. Not "N/A", not blank, not "null". */
  text(v) { return (v === 0 ? '0' : (v || '')) === '' ? EX_DASH : String(v); },
};

/* §47 — a status always carries its word. The dot is decoration; remove the
   colour (grayscale printing, a photocopy) and the row still says Overdue. */
const EX_STATUS_TONE = {
  paid: 'pos', active: 'pos', resolved: 'pos', collected: 'pos', confirmed: 'pos',
  completed: 'pos', vacated: 'neutral', settled: 'pos',
  partial: 'warn', pending: 'warn', 'on notice': 'warn', cancelling: 'warn',
  'in progress': 'warn', open: 'warn', notice: 'warn',
  overdue: 'neg', unpaid: 'neg', blacklisted: 'neg', failed: 'neg', rejected: 'neg',
  left: 'neutral', archived: 'neutral', inactive: 'neutral', cancelled: 'neutral',
};
function exStatusTone(s) {
  return EX_STATUS_TONE[String(s || '').trim().toLowerCase()] || 'neutral';
}
const EX_TONE_COLOR = {
  pos:     { fg: EX_COLOR.positive, bg: EX_COLOR.positiveSoft },
  warn:    { fg: EX_COLOR.warning,  bg: EX_COLOR.warningSoft  },
  neg:     { fg: EX_COLOR.danger,   bg: EX_COLOR.dangerSoft   },
  neutral: { fg: EX_COLOR.neutral,  bg: EX_COLOR.neutralSoft  },
};

/* ── §19 ALIGNMENT AND §26 WIDTH, BY TYPE ────────────────────────────────────
   Column width is never uniform (§12): a status column given a name's width
   wastes a third of the page, and an address given a status's width wraps into
   a column of single letters. These are the defaults a column inherits from
   what it holds; any column may override.                                    */
const EX_TYPE = {
  id:       { align: 'left',   width: 8,  pdfWeight: 0.6 },
  text:     { align: 'left',   width: 18, pdfWeight: 1.4 },
  wrap:     { align: 'left',   width: 34, pdfWeight: 2.4 },
  number:   { align: 'right',  width: 11, pdfWeight: 0.8 },
  money:    { align: 'right',  width: 15, pdfWeight: 1.1 },
  date:     { align: 'left',   width: 13, pdfWeight: 0.9 },
  datetime: { align: 'left',   width: 20, pdfWeight: 1.3 },
  status:   { align: 'center', width: 12, pdfWeight: 0.9 },
  percent:  { align: 'right',  width: 10, pdfWeight: 0.7 },
};
function exType(c) { return EX_TYPE[c && c.type] || EX_TYPE.text; }
function exAlign(c) { return c.align || exType(c).align; }

/* ── §5 + §13 ORIENTATION ────────────────────────────────────────────────────
   Portrait is the default, and the wrong answer for most registers. The
   decision is made from what the columns actually hold, not from a habit: sum
   the type weights, and if the table is wider than a portrait page can carry
   at a readable size, turn the paper rather than shrink the type (§14).

   A4 portrait holds roughly 186mm of printable width and landscape 293mm; the
   threshold below is those, expressed in the same weight units the column
   types are scored in. */
function exOrientation(def, columns) {
  if (def.orientation === 'portrait' || def.orientation === 'landscape') {
    return def.orientation === 'landscape';
  }
  const weight = columns.reduce(function (n, c) { return n + (c.pdfWeight || exType(c).pdfWeight); }, 0);
  return weight > 7.2;
}

/* ── §32 FILE NAMES ──────────────────────────────────────────────────────────
   Hostyllo_<Module>_<Scope>_<Date>.<ext>. Predictable enough that a folder of
   them sorts into something a person can read, and never "export (3).xlsx". */
function exSlug(s) {
  return String(s == null ? '' : s)
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function exFileName(def, ext) {
  const parts = ['Hostyllo', exSlug(def.module || def.title || 'Export')];
  const scope = exSlug(def.scope || '');
  if (scope) parts.push(scope);
  parts.push(typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10));
  return parts.filter(Boolean).join('_') + '.' + ext;
}

/* The hostel this export belongs to. Never a hard-coded example name (§4). */
function exHostel() {
  return (typeof DB !== 'undefined' && DB.settings && DB.settings.hostelName) || 'Hostel';
}

/* ── NORMALISATION ───────────────────────────────────────────────────────────
   Everything downstream reads sections-of-groups, so a definition that gives
   plain `rows` and a definition that gives an archive's six sections take the
   same path. Callers write whichever is honest for their screen.            */
function exSections(def) {
  if (def.sections && def.sections.length) {
    return def.sections.map(function (s) {
      return Object.assign({}, s, {
        columns: (s.columns || def.columns || []),
        groups: s.groups || [{ rows: s.rows || [] }],
      });
    });
  }
  return [{
    title: null,
    columns: def.columns || [],
    groups: def.groups || [{ rows: def.rows || [] }],
    grand: def.grand,
    empty: def.empty,
    summary: null,
  }];
}
function exRowCount(sections) {
  return sections.reduce(function (n, s) {
    return n + s.groups.reduce(function (m, g) { return m + (g.rows || []).length; }, 0);
  }, 0);
}
function exPdfColumns(cols) { return cols.filter(function (c) { return c.pdf !== false; }); }
function exXlColumns(cols)  { return cols.filter(function (c) { return c.excel !== false; }); }

/* A cell's raw value, then its printed form. `value` is the contract; `get`
   only decorates. A column that has neither is a column nobody filled in. */
/* THE ROW'S NUMBER IS THE SECOND ARGUMENT (2026-09-10). Both of the owner's
   reference sheets open with a `#` column, and a definition had no way to ask
   for one — it could only count rows itself, which is wrong the moment a
   document has sections or groups. Passing the index is additive: every
   existing `value: row => ...` ignores a second argument. */
function exValue(c, row, i) {
  if (typeof c.value === 'function') return c.value(row, i);
  if (c.key) return row ? row[c.key] : '';
  return '';
}
function exFormat(c, v) {
  const t = c.type || 'text';
  if (v === null || v === undefined || v === '') return EX_DASH;
  if (t === 'money')    return EXF.money(v);
  if (t === 'number')   return EXF.number(v);
  if (t === 'percent')  return EXF.percent(v);
  if (t === 'date')     return EXF.date(v);
  if (t === 'datetime') return EXF.stamp(v instanceof Date ? v : new Date(v));
  return String(v);
}

/* ══ THE PDF DOCUMENT ══════════════════════════════════════════════════════ */

function _exEsc(s) {
  return (typeof escHtml === 'function') ? escHtml(s)
    : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* §7 — the identity band. Hostyllo on the left because that is the product;
   the document and the hostel on the right because that is what the reader is
   holding. The mark is drawn, not linked: an <img> to a file the print window
   cannot resolve leaves a broken icon on a document that goes to an owner. */
/* THE HOSTEL'S OWN LOGO, and only the hostel's. The product mark above is
   drawn rather than linked because an <img> to a file the print window cannot
   resolve leaves a broken icon on a document that goes to an owner — this one
   is exempt because of how it is stored: Settings keeps it in the database as
   a data URI, so it carries no path to resolve and makes no request. It sits
   on the hostel's side of the band, never the product's; the sidebar mark was
   made un-uploadable on purpose (index.html) and this does not walk that back.
   A hostel that has uploaded nothing gets exactly the band it got before. */
function exHostelLogo() {
  try {
    const src = DB && DB.settings && DB.settings.logo;
    if (typeof src !== 'string' || src.slice(0, 11) !== 'data:image/') return '';
    return '<img class="ex-logo" src="' + _exEsc(src) + '" alt="">';
  } catch (e) { return ''; }
}

function exHeaderBand(def, hostel) {
  const logo = exHostelLogo();
  return '' +
  '<header class="ex-head">' +
    '<div class="ex-brand">' +
      '<div class="ex-mark">H</div>' +
      '<div><div class="ex-word">HOSTYLLO</div>' +
      '<div class="ex-tag">Hostel Management System</div></div>' +
    '</div>' +
    '<div class="ex-doc">' +
      '<div class="title">' + _exEsc(def.title || 'Report') + '</div>' +
      '<div class="subtitle">' + _exEsc(hostel) +
        (def.scope ? ' · ' + _exEsc(def.scope) : '') + '</div>' +
    '</div>' +
    (logo ? '<div class="ex-hlogo">' + logo + '</div>' : '') +
  '</header>';
}

/* §16 + §65 — the scope, stated. An export whose filters are invisible is an
   export nobody can audit: a roster of 12 students is either a small hostel or
   a filtered view of a large one, and the file must say which. */
function exMetaStrip(def, hostel, rowCount) {
  const pairs = [
    ['Hostel', hostel],
    ['Report', def.title || 'Report'],
  ];
  if (def.scope) pairs.push(['Period', def.scope]);
  const filters = (def.filters || []).filter(function (f) { return f && f[1]; });
  pairs.push(['Scope', filters.length
    ? filters.map(function (f) { return f[0] + ': ' + f[1]; }).join('  ·  ')
    : 'All records']);
  pairs.push(['Records', String(rowCount)]);
  pairs.push(['Generated', EXF.stamp()]);

  return '<section class="ex-meta">' + pairs.map(function (p) {
    return '<div class="ex-meta__i"><span class="ex-meta__l">' + _exEsc(p[0]) +
           '</span><span class="ex-meta__v">' + _exEsc(p[1]) + '</span></div>';
  }).join('') + '</section>';
}

/* §15 — the KPIs the screen showed, where they are meaningful to the rows in
   this file. Values arrive already formatted: the module knows whether its
   headline is money, a count or a ratio. */
function exSummary(items) {
  if (!items || !items.length) return '';
  return '<section class="ex-kpis">' + items.map(function (k) {
    const tone = k.tone && EX_TONE_COLOR[k.tone] ? EX_TONE_COLOR[k.tone].fg : EX_COLOR.ink;
    return '<div class="ex-kpi"><span class="ex-kpi__l">' + _exEsc(k.label) + '</span>' +
           '<span class="ex-kpi__v" style="color:' + tone + '">' + _exEsc(k.value) + '</span>' +
           (k.sub ? '<span class="ex-kpi__s">' + _exEsc(k.sub) + '</span>' : '') + '</div>';
  }).join('') + '</section>';
}

/* A record document's facts — the fields that identify ONE thing rather than
   describe many. §5 lists the documents that need this shape: a student
   profile, an admission record, an individual room or user record. A table of
   one row is the wrong instrument; these read as a form, which is what they
   are when they are filed.

   facts: [[label, value], …] — values are plain text, formatted by the caller. */
function exFacts(facts) {
  const list = (facts || []).filter(function (f) { return f && f[0]; });
  if (!list.length) return '';
  return '<section class="ex-facts">' + list.map(function (f) {
    return '<div class="ex-fact"><span class="ex-fact__l">' + _exEsc(f[0]) + '</span>' +
           '<span class="ex-fact__v">' + _exEsc(f[1] === '' || f[1] == null ? EX_DASH : f[1]) +
           '</span></div>';
  }).join('') + '</section>';
}

function exCellHtml(c, row, i) {
  if (typeof c.get === 'function') return c.get(row, i);
  const v    = exValue(c, row, i);
  const text = exFormat(c, v);
  if (c.type === 'status') {
    const t = EX_TONE_COLOR[exStatusTone(v)];
    return '<span class="ex-st" style="color:' + t.fg + ';background:' + t.bg + '">' +
           '<span class="ex-st__d" style="background:' + t.fg + '"></span>' + _exEsc(text) + '</span>';
  }
  let html = _exEsc(text);
  if (c.type === 'money' && Number(v) < 0) html = '<span class="neg">' + html + '</span>';
  if (typeof c.sub === 'function') {
    const s = c.sub(row);
    if (s) html += '<span class="sub">' + _exEsc(s) + '</span>';
  }
  return html;
}

function exTable(columns, group) {
  const head = '<tr>' + columns.map(function (c) {
    return '<th class="a-' + exAlign(c) + '">' + _exEsc(c.label) + '</th>';
  }).join('') + '</tr>';

  /* `i` is the row's number WITHIN ITS GROUP, and `group.from` offsets it when
     a document is grouped or sectioned: the sheet's `#` column counts the
     register, not the block it happens to be printed in. */
  const _base = Number(group.from || 0);
  const body = (group.rows || []).map(function (r, i) {
    return '<tr>' + columns.map(function (c) {
      return '<td class="a-' + exAlign(c) + (c.type === 'wrap' ? ' c-wrap' : '') +
             (c.type === 'money' || c.type === 'number' ? ' c-num' : '') + '">' +
             exCellHtml(c, r, _base + i) + '</td>';
    }).join('') + '</tr>';
  }).join('');

  /* §64 — a subtotal lives INSIDE its table. Floated underneath, a page break
     can put the total on a different sheet from the rows it totals. */
  const foot = group.total
    ? '<tr class="subtotal"><td colspan="' + Math.max(1, columns.length - 1) + '">' +
      _exEsc(group.total.label || 'Subtotal') + '</td><td class="a-right">' +
      _exEsc(group.total.value) + '</td></tr>'
    : '';

  return '<table><thead>' + head + '</thead><tbody>' + body + foot + '</tbody></table>';
}

function exSectionHtml(sec) {
  const columns = exPdfColumns(sec.columns || []);
  const rows    = sec.groups.reduce(function (n, g) { return n + (g.rows || []).length; }, 0);

  const head = sec.title
    ? '<div class="ex-sec__h"><h2>' + _exEsc(sec.title) + '</h2>' +
      (sec.meta ? '<span class="ex-sec__m">' + _exEsc(sec.meta) + '</span>' : '') + '</div>'
    : '';

  if (!rows) {
    /* §42 — an empty export is still a document. It says what was asked for
       and that nothing matched, which is an answer; a blank page is not. */
    return '<section class="ex-sec">' + head +
      '<div class="ex-empty">' + _exEsc(sec.empty || 'No records match the selected scope.') +
      '</div></section>';
  }

  const body = sec.groups.map(function (g) {
    if (!g.label) return exTable(columns, g);
    return '<div class="ex-grp"><div class="ex-grp__h">' +
      '<span class="group__t">' + _exEsc(g.label) + '</span>' +
      (g.meta ? '<span class="group__m">' + _exEsc(g.meta) + '</span>' : '') + '</div>' +
      exTable(columns, g) + '</div>';
  }).join('');

  const grand = sec.grand
    ? '<div class="grand"><span class="grand__l">' + _exEsc(sec.grand.label) +
      '</span><span class="grand__v">' + _exEsc(sec.grand.value) + '</span></div>'
    : '';

  return '<section class="ex-sec">' + head +
         (sec.summary ? exSummary(sec.summary) : '') + body + grand + '</section>';
}

/* §57 — a signature block only where the document is an official record.
   Ordinary registers do not get one; a cancellation authorisation does. */
function exSignatures(list) {
  if (!list || !list.length) return '';
  return '<section class="ex-sign">' + list.map(function (l) {
    return '<div class="ex-sign__b"><div class="ex-sign__r"></div>' +
           '<div class="ex-sign__l">' + _exEsc(l) + '</div></div>';
  }).join('') + '</section>';
}

/* §6, §9, §10, §11, §14, §53 — the printed stylesheet.

   Everything here is a print decision, not a taste:
   · thead {display:table-header-group} is what repeats a column heading on
     every page. It is §9, and it is non-negotiable.
   · tr {break-inside:avoid} keeps a record whole across a page break (§10).
   · body type is 9pt, headings 8pt: the floor the spec sets, not smaller (§14).
   · fills are pale and borders are hairlines, because this is going through a
     hostel's inkjet onto ordinary paper (§53).                              */
function exStyles(landscape) {
  const c = EX_COLOR;
  const margin = landscape ? '9mm 9mm 14mm' : '12mm 12mm 16mm';
  return '<style>' +
  '@page{size:A4 ' + (landscape ? 'landscape' : 'portrait') + ';margin:' + margin + '}' +
  '*{box-sizing:border-box;margin:0;padding:0}' +
  'body{font-family:"Segoe UI",Inter,Arial,sans-serif;color:' + c.ink + ';background:#fff;' +
       'font-size:9pt;line-height:1.35;padding:0}' +
  '.ex-page{padding:0}' +
  /* header */
  '.ex-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;' +
           'padding-bottom:8px;border-bottom:2px solid ' + c.blue + '}' +
  '.ex-brand{display:flex;align-items:center;gap:9px}' +
  '.ex-mark{width:26px;height:26px;border-radius:7px;background:' + c.blue + ';color:#fff;' +
          'font-weight:800;font-size:14pt;line-height:26px;text-align:center;letter-spacing:0}' +
  '.ex-word{font-size:12pt;font-weight:800;letter-spacing:1.4px;color:' + c.blueDark + '}' +
  '.ex-tag{font-size:7pt;color:' + c.muted + ';letter-spacing:.4px}' +
  '.ex-doc{text-align:right}' +
  /* Capped both ways: the upload is downscaled to 256px on the way in, and a
     wide wordmark must not push the document title off its own line. */
  '.ex-hlogo{flex:0 0 auto;display:flex;align-items:center;padding-left:12px;' +
           'border-left:1px solid ' + c.border + '}' +
  '.ex-logo{max-height:34px;max-width:110px;object-fit:contain;display:block}' +
  '.ex-doc .title{font-size:15pt;font-weight:800;color:' + c.ink + ';line-height:1.15}' +
  '.ex-doc .subtitle{font-size:8.5pt;color:' + c.muted + ';margin-top:2px}' +
  /* metadata strip */
  '.ex-meta{display:flex;flex-wrap:wrap;gap:4px 22px;padding:7px 10px;margin-top:8px;' +
          'background:' + c.soft + ';border:1px solid ' + c.border + ';border-radius:6px}' +
  '.ex-meta__i{display:flex;gap:6px;align-items:baseline;font-size:7.5pt}' +
  '.ex-meta__l{color:' + c.faint + ';text-transform:uppercase;letter-spacing:.6px;font-weight:700}' +
  '.ex-meta__v{color:' + c.ink + ';font-weight:600}' +
  /* KPIs — SMALLER (owner, 2026-09-10: "the kpis should have be removed or
     resized"). On both of the owner's reference sheets the summary band is a
     thin strip above the register; here it was a row of 12.5pt figures in 7pt
     boxes that took most of the first page's head, on a document whose point
     is the TABLE. The figures stay — a register with no totals is a register
     somebody has to add up — at two thirds the size: 8.5pt figures in a 5pt
     box, one line each. Nothing is dropped, and the table starts higher up. */
  '.ex-kpis{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}' +
  '.ex-kpi{flex:1 1 0;min-width:78px;border:1px solid ' + c.border + ';border-radius:5px;' +
         'padding:4px 7px;background:#fff}' +
  '.ex-kpi__l{display:block;font-size:5.8pt;text-transform:uppercase;letter-spacing:.5px;' +
             'color:' + c.faint + ';font-weight:700}' +
  '.ex-kpi__v{display:block;font-size:8.5pt;font-weight:800;margin-top:1px;' +
             'font-variant-numeric:tabular-nums}' +
  '.ex-kpi__s{display:block;font-size:5.8pt;color:' + c.muted + ';margin-top:0}' +
  /* record facts */
  '.ex-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:10px;' +
           'border:1px solid ' + c.border + ';border-radius:7px;overflow:hidden}' +
  '.ex-fact{padding:6px 10px;border-right:1px solid ' + c.border + ';' +
          'border-bottom:1px solid ' + c.border + '}' +
  '.ex-fact__l{display:block;font-size:6.8pt;text-transform:uppercase;letter-spacing:.7px;' +
              'color:' + c.faint + ';font-weight:700}' +
  '.ex-fact__v{display:block;font-size:9pt;font-weight:700;margin-top:1px}' +
  '.ex-note{margin-top:10px;font-size:8pt;color:' + c.muted + '}' +
  /* sections */
  '.ex-sec{margin-top:14px}' +
  '.ex-sec__h{display:flex;align-items:baseline;justify-content:space-between;' +
             'border-bottom:1px solid ' + c.border + ';padding-bottom:4px;margin-bottom:7px}' +
  '.ex-sec__h h2{font-size:9.5pt;font-weight:800;text-transform:uppercase;letter-spacing:1px;' +
                'color:' + c.blueDark + '}' +
  '.ex-sec__m{font-size:7.5pt;color:' + c.muted + '}' +
  '.ex-grp{margin-bottom:11px;break-inside:auto}' +
  '.ex-grp__h{display:flex;align-items:baseline;justify-content:space-between;' +
             'padding-bottom:3px;margin-bottom:4px;border-bottom:1px solid ' + c.border + '}' +
  '.group__t{font-size:9pt;font-weight:800}' +
  '.group__m{font-size:7.5pt;color:' + c.muted + '}' +
  /* tables */
  'table{width:100%;border-collapse:collapse;table-layout:auto}' +
  'thead{display:table-header-group}' +          /* §9 — headings on every page */
  'tfoot{display:table-row-group}' +
  'tr{break-inside:avoid;page-break-inside:avoid}' +   /* §10 — whole records */
  'th{background:' + c.blueSoft + ';color:' + c.blueDark + ';font-size:7.5pt;font-weight:800;' +
     'text-transform:uppercase;letter-spacing:.5px;padding:5px 7px;' +
     'border-bottom:1.4px solid ' + c.blue + ';white-space:nowrap}' +
  'td{padding:4.5px 7px;border-bottom:1px solid #EEF2F8;vertical-align:top;font-size:8.5pt}' +
  'tbody tr:nth-child(even) td{background:#FBFCFE}' +
  '.a-left{text-align:left}.a-right{text-align:right}.a-center{text-align:center}' +
  '.c-num{font-variant-numeric:tabular-nums;white-space:nowrap}' +
  '.c-wrap{white-space:normal;word-break:break-word}' +   /* §13 — wrap, never clip */
  '.sub{display:block;font-size:7pt;color:' + c.muted + ';font-weight:600;margin-top:1px}' +
  '.neg{color:' + c.danger + ';font-weight:700}' +
  '.pos{color:' + c.positive + ';font-weight:700}' +
  'tr.subtotal td{border-top:1px solid ' + c.border + ';border-bottom:none;font-weight:800;' +
                 'background:' + c.soft + '}' +
  /* status pills — colour plus the word, never colour alone (§47) */
  '.ex-st{display:inline-block;padding:1px 7px;border-radius:9px;font-size:7.5pt;font-weight:700;' +
         'white-space:nowrap}' +
  '.ex-st__d{display:inline-block;width:4px;height:4px;border-radius:50%;margin-right:4px;' +
            'vertical-align:middle}' +
  /* totals */
  '.grand{display:flex;align-items:center;justify-content:space-between;margin-top:6px;' +
         'padding:8px 12px;border-radius:7px;background:' + c.blueSoft + ';' +
         'border:1px solid ' + c.border + ';break-inside:avoid}' +
  '.grand__l{font-size:8pt;text-transform:uppercase;letter-spacing:.9px;color:' + c.blueDark + ';' +
            'font-weight:800}' +
  '.grand__v{font-size:13pt;font-weight:800;font-variant-numeric:tabular-nums}' +
  '.ex-empty{padding:26px;text-align:center;color:' + c.muted + ';font-size:9pt;' +
            'border:1px dashed ' + c.border + ';border-radius:7px;background:' + c.soft + '}' +
  /* signatures (§57) */
  '.ex-sign{display:flex;gap:36px;margin-top:26px;break-inside:avoid}' +
  '.ex-sign__b{flex:1}' +
  '.ex-sign__r{border-bottom:1px solid ' + c.ink + ';height:26px}' +
  '.ex-sign__l{font-size:7.5pt;color:' + c.muted + ';margin-top:3px;text-transform:uppercase;' +
              'letter-spacing:.6px}' +
  /* the closing line, once, at the end of the document — the per-page footer
     is drawn by the PDF writer so that it can carry a real page number */
  '.ex-foot{margin-top:16px;padding-top:7px;border-top:1px solid ' + c.border + ';' +
           'display:flex;justify-content:space-between;gap:14px;font-size:7.5pt;color:' + c.faint + '}' +
  '@media print{.no-print{display:none!important}body{background:#fff!important}}' +
  '</style>';
}

/* Builds the whole A4 document. Returns { html, landscape, filename }. */
function exDocument(def) {
  const hostel   = exHostel();
  const sections = exSections(def);
  const rows     = exRowCount(sections);
  const cols     = exPdfColumns(sections[0].columns || []);
  const landscape = exOrientation(def, cols);

  const body =
    exHeaderBand(def, hostel) +
    exMetaStrip(def, hostel, rows) +
    exFacts(def.facts) +
    exSummary(def.summary) +
    sections.map(exSectionHtml).join('') +
    (def.note ? '<div class="ex-note">' + _exEsc(def.note) + '</div>' : '') +
    exSignatures(def.signatures) +
    '<div class="ex-foot"><span>Hostyllo · ' + _exEsc(hostel) +
      ' · ' + _exEsc(def.title || 'Report') + '</span>' +
      '<span>This is a computer generated document. Generated ' + EXF.stamp() + '</span></div>';

  /* The <meta> is read by the print window's Save-as-PDF bridge: it is how the
     main process learns the orientation and the footer line for a document it
     only ever sees as a temp file. */
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + _exEsc(def.title || 'Report') + ' — ' + _exEsc(hostel) + '</title>' +
    '<meta name="hx-export" content="' + _exEsc(JSON.stringify({
      landscape: landscape,
      footer: 'Hostyllo · ' + hostel + ' · ' + (def.title || 'Report'),
      file: exFileName(def, 'pdf'),
    })) + '">' +
    exStyles(landscape) + '</head><body><div class="ex-page">' + body + '</div></body></html>';

  return { html: html, landscape: landscape, filename: exFileName(def, 'pdf'), rows: rows };
}

/* ══ THE EXCEL WORKBOOK ════════════════════════════════════════════════════ */

const EX_XL_STYLE = {
  text:     function () { return HXW.S.TEXT; },
  wrap:     function () { return HXW.S.WRAP; },
  id:       function () { return HXW.S.TEXT; },
  number:   function () { return HXW.S.NUMBER; },
  money:    function (v) { return Number(v) < 0 ? HXW.S.MONEY_NEG : HXW.S.MONEY; },
  date:     function () { return HXW.S.DATE; },
  datetime: function () { return HXW.S.DATETIME; },
  status:   function () { return HXW.S.CENTER; },
  percent:  function () { return HXW.S.PERCENT; },
};
const EX_XL_TYPE = {
  money: 'money', number: 'number', percent: 'percent',
  date: 'date', datetime: 'date',
};

/* §62 — the typing rules, in one place.

   A phone number is TEXT even though it looks numeric: 03310045835 stored as a
   number loses its leading zero and comes back as 3,310,045,835, and the
   warden's contact list has quietly become arithmetic. A column says so by
   declaring type 'text' — which is why `id` and `text` never coerce. */
function exXlCell(c, row, i) {
  const raw = exValue(c, row, i);
  const t   = c.type || 'text';
  const style = (EX_XL_STYLE[t] || EX_XL_STYLE.text)(raw);

  if (raw === null || raw === undefined || raw === '') {
    /* §48 — blank only where blank means something. A missing amount is blank
       (so it does not join a SUM as a zero that was never owed); missing text
       is the em dash, so a printed sheet has no silent gaps. */
    return (t === 'money' || t === 'number' || t === 'percent' || t === 'date' || t === 'datetime')
      ? { v: '', t: 'blank', s: style }
      : { v: EX_DASH, s: style };
  }
  const xt = EX_XL_TYPE[t];
  if (xt === 'money' || xt === 'number' || xt === 'percent') {
    const n = Number(raw);
    return isFinite(n) ? { v: n, t: xt, s: style } : { v: String(raw), s: HXW.S.TEXT };
  }
  if (xt === 'date') return { v: raw, t: 'date', s: style };
  return { v: String(raw), s: style };
}

/* One sheet: title band, metadata, filters, summary, then the table. §22. */
function exSheet(def, sec, hostel, name) {
  const columns = exXlColumns(sec.columns || []);
  const S = HXW.S;
  const rows = [];
  const merges = [];
  const last = Math.max(1, columns.length);
  const span = function (r) { merges.push('A' + r + ':' + HXW.colLetter(last) + r); };

  const line = function (text, style, height) {
    rows.push({ h: height, cells: [{ v: text, s: style }] });
    span(rows.length);
  };

  line('HOSTYLLO', S.WORDMARK, 20);
  line('Hostel Management System', S.META, 14);
  line(hostel, S.SUBTITLE, 17);
  line((sec.title ? sec.title + ' — ' : '') + (def.title || 'Report') +
       (def.scope ? '  ·  ' + def.scope : ''), S.TITLE, 23);

  const filters = (def.filters || []).filter(function (f) { return f && f[1]; });
  line('Scope: ' + (filters.length
        ? filters.map(function (f) { return f[0] + ': ' + f[1]; }).join('   ·   ')
        : 'All records'), S.META, 14);
  line('Generated: ' + EXF.stamp(), S.META, 14);
  rows.push({ cells: [] });

  /* A record document's identifying fields, as label/value rows. */
  if (def.facts && def.facts.length) {
    def.facts.filter(f => f && f[0]).forEach(function (f) {
      rows.push({ cells: [
        { v: f[0], s: S.KPI_LABEL },
        { v: (f[1] === '' || f[1] == null) ? EX_DASH : String(f[1]), s: S.KPI_VALUE },
      ] });
    });
    rows.push({ cells: [] });
  }

  /* §15 — the summary, as label/value pairs rather than a picture of cards.
     A spreadsheet reader wants to reference the figure, not admire it. */
  const summary = sec.summary || def.summary;
  if (summary && summary.length) {
    summary.forEach(function (k) {
      rows.push({ cells: [
        { v: k.label, s: S.KPI_LABEL },
        { v: k.value, s: S.KPI_VALUE },
      ] });
    });
    rows.push({ cells: [] });
  }

  const allRows = sec.groups.reduce(function (acc, g) {
    /* A grouped export (expenses by category) keeps its grouping as a real
       column instead of as visual headings — headings inside a data table
       break filtering and sorting, which is the whole point of the sheet. */
    (g.rows || []).forEach(function (r) { acc.push({ row: r, group: g.label || '' }); });
    return acc;
  }, []);

  const hasGroups = sec.groups.length > 1 || !!sec.groups[0].label;
  const headCols = (hasGroups ? [{ label: sec.groupLabel || 'Group', type: 'text', width: 18 }] : [])
                     .concat(columns);

  const HEADER_ROW = rows.length + 1;
  rows.push({ h: 26, cells: headCols.map(function (c) {
    const a = exAlign(c);
    return { v: c.label, s: a === 'right' ? S.HEAD_R : a === 'center' ? S.HEAD_C : S.HEAD };
  }) });

  allRows.forEach(function (entry, i) {
    const cells = columns.map(function (c) { return exXlCell(c, entry.row, i); });
    rows.push({ cells: hasGroups ? [{ v: entry.group || EX_DASH, s: S.TEXT }].concat(cells) : cells });
  });

  const DATA_END = rows.length;

  /* §64 — totals, clearly separated, and only for columns that mean something
     added up. Written as a real SUM formula: a workbook is for analysis, and a
     hard-coded total stops being true the moment a row is filtered out. */
  const totalCols = headCols.map(function (c, i) { return c.total === 'sum' ? i : -1; })
                            .filter(function (i) { return i >= 0; });
  if (totalCols.length && allRows.length) {
    /* The word TOTAL goes in the first column that is NOT itself being
       totalled — writing it into column A unconditionally would overwrite a
       figure whenever the first column happens to hold money. */
    const labelAt = headCols.findIndex(function (c, i) { return totalCols.indexOf(i) === -1; });
    const cells = headCols.map(function (c, i) {
      if (i === labelAt) return { v: 'TOTAL', s: S.TOTAL_LABEL };
      if (totalCols.indexOf(i) === -1) return { v: '', t: 'blank', s: S.TOTAL_LABEL };
      const col = HXW.colLetter(i + 1);
      return { v: 'SUM(' + col + (HEADER_ROW + 1) + ':' + col + DATA_END + ')', t: 'formula',
               s: c.type === 'money' ? S.TOTAL_MONEY : S.TOTAL_NUMBER };
    });
    rows.push({ h: 20, cells: cells });
  }

  if (!allRows.length) {
    rows.push({ cells: [{ v: sec.empty || def.empty ||
      'No records match the selected scope.', s: S.META }] });
    span(rows.length);
  }

  const END = rows.length;
  return {
    name: name,
    rows: rows,
    cols: headCols.map(function (c) {
      return { width: c.width || exType(c).width, wrap: c.type === 'wrap' };
    }),
    merges: merges,
    freeze: { row: HEADER_ROW },                                   // §24
    autofilter: allRows.length                                     // §25
      ? { r1: HEADER_ROW, c1: 1, r2: DATA_END, c2: headCols.length } : null,
    landscape: exOrientation(def, headCols),                       // §27
    printTitleRow: HEADER_ROW,                                     // §28
    printArea: { r1: 1, c1: 1, r2: END, c2: headCols.length },     // §30
    header: { left: 'HOSTYLLO — ' + (def.title || 'Report'), right: hostel },
    footer: { left: 'Generated ' + EXF.stamp(), right: 'Page &P of &N' },   // §31
  };
}

function exWorkbook(def) {
  const hostel   = exHostel();
  const sections = exSections(def);
  const used     = {};
  const sheets   = (def.sheetPerSection && sections.length > 1)
    ? sections.map(function (s, i) {
        let n = s.title || ('Sheet ' + (i + 1));
        if (used[n]) n = n + ' ' + (used[n] + 1);
        used[n] = (used[n] || 0) + 1;
        return exSheet(def, s, hostel, n);
      })
    : [exSheet(def, sections[0], hostel, def.sheet || def.module || 'Data')];

  return {
    meta: { title: def.title || 'Hostyllo Export', subject: hostel + (def.scope ? ' · ' + def.scope : '') },
    sheets: sheets,
  };
}

/* ══ ENTRY POINTS ══════════════════════════════════════════════════════════ */

function _exToast(msg, kind) { if (typeof toast === 'function') toast(msg, kind || 'info'); }

/* §51 — a large export says what it is doing. Small ones finish before this is
   readable, which is fine; what must never happen is a frozen-looking window
   with no explanation. */
function _exBusy(def, rows, what) {
  if (rows >= 200) _exToast('Preparing ' + (def.title || 'export') + ' — ' + rows + ' records…', 'info');
}

const EXPORT = {
  colors: EX_COLOR,
  fmt: EXF,
  fileName: exFileName,
  document: exDocument,
  workbook: exWorkbook,

  /* Export as PDF. The document goes through _electronPDF, which is the one
     transport that does not hang the renderer on Windows — the main process
     owns the window, this one never blocks. */
  pdf(def) {
    try {
      const doc = exDocument(def);
      _exBusy(def, doc.rows, 'PDF');
      _electronPDF(doc.html, doc.filename, { pageSize: 'A4', landscape: doc.landscape });
      return doc;
    } catch (e) {
      console.error('[HOSTYLLO] PDF export failed:', e);
      _exToast('Export could not be generated. Please try again.', 'error');
      return null;
    }
  },

  /* Export as a real .xlsx. Asynchronous because the workbook is deflated in
     the browser; the caller does not need to await it. */
  async excel(def) {
    try {
      const spec = exWorkbook(def);
      const rows = exRowCount(exSections(def));
      _exBusy(def, rows, 'Excel');
      const name = exFileName(def, 'xlsx');
      await HXW.save(spec, name);
      _exToast((def.title || 'Export') + ' generated successfully.', 'success');
      return name;
    } catch (e) {
      console.error('[HOSTYLLO] Excel export failed:', e);
      _exToast('Export could not be generated. Please try again.', 'error');
      return null;
    }
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXPORT, EXF, EX_COLOR, exDocument, exWorkbook, exFileName, exOrientation };
}
