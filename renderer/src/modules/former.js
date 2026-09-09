/* ════════════════════════════════════════════════════════════════════════════
   FORMER STUDENTS — the page, built 2026-09-10 to `former student page.png`.

   IT WAS A MODAL BEHIND THE ACCOUNT MENU, and it was a search box: nothing at
   all until you typed, then a stack of cards with a payment ledger folded into
   each one. Two things were wrong with that beyond the styling.

   A REGISTER THAT SHOWS NOTHING UNTIL YOU TYPE ANSWERS ONLY THE QUESTION YOU
   ALREADY KNOW THE ANSWER TO. "Who left this month", "who left owing money",
   "which of last year's students might come back" are all questions about the
   whole list, and none of them could be asked. The page opens on the list.

   AND IT WAS IN THE WRONG PLACE. Former students are PEOPLE — the rail's own
   grouping — not an account setting. It sits under Students now, where the
   reference draws it, and the account menu keeps a link to it rather than a
   dialog of its own.

   WHAT A FORMER STUDENT IS, EXACTLY: `status === 'Left'`. `leftDate` is the
   day they actually went (the vacate date, not the day the paperwork was
   done), `lastRoom` is the room they had, and the REASON is not on the student
   at all — it lives on their cancellation record, which is why it is looked up
   by studentId here rather than read off a field that does not exist.
   ════════════════════════════════════════════════════════════════════════════ */

let formerFilter = {
  search: '', month: 'All', reason: 'All', room: 'All', dues: 'All',
  page: 1, pageSize: 30, sortKey: 'left', sortDir: 'desc',
};

/* A fresh visit starts here. Unlike every other register on this page's rail,
   the month does NOT default to this month: a hostel's departures are a thin
   trickle, and opening on "September 2026" would show an empty table for most
   of any month. The question this page answers is about the whole history. */
registerFilter('former', formerFilter, () => ({
  search: '', month: 'All', reason: 'All', room: 'All', dues: 'All',
  page: 1, sortKey: 'left', sortDir: 'desc',
}));

/** Every student who has left, newest departure first. */
function _formerAll() {
  return (DB.students || []).filter(s => s && s.status === 'Left');
}

/** The cancellation record behind a departure — where the reason lives. */
function _formerCanc(id) {
  const mine = (DB.cancellations || [])
    .filter(c => c && String(c.studentId) === String(id))
    .sort((a, b) => String(b.requestDate || '').localeCompare(String(a.requestDate || '')));
  return mine[0] || null;
}

function _formerReason(s) {
  const c = _formerCanc(s.id);
  return (c && c.reason) ? String(c.reason) : '';
}

function _formerRoom(s) {
  return String(s.lastRoom || s.roomNumber || '');
}

/* WHAT THEY LEFT BEHIND, THROUGH THE §14 LAYER. `outstandingOf` is the one
   answer to "what is owed" in this app — see finance.js — so this page cannot
   disagree with the student panel or with Payments about the same student. */
function _formerMoney(s) {
  const mine = (DB.payments || []).filter(p => String(p.studentId) === String(s.id));
  const paid = mine.reduce((n, p) => n + Number(p.amount || 0), 0);
  const owed = mine.reduce((n, p) => n + outstandingOf(p), 0);
  return { paid, owed, records: mine.length };
}

function formerFiltered() {
  const q = formerFilter.search.trim().toLowerCase();
  let list = _formerAll().filter(s => {
    if (formerFilter.month !== 'All' && String(s.leftDate || '').slice(0, 7) !== formerFilter.month) return false;
    if (formerFilter.reason !== 'All' && _formerReason(s) !== formerFilter.reason) return false;
    if (formerFilter.room !== 'All' && _formerRoom(s) !== formerFilter.room) return false;
    if (formerFilter.dues === 'Owing' && _formerMoney(s).owed <= 0) return false;
    if (formerFilter.dues === 'Clear' && _formerMoney(s).owed > 0) return false;
    if (!q) return true;
    return [s.name, s.id, s.phone, s.cnic, s.email, s.fatherName, s.occupation,
            s.address, _formerRoom(s), _formerReason(s)]
      .some(v => v && String(v).toLowerCase().includes(q));
  });

  const key = {
    name:  s => String(s.name || '').toLowerCase(),
    left:  s => String(s.leftDate || ''),
    room:  s => _formerRoom(s),
    dues:  s => _formerMoney(s).owed,
  }[formerFilter.sortKey] || (s => String(s.leftDate || ''));
  const dir = formerFilter.sortDir === 'asc' ? 1 : -1;
  list = list.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
  });
  return list;
}

