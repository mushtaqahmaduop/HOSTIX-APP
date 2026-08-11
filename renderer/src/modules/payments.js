/* ─── HOSTIX — PAYMENTS MODULE ─────────────────────────────────────────────
   Contains: renderPayments, generateMonthlyRents, markPaymentPaid,
             deletePayment, filterStudentDropdown, selectStudentForPayment,
             recalcUnpaid, showAddPaymentModal, submitAddPayment,
             showAddPaymentForStudent, showEditPaymentModal, submitEditPayment,
             extra charges helpers, print+submit helpers
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   PAYMENTS v5 — derived state helpers
   The stored `status` field only ever holds 'Paid' or 'Pending'. The reference
   design distinguishes three more states that the data already supports, so
   they are DERIVED here rather than written back to the record.
   ══════════════════════════════════════════════════════════════════════════ */

// A pending payment is overdue once its own dueDate is in the past.
function payIsOverdue(p) {
  if (!p || p.status === 'Paid') return false;
  const d = p.dueDate || '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return false;
  return d.slice(0,10) < today();
}

// 'Paid' | 'Partial' (something was collected, a balance remains) | 'Pending'.
function payStatusOf(p) {
  if (!p) return 'Pending';
  if (p.status === 'Paid') return 'Paid';
  return Number(p.amount || 0) > 0 ? 'Partial' : 'Pending';
}

function payStatusHue(s) {
  return s === 'Paid' ? 'dh-green' : s === 'Partial' ? 'dh-amber' : 'dh-slate';
}

