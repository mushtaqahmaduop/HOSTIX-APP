/* ─── HOSTYLLO — CASH HANDOVERS (warden ledger spec §3.3, §5 step 4) ─────────

   The rules of handing collected cash to an administrator and approving it.
   No screens here — users.js draws them. Built to
   docs/WARDEN_LEDGER_STEP4_DESIGN.md; every owner answer behind it is in that
   file and in docs/WARDEN_LEDGER_SCHEMA_PROPOSAL.md ("Step 4 decisions").

   ── THREE TABLES, ALL ORDINARY (unlike the ledger) ──────────────────────────

     warden_collections  one row per line an account holds: the ledger entry,
                         the account, the signed amount, the method, and a
                         STATUS that moves —
                           pending_handover → handed_over → approved / disputed
     handovers           one per "Hand over cash": the snapshot's total and
                         per-method expected figures; what the administrator
                         counted per method and whether each figure was typed
                         or confirmed with Matches; the approved amount; notes
                         as a list of {who, when, text} that is only appended
     handover_items      handover ↔ ledger entry, with the line's outcome

   The ledger itself is never touched: approving moves no money and never
   changes the dashboard's Available Fund (schema Q8).

   ── THE RULES (acceptance criteria in the design doc) ───────────────────────

   · A line is money an account holds by ledgerCollectionLine(): its payments,
     less the reversals and amounts edited down it recorded — net cash.
   · Imported history has no account and is never a line.
   · An account that manages users hands nothing over.
   · A handover is a SNAPSHOT of every waiting line when sent; one open per
     account; later collections wait for the next one.
   · Take back: only the sender, only while waiting and not yet acted on.
   · Reversal lines are always included — never unticked.
   · Approve only when, for every method in the handover, the counted figure
     equals what the ticked lines expect. Exactly; no tolerance.
   · Flag discrepancy needs a note. Approving a discrepancy needs a note saying
     how it was settled.
   · Unticked lines go back to the sender WHEN the handover is approved.
   · Any account with Manage users may approve; each approval records who.

   Plain function declarations, no module syntax — it runs in the browser and
   in the vm sandbox of tests/handovers.test.js.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const HO_OPEN = ['pending', 'discrepancy'];

function _hoList(key) {
  if (!Array.isArray(DB[key])) DB[key] = [];
  return DB[key];
}
function _hoUser() { return (typeof CUR_USER !== 'undefined' && CUR_USER) ? CUR_USER : null; }
function _hoRole() { return (typeof CUR_ROLE !== 'undefined' && CUR_ROLE) ? CUR_ROLE : null; }
function _hoFail(reason) { return { ok: false, reason: reason }; }
function _hoLog(action, detail) {
  if (typeof logActivity === 'function') logActivity(action, detail, 'Finance');
}
function _hoMethodKey(m) { return m || ''; }
function _hoMethodLabel(m) { return m || 'Not recorded'; }

/** Does this account hand its collections over? Accounts that manage users do not.
    A deleted account's money is still the hostel's, so it does. */
function hoNeedsHandover(accountId) {
  const u = (typeof WARDENS !== 'undefined' && WARDENS) ? WARDENS[accountId] : null;
  if (!u) return true;
  return !(u.perms && u.perms.users === true);
}

/* What the last sync saw. The ledger is append-only in memory and is only ever
   REPLACED (load, restore), so an unchanged array of an unchanged length has
   nothing new — and the Wardens tab asks once per account on every render. */
let _hoSyncSeen = { ledger: null, len: -1, rows: null };

/** Every collection line gets its status row once. Returns how many were added. */
function handoverSync() {
  const rows = _hoList('wardenCollections');
  const ledger = DB.studentLedger || [];
  if (_hoSyncSeen.ledger === ledger && _hoSyncSeen.len === ledger.length && _hoSyncSeen.rows === rows) return 0;
  _hoSyncSeen = { ledger, len: ledger.length, rows };
  const have = new Set(rows.map(r => r.ledgerEntryId));
  const now  = new Date().toISOString();
  let added = 0;
  (DB.studentLedger || []).forEach(e => {
    if (!e || e.imported || !e.createdBy || have.has(e.id)) return;
    const line = ledgerCollectionLine(e);
    if (!line) return;
    rows.push({
      id: 'wc_' + e.id, ledgerEntryId: e.id, wardenId: e.createdBy,
      amount: line.amount, method: e.method || '',
      status: 'pending_handover', handoverId: null,
      createdAt: e.createdAt, updatedAt: now,
    });
    have.add(e.id);
    added++;
  });
  return added;
}

function _hoEntryMap() {
  const m = new Map();
  (DB.studentLedger || []).forEach(e => { if (e && e.id) m.set(e.id, e); });
  return m;
}

