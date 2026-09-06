/* ─── HOSTYLLO — DASHBOARD MODULE ────────────────────────────────────────────
   Contains: calcRevenue, _payMatchesMonth, generateRooms, renderDashboard,
             all room detail modals, month detail modals, trend chart,
             global search, navigation helpers
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ICONS is now defined globally in src/icons.js — loaded before this module.

// ══ SINGLE SOURCE OF TRUTH FOR REVENUE ══════════════════════════════════════
// Revenue = Paid payments + partial Pending payments (where amount>0 & unpaid is explicitly set)
// This is used by dashboard, reports, CSVs, PDFs, WhatsApp/email share — everywhere.
function calcRevenue(datePrefix) {
  // Use _payMatchesMonth to handle both YYYY-MM-DD date fields AND "April 2026" month labels
  const paid    = DB.payments
    .filter(p => p.status==='Paid' && _payMatchesMonth(p, datePrefix))
    .reduce((s,p) => s + Number(p.amount||0), 0);
  /* D-4. This used to require `p.unpaid != null`, so a part-payment written
     before that field existed contributed NOTHING to revenue — the money was
     collected, banked and simply absent from the books.

     The guard was a relic of reading `amount` as the sum still owed. It is not:
     _cashEvents() below says it outright — "p.amount is the total collected on
     that record" — and carries no such condition, so calcCashReceived() has
     been counting these records all along. The cash figure and the accrual
     figure disagreed about the same rupees. */
  const partial = DB.payments
    .filter(p => p.status==='Pending' && Number(p.amount||0)>0
      && _payMatchesMonth(p, datePrefix))
    .reduce((s,p) => s + Number(p.amount||0), 0);
  return paid + partial;
}

/* ══ SINGLE SOURCE OF TRUTH FOR CASH RECEIVED ════════════════════════════════
   calcRevenue() above is ACCRUAL: it answers "how much did month M earn",
   and July's rent handed over on 3 August is July's revenue. That is correct
   for the books and every report depends on it.

   It is the wrong figure to count a cash box against. At month end the warden
   has a drawer of notes and wants to know what should be in it — money that
   physically arrived between the 1st and the 31st, whatever month it settles.
   There was no such figure anywhere in the app, so the drawer could not be
   reconciled at all.

   HOW A RECORD'S CASH IS DATED

   `p.amount` is the total collected on that record. `p.partialPayments` is the
   instalment trail, and each entry carries the date its instalment arrived —
   so a record part-paid in July and cleared in August is genuinely two cash
   events in two months. The first collection is not always written to the
   trail, so whatever the trail does not account for is attributed to the
   record's own payment date.

   MONEY IS CONSERVED, WHICH IS THE WHOLE POINT

   Every branch below distributes exactly `p.amount` across months — never more,
   never less — so summing the twelve months of a year returns the same total
   the year's records hold. A reconciliation tool that could invent or lose a
   rupee would be worse than none.

   A trail claiming MORE than was ever collected is known to exist on disk —
   repairPaymentComposition() documents the two bugs that wrote them. Those
   trails cannot be trusted to date anything, so such a record falls back
   entirely to its own date rather than being scaled or partly believed. */
function _cashEvents(p) {
  if (!p) return [];
  const total = Number(p.amount || 0);
  const base  = p.date || p.paidDate || p.dueDate || '';
  const trail = Array.isArray(p.partialPayments) ? p.partialPayments : [];

  /* REVERSALS ARE CASH EVENTS TOO, AND THEY ARE NEGATIVE ONES.

     reversePayment() (§14) hands money back, which leaves the drawer on the day
     it happens — so it belongs in this month's cash figure with a minus sign,
     not netted invisibly into the original collection's month.

     It is stored in its own array rather than as a negative entry in
     partialPayments precisely because of the two lines below: this function
     FILTERS that array to positive amounts when it dates cash but SUMS it whole
     when it sanity-checks. A negative entry there would be counted by one and
     dropped by the other, and the record's cash would come out over-stated by
     the amount handed back — the one thing this function must never do. */
  const revs = Array.isArray(p.reversals) ? p.reversals : [];
  const revSum = revs.reduce((s, e) => s + Number(e && e.amount || 0), 0);

  // A record whose collections have been fully reversed still moved money on
  // two days, and the reconciliation has to show both.
  if (total <= 0 && revSum <= 0) return [];

  const trailSum = trail.reduce((s, e) => s + Number(e && e.amount || 0), 0);
  const netTrail = trailSum - revSum;

  // No trail, or a trail that claims more than was collected: one event.
  if (!trail.length || netTrail > total + 0.5) return [{ date: base, amount: total }];

  const events = trail
    .filter(e => e && Number(e.amount || 0) > 0)
    .map(e => ({ date: e.date || base, amount: Number(e.amount || 0) }));
  revs.filter(e => e && Number(e.amount || 0) > 0)
      .forEach(e => events.push({ date: e.date || base, amount: -Number(e.amount || 0) }));
  const residual = total - netTrail;
  if (residual > 0.5) events.push({ date: base, amount: residual });
  return events;
}

// Cash that physically arrived inside `key` (a YYYY-MM month or a YYYY year,
// matched as a date prefix — the same shape calcExpenses() takes).
function calcCashReceived(key) {
  if (!key) return 0;
  return (DB.payments || []).reduce((sum, p) =>
    sum + _cashEvents(p).reduce((s, e) =>
      s + (String(e.date || '').indexOf(String(key)) === 0 ? e.amount : 0), 0), 0);
}

/* The month's cash split by WHICH month it settles, which is the reconciliation
   itself: cash received = this period's own rent + arrears carried in from
   earlier months + anything paid ahead. `advance` is money for a future month,
   so it is in the drawer now and in none of this month's revenue. */
function cashBreakdown(key) {
  const out = { total: 0, current: 0, arrears: 0, advance: 0, count: 0 };
  (DB.payments || []).forEach(p => {
    const events = _cashEvents(p);
    if (!events.length) return;
    /* Compared at the SAME granularity as `key`. `key` is a prefix and may be a
       whole year, and '2026-04' < '2026' is false while '2026' < '2026-04' is
       true — so comparing a month against a year key sent every record in that
       year to `advance`, i.e. the year view reported all of its cash as paid in
       advance. Truncating the record's month to the key's width compares like
       with like in both cases. */
    const k       = String(key);
    const settles = _payMonthKey(p);            // the month this record bills
    const mine    = settles ? settles.slice(0, k.length) : null;
    events.forEach(e => {
      if (String(e.date || '').indexOf(k) !== 0) return;
      out.total += e.amount; out.count++;
      if (!mine || mine === k)  out.current += e.amount;
      else if (mine < k)        out.arrears += e.amount;
      else                      out.advance += e.amount;
    });
  });
  return out;
}

// ══ SINGLE SOURCE OF TRUTH FOR EXPENSES ═════════════════════════════════════
// A funds transfer is an expense. It is money that leaves the hostel's cash the
// same way a gas bill does; it is only stored in its own array because it is
// entered on its own screen. Every "total expenses" figure in the app goes
// through here, so the Expenses card, the reports strip, the PDFs and the CSVs
// cannot drift apart — and profit is revenue minus THIS, with no separate
// transfer deduction bolted on afterwards.
//
// `key` is a YYYY-MM month or a YYYY year, matched as a date prefix.
function calcExpenses(key) {
  return calcExpensesOnly(key) + calcTransfers(key);
}
function calcExpensesOnly(key) {
  return (DB.expenses || [])
    .filter(e => String(e.date || '').startsWith(key))
    .reduce((s, e) => s + Number(e.amount || 0), 0);
}
function calcTransfers(key) {
  return (DB.transfers || [])
    .filter(t => String(t.date || '').startsWith(key))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}
// Profit / Available Fund, stated once so nothing can compute it a second way.
function calcProfit(key) {
  return calcRevenue(key) - calcExpenses(key);
}
// ════════════════════════════════════════════════════════════════════════════

// ── PAYMENT MONTH MATCHER ────────────────────────────────────────────────────
// Single source of truth for "does payment p belong to monthKey (YYYY-MM)?".
// Fixes the core data-mixing bug: p.month stores "April 2026" while thisMonth()
// returns "2026-04" — .startsWith() never matched, hiding all month-label payments.
// Parse any month-ish string ("2026-04", "2026-04-17", "April 2026") to YYYY-MM.
// Returns null when the string carries no usable month.
function _toMonthKey(str) {
  if (!str || typeof str !== 'string') return null;
  var s = str.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  try {
    // "April 2026" has no day; appending one makes it parseable in every engine.
    var d = new Date(s + ' 1');
    if (!isNaN(d.getTime()))
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  } catch (e) {}
  return null;
}

// THE month a payment belongs to — exactly one, never several.
//
// `p.month` is the billing month the warden chose and is authoritative. The
// date fields are only ever a fallback for records written before a month
// label was stored, because they describe WHEN money moved, not WHAT PERIOD
// it settles: July's rent handed over on 3 August is still July's rent.
function _payMonthKey(p) {
  if (!p) return null;
  return _toMonthKey(p.month)
      || _toMonthKey(p.date)
      || _toMonthKey(p.dueDate)
      || _toMonthKey(p.paidDate);
}

// Does payment p fall inside period `mk`? `mk` is a prefix, so it accepts both
// a month ("2026-04") and a whole year ("2026") — the Reports year view relies
// on the latter.
//
// This used to return true if ANY of month/date/dueDate/paidDate fell in the
// period, which meant one record could be counted in up to four different
// months at once. That was the cause of revenue appearing in two months and of
// records showing up under a month they do not belong to.
function _payMatchesMonth(p, mk) {
  if (!p || !mk) return false;
  var k = _payMonthKey(p);
  return !!k && k.indexOf(String(mk)) === 0;
}

// Was this student on the roster during period `mk` (a YYYY-MM month or a YYYY
// year)? Used by every historical view, which previously listed whoever is
// Active *today* — so a student admitted in August appeared inside July's
// figures as though they had been living there all along.
function _studentInPeriod(s, mk) {
  if (!s || !mk) return false;
  var key   = String(mk);
  var last  = key.length === 4 ? key + '-12' : key;   // a year ends in December
  var first = key.length === 4 ? key + '-01' : key;
  var join = _toMonthKey(s.joinDate);
  if (join && join > last) return false;              // not admitted yet
  var left = _toMonthKey(s.leftDate || s.leaveDate);
  if (left && left < first) return false;             // already moved out
  // No join date on record: the only honest signal left is the current status.
  if (!join) return s.status === 'Active';
  return true;
}
// ─────────────────────────────────────────────────────────────────────────────

function generateRooms(roomTypes) {
  // roomTypes can be passed explicitly (from _initDBFields) to avoid reading stale DB.settings
  const rtypes = roomTypes || (DB.settings && DB.settings.roomTypes) || [];
  const rooms = [];
  // 42 rooms numbered 1–42, distributed across 4 floors
  const floors = [
    {name:'Ground', rooms:[1,2,3,4,5,6,7,8,9,10]},
    {name:'1st',    rooms:[11,12,13,14,15,16,17,18,19,20,21]},
    {name:'2nd',    rooms:[22,23,24,25,26,27,28,29,30,31]},
    {name:'3rd',    rooms:[32,33,34,35,36,37,38,39,40,41,42]}
  ];
  const typeIds = ['1s','2s','3s','4s','5s'];
  let idx=0;
  floors.forEach(f=>{
    f.rooms.forEach(num=>{
      const typeId = typeIds[idx%5];
      const type = rtypes.find(t=>t.id===typeId);
      rooms.push({
        id:'room_'+uid(), number:num, floor:f.name, typeId,
        rent:Number(type?.defaultRent)||0, studentIds:[], amenities:['Fan','Bed','Wardrobe'], notes:''
      });
      idx++;
    });
  });
  return rooms;
}

// ── DASHBOARD v5 HELPERS ─────────────────────────────────────────────────────
// Small pure helpers backing the KPI cards. Everything here derives from DB —
// no placeholder series, no invented deltas. If the data isn't there the
// component renders its own empty state rather than a made-up number.

// Real month-by-month series for the current year, truncated at the current
// month (future months are absent, not zero — a zero would read as "no income
// in November" on a chart).
function _dashSeries() {
  const now = new Date();
  const yr  = now.getFullYear();
  const cur = now.getMonth(); // 0-based
  const out = { rev:[], exp:[], pend:[], cash:[] };
  for (let i = 0; i <= cur; i++) {
    const k = yr + '-' + String(i+1).padStart(2,'0');
    out.rev.push(calcRevenue(k));
    out.exp.push(calcExpenses(k));    // transfers included — they ARE expenses
    out.pend.push((DB.payments||[]).filter(p=>p.status==='Pending'&&_payMatchesMonth(p,k))
      .reduce((s,p)=>s+outstandingOf(p),0));
    /* Cash is the one series that is NOT derived from the month a record bills.
       calcCashReceived() dates money by when it physically arrived, so this
       line and out.rev deliberately disagree in any month where rent was
       handed over late — which is the whole reason both figures are on the
       row. */
    out.cash.push(calcCashReceived(k));
  }
  return out;
}

/* ── CHART FIRST-PAINT FONT FIX ───────────────────────────────────────────────
   Chart.js measures axis ticks, legend text and datalabels with whatever font
   is RESOLVED AT DRAW TIME, and bakes those measurements into the scale
   layout. Inter is a local @font-face (vendor/fonts.css), so on a cold start
   the dashboard can paint before the face is parsed: the ticks get measured in
   the fallback, the plot area is sized for the wrong metrics, and the chart
   sits slightly out of place. Anything that re-renders it — switching pages
   and back, toggling the theme, "refreshing" — measures against the now-loaded
   font and it snaps right. That is the "it fixes itself when I refresh" bug.

   document.fonts.ready settles once every face is usable; re-laying out then
   costs one frame and makes the first paint identical to every later one.
   Guarded on the chart still existing, because a page change can destroy it
   while the promise is in flight. */
function _chartFontFix(chart) {
  if (!chart || !document.fonts || !document.fonts.ready) return;
  document.fonts.ready.then(function () {
    try {
      if (!chart.ctx || !chart.canvas || !chart.canvas.isConnected) return;
      chart.resize();
      chart.update('none');
    } catch (e) { /* chart was torn down mid-flight — nothing to fix */ }
  });
}

