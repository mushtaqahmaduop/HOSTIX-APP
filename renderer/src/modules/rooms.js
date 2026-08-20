/* ─── HOSTIX — ROOMS MODULE ─────────────────────────────────────────────────
   Contains: renderRooms, showRoomDetail, showAddRoomModal, submitAddRoom,
             showEditRoomModal, submitEditRoom, confirmDeleteRoom
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function getTypeById(id) { return DB.settings.roomTypes.find(t=>t.id===id)||DB.settings.roomTypes[0]; }
function getRoomType(room) { return getTypeById(room.typeId); }
// getRoomOccupancy includes ALL active students (regular + force-added) — used for physical seat display
function getRoomOccupancy(room) { return DB.students.filter(t=>t.roomId===room.id && t.status==='Active').length; }


function setRoomSort(v) {
  const parts = (v||'').split('|');
  roomFilter.sortKey = parts[0] || null;
  roomFilter.sortDir = parts[1] || 'asc';
  roomFilter.page = 1;
  renderPage('rooms');
}

function renderRooms() {
  /* THE BED IS OCCUPIED UNTIL THEY ACTUALLY GO.

     This page filtered on status==='Active', so a student on the cancellation
     list vanished from their room the moment the request was raised — the bed
     read Vacant for the three or four weeks they were still sleeping in it,
     and the warden could book it to somebody else. Every other screen already
     asks isResident(), which counts 'Cancelling'; this page was the one that
     still disagreed with them, so the Rooms page and the dashboard reported
     different occupancy for the same hostel.

     Occupancy is isResident() now, and the bed is instead MARKED: the occupant
     carries the date they leave, so the warden can see the seat is spoken for
     and when it frees, which is the thing they actually needed to know. */
  const _vacatingBy = new Map();   // studentId → vacate date, pending requests only
  for (const c of (DB.cancellations || [])) {
    if (c && c.status === 'Pending' && c.studentId) _vacatingBy.set(c.studentId, c.vacateDate || '');
  }

  // PERF: compute resident count + occupants per room in ONE pass over students,
  // instead of scanning all students for every room (was O(rooms × students), 3×).
  const _activeByRoom = new Map();
  for (const t of DB.students) {
    if (!isResident(t)) continue;
    let e = _activeByRoom.get(t.roomId);
    if (!e) { e = { count: 0, names: [], people: [], vacating: 0 }; _activeByRoom.set(t.roomId, e); }
    const leaves = _vacatingBy.has(t.id) ? (_vacatingBy.get(t.id) || '') : null;
    e.count++; e.names.push(t.name);
    e.people.push({ id: t.id, name: t.name, leaves });
    if (leaves !== null) e.vacating++;
  }
  const _occOf = id => (_activeByRoom.get(id) ? _activeByRoom.get(id).count : 0);
  const _vacOf = id => (_activeByRoom.get(id) ? _activeByRoom.get(id).vacating : 0);

  let rooms = DB.rooms.filter(r=>{
    const occ = _occOf(r.id) > 0;
    if(roomFilter.status==='Occupied' && !occ) return false;
    if(roomFilter.status==='Vacant' && occ) return false;
    if(roomFilter.type!=='All' && r.typeId!==roomFilter.type) return false;
    if(roomFilter.floor!=='All' && r.floor!==roomFilter.floor) return false;
    if(roomFilter.search && !String(r.number).toLowerCase().includes(roomFilter.search.toLowerCase())) return false;
    return true;
  });

  const typeOptions = DB.settings.roomTypes.map(t=>`<option value="${t.id}" ${roomFilter.type===t.id?'selected':''}>${escHtml(t.name)}</option>`).join('');
  const floorOptions = DB.settings.floors.map(f=>`<option value="${f}" ${roomFilter.floor===f?'selected':''}>${f} Floor</option>`).join('');

  rooms = applySort(rooms, roomFilter, {
    number:    r => r.number,
    occupancy: r => _occOf(r.id),
    floor:     r => r.floor,
    type:      r => getRoomType(r).name
  });
  const _pg = paginate(rooms, roomFilter);

  // ── Stat strip — always describes the whole hostel, not the filtered view.
  const totalRooms = DB.rooms.length;
  const occRooms   = DB.rooms.filter(r=>_occOf(r.id)>0).length;
  const vacRooms   = totalRooms - occRooms;
  const totalBeds  = DB.rooms.reduce((s,r)=>s+(getRoomType(r)?.capacity||0),0);
  // isResident, to agree with _occOf above. Counting only 'Active' here made the
  // bed-occupancy percentage disagree with the room counts beside it in the very
  // same strip whenever anyone was on notice.
  const filledBeds = DB.students.filter(isResident).length;
  const occPct     = totalRooms?Math.round(occRooms/totalRooms*100):0;
  const vacPct     = totalRooms?Math.round(vacRooms/totalRooms*100):0;
  const bedPct     = totalBeds?Math.round(filledBeds/totalBeds*100):0;

  // Neutral placeholder when a room has no photo. The reference design shows
  // photographs; rather than ship decorative stock imagery that misrepresents
  // an actual room, an empty room draws this mark until a real photo is set
  // on it in Edit Room.
  // 32px, not 42px. The card header dropped from 112px to 96px when the grid
  // was tightened, and at that height the corner badges ("Occupied", "4/4
  // beds") clipped the corners of a 42px centred mark.
  const picPlaceholder = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M4 18v2"/><path d="M20 18v2"/><path d="M12 4v5"/></svg>';

  const cards = _pg.slice.map(r=>{
    const type = getRoomType(r);
    const occ  = _occOf(r.id);
    const cap  = type.capacity;
    const isFull = occ >= cap;
    const stateHue = occ>0 ? 'dh-green' : 'dh-violet';
    const people = _activeByRoom.get(r.id) ? _activeByRoom.get(r.id).people : [];
    const nVac = _vacOf(r.id);
    return `<div class="rms-card">
      <div class="rms-card__pic ${stateHue}" onclick="showRoomDetail('${r.id}')" title="Open room #${escHtml(String(r.number))}">
        ${r.photo?`<img src="${escHtml(r.photo)}" alt="Room ${escHtml(String(r.number))}">`:picPlaceholder}
        <span class="rms-card__state">${occ>0?'Occupied':'Vacant'}</span>
        <span class="rms-card__beds">${occ}/${cap} beds</span>
        ${nVac?`<span class="rms-card__vac" title="${nVac} of these beds ${nVac===1?'is':'are'} on notice and will free up">${nVac} vacating</span>`:''}
      </div>
      <div class="rms-card__body ${stateHue}">
        <div class="rms-card__num">#${escHtml(String(r.number))}</div>
        <span class="rms-card__type">${escHtml(type.name)}</span>

        <div class="rms-row">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/></svg>
          <span class="k">Floor</span><span class="v">${escHtml(r.floor||'—')} Floor</span>
        </div>
        <div class="rms-row">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
          <span class="k">Type</span><span class="v">${cap} bed${cap===1?'':'s'}</span>
        </div>

        ${/* The chip used to re-find the student by NAME and status 'Active' —
              so two students with the same name opened whichever came first,
              and a student on notice matched nothing at all and lost their
              click. The occupant carries its own id now. */''}
        ${people.length?`<div class="rms-occ">${people.map(p=>{
          const leaving = p.leaves !== null;
          const when = leaving ? (p.leaves ? fmtDate(p.leaves) : 'end of month') : '';
          return `<span class="rms-occ__chip${leaving?' is-vacating':''}" onclick="event.stopPropagation();showViewStudentModal('${p.id}')" title="${leaving?`Leaving ${escHtml(when)} — bed stays theirs until then`:`Open ${escHtml(p.name)}`}"><i></i><span>${escHtml(p.name)}</span>${leaving?`<b class="rms-occ__vac">${escHtml(when)}</b>`:''}</span>`;
        }).join('')}</div>`:''}

        <div class="rms-acts">
          <button onclick="event.stopPropagation();showEditRoomModal('${r.id}')">Edit</button>
          ${isFull
            ? `<button class="rms-force" onclick="event.stopPropagation();showAddStudentModal('${r.id}')" title="Room is full — add anyway">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/></svg>
                 Force Add</button>`
            : `<button class="rms-add" onclick="event.stopPropagation();showAddStudentModal('${r.id}')">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                 Student</button>`}
        </div>
      </div>
    </div>`;
  }).join('');

  const listRows = _pg.slice.map(r=>{
    const type = getRoomType(r);
    const occ  = _occOf(r.id);
    const cap  = type.capacity;
    const people = _activeByRoom.get(r.id) ? _activeByRoom.get(r.id).people : [];
    const nVac = _vacOf(r.id);
    return `<tr onclick="showRoomDetail('${r.id}')" style="cursor:pointer">
      <td><span class="num">#${escHtml(String(r.number))}</span></td>
      <td>${escHtml(type.name)}</td>
      <td>${escHtml(r.floor||'—')} Floor</td>
      <td>${occ}/${cap}${nVac?`<span class="rms-vac-note" title="${nVac} on notice">−${nVac}</span>`:''}</td>
      <td><span class="rms-card__state ${occ>0?'dh-green':'dh-violet'}" style="position:static">${occ>0?'Occupied':'Vacant'}</span></td>
      <td>${people.length?people.map(p=>escHtml(p.name)+(p.leaves!==null?` <span class="rms-vac-note">leaves ${escHtml(p.leaves?fmtDate(p.leaves):'end of month')}</span>`:'')).join(', '):'<span style="color:var(--text3)">—</span>'}</td>
      <td onclick="event.stopPropagation()">
        <div class="rms-acts" style="margin:0;padding:0">
          <button onclick="showEditRoomModal('${r.id}')" style="flex:none;padding:0 12px">Edit</button>
          <button class="${occ>=cap?'rms-force':'rms-add'}" onclick="showAddStudentModal('${r.id}')" style="flex:none;padding:0 12px">${occ>=cap?'Force Add':'+ Student'}</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const sortCur = (roomFilter.sortKey||'')+'|'+roomFilter.sortDir;
  const sortOpt = (v,l)=>`<option value="${v}" ${sortCur===v?'selected':''}>${l}</option>`;

  return `
  <!-- ══ STAT STRIP ══ -->
  <div class="rms-stats">
    <div class="rms-stat dh-violet">
      <div class="rms-stat__top">
        <div class="rms-stat__chip"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 7h.01"/><path d="M9 11h.01"/><path d="M9 15h.01"/><path d="M15 7h.01"/><path d="M15 11h.01"/><path d="M15 15h.01"/></svg></div>
        <div>
          <div class="rms-stat__label">Total Rooms</div>
          <div class="rms-stat__val">${totalRooms}</div>
          <div class="rms-stat__sub">All rooms</div>
        </div>
      </div>
    </div>

    <div class="rms-stat dh-green">
      <div class="rms-stat__top">
        <div class="rms-stat__chip"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m9 12 2 2 4-4"/></svg></div>
        <div>
          <div class="rms-stat__label">Occupied</div>
          <div class="rms-stat__val">${occRooms}<small> / ${totalRooms}</small></div>
          <div class="rms-stat__sub">${occPct}% occupancy</div>
        </div>
      </div>
      <div class="rms-stat__bar"><i style="width:${occPct}%"></i></div>
    </div>

    <div class="rms-stat dh-amber">
      <div class="rms-stat__top">
        <div class="rms-stat__chip"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21.41 8.59 15.41 2.59a2 2 0 0 0-2.82 0L11 4.18a1 1 0 0 0 0 1.42l7.4 7.4a1 1 0 0 0 1.42 0l1.59-1.59a2 2 0 0 0 0-2.82Z"/><path d="M9.5 11.5a4 4 0 0 0-4 .89l-3.21 3.2a1 1 0 0 0-.29.7v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 1-1v-1h1"/></svg></div>
        <div>
          <div class="rms-stat__label">Vacant</div>
          <div class="rms-stat__val">${vacRooms}<small> rooms</small></div>
          <div class="rms-stat__sub">${vacPct}% available</div>
        </div>
      </div>
      <div class="rms-stat__bar"><i style="width:${vacPct}%"></i></div>
    </div>

    <div class="rms-stat dh-violet">
      <div class="rms-stat__top">
        <div class="rms-stat__chip"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M4 18v2"/><path d="M20 18v2"/></svg></div>
        <div>
          <div class="rms-stat__label">Total Beds</div>
          <div class="rms-stat__val">${totalBeds}</div>
          <div class="rms-stat__sub">${filledBeds} occupied</div>
        </div>
      </div>
      <div class="rms-stat__bar"><i style="width:${bedPct}%"></i></div>
    </div>
  </div>

  <!-- ══ TOOLBAR ══ -->
  <div class="rms-panel">
    <div class="rms-tools">
      <div class="rms-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="search-rooms" placeholder="Search by room number…" value="${escHtml(roomFilter.search)}"
          oninput="capFirstChar(this);roomFilter.search=this.value;roomFilter.page=1;_dRooms()">
      </div>

      <div class="rms-seg">
        ${['All','Occupied','Vacant'].map(s=>`<button class="${roomFilter.status===s?'is-on':''}" onclick="roomFilter.status='${s}';roomFilter.page=1;renderPage('rooms')">${s}</button>`).join('')}
      </div>

      <select class="rms-select${roomFilter.type!=='All'?' is-set':''}" onchange="roomFilter.type=this.value;roomFilter.page=1;renderPage('rooms')" title="Filter by room type">
        <option value="All">All Types</option>${typeOptions}
      </select>
      <select class="rms-select${roomFilter.floor!=='All'?' is-set':''}" onchange="roomFilter.floor=this.value;roomFilter.page=1;renderPage('rooms')" title="Filter by floor">
        <option value="All">All Floors</option>${floorOptions}
      </select>
      <select class="rms-select${roomFilter.sortKey?' is-set':''}" onchange="setRoomSort(this.value)" title="Sort rooms">
        ${sortOpt('|asc','Sort: Default')}
        ${sortOpt('number|asc','Room # ↑')}
        ${sortOpt('occupancy|desc','Occupancy ↓')}
        ${sortOpt('floor|asc','Floor ↑')}
      </select>

      <button class="rms-btn" style="margin-left:auto" onclick="exportRoomsCSV()" title="Export the current list to CSV">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        CSV
      </button>
      <button class="rms-btn" onclick="printSeatAvailability()" title="Print a room + occupancy sheet by floor">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        Print
      </button>
    </div>
  </div>

  <!-- ══ ROOMS ══ -->
  <div class="rms-shell">
    <div class="rms-head">
      <div class="rms-head__t">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
        Rooms (${rooms.length})
      </div>
      <div class="rms-view">
        <button class="${roomFilter.view!=='list'?'is-on':''}" onclick="setRoomView('grid')" title="Grid view">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
        </button>
        <button class="${roomFilter.view==='list'?'is-on':''}" onclick="setRoomView('list')" title="List view">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
        </button>
      </div>
    </div>

    ${_pg.slice.length===0
      ? `<div class="rms-empty">
           <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
           <div>No rooms match these filters.</div>
         </div>`
      : roomFilter.view === 'list'
        ? `<div class="rms-list"><table>
             <thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Beds</th><th>Status</th><th>Occupants</th><th>Actions</th></tr></thead>
             <tbody>${listRows}</tbody>
           </table></div>`
        : `<div class="rms-grid">${cards}</div>`}
  </div>
  ${renderPager(_pg, 'roomFilter', 'rooms')}`;
}

function setRoomView(v) {
  roomFilter.view = v;
  renderPage('rooms');
}

// Export the currently filtered + sorted rooms to CSV. (Mirrors renderRooms' filter/sort.)
function exportRoomsCSV() {
  const activeByRoom = new Map();
  for (const t of DB.students) { if(t.status!=='Active') continue; activeByRoom.set(t.roomId,(activeByRoom.get(t.roomId)||0)+1); }
  const occ = id => activeByRoom.get(id)||0;
  let rooms = DB.rooms.filter(r=>{
    const o = occ(r.id) > 0;
    if(roomFilter.status==='Occupied' && !o) return false;
    if(roomFilter.status==='Vacant' && o) return false;
    if(roomFilter.type!=='All' && r.typeId!==roomFilter.type) return false;
    if(roomFilter.floor!=='All' && r.floor!==roomFilter.floor) return false;
    if(roomFilter.search && !String(r.number).toLowerCase().includes(roomFilter.search.toLowerCase())) return false;
    return true;
  });
  rooms = applySort(rooms, roomFilter, {
    number:r=>r.number, occupancy:r=>occ(r.id),
    floor:r=>r.floor, type:r=>getRoomType(r).name
  });
  const rows=[['Room','Type','Floor','Capacity','Occupied','Vacant','Status','Students']];
  rooms.forEach(r=>{
    const t=getRoomType(r); const o=occ(r.id);
    const names=DB.students.filter(s=>s.roomId===r.id&&s.status==='Active').map(s=>s.name).join('; ');
    rows.push(['#'+r.number,t.name,r.floor,t.capacity,o,Math.max(0,t.capacity-o),o>0?'Occupied':'Vacant',names]);
  });
  downloadCSV(rows, 'Rooms_'+today()+'.csv');
}

function showRoomDetail(id) {
  const r = DB.rooms.find(x=>x.id===id); if(!r) return;
  const type = getRoomType(r);
  const occ = getRoomOccupancy(r);
  const activeStudents = DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');
  showModal('modal-md',`Room #${r.number} — ${type.name}`,`
    <div class="forms-grid">
      <div class="card" style="padding:14px"><div class="stat-label">Type</div><div style="font-weight:700;color:var(--text)">${escHtml(type.name)}</div></div>
      <div class="card" style="padding:14px"><div class="stat-label">Floor</div><div style="font-weight:700">${r.floor}</div></div>
      <div class="card" style="padding:14px"><div class="stat-label">Capacity</div><div style="font-weight:700">${occ}/${type.capacity} occupied</div></div>
    </div>
    <div style="margin-top:14px"><div class="stat-label" style="margin-bottom:8px">Amenities</div><div class="tag-list">${(r.amenities||[]).map(a=>`<div class="tag-item">${escHtml(a)}</div>`).join('')||'<span class="text-muted">None listed</span>'}</div></div>
    ${activeStudents.length?`<div style="margin-top:14px"><div class="stat-label" style="margin-bottom:8px">Current Students</div>${activeStudents.map(t=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div class="avatar" style="background:var(--accent-dim);color:var(--accent)">${t.name[0]}</div><div><div style="font-weight:600">${escHtml(t.name)}</div><div class="td-sub">${escHtml(t.phone||'—')}</div></div></div>`).join('')}</div>`:''}
    ${r.notes?`<div style="margin-top:14px;background:var(--bg3);border-radius:var(--radius-sm);padding:12px"><div class="stat-label" style="margin-bottom:4px">Notes</div><div style="font-size:13px;color:var(--text2)">${escHtml(r.notes)}</div></div>`:''}
  `,`<button class="btn btn-secondary" onclick="closeModal();showEditRoomModal('${r.id}')">Edit Room</button><button class="btn btn-primary" onclick="closeModal()">Close</button>`);
}

