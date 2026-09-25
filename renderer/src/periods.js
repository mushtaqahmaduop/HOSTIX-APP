/* ─── HOSTYLLO — PERIODS: THE MONTH-DOMAIN LAYER ─────────────────────────────
   What a month IS, to the money: which month a payment bills, whether a
   student was on the roster in a period, when cash physically moved, and the
   revenue / cash / expense / fund figures built on those answers.

   Finance Phase 4 (audit G7, 2026-09-18). These lived in modules/dashboard.js,
   a screen, and reports, archive and students imported them from there — so a
   change to how the dashboard DRAWS could break how every report COUNTS, and
   a test of the arithmetic had to load a 4,000-line screen to reach it. The
   code moved unchanged; only _studentInPeriod()'s no-join-date rule (G9)
   changed with it.

   Loaded after utils.js (thisMonth) and before every screen module. Plain
   globals, like finance.js, so the vm sandboxes in tests/ load it directly.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

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
// matched as a date prefix — the same shape calcExpenses() takes), counted over
// a given set of records. The Annual Archive reads its own dataset (live rows
// plus archived ones), so it needs the definition without the table baked in;
// calcCashReceived() below is this over DB.payments and nothing else.
//
// NET OF REFUNDS AND REVERSALS ALREADY. A checkout refund goes through
// reversePayment() into p.reversals, and _cashEvents() emits each reversal as a
// negative event on the day the money went back out.
function calcCashReceivedIn(list, key) {
  if (!key) return 0;
  return (list || []).reduce((sum, p) =>
    sum + _cashEvents(p).reduce((s, e) =>
      s + (String(e.date || '').indexOf(String(key)) === 0 ? e.amount : 0), 0), 0);
}
function calcCashReceived(key) {
  return calcCashReceivedIn(DB.payments || [], key);
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
/* ── AVAILABLE FUND IS REVENUE − EXPENSES (owner, 2026-09-18) ───────────────
   Finance Phase 3 made it cash — money that physically arrived in the month,
   less expenses — on the audit's reading that the owner had chosen that. The
   owner has now seen it and said otherwise: "it shows an amount I don't have
   … it should be revenue − expenses". Cash counts an arrear collected this
   month for last month, and money paid ahead for next month, neither of which
   is this month's revenue, so the card named a figure the owner did not
   recognise. It is revenue − expenses again, everywhere it is shown.

   calcCashReceived() and cashBreakdown() are unchanged — the drawer
   reconciliation (Advance / Arrears) still reads them. calcEarned() is the
   same subtraction under its Phase 3 name and stays for its callers. */
function calcAvailableFund(key) {
  return calcRevenue(key) - calcExpenses(key);
}
function calcEarned(key) {
  return calcRevenue(key) - calcExpenses(key);
}
// The old name. It had no callers left; it keeps the meaning it always had.
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

/* ══ STAYS — WHO LIVED HERE, WHEN, AND IN WHICH ROOM (finance Phase 5, G8) ══

   A student record holds the PRESENT: one room, one status. Every historical
   view needs the past — who was resident in March, and in which room — and
   there was no answer for it, so March's report listed today's residents in
   today's rooms. Students come for a month and go; that is most of a hostel.

   NO NEW TABLE, AND NOTHING GUESSED. The history is already on disk as dated
   events; it was simply never read as history:

     joinDate / leftDate      the stay's two ends
     DB.roomShifts            every move between rooms, dated, from → to
     DB.cancellations         a confirmed departure's vacateDate
     s.pastStays              a finished stay, frozen at re-admission (below)

   studentStays() rebuilds the stays from those records alone. The one place
   the app DESTROYED history — re-admission from Former Students overwrote
   joinDate and blanked leftDate, erasing the first stay — now writes the
   finished stay into s.pastStays before it does (studentCloseStay()).

   WHERE A RECORD IS SILENT, THE RULE IS STATED, NOT INVENTED:
     • no join date     → the earliest the record proves: createdAt or the
                          first month billed (audit G9); a resident with
                          neither counts from the current month only.
     • left, no date    → the confirmed cancellation's vacate date; else the
                          end of the last month billed; else the end of the
                          month they arrived (owner, 2026-09-18: "stay ended").
     • re-admitted before this existed → the earlier stay ends on its
                          confirmed cancellation's vacate date.

   Dates are YYYY-MM-DD; `to` is null while the stay is open.  */

// Statuses under which the student is still living here.
var _RESIDENT_STATUS = { Active: true, Cancelling: true };

