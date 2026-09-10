/* ─── HOSTYLLO — CANCELLATIONS MODULE ────────────────────────────────────────
   Contains: renderCancellations, showEditCancellationModal,
             submitEditCancellation, deleteCancellationRecord,
             showAddCancellationModal, cancStudentSearch, selectCancStudent,
             prefillCancStudentInfo, saveCancellation, confirmCancellation,
             submitCancellationSettlement, restoreFromCancellation,
             downloadCancellationReport
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── Cancellations v5 — toolbar state ────────────────────────────────────────
   Status is NOT read from nav.js. Its `cancFilter` looks like shared state but
   is a function-local `let` inside renderPage(), re-initialised to 'All' on
   every call — so anything here that read it always saw 'All' and silently
   dropped the status filter on the next toolbar change. The route argument is
   the authority, and renderCancellations mirrors it into `status` below so the
   toolbar can re-render into the same view. */
/* `room`, `from` and `to` were removed on 2026-09-08 with the controls that
   set them — see the toolbar. A filter with no control is one a warden cannot
   see and cannot clear. */
/* THE REASONS THE HOSTEL ACTUALLY USES — one list, both forms. It lived
   inside showEditCancellationModal(), so the Add form offered a free-text box
   and the Edit form a picker, and the same departure could be filed as
   "shifting to own house" and edited into "Shifting to own house". A record's
   own stored reason is always offered on top of this list, so a value typed
   before the list existed cannot vanish on save. */
/* CANC_DEFAULT_REASON is what a blank Add Cancellation form already says
   (owner, 2026-09-10: "add default cancellation reason: Student requested
   cancellation"). It is first in the list because it is the commonest exit a
   hostel files, and it is prefilled into the details box as well as selected
   in the picker — a warden who fills in nothing else still leaves a record
   that says why the seat was given up, which is the whole point of the field.
   Anything they type over it wins. */
const CANC_DEFAULT_REASON = 'Student requested cancellation';
const CANC_REASONS = [CANC_DEFAULT_REASON,
                      'Course completed', 'Shifting to own house', 'Going back to hometown',
                      'Transferred to another city', 'Financial reasons', 'Family reasons',
                      'Discipline', 'Other'];

let cancelFilter = { status:'All', search:'', type:'All',
                     month:thisMonth(), page:1, pageSize:30, sortKey:'room', sortDir:'asc' };
/* A fresh visit starts here. `month` is evaluated on every reset, not captured
   at load, so a session left open past the turn of a month still opens on the
   month it now is. See FILTER_REGISTRY in nav.js. */
registerFilter('cancellations', cancelFilter, () => ({
  status:'All', search:'', type:'All',
  month:thisMonth(), page:1, sortKey:'room', sortDir:'asc',
}));

/* ── WHICH MONTH A CANCELLATION BELONGS TO ───────────────────────────────────
   The month the student LEAVES, not the month the form was filled in. Here the
   two are routinely different: the house rule is that notice is given by the
   25th, so a request written on 20 July for a 31 August move-out is an August
   departure. Filing it under July is what made July's leavers keep turning up
   in August's list.

   requestDate is only a fallback for records written before vacateDate was
   captured; without it those rows would fall out of every month at once. */
function _cancMonthKey(c) {
  return _toMonthKey(c && c.vacateDate) || _toMonthKey(c && c.requestDate) || null;
}

/* '' matches everything, '2026' a whole year, '2026-08' one month — the same
   prefix convention _inPeriod() uses on the dashboard. */
function _cancInScope(c) {
  const scope = cancelFilter.month;
  if (!scope) return true;
  return String(_cancMonthKey(c) || '').startsWith(scope);
}

/* Every month the data actually touches, newest first, plus the current one so
   a hostel with no cancellations yet still has something to show. Each year
   gets a whole-year entry of its own: the scope is matched as a string prefix,
   so '2026' selects all of 2026 with no extra machinery. */
function _cancMonthOptions() {
  const months = new Set([thisMonth()]);
  (DB.cancellations || []).forEach(c => { const k = _cancMonthKey(c); if (k) months.add(k); });
  const years = new Set([...months].map(m => m.slice(0, 4)));
  return [...months, ...years].sort().reverse();
}

