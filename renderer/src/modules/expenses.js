/* ─── HOSTYLLO — EXPENSES MODULE ─────────────────────────────────────────────
   Contains: renderExpenses, showAddExpenseModal, submitAddExpense,
             showEditExpenseModal, submitEditExpense, deleteExpense
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ════════════════════════════════════════════════════════════════════════════
// EXPENSES v5 — rebuilt to the owner's reference design
// ════════════════════════════════════════════════════════════════════════════

// Categories are owner-configurable, so both the icon and the colour are matched
// on keywords rather than a fixed list — a hostel that renames "Meals" to
// "Staff Nashta" still gets the food icon. One table so the two can never drift.
// `hue` is null where no colour is semantically obvious; those fall through to
// the hash below, which is what keeps two food categories visually distinct.
const _EXP_CATS = [
  [/electric|light|wapda|bulb/i, 'dh-amber',  '<path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/>'],
  [/water|tank|plumb|pipe|tap/i, 'dh-blue',   '<path d="M12 2s6 7.5 6 11.5A6 6 0 0 1 6 13.5C6 9.5 12 2 12 2Z"/>'],
  [/gas|fuel|cylinder/i,         'dh-red',    '<path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 2 0 0-2-1-3 1-5Z"/>'],
  [/maint|repair|fix|tool/i,     'dh-green',  '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-1.4-1.4 2.6-2.6Z"/>'],
  [/clean|wash|soap|sweep/i,     'dh-green',  '<path d="M9 3h6v5H9z"/><path d="M8 8h8l1 13H7L8 8Z"/>'],
  [/secur|guard|chowkidar/i,     'dh-violet', '<path d="M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5l-8-3Z"/>'],
  [/internet|wifi|net|ptcl/i,    'dh-blue',   '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1.2"/>'],
  [/furnit|bed|chair|table/i,    'dh-violet', '<path d="M3 10V6h18v4"/><path d="M3 10h18v6H3z"/><path d="M5 16v3M19 16v3"/>'],
  [/meal|nashta|food|lunch|dinner|chai|tea|breakfast|kitchen|rashan/i,
                                 null,        '<path d="M7 2v9M4 2v6a3 3 0 0 0 3 3M17 2c-1.5 0-2.5 1.5-2.5 4s1 4 2.5 4"/><path d="M7 11v11M17 10v12"/>'],
  [/rent|salary|staff|wage|pay/i, null,       '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 1.6c-3.2 0-6.4 1.6-6.4 4V19a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1v-1.4c0-2.4-3.2-4-6.4-4Z"/>'],
];
const _EXP_ICON_FALLBACK = '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>';

/* ══ TWO FIELDS THIS PAGE USED TO DRAW AS DASHES ═══════════════════════════
   The reference draws a Payment Method column and an Added By column. An
   expense record here was `{id, category, amount, date, description}` and had
   neither, and spec §21 is explicit that a missing creator prints "—" and is
   never fabricated. So they are CAPTURED, in the Add and Edit forms, rather
   than derived: from today an expense records how it was paid and who it was
   handed to, and a record written before today prints a dash and says so. That
   is the order the specification itself asks for — "these belong to the expense
   FORM before they belong to its export".

   The four methods are §20's list verbatim. A hostel cannot add a fifth from
   the UI, deliberately: a free-text method column stops being filterable and
   turns into four spellings of "cash". */
const EXP_METHODS = ['Cash', 'Bank Transfer', 'EasyPaisa', 'JazzCash'];

/** Initials for the Added By avatar. Two words at most, so "Muhammad Asif Raza" is MA. */
function expInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/* NEUTRAL, per spec §20 — and this is the one place the badge sheet is
   overruled. `status-badges.png` colours the method chips; the Expenses spec
   and CLAUDE.md both say a category must not wear a hue, and how a bill was
   paid is a category, not a state. Two documents to one. */
function expMethodChip(m) {
  const v = String(m || '').trim();
  if (!v) return '<span class="exp-dash">—</span>';
  return `<span class="exp-meth">${escHtml(v)}</span>`;
}

/** Initials avatar + name, or an honest dash. @see spec §21 */
function expWhoChip(who) {
  const v = String(who || '').trim();
  if (!v) return '<span class="exp-dash">—</span>';
  return `<span class="exp-who"><i>${escHtml(expInitials(v))}</i>${escHtml(v)}</span>`;
}

/* Everyone this hostel has ever handed money to, offered as suggestions. Built
   from the records themselves plus the staff list, so the second electricity
   bill of the month does not get a differently-spelled payee. */