function _monthEndDate(mk) {
  var y = Number(mk.slice(0, 4)), m = Number(mk.slice(5, 7));
  return mk + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
}
function _isDate(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d); }
function _day(d)    { return String(d).slice(0, 10); }

// Every month billed to this student, live and archived, oldest first.
function _studentBillMonths(s) {
  var out = [];
  var scan = function (p) {
    if (!p || p.studentId !== s.id) return;
    var k = _payMonthKey(p);
    if (k) out.push(k);
  };
  (DB.payments || []).forEach(scan);
  (DB.archive || []).forEach(function (r) { if (r && r._src === 'payments') scan(r); });
  return out.sort();
}

// Confirmed departures for this student with a vacate date, oldest first.
function _studentVacates(s) {
  return (DB.cancellations || [])
    .filter(function (c) { return c && c.studentId === s.id && c.status === 'Confirmed' && _isDate(c.vacateDate); })
    .sort(function (a, b) { return String(a.vacateDate).localeCompare(String(b.vacateDate)); });
}

function _roomIdByNumber(n) {
  if (n == null || n === '') return null;
  var r = (DB.rooms || []).find(function (x) { return String(x.number) === String(n); });
  return r ? r.id : null;
}

function studentStays(s) {
  if (!s) return [];
  var stays = [];

  (Array.isArray(s.pastStays) ? s.pastStays : []).forEach(function (p) {
    if (p && _isDate(p.from) && _isDate(p.to))
      stays.push({ from: _day(p.from), to: _day(p.to), roomId: p.roomId || _roomIdByNumber(p.roomNumber),
                   roomNumber: p.roomNumber || '', src: 'past' });
  });

  // Scanned only when the dates on the record do not already answer — most
  // students have both, and a report asks this of every student it lists.
  var _b = null, _v = null;
  var bills   = function () { return _b || (_b = _studentBillMonths(s)); };
  var vacates = function () { return _v || (_v = _studentVacates(s)); };
  var resident = !!_RESIDENT_STATUS[s.status];

  // Re-admitted before pastStays existed: the earlier stay is recoverable from
  // the confirmed cancellation that ended it.
  if (!stays.length && s.restoredAt && _isDate(s.joinDate)) {
    var prior = vacates().filter(function (c) { return _day(c.vacateDate) < _day(s.joinDate); }).pop();
    if (prior) {
      var pto = _day(prior.vacateDate);
      var pfrom = bills().filter(function (k) { return k <= pto.slice(0, 7); })[0];
      stays.push({ from: pfrom ? pfrom + '-01' : pto.slice(0, 7) + '-01', to: pto,
                   roomId: _roomIdByNumber(prior.roomNumber), roomNumber: prior.roomNumber || '',
                   src: 'cancellation' });
    }
  }

  var after = stays.reduce(function (m, x) { return x.to > m ? x.to : m; }, '');

  // ── the current (or most recent) stay ──
  var from = _isDate(s.joinDate) ? _day(s.joinDate) : null;
  if (!from) {
    // After any finished stay: a bill in the month a past stay ended belongs
    // to that stay, so this one's evidence starts the month after.
    var afterMonth = after ? after.slice(0, 7) : '';
    var ev = [];
    if (_isDate(s.createdAt) && _day(s.createdAt) > after) ev.push(_day(s.createdAt));
    var firstBill = bills().filter(function (k) { return k > afterMonth; })[0];
    if (firstBill) ev.push(firstBill + '-01');
    from = ev.sort()[0] || (resident ? thisMonth() + '-01' : null);
  }
  if (!from) return stays;

  var to = null;
  if (!resident) {
    var left = s.leftDate || s.leaveDate;
    if (_isDate(left)) to = _day(left);
    if (!to) {
      var v = vacates().filter(function (c) { return _day(c.vacateDate) >= from; }).pop();
      if (v) to = _day(v.vacateDate);
    }
    if (!to) {
      var lastBill = bills().filter(function (k) { return k >= from.slice(0, 7); }).pop();
      to = _monthEndDate(lastBill || from.slice(0, 7));
    }
    if (from > to) from = to;       // entered after the fact: the record, not the stay, is late
  }
  stays.push({ from: from, to: to, roomId: s.roomId || null,
               roomNumber: s.roomNumber || '', src: 'current' });
  return stays.sort(function (a, b) { return a.from.localeCompare(b.from); });
}

