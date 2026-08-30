/* ─── HOSTYLLO — CANCELLATIONS MODULE ────────────────────────────────────────
   Contains: renderCancellations, showEditCancellationModal,
             submitEditCancellation, deleteCancellationRecord,
             showAddCancellationModal, cancStudentSearch, selectCancStudent,
             prefillCancStudentInfo, saveCancellation, confirmCancellation,
             restoreFromCancellation, downloadCancellationReport
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── Cancellations v5 — toolbar state ────────────────────────────────────────
   Status is NOT read from nav.js. Its `cancFilter` looks like shared state but
   is a function-local `let` inside renderPage(), re-initialised to 'All' on
   every call — so anything here that read it always saw 'All' and silently
   dropped the status filter on the next toolbar change. The route argument is
   the authority, and renderCancellations mirrors it into `status` below so the
   toolbar can re-render into the same view. */
let cancelFilter = { status:'All', search:'', type:'All', room:'All', from:'', to:'',
                     month:thisMonth(), page:1, pageSize:30, sortKey:null, sortDir:'asc' };

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
  const q = cancelFilter.search.trim().toLowerCase();
  let filtered = byStatus.filter(c => {
    if (cancelFilter.type !== 'All' && (c.roomType||'') !== cancelFilter.type) return false;
    if (cancelFilter.room !== 'All' && String(c.roomNumber||'') !== cancelFilter.room) return false;
    if (cancelFilter.from && (c.requestDate||'') < cancelFilter.from) return false;
    if (cancelFilter.to   && (c.requestDate||'') > cancelFilter.to)   return false;
    if (!q) return true;
    return [c.studentName, c.roomNumber, c.roomType, c.reason, c.status, _cancSeq(c, list)]
      .some(v => String(v||'').toLowerCase().includes(q));
  });
  filtered = applySort(filtered, cancelFilter, {
    student: c=>c.studentName||'', room: c=>Number(c.roomNumber)||0, type: c=>c.roomType||'',
    request: c=>c.requestDate||'', vacate: c=>c.vacateDate||'',
    status:  c=>c.status||'',      reason: c=>c.reason||''
  });
  const _pg = paginate(filtered, cancelFilter);

  const roomNums = [...new Set(list.map(c=>String(c.roomNumber||'')).filter(Boolean))]
                     .sort((a,b)=>(Number(a)||0)-(Number(b)||0));
  const types    = [...new Set(list.map(c=>String(c.roomType||'')).filter(Boolean))].sort();
  const nActive  = [cancelFilter.type!=='All', cancelFilter.room!=='All',
                    !!cancelFilter.from, !!cancelFilter.to, !!q].filter(Boolean).length;

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
    const acts = c.status==='Pending'
      ? `<button class="lk-act lk-act--hue dh-green" onclick="confirmCancellation('${c.id}')" title="Confirm — marks the student Left">
           <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Confirm</button>
         <button class="lk-act lk-act--hue dh-blue" onclick="restoreFromCancellation('${c.id}')" title="Restore the student to Active">
           <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>Restore</button>`
      : c.status==='Confirmed'
        ? `<button class="lk-act lk-act--hue dh-blue" onclick="restoreFromCancellation('${c.id}')" title="Restore the student to Active">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>Restore</button>`
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
      <td><div class="lk-room__n">#${escHtml(String(c.roomNumber||'—'))}</div></td>
      <td>${c.roomType
            ? `<span class="lk-chip${tc?'':' lk-chip--flat'}"${tc?` style="background:${tc}22;color:${tc}"`:''}>${escHtml(c.roomType)}</span>`
            : '<span class="lk-dash">—</span>'}</td>
      <td><div class="lk-when">${calSvg}${fmtDate(c.requestDate)}</div></td>
      <td>${c.vacateDate
            ? `<div class="lk-when">${calSvg}${fmtDate(c.vacateDate)}</div>`
            : '<span class="lk-dash">End of month</span>'}</td>
      <td>
        <span class="lk-chip ${st.hue}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${st.svg}</svg>${escHtml(c.status)}</span>
        <div class="lk-sub">${st.sub}</div>
      </td>
      <td style="max-width:170px;white-space:normal">${c.reason?escHtml(c.reason):'<span class="lk-dash">—</span>'}</td>
      <td>
        <div class="lk-acts">
          <button class="lk-act" onclick="showEditCancellationModal('${c.id}')" title="Edit this record">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>Edit</button>
          <button class="lk-act lk-act--icon lk-act--hue dh-red" onclick="deleteCancellationRecord('${c.id}')" title="Delete this record">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
          ${acts}
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
  <div class="lk-banner dh-violet${filterStatus==='Freed'?' is-on':''}" onclick="renderPage('cancellations_Freed')" title="Show the seats these cancellations have freed">
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
        <input id="canc-search" placeholder="Search student, room, reason, request ID…"
               value="${escHtml(cancelFilter.search)}" oninput="canSearch(this.value)">
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
          `<option value="${s}" ${filterStatus===s?'selected':''}>${s==='All'?'All Status':s==='Freed'?'Freed Seats':s}</option>`).join('')}
      </select>

      <select class="lk-select${cancelFilter.type!=='All'?' is-set':''}" onchange="canSet('type',this.value)" title="Filter by room type">
        <option value="All">All Types</option>
        ${types.map(t=>`<option value="${escHtml(t)}" ${cancelFilter.type===t?'selected':''}>${escHtml(t)}</option>`).join('')}
      </select>

      <select class="lk-select${cancelFilter.room!=='All'?' is-set':''}" onchange="canSet('room',this.value)" title="Filter by room">
        <option value="All">All Rooms</option>
        ${roomNums.map(r=>`<option value="${escHtml(r)}" ${cancelFilter.room===r?'selected':''}>Room #${escHtml(r)}</option>`).join('')}
      </select>

      <div class="lk-range" title="Filter by request date">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
        <input class="cdp-trigger" type="text" readonly placeholder="From" value="${escHtml(cancelFilter.from)}"
               onclick="showCustomDatePicker(this,event)" onchange="canSet('from',this.value)">
        <span>→</span>
        <input class="cdp-trigger" type="text" readonly placeholder="To" value="${escHtml(cancelFilter.to)}"
               onclick="showCustomDatePicker(this,event)" onchange="canSet('to',this.value)">
      </div>

      <div class="lk-tools__end">
        ${nActive?`<button class="lk-btn lk-btn--on" onclick="canClearFilters()" title="Clear the toolbar filters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          Clear<span class="lk-btn__count">${nActive}</span></button>`:''}
        <button class="lk-btn lk-btn--go" onclick="downloadCancellationReport()" title="Print / save the cancellation report">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          Download Report</button>
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
            ${th('student','Student')}${th('room','Room')}${th('type','Type')}
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
function canClearFilters() {
  cancelFilter.month = thisMonth(); cancelFilter.search = ''; cancelFilter.type = 'All'; cancelFilter.room = 'All';
  cancelFilter.from = ''; cancelFilter.to = '';
  canSet('page', 1);
}
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