/* ── Amenity picker ────────────────────────────────────────────────────────────
   The add/edit room forms used to take amenities as one comma-separated text
   box, so every hostel spelled "Attached Bath" a different way and the room
   card chips never matched between rooms. The picker below offers the known
   set as toggles and keeps a free-text "Other" for anything site-specific.

   It writes back into a hidden #f-ramen input in exactly the comma-separated
   shape submitAddRoom/submitEditRoom already parse, so the save path and the
   stored data are unchanged — only the way the user picks them is new. */
const ROOM_AMENITIES = [
  { label:'Fan',           icon:'fan',       hue:'dh-slate'  },
  { label:'Bed',           icon:'bed',       hue:'dh-slate'  },
  { label:'Wardrobe',      icon:'wardrobe',  hue:'dh-blue'   },
  { label:'Attached Bath', icon:'bath',      hue:'dh-green'  },
  { label:'Study Table',   icon:'desk',      hue:'dh-slate'  },
  { label:'Chair',         icon:'armchair',  hue:'dh-slate'  },
  { label:'AC',            icon:'snowflake', hue:'dh-blue'   },
  { label:'Heater',        icon:'flame',     hue:'dh-red'    },
  { label:'Wi-Fi',         icon:'wifi',      hue:'dh-blue'   },
  { label:'TV',            icon:'tv',        hue:'dh-violet' },
  { label:'Refrigerator',  icon:'fridge',    hue:'dh-blue'   },
  { label:'Balcony',       icon:'balcony',   hue:'dh-blue'   },
  { label:'Water Cooler',  icon:'droplet',   hue:'dh-blue'   },
  { label:'Geyser',        icon:'flame',     hue:'dh-amber'  },
  { label:'Curtains',      icon:'blinds',    hue:'dh-amber'  },
];
const ROOM_AMENITY_DEFAULTS = ['Fan','Bed','Wardrobe','Attached Bath'];

