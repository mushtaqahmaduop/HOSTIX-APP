/* ─── HOSTIX — PAYMENTS MODULE ─────────────────────────────────────────────
   Contains: renderPayments, generateMonthlyRents, markPaymentPaid,
             deletePayment, filterStudentDropdown, selectStudentForPayment,
             recalcUnpaid, showAddPaymentModal, submitAddPayment,
             showAddPaymentForStudent, showEditPaymentModal, submitEditPayment,
             extra charges helpers, print+submit helpers
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function renderPayments() {
  const mo = thisMonth();
  const moLabel = thisMonthLabel();

  let pays=DB.payments.filter(p=>{
    // Month filter — only show records for the selected calendar month unless showAll
    if(!payFilter.showAll) {
      if(!_payMatchesMonth(p, mo)) return false;
    }
    if(payFilter.status!=='All' && p.status!==payFilter.status) return false;
    if(payFilter.method!=='All' && p.method!==payFilter.method) return false;
    if(payFilter.search){const _ps=payFilter.search.toLowerCase();const _st4p=DB.students.find(s=>s.id===p.studentId);if(![p.studentName,String(p.roomNumber),p.month,p.method,p.status,_st4p?.fatherName,_st4p?.cnic,_st4p?.phone,_st4p?.email].some(f=>f&&String(f).toLowerCase().includes(_ps))) return false;}
    return true;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));

  pays = applySort(pays, payFilter, {
    student: p => p.studentName,
    room:    p => p.roomNumber,
    rent:    p => Number(p.monthlyRent || p.totalRent || p.amount || 0),
    paid:    p => Number(p.amount || 0),
    unpaid:  p => Number(p.unpaid || 0),
    method:  p => p.method,
    status:  p => p.status
  });
  const _pg = paginate(pays, payFilter);

  const pmOpts=DB.settings.paymentMethods.map(m=>`<option value="${m}" ${payFilter.method===m?'selected':''}>${m}</option>`).join('');
  const total=pays.reduce((s,p)=>s+Number(p.amount),0);
  const paidAmt=DB.payments.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount),0);
  const unpaidAmt=DB.payments.filter(p=>p.status==='Pending').reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);

  return `
  <div class="filter-bar">
    <div class="search-wrap">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" /></svg>
      <input class="form-control" id="search-payments" placeholder="Student name, room…" value="${escHtml(payFilter.search)}" oninput="capFirstChar(this);payFilter.search=this.value;payFilter.page=1;_dPayments();toggleClearBtn('search-payments','clear-payments')">
      <button class="search-clear ${payFilter.search?'visible':''}" id="clear-payments" onclick="payFilter.search='';payFilter.page=1;document.getElementById('search-payments').value='';this.classList.remove('visible');renderPage('payments')" title="Clear">✕</button>
    </div>
    <div class="filter-tabs">
      ${['All','Paid','Pending'].map(s=>`<button class="ftab ${payFilter.status===s?'active':''}" onclick="payFilter.status='${s}';payFilter.page=1;renderPage('payments')">${s}</button>`).join('')}
    </div>
    <select class="form-control" style="width:160px" onchange="payFilter.method=this.value;payFilter.page=1;renderPage('payments')">
      <option value="All">All Methods</option>${pmOpts}
    </select>
    <button class="btn btn-sm ${payFilter.showAll?'btn-primary':'btn-secondary'}" style="white-space:nowrap;font-size:11px" onclick="payFilter.showAll=!payFilter.showAll;payFilter.page=1;renderPage('payments')" title="${payFilter.showAll?'Showing all months — click to filter by '+moLabel:'Showing '+moLabel+' only — click to show all'}">
      ${payFilter.showAll ? '📅 All Months' : '📅 '+moLabel}
    </button>
    <div style="margin-left:auto;display:flex;align-items:center;gap:12px">
      <span class="text-muted" style="font-size:12px">${pays.length} records · <span class="text-green fw-700">${fmtPKR(total)}</span></span>
      <button class="btn btn-secondary btn-sm" onclick="exportPaymentsCSV()" title="Export current list to CSV" style="white-space:nowrap">📥 CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="generateMonthlyRents()">⚡ Auto-Generate Month</button>
      <button class="btn btn-sm" onclick="showRentReminderModal()" style="background:var(--green);color:#fff;border:none" title="Send WhatsApp reminders to all with pending rent">&#x1F4F1; WhatsApp Reminders</button>
    </div>
  </div>
  <div class="table-wrap">
    <table style="border-collapse:collapse;width:100%">
      <thead><tr>${sortableTh(payFilter,'payFilter','payments','student','Student','style="padding:8px 8px"')}${sortableTh(payFilter,'payFilter','payments','room','Room','style="padding:8px 8px"')}<th style="padding:8px 8px">Month</th>${sortableTh(payFilter,'payFilter','payments','rent','Rent/Mo','style="padding:8px 8px"')}<th style="padding:8px 6px;min-width:70px">Adm.Fee</th><th style="padding:8px 6px;min-width:90px">Extra Chrgs</th><th style="padding:8px 6px;min-width:80px">Concession</th>${sortableTh(payFilter,'payFilter','payments','paid','Amt Paid','style="padding:8px 8px"')}${sortableTh(payFilter,'payFilter','payments','unpaid','Unpaid','style="padding:8px 8px"')}${sortableTh(payFilter,'payFilter','payments','method','Method','style="padding:8px 8px"')}${sortableTh(payFilter,'payFilter','payments','status','Status','style="padding:8px 8px"')}<th class="col-actions" style="padding:8px 8px;min-width:130px">Actions</th></tr></thead>
      <tbody>
        ${pays.length===0?'<tr><td colspan="12" style="text-align:center;color:var(--text3);padding:30px;border:none">No payment records found</td></tr>':
        _pg.slice.map(p=>{
          const _paf=Number(p.admissionFee||p.fee||0),_pex=(p.extraCharges||[]).filter(c=>Number(c.amount)>0),_pc=Number(p.concession||p.discount||0),_pcd=p.concessionDesc||p.discountDesc||'';
          return '<tr style="cursor:pointer" onclick="showEditPaymentModal(\''+p.id+'\')" title="Click row to edit this payment">'
          +'<td class="fw-700" style="white-space:nowrap;padding:8px 8px"><span style="color:var(--blue)">'+escHtml(p.studentName||'')+'</span></td>'
          +'<td style="white-space:nowrap;padding:8px 8px"><span class="text-gold fw-700">#'+escHtml(String(p.roomNumber||''))+'</span></td>'
          +'<td class="text-muted" style="white-space:nowrap;padding:8px 8px">'+escHtml(p.month||'')+'</td>'
          +'<td class="text-muted fw-700" style="font-size:12px;padding:8px 8px">'+fmtPKR(p.monthlyRent||p.totalRent||p.amount)+'</td>'
          +'<td style="padding:8px 6px;vertical-align:middle">'+(_paf>0?'<span style="font-size:11px;font-weight:700;color:var(--blue)">'+fmtPKR(_paf)+'</span>':'<span style="color:var(--text3);font-size:10px">—</span>')+'</td>'
          +'<td style="padding:8px 6px;vertical-align:middle">'+(_pex.length?_pex.map(c=>'<div style="font-size:10px;font-weight:700;color:var(--amber)">'+(c.label?escHtml(c.label)+': ':'')+fmtPKR(c.amount)+'</div>').join(''):'<span style="color:var(--text3);font-size:10px">—</span>')+'</td>'
          +'<td style="padding:8px 6px;vertical-align:middle">'+(_pc>0?'<span style="font-size:11px;font-weight:700;color:var(--teal)">'+(_pcd?escHtml(_pcd)+': ':'')+'−'+fmtPKR(_pc)+'</span>':'<span style="color:var(--text3);font-size:10px">—</span>')+'</td>'
          +'<td class="text-green fw-700" style="padding:8px 8px">'+fmtPKR(p.amount)+'</td>'
          +'<td style="font-weight:700;color:'+((p.unpaid||0)>0?'var(--red)':'var(--green)')+';padding:8px 8px">'+fmtPKR(p.unpaid||0)+'</td>'
          +'<td style="padding:8px 8px">'+pmBadge(p.method)+'</td>'
          +'<td style="padding:8px 8px">'+statusBadge(p.status)+'</td>'
          +'<td class="col-actions" style="padding:6px 4px;white-space:nowrap"><div style="display:flex;gap:2px;align-items:center;flex-wrap:nowrap">'
          +(p.status!=='Paid'?'<button class="btn btn-success btn-icon btn-sm" onclick="event.stopPropagation();markPaymentPaid(\''+p.id+'\')" title="Mark Paid" style="font-size:11px;padding:3px 6px">✓</button>':'')
          +'<button class="btn btn-secondary btn-icon btn-sm" onclick="event.stopPropagation();printReceipt(\''+p.id+'\')" title="Receipt" style="font-size:11px;padding:3px 6px">🧾</button>'
          +'<button class="btn btn-sm btn-icon" onclick="event.stopPropagation();sendWA(\''+p.id+'\')" title="WhatsApp" style="background:#25d366;color:#fff;border:none;font-size:11px;padding:3px 6px">📱</button>'
          +'<button class="btn btn-danger btn-icon btn-sm" onclick="event.stopPropagation();deletePayment(\''+p.id+'\')" title="Delete" style="font-size:11px;padding:3px 6px">🗑</button>'
          +'</div></td>'
          +'</tr>';}).join('')}
      </tbody>
    </table>
  </div>
  ${renderPager(_pg, 'payFilter', 'payments')}`;
}

// Export the currently filtered + sorted payments to CSV. (Mirrors renderPayments' filter/sort.)
function exportPaymentsCSV() {
  const mo = thisMonth();
  let pays=DB.payments.filter(p=>{
    if(!payFilter.showAll){ if(!_payMatchesMonth(p, mo)) return false; }
    if(payFilter.status!=='All' && p.status!==payFilter.status) return false;
    if(payFilter.method!=='All' && p.method!==payFilter.method) return false;
    if(payFilter.search){const _ps=payFilter.search.toLowerCase();const _st4p=DB.students.find(s=>s.id===p.studentId);if(![p.studentName,String(p.roomNumber),p.month,p.method,p.status,_st4p?.fatherName,_st4p?.cnic,_st4p?.phone,_st4p?.email].some(f=>f&&String(f).toLowerCase().includes(_ps))) return false;}
    return true;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));
  pays = applySort(pays, payFilter, {
    student:p=>p.studentName, room:p=>p.roomNumber,
    rent:p=>Number(p.monthlyRent||p.totalRent||p.amount||0),
    paid:p=>Number(p.amount||0), unpaid:p=>Number(p.unpaid||0),
    method:p=>p.method, status:p=>p.status
  });
  const rows=[['Student','Room','Month','Rent/Mo','Adm.Fee','Extra Charges','Concession','Amount Paid','Unpaid','Method','Status','Date']];
  pays.forEach(p=>{
    const _paf=Number(p.admissionFee||p.fee||0);
    const _pex=(p.extraCharges||[]).filter(c=>Number(c.amount)>0).map(c=>(c.label?c.label+' ':'')+c.amount).join('; ');
    const _pc=Number(p.concession||p.discount||0);
    rows.push([p.studentName||'','#'+(p.roomNumber||''),p.month||'',p.monthlyRent||p.totalRent||p.amount||0,_paf||'',_pex||'',_pc||'',p.amount||0,p.unpaid||0,p.method||'',p.status||'',p.date||'']);
  });
  downloadCSV(rows, 'Payments_'+(payFilter.showAll?'AllMonths':mo)+'.csv');
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
  if (!query.trim()) { results.style.display='none'; return; }
  const q = query.toLowerCase();
  const matches = DB.students.filter(t => {
    if (t.status !== 'Active') return false;
    const room = DB.rooms.find(r => r.id === t.roomId);
    return t.name?.toLowerCase().includes(q) ||
           t.id?.toLowerCase().includes(q) ||
           String(room?.number||'').includes(q) ||
           t.cnic?.includes(q) ||
           t.phone?.includes(q);
  }).slice(0, 10);
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
    return `<div onclick="selectStudentForPayment('${t.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--gold-dim);color:var(--gold2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${t.name[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text);font-size:13px">${escHtml(t.name)}</div>
          <div style="font-size:11px;color:var(--text3)">Room #${room?.number||'?'} · ${rtype?.name||''} · ${escHtml(t.phone||'No phone')}</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--green)">${fmtPKR(t.rent)}</div>
      </div>
    </div>`;
  }).join('');
  results.style.display = 'block';
  // Auto-select if there is exactly one match
  if(matches.length===1 && (query.length>4)) selectStudentForPayment(matches[0].id);
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
    <div><span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Room</span><div style="font-weight:700;color:var(--gold2)">#${room?.number||'?'} · ${rtype?.name||''} · ${room?.floor||''} Floor</div></div>
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

  showModal('modal-md','Add Payment',`
    <div class="form-grid">
      <div class="field col-full"><label>Search Student *</label>
        <div style="position:relative;min-width:0">
          <div style="position:relative">
            <svg style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text3);pointer-events:none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" /></svg>
            <input class="form-control" id="f-pstudent-search" style="padding-left:34px" placeholder="Type name, room# or phone to search…" oninput="filterStudentDropdown(this.value)" autocomplete="off">
          </div>
          <input type="hidden" id="f-pstudent" value="">
          <div id="student-search-results" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius-sm);z-index:300;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4)"></div>
        </div>
        <div id="selected-student-info" style="display:none;margin-top:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px"></div>
      </div>
      <div class="field"><label>Monthly Rent (PKR) *</label><input class="form-control" id="f-pamt" type="number" placeholder="Enter monthly rent" value="" oninput="recalcUnpaid()"></div>
      <div class="field"><label>Amount Paid (PKR)</label><input class="form-control" id="f-ppaid" type="number" placeholder="Enter amount paid" value="" oninput="recalcUnpaid()"></div>
      <div class="field"><label>Admission Fee (PKR)</label><input class="form-control" id="f-padmfee" type="number" placeholder="0" min="0" value="" oninput="recalcUnpaid()"></div>
      <!-- Concession + Extra Charges side by side -->
      <div class="field col-full" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start">
        <!-- LEFT: Concession PKR + Description stacked -->
        <div style="display:flex;flex-direction:column;gap:8px">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">Concession / Discount (PKR)</label>
            <input class="form-control" id="f-pconcession" type="number" placeholder="0" min="0" value="" oninput="recalcUnpaid()">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">Concession Description <span style="font-size:10px;color:var(--text3);font-weight:400">(optional)</span></label>
            <input class="form-control" id="f-pconcession-desc" placeholder="e.g. Scholarship, Hardship, Early payment…">
          </div>
        </div>
        <!-- RIGHT: Extra Charges panel -->
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
          <label style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px">
            <span>➕ Extra Charges / Add-ons</span>
            <button type="button" class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 9px" onclick="addExtraChargeRow()">+ Add</button>
          </label>
          <div id="extra-charges-list"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:6px 8px;background:var(--bg4);border:1px solid var(--border);border-radius:6px;font-size:12px">
            <span style="color:var(--text3)">Total Extra:</span>
            <span id="extra-charges-total" style="font-weight:800;color:var(--amber)">PKR 0</span>
          </div>
        </div>
      </div>
      <div class="field"><label>Unpaid / Remaining (PKR)</label><input class="form-control" id="f-punpaid" type="number" value="0" readonly style="background:var(--bg3);font-weight:700;color:var(--red)" title="Auto-calculated: Rent + Admission Fee + Extra Charges − Concession − Paid"></div>
      <div class="field"><label>Payment Method</label><select class="form-control" id="f-pmethod">${pmOpts}</select></div>
      <div class="field"><label>Month</label><input class="form-control" id="f-pmonth" value="${thisMonthLabel()}"></div>
      <div class="field"><label>Status</label>
        <select class="form-control" id="f-pstat">
          <option value="Paid">✓ Paid</option>
          <option value="Pending" selected>⏳ Unpaid / Pending</option>
        </select>
      </div>
      <div class="field"><label>Payment Date</label><input class="form-control cdp-trigger" id="f-pdate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field"><label>Due Date</label><input class="form-control cdp-trigger" id="f-pdue" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${(()=>{const d=new Date();d.setDate(6);return d.toISOString().split('T')[0];})()}"></div>
      <div class="field col-full"><label>Notes</label><input class="form-control" id="f-pnotes-main" placeholder="Optional notes…"></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-warning" onclick="printAndSubmitAddPayment()" style="background:var(--amber);color:#000;border:none;font-weight:700"><span class="micon" style="font-size:15px;vertical-align:middle">print</span> Print & Add Payment</button><button class="btn btn-primary" onclick="submitAddPayment()"><span class="micon" style="font-size:15px">payments</span> Add Payment</button>`);
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
      <div style="width:38px;height:38px;border-radius:9px;background:var(--gold-dim);color:var(--gold2);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;flex-shrink:0">${(p.studentName||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;color:var(--text)">${escHtml(p.studentName||'—')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">Room <span style="color:var(--gold2);font-weight:700">#${room?.number||'?'}</span>${rtype?` · ${escHtml(rtype.name)}`:''}${t?.phone?` · ${escHtml(t.phone)}`:''}</div>
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
let expFilter = {cat:'All', search:'', showAll: false};