/** The lines an account still holds, newest first: [{ row, entry }]. */
function hoPendingLines(accountId) {
  handoverSync();
  const map = _hoEntryMap();
  return _hoList('wardenCollections')
    .filter(r => r.wardenId === accountId && r.status === 'pending_handover')
    .map(r => ({ row: r, entry: map.get(r.ledgerEntryId) }))
    .filter(x => x.entry)
    .sort((a, b) => String(b.entry.createdAt).localeCompare(String(a.entry.createdAt)));
}

function _hoAmt(x) { return money(x && x.row ? x.row.amount : x && x.item ? x.item.amount : x && x.amount); }
function _hoMeth(x) { return _hoMethodKey(x && x.row ? x.row.method : x && x.item ? x.item.method : x && x.method); }

function hoSum(lines) { return (lines || []).reduce((s, x) => s + _hoAmt(x), 0); }

/** Per-method totals, keyed by method ('' = not recorded). */
function hoByMethod(lines) {
  const out = {};
  (lines || []).forEach(x => { const m = _hoMeth(x); out[m] = (out[m] || 0) + _hoAmt(x); });
  return out;
}

function hoFind(id) { return _hoList('handovers').find(h => h.id === id) || null; }

/** The account's handover that is still waiting or in discrepancy, if any. */
function hoOpenFor(accountId) {
  return _hoList('handovers').find(h => h.wardenId === accountId && HO_OPEN.indexOf(h.status) !== -1) || null;
}

/** A handover's lines, newest first: [{ item, entry, row }]. */
function hoItems(handoverId) {
  const map  = _hoEntryMap();
  const rows = new Map(_hoList('wardenCollections').map(r => [r.ledgerEntryId, r]));
  return _hoList('handoverItems')
    .filter(i => i.handoverId === handoverId)
    .map(i => ({ item: i, entry: map.get(i.ledgerEntryId) || null, row: rows.get(i.ledgerEntryId) || null }))
    .sort((a, b) => String(b.entry ? b.entry.createdAt : '').localeCompare(String(a.entry ? a.entry.createdAt : '')));
}

/** The state as a word — never a colour alone. */
function hoLabel(h) {
  if (!h) return '';
  if (h.status === 'approved') return money(h.approvedAmount) < money(h.totalAmount) ? 'Part approved' : 'Approved';
  return ({ pending: 'Waiting', discrepancy: 'Discrepancy', taken_back: 'Taken back' })[h.status] || String(h.status);
}
function hoHue(h) {
  const l = hoLabel(h);
  return l === 'Approved' ? 'dh-green' : l === 'Part approved' ? 'dh-blue' : l === 'Waiting' ? 'dh-amber'
       : l === 'Discrepancy' ? 'dh-red' : 'dh-slate';
}

function _hoNote(h, text, kind) {
  const u = _hoUser();
  if (!Array.isArray(h.notes)) h.notes = [];
  h.notes.push({ by: _hoRole(), byName: (u && u.name) || '', at: new Date().toISOString(),
                 kind: kind, text: String(text).trim() });
}

/* ── SENDING AND TAKING BACK ──────────────────────────────────────────────── */

function hoSend(accountId) {
  if (!accountId) return _hoFail('Sign in first.');
  if (!hoNeedsHandover(accountId)) return _hoFail('An account that manages users has nothing to hand over.');
  if (hoOpenFor(accountId)) return _hoFail('A handover is already waiting for the administrator.');
  const lines = hoPendingLines(accountId);
  const total = hoSum(lines);
  if (!lines.length || total <= 0) return _hoFail('There is nothing to hand over.');

  const now = new Date().toISOString();
  const u = (typeof WARDENS !== 'undefined' && WARDENS && WARDENS[accountId]) || {};
  const h = {
    id: 'ho_' + uid() + Math.random().toString(36).slice(2, 5),
    wardenId: accountId, wardenName: u.name || '',
    status: 'pending', totalAmount: total, lineCount: lines.length,
    expected: hoByMethod(lines), counted: null, countedHow: null,
    approvedAmount: null, approvedLines: null, adminId: null, adminName: '',
    notes: [], createdAt: now, reviewedAt: null, approvedAt: null, takenBackAt: null,
    wardenSeenAt: now,
  };
  _hoList('handovers').push(h);
  lines.forEach(x => {
    _hoList('handoverItems').push({
      id: h.id + ':' + x.row.ledgerEntryId, handoverId: h.id, ledgerEntryId: x.row.ledgerEntryId,
      amount: x.row.amount, method: x.row.method, outcome: null,
    });
    x.row.status = 'handed_over'; x.row.handoverId = h.id; x.row.updatedAt = now;
  });
  _hoLog('Cash Handed Over', (h.wardenName || accountId) + ' — ' + lines.length + ' line(s) · ' + fmtPKR(total));
  return { ok: true, handover: h };
}

