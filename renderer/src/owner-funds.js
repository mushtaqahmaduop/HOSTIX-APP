/* ─── HOSTYLLO — OWNER FUNDS (step 1: the rules, no screens) ─────────────────

   Money moving between the hostel and its owner, in both directions (client
   brief docs: Hostyllo_Owner_Funds_Discovery.md; plan agreed 2026-09-28):

     in   the owner GAVE money to the hostel — it ran short, had no budget, an
          emergency, or the owner invested in it.
     out  the owner TOOK money from the hostel — pocket money, an investment of
          his own, his own bill.

   ── WHAT THIS IS NOT ────────────────────────────────────────────────────────

   Not revenue and not an expense. Nothing here is read by calcRevenue(),
   calcExpenses(), calcAvailableFund() or any report total, and nothing here
   reads a payment or an expense record. The month's profit/loss stays exactly
   what it is; owner money is shown BESIDE it (ofStatement), never inside it:

       Revenue − Expenses          = Profit / Loss        (unchanged)
       + owner gave − owner took   = Hostel money after owner movements

   No balance carries from one month to the next (owner, 2026-09-28): every
   figure is the selected period's own.

   ── ONE RECORD PER MOVEMENT ─────────────────────────────────────────────────

   One direction, one amount, one method. A movement paid partly in cash and
   partly by bank is two records — the same rule payments follow, so per-method
   totals stay true.

   NEVER DELETED, NEVER EDITED IN ITS MONEY. A mistake is REVERSED with a
   reason (ofReverse): the record stays, marked reversed, and stops counting in
   every total. A reversal means "this never happened", so it leaves the month
   the movement was dated in, not the month of the reversal — the same meaning
   a payment correction has.

   Persistence is the caller's: these functions change DB.ownerFunds in memory
   and the screen that called them runs saveDB(), exactly as finance.js does.
   Plain function declarations, no module syntax — this runs in the browser and
   in the vm sandbox of tests/owner-funds.test.js.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const OF_IN  = 'in';
const OF_OUT = 'out';

/* The categories agreed with the owner, 2026-09-28. Keys are stored and never
   change; labels are what a screen prints. Keys are unique ACROSS directions,
   so a stored category can never be read under the wrong one. */
const OF_CATEGORIES = Object.freeze({
  in: Object.freeze([
    { key: 'shortfall',      label: 'Low budget / shortfall' },
    { key: 'emergency',      label: 'Emergency (no funds)' },
    { key: 'investment_in',  label: 'Investment in the hostel' },
    { key: 'other_in',       label: 'Other' },
  ]),
  out: Object.freeze([
    { key: 'pocket',         label: 'Pocket money' },
    { key: 'investment_out', label: 'Investment' },
    { key: 'own_bill',       label: "Owner's own bill" },
    { key: 'other_out',      label: 'Other' },
  ]),
});

const OF_NOTE_MAX   = 250;
const OF_REF_MAX    = 40;
const OF_METHOD_MAX = 40;

function _ofList() {
  if (typeof DB === 'undefined' || !DB) return [];
  if (!Array.isArray(DB.ownerFunds)) DB.ownerFunds = [];
  return DB.ownerFunds;
}
function _ofActor() {
  const u = (typeof CUR_USER !== 'undefined' && CUR_USER) ? CUR_USER : null;
  const r = (typeof CUR_ROLE !== 'undefined' && CUR_ROLE) ? CUR_ROLE : null;
  return { by: r || null, byName: (u && u.name) || '' };
}
function _ofText(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}
function _ofIsDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

/* ── WHO MAY, AND WHERE (step 2) ─────────────────────────────────────────────
   Two gates, both required:
     · the HOSTEL has the feature — an opt-in control-plane flag, OFF unless
       the owner switched it on for this hostel (enforcement-ui.js);
     · the ACCOUNT has the "Owner funds" permission (auth-nev.js), which an
       update gives only to accounts that manage users.
   The screens check these before they draw anything; ofAdd and ofReverse check
   them again, so a control that slipped past a screen still cannot write.
   Outside the app (the unit tests) neither helper exists and both pass. */
function ofEnabled() {
  return typeof hasFeature !== 'function' || hasFeature('ownerFunds');
}
function ofAllowed() {
  return ofEnabled() && (typeof canDo !== 'function' || canDo('ownerFunds'));
}
function _ofGate() {
  if (!ofEnabled()) return { ok: false, field: null, reason: 'Owner Funds is not switched on for this hostel' };
  if (typeof canDo === 'function' && !canDo('ownerFunds'))
    return { ok: false, field: null, reason: 'Your account does not have permission for owner funds' };
  return null;
}

