/* ─── HOSTYLLO — STUDENTS MODULE ─────────────────────────────────────────────
   Contains: renderStudents, showAddStudentModal, submitAddStudent,
             showViewStudentModal, showEditStudentModal, submitEditStudent,
             confirmDeleteStudent, showRoomShiftModal, submitRoomShift,
             photo upload/camera, quickCancelStudent,
             printStudentCard, downloadAllStudentsPDF, formerStudents flow,
             filterRoomSearch, pickRoomSearch, extra charge helpers
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   STUDENTS v5 — shared helpers
   ══════════════════════════════════════════════════════════════════════════ */

// roomId → room, built once per call instead of DB.rooms.find() per row.
function _stuRoomMap() { return new Map(DB.rooms.map(r => [r.id, r])); }

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
    room:   t => { const r = byId.get(t.roomId); return Number(r ? r.number : 0) || 0; },
    course: t => t.occupation || t.course || '',
    status: t => t.status
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
function stuStatusHue(s) {
  return s === 'Active' ? 'dh-green' : s === 'Cancelling' ? 'dh-amber'
       : s === 'Blacklisted' ? 'dh-red' : 'dh-slate';
}

function renderStudents() {
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

  const roomNums = [...new Set(DB.students.map(t=>{const r=_roomById.get(t.roomId);return r?String(r.number):'';}).filter(Boolean))]
                     .sort((a,b)=>(Number(a)||0)-(Number(b)||0));
  const courses  = [...new Set(DB.students.map(t=>String(t.occupation||t.course||'')).filter(Boolean))].sort();
  const activeFilters = [studentFilter.room!=='All', studentFilter.course!=='All'].filter(Boolean).length;

  const th = (key,label,extra) => {
    const on = studentFilter.sortKey===key;
    const arw = on ? (studentFilter.sortDir==='asc'?'▲':'▼') : '⇅';
    return `<th class="is-sortable${on?' is-sorted':''}" ${extra||''} onclick="toggleSort(studentFilter,'students','${key}')" title="Sort by ${label}">${label}<span class="arw">${arw}</span></th>`;
  };
  const waIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 9 0 0 0-10 9 8.76 8.76 0 0 0 3 6.55V21a1 1 0 0 0 1.49.87L9.85 20A10.66 10.66 0 0 0 12 20a10 9 0 0 0 10-9 10 9 0 0 0-10-9Z"/></svg>';

  return `
  <!-- ══ STAT STRIP ══ -->
  <div class="stu-stats">
    <div class="stu-stat stu-stat--click dh-blue" onclick="stuSetStatus('All')" title="Show every student">
      <div class="stu-stat__top">
        <div class="stu-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/><path d="m2 10 10-5 10 5-10 5z"/></svg></div>
        <div class="stu-stat__label">${studentFilter.month?'Students in '+escHtml(/^\d{4}$/.test(studentFilter.month)?studentFilter.month:_stuMonthLabel(studentFilter.month).split(' ')[0]):'Total Students'}</div>
      </div>
      <div class="stu-stat__val">${nTotal}</div>
      <div class="stu-stat__sub">${studentFilter.month?'On the roster that month':'Registered, all time'}</div>
    </div>

    <div class="stu-stat stu-stat--click dh-green" onclick="stuSetStatus('Active')" title="Show only active students">
      <div class="stu-stat__top">
        <div class="stu-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></div>
        <div class="stu-stat__label">Active</div>
      </div>
      <div class="stu-stat__val">${nActive}</div>
      <div class="stu-stat__sub">Students</div>
    </div>

    ${nCanc?`<div class="stu-stat stu-stat--click dh-amber" onclick="stuSetStatus('Cancelling')" title="Show only students who have given notice">
      <div class="stu-stat__top">
        <div class="stu-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg></div>
        <div class="stu-stat__label">On Notice</div>
      </div>
      <div class="stu-stat__val">${nCanc}</div>
      <div class="stu-stat__sub">Bed held till vacate date</div>
    </div>`:''}

    <div class="stu-stat stu-stat--click dh-slate" onclick="stuSetStatus('Left')" title="Show only students who have left">
      <div class="stu-stat__top">
        <div class="stu-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
        <div class="stu-stat__label">Left</div>
      </div>
      <div class="stu-stat__val">${nLeft}</div>
      <div class="stu-stat__sub">Students</div>
    </div>

    <div class="stu-stat stu-stat--click dh-red" onclick="stuSetStatus('Blacklisted')" title="Show only blacklisted students">
      <div class="stu-stat__top">
        <div class="stu-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></div>
        <div class="stu-stat__label">Blacklisted</div>
      </div>
      <div class="stu-stat__val">${nBlack}</div>
      <div class="stu-stat__sub">Students</div>
    </div>

    <div class="stu-stat stu-stat--click dh-violet" onclick="navigate('rooms')" title="Go to Rooms">
      <div class="stu-stat__top">
        <div class="stu-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M9 17h.01"/><path d="M15 9h.01"/><path d="M15 13h.01"/></svg></div>
        <div class="stu-stat__label">Occupied Rooms</div>
      </div>
      <div class="stu-stat__val">${occRooms}<small> / ${DB.rooms.length}</small></div>
      <div class="stu-stat__sub">${occPct}% occupied</div>
    </div>
  </div>

  <!-- ══ TOOLBAR ══ -->
  <div class="stu-panel">
    <div class="stu-tools">
      <div class="stu-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        <input id="search-students" placeholder="Search by name, father, ID, CNIC, phone, email, room, course…"
          value="${escHtml(studentFilter.search)}"
          oninput="capFirstChar(this);studentFilter.search=this.value;studentFilter.page=1;_dStudents()">
      </div>

      <select class="stu-select${studentFilter.month?' is-set':''}" onchange="stuSetMonth(this.value)" title="Show the roster for one month">
        <option value="" ${!studentFilter.month?'selected':''}>All months</option>
        ${_stuMonthOptions().map(k=>`<option value="${escHtml(k)}" ${studentFilter.month===k?'selected':''}>${escHtml(_stuMonthLabel(k))}</option>`).join('')}
      </select>

      <select class="stu-select${studentFilter.room!=='All'?' is-set':''}" onchange="studentFilter.room=this.value;studentFilter.page=1;renderPage('students')" title="Filter by room">
        <option value="All">All Rooms</option>
        ${roomNums.map(r=>`<option value="${escHtml(r)}" ${studentFilter.room===r?'selected':''}>Room ${escHtml(r)}</option>`).join('')}
      </select>

      <select class="stu-select${studentFilter.course!=='All'?' is-set':''}" onchange="studentFilter.course=this.value;studentFilter.page=1;renderPage('students')" title="Filter by course">
        <option value="All">All Courses</option>
        ${courses.map(c=>`<option value="${escHtml(c)}" ${studentFilter.course===c?'selected':''}>${escHtml(c)}</option>`).join('')}
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

      <div style="position:relative">
        <button class="stu-btn${activeFilters?' stu-btn--hue dh-blue':''}" onclick="stuTogglePop(event)" title="More filters">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>
          Filters${activeFilters?`<span class="stu-btn__count">${activeFilters}</span>`:''}
        </button>
        <div class="stu-pop" id="stu-pop" style="display:none">
          <div class="stu-pop__t">Active filters</div>
          <div class="stu-pop__row" style="cursor:default">Room: <b style="color:var(--text)">${studentFilter.room==='All'?'Any':escHtml(studentFilter.room)}</b></div>
          <div class="stu-pop__row" style="cursor:default">Course: <b style="color:var(--text)">${studentFilter.course==='All'?'Any':escHtml(studentFilter.course)}</b></div>
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

      <button class="stu-btn stu-btn--primary" style="margin-left:auto" onclick="exportStudentsCSV()" title="Export the current list to CSV">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        Export CSV
      </button>
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
        <thead><tr>
          <th style="width:36px"><input type="checkbox" ${_pg.slice.length>0&&_pg.slice.every(t=>stuSelected.has(t.id))?'checked':''} onclick="stuToggleAll(this.checked)" title="Select all on this page"></th>
          ${th('id','ID')}
          ${th('name','Student')}
          ${th('room','Room')}
          <th>Contact / Emergency</th>
          <th>CNIC</th>
          ${th('course','Course')}
          <th>Nationality</th>
          ${th('status','Status')}
          <th>Actions</th>
        </tr></thead>
        <tbody>
        ${_pg.slice.length===0?`<tr><td colspan="10"><div class="stu-empty">No students match these filters.</div></td></tr>`:
        _pg.slice.map(t=>{
          const room  = _roomById.get(t.roomId);
          const rtype = room ? getRoomType(room) : null;
          const picked= stuSelected.has(t.id);
          const nm    = String(t.name||'?');
          const ini   = nm.trim().split(/\s+/).slice(0,1).map(w=>w[0]||'').join('').toUpperCase()||'?';
          const photo = t.docs && t.docs.photo;
          const status= t.status||'Active';
          return `<tr class="${picked?'is-picked dh-blue':''}">
            <td onclick="event.stopPropagation()"><input type="checkbox" ${picked?'checked':''} onclick="stuToggleRow('${t.id}')"></td>
            <td><span class="stu-id">#${escHtml(t.id)}</span></td>
            <td onclick="showViewStudentModal('${t.id}')" style="cursor:pointer" title="Open full profile">
              <div class="stu-who">
                <div class="stu-who__av ${stuAvatarHue(nm)}">${photo?`<img src="${escHtml(photo)}" alt="">`:escHtml(ini)}</div>
                <div style="min-width:0">
                  <div class="stu-who__name">${escHtml(nm)}</div>
                  ${t.fatherName?`<div class="stu-who__sub">${escHtml(t.fatherName)}</div>`:''}
                </div>
              </div>
            </td>
            <td>
              <div class="stu-room__n">${room?'#'+escHtml(String(room.number)):'—'}</div>
              ${room?`<div class="stu-room__t">${escHtml(rtype?rtype.name:'')} · ${escHtml(room.floor||'')} Floor</div>`:''}
            </td>
            <td>
              <div class="stu-contact">${escHtml(t.phone||'—')}</div>
              ${t.emergencyPhone||t.emergencyContact?`<div class="stu-contact__em"><i>${waIcon}</i>${escHtml(t.emergencyPhone||t.emergencyContact)}</div>`:''}
            </td>
            <td>${t.cnic?`<span class="stu-contact">${escHtml(t.cnic)}</span>`:'<span class="stu-dash">—</span>'}</td>
            <td>${t.occupation||t.course?escHtml(t.occupation||t.course):'<span class="stu-dash">—</span>'}</td>
            <td>${t.nationality?escHtml(t.nationality):'<span class="stu-dash">—</span>'}</td>
            <td><span class="stu-pill ${stuStatusHue(status)}"><i></i>${escHtml(status)}</span></td>
            <td>
              <div class="stu-acts">
                <button class="stu-act dh-slate" onclick="event.stopPropagation();showViewStudentModal('${t.id}')" title="View profile"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/></svg></button>
                <button class="stu-act dh-blue"  onclick="event.stopPropagation();showEditStudentModal('${t.id}')" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                <button class="stu-act dh-red"   onclick="event.stopPropagation();confirmDeleteStudent('${t.id}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
              </div>
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
function stuSetStatus(s) {
  studentFilter.status = (studentFilter.status === s && s !== 'All') ? 'All' : s;
  studentFilter.page = 1;
  renderPage('students');
}
function stuResetFilters() {
  studentFilter.month=thisMonth(); studentFilter.status='All'; studentFilter.room='All'; studentFilter.course='All';
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
function stuBulkExport() {
  const ids = [...stuSelected];
  _stuWriteCsv(studentsFiltered().filter(t => ids.includes(t.id)), 'Students_Selected.csv');
}

// Single CSV writer, shared by the toolbar export and the bulk-selection
// export so the two can never produce different columns.
function _stuWriteCsv(list, filename) {
  const byId = _stuRoomMap();
  const rows = [['ID','Name','Father Name','Room','Floor','Phone','Emergency Contact',
                 'Emergency Phone','CNIC','Date of Birth','Gender','Nationality','Address',
                 'Course','Session','Blood Group','Join Date','Status']];
  list.forEach(t => {
    const r = byId.get(t.roomId);
    rows.push([t.id, t.name||'', t.fatherName||'', r?'#'+r.number:'', r?r.floor:'',
      t.phone||'', t.emergencyContact||'', t.emergencyPhone||'', t.cnic||'',
      t.dob||'', t.gender||'', t.nationality||'', t.address||'',
      t.occupation||t.course||'', t.session||'', t.bloodGroup||'',
      t.joinDate||'', t.status||'Active']);
  });
  downloadCSV(rows, filename);
}

// Export the currently filtered + sorted students. Reuses studentsFiltered(),
// so the file always matches what is on screen — the two previously kept
// separate copies of the filter and could disagree.
function exportStudentsCSV() {
  // The month belongs in the filename. The export is scoped to it now, and a
  // file called Students_All_2026-08-30.csv that actually holds only August's
  // roster is the kind of thing that gets mailed to an owner as if it were
  // everybody.
  const scope = studentFilter.month ? studentFilter.month : 'AllMonths';
  _stuWriteCsv(studentsFiltered(),
    'Students_'+(studentFilter.status==='All'?'All':studentFilter.status)+'_'+scope+'_'+today()+'.csv');
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
  _addStudentPresetRoom = presetRoomId || '';
  closeModal();              // harmless when nothing is open; clears a caller's modal
  navigate('addstudent');
}

function renderAddStudent() {
  const presetRoomId = _addStudentPresetRoom || '';
  const allRooms = roomsByNumber(DB.rooms);
  const preset = presetRoomId ? DB.rooms.find(r=>r.id===presetRoomId) : null;
  const presetType = preset ? getRoomType(preset) : null;
  const presetLabel = preset ? 'Room #'+preset.number+' · '+(presetType?presetType.name:'')+' · '+(preset.floor||'')+' Floor' : '';

  const sel = (id, label, opts, cur, req) => `
    <div class="sf-f">
      <label for="${id}">${label}${req?'<span class="req">*</span>':''}</label>
      <select class="sf-sel" id="${id}">
        ${opts.map(o=>`<option value="${escHtml(o)}" ${o===cur?'selected':''}>${escHtml(o||'—')}</option>`).join('')}
      </select>
    </div>`;

  return `
  <div class="sf-wrap">

    <!-- ══ PHOTO + STUDENT ID ══ -->
    <div class="sf-head">
      <div class="sf-photo-block">
        <div>
          <div style="font-size:11.5px;font-weight:600;color:var(--text2);margin-bottom:6px">Student Photo</div>
          <div class="sf-photo" id="add-student-photo-preview" onclick="triggerStudentPhotoUpload()" title="Click to upload a photo">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
          </div>
        </div>
        <div class="sf-photo-acts" style="margin-top:22px">
          <div class="sf-drop" id="sf-drop" onclick="triggerStudentPhotoUpload()"
               ondragover="event.preventDefault();this.classList.add('is-over')"
               ondragleave="this.classList.remove('is-over')"
               ondrop="sfDropPhoto(event)">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/></svg>
            <b>Upload Photo</b><span>or drag and drop</span>
          </div>
          <button type="button" class="sf-btn sf-btn--ghost" id="add-student-cam-btn" style="width:190px;justify-content:center" onclick="openAddStudentCamera()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>
            Take Photo
          </button>
          <button type="button" class="sf-btn" id="add-student-clear-btn" style="width:190px;justify-content:center;display:none;color:var(--red)" onclick="clearAddStudentPhoto()">Remove photo</button>
          <input type="file" id="add-student-photo-file" accept="image/*" style="display:none" onchange="loadAddStudentPhoto(this)">
          <input type="hidden" id="add-student-photo-data" value="">
          <div id="add-student-cam-box" style="display:none;width:190px">
            <video id="add-student-cam-video" autoplay playsinline style="width:100%;border-radius:10px;background:#000"></video>
            <canvas id="add-student-cam-canvas" style="display:none"></canvas>
            <div style="display:flex;gap:6px;margin-top:6px">
              <button type="button" class="sf-btn sf-btn--go" style="flex:1;justify-content:center;padding:0 10px" onclick="captureAddStudentPhoto()">Capture</button>
              <button type="button" class="sf-btn" style="flex:1;justify-content:center;padding:0 10px" onclick="closeAddStudentCamera()">Close</button>
            </div>
          </div>
        </div>
      </div>

      <div class="sf-idcard">
        <span class="sf-idcard__note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15h4"/><circle cx="16" cy="10" r="2"/></svg>
          ID will be auto-generated
        </span>
        <div class="sf-idcard__l">Student ID</div>
        <div class="sf-idcard__v">#${escHtml(nextStudentId())}</div>
      </div>
    </div>

    <!-- ══ STUDENT IDENTITY ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-12 0"/><circle cx="12" cy="8" r="5"/></svg>
        Student Identity
      </div>
      <div class="sf-grid">
        <div class="sf-f"><label for="f-tname">Full Name<span class="req">*</span></label>
          <input class="sf-in" id="f-tname" placeholder="Muhammad Ali" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
        <div class="sf-f"><label for="f-tfname">Father's Name<span class="req">*</span></label>
          <input class="sf-in" id="f-tfname" placeholder="Muhammad Ikram" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
        <div class="sf-f"><label for="f-tcnic">CNIC</label>
          <div class="sf-wrapin">
            <input class="sf-in" id="f-tcnic" placeholder="35202-1234567-1" maxlength="15" oninput="fmtCnic(this);sfCheckCnic()">
            <svg class="sf-ok" id="f-tcnic-ok" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
        </div>
      </div>
      <div class="sf-grid" style="margin-top:14px">
        <div class="sf-f"><label for="f-tdob">Date of Birth</label>
          <input class="sf-in" id="f-tdob" type="date"></div>
        ${sel('f-tgender','Gender',['','Male','Female','Other'],'')}
        ${sel('f-tmarital','Marital Status',['','Single','Married'],'Single')}
        ${sel('f-tnationality','Nationality',['Pakistani','Afghan','Other'],'Pakistani')}
      </div>
      <div class="sf-grid" style="margin-top:14px;grid-template-columns:1.4fr 1fr">
        <div class="sf-f"><label for="f-tocc">Course / Study Field</label>
          <div style="position:relative" id="f-tocc-wrap">
            <input class="sf-in" id="f-tocc" placeholder="BS Computer Science" autocomplete="off"
              oninput="courseAutocomplete(this)" onfocus="courseAutocomplete(this)" onkeydown="courseKeyNav(event)"
              onblur="setTimeout(()=>{const d=document.getElementById('course-suggestions');if(d)d.style.display='none';},200)">
            <div id="course-suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border2);border-radius:10px;z-index:600;max-height:200px;overflow-y:auto;box-shadow:var(--shadow);margin-top:4px"></div>
          </div>
          <input type="hidden" id="f-tocctype" value="Student">
          <input type="hidden" id="f-tocccustom" value="">
        </div>
        <div class="sf-f"><label for="f-tsession">Session / Semester</label>
          <input class="sf-in" id="f-tsession" placeholder="Fall 2026 / 1st Semester"></div>
      </div>
    </div>

    <!-- ══ CONTACT INFORMATION ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92"/></svg>
        Contact Information
      </div>
      <div class="sf-grid">
        <div class="sf-f"><label for="f-tphone">Phone Number<span class="req">*</span></label>
          <div style="display:flex"><span class="sf-prefix">+92</span>
            <input class="sf-in" id="f-tphone" placeholder="301 1234567" maxlength="12" oninput="fmtPhone(this)"></div>
        </div>
        <div class="sf-f"><label for="f-temerg">Emergency Contact</label>
          <input class="sf-in" id="f-temerg" placeholder="Ikram Khan (Father)"></div>
        <div class="sf-f"><label for="f-temergphone">Emergency Phone</label>
          <input class="sf-in" id="f-temergphone" placeholder="0300 1234567"></div>
        <div class="sf-f"><label for="f-temail">Email Address</label>
          <div class="sf-wrapin">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            <input class="sf-in" id="f-temail" type="text" placeholder="username" oninput="fmtEmail(this)" autocomplete="off">
            <span id="f-temail-hint" style="display:none;position:absolute;right:11px;font-size:12px;color:var(--text3);pointer-events:none">@gmail.com</span>
          </div>
        </div>
      </div>
      <div class="sf-grid" style="margin-top:14px">
        <div class="sf-f sf-f--wide"><label for="f-taddress">Home Address</label>
          <div class="sf-wrapin">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
            <input class="sf-in" id="f-taddress" placeholder="House # 25, Street 4, Peshawar, KPK, Pakistan"
              autocomplete="off" oninput="cityAutocomplete(this)" onblur="hideCitySuggestions()">
          </div>
          <div id="f-taddress-suggestions" class="city-suggestions"></div>
        </div>
      </div>
    </div>

    <!-- ══ HOSTEL INFORMATION ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M15 9h.01"/><path d="M15 13h.01"/></svg>
        Hostel Information
      </div>
      <div class="sf-grid sf-grid--5">
        <div class="sf-f"><label for="f-troom-search">Room<span class="req">*</span></label>
          <div style="position:relative">
            <input type="hidden" id="f-troom" value="${escHtml(presetRoomId)}">
            <input class="sf-in" id="f-troom-search" placeholder="Search room number, type or floor…" autocomplete="off"
              value="${escHtml(presetLabel)}"
              oninput="filterRoomSearch(this.value)" onfocus="filterRoomSearch(this.value)"
              onblur="setTimeout(()=>{const d=document.getElementById('room-search-drop');if(d)d.style.display='none';},180)">
            <div id="room-search-drop" class="sf-drop-list">
              ${allRooms.map(r=>{
                const rt=getRoomType(r); const occ=getRoomOccupancy(r);
                const free=roomFreeBeds(r); const vac=getRoomVacating(r);
                const isFull = free<=0;
                const lbl='Room #'+r.number+' · '+rt.name+' · '+r.floor+' Floor';
                // Show the monthly charge on each room so the warden sees the
                // price from Settings while picking, not first at the payment step.
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
          <div id="f-troom-selected-label" style="font-size:11px;color:var(--green);font-weight:700;margin-top:4px"></div>
        </div>
        <div class="sf-f"><label for="f-tbed">Bed / Seat</label>
          <select class="sf-sel" id="f-tbed">${sfBedOptions(preset)}</select></div>
        <div class="sf-f"><label for="f-tfloor">Floor</label>
          <input class="sf-in" id="f-tfloor" value="${escHtml(preset?(preset.floor||'')+' Floor':'')}" placeholder="Set by room" readonly style="background:var(--dash-sunk);color:var(--text3)"></div>
        <div class="sf-f"><label for="f-tjoin">Join Date<span class="req">*</span></label>
          <input class="sf-in" id="f-tjoin" type="date" value="${today()}"></div>
        <div class="sf-f"><label for="f-texpstay">Expected Stay Until</label>
          <input class="sf-in" id="f-texpstay" type="date"></div>
      </div>

      <input type="hidden" id="f-tpm" value="${escHtml(DB.settings.paymentMethods[0]||'Cash')}">
    </div>

    <!-- ══ ADDITIONAL INFORMATION ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        Additional Information
      </div>
      <div class="sf-grid" style="grid-template-columns:180px 1fr 1.4fr">
        ${sel('f-tblood','Blood Group',['','A+','A-','B+','B-','AB+','AB-','O+','O-'],'')}
        <div class="sf-f"><label for="f-tallergies">Allergies / Medical Condition</label>
          <input class="sf-in" id="f-tallergies" placeholder="No allergies"></div>
        <div class="sf-f"><label for="f-tnotes">Notes</label>
          <textarea class="sf-ta" id="f-tnotes" maxlength="250" rows="3"
            placeholder="Anything the warden should know about this student…"
            oninput="sfCount()"></textarea>
          <div class="sf-count" id="f-tnotes-count">0/250</div>
        </div>
      </div>
    </div>

    <!-- ══ ACTIONS ══ -->
    <div class="sf-foot">
      <button class="sf-btn" onclick="navigate('students')">Cancel</button>
      ${presetRoomId?`<button class="sf-btn" onclick="submitAddStudent('${escHtml(presetRoomId)}',true)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        Save &amp; Add Another</button>`:''}
      <button class="sf-btn" onclick="submitAddStudent('${escHtml(presetRoomId)}', false, true)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
        Save as Draft</button>
      <button class="sf-btn sf-btn--go" onclick="submitAddStudent('${escHtml(presetRoomId)}')">
        Save &amp; Proceed to Payment
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>
    </div>
  </div>`;
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
  const el = document.getElementById('sf-drop');
  if (el) el.classList.remove('is-over');
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
    docs: { photo: document.getElementById('add-student-photo-data')?.value || '' }
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
  const totalDue=payHistory.filter(p=>p.status==='Pending').reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
  const av=t.name?t.name[0].toUpperCase():'?';
  const paidCount=payHistory.filter(p=>p.status==='Paid').length;
  // Admission fee is stored on the payment that collected it, under either key
  // depending on the app version that wrote the row.
  const admPaid=payHistory.reduce((s,p)=>s+Number(p.admissionFee||p.fee||0),0);

  // One row of the Personal Information / Room & Accommodation lists. `act`
  // is an optional trailing affordance (call / mail) shown only when there is
  // a value to act on.
  const infoRow=(k,v,act)=>`<div class="svw-row">
      <span class="svw-row__k">${escHtml(k)}</span>
      <span class="svw-row__v${(v===null||v===undefined||v==='')?' is-empty':''}">${(v===null||v===undefined||v==='')?'—':escHtml(String(v))}</span>
      ${act&&v?`<span class="svw-row__act">${act}</span>`:''}
    </div>`;

  showModal('modal-xl',``,`
    <div class="svw">

      <!-- PROFILE HEADER -->
      <div class="svw-hero">
        <div class="svw-hero__av">
          ${t.docs?.photo ? `<img src="${t.docs.photo}" alt="">` : escHtml(av)}
        </div>
        <div class="svw-hero__id">
          <div class="svw-hero__name">${escHtml(t.name)}</div>
          <div class="svw-hero__no">#${escHtml(t.id)}</div>
          <div class="svw-hero__tags">
            ${statusBadge(t.status||'Active')}
            ${room?`<span class="badge badge-blue">Room #${escHtml(String(room.number))} · ${escHtml(rtype?.name||'')}</span>`:'<span class="badge badge-gray">No Room Assigned</span>'}
            <span class="badge badge-gray">${escHtml(t.paymentMethod||'Cash')}</span>
          </div>
        </div>
        <div class="svw-hero__rent">
          <div class="svw-hero__rentk">Monthly Rent</div>
          <div class="svw-hero__rentv">${fmtPKR(t.rent||0)}</div>
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
          ${infoRow('CNIC / ID',t.cnic)}
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
            const mRent=p.monthlyRent||p.totalRent||t.rent||0;
            const admFee=Number(p.admissionFee||p.fee||0);
            const extras=p.extraCharges||[];
            const conc=Number(p.concession||p.discount||0);
            let paidCell='<span class="svw-paid">'+fmtPKR(p.amount)+'</span>';
            if(admFee>0) paidCell+='<span class="svw-sub is-adm">+'+fmtPKR(admFee)+' admission</span>';
            extras.forEach(c=>{paidCell+='<span class="svw-sub is-extra">+'+fmtPKR(c.amount)+' '+escHtml(c.label||'')+'</span>';});
            if(conc>0) paidCell+='<span class="svw-sub is-conc">−'+fmtPKR(conc)+' concession</span>';
            return '<tr>'
            +'<td class="svw-t__month">'+escHtml(p.month||'—')+'</td>'
            +'<td class="svw-t__num">'+(mRent>0?fmtPKR(mRent):'<span class="is-empty">—</span>')+'</td>'
            +'<td class="svw-t__conc">'+(conc>0?'−'+fmtPKR(conc):'<span class="is-empty">—</span>')+'</td>'
            +'<td>'+paidCell+'</td>'
            +'<td class="svw-t__unpaid'+((p.unpaid||0)>0?' is-due':'')+'">'+((p.unpaid||0)>0?fmtPKR(p.unpaid||0):'<span class="is-empty">—</span>')+'</td>'
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
              <th>Month</th><th>Monthly Rent</th><th>Concession</th><th>Paid (+Extras)</th>
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
            <td><span class="badge badge-gray">Rm #${escHtml(String(s.fromRoomNumber))}</span></td>
            <td><span class="badge badge-blue">Rm #${escHtml(String(s.toRoomNumber))}</span></td>
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
    ${t.status==='Active'?`<button class="btn btn-danger" onclick="closeModal();quickCancelStudent('${id}')">${icon('error','sm')} Cancel Seat</button>`:''}
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
    if(prev) prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
    if(data) data.value = e.target.result;
    const clr = document.getElementById('add-student-clear-btn'); if(clr) clr.style.display='';
    toast('Photo loaded','success');
  };
  reader.readAsDataURL(file);
}
function clearAddStudentPhoto() {
  const prev = document.getElementById('add-student-photo-preview');
  if(prev) prev.innerHTML = '🧑‍🎓';
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
  if(prev) prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
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
    if(prev) prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
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
  if(prev) prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
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

async function quickCancelStudent(studentId) {
  const student = DB.students.find(s=>s.id===studentId);
  if(!student){ toast('Student not found','error'); return; }
  // Check if already in cancellation list
  const existing = (DB.cancellations||[]).find(c=>c.studentId===studentId&&c.status==='Pending');
  if(existing){ toast(`${student.name} is already in the cancellation list`,'error'); return; }
  const room = DB.rooms.find(r=>r.id===student.roomId);
  const type = room?getRoomType(room):null;
  const endOfMonth = (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); d.setDate(0); return ymd(d); })();
  if(!DB.cancellations) DB.cancellations=[];
  DB.cancellations.push({
    id: uid(),
    studentId: student.id,
    studentName: student.name,
    roomId: student.roomId||'',
    roomNumber: room?room.number:'—',
    roomType: type?type.name:'—',
    requestDate: today(),
    vacateDate: endOfMonth,
    reason: 'Student requested cancellation',
    status: 'Pending',
    createdAt: today()
  });
  student.status = 'Cancelling';
  await saveDB();
  toast(`${student.name} added to cancellation list. Seat is now vacant.`, 'success');
  if(currentPage==='dashboard') renderPage('dashboard');
}

