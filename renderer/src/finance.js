/* ─── HOSTYLLO — FINANCIAL INTEGRITY LAYER (spec §14) ─────────────────────────

   §14 asks for ONE authoritative financial calculation layer and names six
   functions for it. Two of them already existed and are already proven, so this
   file does NOT reimplement them — `calculateCharges()` and
   `calculateOutstanding()` call `resolveCharges()` and `outstandingOf()` in
   utils.js and nothing else. That is deliberate. D-1 was 52 call sites each
   answering "what is owed" its own way; a second implementation here, however
   careful, would be the 53rd. The §14 name and the existing answer have to be
   the same function or the layer is not authoritative.

   The other four did not exist at all:

     applyPayment()          collection was inlined in five places in payments.js
     reversePayment()        there was no way to undo a collection
     calculateRefund()       nothing computed money owed BACK
     calculateReportTotals() the report figures existed but were not one thing

   ── THE MONEY REPRESENTATION ────────────────────────────────────────────────

   §14: "Do not introduce binary floating-point financial calculations."

   The canonical unit is ONE WHOLE PAKISTANI RUPEE, held as a JavaScript integer.
   That satisfies §14 without a storage migration, and the reason is arithmetic
   rather than convenience: IEEE-754 doubles represent every integer up to 2^53
   EXACTLY. `0.1 + 0.2 !== 0.3` because tenths are not representable in binary —
   but 8000 + 6500 is exact, and so is every sum of integers this app will ever
   hold. The floating-point hazard is not the double, it is the fraction. Remove
   the fraction and the hazard goes with it.

   So the rule is: money enters through `money()`, which rounds it to an integer
   ONCE, at the boundary. After that every +, − and comparison is exact, and no
   binary fraction exists anywhere in the layer to be wrong later. The only
   operation that can produce a fraction is multiplication (a percentage), and
   `moneyPct()` is the one place it happens.

   Rejected: integer paisa. It is the textbook answer and it is the wrong answer
   here — PKR paisa is defunct, nothing in the app bills or displays a sub-rupee
   figure, and it would be a schema migration across 50+ live installs plus a
   conversion at every one of ~200 read sites. If sub-rupee currency is ever
   needed, THIS is the file to change: make MONEY_SCALE 100, and the call sites
   keep working because they already all go through money().

   ── ROUNDING: HALF AWAY FROM ZERO ───────────────────────────────────────────

   Not `Math.round()`. `Math.round(-0.5)` is -0, because it rounds toward +∞ —
   so `Math.round(-x) !== -Math.round(x)` at every half. That asymmetry would be
   a live bug in this file specifically: reversePayment() negates amounts, and a
   reversal that does not exactly undo its collection leaves a rupee behind on
   the record forever. Half-away-from-zero is symmetric, so reversing is exact.

   ── OVERPAYMENT: RECORDED AS A CREDIT, NEVER SWALLOWED ──────────────────────

   Every write path used to end in `Math.max(0, due - paid)`. A warden handing
   over a round 15,000 against a 14,500 bill produced a balance of 0 and 500
   rupees recorded NOWHERE — not owed, not refundable, not in any report.

   Now the balance still floors at 0 (every screen reads outstandingOf(), and
   negative balances would have to be understood by all 52 of them), but the
   excess is written to `p.overpaid` and is what calculateRefund() returns. The
   money stays on the books until someone decides where it goes.

   ── WHAT THIS FILE MAY ASSUME ───────────────────────────────────────────────

   Loaded after config.js and utils.js, so `DB`, `resolveCharges()`,
   `outstandingOf()` and `today()` exist. Plain function declarations, no module
   syntax — it has to run both in the browser and inside the `vm` sandbox that
   tests/finance.test.js builds.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* Integers stay exact to 2^53 − 1. Past that, `x + 1 === x` and a total starts
   silently absorbing rupees — so the layer reports when a figure has left the
   exact range rather than printing a number it cannot stand behind. Nothing is
   clamped: clamping would MIS-STATE a figure, which is worse than flagging it. */
const MONEY_SAFE_MAX = Number.MAX_SAFE_INTEGER;   // 9,007,199,254,740,991

