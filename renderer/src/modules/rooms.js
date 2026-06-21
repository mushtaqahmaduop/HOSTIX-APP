/* ─── HOSTIX — ROOMS MODULE ─────────────────────────────────────────────────
   Contains: renderRooms, showRoomDetail, showAddRoomModal, submitAddRoom,
             showEditRoomModal, submitEditRoom, confirmDeleteRoom
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function getTypeById(id) { return DB.settings.roomTypes.find(t=>t.id===id)||DB.settings.roomTypes[0]; }
function getRoomType(room) { return getTypeById(room.typeId); }
// getRoomOccupancy includes ALL active students (regular + force-added) — used for physical seat display
function getRoomOccupancy(room) { return DB.students.filter(t=>t.roomId===room.id && t.status==='Active').length; }


function renderRooms() {
  let rooms = DB.rooms.filter(r=>{
    const occ = getRoomOccupancy(r) > 0;
    if(roomFilter.status==='Occupied' && !occ) return false;
    if(roomFilter.status==='Vacant' && occ) return false;
    if(roomFilter.type!=='All' && r.typeId!==roomFilter.type) return false;
    if(roomFilter.floor!=='All' && r.floor!==roomFilter.floor) return false;
    if(roomFilter.search && !String(r.number).toLowerCase().includes(roomFilter.search.toLowerCase())) return false;
    return true;
  });

  const typeOptions = DB.settings.roomTypes.map(t=>`<option value="${t.id}" ${roomFilter.type===t.id?'selected':''}>${escHtml(t.name)}</option>`).join('');
  const floorOptions = DB.settings.floors.map(f=>`<option value="${f}" ${roomFilter.floor===f?'selected':''}>${f} Floor</option>`).join('');

  const cards = rooms.map(r=>{
    const type = getRoomType(r);
    const occ = getRoomOccupancy(r);
    const cap = type.capacity;
    const pct = cap>0?Math.round(occ/cap*100):0;
    const activeStudentNames = DB.students.filter(t=>t.roomId===r.id&&t.status==='Active').map(t=>t.name);
    return `<div class="room-card ${occ>0?'occupied':'vacant'}" onclick="showRoomDetail('${r.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="room-num">#${r.number}</div>
        <span class="badge ${occ>0?'badge-green':'badge-gold'}">${occ>0?'Occupied':'Vacant'}</span>
      </div>
      <div class="room-type" style="color:${escHtml(type.color)}">${escHtml(type.name)}</div>
      <div class="room-meta">
        <div class="room-meta-row"><span class="k">Floor</span><span class="v">${r.floor}</span></div>
        <div class="room-meta-row"><span class="k">Capacity</span><span class="v">${occ}/${cap} beds</span></div>
      </div>
      <div class="room-rent">${fmtPKR(r.rent)}/mo</div>
      <div class="room-occ-bar"><div class="room-occ-track"><div class="room-occ-fill" style="width:${pct}%;background:${escHtml(type.color)}"></div></div></div>
      ${activeStudentNames.length?`<div class="room-students">${activeStudentNames.map(n=>`<div class="room-student-name">• ${escHtml(n)}</div>`).join('')}</div>`:''}
      <div style="margin-top:10px;display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" style="flex:1;font-size:11px" onclick="event.stopPropagation();showEditRoomModal('${r.id}')">Edit</button>
        ${occ<cap
          ? `<button class="btn btn-primary btn-sm" style="flex:1;font-size:11px" onclick="event.stopPropagation();showAddStudentModal('${r.id}')">+ Student</button>`
          : `<button class="btn btn-sm" style="flex:1;font-size:11px;background:var(--amber);color:#000;border:1px solid var(--amber)" onclick="event.stopPropagation();showAddStudentModal('${r.id}')" title="Room is full — force add anyway">⚡ Force Add</button>`}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="filter-bar">
    <div class="search-wrap" style="max-width:200px">
      <svg class="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input class="form-control" id="search-rooms" placeholder="Room number…" value="${escHtml(roomFilter.search)}" oninput="capFirstChar(this);roomFilter.search=this.value;_dRooms();toggleClearBtn('search-rooms','clear-rooms')">
      <button class="search-clear ${roomFilter.search?'visible':''}" id="clear-rooms" onclick="roomFilter.search='';document.getElementById('search-rooms').value='';this.classList.remove('visible');renderPage('rooms')" title="Clear">✕</button>
    </div>
    <div class="filter-tabs">
      ${['All','Occupied','Vacant'].map(s=>`<button class="ftab ${roomFilter.status===s?'active':''}" onclick="roomFilter.status='${s}';renderPage('rooms')">${s}</button>`).join('')}
    </div>
    <select class="form-control" style="width:140px" onchange="roomFilter.type=this.value;renderPage('rooms')">
      <option value="All">All Types</option>${typeOptions}
    </select>
    <select class="form-control" style="width:140px" onchange="roomFilter.floor=this.value;renderPage('rooms')">
      <option value="All">All Floors</option>${floorOptions}
    </select>
    <span class="text-muted" style="font-size:12px;margin-left:auto">${rooms.length} rooms</span>
  </div>
  <div class="room-grid">${cards||'<div class="empty-state"><div class="icon">🏠</div><h3>No rooms found</h3></div>'}</div>`;
}

function showRoomDetail(id) {
  const r = DB.rooms.find(x=>x.id===id); if(!r) return;
  const type = getRoomType(r);
  const occ = getRoomOccupancy(r);
  const activeStudents = DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');
  showModal('modal-md',`Room #${r.number} — ${type.name}`,`
    <div class="form-grid">
      <div class="card" style="padding:14px"><div class="stat-label">Type</div><div style="font-weight:700;color:${type.color}">${escHtml(type.name)}</div></div>
      <div class="card" style="padding:14px"><div class="stat-label">Floor</div><div style="font-weight:700">${r.floor}</div></div>
      <div class="card" style="padding:14px"><div class="stat-label">Capacity</div><div style="font-weight:700">${occ}/${type.capacity} occupied</div></div>
      <div class="card" style="padding:14px"><div class="stat-label">Monthly Rent</div><div style="font-weight:700;color:var(--green)">${fmtPKR(r.rent)}</div></div>
    </div>
    <div style="margin-top:14px"><div class="stat-label" style="margin-bottom:8px">Amenities</div><div class="tag-list">${(r.amenities||[]).map(a=>`<div class="tag-item">${escHtml(a)}</div>`).join('')||'<span class="text-muted">None listed</span>'}</div></div>
    ${activeStudents.length?`<div style="margin-top:14px"><div class="stat-label" style="margin-bottom:8px">Current Students</div>${activeStudents.map(t=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div class="avatar" style="background:var(--gold-dim);color:var(--gold)">${t.name[0]}</div><div><div style="font-weight:600">${escHtml(t.name)}</div><div class="td-sub">${escHtml(t.phone||'—')}</div></div><div class="ml-auto text-green fw-700">${fmtPKR(t.rent)}</div></div>`).join('')}</div>`:''}
    ${r.notes?`<div style="margin-top:14px;background:var(--bg3);border-radius:var(--radius-sm);padding:12px"><div class="stat-label" style="margin-bottom:4px">Notes</div><div style="font-size:13px;color:var(--text2)">${escHtml(r.notes)}</div></div>`:''}
  `,`<button class="btn btn-secondary" onclick="closeModal();showEditRoomModal('${r.id}')">Edit Room</button><button class="btn btn-primary" onclick="closeModal()">Close</button>`);
}

function showAddRoomModal(presetId='') {
  const typeOpts = DB.settings.roomTypes.map(t=>`<option value="${t.id}">${escHtml(t.name)}</option>`).join('');
  const floorOpts = DB.settings.floors.map(f=>`<option value="${f}">${f} Floor</option>`).join('');
  showModal('modal-lg','Add New Room',`
    <div class="form-grid">
      <div class="field"><label>Room Name / Number *</label>
        <input class="form-control" id="f-rnum" placeholder="e.g. A 01, B 02-a, B 02-b" maxlength="12" autocomplete="off"
          oninput="formatRoomNumber(this)"
          style="font-weight:700;letter-spacing:1px">
        <div style="font-size:10px;color:var(--text3);margin-top:3px">First letter AUTO-capitals · numbers · suffix in small (a, b…)</div>
      </div>
      <div class="field"><label>Floor *</label><select class="form-control" id="f-rfloor">${floorOpts}</select></div>
      <div class="field"><label>Room Type *</label><select class="form-control" id="f-rtype">${typeOpts}</select></div>

      <div class="field col-full"><label>Amenities (comma separated)</label><input class="form-control" id="f-ramen" value="Fan, Bed, Wardrobe, Attached Bath"></div>
      <div class="field col-full"><label>Notes</label><textarea class="form-control" id="f-rnotes"></textarea></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitAddRoom()">Add Room</button>`);
  // Live preview: update when number changes
  setTimeout(()=>{
    const ni=document.getElementById('f-rnum');
    const pr=document.getElementById('f-rnum-preview');
    if(ni&&pr){ ni.addEventListener('input',()=>{ pr.textContent=ni.value||'Preview'; }); }
  },100);
}
async function submitAddRoom() {
  const num=(document.getElementById('f-rnum').value||'').trim().toUpperCase();
  const floor=document.getElementById('f-rfloor').value;
  const typeId=document.getElementById('f-rtype').value;
  // Rent auto-derived from Room Type — no manual override to avoid conflicts with Settings rent update
  const _roomTypeObj = DB.settings.roomTypes.find(t=>t.id===typeId);
  const rent = _roomTypeObj?.defaultRent || 0;
  if(!num||!floor||!typeId){toast('Fill all required fields','error');return;}
  if(DB.rooms.find(r=>String(r.number).toUpperCase()===num)){toast('Room name already exists','error');return;}
  const amenities=document.getElementById('f-ramen').value.split(',').map(s=>s.trim()).filter(Boolean);
  const notes=document.getElementById('f-rnotes').value;
  DB.rooms.push({id:'room_'+uid(),number:num,floor,typeId,rent,studentIds:[],amenities,notes});
  DB.rooms.sort((a,b)=>String(a.number).localeCompare(String(b.number)));
  logActivity('Room Added', 'Room #'+num+' ('+floor+' Floor)', 'Room');
  await saveDB(); closeModal(); renderPage('rooms'); toast('Room added successfully','success');
}

function showEditRoomModal(id) {
  const r=DB.rooms.find(x=>x.id===id); if(!r) return;
  const typeOpts=DB.settings.roomTypes.map(t=>`<option value="${t.id}" ${r.typeId===t.id?'selected':''}>${escHtml(t.name)}</option>`).join('');
  const floorOpts=DB.settings.floors.map(f=>`<option value="${f}" ${r.floor===f?'selected':''}>${f} Floor</option>`).join('');
  showModal('modal-md',`Edit Room #${r.number}`,`
    <div class="form-grid">
      <div class="field"><label>Room Name / Number</label>
        <input class="form-control" id="f-rnum" maxlength="12" value="${r.number}"
          oninput="formatRoomNumber(this)"
          style="font-weight:700;letter-spacing:1px"></div>
      <div class="field"><label>Floor</label><select class="form-control" id="f-rfloor">${floorOpts}</select></div>
      <div class="field"><label>Room Type</label><select class="form-control" id="f-rtype">${typeOpts}</select></div>
      <div class="field col-full"><label>Amenities (comma separated)</label><input class="form-control" id="f-ramen" value="${escHtml((r.amenities||[]).join(', '))}"></div>
      <div class="field col-full"><label>Notes</label><textarea class="form-control" id="f-rnotes">${escHtml(r.notes||'')}</textarea></div>
    </div>`,
  `<button class="btn btn-danger" onclick="confirmDeleteRoom('${id}')">Delete Room</button><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEditRoom('${id}')">Save Changes</button>`);
}
async function submitEditRoom(id) {
  const r=DB.rooms.find(x=>x.id===id); if(!r) return;
  const newNum=(document.getElementById('f-rnum').value||'').trim().toUpperCase()||r.number;
  r.floor=document.getElementById('f-rfloor').value;
  r.typeId=document.getElementById('f-rtype').value;
  // Sync rent from room type — keeps rent consistent with Settings
  const _editedType = DB.settings.roomTypes.find(t=>t.id===r.typeId);
  if (_editedType) r.rent = _editedType.defaultRent;
  r.number=newNum;
  const oldNumber = r.number;
  r.amenities=document.getElementById('f-ramen').value.split(',').map(s=>s.trim()).filter(Boolean);
  r.notes=document.getElementById('f-rnotes').value;
  // Sync room number in payments and cancellations if changed
  if(String(r.number) !== String(oldNumber)) {
    DB.payments.filter(p=>p.roomId===r.id).forEach(p=>{ p.roomNumber=r.number; });
    DB.cancellations && DB.cancellations.filter(c=>c.roomId===r.id).forEach(c=>{ c.roomNumber=r.number; });
  }
  logActivity('Room Updated', 'Room #'+r.number, 'Room');
  await saveDB(); closeModal(); renderPage('rooms'); toast('Room updated','success');
}
async function confirmDeleteRoom(id) {
  const r=DB.rooms.find(x=>x.id===id); if(!r) return;
  if(getRoomOccupancy(r)>0){toast('Cannot delete occupied room','error');return;}
  closeModal();
  showConfirm(`Delete Room #${r.number}?`,'This cannot be undone.',(async ()=>{
    DB.rooms=DB.rooms.filter(x=>x.id!==id);
    logActivity('Room Deleted', 'Room #'+r.number, 'Room');
    await saveDB(); renderPage('rooms'); toast('Room deleted','info');
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// TENANTS
// ════════════════════════════════════════════════════════════════════════════
let studentFilter = {status:'All', search:''};