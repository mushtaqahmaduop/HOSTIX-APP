/* ─── HOSTYLLO — THE STUDENT LEDGER (warden ledger spec §2.1, §5 step 2) ───────

   Every charge, collection, concession and correction on a student becomes one
   entry that is never edited or deleted. The approved schema and every owner
   answer behind this file are in docs/WARDEN_LEDGER_SCHEMA_PROPOSAL.md; the
   table and its guards are migrations/002-student-ledger.js.

   ── ALONGSIDE THE MONTH RECORDS, NOT INSTEAD OF THEM (schema Q1) ────────────

   Payments stay one record per student per month, and all 52 screens keep
   reading them. The ledger is posted FROM those records: a site that creates,
   changes or deletes a month record calls ledgerTrack(p) afterwards, and this
   file posts whatever the record now says that the ledger has not yet heard.

   That is a diff, and it is why the call is safe to make anywhere and twice:
   a record that has not changed posts nothing. What is compared, per record:

     part            record field(s)                     posted as
     ─────────────   ─────────────────────────────────   ──────────────────────
     monthly         the rest of what the month bills    charge, then adjustment
     admission       admissionFee                        charge, then adjustment
     extra:<label>   one extraCharges line               charge, then adjustment
     concession      concession (capped at the charges)  concession / adjustment
     instalment      each new partialPayments entry      payment
     collected       amount not explained by the trail   payment / adjustment
     reversal        each new reversals entry            adjustment (+)
     deleted         the record was deleted              adjustment (− its net)

   A figure's FIRST posting is a charge or concession with its own reason. A
   later change to it is an adjustment whose reason says what changed from what
   (owner, 2026-09-14: "Adjustment entry, auto reason").

   WHAT A MONTH BILLS is not re-added from its fields. It is what the Payments
   page already says — calculateOutstanding() plus what was collected, less any
   credit calculateRefund() holds — with the admission fee and the named extras
   split out of it. Records whose stored balance disagrees with their own rent
   fields exist in the field, and every screen believes the balance; a ledger
   that believed the fields would be a second answer to "what is owed", which
   finance.js exists to prevent.

   ── THE BALANCE ─────────────────────────────────────────────────────────────

   charge +, payment −, concession −, adjustment ± its signed amount.
   `runningBalance` is the student's balance after the entry, in the order the
   entries were created (schema Q5) — so it is stored at insert, never
   recomputed, exactly as the spec's receipt example reads it. It may go below
   zero: that is money held for the student, which a month record calls
   `overpaid`.

   ── WHAT STAYS OUT ──────────────────────────────────────────────────────────

   A payment typed against a manual name has no student, and the ledger is per
   student (owner, 2026-09-14: leave them out). ledgerTrack() returns nothing.

   ── PERSISTENCE ─────────────────────────────────────────────────────────────

   Entries go into DB.studentLedger at once and into a queue; saveDB() hands the
   queue to the main process (ledger:append) with the rest of the save. The
   ledger is NOT in storage.js's _TABLE_MAP on purpose: that path upserts and
   deletes, and the main process refuses both for this table.

   ── THE ONE-TIME IMPORT (schema Q17) ────────────────────────────────────────

   An install that already has payment history starts with an empty ledger.
   ledgerImportIfEmpty() posts that history once, in date order, marked
   `imported`, with no account id (the collector is only a name on old records).
   Until it has run, ledgerTrack() does nothing — otherwise a start-up repair
   would post a handful of entries first, and the import would then see a
   non-empty ledger and never run.

   Plain function declarations, no module syntax: it runs in the browser and in
   the `vm` sandbox tests/ledger.test.js builds, like finance.js.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

let _ledgerUnsaved   = [];          // posted in memory, not yet on disk
let _ledgerBalances  = new Map();   // studentId -> balance after its latest entry
let _ledgerByRecord  = new Map();   // paymentRecordId -> its entries, in order
let _ledgerReady     = false;       // false until the history has been imported

function _ledgerList() {
  if (!Array.isArray(DB.studentLedger)) DB.studentLedger = [];
  return DB.studentLedger;
}

/* How an entry moves the balance. */
function ledgerEffect(e) {
  const a = money(e && e.amount);
  if (!e) return 0;
  if (e.type === 'charge' || e.type === 'adjustment') return a;
  if (e.type === 'payment' || e.type === 'concession') return -a;
  return 0;
}

