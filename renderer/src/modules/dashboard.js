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
  /* nAdvance / nArrears / nCurrent were added for the Advance / Arrears KPI,
     which names a count beside each figure. They count CASH EVENTS, not
     records: one record collected in two instalments across two months is two
     events, and the card's "8 payments" has to mean the same thing as the
     rupees beside it or the two disagree. */
  const out = { total: 0, current: 0, arrears: 0, advance: 0, count: 0,
                nCurrent: 0, nArrears: 0, nAdvance: 0 };
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
      if (!mine || mine === k)  { out.current += e.amount; out.nCurrent++; }
      else if (mine < k)        { out.arrears += e.amount; out.nArrears++; }
      else                      { out.advance += e.amount; out.nAdvance++; }
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
/* ── THE KPI PROGRESS BAR (final-layout spec §1) ────────────────────────────
   Replaces the sparkline. A sparkline showed a SHAPE — twelve months of
   movement with no axis and no scale — which on a KPI card answers a question
   nobody asked of it: the card states one figure for one month, and the reader
   wants to know how that figure stands against what it could be.

   So: a 0-100% bar with its ends labelled, and a percentage that is computed
   from the two numbers the card already shows. Every one of them is a real
   ratio, not a decoration:

     Revenue      collected / expected this month
     Expenses     spent / collected      (what the month's takings went on)
     Fund         kept / collected       (what survived the spending)
     Pending      outstanding / expected
     Advance      out-of-month cash / all cash taken

   `pct` is clamped to 0-100 for the BAR only. The label prints the true
   figure, because a month that spent more than it took is a thing a warden
   needs to see said out loud rather than flattened to "100%". */
function _dashBar(part, whole, tone) {
  const w = Number(whole || 0);
  const raw = w > 0 ? (Number(part || 0) / w * 100) : 0;
  const shown = Math.round(raw);
  const fill = Math.max(0, Math.min(100, raw));
  return '<div class="kbar' + (tone ? ' ' + tone : '') + '">'
       +   '<div class="kbar__pct">' + shown + '%</div>'
       +   '<div class="kbar__track"><i style="width:' + fill.toFixed(1) + '%"></i></div>'
       +   '<div class="kbar__ends"><span>0%</span><span>100%</span></div>'
       + '</div>';
}

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

/* -- THE GREETING (reference: `dashboard globel.png`) ------------------------
   IT SITS ON THE HEADER ROW, NOT ABOVE THE KPI CARDS, and that is the whole
   design decision here.

   Built first as its own band it looked exactly like the reference and cost
   ~72px of page height, which pushed rows A-C past the fold at all three
   shipped sizes (1366x768 by 43px, 1920x1080 @150% by 61, 1366x768 @125% by
   72) and failed `dashboard-cards.spec.js`. That is not a new fault: the alert
   banners that used to stand in that exact place were deleted for it, and the
   note left where they stood says why - "a duplicate that costs the primary
   content its position is not a second chance to be seen; it is a tax on the
   screen that matters". A greeting is chrome, and chrome does not get to push
   figures off the screen.

   The reference agrees, as it happens: it draws the greeting on the TITLE row
   beside "Dashboard", not on a row of its own. So this goes there - into the
   spare width of #header, next to the page title, where it costs zero height.
   It ellipsises before it crowds the search field and hides under 1180px.

   THE TAGLINE IS `DB.settings.tagline`, a field the owner sets in Settings. The
   reference prints "Better Living. Brighter Futures."; printing that string
   would put a sentence on the dashboard that this hostel never wrote. There is
   no room for it on the header row, so it rides in the footer instead - and if
   the setting is empty nothing is drawn, rather than a motto of my invention
   (per the reconstruction mandate). */
function _dashGreeting() {
  const h = new Date().getHours();
  /* FIVE WINDOWS. Three was wrong in the way that matters: everything after
     17:00 read "Good evening" and everything before noon read "Good morning",
     so opening the app at 1am was greeted with the morning. A hostel office is
     staffed around the clock and the small hours are a real shift here.

       01-04  Late night     the shift nobody plans for
       05-11  Good morning
       12-16  Good afternoon
       17-20  Good evening
       21-00  Good night

     The phrase is recomputed on a timer (see _chromeClockTick in nav.js), so
     an app left open across a boundary does not keep yesterday's greeting. */
  const part = h < 1  ? 'night'
             : h < 5  ? 'late night'
             : h < 12 ? 'morning'
             : h < 17 ? 'afternoon'
             : h < 21 ? 'evening'
             : 'night';
  const sun  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>';
  const who  = (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : '';

  /* "Late night" is not something you wish someone, so it does not take the
     "Good" - it states the hour instead, which is the honest version of a
     greeting at 3am. Every other phase reads as the greeting it is. */
  const dark  = (part === 'night' || part === 'late night' || part === 'evening');
  const hello = part === 'late night'
    ? 'Late night' + (who ? ', ' + escHtml(who) : '')
    : 'Good ' + part + (who ? ', ' + escHtml(who) : '') + '!';

  /* THE SUB-LINE IS ON SCREEN NOW, not in a tooltip (owner ref: `dashb.png`).
     It carried the same sentence as a `title` attribute, which is a place
     nobody looks — and it names the hostel, which is the part that makes it a
     greeting for THIS office rather than a stock phrase. The name comes from
     Settings; with none set it says "your hostel", never a seeded example. */
  const house = (typeof DB !== 'undefined' && DB.settings && DB.settings.hostelName)
    ? String(DB.settings.hostelName).trim() : '';

  return `<div class="hdr-greet">
    <span class="hdr-greet__ico">${dark ? moon : sun}</span>
    <span class="hdr-greet__b">
      <span class="hdr-greet__hi">${hello}</span>
      <span class="hdr-greet__sub">Here&rsquo;s what&rsquo;s happening at ${house ? escHtml(house) : 'your hostel'} today.</span>
    </span>
  </div>`;
}

/** The greeting's current text, without touching the DOM - the clock tick
    compares against this to decide whether anything needs repainting. */
function _dashGreetingText() {
  const box = document.createElement('div');
  box.innerHTML = _dashGreeting();
  const el = box.querySelector('.hdr-greet__hi');
  return el ? el.textContent : '';
}


/* ── A DONUT, DRAWN AS ONE SVG ──────────────────────────────────────────────
   No chart library: this is four numbers and a circle, and Chart.js is already
   carrying the trend chart's weight. A stroke-dasharray ring is exact, scales
   without raster blur, takes the theme through currentColor, and cannot animate
   itself on every re-render (lower spec §42).

   `segs` is [{ value, color, label }]. Segments are laid end to end from 12
   o'clock clockwise. A zero total draws the track alone — never a full ring in
   one colour, which is what "do not show a misleading 100% chart" (§36) means:
   an empty month must not look like a month where one method took everything.

   R and C are locked together: C = 2*pi*R. If R changes, C must. */

/* ── EMOJI-STYLE SECTION ICONS (owner, 7 Sep: "use svgs of emojis") ──────────
   The six cards below row A wore the same flat one-colour glyph the rest of the
   app uses, in a pale square. Three of them - This Month at a Glance, Needs
   Action and Quick Actions - wore nothing at all, so row C opened with a bare
   word where row B opened with a marked card.

   These are drawn like emoji: a few flat shapes, more than one colour, readable
   at 17px. That is the whole difference from an icon-font glyph, and it is what
   makes a header findable by shape rather than by reading it.

   EVERY COLOUR IS A TOKEN. An emoji is normally a fixed-palette picture, which
   is exactly what CLAUDE.md forbids in a renderer component - a raw hex here
   would be a picture that ignores the theme and goes on being sunny yellow on a
   near-black card. Building them out of --accent / --green / --amber / --red
   and the surface tokens keeps them recognisable AND lets both themes repaint
   them. White details are drawn as --card, not #fff, for the same reason: on a
   dark card the "paper" of a calendar should be the card's own surface.

   No `currentColor` anywhere, so the chip behind them can be any tint without
   bleeding into the drawing. */
const DASH_EMOJI = {
  /* Rising bars with a green arrow over them - the chart, and which way it is
     going, which is the one thing the card's title does not say. */
  trend:
      '<rect x="3" y="13" width="4" height="8" rx="1.3" fill="var(--accent)" opacity=".45"/>'
    + '<rect x="10" y="9" width="4" height="12" rx="1.3" fill="var(--accent)" opacity=".7"/>'
    + '<rect x="17" y="5" width="4" height="16" rx="1.3" fill="var(--accent)"/>'
    + '<path d="M3.5 9.5 9 5l3.5 3L19 2" fill="none" stroke="var(--green)" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M15.5 2H19v3.5" fill="none" stroke="var(--green)" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round"/>',
  /* A bed. Headboard in the accent, mattress pale, pillow picked out. */
  bed:
      '<rect x="2" y="6" width="2.6" height="14" rx="1.3" fill="var(--accent)"/>'
    + '<rect x="4" y="12" width="18" height="5.5" rx="2" fill="var(--accent)" opacity=".55"/>'
    + '<rect x="6" y="8.5" width="6" height="4" rx="1.6" fill="var(--card)"'
    + ' stroke="var(--accent)" stroke-width="1.5"/>'
    + '<rect x="4.6" y="17.5" width="2.2" height="3" rx="1.1" fill="var(--accent)"/>'
    + '<rect x="19.2" y="17.5" width="2.2" height="3" rx="1.1" fill="var(--accent)"/>',
  /* A calendar with today marked. The red dot is the only red on row C, which
     is what makes the card findable in the corner of the eye. */
  calendar:
      '<rect x="2.5" y="4.5" width="19" height="17" rx="3" fill="var(--card)"'
    + ' stroke="var(--accent)" stroke-width="1.6"/>'
    + '<path d="M2.5 9.5h19" stroke="var(--accent)" stroke-width="1.6"/>'
    + '<rect x="2.5" y="4.5" width="19" height="5" rx="3" fill="var(--accent)" opacity=".9"/>'
    + '<rect x="6.6" y="2.5" width="2.2" height="4" rx="1.1" fill="var(--accent)"/>'
    + '<rect x="15.2" y="2.5" width="2.2" height="4" rx="1.1" fill="var(--accent)"/>'
    + '<circle cx="8.5" cy="14" r="1.6" fill="var(--red)"/>'
    + '<circle cx="14" cy="14" r="1.4" fill="var(--accent)" opacity=".35"/>'
    + '<circle cx="8.5" cy="18.2" r="1.4" fill="var(--accent)" opacity=".35"/>'
    + '<circle cx="14" cy="18.2" r="1.4" fill="var(--accent)" opacity=".35"/>',
  /* A block of rooms - the card is about how full the building is, not about a
     bed, which is what the seat card next to it is about. */
  building:
      '<path d="M4 21V6.2a1.6 1.6 0 0 1 1-1.5l6-2.4a1.6 1.6 0 0 1 2.2 1.5V21Z"'
    + ' fill="var(--accent)" opacity=".55"/>'
    + '<path d="M13.2 21V9.5h5.3a1.5 1.5 0 0 1 1.5 1.5V21Z" fill="var(--accent)"/>'
    /* WINDOWS IN THE CARD COLOUR, NOT AMBER. Lit windows want to be warm and
       amber is the obvious pick — and it is wrong here, because amber means
       Pending on this very screen, three cards away. A hue that carries a
       specific meaning elsewhere on the same page cannot also be decoration. */
    + '<rect x="6.4" y="7" width="2.4" height="2.4" rx=".7" fill="var(--card)" opacity=".92"/>'
    + '<rect x="6.4" y="11.6" width="2.4" height="2.4" rx=".7" fill="var(--card)" opacity=".92"/>'
    + '<rect x="15.5" y="12.6" width="2.2" height="2.2" rx=".7" fill="var(--card)" opacity=".85"/>'
    + '<rect x="9.6" y="16.4" width="2.6" height="4.6" rx=".8" fill="var(--card)" opacity=".9"/>',
  /* A warning triangle. The one card on the page that reports a backlog, so it
     is the one that gets a warning hue rather than the accent. */
  alert:
      '<path d="M12.9 3.6a1.7 1.7 0 0 0-2.9 0L2.3 17.4A1.7 1.7 0 0 0 3.8 20h16.4a1.7 1.7 0'
    + ' 0 0 1.5-2.6Z" fill="var(--amber)"/>'
    + '<rect x="10.7" y="8.4" width="2.6" height="5.6" rx="1.3" fill="var(--card)"/>'
    + '<circle cx="12" cy="16.6" r="1.4" fill="var(--card)"/>',
  /* A lightning bolt - four verbs that happen at once. */
  bolt:
      '<path d="M13.6 2.3 5.2 12.4a1 1 0 0 0 .77 1.64h4.2l-1.5 7.1a.75.75 0 0 0 1.32.62l8.6'
    /* ACCENT, NOT AMBER AND RED. A yellow bolt with a red shadow is what the
       emoji looks like, and both hues are spoken for on this screen: amber is
       Pending and red is Expenses, one row up. Quick Actions is a neutral card
       and must not look like it is reporting a warning. Two strengths of one
       hue instead, which keeps the shape reading as a bolt. */
    + '-10.2a1 1 0 0 0-.77-1.64h-4.3l1.42-6.9a.75.75 0 0 0-1.33-.62Z" fill="var(--accent)"/>'
    + '<path d="M10.17 14.04h4.2l-4.9 5.9Z" fill="var(--card)" opacity=".45"/>',
};

/* The chip. 34px on row C to match the Occupancy card that already had one,
   30px inside row B's tighter headers. */
function dashEmojiChip(name, px) {
  const n = px || 30;
  return '<div class="dash-chip dash-chip--emoji" style="width:' + n + 'px;height:' + n
       + 'px;border-radius:' + Math.round(n / 3.2) + 'px">'
       + '<svg class="icon" viewBox="0 0 24 24" style="width:' + Math.round(n * 0.56)
       + 'px;height:' + Math.round(n * 0.56) + 'px">' + (DASH_EMOJI[name] || '') + '</svg></div>';
}

function _dashDonut(segs, centreTop, centreSub, opts) {
  const o = opts || {};
  const R = 54, C = 2 * Math.PI * R, W = o.width || 22;
  const total = segs.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);

  let at = 0;
  const arcs = total > 0 ? segs.map(s => {
    const v = Math.max(0, Number(s.value) || 0);
    if (v <= 0) return '';
    const len = (v / total) * C;
    /* -at as the offset walks the ring clockwise; the -90deg rotation on the
       group starts it at twelve o'clock instead of three. */
    /* A SLICE IS A CONTROL. It slides outward under the pointer and opens the
       page behind it when clicked.

       IT USED TO THICKEN INSTEAD, and the note here argued for that: an
       exploded slice "needs the arc's bisector and a transform per segment, and
       it moves the ring's silhouette on every hover". Both halves are true and
       the owner has asked for the offset anyway (7 Sep) — Reports has drawn its
       methods donut with Chart.js `hoverOffset: 6` all along, so the two rings
       in this app answered the pointer in two different ways, and the offset is
       the one they already knew. Matching them is worth the bisector.

       So the bisector is computed here, once, at build time, and handed to CSS
       as a vector. The transform lands in the rotated group's own coordinate
       space, which is why the -90 degree rotation needs no correction: the
       angle below is the segment's own, in the same frame it is drawn in. */
    const midRad = ((at + len / 2) / C) * 2 * Math.PI;
    const off = ' style="--dnut-tx:' + (Math.cos(midRad) * 5).toFixed(2) + 'px;'
              + '--dnut-ty:' + (Math.sin(midRad) * 5).toFixed(2) + 'px"';
    const act = s.onclick ? ' onclick="' + s.onclick + '"' : '';
    /* The popup reads these off the element rather than closing over the data:
       the ring is a string of HTML by the time it reaches the DOM, so there is
       no live object left to consult. */
    const dat = ' data-name="' + escHtml(s.name || '') + '"'
              + ' data-amt="'  + escHtml(s.amount || '') + '"'
              + ' data-pct="'  + (total > 0 ? (v / total * 100).toFixed(1) : '0') + '"'
              + ' data-hue="'  + escHtml(s.color) + '"'
              + ' data-money="' + (o.money === false ? '0' : '1') + '"';
    /* THE RING FILLS ON ARRIVAL. It is drawn at zero length and handed its real
       dasharray on the next frame by _dnutPlay(), so the CSS transition on
       stroke-dasharray runs it round the circle. Reports' donut has always done
       this — it is Chart.js's default load animation — and the dashboard's ring
       simply appeared. Same chart, same two screens, two behaviours.

       The TARGET is in a data attribute rather than in the style, so a paint
       that happens with animation suppressed (reduced motion, or a print) still
       has the real geometry in the attribute and shows a correct ring. */
    const seg = '<circle class="dnut__seg' + (s.onclick ? ' is-clickable' : '') + '"'
      + ' cx="70" cy="70" r="' + R + '" fill="none"'
      + ' stroke="' + escHtml(s.color) + '" stroke-width="' + W + '"'
      + ' stroke-dasharray="0 ' + C.toFixed(2) + '"'
      + ' data-dash="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"'
      + ' stroke-dashoffset="' + (-at).toFixed(2) + '"' + off + act + dat + '>'
      + (s.label ? '<title>' + escHtml(s.label) + '</title>' : '')
      + '</circle>';
    at += len;
    return seg;
  }).join('') : '';

  setTimeout(_dnutWireTip, 0);
  setTimeout(_dnutPlay, 0);
  return '<div class="dnut">'
    + '<svg viewBox="0 0 140 140" class="dnut__svg" role="img"'
    + ' aria-label="' + escHtml(o.aria || 'Breakdown chart') + '">'
    +   '<g transform="rotate(-90 70 70)">'
    +     '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="var(--dash-track)" stroke-width="' + W + '"></circle>'
    +     arcs
    +   '</g>'
    + '</svg>'
    + '<div class="dnut__mid">'
    +   '<div class="dnut__top">' + centreTop + '</div>'
    +   '<div class="dnut__sub">' + escHtml(centreSub || '') + '</div>'
    + '</div>'
    + '</div>';
}