function showEditCancellationModal(cancId) {
  const c = (DB.cancellations||[]).find(x=>x.id===cancId);
  if(!c) return;
  const student = DB.students.find(s=>s.id===c.studentId);
  const room = DB.rooms.find(r=>r.id===c.roomId);
  const statusOpts = ['Pending','Confirmed','Restored'].map(s=>`<option value="${s}" ${c.status===s?'selected':''}>${s==='Pending'?'⏳ Pending':s==='Confirmed'?'✅ Confirmed':'↩️ Restored'}</option>`).join('');

  showModal('modal-md','✏️ Edit Cancellation Record',`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:14px">
      <div style="width:40px;height:40px;border-radius:10px;background:var(--red-dim);display:flex;align-items:center;justify-content:center;font-size:18px">🚫</div>
      <div>
        <div style="font-weight:700;font-size:14px;color:var(--text)">${escHtml(c.studentName||'—')}</div>
        <div style="font-size:12px;color:var(--text3)">Room #${escHtml(c.roomNumber||'?')} · ${escHtml(c.roomType||'—')} · ${escHtml(student?.phone||'No phone')}</div>
      </div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Status</label>
        <select class="form-control" id="f-cstatus" onchange="
          const v=this.value;
          document.getElementById('cancel-status-note').style.display=v==='Confirmed'?'block':'none';
          document.getElementById('restore-status-note').style.display=v==='Restored'?'block':'none';
        ">${statusOpts}</select>
        <div id="cancel-status-note" style="display:${c.status==='Confirmed'?'block':'none'};font-size:11px;color:var(--red);margin-top:4px">${icon('warning','sm')} Student will be marked as Left</div>
        <div id="restore-status-note" style="display:${c.status==='Restored'?'block':'none'};font-size:11px;color:var(--green);margin-top:4px">${icon('check','sm')} Student will be restored to Active</div>
      </div>
      <div class="field"><label>Vacate By Date</label><input class="form-control cdp-trigger" id="f-cvacate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${c.vacateDate||''}"></div>
      <div class="field col-full"><label>Reason / Notes</label><textarea class="form-control" id="f-creason" rows="3" placeholder="Reason for cancellation…">${escHtml(c.reason||'')}</textarea></div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
      <div><span style="color:var(--text3)">Requested:</span> <strong>${fmtDate(c.requestDate)}</strong></div>
      <div><span style="color:var(--text3)">Record ID:</span> <span style="font-family:var(--font-mono);color:var(--text3);font-size:10px">${c.id}</span></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-danger btn-sm" onclick="deleteCancellationRecord('${cancId}')"><span class=\"micon\" style=\"font-size:14px\">delete</span> Delete</button>
   <button class="btn btn-primary" onclick="submitEditCancellation('${cancId}')"><span class=\"micon\" style=\"font-size:14px\">save</span> Save</button>`);
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
  const c = (DB.cancellations||[]).find(x=>x.id===cancId);
  if(!c) return;
  showConfirm('Delete Record','Are you sure you want to permanently delete this cancellation record? The student status will not be changed.',(async ()=>{
    DB.cancellations = (DB.cancellations||[]).filter(x=>x.id!==cancId);
    await saveDB(); closeModal(); renderPage('cancellations_All');
    toast('Record deleted','success');
  }));
}