/* Rebuild the indexes from DB.studentLedger. Called once the ledger has been
   loaded from disk or replaced by a restore. Unsaved entries are dropped: after
   a load or a restore, what is in memory IS what is on disk. */
function ledgerLoaded() {
  _ledgerUnsaved  = [];
  _ledgerBalances = new Map();
  _ledgerByRecord = new Map();
  const list = _ledgerList();
  for (const e of list) _ledgerIndex(e);
  // An empty ledger on an install with money history has not been imported.
  _ledgerReady = list.length > 0 || !_ledgerHistory().length;
}

function _ledgerIndex(e) {
  if (!e) return;
  if (e.studentId) _ledgerBalances.set(e.studentId, money(e.runningBalance));
  if (e.paymentRecordId) {
    const arr = _ledgerByRecord.get(e.paymentRecordId);
    if (arr) arr.push(e); else _ledgerByRecord.set(e.paymentRecordId, [e]);
  }
}

/** The student's balance after their latest entry. */
function ledgerBalance(studentId) {
  return _ledgerBalances.get(studentId) || 0;
}

/** A student's entries, oldest first. */
function ledgerEntriesFor(studentId) {
  return _ledgerList().filter(e => e && e.studentId === studentId);
}

/* ── WHAT A MONTH RECORD SAYS ─────────────────────────────────────────────── */

function _ledgerConcession(p) {
  return money(p.concession != null ? p.concession : p.discount);
}

/* What the Payments page says this month billed: still owed, plus collected,
   less any credit held. From the §14 authorities, never from the fields. */
function _ledgerBill(p) {
  const due    = calculateOutstanding(p);
  const credit = due > 0 ? 0 : calculateRefund(p).refundable;
  return Math.max(0, due + money(p.amount) - credit);
}

/* The month's charges as separately named parts, and its concession. The
   admission fee and each extra are named from the record; `monthly` is the
   rest of what the month bills. */
function _ledgerChargeParts(p) {
  const parts = {};
  const add = (key, amt) => { if (amt) parts[key] = (parts[key] || 0) + amt; };

  const adm = money(p.admissionFee != null ? p.admissionFee : p.fee);
  const lines  = Array.isArray(p.extraCharges) ? p.extraCharges : [];
  const listed = lines.reduce((s, c) => s + money(c && c.amount), 0);
  // calculateBill() bills extraTotal whenever the record has one. Where it
  // agrees with the itemised lines they are posted by name; where it does not,
  // the total is what the student was billed, so it is posted as one line.
  if (p.extraTotal == null || money(p.extraTotal) === listed) {
    lines.forEach(c => {
      const amt = money(c && c.amount);
      if (amt > 0) add('extra:' + (String((c && c.label) || '').trim() || 'Extra charge'), amt);
    });
  } else {
    add('extra:Extra charges', money(p.extraTotal));
  }

  const named = Object.keys(parts).reduce((s, k) => s + parts[k], 0) + adm;

  // The concession never exceeds the charges it reduces, as calculateBill()
  // floors the bill. A record with no rent on it has no fields to cap against.
  const hasFields   = p.monthlyRent != null || p.rent != null;
  const fieldsGross = hasFields ? calculateBill(Object.assign({}, p, { concession: 0, discount: 0 })) : Infinity;
  const concession  = Math.min(_ledgerConcession(p), fieldsGross);
  const gross       = _ledgerBill(p) + concession;

  // The named parts claim more than the month bills — a record that disagrees
  // with itself. What it bills is the truth, so it is posted as one line.
  if (named > gross) {
    return { parts: gross > 0 ? { monthly: gross } : {}, concession: Math.min(concession, gross) };
  }
  add('admission', adm);
  add('monthly', gross - named);
  return { parts, concession };
}

