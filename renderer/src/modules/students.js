/* ─── HOSTYLLO — STUDENTS MODULE ─────────────────────────────────────────────
   Contains: renderStudents, showAddStudentModal, submitAddStudent,
             showViewStudentModal, showEditStudentModal, submitEditStudent,
             confirmDeleteStudent, showRoomShiftModal, submitRoomShift,
             photo upload/camera,
             printStudentCard, downloadAllStudentsPDF, formerStudents flow,
             filterRoomSearch, pickRoomSearch, extra charge helpers
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   STUDENTS v5 — shared helpers
   ══════════════════════════════════════════════════════════════════════════ */

// roomId → room, built once per call instead of DB.rooms.find() per row.
function _stuRoomMap() { return new Map(DB.rooms.map(r => [r.id, r])); }

/* ── FEE STATUS, COMPUTED ONCE PER RENDER ─────────────────────────────────────
   `calculateFeeStatus()` scans DB.payments for one student, which is fine once
   and expensive in a comparator: applySort() calls its accessor INSIDE the sort
   callback, so sorting the roster by fee would rescan every payment O(n log n)
   times — on a three-year hostel that is millions of record touches for one
   click on a column header.

   So the whole map is built once and shared by the filter, the sort and the
   cells of a single render. Spec §44: "memoize filtered/sorted local datasets".

   INVALIDATED AT THE TOP OF EVERY RENDER rather than on a timer or a length
   check. renderPage() re-runs renderStudents() after every save, so a render is
   exactly the boundary at which the data may have changed — and a stale fee
   badge is a warden chasing a student who has just paid. */
let _stuFeeMemo = null;
function _stuFeeReset() { _stuFeeMemo = null; }
function _stuFee(id) {
  if (!_stuFeeMemo) {
    _stuFeeMemo = new Map();
    // One pass over the payments, bucketed by student, instead of one scan per
    // student. The per-student call is still the authority — this only decides
    // which records it is handed.
    const byStudent = new Map();
    for (const p of (DB.payments || [])) {
      if (!p || !p.studentId) continue;
      let a = byStudent.get(p.studentId);
      if (!a) { a = []; byStudent.set(p.studentId, a); }
      a.push(p);
    }
    for (const t of (DB.students || [])) {
      _stuFeeMemo.set(t.id, calculateFeeStatus(t.id, { payments: byStudent.get(t.id) || [] }));
    }
  }
  return _stuFeeMemo.get(id)
      || { status: 'Paid', outstanding: 0, overdue: 0, overdueAmount: 0,
           records: 0, lastPaymentDate: '', nextDueDate: '', credit: 0 };
}

/* ── WHICH MONTHS A STUDENT BELONGS TO ───────────────────────────────────────
   A student is not an event, so unlike a payment or a departure they do not
   belong to one month. They belong to every month they were living here, which
   is the owner's rule stated exactly: "the living student data should only be
   promoted to next month, and next month['s] student and payments etc added
   should not be shown in previous [month's] data".

   So, for a scope of August:
     - admitted in June, still here      -> in August  (carried forward)
     - admitted 3 September              -> NOT in August (they were not here)
     - left 20 August                    -> in August  (they were here for 20 days)
     - left 28 July                      -> NOT in August (already gone)

   A student with no join date recorded is kept rather than dropped: the field
   was optional in older records, and dropping them would silently shrink the
   roster of the hostels that have been running longest. */
function _stuScopeBounds(mk) {
  if (/^\d{4}$/.test(mk)) return [mk + '-01', mk + '-12'];
  return [mk, mk];
}
function _stuInMonth(t) {
  const mk = studentFilter.month;
  if (!mk) return true;
  const [from, to] = _stuScopeBounds(mk);
  const joined = _toMonthKey(t && t.joinDate);
  if (joined && joined > to) return false;          // not admitted yet
  // Only a departure that has actually happened removes them. Someone on
  // notice is still living here, which is the whole point of 'Cancelling'.
  const left = (t && t.status === 'Left') ? _toMonthKey(t.leftDate) : null;
  if (left && left < from) return false;            // already gone
  return true;
}

function _stuMonthOptions() {
  const months = new Set([thisMonth()]);
  (DB.students || []).forEach(t => {
    const j = _toMonthKey(t.joinDate); if (j) months.add(j);
    const l = _toMonthKey(t.leftDate); if (l) months.add(l);
  });
  // A whole-year entry per year. _stuScopeBounds() already widens a bare year
  // to January..December, so nothing else has to know about it.
  const years = new Set([...months].map(m => m.slice(0, 4)));
  return [...months, ...years].sort().reverse();
}

function _stuMonthLabel(key) {
  if (!key) return 'All months';
  if (/^\d{4}$/.test(key)) return 'All of ' + key;
  const d = new Date(key + '-01T00:00:00');
  return isNaN(d) ? key : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function stuSetMonth(v) {
  studentFilter.month = v;
  studentFilter.page = 1;
  renderPage('students');
}

// The one filter+sort pipeline. The table, the stat strip and the CSV export
// all read from here, so they cannot drift apart.
function studentsFiltered() {
  const byId = _stuRoomMap();
  let list = DB.students.filter(t => {
    if (!_stuInMonth(t)) return false;
    if (studentFilter.status !== 'All' && t.status !== studentFilter.status) return false;
    const room = byId.get(t.roomId);
    if (studentFilter.room !== 'All' && String(room ? room.number : '') !== studentFilter.room) return false;
    if (studentFilter.course !== 'All' && String(t.occupation || t.course || '') !== studentFilter.course) return false;
    /* The charge plan, resolved the same way the Charges column resolves it.
       'course' stays in the object because Advanced Filters still reports it
       and a saved value must keep working; it simply has no control any more. */
    if (studentFilter.plan && studentFilter.plan !== 'All' && stuPlanOf(t) !== studentFilter.plan) return false;
    // Paid / Pending / Overdue, from calculateFeeStatus() in finance.js — which
    // aggregates calculateOutstanding() and payments.js's payIsOverdue() rather
    // than deciding anything itself, so this filter cannot disagree with the
    // Payments screen about the same student.
    if (studentFilter.fee && studentFilter.fee !== 'All'
        && _stuFee(t.id).status !== studentFilter.fee) return false;
    // Step 11: signed undertaking on file, or not (undertaking.js).
    if (studentFilter.und && studentFilter.und !== 'All' && !undFilterMatch(t, studentFilter.und)) return false;
    if (studentFilter.search) {
      const s = studentFilter.search.toLowerCase();
      const hay = [t.name, t.fatherName, t.id, t.cnic, t.phone, t.email, t.address,
                   t.emergencyContact, t.occupation || t.course,
                   room && String(room.number), room && room.floor];
      if (!hay.some(f => f && String(f).toLowerCase().includes(s))) return false;
    }
    return true;
  });
  return applySort(list, studentFilter, {
    id:     t => t.id,
    name:   t => t.name,
    // cmpRoomNo, not Number(): the Add Room form accepts 'A 01' and 'B 02-a',
    // which Number() reads as NaN and a plain string compare orders 1, 10, 2.
    room:   { get: t => { const r = byId.get(t.roomId); return r ? r.number : ''; }, cmp: cmpRoomNo },
    course: t => t.occupation || t.course || '',
    status: t => t.status,
    /* Ordered by urgency, not alphabetically: Overdue, Pending, Paid. Sorting a
       column of states by their spelling puts Overdue between Paid and Pending,
       which is the one arrangement that tells a warden nothing. */
    fee:    t => ({ Overdue: 0, Pending: 1, Paid: 2 })[_stuFee(t.id).status]
  });
}

// Stable avatar hue from the name, so a student keeps the same colour across
// sorts and filters.
function stuAvatarHue(name) {
  const hues = ['dh-violet','dh-blue','dh-green','dh-amber','dh-red'];
  let h = 0; const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

/* Amber is the LIVE signal — someone leaving on a date the warden has to act
   on — so it belongs to 'Cancelling', not to 'Left'. A student who has already
   gone needs nothing from anybody and reads as neutral history; painting them
   amber spent the one colour that means "attention" on the one state that
   needs none, and left the state that does need it grey. */
/* Fee hues follow the spec's table: Paid green, Pending amber, Overdue red.
   Deliberately NOT the same palette call as stuStatusHue() below — the two
   badges sit side by side in every row and mean different things, so they are
   allowed to look alike only by coincidence, never by sharing a function. */
function stuFeeHue(status) {
  return status === 'Paid' ? 'dh-green' : status === 'Overdue' ? 'dh-red' : 'dh-amber';
}

/* The hover text. A badge reading "Overdue" with no figure sends the warden to
   another screen to find out how much; this says it in place. */
function stuFeeTitle(f) {
  if (f.records === 0) return 'No payment records for this student yet';
  if (f.status === 'Paid') {
    return f.credit > 0 ? fmtPKR(f.credit) + ' credit held' : 'Nothing outstanding';
  }
  const owed = fmtPKR(f.outstanding) + ' outstanding';
  if (f.status === 'Overdue') {
    return owed + ' · ' + f.overdue + ' month' + (f.overdue === 1 ? '' : 's')
         + ' past the due date';
  }
  return f.nextDueDate ? owed + ' · due ' + fmtDate(f.nextDueDate) : owed;
}

function stuStatusHue(s) {
  return s === 'Active' ? 'dh-green' : s === 'Cancelling' ? 'dh-amber'
       : s === 'Blacklisted' ? 'dh-red' : 'dh-slate';
}

function renderStudents() {
  _stuFeeReset();                       // this render's data, not the last one's
  const _roomById = _stuRoomMap();

  if (DB.students.length === 0) return `
    <div class="empty-state">
      <div class="icon">${icon('student','sm')}</div>
      <h3>No Students Yet</h3>
      <p style="margin-bottom:16px">Add your first student to get started</p>
      <button class="btn btn-primary" onclick="showAddStudentModal()">+ Add Student</button>
    </div>`;

  // There ARE students — just none in the month being looked at. Saying "No
  // Students Yet" here would tell a warden their roster had been wiped.
  if (studentFilter.month && !DB.students.some(_stuInMonth)) return `
    <div class="empty-state">
      <div class="icon">${icon('student','sm')}</div>
      <h3>Nobody was here in ${escHtml(_stuMonthLabel(studentFilter.month))}</h3>
      <p style="margin-bottom:16px">${DB.students.length} student${DB.students.length===1?'':'s'} on record in other months.</p>
      <button class="btn btn-primary" onclick="stuSetMonth('')">Show every month</button>
    </div>`;

  const students = studentsFiltered();
  const _pg = paginate(students, studentFilter);

  // Stat strip — counts over the WHOLE roster, not the filtered view, so the
  // cards stay a stable summary you can filter *by* rather than a readout that
  // changes as you narrow the table.
  // Scoped to the chosen month, not to the whole database. The cards still
  // ignore the search box and the other dropdowns — they are a summary you
  // filter BY, not a readout of the filtered table — but "Total Students" on a
  // hostel three years old was counting everyone who had ever stayed, which is
  // not a number anybody asks that page for.
  const _roster = DB.students.filter(_stuInMonth);
  const nTotal  = _roster.length;
  const nActive = _roster.filter(t=>t.status==='Active').length;
  const nLeft   = _roster.filter(t=>t.status==='Left').length;
  const nBlack  = _roster.filter(t=>t.status==='Blacklisted').length;
  /* THE CARDS HAVE TO ADD UP TO TOTAL.

     'Cancelling' is a fourth status and no card counted it, so from the moment
     anybody gave notice the strip read e.g. Total 40, Active 38, Left 1,
     Blacklisted 0 — and the owner is left to wonder which student the app has
     lost. On Notice is that missing card.

     It appears only when somebody is on notice, which is the same rule the
     status filter below already follows: an always-visible card reading 0 is
     clutter on the ~95% of days nobody is leaving, and with nobody on notice
     the other three sum to Total on their own anyway. */
  const nCanc   = _roster.filter(t=>t.status==='Cancelling').length;
  const occRooms  = DB.rooms.filter(r=>getRoomOccupancy(r)>0).length;
  const occPct    = DB.rooms.length ? Math.round(occRooms/DB.rooms.length*100) : 0;

  const roomNums = [...new Set(DB.students.map(t=>{const r=_roomById.get(t.roomId);return r?String(r.number):'';}).filter(Boolean))].sort(cmpRoomNo);
  const courses  = [...new Set(DB.students.map(t=>String(t.occupation||t.course||'')).filter(Boolean))].sort();
  const activeFilters = [studentFilter.room!=='All', (studentFilter.plan||'All')!=='All',
                         studentFilter.fee!=='All', (studentFilter.und||'All')!=='All'].filter(Boolean).length;

  const th = (key,label,extra) => {
    const on = studentFilter.sortKey===key;
    const arw = on ? (studentFilter.sortDir==='asc'?'▲':'▼') : '⇅';
    return `<th class="is-sortable${on?' is-sorted':''}" ${extra||''} onclick="toggleSort(studentFilter,'students','${key}')" title="Sort by ${label}">${label}<span class="arw">${arw}</span></th>`;
  };
  /* THE OFFICIAL MARK, drawn neutral (owner, 2026-09-09: "use official neutral
     whatsapp logo"). The old one was a hand-approximated speech bubble with no
     handset in it — recognisable as "a chat app", not as WhatsApp. This is the
     brand's own outline: the bubble with the tail bottom-left and the handset
     inside it. It takes currentColor rather than the brand green, because a
     table of forty rows with forty saturated green marks in it is a table with
     a colour problem, and the column beside it is already carrying meaning. */
  const waIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-label="WhatsApp">'
    + '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24Z"/>'
    + '<path d="M9.36 7.2c-.19-.42-.38-.43-.56-.44h-.47c-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.05s.89 2.38 1.01 2.54c.12.17 1.71 2.74 4.22 3.73 2.09.82 2.51.66 2.97.62.46-.04 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.06-.1-.23-.16-.47-.29-.25-.12-1.48-.73-1.71-.81-.23-.09-.4-.13-.56.12-.17.25-.64.81-.79.98-.14.16-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.55-1.34-.75-1.83Z"/></svg>';
  /* A pin, not a coloured map marker (owner: "use neutral location svg"). */
  const pinIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  const phIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

  return `
  <!-- ══ STAT STRIP ══ -->
  <div class="stu-stats">
    <div class="stu-stat stu-stat--click" onclick="stuSetStatus('All')" title="Show every student">
      <div class="stu-stat__label">${studentFilter.month?'Students in '+escHtml(/^\d{4}$/.test(studentFilter.month)?studentFilter.month:_stuMonthLabel(studentFilter.month).split(' ')[0]):'Total Students'}</div>
      <div class="stu-stat__val">${nTotal}</div>
      <div class="stu-stat__sub">${studentFilter.month?'On the roster that month':'Registered, all time'}</div>
    </div>

    <div class="stu-stat stu-stat--click" onclick="stuSetStatus('Active')" title="Show only active students">
      <div class="stu-stat__label">Active</div>
      <div class="stu-stat__val is-good">${nActive}</div>
      <div class="stu-stat__sub">Students</div>
    </div>

    ${nCanc?`<div class="stu-stat stu-stat--click" onclick="stuSetStatus('Cancelling')" title="Show only students who have given notice">
      <div class="stu-stat__label">On Notice</div>
      <div class="stu-stat__val">${nCanc}</div>
      <div class="stu-stat__sub">Bed held till vacate date</div>
    </div>`:''}

    <div class="stu-stat stu-stat--click" onclick="stuSetStatus('Left')" title="Show only students who have left">
      <div class="stu-stat__label">Left</div>
      <div class="stu-stat__val">${nLeft}</div>
      <div class="stu-stat__sub">Students</div>
    </div>

    <div class="stu-stat stu-stat--click" onclick="stuSetStatus('Blacklisted')" title="Show only blacklisted students">
      <div class="stu-stat__label">Blacklisted</div>
      <div class="stu-stat__val is-bad">${nBlack}</div>
      <div class="stu-stat__sub">Students</div>
    </div>

    <div class="stu-stat stu-stat--click" onclick="navigate('rooms')" title="Go to Rooms">
      <div class="stu-stat__label">Occupied Rooms</div>
      <div class="stu-stat__val">${occRooms}<small> / ${DB.rooms.length}</small></div>
      <div class="stu-stat__sub">${occPct}% occupied</div>
    </div>
  </div>

  <!-- ══ TOOLBAR ══ -->
  <div class="stu-panel">
    <div class="stu-tools">
      <div class="stu-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        <input id="search-students" class="lk-sin" placeholder="Search by name, father, ID, CNIC, phone, email, room, course…"
          value="${escHtml(studentFilter.search)}"
          oninput="capFirstChar(this);studentFilter.search=this.value;studentFilter.page=1;_dStudents()">
        ${lkSearchX('search-students','studentFilter','students')}
      </div>

      <select class="stu-select${studentFilter.month?' is-set':''}" onchange="stuSetMonth(this.value)" title="Show the roster for one month">
        <option value="" ${!studentFilter.month?'selected':''}>All months</option>
        ${_stuMonthOptions().map(k=>`<option value="${escHtml(k)}" ${studentFilter.month===k?'selected':''}>${escHtml(_stuMonthLabel(k))}</option>`).join('')}
      </select>

      <select class="stu-select${studentFilter.room!=='All'?' is-set':''}" onchange="studentFilter.room=this.value;studentFilter.page=1;renderPage('students')" title="Filter by room">
        <option value="All">All Rooms</option>
        ${roomNums.map(r=>`<option value="${escHtml(r)}" ${studentFilter.room===r?'selected':''}>Room ${escHtml(r)}</option>`).join('')}
      </select>

      ${''/* COURSES OUT, CHARGE PLAN IN (owner, 2026-09-09). The course is on
             every row already and a hostel's list of them is long and
             unstable — it was a dropdown nobody filtered by. What a warden
             does ask for is "who is on the mess", which nothing could answer
             until now: the plan is resolved per student by resolveCharges(),
             the same call the Charges column prints, so the filter and the
             column can never disagree. */}
      <select class="stu-select${studentFilter.plan&&studentFilter.plan!=='All'?' is-set':''}" onchange="studentFilter.plan=this.value;studentFilter.page=1;renderPage('students')" title="Filter by what the student is charged for">
        <option value="All">Rent &amp; mess: all</option>
        <option value="both" ${studentFilter.plan==='both'?'selected':''}>Rent + mess</option>
        <option value="rent" ${studentFilter.plan==='rent'?'selected':''}>Rent only</option>
        <option value="mess" ${studentFilter.plan==='mess'?'selected':''}>Mess only</option>
      </select>

      ${''/* Step 11 (spec §3.8): students without a signed undertaking on file. */}
      <select class="stu-select${studentFilter.und&&studentFilter.und!=='All'?' is-set':''}" id="stu-und-filter" aria-label="Undertaking" onchange="studentFilter.und=this.value;studentFilter.page=1;renderPage('students')" title="Filter by a signed undertaking on file">
        <option value="All">Undertaking: all</option>
        <option value="scan" ${studentFilter.und==='scan'?'selected':''}>Signed scan on file</option>
        <option value="noscan" ${studentFilter.und==='noscan'?'selected':''}>No signed scan</option>
      </select>

      <select class="stu-select${studentFilter.status!=='All'?' is-set':''}" onchange="studentFilter.status=this.value;studentFilter.page=1;renderPage('students')" title="Filter by status">
        ${(() => {
          // 'Cancelling' only appears once somebody is on notice — an empty
          // status in the list is a dead end, but a resident the filter cannot
          // reach is worse.
          const opts = ['All','Active','Left','Blacklisted'];
          if (DB.students.some(t=>t.status==='Cancelling')) opts.splice(2,0,'Cancelling');
          if (studentFilter.status!=='All' && opts.indexOf(studentFilter.status)===-1) opts.push(studentFilter.status);
          return opts.map(s=>`<option value="${escHtml(s)}" ${studentFilter.status===s?'selected':''}>${s==='All'?'All Status':escHtml(s)}</option>`).join('');
        })()}
      </select>

      ${''/* FEE STATUS IS IN ADVANCED FILTERS, NOT HERE, and that is the spec's
             own instruction rather than a space-saving compromise. §17: keep
             Advanced Filters "for secondary filters rather than making the
             primary filter bar too crowded". Putting it inline was exactly the
             crowding it warns about — at 1054px, the width the design is drawn
             at, the eighth control pushed the bar onto a second row and cost
             the table 44px. student22.png shows eight controls on one line and
             this is not one of them. */}
      <div style="position:relative">
        <button class="stu-btn${activeFilters?' stu-btn--hue dh-blue':''}" onclick="stuTogglePop(event)" title="Secondary filters">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>
          Advanced Filters${activeFilters?`<span class="stu-btn__count">${activeFilters}</span>`:''}
        </button>
        <div class="stu-pop" id="stu-pop" style="display:none">
          ${''/* It was a READOUT — four rows restating what the selects above
                 already showed, and nothing to act on. §17 asks this to hold
                 "secondary filters", so the one filter the primary bar has no
                 room for now lives here as a real control, and the rest stay as
                 the summary they were. */}
          <div class="stu-pop__t">Fee status</div>
          <div class="stu-pop__fee">
            ${['All','Paid','Pending','Overdue'].map(f=>`
              <button class="stu-pop__chip${studentFilter.fee===f?' is-on':''}"
                      onclick="stuSetFee('${f}')">${f==='All'?'Any':f}</button>`).join('')}
          </div>
          <div class="stu-pop__sep"></div>
          <div class="stu-pop__t">Active filters</div>
          <div class="stu-pop__row" style="cursor:default">Room: <b style="color:var(--text)">${studentFilter.room==='All'?'Any':escHtml(studentFilter.room)}</b></div>
          <div class="stu-pop__row" style="cursor:default">Charged for: <b style="color:var(--text)">${(studentFilter.plan||'All')==='All'?'Any':(studentFilter.plan==='both'?'Rent + mess':studentFilter.plan==='rent'?'Rent only':'Mess only')}</b></div>
          <div class="stu-pop__row" style="cursor:default">Status: <b style="color:var(--text)">${studentFilter.status}</b></div>
          <div class="stu-pop__sep"></div>
          <div class="stu-pop__row" onclick="stuResetFilters()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
            Reset all filters
          </div>
          <div class="stu-pop__row" onclick="closeStuPop();downloadAllStudentsPDF()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            Download PDF report
          </div>
        </div>
      </div>

      ${/* One Export control, both formats inside it (owner, 2026-09-08).
            Clear all sits beside it and appears only when something is set —
            both come from src/toolbar.js, so all six list screens behave the
            same way. */''}
      <span style="margin-left:auto"></span>
      ${tbExport({ id:'stu-export', cls:'stu-btn stu-btn--primary',
                   excel:'exportStudentsExcel()', pdf:'exportStudentsPDF()' })}
    </div>

    ${stuSelected.size>0?`
    <div class="stu-bulk dh-blue">
      <span class="stu-bulk__n">${stuSelected.size} selected</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="stu-btn" onclick="stuBulkExport()">Export selected</button>
        <button class="stu-btn" onclick="stuSelected.clear();renderPage('students')">Clear</button>
      </div>
    </div>`:''}

    <!-- ══ TABLE ══ -->
    <div class="stu-table-wrap">
      <table class="stu-table">
        ${''/* ONE COLGROUP IS THE COLUMN WIDTHS, and nothing else sets them.

               They were per-cell `th:nth-child(n)` percentages, and the header
               checkbox carried an inline `style="width:36px"` that outbid its
               own percentage — so the specified widths no longer summed to the
               table and the browser took the difference out of the LAST column:
               the actions cell resolved to 10px and the kebab was clipped away
               entirely. A colgroup cannot be outbid by a cell, it is read in
               one place, and the total is checkable by eye. */}
        <colgroup>
          ${''/* CNIC AND NATIONALITY WERE BOTH TOO NARROW FOR REAL VALUES, and
                 a fixed layout does not tell you — it just paints the overflow
                 under the next column. A CNIC is 15 characters (17101-3012345-6)
                 in a 53px cell, and "Pakistani" is a chip with padding in a 59px
                 one, so both appeared to be swallowed by the column to their
                 right. Widened from the two columns that were carrying slack:
                 the student name no longer needs 169px now that the identity
                 gutter is tight, and an address is a wrapping cell that can take
                 a narrower measure. Still sums to exactly 100. */}
          ${''/* CNIC 7% → 11.4% (owner, 2026-09-10). It now shows the masked
                 form with the full number revealed on hover, and a value that
                 WRAPS cannot be swapped for a longer one without the row
                 changing height under the cursor — so the column has to hold
                 15 characters on ONE line.

                 MEASURED IN THE RUNNING APP AT THE 1366 FLOOR, not reasoned
                 about: both the mask and the number render at exactly 107px
                 (`font-variant-numeric: tabular-nums` gives the asterisks the
                 same advance as the digits they hide), and 7px of cell padding
                 each side makes that a 121px column. 11.4% is 123px.

                 THE 4.4% CAME MOSTLY FROM ACTIONS, 9% → 5.2%. That column holds
                 one 30px kebab. It was widened to 9% when a colgroup replaced
                 the per-cell widths, because before that it had collapsed to
                 10px and clipped the button away — but 9% is 98px for a 30px
                 control, and it was the largest reserve in the table.

                 Status took 0.8% of it rather than giving any up: "Cancelling"
                 is the longest badge here and it was being clipped at 8%.

                 Course and the charge gave the rest. Contact, the student name
                 and the nationality chip were all tried as donors first and
                 all three clipped — a phone number missing its last digit is a
                 wrong answer, not just an ugly one.

                 Sums to 99.5, which is what this colgroup has always summed to;
                 the browser gives the remainder to the last column. */}
          <col style="width:2.6%">   <!-- select      -->
          <col style="width:3.6%">   <!-- ID          -->
          <col style="width:15.3%">  <!-- student     -->
          <col style="width:9%">     <!-- room        -->
          <col style="width:11.5%">  <!-- contact     -->
          ${''/* NATIONALITY IS GONE (owner, 2026-09-15: "remove nationality
                 column from students page so that the CNIC, course and address
                 should relax a little"). Its 7% went to them: CNIC +1, course +2,
                 address +4. The field stays on the form, the profile and the PDF. */}
          <col style="width:12.4%">  <!-- CNIC        -->
          <col style="width:9.6%">   <!-- course      -->
          <col style="width:11.5%">  <!-- address     -->
          <col style="width:10%">    <!-- charges     -->
          <col style="width:8.8%">   <!-- status      -->
          <col style="width:5.2%">   <!-- actions     -->
        </colgroup>
        <thead><tr>
          <th><input type="checkbox" ${_pg.slice.length>0&&_pg.slice.every(t=>stuSelected.has(t.id))?'checked':''} onclick="stuToggleAll(this.checked)" title="Select all on this page"></th>
          ${th('id','ID')}
          ${th('name','Student')}
          ${th('room','Room')}
          <th>Contact / Emergency</th>
          <th>CNIC</th>
          ${th('course','Course')}
          <th>Address</th>
          ${''/* "Charges / month", not "Rent + Mess / mo". The old heading named
                the two components; the cell under it now shows the total and a
                badge saying which components are in it, so the heading naming
                them again was the third time the same fact appeared in one
                column. */}
          ${''/* FEE STATUS IS NOT A COLUMN ANY MORE (owner, 2026-09-09:
                 "remove payment status"). Whether this month is paid is a
                 question about a PAYMENT, and the payments register answers it
                 with the record attached; here it was a pill that went stale
                 the moment money was taken on another screen, in a table
                 already short of width. It survives as a FILTER in Advanced
                 Filters, which is how a warden actually uses it: "show me who
                 has not paid", not "read down this column". */}
          <th>Charges / month</th>
          ${th('status','Status')}
          <th>Actions</th>
        </tr></thead>
        <tbody>
        ${_pg.slice.length===0?`<tr><td colspan="11"><div class="stu-empty">No students match these filters.</div></td></tr>`:
        _pg.slice.map(t=>{
          const room  = _roomById.get(t.roomId);
          const rtype = room ? getRoomType(room) : null;
          const picked= stuSelected.has(t.id);
          const nm    = String(t.name||'?');
          const status= t.status||'Active';
          return `<tr class="${picked?'is-picked dh-blue':''}">
            <td onclick="event.stopPropagation()"><input type="checkbox" ${picked?'checked':''} onclick="stuToggleRow('${t.id}')"></td>
            ${''/* Plain text, not a pill. student22.png draws "#052" as type;
                   the pill cost 30px of a table that was overflowing its
                   container by 444px, and a badge around a number that is
                   already prefixed with # was decorating an identifier. */}
            <td class="stu-idc">#${escHtml(t.id)}</td>
            <td onclick="showStudentPanel('${t.id}')" style="cursor:pointer" title="Open student details">
              <div class="stu-who">
                ${studentAvatar(t, 32, stuAvatarHue(nm))}
                <div style="min-width:0">
                  <div class="stu-who__name" title="${escHtml(nm)}">${escHtml(nm)}</div>
                  ${''/* S/O or D/O BEFORE THE FATHER'S NAME (owner, 2026-09-15). From
                         the record's gender, or the hostel's default when it has
                         none; no prefix for "Other", rather than a wrong one. */}
                  ${t.fatherName?(()=>{const _g=String(t.gender||_stuDefaultGender()||'').toLowerCase();
                    const _rel=_g==='female'?'D/O':_g==='male'?'S/O':'';
                    return `<div class="stu-who__sub" title="${escHtml((_rel?_rel+' ':'')+t.fatherName)}">${_rel?`<span class="stu-who__rel">${_rel}</span> `:''}${escHtml(t.fatherName)}</div>`;})():''}
                </div>
              </div>
            </td>
            ${''/* ONE LIGHT LABEL, not two loose lines (owner, 2026-09-09 —
                   `students red.png`). The wrapper is what the pale ground and
                   the border hang on; without it the number and the floor were
                   two unrelated strings in the middle of a wide row. */}
            <td>
              <div class="stu-room">
                <div class="stu-room__n">${room?'#'+escHtml(String(room.number)):'—'}</div>
                ${room&&room.floor?`<div class="stu-room__t">${escHtml(stuFloorShort(room.floor))}</div>`:''}
                ${''/* The room type, inside the label under the floor (owner,
                       2026-09-15) — moved here from under the Payments room box. */}
                ${rtype&&rtype.name?`<div class="stu-room__t stu-room__type">${escHtml(rtype.name)}</div>`:''}
              </div>
            </td>
            ${''/* THE WHATSAPP MARK BELONGS TO THE STUDENT'S NUMBER, not the
                   guardian's (owner, 2026-09-09). The first number the intake
                   form asks for IS the student's WhatsApp — it is how the
                   hostel sends a receipt — and the second is the guardian's
                   voice line. The two glyphs were the wrong way round, which
                   told a warden to message the father and telephone the son. */}
            <td>
              <div class="stu-contact"><i class="stu-wa" title="Student's WhatsApp">${waIcon}</i>${escHtml(t.phone||'—')}</div>
              ${t.emergencyPhone||t.emergencyContact?`<div class="stu-contact__em"><i class="stu-ph" title="Guardian">${phIcon}</i>${escHtml(t.emergencyPhone||t.emergencyContact)}</div>`:''}
            </td>
            ${''/* MASKED, AND ON ONE LINE (owner, 2026-09-10: "make the cnic
                   detail in pages as it is in the pdf and only should be shovn
                   vhen cursor is placed upon it").

                   It used to break across its own hyphens over two or three
                   lines, because 15 characters would not fit the width this
                   table could spare. The mask is the same 15 characters, so
                   that constraint has not changed — but a value that wraps
                   cannot be swapped for the full number on hover without the
                   row changing height under the cursor, so the column was
                   widened to hold one line instead (see the colgroup) and both
                   halves are nowrap. `.stu-cnic` still carries the type
                   styling; cnicHtml() carries the mask and the reveal. */}
            <td>${t.cnic?`<span class="stu-cnic">${cnicHtml(t.cnic)}</span>`:'<span class="stu-dash">—</span>'}</td>
            ${''/* ONE LINE, THE REST ON HOVER (owner, 2026-09-15: "if has large text
                   then hidden half and Mdcat prep... and show default pop hover").
                   The native title is the hover; the address below does the same. */}
            <td class="stu-c-left">${t.occupation||t.course?`<span class="stu-course" title="${escHtml(t.occupation||t.course)}">${escHtml(t.occupation||t.course)}</span>`:'<span class="stu-dash">—</span>'}</td>
            <td class="stu-c-left">${t.address?`<span class="stu-addr" title="${escHtml(t.address)}"><i class="stu-pin">${pinIcon}</i><span class="stu-addr__t">${escHtml(t.address)}</span></span>`:'<span class="stu-dash">—</span>'}</td>
            ${(()=>{const c=resolveCharges(t),cov=chargeCoverage({rent:c.rent,mess:c.mess,messIncluded:c.messOptIn&&c.mess>0,hasMess:c.mess>0});
              return `<td>
                ${''/* THE SUB-LINE IS GONE (owner, 2026-09-06). It read
                       "+ PKR 7,000 mess" or "Mess not included" under the
                       total — and the warden setting those figures in Settings
                       is the same person reading this table. The badge below
                       already says WHICH plan the total covers, so the sub-line
                       was the same fact spelled out a second time, in a column
                       that was 116px wide in a table overflowing by 444px.
                       Total plus badge; the split is on the student's profile
                       and in the Rent & Mess settings that produced it. */}
                <div class="stu-charge" title="${c.configured?escHtml(cov.label):'No charge configured'}">${c.configured?fmtPKR(c.total):'<span class="stu-dash">not set</span>'}</div>
                <span class="stu-cov ${cov.hue}">${escHtml(cov.label)}</span>
              </td>`;})()}
            ${''/* THE STATUS NAMES A DATE, SO THE CELL PRINTS IT (owner,
                   2026-09-10). "Left" answers nothing a warden asks next, and
                   "On Notice" is worse — the bed is still occupied and the only
                   useful fact is the day it frees. statusDateNote() is shared,
                   so the same line appears wherever this status does. */}
            <td><span class="stu-pill ${stuStatusHue(status)}" title="${escHtml(status)}"><i></i>${escHtml(status)}</span>
                ${statusDateNote(t)}</td>
            ${''/* ONE BUTTON, THREE ACTIONS BEHIND IT (owner, 2026-09-06).
                   Three always-visible icons were 124px — the widest ornament
                   on the row, in a table that could not fit its columns. A menu
                   also names its actions in words, where three glyphs relied on
                   a tooltip nobody hovers for; and Delete stops sitting one
                   pixel from Edit, which is the adjacency that produces the
                   deletion nobody meant. */}
            <td class="stu-actc">
              ${''/* THREE DOTS, NO WORD (owner, 2026-09-09, second pass:
                     "the action buttons should be inside 3dots without actions
                     letters"). The labelling that matters is on the ITEMS —
                     View profile, Edit student, Delete student — which is where
                     a reader who opens the menu actually needs the words. The
                     word on the button itself cost 46px of a table that is
                     short of width, on every row. */}
              <button class="stu-kebab" onclick="event.stopPropagation();stuRowMenu('${t.id}',this)"
                      aria-haspopup="menu" aria-label="Actions for ${escHtml(nm)}" title="Actions">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
              </button>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>

    ${stuPager(_pg)}
  </div>`;
}

// Footer: page-size picker, range readout and the numbered pager.
function stuPager(pg) {
  const btn = (label, target, o) => {
    o = o || {};
    if (o.disabled) return `<button disabled>${label}</button>`;
    if (o.active)   return `<button class="is-on">${label}</button>`;
    return `<button onclick="gotoPage(studentFilter,'students',${target})">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1) + (lo>2?'<span class="stu-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page});
  if (hi < pages) nums += (hi<pages-1?'<span class="stu-pager__gap">…</span>':'') + btn(String(pages), pages);

  return `<div class="stu-foot">
    <div class="stu-foot__size">
      Show
      <select onchange="studentFilter.pageSize=Number(this.value);studentFilter.page=1;renderPage('students')">
        ${[10,30,50,100].map(n=>`<option value="${n}" ${studentFilter.pageSize===n?'selected':''}>${n}</option>`).join('')}
      </select>
      entries
    </div>
    <div class="stu-foot__info">${pg.total?`Showing ${pg.from} to ${pg.to} of ${pg.total} students`:'No students'}</div>
    <div class="stu-pager">
      ${btn('«',1,{disabled:page<=1})}
      ${btn('‹',page-1,{disabled:page<=1})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages})}
      ${btn('»',pages,{disabled:page>=pages})}
    </div>
  </div>`;
}

/* ── Students v5 — toolbar / selection behaviour ─────────────────────────── */
/* Chosen from Advanced Filters. The popover stays OPEN: picking a fee status
   is usually followed by reading the count, and a popover that closes on every
   click makes comparing Pending against Overdue a four-click job. */
function stuSetFee(f) {
  studentFilter.fee = f;
  studentFilter.page = 1;
  renderPage('students');
  setTimeout(() => { const p = document.getElementById('stu-pop'); if (p) p.style.display = 'block'; }, 0);
}

function stuSetStatus(s) {
  studentFilter.status = (studentFilter.status === s && s !== 'All') ? 'All' : s;
  studentFilter.page = 1;
  renderPage('students');
}
function stuResetFilters() {
  studentFilter.month=thisMonth(); studentFilter.status='All'; studentFilter.room='All'; studentFilter.course='All'; studentFilter.plan='All';
  studentFilter.fee='All'; studentFilter.und='All';
  studentFilter.search=''; studentFilter.page=1;
  stuSelected.clear();
  renderPage('students');
}
function closeStuPop() { const p=document.getElementById('stu-pop'); if(p) p.style.display='none'; }
function stuTogglePop(ev) {
  if (ev) ev.stopPropagation();
  const p = document.getElementById('stu-pop'); if (!p) return;
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', function (e) {
  const p = document.getElementById('stu-pop');
  if (p && p.style.display === 'block' && e.target.closest && !e.target.closest('#stu-pop')) p.style.display = 'none';
});

/* ═══════════════════════════════════════════════════════════════════════════
   STUDENT DETAILS — THE SLIDE-OVER  (Students spec §22-§30)
   ═══════════════════════════════════════════════════════════════════════════
   A right-side panel, not a page and not a full-screen modal. §22 puts it at
   400-480px and says so twice; the point is that the roster stays visible
   behind it, so a warden comparing two students does not lose their place in a
   table they have just filtered and sorted.

   EXACTLY FOUR TABS (§23), and the two that could not be honest about their
   data say so rather than inventing it:

     Overview      every field is on the record already
     Financial     calculateFeeStatus() + the student's real payment rows
     Documents     `docs` holds ONE key, `photo`. There is no CNIC scan and no
                   admission form in this data model, so the tab lists them as
                   not uploaded with the controls disabled. §28: "Do not pretend
                   files exist."
     Room History  DB.roomShifts is real — every shift records from/to rooms, a
                   date and a reason — so this reads records rather than
                   guessing. A student who has never moved gets a plain line
                   saying so, not a fabricated first row.

   ONE GUARDIAN PAIR (owner, 2026-09-06). §24 lists Guardian Name, Guardian
   Contact AND Emergency Contact, but the record carries a single pair —
   `emergencyContact` / `emergencyPhone` — which the in-flight Add Student work
   relabels as Guardian. It is shown once, under that label. Inventing a second
   pair to satisfy the list would put two fields on screen that no form fills.

   Rendered into one container that is replaced wholesale, and re-rendered in
   place when a tab is clicked so the panel never rebuilds its own header.   */

let _stuPanelId  = null;
let _stuPanelTab = 'overview';

function showStudentPanel(id, tab) {
  const t = DB.students.find(x => x.id === id);
  if (!t) { toast('Student not found', 'error'); return; }
  _stuPanelId  = id;
  _stuPanelTab = tab || 'overview';

  let host = document.getElementById('stu-panel-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'stu-panel-host';
    document.body.appendChild(host);
  }
  host.innerHTML = _stuPanelHtml(t);
  // The class lands on the next frame so the transform actually animates —
  // set in the same tick as the markup it would simply appear.
  requestAnimationFrame(() => {
    const p = document.getElementById('stu-panel');
    if (p) p.classList.add('is-open');
  });
  document.addEventListener('keydown', _stuPanelEsc, true);
}

function closeStudentPanel() {
  const p = document.getElementById('stu-panel');
  const host = document.getElementById('stu-panel-host');
  document.removeEventListener('keydown', _stuPanelEsc, true);
  _stuPanelId = null;
  if (!p) { if (host) host.innerHTML = ''; return; }
  p.classList.remove('is-open');
  // Wait for the slide out rather than yanking it — 200ms matches the CSS.
  setTimeout(() => { if (host) host.innerHTML = ''; }, 200);
}

/* ESCAPE CLOSES THE TOP LAYER, AND THIS LISTENS IN THE CAPTURE PHASE TO DO IT.
   app.js:180 already binds Escape to "close any open modal" — bubble phase, at
   load time, so it runs BEFORE anything registered later. Bubbling, this handler
   fired second, found the container app.js had just emptied, concluded no form
   was open and closed the panel too: ONE Escape shut both, and the warden was
   back at the table. In capture it runs first, sees the form that is actually
   on screen, and yields. */
function _stuPanelEsc(e) {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('modal-container');
  if (m && m.firstElementChild) return;
  closeStudentPanel();
}

/* ── REFRESHING WHAT IS ALREADY OPEN ──────────────────────────────────────────
   Called by closeModal(), so anything saved in a form over the panel shows the
   moment the form goes. The tab is kept: a warden who edited a fee from the
   Financial tab should come back to the Financial tab.

   The student may not survive the form — Delete is a modal too — so a missing
   record closes the panel rather than rendering an empty one. */
function refreshStudentPanel() {
  if (!_stuPanelId) return false;
  const host = document.getElementById('stu-panel-host');
  if (!host) { _stuPanelId = null; return false; }
  const t = DB.students.find(x => x.id === _stuPanelId);
  if (!t) { closeStudentPanel(); return false; }
  host.innerHTML = _stuPanelHtml(t);
  // Already on screen, so it must not replay the entry transition.
  const el = document.getElementById('stu-panel');
  if (el) el.classList.add('is-open');
  return true;
}

/* The one place that answers "refresh the student the user is looking at".
   Returns false when the panel is not the thing on screen, so the old modal
   stays the fallback for the dashboard, reports and rooms — all of which still
   open showViewStudentModal. */
function refreshStudentView(id) {
  if (!_stuPanelId) return false;
  if (id && _stuPanelId !== id) return false;
  return refreshStudentPanel();
}

/* ── MESS EXEMPTION ON THE PANEL (warden ledger spec §2.6, step 7) ─────────────
   A chip beside the room badge says where the student stands, and one action
   asks for the change. The rules are messExempt.js; only a "rent + mess
   together" hostel draws either. */
function _stuMeChip(t) {
  if (typeof meApplies !== 'function' || !meApplies()) return '';
  const r = t.messExemptRequest;
  if (r) {
    return '<span class="stu-pan__roombadge stu-pan__mechip is-wait" title="' + escHtml(r.reason || '') + '">'
      + (r.kind === 'start' ? 'Exemption requested' : 'End of exemption requested') + '</span>';
  }
  if (t.messExempt === true) {
    return '<span class="stu-pan__roombadge stu-pan__mechip" title="' + escHtml(t.messExemptReason || '') + '">Mess exempt</span>';
  }
  return '';
}

function _stuMeAction(t) {
  if (typeof meApplies !== 'function' || !meApplies() || t.messExemptRequest) return '';
  if (t.status && t.status !== 'Active' && t.status !== 'Cancelling') return '';
  const kind  = t.messExempt === true ? 'end' : 'start';
  const label = kind === 'start' ? 'Mess Exemption' : 'End Exemption';
  return `
      <button class="stu-pan__act" onclick="stuMeShowRequest('${escHtml(t.id)}','${kind}')" title="${
        meIsAdmin() ? (kind === 'start' ? 'Exempt this student from the mess' : 'End this exemption')
                    : (kind === 'start' ? 'Ask an admin to exempt this student from the mess' : 'Ask an admin to end this exemption')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg><span>${label}</span></button>`;
}

function stuMeShowRequest(id, kind) {
  if (typeof requireWritable === 'function' && !requireWritable('A mess exemption')) return;
  const t = DB.students.find(x => x.id === id);
  if (!t) return;
  const c = resolveCharges(t);
  const admin = meIsAdmin();
  const title = kind === 'start'
    ? (admin ? 'Exempt from mess' : 'Request mess exemption')
    : (admin ? 'End mess exemption' : 'Request end of exemption');
  const lead = kind === 'start'
    ? 'Mess of ' + fmtPKR(c.mess) + ' a month stops ' + (admin ? 'now' : 'once an admin approves')
      + ". This month's bill loses the mess too, if it is not fully paid."
    : 'Mess of ' + fmtPKR(c.mess) + ' a month is billed again from next month'
      + (admin ? '.' : ', once an admin approves.');
  showModal('modal-sm', escHtml(title) + ' — ' + escHtml(t.name || ''),
    `<div class="stu-me-req">
       <p style="margin:0 0 12px;color:var(--text2);line-height:1.5">${escHtml(lead)}</p>
       <div class="field"><label for="me-req-reason">Reason <span class="req">*</span></label>
         <textarea class="form-control" id="me-req-reason" rows="3" maxlength="200"
                   placeholder="${kind === 'start' ? "e.g. Medical — doctor's diet plan" : 'e.g. Back on the hostel mess'}"></textarea></div>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="stuMeDoRequest('${escHtml(id)}','${kind}')">${admin ? 'Save' : 'Send request'}</button>`);
}

async function stuMeDoRequest(id, kind) {
  const reason = document.getElementById('me-req-reason')?.value || '';
  const r = meRequest(id, kind, reason);
  if (!r.ok) { toast(r.reason, 'error'); return; }
  await saveDB();
  closeModal();
  if (typeof refreshNotifBell === 'function') refreshNotifBell();
  refreshStudentView(id);
  toast(r.pending ? 'Request sent — an admin approves it from Users → Wardens'
    : (kind === 'start'
        ? 'Exempt from mess' + (r.adjusted ? " — this month's unpaid bill no longer carries it" : '')
        : 'Exemption ended — mess is billed again from next month'), 'success');
}

/* ── STANDING CONCESSIONS ON THE PANEL (warden ledger spec §2.4, §3.9, step 8) ─
   One action asks for a concession (an admin's own applies at once); the
   Financial tab lists the student's concessions with their state and an End /
   Ask to end button. The rules are concessions.js. The payment forms' free
   Concession box is untouched (owner). */
function _stuCnAction(t) {
  if (typeof cnRequest !== 'function') return '';
  if (t.status && t.status !== 'Active' && t.status !== 'Cancelling') return '';
  return `
      <button class="stu-pan__act" onclick="stuCnShowRequest('${escHtml(t.id)}')" title="${
        cnIsAdmin() ? 'Add a standing concession' : 'Ask an admin for a standing concession'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg><span>Concession</span></button>`;
}

function stuCnShowRequest(id) {
  if (typeof requireWritable === 'function' && !requireWritable('A concession')) return;
  const t = DB.students.find(x => x.id === id);
  if (!t) return;
  const admin = cnIsAdmin();
  const withMess = typeof hostelServesMess === 'function' && hostelServesMess();
  const opt = (v, label, on) =>
    `<label class="stu-cn-opt"><input type="radio" name="cn-type" value="${v}"${on ? ' checked' : ''}><span>${label}</span></label>`;
  showModal('modal-sm', escHtml(admin ? 'Add a concession' : 'Request a concession') + ' — ' + escHtml(t.name || ''),
    `<div class="stu-cn-req">
       ${withMess
         ? `<div class="field"><label>Applies to</label>
              <div class="stu-cn-opts">${opt('rent', 'Rent', true)}${opt('mess', 'Mess')}${opt('both', 'Rent + Mess')}</div></div>`
         : '<input type="radio" name="cn-type" value="rent" checked hidden>'}
       <div class="field"><label for="cn-value">Amount per month (Rs.) <span class="req">*</span></label>
         <input class="form-control" id="cn-value" type="number" min="1" step="1" placeholder="e.g. 1500"></div>
       <div class="stu-cn-months">
         <div class="field"><label for="cn-from">From month <span class="req">*</span></label>
           <input class="form-control" id="cn-from" type="month" value="${escHtml(thisMonth())}"></div>
         <div class="field"><label for="cn-until">Until month <span class="opt">(optional)</span></label>
           <input class="form-control" id="cn-until" type="month"></div>
       </div>
       <div class="field"><label for="cn-reason">Reason <span class="req">*</span></label>
         <textarea class="form-control" id="cn-reason" rows="2" maxlength="160" placeholder="e.g. Financial hardship"></textarea></div>
       <p class="stu-cn-note">${admin
         ? 'Applies at once to unpaid months in range, and to months generated later. Paid months are not changed.'
         : 'Nothing changes until an admin approves it.'}</p>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="stuCnDoRequest('${escHtml(id)}')">${admin ? 'Save' : 'Send request'}</button>`);
}

async function stuCnDoRequest(id) {
  const type = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="cn-type"]:checked'));
  const r = cnRequest({
    studentId: id,
    type: type ? type.value : 'rent',
    value: Number(document.getElementById('cn-value')?.value),
    reason: document.getElementById('cn-reason')?.value || '',
    startMonth: document.getElementById('cn-from')?.value || '',
    endMonth: document.getElementById('cn-until')?.value || '',
  });
  if (!r.ok) { toast(r.reason, 'error'); return; }
  await saveDB();
  closeModal();
  if (typeof refreshNotifBell === 'function') refreshNotifBell();
  refreshStudentView(id);
  toast(r.pending ? 'Request sent — an admin approves it from Users → Wardens'
    : 'Concession added' + (r.applied ? ' — ' + r.applied + ' unpaid month' + (r.applied === 1 ? '' : 's') + ' updated' : ''),
    'success');
}

