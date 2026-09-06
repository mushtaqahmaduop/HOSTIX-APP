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
      <button class="arc-btn" onclick="downloadArchiveCSV()">${icon('download','xs')} CSV</button>
      <button class="arc-btn arc-btn--primary" onclick="printArchive()">${icon('print','xs')} Print / PDF</button>
    </div>
  </div>`;

  const kpi = (hue, l, v, s) => `
    <div class="arc-kpi ${hue}"><div class="arc-kpi__l">${l}</div>
    <div class="arc-kpi__v">${v}</div><div class="arc-kpi__s">${s}</div></div>`;

  const kpis = `
  <div class="arc-kpis">
    ${kpi('dh-green','Revenue',   fmtPKR(T.rev),     `${T.pays.filter(p=>p.status==='Paid').length} paid records`)}
    ${kpi('dh-red',  'Expenses',  fmtPKR(T.exp),     `${T.exps.length} record${T.exps.length===1?'':'s'}`)}
    ${kpi(T.net>=0?'dh-green':'dh-red','Available Fund', fmtPKR(T.net), 'Revenue − Expenses')}
    ${kpi('dh-amber','Pending',   fmtPKR(T.pending), `${T.pays.filter(p=>p.status==='Pending').length} unpaid`)}
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
    </div>`;
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
        <div class="arc-sd-s">${escHtml(s.fatherName ? 'S/O ' + s.fatherName + ' · ' : '')}${room ? 'Room #' + escHtml(String(room.number)) : 'No room'} · ${escHtml(label)}</div>
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
      <tr><td class="nm">CNIC</td><td>${escHtml(s.cnic || '—')}</td></tr>
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

// ── PRINT ────────────────────────────────────────────────────────────────────
// The whole period as one document: summary, roster, payments, outstanding,
// the category register and the cancellations. This is the sheet an owner files
// or hands to an accountant, so it carries every section rather than whichever
// tab happened to be open.
function printArchive() {
  const T = _arcTotals(), label = _arcLabel(), key = _arcKey();
  const hostel = DB.settings.hostelName || 'Hostel';
  const groups = _rptByCategory(T.exps);

  const money = n => 'PKR ' + Number(n || 0).toLocaleString('en-PK');
  const sec = (title, inner) => `<h3>${title}</h3>${inner}`;
  const none = m => `<table><tbody><tr><td style="text-align:center;color:#aaa;padding:10px">${escHtml(m)}</td></tr></tbody></table>`;

  const students = T.students.map(s => {
    const f = _arcStudentFigures(s.id, key);
    const room = (DB.rooms || []).find(r => r.id === s.roomId);
    const ch = (typeof resolveCharges === 'function') ? resolveCharges(s) : { total: Number(s.rent||0) };
    return `<tr><td>${escHtml(s.name||'—')}</td><td>${escHtml(s.fatherName||'—')}</td>
      <td>${room?'#'+escHtml(String(room.number)):'—'}</td><td>${escHtml(fmtDate(s.joinDate)||'—')}</td>
      <td>${escHtml(s.status||'—')}</td><td style="text-align:right">${money(ch.total)}</td>
      <td style="text-align:right" class="gr">${f.paid?money(f.paid):'—'}</td>
      <td style="text-align:right" class="re">${f.pending?money(f.pending):'—'}</td></tr>`;
  }).join('');

  const payRows = T.pays.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(p =>
    `<tr><td>${escHtml(fmtDate(p.date)||'—')}</td><td>${escHtml(p.studentName||'—')}</td>
     <td>#${escHtml(String(p.roomNumber||'—'))}</td><td>${escHtml(p.month||'—')}</td>
     <td>${escHtml(p.method||'—')}</td><td>${escHtml(p.status||'—')}</td>
     <td style="text-align:right" class="gr">${Number(p.amount)>0?money(p.amount):'—'}</td>
     <td style="text-align:right" class="re">${p.status==='Pending'?money(outstandingOf(p)):'—'}</td></tr>`).join('');

  const pendRows = T.pays.filter(p=>p.status==='Pending').map(p =>
    `<tr><td>${escHtml(p.studentName||'—')}</td><td>#${escHtml(String(p.roomNumber||'—'))}</td>
     <td>${escHtml(p.month||'—')}</td><td style="text-align:right" class="re">${money(outstandingOf(p))}</td></tr>`).join('');

  const canRows = T.cancels.map(c =>
    `<tr><td>${c.seq?'CAN-'+String(c.seq).padStart(4,'0'):'—'}</td>
     <td>${escHtml(fmtDate(_arcCancDate(c))||'—')}</td><td>${escHtml(c.studentName||'—')}</td>
     <td>#${escHtml(String(c.roomNumber||'—'))}</td><td>${escHtml(fmtDate(c.vacateDate)||'—')}</td>
     <td>${escHtml(c.reason||'—')}</td><td>${escHtml(c.status||'—')}</td></tr>`).join('');

  const expSections = groups.map(g => `
    <h4 style="margin:12px 0 4px;font-size:12px">${escHtml(g.cat)} — ${g.items.length} record${g.items.length===1?'':'s'}</h4>
    <table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>
      ${g.items.map(e => `<tr><td>${escHtml(fmtDate(e.date)||'—')}</td><td>${escHtml(e.description||'—')}</td>
        <td style="text-align:right" class="re">${money(e.amount)}</td></tr>`).join('')}
      <tr style="background:#f1f5f9;font-weight:800"><td colspan="2" style="text-align:right">Total — ${escHtml(g.cat)}</td>
        <td style="text-align:right" class="re">${money(g.total)}</td></tr>
    </tbody></table>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${escHtml(hostel)} — Archive ${escHtml(label)}</title>${printDocStyles()}</head><body>
  <div class="header"><div>
    <div class="title">${escHtml(hostel)} — Annual Archive</div>
    <div style="font-size:12px;color:#666;margin-top:3px">${escHtml(label)} · Generated ${new Date().toLocaleDateString()}</div>
  </div><div style="font-size:11px;color:#94a3b8">Archive Report</div></div>

  <div class="kpi-grid">
    <div class="kpi"><label>Revenue</label><div class="val green">${money(T.rev)}</div></div>
    <div class="kpi"><label>Expenses</label><div class="val red">${money(T.exp)}</div></div>
    <div class="kpi"><label>Available Fund</label><div class="val ${T.net>=0?'green':'red'}">${money(T.net)}</div></div>
    <div class="kpi"><label>Pending</label><div class="val red">${money(T.pending)}</div></div>
    <div class="kpi"><label>Students</label><div class="val">${T.students.length}</div></div>
    <div class="kpi"><label>Cancellations</label><div class="val">${T.cancels.length}</div></div>
  </div>

  ${sec('Students', students ? `<table><thead><tr><th>Name</th><th>Father</th><th>Room</th><th>Joined</th>
    <th>Status</th><th style="text-align:right">Monthly Charge</th><th style="text-align:right">Paid</th>
    <th style="text-align:right">Pending</th></tr></thead><tbody>${students}</tbody></table>`
    : none('Nobody was on the roster in this period'))}

  ${sec('Payments', payRows ? `<table><thead><tr><th>Date</th><th>Student</th><th>Room</th><th>Month</th>
    <th>Method</th><th>Status</th><th style="text-align:right">Paid</th>
    <th style="text-align:right">Outstanding</th></tr></thead><tbody>${payRows}</tbody></table>`
    : none('No payments in this period'))}

  ${sec('Outstanding', pendRows ? `<table><thead><tr><th>Student</th><th>Room</th><th>Month</th>
    <th style="text-align:right">Owed</th></tr></thead><tbody>${pendRows}
    <tr style="background:#f1f5f9;font-weight:800"><td colspan="3" style="text-align:right">Total outstanding</td>
    <td style="text-align:right" class="re">${money(T.pending)}</td></tr></tbody></table>`
    : none('Nothing was left unpaid in this period'))}

  ${sec('Expenses by Category', groups.length ? expSections + `
    <table style="margin-top:10px"><tbody><tr style="background:#e2e8f0;font-weight:900">
      <td style="padding:9px 12px">GRAND TOTAL — ${groups.length} categor${groups.length===1?'y':'ies'}</td>
      <td style="padding:9px 12px;text-align:right" class="re">${money(_rptGroupsTotal(groups))}</td>
    </tr></tbody></table>` : none('Nothing was spent in this period'))}

  ${sec('Cancellations', canRows ? `<table><thead><tr><th>Ref</th><th>Requested</th><th>Student</th>
    <th>Room</th><th>Vacate</th><th>Reason</th><th>Status</th></tr></thead><tbody>${canRows}</tbody></table>`
    : none('No cancellations were raised in this period'))}

  <div class="footer">Generated ${new Date().toLocaleDateString()} · ${escHtml(hostel)} · Confidential</div>
  </body></html>`;

  _electronPDF(html, hostel.replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'') + '_Archive_' + key + '.pdf',
    { pageSize: 'A4' });
}

// One student's period record as its own document.
function printArchiveStudent(studentId) {
  const s = (DB.students || []).find(x => x.id === studentId);
  const key = _arcKey(), label = _arcLabel();
  const f = _arcStudentFigures(studentId, key);
  const room = s ? (DB.rooms || []).find(r => r.id === s.roomId) : null;
  const ch = (s && typeof resolveCharges === 'function') ? resolveCharges(s) : { total: 0 };
  const hostel = DB.settings.hostelName || 'Hostel';
  const money = n => 'PKR ' + Number(n || 0).toLocaleString('en-PK');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${escHtml(hostel)} — ${escHtml(s ? s.name : 'Student')} ${escHtml(label)}</title>
  ${printDocStyles()}</head><body>
  <div class="header"><div>
    <div class="title">${escHtml(hostel)}</div>
    <div style="font-size:12px;color:#666;margin-top:3px">Student record · ${escHtml(label)} · Generated ${new Date().toLocaleDateString()}</div>
  </div></div>
  <table><tbody>
    <tr><td style="width:180px;font-weight:700">Student</td><td>${escHtml(s ? s.name : '—')}</td></tr>
    <tr><td style="font-weight:700">Father</td><td>${escHtml((s && s.fatherName) || '—')}</td></tr>
    <tr><td style="font-weight:700">Room</td><td>${room ? '#' + escHtml(String(room.number)) : '—'}</td></tr>
    <tr><td style="font-weight:700">Phone</td><td>${escHtml((s && s.phone) || '—')}</td></tr>
    <tr><td style="font-weight:700">CNIC</td><td>${escHtml((s && s.cnic) || '—')}</td></tr>
    <tr><td style="font-weight:700">Joined</td><td>${escHtml((s && fmtDate(s.joinDate)) || '—')}</td></tr>
    <tr><td style="font-weight:700">Status</td><td>${escHtml((s && s.status) || '—')}</td></tr>
  </tbody></table>
  <div class="kpi-grid" style="margin-top:16px">
    <div class="kpi"><label>Monthly Charge</label><div class="val">${money(ch.total)}</div></div>
    <div class="kpi"><label>Paid</label><div class="val green">${money(f.paid)}</div></div>
    <div class="kpi"><label>Outstanding</label><div class="val red">${money(f.pending)}</div></div>
  </div>
  <h3>Payments — ${escHtml(label)}</h3>
  ${f.pays.length ? `<table><thead><tr><th>Date</th><th>Month</th><th>Method</th><th>Status</th>
    <th style="text-align:right">Paid</th><th style="text-align:right">Outstanding</th></tr></thead><tbody>
    ${f.pays.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(p=>`<tr>
      <td>${escHtml(fmtDate(p.date)||'—')}</td><td>${escHtml(p.month||'—')}</td>
      <td>${escHtml(p.method||'—')}</td><td>${escHtml(p.status||'—')}</td>
      <td style="text-align:right" class="gr">${Number(p.amount)>0?money(p.amount):'—'}</td>
      <td style="text-align:right" class="re">${p.status==='Pending'?money(outstandingOf(p)):'—'}</td>
    </tr>`).join('')}
    <tr style="background:#f1f5f9;font-weight:800"><td colspan="4" style="text-align:right">Total</td>
      <td style="text-align:right" class="gr">${money(f.paid)}</td>
      <td style="text-align:right" class="re">${money(f.pending)}</td></tr>
    </tbody></table>` : `<table><tbody><tr><td style="text-align:center;color:#aaa;padding:10px">No payment records for this period</td></tr></tbody></table>`}
  <div class="footer">Generated ${new Date().toLocaleDateString()} · ${escHtml(hostel)} · Confidential</div>
  </body></html>`;

  _electronPDF(html, hostel.replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'') + '_' +
    String((s && s.name) || 'Student').replace(/\s+/g,'-') + '_' + key + '.pdf', { pageSize: 'A4' });
}