function _ledgerPartLabel(key) {
  if (key === 'monthly')   return 'Monthly charges';
  if (key === 'admission') return 'Admission fee';
  if (key.indexOf('extra:') === 0) return key.slice(6);
  return key;
}

function _ledgerPositives(list) {
  return (Array.isArray(list) ? list : []).filter(x => x && money(x.amount) > 0);
}

/* What the ledger has already posted for one record. */
function _ledgerPosted(recordId) {
  const s = { any: false, parts: {}, concession: 0, collected: 0,
              instalments: 0, reversals: 0, deleted: false, net: 0 };
  for (const e of (_ledgerByRecord.get(recordId) || [])) {
    s.any = true;
    s.net += ledgerEffect(e);
    const a = money(e.amount);
    switch (e.part) {
      case 'concession':
        s.concession += e.type === 'concession' ? a : -a; break;
      case 'instalment':
      case 'collected':
        if (e.type === 'payment') { s.collected += a; if (e.part === 'instalment') s.instalments++; }
        else s.collected -= a;
        break;
      case 'reversal': s.reversals++; break;
      case 'deleted':  s.deleted = true; break;
      default:
        if (e.part) s.parts[e.part] = (s.parts[e.part] || 0) + a;
    }
  }
  return s;
}

/* The entries a record still needs, as drafts. Charges first, then the
   concession, then money in, then reversals — the order a receipt reads. */
function _ledgerDiff(p, posted, why) {
  const out  = [];
  const tail = p.month ? ' · ' + p.month : '';
  const also = why ? ' · ' + why : '';
  const n    = v => (typeof fmtNum === 'function' ? fmtNum(v) : String(v));
  const recDate = p.date || p.paidDate || '';

  // Charges.
  const charged = _ledgerChargeParts(p);
  const parts   = charged.parts;
  const keys    = Object.keys(parts);
  Object.keys(posted.parts).forEach(k => { if (keys.indexOf(k) === -1) keys.push(k); });
  keys.forEach(k => {
    const want = parts[k] || 0, have = posted.parts[k] || 0, d = want - have;
    if (!d) return;
    if (have === 0 && d > 0) {
      out.push({ type: 'charge', amount: d, part: k, date: recDate,
                 reason: _ledgerPartLabel(k) + tail });
    } else {
      out.push({ type: 'adjustment', amount: d, part: k, date: recDate,
                 reason: _ledgerPartLabel(k) + ' changed ' + n(have) + ' → ' + n(want) + tail + also });
    }
  });

  // The concession.
  const conc = charged.concession;
  const dc = conc - posted.concession;
  if (dc > 0) {
    out.push({ type: 'concession', amount: dc, part: 'concession', date: recDate,
               reason: (String(p.concessionDesc || '').trim() || 'Concession') + tail });
  } else if (dc < 0) {
    out.push({ type: 'adjustment', amount: -dc, part: 'concession', date: recDate,
               reason: 'Concession changed ' + n(posted.concession) + ' → ' + n(conc) + tail + also });
  }

  // Money in. `amount` is net of reversals, so what was ever collected is
  // amount plus everything reversed; reversals are posted on their own below.
  const reversals = _ledgerPositives(p.reversals);
  const collected = money(p.amount) + reversals.reduce((s, r) => s + money(r.amount), 0);
  let dp = collected - posted.collected;
  if (dp > 0) {
    // Each new instalment is its own entry, owned by whoever it names.
    for (const t of _ledgerPositives(p.partialPayments).slice(posted.instalments)) {
      if (dp <= 0) break;
      const amt = Math.min(money(t.amount), dp);
      out.push({ type: 'payment', amount: amt, part: 'instalment',
                 date: t.date || p.paidDate || recDate,
                 method: t.method || p.method || '', byName: t.collectedBy || '' });
      dp -= amt;
    }
    // Money the record holds that no instalment explains — a form that wrote
    // Amount Paid directly.
    if (dp > 0) {
      out.push({ type: 'payment', amount: dp, part: 'collected',
                 date: p.paidDate || recDate, method: p.method || '' });
    }
  } else if (dp < 0) {
    out.push({ type: 'adjustment', amount: -dp, part: 'collected', date: recDate,
               reason: 'Amount collected changed ' + n(posted.collected) + ' → ' + n(collected) + tail + also });
  }

  // Reversals — money handed back raises what is owed.
  for (const r of reversals.slice(posted.reversals)) {
    const said = String(r.reason || '').trim();
    out.push({ type: 'adjustment', amount: money(r.amount), part: 'reversal',
               date: r.date || recDate, method: r.method || '', byName: r.by || '',
               reason: 'Collection reversed' + (said ? ': ' + said : '') + tail });
  }
  return out;
}

