/* ─── HOSTIX — REPORTS MODULE ───────────────────────────────────────────────
   Contains: renderReportDetail, renderReports, showTransferRecordsModal,
             deleteTransferFromModal, showEditTransferModal, submitEditTransfer,
             showAddTransferModal, submitAddTransfer, deleteTransfer,
             shareReportWhatsApp, shareReportEmail, toggleRptDrop,
             shareAllStudentsPDFWhatsApp, shareAllStudentsPDFGmail,
             downloadDetailPDF, downloadReportDetailPDF, printReport,
             downloadDetailCSV
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function renderReportDetail(id, pays, exps, rev, pending, totalExp, net, occ) {
  const periodLabel = reportPeriod==='month' ? thisMonth() : thisYear();
  const csvBtn = (type, color) => `<button onclick="downloadDetailCSV('${type}')" style="background:${color};color:#fff;border:none;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">📥 CSV</button>`;
  const pdfBtn = `<button onclick="downloadReportDetailPDF('${id}')" style="background:var(--gold);color:#000;border:none;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">📄 PDF</button>`;

  // ── REVENUE ────────────────────────────────────────────────────────────────
  if (id === 'financial') {
    const paidOnly = pays.filter(p=>p.status==='Paid');
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">💰 Revenue — Paid Transactions (${periodLabel})</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('financial','#16a34a')}${pdfBtn}</div>
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
      ${paidOnly.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr style="cursor:pointer" onclick="showViewStudentModal('${p.studentId}')">
        <td class="fw-700" style="color:var(--blue)">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${p.roomNumber||'—'}</td>
        <td class="text-muted" style="font-size:12px">${escHtml(p.month||'—')}</td>
        <td class="text-green fw-700">${fmtPKR(p.amount)}</td>
        <td>${pmBadge(p.method)}</td>
        <td class="text-muted" style="font-size:12px">${fmtDate(p.date)}</td>
      </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">No paid transactions this period</td></tr>'}
      </tbody></table></div>
    </div>`;
  }

  // ── PENDING ────────────────────────────────────────────────────────────────
  if (id === 'pending') {
    const pendingPays = DB.payments.filter(p=>p.status==='Pending');
    const totalPend = pendingPays.reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">⏳ Pending Payments — All Unpaid</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('pending','#d97706')}${pdfBtn}</div>
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
          <div style="font-size:26px;font-weight:900;color:var(--blue)">${pendingPays.filter(p=>p.unpaid!=null&&Number(p.amount)>0).length}</div>
        </div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Outstanding</th><th>Method</th><th>Date</th><th>Action</th></tr></thead><tbody>
      ${pendingPays.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr>
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
    </div>`;
  }

  // ── AVAILABLE FUND ─────────────────────────────────────────────────────────
  if (id === 'netprofit') {
    const allItems = [
      ...pays.filter(p=>p.status==='Paid').map(p=>({date:p.date,label:escHtml(p.studentName||'—'),desc:'Room #'+(p.roomNumber||'')+' · '+escHtml(p.month||''),amount:Number(p.amount),type:'income'})),
      ...exps.map(e=>({date:e.date,label:escHtml(e.category||'Expense'),desc:escHtml(e.description||'—'),amount:Number(e.amount),type:'expense'}))
    ].sort((a,b)=>new Date(b.date)-new Date(a.date));
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">📊 Available Fund — ${periodLabel}</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('netprofit','#7c3aed')}${pdfBtn}</div>
      </div>
      <div style="background:${net>=0?'var(--green-dim)':'var(--red-dim)'};border:1px solid ${net>=0?'rgba(46,201,138,0.4)':'rgba(224,82,82,0.4)'};border-radius:12px;padding:22px;text-align:center;margin-bottom:16px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:${net>=0?'var(--green)':'var(--red)'};font-weight:700;margin-bottom:8px">Available Fund</div>
        <div style="font-size:44px;font-weight:900;color:${net>=0?'var(--green)':'var(--red)'};letter-spacing:-1px">${fmtPKR(net)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:6px">${fmtPKR(rev)} collected − ${fmtPKR(totalExp)} expenses</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${allItems.map(item=>`<tr>
        <td class="text-muted" style="font-size:12px">${fmtDate(item.date)}</td>
        <td>${item.type==='income'?'<span class="badge badge-green">💰 Income</span>':'<span class="badge badge-red">📉 Expense</span>'}</td>
        <td><div style="font-weight:600">${item.label}</div><div style="font-size:11px;color:var(--text3)">${item.desc}</div></td>
        <td style="font-weight:700;color:${item.type==='income'?'var(--green)':'var(--red)'};">${item.type==='income'?'+':'−'}${fmtPKR(item.amount)}</td>
      </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">No transactions</td></tr>'}
      </tbody></table></div>
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
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">👥 Student Report</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('students','#1d4ed8')}${pdfBtn}</div>
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
      ${filtered.map(t=>{const r=DB.rooms.find(x=>x.id===t.roomId);return `<tr style="cursor:pointer" onclick="showViewStudentModal('${t.id}')">
        <td class="fw-700" style="color:var(--blue)">${escHtml(t.name)}</td>
        <td class="text-muted" style="font-size:12px">${escHtml(t.fatherName||'—')}</td>
        <td class="text-gold fw-700">${r?'#'+r.number:'—'}</td>
        <td class="text-muted" style="font-size:12px">${fmtDate(t.joinDate)}</td>
        <td class="text-green fw-700">${fmtPKR(t.rent)}</td>
        <td>${statusBadge(t.status)}</td>
        <td class="text-muted">${escHtml(t.phone||'—')}</td>
      </tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No students found</td></tr>'}
      </tbody></table></div>
    </div>`;
  }

  // ── ROOMS ──────────────────────────────────────────────────────────────────
  if (id === 'rooms') {
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header"><div class="card-title">🏠 Room Occupancy — Details</div>${pdfBtn}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--green);font-weight:700">Occupied</div><div style="font-size:28px;font-weight:900;color:var(--green)">${occ}</div></div>
        <div style="background:var(--gold-dim);border:1px solid rgba(200,168,75,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--gold2);font-weight:700">Vacant</div><div style="font-size:28px;font-weight:900;color:var(--gold2)">${DB.rooms.length-occ}</div></div>
        <div style="background:var(--blue-dim);border:1px solid rgba(74,156,240,0.3);border-radius:10px;padding:16px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--blue);font-weight:700">Total</div><div style="font-size:28px;font-weight:900;color:var(--blue)">${DB.rooms.length}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Occupancy</th><th>Students</th><th>Status</th><th>Rent</th></tr></thead><tbody>
      ${DB.rooms.map(r=>{const type=getRoomType(r);const occ2=getRoomOccupancy(r);const sts=DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');return `<tr style="cursor:pointer" onclick="showRoomDetail('${r.id}')"><td class="fw-700 text-gold">#${r.number}</td><td><span class="badge" style="background:${type.color}22;color:${type.color};border-color:${type.color}44">${escHtml(type.name)}</span></td><td class="text-muted">${r.floor} Floor</td><td class="text-muted">${occ2}/${type.capacity}</td><td style="font-size:12px">${sts.map(t=>escHtml(t.name)).join(', ')||'<span style="color:var(--text3)">Empty</span>'}</td><td><span class="badge ${occ2>0?'badge-green':'badge-gray'}">${occ2>0?'Occupied':'Vacant'}</span></td><td class="text-green fw-700">${fmtPKR(r.rent)}/mo</td></tr>`;}).join('')}
      </tbody></table></div>
    </div>`;
  }

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  if (id === 'expenses') {
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">📉 Expenses — ${periodLabel}</div>
        <div style="display:flex;align-items:center;gap:10px"><div style="font-size:18px;font-weight:900;color:var(--red)">${fmtPKR(totalExp)}</div>${csvBtn('expenses','#dc2626')}${pdfBtn}</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${exps.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=>`<tr>
        <td class="text-muted" style="font-size:12px">${fmtDate(e.date)}</td>
        <td><span class="badge badge-amber">${escHtml(e.category)}</span></td>
        <td>${escHtml(e.description||'—')}</td>
        <td class="text-red fw-700">${fmtPKR(e.amount)}</td>
      </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">No expenses this period</td></tr>'}
      </tbody></table></div>
    </div>`;
  }

  // ── PAYMENT METHODS ────────────────────────────────────────────────────────
  if (id === 'payments') {
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header"><div class="card-title">💳 Payment Methods — ${periodLabel}</div>${pdfBtn}</div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount Paid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${pays.filter(p=>p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr>
        <td class="fw-700">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${p.roomNumber||'—'}</td>
        <td class="text-muted">${escHtml(p.month||'—')}</td>
        <td class="text-green fw-700">${fmtPKR(p.amount)}</td>
        <td>${pmBadge(p.method)}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="text-muted" style="font-size:12px">${fmtDate(p.date)}</td>
      </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No paid transactions</td></tr>'}
      </tbody></table></div>
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
        <div class="card-title">🏦 Transfers to Owner — All Records</div>
        <div style="display:flex;gap:8px;align-items:center">${csvBtn('transfers','#1d4ed8')}<button class="btn btn-primary btn-sm" onclick="showAddTransferModal()">+ New</button>${pdfBtn}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--blue-dim);border:1px solid rgba(74,156,240,0.35);border-radius:10px;padding:14px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--blue);font-weight:700;margin-bottom:4px">Total</div><div style="font-size:22px;font-weight:900;color:var(--blue)">${fmtPKR(totalTr)}</div><div style="font-size:10px;color:var(--text3)">${allTr.length} records</div></div>
        <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:14px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--green);font-weight:700;margin-bottom:4px">Cash</div><div style="font-size:22px;font-weight:900;color:var(--green)">${fmtPKR(cashTr)}</div><div style="font-size:10px;color:var(--text3)">${allTr.filter(t=>t.method==='Cash').length} records</div></div>
        <div style="background:var(--purple-dim);border:1px solid rgba(155,109,240,0.3);border-radius:10px;padding:14px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--purple);font-weight:700;margin-bottom:4px">Bank</div><div style="font-size:22px;font-weight:900;color:var(--purple)">${fmtPKR(bankTr)}</div><div style="font-size:10px;color:var(--text3)">${allTr.filter(t=>t.method!=='Cash').length} records</div></div>
        <div style="background:var(--gold-dim);border:1px solid rgba(200,168,75,0.3);border-radius:10px;padding:14px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--gold2);font-weight:700;margin-bottom:4px">This Period</div><div style="font-size:22px;font-weight:900;color:var(--gold2)">${fmtPKR(moTotal)}</div><div style="font-size:10px;color:var(--text3)">${moTr.length} transfers</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Method</th><th>Amount</th><th>Received By</th><th>Notes</th><th>By Warden</th><th>Actions</th></tr></thead><tbody>
      ${allTr.length===0?'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:28px">No transfers yet — click + New to add.</td></tr>'
        :allTr.map(tr=>`<tr>
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
  const occ=DB.rooms.filter(r=>getRoomOccupancy(r)>0).length;
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
    const tOcc=tRooms.filter(r=>getRoomOccupancy(r)>0).length;
    const tIds=DB.students.filter(t=>DB.rooms.find(r=>r.typeId===type.id&&r.id===t.roomId)&&t.status==='Active').map(t=>t.id);
    const tRev=pays.filter(p=>p.status==='Paid'&&tIds.includes(p.studentId)).reduce((s,p)=>s+Number(p.amount),0);
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
    <button class="btn ${reportPeriod==='month'?'btn-primary':'btn-secondary'}" onclick="reportPeriod='month';reportDetail=null;renderPage('reports')">This Month</button>
    <button class="btn ${reportPeriod==='year'?'btn-primary':'btn-secondary'}" onclick="reportPeriod='year';reportDetail=null;renderPage('reports')">This Year</button>
    ${reportDetail?`<button class="btn btn-secondary btn-sm" onclick="reportDetail=null;renderPage('reports')">← Back to Reports</button>`:''}
    <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="printReport()" style="display:flex;align-items:center;gap:4px">🖨️ Print / PDF</button>
      <button class="btn btn-primary btn-sm" onclick="downloadAllStudentsPDF()" style="background:linear-gradient(135deg,#0d2d1a,#0a2015);border:1px solid rgba(46,201,138,0.5);color:var(--green);display:flex;align-items:center;gap:4px">📥 All Students PDF</button>
    </div>
  </div>

  ${reportDetail ? renderReportDetail(reportDetail, pays, exps, rev, pending, totalExp, net, occ) : ''}
  <!-- REPORTS: dashboard-style stat cards — each opens its own detail view -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr;gap:12px;margin-bottom:18px">
    <div style="background:linear-gradient(135deg,#0d2d1a,#0a2015);border:1px solid rgba(46,201,138,${reportDetail==='financial'?'0.7':'0.3'});border-radius:var(--radius);padding:16px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;position:relative;overflow:hidden;transition:var(--transition)" onclick="reportDetail='financial';renderPage('reports')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='financial'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--green)"></div>':''}
      <div style="width:38px;height:38px;border-radius:9px;background:rgba(46,201,138,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">💵</div>
      <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--green)">Revenue</div><div style="font-size:18px;font-weight:900;color:#fff">${fmtPKR(rev)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='financial'?'▲ showing detail':'click for detail →'}</div></div>
    </div>
    <div style="background:linear-gradient(135deg,#1a1000,#120b00);border:1px solid rgba(240,160,48,${reportDetail==='pending'?'0.7':'0.3'});border-radius:var(--radius);padding:16px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;position:relative;overflow:hidden;transition:var(--transition)" onclick="reportDetail='pending';renderPage('reports')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='pending'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--amber)"></div>':''}
      <div style="width:38px;height:38px;border-radius:9px;background:rgba(240,160,48,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">⏳</div>
      <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--amber)">Pending</div><div style="font-size:18px;font-weight:900;color:#fff">${fmtPKR(pending)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='pending'?'▲ showing detail':'click for detail →'}</div></div>
    </div>
    <div style="background:linear-gradient(135deg,#1a0e05,#140b02);border:1px solid rgba(224,82,82,${reportDetail==='expenses'?'0.7':'0.3'});border-radius:var(--radius);padding:16px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;position:relative;overflow:hidden;transition:var(--transition)" onclick="reportDetail='expenses';renderPage('reports')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='expenses'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--red)"></div>':''}
      <div style="width:38px;height:38px;border-radius:9px;background:rgba(224,82,82,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">📉</div>
      <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--red)">Expenses</div><div style="font-size:18px;font-weight:900;color:#fff">${fmtPKR(totalExp)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='expenses'?'▲ showing detail':'click for detail →'}</div></div>
    </div>
    <div style="background:linear-gradient(135deg,#1a1020,#120c1a);border:1px solid rgba(155,109,240,${reportDetail==='netprofit'?'0.7':'0.3'});border-radius:var(--radius);padding:16px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;position:relative;overflow:hidden;transition:var(--transition)" onclick="reportDetail='netprofit';renderPage('reports')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='netprofit'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--purple)"></div>':''}
      <div style="width:38px;height:38px;border-radius:9px;background:rgba(155,109,240,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">📊</div>
      <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--purple)">Available Fund</div><div style="font-size:18px;font-weight:900;color:${net>=0?'var(--green)':'var(--red)'}">${fmtPKR(net)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${reportDetail==='netprofit'?'▲ showing detail':'click for detail →'}</div></div>
    </div>
    <div style="background:linear-gradient(135deg,#001a1a,#001212);border:1px solid rgba(15,188,173,${reportDetail==='rooms'?'0.7':'0.3'});border-radius:var(--radius);padding:16px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;position:relative;overflow:hidden;transition:var(--transition)" onclick="reportDetail='rooms';renderPage('reports')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='rooms'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--teal)"></div>':''}
      <div style="width:38px;height:38px;border-radius:9px;background:rgba(15,188,173,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🏠</div>
      <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--teal)">Occupancy</div><div style="font-size:18px;font-weight:900;color:#fff">${occRate}%</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${occ}/${DB.rooms.length} rooms</div></div>
    </div>
    <!-- FEATURE 4: Transfers to Owner as a full clickable record card -->
    <div style="background:linear-gradient(135deg,#070e18,#040a12);border:1px solid rgba(74,156,240,${reportDetail==='transfers'?'0.7':'0.2'});border-radius:var(--radius);padding:16px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;position:relative;overflow:hidden;transition:var(--transition)" onclick="reportDetail='transfers';renderPage('reports')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${reportDetail==='transfers'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--blue)"></div>':''}
      <div style="width:38px;height:38px;border-radius:9px;background:rgba(74,156,240,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🏦</div>
      <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--blue)">Transfers</div><div style="font-size:18px;font-weight:900;color:#fff">${fmtPKR((DB.transfers||[]).reduce((s,t)=>s+Number(t.amount),0))}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${(DB.transfers||[]).length} records · Owner</div></div>
    </div>
  </div>

  <div class="two-col" style="margin-bottom:20px">
    <div class="card">
      <div class="card-header"><div class="card-title">📈 Revenue vs Expenses</div></div>
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
      ${[['Active Students',DB.students.filter(t=>t.status==='Active').length,'var(--green)','students'],['Left',DB.students.filter(t=>t.status==='Left').length,'var(--text3)','students'],['Blacklisted',DB.students.filter(t=>t.status==='Blacklisted').length,'var(--red)','students'],['Total Registered',DB.students.length,'var(--gold)','students'],['Total Rooms',DB.rooms.length,'var(--blue)','rooms'],['Total Payments',DB.payments.length,'var(--teal)','financial']].map(([l,v,c,det])=>`<div class="card" style="padding:16px;text-align:center;cursor:pointer;transition:var(--transition)" onclick="reportDetail='${det}';renderPage('reports')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''"><div class="stat-label">${l}</div><div class="fw-800" style="font-size:28px;margin-top:6px;color:${c}">${v}</div><div style="font-size:10px;color:var(--text3);margin-top:4px">click for detail →</div></div>`).join('')}
    </div>
  </div>

  ${false ? `
  <div class="card" style="margin-top:20px">
    <div class="card-header"><div class="card-title">🚨 Overdue Payments — Full Detail</div><span class="badge badge-red">${DB.payments.filter(p=>p.status==='Overdue').length} overdue</span></div>
    <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount</th><th>Due Date</th><th>Days Late</th><th>Action</th></tr></thead><tbody>
    ${DB.payments.filter(p=>p.status==='Overdue').length ? DB.payments.filter(p=>p.status==='Overdue').map(p=>{
      const days=p.dueDate?Math.max(0,Math.floor((Date.now()-new Date(p.dueDate))/86400000)):0;
      return '<tr><td class="fw-700" style="cursor:pointer;color:var(--blue)" onclick="showViewStudentModal(\''+p.studentId+'\')">' + escHtml(p.studentName||'—') + '</td><td class="text-gold fw-700">#' + escHtml(String(p.roomNumber||'')) + '</td><td class="text-muted">' + escHtml(p.month||'—') + '</td><td class="text-red fw-700">' + fmtPKR(p.amount) + '</td><td class="text-muted" style="font-size:12px">' + (fmtDate(p.dueDate)||'—') + '</td><td><span class="badge badge-red">' + (days>0?days+' days late':'—') + '</span></td><td><button class="btn btn-success btn-sm" onclick="markPaymentPaid(\''+p.id+'\');reportDetail=\'overdue\';renderPage(\'reports\')">Mark Paid</button></td></tr>';
    }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">🎉 No overdue payments!</td></tr>'}
    </tbody></table></div>
  </div>` : ''}

  ${reportDetail==='students' ? `
  <div class="card" style="margin-top:20px">
    <div class="card-header"><div class="card-title">👥 Full Student Directory</div><div style="display:flex;gap:8px;align-items:center"><span class="badge badge-blue">${DB.students.length} total</span><button class="btn btn-primary btn-sm" onclick="downloadDetailPDF('students')" style="font-size:11px">⬇ Download PDF</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>Student ID</th><th>Name</th><th>Room</th><th>Father</th><th>Phone</th><th>Rent</th><th>Join Date</th><th>Status</th></tr></thead><tbody>
    ${DB.students.length ? DB.students.map(t=>{const room=DB.rooms.find(r=>r.id===t.roomId); return '<tr style="cursor:pointer" onclick="showViewStudentModal(\''+t.id+'\')"><td style="font-family:var(--font-mono);font-size:11px;color:var(--gold2);font-weight:700">#' + escHtml(t.id) + '</td><td style="font-weight:600;color:var(--blue)">' + escHtml(t.name) + '</td><td class="text-gold fw-700">' + (room?'#'+room.number:'—') + '</td><td class="text-muted">' + escHtml(t.fatherName||'—') + '</td><td>' + escHtml(t.phone||'—') + '</td><td class="text-green fw-700">' + fmtPKR(t.rent) + '</td><td class="text-muted" style="font-size:12px">' + fmtDate(t.joinDate) + '</td><td>' + statusBadge(t.status) + '</td></tr>';}).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">No students found</td></tr>'}
    </tbody></table></div>
  </div>` : ''}

  ${reportDetail==='rooms' ? `
  <div class="card" style="margin-top:20px">
    <div class="card-header"><div class="card-title">🏠 Room Occupancy Detail</div><div style="display:flex;gap:8px;align-items:center"><span class="badge badge-gold">${DB.rooms.filter(r=>getRoomOccupancy(r)>0).length}/${DB.rooms.length} occupied</span><button class="btn btn-primary btn-sm" onclick="downloadDetailPDF('rooms')" style="font-size:11px">⬇ Download PDF</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>Room</th><th>Floor</th><th>Type</th><th>Capacity</th><th>Occupied</th><th>Rent/mo</th><th>Status</th><th>Students</th></tr></thead><tbody>
    ${DB.rooms.map(r=>{const t=getRoomType(r);const oc=getRoomOccupancy(r);const names=DB.students.filter(s=>s.roomId===r.id&&s.status==='Active').map(s=>s.name);return '<tr><td class="text-gold fw-700">#'+r.number+'</td><td class="text-muted">'+r.floor+'</td><td><span class="badge" style="background:'+t.color+'22;color:'+t.color+';border:1px solid '+t.color+'44">'+escHtml(t.name)+'</span></td><td>'+t.capacity+' beds</td><td style="font-weight:700;color:'+(oc>0?'var(--green)':'var(--text3)')+'">'+oc+'/'+t.capacity+'</td><td class="text-green fw-700">'+fmtPKR(r.rent)+'</td><td>'+(oc>0?'<span class="badge badge-green">Occupied</span>':'<span class="badge badge-gold">Vacant</span>')+'</td><td style="font-size:12px;color:var(--text2)">'+(names.join(', ')||'—')+'</td></tr>';}).join('')}
    </tbody></table></div>
  </div>` : ''}

  ${reportDetail==='financial' ? `
  <div class="card" style="margin-top:20px">
    <div class="card-header"><div class="card-title">💰 Revenue — Financial Transactions</div><div style="display:flex;gap:8px;align-items:center"><span class="badge badge-green">${DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,key)).length} paid</span><button class="btn btn-primary btn-sm" onclick="downloadDetailPDF('financial')" style="font-size:11px">⬇ Download PDF</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount Paid</th><th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${DB.payments.filter(p=>_payMatchesMonth(p,key)).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>'<tr><td class="fw-700" style="cursor:pointer;color:var(--blue)" onclick="showViewStudentModal(\''+p.studentId+'\')">'+escHtml(p.studentName||'—')+'</td><td class="text-gold fw-700">#'+escHtml(String(p.roomNumber||''))+'</td><td class="text-muted">'+escHtml(p.month||'—')+'</td><td class="text-green fw-700">'+fmtPKR(p.amount)+'</td><td style="color:'+((p.unpaid||0)>0?'var(--red)':'var(--text3)')+'">'+fmtPKR(p.unpaid||0)+'</td><td>'+pmBadge(p.method)+'</td><td>'+statusBadge(p.status)+'</td><td class="text-muted" style="font-size:12px">'+fmtDate(p.date)+'</td></tr>').join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">No transactions found</td></tr>'}
    </tbody></table></div>
  </div>` : ''}

  ${reportDetail==='pending' ? `
  <div class="card" style="margin-top:20px">
    <div class="card-header"><div class="card-title">⏳ Pending Payments — Outstanding Detail</div><div style="display:flex;gap:8px;align-items:center"><span class="badge badge-gold">${DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,key)).length} unpaid this period</span><button class="btn btn-primary btn-sm" onclick="downloadDetailPDF('pending')" style="font-size:11px">⬇ Download PDF</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Still Owed</th><th>Method</th><th>Due Date</th><th>Action</th></tr></thead><tbody>
    ${DB.payments.filter(p=>p.status==='Pending').sort((a,b)=>new Date(a.dueDate||a.date)-new Date(b.dueDate||b.date)).map(p=>'<tr><td class="fw-700" style="cursor:pointer;color:var(--blue)" onclick="showViewStudentModal(\''+p.studentId+'\')">'+escHtml(p.studentName||'—')+'</td><td class="text-gold fw-700">#'+escHtml(String(p.roomNumber||''))+'</td><td class="text-muted">'+escHtml(p.month||'—')+'</td><td style="color:'+(Number(p.amount)>0?'var(--green)':'var(--text3)')+'">'+fmtPKR(p.amount||0)+'</td><td style="font-weight:700;color:var(--red)">'+fmtPKR(p.unpaid!=null?p.unpaid:p.amount)+'</td><td>'+pmBadge(p.method)+'</td><td class="text-muted" style="font-size:12px">'+(fmtDate(p.dueDate)||'—')+'</td><td><button class="btn btn-success btn-sm" style="font-size:11px" onclick="markPaymentPaid(\''+p.id+'\');reportDetail=\'pending\';renderPage(\'reports\')">✓ Collect</button></td></tr>').join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">🎉 No pending payments!</td></tr>'}
    </tbody></table></div>
  </div>` : ''}

  ${reportDetail==='netprofit' ? `
  <div class="card" style="margin-top:20px">
    <div class="card-header"><div class="card-title">📊 Available Fund — Summary</div><div style="display:flex;gap:8px;align-items:center"><span class="badge" style="background:${net>=0?'rgba(46,201,138,0.15)':'rgba(224,82,82,0.15)'};color:${net>=0?'var(--green)':'var(--red)'};">${net>=0?'Profit':'Loss'}</span><button class="btn btn-primary btn-sm" onclick="downloadDetailPDF('netprofit')" style="font-size:11px">⬇ Download PDF</button></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;padding:16px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center"><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Total Revenue</div><div style="font-size:24px;font-weight:800;color:var(--green)">${fmtPKR(rev)}</div><div style="font-size:11px;color:var(--text3);margin-top:4px">${pays.filter(p=>p.status==='Paid').length} paid transactions</div></div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center"><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Total Expenses</div><div style="font-size:24px;font-weight:800;color:var(--red)">${fmtPKR(totalExp)}</div><div style="font-size:11px;color:var(--text3);margin-top:4px">${exps.length} expense records</div></div>
      <div style="background:var(--bg3);border:1px solid ${net>=0?'rgba(46,201,138,0.3)':'rgba(224,82,82,0.3)'};border-radius:10px;padding:16px;text-align:center"><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Available Fund</div><div style="font-size:28px;font-weight:900;color:${net>=0?'var(--green)':'var(--red)'}">${fmtPKR(net)}</div><div style="font-size:11px;color:var(--text3);margin-top:4px">${rev>0?Math.round(net/rev*100):0}% margin</div></div>
    </div>
    <div style="padding:0 16px 16px"><div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Expense Breakdown by Category</div>
    <table><thead><tr><th>Category</th><th>Amount</th><th>% of Expenses</th><th>Entries</th></tr></thead><tbody>
    ${DB.settings.expenseCategories.map(cat=>{const amt=exps.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.amount),0);const cnt=exps.filter(e=>e.category===cat).length;const pct=totalExp>0?Math.round(amt/totalExp*100):0;return amt>0?'<tr><td><span class="badge badge-amber">'+escHtml(cat)+'</span></td><td class="text-red fw-700">'+fmtPKR(amt)+'</td><td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:var(--red);border-radius:3px"></div></div><span style="font-size:11px;color:var(--text3);width:30px">'+pct+'%</span></div></td><td class="text-muted" style="font-size:12px">'+cnt+'</td></tr>':'';}).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">No expenses recorded</td></tr>'}
    </tbody></table></div>
  </div>` : ''}

  ${reportDetail==='expenses' ? `
  <div class="card" style="margin-top:20px">
    <div class="card-header"><div class="card-title">📉 Expense Detail</div><div style="display:flex;gap:8px;align-items:center"><span class="badge badge-red">${exps.length} records · ${fmtPKR(totalExp)}</span><button class="btn btn-primary btn-sm" onclick="downloadDetailPDF('expenses')" style="font-size:11px">⬇ Download PDF</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>
    ${DB.expenses.filter(e=>e.date?.startsWith(key)).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=>'<tr><td class="text-muted" style="font-size:12px">'+fmtDate(e.date)+'</td><td><span class="badge badge-amber">'+escHtml(e.category)+'</span></td><td>'+escHtml(e.description||'—')+'</td><td class="text-red fw-700">'+fmtPKR(e.amount)+'</td></tr>').join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px">No expenses found</td></tr>'}
    </tbody></table></div>
  </div>` : ''}

  `;
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSFERS TO OWNER
// ════════════════════════════════════════════════════════════════════════════
function showTransferRecordsModal() {
  const transfers = (DB.transfers||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const totalAll = transfers.reduce((s,t)=>s+Number(t.amount),0);
  const mo = new Date().toISOString().slice(0,7);
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

  showModal('modal-xl','🏦 Transfer Records — Hostel → Owner',`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      <div style="background:linear-gradient(135deg,#0a1828,#060f1c);border:1px solid rgba(74,156,240,0.4);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--blue);margin-bottom:6px">🏦 Total Transferred</div>
        <div style="font-size:28px;font-weight:900;color:var(--blue)">${fmtPKR(totalAll)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${transfers.length} record${transfers.length!==1?'s':''} total</div>
      </div>
      <div style="background:linear-gradient(135deg,#082818,#051a10);border:1px solid rgba(46,201,138,0.35);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--green);margin-bottom:6px">📅 This Month</div>
        <div style="font-size:28px;font-weight:900;color:var(--green)">${fmtPKR(moTotal)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${moTransfers.length} transfer${moTransfers.length!==1?'s':''}</div>
      </div>
      <div style="background:linear-gradient(135deg,#14082a,#0d0520);border:1px solid rgba(155,109,240,0.35);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--purple);margin-bottom:6px">💵 Cash vs Bank</div>
        <div style="font-size:16px;font-weight:900;color:#fff;line-height:1.4">
          <span style="color:var(--green)">${fmtPKR(transfers.filter(t=>t.method==='Cash').reduce((s,t)=>s+Number(t.amount),0))}</span>
          <span style="color:var(--text3);font-size:12px"> cash</span><br>
          <span style="color:var(--blue)">${fmtPKR(transfers.filter(t=>t.method!=='Cash').reduce((s,t)=>s+Number(t.amount),0))}</span>
          <span style="color:var(--text3);font-size:12px"> bank</span>
        </div>
      </div>
    </div>
    ${rows}`,
  `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
   <button class="btn btn-primary" onclick="closeModal();navigate('reports')">+ New Transfer (Reports)</button>`);
}

async function deleteTransferFromModal(id) {
  showConfirm('Delete transfer?','This cannot be undone.',()=>{
    DB.transfers = (DB.transfers||[]).filter(x=>x.id!==id);
    await saveDB();
    closeModal();
    setTimeout(()=>showTransferRecordsModal(), 100);
    toast('Transfer deleted','info');
  });
}

function showEditTransferModal(id) {
  const tr = (DB.transfers||[]).find(x=>x.id===id);
  if(!tr) return;
  showModal('modal-md','✏️ Edit Transfer — Hostel → Owner',`
    <div style="background:linear-gradient(135deg,#0d1a2d,#081525);border:1px solid rgba(74,156,240,0.3);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--text2)">
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

function submitEditTransfer(id) {
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
  showModal('modal-md','🏦 New Transfer to Owner',`
    <div style="background:linear-gradient(135deg,#0d1a2d,#081525);border:1px solid rgba(74,156,240,0.3);border-radius:10px;padding:14px;margin-bottom:18px;font-size:13px;color:var(--text2)">
      Record cash or bank transfer sent from this hostel to the <strong>Owner</strong>
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
  toast('Transfer recorded — ' + fmtPKR(amt) + ' sent to owner','success');
}
async function deleteTransfer(id) {
  showConfirm('Delete transfer record?','This cannot be undone.',()=>{
    DB.transfers = (DB.transfers||[]).filter(x=>x.id!==id);
    await saveDB(); renderPage('reports'); toast('Transfer deleted','info');
  });
}


function shareReportWhatsApp() {
  const mo=reportPeriod==='month'?thisMonth():thisYear();
  const rev=calcRevenue(mo);
  const exps=DB.expenses.filter(e=>e.date?.startsWith(mo)).reduce((s,e)=>s+Number(e.amount),0);
  const occ=DB.rooms.filter(r=>getRoomOccupancy(r)>0).length;
  const msg=`*${DB.settings.hostelName}*
*${reportPeriod==='month'?'Monthly':'Annual'} Report*
━━━━━━━━━━━━━━━━━━━━
💰 *Revenue:* ${fmtPKR(rev)}
📉 *Expenses:* ${fmtPKR(exps)}
📊 *Available Fund:* ${fmtPKR(rev-exps)}
━━━━━━━━━━━━━━━━━━━━
🏠 *Rooms:* ${occ}/${DB.rooms.length} occupied
👥 *Active Students:* ${DB.students.filter(t=>t.status==='Active').length}
━━━━━━━━━━━━━━━━━━━━
Generated by ${DB.settings.hostelName} MS`;
  openExternalLink('whatsapp://send?text='+encodeURIComponent(msg));
}

function shareReportEmail() {
  const mo=reportPeriod==='month'?thisMonth():thisYear();
  const rev=calcRevenue(mo);
  const exps=DB.expenses.filter(e=>e.date?.startsWith(mo)).reduce((s,e)=>s+Number(e.amount),0);
  const occ=DB.rooms.filter(r=>getRoomOccupancy(r)>0).length;
  const subject=encodeURIComponent(`${reportPeriod==='month'?'Monthly':'Annual'} Report — ${DB.settings.hostelName}`);
  const body=encodeURIComponent(`${DB.settings.hostelName}\n${reportPeriod==='month'?'Monthly':'Annual'} Financial Report\n${'─'.repeat(40)}\n\nREVENUE: ${fmtPKR(rev)}\nEXPENSES: ${fmtPKR(exps)}\nNET PROFIT: ${fmtPKR(rev-exps)}\nROOMS: ${occ}/${DB.rooms.length} occupied\nACTIVE STUDENTS: ${DB.students.filter(t=>t.status==='Active').length}\n\n${'─'.repeat(40)}\nGenerated ${new Date().toLocaleDateString()} by ${DB.settings.hostelName} Management System`);
  // Open Gmail compose directly in browser
  openExternalLink('https://mail.google.com/mail/?view=cm&fs=1&su='+subject+'&body='+body);
}

// ── REPORT DROPDOWN TOGGLE ────────────────────────────────────────────────────
function toggleRptDrop(id) {
  const el = document.getElementById(id);
  if(!el) return;
  const isOpen = el.style.display === 'block';
  // Close all report dropdowns first
  ['rpt-print-drop','rpt-stu-drop'].forEach(function(did) {
    const d = document.getElementById(did);
    if(d) d.style.display = 'none';
  });
  if(!isOpen) {
    el.style.display = 'block';
    // Close when clicking outside
    setTimeout(function() {
      function outside(e) {
        if(!el.contains(e.target)) { el.style.display='none'; document.removeEventListener('click',outside,true); }
      }
      document.addEventListener('click', outside, true);
    }, 10);
  }
}

// ── SHARE ALL-STUDENTS PDF SUMMARY via WhatsApp ───────────────────────────────
function shareAllStudentsPDFWhatsApp() {
  const mo = thisMonth();
  const moLabel = thisMonthLabel();

  // Per-student fee data for this month
  const activeStudents = DB.students.filter(function(s){ return s.status==='Active'; })
    .slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });

  var grandPaid = 0, grandPending = 0, grandRent = 0;

  var studentLines = activeStudents.map(function(s) {
    var room = DB.rooms.find(function(r){ return r.id===s.roomId; });
    var roomNo = room ? '#'+room.number : '—';
    var _mkDate = new Date(mo+'-01');
    var _mkLabel = _mkDate.toLocaleString('default',{month:'long',year:'numeric'});
    var _mkLabel2 = _mkDate.toLocaleString('default',{month:'short',year:'numeric'});
    var mPays = DB.payments.filter(function(p){
      return p.studentId===s.id && _payMatchesMonth(p, mo);
    });
    var paid    = mPays.filter(function(p){return p.status==='Paid';}).reduce(function(s,p){return s+Number(p.amount);},0);
    var pending = mPays.filter(function(p){return p.status==='Pending';}).reduce(function(s,p){return s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount));},0);
    var status  = mPays.length===0 ? '⬜ No record' : pending>0 ? '🔴 Pending' : '✅ Paid';
    grandRent    += Number(s.rent||0);
    grandPaid    += paid;
    grandPending += pending;
    return status+' '+escHtml(s.name)+' ('+roomNo+') Rent:'+fmtPKR(s.rent)+(paid>0?' Paid:'+fmtPKR(paid):'')+(pending>0?' Due:'+fmtPKR(pending):'');
  });

  var lines = [
    '*'+DB.settings.hostelName+'*',
    '*Students Fee Report — '+moLabel+'*',
    '━━━━━━━━━━━━━━━━━━━━'
  ].concat(studentLines).concat([
    '━━━━━━━━━━━━━━━━━━━━',
    '👥 Total Active: '+activeStudents.length,
    '✅ Collected: '+fmtPKR(grandPaid),
    '🔴 Pending: '+fmtPKR(grandPending),
    '📅 Generated: '+new Date().toLocaleDateString()
  ]);

  openExternalLink('whatsapp://send?text=' + encodeURIComponent(lines.join('\n')));
}

// ── SHARE ALL-STUDENTS PDF SUMMARY via Gmail ──────────────────────────────────
function shareAllStudentsPDFGmail() {
  const mo = thisMonth();
  const moLabel = thisMonthLabel();
  const activeStudents = DB.students.filter(function(s){ return s.status==='Active'; })
    .slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });

  var grandPaid = 0, grandPending = 0;
  var studentLines = [];

  activeStudents.forEach(function(s) {
    var room = DB.rooms.find(function(r){ return r.id===s.roomId; });
    var roomNo = room ? '#'+room.number : '—';
    var _mkDate = new Date(mo+'-01');
    var _mkLabel = _mkDate.toLocaleString('default',{month:'long',year:'numeric'});
    var _mkLabel2 = _mkDate.toLocaleString('default',{month:'short',year:'numeric'});
    var mPays = DB.payments.filter(function(p){
      return p.studentId===s.id && _payMatchesMonth(p, mo);
    });
    var paid    = mPays.filter(function(p){return p.status==='Paid';}).reduce(function(s,p){return s+Number(p.amount);},0);
    var pending = mPays.filter(function(p){return p.status==='Pending';}).reduce(function(s,p){return s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount));},0);
    var status  = mPays.length===0 ? 'NO RECORD' : pending>0 ? 'PENDING' : 'PAID';
    grandPaid    += paid;
    grandPending += pending;
    studentLines.push('['+status+'] '+(s.name||'?')+' | Room '+roomNo+' | Rent: '+fmtPKR(s.rent)+(paid>0?' | Paid: '+fmtPKR(paid):'')+(pending>0?' | Due: '+fmtPKR(pending):''));
  });

  const subject = encodeURIComponent('Students Fee Report — ' + moLabel + ' | ' + DB.settings.hostelName);
  const bodyText =
    DB.settings.hostelName + '\nStudents Fee Report — ' + moLabel +
    '\n' + '─'.repeat(50) +
    '\n\n' + studentLines.join('\n') +
    '\n\n' + '─'.repeat(50) +
    '\nTOTAL COLLECTED: ' + fmtPKR(grandPaid) +
    '\nTOTAL PENDING:   ' + fmtPKR(grandPending) +
    '\n' + '─'.repeat(50) +
    '\nGenerated ' + new Date().toLocaleDateString() + ' | ' + DB.settings.hostelName + ' Management System';
  const body = encodeURIComponent(bodyText);
  // Open Gmail compose directly — no default mail client needed
  openExternalLink('https://mail.google.com/mail/?view=cm&fs=1&su=' + subject + '&body=' + body);
}

function downloadDetailPDF(type) {
  const key = reportPeriod==='month' ? thisMonth() : thisYear();
  const label = reportPeriod==='month' ? 'Monthly' : 'Annual';
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,key));
  const exps = DB.expenses.filter(e=>e.date?.startsWith(key));
  const rev = calcRevenue(key);
  const totalExp = exps.reduce((s,e)=>s+Number(e.amount),0);
  const net = rev - totalExp;
  const css = `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;padding:28px;font-size:12px}.hdr{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:3px solid #c8a84b;margin-bottom:20px}.ht{font-size:20px;font-weight:800}.hs{font-size:11px;color:#666;margin-top:3px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f1f5f9;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0}td{padding:7px 10px;border-bottom:1px solid #f8fafc}.gr{color:#16a34a;font-weight:700}.re{color:#dc2626;font-weight:700}.go{color:#854d0e;font-weight:700}.kg{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}.kc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center}.kl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px}.kv{font-size:20px;font-weight:900;color:#1e293b}.ft{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8}@media print{body{padding:16px}}</style>`;
  let body = `<div class="hdr"><div><div class="ht">${DB.settings.hostelName}</div><div class="hs">${label} ${type==='financial'?'Revenue':type==='pending'?'Pending Payments':type==='netprofit'?'Available Fund Summary':'Expense'} Report · ${new Date().toLocaleDateString()}</div></div></div>`;
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
    body+=`<table><thead><tr><th>ID</th><th>Name</th><th>Room</th><th>Father</th><th>Phone</th><th>Rent/mo</th><th>Join Date</th><th>Status</th></tr></thead><tbody>${DB.students.map(t=>{const room=DB.rooms.find(r=>r.id===t.roomId);return `<tr><td style="font-size:10px;color:#aaa">#${t.id}</td><td>${t.name}</td><td class="go">${room?'#'+room.number:'—'}</td><td>${t.fatherName||'—'}</td><td>${t.phone||'—'}</td><td class="gr">PKR ${Number(t.rent||0).toLocaleString()}</td><td>${t.joinDate||'—'}</td><td class="${t.status==='Active'?'gr':t.status==='Blacklisted'?'re':''}">${t.status}</td></tr>`;}).join('')||'<tr><td colspan="8" style="text-align:center;color:#aaa;padding:10px">No students</td></tr>'}</tbody></table>`;
  } else if(type==='rooms'){
    body+=`<table><thead><tr><th>Room</th><th>Floor</th><th>Type</th><th>Capacity</th><th>Occupied</th><th>Rent/mo</th><th>Status</th><th>Students</th></tr></thead><tbody>${DB.rooms.map(r=>{const t=getRoomType(r);const oc=getRoomOccupancy(r);const names=DB.students.filter(s=>s.roomId===r.id&&s.status==='Active').map(s=>s.name);return `<tr><td class="go">#${r.number}</td><td>${r.floor}</td><td>${t.name}</td><td>${t.capacity} beds</td><td class="${oc>0?'gr':''}">${oc}/${t.capacity}</td><td class="gr">PKR ${Number(r.rent||0).toLocaleString()}</td><td class="${oc>0?'gr':'go'}">${oc>0?'Occupied':'Vacant'}</td><td>${names.join(', ')||'—'}</td></tr>`;}).join('')||'<tr><td colspan="8" style="text-align:center;color:#aaa;padding:10px">No rooms</td></tr>'}</tbody></table>`;
  }
  body += `<div class="ft">Generated ${new Date().toLocaleDateString()} · ${DB.settings.hostelName} · Confidential</div>`;
  _electronPDF(`<!DOCTYPE html><html><head><title>${type} detail</title>${css}</head><body>${body}</body></html>`,
    (DB.settings.hostelName||'Report').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_'+type+'_'+key+'.pdf', {pageSize:'A4'});
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
    tableHTML = `<h3>Student Directory</h3><table><thead><tr><th>Name</th><th>Room</th><th>Join Date</th><th>Rent</th><th>Status</th><th>Phone</th></tr></thead><tbody>${DB.students.map(t=>{const r=DB.rooms.find(x=>x.id===t.roomId);return `<tr><td>${t.name}</td><td>${r?'#'+r.number:'—'}</td><td>${fmtDate(t.joinDate)}</td><td class="green">${fmtPKR(t.rent)}</td><td>${t.status}</td><td>${t.phone||'—'}</td></tr>`;}).join('')}</tbody></table>`;
  } else if(detailId==='rooms') {
    tableHTML = `<h3>Room Occupancy</h3><table><thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Capacity</th><th>Students</th><th>Status</th></tr></thead><tbody>${DB.rooms.map(r=>{const type=getRoomType(r);const occ=getRoomOccupancy(r);const sts=DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');return `<tr><td class="gold">#${r.number}</td><td>${type.name}</td><td>${r.floor}</td><td>${occ}/${type.capacity}</td><td>${sts.map(t=>t.name).join(', ')||'Empty'}</td><td>${occ>0?'Occupied':'Vacant'}</td></tr>`;}).join('')}</tbody></table>`;
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
      <h3 style="margin-top:18px">🏦 Transfers to Owner</h3>
      <table><thead><tr><th>Date</th><th>Method</th><th>Description</th><th>Received By</th><th>Amount</th></tr></thead><tbody>
      ${allTr.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${t.method||'—'}</td><td>${t.description||'—'}</td><td>${t.receivedBy||'—'}</td><td class="red">${fmtPKR(t.amount)}</td></tr>`).join('')}
      <tr style="background:#f8fafc;font-weight:700"><td colspan="4" style="text-align:right;padding:8px 12px">Total Transferred</td><td class="red">${fmtPKR(trTotal)}</td></tr>
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
      <h3>🏦 All Transfer Records</h3>
      <table><thead><tr><th>Date</th><th>Method</th><th>Description</th><th>Received By</th><th>By Warden</th><th>Amount</th></tr></thead><tbody>
      ${allTr2.length===0?'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:14px">No transfers recorded yet</td></tr>':allTr2.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${t.method||'—'}</td><td>${t.description||'—'}</td><td>${t.receivedBy||'—'}</td><td>${t.byWarden||'—'}</td><td class="red" style="font-weight:900">${fmtPKR(t.amount)}</td></tr>`).join('')}
      <tr style="background:#f8fafc;font-weight:700"><td colspan="5" style="text-align:right;padding:8px 12px">Grand Total</td><td class="red">${fmtPKR(trTotal2)}</td></tr>
      </tbody></table>`;
  }
  _electronPDF(`<!DOCTYPE html><html><head><title>${title} — ${hostel}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;background:#fff;padding:32px;font-size:13px}.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;border-bottom:3px solid #c8a84b;margin-bottom:24px}.title{font-size:22px;font-weight:800}.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center}.kpi label{font-size:10px;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:6px}.kpi .val{font-size:20px;font-weight:900}.summary-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;font-size:15px}h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin:16px 0 10px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f1f5f9;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0}td{padding:8px 12px;border-bottom:1px solid #f1f5f9}.green{color:#16a34a;font-weight:700}.red{color:#dc2626;font-weight:700}.gold{color:#854d0e;font-weight:700}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}@media print{body{padding:16px}}</style></head><body><div class="header"><div><div class="title">${hostel} — ${title}</div><div style="font-size:12px;color:#666;margin-top:3px">${mo} · Generated ${new Date().toLocaleDateString()}</div></div><div style="font-size:11px;color:#94a3b8">PDF Report</div></div><div class="kpi-grid"><div class="kpi"><label>Revenue</label><div class="val green">${fmtPKR(rev)}</div></div><div class="kpi"><label>Expenses</label><div class="val red">${fmtPKR(totalExp)}</div></div><div class="kpi"><label>Available Fund</label><div class="val ${net>=0?'green':'red'}">${fmtPKR(net)}</div></div></div>${tableHTML}<div class="footer">Generated ${new Date().toLocaleDateString()} · ${hostel} · Confidential</div></body></html>`,
    hostel.replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'') + '_' + title.replace(/\s+/g,'-') + '_' + mo + '.pdf',
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
  const occ=DB.rooms.filter(r=>getRoomOccupancy(r)>0).length;
  const _rptHtml = `<!DOCTYPE html><html><head><title>${reportPeriod==='month'?'Monthly':'Annual'} Report — ${DB.settings.hostelName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;padding:32px;font-size:13px}
    .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #c8a84b;margin-bottom:24px}
    .title{font-size:22px;font-weight:800;color:#1a1a2e}
    .subtitle{font-size:12px;color:#666;margin-top:3px}
    .badge{padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#c8a84b22;color:#8b6a00;border:1px solid #c8a84b55}
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
    .gold{color:#854d0e;font-weight:700}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{padding:16px}}
  </style></head><body>
  <div class="header">
    <div><div class="title">${DB.settings.hostelName}</div><div class="subtitle">${reportPeriod==='month'?'Monthly':'Annual'} Report · ${DB.settings.location||''} · Generated ${new Date().toLocaleDateString()}</div></div>
    <div class="badge">${reportPeriod==='month'?'Monthly':'Annual'} Report</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><label>Revenue</label><div class="val green">${fmtPKR(rev)}</div></div>
    <div class="kpi"><label>Expenses</label><div class="val red">${fmtPKR(expTotal)}</div></div>
    <div class="kpi"><label>Available Fund</label><div class="val" style="color:${rev-expTotal>=0?'#16a34a':'#dc2626'}">${fmtPKR(rev-expTotal)}</div></div>
    <div class="kpi"><label>Pending</label><div class="val gold">${fmtPKR(pending)}</div></div>
    <div class="kpi"><label>Rooms Occupied</label><div class="val">${occ}/${DB.rooms.length}</div></div>
    <div class="kpi"><label>Active Students</label><div class="val">${DB.students.filter(t=>t.status==='Active').length}</div></div>
    <div class="kpi"><label>Total Payments</label><div class="val">${pays.filter(p=>p.status==='Paid').length}</div></div>
    <div class="kpi"><label>Transferred to Owner</label><div class="val" style="color:#854d0e">${fmtPKR((DB.transfers||[]).filter(tr=>(tr.date||'').startsWith(mo)).reduce((s,t)=>s+Number(t.amount),0))}</div></div>
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
    <h3>🏦 Transfers to Owner</h3>
    <table><thead><tr><th>Date</th><th>Description</th><th>Method</th><th>Amount</th></tr></thead><tbody>
    ${(DB.transfers||[]).filter(tr=>(tr.date||'').startsWith(mo)).map(tr=>`<tr><td>${fmtDate(tr.date)}</td><td>${escHtml(tr.description||'Transfer')}</td><td>${escHtml(tr.method||'—')}</td><td class="gold">${fmtPKR(tr.amount)}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px">No transfers this period</td></tr>'}
    </tbody></table>
    ${(DB.transfers||[]).length>0?`<div style="text-align:right;padding:8px 12px 0;font-weight:700;color:#854d0e">Total Transferred: ${fmtPKR((DB.transfers||[]).filter(tr=>(tr.date||'').startsWith(mo)).reduce((s,t)=>s+Number(t.amount),0))}</div>`:''}
  </div>
  <div class="footer">Generated ${new Date().toLocaleDateString()} · ${DB.settings.hostelName} Management System · Confidential</div>
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
    filename = 'Pending_Payments.csv';
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
    filename = 'Transfers.csv';
    rows.push(['Date','Description','Method','Amount','Received By','Notes']);
    (DB.transfers||[]).forEach(t=>{
      rows.push([t.date||'—',t.description||'—',t.method||'—',t.amount,t.receivedBy||'—',t.notes||'—']);
    });
  } else if (type === 'students') {
    filename = 'Students_'+(studentReportFilter==='All'?'All':studentReportFilter)+'.csv';
    rows.push(['Name','Father Name','Room','Phone','CNIC','Join Date','Rent','Status']);
    const list = studentReportFilter==='All' ? DB.students : DB.students.filter(t=>t.status===studentReportFilter);
    list.forEach(t=>{
      const r = DB.rooms.find(x=>x.id===t.roomId);
      rows.push([t.name||'—',t.fatherName||'—',r?'#'+r.number:'—',t.phone||'—',t.cnic||'—',t.joinDate||'—',t.rent,t.status||'—']);
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
let calPopoverOpen = false;