// Inline SVG sparkline. Stroke colour comes from the parent's --dh via CSS
// (an SVG *attribute* cannot resolve a CSS variable — only the stylesheet can),
// so .dash-spark polyline{stroke:var(--dh)} in dashboard.css does the colouring.
function _dashSpark(series) {
  const pts = (series||[]).filter(v=>typeof v==='number' && isFinite(v));
  if (pts.length < 2) return '<div class="dash-spark-empty">not enough history yet</div>';
  const W = 200, H = 34;
  const max = Math.max.apply(null, pts), min = Math.min.apply(null, pts);
  const span = (max - min) || 1;
  const d = pts.map(function(v,i){
    const x = (i/(pts.length-1))*W;
    const y = H - ((v-min)/span)*(H-4) - 2;
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  // A soft area wash under the line, as in the reference KPI cards. The
  // polygon closes the same points down to the baseline; the fill colour is
  // set in dashboard.css from the card's own --dh, so it stays semantic
  // (green revenue, red expenses…) and follows the theme.
  const area = d + ' ' + W + ',' + H + ' 0,' + H;
  return '<svg class="dash-spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'
       + '<polygon class="dash-spark__area" points="'+area+'"/>'
       + '<polyline points="'+d+'" fill="none" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

// Month-over-month change of the last two real months. Returns null when there
// is no prior month to compare against, so the card shows nothing instead of a
// fabricated "+0%".
function _dashDelta(series) {
  if (!series || series.length < 2) return null;
  const cur = series[series.length-1], prev = series[series.length-2];
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

// Stable avatar hue from the name — same student always gets the same colour
// across renders (index-based rotation would reshuffle whenever the list moves).
function _dashAvatarHue(name) {
  const hues = ['dh-violet','dh-blue','dh-green','dh-amber','dh-red'];
  let h = 0;
  const s = String(name||'?');
  for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

// Due-state of a pending payment, derived from its own dueDate.
function _dashDueState(p) {
  const due = p.dueDate || '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(due)) return { label:'Pending', hue:'dh-slate' };
  const d0 = new Date(today()), d1 = new Date(due.slice(0,10));
  const days = Math.round((d1 - d0) / 86400000);
  if (days <  0) return { label:'Overdue',  hue:'dh-red'   };
  if (days <= 3) return { label:'Due Soon', hue:'dh-amber' };
  return { label:'Pending', hue:'dh-slate' };
}

function renderDashboard() {
  /* The alert computation that opened this function is gone with the banners
     it fed. Every one of its findings — pending payments, open maintenance,
     unresolved complaints, low occupancy — is rebuilt by chromeAlerts() in
     nav.js and rendered by the header bell, which is where they now live once
     rather than twice. */

  const occ = DB.rooms.filter(r=>getRoomOccupancy(r)>0).length;
  const vac = DB.rooms.length - occ;
  const seatsRemainingInOccupiedRooms = DB.rooms.filter(r=>getRoomOccupancy(r)>0).reduce((s,r)=>{const cap=getRoomType(r)?.capacity||1;return s+(cap-getRoomOccupancy(r));},0);
  const activeStudents = DB.students.filter(t=>t.status==='Active').length;
  const mo = thisMonth();
  const collected = calcRevenue(mo);   // Revenue — transfers do NOT reduce revenue
  // Cash basis — what should physically be in the drawer for this month. See
  // calcCashReceived(): this is deliberately NOT `collected`, and the two
  // differing is normal rather than a fault.
  const cashIn = cashBreakdown(mo);
  // Pending — only for the selected month
  const pending = DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,mo)).reduce((s,p)=>s+outstandingOf(p),0);
  const pendingCount = DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,mo)).length;
  const paidCount = DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,mo)).length;
  const overdue = 0; // overdue feature removed
  // Expenses INCLUDE funds transfers — a transfer is money out of the same till.
  const moExp = calcExpenses(mo);
  // …so the item count has to count both too. It used to count DB.expenses
  // alone while the value beside it carried the transfers as well, which is why
  // the card could read "PKR 84,000 · 3 items" over four actual records.
  const moExpCount = DB.expenses.filter(e => String(e.date||'').startsWith(mo)).length
                   + (DB.transfers||[]).filter(t => String(t.date||'').startsWith(mo)).length;
  const totalExpected = collected + pending;
  const netProfit = collected - moExp;

  // Seat calculations
  const totalSeats = DB.rooms.reduce((s,r)=>{ const t=DB.settings.roomTypes.find(x=>x.id===r.typeId); return s+(t?t.capacity:1); }, 0);
  const allActiveSeats = DB.students.filter(t=>t.status==='Active').length; // badge: counts ALL active including force-added
  const filledSeats = DB.students.filter(t=>t.status==='Active' && !t.isForced).length; // for available seat math only
  const availSeats = totalSeats - filledSeats;
  const seatPct = totalSeats>0 ? Math.round(filledSeats/totalSeats*100) : 0;
  // Admissions dated inside the current month — the "N new this month" line on
  // the Total Residents card.
  const newThisMonth = DB.students.filter(t => String(t.joinDate||'').startsWith(mo)).length;

  // Per-room-type seat breakdown.
  // type.color is DATA (owner-configured per room type), not styling — it stays
  // the literal colour for the icon, the bar fill and the percentage.
  // _rtTint() builds the pale chip background from it. Only 6-digit hex can take
  // an alpha suffix; anything else (a stored rgb()/named colour) falls back to
  // the neutral track colour rather than emitting a broken value.
  const _rtTint = c => (/^#[0-9a-f]{6}$/i.test(String(c||'')) ? c + '22' : 'var(--dash-track)');
  const _rtBed = `<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M19 7h-7a3 3 0 0 0-3 3v3H5V8a1 1 0 0 0-2 0v9a1 1 0 0 0 2 0v-2h14v2a1 1 0 0 0 2 0v-6a4 4 0 0 0-4-4ZM7 9a2 2 0 1 1 2 2 2 2 0 0 1-2-2Z"/></svg>`;

  let seatBreakdown = '';
  DB.settings.roomTypes.forEach(type => {
    const tRooms = DB.rooms.filter(r=>r.typeId===type.id);
    const typeTotalSeats = tRooms.length * type.capacity;
    const typeFilledSeats = DB.students.filter(t=>t.status==='Active'&&!t.isForced&&tRooms.some(r=>r.id===t.roomId)).length;
    const typeAvail = typeTotalSeats - typeFilledSeats;
    const typePct = typeTotalSeats>0?Math.round(typeFilledSeats/typeTotalSeats*100):0;
    seatBreakdown += `
      <div class="rt-row" title="${escHtml(type.name)} — ${typeFilledSeats}/${typeTotalSeats} seats filled, ${typeAvail} free">
        <span class="rt-row__ic" style="background:${escHtml(_rtTint(type.color))};color:${escHtml(type.color)}">${_rtBed}</span>
        <span class="rt-row__name">${escHtml(type.name)}</span>
        <span class="rt-row__rooms">${tRooms.length} room${tRooms.length===1?'':'s'}</span>
        <span class="rt-row__bar"><i style="width:${typePct}%;background:${escHtml(type.color)}"></i></span>
        <span class="rt-row__pct" style="color:${typePct>0?escHtml(type.color):'var(--text)'}">${typePct}%</span>
      </div>`;
  });

  const recentPay = [...DB.payments].filter(p=>_payMatchesMonth(p,mo)).sort((a,b)=>new Date(b.date||b.dueDate)-new Date(a.date||a.dueDate)).slice(0,10);

  // Room type summary
  let roomTypeSummary = '';
  DB.settings.roomTypes.forEach(type=>{
    const tRooms = DB.rooms.filter(r=>r.typeId===type.id);
    const tOcc = tRooms.filter(r=>getRoomOccupancy(r)>0).length;
    const pct = tRooms.length ? Math.round(tOcc/tRooms.length*100) : 0;
    roomTypeSummary+=`<div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(type.name)}</div>
        <div style="font-size:22px;font-weight:900;color:${escHtml(type.color)}">${tRooms.length}</div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${tOcc} occupied · ${tRooms.length-tOcc} vacant</div>
      <div class="room-occ-track"><div class="room-occ-fill" style="width:${pct}%;background:${escHtml(type.color)}"></div></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px;text-align:right">${pct}% occupied</div>
      <div style="font-size:12px;font-weight:700;color:var(--green);margin-top:6px">${fmtPKR(type.defaultRent)}/mo</div>
    </div>`;
  });

  // Seats availability bar chart data
  // Soonest departure first: this is an act-on-it banner, so the student whose
  // date arrives next is the one the warden needs to see.
  const pendingCancels = (DB.cancellations||[]).filter(c=>c.status==='Pending')
    .slice().sort((a,b)=>String(a.vacateDate||'9999').localeCompare(String(b.vacateDate||'9999')));
  const _nextVacate = (pendingCancels.find(c=>c.vacateDate)||{}).vacateDate || '';

  // Real 12-month series behind the KPI sparklines + the revenue MoM delta.
  const series   = _dashSeries();
  const revDelta = _dashDelta(series.rev);

  /* The four ledger panels and the occupancy card are built here rather than
     inline because the sketch spreads them across three different rows: Today
     at a Glance rides with the trend, Needs Action and Quick Actions sit in the
     occupancy row, and Collection by Method pairs with Pending Payments. */
  const P = _dashLedgerRow(mo, pending, pendingCount);
  const occCard = _dashOccupancyOverview(totalSeats, filledSeats, availSeats, seatPct);

  return `
  ${''/* The pending-cancellations banner that stood here is gone, and so is the
         `alertHtml` strip that was computed below it. Owner's call, 2026-08-31:
         "dont show the banners for cancellations or others because it lowers
         the other screen content".

         Nothing is lost. `chromeAlerts()` in nav.js already builds the SAME set
         — pending payments, open maintenance, unresolved complaints, pending
         cancellations, low occupancy — and the header bell renders it with a
         count. These banners were a second copy of that feed, sitting above the
         KPI row and pushing every figure on the dashboard toward the fold. A
         duplicate that costs the primary content its position is not a second
         chance to be seen; it is a tax on the screen that matters.

         `alertHtml` was already dead — computed on every render and never once
         interpolated. It is deleted rather than left to look load-bearing. */}

  <!-- ══ ROW 1: KPI FINANCIAL CARDS ══ -->
  <div class="dash-kpi-grid">

    <!-- Total Residents — blue. Design guide §8 opens the KPI row with the
         people, not the money: a hostel is beds before it is rupees, and every
         figure to its right is a consequence of this one. -->
    <div onclick="navigate('students')" class="dsh-card dsh-card--click dh-blue">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 5v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2c0-3-4-5-8-5Z"/></svg></div>
        <div class="dash-kpi__label">Total<br>Residents</div>
        <div class="dash-pill-stack">
          <span class="dash-pill ${seatPct>=90?'dh-red':seatPct>=70?'dh-green':'dh-amber'}">${seatPct}% full</span>
        </div>
      </div>
      <!-- A headcount, so no currency prefix — the money-value classes are
           reused for the typography only. -->
      <div class="dash-kpi__value"><span class="money-value money-value--display"><span class="money-amt">${fmtNum(allActiveSeats)}</span></span><span style="font-size:13px;font-weight:500;color:var(--text3);margin-left:6px">of ${fmtNum(totalSeats)} beds</span></div>
      <div class="dash-track"><div class="dash-track__fill" style="width:${seatPct}%"></div></div>
      <div class="dash-kpi__sub">${newThisMonth>0?`▲ ${newThisMonth} new this month`:'No new admissions this month'}</div>
    </div>

    <!-- Total Revenue — blue -->
    <div onclick="navigate('payments')" class="dsh-card dsh-card--click dh-blue">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 7H6a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-3 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM6 5h13a1 1 0 0 0 0-2H6a6 6 0 0 0-6 6v6a6 6 0 0 0 6 6h14a2 2 0 0 0 2-2v-1a1 1 0 0 0-2 0v1H6a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Z"/></svg></div>
        <div class="dash-kpi__label">Total<br>Revenue</div>
        <div class="dash-pill-stack">
          ${revDelta!==null?`<span class="dash-pill ${revDelta>=0?'dh-green':'dh-red'}">${revDelta>=0?'+':''}${revDelta.toFixed(1)}%</span>`:''}
          <span class="dash-pill dh-slate">${paidCount} paid</span>
        </div>
      </div>
      <div class="dash-kpi__value">${moneyValue(collected,{size:"display",compact:true})}</div>
      <div class="dash-track"><div class="dash-track__fill" style="width:${totalExpected>0?Math.round(collected/totalExpected*100):0}%"></div></div>
      <div class="dash-kpi__sub" title="of PKR ${fmtNum(totalExpected)} expected">of <span class="pkr">PKR</span>${fmtCompact(totalExpected)} expected</div>
    </div>

    <!-- Expenses — red. Money OUT sits immediately after money IN and before
         what is left of it: the Available Fund card next door states its own
         figure as "collected − expenses", and it used to sit to the LEFT of the
         expenses it subtracts, so the row asked the reader to hold a number
         that had not been shown yet. -->
    <div onclick="navigate('expenses')" class="dsh-card dsh-card--click dh-red">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M22.92 15.62a1 1 0 0 1-.55.55 1 1 0 0 1-.37.08h-5a1 1 0 0 1 0-2h2.59L14 8.41l-3.29 3.3a1 1 0 0 1-1.42 0l-6-6a1 1 0 1 1 1.42-1.42L10 9.59l3.29-3.3a1 1 0 0 1 1.42 0L20 11.59V9a1 1 0 0 1 2 0v6a1 1 0 0 1-.08.62Z"/></svg></div>
        <div class="dash-kpi__label">Expenses</div>
        <div class="dash-pill-stack"><span class="dash-pill">${moExpCount} item${moExpCount===1?'':'s'}</span></div>
      </div>
      <div class="dash-kpi__value">${moneyValue(moExp,{size:"display",compact:true})}</div>
      <div class="dash-kpi__sub">this month</div>
      ${_dashSpark(series.exp)}
    </div>

    <!-- Available Fund — green when in profit, red when the fund is negative
         (a negative fund is genuine danger, not decoration) -->
    <div onclick="navigate('reports')" class="dsh-card dsh-card--click ${netProfit>=0?'dh-green':'dh-red'}">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 13a1 1 0 0 1 1 1v6a1 1 0 0 1-2 0v-6a1 1 0 0 1 1-1Zm7-9a1 1 0 0 1 1 1v15a1 1 0 0 1-2 0V5a1 1 0 0 1 1-1Zm7 4a1 1 0 0 1 1 1v11a1 1 0 0 1-2 0V9a1 1 0 0 1 1-1Z"/></svg></div>
        <div class="dash-kpi__label">Available<br>Fund</div>
        <div class="dash-pill-stack"><span class="dash-pill">${netProfit>=0?'Profit':'Loss'}</span></div>
      </div>
      <div class="dash-kpi__value">${moneyValue(netProfit,{size:"display",compact:true})}</div>
      ${''/* Compact, and for a sharper reason than the others: this line is
             TWO figures with a minus between them, so it is the first thing on
             the row to wrap — at real hostel scale it took two lines on its own
             and made every card in the row taller, which is what pushed Needs
             Action and Quick Actions under the fold. */}
      <div class="dash-kpi__sub" title="${fmtPKR(collected)} − ${fmtPKR(moExp)}">
        PKR ${fmtCompact(collected)} − PKR ${fmtCompact(moExp)}
      </div>
      <!-- This was the only money card with no history behind it, so it sat
           visibly emptier than the four beside it. The series is the same
           subtraction the headline states, month by month — nothing new is
           computed here, and _dashSpark scales to min/max so the months the
           fund ran negative still read. -->
      ${_dashSpark(series.rev.map((v,i)=>v-(series.exp[i]||0)))}
    </div>

    <!-- Pending — amber -->
    <div onclick="navigate('payments')" class="dsh-card dsh-card--click dh-amber">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18 22H6a1 1 0 0 1-1-1v-2a5 5 0 0 1 2.69-4.43L9.3 14l-1.6-.57A5 5 0 0 1 5 9V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a5 5 0 0 1-2.7 4.43L14.7 14l1.6.57A5 5 0 0 1 19 19v2a1 1 0 0 1-1 1ZM7 20h10v-1a3 3 0 0 0-1.62-2.66l-3-1.07a1 1 0 0 1 0-1.88l3-1.07A3 3 0 0 0 17 9V8H7v1a3 3 0 0 0 1.62 2.66l3 1.07a1 1 0 0 1 0 1.88l-3 1.07A3 3 0 0 0 7 19Z"/></svg></div>
        <div class="dash-kpi__label">Pending</div>
        <div class="dash-pill-stack">
          <span class="dash-pill">${totalExpected>0?Math.round(pending/totalExpected*100):0}%</span>
          <span class="dash-pill">${pendingCount} unpaid</span>
        </div>
      </div>
      <div class="dash-kpi__value">${moneyValue(pending,{size:"display",compact:true})}</div>
      <div class="dash-kpi__sub">click to collect</div>
      ${_dashSpark(series.pend)}
    </div>

    <!-- Cash Received — the sixth tile the sketch asks for.
         Deliberately the LAST one, and deliberately next to Revenue: this is
         the cash-basis figure (what should physically be in the drawer this
         month) while Revenue is accrual (what this month earned). The two
         differ whenever rent for August is handed over in September, and that
         is normal rather than a fault — cashBreakdown() carries the split, and
         the sub-line names it so the number beside Revenue never reads as a
         contradiction. -->
    <div onclick="showCashReceivedModal()" class="dsh-card dsh-card--click dh-green">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm-8 9a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z"/></svg></div>
        <div class="dash-kpi__label">Cash<br>Received</div>
        <div class="dash-pill-stack">
          <span class="dash-pill dh-slate">${fmtNum(cashIn.count)} receipt${cashIn.count===1?'':'s'}</span>
        </div>
      </div>
      <div class="dash-kpi__value">${moneyValue(cashIn.total,{size:"display",compact:true})}</div>
      <div class="dash-track"><div class="dash-track__fill" style="width:${cashIn.total>0?Math.round(cashIn.current/cashIn.total*100):0}%"></div></div>
      <div class="dash-kpi__sub"${cashIn.arrears>0?` title="incl. ${fmtPKR(cashIn.arrears)} arrears"`:''}>${cashIn.arrears>0?`incl. <span class="pkr">PKR</span>${fmtCompact(cashIn.arrears)} arrears`:'in the drawer this month'}</div>
      ${''/* Opens showCashReceivedModal(), NOT the payments page. Cash Received
             used to be a tile in the stat row this KPI replaced, and that tile
             opened a reconciliation that balances the drawer against the books.
             Losing that on the way into the KPI row would have quietly removed
             the only screen that explains why this figure and Total Revenue
             differ. tests/counter-flow-decisions.spec.js asserts it. */}
      ${_dashSpark(series.cash)}
    </div>
  </div>

  ${''/* The Occupied / Vacant / Active tile row that sat here is GONE.

     It cost a full row of height to repeat three figures the page already
     answers better further down: Occupancy Overview gives beds occupied and
     free against the total, Seat Availability gives it room by room, and
     Occupancy by Room Type breaks it down by type. Three ways of saying the
     same thing, and the first of them was the least useful.

     The row also made the sketch's fold impossible. The brief is that Needs
     Actions and Quick Actions must be on screen without scrolling, and 120-odd
     pixels of duplicate stats is exactly what was pushing them under. Rooms
     remain one click away on the sidebar and on the Seat Availability card. */}
  <!-- ══ ROW B: TREND · SEAT AVAILABILITY · TODAY AT A GLANCE ══ -->
  <div class="dash-row-b">
  <div class="dash-sec">
    <!-- Header: title + legend -->
    <div class="dash-sec__head">
      <div class="dash-chip dh-blue" style="width:30px;height:30px;border-radius:9px"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M22 7v6a1 1 0 0 1-2 0v-3.59l-6.29 6.3a1 1 0 0 1-1.42 0L9 12.41l-5.29 5.3a1 1 0 1 1-1.42-1.42l6-6a1 1 0 0 1 1.42 0L13 13.59l5.59-5.59H15a1 1 0 0 1 0-2h6a1 1 0 0 1 1 1Z"/></svg></div>
      <span class="dash-sec__title">Revenue Trend</span>
      <div class="dash-legend" style="margin-left:auto">
        <!-- TWO SERIES, and the legend says two (design 1c, "bars instead of
             lines"). Pending was dropped from the chart rather than redrawn as
             a third bar: it is not a monthly flow like the other two — it is
             what has NOT arrived yet, so a bar of it sitting beside collected
             revenue invites adding them together into a figure the ledger never
             held. It keeps its own KPI card, and the hover badge still reports
             it per month.

             The chips must match what is actually drawn (guide §12). This
             legend advertised four series for a long time while one line was
             drawn; a legend that describes something else is how a reader stops
             trusting the panel. -->
        <span class="dash-legend__k dh-blue"><i></i>Revenue</span>
        <span class="dash-legend__k dh-slate"><i></i>Expenses</span>
      </div>
      <!-- db3's segmented control. It replaces a static "Jan – Dec" caption:
           the reference has a control here, and the caption only restated the
           axis directly under it. -->
      <div class="trend-range" role="group" aria-label="Chart range">
        ${''/* The active state is read from _dashTrendRange, not hard-coded on
               Year. renderPage() rebuilds this markup on every navigation while
               the range variable survives, so a hard-coded default would light
               "Year" over a chart still drawing a quarter. */}
        <button class="trend-range__b ${_dashTrendRange==='quarter'?'is-on':''}" data-range="quarter" onclick="setTrendRange('quarter')">Quarter</button>
        <button class="trend-range__b ${_dashTrendRange==='6m'?'is-on':''}"      data-range="6m"      onclick="setTrendRange('6m')">6 Months</button>
        <button class="trend-range__b ${_dashTrendRange==='year'?'is-on':''}"    data-range="year"    onclick="setTrendRange('year')">Year</button>
      </div>
    </div>
    ${''/* The Revenue / Expenses / Net strip that sat here is REMOVED. db3.png
           does not have it, and all three figures are already on the KPI row
           two inches above — Total Revenue, Expenses & Transfers, Available
           Fund, which IS net. Printing them again directly under the chart put
           the same three numbers on screen twice and cost the chart the height
           it needed to stay legible when the row was compressed. */}
    <!-- Chart.js canvas -->
    <div id="trend-chart-wrap" style="position:relative">
      <div id="trend-hb" style="position:fixed;background:var(--card2);border:1px solid var(--border2);border-radius:10px;padding:12px 14px;font-size:12px;pointer-events:none;display:none;z-index:9999;min-width:210px;box-shadow:var(--shadow);"></div>
      <canvas id="trend-canvas" style="display:block"></canvas>
    </div>
  </div>

  <!-- Seat availability — interactive room grid -->
    <div class="dash-sec">
      <div class="dash-sec__head">
        <div class="dash-chip dh-violet" style="width:30px;height:30px;border-radius:9px"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M19 7h-7a3 3 0 0 0-3 3v3H5V8a1 1 0 0 0-2 0v9a1 1 0 0 0 2 0v-2h14v2a1 1 0 0 0 2 0v-6a4 4 0 0 0-4-4ZM7 9a2 2 0 1 1 2 2 2 2 0 0 1-2-2Z"/></svg></div>
        <span class="dash-sec__title">Seat Availability</span>
        <!-- db3 puts the three counts INLINE here, not in a block of tiles
             below. Same three numbers, one line instead of ~70px of card, and
             the height goes to the room grid — which is what the owner asked
             for: more rooms visible. Each is still the click target it was. -->
        <div class="seat-inline">
          <button class="seat-inline__k" onclick="showSeatDetailModal('rooms')" title="All seats">
            <b>${totalSeats}</b><span>Total</span></button>
          <button class="seat-inline__k dh-green" onclick="showSeatDetailModal('vacant')" title="Free seats">
            <b>${availSeats}</b><span>Free</span></button>
          <button class="seat-inline__k" onclick="showSeatDetailModal('occupied')" title="Filled seats">
            <b>${allActiveSeats}</b><span>Filled</span></button>
        </div>
      </div>
      ${''/* The three-tile summary block that stood here is gone — the same
             counts now sit inline in the header above, as db3 draws them. That
             is ~70px of card returned to the room grid, and it is why the grid
             shows roughly twice as many rooms before it scrolls.

             Print and Expand went with it. Neither is in db3, both were the
             only two buttons on any card header in row B, and both are still
             reachable: Expand is what tapping any room or any of the three
             counts already does, and Print lives on the Rooms page. */}
      <!-- Per-room mini tiles -->
      <div class="dash-room-wrap">
        ${DB.rooms.map(r=>{
          const rtype2=getRoomType(r);
          const cap=rtype2?.capacity||1;
          const occ2=getRoomOccupancy(r);
          const free=cap-occ2;
          const isFull=free===0;
          return `<div onclick="showRoomSeatDetailModal('${r.id}')" title="Room #${escHtml(String(r.number))} — ${occ2}/${cap} filled, ${free} free — click to edit" class="dash-room dh-violet${isFull?' is-full':''}">
            <div class="n">${escHtml(String(r.number))}</div>
            <div class="c">${occ2}/${cap}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:12px;margin-top:9px;flex-wrap:wrap;align-items:center">
        <span class="dash-key dh-violet"><i></i>Has free seats</span>
        <span class="dash-key dh-slate"><i></i>Full</span>
        <span style="font-size:10px;color:var(--text3);margin-left:auto;display:inline-flex;align-items:center;gap:3px"><svg class="icon icon-xs" viewBox="0 0 24 24" fill="currentColor"><path d="M10 2a3 3 0 0 0-3 3v6.17l-.88-.88a2.5 2.5 0 0 0-3.54 3.54l5.5 5.5A5 5 0 0 0 11.54 21H15a5 5 0 0 0 5-5v-5a3 3 0 0 0-5-2.24V8a3 3 0 0 0-3-3 2.94 2.94 0 0 0-1 .18V5a3 3 0 0 0-1-3Z"/></svg> tap any room</span>
      </div>
    </div>
  ${P.glance}
  </div><!-- end row B -->

  <!-- ══ ROW C: THE FOLD LINE ══
       Everything above this, plus this row, must fit one screen — the owner's
       brief is that Needs Action and Quick Actions are reachable without
       scrolling. Recent Payments is the first thing below it, deliberately:
       it is a log, and a log is what you scroll TO. -->
  <div class="dash-row-c">
  <div class="dash-sec">
    <div class="dash-sec__head" style="margin-bottom:4px">
      <div class="dash-chip dh-blue" style="width:34px;height:34px;border-radius:10px"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px"><path d="M19 7h-7a3 3 0 0 0-3 3v3H5V8a1 1 0 0 0-2 0v9a1 1 0 0 0 2 0v-2h14v2a1 1 0 0 0 2 0v-6a4 4 0 0 0-4-4ZM7 9a2 2 0 1 1 2 2 2 2 0 0 1-2-2Z"/></svg></div>
      <div style="min-width:0">
        <div class="dash-sec__title">Occupancy by Room Type</div>
        <div class="dash-sec__sub">Overview of seat occupancy by room type</div>
      </div>
      <span class="rt-full ${seatPct>=90?'is-high':''}" style="margin-left:auto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/></svg>
        ${seatPct}% Full
      </span>
    </div>

    <div class="rt-body">
      <div class="rt-left">
        <div class="rt-donut">
          <!-- No width/height attributes: the chart is responsive:true, so
               Chart.js sizes the backing store to this box and to the device
               pixel ratio itself. Hard-coding them made it lay out against the
               attribute size and draw the ring smaller than, and off-centre in,
               its container. -->
          <canvas id="dash-roomtype-donut"></canvas>
          <div class="rt-donut__c">
            <div class="rt-donut__n">${filledSeats}<span>/${totalSeats}</span></div>
            <div class="rt-donut__l">Seats Occupied</div>
          </div>
        </div>
        <div class="rt-stat">
          <span class="rt-stat__ic dh-blue"><svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-3-4-5-8-5Z"/></svg></span>
          <div class="rt-stat__c"><b>${filledSeats}</b><span>Occupied</span></div>
          <div class="rt-stat__sep"></div>
          <div class="rt-stat__c"><b>${totalSeats}</b><span>Total Seats</span></div>
        </div>
        <div class="rt-avail"><i></i><b>${availSeats}</b> Seats Available</div>
      </div>

      <div class="rt-right">
        <div class="rt-list__hd">
          <span>Room Type</span>
          <span class="rt-list__hd-rooms">Rooms</span>
          <span class="rt-list__hd-occ">Occupancy</span>
        </div>
        ${seatBreakdown}
      </div>
    </div>

    <div class="rt-note">
      <span class="rt-note__ic"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 5a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 12 7Zm1.5 10h-3a1 1 0 0 1 0-2h.5v-3h-.5a1 1 0 0 1 0-2H12a1 1 0 0 1 1 1v4h.5a1 1 0 0 1 0 2Z"/></svg></span>
      Occupancy percentage is calculated based on available seats in each room type.
    </div>
  </div>
  ${occCard}
  ${P.needs}
  ${P.actions}
  </div><!-- end row C -->

  <!-- ══ ROW D: COLLECTION BY METHOD + PENDING PAYMENTS ══ -->
  <div class="dash-split">
  ${P.methods}
  <div class="dash-sec" style="display:flex;flex-direction:column">
      <div class="dash-sec__head">
        <div class="dash-chip dh-amber" style="width:30px;height:30px;border-radius:9px"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 10.59 3.7 3.71a1 1 0 0 1-1.4 1.42L11 13.41V6a1 1 0 0 1 2 0Z"/></svg></div>
        <span class="dash-sec__title">Pending Payments</span>
        <span class="dash-pill dh-slate">${pendingCount}</span>
        ${pendingCount>0?`<button class="dash-link" style="margin-left:auto" onclick="navigate('payments')">View All</button>`:''}
      </div>
      <div style="flex:1;overflow-y:auto;max-height:288px">
      ${(()=>{const moPending=DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,mo));return moPending.length===0?
        '<div style="padding:32px;text-align:center;color:var(--text3)"><div style="margin-bottom:10px;color:var(--green)"><svg class="icon icon-xl" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.71 8.71-6 6a1 1 0 0 1-1.42 0l-3-3a1 1 0 1 1 1.42-1.42L11 14.59l5.29-5.3a1 1 0 0 1 1.42 1.42Z"/></svg></div><div style="font-size:14px;font-weight:600">All cleared!</div></div>':
        moPending.slice(0,10).map(p=>{
          const unpaidShow = outstandingOf(p);
          const due = _dashDueState(p);
          const nm  = String(p.studentName||'?');
          const ini = nm.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase() || '?';
          return '<div class="dash-pay">'
          +'<div class="dash-av '+_dashAvatarHue(nm)+'">'+escHtml(ini)+'</div>'
          +'<div class="dash-pay__id" onclick="showViewStudentModal(\''+p.studentId+'\')">'
          +'<div class="dash-pay__name">'+escHtml(p.studentName||'')+'</div>'
          +'<div class="dash-pay__room">Room '+escHtml(p.roomNumber||'?')+' · '+escHtml(p.month||'—')+'</div>'
          +'</div>'
          +'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:8px">'
          +'<div>'
          +'<div class="dash-pay__amt">'+fmtPKR(unpaidShow)+'</div>'
          +'<div class="dash-pay__due">'+(p.dueDate?'Due: '+fmtDate(p.dueDate):'unpaid')+'</div>'
          +'</div>'
          +'<span class="dash-status '+due.hue+'">'+due.label+'</span>'
          +'<button class="dash-icon-btn dh-green" onclick="event.stopPropagation();markPaymentPaid(\''+p.id+'\');renderPage(\'dashboard\')" title="Mark paid"><svg class=\"icon icon-xs\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.71 8.71-6 6a1 1 0 0 1-1.42 0l-3-3a1 1 0 1 1 1.42-1.42L11 14.59l5.29-5.3a1 1 0 0 1 1.42 1.42Z\"/></svg></button>'
          +'<button class="dash-icon-btn dh-slate" onclick="event.stopPropagation();showEditPaymentModal(\''+p.id+'\')" title="Edit"><svg class=\"icon icon-xs\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"m20.71 7.04-2.75-2.75a1 1 0 0 0-1.41 0L4.29 16.55a1 1 0 0 0-.29.71V20a1 1 0 0 0 1 1h2.74a1 1 0 0 0 .71-.29L20.71 8.46a1 1 0 0 0 0-1.42Z\"/></svg></button>'
          +'</div></div>';
        }).join('')})()}
      </div>
      ${pendingCount>0?`<div style="padding-top:11px;border-top:1px solid var(--border);margin-top:auto"><button class="btn btn-sm" style="width:100%;background:linear-gradient(135deg,var(--accent),var(--accent-strong));color:#fff;border:none;border-radius:10px;font-weight:700;letter-spacing:.2px" onclick="showRentReminderModal()"><svg class=\"icon icon-xs\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2a10 9 0 0 0-10 9 8.76 8.76 0 0 0 3 6.55V21a1 1 0 0 0 1.49.87L9.85 20A10.66 10.66 0 0 0 12 20a10 9 0 0 0 10-9 10 9 0 0 0-10-9Z\"/></svg> Send Rent Reminder</button></div>`:''}
    </div>
  </div><!-- end row3+4 grid -->

  <!-- ══ ROW 5: THE LEDGER ROW (design 1c) ══ -->

  <!-- ══ ROW 6: RECENT PAYMENTS ══ -->
  ${_dashRecentPayments(recentPay, mo, collected)}`;
}

/* ══ THE LEDGER ROW — design 1c ══════════════════════════════════════════════
   Four panels the dashboard did not have, from the "Ledger" direction of the
   Hostyllo Dashboard design doc: Today at a Glance, Collection by Method,
   Upcoming Reminders, Quick Actions.

   ONE RULE GOVERNS ALL FOUR, and it is the reason this section is longer than
   the markup it produces: every figure here is COMPUTED FROM A RECORD THIS
   HOSTEL ACTUALLY HOLDS. The reference render shows a "Mess Committee Meeting"
   and an "Electricity Bill Due" that no table in this app can produce; a
   dashboard that prints those because a mockup did is exactly the failure that
   put the reconstruction mandate in place. Where a source does not exist the
   panel says so and shows nothing.

   The one place the mockup was followed and should NOT have been: it listed an
   upcoming "Room Inspection". `DB.inspections` rows record an inspection that
   HAS HAPPENED — they carry a condition, an inspector and findings, and have no
   scheduled-date field at all. There was no upcoming inspection to read, which
   is part of why that panel is now Needs Action: everything it lists is a row
   that already exists in a table, waiting on a decision.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Counts for "Today at a Glance" — six figures, each from its own table. */
function _dlGlance() {
  const td = today();
  const isToday = d => String(d || '').slice(0, 10) === td;
  const log = DB.checkinlog || [];
  // A payment's `date` is when it was taken. Pending rows have no date yet, so
  // they cannot be "received today" and must not be counted here.
  const paidToday = (DB.payments || []).filter(p => p.status === 'Paid' && isToday(p.date));
  /* `page: null` means THERE IS NOWHERE TO GO, and the row is rendered as plain
     text rather than a button.

     The check-in log is reachable from Settings but is not a page in nav.js's
     PAGES table, so `navigate('checkinlog')` lights nothing in the rail and
     lands on a screen with no title. A row that looks clickable and does
     nothing is worse than a row that never offered — especially on a dashboard,
     where a warden learns in one click whether the numbers are wired to
     anything. */
  return [
    { k: 'in',    label: 'Check-ins',           n: log.filter(c => isToday(c.date) && c.type !== 'Check-out').length, page: null },
    { k: 'out',   label: 'Check-outs',          n: log.filter(c => isToday(c.date) && c.type === 'Check-out').length, page: null },
    { k: 'new',   label: 'New Admissions',      n: (DB.students || []).filter(s => isToday(s.joinDate)).length,       page: 'students' },
    { k: 'money', label: 'Payments Received',   n: paidToday.length, money: paidToday.reduce((s, p) => s + Number(p.amount || 0), 0), page: 'payments' },
    { k: 'issue', label: 'Complaints Raised',   n: (DB.complaints || []).filter(c => isToday(c.date || c.createdAt)).length,  page: 'issues' },
    { k: 'wrench',label: 'Maintenance Requests',n: (DB.maintenance || []).filter(m => isToday(m.date || m.createdAt)).length, page: 'maintenance' },
  ];
}

/** Payments settled this month, grouped by method. Shares `calcRevenue`'s month test. */
function _dlMethods(mo) {
  const paid = (DB.payments || []).filter(p => p.status === 'Paid' && _payMatchesMonth(p, mo));
  const total = paid.reduce((s, p) => s + Number(p.amount || 0), 0);
  const byName = new Map();
  for (const p of paid) {
    // An empty method is "Other" rather than a blank row: the figure is real
    // money and must still be shown, just not under an invented name.
    const name = String(p.method || '').trim() || 'Other';
    byName.set(name, (byName.get(name) || 0) + Number(p.amount || 0));
  }
  const rows = [...byName.entries()]
    .map(([name, amount]) => ({ name, amount, pct: total > 0 ? (amount / total * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
  return { rows, total };
}

/* UPCOMING REMINDERS IS GONE, replaced by Needs Action (2026-09-05).

   _dlReminders() and its panel are deleted rather than left computing into
   nothing — the same call this file made about `alertHtml`. The reminders
   listed what was COMING; Needs Action lists what is already waiting on a
   decision and names the decision, which is the more useful of the two on a
   dashboard a warden opens to find out what to do next. Git has the old
   function if the "what is coming" view is ever wanted back as its own card.

   `.dl-rem*` stays in dashboard.css for the same reason — it is a complete,
   working panel style with nothing to bring back but markup. */

function _dlIco(k) {
  const P = {
    in:    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    out:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    new:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    money: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    issue: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    cancel:'<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    bed:   '<path d="M2 8v12"/><path d="M2 17h20v3"/><path d="M6 8v9"/><path d="M2 11h14a4 4 0 0 1 4 4v2"/><circle cx="9" cy="11" r="0"/>',
    wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    due:   '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    note:  '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    add:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    card:  '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    spend: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    room:  '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    report:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><rect x="7" y="13" width="9" height="4" rx="1"/><rect x="7" y="5" width="12" height="4" rx="1"/>',
  };
  return '<svg class="dl-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (P[k] || '') + '</svg>';
}

function _dashLedgerRow(mo, pending, pendingCount) {
  const glance    = _dlGlance();
  const methods   = _dlMethods(mo);

  const glanceRows = glance.map(g => {
    /* The payments row reports TWO facts — how many arrived and how much they
       came to — and at a quarter of 1366px they do not fit on one line: the
       label truncated to "Payments Recei…" beside the figure. Stacking the
       amount under the label keeps both, and keeps the right-hand column a
       column of counts, so the six rows still read down as one list rather than
       five counts and one sum. */
    const inner =
      '<span class="dl-glance__ic">' + _dlIco(g.k) + '</span>'
      + '<span class="dl-glance__body">'
        + '<span class="dl-glance__label">' + escHtml(g.label) + '</span>'
        + (g.money != null && g.money > 0
            /* Compact: this sits in a column one KPI tile wide, and a real
               month's takings spelled out in full wrapped it onto three lines
               and pushed the six rows out of the card. The exact figure is on
               the Payments screen this row links to. */
            ? '<span class="dl-glance__sub dl-money" title="' + fmtPKR(g.money) + '">PKR '
              + fmtCompact(g.money) + '</span>' : '')
      + '</span>'
      + '<span class="dl-glance__n">' + fmtNum(g.n) + '</span>';
    return g.page
      ? '<button class="dl-glance__row" onclick="navigate(\'' + g.page + '\')">' + inner + '</button>'
      : '<div class="dl-glance__row dl-glance__row--static">' + inner + '</div>';
  }).join('');

  const methodRows = methods.rows.length
    ? methods.rows.map(m =>
        '<div class="dl-meth__row">'
        + '<span class="dl-meth__name">' + escHtml(m.name) + '</span>'
        + '<span class="dl-meth__bar"><i style="width:' + m.pct.toFixed(1) + '%"></i></span>'
        + '<span class="dl-meth__pct">' + m.pct.toFixed(1) + '%</span>'
        + '<span class="dl-meth__amt">' + fmtPKR(m.amount) + '</span>'
        + '</div>').join('')
    : '<div class="dl-empty">No payments settled this month yet.</div>';

  /* QUICK ACTIONS — four, per the owner's `quick.png`.

     It was six (Add Student, Add Payment, Add Expense, Complaints, Rooms,
     Reports). Add Student already sits in the header as the page's one primary
     button, and Rooms and Reports are permanent sidebar entries — so half the
     panel was a third route to somewhere already on screen twice. The four
     that remain are the ones with no other one-click home: the two things a
     warden posts during the day, and the two things they raise. */
  const actions = [
    { k: 'card',   label: 'Add Payment',  fn: "navigate('payments')" },
    { k: 'spend',  label: 'Add Expense',  fn: "navigate('expenses')" },
    { k: 'issue',  label: 'Complaints',   fn: "navigate('issues')"   },
    { k: 'cancel', label: 'Cancellation', fn: "navigate('cancellations')" },
  ].map(a =>
    '<button class="dl-act" onclick="' + a.fn + '">'
    + '<span class="dl-act__ic">' + _dlIco(a.k) + '</span>'
    + '<span class="dl-act__label">' + escHtml(a.label) + '</span></button>').join('');

  /* NEEDS ACTION — the sketch replaces Upcoming Reminders with this, and it is
     the better card. Reminders listed what was COMING; this lists what is
     already waiting on a decision, and every row names the decision rather
     than just the count. A warden reading "13 pending payments" still has to
     work out what to do about it; "Collect" does not.

     Rows with a count of zero are dropped rather than shown as 0. A clean
     queue should disappear, not sit there claiming attention it does not
     need — and when all four are clear the panel says so in one line. */
  const needs = [
    { k:'cancel', tone:'amber',  n:(DB.cancellations||[]).filter(c=>c.status==='Pending').length,
      noun:'pending cancellation', verb:'View',    page:'cancellations' },
    { k:'card',   tone:'red',    n:pendingCount,
      noun:'pending payment',      verb:'Collect', page:'payments' },
    { k:'issue',  tone:'violet', n:(DB.complaints||[]).filter(c=>c.status==='Open').length,
      noun:'open complaint',       verb:'Resolve', page:'issues' },
    { k:'wrench', tone:'blue',   n:(DB.maintenance||[]).filter(m=>m.status==='Open').length,
      noun:'open maintenance',     verb:'Assign',  page:'issues' },
  ].filter(r => r.n > 0);

  const needsRows = needs.length
    ? needs.map(r =>
        '<button class="dl-need" onclick="navigate(\'' + r.page + '\')">'
        + '<span class="dl-need__ic dh-' + r.tone + '">' + _dlIco(r.k) + '</span>'
        + '<span class="dl-need__n">' + fmtNum(r.n) + '</span>'
        + '<span class="dl-need__label">' + escHtml(r.noun) + (r.n === 1 ? '' : 's') + '</span>'
        + '<span class="dl-need__verb">' + escHtml(r.verb) + '</span>'
        + '</button>').join('')
    : '<div class="dl-empty">Nothing is waiting on you right now.</div>';

  return {
    glance:
        '<div class="dash-sec dl-panel">'
      +   '<div class="dash-sec__head"><span class="dash-sec__title">Today at a Glance</span></div>'
      +   '<div class="dl-glance">' + glanceRows + '</div>'
      + '</div>',

    methods:
        '<div class="dash-sec dl-panel">'
      +   '<div class="dash-sec__head"><span class="dash-sec__title">Collection by Method</span>'
      +   (methods.total > 0 ? '<span class="dl-head__total">' + fmtPKR(methods.total) + '</span>' : '')
      +   '</div>'
      +   '<div class="dl-meth">' + methodRows + '</div>'
      + '</div>',

    needs:
        '<div class="dash-sec dl-panel">'
      +   '<div class="dash-sec__head"><span class="dash-sec__title">Needs Action</span>'
      +   (needs.length ? '<span class="dash-pill dh-slate">' + needs.length + '</span>' : '')
      +   '</div>'
      +   '<div class="dl-needs">' + needsRows + '</div>'
      + '</div>',

    actions:
        '<div class="dash-sec dl-panel">'
      +   '<div class="dash-sec__head"><span class="dash-sec__title">Quick Actions</span></div>'
      +   '<div class="dl-acts dl-acts--4">' + actions + '</div>'
      + '</div>',
  };
}

/* OCCUPANCY OVERVIEW — the owner's `occupency 2.png`.

   One bar, three figures, no donut. Occupancy by Room Type sits immediately to
   its left and is already a donut in the reference; a second one beside it
   would have made the pair read as two versions of the same chart rather than
   the whole and its parts.

   `filled` deliberately excludes force-added students, matching the seat maths
   everywhere else on this page — a bed given to someone over capacity is not a
   bed the hostel has to sell. The headline percentage would otherwise be able
   to exceed 100 and the bar would overflow its track. */
function _dashOccupancyOverview(totalSeats, filled, avail, pct) {
  return ''
  + '<div class="dash-sec dl-panel">'
    + '<div class="dash-sec__head"><span class="dash-sec__title">Occupancy Overview</span></div>'
    + '<div class="dl-occ">'
      + '<div class="dl-occ__top">'
        + '<span class="dl-occ__pct">' + pct + '%</span>'
        + '<span class="dl-occ__of">' + fmtNum(filled) + ' / ' + fmtNum(totalSeats) + ' beds</span>'
      + '</div>'
      + '<div class="dl-occ__bar"><i style="width:' + Math.min(100, pct) + '%"></i></div>'
      + '<div class="dl-occ__legend">'
        + '<span class="dl-occ__row"><i class="dl-occ__sw dl-occ__sw--track"></i>Total beds<b>' + fmtNum(totalSeats) + '</b></span>'
        + '<span class="dl-occ__row"><i class="dl-occ__sw dl-occ__sw--fill"></i>Occupied<b>' + fmtNum(filled) + '</b></span>'
        + '<span class="dl-occ__row"><i class="dl-occ__sw dl-occ__sw--free"></i>Available<b>' + fmtNum(avail) + '</b></span>'
      + '</div>'
    + '</div>'
  + '</div>';
}

/* ══ RECENT PAYMENTS ═════════════════════════════════════════════════════════
   Owner reference: `recent payments.png` (30 Aug).

   The eight columns were already right; what the reference asks for is
   legibility and a footing:

   · The extras under a payment are drawn in the accent, not grey. They are the
     answer to "why is PKR 16,500 sitting under a PKR 14,500 room rent" — the
     one line on the row a reader actively goes looking for.
   · An unpaid balance is red. It was `var(--text)`, the same weight as every
     settled figure beside it, so the two rows that still owed money looked
     exactly like the eight that did not.
   · A ⋮ per row. settings.js records the house rule — no kebab for a single
     action — and this row clears it: view the student, print the receipt,
     edit the payment, and settle it while it is still pending.
   · A summary strip under the table. The table shows ten rows; the strip
     describes the whole month, which is why its captions say which month.

   EVERY FIGURE IN THE STRIP IS COMPUTED, AND `collected` IS PASSED IN RATHER
   THAN RECOMPUTED. It is the same variable the Total Revenue KPI card is drawn
   from, so the two cannot disagree on one screen — the failure that teaches an
   owner to stop trusting a dashboard.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Extras are a LIST, not a number, because the row prints them line by line and
   the strip totals them. One reader for both, or the tile and the rows drift.

   `p.fee` was the only field this section read for the admission fee. Every
   other reader in the app — payments.js:508, :679, :698, :2272 — reads
   `p.admissionFee || p.fee`, and `admissionFee` is what every writer since has
   written. So the admission fee has never once appeared on this table. */
function _dashExtraLines(p) {
  const out = [];
  const adm = Number(p.admissionFee || p.fee || 0);
  if (adm > 0) out.push({ amount: adm, label: 'admission fee' });
  (p.extraCharges || []).forEach(c => {
    const amt = Number(c.amount || 0);
    if (amt > 0) out.push({ amount: amt, label: c.description || c.desc || c.label || 'extra' });
  });
  return out;
}
function _dashExtrasTotal(p) { return _dashExtraLines(p).reduce((s, l) => s + l.amount, 0); }

/* What the strip states, counted over the whole selected month — not over the
   ten rows above it. `collected` comes from calcRevenue() via the caller. */
function _dashPaymentTotals(mo, collected) {
  const pays    = DB.payments.filter(p => _payMatchesMonth(p, mo));
  const settled = pays.filter(p => p.status === 'Paid').length;
  return {
    collected: collected,
    extras:    pays.reduce((s, p) => s + _dashExtrasTotal(p), 0),
    settled:   settled,
    count:     pays.length,
    rate:      pays.length ? (settled / pays.length) * 100 : 0,
  };
}

const _DASH_RP_ICO = {
  card:    '<path d="M20 4H4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3ZM3 9h18V8H3Zm14 6h-3a1 1 0 0 1 0-2h3a1 1 0 0 1 0 2Z"/>',
  money:   '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm.75 15.5v1h-1.5v-1a3 3 0 0 1-2.25-1.6 1 1 0 0 1 1.76-.95 1.3 1.3 0 0 0 1.16.6h.66a.9.9 0 0 0 .3-1.75l-2-.7A2.9 2.9 0 0 1 11.25 7V6h1.5v1a3 3 0 0 1 2.09 1.45 1 1 0 0 1-1.7 1.04A1.28 1.28 0 0 0 12.08 9h-.66a.9.9 0 0 0-.3 1.75l2 .7a2.9 2.9 0 0 1-.37 6.05Z"/>',
  coins:   '<path d="M8 3c-3.9 0-7 1.34-7 3s3.1 3 7 3 7-1.34 7-3-3.1-3-7-3Zm0 8c-3.9 0-7-1.34-7-3v3c0 1.66 3.1 3 7 3s7-1.34 7-3V8c0 1.66-3.1 3-7 3Z"/><path d="M16 9v3.5c0 1.66-3.1 3-7 3-.34 0-.67 0-1-.03V17c0 1.66 3.1 3 7 3s7-1.34 7-3v-5c0-1.6-2.9-2.92-6.62-3Z"/>',
  check:   '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.71 8.71-6 6a1 1 0 0 1-1.42 0l-3-3a1 1 0 1 1 1.42-1.42L11 14.59l5.29-5.3a1 1 0 0 1 1.42 1.42Z"/>',
  people:  '<path d="M9 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.31 0-6 1.79-6 4v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1c0-2.21-2.69-4-6-4Zm8.5-2a3.5 3.5 0 1 0-3.5-3.5 3.5 3.5 0 0 0 3.5 3.5Zm0 2a6.6 6.6 0 0 0-1.7.22A5.5 5.5 0 0 1 18 17v2h4a1 1 0 0 0 1-1v-1c0-2.21-2.46-4-5.5-4Z"/>',
  dots:    '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
  eye:     '<path d="M12 5C5 5 2 12 2 12s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11.5A4.5 4.5 0 1 1 16.5 12 4.5 4.5 0 0 1 12 16.5Z"/><circle cx="12" cy="12" r="2.2"/>',
  receipt: '<path d="M6 2a1 1 0 0 0-1 1v18a1 1 0 0 0 1.45.9L9 20.6l2.55 1.28a1 1 0 0 0 .9 0L15 20.6l2.55 1.28A1 1 0 0 0 19 21V3a1 1 0 0 0-1-1Zm2 5h8v2H8Zm0 4h8v2H8Z"/>',
  pencil:  '<path d="m20.71 7.04-2.75-2.75a1 1 0 0 0-1.41 0L4.29 16.55a1 1 0 0 0-.29.71V20a1 1 0 0 0 1 1h2.74a1 1 0 0 0 .71-.29L20.71 8.46a1 1 0 0 0 0-1.42Z"/>',
};
function _rpIco(k, cls) {
  return '<svg class="' + (cls || 'icon icon-xs') + '" viewBox="0 0 24 24" fill="currentColor">' + _DASH_RP_ICO[k] + '</svg>';
}

function _dashRecentPayments(list, mo, collected) {
  const head =
    '<div class="dash-sec__head">'
    + '<div class="dash-chip dh-green" style="width:30px;height:30px;border-radius:9px">' + _rpIco('card', 'icon') + '</div>'
    + '<span class="dash-sec__title">Recent Payments</span>'
    + '<button class="dash-link" style="margin-left:auto" onclick="navigate(\'payments\')">View All ›</button>'
    + '</div>';

  if (!list.length) {
    return '<div class="dash-sec">' + head
      + '<div style="padding:32px;text-align:center;color:var(--text3)">'
      + '<div style="margin-bottom:10px">' + _rpIco('card', 'icon icon-xl') + '</div>'
      + '<div style="font-size:14px;font-weight:600">No payments yet</div></div></div>';
  }

  const mayEdit = typeof canDo !== 'function' || canDo('payments');
  const rows = list.map(p => {
    const st     = DB.students.find(s => s.id === p.studentId);
    // The MONTHLY CHARGE, not the rent half of it. This column read
    // `p.monthlyRent` alone, so a student on 8,000 rent + 6,500 mess showed
    // "PKR 8,000" beside a PKR 14,500 payment and the mess was nowhere.
    const ch     = paymentCharges(p, st);
    const unpaid = outstandingOf(p);
    const name   = String(p.studentName || '?');
    const menu =
      '<button class="dash-rp-menu__item" onclick="_dashRowAct(event,\'showViewStudentModal\',\'' + p.studentId + '\')">' + _rpIco('eye') + 'View student</button>'
      + '<button class="dash-rp-menu__item" onclick="_dashRowAct(event,\'printReceipt\',\'' + p.id + '\')">' + _rpIco('receipt') + 'Print receipt</button>'
      + (mayEdit
          ? '<button class="dash-rp-menu__item" onclick="_dashRowAct(event,\'showEditPaymentModal\',\'' + p.id + '\')">' + _rpIco('pencil') + 'Edit payment</button>'
            + (p.status === 'Pending'
                ? '<button class="dash-rp-menu__item dash-rp-menu__item--go" onclick="_dashRowAct(event,\'markPaymentPaid\',\'' + p.id + '\',true)">' + _rpIco('check') + 'Mark paid</button>'
                : '')
          : '');

    return '<tr class="dash-rp-row" onclick="showViewStudentModal(\'' + p.studentId + '\')">'
      + '<td><div class="dash-rp-who"><div class="dash-rp-av">' + escHtml((name.trim()[0] || '?').toUpperCase()) + '</div>'
        + '<span class="dash-rp-name">' + escHtml(name) + '</span></div></td>'
      + '<td><span class="dash-rp-room">#' + escHtml(String(p.roomNumber || '')) + '</span></td>'
      + '<td><span class="dash-rp-num">' + (ch.monthly > 0 ? fmtPKR(ch.monthly) : '—') + '</span>'
        + (ch.messIncluded
            ? '<div class="dash-rp-sub">' + fmtPKR(ch.rent) + ' rent + ' + fmtPKR(ch.mess) + ' mess</div>'
            : ch.hasMess ? '<div class="dash-rp-sub">rent only · mess off</div>' : '')
      + '</td>'
      + '<td><span class="dash-rp-num">' + fmtPKR(p.amount) + '</span>'
        + _dashExtraLines(p).map(l =>
            '<div class="dash-rp-extra">+ ' + fmtPKR(l.amount) + ' ' + escHtml(l.label) + '</div>').join('')
      + '</td>'
      + '<td>' + (unpaid > 0
          ? '<span class="dash-rp-num dash-rp-num--due">' + fmtPKR(unpaid) + '</span>'
          : '<span class="dash-rp-nil">—</span>') + '</td>'
      + '<td>' + pmBadge(p.method) + '</td>'
      + '<td>' + statusBadge(p.status) + '</td>'
      + '<td><span class="dash-rp-date">' + fmtDate(p.date) + '</span></td>'
      + '<td class="dash-rp-more">'
        + '<button class="dash-rp-more__btn" title="More" onclick="_dashToggleRowMenu(event)">' + _rpIco('dots') + '</button>'
        + '<div class="dash-rp-menu">' + menu + '</div>'
      + '</td></tr>';
  }).join('');

  const t = _dashPaymentTotals(mo, collected);
  const stat = (hue, ico, label, value, sub) =>
    '<div class="dash-rp-stat ' + hue + '">'
    + '<div class="dash-rp-stat__chip">' + _rpIco(ico, 'icon') + '</div>'
    + '<div class="dash-rp-stat__body"><div class="dash-rp-stat__label">' + label + '</div>'
    + '<div class="dash-rp-stat__val">' + value + '</div>'
    + '<div class="dash-rp-stat__sub">' + sub + '</div></div></div>';

  // The strip says WHICH month, because the dashboard has a month selector and
  // "This Month" would be a lie on every month but one.
  const when = thisMonthLabel();
  const foot =
    '<div class="dash-rp-foot">'
    + stat('dh-blue',   'money',  'Total Payments', fmtPKR(t.collected), when)
    + stat('dh-violet', 'coins',  'Total Extras',   fmtPKR(t.extras),    'Charged in ' + when)
    + stat('dh-green',  'check',  'Settled',        (t.count ? t.rate.toFixed(1) + '%' : '—'),
           t.count ? t.settled + ' of ' + t.count + ' records' : 'No records')
    + stat('dh-amber',  'people', 'Transactions',   String(t.count),     when)
    + '</div>';

  return '<div class="dash-sec">' + head
    + '<div class="table-wrap dash-rp-wrap" style="border:none"><table class="dash-rp">'
    + '<thead><tr><th>Student</th><th>Room</th><th>Charge / mo</th><th>Paid (+Extras)</th>'
    + '<th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th><th></th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div>'
    + foot + '</div>';
}

/* One menu open at a time, and never the row click underneath it.

   The menu is `position:fixed` because the table sits in a `.table-wrap` that
   scrolls sideways, and a dropdown inside a scroll container is clipped by it —
   an absolutely positioned menu is sliced off at the card edge. Fixed escapes
   the clip (nothing above it establishes a containing block), at the price of
   coordinates that have to be computed and then kept up to date.

   Kept up to date, NOT torn down on scroll. Closing on scroll looks equivalent
   and is not: a click near the foot of the window makes the browser scroll the
   row into view, and that scroll is delivered AFTER the click handler has
   opened the menu — so the menu opened, then immediately closed, and the ⋮ read
   as a dead button. It follows its row instead, and gives up only when the row
   it belongs to has left the viewport. */
let _dashMenuAnchor = null;

function _dashCloseRowMenus() {
  _dashMenuAnchor = null;
  document.querySelectorAll('.dash-rp-more.is-open').forEach(n => n.classList.remove('is-open'));
}

function _dashPlaceRowMenu() {
  if (!_dashMenuAnchor) return;
  const cell = _dashMenuAnchor.parentNode;
  const menu = cell && cell.querySelector('.dash-rp-menu');
  if (!menu) return;
  const r = _dashMenuAnchor.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) { _dashCloseRowMenus(); return; }
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const below = r.bottom + 4;
  // Flip above the button when there is no room under it — the last rows of the
  // table sit near the bottom of the window.
  menu.style.top  = (below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below) + 'px';
  menu.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
}

function _dashToggleRowMenu(ev) {
  ev.stopPropagation();
  const cell = ev.currentTarget.parentNode;
  const open = cell.classList.contains('is-open');
  _dashCloseRowMenus();
  if (open) return;
  cell.classList.add('is-open');
  _dashMenuAnchor = ev.currentTarget;
  _dashPlaceRowMenu();
}
document.addEventListener('click', _dashCloseRowMenus);
document.addEventListener('keydown', e => { if (e.key === 'Escape') _dashCloseRowMenus(); });
document.addEventListener('scroll', _dashPlaceRowMenu, true);
window.addEventListener('resize', _dashPlaceRowMenu);

/* Menu items dispatch by name so a module that has not loaded cannot throw
   inside an inline handler and leave the menu stuck open. `rerender` is for the
   one action that changes what the dashboard is showing. */
function _dashRowAct(ev, fn, id, rerender) {
  ev.stopPropagation();
  _dashCloseRowMenus();
  if (typeof window[fn] !== 'function') { toast('That action is unavailable', 'error'); return; }
  window[fn](id);
  if (rerender) renderPage('dashboard');
}

function showRoomSeatDetailModal(roomId) {
  const r = DB.rooms.find(x=>x.id===roomId); if(!r) return;
  const rtype = getRoomType(r);
  const cap = rtype?.capacity||1;
  const students = DB.students.filter(s=>s.roomId===r.id&&s.status==='Active');
  const occ = students.length;
  const free = cap - occ;
  const isFull = free===0;

  // Build seat slots
  let seatSlots = '';
  for(let i=0;i<cap;i++){
    const s = students[i];
    if(s){
      seatSlots += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:7px;background:var(--accent-dim);color:var(--accent-strong);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;flex-shrink:0">${escHtml(s.name[0])}</div>
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--text)">${escHtml(s.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'No phone')}</div>
          </div>
        </div>
        <div style="display:flex;gap:5px">
          <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="closeModal();showViewStudentModal('${s.id}')"><svg class="icon icon-xs" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5C5 5 2 12 2 12s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11.5A4.5 4.5 0 1 1 16.5 12 4.5 4.5 0 0 1 12 16.5Z"/><circle cx="12" cy="12" r="2.2"/></svg> View</button>
          <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="closeModal();showEditStudentModal('${s.id}')"><svg class="icon icon-xs" viewBox="0 0 24 24" fill="currentColor"><path d="m20.71 7.04-2.75-2.75a1 1 0 0 0-1.41 0L4.29 16.55a1 1 0 0 0-.29.71V20a1 1 0 0 0 1 1h2.74a1 1 0 0 0 .71-.29L20.71 8.46a1 1 0 0 0 0-1.42Z"/></svg> Edit</button>
        </div>
      </div>`;
    } else {
      seatSlots += `<div style="background:var(--accent-dim);border:1px dashed rgba(37,99,235,0.4);border-radius:9px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:7px;background:rgba(37,99,235,0.1);display:flex;align-items:center;justify-content:center;color:var(--accent-strong)"><svg class="icon icon-xs" viewBox="0 0 24 24" fill="currentColor"><path d="M18 13V7a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v6a2 2 0 0 0-2 2v3a1 1 0 0 0 1 1h1.18a2 2 0 0 0 3.64 0h4.36a2 2 0 0 0 3.64 0H19a1 1 0 0 0 1-1v-3a2 2 0 0 0-2-2Z"/></svg></div>
          <div style="font-size:13px;color:var(--text3);font-style:italic">Seat ${i+1} — Free</div>
        </div>
        <button class="btn btn-primary btn-sm" style="font-size:10px" onclick="closeModal();showAddStudentModal('${r.id}')">+ Add Student</button>
      </div>`;
    }
  }

  showModal('modal-md', `${ICONS.bed} Room #${escHtml(String(r.number))} — Seat Details`,`
    <!-- Room header -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:18px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;text-align:center">
      <div>
        <div style="font-size:22px;font-weight:900;color:var(--accent-strong)">#${escHtml(String(r.number))}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Room</div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:900;color:var(--text)">${escHtml(rtype?.name||'—')}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Type</div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:900;color:var(--text)">${occ}/${cap}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Occupied</div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:900;color:${free>0?'var(--text)':'var(--text3)'}">${free}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Free</div>
      </div>
    </div>
    <!-- Progress bar -->
    <div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-bottom:18px">
      <div style="height:100%;width:${Math.round(occ/cap*100)}%;background:${isFull?'var(--text3)':'var(--accent)'};border-radius:3px;transition:width 0.5s"></div>
    </div>
    <!-- Seat slots -->
    <div style="display:flex;flex-direction:column;gap:8px">${seatSlots}</div>
  `,`
    <button class="btn btn-secondary" onclick="closeModal();showRoomDetail('${r.id}')">${ICONS.home} Full Room Details</button>
    ${free>0?`<button class="btn btn-primary" onclick="closeModal();showAddStudentModal('${r.id}')">+ Add Student</button>`:''}
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
  `);
}


