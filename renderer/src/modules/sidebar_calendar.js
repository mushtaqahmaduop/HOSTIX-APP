/* --- HOSTYLLO - SIDEBAR CALENDAR MODULE -------------------------------------
   Contains: toggleSbCal, closeSbCal, renderSidebarCalendar, sbCalSetYear,
             sbCalPickMonth, sbCalToday

   OWNER REVIEW #2 (2026-09-18). Three things were wrong with this control and
   they are worth keeping written down, because two of them were invisible.

   1. IT SHOWED TODAY, NOT THE MONTH THE DASHBOARD WAS SHOWING. The collapsed
      label - the only part of the control visible without opening it - was
      written unconditionally from `new Date()`:
          todayLbl.textContent = now.toLocaleString(...)
      So stepping back to August moved every figure on the dashboard and the
      picker still read "Thu, 18 Sep". The one piece you could see was the one
      piece that could not change. It is dashMonthLabel() now, so it cannot
      disagree with the screen.

   2. IT WAS A STEPPER. Two arrows, one month per click: up to six clicks to
      reach a month inside the browsed year, eleven to cross a year. The
      popover opens on a 12-month grid instead - any month is one click, and
      the year stays the dropdown it already was.

   3. BROWSING WAS PICKING. sbCalSetYear() wrote _dashboardMonth, so opening
      2025 in the year dropdown just to look silently moved the dashboard to
      September 2025. _sbCalYear/_sbCalMonth are the browse position now and
      nothing else; the dashboard moves only when a month is clicked.

   The day grid below the months stayed. It is not a month picker - every cell
   in it navigates to the same month - but its per-day dots are the one place
   in the app that shows which days of a month took payments.
   --------------------------------------------------------------------------- */
'use strict';

// -- State --------------------------------------------------------------------
var _sbCalOpen = false;
var _sbCalMonth = new Date().getMonth();   // browse position only - see note 3
var _sbCalYear  = new Date().getFullYear();

function _sbCalChrome() {
  const body  = document.getElementById('sb-cal-body');
  const arrow = document.getElementById('sb-cal-arrow');
  const btn   = document.getElementById('sb-cal-btn');
  if(body)  body.style.display = _sbCalOpen ? 'block' : 'none';
  if(arrow) arrow.style.transform = _sbCalOpen ? 'rotate(180deg)' : 'none';
  if(btn)   btn.setAttribute('aria-expanded', _sbCalOpen ? 'true' : 'false');
  /* The panel is position:fixed so that #sidebar's `overflow: hidden` cannot
     clip it - see the note on .sb-month-picker__body. Fixed offsets are
     viewport coordinates, so they have to be set here, off the button, and
     held inside the window. */
  if(_sbCalOpen && body && btn) {
    const r = btn.getBoundingClientRect();
    const w = body.offsetWidth || 280;
    body.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - w - 8))) + 'px';
    body.style.top  = Math.round(r.bottom + 4) + 'px';
  }
}

function toggleSbCal() {
  _sbCalOpen = !_sbCalOpen;
  if(_sbCalOpen) {
    // Open where the dashboard actually is, not where browsing last stopped.
    const p = dashMonth().split('-');
    _sbCalYear = Number(p[0]); _sbCalMonth = Number(p[1]) - 1;
  }
  _sbCalChrome();
  if(_sbCalOpen) renderSidebarCalendar();
}
function closeSbCal() {
  _sbCalOpen = false;
  _sbCalChrome();
}

// Close calendar when clicking anywhere outside it
document.addEventListener('click', function(e) {
  if(!_sbCalOpen) return;
  const wrap = document.getElementById('sb-calendar-wrap');
  if(wrap && !wrap.contains(e.target)) closeSbCal();
});

/* The 12 months of the browsed year. `is-on` is the month the dashboard is
   showing, `is-now` the real calendar month, `has-rec` a month that holds
   payment records - so a year you have never used reads as empty at a glance
   instead of looking identical to a full one. */
function _sbCalMonths() {
  const el = document.getElementById('sb-cal-months');
  if(!el) return;
  const sel  = dashMonth();
  const now  = thisMonth();
  const pays = (typeof DB !== 'undefined' && DB && DB.payments) ? DB.payments : [];
  let html = '';
  for(let m = 0; m < 12; m++) {
    const key  = _sbCalYear + '-' + String(m + 1).padStart(2, '0');
    const name = new Date(_sbCalYear, m, 1).toLocaleString('en-IN', { month: 'short' });
    const cls  = 'sb-month-picker__mo'
               + (key === sel ? ' is-on'  : '')
               + (key === now ? ' is-now' : '')
               + (pays.some(p => _payMatchesMonth(p, key)) ? ' has-rec' : '');
    html += '<button type="button" class="' + cls + '"'
          + ' onclick="sbCalPickMonth(' + m + ');event.stopPropagation()"'
          + ' aria-current="' + (key === sel ? 'true' : 'false') + '"'
          + ' title="' + escHtml(_monthKeyLabel(key)) + '">' + escHtml(name) + '</button>';
  }
  el.innerHTML = html;
}