/** Direction label for a screen. */
function ofDirectionLabel(dir) {
  return dir === OF_IN ? 'Owner gave to hostel'
       : dir === OF_OUT ? 'Owner took from hostel' : '—';
}

/** The category's label, or the stored key if it is one this build does not know. */
function ofCategoryLabel(key) {
  for (const d of [OF_IN, OF_OUT]) {
    const c = OF_CATEGORIES[d].find(x => x.key === key);
    if (c) return c.label;
  }
  return String(key || '—');
}

/** Which direction a category belongs to, or null. */
function ofCategoryDirection(key) {
  if (OF_CATEGORIES.in.some(c => c.key === key))  return OF_IN;
  if (OF_CATEGORIES.out.some(c => c.key === key)) return OF_OUT;
  return null;
}

/**
 * Check a movement before it is written. Returns {ok:true, value} with the
 * cleaned fields, or {ok:false, field, reason} naming the first thing wrong,
 * in words a warden can act on.
 */
function ofValidate(input) {
  const i = input || {};
  const fail = (field, reason) => ({ ok: false, field, reason });

  const direction = i.direction === OF_IN || i.direction === OF_OUT ? i.direction : null;
  if (!direction) return fail('direction', 'Say whether the owner gave money or took it');

  const raw = typeof i.amount === 'string' ? i.amount.trim() : i.amount;
  const n = Number(raw);
  if (raw === '' || raw == null || !isFinite(n)) return fail('amount', 'Enter the amount');
  if (n <= 0)                 return fail('amount', 'Enter an amount greater than zero');
  if (Math.round(n) !== n)    return fail('amount', 'Enter whole rupees');
  if (typeof MONEY_SAFE_MAX !== 'undefined' && n > MONEY_SAFE_MAX)
    return fail('amount', 'That amount is too large');

  const category = String(i.category || '');
  if (!category) return fail('category', 'Pick what the money was for');
  if (ofCategoryDirection(category) !== direction)
    return fail('category', 'That reason does not match the direction of the money');

  const date = String(i.date || '');
  if (!_ofIsDate(date)) return fail('date', 'Pick a valid date');

  const method = _ofText(i.method || 'Cash', OF_METHOD_MAX) || 'Cash';

  const noteRaw = String(i.note == null ? '' : i.note).trim();
  if (noteRaw.length > OF_NOTE_MAX) return fail('note', 'The note is longer than ' + OF_NOTE_MAX + ' characters');

  return {
    ok: true,
    value: {
      direction, amount: n, category, date, method,
      note: noteRaw,
      refNo: _ofText(i.refNo, OF_REF_MAX),
      receipt: i.receipt && typeof i.receipt === 'object' ? i.receipt : null,
    },
  };
}

/**
 * Record a movement. Validates, builds the record, adds it to DB.ownerFunds and
 * writes the activity log. The caller saves.
 *   → {ok:true, record} | {ok:false, field, reason}
 */
function ofAdd(input) {
  const gate = _ofGate();
  if (gate) return gate;
  const v = ofValidate(input);
  if (!v.ok) return v;
  const who = _ofActor();
  const rec = {
    id: 'of_' + (typeof uid === 'function' ? uid() : Date.now().toString(36)),
    direction: v.value.direction,
    amount:    v.value.amount,
    category:  v.value.category,
    date:      v.value.date,
    method:    v.value.method,
    createdAt: new Date().toISOString(),
    createdBy: who.by,
    createdByName: who.byName,
  };
  // Absent rather than '' — every reader treats a missing key as "none".
  if (v.value.note)    rec.note    = v.value.note;
  if (v.value.refNo)   rec.refNo   = v.value.refNo;
  if (v.value.receipt) rec.receipt = v.value.receipt;

  _ofList().push(rec);
  if (typeof logActivity === 'function') {
    logActivity(rec.direction === OF_IN ? 'Owner Funds In' : 'Owner Funds Out',
      ofDirectionLabel(rec.direction) + ' — ' + ofCategoryLabel(rec.category) + ' · ' +
      (typeof fmtPKR === 'function' ? fmtPKR(rec.amount) : 'Rs. ' + rec.amount), 'Finance');
  }
  return { ok: true, record: rec };
}

/** Find a movement by id. */
function ofFind(id) {
  return _ofList().find(r => r && r.id === id) || null;
}

/** A record that still counts: present and not reversed. */
function ofIsLive(rec) {
  return !!rec && !rec.reversed;
}

/**
 * Reverse a mistaken movement. The record stays, marked reversed with who,
 * when and why, and stops counting everywhere. A reason is required; a
 * movement is reversed once.
 *   → {ok:true, record} | {ok:false, reason}
 */
