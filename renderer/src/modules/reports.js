/* ─── HOSTYLLO — REPORTS MODULE ───────────────────────────────────────────────
   Contains: renderReportDetail, renderReports, showEditTransferModal,
             submitEditTransfer, deleteTransfer, downloadDetailPDF,
             downloadReportDetailPDF, printReport, downloadDetailCSV

   The standalone Funds Transfer feature — its stat card, detail view, add
   modal and records modal — is gone: a transfer is an ordinary expense under
   the Fund Transfer category now. showEditTransferModal / deleteTransfer stay,
   because records already in DB.transfers are listed under that category and
   must remain correctable in place.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── WHO LIVED HERE IN THE REPORTED PERIOD, AND IN WHICH ROOM (finance Phase 5)
   Every roster, room table, occupancy figure and headcount on this page and in
   its exports reads this. They read `status === 'Active'` and `t.roomId`,
   which are TODAY — so the report for a past month listed this month's
   residents in this month's rooms (owner, 2026-09-18: "students goes in and
   out … should be only shown in that month"). The stays in periods.js answer
   it now: anyone resident at any point in the period, in the room they were in
   at the end of their time in it, flagged if they arrived or left inside it.

   A student with a bill for the period is on it too, even where their stay
   dates are silent: the bill is itself a record that they were here, and it
   names the room it was raised against. */
function _rptResidents(keys) {
  keys = keys || _rptKeys();
  if (!keys.length) return [];
  const billed = new Map();   // studentId -> latest bill in the period
  (DB.payments || []).forEach(p => {
    if (!p || !keys.some(k => _payMatchesMonth(p, k))) return;
    const cur = billed.get(p.studentId);
    if (!cur || String(_payMonthKey(p)) >= String(_payMonthKey(cur))) billed.set(p.studentId, p);
  });
  const out = [];
  (DB.students || []).forEach(s => {
    const info = studentInPeriodInfo(s, keys);
    const bill = billed.get(s.id);
    if (!info && !bill) return;
    out.push({
      s,
      roomId: (info && info.roomId) || (bill && (bill.roomId || _roomIdByNumber(bill.roomNumber))) || null,
      joined: !!(info && info.joined),
      left:   !!(info && info.left),
      from:   info ? info.stay.from : (s.joinDate || ''),
      to:     info ? (info.stay.to || '') : '',
    });
  });
  return out;
}

// Where a resident stood in the period, in one word.
function _rptStayWord(r) {
  return r.joined && r.left ? 'Joined & left' : r.joined ? 'Joined' : r.left ? 'Left' : 'Resident';
}

// The same word as a badge: there throughout, arrived, or gone by the end.
function _rptStayBadge(r) {
  const w = _rptStayWord(r);
  const cls = w === 'Resident' ? 'badge-green' : w === 'Joined' ? 'badge-blue' : 'badge-gray';
  return `<span class="badge ${cls}">${escHtml(w)}</span>`;
}

/* The Student Report's filter, in the period's own terms. `studentReportFilter`
   used to hold a status (Active / Left / Blacklisted); a value left over from
   that reads as All rather than as an empty table. */
function _rptStayMatches(r, w) {
  if (w === 'Joined')   return r.joined;
  if (w === 'Left')     return r.left;
  if (w === 'Resident') return !r.joined && !r.left;
  return true;
}
function _rptFilterResidents(residents) {
  const w = ['Resident', 'Joined', 'Left'].includes(studentReportFilter) ? studentReportFilter : 'All';
  if (w !== studentReportFilter) studentReportFilter = 'All';
  return residents.filter(r => _rptStayMatches(r, w));
}

// What each student was billed for the period — the charge that month, not the
// rent their room carries today.
function _rptBilledByStudent(pays) {
  const m = new Map();
  (pays || []).forEach(p => m.set(p.studentId, (m.get(p.studentId) || 0) + calculateBill(p)));
  return m;
}

// PERF: shared room/student indexes built in ONE pass, so report tables and PDF builders
// stop doing a DB.rooms.find / DB.students.filter per row (which was O(rows × students)).
// For the REPORTED period — see _rptResidents() above.
function _buildRoomStudentIndex(keys) {
  const roomById = new Map(DB.rooms.map(r=>[r.id, r]));
  const residents = _rptResidents(keys);
  const activeStudentsByRoom = new Map();   // roomId -> [students resident in it in the period]
  const stayOf = new Map();                 // studentId -> { roomId, joined, left }
  residents.forEach(x => {
    stayOf.set(x.s.id, x);
    if (!x.roomId) return;
    let arr=activeStudentsByRoom.get(x.roomId); if(!arr){ arr=[]; activeStudentsByRoom.set(x.roomId,arr); }
    arr.push(x.s);
  });
  return { roomById, residents, stayOf, activeStudentsByRoom,
           occ: r => (activeStudentsByRoom.get(r.id)||[]).length };
}

