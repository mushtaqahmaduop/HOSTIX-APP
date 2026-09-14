/* ─── HOSTYLLO — STANDING CONCESSIONS (warden ledger spec §2.4, §3.9, §5 step 8) ───

   The rules only; students.js and users.js draw the screens. Built to
   docs/WARDEN_LEDGER_STEP8_DESIGN.md — owner answers in
   docs/WARDEN_LEDGER_SCHEMA_PROPOSAL.md (§2.4 Q11/Q12, "Step 8 decisions").

   · A concession is whole rupees a month (no percent — owner), on the rent, the
     mess, or both, for a run of whole months (end optional), with a reason.
   · A warden REQUESTS; nothing changes until an admin APPROVES (one tap). A
     decline needs a note. An admin's own concession is approved at once.
   · Approved: every generated month inside the range that is not fully paid
     gets it now; months generated later get it when generated. Paid months are
     never rewritten.
   · A month record keeps what it carries in `concessionsApplied: [{id, amount}]`,
     and `concession` = what was typed in the payment form's box + those amounts,
     so a hand-typed concession is never overwritten. The ledger posts the change
     as a `concession` entry with the reason (ledgerTrack).
   · Caps: a rent concession takes no more than the month's rent, mess no more
     than its mess, both no more than rent + mess; together they never take the
     month below zero.
   · Ending early: an admin ends it — it stops from next month. A warden asks,
     and an admin approves, like mess exemptions.

   The `concessions` table (DB.concessions) is ordinary and mutable, like the
   handover tables: a request waits, is decided, and can end.

   Plain function declarations, no module syntax — it runs in the browser and in
   the vm sandbox of tests/concessions.test.js.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const CN_TYPES = ['rent', 'mess', 'both'];

function _cnList() {
  if (!Array.isArray(DB.concessions)) DB.concessions = [];
  return DB.concessions;
}
function _cnRole() { return (typeof CUR_ROLE !== 'undefined' && CUR_ROLE) ? CUR_ROLE : null; }
function _cnUser() { return (typeof CUR_USER !== 'undefined' && CUR_USER) ? CUR_USER : null; }
function _cnFail(reason) { return { ok: false, reason: reason }; }
function _cnLog(action, detail) {
  if (typeof logActivity === 'function') logActivity(action, detail, 'Finance');
}
function _cnStudent(id) { return (DB.students || []).find(s => s && s.id === id) || null; }
function _cnName(c) { const s = _cnStudent(c.studentId); return s ? s.name : 'a student'; }

/** Is the signed-in account an admin (Manage users)? */
function cnIsAdmin() { return typeof canDo === 'function' && canDo('users'); }

/** The label for a part. */
function cnTypeLabel(type) { return type === 'rent' ? 'Rent' : type === 'mess' ? 'Mess' : 'Rent + Mess'; }

/** "2026-09" → "2026-09-30". */
function _cnEndOfMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return ym + '-' + String(last).padStart(2, '0');
}

/** The month key a record bills ("YYYY-MM"), whichever way its month is stored. */
function _cnRecMonthKey(p) {
  if (!p) return '';
  if (typeof _payMonthKey === 'function') return _payMonthKey(p) || '';
  const m = /^(\d{4}-\d{2})/.exec(String(p.month || ''));
  return m ? m[1] : '';
}

/** Does this concession cover the month? Approved or ended ones only. */
function cnCovers(c, monthKey) {
  if (!c || (c.status !== 'approved' && c.status !== 'ended')) return false;
  const s = String(c.startDate || '').slice(0, 7);
  const e = c.endDate ? String(c.endDate).slice(0, 7) : '';
  return !!monthKey && monthKey >= s && (!e || monthKey <= e);
}

/** A student's concessions, newest first. */
function cnForStudent(studentId) {
  return _cnList().filter(c => c && c.studentId === studentId)
    .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
}

/** The concessions covering a student's month, in the order they were approved. */
function cnActiveFor(studentId, monthKey) {
  return _cnList().filter(c => c && c.studentId === studentId && cnCovers(c, monthKey))
    .sort((a, b) => String(a.approvedAt).localeCompare(String(b.approvedAt)));
}

