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
  // Names the window the detail is actually built from. There was no 'custom'
  // branch, so a Custom Range detail headed itself with the current YEAR while
  // listing the range's rows.
  const _plKeys = _rptKeys();
  const periodLabel = reportPeriod==='month' ? thisMonth()
    : reportPeriod==='year' ? thisYear()
    : (_plKeys.length ? _rptMonthName(_plKeys[0]) + ' – ' + _rptMonthName(_plKeys[_plKeys.length-1])
                      : 'Custom Range');
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
    const totalPend = pendingPays.reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
    const _pg = paginate(pendingPays, reportDetailFilter);
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">⏳ Pending Payments — ${escHtml(periodLabel)}</div>
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
          <div style="font-size:26px;font-weight:900;color:var(--blue)">${pendingPays.filter(p=>p.unpaid!=null&&Number(p.amount)>0).length}</div>
        </div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Outstanding</th><th>Method</th><th>Date</th><th>Action</th></tr></thead><tbody>
      ${_pg.slice.map(p=>`<tr>
        <td class="fw-700" style="cursor:pointer;color:var(--blue)" onclick="showViewStudentModal('${p.studentId}')">${escHtml(p.studentName||'—')}</td>
        <td class="text-gold fw-700">#${escHtml(p.roomNumber||'—')}</td>
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
      ...pays.filter(p=>p.status==='Paid').map(p=>({date:p.date,label:escHtml(p.studentName||'—'),desc:'Room #'+escHtml(p.roomNumber||'')+' · '+escHtml(p.month||''),amount:Number(p.amount),type:'income'})),
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
    // Scoped to the period the report header names. This table used to read the
    // whole roster, so a student admitted in August was listed inside a July
    // report — the same month-mixing the fee figures had.
    const _keys = _rptKeys();
    const inPeriod = DB.students.filter(t => _keys.some(k => _studentInPeriod(t, k)));
    const badges = [
      {label:'All',       count:inPeriod.length,                              color:'var(--blue)',  dim:'var(--blue-dim)',  border:'rgba(74,156,240,0.4)'},
      {label:'Active',    count:inPeriod.filter(t=>t.status==='Active').length,  color:'var(--green)', dim:'var(--green-dim)', border:'rgba(46,201,138,0.4)'},
      {label:'Left',      count:inPeriod.filter(t=>t.status==='Left').length,    color:'var(--amber)', dim:'var(--amber-dim)', border:'rgba(240,160,48,0.4)'},
      {label:'Blacklisted',count:inPeriod.filter(t=>t.status==='Blacklisted').length,color:'var(--red)',dim:'var(--red-dim)',border:'rgba(224,82,82,0.4)'},
    ];
    const filtered = studentReportFilter==='All' ? inPeriod : inPeriod.filter(t=>t.status===studentReportFilter);
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
        <div class="card-title">📉 Expenses by Category — ${periodLabel}</div>
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
      <div class="card-header"><div class="card-title">💳 Payment Methods — ${periodLabel}</div><div style="display:flex;gap:8px;align-items:center">${csvBtn('payments','var(--accent)')}${pdfBtn}</div></div>
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

  return '';
}


/* ── Reports v5 — period selection ───────────────────────────────────────────
   `reportPeriod` gains a third value, 'custom'. Rather than inventing a second
   date-filtering path, a custom range is expressed as the LIST of YYYY-MM keys
   it spans, and every figure is summed over those keys using the same
   _payMatchesMonth / startsWith matching the month and year views already use.
   That keeps one vetted matcher instead of two that can disagree. */
let reportRange = { from:'', to:'' };

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
function _periodTransfers() {
  const keys = _rptKeys();
  return (DB.transfers || []).filter(t => keys.some(k => String(t.date||'').startsWith(k)));
}

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

function _rptKeys() {
  if (reportPeriod === 'year')   return [thisYear()];
  if (reportPeriod === 'custom') return _rptMonthsBetween(reportRange.from, reportRange.to);
  return [thisMonth()];
}

// The equivalent window immediately before it — what "vs last month" compares to.
function _rptPrevKeys() {
  const shift = (ym, n) => {
    let [y, m] = ym.split('-').map(Number);
    m -= n; while (m < 1) { m += 12; y--; }
    return y + '-' + String(m).padStart(2, '0');
  };
  if (reportPeriod === 'year')  return [String(Number(thisYear()) - 1)];
  if (reportPeriod === 'custom') {
    const ks = _rptKeys(); if (!ks.length) return [];
    return ks.map(k => shift(k, ks.length));
  }
  return [shift(thisMonth(), 1)];
}
function _rptPeriodWord() {
  return reportPeriod === 'year' ? 'last year'
       : reportPeriod === 'custom' ? 'previous range' : 'last month';
}

/* ── EXPORT PERIOD ───────────────────────────────────────────────────────────
   Every PDF and CSV must describe the same window the screen is showing.
   They each opened with `reportPeriod==='month' ? thisMonth() : thisYear()`,
   which has no branch for 'custom' — so exporting a Custom Range report handed
   the owner the WHOLE YEAR under a filename naming the range. These two put the
   exports back on _rptKeys(), the same matcher the page itself uses.          */
function _rptExportLabel() {
  const ks = _rptKeys();
  if (reportPeriod === 'year')   return thisYear();
  if (reportPeriod === 'custom') return ks.length ? ks[0] + '_to_' + ks[ks.length - 1] : 'custom';
  return thisMonth();
}
function _rptExportWord() {
  return reportPeriod === 'month' ? 'Monthly'
       : reportPeriod === 'year'  ? 'Annual' : 'Custom Range';
}

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

/* The same category register as printed HTML, shared by every PDF and the
   Print view so the paper matches the screen section for section. Plain colours
   rather than CSS variables: these documents are rendered outside the app's
   stylesheet and a var() would come out black. */
function _rptCatTablesHTML(rows) {
  const groups = _rptByCategory(rows);
  const grand  = _rptGroupsTotal(groups);
  if (!groups.length)
    return '<table><tbody><tr><td style="text-align:center;color:#aaa;padding:12px">No expenses this period</td></tr></tbody></table>';

  const sections = groups.map(g => `
    <h3 style="margin-top:16px">${g.cat} — ${g.items.length} record${g.items.length===1?'':'s'}</h3>
    <table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>
      ${g.items.map(e=>`<tr>
        <td>${fmtDate(e.date)||'—'}</td>
        <td>${escHtml(e.description||'—')}</td>
        <td class="red" style="text-align:right">${fmtPKR(e.amount)}</td>
      </tr>`).join('')}
      <tr style="background:#f1f5f9;font-weight:800">
        <td colspan="2" style="text-align:right">Total — ${g.cat}</td>
        <td class="red" style="text-align:right">${fmtPKR(g.total)}</td>
      </tr>
    </tbody></table>`).join('');

  return sections + `
    <table style="margin-top:18px"><tbody>
      <tr style="background:#e2e8f0;font-weight:900;font-size:13px">
        <td style="padding:10px 12px">GRAND TOTAL — ${groups.length} categor${groups.length===1?'y':'ies'}</td>
        <td class="red" style="padding:10px 12px;text-align:right">${fmtPKR(grand)}</td>
      </tr>
    </tbody></table>`;
}

// Totals for an arbitrary set of period keys, so current and previous windows
// are measured by exactly the same code.
function _rptTotals(keys) {
  const pays = DB.payments.filter(p => keys.some(k => _payMatchesMonth(p, k)));
  const exps = _rptOutgoings(keys);
  const rev  = keys.reduce((s, k) => s + calcRevenue(k), 0);
  const pending = DB.payments
    .filter(p => p.status === 'Pending' && keys.some(k => _payMatchesMonth(p, k)))
    .reduce((s, p) => s + (p.unpaid != null ? Number(p.unpaid) : Number(p.amount)), 0);
  // A funds transfer IS an expense — calcExpenses() carries both, so totalExp is
  // the whole outgoing and net is simply revenue minus it. totalTransfers stays
  // on the return for the screens that itemise the two halves.
  const totalExp       = keys.reduce((s, k) => s + calcExpenses(k), 0);
  const totalTransfers = keys.reduce((s, k) => s + calcTransfers(k), 0);
  return { pays, exps, rev, pending, totalExp, totalTransfers, net: rev - totalExp };
}

// Students whose join/leave dates fall inside the window — the only honest
// "vs last period" the roster supports, since no historical headcount is kept.
function _rptStudentDelta(keys) {
  const inWin = d => !!d && keys.some(k => String(d).startsWith(k));
  const joined = DB.students.filter(t => inWin(t.joinDate)).length;
  const left   = DB.students.filter(t => inWin(t.leftDate)).length;
  return joined - left;
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
  const periodLabel = reportPeriod === 'month' ? 'This Month'
    : reportPeriod === 'year' ? 'This Year'
    : (reportRange.from && reportRange.to)
      ? _rptMonthName(reportRange.from) + ' – ' + _rptMonthName(reportRange.to)
      : 'Custom Range';

  // "Last updated" means the newest record the report is built from — not the
  // clock. If nothing has been entered, say so rather than showing a date.
  const _latest = [...DB.payments, ...DB.expenses]
    .map(r => r.date).filter(Boolean).sort().pop();
  const withDataNote = _latest
    ? 'Latest record: ' + fmtDate(_latest)
    : 'No records entered yet';

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

  // ── Expense by category ────────────────────────────────────────────────────
  // Categories carry no colour in settings, so one is assigned by the category's
  // fixed position in DB.settings.expenseCategories. Position-keyed rather than
  // render-order-keyed, so a category keeps the same colour when another one
  // drops out of the period.
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
      <span class="rpt-brow__d" style="background:${_RPT_HUES[c.i%_RPT_HUES.length]}"></span>
      <span class="rpt-brow__n" title="${escHtml(c.cat)}">${escHtml(c.cat)}</span>
      <span class="rpt-brow__t"><span class="rpt-brow__f" style="width:${c.pct}%;background:${_RPT_HUES[c.i%_RPT_HUES.length]}"></span></span>
      <span class="rpt-brow__v">${fmtPKR(c.amt)}</span>
      <span class="rpt-brow__p">${c.pct}%</span>
    </div>`).join('');

  // ── Payment methods (donut + legend) ──────────────────────────────────────
  const methods = (DB.settings.paymentMethods||[]).map((m,i) => {
    const amt = pays.filter(p=>p.status==='Paid'&&p.method===m).reduce((s,p)=>s+Number(p.amount),0);
    return { m, amt, color:_RPT_METHOD_HUES[i%_RPT_METHOD_HUES.length] };
  }).filter(x=>x.amt>0).sort((a,b)=>b.amt-a.amt);
  const methodTotal = methods.reduce((s,x)=>s+x.amt,0);
  // Percentages are of the collected total the donut draws, not of `rev` —
  // `rev` also carries partial payments this donut deliberately excludes, so
  // dividing by it made the slices add up to less than 100%.
  const methodLegend = methods.map(x => `
    <div class="rpt-legend__r">
      <span class="rpt-legend__d" style="background:${x.color}"></span>
      <div>
        <div class="rpt-legend__n">${escHtml(x.m)}</div>
        <div class="rpt-legend__v">${fmtPKR(x.amt)} (${methodTotal?Math.round(x.amt/methodTotal*100):0}%)</div>
      </div>
    </div>`).join('');
  _rptDonutData = methods.map(x=>({label:x.m, value:x.amt, color:x.color}));

  // ── Room type table ───────────────────────────────────────────────────────
  const rtRows=DB.settings.roomTypes.map(type=>{
    const tRooms=DB.rooms.filter(r=>r.typeId===type.id);
    const tOcc=tRooms.filter(r=>_roomOcc(r)>0).length;
    const tIds=_activeIdsByType.get(type.id)||new Set();   // O(1) membership instead of per-student rooms.find
    const tRev=pays.filter(p=>p.status==='Paid'&&tIds.has(p.studentId)).reduce((s,p)=>s+Number(p.amount),0);
    const vac=tRooms.length-tOcc;
    return `<tr>
      <td><span class="rpt-tbl__chip" style="background:${type.color}22;color:${type.color}">${escHtml(type.name)}</span></td>
      <td>${tRooms.length}</td>
      <td class="${tOcc?'':'rpt-tbl__z'}">${tOcc}</td>
      <td class="${vac?'':'rpt-tbl__z'}">${vac}</td>
      <td class="${tRev?'':'rpt-tbl__z'}">${fmtPKR(tRev)}</td></tr>`;
  }).join('');

  // ── Revenue vs expenses trend (drawn by drawReportTrend after paint) ──────
  const mCount=reportPeriod==='month'?6:12;
  const trendData=[];
  if (reportPeriod==='custom' && keys.length) {
    keys.forEach(k=>{
      const d=new Date(Number(k.slice(0,4)), Number(k.slice(5,7))-1, 1);
      trendData.push({ key:k, lbl:d.toLocaleString('default',{month:'short'}),
                       rev:calcRevenue(k), exp:calcExpenses(k) });
    });
  } else {
    for(let i=mCount-1;i>=0;i--){
      const _now=new Date(); const d=new Date(_now.getFullYear(),_now.getMonth()-i,1);
      const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      trendData.push({ key:k, lbl:d.toLocaleString('default',{month:'short'}),
                       rev:calcRevenue(k), exp:calcExpenses(k) });
    }
  }
  _rptTrendData = trendData;

  // ── Student summary ───────────────────────────────────────────────────────
  const nActiveS = DB.students.filter(t=>t.status==='Active').length;
  const nLeftS   = DB.students.filter(t=>t.status==='Left').length;
  const nBlackS  = DB.students.filter(t=>t.status==='Blacklisted').length;
  const sDelta   = _rptStudentDelta(keys);

  const stat = (id, hue, label, value, sub, svg, clickable) => `
    <div class="rpt-stat ${hue}${clickable===false?' rpt-stat--flat':''}${reportDetail===id?' is-on':''}"
         ${clickable===false?'':`onclick="reportDetail='${id}';renderPage('reports')"`}
         ${clickable===false?'':`title="Open the ${label.toLowerCase()} detail"`}>
      <div class="rpt-stat__top">
        <div class="rpt-stat__chip"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></div>
        <div class="rpt-stat__label">${label}</div>
      </div>
      <div class="rpt-stat__val">${value}</div>
      <div class="rpt-stat__sub">${sub}</div>
    </div>`;

  const tile = (label, value, sub, hue, det) => `
    <div class="rpt-tile ${hue}" onclick="reportDetail='${det}';renderPage('reports')" title="Open detail">
      <div class="rpt-tile__l">${label}</div>
      <div class="rpt-tile__v">${value}</div>
      <div class="rpt-tile__s">${sub}</div>
    </div>`;

  return `
  <div class="rpt-bar">
    <div class="rpt-seg">
      <button class="${reportPeriod==='month'?'is-on':''}"  onclick="rptSetPeriod('month')">This Month</button>
      <button class="${reportPeriod==='year'?'is-on':''}"   onclick="rptSetPeriod('year')">This Year</button>
      <button class="${reportPeriod==='custom'?'is-on':''}" onclick="rptSetPeriod('custom')">Custom Range</button>
    </div>

    ${reportPeriod==='custom'?`
    <div class="rpt-range" title="Pick the first and last month to include">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
      <input type="month" value="${escHtml(reportRange.from)}" onchange="rptSetRange('from',this.value)" aria-label="From month">
      <span>→</span>
      <input type="month" value="${escHtml(reportRange.to)}"   onchange="rptSetRange('to',this.value)"   aria-label="To month">
    </div>`:''}

    ${reportDetail?`<button class="rpt-card__a" onclick="reportDetail=null;renderPage('reports')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      Back to Reports</button>`:''}

    <div class="rpt-bar__end">
      <button class="rpt-card__a" onclick="printReport()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3h12v6"/><rect width="12" height="8" x="6" y="14"/></svg>
        Print / PDF</button>
      <button class="rpt-card__a" onclick="downloadAllStudentsPDF()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        All Students PDF</button>
    </div>
  </div>

  ${reportPeriod==='custom'&&!keys.length?`
  <div class="rpt-card" style="margin-bottom:14px">
    <div class="rpt-none">Pick a start and end month above to build the report.</div>
  </div>`:''}

  <!-- ══ STAT STRIP — each card opens its own detail view ══ -->
  <div class="rpt-stats">
    ${stat('financial','dh-green','Revenue',fmtPKR(rev),
      `${_rptDelta(rev,prev.rev,'pct')} vs ${vs}`,
      '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>')}
    ${stat('pending','dh-amber','Pending',fmtPKR(pending),
      `${_rptDelta(pending,prev.pending,'pct')} vs ${vs}`,
      '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')}
    ${stat('expenses','dh-red','Expenses',fmtPKR(totalExp),
      `${_rptDelta(totalExp,prev.totalExp,'pct')} vs ${vs}`,
      '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>')}
    ${stat('netprofit','dh-violet','Available Fund',
      `<span style="color:${net>=0?'var(--green)':'var(--red)'}">${fmtPKR(net)}</span>`,
      `${_rptDelta(net,prev.net,'pct')} vs ${vs}`,
      '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>')}
    ${stat('rooms','dh-blue','Occupancy',`${occRate}%`,
      // No historical occupancy is stored, so this reports the standing figure
      // rather than a change against a period the data cannot describe.
      `${occ} of ${DB.rooms.length} room${DB.rooms.length!==1?'s':''} occupied`,
      '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M15 9h.01"/><path d="M15 13h.01"/>')}
    ${stat('students','dh-blue','Students',nActiveS,
      `${_rptDelta(sDelta,0,'abs')} joined vs left`,
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>')}
  </div>

  ${reportDetail ? renderReportDetail(reportDetail, pays, exps, rev, pending, totalExp, net, occ) : `
  <!-- ══ MONTHLY OVERVIEW + PAYMENT METHODS — one row ══ -->
  <div class="rpt-toprow">
  <div class="mov">
    <div class="mov__head">
      <span class="mov__ico">${icon('chart','sm')}</span>
      <div>
        <div class="mov__t">Monthly Overview</div>
        <div class="mov__s">Track collection, expenses and profit month by month</div>
      </div>
      <span class="mov__period">${icon('calendar','xs')} ${escHtml(periodLabel)}</span>
    </div>

    <div class="mov__chart">
      <div class="mov__bar">
        <span class="mov__bart">Revenue Trend</span>
        <div class="mov__legend">
          <span class="mov__k" style="--k:#8b5cf6"><i></i>Collection</span>
          <span class="mov__k" style="--k:#ef4444"><i></i>Expenses</span>
          <span class="mov__k" style="--k:#16a34a"><i></i>Profit</span>
        </div>
      </div>
      ${trendData.some(m=>m.rev||m.exp)
        ? `<div class="rpt-canvas"><canvas id="rpt-trend"></canvas></div>`
        : `<div class="rpt-none">Nothing recorded in this period yet.</div>`}
    </div>

    ${(()=>{
      // Peaks and margin, all derived from the same trendData the chart draws —
      // no separate query, so the strip can never disagree with the line above
      // it. m.exp counts funds transfers, so profit here is the same Available
      // Fund the dashboard and the PDFs quote.
      //
      // Only months that actually recorded something can win a peak. A hostel
      // six weeks old has four empty months in this window, and "Highest
      // Expense: Mar, PKR 0" is not a fact about March — it is the reduce()
      // seed showing through.
      const live = trendData.filter(m => m.rev || m.exp)
                            .map(m => ({...m, profit: m.rev - m.exp}));
      if (!live.length) return '';
      const peak = (k) => live.reduce((b,m) => m[k] > b[k] ? m : b, live[0]);
      const topRev = peak('rev'), topProfit = peak('profit'), topExp = peak('exp');
      const sumRev = live.reduce((s,m)=>s+m.rev,0);
      const sumProfit = live.reduce((s,m)=>s+m.profit,0);
      // Margin is only meaningful once something was actually collected.
      const margin = sumRev > 0 ? (sumProfit / sumRev * 100) : null;
      // …and it is an average across every month with data, NOT the period the
      // page header names. Labelling it "This Month" while summing six of them
      // was the strip's own caption contradicting its figure.
      const span = live.length === 1
        ? _rptMonthName(live[0].key)
        : _rptMonthName(live[0].key) + ' – ' + _rptMonthName(live[live.length-1].key);
      // Each peak names its month in full, so a window that crosses New Year
      // cannot show two different "Jan"s with no way to tell them apart.
      const at = m => _rptMonthName(m.key);
      const cell = (hue,ico,label,sub,val) => `
        <div class="mov__cell ${hue}">
          <span class="mov__cico">${icon(ico,'sm')}</span>
          <div>
            <div class="mov__cl">${label}</div>
            <div class="mov__cs">${escHtml(sub)}</div>
            <div class="mov__cv">${val}</div>
          </div>
        </div>`;
      return `<div class="mov__strip">
        ${cell('dh-violet','trendUp','Highest Collection',at(topRev),fmtPKR(topRev.rev))}
        ${cell('dh-green','chart','Highest Profit',at(topProfit),fmtPKR(topProfit.profit))}
        ${cell('dh-red','arrowDownCircle','Highest Expense',at(topExp),fmtPKR(topExp.exp))}
        ${cell('dh-blue','pieChart','Average Profit Margin',span,
          margin===null ? '<span class="is-na">—</span>' : margin.toFixed(1)+'%')}
      </div>`;
    })()}

    <div class="mov__foot">
      <span>${icon('info','xs')} All amounts are in PKR</span>
      <span>${icon('clock','xs')} ${withDataNote}</span>
    </div>
  </div>

    <div class="rpt-card">
      <div class="rpt-card__h">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
        Payment Methods
      </div>
      ${methods.length?`
      <div class="rpt-donut">
        <div class="rpt-donut__c">
          <canvas id="rpt-methods"></canvas>
          <div class="rpt-donut__mid"><span>Collected</span><b>${fmtPKR(methodTotal)}</b></div>
        </div>
        <div class="rpt-legend">${methodLegend}</div>
      </div>`:`<div class="rpt-none">No payments collected in this period.</div>`}
    </div>
  </div>

  <div class="rpt-grid">
    <div class="rpt-card">
      <div class="rpt-card__h">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/></svg>
        Expense Breakdown
      </div>
      ${cats.length?`
        <div class="rpt-bars">${catBars}</div>
        <div class="rpt-btot"><span>Total Expenses</span><b>${fmtPKR(totalExp)}</b></div>`
      :`<div class="rpt-none">No expenses recorded in this period.</div>`}
    </div>

    <div class="rpt-card">
      <div class="rpt-card__h">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M4 18v2"/><path d="M20 18v2"/></svg>
        Room Type Performance
      </div>
      ${rtRows?`<div class="rpt-tbl-wrap">
        <table class="rpt-tbl">
          <thead><tr><th>Type</th><th>Total</th><th>Occupied</th><th>Vacant</th><th>Revenue</th></tr></thead>
          <tbody>${rtRows}</tbody>
        </table></div>`:`<div class="rpt-none">No room types configured.</div>`}
    </div>
  </div>

  <div class="rpt-card">
    <div class="rpt-card__h">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Student Summary
      <button class="rpt-card__a" onclick="reportDetail='students';renderPage('reports')">
        View All Reports
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>
    </div>
    <div class="rpt-sum">
      ${tile('Active Students', nActiveS, 'On the roster now', 'dh-green', 'students')}
      ${tile('Left',            nLeftS,   'Checked out',       'dh-slate', 'students')}
      ${tile('Blacklisted',     nBlackS,  nBlackS?'Barred from return':'None on record', 'dh-red', 'students')}
      ${tile('Total Registered',DB.students.length, 'All time', 'dh-violet', 'students')}
      ${tile('Total Rooms',     DB.rooms.length,    `${occ} occupied`, 'dh-blue', 'rooms')}
      ${tile('Total Payments',  DB.payments.length, 'All time', 'dh-amber', 'financial')}
    </div>
  </div>
  `}

  `;
}

/* ── Reports v5 — period controls + charts ───────────────────────────────── */
// Chart series colours. Fixed order so a series keeps its colour between
// periods; these identify a series, they are not status signals.
// Expenses are money going out, so a warm ramp led by red reads correctly.
const _RPT_HUES = ['#ef4444','#f97316','#f59e0b','#22c55e','#14b8a6',
                   '#3b82f6','#8b5cf6','#ec4899','#84cc16','#06b6d4'];
// Payment methods are money coming IN — the same ramp painted Cash (first
// method in settings) red, which reads as loss on a collections chart. This
// ramp is led by green and carries no red at all.
const _RPT_METHOD_HUES = ['#16a34a','#3b82f6','#8b5cf6','#f59e0b','#14b8a6',
                          '#0ea5e9','#84cc16','#a855f7','#f97316','#64748b'];
let _rptTrendData = [];
let _rptDonutData = [];
let _rptTrendChart = null;
let _rptDonutChart = null;

function rptSetPeriod(p) {
  reportPeriod = p;
  reportDetail = null;
  if (p === 'custom' && !reportRange.from) {
    // Default to the last six months so the view is never blank on arrival.
    const d = new Date();
    reportRange.to   = thisMonth();
    const s = new Date(d.getFullYear(), d.getMonth() - 5, 1);
    reportRange.from = s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0');
  }
  renderPage('reports');
}
function rptSetRange(which, val) {
  reportRange[which] = val || '';
  // Keep the pair ordered rather than silently returning nothing.
  if (reportRange.from && reportRange.to && reportRange.from > reportRange.to) {
    if (which === 'from') reportRange.to = reportRange.from;
    else                  reportRange.from = reportRange.to;
  }
  renderPage('reports');
}

function _rptCss(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

function drawReportCharts() {
  if (typeof Chart === 'undefined') return;
  const grid = _rptCss('--border', 'rgba(255,255,255,.1)');
  const ink  = _rptCss('--text3', '#909090');

  // ── Revenue vs expenses ───────────────────────────────────────────────────
  if (_rptTrendChart) { _rptTrendChart.destroy(); _rptTrendChart = null; }
  const tc = document.getElementById('rpt-trend');
  if (tc && _rptTrendData.length) {
    const ctx  = tc.getContext('2d');
    const fill = (hex) => {
      const g = ctx.createLinearGradient(0, 0, 0, 250);
      g.addColorStop(0, hex + '38'); g.addColorStop(1, hex + '00');
      return g;
    };
    // `values` is passed explicitly so Profit — which has no key on the row —
    // can be plotted from the same array without inventing a stored field.
    // tension 0 — straight point-to-point segments, per the owner's reference
    // design. Curve smoothing invents intermediate values the ledger never
    // recorded: a bowed line between two months implies a mid-month figure,
    // and it can dip below zero between two positive points.
    const series = (label, values, hex) => ({
      label, data: values,
      borderColor: hex, backgroundColor: fill(hex),
      borderWidth: 2.4, fill: true, tension: 0,
      pointRadius: 3.5, pointBackgroundColor: hex, pointBorderColor: '#fff',
      pointBorderWidth: 1.5, pointHoverRadius: 6
    });
    const revVals = _rptTrendData.map(m => m.rev);
    const expVals = _rptTrendData.map(m => m.exp);
    _rptTrendChart = new Chart(ctx, {
      type: 'line',
      data: { labels: _rptTrendData.map(m => m.lbl),
              datasets: [
                series('Collection', revVals, '#8b5cf6'),
                series('Expenses',   expVals, '#ef4444'),
                // Profit is revenue minus expenses for that month — the figure the
                // owner actually reads the chart for, and previously had to do in
                // their head from two lines.
                series('Profit', revVals.map((v,i) => v - expVals[i]), '#16a34a')
              ] },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          datalabels: { display: false },
          legend: { display: false },   // the legend in the card header carries it
          tooltip: {
            usePointStyle: true, padding: 12, boxPadding: 5, cornerRadius: 10,
            titleFont: { size: 12, weight: '700' }, bodyFont: { size: 12 },
            callbacks: { label: c => '  ' + c.dataset.label + ':  ' + fmtPKR(c.parsed.y) }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: ink, font: { size: 11 } } },
          y: { beginAtZero: true, border: { display: false },
               grid: { color: grid },
               ticks: { color: ink, font: { size: 11 },
                        callback: v => Math.abs(v) >= 1000000 ? (v/1000000) + 'M'
                                     : Math.abs(v) >= 1000 ? (v/1000) + 'K' : v } }
        }
      }
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
          tooltip: { callbacks: { label: c => c.label + ': ' + fmtPKR(c.parsed) } }
        }
      }
    });
    _chartFontFix(_rptDonutChart);
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
  // A legacy transfer is editable from the Expenses table and the Reports
  // category register — refresh whichever page the owner is on.
  renderPage(currentPage);
  toast('Transfer updated','success');
}

async function deleteTransfer(id) {
  showConfirm('Delete transfer record?','This cannot be undone.',(async ()=>{
    DB.transfers = (DB.transfers||[]).filter(x=>x.id!==id);
    // Refresh whichever page the row was deleted from — Expenses and the
    // Reports register both list transfers now.
    await saveDB(); renderPage(currentPage); toast('Transfer deleted','info');
  }));
}



function downloadDetailPDF(type) {
  // Same window and the same arithmetic as the screen — _rptTotals() is what
  // renderReports() itself calls, so a figure cannot differ between the page
  // and the PDF printed from it.
  const keys  = _rptKeys();
  const key   = _rptExportLabel();
  const label = _rptExportWord();
  // Transfers are folded in as ordinary expense rows under their own category,
  // so the itemised table adds up to the total printed above it.
  const { pays, exps, rev, totalExp, totalTransfers, net } = _rptTotals(keys);
  const css = printDocStyles();
  let body = `<div class="hdr"><div><div class="ht">${escHtml(DB.settings.hostelName)}</div><div class="hs">${label} ${type==='financial'?'Revenue':type==='pending'?'Pending Payments':type==='netprofit'?'Available Fund Summary':'Expense'} Report · ${new Date().toLocaleDateString()}</div></div></div>`;
  if(type==='financial'){
    body+=`<div class="kg"><div class="kc"><span class="kl">Revenue</span><div class="kv gr">PKR ${rev.toLocaleString()}</div></div><div class="kc"><span class="kl">Pending</span><div class="kv go">PKR ${pays.filter(p=>p.status==='Pending').reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0).toLocaleString()}</div></div><div class="kc"><span class="kl">Transactions</span><div class="kv">${pays.length}</div></div></div>`;
    body+=`<table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Paid</th><th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>${pays.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${escHtml(p.studentName||'—')}</td><td class="go">#${escHtml(p.roomNumber||'—')}</td><td>${p.month||'—'}</td><td class="${p.status==='Paid'?'gr':''}">PKR ${Number(p.amount).toLocaleString()}</td><td class="${(p.unpaid||0)>0?'re':''}">PKR ${(p.unpaid||0).toLocaleString()}</td><td>${escHtml(p.method||'—')}</td><td class="${payStatusOf(p)==='Paid'?'gr':payStatusOf(p)==='Partial'?'part':'re'}">${payStatusOf(p)}</td><td>${p.date||'—'}</td></tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:#aaa;padding:10px">No records</td></tr>'}</tbody></table>`;
  } else if(type==='pending'){
    // Period-scoped like the table it is printed from. It read the whole
    // payment table, so a monthly PDF carried every unpaid rent ever recorded.
    const pend = pays.filter(p=>p.status==='Pending');
    const totalUnpaid = pend.reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
    body+=`<div class="kg"><div class="kc"><span class="kl">Unpaid Records</span><div class="kv re">${pend.length}</div></div><div class="kc"><span class="kl">Total Outstanding</span><div class="kv re">PKR ${totalUnpaid.toLocaleString()}</div></div><div class="kc"><span class="kl">Partial Paid</span><div class="kv gr">PKR ${pend.reduce((s,p)=>s+Number(p.amount||0),0).toLocaleString()}</div></div></div>`;
    body+=`<table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Still Owed</th><th>Due Date</th></tr></thead><tbody>${pend.sort((a,b)=>new Date(a.dueDate||a.date)-new Date(b.dueDate||b.date)).map(p=>`<tr><td>${escHtml(p.studentName||'—')}</td><td class="go">#${escHtml(p.roomNumber||'—')}</td><td>${p.month||'—'}</td><td class="${Number(p.amount)>0?'gr':''}">PKR ${Number(p.amount||0).toLocaleString()}</td><td class="re">PKR ${(p.unpaid!=null?p.unpaid:p.amount).toLocaleString()}</td><td>${p.dueDate||'—'}</td></tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:10px">No pending payments</td></tr>'}</tbody></table>`;
  } else if(type==='netprofit'){
    body+=`<div class="kg"><div class="kc"><span class="kl">Revenue</span><div class="kv gr">PKR ${rev.toLocaleString()}</div></div><div class="kc"><span class="kl">Expenses</span><div class="kv re">PKR ${totalExp.toLocaleString()}</div></div><div class="kc"><span class="kl">Available Fund</span><div class="kv" style="color:${net>=0?'#16a34a':'#dc2626'}">PKR ${net.toLocaleString()}</div></div></div>`;
    // Category summary, then the full register underneath it so the reader can
    // go from "Staff Salary was the biggest line" to the rows behind it.
    const _g = _rptByCategory(exps);
    body+=`<table><thead><tr><th>Category</th><th>Amount</th><th>% of Expenses</th></tr></thead><tbody>${_g.map(g=>`<tr><td>${g.cat}</td><td class="re">PKR ${g.total.toLocaleString()}</td><td>${totalExp>0?Math.round(g.total/totalExp*100):0}%</td></tr>`).join('')||'<tr><td colspan="3" style="text-align:center;color:#aaa;padding:10px">No expenses</td></tr>'}</tbody></table>`;
    body+=_rptCatTablesHTML(exps);
  } else if(type==='expenses'){
    body+=`<div class="kc" style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:18px"><span class="kl">Total Expenses</span><div class="kv re">PKR ${totalExp.toLocaleString()}</div></div>`;
    body+=_rptCatTablesHTML(exps);
  } else if(type==='students'){
    const _idx=_buildRoomStudentIndex();
    // Scoped to the period named in this PDF's own header. The on-screen table
    // and the CSV already do this; the PDF did not, so the same report exported
    // three ways disagreed about who was on the roster. Matched against every
    // key in the window, not one — `key` is now a filename label and a custom
    // range spans several months.
    const _roster = DB.students.filter(t => keys.some(k => _studentInPeriod(t, k)) ||
      DB.payments.some(p => p.studentId === t.id && keys.some(k => _payMatchesMonth(p, k))));
    body+=`<table><thead><tr><th>ID</th><th>Name</th><th>Room</th><th>Father</th><th>Phone</th><th>Rent/mo</th><th>Join Date</th><th>Status</th></tr></thead><tbody>${_roster.map(t=>{const room=_idx.roomById.get(t.roomId);return `<tr><td style="font-size:10px;color:#aaa">#${t.id}</td><td>${escHtml(t.name)}</td><td class="go">${room?'#'+room.number:'—'}</td><td>${escHtml(t.fatherName||'—')}</td><td>${escHtml(t.phone||'—')}</td><td class="gr">PKR ${Number(t.rent||0).toLocaleString()}</td><td>${t.joinDate||'—'}</td><td class="${t.status==='Active'?'gr':t.status==='Blacklisted'?'re':''}">${t.status}</td></tr>`;}).join('')||'<tr><td colspan="8" style="text-align:center;color:#aaa;padding:10px">No students</td></tr>'}</tbody></table>`;
  } else if(type==='rooms'){
    const _idx=_buildRoomStudentIndex();
    body+=`<table><thead><tr><th>Room</th><th>Floor</th><th>Type</th><th>Capacity</th><th>Occupied</th><th>Rent/mo</th><th>Status</th><th>Students</th></tr></thead><tbody>${DB.rooms.map(r=>{const t=getRoomType(r);const _sts=_idx.activeStudentsByRoom.get(r.id)||[];const oc=_sts.length;const names=_sts.map(s=>s.name);return `<tr><td class="go">#${r.number}</td><td>${escHtml(r.floor)}</td><td>${escHtml(t.name)}</td><td>${t.capacity} beds</td><td class="${oc>0?'gr':''}">${oc}/${t.capacity}</td><td class="gr">PKR ${Number(r.rent||0).toLocaleString()}</td><td class="${oc>0?'gr':'go'}">${oc>0?'Occupied':'Vacant'}</td><td>${names.join(', ')||'—'}</td></tr>`;}).join('')||'<tr><td colspan="8" style="text-align:center;color:#aaa;padding:10px">No rooms</td></tr>'}</tbody></table>`;
  }
  body += `<div class="ft">Generated ${new Date().toLocaleDateString()} · ${escHtml(DB.settings.hostelName)} · Confidential</div>`;
  _electronPDF(`<!DOCTYPE html><html><head><title>${type} detail</title>${css}</head><body>${body}</body></html>`,
    (DB.settings.hostelName||'Report').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_'+type+'_'+key+'.pdf', {pageSize:'A4'});
}

function downloadReportDetailPDF(detailId) {
  // Honours Custom Range like the screen does; `mo` is now only the label the
  // header and filename carry.
  const keys = _rptKeys();
  const mo   = _rptExportLabel();
  // Transfers ride along as expense rows under their own category, so totalExp
  // is the whole outgoing and Available Fund is revenue minus it.
  const { pays, exps, rev, totalExp, totalTransfers, net } = _rptTotals(keys);
  // Escaped ONCE, here, because this value is interpolated into the print
  // document in four places (the <title>, the header, the footer and the
  // filename) and escaping it at each of those is how one gets missed.
  const hostelRaw = DB.settings.hostelName || 'DAMAM Hostel';
  const hostel = escHtml(hostelRaw);
  const titles = {financial:'Financial Summary',pending:'Pending Payments',netprofit:'Available Fund',students:'Student Directory',rooms:'Room Occupancy',expenses:'Expenses by Category',payments:'Payment Transactions'};
  const title = titles[detailId] || 'Report';
  let tableHTML = '';
  if(detailId==='financial'||detailId==='payments') {
    const p2 = detailId==='payments' ? pays.filter(x=>x.status==='Paid') : pays;
    tableHTML = `<h3>Transactions</h3><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Paid</th><th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>${p2.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${escHtml(p.studentName||'—')}</td><td>#${escHtml(p.roomNumber||'—')}</td><td>${p.month||'—'}</td><td class="green">${fmtPKR(p.amount)}</td><td class="${(p.unpaid||0)>0?'red':''}">${fmtPKR(p.unpaid||0)}</td><td>${escHtml(p.method||'—')}</td><td>${p.status}</td><td>${fmtDate(p.date)}</td></tr>`).join('')}</tbody></table>`;
  } else if(detailId==='expenses') {
    tableHTML = `<h3>Expenses by Category</h3>` + _rptCatTablesHTML(exps);
  } else if(detailId==='pending') {
    // Period-scoped like the on-screen table this PDF is printed from.
    const pendPays = pays.filter(p=>p.status==='Pending');
    tableHTML = `<h3>Pending Payments</h3><table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Partial Paid</th><th>Outstanding</th><th>Method</th><th>Date</th></tr></thead><tbody>${pendPays.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${escHtml(p.studentName||'—')}</td><td>#${escHtml(p.roomNumber||'—')}</td><td>${p.month||'—'}</td><td class="${p.unpaid!=null&&Number(p.amount)>0?'green':''}">${p.unpaid!=null?fmtPKR(p.amount):'—'}</td><td class="red">${fmtPKR(p.unpaid!=null?p.unpaid:p.amount)}</td><td>${escHtml(p.method||'—')}</td><td>${fmtDate(p.date)}</td></tr>`).join('')}</tbody></table>`;
  } else if(detailId==='students') {
    const _idx=_buildRoomStudentIndex();
    // Same period scope as the on-screen table this PDF is printed from.
    const _roster = DB.students.filter(t => keys.some(k => _studentInPeriod(t, k)) ||
      DB.payments.some(p => p.studentId === t.id && keys.some(k => _payMatchesMonth(p, k))));
    tableHTML = `<h3>Student Directory</h3><table><thead><tr><th>Name</th><th>Room</th><th>Join Date</th><th>Rent</th><th>Status</th><th>Phone</th></tr></thead><tbody>${_roster.map(t=>{const r=_idx.roomById.get(t.roomId);return `<tr><td>${escHtml(t.name)}</td><td>${r?'#'+r.number:'—'}</td><td>${fmtDate(t.joinDate)}</td><td class="green">${fmtPKR(t.rent)}</td><td>${t.status}</td><td>${escHtml(t.phone||'—')}</td></tr>`;}).join('')}</tbody></table>`;
  } else if(detailId==='rooms') {
    const _idx=_buildRoomStudentIndex();
    tableHTML = `<h3>Room Occupancy</h3><table><thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Capacity</th><th>Students</th><th>Status</th></tr></thead><tbody>${DB.rooms.map(r=>{const type=getRoomType(r);const sts=_idx.activeStudentsByRoom.get(r.id)||[];const occ=sts.length;return `<tr><td class="gold">#${r.number}</td><td>${type.name}</td><td>${escHtml(r.floor)}</td><td>${occ}/${type.capacity}</td><td>${escHtml(sts.map(t=>t.name).join(', ')||'Empty')}</td><td>${occ>0?'Occupied':'Vacant'}</td></tr>`;}).join('')}</tbody></table>`;
  } else if(detailId==='netprofit') {
    // Full breakdown: revenue transactions + the category register.
    // _periodTransfers() rather than a startsWith on `mo`, which is a filename
    // label now and never matches a date under Custom Range.
    const allTr = _periodTransfers();
    const trTotal = allTr.reduce((s,t)=>s+Number(t.amount),0);
    tableHTML = `
      <div class="summary-box" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#16a34a;font-weight:700;margin-bottom:4px">Revenue</div><div style="font-size:22px;font-weight:900;color:#16a34a">${fmtPKR(rev)}</div></div>
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#dc2626;font-weight:700;margin-bottom:4px">Total Outgoing</div><div style="font-size:22px;font-weight:900;color:#dc2626">${fmtPKR(totalExp)}</div><div style="font-size:10px;color:#666">Expenses ${fmtPKR(totalExp - trTotal)}${trTotal>0?' + Transfers '+fmtPKR(trTotal):''}</div></div>
          <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:${net>=0?'#16a34a':'#dc2626'};font-weight:700;margin-bottom:4px">Available Fund</div><div style="font-size:22px;font-weight:900;color:${net>=0?'#16a34a':'#dc2626'}">${fmtPKR(net)}</div></div>
        </div>
      </div>
      <h3>💰 Revenue — Paid Transactions</h3>
      <table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount Paid</th><th>Method</th><th>Date</th></tr></thead><tbody>
      ${pays.filter(p=>p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${escHtml(p.studentName||'—')}</td><td class="gold">#${escHtml(p.roomNumber||'—')}</td><td>${p.month||'—'}</td><td class="green">${fmtPKR(p.amount)}</td><td>${escHtml(p.method||'—')}</td><td>${fmtDate(p.date)}</td></tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#aaa;padding:10px">No paid transactions this period</td></tr>'}
      </tbody></table>
      <h3 style="margin-top:18px">📉 Expenses by Category</h3>
      ${_rptCatTablesHTML(exps)}`;
      // The transfers used to get a table of their own after this one. They are
      // inside the register above under the Fund Transfer category now, so a
      // second table would print the same money twice on one page.
  }
  _electronPDF(`<!DOCTYPE html><html><head><title>${title} — ${hostel}</title>${printDocStyles()}</head><body><div class="header"><div><div class="title">${hostel} — ${title}</div><div style="font-size:12px;color:#666;margin-top:3px">${mo} · Generated ${new Date().toLocaleDateString()}</div></div><div style="font-size:11px;color:#94a3b8">PDF Report</div></div><div class="kpi-grid"><div class="kpi"><label>Revenue</label><div class="val green">${fmtPKR(rev)}</div></div><div class="kpi"><label>Expenses</label><div class="val red">${fmtPKR(totalExp)}</div></div><div class="kpi"><label>Available Fund</label><div class="val ${net>=0?'green':'red'}">${fmtPKR(net)}</div></div></div>${tableHTML}<div class="footer">Generated ${new Date().toLocaleDateString()} · ${hostel} · Confidential</div></body></html>`,
    hostelRaw.replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'') + '_' + title.replace(/\s+/g,'-') + '_' + mo + '.pdf',
    { pageSize: 'A4' });
}

