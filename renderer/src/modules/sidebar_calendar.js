/* ─── HOSTIX — SIDEBAR CALENDAR MODULE ─────────────────────────────────────
   Contains: toggleSbCal, closeSbCal, renderSidebarCalendar,
             sbCalPrev, sbCalNext, sbCalSetYear
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function toggleSbCal() {
  _sbCalOpen = !_sbCalOpen;
  const body = document.getElementById('sb-cal-body');
  const arrow = document.getElementById('sb-cal-arrow');
  if(body) body.style.display = _sbCalOpen ? 'block' : 'none';
  if(arrow) arrow.style.opacity = _sbCalOpen ? '1' : '0.6';
  if(_sbCalOpen) renderSidebarCalendar();
}
function closeSbCal() {
  _sbCalOpen = false;
  const body = document.getElementById('sb-cal-body');
  const arrow = document.getElementById('sb-cal-arrow');
  if(body) body.style.display = 'none';
  if(arrow) arrow.style.opacity = '0.6';
}

// Close calendar when clicking anywhere outside it
document.addEventListener('click', function(e) {
  if(!_sbCalOpen) return;
  const wrap = document.getElementById('sb-calendar-wrap');
  if(wrap && !wrap.contains(e.target)) closeSbCal();
});

function renderSidebarCalendar() {
  const lbl = document.getElementById('sb-cal-current-lbl');
  const todayLbl = document.getElementById('sb-cal-today-lbl');
  const daysEl = document.getElementById('sb-cal-days');
  if(!lbl || !daysEl) return;

  const now = new Date();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  // Always update today label in header (visible even when collapsed)
  if(todayLbl) {
    todayLbl.textContent = now.toLocaleString('default',{weekday:'short',day:'numeric',month:'short'});
  }
  if(!_sbCalOpen) return; // only render days grid if expanded

  const d = new Date(_sbCalYear, _sbCalMonth, 1);
  const monthName = d.toLocaleString('default',{month:'long'});
  const monthKey = `${_sbCalYear}-${String(_sbCalMonth+1).padStart(2,'0')}`;
  lbl.textContent = monthName;

  // ── Year dropdown ──────────────────────────────────────────────────────────
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

  // Days in month, first day of week (Mon=0)
  const daysInMonth = new Date(_sbCalYear, _sbCalMonth+1, 0).getDate();
  let startDay = d.getDay() - 1; if(startDay < 0) startDay = 6;

  // Payment indicators
  const hasPaid = DB.payments.some(p=>p.status==='Paid'&&_payMatchesMonth(p,monthKey));
  const hasPend = DB.payments.some(p=>p.status==='Pending'&&_payMatchesMonth(p,monthKey));

  // Build paid days set for dot indicators
  const paidDays = new Set();
  const pendDays = new Set();
  DB.payments.forEach(p=>{
    const d2 = p.paidDate||p.date||'';
    if(d2.startsWith(monthKey)) {
      const day = parseInt(d2.slice(8,10));
      if(p.status==='Paid') paidDays.add(day);
      else pendDays.add(day);
    }
  });

  let html = '';
  // Empty cells before first day
  for(let i=0;i<startDay;i++) html += '<div></div>';

  for(let day=1;day<=daysInMonth;day++) {
    const isToday = day===todayDate && _sbCalMonth===todayMonth && _sbCalYear===todayYear;
    const isPast = new Date(_sbCalYear,_sbCalMonth,day) < new Date(todayYear,todayMonth,todayDate);
    const hasPaidDot = paidDays.has(day);
    const hasPendDot = pendDays.has(day);
    const dotColor = hasPaidDot ? 'var(--green)' : hasPendDot ? 'var(--amber)' : 'transparent';

    const dayDateStr = `${monthKey}-${String(day).padStart(2,'0')}`;
    const isFuture = new Date(_sbCalYear,_sbCalMonth,day) > new Date(todayYear,todayMonth,todayDate);

    let bg = 'transparent';
    let color = isPast ? 'var(--text3)' : 'var(--text)';
    let border = 'none';
    if(isToday) { bg='var(--gold)'; color='#000'; border='none'; }

    html += `<div onclick="navigateToMonth('${monthKey}');closeSbCal()" title="View ${monthKey} on dashboard" style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;aspect-ratio:1;border-radius:5px;cursor:pointer;background:${bg};color:${color};font-size:10.5px;font-weight:${isToday?'800':'500'};transition:background 0.12s;border:${border}" onmouseover="if('${isToday}'!=='true')this.style.background='var(--bg3)'" onmouseout="if('${isToday}'!=='true')this.style.background='transparent'">
      ${day}
      <div style="width:4px;height:4px;border-radius:50%;background:${dotColor};margin-top:1px"></div>
    </div>`;
  }
  daysEl.innerHTML = html;
}

function sbCalPrev() {
  _sbCalMonth--;
  if(_sbCalMonth < 0) { _sbCalMonth=11; _sbCalYear--; }
  renderSidebarCalendar();
  // Auto-update dashboard when navigating calendar months
  const key = _sbCalYear + '-' + String(_sbCalMonth+1).padStart(2,'0');
  _dashboardMonth = key;
  const resetBtn = document.getElementById('sb-cal-reset-btn');
  if(resetBtn) resetBtn.style.display = 'inline-block';
  renderPage(currentPage);
}
function sbCalNext() {
  _sbCalMonth++;
  if(_sbCalMonth > 11) { _sbCalMonth=0; _sbCalYear++; }
  renderSidebarCalendar();
  // Auto-update dashboard when navigating calendar months
  const key = _sbCalYear + '-' + String(_sbCalMonth+1).padStart(2,'0');
  _dashboardMonth = key;
  const resetBtn = document.getElementById('sb-cal-reset-btn');
  if(resetBtn) resetBtn.style.display = 'inline-block';
  renderPage(currentPage);
}

// Called when user picks a year from the year dropdown inside the sidebar calendar
function sbCalSetYear(year) {
  _sbCalYear = parseInt(year);
  renderSidebarCalendar();
  const key = _sbCalYear + '-' + String(_sbCalMonth+1).padStart(2,'0');
  _dashboardMonth = key;
  const resetBtn = document.getElementById('sb-cal-reset-btn');
  if(resetBtn) resetBtn.style.display = 'inline-block';
  renderPage(currentPage);
}

// Navigate dashboard/reports to a specific month (called from calendar click)