/** "Sep 2026 → Dec 2026", "Sep 2026 onward". */
function cnMonthsLabel(c) {
  const fmt = d => {
    const m = /^(\d{4})-(\d{2})/.exec(String(d || ''));
    if (!m) return '—';
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m[2]) - 1] + ' ' + m[1];
  };
  return fmt(c.startDate) + (c.endDate ? ' → ' + fmt(c.endDate) : ' onward');
}

/** What an admin still has to decide: [{ c, kind: 'start' | 'end' }], oldest first. */
function cnQueue() {
  const out = [];
  _cnList().forEach(c => {
    if (!c) return;
    if (c.status === 'pending') out.push({ c, kind: 'start', at: c.requestedAt });
    else if (c.endRequest) out.push({ c, kind: 'end', at: c.endRequest.requestedAt });
  });
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/**
 * Ask for a concession. o: { studentId, type, value, reason, startMonth: 'YYYY-MM', endMonth? }.
 * An admin's own is approved at once. Returns { ok, pending, concession, applied?, reason? }.
 */
function cnRequest(o) {
  o = o || {};
  const s = _cnStudent(o.studentId);
  if (!s) return _cnFail('That student could not be found.');
  const role = _cnRole();
  if (!role) return _cnFail('Sign in first.');
  if (CN_TYPES.indexOf(o.type) === -1) return _cnFail('Choose rent, mess, or both.');
  if (o.type !== 'rent' && typeof hostelServesMess === 'function' && !hostelServesMess()) {
    return _cnFail('This hostel serves no mess, so a concession can only be on the rent.');
  }
  const value = Number(o.value);
  if (!Number.isFinite(value) || value <= 0 || Math.round(value) !== value) {
    return _cnFail('Enter the concession as a whole number of rupees.');
  }
  const why = String(o.reason || '').trim();
  if (!why) return _cnFail('Give a reason.');
  if (!/^\d{4}-\d{2}$/.test(String(o.startMonth || ''))) return _cnFail('Choose the month it starts.');
  if (o.endMonth && (!/^\d{4}-\d{2}$/.test(String(o.endMonth)) || o.endMonth < o.startMonth)) {
    return _cnFail('The last month cannot come before the first.');
  }

  const u = _cnUser();
  const now = new Date().toISOString();
  const c = {
    id: 'cn_' + (typeof uid === 'function' ? uid() : Date.now().toString(36)) + Math.random().toString(36).slice(2, 5),
    studentId: s.id, type: o.type, value, reason: why,
    startDate: o.startMonth + '-01', endDate: o.endMonth ? _cnEndOfMonth(o.endMonth) : '',
    status: 'pending',
    requestedBy: role, requestedByName: (u && u.name) || '', requestedAt: now,
    approvedBy: null, approvedByName: '', approvedAt: null,
    decidedNote: '', endRequest: null, lastOutcome: null,
  };
  _cnList().push(c);
  if (cnIsAdmin()) {
    const r = _cnApprove(c);
    return { ok: true, pending: false, concession: c, applied: r.applied };
  }
  _cnLog('Concession Requested', s.name + ' — ' + fmtPKR(value) + '/month ' + cnTypeLabel(o.type).toLowerCase() + ' · ' + why);
  return { ok: true, pending: true, concession: c };
}

function _cnOutcome(c, kind, outcome, note, requestedBy) {
  const role = _cnRole(), u = _cnUser();
  c.lastOutcome = { kind, outcome, note: note || '', by: role, byName: (u && u.name) || '',
                    at: new Date().toISOString(), requestedBy, seenAt: requestedBy === role ? new Date().toISOString() : null };
}

function _cnApprove(c) {
  const role = _cnRole(), u = _cnUser();
  c.status = 'approved';
  c.approvedBy = role;
  c.approvedByName = (u && u.name) || '';
  c.approvedAt = new Date().toISOString();
  _cnOutcome(c, 'start', 'approved', '', c.requestedBy);
  const applied = cnApplyAll(c.studentId);
  _cnLog('Concession Approved', _cnName(c) + ' — ' + fmtPKR(c.value) + '/month · ' + c.reason);
  return { ok: true, applied };
}

/** An admin approves a waiting request — a new concession or an early end. */
function cnApprove(id) {
  if (!cnIsAdmin()) return _cnFail('Only an account that manages users can approve this.');
  const c = _cnList().find(x => x && x.id === id);
  if (!c) return _cnFail('That concession no longer exists.');
  if (c.status === 'pending') return _cnApprove(c);
  if (c.endRequest) return _cnEnd(c, c.endRequest);
  return _cnFail('Nothing is waiting on that concession.');
}

/** An admin declines a waiting request; a note is required. */
function cnDecline(id, note) {
  if (!cnIsAdmin()) return _cnFail('Only an account that manages users can decline this.');
  const c = _cnList().find(x => x && x.id === id);
  if (!c) return _cnFail('That concession no longer exists.');
  const why = String(note || '').trim();
  if (!why) return _cnFail('Write why it is declined.');
  if (c.status === 'pending') {
    c.status = 'declined';
    c.decidedNote = why;
    _cnOutcome(c, 'start', 'declined', why, c.requestedBy);
    _cnLog('Concession Declined', _cnName(c) + ' — ' + why);
    return { ok: true };
  }
  if (c.endRequest) {
    const req = c.endRequest;
    c.endRequest = null;
    _cnOutcome(c, 'end', 'declined', why, req.requestedBy);
    _cnLog('Concession End Declined', _cnName(c) + ' — ' + why);
    return { ok: true };
  }
  return _cnFail('Nothing is waiting on that concession.');
}

/** Ask to end an approved concession early. An admin's own request ends it at once. */
function cnRequestEnd(id, reason) {
  const c = _cnList().find(x => x && x.id === id);
  if (!c || c.status !== 'approved') return _cnFail('Only an active concession can be ended.');
  const role = _cnRole();
  if (!role) return _cnFail('Sign in first.');
  const why = String(reason || '').trim();
  if (!why) return _cnFail('Give a reason.');
  if (c.endRequest) return _cnFail('A request to end it is already waiting for an admin.');
  const u = _cnUser();
  const req = { reason: why, requestedBy: role, requestedByName: (u && u.name) || '', requestedAt: new Date().toISOString() };
  if (cnIsAdmin()) return _cnEnd(c, req);
  c.endRequest = req;
  _cnLog('Concession End Requested', _cnName(c) + ' — ' + why);
  return { ok: true, pending: true };
}

/* It stops from next month: this month keeps it. */
function _cnEnd(c, req) {
  const cur = typeof thisMonth === 'function' ? thisMonth() : new Date().toISOString().slice(0, 7);
  const end = _cnEndOfMonth(cur);
  if (!c.endDate || c.endDate > end) c.endDate = end;
  c.status = 'ended';
  c.endRequest = null;
  c.endedReason = req.reason;
  c.endedAt = new Date().toISOString();
  _cnOutcome(c, 'end', 'approved', '', req.requestedBy);
  const applied = cnApplyAll(c.studentId);
  _cnLog('Concession Ended', _cnName(c) + ' — ' + req.reason);
  return { ok: true, pending: false, applied };
}

/** Re-apply standing concessions to every month record of a student that may take them. */
function cnApplyAll(studentId) {
  let n = 0;
  (DB.payments || []).forEach(p => { if (p && p.studentId === studentId && cnApplyToRecord(p)) n++; });
  return n;
}

/**
 * Bring one month record in line with the concessions covering its month.
 * Returns true when it changed. A record that carries none and is fully paid is
 * never touched — paid months are not rewritten.
 */
function cnApplyToRecord(p) {
  if (!p || !p.studentId) return false;
  // A month whose concession was typed below its standing concessions on the
  // Edit Payment form keeps what was typed (submitEditPayment marks it).
  if (p.concessionsOverridden === true) return false;
  const mk = _cnRecMonthKey(p);
  if (!mk) return false;
  const prev = Array.isArray(p.concessionsApplied) ? p.concessionsApplied : [];
  if (!prev.length && calculateOutstanding(p) <= 0) return false;

  const prevSum = prev.reduce((s, a) => s + money(a.amount), 0);
  const manual  = Math.max(0, money(p.concession != null ? p.concession : p.discount) - prevSum);
  if (!prev.length) p.concessionManualDesc = String(p.concessionDesc || p.discountDesc || '').trim();

  const rent = money(p.monthlyRent != null ? p.monthlyRent : p.rent);
  const mess = p.messIncluded === false ? 0 : money(p.messCharge != null ? p.messCharge : p.mess);
  let rentLeft = rent, messLeft = mess;
  let left = Math.max(0, rent + mess - manual);

  const applied = [];
  cnActiveFor(p.studentId, mk).forEach(c => {
    const cap = c.type === 'rent' ? rentLeft : c.type === 'mess' ? messLeft : rentLeft + messLeft;
    const amt = Math.min(money(c.value), cap, left);
    if (amt <= 0) return;
    if (c.type === 'rent') rentLeft -= amt;
    else if (c.type === 'mess') messLeft -= amt;
    else { const r = Math.min(amt, rentLeft); rentLeft -= r; messLeft -= (amt - r); }
    left -= amt;
    applied.push({ id: c.id, amount: amt });
  });

  if (JSON.stringify(applied) === JSON.stringify(prev)) return false;

  const sum = applied.reduce((s, a) => s + a.amount, 0);
  p.concessionsApplied = applied;
  p.concession = manual + sum;
  p.discount   = p.concession;
  const names = applied.map(a => {
    const c = _cnList().find(x => x.id === a.id);
    return c ? c.reason + ', approved by ' + (c.approvedByName || 'an admin') : '';
  });
  p.concessionDesc = [p.concessionManualDesc || ''].concat(names).filter(Boolean).join(' · ');

  const bill = calculateBill(p);
  p.unpaid   = Math.max(0, bill - money(p.amount));
  p.overpaid = Math.max(0, money(p.amount) - bill);
  p.status   = p.unpaid > 0 ? 'Pending' : 'Paid';
  if (p.status === 'Paid' && !p.paidDate) p.paidDate = typeof today === 'function' ? today() : '';
  if (typeof ledgerTrack === 'function') ledgerTrack(p);
  return true;
}

/** The warden has seen the outcome of their request on this concession. */
function cnMarkSeen(id) {
  const c = _cnList().find(x => x && x.id === id);
  const role = _cnRole();
  if (!c || !c.lastOutcome || c.lastOutcome.requestedBy !== role || c.lastOutcome.seenAt) return false;
  c.lastOutcome.seenAt = new Date().toISOString();
  return true;
}

/** The bell's link for a warden's outcome: mark it seen, then open the student. */
function cnSeen(id) {
  const c = _cnList().find(x => x && x.id === id);
  if (cnMarkSeen(id)) {
    if (typeof saveDB === 'function') saveDB();
    if (typeof refreshNotifBell === 'function') refreshNotifBell();
  }
  if (c && typeof showStudentPanel === 'function') showStudentPanel(c.studentId, 'financial');
}

const CN_BELL_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>';

/** Bell entries: requests waiting for an admin; outcomes a warden has not seen.
    The bell inserts `msg` as HTML (nav.js), so names are escaped here. */
function cnAlerts() {
  const out = [];
  const role = _cnRole();
  if (!role) return out;
  if (cnIsAdmin()) {
    cnQueue().forEach(q => {
      const who = q.kind === 'start' ? q.c.requestedByName : (q.c.endRequest && q.c.endRequest.requestedByName);
      out.push({ hue: 'dh-amber', icon: CN_BELL_ICON, go: "usersTab='wardens';navigate('users')",
        msg: (q.kind === 'start' ? 'Concession requested' : 'End of concession requested')
          + ' — ' + escHtml(_cnName(q.c)) + ' (by ' + escHtml(who || 'a warden') + ')' });
    });
  }
  _cnList().forEach(c => {
    const l = c && c.lastOutcome;
    if (!l || l.requestedBy !== role || l.seenAt || l.by === role) return;
    out.push({ hue: l.outcome === 'approved' ? 'dh-green' : 'dh-red', icon: CN_BELL_ICON,
      go: "cnSeen('" + escHtml(c.id) + "')",
      msg: 'Your ' + (l.kind === 'start' ? 'concession' : 'end-of-concession') + ' request for '
        + escHtml(_cnName(c)) + ' was ' + l.outcome });
  });
  return out;
}
