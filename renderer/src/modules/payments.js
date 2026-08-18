/* ─── HOSTIX — PAYMENTS MODULE ─────────────────────────────────────────────
   Contains: renderPayments, generateMonthlyRents, markPaymentPaid,
             deletePayment, filterStudentDropdown, selectStudentForPayment,
             recalcUnpaid, renderAddPayment, openAddPayment, submitAddPayment,
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

/* ── STUDENT SNAPSHOT SYNC ────────────────────────────────────────────────────
   A payment stores the student's name and room number at the moment it is
   written, so receipts and archived records stay readable after a student is
   deleted. The cost is that correcting a student's name left every existing
   payment — and therefore the payments table, the CSVs, the reports and every
   PDF built from them — showing the old one forever. Editing a student now
   pushes the correction down onto their records, and the same pass runs once
   at boot so history already on disk is repaired too.

   Records typed in manually carry no studentId; those keep the name as typed. */
function syncStudentSnapshots(t) {
  if (!t || !t.id) return 0;
  const room = (DB.rooms || []).find(r => r.id === t.roomId);
  const roomNo = room ? room.number : null;
  let touched = 0;
  const apply = (rec, nameField) => {
    if (!rec || rec.studentId !== t.id) return;
    if (t.name && rec[nameField] !== t.name) { rec[nameField] = t.name; touched++; }
    // The room is only stamped forward while the debt is still open. A settled
    // record is a receipt of what happened, and the student did live in that
    // room when they paid.
    if (roomNo != null && rec.status !== 'Paid' && String(rec.roomNumber||'') !== String(roomNo)) {
      rec.roomId = t.roomId; rec.roomNumber = roomNo; touched++;
    }
  };
  (DB.payments      || []).forEach(p => apply(p, 'studentName'));
  (DB.cancellations || []).forEach(c => apply(c, 'studentName'));
  return touched;
}

/* Boot-time repair for data written before syncStudentSnapshots() existed.
   Indexed by id so it stays O(payments) rather than O(payments × students). */
function repairStudentSnapshots() {
  const byId = new Map((DB.students || []).map(s => [s.id, s]));
  let touched = 0;
  (DB.payments || []).forEach(p => {
    const t = p.studentId ? byId.get(p.studentId) : null;
    if (!t) return;                                   // manual entry or deleted student
    if (t.name && p.studentName !== t.name) { p.studentName = t.name; touched++; }
  });
  (DB.cancellations || []).forEach(c => {
    const t = c.studentId ? byId.get(c.studentId) : null;
    if (!t) return;
    if (t.name && c.studentName !== t.name) { c.studentName = t.name; touched++; }
  });
  return touched;
}

/* ── BOOT REPAIR: PAYMENT COMPOSITION ────────────────────────────────────────
   Records already on disk that describe themselves wrongly. Nothing here moves
   money: `amount` and `unpaid` are what the warden collected and what the
   student owes, and they are treated as fact throughout. Only the description
   of how a total was made up is corrected, and only where the record's own
   numbers prove what the right description is.

   Three things are repaired.

   1. RENT DRIFT. Records raised before rent and mess were split carry the
      all-in figure in `monthlyRent` (8,000 + 6,500 = 14,500) AND a separate
      `messCharge` of 6,500 beside it. Add those up and the month reads 21,000
      while the student was only ever billed 14,500 — the mess is counted twice.
      Now that the Add Payment form loads a month's existing record and
      recomputes the total from it, that phantom 6,500 shows up on screen as a
      balance nobody owes. Detected by the exact pre-split signature
      (monthlyRent === rent + mess) plus a booked total that matches the all-in
      composition, and repaired by putting the split rent back in `monthlyRent`.

   2. MESS FLAGGED ON A RENT-ONLY MONTH. The mirror image: the rent half is
      already correct, the record carries a mess line and says it is included,
      but the total booked is rent alone. The tick is what is wrong, so it is
      turned off — the amount stays as the configured-but-unbilled figure, which
      is the same convention resolveCharges() uses. Where EVERY mess-carrying
      record a student has is booked rent-only, the student is taken off the
      mess too, since that is what their whole history says.

   3. INSTALMENT TRAILS THAT NEVER HAPPENED. `partialPayments` is the receipt's
      payment history. Two bugs wrote into it: a clear-the-balance action that
      could fire twice, and the Add Payment merge that REPLACED `amount`
      instead of adding to it — leaving records that claim two full collections
      on a month where nothing was collected at all. Only what is provably
      false is removed: byte-identical duplicate entries, and every entry on a
      record where nothing has ever been collected. A trail that merely
      disagrees is left alone — it cannot be reconstructed, and the receipt is
      what stops printing a contradiction (see buildReceiptHTML).            */
