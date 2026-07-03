/* ─── HOSTIX — STUDENTS MODULE ─────────────────────────────────────────────
   Contains: renderStudents, showAddStudentModal, submitAddStudent,
             showViewStudentModal, showEditStudentModal, submitEditStudent,
             confirmDeleteStudent, showRoomShiftModal, submitRoomShift,
             photo upload/camera, quickCancelStudent,
             printStudentCard, downloadAllStudentsPDF, formerStudents flow,
             filterRoomSearch, pickRoomSearch, extra charge helpers
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function renderStudents() {
  // PERF: build a roomId → room lookup once, instead of DB.rooms.find() per student row.
  const _roomById = new Map(DB.rooms.map(r=>[r.id, r]));
  let students = DB.students.filter(t=>{
    if(studentFilter.status!=='All' && t.status!==studentFilter.status) return false;
    if(studentFilter.search){
      const s=studentFilter.search.toLowerCase();
      const room4s = _roomById.get(t.roomId);
      if(![t.name,t.fatherName,t.id,t.cnic,t.phone,t.email,t.address,t.emergencyContact,t.occupation||t.course,room4s?.number&&String(room4s.number),room4s?.floor].some(f=>f&&String(f).toLowerCase().includes(s))) return false;
    }
    return true;
  });

  if(students.length===0 && DB.students.length===0) return `
    <div class="empty-state">
      <div class="icon">${icon('student','sm')}</div>
      <h3>No Students Yet</h3>
      <p style="margin-bottom:16px">Add your first student to get started</p>
      <button class="btn btn-primary" onclick="showAddStudentModal()">+ Add Student</button>
    </div>`;

  students = applySort(students, studentFilter, {
    id:     t => t.id,
    name:   t => t.name,
    room:   t => { const r = _roomById.get(t.roomId); return r ? r.number : ''; },
    rent:   t => Number(t.rent || 0),
    status: t => t.status
  });
  const _pg = paginate(students, studentFilter);

  return `
  <div class="filter-bar">
    <div class="search-wrap">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" /></svg>
      <input class="form-control" id="search-students" placeholder="Name, father, ID, CNIC, phone, email, room, floor, course…" value="${escHtml(studentFilter.search)}" oninput="capFirstChar(this);studentFilter.search=this.value;studentFilter.page=1;_dStudents();toggleClearBtn('search-students','clear-students')">
      <button class="search-clear ${studentFilter.search?'visible':''}" id="clear-students" onclick="studentFilter.search='';studentFilter.page=1;document.getElementById('search-students').value='';this.classList.remove('visible');renderPage('students')" title="Clear">✕</button>
    </div>
    <div class="filter-tabs">
      ${['All','Active','Left','Blacklisted'].map(s=>`<button class="ftab ${studentFilter.status===s?'active':''}" onclick="studentFilter.status='${s}';studentFilter.page=1;renderPage('students')">${s}</button>`).join('')}
    </div>
    <span class="text-muted" style="font-size:12px;margin-left:auto">${students.length} students</span>
    <button class="btn btn-secondary btn-sm" onclick="exportStudentsCSV()" title="Export current list to CSV" style="white-space:nowrap">📥 CSV</button>
  </div>
  <div class="table-wrap">
    <table style="font-size:12px;border-collapse:collapse">
      <thead><tr>
        ${sortableTh(studentFilter,'studentFilter','students','id','ID','style="width:60px;padding:8px 8px"')}
        ${sortableTh(studentFilter,'studentFilter','students','name','Student','style="min-width:140px;padding:8px 8px"')}
        ${sortableTh(studentFilter,'studentFilter','students','room','Room','style="min-width:110px;padding:8px 8px"')}
        <th style="min-width:120px;padding:8px 8px">Phone / Emergency</th>
        <th style="min-width:120px;padding:8px 8px">CNIC</th>
        <th style="min-width:120px;padding:8px 8px">Address</th>
        <th style="min-width:100px;padding:8px 8px">Course</th>
        ${sortableTh(studentFilter,'studentFilter','students','rent','Rent/Mo','style="min-width:80px;padding:8px 8px"')}
        ${sortableTh(studentFilter,'studentFilter','students','status','Status','style="min-width:70px;padding:8px 8px"')}
        <th class="col-actions" style="min-width:90px;padding:8px 8px">Actions</th>
      </tr></thead>
      <tbody>
        ${students.length===0?`<tr><td colspan="10" style="text-align:center;color:var(--text3);padding:30px">No students match filters</td></tr>`:
        _pg.slice.map(t=>{
          const room=_roomById.get(t.roomId);
          const av=t.name?t.name[0].toUpperCase():'?';
          return `<tr style="cursor:pointer" onclick="showViewStudentModal('${t.id}')" title="Click row to view full profile">
            <td style="font-family:var(--font-mono);font-size:11px;font-weight:800;color:var(--gold2);text-align:center;padding:8px 4px">#${escHtml(t.id)}</td>
            <td style="padding:8px 6px"><div class="td-name"><div class="avatar" style="background:var(--bg3);color:var(--accent);width:30px;height:30px;font-size:13px">${av}</div><div><div style="font-weight:600;color:var(--blue)">${escHtml(t.name)}</div><div style="font-size:10px;color:var(--text3)">${escHtml(t.fatherName||'')}</div></div></div></td>
            <td style="padding:8px 6px"><span class="text-gold fw-700">${room?'#'+room.number:'—'}</span><div class="td-sub" style="font-size:10px">${room?getRoomType(room).name:'—'} · ${room?room.floor+' Fl':'—'}</div></td>
            <td style="padding:8px 6px;font-size:12px">${escHtml(t.phone||'—')}${t.emergencyContact?'<div style="font-size:10px;color:var(--text3);margin-top:2px">🆘 '+escHtml(t.emergencyContact)+'</div>':''}</td>
            <td style="padding:8px 6px;font-family:var(--font-mono);font-size:11px;color:var(--text2)">${escHtml(t.cnic||'—')}</td>
            <td style="padding:8px 6px;font-size:11px;color:var(--text2)">${escHtml(t.address||'—')}</td>
            <td style="padding:8px 6px;font-size:11px;color:var(--text2)">${escHtml(t.occupation||t.course||'—')}</td>
            <td style="padding:8px 6px" class="text-green fw-700">${fmtPKR(t.rent)}</td>
            <td style="padding:8px 6px">${statusBadge(t.status||'Active')}</td>
            <td class="col-actions" style="padding:8px 4px">
              <div style="display:flex;gap:3px;flex-wrap:nowrap;white-space:nowrap">
                <button class="btn btn-secondary btn-icon btn-sm" onclick="event.stopPropagation();showViewStudentModal('${t.id}')" title="View Profile" style="padding:4px 7px;font-size:11px">👁</button>
                <button class="btn btn-secondary btn-icon btn-sm" onclick="event.stopPropagation();showRoomShiftModal('${t.id}')" title="Shift Room" style="color:var(--blue);padding:4px 7px;font-size:11px">🔀</button>
                <button class="btn btn-danger btn-icon btn-sm" onclick="event.stopPropagation();confirmDeleteStudent('${t.id}')" title="Delete" style="padding:4px 7px;font-size:11px">🗑</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  ${renderPager(_pg, 'studentFilter', 'students')}`;
}

// Export the currently filtered + sorted students to CSV. (Mirrors renderStudents' filter/sort.)
function exportStudentsCSV() {
  const _roomById = new Map(DB.rooms.map(r=>[r.id, r]));
  let students = DB.students.filter(t=>{
    if(studentFilter.status!=='All' && t.status!==studentFilter.status) return false;
    if(studentFilter.search){
      const s=studentFilter.search.toLowerCase();
      const room4s = _roomById.get(t.roomId);
      if(![t.name,t.fatherName,t.id,t.cnic,t.phone,t.email,t.address,t.emergencyContact,t.occupation||t.course,room4s?.number&&String(room4s.number),room4s?.floor].some(f=>f&&String(f).toLowerCase().includes(s))) return false;
    }
    return true;
  });
  students = applySort(students, studentFilter, {
    id:t=>t.id, name:t=>t.name,
    room:t=>{ const r=_roomById.get(t.roomId); return r?r.number:''; },
    rent:t=>Number(t.rent||0), status:t=>t.status
  });
  const rows=[['ID','Name','Father Name','Room','Floor','Phone','Emergency','CNIC','Address','Course','Rent/Mo','Status']];
  students.forEach(t=>{
    const r=_roomById.get(t.roomId);
    rows.push([t.id,t.name||'',t.fatherName||'',r?'#'+r.number:'',r?r.floor:'',t.phone||'',t.emergencyContact||'',t.cnic||'',t.address||'',t.occupation||t.course||'',t.rent||0,t.status||'Active']);
  });
  downloadCSV(rows, 'Students_'+(studentFilter.status==='All'?'All':studentFilter.status)+'_'+today()+'.csv');
}

function showAddStudentModal(presetRoomId='') {
  const availRooms = DB.rooms.filter(r=>{ const t=getRoomType(r); return getRoomOccupancy(r)<t.capacity; });
  // Fix #10: ALL rooms shown — full rooms are included with a warning flag
  const allRooms = DB.rooms;
  const roomOpts = allRooms.map(r=>{
    const t=getRoomType(r); const occ=getRoomOccupancy(r); const isFull=occ>=t.capacity;
    return `<option value="${r.id}" ${r.id===presetRoomId?'selected':''}>#${r.number} · ${t.name} · ${r.floor} Floor (${occ}/${t.capacity} occ.)${isFull?' ⚠ FULL':''}</option>`;
  }).join('');
  const pmOpts = DB.settings.paymentMethods.map(m=>`<option value="${m}">${m}</option>`).join('');
  showModal('modal-xl','➕ Add New Student',`
  <style>
  .as-section{background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px}
  .as-section-title{font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold2);margin-bottom:12px;display:flex;align-items:center;gap:6px}
  .room-card{border:2px solid var(--border);border-radius:10px;padding:10px 12px;cursor:pointer;transition:all 0.15s;background:var(--card);text-align:center;min-width:0}
  .room-card:hover{border-color:var(--gold2);background:var(--bg4)}
  .room-card.selected{border-color:var(--gold2);background:rgba(200,168,75,0.12);box-shadow:0 0 0 2px rgba(200,168,75,0.3)}
  .room-card .rc-num{font-size:18px;font-weight:900;color:var(--gold2);line-height:1}
  .room-card .rc-type{font-size:9px;color:var(--text3);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
  .room-card .rc-occ{font-size:10px;font-weight:700;margin-top:4px}
  .room-card .rc-rent{font-size:10px;color:var(--text3);margin-top:1px}
  </style>

  <!-- PHOTO BANNER at top -->
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;padding:14px 16px;background:linear-gradient(135deg,var(--bg3),var(--bg4));border:1px solid var(--border2);border-radius:12px">
    <div id="add-student-photo-preview" style="width:72px;height:86px;border-radius:12px;border:2px dashed rgba(200,168,75,0.5);background:rgba(200,168,75,0.07);display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0;overflow:hidden;cursor:pointer" onclick="triggerStudentPhotoUpload()" title="Click to upload photo">🧑‍🎓</div>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:800;color:var(--gold2);margin-bottom:8px">📸 Student Photo <span style="font-size:10px;color:var(--text3);font-weight:400">(optional)</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary btn-sm" onclick="triggerStudentPhotoUpload()" style="font-size:11px">📁 Upload</button>
        <button type="button" class="btn btn-secondary btn-sm" id="add-student-cam-btn" onclick="openAddStudentCamera()" style="font-size:11px">📷 Camera</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="clearAddStudentPhoto()" style="font-size:11px;display:none" id="add-student-clear-btn">✕ Remove</button>
      </div>
      <input type="file" id="add-student-photo-file" accept="image/*" style="display:none" onchange="loadAddStudentPhoto(this)">
      <div id="add-student-cam-box" style="display:none;margin-top:8px">
        <video id="add-student-cam-video" autoplay playsinline style="width:100%;max-height:120px;border-radius:8px;background:#000"></video>
        <canvas id="add-student-cam-canvas" style="display:none"></canvas>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button type="button" class="btn btn-primary btn-sm" style="flex:1;font-size:11px" onclick="captureAddStudentPhoto()">📸 Capture</button>
          <button type="button" class="btn btn-secondary btn-sm" style="flex:1;font-size:11px" onclick="closeAddStudentCamera()">✕ Close</button>
        </div>
      </div>
      <input type="hidden" id="add-student-photo-data" value="">
    </div>
  </div>

  <!-- SECTION 1: IDENTITY -->
  <div class="as-section">
    <div class="as-section-title">${icon('student','sm')} Student Identity</div>
    <div class="form-grid" style="gap:12px">
      <div class="field"><label>Full Name *</label><input class="form-control" id="f-tname" placeholder="Muhammad Ali" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
      <div class="field"><label>Father Name *</label><input class="form-control" id="f-tfname" placeholder="Muhammad Khan" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
      <div class="field"><label>CNIC</label><input class="form-control" id="f-tcnic" placeholder="XXXXX-XXXXXXX-X" maxlength="15" oninput="fmtCnic(this)"></div>
      <div class="field"><label>Course / Study Field</label>
        <div style="position:relative" id="f-tocc-wrap">
          <input class="form-control" id="f-tocc" placeholder="e.g. BS Computer Science, MBBS, BBA…"
            oninput="courseAutocomplete(this)"
            onfocus="courseAutocomplete(this)"
            onkeydown="courseKeyNav(event)"
            onblur="setTimeout(()=>{const d=document.getElementById('course-suggestions');if(d)d.style.display='none';},200)"
            autocomplete="off">
          <div id="course-suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border2);border-radius:8px;z-index:9999;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.5);margin-top:2px"></div>
        </div>
        <input type="hidden" id="f-tocctype" value="Student">
        <input type="hidden" id="f-tocccustom" value="">
      </div>
    </div>
  </div>

  <!-- SECTION 2: CONTACT -->
  <div class="as-section">
    <div class="as-section-title">📞 Contact Information</div>
    <div class="form-grid" style="gap:12px">
      <div class="field"><label>Phone Number *</label>
        <input class="form-control" id="f-tphone" placeholder="03XX-XXXXXXX" maxlength="12" oninput="fmtPhone(this)">
      </div>
      <div class="field"><label>Emergency Contact</label>
        <input class="form-control" id="f-temerg" placeholder="03XX-XXXXXXX (Guardian/Family)">
      </div>
      <div class="field"><label>Email Address</label>
        <div style="position:relative;min-width:0">
          <input class="form-control" id="f-temail" type="text" placeholder="username" oninput="fmtEmail(this)" autocomplete="off" style="padding-right:90px">
          <span id="f-temail-hint" style="display:none;position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--text3);pointer-events:none;white-space:nowrap">@gmail.com</span>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">Type username — @gmail.com added automatically</div>
      </div>
      <div class="field col-full"><label>Home Address</label>
        <input class="form-control" id="f-taddress" placeholder="e.g. House #12, Street 4, Peshawar" autocomplete="off" oninput="cityAutocomplete(this)" onblur="hideCitySuggestions()" list="">
        <div id="f-taddress-suggestions" class="city-suggestions"></div>
      </div>
    </div>
  </div>

  <!-- SECTION 3: ASSIGN ROOM search -->
  <div class="as-section">
    <div class="as-section-title" style="justify-content:space-between">
      <span>🏠 Assign Room *</span>
      <span id="f-troom-selected-label" style="font-size:11px;color:var(--green);font-weight:700"></span>
    </div>
    <input type="hidden" id="f-troom" value="${presetRoomId||''}">
    <div style="position:relative">
      <input class="form-control" id="f-troom-search" placeholder="🔍 Search by room number, type, floor…" autocomplete="off"
        value="${(()=>{if(!presetRoomId)return '';const r=DB.rooms.find(x=>x.id===presetRoomId);if(!r)return '';const rt=getRoomType(r);return 'Room #'+r.number+' · '+rt.name+' · '+r.floor+' Floor';})()||''}"
        oninput="filterRoomSearch(this.value)" onfocus="filterRoomSearch(this.value)" onblur="setTimeout(()=>{const d=document.getElementById('room-search-drop');if(d)d.style.display='none';},180)">
      <div id="room-search-drop" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius-sm);z-index:500;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4);margin-top:4px">
        ${allRooms.map(r=>{
          const rt=getRoomType(r); const occ=getRoomOccupancy(r); const free=rt.capacity-occ;
          const isFull = occ >= rt.capacity;
          const lbl='Room #'+r.number+' · '+rt.name+' · '+r.floor+' Floor';
          const occColor=isFull?'var(--red)':free<=1?'var(--amber)':'var(--green)';
          return '<div class="room-search-item" data-id="'+r.id+'" data-rent="'+(parseFloat(r.rent)||16000)+'"'
            +' data-label="'+lbl+'"'
            +' style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.1s'+(isFull?';background:rgba(224,82,82,0.05)':'')+'"'
            +' onmouseover="this.style.background=\'var(--bg4)\'" onmouseout="this.style.background=\''+(isFull?'rgba(224,82,82,0.05)':'')+'\'}"'
            +' onmousedown="pickRoomSearch(\''+r.id+'\','+(parseFloat(r.rent)||16000)+',\''+lbl+'\')">'
            +'<div>'
            +'<span style="font-size:15px;font-weight:900;color:var(--gold2)">Room #'+r.number+'</span>'
            +'<span style="font-size:11px;color:var(--text3);margin-left:8px">'+rt.name+' · '+r.floor+' Floor</span>'
            +(isFull?'<span style="font-size:10px;font-weight:800;color:var(--red);margin-left:8px;background:rgba(224,82,82,0.15);padding:1px 6px;border-radius:20px">⚠ FULL</span>':'')
            +'</div>'
            +'<div style="text-align:right">'
            +'<div style="font-size:11px;font-weight:700;color:'+occColor+'">'+occ+'/'+rt.capacity+' occ · '+(isFull?'<span style=\'color:var(--red)\'>Over capacity</span>':free+' free')+'</div>'
            +'<div style="font-size:11px;color:var(--text3)">'+fmtPKR(parseFloat(r.rent)||0)+'/mo</div>'
            +'</div></div>';
        }).join('')}
        ${allRooms.length===0?'<div style="padding:14px;color:var(--text3);font-size:12px;text-align:center">No rooms configured</div>':''}
      </div>
    </div>
  </div>

  <!-- hidden stay-detail inputs so submitAddStudent still works -->
  <input type="hidden" id="f-trent" value="${presetRoomId?(parseFloat(DB.rooms.find(r=>r.id===presetRoomId)?.rent)||DB.settings.roomTypes[0]?.defaultRent||16000):DB.settings.roomTypes[0]?.defaultRent||16000}">
  <input type="hidden" id="f-tjoin" value="${today()}">
  <input type="hidden" id="f-tpm" value="${DB.settings.paymentMethods[0]||'Cash'}">

  <!-- SECTION 5: NOTES (collapsible) -->
  <div class="as-section" style="margin-bottom:0">
    <div class="as-section-title" style="cursor:pointer;justify-content:space-between;margin-bottom:0" onclick="const b=document.getElementById('opt-body');const a=document.getElementById('opt-arrow');b.style.display=b.style.display==='none'?'block':'none';a.textContent=b.style.display==='none'?'▶ Show':'▼ Hide'">
      <span>📝 Notes</span>
      <span id="opt-arrow" style="font-size:10px;color:var(--text3);font-weight:600">▶ Show</span>
    </div>
    <div id="opt-body" style="display:none;margin-top:12px">
      <div class="field"><label>Notes</label><textarea class="form-control" id="f-tnotes" placeholder="Additional notes…" rows="2"></textarea></div>
    </div>
  </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>${presetRoomId?'<button class="btn btn-secondary" onclick="submitAddStudent(\''+presetRoomId+'\',true)">✚ Save & Add Another</button>':''}<button class="btn btn-secondary" onclick="submitAddStudent('${presetRoomId}', false, true)">💾 Save</button><button class="btn btn-primary" onclick="submitAddStudent('${presetRoomId}')">💰 Save &amp; Proceed to Payment</button>`);
}
async function submitAddStudent(presetRoomId='', addAnother=false, saveOnly=false) {
  const name=document.getElementById('f-tname').value.trim();
  const roomId=document.getElementById('f-troom').value;
  // Derive rent from selected room if hidden input not yet updated
  const selectedRoomForRent = DB.rooms.find(r=>r.id===roomId);
  const rentFromRoom = selectedRoomForRent ? (parseFloat(selectedRoomForRent.rent)||DB.settings.roomTypes[0]?.defaultRent||16000) : (DB.settings.roomTypes[0]?.defaultRent||16000);
  const rentEl = document.getElementById('f-trent');
  const rent = parseFloat(rentEl?.value) || rentFromRoom;
  if(!name||!roomId||!rent){toast('Fill all required fields','error');return;}
  const joinDate = document.getElementById('f-tjoin').value || today();
  const payMethod = document.getElementById('f-tpm').value;
  const t={
    id:nextStudentId(), name, fatherName:document.getElementById('f-tfname').value.trim(),
    cnic:document.getElementById('f-tcnic').value.trim(),
    phone:document.getElementById('f-tphone').value.trim(), email:getEmailValue(),
    occupation: document.getElementById('f-tocc')?.value?.trim()||'',
    roomId, rent,
    deposit: 0,
    admissionFee: 0,
    joinDate, paymentMethod: payMethod,
    emergencyContact:document.getElementById('f-temerg').value.trim(), address:document.getElementById('f-taddress')?.value.trim()||'', notes:document.getElementById('f-tnotes').value.trim(),
    status:'Active', createdAt:today(),
    docs: { photo: document.getElementById('add-student-photo-data')?.value || '' }
  };
  // Fix #10: Capacity guard — warn warden but allow force-add with confirmation
  const selectedRoom = DB.rooms.find(r => r.id === roomId);
  if (selectedRoom) {
    const roomType = getRoomType(selectedRoom);
    if (roomType && getRoomOccupancy(selectedRoom) >= roomType.capacity) {
      const currentOcc = getRoomOccupancy(selectedRoom);
      showConfirm(
        '⚠️ Room Is At Full Capacity',
        `Room #${selectedRoom.number} (${roomType.name}) already has ${currentOcc}/${roomType.capacity} students. Do you want to force-add ${name} anyway? Room capacity display will remain at ${roomType.capacity} but this room will show as over-capacity.`,
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
            closeModal(); renderPage('students');
            toast('✅ ' + name + ' added (over capacity).','success');
          } else {
            closeModal(); renderPage('students');
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

// Opens the Add Payment modal and pre-selects the newly added student
function openPaymentForNewStudent(studentId) {
  showAddPaymentModal();
  setTimeout(function(){ selectStudentForPayment(studentId); }, 120);
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
  showModal('modal-xl',``,`
    <!-- PROFILE HEADER -->
    <div style="background:linear-gradient(135deg,var(--bg3),var(--bg4));border-radius:12px;padding:24px;margin-bottom:20px;display:flex;align-items:center;gap:20px;border:1px solid var(--border2)">
      <div style="width:72px;height:72px;border-radius:18px;background:var(--bg2);border:2px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:var(--accent);flex-shrink:0;overflow:hidden">
        ${t.docs?.photo ? `<img src="${t.docs.photo}" style="width:100%;height:100%;object-fit:cover">` : av}
      </div>
      <div style="flex:1">
        <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1.2">${escHtml(t.name)}</div>
        <div style="font-size:12px;color:var(--text3);font-family:var(--font-mono);margin-top:3px">#${escHtml(t.id)}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          ${statusBadge(t.status||'Active')}
          ${room?`<span class="badge badge-gold">Room #${room.number} · ${escHtml(rtype?.name||'')}</span>`:'<span class="badge badge-gray">No Room Assigned</span>'}
          <span class="badge badge-blue">${escHtml(t.paymentMethod||'Cash')}</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Monthly Rent</div>
        <div>${moneyValue(t.rent,{size:"display",color:"var(--green)"})}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Adm. Paid: ${fmtPKR(t.deposit||0)}</div>
      </div>
    </div>

    <!-- STATS ROW -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Total Paid</div>
        <div style="font-size:20px;font-weight:800;color:var(--green)">${fmtPKR(totalPaid)}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Outstanding</div>
        <div style="font-size:20px;font-weight:800;color:${totalDue>0?'var(--red)':'var(--green)'}">${fmtPKR(totalDue)}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Join Date</div>
        <div style="font-size:15px;font-weight:700;color:var(--text)">${fmtDate(t.joinDate)}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Payments Made</div>
        <div style="font-size:20px;font-weight:800;color:var(--blue)">${payHistory.filter(p=>p.status==='Paid').length}</div>
      </div>
    </div>

    <!-- PERSONAL INFO GRID -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gold2);margin-bottom:14px;display:flex;align-items:center;gap:6px">${icon('student','sm')} Personal Information</div>
        ${[['Father / Guardian',t.fatherName],['Occupation / Course',t.occupation],['CNIC / ID',t.cnic],['Phone Number',t.phone],['Email Address',t.email],['Emergency Contact',t.emergencyContact]].map(([k,v])=>`
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:11.5px;color:var(--text3);flex-shrink:0;width:130px">${k}</span>
          <span style="font-size:13px;font-weight:600;color:var(--text);text-align:right">${escHtml(v||'—')}</span>
        </div>`).join('')}
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:14px;display:flex;align-items:center;gap:6px">🏠 Room & Accommodation</div>
        ${room?[['Room Number','#'+room.number],['Room Type',rtype?.name||'—'],['Floor',room.floor||'—'],['Capacity',rtype?.capacity+' beds'||'—'],['Amenities',(room.amenities||[]).join(', ')||'—'],['Room Notes',room.notes||'None']].map(([k,v])=>`
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:11.5px;color:var(--text3);flex-shrink:0;width:130px">${k}</span>
          <span style="font-size:13px;font-weight:600;color:var(--text);text-align:right">${escHtml(String(v))}</span>
        </div>`).join('') : '<div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">No room assigned</div>'}
      </div>
    </div>

    ${t.notes?`<div style="background:var(--amber-dim);border:1px solid rgba(240,160,48,0.25);border-radius:10px;padding:14px;margin-bottom:20px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--amber);margin-bottom:6px">📝 Notes</div><div style="font-size:13px;color:var(--text2)">${escHtml(t.notes)}</div></div>`:''}

    <!-- PAYMENT HISTORY TABLE -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--blue)">💳 Full Payment History (${payHistory.length} records)</div>
        <div style="display:flex;gap:6px">
          <span style="font-size:12px;color:var(--green)">Paid: ${fmtPKR(totalPaid)}</span>
          ${totalDue>0?`<span style="font-size:12px;color:var(--red)">Due: ${fmtPKR(totalDue)}</span>`:''}
        </div>
      </div>
      ${payHistory.length?(()=>{
        const _st=DB.students.find(s=>s.id===id);
        const rows=payHistory.map((p,i)=>{
          const mRent=p.monthlyRent||p.totalRent||_st?.rent||0;
          const admFee=Number(p.admissionFee||p.fee||0);
          const extras=p.extraCharges||[];
          const conc=Number(p.concession||p.discount||0);
          let paidCell='<span style="font-weight:800;color:var(--green)">'+fmtPKR(p.amount)+'</span>';
          if(admFee>0) paidCell+='<div style="font-size:10px;color:var(--blue);font-weight:700;margin-top:2px">🎓 +'+fmtPKR(admFee)+' adm.</div>';
          extras.forEach(c=>{paidCell+='<div style="font-size:10px;color:var(--amber);font-weight:700;margin-top:1px">+'+fmtPKR(c.amount)+' '+escHtml(c.label||'')+'</div>';});
          if(conc>0) paidCell+='<div style="font-size:10px;color:var(--red);font-weight:700;margin-top:1px">−'+fmtPKR(conc)+' concession</div>';
          return '<tr style="border-top:1px solid var(--border);background:'+(i%2?'var(--bg3)':'transparent')+'">'
          +'<td style="padding:10px 14px;font-weight:600">'+escHtml(p.month||'—')+'</td>'
          +'<td style="padding:10px 14px;font-weight:800;color:var(--text)">'+(mRent>0?fmtPKR(mRent):'<span style="color:var(--text3)">—</span>')+'</td>'
          +'<td style="padding:10px 14px;font-weight:700;color:var(--teal)">'+(conc>0?'−'+fmtPKR(conc):'<span style="color:var(--text3)">—</span>')+'</td>'
          +'<td style="padding:10px 14px">'+paidCell+'</td>'
          +'<td style="padding:10px 14px;font-weight:700;color:'+((p.unpaid||0)>0?'var(--red)':'var(--text3)')+'">'+((p.unpaid||0)>0?fmtPKR(p.unpaid||0):'—')+'</td>'
          +'<td style="padding:10px 14px">'+pmBadge(p.method)+'</td>'
          +'<td style="padding:10px 14px">'+statusBadge(p.status)+'</td>'
          +'<td style="padding:10px 14px;font-size:12px;color:var(--text3)">'+(fmtDate(p.date)||'—')+'</td>'
          +'<td style="padding:10px 14px"><div style="display:flex;gap:4px">'
          +(p.status!=='Paid'?`<button class="btn btn-success btn-icon btn-sm" onclick="markPaymentPaidFromStudentView('${p.id}','${id}')" title="Mark Paid" style="font-size:13px">✓</button>`:'')
          +`<button class="btn btn-secondary btn-icon btn-sm" onclick="printReceiptFromStudentView('${p.id}','${id}')" title="Print Receipt" style="font-size:13px">🧾</button>`
          +`<button class="btn btn-secondary btn-icon btn-sm" onclick="editPaymentFromStudentView('${p.id}','${id}')" title="Edit Payment" style="font-size:13px">✏️</button>`
          +`<button class="btn btn-danger btn-icon btn-sm" onclick="deletePaymentFromStudentView('${p.id}','${id}')" title="Delete" style="font-size:13px">🗑</button>`
          +'</div></td></tr>';
        }).join('');
        return '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
          +'<thead><tr style="background:var(--bg4)">'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Month</th>'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Monthly Rent</th>'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Concession</th>'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Paid (+Extras)</th>'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Unpaid</th>'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Method</th>'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Status</th>'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Date</th>'
          +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Actions</th>'
          +'</tr></thead><tbody>'+rows+'</tbody></table></div>';
      })():
      '<div style="padding:24px;text-align:center;color:var(--text3)">No payment records yet</div>'}
    </div>

    <!-- ROOM SHIFT HISTORY -->
    ${(()=>{
      const shifts = (DB.roomShifts||[]).filter(s=>s.studentId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
      if(!shifts.length) return '';
      return `<div style="background:var(--bg3);border:1px solid rgba(74,156,240,0.3);border-radius:10px;overflow:hidden;margin-top:16px">
        <div style="padding:12px 16px;border-bottom:1px solid var(--border);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--blue)">🔀 Room Shift History (${shifts.length})</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--bg4)">
          <th style="padding:9px 14px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Date</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">From Room</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">To Room</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Old Rent</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">New Rent</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Reason</th>
        </tr></thead>
        <tbody>${shifts.map((s,i)=>`<tr style="border-top:1px solid var(--border);background:${i%2?'var(--bg3)':'transparent'}">
          <td style="padding:9px 14px;font-size:12px;color:var(--text3)">${fmtDate(s.date)}</td>
          <td style="padding:9px 14px"><span class="badge badge-gold">Rm #${s.fromRoomNumber}</span></td>
          <td style="padding:9px 14px"><span class="badge badge-blue">Rm #${s.toRoomNumber}</span></td>
          <td style="padding:9px 14px;color:var(--text3);font-size:12px">${fmtPKR(s.oldRent)}</td>
          <td style="padding:9px 14px;font-weight:700;color:var(--green);font-size:12px">${fmtPKR(s.newRent)}</td>
          <td style="padding:9px 14px;font-size:12px;color:var(--text2)">${escHtml(s.reason||'—')}</td>
        </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    })()}
  `,`
    <button class="btn btn-secondary" onclick="printStudentCard('${id}')">&#x1F5A8; Print</button>
    <button class="btn btn-secondary" style="background:var(--blue-dim);border-color:rgba(74,156,240,0.35);color:var(--blue)" onclick="closeModal();showRoomShiftModal('${id}')">🔀 Shift Room</button>
    <button class="btn btn-secondary" onclick="closeModal();showEditStudentModal('${id}')">&#x270F; Edit</button>
    ${t.status==='Active'?`<button class="btn btn-danger" onclick="closeModal();quickCancelStudent('${id}')">🚫 Cancel Seat</button>`:''}
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
          msg='📷 Camera access denied. On Windows: Settings → Privacy & Security → Camera → enable this app. Then restart.';
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
  if(prev) prev.innerHTML = '🧑‍🎓';
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
          msg='📷 Camera access denied. On Windows: Settings → Privacy & Security → Camera → enable this app. Then restart.';
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
  const endOfMonth = (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); d.setDate(0); return d.toISOString().split('T')[0]; })();
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
    .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #c8a84b;margin-bottom:24px}
    .hostel-name{font-size:22px;font-weight:800;color:#1a1a2e}
    .hostel-sub{font-size:12px;color:#666;margin-top:3px}
    .report-badge{background:#c8a84b22;border:1px solid #c8a84b55;color:#8b6a00;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700}
    .profile-hero{background:linear-gradient(135deg,#0d1b2a,#1a2d4a);border-radius:12px;padding:24px;margin-bottom:20px;display:flex;align-items:center;gap:20px;color:#fff}
    .avatar{width:64px;height:64px;border-radius:14px;background:#c8a84b33;border:2px solid #c8a84b88;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#c8a84b;flex-shrink:0}
    .badges{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    .badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
    .badge-green{background:#dcfce7;color:#166534}
    .badge-blue{background:#dbeafe;color:#1e40af}
    .badge-gold{background:#fef9c3;color:#854d0e}
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
    <div><div class="hostel-name">${t.name}</div><div class="hostel-sub">${DB.settings.hostelName} · ${DB.settings.location||''}</div></div>
    <div class="report-badge">Student Profile Report</div>
  </div>
  <div class="profile-hero">
    <div class="avatar">${t.name[0].toUpperCase()}</div>
    <div>
      <div style="font-size:20px;font-weight:800">${t.name}</div>
      <div style="font-size:12px;opacity:0.6;font-family:monospace;margin-top:2px">#${t.id}</div>
      <div class="badges">
        <span class="badge badge-${t.status==='Active'?'green':'blue'}">${t.status}</span>
        ${room?`<span class="badge badge-gold">Room #${room.number} · ${rtype?.name||''}</span>`:''}
      </div>
    </div>
    <div style="margin-left:auto;text-align:right">
      <div style="font-size:11px;opacity:0.6">Monthly Rent</div>
      <div style="font-size:26px;font-weight:900;color:#2ec98a">${fmtPKR(t.rent)}</div>
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
        ${[['Father/Guardian',t.fatherName],['CNIC / ID',t.cnic],['Phone Number',t.phone],['Email',t.email],['Home Address',t.address],['Emergency Contact',t.emergencyContact],['Join Date',fmtDate(t.joinDate)]].map(([k,v])=>`<div class="info-item"><label>${k}</label><div class="val">${v||'—'}</div></div>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="section-title">🏠 Room & Accommodation</div>
      <div class="info-grid">
        ${room?[['Room Number','#'+room.number],['Room Type',rtype?.name||'—'],['Floor',room.floor||'—'],['Capacity',rtype?.capacity+' beds'||'—'],['Monthly Rent',fmtPKR(t.rent)],['Amenities',(room.amenities||[]).join(', ')||'—']].map(([k,v])=>`<div class="info-item"><label>${k}</label><div class="val">${v}</div></div>`).join(''):'<p style="color:#94a3b8">No room assigned</p>'}
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
      return `<tr><td>${p.month||'—'}</td><td class="${p.status==='Paid'?'paid':'overdue'}">${fmtPKR(p.amount)}${_extraHTML}${_xHTML}${_concHTML}</td><td>${p.method||'—'}</td><td class="${p.status==='Paid'?'paid':'overdue'}">${p.status}</td><td>${fmtDate(p.date)||'—'}</td><td style="color:#94a3b8">${p.notes||'—'}</td></tr>`;
    }).join('')}
    </tbody></table>`:'<p style="color:#94a3b8;text-align:center;padding:12px">No payment records</p>'}
  </div>
  <div class="footer">Generated ${new Date().toLocaleDateString()} · ${DB.settings.hostelName} Management System · ${DB.settings.location||''}</div>
  </body></html>`;
  var _cardName = 'Student_' + (t.name||'Profile').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'') + '_' + new Date().toISOString().slice(0,10) + '.pdf';
  _electronPDF(_cardHtml, _cardName, { pageSize: 'A4' });
}
function showEditStudentModal(id) {
  const t=DB.students.find(x=>x.id===id); if(!t) return;
  const allRooms=DB.rooms.filter(r=>r.id===t.roomId||getRoomOccupancy(r)<getRoomType(r).capacity);
  const pmOpts=DB.settings.paymentMethods.map(m=>`<option ${t.paymentMethod===m?'selected':''}>${m}</option>`).join('');
  const statOpts=['Active','Left','Blacklisted'].map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('');
  const curRoom=DB.rooms.find(r=>r.id===t.roomId);
  const curRt=curRoom?getRoomType(curRoom):null;
  const presetLabel=curRoom?`Room #${curRoom.number} · ${curRt?.name||''} · ${curRoom.floor||''} Floor`:'';
  showModal('modal-lg',`✏️ Edit Student — ${escHtml(t.name)}`,`
  <style>
  .as-section{background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px}
  .as-section-title{font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold2);margin-bottom:12px;display:flex;align-items:center;gap:6px}
  </style>
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;padding:14px 16px;background:linear-gradient(135deg,var(--bg3),var(--bg4));border:1px solid var(--border2);border-radius:12px">
    <div id="edit-student-photo-preview" style="width:72px;height:86px;border-radius:12px;border:2px dashed rgba(200,168,75,0.5);background:rgba(200,168,75,0.07);display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0;overflow:hidden">
      ${t.docs?.photo?`<img src="${t.docs.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`:'🧑‍🎓'}
    </div>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:800;color:var(--gold2);margin-bottom:8px">📸 Student Photo <span style="font-size:10px;color:var(--text3);font-weight:400">(optional)</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('edit-student-photo-file').click()" style="font-size:11px">📁 Upload</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="openEditStudentCamera()" style="font-size:11px">📷 Camera</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="clearEditStudentPhoto()" style="font-size:11px;display:${t.docs?.photo?'block':'none'}" id="edit-student-clear-btn">✕ Remove</button>
      </div>
      <input type="file" id="edit-student-photo-file" accept="image/*" style="display:none" onchange="loadEditStudentPhoto(this)">
      <div id="edit-student-cam-box" style="display:none;margin-top:8px">
        <video id="edit-student-cam-video" autoplay playsinline style="width:100%;max-height:140px;border-radius:8px;background:#000"></video>
        <canvas id="edit-student-cam-canvas" style="display:none"></canvas>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button type="button" class="btn btn-primary btn-sm" style="flex:1;font-size:11px" onclick="captureEditStudentPhoto()">📸 Capture</button>
          <button type="button" class="btn btn-secondary btn-sm" style="flex:1;font-size:11px" onclick="closeEditStudentCamera()">✕ Close</button>
        </div>
      </div>
      <input type="hidden" id="edit-student-photo-data" value="${escHtml(t.docs?.photo||'')}">
    </div>
  </div>
  <div class="as-section">
    <div class="as-section-title">${icon('student','sm')} Student Identity</div>
    <div class="form-grid" style="gap:12px">
      <div class="field"><label>Full Name *</label><input class="form-control" id="f-tname" value="${escHtml(t.name)}" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
      <div class="field"><label>Father Name</label><input class="form-control" id="f-tfname" value="${escHtml(t.fatherName||'')}" oninput="autoCapName(this)" style="text-transform:capitalize"></div>
      <div class="field"><label>CNIC</label><input class="form-control" id="f-tcnic" value="${escHtml(t.cnic||'')}" placeholder="XXXXX-XXXXXXX-X" maxlength="15" oninput="fmtCnic(this)"></div>
      <div class="field"><label>Course / Study Field</label><input class="form-control" id="f-tocc" value="${escHtml(t.occupation||t.course||'')}" placeholder="e.g. BS Computer Science, MBBS…"></div>
      <div class="field"><label>Status</label><select class="form-control" id="f-tstat">${statOpts}</select></div>
      <div class="field"><label>Join Date</label><input class="form-control cdp-trigger" id="f-tjoin" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${t.joinDate||''}"></div>
    </div>
  </div>
  <div class="as-section">
    <div class="as-section-title">📞 Contact Information</div>
    <div class="form-grid" style="gap:12px">
      <div class="field"><label>Phone Number</label><input class="form-control" id="f-tphone" value="${escHtml(t.phone||'')}" placeholder="03XX-XXXXXXX" maxlength="12" oninput="fmtPhone(this)"></div>
      <div class="field"><label>Emergency Contact</label><input class="form-control" id="f-temerg" value="${escHtml(t.emergencyContact||'')}" placeholder="Guardian/Family phone"></div>
      <div class="field"><label>Email</label><input class="form-control" id="f-temail" value="${escHtml(t.email||'')}" placeholder="email@gmail.com"></div>
      <div class="field col-full"><label>Home Address</label>
        <input class="form-control" id="f-taddress" value="${escHtml(t.address||'')}" placeholder="e.g. House #12, Street 4, Peshawar" autocomplete="off" oninput="cityAutocomplete(this)" onblur="hideCitySuggestions()" list="">
        <div id="f-taddress-suggestions" class="city-suggestions"></div>
      </div>
    </div>
  </div>
  <div class="as-section">
    <div class="as-section-title" style="justify-content:space-between">
      <span>🏠 Assign Room *</span>
      <span id="f-troom-selected-label" style="font-size:11px;color:var(--green);font-weight:700">${escHtml(presetLabel)}</span>
    </div>
    <input type="hidden" id="f-troom" value="${escHtml(t.roomId||'')}">
    <div style="position:relative">
      <input class="form-control" id="f-troom-search" placeholder="🔍 Search by room number, type, floor…" autocomplete="off"
        value="${escHtml(presetLabel)}"
        oninput="filterRoomSearch(this.value)" onfocus="filterRoomSearch(this.value)" onblur="setTimeout(()=>{const d=document.getElementById('room-search-drop');if(d)d.style.display='none';},180)">
      <div id="room-search-drop" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius-sm);z-index:500;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4);margin-top:4px">
        ${allRooms.map(r=>{const rt=getRoomType(r);const occ=getRoomOccupancy(r);const free=rt.capacity-occ;const lbl=`Room #${r.number} · ${rt.name} · ${r.floor} Floor`;return `<div class="room-search-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.1s" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''" onmousedown="pickRoomSearch('${r.id}',${parseFloat(r.rent)||0},'${lbl}')"><div><span style="font-size:15px;font-weight:900;color:var(--gold2)">Room #${r.number}</span><span style="font-size:11px;color:var(--text3);margin-left:8px">${rt.name} · ${r.floor} Floor</span></div><div style="text-align:right"><div style="font-size:11px;font-weight:700;color:${free>0?'var(--green)':'var(--red)'}">${occ}/${rt.capacity} occ</div><div style="font-size:11px;color:var(--text3)">${fmtPKR(parseFloat(r.rent)||0)}/mo</div></div></div>`;}).join('')}
      </div>
    </div>
  </div>

  <div class="as-section" style="margin-bottom:0">
    <div class="as-section-title">📝 Notes</div>
    <textarea class="form-control" id="f-tnotes" rows="2" placeholder="Additional notes…">${escHtml(t.notes||'')}</textarea>
  </div>`,
  `<button class="btn btn-danger" onclick="confirmDeleteStudent('${id}')">🗑 Delete</button><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEditStudent('${id}')">💾 Save Changes</button>`);
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
  const _newOccup  = document.getElementById('f-toccup')?.value.trim() || t.occupation || '';
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

  // FIX 21: if room changed, update pending payment records
  if (_newRoomId && _newRoomId !== _originalRoomId) {
    const _newRoom = DB.rooms.find(r=>r.id===_newRoomId);
    DB.payments.forEach(p=>{
      if(p.studentId===t.id && p.status==='Pending') {
        p.roomId     = _newRoomId;
        p.roomNumber = _newRoom ? _newRoom.number : p.roomNumber;
      }
    });
  }
  t.roomId = _newRoomId;

  if(_photoData !== undefined) { if(!t.docs) t.docs={}; t.docs.photo = _photoData; }

  await saveDB(); closeModal(); renderPage('students'); toast('Student updated','success');
}
async function confirmDeleteStudent(id) {
  const t=DB.students.find(x=>x.id===id); if(!t) return;
  closeModal();
  showConfirm(`Remove ${t.name}?`,'This will permanently delete the student record.',(async ()=>{
    DB.students=DB.students.filter(x=>x.id!==id);
    DB.payments=DB.payments.filter(p=>p.studentId!==id);
    await saveDB(); renderPage('students'); toast('Student removed','info');
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
    return getRoomOccupancy(r) < type.capacity;
  });

  if (!available.length) {
    toast('No other rooms have available capacity right now.', 'error');
    return;
  }

  const roomOpts = available.map(r => {
    const type = getRoomType(r);
    const occ  = getRoomOccupancy(r);
    return `<option value="${r.id}" data-rent="${r.rent}">#${r.number} — ${type.name} · ${r.floor} Floor (${occ}/${type.capacity} occupied) · ${fmtPKR(r.rent)}/mo</option>`;
  }).join('');

  showModal('modal-md', '🔀 Shift Student to Another Room', `
    <!-- Current info banner -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:18px;display:flex;align-items:center;gap:14px">
      <div style="font-size:24px">🧑‍🎓</div>
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--text)">${escHtml(t.name)}</div>
        <div style="font-size:12px;color:var(--text3)">Currently in <strong style="color:var(--gold2)">Room #${fromRoom ? fromRoom.number : '?'}</strong> · Rent: <strong style="color:var(--green)">${fmtPKR(t.rent)}/mo</strong></div>
      </div>
    </div>

    <div class="form-grid">
      <div class="field col-full">
        <label>New Room *</label>
        <select class="form-control" id="shift-new-room" onchange="
          const opt = this.options[this.selectedIndex];
          const rent = opt.getAttribute('data-rent')||'';
          const el = document.getElementById('shift-new-rent');
          if(el && rent) { el.value = rent; }
        ">
          <option value="">— Select Room —</option>${roomOpts}
        </select>
      </div>
      <div class="field">
        <label>New Monthly Rent (PKR)</label>
        <input class="form-control" id="shift-new-rent" type="number" value="${t.rent}" placeholder="Auto-filled from room">
        <div style="font-size:11px;color:var(--text3);margin-top:3px">Leave as-is or adjust for the new room</div>
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
  const newRent    = parseFloat(document.getElementById('shift-new-rent')?.value) || t.rent;
  const shiftDate  = document.getElementById('shift-date')?.value  || today();
  const reason     = document.getElementById('shift-reason')?.value?.trim() || '';

  if (!newRoomId) { toast('Please select a new room', 'error'); return; }
  // FIX: block shifting to the same room the student is already in
  if (newRoomId === t.roomId) { toast('Student is already assigned to this room — please select a different one.', 'error'); return; }

  const fromRoom = DB.rooms.find(r => r.id === t.roomId);
  const toRoom   = DB.rooms.find(r => r.id === newRoomId);
  if (!toRoom)   { toast('Selected room not found', 'error'); return; }

  // Check capacity again at submission time
  const type = getRoomType(toRoom);
  if (getRoomOccupancy(toRoom) >= type.capacity) {
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
let payFilter = {status:'All', method:'All', search:'', showAll: false, page:1, sortKey:null, sortDir:'asc'};

// ── FORMER STUDENTS — search & restore ───────────────────────────────────────
function showFormerStudentsModal() {
  const total = DB.students.filter(s=>s.status==='Left').length;
  // FIX 9: first arg is the CSS size class — 'Former Students' was being passed as size
  showModal('modal-lg', 'Former Students',
    `<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Search by name, ID, mobile, CNIC, email, father name, occupation, location or former room.</div>
     <div style="display:flex;gap:8px;margin-bottom:14px">
       <div style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-align:center">
         <div style="font-size:18px;font-weight:900;color:var(--gold2)">${total}</div>
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
        <div style="width:44px;height:44px;border-radius:11px;background:var(--gold-dim);color:var(--gold2);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;flex-shrink:0">${(s.name||'?')[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:4px">${escHtml(s.name||'—')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;margin-bottom:8px">
            ${s.phone?`<div style="font-size:11px;color:var(--text3)">📞 ${escHtml(s.phone)}</div>`:''}
            ${s.cnic?`<div style="font-size:11px;color:var(--text3)">🪪 ${escHtml(s.cnic)}</div>`:''}
            ${s.fatherName?`<div style="font-size:11px;color:var(--text3)">👨 ${escHtml(s.fatherName)}</div>`:''}
            ${s.email?`<div style="font-size:11px;color:var(--text3)">✉️ ${escHtml(s.email)}</div>`:''}
            ${s.occupation?`<div style="font-size:11px;color:var(--text3)">💼 ${escHtml(s.occupation)}</div>`:''}
            ${(s.lastRoom||s.roomNumber)?`<div style="font-size:11px;color:var(--gold2);font-weight:600">🏠 Former Rm #${escHtml(String(s.lastRoom||s.roomNumber||'—'))}</div>`:''}
            ${s.leftDate?`<div style="font-size:11px;color:var(--red)">📅 Left: ${fmtDate(s.leftDate)}</div>`:''}
            ${s.rent?`<div style="font-size:11px;color:var(--green);font-weight:600">💰 ${fmtPKR(s.rent)}/mo</div>`:''}
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
  const availRooms = _getAvailableRooms();
  const roomOpts = availRooms.map(r=>{ const type=getRoomType(r); return `<option value="${r.id}">Room #${r.number} — ${type?.name||''} (${getRoomOccupancy(r)}/${type?.capacity||1} filled)</option>`; }).join('');
  const pmOpts = DB.settings.paymentMethods.map(m=>`<option ${t.paymentMethod===m?'selected':''}>${escHtml(m)}</option>`).join('');
  const today = new Date().toISOString().slice(0,10);
  const thisMonthKey = today.slice(0,7);
  const payHistory = DB.payments.filter(p=>p.studentId===t.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const totalPaid = payHistory.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount||0),0);
  const pendRecs  = payHistory.filter(p=>p.status==='Pending');
  const totalPend = pendRecs.reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount||0)),0);
  const histRows  = payHistory.slice(0,6).map((p,i)=>`<tr style="border-top:1px solid var(--border);background:${i%2?'var(--bg3)':'transparent'}"><td style="padding:7px 10px;font-weight:600;font-size:11px">${escHtml(p.month||'—')}</td><td style="padding:7px 10px;color:var(--green);font-weight:700;font-size:11px">${fmtPKR(p.amount)}</td><td style="padding:7px 10px;color:${(p.unpaid||0)>0?'var(--red)':'var(--text3)'};font-weight:700;font-size:11px">${(p.unpaid||0)>0?fmtPKR(p.unpaid):'—'}</td><td style="padding:7px 10px;font-size:11px">${escHtml(p.method||'—')}</td><td style="padding:7px 10px;font-size:11px;color:${p.status==='Paid'?'var(--green)':'var(--red)'};font-weight:700">${p.status==='Paid'?icon('checkmark','xs'):'⏳'} ${p.status}</td><td style="padding:7px 10px;font-size:10px;color:var(--text3)">${fmtDate(p.date)||'—'}</td></tr>`).join('');

  showModal('modal-lg', `<span style="color:var(--green)">🔄 Restore — ${escHtml(t.name)}</span>`,
    `<div style="font-size:12px;color:var(--text3);margin-bottom:14px;background:var(--green-dim);border:1px solid rgba(46,201,138,0.25);border-radius:8px;padding:10px 14px">All previous details are pre-filled. Update room, rent, and payment details.</div>
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
      <div class="field"><label>Assign Room *</label><select class="form-control" id="rs-room"><option value="">— Select available room —</option>${roomOpts}</select></div>
      <div class="field"><label>Monthly Rent (PKR) *</label><input class="form-control" id="rs-rent" type="number" value="${t.rent||''}" placeholder="e.g. 16000" oninput="rsRecalc()"></div>
      <div class="field col-full" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px"><div style="font-size:12px;font-weight:700;color:var(--gold2);margin-bottom:10px">${icon('money')} First Month Payment</div></div>
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
          <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Rent</div><div id="rs-tot-rent">${moneyValue(0,{size:"body",color:"var(--blue)"})}</div></div>
          <div style="color:var(--border2);font-size:20px">+</div>
          <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Extra Charges</div><div id="rs-tot-extra">${moneyValue(0,{size:"body",color:"var(--red)"})}</div></div>
          <div style="color:var(--border2);font-size:20px">−</div>
          <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Concession</div><div id="rs-tot-conc">${moneyValue(0,{size:"body",color:"var(--teal)"})}</div></div>
          <div style="color:var(--border2);font-size:20px">=</div>
          <div style="background:rgba(200,168,75,0.1);border:1px solid rgba(200,168,75,0.3);border-radius:8px;padding:8px 14px">
            <div style="font-size:10px;color:var(--gold2);text-transform:uppercase;letter-spacing:.6px;font-weight:700">Net Payable</div>
            <div id="rs-tot-net">${moneyValue(0,{size:"section",color:"var(--gold2)"})}</div>
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
    warn.innerHTML = '<div style="background:rgba(200,168,75,0.08);border:1px solid rgba(200,168,75,0.3);border-radius:9px;padding:10px 14px;font-size:12px;color:var(--gold2);font-weight:600">' + icon('warning','sm') + ' This student has a <strong>Pending</strong> payment of <strong>' + fmtPKR(pending.unpaid || pending.amount) + '</strong> for <strong>' + monthVal + '</strong>. Submitting will add a new record — consider updating the existing one instead.</div>';
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

function rsRecalc() {
  const rent=parseFloat(document.getElementById('rs-rent')?.value)||0;
  const paid=parseFloat(document.getElementById('rs-amount')?.value)||0;
  const conc=parseFloat(document.getElementById('rs-concession')?.value)||0;
  let extra=0; document.querySelectorAll('.rs-extra-amt').forEach(el=>{extra+=parseFloat(el.value)||0;});
  const net=rent+extra-conc;
  const el=id=>document.getElementById(id);
  if(el('rs-tot-rent'))  el('rs-tot-rent').innerHTML  =moneyValue(Math.abs(rent),{size:'body',color:'var(--blue)'});
  if(el('rs-tot-extra')) el('rs-tot-extra').innerHTML =moneyValue(Math.abs(extra),{size:'body',color:'var(--red)'});
  if(el('rs-tot-conc'))  el('rs-tot-conc').innerHTML  =moneyValue(Math.abs(conc),{size:'body',color:'var(--teal)'});
  if(el('rs-tot-net'))   el('rs-tot-net').innerHTML   =moneyValue(Math.abs(net),{size:'section',color:'var(--gold2)'});
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
  const rent  =parseFloat(document.getElementById('rs-rent').value)||0;
  if(!roomId){toast('Please select a room','error');return;}
  if(!rent)  {toast('Please enter monthly rent','error');return;}
  const room=DB.rooms.find(r=>r.id===roomId);
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
  t.roomId=roomId; t.roomNumber=room?.number||''; t.rent=rent;
  t.paymentMethod=document.getElementById('rs-pm').value;
  t.status='Active'; t.restoredAt=new Date().toISOString().slice(0,10); t.leftDate='';
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
    const netAmount=rent+extraTotal-concession;
    const unpaid=pendingAmt>0?pendingAmt:(pStatus==='Pending'?netAmount:undefined);
    const notesParts=['First payment after restore'];
    if(extraCharges.length) notesParts.push('Charges: '+extraCharges.map(c=>`${c.label} ${fmtPKR(c.amount)}`).join(', '));
    if(concession>0) notesParts.push(`Concession: ${fmtPKR(concession)}${concReason?' ('+concReason+')':''}`);
    if(extraNotes) notesParts.push(extraNotes);
    DB.payments.push({id:uid(),studentId:t.id,studentName:t.name,roomId,roomNumber:room?.number||'',month:monthVal,monthlyRent:rent,totalRent:rent,amount,unpaid,admissionFee:0,fee:0,extraCharges,extraTotal,concession,concessionDesc:concReason||'',discount:concession,method:t.paymentMethod,status:pStatus,date:t.joinDate||new Date().toISOString().slice(0,10),notes:notesParts.join(' | ')});
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
    var val=d.toISOString().slice(0,7);
    var lbl=d.toLocaleString('default',{month:'long',year:'numeric'});
    monthOpts += '<option value="'+val+'"'+(i===0?' selected':'')+'>'+lbl+'</option>';
  }
  showModal('modal-md','📥 Download Students PDF',
    '<div style="padding:4px 0">'
    +'<div style="margin-bottom:18px">'
    +'<label style="font-size:12px;font-weight:700;color:var(--text2);display:block;margin-bottom:6px">Select Month for Fee Report</label>'
    +'<select id="pdf-month-sel" class="form-control">'+monthOpts+'</select>'
    +'<div style="font-size:11px;color:var(--text3);margin-top:6px">The PDF will show each student\'s rent, deposit, paid amount, and pending balance for the selected month.</div>'
    +'</div>'
    +'<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--gold2);margin-bottom:8px">📋 Report will include:</div>'
    +'<div style="font-size:12px;color:var(--text2);line-height:1.8">'
    +icon('checkmark','xs')+' Student name, father\'s name, room number<br>'
    +icon('checkmark','xs')+' CNIC and phone number<br>'
    +icon('checkmark','xs')+' Monthly rent &amp; deposit paid on joining<br>'
    +icon('checkmark','xs')+' Amount paid in selected month<br>'
    +icon('checkmark','xs')+' Pending / unpaid balance for that month<br>'
    +icon('checkmark','xs')+' Payment status badge<br>'
    +icon('checkmark','xs')+' <strong style="color:var(--amber)">Expenses summary badge &amp; full breakdown</strong><br>'
    +icon('checkmark','xs')+' <strong style="color:var(--blue)">Funds Transfer badge &amp; full breakdown</strong><br>'
    +icon('checkmark','xs')+' <strong style="color:var(--green)">Net Available fund calculation</strong>'
    +'</div>'
    +'</div>'
    +'</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>'
    +'<button class="btn btn-primary" onclick="doGenerateStudentsPDF(document.getElementById(\'pdf-month-sel\').value);closeModal()">📥 Generate PDF</button>'
  );
}

function doGenerateStudentsPDF(monthKey) {
  var appName  = DB.settings.appName  || 'HOSTIX';
  var hostel   = DB.settings.hostelName || 'DAMAM Boys Hostel';
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

  // FIX #4: Exclude Left/Cancelling students who left BEFORE the selected month.
  // Exception: always include if they have an actual payment record for that month.
  var students = allStudents.filter(function(s) {
    if (s.status !== 'Left' && s.status !== 'Cancelling') return true;
    // If they have a payment record for this month, include them regardless
    if ((_payByStudent.get(s.id)||[]).some(function(p){ return _payMatchesMonth(p, monthKey); })) return true;
    // Exclude if leftDate is before the first day of selected month
    if (s.leftDate && s.leftDate < monthKey+'-01') return false;
    return true;
  });

  var total  = students.length;
  var active = students.filter(function(s){return s.status==='Active';}).length;
  var left   = students.filter(function(s){return s.status==='Left';}).length;

  // Grand totals
  var grandRent=0, grandAdmFee=0, grandExtra=0, grandConc=0, grandPaid=0, grandPending=0;

  // Month-level expenses and transfers
  var grandExpenses  = (DB.expenses||[]).filter(function(e){ return (e.date||'').startsWith(monthKey); }).reduce(function(s,e){ return s+Number(e.amount||0); },0);
  var grandTransfers = (DB.transfers||[]).filter(function(t){ return (t.date||'').startsWith(monthKey); }).reduce(function(s,t){ return s+Number(t.amount||0); },0);

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
    var statusStyle = !hasRecord ? 'color:#888;background:#f0f0f0' : pendingAmt>0 ? 'color:#8b1a1a;background:#fde8e8' : 'color:#1a6b3a;background:#d4f4e0';
    var sColor      = s.status==='Active'?'#1a7a3a':s.status==='Left'?'#555':'#8b0000';
    var sBg         = s.status==='Active'?'#d4f4e0':s.status==='Left'?'#eee':'#fde8e8';
    var rowBg       = (i%2===0)?'#fff':'#f9f9fb';

    grandRent    += Number(s.rent||0);
    grandAdmFee  += admFee;
    grandExtra   += extraTotal;
    grandConc    += concession;
    grandPaid    += paidAmt;
    grandPending += pendingAmt;

    var dash = '<span style="color:#ccc">—</span>';
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

    rows += '<tr style="background:'+rowBg+'">';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:center;font-weight:700;color:#888;font-size:10px">'+(i+1)+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;font-weight:700;color:#111">'+escHtml(s.name||'—')+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;color:#444;font-size:10px">'+escHtml(s.fatherName||'—')+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:center;font-weight:800;color:#b8860b">'+(room?'#'+room.number:'—')+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;font-family:monospace;font-size:9.5px;color:#444">'+escHtml(s.cnic||'—')+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;font-size:10px;color:#333">'+escHtml(s.phone||'—')+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:right;font-weight:800;color:#1a5c3a">'+fmtPKR(s.rent||0)+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:right;font-weight:700;color:'+(admFee>0?'#1a3a7a':'#bbb')+';font-size:10px">'+(admFee>0?fmtPKR(admFee):dash)+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:right;font-weight:700;color:'+(extraTotal>0?'#7a4d00':'#bbb')+';font-size:10px">'+extCell+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:right;font-weight:700;color:'+(concession>0?'#0a5a40':'#bbb')+';font-size:10px">'+concCell+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:right;font-weight:800;color:'+(paidAmt>0?'#1a6b3a':'#aaa')+'">'+(paidAmt>0?fmtPKR(paidAmt):dash)+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:right;font-weight:800;color:'+(pendingAmt>0?'#8b1a1a':'#aaa')+'">'+(pendingAmt>0?fmtPKR(pendingAmt):dash)+'</td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:center"><span style="display:inline-block;padding:2px 6px;border-radius:20px;font-size:9px;font-weight:800;'+statusStyle+'">'+statusTxt+'</span></td>';
    rows += '<td style="padding:6px 5px;border:1px solid #c8d0db;text-align:center"><span style="display:inline-block;padding:2px 6px;border-radius:20px;font-size:9px;font-weight:800;background:'+sBg+';color:'+sColor+'">'+escHtml(s.status||'—')+'</span></td>';
    rows += '</tr>';
  });

  // Totals row — adm/ext/conc NOT grand-totalled (they are per-student breakdown only)
  rows += '<tr style="background:#0f1a2e">';
  rows += '<td colspan="6" style="padding:8px 8px;font-weight:900;color:#e6c96e;font-size:12px;border:1px solid #2a3d5a">TOTALS &nbsp;<span style="font-weight:400;font-size:10px">('+total+' students)</span></td>';
  rows += '<td style="padding:8px 5px;text-align:right;font-weight:900;color:#e6c96e">'+fmtPKR(grandRent)+'</td>';
  rows += '<td style="padding:8px 5px;text-align:center;color:#4a6a9a;font-size:9px">—</td>';
  rows += '<td style="padding:8px 5px;text-align:center;color:#4a6a9a;font-size:9px">—</td>';
  rows += '<td style="padding:8px 5px;text-align:center;color:#4a6a9a;font-size:9px">—</td>';
  rows += '<td style="padding:8px 5px;text-align:right;font-weight:900;color:#4ade80">'+fmtPKR(grandPaid)+'</td>';
  rows += '<td style="padding:8px 5px;text-align:right;font-weight:900;color:#f87171">'+fmtPKR(grandPending)+'</td>';
  rows += '<td colspan="2" style="padding:8px 5px;text-align:center;font-size:10px;color:#8899bb">'+active+' active · '+left+' left</td>';
  rows += '</tr>';

  var netFund = grandPaid - grandExpenses - grandTransfers;

  // ── HTML ──────────────────────────────────────────────────────────────────
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=1300">';
  html += '<title>'+hostel+' — Students Fee Report '+monthLabel+'</title>';
  html += '<style>';
  html += '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}';
  html += '@page{size:A4 landscape;margin:7mm 9mm}@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  html += 'body{font-family:"Segoe UI",-apple-system,Roboto,Arial,sans-serif;background:#fff;color:#111;padding:14px 18px;font-size:10.5px}';
  html += '@media print{body{padding:3px 4px;font-size:9.5px}.no-print{display:none!important}}';
  // 11 cols: # name father room cnic phone rent paid pend fst sst
  html += 'table{width:100%;border-collapse:collapse;table-layout:fixed}';
  html += 'col.c-no{width:3%}col.c-name{width:13%}col.c-father{width:10%}col.c-room{width:4%}col.c-cnic{width:11%}col.c-phone{width:8%}col.c-rent{width:7%}col.c-adm{width:7%}col.c-ext{width:8%}col.c-conc{width:8%}col.c-paid{width:8%}col.c-pend{width:7%}col.c-fst{width:7%}col.c-sst{width:6%}';
  html += 'thead th{background:#0f1a2e;color:#e6c96e;padding:7px 5px;text-align:left;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.4px;border:1px solid #1e3050;word-break:break-word}';
  html += 'thead th.r{text-align:right}thead th.c{text-align:center}';
  html += 'td{padding:5px 5px;border:1px solid #c8d0db !important;word-break:break-word;vertical-align:middle;font-size:10px}';
  html += 'tr:hover td{background:#f0f4ff!important}';
  html += '.sum{display:inline-flex;align-items:center;gap:5px;background:#f5f7ff;border:1px solid #dde2ea;border-radius:8px;padding:5px 10px;margin:2px}';
  html += '.sum .v{font-size:15px;font-weight:900}.sum .l{font-size:8px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}';
  html += '.pbtn{background:#0f1a2e;color:#e6c96e;border:none;padding:8px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:Outfit,Arial,sans-serif}';
  html += '</style></head><body>';

  // Header
  html += '<div style="border-bottom:3px solid #c8a84b;padding-bottom:10px;margin-bottom:12px;display:flex;align-items:flex-start;justify-content:space-between">';
  html += '<div><div style="font-size:22px;font-weight:900;color:#0f1a2e">'+escHtml(hostel)+'</div>';
  if(location) html += '<div style="font-size:11px;color:#666;margin-top:2px">📍 '+escHtml(location)+'</div>';
  html += '<div style="font-size:14px;font-weight:800;color:#b8860b;margin-top:4px;text-transform:uppercase;letter-spacing:0.8px">Students Fee Report — '+monthLabel+'</div></div>';
  html += '<div style="text-align:right"><div style="font-size:10px;color:#888">Generated on</div><div style="font-size:12px;font-weight:700;color:#333">'+now+'</div>';
  html += '<button class="pbtn no-print" style="margin-top:8px" onclick="window.print()">🖨️ Print / Save PDF</button></div>';
  html += '</div>';

  // Summary badges (Fix #12: admission fee and concession removed from grand total badges)
  html += '<div style="display:flex;flex-wrap:wrap;gap:0;margin-bottom:12px">';
  html += '<div class="sum"><div class="v" style="color:#0f1a2e">'+total+'</div><div class="l">In<br>Report</div></div>';
  html += '<div class="sum"><div class="v" style="color:#1a7a3a">'+active+'</div><div class="l">Active</div></div>';
  html += '<div class="sum"><div class="v" style="color:#555">'+left+'</div><div class="l">Left</div></div>';
  html += '<div class="sum" style="background:#e8f5e9"><div class="v" style="color:#1a5c3a">'+fmtPKR(grandRent)+'</div><div class="l">Rent<br>Expected</div></div>';
  html += '<div class="sum" style="background:#e8f5e9"><div class="v" style="color:#1a6b3a">'+fmtPKR(calcRevenue(monthKey))+'</div><div class="l">Total<br>Collected</div></div>';
  var _pdfPending=DB.payments.filter(function(p){return p.status==='Pending'&&_payMatchesMonth(p,monthKey);}).reduce(function(s,p){return s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount||0));},0);
  html += '<div class="sum" style="background:'+(_pdfPending>0?'#fde8e8':'#edfaf3')+'">';
  html += '<div class="v" style="color:'+(_pdfPending>0?'#8b1a1a':'#1a6b3a')+'">'+fmtPKR(_pdfPending)+'</div><div class="l">Pending<br>Unpaid</div></div>';
  html += '<div class="sum" style="background:#fff8e1;border-color:#e8a830"><div class="v" style="color:#854d0e">'+fmtPKR(grandExpenses)+'</div><div class="l">Expenses<br>'+monthLabel+'</div></div>';
  html += '<div class="sum" style="background:#eef2ff"><div class="v" style="color:#1a2c80">'+fmtPKR(grandTransfers)+'</div><div class="l">Funds<br>Transfer</div></div>';
  html += '<div class="sum" style="background:'+(netFund>=0?'#edfaf3':'#fde8e8')+'"><div class="v" style="color:'+(netFund>=0?'#1a6b3a':'#8b1a1a')+'">'+fmtPKR(netFund)+'</div><div class="l">Net<br>Available</div></div>';
  html += '</div>';

  // Table
  html += '<table>';
  html += '<colgroup><col class="c-no"><col class="c-name"><col class="c-father"><col class="c-room"><col class="c-cnic"><col class="c-phone"><col class="c-rent"><col class="c-adm"><col class="c-ext"><col class="c-conc"><col class="c-paid"><col class="c-pend"><col class="c-fst"><col class="c-sst"></colgroup>';
  html += '<thead><tr>';
  html += '<th class="c">#</th><th>Student Name</th><th>Father\'s Name</th><th class="c">Room</th><th>CNIC</th><th>Phone</th>';
  html += '<th class="r">Rent/Mo</th>';
  html += '<th class="r" style="color:#7ab4ff">Adm.Fee</th>';
  html += '<th class="r" style="color:#ffd27a">Extra Chrgs</th>';
  html += '<th class="r" style="color:#7aefcf">Concession</th>';
  html += '<th class="r" style="color:#4ade80">Amount Paid</th>';
  html += '<th class="r" style="color:#f87171">Pending</th>';
  html += '<th class="c">Fee Status</th>';
  html += '<th class="c">Stu.Status</th>';
  html += '</tr></thead>';
  html += '<tbody>'+rows+'</tbody>';
  html += '</table>';

  // Expenses breakdown section
  var monthExpenses = (DB.expenses||[]).filter(function(e){ return (e.date||'').startsWith(monthKey); });
  if(monthExpenses.length) {
    html += '<div style="margin-top:16px;padding:12px 14px;background:#fffbf0;border:1px solid #e8c86a;border-radius:10px">';
    html += '<div style="font-size:13px;font-weight:800;color:#6b3d00;margin-bottom:8px">📉 Expenses — '+monthLabel+'</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="background:#3d2000"><th style="padding:6px 10px;color:#e6c96e;text-align:left;border:1px solid #6b3d00">Date</th><th style="padding:6px 10px;color:#e6c96e;text-align:left;border:1px solid #6b3d00">Category</th><th style="padding:6px 10px;color:#e6c96e;text-align:left;border:1px solid #6b3d00">Description</th><th style="padding:6px 10px;color:#e6c96e;text-align:right;border:1px solid #6b3d00">Amount</th></tr></thead><tbody>';
    var expTotal=0;
    monthExpenses.sort(function(a,b){return (a.date||'').localeCompare(b.date||'');}).forEach(function(e,i){
      expTotal+=Number(e.amount||0);
      html+='<tr style="background:'+(i%2===0?'#fff':'#fffbf0')+'">';
      html+='<td style="padding:5px 10px;border:1px solid #e8c86a">'+fmtDate(e.date)+'</td>';
      html+='<td style="padding:5px 10px;border:1px solid #e8c86a"><span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:800;background:#fde8b4;color:#7a4400">'+escHtml(e.category||'—')+'</span></td>';
      html+='<td style="padding:5px 10px;border:1px solid #e8c86a;color:#444">'+escHtml(e.description||'—')+'</td>';
      html+='<td style="padding:5px 10px;border:1px solid #e8c86a;text-align:right;font-weight:800;color:#8b1a1a">'+fmtPKR(e.amount)+'</td>';
      html+='</tr>';
    });
    html+='<tr style="background:#3d2000"><td colspan="3" style="padding:6px 10px;border:1px solid #6b3d00;font-weight:900;color:#e6c96e">Total Expenses</td><td style="padding:6px 10px;border:1px solid #6b3d00;text-align:right;font-weight:900;color:#f87171">'+fmtPKR(expTotal)+'</td></tr>';
    html+='</tbody></table></div>';
  }

  // Transfers breakdown section
  var monthTransfers = (DB.transfers||[]).filter(function(t){ return (t.date||'').startsWith(monthKey); });
  if(monthTransfers.length) {
    html += '<div style="margin-top:14px;padding:12px 14px;background:#f0f4ff;border:1px solid #c5d0e6;border-radius:10px">';
    html += '<div style="font-size:13px;font-weight:800;color:#0f1a2e;margin-bottom:8px">🏦 Funds Transfer — '+monthLabel+'</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="background:#0f1a2e"><th style="padding:6px 10px;color:#e6c96e;text-align:left;border:1px solid #1e3050">Date</th><th style="padding:6px 10px;color:#e6c96e;text-align:left;border:1px solid #1e3050">Description</th><th style="padding:6px 10px;color:#e6c96e;text-align:left;border:1px solid #1e3050">Method</th><th style="padding:6px 10px;color:#e6c96e;text-align:right;border:1px solid #1e3050">Amount</th></tr></thead><tbody>';
    var trTotal=0;
    monthTransfers.forEach(function(t,i){
      trTotal+=Number(t.amount||0);
      html+='<tr style="background:'+(i%2===0?'#fff':'#f9f9fb')+'">';
      html+='<td style="padding:5px 10px;border:1px solid #dde2ea">'+fmtDate(t.date)+'</td>';
      html+='<td style="padding:5px 10px;border:1px solid #dde2ea;font-weight:600">'+escHtml(t.description||'Transfer')+'</td>';
      html+='<td style="padding:5px 10px;border:1px solid #dde2ea">'+escHtml(t.method||'—')+'</td>';
      html+='<td style="padding:5px 10px;border:1px solid #dde2ea;text-align:right;font-weight:800;color:#854d0e">'+fmtPKR(t.amount)+'</td>';
      html+='</tr>';
    });
    html+='<tr style="background:#0f1a2e"><td colspan="3" style="padding:6px 10px;border:1px solid #1e3050;font-weight:900;color:#e6c96e">Total Transferred</td><td style="padding:6px 10px;border:1px solid #1e3050;text-align:right;font-weight:900;color:#e6c96e">'+fmtPKR(trTotal)+'</td></tr>';
    html+='</tbody></table></div>';
  }

  html += '<div style="margin-top:12px;padding-top:6px;border-top:1px solid #ddd;display:flex;justify-content:space-between;align-items:center">';
  html += '<div style="font-size:9px;color:#aaa">Generated by <strong>' + escHtml(appName) + '</strong> · '+escHtml(hostel)+' · '+monthLabel+'</div>';
  html += '<div style="font-size:10px;color:#555;font-weight:600">'+total+' students · Collected: <b style="color:#1a6b3a">'+fmtPKR(grandPaid)+'</b> · Expenses: <b style="color:#854d0e">'+fmtPKR(grandExpenses)+'</b> · Net: <b style="color:'+(netFund>=0?'#1a6b3a':'#8b1a1a')+'">'+fmtPKR(netFund)+'</b></div>';
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
function pickRoomSearch(roomId, rent, label) {
  document.getElementById('f-troom').value = roomId;
  document.getElementById('f-trent').value = parseFloat(rent)||DB.settings.roomTypes[0]?.defaultRent||16000;
  const inp = document.getElementById('f-troom-search');
  if(inp) inp.value = label;
  const lbl = document.getElementById('f-troom-selected-label');
  if(lbl) lbl.textContent = '✓ Selected';
  const drop = document.getElementById('room-search-drop');
  if(drop) drop.style.display = 'none';
  recalcStudentUnpaid();
}function recalcStudentUnpaid() {
  const r = parseFloat(document.getElementById('f-trent')?.value)||0;
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