function hoTakeBack(id, accountId) {
  const h = hoFind(id);
  if (!h) return _hoFail('That handover no longer exists.');
  if (h.wardenId !== accountId) return _hoFail('Only the warden who sent it can take it back.');
  if (h.status !== 'pending' || h.reviewedAt) return _hoFail('The administrator has already acted on this handover.');
  const now = new Date().toISOString();
  h.status = 'taken_back'; h.takenBackAt = now;
  const rows = new Map(_hoList('wardenCollections').map(r => [r.ledgerEntryId, r]));
  _hoList('handoverItems').filter(i => i.handoverId === h.id).forEach(i => {
    i.outcome = 'returned';
    const r = rows.get(i.ledgerEntryId);
    if (r) { r.status = 'pending_handover'; r.handoverId = null; r.updatedAt = now; }
  });
  _hoLog('Handover Taken Back', (h.wardenName || accountId) + ' — ' + fmtPKR(h.totalAmount));
  return { ok: true, handover: h };
}

/* ── REVIEWING ────────────────────────────────────────────────────────────── */

/**
 * What approving this selection would mean. Pure — changes nothing.
 * `ticked`: ledger entry ids (array or Set). `counted`: { method: figure as typed }.
 * Reversal lines are counted as ticked whatever `ticked` says.
 */
function hoEvaluate(h, ticked, counted) {
  const set = new Set(ticked ? Array.from(ticked) : []);
  const items = hoItems(h.id);
  items.forEach(x => { if (money(x.item.amount) < 0) set.add(x.item.ledgerEntryId); });

  const methods = [];
  items.forEach(x => { const m = _hoMeth(x); if (methods.indexOf(m) === -1) methods.push(m); });
  const rows = methods.map(m => {
    const expected = items.filter(x => _hoMeth(x) === m && set.has(x.item.ledgerEntryId))
                          .reduce((s, x) => s + money(x.item.amount), 0);
    const raw = counted ? counted[m] : undefined;
    const has = raw !== undefined && raw !== null && String(raw).trim() !== '' && Number.isFinite(Number(raw));
    const c = has ? money(Number(raw)) : null;
    return { method: m, label: _hoMethodLabel(m), expected, counted: c,
             difference: has ? c - expected : null, matches: has && c === expected };
  });

  const inIt  = items.filter(x => set.has(x.item.ledgerEntryId));
  const out   = items.filter(x => !set.has(x.item.ledgerEntryId));
  const approvedAmount = inIt.reduce((s, x) => s + money(x.item.amount), 0);
  const allMatch = rows.every(r => r.matches);
  return {
    rows, ticked: set,
    approvedAmount, approvedCount: inIt.length,
    returnedAmount: out.reduce((s, x) => s + money(x.item.amount), 0), returnedCount: out.length,
    total: money(h.totalAmount), allMatch,
    canApprove: allMatch && approvedAmount > 0 && inIt.some(x => money(x.item.amount) > 0),
  };
}

function _hoGuardReview(h) {
  if (typeof canDo === 'function' && !canDo('users')) return 'Only an account that manages users can review a handover.';
  if (!h) return 'That handover no longer exists.';
  if (HO_OPEN.indexOf(h.status) === -1) return 'This handover is not waiting for review.';
  if (h.wardenId === _hoRole()) return 'You cannot review your own handover.';
  return '';
}

function _hoStoreCount(h, ev, how) {
  h.counted = {}; h.countedHow = {};
  ev.rows.forEach(r => {
    h.counted[r.method] = r.counted;
    h.countedHow[r.method] = r.counted === null ? null : ((how && how[r.method]) === 'matched' ? 'matched' : 'typed');
  });
}

/**
 * Approve the ticked lines. input: { ticked, counted, how, note }.
 * Unticked lines go back to the sender now.
 */