function _cancMonthLabel(key) {
  if (!key) return 'All months';
  if (/^\d{4}$/.test(key)) return 'All of ' + key;
  const d = new Date(key + '-01T00:00:00');
  return isNaN(d) ? key
    : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function canSetMonth(v) {
  cancelFilter.month = v;
  cancelFilter.page = 1;
  renderPage('cancellations_' + cancelFilter.status);
}

/* Display reference for a request.
   New records carry a persistent `seq` (assigned in saveCancellation). Records
   created before that fall back to their position in the list — which means
   deleting an older record renumbers the ones after it. That is why the number
   is persisted going forward rather than always derived. */
function _cancSeq(c, list) {
  const n = c.seq || (list.indexOf(c) + 1);
  return 'CAN-' + String(n).padStart(4, '0');
}
function _cancNextSeq() {
  return (DB.cancellations || []).reduce((m, c) => Math.max(m, Number(c.seq) || 0), 0) + 1;
}

/* Room types carry their own colour in settings — that is data, not styling, so
   the type chip uses it rather than a decorative hue. */
function _cancTypeColor(name) {
  const t = ((DB.settings && DB.settings.roomTypes) || []).find(x => x.name === name);
  return t && t.color ? t.color : '';
}

function _cancInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function renderCancellations(filterStatus='All') {
  cancelFilter.status = filterStatus;   // the route is the authority; mirror it
  const all  = DB.cancellations || [];
  // Everything below counts THIS MONTH's departures. Before this, the strip
  // counted the whole database, so a hostel two years in read "All Records
  // 214" on a page a warden opens to answer "who is going this month".
  const list = all.filter(_cancInScope);
  const pending = list.filter(c=>c.status==='Pending');
  const confirmed = list.filter(c=>c.status==='Confirmed');
  const restored = list.filter(c=>c.status==='Restored');
  const freed = list.filter(c=>c.status==='Pending'||c.status==='Confirmed');
  const byStatus = filterStatus==='All'?list:filterStatus==='Freed'?freed:list.filter(c=>c.status===filterStatus);

  // Toolbar narrowing, applied on top of the status the cards/route select.
  // Shared with the exports so a printed register cannot hold a different set
  // of departures from the page it was printed from.
  const q = cancelFilter.search.trim().toLowerCase();
  const filtered = cancellationsFiltered();
  const _pg = paginate(filtered, cancelFilter);

  const types    = [...new Set(list.map(c=>String(c.roomType||'')).filter(Boolean))].sort();
  const nActive  = [cancelFilter.type!=='All', cancelFilter.month!==thisMonth(), !!q]
                   .filter(Boolean).length;

  const SV = {
    // Pending is genuinely "act on me", Confirmed is settled, Restored reversed.
    // The sub-line states what the status DID, which is what a warden scanning
    // the column actually needs.
    Pending:   { hue:'dh-amber', sub:'Awaiting action',
                 svg:'<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>' },
    Confirmed: { hue:'dh-green', sub:'Student left',
                 svg:'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>' },
    Restored:  { hue:'dh-blue',  sub:'Back to active',
                 svg:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>' }
  };
  const calSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>';

  const mkRow = (c) => {
    const student = DB.students.find(s=>s.id===c.studentId);
    const st  = SV[c.status] || SV.Pending;
    const tc  = _cancTypeColor(c.roomType);
    // Pending can be confirmed or reversed; Confirmed can still be reversed;
    // Restored is terminal. Same rules the previous list enforced.
    /* ICONS ONLY, ONE ROW (owner, 2026-09-10: "the action button should only be
       svgs and in widget way to take less space").

       Four labelled buttons — Edit, Delete, Confirm, Restore — came to ~300px
       and wrapped onto a second line in a 13-column register, which made the
       row two lines tall for every pending departure on the page. As icons they
       are 4 x 28 plus gaps: 124px, one line, and the row height goes back to
       being set by the student cell.

       NOTHING IS UNLABELLED, which is the trade this has to survive. Each
       button keeps its full sentence on `title` and its own `aria-label`, and
       the two that change a student's life — Confirm marks them Left, Restore
       puts them back — keep their hue, which is what tells them apart at a
       glance in a row of grey. */
    const _ic = (hue, onclick, label, path) =>
      `<button class="lk-act lk-act--icon${hue ? ' lk-act--hue ' + hue : ''}" onclick="${onclick}"
               title="${escHtml(label)}" aria-label="${escHtml(label)}">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${path}</svg>
       </button>`;
    const acts = c.status==='Pending'
      ? _ic('dh-green', `confirmCancellation('${c.id}')`, 'Confirm — marks the student Left', '<polyline points="20 6 9 17 4 12"/>')
        + _ic('dh-blue', `restoreFromCancellation('${c.id}')`, 'Restore the student to Active', '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>')
      : c.status==='Confirmed'
        ? _ic('dh-blue', `restoreFromCancellation('${c.id}')`, 'Restore the student to Active', '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>')
        : '';
    return `<tr>
      <td>
        <div class="lk-who dh-violet">
          <div class="lk-who__av">${escHtml(_cancInitials(c.studentName))}</div>
          <div style="min-width:0">
            <div class="lk-who__n">${escHtml(c.studentName||'—')}</div>
            ${student&&student.phone?`<div class="lk-who__s">${escHtml(student.phone)}</div>`:''}
            <div class="lk-who__id">ID: ${_cancSeq(c, list)}</div>
          </div>
        </div>
      </td>
      ${''/* THE ROOM CELL CARRIES ITS OWN TYPE, as `cancellations.2.png`
             draws it — "#3 / 3-Seater". It used to have a column of its own,
             painted with the owner's per-type colour from Settings: a CATEGORY
             wearing a hue, three columns from a Status chip drawn out of the
             same palette. The column it vacates goes to the settlement, which
             is a fact about this cancellation rather than about the room. */}
      <td>
        ${roomLabel(c.roomNumber, (DB.rooms.find(r => String(r.number) === String(c.roomNumber)) || {}).floor)}
        ${c.roomType ? `<div class="lk-sub">${escHtml(c.roomType)}</div>` : ''}
      </td>
      <td>${cancSettleCell(c)}</td>
      <td><div class="lk-when">${calSvg}${fmtDate(c.requestDate)}</div></td>
      <td>${c.vacateDate
            ? `<div class="lk-when">${calSvg}${fmtDate(c.vacateDate)}</div>`
            : '<span class="lk-dash">End of month</span>'}</td>
      <td>
        <span class="lk-chip ${st.hue}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${st.svg}</svg>${escHtml(c.status)}</span>
        <div class="lk-sub">${st.sub}</div>
      </td>
      ${/* `lk-prose` keeps this one column flush left while every other value
            in the register centres (registers-center.css) — a reason is a
            sentence, and a centred sentence that wraps reads badly. */''}
      <td class="lk-prose" style="max-width:170px;white-space:normal">${c.reason?escHtml(c.reason):'<span class="lk-dash">—</span>'}</td>
      <td>
        <div class="lk-acts lk-acts--widget">
          ${_ic('', `showEditCancellationModal('${c.id}')`, 'Edit this record', '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>')}
          ${acts}
          ${_ic('dh-red', `deleteCancellationRecord('${c.id}')`, 'Delete this record', '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>')}
        </div>
      </td>
    </tr>`;
  };

  const card = (status, hue, label, sub, value, svg) => `
    <div class="lk-stat lk-stat--click ${hue}${filterStatus===status?' is-on':''}" onclick="renderPage('cancellations_${status}')" title="Show ${label.toLowerCase()}">
      <div class="lk-stat__top">
        <div class="lk-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></div>
        <div class="lk-stat__label">${label}</div>
      </div>
      <div class="lk-stat__val">${value}</div>
      <div class="lk-stat__sub">${filterStatus===status?'Showing these':sub}</div>
    </div>`;

  const th = (key,label) => {
    const on  = cancelFilter.sortKey===key;
    const arw = on ? (cancelFilter.sortDir==='asc'?'▲':'▼') : '⇅';
    return `<th class="is-sortable${on?' is-sorted':''}" onclick="toggleSort(cancelFilter,'cancellations_${filterStatus}','${key}')" title="Sort by ${label}">${label}<span class="arw">${arw}</span></th>`;
  };

  return `
  <!-- ══ STAT STRIP ══ -->
  <div class="lk-stats">
    ${/* THE NUMBER THAT MUST NOT SHRINK.
          It used to be four status counts and nothing else, so as wardens
          marked leavers Left the Pending card fell 20 -> 15 while the month's
          real answer was still 20. An owner asking "you said twenty are going
          this month" read 15 and concluded the warden was making it up. The
          headline is now the month's departures — Pending plus Confirmed —
          which only moves when a departure is added, cancelled or restored,
          never when one merely progresses from one status to the other. */''}
    ${card('Freed','dh-violet',cancelFilter.month?('Leaving '+(/^\d{4}$/.test(cancelFilter.month)?cancelFilter.month:_cancMonthLabel(cancelFilter.month).split(' ')[0])):'Leaving (all months)',
        'Still in + already left',freed.length,'<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>')}
    ${card('Pending','dh-amber','Still in hostel','Notice given, not gone yet',pending.length,'<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>')}
    ${card('Confirmed','dh-green','Already left','Seat is free',confirmed.length,'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>')}
    ${card('Restored','dh-blue','Restored','Notice withdrawn',restored.length,'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>')}
  </div>

  <!-- ══ FREED SEATS ══ -->
  <div class="lk-banner dh-violet${filterStatus==='Freed'?' is-on':''}" onclick="renderPage('cancellations_Freed')" title="Show everyone leaving — those still here and those already gone">
    <div class="lk-banner__l">
      <div class="lk-banner__chip"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M4 18v2"/><path d="M20 18v2"/><path d="M12 4v5"/></svg></div>
      <div>
        <div class="lk-banner__t">${freed.length} leaving in ${escHtml(_cancMonthLabel(cancelFilter.month))}</div>
        <div class="lk-banner__s">${confirmed.length} already left &middot; ${pending.length} still in the hostel, seat theirs until their vacate date</div>
      </div>
    </div>
    <div>
      <div class="lk-banner__v">${freed.length}</div>
      <div class="lk-banner__a">${filterStatus==='Freed'?'Showing these':'Click to filter'}</div>
    </div>
  </div>

  <!-- ══ TOOLBAR + TABLE ══ -->
  <div class="lk-panel">
    <div class="lk-tools">
      <div class="lk-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        <input id="canc-search" class="lk-sin" placeholder="Search student, room, reason, request ID…"
               value="${escHtml(cancelFilter.search)}" oninput="canSearch(this.value)">
        ${lkSearchX('canc-search','cancelFilter','cancellations')}
      </div>

      ${/* First control on the row on purpose: it governs every number above
            it, so it has to be the first thing read, not a filter tucked in
            among the room-type dropdowns. */''}
      <select class="lk-select${cancelFilter.month?' is-set':''}" onchange="canSetMonth(this.value)" title="Show one month only">
        <option value="" ${!cancelFilter.month?'selected':''}>All months</option>
        ${_cancMonthOptions().map(k=>`<option value="${escHtml(k)}" ${cancelFilter.month===k?'selected':''}>${escHtml(_cancMonthLabel(k))}</option>`).join('')}
      </select>

      <select class="lk-select${filterStatus!=='All'?' is-set':''}" onchange="renderPage('cancellations_'+this.value)" title="Filter by status">
        ${['All','Pending','Confirmed','Restored','Freed'].map(s=>
          `<option value="${s}" ${filterStatus===s?'selected':''}>${s==='All'?'All Status':s==='Freed'?'All Leaving':s}</option>`).join('')}
      </select>

      <select class="lk-select${cancelFilter.type!=='All'?' is-set':''}" onchange="canSet('type',this.value)" title="Filter by room type">
        <option value="All">All Types</option>
        ${types.map(t=>`<option value="${escHtml(t)}" ${cancelFilter.type===t?'selected':''}>${escHtml(t)}</option>`).join('')}
      </select>

      <div class="lk-tools__end">
        ${tbExport({ id:'canc-export', excel:'exportCancellationsExcel()',
                     pdf:'exportCancellationsPDF()' })}
      </div>
    </div>

    <div class="lk-head">
      <div class="lk-head__t">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
        ${filterStatus==='All'?'All Cancellations':filterStatus==='Freed'?'Freed Seats (Pending + Confirmed)':filterStatus+' Cancellations'}
      </div>
      <div class="lk-head__n">${_pg.total} record${_pg.total!==1?'s':''}</div>
    </div>

    ${_pg.total===0?`
      <div class="lk-empty">
        <div class="lk-empty__i"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg></div>
        <div class="lk-empty__t">${list.length===0?'No cancellations yet':nActive?'Nothing matches those filters':'No '+filterStatus.toLowerCase()+' cancellations'}</div>
        <div class="lk-empty__s">${list.length===0?'Cancellation requests will appear here once you add one.':nActive?'Try widening the search or date range.':'Nothing to action here.'}</div>
        ${list.length===0
          ? `<button class="lk-btn lk-btn--go" onclick="showAddCancellationModal()">+ Add Cancellation</button>`
          : nActive?`<button class="lk-btn" onclick="canClearFilters()">Clear filters</button>`:''}
      </div>`
    : `<div class="lk-table-wrap">
        <table class="lk-table">
          <thead><tr>
            ${th('student','Student')}${th('room','Room')}<th>Settlement</th>
            ${th('request','Request Date')}${th('vacate','Vacate By')}
            ${th('status','Status')}${th('reason','Reason')}
            <th>Actions</th>
          </tr></thead>
          <tbody>${_pg.slice.map(c=>mkRow(c)).join('')}</tbody>
        </table>
      </div>
      ${canPager(_pg, filterStatus)}`}
  </div>`;
}

/* ── Cancellations v5 — toolbar behaviour ────────────────────────────────── */
function canSet(key, val) {
  cancelFilter[key] = val;
  cancelFilter.page = 1;
  renderPage('cancellations_' + cancelFilter.status);
}
const canSearch = debounce(function (v) { canSet('search', v); }, 220);
/* Kept as a name because older call sites use it. The registry in nav.js is
   the one definition of what a cleared bar looks like, so this cannot drift
   from the Clear all button beside it. */
function canClearFilters() { tbClearAll('cancellations'); }
function canPager(pg, status) {
  const btn = (label, target, o) => {
    o = o || {};
    if (o.disabled) return `<button disabled>${label}</button>`;
    if (o.active)   return `<button class="is-on">${label}</button>`;
    return `<button onclick="gotoPage(cancelFilter,'cancellations_${status}',${target})">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1) + (lo>2?'<span class="lk-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page});
  if (hi < pages) nums += (hi<pages-1?'<span class="lk-pager__gap">…</span>':'') + btn(String(pages), pages);

  return `<div class="lk-foot">
    <div class="lk-foot__size">
      Show
      <select onchange="cancelFilter.pageSize=Number(this.value);cancelFilter.page=1;renderPage('cancellations_${status}')">
        ${[10,30,50,100].map(n=>`<option value="${n}" ${cancelFilter.pageSize===n?'selected':''}>${n}</option>`).join('')}
      </select>
      entries
    </div>
    <div class="lk-foot__info">Showing ${pg.from} to ${pg.to} of ${pg.total} record${pg.total!==1?'s':''}</div>
    <div class="lk-pager">
      ${btn('«',1,{disabled:page<=1})}
      ${btn('‹',page-1,{disabled:page<=1})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages})}
      ${btn('»',pages,{disabled:page>=pages})}
    </div>
  </div>`;
}

/* ── EDIT A CANCELLATION ─────────────────────────────────────────────────────
   Rebuilt 2026-09-09 to `add and edit cancellation.png`: a student card, the
   dues position, and three numbered sections.

   TWO DATES ARE EDITABLE NOW, not one (owner). Vacate By always was. REQUESTED
   ON was printed in a read-only strip at the bottom — and it is the date the
   register sorts and filters by, so a request entered on the wrong day could
   not be corrected without deleting the record and making it again. It is a
   field.

   THE REFUND IS SHOWN WHERE THE RECORD IS READ. confirmCancellation() settles
   a leaver and writes the outcome to `c.settlement`; until today nothing
   displayed it. Section 3 reads it back — what was billed, what was collected,
   what was refunded and by which method — and says plainly when a cancellation
   has not been settled yet.                                                  */
function showEditCancellationModal(cancId) {
  const c = (DB.cancellations || []).find(x => x.id === cancId);
  if (!c) return;
  const student = DB.students.find(s => s.id === c.studentId);
  const room = DB.rooms.find(r => r.id === c.roomId);
  const s = student ? calculateSettlement(c.studentId) : null;
  const due = s ? Number(s.outstanding || 0) : 0;

  const STATUS = [
    { k: 'Pending',   ico: 'clock', note: 'The seat is held until the vacate date.' },
    { k: 'Confirmed', ico: 'check', note: 'The student is marked as Left on the vacate date.' },
    { k: 'Restored',  ico: 'refreshCw', note: 'The student goes back to Active and keeps the seat.' },
  ];

  const REASONS = CANC_REASONS;
  const known = REASONS.indexOf(c.reason) !== -1;

  showModal('modal-md',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('edit', 'sm')}</div>
       <div><div class="hf-mh__t">Edit Cancellation Record</div>
       <div class="hf-mh__s">Update the details and save the changes.</div></div>
     </div>`,
    `<div class="cef">
      <div class="cef-who">
        <div class="cef-who__av">${escHtml(_cancInitials(c.studentName))}</div>
        <div style="min-width:0">
          <div class="cef-who__n">${escHtml(c.studentName || '—')}
            ${due > 0 ? `<span class="lk-chip dh-red">${icon('warning','xs')}Dues pending</span>` : ''}</div>
          ${/* Masked, revealed on hover — cnicHtml() (owner, 2026-09-10). */''}
          <div class="cef-who__s">ID: ${escHtml(String(c.studentId || '—'))}${student && student.cnic ? ' · CNIC: ' + cnicHtml(student.cnic) : ''}${student && student.phone ? ' · ' + escHtml(student.phone) : ''}</div>
        </div>
        <div class="cef-who__room">
          <div class="cef-who__rn">Room #${escHtml(String(c.roomNumber || '?'))}</div>
          <div class="cef-who__rt">${escHtml(c.roomType || '—')}${room && room.floor ? ' · ' + escHtml(room.floor) : ''}</div>
        </div>
      </div>

      ${due > 0 ? `
      <div class="cef-due">
        ${icon('warning', 'sm')}
        <div style="flex:1;min-width:0">
          <div class="cef-due__t">Outstanding dues: ${escHtml(fmtPKR(due))}</div>
          <div class="cef-due__s">This student has unpaid months or fines. The cancellation can still be recorded — the money is settled when it is confirmed.</div>
        </div>
        <button class="set-btn" onclick="closeModal();showStudentPanel('${escHtml(String(c.studentId))}')">View dues</button>
      </div>` : ''}

      <div class="hf-sec">
        <div class="hf-sec__h">
          <span class="hf-num">1</span>
          <span class="hf-sec__t">Cancellation status</span>
          <span class="hf-sec__s">Where this request stands, and when the seat is given up</span>
        </div>
        <div class="hf-g2">
          <div class="field"><label for="f-cstatus">Status<span class="req">*</span></label>
            <div class="hf-in"><span class="hf-in__i">${icon('info','sm')}</span>
            <select class="form-control" id="f-cstatus" onchange="cefStatusNote(this.value)">
              ${STATUS.map(o => `<option value="${o.k}" ${c.status === o.k ? 'selected' : ''}>${o.k}</option>`).join('')}
            </select></div>
            <div class="hi-note" id="cef-status-note">${escHtml((STATUS.find(o => o.k === c.status) || STATUS[0]).note)}</div>
          </div>
          <div class="field"><label for="f-cvacate">Vacate by date<span class="req">*</span></label>
            <div class="hf-in"><span class="hf-in__i">${icon('calendar','sm')}</span>
            <input class="form-control cdp-trigger" id="f-cvacate" type="text" readonly
                   onclick="showCustomDatePicker(this,event)" value="${escHtml(c.vacateDate || '')}"
                   placeholder="End of month"></div>
            <div class="hi-note">The day the seat is actually given up — it is the date the student is recorded as having left.</div>
          </div>
        </div>
      </div>

      <div class="hf-sec">
        <div class="hf-sec__h">
          <span class="hf-num">2</span>
          <span class="hf-sec__t">Reason &amp; notes</span>
          <span class="hf-sec__s">Why they are leaving</span>
        </div>
        <div class="field"><label for="f-creason-pick">Reason for cancellation</label>
          <div class="hf-in"><span class="hf-in__i">${icon('fileText','sm')}</span>
          <select class="form-control" id="f-creason-pick" onchange="cefPickReason(this.value)">
            <option value="">Select a reason…</option>
            ${REASONS.map(r => `<option ${known && c.reason === r ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label for="f-creason">Additional details</label>
          <div class="hf-in hf-in--top"><span class="hf-in__i">${icon('fileText','sm')}</span>
          <textarea class="form-control" id="f-creason" rows="3" maxlength="500"
                    placeholder="e.g. Shifting to own house, going back to hometown…"
                    oninput="cefCount()">${escHtml(c.reason || '')}</textarea></div>
          <div class="hi-note" id="cef-count">${String(c.reason || '').length}/500</div>
        </div>
      </div>

      <div class="hf-sec">
        <div class="hf-sec__h">
          <span class="hf-num">3</span>
          <span class="hf-sec__t">Record &amp; settlement</span>
          <span class="hf-sec__s">When it was raised, and what happened to the money</span>
        </div>
        <div class="hf-g2">
          <div class="field"><label for="f-crequest">Requested on</label>
            <div class="hf-in"><span class="hf-in__i">${icon('calendar','sm')}</span>
            <input class="form-control cdp-trigger" id="f-crequest" type="text" readonly
                   onclick="showCustomDatePicker(this,event)" value="${escHtml(c.requestDate || '')}"></div>
            <div class="hi-note">The register sorts and filters by this date, so it is editable — a request entered on the wrong day used to need deleting and remaking.</div>
          </div>
          <div class="field"><label>Record ID</label>
            <div class="hf-in is-readonly"><span class="hf-in__i">${icon('info','sm')}</span>
            <input class="form-control" readonly value="${escHtml(String(c.id))}"></div>
          </div>
        </div>
        ${c.settlement
          ? `<div class="cef-settle">
               <div class="cef-settle__h">${icon(c.settlement.action === 'refund' ? 'transfer' : 'card','xs')}
                 <b>${c.settlement.action === 'refund' ? 'Refunded at checkout'
                     : c.settlement.action === 'collect' ? 'Collected at checkout' : 'Nothing was owed'}</b></div>
               ${cancSettleLines(c)}
             </div>`
          : `<div class="cef-settle is-pending">${icon('info','xs')}<span>Not settled yet. Confirming this cancellation works out what is owed or owing and, where there is a credit, <b>refunds it</b> — the outcome is recorded here.</span></div>`}
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="deleteCancellationRecord('${cancId}')">${icon('trash','xs')} Delete</button>
     <button class="btn btn-primary" onclick="submitEditCancellation('${cancId}')">${icon('save','xs')} Save changes</button>`);
}

function cefStatusNote(v) {
  const N = {
    Pending: 'The seat is held until the vacate date.',
    Confirmed: 'The student is marked as Left on the vacate date.',
    Restored: 'The student goes back to Active and keeps the seat.',
  };
  const el = document.getElementById('cef-status-note');
  if (el) el.textContent = N[v] || '';
}

/* The picker fills the notes box rather than replacing it, so a reason chosen
   from the list and a sentence typed underneath can both survive. */
function cefPickReason(v) {
  if (!v) return;
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('f-creason'));
  if (!box) return;
  const cur = box.value.trim();
  box.value = cur && cur !== v ? v + ' — ' + cur : v;
  cefCount();
}

function cefCount() {
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('f-creason'));
  const out = document.getElementById('cef-count');
  if (box && out) out.textContent = box.value.length + '/500';
}

/* The room a student is leaving, read from the roster rather than from a field
   students do not have. `student.roomNumber` is only ever written by the
   restore flow, so for everyone who left the ordinary way lastRoom was set to
   '' — and the Former Students list, whose whole job is to say which room a
   past student had, showed nothing for any of them. */
function _cancRoomNumberOf(student) {
  if (!student) return '';
  const r = DB.rooms.find(x => x.id === student.roomId);
  return r ? String(r.number) : String(student.roomNumber || '');
}

async function submitEditCancellation(cancId) {
  const c = (DB.cancellations||[]).find(x=>x.id===cancId);
  if(!c) return;
  const newStatus = document.getElementById('f-cstatus').value;
  const oldStatus = c.status;
  c.vacateDate = document.getElementById('f-cvacate').value;
  /* THE REQUEST DATE IS A FIELD NOW (owner, 2026-09-09). It is what the
     register sorts and filters by, and it was read-only — so a request
     entered on the wrong day could only be corrected by deleting the record
     and making it again, which loses its id and its place in the sequence.
     An empty box keeps the stored date rather than blanking it. */
  const _req = (document.getElementById('f-crequest') || {}).value;
  if (_req) c.requestDate = _req;
  c.reason = document.getElementById('f-creason').value.trim();
  c.status = newStatus;
  // Update student status accordingly
  const student = DB.students.find(s=>s.id===c.studentId);
  if(student) {
    if(newStatus==='Confirmed') {
      student.status='Left';
      // The vacate date is when they actually go. Stamping today() meant a
      // cancellation processed on the 20th for a 31st move-out recorded the
      // student as having left eleven days before they did — and that is the
      // date every historical report reads afterwards.
      student.leftDate = c.vacateDate || today();
      student.lastRoom = _cancRoomNumberOf(student);
    }
    else if(newStatus==='Restored') student.status='Active';
    else if(newStatus==='Pending') student.status='Cancelling';
  }
  await saveDB(); closeModal();
  renderPage('cancellations_'+newStatus);
  toast('Cancellation record updated','success');
}

async function deleteCancellationRecord(cancId) {
  /* THE DELETE PERMISSION IS ENFORCED HERE, not only on students (owner,
     2026-09-10). `requirePerm('delete')` had exactly ONE call site in the
     whole renderer — confirmDeleteStudent — so an account created with the
     box unticked was stopped at the student register and nowhere else. */
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  const c = (DB.cancellations||[]).find(x=>x.id===cancId);
  if(!c) return;
  showConfirm('Delete Record','Are you sure you want to permanently delete this cancellation record? The student status will not be changed.',(async ()=>{
    DB.cancellations = (DB.cancellations||[]).filter(x=>x.id!==cancId);
    await saveDB(); closeModal(); renderPage('cancellations_All');
    toast('Record deleted','success');
  }));
}

/* THE ONLY WAY A CANCELLATION IS STARTED (owner, 2026-09-06: "the cancellation
   button should always open the cancellation form, not directly cancel the
   student").

   There used to be a second way in: quickCancelStudent() in students.js wrote a
   Pending cancellation the moment the button was pressed, with a hardcoded
   reason ("Student requested cancellation") and a vacate date of end-of-next-
   month, no form and no confirmation. Two problems, one visible and one not:

     · Putting a resident on notice is a decision with a DATE and a REASON in
       it. Both were invented, and the warden was never shown them, so the
       cancellations list filled up with records nobody had actually written.
     · The record it wrote was malformed. saveCancellation() stamps a `canc_`
       id and a `seq` (the stable CAN-#### the list is numbered by);
       quickCancelStudent wrote a bare uid() and no seq at all.

   `studentId` preselects a resident — that is what the panel and the profile
   pass — and the form is identical either way, so there is exactly one shape of
   cancellation record in the database. */
function showAddCancellationModal(studentId) {
  const activeStudents = DB.students.filter(s=>s.status==='Active');
  const alreadyCancelling = (DB.cancellations||[]).filter(c=>c.status==='Pending').map(c=>c.studentId);
  const available = activeStudents.filter(s=>!alreadyCancelling.includes(s.id));

  /* Say WHICH student cannot be cancelled and why. Opening an empty form for a
     warden who pressed Cancel Seat on one particular person, or telling them
     "no active students" when the one they picked is simply already on notice,
     is an answer to a question they did not ask. */
  if (studentId) {
    const one = DB.students.find(s => s.id === studentId);
    if (!one) { toast('Student not found', 'error'); return; }
    if (alreadyCancelling.includes(studentId)) {
      toast(`${one.name} is already on the cancellation list`, 'error'); return;
    }
    if (one.status !== 'Active') {
      toast(`${one.name} is ${String(one.status || '').toLowerCase()} — there is no seat to cancel`, 'error');
      return;
    }
  }

  if(available.length===0){
    toast('No active students available to cancel','error');
    return;
  }

  const endOfMonth = (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); d.setDate(0); return ymd(d); })();

  /* WHAT THIS STUDENT OWES, FROM THE SETTLEMENT AUTHORITY.
     The reference draws four boxes — Pending Fees / Fine / Other Dues / Total
     Due. Three of those four are not fields this app has: a payment carries
     `extraCharges` as free text ("Laundry, cooler, fines"), and a part payment
     is applied to the RECORD, not to a component of it, so splitting an
     outstanding balance into rent-versus-fine would be an invention dressed as
     arithmetic. These four are the decomposition calculateSettlement() can
     actually stand behind, and they reconcile: due is what the records still
     owe, credit is what was over-collected, and the closing line nets them.
     Using the same function the CONFIRM step uses is the point — the figure a
     warden reads when filing the request cannot disagree with the one they are
     asked to settle when they confirm it. */
  showModal('modal-md',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('doorOpen', 'sm')}</div>
       <div><div class="hf-mh__t">Add Cancellation Request</div>
       <div class="hf-mh__s">Mark a student&rsquo;s seat for cancellation.</div></div>
     </div>`,
    `<div class="caf-note">
      ${icon('info','sm')}
      <div>The student stays on the roster and <b>keeps their bed until the vacate date</b> &mdash; they are still billed for it, and the Rooms page marks the seat <b class="caf-note__v">vacating</b> so nobody books it twice. The bed frees when the cancellation is confirmed.</div>
    </div>

    <div id="canc-who"></div>
    <div id="canc-dues"></div>

    <div class="hf-sec">
      <div class="hf-sec__h">
        <span class="hf-num">1</span>
        <span class="hf-sec__t">Student &amp; room</span>
        <span class="hf-sec__s">Search and select the student, then confirm the room</span>
      </div>
      <div class="field"><label for="canc-search">Search student<span class="req">*</span></label>
        <div class="hf-in"><span class="hf-in__i">${icon('search','sm')}</span>
          <input class="form-control" id="canc-search" placeholder="Search by name, room #, student ID&hellip;"
            oninput="cancStudentSearch(this.value)"
            onfocus="cancStudentSearch(this.value)"
            onblur="setTimeout(()=>{const d=document.getElementById('canc-search-drop');if(d)d.style.display='none';},200)"
            autocomplete="off">
          <button type="button" class="caf-clear" title="Clear" aria-label="Clear the search"
            onclick="cafClearStudent()">${icon('close','xs')}</button>
        </div>
        <div id="canc-search-drop" class="caf-drop" style="display:none"></div>
        <input type="hidden" id="canc-student" value="">
      </div>
      <div class="field"><label for="canc-room-display">Room (auto-filled)</label>
        <div class="hf-in is-readonly"><span class="hf-in__i">${icon('bed','sm')}</span>
          <input id="canc-room-display" class="form-control" readonly placeholder="Select a student first"></div>
      </div>
    </div>

    <div class="hf-sec">
      <div class="hf-sec__h">
        <span class="hf-num">2</span>
        <span class="hf-sec__t">Cancellation details</span>
        <span class="hf-sec__s">The day the seat is given up, and why</span>
      </div>
      <div class="hf-g2">
        <div class="field"><label for="canc-vacate">Vacate by date<span class="req">*</span></label>
          <div class="hf-in"><span class="hf-in__i">${icon('calendar','sm')}</span>
            <input class="form-control cdp-trigger" id="canc-vacate" type="text" readonly
                   onclick="showCustomDatePicker(this,event)" value="${escHtml(endOfMonth)}"></div>
          <div class="hi-note">The day the seat is actually given up. Until then it is held and billed.</div>
        </div>
        <div class="field"><label for="canc-reason-pick">Reason for cancellation</label>
          <div class="hf-in"><span class="hf-in__i">${icon('fileText','sm')}</span>
            <select class="form-control" id="canc-reason-pick" onchange="cafPickReason(this.value)">
              <option value="">Select a reason&hellip;</option>
              ${CANC_REASONS.map(r => `<option ${r === CANC_DEFAULT_REASON ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}
            </select></div>
        </div>
      </div>
      <div class="field"><label for="canc-reason">Additional details</label>
        <div class="hf-in hf-in--top"><span class="hf-in__i">${icon('fileText','sm')}</span>
          ${''/* Prefilled, not just placeheld: the picker above is only a
                 shortcut, and it is THIS box that is saved. A default that
                 lived in the placeholder would look like an answer and save as
                 an empty reason. */}
          <textarea class="form-control" id="canc-reason" rows="3" maxlength="500"
                    placeholder="e.g. Shifting to own house, going back to hometown&hellip;"
                    oninput="cafCount()">${escHtml(CANC_DEFAULT_REASON)}</textarea></div>
        <div class="hi-note" id="caf-count">${CANC_DEFAULT_REASON.length}/500</div>
      </div>
    </div>`,
    `<div class="hf-actions">
       <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="saveCancellation()">${icon('save','xs')} Add to Cancellation List</button>
     </div>`
  );
  // pass available list to search fn
  window._cancAvailable = available;

  /* Preselected, but not pre-decided: the name, room and search box are filled
     and the warden still has to give the date and the reason and press the
     button. Nothing is written until saveCancellation(). */
  if (studentId) selectCancStudent(studentId);
}

function cancStudentSearch(query) {
  const drop = document.getElementById('canc-search-drop');
  if (!drop) return;
  const available = window._cancAvailable || [];
  const q = query.trim().toLowerCase();
  const matches = q
    ? available.filter(s => {
        const room = DB.rooms.find(r=>r.id===s.roomId);
        return s.name.toLowerCase().includes(q)
          || s.id.toLowerCase().includes(q)
          || (s.phone||'').includes(q)
          || String(room?room.number:'').toLowerCase().includes(q);
      })
    : available;
  if (!matches.length) {
    drop.innerHTML = '<div class="caf-opt__empty">No students found</div>';
    drop.style.display = 'block';
    return;
  }
  drop.innerHTML = matches.slice(0,12).map(s => {
    const room = DB.rooms.find(r=>r.id===s.roomId);
    const roomLabel = room ? `Rm #${room.number}` : 'No room';
    return `<div class="caf-opt" onclick="selectCancStudent('${escHtml(s.id)}')">
      <div class="caf-opt__av">${escHtml((s.name||'?')[0].toUpperCase())}</div>
      <div class="caf-opt__b">
        <div class="caf-opt__n">${escHtml(s.name)}</div>
        <div class="caf-opt__s">${escHtml(roomLabel)} &middot; ${escHtml(s.phone||'—')}</div>
      </div>
      <span class="lk-chip">${escHtml(roomLabel)}</span>
    </div>`;
  }).join('');
  drop.style.display = 'block';
}