function printReport() {
  // Same window as the screen, Custom Range included.
  const keys=_rptKeys();
  const mo=_rptExportLabel();
  // Transfers are inside expTotal — Available Fund is revenue minus it, with no
  // second deduction.
  const { pays, exps, rev, pending, totalExp:expTotal } = _rptTotals(keys);
  const _occIdx=_buildRoomStudentIndex();
  const occ=DB.rooms.filter(r=>_occIdx.occ(r)>0).length;
  const _rptHtml = `<!DOCTYPE html><html><head><title>${_rptExportWord()} Report — ${escHtml(DB.settings.hostelName)}</title>
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
    .part{color:#b45309;font-weight:700}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{padding:16px}}
  </style></head><body>
  <div class="header">
    <div><div class="title">${escHtml(DB.settings.hostelName)}</div><div class="subtitle">${_rptExportWord()} Report · ${escHtml(DB.settings.location||'')} · Generated ${new Date().toLocaleDateString()}</div></div>
    <div class="badge">${_rptExportWord()} Report</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><label>Revenue</label><div class="val green">${fmtPKR(rev)}</div></div>
    <div class="kpi"><label>Expenses</label><div class="val red">${fmtPKR(expTotal)}</div></div>
    <div class="kpi"><label>Available Fund</label><div class="val" style="color:${rev-expTotal>=0?'#16a34a':'#dc2626'}">${fmtPKR(rev-expTotal)}</div></div>
    <div class="kpi"><label>Pending</label><div class="val gold">${fmtPKR(pending)}</div></div>
    <div class="kpi"><label>Rooms Occupied</label><div class="val">${occ}/${DB.rooms.length}</div></div>
    <div class="kpi"><label>Active Students</label><div class="val">${DB.students.filter(t=>t.status==='Active').length}</div></div>
    <div class="kpi"><label>Total Payments</label><div class="val">${pays.filter(p=>p.status==='Paid').length}</div></div>
  </div>
  <div class="section">
    <h3>💳 Payment Transactions</h3>
    ${''/* Collected AND Still Owed, because a table that prints only what was
         taken cannot be reconciled against the Pending figure in the KPI row
         directly above it -- the owner was reading a payments report with no
         payable in it. */}
    <table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Collected</th><th>Still Owed</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${pays.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(p=>`<tr><td>${escHtml(p.studentName||'—')}</td><td class="gold">#${escHtml(p.roomNumber||'—')}</td><td>${p.month||'—'}</td><td class="${p.status==='Paid'?'green':'red'}">${fmtPKR(p.amount)}</td><td class="${Number(p.unpaid||0)>0?'red':''}">${Number(p.unpaid||0)>0?fmtPKR(p.unpaid):'—'}</td><td>${escHtml(p.method||'—')}</td><td class="${payStatusOf(p)==='Paid'?'green':payStatusOf(p)==='Partial'?'part':'red'}">${payStatusOf(p)}</td><td>${fmtDate(p.date)||'—'}</td></tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:12px">No transactions</td></tr>'}
    </tbody></table>
  </div>
  <div class="section">
    <h3>📉 Expense Breakdown by Category</h3>
    ${_rptCatTablesHTML(exps)}
  </div>
  <div class="footer">Generated ${new Date().toLocaleDateString()} · ${escHtml(DB.settings.hostelName)} Management System · Confidential</div>
  </body></html>`;
  _electronPDF(_rptHtml, (DB.settings.hostelName||'Report').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_Report_'+mo+'.pdf', {pageSize:'A4'});
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL SYSTEM
// ════════════════════════════════════════════════════════════════════════════

function downloadDetailCSV(type) {
  // Same window as the screen and the PDFs, Custom Range included.
  const keys = _rptKeys();
  const key  = _rptExportLabel();
  const _inPeriodPays = DB.payments.filter(p=>keys.some(k=>_payMatchesMonth(p,k)));
  let rows = [], filename = '';
  if (type === 'financial') {
    filename = 'Revenue_'+key+'.csv';
    rows.push(['Student','Room','Month','Amount Paid','Method','Date']);
    _inPeriodPays.filter(p=>p.status==='Paid').forEach(p=>{
      rows.push([p.studentName||'—','#'+(p.roomNumber||'—'),p.month||'—',p.amount,p.method||'—',p.date||'—']);
    });
  } else if (type === 'pending') {
    // Period-scoped, and the period is now in the filename — this exported
    // every unpaid record ever under a name that claimed nothing about when.
    filename = 'Pending_Payments_'+key+'.csv';
    rows.push(['Student','Room','Month','Partial Paid','Outstanding','Method','Date']);
    _inPeriodPays.filter(p=>p.status==='Pending').forEach(p=>{
      rows.push([p.studentName||'—','#'+(p.roomNumber||'—'),p.month||'—',
        p.unpaid!=null?p.amount:0, p.unpaid!=null?p.unpaid:p.amount,
        p.method||'—', p.date||'—']);
    });
  } else if (type === 'expenses') {
    // Grouped by category with a subtotal after each one and a grand total at
    // the end, matching the register on screen. A flat dump of rows made the
    // owner rebuild those subtotals in a spreadsheet by hand.
    // _rptOutgoings carries the transfers too, under the Fund Transfer
    // category, so this file totals the same as the Expenses figure on screen.
    filename = 'Expenses_by_Category_'+key+'.csv';
    rows.push(['Category','Date','Description','Amount']);
    const _groups = _rptByCategory(_rptOutgoings(keys));
    _groups.forEach(g => {
      g.items.forEach(e => rows.push([g.cat, e.date||'—', e.description||'—', e.amount]));
      rows.push(['', '', 'Total — '+g.cat, g.total]);
      rows.push(['', '', '', '']);
    });
    rows.push(['', '', 'GRAND TOTAL', _rptGroupsTotal(_groups)]);
  } else if (type === 'students') {
    filename = 'Students_'+(studentReportFilter==='All'?'All':studentReportFilter)+'.csv';
    rows.push(['Name','Father Name','Room','Phone','CNIC','Join Date','Rent','Status']);
    // Same period scoping as the on-screen table, so the export and the table
    // can never report different rosters for the same period.
    const _sKeys = _rptKeys();
    const _inPeriod = DB.students.filter(t => _sKeys.some(k => _studentInPeriod(t, k)));
    const list = studentReportFilter==='All' ? _inPeriod : _inPeriod.filter(t=>t.status===studentReportFilter);
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
    _inPeriodPays.filter(p=>p.status==='Paid').forEach(p=>{
      rows.push([p.studentName||'—','#'+(p.roomNumber||'—'),p.month||'—',p.amount,p.method||'—',p.status,p.date||'—']);
    });
  } else if (type === 'netprofit') {
    filename = 'AvailableFund_'+key+'.csv';
    rows.push(['Date','Type','Description','Amount']);
    _inPeriodPays.filter(p=>p.status==='Paid').forEach(p=>{
      rows.push([p.date||'—','Income',p.studentName+' · '+p.month,p.amount]);
    });
    _rptOutgoings(keys).forEach(e=>{
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