/** Renders the amenity toggle grid + the hidden #f-ramen the submitters read. */
function roomAmenityGrid(selected) {
  const chosen = (selected || []).map(a => String(a).trim()).filter(Boolean);
  const known  = ROOM_AMENITIES.map(a => a.label.toLowerCase());
  // Anything stored that isn't one of the known toggles becomes the "Other" text.
  const other  = chosen.filter(a => !known.includes(a.toLowerCase()));
  const isOn   = label => chosen.some(a => a.toLowerCase() === label.toLowerCase());

  const cells = ROOM_AMENITIES.map(a => `
    <label class="arm-amen ${a.hue}${isOn(a.label) ? ' is-on' : ''}">
      <input type="checkbox" value="${escHtml(a.label)}" ${isOn(a.label) ? 'checked' : ''}
             onchange="this.closest('.arm-amen').classList.toggle('is-on',this.checked);syncRoomAmenities()">
      <span class="arm-amen__tick">${icon('checkmark','xs')}</span>
      <span class="arm-amen__ico">${icon(a.icon,'sm')}</span>
      <span class="arm-amen__txt">${escHtml(a.label)}</span>
    </label>`).join('');

  return `
    <div class="arm-amen-head">
      <span class="arm-amen-head__t">Amenities</span>
      <span class="arm-amen-head__hint">Select all that apply</span>
      <span class="arm-amen-head__count" id="f-ramen-count">0 selected</span>
    </div>
    <div class="arm-amen-grid" id="f-ramen-grid">
      ${cells}
      <label class="arm-amen dh-slate arm-amen--other${other.length ? ' is-on' : ''}">
        <input type="checkbox" id="f-ramen-other-on" ${other.length ? 'checked' : ''}
               onchange="this.closest('.arm-amen').classList.toggle('is-on',this.checked);syncRoomAmenities()">
        <span class="arm-amen__tick">${icon('checkmark','xs')}</span>
        <span class="arm-amen__ico">${icon('ellipsis','sm')}</span>
        <input class="arm-amen__free" id="f-ramen-other" placeholder="Other (specify)"
               value="${escHtml(other.join(', '))}" autocomplete="off"
               onclick="event.preventDefault();event.stopPropagation()"
               oninput="syncRoomAmenities()">
      </label>
    </div>
    <input type="hidden" id="f-ramen" value="${escHtml(chosen.join(', '))}">`;
}