function selectCancStudent(studentId) {
  const s = DB.students.find(x=>x.id===studentId); if(!s) return;
  const room = DB.rooms.find(r=>r.id===s.roomId);
  const type = room ? getRoomType(room) : null;

  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  set('canc-student', el => { el.value = studentId; });
  set('canc-search',  el => { el.value = s.name; });
  set('canc-search-drop', el => { el.style.display = 'none'; });
  set('canc-room-display', el => {
    el.value = room ? `Room #${room.number} · ${type?type.name:'—'} · ${room.floor||'—'}` : 'No room assigned';
  });

  const st  = calculateSettlement(studentId);
  const due = Number(st.outstanding || 0);

  set('canc-who', el => { el.innerHTML = `
    <div class="cef-who">
      <div class="cef-who__av">${escHtml((s.name||'?')[0].toUpperCase())}</div>
      <div style="min-width:0">
        <div class="cef-who__n">${escHtml(s.name)}
          ${due > 0 ? `<span class="lk-chip dh-red">${icon('warning','xs')}Dues pending</span>` : ''}</div>
        <div class="cef-who__s">ID: ${escHtml(String(s.id))}${s.cnic ? ' · CNIC: ' + cnicHtml(s.cnic) : ''}${s.phone ? ' · ' + escHtml(s.phone) : ''}</div>
      </div>
      <div class="cef-who__room">
        <div class="cef-who__rn">Room #${escHtml(String(room ? room.number : '?'))}</div>
        <div class="cef-who__rt">${escHtml(type ? type.name : '—')}${room && room.floor ? ' · ' + escHtml(room.floor) : ''}</div>
      </div>
    </div>`; });

  set('canc-dues', el => { el.innerHTML = _cancDuesHTML(studentId, st); });
}