/** Canonical money: a whole rupee, as an exact integer. The one entry point. */
function money(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return 0;              // '', null, 'abc', NaN, ±∞
  if (Number.isInteger(n)) return n;              // already canonical, and exact
  // Half away from zero — symmetric, so money(-x) === -money(x) at every half.
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Is this figure still in the range where integer arithmetic is exact? */
function moneyIsSafe(v) {
  return Number.isFinite(v) && Math.abs(v) <= MONEY_SAFE_MAX;
}

/** Sum a list of money values. Every term is normalised, so the sum is exact. */
function moneySum(list, get) {
  const f = typeof get === 'function' ? get : (x => x);
  let t = 0;
  for (let i = 0; i < (list || []).length; i++) t += money(f(list[i], i));
  return t;
}

/* The ONLY multiplication in the layer, and therefore the only place a binary
   fraction can appear. It is created and destroyed inside this function: the
   product is rounded back to a whole rupee before it can be stored, summed or
   compared against anything. A percentage concession is the live caller. */
function moneyPct(base, pct) {
  const b = money(base);
  const p = Number(pct);
  if (!Number.isFinite(p) || b === 0) return 0;
  return money(b * p / 100);
}

/* ── §14 · calculateCharges ───────────────────────────────────────────────────
   What this student is billed per month, from settings — the charge authority.
   resolveCharges() already is that authority and is what every screen calls, so
   this is its §14 name and not a second opinion. The money fields are put
   through money() on the way out: a rent typed as 8000.4 into Settings should
   not reach a bill as 8000.4, and this is the boundary where it stops.        */
function calculateCharges(student, opts) {
  const c = resolveCharges(student, opts);
  return Object.assign({}, c, {
    rent:       money(c.rent),
    mess:       money(c.mess),
    messBilled: money(c.messBilled),
    total:      money(c.rent) + money(c.messBilled),
  });
}

/* ── §14 · calculateOutstanding ───────────────────────────────────────────────
   What is still owed on one payment record. outstandingOf() is the single
   answer D-1 established across 52 call sites and is proven by
   tests/outstanding.test.js; this is its §14 name. money() is applied because a
   legacy record can carry `unpaid: 4500.5` from a percentage concession written
   before there was a rounding policy.                                         */
function calculateOutstanding(p) {
  return money(outstandingOf(p));
}

/* ── THE BILL ─────────────────────────────────────────────────────────────────
   rent + mess + extras + admission fee − concession, floored at 0.

   This expression was written out by hand in FIVE places in payments.js, and
   they had already drifted: the merge-into-existing-pending path at :1778
   computed `monthlyRent − paid` and dropped mess, extras, the admission fee and
   the concession outright — so at a bundled hostel, merging a payment into an
   existing pending record understated the balance by the entire mess charge.
   The neighbouring path at :2480 had had exactly that bug and carries a comment
   about fixing it; this copy was missed. Two copies of one expression is how
   that happens, so now there is one.

   Floored at 0 because a concession larger than the charge is a free month, not
   a debt the hostel owes the student. Money genuinely owed BACK is
   calculateRefund(), and it comes from over-collection, not from over-discount. */
function calculateBill(rec) {
  const r = rec || {};
  const messOn = r.messIncluded !== false;
  const extras = r.extraTotal != null
    ? money(r.extraTotal)
    : moneySum(r.extraCharges, c => c && c.amount);

  return Math.max(0,
      money(r.monthlyRent != null ? r.monthlyRent : r.rent)
    + (messOn ? money(r.messCharge != null ? r.messCharge : r.mess) : 0)
    + extras
    + money(r.admissionFee != null ? r.admissionFee : r.fee)
    - money(r.concession   != null ? r.concession   : r.discount));
}

/* ── §14 · applyPayment ───────────────────────────────────────────────────────
   Collect money against a record. Every collection in the app goes through
   here: the Add Payment form, the Edit form, the single-row Mark Paid, the bulk
   settle, and the arrears allocator.

   THE BUG THIS CLOSES, and it is the write-side tail of D-1. All three
   "mark this paid" paths read the balance as `Number(p.unpaid) || 0`. On a
   record written before `unpaid` existed that is 0 — so pressing Mark Paid on a
   legacy debtor collected NOTHING, stamped it Paid, and removed it from the
   arrears list. The debt did not get settled; it got deleted. This function
   reads calculateOutstanding(), which is the whole point of there being one.

   MUTATES `p`, because every caller in this codebase mutates DB records in
   place and then awaits saveDB(). Returns a summary of what it did so the
   caller can log, toast and print a receipt from facts rather than recomputing.

   CONSERVATION. `p.amount` is the total collected on the record — dashboard.js
   `_cashEvents()` distributes exactly that figure across months, so the whole
   collected amount lands in it, overpayment included. Anything less and the
   cash reconciliation loses the difference.                                    */
function applyPayment(p, opts) {
  const o = opts || {};
  const amount = money(o.amount);

  if (!p)          return { ok: false, reason: 'no-record', applied: 0, credit: 0 };
  if (amount <= 0) return { ok: false, reason: 'non-positive', applied: 0, credit: 0 };

  const dueBefore  = calculateOutstanding(p);
  const paidBefore = money(p.amount);

  const applied = Math.min(amount, dueBefore);   // what settles the bill
  const credit  = amount - applied;              // what overshoots it

  const date = o.date || (typeof today === 'function' ? today() : '');

  p.amount   = paidBefore + amount;
  p.unpaid   = dueBefore - applied;
  /* Written even when it is 0, and that matters. `overpaid` present means this
     layer has observed every collection on the record, so calculateRefund()
     answers from it and stops deriving. Written only when non-zero, a record
     settled exactly would keep falling through to the derived path — and a bill
     corrected downwards afterwards would then read as a refund the hostel owes.
     Same convention as `unpaid`: once recorded, the record is the answer. */
  p.overpaid = money(p.overpaid) + credit;
  p.status   = p.unpaid > 0 ? 'Pending' : 'Paid';
  p.paidDate = p.status === 'Paid' ? date : '';
  p.method   = o.method || p.method || 'Cash';

  /* The instalment trail. Its entries carry their own dates, which is what lets
     a record part-paid in July and cleared in August be two cash events in two
     months rather than one lump on whichever date the record happens to hold. */
  if (!Array.isArray(p.partialPayments)) p.partialPayments = [];
  const entry = {
    date, amount, method: p.method,
    collectedBy: o.collectedBy ||
      ((typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Warden'),
    note: o.note || 'Collected',
  };
  p.partialPayments.push(entry);

  return {
    ok: true, applied, credit, entry,
    before: { paid: paidBefore, due: dueBefore },
    after:  { paid: p.amount, due: p.unpaid, status: p.status, credit: money(p.overpaid) },
  };
}

/* ── §14 · reversePayment ─────────────────────────────────────────────────────
   Undo a collection. A warden mis-keys 15,000 for 1,500 and, until now, the
   only remedy was to edit the record — which overwrites the trail and leaves
   nothing saying a mistake was ever made. A reversal is a fact about money and
   belongs on the record as one.

   `amount` omitted reverses the whole collection.

   ORDER: credit first, then the applied balance. Reversing the 15,000 taken
   against a 14,500 bill has to take back the 500 credit before it starts
   re-opening the debt, or the record ends up simultaneously owing money and
   holding a refundable credit — from one keystroke being undone.

   NEVER more than was collected. A reversal larger than `p.amount` would drive
   the record's collected total negative and invent money on the way out.

   The reversal is stored in `p.reversals`, NOT as a negative entry in
   partialPayments — `_cashEvents()` filters that array to positive amounts when
   it dates cash but sums it whole when it sanity-checks, so a negative entry
   there would break the conservation guarantee it is built on. dashboard.js
   reads `p.reversals` as its own (negative) cash events, which is also more
   truthful: the money left the drawer on the day it was handed back.          */
function reversePayment(p, opts) {
  const o = opts || {};

  if (!p) return { ok: false, reason: 'no-record', reversed: 0 };

  const collected = money(p.amount);
  if (collected <= 0) return { ok: false, reason: 'nothing-collected', reversed: 0 };

  const amount = o.amount == null ? collected : money(o.amount);
  if (amount <= 0)         return { ok: false, reason: 'non-positive', reversed: 0 };
  if (amount > collected)  return { ok: false, reason: 'exceeds-collected', reversed: 0,
                                    max: collected };

  const creditBefore = money(p.overpaid);
  const fromCredit   = Math.min(amount, creditBefore);
  const fromApplied  = amount - fromCredit;

  const date = o.date || (typeof today === 'function' ? today() : '');

  p.amount   = collected - amount;
  p.overpaid = creditBefore - fromCredit;
  p.unpaid   = money(p.unpaid) + fromApplied;
  p.status   = p.unpaid > 0 ? 'Pending' : 'Paid';
  p.paidDate = p.status === 'Paid' ? (p.paidDate || date) : '';

  if (!Array.isArray(p.reversals)) p.reversals = [];
  const entry = {
    date, amount,
    method: o.method || p.method || 'Cash',
    reason: String(o.reason || '').trim(),
    by: o.by ||
      ((typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Warden'),
  };
  p.reversals.push(entry);

  return {
    ok: true, reversed: amount, fromCredit, fromApplied, entry,
    before: { paid: collected, credit: creditBefore },
    after:  { paid: p.amount, due: p.unpaid, status: p.status, credit: p.overpaid },
  };
}

/* ── §14 · calculateRefund ────────────────────────────────────────────────────
   Money owed BACK on one record: what was collected beyond the bill.

   It is deliberately NOT "bill − collected, if negative". A record's bill can
   be edited after the fact — correcting a rent downwards would then invent a
   refund out of a correction. The credit is what applyPayment() actually
   observed arriving in excess, recorded at the moment it arrived, so a refund
   traces to a real over-collection and nothing else.

   Legacy records carry no `overpaid`, so one is derived for them the only way
   available — collected minus the bill — and flagged `derived`. A screen
   offering to hand cash back should say which of the two it is looking at.    */
function calculateRefund(p) {
  if (!p) return { refundable: 0, recorded: 0, derived: false, reason: 'no-record' };

  const recorded = money(p.overpaid);
  if (recorded > 0) {
    return { refundable: recorded, recorded, derived: false, reason: 'overpaid' };
  }
  if (p.overpaid != null) {
    return { refundable: 0, recorded: 0, derived: false, reason: 'none' };
  }

  const over = money(p.amount) - calculateBill(p);
  return over > 0
    ? { refundable: over, recorded: 0, derived: true, reason: 'derived-overpaid' }
    : { refundable: 0,    recorded: 0, derived: false, reason: 'none' };
}

/* ── CHECKOUT / CANCELLATION SETTLEMENT (§14's "cancellations, checkout") ─────
   What changes hands when a student leaves. Every record they hold, netted:
   arrears owed in, credits owed out, and which way the difference goes.

   THERE IS NO PRO-RATA HERE, and that is a decision rather than an omission.
   A student leaving on the 12th has no daily rate anywhere in this product —
   not in settings, not on the room type, not on the student. Computing one
   would put a number on the settlement screen that the hostel never agreed to,
   and a departing student is exactly the wrong person to hand an invented
   figure to. The settlement is arithmetic over records that already exist.
   If a hostel ever gets a pro-rata rule, it belongs in Settings first and
   arrives here as a real charge on a real record, not as a rate improvised at
   checkout.

   Records are counted whatever their status: a Paid record carrying a balance
   is reachable (the Edit form's status dropdown is free while the balance
   beside it is readonly) and that balance is money someone is owed. Same
   ordering rule as outstandingOf().                                           */
function calculateSettlement(studentId, opts) {
  const o    = opts || {};
  const list = (o.payments || (typeof DB !== 'undefined' && DB.payments) || [])
    .filter(p => p && p.studentId === studentId);

  const lines = list.map(p => {
    const outstanding = calculateOutstanding(p);
    const refund      = calculateRefund(p);
    return {
      paymentId:  p.id || '',
      month:      p.month || '',
      billed:     calculateBill(p),
      collected:  money(p.amount),
      outstanding,
      credit:     refund.refundable,
      creditIsDerived: refund.derived,
    };
  });

  const outstanding = moneySum(lines, l => l.outstanding);
  const credit      = moneySum(lines, l => l.credit);
  const net         = outstanding - credit;

  return {
    studentId,
    records:   lines.length,
    billed:    moneySum(lines, l => l.billed),
    collected: moneySum(lines, l => l.collected),
    outstanding, credit, net,
    /* One word for what the warden does next. `net` is signed and easy to read
       backwards at a counter; this is not. */
    action: net > 0 ? 'collect' : net < 0 ? 'refund' : 'settled',
    amount: Math.abs(net),
    lines,
  };
}

/* ── §14 · calculateReportTotals ──────────────────────────────────────────────
   The figures every report, CSV, PDF and card is answerable to. §14: "Reports
   must reconcile against the same financial authority."

   `collected` is the sum of `p.amount` over the given records — the same rupees
   dashboard.js `_cashEvents()` distributes across months, so a report total and
   the cash reconciliation cannot disagree about how much money exists. They
   answer different questions (this one "how much on these records", that one
   "in which month did it arrive") from one figure.

   `safe` is false when a total has left the range where integer arithmetic is
   exact. A caller that prints a figure without checking it is printing a number
   the layer will not vouch for — which, on a hostel's books, is the one thing
   worse than printing nothing.                                                */
function calculateReportTotals(payments, opts) {
  const o    = opts || {};
  const list = (payments || []).filter(p => p && (!o.filter || o.filter(p)));

  const t = {
    count:         list.length,
    billed:        0,
    collected:     0,
    outstanding:   0,
    credit:        0,
    concessions:   0,
    extras:        0,
    admissionFees: 0,
    reversed:      0,
  };

  for (const p of list) {
    t.billed        += calculateBill(p);
    t.collected     += money(p.amount);
    t.outstanding   += calculateOutstanding(p);
    t.credit        += calculateRefund(p).refundable;
    t.concessions   += money(p.concession != null ? p.concession : p.discount);
    t.extras        += p.extraTotal != null ? money(p.extraTotal)
                                            : moneySum(p.extraCharges, c => c && c.amount);
    t.admissionFees += money(p.admissionFee != null ? p.admissionFee : p.fee);
    t.reversed      += moneySum(p.reversals, r => r && r.amount);
  }

  t.safe = Object.keys(t).every(k => k === 'count' || moneyIsSafe(t[k]));
  return t;
}
