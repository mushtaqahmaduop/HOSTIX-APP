/* ─── HOSTYLLO — EXPENSES MODULE ─────────────────────────────────────────────
   Contains: renderExpenses, showAddExpenseModal, submitAddExpense,
             showEditExpenseModal, submitExpense, deleteExpense
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ════════════════════════════════════════════════════════════════════════════
// EXPENSES v5 — rebuilt to the owner's reference design
// ════════════════════════════════════════════════════════════════════════════

// Categories are owner-configurable, so the icon is matched on keywords rather
// than against a fixed list — a hostel that renames "Meals" to "Staff Nashta"
// still gets the food icon.
//
// The second column used to be a hue (dh-amber, dh-blue, dh-violet…), and a
// hash picked one for the categories where no colour was obvious. Both are gone
// (design spec Part 4, 2026-09-16): colour is reserved for status, a category
// is not a status, and five chip roles replace the 83 badge variants. The
// category chip is neutral and the icon is what tells two of them apart.
const _EXP_CATS = [
  [/electric|light|wapda|bulb/i, '<path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/>'],
  [/water|tank|plumb|pipe|tap/i, '<path d="M12 2s6 7.5 6 11.5A6 6 0 0 1 6 13.5C6 9.5 12 2 12 2Z"/>'],
  [/gas|fuel|cylinder/i,         '<path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 2 0 0-2-1-3 1-5Z"/>'],
  [/maint|repair|fix|tool/i,     '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-1.4-1.4 2.6-2.6Z"/>'],
  [/clean|wash|soap|sweep/i,     '<path d="M9 3h6v5H9z"/><path d="M8 8h8l1 13H7L8 8Z"/>'],
  [/secur|guard|chowkidar/i,     '<path d="M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5l-8-3Z"/>'],
  [/internet|wifi|net|ptcl/i,    '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1.2"/>'],
  [/furnit|bed|chair|table/i,    '<path d="M3 10V6h18v4"/><path d="M3 10h18v6H3z"/><path d="M5 16v3M19 16v3"/>'],
  [/meal|nashta|food|lunch|dinner|chai|tea|breakfast|kitchen|rashan/i,
                                 '<path d="M7 2v9M4 2v6a3 3 0 0 0 3 3M17 2c-1.5 0-2.5 1.5-2.5 4s1 4 2.5 4"/><path d="M7 11v11M17 10v12"/>'],
  [/rent|salary|staff|wage|pay/i, '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 1.6c-3.2 0-6.4 1.6-6.4 4V19a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1v-1.4c0-2.4-3.2-4-6.4-4Z"/>'],
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
  return `<span class="ui-chip ui-chip--neutral">${escHtml(v)}</span>`;
}

/** Initials avatar + name, or an honest dash. @see spec §21 */
function expWhoChip(who) {
  const v = String(who || '').trim();
  if (!v) return '<span class="exp-dash">—</span>';
  /* A vendor name is the one value in this column that can genuinely be long
     — "WAPDA Office Peshawar" wants 224px in a 150px column — and unlike a
     date or an amount it reads correctly shortened. It ellipsises and carries
     the hover card; the columns that must NOT shorten got the width instead. */
  return `<span class="exp-who" data-tip="${escHtml(v)}" data-tip-label="Vendor"><i class="ui-avatar">${escHtml(expInitials(v))}</i><span class="exp-who__t">${escHtml(v)}</span></span>`;
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
  return hit ? hit[1] : _EXP_ICON_FALLBACK;
}

/* expCatHue() lived here and coloured the category pill. Deleted 2026-09-16
   with the dh-* classes it returned — see the note on _EXP_CATS. */

/* The card sparklines are gone (owner, 2026-09-15: "remove all the zig zag
   lines from expenses kpis"). expSpark() drew them and nothing else did. */

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
          !String(e.method || '').toLowerCase().includes(q) &&
          !String(e.refNo || '').toLowerCase().includes(q)) return false;
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
    addedByName: e => String(e.addedByName || '').toLowerCase(),
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
/* ── THE EXPENSE COLUMNS, IN ONE PLACE (owner, 2026-09-23) ───────────────────
   "in the expense pdf align date, description column, Vendor, added and amount
   columns to the above categories in pdfs ... and there is also a difference
   between the expense page pdf and reports page expense pdf".

   There were two definitions. This page printed nine columns; the Reports
   page's expense section printed three — Date, Description, Amount — written
   separately in reports.js. So the same category, exported from two screens on
   the same day, produced two different documents, and the one a warden reached
   from Reports was missing the vendor, the method and who entered it.

   One definition, both callers, which is the rule the Payments, Students,
   Cancellations and Issues sections of the whole-report export already follow:
   each reads its register's own columns rather than restating them.

   `opts.grouped` drops the Category column. On this page the PDF groups by
   category and prints the name as the table's own heading, so a Category
   column would repeat that name on every row — which is the same noise the
   owner is removing from the subtotals. The workbook keeps it (`excel:false`
   on the column would have hidden it from a spreadsheet that needs it to
   filter), so the grouped/ungrouped split is about the PRINTED page only. */