function _stuCnCard(t) {
  if (typeof cnForStudent !== 'function') return '';
  const list = cnForStudent(t.id);
  if (!list.length) return '';
  const admin = cnIsAdmin();
  const state = c => c.status === 'pending' ? ['dh-amber', 'Waiting']
    : c.status === 'approved' ? (c.endRequest ? ['dh-amber', 'End requested'] : ['dh-green', 'Active'])
    : c.status === 'ended' ? ['dh-slate', 'Ended'] : ['dh-red', 'Declined'];
  const rows = list.map(c => {
    const [hue, label] = state(c);
    return `<div class="stu-cn-row" data-concession="${escHtml(c.id)}">
      <div class="stu-cn-main">
        <div><b>${fmtPKR(c.value)}/month</b> · ${escHtml(cnTypeLabel(c.type))} · ${escHtml(cnMonthsLabel(c))}</div>
        <div class="stu-cn-why">${escHtml(c.reason)}${c.approvedByName ? ' · approved by ' + escHtml(c.approvedByName) : ''}${
          c.status === 'declined' && c.decidedNote ? ' · declined: ' + escHtml(c.decidedNote) : ''}</div>
      </div>
      <span class="lk-chip ${hue}">${label}</span>
      ${c.status === 'approved' && !c.endRequest
        ? `<button class="set-btn" onclick="stuCnShowEnd('${escHtml(c.id)}')">${admin ? 'End' : 'Ask to end'}</button>` : ''}
    </div>`;
  }).join('');
  // The Financial tab's own card — the same shell as the payment history below it.
  return '<section class="stu-pan__sec"><div class="svw-card svw-card--flush stu-cn-card">'
       + '<div class="svw-card__head dh-green svw-card__head--bar">'
       + '<span class="svw-card__ico">' + icon('tag', 'sm') + '</span>'
       + '<span>Concessions (' + list.length + ')</span></div>' + rows + '</div></section>';
}

function stuCnShowEnd(cid) {
  if (typeof requireWritable === 'function' && !requireWritable('Ending a concession')) return;
  const c = (DB.concessions || []).find(x => x.id === cid);
  if (!c) return;
  const admin = cnIsAdmin();
  showModal('modal-sm', admin ? 'End the concession' : 'Ask to end the concession',
    `<p style="margin:0 0 12px;color:var(--text2);line-height:1.5">${escHtml(fmtPKR(c.value))}/month on the ${escHtml(cnTypeLabel(c.type).toLowerCase())}
       stops from next month${admin ? '' : ', once an admin approves'}. This month keeps it.</p>
     <div class="field"><label for="cn-end-reason">Reason <span class="req">*</span></label>
       <textarea class="form-control" id="cn-end-reason" rows="2" maxlength="160"></textarea></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="stuCnDoEnd('${escHtml(cid)}')">${admin ? 'End it' : 'Send request'}</button>`);
}

async function stuCnDoEnd(cid) {
  const c = (DB.concessions || []).find(x => x.id === cid);
  const r = cnRequestEnd(cid, document.getElementById('cn-end-reason')?.value || '');
  if (!r.ok) { toast(r.reason, 'error'); return; }
  await saveDB();
  closeModal();
  if (typeof refreshNotifBell === 'function') refreshNotifBell();
  if (c) refreshStudentView(c.studentId);
  toast(r.pending ? 'Request sent to an admin' : 'Concession ended — it stops from next month', 'success');
}

function stuPanelTab(tab) {
  if (!_stuPanelId) return;
  const t = DB.students.find(x => x.id === _stuPanelId);
  if (!t) return;
  _stuPanelTab = tab;
  const body = document.getElementById('stu-panel-body');
  const host = document.getElementById('stu-panel');
  if (!body || !host) return;
  body.innerHTML = _stuPanelTabHtml(t, tab);
  host.querySelectorAll('.stu-pan__tab').forEach(b =>
    b.classList.toggle('is-on', b.dataset.tab === tab));
}

/* The card glyphs. Inline because they are one-offs at one size, and a sprite
   for six 14px icons costs more than it saves. */
const STU_PICO = {
  person: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  phone:  '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  book:   '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  bed:    '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  money:  '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  heart:  '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  note:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
};
function _pico(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
       + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
       + (STU_PICO[name] || '') + '</svg>';
}

/* ONE TITLED CARD, which is what the reference draws and what an uppercase
   rule could not do. The Overview was five <section>s separated by hairlines
   and a small-caps label; at 440px that reads as one continuous list with
   headings in it, and the eye has to parse the labels to find where "Current
   Room" stops. A bordered card with a tinted glyph beside its title gives each
   group an edge, so the panel can be scanned by shape instead of by reading. */
function _pcard(title, glyph, tone, rows, opts) {
  const o = opts || {};
  /* One student form holds every field on every card, so each card's Edit is
     the same modal — put there so a warden correcting the line they are reading
     does not have to scroll back to the action grid to find it. */
  const edit = o.edit
    ? '<button class="stu-pan__cedit" onclick="showEditStudentModal(&quot;'
      + escHtml(o.edit) + '&quot;)">Edit</button>'
    : '';
  return '<section class="stu-pan__card' + (o.wide ? ' is-wide' : '') + '">'
       + '<h4 class="stu-pan__card__h"><span class="stu-pan__card__i'
       + (tone ? ' ' + tone : '') + '">' + _pico(glyph) + '</span>'
       + escHtml(title) + edit + '</h4>'
       + '<div class="stu-pan__card__b' + (o.wide ? ' is-2col' : '') + '">'
       + rows + '</div></section>';
}

/** A field row. Missing values print an em dash — §24: only render what exists.
    `wide` spans both columns of the card grid: an address or a note is a
    sentence, and a sentence in a half-width cell wraps to four lines and costs
    more height than the row it was meant to save. */
function _pf(label, value, opts) {
  const o = opts || {};
  const has = value !== null && value !== undefined && String(value).trim() !== '';
  const shown = has ? String(value) : '—';
  return '<div class="stu-pan__f' + (o.wide ? ' is-wide' : '') + '">'
       + '<span class="stu-pan__k">' + escHtml(label) + '</span>'
       + '<span class="stu-pan__v' + (has ? '' : ' is-empty') + (o.mono ? ' is-mono' : '') + '">'
       + (o.html ? shown : escHtml(shown)) + '</span></div>';
}

/* ── THE DRAWER SHELL ────────────────────────────────────────────────────────
   Five bands, and only ONE of them scrolls (owner §24: "do not make the entire
   drawer — including the header — scroll away").

     head    ~56  title, subtitle, Print Profile, close
     id     ~104  who this is: photo, name, id, status, room, joined
     acts    ~72  the six verbs, three across
     tabs     42  Overview / Financial / Documents / Room History
     body      *  the only band with overflow-y
     foot    ~32  when this record was last written, and the product mark

   Every band above the body is flex:0 0 auto. .stu-pan is a column flex
   container, so a band left at the default flex-shrink:1 gives up height when
   the content is taller than the drawer — the tab strip is the shortest and
   lost the most, collapsing from 33px to 20 and drawing its own bottom border
   through the middle of the word "Overview". It reads as a rendering fault
   rather than a layout one, which is why it is worth the note.

   PRINT PROFILE IS THE ONLY VERB IN THE HEADER (§4). Edit, Payment, Move Room,
   Delete and Cancel Seat act on the STUDENT and live in the action grid under
   their photo; Print acts on the drawer's own contents, which is why it is the
   one that sits beside the title. There is no overflow "⋯" menu: all six verbs
   are already one press away, and a menu that repeats them is a second place to
   look for something that was never hidden.                                  */