/* Hand every freshly-drawn segment its real length on the next frame, so the
   transition has two states to run between. Two frames, not one: setting the
   attribute in the same frame the element was inserted in gives the style
   engine no "before" to interpolate from, and the ring snaps.

   Reduced motion is honoured by CSS (the transition is switched off there), and
   this still runs — the segment gets its geometry either way, it just arrives
   instantly. Nothing here decides whether to animate; it only supplies the
   target. */
function _dnutPlay() {
  const segs = document.querySelectorAll('.dnut__seg[data-dash]');
  if (!segs.length) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    segs.forEach(el => {
      const d = el.getAttribute('data-dash');
      if (d) el.style.strokeDasharray = d;
    });
  }));
}

/* ── THE SLICE POPUP ────────────────────────────────────────────────────────
   Owner, 7 Sep: "build a pop hover when cursor holds on the pie chart slices".

   ONE listener on the document, not one per slice: the ring is re-rendered on
   every dashboard paint, and per-element handlers would accumulate a set per
   paint with nothing to remove them. Delegation survives re-renders because it
   never references the elements.

   It follows the pointer rather than anchoring to the slice's centroid. A
   centroid anchor is prettier and wrong here — on a ring where one slice is
   80%, its centroid can sit under the centre label, and the popup would cover
   the total it is explaining. */
let _dnutTipEl = null, _dnutTipWired = false;

function _dnutWireTip() {
  if (_dnutTipWired) return;
  _dnutTipWired = true;

  const tip = document.createElement('div');
  tip.className = 'dnut-tip';
  tip.setAttribute('aria-hidden', 'true');   // the SVG <title> serves readers
  document.body.appendChild(tip);
  _dnutTipEl = tip;

  const hide = () => tip.classList.remove('is-on');

  document.addEventListener('mouseover', (e) => {
    const seg = e.target && e.target.closest && e.target.closest('.dnut__seg');
    if (!seg) return;
    const name = seg.getAttribute('data-name') || '';
    const amt  = Number(seg.getAttribute('data-amt') || 0);
    const pct  = seg.getAttribute('data-pct') || '0';
    const hue  = seg.getAttribute('data-hue') || 'currentColor';
    tip.innerHTML =
        '<i class="dnut-tip__dot" style="background:' + escHtml(hue) + '"></i>'
      + '<span class="dnut-tip__name">' + escHtml(name) + '</span>'
      + '<span class="dnut-tip__amt">' + escHtml(
            seg.getAttribute('data-money') === '0' ? fmtNum(amt) + ' seats' : fmtPKR(amt)) + '</span>'
      + '<span class="dnut-tip__pct">' + escHtml(pct) + '%</span>';
    tip.classList.add('is-on');
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!tip.classList.contains('is-on')) return;
    /* Flip before the edge rather than after it: measuring the box and
       comparing against the viewport keeps the popup whole on the right-hand
       ring, which is where the Collection card sits on a 1366 screen. */
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - h - 10;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y < 8) y = e.clientY + 16;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }, true);

  document.addEventListener('mouseout', (e) => {
    const seg = e.target && e.target.closest && e.target.closest('.dnut__seg');
    if (seg) hide();
  }, true);

  /* Same reasoning as the trend badge: a wheel scroll moves the ring out from
     under a stationary pointer without firing mouseout. */
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}

/* ── THE STATUS FOOTER ──────────────────────────────────────────────────────
   "All systems operational" is a claim, and a pill that is green whatever the
   state of the app is a decoration pretending to be a reading. It is wired to
   `chromeAlerts()` — the same feed behind the header bell — so it goes amber
   and counts when there is something outstanding, and reads operational only
   when that feed is genuinely empty.

   The version comes from the main process (`window.appInfo.version()`), which
   is the number in package.json. `DB.settings.version` is a stored data field
   that has read 'v3.0' since long before this build, so it is not used here;
   the element paints a dash and is corrected a beat later, exactly as the
   login footer does it. */