function printStudentCard(id) {
  const t=DB.students.find(x=>x.id===id); if(!t) return;
  const room=DB.rooms.find(r=>r.id===t.roomId);
  const rtype=room?DB.settings.roomTypes.find(x=>x.id===room.typeId):null;
  const payHistory=DB.payments.filter(p=>p.studentId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const totalPaid=payHistory.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount),0);
  const totalDue=payHistory.filter(p=>p.status==='Pending').reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount||0)),0);
  const _cardHtml = `<!DOCTYPE html><html><head><title>Student Profile — ${escHtml(t.name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;padding:32px;font-size:13px}
    .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #7c3aed;margin-bottom:24px}
    .hostel-name{font-size:22px;font-weight:800;color:#1a1a2e}
    .hostel-sub{font-size:12px;color:#666;margin-top:3px}
    .report-badge{background:#7c3aed22;border:1px solid #7c3aed55;color:#6d28d9;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700}
    .profile-hero{background:linear-gradient(135deg,#0d1b2a,#1a2d4a);border-radius:12px;padding:24px;margin-bottom:20px;display:flex;align-items:center;gap:20px;color:#fff}
    .avatar{width:64px;height:64px;border-radius:14px;background:#7c3aed33;border:2px solid #7c3aed88;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#7c3aed;flex-shrink:0}
    .badges{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    .badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
    .badge-green{background:#dcfce7;color:#166534}
    .badge-blue{background:#dbeafe;color:#1e40af}
    .badge-gold{background:#fef9c3;color:#5b21b6}
    .section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:16px}
    .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:12px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .info-item label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2px}
    .info-item .val{font-size:13px;font-weight:600;color:#1e293b}
    .stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
    .stat-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
    .stat-box .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
    .stat-box .val{font-size:18px;font-weight:800;color:#1e293b}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f1f5f9;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700}
    td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
    tr:last-child td{border-bottom:none}
    .paid{color:#16a34a;font-weight:700}
    .overdue{color:#dc2626;font-weight:700}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{padding:16px}}
  </style></head><body>
  <div class="header">
    <div><div class="hostel-name">${escHtml(t.name)}</div><div class="hostel-sub">${escHtml(DB.settings.hostelName)} · ${escHtml(DB.settings.location||'')}</div></div>
    <div class="report-badge">Student Profile Report</div>
  </div>
  <div class="profile-hero">
    <div class="avatar">${escHtml(t.name[0].toUpperCase())}</div>
    <div>
      <div style="font-size:20px;font-weight:800">${escHtml(t.name)}</div>
      <div style="font-size:12px;opacity:0.6;font-family:monospace;margin-top:2px">#${t.id}</div>
      <div class="badges">
        <span class="badge badge-${t.status==='Active'?'green':'blue'}">${t.status}</span>
        ${room?`<span class="badge badge-gold">Room #${room.number} · ${rtype?.name||''}</span>`:''}
      </div>
    </div>
  </div>
  <div class="stats-row">
    <div class="stat-box"><div class="lbl">Total Paid</div><div class="val" style="color:#16a34a;font-size:15px">${fmtPKR(totalPaid)}</div></div>
    <div class="stat-box"><div class="lbl">Outstanding</div><div class="val" style="color:${totalDue>0?'#dc2626':'#16a34a'};font-size:15px">${fmtPKR(totalDue)}</div></div>
    <div class="stat-box"><div class="lbl">Amt. Paid (Adm.)</div><div class="val" style="font-size:15px">${fmtPKR(t.deposit||0)}</div></div>
    <div class="stat-box"><div class="lbl">Payments</div><div class="val">${payHistory.filter(p=>p.status==='Paid').length}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
    <div class="section">
      <div class="section-title">${icon('student','sm')} Personal Information</div>
      <div class="info-grid">
        ${[['Father/Guardian',t.fatherName],['CNIC / ID',t.cnic],['Nationality',t.nationality],['Phone Number',t.phone],['Email',t.email],['Home Address',t.address],['Emergency Contact',t.emergencyContact],['Join Date',fmtDate(t.joinDate)]].map(([k,v])=>`<div class="info-item"><label>${k}</label><div class="val">${escHtml(v||'—')}</div></div>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="section-title">🏠 Room & Accommodation</div>
      <div class="info-grid">
        ${room?[['Room Number','#'+room.number],['Room Type',rtype?.name||'—'],['Floor',room.floor||'—'],['Capacity',rtype?.capacity+' beds'||'—'],['Amenities',(room.amenities||[]).join(', ')||'—']].map(([k,v])=>`<div class="info-item"><label>${k}</label><div class="val">${v}</div></div>`).join(''):'<p style="color:#94a3b8">No room assigned</p>'}
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">💳 Payment History</div>
    ${payHistory.length?`<table><thead><tr><th>Month</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th><th>Notes</th></tr></thead><tbody>
    ${payHistory.map(p=>{
      const _admF=Number(p.admissionFee||p.fee||0);
      const _extras=(p.extraCharges||[]);
      const _conc=Number(p.concession||p.discount||0);
      const _extraHTML=_admF>0?`<div style='font-size:10px;color:#1e40af'>🎓 +${fmtPKR(_admF)} adm.</div>`:'';
      const _xHTML=_extras.map(x=>`<div style='font-size:10px;color:#b45309'>+${fmtPKR(x.amount)} ${escHtml(x.label||'')}</div>`).join('');
      const _concHTML=_conc>0?`<div style='font-size:10px;color:#dc2626'>−${fmtPKR(_conc)} concession</div>`:'';
      return `<tr><td>${escHtml(p.month||'—')}</td><td class="${p.status==='Paid'?'paid':'overdue'}">${fmtPKR(p.amount)}${_extraHTML}${_xHTML}${_concHTML}</td><td>${escHtml(p.method||'—')}</td><td class="${p.status==='Paid'?'paid':'overdue'}">${escHtml(p.status)}</td><td>${fmtDate(p.date)||'—'}</td><td style="color:#94a3b8">${escHtml(p.notes||'—')}</td></tr>`;
    }).join('')}
    </tbody></table>`:'<p style="color:#94a3b8;text-align:center;padding:12px">No payment records</p>'}
  </div>
  <div class="footer">Generated ${new Date().toLocaleDateString()} · ${escHtml(DB.settings.hostelName)} Management System · ${escHtml(DB.settings.location||'')}</div>
  </body></html>`;
  var _cardName = 'Student_' + (t.name||'Profile').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'') + '_' + today() + '.pdf';
  _electronPDF(_cardHtml, _cardName, { pageSize: 'A4' });
}
function showEditStudentModal(id) {
  const t=DB.students.find(x=>x.id===id); if(!t) return;
  const allRooms=roomsByNumber(DB.rooms.filter(r=>r.id===t.roomId||roomFreeBeds(r)>0));
  const pmOpts=DB.settings.paymentMethods.map(m=>`<option ${t.paymentMethod===m?'selected':''}>${escHtml(m)}</option>`).join('');
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
  showModal('modal-lg',`Edit Student — ${escHtml(t.name)}`,`
  <div class="sf-wrap sf-wrap--modal">

    <!-- ══ PHOTO + STUDENT ID ══ -->
    <div class="sf-head">
      <div class="sf-photo-block">
        <div>
          <div style="font-size:11.5px;font-weight:600;color:var(--text2);margin-bottom:6px">Student Photo</div>
          <div class="sf-photo" id="edit-student-photo-preview" onclick="document.getElementById('edit-student-photo-file').click()" title="Click to upload a photo">
            ${t.docs?.photo
              ? `<img src="${t.docs.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
              : `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`}
          </div>
        </div>
        <div class="sf-photo-acts" style="margin-top:22px">
          <div class="sf-drop" onclick="document.getElementById('edit-student-photo-file').click()"
               ondragover="event.preventDefault();this.classList.add('is-over')"
               ondragleave="this.classList.remove('is-over')"
               ondrop="event.preventDefault();this.classList.remove('is-over');var f=event.dataTransfer.files[0];if(f){var i=document.getElementById('edit-student-photo-file');i.files=event.dataTransfer.files;loadEditStudentPhoto(i);}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/></svg>
            <b>Upload Photo</b><span>or drag and drop</span>
          </div>
          <button type="button" class="sf-btn sf-btn--ghost" style="width:190px;justify-content:center" onclick="openEditStudentCamera()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>
            Take Photo
          </button>
          <button type="button" class="sf-btn" id="edit-student-clear-btn" style="width:190px;justify-content:center;color:var(--red);display:${t.docs?.photo?'flex':'none'}" onclick="clearEditStudentPhoto()">Remove photo</button>
          <input type="file" id="edit-student-photo-file" accept="image/*" style="display:none" onchange="loadEditStudentPhoto(this)">
          <input type="hidden" id="edit-student-photo-data" value="${escHtml(t.docs?.photo||'')}">
          <div id="edit-student-cam-box" style="display:none;width:190px">
            <video id="edit-student-cam-video" autoplay playsinline style="width:100%;border-radius:10px;background:#000"></video>
            <canvas id="edit-student-cam-canvas" style="display:none"></canvas>
            <div style="display:flex;gap:6px;margin-top:6px">
              <button type="button" class="sf-btn sf-btn--go" style="flex:1;justify-content:center;padding:0 10px" onclick="captureEditStudentPhoto()">Capture</button>
              <button type="button" class="sf-btn" style="flex:1;justify-content:center;padding:0 10px" onclick="closeEditStudentCamera()">Close</button>
            </div>
          </div>
        </div>
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

    <!-- ══ STUDENT IDENTITY ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-12 0"/><circle cx="12" cy="8" r="5"/></svg>
        Student Identity
      </div>
      <div class="sf-grid">
        <div class="sf-f"><label for="f-tname">Full Name<span class="req">*</span></label>
          <input class="sf-in" id="f-tname" value="${escHtml(t.name)}" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
        <div class="sf-f"><label for="f-tfname">Father's Name</label>
          <input class="sf-in" id="f-tfname" value="${escHtml(t.fatherName||'')}" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
        <div class="sf-f"><label for="f-tcnic">CNIC</label>
          <input class="sf-in" id="f-tcnic" value="${escHtml(t.cnic||'')}" placeholder="35202-1234567-1" maxlength="15" oninput="fmtCnic(this)"></div>
      </div>
      <div class="sf-grid" style="margin-top:14px;grid-template-columns:1.4fr 1fr 1fr">
        <div class="sf-f"><label for="f-tocc">Course / Study Field</label>
          <input class="sf-in" id="f-tocc" value="${escHtml(t.occupation||t.course||'')}" placeholder="BS Computer Science"></div>
        <div class="sf-f"><label for="f-tstat">Status</label>
          <select class="sf-sel" id="f-tstat">${statSel}</select></div>
        <div class="sf-f"><label for="f-tjoin">Join Date</label>
          <input class="sf-in" id="f-tjoin" type="date" value="${escHtml(t.joinDate||'')}"></div>
      </div>
    </div>

    <!-- ══ CONTACT INFORMATION ══ -->
    <div class="sf-sec">
      <div class="sf-sec__h">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92"/></svg>
        Contact Information
      </div>
      <div class="sf-grid">
        <div class="sf-f"><label for="f-tphone">Phone Number</label>
          <input class="sf-in" id="f-tphone" value="${escHtml(t.phone||'')}" placeholder="03XX XXXXXXX" maxlength="12" oninput="fmtPhone(this)"></div>
        <div class="sf-f"><label for="f-temerg">Emergency Contact</label>
          <input class="sf-in" id="f-temerg" value="${escHtml(t.emergencyContact||'')}" placeholder="Guardian / family phone"></div>
        <div class="sf-f"><label for="f-temail">Email Address</label>
          <input class="sf-in" id="f-temail" value="${escHtml(t.email||'')}" placeholder="email@gmail.com"></div>
      </div>
      <div class="sf-grid" style="margin-top:14px">
        <div class="sf-f sf-f--wide"><label for="f-taddress">Home Address</label>
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
          Assign Room<span class="req">*</span>
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
        Notes
      </div>
      <div class="sf-grid">
        <div class="sf-f sf-f--wide">
          <textarea class="sf-ta" id="f-tnotes" rows="3" placeholder="Anything the warden should know about this student…">${escHtml(t.notes||'')}</textarea>
        </div>
      </div>
    </div>

  </div>`,
  `<button class="btn btn-danger" onclick="confirmDeleteStudent('${id}')">Delete</button><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEditStudent('${id}')">Save Changes</button>`);
}

