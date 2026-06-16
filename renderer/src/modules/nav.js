/* ─── HOSTIX — NAVIGATION MODULE ───────────────────────────────────────────
   Loaded by index.html after storage.js
   Contains: goBack, navigate, headerAction, headerAction2, renderPage,
             updateSidebar, searchRenderPage, toggleSidebar, closeSidebar
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ── MOBILE SIDEBAR TOGGLE (FIX #13) ─────────────────────────────────────────
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (!sb) return;
  const isOpen = sb.classList.contains('open');
  sb.classList.toggle('open', !isOpen);
  ov.classList.toggle('active', !isOpen);
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('active');
}

// ── DESKTOP COLLAPSIBLE SIDEBAR — icon-only compact mode ────────────────────
function toggleSidebarCollapse() {
  const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
  const btn = document.getElementById('sidebar-collapse-btn');
  if (btn) btn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
}
// Restore collapsed state immediately so the sidebar never flashes wide-then-narrow
(function applySavedSidebarCollapse() {
  if (localStorage.getItem('sidebar_collapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
  }
})();
// Auto-close sidebar on navigation (mobile UX)
// ─────────────────────────────────────────────────────────────────────────────

let currentPage = 'dashboard';
let pageHistory = ['dashboard'];
function goBack(){if(pageHistory.length>1){pageHistory.pop();navigate(pageHistory[pageHistory.length-1],true);}}
const pageConfig = {
  dashboard:     { title:'Dashboard', sub:'Overview of your hostel', action:'Add Student' },
  rooms:         { title:'Rooms', sub:'Manage all rooms', action:'Add Room' },
  students:      { title:'Students', sub:'Resident management', action:'Add Student' },
  payments:      { title:'Finance', sub:'Rent & payment tracking', action:'Add Payment' },
  expenses:      { title:'Expenses', sub:'Operational cost tracking', action:'Add Expense' },
  cancellations: { title:'Cancellation List', sub:'Seat cancellation requests', action:'Add Cancellation' },
  reports:       { title:'Reports', sub:'Financial analytics', action:null },
  issues:        { title:'Complaints & Maintenance', sub:'Complaints and repair requests', action:'Add Issue' },
  activitylog:   { title:'Activity Log', sub:'Full system audit trail', action:null },
  settings:      { title:'Settings', sub:'Configure your system', action:null },
  archive: { title:'Annual Archive', sub:'Full year data breakdown', action:null },
  maintenance:   { title:'Complaints & Maintenance', sub:'Repair requests', action:'Add Issue' },
  complaints:    { title:'Complaints & Maintenance', sub:'Complaints', action:'Add Issue' }
};

function navigate(page, isBack=false) {
  // Auto-close sidebar on navigation (mobile)
  closeSidebar();
  // Auto-clear all search bars when navigating away from a section
  if (page !== currentPage) {
    studentFilter.search = '';
    payFilter.search     = '';
    payFilter.showAll    = false;
    roomFilter.search    = '';
    expFilter.search     = '';
    expFilter.showAll    = false;
  }
  if(!isBack) {
    pageHistory.push(page);
    // FIX #9: Cap pageHistory to prevent unbounded memory growth across long sessions
    if (pageHistory.length > 50) pageHistory.shift();
  }
  currentPage = page;
  // BUG FIX: Reset reportDetail on every fresh navigation to reports so the
  // overview badges always show first instead of the last opened detail panel.
  if (page === 'reports') reportDetail = null;
  const bb=document.getElementById('hdr-back-btn');
  if(bb) bb.style.display = page!=='dashboard' ? 'flex' : 'none';
  document.querySelectorAll('.nav-item').forEach(el=>{
    el.classList.toggle('active', el.dataset.page===page);
  });
  const cfg = pageConfig[page] || { title: page, sub: '', action: null };
  const _t=document.getElementById('hdr-title'); if(_t) _t.textContent=cfg?.title||'';
  const _s=document.getElementById('hdr-sub'); if(_s) _s.textContent=cfg?.sub||'';
  const actionBtn = document.getElementById('hdr-action');
  if(actionBtn) {
    if(cfg && cfg.action) { actionBtn.style.display='flex'; document.getElementById('hdr-action-text').textContent=cfg.action; }
    else { actionBtn.style.display='none'; }
  }
  // Show "Add Payment" button on Dashboard and Students pages
  const action2Btn = document.getElementById('hdr-action2');
  if(action2Btn) action2Btn.style.display = (page === 'students' || page === 'dashboard') ? 'flex' : 'none';
  renderPage(page, true); // reset scroll on real navigation
}

function headerAction() {
  if(currentPage==='dashboard') showAddStudentModal();
  else if(currentPage==='rooms') showAddRoomModal();
  else if(currentPage==='students') showAddStudentModal();
  else if(currentPage==='payments') showAddPaymentModal();
  else if(currentPage==='expenses') showAddExpenseModal();
  else if(currentPage==='cancellations') showAddCancellationModal();
  else if(currentPage==='issues') showAddIssueModal();
}
function headerAction2() {
  // "Add Payment" button shown on Dashboard and Students page
  if(currentPage==='students' || currentPage==='dashboard') showAddPaymentModal();
}

// debounce() — defined in src/utils.js

// Smart re-render for search bars - preserves cursor focus
function searchRenderPage(page, inputId, caretPos) {
  const el = document.getElementById('content');
  const focusId = inputId;
  const val = document.getElementById(focusId)?.value || '';
  
  if(page==='rooms') el.innerHTML = renderRooms();
  else if(page==='students') el.innerHTML = renderStudents();
  else if(page==='payments') el.innerHTML = renderPayments();
  else if(page==='expenses') el.innerHTML = renderExpenses();
  
  // Restore focus + caret position
  requestAnimationFrame(()=>{
    const inp = document.getElementById(focusId);
    if(inp){ inp.focus(); try{ inp.setSelectionRange(val.length, val.length); }catch(e){} }
  });
}

// Debounced search handlers (one per page)
const _dRooms    = debounce(()=>searchRenderPage('rooms','search-rooms'));
const _dStudents = debounce(()=>searchRenderPage('students','search-students'));
const _dPayments = debounce(()=>searchRenderPage('payments','search-payments'));
const _dExpenses = debounce(()=>searchRenderPage('expenses','search-expenses'));

function renderPage(p, resetScroll=false) {
  const el = document.getElementById('content');
  // Save scroll position before re-render so it can be restored
  const savedScroll = el.scrollTop || document.getElementById('main')?.scrollTop || 0;
  el.style.transition='opacity 0.2s ease';
  el.style.opacity='0';
  // Handle cancellations sub-filter pages
  let cancFilter = 'All';
  let basePage = p;
  if(p.startsWith('cancellations_')) {
    cancFilter = p.replace('cancellations_','');
    basePage = 'cancellations';
    currentPage = 'cancellations';
    document.querySelectorAll('.nav-item').forEach(el=>{ el.classList.toggle('active', el.dataset.page==='cancellations'); });
    const cfg=pageConfig['cancellations'];
    const _t=document.getElementById('hdr-title'); if(_t) _t.textContent=cfg?.title||'';
    const _s=document.getElementById('hdr-sub'); if(_s) _s.textContent=cfg?.sub||'';
    const actionBtn=document.getElementById('hdr-action');
    if(cfg&&cfg.action){actionBtn.style.display='flex';document.getElementById('hdr-action-text').textContent=cfg.action;}
    else{actionBtn.style.display='none';}
    const action2Btn=document.getElementById('hdr-action2');
    if(action2Btn) action2Btn.style.display='none';
  }
  setTimeout(()=>{
    try {
      if(basePage==='dashboard') el.innerHTML = renderDashboard();
      else if(basePage==='rooms') el.innerHTML = renderRooms();
      else if(basePage==='students') el.innerHTML = renderStudents();
      else if(basePage==='payments') el.innerHTML = renderPayments();
      else if(basePage==='expenses') el.innerHTML = renderExpenses();
      else if(basePage==='cancellations') el.innerHTML = renderCancellations(cancFilter);
      else if(basePage==='reports') el.innerHTML = renderReports();
      else if(basePage==='maintenance') { issuesTab='maintenance'; el.innerHTML = renderIssues(); }
      else if(basePage==='complaints') { issuesTab='complaints'; el.innerHTML = renderIssues(); }
      else if(basePage==='issues') el.innerHTML = renderIssues();
      else if(basePage==='activitylog') el.innerHTML = renderActivityLog();
      else if(basePage==='settings') el.innerHTML = renderSettings();
      else if(basePage==='archive') el.innerHTML = renderArchive();
    } catch(e) {
      el.innerHTML = '<div style="padding:40px;color:#e05252;font-family:monospace;background:#1a0a0a;border-radius:12px;margin:20px"><div style="font-size:18px;font-weight:900;margin-bottom:12px">⚠️ Render Error on: '+basePage+'</div><div style="font-size:13px;line-height:1.7;white-space:pre-wrap">'+e.message+'</div><div style="margin-top:12px;font-size:11px;opacity:0.6">'+e.stack+'</div></div>';
      console.error('renderPage error:', e);
    }
    el.style.opacity='1';
    // Only reset scroll when explicitly navigating to a new page; preserve on data saves/edits
    if (resetScroll) {
      el.scrollTop = 0;
      const main = document.getElementById('main'); if(main) main.scrollTop = 0;
      window.scrollTo(0, 0);
    } else {
      el.scrollTop = savedScroll;
      const main = document.getElementById('main'); if(main) main.scrollTop = savedScroll;
    }
    if(basePage==='reports') drawCharts();
    if(basePage==='settings') bindSettingsEvents();
    if(basePage==='dashboard') setTimeout(drawTrendChart, 50);
  },80);
}

function updateSidebar() {
  const setEl = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  setEl('sb-hostel-name', DB.settings.hostelName);
  // Apply saved font
  const nameEl2 = document.getElementById('sb-hostel-name');
  if(nameEl2 && DB.settings.hostelNameFont) nameEl2.style.fontFamily = `'${DB.settings.hostelNameFont}', serif`;
  // BUG FIX: sync tagline to sidebar sub-label
  setEl('sb-location-sub', DB.settings.tagline || 'Boys Residence');
  setEl('sb-location', DB.settings.location);
  // Show appName (HOSTIX / custom) as the system brand label
  setEl('sb-version', (DB.settings.appName || 'HOSTIX') + ' · ' + DB.settings.version);
  // Update cancellation badge
  const cancelBadge = document.getElementById('cancel-badge');
  const pendingCancels = (DB.cancellations||[]).filter(c=>c.status==='Pending').length;
  if(cancelBadge) { cancelBadge.textContent = pendingCancels; cancelBadge.style.display = pendingCancels>0?'flex':'none'; }
  const issuesBadge = document.getElementById('issues-badge');
  const openIssues = (DB.maintenance||[]).filter(m=>m.status==='Open').length + (DB.complaints||[]).filter(c=>c.status==='Open').length;
  if(issuesBadge) { issuesBadge.textContent = openIssues; issuesBadge.style.display = openIssues>0?'flex':'none'; }

}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