/* Turn a draft into a stored entry. */
function _ledgerPost(p, d, opts) {
  const o    = opts || {};
  const user = (typeof CUR_USER !== 'undefined' && CUR_USER) ? CUR_USER : null;
  const prev = ledgerBalance(p.studentId);
  const entry = {
    id: 'sl_' + uid() + Math.random().toString(36).slice(2, 5),
    studentId: p.studentId,
    type: d.type,
    amount: d.amount,
    reason: d.reason || '',
    // The account that posted it, and its name at the time — accounts are not
    // in backups, so a restored install may no longer know the id (schema Q3).
    createdBy: o.imported ? null : (user && typeof CUR_ROLE !== 'undefined' ? CUR_ROLE : null),
    createdByName: d.byName || (o.imported ? String(p.collectedBy || '') : (user && user.name) || ''),
    approvedBy: null,
    // Schema Q6 (b): one receipt number per month record, shared by its entries.
    receiptId: p.receiptNo || null,
    runningBalance: prev + ledgerEffect(d),
    createdAt: o.imported
      ? (d.date ? d.date + 'T00:00:00' : new Date().toISOString())
      : new Date().toISOString(),
    month: p.month || '',
    paymentRecordId: p.id,
    part: d.part,
  };
  if (!entry.reason) delete entry.reason;
  if (d.method) entry.method = d.method;
  if (o.imported) entry.imported = true;

  _ledgerList().push(entry);
  _ledgerIndex(entry);
  _ledgerUnsaved.push(entry);
  return entry;
}

/* ── THE HOOKS ────────────────────────────────────────────────────────────── */

/**
 * Post whatever this month record now says that the ledger has not yet heard.
 * Call it after any change to a record's charges, concession or money.
 * `opts.why` is added to the reason of any adjustment ("Edited on the payment form").
 */
function ledgerTrack(p, opts) {
  if (!_ledgerReady) return [];
  if (!p || !p.id || !p.studentId) return [];
  const posted = _ledgerPosted(p.id);
  if (posted.deleted) return [];
  const why = opts && opts.why ? String(opts.why) : '';
  return _ledgerDiff(p, posted, why).map(d => _ledgerPost(p, d));
}

/** Track every live month record — after a bulk change such as a start-up repair. */
function ledgerTrackAll(why) {
  let n = 0;
  (DB.payments || []).forEach(p => { n += ledgerTrack(p, { why }).length; });
  return n;
}

/**
 * A month record is being deleted. Its entries stay; one adjustment takes the
 * student's balance back to what it was without it (owner, 2026-09-14).
 */
function ledgerTrackDeleted(p, why) {
  if (!_ledgerReady) return null;
  if (!p || !p.id || !p.studentId) return null;
  // Anything the record says that was never posted is posted first, so the
  // cancelling entry undoes the record as it really stood.
  ledgerTrack(p, { why });
  const posted = _ledgerPosted(p.id);
  if (posted.deleted || !posted.net) return null;
  return _ledgerPost(p, {
    type: 'adjustment', amount: -posted.net, part: 'deleted',
    reason: 'Payment record deleted' + (p.month ? ' · ' + p.month : '') + (why ? ' · ' + why : ''),
  });
}