function renderSidebarCalendar() {
  /* THE LABEL IS THE SELECTED MONTH - note 1 above. This runs whether the
     popover is open or shut, because the label is what is visible when it is
     shut, and it is the whole of the owner's second complaint. */
  const lbl = document.getElementById('sb-cal-today-lbl');
  const off = dashMonth() !== thisMonth();
  if(lbl) lbl.textContent = dashMonthLabel();
  const dot = document.getElementById('sb-cal-off');
  if(dot) dot.hidden = !off;
  const resetBtn = document.getElementById('sb-cal-reset-btn');
  if(resetBtn) resetBtn.style.display = off ? 'inline-block' : 'none';

  const daysEl = document.getElementById('sb-cal-days');
  if(!_sbCalOpen || !daysEl) return;   // nothing below here is visible when shut

  const now = new Date();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  const monthKey = _sbCalYear + '-' + String(_sbCalMonth + 1).padStart(2, '0');
  const curLbl = document.getElementById('sb-cal-current-lbl');
  if(curLbl) curLbl.textContent = _monthKeyLabel(monthKey);

  // -- Year dropdown ----------------------------------------------------------
  const yearSel = document.getElementById('sb-cal-year-sel');
  if(yearSel) {
    const minYear = 2026;
    const maxYear = new Date().getFullYear() + 5;
    // Re-build only when range changes
    const needsBuild = !yearSel.dataset.min || parseInt(yearSel.dataset.min) !== minYear || parseInt(yearSel.dataset.max) !== maxYear;
    if(needsBuild) {
      yearSel.innerHTML = '';
      for(let y = minYear; y <= maxYear; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSel.appendChild(opt);
      }
      yearSel.dataset.min = minYear;
      yearSel.dataset.max = maxYear;
    }
    yearSel.value = _sbCalYear;
  }

  _sbCalMonths();

  // Days in month, first day of week (Mon=0)
  const d = new Date(_sbCalYear, _sbCalMonth, 1);
  const daysInMonth = new Date(_sbCalYear, _sbCalMonth + 1, 0).getDate();
  let startDay = d.getDay() - 1; if(startDay < 0) startDay = 6;

  // Build paid days set for dot indicators
  const paidDays = new Set();
  const pendDays = new Set();
  DB.payments.forEach(function(p) {
    const d2 = p.paidDate || p.date || '';
    if(d2.startsWith(monthKey)) {
      const day = parseInt(d2.slice(8, 10));
      if(p.status === 'Paid') paidDays.add(day); else pendDays.add(day);
    }
  });

  let html = '';
  // Empty cells before first day
  for(let i = 0; i < startDay; i++) html += '<div></div>';

  for(let day = 1; day <= daysInMonth; day++) {
    const isToday = day === todayDate && _sbCalMonth === todayMonth && _sbCalYear === todayYear;
    const isPast = new Date(_sbCalYear, _sbCalMonth, day) < new Date(todayYear, todayMonth, todayDate);
    const dotColor = paidDays.has(day) ? 'var(--green)' : pendDays.has(day) ? 'var(--amber)' : 'transparent';
    const cls = 'sb-month-picker__day'
              + (isToday ? ' is-today' : '')
              + (isPast  ? ' is-past'  : '');
    html += '<div class="' + cls + '" onclick="navigateToMonth(\'' + monthKey + '\');closeSbCal()"'
          + ' title="View ' + _monthKeyLabel(monthKey) + ' on the dashboard">' + day
          + '<i class="sb-month-picker__daydot" style="background:' + dotColor + '"></i></div>';
  }
  daysEl.innerHTML = html;
}

/* THE MONTH AS A DOCUMENT, not as a filter (2026-09-20).

   showMonthDetailModal() — a month's KPIs, its fee records, its expense
   register, Add Fee Record / Add Expense, and an Export of the lot — was
   reachable only from a calendar popover that no longer exists. Nothing else
   opened it: navigateToMonth(), which every cell here calls, re-filters the
   page you are on and never opens a dialog. So a finished screen sat in the
   build with no way in.

   It hangs HERE, beside the name of the month being browsed, and nowhere near
   the KPI cards: the owner locked those on 7 Sep because a tile that links to
   a worse version of Reports makes the dashboard twitch under the pointer, and
   counter-flow-decisions.spec.js holds them locked. The cells keep their one
   job — picking a month moves the dashboard — and this is a second, explicit
   action on the month you are LOOKING at, which is not necessarily the one the
   dashboard is showing. */
function sbCalMonthReport(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const key = _sbCalYear + '-' + String(_sbCalMonth + 1).padStart(2, '0');
  if (typeof showMonthDetailModal !== 'function') {
    if (typeof toast === 'function') toast('The month report is unavailable', 'error');
    return;
  }
  closeSbCal();
  showMonthDetailModal(key, monthLabel(key));
}

/* Picking a month is the only thing here that moves the dashboard. */
function sbCalPickMonth(m) {
  _sbCalMonth = m;
  navigateToMonth(_sbCalYear + '-' + String(m + 1).padStart(2, '0'));
  closeSbCal();
  renderSidebarCalendar();
}

/* Browsing a year does not - note 3. */
function sbCalSetYear(year) {
  _sbCalYear = parseInt(year, 10);
  renderSidebarCalendar();
}

/* Back to the real month. This used to be four statements written inline in
   the markup, which is why it left the label and the browse position behind. */
function sbCalToday() {
  _dashboardMonth = null;
  const p = thisMonth().split('-');
  _sbCalYear = Number(p[0]); _sbCalMonth = Number(p[1]) - 1;
  renderSidebarCalendar();
  renderPage(currentPage);
}

/* navigateToMonth(monthKey) is the shared entry point and lives in
   src/modules/dashboard.js - it is what the month cells, the day cells and
   the dashboard's own drill-downs all call. The dangling
   "// Navigate dashboard/reports to a specific month" comment that used to
   end this file introduced a function that has never been in it. */
