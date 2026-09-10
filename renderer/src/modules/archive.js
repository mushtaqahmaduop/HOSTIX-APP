/* ─── HOSTYLLO — ANNUAL ARCHIVE ─────────────────────────────────────────────
   The historical record of the hostel: pick a year, or a month inside it, and
   read everything that happened in that period — the roster, the money
   collected, what is still owed, what was spent, and who left. Every section is
   printable, and any student can be opened for the same period.

   WHERE THE DATA COMES FROM
   The archive reads the LIVE tables and DB.archive together, deduplicated by
   id. It has to: enforceDataRetention() moves settled payments older than six
   months into DB.archive, so neither half is the whole history on its own. An
   archive that read DB.archive alone could not answer "what did this student
   pay last month", which is most of what it is for.

   PERIOD MATCHING
   `_arcKey()` is a prefix — 'YYYY' for a whole year, 'YYYY-MM' for one month —
   and every query uses the SAME matchers the rest of the app uses
   (_payMatchesMonth, _studentInPeriod). No second date-filtering path, so this
   page cannot drift from Reports or the dashboard.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// year:'' means "the newest year that has data"; month:'' means the whole year.
let archiveFilter = { year: '', month: '', tab: 'overview' };

// ── DATASET: live + archived, deduplicated ───────────────────────────────────
// A record archived by enforceDataRetention() is REMOVED from the live table,
// so the two should never overlap — but a restored backup or a half-finished
// retention pass can leave a row in both, and counting it twice would overstate
// a year's revenue. Dedupe by id is the cheap insurance.
function _arcDedupe(lists) {
  const seen = new Set();
  const out = [];
  lists.forEach(list => (list || []).forEach(r => {
    if (!r) return;
    const k = r.id;
    if (k != null) { if (seen.has(k)) return; seen.add(k); }
    out.push(r);
  }));
  return out;
}

function _arcArchived(wantExpense) {
  return (DB.archive || []).filter(r => _archiveClassify(r).isExpense === wantExpense);
}

function _arcPayments()  { return _arcDedupe([DB.payments, _arcArchived(false)]); }

// Outgoings: expenses, archived expenses, and the legacy funds transfers folded
// in under the Fund Transfer category — the same shape _rptOutgoings() builds
// for Reports, so a category total here matches the one there.
function _arcExpenses() {
  const transfers = (DB.transfers || []).map(t => ({
    id: t.id, date: t.date, category: FUND_TRANSFER_CAT,
    description: t.description || ('Transfer' + (t.receivedBy ? ' to ' + t.receivedBy : '')),
    amount: Number(t.amount || 0), _transfer: true,
  }));
  return _arcDedupe([DB.expenses, _arcArchived(true), transfers]);
}

function _arcCancellations() { return DB.cancellations || []; }
function _arcFines()         { return DB.fines || []; }

// Money actually collected from a list of payment rows. A Pending record can
// carry a PART payment — amount > 0 with an `unpaid` remainder — and that part
// is real money in the till. Summing `status === 'Paid'` alone left those out,
// so a table's own total row could read PKR 0 under a column showing PKR 6,000.
// Every collected figure on this page goes through here, matching calcRevenue().
function _arcCollected(list) {
  return (list || []).reduce((s, p) => {
    if (p.status === 'Paid') return s + Number(p.amount || 0);
    // D-4: no `p.unpaid != null` here. A part-payment from before that field
    // existed is still money that came in, and this function's contract is to
    // match calcRevenue() — which no longer drops it either.
    if (p.status === 'Pending' && Number(p.amount || 0) > 0)
      return s + Number(p.amount || 0);
    return s;
  }, 0);
}

// …and what is still owed on them.
function _arcOwed(list) {
  return (list || []).filter(p => p.status === 'Pending')
    .reduce((s, p) => s + outstandingOf(p), 0);
}

// The date a cancellation belongs to: when it was raised, falling back to the
// vacate date for rows written before requestDate existed.
function _arcCancDate(c) { return (c && (c.requestDate || c.createdAt || c.vacateDate)) || ''; }

// ── PERIOD ───────────────────────────────────────────────────────────────────
// Every year that actually holds a record, newest first, so a hostel can reach
// its own history even after the live tables have been pruned.
function _arcYearsWithData() {
  const ys = new Set();
  const add = d => { const m = /^(\d{4})/.exec(String(d || '')); if (m) ys.add(m[1]); };
  _arcPayments().forEach(p => { const k = _payMonthKey(p); if (k) ys.add(k.slice(0, 4)); });
  _arcExpenses().forEach(e => add(e.date));
  _arcCancellations().forEach(c => add(_arcCancDate(c)));
  (DB.students || []).forEach(s => { add(s.joinDate); add(s.leftDate || s.leaveDate); });
  return Array.from(ys).sort((a, b) => b.localeCompare(a));
}

// The selector always offers the current year too, even before anything has
// been entered into it — otherwise a hostel in its first January has no way to
// look at the year it is living in.
function _arcYears() {
  const ys = _arcYearsWithData();
  return ys.includes(thisYear()) ? ys
       : ys.concat([thisYear()]).sort((a, b) => b.localeCompare(a));
}

// Which year the page opens on. The newest year that HOLDS SOMETHING, not
// simply the newest year offered: an install whose records all predate this
// year would otherwise land on an empty current year and look like it had lost
// the lot.
function _arcYear()  { return archiveFilter.year || _arcYearsWithData()[0] || thisYear(); }
function _arcKey()   { return archiveFilter.month ? _arcYear() + '-' + archiveFilter.month : _arcYear(); }
function _arcIsYear(){ return !archiveFilter.month; }

function _arcLabel() {
  if (_arcIsYear()) return _arcYear();
  return new Date(Number(_arcYear()), Number(archiveFilter.month) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// ── PERIOD SLICES ────────────────────────────────────────────────────────────
function _arcPeriodPayments()  { const k = _arcKey(); return _arcPayments().filter(p => _payMatchesMonth(p, k)); }
function _arcPeriodExpenses()  { const k = _arcKey(); return _arcExpenses().filter(e => String(e.date || '').startsWith(k)); }
function _arcPeriodCancels()   { const k = _arcKey(); return _arcCancellations().filter(c => String(_arcCancDate(c)).startsWith(k)); }
function _arcPeriodFines()     { const k = _arcKey(); return _arcFines().filter(f => String(f.date || '').startsWith(k)); }

// The roster AS IT STOOD in the period — anyone on the books then, plus anyone
// with a fee record for it, so a student who has since left still appears
// against the money they paid.
function _arcPeriodStudents() {
  const k    = _arcKey();
  const pays = _arcPeriodPayments();
  const paid = new Set(pays.map(p => p.studentId));
  return (DB.students || []).filter(s => _studentInPeriod(s, k) || paid.has(s.id));
}

// One student's money inside the period. Used by the roster table and by the
// drill-down, so a row and the modal it opens can never disagree.
function _arcStudentFigures(studentId, key) {
  const pays = _arcPayments().filter(p => p.studentId === studentId && _payMatchesMonth(p, key));
  return { pays, paid: _arcCollected(pays), pending: _arcOwed(pays), count: pays.length };
}

// Period totals. Revenue and expenses are summed from the archive's own merged
// dataset rather than calcRevenue()/calcExpenses(), which read the live tables
// only — for an old year those would report zero while the rows sat in
// DB.archive. The DEFINITION is identical: paid + partial-paid, and outgoings
// including the funds transfers.
function _arcTotals() {
  const pays    = _arcPeriodPayments();
  const rev     = _arcCollected(pays);
  const pending = _arcOwed(pays);
  const exps    = _arcPeriodExpenses();
  const exp  = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
  return {
    pays, exps, rev, pending, exp, net: rev - exp,
    cancels:  _arcPeriodCancels(),
    fines:    _arcPeriodFines(),
    students: _arcPeriodStudents(),
  };
}

// ── CONTROLS ─────────────────────────────────────────────────────────────────
function arcSetYear(y)  { archiveFilter.year = y; renderPage('archive'); }
function arcSetMonth(m) { archiveFilter.month = m || ''; renderPage('archive'); }
function arcSetTab(t)   { archiveFilter.tab = t; renderPage('archive'); }

// ── PAGE ─────────────────────────────────────────────────────────────────────
function renderArchive() {
  // Nothing has ever been recorded: say so plainly rather than showing a year
  // selector over twelve empty months, which reads like data that went missing.
  if (!_arcYearsWithData().length) {
    return `
    <div class="arc-panel">
      <div class="arc-empty" style="padding:56px 24px">
        <div style="font-size:38px;margin-bottom:10px">🗄</div>
        <div style="font-size:15px;font-weight:800;color:var(--text2);margin-bottom:6px">No archived records yet</div>
        <div style="max-width:460px;margin:0 auto;line-height:1.7">
          The Annual Archive is the full history of the hostel — every month and
          year, with its students, payments, outstanding rent, expenses and
          cancellations, ready to print. It fills itself as you use the app;
          nothing has been recorded on this device yet.
        </div>
      </div>
    </div>`;
  }

  const years = _arcYears();
  const T     = _arcTotals();
  const label = _arcLabel();

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const monthOpts = ['<option value="">Whole year</option>'].concat(
    MONTHS.map((n, i) => {
      const v = String(i + 1).padStart(2, '0');
      return `<option value="${v}" ${archiveFilter.month === v ? 'selected' : ''}>${n}</option>`;
    })).join('');

  const bar = `
  <div class="arc-bar">
    <span class="arc-bar__lbl">Year</span>
    <div class="arc-years">
      ${years.map(y => `<button class="${y === _arcYear() ? 'is-on' : ''}" onclick="arcSetYear('${y}')">${y}</button>`).join('')}
    </div>
    <span class="arc-bar__lbl">Month</span>
    <select class="arc-select" onchange="arcSetMonth(this.value)" title="Narrow to one month">${monthOpts}</select>
    <div class="arc-bar__end">
      <button class="arc-btn" onclick="exportArchiveExcel()" title="Export the whole period to Excel — one sheet per section">${icon('download','xs')} Export Excel</button>
      <button class="arc-btn arc-btn--primary" onclick="exportArchivePDF()" title="Export the whole period as a PDF document">${icon('print','xs')} Export PDF</button>
    </div>
  </div>`;

  const kpi = (hue, l, v, s) => `
    <div class="arc-kpi ${hue}"><div class="arc-kpi__l">${l}</div>
    <div class="arc-kpi__v">${v}</div><div class="arc-kpi__s">${s}</div></div>`;

  /* COMPACT ON THE CARDS, EXACT IN THE TABLES BELOW — the same split utils.js
     documents for fmtCompact() vs fmtPKRk(), and the same helper the dashboard
     and Reports KPI rows now use. A whole archived YEAR is the largest figure
     this app ever prints, so this is the screen where a full fmtPKR() ran out
     of card first. The exact rupees stay in the title attribute, and the
     month-by-month table further down is untouched: that one is reconciled
     against records, not scanned. */
  const kpis = `
  <div class="arc-kpis">
    ${kpi('dh-green','Revenue',   moneyValue(T.rev,{compact:true}),     `${T.pays.filter(p=>p.status==='Paid').length} paid records`)}
    ${kpi('dh-red',  'Expenses',  moneyValue(T.exp,{compact:true}),     `${T.exps.length} record${T.exps.length===1?'':'s'}`)}
    ${kpi(T.net>=0?'dh-green':'dh-red','Available Fund', moneyValue(T.net,{compact:true}), 'Revenue − Expenses')}
    ${kpi('dh-amber','Pending',   moneyValue(T.pending,{compact:true}), `${T.pays.filter(p=>p.status==='Pending').length} unpaid`)}
    ${kpi('dh-blue', 'Students',  String(T.students.length), 'on the roster in this period')}
    ${kpi('dh-blue', 'Cancellations', String(T.cancels.length), 'requests raised')}
  </div>`;

  const TABS = [
    ['overview',      'Overview',      null],
    ['students',      'Students',      T.students.length],
    ['payments',      'Payments',      T.pays.length],
    ['pending',       'Pending',       T.pays.filter(p=>p.status==='Pending').length],
    ['expenses',      'Expenses',      T.exps.length],
    ['cancellations', 'Cancellations', T.cancels.length],
  ];
  const tabs = `
  <div class="arc-tabs">
    ${TABS.map(([id, l, n]) => `<button class="${archiveFilter.tab===id?'is-on':''}" onclick="arcSetTab('${id}')">${l}${n!==null?`<span class="arc-tabs__n">${n}</span>`:''}</button>`).join('')}
  </div>`;

  let body;
  switch (archiveFilter.tab) {
    case 'students':      body = _arcStudentsPanel(T, label); break;
    case 'payments':      body = _arcPaymentsPanel(T, label, 'all'); break;
    case 'pending':       body = _arcPaymentsPanel(T, label, 'pending'); break;
    case 'expenses':      body = _arcExpensesPanel(T, label); break;
    case 'cancellations': body = _arcCancelsPanel(T, label); break;
    default:              body = _arcOverviewPanel(T, label) +
                                 // A month has no year-over-year, and retention across
                                 // thirty days is noise. Whole years only.
                                 (_arcIsYear() ? _arcRetentionPanel() + _arcYoYPanel() : '');
  }

  return bar + kpis + tabs + body;
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
// A year at a glance, month by month, each row opening that month.
/* ── YEAR AGAINST YEAR, AND WHO STAYED ────────────────────────────────────────
   The archive could show one period in detail and could not answer the two
   questions an owner actually opens it for:

     "was this year better than last year?"
     "how many of the people who were here in January were still here in
      December?"

   Both are computed from the same merged dataset the rest of this file uses, so
   they cannot disagree with the figures above them. Neither is shown for a
   single month — a month has no meaningful year-over-year, and retention across
   thirty days is noise.                                                      */