// The first and last day of a YYYY-MM month or a YYYY year.
function _periodBounds(mk) {
  var k = String(mk);
  if (k.length === 4) return { first: k + '-01-01', last: k + '-12-31' };
  return { first: k + '-01', last: _monthEndDate(k) };
}

// Bounds of one key, or of a contiguous list of keys (a custom range).
function _boundsOf(mk) {
  if (Array.isArray(mk)) {
    if (!mk.length) return null;
    return { first: _periodBounds(mk[0]).first, last: _periodBounds(mk[mk.length - 1]).last };
  }
  return mk ? _periodBounds(mk) : null;
}

// The stay overlapping period `mk` (a key, or a list of keys), the latest if
// more than one.
function studentStayIn(s, mk) {
  var b = _boundsOf(mk);
  if (!s || !b) return null;
  var hit = null;
  studentStays(s).forEach(function (st) {
    if (st.from <= b.last && (st.to === null || st.to >= b.first)) hit = st;
  });
  return hit;
}

// Was this student on the roster during period `mk` (a YYYY-MM month or a YYYY
// year)? Used by every historical view, which previously listed whoever is
// Active *today* — so a student admitted in August appeared inside July's
// figures as though they had been living there all along.
function _studentInPeriod(s, mk) {
  return !!studentStayIn(s, mk);
}

/* The room a student was in on `date`. A room shift dated D means they slept
   in the new room from D; so on any day before the earliest shift after it,
   they were still in that shift's FROM room. With no later shift inside the
   stay, it is the room the stay ended in. */
function studentRoomAt(s, date) {
  var d = _day(date);
  var st = studentStays(s).filter(function (x) { return x.from <= d && (x.to === null || d <= x.to); }).pop();
  if (!st) return null;
  var later = (DB.roomShifts || [])
    .filter(function (x) {
      return x && String(x.studentId) === String(s.id) && _isDate(x.date)
          && _day(x.date) > d && _day(x.date) >= st.from && (st.to === null || _day(x.date) <= st.to);
    })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  return later.length ? (later[0].fromRoomId || _roomIdByNumber(later[0].fromRoomNumber)) : st.roomId;
}

/* Where this student stood in period `mk`: the room they were in at the END of
   their time in it (the period's last day, or the day they left if sooner),
   and whether they arrived or left inside it. null when not resident then. */
function studentInPeriodInfo(s, mk) {
  var st = studentStayIn(s, mk);
  if (!st) return null;
  var b = _boundsOf(mk);
  var at = (st.to !== null && st.to < b.last) ? st.to : b.last;
  if (at < st.from) at = st.from;
  return {
    stay: st,
    roomId: studentRoomAt(s, at),
    joined: st.from >= b.first && st.from <= b.last,
    left:   st.to !== null && st.to >= b.first && st.to <= b.last,
  };
}

/* The room a student was in during period `mk`, for any month view's roster.
   From the stays; for a student whose stay is silent but who was billed for
   the period, the room that bill was raised against. Null when neither says —
   never today's room passed off as that month's. */
function studentRoomIn(s, mk) {
  var info = studentInPeriodInfo(s, mk);
  if (info && info.roomId) return info.roomId;
  var archived = (DB.archive || []).filter(function (r) { return r && r._src === 'payments'; });
  var bill = (DB.payments || []).concat(archived).filter(function (p) {
    return p && p.studentId === s.id && _payMatchesMonth(p, mk);
  }).pop();
  return bill ? (bill.roomId || _roomIdByNumber(bill.roomNumber)) : null;
}

/* THE ONE WRITE. Re-admission reuses the student record, and without this the
   finished stay is overwritten out of existence. Call it BEFORE joinDate,
   leftDate or roomId change for a new stay. */
function studentCloseStay(s) {
  if (!s) return;
  var cur = studentStays(s).filter(function (x) { return x.src === 'current' || x.src === 'cancellation'; });
  if (!Array.isArray(s.pastStays)) s.pastStays = [];
  cur.forEach(function (st) {
    if (st.to === null) return;
    if (s.pastStays.some(function (p) { return p && p.from === st.from && p.to === st.to; })) return;
    var r = (DB.rooms || []).find(function (x) { return x.id === st.roomId; });
    s.pastStays.push({ from: st.from, to: st.to, roomId: st.roomId || null,
                       roomNumber: r ? String(r.number) : String(st.roomNumber || '') });
  });
}
// ─────────────────────────────────────────────────────────────────────────────