/** The dues position, from the settlement authority. @see calculateSettlement */
function _cancDuesHTML(studentId, st) {
  const s      = st || calculateSettlement(studentId);
  const due    = Number(s.outstanding || 0);
  const credit = Number(s.credit || 0);

  if (due <= 0 && credit <= 0) {
    return `<div class="caf-clear-note">${icon('check','sm')}
      <div><b>Nothing outstanding.</b> ${s.records
        ? 'All ' + s.records + ' payment record' + (s.records === 1 ? '' : 's') + ' for this student are square.'
        : 'This student has no payment records yet.'}</div></div>`;
  }

  const box = (k, v, mod) =>
    `<div class="cef-dues__b${mod ? ' ' + mod : ''}"><span>${escHtml(k)}</span><b>${escHtml(fmtPKR(v))}</b></div>`;

  /* `net` is signed and easy to read backwards at a counter, so it is stated in
     words rather than printed as a fifth figure. */
  const net  = Number(s.net || 0);
  const line = net > 0 ? `On balance the student owes <b>${escHtml(fmtPKR(net))}</b> at departure.`
             : net < 0 ? `On balance the hostel owes the student <b>${escHtml(fmtPKR(Math.abs(net)))}</b> back.`
             : 'Dues and credit cancel out exactly — nothing changes hands.';

  return `
    <div class="cef-due">
      ${icon('warning', 'sm')}
      <div style="flex:1;min-width:0">
        <div class="cef-due__t">Outstanding dues: ${escHtml(fmtPKR(due))}</div>
        <div class="cef-due__s">The request can still be filed — the bed is held and billed until the vacate date, and the money is settled when the cancellation is confirmed.</div>
      </div>
      <button class="set-btn" onclick="closeModal();showStudentPanel('${escHtml(String(studentId))}')">View dues</button>
    </div>
    <div class="cef-dues">
      ${box('Billed', s.billed)}
      ${box('Collected', s.collected)}
      ${box('Advance credit', credit)}
      ${box('Total due', due, 'cef-dues__b--tot')}
    </div>
    <div class="cef-dues__net">${line}</div>`;
}