function showAddCancellationModal() {
  const activeStudents = DB.students.filter(s=>s.status==='Active');
  const alreadyCancelling = (DB.cancellations||[]).filter(c=>c.status==='Pending').map(c=>c.studentId);
  const available = activeStudents.filter(s=>!alreadyCancelling.includes(s.id));
  const studentOpts = available.map(s=>{
    const room=DB.rooms.find(r=>r.id===s.roomId);
    return `<option value="${s.id}">👤 ${escHtml(s.name)} — Room #${escHtml(String(room?room.number:'?'))}</option>`;
  }).join('');

  if(available.length===0){
    toast('No active students available to cancel','error');
    return;
  }

  const endOfMonth = (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); d.setDate(0); return ymd(d); })();

  showModal('modal-md','🚫 Add Cancellation Request',`
    <div style="background:var(--red-dim);border:1px solid rgba(224,82,82,0.25);border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:12.5px;color:var(--text2)">
      ${icon('warning','sm')} <strong>Note:</strong> The student stays on the roster and <strong>keeps their bed until the vacate date</strong> — they are still billed for it, and the Rooms page marks the seat <strong style="color:var(--amber)">vacating</strong> so nobody books it twice. The bed frees when the cancellation is confirmed.
    </div>
    <div class="form-grid">
      <div class="field col-full">
        <label>Search Student</label>
        <div style="position:relative">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3);pointer-events:none">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input class="form-control" id="canc-search" placeholder="Search by name, room #, student ID…"
            style="padding-left:32px;padding-right:32px"
            oninput="cancStudentSearch(this.value)"
            onfocus="cancStudentSearch(this.value)"
            onblur="setTimeout(()=>{const d=document.getElementById('canc-search-drop');if(d)d.style.display='none';},200)"
            autocomplete="off">
          <button onclick="document.getElementById('canc-search').value='';cancStudentSearch('');document.getElementById('canc-selected-info').style.display='none';document.getElementById('canc-student').value=''"
            style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;line-height:1;padding:2px 4px"
            title="Clear">✕</button>
          <div id="canc-search-drop" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border2);border-radius:8px;z-index:9999;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.5);margin-top:2px"></div>
        </div>
        <input type="hidden" id="canc-student" value="">
        <!-- Selected student info card -->
        <div id="canc-selected-info" style="display:none;margin-top:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 14px;display:none">
          <div id="canc-selected-name" style="font-weight:700;font-size:14px;color:var(--text)"></div>
          <div id="canc-selected-meta" style="font-size:11px;color:var(--text3);margin-top:2px"></div>
        </div>
      </div>
      <div class="field">
        <label>Room (auto-filled)</label>
        <input id="canc-room-display" class="form-control" readonly placeholder="Select student first" style="opacity:0.7">
      </div>
      <div class="field">
        <label>Vacate By Date</label>
        <input class="form-control cdp-trigger" id="canc-vacate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${endOfMonth}">
      </div>
      <div class="field col-full">
        <label>Reason for Cancellation</label>
        <textarea id="canc-reason" class="form-control" placeholder="e.g. Shifting to own house, going back to hometown..."></textarea>
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="saveCancellation()">🚫 Add to Cancellation List</button>`
  );
  // pass available list to search fn
  window._cancAvailable = available;
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
    drop.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px">No students found</div>';
    drop.style.display = 'block';
    return;
  }
  drop.innerHTML = matches.slice(0,12).map(s => {
    const room = DB.rooms.find(r=>r.id===s.roomId);
    const roomLabel = room ? `Rm #${room.number}` : 'No room';
    return `<div onclick="selectCancStudent('${s.id}')"
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:32px;height:32px;border-radius:8px;background:var(--bg3);color:var(--text2);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;flex-shrink:0">${escHtml((s.name||'?')[0].toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:var(--text);font-size:13px">${escHtml(s.name)}</div>
        <div style="font-size:11px;color:var(--text3)">${roomLabel} · ${escHtml(s.phone||'—')}</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:var(--accent-strong);background:var(--accent-dim);border-radius:6px;padding:2px 7px">${roomLabel}</div>
    </div>`;
  }).join('');
  drop.style.display = 'block';
}

