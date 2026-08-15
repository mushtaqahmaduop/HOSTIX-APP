/* ─── HOSTIX — REPORTS MODULE ───────────────────────────────────────────────
   Contains: renderReportDetail, renderReports, showTransferRecordsModal,
             deleteTransferFromModal, showEditTransferModal, submitEditTransfer,
             showAddTransferModal, submitAddTransfer, deleteTransfer,
             downloadDetailPDF, downloadReportDetailPDF, printReport,
             downloadDetailCSV
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// PERF: shared room/student indexes built in ONE pass, so report tables and PDF builders
// stop doing a DB.rooms.find / DB.students.filter per row (which was O(rows × students)).
function _buildRoomStudentIndex() {
  const roomById = new Map(DB.rooms.map(r=>[r.id, r]));
  const activeStudentsByRoom = new Map();   // roomId -> [active students]
  (DB.students||[]).forEach(t=>{
    if(t.status!=='Active') return;
    let arr=activeStudentsByRoom.get(t.roomId); if(!arr){ arr=[]; activeStudentsByRoom.set(t.roomId,arr); }
    arr.push(t);
  });
  return { roomById, activeStudentsByRoom, occ: r => (activeStudentsByRoom.get(r.id)||[]).length };
}

function renderReportDetail(id, pays, exps, rev, pending, totalExp, net, occ) {
  const periodLabel = reportPeriod==='month' ? thisMonth() : thisYear();
  const csvBtn = (type, color) => `<button onclick="downloadDetailCSV('${type}')" style="background:${color};color:#fff;border:none;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">📥 CSV</button>`;
  const pdfBtn = `<button onclick="downloadReportDetailPDF('${id}')" style="background:var(--accent);color:#000;border:none;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">📄 PDF</button>`;

  // PERF: index rooms by id and active students by room ONCE (see _buildRoomStudentIndex).
  const { roomById:_roomById, activeStudentsByRoom:_activeStudentsByRoom } = _buildRoomStudentIndex();

  // PERF: reset to page 1 only when the detail type / period / sub-filter changes, so
  // paging within a detail table is preserved but switching cards starts fresh.
  const _detKey = id+'|'+reportPeriod+'|'+studentReportFilter;
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
        <div style="font-size:12px;color:var(--text3);margin-top:6px">${fmtPKR(rev)} collected − ${fmtPKR(totalExp)} expenses</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount Paid</th><th>Method</th><th>Date</th></tr></thead><tbody>
      ${_pg.slice.map(p=>`<tr style="cursor:pointer" onclick="showViewStudentModal('${p.studentId}')">
        <td class="fw-700" style="color:var(--blue)">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${p.roomNumber||'—'}</td>
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
    const pendingPays = DB.payments.filter(p=>p.status==='Pending').sort((a,b)=>new Date(b.date)-new Date(a.date));
    const totalPend = pendingPays.reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
    const _pg = paginate(pendingPays, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">⏳ Pending Payments — All Unpaid <span style="font-size:10px;font-weight:700;color:var(--amber);background:var(--amber-dim);border:1px solid rgba(240,160,48,0.35);border-radius:20px;padding:2px 9px;margin-left:6px;vertical-align:middle">ALL MONTHS</span></div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('pending','var(--amber)')}${pdfBtn}</div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">The <strong>Pending</strong> stat card above shows ${escHtml(thisMonthLabel())} only — this list is every unpaid record across all months.</div>
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
          <div style="font-size:26px;font-weight:900;color:var(--blue)">${pendingPays.filter(p=>p.unpaid!=null&&Number(p.amount)>0).length}</div>
        </div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Outstanding</th><th>Method</th><th>Date</th><th>Action</th></tr></thead><tbody>
      ${_pg.slice.map(p=>`<tr>
        <td class="fw-700" style="cursor:pointer;color:var(--blue)" onclick="showViewStudentModal('${p.studentId}')">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${p.roomNumber||'—'}</td>
        <td class="text-muted" style="font-size:12px">${escHtml(p.month||'—')}</td>
        <td class="${Number(p.amount)>0&&p.unpaid!=null?'text-green fw-700':'text-muted'}">${p.unpaid!=null?fmtPKR(p.amount):'—'}</td>
        <td class="text-red fw-700">${fmtPKR(p.unpaid!=null?p.unpaid:p.amount)}</td>
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
      ...pays.filter(p=>p.status==='Paid').map(p=>({date:p.date,label:escHtml(p.studentName||'—'),desc:'Room #'+(p.roomNumber||'')+' · '+escHtml(p.month||''),amount:Number(p.amount),type:'income'})),
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
        <div style="font-size:12px;color:var(--text3);margin-top:6px">${fmtPKR(rev)} collected − ${fmtPKR(totalExp)} expenses</div>
      </div>
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

  // ── STUDENTS ───────────────────────────────────────────────────────────────
  if (id === 'students') {
    const badges = [
      {label:'All',       count:DB.students.length,                              color:'var(--blue)',  dim:'var(--blue-dim)',  border:'rgba(74,156,240,0.4)'},
      {label:'Active',    count:DB.students.filter(t=>t.status==='Active').length,  color:'var(--green)', dim:'var(--green-dim)', border:'rgba(46,201,138,0.4)'},
      {label:'Left',      count:DB.students.filter(t=>t.status==='Left').length,    color:'var(--amber)', dim:'var(--amber-dim)', border:'rgba(240,160,48,0.4)'},
      {label:'Blacklisted',count:DB.students.filter(t=>t.status==='Blacklisted').length,color:'var(--red)',dim:'var(--red-dim)',border:'rgba(224,82,82,0.4)'},
    ];
    const filtered = studentReportFilter==='All' ? DB.students : DB.students.filter(t=>t.status===studentReportFilter);
    const _pg = paginate(filtered, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">👥 Student Report</div>
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
        <span style="font-size:12px;color:var(--text3)">Showing <strong style="color:var(--text)">${studentReportFilter}</strong> (${filtered.length})</span>
        <button onclick="studentReportFilter='All';renderPage('reports')" class="btn btn-secondary btn-sm" style="font-size:11px">✕ Clear</button>
      </div>`:''}
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Father</th><th>Room</th><th>Join Date</th><th>Rent</th><th>Status</th><th>Phone</th></tr></thead><tbody>
      ${_pg.slice.map(t=>{const r=_roomById.get(t.roomId);return `<tr style="cursor:pointer" onclick="showViewStudentModal('${t.id}')">
        <td class="fw-700" style="color:var(--blue)">${escHtml(t.name)}</td>
        <td class="text-muted" style="font-size:12px">${escHtml(t.fatherName||'—')}</td>
        <td class="text-gold fw-700">${r?'#'+r.number:'—'}</td>
        <td class="text-muted" style="font-size:12px">${fmtDate(t.joinDate)}</td>
        <td class="text-green fw-700">${fmtPKR(t.rent)}</td>
        <td>${statusBadge(t.status)}</td>
        <td class="text-muted">${escHtml(t.phone||'—')}</td>
      </tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No students found</td></tr>'}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  // ── ROOMS ──────────────────────────────────────────────────────────────────
  if (id === 'rooms') {
    const _pg = paginate(DB.rooms, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header"><div class="card-title">🏠 Room Occupancy — Details</div><div style="display:flex;gap:8px;align-items:center">${csvBtn('rooms','var(--teal)')}${pdfBtn}</div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--green);font-weight:700">Occupied</div><div style="font-size:28px;font-weight:900;color:var(--green)">${occ}</div></div>
        <div style="background:var(--accent-dim);border:1px solid rgba(124,58,237,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--accent-strong);font-weight:700">Vacant</div><div style="font-size:28px;font-weight:900;color:var(--accent-strong)">${DB.rooms.length-occ}</div></div>
        <div style="background:var(--blue-dim);border:1px solid rgba(74,156,240,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--blue);font-weight:700">Total</div><div style="font-size:28px;font-weight:900;color:var(--blue)">${DB.rooms.length}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Occupancy</th><th>Students</th><th>Status</th><th>Rent</th></tr></thead><tbody>
      ${_pg.slice.map(r=>{const type=getRoomType(r);const sts=_activeStudentsByRoom.get(r.id)||[];const occ2=sts.length;return `<tr style="cursor:pointer" onclick="showRoomDetail('${r.id}')"><td class="fw-700 text-gold">#${r.number}</td><td><span class="badge" style="background:${type.color}22;color:${type.color};border-color:${type.color}44">${escHtml(type.name)}</span></td><td class="text-muted">${r.floor} Floor</td><td class="text-muted">${occ2}/${type.capacity}</td><td style="font-size:12px">${sts.map(t=>escHtml(t.name)).join(', ')||'<span style="color:var(--text3)">Empty</span>'}</td><td><span class="badge ${occ2>0?'badge-green':'badge-gray'}">${occ2>0?'Occupied':'Vacant'}</span></td><td class="text-green fw-700">${fmtPKR(r.rent)}/mo</td></tr>`;}).join('')}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  if (id === 'expenses') {
    const _expSorted = exps.slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
    const _pg = paginate(_expSorted, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">📉 Expenses — ${periodLabel}</div>
        <div style="display:flex;align-items:center;gap:10px"><div style="font-size:18px;font-weight:900;color:var(--red)">${fmtPKR(totalExp)}</div>${csvBtn('expenses','var(--red)')}${pdfBtn}</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${_pg.slice.map(e=>`<tr>
        <td class="text-muted" style="font-size:12px">${fmtDate(e.date)}</td>
        <td><span class="badge badge-amber">${escHtml(e.category)}</span></td>
        <td>${escHtml(e.description||'—')}</td>
        <td class="text-red fw-700">${fmtPKR(e.amount)}</td>
      </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">No expenses this period</td></tr>'}
      </tbody></table></div>
      ${renderPager(_pg,'reportDetailFilter','reports')}
    </div>`;
  }

  // ── PAYMENT METHODS ────────────────────────────────────────────────────────
  if (id === 'payments') {
    const _paySorted = pays.filter(p=>p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date));
    const _pg = paginate(_paySorted, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header"><div class="card-title">💳 Payment Methods — ${periodLabel}</div><div style="display:flex;gap:8px;align-items:center">${csvBtn('payments','var(--accent)')}${pdfBtn}</div></div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount Paid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${_pg.slice.map(p=>`<tr>
        <td class="fw-700">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${p.roomNumber||'—'}</td>
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

  // ── TRANSFERS ──────────────────────────────────────────────────────────────
  if (id === 'transfers') {
    const allTr = (DB.transfers||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
    const totalTr = allTr.reduce((s,t)=>s+Number(t.amount),0);
    const cashTr  = allTr.filter(t=>t.method==='Cash').reduce((s,t)=>s+Number(t.amount),0);
    const bankTr  = allTr.filter(t=>t.method!=='Cash').reduce((s,t)=>s+Number(t.amount),0);
    const moKey   = periodLabel.slice(0,7);
    const moTr    = allTr.filter(t=>(t.date||'').startsWith(moKey));
    const moTotal = moTr.reduce((s,t)=>s+Number(t.amount),0);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">🏦 Funds Transfer — All Records</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('transfers','var(--blue)')}<button class="btn btn-primary btn-sm" onclick="showAddTransferModal()">+ New</button>${pdfBtn}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--blue-dim);border:1px solid rgba(74,156,240,0.35);border-radius:10px;padding:14px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--blue);font-weight:700;margin-bottom:4px">Total</div><div>${moneyValue(totalTr,{size:"section",color:"var(--blue)"})}</div><div style="font-size:10px;color:var(--text3)">${allTr.length} records</div></div>
        <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:14px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--green);font-weight:700;margin-bottom:4px">Cash</div><div>${moneyValue(cashTr,{size:"section",color:"var(--green)"})}</div><div style="font-size:10px;color:var(--text3)">${allTr.filter(t=>t.method==='Cash').length} records</div></div>
        <div style="background:var(--purple-dim);border:1px solid rgba(155,109,240,0.3);border-radius:10px;padding:14px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--purple);font-weight:700;margin-bottom:4px">Bank</div><div>${moneyValue(bankTr,{size:"section",color:"var(--purple)"})}</div><div style="font-size:10px;color:var(--text3)">${allTr.filter(t=>t.method!=='Cash').length} records</div></div>
        <div style="background:var(--accent-dim);border:1px solid rgba(124,58,237,0.3);border-radius:10px;padding:14px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--accent-strong);font-weight:700;margin-bottom:4px">This Period</div><div>${moneyValue(moTotal,{size:"section",color:"var(--accent-strong)"})}</div><div style="font-size:10px;color:var(--text3)">${moTr.length} transfers</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Method</th><th>Amount</th><th>Received By</th><th>Notes</th><th>By Warden</th><th>Actions</th></tr></thead><tbody>
      ${allTr.length===0?'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:28px">No transfers yet — click + New to add.</td></tr>'
        :paginate(allTr, reportDetailFilter).slice.map(tr=>`<tr>
          <td class="text-muted" style="font-size:12px;white-space:nowrap">${fmtDate(tr.date)}</td>
          <td class="fw-700">${escHtml(tr.description||'Transfer')}</td>
          <td>${tr.method==='Cash'?'<span class="badge badge-green">💵 Cash</span>':'<span class="badge badge-blue">🏦 '+escHtml(tr.method)+'</span>'}</td>
          <td style="font-weight:900;color:var(--blue);font-size:14px">${fmtPKR(tr.amount)}</td>
          <td class="text-muted" style="font-size:12px">${escHtml(tr.receivedBy||'—')}</td>
          <td class="text-muted" style="font-size:12px">${escHtml(tr.notes||'—')}</td>
          <td class="text-muted" style="font-size:12px">${escHtml(tr.byWarden||'—')}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-secondary btn-icon btn-sm" onclick="showEditTransferModal('${tr.id}')" title="Edit">✏️</button>
            <button class="btn btn-danger btn-icon btn-sm" onclick="deleteTransfer('${tr.id}');reportDetail='transfers';renderPage('reports')" title="Delete">🗑</button>
          </div></td>
        </tr>`).join('')}
      </tbody></table></div>
      ${renderPager(paginate(allTr, reportDetailFilter),'reportDetailFilter','reports')}
    </div>`;
  }
  return '';
}


function renderReports() {
  const key=reportPeriod==='month'?thisMonth():thisYear();
  const pays=DB.payments.filter(p=>_payMatchesMonth(p,key));
  const exps=DB.expenses.filter(e=>e.date?.startsWith(key));
  const rev=calcRevenue(key);
  const pending=DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,key)).reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
  const totalExp=exps.reduce((s,e)=>s+Number(e.amount),0);
  const net=rev-totalExp;

  // PERF: index active students by room ONCE so the per-room / per-type loops below are
  // O(students+rooms) instead of O(rooms×students). getRoomOccupancy() rescans ALL students
  // on every call, which made Reports lag badly with hundreds of students.
  const _activeByRoom = new Map();              // roomId -> active student count
  const _activeIdsByType = new Map();           // typeId -> Set of active studentIds
  const _typeIdByRoomId = new Map(DB.rooms.map(r=>[r.id, r.typeId]));
  DB.students.forEach(t=>{
    if(t.status!=='Active') return;
    _activeByRoom.set(t.roomId, (_activeByRoom.get(t.roomId)||0)+1);
    const tid=_typeIdByRoomId.get(t.roomId);
    if(tid==null) return;
    let set=_activeIdsByType.get(tid); if(!set){ set=new Set(); _activeIdsByType.set(tid,set); }
    set.add(t.id);
  });
  const _roomOcc = r => _activeByRoom.get(r.id)||0;

  const occ=DB.rooms.filter(r=>_roomOcc(r)>0).length;
  const occRate=DB.rooms.length?Math.round(occ/DB.rooms.length*100):0;

  // Expense by category
  let catRows='';
  DB.settings.expenseCategories.forEach(cat=>{
    const amt=exps.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.amount),0);
    if(!amt) return;
    const pct=totalExp>0?Math.round(amt/totalExp*100):0;
    catRows+=`<div class="progress-row"><div class="progress-label">${escHtml(cat)}</div><div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:var(--red)"></div></div><div class="progress-value">${fmtPKR(amt)}</div></div>`;
  });

  // Method breakdown
  let methodRows='';
  DB.settings.paymentMethods.forEach(m=>{
    const amt=pays.filter(p=>p.status==='Paid'&&p.method===m).reduce((s,p)=>s+Number(p.amount),0);
    const cnt=pays.filter(p=>p.method===m).length;
    if(!cnt) return;
    const pct=rev>0?Math.round(amt/rev*100):0;
    methodRows+=`<div class="progress-row"><div class="progress-label">${escHtml(m)}</div><div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:var(--green)"></div></div><div class="progress-value">${fmtPKR(amt)}</div></div>`;
  });

  // Room type table
  const rtRows=DB.settings.roomTypes.map(type=>{
    const tRooms=DB.rooms.filter(r=>r.typeId===type.id);
    const tOcc=tRooms.filter(r=>_roomOcc(r)>0).length;
    const tIds=_activeIdsByType.get(type.id)||new Set();   // O(1) membership instead of per-student rooms.find
    const tRev=pays.filter(p=>p.status==='Paid'&&tIds.has(p.studentId)).reduce((s,p)=>s+Number(p.amount),0);
    return `<tr><td><span class="badge" style="background:${type.color}22;border-color:${type.color}44;color:${type.color}">${escHtml(type.name)}</span></td>
      <td class="fw-700">${tRooms.length}</td><td class="text-green fw-700">${tOcc}</td>
      <td class="text-gold">${tRooms.length-tOcc}</td><td class="text-green fw-700">${fmtPKR(tRev)}</td></tr>`;
  }).join('');

  // 12 months trend
  let trendHTML='';
  const mCount=reportPeriod==='month'?6:12;
  const trendData=[];
  for(let i=mCount-1;i>=0;i--){
    const _now=new Date(); const d=new Date(_now.getFullYear(),_now.getMonth()-i,1);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const lbl=d.toLocaleString('default',{month:'short'});
    const r2=calcRevenue(k);
    const e2=DB.expenses.filter(x=>x.date?.startsWith(k)).reduce((s,x)=>s+Number(x.amount),0);
    trendData.push({lbl,rev:r2,exp:e2});
  }
  const maxT=Math.max(...trendData.map(m=>Math.max(m.rev,m.exp)),1);
  trendData.forEach(m=>{
    const rh=Math.max((m.rev/maxT)*100,m.rev?2:0);
    const eh=Math.max((m.exp/maxT)*100,m.exp?2:0);
    trendHTML+=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
      <div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:120px">
        <div style="flex:1;background:var(--green);opacity:0.75;border-radius:3px 3px 0 0;height:${rh}%;min-height:${m.rev?2:0}px;transition:height 0.5s"></div>
        <div style="flex:1;background:var(--red);opacity:0.65;border-radius:3px 3px 0 0;height:${eh}%;min-height:${m.exp?2:0}px;transition:height 0.5s"></div>
      </div>
      <div style="font-size:10px;color:var(--text3)">${m.lbl}</div>
    </div>`;
  });

  // Build report cards data for clickable cards - removed per user request

  return `
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap">
    <!-- Labels name the ACTUAL period. "This Month" was misleading once the header
         month picker moved off the real current month. -->
    <button class="btn ${reportPeriod==='month'?'btn-primary':'btn-secondary'}" onclick="reportPeriod='month';reportDetail=null;renderPage('reports')" title="Report figures for ${escHtml(thisMonthLabel())}">📅 ${escHtml(thisMonthLabel())}</button>
    <button class="btn ${reportPeriod==='year'?'btn-primary':'btn-secondary'}" onclick="reportPeriod='year';reportDetail=null;renderPage('reports')" title="Report figures for ${escHtml(thisYear())}">📅 ${escHtml(thisYear())}</button>
    ${reportDetail?`<button class="btn btn-secondary btn-sm" onclick="reportDetail=null;renderPage('reports')">← Back to Reports</button>`:''}
    <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="printReport()" style="display:flex;align-items:center;gap:4px">🖨️ Print / PDF</button>
      <button class="btn btn-secondary btn-sm" onclick="downloadAllStudentsPDF()" style="color:var(--green);display:flex;align-items:center;gap:4px">📥 All Students PDF</button>
    </div>
  </div>

  <!-- REPORTS: dashboard-style stat cards — each opens its own detail view -->
  <div class="reports-stat-grid">
    <div class="stat-card green" onclick="reportDetail='financial';renderPage('reports')" style="padding:16px 14px;cursor:pointer;position:relative;overflow:hidden${reportDetail==='financial'?';border-color:var(--green)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='financial'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--green)"></div>':''}
      <div style="display:flex;align-items:center;gap:10px">
        <div class="stat-icon" style="width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">💵</div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--green)">Revenue</div><div class="stat-value" style="font-size:18px">${fmtPKR(rev)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='financial'?'▲ showing detail':'click for detail →'}</div></div>
      </div>
    </div>
    <div class="stat-card gold" onclick="reportDetail='pending';renderPage('reports')" style="padding:16px 14px;cursor:pointer;position:relative;overflow:hidden${reportDetail==='pending'?';border-color:var(--amber)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='pending'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--amber)"></div>':''}
      <div style="display:flex;align-items:center;gap:10px">
        <div class="stat-icon" style="width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">⏳</div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--amber)">Pending</div><div class="stat-value" style="font-size:18px">${fmtPKR(pending)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='pending'?'▲ showing detail':'click for detail →'}</div></div>
      </div>
    </div>
    <div class="stat-card red" onclick="reportDetail='expenses';renderPage('reports')" style="padding:16px 14px;cursor:pointer;position:relative;overflow:hidden${reportDetail==='expenses'?';border-color:var(--red)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='expenses'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--red)"></div>':''}
      <div style="display:flex;align-items:center;gap:10px">
        <div class="stat-icon" style="width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">📉</div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--red)">Expenses</div><div class="stat-value" style="font-size:18px">${fmtPKR(totalExp)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='expenses'?'▲ showing detail':'click for detail →'}</div></div>
      </div>
    </div>
    <div class="stat-card purple" onclick="reportDetail='netprofit';renderPage('reports')" style="padding:16px 14px;cursor:pointer;position:relative;overflow:hidden${reportDetail==='netprofit'?';border-color:var(--purple)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='netprofit'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--purple)"></div>':''}
      <div style="display:flex;align-items:center;gap:10px">
        <div class="stat-icon" style="width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${icon('chart')}</div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--purple)">Available Fund</div><div class="stat-value" style="font-size:18px;color:${net>=0?'var(--green)':'var(--red)'}">${fmtPKR(net)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='netprofit'?'▲ showing detail':'click for detail →'}</div></div>
      </div>
    </div>
    <div class="stat-card teal" onclick="reportDetail='rooms';renderPage('reports')" style="padding:16px 14px;cursor:pointer;position:relative;overflow:hidden${reportDetail==='rooms'?';border-color:var(--teal)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='rooms'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--teal)"></div>':''}
      <div style="display:flex;align-items:center;gap:10px">
        <div class="stat-icon" style="width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🏠</div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--teal)">Occupancy</div><div class="stat-value" style="font-size:18px">${occRate}%</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${occ}/${DB.rooms.length} rooms</div></div>
      </div>
    </div>
    <div class="stat-card blue" onclick="reportDetail='transfers';renderPage('reports')" style="padding:16px 14px;cursor:pointer;position:relative;overflow:hidden${reportDetail==='transfers'?';border-color:var(--accent)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='transfers'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent)"></div>':''}
      <div style="display:flex;align-items:center;gap:10px">
        <div class="stat-icon" style="width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🏦</div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent-strong)">Transfers</div><div class="stat-value" style="font-size:18px">${fmtPKR((DB.transfers||[]).reduce((s,t)=>s+Number(t.amount),0))}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${(DB.transfers||[]).length} records</div></div>
      </div>
    </div>
    <div class="stat-card blue" onclick="reportDetail='students';renderPage('reports')" style="padding:16px 14px;cursor:pointer;position:relative;overflow:hidden${reportDetail==='students'?';border-color:var(--blue)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='students'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--blue)"></div>':''}
      <div style="display:flex;align-items:center;gap:10px">
        <div class="stat-icon" style="width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👥</div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--blue)">Students</div><div class="stat-value" style="font-size:18px">${DB.students.filter(t=>t.status==='Active').length}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='students'?'▲ showing detail':DB.students.length+' total'}</div></div>
      </div>
    </div>
  </div>

  ${reportDetail ? renderReportDetail(reportDetail, pays, exps, rev, pending, totalExp, net, occ) : `
  <div class="two-col" style="margin-bottom:20px">
    <div class="card">
      <div class="card-header"><div class="card-title">${icon('trendUp')} Revenue vs Expenses</div></div>
      <div style="display:flex;gap:6px;align-items:flex-end;height:140px">${trendHTML}</div>
      <div class="chart-legend mt-8"><div class="chart-legend-item"><div class="chart-legend-dot" style="background:var(--green)"></div>Revenue</div><div class="chart-legend-item"><div class="chart-legend-dot" style="background:var(--red)"></div>Expenses</div></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">💳 Payment Methods</div></div>
      ${methodRows||'<div class="text-muted" style="font-size:13px">No data for this period</div>'}
    </div>
  </div>
  <div class="two-col" style="margin-bottom:20px">
    <div class="card">
      <div class="card-header"><div class="card-title">📉 Expense Breakdown</div></div>
      ${catRows||'<div class="text-muted" style="font-size:13px">No expenses for this period</div>'}
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">🏨 Room Type Performance</div></div>
      <div class="table-wrap"><table><thead><tr><th>Type</th><th>Total</th><th>Occupied</th><th>Vacant</th><th>Revenue</th></tr></thead><tbody>${rtRows}</tbody></table></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">👥 Student Summary</div><div style="display:flex;gap:8px"><button class="btn btn-secondary btn-sm" onclick="reportDetail='students';renderPage('reports')" style="font-size:11px">👁 View All →</button></div></div>
    <div class="three-col">
      ${[['Active Students',DB.students.filter(t=>t.status==='Active').length,'var(--green)','students'],['Left',DB.students.filter(t=>t.status==='Left').length,'var(--text3)','students'],['Blacklisted',DB.students.filter(t=>t.status==='Blacklisted').length,'var(--red)','students'],['Total Registered',DB.students.length,'var(--accent)','students'],['Total Rooms',DB.rooms.length,'var(--blue)','rooms'],['Total Payments',DB.payments.length,'var(--teal)','financial']].map(([l,v,c,det])=>`<div class="card" style="padding:16px;text-align:center;cursor:pointer;transition:var(--transition)" onclick="reportDetail='${det}';renderPage('reports')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''"><div class="stat-label">${l}</div><div class="fw-800" style="font-size:28px;margin-top:6px;color:${c}">${v}</div><div style="font-size:10px;color:var(--text3);margin-top:4px">click for detail →</div></div>`).join('')}
    </div>
  </div>
  `}

  `;
}

// ════════════════════════════════════════════════════════════════════════════
// FUNDS TRANSFER
// ════════════════════════════════════════════════════════════════════════════
function showTransferRecordsModal() {
  const transfers = (DB.transfers||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const totalAll = transfers.reduce((s,t)=>s+Number(t.amount),0);
  // MONTH-SCOPE FIX: was new Date() (real current month), which ignored the header
  // month picker — selecting March still showed August's transfers in this card.
  const mo = thisMonth();
  const moLabel = thisMonthLabel();
  const moTransfers = transfers.filter(t=>t.date?.startsWith(mo));
  const moTotal = moTransfers.reduce((s,t)=>s+Number(t.amount),0);

  const rows = transfers.length===0
    ? '<div style="padding:32px;text-align:center;color:var(--text3)"><div style="font-size:36px;margin-bottom:10px">🏦</div><div style="font-size:14px">No transfers recorded yet</div></div>'
    : '<div class="table-wrap"><table><thead><tr><th>#</th><th>Date</th><th>Amount</th><th>Method</th><th>Received By</th><th>Description</th><th>Actions</th></tr></thead><tbody>'
      + transfers.map((tr, idx)=>
          '<tr>'
          +'<td style="font-size:11px;font-weight:700;color:var(--text3)">'+String(idx+1).padStart(2,'0')+'</td>'
          +'<td style="font-size:12px;color:var(--text3)">'+fmtDate(tr.date)+'</td>'
          +'<td style="font-size:15px;font-weight:900;color:var(--blue)">'+fmtPKR(tr.amount)+'</td>'
          +'<td>'+(tr.method==='Cash'?'<span class="badge badge-green">💵 Cash</span>':'<span class="badge badge-blue">🏦 Bank</span>')+'</td>'
          +'<td style="font-weight:600;color:var(--text2)">'+escHtml(tr.receivedBy||'—')+'</td>'
          +'<td style="color:var(--text3);font-size:12px;max-width:140px;white-space:normal">'+escHtml(tr.description||'—')+'</td>'
          +'<td><div style="display:flex;gap:5px">'
          +'<button class="btn btn-secondary btn-sm" style="font-size:10px;padding:3px 8px" onclick="showEditTransferModal(\''+tr.id+'\')">✏️ Edit</button>'
          +'<button class="btn btn-danger btn-sm" style="font-size:10px;padding:3px 7px" onclick="deleteTransferFromModal(\''+tr.id+'\')">✕</button>'
          +'</div></td>'
          +'</tr>'
        ).join('')
      + '</tbody></table></div>';

  showModal('modal-xl','🏦 Funds Transfer Records',`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--blue);margin-bottom:6px">🏦 Total Funds Transferred</div>
        <div style="font-size:28px;font-weight:900;color:var(--blue)">${fmtPKR(totalAll)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${transfers.length} record${transfers.length!==1?'s':''} · all months</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--green);margin-bottom:6px">📅 ${escHtml(moLabel)}</div>
        <div style="font-size:28px;font-weight:900;color:var(--green)">${fmtPKR(moTotal)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${moTransfers.length} transfer${moTransfers.length!==1?'s':''}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--purple);margin-bottom:6px">💵 Cash vs Bank</div>
        <div style="font-size:16px;font-weight:900;color:var(--text);line-height:1.4">
          <span style="color:var(--green)">${fmtPKR(transfers.filter(t=>t.method==='Cash').reduce((s,t)=>s+Number(t.amount),0))}</span>
          <span style="color:var(--text3);font-size:12px"> cash</span><br>
          <span style="color:var(--blue)">${fmtPKR(transfers.filter(t=>t.method!=='Cash').reduce((s,t)=>s+Number(t.amount),0))}</span>
          <span style="color:var(--text3);font-size:12px"> bank</span>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:4px">all months</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Table below lists <strong>all months</strong> — only the ${escHtml(moLabel)} card is month-scoped.</div>
    ${rows}`,
  `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
   <button class="btn btn-primary" onclick="closeModal();navigate('reports')">+ New Transfer (Reports)</button>`);
}

async function deleteTransferFromModal(id) {
  showConfirm('Delete transfer?','This cannot be undone.',(async ()=>{
    DB.transfers = (DB.transfers||[]).filter(x=>x.id!==id);
    await saveDB();
    closeModal();
    setTimeout(()=>showTransferRecordsModal(), 100);
    toast('Transfer deleted','info');
  }));
}

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
  `<button class="btn btn-secondary" onclick="closeModal();setTimeout(()=>showTransferRecordsModal(),80)">Cancel</button>
   <button class="btn btn-primary" onclick="submitEditTransfer('${id}')"><span class=\"micon\" style=\"font-size:14px\">save</span> Save</button>`);
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
  setTimeout(()=>showTransferRecordsModal(), 80);
  toast('Transfer updated','success');
}

function showAddTransferModal() {
  showModal('modal-md','🏦 New Funds Transfer',`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:18px;font-size:13px;color:var(--text2)">
      Record a cash or bank funds transfer
    </div>
    <div class="form-grid">
      <div class="field"><label>Transfer Method *</label>
        <select class="form-control" id="f-trmethod">
          <option value="Cash">💵 Cash</option>
          <option value="Bank Transfer">🏦 Bank Transfer</option>
          <option value="JazzCash">📱 JazzCash</option>
          <option value="EasyPaisa">📱 EasyPaisa</option>
        </select>
      </div>
      <div class="field"><label>Amount (PKR) *</label><input class="form-control" id="f-tramt" type="number" placeholder="Enter amount"></div>
      <div class="field"><label>Date *</label><input class="form-control cdp-trigger" id="f-trdate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field"><label>Received By</label><input class="form-control" id="f-trrec" placeholder="Owner / Recipient Name"></div>
      <div class="field col-full"><label>Description / Notes</label><textarea class="form-control" id="f-trdesc" placeholder="Purpose of transfer…" rows="2"></textarea></div>
    </div>`,
  `<button class="btn btn-secondary btn-sm" onclick="closeModal();showTransferRecordsModal()" style="margin-right:auto">📋 View Records</button>
   <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-primary" onclick="submitAddTransfer()">✓ Record Transfer</button>`);
}
async function submitAddTransfer() {
  const amt = parseFloat(document.getElementById('f-tramt').value);
  const method = document.getElementById('f-trmethod').value;
  const date = document.getElementById('f-trdate').value;
  if(!amt||!method||!date){toast('Fill all required fields','error');return;}
  if(!DB.transfers) DB.transfers = [];
  DB.transfers.push({
    id:'tr_'+uid(), method, amount:amt, date,
    receivedBy: document.getElementById('f-trrec').value.trim(),
    description: document.getElementById('f-trdesc').value.trim(),
    notes: document.getElementById('f-trdesc').value.trim(),
    byWarden: (typeof CUR_USER !== 'undefined' && CUR_USER?.name) ? CUR_USER.name : '',
    createdAt: today()
  });
  await saveDB(); closeModal();
  // Stay on current page (dashboard) and refresh it — don't redirect to reports
  renderPage(currentPage);
  toast('Transfer recorded — ' + fmtPKR(amt) + ' transferred','success');
}
async function deleteTransfer(id) {
  showConfirm('Delete transfer record?','This cannot be undone.',(async ()=>{
    DB.transfers = (DB.transfers||[]).filter(x=>x.id!==id);
    await saveDB(); renderPage('reports'); toast('Transfer deleted','info');
  }));
}



function downloadDetailPDF(type) {
  const key = reportPeriod==='month' ? thisMonth() : thisYear();
  const label = reportPeriod==='month' ? 'Monthly' : 'Annual';
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,key));
  const exps = DB.expenses.filter(e=>e.date?.startsWith(key));
  const rev = calcRevenue(key);
  const totalExp = exps.reduce((s,e)=>s+Number(e.amount),0);
  const net = rev - totalExp;
  const css = printDocStyles();
  // MONTH-STAMP FIX: the header previously showed only the generation date, so two
  // PDFs for different months were indistinguishable once printed. Each type also
  // declares its own scope, because not every section is month-filtered:
  //   financial / netprofit / expenses → the selected period
  //   pending / students / rooms       → deliberately all-months (see _scopeNote)
  const _periodLabel = reportPeriod==='month' ? thisMonthLabel() : thisYear();
  const _allMonthTypes = ['pending','students','rooms'];
  const _scopeNote = _allMonthTypes.includes(type)
    ? 'ALL MONTHS (not limited to '+escHtml(_periodLabel)+')'
    : escHtml(_periodLabel);
  let body = `<div class="hdr"><div><div class="ht">${DB.settings.hostelName}</div><div class="hs">${_allMonthTypes.includes(type)?'':label+' '}${type==='financial'?'Revenue':type==='pending'?'Pending Payments':type==='netprofit'?'Available Fund Summary':type==='students'?'Student Directory':type==='rooms'?'Room Occupancy':'Expense'} Report · <strong>${_scopeNote}</strong> · Generated ${new Date().toLocaleDateString()}</div></div></div>`;
  if(type==='financial'){
    body+=`<div class="kg"><div class="kc"><span class="kl">Revenue</span><div class="kv gr">PKR ${rev.toLocaleString()}</div></div><div class="kc"><span class="kl">Pending</span><div class="kv go">PKR ${pays.filter(p=>p.status==='Pending').reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0).toLocaleString()}</div></div><div class="kc"><span class="kl">Transactions</span><div class="kv">${pays.length}</div></div></div>`;
    body+=`<table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Paid</th><th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>${pays.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${p.studentName||'—'}</td><td class="go">#${p.roomNumber||'—'}</td><td>${p.month||'—'}</td><td class="${p.status==='Paid'?'gr':''}">PKR ${Number(p.amount).toLocaleString()}</td><td class="${(p.unpaid||0)>0?'re':''}">PKR ${(p.unpaid||0).toLocaleString()}</td><td>${p.method||'—'}</td><td class="${p.status==='Paid'?'gr':'re'}">${p.status}</td><td>${p.date||'—'}</td></tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:#aaa;padding:10px">No records</td></tr>'}</tbody></table>`;
  } else if(type==='pending'){
    const pend = DB.payments.filter(p=>p.status==='Pending');
    const totalUnpaid = pend.reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
    body+=`<div class="kg"><div class="kc"><span class="kl">Unpaid Records</span><div class="kv re">${pend.length}</div></div><div class="kc"><span class="kl">Total Outstanding</span><div class="kv re">PKR ${totalUnpaid.toLocaleString()}</div></div><div class="kc"><span class="kl">Partial Paid</span><div class="kv gr">PKR ${pend.reduce((s,p)=>s+Number(p.amount||0),0).toLocaleString()}</div></div></div>`;
    body+=`<table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Still Owed</th><th>Due Date</th></tr></thead><tbody>${pend.sort((a,b)=>new Date(a.dueDate||a.date)-new Date(b.dueDate||b.date)).map(p=>`<tr><td>${p.studentName||'—'}</td><td class="go">#${p.roomNumber||'—'}</td><td>${p.month||'—'}</td><td class="${Number(p.amount)>0?'gr':''}">PKR ${Number(p.amount||0).toLocaleString()}</td><td class="re">PKR ${(p.unpaid!=null?p.unpaid:p.amount).toLocaleString()}</td><td>${p.dueDate||'—'}</td></tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:10px">No pending payments</td></tr>'}</tbody></table>`;
  } else if(type==='netprofit'){
    body+=`<div class="kg"><div class="kc"><span class="kl">Revenue</span><div class="kv gr">PKR ${rev.toLocaleString()}</div></div><div class="kc"><span class="kl">Expenses</span><div class="kv re">PKR ${totalExp.toLocaleString()}</div></div><div class="kc"><span class="kl">Available Fund</span><div class="kv" style="color:${net>=0?'#16a34a':'#dc2626'}">PKR ${net.toLocaleString()}</div></div></div>`;
    body+=`<table><thead><tr><th>Category</th><th>Amount</th><th>% of Expenses</th></tr></thead><tbody>${DB.settings.expenseCategories.map(cat=>{const amt=exps.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.amount),0);const pct=totalExp>0?Math.round(amt/totalExp*100):0;return amt>0?`<tr><td>${cat}</td><td class="re">PKR ${amt.toLocaleString()}</td><td>${pct}%</td></tr>`:'';}).join('')||'<tr><td colspan="3" style="text-align:center;color:#aaa;padding:10px">No expenses</td></tr>'}</tbody></table>`;
  } else if(type==='expenses'){
    body+=`<div class="kc" style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:18px"><span class="kl">Total Expenses</span><div class="kv re">PKR ${totalExp.toLocaleString()}</div></div>`;
    body+=`<table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>${exps.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=>`<tr><td>${e.date||'—'}</td><td>${e.category||'—'}</td><td>${e.description||'—'}</td><td class="re">PKR ${Number(e.amount).toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#aaa;padding:10px">No expenses</td></tr>'}</tbody></table>`;
  } else if(type==='students'){
    const _idx=_buildRoomStudentIndex();
    body+=`<table><thead><tr><th>ID</th><th>Name</th><th>Room</th><th>Father</th><th>Phone</th><th>Rent/mo</th><th>Join Date</th><th>Status</th></tr></thead><tbody>${DB.students.map(t=>{const room=_idx.roomById.get(t.roomId);return `<tr><td style="font-size:10px;color:#aaa">#${t.id}</td><td>${t.name}</td><td class="go">${room?'#'+room.number:'—'}</td><td>${t.fatherName||'—'}</td><td>${t.phone||'—'}</td><td class="gr">PKR ${Number(t.rent||0).toLocaleString()}</td><td>${t.joinDate||'—'}</td><td class="${t.status==='Active'?'gr':t.status==='Blacklisted'?'re':''}">${t.status}</td></tr>`;}).join('')||'<tr><td colspan="8" style="text-align:center;color:#aaa;padding:10px">No students</td></tr>'}</tbody></table>`;
  } else if(type==='rooms'){
    const _idx=_buildRoomStudentIndex();
    body+=`<table><thead><tr><th>Room</th><th>Floor</th><th>Type</th><th>Capacity</th><th>Occupied</th><th>Rent/mo</th><th>Status</th><th>Students</th></tr></thead><tbody>${DB.rooms.map(r=>{const t=getRoomType(r);const _sts=_idx.activeStudentsByRoom.get(r.id)||[];const oc=_sts.length;const names=_sts.map(s=>s.name);return `<tr><td class="go">#${r.number}</td><td>${r.floor}</td><td>${t.name}</td><td>${t.capacity} beds</td><td class="${oc>0?'gr':''}">${oc}/${t.capacity}</td><td class="gr">PKR ${Number(r.rent||0).toLocaleString()}</td><td class="${oc>0?'gr':'go'}">${oc>0?'Occupied':'Vacant'}</td><td>${names.join(', ')||'—'}</td></tr>`;}).join('')||'<tr><td colspan="8" style="text-align:center;color:#aaa;padding:10px">No rooms</td></tr>'}</tbody></table>`;
  }
  body += `<div class="ft">${_scopeNote} · Generated ${new Date().toLocaleDateString()} · ${DB.settings.hostelName} · Confidential</div>`;
  // Filename carries the same scope as the content — an all-months report must not
  // be filed under a single month key, or saved PDFs collide in the download folder.
  const _fileScope = _allMonthTypes.includes(type) ? 'AllMonths' : key;
  _electronPDF(`<!DOCTYPE html><html><head><title>${type} detail — ${_scopeNote}</title>${css}</head><body>${body}</body></html>`,
    (DB.settings.hostelName||'Report').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_'+type+'_'+_fileScope+'.pdf', {pageSize:'A4'});
}

function downloadReportDetailPDF(detailId) {
  const mo = reportPeriod==='month' ? thisMonth() : thisYear();
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,mo));
  const exps = DB.expenses.filter(e=>e.date?.startsWith(mo));
  const rev = calcRevenue(mo);
  const totalExp = exps.reduce((s,e)=>s+Number(e.amount),0);
  const net = rev - totalExp;
  const hostel = DB.settings.hostelName || 'DAMAM Hostel';
  const titles = {financial:'Financial Summary',pending:'Pending Payments',netprofit:'Available Fund',students:'Student Directory',rooms:'Room Occupancy',expenses:'Expense Breakdown',payments:'Payment Transactions'};
  const title = titles[detailId] || 'Report';
  // Same scope contract as downloadDetailPDF: these sections are NOT month-filtered,
  // so they must not be presented under the selected month's heading.
  const _dPeriodLabel = reportPeriod==='month' ? thisMonthLabel() : thisYear();
  const _dAllMonths   = ['pending','students','rooms'].includes(detailId);
  const _dScope       = _dAllMonths ? 'ALL MONTHS (not limited to '+_dPeriodLabel+')' : _dPeriodLabel;
  let tableHTML = '';
  if(detailId==='financial'||detailId==='payments') {
    const p2 = detailId==='payments' ? pays.filter(x=>x.status==='Paid') : pays;
    tableHTML = `<h3>Transactions</h3><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Paid</th><th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>${p2.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${p.studentName||'—'}</td><td>#${p.roomNumber||'—'}</td><td>${p.month||'—'}</td><td class="green">${fmtPKR(p.amount)}</td><td class="${(p.unpaid||0)>0?'red':''}">${fmtPKR(p.unpaid||0)}</td><td>${p.method||'—'}</td><td>${p.status}</td><td>${fmtDate(p.date)}</td></tr>`).join('')}</tbody></table>`;
  } else if(detailId==='expenses') {
    tableHTML = `<h3>Expenses</h3><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>${exps.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${e.category||'—'}</td><td>${e.description||'—'}</td><td class="red">${fmtPKR(e.amount)}</td></tr>`).join('')}</tbody></table>`;
  } else if(detailId==='pending') {
    const pendPays = DB.payments.filter(p=>p.status==='Pending');
    tableHTML = `<h3>Pending Payments</h3><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Outstanding</th><th>Method</th><th>Date</th></tr></thead><tbody>${pendPays.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${p.studentName||'—'}</td><td>#${p.roomNumber||'—'}</td><td>${p.month||'—'}</td><td class="${p.unpaid!=null&&Number(p.amount)>0?'green':''}">${p.unpaid!=null?fmtPKR(p.amount):'—'}</td><td class="red">${fmtPKR(p.unpaid!=null?p.unpaid:p.amount)}</td><td>${p.method||'—'}</td><td>${fmtDate(p.date)}</td></tr>`).join('')}</tbody></table>`;
  } else if(detailId==='students') {
    const _idx=_buildRoomStudentIndex();
    tableHTML = `<h3>Student Directory</h3><table><thead><tr><th>Name</th><th>Room</th><th>Join Date</th><th>Rent</th><th>Status</th><th>Phone</th></tr></thead><tbody>${DB.students.map(t=>{const r=_idx.roomById.get(t.roomId);return `<tr><td>${t.name}</td><td>${r?'#'+r.number:'—'}</td><td>${fmtDate(t.joinDate)}</td><td class="green">${fmtPKR(t.rent)}</td><td>${t.status}</td><td>${t.phone||'—'}</td></tr>`;}).join('')}</tbody></table>`;
  } else if(detailId==='rooms') {
    const _idx=_buildRoomStudentIndex();
    tableHTML = `<h3>Room Occupancy</h3><table><thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Capacity</th><th>Students</th><th>Status</th></tr></thead><tbody>${DB.rooms.map(r=>{const type=getRoomType(r);const sts=_idx.activeStudentsByRoom.get(r.id)||[];const occ=sts.length;return `<tr><td class="gold">#${r.number}</td><td>${type.name}</td><td>${r.floor}</td><td>${occ}/${type.capacity}</td><td>${sts.map(t=>t.name).join(', ')||'Empty'}</td><td>${occ>0?'Occupied':'Vacant'}</td></tr>`;}).join('')}</tbody></table>`;
  } else if(detailId==='netprofit') {
    // Full breakdown: revenue transactions + expense list + transfers deduction
    const allTr = (DB.transfers||[]).filter(t=>(t.date||'').startsWith(mo));
    const trTotal = allTr.reduce((s,t)=>s+Number(t.amount),0);
    tableHTML = `
      <div class="summary-box" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#16a34a;font-weight:700;margin-bottom:4px">Revenue</div><div style="font-size:22px;font-weight:900;color:#16a34a">${fmtPKR(rev)}</div></div>
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#dc2626;font-weight:700;margin-bottom:4px">Total Outgoing</div><div style="font-size:22px;font-weight:900;color:#dc2626">${fmtPKR(totalExp + trTotal)}</div><div style="font-size:10px;color:#666">Expenses ${fmtPKR(totalExp)}${trTotal>0?' + Transfers '+fmtPKR(trTotal):''}</div></div>
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:${net>=0?'#16a34a':'#dc2626'};font-weight:700;margin-bottom:4px">Available Fund</div><div style="font-size:22px;font-weight:900;color:${net>=0?'#16a34a':'#dc2626'}">${fmtPKR(net - trTotal)}</div></div>
        </div>
      </div>
      <h3>💰 Revenue — Paid Transactions</h3>
      <table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount Paid</th><th>Method</th><th>Date</th></tr></thead><tbody>
      ${pays.filter(p=>p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${p.studentName||'—'}</td><td class="gold">#${p.roomNumber||'—'}</td><td>${p.month||'—'}</td><td class="green">${fmtPKR(p.amount)}</td><td>${p.method||'—'}</td><td>${fmtDate(p.date)}</td></tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:10px">No paid transactions this period</td></tr>'}
      </tbody></table>
      <h3 style="margin-top:18px">📉 Expenses</h3>
      <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${exps.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${e.category||'—'}</td><td>${e.description||'—'}</td><td class="red">${fmtPKR(e.amount)}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#aaa;padding:10px">No expenses this period</td></tr>'}
      </tbody></table>
      ${allTr.length>0?`
      <h3 style="margin-top:18px">🏦 Funds Transfer</h3>
      <table><thead><tr><th>Date</th><th>Method</th><th>Description</th><th>Received By</th><th>Amount</th></tr></thead><tbody>
      ${allTr.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${t.method||'—'}</td><td>${t.description||'—'}</td><td>${t.receivedBy||'—'}</td><td class="red">${fmtPKR(t.amount)}</td></tr>`).join('')}
      <tr style="background:#f8fafc;font-weight:700"><td colspan="4" style="text-align:right;padding:8px 12px">Total Funds Transferred</td><td class="red">${fmtPKR(trTotal)}</td></tr>
      </tbody></table>`:''}`;
  } else if(detailId==='transfers') {
    const allTr2 = (DB.transfers||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
    const trTotal2 = allTr2.reduce((s,t)=>s+Number(t.amount),0);
    const moTr2 = allTr2.filter(t=>(t.date||'').startsWith(mo));
    const moTrTotal = moTr2.reduce((s,t)=>s+Number(t.amount),0);
    tableHTML = `
      <div class="summary-box" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#1d4ed8;font-weight:700;margin-bottom:4px">Total All Time</div><div style="font-size:22px;font-weight:900;color:#1d4ed8">${fmtPKR(trTotal2)}</div><div style="font-size:10px;color:#666">${allTr2.length} records</div></div>
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#1d4ed8;font-weight:700;margin-bottom:4px">This Period</div><div style="font-size:22px;font-weight:900;color:#1d4ed8">${fmtPKR(moTrTotal)}</div><div style="font-size:10px;color:#666">${moTr2.length} records</div></div>
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:700;margin-bottom:4px">Period Revenue</div><div style="font-size:22px;font-weight:900;color:#16a34a">${fmtPKR(rev)}</div></div>
        </div>
      </div>
      <h3>🏦 All Funds Transfer Records</h3>
      <table><thead><tr><th>Date</th><th>Method</th><th>Description</th><th>Received By</th><th>By Warden</th><th>Amount</th></tr></thead><tbody>
      ${allTr2.length===0?'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:14px">No transfers recorded yet</td></tr>':allTr2.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${t.method||'—'}</td><td>${t.description||'—'}</td><td>${t.receivedBy||'—'}</td><td>${t.byWarden||'—'}</td><td class="red" style="font-weight:900">${fmtPKR(t.amount)}</td></tr>`).join('')}
      <tr style="background:#f8fafc;font-weight:700"><td colspan="5" style="text-align:right;padding:8px 12px">Grand Total</td><td class="red">${fmtPKR(trTotal2)}</td></tr>
      </tbody></table>`;
  }
  _electronPDF(`<!DOCTYPE html><html><head><title>${title} — ${_dScope} — ${hostel}</title>${printDocStyles()}</head><body><div class="header"><div><div class="title">${hostel} — ${title}</div><div style="font-size:12px;color:#666;margin-top:3px"><strong>${escHtml(_dScope)}</strong> · Generated ${new Date().toLocaleDateString()}</div></div><div style="font-size:11px;color:#94a3b8">PDF Report</div></div><div class="kpi-grid"><div class="kpi"><label>Revenue</label><div class="val green">${fmtPKR(rev)}</div></div><div class="kpi"><label>Expenses</label><div class="val red">${fmtPKR(totalExp)}</div></div><div class="kpi"><label>Available Fund</label><div class="val ${net>=0?'green':'red'}">${fmtPKR(net)}</div></div></div>${_dAllMonths?`<div style="font-size:11px;color:#b45309;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:8px 10px;margin-bottom:12px">The three figures above are for <strong>${escHtml(_dPeriodLabel)}</strong>. The table below covers <strong>all months</strong>.</div>`:''}${tableHTML}<div class="footer">${escHtml(_dScope)} · Generated ${new Date().toLocaleDateString()} · ${hostel} · Confidential</div></body></html>`,
    hostel.replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'') + '_' + title.replace(/\s+/g,'-') + '_' + (_dAllMonths?'AllMonths':mo) + '.pdf',
    { pageSize: 'A4' });
}

function printReport() {
  const mo=reportPeriod==='month'?thisMonth():thisYear();
  const pays=DB.payments.filter(p=>_payMatchesMonth(p,mo));
  const exps=DB.expenses.filter(e=>e.date?.startsWith(mo));
  const rev=calcRevenue(mo);
  const expTotal=exps.reduce((s,e)=>s+Number(e.amount),0);
  const _printKey=reportPeriod==='month'?thisMonth():thisYear();
  const pending=DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,_printKey)).reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
  const _occIdx=_buildRoomStudentIndex();
  const occ=DB.rooms.filter(r=>_occIdx.occ(r)>0).length;
  // MONTH-STAMP FIX: header/badge/title previously said only "Monthly Report", so a
  // March printout and an August printout were identical on paper.
  const _rptPeriodLabel = reportPeriod==='month' ? thisMonthLabel() : thisYear();
  const _rptHtml = `<!DOCTYPE html><html><head><title>${reportPeriod==='month'?'Monthly':'Annual'} Report ${_rptPeriodLabel} — ${DB.settings.hostelName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;padding:32px;font-size:13px}
    .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #7c3aed;margin-bottom:24px}
    .title{font-size:22px;font-weight:800;color:#1a1a2e}
    .subtitle{font-size:12px;color:#666;margin-top:3px}
    .badge{padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#7c3aed22;color:#6d28d9;border:1px solid #7c3aed55}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center}
    .kpi label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px}
    .kpi .val{font-size:20px;font-weight:900;color:#1e293b}
    .section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px}
    .section h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f1f5f9;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0}
    td{padding:8px 12px;border-bottom:1px solid #f8fafc}
    .green{color:#16a34a;font-weight:700}
    .red{color:#dc2626;font-weight:700}
    .gold{color:#5b21b6;font-weight:700}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{padding:16px}}
  </style></head><body>
  <div class="header">
    <div><div class="title">${DB.settings.hostelName}</div><div class="subtitle">${reportPeriod==='month'?'Monthly':'Annual'} Report · <strong>${escHtml(_rptPeriodLabel)}</strong> · ${DB.settings.location||''} · Generated ${new Date().toLocaleDateString()}</div></div>
    <div class="badge">${escHtml(_rptPeriodLabel)}</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><label>Revenue</label><div class="val green">${fmtPKR(rev)}</div></div>
    <div class="kpi"><label>Expenses</label><div class="val red">${fmtPKR(expTotal)}</div></div>
    <div class="kpi"><label>Available Fund</label><div class="val" style="color:${rev-expTotal>=0?'#16a34a':'#dc2626'}">${fmtPKR(rev-expTotal)}</div></div>
    <div class="kpi"><label>Pending</label><div class="val gold">${fmtPKR(pending)}</div></div>
    <div class="kpi"><label>Rooms Occupied</label><div class="val">${occ}/${DB.rooms.length}</div></div>
    <div class="kpi"><label>Active Students</label><div class="val">${DB.students.filter(t=>t.status==='Active').length}</div></div>
    <div class="kpi"><label>Total Payments</label><div class="val">${pays.filter(p=>p.status==='Paid').length}</div></div>
    <div class="kpi"><label>Funds Transferred</label><div class="val" style="color:#5b21b6">${fmtPKR((DB.transfers||[]).filter(tr=>(tr.date||'').startsWith(mo)).reduce((s,t)=>s+Number(t.amount),0))}</div></div>
  </div>
  <div class="section">
    <h3>💳 Payment Transactions</h3>
    <table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${pays.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${p.studentName||'—'}</td><td class="gold">#${p.roomNumber||'—'}</td><td>${p.month||'—'}</td><td class="${p.status==='Paid'?'green':'red'}">${fmtPKR(p.amount)}</td><td>${p.method||'—'}</td><td class="${p.status==='Paid'?'green':'red'}">${p.status}</td><td>${fmtDate(p.date)||'—'}</td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:12px">No transactions</td></tr>'}
    </tbody></table>
  </div>
  <div class="section">
    <h3>📉 Expense Breakdown</h3>
    <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>
    ${exps.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${e.category||'—'}</td><td>${e.description||'—'}</td><td class="red">${fmtPKR(e.amount)}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px">No expenses</td></tr>'}
    </tbody></table>
  </div>
  <div class="section">
    <h3>🏦 Funds Transfer</h3>
    <table><thead><tr><th>Date</th><th>Description</th><th>Method</th><th>Amount</th></tr></thead><tbody>
    ${(DB.transfers||[]).filter(tr=>(tr.date||'').startsWith(mo)).map(tr=>`<tr><td>${fmtDate(tr.date)}</td><td>${escHtml(tr.description||'Transfer')}</td><td>${escHtml(tr.method||'—')}</td><td class="gold">${fmtPKR(tr.amount)}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px">No transfers this period</td></tr>'}
    </tbody></table>
    ${(DB.transfers||[]).length>0?`<div style="text-align:right;padding:8px 12px 0;font-weight:700;color:#5b21b6">Total Funds Transferred: ${fmtPKR((DB.transfers||[]).filter(tr=>(tr.date||'').startsWith(mo)).reduce((s,t)=>s+Number(t.amount),0))}</div>`:''}
  </div>
  <div class="footer">${escHtml(_rptPeriodLabel)} · Rooms Occupied and Active Students are current totals, not ${escHtml(_rptPeriodLabel)} figures · Generated ${new Date().toLocaleDateString()} · ${DB.settings.hostelName} Management System · Confidential</div>
  </body></html>`;
  _electronPDF(_rptHtml, (DB.settings.hostelName||'Report').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_Report_'+(reportPeriod==='month'?thisMonth():thisYear())+'.pdf', {pageSize:'A4'});
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL SYSTEM
// ════════════════════════════════════════════════════════════════════════════

function downloadDetailCSV(type) {
  const key = reportPeriod==='month' ? thisMonth() : thisYear();
  let rows = [], filename = '';
  if (type === 'financial') {
    filename = 'Revenue_'+key+'.csv';
    rows.push(['Student','Room','Month','Amount Paid','Method','Date']);
    DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,key)).forEach(p=>{
      rows.push([p.studentName||'—','#'+(p.roomNumber||'—'),p.month||'—',p.amount,p.method||'—',p.date||'—']);
    });
  } else if (type === 'pending') {
    // All-months by design — filename says so, so it can't be mistaken for a
    // single-month export sitting next to Revenue_2026-03.csv in the same folder.
    filename = 'Pending_Payments_AllMonths.csv';
    rows.push(['Student','Room','Month','Partial Paid','Outstanding','Method','Date']);
    DB.payments.filter(p=>p.status==='Pending').forEach(p=>{
      rows.push([p.studentName||'—','#'+(p.roomNumber||'—'),p.month||'—',
        p.unpaid!=null?p.amount:0, p.unpaid!=null?p.unpaid:p.amount,
        p.method||'—', p.date||'—']);
    });
  } else if (type === 'expenses') {
    filename = 'Expenses_'+key+'.csv';
    rows.push(['Date','Category','Description','Amount']);
    DB.expenses.filter(e=>(e.date||'').startsWith(key)).forEach(e=>{
      rows.push([e.date||'—',e.category||'—',e.description||'—',e.amount]);
    });
  } else if (type === 'transfers') {
    filename = 'Funds_Transfer_AllMonths.csv';
    rows.push(['Date','Description','Method','Amount','Received By','Notes']);
    (DB.transfers||[]).forEach(t=>{
      rows.push([t.date||'—',t.description||'—',t.method||'—',t.amount,t.receivedBy||'—',t.notes||'—']);
    });
  } else if (type === 'students') {
    filename = 'Students_'+(studentReportFilter==='All'?'All':studentReportFilter)+'.csv';
    rows.push(['Name','Father Name','Room','Phone','CNIC','Join Date','Rent','Status']);
    const list = studentReportFilter==='All' ? DB.students : DB.students.filter(t=>t.status===studentReportFilter);
    const _idx=_buildRoomStudentIndex();
    list.forEach(t=>{
      const r = _idx.roomById.get(t.roomId);
      rows.push([t.name||'—',t.fatherName||'—',r?'#'+r.number:'—',t.phone||'—',t.cnic||'—',t.joinDate||'—',t.rent,t.status||'—']);
    });
  } else if (type === 'rooms') {
    filename = 'Rooms_Occupancy.csv';
    rows.push(['Room','Floor','Type','Capacity','Occupied','Rent','Status','Students']);
    const _idx=_buildRoomStudentIndex();
    DB.rooms.forEach(r=>{
      const t=getRoomType(r); const _sts=_idx.activeStudentsByRoom.get(r.id)||[]; const oc=_sts.length;
      const names=_sts.map(s=>s.name).join('; ');
      rows.push(['#'+r.number,r.floor||'—',t.name||'—',t.capacity,oc,r.rent,oc>0?'Occupied':'Vacant',names||'—']);
    });
  } else if (type === 'payments') {
    filename = 'PaymentMethods_'+key+'.csv';
    rows.push(['Student','Room','Month','Amount Paid','Method','Status','Date']);
    DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,key)).forEach(p=>{
      rows.push([p.studentName||'—','#'+(p.roomNumber||'—'),p.month||'—',p.amount,p.method||'—',p.status,p.date||'—']);
    });
  } else if (type === 'netprofit') {
    filename = 'AvailableFund_'+key+'.csv';
    rows.push(['Date','Type','Description','Amount']);
    DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,key)).forEach(p=>{
      rows.push([p.date||'—','Income',p.studentName+' · '+p.month,p.amount]);
    });
    DB.expenses.filter(e=>(e.date||'').startsWith(key)).forEach(e=>{
      rows.push([e.date||'—','Expense',e.category+': '+e.description,'-'+e.amount]);
    });
  }
  if (!rows.length) { toast('No data to export','error'); return; }
  const csv = rows.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500); // FIX 18: revoke blob URL to free memory
  toast('Downloaded: '+filename,'success');
}
// calPopoverOpen declared in dashboard.js (shared)
// ════════════════════════════════════════════════════════════════════════════
// ANNUAL ARCHIVE  (page: 'archive' — nav.js / command palette)
// Read-only viewer of historical records in DB.archive (old payment/expense
// records, e.g. migrated from the legacy localStorage build). Grouped by year.
// Restored in Phase 2 §6.1 — the call site existed but renderArchive() was never
// implemented, so the page threw a ReferenceError (caught by TypeScript).
// ════════════════════════════════════════════════════════════════════════════
function _archiveClassify(r) {
  // An expense record has a category and no student/month fields; everything
  // else is treated as a payment record.
  const isExpense = r && r.category !== undefined &&
    r.studentName === undefined && r.studentId === undefined && r.month === undefined;
  const date  = (r && (r.date || r.paidDate || r.dueDate)) || '';
  const mYear = (r && r.month && String(r.month).match(/\d{4}/)) ? String(r.month).match(/\d{4}/)[0] : '';
  const year  = mYear || (date ? String(date).slice(0, 4) : '') || 'Undated';
  const label = isExpense
    ? (r.category || 'Expense') + (r.description ? ' — ' + r.description : '')
    : (r.studentName || '—') + (r.month ? ' · ' + r.month : '');
  return { isExpense, date, year, label, amount: Number((r && r.amount) || 0) };
}

function renderArchive() {
  const items = (DB.archive || []).map(_archiveClassify);

  if (items.length === 0) {
    return `
    <div class="empty-state" style="padding:48px 24px;text-align:center">
      <div class="icon" style="font-size:40px;margin-bottom:8px">🗄</div>
      <h3>No archived records yet</h3>
      <div style="font-size:13px;color:var(--text3);max-width:440px;margin:8px auto 0;line-height:1.6">
        The Annual Archive holds historical payment and expense records from
        previous years (for example, data carried over from an older version of
        the app). Nothing has been archived on this device yet.
      </div>
    </div>`;
  }

  const payTotal = items.filter(x => !x.isExpense).reduce((s, x) => s + x.amount, 0);
  const expTotal = items.filter(x =>  x.isExpense).reduce((s, x) => s + x.amount, 0);

  // Group by year, newest first.
  const byYear = {};
  items.forEach(x => { (byYear[x.year] = byYear[x.year] || []).push(x); });
  const years = Object.keys(byYear).sort((a, b) => String(b).localeCompare(String(a)));

  const summary = `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3);margin-bottom:6px">Archived Records</div>
      <div style="font-size:22px;font-weight:900;color:var(--text)">${items.length}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">${years.length} year${years.length !== 1 ? 's' : ''}</div>
    </div>
    <div style="background:var(--card);border:1px solid rgba(46,201,138,0.25);border-radius:var(--radius);padding:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3);margin-bottom:6px">Archived Payments</div>
      <div style="font-size:22px;font-weight:900;color:var(--green)">${fmtPKR(payTotal)}</div>
    </div>
    <div style="background:var(--card);border:1px solid rgba(224,82,82,0.25);border-radius:var(--radius);padding:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3);margin-bottom:6px">Archived Expenses</div>
      <div style="font-size:22px;font-weight:900;color:var(--red)">${fmtPKR(expTotal)}</div>
    </div>
  </div>`;

  const sections = years.map(y => {
    const rows = byYear[y]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map(x => `
        <tr>
          <td style="padding:8px 12px;color:var(--text3);white-space:nowrap">${escHtml(x.date || '—')}</td>
          <td style="padding:8px 12px">
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${x.isExpense ? 'rgba(224,82,82,0.12)' : 'rgba(46,201,138,0.12)'};color:${x.isExpense ? 'var(--red)' : 'var(--green)'}">${x.isExpense ? 'Expense' : 'Payment'}</span>
          </td>
          <td style="padding:8px 12px;color:var(--text)">${escHtml(x.label)}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;color:${x.isExpense ? 'var(--red)' : 'var(--green)'}">${fmtPKR(x.amount)}</td>
        </tr>`).join('');
    return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:16px;overflow:hidden">
      <div style="padding:12px 16px;font-weight:800;font-size:14px;color:var(--text);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
        <span class="micon" style="font-size:18px;color:var(--accent)">event</span>${escHtml(String(y))}
        <span style="margin-left:auto;font-size:11px;font-weight:600;color:var(--text3)">${byYear[y].length} record${byYear[y].length !== 1 ? 's' : ''}</span>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">${rows}</table></div>
    </div>`;
  }).join('');

  return summary + sections;
}