function expPeople() {
  const seen = new Map();
  const add = n => { const v = String(n || '').trim(); if (v) seen.set(v.toLowerCase(), v); };
  (DB.expenses || []).forEach(e => add(e.handedTo));
  Object.values(typeof WARDENS === 'object' && WARDENS ? WARDENS : {})
    .filter(u => u && u.active !== false)
    .forEach(u => add(u.name || u.username));
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function _expCatMatch(cat) {
  return _EXP_CATS.find(row => row[0].test(String(cat || '')));
}

function expCatIcon(cat) {
  const hit = _expCatMatch(cat);
  return hit ? hit[2] : _EXP_ICON_FALLBACK;
}

// Semantic hue where there is one, otherwise a stable hash of the name — so a
// category keeps the same pill colour between renders and across machines.
// Mirrors payAvatarHue()'s hashing.
function expCatHue(cat) {
  const name = String(cat || '');
  if (/^other$/i.test(name)) return 'dh-slate';   // the catch-all reads as neutral
  const hit = _expCatMatch(name);
  if (hit && hit[1]) return hit[1];
  const hues = ['dh-amber','dh-violet','dh-green','dh-blue','dh-red'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

// Minimal inline sparkline. Chart.js would be four more canvases on this page
// for four decorative 60x26 trends; an SVG polyline costs nothing and cannot
// leak a chart instance on re-render.
function expSpark(values) {
  const w = 62, h = 26, pad = 3;
  const v = (values && values.length) ? values : [0, 0];
  const max = Math.max.apply(null, v), min = Math.min.apply(null, v);
  const span = (max - min) || 1;
  const step = v.length > 1 ? (w - pad * 2) / (v.length - 1) : 0;
  const pts = v.map((n, i) =>
    (pad + i * step).toFixed(1) + ',' + (h - pad - ((n - min) / span) * (h - pad * 2)).toFixed(1)
  ).join(' ');
  return `<svg class="exp-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* The one filter+sort pipeline for expenses. The table, the stat strip and
   the PDF export all read from here, so they cannot drift apart — the same
   rule studentsFiltered() and payFiltered() already follow. It was inline in
   renderExpenses() until the export needed it too. */
/* Returns the WHOLE scope, not only the rows: the stat strip above the table
   is computed from the month's expenses before the category filter narrows
   them, so it needs `scoped` as well as `rows`. Returning both from one call
   is what stops the two being derived twice and disagreeing. */
function expensesScoped() {
  // Month scope: '' means the current month, 'All' every month, otherwise a
  // specific YYYY-MM picked from the dropdown.
  const scope = expFilter.showAll ? 'All' : (expFilter.month || thisMonth());
  const inScope = e => scope === 'All' || String(e.date || '').startsWith(scope);

  /* Legacy funds-transfer records ride along as ordinary rows under the Fund
     Transfer category. They live in DB.transfers rather than DB.expenses
     because they used to be entered on a screen of their own, and that screen
     is now hidden — so without this they would be inside the Total Expenses
     figure at the top of this page while being absent from the table beneath
     it, and the page would visibly fail to add up. Edit and delete route back
     to the edit/delete handlers that still own the record. Nothing is rewritten
     or migrated — the standalone Funds Transfer screens are gone, but the money
     they recorded is all still here, under this category. */
  const _legacyTransfers = (DB.transfers || []).filter(inScope).map(t => ({
    id: t.id, date: t.date, category: FUND_TRANSFER_CAT,
    description: t.description || ('Transfer' + (t.receivedBy ? ' to ' + t.receivedBy : '')),
    amount: Number(t.amount || 0), _transfer: true,
  }));

  const scoped = DB.expenses.filter(inScope).concat(_legacyTransfers);

  let exps = scoped.filter(e => {
    if (expFilter.cat !== 'All' && e.category !== expFilter.cat) return false;
    /* 'None' is a real answer, not a missing one: it is how a warden finds the
       records written before the method was captured, which is exactly the set
       they would want to go back and complete. */
    if (expFilter.method && expFilter.method !== 'All') {
      const m = String(e.method || '').trim();
      if (expFilter.method === 'None' ? m !== '' : m !== expFilter.method) return false;
    }
    if (expFilter.search) {
      const q = expFilter.search.toLowerCase();
      if (!String(e.description || '').toLowerCase().includes(q) &&
          !String(e.category || '').toLowerCase().includes(q) &&
          !String(e.handedTo || '').toLowerCase().includes(q) &&
          !String(e.method || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  exps = applySort(exps, expFilter, {
    date:        e => e.date || '',
    category:    e => String(e.category || '').toLowerCase(),
    description: e => String(e.description || '').toLowerCase(),
    amount:      e => Number(e.amount) || 0,
    method:      e => String(e.method || '').toLowerCase(),
    handedTo:    e => String(e.handedTo || '').toLowerCase(),
  });
  if (!expFilter.sortKey) exps = exps.sort((a, b) => String(b.date||'').localeCompare(String(a.date||'')));
  return { scope, scoped, legacyTransfers: _legacyTransfers, rows: exps };
}

/* Just the rows — what the table and the PDF export both iterate. */
function expensesFiltered() { return expensesScoped().rows; }

/* ══ THE EXPENSES EXPORT ═══════════════════════════════════════════════════
   Owner's requirement, unchanged by the move to the global engine: print ONE
   category when one is selected, or every category when none is. Those are
   genuinely two documents and both are built from the same rows —

     · a category selected → one table, that category's records, its total
     · All Categories      → a table PER category, each with its own subtotal,
                             ordered by spend so the largest is on page one,
                             and a grand total under them

   "All categories combined" is not one flat table with a category column. A
   warden checking last month's spending wants to know what went on electricity
   as a figure, not to add fourteen scattered rows up by hand.

   The WORKBOOK inverts that deliberately (§61): grouping headings inside a
   data table break sorting and filtering, so the engine flattens the groups
   into a real Category column there. Same rows, same totals, two shapes,
   each right for what it is opened in.

   §35 lists a payment method, a vendor and a "paid by" for expenses. This app
   records none of them — an expense is {date, category, description, amount} —
   and inventing the columns would put empty headings on an owner's document.
   They belong to the expense FORM before they belong to its export.        */
function _expExportDef(rows) {
  const one   = expFilter.cat !== 'All';
  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const scope = expFilter.showAll ? 'All months'
              : (expFilter.month || thisMonth()) === thisMonth() ? thisMonthLabel()
              : monthLabel(expFilter.month);

  // Group, then order by spend — biggest first, because that is the order the
  // question "where did the money go" is actually asked in.
  const byCat = new Map();
  rows.forEach(e => {
    const k = e.category || 'Uncategorised';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(e);
  });
  const catTotal = list => list.reduce((s, e) => s + Number(e.amount || 0), 0);
  const ordered  = [...byCat.entries()].sort((a, b) => catTotal(b[1]) - catTotal(a[1]));
  const largest  = rows.reduce((m, e) => Math.max(m, Number(e.amount || 0)), 0);

  /* Description gave up 12 of its 40 so Method and Added By could be on the
     printed page as well as in the workbook. They are blank on a funds
     transfer, which is not an expense record and has no form behind it, and
     blank on any record written before the two fields were captured — §21's
     dash, not a guess at who was on shift. */
  const columns = [
    { label: 'Date', type: 'date', width: 12, value: e => e.date || '' },
    { label: 'Category', type: 'text', width: 16, excel: false,
      value: e => e.category || 'Uncategorised' },
    { label: 'Description', type: 'wrap', width: 28,
      value: e => e.description || '',
      get:   e => escHtml(e.description || '—') +
                  (e._transfer ? '<span class="sub">funds transfer</span>' : '') },
    { label: 'Method', type: 'text', width: 12,
      value: e => e._transfer ? '' : (e.method || '') },
    { label: 'Added By', type: 'text', width: 16,
      value: e => e._transfer ? '' : (e.handedTo || '') },
    { label: 'Type', type: 'text', width: 14, pdf: false,
      value: e => e._transfer ? 'Funds transfer' : 'Expense' },
    { label: 'Amount', type: 'money', width: 16, total: 'sum',
      value: e => Number(e.amount || 0),
      get:   e => '<b>' + fmtPKR(e.amount) + '</b>' },
    { label: 'Receipt', type: 'text', width: 10, pdf: false,
      value: e => e.receipt ? 'Attached' : '' },
    { label: 'Reference', type: 'id', width: 16, pdf: false, value: e => String(e.id || '') },
  ];

  const groups = one
    ? [{ rows, total: { label: expFilter.cat + ' total', value: fmtPKR(total) } }]
    : ordered.map(([cat, list]) => ({
        label: cat,
        meta: list.length + ' record' + (list.length === 1 ? '' : 's') +
              (total > 0 ? ' · ' + Math.round(catTotal(list) / total * 100) + '% of spend' : ''),
        rows: list,
        total: { label: cat + ' total', value: fmtPKR(catTotal(list)) },
      }));

  return {
    module: 'Expenses',
    title:  one ? 'Expenses — ' + expFilter.cat : 'Expense Register',
    /* §32 — the scope in the FILENAME as well as on the page. A file holding
       only the electricity records, named for the month alone, is the one that
       gets forwarded as though it were the month's whole spend. */
    scope:  one ? expFilter.cat + ' ' + scope : scope,
    sheet:  'Expenses',
    groupLabel: 'Category',

    filters: [
      ['Month',    scope],
      ['Category', one ? expFilter.cat : 'All categories'],
      ['Method',   expFilter.method && expFilter.method !== 'All'
                     ? (expFilter.method === 'None' ? 'Not recorded' : expFilter.method) : null],
      ['Search',   expFilter.search || null],
    ],

    summary: one
      ? [{ label: 'Records', value: String(rows.length) },
         { label: expFilter.cat, value: EXPORT.fmt.money(total), tone: 'neg' },
         { label: 'Largest', value: EXPORT.fmt.money(largest) }]
      : [{ label: 'Transactions', value: String(rows.length) },
         { label: 'Categories',   value: String(ordered.length) },
         { label: 'Largest category', value: ordered.length ? ordered[0][0] : '—' },
         { label: 'Largest expense',  value: EXPORT.fmt.money(largest) },
         { label: 'Total spent',      value: EXPORT.fmt.money(total), tone: 'neg' }],

    columns,
    groups,
    grand: { label: one ? expFilter.cat + ' — total' : 'Total across all categories',
             value: fmtPKR(total) },
    empty: 'No expenses match the selected filters.',
  };
}

function exportExpensesPDF() {
  const rows = expensesFiltered();
  if (!rows.length) { toast('No expenses to export', 'error'); return; }
  EXPORT.pdf(_expExportDef(rows));
}

function exportExpensesExcel() {
  const rows = expensesFiltered();
  if (!rows.length) { toast('No expenses to export', 'error'); return; }
  EXPORT.excel(_expExportDef(rows));
}

/* Compact money for this register, with the exact figure on hover — the same
   treatment and the same formatter as the Payments table, so the two finance
   screens do not round differently. Expenses spec §8 gives the thresholds by
   example (PKR 8K / PKR 41.5K / PKR 1.25M) and they are fmtPKRk()'s already;
   §8 also requires the exact value to survive in tooltips and both exports,
   which is why this is display-only and the CSV/PDF paths are untouched. */
function expMoney(n) {
  const compact = fmtPKRk(n), exact = fmtPKR(n);
  return compact === exact ? compact : `<span title="${exact}">${compact}</span>`;
}

/* Period-over-period movement for the headline card (spec §6.1, §7).

   Returns null rather than a number when there is nothing honest to compare
   against — an 'All months' scope has no previous period, and a first month has
   no predecessor. §7 is explicit that the card then says "No comparison"
   instead of a fabricated percentage, which is the same trap the dashboard hit
   when it printed "+157902725.6%" against a near-zero base. A previous period
   of zero is that case, so it is treated as no comparison too. */
function expPrevDelta(scope) {
  if (!scope || scope === 'All') return null;
  const y = Number(scope.slice(0, 4)), m = Number(scope.slice(5, 7));
  if (!y || !m) return null;
  const d = new Date(y, m - 2, 1);
  const prev = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const sum = key => DB.expenses.concat(DB.transfers || [])
    .filter(e => String(e.date || '').slice(0, 7) === key)
    .reduce((t, e) => t + Number(e.amount || 0), 0);
  const before = sum(prev);
  if (!before) return null;
  return { pct: ((sum(scope) - before) / before) * 100, prev: fmtMonthLabel(prev) };
}

function renderExpenses() {
  const mo      = thisMonth();
  const moLabel = thisMonthLabel();

  const _S = expensesScoped();
  const scope = _S.scope, scoped = _S.scoped, _legacyTransfers = _S.legacyTransfers;
  const exps = _S.rows;

  const total = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
  const _pg   = paginate(exps, expFilter);

  // ── Stat strip ────────────────────────────────────────────────────────────
  // The table below is the register of expense RECORDS, so it stays as it is —
  // a transfer is not editable here. The headline figure is the one every other
  // screen quotes, though, and that one counts transfers, so it is stated in
  // full with the transfer share spelled out underneath. Without this the
  // Expenses page and the dashboard's Expenses card read differently for the
  // same month, which is the disagreement this strip exists to prevent.
  // `scoped` already carries the legacy transfers as rows, so the headline is
  // simply its sum. It used to be records + transfers because the table held
  // only DB.expenses; adding the transfers again now would count them twice.
  const scopedTrf   = _legacyTransfers.reduce((s, t) => s + Number(t.amount || 0), 0);
  const scopedTotal = scoped.reduce((s, e) => s + Number(e.amount || 0), 0);
  // Average per day across the days actually elapsed in the scope, not the
  // calendar month — dividing August's spend by 31 on the 8th reads far too low.
  const now = new Date();
  const daysElapsed = (scope === 'All')
    ? Math.max(1, new Set(scoped.map(e => e.date)).size)
    : (scope === mo ? Math.max(1, now.getDate())
                    : Math.max(1, new Date(Number(scope.slice(0,4)), Number(scope.slice(5,7)), 0).getDate()));
  const avgDaily  = Math.round(scopedTotal / daysElapsed);
  const activeCat = new Set(scoped.map(e => e.category).filter(Boolean)).size;

  // Daily totals across the scope drive every sparkline's shape.
  const byDay = {};
  scoped.forEach(e => { const d = String(e.date||''); if (d) byDay[d] = (byDay[d]||0) + Number(e.amount||0); });
  const days      = Object.keys(byDay).sort();
  const daySeries = days.map(d => byDay[d]);
  const cntSeries = days.map(d => scoped.filter(e => e.date === d).length);

  const scopeLabel = scope === 'All' ? 'All months'
                   : scope === mo    ? 'This Month'
                   : fmtMonthLabel(scope);

  /* §6.1 wants the movement against the previous comparable period on the
     headline card. It is a span rather than a second stat line because §7 asks
     for "a simple indicator", and because the card already carries a sparkline
     of the same series — two large trend graphics on one card is what §7's
     warning about decoration reducing readability is about. */
  const _d = expPrevDelta(scope);
  const _expTrend = _d === null
    ? `<span class="exp-stat__trend is-none" title="No previous period to compare against">No comparison</span>`
    : `<span class="exp-stat__trend ${_d.pct >= 0 ? 'is-up' : 'is-down'}" title="vs ${escHtml(_d.prev)}">`
      + `${_d.pct >= 0 ? '\u2197' : '\u2198'} `
      /* Past ten-fold, a ratio stops being a percentage anyone reads and becomes
         a shape, so it is said as one. A month that spent PKR 8,000 followed by
         one that spent 76,000 is "850.0%" \u2014 true and useless, and the exact kind
         of figure the expenses spec \u00a77 and payments spec \u00a76 both rule out. */
      + `${Math.abs(_d.pct) >= 1000 ? '>10\u00d7' : Math.abs(_d.pct).toFixed(1) + '%'}</span>`;

  /* `trend` is a SIBLING of the value, never inside it. Putting it in the value
     element made .exp-stat__v read "PKR 16.7K \u2197 83.3%" — one node holding two
     different numbers, which is wrong for a screen reader and broke a spec that
     reads the headline figure to check it equals the sum of the rows. */
  const stat = (hue, icon, label, value, sub, series, trend) => `
    <div class="exp-stat ${hue}">
      <span class="exp-stat__ic">${icon}</span>
      <div class="exp-stat__c">
        <div class="exp-stat__l">${label}</div>
        <div class="exp-stat__vrow">
          <div class="exp-stat__v">${value}</div>
          ${trend || ''}
        </div>
        <div class="exp-stat__s">${sub}</div>
      </div>
      ${expSpark(series)}
    </div>`;

  const stats = `
  <div class="exp-stats">
    ${stat('dh-violet','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
          'Total Expenses', `<span title="${fmtPKR(scopedTotal)}" data-exact="${scopedTotal}">${expMoney(scopedTotal)}</span>`,
          scopedTrf > 0 ? `${scopeLabel} · incl. ${fmtPKR(scopedTrf)} funds transfer` : scopeLabel,
          daySeries, _expTrend)}
    ${stat('dh-blue','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 15 6-6"/><path d="M15 9h-4"/><path d="M15 9v4"/></svg>',
          'Average Daily', expMoney(avgDaily),
          `Avg per day · ${daysElapsed} day${daysElapsed===1?'':'s'}`, daySeries)}
    ${stat('dh-green','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>',
          'Total Records', String(scoped.length), scopeLabel, cntSeries)}
    ${stat('dh-amber','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
          'Categories', String(activeCat), 'Active', cntSeries)}
  </div>`;

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const catOpts = DB.settings.expenseCategories
    .map(c => `<option value="${escHtml(c)}" ${expFilter.cat===c?'selected':''}>${escHtml(c)}</option>`).join('');

  // Transfer dates count too, or a month whose only outgoing was a transfer
  // would be missing from the picker and unreachable from this page.
  const monthsPresent = [...new Set(
      DB.expenses.concat(DB.transfers || [])
        .map(e => String(e.date||'').slice(0,7)).filter(Boolean))]
    .sort().reverse();
  if (!monthsPresent.includes(mo)) monthsPresent.unshift(mo);
  const monthOpts = monthsPresent
    .map(m => `<option value="${escHtml(m)}" ${scope===m?'selected':''}>${fmtMonthLabel(m)}</option>`).join('');

  const th = (key, label, extra) => {
    const on  = expFilter.sortKey === key;
    const arw = on ? (expFilter.sortDir === 'asc' ? '▲' : '▼') : '⇅';
    return `<th class="is-sortable${on?' is-sorted':''}" ${extra||''} onclick="toggleSort(expFilter,'expenses','${key}')" title="Sort by ${label}">${label}<span class="arw">${arw}</span></th>`;
  };

  const toolbar = `
  <div class="exp-tools">
    <div class="exp-search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="search-expenses" class="lk-sin" placeholder="Search expenses..." value="${escHtml(expFilter.search)}"
             oninput="capFirstChar(this);expFilter.search=this.value;expFilter.page=1;_dExpenses()">
      ${lkSearchX('search-expenses','expFilter','expenses')}
    </div>
    <select class="exp-select${expFilter.cat!=='All'?' is-set':''}" onchange="expFilter.cat=this.value;expFilter.page=1;renderPage('expenses')" title="Filter by category">
      <option value="All">All Categories</option>${catOpts}
    </select>
    ${/* Adding a category used to mean leaving the page, finding it in Settings,
         adding it, and coming back — in the middle of entering an expense that
         needed it. */''}
    <select class="exp-select${expFilter.method!=='All'?' is-set':''}" onchange="expFilter.method=this.value;expFilter.page=1;renderPage('expenses')" title="Filter by payment method">
      <option value="All">All Payment Methods</option>
      ${EXP_METHODS.map(m => `<option value="${escHtml(m)}" ${expFilter.method===m?'selected':''}>${escHtml(m)}</option>`).join('')}
      ${/* The records written before the method was captured. Reachable, so
            they can be completed rather than merely noticed. */''}
      <option value="None" ${expFilter.method==='None'?'selected':''}>Not recorded</option>
    </select>
    <button class="exp-catadd" onclick="showAddExpenseCategoryModal()" title="Add a new expense category">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      Category
    </button>
    <div class="exp-month">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>
      <select onchange="expSetMonth(this.value)" title="Filter by month">
        <option value="All" ${scope==='All'?'selected':''}>All Months</option>
        ${monthOpts}
      </select>
    </div>
    ${tbExport({ id:'exp-export', cls:'exp-catadd',
                 excel:'exportExpensesExcel()', pdf:'exportExpensesPDF()' })}
    <div class="exp-count">${_pg.total} record${_pg.total!==1?'s':''} &middot; <b>${fmtPKR(total)}</b></div>
  </div>`;

  // ── Table ─────────────────────────────────────────────────────────────────
  const rows = _pg.slice.map(e => {
    const hue = expCatHue(e.category);
    return `<tr>
      <td class="exp-date">${escHtml(fmtDate(e.date))}</td>
      <td>
        <span class="exp-cat ${hue}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">${expCatIcon(e.category)}</svg>
          ${escHtml(e.category || 'Other')}
        </span>
      </td>
      <td class="exp-desc">${e.description ? escHtml(e.description) : '<span class="exp-dash">—</span>'}</td>
      <td class="exp-amt">${expMoney(e.amount)}</td>
      ${/* A funds transfer is not an expense record and has no form behind it,
            so it carries neither field and says so rather than borrowing one. */''}
      <td>${e._transfer ? '<span class="exp-dash">—</span>' : expMethodChip(e.method)}</td>
      <td>${e._transfer ? '<span class="exp-dash">—</span>' : expWhoChip(e.handedTo)}</td>
      <td>
        <div class="exp-acts">
          <button class="exp-act dh-blue" onclick="${e._transfer?`showEditTransferModal('${e.id}')`:`showEditExpenseModal('${e.id}')`}" title="Edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="exp-act dh-red" onclick="${e._transfer?`deleteTransfer('${e.id}')`:`deleteExpense('${e.id}')`}" title="Delete"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const table = `
  <div class="exp-shell">
    <div class="exp-table-wrap">
      <table class="exp-table">
        <thead><tr>
          ${th('date','Date')}
          ${th('category','Category')}
          ${th('description','Description')}
          ${th('amount','Amount')}
          ${th('method','Payment Method')}
          ${th('handedTo','Added By')}
          <th>Actions</th>
        </tr></thead>
        <tbody>
          ${_pg.total===0
            ? `<tr><td colspan="7"><div class="exp-empty">
                 <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
                 <div>No expenses match these filters.</div></div></td></tr>`
            : rows}
        </tbody>
      </table>
    </div>
    ${expPager(_pg)}
  </div>`;

  return stats + toolbar + table;
}

// Month dropdown → filter state. 'All' switches the page out of month scope.
function expSetMonth(v) {
  if (v === 'All') { expFilter.showAll = true; expFilter.month = ''; }
  else             { expFilter.showAll = false; expFilter.month = v; }
  expFilter.page = 1;
  renderPage('expenses');
}

// 'YYYY-MM' → 'August 2026'. Built from a fixed day so a short month can never
// roll the date into the next one.
function fmtMonthLabel(ym) {
  const y = Number(String(ym).slice(0,4)), m = Number(String(ym).slice(5,7));
  if (!y || !m) return String(ym||'');
  return new Date(y, m-1, 1).toLocaleDateString('en-GB', { month:'long', year:'numeric' });
}

function expPager(pg) {
  const btn = (label, target, o) => {
    o = o || {};
    if (o.disabled) return `<button disabled>${label}</button>`;
    if (o.active)   return `<button class="is-on">${label}</button>`;
    return `<button onclick="gotoPage(expFilter,'expenses',${target})">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1) + (lo>2?'<span class="exp-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page});
  if (hi < pages) nums += (hi<pages-1?'<span class="exp-pager__gap">…</span>':'') + btn(String(pages), pages);

  return `<div class="exp-foot">
    <div class="exp-foot__info">Showing ${pg.from} to ${pg.to} of ${pg.total} record${pg.total!==1?'s':''}</div>
    <div class="exp-pager">
      ${btn('«',1,{disabled:page<=1})}
      ${btn('‹',page-1,{disabled:page<=1})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages})}
      ${btn('»',pages,{disabled:page>=pages})}
    </div>
    <div class="exp-foot__size">
      <select onchange="expFilter.pageSize=Number(this.value);expFilter.page=1;renderPage('expenses')" title="Rows per page">
        ${[10,30,50,100].map(n=>`<option value="${n}" ${expFilter.pageSize===n?'selected':''}>${n} / page</option>`).join('')}
      </select>
    </div>
  </div>`;
}
// Where an expense write should re-render to. Expenses are now editable from
/* ── ADD A CATEGORY, FROM WHERE IT IS NEEDED ─────────────────────────────────
   Settings already had addExpenseCategory(), but it reads a field that only
   exists on the Settings page and always re-renders Settings, so it cannot be
   called from here. This one is page-agnostic: it re-renders whatever the
   warden was looking at, so adding a category from the Expenses page leaves
   them on the Expenses page.

   It also validates harder than the Settings version, which compared with a
   case-sensitive includes() — so "gas" and "Gas" could both exist, and an
   expense filed under one was invisible when filtering by the other. */
function showAddExpenseCategoryModal() {
  // 'expenses' is not a permission. PERMS declares edit / delete / payments /
  // reports / backup / settings / users, and canDo() fails closed on
  // anything else — so this gate denied EVERY account, including the built-in
  // full-access one, and the toast read 'does not have permission to: expenses'
  // because requirePerm found no label to print either. Adding a category is an
  // ordinary record edit, which is the permission the Add Expense form itself
  // sits behind.
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  showModal('modal-sm', 'Add Expense Category', `
    <div class="field">
      <label for="new-exp-cat">Category name</label>
      <input class="form-control" id="new-exp-cat" maxlength="40" autocomplete="off"
             placeholder="e.g. Generator Fuel"
             oninput="capFirstChar(this);_expCatValidate()"
             onkeydown="if(event.key==='Enter'){event.preventDefault();submitAddExpenseCategory();}">
      <div id="new-exp-cat-err" class="field-err" style="display:none"></div>
    </div>
    <p style="font-size:12px;color:var(--text3);line-height:1.6;margin:10px 0 0">
      It becomes available immediately on the Add Expense form and in the filter
      above. Categories can be removed in Settings, but only while nothing is
      filed under them.
    </p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="new-exp-cat-save" onclick="submitAddExpenseCategory()">Add Category</button>`);
  setTimeout(() => { const i = document.getElementById('new-exp-cat'); if (i) i.focus(); }, 60);
}

/* Inline validation: the warden is told WHILE typing, not after pressing Save. */
function _expCatValidate() {
  const inp = document.getElementById('new-exp-cat');
  const err = document.getElementById('new-exp-cat-err');
  const btn = document.getElementById('new-exp-cat-save');
  if (!inp || !err) return true;
  const v = inp.value.trim();
  const list = DB.settings.expenseCategories || [];
  let msg = '';
  if (!v)                                                   msg = '';
  else if (v.length < 2)                                    msg = 'Too short — use at least 2 characters.';
  else if (list.some(c => String(c).toLowerCase() === v.toLowerCase()))
                                                            msg = '"' + v + '" already exists.';
  else if (!/[A-Za-z؀-ۿ]/.test(v))                msg = 'A category needs at least one letter.';
  const ok = !msg && v.length >= 2;
  err.textContent = msg;
  err.style.display = msg ? 'block' : 'none';
  inp.classList.toggle('is-invalid', !!msg);
  if (btn) { btn.disabled = !ok; btn.style.opacity = ok ? '' : '.55'; btn.style.cursor = ok ? '' : 'not-allowed'; }
  return ok;
}

async function submitAddExpenseCategory() {
  if (!_expCatValidate()) return;
  const inp = document.getElementById('new-exp-cat');
  const v = inp ? inp.value.trim() : '';
  if (!v) return;
  if (!DB.settings.expenseCategories) DB.settings.expenseCategories = [];
  // Before 'Other', so the catch-all stays last — the same placement
  // _initDBFields() uses for the Fund Transfer category.
  const oi = DB.settings.expenseCategories.findIndex(c => /^other$/i.test(String(c)));
  if (oi >= 0) DB.settings.expenseCategories.splice(oi, 0, v);
  else         DB.settings.expenseCategories.push(v);
  const okSave = await saveDB();
  if (okSave === false) { toast('Could not save the category — nothing was changed', 'error'); return; }
  logActivity('Expense Category Added', v, 'Settings');
  closeModal();
  renderPage(typeof currentPage !== 'undefined' && currentPage ? currentPage : 'expenses');
  toast('Category "' + v + '" added', 'success');
}

// the Reports → Expenses by Category register as well as this page, and
// hard-coding 'expenses' navigated the owner off the report they were reading
// the moment they corrected a figure in it.
function _expReturnPage() {
  return currentPage === 'reports' ? 'reports' : 'expenses';
}

/* ══ THE EXPENSE FORM (add and edit expense.png) ═══════════════════════════
   One form, two headings. Everything the reference draws is here except what
   this app cannot stand behind — see EXP_METHODS above for why the method list
   is closed, and §21 for why a missing person prints a dash rather than the
   name of whoever happens to be signed in.

   REQUIRED-NESS IS NOT THE SAME ON BOTH SIDES. The reference marks Description
   and "Expense By / Handed To" required, and on a new record they are. On an
   EDIT they are required only if the record already carries them: a warden
   correcting the amount on an expense written in July must not be made to
   invent a payee for it before the correction will save. */

/** The file staged by the attach control, held until the form is saved. */
let _expReceipt = null;

const EXP_RECEIPT_MAX  = 4 * 1024 * 1024;   // what is STORED, after downscaling
const EXP_RECEIPT_PICK = 12 * 1024 * 1024;  // what may be picked, before it
const EXP_IMG_MAX_PX   = 1400;

function _expField(label, ico, ctrl, o) {
  o = o || {};
  return `<div class="field${o.full ? ' col-full' : ''}">
    <label${o.for ? ` for="${o.for}"` : ''}>${escHtml(label)}${o.req ? '<span class="req"> *</span>' : ''}</label>
    <div class="hf-in${o.top ? ' hf-in--top' : ''}${o.readonly ? ' is-readonly' : ''}">
      <span class="hf-in__i">${icon(ico, 'xs')}</span>${ctrl}
    </div>${o.note ? `<div class="hi-note">${o.note}</div>` : ''}
  </div>`;
}

/** The attach / attached panel. `rec` is the stored receipt, or null. */
function _expReceiptPanel(rec) {
  if (!rec) {
    return `<div class="exf-rcpt">
      <span class="exf-rcpt__i">${icon('clipboard','sm')}</span>
      <div class="exf-rcpt__b">
        <div class="exf-rcpt__t">Attach receipt <span>(optional)</span></div>
        <div class="exf-rcpt__s">A photo or PDF of the bill. Images are scaled down before they are stored.</div>
      </div>
      <button type="button" class="set-btn" onclick="document.getElementById('f-ercpt-file').click()">
        ${icon('upload','xs')} Choose file</button>
    </div>`;
  }
  const kb = Math.max(1, Math.round(Number(rec.size || 0) / 1024));
  const isImg = String(rec.type || '').indexOf('image/') === 0;
  return `<div class="exf-rcpt is-set">
    <span class="exf-rcpt__i">${icon('clipboard','sm')}</span>
    <div class="exf-rcpt__b">
      <div class="exf-rcpt__t">Attached receipt</div>
      <div class="exf-rcpt__n">${escHtml(rec.name || 'receipt')}</div>
      <div class="exf-rcpt__s">${kb} KB &middot; ${isImg ? 'Image' : 'PDF'}</div>
    </div>
    <button type="button" class="set-btn" onclick="expReceiptView()">${icon('eye','xs')} View</button>
    <button type="button" class="set-btn set-btn--danger" onclick="expReceiptRemove()">${icon('trash','xs')} Remove</button>
  </div>`;
}

function _expRepaintReceipt() {
  const host = document.getElementById('f-ercpt');
  if (host) host.innerHTML = _expReceiptPanel(_expReceipt);
}

/* Images are re-encoded at EXP_IMG_MAX_PX before they are kept. A 12MP phone
   photo of an electricity bill is four megabytes of JSON in a database that is
   read whole on every boot; the same bill at 1400px is readable and about
   150KB. PDFs are stored as they came — re-encoding one would mean rendering
   it, and a bill is a document, not a picture of one. */
function expReceiptLoad(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  input.value = '';
  const type = String(file.type || '');
  const isImg = type.indexOf('image/') === 0;
  const isPdf = type === 'application/pdf';
  if (!isImg && !isPdf) { toast('Attach an image or a PDF of the bill', 'error'); return; }
  if (file.size > EXP_RECEIPT_PICK) { toast('That file is over 12MB — pick a smaller one', 'error'); return; }

  const keep = (dataUrl, size) => {
    if (String(dataUrl).length > EXP_RECEIPT_MAX * 1.4) {
      toast('That file is too large to store — try a photo instead of a scan', 'error');
      return;
    }
    _expReceipt = { name: file.name || 'receipt', type: isImg ? 'image/jpeg' : type, size, data: dataUrl };
    _expRepaintReceipt();
  };

  const reader = new FileReader();
  reader.onerror = () => toast('That file could not be read', 'error');
  reader.onload = ev => {
    const raw = String(ev.target.result || '');
    if (!isImg) { keep(raw, file.size); return; }
    const img = new Image();
    img.onerror = () => toast('That file is not an image the app can read', 'error');
    img.onload = () => {
      try {
        const scale = Math.min(1, EXP_IMG_MAX_PX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        /* JPEG, not PNG: a photographed bill is a photograph. PNG would store
           it losslessly at several times the size for no legibility gained. */
        const out = cv.toDataURL('image/jpeg', 0.82);
        keep(out, Math.round(out.length * 0.75));
      } catch (err) { toast('That image could not be read', 'error'); }
    };
    img.src = raw;
  };
  reader.readAsDataURL(file);
}

function expReceiptRemove() { _expReceipt = null; _expRepaintReceipt(); }

/* Images open in a viewer; a PDF is written back to disk, because the window's
   CSP has no frame-src and a data: URL cannot be framed. Both are the stored
   bytes — nothing is re-fetched. */
function expReceiptView() {
  const r = _expReceipt;
  if (!r) return;
  if (String(r.type || '').indexOf('image/') === 0) {
    showModal('modal-md',
      `<div class="hf-mh"><div class="hf-mh__ico">${icon('clipboard','sm')}</div>
        <div><div class="hf-mh__t">Receipt</div>
        <div class="hf-mh__s">${escHtml(r.name || '')}</div></div></div>`,
      `<div class="exf-rcpt__view"><img src="${escHtml(r.data)}" alt="${escHtml(r.name || 'Receipt')}"></div>`,
      `<div class="hf-actions">
         <button class="btn btn-secondary" onclick="closeModal()">Close</button>
         <button class="btn btn-primary" onclick="expReceiptSaveCopy()">${icon('download','xs')} Save a copy</button>
       </div>`);
    return;
  }
  expReceiptSaveCopy();
}

async function expReceiptSaveCopy() {
  const r = _expReceipt;
  if (!r) return;
  if (!window.electronAPI || typeof window.electronAPI.saveDataUrl !== 'function') {
    toast('This build cannot save files', 'error'); return;
  }
  const res = await window.electronAPI.saveDataUrl(r.data, r.name || 'receipt');
  if (res && res.success) toast('Receipt saved', 'success');
  else if (res && res.reason && res.reason !== 'cancelled') toast(res.reason, 'error');
}

/**
 * The expense form.
 * @param {string} [id] existing expense id; omit to add a new one.
 */
function showExpenseModal(id) {
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const e = id ? (DB.expenses || []).find(x => x.id === id) : null;
  if (id && !e) return;

  _expReceipt = e && e.receipt ? e.receipt : null;

  /* An edit offers whatever the record already holds even if the hostel has
     since deleted that category, so re-saving an old expense cannot silently
     re-file it under something else. */
  const cats = (DB.settings.expenseCategories || []).slice();
  if (e && e.category && cats.indexOf(e.category) === -1) cats.unshift(e.category);
  const catOpts = cats.map(c =>
    `<option ${e && e.category === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('');

  const methods = EXP_METHODS.slice();
  if (e && e.method && methods.indexOf(e.method) === -1) methods.unshift(e.method);
  const methodOpts = methods.map(m =>
    `<option value="${escHtml(m)}" ${e && e.method === m ? 'selected' : ''}>${escHtml(m)}</option>`).join('');

  const people = expPeople();
  const desc   = e ? String(e.description || '') : '';

  const reqDesc = !e || !!desc;
  const reqWho  = !e || !!(e.handedTo);

  const head = e
    ? `<div class="exf-rec">
         <span class="exf-rec__i">${icon('receipt','sm')}</span>
         <div class="exf-rec__b">
           <div class="exf-rec__t">Expense record</div>
           <div class="exf-rec__s">Update the details below and save your changes.</div>
         </div>
         <div class="exf-rec__amt"><b>${escHtml(fmtPKR(e.amount))}</b><span>Total amount</span></div>
       </div>`
    : `<div class="exf-note">${icon('info','sm')}
         <div>Keep track of your operational expenses to maintain accurate financial records.</div>
       </div>`;

  showModal('modal-form',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon(e ? 'edit' : 'expense', 'sm')}</div>
       <div><div class="hf-mh__t">${e ? 'Edit Expense' : 'Add Expense'}</div>
       <div class="hf-mh__s">${e ? 'Update expense details and save your changes.' : 'Record a new expense for your hostel.'}</div></div>
     </div>`,
    head + `
    <datalist id="exp-people">${people.map(n => `<option value="${escHtml(n)}"></option>`).join('')}</datalist>
    <div class="hf-g2">
      ${_expField('Expense category', 'tag',
        `<select class="form-control" id="f-ecat">${catOpts}</select>`, { req: true, for: 'f-ecat' })}
      ${_expField('Amount (PKR)', 'money',
        `<input class="form-control" id="f-eamt" type="number" min="1" step="1" placeholder="Enter amount"
                value="${e ? escHtml(String(e.amount)) : ''}">`, { req: true, for: 'f-eamt' })}
      ${_expField('Expense date', 'calendar',
        `<input class="form-control cdp-trigger" id="f-edate" type="text" readonly
                onclick="showCustomDatePicker(this,event)" value="${escHtml(e ? (e.date || '') : today())}">`,
        { req: true, for: 'f-edate' })}
      ${_expField('Payment method', 'card',
        `<select class="form-control" id="f-emethod">
           <option value="">Not recorded</option>${methodOpts}</select>`,
        { for: 'f-emethod',
          note: 'How the money left the hostel. Blank is allowed and prints as a dash.' })}
      ${_expField('Expense by / handed to', 'person',
        `<input class="form-control" id="f-ewho" list="exp-people" autocomplete="off"
                placeholder="Select or enter name" value="${e ? escHtml(e.handedTo || '') : ''}">`,
        { req: reqWho, full: true, for: 'f-ewho',
          note: 'Who spent it, or who the cash was handed to. Names already used are suggested.' })}
      ${_expField('Description', 'fileText',
        `<textarea class="form-control" id="f-edesc" rows="3" maxlength="250"
                   placeholder="e.g. Electricity bill for September 2026…"
                   oninput="expDescCount()">${escHtml(desc)}</textarea>`,
        { req: reqDesc, full: true, top: true, for: 'f-edesc' })}
    </div>
    <div class="hi-note exf-count" id="f-edesc-count">${desc.length}/250</div>
    <div id="f-ercpt">${_expReceiptPanel(_expReceipt)}</div>
    <input type="file" id="f-ercpt-file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden
           onchange="expReceiptLoad(this)">`,
    `<div class="hf-actions">
       <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       ${e ? `<span class="hf-actions__spacer"></span>
              <button class="btn btn-danger" onclick="expDeleteFromForm('${escHtml(String(id))}')">${icon('trash','xs')} Delete</button>` : ''}
       <button class="btn btn-primary" onclick="submitExpense(${e ? `'${escHtml(String(id))}'` : ''})">
         ${icon('save','xs')} ${e ? 'Update expense' : 'Save expense'}</button>
     </div>`);
}

/* DELETE, FROM INSIDE THE OPEN FORM.
   showConfirm() calls showModal(), and showModal() replaces #modal-container
   wholesale — so raising the confirmation from the edit form DESTROYS the edit
   form, and answering Cancel used to leave the warden looking at the register
   with their half-finished correction gone and nothing said about it. The
   cancel path reopens the form, and puts back the receipt they had staged but
   not yet saved, which reopening from the record alone would drop. */
function expDeleteFromForm(id) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  const staged = _expReceipt;
  showConfirm('Delete expense?', 'This cannot be undone.',
    () => _expDoDelete(id),
    () => { showExpenseModal(id); _expReceipt = staged; _expRepaintReceipt(); });
}

function expDescCount() {
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('f-edesc'));
  const out = document.getElementById('f-edesc-count');
  if (box && out) out.textContent = box.value.length + '/250';
}

/* The two entry points the rest of the app already calls. */
function showAddExpenseModal()     { showExpenseModal(); }
function showEditExpenseModal(id)  { showExpenseModal(id); }

/**
 * Write the form. One path for add and edit, because two paths is how the
 * add form gained a payment method and the edit form quietly dropped it.
 * @param {string} [id]
 */
async function submitExpense(id) {
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const e = id ? (DB.expenses || []).find(x => x.id === id) : null;
  if (id && !e) return;

  const cat    = document.getElementById('f-ecat').value;
  const amount = parseFloat(document.getElementById('f-eamt').value);
  const date   = document.getElementById('f-edate').value;
  const method = document.getElementById('f-emethod').value;
  const who    = document.getElementById('f-ewho').value.trim();
  const desc   = document.getElementById('f-edesc').value.trim();

  if (!cat) { toast('Pick a category', 'error'); return; }
  /* > 0, not merely truthy. A minus sign in front of the figure passed the old
     check and wrote a negative expense, which does not reduce what was spent —
     it quietly adds to the month's profit. */
  if (!isFinite(amount) || amount <= 0) {
    toast('Enter an amount greater than zero', 'error');
    document.getElementById('f-eamt')?.focus();
    return;
  }
  if (!date) { toast('Pick a date', 'error'); return; }
  if (!e && !who)  { toast('Say who spent it or who it was handed to', 'error');
                     document.getElementById('f-ewho')?.focus(); return; }
  if (!e && !desc) { toast('Describe what the money was for', 'error');
                     document.getElementById('f-edesc')?.focus(); return; }

  const rec = e || { id: 'e_' + uid() };
  rec.category    = cat;
  rec.amount      = amount;
  rec.date        = date;
  rec.description = desc;
  /* Deleted rather than written empty: an absent key is what every reader
     already treats as "not recorded", and a stored '' would make the "Not
     recorded" filter and the export's dash disagree about the same row. */
  if (method) rec.method = method; else delete rec.method;
  if (who)    rec.handedTo = who;  else delete rec.handedTo;
  if (_expReceipt) rec.receipt = _expReceipt; else delete rec.receipt;

  if (!e) { if (!DB.expenses) DB.expenses = []; DB.expenses.push(rec); }

  logActivity(e ? 'Expense Updated' : 'Expense Added', cat + ' — PKR ' + amount, 'Finance');
  _expReceipt = null;
  await saveDB();
  closeModal();
  renderPage(_expReturnPage());
  toast(e ? 'Expense updated' : 'Expense recorded', 'success');
}

/* The names the rest of the app calls. */
async function submitAddExpense()      { return submitExpense(); }
async function submitEditExpense(id)   { return submitExpense(id); }

/* The deletion itself, with no confirmation of its own — both callers raise
   their own, and nesting them asked the warden the same question twice. */
async function _expDoDelete(id) {
  /* GUARDED HERE TOO, not only at the two entry points that call it. Both of
     them return before reaching this line, so the warden never sees two
     refusals — this is the line that keeps a future caller from becoming the
     next unguarded delete. */
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  const _del_e=DB.expenses.find(x=>x.id===id);
  DB.expenses=DB.expenses.filter(x=>x.id!==id);
  if(_del_e) logActivity('Expense Deleted', _del_e.category+' — PKR '+_del_e.amount, 'Finance');
  await saveDB(); renderPage(_expReturnPage()); toast('Expense deleted','info');
}

async function deleteExpense(id) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  showConfirm('Delete expense?','This cannot be undone.', () => _expDoDelete(id));
}

// The CLEAR DATA block that stood here is gone. Owner's call, 2026-08-31:
// "remove clear all data features from sidebar ... it is not a professional
// feature". It was one button, behind one password, that emptied every table in
// the database — written in the app's first weeks and never once needed by a
// hostel. Backup & Restore is the supported way to reset an install, and it
// leaves a file behind rather than a hole.
//
// Removed with it: the sidebar entry (index.html), the `clearall` permission
// (auth-nev.js) — which the PR #19 guard test would otherwise have failed on,
// correctly, for being declared and checked nowhere — and the regression spec
// that covered its password gate.

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
let reportPeriod='month';
/* WHICH month "This Month" means (owner ref: `reports2.png`, which draws a
   month dropdown in the report bar). It was hard-wired to thisMonth(), so the
   only way to see August from September was Custom Range with the same month
   at both ends — three controls for the commonest question this page is asked.
   Evaluated at load and reset by rptSetPeriod(), so a session left open past
   the turn of a month still opens on the month it now is. */
let reportMonth = thisMonth();
let reportDetail=null;
let studentReportFilter='All';
// PERF: pagination state for Reports KPI-card detail tables. Rendering EVERY row
// (all payments/students) into the DOM on each card click was the source of the lag;
// we now slice to PAGE_SIZE like the Students/Payments screens. _lastKey lets us reset
// to page 1 only when the detail type or sub-filter changes (not when paging within one).
let reportDetailFilter={page:1,_lastKey:''};

// ════════════════════════════════════════════════════════════════════════════
// REPORT DETAIL RENDERERS
// ════════════════════════════════════════════════════════════════════════════