/* ── IMPORT, RESTORE, SAVE ────────────────────────────────────────────────── */

/* Every month record with money on it, live and archived, once each. */
function _ledgerHistory() {
  const seen = new Set();
  const out  = [];
  const take = r => {
    if (!r || !r.id || !r.studentId || seen.has(r.id)) return;
    seen.add(r.id); out.push(r);
  };
  (DB.payments || []).forEach(take);
  (DB.archive || []).forEach(r => { if (r && r._src !== 'expenses') take(r); });
  return out;
}

/**
 * Post the existing payment history once, in date order (schema Q17).
 * Does nothing when the ledger already has entries. Returns the number posted.
 */
function ledgerImportIfEmpty() {
  if (_ledgerList().length) { _ledgerReady = true; return 0; }
  const empty = _ledgerPosted(' ');
  const drafts = [];
  _ledgerHistory().forEach((p, ri) => {
    _ledgerDiff(p, empty, '').forEach((d, di) => drafts.push({ p, d, ri, di }));
  });
  // Oldest first. Same-day events keep the record's own order, so a month's
  // charge is posted before the money collected against it.
  drafts.sort((a, b) => {
    const da = a.d.date || '', dbb = b.d.date || '';
    if (da !== dbb) return da < dbb ? -1 : 1;
    return a.ri - b.ri || a.di - b.di;
  });
  drafts.forEach(x => _ledgerPost(x.p, x.d, { imported: true }));
  _ledgerReady = true;
  if (drafts.length) console.info('[HOSTYLLO] Ledger: imported ' + drafts.length + ' entries from existing payment history.');
  return drafts.length;
}

/** Hand unsaved entries to the main process. Called by saveDB(); throws on refusal. */
async function ledgerFlush() {
  if (!_ledgerUnsaved.length) return true;
  const api = (typeof window !== 'undefined') ? window.electronAPI : null;
  // Browser dev mode saves the whole DB object to localStorage, ledger included.
  if (!api || !api.ledgerAppend) { _ledgerUnsaved = []; return true; }
  const batch = _ledgerUnsaved.slice();
  const res = await api.ledgerAppend(batch);
  if (!res || res.ok === false) throw new Error((res && res.error) || 'The ledger could not be saved.');
  _ledgerUnsaved = _ledgerUnsaved.slice(batch.length);
  return true;
}

/**
 * Replace the ledger with a restored one, or empty it — for a full restore and
 * Reset All Data only. An empty result is rebuilt from the restored records.
 * Returns false when the main process refused.
 */
async function ledgerAdopt(entries) {
  let list = Array.isArray(entries) ? entries : [];
  let ok   = true;
  const api = (typeof window !== 'undefined') ? window.electronAPI : null;
  if (api && api.ledgerReplaceAll) {
    let res = await api.ledgerReplaceAll(list);
    if ((!res || res.ok === false) && list.length) {
      /* The restored records are already on disk. A damaged ledger beside them
         must not leave the old install's ledger in place, so it is emptied and
         rebuilt from those records instead — and the caller is told. */
      console.error('[HOSTYLLO] Restored ledger refused, rebuilding from records:', res && res.error);
      ok   = false;
      list = [];
      res  = await api.ledgerReplaceAll(list);
    }
    if (!res || res.ok === false) {
      console.error('[HOSTYLLO] Ledger could not be replaced:', res && res.error);
      return false;
    }
  }
  DB.studentLedger = list.slice();
  ledgerLoaded();
  if (ledgerImportIfEmpty() > 0) await saveDB();
  return ok;
}

/* ── READING IT BACK: COLLECTIONS BY ACCOUNT (spec §5 step 3) ──────────────────

   What My Collections and the Wardens view show. Read-only; nothing here posts.
   The owner's rules of 2026-09-14, each one a line below:

     · an account's collections are the `payment` entries IT created;
     · a reversal, or an amount edited down, counts against whoever RECORDED
       it — they are the one handing the cash back — as its own row;
     · imported history has no account (createdBy null) and is in nobody's;
     · a deleted record's collections stay, marked `deleted`: deleting a record
       does not put cash back in anyone's hand.

   Each row: { entry, kind: 'collected' | 'reversed' | 'edited', amount, deleted }
   where `amount` is signed — a reduction is negative. Newest first. */