/** Collects the toggles + free text back into #f-ramen. */
function syncRoomAmenities() {
  const grid = document.getElementById('f-ramen-grid');
  const out  = document.getElementById('f-ramen');
  if (!grid || !out) return;
  const picked = [...grid.querySelectorAll('.arm-amen:not(.arm-amen--other) input:checked')]
    .map(i => i.value);
  if (document.getElementById('f-ramen-other-on')?.checked) {
    (document.getElementById('f-ramen-other')?.value || '')
      .split(',').map(s => s.trim()).filter(Boolean).forEach(s => picked.push(s));
  }
  out.value = picked.join(', ');
  const count = document.getElementById('f-ramen-count');
  if (count) count.textContent = picked.length + ' selected';
}

/** Live preview of the room exactly as it will be stored (no invented values). */
function syncRoomPreview() {
  const name = (document.getElementById('f-rnum')?.value || '').trim();
  const code = document.getElementById('f-rcode');
  if (code) {
    code.textContent = name ? '#' + name : '—';
    code.classList.toggle('is-empty', !name);
  }
  const typeId = document.getElementById('f-rtype')?.value;
  const type   = DB.settings.roomTypes.find(t => t.id === typeId);
  const meta   = document.getElementById('f-rcode-meta');
  if (meta) {
    meta.textContent = type
      ? `${document.getElementById('f-rfloor')?.value || ''} Floor · ${type.capacity} bed${type.capacity === 1 ? '' : 's'} · rent ${fmtPKR(type.defaultRent || 0)}/month`
      : 'Pick a floor and room type';
  }
}