function _stuPanelHtml(t) {
  const room  = DB.rooms.find(r => r.id === t.roomId);
  const rtype = room ? getRoomType(room) : null;
  const status = t.status || 'Active';
  const id = escHtml(t.id);
  const tabs = [['overview','Overview'],['financial','Financial'],
                ['documents','Documents'],['history','Room History']];

  /* WHEN THIS RECORD WAS LAST WRITTEN, and only when it actually was.
     `updatedAt` is stamped by submitEditStudent(); a record nobody has edited
     since that landed does not carry one, and the line is simply absent rather
     than showing a date the record cannot support. §29 — an invented timestamp
     is an invented fact, and this one would look exactly like a real one. */
  const _st = t.updatedAt ? new Date(t.updatedAt) : null;
  const stampTxt = _st && !isNaN(_st.getTime())
    ? 'Last updated ' + fmtDate(ymd(_st)) + ' · '
      + _st.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
    : '';

  return `
  <div class="stu-pan__scrim" onclick="closeStudentPanel()"></div>
  <aside class="stu-pan" id="stu-panel" role="dialog" aria-modal="true"
         aria-label="Student details for ${escHtml(t.name || '')}">

    <header class="stu-pan__head">
      <div class="stu-pan__headtext">
        <span class="stu-pan__title">Student Details</span>
        <span class="stu-pan__sub">Complete profile and information</span>
      </div>
      <button class="stu-pan__print" onclick="printStudentCard('${id}')" title="Print the student profile — one page, no payment table">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>Print Profile</button>
      <button class="stu-pan__x" onclick="closeStudentPanel()" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </header>

    ${''/* WHO THIS IS, ONCE. The drawer can be opened from a menu and the row it
           came from may be scrolled off, so the identity is repeated here — and
           nowhere else. Room appears as a badge here and as facts in the Current
           Room card; those are different jobs (which bed they are in, versus the
           floor and the type and since when), which is the test §5 sets before
           anything may be said twice. */}
    <div class="stu-pan__id">
      ${studentAvatar(t, 54, stuAvatarHue(String(t.name || '?')))}
      <div class="stu-pan__idtext">
        <div class="stu-pan__name">${escHtml(t.name || '—')}
          <span class="stu-pill ${stuStatusHue(status)}" title="${escHtml(statusDateText(t) || status)}"><i></i>${escHtml(status)}</span>
        </div>
        <div class="stu-pan__idmeta">
          <span class="stu-pan__idno">#${id}</span>
          ${''/* The floor rides with the number everywhere a room is named
                 (owner, 2026-09-10). A hostel with a #3 on three floors has
                 three of them, and the floor is the half that tells someone
                 where to walk. */}
          ${room ? `<span class="stu-pan__roombadge">Room ${escHtml(roomText(room))}${
              rtype ? ' · ' + escHtml(rtype.name) : ''}${
              t.bed ? ' · Bed ' + escHtml(String(t.bed)) : ''}</span>`
                 : '<span class="stu-pan__roombadge is-none">No room assigned</span>'}
          ${_stuMeChip(t)}
        </div>
        ${t.joinDate ? `<div class="stu-pan__meta">Joined ${escHtml(fmtDate(t.joinDate))}</div>` : ''}
      </div>
    </div>

    ${''/* THE DRAWER STAYS OPEN UNDER THE FORM (owner: "the slide-over is closed
           and you have to go back to the student and click it").

           It used to close itself before opening anything, because it had to: it
           sat at z-index 1401 and .modal-overlay sits at 350, so a form opened
           from here rendered UNDERNEATH it and was unreachable. The drawer is at
           331 now — above the page and the rail, below every modal — so the form
           opens on top and the record is still there when it closes.
           closeModal() refreshes the drawer on its way out, so a saved edit is
           visible immediately.

           DELETE ASKS FIRST AND CLOSES SECOND. It used to close the drawer on
           the way to the confirm, so a warden who read the dialog and said no
           got their record taken away as the reward for saying no.

           CANCEL SEAT OPENS THE FORM. It used to call quickCancelStudent(),
           which WROTE a Pending cancellation on the press — hardcoded reason,
           invented vacate date, no confirmation, and no `seq` for the CAN-####
           numbering to read. It is still conditional on Active, and is LAST
           because a conditional cell anywhere else moves the tiles after it.

           Nothing here reimplements a workflow. Move Room is showRoomShiftModal(),
           which is what WRITES DB.roomShifts, so this button and the Room History
           tab are two ends of one record. */}
    <div class="stu-pan__acts">
      <button class="stu-pan__act is-primary" onclick="showEditStudentModal('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>Edit</span></button>
      <button class="stu-pan__act" onclick="showRoomShiftModal('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg><span>Move Room</span></button>
      ${''/* Step 11: Print Profile stays in the header; this tile prints the
             profile with the Rules & Undertaking back side — the first print is
             the signed original, every later one a reprint. */}
      <button class="stu-pan__act" onclick="printAdmissionForm('${id}')" title="Profile plus Rules &amp; Undertaking. The first print is the signed original.">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg><span>Admission Form</span></button>
      <button class="stu-pan__act is-primary" onclick="openAddPayment('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg><span>Payment</span></button>
      <button class="stu-pan__act is-danger" onclick="confirmDeleteStudent('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>Delete</span></button>
      ${status === 'Active' ? `
      <button class="stu-pan__act is-warn" onclick="showAddCancellationModal('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg><span>Cancel Seat</span></button>` : ''}
      ${_stuMeAction(t)}
      ${_stuCnAction(t)}
    </div>

    <nav class="stu-pan__tabs" role="tablist">
      ${tabs.map(([k, label]) => `
        <button class="stu-pan__tab${_stuPanelTab === k ? ' is-on' : ''}" data-tab="${k}"
                role="tab" onclick="stuPanelTab('${k}')">${label}</button>`).join('')}
    </nav>

    <div class="stu-pan__body" id="stu-panel-body">${_stuPanelTabHtml(t, _stuPanelTab)}</div>

    <footer class="stu-pan__foot">
      <span>${escHtml(stampTxt)}</span>
      <span class="stu-pan__brand">Hostyllo</span>
    </footer>
  </aside>`;
}

function _stuPanelTabHtml(t, tab) {
  if (tab === 'financial') return _stuPanelFinancial(t);
  if (tab === 'documents') return _stuPanelDocuments(t);
  if (tab === 'history')   return _stuPanelHistory(t);
  return _stuPanelOverview(t);
}

/* ── OVERVIEW ─────────────────────────────────────────────────────────────────
   TWO COLUMNS OF CARDS, NOT SIX FULL-WIDTH SECTIONS (owner §17: "the current
   drawer wastes space because every category behaves like a large independent
   section").

   That is the whole change. Stacked, six groups cost the SUM of their heights
   and every value sat beside an empty half-width column; balanced into two
   columns they cost the taller column, and the drawer went from ~1050px of
   scroll to ~600. The columns are explicit rather than a grid because a grid
   aligns rows: Personal is eleven fields and Contact is five, and in a grid
   that leaves a 150px hole under Contact. Two flex columns just carry on.

   THE SPLIT IS BY HOW OFTEN A WARDEN LOOKS, not by field count. The left column
   is the record and the money — who this is, what they pay, where they sleep.
   The right is the people and the paperwork around them.

   THE FIELDS ARE THE RECORD'S OWN. Date of birth, gender, marital status, blood
   group and session have been stored and exported all along with nothing
   rendering them (owner's question); an absent one is a muted em dash, so a
   column of them reads as "not recorded" rather than as data.

   Guardian is ONE pair. §24 lists a guardian and an emergency contact, but the
   record carries a single emergencyContact/emergencyPhone which the Add Student
   form now labels Guardian — a second pair would be two rows no form fills.

   EVERY CARD'S "Edit" OPENS THE SAME FORM, because there is one student form
   and it holds all of these fields. It is on the card so the warden does not
   have to scroll back to the action grid to correct the line they are reading. */
function _stuPanelOverview(t) {
  const room  = DB.rooms.find(r => r.id === t.roomId);
  const rtype = room ? getRoomType(room) : null;
  const c = calculateCharges(t);
  const f = calculateFeeStatus(t.id);
  const status = t.status || 'Active';
  const pkr = v => fmtPKR(money(v));
  const pill = (hue, text) =>
    '<span class="stu-pill ' + hue + '"><i></i>' + escHtml(text) + '</span>';
  const ed = { edit: t.id };

  const personal = _pcard('Personal Information', 'person', '',
        _pf('Full name',      t.name)
      + _pf("Father's name",  t.fatherName)
      + _pf('Student ID',     '#' + t.id, { mono: true })
      /* Masked, revealed on hover (owner, 2026-09-10). A drawer is opened
         deliberately for one student, but it is opened on the same shared desk
         screen the register sits on, so the rule is the same one. */
      + _pf('CNIC / ID',      cnicHtml(t.cnic), { mono: true, html: true })
      + _pf('Date of birth',  t.dob ? fmtDate(t.dob) : '')
      + _pf('Gender',         t.gender)
      + _pf('Marital status', t.maritalStatus)
      + _pf('Blood group',    t.bloodGroup)
      + _pf('Nationality',    t.nationality)
      + _pf('Home address',   t.address), ed);

  /* THE MONEY, read through the §14 layer rather than recomputed, and the one
     card that is not accent-blue. §18: the Overview answers "where does this
     student stand" — monthly total, outstanding, last payment, fee status —
     and the Financial tab carries the ledger that explains it. Outstanding is
     red only when something IS outstanding; §13 is explicit that red is not the
     colour of ordinary financial information. */
  const money_ = _pcard('Status & Fee', 'money', 'is-green',
        // One charge, named by its plan (owner, 2026-09-14) — the split is in Settings.
        _pf('Plan',           chargeCoverage({ rent: c.rent, mess: c.mess,
                                messIncluded: c.messOptIn && c.mess > 0, hasMess: c.mess > 0 }).label)
      + _pf('Monthly charge', pkr(c.total), { mono: true })
      + _pf('Outstanding',
          '<b class="' + (f.outstanding > 0 ? 'is-due' : 'is-clear') + '">' + escHtml(pkr(f.outstanding)) + '</b>',
          { mono: true, html: true })
      + _pf('Last payment',   f.lastPaymentDate ? fmtDate(f.lastPaymentDate) : '')
      + _pf('Fee status',     pill(stuFeeHue(f.status), f.status), { html: true })
      + _pf('Student status', pill(stuStatusHue(status), status), { html: true }), ed);

  /* THERE IS NO BLOCK. The reference's room card opens with one; this app's
     rooms carry a number, a floor and a type and nothing else, so a Block row
     would print an em dash on every record for ever. Bed is real — the student
     record holds it — and takes its place.

     Rent and mess are NOT repeated here. §12 asks for them, but they are the
     six lines directly above in Status & Fee, and §5 forbids saying the same
     thing twice. What this card answers is which room, on what floor, of what
     type, since when. */
  const roomCard = _pcard('Current Room', 'bed', '',
        _pf('Room number', room ? '#' + room.number : '')
      + _pf('Room type',   rtype ? rtype.name : '')
      + _pf('Floor',       room && room.floor ? room.floor + ' Floor' : '')
      + _pf('Bed number',  t.bed)
      + _pf('Since',       t.joinDate ? fmtDate(t.joinDate) : ''), ed);

  const contact = _pcard('Contact & Guardian', 'phone', '',
        _pf('Phone number',     t.phone, { mono: true })
      + _pf('Email address',    t.email)
      + _pf('Guardian name',    t.emergencyContact)
      + _pf('Guardian contact', t.emergencyPhone, { mono: true }), ed);

  const academic = _pcard('Academic Information', 'book', '',
        _pf('Course / class',     t.occupation || t.course)
      + _pf('Session / semester', t.session)
      + _pf('Expected stay',      t.expectedStay), ed);

  /* Full width at the bottom, and it does NOT reserve space it has no content
     for: with neither field written the card is one muted line, not an empty
     panel the height of a paragraph (§14). */
  const notes = _pcard('Notes', 'note', '',
        (t.allergies ? _pf('Allergies', t.allergies, { wide: true }) : '')
      + _pf('Notes', t.notes, { wide: true }), { edit: t.id, wide: true });

  /* THE COLUMNS ARE BALANCED BY ROW COUNT, not by category. Personal is ten
     fields and Status & Fee is seven; Contact, Academic and Current Room are
     four, three and five. Left 17 against right 12 is the closest split the
     five cards allow, and the balance is the whole point — a column that runs
     200px past its neighbour puts the drawer straight back to scrolling past
     white space, which is the fault §17 describes.

     It also matches what §10-§12 ask for by name: Contact, Academic and Current
     Room in the right column, Personal and Status & Fee in the left. (§17's
     sketch puts Room on the left; the two disagree, and the placement that both
     names AND balances is this one.) */
  return '<div class="stu-pan__cols">'
       +   '<div class="stu-pan__col">' + personal + money_ + '</div>'
       +   '<div class="stu-pan__col">' + contact + academic + roomCard + '</div>'
       + '</div>'
       + notes;
}

/* ── FINANCIAL ────────────────────────────────────────────────────────────────
   THE OLD PROFILE'S FULL PAYMENT HISTORY, NOT A SUMMARY OF IT (owner).
   showViewStudentModal carried a nine-column ledger — month, monthly rent,
   concession, paid with its extras broken out, unpaid, method, status, date and
   four row actions — and the panel that replaced it shipped a four-column
   digest. That is not a smaller version of the same thing: the columns it
   dropped are the ones that answer "why is this figure not the rent", and the
   actions it dropped are the only place a warden can mark a pending record paid
   or reprint a receipt without going to Payments and finding the row again.

   It is the SAME markup and the same `.svw-*` classes as the modal, deliberately
   — one ledger, styled once, so the two can never drift into disagreeing about
   the same student. What is added is the wrapper: the panel is 440px and this
   table is not, so it scrolls horizontally inside its own card rather than
   pushing the panel sideways.

   Every figure above it comes from the §14 layer — calculateCharges,
   calculateFeeStatus, calculateOutstanding. The bar's two totals are the
   modal's own arithmetic, kept identical for the same reason.

   ONE DELIBERATE CORRECTION on the way across: the Unpaid column read
   `p.unpaid || 0`, a stored field, where the rest of the app asks
   calculateOutstanding(p). Those disagree the moment a payment is edited or
   reversed without the field being rewritten, and a ledger that disagrees with
   the balance printed above it is worse than one that is merely terse.      */
function _stuPanelFinancial(t) {
  const c = calculateCharges(t);
  const f = calculateFeeStatus(t.id);
  const id = t.id;
  const payHistory = (DB.payments || [])
    .filter(p => p && p.studentId === id)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  /* `pkr`, not `money` — finance.js exports a global `money()` that normalises
     a figure to whole rupees, and shadowing it here would have made every
     amount in this tab silently bypass the money layer. */
  const pkr = v => fmtPKR(money(v));

  const totalPaid = payHistory.filter(p => p.status === 'Paid')
      .reduce((s, p) => s + Number(p.amount), 0)
    + payHistory.filter(p => p.status === 'Pending' && Number(p.amount) > 0
        && p.unpaid != null && Number(p.unpaid) > 0)
      .reduce((s, p) => s + Number(p.amount), 0);
  const totalDue = payHistory.reduce((s, p) => s + calculateOutstanding(p), 0);

  /* WHAT IS BILLED ON THE LEFT, WHERE IT STANDS ON THE RIGHT (owner reference:
     `financial section vievport.png`). The same eight facts as before, but the
     card grid pairs them instead of stacking them, so the whole balance is one
     glance rather than half a scroll — and the ledger below it starts on screen
     instead of under the fold. The column break is the meaning: rent, mess,
     plan and total are the agreement; outstanding, last payment and fee status
     are the position against it. */
  const head = _pcard('Charges & Balance', 'money', 'is-green',
      // One charge, named by its plan (owner, 2026-09-14) — the split is in Settings.
      _pf('Plan',           chargeCoverage({ rent: c.rent, mess: c.mess,
                              messIncluded: c.messOptIn && c.mess > 0, hasMess: c.mess > 0 }).label)
    + _pf('Outstanding',    pkr(f.outstanding), { mono: true })
    + _pf('Monthly total',  pkr(c.total), { mono: true })
    + _pf('Last payment',   f.lastPaymentDate ? fmtDate(f.lastPaymentDate) : '')
    + _pf('Fee status',
        '<span class="stu-pill ' + stuFeeHue(f.status) + '"><i></i>' + f.status + '</span>',
        { html: true })
    + (f.credit > 0 ? _pf('Credit held', pkr(f.credit), { mono: true }) : ''),
    { wide: true });

  const rows = payHistory.map(p => {
    /* The monthly CHARGE. Reading `monthlyRent` alone hid the mess half — see
       paymentCharges() in utils.js. */
    const _ch = paymentCharges(p, t);
    const mRent = _ch.monthly;
    const admFee = Number(p.admissionFee || p.fee || 0);
    const extras = p.extraCharges || [];
    const conc = Number(p.concession || p.discount || 0);
    const due = calculateOutstanding(p);
    let paidCell = '<span class="svw-paid">' + pkr(p.amount) + '</span>';
    if (admFee > 0) paidCell += '<span class="svw-sub is-adm">+' + pkr(admFee) + ' admission</span>';
    extras.forEach(x => { paidCell += '<span class="svw-sub is-extra">+' + pkr(x.amount)
      + ' ' + escHtml(x.label || '') + '</span>'; });
    if (conc > 0) paidCell += '<span class="svw-sub is-conc">−' + pkr(conc) + ' concession</span>';

    return '<tr>'
      + '<td class="svw-t__month">' + escHtml(p.month || '—') + '</td>'
      /* THE SPLIT DROPS THE UNIT, and only here. "PKR 10,000 rent + PKR 7,000
         mess" wrapped to three lines under a 68px column and set the height of
         every row in the table. The figure it sits under says PKR two pixels
         above it, so the unit is not in doubt — this is the one place in the
         app where a bare number is unambiguous, which is why it is not a
         precedent for dropping it anywhere else. */
      + '<td class="svw-t__num">' + (mRent > 0 ? pkr(mRent) : '<span class="is-empty">—</span>')
        // The plan's name, not the split (owner, 2026-09-14).
        + (_ch.messIncluded
            ? '<span class="svw-sub">Rent + Mess</span>'
            : _ch.hasMess ? '<span class="svw-sub">Rent only</span>' : '')
        + '</td>'
      + '<td class="svw-t__conc">' + (conc > 0 ? '−' + pkr(conc) : '<span class="is-empty">—</span>') + '</td>'
      + '<td>' + paidCell + '</td>'
      + '<td class="svw-t__unpaid' + (due > 0 ? ' is-due' : '') + '">'
        + (due > 0 ? pkr(due) : '<span class="is-empty">—</span>') + '</td>'
      + '<td>' + pmBadge(p.method) + '</td>'
      + '<td>' + statusBadge(p.status) + '</td>'
      + '<td class="svw-t__date">' + (fmtDate(p.date) || '—') + '</td>'
      /* ONE KEBAB, NOT FOUR BUTTONS \u2014 and the same four verbs behind it.
         Measured, the four-button cell was 159px of the table's 1005, which is
         why nine columns could not fit a slide-over at any width the owner
         would accept. The menu cell is 44. The modal's ledger keeps its four
         buttons: it renders full-width and has the room, and the verbs are
         identical either way, so this is a presentation of the same actions
         rather than a second set of them. */
      + '<td class="svw-t__kebab"><button class="stu-kebab svw-kebab" title="Actions"'
        + ' aria-haspopup="menu" onclick="event.stopPropagation();stuLedgerMenu(\'' + escHtml(p.id)
        + '\',\'' + escHtml(id) + '\',this)">'
        + '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/>'
        + '<circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>'
        + '</button></td></tr>';
  }).join('');

  const n = payHistory.length;
  const ledger =
      '<div class="svw-card svw-card--flush stu-pan__ledger">'
    + '<div class="svw-card__head dh-blue svw-card__head--bar">'
    + '<span class="svw-card__ico">' + icon('card', 'sm') + '</span>'
    + '<span>Full Payment History (' + n + ' record' + (n === 1 ? '' : 's') + ')</span>'
    + '<span class="svw-card__meta">Total paid: <b>' + pkr(totalPaid) + '</b>'
    + (totalDue > 0 ? ' · <b class="is-due">Due ' + pkr(totalDue) + '</b>' : '') + '</span>'
    + '</div>'
    + (n
        ? '<div class="svw-tw"><table class="svw-t"><thead><tr>'
          + '<th>Month</th><th>Monthly Charge</th><th>Concession</th><th>Paid (+Extras)</th>'
          + '<th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th><th>Actions</th>'
          + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
          + '<div class="svw-tfoot">'
          + '<span>Showing ' + n + ' of ' + n + ' record' + (n === 1 ? '' : 's') + '</span>'
          /* The ledger is this student's. Payments is everyone's, and getting
             there used to mean leaving the panel and typing the name back in,
             so the link carries it. */
          // Step 11 (spec §3.7): the full ledger as its own document, any number of pages.
          + '<button class="svw-tfoot__link" id="stu-print-history" onclick="printPaymentHistory(\'' + escHtml(id) + '\')">'
          + 'Print payment history</button>'
          + '<button class="svw-tfoot__link" onclick="stuAllPayments(\'' + escHtml(id) + '\')">'
          + 'View all payments'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          + 'stroke-linecap="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>'
          + '</div>'
        : '<div class="svw-none">No payment records yet</div>')
    + '</div>';

  /* The verb that belongs to this tab. Every other action on this record is in
     the header; collecting money from the ledger you are reading should not
     mean scrolling back up to find it. */
  const add = '<button class="stu-pan__wide" onclick="openAddPayment(\'' + escHtml(id) + '\')">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
    + 'Record a payment</button>';

  return head + _stuCnCard(t) + '<section class="stu-pan__sec stu-pan__sec--flush">'
       + ledger + '<div class="stu-pan__secpad">' + add + '</div></section>';
}

/* ── DOCUMENTS ────────────────────────────────────────────────────────────── */
function _stuPanelDocuments(t) {
  const hasPhoto = !!(t.docs && t.docs.photo);
  const row = (label, uploaded, actions) => `
    <div class="stu-pan__doc">
      <div class="stu-pan__doc__i">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      </div>
      <div class="stu-pan__doc__t">
        <div class="stu-pan__doc__n">${escHtml(label)}</div>
        <div class="stu-pan__doc__s${uploaded ? ' is-on' : ''}">${uploaded ? 'Uploaded' : 'Not uploaded'}</div>
      </div>
      <div class="stu-pan__doc__a">${actions}</div>
    </div>`;

  /* DOWNLOAD SITS BESIDE VIEW (owner, 2026-09-06). The photo is a data URI on
     the record, so it is already a file in every sense except having been saved
     as one — a warden who needed it for a form had no way to get it out short
     of a screenshot. It is enabled on exactly the same condition as View: there
     is something to download. */
  const sid = escHtml(t.id);
  const acts = (docId) =>
      `<button class="stu-pan__mini" onclick="stuViewDoc('${sid}','${escHtml(docId)}')">View</button>`
    + `<button class="stu-pan__mini is-go" onclick="stuDownloadDoc('${sid}','${escHtml(docId)}')">Download</button>`;
  const addBtn = (kind, label) =>
      `<button class="stu-pan__mini" onclick="stuDocAdd('${sid}','${escHtml(kind)}')"
               title="Attach ${escHtml(label)}">Attach</button>`;

  /* THESE ROWS ARE REAL NOW (owner, 2026-09-10). They were honest placeholders
     with their controls disabled and a note saying document storage had not
     landed — §28's "show it as planned rather than pretend". It has landed:
     the Add Student form attaches them (see STU_DOC_KINDS) and they persist on
     docs.files. The note goes with the placeholders; a caveat that is no longer
     true is worse than no caveat.

     Attach is offered HERE as well as on the intake form, and that is the
     point of putting it here — every student admitted before today has no
     documents at all, and a warden with a POR in their hand needs somewhere to
     put it that is not "re-admit the student". */
  const files = stuDocsOf(t);
  const named = STU_DOC_KINDS.map(k => {
    const d = files.find(f => f.kind === k.key);
    /* The signed undertaking (step 11): an image scan reprints watermarked; a
       PDF can only be viewed or downloaded, and the disabled button says why. */
    const reprint = (k.key === 'undertaking' && d)
      ? (undScanIsImage(d)
          ? `<button class="stu-pan__mini" onclick="stuUndReprintScan('${sid}')" title="Print the scan marked REPRINT">Reprint</button>`
          : `<button class="stu-pan__mini" disabled title="A PDF scan can be viewed or downloaded. The app can not stamp REPRINT on a PDF.">Reprint</button>`)
      : '';
    const html = d
      ? row(k.label + ' · ' + stuDocExt(d.type) + ' · ' + stuDocSize(d.size), true,
            acts(d.id) + reprint + `<button class="stu-pan__mini" style="color:var(--red)"
                onclick="stuDocRemove('${sid}','${escHtml(d.id)}')" title="Remove this document">Remove</button>`)
      : row(k.label, false, addBtn(k.key, k.label));
    return html + (k.key !== 'undertaking' ? '' : `<p class="stu-pan__note" id="stu-und-state">${t.firstSignedAt
      ? 'Original admission form printed ' + escHtml(fmtDate(t.firstSignedAt)) + ' · rules v' + escHtml(String(t.rulesVersionAtSigning || '?'))
      : 'Admission form not printed yet'}</p>`);
  }).join('');
  const extra = files.filter(f => f.kind === 'other').map(d =>
    row((d.label || d.name || 'Other document') + ' · ' + stuDocExt(d.type) + ' · ' + stuDocSize(d.size), true,
        acts(d.id) + `<button class="stu-pan__mini" style="color:var(--red)"
            onclick="stuDocRemove('${sid}','${escHtml(d.id)}')" title="Remove this document">Remove</button>`)).join('');

  return '<section class="stu-pan__sec"><h4>Documents</h4>'
    + row('Student photo', hasPhoto, hasPhoto
        ? `<button class="stu-pan__mini" onclick="stuViewDoc('${sid}')">View</button>`
          + `<button class="stu-pan__mini is-go" onclick="stuDownloadDoc('${sid}')">Download</button>`
        : '<button class="stu-pan__mini" disabled>View</button>'
          + '<button class="stu-pan__mini" disabled>Download</button>')
    + named + extra
    + (files.length < STU_DOC_MAX_FILES
        ? `<button class="stu-pan__mini" style="margin-top:9px"
                   onclick="stuDocAdd('${sid}','other')">Attach another document</button>`
        : `<p class="stu-pan__note">Five documents is the limit for one record. Remove one to attach another.</p>`)
    + '</section>';
}

/* ── DOCUMENTS ON AN EXISTING RECORD ──────────────────────────────────────── */
/* One hidden input, created on demand and thrown away after. A permanent one in
   the drawer's markup would be rebuilt on every re-render — including the one
   this handler triggers — and the file it was holding would vanish mid-read. */
function stuDocAdd(studentId, kind) {
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const t = DB.students.find(x => x.id === studentId);
  if (!t) { toast('That student is no longer on the roster', 'error'); return; }
  if (stuDocsOf(t).length >= STU_DOC_MAX_FILES) {
    toast('Five documents is the limit for one student record', 'error'); return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = STU_DOC_ACCEPT;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = () => {
    const file = input.files && input.files[0];
    const done = () => { input.remove(); };
    if (!file) { done(); return; }
    if (file.size > STU_DOC_MAX_BYTES) {
      toast(`"${file.name}" is ${stuDocSize(file.size)} — the limit is ${stuDocSize(STU_DOC_MAX_BYTES)} a file`, 'error');
      done(); return;
    }
    const ty = String(file.type || '');
    if (ty && !/^image\//.test(ty) && ty !== 'application/pdf') {
      toast('Only images and PDFs can be attached', 'error'); done(); return;
    }
    const reader = new FileReader();
    reader.onerror = () => { toast('Could not read "' + file.name + '"', 'error'); done(); };
    reader.onload = async (e) => {
      const doc = {
        id: 'doc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        kind: kind || 'other',
        label: (kind && kind !== 'other') ? stuDocLabel(kind)
                                          : String(file.name || 'Other document').slice(0, 60),
        name: String(file.name || ''),
        type: ty || 'application/octet-stream',
        size: Number(file.size) || 0,
        data: String(e.target.result || ''),
        addedAt: today(),
      };
      // Re-read the student: the drawer may have been open across an edit.
      const s = DB.students.find(x => x.id === studentId);
      if (!s) { toast('That student is no longer on the roster', 'error'); done(); return; }
      if (!s.docs) s.docs = {};
      if (!Array.isArray(s.docs.files)) s.docs.files = [];
      if (doc.kind !== 'other') s.docs.files = s.docs.files.filter(d => d.kind !== doc.kind);
      s.docs.files.push(doc);
      logActivity('Document Attached', doc.label + ' attached to ' + (s.name || s.id), 'Student');
      await saveDB();
      done();
      if (typeof showStudentPanel === 'function') showStudentPanel(studentId);
      toast(doc.label + ' attached', 'success');
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function stuDocRemove(studentId, docId) {
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const t = DB.students.find(x => x.id === studentId);
  const d = stuDocsOf(t).find(x => x.id === docId);
  if (!t || !d) { toast('That document is already gone', 'info'); return; }
  showConfirm('Remove this document?',
    'Remove <b>' + escHtml(d.label || d.name || 'this document') + '</b> from '
      + escHtml(t.name || 'this record') + '? The file is not stored anywhere else — '
      + 'once it is removed it has to be scanned again.',
    async () => {
      t.docs.files = stuDocsOf(t).filter(x => x.id !== docId);
      logActivity('Document Removed', (d.label || 'A document') + ' removed from ' + (t.name || t.id), 'Student');
      await saveDB();
      closeModal();
      if (typeof showStudentPanel === 'function') showStudentPanel(studentId);
      toast('Document removed', 'info');
    });
}

/* THE LEDGER'S ROW MENU. The same four verbs the modal's ledger shows as
   buttons, the same functions behind them, rebuilt on each open and anchored to
   the button. It reuses `.stu-rmenu` and closeStuRowMenu() deliberately, so the
   outside-click and Escape handlers already delegated off `document` cover it
   without a second pair. It flips upward near the bottom of the window for the
   reason the row menu does: the last rows of a ledger are exactly where a
   downward menu opens off-screen, and a menu you cannot see is a row whose
   actions have quietly disappeared. */
function stuLedgerMenu(payId, studentId, btn) {
  // A second click on the same ⋮ closes it (owner, 2026-09-14).
  const cur = document.getElementById('stu-rmenu');
  const wasOpen = !!cur && cur.dataset.for === 'ledger:' + payId;
  closeStuRowMenu();
  if (wasOpen) return;
  const p = (DB.payments || []).find(x => x.id === payId);
  if (!p) return;
  const a = escHtml(payId), b = escHtml(studentId);

  const el = document.createElement('div');
  el.className = 'lk-rmenu';
  el.id = 'stu-rmenu';
  el.dataset.for = 'ledger:' + payId;
  el.setAttribute('role', 'menu');
  el.innerHTML =
      (p.status !== 'Paid'
        ? '<button role="menuitem" onclick="closeStuRowMenu();markPaymentPaidFromStudentView(\'' + a + '\',\'' + b + '\')">'
          + icon('checkmark', 'sm') + 'Mark paid</button>'
        : '')
    + '<button role="menuitem" onclick="closeStuRowMenu();printReceiptFromStudentView(\'' + a + '\',\'' + b + '\')">'
      + icon('receipt', 'sm') + 'Print receipt</button>'
    + '<button role="menuitem" onclick="closeStuRowMenu();editPaymentFromStudentView(\'' + a + '\',\'' + b + '\')">'
      + icon('edit', 'sm') + (typeof ownCanEdit === 'function' && !ownCanEdit(p).ok ? 'View payment' : 'Edit payment') + '</button>'
    + '<div class="stu-rmenu__sep"></div>'
    /* Delete only a record holding no money (warden ledger step 6). */
    + (typeof ownCanDelete === 'function' && !ownCanDelete(p).ok
        ? '<button role="menuitem" disabled aria-disabled="true" class="is-danger is-disabled" title="' + escHtml(ownCanDelete(p).reason) + '">'
          + icon('trash', 'sm') + '<span class="lk-rmenu__lbl">Delete payment<span class="lk-rmenu__hint">Reverse the collection first</span></span></button>'
        : '<button role="menuitem" class="is-danger" onclick="closeStuRowMenu();deletePaymentFromStudentView(\'' + a + '\',\'' + b + '\')">'
          + icon('trash', 'sm') + 'Delete payment</button>');
  document.body.appendChild(el);

  const r = btn.getBoundingClientRect();
  const h = el.offsetHeight || 160;
  const below = window.innerHeight - r.bottom;
  el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8)) + 'px';
  el.style.top  = (below < h + 12 ? r.top - h - 6 : r.bottom + 6) + 'px';
  btn.classList.add('is-on');
}

/** Payments, already filtered to this student. The search box matches the
    stored studentName, which is what every row in this ledger carries. */
function stuAllPayments(id) {
  const t = DB.students.find(x => x.id === id);
  if (!t) return;
  closeStudentPanel();
  if (typeof payFilter === 'object' && payFilter) {
    payFilter.search = t.name || '';
    payFilter.page = 1;
  }
  navigate('payments');
}

/* Save the photo as a file. It is stored as a data: URI, so the bytes are
   already here \u2014 this decodes them into a Blob rather than hanging a
   multi-megabyte URI off an <a href>, which is where a large photo silently
   fails. The extension comes from the URI's own MIME type: renaming a PNG to
   .jpg produces a file Windows Photos refuses to open. */
/* `docId` is optional and it is what makes this work for both: with no second
   argument this is the photo download it has always been, and with one it saves
   that attachment. One decoder, because the bug it protects against — a data
   URI hung off an <a href> failing silently above a few megabytes — is the same
   bug whichever file it is. */
function stuDownloadDoc(id, docId) {
  const t = DB.students.find(x => x.id === id);
  const doc = docId ? stuDocsOf(t).find(d => d.id === docId) : null;
  if (docId && !doc) { toast('That document is no longer on the record', 'info'); return; }
  const src = doc ? doc.data : (t && t.docs && t.docs.photo);
  if (!src) { toast('No document to download', 'info'); return; }

  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(src));
  if (!m) { toast('That file is not in a format this can save', 'error'); return; }

  try {
    const mime = m[1] || 'image/png';
    const body = m[3] || '';
    let blob;
    if (m[2]) {
      const bin = atob(body);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      blob = new Blob([buf], { type: mime });
    } else {
      blob = new Blob([decodeURIComponent(body)], { type: mime });
    }
    const ext = mime === 'application/pdf' ? 'pdf'
              : ((mime.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png');
    const safe = (t.name || 'Student').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
    /* Named for what it IS, not for the file it came from. A warden downloading
       four documents for one student gets four files that sort together and say
       whose they are — "img20260910_0003.jpg" out of a scanner does neither. */
    const what = doc ? String(doc.label || doc.name || 'Document')
                        .replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '')
                     : 'Photo';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = what + '-' + safe + '-' + t.id + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    toast('Downloaded ' + a.download, 'success');
  } catch (e) {
    toast('Could not save the file: ' + (e && e.message ? e.message : 'unknown error'), 'error');
  }
}

function stuViewDoc(id, docId) {
  const t = DB.students.find(x => x.id === id);
  if (!t) { toast('No document to open', 'info'); return; }

  if (!docId) {
    if (!t.docs || !t.docs.photo) { toast('No document to open', 'info'); return; }
    showModal('modal-md', 'Student photo — ' + escHtml(t.name || ''),
      `<div style="text-align:center"><img src="${escHtml(t.docs.photo)}" alt="" style="max-width:100%;border-radius:12px"></div>`);
    return;
  }

  const doc = stuDocsOf(t).find(d => d.id === docId);
  if (!doc || !doc.data) { toast('That document is no longer on the record', 'info'); return; }

  /* A PDF gets an <embed>, an image gets an <img>. An <img> pointed at a PDF
     data URI renders as a broken-image icon, which reads as a corrupted upload
     rather than as the viewer using the wrong tag. Download sits under it
     either way: an embedded viewer can be blocked, and the file must still be
     reachable when it is. */
  const isPdf = doc.type === 'application/pdf';
  showModal('modal-md', escHtml(doc.label || doc.name || 'Document') + ' — ' + escHtml(t.name || ''),
    (isPdf
      ? `<embed src="${escHtml(doc.data)}" type="application/pdf" style="width:100%;height:62vh;border-radius:12px;border:1px solid var(--border)">`
      : `<div style="text-align:center"><img src="${escHtml(doc.data)}" alt="" style="max-width:100%;border-radius:12px"></div>`)
    + `<div style="display:flex;align-items:center;gap:10px;margin-top:12px">
         <span style="font-size:11.5px;color:var(--text3)">${escHtml(stuDocExt(doc.type))}
           · ${escHtml(stuDocSize(doc.size))}${doc.addedAt ? ' · attached ' + escHtml(fmtDate(doc.addedAt)) : ''}</span>
         <button class="btn btn-primary btn-sm" style="margin-left:auto"
                 onclick="stuDownloadDoc('${escHtml(t.id)}','${escHtml(doc.id)}')">Download</button>
       </div>`);
}

/* ── DRAG THE LEDGER SIDEWAYS ────────────────────────────────────────────────
   Owner, 2026-09-06: "add a select drag left right hand so that the full
   payment history should drag easily from left to right and right to left."

   Press anywhere on the table and pan it. Delegated off `document` because the
   drawer is re-rendered wholesale by refreshStudentPanel() on every save, so a
   listener bound to the element would be thrown away with it — the same reason
   the row menu's outside-click is delegated.

   THREE THINGS THAT ARE NOT OBVIOUS AND ARE ALL DELIBERATE:

     · The kebab is exempt. A press on it must open its menu, not start a drag,
       and a 2px wobble on the way to a click would otherwise swallow it.
     · The class goes on AFTER the pointer has actually moved, not on press, so
       a plain click never suppresses text selection. A warden copying a figure
       out of the ledger is a thing that happens.
     · Selection is suppressed only while dragging. A permanent
       user-select:none would make the whole ledger uncopyable.               */
let _stuDrag = null;

document.addEventListener('pointerdown', function (e) {
  const tw = e.target.closest && e.target.closest('.stu-pan__ledger .svw-tw');
  if (!tw) return;
  if (e.target.closest('.svw-kebab, button, a')) return;   // clicks stay clicks
  if (e.button !== 0) return;
  _stuDrag = { el: tw, x: e.clientX, left: tw.scrollLeft, moved: false };
});

document.addEventListener('pointermove', function (e) {
  if (!_stuDrag) return;
  const dx = e.clientX - _stuDrag.x;
  if (!_stuDrag.moved) {
    if (Math.abs(dx) < 3) return;        // a click is not a drag
    _stuDrag.moved = true;
    _stuDrag.el.classList.add('is-dragging');
  }
  _stuDrag.el.scrollLeft = _stuDrag.left - dx;
  e.preventDefault();
});

function _stuDragEnd() {
  if (!_stuDrag) return;
  _stuDrag.el.classList.remove('is-dragging');
  _stuDrag = null;
}
document.addEventListener('pointerup', _stuDragEnd);
document.addEventListener('pointercancel', _stuDragEnd);

/* ── ROOM HISTORY ─────────────────────────────────────────────────────────────
   A VERTICAL TIMELINE, newest first (§20). Cards gave five lines of chrome to
   two lines of fact; a rail with a node per move says the same thing in the
   shape the information actually has — one thing after another.

   REAL RECORDS ONLY. DB.roomShifts is written by showRoomShiftModal(), which is
   what the Move Room button opens, so this tab reads history rather than
   reconstructing it. A student who has never moved gets the one row that is
   true — where they are now — and a line saying there are no changes. §29:
   "do not fabricate previous rooms", and a plausible empty row looks exactly
   like a working feature.

   The ranges are built from the shifts themselves: a move's date ends the
   previous stay and starts the next, so every "from → to" printed here is two
   records agreeing rather than one being guessed at. Where the earliest stay
   has no record before it, its start is the student's joinDate — which is a
   fact — and where there is no joinDate either, it simply says nothing.     */
function _stuPanelHistory(t) {
  const shifts = (DB.roomShifts || [])
    .filter(x => x && x.studentId === t.id)
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const room  = DB.rooms.find(r => r.id === t.roomId);
  const rtype = room ? getRoomType(room) : null;

  const node = (tag, tone, title, sub, when) =>
      '<li class="stu-pan__tl' + (tone ? ' ' + tone : '') + '">'
    + '<span class="stu-pan__tl__dot"></span>'
    + '<div class="stu-pan__tl__b">'
    + '<span class="stu-pan__tl__tag">' + escHtml(tag) + '</span>'
    + '<span class="stu-pan__tl__t">' + escHtml(title) + '</span>'
    + (sub ? '<span class="stu-pan__tl__s">' + escHtml(sub) + '</span>' : '')
    + '<span class="stu-pan__tl__w">' + escHtml(when) + '</span>'
    + '</div></li>';

  // Where they are now. The latest shift is what put them there, so that is
  // where this stay began; with no shifts at all it is the joining date.
  const since = shifts.length ? shifts[0].date : t.joinDate;
  const nowTitle = room
    ? 'Room #' + room.number + (rtype ? ' · ' + rtype.name : '')
    : 'No room assigned';
  const nowSub = room && room.floor ? room.floor + ' Floor'
                                    + (t.bed ? ' · Bed ' + t.bed : '') : '';
  let out = node('Current', 'is-now', nowTitle, nowSub,
    since ? 'Since ' + fmtDate(since) : 'Start date not recorded');

  // Each move ends a stay and begins the next, so the range is read off two
  // records rather than invented from one.
  out += shifts.map((sh, i) => {
    const started = shifts[i + 1] ? shifts[i + 1].date : t.joinDate;
    const when = (started ? fmtDate(started) : '?') + ' → ' + (sh.date ? fmtDate(sh.date) : '?');
    /* The floor rides with the number here too (owner, 2026-09-10). It is
       looked up from the room list by number rather than stored on the shift —
       a room does not change floors, and the shift record predates the floor
       being shown anywhere. An unmatched number simply prints alone. */
    const fromRoom = (DB.rooms || []).find(r => String(r.number) === String(sh.fromRoomNumber));
    return node('Previous', '',
                sh.fromRoomNumber ? 'Room ' + roomText(sh.fromRoomNumber, fromRoom && fromRoom.floor)
                                  : 'Room #?',
                sh.reason || '', when);
  }).join('');

  return '<section class="stu-pan__sec"><h4>Room history</h4>'
    + '<ol class="stu-pan__tlwrap">' + out + '</ol>'
    + (shifts.length
        ? ''
        : '<div class="stu-pan__empty">No room changes recorded for this student.</div>')
    + '</section>';
}

/* ── THE ROW MENU ────────────────────────────────────────────────────────────
   Anchored to the button with fixed positioning and flipped upward near the
   bottom of the window, because the last rows of a full page are exactly where
   a downward menu would open off-screen — and a menu you cannot see is a row
   whose actions have quietly disappeared.

   Rebuilt on each open rather than one node per row: a 100-row page would
   otherwise carry 100 hidden menus, and the table is re-rendered on every save
   anyway. */
function stuRowMenu(id, btn) {
  // A second click on the same ⋮ closes it (owner, 2026-09-14).
  const cur = document.getElementById('stu-rmenu');
  const wasOpen = !!cur && cur.dataset.for === 'row:' + id;
  closeStuRowMenu();
  if (wasOpen) return;
  const t = DB.students.find(x => x.id === id);
  if (!t) return;

  const el = document.createElement('div');
  el.className = 'lk-rmenu';
  el.id = 'stu-rmenu';
  el.dataset.for = 'row:' + id;
  el.setAttribute('role', 'menu');
  el.innerHTML =
      `<button role="menuitem" onclick="closeStuRowMenu();showStudentPanel('${escHtml(id)}')">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/></svg>View profile</button>`
    + `<button role="menuitem" onclick="closeStuRowMenu();showEditStudentModal('${escHtml(id)}')">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>Edit student</button>`
    + `<div class="lk-rmenu__sep"></div>`
    + `<button role="menuitem" class="is-danger" onclick="closeStuRowMenu();confirmDeleteStudent('${escHtml(id)}')">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete student</button>`;
  document.body.appendChild(el);

  const r = btn.getBoundingClientRect();
  const h = el.offsetHeight || 132;
  const below = window.innerHeight - r.bottom;
  el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8)) + 'px';
  el.style.top  = (below < h + 12 ? r.top - h - 6 : r.bottom + 6) + 'px';
  btn.classList.add('is-on');
}

function closeStuRowMenu() {
  const m = document.getElementById('stu-rmenu');
  if (m) m.remove();
  document.querySelectorAll('.stu-kebab.is-on').forEach(b => b.classList.remove('is-on'));
}

// Outside click and Escape. Delegated off `document` because renderPage()
// replaces the table wholesale on every save.
document.addEventListener('click', function (e) {
  const m = document.getElementById('stu-rmenu');
  if (!m) return;
  if (e.target.closest && (e.target.closest('#stu-rmenu') || e.target.closest('.stu-kebab'))) return;
  closeStuRowMenu();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeStuRowMenu();
});

function stuToggleRow(id) {
  if (stuSelected.has(id)) stuSelected.delete(id); else stuSelected.add(id);
  renderPage('students');
}
function stuToggleAll(on) {
  paginate(studentsFiltered(), studentFilter).slice.forEach(t => {
    if (on) stuSelected.add(t.id); else stuSelected.delete(t.id);
  });
  renderPage('students');
}
/* ══ THE STUDENTS EXPORT ═══════════════════════════════════════════════════
   One definition, two files (§60), rendered by the global export engine.

   The PDF is the roster a warden carries up the stairs: who, where, how to
   reach them, what they are charged, what they owe. The workbook is the
   complete record — the CNIC, the address, the guardian's number, the fields
   an office needs and a corridor does not (§33: "Excel may contain additional
   fields that are not suitable for the PDF").

   Both come from studentsFiltered(), so the screen, the sheet and the printed
   page hold the same students in the same order: room ascending, because a
   name-ordered roster sends the reader up and down the building.

   TWO TYPING RULES CARRY OVER FROM THE SHEETJS WORKBOOK THIS REPLACED, and
   they are the ones that quietly ruin a roster:

   · Phone, emergency phone and CNIC are TEXT. `03310045835` written as a
     number loses its leading zero and comes back as 3,310,045,835 — the
     warden's contact list has become arithmetic.
   · Join date and date of birth are real DATES, built from the local calendar
     parts by the writer (see _xwSerial). Handed to `new Date()` they parse as
     UTC, and five hours east of Greenwich the cell lands on the day before.
   ─────────────────────────────────────────────────────────────────────────── */

/* "58 students · 44 active, 14 left" — every figure counted from the rows
   actually being written, never from DB totals the file does not contain. */
function _stuExportMeta(list) {
  const byStatus = {};
  list.forEach(t => { const s = t.status || 'Active'; byStatus[s] = (byStatus[s] || 0) + 1; });
  return Object.keys(byStatus).sort().map(s => byStatus[s] + ' ' + s.toLowerCase()).join(', ');
}

/* WHAT THE SHEET'S "Remarks" COLUMN HOLDS. Its own examples — "Requested early
   leave", "Left on his request", "Disciplinary issue", "Semester end" — are
   cancellation reasons, and a cancellation reason is not on the student record:
   it is on the cancellation. Looked up by studentId, newest request first, and
   falling back to whatever was typed into the student's own notes. */
function _stuRemark(t) {
  if (!t) return '';
  const out = [];
  /* The departure, in words, since its own column came off on 2026-09-10:
     what happened and when, on the rows where anything happened at all. */
  const when = (typeof statusDate === 'function') ? statusDate(t) : '';
  const st = String(t.status || '');
  if (when && (st === 'Left' || st === 'Cancelling' || st === 'On Notice')) {
    out.push((st === 'Left' ? 'Left ' : 'Vacates ') + fmtDate(when));
  }
  const mine = (DB.cancellations || [])
    .filter(c => c && String(c.studentId) === String(t.id) && c.reason)
    .sort((a, b) => String(b.requestDate || '').localeCompare(String(a.requestDate || '')));
  if (mine.length) out.push(String(mine[0].reason));
  else if (t.notes || t.remarks) out.push(String(t.notes || t.remarks));
  return out.join(' · ');
}

/* ── CNIC, PARTLY MASKED ─────────────────────────────────────────────────────
   17102-1178441-2 leaves as "17102-11*******". The issuing district and the
   first two digits are enough to match a person against the card in their
   hand; the rest is the part that identifies them to a bank, a SIM vendor or
   anyone else who asks, and a printed roster is a document that gets left on a
   desk and photographed.

   The stored record is untouched — this is a presentation rule. Anything that
   is not a CNIC-shaped string is passed through: a hostel that records a
   B-form or a passport number should still see what it typed.

   THE RULE MOVED TO utils.js AS maskCnic() (owner, 2026-09-10: "make the cnic
   detail in pages as it is in the pdf"). It was the export's rule only, and
   the payments register had a second, different one; the pages now use this
   same one, so it belongs where every module can reach it. The name stays
   because the export definition below reads well with it. */
function _stuMaskCnic(v) { return maskCnic(v); }

/* The gender a blank field means, taken from what the hostel said it was when
   it was set up (owner, 2026-09-10). A boys' hostel that has never filled the
   field in is a roster of boys; a mixed hostel has no default and says so with
   a dash rather than guessing at a person. */
function _stuDefaultGender() {
  /* `hostelGender` is asked on the onboarding's first step and is editable in
     Settings. Older installs have never been asked, so an unset value means
     "we do not know" and gets no default — the alternative is printing "Male"
     against a girls' hostel that upgraded. */
  const t = String((DB.settings && DB.settings.hostelGender) || '').toLowerCase();
  if (t === 'girls')  return 'Female';
  if (t === 'boys')   return 'Male';
  return '';
}

function _stuExportDef(list, opts) {
  opts = opts || {};
  const byId    = _stuRoomMap();
  const roomOf  = t => { const r = byId.get(t.roomId); return r ? String(r.number) : ''; };
  const floorOf = t => { const r = byId.get(t.roomId); return r ? (r.floor || '') : ''; };

  const active  = list.filter(t => (t.status || 'Active') === 'Active').length;
  const notice  = list.filter(t => t.status === 'Cancelling' || t.status === 'On Notice').length;
  const left    = list.filter(t => t.status === 'Left').length;
  const black   = list.filter(t => t.status === 'Blacklisted').length;
  const charged = list.reduce((s, t) => s + Number(resolveCharges(t).total || 0), 0);

  /* What a student still owes, asked of calculateOutstanding() rather than
     read off `p.unpaid` — the stored field is 0 on legacy records, which is
     how a real debtor prints as settled.

     Bucketed in ONE pass over the payments rather than a filter per student.
     The naive version is O(students × payments), and this column is read three
     times per row (the value, the printed cell, the summary): a 500-student
     hostel with three years of records would have spent minutes here. §43. */
  const _due = new Map();
  (DB.payments || []).forEach(p => {
    const d = calculateOutstanding(p);
    if (d > 0) _due.set(p.studentId, (_due.get(p.studentId) || 0) + d);
  });
  const owedBy = t => _due.get(t.id) || 0;
  const owed = list.reduce((s, t) => s + owedBy(t), 0);

  const scope = _stuMonthLabel(studentFilter.month);

  return {
    module: 'Students',
    title:  opts.title || 'Student Roster',
    scope:  opts.scope || scope,
    sheet:  'Students',

    filters: [
      ['Month',     scope],
      ['Status',    studentFilter.status !== 'All' ? studentFilter.status : null],
      ['Room',      studentFilter.room && studentFilter.room !== 'All' ? '#' + studentFilter.room : null],
      ['Search',    studentFilter.search || null],
      ['Selection', opts.selection || null],
      ['Roll-up',   _stuExportMeta(list)],
    ],

    summary: [
      { label: 'Students',        value: String(list.length) },
      { label: 'Active',          value: String(active), tone: 'pos' },
      { label: 'On notice',       value: String(notice), tone: notice ? 'warn' : '' },
      { label: 'Left',            value: String(left) },
      { label: 'Blacklisted',     value: String(black), tone: black ? 'neg' : '' },
      { label: 'Charged / month', value: EXPORT.fmt.money(charged) },
      { label: 'Outstanding',     value: EXPORT.fmt.money(owed), tone: owed > 0 ? 'neg' : '' },
    ],

    /* ========================================================================
       THE COLUMNS ARE THE OWNER'S SHEET, EXACTLY (`student excel sheet.png`,
       2026-09-10), and the same fifteen in the PDF as in the workbook.

       They were not the same before. Nine columns carried `pdf:false` — CNIC,
       gender, nationality, address, emergency contact, date of birth, session,
       blood group, floor — so the printed roster and the exported one were two
       different documents built from one definition, and the printed one was
       missing exactly the identity fields a hostel is asked for.

       WHAT CAME OUT, and why each is not a loss:
         · Date of birth, session, blood group — not on the sheet. They are on
           the student's own record and on their profile print.
         · Join date — the sheet's date column is about DEPARTURE, which is the
           date a roster is read for.
         · Outstanding — this is a REGISTER, not a ledger; the payment register
           is the document that answers what is owed, and it answers it per
           month rather than as one running figure.
         · Father / Guardian as a second column — it is column 4 now, which is
           where the sheet puts it, instead of being both a sub-line and a
           hidden Excel column.

       REMARKS is the one field the app had nowhere to read: the sheet's
       examples ("Requested early leave", "Left on his request", "Disciplinary
       issue") are cancellation reasons, and a cancellation reason lives on the
       cancellation record. So it is looked up by studentId, and falls back to
       the student's own notes when there is no cancellation.
       ======================================================================== */
    columns: [
      { label: '#', type: 'number', width: 5, align: 'center',
        value: (t, i) => (i == null ? '' : i + 1) },

      { label: 'Room No.', type: 'id', width: 10,
        value: t => roomOf(t),
        get:   t => { const r = roomOf(t);
          return r ? '<b>' + escHtml(r) + '</b>' : '—'; } },

      { label: 'Student Name', type: 'text', width: 22,
        value: t => t.name || '',
        get:   t => '<b>' + escHtml(t.name || '') + '</b>' },

      { label: 'Father Name', type: 'text', width: 22, value: t => t.fatherName || '' },

      { label: 'Contact', type: 'text', width: 16, value: t => String(t.phone || '') },

      /* "Emergency Contact" is 17 characters over a column of phone numbers,
         and it was the widest heading on the sheet (owner, 2026-09-10: "the
         emergency contact heading is taking very much space"). "Emergency" is
         the whole word and the column beside it is already headed Contact. */
      { label: 'Emergency', type: 'text', width: 15,
        value: t => String(t.emergencyPhone || '') },

      /* CNIC IS PARTLY MASKED, ON PURPOSE (owner, 2026-09-10: "hide other with
         **** so that the legal data of anyone cannot be used or seen").

         A national identity number is the single most sensitive field this app
         holds, and a printed roster is a document that gets left on a desk,
         photographed and forwarded. Enough is shown to MATCH a person against
         a record they are holding — the issuing district and the first digits
         — and the rest is stars. The full number is on the student's own
         record for anyone who needs it, one click away, and is untouched in
         the database. */
      { label: 'CNIC', type: 'text', width: 16, value: t => _stuMaskCnic(t.cnic) },

      /* OCCUPATION, one word (owner, 2026-09-10). "Course / Study /
         Profession" is three words for one field, and it is the one field it
         has always read: `t.occupation`. */
      { label: 'Occupation', type: 'text', width: 22,
        value: t => t.occupation || t.course || '' },

      /* THE DATE A ROSTER IS ACTUALLY READ FOR (owner, 2026-09-10: "one
         important thing is missing: date of admit or admission"). It was
         dropped when the columns were cut to the reference sheet, which draws
         a departure date instead — but a roster of who is HERE is read for
         when each of them arrived. */
      { label: 'Admitted', type: 'date', width: 13, value: t => t.joinDate || '' },

      { label: 'Gender', type: 'text', width: 9, value: t => t.gender || _stuDefaultGender() },

      { label: 'Address', type: 'wrap', width: 24, value: t => t.address || '' },

      /* Pakistani unless the record says otherwise (owner, 2026-09-10). Every
         hostel this app ships to is in Pakistan and all but a handful of
         students are Pakistani; a column of dashes over a fact that is true
         199 times in 200 is a column nobody reads. The word matches the
         admission form's own list — see the register cell for why. */
      { label: 'Nationality', type: 'text', width: 12,
        value: t => t.nationality || 'Pakistani' },

      { label: 'Charges (Rs.)', type: 'money', width: 14, total: 'sum',
        value: t => { const c = resolveCharges(t); return c.configured ? c.total : null; },
        get:   t => { const c = resolveCharges(t);
          if (!c.configured) return '<span style="color:#4B5563">not set</span>';
          /* The label, not the sum restated (owner, 2026-09-10). */
          return '<b>' + fmtPKR(c.total) + '</b><span class="sub">' +
                 escHtml(chargeCoverage({ rent: c.rent, mess: c.mess,
                   messIncluded: c.messOptIn && c.mess > 0, hasMess: c.mess > 0 }).label) +
                 '</span>'; } },

      { label: 'Status', type: 'status', width: 12, value: t => t.status || 'Active' },

      /* THE DEPARTURE DATE FOLDS INTO REMARKS (owner, 2026-09-10: "Date (Left
         / Cancelling / Expelled) — remove these lines and make remarks
         column"). It was a 33-character heading over a column that is empty
         for every student who is still here — which on a live roster is nearly
         all of them — and the fact it carried is one clause: left on this day,
         for this reason. Remarks says both, and only on the rows that have
         either. */
      { label: 'Remarks', type: 'wrap', width: 26, value: t => _stuRemark(t) },
    ],

    rows: list,
    empty: 'No students match the selected filters.',
  };
}

/* The selection bar's export — a workbook, because a ticked set of students is
   a working list, not a document to file. */
function stuBulkExport() {
  const ids  = new Set([...stuSelected]);
  const list = studentsFiltered().filter(t => ids.has(t.id));
  if (!list.length) { toast('Nothing selected to export', 'error'); return; }
  EXPORT.excel(_stuExportDef(list, {
    selection: list.length + ' selected student' + (list.length === 1 ? '' : 's'),
  }));
}

/* THE WHOLE REGISTER, FROM THE REPORTS BAR (owner, 2026-09-10). Not the
   filtered view: this is the button a hostel presses to hand somebody the
   roster, so it is every student the app holds, in room order, headed the way
   the owner's sheet heads it. The register page's own Export is the filtered
   one, and says so on the file. */
function exportAllStudentsPDF() {
  const list = studentsByRoom((DB.students || []).slice());
  if (!list.length) { toast('No students to export', 'error'); return; }
  EXPORT.pdf(_stuExportDef(list, {
    title: 'Student Record Register',
    scope: 'Complete record — all students',
  }));
}

function exportStudentsPDF() {
  const list = studentsFiltered();
  if (!list.length) { toast('No students to export', 'error'); return; }
  EXPORT.pdf(_stuExportDef(list));
}

function exportStudentsExcel() {
  const list = studentsFiltered();
  if (!list.length) { toast('No students to export', 'error'); return; }
  EXPORT.excel(_stuExportDef(list));
}

/* ══════════════════════════════════════════════════════════════════════════
   ADD / EDIT STUDENT — full page (was a modal)
   The reference design shows this as a page: sidebar visible, Back button in
   the header, action bar at the foot of the content area. showAddStudentModal()
   is kept as the entry point so the ~8 existing call sites (rooms, seat
   modals, dashboard, command palette, header action) are untouched — it now
   navigates instead of opening a modal.
   ══════════════════════════════════════════════════════════════════════════ */
let _addStudentPresetRoom = '';

function showAddStudentModal(presetRoomId='') {
  // Admitting a student is the archetypal 'add a record' action — and since
  // 2026-09-10 that is its own permission, separate from changing one.
  if (typeof requirePerm === 'function' && !requirePerm('add')) return;
  _addStudentPresetRoom = presetRoomId || '';
  closeModal();              // harmless when nothing is open; clears a caller's modal
  navigate('addstudent');
}

/* ══ ADD STUDENT — the intake page ═══════════════════════════════════════════

   Relaid out 2026-09-03, because the previous pass made this the one screen in
   the app that did not look like the app. It was built to the "Add Student"
   mockup as a registry sheet: square corners, corner registration marks on
   every panel, a 38px Barlow Condensed headline over the chrome bar's own page
   title, a 32px display numeral for the id, and uppercase micro-labels. Held
   next to Edit Student — which shows THESE VERY FIELDS through .sf-sec /
   .sf-grid / .sf-in — one record had two unrelated-looking forms depending on
   whether it existed yet.

   So the grammar is the app's now and the skeleton is still the owner's:
   numbered sections, a completion meter, a left rail carrying the photo and
   the record's provable facts, a footer action bar. What changed is that the
   sections ARE .sf-sec cards, the header is the breadcrumb + 22px title that
   Add Payment uses, and the fields are the shared sf- set with no page-local
   overrides. See renderer/students.css for the full reasoning.

   NOT ONE FIELD WAS ADDED OR REMOVED, and every id and handler is the one that
   was here before. submitAddStudent() reads this form by element id, so a
   rename here is a silent data loss there — the markup moved, the contract did
   not.

   THE MOCKUPS' SAMPLE DATA IS NOT COPIED IN. They name a student, a father and
   a street address, and the owner's 2026-08-30 ruling is that no seeded default
   may name a real person or address. The placeholders here describe the field
   instead. The shipped form once had exactly that problem — "Muhammad Ali",
   "Ikram Khan (Father)", "House # 25, Street 4, Peshawar" were its placeholders.

   The "Record" panel states only things the app can prove: who is signed in,
   how many beds are actually free, and the id this student will get. The
   mockups' "Session · Fall 2026" is not modelled anywhere in this app, so it
   is not shown; an invented number on a screen is the one thing that rule
   forbids outright.                                                          */

/* The fields the completion meter counts. Required ones are weighted the same
   as optional ones deliberately: the meter answers "how much of this sheet is
   filled in", not "may I save yet". Saving is gated by submitAddStudent(). */
const ASF_TRACKED = [
  'f-tname', 'f-tfname', 'f-tcnic', 'f-tdob', 'f-tgender', 'f-tmarital',
  'f-tnationality', 'f-tocc', 'f-tsession', 'f-tphone', 'f-temerg',
  'f-temergphone', 'f-temail', 'f-taddress', 'f-troom', 'f-tbed', 'f-tjoin',
  'f-texpstay', 'f-tblood', 'f-tallergies', 'f-tnotes',
];

/* THE FOUR STEPS (add form.png, owner 2026-09-15) replace the completion meter.
   A step is DONE when its required fields hold a value — the fourth has none,
   so any note at all completes it — and the CURRENT step is the first one that
   is not done. Read from the fields on every input, like the meter was. */
const ASF_STEP_REQ = {
  1: ['f-tname', 'f-tfname'],
  2: ['f-tphone'],
  3: ['f-troom', 'f-tjoin'],
  4: ['f-tallergies', 'f-tnotes'],
};
function asfCompletion() {
  const filled = id => { const el = document.getElementById(id); return !!(el && String(el.value || '').trim()); };
  let current = 0;
  [1, 2, 3, 4].forEach(n => {
    const done = n === 4 ? ASF_STEP_REQ[n].some(filled) : ASF_STEP_REQ[n].every(filled);
    const li = document.querySelector('.asf-step[data-step="' + n + '"]');
    if (li) li.classList.toggle('is-done', done);
    if (!done && !current) current = n;
  });
  if (!current) current = 4;
  document.querySelectorAll('.asf-step').forEach(li =>
    li.classList.toggle('is-on', Number(li.getAttribute('data-step')) === current));
  // Record Preview's Admission Date follows the Join date field as it is typed.
  const rj = document.getElementById('asf-rec-join'), jv = document.getElementById('f-tjoin');
  if (rj && jv) rj.textContent = jv.value ? fmtDate(jv.value) : '—';
}

/** Post-render hook, called from renderPage the way bindSettingsEvents is. */
function asfInit() {
  /* CLEARED ON EVERY OPEN. _asfDocs is module state, so without this a warden
     who starts an admission, attaches a CNIC scan and then cancels carries that
     scan into the NEXT student's record — a document filed against the wrong
     person, which is the worst kind of bug this form could have. */
  _asfDocs = [];
  asfCountFields();
  asfCompletion();
}

// ════════════════════════════════════════════════════════════════════════════
// ADD STUDENT — DOCUMENTS
// ════════════════════════════════════════════════════════════════════════════
/* The rail block's whole body, re-rendered in place after every add or remove.
   Rebuilding the list rather than patching a row keeps one description of what
   the block looks like — the alternative is markup here and slightly different
   markup in three handlers.

   The three named kinds always show, filled or not: "Not attached" against
   Father's CNIC is the answer to a question a warden actually asks, and a row
   that only appears once the file exists cannot answer it. Extras stack under
   them. */
function asfDocsList() {
  const total = _asfDocs.reduce((s, d) => s + (Number(d.size) || 0), 0);
  const row = (kind, doc) => {
    const label = doc && doc.kind === 'other' ? (doc.label || 'Other document') : stuDocLabel(kind);
    return `
    <div class="asf-doc${doc ? ' is-on' : ''}">
      <span class="asf-doc__i">${doc ? _ASF_DOC_OK : _ASF_DOC_ADD}</span>
      <span class="asf-doc__x">
        <span class="asf-doc__n" title="${escHtml(label)}">${escHtml(label)}</span>
        <span class="asf-doc__s">${doc
          ? escHtml(stuDocExt(doc.type) + ' · ' + stuDocSize(doc.size))
          : 'Not attached'}</span>
      </span>
      ${doc
        ? `<button type="button" class="asf-doc__b" title="Remove ${escHtml(label)}"
                   onclick="asfDocRemove('${escHtml(doc.id)}')" aria-label="Remove ${escHtml(label)}">${_ASF_DOC_X}</button>`
        : `<button type="button" class="asf-doc__b" title="Attach a file or photo"
                   onclick="asfDocPick('${escHtml(kind)}')" aria-label="Attach ${escHtml(stuDocLabel(kind))}">${_ASF_DOC_UP}</button>`}
    </div>`;
  };

  const named = STU_DOC_KINDS
    .map(k => row(k.key, _asfDocs.find(d => d.kind === k.key))).join('');
  const extra = _asfDocs.filter(d => d.kind === 'other').map(d => row('other', d)).join('');
  const full  = _asfDocs.length >= STU_DOC_MAX_FILES;

  return named + extra
    + `<button type="button" class="asf-doc__add" onclick="asfDocPick('other')" ${full ? 'disabled' : ''}
               title="${full ? 'Five files is the limit for one record' : 'Attach any other document'}">
         ${_ASF_DOC_PLUS} ${full ? 'File limit reached' : 'Add another document'}
       </button>`
    + (_asfDocs.length
        ? `<div class="asf-doc__tot">${_asfDocs.length} file${_asfDocs.length === 1 ? '' : 's'}
             · ${escHtml(stuDocSize(total))}</div>`
        : `<div class="asf-doc__tot">Images or PDF · up to ${stuDocSize(STU_DOC_MAX_BYTES)} each</div>`);
}
const _ASF_DOC_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const _ASF_DOC_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
const _ASF_DOC_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/></svg>';
const _ASF_DOC_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
const _ASF_DOC_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';

function asfDocsRefresh() {
  const el = document.getElementById('asf-docs');
  if (el) el.innerHTML = asfDocsList();
}

/* Which slot the next file lands in is remembered on the input rather than in
   another module variable: the input IS the pending operation, and a second
   piece of state saying the same thing is a second thing to get out of sync. */
function asfDocPick(kind) {
  if (_asfDocs.length >= STU_DOC_MAX_FILES) {
    toast('Five documents is the limit for one student record', 'error');
    return;
  }
  const el = document.getElementById('asf-doc-file');
  if (!el) return;
  el.dataset.kind = kind || 'other';
  el.value = '';          // so re-picking the SAME file still fires onchange
  el.click();
}

function asfDocLoad(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const kind = input.dataset.kind || 'other';

  /* Checked against the STORED list, not against the DOM: the row is redrawn
     from _asfDocs, so _asfDocs is the thing that must never go over. */
  if (_asfDocs.length >= STU_DOC_MAX_FILES) {
    toast('Five documents is the limit for one student record', 'error'); return;
  }
  if (file.size > STU_DOC_MAX_BYTES) {
    toast(`"${file.name}" is ${stuDocSize(file.size)} — the limit is ${stuDocSize(STU_DOC_MAX_BYTES)} a file`, 'error');
    return;
  }
  /* An empty type is what Windows hands back for a file with no association.
     Rejecting on type alone would refuse a perfectly good scan, so this only
     refuses what it can positively identify as neither an image nor a PDF. */
  const ty = String(file.type || '');
  if (ty && !/^image\//.test(ty) && ty !== 'application/pdf') {
    toast('Only images and PDFs can be attached', 'error'); return;
  }

  const reader = new FileReader();
  reader.onerror = () => toast('Could not read "' + file.name + '"', 'error');
  reader.onload = (e) => {
    const doc = {
      id: 'doc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      kind,
      // The file's own name is the label for an extra; a named slot keeps its
      // name, so renaming the scan cannot rename the row.
      label: kind === 'other' ? String(file.name || 'Other document').slice(0, 60) : stuDocLabel(kind),
      name: String(file.name || ''),
      type: ty || 'application/octet-stream',
      size: Number(file.size) || 0,
      data: String(e.target.result || ''),
      addedAt: today(),
    };
    // One file per named slot: attaching a second Father's CNIC replaces the
    // first rather than stacking two rows both claiming to be it.
    if (kind !== 'other') _asfDocs = _asfDocs.filter(d => d.kind !== kind);
    _asfDocs.push(doc);
    asfDocsRefresh();
    if (typeof asfCompletion === 'function') asfCompletion();
    toast(doc.label + ' attached', 'success');
  };
  reader.readAsDataURL(file);
}

function asfDocRemove(id) {
  const d = _asfDocs.find(x => x.id === id);
  _asfDocs = _asfDocs.filter(x => x.id !== id);
  asfDocsRefresh();
  if (typeof asfCompletion === 'function') asfCompletion();
  if (d) toast(d.label + ' removed', 'info');
}

/* Fill in each section's "N fields · M required" from the fields it actually
   renders. Counting the DOM rather than trusting a hand-typed string is the
   whole point — see the note on sec() in renderAddStudent(). */
function asfCountFields() {
  document.querySelectorAll('.asf [data-asf-count]').forEach(el => {
    const card = el.closest('.sf-sec');
    if (!card) return;
    const fields = card.querySelectorAll('.sf-f').length;
    const req    = card.querySelectorAll('.sf-f .req').length;
    // "10 FIELDS • 2 REQUIRED" — the reference's separator; the CSS uppercases it.
    el.textContent = fields + (fields === 1 ? ' field' : ' fields')
                   + (req ? ' • ' + req + ' required' : '');
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   STUDENT DOCUMENTS  (owner, 2026-09-10: "add documents upload option so to
   upload student id or any identity document, father cnic, POR etc etc to add
   student form belov student photo and the free speace belov at the bottom
   vhich looks avkvard.")

   THE SPACE IS REAL AND IT IS 403 PIXELS. Measured on the running form at
   1440x900: the left rail ends at y=716 with Record summary and the main
   column runs to y=1119. Everything below the rail was blank. This block is
   the third rail card, under the photo, exactly where the owner put it.

   NAMED SLOTS, NOT A PILE. The owner named three documents — student ID,
   father's CNIC, POR — and "etc etc" is the fourth. A generic "attach files"
   list would have made a warden type what each one was, in a 220px rail, and
   left the profile drawer with no way to ask "is the POR on file?". Named rows
   answer that at a glance, and they are the same three rows the drawer has
   been drawing as disabled placeholders since 2026-09-06 waiting for exactly
   this — see _stuPanelDocuments().

   STORED AS DATA URIs ON THE RECORD, like the photo, because that is what this
   app already does and a second storage mechanism for the same kind of thing
   is how the two drift. The cost is real, so the caps below are not decoration:
   the DB is one JSON document and a hostel with 200 students could otherwise
   write a 400MB one. */
const STU_DOC_KINDS = [
  { key: 'studentId',  label: 'Student ID / B-Form' },
  { key: 'fatherCnic', label: "Father's CNIC" },
  { key: 'por',        label: 'Proof of residence (POR)' },
  // The scan of the signed admission form's back side (spec §2.7, step 11).
  { key: 'undertaking', label: 'Signed undertaking' },
];
/* 3MB a file and 5 files. The photo's own cap is 5MB and it is ONE image per
   student; five scans at five megabytes is 25MB on a single record, which is
   past what a JSON database rewritten on every save can carry. A phone photo
   of a CNIC is 1-2MB, and a scan is smaller. */
const STU_DOC_MAX_BYTES = 3 * 1024 * 1024;
const STU_DOC_MAX_FILES = 5;
const STU_DOC_ACCEPT = 'image/*,application/pdf';

/* The documents staged on the Add Student form before there is a student to
   attach them to. Cleared by asfInit() on every open of the form — without
   that, cancelling an admission and starting another one carries the first
   student's CNIC scan into the second one's record. */
let _asfDocs = [];

function stuDocLabel(kind) {
  const k = STU_DOC_KINDS.find(x => x.key === kind);
  return k ? k.label : 'Other document';
}
function stuDocSize(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return Math.round(v / 1024) + ' KB';
  return (v / 1024 / 1024).toFixed(1) + ' MB';
}
/* The type badge on a row. It comes off the STORED mime, not off the file
   name: a warden who renames a PDF to .jpg still gets a row that says PDF, and
   a viewer that opens it as one. */
function stuDocExt(mime) {
  const m = String(mime || '');
  if (m === 'application/pdf') return 'PDF';
  const sub = (m.split('/')[1] || '').toUpperCase();
  return sub === 'JPEG' ? 'JPG' : (sub || 'FILE');
}
function stuDocsOf(t) {
  return (t && t.docs && Array.isArray(t.docs.files)) ? t.docs.files : [];
}

/* The empty state of the photo well. It is a function because THREE places
   need the identical markup: the initial render, and clearAddStudentPhoto()
   putting it back — which used to write a bare 🧑‍🎓 emoji, so removing a
   photo left a screen that matched nothing else in the app. The well is also
   the drop target now; it used to be a picture frame with a second, separate
   "Upload photo / or drag and drop" box stacked under it asking for the same
   file twice. */
/* The empty photo well, as add form.png draws it: a silhouette, what to do, the
   real limit (loadAddStudentPhoto() refuses over 5 MB), and a Choose Photo
   button. The whole well stays the click and drop target; the button is the
   visible, keyboard-reachable way in. */
function asfPhotoPlaceholder() {
  return `<div class="asf-photo__empty">
    <span class="asf-photo__av"><svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="currentColor" opacity=".14"/><circle cx="32" cy="25" r="10" fill="currentColor" opacity=".5"/><path d="M13 53c3-10 10.5-15 19-15s16 5 19 15" fill="currentColor" opacity=".5"/></svg></span>
    <b>Upload student photo</b><span>JPG, PNG (Max 5 MB)</span>
    <span class="asf-photo__choose" role="button" tabindex="0"
          onclick="event.stopPropagation();triggerStudentPhotoUpload()"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();triggerStudentPhotoUpload()}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/></svg>
      Choose Photo</span>
  </div>`;
}

function renderAddStudent() {
  /* ══ NEW STUDENT ADMISSION, TO `add form.png` (owner, 2026-09-15) ═════════
     "align and improve hierarchy like the reference". The fields, their ids
     and every handler are unchanged — submitAddStudent() and each reader find
     them by id, so an id here is a contract. What moved is the hierarchy:
       · a page title and a four-step progress row (asfCompletion) instead of
         the completion meter;
       · numbered sections with a one-line description and "N FIELDS • N
         REQUIRED";
       · an icon segment inside the inputs the reference marks;
       · the rail's three cards as drawn — Student Photo, Record Preview,
         Documents;
       · the action bar OUTSIDE .asf, docked to the bottom edge of the window
         like the Add Payment buttons ("lowered and narrowed and adjacent to
         the windows taskbar"). */
  const presetRoomId = _addStudentPresetRoom || '';
  const allRooms = roomsByNumber(DB.rooms);
  const preset = presetRoomId ? DB.rooms.find(r=>r.id===presetRoomId) : null;
  const presetType = preset ? getRoomType(preset) : null;
  const presetLabel = preset ? 'Room #'+preset.number+' · '+(presetType?presetType.name:'')+' · '+(preset.floor||'')+' Floor' : '';
  const enteredBy = (typeof CUR_USER === 'object' && CUR_USER && (CUR_USER.name || CUR_USER.username)) || '—';
  const presetCharges = preset ? resolveCharges({ roomId: preset.id }) : null;

  // A 15px line glyph, for the input segments and the card heads.
  const S = path => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const P = {
    id:      '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.6-1.3 1.5-2 2.5-2s1.9.7 2.5 2"/><path d="M14 10h4"/><path d="M14 13h3"/>',
    globe:   '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20"/>',
    book:    '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    cal:     '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    mail:    '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    user:    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    phone:   '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2z"/>',
    pin:     '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    bed:     '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    seat:    '<path d="M7 18v3"/><path d="M17 18v3"/><path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M3 11h18v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    layers:  '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
    coin:    '<circle cx="12" cy="12" r="10"/><path d="M15 9.5a3 3 0 0 0-3-1.5h-.5a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 1 0 5H12a3 3 0 0 1-3-1.5"/><path d="M12 6v2"/><path d="M12 16v2"/>',
    heart:   '<path d="M19 14c1.5-1.5 3-3.4 3-5.5A5.5 5.5 0 0 0 12 5.4 5.5 5.5 0 0 0 2 8.5c0 2.1 1.5 4 3 5.5l7 7z"/>',
    note:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
    photo:   '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    eye:     '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    doc:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
    cam:     '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    chev:    '<path d="m9 18 6-6-6-6"/>',
  };
  // An input or select with the reference's icon segment on its left.
  const ic = (path, control, extra) => `<div class="asf-ic${extra ? ' ' + extra : ''}"><span class="asf-ic__i">${S(path)}</span>${control}</div>`;

  /* A numbered section. meta === 'auto' means asfCountFields() writes
     "N FIELDS • N REQUIRED" after render, from the fields the card holds. */
  const sec = (n, title, sub, meta, body) => `
    <section class="sf-sec asf-sec" id="asf-sec-${n}">
      <div class="sf-sec__h asf-sec__h">
        <span class="asf-disc">${n}</span>
        <div class="asf-sec__tt">
          <div class="asf-sec__t">${escHtml(title)}</div>
          <div class="asf-sec__s">${escHtml(sub)}</div>
        </div>
        ${meta === 'auto'
          ? '<span class="asf-secmeta" data-asf-count="1"></span>'
          : (meta ? `<span class="asf-secmeta">${escHtml(meta)}</span>` : '')}
      </div>
      ${body}
    </section>`;
  // A rail card: a filled icon square and a title (.sf-sec__h > svg).
  const card = (path, title, body) => `
    <div class="sf-sec asf-card">
      <div class="sf-sec__h asf-card__h">${S(path)}${escHtml(title)}</div>
      ${body}
    </div>`;

  const sel = (id, label, opts, cur, req, path) => {
    const control = `<select class="sf-sel" id="${id}">
        ${opts.map(o=>`<option value="${escHtml(o)}" ${o===cur?'selected':''}>${escHtml(o||'Select '+label.toLowerCase())}</option>`).join('')}
      </select>`;
    return `
    <div class="sf-f">
      <label for="${id}">${label}${req?'<span class="req">*</span>':''}</label>
      ${path ? ic(path, control) : control}
    </div>`;
  };

  const STEPS = ['Student Info', 'Contact Info', 'Hostel Allotment', 'Health & Notes'];

  return `
  <div class="asf" oninput="asfCompletion()" onchange="asfCompletion()">

    <!-- ══ HEADER: where, what, and how far ══ -->
    <div class="asf-top">
      <div class="asf-top__l">
        <nav class="asf-crumb" aria-label="Breadcrumb">
          <span>Students</span>${S(P.chev)}
          <a href="#" onclick="event.preventDefault();navigate('students')">Roster</a>${S(P.chev)}
          <b aria-current="page">New Admission</b>
        </nav>
        <h2 class="asf-title">New Student Admission</h2>
        <div class="asf-sub">Register a new student — payment is collected in the next step.</div>
      </div>
      <ol class="asf-steps" aria-label="Form progress">
        ${STEPS.map((l, i) => `
        <li class="asf-step${i === 0 ? ' is-on' : ''}" data-step="${i + 1}">
          <button type="button" onclick="asfGoStep(${i + 1})" title="Go to ${escHtml(l)}">
            <span class="asf-step__n">${i + 1}</span><span class="asf-step__l">${escHtml(l)}</span>
          </button>
        </li>`).join('')}
      </ol>
    </div>

    <div class="asf-body">

      <!-- ══ LEFT RAIL ══ -->
      <div class="asf-rail">
        ${card(P.photo, 'Student Photo', `
          <div class="asf-photo" id="add-student-photo-preview" title="Click to upload a photo"
               onclick="triggerStudentPhotoUpload()"
               ondragover="event.preventDefault();this.classList.add('is-over')"
               ondragleave="this.classList.remove('is-over')"
               ondrop="sfDropPhoto(event)">${asfPhotoPlaceholder()}</div>
          <div class="asf-photo-acts">
            <button type="button" class="sf-btn" id="add-student-cam-btn" onclick="openAddStudentCamera()">
              ${S(P.cam)} Take Photo
            </button>
            <button type="button" class="sf-btn" id="add-student-clear-btn" style="display:none;color:var(--red)" onclick="clearAddStudentPhoto()">Remove</button>
          </div>
          <input type="file" id="add-student-photo-file" accept="image/*" style="display:none" onchange="loadAddStudentPhoto(this)">
          <input type="hidden" id="add-student-photo-data" value="">
          <div id="add-student-cam-box" style="display:none;margin-top:9px">
            <video id="add-student-cam-video" autoplay playsinline style="width:100%;border-radius:12px;background:#000"></video>
            <canvas id="add-student-cam-canvas" style="display:none"></canvas>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button type="button" class="sf-btn sf-btn--go" style="flex:1;justify-content:center;padding:0 12px" onclick="captureAddStudentPhoto()">Capture</button>
              <button type="button" class="sf-btn" style="flex:1;justify-content:center;padding:0 12px" onclick="closeAddStudentCamera()">Close</button>
            </div>
          </div>`)}

        ${card(P.eye, 'Record Preview', `
          <div class="asf-rec">
            <div class="asf-rec__r"><span class="asf-rec__k">Student ID</span>
              <span class="asf-rec__v asf-num asf-num--id">#${escHtml(nextStudentId())}</span></div>
            <div class="asf-rec__r"><span class="asf-rec__k">Entered by</span>
              <span class="asf-rec__v">${escHtml(enteredBy)}</span></div>
            <div class="asf-rec__r"><span class="asf-rec__k">Admission Date</span>
              <span class="asf-rec__v asf-num" id="asf-rec-join">${escHtml(fmtDate(today()))}</span></div>
            <div class="asf-rec__r"><span class="asf-rec__k">Status</span>
              <span class="asf-rec__st">New (Unsaved)</span></div>
          </div>`)}

        ${card(P.doc, 'Documents', `
          <div class="asf-docs" id="asf-docs">${asfDocsList()}</div>
          <input type="file" id="asf-doc-file" accept="${STU_DOC_ACCEPT}" style="display:none"
                 onchange="asfDocLoad(this)">
        `)}
      </div>

      <!-- ══ MAIN ══ -->
      <div class="asf-main">

        ${sec(1, 'Student Identity', 'Basic information about the student.', 'auto', `
          <div class="asf-fg asf-fg--4">
            <div class="sf-f"><label for="f-tname">Full name<span class="req">*</span></label>
              ${ic(P.id, `<input class="sf-in" id="f-tname" placeholder="Enter full name" oninput="autoCapName(this)" style="text-transform:capitalize">`)}</div>
            <div class="sf-f"><label for="f-tfname">Father's name<span class="req">*</span></label>
              <input class="sf-in" id="f-tfname" placeholder="Enter father's name" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
            <div class="sf-f"><label for="f-tcnic">CNIC / B-Form</label>
              <div class="sf-wrapin">
                <input class="sf-in asf-in--plain" id="f-tcnic" placeholder="00000-0000000-0" maxlength="15" oninput="fmtCnic(this);sfCheckCnic()">
                <svg class="sf-ok" id="f-tcnic-ok" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
            </div>
            <div class="sf-f"><label for="f-tdob">Date of birth</label>
              <input class="sf-in" id="f-tdob" type="date"></div>
          </div>

          <div class="asf-fg asf-fg--4">
            ${''/* Gender is preselected from what the hostel said it is (owner,
                   2026-09-10); a mixed hostel gets no default. */}
            ${sel('f-tgender','Gender',['','Male','Female','Other'],_stuDefaultGender())}
            ${sel('f-tmarital','Marital status',['','Single','Married'],'Single')}
            ${sel('f-tnationality','Nationality',['Pakistani','Afghan','Other'],'Pakistani', false, P.globe)}
            ${sel('f-tblood','Blood group',['','A+','A-','B+','B-','AB+','AB-','O+','O-'],'')}
          </div>

          <div class="asf-fg asf-fg--2">
            <div class="sf-f"><label for="f-tocc">Course / study field</label>
              <div class="asf-ic" id="f-tocc-wrap">
                <span class="asf-ic__i">${S(P.book)}</span>
                <input class="sf-in" id="f-tocc" placeholder="e.g. BS Computer Science" autocomplete="off"
                  oninput="courseAutocomplete(this)" onfocus="courseAutocomplete(this)" onkeydown="courseKeyNav(event)"
                  onblur="setTimeout(()=>{const d=document.getElementById('course-suggestions');if(d)d.style.display='none';},200)">
                <div id="course-suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border2);border-radius:11px;z-index:600;max-height:200px;overflow-y:auto;box-shadow:var(--shadow);margin-top:4px"></div>
              </div>
              <input type="hidden" id="f-tocctype" value="Student">
              <input type="hidden" id="f-tocccustom" value="">
            </div>
            <div class="sf-f"><label for="f-tsession">Session / semester</label>
              ${ic(P.cal, `<input class="sf-in" id="f-tsession" placeholder="e.g. Fall 2026 / 3rd Semester">`)}</div>
          </div>`)}

        <div class="asf-row">
          ${sec(2, 'Contact Information', 'Phone, email and guardian details.', 'auto', `
            <div class="asf-fg asf-fg--2">
              <div class="sf-f"><label for="f-tphone">Phone number<span class="req">*</span></label>
                <div class="asf-phone"><span class="sf-prefix">+92</span>
                  <div class="asf-phone__in">
                    <input class="sf-in" id="f-tphone" placeholder="3xx 1234567" maxlength="12" oninput="fmtPhone(this)">
                  </div></div>
              </div>
              <div class="sf-f"><label for="f-temail">Email address</label>
                <div class="asf-ic">
                  <span class="asf-ic__i">${S(P.mail)}</span>
                  <input class="sf-in" id="f-temail" type="text" placeholder="student" oninput="fmtEmail(this)" autocomplete="off">
                  <span id="f-temail-hint" style="display:none;position:absolute;right:11px;font-size:12px;color:var(--text3);pointer-events:none">@gmail.com</span>
                </div>
              </div>
              ${''/* GUARDIAN, NOT EMERGENCY (brief §7). The ids do not move —
                     f-temerg / f-temergphone are read by submitAddStudent(). */}
              <div class="sf-f"><label for="f-temerg">Guardian name</label>
                ${ic(P.user, `<input class="sf-in" id="f-temerg" placeholder="Enter guardian name">`)}</div>
              <div class="sf-f"><label for="f-temergphone">Guardian contact</label>
                ${ic(P.phone, `<input class="sf-in" id="f-temergphone" placeholder="03xx 1234567">`)}</div>
              <div class="sf-f" style="grid-column:span 2"><label for="f-taddress">Home address</label>
                ${ic(P.pin, `<input class="sf-in" id="f-taddress" placeholder="House, street, area, city"
                    autocomplete="off" oninput="cityAutocomplete(this)" onblur="hideCitySuggestions()">`)}
                <div id="f-taddress-suggestions" class="city-suggestions"></div>
              </div>
            </div>`)}

          ${sec(3, 'Hostel Allotment', 'Room and stay details.', 'auto', `
            <div class="asf-fg asf-fg--2">
              <div class="sf-f" style="grid-column:span 2"><label for="f-troom-search">Room<span class="req">*</span></label>
                <div style="position:relative">
                  <input type="hidden" id="f-troom" value="${escHtml(presetRoomId)}">
                  ${ic(P.bed, `<input class="sf-in" id="f-troom-search" placeholder="Search room number, type or floor" autocomplete="off"
                      value="${escHtml(presetLabel)}"
                      oninput="filterRoomSearch(this.value)" onfocus="filterRoomSearch(this.value)"
                      onblur="setTimeout(()=>{const d=document.getElementById('room-search-drop');if(d)d.style.display='none';},180)">`)}
                  <div id="room-search-drop" class="sf-drop-list">
                    ${allRooms.map(r=>{
                      const rt=getRoomType(r); const free=roomFreeBeds(r); const vac=getRoomVacating(r);
                      const isFull = free<=0;
                      const lbl='Room #'+r.number+' · '+rt.name+' · '+r.floor+' Floor';
                      const rc=resolveCharges({roomId:r.id});
                      return '<div class="sf-drop-item room-search-item" data-id="'+r.id+'" data-rent="'+rc.rent+'"'
                        +' data-label="'+escHtml(lbl)+'"'
                        +' onmousedown="pickRoomSearch(\''+r.id+'\','+rc.rent+',\''+escHtml(lbl).replace(/'/g,"\\'")+'\')">'
                        +'<div><b>Room #'+escHtml(String(r.number))+'</b> <span>'+escHtml(rt.name)+' · '+escHtml(r.floor||'')+' Floor</span></div>'
                        +'<div style="text-align:right"><span style="color:'+(isFull?'var(--red)':vac>0||free<=1?'var(--amber)':'var(--green)')+';font-weight:700">'
                        +escHtml(roomAvailLabel(r))+'</span>'
                        +'<div style="font-size:10px;color:'+(rc.configured?'var(--text3)':'var(--red)')+';font-weight:700">'
                        +(rc.configured?fmtPKR(rc.total)+'/mo':'No rent set')+'</div></div></div>';
                    }).join('')}
                    ${allRooms.length===0?'<div class="sf-drop-item"><span>No rooms configured</span></div>':''}
                  </div>
                </div>
                <div id="f-troom-selected-label" class="asf-picked"></div>
              </div>
              <div class="sf-f"><label for="f-tbed">Bed / seat</label>
                ${ic(P.seat, `<select class="sf-sel" id="f-tbed">${sfBedOptions(preset)}</select>`)}</div>
              <div class="sf-f"><label for="f-tfloor">Floor</label>
                ${ic(P.layers, `<input class="sf-in sf-in--ro" id="f-tfloor" value="${escHtml(preset?(preset.floor||'')+' Floor':'')}" placeholder="Set by room" readonly>`)}</div>
              <div class="sf-f" style="grid-column:span 2"><label>Monthly charge</label>
                ${ic(P.coin, `<input class="sf-in sf-in--ro" id="f-trent-display" readonly placeholder="Set by room (Rs.)"
                  value="${presetCharges && presetCharges.configured ? escHtml(fmtPKR(presetCharges.total)+' / month') : ''}">`)}</div>
              <div class="sf-f"><label for="f-tjoin">Join date<span class="req">*</span></label>
                ${ic(P.cal, `<input class="sf-in" id="f-tjoin" type="date" value="${today()}">`)}</div>
              <div class="sf-f"><label for="f-texpstay">Stay until</label>
                ${ic(P.cal, `<input class="sf-in" id="f-texpstay" type="date">`)}</div>
            </div>
            ${/* The intake form does not ask how the FIRST payment will arrive,
                  so it carries the hostel's first ACTIVE method as the default. */''}
            <input type="hidden" id="f-tpm" value="${escHtml((DB.settings.paymentMethods||[]).filter(cfgMethodActive)[0] || DB.settings.paymentMethods[0] || 'Cash')}">`)}
        </div>

        ${sec(4, 'Health & Additional Notes', 'Medical information and any other important details.', 'Optional', `
          <div class="asf-fg asf-fg--notes">
            <div class="sf-f"><label for="f-tallergies">Allergies / medical condition</label>
              ${ic(P.heart, `<input class="sf-in" id="f-tallergies" placeholder="None reported">`)}</div>
            <div class="sf-f"><label for="f-tnotes">Notes for the warden</label>
              ${ic(P.note, `<textarea class="sf-ta" id="f-tnotes" maxlength="250" rows="1"
                placeholder="Anything the warden should know about this student…"
                oninput="sfCount()"></textarea>`, 'asf-ic--ta')}
              <div class="sf-count" id="f-tnotes-count">0/250</div>
            </div>
          </div>`)}
      </div>
    </div>
  </div>

  <!-- ══ ACTIONS — docked to the bottom edge of the window, outside .asf ══ -->
  <footer class="asf-foot">
    <button class="sf-btn" onclick="navigate('students')">Cancel</button>
    <span class="asf-foot__spacer"></span>
    ${presetRoomId?`<button class="sf-btn" onclick="submitAddStudent('${escHtml(presetRoomId)}',true)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      Save &amp; add another</button>`:''}
    <button class="sf-btn" onclick="submitAddStudent('${escHtml(presetRoomId)}', false, true)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
      Save as draft</button>
    <button class="sf-btn sf-btn--go" onclick="submitAddStudent('${escHtml(presetRoomId)}')">
      Save &amp; proceed to payment
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
    </button>
  </footer>`;
}

/* A step in the progress row takes you to its section. */
function asfGoStep(n) {
  const el = document.getElementById('asf-sec-' + n);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Bed / seat options for a room — one per seat of its type's capacity.
function sfBedOptions(room) {
  if (!room) return '<option value="">Select a room first</option>';
  const t = getRoomType(room);
  const cap = (t && t.capacity) || 1;
  let out = '';
  for (let i = 1; i <= cap; i++) out += '<option value="Bed '+i+'">Bed '+i+'</option>';
  return out;
}

function sfCount() {
  const ta = document.getElementById('f-tnotes'), el = document.getElementById('f-tnotes-count');
  if (ta && el) el.textContent = ta.value.length + '/250';
}

// A Pakistani CNIC is 13 digits; fmtCnic() renders it as 5-7-1.
function sfCheckCnic() {
  const inp = document.getElementById('f-tcnic'), ok = document.getElementById('f-tcnic-ok');
  if (!inp || !ok) return;
  ok.classList.toggle('on', String(inp.value).replace(/\D/g,'').length === 13);
}

function sfDropPhoto(ev) {
  ev.preventDefault();
  // currentTarget, not a fixed id: the drop target IS the photo well now, and
  // the well has to keep #add-student-photo-preview so loadAddStudentPhoto()
  // can replace its contents with the image.
  const el = ev.currentTarget || document.getElementById('add-student-photo-preview');
  if (el && el.classList) el.classList.remove('is-over');
  const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (!file || !/^image\//.test(file.type)) { toast('Drop an image file','error'); return; }
  const input = document.getElementById('add-student-photo-file');
  // Reuse the existing loader so resizing/preview behaviour stays identical.
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  loadAddStudentPhoto(input);
}

async function submitAddStudent(presetRoomId='', addAnother=false, saveOnly=false) {
  // Gated at the form AND at the submit: the page can be reached without the button.
  if (typeof requirePerm === 'function' && !requirePerm('add')) return;
  const name=document.getElementById('f-tname').value.trim();
  const roomId=document.getElementById('f-troom').value;
  // Rent is a property of the room, not of the student form — the form no
  // longer asks for it. resolveCharges() walks room → room type → Settings.
  // Payments owns money; admission only records which room was taken.
  const selectedRoomForRent = DB.rooms.find(r=>r.id===roomId);
  const admitCharges = resolveCharges({ roomId });
  const rent = admitCharges.rent;
  if(!name||!roomId){toast('Fill all required fields','error');return;}
  if(!admitCharges.configured){
    toast('That room has no rent configured — set it in Settings → Rent & Mess first','error');
    return;
  }
  const joinDate = document.getElementById('f-tjoin').value || today();
  const payMethod = document.getElementById('f-tpm').value;
  // Small readers so a field the form does not currently render (or a partly
  // filled draft) yields '' / 0 rather than throwing.
  const _v = id => document.getElementById(id)?.value?.trim() || '';
  const _n = id => parseFloat(document.getElementById(id)?.value) || 0;

  const t={
    id:nextStudentId(), name, fatherName:_v('f-tfname'),
    cnic:_v('f-tcnic'),
    phone:_v('f-tphone'), email:getEmailValue(),
    occupation: _v('f-tocc'),
    roomId, rent,
    // Mess starts from the room type's configured food charge and is on by
    // default; Settings → Rent & Mess is where it gets turned off for a
    // student who takes the room only. 0 on a hostel that has not split its
    // charge, so admissions behave exactly as before until it is configured.
    mess: admitCharges.mess,
    messOptIn: true,
    deposit: _n('f-tdeposit'),
    admissionFee: _n('f-tadmfee'),
    discount: _n('f-tdiscount'),
    joinDate, paymentMethod: payMethod,
    emergencyContact:_v('f-temerg'), address:_v('f-taddress'), notes:_v('f-tnotes'),
    // Fields added with the v5 form. They are persisted here and included in
    // the students CSV; the student-view modal and the printed card/PDF do not
    // render them yet.
    dob:_v('f-tdob'), gender:_v('f-tgender'), maritalStatus:_v('f-tmarital'),
    nationality:_v('f-tnationality'), session:_v('f-tsession'),
    emergencyPhone:_v('f-temergphone'),
    bed:_v('f-tbed'), expectedStay:_v('f-texpstay'),
    bloodGroup:_v('f-tblood'), allergies:_v('f-tallergies'),
    status:'Active', createdAt:today(),
    /* `files` sits BESIDE `photo`, never instead of it. Everything that reads a
       student photo reads docs.photo and none of it has to learn about the
       array; everything that reads documents goes through stuDocsOf(), which
       returns [] for every record written before today. A copy, not the live
       array — _asfDocs is cleared by the next asfInit() and a record holding a
       reference to it would be emptied along with the form. */
    docs: {
      photo: document.getElementById('add-student-photo-data')?.value || '',
      files: _asfDocs.map(d => ({ ...d })),
    }
  };
  // Fix #10: Capacity guard — warn warden but allow force-add with confirmation
  const selectedRoom = DB.rooms.find(r => r.id === roomId);
  if (selectedRoom) {
    const roomType = getRoomType(selectedRoom);
    // roomFreeBeds() already grants the bed that is on notice, so reaching this
    // warning now means genuinely over capacity with nobody leaving to make
    // room — which is what the warning has always claimed to mean.
    if (roomType && roomFreeBeds(selectedRoom) <= 0) {
      const currentOcc = getRoomOccupancy(selectedRoom);
      showConfirm(
        '⚠️ Room Is At Full Capacity',
        `Room #${escHtml(String(selectedRoom.number))} (${escHtml(roomType.name)}) already has ${currentOcc}/${roomType.capacity} students. Do you want to force-add ${escHtml(name)} anyway? Room capacity display will remain at ${roomType.capacity} but this room will show as over-capacity.`,
        async () => {
          t.isForced = true; // FIX: force-added students don't count against available seats
          DB.students.push(t);
          const room2 = DB.rooms.find(r=>r.id===roomId);
          logActivity('Student Force-Added', name + ' force-added to full Room #' + (room2?.number||'?') + ' ('+currentOcc+'/'+roomType.capacity+' cap)', 'Student');
          await saveDB();
          if(addAnother && presetRoomId) {
            closeModal(); toast('✅ ' + name + ' added to full room!','success');
            setTimeout(()=>showAddStudentModal(presetRoomId), 200);
          } else if(saveOnly) {
            closeModal(); navigate('students');
            toast('✅ ' + name + ' added (over capacity).','success');
          } else {
            closeModal(); navigate('students');
            toast('✅ ' + name + ' added to full room — record payment below.','success');
            setTimeout(()=>openPaymentForNewStudent(t.id), 350);
          }
        }
      );
      return;
    }
  }
  DB.students.push(t);
  const room = DB.rooms.find(r=>r.id===roomId);
  logActivity('Student Added', name + ' admitted to Room #' + (room?.number||'?'), 'Student');
  await saveDB();
  if(addAnother && presetRoomId) {
    closeModal();
    toast('\u2705 ' + name + ' added! Open next student for same room.','success');
    setTimeout(()=>showAddStudentModal(presetRoomId), 200);
  } else if(saveOnly) {
    closeModal();
    renderPage('students');
    toast('\u2705 ' + name + ' added successfully.','success');
  } else {
    closeModal();
    renderPage('students');
    toast('\u2705 ' + name + ' added — now record the payment below.','success');
    setTimeout(()=>openPaymentForNewStudent(t.id), 350);
  }
}