function selectCancStudent(studentId) {
  const s = DB.students.find(x=>x.id===studentId); if(!s) return;
  const room = DB.rooms.find(r=>r.id===s.roomId);
  const type = room ? getRoomType(room) : null;
  // Set hidden input
  const hiddenInp = document.getElementById('canc-student');
  if(hiddenInp) hiddenInp.value = studentId;
  // Fill search bar with name
  const searchInp = document.getElementById('canc-search');
  if(searchInp) searchInp.value = s.name;
  // Hide dropdown
  const drop = document.getElementById('canc-search-drop');
  if(drop) drop.style.display = 'none';
  // Show selected info card
  const infoCard = document.getElementById('canc-selected-info');
  const nameEl = document.getElementById('canc-selected-name');
  const metaEl = document.getElementById('canc-selected-meta');
  if(infoCard && nameEl && metaEl) {
    nameEl.textContent = s.name;
    metaEl.textContent = (room ? `Room #${room.number} · ${type?type.name:'—'} · Floor ${room.floor}` : 'No room') + (s.phone ? ' · '+s.phone : '');
    infoCard.style.display = 'block';
  }
  // Fill room display
  const roomEl = document.getElementById('canc-room-display');
  if(roomEl) roomEl.value = room ? `Room #${room.number} · ${type?type.name:''} · Floor ${room.floor}` : 'No room assigned';
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
  // Immediately mark student as Cancelling — removes from occupancy
  student.status = 'Cancelling';
  await saveDB();
  closeModal();
  toast(`${student.name} is on notice — bed held until ${vacateDate ? fmtDate(vacateDate) : 'the vacate date'}.`, 'success');
  if(currentPage==='cancellations') renderPage('cancellations');
  else if(currentPage==='dashboard') renderPage('dashboard');
}

async function confirmCancellation(cancId) {
  const c = DB.cancellations.find(x=>x.id===cancId);
  if(!c) return;
  showConfirm('Confirm Cancellation', `Mark ${escHtml(c.studentName)}'s cancellation as confirmed? Student will be set to "Left".`, (async ()=>{
    c.status = 'Confirmed';
    const student = DB.students.find(s=>s.id===c.studentId);
    if(student){
      student.status='Left';
      student.leftDate = c.vacateDate || today();
      student.lastRoom = _cancRoomNumberOf(student);
    }
    await saveDB();
    toast(`${c.studentName} cancellation confirmed. Student marked as Left.`, 'success');
    renderPage('cancellations');
  }));
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
                  page:1, sortKey:null, sortDir:'asc'};