function showAddRoomModal(presetId='') {
  const typeOpts = DB.settings.roomTypes.map(t=>`<option value="${t.id}">${escHtml(t.name)}</option>`).join('');
  const floorOpts = DB.settings.floors.map(f=>`<option value="${f}">${f} Floor</option>`).join('');
  showModal('modal-lg', roomModalTitle('doorOpen','Add New Room','Register a new room or unit in your hostel'), `
    <div class="arm">
      <div class="arm-guide">
        <span class="arm-guide__ico">${icon('info','sm')}</span>
        <div>
          <div class="arm-guide__t">Room Naming Guide</div>
          <div class="arm-guide__b">Use letters and numbers (e.g. A 01, B 02-a, B 02-b). The first letter is
            auto-capitalised; keep numbers and the suffix in small letters (a, b…).</div>
        </div>
      </div>

      <div class="arm-card">
        <label class="arm-label" for="f-rnum">Room Name / Number <i>*</i></label>
        <div class="arm-input dh-violet">
          <span class="arm-input__ico">${icon('doorOpen','sm')}</span>
          <input id="f-rnum" placeholder="e.g. A 01, B 02-a, B 02-b" maxlength="12" autocomplete="off"
                 oninput="formatRoomNumber(this);syncRoomPreview()">
        </div>
        <div class="arm-hint">First letter auto-capitalised, numbers and suffix in small letters (a, b…).</div>
      </div>

      <div class="arm-split">
        <div class="arm-card">
          <label class="arm-label" for="f-rfloor">Floor <i>*</i></label>
          <div class="arm-input dh-blue">
            <span class="arm-input__ico">${icon('building','sm')}</span>
            <select id="f-rfloor" onchange="syncRoomPreview()">${floorOpts}</select>
          </div>
          <label class="arm-label" for="f-rtype" style="margin-top:16px">Room Type <i>*</i></label>
          <div class="arm-input dh-violet">
            <span class="arm-input__ico">${icon('bed','sm')}</span>
            <select id="f-rtype" onchange="syncRoomPreview()">${typeOpts}</select>
          </div>
        </div>

        <div class="arm-card">
          <label class="arm-label">Room Preview</label>
          <div class="arm-input dh-amber is-readonly">
            <span class="arm-input__ico">${icon('code','sm')}</span>
            <span class="arm-code is-empty" id="f-rcode">—</span>
          </div>
          <div class="arm-hint" id="f-rcode-meta">Pick a floor and room type</div>
          <label class="arm-label" for="f-rnotes" style="margin-top:16px">Notes</label>
          <div class="arm-input dh-amber is-area">
            <span class="arm-input__ico">${icon('fileText','sm')}</span>
            <textarea id="f-rnotes" rows="3" placeholder="Add any additional notes about this room…"></textarea>
          </div>
          <div class="arm-hint">Optional notes or special instructions</div>
        </div>
      </div>

      <div class="arm-card">${roomAmenityGrid(ROOM_AMENITY_DEFAULTS)}</div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${icon('close','sm')} Cancel</button>
     <button class="btn btn-primary" onclick="submitAddRoom()">${icon('plus','sm')} Add Room</button>`);
  syncRoomAmenities();
  syncRoomPreview();
}