/* Every figure for one whole year, so the current year and the one before it
   are produced by identical code rather than by a comparison written twice. */
function _arcYearFigures(year) {
  const y     = String(year);
  const pays  = _arcPayments().filter(p => _payMatchesMonth(p, y));
  const exps  = _arcExpenses().filter(e => String(e.date || '').startsWith(y));
  const cans  = _arcCancellations().filter(c => String(_arcCancDate(c)).startsWith(y));
  const rev   = _arcCollected(pays);
  const exp   = exps.reduce((s, e) => s + Number(e.amount || 0), 0);

  // Admissions are dated by joinDate, departures by the date the notice was
  // raised. A student who joined in one year and left in the next counts once
  // in each, which is what actually happened.
  const students = (DB.students || []);
  const joined = students.filter(s => String(s.joinDate || '').startsWith(y)).length;
  const left   = students.filter(s => s.status === 'Left' && String(s.leftDate || '').startsWith(y)).length
                 || cans.filter(c => c.status === 'Confirmed').length;

  return {
    year: y, rev, exp, net: rev - exp,
    pending: _arcOwed(pays),
    payments: pays.length,
    joined, left,
    cancels: cans.length,
    // Months with anything recorded at all — a year with two months of data
    // must not be read as a bad year, and this is what says which it is.
    active: new Set(pays.map(p => String(p.month || p.date || '').slice(0, 7)).filter(Boolean)).size,
  };
}