function downloadCancellationReport() {
  const list = DB.cancellations || [];
  if(!list.length){ toast('No cancellation records to export','error'); return; }

  // Get last 2 months date range
  const now = new Date();
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth()-2, 1);

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Cancellation Report — ${escHtml(DB.settings.hostelName||'Hostel')}</title>
  <style>
    @page { margin: 15mm; }
    @media print { .no-print { display:none; } }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 20px; }
    h1 { font-size: 20px; color: #0f1a2e; margin-bottom: 4px; }
    .sub { color: #888; font-size: 11px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #0f1a2e; color: #a78bfa; padding: 8px 10px; text-align: left; font-size: 11px; letter-spacing: 0.5px; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 11px; }
    tr:nth-child(even) td { background: #f8f9fb; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
    .badge-red { background: #fee2e2; color: #dc2626; }
    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-gray { background: #f3f4f6; color: #555; }
    .section-title { font-size: 13px; font-weight: 800; color: #0f1a2e; border-left: 4px solid #7c3aed; padding-left: 10px; margin: 20px 0 10px; }
    .pay-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #eee; font-size: 11px; }
    .no-print { margin-bottom: 16px; }
    button { padding: 8px 18px; background: #0f1a2e; color: #a78bfa; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 700; margin-right: 8px; }
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()"><span class=\"micon\" style=\"font-size:15px\">print</span> Print</button>
    <button onclick="window.close()">✕ Close</button>
  </div>
  <h1>📋 Cancellation Report</h1>
  <div class="sub">${escHtml(DB.settings.hostelName||'Hostel')} · Generated: ${new Date().toLocaleString('en-PK')} · Includes last 2 months payment history</div>`;

  list.forEach(c => {
    const student = DB.students.find(s=>s.id===c.studentId);
    // Get last 2 months of payments for this student
    const payments = (DB.payments||[]).filter(p=>{
      if(p.studentId !== c.studentId) return false;
      const d = new Date(p.date||p.dueDate||'');
      return d >= twoMonthsAgo;
    }).sort((a,b)=>new Date(b.date||b.dueDate||0)-new Date(a.date||a.dueDate||0)).slice(0,6);

    // BUG FIX: 'Confirmed' incorrectly mapped to badge-red (same as Pending).
    // Fixed: Pending→red, Confirmed→amber, Cancelled/Vacated→gray, others→green.
    const statusBadge = c.status==='Pending' ? 'badge-red'
      : c.status==='Confirmed'  ? 'badge-amber'
      : (c.status==='Cancelled' || c.status==='Vacated') ? 'badge-gray'
      : 'badge-green';

    html += `<div style="border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#0f1a2e">${escHtml(c.studentName||'—')}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">Room #${escHtml(c.roomNumber||'—')} · ${escHtml(c.roomType||'—')} · ${escHtml(student?.phone||'No phone')}</div>
        </div>
        <span class="badge ${statusBadge}">${c.status}</span>
      </div>
      <table>
        <tr><th>Field</th><th>Details</th></tr>
        <tr><td>Request Date</td><td>${fmtDate(c.requestDate)||'—'}</td></tr>
        <tr><td>Vacate Date</td><td>${fmtDate(c.vacateDate)||'End of Month'}</td></tr>
        <tr><td>Reason</td><td>${escHtml(c.reason||'—')}</td></tr>
        <tr><td>Notes</td><td>${escHtml(c.notes||'—')}</td></tr>
      </table>
      <div class="section-title">💰 Payment History (Last 2 Months)</div>`;

    if(payments.length) {
      html += `<table><tr><th>Month</th><th>Rent</th><th>Paid</th><th>Unpaid</th><th>Method</th><th>Date</th><th>Status</th></tr>`;
      payments.forEach(p=>{
        const statusCls = p.status==='Paid'?'badge-green':'badge-red';
        html += `<tr>
          <td>${p.month||'—'}</td>
          <td>${fmtPKR(p.monthlyRent||0)}</td>
          <td>${fmtPKR(p.amount||0)}</td>
          <td style="color:${(p.unpaid||0)>0?'#dc2626':'#16a34a'};font-weight:700">${fmtPKR(p.unpaid||0)}</td>
          <td>${escHtml(p.method||'—')}</td>
          <td>${fmtDate(p.date)||'—'}</td>
          <td><span class="badge ${statusCls}">${p.status}</span></td>
        </tr>`;
      });
      html += `</table>`;
    } else {
      html += `<div style="color:#aaa;font-size:11px;padding:8px 0">No payment records in last 2 months</div>`;
    }
    html += `</div>`;
  });

  html += `</body></html>`;

  _electronPDF(html, (DB.settings.hostelName||'Hostel').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_Rent-Summary_'+today()+'.pdf', {pageSize:'A4'});
}
// ─────────────────────────────────────────────────────────────────────────────
