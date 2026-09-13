/* ─── HOSTYLLO — PAYMENTS MODULE ─────────────────────────────────────────────
   Contains: renderPayments, generateMonthlyRents, markPaymentPaid,
             deletePayment, filterStudentDropdown, selectStudentForPayment,
             recalcUnpaid, renderAddPayment, openAddPayment, submitAddPayment,
             showAddPaymentForStudent, showEditPaymentModal, submitEditPayment,
             extra charges helpers, print+submit helpers
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   PAYMENTS v5 — derived state helpers
   The stored `status` field only ever holds 'Paid' or 'Pending'. The reference
   design distinguishes three more states that the data already supports, so
   they are DERIVED here rather than written back to the record.
   ══════════════════════════════════════════════════════════════════════════ */

// A pending payment is overdue once its own dueDate is in the past.
function payIsOverdue(p) {
  if (!p || p.status === 'Paid') return false;
  const d = p.dueDate || '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return false;
  return d.slice(0,10) < today();
}

// 'Paid' | 'Partial' (something was collected, a balance remains) | 'Pending'.
function payStatusOf(p) {
  if (!p) return 'Pending';
  if (p.status === 'Paid') return 'Paid';
  return Number(p.amount || 0) > 0 ? 'Partial' : 'Pending';
}

/* ── STUDENT SNAPSHOT SYNC ────────────────────────────────────────────────────
   A payment stores the student's name and room number at the moment it is
   written, so receipts and archived records stay readable after a student is
   deleted. The cost is that correcting a student's name left every existing
   payment — and therefore the payments table, the CSVs, the reports and every
   PDF built from them — showing the old one forever. Editing a student now
   pushes the correction down onto their records, and the same pass runs once
   at boot so history already on disk is repaired too.

   Records typed in manually carry no studentId; those keep the name as typed. */
function syncStudentSnapshots(t) {
  if (!t || !t.id) return 0;
  const room = (DB.rooms || []).find(r => r.id === t.roomId);
  const roomNo = room ? room.number : null;
  let touched = 0;
  const apply = (rec, nameField) => {
    if (!rec || rec.studentId !== t.id) return;
    if (t.name && rec[nameField] !== t.name) { rec[nameField] = t.name; touched++; }
    // The room is only stamped forward while the debt is still open. A settled
    // record is a receipt of what happened, and the student did live in that
    // room when they paid.
    if (roomNo != null && rec.status !== 'Paid' && String(rec.roomNumber||'') !== String(roomNo)) {
      rec.roomId = t.roomId; rec.roomNumber = roomNo; touched++;
    }
  };
  (DB.payments      || []).forEach(p => apply(p, 'studentName'));
  (DB.cancellations || []).forEach(c => apply(c, 'studentName'));
  return touched;
}

/* Boot-time repair for data written before syncStudentSnapshots() existed.
   Indexed by id so it stays O(payments) rather than O(payments × students). */
function repairStudentSnapshots() {
  const byId = new Map((DB.students || []).map(s => [s.id, s]));
  let touched = 0;
  (DB.payments || []).forEach(p => {
    const t = p.studentId ? byId.get(p.studentId) : null;
    if (!t) return;                                   // manual entry or deleted student
    if (t.name && p.studentName !== t.name) { p.studentName = t.name; touched++; }
  });
  (DB.cancellations || []).forEach(c => {
    const t = c.studentId ? byId.get(c.studentId) : null;
    if (!t) return;
    if (t.name && c.studentName !== t.name) { c.studentName = t.name; touched++; }
  });
  return touched;
}

/* ── BOOT REPAIR: PAYMENT COMPOSITION ────────────────────────────────────────
   Records already on disk that describe themselves wrongly. Nothing here moves
   money: `amount` and `unpaid` are what the warden collected and what the
   student owes, and they are treated as fact throughout. Only the description
   of how a total was made up is corrected, and only where the record's own
   numbers prove what the right description is.

   Three things are repaired.

   1. RENT DRIFT. Records raised before rent and mess were split carry the
      all-in figure in `monthlyRent` (8,000 + 6,500 = 14,500) AND a separate
      `messCharge` of 6,500 beside it. Add those up and the month reads 21,000
      while the student was only ever billed 14,500 — the mess is counted twice.
      Now that the Add Payment form loads a month's existing record and
      recomputes the total from it, that phantom 6,500 shows up on screen as a
      balance nobody owes. Detected by the exact pre-split signature
      (monthlyRent === rent + mess) plus a booked total that matches the all-in
      composition, and repaired by putting the split rent back in `monthlyRent`.

   2. MESS FLAGGED ON A RENT-ONLY MONTH. The mirror image: the rent half is
      already correct, the record carries a mess line and says it is included,
      but the total booked is rent alone. The tick is what is wrong, so it is
      turned off — the amount stays as the configured-but-unbilled figure, which
      is the same convention resolveCharges() uses. Where EVERY mess-carrying
      record a student has is booked rent-only, the student is taken off the
      mess too, since that is what their whole history says.

   3. INSTALMENT TRAILS THAT NEVER HAPPENED. `partialPayments` is the receipt's
      payment history. Two bugs wrote into it: a clear-the-balance action that
      could fire twice, and the Add Payment merge that REPLACED `amount`
      instead of adding to it — leaving records that claim two full collections
      on a month where nothing was collected at all. Only what is provably
      false is removed: byte-identical duplicate entries, and every entry on a
      record where nothing has ever been collected. A trail that merely
      disagrees is left alone — it cannot be reconstructed, and the receipt is
      what stops printing a contradiction (see buildReceiptHTML).            */
function repairPaymentComposition() {
  const fixed = { drift: 0, messFlag: 0, students: 0, dupEntries: 0, ghostTrails: 0 };
  const byId = new Map((DB.students || []).map(s => [s.id, s]));
  const num  = v => Number(v || 0);

  // What the record says was billed, mess included as its own line.
  const bookedOf   = p => num(p.amount) + num(p.unpaid);
  const withoutMess = p => num(p.monthlyRent) + num(p.extraTotal) + num(p.admissionFee)
                         - num(p.concession != null ? p.concession : p.discount);

  const rentOnlyMonths = new Map();   // studentId -> {mess:0, rentOnly:0}

  (DB.payments || []).forEach(p => {
    if (!p) return;
    const mess = num(p.messCharge);
    const carriesMess = mess > 0 && p.messIncluded !== false;

    if (carriesMess && p.studentId) {
      const tally = rentOnlyMonths.get(p.studentId) || { mess: 0, rentOnly: 0 };
      tally.mess++;
      // A month can be rent-only in two ways, and both are in the live data:
      // the tick is off, or the mess is billed and then cancelled by a
      // concession of exactly the same amount. Net contribution of the mess to
      // what the student owed is zero either way, so both count.
      if (num(p.concession != null ? p.concession : p.discount) === mess) tally.rentOnly++;
      rentOnlyMonths.set(p.studentId, tally);
    }

    if (carriesMess && bookedOf(p) === withoutMess(p) && bookedOf(p) > 0) {
      const t = p.studentId ? byId.get(p.studentId) : null;
      const c = t ? resolveCharges(t) : null;
      // 1 — the pre-split all-in signature: the mess is already inside the rent.
      if (c && c.rent > 0 && num(p.monthlyRent) === c.rent + mess) {
        p.monthlyRent = c.rent;
        p.totalRent   = c.rent;
        fixed.drift++;
      } else {
        // 2 — the rent half is right and the month was billed without mess.
        p.messIncluded = false;
        fixed.messFlag++;
        if (p.studentId) {
          const tally = rentOnlyMonths.get(p.studentId);
          if (tally) tally.rentOnly++;
        }
      }
    }

    // 3 — trails that cannot be true.
    const hist = p.partialPayments;
    if (Array.isArray(hist) && hist.length) {
      if (num(p.amount) === 0 && p.status !== 'Paid') {
        fixed.ghostTrails += hist.length;
        p.partialPayments = [];
      } else {
        const seen = new Set(), kept = [];
        hist.forEach(x => {
          const k = [x && x.date, num(x && x.amount), x && x.method,
                     x && x.note, x && x.collectedBy].join('|');
          if (seen.has(k)) return;
          seen.add(k); kept.push(x);
        });
        if (kept.length !== hist.length) {
          fixed.dupEntries += hist.length - kept.length;
          p.partialPayments = kept;
        }
      }
    }
  });

  // A student every one of whose mess-carrying months was billed rent-only is
  // not on the mess, whatever their record says.
  rentOnlyMonths.forEach((tally, sid) => {
    if (!tally.mess || tally.rentOnly !== tally.mess) return;
    const t = byId.get(sid);
    if (t && t.messOptIn !== false) { t.messOptIn = false; fixed.students++; }
  });

  return fixed;
}

/* "Sep 2026" from the same input monthLabel() takes, and by the same rules —
   it delegates, then shortens, so a stored "2026-09" and a legacy "September
   2026" label both come out the same shape. No second month table. */
function payMonthShort(m) {
  const full = monthLabel(m) || '';
  const bits = full.split(' ');
  if (bits.length !== 2) return full;
  return bits[0].slice(0, 3) + ' ' + bits[1];
}

function payStatusHue(s) {
  return s === 'Paid' ? 'dh-green' : s === 'Partial' ? 'dh-amber' : 'dh-slate';
}

/* A GLYPH FOR EVERY STATUS, NOT JUST FOR PAID.

   The pill drew a tick on Paid and nothing on Partial or Pending, so those two
   were separated by hue alone — amber against slate. That is the one thing the
   dark-mode brief §6 and the badge sheet both rule out ("do not communicate
   meaning through colour alone"), and it is not an abstract concern here: the
   two hues are a warning amber and a neutral grey at 9.5px, which is a
   distinction that survives neither a red-green deficiency nor a cheap panel at
   a hostel counter.

   Shapes, not decoration: a full tick for settled, a half-filled circle for
   part-paid, an open clock for nothing-yet, a warning for past due. The shape
   says the same thing as the colour, so either one alone is enough. */
function payStatusIcon(s) {
  const o = 'width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
          + 'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
  if (s === 'Paid')    return `<svg ${o}><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
  if (s === 'Partial') return `<svg ${o}><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor" stroke="none"/></svg>`;
  if (s === 'Overdue') return `<svg ${o}><circle cx="12" cy="12" r="10"/><path d="M12 7v6"/><path d="M12 16.5v.5"/></svg>`;
  return `<svg ${o}><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></svg>`;   // Pending
}

/* ── TABLE MONEY — compact digits, exact figure on hover ─────────────────────
   This table is SCANNED, not reconciled: a warden runs down the Unpaid column
   looking for who owes, and "PKR 476.5K" answers that faster than
   "PKR 476,500". The precise number is never lost — it is in the title here, on
   the receipt, in the edit form, and in the CSV, which stays exact on purpose
   (payments spec §33: UI "PKR 476.5K", CSV "476500").

   It also buys the width the page actually needed. Twelve columns did not fit
   at the 1366 QA floor while every money cell spelled out its thousands
   separators, and Adm. Fee, Extra Charges and Concession were the three that
   fell off the right edge — the three the spec says must never be hidden.

   fmtPKRk() already implements the spec's thresholds exactly (§7: PKR 8K,
   PKR 476.5K, PKR 1.24M), so this adds the tooltip and nothing else. Both
   halves come from the one formatter, so there is never a second "PKR". */
function payMoney(n) {
  const compact = fmtPKRk(n), exact = fmtPKR(n);
  return compact === exact ? compact : `<span title="${exact}">${compact}</span>`;
}

/* The split behind a Charge/Mo figure, for its tooltip.

   NOT chargesBreakdown(). That helper reads resolveCharges()'s shape — it opens
   on `if (!c.configured)` and goes on to read `rentSource` and `messOptIn`,
   none of which paymentCharges() returns. Handing it a paymentCharges() object
   does not throw; it just takes the first branch every time, so the tooltip
   read "No rent configured — set it in Settings" on every row of a table full
   of correctly configured rents. Silent, and invisible to any spec that does
   not assert tooltip text.

   The two are not interchangeable and should not be made so: resolveCharges()
   answers "what does this STUDENT pay now", paymentCharges() answers "what did
   THIS RECORD bill" — which is the right question for a row that may be months
   old and predate a price change. So the sentence is built from the record's
   own numbers here, and says exactly what the sub-line it replaced said. */
function payChargeTitle(c) {
  const rent = Number(c.rent || 0), mess = Number(c.mess || 0);
  if (!rent && !mess) return 'No charge recorded on this payment';
  if (c.messIncluded && mess > 0) return fmtPKR(rent) + ' rent + ' + fmtPKR(mess) + ' mess';
  if (c.hasMess)                  return fmtPKR(rent) + ' rent · mess not charged this month';
  return fmtPKR(rent) + ' rent';
}

