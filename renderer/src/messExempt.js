/* ─── HOSTYLLO — MESS EXEMPTION (warden ledger spec §2.6, §3.6, §5 step 7) ───

   The rules only; students.js and users.js draw the screens. Built to
   docs/WARDEN_LEDGER_STEP7_DESIGN.md — owner answers in
   docs/WARDEN_LEDGER_SCHEMA_PROPOSAL.md ("Step 7 decisions").

   · Only in a "Rent + mess together" hostel (serviceModel rent_mess_bundled).
     Elsewhere a student's flag is kept but billing ignores it (resolveCharges).
   · A warden REQUESTS a start or an end, with a reason. One waiting request per
     student. An admin (Manage users) approves or declines — a decline needs a
     note. An admin's own request is approved at once.
   · Start approved: resolveCharges() bills rent only from then on, and this
     month's record, if not fully paid, loses its mess now — a ledger adjustment
     reading "Mess exemption: <reason>". Paid and older months are untouched,
     and collected money is never changed.
   · End approved: mess is billed again from the next generated month.

   Fields on the student record (schema §2.6, Q14 — no start date):
     messExempt, messExemptReason, messExemptApprovedBy(+Name, +At),
     messExemptRequest  { kind: 'start'|'end', reason, requestedBy, requestedByName, requestedAt } | null
     messExemptLast     { kind, outcome: 'approved'|'declined', note, by, byName, at, requestedBy, seenAt }

   Plain function declarations, no module syntax — it runs in the browser and in
   the vm sandbox of tests/messExempt.test.js.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function _meRole() { return (typeof CUR_ROLE !== 'undefined' && CUR_ROLE) ? CUR_ROLE : null; }
function _meUser() { return (typeof CUR_USER !== 'undefined' && CUR_USER) ? CUR_USER : null; }
function _meFail(reason) { return { ok: false, reason: reason }; }
function _meLog(action, detail) {
  if (typeof logActivity === 'function') logActivity(action, detail, 'Students');
}
function _meStudent(id) { return (DB.students || []).find(s => s && s.id === id) || null; }

/** Does this hostel have exemptions at all? */
function meApplies() { return typeof serviceModel === 'function' && serviceModel() === 'rent_mess_bundled'; }

/** Is the signed-in account an admin (Manage users)? */
function meIsAdmin() { return typeof canDo === 'function' && canDo('users'); }

/** The student's waiting request, or null. */
function mePending(s) { return (s && s.messExemptRequest) || null; }

/** Every student with a waiting request, oldest first. */
function meQueue() {
  return (DB.students || []).filter(s => s && s.messExemptRequest)
    .sort((a, b) => String(a.messExemptRequest.requestedAt).localeCompare(String(b.messExemptRequest.requestedAt)));
}

/**
 * Ask to start or end a student's exemption. An admin's own request is decided
 * at once. Returns { ok, pending, reason?, adjusted? }.
 */
function meRequest(studentId, kind, reason) {
  const s = _meStudent(studentId);
  if (!s) return _meFail('That student could not be found.');
  if (!meApplies()) return _meFail('Mess exemptions apply only when every student pays rent and mess together.');
  const role = _meRole();
  if (!role) return _meFail('Sign in first.');
  if (kind !== 'start' && kind !== 'end') return _meFail('Unknown request.');
  const why = String(reason || '').trim();
  if (!why) return _meFail('Give a reason.');
  if (kind === 'start' && s.messExempt === true) return _meFail(s.name + ' is already exempt from the mess.');
  if (kind === 'end' && s.messExempt !== true) return _meFail(s.name + ' is not exempt from the mess.');
  if (s.messExemptRequest) return _meFail('A request for ' + s.name + ' is already waiting for an admin.');

  const u = _meUser();
  const req = { kind, reason: why, requestedBy: role, requestedByName: (u && u.name) || '',
                requestedAt: new Date().toISOString() };
  if (meIsAdmin()) return _meDecide(s, req, 'approved', '');

  s.messExemptRequest = req;
  _meLog(kind === 'start' ? 'Mess Exemption Requested' : 'Mess Exemption End Requested', s.name + ' — ' + why);
  return { ok: true, pending: true };
}

/** An admin approves the waiting request. */
function meApprove(studentId) {
  if (!meIsAdmin()) return _meFail('Only an account that manages users can approve this.');
  const s = _meStudent(studentId);
  if (!s || !s.messExemptRequest) return _meFail('There is no waiting request for that student.');
  if (!meApplies()) return _meFail('Mess exemptions apply only when every student pays rent and mess together.');
  return _meDecide(s, s.messExemptRequest, 'approved', '');
}