// ── SEAT AVAILABILITY PRINT REPORT ──────────────────────────────────────────
function printSeatAvailability() {
  if (typeof requireFeature === 'function' && !requireFeature('printDocs')) return;
  const hostel = DB.settings.hostelName || 'Hostel Name';
  const location = DB.settings.location || '';
  const now2 = new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'});
  const totalSeats = DB.rooms.reduce((s,r)=>{const t=DB.settings.roomTypes.find(x=>x.id===r.typeId);return s+(t?t.capacity:1);},0);
  const allActiveSeats2 = DB.students.filter(t=>t.status==='Active').length; // badge: ALL active
  const filledSeats = DB.students.filter(t=>t.status==='Active' && !t.isForced).length; // for free seat calc
  const freeSeats = totalSeats - filledSeats;
  // Floors in the order the owner arranged them in Settings, not alphabetically
  // — a plain .sort() put "1st, 2nd, Ground" on the sheet, so the warden walked
  // the building starting from the middle. Floors not in Settings trail behind
  // in their own alphabetical order rather than vanishing.
  const _fOrder = DB.settings.floors || [];
  const floors = [...new Set(DB.rooms.map(r=>r.floor||'Unknown'))].sort((a,b)=>{
    const ia = _fOrder.indexOf(a), ib = _fOrder.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return String(a).localeCompare(String(b));
  });
  let body = '';

  // Short badge for the floor header — 'Basement' → B, 'Ground' → G, '1st' → 1.
  const floorBadge = f => {
    const s = String(f || '').trim();
    const n = /^(\d+)/.exec(s);
    return n ? n[1] : (s.slice(0, 1).toUpperCase() || '?');
  };

  floors.forEach(floor => {
    // Numeric-aware compare: room numbers are strings and some carry a suffix
    // ("6A"), which a-b turns into NaN and leaves the grid in insertion order.
    const floorRooms = DB.rooms.filter(r=>(r.floor||'Unknown')===floor)
      .sort((a,b)=>cmpRoomNo(a.number,b.number));
    // Per-floor totals, so a warden can sign off one floor at a time instead of
    // holding the whole building in their head.
    const fSeats = floorRooms.reduce((s,r)=>{
      const t = DB.settings.roomTypes.find(x=>x.id===r.typeId); return s+(t?t.capacity:1); },0);
    const fOcc = DB.students.filter(s=>s.status==='Active'
      && floorRooms.some(r=>r.id===s.roomId)).length;
    const fFree = fSeats - fOcc;
    body += `<div class="floor-head">
      <span class="fbadge">${escHtml(floorBadge(floor))}</span>
      <span class="fname">${escHtml(String(floor))} Floor
        <span class="fcount">${floorRooms.length} room${floorRooms.length===1?'':'s'}</span></span>
      <span class="fstats">
        <span class="fstat">${icon('users','xs')}<b>${fSeats}</b> Seats Total</span>
        <span class="fstat is-occ">${icon('userCheck','xs')}<b>${fOcc}</b> Occupied</span>
        <span class="fstat is-free">${icon('armchair','xs')}<b>${fFree}</b> Available</span>
      </span>
    </div><div class="room-grid">`;

    floorRooms.forEach(r => {
      const rtype = DB.settings.roomTypes.find(t=>t.id===r.typeId);
      const cap = rtype ? rtype.capacity : 1;
      const students = DB.students.filter(s=>s.roomId===r.id&&s.status==='Active');
      const occ = students.length;
      const free = cap - occ;
      const hasBath = (r.amenities||[]).some(a=>/bath|attach/i.test(a));
      // Three states, not two: over capacity is its own case and used to render
      // as "-1 free" in the same amber as a genuinely free seat.
      const seatCls = free === 0 ? 'seats-full' : free < 0 ? 'seats-over' : 'seats-free';
      // …and the label has to say it too. The badge went red for over-capacity
      // but still read "-1 free", which is the opposite of what it means.
      const seatTxt = free === 0 ? 'Full'
        : free < 0 ? Math.abs(free) + ' over'
        : free + ' free';

      const labelStyle = r.roomLabelFont ? `font-family:${r.roomLabelFont};` : '';
      body += `<div class="room-box">
        <div class="room-top">
          <span class="rnum" style="${labelStyle}">${r.roomLabel ? escHtml(r.roomLabel)+' · ' : ''}Rm #${escHtml(String(r.number))}</span>
          <span class="rtype">${rtype?escHtml(rtype.name):'—'}</span>
          ${hasBath?'<span class="bath">'+icon('bath','xs')+' Bath</span>':''}
          <span class="seats ${seatCls}">${seatTxt}</span>
        </div>
        <div class="room-rows">`;

      if (students.length) {
        students.forEach((s,i) => {
          const course = (s.occupation||'').trim();
          body += `<div class="student-row"><span class="snum">${i+1}</span><span class="sname">${escHtml(s.name)}</span>${
            course ? `<span class="scourse">${escHtml(course)}</span>` : `<span class="scourse is-none">—</span>`}</div>`;
        });
      } else {
        body += `<div class="empty-row">— Vacant —</div>`;
      }
      // Outgoing: students with pending/confirmed cancellation in this room
      const outgoing = (DB.cancellations||[]).filter(c=>c.roomId===r.id&&(c.status==='Pending'||c.status==='Confirmed'));
      outgoing.forEach(c => {
        const vacDate = c.vacateDate ? new Date(c.vacateDate+'T00:00:00').toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'}) : 'TBD';
        body += `<div class="student-row outgoing-row"><span class="snum">↩</span><span class="sname">${escHtml(c.studentName||'—')}</span><span class="out-badge">Out Going · ${vacDate}</span></div>`;
      });
      body += `</div>`;

      // Empty seat slots — the line the warden ticks against during the walk.
      if (free > 0) {
        body += `<div class="slot-list">`;
        for(let i=occ;i<cap;i++) body += `<div class="seat-slot">Seat ${i+1} <span>— available</span></div>`;
        body += `</div>`;
      } else if (free < 0) {
        body += `<div class="slot-list"><div class="seat-slot is-over">${Math.abs(free)} seat${Math.abs(free)===1?'':'s'} over capacity</div></div>`;
      }
      body += `</div>`;
    });
    body += `</div>`;
  });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Room Visit Sheet</title>
  <style>
    @page { size: A4; margin: 10mm 10mm; }
    @media print { .no-print{display:none!important} }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#0f172a;background:#fff;padding:10px}

    /* icons.js emits <svg class="icon">, and this print document has none of the
       app stylesheets — without these rules the SVGs fall back to the replaced
       element default (300×150) and blow the layout apart. */
    svg.icon{width:14px;height:14px;flex-shrink:0;vertical-align:-2px}
    svg.icon-xs{width:11px;height:11px}
    svg.icon-sm{width:13px;height:13px}
    svg.icon-lg{width:18px;height:18px}

    /* ── Header ─────────────────────────────────────────────────────────── */
    .header{display:flex;justify-content:space-between;align-items:flex-end;
            border-bottom:2px solid #1e293b;padding-bottom:9px;margin-bottom:12px}
    .header h1{font-size:21px;font-weight:900;color:#0f172a;letter-spacing:-.02em}
    .header .sub{display:flex;align-items:center;gap:4px;font-size:10px;color:#64748b;margin-top:3px}
    .header .kicker{margin-top:5px;font-size:9.5px;font-weight:800;color:#475569;
                    text-transform:uppercase;letter-spacing:1.6px}
    .header .date{text-align:right}
    .header .date .d{display:flex;align-items:center;justify-content:flex-end;gap:5px;
                     font-size:12px;font-weight:800;color:#1e293b}
    .header .date .h{font-size:9px;color:#94a3b8;margin-top:3px}

    /* ── Summary tiles ──────────────────────────────────────────────────── */
    .summary{display:flex;gap:8px;margin-bottom:14px}
    .sbox{flex:1;display:flex;align-items:center;gap:9px;
          border:1px solid #e2e8f0;border-radius:8px;padding:8px 11px}
    .sbox .ico{width:32px;height:32px;border-radius:9px;flex-shrink:0;
               display:flex;align-items:center;justify-content:center}
    .sbox .v{display:block;font-size:21px;font-weight:900;line-height:1.1;color:#0f172a}
    .sbox .l{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:1.1px;
             color:#94a3b8;font-weight:700;margin-top:1px}
    .sbox.t-rooms .ico{background:#ede9fe;color:#7c3aed}
    .sbox.t-seats .ico{background:#dbeafe;color:#2563eb}
    .sbox.t-occ   .ico{background:#fee2e2;color:#dc2626}
    .sbox.t-free  .ico{background:#dcfce7;color:#16a34a}

    /* ── Floor header ───────────────────────────────────────────────────────
       A floor is the unit a warden actually walks, so its header carries that
       floor's own seat maths — total / occupied / available — and they can sign
       one floor off without adding up the room cards themselves. page-break-
       after:avoid keeps a header from stranding at the foot of a page with its
       rooms overleaf. */
    .floor-head{display:flex;align-items:center;gap:9px;margin:13px 0 8px;
                background:#0f172a;border-radius:8px;padding:7px 11px;
                page-break-after:avoid;page-break-inside:avoid}
    .fbadge{width:22px;height:22px;flex-shrink:0;border-radius:6px;background:#334155;
            color:#fff;font-size:11px;font-weight:900;
            display:flex;align-items:center;justify-content:center}
    .fname{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:900;
           color:#fff;text-transform:uppercase;letter-spacing:1.8px}
    .fcount{font-size:8.5px;font-weight:700;letter-spacing:.6px;text-transform:none;
            color:#cbd5e1;background:#1e293b;border-radius:20px;padding:2px 8px}
    .fstats{display:flex;align-items:center;gap:7px;margin-left:auto}
    .fstat{display:inline-flex;align-items:center;gap:4px;font-size:8.5px;font-weight:700;
           letter-spacing:.5px;text-transform:uppercase;color:#cbd5e1;
           background:#1e293b;border-radius:20px;padding:3px 9px}
    .fstat b{font-size:11px;font-weight:900;color:#fff;letter-spacing:0}
    .fstat.is-occ b{color:#fca5a5}
    .fstat.is-free b{color:#86efac}

    /* ── Room cards ─────────────────────────────────────────────────────────
       Cards used to be tinted green when full and yellow when partial, which
       put a full-bleed colour behind every room and left the status badge
       saying the same thing twice. The card is neutral now; the badge carries
       the state. Prints far cleaner on a mono office printer too. */
    .room-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:4px}
    .room-box{border:1px solid #e2e8f0;border-radius:9px;padding:9px 11px;
              page-break-inside:avoid;background:#fff}
    .room-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
              padding-bottom:7px;border-bottom:1px solid #f1f5f9}
    .rnum{font-size:14px;font-weight:900;color:#0f172a;letter-spacing:-.01em}
    .rtype{font-size:9px;background:#f1f5f9;border-radius:20px;padding:2px 7px;
           color:#475569;font-weight:700}
    .bath{display:inline-flex;align-items:center;gap:3px;font-size:9px;background:#e0f2fe;
          color:#0369a1;border-radius:20px;padding:2px 7px;font-weight:700}
    .seats{font-size:9px;font-weight:800;margin-left:auto;padding:2px 8px;border-radius:20px}
    .seats-full{background:#dcfce7;color:#15803d}
    .seats-free{background:#fef3c7;color:#b45309}
    .seats-over{background:#fee2e2;color:#dc2626}

    .room-rows{padding-top:2px}
    .student-row{display:flex;align-items:center;gap:6px;padding:3px 0;
                 border-bottom:1px solid #f8fafc;font-size:10px}
    .student-row:last-child{border-bottom:none}
    .snum{width:13px;color:#cbd5e1;font-weight:700;flex-shrink:0;text-align:center}
    .sname{font-weight:700;flex:1;color:#0f172a;min-width:0;
           overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .scourse{color:#1d4ed8;font-size:8.5px;font-weight:700;background:#eff6ff;
             border-radius:20px;padding:2px 7px;white-space:nowrap}
    .scourse.is-none{color:#cbd5e1;background:#f8fafc}
    .empty-row{font-size:10px;color:#94a3b8;font-style:italic;padding:5px 0}
    .outgoing-row .sname{text-decoration:line-through;color:#94a3b8}
    .out-badge{font-size:8px;font-weight:800;background:#fee2e2;color:#dc2626;
               border-radius:20px;padding:2px 7px;white-space:nowrap}

    .slot-list{margin-top:6px;padding-top:6px;border-top:1px dashed #e2e8f0}
    .seat-slot{font-size:9.5px;color:#94a3b8;padding:1.5px 0}
    .seat-slot span{color:#cbd5e1}
    .seat-slot.is-over{color:#dc2626;font-weight:700}

    .footer{margin-top:14px;text-align:center;font-size:9px;color:#94a3b8;
            border-top:1px solid #e2e8f0;padding-top:7px}
    .print-btn{display:inline-flex;align-items:center;gap:7px;margin:0 auto 14px;
               padding:9px 22px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;
               font-size:13px;font-weight:700;cursor:pointer}
    .print-bar{display:flex;justify-content:center}
  </style></head><body>
  <div class="print-bar no-print"><button class="print-btn" onclick="window.print()">${icon('print','sm')} Print Visit Sheet</button></div>
  <div class="header">
    <div>
      <h1>${escHtml(hostel)}</h1>
      ${location?`<div class="sub">${icon('pin','xs')}<span>${escHtml(location)}</span></div>`:''}
      <div class="kicker">Room Visit Sheet</div>
    </div>
    <div class="date">
      <div class="d">${icon('calendar','xs')}<span>${now2}</span></div>
      <div class="h">Carry this during room visits</div>
    </div>
  </div>
  <div class="summary">
    <div class="sbox t-rooms"><span class="ico">${icon('doorOpen','sm')}</span><span><span class="v">${DB.rooms.length}</span><span class="l">Rooms</span></span></div>
    <div class="sbox t-seats"><span class="ico">${icon('users','sm')}</span><span><span class="v">${totalSeats}</span><span class="l">Total Seats</span></span></div>
    <div class="sbox t-occ"><span class="ico">${icon('userCheck','sm')}</span><span><span class="v">${allActiveSeats2}</span><span class="l">Occupied</span></span></div>
    <div class="sbox t-free"><span class="ico">${icon('armchair','sm')}</span><span><span class="v">${freeSeats}</span><span class="l">Available</span></span></div>
  </div>
  ${body}
  <div class="footer">${escHtml(hostel)} · Room Visit Sheet · ${now2}</div>
  </body></html>`;

  _electronPDF(html, (DB.settings.hostelName||'Hostel').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_Room-Visit-Sheet_'+today()+'.pdf', {pageSize:'A4'});
}
// ─────────────────────────────────────────────────────────────────────────────
function showSeatDetailModal(type) {
  if(type==='rooms') {
    // Show full room grid modal
    const allRooms = DB.rooms;
    let content = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">';
    allRooms.forEach(r=>{
      const rt=getRoomType(r); const cap=rt?.capacity||1; const occ2=getRoomOccupancy(r); const free=cap-occ2;
      content+=`<div onclick="closeModal();showRoomSeatDetailModal('${r.id}')" style="background:${free===0?'var(--bg4)':'rgba(37,99,235,0.1)'};border:1px solid ${free===0?'var(--border)':'rgba(37,99,235,0.3)'};border-radius:10px;padding:12px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        <div style="font-size:18px;font-weight:900;color:var(--text)">Rm #${escHtml(String(r.number))}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(rt?.name||'—')} · Floor ${escHtml(r.floor||'?')}</div>
        <div style="margin-top:8px;display:flex;justify-content:space-between">
          <span style="font-size:12px;font-weight:700;color:${free===0?'var(--text2)':'var(--accent-strong)'}">Occ: ${occ2}/${cap}</span>
          <span style="font-size:12px;font-weight:700;color:${free>0?'var(--text2)':'var(--text3)'}">${free} free</span>
        </div>
        <div style="height:4px;background:var(--bg4);border-radius:2px;margin-top:6px;overflow:hidden"><div style="height:100%;width:${Math.round(occ2/cap*100)}%;background:${free===0?'var(--text3)':'var(--accent)'};border-radius:2px"></div></div>
      </div>`;
    });
    content += '</div>';
    showModal('modal-xl',ICONS.bed+' All Rooms — Seat Availability',`<div style="max-height:500px;overflow-y:auto">${content}</div>`);
    return;
  }
  let title, color, rows='';
  if(type==='vacant') {
    title=ICONS.key+' Vacant Rooms — Free Seats';
    color='var(--accent)';
    const vacantRooms = DB.rooms.filter(r=>{
      const occ=getRoomOccupancy(r);
      const cap=getRoomType(r)?.capacity||1;
      return occ < cap;
    });
    if(!vacantRooms.length){rows='<div style="padding:24px;text-align:center;color:var(--text3)">No vacant rooms</div>';}
    else vacantRooms.forEach(r=>{
      const type=getRoomType(r);
      const occ=getRoomOccupancy(r);
      const cap=type?.capacity||1;
      const free=cap-occ;
      rows+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:700;color:var(--text)">Room #${escHtml(String(r.number))}</div>
          <div style="font-size:12px;color:var(--text3)">${escHtml(type?.name||'—')} · Floor ${escHtml(r.floor||'?')}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${free} free seat${free!==1?'s':''}</div>
          <div style="font-size:11px;color:var(--text3)">${occ}/${cap} occupied</div>
        </div>
      </div>`;
    });
  } else if(type==='occupied') {
    title=ICONS.home+' Occupied Rooms — Filled Seats';
    color='var(--accent)';
    const occRooms = DB.rooms.filter(r=>getRoomOccupancy(r)>0);
    if(!occRooms.length){rows='<div style="padding:24px;text-align:center;color:var(--text3)">No occupied rooms</div>';}
    else occRooms.forEach(r=>{
      const rtype=getRoomType(r);
      const occ=getRoomOccupancy(r);
      const cap=rtype?.capacity||1;
      const students=DB.students.filter(s=>s.roomId===r.id&&s.status==='Active');
      rows+=`<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div>
            <span style="font-weight:700;color:var(--text)">Room #${escHtml(String(r.number))}</span>
            <span style="font-size:12px;color:var(--text3);margin-left:8px">${escHtml(rtype?.name||'—')} · Floor ${escHtml(r.floor||'?')}</span>
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--text2)">${occ}/${cap} filled</span>
        </div>
        ${students.map(s=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;padding-left:8px;border-left:2px solid var(--border)">
          <div style="width:26px;height:26px;border-radius:7px;background:var(--accent-dim);color:var(--accent-strong);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0">${escHtml(s.name[0])}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(s.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'No phone')}</div>
          </div>
        </div>`).join('')}
      </div>`;
    });
  } else {
    title=ICONS.student+' Students in Occupied Rooms';
    color='var(--accent)';
    const activeStudents=DB.students.filter(s=>s.status==='Active');
    if(!activeStudents.length){rows='<div style="padding:24px;text-align:center;color:var(--text3)">No active students</div>';}
    else activeStudents.forEach(s=>{
      const room=DB.rooms.find(r=>r.id===s.roomId);
      const rtype=room?getRoomType(room):null;
      rows+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="closeModal();showViewStudentModal('${s.id}')">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:9px;background:var(--accent-dim);color:var(--accent-strong);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0">${escHtml(s.name[0])}</div>
          <div>
            <div style="font-weight:700;color:var(--text)">${escHtml(s.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'No phone')}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;font-weight:700;color:var(--accent-strong)">Rm #${escHtml(room?.number||'?')}</div>
          <div style="font-size:11px;color:var(--text3)">${escHtml(rtype?.name||'—')}</div>
        </div>
      </div>`;
    });
  }
  showModal('modal-md', title,
    `<div style="border-top:3px solid ${color};margin:-24px -24px 16px;padding:14px 20px;background:var(--bg3)">
      <span style="font-size:12px;color:var(--text3)">Click rows to view details</span>
    </div>
    <div style="max-height:400px;overflow-y:auto">${rows}</div>`);
}

/* ══ THE MONTH-END RECONCILIATION ════════════════════════════════════════════
   Answers one question: what should be in the cash box, and why does it not
   equal the Total Revenue card next to it?

   The gap is not an error and the panel says so in words. Revenue is what the
   month EARNED; cash is what ARRIVED. They differ by exactly two things —
   arrears collected this month for an earlier one (in the drawer, not in this
   month's revenue) and this month's rent not yet handed over (in the revenue,
   not in the drawer). Both are listed, and the identity that ties them is
   printed at the bottom so the warden can follow it rather than trust it. */
function showCashReceivedModal() {
  const mo    = thisMonth();
  const label = (typeof _rptMonthName === 'function') ? _rptMonthName(mo) : mo;
  const cash  = cashBreakdown(mo);
  const rev   = calcRevenue(mo);

  // Every cash event in the month, newest first, with the month it settles.
  const rows = [];
  (DB.payments || []).forEach(p => {
    const settles = _payMonthKey(p);
    _cashEvents(p).forEach(e => {
      if (String(e.date || '').indexOf(mo) !== 0) return;
      const kind = !settles || settles === mo ? 'current' : settles < mo ? 'arrears' : 'advance';
      rows.push({ date: e.date, amount: e.amount, name: p.studentName || '—',
                  room: p.roomNumber || '', settles, kind, removed: !!p.studentRemoved });
    });
  });
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const kindBadge = { current: ['badge-green', 'This month'],
                      arrears: ['badge-gold',  'Arrears'],
                      advance: ['badge-gray',  'Advance'] };

  const body = rows.map(r => {
    const [cls, txt] = kindBadge[r.kind];
    return `<tr>
      <td class="text-muted">${escHtml(fmtDate(r.date))}</td>
      <td class="fw-700">${escHtml(r.name)}${r.removed?' <span style="color:var(--amber);font-size:10px;font-weight:700">(removed)</span>':''}</td>
      <td class="text-muted">${r.room?'#'+escHtml(String(r.room)):'—'}</td>
      <td><span class="badge ${cls}">${txt}</span></td>
      <td class="text-muted">${escHtml(r.settles ? (typeof _rptMonthName==='function'?_rptMonthName(r.settles):r.settles) : '—')}</td>
      <td class="fw-700" style="text-align:right">${fmtPKR(r.amount)}</td>
    </tr>`;
  }).join('');

  const tile = (label2, val, hue, note) => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">${label2}</div>
      <div style="font-size:22px;font-weight:900;color:${hue};font-variant-numeric:tabular-nums">${fmtPKR(val)}</div>
      ${note?`<div style="font-size:10.5px;color:var(--text3);margin-top:2px">${note}</div>`:''}
    </div>`;

  // The identity, stated with real figures so it can be checked rather than believed.
  const owedThisMonth = rev - cash.current;

  showModal('modal-xl', 'Cash Received — ' + escHtml(label), `
    <div style="margin-bottom:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${tile('In the drawer', cash.total, 'var(--amber)', 'Count against this')}
      ${tile('For ' + escHtml(label), cash.current, 'var(--text)', 'This month&rsquo;s own rent')}
      ${tile('Arrears collected', cash.arrears, 'var(--green)', 'Earlier months')}
      ${tile('Paid in advance', cash.advance, 'var(--text2)', 'Future months')}
    </div>

    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12.5px;line-height:1.85;color:var(--text2)">
      <strong style="color:var(--text)">Why this is not the same as Total Revenue.</strong>
      Revenue is what ${escHtml(label)} <em>earned</em>; cash is what <em>arrived</em>.
      Rent for July handed over in August is July&rsquo;s revenue and August&rsquo;s cash.
      <div style="margin-top:9px;font-family:monospace;font-size:12px;color:var(--text)">
        Revenue ${fmtPKR(rev)}
        &minus; still owed ${fmtPKR(owedThisMonth)}
        + arrears ${fmtPKR(cash.arrears)}
        + advance ${fmtPKR(cash.advance)}
        = <strong>${fmtPKR(cash.total)}</strong>
      </div>
    </div>

    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Student</th><th>Room</th><th>Type</th><th>Settles</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr>
        <td colspan="5" class="fw-700" style="text-align:right">Total received in ${escHtml(label)}</td>
        <td class="fw-700" style="text-align:right">${fmtPKR(cash.total)}</td>
      </tr></tfoot>
    </table></div>`
    : `<div style="text-align:center;padding:26px;color:var(--text3);font-size:13px">No money has been received in ${escHtml(label)} yet.</div>`}
  `);
}

function showOccupiedRoomsModal() {
  const occRooms = DB.rooms.filter(r=>getRoomOccupancy(r)>0);
  const rows = occRooms.map(r=>{
    const type=getRoomType(r);
    const students=DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');
    const occ=students.length;
    const cap=type.capacity;
    return `<tr>
      <td><span style="font-size:16px;font-weight:900;color:var(--accent-strong)">#${escHtml(String(r.number))}</span></td>
      <td><span class="badge" style="background:${type.color}22;border-color:${type.color}44;color:${type.color}">${escHtml(type.name)}</span></td>
      <td class="text-muted">${escHtml(r.floor)} Floor</td>
      <td><span class="badge badge-gray">${occ}/${cap} beds</span></td>
      <td class="fw-700">${fmtPKR(r.rent)}/mo</td>
      <td>${students.map(s=>`<div style="font-size:12px;color:var(--text);font-weight:600">• ${escHtml(s.name)}</div>`).join('')||'—'}</td>
      <td><button class="btn btn-secondary btn-sm" style="font-size:11px" onclick="closeModal();showRoomDetail('${r.id}')">View</button></td>
    </tr>`;
  }).join('');
  showModal('modal-xl',ICONS.home+' Occupied Rooms',`
    <div style="margin-bottom:14px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Occupied Rooms</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${occRooms.length}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Total Students</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${DB.students.filter(t=>t.status==='Active').length}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Filled Seats</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${occRooms.reduce((s,r)=>s+getRoomOccupancy(r),0)}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Monthly Revenue</div>
        <div style="font-size:18px;font-weight:900;color:var(--text)">${fmtPKR(occRooms.reduce((s,r)=>{const sts=DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');return s+sts.reduce((ss,t)=>ss+Number(t.rent),0);},0))}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Occupancy Rate</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${DB.rooms.length?Math.round(occRooms.length/DB.rooms.length*100):0}%</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Occupancy</th><th>Rent</th><th>Students</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">No occupied rooms</td></tr>'}</tbody>
      </table>
    </div>`);
}

function showVacantRoomsModal() {
  const vacRooms = DB.rooms.filter(r=>{
    const type=getRoomType(r);
    const occ=getRoomOccupancy(r);
    return occ < type.capacity;
  });
  const rows = vacRooms.map(r=>{
    const type=getRoomType(r);
    const occ=getRoomOccupancy(r);
    const avail=type.capacity-occ;
    const students=DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');
    return `<tr>
      <td><span style="font-size:16px;font-weight:900;color:var(--accent-strong)">#${escHtml(String(r.number))}</span></td>
      <td><span class="badge" style="background:${type.color}22;border-color:${type.color}44;color:${type.color}">${escHtml(type.name)}</span></td>
      <td class="text-muted">${escHtml(r.floor)} Floor</td>
      <td><span class="badge badge-gray">${occ}/${type.capacity} occupied</span></td>
      <td><span class="badge badge-gray" style="font-size:13px;padding:5px 12px">${avail} seat${avail!==1?'s':''} free</span></td>
      <td class="fw-700">${fmtPKR(r.rent)}/mo</td>
      <td>${students.length?students.map(s=>`<div style="font-size:12px;color:var(--text2)">• ${escHtml(s.name)}</div>`).join(''):'<span style="font-size:12px;color:var(--text3)">Empty</span>'}</td>
      <td><button class="btn btn-primary btn-sm" style="font-size:11px" onclick="closeModal();showAddStudentModal('${r.id}')">+ Student</button></td>
    </tr>`;
  }).join('');
  const totalAvail=vacRooms.reduce((s,r)=>{const type=getRoomType(r);return s+(type.capacity-getRoomOccupancy(r));},0);
  showModal('modal-xl',ICONS.key+' Rooms with Available Seats',`
    <div style="margin-bottom:14px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Rooms w/ Space</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${vacRooms.length}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Free Seats</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${totalAvail}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Fully Empty</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${vacRooms.filter(r=>getRoomOccupancy(r)===0).length}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Partial Rooms</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${vacRooms.filter(r=>getRoomOccupancy(r)>0).length}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700">Students in Vacant</div>
        <div style="font-size:26px;font-weight:900;color:var(--text)">${vacRooms.reduce((s,r)=>s+getRoomOccupancy(r),0)}</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Occupied</th><th>Available Seats</th><th>Rent</th><th>Current Residents</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">No vacant seats available</td></tr>'}</tbody>
      </table>
    </div>`);
}

// ════════════════════════════════════════════════════════════════════════════
// MONTH DETAIL MODAL — editable, updatable, exportable
// ════════════════════════════════════════════════════════════════════════════
function showMonthDetailModal(monthKey, monthLabel) {
  renderMonthModal(monthKey, monthLabel);
}

function renderMonthModal(monthKey, monthLabel) {
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,monthKey));
  const paidPays = DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,monthKey));
  const pendPays = DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,monthKey));
  // Outgoings, not just DB.expenses — the Expenses KPI in this modal is
  // calcExpenses(), which counts the funds transfers too. Listing only
  // DB.expenses meant the table and the "N records" caption under that KPI
  // described a smaller set than the figure above them.
  const exps = _rptOutgoings(monthKey);
  const rev = calcRevenue(monthKey);
  // A transfer is an expense, so expTotal carries both and Available Fund is
  // revenue minus it — there is no separate transfer deduction anywhere.
  const expTotal = calcExpenses(monthKey);
  const pendTotal = pendPays.reduce((s,p)=>s+Number(p.amount),0);
  const netProfit = rev - expTotal;
  // The roster AS IT STOOD in this month — not whoever happens to be Active
  // today. Anyone with a fee record for the month is included regardless, so a
  // student who has since left still appears against the money they paid.
  const activeStudents = DB.students.filter(s =>
    _studentInPeriod(s, monthKey) ||
    DB.payments.some(p => p.studentId === s.id && _payMatchesMonth(p, monthKey)));

  const studentRows = activeStudents.map(s=>{
    const room = DB.rooms.find(r=>r.id===s.roomId);
    const sPays = DB.payments.filter(p=>p.studentId===s.id&&_payMatchesMonth(p,monthKey));
    const sPaid = sPays.filter(p=>p.status==='Paid').reduce((t,p)=>t+Number(p.amount),0);
    const sPend = sPays.filter(p=>p.status==='Pending').reduce((t,p)=>t+Number(p.amount),0);
    return `<tr>
      <td><span style="font-weight:700;color:var(--text)">${escHtml(s.name)}</span><div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'')}</div></td>
      <td style="font-weight:700;color:var(--text2)">#${escHtml(String(room?room.number:'—'))}</td>
      <td style="color:var(--text3);font-size:12px">${fmtPKR(s.rent)}/mo</td>
      <td style="color:var(--text);font-weight:700">${sPaid>0?fmtPKR(sPaid):'—'}</td>
      <td style="color:${sPend>0?'var(--text)':'var(--text3)'};font-weight:${sPend>0?'700':'400'}">${sPend>0?fmtPKR(sPend):'—'}</td>
      <td>${statusBadge(s.status)}</td>
    </tr>`;
  }).join('');

  const feeRows = pays.map(p=>`<tr id="fee-row-${p.id}">
    <td><span style="color:var(--text);font-weight:600">${escHtml(p.studentName||'—')}</span></td>
    <td style="color:var(--text2);font-weight:700">#${escHtml(String(p.roomNumber||'—'))}</td>
    <td class="text-muted">${escHtml(p.month||'—')}</td>
    <td>
      <span class="editable-cell" onclick="editMonthFeeField('${p.id}','amount',this)" title="Click to edit">${fmtPKR(p.amount)}</span>
    </td>
    <td>${pmBadge(p.method)}</td>
    <td>
      <select onchange="updateMonthPayStatus('${p.id}',this.value)" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer">
        <option value="Paid" ${p.status==='Paid'?'selected':''}>Paid</option>
        <option value="Pending" ${p.status==='Pending'?'selected':''}>Pending</option>
      </select>
    </td>
    <td class="text-muted" style="font-size:12px">
      <span class="editable-cell" onclick="editMonthFeeField('${p.id}','date',this)" title="Click to edit">${fmtDate(p.date)||'—'}</span>
    </td>
    <td>
      <button class="btn btn-danger btn-sm" style="font-size:10px;padding:3px 8px" onclick="deleteMonthPayment('${p.id}','${monthKey}','${escHtml(monthLabel)}')">${ICONS.trash}</button>
    </td>
  </tr>`).join('');

  // A legacy transfer row is not a DB.expenses record, so the inline cell
  // editors — which look the id up in DB.expenses — cannot edit it. Those rows
  // render as plain text and send edit/delete to the modals that own them.
  const expRows = exps.map(e=>{
    const cell = (field, html, extra) => e._transfer
      ? `<span${extra?' style="'+extra+'"':''}>${html}</span>`
      : `<span class="editable-cell"${extra?' style="'+extra+'"':''} onclick="editMonthExpField('${e.id}','${field}',this)" title="Click to edit">${html}</span>`;
    return `<tr id="exp-row-${e.id}">
    <td class="text-muted" style="font-size:12px">${cell('date', fmtDate(e.date)||'—')}</td>
    <td>${cell('category', escHtml(e.category||'—'))}</td>
    <td>${cell('description', escHtml(e.description||'—'))}</td>
    <td>${cell('amount', fmtPKR(e.amount), 'color:var(--text);font-weight:700')}</td>
    <td>
      <button class="btn btn-danger btn-sm" style="font-size:10px;padding:3px 8px" onclick="${e._transfer?`deleteTransfer('${e.id}')`:`deleteMonthExpense('${e.id}','${monthKey}','${escHtml(monthLabel)}')`}">${ICONS.trash}</button>
    </td>
  </tr>`;}).join('');

  showModal('modal-xl', `${ICONS.calendar} ${monthLabel} — Full Monthly Report`,
  `<!-- KPI Summary -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">${ICONS.money} Total Revenue</div>
      <div>${moneyValue(rev,{size:"section"})}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${paidPays.length} payments</div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">${ICONS.trendDown} Expenses</div>
      <div>${moneyValue(expTotal,{size:"section"})}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${exps.length} records</div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">${ICONS.bed.replace('icon','icon').slice(0,0)}${'<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 13a1 1 0 0 1 1 1v6a1 1 0 0 1-2 0v-6a1 1 0 0 1 1-1Zm7-9a1 1 0 0 1 1 1v15a1 1 0 0 1-2 0V5a1 1 0 0 1 1-1Zm7 4a1 1 0 0 1 1 1v11a1 1 0 0 1-2 0V9a1 1 0 0 1 1-1Z"/></svg>'} Available Fund</div>
      <div>${moneyValue(netProfit,{size:"section"})}</div>
      <!-- "Rev − Exp − Transfers" described a sum nothing computes: netProfit
           is rev − calcExpenses(), and calcExpenses() already carries the
           transfers. The caption implied they were deducted a second time. -->
      <div style="font-size:10px;color:var(--text3);margin-top:3px">Rev − Exp</div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">Pending</div>
      <div>${moneyValue(pendTotal,{size:"section"})}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${pendPays.length} unpaid</div>
    </div>
  </div>

  <!-- TAB NAVIGATION -->
  <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--bg3);padding:4px;border-radius:10px">
    <button onclick="switchMonthTab('students')" id="mtab-students" class="btn btn-sm" style="flex:1;border-radius:7px;background:var(--accent-dim);color:var(--accent-strong);border:1px solid rgba(37,99,235,0.3)">${ICONS.student} Students (${activeStudents.length})</button>
    <button onclick="switchMonthTab('fees')" id="mtab-fees" class="btn btn-sm" style="flex:1;border-radius:7px;background:transparent;color:var(--text3);border:none">${ICONS.card} Fee Records (${pays.length})</button>
    <button onclick="switchMonthTab('expenses')" id="mtab-expenses" class="btn btn-sm" style="flex:1;border-radius:7px;background:transparent;color:var(--text3);border:none">${ICONS.trendDown} Expenses (${exps.length})</button>
  </div>

  <!-- STUDENTS TAB -->
  <div id="mpanel-students">
    <div class="table-wrap">
      <table><thead><tr><th>Student</th><th>Room</th><th>Room Rent</th><th>Paid</th><th>Pending</th><th>Status</th></tr></thead>
      <tbody>${studentRows||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px">No students found</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <!-- FEES TAB -->
  <div id="mpanel-fees" style="display:none">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-primary btn-sm" onclick="addMonthPaymentFromModal('${monthKey}','${escHtml(monthLabel)}')">+ Add Fee Record</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th><th></th></tr></thead>
      <tbody id="fee-tbody">${feeRows||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:16px">No fee records</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <!-- EXPENSES TAB -->
  <div id="mpanel-expenses" style="display:none">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-primary btn-sm" onclick="addMonthExpenseFromModal('${monthKey}','${escHtml(monthLabel)}')">+ Add Expense</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead>
      <tbody id="exp-tbody">${expRows||'<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:16px">No expense records</td></tr>'}</tbody>
      </table>
    </div>
  </div>`,
  `<button class="btn btn-secondary" onclick="exportMonthCSV('${monthKey}','${escHtml(monthLabel)}')">${ICONS.download} Export CSV</button>
   <button class="btn btn-secondary" onclick="printMonthReport('${monthKey}','${escHtml(monthLabel)}')">${ICONS.print} Print Report</button>
   <button class="btn btn-primary" onclick="closeModal()">${ICONS.check} Done</button>`
  );
}

function switchMonthTab(tab) {
  ['students','fees','expenses'].forEach(t=>{
    const panel=document.getElementById('mpanel-'+t);
    const btn=document.getElementById('mtab-'+t);
    if(!panel||!btn) return;
    const active = t===tab;
    panel.style.display=active?'block':'none';
    if(active){btn.style.background='var(--accent-dim)';btn.style.color='var(--accent-strong)';btn.style.border='1px solid rgba(37,99,235,0.3)';}
    else{btn.style.background='transparent';btn.style.color='var(--text3)';btn.style.border='none';}
  });
}

async function editMonthFeeField(payId, field, cell) {
  const pay = DB.payments.find(p=>p.id===payId);
  if(!pay) return;
  const old = field==='amount'?pay.amount:pay[field];
  const inp = document.createElement('input');
  inp.type = field==='date'?'date':'text';
  inp.value = old||'';
  inp.className='editing-cell';
  inp.style.width='120px';
  cell.replaceWith(inp);
  inp.focus();
  const save = async ()=>{
    const newVal = inp.value.trim();
    if(field==='amount') pay.amount=Number(newVal)||pay.amount;
    else pay[field]=newVal;
    await saveDB();
    const span=document.createElement('span');
    span.className='editable-cell';
    span.title='Click to edit';
    span.onclick=()=>editMonthFeeField(payId,field,span);
    span.textContent = field==='amount'?fmtPKR(pay.amount):(field==='date'?fmtDate(pay[field]):pay[field]);
    if(field==='amount'){span.style.color='var(--text)';span.style.fontWeight='700';}
    inp.replaceWith(span);
    toast('Updated successfully','success');
  };
  inp.onblur=save;
  inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape')inp.blur();};
}

function editMonthExpField(expId, field, cell) {
  const exp = DB.expenses.find(e=>e.id===expId);
  if(!exp) return;
  const old = field==='amount'?exp.amount:exp[field];
  const inp = document.createElement('input');
  inp.type = field==='date'?'date':'text';
  inp.value = old||'';
  inp.className='editing-cell';
  inp.style.width = field==='description'?'200px':'120px';
  cell.replaceWith(inp);
  inp.focus();
  const save = async ()=>{
    const newVal = inp.value.trim();
    if(field==='amount') exp.amount=Number(newVal)||exp.amount;
    else exp[field]=newVal;
    await saveDB();
    const span=document.createElement('span');
    span.className='editable-cell';
    span.title='Click to edit';
    span.onclick=()=>editMonthExpField(expId,field,span);
    span.textContent = field==='amount'?fmtPKR(exp.amount):(field==='date'?fmtDate(exp[field]):exp[field]);
    if(field==='amount'){span.style.color='var(--text)';span.style.fontWeight='700';}
    inp.replaceWith(span);
    toast('Updated successfully','success');
  };
  inp.onblur=save;
  inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape')inp.blur();};
}

async function updateMonthPayStatus(payId, newStatus) {
  const pay = DB.payments.find(p=>p.id===payId);
  if(!pay) return;
  pay.status = newStatus;
  if(newStatus==='Paid' && !pay.paidDate) pay.paidDate = today();
  if(newStatus==='Pending') pay.paidDate='';
  await saveDB();
  toast('Payment status updated to '+newStatus,'success');
}

async function deleteMonthPayment(payId, monthKey, monthLabel) {
  showConfirm('Delete Fee Record','Remove this fee record? This cannot be undone.',async ()=>{
    DB.payments = DB.payments.filter(p=>p.id!==payId);
    await saveDB();
    toast('Fee record deleted','success');
    renderMonthModal(monthKey, monthLabel);
  });
}

async function deleteMonthExpense(expId, monthKey, monthLabel) {
  showConfirm('Delete Expense','Remove this expense record? This cannot be undone.',async ()=>{
    DB.expenses = DB.expenses.filter(e=>e.id!==expId);
    await saveDB();
    toast('Expense deleted','success');
    renderMonthModal(monthKey, monthLabel);
  });
}

function addMonthPaymentFromModal(monthKey, monthLabel) {
  closeModal();
  openAddPayment();
}

function addMonthExpenseFromModal(monthKey, monthLabel) {
  closeModal();
  showAddExpenseModal();
}

function exportMonthCSV(monthKey, monthLabel) {
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,monthKey));
  // The Expenses section lists transfers too, under their own category, so the
  // rows add up to the Expenses figure in the summary block above them.
  const exps = _rptOutgoings(monthKey);
  const rev = calcRevenue(monthKey);
  const expTotal = calcExpenses(monthKey);
  let csv = `${DB.settings.hostelName} | ${monthLabel} Report\n\n`;
  csv += `Summary\nTotal Revenue,${rev}\nExpenses,${expTotal}\nAvailable Fund,${rev-expTotal}\nPending,${pays.filter(p=>p.status==='Pending').reduce((s,p)=>s+outstandingOf(p),0)}\n\n`;
  csv += `Fee Records\nStudent,Room,Month,Amount,Method,Status,Date\n`;
  // Ordered by room like every other roster, export and PDF in the app — the
  // warden reads this sheet against the building, not against insertion order.
  pays.slice().sort((a,b)=>cmpRoomNo(a.roomNumber,b.roomNumber)).forEach(p=>{ csv += [csvEsc(p.studentName),csvEsc(p.roomNumber),csvEsc(p.month),Number(p.amount),csvEsc(p.method),csvEsc(p.status),csvEsc(p.date||p.dueDate||'')].join(',')+"\n"; });
  // Grouped with a subtotal per category and a grand total, matching the
  // register the Reports screen and the PDFs now print.
  csv += `\nExpenses by Category\nCategory,Date,Description,Amount\n`;
  const _mGroups = _rptByCategory(exps);
  _mGroups.forEach(g=>{
    g.items.forEach(e=>{ csv += [csvEsc(g.cat),csvEsc(e.date),csvEsc(e.description),Number(e.amount)].join(',')+"\n"; });
    csv += ['','','Total — '+csvEsc(g.cat),g.total].join(',')+"\n\n";
  });
  csv += ['','','GRAND TOTAL',_rptGroupsTotal(_mGroups)].join(',')+"\n";
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Hostel_Report_${monthKey}.csv`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500); // FIX 16: revoke blob URL to free memory
  toast('CSV exported successfully','success');
}

function printMonthReport(monthKey, monthLabel) {
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,monthKey));
  // Transfers print as expense rows under their own category, so the Expenses
  // table adds up to the Expenses KPI above it.
  const exps = _rptOutgoings(monthKey);
  const rev = calcRevenue(monthKey);
  const expTotal = calcExpenses(monthKey);
  const pend = DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,monthKey)).reduce((s,p)=>s+outstandingOf(p),0);
  const activeStudents = DB.students.filter(s=>s.status==='Active');
  const _mRptHtml = `<!DOCTYPE html><html><head><title>${monthLabel} Report</title>
  ${printDocStyles()}
  </head><body>
  <div class="header">
    <div><div class="title">${escHtml(DB.settings.hostelName)}</div><div class="subtitle">${monthLabel} Report · Generated ${new Date().toLocaleDateString()}</div></div>
    <div class="badge">Monthly Report</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><label>Total Revenue</label><div class="val green">${fmtPKR(rev)}</div></div>
    <div class="kpi"><label>Expenses</label><div class="val red">${fmtPKR(expTotal)}</div></div>
    <div class="kpi"><label>Available Fund</label><div class="val" style="color:${rev-expTotal>=0?'#16a34a':'#dc2626'}">${fmtPKR(rev-expTotal)}</div></div>
    <div class="kpi"><label>Pending</label><div class="val gold">${fmtPKR(pend)}</div></div>
  </div>
  <div class="section"><h3>${ICONS.student} Active Students (${activeStudents.length})</h3>
    <table><thead><tr><th>Name</th><th>Room</th><th>Rent</th><th>Phone</th><th>Status</th></tr></thead><tbody>
    ${activeStudents.map(s=>{const rm=DB.rooms.find(r=>r.id===s.roomId);return `<tr><td>${escHtml(s.name)}</td><td class="gold">#${escHtml(String(rm?rm.number:'—'))}</td><td>${fmtPKR(s.rent)}</td><td>${escHtml(s.phone||'')}</td><td>${s.status}</td></tr>`;}).join('')||'<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">No students</td></tr>'}
    </tbody></table>
  </div>
  <div class="section"><h3>${ICONS.card} Fee Records</h3>
    <table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${pays.map(p=>`<tr><td>${escHtml(p.studentName||'—')}</td><td class="gold">#${p.roomNumber||'—'}</td><td>${escHtml(p.month||'—')}</td><td class="${p.status==='Paid'?'green':'red'}">${fmtPKR(p.amount)}</td><td>${escHtml(p.method||'—')}</td><td class="${p.status==='Paid'?'green':'red'}">${p.status}</td><td>${fmtDate(p.date)||'—'}</td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:12px">No records</td></tr>'}
    </tbody></table>
  </div>
  <div class="section"><h3>${ICONS.trendDown} Expenses by Category</h3>
    ${_rptCatTablesHTML(exps)}
  </div>
  <div class="footer">Generated ${new Date().toLocaleDateString()} · ${escHtml(DB.settings.hostelName)} · Confidential</div>
  </body></html>`;
  _electronPDF(_mRptHtml, (DB.settings.hostelName||'Report').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_'+monthLabel.replace(/\s+/g,'-')+'.pdf', {pageSize:'A4'});
}

// ════════════════════════════════════════════════════════════════════════════
// CANCELLATIONS
// ════════════════════════════════════════════════════════════════════════════

// ── ROOM TYPE DONUT CHART ────────────────────────────────────────────────────
var _dashDonutChart = null;
function drawRoomDonut() {
  var canvas = document.getElementById('dash-roomtype-donut');
  if(!canvas || typeof Chart==='undefined') return;
  if(_dashDonutChart){_dashDonutChart.destroy();_dashDonutChart=null;}

  var types = DB.settings.roomTypes || [];
  if(!types.length) return;

  var labels = [];
  var data = [];
  var colors = [];

  // Room-type colours are DATA (owner-configured in Settings), not styling —
  // the donut uses each type's own colour so it matches the legend beside it.
  var fallback = ['#3b82f6','#22c55e','#f97316','#8b5cf6','#ef4444'];

  types.forEach(function(t, i) {
    var tRooms = DB.rooms.filter(function(r){return r.typeId===t.id;});
    var seats = tRooms.length * t.capacity;
    if(seats > 0) {
      labels.push(t.name);
      data.push(seats);
      colors.push(t.color || fallback[i % fallback.length]);
    }
  });

  // Separate the segments with the card colour rather than a fixed white, so the
  // ring reads the same in both themes. theme.js already re-runs this on toggle.
  var cardBg = getComputedStyle(document.body).getPropertyValue('--card').trim() || '#161616';

  _dashDonutChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: cardBg,
        hoverOffset: 5
      }]
    },
    options: {
      cutout: '64%',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 2 },
      animation: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          titleFont: { size: 13, weight: '700' },
          bodyFont: { size: 12, weight: '600' },
          padding: 10,
          callbacks: {
            label: function(ctx) {
              var total = ctx.dataset.data.reduce(function(a,b){return a+b;},0);
              var pct = total>0 ? Math.round(ctx.parsed/total*100) : 0;
              return ctx.label + ': ' + ctx.parsed + ' seats (' + pct + '%)';
            }
          }
        }
      }
    }
  });
  _chartFontFix(_dashDonutChart);
}

// ── TREND CHART (Chart.js — Jan–Dec, revenue line + hover tooltip) ───────────
var _dashTrendChart = null;
setTimeout(function(){
  if(typeof Chart!=='undefined'&&typeof ChartDataLabels!=='undefined') Chart.register(ChartDataLabels);
},0);

/* THE TREND RANGE — db3.png's Quarter / 6 Months / Year switch.
 *
 * The header carried a static "Jan – Dec" label where the reference has a
 * control. A label that states what the chart shows is fine; a control that
 * lets you change it is better, and it is what the design asks for.
 *
 * Deliberately NOT a rolling window: the ranges end at the current month and
 * count back, so "Quarter" is the last three months INCLUDING this one. Every
 * other figure on this dashboard is scoped to a month the sidebar picks, and a
 * chart that quietly showed a different span than the cards around it would be
 * the same class of disagreement as D-1.
 *
 * Year is the default because it is the only one of the three that shows a
 * season, which is what a hostel's takings actually have. */
var _dashTrendRange = 'year';
var TREND_RANGES = { quarter: 3, '6m': 6, year: 12 };

function setTrendRange(r) {
  if (!TREND_RANGES[r]) return;
  _dashTrendRange = r;
  document.querySelectorAll('.trend-range__b').forEach(function (b) {
    b.classList.toggle('is-on', b.dataset.range === r);
  });
  drawTrendChart();
}

function drawTrendChart() {
  var canvas = document.getElementById('trend-canvas');
  if (!canvas || typeof Chart === 'undefined') return;

  var MS2 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MN2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var now  = new Date();
  var yr   = now.getFullYear();
  var curKey = yr + '-' + String(now.getMonth()+1).padStart(2,'0');

  var months=[], revD=[], expD=[], pendD=[], real=[];
  for(var i=0;i<12;i++){
    var k = yr+'-'+String(i+1).padStart(2,'0');
    var isPast = k <= curKey;
    var rev = isPast ? calcRevenue(k) : 0;
    var exp = isPast ? calcExpenses(k)  : 0;   // transfers included
    var pend= isPast ? (DB.payments||[]).filter(p=>p.status==='Pending'&&_payMatchesMonth(p,k)).reduce((s,p)=>s+outstandingOf(p),0) : 0;
    months.push({label:MS2[i], full:MN2[i]+' '+yr, key:k});
    // null means "this month has not happened", NOT "this month was zero".
    // These used to collapse both cases to null and then map null→0, so every
    // line ran flat along the axis out to December — a chart of a year that is
    // half over claimed eight months of zero revenue. A month that is past and
    // genuinely zero still plots 0; a future month plots null and the line
    // simply stops (Chart.js spanGaps defaults to false).
    revD.push(isPast?rev:null);
    expD.push(isPast?exp:null);
    pendD.push(isPast?pend:null);
    real.push(isPast&&rev>0);
  }

  /* Trim to the chosen range. The series are built for the whole year first and
     sliced after, rather than looping only over the range: the arrays are
     twelve numbers and the cost is nothing, while a second month-walk would be
     a second place for the "future months are null, not zero" rule to be got
     wrong. The window ENDS at the current month — a hostel does not want three
     months of a year that has not happened. */
  var _span = TREND_RANGES[_dashTrendRange] || 12;
  if (_span < 12) {
    var _end = now.getMonth() + 1;               // count of months so far
    var _from = Math.max(0, _end - _span);
    months = months.slice(_from, _end);
    revD   = revD.slice(_from, _end);
    expD   = expD.slice(_from, _end);
    pendD  = pendD.slice(_from, _end);
    real   = real.slice(_from, _end);
  }

  // resolve CSS vars at draw time → adapts to dark/light theme
  var _cs = getComputedStyle(document.body);
  var cGreen  = _cs.getPropertyValue('--green').trim()  || '#45dfa4';
  var cRed    = _cs.getPropertyValue('--red').trim()    || '#ffb4ab';
  var cAmber  = _cs.getPropertyValue('--amber').trim()  || '#fbbf24';
  var cAccent = _cs.getPropertyValue('--accent').trim() || '#3b82f6';
  // Design guide §12 fixes the series colours: Revenue blue, Expenses red,
  // Pending purple. Revenue used to be green and Pending the accent blue,
  // which put two blues on one chart and left green doing double duty as both
  // "revenue" and "went up".
  var cRevenue = _cs.getPropertyValue('--blue').trim()   || '#2563eb';
  /* EXPENSES IS A PALE TINT OF REVENUE, NOT RED — db3.png's chart is one hue in
     two weights, and it reads better for the reason it usually does: the two
     bars are the same KIND of thing (money moving in a month), so the eye should
     compare their heights, not their colours. Red also said "bad" about a
     hostel's ordinary running costs, which is a judgement the chart has no
     business making.

     Derived from the revenue colour rather than fixed, so it follows the theme
     and any future accent change. Same +alpha idiom the faint-month bars below
     already use, which assumes --blue resolves to hex. */
  var cExpense = cRevenue + '4D';
  var cPending = _cs.getPropertyValue('--purple').trim() || '#8b5cf6';
  var cText2  = _cs.getPropertyValue('--text2').trim()  || '#8a9ab8';
  var cText3  = _cs.getPropertyValue('--text3').trim()  || '#4a6080';
  var cBg2    = _cs.getPropertyValue('--bg2').trim()    || '#1c1b1b';
  var cBorder = _cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.07)';

  // Plotted as-is: the nulls are meaningful and must reach Chart.js intact.
  var plotRev = revD;
  // Points follow the Revenue series colour. They used to be green/red by
  // rise-or-fall, which read as a second meaning on the same mark — the
  // datalabels below already carry the ▲/▼ and its colour.
  var ptColors = plotRev.map(function(v,i){ return real[i] ? cRevenue : cRevenue+'26'; });
  var lblColors = plotRev.map(function(v,i){
    if(!real[i]) return cText3;
    if(i===0) return cGreen;
    return v>=(plotRev[i-1]||0)?cGreen:cRed;
  });

  var badge = document.getElementById('trend-hb');
  function showBadge(idx,x,y){
    // calcExpenses() — and so expD — already carries the transfers, so Net is
    // revenue minus expenses full stop. Subtracting trf as well deducted every
    // transfer TWICE, which is why this tooltip's Net disagreed with the
    // Available Fund card sitting directly above the chart.
    var rev=revD[idx]||0, exp=expD[idx]||0, pend=pendD[idx]||0, net=rev-exp;
    var isR=real[idx];
    badge.innerHTML='<div style="font-size:12px;font-weight:700;color:'+cText2+';margin-bottom:8px">'+months[idx].full+'</div>'+(isR?[
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="display:flex;align-items:center;gap:5px;color:'+cText3+'"><span style="width:7px;height:7px;border-radius:50%;background:'+cRevenue+';display:inline-block"></span>Revenue</span><span style="font-weight:700;color:'+cRevenue+'">'+fmtPKR(rev)+'</span></div>',
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="display:flex;align-items:center;gap:5px;color:'+cText3+'"><span style="width:7px;height:7px;border-radius:50%;background:'+cRevenue+'80;display:inline-block"></span>Expenses</span><span style="font-weight:700;color:'+cText2+'">'+fmtPKR(exp)+'</span></div>',
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="display:flex;align-items:center;gap:5px;color:'+cText3+'"><span style="width:7px;height:7px;border-radius:50%;background:'+cPending+';display:inline-block"></span>Pending</span><span style="font-weight:700;color:'+cPending+'">'+fmtPKR(pend)+'</span></div>',
      '<hr style="border:none;border-top:1px solid '+cBorder+';margin:6px 0"/>',
      '<div style="display:flex;justify-content:space-between;font-weight:700"><span>Net</span><span style="color:'+(net>=0?cGreen:cRed)+'">'+(net>=0?'+':'−')+fmtPKR(net)+'</span></div>'
    ].join(''):'<div style="color:'+cText3+';font-size:12px;text-align:center;padding:6px 0">No data yet</div>');
    var vw=window.innerWidth, vh=window.innerHeight;
    var left=x+16; if(left+230>vw) left=x-240;
    var top=y-80;  if(top<8) top=y+16; if(top+220>vh) top=vh-230;
    badge.style.left=left+'px'; badge.style.top=top+'px'; badge.style.display='block';
  }

  // Supporting series. Nulls pass through exactly as they do for revenue, so
  // all four lines stop at the current month; datalabels are off so only the
  // revenue figures are called out.
  function secondary(label, arr, hex) {
    return {
      label: label,
      data: arr,
      // The companion bar. Deliberately quieter than revenue — this panel is
      // 178px tall, and two equally loud bar series in that space is a pattern
      // rather than a comparison. Same faint treatment for months with no
      // record, so both series describe the gap the same way.
      backgroundColor: function (c) { return real[c.dataIndex] ? hex : hex + '33'; },
      borderColor: 'transparent', borderWidth: 0,
      borderRadius: 3, borderSkipped: false,
      categoryPercentage: 0.72, barPercentage: 0.92,
      datalabels: { display: false }
    };
  }

  if(_dashTrendChart){_dashTrendChart.destroy();_dashTrendChart=null;}

  /* BARS, NOT LINES — design 1c ("Ledger").

     A line implies a value between the points. These are twelve discrete
     monthly totals, and the months with nothing recorded are marked in `real[]`
     precisely because there is no value to interpolate there. A bar chart says
     what this data actually is: twelve separate figures, side by side.

     Which also removes the awkwardness the line version carried — a point drawn
     at zero for a month the hostel recorded nothing, sitting on the axis
     looking like a month of no income. A bar of zero height is simply absent. */
  _dashTrendChart = new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{
      labels:months.map(function(m){return m.label;}),
      datasets:[{
        label:'Revenue',
        data:plotRev,
        backgroundColor:function(c){
          // Months with no record are drawn faint rather than skipped: the gap
          // in the year is itself information, and a missing bar reads as a
          // rendering fault.
          return real[c.dataIndex] ? cRevenue : cRevenue+'33';
        },
        borderColor:'transparent', borderWidth:0,
        borderRadius:3, borderSkipped:false,
        // Bars carry the category width between them; a category percentage
        // near 1 with a bar percentage below it puts the air INSIDE the pair,
        // which is what makes a two-series comparison readable.
        categoryPercentage:0.72, barPercentage:0.92,
        /* NO DATALABELS. db3.png's chart has none, and on real data the
           rise/fall badges were actively misleading: a hostel whose first
           month held a token amount produced "▲ +157902725.6%" floating over
           the bars. A percentage against a near-zero baseline is a true
           division and a meaningless statement.

           The movement is still readable — that is what a bar chart is for —
           and the exact figures for any month are one hover away in the badge,
           which is where a precise number belongs. */
        datalabels:{ display:false }
      },
      // The legend above this chart has always advertised four series, but
      // only the revenue line was ever drawn — expD/pendD were computed
      // for all twelve months and then used by nothing but the hover badge.
      // They are plotted here so the legend describes what is on screen.
      //
      // Revenue stays the headline: it keeps the area wash, the per-month
      // datalabels and the rise/fall point colouring. The other three are
      // deliberately quieter — thinner stroke, no fill, no labels — because
      // this panel is 178px tall and four equally-weighted filled lines in
      // that space is noise, not a comparison.
      // No Transfers series: expD already CONTAINS the transfers, so a second
      // one drew the same money twice and a reader adding the two got a figure
      // the ledger never held.
      secondary('Expenses',  expD,  cExpense)]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:false,
      layout:{padding:{top:50,right:10,left:4,bottom:0}},
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      onHover:function(event,els){
        if(els.length>0){
          var cx=event.native?event.native.clientX:event.x;
          var cy=event.native?event.native.clientY:event.y;
          showBadge(els[0].index,cx,cy);
        } else { if(badge) badge.style.display='none'; }
      },
      scales:{
        x:{grid:{color:cBorder},border:{display:false},ticks:{color:cText3,font:{size:11}}},
        y:{grid:{color:cBorder},border:{display:false},ticks:{color:cText3,font:{size:11},maxTicksLimit:5,callback:function(v){
          /* The ladder stopped at M, so a hostel billing in whole rupees got
             axis labels like "1500000.0M" — arithmetically right and unreadable.
             fmtCompact() carries B and T, and it is the same function the KPI
             row uses, so the axis and the cards round the same way. Under 10M
             it returns exact digits, which is too long for a tick, so the axis
             keeps its own short form below that threshold. */
          var a=Math.abs(v);
          if(a>=1e7) return fmtCompact(v);
          if(a>=1e6) return (v/1e6).toFixed(1).replace(/\.0$/,'')+'M';
          if(a>=1e3) return (v/1e3).toFixed(0)+'K';
          return v;
        }}}
      }
    }
  });
  _chartFontFix(_dashTrendChart);
}
// ─────────────────────────────────────────────────────────────────────────────

function navigateToMonth(monthKey) {
  const realMonth = ym(new Date());
  _dashboardMonth = (monthKey === realMonth) ? null : monthKey;
  const resetBtn = document.getElementById('sb-cal-reset-btn');
  if(resetBtn) resetBtn.style.display = _dashboardMonth ? 'inline-block' : 'none';
  if(currentPage === 'reports') {
    reportPeriod = 'month'; reportDetail = null; renderPage('reports');
  } else if(currentPage === 'dashboard') {
    renderPage('dashboard');
  } else {
    // Stay on whatever page the user is on — re-render it filtered to the new month
    renderPage(currentPage);
  }
  const d = new Date(monthKey+'-01');
  toast('Viewing → ' + d.toLocaleString('default',{month:'long',year:'numeric'}), 'info');
}

// downloadDetailCSV(type) is defined in src/modules/reports.js (loads after this
// file and is a strict superset). The former copy here was dead-shadowed; removed.
let calPopoverOpen = false;
function calPopSelect(key, label) {
  document.getElementById('cal-popover-el')?.remove();
  calPopoverOpen=false;
  showMonthDetailModal(key, label);
}


// checkAutoMonthAdvance() lived here. It ran at boot and raised a Pending
// payment row against every active student for each month that had rolled
// over since the last launch. Records the warden never entered were landing
// in the ledger and in every figure derived from it, so the automatic path is
// gone; Auto-Generate Month on the Payments screen is now the only way to
// create a month of rent records in bulk.

// Alias the old name for backward compat

// ── DASHBOARD GLOBAL SEARCH
function dashGlobalSearch(query) {
  var clearBtn = document.getElementById('dash-search-clear');
  var resultsBox = document.getElementById('dash-search-results');
  if (!resultsBox) return;
  if (clearBtn) clearBtn.style.display = query.length > 0 ? 'inline-flex' : 'none';
  if (!query.trim()) { resultsBox.style.display = 'none'; return; }

  var q = query.trim().toLowerCase();
  var results = [];

  // Search students: name, father name, CNIC, phone, address, city
  DB.students.forEach(function(s) {
    var room = DB.rooms.find(function(r){ return r.id === s.roomId; });
    var roomLabel = room ? '#' + room.number : '—';
    var haystack = [s.id, s.name, s.fatherName, s.cnic, s.phone, s.emergencyContact, s.email, s.occupation, s.address, s.city, s.permanentAddress, roomLabel].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: 'student', icon: ICONS.student,
        title: s.name || '—',
        sub: 'ID: ' + s.id + ' · Room ' + roomLabel + (s.occupation ? ' · ' + s.occupation : '') + (s.phone ? ' · ' + s.phone : ''),
        badge: statusBadge(s.status || 'Active'),
        action: "showViewStudentModal('" + s.id + "')"
      });
    }
  });

  // Search rooms: number, type, floor, amenities
  DB.rooms.forEach(function(r) {
    var type = getRoomType(r);
    var occ = getRoomOccupancy(r);
    var haystack = ['room', r.number, type ? type.name : '', r.floor, (r.amenities || []).join(' ')].join(' ').toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: 'room', icon: ICONS.bed,
        title: 'Room #' + r.number,
        sub: (type ? type.name : '') + ' · ' + r.floor + ' Floor · ' + occ + '/' + (type ? type.capacity : 1) + ' filled',
        badge: '<span class="badge" style="' + (occ >= (type ? type.capacity : 1) ? 'background:var(--bg4);border:1px solid var(--border);color:var(--text3)' : 'background:var(--accent-dim);border:1px solid rgba(37,99,235,0.3);color:var(--accent-strong)') + '">' + (occ >= (type ? type.capacity : 1) ? 'Full' : 'Available') + '</span>',
        action: "showRoomDetail('" + r.id + "')"
      });
    }
  });

  // Search by city / address / location
  var locationHits = {};
  DB.students.forEach(function(s) {
    var fields = [s.city, s.address, s.permanentAddress].filter(Boolean);
    fields.forEach(function(f) {
      if (f.toLowerCase().includes(q)) {
        var key = f.toLowerCase();
        if (!locationHits[key]) locationHits[key] = {city: f, students: []};
        locationHits[key].students.push(s.name);
      }
    });
  });
  Object.keys(locationHits).slice(0, 4).forEach(function(k) {
    var hit = locationHits[k];
    results.push({
      type: 'location', icon: ICONS.pin,
      title: hit.city,
      sub: hit.students.slice(0, 3).join(', ') + (hit.students.length > 3 ? ' +' + (hit.students.length - 3) + ' more' : ''),
      badge: '<span class="badge badge-gray">' + hit.students.length + ' student' + (hit.students.length !== 1 ? 's' : '') + '</span>',
      action: "studentFilter.search='" + hit.city.replace(/'/g, "\\'") + "';navigate('students')"
    });
  });

  // Payments by student name
  var payHits = [];
  DB.payments.forEach(function(p) {
    if ((p.studentName || '').toLowerCase().includes(q)) {
      if (!payHits.find(function(x){ return x.studentId === p.studentId; })) {
        payHits.push(p);
      }
    }
  });
  payHits.slice(0, 3).forEach(function(p) {
    results.push({
      type: 'payment', icon: ICONS.card,
      title: p.studentName || '—',
      sub: p.month + ' · ' + (p.status === 'Paid' ? 'Paid' : 'Pending') + ' · ' + fmtPKR(p.amount),
      badge: statusBadge(p.status),
      action: "payFilter.search='" + (p.studentName||'').replace(/'/g, "\\'") + "';navigate('payments')"
    });
  });

  if (!results.length) {
    resultsBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No results for <strong style="color:var(--text)">"' + escHtml(query) + '"</strong></div>';
    resultsBox.style.display = 'block';
    // Position under the search input
    var inp = document.getElementById('dash-global-search');
    if (inp) { var r2 = inp.getBoundingClientRect(); resultsBox.style.left = r2.left + 'px'; }
    return;
  }

  var grouped = {student:[], room:[], location:[], payment:[]};
  var groupLabels = {student:'Students', room:'Rooms', location:'Locations / Addresses', payment:'Finance'};
  // Also group by course for course searches
  var courseSub = {};
  DB.students.forEach(function(s){
    if(s.occupation && s.occupation.toLowerCase().includes(q)){
      var k = s.occupation;
      if(!courseSub[k]) courseSub[k]={course:k,students:[]};
      courseSub[k].students.push(s.name);
    }
  });
  Object.keys(courseSub).slice(0,3).forEach(function(k){
    var hit=courseSub[k];
    grouped['student'].push({type:'student',icon:ICONS.student,title:hit.course,sub:hit.students.slice(0,4).join(', ')+(hit.students.length>4?' +'+(hit.students.length-4)+' more':''),badge:'<span class="badge badge-gray">'+hit.students.length+' student'+(hit.students.length!==1?'s':'')+'</span>',action:"studentFilter.search='"+hit.course.replace(/'/g,"\\'")+ "';navigate('students')"});
  });
  results.forEach(function(r){ if (grouped[r.type]) grouped[r.type].push(r); });

  var html = '';
  ['student','room','location','payment'].forEach(function(type) {
    var items = grouped[type];
    if (!items.length) return;
    html += '<div style="padding:8px 14px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);border-bottom:1px solid var(--border)">' + groupLabels[type] + ' <span style="color:var(--text2)">' + items.length + '</span></div>';
    items.slice(0, 5).forEach(function(item) {
      html += '<div onclick="' + item.action + ';document.getElementById(\'dash-global-search\').value=\'\';dashGlobalSearchClear()" style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.12s" onmouseover="this.style.background=\'var(--bg3)\'" onmouseout="this.style.background=\'\'">';
      html += '<div style="width:32px;height:32px;border-radius:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">' + item.icon + '</div>';
      html += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(item.title) + '</div>';
      html += '<div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">' + escHtml(item.sub) + '</div></div>';
      html += '<div style="flex-shrink:0">' + item.badge + '</div></div>';
    });
  });

  resultsBox.innerHTML = html;
  resultsBox.style.display = 'block';
  // Align dropdown under the header search input
  var inp2 = document.getElementById('dash-global-search');
  if (inp2) { var r3 = inp2.getBoundingClientRect(); resultsBox.style.left = r3.left + 'px'; }
}

function dashGlobalSearchClear() {
  var resultsBox = document.getElementById('dash-search-results');
  var clearBtn = document.getElementById('dash-search-clear');
  if (resultsBox) resultsBox.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
}

// Close search results when clicking outside
document.addEventListener('click', function(e) {
  var box = document.getElementById('dash-search-results');
  var input = document.getElementById('dash-global-search');
  if (box && input && !box.contains(e.target) && e.target !== input) {
    box.style.display = 'none';
  }
});// ════════════════════════════════════════════════════════════════════════════
// 6-MONTH DATA RETENTION
// ════════════════════════════════════════════════════════════════════════════