async function submitEditStudent(id) {
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
  const _owed = _pays.reduce((s,p) => s + Number(p.unpaid  || 0), 0);
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
function showRoomShiftModal(studentId) {
  const t = DB.students.find(x => x.id === studentId);
  if (!t) return;
  const fromRoom = DB.rooms.find(r => r.id === t.roomId);

  // Available rooms: not the current room, and must have a free bed
  const available = DB.rooms.filter(r => {
    if (r.id === t.roomId) return false;
    const type = getRoomType(r);
    return roomFreeBeds(r) > 0;
  });

  if (!available.length) {
    toast('No other rooms have available capacity right now.', 'error');
    return;
  }

  const roomOpts = available.map(r => {
    const type = getRoomType(r);
    const occ  = getRoomOccupancy(r);
    return `<option value="${r.id}">#${escHtml(String(r.number))} — ${escHtml(type.name)} · ${escHtml(r.floor)} Floor (${escHtml(roomAvailLabel(r))})</option>`;
  }).join('');

  showModal('modal-md', '🔀 Shift Student to Another Room', `
    <!-- Current info banner -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:18px;display:flex;align-items:center;gap:14px">
      <div style="font-size:24px">🧑‍🎓</div>
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--text)">${escHtml(t.name)}</div>
        <div style="font-size:12px;color:var(--text3)">Currently in <strong style="color:var(--accent-strong)">Room #${escHtml(String(fromRoom ? fromRoom.number : '?'))}</strong></div>
      </div>
    </div>

    <div class="form-grid">
      <div class="field col-full">
        <label>New Room *</label>
        <select class="form-control" id="shift-new-room">
          <option value="">— Select Room —</option>${roomOpts}
        </select>
      </div>
      <div class="field">
        <label>Shift Date</label>
        <input class="form-control cdp-trigger" id="shift-date" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}">
      </div>
      <div class="field col-full">
        <label>Reason / Notes</label>
        <textarea class="form-control" id="shift-reason" rows="2" placeholder="e.g. Student requested single room, maintenance issue…"></textarea>
      </div>
    </div>

    <div style="background:var(--amber-dim);border:1px solid rgba(240,160,48,0.3);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text2);margin-top:4px">
      ${icon('warning','sm')} Shifting will update the student's room assignment and adjust all future payment records. Past payments stay unchanged.
    </div>
  `,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-primary" onclick="submitRoomShift('${studentId}')">🔀 Confirm Shift</button>`
  );
}

async function submitRoomShift(studentId) {
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
      p.monthlyRent = newRent;
      // Recalculate unpaid using new rent if not yet partially paid
      if (!p.amount || p.amount === 0) {
        p.amount  = 0;
        p.unpaid  = newRent;
      }
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
let payFilter = {status:'All', method:'All', room:'All', month:'All', search:'',
                 showAll:false, unpaidOnly:false, arrears:true, pageSize:30,
                 page:1, sortKey:null, sortDir:'asc'};
let paySelected = new Set();

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
    const pendRecs   = payHistory.filter(p=>p.status==='Pending');
    const totalPend  = pendRecs.reduce((sum,p)=>sum+(p.unpaid!=null?Number(p.unpaid):Number(p.amount||0)),0);
    const histBadge  = totalPend>0?`<span style="background:rgba(255,77,109,0.15);color:var(--red);border:1px solid rgba(255,77,109,0.3);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700">${icon('warning','sm')} ${pendRecs.length} pending · ${fmtPKR(totalPend)}</span>`:payHistory.length?`<span style="background:rgba(46,201,138,0.1);color:var(--green);border:1px solid rgba(46,201,138,0.2);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700">${icon('checkmark','xs')} All clear</span>`:`<span style="background:var(--bg4);color:var(--text3);border-radius:6px;padding:2px 8px;font-size:10px">No history</span>`;
    const recentRows = payHistory.slice(0,4).map(p=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="color:var(--text3)">${escHtml(p.month||fmtDate(p.date)||'—')}</span><span style="color:${p.status==='Paid'?'var(--green)':'var(--red)'};font-weight:700">${fmtPKR(p.amount)}</span><span style="color:${p.status==='Paid'?'var(--green)':'var(--red)'}">${p.status==='Paid'?icon('checkmark','xs'):'⏳'}</span></div>`).join('');
    return `<div id="fsr-${s.id}" style="background:var(--bg3);border:1px solid var(--border2);border-radius:12px;padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;gap:13px">
        <div style="width:44px;height:44px;border-radius:11px;background:var(--accent-dim);color:var(--accent-strong);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;flex-shrink:0">${escHtml((s.name||'?')[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:4px">${escHtml(s.name||'—')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;margin-bottom:8px">
            ${s.phone?`<div style="font-size:11px;color:var(--text3)">📞 ${escHtml(s.phone)}</div>`:''}
            ${s.cnic?`<div style="font-size:11px;color:var(--text3)">🪪 ${escHtml(s.cnic)}</div>`:''}
            ${s.fatherName?`<div style="font-size:11px;color:var(--text3)">👨 ${escHtml(s.fatherName)}</div>`:''}
            ${s.email?`<div style="font-size:11px;color:var(--text3)">✉️ ${escHtml(s.email)}</div>`:''}
            ${s.occupation?`<div style="font-size:11px;color:var(--text3)">💼 ${escHtml(s.occupation)}</div>`:''}
            ${(s.lastRoom||s.roomNumber)?`<div style="font-size:11px;color:var(--accent-strong);font-weight:600">🏠 Former Rm #${escHtml(String(s.lastRoom||s.roomNumber||'—'))}</div>`:''}
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

function openRestoreStudentForm(studentId) {
  const t = DB.students.find(x=>x.id===studentId); if(!t) return;
  const availRooms = roomsByNumber(_getAvailableRooms());
  const roomOpts = availRooms.map(r=>{ const type=getRoomType(r); return `<option value="${r.id}">Room #${escHtml(String(r.number))} — ${escHtml(type?.name||'')} (${getRoomOccupancy(r)}/${type?.capacity||1} filled)</option>`; }).join('');
  const pmOpts = DB.settings.paymentMethods.map(m=>`<option ${t.paymentMethod===m?'selected':''}>${escHtml(m)}</option>`).join('');
  const today = ymd(new Date());
  const thisMonthKey = today.slice(0,7);
  const payHistory = DB.payments.filter(p=>p.studentId===t.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const totalPaid = payHistory.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount||0),0);
  const pendRecs  = payHistory.filter(p=>p.status==='Pending');
  const totalPend = pendRecs.reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount||0)),0);
  const histRows  = payHistory.slice(0,6).map((p,i)=>`<tr style="border-top:1px solid var(--border);background:${i%2?'var(--bg3)':'transparent'}"><td style="padding:7px 10px;font-weight:600;font-size:11px">${escHtml(p.month||'—')}</td><td style="padding:7px 10px;color:var(--green);font-weight:700;font-size:11px">${fmtPKR(p.amount)}</td><td style="padding:7px 10px;color:${(p.unpaid||0)>0?'var(--red)':'var(--text3)'};font-weight:700;font-size:11px">${(p.unpaid||0)>0?fmtPKR(p.unpaid):'—'}</td><td style="padding:7px 10px;font-size:11px">${escHtml(p.method||'—')}</td><td style="padding:7px 10px;font-size:11px;color:${p.status==='Paid'?'var(--green)':'var(--red)'};font-weight:700">${p.status==='Paid'?icon('checkmark','xs'):'⏳'} ${p.status}</td><td style="padding:7px 10px;font-size:10px;color:var(--text3)">${fmtDate(p.date)||'—'}</td></tr>`).join('');

  showModal('modal-lg', `<span style="color:var(--green)">🔄 Restore — ${escHtml(t.name)}</span>`,
    `<div style="font-size:12px;color:var(--text3);margin-bottom:14px;background:var(--green-dim);border:1px solid rgba(46,201,138,0.25);border-radius:8px;padding:10px 14px">All previous details are pre-filled. Update the room and payment details.</div>
    ${payHistory.length?`<div style="margin-bottom:16px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;overflow:hidden">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="font-size:12px;font-weight:700;color:var(--blue)">📋 Past Payment History</div>
        <div style="display:flex;gap:8px">
          <span style="font-size:11px;font-weight:700;color:var(--green)">Paid: ${fmtPKR(totalPaid)}</span>
          ${totalPend>0?`<span style="font-size:11px;font-weight:700;color:var(--red);background:rgba(255,77,109,0.1);padding:2px 8px;border-radius:5px">${icon('warning','sm')} Past pending: ${fmtPKR(totalPend)}</span>`:`<span style="font-size:11px;color:var(--green)">${icon('checkmark','xs')} No past dues</span>`}
        </div>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--bg4)"><th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Month</th><th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Paid</th><th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Unpaid</th><th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Method</th><th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Status</th><th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Date</th></tr></thead>
        <tbody>${histRows}</tbody>
      </table></div>
      ${payHistory.length>6?`<div style="padding:7px 14px;font-size:10px;color:var(--text3);border-top:1px solid var(--border)">Showing 6 of ${payHistory.length} records</div>`:''}
    </div>`:''}
    <div class="form-grid">
      <input type="hidden" id="rs-studentId" value="${escHtml(t.id)}">
      <div class="field"><label>Full Name</label><input class="form-control" id="rs-name" value="${escHtml(t.name||'')}" style="text-transform:capitalize" oninput="autoCapName(this)"></div>
      <div class="field"><label>Father Name</label><input class="form-control" id="rs-fname" value="${escHtml(t.fatherName||'')}" style="text-transform:capitalize" oninput="autoCapName(this)"></div>
      <div class="field"><label>CNIC</label><input class="form-control" id="rs-cnic" value="${escHtml(t.cnic||'')}" placeholder="XXXXX-XXXXXXX-X" maxlength="15" oninput="fmtCnic(this)"></div>
      <div class="field"><label>Phone</label><input class="form-control" id="rs-phone" value="${escHtml(t.phone||'')}"></div>
      <div class="field"><label>Email</label><input class="form-control" id="rs-email" value="${escHtml(t.email||'')}"></div>
      <div class="field"><label>Occupation</label><input class="form-control" id="rs-occ" value="${escHtml(t.occupation||'')}"></div>
      <div class="field col-full"><label>Home Address</label><input class="form-control" id="rs-address" value="${escHtml(t.address||'')}"></div>
      <div class="field"><label>Emergency Contact</label><input class="form-control" id="rs-emerg" value="${escHtml(t.emergencyContact||'')}"></div>
      <div class="field"><label>Re-join Date</label><input class="form-control cdp-trigger" id="rs-join" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today}"></div>
      <div class="field col-full" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px"><div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:10px">🏠 New Room Assignment</div></div>
      <div class="field col-full"><label>Assign Room *</label><select class="form-control" id="rs-room" onchange="rsRecalc()"><option value="">— Select available room —</option>${roomOpts}</select><div style="font-size:11px;color:var(--text3);margin-top:4px">Monthly charge (room rent + mess) is taken from the room's configured rate in Settings.</div></div>
      <div class="field col-full" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px"><div style="font-size:12px;font-weight:700;color:var(--accent-strong);margin-bottom:10px">${icon('money')} First Month Payment</div></div>
      <div class="field"><label>Payment Month</label><input class="form-control" id="rs-month" type="text" value="${thisMonthLabel()}" oninput="rsCheckMonthDuplicate('${t.id}',this.value)" placeholder="e.g. March 2026"></div>
      <div class="field"><label>Payment Method</label><select class="form-control" id="rs-pm">${pmOpts}</select></div>
      <div id="rs-month-warning" class="field col-full" style="display:none"></div>
      <div class="field col-full" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--red)">➕ Extra Charges</div>
          <button type="button" onclick="rsAddExtraRow()" style="background:var(--red-dim);border:1px solid rgba(255,77,109,0.3);color:var(--red);border-radius:7px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer">+ Add Charge</button>
        </div>
        <div id="rs-extra-list"></div>
      </div>
      <div class="field col-full" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px"><div style="font-size:12px;font-weight:700;color:var(--teal);margin-bottom:10px">🎁 Concession / Discount</div></div>
      <div class="field"><label>Concession Amount (PKR)</label><input class="form-control" id="rs-concession" type="number" min="0" placeholder="0" oninput="rsRecalc()"></div>
      <div class="field"><label>Concession Reason</label><input class="form-control" id="rs-conc-reason" placeholder="e.g. Loyalty discount…"></div>
      <!-- Net Payable summary -->
      <div class="field col-full">
        <div id="rs-total-box" style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:12px 16px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
          <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Monthly Charge</div><div id="rs-tot-rent">${moneyValue(0,{size:"body",color:"var(--blue)"})}</div></div>
          <div style="color:var(--border2);font-size:20px">+</div>
          <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Extra Charges</div><div id="rs-tot-extra">${moneyValue(0,{size:"body",color:"var(--red)"})}</div></div>
          <div style="color:var(--border2);font-size:20px">−</div>
          <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Concession</div><div id="rs-tot-conc">${moneyValue(0,{size:"body",color:"var(--teal)"})}</div></div>
          <div style="color:var(--border2);font-size:20px">=</div>
          <div style="background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.3);border-radius:8px;padding:8px 14px">
            <div style="font-size:10px;color:var(--accent-strong);text-transform:uppercase;letter-spacing:.6px;font-weight:700">Net Payable</div>
            <div id="rs-tot-net">${moneyValue(0,{size:"section",color:"var(--accent-strong)"})}</div>
          </div>
        </div>
      </div>
      <div class="field col-full" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px"><div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:10px">✍️ Payment Entry</div></div>
      <div class="field"><label>Amount Paid (PKR)</label><input class="form-control" id="rs-amount" type="number" placeholder="Leave empty to skip" oninput="rsRecalc()"></div>
      <div class="field"><label>Pending / Unpaid (PKR)</label><input class="form-control" id="rs-pending" type="number" min="0" placeholder="Auto-calculated" oninput="this.dataset.manual=1"><div style="font-size:10px;color:var(--text3);margin-top:4px">Auto: Net − Amount Paid. Override if needed.</div></div>
      <div class="field"><label>Payment Status</label><select class="form-control" id="rs-pstatus" onchange="rsRecalc()"><option value="Paid">✅ Paid</option><option value="Pending">⏳ Pending</option></select></div>
      <div class="field"><label>Notes</label><input class="form-control" id="rs-notes" placeholder="Optional note…"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="submitRestoreStudent('${studentId}')">🔄 Restore &amp; Save</button>`
  );
  // Run duplicate-month check immediately for the default month
  setTimeout(function(){ rsCheckMonthDuplicate('${t.id}', document.getElementById('rs-month')?.value); }, 80);
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
    warn.innerHTML = '<div style="background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.3);border-radius:9px;padding:10px 14px;font-size:12px;color:var(--accent-strong);font-weight:600">' + icon('warning','sm') + ' This student has a <strong>Pending</strong> payment of <strong>' + fmtPKR(pending.unpaid || pending.amount) + '</strong> for <strong>' + monthVal + '</strong>. Submitting will add a new record — consider updating the existing one instead.</div>';
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
  return resolveCharges({ roomId, mess: st ? st.mess : undefined, messOptIn: st ? st.messOptIn : undefined });
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
  const t=DB.students.find(x=>x.id===studentId); if(!t) return;
  const roomId=document.getElementById('rs-room').value;
  if(!roomId){toast('Please select a room','error');return;}
  const room=DB.rooms.find(r=>r.id===roomId);
  const rsCharges=resolveCharges({ roomId, mess:t.mess, messOptIn:t.messOptIn });
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

  // Sort all students by name
  var allStudents = DB.students.slice().sort(function(a,b){return (a.name||'').localeCompare(b.name||'');});

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
    var pendingAmt = mPays.filter(function(p){return p.status==='Pending';}).reduce(function(acc,p){return acc+(p.unpaid!=null?Number(p.unpaid):Number(p.amount||0));},0);
    var admFee     = mPays.reduce(function(acc,p){return acc+Number(p.admissionFee||p.fee||0);},0);
    var extraTotal = mPays.reduce(function(acc,p){return acc+(p.extraTotal!=null&&Number(p.extraTotal)>0?Number(p.extraTotal):(p.extraCharges||[]).reduce(function(x,c){return x+Number(c.amount||0);},0));},0);
    var concession = mPays.reduce(function(acc,p){return acc+Number(p.concession||p.discount||0);},0);

    var hasRecord   = mPays.length > 0;
    var statusTxt   = !hasRecord ? '—' : pendingAmt>0 ? 'Partial' : 'Paid ✓';
    var statusCls   = !hasRecord ? 'p-none' : pendingAmt>0 ? 'p-part' : 'p-paid';
    var sCls        = s.status==='Active' ? 'p-act' : s.status==='Left' ? 'p-left' : 'p-other';
    // Zebra striping is a :nth-child rule in the stylesheet now, not a colour
    // computed per row and pasted onto every <tr>.

    grandRent    += Number(s.rent||0);
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
    rows += '<td class="mono">'+escHtml(s.cnic||'—')+'</td>';
    rows += '<td class="ph">'+escHtml(s.phone||'—')+'</td>';
    rows += '<td class="money rent">'+fmtPKR(s.rent||0)+'</td>';
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
  html += '@page{size:A4 landscape;margin:7mm 9mm}@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  html += 'body{font-family:"Segoe UI",-apple-system,Roboto,Arial,sans-serif;background:#fff;color:#0f172a;padding:14px 18px;font-size:10.5px}';
  html += '@media print{body{padding:3px 4px;font-size:9.5px}.no-print{display:none!important}}';
  // This document opens in its own window with none of the app's stylesheets,
  // so icon() SVGs would fall back to the replaced-element default of 300×150
  // and tear the layout apart. Same rules the visit sheet carries.
  html += 'svg.icon{width:14px;height:14px;flex-shrink:0;vertical-align:-2px}';
  html += 'svg.icon-xs{width:11px;height:11px}svg.icon-sm{width:13px;height:13px}';

  // ── Header
  html += '.hdr{display:flex;justify-content:space-between;align-items:flex-end;';
  html += 'border-bottom:2px solid #1e293b;padding-bottom:9px;margin-bottom:12px}';
  html += '.hdr h1{font-size:21px;font-weight:900;letter-spacing:-.02em}';
  html += '.hdr .sub{display:flex;align-items:center;gap:4px;font-size:10px;color:#64748b;margin-top:3px}';
  html += '.hdr .kicker{margin-top:5px;font-size:9.5px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:1.6px}';
  html += '.hdr .date{text-align:right}';
  html += '.hdr .date .d{display:flex;align-items:center;justify-content:flex-end;gap:5px;font-size:12px;font-weight:800;color:#1e293b}';
  html += '.hdr .date .h{font-size:9px;color:#94a3b8;margin-top:3px}';

  // ── Summary tiles. Eight across a landscape page, so the value sits at 15px
  //    and every label is one line — the old ones broke on a <br> mid-phrase.
  html += '.summary{display:flex;gap:6px;margin-bottom:12px}';
  html += '.sbox{flex:1;min-width:0;display:flex;align-items:center;gap:7px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 9px}';
  html += '.sbox .ico{width:26px;height:26px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center}';
  html += '.sbox .v{display:block;font-size:15px;font-weight:900;line-height:1.15;white-space:nowrap}';
  html += '.sbox .l{display:block;font-size:7.5px;text-transform:uppercase;letter-spacing:.9px;color:#94a3b8;font-weight:700;margin-top:1px;white-space:nowrap}';
  html += '.sbox.t-slate .ico{background:#e2e8f0;color:#475569}.sbox.t-slate .v{color:#0f172a}';
  html += '.sbox.t-green .ico{background:#dcfce7;color:#16a34a}.sbox.t-green .v{color:#15803d}';
  html += '.sbox.t-gray  .ico{background:#f1f5f9;color:#94a3b8}.sbox.t-gray  .v{color:#64748b}';
  html += '.sbox.t-blue  .ico{background:#dbeafe;color:#2563eb}.sbox.t-blue  .v{color:#1d4ed8}';
  html += '.sbox.t-red   .ico{background:#fee2e2;color:#dc2626}.sbox.t-red   .v{color:#b91c1c}';
  html += '.sbox.t-amber .ico{background:#fef3c7;color:#b45309}.sbox.t-amber .v{color:#b45309}';

  // ── Roster table
  html += 'table{width:100%;border-collapse:collapse;table-layout:fixed}';
  html += 'col.c-no{width:3%}col.c-name{width:13%}col.c-father{width:10%}col.c-room{width:4%}col.c-cnic{width:11%}col.c-phone{width:8%}col.c-rent{width:7%}col.c-adm{width:7%}col.c-ext{width:8%}col.c-conc{width:8%}col.c-paid{width:8%}col.c-pend{width:7%}col.c-fst{width:7%}col.c-sst{width:6%}';
  html += 'thead th{background:#f1f5f9;color:#475569;padding:7px 5px;text-align:left;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;border:1px solid #e2e8f0;word-break:break-word}';
  html += 'thead th.r{text-align:right}thead th.c{text-align:center}';
  html += 'td{padding:6px 5px;border:1px solid #e2e8f0;word-break:break-word;vertical-align:middle;font-size:10px}';
  html += 'tbody tr:nth-child(even) td{background:#f8fafc}';
  html += 'td.c{text-align:center}td.r{text-align:right}';
  html += 'td.no{text-align:center;font-weight:700;color:#94a3b8}';
  html += 'td.nm{font-weight:700;color:#0f172a}';
  html += 'td.fa{color:#475569}';
  html += 'td.rm{text-align:center;font-weight:800;color:#b45309}';
  html += 'td.mono{font-family:Consolas,"Courier New",monospace;font-size:9.5px;color:#475569}';
  html += 'td.ph{color:#475569}';
  html += 'td.money{text-align:right;font-weight:800}';
  html += 'td.rent{color:#15803d}td.paid{color:#15803d}td.pend{color:#b91c1c}';
  html += 'td.adm{color:#1d4ed8;font-weight:700}td.ext{color:#b45309;font-weight:700}td.conc{color:#0f766e;font-weight:700}';
  html += 'td.nil{color:#cbd5e1;font-weight:400}';
  html += '.pill{display:inline-block;padding:2px 7px;border-radius:20px;font-size:9px;font-weight:800;white-space:nowrap}';
  html += '.p-paid{background:#dcfce7;color:#15803d}.p-part{background:#fee2e2;color:#b91c1c}';
  html += '.p-none{background:#f1f5f9;color:#94a3b8}';
  html += '.p-act{background:#dcfce7;color:#15803d}.p-left{background:#f1f5f9;color:#64748b}.p-other{background:#fee2e2;color:#b91c1c}';

  // ── Totals band — the ink bar the eye lands on, matching the visit sheet's
  //    floor header rather than inventing a third dark shade.
  html += 'tr.totals td{background:#0f172a!important;border:1px solid #1e293b;padding:8px 5px;color:#cbd5e1;font-weight:900}';
  html += 'tr.totals td.lbl{font-size:12px;color:#fff;text-align:left}';
  html += 'tr.totals td.lbl span{font-weight:400;font-size:10px;color:#94a3b8}';
  // .r before .g/.rd — same specificity, so source order decides which colour
  // the collected and pending figures keep.
  html += 'tr.totals td.r{text-align:right;color:#fff}';
  html += 'tr.totals td.g{color:#86efac}tr.totals td.rd{color:#fca5a5}tr.totals td.dim{color:#64748b;font-weight:400;font-size:9px;text-align:center}';
  html += 'tr.totals td.note{color:#94a3b8;font-weight:400;font-size:10px;text-align:center}';

  // ── Outgoings register
  html += '.outgo{margin-top:16px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px}';
  html += '.outgo h2{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:9px}';
  html += '.cat{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;color:#0f172a;margin:11px 0 5px}';
  html += '.cat .n{font-size:8.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#64748b;background:#f1f5f9;border-radius:20px;padding:2px 8px}';
  html += 'table.exp{font-size:10.5px}';
  html += 'table.exp th{background:#f1f5f9;color:#475569;padding:6px 10px;border:1px solid #e2e8f0;text-align:left;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}';
  html += 'table.exp th.r{text-align:right}';
  html += 'table.exp td{padding:5px 10px;border:1px solid #e2e8f0}';
  html += 'table.exp td.amt{text-align:right;font-weight:800;color:#b91c1c}';
  html += 'table.exp td.dsc{color:#475569}';
  html += 'table.exp tr.sub td{background:#f8fafc!important;font-weight:900;color:#0f172a}';
  html += 'table.exp tr.sub td.amt{color:#b91c1c}';
  html += 'table.grand td{background:#0f172a;border:1px solid #1e293b;padding:7px 10px;font-weight:900;color:#fff;font-size:10.5px}';
  html += 'table.grand td.amt{text-align:right;color:#fca5a5}';

  html += '.footer{margin-top:12px;padding-top:7px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center}';
  html += '.footer .gen{font-size:9px;color:#94a3b8}';
  html += '.footer .tally{font-size:10px;color:#475569;font-weight:600}';
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
  var _pdfPending=DB.payments.filter(function(p){return p.status==='Pending'&&_payMatchesMonth(p,monthKey);}).reduce(function(s,p){return s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount||0));},0);
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
  html += '<th class="r">Rent/Mo</th>';
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

  // ── Open PDF in a separate window via main process ────────────────────────
  var _pdfTitle = escHtml(hostel) + ' — Students Fee Report · ' + monthLabel;
  if (window.electronAPI && window.electronAPI.openPdfWindow) {
    window.electronAPI.openPdfWindow(html, _pdfTitle);
  } else {
    var w = window.open('', '_blank', 'width=1000,height=700');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  }
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

  recalcStudentUnpaid();
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
  if(etEl) etEl.textContent = 'PKR ' + Number(extra).toLocaleString('en-PK');
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