// Stable avatar hue from the name, so a student keeps the same colour between
// renders (an index-based rotation would reshuffle on every sort or filter).
function payAvatarHue(name) {
  const hues = ['dh-violet','dh-blue','dh-green','dh-amber','dh-red'];
  let h = 0; const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

// Mask all but the first five and last digit of a CNIC — the list is visible
// on a shared warden screen and the full number is never needed at a glance.
function payMaskCnic(c) {
  const d = String(c || '').replace(/\D/g, '');
  if (d.length < 7) return c ? escHtml(String(c)) : '';
  return escHtml(d.slice(0,5)) + '-' + '*'.repeat(Math.max(1, d.length - 6)) + '-' + escHtml(d.slice(-1));
}

// Every month present in the data, newest first — the month select is built
// from real records, so it can never offer a month with nothing behind it.
function payMonthOptions() {
  const seen = new Map();
  DB.payments.forEach(p => { if (p.month) seen.set(String(p.month), true); });
  return [...seen.keys()].sort((a,b) => {
    const da = new Date(a + ' 1'), db2 = new Date(b + ' 1');
    if (!isNaN(da) && !isNaN(db2)) return db2 - da;
    return String(b).localeCompare(String(a));
  });
}

// Single source of truth for the filtered+sorted list. Used by the table, the
// CSV export and the stat strip so the three can never disagree.
function payFiltered() {
  const mo = thisMonth();
  let pays = DB.payments.filter(p => {
    // Month: an explicit pick wins; otherwise fall back to the this-month /
    // all-months scope toggle in the Filters popover.
    if (payFilter.month !== 'All') { if (String(p.month || '') !== payFilter.month) return false; }
    else if (!payFilter.showAll)   { if (!_payMatchesMonth(p, mo)) return false; }

    if (payFilter.room !== 'All' && String(p.roomNumber || '') !== payFilter.room) return false;
    if (payFilter.method !== 'All' && p.method !== payFilter.method) return false;
    if (payFilter.unpaidOnly && !(Number(p.unpaid || 0) > 0)) return false;

    if (payFilter.status !== 'All') {
      if (payFilter.status === 'Overdue') { if (!payIsOverdue(p)) return false; }
      else if (payStatusOf(p) !== payFilter.status) return false;
    }
    if (payFilter.search) {
      const q = payFilter.search.toLowerCase();
      const st = DB.students.find(s => s.id === p.studentId);
      const hay = [p.studentName, String(p.roomNumber), p.month, p.method, p.status,
                   st?.fatherName, st?.cnic, st?.phone, st?.email];
      if (!hay.some(f => f && String(f).toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  return applySort(pays, payFilter, {
    student: p => p.studentName,
    room:    p => Number(p.roomNumber) || 0,
    month:   p => new Date((p.month || '') + ' 1').getTime() || 0,
    rent:    p => Number(p.monthlyRent || p.totalRent || p.amount || 0),
    paid:    p => Number(p.amount || 0),
    unpaid:  p => Number(p.unpaid || 0),
    method:  p => p.method,
    status:  p => payStatusOf(p)
  });
}

function renderPayments() {
  const mo = thisMonth();
  const moLabel = thisMonthLabel();

  let pays = payFiltered();

  const _pg = paginate(pays, payFilter);

  const pmOpts=DB.settings.paymentMethods.map(m=>`<option value="${m}" ${payFilter.method===m?'selected':''}>${escHtml(m)}</option>`).join('');
  const total=pays.reduce((s,p)=>s+Number(p.amount),0);

  // ── Stat strip figures — all computed from the CURRENT filtered list, so the
  //    cards always describe exactly what the table below is showing.
  const nPaid    = pays.filter(p=>payStatusOf(p)==='Paid').length;
  const nPending = pays.filter(p=>payStatusOf(p)!=='Paid').length;
  const nOverdue = pays.filter(p=>payIsOverdue(p)).length;
  const outstanding = pays.reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):0),0);
  const share = n => pays.length ? Math.round(n/pays.length*100) : 0;

  // Month-over-month change in collections. Real months only — renders nothing
  // when there is no previous month to compare against.
  const _mDelta = (()=>{
    const d = new Date(); const cur = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const pd = new Date(d.getFullYear(), d.getMonth()-1, 1);
    const prev = pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0');
    const sum = k => DB.payments.filter(p=>_payMatchesMonth(p,k)).reduce((s,p)=>s+Number(p.amount||0),0);
    const a = sum(prev); if(!a) return null;
    return ((sum(cur)-a)/a)*100;
  })();

  const upArrow   = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>';
  const downArrow = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7 17 17"/><path d="M17 9v8H9"/></svg>';

  const roomNums = [...new Set(DB.payments.map(p=>String(p.roomNumber||'')).filter(Boolean))]
                     .sort((a,b)=>(Number(a)||0)-(Number(b)||0));
  const monthOpts = payMonthOptions();
  const activeFilters = [payFilter.showAll, payFilter.unpaidOnly].filter(Boolean).length;

  const th = (key,label,extra) => {
    const on = payFilter.sortKey===key;
    const arw = on ? (payFilter.sortDir==='asc'?'▲':'▼') : '⇅';
    return `<th class="is-sortable${on?' is-sorted':''}" ${extra||''} onclick="toggleSort(payFilter,'payments','${key}')" title="Sort by ${label}">${label}<span class="arw">${arw}</span></th>`;
  };

  return `
  <!-- ══ STAT STRIP ══ -->
  <div class="pay-stats">
    <div class="pay-stat dh-green">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg></div>
        <div class="pay-stat__label">Total Collected</div>
      </div>
      <div class="pay-stat__val"><span class="cur">PKR</span>${fmtNum(total)}</div>
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">${payFilter.month!=='All'?escHtml(payFilter.month):(payFilter.showAll?'All months':escHtml(moLabel))}</span>
        ${_mDelta!==null?`<span class="pay-stat__delta ${_mDelta>=0?'dh-green':'dh-red'}">${_mDelta>=0?upArrow:downArrow}${Math.abs(_mDelta).toFixed(1)}%</span>`:''}
      </div>
    </div>

    <div class="pay-stat pay-stat--click dh-green" onclick="paySetStatus('Paid')" title="Show only paid records">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></div>
        <div class="pay-stat__label">Paid</div>
      </div>
      <div class="pay-stat__val">${nPaid}</div>
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">Records</span>
        <span class="pay-stat__delta">${share(nPaid)}%</span>
      </div>
    </div>

    <div class="pay-stat pay-stat--click dh-amber" onclick="paySetStatus('Pending')" title="Show only unsettled records">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
        <div class="pay-stat__label">Pending</div>
      </div>
      <div class="pay-stat__val">${nPending}</div>
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">Records</span>
        <span class="pay-stat__delta">${share(nPending)}%</span>
      </div>
    </div>

    <div class="pay-stat pay-stat--click dh-red" onclick="paySetStatus('Overdue')" title="Show only records past their due date">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></div>
        <div class="pay-stat__label">Overdue</div>
      </div>
      <div class="pay-stat__val">${nOverdue}</div>
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">Past due date</span>
        <span class="pay-stat__delta">${share(nOverdue)}%</span>
      </div>
    </div>

    <div class="pay-stat dh-violet">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/></svg></div>
        <div class="pay-stat__label">Unpaid Amount</div>
      </div>
      <div class="pay-stat__val"><span class="cur">PKR</span>${fmtNum(outstanding)}</div>
      <div class="pay-stat__foot"><span class="pay-stat__sub">Total outstanding</span></div>
    </div>
  </div>

  <!-- ══ TOOLBAR ══ -->
  <div class="pay-panel">
    <div class="pay-tools">
      <div class="pay-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        <input id="search-payments" placeholder="Search student name, room…" value="${escHtml(payFilter.search)}"
          oninput="capFirstChar(this);payFilter.search=this.value;payFilter.page=1;_dPayments()">
      </div>

      <select class="pay-select${payFilter.room!=='All'?' is-set':''}" onchange="payFilter.room=this.value;payFilter.page=1;renderPage('payments')" title="Filter by room">
        <option value="All">All Rooms</option>
        ${roomNums.map(r=>`<option value="${escHtml(r)}" ${payFilter.room===r?'selected':''}>Room ${escHtml(r)}</option>`).join('')}
      </select>

      <select class="pay-select${payFilter.month!=='All'?' is-set':''}" onchange="payFilter.month=this.value;payFilter.page=1;renderPage('payments')" title="Filter by month">
        <option value="All">All Months</option>
        ${monthOpts.map(m=>`<option value="${escHtml(m)}" ${payFilter.month===m?'selected':''}>${escHtml(m)}</option>`).join('')}
      </select>

      <select class="pay-select${payFilter.method!=='All'?' is-set':''}" onchange="payFilter.method=this.value;payFilter.page=1;renderPage('payments')" title="Filter by payment method">
        <option value="All">All Methods</option>${pmOpts}
      </select>

      <select class="pay-select${payFilter.status!=='All'?' is-set':''}" onchange="payFilter.status=this.value;payFilter.page=1;renderPage('payments')" title="Filter by status">
        ${['All','Paid','Partial','Pending','Overdue'].map(s=>`<option value="${s}" ${payFilter.status===s?'selected':''}>${s==='All'?'All Status':s}</option>`).join('')}
      </select>

      <div style="position:relative">
        <button class="pay-btn${activeFilters?' pay-btn--hue dh-blue':''}" onclick="payTogglePop(event)" title="More filters">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>
          Filters${activeFilters?`<span class="pay-btn__count">${activeFilters}</span>`:''}
        </button>
        <div class="pay-pop" id="pay-pop" style="display:none">
          <div class="pay-pop__t">Scope</div>
          <label class="pay-pop__row"><input type="checkbox" ${payFilter.showAll?'checked':''}
            onchange="payFilter.showAll=this.checked;payFilter.page=1;renderPage('payments')"> Include every month</label>
          <div class="pay-pop__t" style="margin-top:10px">Balance</div>
          <label class="pay-pop__row"><input type="checkbox" ${payFilter.unpaidOnly?'checked':''}
            onchange="payFilter.unpaidOnly=this.checked;payFilter.page=1;renderPage('payments')"> Only rows with an unpaid balance</label>
          <div class="pay-pop__sep"></div>
          <div class="pay-pop__row" onclick="payResetFilters()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
            Reset all filters
          </div>
        </div>
      </div>
    </div>

    <!-- ══ META ROW ══ -->
    <div class="pay-meta">
      <span class="pay-meta__txt">${pays.length} record${pays.length===1?'':'s'} &nbsp;·&nbsp; Total collected: <b>${fmtPKR(total)}</b></span>
      <div class="pay-meta__acts">
        <button class="pay-btn" onclick="exportPaymentsCSV()" title="Export the current list to CSV">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          CSV
        </button>
        <button class="pay-btn pay-btn--hue dh-blue" onclick="generateMonthlyRents()" title="Create this month's rent records for every active student">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
          Auto-Generate Month
        </button>
        <button class="pay-btn pay-btn--hue dh-green" onclick="showRentReminderModal()" title="Send WhatsApp reminders to everyone with rent outstanding">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>
          WhatsApp Reminders
        </button>
      </div>
    </div>

    ${paySelected.size>0?`
    <div class="pay-bulk dh-blue">
      <span class="pay-bulk__n">${paySelected.size} selected</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="pay-btn" onclick="payBulkExport()">Export selected</button>
        <button class="pay-btn pay-btn--hue dh-green" onclick="payBulkMarkPaid()">Mark ${paySelected.size} paid</button>
        <button class="pay-btn" onclick="paySelected.clear();renderPage('payments')">Clear</button>
      </div>
    </div>`:''}

    <!-- ══ TABLE ══ -->
    <div class="pay-table-wrap">
      <table class="pay-table">
        <thead><tr>
          <th style="width:36px"><input type="checkbox" ${_pg.slice.length>0&&_pg.slice.every(p=>paySelected.has(p.id))?'checked':''} onclick="payToggleAll(this.checked)" title="Select all on this page"></th>
          ${th('student','Student')}
          ${th('room','Room')}
          ${th('month','Month')}
          ${th('rent','Rent/Mo')}
          ${th('paid','Amt Paid')}
          ${th('unpaid','Unpaid')}
          ${th('method','Method')}
          ${th('status','Status')}
          <!-- Secondary money columns sit after Status: they are usually "—", and
               keeping them left of it pushed the columns that matter off-screen.
               They are hidden until the sidebar is collapsed — see payments.css. -->
          <th class="pay-col-x">Adm. Fee</th>
          <th class="pay-col-x">Extra Chrgs</th>
          <th class="pay-col-x">Concession</th>
          <th class="pay-col-act">Actions</th>
        </tr></thead>
        <tbody>
        ${_pg.slice.length===0?`<tr><td colspan="13"><div class="pay-empty">No payment records match these filters.</div></td></tr>`:
        _pg.slice.map(p=>{
          const st    = DB.students.find(s=>s.id===p.studentId);
          const room  = DB.rooms.find(r=>String(r.number)===String(p.roomNumber));
          const rtype = room ? DB.settings.roomTypes.find(x=>x.id===room.typeId) : null;
          const admFee = Number(p.admissionFee||p.fee||0);
          const extras = (p.extraCharges||[]).filter(c=>Number(c.amount)>0);
          const conc   = Number(p.concession||p.discount||0);
          const concD  = p.concessionDesc||p.discountDesc||'';
          const unpaid = Number(p.unpaid||0);
          const sLabel = payStatusOf(p);
          const sHue   = payStatusHue(sLabel);
          const picked = paySelected.has(p.id);
          const nm     = String(p.studentName||'?');
          const ini    = nm.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
          return `<tr class="${picked?'is-picked dh-blue':''}">
            <td onclick="event.stopPropagation()"><input type="checkbox" ${picked?'checked':''} onclick="payToggleRow('${p.id}')"></td>
            <td>
              <div class="pay-who">
                <div class="pay-who__av ${payAvatarHue(nm)}">${escHtml(ini)}</div>
                <div style="min-width:0">
                  <div class="pay-who__name">${escHtml(nm)}</div>
                  ${st&&st.cnic?`<div class="pay-who__meta">CNIC: ${payMaskCnic(st.cnic)}</div>`:''}
                  ${st&&st.phone?`<div class="pay-who__meta"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92"/></svg>${escHtml(st.phone)}</div>`:''}
                </div>
              </div>
            </td>
            <td>
              <div class="pay-room__n">#${escHtml(String(p.roomNumber||'—'))}</div>
              ${rtype?`<div class="pay-room__t">${escHtml(rtype.name)}</div>`:''}
              ${room&&room.floor?`<div class="pay-room__t">${escHtml(room.floor)} Floor</div>`:''}
            </td>
            <td>${escHtml(p.month||'—')}</td>
            <td class="pay-money">${fmtPKR(p.monthlyRent||p.totalRent||p.amount)}</td>
            <td class="pay-money pay-money--in">${fmtPKR(p.amount)}</td>
            <td class="pay-money ${unpaid>0?'pay-money--due':'pay-money--nil'}">${fmtPKR(unpaid)}</td>
            <td><span class="pay-pill dh-slate">${escHtml(p.method||'—')}</span></td>
            <td>
              <span class="pay-pill ${sHue}">
                ${sLabel==='Paid'?'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>':''}
                ${sLabel}
              </span>
              ${payIsOverdue(p)?'<div style="font-size:10px;font-weight:700;color:var(--red);margin-top:3px">Overdue</div>':''}
            </td>
            <td class="pay-col-x">${admFee>0?`<span class="pay-money">${fmtPKR(admFee)}</span>`:'<span class="pay-dash">—</span>'}</td>
            <td class="pay-col-x">${extras.length?`<div class="pay-extra">${extras.map(c=>`${c.label?escHtml(c.label)+':':''}<b>${fmtPKR(c.amount)}</b>`).join('')}</div>`:'<span class="pay-dash">—</span>'}</td>
            <td class="pay-col-x">${conc>0?`<div class="pay-extra">${concD?escHtml(concD)+':':''}<b>−${fmtPKR(conc)}</b></div>`:'<span class="pay-dash">—</span>'}</td>
            <td class="pay-col-act">
              <div class="pay-acts">
                <button class="pay-act dh-blue"  onclick="event.stopPropagation();showEditPaymentModal('${p.id}')" title="View / edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/></svg></button>
                <button class="pay-act dh-green" onclick="event.stopPropagation();printReceipt('${p.id}')" title="Receipt"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg></button>
                <button class="pay-act dh-red"   onclick="event.stopPropagation();deletePayment('${p.id}')" title="Delete"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
              </div>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>

    ${payPager(_pg)}
  </div>`;
}

// Footer: page-size picker, range readout and the numbered pager.
function payPager(pg) {
  const btn = (label, target, o) => {
    o = o || {};
    if (o.disabled) return `<button disabled>${label}</button>`;
    if (o.active)   return `<button class="is-on">${label}</button>`;
    return `<button onclick="gotoPage(payFilter,'payments',${target})">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1) + (lo>2?'<span class="pay-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page});
  if (hi < pages) nums += (hi<pages-1?'<span class="pay-pager__gap">…</span>':'') + btn(String(pages), pages);

  return `<div class="pay-foot">
    <div class="pay-foot__size">
      Show
      <select onchange="payFilter.pageSize=Number(this.value);payFilter.page=1;renderPage('payments')">
        ${[10,30,50,100].map(n=>`<option value="${n}" ${payFilter.pageSize===n?'selected':''}>${n}</option>`).join('')}
      </select>
      entries
    </div>
    <div class="pay-foot__info">${pg.total?`Showing ${pg.from} to ${pg.to} of ${pg.total} entries`:'No entries'}</div>
    <div class="pay-pager">
      ${btn('«',1,{disabled:page<=1})}
      ${btn('‹',page-1,{disabled:page<=1})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages})}
      ${btn('»',pages,{disabled:page>=pages})}
    </div>
  </div>`;
}

/* ── Payments v5 — toolbar / selection behaviour ─────────────────────────── */
function paySetStatus(s) {
  payFilter.status = (payFilter.status === s) ? 'All' : s;   // click again to clear
  payFilter.page = 1;
  renderPage('payments');
}

function payResetFilters() {
  payFilter.status='All'; payFilter.method='All'; payFilter.room='All'; payFilter.month='All';
  payFilter.search=''; payFilter.showAll=false; payFilter.unpaidOnly=false; payFilter.page=1;
  paySelected.clear();
  renderPage('payments');
}

function payTogglePop(ev) {
  if (ev) ev.stopPropagation();
  const p = document.getElementById('pay-pop'); if (!p) return;
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', function (e) {
  const p = document.getElementById('pay-pop');
  if (p && p.style.display === 'block' && e.target.closest && !e.target.closest('#pay-pop')) p.style.display = 'none';
});

function payToggleRow(id) {
  if (paySelected.has(id)) paySelected.delete(id); else paySelected.add(id);
  renderPage('payments');
}
function payToggleAll(on) {
  paginate(payFiltered(), payFilter).slice.forEach(p => {
    if (on) paySelected.add(p.id); else paySelected.delete(p.id);
  });
  renderPage('payments');
}

// Bulk mark-paid reuses the same arithmetic as the single-row action, including
// the partialPayments installment log, so a bulk settle is indistinguishable
// from settling each row by hand.
async function payBulkMarkPaid() {
  const ids = [...paySelected];
  const targets = DB.payments.filter(p => ids.includes(p.id) && p.status !== 'Paid');
  if (!targets.length) { toast('Nothing to settle — every selected row is already paid', 'info'); return; }
  showConfirm(`Mark ${targets.length} payment${targets.length>1?'s':''} as paid?`,
    `This collects the outstanding balance on each selected row and stamps today's date.`, async () => {
      targets.forEach(p => {
        const prevUnpaid = Number(p.unpaid) || 0;
        p.amount = (Number(p.amount)||0) + prevUnpaid;
        p.unpaid = 0;
        p.status = 'Paid';
        p.paidDate = today();
        if (!p.partialPayments) p.partialPayments = [];
        if (prevUnpaid > 0) p.partialPayments.push({
          date: today(), amount: prevUnpaid, method: p.method || 'Cash',
          collectedBy: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Warden',
          note: 'Pending cleared (bulk)'
        });
      });
      await saveDB();
      paySelected.clear();
      renderPage('payments');
      toast(`${targets.length} payment${targets.length>1?'s':''} marked paid`, 'success');
    });
}

function payBulkExport() {
  const ids = [...paySelected];
  const rows = [['Student','Room','Month','Rent/Mo','Amount Paid','Unpaid','Method','Status','Adm.Fee','Extra Charges','Concession','Date']];
  payFiltered().filter(p => ids.includes(p.id)).forEach(p => {
    const admFee = Number(p.admissionFee||p.fee||0);
    const extras = (p.extraCharges||[]).filter(c=>Number(c.amount)>0).map(c=>(c.label?c.label+' ':'')+c.amount).join('; ');
    const conc   = Number(p.concession||p.discount||0);
    rows.push([p.studentName||'','#'+(p.roomNumber||''),p.month||'',
      p.monthlyRent||p.totalRent||p.amount||0,
      p.amount||0, p.unpaid||0, p.method||'', payStatusOf(p),
      admFee||'', extras||'', conc||'', p.date||'']);
  });
  downloadCSV(rows, 'Payments_Selected.csv');
}


// Export the currently filtered + sorted payments to CSV. (Mirrors renderPayments' filter/sort.)
function exportPaymentsCSV() {
  const mo = thisMonth();
  // Reuses payFiltered() — the export and the table can no longer drift apart,
  // which they previously could since each kept its own copy of the filter.
  const rows=[['Student','Room','Month','Rent/Mo','Amount Paid','Unpaid','Method','Status','Adm.Fee','Extra Charges','Concession','Date']];
  payFiltered().forEach(p=>{
    const _paf=Number(p.admissionFee||p.fee||0);
    const _pex=(p.extraCharges||[]).filter(c=>Number(c.amount)>0).map(c=>(c.label?c.label+' ':'')+c.amount).join('; ');
    const _pc=Number(p.concession||p.discount||0);
    rows.push([p.studentName||'','#'+(p.roomNumber||''),p.month||'',p.monthlyRent||p.totalRent||p.amount||0,p.amount||0,p.unpaid||0,p.method||'',payStatusOf(p),_paf||'',_pex||'',_pc||'',p.date||'']);
  });
  downloadCSV(rows, 'Payments_'+(payFilter.month!=='All'?String(payFilter.month).replace(/\s+/g,'_'):payFilter.showAll?'AllMonths':mo)+'.csv');
}

async function generateMonthlyRents() {
  // FIX: use thisMonthLabel() — locale-safe, matches how all payment records store month strings.
  // Previously used toLocaleString('default',…) which can return different formats per device locale,
  // breaking the duplicate-guard check and generating duplicate entries on non-en-US systems.
  const mo=thisMonthLabel();
  const active=DB.students.filter(t=>t.status==='Active');
  let added=0;
  active.forEach(t=>{
    if(!DB.payments.some(p=>p.studentId===t.id&&_payMatchesMonth(p,thisMonth()))){
      const room=DB.rooms.find(r=>r.id===t.roomId);
      DB.payments.push({id:'p_'+uid(),collectedBy:CUR_USER?CUR_USER.name:'Auto',studentId:t.id,studentName:t.name,roomId:t.roomId,roomNumber:room?.number||'',amount:0,monthlyRent:t.rent,totalRent:t.rent,unpaid:t.rent,admissionFee:0,extraCharges:[],extraTotal:0,concession:0,concessionDesc:'',discount:0,method:t.paymentMethod||'Cash',month:mo,date:today(),dueDate:'',status:'Pending',notes:'Auto-generated',paidDate:''});
      added++;
    }
  });
  await saveDB(); renderPage('payments');
  toast(added>0?`Generated ${added} payment records`:'All students already have records for this month', added>0?'success':'info');
}
async function markPaymentPaid(id) {
  const p = DB.payments.find(x => x.id === id); if (!p) return;
  const prevUnpaid = Number(p.unpaid) || 0;
  const prevPaid   = Number(p.amount) || 0;
  p.amount   = prevPaid + prevUnpaid;
  p.unpaid   = 0;
  p.discount = p.discount || 0;
  p.status   = 'Paid';
  p.paidDate = today();
  const collectionNote = prevUnpaid > 0 ? `Remaining ${fmtPKR(prevUnpaid)} collected on ${today()}` : '';
  if (collectionNote) p.notes = p.notes ? p.notes + ' | ' + collectionNote : collectionNote;
  // Log installment in partialPayments history
  if (!p.partialPayments) p.partialPayments = [];
  if (prevUnpaid > 0) {
    p.partialPayments.push({
      date: today(),
      amount: prevUnpaid,
      method: p.method || 'Cash',
      collectedBy: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Warden',
      note: 'Pending cleared'
    });
  }
  await saveDB();
  renderPage(currentPage);
  toast('Payment marked as paid — ' + fmtPKR(p.amount) + ' total collected', 'success');
}

// FIX Issue 3: Called from student modal — refreshes the student modal directly
// instead of calling renderPage (which fights with the modal re-open)
async function markPaymentPaidFromStudentView(payId, studentId) {
  const p = DB.payments.find(x => x.id === payId); if (!p) return;
  const prevUnpaid = Number(p.unpaid) || 0;
  const prevPaid   = Number(p.amount) || 0;
  p.amount   = prevPaid + prevUnpaid;
  p.unpaid   = 0;
  p.discount = p.discount || 0;
  p.status   = 'Paid';
  p.paidDate = today();
  const collectionNote = prevUnpaid > 0 ? `Remaining ${fmtPKR(prevUnpaid)} collected on ${today()}` : '';
  if (collectionNote) p.notes = p.notes ? p.notes + ' | ' + collectionNote : collectionNote;
  if (!p.partialPayments) p.partialPayments = [];
  if (prevUnpaid > 0) {
    p.partialPayments.push({
      date: today(), amount: prevUnpaid,
      method: p.method || 'Cash',
      collectedBy: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Warden',
      note: 'Pending cleared'
    });
  }
  await saveDB();
  toast('Payment marked as paid — ' + fmtPKR(p.amount) + ' total collected', 'success');
  showViewStudentModal(studentId); // FIX: refresh student modal directly, no renderPage conflict
}
async function deletePayment(id) {
  showConfirm('Delete payment record?','This cannot be undone.',async ()=>{
    DB.payments=DB.payments.filter(x=>x.id!==id);
    await saveDB(); renderPage('payments'); toast('Payment deleted','info');
  });
}
async function deletePaymentFromStudentView(payId, studentId) {
  showConfirm('Delete this payment record?','This will remove it from the student\'s financial history permanently.',async ()=>{
    DB.payments=DB.payments.filter(x=>x.id!==payId);
    await saveDB();
    toast('Payment record deleted','info');
    showViewStudentModal(studentId); // refresh the modal
  });
}

// ════════════════════════════════════════════════════════════════════════════
// STUDENT SEARCH FOR PAYMENT MODAL
// ════════════════════════════════════════════════════════════════════════════
function filterStudentDropdown(query) {
  const results = document.getElementById('student-search-results');

  // Typing after a pick invalidates that pick — otherwise the hidden id keeps
  // pointing at a student whose name is no longer in the box. (Programmatic
  // writes in selectStudentForPayment() do not fire `input`, so this only ever
  // runs for real edits.)
  const hidden = document.getElementById('f-pstudent');
  if (hidden && hidden.value) {
    hidden.value = '';
    const info = document.getElementById('selected-student-info');
    if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  }

  if (!query.trim()) { results.style.display='none'; return; }
  const q = query.toLowerCase();
  let matches = DB.students.filter(t => {
    if (t.status !== 'Active') return false;
    const room = DB.rooms.find(r => r.id === t.roomId);
    return t.name?.toLowerCase().includes(q) ||
           t.id?.toLowerCase().includes(q) ||
           String(room?.number||'').includes(q) ||
           t.cnic?.includes(q) ||
           t.phone?.includes(q);
  });
  matches = studentsByRoom(matches).slice(0, 10);
  if (!matches.length) {
    results.innerHTML = `<div style="padding:12px 14px;color:var(--text3);font-size:13px;border-bottom:1px solid var(--border)">No registered student found</div>
      <div onclick="useManualNameEntry('${escHtml(query).replace(/'/g,"\\'")}');" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;color:var(--blue);font-size:13px;font-weight:600;transition:background 0.15s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span style="font-size:18px">✍️</span>
        <span>Use "<strong>${escHtml(query)}</strong>" as manual name</span>
      </div>`;
    results.style.display = 'block';
    return;
  }
  results.innerHTML = matches.map(t => {
    const room = DB.rooms.find(r => r.id === t.roomId);
    const rtype = room ? DB.settings.roomTypes.find(x => x.id === room.typeId) : null;
    const nm = String(t.name||'?');
    const ini = nm.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
    return `<div class="pf-hit" onclick="selectStudentForPayment('${t.id}')">
      <div class="pf-hit__av ${payAvatarHue(nm)}">${escHtml(ini)}</div>
      <div style="flex:1;min-width:0">
        <div class="pf-hit__name">${escHtml(nm)}</div>
        <div class="pf-hit__sub">Room #${escHtml(String(room?.number||'?'))} · ${escHtml(rtype?.name||'')} · ${escHtml(t.phone||'No phone')}</div>
      </div>
      <div class="pf-hit__rent">${fmtPKR(t.rent)}</div>
    </div>`;
  }).join('');
  results.style.display = 'block';
  // No auto-select while typing. It used to fire as soon as one student matched
  // and the query passed 4 characters, overwriting the box mid-word with
  // "Name — Room #N" — the rest of what was being typed then landed on the end
  // ("Abid Ali — Room #2Ali"), and on deletion it rewrote the label faster than
  // backspace could remove it. submitPayment() still resolves a typed name to a
  // single matching student on submit, so nothing convenient was lost.
}

function useManualNameEntry(name) {
  document.getElementById('f-pstudent').value = '__manual__';
  document.getElementById('f-pstudent-search').value = name;
  document.getElementById('student-search-results').style.display = 'none';
  const info = document.getElementById('selected-student-info');
  info.style.display = 'block';
  info.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
    <span style="font-size:18px">✍️</span>
    <div>
      <div style="font-size:13px;font-weight:700;color:var(--amber)">Manual entry: <strong>${escHtml(name)}</strong></div>
      <div style="font-size:11px;color:var(--text3)">Not linked to a registered student — fill in amounts manually below.</div>
    </div>
  </div>`;
}

function selectStudentForPayment(studentId) {
  const t = DB.students.find(x => x.id === studentId);
  if (!t) return;
  const room = DB.rooms.find(r => r.id === t.roomId);
  const rtype = room ? DB.settings.roomTypes.find(x => x.id === room.typeId) : null;
  // BUG FIX: Derive the most current rent. t.rent is updated by settings changes.
  // Additionally fall back to rtype.defaultRent so even edge-cases (e.g. _rentManuallySet
  // blocked a settings propagation) still show the latest room-type fee in the modal.
  const currentRent = t.rent || rtype?.defaultRent || 16000;
  document.getElementById('f-pstudent').value = studentId;
  document.getElementById('f-pstudent-search').value = t.name + ' — Room #' + (room?.number||'?');
  document.getElementById('student-search-results').style.display = 'none';
  if (document.getElementById('f-pamt')) { document.getElementById('f-pamt').value = currentRent; }
  if (document.getElementById('f-pconcession') && t.concession) {
    document.getElementById('f-pconcession').value = t.concession;
    if(t.concessionDesc && document.getElementById('f-pconcession-desc'))
      document.getElementById('f-pconcession-desc').value = t.concessionDesc;
  }
  recalcUnpaid();
  const info = document.getElementById('selected-student-info');
  info.style.display = 'block';
  info.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap">
    <div><span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Student ID</span><div style="font-weight:700;color:var(--text);font-family:var(--font-mono);font-size:12px">${escHtml(t.id)}</div></div>
    <div><span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Room</span><div style="font-weight:700;color:var(--accent-strong)">#${room?.number||'?'} · ${rtype?.name||''} · ${room?.floor||''} Floor</div></div>
    <div><span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Phone</span><div style="font-weight:600">${escHtml(t.phone||'—')}</div></div>
    <div><span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Monthly Rent</span><div style="font-weight:700;color:var(--green)">${fmtPKR(currentRent)}</div></div>
    <div><span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Address</span><div style="font-weight:600;color:var(--text2)">${escHtml(t.address || t.emergencyContact || 'No address on file')}</div></div>
  </div>`;
}

function recalcUnpaid() {
  const mr      = parseFloat(document.getElementById('f-pamt')?.value)||0;
  const extra   = getExtraChargesTotal();
  const admFee  = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const conc    = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const total   = Math.max(0, mr + extra + admFee - conc);
  // Cap paid amount — prevent accidental overpayment (e.g. 1600000 instead of 16000)
  const paidEl  = document.getElementById('f-ppaid');
  let pa = parseFloat(paidEl?.value)||0;
  if(pa > total && total > 0) {
    pa = total;
    if(paidEl) { paidEl.value = total; paidEl.style.border = '2px solid var(--amber)'; paidEl.title = 'Capped to total due: ' + total; }
    const capWarn = document.getElementById('f-ppaid-cap-warn');
    if(!capWarn && paidEl) {
      const w = document.createElement('div');
      w.id = 'f-ppaid-cap-warn';
      w.style.cssText = 'font-size:11px;color:var(--amber);margin-top:3px;font-weight:600';
      w.textContent = '⚠️ Amount capped to total due (' + Number(total).toLocaleString('en-PK') + ' PKR). Check for typos.';
      paidEl.parentNode.appendChild(w);
    }
  } else {
    if(paidEl) { paidEl.style.border = ''; paidEl.title = ''; }
    const capWarn = document.getElementById('f-ppaid-cap-warn');
    if(capWarn) capWarn.remove();
  }
  const u = Math.max(0, total - pa);
  const el = document.getElementById('f-punpaid');
  if(el){ el.value=u; el.style.color=u>0?'var(--red)':u===0?'var(--green)':'var(--amber)'; }
  const st = document.getElementById('f-pstat');
  if(st) st.value = (pa >= total && total > 0) ? 'Paid' : 'Pending';
  const etEl = document.getElementById('extra-charges-total');
  if(etEl) etEl.textContent = 'PKR ' + Number(extra).toLocaleString('en-PK');

  // v5 modal: keep the running-totals strip above the footer in sync. Guarded
  // so the older forms that also call recalcUnpaid() are unaffected.
  const setSum = (id, val) => { const n = document.getElementById(id); if (n) n.textContent = fmtPKR(val); };
  setSum('pf-sum-rent',  mr);
  setSum('pf-sum-extra', extra);
  setSum('pf-sum-paid',  pa);
  setSum('pf-sum-due',   u);
}

function getExtraChargesTotal() {
  let total = 0;
  document.querySelectorAll('.extra-charge-amt-input').forEach(inp=>{
    total += parseFloat(inp.value)||0;
  });
  return total;
}

function getExtraChargesData() {
  const items = [];
  const rows = document.querySelectorAll('.extra-charge-row');
  rows.forEach(row=>{
    const desc = row.querySelector('.extra-charge-desc-input')?.value?.trim() || '';
    const amt  = parseFloat(row.querySelector('.extra-charge-amt-input')?.value)||0;
    if(amt>0) items.push({label: desc||'Extra Charge', description: desc, amount: amt});
  });
  return items;
}

function addExtraChargeRow(descOrLabel='', amount='') {
  const list = document.getElementById('extra-charges-list');
  if(!list) return;
  const rowId = 'ecr_' + Date.now();
  const div = document.createElement('div');
  div.className = 'extra-charge-row';
  div.id = rowId;
  div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  div.innerHTML = `
    <input class="form-control extra-charge-amt-input charge-amt" type="number" placeholder="Amount (PKR)" value="${amount}" min="0" style="width:120px;flex-shrink:0" oninput="recalcUnpaid()">
    <input class="form-control extra-charge-desc-input" type="text" placeholder="Description (e.g. Cooler Fee)" value="${escHtml(descOrLabel)}" style="flex:1" oninput="recalcUnpaid()">
    <button type="button" class="rm-btn" onclick="document.getElementById('${rowId}').remove();recalcUnpaid()" title="Remove" style="flex-shrink:0">✕</button>
  `;
  list.appendChild(div);
  recalcUnpaid();
}

function showAddPaymentForStudent(studentId) {
  const t = DB.students.find(s => s.id === studentId);
  if (!t) return;
  const room = DB.rooms.find(r => r.id === t.roomId);
  const pmOpts = DB.settings.paymentMethods.map(m => `<option ${m===t.paymentMethod?'selected':''}>${m}</option>`).join('');
  showModal('modal-md', `💳 Add Payment — ${escHtml(t.name)}`, `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;border-radius:9px;background:rgba(46,201,138,0.12);display:flex;align-items:center;justify-content:center;font-size:18px">${icon('student','sm')}</div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${escHtml(t.name)}</div>
        <div style="font-size:11px;color:var(--text3)">Room #${room ? room.number : '—'} · ${room ? getRoomType(room).name : '—'} · ${escHtml(t.phone || '—')}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:13px;font-weight:800;color:var(--green)">${fmtPKR(t.rent)}</div>
        <div style="font-size:10px;color:var(--text3)">Monthly Rent</div>
      </div>
    </div>
    <input type="hidden" id="f-ps-studentId" value="${t.id}">
    <div class="form-grid">
      <div class="field"><label>Monthly Rent (PKR) *</label><input class="form-control" id="f-ps-amt" type="number" value="${t.rent||16000}" oninput="recalcUnpaidPS()"></div>
      <div class="field"><label>Admission Fee (PKR)</label><input class="form-control" id="f-ps-admfee" type="number" placeholder="0" min="0" value="0" oninput="recalcUnpaidPS()"></div>
      <div class="field"><label>Amount Paid (PKR)</label><input class="form-control" id="f-ps-paid" type="number" placeholder="Enter amount paid" value="" oninput="recalcUnpaidPS()"></div>
      <!-- Concession + Extra Charges -->
      <div class="field col-full" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">Concession / Discount (PKR)</label>
            <input class="form-control" id="f-ps-concession" type="number" placeholder="0" min="0" value="" oninput="recalcUnpaidPS()">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">Concession Description <span style="font-size:10px;color:var(--text3);font-weight:400">(optional)</span></label>
            <input class="form-control" id="f-ps-concession-desc" placeholder="e.g. Scholarship, Hardship…">
          </div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
          <label style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px">
            <span>➕ Extra Charges</span>
            <button type="button" class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 9px" onclick="addExtraChargeRow()">+ Add</button>
          </label>
          <div id="extra-charges-list"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:6px 8px;background:var(--bg4);border:1px solid var(--border);border-radius:6px;font-size:12px">
            <span style="color:var(--text3)">Total Extra:</span>
            <span id="extra-charges-total" style="font-weight:800;color:var(--amber)">PKR 0</span>
          </div>
        </div>
      </div>
      <div class="field"><label>Unpaid / Remaining (PKR)</label><input class="form-control" id="f-ps-unpaid" type="number" value="${t.rent||16000}" readonly style="color:var(--red);font-weight:700;background:var(--bg3)" title="Auto-calculated: Rent + Extra − Concession − Paid"></div>
      <div class="field"><label>Payment Method</label><select class="form-control" id="f-ps-method">${pmOpts}</select></div>
      <div class="field"><label>Month</label><input class="form-control" id="f-ps-month" value="${thisMonthLabel()}"></div>
      <div class="field"><label>Status</label>
        <select class="form-control" id="f-ps-stat">
          <option value="Paid">✓ Paid</option>
          <option value="Pending" selected>⏳ Unpaid / Pending</option>
        </select>
      </div>
      <div class="field"><label>Payment Date</label><input class="form-control cdp-trigger" id="f-ps-date" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field"><label>Due Date</label><input class="form-control cdp-trigger" id="f-ps-due" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${(()=>{const d=new Date();d.setDate(6);return d.toISOString().split('T')[0];})()}"></div>
      <div class="field col-full"><label>Notes</label><input class="form-control" id="f-ps-notes" placeholder="Optional notes…"></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-warning" onclick="printAndSubmitPaymentForStudent()" style="background:var(--amber);color:#000;border:none;font-weight:700"><span class="micon" style="font-size:15px;vertical-align:middle">print</span> Print & Add Payment</button><button class="btn btn-primary" onclick="submitPaymentForStudent()"><span class=\"micon\" style=\"font-size:15px\">payments</span> Add Payment</button>`);
  // Auto-fill from existing pending payment for current month; warn if already fully paid
  const curMonthLabel = thisMonthLabel();
  const existingPaid    = DB.payments.find(p=>p.studentId===t.id&&p.status==='Paid'&&p.month===curMonthLabel);
  const existingPending = DB.payments.find(p=>p.studentId===t.id&&p.status==='Pending'&&p.month===curMonthLabel);
  // Inject already-paid warning banner at the top of the modal body
  if (existingPaid) {
    const mb = document.querySelector('#modal-container .modal-body');
    if (mb) {
      const banner = document.createElement('div');
      banner.id = 'already-paid-banner';
      banner.style.cssText = 'background:rgba(224,82,82,0.12);border:1.5px solid rgba(224,82,82,0.5);border-radius:10px;padding:11px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px';
      banner.innerHTML = icon('warning','sm')+'<div><div style="font-weight:800;color:var(--red);font-size:13px">Already Paid for '+escHtml(curMonthLabel)+'</div><div style="font-size:11px;color:var(--text2);margin-top:2px">'+escHtml(t.name)+' has already paid <strong>'+fmtPKR(existingPaid.amount)+'</strong> (Collected by: '+(existingPaid.collectedBy||'—')+'). Adding another payment will create a duplicate record.</div></div>';
      mb.insertBefore(banner, mb.firstChild);
      // U10 FIX: clear stale banner when user changes the month
      const monthInput = document.getElementById('f-ps-month');
      if (monthInput) monthInput.addEventListener('input', function() {
        const b = document.getElementById('already-paid-banner');
        if (b) b.remove();
      }, { once: true });
    }
  }
  if (existingPending) {
    const rentEl  = document.getElementById('f-ps-amt');
    const paidEl  = document.getElementById('f-ps-paid');
    const unpaidEl= document.getElementById('f-ps-unpaid');
    const statEl  = document.getElementById('f-ps-stat');
    const notesEl = document.getElementById('f-ps-notes');
    // BUG FIX: Always use the student's CURRENT rent (t.rent) as the authoritative value.
    // existingPending.monthlyRent may be stale if the warden updated fees in Settings after
    // this pending record was created. t.rent is always kept in sync by updateRoomType/applyRent.
    const currentRentPS = t.rent || existingPending.monthlyRent || existingPending.amount || 16000;
    if (rentEl)   rentEl.value   = currentRentPS;
    if (paidEl)   paidEl.value   = existingPending.amount || 0;
    if (unpaidEl) unpaidEl.value = existingPending.unpaid != null ? existingPending.unpaid : (currentRentPS - (existingPending.amount||0));
    if (statEl)   statEl.value   = existingPending.status;
    if (notesEl)  notesEl.value  = existingPending.notes || '';
    toast('Loaded existing pending payment data', 'info');
  }
}
function recalcUnpaidPS() {
  const rent  = parseFloat(document.getElementById('f-ps-amt')?.value) || 0;
  const admFee = parseFloat(document.getElementById('f-ps-admfee')?.value) || 0;
  const paid  = parseFloat(document.getElementById('f-ps-paid')?.value) || 0;
  const conc  = parseFloat(document.getElementById('f-ps-concession')?.value) || 0;
  var extra = 0;
  document.querySelectorAll('#extra-charges-list .extra-charge-amt-input').forEach(function(el){ extra += parseFloat(el.value)||0; });
  var etEl = document.getElementById('extra-charges-total');
  if(etEl) etEl.textContent = 'PKR ' + extra.toLocaleString('en-PK');
  const unpaid = Math.max(0, rent + extra + admFee - conc - paid);
  const unpaidEl = document.getElementById('f-ps-unpaid');
  if(unpaidEl) { unpaidEl.value = unpaid; unpaidEl.style.color = unpaid > 0 ? 'var(--red)' : 'var(--green)'; }
}
async function submitPaymentForStudent() {
  const studentId   = document.getElementById('f-ps-studentId')?.value || '';
  const t           = DB.students.find(s => s.id === studentId);
  if (!t) { toast('Student not found', 'error'); return; }
  // Duplicate guard: block double-charging for the same month
  const enteredMonth = document.getElementById('f-ps-month')?.value || '';

  // Case 1 — already fully Paid (hard block, offer override)
  const alreadyPaid = DB.payments.find(p => p.studentId === studentId && p.status === 'Paid' && p.month === enteredMonth);
  if (alreadyPaid && !window._forcePayPS) {
    window._forcePayPS = true;
    showConfirm(
      '⚠️ Already Paid',
      `${escHtml(t.name)} already has a <strong>Paid</strong> record for <strong>${escHtml(enteredMonth)}</strong> (${fmtPKR(alreadyPaid.amount)}).<br><br>Adding another entry will charge this student twice. Are you absolutely sure?`,
      function(){ submitPaymentForStudent(); window._forcePayPS = false; },
      function(){ window._forcePayPS = false; }
    );
    return;
  }

  // Case 2 — a Pending record already exists for this month
  // (common scenario: payment auto-created at admission is still Pending,
  // then warden accidentally opens Add Payment again for the same month)
  const alreadyPending = DB.payments.find(p => p.studentId === studentId && p.status === 'Pending' && p.month === enteredMonth);
  if (alreadyPending && !window._updatePendingPS) {
    window._updatePendingPS = true;
    const existingPaidAmt = Number(alreadyPending.amount || 0);
    const existingUnpaid  = Number(alreadyPending.unpaid != null ? alreadyPending.unpaid : (alreadyPending.monthlyRent - existingPaidAmt));
    showConfirm(
      '⚠️ Pending Record Already Exists',
      `${escHtml(t.name)} already has a <strong>Pending</strong> payment for <strong>${escHtml(enteredMonth)}</strong>.<br>`
      + `<div style="margin:10px 0;background:var(--bg3);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.8">`
      + `Existing → Paid: <strong>${fmtPKR(existingPaidAmt)}</strong> &nbsp;|&nbsp; Unpaid: <strong style="color:var(--red)">${fmtPKR(existingUnpaid)}</strong></div>`
      + `<strong>Update the existing record</strong> instead of creating a duplicate?<br><small style="color:var(--text3)">Click <em>OK</em> to update · <em>Cancel</em> to abort</small>`,
      async function() {
        // ── UPDATE existing pending record in-place ──────────────────
        const newMonthlyRent = parseFloat(document.getElementById('f-ps-amt')?.value)  || alreadyPending.monthlyRent || 0;
        const newPaid        = parseFloat(document.getElementById('f-ps-paid')?.value) || 0;
        const newUnpaid      = Math.max(0, newMonthlyRent - newPaid);
        const newStatus      = document.getElementById('f-ps-stat')?.value  || 'Pending';
        const newMethod      = document.getElementById('f-ps-method')?.value || alreadyPending.method || 'Cash';
        const newDate        = document.getElementById('f-ps-date')?.value   || today();
        const newNotes       = document.getElementById('f-ps-notes')?.value  || '';

        alreadyPending.monthlyRent = newMonthlyRent;
        alreadyPending.totalRent   = newMonthlyRent;
        alreadyPending.amount      = newPaid;
        alreadyPending.unpaid      = newUnpaid;
        alreadyPending.method      = newMethod;
        alreadyPending.status      = newStatus;
        alreadyPending.date        = newDate;
        alreadyPending.paidDate    = newStatus === 'Paid' ? newDate : (alreadyPending.paidDate || '');
        alreadyPending.collectedBy = CUR_USER?.name || alreadyPending.collectedBy || '';
        if (newNotes) alreadyPending.notes = newNotes;

        logActivity('Payment Updated', `${t.name} — ${enteredMonth} (existing record updated, no duplicate created)`, 'Finance');
        await saveDB(); closeModal(); renderPage(currentPage);
        toast(`Payment updated for ${t.name} — no duplicate created`, 'success');
        window._updatePendingPS = false;
      },
      function() { window._updatePendingPS = false; }
    );
    return;
  }
  window._forcePayPS  = false;
  window._updatePendingPS = false;
  const room        = DB.rooms.find(r => r.id === t.roomId);
  const monthlyRent = parseFloat(document.getElementById('f-ps-amt')?.value) || 0;
  const admissionFeePS = parseFloat(document.getElementById('f-ps-admfee')?.value) || 0;
  const paidAmount  = parseFloat(document.getElementById('f-ps-paid')?.value) || 0;
  const concessionPS = parseFloat(document.getElementById('f-ps-concession')?.value) || 0;
  const concessionDescPS = (document.getElementById('f-ps-concession-desc')?.value || '').trim();
  const extraChargesPS = getExtraChargesData();
  const extraTotalPS   = extraChargesPS.reduce((s,c)=>s+c.amount,0);
  const totalDuePS  = Math.max(0, monthlyRent + extraTotalPS + admissionFeePS - concessionPS);
  const unpaid      = Math.max(0, totalDuePS - paidAmount);
  const status      = document.getElementById('f-ps-stat')?.value || 'Pending';
  // FIX 8a: persist rent change on student record
  if (monthlyRent > 0 && t.rent !== monthlyRent) { t.rent = monthlyRent; }
  const _newPayIdPS = 'p_' + uid();
  DB.payments.push({
    id: _newPayIdPS,
    collectedBy: CUR_USER?.name || '',
    studentId,
    studentName: t.name || '',
    roomId: t.roomId || '',
    roomNumber: room?.number || '',
    amount: paidAmount,
    monthlyRent, unpaid,
    admissionFee: admissionFeePS,
    extraCharges: extraChargesPS, extraTotal: extraTotalPS,
    concession: concessionPS, concessionDesc: concessionDescPS,
    discount: concessionPS,
    totalRent: monthlyRent,
    method: document.getElementById('f-ps-method')?.value || 'Cash',
    month: document.getElementById('f-ps-month')?.value || '',
    status,
    date: document.getElementById('f-ps-date')?.value || today(),
    dueDate: document.getElementById('f-ps-due')?.value || '',
    paidDate: status === 'Paid' ? document.getElementById('f-ps-date')?.value || today() : '',
    notes: document.getElementById('f-ps-notes')?.value || '',
  });
  await saveDB(); closeModal();
  renderPage(currentPage);
  toast(`Payment recorded for ${t.name}`, 'success');
  logActivity('Payment Added', `${t.name} — ${document.getElementById('f-ps-month')?.value}`, 'Finance');
  if (window._printAfterSave) { window._printAfterSave = false; setTimeout(()=>printReceipt(_newPayIdPS), 350); }
}
function showAddPaymentModal() {
  const activeStudents=DB.students.filter(t=>t.status==='Active');
  const pmOpts=DB.settings.paymentMethods.map(m=>`<option>${m}</option>`).join('');

  // Summary stats for header
  const totalPaid=DB.payments.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount),0);
  const totalPending=DB.payments.filter(p=>p.status==='Pending').reduce((s,p)=>s+Number(p.amount),0);

  showModal('modal-md',
  `<span class="pf-head"><b>Add / Edit Payment</b><s>Record a new payment or update existing payment details.</s></span>`,
  `
    <!-- 1. SEARCH STUDENT -->
    <div class="pf-sec">
      <div class="pf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-12 0"/><circle cx="12" cy="8" r="5"/></svg>
        1. Search Student
      </div>
      <div style="position:relative;min-width:0">
        <div class="pf-wrapin">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input class="pf-in" id="f-pstudent-search" placeholder="Type student name, room number or phone…" oninput="filterStudentDropdown(this.value)" autocomplete="off">
          <svg class="pf-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <input type="hidden" id="f-pstudent" value="">
        <div class="pf-results" id="student-search-results"></div>
      </div>
      <div class="pf-picked" id="selected-student-info"></div>
    </div>

    <!-- 2. PAYMENT DETAILS -->
    <div class="pf-sec">
      <div class="pf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
        2. Payment Details
      </div>
      <div class="pf-grid">
        <div class="pf-f"><label for="f-pamt">Monthly Rent (PKR)<span class="req">*</span></label>
          <input class="pf-in" id="f-pamt" type="number" placeholder="Enter monthly rent" value="" oninput="recalcUnpaid()"></div>
        <div class="pf-f"><label for="f-ppaid">Amount Paid (PKR)<span class="req">*</span></label>
          <input class="pf-in" id="f-ppaid" type="number" placeholder="Enter amount paid" value="" oninput="recalcUnpaid()"></div>
        <div class="pf-f"><label for="f-padmfee">Admission Fee (PKR)</label>
          <input class="pf-in" id="f-padmfee" type="number" placeholder="0" min="0" value="" oninput="recalcUnpaid()"></div>
      </div>

      <div class="pf-grid" style="margin-top:13px;grid-template-columns:1fr 1fr;align-items:start">
        <div>
          <div class="pf-f"><label for="f-pconcession">Concession / Discount (PKR)</label>
            <input class="pf-in" id="f-pconcession" type="number" placeholder="0" min="0" value="" oninput="recalcUnpaid()"></div>
          <div class="pf-f" style="margin-top:13px"><label for="f-pconcession-desc">Concession Description <span class="opt">(optional)</span></label>
            <input class="pf-in" id="f-pconcession-desc" placeholder="e.g. Scholarship, Hardship, Early payment…"></div>
        </div>
        <div class="pf-extra">
          <div class="pf-extra__h">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/></svg>
            Extra Charges / Add-ons
            <button type="button" class="pf-extra__add" onclick="addExtraChargeRow()">+ Add</button>
          </div>
          <div id="extra-charges-list"></div>
          <div class="pf-extra__total"><span>Total Extra:</span><b id="extra-charges-total">PKR 0</b></div>
        </div>
      </div>
    </div>

    <!-- 3. PAYMENT INFORMATION -->
    <div class="pf-sec">
      <div class="pf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></svg>
        3. Payment Information
      </div>
      <div class="pf-grid">
        <div class="pf-f"><label for="f-punpaid">Unpaid / Remaining (PKR)</label>
          <input class="pf-in pf-in--due" id="f-punpaid" type="number" value="0" readonly
            title="Auto-calculated: Rent + Admission Fee + Extra Charges − Concession − Paid"></div>
        <div class="pf-f"><label for="f-pmethod">Payment Method<span class="req">*</span></label>
          <select class="pf-sel" id="f-pmethod">${pmOpts}</select></div>
        <div class="pf-f"><label for="f-pmonth">Month<span class="req">*</span></label>
          <input class="pf-in" id="f-pmonth" value="${escHtml(thisMonthLabel())}"></div>
      </div>
      <div class="pf-grid" style="margin-top:13px">
        <div class="pf-f"><label for="f-pdate">Payment Date<span class="req">*</span></label>
          <div class="pf-wrapin">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
            <input class="pf-in cdp-trigger" id="f-pdate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}">
          </div></div>
        <div class="pf-f"><label for="f-pdue">Due Date</label>
          <div class="pf-wrapin">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
            <input class="pf-in cdp-trigger" id="f-pdue" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${(()=>{const d=new Date();d.setDate(6);return d.toISOString().split('T')[0];})()}">
          </div></div>
        <div class="pf-f"><label for="f-pstat">Status<span class="req">*</span></label>
          <select class="pf-sel" id="f-pstat">
            <option value="Paid">Paid</option>
            <option value="Pending" selected>Unpaid / Pending</option>
          </select></div>
      </div>
    </div>

    <!-- 4. NOTES -->
    <div class="pf-sec">
      <div class="pf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        4. Notes
      </div>
      <textarea class="pf-ta" id="f-pnotes-main" maxlength="250" placeholder="Add any notes about this payment…" oninput="pfCount()"></textarea>
      <div class="pf-count" id="f-pnotes-count">0/250</div>
    </div>

    <!-- RUNNING TOTALS — kept in sync by recalcUnpaid() -->
    <div class="pf-sum">
      <div class="pf-sum__c dh-blue">
        <span class="pf-sum__i"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/></svg></span>
        <div><div class="pf-sum__l">Monthly Rent</div><div class="pf-sum__v" id="pf-sum-rent">PKR 0</div></div>
      </div>
      <div class="pf-sum__c dh-violet">
        <span class="pf-sum__i"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg></span>
        <div><div class="pf-sum__l">Total Extra</div><div class="pf-sum__v" id="pf-sum-extra">PKR 0</div></div>
      </div>
      <div class="pf-sum__c dh-green">
        <span class="pf-sum__i"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg></span>
        <div><div class="pf-sum__l">Total Paid</div><div class="pf-sum__v" id="pf-sum-paid">PKR 0</div></div>
      </div>
      <div class="pf-sum__c dh-red">
        <span class="pf-sum__i"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span>
        <div><div class="pf-sum__l">Remaining</div><div class="pf-sum__v" id="pf-sum-due">PKR 0</div></div>
      </div>
    </div>`,
  `<button class="pf-btn" onclick="closeModal()">Cancel</button>
   <button class="pf-btn" onclick="printAndSubmitAddPayment()">
     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
     Print &amp; Add Payment</button>
   <button class="pf-btn pf-btn--go" onclick="submitAddPayment()">
     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
     Add Payment</button>`);
  recalcUnpaid();   // paint the running totals from the initial (empty) state
}