// Opens the Add Payment page with the newly added student already selected.
function openPaymentForNewStudent(studentId) {
  openAddPayment(studentId);
}
// ── Student-view modal return helpers ────────────────────────────────────
// _returnStudentId — defined in src/receipt.js

function editPaymentFromStudentView(payId, studentId) {
  _returnStudentId = studentId;
  showEditPaymentModal(payId);
}

// printReceiptFromStudentView() — moved to src/receipt.js


function showViewStudentModal(id) {
  const t=DB.students.find(x=>x.id===id); if(!t) return;
  const room=DB.rooms.find(r=>r.id===t.roomId);
  const rtype=room?getRoomType(room):null;
  const payHistory=DB.payments.filter(p=>p.studentId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  // Include partial amounts already collected from pending records
  const totalPaid=payHistory.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount),0)
    + payHistory.filter(p=>p.status==='Pending'&&Number(p.amount)>0&&p.unpaid!=null&&Number(p.unpaid)>0).reduce((s,p)=>s+Number(p.amount),0);
  // Due = only actual unpaid remainder
  /* The balance is calculateOutstanding(p), never the stored field. The old
     form asked two wrong questions: it skipped a record marked Paid that still
     carries a balance -- outstandingOf() answers a recorded `unpaid` first and
     always, deliberately, see the note above it in utils.js -- and where none
     was recorded it summed p.amount, the sum COLLECTED, as the sum OWED.
     Summing unfiltered is the sanctioned form: calculateOutstanding returns 0
     for a settled record, which is why the Pending filter is not a safety net
     but the thing that was losing money. */
  const totalDue=payHistory.reduce((s,p)=>s+calculateOutstanding(p),0);
  const paidCount=payHistory.filter(p=>p.status==='Paid').length;
  // Admission fee is stored on the payment that collected it, under either key
  // depending on the app version that wrote the row.
  const admPaid=payHistory.reduce((s,p)=>s+Number(p.admissionFee||p.fee||0),0);

  // One row of the Personal Information / Room & Accommodation lists. `act`
  // is an optional trailing affordance (call / mail) shown only when there is
  // a value to act on.
  /* `raw` renders the value as markup instead of escaping it. Exactly one row
     needs it — the CNIC, which is masked with a hover reveal (owner,
     2026-09-10) and so is two spans rather than a string. Everything else
     stays escaped, which is the default. */
  const infoRow=(k,v,act,raw)=>`<div class="svw-row">
      <span class="svw-row__k">${escHtml(k)}</span>
      <span class="svw-row__v${(v===null||v===undefined||v==='')?' is-empty':''}">${(v===null||v===undefined||v==='')?'—':(raw?String(v):escHtml(String(v)))}</span>
      ${act&&v?`<span class="svw-row__act">${act}</span>`:''}
    </div>`;

  showModal('modal-xl',``,`
    <div class="svw">

      <!-- PROFILE HEADER -->
      <div class="svw-hero">
        ${studentAvatar(t, 76, 'svw-hero__av')}
        <div class="svw-hero__id">
          <div class="svw-hero__name">${escHtml(t.name)}</div>
          <div class="svw-hero__no">#${escHtml(t.id)}</div>
          <div class="svw-hero__tags">
            ${statusBadge(t.status||'Active')}
            ${statusDateText(t)?`<span class="badge badge-gray">${escHtml(statusDateText(t))}</span>`:''}
            ${room?`<span class="badge badge-blue">Room ${escHtml(roomText(room))} · ${escHtml(rtype?.name||'')}</span>`:'<span class="badge badge-gray">No Room Assigned</span>'}
            <span class="badge badge-gray">${escHtml(t.paymentMethod||'Cash')}</span>
          </div>
        </div>
        <div class="svw-hero__rent">
          <div class="svw-hero__rentk">Monthly Charge</div>
          <div class="svw-hero__rentv">${fmtPKR(resolveCharges(t).total||0)}</div>
          <div class="svw-hero__rents">Admission paid: ${fmtPKR(admPaid)}</div>
        </div>
      </div>

      <!-- STATS ROW -->
      <div class="svw-stats">
        <div class="svw-stat dh-green">
          <span class="svw-stat__ico">${icon('wallet','sm')}</span>
          <span><span class="svw-stat__k">Total Paid</span><span class="svw-stat__v">${fmtPKR(totalPaid)}</span></span>
        </div>
        <div class="svw-stat ${totalDue>0?'dh-red':'dh-green'}">
          <span class="svw-stat__ico">${icon('receipt','sm')}</span>
          <span><span class="svw-stat__k">Outstanding</span><span class="svw-stat__v">${fmtPKR(totalDue)}</span></span>
        </div>
        <div class="svw-stat dh-blue">
          <span class="svw-stat__ico">${icon('calendar','sm')}</span>
          <span><span class="svw-stat__k">Join Date</span><span class="svw-stat__v is-text">${fmtDate(t.joinDate)||'—'}</span></span>
        </div>
        <div class="svw-stat dh-violet">
          <span class="svw-stat__ico">${icon('card','sm')}</span>
          <span><span class="svw-stat__k">Payments Made</span><span class="svw-stat__v">${paidCount}</span></span>
        </div>
      </div>

      <!-- PERSONAL INFO GRID -->
      <div class="svw-split">
        <div class="svw-card">
          <div class="svw-card__head dh-violet"><span class="svw-card__ico">${icon('student','sm')}</span> Personal Information</div>
          ${infoRow('Father / Guardian',t.fatherName)}
          ${infoRow('Occupation / Course',t.occupation)}
          ${infoRow('CNIC / ID',cnicHtml(t.cnic),null,true)}
          ${infoRow('Nationality',t.nationality)}
          ${infoRow('Phone Number',t.phone,icon('phone','xs'))}
          ${infoRow('Email Address',t.email,icon('mail','xs'))}
          ${infoRow('Emergency Contact',t.emergencyContact,icon('phone','xs'))}
        </div>
        <div class="svw-card">
          <div class="svw-card__head dh-blue"><span class="svw-card__ico">${icon('home','sm')}</span> Room &amp; Accommodation</div>
          ${room?[
            infoRow('Room Number','#'+room.number),
            infoRow('Room Type',rtype?.name),
            infoRow('Floor',room.floor),
            infoRow('Capacity',rtype?.capacity?rtype.capacity+' bed'+(rtype.capacity===1?'':'s'):''),
            infoRow('Amenities',(room.amenities||[]).join(', ')),
            infoRow('Room Notes',room.notes)
          ].join('') : '<div class="svw-none">No room assigned</div>'}
        </div>
      </div>

      ${t.notes?`<div class="svw-note">
        <span class="svw-note__ico">${icon('fileText','sm')}</span>
        <div><div class="svw-note__k">Notes</div><div class="svw-note__v">${escHtml(t.notes)}</div></div>
      </div>`:''}

      <!-- PAYMENT HISTORY TABLE -->
      <div class="svw-card svw-card--flush">
        <div class="svw-card__head dh-blue svw-card__head--bar">
          <span class="svw-card__ico">${icon('card','sm')}</span>
          <span>Full Payment History (${payHistory.length} record${payHistory.length===1?'':'s'})</span>
          <span class="svw-card__meta">Total paid: <b>${fmtPKR(totalPaid)}</b>${totalDue>0?` · <b class="is-due">Due ${fmtPKR(totalDue)}</b>`:''}</span>
        </div>
        ${payHistory.length?(()=>{
          const rows=payHistory.map(p=>{
            // The monthly CHARGE. Reading `monthlyRent` alone hid the mess half
            // — see paymentCharges() in utils.js.
            const _ch=paymentCharges(p,t);
            const mRent=_ch.monthly;
            const admFee=Number(p.admissionFee||p.fee||0);
            const extras=p.extraCharges||[];
            const conc=Number(p.concession||p.discount||0);
            const due=calculateOutstanding(p);
            let paidCell='<span class="svw-paid">'+fmtPKR(p.amount)+'</span>';
            if(admFee>0) paidCell+='<span class="svw-sub is-adm">+'+fmtPKR(admFee)+' admission</span>';
            extras.forEach(c=>{paidCell+='<span class="svw-sub is-extra">+'+fmtPKR(c.amount)+' '+escHtml(c.label||'')+'</span>';});
            if(conc>0) paidCell+='<span class="svw-sub is-conc">−'+fmtPKR(conc)+' concession</span>';
            return '<tr>'
            +'<td class="svw-t__month">'+escHtml(p.month||'—')+'</td>'
            +'<td class="svw-t__num">'+(mRent>0?fmtPKR(mRent):'<span class="is-empty">—</span>')+(_ch.messIncluded?'<span class="svw-sub">Rent + Mess</span>':_ch.hasMess?'<span class="svw-sub">Rent only</span>':'')+'</td>'
            +'<td class="svw-t__conc">'+(conc>0?'−'+fmtPKR(conc):'<span class="is-empty">—</span>')+'</td>'
            +'<td>'+paidCell+'</td>'
            +'<td class="svw-t__unpaid'+(due>0?' is-due':'')+'">'+(due>0?fmtPKR(due):'<span class="is-empty">—</span>')+'</td>'
            +'<td>'+pmBadge(p.method)+'</td>'
            +'<td>'+statusBadge(p.status)+'</td>'
            +'<td class="svw-t__date">'+(fmtDate(p.date)||'—')+'</td>'
            +'<td><div class="svw-t__acts">'
            +(p.status!=='Paid'?`<button class="svw-ia is-ok" onclick="markPaymentPaidFromStudentView('${p.id}','${id}')" title="Mark Paid">${icon('checkmark','xs')}</button>`:'')
            +`<button class="svw-ia" onclick="printReceiptFromStudentView('${p.id}','${id}')" title="Print Receipt">${icon('receipt','xs')}</button>`
            +`<button class="svw-ia" onclick="editPaymentFromStudentView('${p.id}','${id}')" title="Edit Payment">${icon('edit','xs')}</button>`
            +`<button class="svw-ia is-danger" onclick="deletePaymentFromStudentView('${p.id}','${id}')" title="Delete">${icon('trash','xs')}</button>`
            +'</div></td></tr>';
          }).join('');
          return `<div class="svw-tw"><table class="svw-t">
            <thead><tr>
              <th>Month</th><th>Monthly Charge</th><th>Concession</th><th>Paid (+Extras)</th>
              <th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th><th>Actions</th>
            </tr></thead>
            <tbody>${rows}</tbody></table></div>
            <div class="svw-tfoot">Showing ${payHistory.length} of ${payHistory.length} record${payHistory.length===1?'':'s'}</div>`;
        })():
        '<div class="svw-none">No payment records yet</div>'}
      </div>

      <!-- ROOM SHIFT HISTORY -->
      ${(()=>{
        const shifts = (DB.roomShifts||[]).filter(s=>s.studentId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
        if(!shifts.length) return '';
        return `<div class="svw-card svw-card--flush">
          <div class="svw-card__head dh-amber svw-card__head--bar">
            <span class="svw-card__ico">${icon('transfer','sm')}</span>
            <span>Room Shift History (${shifts.length})</span>
          </div>
          <div class="svw-tw"><table class="svw-t">
          <thead><tr><th>Date</th><th>From Room</th><th>To Room</th><th>Old Rent</th><th>New Rent</th><th>Reason</th></tr></thead>
          <tbody>${shifts.map(s=>`<tr>
            <td class="svw-t__date">${fmtDate(s.date)}</td>
            ${''/* Both rooms carry their floor (owner, 2026-09-10) — a shift
                   between two rooms numbered 3 is otherwise a row that says
                   nothing moved. The floor is looked up by number; a room does
                   not change floors. */}
            <td><span class="badge badge-gray">Rm ${escHtml(roomText(s.fromRoomNumber,
                  ((DB.rooms||[]).find(r=>String(r.number)===String(s.fromRoomNumber))||{}).floor))}</span></td>
            <td><span class="badge badge-blue">Rm ${escHtml(roomText(s.toRoomNumber,
                  ((DB.rooms||[]).find(r=>String(r.number)===String(s.toRoomNumber))||{}).floor))}</span></td>
            <td class="svw-t__num is-muted">${fmtPKR(s.oldRent)}</td>
            <td class="svw-t__num">${fmtPKR(s.newRent)}</td>
            <td class="svw-t__reason">${escHtml(s.reason||'—')}</td>
          </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
      })()}
    </div>
  `,`
    <button class="btn btn-secondary" onclick="printStudentCard('${id}')">${icon('print','sm')} Print</button>
    <button class="btn btn-secondary" onclick="closeModal();showRoomShiftModal('${id}')">${icon('transfer','sm')} Shift Room</button>
    <button class="btn btn-secondary" onclick="closeModal();showEditStudentModal('${id}')">${icon('edit','sm')} Edit</button>
    ${t.status==='Active'?`<button class="btn btn-danger" onclick="closeModal();showAddCancellationModal('${id}')">${icon('error','sm')} Cancel Seat</button>`:''}
    <button class="btn btn-primary" onclick="closeModal()">Close</button>
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// ADD STUDENT — PHOTO HELPERS
// ════════════════════════════════════════════════════════════════════════════
function triggerStudentPhotoUpload() {
  const el = document.getElementById('add-student-photo-file');
  if(el) el.click();
}
function loadAddStudentPhoto(input) {
  const file = input.files[0]; if(!file) return;
  if(file.size > 5*1024*1024){ toast('Photo too large (max 5MB)','error'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    const prev = document.getElementById('add-student-photo-preview');
    const data = document.getElementById('add-student-photo-data');
    if(prev) prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
    if(data) data.value = e.target.result;
    const clr = document.getElementById('add-student-clear-btn'); if(clr) clr.style.display='';
    toast('Photo loaded','success');
  };
  reader.readAsDataURL(file);
}
function clearAddStudentPhoto() {
  const prev = document.getElementById('add-student-photo-preview');
  if(prev) prev.innerHTML = asfPhotoPlaceholder();
  const data = document.getElementById('add-student-photo-data'); if(data) data.value='';
  const clr = document.getElementById('add-student-clear-btn'); if(clr) clr.style.display='none';
}
function openAddStudentCamera() {
  const box = document.getElementById('add-student-cam-box'); if(!box) return;
  if(!navigator.mediaDevices?.getUserMedia){ toast('Camera not supported on this device','error'); return; }
  // Stop any existing stream first
  const existVid = document.getElementById('add-student-cam-video');
  if(existVid?.srcObject){ existVid.srcObject.getTracks().forEach(t=>t.stop()); existVid.srcObject=null; }
  box.style.display = 'block';

  // FIX BUG-3: Check permission state first for a clear error message
  const _startCam = () => {
    navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}})
      .then(stream=>{
        const vid = document.getElementById('add-student-cam-video');
        if(!vid){ stream.getTracks().forEach(t=>t.stop()); return; }
        vid.srcObject = stream;
        vid._stream = stream;
        vid.oncanplay = () => { if(vid.paused) vid.play().catch(()=>{}); };
        if(vid.readyState >= 3) vid.play().catch(()=>{});
      })
      .catch(e=>{
        box.style.display='none';
        var msg;
        if(e.name==='NotAllowedError'||e.name==='PermissionDeniedError')
          msg='Camera blocked. Windows Settings → Privacy & Security → Camera → turn on "Let desktop apps access your camera" (bottom of the page), then restart.';
        else if(e.name==='NotFoundError'||e.name==='DevicesNotFoundError')
          msg='📷 No camera found. Please connect a camera and try again.';
        else if(e.name==='NotReadableError'||e.name==='TrackStartError')
          msg='📷 Camera is in use by another app. Close other apps using the camera and retry.';
        else
          msg='📷 Camera error: '+(e.message||'Unknown error. Check camera connection.');
        toast(msg,'error');
      });
  };

  if(navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({name:'camera'}).then(function(ps){
      if(ps.state==='denied'){
        box.style.display='none';
        _showCameraPermBanner();
        return;
      }
      _startCam();
    }).catch(_startCam); // permissions API not fully supported — just try
  } else {
    _startCam();
  }
}
function captureAddStudentPhoto() {
  const vid = document.getElementById('add-student-cam-video');
  const cvs = document.getElementById('add-student-cam-canvas');
  if(!vid||!cvs) return;
  if(!vid.srcObject || !vid.videoWidth) {
    toast('Camera not ready yet — please wait a moment','error'); // use 'error' not 'warning'
    return;
  }
  cvs.width=vid.videoWidth; cvs.height=vid.videoHeight;
  cvs.getContext('2d').drawImage(vid,0,0);
  const dataUrl = cvs.toDataURL('image/jpeg',0.85);
  const prev = document.getElementById('add-student-photo-preview');
  if(prev) prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
  const d = document.getElementById('add-student-photo-data'); if(d) d.value=dataUrl;
  const clr = document.getElementById('add-student-clear-btn'); if(clr) clr.style.display='';
  closeAddStudentCamera();
  toast('Photo captured!','success');
}
function closeAddStudentCamera() {
  const vid = document.getElementById('add-student-cam-video');
  if(vid?.srcObject) vid.srcObject.getTracks().forEach(t=>t.stop());
  const box = document.getElementById('add-student-cam-box'); if(box) box.style.display='none';
}

// EDIT STUDENT PHOTO HELPERS
function loadEditStudentPhoto(input) {
  const file = input.files[0]; if(!file) return;
  if(file.size > 5*1024*1024){ toast('Photo too large (max 5MB)','error'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    const prev = document.getElementById('edit-student-photo-preview');
    const data = document.getElementById('edit-student-photo-data');
    if(prev) prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
    if(data) data.value = e.target.result;
    const clr = document.getElementById('edit-student-clear-btn'); if(clr) clr.style.display='';
    toast('Photo loaded','success');
  };
  reader.readAsDataURL(file);
}
function clearEditStudentPhoto() {
  const prev = document.getElementById('edit-student-photo-preview');
  if(prev) prev.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
  const data = document.getElementById('edit-student-photo-data'); if(data) data.value='';
  const clr = document.getElementById('edit-student-clear-btn'); if(clr) clr.style.display='none';
}
function openEditStudentCamera() {
  const box = document.getElementById('edit-student-cam-box'); if(!box) return;
  if(!navigator.mediaDevices?.getUserMedia){ toast('Camera not supported on this device','error'); return; }
  const existVid = document.getElementById('edit-student-cam-video');
  if(existVid?.srcObject){ existVid.srcObject.getTracks().forEach(t=>t.stop()); existVid.srcObject=null; }
  box.style.display = 'block';

  // FIX BUG-3: Check permission state first
  const _startCam = () => {
    navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}})
      .then(stream=>{
        const vid = document.getElementById('edit-student-cam-video');
        if(!vid){ stream.getTracks().forEach(t=>t.stop()); return; }
        vid.srcObject = stream;
        vid._stream = stream;
        vid.oncanplay = () => { if(vid.paused) vid.play().catch(()=>{}); };
        if(vid.readyState >= 3) vid.play().catch(()=>{});
      })
      .catch(e=>{
        box.style.display='none';
        var msg;
        if(e.name==='NotAllowedError'||e.name==='PermissionDeniedError')
          msg='Camera blocked. Windows Settings → Privacy & Security → Camera → turn on "Let desktop apps access your camera" (bottom of the page), then restart.';
        else if(e.name==='NotFoundError'||e.name==='DevicesNotFoundError')
          msg='📷 No camera found. Please connect a camera and try again.';
        else if(e.name==='NotReadableError'||e.name==='TrackStartError')
          msg='📷 Camera is in use by another app. Close other apps using the camera and retry.';
        else
          msg='📷 Camera error: '+(e.message||'Unknown error. Check camera connection.');
        toast(msg,'error');
      });
  };

  if(navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({name:'camera'}).then(function(ps){
      if(ps.state==='denied'){
        box.style.display='none';
        _showCameraPermBanner();
        return;
      }
      _startCam();
    }).catch(_startCam);
  } else {
    _startCam();
  }
}
function captureEditStudentPhoto() {
  const vid = document.getElementById('edit-student-cam-video');
  const cvs = document.getElementById('edit-student-cam-canvas');
  if(!vid||!cvs) return;
  if(!vid.srcObject || !vid.videoWidth) {
    toast('Camera not ready yet — please wait a moment','error'); // use 'error' not 'warning'
    return;
  }
  cvs.width=vid.videoWidth; cvs.height=vid.videoHeight;
  cvs.getContext('2d').drawImage(vid,0,0);
  const dataUrl = cvs.toDataURL('image/jpeg',0.85);
  const prev = document.getElementById('edit-student-photo-preview');
  if(prev) prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
  const d = document.getElementById('edit-student-photo-data'); if(d) d.value=dataUrl;
  const clr = document.getElementById('edit-student-clear-btn'); if(clr) clr.style.display='';
  closeEditStudentCamera();
  toast('Photo captured!','success');
}
function closeEditStudentCamera() {
  const vid = document.getElementById('edit-student-cam-video');
  if(vid?.srcObject) vid.srcObject.getTracks().forEach(t=>t.stop());
  const box = document.getElementById('edit-student-cam-box'); if(box) box.style.display='none';
}

/* quickCancelStudent() was here. It wrote a Pending cancellation the moment
   the button was pressed — hardcoded reason, invented vacate date, no form and
   no seq — and both of its callers now open showAddCancellationModal() with the
   student preselected instead. Deleted rather than left unused: a second way to
   write a cancellation is a second shape of cancellation record, and this one
   was already producing rows the CAN-#### numbering could not see.
   See the note above showAddCancellationModal() in cancellations.js.        */

/* The printed resident record. Owner reference: `student profile.png` (26 Aug).

   This is the document a warden hands to a parent, files, or takes to the bank,
   so it is laid out as a form rather than as a screen: a hero that identifies
   the resident and states what they pay, four figures that answer the questions
   asked about a resident, two panels of facts, and the full payment history.

   Two things it states that the old card did not, and both were the reported
   bug rather than decoration:

     · MONTHLY CHARGE, not monthly rent. resolveCharges() gives rent and mess
       separately and the old card printed the rent alone, so a resident on
       8,000 + 6,500 received a document saying 8,000 above a payment history
       full of 14,500s.
     · What the charge COVERS, in words. "Rent + mess" and "rent only, mess not
       included" are different agreements with a family, and a printed record
       that does not say which is not a record of the agreement. */
/* THE STUDENT PROFILE (warden ledger spec §3.7, §3.8, step 11).
   One page, the same format whenever it is printed: who, which room, which
   plan, and where the balance stands. The month-by-month table moved to
   printPaymentHistory() — it was what pushed this sheet onto a second page —
   and so did the signature line: signatures belong to the admission form.

   `opts.admission` makes this the front of the Full Admission Form:
   { reprint, version, label } adds the Rules & Undertaking back side
   (_stuUndPage) and, on a reprint, the REPRINT watermark on both pages. */
function printStudentCard(id, opts) {
  const t = DB.students.find(x => x.id === id); if (!t) return;
  // No placeholder name on paper (hostel-name.js): ask once, then print.
  if (typeof hostelNameGate === 'function' && hostelNameGate(() => printStudentCard(id, opts))) return;
  const _adm  = opts && opts.admission ? opts.admission : null;
  const room  = DB.rooms.find(r => r.id === t.roomId);
  const rtype = room ? DB.settings.roomTypes.find(x => x.id === room.typeId) : null;
  const ch    = resolveCharges(t);

  /* The balance summary. Paid is what the records hold (money() on `amount`,
     which is net of reversals), across live and archived months; pending is
     calculateOutstanding() — finance.js is the one answer to what is owed.
     The last payment is the ledger's own latest collection line. */
  const _recs     = [].concat(DB.payments || [], DB.archive || []).filter(p => p && p.studentId === id);
  const totalPaid = _recs.reduce((s, p) => s + money(p.amount), 0);
  const totalDue  = (DB.payments || []).filter(p => p.studentId === id).reduce((s, p) => s + calculateOutstanding(p), 0);
  const _lastPay  = (typeof ledgerEntriesFor === 'function' ? ledgerEntriesFor(id) : [])
                      .filter(e => e.type === 'payment').pop() || null;
  const lastPayDate = _lastPay ? fmtDate(String(_lastPay.createdAt || '').slice(0, 10)) : '';
  const lastPayMeta = _lastPay ? fmtPKR(money(_lastPay.amount))
                      + (_lastPay.createdByName ? ' · ' + ledgerFirstName(_lastPay.createdByName) : '') : '';
  const _by = (typeof CUR_USER !== 'undefined' && CUR_USER && (CUR_USER.name || CUR_USER.username)) || '';

  const hostel = DB.settings.hostelName || 'Hostel';
  const fact = (k, v) => `<div class="fact"><span class="fact__k">${escHtml(k)}</span>` +
    `<span class="fact__v${(v === null || v === undefined || v === '') ? ' is-empty' : ''}">` +
    `${(v === null || v === undefined || v === '') ? '—' : escHtml(String(v))}</span></div>`;

  // The plan's name, not the split (owner, 2026-09-14): "Rent + Mess".
  const _cov = chargeCoverage({ rent: ch.rent, mess: ch.mess,
                                messIncluded: ch.messOptIn && ch.mess > 0, hasMess: ch.mess > 0 });
  const coverage = _cov.key === 'rent' ? 'Rent only · mess not included' : _cov.label;

  const _cardHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${_adm ? 'Admission Form' : 'Student Profile'} — ${escHtml(t.name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    /* Sized to fill a portrait sheet of the hostel's paper (owner, 2026-09-15). */
    body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;padding:22px;font-size:14px}
    .doc-head{display:flex;align-items:center;justify-content:space-between;
              padding-bottom:14px;border-bottom:3px solid #2563eb;margin-bottom:18px}
    .doc-head__t{font-size:24px;font-weight:800;color:#1e3a8a}
    .doc-head__s{font-size:13px;color:#374151;margin-top:2px}
    .doc-head__d{font-size:13px;color:#374151}

    .hero{display:flex;align-items:center;gap:18px;background:#eff6ff;border:1px solid #888888;
          border-radius:14px;padding:18px 20px;margin-bottom:14px}
    .hero__av{width:90px;height:90px;border-radius:50%;flex-shrink:0;overflow:hidden;
              background:#fff;border:3px solid #bfdbfe;display:flex;align-items:center;justify-content:center;color:#60a5fa}
    .hero__av img{width:100%;height:100%;object-fit:cover}
    .hero__id{flex:1;min-width:0}
    .hero__name{font-size:30px;font-weight:800;letter-spacing:-.02em;color:#1e3a8a}
    .hero__no{font-size:13.5px;color:#374151;margin-top:1px}
    .chips{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap}
    .chip{padding:4px 12px;border-radius:999px;font-size:12.5px;font-weight:700;border:1px solid}
    .chip--ok{background:#dcfce7;color:#166534;border-color:#bbf7d0}
    .chip--room{background:#dbeafe;color:#1e3a8a;border-color:#1d4ed8}
    .chip--plain{background:#fff;color:#334155;border-color:#888888}
    /* The charge panel. The figure a family asks about goes in the one block
       of solid colour on the page. */
    .rent{background:#1d4ed8;color:#fff;border-radius:12px;padding:16px 22px;text-align:center;min-width:230px}
    .rent__l{font-size:12px;text-transform:uppercase;letter-spacing:1.2px;opacity:.85}
    .rent__v{font-size:31px;font-weight:900;margin:5px 0;letter-spacing:-.02em}
    .rent__s{font-size:12px;opacity:.9;border-top:1px solid rgba(255,255,255,.28);padding-top:7px}

    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:14px}
    .stat{border:1px solid #888888;border-radius:12px;padding:13px 15px}
    .stat__l{font-size:11px;text-transform:uppercase;letter-spacing:.9px;color:#4b5563;font-weight:700}
    .stat__v{font-size:22px;font-weight:800;margin-top:4px}
    .is-paid{color:#05603a}.is-due{color:#9f1c12}

    .panels{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
    .panel{border:1px solid #888888;border-radius:12px;padding:16px 18px}
    .panel__t{font-size:14.5px;font-weight:800;color:#1d4ed8;padding-bottom:8px;
              border-bottom:2px solid #1d4ed8;margin-bottom:10px}
    .fact{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid #888888}
    .fact:last-child{border-bottom:none}
    .fact__k{font-size:13px;color:#374151}
    .fact__v{font-size:13px;font-weight:700;text-align:right}
    .fact__v.is-empty{color:#4b5563;font-weight:500}

    .stat__s{font-size:12px;color:#374151;margin-top:2px}

    /* The hostel is the masthead; HOSTYLLO is this one small line (design spec Part 8). */
    .foot{margin-top:18px;padding-top:10px;border-top:1px solid #888888;
          display:flex;justify-content:space-between;gap:12px;font-size:11.5px;color:#4b5563}

    /* The back side of the admission form (_stuUndPage). */
    .und{page-break-before:always}
    .und__rules{margin:4px 0 16px 22px;font-size:14px;line-height:1.65}
    .und__rules li{padding-left:4px;margin-bottom:3px}
    .und__decl{border:1px solid #888888;border-radius:10px;padding:14px 16px;font-size:13.5px;line-height:1.6}
    .und__h{font-size:12px;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
    .und__sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:22px}
    .und__sig{padding-top:46px;font-size:13px;color:#475569}
    .und__line{border-top:1.5px solid #334155;margin-bottom:6px}
    .und__sig b{display:block;color:#1e293b}
    .und__date{margin-top:22px;font-size:13px;color:#475569}

    /* A reprint says so across every page — never confused with the filed original. */
    .wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5}
    .wm span{transform:rotate(-32deg);font-size:44px;font-weight:800;letter-spacing:.04em;white-space:nowrap;
             color:rgba(220,38,38,.18);border:4px solid rgba(220,38,38,.18);border-radius:12px;padding:10px 22px}
    @media print{body{padding:14px} .panel,.stat{page-break-inside:avoid}}
  </style></head><body>
  ${_adm && _adm.reprint ? `<div class="wm"><span>${escHtml(_adm.label)}</span></div>` : ''}

  <div class="doc-head">
    <div><div class="doc-head__t">${escHtml(hostel)}</div>
         <div class="doc-head__s">${DB.settings.location ? escHtml(DB.settings.location) + ' · ' : ''}Student Profile</div></div>
    <div class="doc-head__d">${escHtml(fmtDate(today()))}</div>
  </div>

  <div class="hero">
    <div class="hero__av">${t.docs && t.docs.photo
      ? `<img src="${escHtml(t.docs.photo)}" alt="">`
      : `<svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`}</div>
    <div class="hero__id">
      <div class="hero__name">${escHtml(t.name)}</div>
      <div class="hero__no">#${escHtml(String(t.id))}</div>
      <div class="chips">
        <span class="chip ${t.status === 'Active' ? 'chip--ok' : 'chip--plain'}">${escHtml(t.status || 'Active')}</span>
        ${room ? `<span class="chip chip--room">Room ${escHtml(roomText(room))} · ${escHtml(rtype ? rtype.name : '')}</span>` : ''}
        ${t.paymentMethod ? `<span class="chip chip--plain">${escHtml(t.paymentMethod)}</span>` : ''}
      </div>
    </div>
    <div class="rent">
      <div class="rent__l">Monthly Charge</div>
      <div class="rent__v">${ch.configured ? fmtPKR(ch.total) : '—'}</div>
      <div class="rent__s">${escHtml(coverage)}</div>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat__l">Total Paid</div><div class="stat__v is-paid">${fmtPKR(totalPaid)}</div></div>
    <div class="stat"><div class="stat__l">Pending Balance</div><div class="stat__v ${totalDue > 0 ? 'is-due' : 'is-paid'}">${fmtPKR(totalDue)}</div></div>
    <div class="stat"><div class="stat__l">Last Payment</div><div class="stat__v" style="font-size:15px">${lastPayDate ? escHtml(lastPayDate) : '—'}</div>${
      lastPayMeta ? `<div class="stat__s">${escHtml(lastPayMeta)}</div>` : ''}</div>
    <div class="stat"><div class="stat__l">Join Date</div><div class="stat__v" style="font-size:15px">${escHtml(fmtDate(t.joinDate))}</div></div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="panel__t">Personal Information</div>
      ${fact('Father / Guardian', t.fatherName)}
      ${fact('Occupation / Course', t.occupation || t.course)}
      ${''/* THE WHOLE NUMBER (owner, 2026-09-14: "show full cnic in student
              profile print"). This sheet is the student's own record, printed
              on purpose for the file — the one printed surface where the
              identity number is the point. Registers and exports stay masked. */}
      ${fact('CNIC / ID', t.cnic)}
      ${fact('Nationality', t.nationality)}
      ${fact('Phone Number', t.phone)}
      ${fact('Email Address', t.email)}
      ${fact('Emergency Contact', t.emergencyPhone || t.emergencyContact)}
      ${fact('Home Address', t.address)}
    </div>
    <div class="panel">
      <div class="panel__t">Room &amp; Accommodation</div>
      ${fact('Room Number', room ? '#' + room.number : '')}
      ${fact('Room Type', rtype ? rtype.name : '')}
      ${fact('Floor', room ? room.floor : '')}
      ${fact('Capacity', rtype ? rtype.capacity + ' bed' + (rtype.capacity === 1 ? '' : 's') : '')}
      ${fact('Monthly Charge', ch.configured ? fmtPKR(ch.total) + ' · ' + _cov.label : '')}
      ${fact('Amenities', (room && (room.amenities || []).join(', ')) || '')}
      ${fact('Room Notes', room ? room.notes : '')}
    </div>
  </div>

  <div class="foot">
    <span>Printed ${escHtml(new Date().toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}${_by ? ' by ' + escHtml(_by) : ''}</span>
    <span>HOSTYLLO Offline</span>
  </div>
  ${_adm ? _stuUndPage(t, _adm) : ''}
  </body></html>`;

  const _cardName = printFileName((_adm ? 'Admission-Form-' : 'Student-Profile-') +
    (t.name || 'Record').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, ''), '');
  _electronPDF(_cardHtml, _cardName, { pageSize: paperSize() });
}

/* The back side of the admission form (spec §3.8): the rules of the version
   being printed, the declaration and three signature lines. The names under
   the lines are what is on file; on a reprint the warden line names whoever
   printed the original, because that is who signed it. */
function _stuUndPage(t, adm) {
  const ver = adm.version || undCurrent();
  const hostel = DB.settings.hostelName || 'Hostel';
  const warden = adm.reprint
    ? (t.firstSignedByName || '')
    : ((typeof CUR_USER !== 'undefined' && CUR_USER && (CUR_USER.name || CUR_USER.username)) || '');
  const sig = (role, name) => `<div class="und__sig"><div class="und__line"></div><b>${escHtml(role)}</b><span>${escHtml(name || '')}</span></div>`;
  return `
  <section class="und">
    <div class="doc-head">
      <div><div class="doc-head__t">${escHtml(hostel)}</div>
           <div class="doc-head__s">Rules &amp; Undertaking · Version ${escHtml(String(ver.v))}</div></div>
      <div class="doc-head__d">${escHtml(t.name || '')} · #${escHtml(String(t.id))}</div>
    </div>
    <ol class="und__rules">${undRuleLines(ver.rules).map(l => `<li>${escHtml(l)}</li>`).join('')}</ol>
    <div class="und__decl"><div class="und__h">Declaration</div>${escHtml(ver.declaration).replace(/\n/g, '<br>')}</div>
    <div class="und__sigs">
      ${sig('Student', t.name)}${sig('Guardian', t.fatherName)}${sig('Warden / Admin', warden)}
    </div>
    <div class="und__date">${adm.reprint
      ? 'Originally signed ' + escHtml(fmtDate(t.firstSignedAt))
      : 'Date: ________________________'}</div>
  </section>`;
}

/* PRINT FULL ADMISSION FORM (spec §3.8, step 11). The first print is the
   original: it asks first, then freezes today and the current rules version on
   the student (undSignOriginal). Every later print is a reprint of the version
   that was signed, watermarked, and asks nothing. */
function printAdmissionForm(id) {
  const t = DB.students.find(x => x.id === id);
  if (!t) return;
  // Asked before anything is recorded as the original (hostel-name.js).
  if (typeof hostelNameGate === 'function' && hostelNameGate(() => printAdmissionForm(id))) return;
  if (undSigned(t)) {
    const ver = undSignedVersion(t) || undCurrent();
    printStudentCard(id, { admission: { reprint: true, version: ver, label: undReprintLabel(t) } });
    return;
  }
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  if (undIsStarter()) {
    toast('An administrator must review and save the rules in Settings → Rules & Undertaking first.', 'error', 'Rules not saved yet');
    return;
  }
  const cur = undCurrent();
  showConfirm('Print the original admission form?',
    `This prints the <b>original</b> admission form for ${escHtml(t.name || '')}. Today (${escHtml(fmtDate(today()))}) and rules version ${escHtml(String(cur.v))} will be recorded as the signing. Every later print will be marked <b>REPRINT</b>.`,
    async () => {
      const s = DB.students.find(x => x.id === id);
      const r = undSignOriginal(s);
      if (!r.ok) {
        if (r.reason === 'already') { printAdmissionForm(id); return; }
        toast(r.reason, 'error'); return;
      }
      logActivity('Admission Form Printed', (s.name || s.id) + ' — original, rules version ' + r.version, 'Student');
      await saveDB();
      printStudentCard(id, { admission: { reprint: false, version: undVersion(r.version) } });
      if (typeof refreshStudentView === 'function') refreshStudentView(id);
    });
}

/* PRINT PAYMENT HISTORY (spec §3.7, step 11). Every student_ledger entry,
   oldest first, as its own document — headings repeat on every page, and it
   runs to as many pages as the history has. Tags are the receipt's. */
function printPaymentHistory(id) {
  const t = DB.students.find(x => x.id === id);
  if (!t) return;
  if (typeof hostelNameGate === 'function' && hostelNameGate(() => printPaymentHistory(id))) return;
  const entries = typeof ledgerEntriesFor === 'function' ? ledgerEntriesFor(id) : [];
  if (!entries.length) { toast('No ledger entries for this student yet', 'info'); return; }

  const hostel = DB.settings.hostelName || 'Hostel';
  const by = (typeof CUR_USER !== 'undefined' && CUR_USER && (CUR_USER.name || CUR_USER.username)) || '';
  let charged = 0, less = 0;
  const rows = entries.map(e => {
    const hl  = ledgerHistoryLine(e);
    const eff = ledgerEffect(e);
    if (eff > 0) charged += eff; else less += -eff;
    const what = e.type === 'payment'
      ? 'Payment' + (e.method ? ' · ' + e.method : '')
      : (hl.tag || e.type || '');
    return `<tr>
      <td>${escHtml(fmtDate(String(e.createdAt || '').slice(0, 10)))}</td>
      <td>${escHtml(e.month ? monthLabel(e.month) : '—')}</td>
      <td><b>${escHtml(what)}</b>${e.reason ? `<span class="sub">${escHtml(e.reason)}</span>` : ''}</td>
      <td>${escHtml(ledgerFirstName(e.createdByName) || '—')}</td>
      <td class="n">${eff > 0 ? fmtNum(eff) : ''}</td>
      <td class="n">${eff < 0 ? fmtNum(-eff) : ''}</td>
      <td class="n"><b>${money(e.runningBalance) < 0 ? '−' : ''}${fmtNum(Math.abs(money(e.runningBalance)))}</b></td>
    </tr>`;
  }).join('');
  const closing = money(entries[entries.length - 1].runningBalance);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Payment History — ${escHtml(t.name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;padding:22px;font-size:14px}
    .doc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;
              padding-bottom:12px;border-bottom:3px solid #2563eb;margin-bottom:14px}
    .doc-head__t{font-size:24px;font-weight:800;color:#1e3a8a}
    .doc-head__s{font-size:13px;color:#374151;margin-top:2px}
    .doc-head__d{font-size:11px;color:#475569;text-align:right}
    table{width:100%;border-collapse:collapse}
    thead{display:table-header-group}
    /* Photocopy contrast (owner, 2026-09-15): #888 grid, grey header fill, dark labels. */
    th{background:#e5e7eb;padding:9px 11px;text-align:left;font-size:12.5px;color:#1f2937;font-weight:700;
       border:1px solid #888888}
    td{padding:8px 11px;border:1px solid #888888;vertical-align:top}
    tr{page-break-inside:avoid}
    .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .sub{display:block;font-size:11.5px;color:#374151;margin-top:1px}
    tfoot td{border-top:2px solid #555555;font-weight:700;background:#e5e7eb}
    .foot{margin-top:14px;display:flex;justify-content:space-between;font-size:11.5px;color:#4b5563}
  </style></head><body>
  <div class="doc-head">
    <div><div class="doc-head__t">${escHtml(hostel)}</div>
         <div class="doc-head__s">${DB.settings.location ? escHtml(DB.settings.location) + ' · ' : ''}Payment History</div></div>
    <div class="doc-head__d"><b>${escHtml(t.name || '')}</b><br>#${escHtml(String(t.id))} · ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}</div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Month</th><th>Entry</th><th>By</th>
      <th class="n">Charged (+)</th><th class="n">Paid / less (−)</th><th class="n">Balance</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">Totals</td><td class="n">${fmtNum(charged)}</td><td class="n">${fmtNum(less)}</td>
      <td class="n">${closing < 0 ? '−' : ''}${fmtNum(Math.abs(closing))}</td></tr></tfoot>
  </table>
  <div class="foot">
    <span>Printed ${escHtml(new Date().toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}${by ? ' by ' + escHtml(by) : ''}</span>
    <span>HOSTYLLO Offline</span>
  </div>
  </body></html>`;

  _electronPDF(html, printFileName('Payment-History-' +
    (t.name || 'Record').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, ''), ''), { pageSize: paperSize() });
}

/* The signed undertaking scan, reprinted (spec §3.8, step 11). Images only —
   the watermark goes across the scan so a copy is never taken for the filed
   original. A PDF has no reprint (the Documents row disables it). */
function stuUndReprintScan(id) {
  if (typeof hostelNameGate === 'function' && hostelNameGate(() => stuUndReprintScan(id))) return;
  const t = DB.students.find(x => x.id === id);
  const doc = undScanOf(t);
  if (!t || !doc || !doc.data) { toast('No signed undertaking is attached', 'info'); return; }
  if (!undScanIsImage(doc)) { toast('A PDF scan can be viewed or downloaded, not reprinted from the app', 'info'); return; }
  const hostel = DB.settings.hostelName || 'Hostel';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Signed undertaking (reprint) — ${escHtml(t.name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter','Segoe UI',Arial,sans-serif;background:#fff;padding:18px;color:#475569}
    .cap{display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px}
    .img{text-align:center}
    .img img{max-width:100%;max-height:1040px}
    .wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5}
    .wm span{transform:rotate(-32deg);font-size:38px;font-weight:800;letter-spacing:.04em;white-space:nowrap;
             color:rgba(220,38,38,.28);border:4px solid rgba(220,38,38,.28);border-radius:12px;padding:10px 22px}
  </style></head><body>
  <div class="wm"><span>${escHtml(undReprintLabel(t, doc))}</span></div>
  <div class="cap"><span><b>${escHtml(hostel)}</b> · Signed undertaking · ${escHtml(t.name || '')} · #${escHtml(String(t.id))}</span><span>HOSTYLLO Offline</span></div>
  <div class="img"><img src="${escHtml(doc.data)}" alt="Signed undertaking"></div>
  </body></html>`;
  _electronPDF(html, printFileName('Undertaking-Reprint-' +
    (t.name || 'Record').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, ''), ''), { pageSize: paperSize() });
}
function showEditStudentModal(id) {
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const t=DB.students.find(x=>x.id===id); if(!t) return;
  const allRooms=roomsByNumber(DB.rooms.filter(r=>r.id===t.roomId||roomFreeBeds(r)>0));
  const pmOpts = pmOptions(t.paymentMethod);
  // The student's own status is always in the list. It used to be built from
  // three fixed values, so a student on the cancellation list ('Cancelling')
  // matched none of them, the browser selected the first — Active — and merely
  // opening this form and pressing Save quietly reversed their cancellation
  // while the cancellation record itself stayed Pending.
  const _statuses = ['Active','Left','Blacklisted'];
  if (t.status && _statuses.indexOf(t.status) === -1) _statuses.unshift(t.status);
  const statOpts=_statuses.map(s=>`<option ${t.status===s?'selected':''}>${escHtml(s)}</option>`).join('');
  const curRoom=DB.rooms.find(r=>r.id===t.roomId);
  const curRt=curRoom?getRoomType(curRoom):null;
  const presetLabel=curRoom?`Room #${curRoom.number} · ${curRt?.name||''} · ${curRoom.floor||''} Floor`:'';
  const statSel = _statuses.map(s=>`<option value="${escHtml(s)}" ${t.status===s?'selected':''}>${escHtml(s)}</option>`).join('');
  /* The form modal from forms.css: 920px, capped at the viewport, only the
     body scrolling. It opened `modal-lg` — 1120 x 722 on a 768px window —
     which showed the photo block and one and a half sections, with Save below
     the fold. Not one field id below changed; submitEditStudent() reads this
     form by id and a rename here is silent data loss there. */
  showModal('modal-form', `
    <div class="hf-mh">
      <span class="hf-mh__ico">${icon('edit', 'sm')}</span>
      <span style="min-width:0">
        <span class="hf-mh__t">Edit Student — ${escHtml(t.name)}</span>
        <span class="hf-mh__s">Update student information, contact details and hostel allocation.</span>
      </span>
    </div>`, `
  <div class="sf-wrap sf-wrap--modal">

    <!-- ══ PHOTO + STUDENT ID ══════════════════════════════════════════
         A row, not a column. The page's photo block is a 140px well with a
         drop zone under it and two buttons under that — right on the Student
         intake page, where the rail has the height to spend, and 260px of a
         dialog that has 620px for the whole form. Here the well is 76px and
         the actions sit beside it, which is the shape the reference draws.

         Every id is the page's: loadEditStudentPhoto(), clearEditStudentPhoto()
         and captureEditStudentPhoto() find the preview, the hidden data field
         and the Remove button by id, and none of them care where they sit. -->
    <div class="esf-head">
      <div class="esf-photo">
        <div class="esf-photo__well" id="edit-student-photo-preview"
             onclick="document.getElementById('edit-student-photo-file').click()"
             title="Click to upload a photo"
             ondragover="event.preventDefault();this.classList.add('is-over')"
             ondragleave="this.classList.remove('is-over')"
             ondrop="event.preventDefault();this.classList.remove('is-over');var f=event.dataTransfer.files[0];if(f){var i=document.getElementById('edit-student-photo-file');i.files=event.dataTransfer.files;loadEditStudentPhoto(i);}">
          ${t.docs?.photo
            ? `<img src="${t.docs.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
            : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`}
        </div>
        <div class="esf-photo__acts">
          <div class="esf-photo__l">Student photo</div>
          <button type="button" class="sf-btn" onclick="document.getElementById('edit-student-photo-file').click()">
            ${icon('upload','sm')} Upload photo
          </button>
          <button type="button" class="sf-btn" onclick="openEditStudentCamera()">
            ${icon('eye','sm')} Take photo
          </button>
          <button type="button" class="sf-btn esf-photo__rm" id="edit-student-clear-btn"
                  style="display:${t.docs?.photo?'inline-flex':'none'}" onclick="clearEditStudentPhoto()">
            ${icon('trash','sm')} Remove
          </button>
        </div>
        <input type="file" id="edit-student-photo-file" accept="image/*" style="display:none" onchange="loadEditStudentPhoto(this)">
        <input type="hidden" id="edit-student-photo-data" value="${escHtml(t.docs?.photo||'')}">
      </div>

      <div class="sf-idcard">
        <span class="sf-idcard__note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15h4"/><circle cx="16" cy="10" r="2"/></svg>
          Existing student
        </span>
        <div class="sf-idcard__l">Student ID</div>
        <div class="sf-idcard__v">#${escHtml(String(t.id))}</div>
      </div>
    </div>

    <div id="edit-student-cam-box" class="esf-cam" style="display:none">
      <video id="edit-student-cam-video" autoplay playsinline></video>
      <canvas id="edit-student-cam-canvas" style="display:none"></canvas>
      <div class="esf-cam__acts">
        <button type="button" class="sf-btn sf-btn--go" onclick="captureEditStudentPhoto()">Capture</button>
        <button type="button" class="sf-btn" onclick="closeEditStudentCamera()">Close</button>
      </div>
    </div>

    <!-- ══ STUDENT IDENTITY ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-12 0"/><circle cx="12" cy="8" r="5"/></svg>
        <span class="asf-n">01</span> Student identity
      </div>
      <div class="sf-grid">
        <div class="sf-f"><label for="f-tname">Full name<span class="req">*</span></label>
          <input class="sf-in" id="f-tname" value="${escHtml(t.name)}" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
        <div class="sf-f"><label for="f-tfname">Father's name</label>
          <input class="sf-in" id="f-tfname" value="${escHtml(t.fatherName||'')}" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
        <div class="sf-f"><label for="f-tcnic">CNIC</label>
          <input class="sf-in" id="f-tcnic" value="${escHtml(t.cnic||'')}" placeholder="35202-1234567-1" maxlength="15" oninput="fmtCnic(this)"></div>
      </div>
      <div class="sf-grid" style="margin-top:14px;grid-template-columns:1.4fr 1fr 1fr">
        <div class="sf-f"><label for="f-tocc">Course / study field</label>
          <input class="sf-in" id="f-tocc" value="${escHtml(t.occupation||t.course||'')}" placeholder="BS Computer Science"></div>
        <div class="sf-f"><label for="f-tstat">Status</label>
          <select class="sf-sel" id="f-tstat">${statSel}</select></div>
        <div class="sf-f"><label for="f-tjoin">Join date</label>
          <input class="sf-in" id="f-tjoin" type="date" value="${escHtml(t.joinDate||'')}"></div>
      </div>
    </div>

    <!-- ══ CONTACT INFORMATION ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92"/></svg>
        <span class="asf-n">02</span> Contact information
      </div>
      <div class="sf-grid">
        <div class="sf-f"><label for="f-tphone">Phone number</label>
          <input class="sf-in" id="f-tphone" value="${escHtml(t.phone||'')}" placeholder="03XX XXXXXXX" maxlength="12" oninput="fmtPhone(this)"></div>
        <div class="sf-f"><label for="f-temerg">Emergency contact</label>
          <input class="sf-in" id="f-temerg" value="${escHtml(t.emergencyContact||'')}" placeholder="Guardian / family phone"></div>
        <div class="sf-f"><label for="f-temail">Email address</label>
          <input class="sf-in" id="f-temail" value="${escHtml(t.email||'')}" placeholder="email@gmail.com"></div>
      </div>
      <div class="sf-grid" style="margin-top:14px">
        <div class="sf-f sf-f--wide"><label for="f-taddress">Home address</label>
          <div class="sf-wrapin">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
            <input class="sf-in" id="f-taddress" value="${escHtml(t.address||'')}" placeholder="House # 25, Street 4, Peshawar, KPK"
              autocomplete="off" oninput="cityAutocomplete(this)" onblur="hideCitySuggestions()">
          </div>
          <div id="f-taddress-suggestions" class="city-suggestions"></div>
        </div>
      </div>
    </div>

    <!-- ══ HOSTEL INFORMATION ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h" style="justify-content:space-between">
        <span style="display:inline-flex;align-items:center;gap:8px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M15 9h.01"/><path d="M15 13h.01"/></svg>
          <span class="asf-n">03</span> Assign room<span class="req">*</span>
        </span>
        <span id="f-troom-selected-label" style="font-size:11px;color:var(--green);font-weight:700">${escHtml(presetLabel)}</span>
      </div>
      <div class="sf-grid">
        <div class="sf-f sf-f--wide"><label for="f-troom-search">Room</label>
          <div style="position:relative">
            <input type="hidden" id="f-troom" value="${escHtml(t.roomId||'')}">
            <input class="sf-in" id="f-troom-search" placeholder="Search room number, type or floor…" autocomplete="off"
              value="${escHtml(presetLabel)}"
              oninput="filterRoomSearch(this.value)" onfocus="filterRoomSearch(this.value)"
              onblur="setTimeout(()=>{const d=document.getElementById('room-search-drop');if(d)d.style.display='none';},180)">
            <div id="room-search-drop" class="sf-drop-list">
              ${allRooms.map(r=>{
                const rt=getRoomType(r); const occ=getRoomOccupancy(r);
                const free=roomFreeBeds(r); const vac=getRoomVacating(r);
                const isFull=free<=0;
                const lbl='Room #'+r.number+' · '+rt.name+' · '+r.floor+' Floor';
                const rc=resolveCharges({roomId:r.id});
                return '<div class="sf-drop-item room-search-item" data-id="'+r.id+'" data-rent="'+rc.rent+'"'
                  +' data-label="'+escHtml(lbl)+'"'
                  +' onmousedown="pickRoomSearch(\''+r.id+'\','+rc.rent+',\''+escHtml(lbl).replace(/'/g,"\\'")+'\')">'
                  +'<div><b>Room #'+escHtml(String(r.number))+'</b> <span>'+escHtml(rt.name)+' · '+escHtml(r.floor||'')+' Floor</span></div>'
                  +'<div style="text-align:right"><span style="color:'+(isFull?'var(--red)':vac>0||free<=1?'var(--amber)':'var(--green)')+';font-weight:700">'
                  +escHtml(roomAvailLabel(r))+'</span>'
                  +'<div style="font-size:10px;color:'+(rc.configured?'var(--text3)':'var(--red)')+';font-weight:700">'
                  +(rc.configured?fmtPKR(rc.total)+'/mo':'No rent set')+'</div></div></div>';
              }).join('')}
              ${allRooms.length===0?'<div class="sf-drop-item"><span>No rooms configured</span></div>':''}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ NOTES ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        <span class="asf-n">04</span> Notes
      </div>
      <div class="sf-grid">
        <div class="sf-f sf-f--wide">
          <textarea class="sf-ta" id="f-tnotes" rows="3" placeholder="Anything the warden should know about this student…">${escHtml(t.notes||'')}</textarea>
        </div>
      </div>
    </div>

  </div>`,
  `<button class="btn btn-danger btn-sm hf-actions__spacer" onclick="confirmDeleteStudent('${id}')">${icon('trash','sm')} Delete</button>
   <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-primary" onclick="submitEditStudent('${id}')">${icon('save','sm')} Save Changes</button>`);
}

async function submitEditStudent(id) {
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const t=DB.students.find(x=>x.id===id); if(!t) return;
  const _originalRoomId = t.roomId; // capture BEFORE any changes

  // FIX-STUDENT-UPDATE: Collect all new values FIRST before mutating anything.
  // Previously, data was mutated before the room capacity check, so a failed
  // validation left t in a corrupted in-memory state that could be saved later.
  const _newName   = document.getElementById('f-tname')?.value.trim()  || t.name;
  const _newFather = document.getElementById('f-tfname')?.value.trim() || '';
  const _newCnic   = document.getElementById('f-tcnic')?.value.trim()  || '';
  const _newPhone  = document.getElementById('f-tphone')?.value.trim() || '';
  const _newEmail  = document.getElementById('f-temail')?.value.trim() || '';
  const _newOccup  = document.getElementById('f-tocc')?.value.trim() || t.occupation || '';
  const _newRoomId = document.getElementById('f-troom')?.value || t.roomId;
  const _newJoin   = document.getElementById('f-tjoin')?.value  || t.joinDate || '';
  const _newStatus = document.getElementById('f-tstat')?.value  || t.status;
  const _newEmerg  = document.getElementById('f-temerg')?.value.trim()   || '';
  const _newAddr   = document.getElementById('f-taddress')?.value.trim() || '';
  const _newNotes  = document.getElementById('f-tnotes')?.value.trim()   || '';
  const _photoData = document.getElementById('edit-student-photo-data')?.value;

  // Capacity guard — validate BEFORE touching any data
  if (_newRoomId && _newRoomId !== _originalRoomId) {
    const newRoom = DB.rooms.find(r => r.id === _newRoomId);
    if (newRoom) {
      const newRoomType = getRoomType(newRoom);
      const othersInRoom = DB.students.filter(s => s.id !== id && s.roomId === _newRoomId && s.status === 'Active').length;
      if (newRoomType && othersInRoom >= newRoomType.capacity) {
        toast('That room is now full — please choose a different room.', 'error');
        return; // exit BEFORE any mutation — data stays clean
      }
    }
  }

  // All checks passed — now apply changes
  t.name            = _newName;
  t.fatherName      = _newFather;
  t.cnic            = _newCnic;
  t.phone           = _newPhone;
  t.email           = _newEmail;
  t.occupation      = _newOccup;
  t.joinDate        = _newJoin;
  t.status          = _newStatus;
  t.emergencyContact= _newEmerg;
  t.address         = _newAddr;
  t.notes           = _newNotes;

  t.roomId = _newRoomId;

  // Push the corrected name — and the new room, on still-open records — down
  // onto this student's payments and cancellations. Without this the dashboard
  // reads the live student while every report and PDF reads the stale snapshot
  // frozen into each payment, and the two disagree.
  if (typeof syncStudentSnapshots === 'function') syncStudentSnapshots(t);

  if(_photoData !== undefined) { if(!t.docs) t.docs={}; t.docs.photo = _photoData; }

  /* WHEN, so the drawer's footer can say it. Nothing stamped a student record
     before this, which is why the footer prints nothing at all on a record that
     has not been edited since — a "last updated" derived from anything else
     (joinDate, today) would be a fact the record does not hold. */
  t.updatedAt = new Date().toISOString();

  await saveDB(); closeModal(); renderPage('students'); toast('Student updated','success');
}
async function confirmDeleteStudent(id) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  const t=DB.students.find(x=>x.id===id); if(!t) return;
  closeModal();

  /* THE MONEY STAYS. THE PERSON GOES.

     This used to cascade: `DB.payments = DB.payments.filter(...)` deleted every
     payment the student had ever made. That rewrites months which were closed
     and reconciled — last quarter's collected total silently drops, and the
     receipts already in students' hands stop matching the books. Cash that was
     genuinely counted into the till left the accounts because somebody tidied
     up a contact record.

     A payment is a record of an event that happened. Deleting the person does
     not un-happen it. So the rows stay, and they can stay safely because each
     one already carries its own `studentName` and `roomNumber` snapshot —
     syncStudentSnapshots() and repairStudentSnapshots() both no-op when the
     student is gone, so the name on a historical receipt never blanks out.

     THE OUTSTANDING BALANCE IS LEFT ALONE TOO, DELIBERATELY.

     It is tempting to zero `unpaid` on the way out so a removed student stops
     showing as a debtor. That is the same mistake in the other direction:
     writing off a debt is a financial decision the warden makes on purpose, on
     a record, not something that happens as a side effect of deleting a row
     from a contact list. If the money is not coming, mark the record settled —
     which is a visible act, in the activity log, with a figure attached.

     What the warden loses by deleting is the STUDENT: the roster entry, the
     room assignment, the profile. That is what they asked to lose. */
  const _pays = DB.payments.filter(p => p.studentId === id);
  const _paid = _pays.reduce((s,p) => s + Number(p.amount  || 0), 0);
  const _owed = _pays.reduce((s,p) => s + calculateOutstanding(p), 0);
  const _detail = _pays.length
    ? `<div style="margin:10px 0;background:var(--bg3);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.75">`
      + `Their <strong>${_pays.length}</strong> payment record(s) <strong>stay in the books</strong> —`
      + ` <strong>${fmtPKR(_paid)}</strong> collected`
      + (_owed ? ` and <strong style="color:var(--red)">${fmtPKR(_owed)}</strong> still outstanding` : '')
      + ` — so no past month's totals change. They will be listed under`
      + ` <em>${escHtml(t.name)}</em> with the seat marked removed.</div>`
      + `<small style="color:var(--text3)">This removes the student from the roster and frees their bed.`
      + (_owed ? ` The outstanding balance is not written off — settle the record first if it is not coming.` : '')
      + `</small>`
    : 'This removes the student from the roster. They have no payment records.';

  showConfirm(`Remove ${escHtml(t.name)}?`, _detail, (async ()=>{
    // The answer was yes, so the slide-over is now showing a record that is
    // about to stop existing.
    if (typeof closeStudentPanel === 'function') closeStudentPanel();
    logActivity('Student Deleted',
      `${t.name} — roster entry removed · ${_pays.length} payment record(s) KEPT · `
      + `${fmtPKR(_paid)} collected, ${fmtPKR(_owed)} outstanding`,
      'Students');
    /* Stamp the rows before dropping the student, so every screen that lists a
       payment can say the person is no longer on the roster instead of quietly
       showing a name that resolves to nobody. */
    _pays.forEach(p => { p.studentRemoved = true; p.studentRemovedOn = today(); });
    DB.students = DB.students.filter(x => x.id !== id);
    await saveDB(); renderPage('students');
    toast(`${t.name} removed — ${_pays.length} payment record(s) kept`, 'info');
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 3: ROOM SHIFTING
// ════════════════════════════════════════════════════════════════════════════
/* ============================================================================
   MOVE STUDENT TO ANOTHER ROOM - rebuilt 2026-09-10 to `moving form.png`.

   It was a modal-md of inline styles: an emoji banner, three fields in the
   generic form-grid, and an amber warning box. The reference draws a two
   column dialog - who is being moved and where they are now on the left, the
   move itself on the right - and that split is the point of the screen: a
   warden moving a student is holding two rooms in their head, and the form
   should hold one of them for them.

   THREE THINGS THE REFERENCE ASSERTS THAT THIS APP CANNOT, and each is drawn
   as what is actually true instead of as what is drawn:

     - "Only available (empty) rooms are shown in the list." They are not, and
       they must not be - this app sells BEDS, not rooms. A 3-seater with one
       bed free is exactly where a student gets moved to, and a hostel that
       only ever moved people into wholly empty rooms could not run. The hint
       says what the list really holds.

     - "Block A" - there are no blocks in this app; a room has a FLOOR and a
       type, and both are shown.

     - "Assigned on" - no field records it, so it is DERIVED: the most recent
       shift INTO the current room, and the admission date when there has never
       been a shift. That is the day the student took this bed either way. When
       neither exists the line is left out rather than guessed at.

   Everything the old form did, it still does. The room list is the same
   free-bed filter, the capacity is re-checked at submit, the rent follows the
   destination room's rate, and submitRoomShift() is untouched - the three
   field ids below are the ones it already reads.
   ============================================================================ */
function showRoomShiftModal(studentId) {
  /* GATED (2026-09-10). "Move or shift a student" is one of the lines the
     Edit-records permission card promises, and this path asked for nothing —
     the same shape of gap as the delete bug the owner reported on 2026-09-09,
     where the card said one thing and the code checked another. */
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const t = DB.students.find(x => x.id === studentId);
  if (!t) return;
  const fromRoom = DB.rooms.find(r => r.id === t.roomId);

  // Available rooms: not the current room, and must have a free bed
  const available = DB.rooms.filter(r => {
    if (r.id === t.roomId) return false;
    return roomFreeBeds(r) > 0;
  });

  if (!available.length) {
    toast('No other rooms have available capacity right now.', 'error');
    return;
  }

  const roomOpts = available.map(r => {
    const type = getRoomType(r);
    return '<option value="' + r.id + '">#' + escHtml(String(r.number)) + ' — ' +
           escHtml(type.name) + ' · ' + escHtml(r.floor) + ' Floor (' +
           escHtml(roomAvailLabel(r)) + ')</option>';
  }).join('');

  /* The day this student took the bed they are in. DB.roomShifts is the record
     of every move, so the latest one INTO the current room is the answer; a
     student who has never been moved has been there since they were admitted. */
  const _since = (() => {
    const mine = (DB.roomShifts || [])
      .filter(x => String(x.studentId) === String(t.id) && x.toRoomId === t.roomId && x.date)
      .map(x => x.date).sort();
    return mine.length ? mine[mine.length - 1] : (t.joinDate || '');
  })();

  const fromType = fromRoom ? getRoomType(fromRoom) : null;
  const fromFree = fromRoom ? roomFreeBeds(fromRoom) : 0;

  const row = (ico, label, value) =>
    '<div class="msf-row"><span class="msf-row__i">' + icon(ico, 'sm') + '</span>' +
    '<span class="msf-row__k">' + escHtml(label) + '</span>' +
    '<span class="msf-row__v">' + value + '</span></div>';
  const dash = txt => '<span class="msf-row__dash">' + escHtml(txt) + '</span>';

  const head =
    '<div class="hf-mh"><div class="hf-mh__ico">' + icon('transfer', 'sm') + '</div>' +
    '<div><div class="hf-mh__t">Move Student to Another Room</div>' +
    '<div class="hf-mh__s">Change the student&rsquo;s room assignment</div></div></div>';

  const rail =
    '<aside class="msf-rail">' +
      '<div class="msf-rail__t">Student information</div>' +
      '<div class="msf-who">' + studentAvatar(t, 54, stuAvatarHue(String(t.name || '?'))) +
        '<div style="min-width:0">' +
          '<div class="msf-who__n">' + escHtml(t.name || '—') + '</div>' +
          '<div class="msf-who__s">' + icon('graduation', 'xs') +
            escHtml(t.occupation || 'Student') + '</div>' +
        '</div>' +
      '</div>' +
      row('card', 'Student ID', '<b>#' + escHtml(String(t.id)) + '</b>') +
      row('phone', 'Contact', t.phone ? escHtml(t.phone) : dash('Not recorded')) +
      row('bookmark', 'Program', t.occupation ? escHtml(t.occupation) : dash('Not recorded')) +
      '<div class="msf-rail__t msf-rail__t--2">Current room</div>' +
      (fromRoom
        ? '<div class="msf-cur"><span class="msf-cur__i">' + icon('bed', 'sm') + '</span>' +
          '<div style="min-width:0;flex:1">' +
            '<div class="msf-cur__n">Room #' + escHtml(String(fromRoom.number)) +
              '<span class="lk-chip ' + (fromFree > 0 ? 'dh-green' : 'dh-slate') + '">' +
              (fromFree > 0 ? escHtml(fromFree + ' bed' + (fromFree === 1 ? '' : 's') + ' free') : 'Full') +
              '</span></div>' +
            '<div class="msf-cur__s">' + escHtml(fromType ? fromType.name : '—') +
              (fromRoom.floor ? ' · ' + escHtml(fromRoom.floor) + ' Floor' : '') + '</div>' +
            (_since ? '<div class="msf-cur__d">In this room since ' + escHtml(fmtDate(_since)) + '</div>' : '') +
          '</div></div>'
        : '<div class="msf-cur msf-cur--none"><span class="msf-cur__i">' + icon('bed', 'sm') + '</span>' +
          '<div><div class="msf-cur__n">No room assigned</div>' +
          '<div class="msf-cur__s">This move is their first allotment.</div></div></div>') +
    '</aside>';

  const main =
    '<div class="msf-main">' +
      '<div class="hf-sec">' +
        '<div class="hf-sec__h"><span class="hf-sec__ico">' + icon('bed', 'sm') + '</span>' +
          '<span class="hf-sec__t">Move to new room</span>' +
          '<span class="hf-sec__s">Pick the room and the day the move takes effect</span></div>' +
        '<div class="field"><label for="shift-new-room">New room<span class="req">*</span></label>' +
          '<div class="hf-in"><span class="hf-in__i">' + icon('bed', 'sm') + '</span>' +
          '<select class="form-control" id="shift-new-room">' +
            '<option value="">— Select a room —</option>' + roomOpts +
          '</select></div>' +
          /* THE HONEST VERSION OF THE REFERENCE'S HINT, which says "only
             available (empty) rooms". That would be the wrong rule for a hostel
             that sells beds: a 3-seater with one bed free is exactly where a
             student gets moved to. */
          '<div class="hi-note">Every room with a free bed is listed — a shared room with space ' +
            'still counts. The room they are in now is not.</div>' +
        '</div>' +
        '<div class="hf-g2">' +
          '<div class="field"><label for="shift-date">Shift date<span class="req">*</span></label>' +
            '<div class="hf-in"><span class="hf-in__i">' + icon('calendar', 'sm') + '</span>' +
            '<input class="form-control cdp-trigger" id="shift-date" type="text" readonly ' +
              'onclick="showCustomDatePicker(this,event)" value="' + escHtml(today()) + '"></div></div>' +
          '<div class="field"><label for="shift-reason">Reason / notes</label>' +
            '<div class="hf-in hf-in--top"><span class="hf-in__i">' + icon('fileText', 'sm') + '</span>' +
            '<textarea class="form-control" id="shift-reason" rows="3" ' +
              'placeholder="e.g. Student requested a single room, maintenance issue…"></textarea></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="msf-next"><span class="msf-next__i">' + icon('info', 'sm') + '</span>' +
        '<div><div class="msf-next__t">What happens next</div>' +
        '<div class="msf-next__s">The room assignment changes on the shift date and the new ' +
          'room&rsquo;s rent applies from the next bill. Payments already recorded are left exactly ' +
          'as they are, and the move is written to this student&rsquo;s room history.</div></div></div>' +
    '</div>';

  showModal('modal-form', head,
    '<div class="msf">' + rail + main + '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="submitRoomShift(\'' + studentId + '\')">' +
      icon('transfer', 'sm') + 'Move student</button>');
}


async function submitRoomShift(studentId) {
  // Gated at the form AND here — the submit is reachable without the form.
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const t = DB.students.find(x => x.id === studentId);
  if (!t) return;

  const newRoomId  = document.getElementById('shift-new-room')?.value;
  const shiftDate  = document.getElementById('shift-date')?.value  || today();
  const reason     = document.getElementById('shift-reason')?.value?.trim() || '';

  if (!newRoomId) { toast('Please select a new room', 'error'); return; }
  // FIX: block shifting to the same room the student is already in
  if (newRoomId === t.roomId) { toast('Student is already assigned to this room — please select a different one.', 'error'); return; }

  const fromRoom = DB.rooms.find(r => r.id === t.roomId);
  const toRoom   = DB.rooms.find(r => r.id === newRoomId);
  if (!toRoom)   { toast('Selected room not found', 'error'); return; }

  // Rent follows the destination room's rate — the shift form no longer offers
  // a manual override. Rates are set once in Settings → Rent & Mess.
  const newRent = parseFloat(toRoom.rent) || t.rent || 0;

  // Check capacity again at submission time
  const type = getRoomType(toRoom);
  if (roomFreeBeds(toRoom) <= 0) {
    toast('That room is now full — please select a different room.', 'error');
    return;
  }

  // Record the shift in DB
  if (!DB.roomShifts) DB.roomShifts = [];
  DB.roomShifts.push({
    id: 'rs_' + uid(),
    studentId: t.id,
    studentName: t.name,
    fromRoomId: t.roomId,
    fromRoomNumber: fromRoom?.number || '?',
    toRoomId: newRoomId,
    toRoomNumber: toRoom.number,
    oldRent: t.rent,
    newRent,
    date: shiftDate,
    reason,
    byWarden: (typeof CUR_USER !== 'undefined' && CUR_USER?.name) ? CUR_USER.name : ''
  });

  // Update student record
  const oldRoomId = t.roomId;
  t.roomId = newRoomId;
  t.rent   = newRent;

  // Update all PENDING payment records for this student to reflect new room
  DB.payments.forEach(p => {
    if (p.studentId === studentId && p.status === 'Pending') {
      p.roomId     = newRoomId;
      p.roomNumber = toRoom.number;
      // A month charged by days keeps its charge through a room shift (step 9).
      if (!p.prorate) p.monthlyRent = newRent;
      // Recalculate unpaid using new rent if not yet partially paid
      if (!p.prorate && (!p.amount || p.amount === 0)) {
        p.amount  = 0;
        p.unpaid  = newRent;
      }
      ledgerTrack(p, { why: 'Room shift' });
    }
  });

  // Catch anything the Pending-only loop above missed — a partially-paid record
  // still shows this student in the room, and the same room stamp belongs on it.
  // Idempotent, and touches only name/room (never amounts), so it will not
  // disturb the rent/unpaid recalculation just applied to the open records.
  if (typeof syncStudentSnapshots === 'function') syncStudentSnapshots(t);

  logActivity(
    'Room Shift',
    `${t.name}: Room #${fromRoom?.number||'?'} → Room #${toRoom.number}` + (reason ? ` · ${reason}` : ''),
    'Students'
  );

  await saveDB();
  closeModal();
  renderPage('students');
  toast(`${t.name} shifted to Room #${toRoom.number} successfully`, 'success');
}
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ════════════════════════════════════════════════════════════════════════════
// Payments v5 adds room / month selects, a page-size picker, an "unpaid only"
// toggle and a row-selection set. `status` now also accepts 'Partial' and
// 'Overdue', which are derived states — see payStatusOf() / payIsOverdue().
// `arrears` keeps still-unpaid records from EARLIER months visible while the
// current month is on screen, so last month's balance can be collected from
// this month instead of forcing the warden to switch back to find it.
/* THE MONTH OPENS ON THIS MONTH (owner, 2026-09-10: "all pages month
   dropdowns be defaulted to the current month"). It was 'All', which did
   NOT mean the page showed every month — payFiltered() fell back to a
   this-month scope anyway — so the picker read "All Months" over a table
   that was showing one. The scope is unchanged; the control now says what
   the table is doing. Unpaid earlier months still ride along, and "All
   Months" is still the last option in the picker. */
let payFilter = {status:'All', method:'All', room:'All', month:thisMonth(), search:'',
                 showAll:false, unpaidOnly:false, arrears:true, pageSize:10,   // 10, per pay page.png (owner, 2026-09-15)
                 page:1, sortKey:'room', sortDir:'asc'};
let paySelected = new Set();
/* `arrears:true` is a default that is ON — the screen shows arrears rows
   unless a reader turns them off, and a fresh visit restores that. Same
   selection reasoning as Students. */
registerFilter('payments', payFilter, () => ({
  /* thisMonth() is called on every reset rather than captured at load, so a
     session left open past the turn of a month opens on the month it now is. */
  status:'All', method:'All', room:'All', month:thisMonth(), search:'',
  showAll:false, unpaidOnly:false, arrears:true, page:1,
  sortKey:'room', sortDir:'asc',
}), () => paySelected.clear());

// ── FORMER STUDENTS — search & restore ───────────────────────────────────────
function showFormerStudentsModal() {
  const total = DB.students.filter(s=>s.status==='Left').length;
  // FIX 9: first arg is the CSS size class — 'Former Students' was being passed as size
  showModal('modal-lg', 'Former Students',
    `<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Search by name, ID, mobile, CNIC, email, father name, occupation, location or former room.</div>
     <div style="display:flex;gap:8px;margin-bottom:14px">
       <div style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-align:center">
         <div style="font-size:18px;font-weight:900;color:var(--accent-strong)">${total}</div>
         <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Former Students</div>
       </div>
       <div style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-align:center">
         <div style="font-size:18px;font-weight:900;color:var(--green)" id="former-avail-count">${DB.rooms.filter(r=>{const t=getRoomType(r);return getRoomOccupancy(r)<(t?.capacity||1);}).length}</div>
         <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Rooms Available</div>
       </div>
     </div>
     <div style="position:relative;margin-bottom:14px">
       <div style="display:flex;align-items:center;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;overflow:hidden">
         <div style="padding:0 12px;color:var(--text3);display:flex;align-items:center">
           <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" /></svg>
         </div>
         <input id="former-search-input" type="text" placeholder="Search name, mobile, CNIC, email, father name, room, occupation…"
           autocomplete="off" style="flex:1;background:none;border:none;outline:none;color:var(--text);font-size:13px;padding:11px 0;font-family:var(--font)"
           oninput="formerStudentSearch(this.value)">
         <button onclick="document.getElementById('former-search-input').value='';formerStudentSearch('')"
           style="background:none;border:none;color:var(--text3);cursor:pointer;padding:0 12px;font-size:16px">✕</button>
       </div>
     </div>
     <div id="former-results">
       <div style="text-align:center;padding:40px 20px;color:var(--text3)">
         <div style="font-size:32px;margin-bottom:10px">🔍</div>
         <div style="font-size:13px;font-weight:600">Start typing to search former students</div>
       </div>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
  );
  setTimeout(()=>{const i=document.getElementById('former-search-input');if(i)i.focus();},100);
}

function formerStudentSearch(query) {
  const results = document.getElementById('former-results'); if (!results) return;
  const q = query.trim().toLowerCase();
  if (!q) { results.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text3)"><div style="font-size:32px;margin-bottom:10px">🔍</div><div style="font-size:13px;font-weight:600">Start typing to search</div></div>'; return; }
  const former = DB.students.filter(s=>{
    if(s.status!=='Left') return false;
    return [s.name,s.id,s.phone,s.cnic,s.email,s.fatherName,s.occupation,s.address,s.lastRoom,s.roomNumber,String(s.roomNumber||'')].some(v=>v&&String(v).toLowerCase().includes(q));
  });
  if (!former.length) { results.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text3)"><div style="font-size:32px;margin-bottom:10px">😕</div><div style="font-size:13px;font-weight:600">No former students found</div></div>'; return; }
  results.innerHTML = `<div style="font-size:11px;color:var(--text3);margin-bottom:10px">${former.length} result${former.length!==1?'s':''} found</div>`+former.map(s=>{
    const payHistory = DB.payments.filter(p=>p.studentId===s.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const totalPaid  = payHistory.filter(p=>p.status==='Paid').reduce((sum,p)=>sum+Number(p.amount||0),0);
    /* Both from the same answer. Filtering on status and summing balances
       could print "0 pending" beside a non-zero figure. */
    const pendRecs   = payHistory.filter(p=>calculateOutstanding(p)>0);
    const totalPend  = pendRecs.reduce((sum,p)=>sum+calculateOutstanding(p),0);
    const histBadge  = totalPend>0?`<span style="background:rgba(255,77,109,0.15);color:var(--red);border:1px solid rgba(255,77,109,0.3);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700">${icon('warning','sm')} ${pendRecs.length} pending · ${fmtPKR(totalPend)}</span>`:payHistory.length?`<span style="background:rgba(46,201,138,0.1);color:var(--green);border:1px solid rgba(46,201,138,0.2);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700">${icon('checkmark','xs')} All clear</span>`:`<span style="background:var(--bg4);color:var(--text3);border-radius:6px;padding:2px 8px;font-size:10px">No history</span>`;
    const recentRows = payHistory.slice(0,4).map(p=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="color:var(--text3)">${escHtml(p.month||fmtDate(p.date)||'—')}</span><span style="color:${p.status==='Paid'?'var(--green)':'var(--red)'};font-weight:700">${fmtPKR(p.amount)}</span><span style="color:${p.status==='Paid'?'var(--green)':'var(--red)'}">${p.status==='Paid'?icon('checkmark','xs'):'⏳'}</span></div>`).join('');
    return `<div id="fsr-${s.id}" style="background:var(--bg3);border:1px solid var(--border2);border-radius:12px;padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;gap:13px">
        <div style="width:44px;height:44px;border-radius:11px;background:var(--accent-dim);color:var(--accent-strong);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;flex-shrink:0">${escHtml((s.name||'?')[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:4px">${escHtml(s.name||'—')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;margin-bottom:8px">
            ${s.phone?`<div style="font-size:11px;color:var(--text3)">📞 ${escHtml(s.phone)}</div>`:''}
            ${s.cnic?`<div style="font-size:11px;color:var(--text3)">🪪 ${cnicHtml(s.cnic)}</div>`:''}
            ${s.fatherName?`<div style="font-size:11px;color:var(--text3)">👨 ${escHtml(s.fatherName)}</div>`:''}
            ${s.email?`<div style="font-size:11px;color:var(--text3)">✉️ ${escHtml(s.email)}</div>`:''}
            ${s.occupation?`<div style="font-size:11px;color:var(--text3)">💼 ${escHtml(s.occupation)}</div>`:''}
            ${(s.lastRoom||s.roomNumber)?`<div style="font-size:11px;color:var(--accent-strong);font-weight:600">🏠 Former Rm ${escHtml(roomText(s.lastRoom||s.roomNumber,
                  ((DB.rooms||[]).find(r=>String(r.number)===String(s.lastRoom||s.roomNumber))||{}).floor))}</div>`:''}
            ${s.leftDate?`<div style="font-size:11px;color:var(--red)">📅 Left: ${fmtDate(s.leftDate)}</div>`:''}
          </div>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Payment History</span>
              ${histBadge}
              ${payHistory.length?`<span style="font-size:10px;color:var(--text3)">${payHistory.length} records · Paid: <strong style="color:var(--green)">${fmtPKR(totalPaid)}</strong></span>`:''}
            </div>
            ${recentRows||`<div style="font-size:11px;color:var(--text3);text-align:center;padding:4px">No payment records</div>`}
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <button onclick="openRestoreStudentForm('${s.id}')"
          style="background:var(--green);border:none;color:#fff;border-radius:8px;padding:8px 20px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6" /> <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
          Restore Student
        </button>
      </div>
    </div>`;
  }).join('');
}

function _getAvailableRooms() {
  return DB.rooms.filter(r=>{ const t=getRoomType(r); return getRoomOccupancy(r)<(t?.capacity||1); });
}

/* ============================================================================
   RE-ADMIT A FORMER STUDENT - rebuilt 2026-09-10 to
   `re admit former student form.png`.

   It was a modal-lg of inline styles with eight emoji sub-headings and a raw
   `form-grid` under them. Every field it had, it still has, and every id below
   is the one submitRestoreStudent() already reads - this is the form's shape,
   not its behaviour.

   WHAT THE REFERENCE ADDS AND THIS KEEPS: the identity band. A warden
   re-admitting somebody is checking that this is the right person before they
   touch a single field, and the band answers it - who, their ID and CNIC, when
   they stayed last, and which room they had. `Last stay` is derived from the
   dates the record already carries (admission to departure); `Previous room`
   is `lastRoom`, which the cancellation flow stamps when it confirms.

   WHAT THE REFERENCE DRAWS AND THIS DOES NOT: a four-step wizard. This form
   posts in one go - there is no draft, no server, and nothing to resume - so
   tabs numbered 1 to 4 over a single submit would be four ways of scrolling
   one page while implying you could stop at step two and come back. The
   sections are numbered instead, which is what every other form built this
   month does (`add and edit cancellation.png`, `add and edit expense.png`) and
   what the app's own `.hf-sec` component is for. "Save as Draft" goes with it,
   for the same reason: there is nowhere to save a draft to.

   THE PAST LEDGER STAYS, and it is the one thing here the reference has no
   room for. A student who left owing PKR 3,200 is a different re-admission
   from one who left square, and the warden filling this form is the person who
   decides what to do about it.
   ============================================================================ */
function openRestoreStudentForm(studentId) {
  /* GATED (2026-09-10). Re-admitting a former student puts a person back on
     the roster and into a bed — an add in every sense that matters, and it was
     asking for nothing at all. */
  if (typeof requirePerm === 'function' && !requirePerm('add')) return;
  const t = DB.students.find(x => x.id === studentId); if (!t) return;
  const availRooms = roomsByNumber(_getAvailableRooms());
  const roomOpts = availRooms.map(r => {
    const type = getRoomType(r);
    return '<option value="' + r.id + '">Room #' + escHtml(String(r.number)) + ' — ' +
      escHtml(type ? type.name : '') + ' · ' + escHtml(r.floor || '') + ' (' +
      getRoomOccupancy(r) + '/' + (type ? type.capacity : 1) + ' filled)</option>';
  }).join('');
  const pmOpts = pmOptions(t.paymentMethod);
  const todayStr = ymd(new Date());

  const payHistory = DB.payments.filter(p => p.studentId === t.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalPaid = payHistory.filter(p => p.status === 'Paid')
    .reduce((n, p) => n + Number(p.amount || 0), 0);
  const pendRecs = payHistory.filter(p => calculateOutstanding(p) > 0);
  const totalPend = pendRecs.reduce((n, p) => n + calculateOutstanding(p), 0);

  /* THE STAY, FROM THE TWO DATES THE RECORD ALREADY HAS. `joinDate` is the
     admission and `leftDate` the departure; where a month is missing the band
     says so rather than printing half a range. */
  const stayFrom = t.joinDate ? monthLabel(String(t.joinDate).slice(0, 7)) : '';
  const stayTo   = t.leftDate ? monthLabel(String(t.leftDate).slice(0, 7)) : '';
  const stay = stayFrom && stayTo ? stayFrom + ' – ' + stayTo
             : stayFrom || stayTo || 'Not recorded';
  const gone = (() => {
    if (!t.leftDate) return '';
    const d = new Date(String(t.leftDate) + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 0) return 'Leaves ' + fmtDateShort(t.leftDate);
    if (days === 0) return 'Left today';
    if (days < 31) return 'Left ' + days + ' day' + (days === 1 ? '' : 's') + ' ago';
    const months = Math.round(days / 30.44);
    if (months < 12) return 'Left ' + months + ' month' + (months === 1 ? '' : 's') + ' ago';
    const years = Math.floor(months / 12);
    return 'Left ' + years + ' year' + (years === 1 ? '' : 's') + ' ago';
  })();

  const lastRoomNo = String(t.lastRoom || t.roomNumber || '');
  const lastRoomRec = lastRoomNo ? DB.rooms.find(r => String(r.number) === lastRoomNo) : null;
  const lastRoomType = lastRoomRec ? getRoomType(lastRoomRec) : null;

  const histRows = payHistory.slice(0, 6).map(p => {
    const owed = calculateOutstanding(p);
    return '<tr>' +
      '<td>' + escHtml(monthLabel(p.month) || '—') + '</td>' +
      '<td class="rsf-h__n">' + escHtml(fmtPKR(p.amount)) + '</td>' +
      '<td class="rsf-h__n' + (owed > 0 ? ' is-owed' : '') + '">' + (owed > 0 ? escHtml(fmtPKR(owed)) : '—') + '</td>' +
      '<td>' + escHtml(p.method || '—') + '</td>' +
      '<td>' + statusBadge(p.status) + '</td>' +
      '<td>' + escHtml(fmtDate(p.date) || '—') + '</td>' +
    '</tr>';
  }).join('');

  const band =
    '<div class="rsf-band">' +
      studentAvatar(t, 54, stuAvatarHue(String(t.name || '?'))) +
      '<div class="rsf-band__id">' +
        '<div class="rsf-band__n">' + escHtml(t.name || '—') +
          '<span class="lk-chip dh-slate">Former student</span></div>' +
        '<div class="rsf-band__m">ID: #' + escHtml(String(t.id)) +
          (t.cnic ? '  ·  CNIC: ' + cnicHtml(t.cnic) : '') + '</div>' +
        '<div class="rsf-band__m">' +
          (t.phone ? icon('phone', 'xs') + escHtml(t.phone) : '') +
          (t.email ? icon('mail', 'xs') + escHtml(t.email) : '') +
          (!t.phone && !t.email ? 'No contact recorded' : '') +
        '</div>' +
      '</div>' +
      '<div class="rsf-band__f">' +
        '<span class="rsf-band__fi">' + icon('calendar', 'sm') + '</span>' +
        '<div><div class="rsf-band__fk">Last stay</div>' +
        '<div class="rsf-band__fv">' + escHtml(stay) + '</div>' +
        (gone ? '<div class="rsf-band__fs">' + escHtml(gone) + '</div>' : '') + '</div>' +
      '</div>' +
      '<div class="rsf-band__f">' +
        '<span class="rsf-band__fi">' + icon('bed', 'sm') + '</span>' +
        '<div><div class="rsf-band__fk">Previous room</div>' +
        '<div class="rsf-band__fv">' + (lastRoomNo ? 'Room #' + escHtml(lastRoomNo) : 'Not recorded') + '</div>' +
        (lastRoomType || (lastRoomRec && lastRoomRec.floor)
          ? '<div class="rsf-band__fs">' + escHtml(lastRoomType ? lastRoomType.name : '') +
            (lastRoomRec && lastRoomRec.floor ? ' · ' + escHtml(lastRoomRec.floor) + ' Floor' : '') + '</div>'
          : '') + '</div>' +
      '</div>' +
    '</div>';

  const note =
    '<div class="rsf-note">' + icon('info', 'sm') +
      '<div>Their previous details are filled in below — correct anything that has changed. ' +
      'The record keeps its ID and its whole payment history; this adds a new admission to it.</div>' +
    '</div>';

  const ledger = payHistory.length
    ? '<div class="hf-sec">' +
        '<div class="hf-sec__h"><span class="hf-num">1</span>' +
          '<span class="hf-sec__t">What they left behind</span>' +
          '<span class="hf-sec__s">The last six records of their previous stay</span>' +
          '<span class="rsf-sum">' +
            '<span class="lk-chip dh-green">' + escHtml(fmtPKR(totalPaid)) + ' collected</span>' +
            (totalPend > 0
              ? '<span class="lk-chip dh-red">' + escHtml(fmtPKR(totalPend)) + ' still owed</span>'
              : '<span class="lk-chip dh-slate">Nothing owed</span>') +
          '</span>' +
        '</div>' +
        '<div class="rsf-h-wrap"><table class="rsf-h">' +
          '<thead><tr><th>Month</th><th>Paid</th><th>Unpaid</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>' +
          '<tbody>' + histRows + '</tbody></table></div>' +
        (payHistory.length > 6
          ? '<div class="hi-note">Showing 6 of ' + payHistory.length + ' records — the whole ledger is on the student panel.</div>'
          : '') +
      '</div>'
    : '';

  const n = k => String(ledger ? k + 1 : k);

  /* `label` is HTML, not text: every call site is a literal in this function and
     two of them carry markup — the required-field asterisk and a typographic
     apostrophe. Escaping it printed "Father&rsquo;s name" and the raw
     <span class="req"> tag on screen. */
  const fld = (id, label, ico, input, hint) =>
    '<div class="field"><label for="' + id + '">' + label + '</label>' +
    '<div class="hf-in"><span class="hf-in__i">' + icon(ico, 'sm') + '</span>' + input + '</div>' +
    (hint ? '<div class="hi-note">' + hint + '</div>' : '') + '</div>';

  const identity =
    '<div class="hf-sec">' +
      '<div class="hf-sec__h"><span class="hf-num">' + n(1) + '</span>' +
        '<span class="hf-sec__t">Student information</span>' +
        '<span class="hf-sec__s">Check what has changed since they were here</span></div>' +
      '<input type="hidden" id="rs-studentId" value="' + escHtml(String(t.id)) + '">' +
      '<div class="hf-g2">' +
        fld('rs-name', 'Full name', 'person',
          '<input class="form-control" id="rs-name" value="' + escHtml(t.name || '') + '" oninput="autoCapName(this)">') +
        fld('rs-fname', 'Father&rsquo;s name', 'person',
          '<input class="form-control" id="rs-fname" value="' + escHtml(t.fatherName || '') + '" oninput="autoCapName(this)">') +
        fld('rs-cnic', 'CNIC', 'card',
          '<input class="form-control" id="rs-cnic" value="' + escHtml(t.cnic || '') + '" placeholder="XXXXX-XXXXXXX-X" maxlength="15" oninput="fmtCnic(this)">') +
        fld('rs-phone', 'Phone', 'phone',
          '<input class="form-control" id="rs-phone" value="' + escHtml(t.phone || '') + '" placeholder="03xx xxxxxxx">') +
        fld('rs-email', 'Email', 'mail',
          '<input class="form-control" id="rs-email" value="' + escHtml(t.email || '') + '" placeholder="name@example.com">') +
        fld('rs-occ', 'Occupation', 'bookmark',
          '<input class="form-control" id="rs-occ" value="' + escHtml(t.occupation || '') + '" placeholder="e.g. BS Computer Science">') +
        fld('rs-emerg', 'Emergency contact', 'phone',
          '<input class="form-control" id="rs-emerg" value="' + escHtml(t.emergencyContact || '') + '" placeholder="Name and number">') +
        fld('rs-address', 'Home address', 'pin',
          '<input class="form-control" id="rs-address" value="' + escHtml(t.address || '') + '">') +
      '</div>' +
    '</div>';

  const admission =
    '<div class="hf-sec">' +
      '<div class="hf-sec__h"><span class="hf-num">' + n(2) + '</span>' +
        '<span class="hf-sec__t">Room &amp; new admission</span>' +
        '<span class="hf-sec__s">Where they are going and from when</span></div>' +
      fld('rs-room', 'Assign room<span class="req">*</span>', 'bed',
        '<select class="form-control" id="rs-room" onchange="rsRecalc()">' +
          '<option value="">— Select an available room —</option>' + roomOpts + '</select>',
        'The monthly charge — rent plus mess — comes from the room&rsquo;s configured rate in Settings.') +
      '<div class="hf-g2">' +
        fld('rs-join', 'Admission date', 'calendar',
          '<input class="form-control cdp-trigger" id="rs-join" type="text" readonly onclick="showCustomDatePicker(this,event)" value="' + escHtml(todayStr) + '">') +
        fld('rs-month', 'First month billed', 'calendar',
          '<input class="form-control" id="rs-month" type="text" value="' + escHtml(thisMonthLabel()) + '" placeholder="e.g. March 2026" oninput="rsCheckMonthDuplicate(\'' + escHtml(String(t.id)) + '\',this.value)">') +
      '</div>' +
      '<div id="rs-month-warning" class="field" style="display:none"></div>' +
    '</div>';

  const charges =
    '<div class="hf-sec">' +
      '<div class="hf-sec__h"><span class="hf-num">' + n(3) + '</span>' +
        '<span class="hf-sec__t">Charges for the first month</span>' +
        '<span class="hf-sec__s">Anything on top of the rent, and anything off it</span>' +
        '<button type="button" class="set-btn rsf-add" onclick="rsAddExtraRow()">' + icon('plus', 'xs') + ' Add a charge</button></div>' +
      '<div id="rs-extra-list"></div>' +
      '<div class="hf-g2">' +
        fld('rs-concession', 'Concession (PKR)', 'money',
          '<input class="form-control" id="rs-concession" type="number" min="0" placeholder="0" oninput="rsRecalc()">') +
        fld('rs-conc-reason', 'Concession reason', 'fileText',
          '<input class="form-control" id="rs-conc-reason" placeholder="e.g. returning student discount">') +
      '</div>' +
      '<div class="rsf-tot" id="rs-total-box">' +
        '<div class="rsf-tot__c"><span>Monthly charge</span><div id="rs-tot-rent">' + moneyValue(0, { size: 'body' }) + '</div></div>' +
        '<span class="rsf-tot__op">+</span>' +
        '<div class="rsf-tot__c"><span>Extra charges</span><div id="rs-tot-extra">' + moneyValue(0, { size: 'body' }) + '</div></div>' +
        '<span class="rsf-tot__op">−</span>' +
        '<div class="rsf-tot__c"><span>Concession</span><div id="rs-tot-conc">' + moneyValue(0, { size: 'body' }) + '</div></div>' +
        '<span class="rsf-tot__op">=</span>' +
        '<div class="rsf-tot__c rsf-tot__c--net"><span>Net payable</span><div id="rs-tot-net">' + moneyValue(0, { size: 'section' }) + '</div></div>' +
      '</div>' +
    '</div>';

  const payment =
    '<div class="hf-sec">' +
      '<div class="hf-sec__h"><span class="hf-num">' + n(4) + '</span>' +
        '<span class="hf-sec__t">Payment taken now</span>' +
        '<span class="hf-sec__s">Leave the amount empty to admit them without collecting yet</span></div>' +
      '<div class="hf-g2">' +
        fld('rs-amount', 'Amount paid (PKR)', 'money',
          '<input class="form-control" id="rs-amount" type="number" placeholder="Leave empty to skip" oninput="rsRecalc()">') +
        fld('rs-pending', 'Still unpaid (PKR)', 'money',
          '<input class="form-control" id="rs-pending" type="number" min="0" placeholder="Auto-calculated" oninput="this.dataset.manual=1">',
          'Net payable less what was handed over. Type over it if the two do not match.') +
        fld('rs-pm', 'Payment method', 'wallet',
          '<select class="form-control" id="rs-pm">' + pmOpts + '</select>') +
        fld('rs-pstatus', 'Record as', 'check',
          '<select class="form-control" id="rs-pstatus" onchange="rsRecalc()">' +
            '<option value="Paid">Paid</option><option value="Pending">Pending</option></select>') +
      '</div>' +
      fld('rs-notes', 'Notes', 'fileText',
        '<input class="form-control" id="rs-notes" placeholder="Optional note on this admission…">') +
    '</div>';

  const head =
    '<div class="hf-mh"><div class="hf-mh__ico">' + icon('refreshCw', 'sm') + '</div>' +
    '<div><div class="hf-mh__t">Re-admit Former Student</div>' +
    '<div class="hf-mh__s">Restore their record and open a new admission</div></div></div>';

  showModal('modal-form', head,
    '<div class="rsf">' + band + note + ledger + identity + admission + charges + payment + '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="submitRestoreStudent(\'' + studentId + '\')">' +
      icon('refreshCw', 'sm') + ' Re-admit student</button>');

  // The duplicate-month check runs on the default month, not only on a change.
  setTimeout(function () {
    rsCheckMonthDuplicate(String(t.id), (document.getElementById('rs-month') || {}).value);
  }, 80);
}

function rsAddExtraRow(label='',amount='') {
  const list=document.getElementById('rs-extra-list'); if(!list) return;
  const id='rsec_'+Date.now(); const div=document.createElement('div');
  div.id=id; div.style.cssText='display:flex;gap:8px;margin-bottom:8px;align-items:center';
  div.innerHTML=`<input class="form-control rs-extra-label" type="text" placeholder="Charge name" value="${escHtml(label)}" style="flex:1" oninput="rsRecalc()"><input class="form-control rs-extra-amt" type="number" placeholder="PKR" value="${amount}" min="0" style="width:120px" oninput="rsRecalc()"><button type="button" onclick="document.getElementById('${id}').remove();rsRecalc()" style="background:var(--red-dim);border:1px solid rgba(255,77,109,0.3);color:var(--red);border-radius:7px;padding:4px 9px;cursor:pointer;font-size:14px;flex-shrink:0">✕</button>`;
  list.appendChild(div);
}

function _normMonthLabel(val) {
  if (!val) return '';
  // Already "March 2026" style
  if (/[A-Za-z]/.test(val)) return val.trim();
  // YYYY-MM format -> "March 2026"
  try { const [y,m] = val.split('-'); return new Date(+y, +m-1, 1).toLocaleString('default',{month:'long',year:'numeric'}); } catch(e){ return val; }
}

function rsCheckMonthDuplicate(studentId, monthVal) {
  const warn = document.getElementById('rs-month-warning');
  if (!warn) return;
  if (!monthVal) { warn.style.display = 'none'; return; }
  const normVal = _normMonthLabel(monthVal);
  const existing = DB.payments.filter(p => p.studentId === studentId && _normMonthLabel(p.month) === normVal);
  const paid    = existing.find(p => p.status === 'Paid');
  const pending = existing.find(p => p.status === 'Pending');
  if (paid) {
    warn.style.display = '';
    warn.innerHTML = '<div style="background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.35);border-radius:9px;padding:10px 14px;font-size:12px;color:var(--red);font-weight:600">' + icon('warning','sm') + ' This student already has a <strong>Paid</strong> payment for <strong>' + monthVal + '</strong>. The payment section below has been disabled to avoid duplicates. Change the month or leave amount empty.</div>';
    // Disable and clear payment fields
    ['rs-amount','rs-pending','rs-concession'].forEach(function(id){
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.disabled = true; }
    });
    const ps = document.getElementById('rs-pstatus');
    if (ps) ps.disabled = true;
  } else if (pending) {
    warn.style.display = '';
    warn.innerHTML = '<div style="background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.3);border-radius:9px;padding:10px 14px;font-size:12px;color:var(--accent-strong);font-weight:600">' + icon('warning','sm') + ' This student has a <strong>Pending</strong> payment of <strong>' + fmtPKR(calculateOutstanding(pending)) + '</strong> for <strong>' + monthVal + '</strong>. Submitting will add a new record — consider updating the existing one instead.</div>';
    ['rs-amount','rs-pending','rs-concession','rs-pstatus'].forEach(function(id){
      const el = document.getElementById(id); if (el) el.disabled = false;
    });
  } else {
    warn.style.display = 'none';
    ['rs-amount','rs-pending','rs-concession','rs-pstatus'].forEach(function(id){
      const el = document.getElementById(id); if (el) el.disabled = false;
    });
  }
  rsRecalc();
}

// The monthly charge is read off the room being assigned — the restore form no
// longer asks for it. Returns the full charge (rent + mess): restore used to
// bill rent only, so a restored student's first month was short by the mess.
function _rsChargesFromRoom() {
  const roomId = document.getElementById('rs-room')?.value;
  if (!roomId) return { rent: 0, mess: 0, messBilled: 0, total: 0, configured: false };
  // Carry the student's own mess arrangement across the restore so someone who
  // was rent-only before does not come back on the mess.
  const sid = document.getElementById('rs-studentId')?.value || '';
  const st  = sid ? DB.students.find(x=>x.id===sid) : null;
  return resolveCharges({ roomId, mess: st ? st.mess : undefined, messOptIn: st ? st.messOptIn : undefined,
                          messExempt: st ? st.messExempt : undefined });
}

function rsRecalc() {
  const rent =_rsChargesFromRoom().total;
  const paid=parseFloat(document.getElementById('rs-amount')?.value)||0;
  const conc=parseFloat(document.getElementById('rs-concession')?.value)||0;
  let extra=0; document.querySelectorAll('.rs-extra-amt').forEach(el=>{extra+=parseFloat(el.value)||0;});
  const net=rent+extra-conc;
  const el=id=>document.getElementById(id);
  if(el('rs-tot-rent'))  el('rs-tot-rent').innerHTML  =moneyValue(Math.abs(rent),{size:'body',color:'var(--blue)'});
  if(el('rs-tot-extra')) el('rs-tot-extra').innerHTML =moneyValue(Math.abs(extra),{size:'body',color:'var(--red)'});
  if(el('rs-tot-conc'))  el('rs-tot-conc').innerHTML  =moneyValue(Math.abs(conc),{size:'body',color:'var(--teal)'});
  if(el('rs-tot-net'))   el('rs-tot-net').innerHTML   =moneyValue(Math.abs(net),{size:'section',color:'var(--accent-strong)'});
  const pendEl=el('rs-pending'), statEl=el('rs-pstatus');
  if(pendEl&&!pendEl.dataset.manual){
    const autoPend=Math.max(0,net-paid);
    pendEl.value=autoPend>0?autoPend:'';
    if(statEl) statEl.value=autoPend>0?'Pending':'Paid';
  }
}

async function submitRestoreStudent(studentId) {
  if (typeof requirePerm === 'function' && !requirePerm('add')) return;
  const t=DB.students.find(x=>x.id===studentId); if(!t) return;
  const roomId=document.getElementById('rs-room').value;
  if(!roomId){toast('Please select a room','error');return;}
  const room=DB.rooms.find(r=>r.id===roomId);
  const rsCharges=resolveCharges({ roomId, mess:t.mess, messOptIn:t.messOptIn, messExempt:t.messExempt });
  const rent=rsCharges.rent;
  if(!rsCharges.configured) {toast('That room has no rent configured — set it in Settings → Rent & Mess','error');return;}
  const type=getRoomType(room);
  if(getRoomOccupancy(room)>=(type?.capacity||1)){toast('That room is full — pick another','error');return;}
  t.name            =document.getElementById('rs-name').value.trim()||t.name;
  t.fatherName      =document.getElementById('rs-fname').value.trim();
  t.cnic            =document.getElementById('rs-cnic').value.trim();
  t.phone           =document.getElementById('rs-phone').value.trim();
  t.email           =document.getElementById('rs-email').value.trim();
  t.occupation      =document.getElementById('rs-occ').value.trim();
  t.address         =document.getElementById('rs-address').value.trim();
  t.emergencyContact=document.getElementById('rs-emerg').value.trim();
  t.joinDate        =document.getElementById('rs-join').value;
  t.roomId=roomId; t.roomNumber=room?.number||''; t.rent=rent; t.mess=rsCharges.mess;
  t.paymentMethod=document.getElementById('rs-pm').value;
  t.status='Active'; t.restoredAt=today(); t.leftDate='';
  const extraCharges=[];
  document.querySelectorAll('#rs-extra-list > div').forEach(row=>{
    const lbl=row.querySelector('.rs-extra-label')?.value?.trim();
    const amt=parseFloat(row.querySelector('.rs-extra-amt')?.value)||0;
    if(lbl&&amt>0) extraCharges.push({label:lbl,amount:amt});
  });
  const extraTotal =extraCharges.reduce((s,c)=>s+c.amount,0);
  const concession =parseFloat(document.getElementById('rs-concession').value)||0;
  const concReason =document.getElementById('rs-conc-reason').value.trim();
  const amount     =parseFloat(document.getElementById('rs-amount').value)||0;
  const pendingAmt =parseFloat(document.getElementById('rs-pending').value)||0;
  const pStatus    =document.getElementById('rs-pstatus').value;
  const extraNotes =document.getElementById('rs-notes').value.trim();
  const monthVal = _normMonthLabel(document.getElementById('rs-month').value);
  // Bug fix: prevent duplicate payment if this month is already fully paid
  const existingPaid = monthVal && DB.payments.find(p => p.studentId === t.id && _normMonthLabel(p.month) === monthVal && p.status === 'Paid');
  if (existingPaid) {
    toast(`ℹ️ Skipped payment — ${monthVal} is already marked Paid for ${t.name}.`, 'info');
  } else if(amount>0||extraTotal>0){
    const netAmount=rsCharges.total+extraTotal-concession;
    const unpaid=pendingAmt>0?pendingAmt:(pStatus==='Pending'?netAmount:undefined);
    const notesParts=['First payment after restore'];
    if(extraCharges.length) notesParts.push('Charges: '+extraCharges.map(c=>`${c.label} ${fmtPKR(c.amount)}`).join(', '));
    if(concession>0) notesParts.push(`Concession: ${fmtPKR(concession)}${concReason?' ('+concReason+')':''}`);
    if(extraNotes) notesParts.push(extraNotes);
    DB.payments.push({id:uid(),studentId:t.id,studentName:t.name,roomId,roomNumber:room?.number||'',month:monthVal,monthlyRent:rent,totalRent:rent,messCharge:rsCharges.messBilled,messIncluded:rsCharges.messOptIn,amount,unpaid,admissionFee:0,fee:0,extraCharges,extraTotal,concession,concessionDesc:concReason||'',discount:concession,method:t.paymentMethod,status:pStatus,date:t.joinDate||today(),notes:notesParts.join(' | ')});
    ledgerTrack(DB.payments[DB.payments.length - 1]);
  }
  if(!DB.activityLog) DB.activityLog=[];
  DB.activityLog.unshift({id:uid(),type:'restore',icon:'🔄',text:`${t.name} restored to Room #${room?.number||''}`,date:new Date().toISOString()});
  await saveDB(); closeModal();
  toast(`✅ ${t.name} restored to Room #${room?.number||''}!`,'success');
  if(currentPage==='dashboard'||currentPage==='students') renderPage(currentPage);
}
// ─────────────────────────────────────────────────────────────────────────────

function downloadAllStudentsPDF() {
  // Build last 24 month options
  var monthOpts = '';
  for(var i=0;i<24;i++){
    var d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    var val=ym(d);
    var lbl=d.toLocaleString('default',{month:'long',year:'numeric'});
    monthOpts += '<option value="'+val+'"'+(i===0?' selected':'')+'>'+lbl+'</option>';
  }
  // Emoji out, icon() in — same pass as the report itself. showModal
  // interpolates the title as HTML, so the SVG lands in the header.
  showModal('modal-md',icon('download','sm')+' Download Students PDF',
    '<div style="padding:4px 0">'
    +'<div style="margin-bottom:18px">'
    +'<label style="font-size:12px;font-weight:700;color:var(--text2);display:block;margin-bottom:6px">Select Month for Fee Report</label>'
    +'<select id="pdf-month-sel" class="form-control">'+monthOpts+'</select>'
    +'<div style="font-size:11px;color:var(--text3);margin-top:6px">The PDF will show each student\'s rent, deposit, paid amount, and pending balance for the selected month.</div>'
    +'</div>'
    +'<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px">'
    +'<div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--accent-strong);margin-bottom:8px">'+icon('list','xs')+'Report will include:</div>'
    +'<div style="font-size:12px;color:var(--text2);line-height:1.8">'
    +icon('checkmark','xs')+' Student name, father\'s name, room number<br>'
    +icon('checkmark','xs')+' CNIC and phone number<br>'
    +icon('checkmark','xs')+' Monthly rent &amp; deposit paid on joining<br>'
    +icon('checkmark','xs')+' Amount paid in selected month<br>'
    +icon('checkmark','xs')+' Pending / unpaid balance for that month<br>'
    +icon('checkmark','xs')+' Payment status badge<br>'
    +icon('checkmark','xs')+' <strong style="color:var(--amber)">Expenses badge &amp; breakdown by category, with per-category totals</strong><br>'
    +icon('checkmark','xs')+' <strong style="color:var(--green)">Available Fund calculation</strong>'
    +'</div>'
    +'</div>'
    +'</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>'
    +'<button class="btn btn-primary" onclick="doGenerateStudentsPDF(document.getElementById(\'pdf-month-sel\').value);closeModal()">'+icon('download','sm')+' Generate PDF</button>'
  );
}

function doGenerateStudentsPDF(monthKey) {
  if (typeof requireFeature === 'function' && !requireFeature('printDocs')) return;
  var appName  = DB.settings.appName  || 'HOSTYLLO';
  var hostel   = DB.settings.hostelName || 'Hostel Name';
  var location = DB.settings.location  || '';
  var now      = new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'});
  // Use day 2 to avoid UTC-offset shifting to previous month
  var d        = new Date(monthKey+'-02');
  var monthLabel = d.toLocaleString('default',{month:'long',year:'numeric'});

  // Room order, then name inside a room — the app-wide rule (owner, 2026-08-31).
  // A warden reads this sheet while walking the building, so a name-ordered
  // list sends them up and down the stairs for every second student.
  var allStudents = studentsByRoom(DB.students);

  // PERF: group payments by studentId + index rooms by id ONCE, so the per-student
  // loop below is O(students) instead of O(students × payments) — this is what made
  // the report lag with hundreds of students and thousands of payment rows.
  var _payByStudent = new Map();
  (DB.payments||[]).forEach(function(p){
    var arr = _payByStudent.get(p.studentId);
    if(!arr){ arr=[]; _payByStudent.set(p.studentId, arr); }
    arr.push(p);
  });
  var _roomById = new Map((DB.rooms||[]).map(function(r){return [r.id, r];}));

  // The roster AS IT STOOD in the selected month — not whoever is on the books
  // today. This filter used to look only at leftDate, so it dropped students who
  // had moved out but kept every student who had not moved IN yet: a July report
  // listed nine students admitted in August, and their rent inflated July's
  // Rent/mo total by PKR 111,000. _studentInPeriod() checks both ends of the
  // tenancy and is the same helper the dashboard and the on-screen reports use,
  // so all three now agree on who was resident in a given month.
  //
  // Anyone with a fee record for the month is included regardless of dates — a
  // student who has since left must still appear against the money they paid.
  var students = allStudents.filter(function(s) {
    if ((_payByStudent.get(s.id)||[]).some(function(p){ return _payMatchesMonth(p, monthKey); })) return true;
    return _studentInPeriod(s, monthKey);
  });

  var total  = students.length;
  var active = students.filter(function(s){return s.status==='Active';}).length;
  var left   = students.filter(function(s){return s.status==='Left';}).length;

  // Grand totals
  var grandRent=0, grandAdmFee=0, grandExtra=0, grandConc=0, grandPaid=0, grandPending=0;

  // Month-level outgoings. calcExpenses() is the figure every other screen
  // quotes and it already carries the funds transfers, so this PDF stops
  // counting them as a separate line — a transfer is an expense under the Fund
  // Transfer category here like everywhere else.
  var grandExpenses  = calcExpenses(monthKey);

  var rows = '';
  students.forEach(function(s, i) {
    var room = _roomById.get(s.roomId);

    // FIX #1 #5: use _payMatchesMonth — correctly matches both "2026-04-15" date fields
    // AND "April 2026" month labels (the old startsWith never matched month labels).
    var mPays = (_payByStudent.get(s.id)||[]).filter(function(p){
      return _payMatchesMonth(p, monthKey);
    });

    var paidAmt    = mPays.filter(function(p){return p.status==='Paid';}).reduce(function(acc,p){return acc+Number(p.amount||0);},0)
                   + mPays.filter(function(p){return p.status==='Pending'&&Number(p.amount||0)>0&&p.unpaid!=null&&Number(p.unpaid)>0;}).reduce(function(acc,p){return acc+Number(p.amount||0);},0);
    var pendingAmt = mPays.reduce(function(acc,p){return acc+calculateOutstanding(p);},0);
    var admFee     = mPays.reduce(function(acc,p){return acc+Number(p.admissionFee||p.fee||0);},0);
    var extraTotal = mPays.reduce(function(acc,p){return acc+(p.extraTotal!=null&&Number(p.extraTotal)>0?Number(p.extraTotal):(p.extraCharges||[]).reduce(function(x,c){return x+Number(c.amount||0);},0));},0);
    var concession = mPays.reduce(function(acc,p){return acc+Number(p.concession||p.discount||0);},0);

    var hasRecord   = mPays.length > 0;
    var statusTxt   = !hasRecord ? '—' : pendingAmt>0 ? 'Partial' : 'Paid ✓';
    var statusCls   = !hasRecord ? 'p-none' : pendingAmt>0 ? 'p-part' : 'p-paid';
    var sCls        = s.status==='Active' ? 'p-act' : s.status==='Left' ? 'p-left' : 'p-other';
    // Zebra striping is a :nth-child rule in the stylesheet now, not a colour
    // computed per row and pasted onto every <tr>.

    // The month's whole charge — "Rent + Mess" where food is billed (owner, 2026-09-14).
    var monthlyCharge = Number(resolveCharges(s).total || 0);
    grandRent    += monthlyCharge;
    grandAdmFee  += admFee;
    grandExtra   += extraTotal;
    grandConc    += concession;
    grandPaid    += paidAmt;
    grandPending += pendingAmt;

    var dash = '—';   // the cell's .nil class carries the muted colour
    // Build extra charges label: show each charge with description+amount
    var extCell = (function(){
      var allExt = [];
      mPays.forEach(function(p){
        (p.extraCharges||[]).forEach(function(c){
          if(Number(c.amount)>0) allExt.push((c.label?c.label+': ':'')+fmtPKR(c.amount));
        });
      });
      return allExt.length ? allExt.join('<br>') : dash;
    })();
    // Build concession label
    var concCell = (function(){
      if(!concession) return dash;
      var descs = [];
      mPays.forEach(function(p){
        var pConc = Number(p.concession||p.discount||0);
        if(pConc>0){
          var desc = p.concessionDesc||p.discountDesc||'';
          descs.push((desc?desc+': ':'')+fmtPKR(pConc));
        }
      });
      return descs.length ? '−'+descs.join('<br>') : '−'+fmtPKR(concession);
    })();

    rows += '<tr>';
    rows += '<td class="no">'+(i+1)+'</td>';
    rows += '<td class="nm">'+escHtml(s.name||'—')+'</td>';
    rows += '<td class="fa">'+escHtml(s.fatherName||'—')+'</td>';
    rows += '<td class="rm">'+(room?'#'+room.number:'—')+'</td>';
    // Masked, like every other printed CNIC (owner, 2026-09-10).
    rows += '<td class="mono">'+escHtml(maskCnic(s.cnic)||'—')+'</td>';
    rows += '<td class="ph">'+escHtml(s.phone||'—')+'</td>';
    rows += '<td class="money rent">'+fmtPKR(monthlyCharge)+'</td>';
    rows += '<td class="money '+(admFee>0?'adm':'nil')+'">'+(admFee>0?fmtPKR(admFee):dash)+'</td>';
    rows += '<td class="money '+(extraTotal>0?'ext':'nil')+'">'+extCell+'</td>';
    rows += '<td class="money '+(concession>0?'conc':'nil')+'">'+concCell+'</td>';
    rows += '<td class="money '+(paidAmt>0?'paid':'nil')+'">'+(paidAmt>0?fmtPKR(paidAmt):dash)+'</td>';
    rows += '<td class="money '+(pendingAmt>0?'pend':'nil')+'">'+(pendingAmt>0?fmtPKR(pendingAmt):dash)+'</td>';
    rows += '<td class="c"><span class="pill '+statusCls+'">'+statusTxt+'</span></td>';
    rows += '<td class="c"><span class="pill '+sCls+'">'+escHtml(s.status||'—')+'</span></td>';
    rows += '</tr>';
  });

  // Totals row — adm/ext/conc NOT grand-totalled (they are per-student breakdown only)
  rows += '<tr class="totals">';
  rows += '<td colspan="6" class="lbl">TOTALS &nbsp;<span>('+total+' students)</span></td>';
  rows += '<td class="r">'+fmtPKR(grandRent)+'</td>';
  rows += '<td class="dim">—</td>';
  rows += '<td class="dim">—</td>';
  rows += '<td class="dim">—</td>';
  rows += '<td class="r g">'+fmtPKR(grandPaid)+'</td>';
  rows += '<td class="r rd">'+fmtPKR(grandPending)+'</td>';
  rows += '<td colspan="2" class="note">'+active+' active · '+left+' left</td>';
  rows += '</tr>';

  // Available Fund, computed the one way the whole app computes it:
  // calcRevenue − calcExpenses. It used to be grandPaid (the sum of the rows in
  // THIS table, which a status filter can narrow) minus expenses minus
  // transfers again — two ways to disagree with the Available Fund card on the
  // dashboard for the very same month.
  var netFund = calcRevenue(monthKey) - grandExpenses;

  // ── HTML ──────────────────────────────────────────────────────────────────
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=1300">';
  html += '<title>'+hostel+' — Students Fee Report '+monthLabel+'</title>';
  /* ── STYLES ───────────────────────────────────────────────────────────────
     One stylesheet, classes on the cells. This document used to carry the same
     `padding:6px 5px;border:1px solid #c8d0db` string on all fourteen cells of
     every row, which made a colour change a fourteen-place edit and put most of
     the file's weight in repeated attributes.

     Palette is the Room Visit Sheet's — slate ink, #e2e8f0 rules, semantic
     green/red/amber — so the two documents a warden prints in the same minute
     look like they came from the same system. The old purple-on-navy headers
     (#a78bfa on #0f1a2e) and the brown expenses panel were each their own
     scheme, and neither matched anything else the app prints. */
  html += '<style>';
  html += '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}';
  /* The @page is _pdfInject()'s — landscape on the hostel's paper (owner,
     2026-09-15) — and every size in this sheet went up to fill it. */
  html += '@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  html += 'body{font-family:"Segoe UI",-apple-system,Roboto,Arial,sans-serif;background:#fff;color:#0f172a;padding:14px 18px;font-size:13px}';
  html += '@media print{body{padding:3px 4px;font-size:12px}.no-print{display:none!important}}';
  // This document opens in its own window with none of the app's stylesheets,
  // so icon() SVGs would fall back to the replaced-element default of 300×150
  // and tear the layout apart. Same rules the visit sheet carries.
  html += 'svg.icon{width:14px;height:14px;flex-shrink:0;vertical-align:-2px}';
  html += 'svg.icon-xs{width:11px;height:11px}svg.icon-sm{width:13px;height:13px}';

  // ── Header
  html += '.hdr{display:flex;justify-content:space-between;align-items:flex-end;';
  html += 'border-bottom:2px solid #1e293b;padding-bottom:9px;margin-bottom:12px}';
  html += '.hdr h1{font-size:26px;font-weight:900;letter-spacing:-.02em}';
  html += '.hdr .sub{display:flex;align-items:center;gap:4px;font-size:12.5px;color:#374151;margin-top:3px}';
  html += '.hdr .kicker{margin-top:5px;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:1.6px}';
  html += '.hdr .date{text-align:right}';
  html += '.hdr .date .d{display:flex;align-items:center;justify-content:flex-end;gap:5px;font-size:15px;font-weight:800;color:#1e293b}';
  html += '.hdr .date .h{font-size:11.5px;color:#4b5563;margin-top:3px}';

  // ── Summary tiles. Eight across a landscape page, so the value sits at 15px
  //    and every label is one line — the old ones broke on a <br> mid-phrase.
  html += '.summary{display:flex;gap:6px;margin-bottom:12px}';
  html += '.sbox{flex:1;min-width:0;display:flex;align-items:center;gap:7px;border:1px solid #888888;border-radius:8px;padding:7px 9px}';
  html += '.sbox .ico{width:26px;height:26px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center}';
  html += '.sbox .v{display:block;font-size:18px;font-weight:900;line-height:1.15;white-space:nowrap}';
  html += '.sbox .l{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.9px;color:#4b5563;font-weight:700;margin-top:1px;white-space:nowrap}';
  html += '.sbox.t-slate .ico{background:#e2e8f0;color:#475569}.sbox.t-slate .v{color:#0f172a}';
  html += '.sbox.t-green .ico{background:#dcfce7;color:#16a34a}.sbox.t-green .v{color:#15803d}';
  html += '.sbox.t-gray  .ico{background:#e5e7eb;color:#4b5563}.sbox.t-gray  .v{color:#374151}';
  html += '.sbox.t-blue  .ico{background:#dbeafe;color:#2563eb}.sbox.t-blue  .v{color:#1d4ed8}';
  html += '.sbox.t-red   .ico{background:#fee2e2;color:#dc2626}.sbox.t-red   .v{color:#b91c1c}';
  html += '.sbox.t-amber .ico{background:#fef3c7;color:#b45309}.sbox.t-amber .v{color:#b45309}';

  // ── Roster table
  html += 'table{width:100%;border-collapse:collapse;table-layout:fixed}';
  html += 'col.c-no{width:3%}col.c-name{width:13%}col.c-father{width:10%}col.c-room{width:4%}col.c-cnic{width:11%}col.c-phone{width:8%}col.c-rent{width:7%}col.c-adm{width:7%}col.c-ext{width:8%}col.c-conc{width:8%}col.c-paid{width:8%}col.c-pend{width:7%}col.c-fst{width:7%}col.c-sst{width:6%}';
  /* Photocopy contrast (owner, 2026-09-15): #888 grid, grey header fill, no zebra, dark labels. */
  html += 'thead th{background:#e5e7eb;color:#1f2937;padding:8px 6px;text-align:left;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;border:1px solid #888888;word-break:break-word}';
  html += 'thead th.r{text-align:right}thead th.c{text-align:center}';
  html += 'td{padding:7px 6px;border:1px solid #888888;word-break:break-word;vertical-align:middle;font-size:12px}';
  html += 'td.c{text-align:center}td.r{text-align:right}';
  html += 'td.no{text-align:center;font-weight:700;color:#4b5563}';
  html += 'td.nm{font-weight:700;color:#0f172a}';
  html += 'td.fa{color:#475569}';
  html += 'td.rm{text-align:center;font-weight:800;color:#b45309}';
  html += 'td.mono{font-family:Consolas,"Courier New",monospace;font-size:11px;color:#475569}';
  html += 'td.ph{color:#475569}';
  html += 'td.money{text-align:right;font-weight:800}';
  html += 'td.rent{color:#15803d}td.paid{color:#15803d}td.pend{color:#b91c1c}';
  html += 'td.adm{color:#1d4ed8;font-weight:700}td.ext{color:#b45309;font-weight:700}td.conc{color:#0f766e;font-weight:700}';
  html += 'td.nil{color:#4b5563;font-weight:400}';
  html += '.pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:800;white-space:nowrap}';
  html += '.p-paid{background:#dcfce7;color:#15803d}.p-part{background:#fee2e2;color:#b91c1c}';
  html += '.p-none{background:#e5e7eb;color:#4b5563}';
  html += '.p-act{background:#dcfce7;color:#05603a}.p-left{background:#e5e7eb;color:#374151}.p-other{background:#fee2e2;color:#9f1c12}';

  // ── Totals band — the ink bar the eye lands on, matching the visit sheet's
  //    floor header rather than inventing a third dark shade.
  html += 'tr.totals td{background:#0f172a!important;border:1px solid #1e293b;padding:8px 5px;color:#cbd5e1;font-weight:900}';
  html += 'tr.totals td.lbl{font-size:14px;color:#fff;text-align:left}';
  html += 'tr.totals td.lbl span{font-weight:400;font-size:12px;color:#94a3b8}';
  // .r before .g/.rd — same specificity, so source order decides which colour
  // the collected and pending figures keep.
  html += 'tr.totals td.r{text-align:right;color:#fff}';
  html += 'tr.totals td.g{color:#86efac}tr.totals td.rd{color:#fca5a5}tr.totals td.dim{color:#cbd5e1;font-weight:400;font-size:11px;text-align:center}';
  html += 'tr.totals td.note{color:#94a3b8;font-weight:400;font-size:12px;text-align:center}';

  // ── Outgoings register
  html += '.outgo{margin-top:16px;padding:12px 14px;border:1px solid #888888;border-radius:10px}';
  html += '.outgo h2{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:9px}';
  html += '.cat{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#0f172a;margin:11px 0 5px}';
  html += '.cat .n{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#374151;background:#e5e7eb;border-radius:20px;padding:2px 8px}';
  html += 'table.exp{font-size:12.5px}';
  html += 'table.exp th{background:#e5e7eb;color:#1f2937;padding:7px 10px;border:1px solid #888888;text-align:left;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}';
  html += 'table.exp th.r{text-align:right}';
  html += 'table.exp td{padding:5px 10px;border:1px solid #888888}';
  html += 'table.exp td.amt{text-align:right;font-weight:800;color:#b91c1c}';
  html += 'table.exp td.dsc{color:#475569}';
  html += 'table.exp tr.sub td{background:#e5e7eb!important;font-weight:900;color:#0f172a}';
  html += 'table.exp tr.sub td.amt{color:#b91c1c}';
  html += 'table.grand td{background:#0f172a;border:1px solid #1e293b;padding:8px 10px;font-weight:900;color:#fff;font-size:12.5px}';
  html += 'table.grand td.amt{text-align:right;color:#fca5a5}';

  html += '.footer{margin-top:12px;padding-top:7px;border-top:1px solid #888888;display:flex;justify-content:space-between;align-items:center}';
  html += '.footer .gen{font-size:11px;color:#4b5563}';
  html += '.footer .tally{font-size:12px;color:#475569;font-weight:600}';
  html += '.pbtn{display:inline-flex;align-items:center;gap:7px;background:#1d4ed8;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer}';
  html += '</style></head><body>';

  // Header. Emoji are out — the print documents use icon() SVGs, and the pin /
  // calendar / printer here are the same three the visit sheet uses.
  html += '<div class="hdr">';
  html += '<div><h1>'+escHtml(hostel)+'</h1>';
  if(location) html += '<div class="sub">'+icon('pin','xs')+'<span>'+escHtml(location)+'</span></div>';
  html += '<div class="kicker">Students Fee Report — '+monthLabel+'</div></div>';
  html += '<div class="date"><div class="d">'+icon('calendar','xs')+'<span>'+now+'</span></div>';
  html += '<div class="h">All amounts are in PKR</div>';
  html += '<button class="pbtn no-print" style="margin-top:8px" onclick="window.print()">'+icon('print','sm')+' Print / Save PDF</button></div>';
  html += '</div>';

  // Summary tiles (Fix #12: admission fee and concession removed from grand total badges)
  var _pdfPending=DB.payments.filter(function(p){return _payMatchesMonth(p,monthKey);}).reduce(function(s,p){return s+calculateOutstanding(p);},0);
  var _tile = function(tone, ico, val, lbl) {
    return '<div class="sbox t-'+tone+'"><span class="ico">'+icon(ico,'sm')+'</span>'
      + '<span><span class="v">'+val+'</span><span class="l">'+lbl+'</span></span></div>';
  };
  html += '<div class="summary">';
  html += _tile('slate','users',      total,                      'In Report');
  html += _tile('green','userCheck',  active,                     'Active');
  html += _tile('gray', 'logout',     left,                       'Left');
  html += _tile('blue', 'receipt',    fmtPKR(grandRent),          'Rent Expected');
  html += _tile('green','wallet',     fmtPKR(calcRevenue(monthKey)), 'Collected');
  html += _tile(_pdfPending>0?'red':'green', 'clock', fmtPKR(_pdfPending), 'Pending Unpaid');
  // No Funds Transfer tile: that money is inside the Expenses figure beside it,
  // and showing both read as two separate deductions from one month's cash.
  html += _tile('amber','trendDown',  fmtPKR(grandExpenses),      'Expenses');
  html += _tile(netFund>=0?'green':'red', 'money', fmtPKR(netFund), 'Net Available');
  html += '</div>';

  // Table
  html += '<table>';
  html += '<colgroup><col class="c-no"><col class="c-name"><col class="c-father"><col class="c-room"><col class="c-cnic"><col class="c-phone"><col class="c-rent"><col class="c-adm"><col class="c-ext"><col class="c-conc"><col class="c-paid"><col class="c-pend"><col class="c-fst"><col class="c-sst"></colgroup>';
  html += '<thead><tr>';
  html += '<th class="c">#</th><th>Student Name</th><th>Father\'s Name</th><th class="c">Room</th><th>CNIC</th><th>Phone</th>';
  html += '<th class="r">'+(hostelServesMess() ? 'Rent + Mess/Mo' : 'Rent/Mo')+'</th>';
  // These five kept the tints they were given for the old navy header strip —
  // #7ab4ff, #ffd27a, #7aefcf were picked to glow on #0f1a2e and are close to
  // invisible on a light one. Same coding, at the weight the column's own
  // figures use.
  html += '<th class="r" style="color:#1d4ed8">Adm.Fee</th>';
  html += '<th class="r" style="color:#b45309">Extra Chrgs</th>';
  html += '<th class="r" style="color:#0f766e">Concession</th>';
  html += '<th class="r" style="color:#15803d">Amount Paid</th>';
  html += '<th class="r" style="color:#b91c1c">Pending</th>';
  html += '<th class="c">Fee Status</th>';
  // "Stu.Status" is one unbroken token, so in a 6% column word-break split it
  // mid-word as "STU.STATU / S". A space gives it a legal wrap point.
  html += '<th class="c">Stu. Status</th>';
  html += '</tr></thead>';
  html += '<tbody>'+rows+'</tbody>';
  html += '</table>';

  // Outgoings breakdown — grouped BY CATEGORY with a total per category and a
  // grand total, the same register the Reports screen and the other PDFs use.
  // _rptOutgoings() folds the funds transfers in under the Fund Transfer
  // category, so the separate "🏦 Funds Transfer" table that used to follow
  // this one is gone: it printed the same money a second time, under a second
  // total, on the same page.
  var _monthOut = _rptOutgoings(monthKey);
  if(_monthOut.length) {
    var _mGroups = _rptByCategory(_monthOut);
    html += '<div class="outgo">';
    html += '<h2>'+icon('trendDown','sm')+'Expenses by Category — '+monthLabel+'</h2>';
    _mGroups.forEach(function(g){
      html += '<div class="cat">'+escHtml(g.cat)+'<span class="n">'+g.items.length+' record'+(g.items.length===1?'':'s')+'</span></div>';
      html += '<table class="exp">';
      html += '<thead><tr><th>Date</th><th>Description</th><th class="r">Amount</th></tr></thead><tbody>';
      g.items.forEach(function(e){
        html+='<tr>';
        html+='<td>'+fmtDate(e.date)+'</td>';
        html+='<td class="dsc">'+escHtml(e.description||'—')+'</td>';
        html+='<td class="amt">'+fmtPKR(e.amount)+'</td>';
        html+='</tr>';
      });
      html+='<tr class="sub"><td colspan="2" style="text-align:right">Total — '+escHtml(g.cat)+'</td><td class="amt">'+fmtPKR(g.total)+'</td></tr>';
      html+='</tbody></table>';
    });
    html+='<table class="grand" style="margin-top:10px"><tbody>';
    html+='<tr><td>GRAND TOTAL — '+_mGroups.length+' categor'+(_mGroups.length===1?'y':'ies')+'</td><td class="amt">'+fmtPKR(_rptGroupsTotal(_mGroups))+'</td></tr>';
    html+='</tbody></table></div>';
  }

  html += '<div class="footer">';
  html += '<div class="gen">Generated by <strong>' + escHtml(appName) + '</strong> · '+escHtml(hostel)+' · '+monthLabel+'</div>';
  html += '<div class="tally">'+total+' students · Collected: <b style="color:#15803d">'+fmtPKR(grandPaid)+'</b> · Expenses: <b style="color:#b45309">'+fmtPKR(grandExpenses)+'</b> · Net: <b style="color:'+(netFund>=0?'#15803d':'#b91c1c')+'">'+fmtPKR(netFund)+'</b></div>';
  html += '</div>';

  html += '</body></html>';

  /* THROUGH _electronPDF(), NOT STRAIGHT TO THE WINDOW. This was the one report
     that called openPdfWindow itself, so it was the one report with no Download
     and no Print button — the bar, the @page margins and the print CSS are all
     injected by _electronPDF, and a document that skips it arrives bare (owner,
     2026-09-09: "the all student pdf in reports still have no new download and
     print buttons"). It also loses the popup fallback, which _electronPDF has
     its own, better version of. */
  _electronPDF(html, escHtml(hostel) + ' — Students Fee Report · ' + monthLabel,
               { landscape: true, pageSize: paperSize() });
}

// ── ADD STUDENT RECALC ───────────────────────────────────────────────────────
function filterRoomSearch(q) {
  const drop = document.getElementById('room-search-drop'); if(!drop) return;
  const items = drop.querySelectorAll('.room-search-item');
  const v = q.toLowerCase();
  let any = false;
  items.forEach(el => {
    const label = el.dataset.label.toLowerCase();
    const show = !v || label.includes(v);
    el.style.display = show ? '' : 'none';
    if(show) any = true;
  });
  drop.style.display = 'block';
}
// `rent` is still accepted so older callers keep working, but the student form
// no longer carries a rent field — rent is a property of the room and is read
// from it at save time. Money lives in Payments.
function pickRoomSearch(roomId, rent, label) {
  document.getElementById('f-troom').value = roomId;
  const inp = document.getElementById('f-troom-search');
  if(inp) inp.value = label;
  const lbl = document.getElementById('f-troom-selected-label');
  if(lbl) lbl.textContent = '✓ Selected';
  const drop = document.getElementById('room-search-drop');
  if(drop) drop.style.display = 'none';

  // v5 form: Floor and Bed/Seat are properties OF the room, so picking a room
  // fills them rather than asking the warden to repeat information the app
  // already knows. Both fields are absent on other forms — guarded accordingly.
  const room = DB.rooms.find(r => r.id === roomId);
  const floorEl = document.getElementById('f-tfloor');
  if (floorEl && room) floorEl.value = (room.floor || '') + ' Floor';
  const bedEl = document.getElementById('f-tbed');
  if (bedEl && typeof sfBedOptions === 'function') bedEl.innerHTML = sfBedOptions(room);

  /* The intake sheet shows the monthly charge as a read-only cell, so the
     warden sees the price while assigning rather than first at the payment
     step. resolveCharges() is the reader -- never rent alone, which would hide
     the mess half. Absent on the other forms that share this function. */
  const rentEl = document.getElementById('f-trent-display');
  if (rentEl) {
    const rc = roomId ? resolveCharges({ roomId }) : null;
    rentEl.value = rc && rc.configured ? fmtPKR(rc.total) + ' / month' : '';
    rentEl.placeholder = rc && !rc.configured ? 'No rent set for this room type' : 'Set by room';
  }

  recalcStudentUnpaid();
  if (typeof asfCompletion === 'function') asfCompletion();
}
function recalcStudentUnpaid() {
  // The v5 form dropped its rent input (f-trent), so this used to read 0 and
  // every admission showed the wrong paid/pending verdict. Read the charge off
  // the room being picked instead — the same source submitAddStudent uses.
  const roomId = document.getElementById('f-troom')?.value || '';
  const r = roomId ? resolveCharges({ roomId }).total : 0;
  const a = parseFloat(document.getElementById('f-tdeposit')?.value)||0;
  const admFee = parseFloat(document.getElementById('f-tadmfee')?.value)||0;
  const extra = getStudentExtraChargesTotal();
  const total = r + admFee + extra;
  const u = Math.max(0, total - a);
  const el = document.getElementById('f-tunpaid');
  if(el){ el.value=u; el.style.color=u>0?'var(--red)':'var(--green)'; }
  const lbl = document.getElementById('f-tdeposit-status');
  if(lbl) lbl.textContent = a>=total&&total>0?'✓ Full amount paid — will be marked Paid':a>0?'⚠ Partial — will be marked Pending':'No amount paid — auto-pending record created';
  const fb = document.getElementById('f-tadmfee-badge');
  if(fb) fb.textContent = admFee>0 ? fmtPKR(admFee) : 'No Fee';
  const etEl = document.getElementById('student-extra-charges-total');
  if(etEl) etEl.textContent = 'Rs. ' + Number(extra).toLocaleString('en-PK');
}
function getStudentExtraChargesTotal() {
  let t=0; document.querySelectorAll('.student-extra-charge-amt').forEach(i=>{ t+=parseFloat(i.value)||0; }); return t;
}
function getStudentExtraChargesData() {
  const items=[];
  document.querySelectorAll('.student-extra-charge-row').forEach(row=>{
    const label=row.querySelector('.student-extra-label')?.value?.trim();
    const amt=parseFloat(row.querySelector('.student-extra-charge-amt')?.value)||0;
    if(label&&amt>0) items.push({label,amount:amt});
  });
  return items;
}
function addStudentExtraChargeRow(label='',amount='') {
  const list=document.getElementById('student-extra-charges-list'); if(!list) return;
  const rowId='secr_'+Date.now();
  const div=document.createElement('div');
  div.className='extra-charge-row student-extra-charge-row'; div.id=rowId;
  div.innerHTML=`<input class="form-control student-extra-label" type="text" placeholder="Charge name (e.g. Cooler Fee)" value="${escHtml(label)}" style="flex:1" oninput="recalcStudentUnpaid()"><input class="form-control student-extra-charge-amt charge-amt" type="number" placeholder="Amount (PKR)" value="${amount}" min="0" oninput="recalcStudentUnpaid()"><button type="button" class="rm-btn" onclick="document.getElementById('${rowId}').remove();recalcStudentUnpaid()" title="Remove">✕</button>`;
  list.appendChild(div); recalcStudentUnpaid();
}
// ─────────────────────────────────────────────────────────────────────────────

// ── INPUT AUTO-FORMAT ────────────────────────────────────────────────────────
function fmtPhone(inp) {
  let v = inp.value.replace(/\D/g,'');
  if(v.length > 4) v = v.slice(0,4) + '-' + v.slice(4,11);
  inp.value = v;
}
function fmtCnic(inp) {
  let v = inp.value.replace(/\D/g,'');
  if(v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
  if(v.length > 13) v = v.slice(0,13) + '-' + v.slice(13,14);
  inp.value = v;
}
function fmtEmail(inp) {
  const hint = document.getElementById('f-temail-hint');
  // FIX 7: trim before checking to avoid stale hint on trailing-space input
  const v = inp.value.trim();
  if(v && !v.includes('@')) {
    if(hint) hint.style.display = 'block';
  } else {
    if(hint) hint.style.display = 'none';
  }
}
function getEmailValue() {
  const el = document.getElementById('f-temail');
  if(!el) return '';
  const v = el.value.trim();
  if(!v) return '';
  // FIX 8: full email kept as-is (user@yahoo.com etc.), bare username gets @gmail.com
  return v.includes('@') ? v : v + '@gmail.com';
}
// ─────────────────────────────────────────────────────────────────────────────

// ── CANCELLATION DOWNLOAD REPORT ─────────────────────────────────────────────

/* THE FLOOR, SHORTENED — and the seater dropped (owner, 2026-09-09: "remove
   the room seater detail also as a warden already knows how many seats are
   there, only add there floor").

   The seat count was the room TYPE repeated on every one of its rooms, in a
   column whose job is to say WHERE. The floor is the thing a warden walking to
   the room needs, and the long form ("Ground Floor") is two words for a cell
   that has room for one. */
/* THE ONE IMPLEMENTATION IS floorShort() IN utils.js (2026-09-10). It moved
   there when Payments, Complaints and Cancellations started drawing the same
   boxed room label this page draws; a second copy here would be the same
   function in two files, differing the first time either is touched. This name
   stays because this file calls it in several places. */
function stuFloorShort(floor) {
  return floorShort(floor);
}


/* WHICH PLAN A STUDENT IS ON, for the charge-plan filter. It reads the same
   resolveCharges() → chargeCoverage() pair the Charges column prints, so the
   filter can never select a row the column then contradicts. */
function stuPlanOf(t) {
  const c = resolveCharges(t);
  return chargeCoverage({ rent: c.rent, mess: c.mess,
                          messIncluded: c.messOptIn && c.mess > 0,
                          hasMess: c.mess > 0 }).key;
}