function ledgerCollections(accountId) {
  const out = [];
  if (!accountId) return out;
  const list = _ledgerList();
  const deleted = new Set();
  list.forEach(e => { if (e && e.part === 'deleted' && e.paymentRecordId) deleted.add(e.paymentRecordId); });
  list.forEach(e => {
    if (!e || e.imported || e.createdBy !== accountId) return;
    let kind, amount;
    if (e.type === 'payment')                                 { kind = 'collected'; amount = money(e.amount); }
    else if (e.type === 'adjustment' && e.part === 'reversal')  { kind = 'reversed';  amount = -money(e.amount); }
    else if (e.type === 'adjustment' && e.part === 'collected') { kind = 'edited';    amount = -money(e.amount); }
    else return;
    out.push({ entry: e, kind, amount, deleted: deleted.has(e.paymentRecordId) });
  });
  return out.reverse();
}

/**
 * The figures above a collections list. `holding` is every row, since the
 * ledger started (nothing is handed over before step 4); `count` counts
 * collections only, so a reversal never reads as money in. Days are local.
 */
function ledgerCollectionTotals(rows) {
  const td = today(), mo = td.slice(0, 7);
  const t = { holding: 0, count: 0, today: 0, todayCount: 0, month: 0, monthCount: 0, last: '', byMethod: [] };
  const byM = new Map();
  (rows || []).forEach(r => {
    const day = ymd(new Date(r.entry.createdAt));
    const isCol = r.kind === 'collected';
    t.holding += r.amount;
    if (isCol) t.count++;
    if (day === td)               { t.today += r.amount; if (isCol) t.todayCount++; }
    if (day.slice(0, 7) === mo)   { t.month += r.amount; if (isCol) t.monthCount++; }
    if (isCol && String(r.entry.createdAt) > t.last) t.last = String(r.entry.createdAt);
    const m = r.entry.method || 'Not recorded';
    byM.set(m, (byM.get(m) || 0) + r.amount);
  });
  // In the order Settings lists the methods; anything else after; unrecorded last.
  const order = (DB.settings && Array.isArray(DB.settings.paymentMethods)) ? DB.settings.paymentMethods : [];
  const rank = m => m === 'Not recorded' ? 1e6 : (order.indexOf(m) >= 0 ? order.indexOf(m) : 1e5);
  t.byMethod = [...byM.entries()]
    .filter(kv => kv[1] !== 0)
    .map(kv => ({ method: kv[0], amount: kv[1] }))
    .sort((a, b) => rank(a.method) - rank(b.method) || (a.method < b.method ? -1 : 1));
  return t;
}

/**
 * Where the ledger disagrees with the month records, per student. Empty when
 * every record has been posted. For tests and the step-3 correctness check.
 */
function ledgerDrift() {
  const want = new Map();
  _ledgerHistory().forEach(p => {
    if (_ledgerPosted(p.id).deleted) return;
    // What the Payments page says: still owed, less any credit held.
    want.set(p.studentId, (want.get(p.studentId) || 0) + _ledgerBill(p) - money(p.amount));
  });
  const have = new Map();
  _ledgerList().forEach(e => {
    if (!e || !e.studentId) return;
    // A deleted record's entries and their cancelling adjustment net to zero.
    have.set(e.studentId, (have.get(e.studentId) || 0) + ledgerEffect(e));
  });
  const out = [];
  new Set([...want.keys(), ...have.keys()]).forEach(sid => {
    const w = want.get(sid) || 0, h = have.get(sid) || 0;
    if (w !== h) out.push({ studentId: sid, records: w, ledger: h, difference: h - w });
  });
  return out;
}