function hoApprove(id, input) {
  const h = hoFind(id);
  const bad = _hoGuardReview(h);
  if (bad) return _hoFail(bad);
  const o = input || {};
  const ev = hoEvaluate(h, o.ticked, o.counted);
  if (!ev.canApprove) return _hoFail('The counted money does not match the lines ticked.');
  const note = String(o.note || '').trim();
  const wasDisc = h.status === 'discrepancy';
  if (wasDisc && !note) return _hoFail('Write how the discrepancy was settled before approving.');

  const now = new Date().toISOString();
  const u = _hoUser();
  _hoStoreCount(h, ev, o.how);
  h.status = 'approved';
  h.approvedAmount = ev.approvedAmount; h.approvedLines = ev.approvedCount;
  h.adminId = _hoRole(); h.adminName = (u && u.name) || '';
  h.reviewedAt = now; h.approvedAt = now;
  if (note) _hoNote(h, note, wasDisc ? 'settled' : 'approved');

  const rows = new Map(_hoList('wardenCollections').map(r => [r.ledgerEntryId, r]));
  _hoList('handoverItems').filter(i => i.handoverId === h.id).forEach(i => {
    const r = rows.get(i.ledgerEntryId);
    if (ev.ticked.has(i.ledgerEntryId)) {
      i.outcome = 'approved';
      if (r) { r.status = 'approved'; r.updatedAt = now; }
    } else {
      i.outcome = 'returned';
      if (r) { r.status = 'pending_handover'; r.handoverId = null; r.updatedAt = now; }
    }
  });
  _hoLog(ev.returnedCount ? 'Handover Part Approved' : 'Handover Approved',
    (h.wardenName || h.wardenId) + ' — ' + fmtPKR(ev.approvedAmount) + ' of ' + fmtPKR(h.totalAmount));
  return { ok: true, handover: h, evaluation: ev };
}

/** Flag a discrepancy. input: { ticked, counted, how, note } — the note is required. */
function hoFlag(id, input) {
  const h = hoFind(id);
  const bad = _hoGuardReview(h);
  if (bad) return _hoFail(bad);
  const o = input || {};
  const note = String(o.note || '').trim();
  if (!note) return _hoFail('Write what is wrong before flagging a discrepancy.');

  const now = new Date().toISOString();
  const u = _hoUser();
  const ev = hoEvaluate(h, o.ticked, o.counted);
  _hoStoreCount(h, ev, o.how);
  h.status = 'discrepancy';
  h.adminId = _hoRole(); h.adminName = (u && u.name) || '';
  h.reviewedAt = now;
  _hoNote(h, note, 'discrepancy');
  const rows = new Map(_hoList('wardenCollections').map(r => [r.ledgerEntryId, r]));
  _hoList('handoverItems').filter(i => i.handoverId === h.id).forEach(i => {
    const r = rows.get(i.ledgerEntryId);
    if (r) { r.status = 'disputed'; r.updatedAt = now; }
  });
  _hoLog('Handover Discrepancy', (h.wardenName || h.wardenId) + ' — ' + fmtPKR(h.totalAmount) + ' · ' + note);
  return { ok: true, handover: h, evaluation: ev };
}

/* ── ALERTS (the header bell) ─────────────────────────────────────────────── */

const HO_BELL_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>';

/** Bell entries: handovers waiting for an approver; outcomes a warden has not seen.
    The bell inserts `msg` as HTML (nav.js), so the account name is escaped here. */
function hoAlerts() {
  const out = [];
  const role = _hoRole();
  if (!role) return out;
  const hs = _hoList('handovers');
  const who = h => escHtml(h.wardenName || 'a warden');
  if (typeof canDo === 'function' && canDo('users')) {
    hs.filter(h => h.status === 'pending' && h.wardenId !== role).forEach(h => out.push({
      hue: 'dh-amber', go: "usersTab='wardens';navigate('users')", icon: HO_BELL_ICON,
      msg: 'Handover waiting from ' + who(h) + ' — ' + fmtPKR(h.totalAmount) }));
    hs.filter(h => h.status === 'discrepancy' && h.wardenId !== role).forEach(h => out.push({
      hue: 'dh-red', go: "usersTab='wardens';navigate('users')", icon: HO_BELL_ICON,
      msg: 'Handover in discrepancy: ' + who(h) + ' — ' + fmtPKR(h.totalAmount) }));
  }
  hs.filter(h => h.wardenId === role && (h.status === 'approved' || h.status === 'discrepancy')
              && h.reviewedAt && (!h.wardenSeenAt || h.wardenSeenAt < h.reviewedAt))
    .forEach(h => out.push({
      hue: h.status === 'discrepancy' ? 'dh-red' : 'dh-green', go: "navigate('users')", icon: HO_BELL_ICON,
      msg: h.status === 'discrepancy'
        ? 'Your handover of ' + fmtPKR(h.totalAmount) + ' was flagged — see the note'
        : 'Your handover of ' + fmtPKR(h.totalAmount) + ' was ' + (hoLabel(h) === 'Part approved' ? 'part approved' : 'approved') }));
  return out;
}

/** The warden has seen their outcomes. Returns how many were marked. */
function hoMarkSeen(accountId) {
  let n = 0;
  const now = new Date().toISOString();
  _hoList('handovers').forEach(h => {
    if (h.wardenId !== accountId || !h.reviewedAt) return;
    if (!h.wardenSeenAt || h.wardenSeenAt < h.reviewedAt) { h.wardenSeenAt = now; n++; }
  });
  return n;
}