/** Put the search back to nothing, and take the cards down with it. */
function cafClearStudent() {
  ['canc-search'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const hid = document.getElementById('canc-student'); if (hid) hid.value = '';
  const room = document.getElementById('canc-room-display'); if (room) room.value = '';
  ['canc-who','canc-dues'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  cancStudentSearch('');
}

/* The picker FILLS the notes box rather than replacing it, so a reason chosen
   after something was typed does not throw the typing away. Same rule as the
   edit form's cefPickReason().

   THE UNTOUCHED DEFAULT IS THE ONE THING IT DOES REPLACE. The box now opens
   holding CANC_DEFAULT_REASON, and treating that as the warden's own typing
   would turn one picked reason into "Course completed — Student requested
   cancellation" on every form nobody edited. Once they have typed over it, it
   is theirs and the append rule applies again. */
function cafPickReason(v) {
  if (!v) return;
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('canc-reason'));
  if (!box) return;
  const cur = box.value.trim();
  const untouched = cur === CANC_DEFAULT_REASON;
  box.value = (!cur || untouched) ? v : (cur.indexOf(v) === 0 ? cur : v + ' — ' + cur);
  cafCount();
}

function cafCount() {
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('canc-reason'));
  const out = document.getElementById('caf-count');
  if (box && out) out.textContent = box.value.length + '/500';
}