// ── CSV ──────────────────────────────────────────────────────────────────────
// Every section in one file, each under its own heading, so the period can be
// opened in a spreadsheet without losing which block a row belongs to.
function downloadArchiveCSV() {
  const T = _arcTotals(), key = _arcKey(), label = _arcLabel();
  const rows = [];
  const push = a => rows.push(a);
  const blank = () => rows.push([]);

  push([DB.settings.hostelName || 'Hostel', 'Annual Archive', label]);
  blank();
  push(['Summary']);
  push(['Revenue', T.rev]); push(['Expenses', T.exp]); push(['Available Fund', T.net]);
  push(['Pending', T.pending]); push(['Students', T.students.length]);
  push(['Cancellations', T.cancels.length]);
  blank();

  push(['Students']);
  push(['Name','Father','Room','Joined','Status','Monthly Charge','Paid','Pending']);
  T.students.forEach(s => {
    const f = _arcStudentFigures(s.id, key);
    const room = (DB.rooms || []).find(r => r.id === s.roomId);
    const ch = (typeof resolveCharges === 'function') ? resolveCharges(s) : { total: Number(s.rent||0) };
    push([s.name||'—', s.fatherName||'—', room?'#'+room.number:'—', s.joinDate||'—',
          s.status||'—', ch.total, f.paid, f.pending]);
  });
  blank();

  push(['Payments']);
  push(['Date','Student','Room','Month','Method','Status','Paid','Outstanding']);
  T.pays.forEach(p => push([p.date||'—', p.studentName||'—', '#'+(p.roomNumber||'—'), p.month||'—',
    p.method||'—', p.status||'—', Number(p.amount||0),
    outstandingOf(p)]));
  blank();

  push(['Expenses by Category']);
  push(['Category','Date','Description','Amount']);
  const groups = _rptByCategory(T.exps);
  groups.forEach(g => {
    g.items.forEach(e => push([g.cat, e.date||'—', e.description||'—', Number(e.amount||0)]));
    push(['', '', 'Total — ' + g.cat, g.total]);
    blank();
  });
  push(['', '', 'GRAND TOTAL', _rptGroupsTotal(groups)]);
  blank();

  push(['Cancellations']);
  push(['Ref','Requested','Student','Room','Vacate','Reason','Status']);
  T.cancels.forEach(c => push([c.seq?'CAN-'+String(c.seq).padStart(4,'0'):'—',
    _arcCancDate(c)||'—', c.studentName||'—', '#'+(c.roomNumber||'—'),
    c.vacateDate||'—', c.reason||'—', c.status||'—']));

  const csv = rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Archive_' + key + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('Downloaded: Archive_' + key + '.csv', 'success');
}