/* A percentage change that refuses to lie. Growth from zero is not "infinite
   growth", it is a first year, and printing +∞% or +100% next to it would be a
   number the data cannot support. */
function _arcDelta(now, before) {
  if (!isFinite(now) || !isFinite(before)) return null;
  if (before === 0) return now === 0 ? { pct: 0, from0: false } : { pct: null, from0: true };
  return { pct: ((now - before) / Math.abs(before)) * 100, from0: false };
}

function _arcYoYPanel() {
  const y    = Number(_arcYear());
  const prev = String(y - 1);
  if (!_arcYearsWithData().includes(prev)) {
    return `<div class="arc-panel">
      <div class="arc-panel__head"><span class="arc-panel__t">${escHtml(String(y))} against ${escHtml(prev)}</span></div>
      <div class="arc-empty" style="padding:22px">Nothing is recorded for ${escHtml(prev)}, so there is nothing to compare
        ${escHtml(String(y))} against yet. This panel fills itself in as soon as a second year has data.</div>
    </div>`;
  }

  const A = _arcYearFigures(y), B = _arcYearFigures(prev);
  const row = (label, nowV, beforeV, fmt, goodUp) => {
    const d = _arcDelta(nowV, beforeV);
    let cell = '<span class="arc-d is-flat">no change</span>';
    if (d && d.from0) cell = `<span class="arc-d is-new">first recorded in ${escHtml(String(y))}</span>`;
    else if (d && d.pct !== null && Math.abs(d.pct) >= 0.05) {
      const up   = d.pct > 0;
      const good = goodUp ? up : !up;
      cell = `<span class="arc-d ${good ? 'is-up' : 'is-down'}">${up ? '▲' : '▼'} ${Math.abs(d.pct).toFixed(1)}%</span>`;
    }
    return `<tr>
      <td>${escHtml(label)}</td>
      <td class="num">${fmt(beforeV)}</td>
      <td class="num"><b>${fmt(nowV)}</b></td>
      <td class="num">${cell}</td>
    </tr>`;
  };
  const money = v => fmtPKR(v);
  const count = v => String(v);

  return `<div class="arc-panel">
    <div class="arc-panel__head">
      <span class="arc-panel__t">${escHtml(String(y))} against ${escHtml(prev)}</span>
      <span class="arc-panel__n">${A.active} month${A.active === 1 ? '' : 's'} with records
        · ${B.active} in ${escHtml(prev)}</span>
    </div>
    <div class="arc-wrap"><table class="arc-table">
      <thead><tr><th>Measure</th><th class="num">${escHtml(prev)}</th>
        <th class="num">${escHtml(String(y))}</th><th class="num">Change</th></tr></thead>
      <tbody>
        ${row('Revenue collected', A.rev, B.rev, money, true)}
        ${row('Expenses', A.exp, B.exp, money, false)}
        ${row('Available fund', A.net, B.net, money, true)}
        ${row('Still owed at year end', A.pending, B.pending, money, false)}
        ${row('Payment records', A.payments, B.payments, count, true)}
        ${row('Students admitted', A.joined, B.joined, count, true)}
        ${row('Students who left', A.left, B.left, count, false)}
      </tbody>
    </table></div>
    ${A.active < 12 || B.active < 12 ? `<div class="arc-note">A part-recorded year is not a worse year.
      ${escHtml(String(y))} has ${A.active} month${A.active === 1 ? '' : 's'} of records and
      ${escHtml(prev)} has ${B.active} — read the percentages with that in mind.</div>` : ''}
  </div>`;
}

/* Turnover across the selected year: who arrived, who left, and what the roster
   did as a result. "Retained" is deliberately the count still on the books at
   the end, not a rate — a hostel with nine residents does not need a
   percentage, it needs the nine. */
function _arcRetentionPanel() {
  const y   = _arcYear();
  const F   = _arcYearFigures(y);
  const all = (DB.students || []);
  // On the roster at any point in the year, by the same rule the students panel
  // uses: admitted on or before it ended, and not already gone before it began.
  const inYear = all.filter(s => {
    const j = String(s.joinDate || '').slice(0, 4);
    if (j && j > y) return false;
    const l = s.status === 'Left' ? String(s.leftDate || '').slice(0, 4) : '';
    if (l && l < y) return false;
    return true;
  });
  const stillHere = inYear.filter(s => s.status !== 'Left' && s.status !== 'Blacklisted').length;
  const carried   = inYear.filter(s => String(s.joinDate || '').slice(0, 4) < y).length;

  const tile = (hue, l, v, s) => `<div class="arc-kpi ${hue}">
    <div class="arc-kpi__l">${l}</div><div class="arc-kpi__v">${v}</div><div class="arc-kpi__s">${s}</div></div>`;

  return `<div class="arc-panel">
    <div class="arc-panel__head">
      <span class="arc-panel__t">Who was here in ${escHtml(y)}</span>
      <span class="arc-panel__n">${inYear.length} resident${inYear.length === 1 ? '' : 's'} across the year</span>
    </div>
    <div class="arc-kpis" style="margin:0">
      ${tile('dh-blue',  'Carried in',  String(carried),   'admitted before ' + escHtml(y))}
      ${tile('dh-green', 'Admitted',    String(F.joined),  'joined during ' + escHtml(y))}
      ${tile('dh-amber', 'Left',        String(F.left),    'departed during ' + escHtml(y))}
      ${tile('dh-green', 'Still resident', String(stillHere), 'on the roster today')}
    </div>
  </div>`;
}