/** Shared rich modal heading — icon tile, title, one-line subtitle. */
function roomModalTitle(ico, title, sub) {
  return `<span class="arm-head">
    <span class="arm-head__ico">${icon(ico,'sm')}</span>
    <span><span class="arm-head__t">${escHtml(title)}</span><span class="arm-head__s">${escHtml(sub)}</span></span>
  </span>`;
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
  showModal('modal-lg', roomModalTitle('edit',`Edit Room #${r.number}`,'Update this room’s details, type and amenities'), `
    <div class="arm">
      <div class="arm-card">
        <label class="arm-label" for="f-rnum">Room Name / Number</label>
        <div class="arm-input dh-violet">
          <span class="arm-input__ico">${icon('doorOpen','sm')}</span>
          <input id="f-rnum" maxlength="12" value="${escHtml(String(r.number))}" autocomplete="off"
                 oninput="formatRoomNumber(this);syncRoomPreview()">
        </div>
        <div class="arm-hint">First letter auto-capitalised, numbers and suffix in small letters (a, b…).</div>
      </div>

      <div class="arm-split">
        <div class="arm-card">
          <label class="arm-label" for="f-rfloor">Floor</label>
          <div class="arm-input dh-blue">
            <span class="arm-input__ico">${icon('building','sm')}</span>
            <select id="f-rfloor" onchange="syncRoomPreview()">${floorOpts}</select>
          </div>
          <label class="arm-label" for="f-rtype" style="margin-top:16px">Room Type</label>
          <div class="arm-input dh-violet">
            <span class="arm-input__ico">${icon('bed','sm')}</span>
            <select id="f-rtype" onchange="syncRoomPreview()">${typeOpts}</select>
          </div>
        </div>

        <div class="arm-card">
          <label class="arm-label">Room Preview</label>
          <div class="arm-input dh-amber is-readonly">
            <span class="arm-input__ico">${icon('code','sm')}</span>
            <span class="arm-code" id="f-rcode">—</span>
          </div>
          <div class="arm-hint" id="f-rcode-meta">Pick a floor and room type</div>
          <label class="arm-label" for="f-rnotes" style="margin-top:16px">Notes</label>
          <div class="arm-input dh-amber is-area">
            <span class="arm-input__ico">${icon('fileText','sm')}</span>
            <textarea id="f-rnotes" rows="3" placeholder="Add any additional notes about this room…">${escHtml(r.notes||'')}</textarea>
          </div>
          <div class="arm-hint">Optional notes or special instructions</div>
        </div>
      </div>

      <div class="arm-card">${roomAmenityGrid(r.amenities||[])}</div>
    </div>`,
  `<button class="btn btn-danger" onclick="confirmDeleteRoom('${id}')">${icon('trash','sm')} Delete Room</button>
   <button class="btn btn-secondary" onclick="closeModal()">${icon('close','sm')} Cancel</button>
   <button class="btn btn-primary" onclick="submitEditRoom('${id}')">${icon('checkmark','sm')} Save Changes</button>`);
  syncRoomAmenities();
  syncRoomPreview();
}
async function submitEditRoom(id) {
  const r=DB.rooms.find(x=>x.id===id); if(!r) return;
  const newNum=(document.getElementById('f-rnum').value||'').trim().toUpperCase()||r.number;
  // Read BEFORE the write. oldNumber used to be captured on the line after
  // r.number was already overwritten, so it always equalled the new number, the
  // "did it change" test below was never true, and the sync never ran once:
  // renaming a room left every payment and cancellation stamped with the old
  // number forever, and the room filter on the Payments page then matched
  // nothing at all for that room.
  const oldNumber = r.number;
  // Two rooms answering to the same number make every lookup by number
  // ambiguous — Add Room has always refused it, Edit Room never checked.
  if (DB.rooms.some(x => x.id !== id && String(x.number).toUpperCase() === newNum)) {
    toast('Room '+newNum+' already exists — pick another number', 'error');
    return;
  }
  r.floor=document.getElementById('f-rfloor').value;
  r.typeId=document.getElementById('f-rtype').value;
  // Sync rent from room type — keeps rent consistent with Settings
  const _editedType = DB.settings.roomTypes.find(t=>t.id===r.typeId);
  if (_editedType) r.rent = _editedType.defaultRent;
  r.number=newNum;
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
  // Occupancy counts Active only. A student on the cancellation list is still
  // sleeping in the room until their vacate date, so the room they are in must
  // not be deletable out from under them either.
  const _living = DB.students.filter(t => t.roomId === r.id && isResident(t)).length;
  if(_living>0){toast('Cannot delete Room #'+r.number+' — '+_living+' student(s) still assigned to it','error');return;}
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
// Students v5 adds room / course selects, a page-size picker and a row-selection
// set, matching the payments screen.
let studentFilter = {status:'All', room:'All', course:'All', search:'',
                     pageSize:30, page:1, sortKey:null, sortDir:'asc'};
let stuSelected = new Set();