/* ─── HOSTIX — EXPENSES MODULE ─────────────────────────────────────────────
   Contains: renderExpenses, showAddExpenseModal, submitAddExpense,
             showEditExpenseModal, submitEditExpense, deleteExpense,
             showClearAllMenu, clearPayments, clearExpenses, clearStudents,
             clearAllData, clearAllDataWithPassword, confirmClearAllWithPassword
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function renderExpenses() {
  const mo = thisMonth();
  const moLabel = thisMonthLabel();

  let exps=DB.expenses.filter(e=>{
    // Month filter
    if(!expFilter.showAll && !(e.date||'').startsWith(mo)) return false;
    if(expFilter.cat!=='All' && e.category!==expFilter.cat) return false;
    if(expFilter.search && !e.description?.toLowerCase().includes(expFilter.search.toLowerCase()) && !e.category?.toLowerCase().includes(expFilter.search.toLowerCase())) return false;
    return true;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));

  const catOpts=DB.settings.expenseCategories.map(c=>`<option value="${c}" ${expFilter.cat===c?'selected':''}>${c}</option>`).join('');
  const total=exps.reduce((s,e)=>s+Number(e.amount),0);

  return `
  <div class="filter-bar">
    <div class="search-wrap">
      <svg class="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input class="form-control" id="search-expenses" placeholder="Search expenses…" value="${escHtml(expFilter.search)}" oninput="capFirstChar(this);expFilter.search=this.value;_dExpenses();toggleClearBtn('search-expenses','clear-expenses')">
      <button class="search-clear ${expFilter.search?'visible':''}" id="clear-expenses" onclick="expFilter.search='';document.getElementById('search-expenses').value='';this.classList.remove('visible');renderPage('expenses')" title="Clear">✕</button>
    </div>
    <select class="form-control" style="width:160px" onchange="expFilter.cat=this.value;renderPage('expenses')">
      <option value="All">All Categories</option>${catOpts}
    </select>
    <button class="btn btn-sm ${expFilter.showAll?'btn-primary':'btn-secondary'}" style="white-space:nowrap;font-size:11px" onclick="expFilter.showAll=!expFilter.showAll;renderPage('expenses')" title="${expFilter.showAll?'Showing all months — click to filter by '+moLabel:'Showing '+moLabel+' only — click to show all'}">
      ${expFilter.showAll ? '📅 All Months' : '📅 '+moLabel}
    </button>
    <span class="text-muted" style="font-size:12px;margin-left:auto">${exps.length} records · <span class="text-red fw-700">${fmtPKR(total)}</span></span>
  </div>
  <div class="table-wrap">
    <table style="border-collapse:collapse;width:100%">
      <thead><tr><th style="padding:8px 10px">Date</th><th style="padding:8px 10px">Category</th><th style="padding:8px 10px">Description</th><th style="padding:8px 10px">Amount</th><th style="padding:8px 10px">Actions</th></tr></thead>
      <tbody>
        ${exps.length===0?`<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:30px">No expenses found</td></tr>`:
        exps.map(e=>`<tr>
          <td class="text-muted" style="font-size:12px;padding:8px 10px">${fmtDate(e.date)}</td>
          <td style="padding:8px 10px"><span class="badge badge-amber">${escHtml(e.category)}</span></td>
          <td style="padding:8px 10px">${escHtml(e.description||'—')}</td>
          <td class="text-red fw-700" style="padding:8px 10px">${fmtPKR(e.amount)}</td>
          <td style="padding:8px 8px">
            <div style="display:flex;gap:4px">
              <button class="btn btn-secondary btn-icon btn-sm" onclick="showEditExpenseModal('${e.id}')">✏️</button>
              <button class="btn btn-danger btn-icon btn-sm" onclick="deleteExpense('${e.id}')">🗑</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
function showAddExpenseModal() {
  const catOpts=DB.settings.expenseCategories.map(c=>`<option>${c}</option>`).join('');
  showModal('modal-md','Add Expense',`
    <div class="form-grid">
      <div class="field"><label>Category *</label><select class="form-control" id="f-ecat">${catOpts}</select></div>
      <div class="field"><label>Amount (PKR) *</label><input class="form-control" id="f-eamt" type="number" placeholder="Enter amount"></div>
      <div class="field col-full"><label>Date</label><input class="form-control cdp-trigger" id="f-edate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field col-full"><label>Description</label><textarea class="form-control" id="f-edesc" placeholder="Expense details…"></textarea></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitAddExpense()">Add Expense</button>`);
}
async function submitAddExpense() {
  const cat=document.getElementById('f-ecat').value;
  const amount=parseFloat(document.getElementById('f-eamt').value);
  if(!cat||!amount){toast('Fill required fields','error');return;}
  DB.expenses.push({id:'e_'+uid(),category:cat,amount,date:document.getElementById('f-edate').value,description:document.getElementById('f-edesc').value.trim()});
  logActivity('Expense Added', cat+' — PKR '+amount, 'Finance');
  await saveDB(); closeModal(); renderPage('expenses'); toast('Expense recorded','success');
}
function showEditExpenseModal(id) {
  const e=DB.expenses.find(x=>x.id===id); if(!e) return;
  const catOpts=DB.settings.expenseCategories.map(c=>`<option ${e.category===c?'selected':''}>${c}</option>`).join('');
  showModal('modal-sm',`Edit Expense`,`
    <div class="form-grid">
      <div class="field"><label>Category</label><select class="form-control" id="f-ecat">${catOpts}</select></div>
      <div class="field"><label>Amount (PKR)</label><input class="form-control" id="f-eamt" type="number" value="${e.amount}"></div>
      <div class="field col-full"><label>Date</label><input class="form-control cdp-trigger" id="f-edate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${e.date||''}"></div>
      <div class="field col-full"><label>Description</label><textarea class="form-control" id="f-edesc">${escHtml(e.description||'')}</textarea></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEditExpense('${id}')">Save</button>`);
}
async function submitEditExpense(id) {
  const e=DB.expenses.find(x=>x.id===id); if(!e) return;
  e.category=document.getElementById('f-ecat').value;
  e.amount=parseFloat(document.getElementById('f-eamt').value)||e.amount;
  e.date=document.getElementById('f-edate').value;
  e.description=document.getElementById('f-edesc').value.trim();
  logActivity('Expense Updated', e.category+' — PKR '+e.amount, 'Finance');
  await saveDB(); closeModal(); renderPage('expenses'); toast('Expense updated','success');
}
async function deleteExpense(id) {
  showConfirm('Delete expense?','This cannot be undone.',(async ()=>{
    const _del_e=DB.expenses.find(x=>x.id===id);
    DB.expenses=DB.expenses.filter(x=>x.id!==id);
    if(_del_e) logActivity('Expense Deleted', _del_e.category+' — PKR '+_del_e.amount, 'Finance');
    await saveDB(); renderPage('expenses'); toast('Expense deleted','info');
  });
}

// ════════════════════════════════════════════════════════════════════════════
// CLEAR DATA FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════
function showClearAllMenu() {
  showModal('modal-md','🗑️ Clear Data',`
    <div style="background:var(--red-dim);border:1px solid rgba(224,82,82,0.35);border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:var(--text2)">
      ⚠️ <strong style="color:var(--red)">Warning:</strong> This action is <strong>permanent and cannot be undone</strong>. Export a backup first!
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="background:linear-gradient(135deg,rgba(224,82,82,0.12),rgba(224,82,82,0.06));border:1px solid rgba(224,82,82,0.4);border-radius:10px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div style="font-weight:800;color:var(--red);font-size:14px">☢️ Clear Everything</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">Removes ALL students, payments, expenses &amp; cancellations</div>
        </div>
        <button class="btn btn-danger btn-sm" style="background:var(--red);color:#fff" onclick="clearAllDataWithPassword()">🔒 CLEAR ALL</button>
      </div>
    </div>
  `,`<button class="btn btn-secondary" onclick="closeModal()">Close</button>`);
}

async function clearPayments(fromMenu=false) {
  const doIt = async ()=>{
    DB.payments=[];
    await saveDB();
    if(fromMenu){closeModal();}
    renderPage(currentPage==='payments'?'payments':currentPage);
    toast('All payment records cleared','info');
  };
  if(fromMenu) {
    showConfirm('Clear All Payments?',`This will permanently delete all ${DB.payments.length} payment records.`,doIt);
  } else {
    showConfirm('Clear All Payments?',`This will permanently delete all ${DB.payments.length} payment records. Cannot be undone!`,doIt);
  }
}

async function clearExpenses(fromMenu=false) {
  const doIt = async ()=>{
    DB.expenses=[];
    await saveDB();
    if(fromMenu){closeModal();}
    renderPage(currentPage==='expenses'?'expenses':currentPage);
    toast('All expense records cleared','info');
  };
  if(fromMenu) {
    showConfirm('Clear All Expenses?',`This will permanently delete all ${DB.expenses.length} expense records.`,doIt);
  } else {
    showConfirm('Clear All Expenses?',`This will permanently delete all ${DB.expenses.length} expense records. Cannot be undone!`,doIt);
  }
}

async function clearStudents(fromMenu=false) {
  const doIt = async ()=>{
    DB.students=[];
    DB.payments=[];
    DB.cancellations=[];
    // FIX: DB.transfers are owner-level financial records, NOT student records.
    // Clearing students must NOT wipe owner transfer history.
    DB.fines=[];
    DB.checkinlog=[];
    await saveDB();
    if(fromMenu){closeModal();}
    renderPage(currentPage==='students'?'students':currentPage);
    toast('All students and their records cleared','info');
  };
  if(fromMenu) {
    showConfirm('Clear All Students?',`This removes ALL ${DB.students.length} students, their payments, fines, check-in log and cancellations permanently. Owner transfers are preserved.`,doIt);
  } else {
    showConfirm('Clear All Students?',`This removes ALL ${DB.students.length} students, their payments, fines, check-in log and cancellations permanently. Owner transfers are preserved. Cannot be undone!`,doIt);
  }
}

async function clearAllData(fromMenu=false) {
  const doIt = async ()=>{
    DB.students=[];
    DB.payments=[];
    DB.expenses=[];
    DB.cancellations=[];
    DB.transfers=[];
    DB.maintenance=[];
    DB.complaints=[];
    DB.activityLog=[];
    DB.fines=[];
    DB.checkinlog=[];
    DB.notices=[];
    DB.inspections=[];
    DB.billSplits=[];
    await saveDB();
    if(fromMenu){closeModal();}
    navigate('dashboard');
    toast('All data cleared successfully','info');
    renderSidebarCalendar();
  };
  showConfirm('☢️ Clear ALL Data?',
    `This will permanently delete ALL students (${DB.students.length}), payments (${DB.payments.length}), expenses (${DB.expenses.length}) and cancellations. This CANNOT be undone! Make sure you have a backup.`,
    doIt
  );
}

// ── PASSWORD-PROTECTED CLEAR ALL (Fix #11) ───────────────────────────────────
function clearAllDataWithPassword() {
  showModal('modal-sm','🔒 Confirm: Clear All Data',`
    <div style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);border-radius:10px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:6px">⚠️ This action cannot be undone!</div>
      <div style="font-size:12px;color:var(--text3)">All students, payments, expenses and cancellations will be permanently deleted. Enter your warden password to proceed.</div>
    </div>
    <div class="field">
      <label>Warden Password</label>
      <input class="form-control" id="clear-all-pwd" type="password" placeholder="Enter your password…" autocomplete="off">
    </div>
    <div id="clear-pwd-err" style="color:var(--red);font-size:12px;margin-top:6px;display:none">❌ Incorrect password. Try again.</div>
  `,`<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="confirmClearAllWithPassword()">Delete Everything</button>`);
  setTimeout(()=>{ const i=document.getElementById('clear-all-pwd'); if(i) i.focus(); },120);
}
function confirmClearAllWithPassword() {
  const pwd = document.getElementById('clear-all-pwd')?.value||'';
  const errEl = document.getElementById('clear-pwd-err');
  const user = CUR_USER || (DB.settings && DB.settings.wardens && DB.settings.wardens[0]);
  const storedPwd = user?.password || user?.pass || '';
  if (!pwd || (storedPwd && pwd !== storedPwd)) {
    if(errEl) errEl.style.display='block';
    const inp = document.getElementById('clear-all-pwd');
    if(inp) { inp.value=''; inp.focus(); }
    return;
  }
  closeModal();
  clearAllData(true);
}
// ─────────────────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
let reportPeriod='month';
let reportDetail=null;
let studentReportFilter='All';

// ════════════════════════════════════════════════════════════════════════════
// REPORT DETAIL RENDERERS
// ════════════════════════════════════════════════════════════════════════════