function _dashFooter() {
  const hostel = (DB.settings && DB.settings.hostelName) || '';
  const tag    = (DB.settings && DB.settings.tagline) ? String(DB.settings.tagline).trim() : '';
  const alerts = (typeof chromeAlerts === 'function') ? chromeAlerts() : [];
  const ok     = alerts.length === 0;
  const stamp  = new Date().toLocaleString('en-IN',
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `
  <footer class="dash-foot">
    <div class="dash-foot__l">
      <span class="dash-foot__brand">Hostyllo <span id="dash-foot-ver">&mdash;</span></span>
      ${hostel ? `<span class="dash-foot__sep">|</span><span>${escHtml(hostel)}</span>` : ''}
      ${tag ? `<span class="dash-foot__sep">|</span><span class="dash-foot__tag">&ldquo;${escHtml(tag)}&rdquo;</span>` : ''}
    </div>
    <div class="dash-foot__r">
      <span class="dash-foot__state ${ok ? 'is-ok' : 'is-warn'}">
        <i class="dash-foot__dot"></i>${ok ? 'All systems operational'
          : alerts.length === 1 ? '1 item needs attention'
          : alerts.length + ' items need attention'}
      </span>
      <span class="dash-foot__sep">|</span>
      <span class="dash-foot__stamp">Last updated: ${escHtml(stamp)}</span>
      <button class="dash-foot__refresh" onclick="renderPage('dashboard')" title="Refresh the dashboard" aria-label="Refresh the dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
      </button>
    </div>
  </footer>`;
}

/** Fill in the build number the footer left as a dash. Async, and the element
    may already be gone if the warden navigated on — hence the null guard. */
function _dashFillVersion() {
  try {
    if (!window.appInfo || !window.appInfo.version) return;
    window.appInfo.version().then(v => {
      const el = document.getElementById('dash-foot-ver');
      if (el && v) el.textContent = 'v' + v;
    }).catch(() => {});
  } catch (e) { /* browser, no bridge - the dash stands */ }
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
  /* The Advance / Arrears tile reports only the two buckets that are NOT this
     month's own rent — see the card for why. */
  const _advArr = { total: cashIn.advance + cashIn.arrears,
                    n: cashIn.nAdvance + cashIn.nArrears };
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
  /* The footer paints a dash for the build number and this corrects it a beat
     later, once nav.js has written the string below into #page. */
  setTimeout(_dashFillVersion, 0);

  const P = _dashLedgerRow(mo, pending, pendingCount);
  /* _dashOccupancyOverview() is retired, not deleted — the Occupancy Overview
     card was removed on 7 Sep and its percentage bar moved into Seat
     Availability, where the seats it describes already are. The function stays
     below for one release in case the owner wants the card back; nothing calls
     it, and the linter will say so. */

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

    ${''/* TOTAL RESIDENTS IS GONE (owner, 7 Sep) and the five that remain share
           its width. It was the one KPI answered better twice below it: Seat
           Availability now carries the occupancy percentage AND the bed counts
           in its own header, and Occupancy by Room Type breaks the same
           headcount down by type. What is left is money, which is also what
           makes the five read as one set rather than four plus an odd one.
           The students page is still one click away on the rail. */}

    <!-- Total Revenue — blue -->
    ${''/* LOCKED (owner, 7 Sep). All five of these were `dsh-card--click`
           navigating to a page. The owner's reason for taking it away is the
           right one: every figure here is already broken down in Reports, on a
           screen built to be filtered, exported and printed — so the card was a
           slow link to a worse version of what Reports gives you, and it made
           five large tiles twitch under the pointer on a screen whose job is to
           be read.

           ADVANCE / ARREARS IS THE EXCEPTION, and stays clickable, because its
           detail is NOT in Reports: showCashReceivedModal() is the
           reconciliation that explains why cash-in-the-drawer and revenue
           differ, and there is nowhere else in the app that answers it.
           counter-flow-decisions.spec.js asserts the tile keeps it. */}
    <div class="dsh-card dh-blue">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3.2" fill="currentColor" opacity=".38"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><circle cx="5.6" cy="12" r="1.35" fill="currentColor"/><circle cx="18.4" cy="12" r="1.35" fill="currentColor"/></svg></div>
        <div class="dash-kpi__label">Total Revenue</div>
        <div class="dash-pill-stack">
          ${revDelta!==null?`<span class="dash-pill ${revDelta>=0?'dh-green':'dh-red'}">${revDelta>=0?'+':''}${revDelta.toFixed(1)}%</span>`:''}
          <span class="dash-pill dh-slate">${paidCount} paid</span>
        </div>
      </div>
      <div class="dash-kpi__value">${moneyValue(collected,{size:"display",compact:true})}</div>
      <div class="dash-kpi__sub" title="of ${escHtml(fmtPKR(totalExpected))} expected">of <span class="pkr">Rs.</span>${fmtCompact(totalExpected)} expected</div>
      ${_dashBar(collected, totalExpected, 'kbar--blue')}
    </div>

    ${''/* PENDING AND EXPENSES SWAPPED (owner, 7 Sep). Worth recording what
           the old order was FOR, because the swap breaks it: Expenses used to
           sit immediately before Available Fund, whose figure is stated as
           "collected - expenses" - so the subtrahend was on screen just before
           the result that uses it. Expenses now sits AFTER Fund. The owner's
           call, and the arithmetic is identical either way. */}
    <!-- Pending — amber -->
    <div class="dsh-card dh-amber">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="currentColor" opacity=".38"/><path d="M12 7.4v4.9l3.2 1.9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="dash-kpi__label">Pending</div>
        <div class="dash-pill-stack">
          <span class="dash-pill">${totalExpected>0?Math.round(pending/totalExpected*100):0}%</span>
          <span class="dash-pill">${pendingCount} unpaid</span>
        </div>
      </div>
      <div class="dash-kpi__value">${moneyValue(pending,{size:"display",compact:true})}</div>
      ${_dashBar(pending, totalExpected, 'kbar--amber')}
    </div>

    <!-- Available Fund — green when in profit, red when the fund is negative
         (a negative fund is genuine danger, not decoration) -->
    <div class="dsh-card ${netProfit>=0?'dh-green':'dh-red'}">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="currentColor" opacity=".38"/><rect x="6.3" y="12.6" width="2.7" height="5.1" rx="1.35" fill="currentColor"/><rect x="10.65" y="9.2" width="2.7" height="8.5" rx="1.35" fill="currentColor"/><rect x="15" y="6.3" width="2.7" height="11.4" rx="1.35" fill="currentColor"/></svg></div>
        <div class="dash-kpi__label">Available Fund</div>
        <div class="dash-pill-stack"><span class="dash-pill">${netProfit>=0?'Profit':'Loss'}</span></div>
      </div>
      <div class="dash-kpi__value">${moneyValue(netProfit,{size:"display",compact:true})}</div>
      ${''/* THE "PKR 170T - PKR 77.89T" SUB-LINE IS GONE (owner, 7 Sep). It
             restated the subtraction using the two cards either side of it —
             Total Revenue two tiles left, Expenses one tile right — so at a
             glance the row printed the same two figures three times. It was
             also the first line in the row to wrap, being two unbounded numbers
             and an operator. The card keeps its Profit/Loss pill, which is the
             part of the sentence the other two cards do NOT already say. */}
      <!-- This was the only money card with no history behind it, so it sat
           visibly emptier than the four beside it. The series is the same
           subtraction the headline states, month by month — nothing new is
           computed here, and _dashSpark scales to min/max so the months the
           fund ran negative still read. -->
      ${_dashBar(netProfit, collected, 'kbar--green')}
    </div>

    <!-- Expenses — red. Money OUT sits immediately after money IN and before
         what is left of it: the Available Fund card next door states its own
         figure as "collected − expenses", and it used to sit to the LEFT of the
         expenses it subtracts, so the row asked the reader to hold a number
         that had not been shown yet. -->
    <div class="dsh-card dh-red">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="currentColor" opacity=".38"/><path d="M12 7.2v9.1m0 0 3.6-3.6M12 16.3l-3.6-3.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="dash-kpi__label">Expenses</div>
        <div class="dash-pill-stack"><span class="dash-pill">${moExpCount} item${moExpCount===1?'':'s'}</span></div>
      </div>
      <div class="dash-kpi__value">${moneyValue(moExp,{size:"display",compact:true})}</div>
      <div class="dash-kpi__sub">this month</div>
      ${_dashBar(moExp, collected, 'kbar--orange')}
    </div>

    <!-- ADVANCE / ARREARS RECEIVED — the sixth tile (owner ref: nev.png,
         7 Sep). NOTE: no backticks in this comment - it lives inside a JS
         template literal, where one would end the string.

         It replaces Cash Received, which reported the whole drawer and
         so mostly repeated Total Revenue beside it; the interesting money is
         the part that did NOT belong to this month.

         TWO BUCKETS, AND THE MONTH ITSELF IS IN NEITHER:
           · Advance (Upcoming) — cash taken this month against a LATER month.
             It is already in the drawer and not yet earned.
           · Previous Months — cash taken this month against an EARLIER one.
             Arrears, finally collected.
         current (this month's own rent, paid this month) is deliberately
         excluded: that is what Total Revenue two cards left already says, and
         a KPI that restates its neighbour is a wasted tile.

         Both figures come from cashBreakdown(), which is the same function the
         reconciliation modal uses — one answer to "what moved", not two. */ -->
    <div onclick="showCashReceivedModal()" class="dsh-card dsh-card--click dh-violet dash-kpi--split">
      <div class="dash-kpi__top">
        <div class="dash-chip"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="currentColor" opacity=".38"/><path d="M8.7 17V7.6m0 0L6.2 10.1M8.7 7.6l2.5 2.5M15.3 7v9.4m0 0 2.5-2.5M15.3 16.4l-2.5-2.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="dash-kpi__label">Advance / Arrears</div>
        ${''/* THE PILL TAKES THE CARD'S OWN VIOLET AND A CARD GLYPH
               (owner ref: arrears.png, 2026-09-10). It was slate and wordless:
               the reference draws a pale tint of the tile's hue with a payment
               glyph in front of the count, which is what makes it read as "how
               many payments made up this figure" rather than as a status. */}
        <div class="dash-pill-stack">
          <span class="dash-pill"><svg class="dash-pill__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>${fmtNum(_advArr.n)} payment${_advArr.n===1?'':'s'}</span>
        </div>
      </div>
      <div class="dash-kpi__value">${moneyValue(_advArr.total,{size:"display",compact:true})}</div>
      ${''/* NO CLOSING NOTE ON THIS ONE (owner, 2026-09-09). It is the tallest
             tile in the row and the only one carrying two split rows, so it is
             what sets row A's height — and unlike the other four it already
             says what it means, in the two lines under the figure. */}
      ${_dashBar(_advArr.total, cashIn.total, 'kbar--violet')}
      ${''/* ONE LINE, TWO BUCKETS, A RULE BETWEEN THEM (owner ref:
             arrears.png, 2026-09-10). They were two stacked rows, and the
             reference draws them side by side — "Upcoming PKR 0 | Previous
             PKR 5,800" — which is the same two readings in HALF the height.

             THE HEIGHT IT SAVES IS THE FOLD'S, NOT THE ROOM LIST'S. Row A is
             as tall as its tallest tile and this is that tile: 160 before, 153
             after, measured at 1366x768. Row C is unchanged at 202 and now ends
             at 730 of 738 rather than flush against it, which is the margin the
             QA floor has been failing by. Anything added back here spends that
             margin — this tile stands 3px above the 150 the other five cards in
             the row need, so it is the one card in row A where height is real.

             THE PER-BUCKET COUNTS COME OFF, and the reference has none either.
             The pill above already gives the tally for both buckets together,
             and a bare count sitting beside a bare rupee figure on one line
             reads as part of it. The split figures they belonged to are
             unchanged, both still carry the full PKR amount on hover, and
             showCashReceivedModal() — which this card still opens — lists every
             payment behind them.

             THE LABELS ARE THE REFERENCE'S OWN, one word each. "Advance
             (Upcoming)" and "Previous Months" do not fit a half-width line, and
             the card is titled Advance / Arrears directly above: Upcoming is
             the advance, Previous is the arrears. The long form is on hover.

             THE WORD SITS ABOVE ITS FIGURE, WHICH IS THE ONE PLACE THIS PARTS
             FROM THE REFERENCE, and it was measured before it was decided. The
             reference draws "Upcoming PKR 0" on one line inside a card more
             than twice this one's width; this tile gives each bucket 87px, and
             a real figure — PKR 125,000 — takes 63 of them. Rendered on one
             line the two labels ellipsised to "U." and "P.", which is a word
             deleted rather than shortened, and the rule in this file is that a
             tight card loses chrome, never a reading. Stacked, every word and
             both exact figures survive inside the same 87px.

             The reference's actual move is kept: the two buckets sit SIDE BY
             SIDE with a rule between them, where they were a stacked pair of
             full-width rows. That is what halves the block. */}
      <div class="dash-kpi__split">
        <span class="dash-kpi__srow" title="Cash taken this month against a LATER month">
          <span class="dash-kpi__slabel"><i class="dash-kpi__sdot dh-green"></i>Upcoming</span>
          <b title="${escHtml(fmtPKR(cashIn.advance))}"><span class="pkr">Rs.</span>${escHtml(fmtCompact(cashIn.advance))}</b>
        </span>
        <i class="dash-kpi__srule"></i>
        <span class="dash-kpi__srow" title="Cash taken this month against an EARLIER month — arrears collected">
          <span class="dash-kpi__slabel"><i class="dash-kpi__sdot dh-violet"></i>Previous</span>
          <b title="${escHtml(fmtPKR(cashIn.arrears))}"><span class="pkr">Rs.</span>${escHtml(fmtCompact(cashIn.arrears))}</b>
        </span>
      </div>
      ${''/* Still opens showCashReceivedModal(), NOT the payments page — that
             reconciliation is the screen that explains why this figure and
             Total Revenue differ, and counter-flow-decisions.spec.js asserts
             the tile keeps it. The sparkline is dropped: this card carries two
             rows of real figures now, and §9 of the design system says not to
             add a trend graphic where the metric does not need one. */}
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
      ${dashEmojiChip('trend', 26)}
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
      <div class="dash-sec__head seat-head">
        ${dashEmojiChip('bed', 26)}
        <div class="seat-hd">
          <div class="seat-hd__t">Seat Availability</div>
          <div class="seat-hd__s">Live room occupancy</div>
        </div>
        <!-- THE THREE COUNTS SIT IN THE TOP CORNER (owner ref: the seat-header
             reference of 7 Sep). Label above figure, right-aligned,
             out of the way of the room grid — which is the point: every pixel
             this header does not take is another row of rooms on screen. Each
             is still the click target it was. -->
        ${/* FIGURES, NOT A NAVBAR (owner, 7 Sep). These were three buttons
             opening three filtered lists. Nothing else in a card header on this
             page is a control, so the row read as navigation the card does not
             have, and it competed with Expand and Print at the foot — which go
             to the same place. They are now what they look like: three
             readings. Expand at the foot still opens the full list, and the
             room tiles below are still individually clickable. */''}
        ${''/* TOTAL SEATS, FILLED, FREE — in that order, each in its own bounded
               box (owner, 2026-09-09). "Beds" three times said the same noun
               three times in 200px; the group's own heading carries it once and
               the two figures under it are the split. Total first, because the
               other two are read against it. */}
        <div class="seat-inline">
          <span class="seat-inline__k" title="Every seat in the hostel">
            <span>Total Seats</span><b>${totalSeats}</b></span>
          <span class="seat-inline__k is-filled" title="Seats with a resident">
            <span>Filled</span><b>${allActiveSeats}</b></span>
          <span class="seat-inline__k is-free" title="Seats nobody is in">
            <span>Free</span><b>${availSeats}</b></span>
        </div>
      </div>
      ${/* THE OCCUPANCY BAR IS GONE, AND ITS HEIGHT BOUGHT A ROW OF ROOMS
           (owner, 7 Sep). It arrived here the same day from the Occupancy
           Overview card, and it was ~44px spent on one ratio.

           Nothing is lost, which is why it was the right 44px to spend. The
           bar's own numerator and denominator are the two counts still in the
           header directly above it — Filled Beds and Total Beds — and the
           percentage it drew is on the Occupancy by Room Type card in row C,
           in the "61% Full" chip and again in the ring's centre. What the room
           grid shows instead cannot be read anywhere else on this screen: WHICH
           rooms have a bed going. */''}
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
        ${''/* NUMERIC ORDER, 1 UPWARD (owner, 7 Sep: "numbering from 1 to
               continue"). DB.rooms is in insertion order, so a room added later
               sat wherever it was created and the grid read 1, 2, 5, 3, 4.
               localeCompare with numeric:true sorts '10' after '9' rather than
               after '1', which a plain string sort does not — and room numbers
               are strings here because some hostels use '2A'. */}
        ${DB.rooms.slice().sort((a,b)=>String(a.number||'').localeCompare(String(b.number||''),undefined,{numeric:true,sensitivity:'base'})).map(r=>{
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
      ${''/* ONE LINK, NOT A LEGEND AND TWO BUTTONS (owner, 7 Sep, asked
             directly). The Has free / Full key and the Expand and Print
             buttons came to 44px - which is exactly the second row of six
             rooms, and the owner chose the rooms. Both dropped things survive:
             the key is answered by the tiles themselves (blue has a bed going,
             grey does not, and each tile prints its own fraction), and Expand
             and Print are on the Rooms page this link opens. */}
      ${/* THE KEY IS BACK, BOTTOM LEFT (owner, 7 Sep, reversing the same
           day's removal). It was dropped as "answered by the tiles
           themselves", which is true only once you already know the code —
           a pale blue tile and a grey tile are not self-describing on first
           sight, and this card is the one a warden opens to find a bed.

           It costs nothing: seat-foot was already a flex row with Expand and
           Print pushed to the right, so the key fills space that was empty. */''}
      <div class="seat-foot">
        <span class="seat-key">
          <span class="seat-key__k"><i class="seat-key__sw"></i>Has free beds</span>
          <span class="seat-key__k"><i class="seat-key__sw is-full"></i>Full</span>
        </span>
        ${''/* EXPAND AND PRINT, NOT A LINK (owner, 7 Sep - reversing their own
               answer of an hour earlier). They sit on the SAME single line the
               link occupied, right-aligned, rather than on a row of their own:
               that is the difference between costing 4px and costing 28, and
               28 is the second row of six rooms. */}
        <button class="seat-foot__b" onclick="showSeatDetailModal('rooms')"
                title="Expand - every room at a readable size" aria-label="Expand seat availability">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>Expand
        </button>
        <button class="seat-foot__b" onclick="printSeatAvailability()"
                title="Print the seat availability sheet" aria-label="Print seat availability">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>Print
        </button>
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
    ${''/* THE TAGLINE IS OFF AND THE CHIP IS 26 (owner, 2026-09-10).
           "Overview of seat occupancy by room type" restated the title beside
           it word for word, and the head it sat in was 33px against the 26px
           heads of the other two cards in this row. Seven pixels, and they are
           not cosmetic: they are part of the 25 this card needed before its
           list could show a FOURTH room type instead of eight pixels of one.
           See the ceiling note in dashboard.css. */}
    <div class="dash-sec__head" style="margin-bottom:4px">
      ${dashEmojiChip('building', 26)}
      <div style="min-width:0">
        <div class="dash-sec__title">Occupancy by Room Type</div>
      </div>
      <span class="rt-full ${seatPct>=90?'is-high':''}" style="margin-left:auto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/></svg>
        ${seatPct}% Full
      </span>
    </div>

    <div class="rt-body">
      <div class="rt-left">
        ${''/* ONE RING COMPONENT FOR THE WHOLE DASHBOARD (owner, 7 Sep: this
               chart "should behave like collection by payment method in both
               dark and light mode"). This was a Chart.js canvas and the
               Collection card is an SVG _dashDonut(): two rings, two hover
               behaviours, two ways of picking a colour, and only one of them
               followed the theme - a canvas bakes its stroke colours at draw
               time, so a theme switch left the old palette until the next
               render. Same function now, so the slice pop, the pointer popup,
               the click-through and the theme all come for free and cannot
               drift apart again.

               The slice is a room TYPE, so it opens Rooms rather than
               Payments. */}
        ${_dashDonut(
            (DB.settings.roomTypes||[]).map(t => {
              const tR = DB.rooms.filter(r => r.typeId === t.id);
              const filled = DB.students.filter(s => s.status==='Active' && !s.isForced
                                && tR.some(r => r.id === s.roomId)).length;
              return { value: filled, color: t.color || 'var(--accent)', name: t.name,
                       amount: filled,
                       label: t.name + ' — ' + filled + ' of ' + (tR.length * t.capacity) + ' seats filled',
                       onclick: "navigate('rooms')" };
            }).filter(x => x.value > 0),
            '<span class="dnut__fig">' + fmtNum(filledSeats) + '<span class="rt-of">/' + fmtNum(totalSeats) + '</span></span>',
            'Seats Occupied',
            { aria: 'Occupied seats by room type', money: false })}
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
  ${P.needs}
  ${P.actions}
  </div><!-- end row C -->

  <!-- ══ ROW D: COLLECTION BY METHOD + PENDING PAYMENTS ══ -->
  <div class="dash-split">
  ${P.methods}
  <div class="dash-sec dl-pending" style="display:flex;flex-direction:column">
      <div class="dash-sec__head">
        <!-- The hourglass the reference draws, on the amber tile it draws it on:
             pending is a WAITING state, not a clock running out. -->
        <div class="dash-chip dash-chip--sm dl-pend__ico"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M6 2h12v2c0 2.5-1.6 4.7-4 5.6v.8c2.4.9 4 3.1 4 5.6v2H6v-2c0-2.5 1.6-4.7 4-5.6v-.8C7.6 8.7 6 6.5 6 4V2Zm2 2c0 1.9 1.3 3.6 3.2 4.1l.8.2.8-.2C14.7 7.6 16 5.9 16 4H8Z"/></svg></div>
        <span class="dash-sec__title">Pending Payments</span>
        <!-- Red, not slate. A count of unpaid records is a debt, and the
             reference colours it as one (design system §2.1 error tint). -->
        <span class="dl-pend__count">${pendingCount}</span>
        ${pendingCount>0?`<button class="dash-link dl-pend__all" onclick="openPaymentsPending()">View All <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>`:''}
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
          +'<div class="dash-pay__id" onclick="showStudentPanel(\''+p.studentId+'\')">'
          +'<div class="dash-pay__name">'+escHtml(p.studentName||'')+'</div>'
          +'<div class="dash-pay__room">Room '+escHtml(p.roomNumber||'?')+' · '+escHtml(monthLabel(p.month)||'—')+'</div>'
          +'</div>'
          +'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:8px">'
          +'<div>'
          /* FULL, UNTIL IT IS ABSURD. `exact .png` prints "PKR 10,000" and the
             written spec asks for "PKR 10K"; the owner settled it on 7 Sep -
             the real figure, because a warden reconciles it, switching to
             compact only past a crore where the digits stop being readable.
             fmtCompact() is exactly that rule and already existed. */
          +'<div class="dash-pay__amt" title="'+escHtml(fmtPKR(unpaidShow))+'">Rs. '+escHtml(fmtCompact(unpaidShow))+'</div>'
          +'<div class="dash-pay__due">'+(p.dueDate?'Due: '+fmtDate(p.dueDate):'unpaid')+'</div>'
          +'</div>'
          +'<span class="dash-status '+due.hue+'">'+due.label+'</span>'
          +'<button class="dash-icon-btn dh-green" onclick="event.stopPropagation();markPaymentPaid(\''+p.id+'\')" title="Mark paid" aria-label="Mark this payment paid"><svg class=\"icon icon-xs\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.71 8.71-6 6a1 1 0 0 1-1.42 0l-3-3a1 1 0 1 1 1.42-1.42L11 14.59l5.29-5.3a1 1 0 0 1 1.42 1.42Z\"/></svg></button>'
          +'<button class="dash-icon-btn dh-green dash-icon-btn--wa" onclick="event.stopPropagation();waRemindStudent(\''+p.studentId+'\')" title="Send a WhatsApp reminder" aria-label="Send a WhatsApp reminder"><svg class=\"icon icon-xs\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.18-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.08 4.49.7.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.57-.34M12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.89-9.89 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.43 9.89-9.88 9.89\"/></svg></button>'
          +'<button class="dash-icon-btn dh-slate" onclick="event.stopPropagation();showEditPaymentModal(\''+p.id+'\')" title="Edit" aria-label="Edit this payment"><svg class=\"icon icon-xs\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"m20.71 7.04-2.75-2.75a1 1 0 0 0-1.41 0L4.29 16.55a1 1 0 0 0-.29.71V20a1 1 0 0 0 1 1h2.74a1 1 0 0 0 .71-.29L20.71 8.46a1 1 0 0 0 0-1.42Z\"/></svg></button>'
          +'</div></div>';
        }).join('')})()}
      </div>
      ${pendingCount>0?`<div class="dl-pend__foot"><button class="dl-remind" onclick="showRentReminderModal()"><svg class=\"icon icon-xs\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2a10 9 0 0 0-10 9 8.76 8.76 0 0 0 3 6.55V21a1 1 0 0 0 1.49.87L9.85 20A10.66 10.66 0 0 0 12 20a10 9 0 0 0 10-9 10 9 0 0 0-10-9Z\"/></svg> Send Rent Reminder (${pendingCount} pending)</button></div>`:''}
      ${''/* The bar is HIDDEN at zero, not disabled — lower spec §36: "do not
             show the reminder button if there are zero eligible recipients". */}
    </div>
  </div><!-- end row3+4 grid -->

  <!-- ══ ROW 5: THE LEDGER ROW (design 1c) ══ -->

  <!-- ══ ROW 6: RECENT PAYMENTS ══ -->
  ${_dashRecentPayments(recentPay, mo, collected)}

  <!-- ══ ROW 7: STATUS FOOTER ══ -->
  ${_dashFooter()}`;
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

/* ── THE GLANCE FOLLOWS THE MONTH ────────────────────────────────────────────
   Owner's call, 2026-09-06. The panel was hard-scoped to the literal calendar
   day on a page where every other card is month-scoped, so on a hostel holding
   141 payments and 55 students it printed six zeros until somebody recorded
   something, and six more the next morning. The arithmetic was never wrong —
   seeded with records dated today it reported all six correctly. What was wrong
   is that "today" is empty most mornings, and a card that is almost always
   empty teaches a warden to stop reading it.

   A day-fallback shipped first and was replaced by this at the owner's
   direction. The month is the better answer for one reason worth writing down:
   it is the SAME WINDOW as the KPI row above it. `thisMonth()` reads the
   sidebar month picker, so the panel now moves with it exactly as the KPI
   cards, Collection by Method and the Pending figure already do — one scope on
   one screen, rather than five cards describing a month and a sixth describing
   a day nobody selected.

   PAYMENTS RECEIVED USES `_payMatchesMonth()`, which is not an arbitrary
   choice: it is the identical test `_dlMethods()` uses for Collection by
   Method, on this same card row. The two therefore report the same rupees, and
   `tests/dashboard-cards.spec.js` asserts they cannot drift apart. The other
   five rows key off `_toMonthKey()`, which reads both `2026-08-14` and the
   older `August 2026` shape a record may carry.

   THE COST, STATED: on the 1st of a month this reads six zeros again. That is
   now correct rather than misleading — the KPI row above it reads zero too,
   because nothing has happened yet in the window both are describing. */

/** Counts for the glance — seven figures, each from its own table, one day. */
/* WHAT HAPPENED TODAY — not this month (owner, 2026-09-09).

   The card was scoped to the sidebar's month like everything else on the page,
   and the owner's question for it is a different one: what did the person on
   the counter DO today. So this is the one panel on the dashboard that ignores
   the month picker, and the pill beside its heading carries the date so nobody
   has to infer the window.

   THE PAYMENTS ROW CHANGES MEANING WITH IT, and the change is the right one:
   it counts payments COLLECTED today — `p.date`, the day the money was taken —
   rather than payments belonging to the selected month. A warden who collects
   August arrears on the 9th of September did that work today, and the card
   that reports their day has to say so. Collection by Method two cards away
   still answers the month's question; the two are no longer the same rupees
   and no longer claim to be. */
function _dlGlance(mo) {
  const td = (typeof today === 'function') ? today() : ymd(new Date());
  const isToday = d => !!d && String(d).slice(0, 10) === td;
  const log = DB.checkinlog || [];
  const paid = (DB.payments || []).filter(p => p.status === 'Paid' && isToday(p.date));
  /* `page: null` means THERE IS NOWHERE TO GO, and the row is rendered as plain
     text rather than a button.

     The check-in log is reachable from Settings but is not a page in nav.js's
     PAGES table, so `navigate('checkinlog')` lights nothing in the rail and
     lands on a screen with no title. A row that looks clickable and does
     nothing is worse than a row that never offered — especially on a dashboard,
     where a warden learns in one click whether the numbers are wired to
     anything. */
  /* ONE WORD EACH, AND THAT IS A HEIGHT DECISION, NOT A STYLE ONE.

     This card is one KPI tile wide (`.dash-row-b` gives it
     `calc((100% - 50px) / 6)`), and at that width "New Admissions",
     "Payments Received", "Complaints Raised" and "Maintenance Requests" each
     wrapped to two lines. Measured at 1280x660 the six rows came to
     23,23,32,59,32,31 = 200px — and this card is the ONLY content in row B that
     cannot shrink, so it alone sets the row's height: hiding it dropped row B
     from 275px to 156px and every screen size then reached the fold.

     Shortening them is not truncating them, which is what the rule in
     dashboard.css forbids: "Admissions" and "Maintenance" are the whole word,
     not an elided one, and the card's heading already supplies the period.
     `title` carries the long form for anyone who wants it. */
  return [
    { k: 'in',    label: 'Check-ins',   full: 'Check-ins today',            n: log.filter(c => isToday(c.date) && c.type !== 'Check-out').length, page: null },
    { k: 'out',   label: 'Check-outs',  full: 'Check-outs today',           n: log.filter(c => isToday(c.date) && c.type === 'Check-out').length, page: null },
    { k: 'new',   label: 'Admissions',  full: 'Students admitted today',    n: (DB.students || []).filter(s => isToday(s.joinDate)).length,       page: 'students' },
    /* CANCELLATIONS, DIRECTLY UNDER ADMISSIONS (owner, 2026-09-10). The card
       reports the counter's day, and filing a departure is the other half of
       the work admitting one is — the two rows read as the register opening and
       closing. It counts by `requestDate`, the day the request was FILED, for
       the same reason the payments row counts by the day the money was taken:
       this card asks what was done today, not what falls due today. A departure
       filed in August for a bed that empties in September belongs to August's
       day, and Needs Action in row C already carries the pending ones. */
    { k: 'cancel',label: 'Cancellations',full: 'Cancellations filed today',  n: (DB.cancellations || []).filter(c => isToday(c.requestDate)).length,  page: 'cancellations' },
    { k: 'money', label: 'Payments',    full: 'Payments collected today',   n: paid.length, money: paid.reduce((s, p) => s + money(p.amount), 0), page: 'payments' },
    { k: 'issue', label: 'Complaints',  full: 'Complaints raised today',    n: (DB.complaints || []).filter(c => isToday(c.date || c.createdAt)).length,  page: 'issues' },
    { k: 'wrench',label: 'Maintenance', full: 'Maintenance raised today',   n: (DB.maintenance || []).filter(m => isToday(m.date || m.createdAt)).length, page: 'maintenance' },
  ];
}

/** Payments settled this month, grouped by method. Shares `calcRevenue`'s month test. */
/* THE METHOD LIST IS `DB.settings.paymentMethods`, NOT whatever strings turn up
   in the data (owner, 7 Sep: "collection by method are parsing all payment
   methods"). Grouping on the raw field meant every spelling of a method became
   its own slice — 'Cash', 'cash' and 'Cash ' are three rows and three colours
   for one wallet, and a legacy value from an older build added a fourth. The
   lower-section spec §9 says it outright: use the configured list, and do not
   invent methods.

   So: normalise each payment against the configured names (trimmed,
   case-insensitive), and fold anything that matches nothing into a single
   'Other'.

   EVERY CONFIGURED METHOD IS LISTED, WITH OR WITHOUT MONEY (owner, 7 Sep: "fix
   wire the payment types whether it has balance or not"). A method at zero is
   a reading: it says nobody paid that way this month, which is the answer to a
   question a warden actually asks about a wallet they have just enabled. The
   earlier build dropped them, so a newly configured method simply never
   appeared and looked unwired. Zero rows draw muted and contribute no arc —
   they cannot, having no value — so the ring is unchanged by them.

   ORDER IS BY SIZE, DESCENDING, which is what both reference renders show and
   what the ring beside it reads as: the biggest slice starts at twelve o'clock
   and the list under the eye runs the same way. 'Other' sits last whatever its
   size — it is a residue, not a wallet.

   'Other' is never invented: it appears only when real money arrived under a
   name Settings does not know, and hiding that would lose rupees from a total
   that still has to add up. */
function _dlMethods(mo) {
  const paid = (DB.payments || []).filter(p => p.status === 'Paid' && _payMatchesMonth(p, mo));
  const total = paid.reduce((s, p) => s + Number(p.amount || 0), 0);

  const configured = (DB.settings && Array.isArray(DB.settings.paymentMethods) && DB.settings.paymentMethods.length)
    ? DB.settings.paymentMethods.slice()
    : ['Cash', 'JazzCash', 'EasyPaisa', 'Bank Transfer'];
  const canon = new Map();                       // lower-cased -> configured spelling
  configured.forEach(m => canon.set(String(m).trim().toLowerCase(), String(m).trim()));

  const sums = new Map();
  configured.forEach(m => sums.set(String(m).trim(), 0));
  let other = 0;
  for (const p of paid) {
    const key = String(p.method || '').trim().toLowerCase();
    const name = canon.get(key);
    if (name) sums.set(name, (sums.get(name) || 0) + Number(p.amount || 0));
    else other += Number(p.amount || 0);
  }

  const rows = configured
    .map(m => String(m).trim())
    .map(name => ({ name, amount: sums.get(name) || 0,
                    pct: total > 0 ? ((sums.get(name) || 0) / total * 100) : 0 }))
    /* Size order, descending, as both reference renders show — and the zeros
       fall to the bottom of their own accord rather than needing a rule. */
    .sort((a, b) => b.amount - a.amount);
  if (other > 0) rows.push({ name: 'Other', amount: other,
                             pct: total > 0 ? (other / total * 100) : 0 });
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
    /* A heartbeat, for the glance's closing line — the card reports a day's
       activity, and this is the one glyph that says "still running". */
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    /* alert and bolt exist in the emoji-chip map higher up this file, NOT in
       this one — asking _dlIco() for either returned an empty <svg> and the two
       panel heads drew a blank tile. */
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    bolt:  '<path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/>',
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
    chev:  '<path d="m9 18 6-6-6-6"/>',
  };
  return '<svg class="dl-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (P[k] || '') + '</svg>';
}

function _dashLedgerRow(mo, pending, pendingCount) {
  const glance    = _dlGlance(mo);
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
        + '<span class="dl-glance__label" title="' + escHtml(g.full || g.label) + '">'
          + escHtml(g.label) + '</span>'
        + (g.money != null && g.money > 0
            /* Compact: this sits in a column one KPI tile wide, and a real
               month's takings spelled out in full wrapped it onto three lines
               and pushed the six rows out of the card. The exact figure is on
               the Payments screen this row links to. */
            ? '<span class="dl-glance__sub dl-money" title="' + fmtPKR(g.money) + '">Rs. '
              + fmtCompact(g.money) + '</span>' : '')
      + '</span>'
      + '<span class="dl-glance__n">' + fmtNum(g.n) + '</span>';
    return g.page
      ? '<button class="dl-glance__row" onclick="navigate(\'' + g.page + '\')">' + inner + '</button>'
      : '<div class="dl-glance__row dl-glance__row--static">' + inner + '</div>';
  }).join('');

  /* THE METHOD COLOURS MOVED TO utils.js. They were a local here and Reports
     had a second, different ramp keyed by index — same wallets, two colour
     schemes, and the Reports one shifted whenever Settings was reordered. One
     authority now; the comment explaining the choice of hues went with it. */
  const _methodHue = (name) => methodHue(name);

  const methodRows = methods.rows.length
    ? methods.rows.map(m => {
        const hue = _methodHue(m.name);
        /* CLICKING A ROW GOES TO PAYMENTS (lower spec §10). The method filter
           is not a thing the Payments screen takes as an argument, so this
           navigates rather than pretending to pre-filter — §10's own fallback:
           "keep the row informational rather than inventing a new workflow". */
        return '<button class="dl-meth__row' + (m.amount > 0 ? '' : ' is-zero')
        + '" onclick="openPaymentsByMethod(&quot;' + escHtml(m.name) + '&quot;)"'
        + ' title="' + escHtml(m.name) + ' — ' + escHtml(fmtPKR(m.amount)) + ' this month. Open Payments.">'
        + '<span class="dl-meth__dot" style="background:' + escHtml(hue) + '"></span>'
        + '<span class="dl-meth__name">' + escHtml(m.name) + '</span>'
        + '<span class="dl-meth__bar"><i style="width:' + m.pct.toFixed(1) + '%;background:'
          + escHtml(hue) + '"></i></span>'
        + '<span class="dl-meth__pct">' + m.pct.toFixed(1) + '%</span>'
        + '<span class="dl-meth__amt">' + escHtml(fmtPKRk(m.amount)) + '</span>'
        + '</button>';
      }).join('')
    : '';

  /* THE DONUT, or nothing. §36: an empty month must not draw a full ring —
     that reads as "one method took everything" rather than "nothing came in". */
  const methodDonut = methods.total > 0
    ? _dashDonut(
        methods.rows.map(m => ({ value: m.amount, color: _methodHue(m.name),
                                 name: m.name, amount: m.amount,
                                 label: m.name + ' — ' + fmtPKR(m.amount) + '. Open Payments.',
                                 onclick: 'openPaymentsByMethod(&quot;' + escHtml(m.name) + '&quot;)' })),
        /* PKR ON ITS OWN LINE, above the figure - `exact .png`. Inline it
           competes with the number for the widest line in a 76px hole, and the
           number is the thing being read. */
        '<span class="dnut__cur">Rs.</span><span class="dnut__fig">'
          + escHtml(fmtCompactK(methods.total)) + '</span>',
        'Total Collected',
        { aria: 'Collection by payment method for ' + thisMonthLabel() })
    : '';

  /* QUICK ACTIONS — four, per the owner's `quick.png`.

     It was six (Add Student, Add Payment, Add Expense, Complaints, Rooms,
     Reports). Add Student already sits in the header as the page's one primary
     button, and Rooms and Reports are permanent sidebar entries — so half the
     panel was a third route to somewhere already on screen twice. The four
     that remain are the ones with no other one-click home: the two things a
     warden posts during the day, and the two things they raise. */
  /* EACH ONE OPENS ITS FORM, not the page the form lives on (owner, 2026-09-06).
     They used to navigate() — so "Add Payment" landed on the Payments table and
     the warden then had to find the button, which is two clicks and a scan to
     do the thing the tile is named after. A tile called Add X that does not add
     an X is a link wearing a verb.

     These are the same four entry points the header's primary button uses
     (headerAction() in nav.js), so a form opened from here is the identical
     form, with the identical permission check, opened from anywhere else.
     openAddPayment() is a page rather than a modal — Add Payment is a full
     screen in this app — and it is still the form, reached in one click. */
  /* Each card says what the form behind it DOES, as the reference draws it.
     "Add Payment" names the button; "Record a student payment" names the job,
     which is what somebody scanning four tiles is actually matching against. */
  const actions = [
    { k: 'card',   tone: 'blue',   label: 'Add Payment',      sub: 'Record a student payment', fn: "openAddPayment()" },
    { k: 'spend',  tone: 'green',  label: 'Add Expense',      sub: 'Record a hostel expense',  fn: "showAddExpenseModal()" },
    // One form covers complaints and maintenance — it opens with the two as a
    // toggle, which is why this is "Add Issue" rather than either noun.
    { k: 'issue',  tone: 'amber',  label: 'Add Issue',        sub: 'Log a complaint or issue', fn: "showAddIssueModal()" },
    { k: 'cancel', tone: 'violet', label: 'Add Cancellation', sub: 'Process a cancellation',   fn: "showAddCancellationModal()" },
  /* BACK TO THE OLD TILE (owner, 2026-09-09, third pass — `dashboard-now.png`
     handed over as "the actual viewport design, old design").

     This reverses the 9 Sep rebuild to `redesign nedd And quick actions.png`.
     That reference is drawn at nearly twice the width these panels get in row
     C, and every attempt to fit it here cost height: the tinted card with its
     glyph tile, chevron and sub-line measured 96px against this tile's 79, and
     even trimmed to 80 it was a bigger thing in a column that has none to give.
     `a.tone` and `a.sub` stay on the records above — they cost nothing and are
     what a wider layout would need — but nothing draws them here. */
  ].map(a =>
    '<button class="dl-act dh-' + a.tone + '" onclick="' + a.fn + '" title="' + escHtml(a.sub) + '">'
    + '<span class="dl-act__ic">' + _dlIco(a.k) + '</span>'
    + '<span class="dl-act__go">' + _dlIco('chev') + '</span>'
    + '<span class="dl-act__label">' + escHtml(a.label) + '</span></button>').join('');

  /* NEEDS ACTION — the sketch replaces Upcoming Reminders with this, and it is
     the better card. Reminders listed what was COMING; this lists what is
     already waiting on a decision, and every row names the decision rather
     than just the count. A warden reading "13 pending payments" still has to
     work out what to do about it; "Collect" does not.

     ALL FOUR ROWS ARE ALWAYS PRESENT — only the numbers change (owner, 2026-09-06,
     reversing the 2026-09-05 call that dropped zero rows). Dropping them made
     the panel a different shape every render: the rows moved under the cursor
     as a queue cleared, and a warden could not learn where "pending payments"
     lives because it was in a different place each morning — or absent, which
     reads as missing rather than clear. A fixed four-row list is scannable by
     position, and a 0 beside "pending payment" is itself the answer to the
     question the card exists to answer.

     A cleared row is muted rather than removed, so the ones that still want
     attention are the ones that carry colour. */
  /* Each row carries BOTH forms. `noun + 's'` produced "0 open maintenances",
     which only became visible once zero rows stopped being dropped — but it was
     equally wrong at 2, and had been all along. Maintenance is a mass noun; so
     is the plural of most of what a hostel counts. Spelling both out is shorter
     than the rule that would get them right. */
  const needs = [
    { k:'cancel', tone:'amber',  n:(DB.cancellations||[]).filter(c=>c.status==='Pending').length,
      one:'pending cancellation', many:'pending cancellations', verb:'View',    page:'cancellations' },
    { k:'card',   tone:'red',    n:pendingCount,
      one:'pending payment',      many:'pending payments',      verb:'Collect', page:'payments' },
    { k:'issue',  tone:'violet', n:(DB.complaints||[]).filter(c=>c.status==='Open').length,
      one:'open complaint',       many:'open complaints',       verb:'Resolve', page:'issues' },
    { k:'wrench', tone:'blue',   n:(DB.maintenance||[]).filter(m=>m.status==='Open').length,
      one:'open maintenance',     many:'open maintenance jobs', verb:'Assign',  page:'issues' },
  ];
  // The pill counts the rows that still want something, not the rows on screen —
  // four is now always the number of rows, and a badge that always reads 4 is
  // not information.
  const needsOpen = needs.filter(r => r.n > 0).length;

  /* A BUTTON AGAIN, and the tone back on the icon rather than the whole row —
     the old card, per `dashboard-now.png`. The tinted-row version had to put a
     real control inside each row, which forced the row itself to stop being a
     button (a button inside a button is markup a browser un-nests wherever it
     likes) and cost a div, a role and a keydown handler to get the keyboard
     back. A button that is a button needs none of them. */
  const needsRows = needs.map(r =>
        '<button class="dl-need dh-' + r.tone + (r.n === 0 ? ' is-clear' : '') + '"'
        + ' onclick="navigate(\'' + r.page + '\')">'
        + '<span class="dl-need__ic dh-' + r.tone + '">' + _dlIco(r.k) + '</span>'
        + '<span class="dl-need__n">' + fmtNum(r.n) + '</span>'
        + '<span class="dl-need__label">' + escHtml(r.n === 1 ? r.one : r.many) + '</span>'
        /* The verb still names the decision, because the row is still the way
           to that screen — but on a cleared row it would be an instruction to
           do nothing, so it reads Clear and loses its accent. */
        + '<span class="dl-need__verb">' + (r.n === 0 ? 'Clear' : escHtml(r.verb)) + '</span>'
        + '</button>').join('');

  return {
    /* THE HEADING HAS TO NAME THE WINDOW — which is why the pill carries the
       date rather than the month. The card was scoped to a month and headed
       "This Month at a Glance"; on 2026-09-09 the owner asked for the day
       instead, and _dlGlance() moved with the name. A heading that does not
       describe the numbers under it is worse than the empty card it replaced,
       and this card has now been on the wrong side of that twice. */
    glance:
        '<div class="dash-sec dl-panel">'
      +   '<div class="dash-sec__head">'
      +     dashEmojiChip('calendar', 24)
      +     '<span class="dash-sec__title">Today at a Glance</span>'
      /* THE DATE PILL IS GONE (owner, 2026-09-09). The card is headed "Today at
         a Glance" and the app's own date sits in the sidebar above it, so the
         pill was the third place one screen printed today's date. What the
         pill was FOR — naming the window the figures cover — is now carried by
         the title itself, which says "Today". */
      +   '</div>'
      +   '<div class="dl-glance">' + glanceRows + '</div>'
      /* THE CLOSING LINE (owner ref: `dashb.png`). Six counts and no verdict is
         a card that asks the reader to add up. This says what the six mean
         TOGETHER, and it is computed — with a complaint or a maintenance job
         open it names that instead of claiming everything is smooth. */
      +   '<div class="dl-foot dl-foot--tint">' + _dlIco('pulse')
      +     '<span>' + (() => {
              const open = (DB.complaints || []).filter(c => c.status === 'Open').length
                         + (DB.maintenance || []).filter(m => m.status === 'Open').length;
              return open
                ? open + ' open ' + (open === 1 ? 'job' : 'jobs') + ' to clear today'
                : 'Keep things running smoothly';
            })() + '</span></div>'
      + '</div>',

    /* COLLECTION BY METHOD (lower-section spec §5-§10).

       THE MONTH CHIP IS NOT A SECOND MONTH PICKER. §3 says do not modify the
       existing date/month selector, and there already is one — in the sidebar,
       where every figure on this screen is scoped from. So the chip REPORTS
       the selected month and opens that picker; it does not keep a scope of
       its own. Two controls that both set the month is how a screen ends up
       showing September in one card and August in the next. */
    methods:
        '<div class="dash-sec dl-panel dl-coll">'
      +   '<div class="dash-sec__head">'
      +     '<div class="dash-chip dh-blue dash-chip--sm">'
      +       '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px">'
      +       '<path d="M4 20h3v-8H4Zm6.5 0h3V4h-3Zm6.5 0h3v-12h-3Z"/></svg></div>'
      +     '<span class="dash-sec__title">Collection by Method</span>'
      +     '<button class="dl-monthchip" onclick="toggleSbCal()"'
      +       ' title="Every figure here follows the sidebar month. Open the picker.">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
      +       ' stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/>'
      +       '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>'
      +       '<span>' + escHtml(thisMonthLabel()) + '</span>'
      +       '<svg class="dl-monthchip__cv" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      +       ' stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
      +       '<path d="m6 9 6 6 6-6"/></svg>'
      +     '</button>'
      +   '</div>'
      +   (methods.total > 0
            ? '<div class="dl-coll__body">'
              + methodDonut
              + '<div class="dl-meth">' + methodRows + '</div>'
              + '</div>'
            /* §36's exact words, and no chart at all. */
            : '<div class="dl-empty dl-empty--tall">'
              + '<div class="dl-empty__t">No collections yet</div>'
              + '<div class="dl-empty__s">No payments recorded for '
              + escHtml(thisMonthLabel()) + '.</div></div>')
      + '</div>',

    /* ONE LINE OF HEAD, both panels. The 9 Sep version carried an emoji chip,
       a subtitle and a disabled "View all" — three rows of chrome above four
       rows of content, in the narrowest column on the page. The subtitles said
       nothing the titles did not ("Quick Actions / Common tasks, one click
       away"), and View all was drawn disabled because there is no combined
       outstanding list for it to open. The count pill returns to `.dash-pill`. */
    /* A CHIP, A TAGLINE AND A CLOSING LINE (owner ref: `dashb.png`). The head
       is still ONE line — the 9 Sep version stacked a title, a subtitle and a
       disabled "View all" and cost three rows of chrome in the narrowest column
       on the page. This is the chip and the tagline only, and the closing line
       goes at the FOOT, where it reads as the card's conclusion rather than as
       a second heading. */
    needs:
        '<div class="dash-sec dl-panel">'
      +   '<div class="dash-sec__head dl-head3">'
      +     '<span class="dl-head3__ico dh-amber">' + _dlIco('alert') + '</span>'
      +     '<span class="dl-head3__b"><span class="dash-sec__title">Needs Action</span>'
      +       '</span>'
      +     (needsOpen ? '<span class="dash-pill dh-red">' + needsOpen + '</span>' : '')
      +   '</div>'
      +   '<div class="dl-needs">' + needsRows + '</div>'
      +   '<div class="dl-foot">' + icon('info', 'xs')
      +     '<span>' + (needsOpen
            ? 'Resolve these to keep operations smooth'
            : 'Nothing is waiting on a decision') + '</span></div>'
      + '</div>',

    actions:
        '<div class="dash-sec dl-panel">'
      +   '<div class="dash-sec__head dl-head3">'
      +     '<span class="dl-head3__ico dh-violet">' + _dlIco('bolt') + '</span>'
      +     '<span class="dl-head3__b"><span class="dash-sec__title">Quick Actions</span>'
      +       '</span>'
      +   '</div>'
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
      '<button class="dash-rp-menu__item" onclick="_dashRowAct(event,\'showStudentPanel\',\'' + p.studentId + '\')">' + _rpIco('eye') + 'View student</button>'
      + '<button class="dash-rp-menu__item" onclick="_dashRowAct(event,\'printReceipt\',\'' + p.id + '\')">' + _rpIco('receipt') + 'Print receipt</button>'
      + (mayEdit
          ? '<button class="dash-rp-menu__item" onclick="_dashRowAct(event,\'showEditPaymentModal\',\'' + p.id + '\')">' + _rpIco('pencil') + 'Edit payment</button>'
            + (p.status === 'Pending'
                ? '<button class="dash-rp-menu__item dash-rp-menu__item--go" onclick="_dashRowAct(event,\'markPaymentPaid\',\'' + p.id + '\',true)">' + _rpIco('check') + 'Mark paid</button>'
                : '')
          : '');

    return '<tr class="dash-rp-row" onclick="showStudentPanel(\'' + p.studentId + '\')">'
      + '<td><div class="dash-rp-who"><div class="dash-rp-av">' + escHtml((name.trim()[0] || '?').toUpperCase()) + '</div>'
        + '<span class="dash-rp-name">' + escHtml(name) + '</span></div></td>'
      + '<td><span class="dash-rp-room">#' + escHtml(String(p.roomNumber || '')) + '</span></td>'
      + '<td><span class="dash-rp-num">' + (ch.monthly > 0 ? fmtPKR(ch.monthly) : '—') + '</span>'
        /* WHAT IT COVERS, NAMED (owner, 2026-09-10). This read "PKR 10,000
           rent + PKR 7,000 mess" — two numbers whose total is printed in the
           same cell directly above them — and the alternative branch said
           "rent only · mess off", which is the same fact in a different
           vocabulary. chargeCoverage() names all four cases in one word each,
           and it is the badge the students register and the payments register
           already draw. */
        + (ch.monthly > 0
            ? (c => '<span class="lk-cov ' + c.hue + '">' + escHtml(c.label) + '</span>')(chargeCoverage(ch))
            : '')
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
          <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="closeModal();showStudentPanel('${s.id}')"><svg class="icon icon-xs" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5C5 5 2 12 2 12s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11.5A4.5 4.5 0 1 1 16.5 12 4.5 4.5 0 0 1 12 16.5Z"/><circle cx="12" cy="12" r="2.2"/></svg> View</button>
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
  ${''/* THE SHEET'S OWN PRINT BUTTON IS GONE (owner, 2026-09-10: "remove the
         inside old print button from room visit sheet").

         The window this document opens in already carries Download PDF and
         Print, injected by _pdfInject() and fixed to the top centre — so the
         sheet was drawing a SECOND print button, in its own style, a few
         pixels under the first. Two buttons for one action, and the older of
         them calls window.print() directly, which is the path that cannot
         produce the export specification's own footer. */}
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
/* ── THE SEAT-AVAILABILITY EXPAND MODAL ──────────────────────────────────────
   Rebuilt 2026-09-10 to the owner's reference (`seat availability expand
   button.png`). It was a grid of tiles built out of inline `style="…"`
   attributes that painted two states — some free, or none — in a blue that is
   this app's ACCENT rather than a state colour, and answered "Occ: 2/4" with
   no sense of which of those a warden should act on.

   THREE STATES, EACH WITH ITS OWN COLOUR AND ITS OWN SENTENCE
     · seats free      — neutral card, green chip, "N seats available"
     · full            — red card, red chip, "No seats available"
     · over capacity   — amber card, amber chip, "+N over capacity"

   The third one is not a rendering curiosity: this app deliberately allows a
   room to be over-filled (submitAddStudent asks and then force-adds), so a
   room holding 3 in 2 beds is a real record that the old tile drew as an
   ordinary full room with a bar past 100%. It is the single most useful thing
   this modal can tell anyone, and it now has a colour of its own.

   THE SEAT GLYPHS ARE THE POINT OF THE REFERENCE. One figure per bed, filled
   for taken and hollow for free, is read at a glance in a way "2/4" is not.
   They are capped at eight per card and the remainder printed as "+N", because
   a hostel with a 20-bed dormitory would otherwise wrap the card.

   Everything drawn here comes from getRoomOccupancy() and the room's type —
   the same two calls the dashboard card behind it uses, so the modal and the
   card it expands cannot disagree. */
function _seatFigure(filled) {
  return '<svg class="sxp-fig' + (filled ? ' is-on' : '') + '" viewBox="0 0 24 24" '
       + 'fill="currentColor" aria-hidden="true">'
       + '<circle cx="12" cy="7.5" r="3.6"/>'
       + '<path d="M12 12.6c-4 0-6.6 2.1-6.6 4.6V20h13.2v-2.8c0-2.5-2.6-4.6-6.6-4.6z"/>'
       + '</svg>';
}

function _seatCard(r) {
  const rt   = getRoomType(r);
  const cap  = (rt && rt.capacity) || 1;
  const occ  = getRoomOccupancy(r);
  const free = cap - occ;
  const state = free > 0 ? 'free' : free === 0 ? 'full' : 'over';

  const chip = state === 'free' ? free + ' Free'
             : state === 'full' ? 'Full'
             : icon('warning', 'xs') + 'Over Capacity';
  const foot = state === 'free' ? free + ' seat' + (free === 1 ? '' : 's') + ' available'
             : state === 'full' ? 'No seats available'
             : '+' + (-free) + ' over capacity';

  /* Eight figures at most. A 20-bed dormitory is rare but real, and twenty
     glyphs would wrap the card into three rows of them. */
  const SHOWN = 8;
  const total = Math.max(cap, occ);
  const draw  = Math.min(total, SHOWN);
  let figs = '';
  for (let i = 0; i < draw; i++) figs += _seatFigure(i < occ);
  if (total > SHOWN) figs += '<span class="sxp-more">+' + (total - SHOWN) + '</span>';

  // Past 100% the bar is full — it cannot show more than the room has.
  const pct = Math.min(100, Math.round(occ / cap * 100));

  return `<button type="button" class="sxp-card is-${state}"
            onclick="closeModal();showRoomSeatDetailModal('${escHtml(String(r.id))}')"
            title="Open this room">
      <span class="sxp-head">
        <span class="sxp-n">Rm #${escHtml(String(r.number))}</span>
        <span class="sxp-chip">${chip}</span>
      </span>
      <span class="sxp-meta">${escHtml((rt && rt.name) || '—')} · ${escHtml(floorShort(r.floor) || 'Floor not set')}</span>
      <span class="sxp-mid">
        <span class="sxp-count">${occ} / ${cap}</span>
        <span class="sxp-figs">${figs}</span>
      </span>
      <span class="sxp-bar"><span class="sxp-bar__f" style="width:${pct}%"></span></span>
      <span class="sxp-foot">${escHtml(foot)}</span>
    </button>`;
}

function showSeatDetailModal(type) {
  if(type==='rooms') {
    const rooms = roomsByNumber(DB.rooms || []);
    if (!rooms.length) {
      showModal('modal-xl', ICONS.bed + ' All Rooms — Seat Availability',
        '<div class="sxp-empty">No rooms have been created yet. Add them from the Rooms page, '
        + 'or a floor at a time from Settings.</div>');
      return;
    }

    /* The three counts the grid is about, stated once above it. A warden opens
       this to find a bed; "11 rooms have space" answers that before they read
       a single card. */
    let free = 0, full = 0, over = 0, seatsFree = 0;
    rooms.forEach(r => {
      const cap = (getRoomType(r) || {}).capacity || 1;
      const n = cap - getRoomOccupancy(r);
      if (n > 0) { free++; seatsFree += n; } else if (n === 0) full++; else over++;
    });

    const bar = `<div class="sxp-sum">
        <span class="sxp-sum__c"><b>${rooms.length}</b> room${rooms.length === 1 ? '' : 's'}</span>
        <span class="sxp-sum__c is-free"><b>${free}</b> with space · <b>${seatsFree}</b> seat${seatsFree === 1 ? '' : 's'}</span>
        <span class="sxp-sum__c is-full"><b>${full}</b> full</span>
        ${over ? `<span class="sxp-sum__c is-over"><b>${over}</b> over capacity</span>` : ''}
      </div>`;

    showModal('modal-xl', ICONS.bed + ' All Rooms — Seat Availability',
      bar + '<div class="sxp-grid">' + rooms.map(_seatCard).join('') + '</div>');
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
      rows+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="closeModal();showStudentPanel('${s.id}')">
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
  `<button class="btn btn-secondary" onclick="exportMonthExcel('${monthKey}','${escHtml(monthLabel)}')">${ICONS.download} Export Excel</button>
   <button class="btn btn-secondary" onclick="printMonthReport('${monthKey}','${escHtml(monthLabel)}')">${ICONS.print} Export PDF</button>
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
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  showConfirm('Delete Fee Record','Remove this fee record? This cannot be undone.',async ()=>{
    DB.payments = DB.payments.filter(p=>p.id!==payId);
    await saveDB();
    toast('Fee record deleted','success');
    renderMonthModal(monthKey, monthLabel);
  });
}

