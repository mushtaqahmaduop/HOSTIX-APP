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

/* The sort arrows, as SVG rather than the ▲ ▼ ⇅ glyphs the header used to
   print: those three render at different weights in different fonts and the
   ⇅ is missing from several, so an unsorted column showed a tofu box. */
const FM_SORT = {
  asc:  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
  desc: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
  none: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>',
};

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

  /* A tile that only states a figure is a <div>; a tile that SETS A FILTER is a
     <button>, so it can be tabbed to and says which one is active through
     aria-pressed. The hue argument is gone with `.lk-stat`: colour is state, and
     "how many students have left" is not a state. */
  const card = (label, value, sub, svg, onclick, on) => {
    const body = `
      <span class="ui-stat__ico"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></span>
      <span class="ui-stat__body">
        <span class="ui-stat__l">${label}</span>
        <span class="ui-stat__v">${value}</span>
        <span class="ui-stat__s">${sub}</span>
      </span>`;
    return onclick
      ? `<button type="button" class="ui-card ui-stat ui-stat--click${on ? ' is-on' : ''}" onclick="${onclick}" aria-pressed="${on ? 'true' : 'false'}">${body}</button>`
      : `<div class="ui-card ui-stat">${body}</div>`;
  };

  /* The sort control is a BUTTON inside the th, and the direction is `aria-sort`
     on the cell. It was an onclick on the th itself with a text arrow glyph:
     a th cannot be focused or pressed with a keyboard, so the whole register
     was unsortable without a mouse. */
  const th = (key, label, extra) => {
    const on  = formerFilter.sortKey === key;
    const dir = on ? (formerFilter.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    const ico = on ? (formerFilter.sortDir === 'asc' ? FM_SORT.asc : FM_SORT.desc) : FM_SORT.none;
    return `<th aria-sort="${dir}" ${extra || ''}>`
         + `<button type="button" class="ui-th-sort" onclick="toggleSort(formerFilter,'former','${key}')" title="Sort by ${label}">`
         + `<span>${label}</span>${ico}</button></th>`;
  };

  const mkRow = (s) => {
    const m = _formerMoney(s);
    const reason = _formerReason(s);
    const room = _formerRoom(s);
    return `<tr>
      <td>
        <div class="fm-who">
          <span class="ui-avatar">${escHtml(_fmInitials(s.name))}</span>
          <div class="fm-who__b">
            <div class="fm-who__n">${escHtml(s.name || '—')}</div>
            <div class="fm-who__id">ID: #${escHtml(String(s.id))}</div>
          </div>
        </div>
      </td>
      <td>
        ${s.phone ? `<div class="fm-c">${icon('phone','xs')}${escHtml(s.phone)}</div>` : ''}
        ${s.email ? `<div class="fm-c fm-c--2">${icon('mail','xs')}${escHtml(s.email)}</div>` : ''}
        ${!s.phone && !s.email ? '<span class="fm-dash">—</span>' : ''}
      </td>
      <td class="fm-occ">${s.occupation ? escHtml(s.occupation) : '<span class="fm-dash">—</span>'}</td>
      <td>${room ? roomLabel(room, (DB.rooms.find(r => String(r.number) === room) || {}).floor, true)
                 : '<span class="fm-dash">—</span>'}</td>
      <td><div class="fm-when">${icon('calendar','xs')}${s.leftDate ? escHtml(fmtDate(s.leftDate)) : '—'}</div></td>
      <td class="fm-reason">${reason ? escHtml(reason) : '<span class="fm-dash">—</span>'}</td>
      ${''/* PAID ON TOP, WHAT IS STILL OWED UNDER IT. The reference draws one
             figure and a chip; the figure it draws is the money that came in,
             and the chip is about the money that did not. Both are named,
             because "PKR 2,000 / All Clear" beside "PKR 1,500 / Pending" reads
             as two of the same thing until you know which is which. */}
      <td>
        <div class="fm-money">${escHtml(fmtPKR(m.paid))}</div>
        ${m.owed > 0
          ? `<span class="ui-chip ui-chip--danger" title="${escHtml(fmtPKR(m.owed))} still owed across ${m.records} record${m.records === 1 ? '' : 's'}">${escHtml(fmtPKR(m.owed))} due</span>`
          : m.records
            ? '<span class="ui-chip ui-chip--success">All clear</span>'
            : '<span class="ui-chip ui-chip--neutral">No records</span>'}
      </td>
      <td>
        ${''/* The dot was a hand-drawn `<i class="fm-dot">`, coloured off a hue
               class. A chip role already carries its own colour, so the dot was
               a second mark saying the same thing. */}
        <span class="ui-chip ui-chip--neutral">Left</span>
        ${s.leftDate ? `<div class="fm-statdate">Left ${escHtml(fmtDateShort(s.leftDate))}</div>` : ''}
      </td>
      <td>
        <div class="fm-acts">
          ${''/* Restore was `.lk-act--hue dh-green` — a green action button. Green
                 is a STATUS role here, not an action one, and this is the only
                 thing a warden does from the row, so it is the secondary button
                 every other register uses for the same job. */}
          <button class="ui-btn ui-btn--secondary ui-btn--sm" onclick="openRestoreStudentForm('${escHtml(String(s.id))}')"
                  title="Re-admit this student — their details are pre-filled">
            ${icon('refreshCw','xs')}Restore</button>
          ${lkKebab("event.stopPropagation();formerRowMenu('" + escHtml(String(s.id)) + "',this)", 'Actions for this former student', 'ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm')}
        </div>
      </td>
    </tr>`;
  };

  return `
  <div class="ui-stats">
    ${card('Former students', String(all.length),
        all.length ? 'Students who have left' : 'Nobody has left yet',
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>')}
    ${card('Rooms available', String(roomsFree), 'Rooms with a free bed',
        '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
        "navigate('rooms')")}
    ${card('Returned students', String(returned), 'Re-admitted in ' + thisYear(),
        '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>')}
    ${''/* This one is a FILTER, so it reports whether it is the active one —
           clicking it again clears it, the way the payments status tiles do. */}
    ${card('Pending dues', String(owingList.length),
        owingSum > 0 ? fmtPKR(owingSum) + ' still owed' : 'Nothing outstanding',
        '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
        "formerToggleOwing()", formerFilter.dues === 'Owing')}
  </div>

  <div class="ui-card ui-card--flush">
    <div class="fm-tools">
      <div class="ui-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        <input id="search-former" class="ui-search__i" aria-label="Search former students"
          placeholder="Search by name, ID, CNIC, father, phone, occupation, reason or former room…"
          value="${escHtml(formerFilter.search)}"
          oninput="capFirstChar(this);formerFilter.search=this.value;formerFilter.page=1;_dFormer()">
        ${lkSearchX('search-former','formerFilter','former')}
      </div>

      <span class="ui-selectw"><select class="ui-select ui-select--sm${formerFilter.month !== 'All' ? ' is-set' : ''}" aria-label="Month left"
              onchange="formerFilter.month=this.value;formerFilter.page=1;renderPage('former')" title="Filter by the month they left">
        <option value="All">All months</option>
        ${months.map(m => `<option value="${escHtml(m)}" ${formerFilter.month === m ? 'selected' : ''}>${escHtml(monthLabel(m))}</option>`).join('')}
      </select></span>

      <span class="ui-selectw"><select class="ui-select ui-select--sm${formerFilter.reason !== 'All' ? ' is-set' : ''}" aria-label="Reason"
              onchange="formerFilter.reason=this.value;formerFilter.page=1;renderPage('former')" title="Filter by why they left">
        <option value="All">All reasons</option>
        ${reasons.map(r => `<option value="${escHtml(r)}" ${formerFilter.reason === r ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}
      </select></span>

      <span class="ui-selectw"><select class="ui-select ui-select--sm${formerFilter.room !== 'All' ? ' is-set' : ''}" aria-label="Former room"
              onchange="formerFilter.room=this.value;formerFilter.page=1;renderPage('former')" title="Filter by the room they had">
        <option value="All">All rooms</option>
        ${/* The floor rides with the number (owner, 2026-09-10) — the VALUE is
              still the bare number the filter matches on; only the label
              gains it, so an existing saved filter keeps working. */''}
        ${rooms.map(r => `<option value="${escHtml(r)}" ${formerFilter.room === r ? 'selected' : ''}>Room ${escHtml(roomText(r, ((DB.rooms||[]).find(x => String(x.number) === String(r)) || {}).floor))}</option>`).join('')}
      </select></span>

      <span class="ui-selectw"><select class="ui-select ui-select--sm${formerFilter.dues !== 'All' ? ' is-set' : ''}" aria-label="Balance"
              onchange="formerFilter.dues=this.value;formerFilter.page=1;renderPage('former')" title="Filter by what they still owe">
        <option value="All">All balances</option>
        <option value="Owing" ${formerFilter.dues === 'Owing' ? 'selected' : ''}>Still owing</option>
        <option value="Clear" ${formerFilter.dues === 'Clear' ? 'selected' : ''}>All clear</option>
      </select></span>

      <div class="fm-tools__end">
        ${nActive ? `<button class="ui-btn ui-btn--secondary ui-btn--sm" onclick="tbClearAll('former')" title="Clear every filter on this page">${icon('refreshCw','xs')} Reset <span class="ui-chip ui-chip--accent ui-chip--count">${nActive}</span></button>` : ''}
        ${tbExport({ id:'former-export', cls:'ui-btn ui-btn--secondary ui-btn--sm', excel:'exportFormerExcel()', pdf:'exportFormerPDF()' })}
      </div>
    </div>

    <div class="fm-head">
      <span class="fm-head__t">${icon('list','sm')} Former students</span>
      <span class="fm-head__n">${_pg.total} record${_pg.total === 1 ? '' : 's'}</span>
    </div>

    <div class="ui-table-wrap">
      <table class="ui-table">
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
            ? `<tr><td colspan="9"><div class="ui-empty">
                 ${icon('users','lg')}
                 <div class="ui-empty__t">${all.length ? 'No former student matches these filters' : 'Nobody has left yet'}</div>
                 <div>${all.length
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

/* The Pending Dues tile is a toggle, not a one-way filter: pressing it again
   clears it. A tile that can only ever be switched ON leaves a warden with no
   way back to the whole list except the Reset button, which is at the other end
   of the toolbar. Payments' status tiles behave this way already. */
function formerToggleOwing() {
  formerFilter.dues = (formerFilter.dues === 'Owing') ? 'All' : 'Owing';
  formerFilter.page = 1;
  renderPage('former');
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
    const C = 'ui-btn ui-btn--secondary ui-btn--sm';
    const aria = o.aria || label;
    if (o.disabled) return `<button class="${C}" disabled aria-label="${aria}">${label}</button>`;
    if (o.active)   return `<button class="${C} is-on" aria-current="page">${label}</button>`;
    return `<button class="${C}" onclick="gotoPage(formerFilter,'former',${target})" aria-label="${aria}">${label}</button>`;
  };
  const page = pg.page, pages = pg.pages;
  let lo = Math.max(1, page - 2), hi = Math.min(pages, lo + 4);
  lo = Math.max(1, hi - 4);
  let nums = '';
  if (lo > 1) nums += btn('1', 1, { aria: 'Page 1' }) + (lo > 2 ? '<span class="ui-pager__gap">…</span>' : '');
  for (let i = lo; i <= hi; i++) nums += btn(String(i), i, { active: i === page, aria: 'Page ' + i });
  if (hi < pages) nums += (hi < pages - 1 ? '<span class="ui-pager__gap">…</span>' : '') + btn(String(pages), pages, { aria: 'Page ' + pages });

  /* The shared bar, in the order every rebuilt register draws it: the sentence,
     the page size, then the pager. The « and » jump buttons are gone — the
     numbered buttons already reach the first and last page, and four arrow
     glyphs beside five numbers made the widest part of a footer whose whole job
     is to stay quiet. */
  return `<div class="ui-pagebar">
    <div class="ui-pagebar__info">${pg.total
      ? `Showing ${pg.from}–${pg.to} of ${pg.total} record${pg.total !== 1 ? 's' : ''}`
      : 'No records'}</div>
    <div class="fm-foot__size">
      <span>Rows per page</span>
      <span class="ui-selectw">
        <select class="ui-select ui-select--sm" aria-label="Rows per page"
                onchange="formerFilter.pageSize=Number(this.value);formerFilter.page=1;renderPage('former')">
          ${[10, 30, 50, 100].map(n => `<option value="${n}" ${formerFilter.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </span>
    </div>
    <div class="ui-pager">
      ${btn('‹', page - 1, { disabled: page <= 1, aria: 'Previous page' })}
      ${nums}
      ${btn('›', page + 1, { disabled: page >= pages, aria: 'Next page' })}
    </div>
  </div>`;
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
      // Masked, like every other exported CNIC (owner, 2026-09-10).
      { label: 'CNIC',      type: 'text', width: 16, pdf: false, value: s => maskCnic(s.cnic) },
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
