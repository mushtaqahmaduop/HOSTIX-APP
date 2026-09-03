/* ─── HOSTYLLO — NAVIGATION MODULE ───────────────────────────────────────────
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

// Collapse the sidebar to icons only. The `body.sidebar-collapsed` styling has
// existed in style.css since the rail was designed, but the handler the button
// calls was never written — clicking it threw a ReferenceError and nothing
// happened. Preference is remembered across sessions.
function toggleSidebarCollapse() {
  const on = !document.body.classList.contains('sidebar-collapsed');
  document.body.classList.toggle('sidebar-collapsed', on);
  try { localStorage.setItem('hostix_sidebar_collapsed', on ? '1' : '0'); } catch (e) {}
  const btn = document.getElementById('sidebar-collapse-btn');
  if (btn) {
    btn.title = on ? 'Expand sidebar' : 'Collapse sidebar';
    btn.style.transform = on ? 'rotate(180deg)' : '';
  }
}
// Restore the saved state before first paint of the shell.
try {
  if (localStorage.getItem('hostix_sidebar_collapsed') === '1') {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.classList.add('sidebar-collapsed');
      const btn = document.getElementById('sidebar-collapse-btn');
      if (btn) { btn.title = 'Expand sidebar'; btn.style.transform = 'rotate(180deg)'; }
    });
  }
} catch (e) {}
// Auto-close sidebar on navigation (mobile UX)
// ─────────────────────────────────────────────────────────────────────────────

let currentPage = 'dashboard';
let pageHistory = ['dashboard'];
function goBack(){if(pageHistory.length>1){pageHistory.pop();navigate(pageHistory[pageHistory.length-1],true);}}
const pageConfig = {
  dashboard:     { title:'Dashboard', sub:'', action:'Add Student' },
  rooms:         { title:'Rooms', sub:'', action:'Add Room' },
  students:      { title:'Students', sub:'', action:'Add Student' },
  payments:      { title:'Finance', sub:'', action:'Add Payment' },
  expenses:      { title:'Expenses', sub:'', action:'Add Expense' },
  cancellations: { title:'Cancellations', sub:'', action:'Add Cancellation' },
  reports:       { title:'Reports', sub:'', action:null },
  issues:        { title:'Complaints', sub:'', action:'Add Issue' },
  activitylog:   { title:'Activity Log', sub:'', action:null },
  settings:      { title:'Settings', sub:'', action:null },
  archive:       { title:'Annual Archive', sub:'', action:null },
  maintenance:   { title:'Complaints', sub:'', action:'Add Issue' },
  complaints:    { title:'Complaints', sub:'', action:'Add Issue' },
  // v5: the add/edit student form is a page, not a modal. `nav` keeps the
  // Students rail item lit while it is open, and `back` shows the header's
  // Back button — the form is a detour, not a destination.
  // Chrome shows the section; the page itself carries the "Student intake"
  // heading and breadcrumb, so naming the task here too just reads as a
  // stutter — the same call Add Payment made below.
  addstudent:    { title:'Students', sub:'', action:null, nav:'students', back:true },
  // Add/Edit Payment is a page too, for the same reason: it carries a live
  // summary and the student's recent history alongside the form, which a modal
  // has no room for.
  // Chrome shows the section; the page itself carries the "Add New Payment"
  // heading and breadcrumb, so repeating it in the header just reads as a stutter.
  // `chrome:'task'` retires the global header here entirely — see renderPage().
  addpayment:    { title:'Finance', sub:'', action:null, nav:'payments', back:true,
                   chrome:'task' }
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
    // Payments v5 filters + row selection. Clearing the selection matters:
    // a selection left over from a previous visit would sit invisibly behind
    // the bulk "Mark N paid" action on the next one.
    payFilter.room       = 'All';
    payFilter.month      = 'All';
    payFilter.status     = 'All';
    payFilter.unpaidOnly = false;
    payFilter.page       = 1;
    if (typeof paySelected !== 'undefined' && paySelected) paySelected.clear();
    // Students v5 — same reasoning as paySelected above.
    studentFilter.room   = 'All';
    studentFilter.course = 'All';
    studentFilter.status = 'All';
    studentFilter.page   = 1;
    if (typeof stuSelected !== 'undefined' && stuSelected) stuSelected.clear();
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
  const cfg = pageConfig[page] || { title: page, sub: '', action: null };
  // The header Back button was removed; sub-pages carry their own exit.
  // goBack()/pageHistory stay — the command palette and in-page controls use them.
  // A detour page (the add-student form) keeps its parent's rail item lit,
  // otherwise nothing in the sidebar is highlighted while the form is open.
  const navKey = cfg.nav || page;
  document.querySelectorAll('.nav-item').forEach(el=>{
    el.classList.toggle('active', el.dataset.page===navKey);
  });
  const _t=document.getElementById('hdr-title'); if(_t) _t.textContent=cfg?.title||'';
  const _s=document.getElementById('hdr-sub');
  if(_s) { _s.textContent=cfg?.sub||''; _s.style.display = cfg?.sub ? 'block' : 'none'; }
  /* The header's two green/blue buttons are Add <something> and Add Payment,
     and both now lead to a gate. A button that always refuses is worse than no
     button: the warden does not learn they lack the permission, they learn the
     app is broken. _mayAdd/_mayCollect keep the chrome honest; the gates at the
     entry points are still the boundary, because the command palette and a
     direct navigate() reach those functions without passing through here. */
  const _mayAdd     = typeof canDo !== 'function' || canDo('edit');
  const _mayCollect = typeof canDo !== 'function' || canDo('payments');
  const actionBtn = document.getElementById('hdr-action');
  if(actionBtn) {
    if(cfg && cfg.action && _mayAdd) { actionBtn.style.display='flex'; document.getElementById('hdr-action-text').textContent=cfg.action; }
    else { actionBtn.style.display='none'; }
  }
  // Show "Add Payment" button on Dashboard and Students pages
  const action2Btn = document.getElementById('hdr-action2');
  if(action2Btn) action2Btn.style.display =
    ((page === 'students' || page === 'dashboard') && _mayCollect) ? 'flex' : 'none';
  renderPage(page, true); // reset scroll on real navigation
}