// Notes counter for the payment modal.
function pfCount() {
  const ta = document.getElementById('f-pnotes-main'), el = document.getElementById('f-pnotes-count');
  if (ta && el) el.textContent = ta.value.length + '/250';
}
async function submitAddPayment() {
  // Try to auto-select if only one student matches the search text
  const searchEl = document.getElementById('f-pstudent-search');
  const hiddenEl = document.getElementById('f-pstudent');
  if(hiddenEl && !hiddenEl.value && searchEl && searchEl.value.trim()) {
    const q = searchEl.value.trim().toLowerCase();
    const matches = DB.students.filter(t => t.status==='Active' && (
      t.name?.toLowerCase().includes(q) || t.id?.toLowerCase().includes(q) ||
      String(DB.rooms.find(r=>r.id===t.roomId)?.number||'').includes(q) ||
      t.cnic?.includes(q) || t.phone?.includes(q)
    ));
    if(matches.length===1) selectStudentForPayment(matches[0].id);
  }
  const studentIdRaw = document.getElementById('f-pstudent')?.value || '';
  const manualName = searchEl?.value?.trim() || '';
  const isManual = studentIdRaw === '__manual__';
  if(!studentIdRaw) {
    toast('Please search and select a student or enter a name manually','error');
    document.getElementById('f-pstudent-search')?.focus();
    return;
  }
  // Duplicate guard: block double-charging for the same month
  if (!isManual && !window._forcePayAP) {
    const enteredMonth2 = document.getElementById('f-pmonth')?.value || '';
    const tName = DB.students.find(s=>s.id===studentIdRaw)?.name || 'This student';

    // Case 1 — already fully Paid for this month (HARD BLOCK — no override)
    const alreadyPaid2 = DB.payments.find(p => p.studentId === studentIdRaw && p.status === 'Paid' && p.month === enteredMonth2);
    if (alreadyPaid2) {
      window._forcePayAP = false;
      toast(escHtml(tName) + ' has ALREADY PAID for ' + escHtml(enteredMonth2) + ' (' + fmtPKR(alreadyPaid2.amount) + '). No duplicate allowed.', 'error');
      return;
    }

    // Case 2 — a Pending / partial payment already exists for this month
    // (happens when warden records a payment at admission and then accidentally
    // opens Add Payment again for the same student & month)
    const alreadyPending2 = DB.payments.find(p => p.studentId === studentIdRaw && p.status === 'Pending' && p.month === enteredMonth2);
    if (alreadyPending2 && !window._updatePendingAP) {
      window._updatePendingAP = true;
      // Build a friendly detail line showing what already exists
      const existingPaidAmt = Number(alreadyPending2.amount || 0);
      const existingUnpaid  = Number(alreadyPending2.unpaid  != null ? alreadyPending2.unpaid : (alreadyPending2.monthlyRent - existingPaidAmt));
      showConfirm(
        '⚠️ Pending Record Already Exists',
        `${escHtml(tName)} already has a <strong>Pending</strong> payment for <strong>${escHtml(enteredMonth2)}</strong>.<br>`
        + `<div style="margin:10px 0;background:var(--bg3);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.8">`
        + `Existing → Paid: <strong>${fmtPKR(existingPaidAmt)}</strong> &nbsp;|&nbsp; Unpaid: <strong style="color:var(--red)">${fmtPKR(existingUnpaid)}</strong></div>`
        + `<strong>Update the existing record</strong> instead of creating a duplicate?<br><small style="color:var(--text3)">Click <em>OK</em> to update · <em>Cancel</em> to abort</small>`,
        async function() {
          // ── UPDATE existing pending record in-place ──────────────────
          const newMonthlyRent = parseFloat(document.getElementById('f-pamt')?.value)  || alreadyPending2.monthlyRent || 0;
          const newPaid        = parseFloat(document.getElementById('f-ppaid')?.value) || 0;
          const newExtraCharges= getExtraChargesData();
          const newExtraTotal  = newExtraCharges.reduce((s,c)=>s+c.amount,0);
          const newTotalDue    = newMonthlyRent + newExtraTotal;
          const newUnpaid      = Math.max(0, newTotalDue - newPaid);
          const newStatus      = document.getElementById('f-pstat')?.value || 'Pending';
          const newMethod      = document.getElementById('f-pmethod')?.value || alreadyPending2.method || 'Cash';
          const newDate        = document.getElementById('f-pdate')?.value  || today();
          const newNotes       = document.getElementById('f-pnotes-main')?.value || document.getElementById('f-pnotes')?.value || '';

          // Merge into the existing record
          alreadyPending2.monthlyRent  = newMonthlyRent;
          alreadyPending2.totalRent    = newMonthlyRent;
          alreadyPending2.amount       = newPaid;
          alreadyPending2.unpaid       = newUnpaid;
          alreadyPending2.extraCharges = newExtraCharges;
          alreadyPending2.extraTotal   = newExtraTotal;
          alreadyPending2.method       = newMethod;
          alreadyPending2.status       = newStatus;
          alreadyPending2.date         = newDate;
          alreadyPending2.paidDate     = newStatus === 'Paid' ? newDate : (alreadyPending2.paidDate || '');
          alreadyPending2.collectedBy  = CUR_USER?.name || alreadyPending2.collectedBy || '';
          if (newNotes) alreadyPending2.notes = newNotes;

          logActivity('Payment Updated', `${escHtml(tName)} — ${enteredMonth2} (existing record updated, no duplicate created)`, 'Finance');
          await saveDB(); closeModal(); renderPage('payments');
          toast(`Payment updated for ${tName} — no duplicate created`, 'success');
          window._updatePendingAP = false;
        },
        function() { window._updatePendingAP = false; }
      );
      return;
    }
    window._updatePendingAP = false;
  }
  window._forcePayAP = false;
  const monthlyRent = parseFloat(document.getElementById('f-pamt')?.value)||0;
  const paidAmount  = parseFloat(document.getElementById('f-ppaid')?.value)||0;
  const extraCharges = getExtraChargesData();
  const extraTotal  = extraCharges.reduce((s,c)=>s+c.amount,0);
  const admissionFee  = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const concession    = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const concessionDesc= (document.getElementById('f-pconcession-desc')?.value||'').trim();
  const totalDue    = Math.max(0, monthlyRent + extraTotal + admissionFee - concession);
  const totalRent   = monthlyRent;                // display rent = base only
  const unpaid      = Math.max(0, totalDue - paidAmount);
  const status      = document.getElementById('f-pstat')?.value || 'Pending';
  const t    = isManual ? null : DB.students.find(x=>x.id===studentIdRaw);
  const room = t ? DB.rooms.find(r=>r.id===t?.roomId) : null;
  const finalName = isManual ? manualName : (t?.name||'');
  const _newPayId = 'p_'+uid();
  DB.payments.push({
    id: _newPayId,
    collectedBy: CUR_USER?.name || '',  // BUG FIX: guard against null CUR_USER
    studentId: isManual ? '' : studentIdRaw,
    studentName: finalName,
    roomId: t?.roomId||'',
    roomNumber: room?.number||'',
    amount: paidAmount,
    monthlyRent, unpaid,
    extraCharges, extraTotal,
    admissionFee, concession, concessionDesc,
    totalRent,
    method: document.getElementById('f-pmethod')?.value||'Cash',
    month: document.getElementById('f-pmonth')?.value||'',
    status,
    date: document.getElementById('f-pdate')?.value||today(),
    dueDate: document.getElementById('f-pdue')?.value||'',
    paidDate: status==='Paid'?document.getElementById('f-pdate')?.value||today():'',
    notes: document.getElementById('f-pnotes-main')?.value || document.getElementById('f-pnotes')?.value || '',
  });
  logActivity('Payment Added', `${finalName||'student'} — ${document.getElementById('f-pmonth')?.value||''}`, 'Finance');
  await saveDB(); closeModal(); renderPage('payments');
  toast(`Payment recorded for ${finalName||'student'}`,'success');
  if (window._printAfterSave) { window._printAfterSave = false; setTimeout(()=>printReceipt(_newPayId), 350); }
}
function printAndSubmitAddPayment() {
  window._printAfterSave = true;
  submitAddPayment();
}
function printAndSubmitPaymentForStudent() {
  window._printAfterSave = true;
  submitPaymentForStudent();
}
function showEditPaymentModal(id) {
  const p = DB.payments.find(x=>x.id===id); if(!p) return;
  const t = DB.students.find(s=>s.id===p.studentId);
  const room = t ? DB.rooms.find(r=>r.id===t.roomId) : null;
  const rtype = room ? DB.settings.roomTypes.find(x=>x.id===room.typeId) : null;
  const pmOpts = DB.settings.paymentMethods.map(m=>`<option ${p.method===m?'selected':''}>${m}</option>`).join('');
  // BUG FIX: Use the student's CURRENT rent (t.rent) as the primary value.
  // p.monthlyRent is the rent at the time the payment was recorded and may be stale
  // if the warden has since updated fees in Settings. t.rent is always kept in sync.
  const monthlyRent  = t?.rent || p.monthlyRent || p.totalRent || 0;
  const paidAmount   = p.amount || 0;
  const admissionFee = p.admissionFee || p.fee || 0;
  const concession   = p.concession || p.discount || 0;
  const concessionDesc = p.concessionDesc || p.discountDesc || '';
  const unpaid = p.unpaid != null ? p.unpaid : Math.max(0, monthlyRent + admissionFee - concession - paidAmount);
  showModal('modal-lg', `✏️ Edit Payment — ${escHtml(p.studentName||'Student')}`, `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div style="width:38px;height:38px;border-radius:9px;background:var(--accent-dim);color:var(--accent-strong);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;flex-shrink:0">${(p.studentName||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;color:var(--text)">${escHtml(p.studentName||'—')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">Room <span style="color:var(--accent-strong);font-weight:700">#${room?.number||'?'}</span>${rtype?` · ${escHtml(rtype.name)}`:''}${t?.phone?` · ${escHtml(t.phone)}`:''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:900;color:var(--green)">${fmtPKR(t?.rent||monthlyRent)}</div>
        <div style="font-size:9px;color:var(--text3)">Monthly Rent</div>
      </div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Monthly Rent (PKR) *</label><input class="form-control" id="f-pamt" type="number" value="${monthlyRent}" oninput="recalcUnpaid()"></div>
      <div class="field"><label>Amount Paid (PKR)</label><input class="form-control" id="f-ppaid" type="number" value="${paidAmount||''}" oninput="recalcUnpaid()"></div>
      <div class="field"><label>Admission Fee (PKR)</label><input class="form-control" id="f-padmfee" type="number" placeholder="0" min="0" value="${admissionFee||0}" oninput="recalcUnpaid()"></div>
      <!-- Concession + Extra Charges side by side -->
      <div class="field col-full" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start">
        <!-- LEFT: Concession PKR + Description stacked -->
        <div style="display:flex;flex-direction:column;gap:8px">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">Concession / Discount (PKR)</label>
            <input class="form-control" id="f-pconcession" type="number" placeholder="0" min="0" value="${concession||0}" oninput="recalcUnpaid()">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">Concession Description <span style="font-size:10px;color:var(--text3);font-weight:400">(optional)</span></label>
            <input class="form-control" id="f-pconcession-desc" placeholder="e.g. Scholarship, Hardship…" value="${escHtml(concessionDesc)}">
          </div>
        </div>
        <!-- RIGHT: Extra Charges panel -->
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
          <label style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px">
            <span>➕ Extra Charges</span>
            <button type="button" class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 9px" onclick="addExtraChargeRow()">+ Add</button>
          </label>
          <div id="extra-charges-list"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:6px 8px;background:var(--bg4);border:1px solid var(--border);border-radius:6px;font-size:12px">
            <span style="color:var(--text3)">Total Extra:</span>
            <span id="extra-charges-total" style="font-weight:800;color:var(--amber)">PKR ${Number(p.extraTotal||0).toLocaleString('en-PK')}</span>
          </div>
        </div>
      </div>
      <div class="field"><label>Unpaid / Remaining (PKR)</label><input class="form-control" id="f-punpaid" type="number" value="${unpaid||0}" readonly style="color:${unpaid>0?'var(--red)':'var(--green)'};font-weight:700;background:var(--bg3)"></div>
      <div class="field"><label>Status</label>
        <select class="form-control" id="f-pstat">
          <option value="Paid" ${unpaid===0&&monthlyRent>0?'selected':''}>✓ Paid</option>
          <option value="Pending" ${unpaid>0||!monthlyRent?'selected':''}>⏳ Unpaid / Pending</option>
        </select>
      </div>
      <div class="field"><label>Payment Method</label><select class="form-control" id="f-pmethod">${pmOpts}</select></div>
      <div class="field"><label>Month</label><input class="form-control" id="f-pmonth" value="${escHtml(p.month||'')}"></div>
      <div class="field"><label>Payment Date</label><input class="form-control cdp-trigger" id="f-pdate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${p.date||''}"></div>
      <div class="field"><label>Due Date</label><input class="form-control cdp-trigger" id="f-pdue" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${p.dueDate||''}"></div>
      <div class="field col-full"><label>Notes</label><textarea class="form-control" id="f-pnotes" rows="2">${escHtml(p.notes||'')}</textarea></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-danger btn-sm" onclick="deletePayment('${id}')">🗑 Delete</button>
   <button class="btn btn-primary" onclick="submitEditPayment('${id}')">💾 Save Changes</button>`);
  setTimeout(function() {
    const ecl = document.getElementById('extra-charges-list');
    if(ecl && p.extraCharges && p.extraCharges.length) {
      ecl.innerHTML = '';
      p.extraCharges.forEach(c => addExtraChargeRow(c.description||c.desc||c.label||'', c.amount));
    }
    recalcUnpaid();
  }, 50);
}
async function submitEditPayment(id) {
  const p = DB.payments.find(x=>x.id===id); if(!p) return;
  const monthlyRent  = parseFloat(document.getElementById('f-pamt')?.value)||0;
  const paidAmount   = parseFloat(document.getElementById('f-ppaid')?.value)||0;
  const admissionFee = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const concession   = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const concessionDesc = (document.getElementById('f-pconcession-desc')?.value||'').trim();
  const extraCharges = getExtraChargesData();
  const extraTotal   = extraCharges.reduce((s,c)=>s+c.amount, 0);
  const totalDue     = Math.max(0, monthlyRent + extraTotal + admissionFee - concession);
  const unpaid       = Math.max(0, totalDue - paidAmount);
  const prevPaid     = Number(p.amount) || 0;
  if (!p.partialPayments) p.partialPayments = [];
  if (paidAmount > prevPaid) {
    p.partialPayments.push({
      date: document.getElementById('f-pdate')?.value || today(),
      amount: paidAmount - prevPaid,
      method: document.getElementById('f-pmethod')?.value || 'Cash',
      collectedBy: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Warden',
      note: 'Updated payment'
    });
  }
  p.monthlyRent    = monthlyRent;
  p.totalRent      = monthlyRent;
  p.amount         = paidAmount;
  p.admissionFee   = admissionFee;
  p.concession     = concession;
  p.concessionDesc = concessionDesc;
  p.discount       = concession;
  p.extraCharges   = extraCharges;
  p.extraTotal     = extraTotal;
  p.unpaid         = unpaid;
  p.method         = document.getElementById('f-pmethod')?.value || p.method;
  p.month          = document.getElementById('f-pmonth')?.value  || p.month;
  p.status         = document.getElementById('f-pstat')?.value   || p.status;
  p.date           = document.getElementById('f-pdate')?.value   || p.date;
  p.dueDate        = document.getElementById('f-pdue')?.value    || p.dueDate;
  p.paidDate       = p.status==='Paid' ? p.date : '';
  p.notes          = document.getElementById('f-pnotes')?.value  || '';
  // FIX 8a: If warden changed monthly rent, persist it on the student record
  // so all future auto-generated payments use the new rent.
  if (p.studentId) {
    const _st = DB.students.find(s => s.id === p.studentId);
    if (_st && monthlyRent > 0 && _st.rent !== monthlyRent) {
      _st.rent = monthlyRent;
    }
  }
  logActivity('Payment Updated', `${p.studentName||''} — ${p.month||''}`, 'Finance');
  await saveDB();
  toast('Payment updated','success');
  if(_returnStudentId) {
    var _sid = _returnStudentId; _returnStudentId = null;
    showViewStudentModal(_sid);
  } else {
    closeModal(); renderPage('payments');
  }
}


