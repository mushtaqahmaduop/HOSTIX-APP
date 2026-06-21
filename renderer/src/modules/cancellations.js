/* ─── HOSTIX — CANCELLATIONS MODULE ────────────────────────────────────────
   Contains: renderCancellations, showEditCancellationModal,
             submitEditCancellation, deleteCancellationRecord,
             showAddCancellationModal, cancStudentSearch, selectCancStudent,
             prefillCancStudentInfo, saveCancellation, confirmCancellation,
             restoreFromCancellation, downloadCancellationReport
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function renderCancellations(filterStatus='All') {
  const list = DB.cancellations || [];
  const pending = list.filter(c=>c.status==='Pending');
  const confirmed = list.filter(c=>c.status==='Confirmed');
  const restored = list.filter(c=>c.status==='Restored');
  const freed = list.filter(c=>c.status==='Pending'||c.status==='Confirmed');
  const filtered = filterStatus==='All'?list:filterStatus==='Freed'?freed:list.filter(c=>c.status===filterStatus);

  const mkRow = (c) => {
    const student = DB.students.find(s=>s.id===c.studentId);
    const statusBadgeHtml = c.status==='Pending'
      ? '<span class="badge badge-red">⏳ Pending</span>'
      : c.status==='Confirmed'
        ? '<span class="badge badge-gray" style="background:rgba(224,82,82,0.1);color:var(--red);border-color:rgba(224,82,82,0.3)">'+icon('check','sm')+' Confirmed</span>'
        : '<span class="badge badge-green">↩️ Restored</span>';
    const actionBtns = c.status==='Pending'
      ? '<button class="btn btn-danger btn-sm" style="font-size:11px" onclick="confirmCancellation(\''+c.id+'\')"><span class=\"micon\" style=\"font-size:14px\">check_circle</span></button>'
        +'<button class="btn btn-success btn-sm" style="font-size:11px" onclick="restoreFromCancellation(\''+c.id+'\')">↩</button>'
      : c.status==='Confirmed'
        ? '<button class="btn btn-success btn-sm" style="font-size:11px" onclick="restoreFromCancellation(\''+c.id+'\')">↩ Restore</button>'
        : '';
    return `<tr style="cursor:pointer" onclick="showEditCancellationModal('${c.id}')">
      <td>
        <div style="font-weight:700;color:var(--blue)">${escHtml(c.studentName||'—')}</div>
        <div style="font-size:11px;color:var(--text3)">${escHtml(student?.phone||'')}</div>
      </td>
      <td><span style="font-size:15px;font-weight:900;color:var(--gold2)">#${c.roomNumber||'—'}</span></td>
      <td><span class="badge badge-gray">${escHtml(c.roomType||'—')}</span></td>
      <td class="text-muted" style="font-size:12px">${fmtDate(c.requestDate)}</td>
      <td class="text-muted" style="font-size:12px">${fmtDate(c.vacateDate)||'End of Month'}</td>
      <td>${statusBadgeHtml}</td>
      <td class="text-muted" style="font-size:12px;max-width:140px;white-space:normal">${escHtml(c.reason||'—')}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" style="font-size:11px" onclick="showEditCancellationModal('${c.id}')">✏️ Edit</button>
          ${actionBtns}
        </div>
      </td>
    </tr>`;
  };

  return `
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px">
    <div class="stat-card gold" onclick="renderPage('cancellations_All')" style="padding:18px 16px;text-align:center;cursor:pointer;position:relative;overflow:hidden${filterStatus==='All'?';border-color:var(--gold)':''}" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''">
      ${filterStatus==='All'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--gold)"></div>':''}
      <div class="stat-icon" style="width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 6px">${icon('list')}</div>
      <div class="stat-value" style="font-size:36px;line-height:1;margin-bottom:4px">${list.length}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${filterStatus==='All'?'var(--gold2)':'var(--text3)'}">All Records</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">${filterStatus==='All'?'▲ showing all':'click to show all'}</div>
    </div>
    <div class="stat-card red" onclick="renderPage('cancellations_Pending')" style="padding:18px 16px;text-align:center;cursor:pointer;position:relative;overflow:hidden${filterStatus==='Pending'?';border-color:var(--red)':''}" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''">
      ${filterStatus==='Pending'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--red)"></div>':''}
      <div class="stat-icon" style="width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 6px">🚨</div>
      <div class="stat-value" style="font-size:36px;line-height:1;margin-bottom:4px;color:var(--red)">${pending.length}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${filterStatus==='Pending'?'var(--red)':'var(--text3)'}">Pending</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">${filterStatus==='Pending'?'▲ showing':'Awaiting action'}</div>
    </div>
    <div class="stat-card teal" onclick="renderPage('cancellations_Confirmed')" style="padding:18px 16px;text-align:center;cursor:pointer;position:relative;overflow:hidden${filterStatus==='Confirmed'?';border-color:var(--teal)':''}" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''">
      ${filterStatus==='Confirmed'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--teal)"></div>':''}
      <div class="stat-icon" style="width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 6px">${icon('check')}</div>
      <div class="stat-value" style="font-size:36px;line-height:1;margin-bottom:4px">${confirmed.length}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${filterStatus==='Confirmed'?'var(--teal)':'var(--text3)'}">Confirmed</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">${filterStatus==='Confirmed'?'▲ showing':'Students left'}</div>
    </div>
    <div class="stat-card green" onclick="renderPage('cancellations_Restored')" style="padding:18px 16px;text-align:center;cursor:pointer;position:relative;overflow:hidden${filterStatus==='Restored'?';border-color:var(--green)':''}" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''">
      ${filterStatus==='Restored'?'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:var(--green)"></div>':''}
      <div class="stat-icon" style="width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 6px">↩️</div>
      <div class="stat-value" style="font-size:36px;line-height:1;margin-bottom:4px;color:var(--green)">${restored.length}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${filterStatus==='Restored'?'var(--green)':'var(--text3)'}">Restored</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">${filterStatus==='Restored'?'▲ showing':'Reversed cancels'}</div>
    </div>
  </div>

  <!-- Freed Seats banner clickable -->
  <div onclick="renderPage('cancellations_Freed')" style="background:${filterStatus==='Freed'?'var(--teal-dim)':'var(--card)'};border:1px solid ${filterStatus==='Freed'?'rgba(15,188,173,0.4)':'var(--border)'};border-radius:var(--radius);padding:14px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:var(--transition)" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px;border-radius:10px;background:var(--teal-dim);display:flex;align-items:center;justify-content:center;font-size:20px">${icon('bed','sm')}</div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--teal)">Freed Seats (Pending + Confirmed)</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">These seats are now vacant and available for new bookings</div>
      </div>
    </div>
    <div style="text-align:center">
      <div style="font-size:32px;font-weight:900;color:var(--teal)">${freed.length}</div>
      <div style="font-size:10px;color:var(--text3)">${filterStatus==='Freed'?'▲ showing':'click to filter'}</div>
    </div>
  </div>

  ${pending.length>0&&filterStatus==='All'?`
  <div style="background:rgba(224,82,82,0.07);border:1px solid rgba(224,82,82,0.25);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">${icon('warning','sm')}</span>
    <span style="font-size:12.5px;color:var(--text2)">${pending.length} pending cancellation${pending.length!==1?'s':''} await action — seats already freed. Click <strong style="color:var(--red)">Pending</strong> card above to view them.</span>
  </div>`:''}

  <div class="card">
    <div class="card-header">
      <div class="card-title">
        ${filterStatus==='All'?icon('list')+' All Cancellations':filterStatus==='Pending'?'🚨 Pending Cancellations':filterStatus==='Confirmed'?icon('check','sm')+' Confirmed Cancellations':filterStatus==='Restored'?'↩️ Restored Cancellations':icon('bed','sm')+' Freed Seats (Pending + Confirmed)'}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--text3)">${filtered.length} record${filtered.length!==1?'s':''}</span>
        <button class="btn btn-secondary btn-sm" style="font-size:11px" onclick="downloadCancellationReport()">⬇️ Download Report</button>
        ${filterStatus!=='All'?`<button class="btn btn-secondary btn-sm" onclick="renderPage('cancellations_All')">✕ Clear Filter</button>`:''}
      </div>
    </div>
    ${filtered.length===0?`<div class="empty-state" style="padding:32px"><div class="icon">${filterStatus==='Pending'?'🎉':icon('list')}</div><div>${filterStatus==='Pending'?'No pending cancellations!':'No records found'}</div></div>`:
    `<div class="table-wrap">
      <table><thead><tr><th>Student</th><th>Room</th><th>Type</th><th>Request Date</th><th>Vacate By</th><th>Status</th><th>Reason</th><th>Actions</th></tr></thead>
      <tbody>${filtered.map(c=>mkRow(c)).join('')}</tbody>
      </table>
    </div>`}
  </div>`;
}

function showEditCancellationModal(cancId) {
  const c = (DB.cancellations||[]).find(x=>x.id===cancId);
  if(!c) return;
  const student = DB.students.find(s=>s.id===c.studentId);
  const room = DB.rooms.find(r=>r.id===c.roomId);
  const statusOpts = ['Pending','Confirmed','Restored'].map(s=>`<option value="${s}" ${c.status===s?'selected':''}>${s==='Pending'?'⏳ Pending':s==='Confirmed'?'✅ Confirmed':'↩️ Restored'}</option>`).join('');

  showModal('modal-md','✏️ Edit Cancellation Record',`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:14px">
      <div style="width:40px;height:40px;border-radius:10px;background:var(--red-dim);display:flex;align-items:center;justify-content:center;font-size:18px">🚫</div>
      <div>
        <div style="font-weight:700;font-size:14px;color:var(--text)">${escHtml(c.studentName||'—')}</div>
        <div style="font-size:12px;color:var(--text3)">Room #${c.roomNumber||'?'} · ${escHtml(c.roomType||'—')} · ${escHtml(student?.phone||'No phone')}</div>
      </div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Status</label>
        <select class="form-control" id="f-cstatus" onchange="
          const v=this.value;
          document.getElementById('cancel-status-note').style.display=v==='Confirmed'?'block':'none';
          document.getElementById('restore-status-note').style.display=v==='Restored'?'block':'none';
        ">${statusOpts}</select>
        <div id="cancel-status-note" style="display:${c.status==='Confirmed'?'block':'none'};font-size:11px;color:var(--red);margin-top:4px">${icon('warning','sm')} Student will be marked as Left</div>
        <div id="restore-status-note" style="display:${c.status==='Restored'?'block':'none'};font-size:11px;color:var(--green);margin-top:4px">${icon('check','sm')} Student will be restored to Active</div>
      </div>
      <div class="field"><label>Vacate By Date</label><input class="form-control cdp-trigger" id="f-cvacate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${c.vacateDate||''}"></div>
      <div class="field col-full"><label>Reason / Notes</label><textarea class="form-control" id="f-creason" rows="3" placeholder="Reason for cancellation…">${escHtml(c.reason||'')}</textarea></div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
      <div><span style="color:var(--text3)">Requested:</span> <strong>${fmtDate(c.requestDate)}</strong></div>
      <div><span style="color:var(--text3)">Record ID:</span> <span style="font-family:var(--font-mono);color:var(--text3);font-size:10px">${c.id}</span></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-danger btn-sm" onclick="deleteCancellationRecord('${cancId}')"><span class=\"micon\" style=\"font-size:14px\">delete</span> Delete</button>
   <button class="btn btn-primary" onclick="submitEditCancellation('${cancId}')"><span class=\"micon\" style=\"font-size:14px\">save</span> Save</button>`);
}

async function submitEditCancellation(cancId) {
  const c = (DB.cancellations||[]).find(x=>x.id===cancId);
  if(!c) return;
  const newStatus = document.getElementById('f-cstatus').value;
  const oldStatus = c.status;
  c.vacateDate = document.getElementById('f-cvacate').value;
  c.reason = document.getElementById('f-creason').value.trim();
  c.status = newStatus;
  // Update student status accordingly
  const student = DB.students.find(s=>s.id===c.studentId);
  if(student) {
    if(newStatus==='Confirmed') {
      student.status='Left';
      student.leftDate = new Date().toISOString().slice(0,10);
      student.lastRoom = student.roomNumber || '';
    }
    else if(newStatus==='Restored') student.status='Active';
    else if(newStatus==='Pending') student.status='Cancelling';
  }
  await saveDB(); closeModal();
  renderPage('cancellations_'+newStatus);
  toast('Cancellation record updated','success');
}

async function deleteCancellationRecord(cancId) {
  const c = (DB.cancellations||[]).find(x=>x.id===cancId);
  if(!c) return;
  showConfirm('Delete Record','Are you sure you want to permanently delete this cancellation record? The student status will not be changed.',(async ()=>{
    DB.cancellations = (DB.cancellations||[]).filter(x=>x.id!==cancId);
    await saveDB(); closeModal(); renderPage('cancellations_All');
    toast('Record deleted','success');
  }));
}

function showAddCancellationModal() {
  const activeStudents = DB.students.filter(s=>s.status==='Active');
  const alreadyCancelling = (DB.cancellations||[]).filter(c=>c.status==='Pending').map(c=>c.studentId);
  const available = activeStudents.filter(s=>!alreadyCancelling.includes(s.id));
  const studentOpts = available.map(s=>{
    const room=DB.rooms.find(r=>r.id===s.roomId);
    return `<option value="${s.id}">👤 ${escHtml(s.name)} — Room #${room?room.number:'?'}</option>`;
  }).join('');

  if(available.length===0){
    toast('No active students available to cancel','error');
    return;
  }

  const endOfMonth = (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); d.setDate(0); return d.toISOString().split('T')[0]; })();

  showModal('modal-md','🚫 Add Cancellation Request',`
    <div style="background:var(--red-dim);border:1px solid rgba(224,82,82,0.25);border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:12.5px;color:var(--text2)">
      ${icon('warning','sm')} <strong>Note:</strong> Once added, the student's seat is immediately marked as <strong style="color:var(--red)">Vacant</strong> and available for new bookings.
    </div>
    <div class="form-grid">
      <div class="field col-full">
        <label>Search Student</label>
        <div style="position:relative">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3);pointer-events:none">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input class="form-control" id="canc-search" placeholder="Search by name, room #, student ID…"
            style="padding-left:32px;padding-right:32px"
            oninput="cancStudentSearch(this.value)"
            onfocus="cancStudentSearch(this.value)"
            onblur="setTimeout(()=>{const d=document.getElementById('canc-search-drop');if(d)d.style.display='none';},200)"
            autocomplete="off">
          <button onclick="document.getElementById('canc-search').value='';cancStudentSearch('');document.getElementById('canc-selected-info').style.display='none';document.getElementById('canc-student').value=''"
            style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;line-height:1;padding:2px 4px"
            title="Clear">✕</button>
          <div id="canc-search-drop" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border2);border-radius:8px;z-index:9999;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.5);margin-top:2px"></div>
        </div>
        <input type="hidden" id="canc-student" value="">
        <!-- Selected student info card -->
        <div id="canc-selected-info" style="display:none;margin-top:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 14px;display:none">
          <div id="canc-selected-name" style="font-weight:700;font-size:14px;color:var(--text)"></div>
          <div id="canc-selected-meta" style="font-size:11px;color:var(--text3);margin-top:2px"></div>
        </div>
      </div>
      <div class="field">
        <label>Room (auto-filled)</label>
        <input id="canc-room-display" class="form-control" readonly placeholder="Select student first" style="opacity:0.7">
      </div>
      <div class="field">
        <label>Vacate By Date</label>
        <input class="form-control cdp-trigger" id="canc-vacate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${endOfMonth}">
      </div>
      <div class="field col-full">
        <label>Reason for Cancellation</label>
        <textarea id="canc-reason" class="form-control" placeholder="e.g. Shifting to own house, going back to hometown..."></textarea>
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="saveCancellation()">🚫 Add to Cancellation List</button>`
  );
  // pass available list to search fn
  window._cancAvailable = available;
}

function cancStudentSearch(query) {
  const drop = document.getElementById('canc-search-drop');
  if (!drop) return;
  const available = window._cancAvailable || [];
  const q = query.trim().toLowerCase();
  const matches = q
    ? available.filter(s => {
        const room = DB.rooms.find(r=>r.id===s.roomId);
        return s.name.toLowerCase().includes(q)
          || s.id.toLowerCase().includes(q)
          || (s.phone||'').includes(q)
          || String(room?room.number:'').toLowerCase().includes(q);
      })
    : available;
  if (!matches.length) {
    drop.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px">No students found</div>';
    drop.style.display = 'block';
    return;
  }
  drop.innerHTML = matches.slice(0,12).map(s => {
    const room = DB.rooms.find(r=>r.id===s.roomId);
    const roomLabel = room ? `Rm #${room.number}` : 'No room';
    return `<div onclick="selectCancStudent('${s.id}')"
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:32px;height:32px;border-radius:8px;background:var(--red-dim);color:var(--red);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;flex-shrink:0">${(s.name||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:var(--text);font-size:13px">${escHtml(s.name)}</div>
        <div style="font-size:11px;color:var(--text3)">${roomLabel} · ${escHtml(s.phone||'—')}</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:var(--gold2);background:var(--gold-dim);border-radius:6px;padding:2px 7px">${roomLabel}</div>
    </div>`;
  }).join('');
  drop.style.display = 'block';
}

function selectCancStudent(studentId) {
  const s = DB.students.find(x=>x.id===studentId); if(!s) return;
  const room = DB.rooms.find(r=>r.id===s.roomId);
  const type = room ? getRoomType(room) : null;
  // Set hidden input
  const hiddenInp = document.getElementById('canc-student');
  if(hiddenInp) hiddenInp.value = studentId;
  // Fill search bar with name
  const searchInp = document.getElementById('canc-search');
  if(searchInp) searchInp.value = s.name;
  // Hide dropdown
  const drop = document.getElementById('canc-search-drop');
  if(drop) drop.style.display = 'none';
  // Show selected info card
  const infoCard = document.getElementById('canc-selected-info');
  const nameEl = document.getElementById('canc-selected-name');
  const metaEl = document.getElementById('canc-selected-meta');
  if(infoCard && nameEl && metaEl) {
    nameEl.textContent = s.name;
    metaEl.textContent = (room ? `Room #${room.number} · ${type?type.name:'—'} · Floor ${room.floor}` : 'No room') + (s.phone ? ' · '+s.phone : '');
    infoCard.style.display = 'block';
  }
  // Fill room display
  const roomEl = document.getElementById('canc-room-display');
  if(roomEl) roomEl.value = room ? `Room #${room.number} · ${type?type.name:''} · Floor ${room.floor}` : 'No room assigned';
}

function prefillCancStudentInfo(studentId) {
  selectCancStudent(studentId);
}

async function saveCancellation() {
  const studentId = document.getElementById('canc-student').value;
  const vacateDate = document.getElementById('canc-vacate').value;
  const reason = document.getElementById('canc-reason').value.trim();
  if(!studentId){ toast('Please select a student','error'); return; }
  const student = DB.students.find(s=>s.id===studentId);
  if(!student){ toast('Student not found','error'); return; }
  const room = DB.rooms.find(r=>r.id===student.roomId);
  const type = room?getRoomType(room):null;
  if(!DB.cancellations) DB.cancellations=[];
  DB.cancellations.push({
    id: 'canc_'+uid(), // FIX 22: consistent 'canc_' prefix matching rest of cancellation system
    studentId: student.id,
    studentName: student.name,
    roomId: student.roomId||'',
    roomNumber: room?room.number:'—',
    roomType: type?type.name:'—',
    requestDate: today(),
    vacateDate: vacateDate||'',
    reason: reason,
    status: 'Pending',
    createdAt: today()
  });
  // Immediately mark student as Cancelling — removes from occupancy
  student.status = 'Cancelling';
  await saveDB();
  closeModal();
  toast(`${student.name} added to cancellation list. Seat is now vacant.`, 'success');
  if(currentPage==='cancellations') renderPage('cancellations');
  else if(currentPage==='dashboard') renderPage('dashboard');
}

async function confirmCancellation(cancId) {
  const c = DB.cancellations.find(x=>x.id===cancId);
  if(!c) return;
  showConfirm('Confirm Cancellation', `Mark ${c.studentName}'s cancellation as confirmed? Student will be set to "Left".`, (async ()=>{
    c.status = 'Confirmed';
    const student = DB.students.find(s=>s.id===c.studentId);
    if(student){
      student.status='Left';
      student.leftDate = new Date().toISOString().slice(0,10);
      student.lastRoom = student.roomNumber || '';
    }
    await saveDB();
    toast(`${c.studentName} cancellation confirmed. Student marked as Left.`, 'success');
    renderPage('cancellations');
  }));
}

async function restoreFromCancellation(cancId) {
  const c = DB.cancellations.find(x=>x.id===cancId);
  if(!c) return;
  showConfirm('Restore Student', `Restore ${c.studentName} to Active? Their seat will be re-occupied.`, (async ()=>{
    c.status = 'Restored';
    const student = DB.students.find(s=>s.id===c.studentId);
    if(student){ student.status='Active'; }
    await saveDB();
    toast(`${c.studentName} restored to Active. Seat is re-occupied.`, 'success');
    renderPage('cancellations');
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// ROOMS
// ════════════════════════════════════════════════════════════════════════════
let roomFilter = {status:'All', type:'All', floor:'All', search:''};

function downloadCancellationReport() {
  const list = DB.cancellations || [];
  if(!list.length){ toast('No cancellation records to export','error'); return; }

  // Get last 2 months date range
  const now = new Date();
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth()-2, 1);

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Cancellation Report — ${DB.settings.hostelName||'Hostel'}</title>
  <style>
    @page { margin: 15mm; }
    @media print { .no-print { display:none; } }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 20px; }
    h1 { font-size: 20px; color: #0f1a2e; margin-bottom: 4px; }
    .sub { color: #888; font-size: 11px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #0f1a2e; color: #e6c96e; padding: 8px 10px; text-align: left; font-size: 11px; letter-spacing: 0.5px; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 11px; }
    tr:nth-child(even) td { background: #f8f9fb; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
    .badge-red { background: #fee2e2; color: #dc2626; }
    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-gray { background: #f3f4f6; color: #555; }
    .section-title { font-size: 13px; font-weight: 800; color: #0f1a2e; border-left: 4px solid #c8a84b; padding-left: 10px; margin: 20px 0 10px; }
    .pay-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #eee; font-size: 11px; }
    .no-print { margin-bottom: 16px; }
    button { padding: 8px 18px; background: #0f1a2e; color: #e6c96e; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 700; margin-right: 8px; }
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()"><span class=\"micon\" style=\"font-size:15px\">print</span> Print</button>
    <button onclick="window.close()">✕ Close</button>
  </div>
  <h1>📋 Cancellation Report</h1>
  <div class="sub">${DB.settings.hostelName||'Hostel'} · Generated: ${new Date().toLocaleString('en-PK')} · Includes last 2 months payment history</div>`;

  list.forEach(c => {
    const student = DB.students.find(s=>s.id===c.studentId);
    // Get last 2 months of payments for this student
    const payments = (DB.payments||[]).filter(p=>{
      if(p.studentId !== c.studentId) return false;
      const d = new Date(p.date||p.dueDate||'');
      return d >= twoMonthsAgo;
    }).sort((a,b)=>new Date(b.date||b.dueDate||0)-new Date(a.date||a.dueDate||0)).slice(0,6);

    // BUG FIX: 'Confirmed' incorrectly mapped to badge-red (same as Pending).
    // Fixed: Pending→red, Confirmed→amber, Cancelled/Vacated→gray, others→green.
    const statusBadge = c.status==='Pending' ? 'badge-red'
      : c.status==='Confirmed'  ? 'badge-amber'
      : (c.status==='Cancelled' || c.status==='Vacated') ? 'badge-gray'
      : 'badge-green';

    html += `<div style="border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#0f1a2e">${c.studentName||'—'}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">Room #${c.roomNumber||'—'} · ${c.roomType||'—'} · ${student?.phone||'No phone'}</div>
        </div>
        <span class="badge ${statusBadge}">${c.status}</span>
      </div>
      <table>
        <tr><th>Field</th><th>Details</th></tr>
        <tr><td>Request Date</td><td>${fmtDate(c.requestDate)||'—'}</td></tr>
        <tr><td>Vacate Date</td><td>${fmtDate(c.vacateDate)||'End of Month'}</td></tr>
        <tr><td>Reason</td><td>${c.reason||'—'}</td></tr>
        <tr><td>Notes</td><td>${c.notes||'—'}</td></tr>
      </table>
      <div class="section-title">💰 Payment History (Last 2 Months)</div>`;

    if(payments.length) {
      html += `<table><tr><th>Month</th><th>Rent</th><th>Paid</th><th>Unpaid</th><th>Method</th><th>Date</th><th>Status</th></tr>`;
      payments.forEach(p=>{
        const statusCls = p.status==='Paid'?'badge-green':'badge-red';
        html += `<tr>
          <td>${p.month||'—'}</td>
          <td>${fmtPKR(p.monthlyRent||0)}</td>
          <td>${fmtPKR(p.amount||0)}</td>
          <td style="color:${(p.unpaid||0)>0?'#dc2626':'#16a34a'};font-weight:700">${fmtPKR(p.unpaid||0)}</td>
          <td>${p.method||'—'}</td>
          <td>${fmtDate(p.date)||'—'}</td>
          <td><span class="badge ${statusCls}">${p.status}</span></td>
        </tr>`;
      });
      html += `</table>`;
    } else {
      html += `<div style="color:#aaa;font-size:11px;padding:8px 0">No payment records in last 2 months</div>`;
    }
    html += `</div>`;
  });

  html += `</body></html>`;

  _electronPDF(html, (DB.settings.hostelName||'Hostel').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_Rent-Summary_'+new Date().toISOString().slice(0,10)+'.pdf', {pageSize:'A4'});
}
// ─────────────────────────────────────────────────────────────────────────────