// Stable avatar hue from the name, so a student keeps the same colour between
// renders (an index-based rotation would reshuffle on every sort or filter).
function payAvatarHue(name) {
  const hues = ['dh-violet','dh-blue','dh-green','dh-amber','dh-red'];
  let h = 0; const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

/* Mask a CNIC — the list is visible on a shared warden screen and the full
   number is never needed at a glance.

   THIS USED TO BE ITS OWN MASK, and it disagreed with the one the exports use:
   here `17300-*******-6`, there `17300-30*******`. Owner, 2026-09-10: "make
   the cnic detail in pages as it is in the pdf and only should be shovn vhen
   cursor is placed upon it" — so there is now one rule, in utils.js, and it
   is the PDF's. Two different partial views of a national identity number are
   also two different leaks: between them they gave away the last digit as
   well as the first seven.

   cnicHtml() returns escaped markup and adds the hover reveal. */
function payMaskCnic(c) {
  return cnicHtml(c);
}

// Every month present in the data, newest first — the month select is built
// from real records, so it can never offer a month with nothing behind it.
/* THE PICKER LISTS MONTH KEYS, NOT WHATEVER STRING IS IN THE RECORD (owner,
   2026-09-10: every month picker opens on the current month).

   `p.month` is written as 'YYYY-MM' by every path in the app today, but records
   from older builds carry a display label — 'September 2026' — and this list
   used the raw values. Two spellings of one month made two options, and picking
   either hid the rows written under the other, because the filter was an exact
   string compare. _payMonthKey() normalises both, so a month is a month.

   THE CURRENT MONTH IS ALWAYS IN THE LIST, with or without records in it. It is
   what the page opens on, and a picker that cannot show its own selection is
   the sort of thing that reads as a blank screen: on the 1st of a month, before
   Generate Month has run, there are no records to build an option from. */
function payMonthOptions() {
  const seen = new Set([thisMonth()]);
  DB.payments.forEach(p => { const k = _payMonthKey(p); if (k) seen.add(k); });
  return [...seen].sort((a, b) => String(b).localeCompare(String(a)));
}

/* WHICH MONTH THE TABLE IS SHOWING, as one answer for the row filter, the stat
   strip and the arrears count. `'All'` and the popover's "Include every month"
   both mean no month scope at all; anything else is a month key. */
function payScopeKey() {
  if (payFilter.month === 'All' || payFilter.showAll) return null;
  return payFilter.month || thisMonth();
}

// Single source of truth for the filtered+sorted list. Used by the table, the
// CSV export and the stat strip so the three can never disagree.
// A record from a month EARLIER than `mo` that still has money owing on it.
// These are the balances a warden would otherwise have to go back a month to
// find, which is why they are shown alongside the current month by default.
function payIsArrear(p, mo) {
  if (outstandingOf(p) <= 0) return false;
  if (payStatusOf(p) === 'Paid') return false;
  const k = _payMonthKey(p);
  return !!k && k < mo;
}

/* ── ARRIVING AT PAYMENTS WITH A QUESTION ALREADY ASKED ─────────────────────
   The dashboard's lower widgets link here, and until now every one of them
   landed on the unfiltered table (owner, 7 Sep: "view all pending payment only
   directs to payment page not pending payments inside the payment page"). That
   is a link that drops you at the front door of a building and leaves you to
   find the room.

   Both helpers RESET the filter before setting their one clause. Carrying
   whatever the warden last left on the Payments screen would silently subtract
   rows from an answer the dashboard just promised — arrive from "5 pending" and
   see three, because last week's room filter was still on. */
function _payResetFilter() {
  payFilter.status = 'All'; payFilter.method = 'All'; payFilter.room = 'All';
  payFilter.month = 'All'; payFilter.search = ''; payFilter.unpaidOnly = false;
  payFilter.showAll = false; payFilter.arrears = true; payFilter.page = 1;
  if (typeof paySelected !== 'undefined' && paySelected && paySelected.clear) paySelected.clear();
}

/* SET THE FILTER *AFTER* navigate(), NEVER BEFORE. navigate() clears
   status/room/month/unpaidOnly on every change of page — deliberately, so a
   filter left on last visit does not silently hide rows on this one. Setting
   the clause first therefore had it wiped a millisecond later, and View All
   landed on the unfiltered table exactly as before. navigate() first, then the
   clause, then renderPage() to repaint in place (which does not touch the
   trail, so Back still points at where we came from). */

/** Payments, showing only what is still owed (lower-section spec §17). */
function openPaymentsPending() {
  navigate('payments');
  _payResetFilter();
  payFilter.status = 'Pending';
  renderPage('payments');
}

/** Payments, showing only one wallet — where a donut slice or a method row goes.
    An unknown name would filter the table to nothing and look broken, so
    'Other' (and anything Settings does not know) opens the table unfiltered. */
function openPaymentsByMethod(name) {
  navigate('payments');
  _payResetFilter();
  const known = (DB.settings && Array.isArray(DB.settings.paymentMethods))
    ? DB.settings.paymentMethods.map(m => String(m).trim()) : [];
  const hit = known.find(m => m.toLowerCase() === String(name || '').trim().toLowerCase());
  if (hit) payFilter.method = hit;
  renderPage('payments');
}

function payFiltered() {
  const mo = thisMonth();
  let pays = DB.payments.filter(p => {
    // Month: an explicit pick wins; otherwise fall back to the this-month /
    // all-months scope toggle in the Filters popover. In the this-month scope
    // an older record that is still unpaid rides along as an arrear, so it can
    // be collected here instead of only in the month it was raised.
    /* ONE RULE FOR EVERY MONTH, INCLUDING THE ONE PICKED BY HAND. This used to
       be two: an explicit pick was an exact string compare with no arrears, and
       only the implicit this-month scope carried unpaid earlier months forward.
       So "Carry forward unpaid earlier months" — which is on by default and
       says nothing about which month you are looking at — quietly stopped
       applying the moment a warden used the picker. Now the checkbox means what
       it says against whichever month is selected. */
    const _mk = payScopeKey();
    if (_mk && !_payMatchesMonth(p, _mk) && !(payFilter.arrears && payIsArrear(p, _mk))) return false;

    if (payFilter.room !== 'All' && String(p.roomNumber || '') !== payFilter.room) return false;
    if (payFilter.method !== 'All' && p.method !== payFilter.method) return false;
    if (payFilter.unpaidOnly && !(outstandingOf(p) > 0)) return false;

    if (payFilter.status !== 'All') {
      // 'Overdue' is no longer offered, but a session that had it selected — or
      // a saved filter — would otherwise filter against a status nothing sets.
      if (payFilter.status === 'Overdue') { payFilter.status = 'Pending'; }
      else if (payStatusOf(p) !== payFilter.status) return false;
    }
    if (payFilter.search) {
      const q = payFilter.search.toLowerCase();
      const st = DB.students.find(s => s.id === p.studentId);
      /* RECEIPT NUMBER IS SEARCHABLE (owner, 2026-09-10: "receipt number vhich
         is on the receipt and also from recipt"). A student comes back with a
         paper slip and RCP-000123 on it; that number has to find the record
         that produced it, or it is decoration. */
      const hay = [p.studentName, String(p.roomNumber), p.month, p.method, p.status,
                   p.receiptNo,
                   st?.fatherName, st?.cnic, st?.phone, st?.email];
      if (!hay.some(f => f && String(f).toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  return applySort(pays, payFilter, {
    student: p => p.studentName,
    room:    { get: p => p.roomNumber, cmp: cmpRoomNo },
    month:   p => new Date((p.month || '') + ' 1').getTime() || 0,
    rent:    p => Number(p.monthlyRent || p.totalRent || p.amount || 0),
    paid:    p => Number(p.amount || 0),
    unpaid:  p => outstandingOf(p),
    method:  p => p.method,
    status:  p => payStatusOf(p)
  });
}

function renderPayments() {
  const mo = thisMonth();
  const moLabel = thisMonthLabel();

  let pays = payFiltered();

  const _pg = paginate(pays, payFilter);

  const pmOpts=DB.settings.paymentMethods.map(m=>`<option value="${escHtml(m)}" ${payFilter.method===m?'selected':''}>${escHtml(m)}</option>`).join('');

  // Which of the visible rows are carried-over debt rather than this month's
  // billing. Only meaningful in the default this-month scope; an explicit month
  // pick or "all months" has no separate arrears notion.
  const _scopeKey    = payScopeKey();
  const _arrearScope = !!_scopeKey && payFilter.arrears;
  const isArrear = p => _arrearScope && payIsArrear(p, _scopeKey);
  const nArrears = pays.filter(isArrear).length;
  const arrearsAmt = pays.filter(isArrear).reduce((s,p)=>s+outstandingOf(p),0);

  // ── Stat strip figures — all computed from the CURRENT filtered list, so the
  //    cards always describe exactly what the table below is showing.
  //    "Total Collected" is the one exception: money banked against an older
  //    month was collected in that month, and adding it here would re-create
  //    the cross-month mixing that arrears rows exist to expose, not hide.
  const total=pays.filter(p=>!isArrear(p)).reduce((s,p)=>s+Number(p.amount),0);
  const nPaid    = pays.filter(p=>payStatusOf(p)==='Paid').length;
  const nPending = pays.filter(p=>payStatusOf(p)!=='Paid').length;
  const outstanding = pays.reduce((s,p)=>s+outstandingOf(p),0);
  const share = n => pays.length ? Math.round(n/pays.length*100) : 0;

  // Month-over-month change in collections. Real months only — renders nothing
  // when there is no previous month to compare against.
  const _mDelta = (()=>{
    const d = new Date(); const cur = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const pd = new Date(d.getFullYear(), d.getMonth()-1, 1);
    const prev = pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0');
    const sum = k => DB.payments.filter(p=>_payMatchesMonth(p,k)).reduce((s,p)=>s+Number(p.amount||0),0);
    const a = sum(prev); if(!a) return null;
    return ((sum(cur)-a)/a)*100;
  })();
  const _mPrevLabel = (()=>{
    const d = new Date(), pd = new Date(d.getFullYear(), d.getMonth()-1, 1);
    return pd.toLocaleString('en-IN', { month:'long', year:'numeric' });
  })();

  /* KPI FIGURES ARE COMPACT, AND THE EXACT ONE IS NEVER MORE THAN A GLANCE
     AWAY. utils.js argues the opposite for the DASHBOARD's KPI row — that
     rounding PKR 476,700 to "477K" throws away the figure a warden reconciles
     against a cash drawer — and that reasoning is right there and wrong here,
     for one reason: this page prints the exact total in the meta line directly
     under the toolbar ("Total collected: PKR 84,000"), so the precise number is
     already on screen. The card is the headline; the line under it is the
     receipt. Both money KPIs also carry the exact figure in their title.

     The payments spec asks for this explicitly and by example (§4 "PKR 476.5K",
     §6 "PKR 1.24M", §7's whole table), so fmtCompactK is the formatter that
     matches its thresholds — fmtCompact stays exact below ten million and would
     print neither. */
  const upArrow   = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>';
  const downArrow = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7 17 17"/><path d="M17 9v8H9"/></svg>';

  const roomNums = [...new Set(DB.payments.map(p=>String(p.roomNumber||'')).filter(Boolean))]
                     .sort(cmpRoomNo);
  const monthOpts = payMonthOptions();
  const activeFilters = [payFilter.showAll, payFilter.unpaidOnly].filter(Boolean).length;

  const th = (key,label,extra) => {
    const on = payFilter.sortKey===key;
    const arw = on ? (payFilter.sortDir==='asc'?'▲':'▼') : '⇅';
    return `<th class="is-sortable${on?' is-sorted':''}" ${extra||''} onclick="toggleSort(payFilter,'payments','${key}')" title="Sort by ${label}">${label}<span class="arw">${arw}</span></th>`;
  };

  return `
  <!-- ══ STAT STRIP ══ -->
  <div class="pay-stats">
    <div class="pay-stat dh-green">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg></div>
        <div class="pay-stat__label">Total Collected</div>
      </div>
      <div class="pay-stat__val" title="${escHtml(fmtPKR(total))}"><span class="cur">Rs.</span>${fmtCompactK(total)}</div>
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">${_scopeKey ? escHtml(monthLabel(_scopeKey)) : 'All months'}</span>
        ${/* A PERCENTAGE AGAINST A NEAR-EMPTY MONTH IS NOISE, NOT A READING.
             _mDelta only refuses to divide by an exactly-zero previous month, so
             a month that took PKR 8,000 against this month's 76,000 printed
             "850.0%" — true, and useless. Payments spec §6 rules this out by
             name ("never display nonsensical values such as +15790211.2%"), and
             the dashboard printed exactly that before its trend was capped.

             Past ten-fold the ratio stops being a percentage anyone reads and
             becomes a shape, so it is said as one. The exact figures are both on
             this screen already — this month in the card above, last month one
             click away in the month filter. */''}
        ${_mDelta!==null?`<span class="pay-stat__delta ${_mDelta>=0?'dh-green':'dh-red'}" title="vs ${escHtml(_mPrevLabel)}">${_mDelta>=0?upArrow:downArrow}${Math.abs(_mDelta)>=1000?'>10×':Math.abs(_mDelta).toFixed(1)+'%'}</span>`:''}
      </div>
    </div>

    <div class="pay-stat pay-stat--click dh-green" onclick="paySetStatus('Paid')" title="Show only paid records">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></div>
        <div class="pay-stat__label">Paid</div>
      </div>
      <div class="pay-stat__val">${nPaid}</div>
      ${/* The share as a BAR as well as a figure, per the reference. Two counts
           that must add to the whole are the one case where a bar earns its
           height: "16" and "33" are only comparable after you have done the
           arithmetic, and the two bars do it for you at a glance. */''}
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">Records</span>
        <span class="pay-stat__track"><i style="width:${share(nPaid)}%"></i></span>
        <span class="pay-stat__delta">${share(nPaid)}%</span>
      </div>
    </div>

    <div class="pay-stat pay-stat--click dh-amber" onclick="paySetStatus('Pending')" title="Show only unsettled records">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
        <div class="pay-stat__label">Pending</div>
      </div>
      <div class="pay-stat__val">${nPending}</div>
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">Records</span>
        <span class="pay-stat__track"><i style="width:${share(nPending)}%"></i></span>
        <span class="pay-stat__delta">${share(nPending)}%</span>
      </div>
    </div>

    ${''/* OVERDUE IS GONE, ON THE OWNER'S CALL.

           It was a fifth card and a fifth filter derived from dueDate, and it
           overlapped Pending completely: every overdue record is also pending,
           so the two cards double-counted the same money and the row no longer
           summed to Total. A warden chasing rent wants one list of who has not
           paid; whether a date has passed is a property of a row, not a
           separate category of debt. The per-row "Overdue" mark in the table
           stays, because that IS row-level information. */}

    <div class="pay-stat dh-violet">
      <div class="pay-stat__top">
        <div class="pay-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/></svg></div>
        <div class="pay-stat__label">Unpaid Amount</div>
      </div>
      <div class="pay-stat__val" title="${escHtml(fmtPKR(outstanding))}"><span class="cur">Rs.</span>${fmtCompactK(outstanding)}</div>
      <div class="pay-stat__foot">
        <span class="pay-stat__sub">Total outstanding</span>
        ${nArrears>0?`<span class="pay-stat__delta dh-red" title="${nArrears} unpaid record${nArrears>1?'s':''} carried over from earlier months">incl. ${fmtPKR(arrearsAmt)} arrears</span>`:''}
      </div>
    </div>
  </div>

  <!-- ══ TOOLBAR ══ -->
  <div class="pay-panel">
    <div class="pay-tools">
      <div class="pay-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        ${''/* The placeholder names the receipt number because that is the one
               searchable field a warden would never guess is searchable — it
               is printed on paper, not shown in this table. */}
        <input id="search-payments" class="lk-sin" placeholder="Search student, room, receipt #…" value="${escHtml(payFilter.search)}"
          oninput="capFirstChar(this);payFilter.search=this.value;payFilter.page=1;_dPayments()">
        ${lkSearchX('search-payments','payFilter','payments')}
      </div>

      <select class="pay-select${payFilter.room!=='All'?' is-set':''}" onchange="payFilter.room=this.value;payFilter.page=1;renderPage('payments')" title="Filter by room">
        <option value="All">All Rooms</option>
        ${roomNums.map(r=>`<option value="${escHtml(r)}" ${payFilter.room===r?'selected':''}>Room ${escHtml(r)}</option>`).join('')}
      </select>

      <select class="pay-select pay-select--mo${payFilter.month!==thisMonth()?' is-set':''}" onchange="payFilter.month=this.value;payFilter.showAll=false;payFilter.page=1;renderPage('payments')" title="Filter by month">
        ${monthOpts.map(m=>`<option value="${escHtml(m)}" ${_scopeKey===m?'selected':''}>${escHtml(monthLabel(m))}</option>`).join('')}
        <option value="All" ${!_scopeKey?'selected':''}>All Months</option>
      </select>

      ${''/* THE METHOD DROPDOWN IS GONE (owner, 2026-09-09). It was the fifth
             control on a bar that has to fit one line, and the method is on
             every row already — a warden looking for "the cash ones" reads the
             column. `payFilter.method` survives in the filter object and in
             studentsFiltered's test, because the command palette still sets it
             ("show me JazzCash") and a saved value must keep working; what has
             gone is the control that crowded the heading. */}
      <select class="pay-select${payFilter.status!=='All'?' is-set':''}" onchange="payFilter.status=this.value;payFilter.page=1;renderPage('payments')" title="Filter by status">
        ${['All','Paid','Partial','Pending'].map(s=>`<option value="${s}" ${payFilter.status===s?'selected':''}>${s==='All'?'All Status':s}</option>`).join('')}
      </select>

      <div style="position:relative">
        <button class="pay-btn${activeFilters?' pay-btn--hue dh-blue':''}" onclick="payTogglePop(event)" title="More filters">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>
          Filters${activeFilters?`<span class="pay-btn__count">${activeFilters}</span>`:''}
        </button>
        <div class="pay-pop" id="pay-pop" style="display:none">
          <div class="pay-pop__t">Scope</div>
          <label class="pay-pop__row"><input type="checkbox" ${payFilter.showAll?'checked':''}
            onchange="payFilter.showAll=this.checked;payFilter.page=1;renderPage('payments')"> Include every month</label>
          <label class="pay-pop__row"><input type="checkbox" ${payFilter.arrears?'checked':''}
            onchange="payFilter.arrears=this.checked;payFilter.page=1;renderPage('payments')"
            title="Show unpaid balances from earlier months alongside this month, so they can be collected here"> Carry forward unpaid earlier months</label>
          <div class="pay-pop__t" style="margin-top:10px">Balance</div>
          <label class="pay-pop__row"><input type="checkbox" ${payFilter.unpaidOnly?'checked':''}
            onchange="payFilter.unpaidOnly=this.checked;payFilter.page=1;renderPage('payments')"> Only rows with an unpaid balance</label>
          <div class="pay-pop__sep"></div>
          <div class="pay-pop__row" onclick="payResetFilters()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
            Reset all filters
          </div>
        </div>
      </div>

      ${''/* Pushed to the right of the same strip by .pay-tools__end. The two
             verbs are SHORT (owner, 2026-09-09: "reduce its searchbar so that
             all the option align in one heading" — the search was only half the
             problem; "Auto-Generate Month" and "WhatsApp Reminders" together ran
             ~345px and pushed the strip onto a second line at the 1366 floor).
             Each button keeps its full sentence on the title, and the WhatsApp
             mark beside "Reminders" says which channel it is. */}
      <div class="pay-tools__end">
        ${tbExport({ id:'pay-export', cls:'pay-btn',
                     excel:'exportPaymentsExcel()', pdf:'exportPaymentsPDF()' })}
        <button class="pay-btn pay-btn--hue dh-blue" onclick="generateMonthlyRents()" title="Create this month's rent records for every active student">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
          Generate Month
        </button>
        <button class="pay-btn pay-btn--hue dh-green" onclick="showRentReminderModal()" title="Send WhatsApp reminders to everyone with rent outstanding">
          ${waMark(15)}
          Reminders
        </button>
      </div>
    </div>

    ${''/* THE COUNT LINE, ON ITS OWN. The four action buttons that shared this
           row have moved up into the filter row above, which is where the
           reference draws them — one control strip, then one sentence about
           what the strip is currently showing. The strip wraps to two lines
           below ~1500px rather than being split in the markup, so the layout
           degrades by itself instead of by a second structure. */}
    <!-- ══ COUNT LINE ══ -->
    <div class="pay-meta">
      <span class="pay-meta__txt">${pays.length} record${pays.length===1?'':'s'} &nbsp;·&nbsp; Total collected: <b>${fmtPKR(total)}</b></span>
    </div>

    ${paySelected.size>0?`
    <div class="pay-bulk dh-blue">
      <span class="pay-bulk__n">${paySelected.size} selected</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="pay-btn" onclick="payBulkExport()">Export selected</button>
        <button class="pay-btn pay-btn--hue dh-green" onclick="payBulkMarkPaid()">Mark ${paySelected.size} paid</button>
        <button class="pay-btn" onclick="paySelected.clear();renderPage('payments')">Clear</button>
      </div>
    </div>`:''}

    <!-- ══ TABLE ══ -->
    <div class="pay-table-wrap">
      <table class="pay-table">
        <thead><tr>
          <th style="width:36px"><input type="checkbox" ${_pg.slice.length>0&&_pg.slice.every(p=>paySelected.has(p.id))?'checked':''} onclick="payToggleAll(this.checked)" title="Select all on this page"></th>
          ${th('student','Student')}
          ${th('room','Room')}
          ${th('month','Month')}
          ${th('rent','Charge/Mo')}
          ${th('paid','Amt Paid')}
          ${th('unpaid','Unpaid')}
          ${th('method','Method')}
          ${th('status','Status')}
          <!-- Secondary money columns sit after Status: they are usually "—", so
               they sit right of the figures a warden actually scans down.
               They are ALWAYS VISIBLE. This comment used to claim they were
               "hidden until the sidebar is collapsed — see payments.css"; no such
               rule was ever written, .pay-col-x styles nothing anywhere in the
               app, and the columns were simply overflowing off the right edge
               into the horizontal pan. Hiding them is forbidden outright
               (payments spec §23, §46) — an absent Adm. Fee column and an empty
               one mean different things to whoever is reading the row. -->
          <th class="pay-col-x">Adm. Fee</th>
          <th class="pay-col-x">Extra Charges</th>
          <th class="pay-col-x">Concession</th>
          <th class="pay-col-act">Actions</th>
        </tr></thead>
        <tbody>
        ${_pg.slice.length===0?`<tr><td colspan="13"><div class="pay-empty">No payment records match these filters.</div></td></tr>`:
        _pg.slice.map(p=>{
          const st    = DB.students.find(s=>s.id===p.studentId);
          const room  = DB.rooms.find(r=>String(r.number)===String(p.roomNumber));
          const rtype = room ? DB.settings.roomTypes.find(x=>x.id===room.typeId) : null;
          const admFee = Number(p.admissionFee||p.fee||0);
          const extras = (p.extraCharges||[]).filter(c=>Number(c.amount)>0);
          const conc   = Number(p.concession||p.discount||0);
          const concD  = p.concessionDesc||p.discountDesc||'';
          const unpaid = outstandingOf(p);
          const sLabel = payStatusOf(p);
          const sHue   = payStatusHue(sLabel);
          const picked = paySelected.has(p.id);
          const arrear = isArrear(p);
          const nm     = String(p.studentName||'?');
          const ini    = nm.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
          return `<tr class="${picked?'is-picked dh-blue':''}${arrear?' is-arrear':''}">
            <td onclick="event.stopPropagation()"><input type="checkbox" ${picked?'checked':''} onclick="payToggleRow('${p.id}')"></td>
            <td>
              <div class="pay-who">
                <div class="pay-who__av ${payAvatarHue(nm)}">${escHtml(ini)}</div>
                <div style="min-width:0">
                  <div class="pay-who__name">${escHtml(nm)}</div>
                  ${/* The student was deleted but the record of their money was
                       not. Say so, or the row reads as an ordinary payment whose
                       name happens to open nothing. */''}
                  ${p.studentRemoved?`<div class="pay-who__meta" style="color:var(--amber)" title="This student was removed from the roster${p.studentRemovedOn?' on '+escHtml(fmtDate(p.studentRemovedOn)):''}. The payment stays in the books.">No longer on the roster</div>`:''}
                  ${st&&st.cnic?`<div class="pay-who__meta">CNIC: ${payMaskCnic(st.cnic)}</div>`:''}
                  ${st&&st.phone?`<div class="pay-who__meta"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92"/></svg>${escHtml(st.phone)}</div>`:''}
                </div>
              </div>
            </td>
            ${''/* THE BOXED LABEL, AS THE STUDENTS REGISTER DRAWS IT (owner,
                   2026-09-10: "label room number and floor just like the
                   students page room number globally"). This was three loose
                   lines — "#1", "1-Seater", "Ground Floor" — stacked in the
                   middle of a thirteen-column row, which does not group and
                   cost a line of row height for the word "Floor".

                   The BOX holds the number and the floor, which is what the
                   students cell holds. The room type stays under it as an
                   ordinary sub-line: it is a fact about the room's class, not
                   about where the room is, and it is also the one of the three
                   that already has a column of its own on other registers. */}
            <td>
              ${roomLabel(p.roomNumber, room && room.floor)}
              ${rtype?`<div class="pay-room__t">${escHtml(rtype.name)}</div>`:''}
            </td>
            ${/* BOTH SPELLINGS, ONE SHOWN. "September 2026" is what the
                 reference prints and it is the right label when there is room;
                 at 1366 it is the single widest cell in the row after the
                 student, and the table was overflowing by 94px. A media query
                 swaps to "Sep 2026" under 1400px — the month is still named and
                 the year is still there, which is more than truncation would
                 leave. Rendering both and hiding one keeps the decision in CSS,
                 where the width is actually known. */''}
            <td class="pay-mo">
              <span class="pay-mo__full">${escHtml(monthLabel(p.month)||'—')}</span>
              <span class="pay-mo__abbr">${escHtml(payMonthShort(p.month)||'—')}</span>
              ${arrear?'<div class="pay-arrear-tag" title="Unpaid balance carried over from an earlier month — collect it here">Arrears</div>':''}
            </td>
            ${/* CHARGE/MO — the figure, then what it covers, as a badge.
                 It read "PKR 10,000 rent + PKR 7,000 mess": the widest thing in
                 the row, restating two numbers whose total is printed directly
                 above them. chargeCoverage() is the app's existing answer to the
                 same question — Students has drawn this badge since 2026-08 — so
                 this is a shared component arriving here, not one invented for
                 the mockup.

                 It carries FOUR states where the spec named two. A hostel that
                 serves no food has never set a mess charge, which is a different
                 fact from a student taken off mess, and a flat "RENT ONLY" would
                 assert the wrong one. The breakdown moves into the title, where
                 it costs no width. */''}
            ${(()=>{const _c=paymentCharges(p, DB.students.find(x=>x.id===p.studentId));
                    const _cov=chargeCoverage(_c);
                    return `<td class="pay-money"><span title="${escHtml(payChargeTitle(_c))}">${payMoney(_c.monthly||p.amount)}</span>`
                         + `<span class="pay-cov ${_cov.hue}">${escHtml(_cov.label)}</span></td>`;})()}
            <td class="pay-money pay-money--in">${payMoney(p.amount)}</td>
            <td class="pay-money ${unpaid>0?'pay-money--due':'pay-money--nil'}">${payMoney(unpaid)}</td>
            <td>${pmBadge(p.method)}</td>
            <td>
              <span class="pay-pill ${sHue}">
                ${payStatusIcon(sLabel)}
                ${sLabel}
              </span>
              ${/* Overdue is a second, independent fact — a Partial record can be
                   overdue and a Pending one usually is — so it stays its own
                   mark rather than replacing the status. It gains the glyph and
                   the pill shape the badge sheet gives it; as bare red text it
                   was the only status on the row saying its meaning in colour
                   alone. */''}
              ${payIsOverdue(p)?`<span class="pay-pill pay-pill--od">${payStatusIcon('Overdue')}Overdue</span>`:''}
            </td>
            <td class="pay-col-x">${admFee>0?`<span class="pay-money">${payMoney(admFee)}</span>`:'<span class="pay-dash">—</span>'}</td>
            <td class="pay-col-x">${extras.length?`<div class="pay-extra">${extras.map(c=>`${c.label?escHtml(c.label)+':':''}<b>${payMoney(c.amount)}</b>`).join('')}</div>`:'<span class="pay-dash">—</span>'}</td>
            <td class="pay-col-x">${conc>0?`<div class="pay-extra">${concD?escHtml(concD)+':':''}<b>−${payMoney(conc)}</b></div>`:'<span class="pay-dash">—</span>'}</td>
            ${''/* FOUR COLOURED GLYPHS BECAME ONE LABELLED BUTTON (owner,
                   2026-09-09: "make the labelled 3dot action button for the
                   payment page actions"). The strip asked a warden to know
                   what a glyph meant, painted four hues in a row so none of
                   them signalled anything, and put Delete one pixel from
                   Reverse — the two actions on this page you least want
                   confused. The menu names each one, and Delete is separated
                   and red at the bottom. Shared with Students: lkRowMenu(). */}
            <td class="pay-col-act">
              ${lkKebab("event.stopPropagation();payRowMenu('" + p.id + "',this)", 'Actions for this payment')}
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>

    ${payPager(_pg)}
  </div>`;
}

// Footer: page-size picker, range readout and the numbered pager.
function payPager(pg) {
  const btn = (label, target, o) => {
    o = o || {};
    if (o.disabled) return `<button disabled>${label}</button>`;
    if (o.active)   return `<button class="is-on">${label}</button>`;
    return `<button onclick="gotoPage(payFilter,'payments',${target})">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1) + (lo>2?'<span class="pay-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page});
  if (hi < pages) nums += (hi<pages-1?'<span class="pay-pager__gap">…</span>':'') + btn(String(pages), pages);

  /* THE REFERENCE'S ORDER: the sentence on the left, the pager on the right,
     the page size last as a single "30 / page" control. It was "Show [30]
     entries" on the left, the sentence in the middle and the pager on the
     right — three things competing for the middle of a wide bar, with the one
     sentence a reader actually wants buried between two controls. */
  return `<div class="pay-foot">
    <div class="pay-foot__info">${pg.total?`Showing ${pg.from}\u2013${pg.to} of ${pg.total} record${pg.total===1?'':'s'}`:'No records'}</div>
    <div class="pay-pager">
      ${btn('«',1,{disabled:page<=1})}
      ${btn('‹',page-1,{disabled:page<=1})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages})}
      ${btn('»',pages,{disabled:page>=pages})}
    </div>
    <div class="pay-foot__size">
      <select onchange="payFilter.pageSize=Number(this.value);payFilter.page=1;renderPage('payments')"
              title="Rows per page" aria-label="Rows per page">
        ${[10,30,50,100].map(n=>`<option value="${n}" ${payFilter.pageSize===n?'selected':''}>${n} / page</option>`).join('')}
      </select>
    </div>
  </div>`;
}

/* ── Payments v5 — toolbar / selection behaviour ─────────────────────────── */
function paySetStatus(s) {
  payFilter.status = (payFilter.status === s) ? 'All' : s;   // click again to clear
  payFilter.page = 1;
  renderPage('payments');
}

function payResetFilters() {
  /* Back to the DEFAULT, not to nothing — and the default month is this month,
     the same as the students, cancellations and complaints registers. */
  payFilter.status='All'; payFilter.method='All'; payFilter.room='All'; payFilter.month=thisMonth();
  payFilter.search=''; payFilter.showAll=false; payFilter.unpaidOnly=false; payFilter.page=1;
  payFilter.arrears=true;   // carrying unpaid balances forward is the default, not a filter to clear
  paySelected.clear();
  renderPage('payments');
}

function payTogglePop(ev) {
  if (ev) ev.stopPropagation();
  const p = document.getElementById('pay-pop'); if (!p) return;
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', function (e) {
  const p = document.getElementById('pay-pop');
  if (p && p.style.display === 'block' && e.target.closest && !e.target.closest('#pay-pop')) p.style.display = 'none';
});

function payToggleRow(id) {
  if (paySelected.has(id)) paySelected.delete(id); else paySelected.add(id);
  renderPage('payments');
}
function payToggleAll(on) {
  paginate(payFiltered(), payFilter).slice.forEach(p => {
    if (on) paySelected.add(p.id); else paySelected.delete(p.id);
  });
  renderPage('payments');
}

// Bulk mark-paid reuses the same arithmetic as the single-row action, including
// the partialPayments installment log, so a bulk settle is indistinguishable
// from settling each row by hand.
async function payBulkMarkPaid() {
  const ids = [...paySelected];
  const targets = DB.payments.filter(p => ids.includes(p.id) && p.status !== 'Paid');
  if (!targets.length) { toast('Nothing to settle — every selected row is already paid', 'info'); return; }
  showConfirm(`Mark ${targets.length} payment${targets.length>1?'s':''} as paid?`,
    `This collects the outstanding balance on each selected row and stamps today's date.`, async () => {
      // applyPayment() again, so a bulk settle is indistinguishable from
      // settling each row by hand — including the D-1 fix: the balance comes
      // from calculateOutstanding(), not from `p.unpaid || 0`, which is 0 on a
      // legacy record and used to mark a real debtor Paid having collected
      // nothing at all.
      let collected = 0;
      targets.forEach(p => {
        const due = calculateOutstanding(p);
        if (due <= 0) { p.status = 'Paid'; p.paidDate = p.paidDate || today(); return; }
        collected += applyPayment(p, { amount: due, date: today(),
                                       note: 'Pending cleared (bulk)' }).applied;
      });
      if (collected > 0) logActivity('Payment Collected',
        `${targets.length} record(s) settled in bulk · ${fmtPKR(collected)} collected`, 'Finance');
      await saveDB();
      paySelected.clear();
      renderPage('payments');
      toast(`${targets.length} payment${targets.length>1?'s':''} marked paid`, 'success');
    });
}

/* ══ THE PAYMENTS EXPORT ═══════════════════════════════════════════════════
   One definition, two files (§60). The PDF is the document an owner files or
   sends on; the workbook is the one an accountant filters and adds up. Both
   are rendered by the global export engine from THIS object, so they cannot
   describe different records, different totals or a different month.

   `payFiltered()` again — the table, the PDF and the workbook read the same
   list in the same order, which is room ascending by default because a warden
   reads a payment sheet while walking the building.

   The money is split across columns rather than summarised into one: the
   monthly CHARGE (rent + mess, from paymentCharges — never `monthlyRent`
   alone, which cannot be reconciled against what was actually paid), what was
   collected, and what is still owed. Admission fees, extras and concessions
   are carried by the workbook, where somebody may need to reconcile them, and
   folded into the printed page's Paid column, where twelve money columns would
   force the type down to something nobody can read (§14).                    */
/* THE MONTH BEFORE THIS ROW'S MONTH, for the same student, as the sheet reads
   it: "paid / unpaid". Looked up rather than carried on the record, so it
   cannot go stale when an old month is settled later — which is exactly what
   the payments page's arrears carry-forward exists to let a warden do.

   A student with no record for that month prints "0 / 0", not a dash: nothing
   billed IS nothing owed, and a dash here would read as "not known". */
/* The heading for the previous-month column: the month before the one being
   reported, by name. `payScopeKey()` is null for an all-months export, and
   then there is nothing to name. */
function _payPrevLabel() {
  const k = (typeof payScopeKey === 'function') ? payScopeKey() : null;
  if (!k || !/^\d{4}-\d{2}$/.test(k)) return 'Earlier Months (Paid/Unpaid)';
  let [y, m] = k.split('-').map(Number);
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  const label = monthLabel(y + '-' + String(m).padStart(2, '0'));
  return (label.split(' ')[0] || 'Previous') + ' (Paid/Unpaid)';
}

/* WHAT WENT BACK OUT ON THIS RECORD. Two things in this app move money the
   other way and finance.js owns both: `p.reversals`, written by the reverse-a-
   collection flow, and `p.refund`, written when a cancellation is settled with
   money returned. Summed, never derived — a refund the layer has not recorded
   is not a refund. */
function _payRefund(p) {
  if (!p) return 0;
  const rev = Array.isArray(p.reversals)
    ? p.reversals.reduce((n, r) => n + Math.abs(Number((r && r.amount) || 0)), 0) : 0;
  return rev + Math.abs(Number(p.refund || 0));
}

/* Rent and mess as their own columns, but only where the hostel sells both.
   serviceModel() is the app's own answer, set at onboarding. */
function _paySplitColumns() {
  /* `hostelServesMess()` is the app's own answer and reads serviceModel() —
     which is 'rent' for a hostel that sells a room and nothing else. Asking it
     rather than testing the id keeps this in step if a fourth model is ever
     added. */
  if (typeof hostelServesMess === 'function' && !hostelServesMess()) return [];
  return [
    { label: 'Rent (Rs.)', type: 'money', width: 11, total: 'sum',
      value: p => Number(paymentCharges(p, DB.students.find(s => s.id === p.studentId)).rent || 0) },
    { label: 'Mess (Rs.)', type: 'money', width: 11, total: 'sum',
      value: p => { const c = paymentCharges(p, DB.students.find(s => s.id === p.studentId));
        return c.messIncluded ? Number(c.mess || 0) : 0; } },
  ];
}

function _payPrevPair(p) {
  const k = _payMonthKey(p);
  if (!k || !/^\d{4}-\d{2}$/.test(k)) return EXPORT.fmt.cash(0) + ' / ' + EXPORT.fmt.cash(0);
  let [y, m] = k.split('-').map(Number);
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  const prev = y + '-' + String(m).padStart(2, '0');
  const mine = (DB.payments || []).filter(x =>
    String(x.studentId) === String(p.studentId) && _payMatchesMonth(x, prev));
  const paid   = mine.reduce((n, x) => n + Number(x.amount || 0), 0);
  const unpaid = mine.reduce((n, x) => n + outstandingOf(x), 0);

  /* AND WHETHER IT WAS SETTLED LATE (owner, 2026-09-10: "plan for what if the
     previous [month] also paid in the current month").

     "8,000.00 / 0.00" is true of two different students: one who paid August in
     August, and one who was in arrears until the counter caught them in
     September. Those are opposite facts about the same person to anybody
     chasing money, and the pair alone cannot tell them apart.

     The DATE the cash actually arrived is what separates them, and this app
     already records it per instalment — `partialPayments[].date`, and `date` on
     a record settled in one go. Where any of that money landed in a LATER month
     than the one it settles, the cell says so. */
  const late = mine.some(x => {
    const parts = Array.isArray(x.partialPayments) && x.partialPayments.length
      ? x.partialPayments.map(q => q && q.date)
      : [x.date];
    return parts.some(d => d && String(d).slice(0, 7) > prev);
  });

  return EXPORT.fmt.cash(paid) + ' / ' + EXPORT.fmt.cash(unpaid) + (late ? ' (late)' : '');
}

/* WHAT THE SHEET'S "Remarks" COLUMN SAYS. Its own examples are "Concession 500"
   and "Extra Charge 200" — the two adjustment columns, in words, for the rows
   where they are not zero. Built from the record, never typed, so it cannot
   disagree with the figures three columns to its left. */
function _payRemark(p) {
  const out = [];

  /* WHAT THE ADJUSTMENT WAS FOR, in the space the figures do not use (owner,
     2026-09-10: "in remarks there should be fetched data for concession and
     extra charges descriptions"). The AMOUNTS are two columns of their own; the
     WORDS are what those columns cannot hold, so this carries the reason and
     not the arithmetic. Lower case, because it is a note beside a figure and
     not a heading. */
  const conc = Number(p.concession || p.discount || 0);
  if (conc > 0) {
    const why = String(p.concessionDesc || p.concessionReason || '').trim();
    out.push(why ? 'concession — ' + why : 'concession');
  }
  /* extrasOf/extrasSum are locals inside _payExportDef; this runs from a column
     callback, so it does its own filtering rather than reaching for them. */
  const ex = (p.extraCharges || []).filter(c => Number(c.amount) > 0);
  if (ex.length) {
    out.push(ex.map(c => String(c.description || c.desc || c.label || 'extra').toLowerCase())
               .join(', '));
  }

  /* THE AUTO-GENERATED NOTE, CUT DOWN (owner, 2026-09-10: "the auto generate
     fills it by auto which takes very much space: 'Auto-generated | Remaining
     PKR 8,000 collected on 2026-09-04'").

     Every one of those facts is already a column on this sheet — what was
     billed, what was paid, what is left — so the note was the row restated in
     a sentence, in the widest column, on every auto-generated record in the
     register. "Auto-generated" alone says the one thing the columns do not:
     that nobody typed this row. A note a warden actually WROTE is kept whole;
     it is only the app's own boilerplate that is trimmed. */
  const note = String(p.notes || '').trim();
  if (note) {
    if (/^auto[- ]?generated/i.test(note)) out.push('auto');
    else out.push(note);
  }
  return out.join(' · ');
}

function _payExportDef(list, opts) {
  opts = opts || {};
  const stuById   = new Map((DB.students || []).map(s => [s.id, s]));
  const charges   = p => paymentCharges(p, stuById.get(p.studentId));
  const extrasOf  = p => (p.extraCharges || []).filter(c => Number(c.amount) > 0);
  const extrasSum = p => extrasOf(p).reduce((n, c) => n + Number(c.amount || 0), 0);

  const collected = list.reduce((s, p) => s + Number(p.amount || 0), 0);
  const owing     = list.reduce((s, p) => s + outstandingOf(p), 0);
  const settled   = list.filter(p => payStatusOf(p) === 'Paid').length;
  const billed    = collected + owing;

  const _sk = payScopeKey();
  const scope = _sk ? monthLabel(_sk) : 'All months';
  /* Arrears only mean something against a month. With "All Months" on screen
     there is no month to be earlier than, and every unpaid row would otherwise
     be tagged as an arrear of itself. */
  const _exArrear = p => !!_sk && payIsArrear(p, _sk);

  return {
    module: 'Payments',
    title:  opts.title || 'Payment Register',
    scope:  opts.scope || scope,
    sheet:  'Payments',

    /* §16 — the scope is stated on the file, not left in the reader's head. A
       register of nine rows is either a quiet month or a filtered view of a
       busy one, and only the export can say which. */
    filters: [
      ['Month',     scope],
      ['Status',    payFilter.status !== 'All' ? payFilter.status : null],
      ['Room',      payFilter.room   !== 'All' ? '#' + payFilter.room : null],
      ['Method',    payFilter.method !== 'All' ? payFilter.method : null],
      ['Search',    payFilter.search || null],
      ['Only',      payFilter.unpaidOnly ? 'Records with a balance' : null],
      ['Selection', opts.selection || null],
    ],

    /* §15 — the screen's own headline figures, counted from the rows in THIS
       file. `collected` is what these records took; it is deliberately not
       calcRevenue(), which answers a different question (a month's books). */
    summary: [
      { label: 'Payments',        value: String(list.length) },
      { label: 'Settled',         value: settled + ' of ' + list.length, tone: 'pos' },
      { label: 'Collected',       value: EXPORT.fmt.money(collected), tone: 'pos' },
      { label: 'Outstanding',     value: EXPORT.fmt.money(owing), tone: owing > 0 ? 'neg' : '' },
      { label: 'Collection rate', value: billed > 0 ? Math.round(collected / billed * 100) + '%' : '—' },
    ],

    /* ========================================================================
       THE COLUMNS ARE THE OWNER'S SHEET, EXACTLY (`payments excel redesign.png`,
       2026-09-10), and the same sixteen in the PDF as in the workbook.

       Six of them used to be `pdf:false` — Rent, Mess, Concession, Admission
       fee, Extras, Receipt — so the printed register and the exported one were
       two different documents from one definition, and the printed one could
       not be reconciled: it showed a charge and an amount paid with nothing
       between them to explain the difference.

       TWO COLUMNS ARE NEW AND BOTH ARE DERIVED, not stored:

         · PREVIOUS MONTH (Paid/Unpaid) — the same student's record for the
           month before this row's month. The sheet prints it as one cell
           because that is how it is read: "0 / 17,000" is a student who owes
           last month too, and the row above it that says "17,000 / 0" is one
           who does not. It is looked up, not carried, so it cannot go stale.

         · REMARKS — the sheet's own examples are "Concession 500" and "Extra
           Charge 200", which is what the two adjustment columns say in words.
           Built from the record rather than typed, so a row with neither
           prints a dash rather than an empty cell somebody has to interpret.

       ADMISSION FEE came out. It is not on the sheet, it is a one-off charge
       at intake rather than part of a monthly bill, and it is still on the
       payment's own record and on its receipt.
       ======================================================================== */
    columns: [
      { label: '#', type: 'number', width: 5, align: 'center',
        value: (p, i) => (i == null ? '' : i + 1) },

      { label: 'Room', type: 'id', width: 8,
        value: p => String(p.roomNumber || ''),
        get:   p => p.roomNumber ? '<b>' + escHtml(String(p.roomNumber)) + '</b>' : '—' },

      { label: 'Student Name', type: 'text', width: 22,
        value: p => p.studentName || '',
        get:   p => '<b>' + escHtml(p.studentName || '') + '</b>' },

      { label: 'Month', type: 'text', width: 16, value: p => monthLabel(p.month) },

      /* Rs., NOT PKR, IN THE HEADINGS (owner brief, 2026-09-10). The value is
         still a number — the currency lives in the workbook's number format,
         which is what keeps the column summable — and the printed sheet drops
         the prefix from the cell because the heading has already said it. */
      { label: 'Charges (Rs.)', type: 'money', width: 13, total: 'sum',
        value: p => charges(p).monthly },

      /* RENT AND MESS SPLIT ONLY WHERE THERE IS A SPLIT (owner, 2026-09-10:
         "use separate columns for rent and mess only when the hostel allows
         both … for a hostel which allows only full suite or only rent, use a
         combined charges/month").

         serviceModel() is the app's own answer to what this hostel sells, set
         at onboarding: a rent-only hostel has no mess figure to print, and two
         columns of zeros beside a Charges column that already holds the whole
         number is 24 characters of sheet saying nothing. Where both are sold
         the split is exactly what the sheet is reconciled with, so it stays. */
      ..._paySplitColumns(),

      /* THE THREE LONGEST HEADINGS ON THE SHEET, SHORTENED (owner,
         2026-09-10: "extra charges and concession and admission fee column
         headings are taking very much space and also have usually no high
         amount of data"). Each is one word plus the currency now, and the
         figures under them are usually 0.00 — the column is sized by its
         heading, not by what it holds. */
      { label: 'Discount (Rs.)', type: 'money', width: 12, total: 'sum',
        value: p => Number(p.concession || p.discount || 0) },
      { label: 'Extras (Rs.)', type: 'money', width: 11, total: 'sum',
        value: p => extrasSum(p) },

      { label: 'Paid (Rs.)', type: 'money', width: 12, total: 'sum',
        value: p => Number(p.amount || 0),
        get:   p => Number(p.amount || 0) > 0
                 ? '<span class="pos">' + escHtml(EXPORT.fmt.cash(p.amount)) + '</span>'
                 : EXPORT.fmt.cash(0) },

      /* UNPAID AND ADMISSION FEE ARE BACK (owner brief, 2026-09-10, §5: "Do
         NOT … remove columns"). An earlier pass took both out because the
         owner's reference sheet does not draw them — the sheet answers what is
         still owed through Status and its own summary. The brief is the later
         word and it is explicit, and both are real figures a register is read
         for: what THIS record still owes, and the one-off charge at intake
         that is not part of a monthly bill. They keep the sheet's Rs. naming
         and sit where they read: what was paid, then what was not. */
      { label: 'Unpaid (Rs.)', type: 'money', width: 12, total: 'sum',
        value: p => outstandingOf(p),
        get:   p => outstandingOf(p) > 0
                 ? '<span class="neg">' + escHtml(EXPORT.fmt.cash(outstandingOf(p))) + '</span>'
                   + (_exArrear(p) ? '<span class="sub">arrears · ' + escHtml(monthLabel(p.month) || '—') + '</span>' : '')
                 : EXPORT.fmt.cash(0) },

      { label: 'Admission (Rs.)', type: 'money', width: 13, total: 'sum',
        value: p => Number(p.admissionFee || p.fee || 0) },

      /* REFUND, FOR WHAT THE APP ALREADY RECORDS (owner, 2026-09-10: "add
         refund column for future use"). It is not empty scaffolding: a
         cancellation settled with money going back writes `p.refund`, and
         reversals live in `p.reversals` — finance.js is the authority for
         both. Anything not refunded is 0.00, which is the truth for almost
         every row and the reason the column costs nothing to carry. */
      { label: 'Refund (Rs.)', type: 'money', width: 12, total: 'sum',
        value: p => _payRefund(p) },

      /* THE COLUMN NAMES THE MONTH (owner brief: "August (Paid/Unpaid)", not
         "Previous Month"). It can only name one when the export covers one —
         with several months on the sheet there is no single month before them,
         and the honest heading says so rather than naming the wrong August. */
      { label: _payPrevLabel(), type: 'text', width: 20,
        value: p => _payPrevPair(p) },

      { label: 'Pay Mode', type: 'text', width: 14, value: p => p.method || '' },
      { label: 'Status',       type: 'status', width: 11, value: p => payStatusOf(p) },
      { label: 'Date',         type: 'date',   width: 13, value: p => p.date || '' },
      /* THE RECEIPT NUMBER, NOT THE ROW'S INTERNAL ID. `p.receiptNo` is assigned
         by receipt.js the first time a receipt is printed and stored on the
         record, so a reprint keeps the same number. A payment nobody has
         issued a receipt for has no receipt number, and prints a dash — the id
         ("p2") is a database key and means nothing to the person holding the
         sheet. */
      { label: 'Receipt #',    type: 'id',     width: 14, value: p => String(p.receiptNo || '') },

      { label: 'Remarks', type: 'wrap', width: 22, value: p => _payRemark(p) },

      /* TWO MORE THE BRIEF SAYS NOT TO REMOVE, kept out of the PRINTED sheet
         because the owner's reference does not draw them and a sixteen-column
         page has no room for a seventeenth. A spreadsheet has all the room it
         needs, and both are things somebody sorts or filters a sheet by:

           · the extra charges spelled out, where Remarks only names them;
           · which of these balances is an old month rather than this one. */
      { label: 'Extra charges (detail)', type: 'wrap', width: 28, pdf: false,
        value: p => extrasOf(p).map(c =>
          (c.description || c.desc || c.label || 'extra') + ' ' + Number(c.amount || 0)).join('; ') },

      { label: 'Arrears from', type: 'text', width: 16, pdf: false,
        value: p => _exArrear(p) ? (monthLabel(p.month) || '') : '' },
    ],

    rows: list,
    grand: { label: 'Collected in this selection', value: fmtPKR(collected) },
    empty: 'No payment records match the selected filters.',
  };
}

/* The selection bar's export. A workbook, not a printed page: a warden ticking
   rows is picking records to work on, not records to file. */
function payBulkExport() {
  const ids  = new Set([...paySelected]);
  const list = payFiltered().filter(p => ids.has(p.id));
  if (!list.length) { toast('Nothing selected to export', 'error'); return; }
  EXPORT.excel(_payExportDef(list, {
    selection: list.length + ' selected record' + (list.length === 1 ? '' : 's'),
  }));
}

/* THE WHOLE REGISTER, FROM THE REPORTS BAR (owner, 2026-09-10) — every payment
   the app holds, newest first, not the month the payments page happens to be
   showing. The page's own Export is the scoped one. */
function exportAllPaymentsPDF() {
  const list = (DB.payments || []).slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!list.length) { toast('No payment records to export', 'error'); return; }
  EXPORT.pdf(_payExportDef(list, {
    title: 'Hostel Payment Register',
    scope: 'Complete record — all payments',
  }));
}

function exportPaymentsPDF() {
  const list = payFiltered();
  if (!list.length) { toast('No payments to export', 'error'); return; }
  EXPORT.pdf(_payExportDef(list));
}

function exportPaymentsExcel() {
  const list = payFiltered();
  if (!list.length) { toast('No payments to export', 'error'); return; }
  EXPORT.excel(_payExportDef(list));
}

/* Kept as the name older call sites still use. It no longer writes a CSV: a
   CSV cannot carry the hostel, the period, the filters, a number format or a
   print setup, which is most of what the export standard is about — and "the
   spreadsheet one" is what the button always meant. */
function exportPaymentsCSV() { exportPaymentsExcel(); }

async function generateMonthlyRents() {
  // FIX: use thisMonthLabel() — locale-safe, matches how all payment records store month strings.
  // Previously used toLocaleString('default',…) which can return different formats per device locale,
  // breaking the duplicate-guard check and generating duplicate entries on non-en-US systems.
  const mo=thisMonthLabel();
  // Everyone still living here — including a student leaving at month end, who
  // owes this month like anyone else.
  const active=DB.students.filter(isResident);
  let added=0, skipped=0;
  active.forEach(t=>{
    if(!DB.payments.some(p=>p.studentId===t.id&&_payMatchesMonth(p,thisMonth()))){
      const room=DB.rooms.find(r=>r.id===t.roomId);
      // Price comes from resolveCharges() — the student's own override, else
      // the room type's rate in Settings. Reading t.rent/t.mess straight off
      // the student made this the one screen that billed from a stale copy: a
      // rent rise in Settings reached the Add Payment form at once, while the
      // button the warden presses on the 1st for all 50 students carried on
      // raising the old figure, and a student with no pinned rent was billed 0.
      const c      = resolveCharges(t);
      const messOn = c.messOptIn;
      const mess   = c.messBilled;
      const due    = c.rent + mess;
      // A bill of nothing is not a bill. Raising one hides the real problem —
      // an unpriced room type — behind a row that reads as settled.
      if (!c.configured || due <= 0) { skipped++; return; }
      DB.payments.push({id:'p_'+uid(),collectedBy:CUR_USER?CUR_USER.name:'Auto',studentId:t.id,studentName:t.name,roomId:t.roomId,roomNumber:room?.number||'',amount:0,monthlyRent:c.rent,totalRent:c.rent,messCharge:mess,messIncluded:messOn,unpaid:due,admissionFee:0,extraCharges:[],extraTotal:0,concession:0,concessionDesc:'',discount:0,method:t.paymentMethod||'Cash',month:mo,date:today(),dueDate:'',status:'Pending',notes:'Auto-generated',paidDate:''});
      added++;
    }
  });
  await saveDB(); renderPage('payments');
  if (added) logActivity('Monthly Rents Generated', `${added} record(s) for ${mo}`
    + (skipped ? ` · ${skipped} student(s) skipped — no charge configured` : ''), 'Finance');
  toast(added>0
      ? `Generated ${added} payment records for ${mo}`
        + (skipped ? ` · ${skipped} skipped, no rent configured for their room type` : '')
      : skipped>0
        ? `Nothing generated — ${skipped} student(s) have no rent configured. Set it in Settings → Rent & Mess.`
        : 'All students already have records for this month',
    added>0 ? 'success' : skipped>0 ? 'warning' : 'info');
}
/* Settle a record's whole outstanding balance in one action.

   THE WRITE-SIDE TAIL OF D-1. This read the balance as `Number(p.unpaid) || 0`,
   which is 0 on a record written before that field existed — so pressing Mark
   Paid on a legacy debtor collected NOTHING, wrote `unpaid = 0` and stamped it
   Paid. The debt was not settled; it was deleted, and the record then dropped
   out of the arrears list, the banner and its total with no trace.

   applyPayment() reads calculateOutstanding(), which prices a record with no
   recorded balance from the charge authority. That is the entire point of there
   being one answer. */
async function markPaymentPaid(id) {
  const p = DB.payments.find(x => x.id === id); if (!p) return;
  const due = calculateOutstanding(p);
  if (due <= 0) {
    p.status = 'Paid'; p.paidDate = p.paidDate || today();
    await saveDB(); renderPage(currentPage);
    toast('Already settled — nothing left to collect on this record', 'info');
    return;
  }
  const r = applyPayment(p, { amount: due, date: today(), note: 'Pending cleared' });
  p.discount = p.discount || 0;
  const collectionNote = `Remaining ${fmtPKR(r.applied)} collected on ${today()}`;
  p.notes = p.notes ? p.notes + ' | ' + collectionNote : collectionNote;
  logActivity('Payment Collected',
    `${p.studentName||'—'} — ${p.month||'—'} · ${fmtPKR(r.applied)} balance cleared`, 'Finance');
  await saveDB();
  renderPage(currentPage);
  toast('Payment marked as paid — ' + fmtPKR(p.amount) + ' total collected', 'success');
}

// FIX Issue 3: Called from student modal — refreshes the student modal directly
// instead of calling renderPage (which fights with the modal re-open)
// Same collection as markPaymentPaid(), including the D-1 balance fix — it
// differs only in refreshing the student modal instead of the page, which
// renderPage() would fight with.
async function markPaymentPaidFromStudentView(payId, studentId) {
  const p = DB.payments.find(x => x.id === payId); if (!p) return;
  const due = calculateOutstanding(p);
  if (due <= 0) {
    p.status = 'Paid'; p.paidDate = p.paidDate || today();
    await saveDB();
    toast('Already settled — nothing left to collect on this record', 'info');
    if (!refreshStudentView(studentId)) showStudentPanel(studentId);
    return;
  }
  const r = applyPayment(p, { amount: due, date: today(), note: 'Pending cleared' });
  p.discount = p.discount || 0;
  const collectionNote = `Remaining ${fmtPKR(r.applied)} collected on ${today()}`;
  p.notes = p.notes ? p.notes + ' | ' + collectionNote : collectionNote;
  logActivity('Payment Collected',
    `${p.studentName||'—'} — ${p.month||'—'} · ${fmtPKR(r.applied)} balance cleared`, 'Finance');
  await saveDB();
  toast('Payment marked as paid — ' + fmtPKR(p.amount) + ' total collected', 'success');
  /* The slide-over is the student view now when it is open; the modal is
     still the fallback for the dashboard, reports and rooms, which open it. */
  if (!refreshStudentView(studentId)) showStudentPanel(studentId);
}
async function deletePayment(id) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  const _dp = DB.payments.find(x => x.id === id);
  showConfirm('Delete payment record?','This cannot be undone.',async ()=>{
    // Logged before the record goes. Every other money action writes to the
    // activity log; the one that destroys money was the only one that did not,
    // so a receipt could be removed from a shared warden screen with nothing
    // left to say it had ever existed.
    if (_dp) logActivity('Payment Deleted',
      `${_dp.studentName||'—'} — ${_dp.month||'—'} · ${fmtPKR(_dp.amount)} collected, ${fmtPKR(_dp.unpaid)} outstanding`, 'Finance');
    DB.payments=DB.payments.filter(x=>x.id!==id);
    await saveDB(); renderPage('payments'); toast('Payment deleted','info');
  });
}
async function deletePaymentFromStudentView(payId, studentId) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  const _dpv = DB.payments.find(x => x.id === payId);
  showConfirm('Delete this payment record?','This will remove it from the student\'s financial history permanently.',async ()=>{
    if (_dpv) logActivity('Payment Deleted',
      `${_dpv.studentName||'—'} — ${_dpv.month||'—'} · ${fmtPKR(_dpv.amount)} collected, ${fmtPKR(_dpv.unpaid)} outstanding`, 'Finance');
    DB.payments=DB.payments.filter(x=>x.id!==payId);
    await saveDB();
    toast('Payment record deleted','info');
    if (!refreshStudentView(studentId)) showStudentPanel(studentId);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// STUDENT SEARCH FOR PAYMENT MODAL
// ════════════════════════════════════════════════════════════════════════════
function filterStudentDropdown(query) {
  const results = document.getElementById('student-search-results');

  // Typing after a pick invalidates that pick — otherwise the hidden id keeps
  // pointing at a student whose name is no longer in the box. (Programmatic
  // writes in selectStudentForPayment() do not fire `input`, so this only ever
  // runs for real edits.)
  const hidden = document.getElementById('f-pstudent');
  if (hidden && hidden.value) {
    hidden.value = '';
    const info = document.getElementById('selected-student-info');
    if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  }

  if (!query.trim()) { results.style.display='none'; return; }
  const q = query.toLowerCase();
  let matches = DB.students.filter(t => {
    if (!isResident(t)) return false;   // a student on notice still owes rent
    const room = DB.rooms.find(r => r.id === t.roomId);
    return t.name?.toLowerCase().includes(q) ||
           t.id?.toLowerCase().includes(q) ||
           String(room?.number||'').includes(q) ||
           t.cnic?.includes(q) ||
           t.phone?.includes(q);
  });
  matches = studentsByRoom(matches).slice(0, 10);
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
    const nm = String(t.name||'?');
    const ini = nm.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
    return `<div class="pf-hit" onclick="selectStudentForPayment('${t.id}')">
      <div class="pf-hit__av ${payAvatarHue(nm)}">${escHtml(ini)}</div>
      <div style="flex:1;min-width:0">
        <div class="pf-hit__name">${escHtml(nm)}</div>
        ${''/* The floor rides with the number (owner, 2026-09-10) — this is the
               line a warden checks before taking money for the right person. */}
        <div class="pf-hit__sub">Room ${escHtml(room ? roomText(room) : '#?')} · ${escHtml(rtype?.name||'')} · ${escHtml(t.phone||'No phone')}</div>
      </div>
      <div class="pf-hit__rent">${(() => {
        // t.rent is the per-student override and is empty for everyone priced
        // from Settings — which is nearly everyone — so this column read
        // "PKR 0" beside students who are charged 14,500 a month. Same resolver
        // as every other screen.
        const _c = resolveCharges(t);
        return _c.configured ? fmtPKR(_c.total) : '<span style="color:var(--red)">Not set</span>';
      })()}</div>
    </div>`;
  }).join('');
  results.style.display = 'block';
  // No auto-select while typing. It used to fire as soon as one student matched
  // and the query passed 4 characters, overwriting the box mid-word with
  // "Name — Room #N" — the rest of what was being typed then landed on the end
  // ("Abid Ali — Room #2Ali"), and on deletion it rewrote the label faster than
  // backspace could remove it. submitPayment() still resolves a typed name to a
  // single matching student on submit, so nothing convenient was lost.
}

function useManualNameEntry(name) {
  document.getElementById('f-pstudent').value = '__manual__';
  document.getElementById('f-pstudent-search').value = name;
  document.getElementById('student-search-results').style.display = 'none';
  const pick = document.getElementById('ap-pick');
  if (pick) pick.style.display = 'none';
  const info = document.getElementById('selected-student-info');
  info.style.display = 'flex';
  info.innerHTML = `
    <div class="ap-idn__who">
      <div class="ap-idn__av dh-amber">&#9998;</div>
      <div style="min-width:0">
        <div class="ap-idn__n">${escHtml(name)}</div>
        <div class="ap-idn__r">Manual entry &mdash; not linked to a registered student</div>
      </div>
    </div>
    <div class="ap-idn__s"><span class="ap-idn__l">Charges</span>
      <b class="ap-idn__v is-muted">Enter below</b>
      <i class="ap-idn__x">Nothing is resolved from Settings for a manual name</i></div>
    <button type="button" class="ap-idn__chg" onclick="pfClearStudent()"
            title="Search for a registered student instead">Change</button>`;
}

function selectStudentForPayment(studentId) {
  const t = DB.students.find(x => x.id === studentId);
  if (!t) return;
  // Every screen reads the monthly charge through resolveCharges() — student →
  // room → Settings. Nothing here invents a fallback amount.
  const c     = resolveCharges(t);
  const room  = c.room;
  const rtype = c.roomType;
  const currentRent = c.rent;
  const currentMess = c.mess;
  const messOn      = c.messOptIn;
  document.getElementById('f-pstudent').value = studentId;
  document.getElementById('f-pstudent-search').value =
    t.name + ' — Room ' + (room ? roomText(room) : '#?');
  document.getElementById('student-search-results').style.display = 'none';
  // f-prent is the redesigned modal's hidden half; f-pamt is the older visible
  // Room Rent box. Fill whichever this modal has.
  const rentEl = document.getElementById('f-prent') || document.getElementById('f-pamt');
  if (rentEl) rentEl.value = currentRent;
  const messAmtEl = document.getElementById('f-pmess');
  const messOnEl  = document.getElementById('f-pmess-on');
  if (messAmtEl) messAmtEl.value = currentMess;
  if (messOnEl)  messOnEl.checked = messOn;
  if (messOnEl || messAmtEl) pfMessToggle();
  pfPaintCharge();
  pfRenderLedger(t);
  pfRenderRecent(t);
  pfRefreshMonthOptions(studentId);   // their own arrear months join the picker
  pfReloadOutstandings();
  if (document.getElementById('f-pconcession') && t.concession) {
    document.getElementById('f-pconcession').value = t.concession;
    if(t.concessionDesc && document.getElementById('f-pconcession-desc'))
      document.getElementById('f-pconcession-desc').value = t.concessionDesc;
  }
  // Last, so a record already on file for this month overrides the student's
  // standing defaults rather than the other way round.
  pfLoadMonthContext();
  recalcUnpaid();
  const info = document.getElementById('selected-student-info');
  info.style.display = 'flex';
  // The search box and the strip share one slot — see .ap-who in payments.css.
  const pick = document.getElementById('ap-pick');
  if (pick) pick.style.display = 'none';
  const _nm  = String(t.name || '?');
  const _ini = _nm.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  // Arrears here means OTHER months. The month being collected is not an arrear
  // of itself — counting it made the same balance appear twice on one screen.
  const _mNow = document.getElementById('f-pmonth')?.value || '';
  const _arr  = DB.payments
    .filter(p => p.studentId === t.id && p.status === 'Pending' && outstandingOf(p) > 0
              && _normPayMonthLabel(p.month) !== _normPayMonthLabel(_mNow))
    .reduce((s, p) => s + outstandingOf(p), 0);
  const _j = t.joinDate ? new Date(t.joinDate) : null;
  const _since = (_j && !isNaN(_j)) ? _j.toLocaleString('default', { month: 'short', year: 'numeric' }) : '—';
  const _seat  = [rtype?.name, room?.floor ? room.floor + ' floor' : ''].filter(Boolean).join(', ');
  const stat = (label, val, sub, cls) =>
    `<div class="ap-idn__s"><span class="ap-idn__l">${label}</span>
       <b class="ap-idn__v ${cls || ''}">${val}</b>${sub ? `<i class="ap-idn__x">${sub}</i>` : ''}</div>`;
  info.innerHTML = `
    <div class="ap-idn__who">
      <div class="ap-idn__av ${payAvatarHue(_nm)}">${escHtml(_ini)}</div>
      <div style="min-width:0">
        <div class="ap-idn__n">${escHtml(_nm)}</div>
        <div class="ap-idn__r">#${escHtml(t.id)} &middot; Room ${escHtml(String(room?.number || '?'))}${
          _seat ? ' &middot; ' + escHtml(_seat) : ''}</div>
      </div>
    </div>
    ${stat('Charges', c.configured ? fmtPKR(c.total) : 'Not set',
           chargesBreakdown(c), c.configured ? '' : 'is-bad')}
    ${stat('Since', escHtml(_since), '')}
    ${stat('Arrears', _arr > 0 ? fmtPKR(_arr) : '—', '', _arr > 0 ? 'is-bad' : 'is-muted')}
    <button type="button" class="ap-idn__chg" onclick="pfClearStudent()"
            title="Pick a different student">Change</button>`;
  pfRenderMonthRail();
}

/* ── SUMMARY ──────────────────────────────────────────────────────────────────
   The student's ledger at a glance: what they are charged, and what has
   actually been collected against it. Room Rent / Mess come from Settings;
   Extra, Paid and Pending are read off their payment records. */
function pfRenderLedger(t) {
  const box = document.getElementById('pf-ledger');
  if (!box) return;
  // Arrears owed for OTHER months — shown beside this payment so the warden can
  // see at a glance that there is older money outstanding.
  // The month being collected is not an arrear of itself — it was counted here,
  // so a part paid current month was announced as "outstanding from earlier
  // months" and the same balance appeared twice on one screen.
  const _lmNow = document.getElementById('f-pmonth')?.value || '';
  const arrears = t ? DB.payments
    .filter(p => p.studentId === t.id && p.status === 'Pending' && outstandingOf(p) > 0
              && _normPayMonthLabel(p.month) !== _normPayMonthLabel(_lmNow))
    .reduce((s, p) => s + outstandingOf(p), 0) : 0;

  const cell = (label, id, hue, hint) =>
    `<div class="pf-ledger__c ${hue}"><div class="pf-ledger__l"${hint?` title="${hint}"`:''}>${label}</div>
       <div class="pf-ledger__v" id="${id}">Rs. 0</div></div>`;

  box.style.display = '';
  box.innerHTML =
    `<div class="pf-ledger__t">Summary${arrears > 0
        ? ` <span style="color:var(--red);font-weight:800">· ${fmtPKR(arrears)} outstanding from earlier months</span>` : ''}</div>
     <div class="pf-ledger__row">
       ${cell('Room Rent', 'pf-sum-rent',  'dh-blue')}
       ${cell('Mess',      'pf-sum-mess',  'dh-amber')}
       ${cell('Extra',     'pf-sum-extra', 'dh-violet')}
       ${cell('Paid',      'pf-sum-paid',  'dh-green')}
       ${cell('Pending',   'pf-sum-due',   'dh-red', 'Remaining on this month after what has been paid')}
     </div>`;
  recalcUnpaid();
}

/* ── RECEIVE OUTSTANDINGS ─────────────────────────────────────────────────────
   Arrears from earlier months can be collected during any later month, but the
   money is posted back to the month it belongs to — the older record is the one
   that moves toward Paid. The current month's record is built from the Monthly
   Charge above and is not touched by anything entered here. */
function pfOutstandingRecords(studentId, excludeMonthLabel) {
  const norm = m => _normPayMonthLabel(m);
  const skip = norm(excludeMonthLabel);
  return DB.payments
    .filter(p => p.studentId === studentId && p.status === 'Pending'
      && Number(p.unpaid) > 0 && norm(p.month) !== skip)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Month labels are stored as free text ("August 2026"); compare them loosely so
// a stray case or space does not make the same month look like two.
function _normPayMonthLabel(m) {
  return String(m || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* ── MONTH PICKER ─────────────────────────────────────────────────────────────
   p.month is the key everything cross-month is matched on: the arrears panel,
   the month filter on the payments list, the dashboard. It used to be typed by
   hand, so one slip ("Augst 2026") created a month that nothing would ever line
   up with again — the arrear stayed invisible and the payment landed in a month
   that does not exist. The warden picks from a list instead.

   The list is a year back through next month, PLUS every month the student
   already has a record for. That second half matters: an arrear older than the
   window still has to be selectable or it could never be settled from here, and
   a label typed before this change is kept verbatim rather than silently
   rewritten into something the old records would no longer match.            */
const _PAY_MONTH_NAMES = ['january','february','march','april','may','june',
                          'july','august','september','october','november','december'];

function _payMonthLabelOf(d) {
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

// Sortable integer for a label. -1 for anything not in "<Month> <Year>" form,
// which keeps unrecognised labels in the list rather than dropping them.
function _payMonthOrder(label) {
  const m = _normPayMonthLabel(label).match(/^([a-z]+) (\d{4})$/);
  if (!m) return -1;
  const i = _PAY_MONTH_NAMES.indexOf(m[1]);
  return i < 0 ? -1 : Number(m[2]) * 12 + i;
}

/* Named apart from payMonthOptions() above on purpose: that one lists the months
   already IN the data to filter the payments table by, this one lists the months
   a payment may be RECORDED against — including ones with nothing behind them
   yet, which is most of the point. */
function payMonthPickerOptions(selected, studentId) {
  const now = new Date();
  const labels = [];
  for (let back = 12; back >= -1; back--) {
    labels.push(_payMonthLabelOf(new Date(now.getFullYear(), now.getMonth() - back, 1)));
  }
  if (studentId) {
    DB.payments.forEach(p => { if (p.studentId === studentId && p.month) labels.push(String(p.month)); });
  }
  if (selected) labels.push(String(selected));

  const seen = new Set(), list = [];
  labels.forEach(l => {
    const k = _normPayMonthLabel(l);
    if (k && !seen.has(k)) { seen.add(k); list.push(l); }
  });
  list.sort((a, b) => _payMonthOrder(b) - _payMonthOrder(a));   // newest first

  const sel = _normPayMonthLabel(selected);
  return list.map(l =>
    `<option value="${escHtml(l)}"${_normPayMonthLabel(l) === sel ? ' selected' : ''}>${escHtml(l)}</option>`
  ).join('');
}

/* The student's own arrear months are only known once a student is picked, so
   the page's picker is rebuilt then — keeping whatever month is already chosen. */
function pfRefreshMonthOptions(studentId) {
  const sel = document.getElementById('f-pmonth');
  if (!sel || sel.tagName !== 'SELECT') return;
  const keep = sel.value || thisMonthLabel();
  sel.innerHTML = payMonthPickerOptions(keep, studentId);
  sel.value = keep;
}

function pfReloadOutstandings() {
  const box = document.getElementById('pf-out');
  if (!box) return;
  // Line 05 stays on the worksheet whether or not there are arrears — the
  // numbering has to hold — so the panel and its empty state swap in place.
  const none = document.getElementById('pf-out-none');
  const showNone = on => { if (none) none.style.display = on ? '' : 'none'; };
  const sid = document.getElementById('f-pstudent')?.value || '';
  if (!sid || sid === '__manual__') { box.style.display = 'none'; box.innerHTML = ''; showNone(true); return; }
  const month = document.getElementById('f-pmonth')?.value || '';
  const arrears = pfOutstandingRecords(sid, month);
  if (!arrears.length) { box.style.display = 'none'; box.innerHTML = ''; showNone(true); return; }

  const total = arrears.reduce((s, p) => s + outstandingOf(p), 0);
  // One arrear is the common case and the one the owner's reference draws: the
  // row carries its own "Collect All" and the header needs no button. With
  // several months the per-row button fills that row alone, so the header gets
  // back the one that fills them all.
  const many = arrears.length > 1;
  box.style.display = '';
  showNone(false);
  box.innerHTML =
    `<div class="pf-out__h">
       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
       Receive Outstanding
       <span class="pf-out__tot">${fmtPKR(total)} owed</span>
       ${many ? `<button type="button" class="pf-out__btn" onclick="pfFillAllOutstandings()">Collect all</button>` : ''}
     </div>
     <div class="pf-out__note">From earlier months. What you enter here is posted to that month's record — not to ${escHtml(month || 'this month')}.</div>
     ${arrears.map(p => `${''/* The row must use the SAME answer as the header
        two lines above it. Both the printed figure and the input cap read
        `p.unpaid` directly, so on a record written before that field existed
        the row said "owes PKR 0" and refused to accept anything, while the
        header — which already used outstandingOf() — showed the real total.
        The panel disagreed with itself about one student's arrears. */}
       <div class="pf-out__row">
         <div class="pf-out__m">${escHtml(p.month || '—')}</div>
         <div class="pf-out__d">owes <b>${fmtPKR(calculateOutstanding(p))}</b></div>
         <input class="pf-in pf-out__in" type="number" min="0" max="${calculateOutstanding(p)}"
                id="f-pout-${p.id}" data-payid="${p.id}" data-max="${calculateOutstanding(p)}"
                placeholder="0" value="" oninput="pfOutstandingInput(this)">
         <button type="button" class="pf-out__btn" title="Collect the whole ${escHtml(p.month || 'month')} balance"
                 onclick="pfFillOutstandingRow('${p.id}')">${many ? 'Collect' : 'Collect All'}</button>
       </div>`).join('')}
     <div class="pf-out__sum" id="pf-out-sumline" style="display:none">Collecting now: <b id="pf-out-sum">Rs. 0</b></div>`;
}

/* ── THE MONTH ALREADY ON FILE ───────────────────────────────────────
   A month a student has part paid is not a blank slate, and this form opened on
   one as though it were: the Amount Paid box was empty, the summary charged the
   whole month again, and saving REPLACED the collected figure instead of adding
   to it. A student who had paid 4,000 of 10,000 and then handed over the
   remaining 6,000 ended the day still owing 4,000, with the first 4,000 gone.

   The record for the selected month is loaded when a student is picked and
   again whenever the month changes, so what it already holds — collected so
   far, admission fee, concession, extras — is on screen and is what gets
   saved back.                                                                */
function pfExistingForMonth(studentId, monthLabel) {
  if (!studentId || studentId === '__manual__') return null;
  const key = _normPayMonthLabel(monthLabel);
  if (!key) return null;
  const all = DB.payments.filter(p => p.studentId === studentId && _normPayMonthLabel(p.month) === key);
  if (!all.length) return null;
  // An open balance is what the warden is here to settle; a settled record only
  // matters when there is no open one left for that month.
  return all.find(p => p.status !== 'Paid') || all[0];
}

/* The record this form was last filled from. Changing the month has to undo a
   fill — otherwise last month's collected figure sits in the Amount Paid box
   and is written against a month nobody collected it for — but it must NOT wipe
   figures the warden typed themselves, so only a fill is ever reversed. */
let _pfFilledFrom = '';

function pfLoadMonthContext() {
  const box = document.getElementById('pf-month-state');
  if (!box) return;                          // older forms carry no banner
  const sid   = document.getElementById('f-pstudent')?.value || '';
  const month = document.getElementById('f-pmonth')?.value   || '';
  const rec   = pfExistingForMonth(sid, month);

  const paidEl = document.getElementById('f-ppaid');
  const admEl  = document.getElementById('f-padmfee');
  const concEl = document.getElementById('f-pconcession');
  const cdEl   = document.getElementById('f-pconcession-desc');
  const list   = document.getElementById('extra-charges-list');
  // What the month already holds rides on the box as data (recalcUnpaid reads
  // it); a month with no record holds nothing.
  if (paidEl) paidEl.dataset.already = '0';

  if (!rec) {
    box.style.display = 'none'; box.innerHTML = '';
    if (_pfFilledFrom) {                       // undo the previous month's fill
      _pfFilledFrom = '';
      if (paidEl) paidEl.value = '';
      if (admEl)  admEl.value  = '';
      if (concEl) concEl.value = '';
      if (cdEl)   cdEl.value   = '';
      if (list)   list.innerHTML = '';
    }
    recalcUnpaid();
    return;
  }
  _pfFilledFrom = rec.id || '';

  const already = Number(rec.amount || 0);
  const owing   = outstandingOf(rec);
  const settled = rec.status === 'Paid' || owing <= 0;

  // The record's own charges go back on the form. Without this the merge on
  // save read empty boxes and wiped the admission fee, the concession and every
  // extra line the record already carried.
  if (admEl)  admEl.value  = Number(rec.admissionFee || 0) || '';
  if (concEl) concEl.value = Number(rec.concession || rec.discount || 0) || '';
  if (cdEl)   cdEl.value   = rec.concessionDesc || '';
  if (list) {
    list.innerHTML = '';
    (rec.extraCharges || []).forEach(c => addExtraChargeRow(c.description || c.label || '', c.amount || 0));
  }
  /* THE BOX IS THE CASH RECEIVED NOW (owner, 2026-09-14), added on save to what
     the month already holds. It was seeded with the running total, and a warden
     who typed the cash in their hand replaced the collected amount with it —
     4,000 taken, 1,000 typed, 1,000 saved. What is already in rides on the box
     as data, so recalcUnpaid() shows the true balance, and is stated in the
     banner, where it can be read but not typed over. */
  if (paidEl) { paidEl.value = ''; paidEl.dataset.already = String(money(already)); }

  box.style.display = '';
  box.className = 'pf-mstate ' + (settled ? 'is-paid' : 'is-partial');
  const _ico = settled
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
  box.innerHTML = _ico + (settled
    ? `<div><b>${escHtml(month)} is already settled.</b> ${fmtPKR(already)} was collected${
        rec.paidDate ? ' on ' + escHtml(rec.paidDate) : ''}. Nothing more is owed for this month — use
       <b>Receive Outstanding</b> below to take money for an earlier month.</div>`
    : `<div><b>${escHtml(month)} is part paid.</b> ${fmtPKR(already)} collected so far,
       <b>${fmtPKR(owing)}</b> still owing.<br>Enter only the cash being handed over <b>now</b> —
       it is added to what was already collected.</div>`);
  recalcUnpaid();
}

// The month select drives both the arrears panel and the banner above it.
function pfMonthChanged() {
  pfReloadOutstandings();
  pfLoadMonthContext();
}

// Never let an arrear collection exceed what that month actually owes.
function pfOutstandingInput(el) {
  const max = Number(el.dataset.max) || 0;
  let v = parseFloat(el.value) || 0;
  if (v > max) { v = max; el.value = max; }
  pfOutstandingTotal();
}

function pfFillAllOutstandings() {
  document.querySelectorAll('.pf-out__in').forEach(el => { el.value = Number(el.dataset.max) || 0; });
  pfOutstandingTotal();
}

// Fills one month's row with everything that month still owes.
function pfFillOutstandingRow(payId) {
  const el = document.getElementById('f-pout-' + payId);
  if (!el) return;
  el.value = Number(el.dataset.max) || 0;
  pfOutstandingTotal();
}

function pfOutstandingTotal() {
  let n = 0;
  document.querySelectorAll('.pf-out__in').forEach(el => { n += parseFloat(el.value) || 0; });
  const el = document.getElementById('pf-out-sum');
  if (el) el.textContent = fmtPKR(n);
  // The running total is an answer to something the warden has typed, so it
  // stays out of the way until there is something to total.
  const line = document.getElementById('pf-out-sumline');
  if (line) line.style.display = n > 0 ? '' : 'none';
  const ws = document.getElementById('ws-a-05');
  if (ws) ws.textContent = n > 0 ? fmtNum(n) : '—';
  pfPostLine();
  recalcUnpaid();          // the stub carries line 05 under the band
  apUpdateSteps();
  return n;
}

// [{payment, amount}] for every arrear the warden entered something against.
function pfOutstandingAllocations() {
  const out = [];
  document.querySelectorAll('.pf-out__in').forEach(el => {
    const amt = parseFloat(el.value) || 0;
    if (amt <= 0) return;
    const p = DB.payments.find(x => x.id === el.dataset.payid);
    // Capped at what the month actually owes, from the one answer — `p.unpaid`
    // alone caps a legacy arrear at 0 and silently discards the collection.
    if (p) out.push({ payment: p, amount: Math.min(money(amt), calculateOutstanding(p)) });
  });
  return out;
}

/* Posts arrear collections back to the months they belong to. Returns a short
   description for the activity log.

   Through applyPayment() (§14), so an arrear collected here is written exactly
   the way one collected from the row action is: same balance, same trail entry,
   same status and paidDate rules. It used to compute its own. */
function pfApplyOutstandings(allocations, method, date) {
  const done = [];
  allocations.forEach(({ payment: p, amount }) => {
    const r = applyPayment(p, { amount, method, date, note: 'Arrears collected' });
    if (!r.ok) return;
    done.push((p.month || '—') + ' ' + fmtPKR(r.applied));
  });
  return done.join(', ');
}

// The mess charge currently on the form — 0 when the tick is off, so the total
// follows the checkbox without the resolved amount being lost.
function pfMessAmount() {
  const on = document.getElementById('f-pmess-on');
  if (on && !on.checked) return 0;
  return parseFloat(document.getElementById('f-pmess')?.value) || 0;
}

// The room rent on the form. The redesigned Add/Edit Payment modal keeps the
// two halves in hidden f-prent/f-pmess and shows only their sum; the older
// Edit Payment modal still types into a visible f-pamt. Read whichever exists.
function pfRentAmount() {
  const r = document.getElementById('f-prent');
  if (r) return parseFloat(r.value) || 0;
  return parseFloat(document.getElementById('f-pamt')?.value) || 0;
}

function pfMessToggle() {
  const on   = document.getElementById('f-pmess-on');
  const amt  = document.getElementById('f-pmess');
  const note = document.getElementById('f-pmess-note');
  const isOn = !on || on.checked;
  // Only disable a mess box the warden can actually type in (the old modal).
  if (amt && amt.type !== 'hidden') amt.disabled = !isOn;
  if (note) note.textContent = isOn ? 'Rent + mess = total monthly charge'
                                    : 'Room only — mess not charged this month';
  // The Add Payment page shows the tick as a two-button segment. Repainted
  // here, not in the click handler, so a programmatic change — a student whose
  // mess is opted out — moves it too.
  const seg = document.getElementById('f-pmess-seg');
  if (seg) seg.querySelectorAll('.ws__seg-b').forEach(b =>
    b.classList.toggle('is-on', (b.dataset.on === '1') === isOn));
  recalcUnpaid();
}

/* Repaints the Monthly Charge box. One number: the room rent, plus the mess
   when the tick is on. Both halves come from Settings via resolveCharges(), so
   ticking the box moves the figure from 8,000 to 14,500 immediately. */
function pfPaintCharge() {
  const box  = document.getElementById('f-pcharge');
  if (!box) return;                       // older modals have no charge box
  const note = document.getElementById('f-pcharge-note');
  const rent = pfRentAmount();
  const mess = pfMessAmount();
  const messConfigured = parseFloat(document.getElementById('f-pmess')?.value) || 0;
  const on   = document.getElementById('f-pmess-on');
  const isOn = !on || on.checked;

  // The worksheet shows the figure in its amount column; the box is the field.
  /* The box IS the amount column's figure on this page. `size` is what makes it
     shrink to its own digits, so the sign sits against them the way it does on
     every other line — an input left at its default width put a finger's gap
     between the "+" and the number. */
  const wsPaint = hue => {
    // ch, not the size attribute: size reserves an AVERAGE character and digits
    // are narrower than the average, which left a finger's gap between the sign
    // and the figure. With tabular-nums every digit is exactly 1ch.
    box.style.width = (String(box.value).length + 0.4) + 'ch';
    box.className = 'ws__amt ' + hue;
    const sg = document.getElementById('ws-s-01');
    if (sg) { sg.textContent = hue === 'is-plus' ? '+' : ''; sg.className = 'ws__sign ' + hue; }
  };

  if (!rent && !messConfigured) {
    box.value = '—';
    wsPaint('is-muted');
    if (note) note.textContent = 'Pick a student to load the charge';
    return;
  }
  box.value = fmtNum(rent + mess);
  wsPaint((rent + mess) ? 'is-plus' : 'is-muted');
  if (note) {
    note.textContent = isOn && messConfigured
      ? 'Mess included — ' + fmtPKR(rent) + ' rent + ' + fmtPKR(messConfigured) + ' mess'
      : messConfigured
        ? 'Rent only — mess (' + fmtPKR(messConfigured) + ') not charged this month'
        : 'Rent only — no mess charge configured';
  }
}

function recalcUnpaid() {
  const mr      = pfRentAmount();
  const mess    = pfMessAmount();
  pfPaintCharge();
  const extra   = getExtraChargesTotal();
  const admFee  = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const conc    = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const total   = pfPayableTotal();
  /* THE TYPO GUARD, AND WHY IT NO LONGER TRUNCATES AT THE BILL.

     This capped the amount at the total due, silently. It exists for a real
     case — 1600000 typed for 16000 — but it also caught the ordinary counter
     case of a student handing over a round 15,000 against a 14,500 bill: the
     form rewrote 15,000 to 14,500 and the 500 was owed to nobody, which is the
     behaviour §14 asks to have a policy for.

     Two different amounts need two different answers, so the threshold is now
     plausibility rather than exactness. Up to twice the bill is money someone
     could actually be handing over, and the excess is recorded as a credit
     (see `overpaid` on the record). Beyond that it is a keystroke, and it is
     still capped and still says so. */
  const paidEl  = document.getElementById('f-ppaid');
  let pa = money(parseFloat(paidEl?.value)||0);
  /* WHAT THE MONTH ALREADY HOLDS (owner, 2026-09-14). On the Add Payment page
     the box is the cash received NOW, and pfLoadMonthContext() puts what was
     collected before on the box as data. Everything below reasons about the two
     together — the balance, the credit, the status — so it tells the warden
     what the month will hold after this receipt. The Edit form carries no such
     data (its box is the whole collected figure, and is read-only once there is
     one), so `already` is 0 there and nothing about it changes. */
  const already = money(parseFloat(paidEl?.dataset?.already)||0);
  const remaining = Math.max(0, total - already);
  const implausible = total > 0 && already + pa > total * 2;
  const note = (text, tone) => {
    let w = document.getElementById('f-ppaid-cap-warn');
    if (!text) { if (w) w.remove(); return; }
    if (!w && paidEl) {
      w = document.createElement('div');
      w.id = 'f-ppaid-cap-warn';
      paidEl.parentNode.appendChild(w);
    }
    if (!w) return;
    w.style.cssText = 'font-size:11px;color:var(--' + tone + ');margin-top:3px;font-weight:600';
    w.textContent = text;
  };
  if (implausible) {
    pa = remaining;
    if(paidEl) { paidEl.value = remaining; paidEl.style.border = '2px solid var(--amber)'; paidEl.title = 'Capped to what is still owed: ' + remaining; }
    note('⚠️ Amount capped to what is still owed (' + Number(remaining).toLocaleString('en-PK') + ' PKR). Check for typos.', 'amber');
  } else if (already + pa > total && total > 0) {
    if(paidEl) { paidEl.style.border = ''; paidEl.title = ''; }
    note(fmtPKR(already + pa - total) + ' over the bill — recorded as a credit, refundable at checkout.', 'text2');
  } else {
    if(paidEl) { paidEl.style.border = ''; paidEl.title = ''; }
    note('');
  }
  const u = Math.max(0, total - already - pa);
  const el = document.getElementById('f-punpaid');
  if(el){ el.value=u; el.style.color=u>0?'var(--red)':u===0?'var(--green)':'var(--amber)'; }
  const st = document.getElementById('f-pstat');
  if(st) st.value = (already + pa >= total && total > 0) ? 'Paid' : 'Pending';
  const etEl = document.getElementById('extra-charges-total');
  if(etEl) etEl.textContent = 'Rs. ' + Number(extra).toLocaleString('en-PK');

  // v5 modal: keep the running-totals strip above the footer in sync. Guarded
  // so the older forms that also call recalcUnpaid() are unaffected.
  const setSum = (id, val) => { const n = document.getElementById(id); if (n) n.textContent = fmtPKR(val); };
  setSum('pf-sum-rent',  mr);
  setSum('pf-sum-mess',  mess);
  setSum('pf-sum-extra', extra);
  setSum('pf-sum-paid',  already + pa);
  setSum('pf-sum-due',   u);

  /* The Add Payment page's amount column — the same terms, one per line. A
     zero carries no sign: a column of "+ 0  − 0" on an untouched form reads as
     activity, and the eye then has to check every one of them to find it is
     nothing. Line 01 is painted by pfPaintCharge(), which owns its note too. */
  const wsLine = (n, val, dir) => {
    const sg = document.getElementById('ws-s-' + n), a = document.getElementById('ws-a-' + n);
    if (!sg || !a) return;
    const hue = !val ? 'is-muted' : dir > 0 ? 'is-plus' : 'is-minus';
    sg.textContent = !val ? '' : dir > 0 ? '+' : '\u2212';
    sg.className   = 'ws__sign ' + hue;
    a.className    = 'ws__amt ' + hue;
    a.textContent  = fmtNum(val);
  };
  const net02 = admFee - conc;
  wsLine('02', Math.abs(net02), net02);
  wsLine('03', extra,  1);
  wsLine('04', pa,    -1);
  // The Full chip is what is still owed: offering the whole bill on a part-paid
  // month would charge the money already collected a second time.
  const qf = document.getElementById('ws-q-full');
  if (qf) qf.textContent = fmtNum(remaining);
  pfPostLine();

  // The Add Payment page's right-hand summary is the same arithmetic, itemised.
  // "Paid this month" is everything the month will hold — what was already in
  // plus this receipt — so Payable − Paid = Remaining still reads down the stub.
  pfRenderSummary({
    charge: mr + mess, admFee: admFee, extra: extra,
    concession: conc, total: total, paid: already + pa, unpaid: u
  });
  apUpdateSteps();
  pefPaintSummary(total, pa, u);
}

/* ── THE EDIT FORM'S SUMMARY PANEL ───────────────────────────────────────────
   Called from the end of recalcUnpaid() with the figures it has just worked
   out, so there is exactly one place that decides what is owed on this form and
   this only paints it. No-ops on every other screen, where the nodes are absent
   — the Add Payment page has its own itemised summary (pfRenderSummary above).

   The verdict line is not decoration. "Remaining PKR 0" is read two ways by a
   tired warden at a counter: settled, or a form that has not calculated yet.
   Four states, because over-payment is a real one here — the form deliberately
   accepts up to twice the bill and records the excess as a refundable credit
   (see the typo guard above), so it must be able to say so rather than showing
   a bare zero. */
function pefPaintSummary(total, paid, unpaid) {
  const due = document.getElementById('pef-due');
  if (!due) return;                                   // not the edit form
  const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  set('pef-due',  fmtPKR(total));
  set('pef-paid', fmtPKR(paid));
  set('pef-rem',  fmtPKR(unpaid));

  const remRow = document.getElementById('pef-rem-row');
  if (remRow) remRow.className = 'pef-sum__row' + (unpaid > 0 ? ' is-due' : '');

  const over = money(paid) - money(total);
  let cls, title, sub;
  if (total <= 0)          { cls = 'is-none'; title = 'No charge set';
                             sub  = 'Enter a room rent to bill this month.'; }
  else if (over > 0)       { cls = 'is-over'; title = 'Overpaid by ' + fmtPKR(over);
                             sub  = 'Held as a credit and refundable at checkout.'; }
  else if (unpaid <= 0)    { cls = 'is-paid'; title = 'Fully Paid';
                             sub  = "This month's fee is complete."; }
  else if (money(paid) > 0){ cls = 'is-part'; title = 'Partially Paid';
                             sub  = fmtPKR(unpaid) + ' still to collect.'; }
  else                     { cls = 'is-part'; title = 'Nothing Collected';
                             sub  = fmtPKR(unpaid) + ' outstanding for this month.'; }

  const v = document.getElementById('pef-verdict');
  if (v) v.className = 'pef-verdict ' + cls;
  set('pef-verdict-t', title);
  set('pef-verdict-s', sub);
}

/* The notes field is capped at 250 (maxlength), so the count says how much room
   is left rather than letting the field simply stop accepting keystrokes. */
function pefNoteCount() {
  const ta = document.getElementById('f-pnotes'), out = document.getElementById('f-pnotes-count');
  if (ta && out) out.textContent = (ta.value || '').length + '/250';
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

let _ecrSeq = 0;
function addExtraChargeRow(descOrLabel='', amount='') {
  const list = document.getElementById('extra-charges-list');
  if(!list) return;
  // Date.now() collides when rows are added in a loop (restoring a saved
  // record adds all of them inside one millisecond), and two rows sharing an id
  // meant the remove button on the second deleted the first.
  const rowId = 'ecr_' + (++_ecrSeq);
  const div = document.createElement('div');
  div.className = 'extra-charge-row';
  div.id = rowId;
  // Layout moved to .extra-charge-row in payments.css — the row appears inside
  // two different dialogs and an inline style cannot be responsive in either.
  // Description first, then the amount (owner reference). getExtraChargesData()
  // reads both by class, not by position, so the swap is presentation only.
  div.innerHTML = `
    <input class="form-control extra-charge-desc-input" type="text" placeholder="Extra charge" value="${escHtml(descOrLabel)}" oninput="recalcUnpaid()">
    <input class="form-control extra-charge-amt-input charge-amt" type="number" placeholder="Amount" value="${amount}" min="0" oninput="recalcUnpaid()">
    <button type="button" class="rm-btn" onclick="document.getElementById('${rowId}').remove();recalcUnpaid()" title="Remove this charge" aria-label="Remove this charge">${icon('trash','sm')}</button>
  `;
  list.appendChild(div);
  recalcUnpaid();
}

function showAddPaymentForStudent(studentId) {
  // Collecting money is its own permission, separate from 'edit'.
  if (typeof requirePerm === 'function' && !requirePerm('payments')) return;
  const t = DB.students.find(s => s.id === studentId);
  if (!t) return;
  const c = resolveCharges(t);
  const room = c.room;
  const pmOpts = pmOptions(t.paymentMethod);
  showModal('modal-md', `💳 Add Payment — ${escHtml(t.name)}`, `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;border-radius:9px;background:rgba(46,201,138,0.12);display:flex;align-items:center;justify-content:center;font-size:18px">${icon('student','sm')}</div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${escHtml(t.name)}</div>
        <div style="font-size:11px;color:var(--text3)">Room ${room ? escHtml(roomText(room)) : '—'} · ${room ? escHtml(getRoomType(room).name) : '—'} · ${escHtml(t.phone || '—')}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:13px;font-weight:800;color:${c.configured?'var(--green)':'var(--red)'}">${c.configured?fmtPKR(c.total):'Not configured'}</div>
        <div style="font-size:10px;color:var(--text3)">Monthly Charge</div>
      </div>
    </div>
    <input type="hidden" id="f-ps-studentId" value="${t.id}">
    <div class="form-grid">
      <div class="field"><label>Room Rent (PKR) *</label><input class="form-control" id="f-ps-amt" type="number" value="${c.rent||''}" placeholder="Set in Settings → Rent &amp; Mess" oninput="recalcUnpaidPS()"></div>
      <!-- MESS — the food half of the monthly charge. This screen used to omit
           it entirely, so the same student was billed a different amount here
           than in the main Add Payment modal. -->
      ${!c.hostelMess ? '' : `
      <div class="field"><label>Mess Charges (PKR)</label>
        <input class="form-control" id="f-ps-mess" type="number" min="0" value="${c.mess||''}" placeholder="0" ${c.messOptIn?'':'disabled'} oninput="recalcUnpaidPS()">
        ${!c.messOptional ? `<div class="mess-fixed">Included for every student</div>` : `
        <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--text2);font-weight:600;cursor:pointer" title="Untick for a student who takes the room but not the mess">
          <input type="checkbox" id="f-ps-mess-on" ${c.messOptIn?'checked':''} onchange="psMessToggle()">
          <span id="f-ps-mess-note">${c.messOptIn?'Rent + mess = total monthly charge':'Room only — mess not charged'}</span>
        </label>`}
      </div>`}
      <div class="field"><label>Admission Fee (PKR)</label><input class="form-control" id="f-ps-admfee" type="number" placeholder="0" min="0" value="0" oninput="recalcUnpaidPS()"></div>
      <div class="field"><label>Amount Received Now (PKR)</label><input class="form-control" id="f-ps-paid" type="number" placeholder="Cash received now" value="" oninput="recalcUnpaidPS()"></div>
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
            <span id="extra-charges-total" style="font-weight:800;color:var(--amber)">Rs. 0</span>
          </div>
        </div>
      </div>
      <div class="field"><label>Unpaid / Remaining (PKR)</label><input class="form-control" id="f-ps-unpaid" type="number" value="${c.total}" readonly style="color:var(--red);font-weight:700;background:var(--bg3)" title="Auto-calculated: Room Rent + Mess + Admission Fee + Extra − Concession − Paid"></div>
      <div class="field"><label>Payment Method</label><select class="form-control" id="f-ps-method">${pmOpts}</select></div>
      <div class="field"><label>Month</label><select class="form-control" id="f-ps-month">${payMonthPickerOptions(thisMonthLabel(), t.id)}</select></div>
      <div class="field"><label>Status</label>
        <select class="form-control" id="f-ps-stat">
          <option value="Paid">✓ Paid</option>
          <option value="Pending" selected>⏳ Unpaid / Pending</option>
        </select>
      </div>
      <div class="field"><label>Payment Date</label><input class="form-control cdp-trigger" id="f-ps-date" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field"><label>Due Date</label><input class="form-control cdp-trigger" id="f-ps-due" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${(()=>{const d=new Date();d.setDate(6);return ymd(d);})()}"></div>
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
    // Always use the CURRENT resolved charge, not the amount frozen into the
    // pending record — that one may predate a fee change in Settings.
    const currentRentPS = c.rent || existingPending.monthlyRent || 0;
    const messEl  = document.getElementById('f-ps-mess');
    const messOnEl= document.getElementById('f-ps-mess-on');
    if (rentEl)   rentEl.value   = currentRentPS;
    if (messEl)   messEl.value   = c.mess || 0;
    if (messOnEl) messOnEl.checked = c.messOptIn;
    /* The box is the cash received NOW (owner, 2026-09-14) — see the merge in
       submitPaymentForStudent(). It used to be seeded with what was already
       collected, and a warden typing the cash in their hand replaced that
       figure. What is already in rides on the box as data for the balance, and
       is stated beside it, where it can be read but not typed over. */
    const alreadyPS = money(existingPending.amount);
    if (paidEl)   { paidEl.value = ''; paidEl.dataset.already = String(alreadyPS); }
    if (unpaidEl) unpaidEl.value = outstandingOf(existingPending);
    if (statEl)   statEl.value   = existingPending.status;
    if (notesEl)  notesEl.value  = existingPending.notes || '';
    if (paidEl && alreadyPS > 0 && !document.getElementById('f-ps-already')) {
      const hint = document.createElement('div');
      hint.id = 'f-ps-already';
      hint.style.cssText = 'font-size:11px;color:var(--text2);margin-top:4px;font-weight:600';
      hint.textContent = fmtPKR(alreadyPS) + ' already collected — enter only the cash received now.';
      paidEl.parentNode.appendChild(hint);
    }
    psMessToggle();
    toast('Loaded existing pending payment data', 'info');
  }
}
// The mess charge currently on this form — 0 when the tick is off, so the total
// follows the checkbox without the typed amount being lost. Mirrors pfMessAmount().
function psMessAmount() {
  const on = document.getElementById('f-ps-mess-on');
  if (on && !on.checked) return 0;
  return parseFloat(document.getElementById('f-ps-mess')?.value) || 0;
}

function psMessToggle() {
  const on   = document.getElementById('f-ps-mess-on');
  const amt  = document.getElementById('f-ps-mess');
  const note = document.getElementById('f-ps-mess-note');
  const isOn = !on || on.checked;
  if (amt)  amt.disabled = !isOn;
  if (note) note.textContent = isOn ? 'Rent + mess = total monthly charge'
                                    : 'Room only — mess not charged';
  recalcUnpaidPS();
}

function recalcUnpaidPS() {
  const rent  = parseFloat(document.getElementById('f-ps-amt')?.value) || 0;
  const mess  = psMessAmount();
  const admFee = parseFloat(document.getElementById('f-ps-admfee')?.value) || 0;
  // Received now plus what the month already holds — the balance after this receipt.
  const paidEl = document.getElementById('f-ps-paid');
  const paid  = (parseFloat(paidEl?.value) || 0) + (parseFloat(paidEl?.dataset?.already) || 0);
  const conc  = parseFloat(document.getElementById('f-ps-concession')?.value) || 0;
  var extra = 0;
  document.querySelectorAll('#extra-charges-list .extra-charge-amt-input').forEach(function(el){ extra += parseFloat(el.value)||0; });
  var etEl = document.getElementById('extra-charges-total');
  if(etEl) etEl.textContent = 'Rs. ' + extra.toLocaleString('en-PK');
  const unpaid = Math.max(0, calculateBill({
    rent, messCharge: mess, messIncluded: true,   // psMessAmount() returns 0 when off
    extraTotal: extra, admissionFee: admFee, concession: conc,
  }) - money(paid));
  const unpaidEl = document.getElementById('f-ps-unpaid');
  if(unpaidEl) { unpaidEl.value = unpaid; unpaidEl.style.color = unpaid > 0 ? 'var(--red)' : 'var(--green)'; }
}
async function submitPaymentForStudent() {
  if (typeof requirePerm === 'function' && !requirePerm('payments')) return;
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
    const existingUnpaid  = outstandingOf(alreadyPending);
    /* READ THE FORM BEFORE ASKING (2026-09-14). showConfirm() opens its dialog
       with showModal(), which REPLACES this modal, and its Confirm button closes
       the modal before calling back — so every field the callback read came
       back empty. Confirming used to set the month's collected amount to 0 and
       strip the mess, extras, admission fee and concession off the record. */
    const psForm = {
      rent:       parseFloat(document.getElementById('f-ps-amt')?.value) || 0,
      received:   money(parseFloat(document.getElementById('f-ps-paid')?.value) || 0),
      messOn:     document.getElementById('f-ps-mess-on')?.checked !== false,
      mess:       psMessAmount(),
      admFee:     parseFloat(document.getElementById('f-ps-admfee')?.value) || 0,
      concession: parseFloat(document.getElementById('f-ps-concession')?.value) || 0,
      concDesc:   (document.getElementById('f-ps-concession-desc')?.value || '').trim(),
      extras:     getExtraChargesData(),
      method:     document.getElementById('f-ps-method')?.value || '',
      date:       document.getElementById('f-ps-date')?.value   || '',
      notes:      document.getElementById('f-ps-notes')?.value  || '',
    };
    showConfirm(
      '⚠️ Pending Record Already Exists',
      `${escHtml(t.name)} already has a <strong>Pending</strong> payment for <strong>${escHtml(enteredMonth)}</strong>.<br>`
      + `<div style="margin:10px 0;background:var(--bg3);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.8">`
      + `Existing → Paid: <strong>${fmtPKR(existingPaidAmt)}</strong> &nbsp;|&nbsp; Unpaid: <strong style="color:var(--red)">${fmtPKR(existingUnpaid)}</strong></div>`
      + `<strong>Update the existing record</strong> instead of creating a duplicate?<br><small style="color:var(--text3)">Click <em>OK</em> to update · <em>Cancel</em> to abort</small>`,
      async function() {
        // ── UPDATE existing pending record in-place ──────────────────
        const newMonthlyRent = psForm.rent || alreadyPending.monthlyRent || 0;
        /* RECEIVED NOW (owner, 2026-09-14) — the same rule as the Add Payment
           page. The box is the cash in the warden's hand, added to what the month
           already holds. It was the running total, seeded with what had been
           collected, so typing the cash in hand replaced the collected amount.
           Today's cash goes through applyPayment() and becomes its own
           instalment and its own ledger entry under the account that took it. */
        const received       = psForm.received;
        if (received < 0) {
          toast('Enter the amount received — it cannot be negative', 'error');
          window._updatePendingPS = false;
          return;
        }
        /* THE BUG. This computed `newMonthlyRent - newPaid` and dropped the mess
           charge, the extras, the admission fee and the concession outright — so
           at a bundled hostel, merging a payment into an existing pending record
           understated the balance by the whole mess charge, while creating a
           fresh record from the identical form got it right. One expression now:
           calculateBill() in finance.js, over the record once its bill is set. */
        // All read off psForm, captured before the confirm replaced this modal.
        const newMessOn      = psForm.messOn;
        const newMess        = psForm.mess;
        const newAdmFee      = psForm.admFee;
        const newConcession  = psForm.concession;
        const newConcDesc    = psForm.concDesc;
        const newExtras      = psForm.extras;
        const newExtraTotal  = newExtras.reduce((s, c) => s + c.amount, 0);
        const newMethod      = psForm.method || alreadyPending.method || 'Cash';
        const newDate        = psForm.date   || today();
        const newNotes       = psForm.notes;

        // A bill changed on the way through is recorded, like one changed on the Edit form.
        ledgerAdjust(alreadyPending, ledgerChargeFacts(alreadyPending),
          ledgerChargeFacts({ monthlyRent: newMonthlyRent, messCharge: newMess, messIncluded: newMessOn,
                              extraTotal: newExtraTotal, admissionFee: newAdmFee, concession: newConcession }),
          'Changed while adding a payment', 'merge');

        // The bill first, and the balance it leaves on what was already collected…
        alreadyPending.monthlyRent  = newMonthlyRent;
        alreadyPending.totalRent    = newMonthlyRent;
        alreadyPending.messCharge   = newMess;
        alreadyPending.messIncluded = newMessOn;
        alreadyPending.extraCharges = newExtras;
        alreadyPending.extraTotal   = newExtraTotal;
        alreadyPending.admissionFee = newAdmFee;
        alreadyPending.concession   = newConcession;
        alreadyPending.concessionDesc = newConcDesc;
        alreadyPending.discount     = newConcession;
        const billNowPS         = calculateBill(alreadyPending);
        const collectedBeforePS = money(alreadyPending.amount);
        alreadyPending.unpaid   = Math.max(0, billNowPS - collectedBeforePS);
        alreadyPending.overpaid = Math.max(0, collectedBeforePS - billNowPS);   // §14
        alreadyPending.status   = alreadyPending.unpaid > 0 ? 'Pending' : 'Paid';
        alreadyPending.date     = newDate;
        // …then today's cash, through the one collection path.
        if (received > 0) {
          applyPayment(alreadyPending, { amount: received, method: newMethod, date: newDate, note: 'Instalment' });
          alreadyPending.collectedBy = CUR_USER?.name || alreadyPending.collectedBy || '';
        }
        alreadyPending.method   = newMethod;
        alreadyPending.paidDate = alreadyPending.status === 'Paid' ? (alreadyPending.paidDate || newDate) : '';
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
  const messIncludedPS = document.getElementById('f-ps-mess-on')?.checked !== false;
  const messChargePS   = psMessAmount();
  const admissionFeePS = parseFloat(document.getElementById('f-ps-admfee')?.value) || 0;
  const paidAmount  = parseFloat(document.getElementById('f-ps-paid')?.value) || 0;
  const concessionPS = parseFloat(document.getElementById('f-ps-concession')?.value) || 0;
  const concessionDescPS = (document.getElementById('f-ps-concession-desc')?.value || '').trim();
  const extraChargesPS = getExtraChargesData();
  const extraTotalPS   = extraChargesPS.reduce((s,c)=>s+c.amount,0);
  const totalDuePS  = calculateBill({
    rent: monthlyRent, messCharge: messChargePS, messIncluded: true,
    extraTotal: extraTotalPS, admissionFee: admissionFeePS, concession: concessionPS,
  });
  const unpaid      = Math.max(0, totalDuePS - money(paidAmount));
  const status      = document.getElementById('f-ps-stat')?.value || 'Pending';
  // Collecting a payment does NOT change what the student is charged. Price is
  // set in Settings → Rent & Mess; this form only records what was taken. It
  // used to write the typed amount back into t.rent, which let a one-off
  // adjustment here silently become the student's standing rent.
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
    // §14 overpayment: money handed over above the bill is recorded, not
    // swallowed by the Math.max that computes `unpaid`. Written even when 0, so
    // calculateRefund() answers from the record instead of deriving.
    overpaid: Math.max(0, money(paidAmount) - totalDuePS),
    messCharge: messChargePS, messIncluded: messIncludedPS,
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
/* ═══ ADD / EDIT PAYMENT — PAGE ══════════════════════════════════════════════
   Was a modal. It is a page now because it carries three things a dialog has no
   room for: the form, a live Payment Summary, and the student's recent history.

   Everything money-related still resolves through resolveCharges(), so the
   Monthly Charge shown here is the rate configured in Settings → Rent & Mess —
   never a stale copy off the student or the room.                            */

// Preselects a student when the page opens (set by openAddPayment).
let _apPreselect = '';
// And, optionally, the month — the Edit form's "Receive payment" opens the
// page on the record it came from, not on whichever month happens to be now.
let _apPreselectMonth = '';

function openAddPayment(studentId, month) {
  _apPreselect = studentId || '';
  _apPreselectMonth = month || '';
  navigate('addpayment');
}

/* Who is filling this in. The task header states it because a payment record
   is attributable — logActivity() records it after the fact, and this is the
   same fact before the fact. Falls back to a dash rather than to a name. */
function _apEnteredBy() {
  return (typeof CUR_USER === 'object' && CUR_USER
          && (CUR_USER.name || CUR_USER.username)) || '—';
}

function renderAddPayment() {
  // Add Payment is a PAGE, so navigate() reaches it without the button.
  if (typeof requirePerm === 'function' && !requirePerm('payments')) return;
  const pmOpts = pmOptions();
  const dueDefault = (() => { const d = new Date(); d.setDate(6); return ymd(d); })();

  // Line 01's only control. A hostel that bills mess with the rent, or does not
  // serve it at all, has nothing to switch — the cell then carries the note
  // instead of a dead segmented control.
  const messSeg = (!hostelServesMess() || !messIsOptional())
    ? `<div class="ws__muted">Set in Settings &rarr; Rent &amp; Mess</div>`
    : `<input type="checkbox" id="f-pmess-on" class="ws__hid" checked onchange="pfMessToggle()">
       <div class="ws__seg" id="f-pmess-seg">
         <button type="button" class="ws__seg-b is-on" data-on="1" onclick="pfMessSet(true)">Rent + mess</button>
         <button type="button" class="ws__seg-b" data-on="0" onclick="pfMessSet(false)">Rent only</button>
       </div>`;

  // Fill the form once the markup is in the DOM. renderPage() assigns
  // innerHTML inside a setTimeout, so defer past it.
  setTimeout(function () {
    recalcUnpaid();
    pfRenderMonthRail();
    const mon = _apPreselectMonth; _apPreselectMonth = '';
    if (_apPreselect) {
      const sid = _apPreselect; _apPreselect = '';
      if (DB.students.some(s => s.id === sid)) {
        selectStudentForPayment(sid);
        // After the student: their own months join the picker inside that call,
        // and pfMonthChanged() reloads the banner and the already-collected
        // figure for the month the warden came from.
        const sel = document.getElementById('f-pmonth');
        if (mon && sel && [...sel.options].some(o => o.value === mon)) {
          sel.value = mon;
          pfMonthChanged();
        }
      }
    }
  }, 60);

  return `
  <!-- ══ TASK HEADER ══
       The global header is hidden on this page (body.chrome-task, set by
       navigate() from pageConfig.addpayment.chrome). What stood here before —
       a breadcrumb line plus a 22px "Payment worksheet" heading — is folded
       into the 50px bar, because the bar already says Payments / New Entry and
       saying it twice cost 46px of a 768px laptop screen. -->
  <header class="tsk-head">
    <div class="tsk-head__l">
      <button type="button" class="tsk-back" title="Back to Payments" aria-label="Back to Payments"
              onclick="navigate('payments')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <nav class="tsk-crumb" aria-label="Breadcrumb">
        <a href="#" onclick="event.preventDefault();navigate('payments')">Payments</a>
        <span class="sep">/</span>
        <b aria-current="page">New Entry</b>
      </nav>
    </div>
    <div class="tsk-head__r">
      <!-- The mockup shows "RC-2026-0418 · Draft · Warden desk" here. The
           receipt number is NOT reproduced: _assignReceiptNo() in receipt.js
           only issues one when a receipt is printed, and it increments a
           shared counter — so any number shown before posting is a guess that
           another print would invalidate. That is an invented number on a
           screen, which is the one thing the house rule forbids outright.

           What stands here instead are two facts the app can prove: who is
           signed in, and that nothing has been written yet. -->
      <span class="tsk-chip">${escHtml(_apEnteredBy())}</span>
      <span class="tsk-chip tsk-chip--state">Draft &middot; not yet posted</span>
    </div>
  </header>

  <div class="tsk-body">
  <div class="ap-wrap" id="ap-wrap">
    <div class="ap-cols">
      <!-- ══════════ LEFT: WHO, THEN THE SIX LINES ══════════ -->
      <div class="ap-main">

        <!-- WHO. The search box and the identity strip occupy the same slot:
             one is the question, the other is its answer, and showing both at
             once left a stale search string sitting above the student it had
             already found. -->
        <div class="ap-who">
          <div class="ap-who__pick" id="ap-pick">
            <div class="pf-wrapin">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
              <input class="pf-in" id="f-pstudent-search" placeholder="Search a student by name, room, ID or phone"
                     oninput="filterStudentDropdown(this.value)" autocomplete="off">
              <svg class="pf-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
            <div class="pf-results" id="student-search-results"></div>
          </div>
          <!-- The pick itself. Outside .ap-who__pick on purpose: the search box
               is hidden once a student is chosen, and the id has to stay
               readable to submitAddPayment() either way. -->
          <input type="hidden" id="f-pstudent" value="">
          <!-- selectStudentForPayment() and useManualNameEntry() both write
               straight into this element, so it has to exist on the page. -->
          <div class="ap-idn" id="selected-student-info" style="display:none"></div>
        </div>

        <!-- ══ THE WORKSHEET ══
             Six numbered lines, each one a term of the same equation: what is
             charged, what is deducted, what was handed over. The amount column
             reads top to bottom and lands on the figure in the stub beside it,
             so the arithmetic is checkable by eye without leaving the form. -->
        <div class="ws">
          <div class="ws__head">
            <span>#</span><span>Particulars</span><span>Details</span><span class="ws__ha">Amount (PKR)</span>
          </div>

          <!-- What the selected month already holds. Stays hidden until there
               is a record behind it. -->
          <div class="pf-mstate" id="pf-month-state" style="display:none"></div>

          <!-- 01 — MONTHLY CHARGE. One derived figure; the segment is the only
               control, and both halves come from Settings. -->
          <div class="ws__row">
            <div class="ws__n">01</div>
            <div class="ws__p">
              <b>Monthly charge<span class="req">*</span></b>
              <i id="f-pcharge-note">Pick a student to load the charge</i>
            </div>
            <div class="ws__d">${messSeg}</div>
            <div class="ws__a" title="Room rent, plus mess when included. Set in Settings &rarr; Rent &amp; Mess.">
              <span class="ws__sign" id="ws-s-01"></span>
              <input class="ws__amt is-muted" id="f-pcharge" type="text" readonly value="&mdash;" size="2">
              <input type="hidden" id="f-prent" value="">
              <input type="hidden" id="f-pmess" value="">
            </div>
          </div>

          <!-- 02 — ADMISSION FEE & CONCESSION. One line because they are one
               net figure: a fee added to, and a discount taken off, the same
               month. -->
          <div class="ws__row">
            <div class="ws__n">02</div>
            <div class="ws__p">
              <b>Admission fee &amp; concession</b>
              <i>Fee is charged once; the concession comes off this month</i>
            </div>
            <div class="ws__d">
              <div class="ws__minis">
                <label class="ws__mini"><span>Adm</span>
                  <input class="pf-in" id="f-padmfee" type="number" placeholder="0" min="0" value="" oninput="recalcUnpaid()"></label>
                <label class="ws__mini"><span>Conc</span>
                  <input class="pf-in" id="f-pconcession" type="number" placeholder="0" min="0" value="" oninput="recalcUnpaid()"></label>
              </div>
              <input class="pf-in ws__wide" id="f-pconcession-desc" placeholder="Reason for the concession (optional)">
            </div>
            <div class="ws__a">
              <span class="ws__sign" id="ws-s-02"></span>
              <span class="ws__amt is-muted" id="ws-a-02">0</span>
            </div>
          </div>

          <!-- 03 — EXTRA CHARGES. Rows are built by addExtraChargeRow(), which
               the payment modals share; only the styling here is page-scoped. -->
          <div class="ws__row">
            <div class="ws__n">03</div>
            <div class="ws__p">
              <b>Extra charges</b>
              <i>Laundry, cooler, fines &mdash; anything billed on top</i>
            </div>
            <div class="ws__d">
              <div id="extra-charges-list"></div>
              <button type="button" class="ws__add" onclick="addExtraChargeRow()">+ Add charge</button>
              <!-- recalcUnpaid() writes the total here for the modals; on this
                   page the amount column is the one that shows it. -->
              <span class="ws__hid" id="extra-charges-total">Rs. 0</span>
            </div>
            <div class="ws__a">
              <span class="ws__sign" id="ws-s-03"></span>
              <span class="ws__amt is-muted" id="ws-a-03">0</span>
            </div>
          </div>

          <!-- 04 — AMOUNT RECEIVED NOW (owner, 2026-09-14). The cash in the
               warden's hand, added on save to whatever the month already holds;
               pfLoadMonthContext() puts that figure on the box as data and in
               the banner, never in the box itself. -->
          <div class="ws__row">
            <div class="ws__n">04</div>
            <div class="ws__p">
              <b>Amount received now<span class="req">*</span></b>
              <i>Added to anything already collected for this month</i>
            </div>
            <div class="ws__d">
              <label class="ws__mini ws__mini--wide"><span>Rs.</span>
                <input class="pf-in" id="f-ppaid" type="number" placeholder="Cash received now" value="" oninput="recalcUnpaid()"></label>
              <div class="ws__chips">
                <button type="button" class="ws__chip" onclick="pfPayQuick('full')">Full <b id="ws-q-full">0</b></button>
                <button type="button" class="ws__chip" onclick="pfPayQuick('half')">Half</button>
                <button type="button" class="ws__chip" onclick="pfPayQuick('rent')">Rent only</button>
              </div>
              <input type="hidden" id="f-punpaid" value="0">
            </div>
            <div class="ws__a">
              <span class="ws__sign" id="ws-s-04"></span>
              <span class="ws__amt is-muted" id="ws-a-04">0</span>
            </div>
          </div>

          <!-- 05 — ARREARS. Its own line because it is its own posting: the
               money goes to the month it belongs to, never to this one. -->
          <div class="ws__row">
            <div class="ws__n">05</div>
            <div class="ws__p">
              <b>Arrears collected</b>
              <i>Posted to the month it belongs to, not to this one</i>
            </div>
            <div class="ws__d">
              <div class="ws__none" id="pf-out-none">Nothing outstanding from earlier months</div>
              <div class="pf-out" id="pf-out" style="display:none"></div>
            </div>
            <div class="ws__a"><span class="ws__amt is-muted" id="ws-a-05">&mdash;</span></div>
          </div>

          <!-- 06 — METHOD, DATES & NOTE. No amount of its own: it says how the
               money on lines 01-05 arrived, so it spans the amount column. -->
          <div class="ws__row">
            <div class="ws__n">06</div>
            <div class="ws__p">
              <b>Method, dates &amp; note</b>
              <i>Status follows the figures &mdash; <span id="f-pnotes-count">0/250</span> characters</i>
            </div>
            <div class="ws__d ws__d--span">
              <div class="ws__fields">
                <div class="pf-f"><label for="f-pmethod">Pay mode<span class="req">*</span></label>
                  <select class="pf-sel" id="f-pmethod">${pmOpts}</select></div>
                <div class="pf-f"><label for="f-pdate">Paid on<span class="req">*</span></label>
                  <input class="pf-in cdp-trigger" id="f-pdate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
                <div class="pf-f"><label for="f-pdue">Due on</label>
                  <input class="pf-in cdp-trigger" id="f-pdue" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${dueDefault}"></div>
                <div class="pf-f"><label for="f-pstat">Status <span class="opt">/ auto</span></label>
                  <select class="pf-sel" id="f-pstat">
                    <option value="Paid">Paid</option>
                    <option value="Pending" selected>Pending</option>
                  </select></div>
              </div>
              <textarea class="pf-ta" id="f-pnotes-main" maxlength="250"
                        placeholder="Note for the receipt &mdash; who handed the money over, what was promised&hellip;"
                        oninput="pfCount()"></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- ══════════ RIGHT: THE MONTH, THE STUB, THE LEDGER ══════════ -->
      <aside class="ap-side" id="ap-side">

        <!-- The month this worksheet posts to. The select is the real field —
             pfRefreshMonthOptions() rebuilds it and submitAddPayment() reads it —
             so the arrows and the chips only ever move its value, and no chip
             can name a month the select would not accept. -->
        <div class="ap-mrail">
          <div class="ap-mrail__top">
            <span class="ap-mrail__ico">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></svg>
            </span>
            <select class="ap-mrail__sel" id="f-pmonth" onchange="pfMonthChanged()">${payMonthPickerOptions(thisMonthLabel(), '')}</select>
            <button type="button" class="ap-mrail__nav" title="Earlier month" onclick="pfMonthStep(-1)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button type="button" class="ap-mrail__nav" title="Later month" onclick="pfMonthStep(1)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
          <div class="ap-chips" id="ap-chips"></div>
          <div class="ap-key">
            <span class="ap-key__i"><i class="is-charged"></i>Charged</span>
            <span class="ap-key__i"><i class="is-settled"></i>Settled</span>
            <span class="ap-key__i"><i class="is-now"></i>This month</span>
          </div>
        </div>

        <div class="ap-card">
          <div class="ap-card__h">
            Receipt stub
            <span class="ap-live" title="Follows the worksheet as you type">Live</span>
          </div>
          <div id="ap-summary"></div>
        </div>

        <div class="ap-card">
          <div class="ap-card__h">
            Ledger
            <button class="ap-card__lnk" onclick="navigate('payments')">View all</button>
          </div>
          <div class="ap-led__head"><span>Month</span><span>Method</span><span>Paid</span></div>
          <div id="ap-recent"><div class="ap-empty">Pick a student to see their history</div></div>
        </div>
      </aside>
    </div>

  </div>
  </div><!-- /.tsk-body -->

  <!-- ══ STICKY ACTION BAR ══
       It follows the form down. The worksheet is taller than a 768px laptop
       once a student is picked, so an in-flow footer meant scrolling to the
       bottom to find out you could not save yet — and the caption below is the
       ONLY place that says lines 01-04 and line 05 land on two different
       months, which is exactly the thing to read before pressing Post. -->
  <footer class="tsk-foot">
      <div class="tsk-foot__note" id="ap-postline"></div>
      <div class="tsk-foot__acts">
      <button class="pf-btn" onclick="navigate('payments')">Cancel</button>
      <button class="pf-btn" onclick="printAndSubmitAddPayment()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        Print &amp; save</button>
      <button class="pf-btn pf-btn--go" onclick="submitAddPayment()">
        Post payment
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>
      </div>
  </footer>`;
}

/* ── THE MONTH RAIL ──────────────────────────────────────────────────────────
   Three controls over one select. Nothing here holds state of its own: the
   arrows step its index, a chip sets its value, and every month drawn is a
   month the select already offers — so a chip can never post to a month
   submitAddPayment() would not accept. */
function pfMonthStep(dir) {
  const sel = document.getElementById('f-pmonth');
  if (!sel) return;
  // The options run newest first, so a later month is one index UP the list.
  const i = sel.selectedIndex - dir;
  if (i < 0 || i >= sel.options.length) return;
  sel.selectedIndex = i;
  pfMonthChanged();
}

function pfPickMonth(label) {
  const sel = document.getElementById('f-pmonth');
  if (!sel || !label) return;
  sel.value = label;
  pfMonthChanged();
}

/* Six chips ending on the selected month, marked from the student's own
   records: charged means a record exists for that month, settled means nothing
   is left owing on it. A chip with no marker is a month this student has no
   record for — that is information, not an empty slot. */
function pfRenderMonthRail() {
  const box = document.getElementById('ap-chips');
  const sel = document.getElementById('f-pmonth');
  if (!box || !sel) return;
  const at  = Math.max(0, sel.selectedIndex);
  const win = [...sel.options].slice(at, at + 6).map(o => o.value).reverse();
  const sid = document.getElementById('f-pstudent')?.value || '';
  const now = _normPayMonthLabel(thisMonthLabel());
  const cur = _normPayMonthLabel(sel.value);
  box.innerHTML = win.map(l => {
    const key  = _normPayMonthLabel(l);
    const recs = (sid && sid !== '__manual__')
      ? DB.payments.filter(p => p.studentId === sid && _normPayMonthLabel(p.month) === key)
      : [];
    const settled = recs.length > 0 && recs.every(p => p.status === 'Paid' || !(Number(p.unpaid) > 0));
    const cls = ['ap-chip',
                 key === cur ? 'is-on' : '',
                 settled ? 'is-settled' : recs.length ? 'is-charged' : '',
                 key === now ? 'is-now' : ''].filter(Boolean).join(' ');
    // this.title, not an interpolated argument: escHtml() does not escape the
    // apostrophe, and a legacy hand-typed month label may carry one.
    return `<button type="button" class="${cls}" title="${escHtml(l)}"
              onclick="pfPickMonth(this.title)">${escHtml(String(l).slice(0, 3))}</button>`;
  }).join('');
}

/* ── LINE 04 SHORTCUTS ───────────────────────────────────────────────────────
   Each is a figure the form already knows, so none of them can disagree with
   the stub: full is the payable total, rent is the room half of the charge. */
function pfPayQuick(which) {
  const el = document.getElementById('f-ppaid');
  if (!el) return;
  const total = pfPayableTotal();
  // The box is the cash received now, so the chips offer shares of what is
  // still OWED — on a part-paid month, the whole bill would charge the money
  // already collected a second time.
  const remaining = Math.max(0, total - money(parseFloat(el.dataset.already) || 0));
  el.value = which === 'rent' ? Math.min(pfRentAmount(), remaining || pfRentAmount())
           : which === 'half' ? Math.round(remaining / 2)
           : remaining;
  recalcUnpaid();
}

/* Monthly charge + admission fee + extras − concession. One definition, read by
   both recalcUnpaid() and the line-04 shortcuts, so the chips and the stub
   cannot drift apart. */
function pfPayableTotal() {
  const num = id => parseFloat(document.getElementById(id)?.value) || 0;
  // §14: one bill expression. This was the sixth hand-written copy of
  // rent + mess + extras + admission − concession, and the copies had already
  // drifted apart — see calculateBill() in finance.js.
  return calculateBill({
    rent:         pfRentAmount(),
    messCharge:   pfMessAmount(),
    messIncluded: true,           // pfMessAmount() already returns 0 when off
    extraTotal:   getExtraChargesTotal(),
    admissionFee: num('f-padmfee'),
    concession:   num('f-pconcession'),
  });
}

// The segmented control on line 01 sets the checkbox the rest of the form reads.
function pfMessSet(on) {
  const el = document.getElementById('f-pmess-on');
  if (!el) return;
  el.checked = !!on;
  pfMessToggle();
}

/* Undo a pick without leaving the form. The identity strip replaces the search
   box once a student is chosen, so this is how the warden gets the box back. */
function pfClearStudent() {
  const hid  = document.getElementById('f-pstudent');
  const box  = document.getElementById('f-pstudent-search');
  const info = document.getElementById('selected-student-info');
  const pick = document.getElementById('ap-pick');
  if (hid)  hid.value = '';
  if (box)  box.value = '';
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  if (pick) pick.style.display = '';
  ['f-prent', 'f-pmess'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  pfRenderRecent(null);
  pfReloadOutstandings();
  pfRenderMonthRail();
  recalcUnpaid();
  if (box) box.focus();
}

/* The caption under the footer. It names where the money on this form is about
   to land, because lines 01-06 and line 05 are two different postings and the
   warden has no other way to see that before saving. */
function pfPostLine() {
  const el = document.getElementById('ap-postline');
  if (!el) return;
  const month  = document.getElementById('f-pmonth')?.value || '';
  const months = [...new Set(pfOutstandingAllocations().map(a => a.payment.month || '—'))];
  el.innerHTML = `Lines 01&ndash;06 post to <b>${escHtml(month || '—')}</b>`
    + (months.length ? ` &nbsp;&middot;&nbsp; line 05 to <b>${escHtml(months.join(', '))}</b>` : '');
}

/* The receipt stub. Every line is a term of the same equation the worksheet
   computes, numbered to match it, so a figure on the rail can always be traced
   back to the line that produced it:
     01 charge + 02 net fee/concession + 03 extras = Payable
     Payable − 04 paid                             = Remaining
   Line 05 sits BELOW the band on purpose — arrears are a second posting to an
   earlier month, not a term of this month's balance. */
function pfRenderSummary(vals) {
  const box = document.getElementById('ap-summary');
  if (!box) return;
  // A zero takes no sign and no hue -- see the worksheet column for why.
  const row = (n, label, val, sign, cls) =>
    `<div class="ap-stub__r ${val ? (cls || '') : ''}"><span><i>${n}</i>${label}</span>
       <b>${val ? (sign || '') : ''}${fmtNum(val)}</b></div>`;

  // Every term is listed even at zero (owner reference). A row that appears and
  // disappears as figures are typed makes the panel jump under the cursor, and
  // a missing line reads as "not counted" rather than "counted as nothing".
  const net = (vals.admFee || 0) - (vals.concession || 0);
  const arr = pfOutstandingAllocations();
  const arrTotal  = arr.reduce((s, a) => s + a.amount, 0);
  const arrMonths = [...new Set(arr.map(a => a.payment.month || '—'))].join(', ');

  box.innerHTML =
      row('01', 'Monthly charge', vals.charge, '', 'is-plus')
    + row('02', 'Admission &amp; concession', Math.abs(net), net > 0 ? '+ ' : net < 0 ? '&minus; ' : '',
          net > 0 ? 'is-plus' : net < 0 ? 'is-minus' : '')
    + row('03', 'Extra charges', vals.extra, '+ ', 'is-plus')
    + row('04', 'Paid this month', vals.paid, '&minus; ', 'is-minus')
    + `<div class="ap-stub__pay"><span>Payable</span><b>${fmtPKR(vals.total)}</b></div>`
    + `<div class="ap-stub__bal ${
         !vals.total && !vals.paid ? 'is-none' : vals.unpaid > 0 ? 'is-due' : 'is-clear'}">
         <span>Remaining</span><b>${fmtPKR(vals.unpaid)}</b>
       </div>`
    + (arrTotal > 0
        ? `<div class="ap-stub__r is-arr"><span><i>05</i>Arrears to ${escHtml(arrMonths)}</span>
             <b>${fmtNum(arrTotal)}</b></div>`
        : '');
}

/* The student's ledger — what has already been collected, month by month, so
   the warden can check this worksheet against their history without leaving
   the form. Records only: nothing is drawn for a month with no record. */
function pfRenderRecent(t) {
  const box = document.getElementById('ap-recent');
  if (!box) return;
  if (!t) { box.innerHTML = '<div class="ap-empty">Pick a student to see their history</div>'; return; }
  const rows = DB.payments
    .filter(p => p.studentId === t.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);
  if (!rows.length) { box.innerHTML = '<div class="ap-empty">No payments recorded yet</div>'; return; }
  box.innerHTML = rows.map(p => {
    const owed  = outstandingOf(p);
    const clear = p.status === 'Paid' || owed <= 0;
    return `<div class="ap-led__r">
      <span class="ap-led__m">${escHtml(p.month || '—')}</span>
      <span class="ap-led__meth">${escHtml(p.method || '—')}</span>
      <span class="ap-led__v">${fmtNum(p.amount)}
        <i class="${clear ? 'is-clear' : 'is-due'}">${clear
          ? (p.paidDate ? 'Cleared ' + escHtml(fmtDate(p.paidDate)) : 'Cleared')
          : fmtNum(owed) + ' owing'}</i></span>
    </div>`;
  }).join('');
}

// Notes counter for the payment modal.
/* ── PROGRESS ────────────────────────────────────────────────────────────────
   Reads the form and marks how far it has got: a student picked closes step 1,
   an amount entered closes step 2. Called from recalcUnpaid(), so it follows
   every keystroke that changes either. */
function apUpdateSteps() {
  const box = document.getElementById('ap-steps');
  if (!box) return;
  const picked = !!(document.getElementById('f-pstudent')?.value);
  const amount = parseFloat(document.getElementById('f-ppaid')?.value) || 0;
  const arrears = (() => {
    let n = 0;
    document.querySelectorAll('.pf-out__in').forEach(el => { n += parseFloat(el.value) || 0; });
    return n;
  })();
  // Step 3 is only reached once there is money on the form — either against
  // this month or against an earlier one.
  const at = !picked ? 1 : (amount > 0 || arrears > 0) ? 3 : 2;
  box.querySelectorAll('.ap-step').forEach(el => {
    const n = Number(el.dataset.step);
    el.classList.toggle('is-on',   n === at);
    el.classList.toggle('is-done', n <  at);
  });
}

function pfCount() {
  const ta = document.getElementById('f-pnotes-main'), el = document.getElementById('f-pnotes-count');
  if (ta && el) el.textContent = ta.value.length + '/250';
}
async function submitAddPayment() {
  // Try to auto-select if only one student matches the search text
  const searchEl = document.getElementById('f-pstudent-search');
  const hiddenEl = document.getElementById('f-pstudent');
  if(hiddenEl && !hiddenEl.value && searchEl && searchEl.value.trim()) {
    const q = searchEl.value.trim().toLowerCase();
    const matches = DB.students.filter(t => isResident(t) && (
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

    // Case 1 — this month is already settled. That is a reason not to charge it
    // a second time. It is NOT a reason to refuse the money in the warden's
    // hand: arrears entered under Receive Outstanding are posted to the months
    // they belong to, so July's balance can still be taken in August after
    // August itself is paid. The old hard block returned before any of that ran
    // and the cash could not be recorded at all until the next month began.
    const alreadyPaid2 = DB.payments.find(p => p.studentId === studentIdRaw && p.status === 'Paid'
      && _normPayMonthLabel(p.month) === _normPayMonthLabel(enteredMonth2));
    if (alreadyPaid2) {
      window._forcePayAP = false;
      const arrearsOnly = pfOutstandingAllocations();
      if (arrearsOnly.length) {
        const aMethod = document.getElementById('f-pmethod')?.value || 'Cash';
        const aDate   = document.getElementById('f-pdate')?.value   || today();
        const aDesc   = pfApplyOutstandings(arrearsOnly, aMethod, aDate);
        logActivity('Arrears Collected', `${tName} — ${aDesc}`, 'Finance');
        await saveDB(); closeModal(); renderPage('payments');
        toast(`Arrears posted to ${arrearsOnly.length} earlier month(s) for ${tName} · `
            + `${enteredMonth2} was already settled and was not charged again`, 'success');
        // The slip in the student's hand has to name the cash they handed over,
        // and that cash now sits on the earlier month's record.
        if (window._printAfterSave) {
          window._printAfterSave = false;
          const _firstArrear = arrearsOnly[0].payment.id;
          setTimeout(() => printReceipt(_firstArrear), 350);
        }
        return;
      }
      toast(tName + ' has ALREADY PAID for ' + enteredMonth2 + ' ('
        + fmtPKR(alreadyPaid2.amount) + '). To take money for an earlier month, enter it under "Receive Outstanding".', 'error');
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
      const existingUnpaid  = outstandingOf(alreadyPending2);
      showConfirm(
        '⚠️ Pending Record Already Exists',
        `${escHtml(tName)} already has a <strong>Pending</strong> payment for <strong>${escHtml(enteredMonth2)}</strong>.<br>`
        + `<div style="margin:10px 0;background:var(--bg3);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.8">`
        + `Existing → Paid: <strong>${fmtPKR(existingPaidAmt)}</strong> &nbsp;|&nbsp; Unpaid: <strong style="color:var(--red)">${fmtPKR(existingUnpaid)}</strong></div>`
        + `<strong>Update the existing record</strong> instead of creating a duplicate?<br><small style="color:var(--text3)">Click <em>OK</em> to update · <em>Cancel</em> to abort</small>`,
        async function() {
          // ── UPDATE existing pending record in-place ──────────────────
          const newMonthlyRent = pfRentAmount() || alreadyPending2.monthlyRent || 0;
          const newMessOn      = document.getElementById('f-pmess-on')?.checked !== false;
          const newMess        = pfMessAmount();
          /* RECEIVED NOW (owner, 2026-09-14). The box is the cash in the warden's
             hand, ADDED to what the month already holds. It used to be the
             month's running total, seeded with what had been taken — so a warden
             typing the 1,000 they were holding, against 4,000 already collected,
             saved 1,000 and 3,000 vanished. Today's cash now goes through
             applyPayment(), the one collection path, and becomes its own
             instalment and its own ledger entry under the account that took it. */
          const received       = money(parseFloat(document.getElementById('f-ppaid')?.value) || 0);
          if (received < 0) {
            toast('Enter the amount received — it cannot be negative', 'error');
            window._updatePendingAP = false;
            return;
          }
          const newExtraCharges= getExtraChargesData();
          const newExtraTotal  = newExtraCharges.reduce((s,c)=>s+c.amount,0);
          // Admission fee and concession were missing here too, so merging into
          // an existing pending record produced a different total than creating
          // a fresh one from the identical form.
          const newAdmFee      = parseFloat(document.getElementById('f-padmfee')?.value)||0;
          const newConcession  = parseFloat(document.getElementById('f-pconcession')?.value)||0;
          const newMethod      = document.getElementById('f-pmethod')?.value || alreadyPending2.method || 'Cash';
          const newDate        = document.getElementById('f-pdate')?.value  || today();
          const newNotes       = document.getElementById('f-pnotes-main')?.value || document.getElementById('f-pnotes')?.value || '';

          // A bill changed on the way through is recorded, like one changed on the Edit form.
          ledgerAdjust(alreadyPending2, ledgerChargeFacts(alreadyPending2),
            ledgerChargeFacts({ monthlyRent: newMonthlyRent, messCharge: newMess, messIncluded: newMessOn,
                                extraTotal: newExtraTotal, admissionFee: newAdmFee, concession: newConcession }),
            'Changed while adding a payment', 'merge');

          // The bill first, and the balance it leaves on what was already collected…
          alreadyPending2.monthlyRent  = newMonthlyRent;
          alreadyPending2.totalRent    = newMonthlyRent;
          alreadyPending2.messCharge   = newMess;
          alreadyPending2.messIncluded = newMessOn;
          alreadyPending2.extraCharges = newExtraCharges;
          alreadyPending2.extraTotal   = newExtraTotal;
          alreadyPending2.admissionFee = newAdmFee;
          alreadyPending2.concession   = newConcession;
          alreadyPending2.discount     = newConcession;
          const billNow         = calculateBill(alreadyPending2);
          const collectedBefore = money(alreadyPending2.amount);
          alreadyPending2.unpaid   = Math.max(0, billNow - collectedBefore);
          alreadyPending2.overpaid = Math.max(0, collectedBefore - billNow);   // §14
          alreadyPending2.status   = alreadyPending2.unpaid > 0 ? 'Pending' : 'Paid';
          alreadyPending2.date     = newDate;
          // …then today's cash, through the one collection path.
          if (received > 0) {
            applyPayment(alreadyPending2, { amount: received, method: newMethod, date: newDate, note: 'Instalment' });
            alreadyPending2.collectedBy = CUR_USER?.name || alreadyPending2.collectedBy || '';
          }
          alreadyPending2.method   = newMethod;
          alreadyPending2.paidDate = alreadyPending2.status === 'Paid' ? (alreadyPending2.paidDate || newDate) : '';
          if (newNotes) alreadyPending2.notes = newNotes;

          // Arrears entered alongside this update still post to their own months.
          const arrearsU = pfOutstandingAllocations();
          if (arrearsU.length) {
            // Appended, not replaced: a second visit against the same month is
            // more cash through the same record, and the receipt lists the lot.
            alreadyPending2.arrearsCollected = (alreadyPending2.arrearsCollected || []).concat(
              arrearsU.map(a => ({ month: a.payment.month || '—', amount: a.amount, date: newDate })));
          }
          const arrearsUDesc = arrearsU.length ? pfApplyOutstandings(arrearsU, newMethod, newDate) : '';

          logActivity('Payment Updated', `${tName} — ${enteredMonth2} (existing record updated, no duplicate created)`, 'Finance');
          if (arrearsUDesc) logActivity('Arrears Collected', `${tName} — ${arrearsUDesc}`, 'Finance');
          await saveDB(); closeModal(); renderPage('payments');
          toast(arrearsUDesc
            ? `Payment updated for ${tName} · arrears posted to ${arrearsU.length} earlier month(s)`
            : `Payment updated for ${tName} — no duplicate created`, 'success');
          window._updatePendingAP = false;
        },
        function() { window._updatePendingAP = false; }
      );
      return;
    }
    window._updatePendingAP = false;
  }
  window._forcePayAP = false;
  const monthlyRent = pfRentAmount();
  const messIncluded = document.getElementById('f-pmess-on')?.checked !== false;
  const messCharge   = pfMessAmount();
  const paidAmount  = parseFloat(document.getElementById('f-ppaid')?.value)||0;
  const extraCharges = getExtraChargesData();
  const extraTotal  = extraCharges.reduce((s,c)=>s+c.amount,0);
  const admissionFee  = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const concession    = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const concessionDesc= (document.getElementById('f-pconcession-desc')?.value||'').trim();
  const totalDue    = calculateBill({
    rent: monthlyRent, messCharge, messIncluded: true,   // pfMessAmount() is 0 when off
    extraTotal, admissionFee, concession,
  });
  const totalRent   = monthlyRent;                // display rent = base only
  const unpaid      = Math.max(0, totalDue - money(paidAmount));
  const status      = document.getElementById('f-pstat')?.value || 'Pending';
  const t    = isManual ? null : DB.students.find(x=>x.id===studentIdRaw);
  const room = t ? DB.rooms.find(r=>r.id===t?.roomId) : null;
  const finalName = isManual ? manualName : (t?.name||'');
  const _newPayId = 'p_'+uid();
  // Read the arrears BEFORE the record is built: the receipt printed for this
  // visit has to name the cash that went to earlier months, or the slip in the
  // student's hand disagrees with what they handed over.
  const arrears = pfOutstandingAllocations();
  DB.payments.push({
    id: _newPayId,
    collectedBy: CUR_USER?.name || '',  // BUG FIX: guard against null CUR_USER
    studentId: isManual ? '' : studentIdRaw,
    studentName: finalName,
    roomId: t?.roomId||'',
    roomNumber: room?.number||'',
    amount: paidAmount,
    monthlyRent, unpaid,
    // §14 overpayment — see submitPaymentForStudent() for the reasoning.
    overpaid: Math.max(0, money(paidAmount) - totalDue),
    messCharge, messIncluded,
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
    // A record of the cash, not of the debt — the debt itself moves onto the
    // earlier month's own record in pfApplyOutstandings() below.
    arrearsCollected: arrears.map(a => ({
      month: a.payment.month || '—', amount: a.amount,
      date: document.getElementById('f-pdate')?.value || today(),
    })),
  });
  // Arrears collected on this visit are posted to the months they belong to,
  // never folded into the record just created for the selected month.
  const arrearsDesc = arrears.length
    ? pfApplyOutstandings(arrears,
        document.getElementById('f-pmethod')?.value || 'Cash',
        document.getElementById('f-pdate')?.value || today())
    : '';

  logActivity('Payment Added', `${finalName||'student'} — ${document.getElementById('f-pmonth')?.value||''}`, 'Finance');
  if (arrearsDesc) logActivity('Arrears Collected', `${finalName||'student'} — ${arrearsDesc}`, 'Finance');
  await saveDB(); closeModal(); renderPage('payments');
  toast(arrearsDesc
    ? `Payment recorded for ${finalName||'student'} · arrears posted to ${arrears.length} earlier month(s)`
    : `Payment recorded for ${finalName||'student'}`, 'success');
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
/* ══ EDIT PAYMENT ══════════════════════════════════════════════════════════
   Relaid out 2026-09-07 to the owner's compact reference and the global
   viewport specification. Measured before the change, on the 1366×768 QA
   floor: the dialog opened 1120px wide and 722px tall — 94vh of a 768px
   window — with the OVERLAY scrolling rather than the body, so a warden saw
   section 1, half of section 2, and had to scroll the header off the screen to
   reach Save. The form was never too long; the shell was given the whole
   window and then allowed to spill.

   What changed is the shell, the density and the grid. What did NOT change is
   the arithmetic or a single field id: recalcUnpaid() and submitEditPayment()
   find their inputs by id, so a rename here is silent data loss there. Every
   `f-p*` id below is the one that was here before, and the four sections are
   still in the order the money moves — 1 sets the bill, 2 adjusts it, 3
   records the settlement, 4 explains anything unusual.                      */
function showEditPaymentModal(id) {
  if (typeof requirePerm === 'function' && !requirePerm('payments')) return;
  const p = DB.payments.find(x=>x.id===id); if(!p) return;
  const t = DB.students.find(s=>s.id===p.studentId);
  const room = t ? DB.rooms.find(r=>r.id===t.roomId) : null;
  const rtype = room ? DB.settings.roomTypes.find(x=>x.id===room.typeId) : null;
  // The record's own method is always offered, even if it has since been
  // removed from Settings — otherwise editing anything else on an older payment
  // silently rewrote how the money came in.
  const pmOpts = pmOptions(p.method);
  // BUG FIX: Use the student's CURRENT rent (t.rent) as the primary value.
  // p.monthlyRent is the rent at the time the payment was recorded and may be stale
  // if the warden has since updated fees in Settings. t.rent is always kept in sync.
  const c = t ? resolveCharges(t) : null;
  const monthlyRent  = (c && c.rent) || p.monthlyRent || p.totalRent || 0;
  // Mess follows the same rule as rent above: the current configured charge
  // wins, falling back to what was recorded on this payment.
  const messCharge   = c && c.mess != null ? c.mess : Number(p.messCharge || 0);
  const messIncluded = p.messIncluded != null ? p.messIncluded !== false : (c ? c.messOptIn : true);
  const paidAmount   = p.amount || 0;
  const admissionFee = p.admissionFee || p.fee || 0;
  const concession   = p.concession || p.discount || 0;
  const concessionDesc = p.concessionDesc || p.discountDesc || '';
  const unpaid = outstandingOf(p);

  /* A field wearing the reference's icon chip. `input` is the control's own
     HTML so every id, handler and value stays exactly where it was; this only
     wraps it. */
  const F = (label, ico, input, opts) => {
    const o = opts || {};
    return `<div class="field">
      <label${o.for ? ` for="${o.for}"` : ''}>${escHtml(label)}${o.req ? '<span class="req">*</span>' : ''}${o.opt ? '<span class="opt">(optional)</span>' : ''}</label>
      <div class="hf-in${o.cls ? ' ' + o.cls : ''}"><span class="hf-in__i">${icon(ico, 'sm')}</span>${input}</div>
      ${o.note ? `<div class="pef-note">${o.note}</div>` : ''}
    </div>`;
  };

  const secHead = (n, title, hint) => `
    <div class="pef-sec__n"><span class="hf-num">${n}</span>
      <span class="pef-sec__t">${escHtml(title)}</span></div>
    ${hint ? `<div class="pef-sec__hint">${escHtml(hint)}</div>` : ''}`;

  showModal('modal-form', `
    <div class="hf-mh">
      <span class="hf-mh__ico">${icon('edit', 'sm')}</span>
      <span style="min-width:0">
        <span class="hf-mh__t">Edit Payment — ${escHtml(p.studentName||'Student')}</span>
        <span class="hf-mh__s">Update payment details, charges and adjustments for this student.</span>
      </span>
    </div>`, `
    <div class="pef-who">
      <div class="pef-who__av">${escHtml((p.studentName||'?')[0].toUpperCase())}</div>
      <div class="pef-who__id">
        <div class="pef-who__n">${escHtml(p.studentName||'—')}</div>
        <div class="pef-who__m">Room <b>#${escHtml(String(room?.number ?? '?'))}</b>${rtype?` · ${escHtml(rtype.name)}`:''}${t?.phone?` · ${escHtml(t.phone)}`:''}</div>
      </div>
      <div class="pef-who__amt">
        <div class="pef-who__v">${fmtPKR(monthlyRent + (messIncluded?messCharge:0))}</div>
        <div class="pef-who__l">Monthly charge</div>
      </div>
    </div>

    <div class="pef-top">
      <div class="pef-sec">
        ${secHead(1, 'Monthly charge (PKR)', 'Set the standard charges for this student.')}
        <div class="hf-g3">
          ${F('Room rent (PKR)', 'home',
             `<input class="form-control" id="f-pamt" type="number" value="${monthlyRent}" oninput="recalcUnpaid()">`,
             { req: true, for: 'f-pamt' })}
          ${/* MESS — this modal used to omit it, so saving an edit recomputed the
                total without the food charge while leaving p.messCharge on the
                record: the balance and the printed receipt disagreed. */''}
          ${!hostelServesMess() ? '' :
            F('Mess charges (PKR)', 'utensils',
              `<input class="form-control" id="f-pmess" type="number" min="0" value="${messCharge||''}" placeholder="0" ${messIncluded?'':'disabled'} oninput="recalcUnpaid()">`,
              { for: 'f-pmess',
                note: !messIsOptional()
                  ? 'Included for every student'
                  : `<label class="pef-messtoggle">
                       <input type="checkbox" id="f-pmess-on" ${messIncluded?'checked':''} onchange="pfMessToggle()">
                       <span id="f-pmess-note">${messIncluded?'Rent + mess = total monthly charge':'Room only — mess not charged'}</span>
                     </label>` })}
          ${/* COLLECTED MONEY IS NOT EDITED (owner, 2026-09-14 — warden ledger
                spec, Phase 2). Once anything has been collected the figure is
                read-only, for every account including the owner's, and the way
                to take money back is a reversal, which records why and who.
                submitEditPayment() enforces the same rule on save, so a field
                altered through the DOM changes nothing. */''}
          ${money(p.amount) > 0
            ? F('Amount paid (PKR)', 'wallet',
                `<input class="form-control" id="f-ppaid" type="number" value="${paidAmount}" readonly data-locked="1" oninput="recalcUnpaid()">`,
                { for: 'f-ppaid', cls: 'is-readonly',
                  note: `Collected money is not edited here.
                         ${p.studentId ? `<button type="button" class="btn btn-primary btn-sm" onclick="closeModal();openAddPayment('${escHtml(String(p.studentId))}','${escHtml(String(p.month || ''))}')">Receive payment…</button>` : ''}
                         <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal();showReversePaymentModal('${escHtml(String(p.id))}')">Reverse a collection…</button>` })
            : F('Amount paid (PKR)', 'wallet',
                `<input class="form-control" id="f-ppaid" type="number" value="${paidAmount||''}" oninput="recalcUnpaid()">`,
                { req: true, for: 'f-ppaid' })}
        </div>
        ${/* The bill on a record that has taken money can still be corrected —
              a rent typed wrong is a real case — but not silently. A change to
              rent, mess, extras, admission fee or concession needs a reason,
              and is written to the ledger with the before and after. */''}
        ${money(p.amount) > 0 ? `<div class="field">
          <label for="f-padjreason">Reason for changing the bill <span class="opt">(needed if rent, mess, extras, admission fee or concession change)</span></label>
          <div class="hf-in"><span class="hf-in__i">${icon('info', 'sm')}</span>
            <input class="form-control" id="f-padjreason" type="text" maxlength="120" placeholder="e.g. Rent corrected to the room's new rate"></div>
        </div>` : ''}
      </div>

      ${/* THE SUM, WHERE THE TYPING IS. recalcUnpaid() has computed all three of
           these on every keystroke for months; the only place they surfaced was
           the readonly "Unpaid / Remaining" box, which sits in section 3 —
           BELOW the fields that change it. Nothing here is a new calculation.
           It is the existing one, moved to where it can be read while the
           number is still being entered. */''}
      <div class="pef-sum">
        <div class="pef-sum__hd">${icon('fileText','sm')} Payment summary</div>
        <div class="pef-sum__row"><span>Total due</span><b id="pef-due">-</b></div>
        <div class="pef-sum__row is-paid"><span>Total paid</span><b id="pef-paid">-</b></div>
        <div class="pef-sum__row" id="pef-rem-row"><span>Remaining</span><b id="pef-rem">-</b></div>
        <div class="pef-verdict is-none" id="pef-verdict">
          <span><span class="pef-verdict__t" id="pef-verdict-t">-</span><span class="pef-verdict__s" id="pef-verdict-s"></span></span>
        </div>
      </div>
    </div>

    <div class="pef-sec">
      ${secHead(2, 'Adjustments (PKR)', 'Additional fees or concessions for this month.')}
      <div class="pef-adj">
        <div class="pef-adj__l">
          ${F('Admission fee (PKR)', 'graduation',
             `<input class="form-control" id="f-padmfee" type="number" placeholder="0" min="0" value="${admissionFee||0}" oninput="recalcUnpaid()">`,
             { for: 'f-padmfee' })}
          ${F('Concession / discount (PKR)', 'tag',
             `<input class="form-control" id="f-pconcession" type="number" placeholder="0" min="0" value="${concession||0}" oninput="recalcUnpaid()">`,
             { for: 'f-pconcession' })}
          ${F('Concession description', 'list',
             `<input class="form-control" id="f-pconcession-desc" placeholder="e.g. Scholarship, hardship…" value="${escHtml(concessionDesc)}">`,
             { for: 'f-pconcession-desc', opt: true })}
        </div>
        <div class="pef-extra">
          <div class="pef-extra__hd">
            <span>${icon('plus','sm')} Extra charges</span>
            <button type="button" class="pef-extra__add" onclick="addExtraChargeRow()">+ Add</button>
          </div>
          <div id="extra-charges-list"></div>
          <div class="pef-extra__tot">
            <span>Total extra</span>
            <span id="extra-charges-total">Rs. ${Number(p.extraTotal||0).toLocaleString('en-PK')}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="pef-sec">
      ${secHead(3, 'Payment details', 'Record how and when the payment was made.')}
      ${/* Two rows of three, which is the reference's grid and the one that
            fits: remaining/status/method is the settlement, month/paid/due is
            when. Six fields in a two-column grid ran the section 90px taller
            than the modal had to spare. */''}
      <div class="hf-g3">
        ${F('Unpaid / remaining (PKR)', 'clock',
           `<input class="form-control" id="f-punpaid" type="number" value="${unpaid||0}" readonly>`,
           { for: 'f-punpaid', cls: 'is-readonly' + (unpaid > 0 ? ' is-warn' : ' is-good') })}
        ${F('Status', 'bookmark', `<select class="form-control" id="f-pstat">
             <option value="Paid" ${unpaid===0&&monthlyRent>0?'selected':''}>Paid</option>
             <option value="Pending" ${unpaid>0||!monthlyRent?'selected':''}>Unpaid / Pending</option>
           </select>`, { for: 'f-pstat' })}
        ${F('Payment method', 'card', `<select class="form-control" id="f-pmethod">${pmOpts}</select>`,
           { for: 'f-pmethod' })}
        ${F('Month', 'calendar', `<select class="form-control" id="f-pmonth">${payMonthPickerOptions(p.month || '', p.studentId || '')}</select>`,
           { for: 'f-pmonth' })}
        ${F('Payment date', 'calendar',
           `<input class="form-control cdp-trigger" id="f-pdate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${escHtml(p.date||'')}">`,
           { for: 'f-pdate' })}
        ${F('Due date', 'calendar',
           `<input class="form-control cdp-trigger" id="f-pdue" type="text" readonly onclick="showCustomDatePicker(this,event)" placeholder="Select due date" value="${escHtml(p.dueDate||'')}">`,
           { for: 'f-pdue' })}
      </div>
    </div>

    <div class="pef-sec">
      ${secHead(4, 'Notes', '')}
      <div class="hf-in hf-in--top">
        <span class="hf-in__i">${icon('fileText','sm')}</span>
        <textarea class="form-control" id="f-pnotes" rows="2" maxlength="250" placeholder="Anything worth remembering about this payment…" oninput="pefNoteCount()">${escHtml(p.notes||'')}</textarea>
      </div>
      <div class="pef-notes-count" id="f-pnotes-count"></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-danger btn-sm" onclick="deletePayment('${id}')">${icon('trash','sm')} Delete</button>
   <button class="btn btn-primary" onclick="submitEditPayment('${id}')">${icon('save','sm')} Save Changes</button>`);
  setTimeout(function() {
    const ecl = document.getElementById('extra-charges-list');
    if(ecl && p.extraCharges && p.extraCharges.length) {
      ecl.innerHTML = '';
      p.extraCharges.forEach(c => addExtraChargeRow(c.description||c.desc||c.label||'', c.amount));
    }
    recalcUnpaid();
    pefNoteCount();
  }, 50);
}
async function submitEditPayment(id) {
  if (typeof requirePerm === 'function' && !requirePerm('payments')) return;
  const p = DB.payments.find(x=>x.id===id); if(!p) return;
  const monthlyRent  = parseFloat(document.getElementById('f-pamt')?.value)||0;
  const messIncluded = document.getElementById('f-pmess-on')?.checked !== false;
  const messCharge   = pfMessAmount();
  const prevPaid     = money(p.amount);
  /* COLLECTED MONEY IS NOT EDITED (warden ledger spec, Phase 2). The field is
     read-only once anything is collected; this is the rule on the side that
     saves, so a value altered in the DOM changes nothing. A record that has
     collected nothing still takes its first figure here. */
  const paidAmount   = prevPaid > 0 ? prevPaid : (parseFloat(document.getElementById('f-ppaid')?.value)||0);
  const admissionFee = parseFloat(document.getElementById('f-padmfee')?.value)||0;
  const concession   = parseFloat(document.getElementById('f-pconcession')?.value)||0;
  const concessionDesc = (document.getElementById('f-pconcession-desc')?.value||'').trim();
  const extraCharges = getExtraChargesData();
  const extraTotal   = extraCharges.reduce((s,c)=>s+c.amount, 0);
  const totalDue     = calculateBill({
    rent: monthlyRent, messCharge, messIncluded: true,   // pfMessAmount() is 0 when off
    extraTotal, admissionFee, concession,
  });
  const unpaid       = Math.max(0, totalDue - money(paidAmount));

  /* A CHANGE TO THE BILL IS RECORDED, and on a record that has taken money it
     needs a reason. Checked before a single field is written, so a refusal
     leaves the record exactly as it was and the form open to fill in. */
  const billBefore = ledgerChargeFacts(p);
  const billAfter  = ledgerChargeFacts({ monthlyRent, messCharge, messIncluded: true,
                                         extraTotal, admissionFee, concession });
  const adjReason  = (document.getElementById('f-padjreason')?.value || '').trim();
  if (prevPaid > 0 && ledgerChargesDiffer(billBefore, billAfter) && !adjReason) {
    toast('Money has been collected on this record, so a change to the bill needs a reason.',
          'error', 'Reason needed');
    const why = document.getElementById('f-padjreason');
    if (why) why.focus();
    return;
  }
  ledgerAdjust(p, billBefore, billAfter, adjReason, 'edit');

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
  p.messCharge     = messCharge;
  p.messIncluded   = messIncluded;
  p.amount         = paidAmount;
  p.admissionFee   = admissionFee;
  p.concession     = concession;
  p.concessionDesc = concessionDesc;
  p.discount       = concession;
  p.extraCharges   = extraCharges;
  p.extraTotal     = extraTotal;
  p.unpaid         = unpaid;
  // §14 overpayment. Recomputed from this form's own figures rather than added
  // to, because the Edit form restates the whole record: the bill it shows and
  // the amount beside it are both editable, so the credit is whatever those two
  // now say it is.
  p.overpaid       = Math.max(0, money(paidAmount) - totalDue);
  p.method         = document.getElementById('f-pmethod')?.value || p.method;
  p.month          = document.getElementById('f-pmonth')?.value  || p.month;
  p.status         = document.getElementById('f-pstat')?.value   || p.status;
  p.date           = document.getElementById('f-pdate')?.value   || p.date;
  p.dueDate        = document.getElementById('f-pdue')?.value    || p.dueDate;
  p.paidDate       = p.status==='Paid' ? p.date : '';
  p.notes          = document.getElementById('f-pnotes')?.value  || '';
  // Editing one month's record does NOT re-price the student. It used to write
  // monthlyRent back to _st.rent, so correcting a single historical bill
  // silently changed every future one. Price changes belong in
  // Settings → Rent & Mess, which propagates deliberately.
  logActivity('Payment Updated', `${p.studentName||''} — ${p.month||''}`, 'Finance');
  await saveDB();
  toast('Payment updated','success');
  if(_returnStudentId) {
    var _sid = _returnStudentId; _returnStudentId = null;
    if (!refreshStudentView(_sid)) showStudentPanel(_sid);
  } else {
    closeModal(); renderPage('payments');
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   REVERSING A COLLECTION (spec §14)

   A warden keys 15,000 where they meant 1,500. Until now the only remedy was
   the Edit form, which restates the whole record: the wrong figure is
   overwritten, the instalment trail is rewritten around it, and nothing is left
   saying a mistake was ever made. On a shared warden screen that is
   indistinguishable from money going missing.

   A reversal is a fact about money and is recorded as one. It never edits the
   collection it undoes — the original stays in the trail, the reversal sits
   beside it in `p.reversals` with its reason and who did it, and dashboard.js
   dates it as cash leaving the drawer on the day it happened.

   THIS IS NOT DELETE. Delete removes the record and everything it says; this
   removes an amount and says why. They are next to each other in the row
   actions, so the modal has to make the difference obvious.
   ══════════════════════════════════════════════════════════════════════════ */
function showReversePaymentModal(id) {
  if (typeof requirePerm === 'function' && !requirePerm('payments')) return;
  const p = DB.payments.find(x => x.id === id); if (!p) return;

  const collected = money(p.amount);
  if (collected <= 0) { toast('Nothing has been collected on this record', 'info'); return; }

  const due    = calculateOutstanding(p);
  const credit = calculateRefund(p).refundable;
  const trail  = Array.isArray(p.partialPayments) ? p.partialPayments : [];
  const past   = Array.isArray(p.reversals) ? p.reversals : [];

  const line = (label, value, tone) =>
    `<div class="pay-rev__line"><span>${label}</span>` +
    `<b class="${tone || ''}">${value}</b></div>`;

  showModal('modal-sm', 'Reverse a collection',
    `<div class="pay-rev">
       <div class="pay-rev__who">
         <b>${escHtml(p.studentName || '—')}</b>
         <span>${escHtml(p.month || '—')}${p.roomNumber ? ' · Room ' + escHtml(roomText(p.roomNumber,
             ((DB.rooms||[]).find(r=>String(r.number)===String(p.roomNumber))||{}).floor)) : ''}</span>
       </div>
       <div class="pay-rev__box">
         ${line('Collected on this record', fmtPKR(collected))}
         ${line('Still owed', fmtPKR(due), due > 0 ? 'is-red' : '')}
         ${credit > 0 ? line('Credit held', fmtPKR(credit), 'is-amber') : ''}
       </div>
       ${past.length ? `<div class="pay-rev__past">Already reversed: ${
          past.map(r => fmtPKR(money(r.amount)) + ' on ' + escHtml(r.date || '—')).join(' · ')}</div>` : ''}
       <div class="field">
         <label>Amount to reverse</label>
         <input class="form-control" id="f-prev-amt" type="number" min="1" max="${collected}"
                value="${collected}" oninput="pfReverseHint()">
         <div class="pay-rev__hint" id="f-prev-hint"></div>
       </div>
       <div class="field">
         <label>Reason</label>
         <input class="form-control" id="f-prev-reason" type="text" maxlength="120"
                placeholder="Why is this being reversed?">
       </div>
       <div class="field">
         <label>Date</label>
         <input class="form-control cdp-trigger" id="f-prev-date" type="text" readonly
                onclick="showCustomDatePicker(this,event)" value="${today()}">
       </div>
       ${''/* Said plainly, because this button sits beside Delete. */}
       <div class="pay-rev__note">The original collection stays on the record. This
         adds a reversal beside it, and the money shows as leaving on the date above.</div>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="submitReversePayment('${p.id}')">Reverse</button>`);

  setTimeout(pfReverseHint, 30);
}

/* What the record will say once this is applied. Shown live, because "what does
   1,000 off a 15,000 collection leave me owed" is the question the warden is
   actually asking and it is not obvious on a part-paid record. */
function pfReverseHint() {
  const el = document.getElementById('f-prev-hint');
  const inp = document.getElementById('f-prev-amt');
  if (!el || !inp) return;
  const amt = money(parseFloat(inp.value) || 0);
  const max = money(parseFloat(inp.max) || 0);
  if (amt <= 0)   { el.textContent = 'Enter an amount to reverse.'; el.className = 'pay-rev__hint is-red'; return; }
  if (amt > max)  { el.textContent = 'More than was collected (' + fmtPKR(max) + ').'; el.className = 'pay-rev__hint is-red'; return; }
  el.textContent = 'Leaves ' + fmtPKR(max - amt) + ' collected on this record.';
  el.className = 'pay-rev__hint';
}

async function submitReversePayment(id) {
  if (typeof requirePerm === 'function' && !requirePerm('payments')) return;
  const p = DB.payments.find(x => x.id === id); if (!p) return;

  const amount = money(parseFloat(document.getElementById('f-prev-amt')?.value) || 0);
  const reason = (document.getElementById('f-prev-reason')?.value || '').trim();
  const date   = document.getElementById('f-prev-date')?.value || today();

  /* A REASON IS REQUIRED (warden ledger spec, Phase 2). Since collected money
     stopped being editable, Reverse is the only way to correct it — and a
     correction nobody can explain is exactly the entry the ledger exists to
     prevent. Refused with the modal still open, so the warden can type it. */
  if (!reason) {
    toast('Say why this is being reversed — the reason is recorded with it.', 'error', 'Reason needed');
    const why = document.getElementById('f-prev-reason');
    if (why) why.focus();
    return;
  }

  const r = reversePayment(p, { amount, reason, date });
  if (!r.ok) {
    toast(r.reason === 'exceeds-collected'
        ? 'That is more than was collected on this record (' + fmtPKR(r.max) + ')'
        : 'Enter an amount to reverse', 'error');
    return;
  }

  /* Logged like every other money action, and with the reason — a reversal with
     no stated cause is the one entry a later reader cannot make sense of. */
  logActivity('Payment Reversed',
    `${p.studentName || '—'} — ${p.month || '—'} · ${fmtPKR(r.reversed)} reversed`
    + (reason ? ' · ' + reason : ' · no reason given'), 'Finance');

  await saveDB();
  closeModal();
  renderPage(currentPage === 'payments' ? 'payments' : currentPage);
  toast(fmtPKR(r.reversed) + ' reversed — ' + fmtPKR(money(p.amount)) + ' still collected on this record',
        'success', 'Collection reversed');
}

// ════════════════════════════════════════════════════════════════════════════
// EXPENSES
// ════════════════════════════════════════════════════════════════════════════
let expFilter = {cat:'All', method:'All', search:'', showAll: false, month:'', page:1, pageSize:30, sortKey:'date', sortDir:'desc'};
/* `month:''` means "all months" here, and that IS the default — Expenses
   opens on the whole register rather than on this month. */
registerFilter('expenses', expFilter, () => ({
  cat:'All', method:'All', search:'', showAll:false, month:'', page:1,
  sortKey:'date', sortDir:'desc',
}));

// ════════════════════════════════════════════════════════════════════════════
// PAYMENTS TABLE — DRAG TO PAN
//
// The three secondary money columns live past the right edge. Grab any empty
// part of the table and drag to bring them in, instead of hunting for the
// scrollbar. Everything is delegated off `document`, because renderPayments()
// replaces #content wholesale on every save and re-render — a handler bound to
// the wrapper itself would be thrown away with it.
// ════════════════════════════════════════════════════════════════════════════
(function initPayDragPan() {
  const SLOP = 5;                 // px before a press counts as a drag, so clicks survive
  let wrap = null, startX = 0, startLeft = 0, pressed = false, panned = false;
  let swallowClick = false;

  const overflows = el => el.scrollWidth > el.clientWidth + 1;
  const closest = (t, sel) => (t && t.closest) ? t.closest(sel) : null;

  // Only advertise the grab cursor when there is somewhere to go.
  document.addEventListener('pointerover', e => {
    const w = closest(e.target, '.pay-table-wrap');
    if (w) w.classList.toggle('is-pannable', overflows(w));
  });

  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const w = closest(e.target, '.pay-table-wrap');
    if (!w || !overflows(w)) return;
    // Never start a pan on something the user is trying to operate.
    if (closest(e.target, 'button, input, select, textarea, a, label')) return;
    wrap = w; startX = e.clientX; startLeft = w.scrollLeft;
    pressed = true; panned = false;
  });

  document.addEventListener('pointermove', e => {
    if (!pressed || !wrap) return;
    const dx = e.clientX - startX;
    if (!panned) {
      if (Math.abs(dx) < SLOP) return;
      panned = true;
      wrap.classList.add('is-dragging');
    }
    wrap.scrollLeft = startLeft - dx;
    e.preventDefault();
  });

  function endPan() {
    if (wrap) wrap.classList.remove('is-dragging');
    // A pan ends with a click event on whatever was under the cursor. Swallow
    // exactly that one, or letting go over a row would also activate it.
    if (panned) swallowClick = true;
    pressed = false; panned = false; wrap = null;
  }
  document.addEventListener('pointerup', endPan);
  document.addEventListener('pointercancel', endPan);

  document.addEventListener('click', e => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
})();

/* The payment row's actions, in words. Reverse appears only where there is
   something to reverse — on a record that collected nothing it would be a dead
   item on every untouched row of a freshly generated month. */
function payRowMenu(id, btn) {
  const p = (DB.payments || []).find(function (x) { return String(x.id) === String(id); });
  if (!p) return;
  const S = {
    edit:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    reverse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>',
    del:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  };
  const items = [
    { label: 'Edit payment',  svg: S.edit,    on: "showEditPaymentModal('" + id + "')" },
    { label: 'Print receipt', svg: S.receipt, on: "printReceipt('" + id + "')" },
  ];
  if (money(p.amount) > 0) {
    items.push({ label: 'Reverse a collection', svg: S.reverse, on: "showReversePaymentModal('" + id + "')" });
  }
  items.push('sep');
  items.push({ label: 'Delete payment', svg: S.del, danger: true, on: "deletePayment('" + id + "')" });
  lkRowMenu(btn, items);
}