async function deleteMonthExpense(expId, monthKey, monthLabel) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
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

/* ══ THE MONTH REPORT ══════════════════════════════════════════════════════
   The dashboard's month card exports the same period the card describes. It is
   a §40 report rather than a list: summary first, then the sections behind the
   summary — who was here, what was collected, where it went.

   It used to be two implementations, and they disagreed. The CSV carried a
   Summary block, room-ordered fee records and a grouped expense register; the
   PDF carried an unordered fee table and quoted `s.rent`, the rent half of the
   monthly charge, next to payments that included the mess. Both now render
   from this one definition, and the charge comes from resolveCharges().     */
function _dashMonthExportDef(monthKey, label) {
  const pays = DB.payments.filter(p => _payMatchesMonth(p, monthKey));
  // The Expenses section lists transfers too, under their own category, so the
  // rows add up to the Expenses figure in the summary block above them.
  const exps = _rptOutgoings(monthKey);
  const rev  = calcRevenue(monthKey);
  const expTotal = calcExpenses(monthKey);
  const pend = pays.filter(p => p.status === 'Pending').reduce((s, p) => s + outstandingOf(p), 0);
  const residents = DB.students.filter(isResident);
  const groups = _rptByCategory(exps);
  const roomOf = s => { const r = DB.rooms.find(x => x.id === s.roomId); return r ? String(r.number) : ''; };

  return {
    module: 'Month-Report',
    title:  'Month Report',
    scope:  label || monthLabel(monthKey),
    orientation: 'landscape',
    sheetPerSection: true,
    filters: [['Month', label || monthLabel(monthKey)]],

    summary: [
      { label: 'Revenue',        value: EXPORT.fmt.money(rev), tone: 'pos' },
      { label: 'Expenses',       value: EXPORT.fmt.money(expTotal), tone: 'neg' },
      { label: 'Available fund', value: EXPORT.fmt.money(rev - expTotal),
        tone: rev - expTotal >= 0 ? 'pos' : 'neg' },
      { label: 'Outstanding',    value: EXPORT.fmt.money(pend), tone: pend > 0 ? 'neg' : '' },
      { label: 'Residents',      value: String(residents.length) },
      { label: 'Payments',       value: String(pays.length) },
    ],

    sections: [
      {
        title: 'Fee records',
        meta: pays.length + ' record' + (pays.length === 1 ? '' : 's'),
        empty: 'No payment records in this month.',
        columns: [
          { label: 'Room', type: 'id', width: 9, value: p => String(p.roomNumber || ''),
            get: p => '<b>#' + escHtml(String(p.roomNumber || '—')) + '</b>' },
          { label: 'Student', type: 'text', width: 24, value: p => p.studentName || '' },
          { label: 'Month',   type: 'text', width: 16, value: p => monthLabel(p.month) },
          { label: 'Collected', type: 'money', width: 14, total: 'sum',
            value: p => Number(p.amount || 0) || null },
          { label: 'Still owed', type: 'money', width: 14, total: 'sum',
            value: p => outstandingOf(p) || null,
            get:   p => outstandingOf(p) > 0
                     ? '<span class="neg">' + fmtPKR(outstandingOf(p)) + '</span>' : '—' },
          { label: 'Method', type: 'text',   width: 13, value: p => p.method || '' },
          { label: 'Status', type: 'status', width: 11, value: p => payStatusOf(p) },
          { label: 'Date',   type: 'date',   width: 13,
            value: p => p.date || p.dueDate || '' },
        ],
        // Room order, like every other roster, export and PDF in this app — the
        // warden reads this sheet against the building, not insertion order.
        rows: pays.slice().sort((a, b) => cmpRoomNo(a.roomNumber, b.roomNumber)),
        grand: { label: 'Collected this month', value: fmtPKR(rev) },
      },
      {
        title: 'Expenses by category',
        meta: groups.length + ' categor' + (groups.length === 1 ? 'y' : 'ies'),
        empty: 'Nothing was spent in this month.',
        groupLabel: 'Category',
        columns: [
          { label: 'Date', type: 'date', width: 13, value: e => e.date || '' },
          { label: 'Description', type: 'wrap', width: 44, value: e => e.description || '' },
          { label: 'Amount', type: 'money', width: 15, total: 'sum',
            value: e => Number(e.amount || 0),
            get:   e => '<b>' + fmtPKR(e.amount) + '</b>' },
        ],
        groups: groups.map(g => ({
          label: g.cat,
          meta: g.items.length + ' record' + (g.items.length === 1 ? '' : 's'),
          rows: g.items,
          total: { label: 'Total — ' + g.cat, value: fmtPKR(g.total) },
        })),
        grand: { label: 'Total outgoing', value: fmtPKR(expTotal) },
      },
      {
        title: 'Residents',
        meta: residents.length + ' living here',
        empty: 'Nobody was on the roster in this month.',
        columns: [
          { label: 'Room', type: 'id', width: 9, value: roomOf,
            get: s => { const r = roomOf(s); return r ? '<b>#' + escHtml(r) + '</b>' : '—'; } },
          { label: 'Student', type: 'text', width: 24, value: s => s.name || '' },
          { label: 'Phone',   type: 'text', width: 16, value: s => String(s.phone || '') },
          /* The WHOLE monthly charge. This table quoted `s.rent` — the rent
             half — beside payments that included the mess, so the two columns
             could not be reconciled by the person holding the page. */
          { label: 'Charge / mo', type: 'money', width: 14, total: 'sum',
            value: s => { const c = resolveCharges(s); return c.configured ? c.total : null; } },
          { label: 'Status', type: 'status', width: 12, value: s => s.status || 'Active' },
        ],
        rows: studentsByRoom(residents),
      },
    ],

    empty: 'Nothing was recorded in this month.',
  };
}