function _arcOverviewPanel(T, label) {
  const y = _arcYear();
  const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (_arcIsYear()) {
    const pays = _arcPayments(), exps = _arcExpenses(), cans = _arcCancellations();
    const rows = MS.map((mn, i) => {
      const mk = y + '-' + String(i + 1).padStart(2, '0');
      const mp = pays.filter(p => _payMatchesMonth(p, mk));
      const rev  = _arcCollected(mp);
      const pend = _arcOwed(mp);
      const ex = exps.filter(e => String(e.date||'').startsWith(mk)).reduce((s, e) => s + Number(e.amount||0), 0);
      const cn = cans.filter(c => String(_arcCancDate(c)).startsWith(mk)).length;
      const any = mp.length || ex || cn;
      return { mn, i, mk, rev, pend, ex, cn, net: rev - ex, any };
    });
    const tot = rows.reduce((a, r) => ({ rev:a.rev+r.rev, pend:a.pend+r.pend, ex:a.ex+r.ex, cn:a.cn+r.cn }),
                            { rev:0, pend:0, ex:0, cn:0 });
    return `
    <div class="arc-panel">
      <div class="arc-panel__head">
        <span class="arc-panel__t">${escHtml(y)} — month by month</span>
        <span class="arc-panel__n">click a month to open it</span>
      </div>
      <div class="arc-wrap"><table class="arc-table">
        <thead><tr><th>Month</th><th class="num">Revenue</th><th class="num">Expenses</th>
          <th class="num">Available Fund</th><th class="num">Pending</th><th class="num">Cancellations</th></tr></thead>
        <tbody>
          ${rows.map(r => {
            // A dash means "nothing recorded", so it stays neutral — painting it
            // green or red gives an empty month the look of a real figure.
            const cell = (on, html, colour) =>
              `<td class="num"${on ? ` style="color:${colour}"` : ' style="color:var(--text3)"'}>${on ? html : '—'}</td>`;
            return `<tr class="${r.any?'is-click':''}" ${r.any?`onclick="arcSetMonth('${String(r.i+1).padStart(2,'0')}')"`:''}>
            <td class="nm">${r.mn}${r.any?'':' <span style="font-weight:400;color:var(--text3)">— no records</span>'}</td>
            ${cell(!!r.rev,  fmtPKR(r.rev),  'var(--green)')}
            ${cell(!!r.ex,   fmtPKR(r.ex),   'var(--red)')}
            ${cell(r.any,    fmtPKR(r.net),  r.net>=0?'var(--green)':'var(--red)')}
            ${cell(!!r.pend, fmtPKR(r.pend), 'var(--amber)')}
            ${cell(!!r.cn,   String(r.cn),   'var(--text)')}
          </tr>`;}).join('')}
          <tr class="arc-sub">
            <td>Year total</td>
            <td class="num" style="color:var(--green)">${fmtPKR(tot.rev)}</td>
            <td class="num" style="color:var(--red)">${fmtPKR(tot.ex)}</td>
            <td class="num" style="color:${tot.rev-tot.ex>=0?'var(--green)':'var(--red)'}">${fmtPKR(tot.rev-tot.ex)}</td>
            <td class="num" style="color:var(--amber)">${fmtPKR(tot.pend)}</td>
            <td class="num">${tot.cn}</td>
          </tr>
        </tbody>
      </table></div>
    </div>
    ${arcCharts(y, rows)}`;
  }

  // One month: the same six figures, plus the category split, without leaving
  // the tab.
  const groups = _rptByCategory(T.exps);
  return `
  <div class="arc-panel">
    <div class="arc-panel__head"><span class="arc-panel__t">${escHtml(label)} — summary</span></div>
    <div class="arc-wrap"><table class="arc-table">
      <tbody>
        <tr><td class="nm">Revenue collected</td><td class="num" style="color:var(--green)">${fmtPKR(T.rev)}</td></tr>
        <tr><td class="nm">Expenses</td><td class="num" style="color:var(--red)">${fmtPKR(T.exp)}</td></tr>
        <tr class="arc-sub"><td>Available Fund</td><td class="num" style="color:${T.net>=0?'var(--green)':'var(--red)'}">${fmtPKR(T.net)}</td></tr>
        <tr><td class="nm">Still outstanding</td><td class="num" style="color:var(--amber)">${fmtPKR(T.pending)}</td></tr>
        <tr><td class="nm">Students on the roster</td><td class="num">${T.students.length}</td></tr>
        <tr><td class="nm">Cancellations raised</td><td class="num">${T.cancels.length}</td></tr>
        <tr><td class="nm">Fines recorded</td><td class="num">${T.fines.length}</td></tr>
      </tbody>
    </table></div>
  </div>
  ${groups.length ? `
  <div class="arc-panel">
    <div class="arc-panel__head"><span class="arc-panel__t">Where the money went</span>
      <span class="arc-panel__end" style="color:var(--red)">${fmtPKR(T.exp)}</span></div>
    <div class="arc-wrap"><table class="arc-table">
      <thead><tr><th>Category</th><th class="num">Records</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
      <tbody>${groups.map(g => `<tr>
        <td class="nm">${escHtml(g.cat)}</td>
        <td class="num">${g.items.length}</td>
        <td class="num" style="color:var(--red)">${fmtPKR(g.total)}</td>
        <td class="num">${T.exp>0?Math.round(g.total/T.exp*100):0}%</td></tr>`).join('')}
      </tbody>
    </table></div>
  </div>` : ''}`;
}

