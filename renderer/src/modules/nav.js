/* ─── HOSTYLLO — NAVIGATION MODULE ───────────────────────────────────────────
   Loaded by index.html after storage.js
   Contains: goBack, navigate, headerAction, renderPage,
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
/* ── THE TRAIL ──────────────────────────────────────────────────────────────
   `goBack()` and `pageHistory` have been here all along; what was missing was
   any way for a warden to reach them. The header's Back button was removed on
   the grounds that "sub-pages carry their own exit", which is true of the
   add-student form and false of everything the dashboard links to: a donut
   slice, a KPI card, a Needs Action verb and View All all jump you to another
   page with no way back but the sidebar, which loses where you were (owner,
   7 Sep).

   TWO KINDS OF NAVIGATION, and only one of them is a step:

     · A RAIL CLICK is a fresh start. `navRail()` clears the trail, because
       offering to go "back" to a page the warden deliberately left is noise.
     · EVERYTHING ELSE is a step deeper — a chart, a widget, a modal's button,
       the command palette. Those push, and Back returns.

   The button appears only when the trail has somewhere to return to, so it is
   absent on a plain rail visit and present the moment a jump happens. */
let pageHistory = ['dashboard'];

function goBack() {
  if (pageHistory.length > 1) {
    pageHistory.pop();
    navigate(pageHistory[pageHistory.length - 1], true);
  }
}

/** Where the sidebar goes. Same navigation, but it starts a new trail.

    The reset happens AFTER navigate, not before: navigate only pushes when the
    page actually changes, so clearing first and letting it push left the trail
    EMPTY whenever the rail item for the current page was clicked — and an empty
    trail hides the Back button on the next jump, which is the bug this was
    written to prevent. Assigning afterwards makes the trail exactly [page]
    whichever branch navigate took. */
function navRail(page) {
  navigate(page);
  pageHistory = [page];
  _syncBackBtn();
}

