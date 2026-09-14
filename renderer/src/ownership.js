/* ─── HOSTYLLO — WHO MAY CHANGE COLLECTED MONEY (warden ledger spec §3.2, §5 step 6) ───

   The rules only; the payment screens ask them. Built to
   docs/WARDEN_LEDGER_STEP6_DESIGN.md — every owner answer behind a rule is in
   docs/WARDEN_LEDGER_SCHEMA_PROPOSAL.md ("Step 6 decisions").

   · A record HOLDS money when its collected amount (`p.amount`) is above 0.
   · Once it holds money: Amount paid, payment method, month and payment date
     are read-only for everyone, admin included.
   · Its OWNER is the account that took the latest money on it — the receipt's
     "Collected by". History imported before the ledger has no account, so only
     an admin may change it.
   · An ADMIN is an account with Manage users.
   · Edit (bill, notes, due date): the owner or an admin. A changed charge needs
     a reason.
   · Reverse: a warden up to what THEY collected on the record that is still
     waiting to be handed over; an admin any amount.
   · Delete: only a record that holds no money.
   · Everyone still SEES every record, receipt and ledger line.

   Every screen checks these twice — the control is disabled with the reason,
   and the submit refuses on its own.

   Plain function declarations, no module syntax — it runs in the browser and in
   the vm sandbox of tests/ownership.test.js.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function _ownRole() { return (typeof CUR_ROLE !== 'undefined' && CUR_ROLE) ? CUR_ROLE : null; }
function _ownFirst(n) {
  return typeof ledgerFirstName === 'function' ? ledgerFirstName(n) : String(n || '').trim().split(/\s+/)[0];
}

/** Is the signed-in account an admin (Manage users)? */
function ownIsAdmin() { return typeof canDo === 'function' && canDo('users'); }

/** Does the record hold collected money? */
function ownHeld(p) { return !!p && money(p.amount) > 0; }

/** Who took the latest money on the record: { id, name }. */
function ownOwner(p) {
  if (!p) return { id: null, name: '' };
  const o = typeof ledgerRecordOwner === 'function' ? ledgerRecordOwner(p.id) : null;
  if (o) return o;
  // Before the ledger heard of it: the name the record's own trail carries.
  const trail = (Array.isArray(p.partialPayments) ? p.partialPayments : []).filter(t => t && t.collectedBy);
  return { id: null, name: trail.length ? String(trail[trail.length - 1].collectedBy) : String(p.collectedBy || '') };
}

/** May the signed-in account edit this record? { ok, reason } */
function ownCanEdit(p) {
  if (!p) return { ok: false, reason: 'That payment record could not be found.' };
  if (!ownHeld(p) || ownIsAdmin()) return { ok: true, reason: '' };
  const o = ownOwner(p);
  if (o.id && o.id === _ownRole()) return { ok: true, reason: '' };
  const who = o.name || 'another account';
  return { ok: false,
    reason: 'Collected by ' + who + '. Only ' + (o.id ? _ownFirst(who) + ' or ' : '') + 'an admin can change it.' };
}

/** May the signed-in account delete this record? { ok, reason } */
function ownCanDelete(p) {
  if (!p) return { ok: false, reason: 'That payment record could not be found.' };
  if (ownHeld(p)) {
    return { ok: false, reason: 'This record holds ' + fmtPKR(money(p.amount))
      + '. Reverse the collection first, then delete it.' };
  }
  return { ok: true, reason: '' };
}

/**
 * How much the signed-in account may reverse on this record.
 * { max, mine, waiting, approved, admin, reason } — `mine` is what this account
 * collected here that is still waiting to be handed over (net of what it has
 * already reversed); `waiting` is in a handover not yet acted on; `approved`
 * has been approved or disputed.
 */
function ownReversible(p) {
  const out = { max: 0, mine: 0, waiting: 0, approved: 0, admin: false, reason: '' };
  if (!ownHeld(p)) { out.reason = 'Nothing has been collected on this record.'; return out; }
  if (ownIsAdmin()) { out.admin = true; out.max = money(p.amount); return out; }

  const role = _ownRole();
  if (typeof handoverSync === 'function') handoverSync();
  const rows = new Map((Array.isArray(DB.wardenCollections) ? DB.wardenCollections : [])
    .map(r => [r.ledgerEntryId, r]));
  const entries = typeof ledgerEntriesForRecord === 'function' ? ledgerEntriesForRecord(p.id) : [];
  entries.forEach(e => {
    if (!e || !role || e.createdBy !== role) return;
    const line = ledgerCollectionLine(e);
    if (!line) return;
    const r = rows.get(e.id);
    const st = r ? r.status : 'pending_handover';
    if (st === 'pending_handover') out.mine += line.amount;
    else if (st === 'handed_over') out.waiting += line.amount;
    else out.approved += line.amount;
  });

  out.max = Math.max(0, Math.min(out.mine, money(p.amount)));
  if (out.max <= 0) {
    out.reason = out.waiting > 0
      ? 'Your collection on this record is in a handover waiting for approval. Take the handover back first.'
      : out.approved > 0
        ? 'Your collection on this record was approved in a handover. Only an admin can reverse it now.'
        : 'You have not collected money on this record. Only its collector or an admin can reverse it.';
  }
  return out;
}