function exportMonthExcel(monthKey, label) { EXPORT.excel(_dashMonthExportDef(monthKey, label)); }
function exportMonthCSV(monthKey, label)   { exportMonthExcel(monthKey, label); }
function printMonthReport(monthKey, label) { EXPORT.pdf(_dashMonthExportDef(monthKey, label)); }


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

  /* THE BADGE MUST GO WHEN THE CHART MOVES UNDER IT (owner, 7 Sep: "revenue
     trend pop hover kept on also when the page is drag down").

     It is position:fixed and placed from the last mouse event's VIEWPORT
     coordinates. Scrolling with the wheel moves the canvas out from under a
     stationary pointer without firing a single mousemove, so Chart.js's
     onHover never runs its else-branch and the badge is left floating over
     whatever scrolled into its place — pinned to the viewport, describing a
     month that is no longer there.

     Three ways out, because scrolling is not the only way to leave a chart
     without moving the mouse: the scroll container, the window, and the
     canvas's own mouseleave (which Chart.js does not guarantee to translate
     into an empty onHover). `capture:true` on the scroll listener catches the
     inner #content scroller, whose scroll events do not bubble to window. */
  function hideBadge() { if (badge) badge.style.display = 'none'; }
  if (badge && !badge._wired) {
    badge._wired = true;
    document.addEventListener('scroll', hideBadge, true);
    window.addEventListener('resize', hideBadge);
    const _cv = document.getElementById('trend-canvas');
    if (_cv) _cv.addEventListener('mouseleave', hideBadge);
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
      hoverBackgroundColor: function (c) { return real[c.dataIndex] ? hex : hex + '80'; },
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
        /* THE BAR ANSWERS THE POINTER (owner, 7 Sep: "make the revenue trend
           bar dynamic"). It was inert - the hover badge appeared but the chart
           itself never acknowledged which month it was describing, so on a
           twelve-bar year you read the badge and then hunted for the column it
           belonged to. The hovered bar goes solid and the faint months come up
           with it; the rest are untouched, so the highlight reads as "this
           one" rather than as the chart changing. */
        hoverBackgroundColor:function(c){
          return real[c.dataIndex] ? cRevenue : cRevenue+'80';
        },
        hoverBorderColor:cRevenue, hoverBorderWidth:2,
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
      /* THE BARS GROW IN, ONCE. `animation:false` made the chart appear
         complete, which on a range switch was indistinguishable from nothing
         having happened - the whole point of the Quarter / 6 Months / Year
         control is that the chart CHANGES, and it has to be seen to.

         260ms and only the height: no fade, no stagger, nothing that would
         still be moving while the figure is read. Design system §22 allows a
         value transition and forbids continuously animated charts; this is the
         former. Respecting the OS setting is not optional (§22 again). */
      animation: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? false : { duration: 260, easing: 'easeOutQuart' },
      /* INDEX MODE: hovering a month lights BOTH its bars and the badge reports
         both. Per-dataset hovering meant the badge said "Revenue and Expenses"
         while only one of the two columns responded. */
      interaction: { mode: 'index', intersect: false },
      hover: { mode: 'index', intersect: false },
      /* TOP PADDING 50 -> 6 (owner, 7 Sep: the plot should come up to the
         Quarter / 6 Months / Year line). The 50 was reserved for the rise/fall
         datalabels that floated above each bar - those were removed when they
         started printing things like "+157902725.6%" against a near-zero
         baseline, and the gap they needed was never given back. It was 50px of
         nothing between the card's header and the top of the chart. */
      layout:{padding:{top:6,right:10,left:4,bottom:0}},
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
    // The floor rides with the number (owner, 2026-09-10). It joins the
    // haystack too, so "g-floor" is now a search a warden can actually run.
    var roomLabel = room ? roomText(room) : '—';
    var haystack = [s.id, s.name, s.fatherName, s.cnic, s.phone, s.emergencyContact, s.email, s.occupation, s.address, s.city, s.permanentAddress, roomLabel].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: 'student', icon: ICONS.student,
        title: s.name || '—',
        sub: 'ID: ' + s.id + ' · Room ' + roomLabel + (s.occupation ? ' · ' + s.occupation : '') + (s.phone ? ' · ' + s.phone : ''),
        badge: statusBadge(s.status || 'Active'),
        action: "showStudentPanel('" + s.id + "')"
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
        title: 'Room ' + roomText(r),
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

  /* Payments by student name — OR BY RECEIPT NUMBER (owner, 2026-09-10:
     "receipt number vhich is on the receipt and also from recipt"). A student
     comes back holding a slip with RCP-000123 printed on it, and that is often
     the only thing they can tell you. A receipt hit is not deduplicated by
     student the way a name hit is: the number identifies ONE record, and
     opening the payments page filtered to it is the whole answer. */
  var payHits = [];
  DB.payments.forEach(function(p) {
    var byReceipt = String(p.receiptNo || '').toLowerCase().includes(q);
    if (byReceipt) { payHits.push(p); return; }
    if ((p.studentName || '').toLowerCase().includes(q)) {
      if (!payHits.find(function(x){ return x.studentId === p.studentId; })) {
        payHits.push(p);
      }
    }
  });
  payHits.slice(0, 3).forEach(function(p) {
    var hitByReceipt = String(p.receiptNo || '').toLowerCase().includes(q);
    var term = hitByReceipt ? String(p.receiptNo) : (p.studentName || '');
    results.push({
      type: 'payment', icon: ICONS.card,
      title: p.studentName || '—',
      sub: (hitByReceipt ? p.receiptNo + ' · ' : '')
         + p.month + ' · ' + (p.status === 'Paid' ? 'Paid' : 'Pending') + ' · ' + fmtPKR(p.amount),
      badge: statusBadge(p.status),
      /* A receipt jump also drops the month scope. The payments page opens on
         the current month, and a slip from March would land the warden on an
         empty table with their own search term in the box — which reads as
         "no such receipt". */
      action: "payFilter.search='" + term.replace(/'/g, "\\'") + "';"
            + (hitByReceipt ? "payFilter.month='All';" : "")
            + "navigate('payments')"
    });
  });

  if (!results.length) {
    resultsBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No results for <strong style="color:var(--text)">"' + escHtml(query) + '"</strong></div>';
    resultsBox.style.display = 'block';
    _dashSearchAnchor();
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
  _dashSearchAnchor();
}

/* ── THE PANEL GOES UNDER THE FIELD, NOT OVER IT ─────────────────────────────
   Owner, 2026-09-10: "vhen a user type some thing, the hover card blinds the
   user and then cant see vhat he is tping."

   The panel is `position: fixed` and its markup carried `top: 56px`, written
   once against a header that was that tall at the time. The header is 56px and
   the search PILL runs from 48px to 88px — so the panel opened 32px above the
   bottom of the field it belongs to and covered the text as it was typed. Only
   `left` was ever computed.

   Both edges are measured now, off the PILL rather than the bare input: the
   input is the 16px text box inside a 40px control, and anchoring to it would
   still overlap the pill's lower padding. 6px of air below the pill, and the
   panel is clamped to the viewport so a narrow window cannot push it off the
   right-hand edge. */
function _dashSearchAnchor() {
  var box = document.getElementById('dash-search-results');
  if (!box) return;
  var pill = document.querySelector('.hdr-find')
          || document.getElementById('dash-global-search');
  if (!pill) return;
  var r = pill.getBoundingClientRect();
  box.style.top = Math.round(r.bottom + 6) + 'px';
  var w = box.getBoundingClientRect().width || 460;
  var left = Math.min(Math.round(r.left), Math.max(8, window.innerWidth - w - 16));
  box.style.left = left + 'px';
  /* Never taller than the room left below it — a long result list used to run
     past the bottom of the window with no way to reach the last item. */
  box.style.maxHeight = Math.max(160, Math.round(window.innerHeight - r.bottom - 24)) + 'px';
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