function prefillCancStudentInfo(studentId) {
  selectCancStudent(studentId);
}

async function saveCancellation() {
  const studentId = document.getElementById('canc-student').value;
  const vacateDate = document.getElementById('canc-vacate').value;
  const reason = document.getElementById('canc-reason').value.trim();
  if(!studentId){ toast('Please select a student','error'); return; }
  const student = DB.students.find(s=>s.id===studentId);
  if(!student){ toast('Student not found','error'); return; }
  const room = DB.rooms.find(r=>r.id===student.roomId);
  const type = room?getRoomType(room):null;
  if(!DB.cancellations) DB.cancellations=[];
  DB.cancellations.push({
    id: 'canc_'+uid(), // FIX 22: consistent 'canc_' prefix matching rest of cancellation system
    seq: _cancNextSeq(), // stable CAN-#### shown in the list; survives deletions
    studentId: student.id,
    studentName: student.name,
    roomId: student.roomId||'',
    roomNumber: room?room.number:'—',
    roomType: type?type.name:'—',
    requestDate: today(),
    vacateDate: vacateDate||'',
    reason: reason,
    status: 'Pending',
    createdAt: today()
  });
  /* On notice, and STILL IN THE ROOM. `Cancelling` is one of
     RESIDENT_STATUSES, so isResident() is still true and this student is still
     counted by getRoomOccupancy() and still billed — they keep the bed until
     the vacate date. What the status changes is getRoomVacating(), which makes
     the bed RESERVABLE rather than free (see the rules at the top of rooms.js).

     This comment used to say the status "removes from occupancy". That was the
     behaviour before the 2026-08-30 ruling and is now the opposite of the
     truth; left as it was, it invites someone to "fix" an occupancy count that
     is already right. */
  student.status = 'Cancelling';
  await saveDB();
  closeModal();
  toast(`${student.name} is on notice — bed held until ${vacateDate ? fmtDate(vacateDate) : 'the vacate date'}.`, 'success');
  if(currentPage==='cancellations') renderPage('cancellations');
  else if(currentPage==='dashboard') renderPage('dashboard');
}

/* ══════════════════════════════════════════════════════════════════════════
   CHECKOUT SETTLEMENT (spec §14 — "cancellations, checkout")

   Confirming a cancellation is the moment a student stops being the hostel's
   and their money stops being collectable. It used to be a yes/no box that set
   a status: whatever they owed simply stayed on the books as arrears against
   somebody who had gone, and whatever they had overpaid stayed as a credit
   nobody would ever look at again.

   The settlement is arithmetic over records that already exist —
   calculateSettlement() in finance.js — and NOT a pro-rata calculation. There
   is no daily rate anywhere in this product, and a departing student is exactly
   the wrong person to hand an invented figure to. Every line here traces to a
   record the warden can open.

   Confirming and settling are two actions and stay two: a student can leave
   owing money. The modal shows the figure, offers to settle it, and confirms
   either way — but it records what the position WAS at departure on the
   cancellation itself, so the answer survives later edits to the records.
   ══════════════════════════════════════════════════════════════════════════ */
async function confirmCancellation(cancId) {
  const c = DB.cancellations.find(x=>x.id===cancId);
  if(!c) return;

  /* THE PART-MONTH RULE, WORKED OUT BEFORE THE SETTLEMENT IS SHOWN. It is
     applied to the vacate month's record as a concession the moment the warden
     confirms — see confirmCancellation() — so the settlement below is the
     position AFTER the refund the hostel's own rule allows, not before it. */
  const rf = _cancRefundOffer(c);
  /* THE PREVIEW IS THE POSITION AFTER THE RULE, not before it. Computing the
     settlement against the untouched records made the dialog say 'nothing
     outstanding' for exactly the student the refund exists for — a paid month
     is square until the concession lands — and the settle checkbox only
     renders when there IS something to move, so the money never moved. The
     records are cloned rather than written: nothing is committed until the
     warden presses Confirm. */
  const _preview = rf ? (DB.payments || []).map(p => (p && p.id === rf.paymentId)
      ? Object.assign({}, p, { concession: money(p.concession != null ? p.concession : p.discount) + rf.amount })
      : p) : null;
  const s = calculateSettlement(c.studentId, _preview ? { payments: _preview } : undefined);
  const pmOpts = pmOptions();

  const row = l => `
    <div class="canc-set__row">
      <span class="canc-set__m">${escHtml(l.month || '—')}</span>
      <span class="canc-set__b">${fmtPKR(l.billed)} billed</span>
      <span class="canc-set__v ${l.outstanding > 0 ? 'is-red' : l.credit > 0 ? 'is-amber' : ''}">${
        l.outstanding > 0 ? fmtPKR(l.outstanding) + ' owed'
        : l.credit > 0    ? fmtPKR(l.credit) + ' credit'
        : 'settled'}</span>
    </div>`;

  const verdict =
    s.action === 'collect' ? `<div class="canc-set__net is-red">Collect ${fmtPKR(s.amount)}</div>`
  : s.action === 'refund'  ? `<div class="canc-set__net is-amber">Refund ${fmtPKR(s.amount)}</div>`
  :                          `<div class="canc-set__net is-green">Nothing outstanding</div>`;

  showModal('modal-sm', 'Confirm cancellation',
    `<div class="canc-set">
       <div class="canc-set__who">
         <b>${escHtml(c.studentName || '—')}</b>
         <span>Leaving ${escHtml(c.vacateDate ? fmtDate(c.vacateDate) : 'on the vacate date')}${
           c.roomNumber && c.roomNumber !== '—' ? ' · Room #' + escHtml(String(c.roomNumber)) : ''}</span>
       </div>

       ${verdict}

       ${rf ? `
       <label class="canc-rf">
         <input type="checkbox" id="canc-rf-do" checked>
         <span class="canc-rf__b">
           <span class="canc-rf__t">Apply the part-month refund — ${escHtml(fmtPKR(rf.amount))}</span>
           <span class="canc-rf__s">${escHtml(refundPolicyLabel())} · ${escHtml(rf.reason)}</span>
           <span class="canc-rf__s">It is written onto the ${escHtml(rf.month)} record as a concession, so it shows on that payment and on every export.</span>
         </span>
       </label>` : ''}

       ${s.records
         ? `<div class="canc-set__lines">${s.lines.map(row).join('')}</div>`
         : `<div class="canc-set__none">No payment records for this student.</div>`}

       ${s.action !== 'settled' ? `
         <label class="canc-set__opt">
           <input type="checkbox" id="canc-set-do" checked>
           ${s.action === 'collect'
             ? `Collect the ${fmtPKR(s.amount)} now and settle every month above`
             : `Record the ${fmtPKR(s.amount)} as handed back`}
         </label>
         <div class="field"><label>Method</label>
           <select class="form-control" id="canc-set-method">${pmOpts}</select></div>
         <div class="field"><label>Date</label>
           <input class="form-control cdp-trigger" id="canc-set-date" type="text" readonly
                  onclick="showCustomDatePicker(this,event)" value="${c.vacateDate || today()}"></div>
         ${''/* Said plainly: leaving is allowed to be unresolved. A warden who
              cannot collect today should not be pushed into recording that
              they did. */}
         <div class="canc-set__note">Untick to confirm the cancellation and leave
           the ${s.action === 'collect' ? 'balance outstanding' : 'credit on the record'}.</div>`
       : ''}

       <div class="canc-set__note">The student is set to <b>Left</b> and the bed is released.</div>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="submitCancellationSettlement('${c.id}')">Confirm</button>`);
}