/** Show the Back control only when there is something behind us. */
function _syncBackBtn() {
  const b = document.getElementById('hdr-back');
  if (!b) return;
  const deep = pageHistory.length > 1;
  b.style.display = deep ? 'flex' : 'none';
  if (deep) {
    const prev = pageHistory[pageHistory.length - 2];
    const cfg = pageConfig[prev] || {};
    b.title = 'Back to ' + (cfg.title || prev);
    b.setAttribute('aria-label', b.title);
  }
}
const pageConfig = {
  dashboard:     { title:'Dashboard', sub:'', action:'Add Student' },
  rooms:         { title:'Rooms', sub:'', action:'Add Room' },
  students:      { title:'Students', sub:'', action:'Add Student' },
  payments:      { title:'Finance', sub:'', action:'Add Payment' },
  expenses:      { title:'Expenses', sub:'', action:'Add Expense' },
  cancellations: { title:'Cancellations', sub:'', action:'Add Cancellation' },
  /* Former Students was a MODAL behind the account menu until 2026-09-10.
     `action:null` on purpose: the page's own verb is Restore, on a row, and
     there is no such thing as adding a former student — somebody becomes one
     by leaving. */
  former:        { title:'Former Students', sub:'', action:null },
  /* `reports2.png` draws three lines here: "Reports", the hostel's name in
     caps, and a sentence. Two of the three are built.

     THE HOSTEL NAME IS DELIBERATELY NOT ONE OF THEM. The owner had it removed
     from below the header title on 7 Sep ("remove hostel name from below
     dashboard at the header") and it moved to the centre of the title bar the
     same day, where it still is. Putting it back on this one page would print
     it twice, 40px apart — the exact thing that was removed. Flagged to the
     owner rather than silently done either way. */
  reports:       { title:'Reports', sub:'Analytics, insights and detailed reports for better hostel management', action:null },
  issues:        { title:'Complaints', sub:'', action:'Add Issue' },
  activitylog:   { title:'Activity Log', sub:'', action:null },
  // Backup & Restore was the one item in the rail's SYSTEM group that opened a
  // dialog instead of a screen. It is a page now — see backup-page.js.
  backup:        { title:'Backup & Restore', sub:'', action:null },
  // User Management was a modal off the account menu until 2026-09-09.
  users:         { title:'User Management', sub:'', action:null },
  settings:      { title:'Settings', sub:'', action:null },
  /* `sub` carries a line here where most pages leave it blank: this is the one
     screen a warden opens when they are already having a bad afternoon, and
     the reference's "We're here to help you succeed" is the whole tone of it. */
  support:       { title:'Help & Support', sub:'Everything support asks for, on one page', action:null },
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

/* ══ FILTER LIFECYCLE ══════════════════════════════════════════════════════
   A list screen's filters belong to a VISIT, not to the session. Leave
   Students and come back and it should look the way it looks the first time —
   the owner reported the opposite on 2026-09-08: "when the page is closed and
   reopened the search bar is still with the data you entered".

   It used to be a hand-written list of assignments inside navigate(), and the
   trouble with a hand-written list is that it drifts from the objects it
   resets. By 8 Sep it had missed `cancelFilter` and `issueFilter` entirely,
   plus `roomFilter.type`/`.floor`/`.status`, `studentFilter.fee`/`.month` and
   `expFilter.cat`/`.month` — every filter added after the list was written.

   Each screen now REGISTERS its filter object and the values a fresh visit
   should start from, so adding a filter cannot be forgotten: put it in the
   defaults and both the reset and the toolbar's Clear button pick it up.

   A DEFAULT IS NOT ALWAYS EMPTY. `month` defaults to the current month on the
   screens that scope by month, because that is the answer a warden opening
   Payments in September wants — "the default dropdowns for current should be
   kept as is" (owner, same message). `_filterDefaults` is therefore evaluated
   fresh on every reset, never captured once at load: a session left open past
   midnight on the 30th must not keep resetting to last month. */
const FILTER_REGISTRY = [];

/**
 * Register a screen's filter object.
 * @param {string} key     the page name, for `resetFilters(key)`
 * @param {object} obj     the live filter object the screen reads
 * @param {function(): object} defaults returns a fresh set of starting values
 * @param {function()} [also] anything else a fresh visit clears (a selection)
 */
function registerFilter(key, obj, defaults, also) {
  FILTER_REGISTRY.push({ key, obj, defaults, also });
}

/** Put one screen's filters — or every screen's — back to a fresh visit. */
function resetFilters(key) {
  for (const f of FILTER_REGISTRY) {
    if (key && f.key !== key) continue;
    if (!f.obj) continue;
    Object.assign(f.obj, f.defaults());
    if (typeof f.also === 'function') f.also();
  }
}

/** True when anything on this screen is filtered away from its defaults. */
function filtersAreSet(key) {
  const f = FILTER_REGISTRY.find(x => x.key === key);
  if (!f || !f.obj) return false;
  const d = f.defaults();
  // `page` and `pageSize` are position, not a filter — paging to 2 is not a
  // filter the Clear button should offer to undo.
  return Object.keys(d).some(k =>
    k !== 'page' && k !== 'pageSize' && String(f.obj[k]) !== String(d[k]));
}

function navigate(page, isBack=false) {
  // Auto-close sidebar on navigation (mobile)
  closeSidebar();
  // A visit starts clean — see FILTER_REGISTRY above.
  if (page !== currentPage) resetFilters();
  /* ONLY A CHANGE OF PAGE IS A STEP. `navigate(currentPage)` is how several
     controls re-render in place, and each one used to push a duplicate — after
     a few of those, Back appeared to do nothing because the top three entries
     were the page you were already on. */
  if (!isBack && page !== currentPage) {
    pageHistory.push(page);
    // FIX #9: Cap pageHistory to prevent unbounded memory growth across long sessions
    if (pageHistory.length > 50) pageHistory.shift();
  }
  currentPage = page;
  _syncBackBtn();
  // BUG FIX: Reset reportDetail on every fresh navigation to reports so the
  // overview badges always show first instead of the last opened detail panel.
  if (page === 'reports') reportDetail = null;
  const cfg = pageConfig[page] || { title: page, sub: '', action: null };
  // The header Back button was removed; sub-pages carry their own exit.
  // goBack()/pageHistory stay — the command palette and in-page controls use them.
  // A detour page (the add-student form) keeps its parent's rail item lit,
  // otherwise nothing in the sidebar is highlighted while the form is open.
  const navKey = cfg.nav || page;
  let _lit = null;
  document.querySelectorAll('.nav-item').forEach(el=>{
    const on = el.dataset.page===navKey;
    el.classList.toggle('active', on);
    if (on) _lit = el;
  });
  /* KEEP THE LIT ITEM ON SCREEN.

     The rail scrolls on every laptop this ships to — measured, not assumed: at
     1366x768 with Windows at 125% (the common OEM default) the scroller is
     418px tall against 674px of content, so five of twelve items sit below the
     fold. Without this, opening Settings from the command palette or a deep
     link lights a row the warden cannot see, and the rail looks like nothing
     is selected at all.

     `nearest` rather than `center`: it scrolls only when the item is actually
     out of view, so clicking a visible item does not jerk the list under the
     cursor. Guarded because scrollIntoView with options is unsupported in
     older engines and this must never take navigation down with it. */
  if (_lit) {
    try { _lit.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    catch (_) { /* a rail that does not auto-scroll still navigates fine */ }
  }
  applyHeaderChrome(page);
  renderPage(page, true); // reset scroll on real navigation
}

/* THE HEADER'S TITLE, SUBTITLE AND PRIMARY BUTTON, IN ONE PLACE.
 *
 * This used to live inside navigate(), which meant it only ever ran when
 * somebody clicked the rail. On a fresh login the app lands on the dashboard
 * WITHOUT going through navigate(), so the header kept its markup defaults:
 * the title read "Dashboard" because that is what index.html hard-codes, and
 * the primary button stayed hidden with the placeholder label "Add". The one
 * button the sketch puts in the header was missing until you navigated away
 * and back.
 *
 * Pulled out so the login path can call it too. It only writes chrome — no
 * render, no navigation — so it is safe to call at any point after DB and the
 * permission helpers exist. */
function applyHeaderChrome(page) {
  const cfg = pageConfig[page] || { title: page, sub: '', action: null };

  const _t = document.getElementById('hdr-title');
  if (_t) _t.textContent = cfg.title || '';

  /* THE HOSTEL NAME IS NOT HERE ANY MORE (owner, 7 Sep: "remove hostel name
     from below dashboard at the header"). It moved to the centre of the title
     bar on the same day, and printing it in both places said the same thing
     twice, 40px apart, on every page.

     The subtitle element stays and still shows a PAGE's own subtitle when one
     is configured — that is a different sentence. Two pages set one: Help &
     Support and Reports, both from their owner reference designs. */
  const _s = document.getElementById('hdr-sub');
  if (_s) {
    const txt = cfg.sub || '';
    _s.textContent = txt;
    _s.style.display = txt ? 'block' : 'none';
  }

  /* THE DASHBOARD GREETING rides in the header's spare width, and only there -
     see `_dashGreeting()` for why it is not a band on the page. It is removed
     on every other page rather than left behind: it greets you for arriving at
     the dashboard, and a greeting that follows you to Payments is furniture. */
  const _left = document.querySelector('#header .hdr-left');
  const _oldGreet = document.getElementById('hdr-greet');
  if (_oldGreet) _oldGreet.remove();
  if (_left && page === 'dashboard' && typeof _dashGreeting === 'function') {
    const _w = document.createElement('div');
    _w.id = 'hdr-greet';
    _w.innerHTML = _dashGreeting();
    _left.appendChild(_w);
  }

  /* The header's one primary button is Add <something>, and it leads to a gate.
     A button that always refuses is worse than no button: the warden does not
     learn they lack the permission, they learn the app is broken. This keeps
     the chrome honest; the gate at the entry point is still the boundary,
     because the command palette and a direct navigate() reach those functions
     without passing through here. */
  // 'add', not 'edit', since the two split on 2026-09-10 — this button only
  // ever opens an Add form.
  const mayAdd = typeof canDo !== 'function' || canDo('add');
  const btn = document.getElementById('hdr-action');
  if (btn) {
    if (cfg.action && mayAdd) {
      btn.style.display = 'flex';
      const lbl = document.getElementById('hdr-action-text');
      if (lbl) lbl.textContent = cfg.action;
    } else {
      btn.style.display = 'none';
    }
  }
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
/* headerAction2() — the header's "Add Payment" button — is gone with the button
   (2026-09-05). The sketch gives the header one primary action, and Add Payment
   is the first tile in the dashboard's Quick Actions. openAddPayment() is
   untouched and still reached from there, from the Payments page and from the
   command palette. */

// debounce() — defined in src/utils.js

// Smart re-render for search bars - preserves cursor focus
/* ══ TYPING SURVIVES A RE-RENDER ═══════════════════════════════════════════
   Every list screen filters by re-rendering the whole page into
   `#content.innerHTML`, which destroys the control the warden is typing into.
   Four screens had a private workaround (`searchRenderPage`, below) and two —
   Cancellations and Complaints — did not, so on those the search box lost
   focus on the first keystroke and had to be clicked again for every letter.
   The owner reported it on 2026-09-08 as "the search bar closes when you type
   the first letter".

   Fixing it per screen is how there came to be two behaviours in the first
   place. It belongs in the one function every re-render goes through, so a
   screen added tomorrow cannot get it wrong: remember what had focus and
   where the caret was, and put both back once the new markup is in.

   Keyed by id, because the element itself is gone — a re-render builds new
   nodes. Anything without an id is not restorable and is skipped rather than
   guessed at. */
function _captureFocus() {
  const a = document.activeElement;
  if (!a || !a.id || !document.getElementById('content').contains(a)) return null;
  const st = { id: a.id, start: null, end: null };
  /* selectionStart throws on inputs that have no text selection to report —
     checkbox, radio, a <select>. Those still restore focus; only the caret is
     unavailable, which is what the try/catch says. */
  try { st.start = a.selectionStart; st.end = a.selectionEnd; } catch (e) {}
  return st;
}

function _restoreFocus(st) {
  if (!st) return;
  const el = document.getElementById(st.id);
  if (!el) return;
  el.focus();
  if (st.start === null) return;
  try { el.setSelectionRange(st.start, st.end); } catch (e) {}
}

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
  // …and whatever the warden was typing into. See _captureFocus() above.
  const savedFocus = _captureFocus();
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

  /* The global search panel does not survive a page change. Picking a result
     already closed it, but arriving any other way — the rail, the palette, a
     Back button — left it hanging open over the new page with results for the
     old one. */
  if (typeof dashGlobalSearchClear === 'function') dashGlobalSearchClear();

  if(p.startsWith('cancellations_')) {
    cancFilter = p.replace('cancellations_','');
    basePage = 'cancellations';
    currentPage = 'cancellations';
    document.querySelectorAll('.nav-item').forEach(el=>{ el.classList.toggle('active', el.dataset.page==='cancellations'); });
    const cfg=pageConfig['cancellations'];
    const _t=document.getElementById('hdr-title'); if(_t) _t.textContent=cfg?.title||'';
    const _s=document.getElementById('hdr-sub');
    if(_s) {
      const _hostel = (typeof DB !== 'undefined' && DB.settings && DB.settings.hostelName) || '';
      _s.textContent = [_hostel, cfg?.sub].filter(Boolean).join(' · ');
    }
    const actionBtn=document.getElementById('hdr-action');
    const _mayAdd2 = typeof canDo !== 'function' || canDo('add');
    if(cfg&&cfg.action&&_mayAdd2){actionBtn.style.display='flex';document.getElementById('hdr-action-text').textContent=cfg.action;}
    else{actionBtn.style.display='none';}
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
      else if(basePage==='former') el.innerHTML = renderFormerStudents();
      else if(basePage==='reports') el.innerHTML = renderReports();
      else if(basePage==='maintenance') { issuesTab='maintenance'; el.innerHTML = renderIssues(); }
      else if(basePage==='complaints') { issuesTab='complaints'; el.innerHTML = renderIssues(); }
      else if(basePage==='issues') el.innerHTML = renderIssues();
      else if(basePage==='addstudent') el.innerHTML = renderAddStudent();
      else if(basePage==='addpayment') el.innerHTML = renderAddPayment();
      else if(basePage==='activitylog') el.innerHTML = renderActivityLog();
      else if(basePage==='backup') el.innerHTML = renderBackupPage();
      else if(basePage==='users') el.innerHTML = renderUsers();
      else if(basePage==='settings') el.innerHTML = renderSettings();
      else if(basePage==='archive') el.innerHTML = renderArchive();
      else if(basePage==='support') el.innerHTML = renderSupport();
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
    /* Focus goes back after the scroll, because `el.focus()` scrolls the
       element into view and would otherwise fight the line above it. A page
       navigation (`resetScroll`) deliberately does NOT restore: the control
       that had focus belonged to the page being left. */
    if (!resetScroll) _restoreFocus(savedFocus);
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
  /* The sidebar node is hidden now (the name lives in the title bar), but it
     is still written so anything reading it stays correct - and the bar is
     refreshed from the same call rather than from a second code path. */
  setEl('sb-hostel-name', DB.settings.hostelName || '');
  if (typeof window.setTitlebarHostel === 'function') window.setTitlebarHostel();
  /* THE BUILD'S VERSION, NOT A TYPED ONE. This read DB.settings.version — a
     text field a warden could edit from Settings, which said 'v3.0' on a
     v5.0.0 build. The login screen already corrects itself from app.getVersion()
     (index.html); the sidebar now does the same, with the stored value as the
     fallback that paints first. The Settings field it came from is gone. */
  setEl('sb-version', 'v' + (DB.settings.version || '5.0'));
  if (window.appInfo && window.appInfo.version) {
    window.appInfo.version().then(function (v) { setEl('sb-version', 'v' + v); }).catch(function () {});
  }
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

/* ── THE WALL CLOCK ─────────────────────────────────────────────────────────
   NOTHING IN THIS APP RE-READ THE CLOCK once a screen was painted, and two
   owner-reported faults were the same fault:

     · the sidebar's date chip kept yesterday's date after midnight, which read
       as "the date changes late" - it changes on the next render, and on a
       machine left open overnight the next render is the next morning;
     · the greeting still said "Good morning" at night.

   Both are `new Date()` read once at paint time. This re-reads it every 30s
   and repaints only what actually changed - the cost of being wrong here is a
   warden dating a receipt to the wrong day.

   30 SECONDS, not 1: the check is two string comparisons, and a minute of lag
   on a greeting is invisible while a minute of lag on the date at 00:00:30 is
   not worth a timer that fires twice as often all day for it. */
let _clockDay = null, _clockGreet = null, _clockTimer = null;

function _chromeClockTick() {
  const now = new Date();
  const day = (typeof ymd === 'function') ? ymd(now) : now.toDateString();

  /* THE DAY ROLLED OVER. The date chip is re-rendered, and the dashboard with
     it when that is the page on screen - every figure there is scoped to a
     month that "today" can have just moved out of. */
  if (_clockDay !== null && day !== _clockDay) {
    if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
    if (typeof currentPage !== 'undefined' && currentPage === 'dashboard'
        && typeof renderPage === 'function') renderPage('dashboard', false);
  } else if (_clockDay === null && typeof renderSidebarCalendar === 'function') {
    renderSidebarCalendar();
  }
  _clockDay = day;

  /* THE GREETING CROSSED A PHASE. Only the text and the glyph change, so this
     rewrites the one element rather than re-rendering the header. */
  if (typeof _dashGreetingText === 'function') {
    const txt = _dashGreetingText();
    if (_clockGreet !== null && txt !== _clockGreet) {
      const host = document.getElementById('hdr-greet');
      if (host && typeof _dashGreeting === 'function') host.innerHTML = _dashGreeting();
    }
    _clockGreet = txt;
  }
}

function startChromeClock() {
  if (_clockTimer) return;
  _chromeClockTick();
  _clockTimer = setInterval(_chromeClockTick, 30000);
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
    const amt = pending.reduce((s,p) => s + outstandingOf(p), 0);
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
  // Cash handovers (warden ledger step 4) come first: money waiting on a person.
  if (typeof hoAlerts === 'function') out.unshift(...hoAlerts());
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