function renderFormerStudents() {
  const all = _formerAll();

  /* THE FOUR FIGURES THE REFERENCE DRAWS, each from the table it belongs to.

     "Returned students — re-admitted this year" counts `restoredAt`, which the
     restore flow stamps; a hostel that has never restored anybody reads 0,
     which is the truth rather than a blank card. */
  const roomsFree = (DB.rooms || []).filter(r => roomFreeBeds(r) > 0).length;
  const returned  = (DB.students || []).filter(s =>
    s && s.restoredAt && String(s.restoredAt).slice(0, 4) === thisYear()).length;
  const owingList = all.filter(s => _formerMoney(s).owed > 0);
  const owingSum  = owingList.reduce((n, s) => n + _formerMoney(s).owed, 0);

  const months = [...new Set(all.map(s => String(s.leftDate || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const reasons = [...new Set(all.map(_formerReason).filter(Boolean))].sort();
  const rooms   = [...new Set(all.map(_formerRoom).filter(Boolean))].sort(cmpRoomNo);

  const list = formerFiltered();
  const _pg = paginate(list, formerFilter);
  const nActive = [formerFilter.month !== 'All', formerFilter.reason !== 'All',
                   formerFilter.room !== 'All', formerFilter.dues !== 'All'].filter(Boolean).length;

  const card = (hue, label, value, sub, svg, onclick) => `
    <div class="lk-stat ${hue}${onclick ? ' lk-stat--click' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
      <div class="lk-stat__top">
        <div class="lk-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></div>
        <div class="lk-stat__label">${label}</div>
      </div>
      <div class="lk-stat__val">${value}</div>
      <div class="lk-stat__sub">${sub}</div>
    </div>`;

  const th = (key, label, extra) => {
    const on = formerFilter.sortKey === key;
    const arw = on ? (formerFilter.sortDir === 'asc' ? '▲' : '▼') : '⇅';
    return `<th class="is-sortable${on ? ' is-sorted' : ''}" ${extra || ''}
      onclick="toggleSort(formerFilter,'former','${key}')" title="Sort by ${label}">${label}<span class="arw">${arw}</span></th>`;
  };

  const mkRow = (s) => {
    const m = _formerMoney(s);
    const reason = _formerReason(s);
    const room = _formerRoom(s);
    return `<tr>
      <td>
        <div class="lk-who dh-violet">
          <div class="lk-who__av">${escHtml(_fmInitials(s.name))}</div>
          <div style="min-width:0">
            <div class="lk-who__n">${escHtml(s.name || '—')}</div>
            <div class="lk-who__id">ID: #${escHtml(String(s.id))}</div>
          </div>
        </div>
      </td>
      <td>
        ${s.phone ? `<div class="fm-c">${icon('phone','xs')}${escHtml(s.phone)}</div>` : ''}
        ${s.email ? `<div class="fm-c fm-c--2">${icon('mail','xs')}${escHtml(s.email)}</div>` : ''}
        ${!s.phone && !s.email ? '<span class="lk-dash">—</span>' : ''}
      </td>
      <td class="fm-occ">${s.occupation ? escHtml(s.occupation) : '<span class="lk-dash">—</span>'}</td>
      <td>${room ? roomLabel(room, (DB.rooms.find(r => String(r.number) === room) || {}).floor)
                 : '<span class="lk-dash">—</span>'}</td>
      <td><div class="lk-when">${icon('calendar','xs')}${s.leftDate ? escHtml(fmtDate(s.leftDate)) : '—'}</div></td>
      <td class="fm-reason">${reason ? escHtml(reason) : '<span class="lk-dash">—</span>'}</td>
      ${''/* PAID ON TOP, WHAT IS STILL OWED UNDER IT. The reference draws one
             figure and a chip; the figure it draws is the money that came in,
             and the chip is about the money that did not. Both are named,
             because "PKR 2,000 / All Clear" beside "PKR 1,500 / Pending" reads
             as two of the same thing until you know which is which. */}
      <td>
        <div class="fm-money">${escHtml(fmtPKR(m.paid))}</div>
        ${m.owed > 0
          ? `<span class="lk-chip dh-red" title="${escHtml(fmtPKR(m.owed))} still owed across ${m.records} record${m.records === 1 ? '' : 's'}">${escHtml(fmtPKR(m.owed))} due</span>`
          : m.records
            ? '<span class="lk-chip dh-green">All clear</span>'
            : '<span class="lk-chip dh-slate">No records</span>'}
      </td>
      <td>
        <span class="lk-chip dh-slate"><i class="fm-dot"></i>Left</span>
        ${s.leftDate ? `<div class="lk-statdate">Left ${escHtml(fmtDateShort(s.leftDate))}</div>` : ''}
      </td>
      <td>
        <div class="lk-acts lk-acts--widget">
          <button class="lk-act lk-act--hue dh-green" onclick="openRestoreStudentForm('${escHtml(String(s.id))}')"
                  title="Re-admit this student — their details are pre-filled">
            ${icon('refreshCw','xs')}Restore</button>
          ${lkKebab("event.stopPropagation();formerRowMenu('" + escHtml(String(s.id)) + "',this)", 'Actions for this former student')}
        </div>
      </td>
    </tr>`;
  };

  return `
  <div class="lk-stats">
    ${card('dh-violet', 'Former Students', String(all.length),
        all.length ? 'Students who have left' : 'Nobody has left yet',
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>')}
    ${card('dh-green', 'Rooms Available', String(roomsFree), 'Rooms with a free bed',
        '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
        "navigate('rooms')")}
    ${card('dh-blue', 'Returned Students', String(returned), 'Re-admitted in ' + thisYear(),
        '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>')}
    ${card('dh-red', 'Pending Dues', String(owingList.length),
        owingSum > 0 ? fmtPKR(owingSum) + ' still owed' : 'Nothing outstanding',
        '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
        "formerFilter.dues='Owing';formerFilter.page=1;renderPage('former')")}
  </div>

  <div class="lk-panel">
    <div class="lk-tools">
      <div class="lk-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        <input id="search-former" class="lk-sin" placeholder="Search by name, ID, CNIC, father, phone, occupation, reason or former room…"
          value="${escHtml(formerFilter.search)}"
          oninput="capFirstChar(this);formerFilter.search=this.value;formerFilter.page=1;_dFormer()">
        ${lkSearchX('search-former','formerFilter','former')}
      </div>

      <select class="lk-select${formerFilter.month !== 'All' ? ' is-set' : ''}"
              onchange="formerFilter.month=this.value;formerFilter.page=1;renderPage('former')" title="Filter by the month they left">
        <option value="All">All months</option>
        ${months.map(m => `<option value="${escHtml(m)}" ${formerFilter.month === m ? 'selected' : ''}>${escHtml(monthLabel(m))}</option>`).join('')}
      </select>

      <select class="lk-select${formerFilter.reason !== 'All' ? ' is-set' : ''}"
              onchange="formerFilter.reason=this.value;formerFilter.page=1;renderPage('former')" title="Filter by why they left">
        <option value="All">All reasons</option>
        ${reasons.map(r => `<option value="${escHtml(r)}" ${formerFilter.reason === r ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}
      </select>

      <select class="lk-select${formerFilter.room !== 'All' ? ' is-set' : ''}"
              onchange="formerFilter.room=this.value;formerFilter.page=1;renderPage('former')" title="Filter by the room they had">
        <option value="All">All rooms</option>
        ${rooms.map(r => `<option value="${escHtml(r)}" ${formerFilter.room === r ? 'selected' : ''}>Room #${escHtml(r)}</option>`).join('')}
      </select>

      <select class="lk-select${formerFilter.dues !== 'All' ? ' is-set' : ''}"
              onchange="formerFilter.dues=this.value;formerFilter.page=1;renderPage('former')" title="Filter by what they still owe">
        <option value="All">All balances</option>
        <option value="Owing" ${formerFilter.dues === 'Owing' ? 'selected' : ''}>Still owing</option>
        <option value="Clear" ${formerFilter.dues === 'Clear' ? 'selected' : ''}>All clear</option>
      </select>

      <div class="lk-tools__end">
        ${nActive ? `<button class="lk-btn" onclick="tbClearAll('former')" title="Clear every filter on this page">${icon('refreshCw','xs')} Reset (${nActive})</button>` : ''}
        ${tbExport({ id:'former-export', excel:'exportFormerExcel()', pdf:'exportFormerPDF()' })}
      </div>
    </div>

    <div class="lk-head">
      <span class="lk-head__t">${icon('list','sm')} Former students</span>
      <span class="lk-head__n">${_pg.total} record${_pg.total === 1 ? '' : 's'}</span>
    </div>

    <div class="lk-table-wrap">
      <table class="lk-table">
        <thead><tr>
          ${th('name','Student')}
          <th>Contact</th>
          <th>Occupation</th>
          ${th('room','Former room')}
          ${th('left','Date left')}
          <th class="fm-reason">Reason</th>
          ${th('dues','Payment summary')}
          <th>Status</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>
          ${_pg.total === 0
            ? `<tr><td colspan="9"><div class="lk-empty">
                 ${icon('users','lg')}
                 <div class="lk-empty__t">${all.length ? 'No former student matches these filters' : 'Nobody has left yet'}</div>
                 <div class="lk-empty__s">${all.length
                    ? 'Clear a filter to widen the search.'
                    : 'A student appears here once their cancellation is confirmed.'}</div>
               </div></td></tr>`
            : _pg.slice.map(mkRow).join('')}
        </tbody>
      </table>
    </div>

    ${formerPager(_pg)}
  </div>`;
}

function _fmInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Re-render the table without losing what is being typed into the search. */
function _dFormer() { renderPage('former'); }

function formerRowMenu(id, btn) {
  const s = (DB.students || []).find(x => String(x.id) === String(id));
  if (!s) return;
  const S = {
    person:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>',
    wa:      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24Z"/></svg>',
  };
  const items = [
    { label: 'Open student record', svg: S.person,  on: "showStudentPanel('" + escHtml(String(s.id)) + "')" },
    { label: 'Re-admit student',    svg: S.restore, on: "openRestoreStudentForm('" + escHtml(String(s.id)) + "')" },
  ];
  /* Only when there is a number to send to. A menu item that opens WhatsApp
     with nobody in it is a dead control, and a former student who still owes
     money is exactly who a warden wants to message. */
  if (s.phone) items.push({ label: 'Message on WhatsApp', svg: S.wa,
                            on: "waRemindStudent('" + escHtml(String(s.id)) + "')" });
  lkRowMenu(btn, items);
}

/* The pager, in the shape every other register on this rail draws. There is no
   shared one — cancellations, payments and complaints each write their own, and
   copying the fourth is cheaper than a fifth abstraction over four call sites
   that differ only in which page name they re-render. */
function formerPager(pg) {
  const btn = (label, target, o) => {
    o = o || {};
    if (o.disabled) return '<button disabled>' + label + '</button>';
    if (o.active)   return '<button class="is-on">' + label + '</button>';
    return '<button onclick="gotoPage(formerFilter,\'former\',' + target + ')">' + label + '</button>';
  };
  const page = pg.page, pages = pg.pages;
  let lo = Math.max(1, page - 2), hi = Math.min(pages, lo + 4);
  lo = Math.max(1, hi - 4);
  let nums = '';
  if (lo > 1) nums += btn('1', 1) + (lo > 2 ? '<span class="lk-pager__gap">…</span>' : '');
  for (let i = lo; i <= hi; i++) nums += btn(String(i), i, { active: i === page });
  if (hi < pages) nums += (hi < pages - 1 ? '<span class="lk-pager__gap">…</span>' : '') + btn(String(pages), pages);

  return '<div class="lk-foot">' +
    '<div class="lk-foot__size">Show ' +
      '<select onchange="formerFilter.pageSize=Number(this.value);formerFilter.page=1;renderPage(\'former\')">' +
        [10, 30, 50, 100].map(n =>
          '<option value="' + n + '" ' + (formerFilter.pageSize === n ? 'selected' : '') + '>' + n + '</option>').join('') +
      '</select> entries</div>' +
    '<div class="lk-foot__info">Showing ' + pg.from + ' to ' + pg.to + ' of ' + pg.total +
      ' record' + (pg.total !== 1 ? 's' : '') + '</div>' +
    '<div class="lk-pager">' +
      btn('«', 1, { disabled: page <= 1 }) +
      btn('‹', page - 1, { disabled: page <= 1 }) +
      nums +
      btn('›', page + 1, { disabled: page >= pages }) +
      btn('»', pages, { disabled: page >= pages }) +
    '</div></div>';
}

/* ── Export ─────────────────────────────────────────────────────────────────
   Same engine, same shape as every other register: the file states its own
   scope, because a list of four departures is either a quiet quarter or a
   filtered view of a busy one and only the export can say which. */
function _formerExportDef() {
  const list = formerFiltered();
  const owed = list.reduce((n, s) => n + _formerMoney(s).owed, 0);
  const paid = list.reduce((n, s) => n + _formerMoney(s).paid, 0);

  return {
    module: 'Former Students',
    title:  'Former Students',
    scope:  formerFilter.month !== 'All' ? monthLabel(formerFilter.month) : 'All time',
    sheet:  'Former Students',
    filters: [
      ['Month left', formerFilter.month  !== 'All' ? monthLabel(formerFilter.month) : null],
      ['Reason',     formerFilter.reason !== 'All' ? formerFilter.reason : null],
      ['Former room',formerFilter.room   !== 'All' ? '#' + formerFilter.room : null],
      ['Balance',    formerFilter.dues   !== 'All' ? (formerFilter.dues === 'Owing' ? 'Still owing' : 'All clear') : null],
      ['Search',     formerFilter.search || null],
    ],
    summary: [
      { label: 'Former students', value: String(list.length) },
      { label: 'Collected',       value: EXPORT.fmt.money(paid), tone: 'pos' },
      { label: 'Still owed',      value: EXPORT.fmt.money(owed), tone: owed > 0 ? 'neg' : '' },
      { label: 'Owing',           value: String(list.filter(s => _formerMoney(s).owed > 0).length) },
    ],
    columns: [
      { label: 'Student', type: 'text', width: 22,
        value: s => s.name || '',
        get:   s => '<b>' + escHtml(s.name || '') + '</b>',
        sub:   s => s.fatherName ? s.fatherName : '' },
      { label: 'ID',        type: 'id',   width: 9,  value: s => '#' + String(s.id) },
      { label: 'Phone',     type: 'text', width: 14, value: s => s.phone || '' },
      { label: 'CNIC',      type: 'text', width: 16, pdf: false, value: s => s.cnic || '' },
      { label: 'Email',     type: 'text', width: 20, pdf: false, value: s => s.email || '' },
      { label: 'Occupation',type: 'text', width: 16, value: s => s.occupation || '' },
      { label: 'Former room', type: 'id', width: 11, value: s => _formerRoom(s) ? '#' + _formerRoom(s) : '' },
      { label: 'Date left', type: 'date', width: 13, value: s => s.leftDate || '' },
      { label: 'Reason',    type: 'wrap', width: 22, value: s => _formerReason(s) },
      { label: 'Collected', type: 'money', width: 13, total: 'sum', value: s => _formerMoney(s).paid },
      { label: 'Still owed',type: 'money', width: 13, total: 'sum',
        value: s => _formerMoney(s).owed,
        get:   s => { const o = _formerMoney(s).owed;
          return o > 0 ? '<span class="neg">' + fmtPKR(o) + '</span>' : '—'; } },
    ],
    rows: list,
    grand: { label: 'Still owed by these students', value: fmtPKR(owed) },
    empty: 'No former students match the selected filters.',
  };
}

function exportFormerPDF()   { EXPORT.pdf(_formerExportDef()); }
function exportFormerExcel() { EXPORT.excel(_formerExportDef()); }