function headerAction() {
  if(currentPage==='dashboard') showAddStudentModal();
  else if(currentPage==='rooms') showAddRoomModal();
  else if(currentPage==='students') showAddStudentModal();
  else if(currentPage==='payments') openAddPayment();
  else if(currentPage==='expenses') showAddExpenseModal();
  else if(currentPage==='cancellations') showAddCancellationModal();
  else if(currentPage==='issues') showAddIssueModal();
}
function headerAction2() {
  // "Add Payment" button shown on Dashboard and Students page
  if(currentPage==='students' || currentPage==='dashboard') openAddPayment();
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

  /* ── CONTEXTUAL HEADER ────────────────────────────────────────────────────
     A page declaring `chrome:'task'` is a TASK, not a destination: it is
     reached from somewhere, it is finished or abandoned, and it goes back. The
     global header's search box, date stepper, notification bell and Add
     buttons are all destination controls — every one of them navigates AWAY
     from a half-filled form — so a task page trades that 48px bar for its own
     compact header carrying only what the task needs: where you are, what
     record this is, and the way out. On a 1366x768 laptop that bar plus the
     page's own title block cost ~110px before a single field was drawn.

     THIS BELONGS IN renderPage(), NOT navigate(). Roughly fifteen call sites
     re-render a page directly — every filter dropdown on the payments list,
     and critically submitAddPayment(), which ends `renderPage('payments')`
     after posting. Toggling in navigate() alone meant posting a payment left
     `chrome-task` set, and the payments list then drew with its global header
     display:none and its padding zeroed. Here the class is decided by the page
     being rendered, so it cannot outlive the page that asked for it. */
  document.body.classList.toggle(
    'chrome-task', (pageConfig[p] || {}).chrome === 'task');

  if(p.startsWith('cancellations_')) {
    cancFilter = p.replace('cancellations_','');
    basePage = 'cancellations';
    currentPage = 'cancellations';
    document.querySelectorAll('.nav-item').forEach(el=>{ el.classList.toggle('active', el.dataset.page==='cancellations'); });
    const cfg=pageConfig['cancellations'];
    const _t=document.getElementById('hdr-title'); if(_t) _t.textContent=cfg?.title||'';
    const _s=document.getElementById('hdr-sub'); if(_s) _s.textContent=cfg?.sub||'';
    const actionBtn=document.getElementById('hdr-action');
    const _mayAdd2 = typeof canDo !== 'function' || canDo('edit');
    if(cfg&&cfg.action&&_mayAdd2){actionBtn.style.display='flex';document.getElementById('hdr-action-text').textContent=cfg.action;}
    else{actionBtn.style.display='none';}
    const action2Btn=document.getElementById('hdr-action2');
    if(action2Btn) action2Btn.style.display='none';
  }
  setTimeout(()=>{
    try {
      // Page-level permission gate. Hiding the sidebar item is not enough on
      // its own — the command palette and direct navigate() calls reach a page
      // without ever touching the rail.
      // Feature gate first: what the HOSTEL has bought, from the signed
      // entitlement. Hiding the rail item is not enough on its own — the
      // command palette and direct navigate() calls reach a page without ever
      // touching the rail, which is the same reason the permission check below
      // exists. Fails open: no entitlement means every feature is available.
      const _feature = (typeof featureForPage === 'function') ? featureForPage(basePage) : null;
      if (_feature && typeof hasFeature === 'function' && !hasFeature(_feature)) {
        const _label = (typeof FEATURE_LABELS !== 'undefined' && FEATURE_LABELS[_feature])
          || _feature;
        el.innerHTML = '<div style="padding:48px 24px;text-align:center;color:var(--text3)">'
          + '<div style="font-size:15px;font-weight:700;color:var(--text2);margin-bottom:6px">Not included</div>'
          + '<div style="font-size:13px">' + escHtml(_label) + ' is not part of this hostel' + String.fromCharCode(8217) + 's plan.<br>Contact support to add it.</div>'
          + '</div>';
        return;
      }

      const _needs = { settings:'settings', reports:'reports', archive:'reports' }[basePage];
      if (_needs && typeof canDo === 'function' && !canDo(_needs)) {
        el.innerHTML = '<div style="padding:48px 24px;text-align:center;color:var(--text3)">'
          + '<div style="font-size:15px;font-weight:700;color:var(--text2);margin-bottom:6px">Not permitted</div>'
          + '<div style="font-size:13px">Your account does not have access to this page.<br>Ask an administrator to grant it.</div>'
          + '</div>';
        return;
      }
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
      else if(basePage==='addstudent') el.innerHTML = renderAddStudent();
      else if(basePage==='addpayment') el.innerHTML = renderAddPayment();
      else if(basePage==='activitylog') el.innerHTML = renderActivityLog();
      else if(basePage==='settings') el.innerHTML = renderSettings();
      else if(basePage==='archive') el.innerHTML = renderArchive();
    } catch(e) {
      el.innerHTML = '<div style="padding:40px;color:#e05252;font-family:monospace;background:#1a0a0a;border-radius:12px;margin:20px"><div style="font-size:18px;font-weight:900;margin-bottom:12px">'+icon('warning','sm')+' Render Error on: '+basePage+'</div><div style="font-size:13px;line-height:1.7;white-space:pre-wrap">'+e.message+'</div><div style="margin-top:12px;font-size:11px;opacity:0.6">'+e.stack+'</div></div>';
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
    // Same deferred pattern as the dashboard: the canvases must exist and be
    // laid out before Chart.js measures them.
    if(basePage==='reports') setTimeout(function(){ drawReportCharts(); }, 50);
    if(basePage==='settings') bindSettingsEvents();
    if(basePage==='addstudent') asfInit();
    if(basePage==='dashboard') setTimeout(function(){ drawTrendChart(); drawRoomDonut(); }, 50);
  },80);
}

function updateSidebar() {
  const setEl = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  setEl('sb-hostel-name', DB.settings.hostelName || 'Hostel Management');
  setEl('sb-version', 'v' + (DB.settings.version || '4.0'));
  // Update cancellation badge
  const cancelBadge = document.getElementById('cancel-badge');
  const pendingCancels = (DB.cancellations||[]).filter(c=>c.status==='Pending').length;
  if(cancelBadge) { cancelBadge.textContent = pendingCancels; cancelBadge.style.display = pendingCancels>0?'flex':'none'; }
  const issuesBadge = document.getElementById('issues-badge');
  const openIssues = (DB.maintenance||[]).filter(m=>m.status==='Open').length + (DB.complaints||[]).filter(c=>c.status==='Open').length;
  if(issuesBadge) { issuesBadge.textContent = openIssues; issuesBadge.style.display = openIssues>0?'flex':'none'; }

  refreshChromeUser();
  refreshNotifBell();
}

/* ══════════════════════════════════════════════════════════════════════════
   APP CHROME v5 — user chip / menu / notification bell
   Markup lives in index.html, styling in chrome.css.
   ══════════════════════════════════════════════════════════════════════════ */

// Initials for the avatar chips — first letters of the first two words.
function _chromeInitials(name) {
  const s = String(name || '').trim();
  if (!s) return '—';
  return s.split(/\s+/).slice(0,2).map(w => w[0] || '').join('').toUpperCase();
}

// Mirrors the logged-in warden into both the header chip and the sidebar card.
function refreshChromeUser() {
  const u    = (typeof CUR_USER !== 'undefined' && CUR_USER) ? CUR_USER : null;
  const name = (u && u.name) || 'Warden';
  const role = (u && (u.role || u.title)) || 'Admin';
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  // The header chip is gone; the sidebar card below is the only account UI.
  set('user-menu-name',name);
  set('user-menu-role',role);
  set('sb-user-av',    _chromeInitials(name));
  set('sb-user-name',  name);
  set('sb-user-role',  role);
}

// The notification list. Every entry is derived from real DB state — the bell
// shows nothing when there is nothing genuinely outstanding. This is the same
// set the dashboard computed but never rendered.
function chromeAlerts() {
  if (typeof DB === 'undefined' || !DB || !DB.payments) return [];
  const out = [];
  const pending = DB.payments.filter(p => p.status === 'Pending');
  const openMaint = (DB.maintenance || []).filter(m => m.status === 'Open').length;
  const openComp  = (DB.complaints  || []).filter(c => c.status === 'Open').length;
  const pendCancel= (DB.cancellations || []).filter(c => c.status === 'Pending').length;

  if (pending.length) {
    const amt = pending.reduce((s,p) => s + (p.unpaid != null ? Number(p.unpaid) : Number(p.amount||0)), 0);
    out.push({ hue:'dh-amber', go:"navigate('payments')",
      msg: pending.length + ' pending payment' + (pending.length>1?'s':'') + ' — ' + fmtPKR(amt) + ' uncollected',
      icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>' });
  }
  if (openMaint) {
    out.push({ hue:'dh-blue', go:"navigate('maintenance')",
      msg: openMaint + ' open maintenance request' + (openMaint>1?'s':''),
      icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>' });
  }
  if (openComp) {
    out.push({ hue:'dh-red', go:"navigate('complaints')",
      msg: openComp + ' unresolved complaint' + (openComp>1?'s':''),
      icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>' });
  }
  if (pendCancel) {
    out.push({ hue:'dh-violet', go:"navigate('cancellations')",
      msg: pendCancel + ' pending cancellation' + (pendCancel>1?'s':''),
      icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>' });
  }
  // Occupancy is only meaningful once beds exist, otherwise every empty
  // install would nag about "0% occupancy" on first run.
  const beds = (DB.rooms||[]).reduce((s,r) => { const t = getRoomType(r); return s + (t ? t.capacity : 0); }, 0);
  const occupied = (DB.students||[]).filter(s => s.status === 'Active').length;
  if (beds > 0) {
    const rate = Math.round(occupied / beds * 100);
    if (rate < 60) out.push({ hue:'dh-amber', go:"navigate('rooms')",
      msg: 'Low occupancy: ' + rate + '% — ' + (beds - occupied) + ' beds vacant',
      icon:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' });
  }
  return out;
}

function refreshNotifBell() {
  const badge = document.getElementById('hdr-bell-count');
  if (!badge) return;
  const n = chromeAlerts().length;
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.style.display = n > 0 ? 'block' : 'none';
}

function closeHdrMenus() {
  ['user-menu','notif-menu'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
}

function toggleUserMenu(ev) {
  if (ev) ev.stopPropagation();
  const m = document.getElementById('user-menu'); if (!m) return;
  const open = m.style.display === 'block';
  closeHdrMenus();
  if (!open) { refreshChromeUser(); m.style.display = 'block'; }
}

function toggleNotifMenu(ev) {
  if (ev) ev.stopPropagation();
  const m = document.getElementById('notif-menu'); if (!m) return;
  const open = m.style.display === 'block';
  closeHdrMenus();
  if (open) return;
  const list = chromeAlerts();
  m.innerHTML = '<div class="hdr-menu__head"><b>Notifications</b><span>'
    + (list.length ? list.length + ' need' + (list.length>1?'':'s') + ' attention' : 'Nothing outstanding')
    + '</span></div>'
    + (list.length
        ? list.map(a => '<div class="hdr-note ' + a.hue + '" onclick="closeHdrMenus();' + a.go + '">'
            + '<span class="hdr-note__ico">' + a.icon + '</span>'
            + '<span class="hdr-note__msg">' + a.msg + '</span></div>').join('')
        : '<div class="hdr-note__empty">All clear — nothing needs attention.</div>');
  m.style.display = 'block';
}

// One document-level listener closes both menus on any outside click.
document.addEventListener('click', function (e) {
  if (e.target.closest && (e.target.closest('#user-menu') || e.target.closest('#notif-menu')
      || e.target.closest('#hdr-bell') || e.target.closest('#sb-user'))) return;
  closeHdrMenus();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeHdrMenus(); });

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════