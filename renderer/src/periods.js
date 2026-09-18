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
/* ── AVAILABLE FUND IS CASH (finance Phase 3, owner 2026-09-18) ─────────────
   It was calcRevenue − calcExpenses: ACCRUAL revenue (what the month's bills
   earned, whenever the money came) minus CASH expenses (what went out of the
   till that month). Two bases in one number, printed under a name — "Available
   Fund" — that a hostel owner reads as "what I have". The finance spec (§14)
   forbids exactly that, and so did the arithmetic: July's rent collected in
   August raised July's fund and lowered August's drawer.

   Two figures now, each on one basis, each with its own name:

     calcAvailableFund  cash received − expenses          (what is in hand)
     calcEarned         what the bills earned − expenses  (accrual result)

   Cash received is net of refunds and reversals already — see
   calcCashReceivedIn(). Every screen that says "Available Fund" reads the first;
   anything that means the second says "Earned". */
function calcAvailableFund(key) {
  return calcCashReceived(key) - calcExpenses(key);
}
function calcEarned(key) {
  return calcRevenue(key) - calcExpenses(key);
}
// The old name. It had no callers left; it keeps the meaning it always had.
function calcProfit(key) { return calcEarned(key); }
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