function ofReverse(recOrId, opts) {
  const gate = _ofGate();
  if (gate) return { ok: false, reason: gate.reason };
  const rec = typeof recOrId === 'string' ? ofFind(recOrId) : recOrId;
  if (!rec)          return { ok: false, reason: 'That movement no longer exists' };
  if (rec.reversed)  return { ok: false, reason: 'This movement is already reversed' };
  const o = opts || {};
  const reason = _ofText(o.reason, OF_NOTE_MAX);
  if (!reason) return { ok: false, reason: 'Give a reason for the reversal' };
  const date = o.date || (typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10));
  if (!_ofIsDate(date)) return { ok: false, reason: 'Pick a valid date' };
  const who = _ofActor();
  rec.reversed = { date, reason, by: who.by, byName: who.byName, at: new Date().toISOString() };
  if (typeof logActivity === 'function') {
    logActivity('Owner Funds Reversed',
      ofDirectionLabel(rec.direction) + ' — ' +
      (typeof fmtPKR === 'function' ? fmtPKR(rec.amount) : 'Rs. ' + rec.amount) +
      ' on ' + rec.date + ' reversed: ' + reason, 'Finance');
  }
  return { ok: true, record: rec };
}

/** Does this record fall in `key`? '' = all time, 'YYYY' = a year, 'YYYY-MM' = a month. */
function ofInScope(rec, key) {
  if (!rec) return false;
  if (!key) return true;
  return String(rec.date || '').indexOf(String(key)) === 0;
}

/** The movements in scope, newest first (by date, then when recorded). */
function ofListFor(key, opts) {
  const withReversed = !!(opts && opts.withReversed);
  return _ofList()
    .filter(r => ofInScope(r, key) && (withReversed || ofIsLive(r)))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) ||
                    String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/**
 * Totals for a period, over live records only.
 *   in, out     what the owner gave / took
 *   net         in − out ("Net owner funding"; positive = the owner has put in
 *               more than he took). NOT an amount owed by anyone.
 *   count       live movements; reversed = how many were reversed
 *   byCategory  { key: amount }
 */
function ofTotals(key, list) {
  const src = Array.isArray(list) ? list : _ofList();
  const t = { in: 0, out: 0, net: 0, count: 0, reversed: 0, byCategory: {} };
  for (const r of src) {
    if (!ofInScope(r, key)) continue;
    if (!ofIsLive(r)) { t.reversed++; continue; }
    const amt = typeof money === 'function' ? money(r.amount) : Number(r.amount) || 0;
    if (r.direction === OF_IN) t.in += amt;
    else if (r.direction === OF_OUT) t.out += amt;
    else continue;
    t.count++;
    t.byCategory[r.category] = (t.byCategory[r.category] || 0) + amt;
  }
  t.net = t.in - t.out;
  return t;
}

/* Revenue and expenses for a period from the app's own authorities. A year is
   the sum of its months, because calcRevenue() matches one month at a time. */
function _ofPeriodFigures(key) {
  const hasCalc = typeof calcRevenue === 'function' && typeof calcExpenses === 'function';
  if (!hasCalc || !key) return null;
  const months = /^\d{4}$/.test(key)
    ? Array.from({ length: 12 }, (_, i) => key + '-' + String(i + 1).padStart(2, '0'))
    : [key];
  let revenue = 0, expenses = 0;
  for (const m of months) { revenue += calcRevenue(m); expenses += calcExpenses(m); }
  return { revenue, expenses };
}

/**
 * The period statement the Owner Funds page and the reports print:
 *
 *   revenue − expenses          = result       (profit / loss, unchanged)
 *   + ownerIn − ownerOut        = afterOwner   (hostel money after owner)
 *
 * `figures` ({revenue, expenses}) may be passed in; otherwise they are read
 * from calcRevenue()/calcExpenses(). With neither available (all time, or no
 * period helpers loaded) revenue, expenses and result are null and only the
 * owner lines are stated — a statement never invents a figure.
 */
function ofStatement(key, figures) {
  const f = figures || _ofPeriodFigures(key);
  const t = ofTotals(key);
  const revenue  = f ? Number(f.revenue)  || 0 : null;
  const expenses = f ? Number(f.expenses) || 0 : null;
  const result   = f ? revenue - expenses : null;
  return {
    key: key || '',
    revenue, expenses, result,
    ownerIn: t.in, ownerOut: t.out, ownerNet: t.net,
    afterOwner: f ? result + t.net : null,
    count: t.count, reversed: t.reversed, byCategory: t.byCategory,
  };
}
