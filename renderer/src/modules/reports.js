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
  const csvBtn = (type, color) => `<button onclick="downloadDetailExcel('${type}')" title="Export this report to Excel" style="background:${color};color:#fff;border:none;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">Export Excel</button>`;
  const pdfBtn = `<button onclick="downloadReportDetailPDF('${id}')" title="Export this report as a PDF document" style="background:var(--accent);color:#fff;border:none;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">Export PDF</button>`;

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
      ${_pg.slice.map(t=>{const r=_roomById.get(t.roomId);return `<tr style="cursor:pointer" onclick="showStudentPanel('${t.id}')">
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

  return {
    pays, exps, rev, pending, totalExp, totalTransfers, net: rev - totalExp,
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
  /* BY NAME, THROUGH THE SHARED AUTHORITY. This used to index into a local
     ramp (`_RPT_METHOD_HUES[i % len]`), so Cash was green here and blue on the
     dashboard, and a method added in Settings shifted every colour below it.
     `i` is no longer read; it stays only so the map signature is unchanged. */
  const methods = (DB.settings.paymentMethods||[]).map((m,i) => {
    const amt = pays.filter(p=>p.status==='Paid'&&p.method===m).reduce((s,p)=>s+Number(p.amount),0);
    return { m, amt, color: methodHue(m) };
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
    ${/* COMPACT, THROUGH THE SAME HELPER THE DASHBOARD KPI ROW USES. These
         printed fmtPKR() in full — "PKR 1,842,000" — beside a dashboard that
         says "PKR 1.84M" for the same rupees, and at real hostel scale the
         full figure simply ran out of card. moneyValue(compact) keeps the
         exact number in the title attribute, so nothing is lost: hover, and
         the reconcilable figure is there. */''}
    ${stat('financial','dh-green','Revenue',moneyValue(rev,{compact:true}),
      `${_rptDelta(rev,prev.rev,'pct')} vs ${vs}`,
      '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>')}
    ${stat('pending','dh-amber','Pending',moneyValue(pending,{compact:true}),
      `${_rptDelta(pending,prev.pending,'pct')} vs ${vs}`,
      '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')}
    ${stat('expenses','dh-red','Expenses',moneyValue(totalExp,{compact:true}),
      `${_rptDelta(totalExp,prev.totalExp,'pct')} vs ${vs}`,
      '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>')}
    ${stat('netprofit','dh-violet','Available Fund',
      moneyValue(net,{compact:true,color:net>=0?'var(--green)':'var(--red)'}),
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
/* _RPT_METHOD_HUES IS GONE. Payment-method colour is one question with one
   answer and it lives in utils.js as methodHue(); this file's own ramp was the
   reason the two screens disagreed. _RPT_HUES above stays — that one paints
   EXPENSE CATEGORIES, which the dashboard does not draw, so there is no second
   opinion to reconcile. */
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

function _rptExpenseColumns() {
  return [
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
    total: { label: 'Total — ' + g.cat, value: fmtPKR(g.total) },
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
function _rptPeriodWords() {
  const ks = _rptKeys();
  if (reportPeriod === 'year')   return thisYear();
  if (reportPeriod === 'custom') {
    return ks.length ? monthLabel(ks[0]) + ' to ' + monthLabel(ks[ks.length - 1]) : 'Custom range';
  }
  return monthLabel(ks[0]);
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
    return Object.assign(def, {
      sheet: 'Pending',
      summary: [
        { label: 'Unpaid records', value: String(T.pendingTotals.count), tone: 'neg' },
        { label: 'Total outstanding', value: EXPORT.fmt.money(T.pending), tone: 'neg' },
        { label: 'Part paid', value: EXPORT.fmt.money(T.pendingTotals.collected), tone: 'pos' },
      ],
      columns: _rptPayColumns({ paidLabel: 'Part paid' }).concat([
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

  if (type === 'students') {
    const idx = _buildRoomStudentIndex();
    /* The roster for the PERIOD in this document's own header — anyone living
       here in it, or who paid for it. The PDF used to skip this scoping while
       the CSV applied it, so one report exported twice named two rosters. */
    let roster = studentsByRoom(DB.students.filter(t =>
      keys.some(k => _studentInPeriod(t, k)) ||
      DB.payments.some(p => p.studentId === t.id && keys.some(k => _payMatchesMonth(p, k)))));
    if (studentReportFilter !== 'All') roster = roster.filter(t => t.status === studentReportFilter);

    return Object.assign(def, {
      sheet: 'Students',
      filters: def.filters.concat([
        ['Status', studentReportFilter !== 'All' ? studentReportFilter : null]]),
      summary: [
        { label: 'Students', value: String(roster.length) },
        { label: 'Active',   value: String(roster.filter(t => t.status === 'Active').length), tone: 'pos' },
        { label: 'Charged / month',
          value: EXPORT.fmt.money(roster.reduce((s, t) => s + Number(resolveCharges(t).total || 0), 0)) },
      ],
      columns: [
        { label: 'Room', type: 'id', width: 9,
          value: t => { const r = idx.roomById.get(t.roomId); return r ? String(r.number) : ''; },
          get:   t => { const r = idx.roomById.get(t.roomId);
                        return r ? '<b>#' + escHtml(String(r.number)) + '</b>' : '—'; } },
        { label: 'Student', type: 'text', width: 22, value: t => t.name || '',
          get: t => '<b>' + escHtml(t.name || '—') + '</b>' },
        { label: 'Father / Guardian', type: 'text', width: 22, value: t => t.fatherName || '' },
        { label: 'Phone', type: 'text', width: 16, value: t => String(t.phone || '') },
        { label: 'CNIC',  type: 'text', width: 18, pdf: false, value: t => String(t.cnic || '') },
        { label: 'Joined', type: 'date', width: 13, value: t => t.joinDate || '' },
        /* resolveCharges, not `t.rent`: the whole monthly charge is rent AND
           mess, and every one of these reports quoted the rent half alone. */
        { label: 'Charge / mo', type: 'money', width: 14, total: 'sum',
          value: t => { const c = resolveCharges(t); return c.configured ? c.total : null; } },
        { label: 'Status', type: 'status', width: 12, value: t => t.status || 'Active' },
      ],
      rows: roster,
      empty: 'Nobody was on the roster in this period.',
    });
  }

  if (type === 'rooms') {
    const idx = _buildRoomStudentIndex();
    return Object.assign(def, {
      sheet: 'Rooms',
      summary: [
        { label: 'Rooms', value: String(DB.rooms.length) },
        { label: 'Occupied', value: String(DB.rooms.filter(r => idx.occ(r) > 0).length), tone: 'pos' },
        { label: 'Beds', value: DB.students.filter(isResident).length + ' / ' +
            DB.rooms.reduce((s, r) => s + ((getRoomType(r) || {}).capacity || 0), 0) },
      ],
      columns: [
        { label: 'Room', type: 'id', width: 10, value: r => String(r.number),
          get: r => '<b>#' + escHtml(String(r.number)) + '</b>' },
        { label: 'Floor', type: 'text', width: 12, value: r => r.floor || '' },
        { label: 'Type',  type: 'text', width: 16, value: r => (getRoomType(r) || {}).name || '' },
        { label: 'Capacity', type: 'number', width: 10, pdf: false,
          value: r => (getRoomType(r) || {}).capacity || 0 },
        { label: 'Occupied', type: 'number', width: 10, value: r => getRoomOccupancy(r) },
        { label: 'Available', type: 'number', width: 11, value: r => roomFreeBeds(r) },
        { label: 'Rent / mo', type: 'money', width: 14,
          value: r => Number(r.rent != null && r.rent !== ''
                       ? r.rent : ((getRoomType(r) || {}).defaultRent || 0)) || null },
        { label: 'Status', type: 'status', width: 12,
          value: r => getRoomOccupancy(r) > 0 ? 'Occupied' : 'Vacant' },
        { label: 'Students', type: 'wrap', width: 34,
          value: r => (idx.activeStudentsByRoom.get(r.id) || []).map(t => t.name).join(', ') },
      ],
      rows: roomsByNumber(DB.rooms),
      empty: 'No rooms are recorded.',
    });
  }

  return Object.assign(def, { columns: [], rows: [], empty: 'Nothing to export.' });
}

function downloadReportDetailPDF(detailId) { EXPORT.pdf(_rptDetailDef(detailId)); }
function downloadDetailPDF(type)           { EXPORT.pdf(_rptDetailDef(type)); }
function downloadDetailCSV(type)           { EXPORT.excel(_rptDetailDef(type)); }
function downloadDetailExcel(type)         { EXPORT.excel(_rptDetailDef(type)); }

/* ── THE PERIOD REPORT ───────────────────────────────────────────────────────
   §40: a report is not a list export. It keeps the analytical hierarchy of the
   screen — summary, then financial, then students, then rooms — rather than
   flattening into one long table. The sections are the ones the Reports page
   itself shows, in the order it shows them.                                 */
function _rptOverviewDef() {
  const keys = _rptKeys();
  const T    = _rptTotals(keys);
  const idx  = _buildRoomStudentIndex();
  const occ  = DB.rooms.filter(r => idx.occ(r) > 0).length;
  const paid = T.pays.filter(p => p.status === 'Paid');

  const roster = studentsByRoom(DB.students.filter(t =>
    keys.some(k => _studentInPeriod(t, k)) ||
    DB.payments.some(p => p.studentId === t.id && keys.some(k => _payMatchesMonth(p, k)))));

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
      { label: 'Residents',      value: String(DB.students.filter(isResident).length) },
    ],

    sections: [
      {
        title: 'Payments',
        meta: T.pays.length + ' record' + (T.pays.length === 1 ? '' : 's'),
        columns: _rptPayColumns(),
        rows: T.pays.slice().sort((a, b) => new Date(b.date) - new Date(a.date)),
        grand: { label: 'Collected in this period', value: fmtPKR(T.rev) },
        empty: 'No payment records in this period.',
      },
      {
        title: 'Expenses by category',
        meta: _rptByCategory(T.exps).length + ' categor' +
              (_rptByCategory(T.exps).length === 1 ? 'y' : 'ies'),
        groupLabel: 'Category',
        columns: _rptExpenseColumns(),
        groups: _rptExpenseGroups(T.exps),
        grand: { label: 'Total outgoing', value: fmtPKR(T.totalExp) },
        empty: 'Nothing was spent in this period.',
      },
      {
        title: 'Students',
        meta: roster.length + ' on the roster',
        columns: [
          { label: 'Room', type: 'id', width: 9,
            value: t => { const r = idx.roomById.get(t.roomId); return r ? String(r.number) : ''; },
            get:   t => { const r = idx.roomById.get(t.roomId);
                          return r ? '<b>#' + escHtml(String(r.number)) + '</b>' : '—'; } },
          { label: 'Student', type: 'text', width: 24, value: t => t.name || '' },
          { label: 'Phone',   type: 'text', width: 16, value: t => String(t.phone || '') },
          { label: 'Joined',  type: 'date', width: 13, value: t => t.joinDate || '' },
          { label: 'Charge / mo', type: 'money', width: 14, total: 'sum',
            value: t => { const c = resolveCharges(t); return c.configured ? c.total : null; } },
          { label: 'Status',  type: 'status', width: 12, value: t => t.status || 'Active' },
        ],
        rows: roster,
        empty: 'Nobody was on the roster in this period.',
      },
      {
        title: 'Room occupancy',
        meta: occ + ' of ' + DB.rooms.length + ' rooms occupied',
        columns: [
          { label: 'Room', type: 'id', width: 10, value: r => String(r.number),
            get: r => '<b>#' + escHtml(String(r.number)) + '</b>' },
          { label: 'Floor', type: 'text', width: 12, value: r => r.floor || '' },
          { label: 'Type',  type: 'text', width: 16, value: r => (getRoomType(r) || {}).name || '' },
          { label: 'Occupied', type: 'number', width: 10, value: r => getRoomOccupancy(r) },
          { label: 'Available', type: 'number', width: 11, value: r => roomFreeBeds(r) },
          { label: 'Status', type: 'status', width: 12,
            value: r => getRoomOccupancy(r) > 0 ? 'Occupied' : 'Vacant' },
          { label: 'Students', type: 'wrap', width: 34,
            value: r => (idx.activeStudentsByRoom.get(r.id) || []).map(t => t.name).join(', ') },
        ],
        rows: roomsByNumber(DB.rooms),
        empty: 'No rooms are recorded.',
      },
    ],

    empty: 'No records in this period.',
  };
}

function printReport()       { EXPORT.pdf(_rptOverviewDef()); }
function exportReportExcel() { EXPORT.excel(_rptOverviewDef()); }


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