async function submitCancellationSettlement(cancId) {
  const c = DB.cancellations.find(x => x.id === cancId);
  if (!c) return;

  /* THE PART-MONTH REFUND IS APPLIED FIRST, and the settlement is worked out
     afterwards — deliberately, and in that order. It reduces the bill on the
     vacate month's record, which is what turns a paid month into a credit; the
     existing refund path below then hands that credit back through
     reversePayment(). Computing the settlement first would have netted the
     student's position against a bill the hostel had already agreed to drop. */
  const offer = _cancRefundOffer(c);
  const takeRefund = !document.getElementById('canc-rf-do') || !!document.getElementById('canc-rf-do').checked;
  let refunded = 0;
  if (offer && takeRefund) refunded = await _cancApplyRefund(c, offer);

  const s      = calculateSettlement(c.studentId);
  const doIt   = !!document.getElementById('canc-set-do')?.checked;
  const method = document.getElementById('canc-set-method')?.value || 'Cash';
  const date   = document.getElementById('canc-set-date')?.value || c.vacateDate || today();

  let moved = 0;
  if (doIt && s.action === 'collect') {
    /* Settled month by month against the records that hold the debt, through
       applyPayment() — a lump written anywhere else would leave every month it
       covered still reading as unpaid. */
    s.lines.forEach(l => {
      if (l.outstanding <= 0) return;
      const p = DB.payments.find(x => x.id === l.paymentId);
      if (!p) return;
      const r = applyPayment(p, { amount: l.outstanding, method, date, note: 'Checkout settlement' });
      if (r.ok) moved += r.applied;
    });
    if (moved > 0) logActivity('Payment Collected',
      `${c.studentName || '—'} — checkout settlement · ${fmtPKR(moved)} across ${s.lines.filter(l=>l.outstanding>0).length} month(s)`, 'Finance');
  } else if (doIt && s.action === 'refund') {
    /* Handing a credit back IS a reversal: it reduces what the record holds and
       dashboard.js dates it as cash leaving the drawer today, rather than
       silently deleting a credit and leaving the cash figure unexplained. */
    s.lines.forEach(l => {
      if (l.credit <= 0) return;
      const p = DB.payments.find(x => x.id === l.paymentId);
      if (!p) return;
      const r = reversePayment(p, { amount: l.credit, method, date, reason: 'Refunded at checkout' });
      if (r.ok) moved += r.reversed;
    });
    if (moved > 0) logActivity('Payment Reversed',
      `${c.studentName || '—'} — refunded at checkout · ${fmtPKR(moved)}`, 'Finance');
  }

  /* The position AT DEPARTURE, kept on the cancellation. The payment records
     stay editable forever; this is the only place that remembers what was owed
     on the day the student walked out. */
  c.settlement = {
    on: date,
    billed: s.billed, collected: s.collected,
    outstanding: s.outstanding, credit: s.credit,
    net: s.net, action: s.action,
    settledNow: moved,
    /* What the hostel's own rule gave back, kept separately from what changed
       hands at the counter: the concession reduced the bill, and `settledNow`
       is the cash that followed it. A reader asking "why is this month less
       than the others" gets the answer here rather than from the payment. */
    refundPolicy: offer && takeRefund ? refundPolicyLabel() : '',
    refundApplied: refunded,
    /* WHICH WAY THE MONEY WENT. It was handed to applyPayment/reversePayment
       and then forgotten, so a refund on this record could not say whether it
       was cash or a transfer — the one question asked when a leaver telephones
       a week later. */
    method: method || '',
  };
  c.status = 'Confirmed';

  const student = DB.students.find(x => x.id === c.studentId);
  if (student) {
    student.status   = 'Left';
    student.leftDate = c.vacateDate || today();
    student.lastRoom = _cancRoomNumberOf(student);
  }

  await saveDB();
  closeModal();
  renderPage('cancellations');
  toast(moved > 0
      ? `${c.studentName} marked as Left · ${fmtPKR(moved)} ${s.action === 'refund' ? 'refunded' : 'collected'}`
      : s.action === 'settled'
        ? `${c.studentName} marked as Left — nothing outstanding`
        : `${c.studentName} marked as Left · ${fmtPKR(s.amount)} ${s.action === 'refund' ? 'credit left on record' : 'still outstanding'}`,
    'success');
}