function renderReportDetail(id, pays, exps, rev, pending, totalExp, net, occ) {
  // Names the window the detail is actually built from — one month, since
  // 2026-09-22. It reads _rptKeys() rather than reportMonth so it cannot drift
  // from the keys the rows below it were selected with.
  const periodLabel = _rptScopeLabel();
  const csvBtn = (type, color) => `<button onclick="downloadDetailExcel('${type}')" title="Export this report to Excel" style="background:${color};color:#fff;border:none;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">Export Excel</button>`;
  const pdfBtn = `<button onclick="downloadReportDetailPDF('${id}')" title="Export this report as a PDF document" style="background:var(--accent);color:#fff;border:none;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">Export PDF</button>`;

  // PERF: index rooms by id and active students by room ONCE (see _buildRoomStudentIndex).
  const { roomById:_roomById, activeStudentsByRoom:_activeStudentsByRoom, residents:_residents } = _buildRoomStudentIndex();

  // PERF: reset to page 1 only when the detail type / period / sub-filter changes, so
  // paging within a detail table is preserved but switching cards starts fresh.
  const _detKey = id+'|'+_rptKeys()[0]+'|'+studentReportFilter;
  if (reportDetailFilter._lastKey !== _detKey) { reportDetailFilter.page = 1; reportDetailFilter._lastKey = _detKey; }

  // ── REVENUE ────────────────────────────────────────────────────────────────
  if (id === 'financial') {
    const paidOnly = pays.filter(p=>p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date));
    const _pg = paginate(paidOnly, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">${icon('money')} Revenue — Paid Transactions (${periodLabel})</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('financial','var(--green)')}${pdfBtn}</div>
      </div>
      <div class="two-col" style="margin-bottom:16px">
        <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:18px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--green);font-weight:700;margin-bottom:6px">Total Revenue</div>
          <div style="font-size:30px;font-weight:900;color:var(--green)">${fmtPKR(rev)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">${paidOnly.length} paid transactions</div>
        </div>
        <div style="background:var(--red-dim);border:1px solid rgba(224,82,82,0.3);border-radius:10px;padding:18px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--red);font-weight:700;margin-bottom:6px">Total Expenses</div>
          <div style="font-size:30px;font-weight:900;color:var(--red)">${fmtPKR(totalExp)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">${exps.length} expense entries</div>
        </div>
      </div>
      <div style="background:${net>=0?'var(--green-dim)':'var(--red-dim)'};border:1px solid ${net>=0?'rgba(46,201,138,0.3)':'rgba(224,82,82,0.3)'};border-radius:10px;padding:18px;text-align:center;margin-bottom:16px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:${net>=0?'var(--green)':'var(--red)'};font-weight:700;margin-bottom:6px">Available Fund</div>
        <div style="font-size:38px;font-weight:900;color:${net>=0?'var(--green)':'var(--red)'}">${fmtPKR(net)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:6px">${fmtPKR(rev)} revenue − ${fmtPKR(totalExp)} expenses</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount Paid</th><th>Method</th><th>Date</th></tr></thead><tbody>
      ${_pg.slice.map(p=>`<tr style="cursor:pointer" onclick="showStudentPanel('${p.studentId}')">
        <td class="fw-700" style="color:var(--blue)">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${escHtml(p.roomNumber||'—')}</td>
        <td class="text-muted" style="font-size:12px">${escHtml(p.month||'—')}</td>
        <td class="text-green fw-700">${fmtPKR(p.amount)}</td>
        <td>${pmBadge(p.method)}</td>
        <td class="text-muted" style="font-size:12px">${fmtDate(p.date)}</td>
      </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">No paid transactions this period</td></tr>'}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  // ── PENDING ────────────────────────────────────────────────────────────────
  if (id === 'pending') {
    // Scoped to the period the report header names. This read the whole payment
    // table, so July's report listed August's unpaid rents under a "Pending"
    // card whose own figure counted July only — the table and the stat above it
    // described two different windows.
    const pendingPays = pays.filter(p=>p.status==='Pending').sort((a,b)=>new Date(b.date)-new Date(a.date));
    /* `pending` is already this figure — _rptTotals() computes it over exactly
       this set through calculateReportTotals(). It was being summed a second
       time here from the same records, which is how a card and the stat above
       it drift apart when only one of them is later corrected. */
    const totalPend = pending;
    const _pg = paginate(pendingPays, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        ${''/* Icons, not emoji, across every detail heading. Two of these ten
               views were written this week and use icon(); the other eight
               opened with 👥 🏠 📉 💳 ⏳, which render in the OS emoji font at a
               size and colour nothing else on the page uses — and the owner has
               been pulling emoji out of the printed documents all week for the
               same reason. Same glyphs as the tab that opens each view. */}
        <div class="card-title">${icon('clock')} Pending Payments — ${escHtml(periodLabel)}</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('pending','var(--amber)')}${pdfBtn}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="background:var(--amber-dim);border:1px solid rgba(240,160,48,0.3);border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--amber);font-weight:700">Total Outstanding</div>
          <div style="font-size:26px;font-weight:900;color:var(--amber)">${fmtPKR(totalPend)}</div>
        </div>
        <div style="background:var(--red-dim);border:1px solid rgba(224,82,82,0.3);border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--red);font-weight:700">Records</div>
          <div style="font-size:26px;font-weight:900;color:var(--red)">${pendingPays.length}</div>
        </div>
        <div style="background:var(--blue-dim);border:1px solid rgba(74,156,240,0.3);border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--blue);font-weight:700">Partially Paid</div>
          <div style="font-size:26px;font-weight:900;color:var(--blue)">${pendingPays.filter(p=>Number(p.amount)>0).length}</div>
        </div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Outstanding</th><th>Method</th><th>Date</th><th>Action</th></tr></thead><tbody>
      ${_pg.slice.map(p=>`<tr>
        <td class="fw-700" style="cursor:pointer;color:var(--blue)" onclick="showStudentPanel('${p.studentId}')">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${escHtml(p.roomNumber||'—')}</td>
        <td class="text-muted" style="font-size:12px">${escHtml(p.month||'—')}</td>
        <td class="${Number(p.amount)>0?'text-green fw-700':'text-muted'}">${Number(p.amount)>0?fmtPKR(p.amount):'—'}</td>
        <td class="text-red fw-700">${fmtPKR(outstandingOf(p))}</td>
        <td>${pmBadge(p.method)}</td>
        <td class="text-muted" style="font-size:12px">${fmtDate(p.date)}</td>
        <td><button class="btn btn-success btn-sm" style="font-size:11px" onclick="markPaymentPaid('${p.id}');reportDetail='pending';renderPage('reports')">✓ Collect</button></td>
      </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--green);padding:20px">🎉 All rents collected!</td></tr>'}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  // ── AVAILABLE FUND ─────────────────────────────────────────────────────────
  if (id === 'netprofit') {
    const allItems = [
      /* The floor rides with the number (owner, 2026-09-10). */
      ...pays.filter(p=>p.status==='Paid').map(p=>({date:p.date,label:escHtml(p.studentName||'—'),desc:'Room '+escHtml(roomText(p.roomNumber,((DB.rooms||[]).find(r=>String(r.number)===String(p.roomNumber))||{}).floor))+' · '+escHtml(p.month||''),amount:Number(p.amount),type:'income'})),
      ...exps.map(e=>({date:e.date,label:escHtml(e.category||'Expense'),desc:escHtml(e.description||'—'),amount:Number(e.amount),type:'expense'}))
    ].sort((a,b)=>new Date(b.date)-new Date(a.date));
    const _pg = paginate(allItems, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">${icon('chart')} Available Fund — ${periodLabel}</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('netprofit','var(--accent)')}${pdfBtn}</div>
      </div>
      <div style="background:${net>=0?'var(--green-dim)':'var(--red-dim)'};border:1px solid ${net>=0?'rgba(46,201,138,0.4)':'rgba(224,82,82,0.4)'};border-radius:12px;padding:22px;text-align:center;margin-bottom:16px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:${net>=0?'var(--green)':'var(--red)'};font-weight:700;margin-bottom:8px">Available Fund</div>
        <div style="font-size:44px;font-weight:900;color:${net>=0?'var(--green)':'var(--red)'};letter-spacing:-1px">${fmtPKR(net)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:6px">${fmtPKR(rev)} revenue − ${fmtPKR(totalExp)} expenses</div>
      </div>
      ${_rptOwnerLines(rev, totalExp)}
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${_pg.slice.map(item=>`<tr>
        <td class="text-muted" style="font-size:12px">${fmtDate(item.date)}</td>
        <td>${item.type==='income'?`<span class="badge badge-green">${icon('money')} Income</span>`:'<span class="badge badge-red">📉 Expense</span>'}</td>
        <td><div style="font-weight:600">${item.label}</div><div style="font-size:11px;color:var(--text3)">${item.desc}</div></td>
        <td style="font-weight:700;color:${item.type==='income'?'var(--green)':'var(--red)'};">${item.type==='income'?'+':'−'}${fmtPKR(item.amount)}</td>
      </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">No transactions</td></tr>'}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  // ── OWNER FUNDS ────────────────────────────────────────────────────────────
  /* The period's owner money, beside its profit and loss — never inside it.
     The statement is built from THIS page's revenue and expense figures (the
     same `rev`/`totalExp` every other tab shows), so the two cannot disagree. */
  if (id === 'ownerfunds') {
    if (typeof ofAllowed !== 'function' || !ofAllowed()) return '';
    return _rptOwnerPanel(rev, totalExp, periodLabel, csvBtn('ownerfunds','var(--accent)') + pdfBtn);
  }

  // ── STUDENTS ───────────────────────────────────────────────────────────────
  if (id === 'students') {
    /* THE PERIOD'S RESIDENTS, IN THE PERIOD'S ROOMS (finance Phase 5). The
       filters were today's statuses — Active / Left / Blacklisted — which
       say nothing about the month on screen: a student who stayed all of
       March and left in June counted as "Left" in March. They are what
       happened IN the period now: arrived, left, or there throughout. */
    const inPeriod = _rptFilterResidents(_residents);
    const _n = w => _residents.filter(r => _rptStayMatches(r, w)).length;
    const badges = [
      {label:'All',      count:_residents.length, color:'var(--blue)',  dim:'var(--blue-dim)',  border:'rgba(74,156,240,0.4)'},
      {label:'Resident', count:_n('Resident'),    color:'var(--green)', dim:'var(--green-dim)', border:'rgba(46,201,138,0.4)'},
      {label:'Joined',   count:_n('Joined'),      color:'var(--accent)',dim:'var(--accent-dim)',border:'rgba(37,99,235,0.4)'},
      {label:'Left',     count:_n('Left'),        color:'var(--amber)', dim:'var(--amber-dim)', border:'rgba(240,160,48,0.4)'},
    ];
    const _pg = paginate(inPeriod, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">${icon('users')} Student Report — ${escHtml(periodLabel)}</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('students','var(--blue)')}${pdfBtn}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
        ${badges.map(b=>`<div onclick="studentReportFilter='${b.label}';renderPage('reports')" style="background:${studentReportFilter===b.label?b.dim:'var(--card)'};border:2px solid ${studentReportFilter===b.label?b.border:'var(--border)'};border-radius:10px;padding:14px;text-align:center;cursor:pointer;transition:var(--transition)" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:${b.color};font-weight:700">${b.label}</div>
          <div style="font-size:26px;font-weight:900;color:${b.color};margin:4px 0">${b.count}</div>
          <div style="font-size:9px;color:var(--text3)">${studentReportFilter===b.label?'▲ filtered':'click to filter'}</div>
        </div>`).join('')}
      </div>
      ${studentReportFilter!=='All'?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:12px;color:var(--text3)">Showing <strong style="color:var(--text)">${studentReportFilter}</strong> (${inPeriod.length})</span>
        <button onclick="studentReportFilter='All';renderPage('reports')" class="btn btn-secondary btn-sm" style="font-size:11px">✕ Clear</button>
      </div>`:''}
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Father</th><th>Room</th><th>Joined</th><th>Left</th><th>Billed</th><th>In period</th><th>Phone</th></tr></thead><tbody>
      ${(()=>{const _billed=_rptBilledByStudent(pays);return _pg.slice.map(x=>{const t=x.s;const r=_roomById.get(x.roomId);const b=_billed.get(t.id);return `<tr style="cursor:pointer" onclick="showStudentPanel('${t.id}')">
        <td class="fw-700" style="color:var(--blue)">${escHtml(t.name)}</td>
        <td class="text-muted" style="font-size:12px">${escHtml(t.fatherName||'—')}</td>
        <td class="text-gold fw-700">${r?'#'+escHtml(String(r.number)):'—'}</td>
        <td class="text-muted" style="font-size:12px">${x.from?fmtDate(x.from):'—'}</td>
        <td class="text-muted" style="font-size:12px">${x.to?fmtDate(x.to):'—'}</td>
        <td class="${b?'text-green fw-700':'text-muted'}">${b!=null?fmtPKR(b):'Not billed'}</td>
        <td>${_rptStayBadge(x)}</td>
        <td class="text-muted">${escHtml(t.phone||'—')}</td>
      </tr>`;}).join('');})()||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">Nobody lived here in this period</td></tr>'}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  // ── ROOMS ──────────────────────────────────────────────────────────────────
  if (id === 'rooms') {
    const _pg = paginate(DB.rooms, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header"><div class="card-title">${icon('bed')} Room Occupancy — ${escHtml(periodLabel)}</div><div style="display:flex;gap:8px;align-items:center">${csvBtn('rooms','var(--teal)')}${pdfBtn}</div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--green);font-weight:700">Occupied</div><div style="font-size:28px;font-weight:900;color:var(--green)">${occ}</div></div>
        <div style="background:var(--accent-dim);border:1px solid rgba(37,99,235,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--accent-strong);font-weight:700">Vacant</div><div style="font-size:28px;font-weight:900;color:var(--accent-strong)">${DB.rooms.length-occ}</div></div>
        <div style="background:var(--blue-dim);border:1px solid rgba(74,156,240,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--blue);font-weight:700">Total</div><div style="font-size:28px;font-weight:900;color:var(--blue)">${DB.rooms.length}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Occupancy</th><th>Students</th><th>Status</th><th>Rent</th></tr></thead><tbody>
      ${_pg.slice.map(r=>{const type=getRoomType(r);const sts=_activeStudentsByRoom.get(r.id)||[];const occ2=sts.length;return `<tr style="cursor:pointer" onclick="showRoomDetail('${r.id}')"><td class="fw-700 text-gold">#${r.number}</td><td><span class="badge" style="background:${type.color}22;color:${type.color};border-color:${type.color}44">${escHtml(type.name)}</span></td><td class="text-muted">${escHtml(r.floor)} Floor</td><td class="text-muted">${occ2}/${type.capacity}</td><td style="font-size:12px">${sts.map(t=>escHtml(t.name)).join(', ')||'<span style="color:var(--text3)">Empty</span>'}</td><td><span class="badge ${occ2>0?'badge-green':'badge-gray'}">${occ2>0?'Occupied':'Vacant'}</span></td><td class="text-green fw-700">${fmtPKR(r.rent)}/mo</td></tr>`;}).join('')}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  // Grouped into one section per category, each with its own running total and
  // a grand total underneath, rather than one flat grid of raw rows. The flat
  // grid could not answer "what did staff salary cost this month" without the
  // reader adding the rows up by hand.
  if (id === 'expenses') {
    const groups = _rptByCategory(exps);
    const grand  = _rptGroupsTotal(groups);

    // Edit/delete route by record type: an ordinary expense goes to the
    // Expenses modals, a legacy DB.transfers row to the transfer modals that
    // still own it. Both come back to this detail view after the write.
    // reportDetail is already 'expenses' here, and the expense/transfer writers
    // re-render whichever page is current, so both routes come back to this
    // same section instead of bouncing the owner onto the Expenses screen.
    const acts = e => e._transfer
      ? `<button class="btn btn-secondary btn-icon btn-sm" onclick="showEditTransferModal('${e.id}')" title="Edit transfer">✏️</button>
         <button class="btn btn-danger btn-icon btn-sm" onclick="deleteTransfer('${e.id}')" title="Delete transfer">🗑</button>`
      : `<button class="btn btn-secondary btn-icon btn-sm" onclick="showEditExpenseModal('${e.id}')" title="Edit">✏️</button>
         <button class="btn btn-danger btn-icon btn-sm" onclick="deleteExpense('${e.id}')" title="Delete">🗑</button>`;

    const sections = groups.map(g => `
      <div style="margin-bottom:18px;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--dash-sunk);border-bottom:1px solid var(--border)">
          <span class="badge badge-amber">${escHtml(g.cat)}</span>
          <span style="font-size:11px;color:var(--text3)">${g.items.length} record${g.items.length===1?'':'s'}</span>
          <span style="margin-left:auto;font-size:11px;color:var(--text3)">${grand>0?Math.round(g.total/grand*100):0}% of outgoings</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Actions</th></tr></thead>
          <tbody>
            ${g.items.map(e=>`<tr>
              <td class="text-muted" style="font-size:12px;white-space:nowrap">${fmtDate(e.date)}</td>
              <td>${escHtml(e.description||'—')}</td>
              <td class="text-red fw-700">${fmtPKR(e.amount)}</td>
              <td><div style="display:flex;gap:4px">${acts(e)}</div></td>
            </tr>`).join('')}
            <tr style="background:var(--dash-sunk);font-weight:800">
              <td colspan="2" style="text-align:right">Total — ${escHtml(g.cat)}</td>
              <td class="text-red fw-700">${fmtPKR(g.total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table></div>
      </div>`).join('');

    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">${icon('expense')} Expenses by Category — ${escHtml(periodLabel)}</div>
        <div style="display:flex;align-items:center;gap:10px"><div style="font-size:18px;font-weight:900;color:var(--red)">${fmtPKR(totalExp)}</div>${csvBtn('expenses','var(--red)')}${pdfBtn}</div>
      </div>
      ${groups.length
        ? sections + `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border:2px solid var(--border2);border-radius:12px;background:var(--dash-sunk)">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:var(--text3);font-weight:700">Grand Total — ${groups.length} categor${groups.length===1?'y':'ies'}</div>
        <div style="margin-left:auto;font-size:22px;font-weight:900;color:var(--red)">${fmtPKR(grand)}</div>
      </div>`
        : '<div style="text-align:center;color:var(--text3);padding:28px">No expenses this period</div>'}
    </div>`;
  }

  // ── PAYMENT METHODS ────────────────────────────────────────────────────────
  if (id === 'payments') {
    const _paySorted = pays.filter(p=>p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date));
    const _pg = paginate(_paySorted, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header"><div class="card-title">${icon('card')} Payment Methods — ${escHtml(periodLabel)}</div><div style="display:flex;gap:8px;align-items:center">${csvBtn('payments','var(--accent)')}${pdfBtn}</div></div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount Paid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${_pg.slice.map(p=>`<tr>
        <td class="fw-700">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${escHtml(p.roomNumber||'—')}</td>
        <td class="text-muted">${escHtml(p.month||'—')}</td>
        <td class="text-green fw-700">${fmtPKR(p.amount)}</td>
        <td>${pmBadge(p.method)}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="text-muted" style="font-size:12px">${fmtDate(p.date)}</td>
      </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No paid transactions</td></tr>'}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  /* ── CANCELLATIONS ─────────────────────────────────────────────────────────
     `reports2.png` draws a Cancellations tab and this page did not have one. I
     said so in the strip's comment and left it out on the grounds that there
     was no report screen behind it — which was true of the SCREEN and not of
     the DATA. DB.cancellations is a complete register with settlements on it,
     so the tab is built rather than left as a note explaining its absence.

     Scoped to the reported period through the same _rptKeys() every other
     block on this page uses, on `vacateDate` — when the bed actually came free,
     not when notice was given. A departure noticed in August for a September
     vacate is a September departure, and the money settles with it. */
  if (id === 'cancellations') {
    const _keys = new Set(_rptKeys());
    const _mk = d => String(d || '').slice(0, 7);
    const list = (DB.cancellations || [])
      .filter(c => _keys.has(_mk(c.vacateDate || c.requestDate)))
      .sort((a, b) => new Date(b.vacateDate || b.requestDate) - new Date(a.vacateDate || a.requestDate));
    const _set = c => c.settlement || {};
    const collected = list.reduce((s, c) => s + Number(_set(c).collected || 0), 0);
    const owed      = list.reduce((s, c) => s + Number(_set(c).outstanding || 0), 0);
    const refunded  = list.reduce((s, c) => s + Number(_set(c).credit || 0), 0);
    const _pg = paginate(list, reportDetailFilter);
    const box = (label, value, tone) => `
      <div style="background:var(--${tone}-dim);border:1px solid var(--border2);border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--${tone});font-weight:700">${escHtml(label)}</div>
        <div style="font-size:24px;font-weight:900;color:var(--${tone});margin-top:4px">${value}</div>
      </div>`;
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">${icon('transfer')} Cancellations — ${escHtml(periodLabel)}</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('cancellations','var(--amber)')}${pdfBtn}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
        ${box('Departures', String(list.length), 'blue')}
        ${box('Settled', fmtPKR(collected), 'green')}
        ${box('Left owing', fmtPKR(owed), 'red')}
        ${box('Refunded', fmtPKR(refunded), 'accent')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Ref</th><th>Student</th><th>Room</th><th>Notice</th><th>Vacates</th><th>Reason</th><th>Settled</th><th>Owing</th><th>Status</th></tr></thead>
        <tbody>
        ${_pg.slice.map(c => `<tr>
          <td class="text-muted" style="font-size:12px;white-space:nowrap">${escHtml(c.seq ? 'CAN-' + String(c.seq).padStart(4,'0') : '—')}</td>
          <td class="fw-700">${escHtml(c.studentName || '—')}</td>
          <td class="text-gold fw-700">#${escHtml(String(c.roomNumber || '—'))}</td>
          <td class="text-muted" style="font-size:12px;white-space:nowrap">${c.requestDate ? fmtDate(c.requestDate) : '—'}</td>
          <td class="text-muted" style="font-size:12px;white-space:nowrap">${c.vacateDate ? fmtDate(c.vacateDate) : 'end of month'}</td>
          <td style="font-size:12px">${escHtml(c.reason || '—')}</td>
          <td class="text-green fw-700">${fmtPKR(Number(_set(c).collected || 0))}</td>
          <td class="${Number(_set(c).outstanding || 0) > 0 ? 'text-red fw-700' : 'text-muted'}">${fmtPKR(Number(_set(c).outstanding || 0))}</td>
          <td>${statusBadge(c.status || '—')}</td>
        </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:20px">Nobody left in this period</td></tr>'}
        </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  /* ── COMPLAINTS ────────────────────────────────────────────────────────────
     The other tab `reports2.png` draws that this page did not have. _issAll()
     already normalises maintenance tickets and student complaints into one
     shape for the Complaints register — reused rather than re-derived, so this
     view and that register can never disagree about what an issue is.

     Scoped on the date raised. An issue opened in August and still open in
     September belongs to August's report: that is the month somebody had the
     problem, and a report that quietly moves old open tickets forward hides
     exactly the ones worth seeing. The Open count below says how many of this
     period's issues are still outstanding. */
  if (id === 'complaints') {
    const _keys = new Set(_rptKeys());
    const all = (typeof _issAll === 'function' ? _issAll() : [])
      .filter(i => _keys.has(String(i.date || '').slice(0, 7)))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const nOpen  = all.filter(i => i.status === 'Open').length;
    const nProg  = all.filter(i => i.status === 'In Progress').length;
    const nDone  = all.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
    const cost   = all.reduce((s, i) => s + Number(i.cost || 0), 0);
    const _pg = paginate(all, reportDetailFilter);
    const box = (label, value, tone) => `
      <div style="background:var(--${tone}-dim);border:1px solid var(--border2);border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--${tone});font-weight:700">${escHtml(label)}</div>
        <div style="font-size:24px;font-weight:900;color:var(--${tone});margin-top:4px">${value}</div>
      </div>`;
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">${icon('tool')} Complaints — ${escHtml(periodLabel)}</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('complaints','var(--amber)')}${pdfBtn}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
        ${box('Raised', String(all.length), 'blue')}
        ${box('Still open', String(nOpen + nProg), 'red')}
        ${box('Resolved', String(nDone), 'green')}
        ${box('Repair cost', fmtPKR(cost), 'accent')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Raised</th><th>Issue</th><th>Category</th><th>Room</th><th>Reported by</th><th>Priority</th><th>Status</th><th>Cost</th></tr></thead>
        <tbody>
        ${_pg.slice.map(i => `<tr>
          <td class="text-muted" style="font-size:12px;white-space:nowrap">${i.date ? fmtDate(i.date) : '—'}</td>
          <td class="fw-700">${escHtml(i.title || '—')}</td>
          <td style="font-size:12px">${escHtml(i.category || '—')}</td>
          <td class="text-gold fw-700">${i.roomNo ? '#' + escHtml(i.roomNo) : '—'}</td>
          <td style="font-size:12px">${escHtml(i.by || '—')}</td>
          <td style="font-size:12px">${escHtml(i.priority || '—')}</td>
          <td>${statusBadge(i.status || '—')}</td>
          <td class="${i.cost ? 'text-red fw-700' : 'text-muted'}">${i.cost ? fmtPKR(i.cost) : '—'}</td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">Nothing raised in this period</td></tr>'}
        </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  return '';
}


/* ── Reports — period selection ──────────────────────────────────────────────
   ONE MONTH. This used to read "reportPeriod gains a third value, 'custom'",
   and described a range expressed as the list of YYYY-MM keys it spans. The
   segment that selected a year or a range was removed on 2026-09-22; what
   survives of that design is the SHAPE — every figure is still summed over a
   list of keys through the same _payMatchesMonth / startsWith matcher, so
   there is still one vetted matcher rather than two that can disagree, and a
   wider window would be a change to _rptKeys() alone. */
/* THE YEAR THE PICKER'S PANEL IS SHOWING. Not the reported period — that is
   `reportMonth` alone. This is only where the twelve-month grid is scrolled
   to, so a warden can step to 2025 and back without the report moving under
   them until they choose a month. Reset to the reported month's own year every
   time the panel opens, so it never opens somewhere surprising. */
let _rptPickYear = Number(String(thisMonth()).slice(0, 4));

function _rptMonthsBetween(from, to) {
  const out = [];
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return out;
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  if (y > ey || (y === ey && m > em)) return out;
  for (let guard = 0; guard < 600; guard++) {
    out.push(y + '-' + String(m).padStart(2, '0'));
    if (y === ey && m === em) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

// Transfers inside the report's current period. Every transfer figure on the
// Reports page goes through this, so the overview card, the detail table and
// the CSV export can no longer describe three different windows.
// The prefixes the current view covers.
/** 'YYYY-MM' → 'Aug 2026'. Parses the key by hand rather than through
 *  new Date('YYYY-MM'), which UTC-parses and can slip to the previous month
 *  in Pakistan's timezone. */
function _rptMonthName(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!m) return String(key || '');
  return new Date(Number(m[1]), Number(m[2]) - 1, 1)
    .toLocaleString('default', { month: 'short', year: 'numeric' });
}

/* ONE KEY, AND IT IS A PREFIX. A month is 'YYYY-MM' and a whole year is
   'YYYY' (owner, 2026-09-23) — every matcher on this page is a startsWith or
   _payMatchesMonth, both of which take either, which is why a year needs no
   second code path and did not when this page had a year segment.

   The 'custom' range that also lived here is still gone, with the control that
   selected it. The array stays an array only because eight call sites iterate
   it. */
function _rptKeys() {
  const m = reportMonth || thisMonth();
  return [reportYearly ? m.slice(0, 4) : m];
}

/** The window in words, for a heading. monthLabel() passes a bare year
    through unchanged, so one helper covers both shapes. */
function _rptScopeLabel() { return monthLabel(_rptKeys()[0]); }

/* `_rptMonthOptions()` stood here: every month from the first record to now,
   newest first, to fill a <select>. The grid picker that replaced that select
   on 2026-09-22 needs no list — a year holds twelve months whether or not this
   hostel has records in them, which is the same finding that widened this
   function in the first place (finance Phase 5: a month in which students
   lived but nothing was billed is still a month to report on). What survives
   of it is rptMonthsWithData(), which decides only which cells are dimmed. */

function rptSetMonth(v) {
  reportMonth = v || thisMonth();
  // Picking a month IS asking for that month — the year switch comes off.
  reportYearly = false;
  reportDetailFilter.page = 1;
  // The panel is inside the markup renderPage() is about to replace, so the
  // document-level listeners it installed have to come off first.
  if (typeof rptPickerToggle === 'function') rptPickerToggle(false);
  renderPage('reports');
}

/* `_rptSeries()` stood here: the month-by-month array behind a KPI card's
   sparkline, for revenue, expenses, net and pending. The sparklines were
   removed on 2026-09-23 and it had no other caller.

   What it knew is worth keeping in words, because the next person to want a
   line on this row will hit it: only those four figures have a history this
   app can honestly draw. Occupancy and the roster are answerable per month
   since finance Phase 5, but through _buildRoomStudentIndex() per key — six
   index builds for one 30px graphic — which is why they never had one. */

// The equivalent window immediately before it — what "vs last month" compares to.
function _rptPrevKeys() {
  const shift = (ym, n) => {
    let [y, m] = ym.split('-').map(Number);
    m -= n; while (m < 1) { m += 12; y--; }
    return y + '-' + String(m).padStart(2, '0');
  };
  if (reportYearly) return [String(Number(_rptKeys()[0]) - 1)];
  return [shift(reportMonth || thisMonth(), 1)];
}
function _rptPeriodWord() { return reportYearly ? 'last year' : 'last month'; }

/* ── EXPORT PERIOD ───────────────────────────────────────────────────────────
   Every PDF and CSV must describe the same window the screen is showing.
   They each opened with `reportPeriod==='month' ? thisMonth() : thisYear()`,
   which has no branch for 'custom' — so exporting a Custom Range report handed
   the owner the WHOLE YEAR under a filename naming the range. These two put the
   exports back on _rptKeys(), the same matcher the page itself uses.          */
function _rptExportLabel() {
  // The month on screen. This returned thisMonth(), so March's report,
  // exported in September, was filed under September.
  return _rptKeys()[0] || thisMonth();
}
function _rptExportWord() { return reportYearly ? 'Annual' : 'Monthly'; }

// Every outgoing in a period as ONE list of expense-shaped rows: the expenses
// themselves, plus each funds transfer carrying a category of its own. Anything
// that itemises expenses reads this, so an itemised table always adds up to the
// calcExpenses() total printed beside it.
// Takes a single key or an array of them.
function _rptOutgoings(key) {
  const keys = Array.isArray(key) ? key : [key];
  const hit  = d => keys.some(k => String(d || '').startsWith(k));
  return (DB.expenses || []).filter(e => hit(e.date)).concat(
    (DB.transfers || []).filter(t => hit(t.date)).map(t => ({
      id: t.id, date: t.date, category: FUND_TRANSFER_CAT,
      description: t.description || ('Transfer' + (t.receivedBy ? ' to ' + t.receivedBy : '')),
      amount: Number(t.amount || 0), method: t.method || '', _transfer: true,
    })));
}

/* ── CATEGORY REGISTER ───────────────────────────────────────────────────────
   The owner's requirement for every itemised outgoing view, on screen and in
   the exports alike: one section per category, each row carrying its date,
   description and amount, each section carrying its own total, and a grand
   total across all of them at the end. A flat grid of raw rows cannot answer
   "what did staff salary cost this month" without the reader adding it up by
   hand.

   Ordering is by size, largest category first, so the biggest outgoing is the
   first thing read. Rows inside a category are newest first.

   Categories with nothing recorded in the period are dropped — an empty
   "Plumbing — PKR 0" section is noise, not information.

   Legacy DB.transfers records arrive here already carrying FUND_TRANSFER_CAT
   (see _rptOutgoings), so old transfers and new Fund Transfer expenses land in
   the same section and total together.                                       */
function _rptByCategory(rows) {
  const bucket = new Map();
  (rows || []).forEach(e => {
    const cat = String(e.category || 'Other');
    if (!bucket.has(cat)) bucket.set(cat, []);
    bucket.get(cat).push(e);
  });
  const out = [];
  bucket.forEach((items, cat) => {
    items.sort((a, b) => String(b.date||'').localeCompare(String(a.date||'')));
    out.push({ cat, items, total: items.reduce((s, e) => s + Number(e.amount || 0), 0) });
  });
  out.sort((a, b) => b.total - a.total);
  return out;
}

// Grand total across the grouped sections — stated once so a section subtotal
// and the figure under it can never be computed two different ways.
function _rptGroupsTotal(groups) {
  return (groups || []).reduce((s, g) => s + g.total, 0);
}

function _rptTotals(keys) {
  const pays = DB.payments.filter(p => keys.some(k => _payMatchesMonth(p, k)));
  const exps = _rptOutgoings(keys);
  const rev  = keys.reduce((s, k) => s + calcRevenue(k), 0);

  const totals  = calculateReportTotals(pays);
  const pendingTotals = calculateReportTotals(pays, { filter: p => p.status === 'Pending' });
  const pending = pendingTotals.outstanding;

  // A funds transfer IS an expense — calcExpenses() carries both, so totalExp is
  // the whole outgoing and net is simply revenue minus it. totalTransfers stays
  // on the return for the screens that itemise the two halves.
  const totalExp       = keys.reduce((s, k) => s + calcExpenses(k), 0);
  const totalTransfers = keys.reduce((s, k) => s + calcTransfers(k), 0);

  /* Available Fund is revenue − expenses (owner, 2026-09-18 — see
     calcAvailableFund()). Every screen, card, delta and export on this page
     reads `net`, so this one line moves all of them. `cashIn` stays on the
     return for anything that wants the drawer figure. */
  const cashIn = keys.reduce((s, k) => s + calcCashReceived(k), 0);

  return {
    pays, exps, rev, pending, totalExp, totalTransfers, cashIn,
    net: rev - totalExp,               // Available Fund — revenue − expenses
    earned: rev - totalExp,            // the same figure, under its Phase 3 name
    // The §14 figures, so a caller never has to sum a money column itself again.
    totals, pendingTotals,
    billed:        totals.billed,
    collected:     totals.collected,
    credit:        totals.credit,
    concessions:   totals.concessions,
    extras:        totals.extras,
    admissionFees: totals.admissionFees,
    reversed:      totals.reversed,
    pendingCount:  pendingTotals.count,
    /* False when a total has left the range where integer arithmetic is exact,
       or when the accrual and the layer disagree about the same rupees. A
       report that prints a figure the layer will not vouch for is worse than
       one that says it cannot. */
    safe: totals.safe && rev === totals.collected,
  };
}

// Arrivals less departures inside the window, read off the stays — so a
// re-admitted student's first departure still counts in the month it happened.
function _rptStudentDelta(residents) {
  return residents.filter(r => r.joined).length - residents.filter(r => r.left).length;
}

/* Delta chip. `mode` 'pct' for money, 'abs' for counts. Returns '' when there
   is no prior figure to compare against — a 0% next to a first month of data
   would be a claim the data cannot support. */
function _rptDelta(cur, prev, mode) {
  if (mode === 'abs') {
    if (!cur) return `<span class="rpt-delta rpt-delta--flat">No change</span>`;
    const up = cur > 0;
    return `<span class="rpt-delta rpt-delta--${up?'up':'down'}">${up?'↑':'↓'} ${Math.abs(cur)}</span>`;
  }
  if (!prev) return '';
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  if (pct === 0) return `<span class="rpt-delta rpt-delta--flat">No change</span>`;
  const up = pct > 0;
  return `<span class="rpt-delta rpt-delta--${up?'up':'down'}">${up?'↑':'↓'} ${Math.abs(pct)}%</span>`;
}

function renderReports() {
  const keys = _rptKeys();
  const key  = keys[0] || thisMonth();     // detail views still take a single prefix
  const cur  = _rptTotals(keys);
  const prev = _rptTotals(_rptPrevKeys());
  const { pays, exps, rev, pending, totalExp, net } = cur;
  const vs = _rptPeriodWord();

  // Human label for the window the page is showing, used by the Monthly
  // Overview header and its margin tile.
  /* "This Month" was right while the month was always the current one. With a
     picker on the bar it is a label that can be wrong — set to March, the chart
     header said "This Month" over March's figures — so it names the month. */
  const periodLabel = _rptScopeLabel();

  // "Last updated" means the newest record the report is built from — not the
  // clock. If nothing has been entered, say so rather than showing a date.
  const _latest = [...DB.payments, ...DB.expenses]
    .map(r => r.date).filter(Boolean).sort().pop();
  const withDataNote = _latest
    ? 'Latest record: ' + fmtDate(_latest)
    : 'No records entered yet';

  // PERF: index the period's residents by room ONCE so the per-room / per-type loops below
  // are O(students+rooms) instead of O(rooms×students). FOR THE REPORTED PERIOD, not today
  // (finance Phase 5) — occupancy, headcounts and the room table all read this.
  const _idx = _buildRoomStudentIndex(keys);
  const _residents = _idx.residents;
  const _roomOcc = r => _idx.occ(r);

  const occ=DB.rooms.filter(r=>_roomOcc(r)>0).length;
  const occRate=DB.rooms.length?Math.round(occ/DB.rooms.length*100):0;

  // ── Expense by category ────────────────────────────────────────────────────
  /* Categories carry no colour in settings, so expenseCatHue() in utils.js
     answers it — BY NAME. This read `_RPT_HUES[i % len]` off the category's
     position in DB.settings.expenseCategories, which was fine while that list
     could only be appended to. Since 2026-09-21 the owner can DRAG those rows,
     and a position-keyed colour repaints this whole card every time they do. */
  // Fund Transfer is an ordinary member of settings.expenseCategories now, so
  // it needs no special-casing here. It is still appended defensively for an
  // install whose owner deleted the category from Settings while transfer
  // records exist — without a bar those records would be inside the total but
  // absent from the breakdown, and the two would not add up.
  const catCats = DB.settings.expenseCategories || [];
  const _allCats = catCats.includes(FUND_TRANSFER_CAT)
    ? catCats : catCats.concat([FUND_TRANSFER_CAT]);
  const cats = _allCats.map((cat, i) => {
    const amt = exps.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.amount),0);
    return { cat, amt, i, pct: totalExp>0 ? Math.round(amt/totalExp*100) : 0 };
  }).filter(c=>c.amt>0).sort((a,b)=>b.amt-a.amt);
  const catBars = cats.map(c => `
    <div class="rpt-brow">
      <span class="rpt-brow__d" style="background:${expenseCatHue(c.cat)}"></span>
      <span class="rpt-brow__n" title="${escHtml(c.cat)}">${escHtml(c.cat)}</span>
      <span class="rpt-brow__t"><span class="rpt-brow__f" style="width:${c.pct}%;background:${expenseCatHue(c.cat)}"></span></span>
      <span class="rpt-brow__v">${fmtPKR(c.amt)}</span>
      <span class="rpt-brow__p">${c.pct}%</span>
    </div>`).join('');

  // ── Payment methods (donut + legend) ──────────────────────────────────────
  /* BY NAME, THROUGH THE SHARED AUTHORITY. This used to index into a local
     ramp (`_RPT_METHOD_HUES[i % len]`), so Cash was green here and blue on the
     dashboard, and a method added in Settings shifted every colour below it.
     `i` is no longer read; it stays only so the map signature is unchanged. */
  /* EVERY RUPEE COLLECTED, BY THE METHOD IT ACTUALLY CAME IN (sweep
     2026-09-18). This counted Paid records only, and labelled the result
     "Total Collected" — so a month with part-payments read Rs.48,000 here
     beside a Total Revenue card, a Payments page and a dashboard all saying
     Rs.62,000. Part-payments had been dropped to stop the slice percentages
     summing to under 100%; counting them in the slices AND the total fixes
     that the honest way, and the centre now agrees with the rest of the app.

     Split by the trail, not the record: since finance Phase 1 a month opened
     in cash and topped up by JazzCash keeps "Cash" on the record and carries
     "JazzCash" on the top-up's own entry. Reversals come off the method they
     went back out by. Whatever the trail does not explain goes to the
     record's method, and a trail claiming more than was collected is not
     believed at all — the same rules _cashEvents() dates cash by, so the
     total is exactly calcRevenue() over the same records. Methods found on
     records but missing from Settings are kept, not dropped. */
  const _byMethod = new Map();
  const _add = (m, v) => { const k = m || 'Cash'; _byMethod.set(k, (_byMethod.get(k) || 0) + v); };
  pays.forEach(p => {
    const total = Number(p.amount || 0);
    if (total <= 0) return;
    const trail = (Array.isArray(p.partialPayments) ? p.partialPayments : []).filter(e => e && Number(e.amount) > 0);
    const revs  = (Array.isArray(p.reversals) ? p.reversals : []).filter(e => e && Number(e.amount) > 0);
    const net   = trail.reduce((s, e) => s + Number(e.amount), 0) - revs.reduce((s, e) => s + Number(e.amount), 0);
    if (!trail.length || net > total + 0.5) { _add(p.method, total); return; }
    trail.forEach(e => _add(e.method || p.method, Number(e.amount)));
    revs.forEach(e => _add(e.method || p.method, -Number(e.amount)));
    if (total - net > 0.5) _add(p.method, total - net);
  });
  const methods = [..._byMethod.entries()]
    .map(([m, amt]) => ({ m, amt, color: methodHue(m) }))
    .filter(x => x.amt > 0).sort((a, b) => b.amt - a.amt);
  const methodTotal = methods.reduce((s,x)=>s+x.amt,0);
  /* THE SHARE AND THE AMOUNT ARE TWO COLUMNS, NOT ONE PARENTHESIS (owner ref:
     `reports2.png`). They were "PKR 62,500,000 (62.5%)" on one line, which
     reads fine for one row and stops reading at four: the eye cannot compare
     shares down a column when each one sits at a different x. Aligned, the
     ranking is legible without reading a single digit. One decimal on the
     share for the same reason — whole percents tie constantly at four or five
     methods and a tie tells you nothing. */
  const methodLegend = methods.map(x => `
    <div class="rpt-legend__r">
      <span class="rpt-legend__d" style="background:${x.color}"></span>
      <span class="rpt-legend__n" title="${escHtml(x.m)}">${escHtml(x.m)}</span>
      <span class="rpt-legend__v">${fmtPKR(x.amt)}</span>
      <span class="rpt-legend__p">${methodTotal?(x.amt/methodTotal*100).toFixed(1):'0.0'}%</span>
    </div>`).join('');
  _rptDonutData = methods.map(x=>({label:x.m, value:x.amt, color:x.color}));

  // ── Room type table ───────────────────────────────────────────────────────
  /* OCCUPANCY AND A TOTAL ROW (owner ref: `reports2.png`, which draws six
     columns and foots them). Both are read out of the per-type figures already
     computed here — the total is the SUM OF THE ROWS, not a second query, so
     the foot cannot disagree with the body above it. The occupancy percentage
     is rooms-with-somebody-in-them over rooms of that type, the same ratio the
     Occupancy KPI quotes for the whole hostel; a type with no rooms configured
     shows an em dash rather than a 0% that reads like a failure. */
  /* REVENUE BY THE ROOM THE BILL WAS RAISED AGAINST. It summed Paid records of
     students living in that type TODAY — so a student who had moved rooms, or
     left, took their money with them into the wrong row or out of the table,
     and part-payments were missing (the donut's bug, again). Every collection
     in the period now, each under the room its own record names, the same
     money calcRevenue() counts. */
  const _typeIdByRoomId = new Map(DB.rooms.map(r=>[r.id, r.typeId]));
  const _revByType = new Map();
  pays.forEach(p => {
    if (!(Number(p.amount) > 0)) return;
    const rid = p.roomId || _roomIdByNumber(p.roomNumber) || ((_idx.stayOf.get(p.studentId) || {}).roomId);
    const tid = _typeIdByRoomId.get(rid);
    if (tid != null) _revByType.set(tid, (_revByType.get(tid) || 0) + Number(p.amount));
  });
  const _rtTot = { rooms: 0, occ: 0, vac: 0, rev: 0 };
  const _rtPct = (o, n) => n > 0 ? Math.round(o / n * 100) : null;
  const rtRows=DB.settings.roomTypes.map(type=>{
    const tRooms=DB.rooms.filter(r=>r.typeId===type.id);
    const tOcc=tRooms.filter(r=>_roomOcc(r)>0).length;
    const tRev=_revByType.get(type.id)||0;
    const vac=tRooms.length-tOcc;
    const pct=_rtPct(tOcc, tRooms.length);
    _rtTot.rooms += tRooms.length; _rtTot.occ += tOcc; _rtTot.vac += vac; _rtTot.rev += tRev;
    return `<tr>
      ${''/* THE TYPE READS AS A LABEL (owner, 2026-09-23: "the room seater
             labels are also a little transparent, make it a little vivid").

             The wash was the type's own colour at hex `22` — 13% — with the
             same colour as the ink on top. At 13% over a light card that is
             barely a tint, and the text was a saturated hue on almost-white,
             which is the pairing that reads as washed out however strong the
             ink is. `33` (20%) with a `55` (33%) border gives the chip an edge
             to sit inside, so the colour is stated by the shape rather than by
             the ink alone, and the ink itself is unchanged — it is the one
             part that was already measured for contrast.

             `type.color` is DATA: a hue the owner picked per room type in
             Settings, not a design token, which is why it is composed here
             rather than named in the stylesheet. */}
      <td><span class="rpt-tbl__chip" style="background:${type.color}33;border:1px solid ${type.color}55;color:${type.color}">${escHtml(type.name)}</span></td>
      <td>${tRooms.length}</td>
      <td class="${tOcc?'':'rpt-tbl__z'}">${tOcc}</td>
      <td class="${vac?'':'rpt-tbl__z'}">${vac}</td>
      <td class="${pct===null?'rpt-tbl__z':''}">${pct===null?'—':pct+'%'}</td>
      <td class="${tRev?'':'rpt-tbl__z'}">${fmtPKR(tRev)}</td></tr>`;
  }).join('');
  const rtFoot = rtRows ? `<tr class="rpt-tbl__tot">
      <td>Total</td>
      <td>${_rtTot.rooms}</td>
      <td>${_rtTot.occ}</td>
      <td>${_rtTot.vac}</td>
      <td>${_rtPct(_rtTot.occ,_rtTot.rooms)===null?'—':_rtPct(_rtTot.occ,_rtTot.rooms)+'%'}</td>
      <td>${fmtPKR(_rtTot.rev)}</td></tr>` : '';

  // ── Revenue vs expenses trend (drawn by drawReportTrend after paint) ──────
  /* SIX MONTHS ENDING ON THE MONTH BEING REPORTED — the window the design's
     Financial Performance chart draws, and the one the KPI sparklines read.

     Anchored on the REPORTED month, not on today: with the picker set to March
     the chart used to draw the six months ending now, so the line beside the
     figures described a different window from the figures. The 'custom' branch
     that drew a span of arbitrary length went with the control that produced
     it (2026-09-22); six is now the only width, which is why the chart can
     label its bars in full ("Apr 2026") rather than as bare short months. */
  /* A YEAR DRAWS ITS OWN TWELVE MONTHS; a month draws the six ending on it.

     Both are anchored on what is being REPORTED, never on today — with the
     picker set to March the chart used to draw the six months ending now, so
     the line beside the figures described a different window from the figures.

     The year case is not "six months ending in December": a report on 2026 is
     about 2026, and its chart says January to December of it. Twelve bars in
     the same width is why the label drops the year there — "Jan" under a chart
     whose card already names 2026 is not ambiguous. */
  const trendData = [];
  if (reportYearly) {
    const y = Number(_rptKeys()[0]);
    for (let mo = 0; mo < 12; mo++) {
      const k = y + '-' + String(mo + 1).padStart(2, '0');
      trendData.push({ key: k,
                       lbl: new Date(y, mo, 1).toLocaleString('default', { month: 'short' }),
                       rev: calcRevenue(k), exp: calcExpenses(k) });
    }
  } else {
    const RPT_TREND_MONTHS = 6;
    const _anch = new Date(Number(_rptKeys()[0].slice(0, 4)),
                           Number(_rptKeys()[0].slice(5, 7)) - 1, 1);
    for (let i = RPT_TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(_anch.getFullYear(), _anch.getMonth() - i, 1);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      trendData.push({ key: k,
                       lbl: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
                       rev: calcRevenue(k), exp: calcExpenses(k) });
    }
  }
  _rptTrendData = trendData;

  /* ── Key Highlights ───────────────────────────────────────────────────────
     `_hiCells` stood here: the peak collection, peak profit, peak expense and
     average profit margin across the six months behind the chart, built into
     four tiles.

     REMOVED 2026-09-22 with the owner's redesign, which puts Revenue
     Composition and Collection Performance on that row instead. It was a set
     of facts about a six-month WINDOW sitting in a row of cards about the
     reported MONTH, and every one of them is readable off the bars above it:
     the tallest blue bar is the highest collection, the tallest amber the
     highest expense, and the green line's high point the best month.

     `trendData` is untouched — the chart and the KPI sparklines are its real
     readers, and they always were. */

  // ── Student summary ───────────────────────────────────────────────────────
  // THE PERIOD'S PEOPLE (finance Phase 5). These counted today's statuses and
  // the all-time roster under a report for March; they count March now.
  const nResS    = _residents.length;
  const nJoinS   = _residents.filter(r => r.joined).length;
  const nLeftS   = _residents.filter(r => r.left).length;
  // Blacklisting carries no date, so it can only be stated as of today — and
  // it is labelled so, rather than passed off as a figure for the period.
  const nBlackS  = DB.students.filter(t=>t.status==='Blacklisted').length;
  const sDelta   = _rptStudentDelta(_residents);

  /* THE SPARKLINES ARE GONE (owner, 2026-09-23: "in kpi cards remove the zig
     zag lines").

     They were a SHAPE — six months of movement drawn behind the figure with no
     axis, no scale and no labels — so the only thing a reader could take from
     one was "up a bit" or "down a bit", which the delta line under the figure
     already states in a number. Behind a figure at 50% opacity they also put
     a moving line under text, which is the one place a decorative graphic
     costs legibility.

     The dashboard reached the same conclusion first and replaced its own with
     a ratio bar (dashboard.js, final-layout spec §1); this row is the last
     caller of _dashSpark() and now calls nothing.

     `foot` replaces the `series` slot: an optional block under the caption, in
     FLOW. The occupancy bar is the only user. With the sparkline gone there is
     room for it in the card's own 94px, and in flow it cannot cover the line
     it belongs to — which is what an absolutely-placed one did. */
  const stat = (id, hue, label, value, sub, svg, clickable, foot) => `
    <div class="rpt-stat ${hue}${clickable===false?' rpt-stat--flat':''}${reportDetail===id?' is-on':''}"
         ${clickable===false?'':`onclick="reportDetail='${id}';renderPage('reports')"`}
         ${clickable===false?'':`title="Open the ${label.toLowerCase()} detail"`}>
      <div class="rpt-stat__top">
        <div class="rpt-stat__chip"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></div>
        <div class="rpt-stat__label">${label}</div>
      </div>
      <div class="rpt-stat__val">${value}</div>
      <div class="rpt-stat__sub">${sub}</div>
      ${foot || ''}
    </div>`;

  /* ══ REVENUE COMPOSITION (owner's design, 2026-09-22) ═════════════════════
     What the period's money is MADE OF, beside the Payment Methods donut that
     says how it arrived.

     IT COMPOSES THE BILL, NOT THE COLLECTION, and that is the only honest way
     to draw it. A payment record says what was charged under each head — rent,
     mess, admission fee, extras, less any concession — but a part-payment does
     not say WHICH head it paid. Splitting collected money into five slices
     would mean inventing an allocation the ledger never recorded, which is the
     one thing this codebase does not do. So the centre reads Total Billed and
     the card says so; Total Collected is the figure in the Payment Methods
     donut next to it and on the Revenue KPI above.

     THE FIVE SLICES ARE calculateBill()'s OWN TERMS, in its order, so the
     slices sum to `billed` by construction rather than by coincidence:
       rent + (mess when billed) + extras + admission fee − concession.
     Concessions are money given away and draw as a negative row under the
     donut rather than a slice of it — an arc cannot be negative, and a
     reduction drawn as an area reads as income.

     calculateBill() clamps each record at 0, so a record whose concession
     exceeds its charges contributes 0 to `billed` while its parts still carry
     figures. The slices are scaled to their own sum for the arcs and the
     stated total is that same sum, so the card is internally consistent
     whichever way that lands. */
  const _revParts = (() => {
    let rent = 0, mess = 0, extras = 0, adm = 0, conc = 0;
    pays.forEach(p => {
      const ch = paymentCharges(p, DB.students.find(s => s.id === p.studentId));
      rent += ch.rent;
      mess += ch.messIncluded ? ch.mess : 0;
      extras += Number(p.extraTotal != null ? p.extraTotal
        : (p.extraCharges || []).reduce((s, c) => s + Number((c && c.amount) || 0), 0)) || 0;
      adm  += Number(p.admissionFee != null ? p.admissionFee : p.fee) || 0;
      conc += Number(p.concession != null ? p.concession : p.discount) || 0;
    });
    const slices = [
      { label: 'Rent',          value: rent,   color: _rptCss('--accent', '#2451D6') },
      { label: 'Mess',          value: mess,   color: _rptCss('--green',  '#2ec98a') },
      { label: 'Extra charges', value: extras, color: _rptCss('--violet', '#7c3aed') },
      { label: 'Admission fee', value: adm,    color: _rptCss('--amber',  '#f0a030') },
    ].filter(s => s.value > 0);
    const gross = slices.reduce((s, x) => s + x.value, 0);
    const total = gross - conc;
    return { slices, conc, gross, total,
             rows: slices.map(s => ({ ...s, pct: gross ? s.value / gross * 100 : 0 })) };
  })();
  _rptRevData = _revParts.slices.map(s => ({ label: s.label, value: s.value, color: s.color }));

  /* ══ COLLECTION PERFORMANCE (owner's design, 2026-09-22) ═══════════════════
     One ratio and the six figures behind it. Every one comes off _rptTotals()
     — the §14 layer — rather than being summed here, so this card cannot
     disagree with the KPI row above it about the same rupees.

     THE RATE IS COLLECTED ÷ BILLED, and it is null rather than 0 when nothing
     was billed: "0% collected" on a month with no bills is a failure the data
     never recorded. A hostel that collects arrears from an earlier month can
     read over 100%, which is a true fact about the month and is left alone.

     THE THREE HEADCOUNTS ARE STUDENTS, NOT RECORDS. A student with two records
     in one month — the month's rent and a re-issued bill — is one person, and
     the register they are chased from lists people. Counted off outstandingOf()
     so "unpaid" here and an arrears list elsewhere name the same students. */
  const _collect = (() => {
    const billed = cur.billed, collected = cur.collected;
    const byStudent = new Map();
    pays.forEach(p => {
      const k = p.studentId || p.id;
      const a = byStudent.get(k) || { bill: 0, paid: 0 };
      a.bill += calculateBill(p);
      a.paid += Number(p.amount) || 0;
      byStudent.set(k, a);
    });
    let paid = 0, part = 0, unpaid = 0;
    byStudent.forEach(a => {
      if (a.bill <= 0) return;                 // nothing charged: not a debtor
      if (a.paid >= a.bill - 0.5) paid++;
      else if (a.paid > 0.5)      part++;
      else                        unpaid++;
    });
    return { billed, collected, pending: cur.pending, paid, part, unpaid,
             rate: billed > 0 ? collected / billed * 100 : null };
  })();
  // drawReportCharts() runs 50ms after this markup paints and reads it there.
  _rptGaugePct = _collect.rate;

  /* ══ STUDENT MOVEMENT (owner's design, 2026-09-22) ═════════════════════════
     Four figures that have to add up: starting + admissions − departures =
     ending. All four read the same stays `_residents` the rest of the page
     counts, so the card cannot disagree with the Students tab.

     "Starting" is everyone who was already living here when the month opened —
     residents who did NOT join inside it. A student who joined AND left in the
     same month is in neither Starting nor Ending, and in both of the middle
     two, which is exactly right: they were here, and they are not now. */
  const _move = (() => {
    const admissions = nJoinS, departures = nLeftS;
    const starting = _residents.filter(r => !r.joined).length;
    const ending   = starting + admissions - departures;
    const prevIdx  = _buildRoomStudentIndex(_rptPrevKeys());
    return { admissions, departures, starting, ending,
             prevAdmissions: prevIdx.residents.filter(r => r.joined).length,
             prevDepartures: prevIdx.residents.filter(r => r.left).length };
  })();

  /* AN ICON CHIP, LEFT (owner ref: `reports2.png`). The six tiles were a label,
     a figure and a caption in a stack — identical shapes distinguished only by
     reading them, which is what makes a six-up grid slow. The chip carries the
     tile's hue, so Active/Left/Blacklisted are told apart before the text is
     read. `ico` is optional: a caller that passes none gets the old stack, and
     no existing call site breaks. */
  /* A STUDENT MOVEMENT TILE. Not `tile()` above: that one opens a detail view
     on click and carries a caption under its figure. These four are a READOUT —
     the four numbers balance against each other and there is nothing behind an
     individual one to open — so they are not controls, and `sub` carries a
     delta chip rather than a sentence. */
  const moveTile = (label, value, hue, ico, sub, title) => `
    <div class="rpt-mv ${hue}"${title?` title="${escHtml(title)}"`:''}>
      <span class="rpt-mv__i">${icon(ico,'sm')}</span>
      <div class="rpt-mv__x">
        <div class="rpt-mv__l">${escHtml(label)}</div>
        <div class="rpt-mv__v">${value}</div>
        <div class="rpt-mv__s">${sub}</div>
      </div>
    </div>`;

  const tile = (label, value, sub, hue, det, ico) => `
    <div class="rpt-tile ${hue}${ico?' rpt-tile--ico':''}" onclick="reportDetail='${det}';renderPage('reports')" title="Open detail">
      ${ico ? `<span class="rpt-tile__i">${icon(ico,'sm')}</span>` : ''}
      <div class="rpt-tile__x">
        <div class="rpt-tile__l">${label}</div>
        <div class="rpt-tile__v">${value}</div>
        <div class="rpt-tile__s">${sub}</div>
      </div>
    </div>`;

  return `
  ${''/* THE TAB STRIP (owner ref: `reports2.png`). FIRST ON THE PAGE, above
         the period bar and the exports (owner, 2026-09-18: "move the overview
         and revenue and payments strip above all"). It is the page's own
         navigation; the bar under it sets the window every tab reads.

         Seven of these views existed
         long before this redesign and the only way into one was to click the
         right KPI card, which is not a thing anybody discovers. They are named
         now.

         CANCELLATIONS AND COMPLAINTS ARE BUILT, NOT SKIPPED. I left them out
         on the last pass and wrote a comment here explaining that this app had
         no report screen behind either. That was true of the SCREEN and not of
         the DATA — DB.cancellations carries settlements and _issAll() already
         normalises maintenance and complaints into one shape for the register.
         Both views are in renderReportDetail() now, both export through
         _rptDetailDef() like every other tab, and the reference's eight are all
         real. See those two blocks for how each one is scoped to the period.

         TEN TABS, NOT EIGHT. Revenue, Pending and Available fund are this app's
         own and are not being dropped to make a picture match — the strip is a
         superset of the reference, and it scrolls sideways if a window is too
         narrow for the row. Occupancy is the reference's eighth: this app calls
         the same view Rooms and its own heading reads "Room Occupancy", so it
         is one tab under the name this app already uses rather than two tabs
         showing one table. */}
  <div class="rpt-tabs" role="tablist">
    ${[['','Overview','home'],
       ['financial','Revenue','money'],
       ['payments','Payments','card'],
       ['pending','Pending','clock'],
       ['expenses','Expenses','expense'],
       ['netprofit','Available fund','wallet'],
       ['students','Students','users'],
       ['rooms','Rooms','bed'],
       ['cancellations','Cancellations','transfer'],
       ['complaints','Complaints','tool'],
       /* Owner Funds (2026-09-28): only where the hostel has the opt-in feature
          and the account holds the permission — the same two gates as its page. */
       ...(typeof ofAllowed === 'function' && ofAllowed() ? [['ownerfunds','Owner funds','wallet']] : [])]
      .map(([k,label,ico])=>`
        <button role="tab" class="rpt-tab${(reportDetail||'')===k?' is-on':''}"
                aria-selected="${(reportDetail||'')===k}"
                onclick="reportDetail=${k?`'${k}'`:'null'};renderPage('reports')">
          ${icon(ico,'xs')}${escHtml(label)}
        </button>`).join('')}
  </div>

  <div class="rpt-bar">
    ${''/* ONE CONTROL, AND IT ANSWERS ONE QUESTION (owner, 2026-09-22: "remove
           the month, this year and custom range and make a professional month
           dropdown in which different month and years can be selected").

           There were three: a Month / This Year / Custom Range segment that
           said how WIDE the window was, a <select> of every month on record
           that said where it SAT, and a pair of month inputs that appeared
           only in the third mode. Two of them had to agree for the page to be
           right, and the <select> was a 30-row scroll by the second year.

           A year stepper over a twelve-month grid is two clicks to any month
           in any year, and it states the year rather than leaving it to be
           inferred from whichever option you happen to be looking at. */}
    <div class="rpt-mp">
      <button type="button" class="rpt-mp__btn${(reportMonth||thisMonth())!==thisMonth()?' is-set':''}"
              id="rpt-mp-btn" onclick="rptPickerToggle()"
              aria-haspopup="dialog" aria-expanded="false"
              title="Which month this report covers">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
        <span class="rpt-mp__lbl">${escHtml(reportYearly ? 'Year ' + _rptKeys()[0] : _rptScopeLabel())}</span>
        <svg class="rpt-mp__cv" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="rpt-mp__pop" id="rpt-mp-pop" role="dialog" aria-label="Choose a month" hidden>
        <div class="rpt-mp__yr">
          <button type="button" class="rpt-mp__nav" onclick="rptPickerYear(-1)" aria-label="Previous year">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span class="rpt-mp__y" id="rpt-mp-y" aria-live="polite"></span>
          <button type="button" class="rpt-mp__nav" onclick="rptPickerYear(1)" aria-label="Next year">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
        <div class="rpt-mp__grid" id="rpt-mp-grid"></div>
        ${''/* WHOLE YEAR, AS A SWITCH INSIDE THE SAME PANEL (owner,
               2026-09-23). Not a second control on the bar: the question is
               still "which window", and answering it in one place is why the
               three controls this panel replaced were collapsed in the first
               place.

               A checkbox rather than a 13th cell in the grid, because it is
               not a sibling of the months — it changes what CLICKING a month
               means. Ticked, the report covers the whole year on show and the
               grid marks every month of it; unticked, it returns to the month
               that was selected before, which is why `reportMonth` keeps its
               value rather than being overwritten with a year. */}
        <label class="rpt-mp__yrall">
          <input type="checkbox" id="rpt-mp-all" ${reportYearly?'checked':''}
                 onchange="rptPickerYearly(this.checked)">
          <span>Whole year <b id="rpt-mp-ally">${escHtml(String(_rptPickYear))}</b></span>
        </label>
        <div class="rpt-mp__note">Months with nothing recorded are dimmed &mdash; they can still be opened.</div>
      </div>
    </div>

    ${reportDetail?`<button class="rpt-card__a" onclick="reportDetail=null;renderPage('reports')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      Back to Reports</button>`:''}

    <div class="rpt-bar__end">
      ${''/* EVERY EXPORT ON THE BAR, NONE OF THEM IN A DROPDOWN (owner,
             2026-09-10). An earlier pass folded Print and All Students PDF into
             one menu; the owner's design has them out where they can be seen,
             and it was not mine to replace. `reports2.png` draws the top-right
             cluster as "Export Reports" beside a blue "Print / PDF" — the two
             register PDFs are this app's Export Reports, already named by the
             owner, so they stay spelled out rather than collapsing into a menu
             whose label says less than its contents.

             Export Excel joins them. EXPORT.excel(_rptOverviewDef()) has been
             defined at the foot of this file the whole time with nothing
             calling it — the same whole-report document as Print, in the format
             a warden can total in a spreadsheet.

             Four buttons is wide. The bar wraps (`flex-wrap:wrap`, line 10 of
             reports.css), so at the 1366 floor it takes a second line rather
             than pushing anything off the edge. */}
      ${''/* PRINT / PDF IS BACK, AND IT IS THE PRIMARY BUTTON.

             I removed it on 2026-09-10 reading "remove the print/pdf button in
             reports" as a request to drop it, and reasoned that Quick Reports
             already ran the same document. The owner has now said what it was
             for: "from reports print/pdf option is hidden vhich total summary
             at once" — the whole report, every section, in one press. That is
             a different thing from the two register PDFs beside it, each of
             which is one register, and burying it seven tiles down in Quick
             Reports made the page's most useful control the hardest to find.

             It leads, in the accent, exactly as `reports2.png` draws it. The
             two register buttons stay where they are — they were asked for by
             name and it is not this change's business to move them. */}
      ${''/* FOUR BUTTONS BECOME A MENU AND A PRIMARY (owner's design,
             2026-09-22, which draws "Export ▾" beside a filled "Print / PDF").

             This is a reversal of the 2026-09-10 note that used to sit here,
             and it is the owner's own reversal: that note recorded a decision
             to spell all four out rather than fold them into a menu. The bar
             now also carries the month picker, and four export buttons plus a
             picker wrapped onto a second line at the 1366 floor — which is
             where the design's own answer is better than the old one.

             Print / PDF stays out as the primary, in the accent, because it is
             the one the owner asked for by name ("from reports print/pdf
             option is hidden which total summary at once") and it is the whole
             report in one press. The three that produce a FILE live together
             under the verb they share. */}
      <div class="rpt-xp">
        <button type="button" class="rpt-card__a" id="rpt-xp-btn" onclick="rptExportToggle()"
                aria-haspopup="menu" aria-expanded="false" title="Save this report as a file">
          ${icon('download','xs')} Export
          <svg class="rpt-xp__cv" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="ui-menu rpt-xp__m" id="rpt-xp-menu" role="menu" hidden>
          <div class="ui-menu__t">${escHtml(reportYearly ? 'Year ' + _rptKeys()[0] : _rptScopeLabel())}</div>
          <button role="menuitem" class="ui-menu__item" onclick="rptExportToggle(false);exportReportExcel()">
            ${icon('fileSpreadsheet','xs')} Full report &mdash; Excel</button>
          <button role="menuitem" class="ui-menu__item" onclick="rptExportToggle(false);printReport()">
            ${icon('print','xs')} Full report &mdash; PDF</button>
          <div class="ui-menu__sep"></div>
          ${''/* THE TWO REGISTER PDFs FOLLOW THE PAGE'S MONTH (owner,
                 2026-09-22: "make the all student pdf and payment a month,
                 year dropdowns and make it default to current month").

                 They took the WHOLE register — every student since the hostel
                 opened, every payment ever — under a scope line that said
                 "Complete record". The month they now carry is the one the
                 picker above is already set to, which opens on the current
                 month: one window for the page rather than a third and fourth
                 month control on the same bar, and the menu's own heading
                 states which month is about to be printed so it can never be
                 read as "all of them". */}
          <button role="menuitem" class="ui-menu__item" onclick="rptExportToggle(false);rptStudentsMonthPDF()">
            ${icon('users','xs')} Student register &mdash; PDF</button>
          <button role="menuitem" class="ui-menu__item" onclick="rptExportToggle(false);rptPaymentsMonthPDF()">
            ${icon('card','xs')} Payment register &mdash; PDF</button>
        </div>
      </div>
      ${''/* PRINT / PDF STOOD HERE and it is gone (owner, 2026-09-23:
             "remove the print/pdf button because it does the same work as the
             exports button do").

             It ran printReport() — which is exactly what "Full report — PDF"
             inside the menu beside it runs. Two controls, one document, and
             the filled one was the more prominent of the pair, so the menu
             read as the lesser option when it holds three more exports.

             This reverses the 2026-09-10 decision to give it the accent, which
             was made when the exports were four loose buttons and there was no
             menu for it to be inside. The document it produces has not moved:
             the menu's second item, and the first Quick Report. */}
    </div>
  </div>


  ${''/* THE KPI CARDS BELONG TO OVERVIEW, AND ONLY TO OVERVIEW (owner,
         2026-09-21: "the kpi cards should be only the overview").

         They rendered above every one of the ten tabs. That made them the
         tallest thing on a detail view — six cards of period totals sitting on
         top of, say, the Cancellations register, which is not what that page
         is answering. Worse, they were the page's second navigation: each card
         opens its own detail view, so a warden on the Payments tab had a tab
         strip and a card row that both jumped between the same ten places.

         The strip stays a navigation on Overview, where it is the only one and
         where the figures ARE the subject. A detail view has the tab strip
         above it and the Back control on the bar. */}
  ${reportDetail ? '' : `
  <!-- ══ STAT STRIP — each card opens its own detail view ══ -->
  <div class="rpt-stats">
    ${/* COMPACT, THROUGH THE SAME HELPER THE DASHBOARD KPI ROW USES. These
         printed fmtPKR() in full — "PKR 1,842,000" — beside a dashboard that
         says "PKR 1.84M" for the same rupees, and at real hostel scale the
         full figure simply ran out of card. moneyValue(compact) keeps the
         exact number in the title attribute, so nothing is lost: hover, and
         the reconcilable figure is there. */''}
    ${''/* FIVE CARDS, AND THE THIRD IS NET RESULT (owner's design, 2026-09-22):
           Total Revenue, Total Expenses, Net Result, Pending Payments,
           Occupancy Rate.

           The order is not cosmetic — it is the arithmetic, left to right.
           Revenue minus Expenses IS the Net Result, so the three sit together
           and the third reads as the answer to the two before it. Pending is a
           different question (money not in yet) and belongs after the sum, not
           inside it. Same rule the dashboard KPI row already follows.

           NET RESULT IS NOT AVAILABLE FUND, and the swap is deliberate. This
           card was Available Fund, which since finance Phase 3 is a CASH
           figure — what is actually in the drawer. Net Result is the accrual
           one: what the period earned less what it spent, the number that
           belongs beside Revenue and Expenses because it is literally their
           difference. Available Fund keeps its TAB (owner, 2026-09-22), so the
           cash view is one click away and nothing is lost.

           `cur.net` is already revenue − expenses; it is read under its own
           name here rather than recomputed.

           RESIDENTS IS GONE FROM THIS ROW. It was a sixth card of people in a
           row of money, and the whole of it — starting, ending, who arrived,
           who left — is the Student Movement card below, where it adds up. */}
    ${stat('financial','dh-green','Total Revenue',moneyValue(rev,{compact:true}),
      `${_rptDelta(rev,prev.rev,'pct')} vs ${vs}`,
      '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>')}
    ${stat('expenses','dh-red','Total Expenses',moneyValue(totalExp,{compact:true}),
      `${_rptDelta(totalExp,prev.totalExp,'pct')} vs ${vs}`,
      '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>')}
    ${stat('netprofit','dh-violet','Net Result',
      moneyValue(net,{compact:true,color:net>=0?'var(--green)':'var(--red)'}),
      `${_rptDelta(net,prev.net,'pct')} vs ${vs}`,
      '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>')}
    ${stat('pending','dh-amber','Pending Payments',moneyValue(pending,{compact:true}),
      `${_rptDelta(pending,prev.pending,'pct')} vs ${vs}`,
      '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')}
    ${''/* OCCUPANCY DRAWS A BAR, NOT A SPARKLINE (owner's design). It is a
           RATIO — a part of a whole, where every other card on the row is a
           running figure — and the design draws the one thing a percentage can
           honestly show: how full the bar is. A sparkline would need what
           occupancy was in June, which nothing stores. */}
    ${stat('rooms','dh-blue','Occupancy Rate',`${occRate}%`,
      // Rooms somebody lived in during the period, read off the stays (finance
      // Phase 5) — not the rooms occupied today.
      /* THE BAR SHARES THE CAPTION'S LINE, it does not sit under it.

         Under it, the card grew from 94px to 106 and took the other four with
         it — and this row is held at the students strip's 94 (owner,
         2026-09-10) so the KPI rows on every register line up. Absolutely
         placed it cost no height but covered "8 / 8 rooms occupied", which is
         the fact the percentage is about (owner, 2026-09-23).

         Beside it, it costs nothing and reads as what it is: the measure of
         the sentence it sits next to. It is passed as part of `sub` rather
         than through `foot` because it belongs to that line.

         A plain comment, not `${''/* … *​/}`: this is an ARGUMENT LIST, not a
         template literal, and the interpolating form is a syntax error here. */
      `<span class="rpt-stat__subt">${occ} / ${DB.rooms.length} room${DB.rooms.length!==1?'s':''} occupied</span>` +
      `<span class="rpt-stat__bar"><span style="width:${Math.max(0,Math.min(100,occRate))}%"></span></span>`,
      '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M15 9h.01"/><path d="M15 13h.01"/>')}
  </div>`}

  ${reportDetail ? renderReportDetail(reportDetail, pays, exps, rev, pending, totalExp, net, occ) : `
  ${''/* ══ FINANCIAL PERFORMANCE + PAYMENT METHODS — one row ═══════════════════
         The owner's design, 2026-09-22. What changed from "Monthly Overview":

         BARS FOR THE TWO STOCKS, A LINE FOR THE RESULT. Three area-filled
         lines drew revenue, expenses and profit as the same kind of thing, and
         the two filled areas overlapped so neither could be read where they
         crossed. Revenue and Expenses are independent monthly quantities and
         belong side by side as bars, where their heights compare directly;
         Net Result is the DIFFERENCE between them — a derived line — and it
         crosses zero, which a bar cannot show and an area fill lies about.

         THE HEADER NAMES THE GRAIN. The design draws a "Monthly" select at the
         card's top right. This app has one grain and the month picker on the
         bar already says which window; a select with one option is a control
         that does nothing, so the grain is STATED rather than offered. */}
  <div class="rpt-toprow">
  <div class="rpt-card rpt-fin">
    <div class="rpt-card__h">
      <div class="rpt-card__ht">
        <div class="rpt-card__t">Financial Performance</div>
        <div class="rpt-card__s">Revenue, expenses and net result${reportYearly?' across '+escHtml(_rptKeys()[0]):' for the selected period'}.</div>
      </div>
      <div class="rpt-fin__legend">
        <span class="rpt-k rpt-k--rev"><i></i>Revenue</span>
        <span class="rpt-k rpt-k--exp dh-red"><i></i>Expenses</span>
        <span class="rpt-k rpt-k--net"><i></i>Net Result</span>
      </div>
      ${''/* The design draws a "Monthly" select here. It is STATED, not
             offered: the grain follows the month picker's own whole-year
             switch, so a select would be a second control for one setting. */}
      <span class="rpt-grain">${icon('calendar','xs')} ${reportYearly?'Jan&ndash;Dec':'Monthly'}</span>
    </div>

    ${trendData.some(m=>m.rev||m.exp)
      ? `<div class="rpt-canvas rpt-canvas--fin"><canvas id="rpt-trend"></canvas></div>`
      : `<div class="rpt-none">Nothing recorded in these six months yet.</div>`}

    <div class="mov__foot">
      <span>${icon('info','xs')} All amounts are in ${escHtml(DB.settings.currency||'Rs.')}</span>
      <span>${icon('clock','xs')} ${withDataNote}</span>
      ${''/* §14: the layer returns whether it will vouch for these figures —
           either a total has left the range where integer arithmetic is exact,
           or the accrual authority and the layer disagree about the same
           rupees, which means a record carries a stored status neither of them
           expects and its money is missing from one of the two. Saying so is
           the point of the flag; printing a figure the layer has disowned is
           worse than printing nothing. */}
      ${cur.safe ? '' :
        `<span class="mov__warn">${icon('warning','xs')} These totals could not be
         reconciled against the financial layer — check the payment records
         before relying on them.</span>`}
    </div>
  </div>

    <div class="rpt-card">
      <div class="rpt-card__h">
        <div class="rpt-card__ht">
          <div class="rpt-card__t">Payment Methods</div>
          <div class="rpt-card__s">Distribution of collected payments.</div>
        </div>
      </div>
      ${methods.length?`
      <div class="rpt-donut">
        <div class="rpt-donut__c">
          <canvas id="rpt-methods"></canvas>
          ${''/* Figure first, caption under it. The number is what the hole is
                 for; "Collected" above it made the caption the headline of its
                 own centre. */}
          <div class="rpt-donut__mid"><b>${fmtPKR(methodTotal)}</b><span>Total Collected</span></div>
        </div>
        ${''/* FOUR COLUMNS, ONE ROW EACH (owner's design). The legend was a
               stack with the donut's own height distributed through it, so two
               methods sat 160px apart and the card read as mostly empty. Dot,
               name, amount, share — the share last and right-aligned, because
               that is the column the eye ranks down. */}
        <div class="rpt-legend">${methodLegend}</div>
      </div>`:`<div class="rpt-none">No payments collected in this period.</div>`}
    </div>
  </div>

  ${''/* ══ REVENUE COMPOSITION · EXPENSE BREAKDOWN · COLLECTION PERFORMANCE ════
         The owner's design, 2026-09-22. Three cards that answer the three
         questions a month's money raises: what it was made of, where it went,
         and how much of it actually arrived.

         KEY HIGHLIGHTS IS GONE FROM THIS ROW, and it is a removal, not a move.
         It named the peak collection, peak profit, peak expense and average
         margin across the six months behind the chart — facts about a WINDOW,
         sitting in a row of cards about the reported MONTH, and every one of
         them is readable off the bars above. The design replaces it with the
         two cards the owner asked for by name ("collection performance,
         revenue composition must"). */}
  <div class="rpt-row3">
    <div class="rpt-card">
      <div class="rpt-card__h">
        <div class="rpt-card__ht">
          <div class="rpt-card__t">Revenue Composition</div>
          ${''/* BILLED, NOT COLLECTED, and the subtitle says so. See the
                 _revParts note above for why a part-payment cannot be split
                 into heads without inventing the allocation. */}
          <div class="rpt-card__s">What the period&rsquo;s bills are made of.</div>
        </div>
      </div>
      ${_revParts.rows.length?`
      <div class="rpt-donut rpt-donut--sm">
        <div class="rpt-donut__c">
          <canvas id="rpt-revmix"></canvas>
          <div class="rpt-donut__mid"><b>${fmtPKR(_revParts.total)}</b><span>Total Billed</span></div>
        </div>
        <div class="rpt-legend">
          ${_revParts.rows.map(r=>`
            <div class="rpt-legend__r">
              <span class="rpt-legend__d" style="background:${r.color}"></span>
              <span class="rpt-legend__n" title="${escHtml(r.label)}">${escHtml(r.label)}</span>
              <span class="rpt-legend__v">${fmtPKR(r.value)}</span>
              <span class="rpt-legend__p">${r.pct.toFixed(1)}%</span>
            </div>`).join('')}
          ${''/* A CONCESSION IS NOT A SLICE. It is money given away — it makes
                 the total smaller — and an arc cannot be negative. It reads as
                 the deduction it is, under the parts it comes off. */}
          ${_revParts.conc>0?`
            <div class="rpt-legend__r rpt-legend__r--neg">
              <span class="rpt-legend__d rpt-legend__d--hollow"></span>
              <span class="rpt-legend__n">Concessions</span>
              <span class="rpt-legend__v">&minus;${fmtPKR(_revParts.conc)}</span>
              <span class="rpt-legend__p">&minus;${(_revParts.gross?_revParts.conc/_revParts.gross*100:0).toFixed(1)}%</span>
            </div>`:''}
        </div>
      </div>`:`<div class="rpt-none">Nothing was billed in this period.</div>`}
    </div>

    <div class="rpt-card">
      <div class="rpt-card__h">
        <div class="rpt-card__ht">
          <div class="rpt-card__t">Expense Breakdown</div>
          <div class="rpt-card__s">Expenses by category.</div>
        </div>
        ${''/* The design's "View Details →". It opens the expenses detail view
               this page already builds — the same one the Expenses KPI card
               opens — rather than a second screen saying the same thing. */}
        <button class="rpt-card__a" onclick="reportDetail='expenses';renderPage('reports')"
                title="Every expense in this period, by category">
          View Details
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
      ${cats.length?`
        ${''/* BIGGEST FIRST, AND IT SCROLLS BY HAND WHEN IT OVERFLOWS (owner,
               2026-09-22: "if the categories move out from card then make it
               draggable showing the large percentage categories first").

               `cats` is already sorted by amount descending, so the rows that
               matter are the ones on screen before any scrolling happens — the
               list can be cut off at the bottom without cutting off the answer.
               A hostel with twenty categories gets a scroll rather than a card
               that grows until it pushes the row below it off the page.

               DRAG TO SCROLL, not just a wheel: rptDragScroll() binds
               pointer-drag panning on the list, which is how the owner asked
               for it and how a table is panned on the payments register
               already. The scrollbar stays visible as the affordance. */}
        <div class="rpt-bars rpt-bars--scroll" id="rpt-expbars">${catBars}</div>
        <div class="rpt-btot"><span>Total Expenses</span><b>${fmtPKR(totalExp)}</b></div>`
      :`<div class="rpt-none">No expenses recorded in this period.</div>`}
    </div>

    <div class="rpt-card">
      <div class="rpt-card__h">
        <div class="rpt-card__ht">
          <div class="rpt-card__t">Collection Performance</div>
          <div class="rpt-card__s">How much of the billing arrived.</div>
        </div>
        <button class="rpt-card__a" onclick="reportDetail='pending';renderPage('reports')"
                title="Every unpaid balance in this period">
          View Details
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
      ${_collect.rate===null?`<div class="rpt-none">Nothing was billed in this period.</div>`:`
      <div class="rpt-coll">
        <div class="rpt-gauge">
          <canvas id="rpt-gauge"></canvas>
          <div class="rpt-gauge__mid">
            <b>${_collect.rate.toFixed(1)}%</b><span>Collection Rate</span>
          </div>
        </div>
        <div class="rpt-coll__f">
          <div class="rpt-fact"><span>Amount Billed</span><b>${fmtPKR(_collect.billed)}</b></div>
          <div class="rpt-fact"><span>Amount Collected</span><b>${fmtPKR(_collect.collected)}</b></div>
          <div class="rpt-fact"><span>Pending Amount</span><b class="${_collect.pending>0?'is-neg':''}">${fmtPKR(_collect.pending)}</b></div>
          <div class="rpt-fact rpt-fact--sep"><span>Paid Students</span><b>${_collect.paid}</b></div>
          <div class="rpt-fact"><span>Partially Paid</span><b>${_collect.part}</b></div>
          <div class="rpt-fact"><span>Unpaid Students</span><b class="${_collect.unpaid>0?'is-neg':''}">${_collect.unpaid}</b></div>
        </div>
      </div>`}
    </div>
  </div>

  ${''/* ══ ROOM TYPE PERFORMANCE + STUDENT SUMMARY — one row (owner ref:
         reports2.png). Student Summary ran the full width of the page for six
         tiles, which made each one 230px wide holding a two-digit number. The
         reference sets it beside the room table at roughly equal width, three
         tiles across and two down, and the two read as one answer: how the
         rooms are doing, and who is in them. */}
  <div class="rpt-row4">
    <div class="rpt-card">
      <div class="rpt-card__h">
        <div class="rpt-card__ht">
          <div class="rpt-card__t">Room Type Performance</div>
          <div class="rpt-card__s">Occupancy and revenue by room type.</div>
        </div>
      </div>
      ${rtRows?`<div class="rpt-tbl-wrap">
        <table class="rpt-tbl">
          ${''/* "Total Rooms" is "Rooms" here: the column beside it is
                 Occupied and the one after Vacant, so what it totals is not in
                 question, and the word cost the narrowest table on the page a
                 column's worth of width. */}
          <thead><tr><th>Type</th><th>Rooms</th><th>Occupied</th><th>Vacant</th><th>Occupancy</th><th>Revenue</th></tr></thead>
          <tbody>${rtRows}${rtFoot}</tbody>
        </table></div>`:`<div class="rpt-none">No room types configured.</div>`}
    </div>

    <div class="rpt-card">
      <div class="rpt-card__h">
        <div class="rpt-card__ht">
          <div class="rpt-card__t">Student Movement</div>
          <div class="rpt-card__s">Changes in student count this period.</div>
        </div>
      </div>
      ${''/* FOUR FIGURES THAT ADD UP (owner's design, 2026-09-22):
             starting + admissions − departures = ending, and all four come off
             the same stays the rest of the page counts.

             STUDENT SUMMARY'S SIX TILES ARE REPLACED, NOT RESHUFFLED. Those
             were Residents, Joined, Left, Blacklisted, Total Rooms and
             Payments — three headcounts, a standing status, a room count that
             belongs to the table beside it, and a record count. Only the first
             three were about MOVEMENT, and none of them balanced against the
             others, so the card could not be checked by reading it. This one
             can: the top row is what changed, the bottom row is the count
             before and after.

             Blacklisted carried "On record today" because blacklisting stores
             no date — a standing fact in a card about a period. It is on the
             Students tab, which is where a status without a date belongs. */}
      <div class="rpt-move">
        ${''/* THE CAPTIONS ARE SHORT BECAUSE THE TILE IS. Four of these share
               a third of a row: "↑ 50% vs last month" and "Already here on
               the 1st" both clipped mid-word, and a clipped caption is worse
               than a brief one. The delta chip carries its own arrow and
               figure — what it compares against is the same "vs last month"
               every other delta on this page means, and the card header
               already names the period. The full sentence is each tile's
               title. */}
        ${moveTile('New Admissions', _move.admissions, 'dh-green', 'userCheck',
          _rptDelta(_move.admissions, _move.prevAdmissions, 'pct'),
          'Students admitted in ' + monthLabel(keys[0]))}
        ${moveTile('Departures', _move.departures, 'dh-red', 'logout',
          _rptDelta(_move.departures, _move.prevDepartures, 'pct'),
          'Students who left in ' + monthLabel(keys[0]))}
        ${moveTile('Starting Students', _move.starting, 'dh-slate', 'users',
          'On the 1st', 'Already living here when the month opened')}
        ${moveTile('Ending Students', _move.ending, 'dh-blue', 'users',
          'At month end', 'On the roster when the month closed')}
      </div>
    </div>


  ${''/* ══ QUICK REPORTS (owner ref: reports2.png) ═══════════════════════════
         Seven documents this app can already produce, in one place. Every one
         of them runs the export its own register runs — the same definition,
         the same engine, the same filters — so a report pulled from here and
         the same report pulled from its page cannot differ.

         Cancellations and Complaints appear here AND as tabs now. That is not
         a duplicate: the tab is the register on screen for the period, this is
         the whole document as a file. Somebody asking their office for a
         "cancellations report" wants the file.

         Pending Payments is the one that is not a plain export: it opens the
         payments register filtered to unpaid balances, because a warden asking
         for that list is going to ACT on it — mark paid, send a reminder — and
         a PDF cannot be acted on. The Export control there produces the file
         if a file is what they were after. */}
    <div class="rpt-card rpt-quick">
      <div class="rpt-card__h">
        <div class="rpt-card__ht">
          <div class="rpt-card__t">Quick Reports</div>
          <div class="rpt-card__s">Generate detailed reports.</div>
        </div>
        ${''/* "View All Reports →" sat in this header. In a third-of-a-row
               card it was a second control beside a title and a line of
               description, and it ran printReport() — which is the Print / PDF
               button on the bar above and the first item in the list below.
               Three routes to one document on one screen; this was the one
               that named it least clearly. */}
      </div>
    <div class="rpt-quick__g">
      ${''/* Titled as the reference titles them — these are DOCUMENT names, and
             "Monthly Financial Report" is what a warden asks their office for.
             The sentence under each is this app's own, saying what is actually
             in the file. */}
      ${''/* FOR THE PERIOD ABOVE, AS THE NOTE SAYS (finance Phase 5). Five of
             these ran the REGISTER's export — exportStudentsPDF() and the rest —
             which prints whatever that register's own page was last filtered to:
             "Student List" was everyone on the roster today, whatever month this
             page was set to. They now run this page's own period documents, the
             same ones each tab's Export button produces.

             PENDING IS A DOCUMENT TOO NOW (owner, 2026-09-23: "the real bug in
             the pending payments report which redirects to the payments page
             still owing students and not presenting the pendings ... student
             record pdf").

             It alone called openPaymentsPending(), which NAVIGATES — and that
             function reads dashMonth(), the DASHBOARD's month. Run from here
             with Reports set to August it left the page, opened the payments
             register, and filtered it to whatever month the dashboard happened
             to be on. So the one item on this list that was not a file was
             also the one that could show the wrong month, in a card whose own
             note promises "for the period above".

             It is `downloadDetailPDF('pending')` now: the same document the
             Pending tab's own Export button produces, scoped to this page's
             month like the six beside it. openPaymentsPending() is untouched
             and still correct where it belongs — on the dashboard, which is
             the page dashMonth() is about. */}
      ${[['Monthly Financial Report','Collection, expenses and profit','chart','printReport()'],
         ['Student List Report','Everyone who lived here in the period','users',"downloadDetailPDF('students')"],
         ['Room Occupancy Report','Room by room, and who was in them','bed',"downloadDetailPDF('rooms')"],
         ['Pending Payments Report','Every student still owing, for the period','clock',"downloadDetailPDF('pending')"],
         ['Expense Report','By category, with a subtotal each','expense',"downloadDetailPDF('expenses')"],
         ['Cancellations Report','Departures in the period, and their settlements','transfer',"downloadDetailPDF('cancellations')"],
         ['Complaints Report','Every issue raised in the period, and its state','tool',"downloadDetailPDF('complaints')"]]
        .map(q=>`
          <button class="rpt-quick__b" onclick="${q[3]}" title="${escHtml(q[0])}">
            <span class="rpt-quick__i">${icon(q[2],'sm')}</span>
            <span class="rpt-quick__x">
              <span class="rpt-quick__t">${escHtml(q[0])}</span>
              <span class="rpt-quick__s">${escHtml(q[1])}</span>
            </span>
          </button>`).join('')}
      </div>
    </div>
  </div>
  `}

  `;
}

/* ── Reports v5 — period controls + charts ───────────────────────────────── */
/* _RPT_METHOD_HUES IS GONE, AND SO IS _RPT_HUES.

   Payment-method colour is one question with one answer and it lives in
   utils.js as methodHue(); this file's own ramp was the reason the two screens
   disagreed about the same wallet.

   _RPT_HUES painted EXPENSE CATEGORIES and survived that sweep, because the
   dashboard does not draw them and there was no second opinion to reconcile.
   It moved to utils.js as EXPENSE_CAT_HUES on 2026-09-21, when the categories
   became draggable in Settings: the ramp was indexed by a category's POSITION,
   so a drag would have repainted the card. expenseCatHue() keys it by name. */
let _rptTrendData = [];
let _rptDonutData = [];    // Payment Methods — how the money arrived
let _rptRevData   = [];    // Revenue Composition — what the bills are made of
let _rptGaugePct  = null;  // Collection Performance — collected ÷ billed, or null
let _rptTrendChart = null;
let _rptDonutChart = null;
let _rptRevChart   = null;
let _rptGaugeChart = null;

/* ── THE MONTH PICKER ────────────────────────────────────────────────────────
   A button that names the month, and a panel holding a year stepper over a
   twelve-month grid (owner, 2026-09-22). It replaces a three-way Month / This
   Year / Custom Range segment, a <select> of every month the data knows about,
   and a pair of <input type="month"> boxes — four controls where the question
   is only ever "which month".

   A GRID, NOT A LIST. The <select> listed every month from the first record to
   now, newest first, which is a scroll of 30+ rows by the second year and
   gives no sense of a year as a shape. Twelve cells under a year stepper is
   two clicks to any month in any year, and the year you are looking at is
   stated rather than inferred from the option you happen to be near.

   MONTHS WITH NOTHING RECORDED ARE DIMMED, NOT DISABLED. A month in which
   students lived but nothing was billed or spent is still a month to report on
   — who was here — which is the finding that widened the old <select> in the
   first place (finance Phase 5). Dimming says "expect little"; disabling would
   say "you may not look", and that would be wrong. */
function rptMonthsWithData() {
  const out = new Set();
  const see = k => { if (/^\d{4}-\d{2}$/.test(k || '')) out.add(k); };
  (DB.payments  || []).forEach(p => see(_payMonthKey(p)));
  (DB.expenses  || []).forEach(e => see(String(e.date || '').slice(0, 7)));
  (DB.transfers || []).forEach(x => see(String(x.date || '').slice(0, 7)));
  (DB.students  || []).forEach(s => see(_toMonthKey(s.joinDate)));
  return out;
}

function rptPickerToggle(force) {
  const pop = document.getElementById('rpt-mp-pop');
  if (!pop) return;
  const open = force != null ? force : pop.hasAttribute('hidden');
  if (open) {
    // Always opens on the year of the month being reported, never on wherever
    // it was left last time.
    _rptPickYear = Number(String(reportMonth || thisMonth()).slice(0, 4));
    rptPickerPaint();
    pop.removeAttribute('hidden');
    document.addEventListener('mousedown', _rptPickerAway, true);
    document.addEventListener('keydown', _rptPickerEsc, true);
  } else {
    pop.setAttribute('hidden', '');
    document.removeEventListener('mousedown', _rptPickerAway, true);
    document.removeEventListener('keydown', _rptPickerEsc, true);
  }
  const btn = document.getElementById('rpt-mp-btn');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}
function _rptPickerAway(e) {
  if (!e.target.closest || !e.target.closest('.rpt-mp')) rptPickerToggle(false);
}
/* CAPTURE PHASE. app.js binds a bubble-phase Escape of its own, so a panel
   that waits for the bubble never sees the key it was closed by. */
function _rptPickerEsc(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  rptPickerToggle(false);
  const btn = document.getElementById('rpt-mp-btn');
  if (btn) btn.focus();
}

function rptPickerYear(step) {
  _rptPickYear += step;
  rptPickerPaint();
}

/* Repaints the panel in place. The page is NOT re-rendered while stepping
   years: nothing about the report has changed yet, and a full renderPage()
   would tear down the panel the warden is still using. */
/* Ticking it reports the year the PANEL is showing; unticking returns to the
   month that was selected before, which is why reportMonth is not overwritten.
   A tick also moves the anchor's year to the panel's, so stepping to 2025 and
   ticking reports 2025 rather than silently reporting the anchor's year. */
function rptPickerYearly(on) {
  reportYearly = !!on;
  if (on) {
    const mm = String(reportMonth || thisMonth()).slice(5, 7) || '01';
    reportMonth = _rptPickYear + '-' + mm;
  }
  reportDetailFilter.page = 1;
  rptPickerToggle(false);
  renderPage('reports');
}

function rptPickerPaint() {
  const yEl = document.getElementById('rpt-mp-y');
  if (yEl) yEl.textContent = String(_rptPickYear);
  const allY = document.getElementById('rpt-mp-ally');
  if (allY) allY.textContent = String(_rptPickYear);
  const grid = document.getElementById('rpt-mp-grid');
  if (!grid) return;
  const has = rptMonthsWithData();
  const sel = reportMonth || thisMonth();
  const now = thisMonth();
  // Reporting a whole year, every month of that year is in the window.
  const selYear = reportYearly && String(_rptPickYear) === String(sel).slice(0, 4);
  grid.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const k = _rptPickYear + '-' + String(i + 1).padStart(2, '0');
    const cls = ['rpt-mp__m'];
    if (selYear || k === sel) cls.push('is-on');
    if (k === now) cls.push('is-now');
    if (!has.has(k)) cls.push('is-empty');
    const name = new Date(_rptPickYear, i, 1).toLocaleString('default', { month: 'short' });
    return '<button type="button" class="' + cls.join(' ') + '" data-k="' + k + '"' +
           (k === sel ? ' aria-current="true"' : '') +
           ' onclick="rptSetMonth(\'' + k + '\')"' +
           ' title="' + escHtml(monthLabel(k)) + (has.has(k) ? '' : ' — nothing recorded') + '">' +
           escHtml(name) + '</button>';
  }).join('');
}

function _rptCss(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

function drawReportCharts() {
  if (typeof Chart === 'undefined') return;
  const grid = _rptCss('--border', 'rgba(255,255,255,.1)');
  const ink  = _rptCss('--text3', '#909090');

  /* ── THE HOVER CARD FOLLOWS THE THEME (owner, 2026-09-23: "the pop hover
     card are not changing background colour with the light/dark mode
     changes").

     Chart.js paints its tooltip from its OWN defaults — a dark translucent
     panel with white text — and nothing in this app ever overrode them, so on
     a light page the hover card stayed dark while every other surface was
     white. It was not a stale-repaint problem like the grid: it was never
     themed at all, in either direction.

     Read here, once, and spread across all four charts, so a fifth cannot be
     added with a fifth opinion about what a tooltip looks like. */
  const tip = {
    backgroundColor: _rptCss('--card', '#fff'),
    titleColor:      _rptCss('--text', '#111'),
    bodyColor:       _rptCss('--text2', '#444'),
    borderColor:     _rptCss('--border2', 'rgba(0,0,0,.15)'),
    borderWidth:     1,
  };

  // ── Financial performance: two bars and a line ────────────────────────────
  /* THE DESIGN'S CHART, AND THE SHAPE IS THE ARGUMENT (owner, 2026-09-22).

     Revenue and Expenses are independent monthly quantities: bars, side by
     side, where the heights compare directly and a month with nothing recorded
     is visibly absent rather than a line passing through zero.

     Net Result is their DIFFERENCE — derived, and it crosses zero. A bar
     cannot show a negative month honestly next to positive ones at this size, and
     the area fill the old chart used implied an area under a difference, which
     is not a quantity of anything. It is a plain line with points, on the same
     axis, because the design draws it that way and because a second axis would
     let the line sit above the bars while being worth less than them.

     tension 0 — straight point-to-point segments. Curve smoothing invents
     intermediate values the ledger never recorded: a bowed line between two
     months implies a mid-month figure, and it can dip below zero between two
     positive points. */
  if (_rptTrendChart) { _rptTrendChart.destroy(); _rptTrendChart = null; }
  const tc = document.getElementById('rpt-trend');
  if (tc && _rptTrendData.length) {
    const revHex = _rptCss('--accent', '#2451D6');
    /* `--warning-solid`, not `--amber` (owner, 2026-09-23). `--amber` aliases
       `--warning-fg`, which is an INK — #7A5309 in the light theme — and the
       bars painted as dark olive. The solid is the same role at fill weight.
       See tokens.css for what a solid is and when to add another. */
    /* RED, NOT AMBER, since 2026-09-28 (owner: "use red everywhere" for
       expenses) — the same colour the dashboard trend draws them in. */
    const expHex = expenseColor();
    const netHex = _rptCss('--green',  '#16a34a');
    const revVals = _rptTrendData.map(m => m.rev);
    const expVals = _rptTrendData.map(m => m.exp);
    _rptTrendChart = new Chart(tc.getContext('2d'), {
      data: {
        labels: _rptTrendData.map(m => m.lbl),
        datasets: [
          { type: 'bar', label: 'Revenue', data: revVals,
            backgroundColor: revHex, borderRadius: 4, borderSkipped: false,
            categoryPercentage: 0.62, barPercentage: 0.9, order: 2 },
          { type: 'bar', label: 'Expenses', data: expVals,
            backgroundColor: expHex, borderRadius: 4, borderSkipped: false,
            categoryPercentage: 0.62, barPercentage: 0.9, order: 2 },
          { type: 'line', label: 'Net Result',
            data: revVals.map((v, i) => v - expVals[i]),
            borderColor: netHex, backgroundColor: netHex, borderWidth: 2.4,
            fill: false, tension: 0, pointRadius: 3.5, pointHoverRadius: 6,
            pointBackgroundColor: netHex, pointBorderColor: '#fff',
            pointBorderWidth: 1.5, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          datalabels: { display: false },
          legend: { display: false },   // the legend in the card header carries it
          tooltip: {
            ...tip,
            usePointStyle: true, padding: 12, boxPadding: 5, cornerRadius: 10,
            titleFont: { size: 12, weight: '700' }, bodyFont: { size: 12 },
            callbacks: { label: c => '  ' + c.dataset.label + ':  ' + fmtPKR(c.parsed.y) },
          },
        },
        scales: {
          x: { stacked: false, grid: { display: false },
               ticks: { color: ink, font: { size: 11 } } },
          y: { beginAtZero: true, border: { display: false },
               grid: { color: grid },
               ticks: { color: ink, font: { size: 11 },
                        callback: v => Math.abs(v) >= 1000000 ? (v / 1000000) + 'M'
                                     : Math.abs(v) >= 1000 ? (v / 1000) + 'K' : v } },
        },
      },
    });
    _chartFontFix(_rptTrendChart);
  }

  // ── Payment methods ───────────────────────────────────────────────────────
  if (_rptDonutChart) { _rptDonutChart.destroy(); _rptDonutChart = null; }
  const dc = document.getElementById('rpt-methods');
  if (dc && _rptDonutData.length) {
    _rptDonutChart = new Chart(dc.getContext('2d'), {
      type: 'doughnut',
      data: { labels: _rptDonutData.map(d => d.label),
              datasets: [{ data: _rptDonutData.map(d => d.value),
                           backgroundColor: _rptDonutData.map(d => d.color),
                           borderWidth: 0, hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          datalabels: { display: false },
          legend: { display: false },   // the legend beside it carries the figures
          tooltip: { ...tip, cornerRadius: 10, padding: 10,
                     callbacks: { label: c => c.label + ': ' + fmtPKR(c.parsed) } }
        }
      }
    });
    _chartFontFix(_rptDonutChart);
  }

  // ── Revenue composition ───────────────────────────────────────────────────
  /* The same ring as Payment Methods and deliberately so: the two sit side by
     side a row apart and answer "what was it made of" and "how did it arrive".
     Two different shapes for two breakdowns of the same money would imply a
     difference in kind that is not there. */
  if (_rptRevChart) { _rptRevChart.destroy(); _rptRevChart = null; }
  const rc = document.getElementById('rpt-revmix');
  if (rc && _rptRevData.length) {
    _rptRevChart = new Chart(rc.getContext('2d'), {
      type: 'doughnut',
      data: { labels: _rptRevData.map(d => d.label),
              datasets: [{ data: _rptRevData.map(d => d.value),
                           backgroundColor: _rptRevData.map(d => d.color),
                           borderWidth: 0, hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          datalabels: { display: false },
          legend: { display: false },
          tooltip: { ...tip, cornerRadius: 10, padding: 10,
                     callbacks: { label: c => c.label + ': ' + fmtPKR(c.parsed) } },
        },
      },
    });
    _chartFontFix(_rptRevChart);
  }

  // ── Collection rate gauge ────────────────────────────────────────────────
  /* ONE ARC AND ITS REMAINDER, not a pie of one value. The card states the
     percentage in the middle; the ring's job is to make "how far along" legible
     without reading it. Drawn as a full ring rather than a half-dial because
     the two cards beside it are rings and a dial here would read as a different
     kind of measurement.

     OVER 100% IS A REAL MONTH. A hostel collecting August's arrears in
     September bills less than it takes, and the figure says so — the ARC is
     clamped at a full ring because it cannot draw more than one, and the exact
     percentage is stated in the centre where it is not clamped. */
  if (_rptGaugeChart) { _rptGaugeChart.destroy(); _rptGaugeChart = null; }
  const gc = document.getElementById('rpt-gauge');
  if (gc && typeof _rptGaugePct === 'number') {
    const done = Math.max(0, Math.min(100, _rptGaugePct));
    const hue  = done >= 90 ? _rptCss('--green', '#16a34a')
               : done >= 60 ? _rptCss('--amber', '#f0a030')
                            : _rptCss('--red',   '#ef4444');
    _rptGaugeChart = new Chart(gc.getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['Collected', 'Outstanding'],
              datasets: [{ data: [done, 100 - done],
                           backgroundColor: [hue, _rptCss('--dash-track', 'rgba(140,140,140,.22)')],
                           borderWidth: 0, hoverOffset: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '76%',
        plugins: {
          datalabels: { display: false },
          legend: { display: false },
          tooltip: { enabled: false },   // the centre already states the figure
        },
      },
    });
    _chartFontFix(_rptGaugeChart);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FUNDS TRANSFER
// ════════════════════════════════════════════════════════════════════════════
function showEditTransferModal(id) {
  const tr = (DB.transfers||[]).find(x=>x.id===id);
  if(!tr) return;
  showModal('modal-md','✏️ Edit Funds Transfer',`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--text2)">
      Editing transfer recorded on <strong>${fmtDate(tr.date)}</strong>
    </div>
    <div class="form-grid">
      <div class="field"><label>Transfer Method *</label>
        <select class="form-control" id="fe-trmethod">
          ${['Cash','Bank Transfer','JazzCash','EasyPaisa'].map(m=>`<option ${tr.method===m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Amount (PKR) *</label>
        <input class="form-control" id="fe-tramt" type="number" value="${tr.amount}">
      </div>
      <div class="field"><label>Date *</label>
        <input class="form-control cdp-trigger" id="fe-trdate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${tr.date||today()}">
      </div>
      <div class="field"><label>Received By</label>
        <input class="form-control" id="fe-trrec" value="${escHtml(tr.receivedBy||'')}">
      </div>
      <div class="field col-full"><label>Description / Notes</label>
        <textarea class="form-control" id="fe-trdesc" rows="2">${escHtml(tr.description||'')}</textarea>
      </div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-primary" onclick="submitEditTransfer('${id}')">${icon('save', 'sm')} Save</button>`);
}

async function submitEditTransfer(id) {
  const tr = (DB.transfers||[]).find(x=>x.id===id);
  if(!tr) return;
  const amt = parseFloat(document.getElementById('fe-tramt').value);
  const method = document.getElementById('fe-trmethod').value;
  const date = document.getElementById('fe-trdate').value;
  if(!amt||!date){toast('Amount and date are required','error');return;}
  tr.amount = amt;
  tr.method = method;
  tr.date = date;
  tr.receivedBy = document.getElementById('fe-trrec').value.trim();
  tr.description = document.getElementById('fe-trdesc').value.trim();
  tr.editedAt = today();
  await saveDB();
  closeModal();
  // A legacy transfer is editable from the Expenses table and the Reports
  // category register — refresh whichever page the owner is on.
  renderPage(currentPage);
  toast('Transfer updated','success');
}

async function deleteTransfer(id) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  showConfirm('Delete transfer record?','This cannot be undone.',(async ()=>{
    DB.transfers = (DB.transfers||[]).filter(x=>x.id!==id);
    // Refresh whichever page the row was deleted from — Expenses and the
    // Reports register both list transfers now.
    await saveDB(); renderPage(currentPage); toast('Transfer deleted','info');
  }));
}



/* ══ THE REPORTS EXPORTS ═══════════════════════════════════════════════════
   Seven detail reports and one overview, all from the global export engine.

   What this replaced: `downloadReportDetailPDF` built seven documents inline,
   `downloadDetailPDF` built the same seven again with different columns, and
   `downloadDetailCSV` built them a third time as raw CSV. Three
   implementations of one report is how the same period came out three ways —
   the students PDF was not period-scoped while its CSV was, so a monthly
   report exported twice disagreed about who was on the roster.

   Now each detail is ONE definition and the two buttons are two renderers of
   it (§60). `_rptTotals(_rptKeys())` is the same call renderReports() makes,
   so no figure on paper can differ from the figure on the screen it was
   printed from — including under Custom Range, which is a list of month keys
   and not a string any date can be matched against with startsWith.        */
const RPT_DETAIL_TITLES = {
  financial: 'Revenue Report',
  payments:  'Payment Transactions',
  pending:   'Pending Payments',
  expenses:  'Expenses by Category',
  netprofit: 'Available Fund Summary',
  students:  'Student Directory',
  rooms:     'Room Occupancy',
  ownerfunds: 'Owner Funds',
};

/* The payment columns every finance report in this module shares. Defined once
   so Revenue, Payment Transactions and Pending cannot describe a payment with
   three different column sets. */
function _rptPayColumns(opts) {
  opts = opts || {};
  return [
    { label: 'Date',    type: 'date', width: 13, value: p => p.date || '' },
    { label: 'Room',    type: 'id',   width: 9,  value: p => String(p.roomNumber || ''),
      get: p => '<b>#' + escHtml(String(p.roomNumber || '—')) + '</b>' },
    { label: 'Student', type: 'text', width: 24, value: p => p.studentName || '',
      get: p => '<b>' + escHtml(p.studentName || '—') + '</b>' },
    { label: 'Month',   type: 'text', width: 16, value: p => monthLabel(p.month) },
    { label: opts.paidLabel || 'Collected', type: 'money', width: 14, total: 'sum',
      value: p => Number(p.amount || 0) || null,
      get:   p => Number(p.amount) > 0
               ? '<span class="pos">' + fmtPKR(p.amount) + '</span>' : '—' },
    { label: 'Still owed', type: 'money', width: 14, total: 'sum',
      value: p => outstandingOf(p) || null,
      get:   p => outstandingOf(p) > 0
               ? '<span class="neg">' + fmtPKR(outstandingOf(p)) + '</span>' : '—' },
    { label: 'Method', type: 'text',   width: 13, value: p => p.method || '' },
    { label: 'Status', type: 'status', width: 11, value: p => payStatusOf(p) },
  ];
}

/* THE REGISTER'S OWN COLUMNS, NOT A SECOND SET (owner, 2026-09-23: "there is
   also a difference between the expense page pdf and reports page expense
   pdf").

   This listed three — Date, Description, Amount — while the Expenses page
   printed nine, so the same category exported from two screens on the same day
   gave two different documents, and the one reached from Reports was missing
   the vendor, the method and who entered it.

   `expExportColumns({grouped:true})` is that register's own definition, the
   rule every other section of the whole-report export already follows: read
   the register's columns rather than restating them. Grouped, because this
   section prints one table per category with the name as its heading. */
function _rptExpenseColumns() {
  return typeof expExportColumns === 'function'
    ? expExportColumns({ grouped: true })
    : [
        { label: 'Date', type: 'date', width: 13, value: e => e.date || '' },
        { label: 'Description', type: 'wrap', width: 44, value: e => e.description || '' },
        { label: 'Amount', type: 'money', width: 15, total: 'sum',
          value: e => Number(e.amount || 0),
          get:   e => '<b>' + fmtPKR(e.amount) + '</b>' },
      ];
}

/* Expenses as engine groups: one table per category, biggest spend first,
   each with its own subtotal. The workbook flattens these into a Category
   column, which is what a spreadsheet wants and a printed page does not. */
function _rptExpenseGroups(exps) {
  const groups = _rptByCategory(exps);
  const grand  = _rptGroupsTotal(groups);
  return groups.map(g => ({
    label: g.cat,
    meta: g.items.length + ' record' + (g.items.length === 1 ? '' : 's') +
          (grand > 0 ? ' · ' + Math.round(g.total / grand * 100) + '% of spend' : ''),
    rows: g.items,
    /* "Sub-Total", not "Total — <category>" (owner, 2026-09-23). The name is
       already the table's heading and already on the meta line above these
       rows; a footer repeating it a third time is what made a ten-category
       report read as noise. Matches the Expenses page's own wording. */
    total: { label: 'Sub-Total', value: fmtPKR(g.total) },
  }));
}

function _rptBaseDef(type) {
  const word = _rptExportWord();
  return {
    module: 'Report-' + (RPT_DETAIL_TITLES[type] || 'Detail').replace(/\s+/g, '-'),
    title:  RPT_DETAIL_TITLES[type] || 'Report',
    scope:  _rptPeriodWords(),
    filters: [['Period', _rptPeriodWords()], ['Basis', word + ' report']],
  };
}

/* The period a reader understands, rather than the key a filename needs.
   '2026-09' is a database value; "September 2026" is a period. */
function _rptPeriodWords() { return _rptScopeLabel(); }

/* THE PERIOD'S STUDENTS AND ROOMS, AS DOCUMENT SECTIONS (finance Phase 5).
   One definition each, read by the tab's own export AND by the whole-period
   report, so the two files cannot name two rosters. Both used to read today:
   `t.roomId`, `t.status`, `resolveCharges(t)` (this month's rate) and
   getRoomOccupancy() — a March report printed September. Now each row is a
   stay in the period: the room they were in then, when they came and went,
   and what they were billed for it. */
function _rptStudentsSection(keys, pays, def, opts) {
  opts = opts || {};
  const idx = _buildRoomStudentIndex(keys);
  const billed = _rptBilledByStudent(pays);
  const roomNo = x => { const r = idx.roomById.get(x.roomId); return r ? String(r.number) : ''; };
  let rows = opts.all ? idx.residents.slice() : _rptFilterResidents(idx.residents);
  rows.sort((a, b) => (Number(roomNo(a)) || 1e9) - (Number(roomNo(b)) || 1e9)
                   || String(a.s.name || '').localeCompare(String(b.s.name || '')));
  const filt = !opts.all && studentReportFilter !== 'All' ? studentReportFilter : null;
  const totalBilled = rows.reduce((s, x) => s + (billed.get(x.s.id) || 0), 0);
  return {
    sheet: 'Students',
    filters: (def ? def.filters : []).concat([['Shown', filt]]),
    summary: [
      { label: 'Lived here', value: String(rows.length) },
      { label: 'Joined', value: String(rows.filter(x => x.joined).length), tone: 'pos' },
      { label: 'Left',   value: String(rows.filter(x => x.left).length) },
      { label: 'Billed for the period', value: EXPORT.fmt.money(totalBilled) },
    ],
    columns: [
      { label: 'Room', type: 'id', width: 9, value: x => roomNo(x),
        get: x => roomNo(x) ? '<b>#' + escHtml(roomNo(x)) + '</b>' : '—' },
      { label: 'Student', type: 'text', width: 22, value: x => x.s.name || '',
        get: x => '<b>' + escHtml(x.s.name || '—') + '</b>' },
      { label: 'Father / Guardian', type: 'text', width: 20, value: x => x.s.fatherName || '' },
      { label: 'Phone', type: 'text', width: 15, value: x => String(x.s.phone || '') },
      // Masked, like every other exported CNIC (owner, 2026-09-10).
      { label: 'CNIC',  type: 'text', width: 18, pdf: false, value: x => maskCnic(x.s.cnic) },
      { label: 'Joined', type: 'date', width: 13, value: x => x.from || '' },
      { label: 'Left',   type: 'date', width: 13, value: x => x.to || '' },
      { label: 'Billed', type: 'money', width: 14, total: 'sum',
        value: x => billed.has(x.s.id) ? billed.get(x.s.id) : null },
      { label: 'In period', type: 'status', width: 13, value: x => _rptStayWord(x) },
    ],
    rows,
    empty: 'Nobody lived here in this period.',
  };
}

function _rptRoomsSection(keys) {
  const idx = _buildRoomStudentIndex(keys);
  const cap = r => (getRoomType(r) || {}).capacity || 0;
  const occupied = DB.rooms.filter(r => idx.occ(r) > 0).length;
  return {
    meta: occupied + ' of ' + DB.rooms.length + ' rooms occupied',
    summary: [
      { label: 'Rooms', value: String(DB.rooms.length) },
      { label: 'Occupied in the period', value: String(occupied), tone: 'pos' },
      { label: 'Residents', value: idx.residents.filter(x => x.roomId).length + ' / ' +
          DB.rooms.reduce((s, r) => s + cap(r), 0) + ' beds' },
    ],
    columns: [
      { label: 'Room', type: 'id', width: 10, value: r => String(r.number),
        get: r => '<b>#' + escHtml(String(r.number)) + '</b>' },
      { label: 'Floor', type: 'text', width: 12, value: r => r.floor || '' },
      { label: 'Type',  type: 'text', width: 16, value: r => (getRoomType(r) || {}).name || '' },
      { label: 'Capacity', type: 'number', width: 10, pdf: false, value: r => cap(r) },
      { label: 'Occupied', type: 'number', width: 10, value: r => idx.occ(r) },
      { label: 'Available', type: 'number', width: 11, value: r => Math.max(0, cap(r) - idx.occ(r)) },
      // The room's rate as set in Settings — a property of the room, not a bill.
      { label: 'Rent / mo', type: 'money', width: 14,
        value: r => Number(r.rent != null && r.rent !== ''
                     ? r.rent : ((getRoomType(r) || {}).defaultRent || 0)) || null },
      { label: 'Status', type: 'status', width: 12,
        value: r => idx.occ(r) > 0 ? 'Occupied' : 'Vacant' },
      { label: 'Students', type: 'wrap', width: 34,
        value: r => (idx.activeStudentsByRoom.get(r.id) || []).map(t => t.name).join(', ') },
    ],
    rows: roomsByNumber(DB.rooms),
    empty: 'No rooms are recorded.',
  };
}

function _rptDetailDef(type) {
  const keys = _rptKeys();
  const T    = _rptTotals(keys);
  const pays = T.pays, exps = T.exps;
  const def  = _rptBaseDef(type);

  if (type === 'financial' || type === 'payments') {
    const list = type === 'payments' ? pays.filter(p => p.status === 'Paid') : pays;
    const sorted = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    return Object.assign(def, {
      sheet: 'Payments',
      summary: [
        { label: 'Revenue',      value: EXPORT.fmt.money(T.rev), tone: 'pos' },
        { label: 'Outstanding',  value: EXPORT.fmt.money(T.pending),
          tone: T.pending > 0 ? 'neg' : '' },
        { label: 'Transactions', value: String(sorted.length) },
      ],
      columns: _rptPayColumns(),
      rows: sorted,
      grand: { label: 'Collected in this period', value: fmtPKR(T.rev) },
      empty: 'No payment records in this period.',
    });
  }

  if (type === 'pending') {
    const pend = pays.filter(p => p.status === 'Pending')
      .sort((a, b) => new Date(a.dueDate || a.date) - new Date(b.dueDate || b.date));
    /* THE NUMBER TO RING (owner, 2026-09-24: "print pending payments report in
       the quick reports should also print student contact number"). This is
       the list a warden works down with a phone in hand, so the student's own
       number sits beside their name. Read from the student record — a payment
       does not carry one — and one line, as on the roster: a hyphenated
       0326-0408880 would otherwise break in two. */
    const byId  = new Map((DB.students || []).map(s => [s.id, s]));
    const phone = p => String((byId.get(p.studentId) || {}).phone || '');
    const cols  = _rptPayColumns({ paidLabel: 'Part paid' });
    cols.splice(cols.findIndex(c => c.label === 'Student') + 1, 0,
      { label: 'Contact', type: 'text', width: 16, value: phone,
        get: p => phone(p) ? '<span style="white-space:nowrap">' + escHtml(phone(p)) + '</span>' : '—' });
    return Object.assign(def, {
      sheet: 'Pending',
      summary: [
        { label: 'Unpaid records', value: String(T.pendingTotals.count), tone: 'neg' },
        { label: 'Total outstanding', value: EXPORT.fmt.money(T.pending), tone: 'neg' },
        { label: 'Part paid', value: EXPORT.fmt.money(T.pendingTotals.collected), tone: 'pos' },
      ],
      columns: cols.concat([
        { label: 'Due', type: 'date', width: 13, pdf: false, value: p => p.dueDate || '' },
      ]),
      rows: pend,
      grand: { label: 'Total outstanding', value: fmtPKR(T.pending) },
      empty: 'Nothing was left unpaid in this period.',
    });
  }

  if (type === 'expenses') {
    const groups = _rptByCategory(exps);
    return Object.assign(def, {
      sheet: 'Expenses',
      groupLabel: 'Category',
      oneTable: true,          // one heading row, not one per category (owner, 2026-09-24)
      summary: [
        { label: 'Transactions', value: String(exps.length) },
        { label: 'Categories',   value: String(groups.length) },
        { label: 'Largest category', value: groups.length ? groups[0].cat : '—' },
        { label: 'Total spent',  value: EXPORT.fmt.money(T.totalExp), tone: 'neg' },
      ],
      columns: _rptExpenseColumns(),
      groups: _rptExpenseGroups(exps),
      grand: { label: 'Total across all categories', value: fmtPKR(T.totalExp) },
      empty: 'Nothing was spent in this period.',
    });
  }

  if (type === 'netprofit') {
    /* One ledger of what came in and what went out, in date order, because
       "available fund" is a subtraction and a reader must be able to see both
       sides of it. Money out is written NEGATIVE so the column sums to the
       fund itself in the workbook rather than to a figure that means nothing. */
    const lines = pays.filter(p => p.status === 'Paid').map(p => ({
      date: p.date || '', kind: 'Income',
      what: (p.studentName || '—') + ' · ' + monthLabel(p.month),
      amount: Number(p.amount || 0),
    })).concat(exps.map(e => ({
      date: e.date || '', kind: e._transfer ? 'Transfer' : 'Expense',
      what: (e.category || 'Other') + ': ' + (e.description || '—'),
      amount: -Number(e.amount || 0),
    }))).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return Object.assign(def, {
      sheet: 'Fund',
      summary: [
        { label: 'Revenue',  value: EXPORT.fmt.money(T.rev), tone: 'pos' },
        { label: 'Expenses', value: EXPORT.fmt.money(T.totalExp), tone: 'neg' },
        { label: 'Transfers', value: EXPORT.fmt.money(T.totalTransfers) },
        { label: 'Available fund', value: EXPORT.fmt.money(T.net),
          tone: T.net >= 0 ? 'pos' : 'neg' },
      ],
      columns: [
        { label: 'Date', type: 'date', width: 13, value: l => l.date },
        { label: 'Type', type: 'text', width: 12, value: l => l.kind },
        { label: 'Detail', type: 'wrap', width: 46, value: l => l.what },
        { label: 'Amount', type: 'money', width: 15, total: 'sum',
          value: l => l.amount,
          get:   l => l.amount >= 0
                   ? '<span class="pos">' + fmtPKR(l.amount) + '</span>'
                   : '<span class="neg">-' + fmtPKR(Math.abs(l.amount)) + '</span>' },
      ],
      rows: lines,
      grand: { label: 'Available fund', value: fmtPKR(T.net) },
      empty: 'No money moved in this period.',
    });
  }

  if (type === 'ownerfunds') {
    const st = ofStatement(keys[0], { revenue: T.rev, expenses: T.totalExp });
    return Object.assign(def, {
      sheet: 'Owner Funds',
      summary: _rptOwnerSummary(st, true),
      columns: ofExportColumns(),
      rows: ofListFor(keys[0]),
      grand: { label: 'Net owner funding', value: fmtPKR(st.ownerNet) },
      empty: 'No owner fund movements in this period.',
    });
  }

  if (type === 'students') {
    return Object.assign(def, _rptStudentsSection(keys, pays, def));
  }

  if (type === 'rooms') {
    return Object.assign(def, _rptRoomsSection(keys), { sheet: 'Rooms' });
  }

  /* THE TWO NEW TABS EXPORT LIKE EVERY OTHER ONE. A detail view whose Export
     buttons produce "Nothing to export" is worse than one with no buttons —
     the warden reads it as the period being empty, not as the case being
     unhandled. Both fall through the same `def` the rest of this function
     builds, so period, filters and the file's own heading are already right. */
  if (type === 'cancellations') {
    const _ck = new Set(_rptKeys());
    const list = (DB.cancellations || [])
      .filter(c => _ck.has(String(c.vacateDate || c.requestDate || '').slice(0, 7)))
      .sort((a, b) => new Date(b.vacateDate || b.requestDate) - new Date(a.vacateDate || a.requestDate));
    const _set = c => c.settlement || {};
    const owed = list.reduce((s, c) => s + Number(_set(c).outstanding || 0), 0);
    return Object.assign(def, {
      sheet: 'Cancellations',
      summary: [
        { label: 'Departures', value: String(list.length) },
        { label: 'Settled', tone: 'pos',
          value: EXPORT.fmt.money(list.reduce((s, c) => s + Number(_set(c).collected || 0), 0)) },
        { label: 'Left owing', value: EXPORT.fmt.money(owed), tone: owed > 0 ? 'neg' : '' },
      ],
      columns: [
        { label: 'Ref', type: 'id', width: 12,
          value: c => c.seq ? 'CAN-' + String(c.seq).padStart(4, '0') : '' },
        { label: 'Student', type: 'text', width: 22, value: c => c.studentName || '',
          get: c => '<b>' + escHtml(c.studentName || '—') + '</b>' },
        { label: 'Room', type: 'id', width: 9, value: c => String(c.roomNumber || '') },
        { label: 'Notice given', type: 'date', width: 13, value: c => c.requestDate || '' },
        { label: 'Vacates', type: 'date', width: 13, value: c => c.vacateDate || '' },
        { label: 'Reason', type: 'wrap', width: 26, value: c => c.reason || '' },
        { label: 'Settled', type: 'money', width: 13, total: 'sum',
          value: c => Number(_set(c).collected || 0) || null },
        { label: 'Owing', type: 'money', width: 13, total: 'sum',
          value: c => Number(_set(c).outstanding || 0) || null },
        { label: 'Status', type: 'status', width: 12, value: c => c.status || '' },
      ],
      rows: list,
      empty: 'Nobody left in this period.',
    });
  }

  if (type === 'complaints') {
    const _ck = new Set(_rptKeys());
    const all = (typeof _issAll === 'function' ? _issAll() : [])
      .filter(i => _ck.has(String(i.date || '').slice(0, 7)))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const open = all.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
    return Object.assign(def, {
      sheet: 'Complaints',
      summary: [
        { label: 'Raised', value: String(all.length) },
        { label: 'Still open', value: String(open), tone: open > 0 ? 'neg' : 'pos' },
        { label: 'Repair cost',
          value: EXPORT.fmt.money(all.reduce((s, i) => s + Number(i.cost || 0), 0)) },
      ],
      columns: [
        { label: 'Raised', type: 'date', width: 13, value: i => i.date || '' },
        { label: 'Issue', type: 'text', width: 24, value: i => i.title || '',
          get: i => '<b>' + escHtml(i.title || '—') + '</b>' },
        { label: 'Category', type: 'text', width: 14, value: i => i.category || '' },
        { label: 'Room', type: 'id', width: 9, value: i => String(i.roomNo || '') },
        { label: 'Reported by', type: 'text', width: 18, value: i => i.by || '' },
        { label: 'Priority', type: 'text', width: 11, value: i => i.priority || '' },
        { label: 'Assigned to', type: 'text', width: 16, pdf: false, value: i => i.assigned || '' },
        { label: 'Resolved', type: 'date', width: 13, pdf: false, value: i => i.resolved || '' },
        { label: 'Cost', type: 'money', width: 12, total: 'sum',
          value: i => Number(i.cost || 0) || null },
        { label: 'Status', type: 'status', width: 12, value: i => i.status || '' },
      ],
      rows: all,
      empty: 'Nothing was raised in this period.',
    });
  }

  return Object.assign(def, { columns: [], rows: [], empty: 'Nothing to export.' });
}

function downloadReportDetailPDF(detailId) { EXPORT.pdf(_rptDetailDef(detailId)); }
function downloadDetailPDF(type)           { EXPORT.pdf(_rptDetailDef(type)); }
function downloadDetailExcel(type)         { EXPORT.excel(_rptDetailDef(type)); }

/* ── THE PERIOD REPORT ───────────────────────────────────────────────────────
   §40: a report is not a list export. It keeps the analytical hierarchy of the
   screen — summary, then financial, then students, then rooms — rather than
   flattening into one long table. The sections are the ones the Reports page
   itself shows, in the order it shows them.                                 */
function _rptOverviewDef() {
  const keys = _rptKeys();
  const T    = _rptTotals(keys);
  const idx  = _buildRoomStudentIndex(keys);
  const occ  = DB.rooms.filter(r => idx.occ(r) > 0).length;
  const paid = T.pays.filter(p => p.status === 'Paid');

  // The period's residents in the period's rooms — the same sections the tabs
  // export, so this document and theirs cannot name two rosters.
  const stu   = _rptStudentsSection(keys, T.pays, null, { all: true });
  const rooms = _rptRoomsSection(keys);
  // Owner Funds, only where the hostel has it (and this account may see it).
  const _ofOn = typeof ofAllowed === 'function' && ofAllowed();
  const _ofSt = _ofOn ? ofStatement(keys[0], { revenue: T.rev, expenses: T.totalExp }) : null;

  return {
    module: 'Report',
    title:  _rptExportWord() + ' Report',
    scope:  _rptPeriodWords(),
    orientation: 'landscape',
    sheetPerSection: true,
    filters: [['Period', _rptPeriodWords()]],

    summary: [
      { label: 'Revenue',        value: EXPORT.fmt.money(T.rev), tone: 'pos' },
      { label: 'Expenses',       value: EXPORT.fmt.money(T.totalExp), tone: 'neg' },
      { label: 'Available fund', value: EXPORT.fmt.money(T.net), tone: T.net >= 0 ? 'pos' : 'neg' },
      { label: 'Outstanding',    value: EXPORT.fmt.money(T.pending), tone: T.pending > 0 ? 'neg' : '' },
      { label: 'Payments',       value: String(paid.length) },
      { label: 'Rooms occupied', value: occ + ' / ' + DB.rooms.length },
      { label: 'Residents',      value: String(stu.rows.length) },
      ...(_ofOn ? _rptOwnerSummary(_ofSt, false) : []),
    ],

    sections: [
      /* FULL DETAIL, AND THAT MEANS THE REGISTERS' OWN COLUMNS (owner,
         2026-09-10: "all the print button in the reports should print full
         detail"). These sections used to carry cut-down column sets written
         here — six columns for students, a short set for payments — so the
         report printed a summary of a register rather than the register.
         Reading `.columns` off each register's own definition means this
         document and that register's own export cannot differ by a column, a
         format or a derived field. */
      {
        title: 'Payments',
        meta: T.pays.length + ' record' + (T.pays.length === 1 ? '' : 's'),
        columns: _payExportDef(T.pays).columns,
        rows: T.pays.slice().sort((a, b) => new Date(b.date) - new Date(a.date)),
        grand: { label: 'Collected in this period', value: fmtPKR(T.rev) },
        empty: 'No payment records in this period.',
      },
      {
        title: 'Expenses by category',
        meta: _rptByCategory(T.exps).length + ' categor' +
              (_rptByCategory(T.exps).length === 1 ? 'y' : 'ies'),
        groupLabel: 'Category',
        oneTable: true,        // one heading row, not one per category (owner, 2026-09-24)
        columns: _rptExpenseColumns(),
        groups: _rptExpenseGroups(T.exps),
        grand: { label: 'Total outgoing', value: fmtPKR(T.totalExp) },
        empty: 'Nothing was spent in this period.',
      },
      {
        title: 'Students',
        meta: stu.rows.length + ' lived here in the period',
        columns: stu.columns,
        rows: stu.rows,
        empty: stu.empty,
      },
      /* CANCELLATIONS AND COMPLAINTS. Neither has a report SCREEN in this app,
         which is why neither is a tab on the page — but both have a full
         export, and "full detail" is not full without the departures and the
         open issues. Scoped to the same period as everything above them. */
      {
        title: 'Cancellations',
        meta: (() => { const n = _rptCancels().length;
          return n + ' departure' + (n === 1 ? '' : 's'); })(),
        columns: _cancExportDef(_rptCancels()).columns,
        rows: _rptCancels(),
        empty: 'No departures were filed in this period.',
      },
      {
        title: 'Complaints & maintenance',
        meta: (() => { const n = _rptIssues().length;
          return n + ' issue' + (n === 1 ? '' : 's'); })(),
        columns: _issExportDef(_rptIssues()).columns,
        rows: _rptIssues(),
        empty: 'No issues were raised in this period.',
      },
      ...(_ofOn ? [{
        title: 'Owner funds',
        meta: _ofSt.count + ' movement' + (_ofSt.count === 1 ? '' : 's') +
              ' · shown beside profit and loss, not inside it',
        columns: ofExportColumns(),
        rows: ofListFor(keys[0]),
        grand: { label: 'Net owner funding', value: fmtPKR(_ofSt.ownerNet) },
        empty: 'No owner fund movements in this period.',
      }] : []),
      {
        title: 'Room occupancy',
        meta: rooms.meta,
        columns: rooms.columns,
        rows: rooms.rows,
        empty: rooms.empty,
      },
    ],

    empty: 'No records in this period.',
  };
}

/* The two registers the overview report adds, scoped to the report's own
   period; an issue to the day it was raised.

   A cancellation belongs to the month the bed came FREE — vacateDate, or the
   notice date where none is set — the rule the Cancellations tab and its
   export already use. This filed it by notice date, so a departure noticed in
   August for September sat in August's printed report and September's tab. */
function _rptCancels() {
  const keys = _rptKeys();
  return (DB.cancellations || []).filter(c =>
    keys.some(k => String(c.vacateDate || c.requestDate || '').indexOf(k) === 0));
}
/* THE ISSUES SECTION TAKES _issAll() VIEWS, NOT RAW RECORDS — and handing it
   raw records is what broke Export Excel and Print / PDF on this whole page.

   `_issExportDef()` was written for the register's own normalised shape: every
   column reads `i.roomNo`, `i.by`, `i.desc`, `i.title`, and the Ref column
   reads `_issSeq(i)`, which dereferences `i.raw.seq`. A raw DB.issues record
   has no `.raw`, so the first issue row in the period threw
   "Cannot read properties of undefined (reading 'seq')" — inside the export
   engine's try/catch, which logged it to a console nobody had open and showed
   "Export could not be generated. Please try again."

   So BOTH buttons died, silently, for any hostel with a single complaint or
   maintenance ticket in the reported month — and only then, which is why it
   looked intermittent. It arrived with the 2026-09-21 merge that made the two
   registers one and moved them onto the view shape; this call site was the one
   left reading the collection directly. The two DETAIL views on this page
   (lines ~466 and ~1985) already go through _issAll(), which is what this now
   matches.

   The date still comes off the view (`i.date`), with the raw record's
   createdAt as the fallback for a record written without one. */
function _rptIssues() {
  const keys = _rptKeys();
  const all  = (typeof _issAll === 'function' ? _issAll() : []);
  return all.filter(i =>
    keys.some(k => String(i.date || (i.raw && i.raw.createdAt) || '').indexOf(k) === 0));
}

function printReport()       { EXPORT.pdf(_rptOverviewDef()); }
function exportReportExcel() { EXPORT.excel(_rptOverviewDef()); }

/* ── THE EXPORT MENU ─────────────────────────────────────────────────────────
   Four export buttons on a bar that also carries the month picker wrapped onto
   a second line at the 1366 floor. The three that write a FILE live under one
   verb now; Print / PDF stays out as the primary. */
function rptExportToggle(force) {
  const m = document.getElementById('rpt-xp-menu');
  if (!m) return;
  const open = force != null ? force : m.hasAttribute('hidden');
  if (open) {
    m.removeAttribute('hidden');
    document.addEventListener('mousedown', _rptExportAway, true);
    document.addEventListener('keydown', _rptExportEsc, true);
  } else {
    m.setAttribute('hidden', '');
    document.removeEventListener('mousedown', _rptExportAway, true);
    document.removeEventListener('keydown', _rptExportEsc, true);
  }
  const b = document.getElementById('rpt-xp-btn');
  if (b) b.setAttribute('aria-expanded', String(open));
}
function _rptExportAway(e) {
  if (!e.target.closest || !e.target.closest('.rpt-xp')) rptExportToggle(false);
}
/* Capture phase — app.js binds a bubble-phase Escape of its own. */
function _rptExportEsc(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  rptExportToggle(false);
  const b = document.getElementById('rpt-xp-btn');
  if (b) b.focus();
}

/* ── THE TAB STRIP'S EDGE ────────────────────────────────────────────────────
   The strip has scrolled sideways since it was built, with `scrollbar-width:
   none` and a hidden webkit scrollbar — so at the 1366 floor the tenth tab,
   Complaints, was simply not there and nothing on screen said otherwise
   (owner, 2026-09-22: "make the complaints in the nav bar a little visible
   because it is hidden").

   Two things fix it and neither adds a control. A class on the strip when it
   overflows draws a fade at whichever edge has more tabs behind it, so the row
   reads as cut off rather than as finished. And the SELECTED tab is scrolled
   into view after every render, so arriving on Complaints from anywhere —
   a KPI card, the command palette, a deep link — puts it under the cursor
   instead of off the end. */
/* ── DRAG TO SCROLL A LIST THAT OUTGREW ITS CARD ─────────────────────────────
   Owner, 2026-09-22: "if the categories move out from card then make it
   draggable showing the large percentage categories first".

   The bars are already sorted by amount descending, so what is on screen
   before any scrolling is what matters — the list can be cut off at the bottom
   without cutting off the answer. This adds the panning: press anywhere on the
   list and drag, the way the payments register's wide table is panned.

   IT ONLY BINDS WHEN THE LIST ACTUALLY OVERFLOWS, so a hostel with four
   categories gets an ordinary card with an ordinary cursor. A click that moved
   less than 4px is left alone rather than swallowed — the rows hold no
   controls today, but a drag handler that eats clicks is a trap for whoever
   adds one. */
function rptDragScroll(el) {
  if (!el || el.dataset.drag) return;
  if (el.scrollHeight - el.clientHeight < 4) return;
  el.dataset.drag = '1';
  el.classList.add('is-draggable');
  let down = false, startY = 0, startTop = 0, moved = 0;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    down = true; moved = 0;
    startY = e.clientY; startTop = el.scrollTop;
    el.classList.add('is-dragging');
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!down) return;
    const dy = e.clientY - startY;
    moved = Math.max(moved, Math.abs(dy));
    el.scrollTop = startTop - dy;
  });
  const end = e => {
    if (!down) return;
    down = false;
    el.classList.remove('is-dragging');
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved > 4) { const kill = ev => ev.stopPropagation();
      el.addEventListener('click', kill, { capture: true, once: true }); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function rptTabsFade() {
  const el = document.querySelector('.rpt-tabs');
  if (!el) return;
  const over = el.scrollWidth - el.clientWidth;
  el.classList.toggle('has-more', over > 2 && el.scrollLeft < over - 2);
  el.classList.toggle('has-prev', over > 2 && el.scrollLeft > 2);
}
function rptTabsInit() {
  rptDragScroll(document.getElementById('rpt-expbars'));
  const el = document.querySelector('.rpt-tabs');
  if (!el) return;
  if (!el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener('scroll', rptTabsFade); }
  const on = el.querySelector('.rpt-tab.is-on');
  // `nearest` so Overview does not scroll the row when it is already at rest.
  if (on && typeof on.scrollIntoView === 'function') {
    on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  rptTabsFade();
}

/* ── THE TWO REGISTERS, FOR THE MONTH ON SCREEN ──────────────────────────────
   Owner, 2026-09-22: "make the all student pdf and payment a month, year
   dropdowns and make it default to current month".

   They were exportAllStudentsPDF() and exportAllPaymentsPDF() — the WHOLE
   register, every student since the hostel opened and every payment ever,
   under a scope line reading "Complete record". On a hostel three years old
   that is a document nobody can use to answer a question about September.

   THE DROPDOWN IS THE ONE ALREADY ON THE BAR. A third and fourth month control
   beside the report's own picker would be three answers to "which month" on
   one screen, and two of them would be wrong the moment the picker moved. The
   picker opens on the current month, so these default to the current month by
   construction, and the export menu states the month above the two items.

   The roster is the period's RESIDENTS, not today's — the same
   _buildRoomStudentIndex() the page's own figures are built from, so this
   document and the Students tab beside it cannot name two rosters. The
   payments are _rptTotals()' own list, which is what every money figure on the
   page is summed from. */
function rptStudentsMonthPDF() {
  const keys = _rptKeys();
  const list = studentsByRoom(_buildRoomStudentIndex(keys).residents.map(x => x.s));
  if (!list.length) { toast('Nobody lived here in ' + monthLabel(keys[0]), 'error'); return; }
  EXPORT.pdf(_stuExportDef(list, {
    title: 'Student Register',
    scope: _rptPeriodWords(),
  }));
}
function rptPaymentsMonthPDF() {
  const keys = _rptKeys();
  const list = _rptTotals(keys).pays.slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!list.length) { toast('No payments in ' + monthLabel(keys[0]), 'error'); return; }
  EXPORT.pdf(_payExportDef(list, {
    title: 'Payment Register',
    scope: _rptPeriodWords(),
  }));
}


// ════════════════════════════════════════════════════════════════════════════
// MODAL SYSTEM
// ════════════════════════════════════════════════════════════════════════════

// calPopoverOpen declared in dashboard.js (shared)
// ════════════════════════════════════════════════════════════════════════════
// ANNUAL ARCHIVE — record classifier
// Tells an archived payment from an archived expense. The Archive PAGE itself
// lives in modules/archive.js; this stays here because the reports code reads
// DB.archive too, and both must classify a row the same way.
// ════════════════════════════════════════════════════════════════════════════
function _archiveClassify(r) {
  // Records archived by enforceDataRetention() carry `_src` naming the live
  // table they came from — trust it. Legacy rows migrated from the v3
  // localStorage archive have no `_src`, so fall back to shape sniffing: an
  // expense has a category and no student/month fields.
  const isExpense = (r && r._src)
    ? r._src === 'expenses'
    : !!(r && r.category !== undefined &&
      r.studentName === undefined && r.studentId === undefined && r.month === undefined);
  const date  = (r && (r.date || r.paidDate || r.dueDate)) || '';
  const mYear = (r && r.month && String(r.month).match(/\d{4}/)) ? String(r.month).match(/\d{4}/)[0] : '';
  const year  = mYear || (date ? String(date).slice(0, 4) : '') || 'Undated';
  const label = isExpense
    ? (r.category || 'Expense') + (r.description ? ' — ' + r.description : '')
    : (r.studentName || '—') + (r.month ? ' · ' + r.month : '');
  return { isExpense, date, year, label, amount: Number((r && r.amount) || 0) };
}

/* ══ OWNER FUNDS IN THE REPORTS (step 4, 2026-09-28) ══════════════════════════
   Owner money sits BESIDE the period's profit and loss, never inside it: the
   Available Fund and Net Result figures on this page are unchanged, and these
   lines follow them. Shown only where the hostel has Owner Funds switched on
   and the account holds the permission. */

function _rptSigned(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmtPKR(Math.abs(n)); }

/** The owner lines under the Available Fund figure on its tab. */
function _rptOwnerLines(rev, totalExp) {
  if (typeof ofAllowed !== 'function' || !ofAllowed()) return '';
  const st = ofStatement(_rptKeys()[0], { revenue: rev, expenses: totalExp });
  return '<div class="rpt-owner">'
    + '<span>Owner gave <b class="is-in">+' + fmtPKR(st.ownerIn) + '</b></span>'
    + '<span>Owner took <b class="is-out">−' + fmtPKR(st.ownerOut) + '</b></span>'
    + '<span>Hostel money after owner <b class="' + (st.afterOwner < 0 ? 'is-neg' : 'is-in') + '">'
    +   _rptSigned(st.afterOwner) + '</b></span>'
    + '<a href="#" onclick="reportDetail=\'ownerfunds\';renderPage(\'reports\');return false">Owner funds ›</a>'
    + '</div>';
}

/** The Owner funds tab. */
function _rptOwnerPanel(rev, totalExp, periodLabel, buttons) {
  const key = _rptKeys()[0];
  const st  = ofStatement(key, { revenue: rev, expenses: totalExp });
  const _pg = paginate(ofListFor(key), reportDetailFilter);
  const tile = (label, value, cls, sub) =>
    '<div class="rpt-of__t"><div class="rpt-of__l">' + label + '</div>'
    + '<div class="rpt-of__v ' + cls + '">' + value + '</div>'
    + '<div class="rpt-of__s">' + sub + '</div></div>';
  const cats = dir => {
    const rows = OF_CATEGORIES[dir].map(c => ({ c, v: st.byCategory[c.key] || 0 })).filter(x => x.v > 0);
    return rows.length
      ? rows.map(x => '<div class="rpt-of__cr"><span>' + escHtml(x.c.label) + '</span><b>' + fmtPKR(x.v) + '</b></div>').join('')
      : '<div class="rpt-of__none">Nothing in this period</div>';
  };
  const row = r => '<tr style="cursor:pointer" onclick="showOwnerFundDetail(\'' + escHtml(r.id) + '\')">'
    + '<td class="text-muted" style="font-size:12px">' + fmtDate(r.date) + '</td>'
    + '<td>' + (r.direction === OF_IN ? '<span class="ui-chip ui-chip--success">Owner gave</span>'
                                      : '<span class="ui-chip ui-chip--warning">Owner took</span>') + '</td>'
    + '<td>' + escHtml(ofCategoryLabel(r.category)) + '</td>'
    + '<td class="text-muted">' + escHtml(r.method || '—') + '</td>'
    + '<td class="text-muted" style="font-size:12px">' + escHtml(r.refNo || '—') + '</td>'
    + '<td class="text-muted" style="font-size:12px">' + escHtml(r.note || '—') + '</td>'
    + '<td class="rpt-of__amt ' + (r.direction === OF_IN ? 'is-in' : 'is-out') + '">'
    +   (r.direction === OF_IN ? '+' : '−') + fmtPKR(r.amount) + '</td>'
    + '</tr>';
  return '<div class="card" style="margin-bottom:20px">'
    + '<div class="card-header"><div class="card-title">' + icon('wallet') + ' Owner Funds — ' + escHtml(periodLabel) + '</div>'
    +   '<div style="display:flex;gap:8px;align-items:center">' + buttons + '</div></div>'
    + '<div class="rpt-of__tiles">'
    +   tile('Profit / loss', _rptSigned(st.result), st.result < 0 ? 'is-neg' : 'is-in',
             fmtPKR(rev) + ' revenue − ' + fmtPKR(totalExp) + ' expenses')
    +   tile('Owner gave · took', '<span class="is-in">+' + fmtPKR(st.ownerIn) + '</span> <span class="rpt-of__sl">/</span> '
             + '<span class="is-out">−' + fmtPKR(st.ownerOut) + '</span>', '', 'Net owner funding ' + _rptSigned(st.ownerNet))
    +   tile('Hostel money after owner', _rptSigned(st.afterOwner), st.afterOwner < 0 ? 'is-neg' : 'is-in',
             'Profit / loss + owner gave − owner took')
    + '</div>'
    + '<div class="rpt-of__cats">'
    +   '<div><div class="rpt-of__ch">Owner gave — by reason</div>' + cats(OF_IN) + '</div>'
    +   '<div><div class="rpt-of__ch">Owner took — by reason</div>' + cats(OF_OUT) + '</div>'
    + '</div>'
    + '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Direction</th><th>Reason</th><th>Method</th>'
    +   '<th>Reference</th><th>Note</th><th>Amount</th></tr></thead><tbody>'
    +   (_pg.slice.map(row).join('')
         || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No owner fund movements in this period</td></tr>')
    + '</tbody></table></div>'
    + renderPager(_pg, 'reportDetailFilter', 'reports')
    + '</div>';
}

/** Summary tiles for a document. `withResult` adds revenue/expenses/profit
    first, for the Owner Funds tab's own export; the whole report already
    states those three. */
function _rptOwnerSummary(st, withResult) {
  const out = [];
  if (withResult) {
    out.push({ label: 'Revenue',  value: EXPORT.fmt.money(st.revenue), tone: 'pos' });
    out.push({ label: 'Expenses', value: EXPORT.fmt.money(st.expenses), tone: 'neg' });
    out.push({ label: 'Profit / loss', value: EXPORT.fmt.money(st.result), tone: st.result >= 0 ? 'pos' : 'neg' });
  }
  out.push({ label: 'Owner gave', value: EXPORT.fmt.money(st.ownerIn), tone: 'pos' });
  out.push({ label: 'Owner took', value: EXPORT.fmt.money(st.ownerOut), tone: st.ownerOut > 0 ? 'neg' : '' });
  out.push({ label: 'After owner', value: EXPORT.fmt.money(st.afterOwner), tone: st.afterOwner >= 0 ? 'pos' : 'neg' });
  return out;
}