function expExportColumns(opts) {
  opts = opts || {};
  return [
    { label: 'Date', type: 'date', width: 12, value: e => e.date || '' },
    { label: 'Category', type: 'text', width: 16, excel: false, pdf: !opts.grouped,
      value: e => e.category || 'Uncategorised' },
    { label: 'Description', type: 'wrap', width: 28,
      value: e => e.description || '',
      get:   e => escHtml(e.description || '—') +
                  (e._transfer ? '<span class="sub">funds transfer</span>' : '') },
    { label: 'Method', type: 'text', width: 12,
      value: e => e._transfer ? '' : (e.method || '') },
    /* THE RECEIVER. It was headed "Paid To"; "Vendor" is the word a ledger
       uses and it is unambiguous beside the Added By column that follows —
       which is the entering account, and is a different person. */
    { label: 'Vendor', type: 'text', width: 16,
      value: e => e._transfer ? '' : (e.handedTo || '') },
    { label: 'Added By', type: 'text', width: 14,
      value: e => e._transfer ? '' : (e.addedByName || '') },
    { label: 'Type', type: 'text', width: 14, pdf: false,
      value: e => e._transfer ? 'Funds transfer' : 'Expense' },
    { label: 'Amount', type: 'money', width: 16, total: 'sum',
      value: e => Number(e.amount || 0),
      get:   e => '<b>' + fmtPKR(e.amount) + '</b>' },
    /* THE BILL'S OWN NUMBER (owner, 2026-09-28). Printed as well as exported:
       matching a register line to the paper bill is what the number is for. */
    { label: 'Receipt No.', type: 'text', width: 14,
      value: e => e._transfer ? '' : (e.refNo || '') },
    { label: 'Receipt', type: 'text', width: 10, pdf: false,
      value: e => e.receipt ? 'Attached' : '' },
    /* The app's internal id. It was headed "Reference", which next to a
       receipt's reference number would have been two different things under
       one word. */
    { label: 'Record ID', type: 'id', width: 16, pdf: false, value: e => String(e.id || '') },
  ];
}

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

  // Grouped by category on the printed page, so the Category column would
  // repeat each table's own heading on every row.
  const columns = expExportColumns({ grouped: true });

  /* SUB-TOTAL, NOT THE CATEGORY NAME A THIRD TIME (owner, 2026-09-23: "remove
     Total-category because [it] just repeats the category name again and again
     which gives the report a messy look, only the Sub-Total for that category
     should be used").

     The name was already the table's heading and already on its meta line; a
     footer reading "Electricity total" said it once more, directly under a
     block of Electricity rows. On a register with ten categories that is ten
     redundant restatements down one page.

     The grouped table prints each category's name as its own heading, so
     "Sub-Total" is unambiguous — it can only be the sub-total of the table it
     sits in. The single-category export keeps the name, because there is no
     grouping heading above it to be unambiguous against. */
  const groups = one
    ? [{ rows, total: { label: expFilter.cat + ' — Sub-Total', value: fmtPKR(total) } }]
    : ordered.map(([cat, list]) => ({
        label: cat,
        meta: list.length + ' record' + (list.length === 1 ? '' : 's') +
              (total > 0 ? ' · ' + Math.round(catTotal(list) / total * 100) + '% of spend' : ''),
        rows: list,
        total: { label: 'Sub-Total', value: fmtPKR(catTotal(list)) },
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
    /* One heading row for the whole register, not one per category (owner,
       2026-09-24) — a category is its own row and its Sub-Total. See
       exGroupedTable() in export/engine.js. */
    oneTable: true,

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

  const scopeLabel = scope === 'All' ? 'All months'
                   : scope === mo    ? 'This Month'
                   : fmtMonthLabel(scope);

  /* §6.1 wants the movement against the previous comparable period on the
     headline card, and §7 asks for "a simple indicator" rather than a second
     graphic — so it is a chip beside the figure.

     UP IS NOT GOOD HERE, which is why the roles look inverted. On a spending
     register a rise is the thing worth noticing, so it takes the WARNING role
     and a fall takes SUCCESS — the opposite of the same indicator on Payments,
     where collection rising is the good outcome. "No comparison" is a
     first-class state and wears the neutral role: §7 forbids fabricating a
     percentage when there is no previous period. */
  const _d = expPrevDelta(scope);
  const _expTrend = _d === null
    ? `<span class="ui-chip ui-chip--neutral" title="No previous period to compare against">No comparison</span>`
    : `<span class="ui-chip ${_d.pct >= 0 ? 'ui-chip--warning' : 'ui-chip--success'}" title="vs ${escHtml(_d.prev)}">`
      /* SVG, not the \u2197 / \u2198 characters: they were text standing in for an icon,
         they sat off the chip baseline, and the glyph is wider than the arrow
         it draws \u2014 which is what pushed this chip onto a line of its own. */
      + `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">`
      + (_d.pct >= 0 ? `<path d="M7 17 17 7"/><path d="M9 7h8v8"/>` : `<path d="M7 7l10 10"/><path d="M17 9v8H9"/>`)
      + `</svg>`
      /* Past ten-fold, a ratio stops being a percentage anyone reads and becomes
         a shape, so it is said as one. A month that spent PKR 8,000 followed by
         one that spent 76,000 is "850.0%" \u2014 true and useless, and the exact kind
         of figure the expenses spec \u00a77 and payments spec \u00a76 both rule out. */
      + `${Math.abs(_d.pct) >= 1000 ? '>10\u00d7' : Math.abs(_d.pct).toFixed(1) + '%'}</span>`;

  /* `trend` is a SIBLING of the value, never inside it. Putting it in the value
     element made .exp-stat__v read "PKR 16.7K \u2197 83.3%" — one node holding two
     different numbers, which is wrong for a screen reader and broke a spec that
     reads the headline figure to check it equals the sum of the rows. */
  const stat = (icon, label, value, sub, trend) => `
    <div class="ui-card exp-stat">
      <span class="exp-stat__ic">${icon}</span>
      <div class="exp-stat__c">
        <div class="exp-stat__l">${label}</div>
        <div class="exp-stat__vrow">
          <div class="exp-stat__v">${value}</div>
          ${trend || ''}
        </div>
        <div class="exp-stat__s">${sub}</div>
      </div>
    </div>`;

  const stats = `
  <div class="exp-stats">
    ${stat('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
          'Total Expenses', `<span title="${fmtPKR(scopedTotal)}" data-exact="${scopedTotal}">${expMoney(scopedTotal)}</span>`,
          scopedTrf > 0 ? `${scopeLabel} · incl. ${fmtPKR(scopedTrf)} funds transfer` : scopeLabel,
          _expTrend)}
    ${stat('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 15 6-6"/><path d="M15 9h-4"/><path d="M15 9v4"/></svg>',
          'Average Daily', expMoney(avgDaily),
          `Avg per day · ${daysElapsed} day${daysElapsed===1?'':'s'}`)}
    ${stat('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>',
          'Total Records', String(scoped.length), scopeLabel)}
    ${stat('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
          'Categories', String(activeCat), 'Active')}
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

  /* The sort control is a BUTTON inside the header cell, not an onclick on the
     `th` itself: a `th` cannot be focused or pressed from the keyboard, and
     `aria-sort` on the cell is what tells a screen reader which way the column
     runs. The ▲ ▼ ⇅ glyphs are SVG now — they were three of the last text
     characters in the app standing in for icons. */
  const SORT_ICO = {
    asc:  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
    desc: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    none: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 9 5-5 5 5"/><path d="m7 15 5 5 5-5"/></svg>',
  };
  const th = (key, label, extra) => {
    const on  = expFilter.sortKey === key;
    const dir = on ? (expFilter.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    const ico = on ? (expFilter.sortDir === 'asc' ? SORT_ICO.asc : SORT_ICO.desc) : SORT_ICO.none;
    return `<th aria-sort="${dir}" ${extra||''}><button type="button" class="ui-th-sort"
              onclick="toggleSort(expFilter,'expenses','${key}')" title="Sort by ${label}">${label}${ico}</button></th>`;
  };

  /* Toolbar controls are --h-sm and carry an aria-label rather than a visible
     one (design spec Part 4): the placeholder and the first option say what
     each does, and a row of six labels above a filter bar is noise. */
  const toolbar = `
  <div class="ui-card exp-tools">
    <div class="ui-search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="search-expenses" class="ui-search__i" aria-label="Search expenses" placeholder="Search expenses..." value="${escHtml(expFilter.search)}"
             oninput="capFirstChar(this);expFilter.search=this.value;expFilter.page=1;_dExpenses()">
      ${lkSearchX('search-expenses','expFilter','expenses')}
    </div>
    <span class="ui-selectw">
      <select class="ui-select ui-select--sm${expFilter.cat!=='All'?' is-set':''}" aria-label="Filter by category"
              onchange="expFilter.cat=this.value;expFilter.page=1;renderPage('expenses')">
        <option value="All">All categories</option>${catOpts}
      </select>
    </span>
    ${/* Adding a category used to mean leaving the page, finding it in Settings,
         adding it, and coming back — in the middle of entering an expense that
         needed it. */''}
    <span class="ui-selectw">
      <select class="ui-select ui-select--sm${expFilter.method!=='All'?' is-set':''}" aria-label="Filter by payment method"
              onchange="expFilter.method=this.value;expFilter.page=1;renderPage('expenses')">
        <option value="All">All payment methods</option>
        ${EXP_METHODS.map(m => `<option value="${escHtml(m)}" ${expFilter.method===m?'selected':''}>${escHtml(m)}</option>`).join('')}
        ${/* The records written before the method was captured. Reachable, so
              they can be completed rather than merely noticed. */''}
        <option value="None" ${expFilter.method==='None'?'selected':''}>Not recorded</option>
      </select>
    </span>
    <button class="ui-btn ui-btn--secondary ui-btn--sm" onclick="showAddExpenseCategoryModal()" title="Add a new expense category">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      Category
    </button>
    <span class="ui-selectw">
      <select class="ui-select ui-select--sm" aria-label="Filter by month" onchange="expSetMonth(this.value)">
        <option value="All" ${scope==='All'?'selected':''}>All months</option>
        ${monthOpts}
      </select>
    </span>
    ${tbExport({ id:'exp-export', cls:'ui-btn ui-btn--secondary ui-btn--sm',
                 excel:'exportExpensesExcel()', pdf:'exportExpensesPDF()' })}
    <div class="exp-count">${_pg.total} record${_pg.total!==1?'s':''} &middot; <b>${fmtPKR(total)}</b></div>
  </div>`;

  // ── Table ─────────────────────────────────────────────────────────────────
  const rows = _pg.slice.map(e => {
    return `<tr>
      <td class="exp-date">${escHtml(fmtDate(e.date))}</td>
      ${''/* THE CATEGORY CARRIES ITS OWN COLOUR (owner, 2026-09-23). The hue
             comes from expenseCatHue(), which keys by NAME — see the note on
             `.ui-chip--cat` for why the chip is outlined where a status chip
             is not. */}
      <td>
        <span class="ui-chip ui-chip--cat" style="--cat:${expenseCatHue(e.category)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">${expCatIcon(e.category)}</svg>
          ${escHtml(e.category || 'Other')}
        </span>
      </td>
      ${''/* THE DESCRIPTION TAKES ITS SHARE AND NO MORE (owner, 2026-09-23:
             "the description should take specified space and if large then
             hidden it with view on pop hover").

             It was an unconstrained cell, so one long line — "Generator fuel
             and filter change, plus the mechanic's call-out" — widened its
             column and squeezed Vendor and Amount for every other row on the
             page. Fixed width, one line, the rest on the app's own hover
             card. */}
      <td class="exp-desc">${e.description
        ? `<span class="exp-desc__t" data-tip="${escHtml(e.description)}" data-tip-label="Description">${escHtml(e.description)}</span>`
        : '<span class="exp-dash">—</span>'}</td>
      <td class="exp-amt">${expMoney(e.amount)}</td>
      ${/* A funds transfer is not an expense record and has no form behind it,
            so it carries neither field and says so rather than borrowing one. */''}
      <td>${e._transfer ? '<span class="exp-dash">—</span>' : expMethodChip(e.method)}</td>
      <td>${e._transfer ? '<span class="exp-dash">—</span>' : expWhoChip(e.handedTo)}</td>
      ${''/* WHO ENTERED IT, beside who it was paid to. A funds transfer has no
             form behind it and carries neither. */}
      <td>${e._transfer || !e.addedByName
        ? '<span class="exp-dash">—</span>'
        : `<span class="exp-by" data-tip="Entered by ${escHtml(e.addedByName)}" data-tip-label="Added by">${escHtml(ledgerFirstName(e.addedByName))}</span>`}</td>
      ${''/* THE RECEIPT KEEPS A COLUMN OF ITS OWN (owner, 2026-09-23, third
             pass: "add column for receipt again because it squeezes the other
             buttons out of the page").

             It was moved into the Actions group on the second pass, on the
             reasoning that it opens something and is therefore an action. The
             measurement says otherwise: three icon buttons made Actions 136px
             wide in a table that already wanted 1262px inside a 1104px
             wrapper, so the group pushed Edit and Delete off the visible page.

             A column is also honest about what it is. Whether a receipt EXISTS
             is a property of the record — the same kind of fact as its vendor
             or its method — and a dash in that column says "no receipt on
             file", which is a thing a warden needs to see at a glance while
             doing a month's reconciliation. As a button that simply was not
             there, absence said nothing. */}
      ${''/* THE RECEIPT NUMBER RIDES UNDER THE EYE (owner, 2026-09-28: "the
             reference number would fit in the receipt column below the eye
             icon"). Both are the same fact — this record's bill — so they share
             a column rather than costing the register another one. A number
             with no file shows alone; a dash only when there is neither. */}
      <td class="exp-rcptc">${e._transfer || (!e.receipt && !e.refNo)
        ? '<span class="exp-dash">—</span>'
        : `${e.receipt ? `<button type="button" class="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon exp-rcpt-btn"
             onclick="event.stopPropagation();expOpenReceipt('${e.id}')"
             title="View receipt"
             aria-label="View the receipt attached to this ${escHtml(e.category || 'expense')} record">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
           </button>` : ''}${e.refNo
             ? `<span class="exp-refno" data-tip="${escHtml(e.refNo)}" data-tip-label="Receipt no.">${escHtml(e.refNo)}</span>`
             : ''}`}</td>
      <td>
        <div class="exp-acts">
          <button class="ui-btn ui-btn--secondary ui-btn--sm ui-btn--icon" onclick="${e._transfer?`showEditTransferModal('${e.id}')`:`showEditExpenseModal('${e.id}')`}" title="Edit" aria-label="Edit this ${escHtml(e.category || 'expense')} record"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="ui-btn ui-btn--danger ui-btn--sm ui-btn--icon" onclick="${e._transfer?`deleteTransfer('${e.id}')`:`deleteExpense('${e.id}')`}" title="Delete" aria-label="Delete this ${escHtml(e.category || 'expense')} record"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const table = `
  <div class="ui-card ui-card--flush">
    <div class="ui-table-wrap">
      <table class="ui-table exp-table">
        <thead><tr>
          ${th('date','Date')}
          ${th('category','Category')}
          ${th('description','Description')}
          ${th('amount','Amount','class="exp-amt"')}
          ${''/* "Paid Via", not "Payment method" (owner, 2026-09-23: "change
                 payment method to Paid Via that should reduce the taken
                 space"). Two short words instead of two long ones, and the
                 column can then be as narrow as its widest CHIP rather than
                 as wide as its heading. */}
          ${th('method','Paid via')}
          ${''/* VENDOR, AND ADDED BY — two columns, because they are two
                 people (owner, 2026-09-23).

                 `handedTo` has always held the RECEIVER. It was headed "Added
                 by" until 2026-09-16, which named the wrong person entirely
                 and invited a warden to type their own name into it; it became
                 "Paid to" then, and "Vendor" now — the word a ledger uses for
                 the party money went to, and unambiguous beside a column that
                 really is the entering account.

                 That note also said who ENTERED a record "is on the activity
                 log, which is where that question belongs". The log trims at
                 200 entries, so the answer for an older expense is gone; it is
                 stamped on the record now, the same as `admittedBy` on a
                 student. */}
          ${th('handedTo','Vendor')}
          ${th('addedByName','Added by')}
          ${''/* The cell holds one 32px eye and nothing else, so the column is
                 sized for the button rather than for the word above it
                 (owner, 2026-09-23). The heading keeps the word — an icon
                 heading over an icon cell says nothing twice. */}
          <th class="exp-col-rcpt">Receipt</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>
          ${_pg.total===0
            ? `<tr><td colspan="9"><div class="ui-empty">
                 <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
                 <div class="ui-empty__t">No expenses match these filters.</div></div></td></tr>`
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
  const C = 'ui-btn ui-btn--secondary ui-btn--sm';
  const btn = (label, target, o) => {
    o = o || {};
    const lbl = o.aria ? ` aria-label="${o.aria}"` : '';
    if (o.disabled) return `<button class="${C}" disabled${lbl}>${label}</button>`;
    if (o.active)   return `<button class="${C} is-on" aria-current="page">${label}</button>`;
    return `<button class="${C}"${lbl} onclick="gotoPage(expFilter,'expenses',${target})">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1) + (lo>2?'<span class="ui-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page});
  if (hi < pages) nums += (hi<pages-1?'<span class="ui-pager__gap">…</span>':'') + btn(String(pages), pages);

  return `<div class="ui-pagebar">
    <div class="ui-pagebar__info">Showing ${pg.from} to ${pg.to} of ${pg.total} record${pg.total!==1?'s':''}</div>
    <div class="ui-pager">
      ${btn('«',1,{disabled:page<=1, aria:'First page'})}
      ${btn('‹',page-1,{disabled:page<=1, aria:'Previous page'})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages, aria:'Next page'})}
      ${btn('»',pages,{disabled:page>=pages, aria:'Last page'})}
    </div>
    <span class="ui-selectw ui-pagebar__end">
      <select class="ui-select ui-select--sm" aria-label="Rows per page"
              onchange="expFilter.pageSize=Number(this.value);expFilter.page=1;renderPage('expenses')">
        ${[10,30,50,100].map(n=>`<option value="${n}" ${expFilter.pageSize===n?'selected':''}>${n} / page</option>`).join('')}
      </select>
    </span>
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
  // sits behind. Since 2026-09-10 that is 'add' — creating a category is
  // creating a record, not changing one.
  if (typeof requirePerm === 'function' && !requirePerm('add')) return;
  showModal('modal-sm', 'Add Expense Category', `
    <div class="field">
      <label for="new-exp-cat">Category name</label>
      <input class="form-control" id="new-exp-cat" maxlength="40" autocomplete="off"
             placeholder="e.g. Generator Fuel"
             oninput="capFirstChar(this);_expCatValidate()"
             onkeydown="if(event.key==='Enter'){event.preventDefault();submitAddExpenseCategory();}">
      <div id="new-exp-cat-err" class="field-err" hidden></div>
    </div>
    <p class="exf-hint">
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
  /* `hidden`, not an inline display — .field-err sets no display of its own, so
     the attribute is enough and the markup keeps no style= attribute. */
  err.hidden = !msg;
  inp.classList.toggle('is-invalid', !!msg);
  /* The disabled look belongs to .btn:disabled (forms.css), not to two inline
     properties written from here. */
  if (btn) btn.disabled = !ok;
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
/** Is Owner Funds on for this hostel? Then "Fund Transfer" is not offered. */
function _expOwnerFundsOn() {
  return typeof ofEnabled === 'function' && ofEnabled();
}

/* READING A PROOF FILE, shared (2026-09-28): the expense receipt and the Owner
   Funds proof take the same kinds of file and store them the same way, so one
   reader does it. `done(rec)` receives {name, type, size, data}; every refusal
   is toasted here and `done` is simply not called. */
function expReadReceiptFile(file, done) {
  if (!file) return;
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
    done({ name: file.name || 'receipt', type: isImg ? 'image/jpeg' : type, size, data: dataUrl });
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

function expReceiptLoad(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  input.value = '';
  expReadReceiptFile(file, rec => { _expReceipt = rec; _expRepaintReceipt(); });
}

function expReceiptRemove() { _expReceipt = null; _expRepaintReceipt(); }

/* Images open in a viewer; a PDF is written back to disk, because the window's
   CSP has no frame-src and a data: URL cannot be framed. Both are the stored
   bytes — nothing is re-fetched. */
/* ── ONE VIEWER, TWO CALLERS ─────────────────────────────────────────────────
   The form's View button and the register's eye show the same thing, so they
   run the same function (owner, 2026-09-23: "the action button doesn't show
   the receipt, just the view icon button do in the edit expense form").

   The row's eye used to SAVE the file straight to disk, which is not viewing
   it — a warden checking whether an expense is documented had to write a copy
   somewhere first. It opens the image now, exactly as the form does, with Save
   a copy still one press away inside the modal.

   A PDF still goes to the desktop: this app has no PDF viewer, and handing the
   file to whatever the reader already uses is better than an empty frame. */
let _expViewing = null;

function _expReceiptShow(r) {
  if (!r || !r.data) { toast('No receipt is attached to this expense', 'error'); return; }
  _expViewing = r;
  if (String(r.type || '').indexOf('image/') === 0) {
    showModal('modal-md',
      `<div class="hf-mh"><div class="hf-mh__ico">${icon('clipboard','sm')}</div>
        <div><div class="hf-mh__t">Receipt</div>
        <div class="hf-mh__s">${escHtml(r.name || '')}</div></div></div>`,
      `<div class="exf-rcpt__view"><img src="${escHtml(r.data)}" alt="${escHtml(r.name || 'Receipt')}"></div>`,
      `<div class="hf-actions">
         <button class="btn btn-secondary" onclick="closeModal()">Close</button>
         <button class="btn btn-primary" onclick="expReceiptSaveViewed()">${icon('download','xs')} Save a copy</button>
       </div>`);
    return;
  }
  expReceiptSaveViewed();
}

/* Saves whichever receipt is on screen — the one the viewer was opened with,
   or the form's own when the form is what opened it. */
async function expReceiptSaveViewed() {
  const r = _expViewing || _expReceipt;
  if (!r) return;
  if (!window.electronAPI || typeof window.electronAPI.saveDataUrl !== 'function') {
    toast('This build cannot save files', 'error'); return;
  }
  const res = await window.electronAPI.saveDataUrl(r.data, r.name || 'receipt');
  if (res && res.success) toast('Receipt saved', 'success');
  else if (res && res.reason && res.reason !== 'cancelled') toast(res.reason, 'error');
}

function expReceiptView() { _expReceiptShow(_expReceipt); }

/* The eye in the register: reaches a STORED record by id, which is what a row
   can offer without opening a form, and hands it to the shared viewer. */
function expOpenReceipt(id) {
  const e = (DB.expenses || []).find(x => x && x.id === id);
  _expReceiptShow(e && e.receipt);
}

/* `expReceiptSaveCopy()` stood here: the same save, reading the form's
   `_expReceipt` directly. It had one caller — the viewer's "Save a copy" — and
   that viewer now opens for a ROW as well as for the form, where `_expReceipt`
   is null. `expReceiptSaveViewed()` above saves whichever receipt is on screen
   and falls back to the form's, so there is one save path for both. */

/**
 * The expense form.
 * @param {string} [id] existing expense id; omit to add a new one.
 */
function showExpenseModal(id) {
  /* One form for both, so it asks for the permission that matches which of the
     two it is about to be (2026-09-10): `id` present means an existing record
     is being changed. */
  if (typeof requirePerm === 'function' && !requirePerm(id ? 'edit' : 'add')) return;
  const e = id ? (DB.expenses || []).find(x => x.id === id) : null;
  if (id && !e) return;

  _expReceipt = e && e.receipt ? e.receipt : null;

  /* An edit offers whatever the record already holds even if the hostel has
     since deleted that category, so re-saving an old expense cannot silently
     re-file it under something else. */
  let cats = (DB.settings.expenseCategories || []).slice();
  /* NO "FUND TRANSFER" WHERE OWNER FUNDS IS ON (owner, 2026-09-28). Money the
     owner takes or gives belongs in Owner Funds; entered here as well it would
     be counted twice — once as an expense that lowers profit, once beside it.
     Hidden for NEW entries and for re-filing; a record already filed under it
     keeps it (the line below puts it back), because history is not rewritten. */
  const _noTransfer = _expOwnerFundsOn();
  if (_noTransfer) cats = cats.filter(x => x !== FUND_TRANSFER_CAT);
  if (e && e.category && cats.indexOf(e.category) === -1) cats.unshift(e.category);
  const catOpts = cats.map(c =>
    `<option ${e && e.category === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('');

  const methods = EXP_METHODS.slice();
  if (e && e.method && methods.indexOf(e.method) === -1) methods.unshift(e.method);
  /* A NEW expense lands on Cash (owner, 2026-09-10: "payemt method is cash by
     default globally"), matching pmOptions() on the money side. An expense
     being EDITED keeps whatever it holds — including nothing, which is a real
     answer here: records written before this field existed say "Not recorded"
     and must not be given a method they never had. */
  const mPick = e ? String(e.method || '') : 'Cash';
  const methodOpts = methods.map(m =>
    `<option value="${escHtml(m)}" ${m === mPick ? 'selected' : ''}>${escHtml(m)}</option>`).join('');

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
        `<select class="form-control" id="f-ecat">${catOpts}</select>`,
        { req: true, for: 'f-ecat',
          note: _noTransfer ? 'Money the owner gives or takes is recorded in <a href="#" onclick="closeModal();navigate(\'ownerfunds\');return false">Owner Funds</a>, not here.' : '' })}
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
      ${''/* ONE PERSON, NOT TWO (owner, 2026-09-16). The label asked for
             "Expense by / handed to" and the note offered "who spent it, or
             who the cash was handed to" — two different people behind one
             field, so a hostel that answered it one way in March and the other
             way in June has a column that cannot be read or totalled by payee.
             The owner settled it: the RECEIVER, and only the receiver.

             Who entered the record is not lost — it is stamped on the activity
             log, which is the place that question belongs. */}
      ${_expField('Vendor', 'person',
        `<input class="form-control" id="f-ewho" list="exp-people" autocomplete="off"
                placeholder="Name of the shop, person or office paid" value="${e ? escHtml(e.handedTo || '') : ''}">`,
        { req: reqWho, full: true, for: 'f-ewho',
          note: 'Who RECEIVED the money — the shop, the contractor, the office. Not whoever entered this record. Names already used are suggested.' })}
      ${_expField('Description', 'fileText',
        `<textarea class="form-control" id="f-edesc" rows="3" maxlength="250"
                   placeholder="e.g. Electricity bill for September 2026…"
                   oninput="expDescCount()">${escHtml(desc)}</textarea>`,
        { req: reqDesc, full: true, top: true, for: 'f-edesc' })}
    </div>
    <div class="hi-note exf-count" id="f-edesc-count">${desc.length}/250</div>
    ${''/* THE RECEIPT NUMBER sits with the receipt file, directly above it:
           both answer "which bill is this?", and a hostel that files paper
           bills has the number even when it has no photo. Optional. */}
    <div class="hf-g2 exf-refrow">
      ${_expField('Receipt / reference no.', 'receipt',
        `<input class="form-control" id="f-eref" type="text" maxlength="40" autocomplete="off"
                placeholder="e.g. INV-20931 or the bill's reference number"
                value="${e ? escHtml(e.refNo || '') : ''}">`,
        { full: true, for: 'f-eref',
          note: 'Optional. The number printed on the bill or receipt, so this entry can be matched to the paper.' })}
    </div>
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
/* One press, one save (submitOnce, utils.js — bug audit BUG-006). */
async function submitExpense(...a) { return submitOnce('expense:' + (a[0] || 'new'), () => _submitExpense(...a)); }
async function _submitExpense(id) {
  // The licence gate, before anything is read or written (see enforcement-ui.js).
  if (typeof requireWritable === 'function' && !requireWritable('An expense')) return;
  // Same split as the form above — gated again here, because the submit can be
  // reached without it.
  if (typeof requirePerm === 'function' && !requirePerm(id ? 'edit' : 'add')) return;
  const e = id ? (DB.expenses || []).find(x => x.id === id) : null;
  if (id && !e) return;

  const cat    = document.getElementById('f-ecat').value;
  const amount = parseFloat(document.getElementById('f-eamt').value);
  const date   = document.getElementById('f-edate').value;
  const method = document.getElementById('f-emethod').value;
  const who    = document.getElementById('f-ewho').value.trim();
  const desc   = document.getElementById('f-edesc').value.trim();
  // Collapsed whitespace, capped at the field's own 40: a pasted number often
  // carries a trailing newline or a double space from the bill's layout.
  const refNo  = (document.getElementById('f-eref')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);

  if (!cat) { toast('Pick a category', 'error'); return; }
  /* The form no longer offers it where Owner Funds is on; this is the same rule
     at the write, for a form opened before the feature was switched on. A
     record already filed under it may keep it. */
  if (cat === FUND_TRANSFER_CAT && _expOwnerFundsOn() && !(e && e.category === FUND_TRANSFER_CAT)) {
    toast('Money the owner gives or takes is recorded in Owner Funds, not as an expense', 'error');
    return;
  }
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
  if (refNo)  rec.refNo = refNo;   else delete rec.refNo;
  if (_expReceipt) rec.receipt = _expReceipt; else delete rec.receipt;

  /* WHO ENTERED IT (owner, 2026-09-23: "change paid to into Vendor and added
     by, the current user").

     These are two different people and the register now shows both: the VENDOR
     is who the money went to (`handedTo`, unchanged), and this is who typed the
     record. The 2026-09-16 note on the old heading said the entering account
     "is on the activity log, which is where that question belongs" — the log
     trims at 200 entries, so on a hostel of any age the answer for an older
     expense is simply gone, which is the same finding that put `admittedBy` on
     a student.

     STAMPED ON CREATE ONLY. An edit does not rewrite it: the question is who
     RAISED this expense, and a correction six weeks later by somebody else does
     not change that. Records written before today carry neither key and print
     a dash rather than guessing at whoever is logged in now. */
  if (!e) {
    rec.addedBy     = (typeof CUR_ROLE !== 'undefined' && CUR_ROLE) || null;
    rec.addedByName = (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) || '';
  }

  if (!e) { if (!DB.expenses) DB.expenses = []; DB.expenses.push(rec); }

  logActivity(e ? 'Expense Updated' : 'Expense Added', cat + ' — ' + fmtPKR(amount), 'Finance');
  _expReceipt = null;
  await saveDB();
  closeModal();
  renderPage(_expReturnPage());
  toast(e ? 'Expense updated' : 'Expense recorded', 'success');
}

/* The names the rest of the app calls. */
async function submitAddExpense()      { return submitExpense(); }
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
  if(_del_e) logActivity('Expense Deleted', _del_e.category+' — '+fmtPKR(_del_e.amount), 'Finance');
  await saveDB(); renderPage(_expReturnPage()); toast('Expense deleted','info');
}

async function deleteExpense(id) {
  // The licence gate, before anything is read or written (see enforcement-ui.js).
  if (typeof requireWritable === 'function' && !requireWritable('Deleting an expense')) return;
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
/* WHICH MONTH THE REPORTS PAGE IS SHOWING, and since 2026-09-22 that is the
   ONLY thing it shows.

   `reportPeriod` lived here too and took 'month' | 'year' | 'custom', drawn as
   a three-way segment beside this. The owner removed all three (2026-09-22:
   "remove the month, this year and custom range and make a professional month
   dropdown in which different month and years can be selected") — one control
   that answers where the window sits, instead of two that answered where AND
   how wide and had to agree with each other.

   Evaluated at load, so a session left open past the turn of a month still
   opens on the month it now is. */
let reportMonth = thisMonth();
/* MONTH OR WHOLE YEAR (owner, 2026-09-23: "I want an option in the month
   picker ... through which I can see monthly or full yearly reports data").

   A flag beside the anchor rather than a second anchor: `reportMonth` still
   says WHERE the window sits and this says how wide it is, so switching to the
   year and back returns to the month you were on. It is deliberately NOT the
   old `reportPeriod` — that took three values and had a 'custom' range with
   its own pair of inputs, all of which stay gone. Two states, one checkbox.

   Reset to false with reportMonth whenever Reports is entered; see navigate(). */
let reportYearly = false;
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