/** An admin declines the waiting request; a note is required. */
function meDecline(studentId, note) {
  if (!meIsAdmin()) return _meFail('Only an account that manages users can decline this.');
  const s = _meStudent(studentId);
  if (!s || !s.messExemptRequest) return _meFail('There is no waiting request for that student.');
  const why = String(note || '').trim();
  if (!why) return _meFail('Write why it is declined.');
  return _meDecide(s, s.messExemptRequest, 'declined', why);
}

function _meDecide(s, req, outcome, note) {
  const now = new Date().toISOString();
  const role = _meRole();
  const u = _meUser();
  let adjusted = 0;
  if (outcome === 'approved') {
    if (req.kind === 'start') {
      s.messExempt = true;
      s.messExemptReason = req.reason;
      s.messExemptApprovedBy = role;
      s.messExemptApprovedByName = (u && u.name) || '';
      s.messExemptApprovedAt = now;
      adjusted = _meApplyToCurrentMonth(s, req.reason);
    } else {
      s.messExempt = false;
    }
  }
  s.messExemptRequest = null;
  s.messExemptLast = { kind: req.kind, outcome, note: note || '', by: role, byName: (u && u.name) || '',
                       at: now, requestedBy: req.requestedBy, seenAt: req.requestedBy === role ? now : null };
  _meLog('Mess Exemption ' + (req.kind === 'start' ? 'Start ' : 'End ') + (outcome === 'approved' ? 'Approved' : 'Declined'),
    s.name + ' — ' + req.reason + (note ? ' · ' + note : ''));
  return { ok: true, pending: false, outcome, adjusted };
}

/* This month's record, if not fully paid, loses its mess now. */
function _meApplyToCurrentMonth(s, reason) {
  const key = typeof thisMonth === 'function' ? thisMonth() : '';
  let n = 0;
  (DB.payments || []).forEach(p => {
    if (!p || p.studentId !== s.id) return;
    const inMonth = typeof _payMatchesMonth === 'function' ? _payMatchesMonth(p, key) : false;
    if (!inMonth) return;
    if (calculateOutstanding(p) <= 0) return;
    if (p.messIncluded === false || money(p.messCharge) <= 0) return;
    p.messIncluded = false;
    const bill = calculateBill(p);
    p.unpaid   = Math.max(0, bill - money(p.amount));
    p.overpaid = Math.max(0, money(p.amount) - bill);
    p.status   = p.unpaid > 0 ? 'Pending' : 'Paid';
    if (p.status === 'Paid' && !p.paidDate) p.paidDate = typeof today === 'function' ? today() : '';
    if (typeof ledgerTrack === 'function') ledgerTrack(p, { why: 'Mess exemption: ' + reason });
    n++;
  });
  return n;
}

/** The warden has seen the outcome of their request for this student. */
function meMarkSeen(studentId) {
  const s = _meStudent(studentId);
  const role = _meRole();
  if (!s || !s.messExemptLast || s.messExemptLast.requestedBy !== role || s.messExemptLast.seenAt) return false;
  s.messExemptLast.seenAt = new Date().toISOString();
  return true;
}

/** The bell's link for a warden's outcome: mark it seen, then open the student. */
function meSeen(studentId) {
  if (meMarkSeen(studentId)) {
    if (typeof saveDB === 'function') saveDB();
    if (typeof refreshNotifBell === 'function') refreshNotifBell();
  }
  if (typeof showStudentPanel === 'function') showStudentPanel(studentId);
}

const ME_BELL_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>';

/** Bell entries: requests waiting for an admin; outcomes a warden has not seen.
    The bell inserts `msg` as HTML (nav.js), so names are escaped here. */
function meAlerts() {
  const out = [];
  const role = _meRole();
  if (!role) return out;
  if (meIsAdmin()) {
    meQueue().forEach(s => {
      const r = s.messExemptRequest;
      out.push({ hue: 'dh-amber', icon: ME_BELL_ICON, go: "usersTab='wardens';navigate('users')",
        msg: (r.kind === 'start' ? 'Mess exemption requested' : 'End of mess exemption requested')
          + ' — ' + escHtml(s.name) + ' (by ' + escHtml(r.requestedByName || 'a warden') + ')' });
    });
  }
  (DB.students || []).forEach(s => {
    const l = s && s.messExemptLast;
    if (!l || l.requestedBy !== role || l.seenAt || l.by === role) return;
    out.push({ hue: l.outcome === 'approved' ? 'dh-green' : 'dh-red', icon: ME_BELL_ICON,
      go: "meSeen('" + escHtml(s.id) + "')",
      msg: 'Your ' + (l.kind === 'start' ? 'mess exemption' : 'end-of-exemption') + ' request for '
        + escHtml(s.name) + ' was ' + l.outcome });
  });
  return out;
}