// ── STUDENTS ─────────────────────────────────────────────────────────────────
function _arcStudentsPanel(T, label) {
  const key = _arcKey();
  const rows = T.students.map(s => {
    const f = _arcStudentFigures(s.id, key);
    const room = (DB.rooms || []).find(r => r.id === s.roomId);
    const ch = (typeof resolveCharges === 'function') ? resolveCharges(s) : { total: Number(s.rent||0) };
    return { s, f, room, charge: ch.total };
  // Room order, then name inside a room — the same rule every other list and
  // export follows since 2026-08-31.
  }).sort((a, b) => {
    const c = cmpRoomNo(a.room && a.room.number, b.room && b.room.number);
    return c !== 0 ? c : String(a.s.name||'').localeCompare(String(b.s.name||''));
  });

  const tot = rows.reduce((a, r) => ({ paid: a.paid + r.f.paid, pending: a.pending + r.f.pending }),
                          { paid: 0, pending: 0 });

  return `
  <div class="arc-panel">
    <div class="arc-panel__head">
      <span class="arc-panel__t">Students — ${escHtml(label)}</span>
      <span class="arc-panel__n">${rows.length} on the roster · click a row for the full record</span>
    </div>
    ${rows.length ? `
    <div class="arc-wrap"><table class="arc-table">
      <thead><tr><th>Student</th><th>Father</th><th>Room</th><th>Joined</th><th>Status</th>
        <th class="num">Monthly Charge</th><th class="num">Paid</th><th class="num">Pending</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr class="is-click" onclick="showArchiveStudent('${r.s.id}')" title="Open ${escHtml(r.s.name||'')}">
          <td class="nm">${escHtml(r.s.name || '—')}</td>
          <td>${escHtml(r.s.fatherName || '—')}</td>
          <td>${r.room ? '#' + escHtml(String(r.room.number)) : '—'}</td>
          <td>${escHtml(fmtDate(r.s.joinDate) || '—')}</td>
          <td>${statusBadge(r.s.status)}</td>
          <td class="num">${fmtPKR(r.charge)}</td>
          <td class="num" style="color:${r.f.paid?'var(--green)':'var(--text3)'}">${r.f.paid?fmtPKR(r.f.paid):'—'}</td>
          <td class="num" style="color:${r.f.pending?'var(--red)':'var(--text3)'}">${r.f.pending?fmtPKR(r.f.pending):'—'}</td>
        </tr>`).join('')}
        <tr class="arc-sub">
          <td colspan="6">Total — ${rows.length} student${rows.length===1?'':'s'}</td>
          <td class="num" style="color:var(--green)">${fmtPKR(tot.paid)}</td>
          <td class="num" style="color:var(--red)">${fmtPKR(tot.pending)}</td>
        </tr>
      </tbody>
    </table></div>` : '<div class="arc-empty">Nobody was on the roster in this period.</div>'}
  </div>`;
}

// ── PAYMENTS / PENDING ───────────────────────────────────────────────────────
function _arcPaymentsPanel(T, label, mode) {
  const list = (mode === 'pending' ? T.pays.filter(p => p.status === 'Pending') : T.pays)
    .slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const total = mode === 'pending' ? _arcOwed(list) : _arcCollected(list);

  return `
  <div class="arc-panel">
    <div class="arc-panel__head">
      <span class="arc-panel__t">${mode === 'pending' ? 'Pending payments' : 'Payments'} — ${escHtml(label)}</span>
      <span class="arc-panel__n">${list.length} record${list.length===1?'':'s'}</span>
      <span class="arc-panel__end" style="color:${mode==='pending'?'var(--red)':'var(--green)'}">${fmtPKR(total)}</span>
    </div>
    ${list.length ? `
    <div class="arc-wrap"><table class="arc-table">
      <thead><tr><th>Date</th><th>Student</th><th>Room</th><th>Month</th><th>Method</th>
        <th>Status</th><th class="num">Paid</th><th class="num">Outstanding</th></tr></thead>
      <tbody>
        ${list.map(p => `<tr class="is-click" onclick="showArchiveStudent('${p.studentId}')">
          <td>${escHtml(fmtDate(p.date) || '—')}</td>
          <td class="nm">${escHtml(p.studentName || '—')}</td>
          <td>#${escHtml(String(p.roomNumber || '—'))}</td>
          <td>${escHtml(p.month || '—')}</td>
          <td>${pmBadge(p.method)}</td>
          <td>${statusBadge(p.status)}</td>
          <td class="num" style="color:${Number(p.amount)>0?'var(--green)':'var(--text3)'}">${Number(p.amount)>0?fmtPKR(p.amount):'—'}</td>
          <td class="num" style="color:var(--red)">${p.status==='Pending'?fmtPKR(outstandingOf(p)):'—'}</td>
        </tr>`).join('')}
        <tr class="arc-sub">
          <td colspan="6">${mode === 'pending' ? 'Total outstanding' : 'Total collected'}</td>
          <td class="num" colspan="2" style="color:${mode==='pending'?'var(--red)':'var(--green)'}">${fmtPKR(total)}</td>
        </tr>
      </tbody>
    </table></div>` : `<div class="arc-empty">${mode === 'pending' ? 'Nothing was left unpaid in this period.' : 'No payments in this period.'}</div>`}
  </div>`;
}

// ── EXPENSES ─────────────────────────────────────────────────────────────────
// The same by-category register the Reports screen and every PDF use: a section
// per category, a total per category, a grand total at the end.
function _arcExpensesPanel(T, label) {
  const groups = _rptByCategory(T.exps);
  const grand  = _rptGroupsTotal(groups);
  if (!groups.length)
    return `<div class="arc-panel"><div class="arc-panel__head">
      <span class="arc-panel__t">Expenses — ${escHtml(label)}</span></div>
      <div class="arc-empty">Nothing was spent in this period.</div></div>`;

  return groups.map(g => `
    <div class="arc-panel">
      <div class="arc-panel__head">
        <span class="arc-panel__t">${escHtml(g.cat)}</span>
        <span class="arc-panel__n">${g.items.length} record${g.items.length===1?'':'s'} · ${grand>0?Math.round(g.total/grand*100):0}% of outgoings</span>
        <span class="arc-panel__end" style="color:var(--red)">${fmtPKR(g.total)}</span>
      </div>
      <div class="arc-wrap"><table class="arc-table">
        <thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${g.items.map(e => `<tr>
            <td>${escHtml(fmtDate(e.date) || '—')}</td>
            <td>${escHtml(e.description || '—')}</td>
            <td class="num" style="color:var(--red)">${fmtPKR(e.amount)}</td></tr>`).join('')}
          <tr class="arc-sub"><td colspan="2">Total — ${escHtml(g.cat)}</td>
            <td class="num" style="color:var(--red)">${fmtPKR(g.total)}</td></tr>
        </tbody>
      </table></div>
    </div>`).join('') + `
    <div class="arc-grand">
      <span class="arc-grand__l">Grand Total — ${groups.length} categor${groups.length===1?'y':'ies'}</span>
      <span class="arc-grand__v" style="color:var(--red)">${fmtPKR(grand)}</span>
    </div>`;
}

// ── CANCELLATIONS ────────────────────────────────────────────────────────────
function _arcCancelsPanel(T, label) {
  const list = T.cancels.slice()
    .sort((a, b) => String(_arcCancDate(b)).localeCompare(String(_arcCancDate(a))));
  return `
  <div class="arc-panel">
    <div class="arc-panel__head">
      <span class="arc-panel__t">Cancellations — ${escHtml(label)}</span>
      <span class="arc-panel__n">${list.length} request${list.length===1?'':'s'}</span>
    </div>
    ${list.length ? `
    <div class="arc-wrap"><table class="arc-table">
      <thead><tr><th>Ref</th><th>Requested</th><th>Student</th><th>Room</th>
        <th>Vacate date</th><th>Reason</th><th>Status</th></tr></thead>
      <tbody>
        ${list.map(c => `<tr class="${c.studentId?'is-click':''}" ${c.studentId?`onclick="showArchiveStudent('${c.studentId}')"`:''}>
          <td>${c.seq ? 'CAN-' + String(c.seq).padStart(4, '0') : '—'}</td>
          <td>${escHtml(fmtDate(_arcCancDate(c)) || '—')}</td>
          <td class="nm">${escHtml(c.studentName || '—')}</td>
          <td>#${escHtml(String(c.roomNumber || '—'))}</td>
          <td>${escHtml(fmtDate(c.vacateDate) || '—')}</td>
          <td>${escHtml(c.reason || '—')}</td>
          <td>${statusBadge(c.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : '<div class="arc-empty">No cancellations were raised in this period.</div>'}
  </div>`;
}

// ── STUDENT DRILL-DOWN ───────────────────────────────────────────────────────
// One student, one period: what they were charged, what they paid, what is
// still owed, plus any fine or cancellation that period holds. Printable on its
// own, because this is the sheet a warden hands to a parent who is asking.
function showArchiveStudent(studentId) {
  const s = (DB.students || []).find(x => x.id === studentId);
  const key = _arcKey(), label = _arcLabel();
  if (!s) {
    // The student record itself can be gone (cleared roster) while their
    // payments survive in the archive — show the money rather than nothing.
    const orphan = _arcPayments().filter(p => p.studentId === studentId && _payMatchesMonth(p, key));
    showModal('modal-lg', 'Archived student — ' + escHtml(label),
      orphan.length
        ? `<div class="arc-sd-sec">Payments</div>${_arcPayRows(orphan)}`
        : '<div class="arc-empty">This student record is no longer on file.</div>',
      '<button class="btn btn-secondary" onclick="closeModal()">Close</button>');
    return;
  }

  const f    = _arcStudentFigures(s.id, key);
  const room = (DB.rooms || []).find(r => r.id === s.roomId);
  const ch   = (typeof resolveCharges === 'function') ? resolveCharges(s) : { total: Number(s.rent||0), rent: Number(s.rent||0), messBilled: 0 };
  const fines = _arcFines().filter(x => x.studentId === s.id && String(x.date||'').startsWith(key));
  const cans  = _arcCancellations().filter(c => c.studentId === s.id && String(_arcCancDate(c)).startsWith(key));
  const initials = String(s.name || '?').trim().slice(0, 1).toUpperCase();

  const body = `
    <div class="arc-sd-head">
      <div class="arc-sd-av">${escHtml(initials)}</div>
      <div>
        <div class="arc-sd-n">${escHtml(s.name || '—')}</div>
        ${''/* The floor rides with the number (owner, 2026-09-10). */}
        <div class="arc-sd-s">${escHtml(s.fatherName ? 'S/O ' + s.fatherName + ' · ' : '')}${room ? 'Room ' + escHtml(roomText(room)) : 'No room'} · ${escHtml(label)}</div>
      </div>
      <div style="margin-left:auto">${statusBadge(s.status)}</div>
    </div>

    <div class="arc-sd-kpis">
      <div class="arc-sd-k"><div class="arc-sd-k__l">Monthly Charge</div><div class="arc-sd-k__v">${fmtPKR(ch.total)}</div></div>
      <div class="arc-sd-k"><div class="arc-sd-k__l">Paid</div><div class="arc-sd-k__v" style="color:var(--green)">${fmtPKR(f.paid)}</div></div>
      <div class="arc-sd-k"><div class="arc-sd-k__l">Outstanding</div><div class="arc-sd-k__v" style="color:${f.pending?'var(--red)':'var(--text3)'}">${fmtPKR(f.pending)}</div></div>
      <div class="arc-sd-k"><div class="arc-sd-k__l">Records</div><div class="arc-sd-k__v">${f.count}</div></div>
    </div>

    <div class="arc-sd-sec">Payments in ${escHtml(label)}</div>
    ${f.pays.length ? _arcPayRows(f.pays) : '<div class="arc-empty" style="padding:18px">No payment records for this period.</div>'}

    ${fines.length ? `<div class="arc-sd-sec">Fines</div>
    <div class="arc-wrap"><table class="arc-table">
      <thead><tr><th>Date</th><th>Reason</th><th>Status</th><th class="num">Amount</th></tr></thead>
      <tbody>${fines.map(x => `<tr><td>${escHtml(fmtDate(x.date)||'—')}</td><td>${escHtml(x.reason||'—')}</td>
        <td>${x.paid ? '<span class="badge badge-green">Paid</span>' : '<span class="badge badge-red">Unpaid</span>'}</td>
        <td class="num">${fmtPKR(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : ''}

    ${cans.length ? `<div class="arc-sd-sec">Cancellation</div>
    <div class="arc-wrap"><table class="arc-table">
      <thead><tr><th>Requested</th><th>Vacate</th><th>Reason</th><th>Status</th></tr></thead>
      <tbody>${cans.map(c => `<tr><td>${escHtml(fmtDate(_arcCancDate(c))||'—')}</td>
        <td>${escHtml(fmtDate(c.vacateDate)||'—')}</td><td>${escHtml(c.reason||'—')}</td>
        <td>${statusBadge(c.status)}</td></tr>`).join('')}</tbody></table></div>` : ''}

    <div class="arc-sd-sec">On file</div>
    <div class="arc-wrap"><table class="arc-table"><tbody>
      <tr><td class="nm">Phone</td><td>${escHtml(s.phone || '—')}</td></tr>
      <tr><td class="nm">CNIC</td><td>${s.cnic ? cnicHtml(s.cnic) : '—'}</td></tr>
      <tr><td class="nm">Joined</td><td>${escHtml(fmtDate(s.joinDate) || '—')}</td></tr>
      ${(s.leftDate || s.leaveDate) ? `<tr><td class="nm">Left</td><td>${escHtml(fmtDate(s.leftDate || s.leaveDate))}</td></tr>` : ''}
    </tbody></table></div>`;

  showModal('modal-lg', 'Student record — ' + escHtml(label), body,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
     <button class="btn btn-primary" onclick="printArchiveStudent('${s.id}')">${icon('print','xs')} Print this record</button>`);
}

function _arcPayRows(pays) {
  const sorted = pays.slice().sort((a, b) => String(b.date||'').localeCompare(String(a.date||'')));
  const paid = _arcCollected(sorted);
  const due  = _arcOwed(sorted);
  return `<div class="arc-wrap"><table class="arc-table">
    <thead><tr><th>Date</th><th>Month</th><th>Method</th><th>Status</th>
      <th class="num">Paid</th><th class="num">Outstanding</th></tr></thead>
    <tbody>
      ${sorted.map(p => `<tr>
        <td>${escHtml(fmtDate(p.date) || '—')}</td>
        <td>${escHtml(p.month || '—')}</td>
        <td>${pmBadge(p.method)}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="num" style="color:${Number(p.amount)>0?'var(--green)':'var(--text3)'}">${Number(p.amount)>0?fmtPKR(p.amount):'—'}</td>
        <td class="num" style="color:var(--red)">${p.status==='Pending'?fmtPKR(outstandingOf(p)):'—'}</td>
      </tr>`).join('')}
      <tr class="arc-sub"><td colspan="4">Total</td>
        <td class="num" style="color:var(--green)">${fmtPKR(paid)}</td>
        <td class="num" style="color:var(--red)">${fmtPKR(due)}</td></tr>
    </tbody></table></div>`;
}

/* ══ THE ANNUAL ARCHIVE EXPORT ═════════════════════════════════════════════
   §39 asks for the strongest structure in the specification, and for a good
   reason: this is the document an owner files at the end of a period and the
   one an accountant is handed. "Do not create one enormous unstructured
   table" — so the period comes out as SECTIONS, each with its own heading,
   columns and totals, and the workbook puts each section on its own SHEET
   (Summary, Students, Payments, Outstanding, Expenses, Cancellations) because
   they are materially different datasets that nobody wants interleaved.

   The engine renders both from this one definition, which is what stopped the
   PDF and the CSV drifting: they were separate code with separate column
   lists, and the CSV quietly carried a "Paid" figure the PDF did not.

   Every figure is _arcTotals() / _arcStudentFigures(), the archive screen's
   own arithmetic — the export computes nothing of its own, so a printed
   archive and the screen behind it cannot disagree.                         */
function _arcExportDef() {
  const T      = _arcTotals();
  const key    = _arcKey();
  const label  = _arcLabel();
  const groups = _rptByCategory(T.exps);
  const roomOf = s => { const r = (DB.rooms || []).find(x => x.id === s.roomId); return r ? String(r.number) : ''; };
  const figOf  = s => _arcStudentFigures(s.id, key);

  const pend = T.pays.filter(p => p.status === 'Pending');

  return {
    module: 'Annual-Archive',
    title:  'Annual Archive',
    scope:  label,
    orientation: 'landscape',
    sheetPerSection: true,

    filters: [['Period', label]],

    /* §39's cover summary. These are the period's headline figures and they
       lead both files, because they are what the document is opened for. */
    summary: [
      { label: 'Students',      value: String(T.students.length) },
      { label: 'Revenue',       value: EXPORT.fmt.money(T.rev), tone: 'pos' },
      { label: 'Expenses',      value: EXPORT.fmt.money(T.exp), tone: 'neg' },
      { label: 'Available fund', value: EXPORT.fmt.money(T.net), tone: T.net >= 0 ? 'pos' : 'neg' },
      { label: 'Outstanding',   value: EXPORT.fmt.money(T.pending), tone: T.pending > 0 ? 'neg' : '' },
      { label: 'Payments',      value: String(T.pays.length) },
      { label: 'Cancellations', value: String(T.cancels.length) },
    ],

    sections: [
      {
        title: 'Students',
        meta: T.students.length + ' on the roster in this period',
        empty: 'Nobody was on the roster in this period.',
        columns: [
          { label: 'Room', type: 'id', width: 9,
            value: roomOf,
            get:   s => { const r = roomOf(s); return r ? '<b>#' + escHtml(r) + '</b>' : '—'; } },
          { label: 'Student', type: 'text', width: 22, value: s => s.name || '',
            get: s => '<b>' + escHtml(s.name || '—') + '</b>' },
          { label: 'Father / Guardian', type: 'text', width: 22, value: s => s.fatherName || '' },
          { label: 'Joined', type: 'date', width: 13, value: s => s.joinDate || '' },
          { label: 'Status', type: 'status', width: 12, value: s => s.status || '' },
          { label: 'Charge / mo', type: 'money', width: 14, total: 'sum',
            value: s => { const c = (typeof resolveCharges === 'function')
              ? resolveCharges(s) : { total: Number(s.rent || 0) }; return c.total || null; } },
          { label: 'Paid', type: 'money', width: 14, total: 'sum',
            value: s => figOf(s).paid || null },
          { label: 'Outstanding', type: 'money', width: 14, total: 'sum',
            value: s => figOf(s).pending || null,
            get:   s => { const f = figOf(s);
              return f.pending ? '<span class="neg">' + fmtPKR(f.pending) + '</span>' : '—'; } },
        ],
        rows: T.students,
      },

      {
        title: 'Payments',
        meta: T.pays.length + ' record' + (T.pays.length === 1 ? '' : 's'),
        empty: 'No payments in this period.',
        columns: [
          { label: 'Date',    type: 'date', width: 13, value: p => p.date || '' },
          { label: 'Room',    type: 'id',   width: 9,  value: p => String(p.roomNumber || ''),
            get: p => '<b>#' + escHtml(String(p.roomNumber || '—')) + '</b>' },
          { label: 'Student', type: 'text', width: 22, value: p => p.studentName || '' },
          { label: 'Month',   type: 'text', width: 16, value: p => monthLabel(p.month) },
          { label: 'Method',  type: 'text', width: 13, value: p => p.method || '' },
          { label: 'Status',  type: 'status', width: 11, value: p => p.status || '' },
          { label: 'Paid',    type: 'money', width: 14, total: 'sum',
            value: p => Number(p.amount || 0) || null },
          { label: 'Outstanding', type: 'money', width: 14, total: 'sum',
            value: p => p.status === 'Pending' ? outstandingOf(p) : null,
            get:   p => p.status === 'Pending' && outstandingOf(p) > 0
                     ? '<span class="neg">' + fmtPKR(outstandingOf(p)) + '</span>' : '—' },
        ],
        rows: T.pays.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
        grand: { label: 'Collected in this period', value: fmtPKR(T.rev) },
      },

      {
        title: 'Outstanding',
        meta: pend.length + ' unpaid record' + (pend.length === 1 ? '' : 's'),
        empty: 'Nothing was left unpaid in this period.',
        columns: [
          { label: 'Room', type: 'id', width: 9, value: p => String(p.roomNumber || ''),
            get: p => '<b>#' + escHtml(String(p.roomNumber || '—')) + '</b>' },
          { label: 'Student', type: 'text', width: 24, value: p => p.studentName || '' },
          { label: 'Month',   type: 'text', width: 18, value: p => monthLabel(p.month) },
          { label: 'Owed',    type: 'money', width: 15, total: 'sum',
            value: p => outstandingOf(p),
            get:   p => '<span class="neg">' + fmtPKR(outstandingOf(p)) + '</span>' },
        ],
        rows: pend,
        grand: { label: 'Total outstanding', value: fmtPKR(T.pending) },
      },

      {
        title: 'Expenses',
        meta: groups.length + ' categor' + (groups.length === 1 ? 'y' : 'ies'),
        empty: 'Nothing was spent in this period.',
        groupLabel: 'Category',
        columns: [
          { label: 'Date', type: 'date', width: 13, value: e => e.date || '' },
          { label: 'Description', type: 'wrap', width: 44, value: e => e.description || '' },
          { label: 'Amount', type: 'money', width: 15, total: 'sum',
            value: e => Number(e.amount || 0),
            get:   e => '<b>' + fmtPKR(e.amount) + '</b>' },
        ],
        groups: groups.map(g => ({
          label: g.cat,
          meta: g.items.length + ' record' + (g.items.length === 1 ? '' : 's'),
          rows: g.items,
          total: { label: 'Total — ' + g.cat, value: fmtPKR(g.total) },
        })),
        grand: { label: 'Total spent in this period', value: fmtPKR(_rptGroupsTotal(groups)) },
      },

      {
        title: 'Cancellations',
        meta: T.cancels.length + ' departure' + (T.cancels.length === 1 ? '' : 's'),
        empty: 'No cancellations were raised in this period.',
        columns: [
          { label: 'Ref', type: 'id', width: 12,
            value: c => c.seq ? 'CAN-' + String(c.seq).padStart(4, '0') : '' },
          { label: 'Requested', type: 'date', width: 14, value: c => _arcCancDate(c) || '' },
          { label: 'Room', type: 'id', width: 9, value: c => String(c.roomNumber || ''),
            get: c => '<b>#' + escHtml(String(c.roomNumber || '—')) + '</b>' },
          { label: 'Student', type: 'text', width: 22, value: c => c.studentName || '' },
          { label: 'Vacates', type: 'date', width: 14, value: c => c.vacateDate || '' },
          { label: 'Reason',  type: 'wrap', width: 30, value: c => c.reason || '' },
          { label: 'Status',  type: 'status', width: 12, value: c => c.status || '' },
        ],
        rows: T.cancels,
      },
    ],

    /* §57 — an annual archive is a certified record of a closed period. */
    signatures: ['Prepared by', 'Owner / Manager'],
    empty: 'No records were held in this period.',
  };
}

function printArchive()        { EXPORT.pdf(_arcExportDef()); }
function exportArchivePDF()    { EXPORT.pdf(_arcExportDef()); }
function exportArchiveExcel()  { EXPORT.excel(_arcExportDef()); }
function downloadArchiveCSV()  { exportArchiveExcel(); }

/* ── ONE STUDENT'S PERIOD RECORD ─────────────────────────────────────────────
   A record document rather than a register: the identity block is `facts`, and
   the single table is that student's payments. §5 puts a document of this
   shape in portrait, which is the one place in the archive that is not
   landscape.                                                                */
function printArchiveStudent(studentId) {
  const s     = (DB.students || []).find(x => x.id === studentId);
  const key   = _arcKey(), label = _arcLabel();
  const f     = _arcStudentFigures(studentId, key);
  const room  = s ? (DB.rooms || []).find(r => r.id === s.roomId) : null;
  const ch    = (s && typeof resolveCharges === 'function') ? resolveCharges(s) : { total: 0 };

  EXPORT.pdf({
    module: 'Student-Record',
    title:  'Student Record',
    scope:  label,
    orientation: 'portrait',

    facts: [
      ['Student', s ? s.name : ''],
      ['Father / Guardian', s ? s.fatherName : ''],
      ['Room', room ? roomText(room) : ''],
      ['Phone', s ? s.phone : ''],
      // Masked in the export, like every other printed CNIC (owner, 2026-09-10).
      ['CNIC', s ? maskCnic(s.cnic) : ''],
      ['Joined', s && s.joinDate ? EXPORT.fmt.date(s.joinDate) : ''],
      ['Status', s ? s.status : ''],
      ['Course', s ? (s.occupation || s.course) : ''],
      ['Period', label],
    ],

    summary: [
      { label: 'Charge / month', value: EXPORT.fmt.money(ch.total) },
      { label: 'Paid',           value: EXPORT.fmt.money(f.paid), tone: 'pos' },
      { label: 'Outstanding',    value: EXPORT.fmt.money(f.pending),
        tone: f.pending > 0 ? 'neg' : '' },
    ],

    sections: [{
      title: 'Payments — ' + label,
      empty: 'No payment records for this period.',
      columns: [
        { label: 'Date',   type: 'date', width: 13, value: p => p.date || '' },
        { label: 'Month',  type: 'text', width: 16, value: p => monthLabel(p.month) },
        { label: 'Method', type: 'text', width: 13, value: p => p.method || '' },
        { label: 'Status', type: 'status', width: 11, value: p => p.status || '' },
        { label: 'Paid',   type: 'money', width: 14, total: 'sum',
          value: p => Number(p.amount || 0) || null },
        { label: 'Outstanding', type: 'money', width: 14, total: 'sum',
          value: p => p.status === 'Pending' ? outstandingOf(p) : null },
      ],
      rows: f.pays.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      grand: { label: 'Outstanding at end of period', value: fmtPKR(f.pending) },
    }],

    signatures: ['Student', 'Warden'],
  });
}

/* ── THE YEAR, DRAWN ─────────────────────────────────────────────────────────
   Two panels from `annual archive.png`: money in against money out, and who
   arrived, left and stayed. Both read the SAME twelve rows the table above
   them is built from, so the picture and the figures cannot drift apart.

   Bars rather than a chart library: this app ships none, the dashboard draws
   its donut by hand for the same reason, and twelve bars do not justify a
   dependency in an offline installer. An empty year draws nothing at all —
   twelve zero-height bars under a legend is a chart that says a hostel had a
   year of nothing, when the truth is that nothing was recorded. */
function arcCharts(y, rows) {
  const anyMoney = rows.some(r => r.rev > 0 || r.ex > 0);

  /* Student movement is not on the month rows, so it is counted here from the
     roster: joined in this month, left in this month, and how many were on the
     books by the end of it. `leftDate` is written by the cancellation flow. */
  const move = rows.map(r => {
    const mk = r.mk;
    const joined = (DB.students || []).filter(st => String(st.joinDate || "").startsWith(mk)).length;
    const left   = (DB.students || []).filter(st => String(st.leftDate  || "").startsWith(mk)).length;
    const resident = (DB.students || []).filter(st => {
      const j = String(st.joinDate || "");
      const l = String(st.leftDate || "");
      if (!j || j.slice(0, 7) > mk) return false;
      return !l || l.slice(0, 7) >= mk;
    }).length;
    return { mn: r.mn, joined, left, resident };
  });
  const anyMove = move.some(m => m.joined || m.left || m.resident);

  const bars = (series, data, max) => data.map(function (d) {
    return '<div class="arc-cbar" title="' + escHtml(d.label) + '">'
      + series.map(function (sr) {
          const v = Number(d[sr.k] || 0);
          const h = max > 0 ? Math.round(v / max * 100) : 0;
          return '<span class="arc-cbar__b ' + sr.hue + '" style="height:' + h + '%"'
               + ' title="' + escHtml(sr.label + ": " + (sr.money ? fmtPKR(v) : String(v))) + '"></span>';
        }).join('')
      + '</div>';
  }).join('');

  const axis = data => '<div class="arc-axis">'
    + data.map(d => '<span>' + escHtml(d.mn) + '</span>').join('') + '</div>';

  const legend = series => '<div class="arc-legend">'
    + series.map(sr => '<span class="arc-legend__i"><i class="' + sr.hue + '"></i>'
        + escHtml(sr.label) + '</span>').join('') + '</div>';

  const moneySeries = [
    { k: 'rev', hue: 'dh-green', label: 'Revenue', money: true },
    { k: 'ex',  hue: 'dh-red',   label: 'Expenses', money: true },
  ];
  const moveSeries = [
    { k: 'joined',   hue: 'dh-blue',   label: 'Admitted' },
    { k: 'left',     hue: 'dh-amber',  label: 'Left' },
    { k: 'resident', hue: 'dh-violet', label: 'On the roster' },
  ];

  const moneyMax = Math.max.apply(null, rows.map(r => Math.max(r.rev, r.ex)).concat([0]));
  const moveMax  = Math.max.apply(null, move.map(m => Math.max(m.joined, m.left, m.resident)).concat([0]));

  const moneyData = rows.map(r => ({ mn: r.mn, rev: r.rev, ex: r.ex, label: r.mn + " — " + fmtPKR(r.rev) + " in, " + fmtPKR(r.ex) + " out" }));
  const moveData  = move.map(m => ({ mn: m.mn, joined: m.joined, left: m.left, resident: m.resident,
    label: m.mn + " — " + m.joined + " admitted, " + m.left + " left, " + m.resident + " on the roster" }));

  const panel = (title, on, series, data, max, empty) => '<div class="arc-panel arc-chart">'
    + '<div class="arc-panel__head"><span class="arc-panel__t">' + escHtml(title) + '</span>'
    + (on ? legend(series) : '') + '</div>'
    + (on
        ? '<div class="arc-chart__b"><div class="arc-bars">' + bars(series, data, max) + '</div>' + axis(data) + '</div>'
        : '<div class="arc-chart__empty">' + escHtml(empty) + '</div>')
    + '</div>';

  return '<div class="arc-charts">'
    + panel('Revenue vs expenses (' + y + ')', anyMoney, moneySeries, moneyData, moneyMax,
            'No payment or expense was recorded in ' + y + ', so there is nothing to plot.')
    + panel('Student movement (' + y + ')', anyMove, moveSeries, moveData, moveMax,
            'Nobody was admitted or left in ' + y + '.')
    + '</div>';
}