async function restoreFromCancellation(cancId) {
  const c = DB.cancellations.find(x=>x.id===cancId);
  if(!c) return;
  showConfirm('Restore Student', `Restore ${escHtml(c.studentName)} to Active? Their seat will be re-occupied.`, (async ()=>{
    c.status = 'Restored';
    const student = DB.students.find(s=>s.id===c.studentId);
    if(student){ student.status='Active'; }
    await saveDB();
    toast(`${c.studentName} restored to Active. Seat is re-occupied.`, 'success');
    renderPage('cancellations');
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// ROOMS
// ════════════════════════════════════════════════════════════════════════════
// Rooms v5 adds a grid/list view switch.
let roomFilter = {status:'All', type:'All', floor:'All', search:'', view:'grid',
                  page:1, sortKey:'number', sortDir:'asc'};
/* `view` is NOT reset: grid-or-table is how this warden likes to read the
   room list, not a filter hiding rows from them. */
registerFilter('rooms', roomFilter, () => ({
  status:'All', type:'All', floor:'All', search:'', page:1,
  sortKey:'number', sortDir:'asc',
}));

/* ── THE CANCELLATION LIST EVERY READER SEES ─────────────────────────────────
   Shared by the screen and by both exports, so a printed report cannot hold a
   different set of departures from the page it was printed from (§44). The old
   report ignored the filters entirely and dumped every cancellation the
   database had ever held, on a page a warden opens to answer "who is leaving
   this month". */
function cancellationsFiltered() {
  const all   = DB.cancellations || [];
  const scope = all.filter(_cancInScope);      // this month's departures (§10 of CLAUDE.md)
  const st    = cancelFilter.status || 'All';
  const byStatus = st === 'All' ? scope
    : st === 'Freed' ? scope.filter(c => c.status === 'Pending' || c.status === 'Confirmed')
    : scope.filter(c => c.status === st);

  const q = (cancelFilter.search || '').trim().toLowerCase();
  const filtered = byStatus.filter(c => {
    if (cancelFilter.type !== 'All' && (c.roomType || '') !== cancelFilter.type) return false;
    if (!q) return true;
    return [c.studentName, c.roomNumber, c.roomType, c.reason, c.status, _cancSeq(c, scope)]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  return applySort(filtered, cancelFilter, {
    student: c => c.studentName || '',
    room:    { get: c => c.roomNumber || '', cmp: cmpRoomNo },
    type:    c => c.roomType || '',
    request: c => c.requestDate || '',
    vacate:  c => c.vacateDate || '',
    status:  c => c.status || '',
    reason:  c => c.reason || '',
  });
}

/* ══ THE CANCELLATIONS EXPORT ══════════════════════════════════════════════
   §37 — the export must make the cancellation lifecycle understandable without
   opening the application: who is leaving, when they gave notice, when the bed
   frees, why, what was owed on the day, what was collected or refunded, and
   where the record stands now.

   `settlement` is the position AT DEPARTURE, frozen onto the cancellation when
   it was confirmed. The payment records stay editable forever, so it is the
   only figure that still means what it meant on the day the student walked
   out — and it is therefore the one this document prints, rather than
   recomputing a number that would drift away from the receipt in the
   student's hand.

   This replaces a report that was navy-and-violet with emoji headings, listed
   every cancellation ever recorded regardless of the filters on screen, and
   printed a two-month payment history per student that made a 40-departure
   month a forty-page document.                                              */
function _cancExportDef(list) {
  const scopeList = (DB.cancellations || []).filter(_cancInScope);
  const seqOf = c => c.seq ? 'CAN-' + String(c.seq).padStart(4, '0') : _cancSeq(c, scopeList);
  const set   = c => c.settlement || null;

  const pending   = list.filter(c => c.status === 'Pending').length;
  const confirmed = list.filter(c => c.status === 'Confirmed').length;
  const restored  = list.filter(c => c.status === 'Restored').length;
  const collected = list.reduce((s, c) => s + Number((set(c) || {}).collected || 0), 0);
  const owed      = list.reduce((s, c) => s + Number((set(c) || {}).outstanding || 0), 0);
  const refunded  = list.reduce((s, c) => s + Number((set(c) || {}).credit || 0), 0);

  return {
    module: 'Cancellations',
    title:  'Cancellation Register',
    scope:  _cancMonthLabel(cancelFilter.month),
    sheet:  'Cancellations',

    filters: [
      ['Month',  _cancMonthLabel(cancelFilter.month)],
      ['Status', cancelFilter.status !== 'All' ? cancelFilter.status : null],
      ['Type',   cancelFilter.type   !== 'All' ? cancelFilter.type : null],
      ['Search', cancelFilter.search || null],
    ],

    summary: [
      { label: 'Departures',  value: String(list.length) },
      { label: 'Pending',     value: String(pending), tone: pending ? 'warn' : '' },
      { label: 'Confirmed',   value: String(confirmed), tone: 'pos' },
      { label: 'Restored',    value: String(restored) },
      { label: 'Settled',     value: EXPORT.fmt.money(collected), tone: 'pos' },
      { label: 'Left owing',  value: EXPORT.fmt.money(owed), tone: owed > 0 ? 'neg' : '' },
      { label: 'Refunded',    value: EXPORT.fmt.money(refunded) },
    ],

    columns: [
      { label: 'Ref',  type: 'id', width: 12, value: c => seqOf(c) },
      { label: 'Room', type: 'id', width: 9,
        value: c => String(c.roomNumber || ''),
        get:   c => '<b>#' + escHtml(String(c.roomNumber || '—')) + '</b>' },
      { label: 'Student', type: 'text', width: 22,
        value: c => c.studentName || '',
        get:   c => '<b>' + escHtml(c.studentName || '—') + '</b>',
        sub:   c => c.roomType || '' },
      { label: 'Room type', type: 'text', width: 16, pdf: false, value: c => c.roomType || '' },
      { label: 'Notice given', type: 'date', width: 14, value: c => c.requestDate || '' },
      { label: 'Vacates',      type: 'date', width: 14,
        value: c => c.vacateDate || '',
        get:   c => c.vacateDate ? EXPORT.fmt.date(c.vacateDate)
                                 : '<span style="color:#94A3B8">end of month</span>' },
      { label: 'Settled on',   type: 'date', width: 14, pdf: false,
        value: c => (set(c) || {}).on || '' },
      { label: 'Reason', type: 'wrap', width: 30, value: c => c.reason || '' },

      { label: 'Billed',      type: 'money', width: 14, total: 'sum', pdf: false,
        value: c => set(c) ? Number(set(c).billed || 0) : null },
      { label: 'Collected',   type: 'money', width: 14, total: 'sum',
        value: c => set(c) ? Number(set(c).collected || 0) : null },
      { label: 'Outstanding', type: 'money', width: 14, total: 'sum',
        value: c => set(c) ? Number(set(c).outstanding || 0) : null,
        get:   c => { const s = set(c);
          return s && Number(s.outstanding) > 0
            ? '<span class="neg">' + fmtPKR(s.outstanding) + '</span>' : '—'; } },
      { label: 'Refund',      type: 'money', width: 13, total: 'sum',
        value: c => set(c) ? Number(set(c).credit || 0) : null },

      { label: 'Status', type: 'status', width: 12, value: c => c.status || 'Pending' },
      { label: 'Notes',  type: 'wrap', width: 30, pdf: false, value: c => c.notes || '' },
    ],

    rows: list,
    /* §57 — a cancellation register IS an official record: it is the sheet a
       departing student's account is closed against. Ordinary registers get no
       signature block; this one does. */
    signatures: ['Warden', 'Owner / Manager'],
    note: 'Financial figures are the position recorded at departure.',
    empty: 'No cancellations match the selected scope.',
  };
}

function exportCancellationsPDF() {
  const list = cancellationsFiltered();
  if (!list.length) { toast('No cancellation records to export', 'error'); return; }
  EXPORT.pdf(_cancExportDef(list));
}

function exportCancellationsExcel() {
  const list = cancellationsFiltered();
  if (!list.length) { toast('No cancellation records to export', 'error'); return; }
  EXPORT.excel(_cancExportDef(list));
}

/* The name the toolbar button has always called. */
function downloadCancellationReport() { exportCancellationsPDF(); }

// ─────────────────────────────────────────────────────────────────────────────

/* ── WHAT THE CHECKOUT DID WITH THE MONEY ───────────────────────────────────
   `confirmCancellation()` already settles a leaver: it collects what is still
   owed, or REFUNDS a credit through reversePayment(), and writes the position
   at departure onto `c.settlement`. Nothing showed it. The register listed
   nine cancellations and not one of them said whether money had changed hands
   — so "did we refund Azat?" was a question you answered by opening the
   payments page and reading dates (owner, 2026-09-09: "the refund detail
   should be saved everywhere and as a labelled").

   The cell names the outcome in one word and the amount under it. It reads
   from the record written at departure, never from today's payments — the
   payment rows stay editable forever and this is the only account of what was
   true on the day the student walked out. */
function cancSettleCell(c) {
  const s = c && c.settlement;
  if (!s) {
    return c && c.status === 'Pending'
      ? '<span class="lk-chip lk-chip--flat">Not settled</span>'
      : '<span class="lk-dash">—</span>';
  }
  const moved = Number(s.settledNow || 0);
  if (s.action === 'refund') {
    return '<span class="lk-chip dh-amber">' + escHtml('Refunded') + '</span>'
         + '<div class="lk-sub">' + escHtml(fmtPKR(moved > 0 ? moved : Number(s.credit || 0)))
         + (moved > 0 ? '' : ' credit left') + '</div>';
  }
  if (s.action === 'collect') {
    const left = Number(s.outstanding || 0) - moved;
    return '<span class="lk-chip ' + (left > 0 ? 'dh-red' : 'dh-green') + '">'
         + escHtml(left > 0 ? 'Part collected' : 'Collected') + '</span>'
         + '<div class="lk-sub">' + escHtml(fmtPKR(moved))
         + (left > 0 ? ' of ' + escHtml(fmtPKR(Number(s.outstanding || 0))) : '') + '</div>';
  }
  return '<span class="lk-chip dh-green">Settled</span>'
       + '<div class="lk-sub">nothing owed</div>';
}

/* The same three facts, for the record's own card and the edit form. */
function cancSettleLines(c) {
  const s = c && c.settlement;
  if (!s) return '';
  const row = (l, v) => '<div class="hi-fact"><span class="hi-fact__l">' + escHtml(l)
    + '</span><span class="hi-fact__v">' + escHtml(v) + '</span></div>';
  return '<div class="hi-facts" style="border-top:none;margin-top:0;padding-top:0">'
    + row('Settled on', s.on ? fmtDate(s.on) : '—')
    + row('Billed to departure', fmtPKR(Number(s.billed || 0)))
    + row('Collected', fmtPKR(Number(s.collected || 0)))
    + (Number(s.credit || 0) > 0 ? row('Credit at departure', fmtPKR(Number(s.credit || 0))) : '')
    + (Number(s.outstanding || 0) > 0 ? row('Outstanding at departure', fmtPKR(Number(s.outstanding || 0))) : '')
    + row(s.action === 'refund' ? 'Refunded at checkout' : 'Taken at checkout', fmtPKR(Number(s.settledNow || 0)))
    + (s.method ? row(s.action === 'refund' ? 'Refunded by' : 'Collected by', s.method) : '')
    + '</div>';
}

/* ── THE PART-MONTH REFUND, AT CHECKOUT ──────────────────────────────────────
   Finds the record for the month the student is leaving in and asks the
   hostel's rule what comes back. Returns null when there is nothing to offer,
   which is the common case and the default.

   The record is found by MONTH, not by date: a payment for September is the
   September record whenever it was taken, and a student leaving on 12 September
   is leaving part of that month however early they paid for it. */
function _cancRefundOffer(c) {
  if (!c || !c.vacateDate) return null;
  const pol = refundPolicy();
  if (pol.mode === 'none') return null;
  const mk = String(c.vacateDate).slice(0, 7);
  const rec = (DB.payments || []).find(p => p && p.studentId === c.studentId && String(p.month || '') === mk);
  if (!rec) return null;
  const r = calculateMidMonthRefund(rec, c.vacateDate, { policy: pol });
  if (!(r.amount > 0)) return null;
  r.paymentId = rec.id;
  r.month = mk;
  return r;
}

/* Writes the rule's amount onto the record as a concession. This is the whole
   integration: the bill for that month drops, the record goes into credit if it
   was paid, and confirmCancellation()'s existing refund path hands the credit
   back through reversePayment(). No second ledger, and the figure is visible
   wherever that payment is. */
async function _cancApplyRefund(c, offer) {
  if (!offer || !offer.paymentId) return 0;
  const rec = (DB.payments || []).find(p => p && p.id === offer.paymentId);
  if (!rec) return 0;
  const had = money(rec.concession != null ? rec.concession : rec.discount);
  rec.concession = had + offer.amount;
  rec.concessionDesc = 'Part-month refund — ' + refundPolicyLabel();
  logActivity('Charges Updated',
    (c.studentName || '—') + ' — part-month refund ' + fmtPKR(offer.amount)
    + ' on ' + offer.month + ' (' + refundPolicyLabel() + ')', 'Finance');
  return offer.amount;
}