function repairPaymentComposition() {
  const fixed = { drift: 0, messFlag: 0, students: 0, dupEntries: 0, ghostTrails: 0 };
  const byId = new Map((DB.students || []).map(s => [s.id, s]));
  const num  = v => Number(v || 0);

  // What the record says was billed, mess included as its own line.
  const bookedOf   = p => num(p.amount) + num(p.unpaid);
  const withoutMess = p => num(p.monthlyRent) + num(p.extraTotal) + num(p.admissionFee)
                         - num(p.concession != null ? p.concession : p.discount);

  const rentOnlyMonths = new Map();   // studentId -> {mess:0, rentOnly:0}

  (DB.payments || []).forEach(p => {
    if (!p) return;
    const mess = num(p.messCharge);
    const carriesMess = mess > 0 && p.messIncluded !== false;

    if (carriesMess && p.studentId) {
      const tally = rentOnlyMonths.get(p.studentId) || { mess: 0, rentOnly: 0 };
      tally.mess++;
      // A month can be rent-only in two ways, and both are in the live data:
      // the tick is off, or the mess is billed and then cancelled by a
      // concession of exactly the same amount. Net contribution of the mess to
      // what the student owed is zero either way, so both count.
      if (num(p.concession != null ? p.concession : p.discount) === mess) tally.rentOnly++;
      rentOnlyMonths.set(p.studentId, tally);
    }

    if (carriesMess && bookedOf(p) === withoutMess(p) && bookedOf(p) > 0) {
      const t = p.studentId ? byId.get(p.studentId) : null;
      const c = t ? resolveCharges(t) : null;
      // 1 — the pre-split all-in signature: the mess is already inside the rent.
      if (c && c.rent > 0 && num(p.monthlyRent) === c.rent + mess) {
        p.monthlyRent = c.rent;
        p.totalRent   = c.rent;
        fixed.drift++;
      } else {
        // 2 — the rent half is right and the month was billed without mess.
        p.messIncluded = false;
        fixed.messFlag++;
        if (p.studentId) {
          const tally = rentOnlyMonths.get(p.studentId);
          if (tally) tally.rentOnly++;
        }
      }
    }

    // 3 — trails that cannot be true.
    const hist = p.partialPayments;
    if (Array.isArray(hist) && hist.length) {
      if (num(p.amount) === 0 && p.status !== 'Paid') {
        fixed.ghostTrails += hist.length;
        p.partialPayments = [];
      } else {
        const seen = new Set(), kept = [];
        hist.forEach(x => {
          const k = [x && x.date, num(x && x.amount), x && x.method,
                     x && x.note, x && x.collectedBy].join('|');
          if (seen.has(k)) return;
          seen.add(k); kept.push(x);
        });
        if (kept.length !== hist.length) {
          fixed.dupEntries += hist.length - kept.length;
          p.partialPayments = kept;
        }
      }
    }
  });

  // A student every one of whose mess-carrying months was billed rent-only is
  // not on the mess, whatever their record says.
  rentOnlyMonths.forEach((tally, sid) => {
    if (!tally.mess || tally.rentOnly !== tally.mess) return;
    const t = byId.get(sid);
    if (t && t.messOptIn !== false) { t.messOptIn = false; fixed.students++; }
  });

  return fixed;
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
// A record from a month EARLIER than `mo` that still has money owing on it.
// These are the balances a warden would otherwise have to go back a month to
// find, which is why they are shown alongside the current month by default.
function payIsArrear(p, mo) {
  if (Number(p.unpaid || 0) <= 0) return false;
  if (payStatusOf(p) === 'Paid') return false;
  const k = _payMonthKey(p);
  return !!k && k < mo;
}

function payFiltered() {
  const mo = thisMonth();
  let pays = DB.payments.filter(p => {
    // Month: an explicit pick wins; otherwise fall back to the this-month /
    // all-months scope toggle in the Filters popover. In the this-month scope
    // an older record that is still unpaid rides along as an arrear, so it can
    // be collected here instead of only in the month it was raised.
    if (payFilter.month !== 'All') { if (String(p.month || '') !== payFilter.month) return false; }
    else if (!payFilter.showAll) {
      if (!_payMatchesMonth(p, mo) && !(payFilter.arrears && payIsArrear(p, mo))) return false;
    }

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

  // Which of the visible rows are carried-over debt rather than this month's
  // billing. Only meaningful in the default this-month scope; an explicit month
  // pick or "all months" has no separate arrears notion.
  const _arrearScope = payFilter.month === 'All' && !payFilter.showAll && payFilter.arrears;
  const isArrear = p => _arrearScope && payIsArrear(p, mo);
  const nArrears = pays.filter(isArrear).length;
  const arrearsAmt = pays.filter(isArrear).reduce((s,p)=>s+Number(p.unpaid||0),0);

  // ── Stat strip figures — all computed from the CURRENT filtered list, so the
  //    cards always describe exactly what the table below is showing.
  //    "Total Collected" is the one exception: money banked against an older
  //    month was collected in that month, and adding it here would re-create
  //    the cross-month mixing that arrears rows exist to expose, not hide.
  const total=pays.filter(p=>!isArrear(p)).reduce((s,p)=>s+Number(p.amount),0);
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
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">Total outstanding</span>
        ${nArrears>0?`<span class="pay-stat__delta dh-red" title="${nArrears} unpaid record${nArrears>1?'s':''} carried over from earlier months">incl. ${fmtPKR(arrearsAmt)} arrears</span>`:''}
      </div>
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
          <label class="pay-pop__row"><input type="checkbox" ${payFilter.arrears?'checked':''}
            onchange="payFilter.arrears=this.checked;payFilter.page=1;renderPage('payments')"
            title="Show unpaid balances from earlier months alongside this month, so they can be collected here"> Carry forward unpaid earlier months</label>
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
          const arrear = isArrear(p);
          const nm     = String(p.studentName||'?');
          const ini    = nm.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
          return `<tr class="${picked?'is-picked dh-blue':''}${arrear?' is-arrear':''}">
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
            <td>
              ${escHtml(p.month||'—')}
              ${arrear?'<div class="pay-arrear-tag" title="Unpaid balance carried over from an earlier month — collect it here">Arrears</div>':''}
            </td>
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
                <button class="pay-act dh-blue"  onclick="event.stopPropagation();showEditPaymentModal('${p.id}')" title="Edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
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
  payFilter.arrears=true;   // carrying unpaid balances forward is the default, not a filter to clear
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
  // Everyone still living here — including a student leaving at month end, who
  // owes this month like anyone else.
  const active=DB.students.filter(isResident);
  let added=0, skipped=0;
  active.forEach(t=>{
    if(!DB.payments.some(p=>p.studentId===t.id&&_payMatchesMonth(p,thisMonth()))){
      const room=DB.rooms.find(r=>r.id===t.roomId);
      // Price comes from resolveCharges() — the student's own override, else
      // the room type's rate in Settings. Reading t.rent/t.mess straight off
      // the student made this the one screen that billed from a stale copy: a
      // rent rise in Settings reached the Add Payment form at once, while the
      // button the warden presses on the 1st for all 50 students carried on
      // raising the old figure, and a student with no pinned rent was billed 0.
      const c      = resolveCharges(t);
      const messOn = c.messOptIn;
      const mess   = c.messBilled;
      const due    = c.rent + mess;
      // A bill of nothing is not a bill. Raising one hides the real problem —
      // an unpriced room type — behind a row that reads as settled.
      if (!c.configured || due <= 0) { skipped++; return; }
      DB.payments.push({id:'p_'+uid(),collectedBy:CUR_USER?CUR_USER.name:'Auto',studentId:t.id,studentName:t.name,roomId:t.roomId,roomNumber:room?.number||'',amount:0,monthlyRent:c.rent,totalRent:c.rent,messCharge:mess,messIncluded:messOn,unpaid:due,admissionFee:0,extraCharges:[],extraTotal:0,concession:0,concessionDesc:'',discount:0,method:t.paymentMethod||'Cash',month:mo,date:today(),dueDate:'',status:'Pending',notes:'Auto-generated',paidDate:''});
      added++;
    }
  });
  await saveDB(); renderPage('payments');
  if (added) logActivity('Monthly Rents Generated', `${added} record(s) for ${mo}`
    + (skipped ? ` · ${skipped} student(s) skipped — no charge configured` : ''), 'Finance');
  toast(added>0
      ? `Generated ${added} payment records for ${mo}`
        + (skipped ? ` · ${skipped} skipped, no rent configured for their room type` : '')
      : skipped>0
        ? `Nothing generated — ${skipped} student(s) have no rent configured. Set it in Settings → Rent & Mess.`
        : 'All students already have records for this month',
    added>0 ? 'success' : skipped>0 ? 'warning' : 'info');
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
  if (prevUnpaid > 0) logActivity('Payment Collected',
    `${p.studentName||'—'} — ${p.month||'—'} · ${fmtPKR(prevUnpaid)} balance cleared`, 'Finance');
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
  if (prevUnpaid > 0) logActivity('Payment Collected',
    `${p.studentName||'—'} — ${p.month||'—'} · ${fmtPKR(prevUnpaid)} balance cleared`, 'Finance');
  await saveDB();
  toast('Payment marked as paid — ' + fmtPKR(p.amount) + ' total collected', 'success');
  showViewStudentModal(studentId); // FIX: refresh student modal directly, no renderPage conflict
}
async function deletePayment(id) {
  const _dp = DB.payments.find(x => x.id === id);
  showConfirm('Delete payment record?','This cannot be undone.',async ()=>{
    // Logged before the record goes. Every other money action writes to the
    // activity log; the one that destroys money was the only one that did not,
    // so a receipt could be removed from a shared warden screen with nothing
    // left to say it had ever existed.
    if (_dp) logActivity('Payment Deleted',
      `${_dp.studentName||'—'} — ${_dp.month||'—'} · ${fmtPKR(_dp.amount)} collected, ${fmtPKR(_dp.unpaid)} outstanding`, 'Finance');
    DB.payments=DB.payments.filter(x=>x.id!==id);
    await saveDB(); renderPage('payments'); toast('Payment deleted','info');
  });
}
async function deletePaymentFromStudentView(payId, studentId) {
  const _dpv = DB.payments.find(x => x.id === payId);
  showConfirm('Delete this payment record?','This will remove it from the student\'s financial history permanently.',async ()=>{
    if (_dpv) logActivity('Payment Deleted',
      `${_dpv.studentName||'—'} — ${_dpv.month||'—'} · ${fmtPKR(_dpv.amount)} collected, ${fmtPKR(_dpv.unpaid)} outstanding`, 'Finance');
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
    if (!isResident(t)) return false;   // a student on notice still owes rent
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
      <div class="pf-hit__rent">${(() => {
        // t.rent is the per-student override and is empty for everyone priced
        // from Settings — which is nearly everyone — so this column read
        // "PKR 0" beside students who are charged 14,500 a month. Same resolver
        // as every other screen.
        const _c = resolveCharges(t);
        return _c.configured ? fmtPKR(_c.total) : '<span style="color:var(--red)">Not set</span>';
      })()}</div>
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
  // Every screen reads the monthly charge through resolveCharges() — student →
  // room → Settings. Nothing here invents a fallback amount.
  const c     = resolveCharges(t);
  const room  = c.room;
  const rtype = c.roomType;
  const currentRent = c.rent;
  const currentMess = c.mess;
  const messOn      = c.messOptIn;
  document.getElementById('f-pstudent').value = studentId;
  document.getElementById('f-pstudent-search').value = t.name + ' — Room #' + (room?.number||'?');
  document.getElementById('student-search-results').style.display = 'none';
  // f-prent is the redesigned modal's hidden half; f-pamt is the older visible
  // Room Rent box. Fill whichever this modal has.
  const rentEl = document.getElementById('f-prent') || document.getElementById('f-pamt');
  if (rentEl) rentEl.value = currentRent;
  const messAmtEl = document.getElementById('f-pmess');
  const messOnEl  = document.getElementById('f-pmess-on');
  if (messAmtEl) messAmtEl.value = currentMess;
  if (messOnEl)  messOnEl.checked = messOn;
  if (messOnEl || messAmtEl) pfMessToggle();
  pfPaintCharge();
  pfRenderLedger(t);
  pfRenderRecent(t);
  pfRefreshMonthOptions(studentId);   // their own arrear months join the picker
  pfReloadOutstandings();
  if (document.getElementById('f-pconcession') && t.concession) {
    document.getElementById('f-pconcession').value = t.concession;
    if(t.concessionDesc && document.getElementById('f-pconcession-desc'))
      document.getElementById('f-pconcession-desc').value = t.concessionDesc;
  }
  // Last, so a record already on file for this month overrides the student's
  // standing defaults rather than the other way round.
  pfLoadMonthContext();
  recalcUnpaid();
  const info = document.getElementById('selected-student-info');
  info.style.display = 'block';
  const _nm  = String(t.name || '?');
  const _ini = _nm.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const fld = (label, body) =>
    `<div class="pf-picked__f"><span class="pf-picked__l">${label}</span>${body}</div>`;
  info.innerHTML = `<div class="pf-picked__row">
    <div class="pf-picked__who">
      <div class="pf-picked__av ${payAvatarHue(_nm)}">${escHtml(_ini)}</div>
      <div style="min-width:0">
        <div class="pf-picked__n">${escHtml(_nm)}</div>
        <div class="pf-picked__r">Room #${escHtml(String(room?.number || '?'))}</div>
      </div>
    </div>
    ${fld('Student ID', `<div class="pf-picked__v" style="font-family:var(--font-mono);font-size:12px">${escHtml(t.id)}</div>`)}
    ${fld('Room', `<div class="pf-picked__v" style="color:var(--accent-strong)">#${escHtml(String(room?.number||'?'))} · ${escHtml(rtype?.name||'')}</div><div class="pf-picked__s">${escHtml(room?.floor||'')} Floor</div>`)}
    ${fld('Monthly Charge', `<div class="pf-picked__v" style="color:${c.configured?'var(--green)':'var(--red)'}">${c.configured?fmtPKR(c.total):'Not configured'}</div><div class="pf-picked__s">${chargesBreakdown(c)}</div>`)}
    ${fld('Address', `<div class="pf-picked__v" style="font-weight:600;color:var(--text2)">${escHtml(t.address || t.emergencyContact || 'No address on file')}</div>`)}
  </div>`;
}

/* ── SUMMARY ──────────────────────────────────────────────────────────────────
   The student's ledger at a glance: what they are charged, and what has
   actually been collected against it. Room Rent / Mess come from Settings;
   Extra, Paid and Pending are read off their payment records. */
function pfRenderLedger(t) {
  const box = document.getElementById('pf-ledger');
  if (!box) return;
  // Arrears owed for OTHER months — shown beside this payment so the warden can
  // see at a glance that there is older money outstanding.
  // The month being collected is not an arrear of itself — it was counted here,
  // so a part paid current month was announced as "outstanding from earlier
  // months" and the same balance appeared twice on one screen.
  const _lmNow = document.getElementById('f-pmonth')?.value || '';
  const arrears = t ? DB.payments
    .filter(p => p.studentId === t.id && p.status === 'Pending' && Number(p.unpaid) > 0
              && _normPayMonthLabel(p.month) !== _normPayMonthLabel(_lmNow))
    .reduce((s, p) => s + Number(p.unpaid || 0), 0) : 0;

  const cell = (label, id, hue, hint) =>
    `<div class="pf-ledger__c ${hue}"><div class="pf-ledger__l"${hint?` title="${hint}"`:''}>${label}</div>
       <div class="pf-ledger__v" id="${id}">PKR 0</div></div>`;

  box.style.display = '';
  box.innerHTML =
    `<div class="pf-ledger__t">Summary${arrears > 0
        ? ` <span style="color:var(--red);font-weight:800">· ${fmtPKR(arrears)} outstanding from earlier months</span>` : ''}</div>
     <div class="pf-ledger__row">
       ${cell('Room Rent', 'pf-sum-rent',  'dh-blue')}
       ${cell('Mess',      'pf-sum-mess',  'dh-amber')}
       ${cell('Extra',     'pf-sum-extra', 'dh-violet')}
       ${cell('Paid',      'pf-sum-paid',  'dh-green')}
       ${cell('Pending',   'pf-sum-due',   'dh-red', 'Remaining on this month after what has been paid')}
     </div>`;
  recalcUnpaid();
}

/* ── RECEIVE OUTSTANDINGS ─────────────────────────────────────────────────────
   Arrears from earlier months can be collected during any later month, but the
   money is posted back to the month it belongs to — the older record is the one
   that moves toward Paid. The current month's record is built from the Monthly
   Charge above and is not touched by anything entered here. */
function pfOutstandingRecords(studentId, excludeMonthLabel) {
  const norm = m => _normPayMonthLabel(m);
  const skip = norm(excludeMonthLabel);
  return DB.payments
    .filter(p => p.studentId === studentId && p.status === 'Pending'
      && Number(p.unpaid) > 0 && norm(p.month) !== skip)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Month labels are stored as free text ("August 2026"); compare them loosely so
// a stray case or space does not make the same month look like two.
function _normPayMonthLabel(m) {
  return String(m || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* ── MONTH PICKER ─────────────────────────────────────────────────────────────
   p.month is the key everything cross-month is matched on: the arrears panel,
   the month filter on the payments list, the dashboard. It used to be typed by
   hand, so one slip ("Augst 2026") created a month that nothing would ever line
   up with again — the arrear stayed invisible and the payment landed in a month
   that does not exist. The warden picks from a list instead.

   The list is a year back through next month, PLUS every month the student
   already has a record for. That second half matters: an arrear older than the
   window still has to be selectable or it could never be settled from here, and
   a label typed before this change is kept verbatim rather than silently
   rewritten into something the old records would no longer match.            */
const _PAY_MONTH_NAMES = ['january','february','march','april','may','june',
                          'july','august','september','october','november','december'];

function _payMonthLabelOf(d) {
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

// Sortable integer for a label. -1 for anything not in "<Month> <Year>" form,
// which keeps unrecognised labels in the list rather than dropping them.
function _payMonthOrder(label) {
  const m = _normPayMonthLabel(label).match(/^([a-z]+) (\d{4})$/);
  if (!m) return -1;
  const i = _PAY_MONTH_NAMES.indexOf(m[1]);
  return i < 0 ? -1 : Number(m[2]) * 12 + i;
}

/* Named apart from payMonthOptions() above on purpose: that one lists the months
   already IN the data to filter the payments table by, this one lists the months
   a payment may be RECORDED against — including ones with nothing behind them
   yet, which is most of the point. */
function payMonthPickerOptions(selected, studentId) {
  const now = new Date();
  const labels = [];
  for (let back = 12; back >= -1; back--) {
    labels.push(_payMonthLabelOf(new Date(now.getFullYear(), now.getMonth() - back, 1)));
  }
  if (studentId) {
    DB.payments.forEach(p => { if (p.studentId === studentId && p.month) labels.push(String(p.month)); });
  }
  if (selected) labels.push(String(selected));

  const seen = new Set(), list = [];
  labels.forEach(l => {
    const k = _normPayMonthLabel(l);
    if (k && !seen.has(k)) { seen.add(k); list.push(l); }
  });
  list.sort((a, b) => _payMonthOrder(b) - _payMonthOrder(a));   // newest first

  const sel = _normPayMonthLabel(selected);
  return list.map(l =>
    `<option value="${escHtml(l)}"${_normPayMonthLabel(l) === sel ? ' selected' : ''}>${escHtml(l)}</option>`
  ).join('');
}

/* The student's own arrear months are only known once a student is picked, so
   the page's picker is rebuilt then — keeping whatever month is already chosen. */
function pfRefreshMonthOptions(studentId) {
  const sel = document.getElementById('f-pmonth');
  if (!sel || sel.tagName !== 'SELECT') return;
  const keep = sel.value || thisMonthLabel();
  sel.innerHTML = payMonthPickerOptions(keep, studentId);
  sel.value = keep;
}

function pfReloadOutstandings() {
  const box = document.getElementById('pf-out');
  if (!box) return;
  const sid = document.getElementById('f-pstudent')?.value || '';
  if (!sid || sid === '__manual__') { box.style.display = 'none'; box.innerHTML = ''; return; }
  const month = document.getElementById('f-pmonth')?.value || '';
  const arrears = pfOutstandingRecords(sid, month);
  if (!arrears.length) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const total = arrears.reduce((s, p) => s + Number(p.unpaid || 0), 0);
  // One arrear is the common case and the one the owner's reference draws: the
  // row carries its own "Collect All" and the header needs no button. With
  // several months the per-row button fills that row alone, so the header gets
  // back the one that fills them all.
  const many = arrears.length > 1;
  box.style.display = '';
  box.innerHTML =
    `<div class="pf-out__h">
       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
       Receive Outstanding
       <span class="pf-out__tot">${fmtPKR(total)} owed</span>
       ${many ? `<button type="button" class="pf-out__btn" onclick="pfFillAllOutstandings()">Collect all</button>` : ''}
     </div>
     <div class="pf-out__note">From earlier months. What you enter here is posted to that month's record — not to ${escHtml(month || 'this month')}.</div>
     ${arrears.map(p => `
       <div class="pf-out__row">
         <div class="pf-out__m">${escHtml(p.month || '—')}</div>
         <div class="pf-out__d">owes <b>${fmtPKR(p.unpaid)}</b></div>
         <input class="pf-in pf-out__in" type="number" min="0" max="${Number(p.unpaid)}"
                id="f-pout-${p.id}" data-payid="${p.id}" data-max="${Number(p.unpaid)}"
                placeholder="0" value="" oninput="pfOutstandingInput(this)">
         <button type="button" class="pf-out__btn" title="Collect the whole ${escHtml(p.month || 'month')} balance"
                 onclick="pfFillOutstandingRow('${p.id}')">${many ? 'Collect' : 'Collect All'}</button>
       </div>`).join('')}
     <div class="pf-out__sum" id="pf-out-sumline" style="display:none">Collecting now: <b id="pf-out-sum">PKR 0</b></div>`;
}

/* ── THE MONTH ALREADY ON FILE ───────────────────────────────────────
   A month a student has part paid is not a blank slate, and this form opened on
   one as though it were: the Amount Paid box was empty, the summary charged the
   whole month again, and saving REPLACED the collected figure instead of adding
   to it. A student who had paid 4,000 of 10,000 and then handed over the
   remaining 6,000 ended the day still owing 4,000, with the first 4,000 gone.

   The record for the selected month is loaded when a student is picked and
   again whenever the month changes, so what it already holds — collected so
   far, admission fee, concession, extras — is on screen and is what gets
   saved back.                                                                */
function pfExistingForMonth(studentId, monthLabel) {
  if (!studentId || studentId === '__manual__') return null;
  const key = _normPayMonthLabel(monthLabel);
  if (!key) return null;
  const all = DB.payments.filter(p => p.studentId === studentId && _normPayMonthLabel(p.month) === key);
  if (!all.length) return null;
  // An open balance is what the warden is here to settle; a settled record only
  // matters when there is no open one left for that month.
  return all.find(p => p.status !== 'Paid') || all[0];
}

/* The record this form was last filled from. Changing the month has to undo a
   fill — otherwise last month's collected figure sits in the Amount Paid box
   and is written against a month nobody collected it for — but it must NOT wipe
   figures the warden typed themselves, so only a fill is ever reversed. */
let _pfFilledFrom = '';

function pfLoadMonthContext() {
  const box = document.getElementById('pf-month-state');
  if (!box) return;                          // older forms carry no banner
  const sid   = document.getElementById('f-pstudent')?.value || '';
  const month = document.getElementById('f-pmonth')?.value   || '';
  const rec   = pfExistingForMonth(sid, month);

  const paidEl = document.getElementById('f-ppaid');
  const admEl  = document.getElementById('f-padmfee');
  const concEl = document.getElementById('f-pconcession');
  const cdEl   = document.getElementById('f-pconcession-desc');
  const list   = document.getElementById('extra-charges-list');

  if (!rec) {
    box.style.display = 'none'; box.innerHTML = '';
    if (_pfFilledFrom) {                       // undo the previous month's fill
      _pfFilledFrom = '';
      if (paidEl) paidEl.value = '';
      if (admEl)  admEl.value  = '';
      if (concEl) concEl.value = '';
      if (cdEl)   cdEl.value   = '';
      if (list)   list.innerHTML = '';
    }
    recalcUnpaid();
    return;
  }
  _pfFilledFrom = rec.id || '';

  const already = Number(rec.amount || 0);
  const owing   = Number(rec.unpaid || 0);
  const settled = rec.status === 'Paid' || owing <= 0;

  // The record's own charges go back on the form. Without this the merge on
  // save read empty boxes and wiped the admission fee, the concession and every
  // extra line the record already carried.
  if (admEl)  admEl.value  = Number(rec.admissionFee || 0) || '';
  if (concEl) concEl.value = Number(rec.concession || rec.discount || 0) || '';
  if (cdEl)   cdEl.value   = rec.concessionDesc || '';
  if (list) {
    list.innerHTML = '';
    (rec.extraCharges || []).forEach(c => addExtraChargeRow(c.description || c.label || '', c.amount || 0));
  }
  // The box is the running total for the month, not today's instalment. Seeding
  // it with what has already been taken means the warden edits a figure they
  // can see instead of overwriting one they cannot.
  if (paidEl) paidEl.value = already || '';

  box.style.display = '';
  box.className = 'pf-mstate ' + (settled ? 'is-paid' : 'is-partial');
  const _ico = settled
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
  box.innerHTML = _ico + (settled
    ? `<div><b>${escHtml(month)} is already settled.</b> ${fmtPKR(already)} was collected${
        rec.paidDate ? ' on ' + escHtml(rec.paidDate) : ''}. Nothing more is owed for this month — use
       <b>Receive Outstanding</b> below to take money for an earlier month.</div>`
    : `<div><b>${escHtml(month)} is part paid.</b> ${fmtPKR(already)} collected so far,
       <b>${fmtPKR(owing)}</b> still owing.<br>Amount Paid below is the <b>total for this
       month</b> and already holds what was taken — raise it by whatever is being handed over now.</div>`);
  recalcUnpaid();
}

// The month select drives both the arrears panel and the banner above it.
function pfMonthChanged() {
  pfReloadOutstandings();
  pfLoadMonthContext();
}

// Never let an arrear collection exceed what that month actually owes.
function pfOutstandingInput(el) {
  const max = Number(el.dataset.max) || 0;
  let v = parseFloat(el.value) || 0;
  if (v > max) { v = max; el.value = max; }
  pfOutstandingTotal();
}

function pfFillAllOutstandings() {
  document.querySelectorAll('.pf-out__in').forEach(el => { el.value = Number(el.dataset.max) || 0; });
  pfOutstandingTotal();
}

// Fills one month's row with everything that month still owes.
function pfFillOutstandingRow(payId) {
  const el = document.getElementById('f-pout-' + payId);
  if (!el) return;
  el.value = Number(el.dataset.max) || 0;
  pfOutstandingTotal();
}

function pfOutstandingTotal() {
  let n = 0;
  document.querySelectorAll('.pf-out__in').forEach(el => { n += parseFloat(el.value) || 0; });
  const el = document.getElementById('pf-out-sum');
  if (el) el.textContent = fmtPKR(n);
  // The running total is an answer to something the warden has typed, so it
  // stays out of the way until there is something to total.
  const line = document.getElementById('pf-out-sumline');
  if (line) line.style.display = n > 0 ? '' : 'none';
  apUpdateSteps();
  return n;
}

// [{payment, amount}] for every arrear the warden entered something against.
function pfOutstandingAllocations() {
  const out = [];
  document.querySelectorAll('.pf-out__in').forEach(el => {
    const amt = parseFloat(el.value) || 0;
    if (amt <= 0) return;
    const p = DB.payments.find(x => x.id === el.dataset.payid);
    if (p) out.push({ payment: p, amount: Math.min(amt, Number(p.unpaid) || 0) });
  });
  return out;
}

/* Posts arrear collections back to the months they belong to. Returns a short
   description for the activity log. */
function pfApplyOutstandings(allocations, method, date) {
  const done = [];
  allocations.forEach(({ payment: p, amount }) => {
    p.amount  = (Number(p.amount) || 0) + amount;
    p.unpaid  = Math.max(0, (Number(p.unpaid) || 0) - amount);
    if (!p.partialPayments) p.partialPayments = [];
    p.partialPayments.push({
      date, amount, method,
      collectedBy: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Warden',
      note: 'Arrears collected'
    });
    if (p.unpaid === 0) { p.status = 'Paid'; p.paidDate = date; }
    done.push((p.month || '—') + ' ' + fmtPKR(amount));
  });
  return done.join(', ');
}

// The mess charge currently on the form — 0 when the tick is off, so the total
// follows the checkbox without the resolved amount being lost.
function pfMessAmount() {
  const on = document.getElementById('f-pmess-on');
  if (on && !on.checked) return 0;
  return parseFloat(document.getElementById('f-pmess')?.value) || 0;
}

// The room rent on the form. The redesigned Add/Edit Payment modal keeps the
// two halves in hidden f-prent/f-pmess and shows only their sum; the older
// Edit Payment modal still types into a visible f-pamt. Read whichever exists.
function pfRentAmount() {
  const r = document.getElementById('f-prent');
  if (r) return parseFloat(r.value) || 0;
  return parseFloat(document.getElementById('f-pamt')?.value) || 0;
}

function pfMessToggle() {
  const on   = document.getElementById('f-pmess-on');
  const amt  = document.getElementById('f-pmess');
  const note = document.getElementById('f-pmess-note');
  const isOn = !on || on.checked;
  // Only disable a mess box the warden can actually type in (the old modal).
  if (amt && amt.type !== 'hidden') amt.disabled = !isOn;
  if (note) note.textContent = isOn ? 'Rent + mess = total monthly charge'
                                    : 'Room only — mess not charged this month';
  recalcUnpaid();
}

/* Repaints the Monthly Charge box. One number: the room rent, plus the mess
   when the tick is on. Both halves come from Settings via resolveCharges(), so
   ticking the box moves the figure from 8,000 to 14,500 immediately. */
function pfPaintCharge() {
  const box  = document.getElementById('f-pcharge');
  if (!box) return;                       // older modals have no charge box
  const note = document.getElementById('f-pcharge-note');
  const rent = pfRentAmount();
  const mess = pfMessAmount();
  const messConfigured = parseFloat(document.getElementById('f-pmess')?.value) || 0;
  const on   = document.getElementById('f-pmess-on');
  const isOn = !on || on.checked;

  if (!rent && !messConfigured) {
    box.value = '—';
    if (note) note.textContent = 'Pick a student to load the charge';
    return;
  }
  box.value = fmtNum(rent + mess);
  if (note) {
    note.textContent = isOn && messConfigured
      ? 'Mess included — ' + fmtPKR(rent) + ' rent + ' + fmtPKR(messConfigured) + ' mess'
      : messConfigured
        ? 'Rent only — mess (' + fmtPKR(messConfigured) + ') not charged this month'
        : 'Rent only — no mess charge configured';
  }
}

function recalcUnpaid() {
  const mr      = pfRentAmount();
  const mess    = pfMessAmount();
  pfPaintCharge();
  const extra   = getExtraChargesTotal();
  const admFee  = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const conc    = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const total   = Math.max(0, mr + mess + extra + admFee - conc);
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
  setSum('pf-sum-mess',  mess);
  setSum('pf-sum-extra', extra);
  setSum('pf-sum-paid',  pa);
  setSum('pf-sum-due',   u);

  // The Add Payment page's right-hand summary is the same arithmetic, itemised.
  pfRenderSummary({
    charge: mr + mess, admFee: admFee, extra: extra,
    concession: conc, total: total, paid: pa, unpaid: u
  });
  apUpdateSteps();
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

let _ecrSeq = 0;
function addExtraChargeRow(descOrLabel='', amount='') {
  const list = document.getElementById('extra-charges-list');
  if(!list) return;
  // Date.now() collides when rows are added in a loop (restoring a saved
  // record adds all of them inside one millisecond), and two rows sharing an id
  // meant the remove button on the second deleted the first.
  const rowId = 'ecr_' + (++_ecrSeq);
  const div = document.createElement('div');
  div.className = 'extra-charge-row';
  div.id = rowId;
  div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  // Description first, then the amount (owner reference). getExtraChargesData()
  // reads both by class, not by position, so the swap is presentation only.
  div.innerHTML = `
    <input class="form-control extra-charge-desc-input" type="text" placeholder="Description (e.g. Cooler Fee)" value="${escHtml(descOrLabel)}" style="flex:1;min-width:0" oninput="recalcUnpaid()">
    <input class="form-control extra-charge-amt-input charge-amt" type="number" placeholder="Amount (PKR)" value="${amount}" min="0" style="width:110px;flex-shrink:0" oninput="recalcUnpaid()">
    <button type="button" class="rm-btn" onclick="document.getElementById('${rowId}').remove();recalcUnpaid()" title="Remove" style="flex-shrink:0">✕</button>
  `;
  list.appendChild(div);
  recalcUnpaid();
}

function showAddPaymentForStudent(studentId) {
  const t = DB.students.find(s => s.id === studentId);
  if (!t) return;
  const c = resolveCharges(t);
  const room = c.room;
  const pmOpts = DB.settings.paymentMethods.map(m => `<option ${m===t.paymentMethod?'selected':''}>${m}</option>`).join('');
  showModal('modal-md', `💳 Add Payment — ${escHtml(t.name)}`, `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;border-radius:9px;background:rgba(46,201,138,0.12);display:flex;align-items:center;justify-content:center;font-size:18px">${icon('student','sm')}</div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${escHtml(t.name)}</div>
        <div style="font-size:11px;color:var(--text3)">Room #${room ? room.number : '—'} · ${room ? getRoomType(room).name : '—'} · ${escHtml(t.phone || '—')}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:13px;font-weight:800;color:${c.configured?'var(--green)':'var(--red)'}">${c.configured?fmtPKR(c.total):'Not configured'}</div>
        <div style="font-size:10px;color:var(--text3)">Monthly Charge</div>
      </div>
    </div>
    <input type="hidden" id="f-ps-studentId" value="${t.id}">
    <div class="form-grid">
      <div class="field"><label>Room Rent (PKR) *</label><input class="form-control" id="f-ps-amt" type="number" value="${c.rent||''}" placeholder="Set in Settings → Rent &amp; Mess" oninput="recalcUnpaidPS()"></div>
      <!-- MESS — the food half of the monthly charge. This screen used to omit
           it entirely, so the same student was billed a different amount here
           than in the main Add Payment modal. -->
      <div class="field"><label>Mess Charges (PKR)</label>
        <input class="form-control" id="f-ps-mess" type="number" min="0" value="${c.mess||''}" placeholder="0" ${c.messOptIn?'':'disabled'} oninput="recalcUnpaidPS()">
        <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--text2);font-weight:600;cursor:pointer" title="Untick for a student who takes the room but not the mess">
          <input type="checkbox" id="f-ps-mess-on" ${c.messOptIn?'checked':''} onchange="psMessToggle()">
          <span id="f-ps-mess-note">${c.messOptIn?'Rent + mess = total monthly charge':'Room only — mess not charged'}</span>
        </label>
      </div>
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
      <div class="field"><label>Unpaid / Remaining (PKR)</label><input class="form-control" id="f-ps-unpaid" type="number" value="${c.total}" readonly style="color:var(--red);font-weight:700;background:var(--bg3)" title="Auto-calculated: Room Rent + Mess + Admission Fee + Extra − Concession − Paid"></div>
      <div class="field"><label>Payment Method</label><select class="form-control" id="f-ps-method">${pmOpts}</select></div>
      <div class="field"><label>Month</label><select class="form-control" id="f-ps-month">${payMonthPickerOptions(thisMonthLabel(), t.id)}</select></div>
      <div class="field"><label>Status</label>
        <select class="form-control" id="f-ps-stat">
          <option value="Paid">✓ Paid</option>
          <option value="Pending" selected>⏳ Unpaid / Pending</option>
        </select>
      </div>
      <div class="field"><label>Payment Date</label><input class="form-control cdp-trigger" id="f-ps-date" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field"><label>Due Date</label><input class="form-control cdp-trigger" id="f-ps-due" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${(()=>{const d=new Date();d.setDate(6);return ymd(d);})()}"></div>
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
    // Always use the CURRENT resolved charge, not the amount frozen into the
    // pending record — that one may predate a fee change in Settings.
    const currentRentPS = c.rent || existingPending.monthlyRent || 0;
    const messEl  = document.getElementById('f-ps-mess');
    const messOnEl= document.getElementById('f-ps-mess-on');
    if (rentEl)   rentEl.value   = currentRentPS;
    if (messEl)   messEl.value   = c.mess || 0;
    if (messOnEl) messOnEl.checked = c.messOptIn;
    if (paidEl)   paidEl.value   = existingPending.amount || 0;
    if (unpaidEl) unpaidEl.value = existingPending.unpaid != null ? existingPending.unpaid : Math.max(0, c.total - (existingPending.amount||0));
    if (statEl)   statEl.value   = existingPending.status;
    if (notesEl)  notesEl.value  = existingPending.notes || '';
    psMessToggle();
    toast('Loaded existing pending payment data', 'info');
  }
}
// The mess charge currently on this form — 0 when the tick is off, so the total
// follows the checkbox without the typed amount being lost. Mirrors pfMessAmount().
function psMessAmount() {
  const on = document.getElementById('f-ps-mess-on');
  if (on && !on.checked) return 0;
  return parseFloat(document.getElementById('f-ps-mess')?.value) || 0;
}

function psMessToggle() {
  const on   = document.getElementById('f-ps-mess-on');
  const amt  = document.getElementById('f-ps-mess');
  const note = document.getElementById('f-ps-mess-note');
  const isOn = !on || on.checked;
  if (amt)  amt.disabled = !isOn;
  if (note) note.textContent = isOn ? 'Rent + mess = total monthly charge'
                                    : 'Room only — mess not charged';
  recalcUnpaidPS();
}

function recalcUnpaidPS() {
  const rent  = parseFloat(document.getElementById('f-ps-amt')?.value) || 0;
  const mess  = psMessAmount();
  const admFee = parseFloat(document.getElementById('f-ps-admfee')?.value) || 0;
  const paid  = parseFloat(document.getElementById('f-ps-paid')?.value) || 0;
  const conc  = parseFloat(document.getElementById('f-ps-concession')?.value) || 0;
  var extra = 0;
  document.querySelectorAll('#extra-charges-list .extra-charge-amt-input').forEach(function(el){ extra += parseFloat(el.value)||0; });
  var etEl = document.getElementById('extra-charges-total');
  if(etEl) etEl.textContent = 'PKR ' + extra.toLocaleString('en-PK');
  const unpaid = Math.max(0, rent + mess + extra + admFee - conc - paid);
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
  const messIncludedPS = document.getElementById('f-ps-mess-on')?.checked !== false;
  const messChargePS   = psMessAmount();
  const admissionFeePS = parseFloat(document.getElementById('f-ps-admfee')?.value) || 0;
  const paidAmount  = parseFloat(document.getElementById('f-ps-paid')?.value) || 0;
  const concessionPS = parseFloat(document.getElementById('f-ps-concession')?.value) || 0;
  const concessionDescPS = (document.getElementById('f-ps-concession-desc')?.value || '').trim();
  const extraChargesPS = getExtraChargesData();
  const extraTotalPS   = extraChargesPS.reduce((s,c)=>s+c.amount,0);
  const totalDuePS  = Math.max(0, monthlyRent + messChargePS + extraTotalPS + admissionFeePS - concessionPS);
  const unpaid      = Math.max(0, totalDuePS - paidAmount);
  const status      = document.getElementById('f-ps-stat')?.value || 'Pending';
  // Collecting a payment does NOT change what the student is charged. Price is
  // set in Settings → Rent & Mess; this form only records what was taken. It
  // used to write the typed amount back into t.rent, which let a one-off
  // adjustment here silently become the student's standing rent.
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
    messCharge: messChargePS, messIncluded: messIncludedPS,
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
/* ═══ ADD / EDIT PAYMENT — PAGE ══════════════════════════════════════════════
   Was a modal. It is a page now because it carries three things a dialog has no
   room for: the form, a live Payment Summary, and the student's recent history.

   Everything money-related still resolves through resolveCharges(), so the
   Monthly Charge shown here is the rate configured in Settings → Rent & Mess —
   never a stale copy off the student or the room.                            */

// Preselects a student when the page opens (set by openAddPayment).
let _apPreselect = '';

function openAddPayment(studentId) {
  _apPreselect = studentId || '';
  navigate('addpayment');
}

function renderAddPayment() {
  const pmOpts = DB.settings.paymentMethods.map(m => `<option>${escHtml(m)}</option>`).join('');
  const dueDefault = (() => { const d = new Date(); d.setDate(6); return ymd(d); })();

  // Fill the form once the markup is in the DOM. renderPage() assigns
  // innerHTML inside a setTimeout, so defer past it.
  setTimeout(function () {
    recalcUnpaid();
    if (_apPreselect) {
      const sid = _apPreselect; _apPreselect = '';
      if (DB.students.some(s => s.id === sid)) selectStudentForPayment(sid);
    }
  }, 60);

  return `
  <div class="ap-wrap" id="ap-wrap">
    <!-- The title block is back (owner reference). Nothing on this page is
         scaled: the type stays the size it was designed at and the page
         scrolls on a short window, which costs a flick of the wheel instead of
         a quarter of the letter height. -->
    <div class="ap-head">
      <div class="ap-head__l">
        <nav class="ap-crumb">
          <span>Finance</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          <a onclick="navigate('payments')">Payments</a>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          <b>Add Payment</b>
        </nav>
        <h2 class="ap-title">Add New Payment</h2>
        <div class="ap-sub">Record a new payment and update student outstanding balance</div>
      </div>
      <button class="ap-back" onclick="navigate('payments')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        Back to Payments
      </button>
    </div>

    <!-- ══════════ PROGRESS ══════════
         Driven by the form, not by the page. A stepper that always reads
         "step 2" is decoration pretending to be information; this one answers
         a question the warden actually has — is there a student on this form
         yet, and has an amount been entered. apUpdateSteps() moves it. -->
    <div class="ap-steps" id="ap-steps">
      <div class="ap-step is-on" data-step="1">
        <span class="ap-step__n">1</span>
        <span class="ap-step__t"><b>Student &amp; Room</b><i>Select student &amp; room</i></span>
      </div>
      <svg class="ap-step__sep" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      <div class="ap-step" data-step="2">
        <span class="ap-step__n">2</span>
        <span class="ap-step__t"><b>Payment Details</b><i>Enter payment information</i></span>
      </div>
      <svg class="ap-step__sep" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      <div class="ap-step" data-step="3">
        <span class="ap-step__n">3</span>
        <span class="ap-step__t"><b>Payment Information</b><i>Review &amp; confirm</i></span>
      </div>
    </div>

    <div class="ap-cols">
      <!-- ══════════ LEFT: THE FORM ══════════ -->
      <div class="ap-main">

        <!-- 1. STUDENT & ROOM -->
        <div class="pf-sec">
          <div class="pf-sec__h">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            Student &amp; Room Information
          </div>
          <div style="position:relative;min-width:0">
            <div class="pf-wrapin">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
              <input class="pf-in" id="f-pstudent-search" placeholder="Search and select student"
                     oninput="filterStudentDropdown(this.value)" autocomplete="off">
              <svg class="pf-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
            <input type="hidden" id="f-pstudent" value="">
            <div class="pf-results" id="student-search-results"></div>
          </div>
          <!-- The picked student's readout. selectStudentForPayment() and
               useManualNameEntry() both write straight into this element, so it
               has to exist on the page — without it picking a student threw
               and the card never appeared. -->
          <div class="pf-picked" id="selected-student-info"></div>
        </div>

        <!-- 2. PAYMENT DETAILS -->
        <div class="pf-sec">
          <div class="pf-sec__h">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
            Payment Details
          </div>

          <!-- MONTHLY CHARGE — one derived figure; the tick is the only control. -->
          <div class="pf-charge">
            <div class="pf-charge__main">
              <label for="f-pcharge">Monthly Charge (PKR)<span class="req">*</span></label>
              <input class="pf-in pf-charge__v" id="f-pcharge" type="text" readonly value="—"
                     title="Room rent, plus mess when included. Set in Settings → Rent &amp; Mess.">
              <div class="pf-charge__note" id="f-pcharge-note">Pick a student to load the charge</div>
            </div>
            <label class="pf-charge__tick" title="Untick for a student who takes the room but not the mess">
              <input type="checkbox" id="f-pmess-on" checked onchange="pfMessToggle()">
              <span>Include mess charges</span>
            </label>
            <input type="hidden" id="f-prent" value="">
            <input type="hidden" id="f-pmess" value="">
          </div>

          <!-- What the selected month already holds. Stays hidden until there
               is a record behind it. -->
          <div class="pf-mstate" id="pf-month-state" style="display:none"></div>

          <div class="pf-grid" style="margin-top:13px">
            <div class="pf-f"><label for="f-padmfee">Admission Fees (PKR)</label>
              <input class="pf-in" id="f-padmfee" type="number" placeholder="0" min="0" value="" oninput="recalcUnpaid()"></div>
            <div class="pf-f"><label for="f-ppaid">To Pay / Amount Paid (PKR)<span class="req">*</span></label>
              <input class="pf-in" id="f-ppaid" type="number" placeholder="Enter amount paid" value="" oninput="recalcUnpaid()"></div>
            <div class="pf-f"><label for="f-punpaid">Unpaid / Remaining (PKR)</label>
              <input class="pf-in pf-in--due" id="f-punpaid" type="number" value="0" readonly
                title="Monthly Charge + Admission Fees + Extra Charges − Concession − Paid"></div>
          </div>

          <!-- RECEIVE OUTSTANDINGS — arrears posted back to their own month. -->
          <div class="pf-out" id="pf-out" style="display:none"></div>

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
              <div class="pf-extra__total"><span>Total Extras:</span><b id="extra-charges-total">PKR 0</b></div>
            </div>
          </div>
        </div>

        <!-- 4. NOTES -->
        <div class="pf-sec" id="ap-sec-notes">
          <div class="pf-sec__h">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            Notes
          </div>
          <textarea class="pf-ta" id="f-pnotes-main" maxlength="250" placeholder="Add any notes about this payment…" oninput="pfCount()"></textarea>
          <div class="pf-count" id="f-pnotes-count">0/250</div>
        </div>
      </div>

      <!-- ══════════ RIGHT: SUMMARY + HISTORY ══════════ -->
      <aside class="ap-side" id="ap-side">
        <div class="pf-sec ap-card">
          <div class="ap-card__h ap-card__h--fill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
            Payment Summary
          </div>
          <div id="ap-summary"></div>
        </div>
        <div class="pf-sec ap-card">
          <div class="ap-card__h">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></svg>
            Recent Payments
            <button class="pf-extra__add" onclick="navigate('payments')">View all</button>
          </div>
          <div id="ap-recent"><div class="ap-empty">Pick a student to see their history</div></div>
        </div>

        <!-- 3. PAYMENT INFORMATION — how the money arrived, not what is owed.
             It lives in this column permanently. The left column holds the two
             long sections; putting the four short date/method fields here is
             what keeps the two columns roughly the same height, instead of the
             form ending halfway up the page with a hole under it. -->
        <div class="pf-sec" id="ap-sec-info">
          <div class="pf-sec__h">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></svg>
            Payment Information
          </div>
          <div class="pf-grid">
            <div class="pf-f"><label for="f-pmethod">Payment Method<span class="req">*</span></label>
              <select class="pf-sel" id="f-pmethod">${pmOpts}</select></div>
            <div class="pf-f"><label for="f-pmonth">Payment Month<span class="req">*</span></label>
              <select class="pf-sel" id="f-pmonth" onchange="pfMonthChanged()">${payMonthPickerOptions(thisMonthLabel(), '')}</select></div>
            <div class="pf-f"><label for="f-pdate">Payment Date<span class="req">*</span></label>
              <div class="pf-wrapin">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
                <input class="pf-in cdp-trigger" id="f-pdate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}">
              </div></div>
            <div class="pf-f"><label for="f-pdue">Due Date</label>
              <div class="pf-wrapin">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
                <input class="pf-in cdp-trigger" id="f-pdue" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${dueDefault}">
              </div></div>
            <div class="pf-f"><label for="f-pstat">Status<span class="req">*</span></label>
              <select class="pf-sel" id="f-pstat">
                <option value="Paid">Paid</option>
                <option value="Pending" selected>Unpaid / Pending</option>
              </select></div>
          </div>
        </div>
      </aside>
    </div>

    <!-- FOOTER ACTIONS -->
    <div class="ap-foot">
      <button class="pf-btn" onclick="navigate('payments')">Cancel</button>
      <button class="pf-btn" onclick="printAndSubmitAddPayment()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        Print &amp; Save</button>
      <button class="pf-btn pf-btn--go" onclick="submitAddPayment()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        Save Payment</button>
    </div>
  </div>`;
}

/* The right-hand Payment Summary. Every line is a term of the same equation the
   form computes, laid out so the arithmetic is checkable by eye:
     Monthly Charge + Admission Fees + Extra − Discount = Total Payable
     Total Payable − Amount Paid = Remaining Balance                          */
function pfRenderSummary(vals) {
  const box = document.getElementById('ap-summary');
  if (!box) return;
  const row = (label, val, cls, sign) =>
    `<div class="ap-sum__r ${cls || ''}"><span>${label}</span>
       <b>${sign || ''}${fmtPKR(val)}</b></div>`;

  // Every term is listed even at zero (owner reference). A row that appears and
  // disappears as figures are typed makes the panel jump under the cursor, and
  // a missing line reads as "not counted" rather than "counted as nothing".
  box.innerHTML =
      row('Monthly Charge', vals.charge)
    + row('Admission Fees', vals.admFee)
    + row('Concession / Discount', vals.concession, 'is-minus', '- ')
    + row('Extra Charges', vals.extra, '', '+ ')
    + `<div class="ap-sum__sep"></div>`
    + row('Total Payable', vals.total, 'is-total')
    + row('Amount Paid', vals.paid, 'is-paid', '- ')
    + `<div class="ap-sum__bal ${vals.unpaid > 0 ? 'is-due' : 'is-clear'}">
         <span>Remaining Balance</span><b>${fmtPKR(vals.unpaid)}</b>
       </div>`;
}

/* The student's last few payments, so the warden can see what has already been
   collected without leaving the form. */
function pfRenderRecent(t) {
  const box = document.getElementById('ap-recent');
  if (!box) return;
  if (!t) { box.innerHTML = '<div class="ap-empty">Pick a student to see their history</div>'; return; }
  const rows = DB.payments
    .filter(p => p.studentId === t.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  if (!rows.length) { box.innerHTML = '<div class="ap-empty">No payments recorded yet</div>'; return; }
  box.innerHTML = rows.map(p => {
    const paid = p.status === 'Paid';
    return `<div class="ap-rec">
      <div style="min-width:0">
        <div class="ap-rec__m">${escHtml(p.month || '—')}</div>
        <div class="ap-rec__meth">${escHtml(p.method || '—')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="ap-rec__amt">${fmtPKR(p.amount)}</div>
        <div class="ap-rec__st ${paid ? 'is-paid' : 'is-due'}">${
          paid ? 'Paid on ' + escHtml(p.paidDate || p.date || '—')
               : fmtPKR(p.unpaid || 0) + ' pending'}</div>
      </div>
    </div>`;
  }).join('');
}
// Notes counter for the payment modal.
/* ── PROGRESS ────────────────────────────────────────────────────────────────
   Reads the form and marks how far it has got: a student picked closes step 1,
   an amount entered closes step 2. Called from recalcUnpaid(), so it follows
   every keystroke that changes either. */
function apUpdateSteps() {
  const box = document.getElementById('ap-steps');
  if (!box) return;
  const picked = !!(document.getElementById('f-pstudent')?.value);
  const amount = parseFloat(document.getElementById('f-ppaid')?.value) || 0;
  const arrears = (() => {
    let n = 0;
    document.querySelectorAll('.pf-out__in').forEach(el => { n += parseFloat(el.value) || 0; });
    return n;
  })();
  // Step 3 is only reached once there is money on the form — either against
  // this month or against an earlier one.
  const at = !picked ? 1 : (amount > 0 || arrears > 0) ? 3 : 2;
  box.querySelectorAll('.ap-step').forEach(el => {
    const n = Number(el.dataset.step);
    el.classList.toggle('is-on',   n === at);
    el.classList.toggle('is-done', n <  at);
  });
}

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
    const matches = DB.students.filter(t => isResident(t) && (
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

    // Case 1 — this month is already settled. That is a reason not to charge it
    // a second time. It is NOT a reason to refuse the money in the warden's
    // hand: arrears entered under Receive Outstanding are posted to the months
    // they belong to, so July's balance can still be taken in August after
    // August itself is paid. The old hard block returned before any of that ran
    // and the cash could not be recorded at all until the next month began.
    const alreadyPaid2 = DB.payments.find(p => p.studentId === studentIdRaw && p.status === 'Paid'
      && _normPayMonthLabel(p.month) === _normPayMonthLabel(enteredMonth2));
    if (alreadyPaid2) {
      window._forcePayAP = false;
      const arrearsOnly = pfOutstandingAllocations();
      if (arrearsOnly.length) {
        const aMethod = document.getElementById('f-pmethod')?.value || 'Cash';
        const aDate   = document.getElementById('f-pdate')?.value   || today();
        const aDesc   = pfApplyOutstandings(arrearsOnly, aMethod, aDate);
        logActivity('Arrears Collected', `${escHtml(tName)} — ${aDesc}`, 'Finance');
        await saveDB(); closeModal(); renderPage('payments');
        toast(`Arrears posted to ${arrearsOnly.length} earlier month(s) for ${tName} · `
            + `${enteredMonth2} was already settled and was not charged again`, 'success');
        // The slip in the student's hand has to name the cash they handed over,
        // and that cash now sits on the earlier month's record.
        if (window._printAfterSave) {
          window._printAfterSave = false;
          const _firstArrear = arrearsOnly[0].payment.id;
          setTimeout(() => printReceipt(_firstArrear), 350);
        }
        return;
      }
      toast(escHtml(tName) + ' has ALREADY PAID for ' + escHtml(enteredMonth2) + ' ('
        + fmtPKR(alreadyPaid2.amount) + '). To take money for an earlier month, enter it under "Receive Outstanding".', 'error');
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
          const prevPaid       = Number(alreadyPending2.amount || 0);
          const newMonthlyRent = pfRentAmount() || alreadyPending2.monthlyRent || 0;
          const newMessOn      = document.getElementById('f-pmess-on')?.checked !== false;
          const newMess        = pfMessAmount();
          const newPaid        = parseFloat(document.getElementById('f-ppaid')?.value) || 0;
          const newExtraCharges= getExtraChargesData();
          const newExtraTotal  = newExtraCharges.reduce((s,c)=>s+c.amount,0);
          // Admission fee and concession were missing here too, so merging into
          // an existing pending record produced a different total than creating
          // a fresh one from the identical form.
          const newAdmFee      = parseFloat(document.getElementById('f-padmfee')?.value)||0;
          const newConcession  = parseFloat(document.getElementById('f-pconcession')?.value)||0;
          const newTotalDue    = Math.max(0, newMonthlyRent + newMess + newExtraTotal + newAdmFee - newConcession);
          const newUnpaid      = Math.max(0, newTotalDue - newPaid);
          const newStatus      = document.getElementById('f-pstat')?.value || 'Pending';
          const newMethod      = document.getElementById('f-pmethod')?.value || alreadyPending2.method || 'Cash';
          const newDate        = document.getElementById('f-pdate')?.value  || today();
          const newNotes       = document.getElementById('f-pnotes-main')?.value || document.getElementById('f-pnotes')?.value || '';

          // Merge into the existing record
          alreadyPending2.monthlyRent  = newMonthlyRent;
          alreadyPending2.totalRent    = newMonthlyRent;
          alreadyPending2.messCharge   = newMess;
          alreadyPending2.messIncluded = newMessOn;
          alreadyPending2.amount       = newPaid;
          alreadyPending2.unpaid       = newUnpaid;
          // Amount Paid is the running total for the month, so today's cash is
          // the difference. Recording it leaves a per-instalment trail instead
          // of one figure that quietly changes shape between visits.
          const instalment = newPaid - prevPaid;
          if (instalment > 0) {
            if (!alreadyPending2.partialPayments) alreadyPending2.partialPayments = [];
            alreadyPending2.partialPayments.push({
              date: newDate, amount: instalment, method: newMethod,
              collectedBy: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Warden',
              note: 'Instalment'
            });
          }
          alreadyPending2.extraCharges = newExtraCharges;
          alreadyPending2.extraTotal   = newExtraTotal;
          alreadyPending2.admissionFee = newAdmFee;
          alreadyPending2.concession   = newConcession;
          alreadyPending2.discount     = newConcession;
          alreadyPending2.method       = newMethod;
          alreadyPending2.status       = newStatus;
          alreadyPending2.date         = newDate;
          alreadyPending2.paidDate     = newStatus === 'Paid' ? newDate : (alreadyPending2.paidDate || '');
          alreadyPending2.collectedBy  = CUR_USER?.name || alreadyPending2.collectedBy || '';
          if (newNotes) alreadyPending2.notes = newNotes;

          // Arrears entered alongside this update still post to their own months.
          const arrearsU = pfOutstandingAllocations();
          if (arrearsU.length) {
            // Appended, not replaced: a second visit against the same month is
            // more cash through the same record, and the receipt lists the lot.
            alreadyPending2.arrearsCollected = (alreadyPending2.arrearsCollected || []).concat(
              arrearsU.map(a => ({ month: a.payment.month || '—', amount: a.amount, date: newDate })));
          }
          const arrearsUDesc = arrearsU.length ? pfApplyOutstandings(arrearsU, newMethod, newDate) : '';

          logActivity('Payment Updated', `${escHtml(tName)} — ${enteredMonth2} (existing record updated, no duplicate created)`, 'Finance');
          if (arrearsUDesc) logActivity('Arrears Collected', `${escHtml(tName)} — ${arrearsUDesc}`, 'Finance');
          await saveDB(); closeModal(); renderPage('payments');
          toast(arrearsUDesc
            ? `Payment updated for ${tName} · arrears posted to ${arrearsU.length} earlier month(s)`
            : `Payment updated for ${tName} — no duplicate created`, 'success');
          window._updatePendingAP = false;
        },
        function() { window._updatePendingAP = false; }
      );
      return;
    }
    window._updatePendingAP = false;
  }
  window._forcePayAP = false;
  const monthlyRent = pfRentAmount();
  const messIncluded = document.getElementById('f-pmess-on')?.checked !== false;
  const messCharge   = pfMessAmount();
  const paidAmount  = parseFloat(document.getElementById('f-ppaid')?.value)||0;
  const extraCharges = getExtraChargesData();
  const extraTotal  = extraCharges.reduce((s,c)=>s+c.amount,0);
  const admissionFee  = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const concession    = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const concessionDesc= (document.getElementById('f-pconcession-desc')?.value||'').trim();
  const totalDue    = Math.max(0, monthlyRent + messCharge + extraTotal + admissionFee - concession);
  const totalRent   = monthlyRent;                // display rent = base only
  const unpaid      = Math.max(0, totalDue - paidAmount);
  const status      = document.getElementById('f-pstat')?.value || 'Pending';
  const t    = isManual ? null : DB.students.find(x=>x.id===studentIdRaw);
  const room = t ? DB.rooms.find(r=>r.id===t?.roomId) : null;
  const finalName = isManual ? manualName : (t?.name||'');
  const _newPayId = 'p_'+uid();
  // Read the arrears BEFORE the record is built: the receipt printed for this
  // visit has to name the cash that went to earlier months, or the slip in the
  // student's hand disagrees with what they handed over.
  const arrears = pfOutstandingAllocations();
  DB.payments.push({
    id: _newPayId,
    collectedBy: CUR_USER?.name || '',  // BUG FIX: guard against null CUR_USER
    studentId: isManual ? '' : studentIdRaw,
    studentName: finalName,
    roomId: t?.roomId||'',
    roomNumber: room?.number||'',
    amount: paidAmount,
    monthlyRent, unpaid,
    messCharge, messIncluded,
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
    // A record of the cash, not of the debt — the debt itself moves onto the
    // earlier month's own record in pfApplyOutstandings() below.
    arrearsCollected: arrears.map(a => ({
      month: a.payment.month || '—', amount: a.amount,
      date: document.getElementById('f-pdate')?.value || today(),
    })),
  });
  // Arrears collected on this visit are posted to the months they belong to,
  // never folded into the record just created for the selected month.
  const arrearsDesc = arrears.length
    ? pfApplyOutstandings(arrears,
        document.getElementById('f-pmethod')?.value || 'Cash',
        document.getElementById('f-pdate')?.value || today())
    : '';

  logActivity('Payment Added', `${finalName||'student'} — ${document.getElementById('f-pmonth')?.value||''}`, 'Finance');
  if (arrearsDesc) logActivity('Arrears Collected', `${finalName||'student'} — ${arrearsDesc}`, 'Finance');
  await saveDB(); closeModal(); renderPage('payments');
  toast(arrearsDesc
    ? `Payment recorded for ${finalName||'student'} · arrears posted to ${arrears.length} earlier month(s)`
    : `Payment recorded for ${finalName||'student'}`, 'success');
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
  // The record's own method is always offered, even if it has since been
  // removed from Settings — otherwise editing anything else on an older payment
  // silently rewrote how the money came in.
  const _pmList = DB.settings.paymentMethods.slice();
  if (p.method && _pmList.indexOf(p.method) === -1) _pmList.unshift(p.method);
  const pmOpts = _pmList.map(m=>`<option ${p.method===m?'selected':''}>${escHtml(m)}</option>`).join('');
  // BUG FIX: Use the student's CURRENT rent (t.rent) as the primary value.
  // p.monthlyRent is the rent at the time the payment was recorded and may be stale
  // if the warden has since updated fees in Settings. t.rent is always kept in sync.
  const c = t ? resolveCharges(t) : null;
  const monthlyRent  = (c && c.rent) || p.monthlyRent || p.totalRent || 0;
  // Mess follows the same rule as rent above: the current configured charge
  // wins, falling back to what was recorded on this payment.
  const messCharge   = c && c.mess != null ? c.mess : Number(p.messCharge || 0);
  const messIncluded = p.messIncluded != null ? p.messIncluded !== false : (c ? c.messOptIn : true);
  const paidAmount   = p.amount || 0;
  const admissionFee = p.admissionFee || p.fee || 0;
  const concession   = p.concession || p.discount || 0;
  const concessionDesc = p.concessionDesc || p.discountDesc || '';
  const unpaid = p.unpaid != null ? p.unpaid : Math.max(0, monthlyRent + (messIncluded?messCharge:0) + admissionFee - concession - paidAmount);
  showModal('modal-lg', `✏️ Edit Payment — ${escHtml(p.studentName||'Student')}`, `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div style="width:38px;height:38px;border-radius:9px;background:var(--accent-dim);color:var(--accent-strong);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;flex-shrink:0">${(p.studentName||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;color:var(--text)">${escHtml(p.studentName||'—')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">Room <span style="color:var(--accent-strong);font-weight:700">#${room?.number||'?'}</span>${rtype?` · ${escHtml(rtype.name)}`:''}${t?.phone?` · ${escHtml(t.phone)}`:''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:900;color:var(--green)">${fmtPKR(monthlyRent + (messIncluded?messCharge:0))}</div>
        <div style="font-size:9px;color:var(--text3)">Monthly Charge</div>
      </div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Room Rent (PKR) *</label><input class="form-control" id="f-pamt" type="number" value="${monthlyRent}" oninput="recalcUnpaid()"></div>
      <!-- MESS — this modal used to omit it, so saving an edit recomputed the
           total without the food charge while leaving p.messCharge on the
           record: the balance and the printed receipt disagreed. -->
      <div class="field"><label>Mess Charges (PKR)</label>
        <input class="form-control" id="f-pmess" type="number" min="0" value="${messCharge||''}" placeholder="0" ${messIncluded?'':'disabled'} oninput="recalcUnpaid()">
        <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--text2);font-weight:600;cursor:pointer">
          <input type="checkbox" id="f-pmess-on" ${messIncluded?'checked':''} onchange="pfMessToggle()">
          <span id="f-pmess-note">${messIncluded?'Rent + mess = total monthly charge':'Room only — mess not charged'}</span>
        </label>
      </div>
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
      <div class="field"><label>Month</label><select class="form-control" id="f-pmonth">${payMonthPickerOptions(p.month || '', p.studentId || '')}</select></div>
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
  const messIncluded = document.getElementById('f-pmess-on')?.checked !== false;
  const messCharge   = pfMessAmount();
  const paidAmount   = parseFloat(document.getElementById('f-ppaid')?.value)||0;
  const admissionFee = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const concession   = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const concessionDesc = (document.getElementById('f-pconcession-desc')?.value||'').trim();
  const extraCharges = getExtraChargesData();
  const extraTotal   = extraCharges.reduce((s,c)=>s+c.amount, 0);
  const totalDue     = Math.max(0, monthlyRent + messCharge + extraTotal + admissionFee - concession);
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
  p.messCharge     = messCharge;
  p.messIncluded   = messIncluded;
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
  // Editing one month's record does NOT re-price the student. It used to write
  // monthlyRent back to _st.rent, so correcting a single historical bill
  // silently changed every future one. Price changes belong in
  // Settings → Rent & Mess, which propagates deliberately.
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