// ════════════════════════════════════════════════════════════════════════════
// EXPENSES
// ════════════════════════════════════════════════════════════════════════════
let expFilter = {cat:'All', search:'', showAll: false, month:'', page:1, pageSize:30, sortKey:'date', sortDir:'desc'};

// ════════════════════════════════════════════════════════════════════════════
// PAYMENTS TABLE — DRAG TO PAN
//
// The three secondary money columns live past the right edge. Grab any empty
// part of the table and drag to bring them in, instead of hunting for the
// scrollbar. Everything is delegated off `document`, because renderPayments()
// replaces #content wholesale on every save and re-render — a handler bound to
// the wrapper itself would be thrown away with it.
// ════════════════════════════════════════════════════════════════════════════
(function initPayDragPan() {
  const SLOP = 5;                 // px before a press counts as a drag, so clicks survive
  let wrap = null, startX = 0, startLeft = 0, pressed = false, panned = false;
  let swallowClick = false;

  const overflows = el => el.scrollWidth > el.clientWidth + 1;
  const closest = (t, sel) => (t && t.closest) ? t.closest(sel) : null;

  // Only advertise the grab cursor when there is somewhere to go.
  document.addEventListener('pointerover', e => {
    const w = closest(e.target, '.pay-table-wrap');
    if (w) w.classList.toggle('is-pannable', overflows(w));
  });

  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const w = closest(e.target, '.pay-table-wrap');
    if (!w || !overflows(w)) return;
    // Never start a pan on something the user is trying to operate.
    if (closest(e.target, 'button, input, select, textarea, a, label')) return;
    wrap = w; startX = e.clientX; startLeft = w.scrollLeft;
    pressed = true; panned = false;
  });

  document.addEventListener('pointermove', e => {
    if (!pressed || !wrap) return;
    const dx = e.clientX - startX;
    if (!panned) {
      if (Math.abs(dx) < SLOP) return;
      panned = true;
      wrap.classList.add('is-dragging');
    }
    wrap.scrollLeft = startLeft - dx;
    e.preventDefault();
  });

  function endPan() {
    if (wrap) wrap.classList.remove('is-dragging');
    // A pan ends with a click event on whatever was under the cursor. Swallow
    // exactly that one, or letting go over a row would also activate it.
    if (panned) swallowClick = true;
    pressed = false; panned = false; wrap = null;
  }
  document.addEventListener('pointerup', endPan);
  document.addEventListener('pointercancel', endPan);

  document.addEventListener('click', e => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
})();
