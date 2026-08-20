/* ─── HOSTIX — SETTINGS MODULE ─────────────────────────────────────────────
   Contains: renderSettings, bindSettingsEvents, renderLicenseSettingsPanel,
             openLicenseSettingsWindow, liveUpdateSetting, applyHostelFont,
             saveSettings, bulk rent update helpers, room type/payment method
             helpers, exportData, importData, importFromExcel,
             _showExcelImportPreview, confirmExcelImport, resetAllData,
             saveIssue/maintenance/complaints/notices/fines/inspections/billsplits,
             renderActivityLog, calcBillSplit, saveBillSplit, saveCheckin,
             deleteCheckin, saveNotice, deleteNotice, saveFine, payFine,
             deleteFine, drawCharts, enforceDataRetention,
             (the logo uploader was removed — the brand mark is fixed)
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function drawCharts() {} // charts are rendered as HTML bars

async function saveMaintenance() {
  const title = document.getElementById('mt-title')?.value?.trim();
  if(!title){toast('Enter a title','error');return;}
  if(!DB.maintenance) DB.maintenance=[];
  logActivity('Maintenance Added', title, 'Maintenance');
  DB.maintenance.push({
    id:'mt_'+uid(), seq:_issNextSeq(DB.maintenance), title, roomId:document.getElementById('mt-room')?.value||'',
    priority:document.getElementById('mt-priority')?.value||'Medium',
    description:document.getElementById('mt-desc')?.value?.trim()||'',
    date:document.getElementById('mt-date')?.value||today(),
    status:'Open', resolvedDate:''
  });
  await saveDB(); closeModal(); renderPage('maintenance'); toast('Maintenance request added','success');
}async function saveComplaint() {
  const subject = document.getElementById('cp-subject')?.value?.trim();
  if(!subject){toast('Enter a subject','error');return;}
  if(!DB.complaints) DB.complaints=[];
  logActivity('Complaint Added', subject, 'Complaint');
  DB.complaints.push({
    id:'cp_'+uid(), seq:_issNextSeq(DB.complaints), subject,
    studentId: document.getElementById('cp-student')?.value||'',
    category: document.getElementById('cp-category')?.value||'General',
    description: document.getElementById('cp-desc')?.value?.trim()||'',
    date: document.getElementById('cp-date')?.value||today(),
    status:'Open', resolvedDate:''
  });
  await saveDB(); closeModal(); renderPage('complaints'); toast('Complaint added','success');
}
async function saveCheckin() {
  const studentId = document.getElementById('ci-student')?.value;
  if(!studentId){toast('Select a student','error');return;}
  if(!DB.checkinlog) DB.checkinlog=[];
  DB.checkinlog.push({
    id:'ci_'+uid(), studentId,
    type:document.getElementById('ci-type')?.value||'Check-in',
    date:document.getElementById('ci-date')?.value||today(),
    time:document.getElementById('ci-time')?.value||'',
    reason:document.getElementById('ci-reason')?.value?.trim()||''
  });
  await saveDB(); closeModal(); renderPage('checkinlog'); toast('Entry added','success');
}
async function deleteCheckin(id) {
  DB.checkinlog=DB.checkinlog.filter(x=>x.id!==id); await saveDB(); renderPage('checkinlog'); toast('Deleted','info');
}function showAddNoticeModal() {
  showModal('modal-sm','Post New Notice',`
    <div class="form-grid">
      <div class="field col-full"><label>Title *</label><input id="nt-title" class="form-control" placeholder="Notice title"></div>
      <div class="field"><label>Type</label><select id="nt-type" class="form-control"><option>General</option><option>Important</option><option>Info</option><option>Event</option></select></div>
      <div class="field"><label>Date</label><input id="nt-date" class="form-control cdp-trigger" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field col-full"><label>Content</label><textarea id="nt-content" class="form-control" placeholder="Write notice content..."></textarea></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveNotice()">Post Notice</button>`);
}
async function saveNotice() {
  const title = document.getElementById('nt-title')?.value?.trim();
  if(!title){toast('Enter a title','error');return;}
  if(!DB.notices) DB.notices=[];
  DB.notices.push({
    id:'nt_'+uid(), title,
    type:document.getElementById('nt-type')?.value||'General',
    content:document.getElementById('nt-content')?.value?.trim()||'',
    date:document.getElementById('nt-date')?.value||today()
  });
  await saveDB(); closeModal(); renderPage('notices'); toast('Notice posted','success');
}
async function deleteNotice(id) {
  showConfirm('Delete Notice?','',async ()=>{DB.notices=DB.notices.filter(x=>x.id!==id);await saveDB();renderPage('notices');toast('Deleted','info');});
}function showAddFineModal() {
  const students = studentsByRoom(DB.students.filter(s=>s.status==='Active')).map(s=>`<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
  showModal('modal-sm','Add Fine / Penalty',`
    <div class="form-grid">
      <div class="field col-full"><label>Student *</label><select id="fn-student" class="form-control"><option value="">Select Student</option>${students}</select></div>
      <div class="field"><label>Amount (PKR) *</label><input id="fn-amount" class="form-control" type="number" placeholder="500"></div>
      <div class="field"><label>Date</label><input id="fn-date" class="form-control cdp-trigger" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field col-full"><label>Reason</label><input id="fn-reason" class="form-control" placeholder="e.g. Late payment, Rule violation"></div>
      <div class="field col-full"><label>Additional Notes</label><textarea id="fn-notes" class="form-control" placeholder="Optional notes..."></textarea></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveFine()">Add Fine</button>`);
}
async function saveFine() {
  const studentId = document.getElementById('fn-student')?.value;
  const amount = Number(document.getElementById('fn-amount')?.value||0);
  if(!studentId){toast('Select a student','error');return;}
  if(!amount||amount<=0){toast('Enter a valid amount','error');return;}
  if(!DB.fines) DB.fines=[];
  DB.fines.push({
    id:'fn_'+uid(), studentId, amount,
    reason:document.getElementById('fn-reason')?.value?.trim()||'',
    notes:document.getElementById('fn-notes')?.value?.trim()||'',
    date:document.getElementById('fn-date')?.value||today(),
    paid:false, paidDate:''
  });
  await saveDB(); closeModal(); renderPage('fines'); toast('Fine recorded','success');
}
async function payFine(id) {
  const f = DB.fines.find(x=>x.id===id);
  if(f){f.paid=true;f.paidDate=today();await saveDB();renderPage('fines');toast('Fine marked as paid','success');}
}
async function deleteFine(id) {
  showConfirm('Delete Fine?','',async ()=>{DB.fines=DB.fines.filter(x=>x.id!==id);await saveDB();renderPage('fines');toast('Deleted','info');});
}


// ════════════════════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ════════════════════════════════════════════════════════════════════════════
function renderActivityLog() {
  const list = DB.activityLog || [];
  const catColor = {'General':'var(--blue)','Maintenance':'var(--amber)','Finance':'var(--green)','Student':'var(--purple)','Complaint':'var(--red)','Room':'var(--teal)','Students':'var(--purple)'};
  const catIcon = {General:'edit_note',Maintenance:'build',Finance:'payments',Student:'person',Students:'person',Complaint:'report',Room:'meeting_room'};

  // Per-warden summary for current user
  const curName = (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : '';
  const moKey = thisMonth();
  const myPayments = DB.payments.filter(p => p.byWarden === curName);
  const myPaymentsThisMo = myPayments.filter(p => _payMatchesMonth(p, moKey));
  const myPayTotal = myPaymentsThisMo.reduce((s,p) => s + Number(p.amount||0), 0);
  const myStudents = DB.students.filter(s => {
    const logEntry = list.find(a => a.action === 'Student Added' && a.details && a.details.startsWith(s.name) && a.by === curName);
    return logEntry;
  });
  const myStudentsThisMo = list.filter(a => a.action === 'Student Added' && a.by === curName && (a.date||'').startsWith(moKey));

  return `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
    <div style="background:var(--card);border:1px solid rgba(46,201,138,0.25);border-radius:var(--radius);padding:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="micon" style="font-size:20px;color:var(--green)">payments</span>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3)">Your Collections</div>
      </div>
      <div style="font-size:22px;font-weight:900;color:var(--green)">${fmtPKR(myPayTotal)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">${myPaymentsThisMo.length} payment${myPaymentsThisMo.length!==1?'s':''} this month${curName?' · '+escHtml(curName):''}</div>
    </div>
    <div style="background:var(--card);border:1px solid rgba(155,109,240,0.25);border-radius:var(--radius);padding:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="micon" style="font-size:20px;color:var(--purple)">person_add</span>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3)">Students Added</div>
      </div>
      <div style="font-size:22px;font-weight:900;color:var(--purple)">${myStudentsThisMo.length}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">this month${curName?' · '+escHtml(curName):''}</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="micon" style="font-size:20px;color:var(--text3)">history</span>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3)">Log Entries</div>
      </div>
      <div style="font-size:22px;font-weight:900;color:var(--text)">${list.length}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">last 200 saved</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div style="font-size:13px;color:var(--text2)">${list.length} total entries</div>
    <button class="btn btn-danger btn-sm" onclick="showConfirm('Clear Activity Log?','This will permanently delete all activity log entries.',async ()=>{DB.activityLog=[];await saveDB();renderPage('activitylog');})"><span class="micon" style="font-size:14px">delete</span> Clear Log</button>
  </div>
  ${list.length===0?`<div style="text-align:center;padding:80px 20px;color:var(--text3)"><span class="micon" style="font-size:56px;display:block;margin-bottom:16px;color:var(--border2)">history</span><div style="font-size:16px;font-weight:600;color:var(--text2);margin-bottom:8px">No Activity Yet</div><div>Actions in your dashboard will appear here automatically</div></div>`:''}
  <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
    ${list.map((a,i)=>`
    <div style="display:flex;align-items:center;gap:14px;padding:14px 18px;${i<list.length-1?'border-bottom:1px solid var(--border)':''}">
      <div style="width:40px;height:40px;border-radius:10px;background:${catColor[a.category]||'var(--blue)'}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <span class="micon" style="font-size:20px;color:${catColor[a.category]||'var(--blue)'}">${catIcon[a.category]||'edit_note'}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;margin-bottom:2px">${escHtml(a.action)}</div>
        ${a.details?`<div style="font-size:12px;color:var(--text3)">${escHtml(a.details)}</div>`:''}
        ${a.by?`<div style="font-size:10px;color:var(--text3);margin-top:2px"><span class="micon" style="font-size:12px;vertical-align:middle">person</span> ${escHtml(a.by)}</div>`:''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <span style="font-size:11px;padding:2px 10px;border-radius:20px;background:${catColor[a.category]||'var(--blue)'}22;color:${catColor[a.category]||'var(--blue)'};margin-bottom:4px;display:inline-block">${escHtml(a.category||'General')}</span>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">${fmtDate(a.date)} · ${a.time||''}</div>
      </div>
    </div>`).join('')}
  </div>`;
}
function calcBillSplit() {
  const total = Number(document.getElementById('bs-total')?.value||0);
  const method = document.getElementById('bs-method')?.value||'equal';
  const result = document.getElementById('bs-result');
  const saveBtn = document.getElementById('bs-save-btn');
  if(!result) return;
  if(!total || total <= 0) { result.innerHTML=''; if(saveBtn) saveBtn.style.display='none'; return; }

  const activeStudents = DB.students.filter(s=>s.status==='Active');
  const occupiedRooms = [...new Set(activeStudents.map(s=>s.roomId).filter(Boolean))].map(rid=>({
    room: DB.rooms.find(r=>r.id===rid),
    students: activeStudents.filter(s=>s.roomId===rid)
  })).filter(x=>x.room);

  let perUnit = 0, unitLabel = '', rows = [];

  if(method==='equal') {
    const count = activeStudents.length || 1;
    perUnit = Math.ceil(total / count);
    unitLabel = 'per student';
    rows = activeStudents.map(s=>({ name:s.name, room:'Room '+(DB.rooms.find(r=>r.id===s.roomId)?.number||'?'), share:perUnit }));
  } else if(method==='byroom') {
    const count = occupiedRooms.length || 1;
    perUnit = Math.ceil(total / count);
    unitLabel = 'per room';
    rows = occupiedRooms.map(({room,students})=>({ name:'Room '+room.number+' ('+students.length+' students)', room:'', share:perUnit }));
  } else {
    const beds = activeStudents.length || 1;
    perUnit = Math.ceil(total / beds);
    unitLabel = 'per bed/student';
    rows = activeStudents.map(s=>{ const rm=DB.rooms.find(r=>r.id===s.roomId); return { name:s.name, room:'Room '+(rm?.number||'?'), share:perUnit }; });
  }

  window._lastBillSplit = { total, method, perUnit, rows };

  result.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:12px;color:var(--text3)">Total Bill</div>
          <div style="font-size:24px;font-weight:800;color:var(--text)">${fmtPKR(total)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;color:var(--text3)">Each Pays (${unitLabel})</div>
          <div style="font-size:24px;font-weight:800;color:var(--accent-strong)">${fmtPKR(perUnit)}</div>
        </div>
      </div>
      <div style="max-height:300px;overflow-y:auto">
        ${rows.map(r=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-weight:600;font-size:14px">${escHtml(r.name)}</div>
            ${r.room?`<div style="font-size:11px;color:var(--text3)">${r.room}</div>`:''}
          </div>
          <div style="font-weight:700;color:var(--amber)">${fmtPKR(r.share)}</div>
        </div>`).join('')}
      </div>
    </div>`;
  if(saveBtn) saveBtn.style.display='block';
}

async function saveBillSplit() {
  if(!window._lastBillSplit) return;
  const { total, method, perUnit } = window._lastBillSplit;
  if(!DB.billSplits) DB.billSplits=[];
  DB.billSplits.push({
    id:'bs_'+uid(),
    type:document.getElementById('bs-type')?.value||'Electricity',
    month:document.getElementById('bs-month')?.value||'',
    total, method, perUnit, date:today()
  });
  logActivity('Bill Split Saved', (document.getElementById('bs-type')?.value||'Electricity')+' '+fmtPKR(total), 'Finance');
  await saveDB(); renderPage('billsplit'); toast('Bill split saved to records','success');
}


// ════════════════════════════════════════════════════════════════════════════
// ROOM INSPECTIONS
// ════════════════════════════════════════════════════════════════════════════
const INSPECTION_ITEMS = ['Walls & Paint','Flooring','Windows & Locks','Bathroom','Plumbing','Electrical Fixtures','Fan / AC','Beds & Furniture','Cleanliness','Lighting'];function showAddInspectionModal() {
  const rooms = roomsByNumber(DB.rooms).map(r=>`<option value="${r.id}">Room ${escHtml(String(r.number))}</option>`).join('');
  showModal('modal-sm','Room Inspection Checklist',`
    <div class="form-grid">
      <div class="field"><label>Room *</label><select id="ins-room" class="form-control"><option value="">Select Room</option>${rooms}</select></div>
      <div class="field"><label>Overall Condition</label><select id="ins-cond" class="form-control"><option>Good</option><option>Fair</option><option>Poor</option></select></div>
      <div class="field"><label>Inspection Date</label><input id="ins-date" class="form-control cdp-trigger" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field"><label>Inspected By</label><input id="ins-by" class="form-control" placeholder="Inspector name"></div>
    </div>
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3);margin:16px 0 10px;display:flex;align-items:center;gap:6px">${icon('check','xs')} Inspection Checklist</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      ${INSPECTION_ITEMS.map(item=>`
      <label style="display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;cursor:pointer;transition:border-color 0.2s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <input type="checkbox" id="ins-chk-${item.replace(/[^a-z]/gi,'_')}" style="width:16px;height:16px;accent-color:var(--green)">
        <span style="font-size:13px">${item}</span>
      </label>`).join('')}
    </div>
    <div class="field"><label>Notes / Issues Found</label><textarea id="ins-notes" class="form-control" placeholder="Describe any issues or observations..."></textarea></div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveInspection()">Save Inspection</button>`);
}
async function saveInspection() {
  const roomId = document.getElementById('ins-room')?.value;
  if(!roomId){toast('Select a room','error');return;}
  const checklist = {};
  INSPECTION_ITEMS.forEach(item=>{ checklist[item] = document.getElementById('ins-chk-'+item.replace(/[^a-z]/gi,'_'))?.checked||false; });
  if(!DB.inspections) DB.inspections=[];
  const room = DB.rooms.find(r=>r.id===roomId);
  DB.inspections.push({
    id:'ins_'+uid(), roomId,
    overallCondition:document.getElementById('ins-cond')?.value||'Good',
    date:document.getElementById('ins-date')?.value||today(),
    inspector:document.getElementById('ins-by')?.value?.trim()||'Admin',
    notes:document.getElementById('ins-notes')?.value?.trim()||'',
    checklist
  });
  logActivity('Room Inspected', 'Room '+(room?.number||''), 'Room');
  await saveDB(); closeModal(); renderPage('inspections'); toast('Inspection saved','success');
}
async function deleteInspection(id) {
  showConfirm('Delete Inspection?','',async ()=>{DB.inspections=DB.inspections.filter(x=>x.id!==id);await saveDB();renderPage('inspections');toast('Deleted','info');});
}

/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS v5 — Room Types + Data Management (owner reference designs)
   Styles: renderer/settings.css, all selectors prefixed `set-`.

   What the reference shows that this app does not draw, and why:
   · A "Back to Settings" button and an account chip in the header. Both were
     removed from the chrome on the owner's call (commit c62b14b) — the tab row
     below is how you move between settings panels, and the account lives in
     the sidebar. Re-adding them here would undo that decision.
   · A ⋮ kebab in the room-type ACTIONS column. There is exactly one action on
     a row — remove — so the cell draws that action instead of a menu that
     would open with a single item in it.
   · A "% of storage used" meter under System Stats. The database is a SQLite
     file on the client's own disk; there is no quota, so a percentage would be
     a number the app cannot know. The bar shows what it can measure: how the
     saved payload divides between the tables.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Lucide outline paths. Kept as bare `d` markup so `setIco` can size them. */
const SET_ICO = {
  hostel:  '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  bed:     '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>',
  card:    '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 8h8"/><path d="M8 13h5"/>',
  layers:  '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  key:     '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  plus:    '<path d="M5 12h14"/><path d="M12 5v14"/>',
  check:   '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  info:    '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  trash:   '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  grip:    '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  sheet:   '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  upload:  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  home:    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  coins:   '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  trend:   '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>',
  drive:   '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01"/><path d="M10 16h.01"/>',
  clock:   '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  wifi:    '<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 14 0"/><path d="M1.4 9.4a15 15 0 0 1 21.2 0"/>',
  stack:   '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>'
};
function setIco(path, size, stroke) {
  const n = size || 18;
  return `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
       + `stroke-width="${stroke || 1.9}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

/* ── ROOM TYPES ──────────────────────────────────────────────────────────── */

/* Beds are a property of the type, not of the room, so total capacity is the
   sum of each room's type capacity — the same sum the Rooms screen shows. */
function _rtTotalBeds() {
  const types = (DB.settings.roomTypes) || [];
  return (DB.rooms || []).reduce((n, r) => {
    const t = types.find(x => x.id === r.typeId);
    return n + (t ? Number(t.capacity) || 0 : 0);
  }, 0);
}
function _rtAvgRent() {
  const types = (DB.settings.roomTypes) || [];
  if (!types.length) return 0;
  return Math.round(types.reduce((n, t) => n + (Number(t.defaultRent) || 0), 0) / types.length);
}
/* "Last Updated" is a real stamp written by every room-type edit below, not a
   render-time clock — a clock would read "just now" on a page you only looked
   at. Types saved before this field existed read "—". */
function _rtStampText() {
  const iso = DB.settings.roomTypesUpdatedAt;
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return fmtDate(iso) + ', ' + d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}
function _rtTouch() { DB.settings.roomTypesUpdatedAt = new Date().toISOString(); }

function renderRoomTypesPanel() {
  const types = (DB.settings.roomTypes) || [];

  const rows = types.map(t => {
    const inUse   = (DB.rooms || []).filter(r => r.typeId === t.id).length;
    const cap     = Number(t.capacity) || 1;
    /* removeRoomType refuses both of these anyway. Showing the button as live
       and then answering the click with a toast reads as a failure; the tooltip
       carries the reason instead. */
    const blocked = types.length <= 1 || inUse > 0;
    const why     = types.length <= 1 ? 'The hostel needs at least one room type'
                  : inUse             ? `In use by ${inUse} room${inUse !== 1 ? 's' : ''} — move them to another type first`
                                      : 'Remove this room type';
    return `
      <tr id="rt-row-${t.id}"
          ondragstart="rtDragStart(event,'${t.id}')" ondragover="rtDragOver(event,'${t.id}')"
          ondragleave="rtDragLeave(event)" ondrop="rtDrop(event,'${t.id}')" ondragend="rtDragEnd(event)">
        <td>
          <div class="set-grip">
            <span class="set-grip__h" onmousedown="rtGrab(this)"
                  title="Drag to reorder — this is the order rooms and reports list types in">${setIco(SET_ICO.grip, 16, 2.4)}</span>
            <span class="set-grip__sw" id="rt-sw-${t.id}" style="background:${escHtml(t.color)}"></span>
          </div>
        </td>
        <td>
          <input class="set-in set-in--name" value="${escHtml(t.name)}" placeholder="Type name"
                 onchange="updateRoomType('${t.id}','name',this.value)">
        </td>
        <td>
          <div class="set-step">
            <button id="rt-dec-${t.id}" onclick="rtStep('${t.id}',-1)" ${cap <= 1 ? 'disabled' : ''}
                    title="One bed fewer" aria-label="Decrease beds">&minus;</button>
            <input id="rt-cap-${t.id}" type="number" min="1" step="1" value="${cap}"
                   onchange="rtSetCap('${t.id}',this.value)" aria-label="Beds">
            <button onclick="rtStep('${t.id}',1)" title="One bed more" aria-label="Increase beds">+</button>
          </div>
        </td>
        <td>
          <div class="set-money">
            <input class="set-in" type="number" min="0" value="${Number(t.defaultRent) || 0}"
                   onchange="updateRoomType('${t.id}','defaultRent',this.value)" aria-label="Default rent">
            <span class="set-money__cur">${escHtml(DB.settings.currency || 'PKR')}</span>
          </div>
        </td>
        <td>
          <div class="set-money">
            <input class="set-in" type="number" min="0" value="${Number(t.defaultMess) || 0}"
                   onchange="updateRoomType('${t.id}','defaultMess',this.value)" aria-label="Default mess charge">
            <span class="set-money__cur">${escHtml(DB.settings.currency || 'PKR')}</span>
          </div>
        </td>
        <td>
          <label class="set-color" title="Pick the colour this type shows in across the app">
            <span class="set-color__sw" id="rt-csw-${t.id}" style="background:${escHtml(t.color)}"></span>
            <span class="set-color__hex" id="rt-hex-${t.id}">${escHtml(t.color)}</span>
            <span class="set-color__ch">${setIco(SET_ICO.chevron, 13, 2.4)}</span>
            <input type="color" value="${escHtml(t.color)}"
                   oninput="rtColorLive('${t.id}',this.value)"
                   onchange="updateRoomType('${t.id}','color',this.value)">
          </label>
        </td>
        <td>
          <button class="set-rowbtn dh-red" onclick="removeRoomType('${t.id}')" title="${escHtml(why)}"
                  ${blocked ? 'disabled' : ''} aria-label="Remove room type">${setIco(SET_ICO.trash, 15, 2)}</button>
        </td>
      </tr>`;
  }).join('');

  const strip = [
    ['stack', 'dh-violet', 'Total Room Types',  'rt-strip-types',   String(types.length)],
    ['home',  'dh-blue',   'Total Rooms',       'rt-strip-rooms',   String((DB.rooms || []).length)],
    ['bed',   'dh-green',  'Total Beds Capacity','rt-strip-beds',   String(_rtTotalBeds())],
    ['coins', 'dh-amber',  'Average Rent',      'rt-strip-avg',
      `<small>${escHtml(DB.settings.currency || 'PKR')}</small>${fmtNum(_rtAvgRent())}`],
    ['clock', 'dh-slate',  'Last Updated',      'rt-strip-updated', escHtml(_rtStampText())]
  ].map(([ic, hue, label, id, val]) => `
    <div class="set-strip__c ${hue}">
      <div class="set-strip__i">${setIco(SET_ICO[ic], 18)}</div>
      <div style="min-width:0">
        <div class="set-strip__l">${label}</div>
        <div class="set-strip__v" id="${id}">${val}</div>
      </div>
    </div>`).join('');

  return `
    <div class="set-card">
      <div class="set-head">
        <div class="set-head__ico dh-violet">${setIco(SET_ICO.hostel, 24)}</div>
        <div style="min-width:0">
          <div class="set-head__t">Room Types Configuration</div>
          <div class="set-head__s">Manage your hostel room types, capacity and default rent settings</div>
        </div>
        <div class="set-head__end">
          <button class="set-btn set-btn--go" onclick="addRoomType()">${setIco(SET_ICO.plus, 16, 2.2)}Add New Type</button>
        </div>
      </div>

      ${types.length ? `
      <div class="set-table-wrap">
        <table class="set-table">
          <thead><tr>
            <th style="width:1%">Color</th><th>Type Name</th><th style="width:1%">Capacity (Beds)</th>
            <th style="width:1%">Default Rent (${escHtml(DB.settings.currency || 'PKR')})</th>
            <th style="width:1%">Default Mess (${escHtml(DB.settings.currency || 'PKR')})</th>
            <th style="width:1%">Pick Color</th><th style="width:1%">Actions</th>
          </tr></thead>
          <tbody id="room-types-list">${rows}</tbody>
        </table>
      </div>` : `
      <div class="set-empty">
        <div class="set-empty__i">${setIco(SET_ICO.bed, 26, 1.7)}</div>
        <div class="set-empty__t">No room types yet</div>
        <div class="set-empty__s">Add one before creating rooms — every room takes its beds and default rent from its type.</div>
      </div>`}

      <div class="set-note dh-blue">
        <span class="set-note__i">${setIco(SET_ICO.info, 15, 2)}</span>
        <span>Changing room types here updates default values. Existing room rents remain unchanged unless you edit them individually.</span>
      </div>

      <div class="set-actions">
        <button class="set-btn set-btn--go" onclick="saveRoomTypes()">${setIco(SET_ICO.check, 16, 2.1)}Save Room Types</button>
      </div>
    </div>

    <div class="set-strip">${strip}</div>`;
}

/* ── RENT & MESS ──────────────────────────────────────────────────────────────
   A hostel's monthly charge is two charges. A 17,000 room is 10,000 for the bed
   plus 7,000 for the food, and a student may take the bed alone. Storing them
   separately is what makes "rent only" answerable; storing the sum was not.

   Existing data has the two already added together in rent, with mess at 0, so
   nothing moves until the owner splits a type here. */
function _messTotal(s) {
  return Number(s && s.rent || 0) + (s && s.messOptIn !== false ? Number(s && s.mess || 0) : 0);
}

function renderRentMessPanel() {
  const types  = DB.settings.roomTypes || [];
  const active = DB.students.filter(s => s.status === 'Active');
  const cur    = escHtml(DB.settings.currency || 'PKR');

  const onMess  = active.filter(s => s.messOptIn !== false && Number(s.mess||0) > 0).length;
  const billed  = active.reduce((n, s) => n + _messTotal(s), 0);

  const typeCards = types.map(type => {
    const cnt = active.filter(s => {
      const r = DB.rooms.find(x => x.id === s.roomId);
      return r && r.typeId === type.id;
    }).length;
    const rent = Number(type.defaultRent) || 0;
    const mess = Number(type.defaultMess) || 0;
    return `
      <div class="rm-type">
        <div class="rm-type__h">
          <span class="rm-type__dot" style="background:${escHtml(type.color)}"></span>
          <span class="rm-type__n">${escHtml(type.name)}</span>
          <span class="rm-type__c">${cnt} student${cnt===1?'':'s'}</span>
        </div>
        <div class="rm-type__row">
          <label>Rent<input class="form-control" type="number" min="0" id="qr-${type.id}" value="${rent}"
                 oninput="rmPreview('${type.id}')"></label>
          <label>Mess<input class="form-control" type="number" min="0" id="qm-${type.id}" value="${mess}"
                 oninput="rmPreview('${type.id}')"></label>
        </div>
        <div class="rm-type__f">
          <span class="rm-type__t">Total <b id="qt-${type.id}">${fmtPKR(rent + mess)}</b></span>
          <button class="btn btn-primary btn-sm" onclick="applyRentByType('${type.id}')">Apply</button>
        </div>
      </div>`;
  }).join('');

  // Rooms whose stored rent has drifted from their type. Billing no longer
  // reads room.rent — the charge comes from Settings — so this is now a
  // tidiness warning about the figure shown on the Rooms page, not a money bug.
  const drift    = _roomsOutOfSync();
  const driftAll = drift.filter(d => d.allIn);
  const driftBanner = drift.length ? `
      <div class="set-note dh-amber" style="margin:0 0 16px;align-items:flex-start;border-color:var(--dh);background:var(--dh-bg)">
        <span class="set-note__i">${setIco(SET_ICO.info, 15, 2)}</span>
        <span style="flex:1;min-width:0">
          <b>${drift.length} room${drift.length===1?'':'s'} still show${drift.length===1?'s':''} an old rent figure.</b>
          ${driftAll.length ? `<br>${driftAll.length} of them hold the pre-split <b>all-in</b> amount
          (${fmtPKR(driftAll[0].have)} = rent + mess added together) instead of the ${fmtPKR(driftAll[0].want)} room rent.` : ''}
          <br><span style="color:var(--text3);font-size:11px">Nobody is billed from this — every charge comes from the rates above. It only affects the rent shown on the Rooms page.</span>
        </span>
        <button class="btn btn-primary btn-sm" style="flex-shrink:0" onclick="syncAllRoomsToDefault()">Tidy up rooms</button>
      </div>` : '';

  // Students on a deliberate custom rate — the only ones who do not follow the
  // rates set above.
  const pinnedCount = active.filter(s => s._rentManuallySet === true).length;

  const rows = active.map((s, i) => {
    const room  = DB.rooms.find(r => r.id === s.roomId);
    const rtype = room ? types.find(t => t.id === room.typeId) : null;
    const on    = s.messOptIn !== false;
    const wantTotal = rtype ? (Number(rtype.defaultRent)||0) + (on ? (Number(rtype.defaultMess)||0) : 0) : null;
    // Only a pinned student can sit off the hostel default now.
    const offDefault = s._rentManuallySet === true && wantTotal != null
      && Number(rtype.defaultRent) > 0 && _messTotal(s) !== wantTotal;
    return `
      <tr style="border-top:1px solid var(--border);background:${i%2?'var(--bg3)':'transparent'}">
        <td style="padding:10px 12px">
          <div style="font-weight:700;color:var(--text)">${escHtml(s.name)}</div>
          <div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'—')}</div>
        </td>
        <td style="padding:10px 12px;font-weight:700;color:var(--accent-strong)">#${room?escHtml(String(room.number)):'—'}</td>
        <td style="padding:10px 12px"><span style="font-size:11px;background:var(--bg4);border:1px solid var(--border2);border-radius:20px;padding:2px 8px;color:var(--text2)">${rtype?escHtml(rtype.name):'—'}</span></td>
        <td style="padding:10px 12px"><input class="form-control" type="number" min="0" id="sr-${s.id}" value="${Number(s.rent)||0}" style="width:110px;font-size:13px" oninput="rmRowPreview('${s.id}')"></td>
        <td style="padding:10px 12px"><input class="form-control" type="number" min="0" id="sm-${s.id}" value="${Number(s.mess)||0}" style="width:110px;font-size:13px" oninput="rmRowPreview('${s.id}')" ${on?'':'disabled'}></td>
        <td style="padding:10px 12px;text-align:center">
          <label class="rm-check" title="Untick for a student who takes the room but not the mess">
            <input type="checkbox" ${on?'checked':''} onchange="rmToggleMess('${s.id}',this.checked)">
            <span>Mess</span>
          </label>
        </td>
        <td style="padding:10px 12px;font-weight:800;color:var(--green);white-space:nowrap" id="st-${s.id}">${fmtPKR(_messTotal(s))}${
          offDefault ? `<div style="font-size:10px;font-weight:700;color:var(--amber)" title="This student is on a custom rate. The hostel default for ${escHtml(rtype.name)} is ${fmtPKR(wantTotal)} — press Reset to put them back on it.">custom · default ${fmtPKR(wantTotal)}</div>` : ''}</td>
        <td style="padding:10px 12px;text-align:center;white-space:nowrap">
          <button class="btn btn-success btn-sm" onclick="applyRentToStudent('${s.id}')">Save</button>
          ${rtype && Number(rtype.defaultRent) > 0 ? `<button class="btn btn-secondary btn-sm" style="margin-left:5px"
            onclick="resetStudentToDefault('${s.id}')"
            title="Put ${escHtml(s.name)} back on the hostel default (${fmtPKR(wantTotal)}/mo) and let Settings changes reach them again">Reset</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="set-card">
      <div class="set-head">
        <div class="set-head__ico dh-amber">${setIco(SET_ICO.coins, 24)}</div>
        <div style="min-width:0">
          <div class="set-head__t">Rent &amp; Mess</div>
          <div class="set-head__s">Set the bed charge and the food charge separately. A student who takes the room without the mess is billed rent only.</div>
        </div>
      </div>

      <div class="set-strip" style="margin:0 0 18px">
        <div class="set-strip__c dh-blue"><div class="set-strip__i">${setIco(SET_ICO.users,18)}</div>
          <div style="min-width:0"><div class="set-strip__l">Active Students</div><div class="set-strip__v">${active.length}</div></div></div>
        <div class="set-strip__c dh-green"><div class="set-strip__i">${setIco(SET_ICO.check,18)}</div>
          <div style="min-width:0"><div class="set-strip__l">On Mess</div><div class="set-strip__v">${onMess}</div></div></div>
        <div class="set-strip__c dh-slate"><div class="set-strip__i">${setIco(SET_ICO.bed,18)}</div>
          <div style="min-width:0"><div class="set-strip__l">Rent Only</div><div class="set-strip__v">${active.length - onMess}</div></div></div>
        <div class="set-strip__c dh-amber"><div class="set-strip__i">${setIco(SET_ICO.coins,18)}</div>
          <div style="min-width:0"><div class="set-strip__l">Billed / Month</div><div class="set-strip__v"><small>${cur}</small>${fmtNum(billed)}</div></div></div>
      </div>

      ${driftBanner}

      <div class="rm-sub">Quick set by room type</div>
      ${types.length ? `<div class="rm-types">${typeCards}</div>` : `
      <div class="set-empty"><div class="set-empty__t">No room types yet</div>
        <div class="set-empty__s">Add one under Room Types first.</div></div>`}

      <div style="margin-top:12px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <label style="font-size:11px;font-weight:700;color:var(--text3)">Rent for ALL
          <input class="form-control" type="number" min="0" id="qr-all" placeholder="e.g. 10000" style="max-width:170px"></label>
        <label style="font-size:11px;font-weight:700;color:var(--text3)">Mess for ALL
          <input class="form-control" type="number" min="0" id="qm-all" placeholder="e.g. 7000" style="max-width:170px"></label>
        <button class="btn btn-primary" onclick="applyRentToAll()">Apply to All Students</button>
      </div>

      <div class="set-note dh-blue" style="margin-top:16px">
        <span class="set-note__i">${setIco(SET_ICO.info, 15, 2)}</span>
        <span>Applying a change updates the student and every <b>still-unpaid</b> payment record. Records already marked Paid are receipts of what was actually charged and are never rewritten.</span>
      </div>
    </div>

    <div class="set-card" style="margin-top:16px">
      <div class="set-head">
        <div class="set-head__ico dh-violet">${setIco(SET_ICO.users, 24)}</div>
        <div style="min-width:0">
          <div class="set-head__t">Individual Override</div>
          <div class="set-head__s">Per-student rent, mess amount, and whether they are on the mess at all</div>
        </div>
        <div class="set-head__end">
          <button class="set-btn" onclick="resetAllStudentsToDefault()"
            title="Put every student back on their room type's rent and let hostel-wide changes reach them again">
            ${setIco(SET_ICO.coins, 16)}Reset all to hostel default</button>
        </div>
      </div>
      <div class="set-note dh-blue" style="margin-bottom:14px">
        <span class="set-note__i">${setIco(SET_ICO.info, 15, 2)}</span>
        <span>Everyone is charged the rates set above unless you give them a custom one here.
        <b>Save</b> puts a student on a custom rate and later hostel-wide changes will skip them;
        <b>Reset</b> puts them back on the hostel default.
        ${pinnedCount ? `<b>${pinnedCount} student${pinnedCount===1?' is':'s are'}</b> currently on a custom rate.`
                      : 'No one is on a custom rate right now.'}</span>
      </div>
      ${active.length ? `
      <div class="set-table-wrap">
        <table class="set-table">
          <thead><tr>
            <th>Student</th><th style="width:1%">Room</th><th style="width:1%">Type</th>
            <th style="width:1%">Rent (${cur})</th><th style="width:1%">Mess (${cur})</th>
            <th style="width:1%">On Mess</th><th style="width:1%">Total</th><th style="width:1%">Save</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `
      <div class="set-empty"><div class="set-empty__t">No active students</div>
        <div class="set-empty__s">Admit a student and their charges will be editable here.</div></div>`}
    </div>`;
}

/* Live total under a room-type card — typed values, before Apply is pressed. */
function rmPreview(typeId) {
  const r = parseFloat(document.getElementById('qr-' + typeId)?.value) || 0;
  const m = parseFloat(document.getElementById('qm-' + typeId)?.value) || 0;
  const el = document.getElementById('qt-' + typeId);
  if (el) el.textContent = fmtPKR(r + m);
}

/* Same, for a student row. Mirrors the mess tick so the total shown is the
   total that would actually be billed. */
function rmRowPreview(id) {
  const s = DB.students.find(x => x.id === id); if (!s) return;
  const r  = parseFloat(document.getElementById('sr-' + id)?.value) || 0;
  const mi = document.getElementById('sm-' + id);
  const m  = parseFloat(mi?.value) || 0;
  const on = !(mi && mi.disabled);
  const el = document.getElementById('st-' + id);
  if (el) el.textContent = fmtPKR(r + (on ? m : 0));
}

async function rmToggleMess(id, on) {
  const s = DB.students.find(x => x.id === id); if (!s) return;
  s.messOptIn = !!on;
  const mi = document.getElementById('sm-' + id);
  if (mi) mi.disabled = !on;
  _applyChargesToStudent(s, Number(s.rent)||0, Number(s.mess)||0, s.messOptIn);
  logActivity('Mess Updated', s.name + ' — mess ' + (on ? 'ON' : 'OFF'), 'Finance');
  await saveDB();
  rmRowPreview(id);
  toast(s.name + (on ? ' is now on the mess' : ' is now rent only'), 'success');
}

/* Every room-type edit persists on change, so the strip is the only part of
   the panel that goes stale. Patching those five cells beats re-rendering the
   page, which would throw away scroll position and input focus mid-edit. */
function rtRefreshStrip() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const types = (DB.settings.roomTypes) || [];
  set('rt-strip-types',   String(types.length));
  set('rt-strip-rooms',   String((DB.rooms || []).length));
  set('rt-strip-beds',    String(_rtTotalBeds()));
  set('rt-strip-updated', _rtStampText());
  const avg = document.getElementById('rt-strip-avg');
  if (avg) avg.innerHTML = `<small>${escHtml(DB.settings.currency || 'PKR')}</small>${fmtNum(_rtAvgRent())}`;
}

function rtColorLive(id, val) {
  ['rt-sw-' + id, 'rt-csw-' + id].forEach(k => {
    const el = document.getElementById(k); if (el) el.style.background = val;
  });
  const hex = document.getElementById('rt-hex-' + id); if (hex) hex.textContent = val;
}

/* Both the stepper and the box itself come through here. updateRoomType owns the
   clamping, the stamp, the save and the strip refresh; this only reconciles the
   two bits of the control that the clamp can invalidate — the box snaps back to
   the value actually stored (type "2.5", see 3), and the minus disables at one. */
async function rtSetCap(id, val) {
  await updateRoomType(id, 'capacity', val);
  const t = (DB.settings.roomTypes || []).find(x => x.id === id); if (!t) return;
  const inp = document.getElementById('rt-cap-' + id); if (inp) inp.value = t.capacity;
  const dec = document.getElementById('rt-dec-' + id); if (dec) dec.disabled = t.capacity <= 1;
}
async function rtStep(id, delta) {
  const t = (DB.settings.roomTypes || []).find(x => x.id === id); if (!t) return;
  const next = Math.max(1, (Number(t.capacity) || 1) + delta);
  if (next === t.capacity) return;
  await rtSetCap(id, next);
}

async function saveRoomTypes() {
  _rtTouch();
  await saveDB();
  rtRefreshStrip();
  toast('Room types saved', 'success');
}

/* ── Reorder ─────────────────────────────────────────────────────────────────
   The array order is the order every other screen lists types in, so dragging
   a row is a real edit, not a view preference. The row is only made draggable
   while the pointer is on the grip — leaving `draggable` on permanently stops
   you selecting text inside the row's own inputs. */
let _rtDrag = null;
function rtGrab(el) {
  const tr = el.closest('tr'); if (!tr) return;
  tr.draggable = true;
  /* Release on the next mouseup ANYWHERE. Watching the grip's own mouseup is not
     enough — the pointer is usually off the 16px icon by the time the button
     comes up — and watching its mouseleave is actively wrong: leaving the grip is
     how a drag begins, so clearing there cancels the drag before dragstart fires.
     The `!_rtDrag` guard is what keeps a real drag alive. */
  document.addEventListener('mouseup', function clear() {
    if (!_rtDrag) tr.draggable = false;
  }, { once: true });
}

function rtDragStart(ev, id) {
  _rtDrag = id;
  try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', id); } catch (e) {}
  ev.currentTarget.classList.add('is-dragging');
}
function rtDragOver(ev, id) {
  if (!_rtDrag || _rtDrag === id) return;
  ev.preventDefault();
  try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {}
  const list = DB.settings.roomTypes || [];
  const from = list.findIndex(t => t.id === _rtDrag);
  const to   = list.findIndex(t => t.id === id);
  ev.currentTarget.classList.toggle('is-over-up',   to < from);
  ev.currentTarget.classList.toggle('is-over-down', to > from);
}
function rtDragLeave(ev) { ev.currentTarget.classList.remove('is-over-up', 'is-over-down'); }
function rtDragEnd(ev) {
  _rtDrag = null;
  if (ev.currentTarget) ev.currentTarget.draggable = false;
  document.querySelectorAll('#room-types-list tr').forEach(tr => {
    tr.classList.remove('is-dragging', 'is-over-up', 'is-over-down');
    tr.draggable = false;
  });
}
async function rtDrop(ev, id) {
  ev.preventDefault();
  const list = DB.settings.roomTypes || [];
  const from = list.findIndex(t => t.id === _rtDrag);
  const to   = list.findIndex(t => t.id === id);
  _rtDrag = null;
  if (from < 0 || to < 0 || from === to) { rtDragEnd(ev); return; }
  list.splice(to, 0, list.splice(from, 1)[0]);
  _rtTouch();
  await saveDB();
  renderPage('settings');
  toast('Room type order updated', 'success');
}

/* ── DATA MANAGEMENT ─────────────────────────────────────────────────────── */

function _setBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(n / 1024 < 10 ? 1 : 0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function renderDataManagementPanel() {
  const total = JSON.stringify(DB).length;
  /* Measured against the same serialisation saveDB() writes, so the figure is
     the payload this app actually stores — not an estimate. */
  const tbl = (key, hue, rows) => ({ key, hue, rows: (rows || []).length, n: JSON.stringify(rows || []).length });
  const parts = [
    tbl('Students', 'dh-violet', DB.students),
    tbl('Payments', 'dh-blue',   DB.payments),
    tbl('Expenses', 'dh-amber',  DB.expenses),
    tbl('Rooms',    'dh-green',  DB.rooms)
  ];
  const counted = parts.reduce((s, p) => s + p.n, 0);
  /* Filtered on row count, not byte count: an empty table still serialises to
     "[]", so a byte test would keep listing tables that hold nothing at 0%. */
  const segs = parts.filter(p => p.rows > 0)
                    .concat([{ key: 'Other', hue: 'dh-slate', n: Math.max(0, total - counted) }])
                    .filter(p => p.n > 0);
  const pct = n => total ? (n / total * 100) : 0;

  const stat = (ic, hue, label, val) => `
    <div class="set-stat ${hue}">
      <div class="set-stat__i">${setIco(SET_ICO[ic], 16)}</div>
      <div class="set-stat__l">${label}</div>
      <div class="set-stat__v">${val}</div>
    </div>`;

  const strip = [
    ['home',  'dh-blue',   'Total Rooms',    String((DB.rooms || []).length),    'Active rooms'],
    ['users', 'dh-violet', 'Total Students', String((DB.students || []).length), 'Registered students'],
    ['card',  'dh-green',  'Total Payments', String((DB.payments || []).length), 'Payment records'],
    ['trend', 'dh-amber',  'Total Expenses', String((DB.expenses || []).length), 'Expense records'],
    ['drive', 'dh-slate',  'Storage Used',   _setBytes(total),                   'Database payload']
  ].map(([ic, hue, label, val, sub]) => `
    <div class="set-strip__c ${hue}" title="${sub}">
      <div class="set-strip__i">${setIco(SET_ICO[ic], 18)}</div>
      <div style="min-width:0">
        <div class="set-strip__l">${label}</div>
        <div class="set-strip__v">${val}</div>
      </div>
    </div>`).join('');

  return `
    <div class="set-card">
      <div class="set-head">
        <div class="set-head__ico dh-violet">${setIco(SET_ICO.database, 24)}</div>
        <div style="min-width:0">
          <div class="set-head__t">Data Management</div>
          <div class="set-head__s">Import, export and manage your hostel data securely</div>
        </div>
        <div class="set-head__end">
          <div class="set-callout dh-blue">
            ${setIco(SET_ICO.info, 16, 2)}
            <span>For backup &amp; restore, use the <strong>Backup &amp; Restore</strong> option in the sidebar menu.</span>
          </div>
        </div>
      </div>

      <div class="set-split">
        <!-- IMPORT -->
        <div class="set-sub">
          <div class="set-sub__top">
            <div class="set-sub__ico dh-green">${setIco(SET_ICO.sheet, 21)}</div>
            <div style="min-width:0">
              <div class="set-sub__t">Import Students from Excel / CSV</div>
              <div class="set-sub__s">Bulk-add students from a spreadsheet — download the template, fill it in, then upload</div>
            </div>
          </div>

          <div class="set-sub__btns">
            <button class="set-btn" onclick="downloadExcelTemplate()">${setIco(SET_ICO.download, 16, 2)}Download Template (.xlsx)</button>
            <button class="set-btn" onclick="downloadCSVTemplate()">${setIco(SET_ICO.download, 16, 2)}Download Template (.csv)</button>
            <input type="file" id="excel-import-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importFromExcel(this)">
            <button class="set-btn set-btn--go" onclick="document.getElementById('excel-import-file').click()">${setIco(SET_ICO.upload, 16, 2)}Upload &amp; Import File</button>
          </div>

          <div class="set-cols">
            <div class="set-cols__h">Required columns:</div>
            Name, Father Name, CNIC, Phone, Room Number, Room Rent,<br>
            Join Date, Payment Method, Status, Amount Paid
            <div class="set-cols__div"></div>
            <div class="set-cols__h" style="color:var(--text3)">Optional columns:</div>
            Email, Occupation / Course, Emergency Contact, Notes
          </div>
        </div>

        <!-- SYSTEM STATS -->
        <div class="set-sub">
          <div class="set-sub__top">
            <div class="set-sub__ico dh-violet">${setIco(SET_ICO.stack, 21)}</div>
            <div class="set-sub__t">System Stats</div>
          </div>

          ${stat('home',  'dh-blue',   'Rooms',    (DB.rooms || []).length)}
          ${stat('users', 'dh-green',  'Students', (DB.students || []).length)}
          ${stat('card',  'dh-violet', 'Payments', (DB.payments || []).length)}
          ${stat('trend', 'dh-amber',  'Expenses', (DB.expenses || []).length)}

          <div class="set-store">
            <div class="set-store__top">
              <span class="set-store__l">Storage Used</span>
              <span class="set-store__v">${_setBytes(total)}</span>
            </div>
            <div class="set-store__bar">
              ${segs.map(p => `<div class="set-store__seg ${p.hue}" style="width:${pct(p.n).toFixed(2)}%" title="${p.key} — ${_setBytes(p.n)}"></div>`).join('')}
            </div>
            <div class="set-store__key">
              ${segs.map(p => `<span class="set-store__k ${p.hue}"><span class="set-store__dot"></span>${p.key} ${pct(p.n).toFixed(0)}%</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="set-strip">${strip}</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
let settingsTab = 'hostel';
function renderSettings() {
  const s = DB.settings;
  /* The tab strip scrolls horizontally once the labels stop fitting, and it
     always reset to the left on re-render — so selecting one of the tabs at the
     far end left it half off the edge, underlined but unreadable. renderPage()
     assigns the markup inside a setTimeout, so this defers past it. */
  setTimeout(function () {
    const on = document.querySelector('.set-tabs .set-tab.is-on');
    if (on && on.scrollIntoView) {
      on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, 60);
  const tabs = [
    {id:'hostel',   label:'Hostel Info',        svg:SET_ICO.hostel},
    {id:'rooms',    label:'Room Types',         svg:SET_ICO.bed},
    // This panel has existed in the markup all along but was never listed here,
    // so nothing could reach it. It is also where the rent/mess split is set.
    {id:'rentupdate', label:'Rent & Mess',      svg:SET_ICO.coins},
    {id:'payments', label:'Payment Methods',    svg:SET_ICO.card},
    {id:'expenses', label:'Expense Categories', svg:SET_ICO.receipt},
    {id:'floors',   label:'Floors',             svg:SET_ICO.layers},
    {id:'data',     label:'Data Management',    svg:SET_ICO.database},
    {id:'license',  label:'License',            svg:SET_ICO.key},
    // Diagnostic, not decoration. This build makes no network calls, so a
    // status chip in the chrome would sit in front of every warden reporting
    // on a service that does not exist yet. Here it answers the one question
    // support actually needs: "what does your Connection tab say?"
    {id:'connection', label:'Connection',       svg:SET_ICO.wifi}
  ];

  const pmList = (s.paymentMethods||[]).map(m=>`<div class="tag-item" id="pm-${escHtml(m)}">${escHtml(m)}<button class="tag-remove" onclick="removePaymentMethod('${escHtml(m)}')">×</button></div>`).join('');
  const ecList = (s.expenseCategories||[]).map(c=>`<div class="tag-item" id="ec-${escHtml(c)}">${escHtml(c)}<button class="tag-remove" onclick="removeExpenseCategory('${escHtml(c)}')">×</button></div>`).join('');
  const floorList = (s.floors||[]).map(f=>`<div class="tag-item" id="fl-${escHtml(f)}">${escHtml(f)}<button class="tag-remove" onclick="removeFloor('${escHtml(f)}')">×</button></div>`).join('');
  return `
  <div class="set-tabs-wrap">
    <div class="set-tabs" role="tablist" aria-label="Settings sections">
      <!-- The old tab row was a bare click-only div, so Settings had no keyboard
           route into any of its seven panels. Same markup, now reachable. -->
      ${tabs.map(t=>`<div class="set-tab ${settingsTab===t.id?'is-on':''}" role="tab" tabindex="0"
             aria-selected="${settingsTab===t.id}" title="${escHtml(t.label)}"
             onclick="settingsTab='${t.id}';renderPage('settings')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();settingsTab='${t.id}';renderPage('settings');}"
        >${setIco(t.svg,16)}${escHtml(t.label)}</div>`).join('')}
    </div>
  </div>

  <div class="settings-panels-container">
      <!-- HOSTEL INFO -->
      <div class="settings-panel ${settingsTab==='hostel'?'active':''}">
        <div class="card">
          <div class="card-header"><div class="card-title">🏨 Hostel Information</div></div>
          <div class="form-grid">
            <div class="field"><label>Hostel Name</label><input class="form-control" id="cfg-name" value="${escHtml(s.hostelName)}" oninput="liveUpdateSetting('hostelName',this.value)"></div>
            <div class="field"><label>Tagline</label><input class="form-control" id="cfg-tag" value="${escHtml(s.tagline||'')}" oninput="liveUpdateSetting('tagline',this.value)"></div>
            <div class="field"><label>Location / City</label><input class="form-control" id="cfg-loc" value="${escHtml(s.location)}" oninput="liveUpdateSetting('location',this.value)"></div>
            <div class="field"><label>Contact Phone</label><input class="form-control" id="cfg-phone" value="${escHtml(s.phone||'')}" oninput="liveUpdateSetting('phone',this.value)" placeholder="03XX-XXXXXXX"></div>
            <div class="field"><label>Email Address</label><input class="form-control" id="cfg-email" type="email" value="${escHtml(s.email||'')}" oninput="liveUpdateSetting('email',this.value)" placeholder="hostel@email.com"></div>
            <div class="field"><label>System Version</label><input class="form-control" id="cfg-ver" value="${escHtml(s.version||'v2.0')}" oninput="liveUpdateSetting('version',this.value)"></div>
            <div class="field col-full">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
                🔤 Hostel Name Font Style
                <span style="flex:1"></span>
                <span style="font-size:11px;color:var(--text3);font-weight:400;margin-right:6px">Show font picker</span>
                <input type="checkbox" id="font-picker-toggle" ${s.showFontPicker!==false?'checked':''} onchange="(async function(){DB.settings.showFontPicker=this.checked;await saveDB();document.getElementById('font-picker-grid-wrap').style.display=this.checked?'':'none';}).call(this)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent-strong)">
              </label>
              <div id="font-picker-grid-wrap" style="display:${s.showFontPicker!==false?'block':'none'}">
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px;margin-top:8px;max-height:280px;overflow-y:auto;padding-right:2px">
                ${[
                  ['DM Serif Display','DM Serif'],
                  ['Playfair Display','Playfair'],
                  ['Cinzel','Cinzel'],
                  ['Cormorant Garamond','Cormorant'],
                  ['Libre Baskerville','Baskerville'],
                  ['IM Fell English','Fell English'],
                  ['Philosopher','Philosopher'],
                  ['Yeseva One','Yeseva One'],
                  ['Bebas Neue','Bebas Neue'],
                  ['Rajdhani','Rajdhani'],
                  ['Teko','Teko'],
                  ['Josefin Sans','Josefin Sans'],
                  ['Righteous','Righteous'],
                  ['Georgia','Georgia'],
                  ['Impact','Impact'],
                  ['Trebuchet MS','Trebuchet'],
                  ['Palatino Linotype','Palatino'],
                  ['Arial Black','Arial Black'],
                  ['Times New Roman','Times New Roman'],
                  ['Segoe UI','Segoe UI'],
                ].map(([ff,label])=>`<div onclick="applyHostelFont('${ff}')" style="cursor:pointer;border:2px solid ${(s.hostelNameFont||'DM Serif Display')===ff?'var(--accent)':'var(--border)'};border-radius:8px;padding:8px 6px;text-align:center;background:${(s.hostelNameFont||'DM Serif Display')===ff?'var(--accent-dim)':'var(--bg3)'};transition:all 0.15s" onmouseover="this.style.borderColor='var(--accent-strong)'" onmouseout="this.style.borderColor='${(s.hostelNameFont||'DM Serif Display')===ff?'var(--accent)':'var(--border)'}'">
                  <div class="font-card-label" style="font-family:'${ff}',serif;font-size:13px;font-weight:700;color:var(--accent-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(s.hostelName||'Hostel Name')}</div>
                  <div style="font-size:8.5px;color:var(--text3);margin-top:2px">${label}</div>
                </div>`).join('')}
              </div>
              <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
                <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Preview: </span>
                <span id="font-preview-name" style="font-family:'${s.hostelNameFont||'DM Serif Display'}',serif;font-size:16px;font-weight:700;color:var(--accent-strong)">${escHtml(s.hostelName||'DAMAM Boys Hostel')}</span>
              </div>
              </div><!-- /font-picker-grid-wrap -->
            </div>
            <div class="field col-full">
              <label>Currency</label>
              <select class="form-control" id="cfg-curr" onchange="liveUpdateSetting('currency',this.value)">
                ${['PKR','USD','EUR','GBP','AED','SAR'].map(c=>`<option ${s.currency===c?'selected':''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="margin-top:16px;text-align:right">
            <button class="btn btn-primary" onclick="saveSettings()">💾 Save Hostel Info</button>
          </div>
        </div>
      </div>

      <!-- ROOM TYPES -->
      <!-- Built only when it is the panel on screen. Every tab click re-enters
           renderSettings, so the visible panel is always fresh — and the Data
           Management body below serialises the whole DB to size it, which is not
           work to do while someone is editing the hostel's phone number. -->
      <div class="settings-panel ${settingsTab==='rooms'?'active':''}">
        ${settingsTab==='rooms' ? renderRoomTypesPanel() : ''}
      </div>

      <!-- PAYMENT METHODS -->
      <div class="settings-panel ${settingsTab==='payments'?'active':''}">
        <div class="card">
          <div class="card-header"><div class="card-title">💳 Payment Methods</div></div>
          <div class="tag-list" id="pm-list">${pmList}</div>
          <div style="display:flex;gap:10px;margin-top:14px">
            <input class="form-control" id="new-pm" placeholder="Add new payment method…" onkeydown="if(event.key==='Enter')addPaymentMethod()">
            <button class="btn btn-primary" onclick="addPaymentMethod()">Add</button>
          </div>
        </div>
      </div>

      <!-- EXPENSE CATEGORIES -->
      <div class="settings-panel ${settingsTab==='expenses'?'active':''}">
        <div class="card">
          <div class="card-header"><div class="card-title">📉 Expense Categories</div></div>
          <div class="tag-list" id="ec-list">${ecList}</div>
          <div style="display:flex;gap:10px;margin-top:14px">
            <input class="form-control" id="new-ec" placeholder="Add new category…" onkeydown="if(event.key==='Enter')addExpenseCategory()">
            <button class="btn btn-primary" onclick="addExpenseCategory()">Add</button>
          </div>
        </div>
      </div>

      <!-- FLOORS -->
      <div class="settings-panel ${settingsTab==='floors'?'active':''}">
        <div class="card">
          <div class="card-header"><div class="card-title">🏗️ Building Floors</div></div>
          <div class="tag-list" id="floor-list">${floorList}</div>
          <div style="display:flex;gap:10px;margin-top:14px">
            <input class="form-control" id="new-fl" placeholder="Add floor name (e.g. 4th)…" onkeydown="if(event.key==='Enter')addFloor()">
            <button class="btn btn-primary" onclick="addFloor()">Add</button>
          </div>
        </div>
      </div>

      <!-- DATA MANAGEMENT -->
      <div class="settings-panel ${settingsTab==='data'?'active':''}">
        ${settingsTab==='data' ? renderDataManagementPanel() : ''}
      </div>

      <!-- RENT & MESS -->
      <div class="settings-panel ${settingsTab==='rentupdate'?'active':''}">
        ${settingsTab==='rentupdate' ? renderRentMessPanel() : ''}
      </div>

      <!-- LICENSE -->
      <div class="settings-panel ${settingsTab==='license'?'active':''}">
        ${renderLicenseSettingsPanel()}
      </div>

      <!-- CONNECTION -->
      <div class="settings-panel ${settingsTab==='connection'?'active':''}">
        ${settingsTab==='connection' ? renderConnectionPanel() : ''}
      </div>

  </div>`;
}

function bindSettingsEvents() {}

// ── License Settings Panel (rendered inside Settings page) ────────────────────
/* ── CONNECTION (spec 29) ────────────────────────────────────────────────────
   The four states the connectivity service keeps separate, shown separately.
   Collapsing them into one "online/offline" light is the thing the service was
   written to avoid: a hostel on working WiFi whose control plane is down, still
   holding a valid cached licence, is a different situation from a hostel with
   no internet, and only one of the two is anybody's problem to fix.

   Everything here is read-only. The renderer cannot reach the network at all
   (CSP connect-src 'self'); it asks the main process for a snapshot over the
   five read-only window.online channels and renders what it is told.

   On this build the answer is "not configured", and the panel says so in plain
   words rather than showing four red crosses. An unconfigured offline product
   is not a broken one.                                                       */
function renderConnectionPanel() {
  // The status arrives over IPC, so paint the frame now and fill it in.
  setTimeout(connRefresh, 40);
  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title" style="display:flex;align-items:center;gap:8px">
        ${setIco(SET_ICO.wifi, 16)} Connection
      </div>
    </div>
    <div style="font-size:12px;color:var(--text3);line-height:1.6;margin-bottom:4px">
      Where this installation stands with Hostyllo's online services. Nothing here
      changes anything — it is what to read out when you call support.
    </div>
    <div id="conn-body" style="margin-top:10px">
      <div style="font-size:12px;color:var(--text3);padding:14px 0">Checking…</div>
    </div>
  </div>`;
}

// One row of the §29 readout.
function _connRow(label, value, hue, note) {
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--border)">
      <div style="flex:0 0 150px;font-size:11.5px;font-weight:600;color:var(--text2)">${escHtml(label)}</div>
      <div style="flex:1;min-width:0">
        <span class="dash-pill ${hue}">${escHtml(value)}</span>
        ${note ? `<span style="font-size:11px;color:var(--text3);margin-left:9px">${escHtml(note)}</span>` : ''}
      </div>
    </div>`;
}

function _connWhen(ms) {
  if (!ms) return 'never';
  const d = new Date(Number(ms));
  if (isNaN(d.getTime())) return 'never';
  return fmtDate(ymd(d)) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

async function connRefresh() {
  const box = document.getElementById('conn-body');
  if (!box) return;

  // window.online only exists in a packaged/dev Electron run with the services
  // layer present. Say which of the two is missing rather than "error".
  if (typeof window === 'undefined' || !window.online || !window.online.getStatus) {
    box.innerHTML = `<div class="set-note">Online services are not available in this build.
      The application is running fully offline.</div>`;
    return;
  }

  let st = null, q = null;
  try {
    st = await window.online.getStatus();
    q  = await window.online.queueStats();
  } catch (e) {
    box.innerHTML = `<div class="set-note">Could not read the connection status.</div>`;
    return;
  }
  if (!st) { box.innerHTML = `<div class="set-note">No status reported.</div>`; return; }

  const unconfigured = st.configured === false || st.mode === 'unconfigured';

  // §29's four lines, in its order.
  const rows =
      _connRow('Internet', st.networkAvailable ? 'Connected' : 'Not detected',
               st.networkAvailable ? 'dh-green' : 'dh-slate')
    + _connRow('Hostyllo API',
               unconfigured ? 'Not configured' : (st.apiReachable ? 'Reachable' : 'Unreachable'),
               unconfigured ? 'dh-slate' : (st.apiReachable ? 'dh-green' : 'dh-amber'),
               unconfigured ? 'no control plane set for this build' : (st.reason || ''))
    + _connRow('License',
               st.licenseValid ? 'Valid' : 'Checked on this device',
               st.licenseValid ? 'dh-green' : 'dh-slate',
               'activation is local — see the License tab')
    + _connRow('Application',
               unconfigured ? 'Offline edition' :
                 st.mode === 'online' ? 'Online' :
                 st.mode === 'degraded' ? 'Degraded — working from cached data' : 'Offline mode',
               unconfigured ? 'dh-blue' :
                 st.mode === 'online' ? 'dh-green' :
                 st.mode === 'degraded' ? 'dh-amber' : 'dh-slate');

  const queued = q ? (Number(q.pending || 0) + Number(q.inflight || 0)) : 0;
  const failed = q ? Number(q.failed || 0) : 0;

  box.innerHTML =
      (unconfigured
        ? `<div class="set-note">This installation runs entirely on this computer. No online
             services are configured, so the app makes no internet requests at all — the rows
             below are here so support can confirm that.</div>`
        : '')
    + `<div style="margin-top:10px">${rows}</div>`
    + `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:14px;
                   padding-top:12px;border-top:1px solid var(--border);font-size:11.5px;color:var(--text3)">
         <span>Last checked: <b style="color:var(--text2)">${escHtml(_connWhen(st.lastCheckedAt))}</b></span>
         <span>Last reached: <b style="color:var(--text2)">${escHtml(_connWhen(st.lastSuccessAt))}</b></span>
         <span>Waiting to send: <b style="color:var(--text2)">${queued}</b></span>
         ${failed ? `<span style="color:var(--red)">Gave up on: <b>${failed}</b></span>` : ''}
         <button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="connCheckNow(this)">Check again</button>
       </div>`;
}

async function connCheckNow(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try {
    // Rate-limited main-process side, and concurrent callers share one probe —
    // holding this button down cannot turn the UI into a request amplifier.
    if (window.online && window.online.checkNow) await window.online.checkNow();
  } catch (_) {}
  await connRefresh();
}

function renderLicenseSettingsPanel() {
  const licCache = window._damam_license_cache;
  const hasLic   = licCache && licCache.valid;
  const expStr   = hasLic && licCache.expiry
    ? new Date(licCache.expiry).toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'})
    : '—';
  // Mask the checksum groups by POSITION, not by an exact segment count: keys
  // come in three groups (legacy) or four (current), and the old `length===4`
  // test fell through to printing a current key on screen in full.
  const keyStr   = hasLic && licCache.key
    ? (() => {
        const p = licCache.key.split('-');
        if (p.length < 4) return licCache.key;
        return p.slice(0, 2).join('-') + '-'
             + p.slice(2, -1).map(() => '····').join('-') + '-' + p[p.length - 1];
      })()
    : '—';
  // Days left is worth showing now that keys can be cut for a week: on a
  // one-month licence the expiry date alone reads as far away until it is not.
  const daysLeft = hasLic && licCache.expiry
    ? Math.ceil((new Date(licCache.expiry) - new Date()) / 86400000)
    : null;

  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title" style="display:flex;align-items:center;gap:8px">
        🔐 License Information
        <span style="font-size:11px;padding:2px 10px;border-radius:20px;font-weight:700;
          ${hasLic
            ? 'background:var(--success-bg);border:1px solid var(--success-border);color:var(--success-fg)'
            : 'background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger-fg)'}">
          ${hasLic ? '✅ Active' : '❌ Not Active'}
        </span>
      </div>
    </div>
    <div class="form-grid">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">License Key</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--accent-strong);letter-spacing:1px">${escHtml(keyStr)}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Valid Until</div>
        <div style="font-size:13px;font-weight:700;color:${hasLic?'var(--green)':'var(--text3)'}">${escHtml(expStr)}</div>
        ${daysLeft === null ? '' : `<div style="font-size:11px;margin-top:4px;color:${daysLeft <= 14 ? 'var(--danger-fg)' : 'var(--text3)'}">${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining</div>`}
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-secondary" onclick="openLicenseSettingsWindow()" style="display:flex;align-items:center;gap:6px">
        ⚙️ Manage License (Deactivate / Reset)
      </button>
    </div>
    <div style="margin-top:12px;background:rgba(30,64,128,0.1);border:1px solid rgba(30,64,128,0.25);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text3);line-height:1.6">
      To deactivate, reset, or prepare for uninstall, click <strong style="color:var(--text2)">Manage License</strong>
      above. You can also reach this from <strong style="color:var(--text2)">Help → License Settings</strong> in the menu bar.
    </div>
  </div>`;
}

function openLicenseSettingsWindow() {
  // Password gate removed — warden already authenticated via app login
  if (window.electronAPI && window.electronAPI.licenseOpenSettings) {
    window.electronAPI.licenseOpenSettings();
  } else {
    toast('License settings window not available in dev/browser mode.', 'info');
  }
}
function _doLicenseUnlock() { openLicenseSettingsWindow(); }
async function liveUpdateSetting(key, val) {
  DB.settings[key] = val;
  await saveDB();
  if(key==='hostelName') {
    // Update sidebar name
    const sbName = document.getElementById('sb-hostel-name');
    if(sbName) sbName.textContent = val;
    // Update login screen hostel name
    const loginName = document.getElementById('login-hostel-name');
    if(loginName) loginName.textContent = val;
    // Update font-style preview cards — text AND preserve selected font
    const prev = document.getElementById('font-preview-name');
    if(prev) {
      prev.textContent = val || 'Hostel Name Preview';
      // Keep the currently selected font applied to the preview
      const ff = DB.settings.hostelNameFont || 'DM Serif Display';
      prev.style.fontFamily = `'${ff}', serif`;
    }
    // Also update each individual font card label so every card shows new name
    document.querySelectorAll('.font-card-label').forEach(el => {
      el.textContent = val || 'Hostel Name Preview';
    });
  }
  if(key==='location') {
    const loginAddr = document.getElementById('login-address');
    if(loginAddr) loginAddr.innerHTML = val ? `&#x1F4CD; ${val}` : '';
  }
  if(key==='version') {
    const ver = document.getElementById('sb-version');
    if(ver) ver.textContent = 'v' + val;
  }
}
async function applyHostelFont(fontFamily) {
  DB.settings.hostelNameFont = fontFamily;
  await saveDB();
  // Sidebar hostel name is a subtitle now — no custom font needed there
  // Update the live preview span immediately without full page re-render
  const prev = document.getElementById('font-preview-name');
  if(prev) {
    prev.style.fontFamily = `'${fontFamily}', serif`;
    prev.textContent = DB.settings.hostelName || 'Hostel Name Preview';
  }
  toast('Font updated — ' + fontFamily, 'success');
  renderPage('settings');
}
async function saveSettings() {
  await saveDB(); toast('Settings saved successfully','success');
}
// ── BULK RENT + MESS UPDATE ──────────────────────────────────────────────────
/* Writes the two charges onto the student and re-bases every payment record
   that still has money owing on it.

   Paid records are deliberately left alone: they are a receipt of what the
   student was actually charged at the time, and rewriting them would silently
   restate collected history — the same class of bug as the month mixing. */
function _applyChargesToStudent(student, newRent, newMess, messOptIn) {
  student.rent = newRent;
  student.mess = newMess;
  if (messOptIn != null) student.messOptIn = !!messOptIn;
  const mess = student.messOptIn !== false ? Number(newMess) || 0 : 0;
  const due  = (Number(newRent) || 0) + mess;

  DB.payments.forEach(function (p) {
    if (p.studentId !== student.id || p.status === 'Paid') return;
    p.monthlyRent  = newRent;
    p.totalRent    = newRent;
    p.messCharge   = mess;
    p.messIncluded = student.messOptIn !== false;
    const alreadyPaid = Number(p.amount) || 0;
    const extras = Number(p.extraTotal || 0) + Number(p.admissionFee || p.fee || 0);
    p.unpaid = Math.max(0, due + extras - alreadyPaid - (Number(p.concession || p.discount) || 0));
  });
}

// Kept for older call sites that only know about rent.
function _applyRentToStudentCore(student, newRent) {
  _applyChargesToStudent(student, newRent, Number(student.mess) || 0, student.messOptIn);
}

/* ── ROOM RENT WRITE-THROUGH ──────────────────────────────────────────────────
   Rooms are the third copy of the price and were the one nothing wrote to:
   applyRentByType()/applyRentToAll() updated the room TYPE and the STUDENTS but
   left room.rent frozen at whatever it held when the room was created.

   On installs that predate the rent/mess split that frozen value is the ALL-IN
   figure (rent + mess added together). Admission reads rent off the room and
   mess off the room type, so a new student was charged the all-in rent PLUS the
   mess again — the food billed twice. Every existing student in the same room
   paid the correct total, which is exactly the contradiction that surfaced.

   Anything that changes a type's rent now writes it to that type's rooms too. */
function _syncRoomsToType(typeId, newRent) {
  let n = 0;
  DB.rooms.forEach(function (r) {
    if (r.typeId === typeId && Number(r.rent) !== Number(newRent)) { r.rent = newRent; n++; }
  });
  return n;
}

/* Rooms whose rent no longer matches their type's configured Room Rent.
   `allIn` marks the specific pre-split signature — room.rent equals
   defaultRent + defaultMess — which is the one we can repair with confidence
   rather than guess at. */
function _roomsOutOfSync() {
  const out = [];
  (DB.rooms || []).forEach(function (r) {
    const t = (DB.settings.roomTypes || []).find(x => x.id === r.typeId);
    if (!t) return;
    const want = Number(t.defaultRent) || 0;
    const have = Number(r.rent) || 0;
    if (!want || have === want) return;
    out.push({
      number: r.number, id: r.id, type: t.name, have, want,
      allIn: Number(t.defaultMess) > 0 && have === want + Number(t.defaultMess)
    });
  });
  return out;
}

// Reads a rent/mess pair out of a form. Rent must be a real amount; mess may
// legitimately be 0 (a hostel with no mess, or a rent-only student).
function _readCharges(rentId, messId) {
  const rent = parseFloat(document.getElementById(rentId)?.value);
  const messRaw = document.getElementById(messId)?.value;
  const mess = messRaw === '' || messRaw == null ? 0 : parseFloat(messRaw);
  if (!rent || rent <= 0 || isNaN(rent)) { toast('Enter a valid rent amount', 'error'); return null; }
  if (isNaN(mess) || mess < 0)           { toast('Enter a valid mess amount', 'error'); return null; }
  return { rent, mess };
}

async function applyRentToStudent(studentId) {
  const s = DB.students.find(x => x.id === studentId); if (!s) return;
  const c = _readCharges('sr-' + studentId, 'sm-' + studentId); if (!c) return;
  if (c.rent === Number(s.rent) && c.mess === Number(s.mess || 0)) { toast('Charges unchanged', 'info'); return; }
  const oldTotal = _messTotal(s);
  _applyChargesToStudent(s, c.rent, c.mess, s.messOptIn);
  s._rentManuallySet = true; // Fix #14: flag so auto defaultRent changes don't override this
  logActivity('Charges Updated',
    s.name + ' — ' + fmtPKR(oldTotal) + ' → ' + fmtPKR(_messTotal(s))
    + ' (rent ' + fmtPKR(c.rent) + (c.mess ? ' + mess ' + fmtPKR(c.mess) : '') + ')', 'Finance');
  await saveDB();
  renderPage('settings');
  toast('Updated ' + s.name + ' → ' + fmtPKR(_messTotal(s)) + '/mo', 'success');
}

async function applyRentByType(typeId) {
  const type = DB.settings.roomTypes.find(t => t.id === typeId); if (!type) return;
  const c = _readCharges('qr-' + typeId, 'qm-' + typeId); if (!c) return;
  type.defaultRent = c.rent;
  type.defaultMess = c.mess;
  // Write through to the rooms of this type, or admission keeps reading a stale
  // room.rent and double-counts the mess.
  const roomsHit = _syncRoomsToType(typeId, c.rent);
  let count = 0;
  DB.students.filter(s => s.status === 'Active').forEach(function (s) {
    const room = DB.rooms.find(r => r.id === s.roomId);
    if (room && room.typeId === typeId) { _applyChargesToStudent(s, c.rent, c.mess, s.messOptIn); count++; }
  });
  _rtTouch();
  logActivity('Bulk Charges Update',
    type.name + ' — ' + count + ' student(s), ' + roomsHit + ' room(s) → rent ' + fmtPKR(c.rent) + ' + mess ' + fmtPKR(c.mess), 'Finance');
  await saveDB();
  renderPage('settings');
  toast(count + ' student(s) set to ' + fmtPKR(c.rent + c.mess) + '/mo', 'success');
}

async function applyRentToAll() {
  const c = _readCharges('qr-all', 'qm-all'); if (!c) return;
  showConfirm(
    'Update rent & mess for ALL students?',
    'Every active student will be set to <b>' + fmtPKR(c.rent) + '</b> rent'
    + (c.mess ? ' + <b>' + fmtPKR(c.mess) + '</b> mess' : '')
    + ' — <b>' + fmtPKR(c.rent + c.mess) + '</b>/month. Unpaid payment records are re-based; paid ones are left as they are.'
    + '<br><small style="color:var(--text3)">Students who are off the mess stay rent only.</small>',
    async function () {
      let count = 0;
      DB.students.filter(s => s.status === 'Active').forEach(function (s) {
        _applyChargesToStudent(s, c.rent, c.mess, s.messOptIn); count++;
      });
      DB.settings.roomTypes.forEach(function (t) { t.defaultRent = c.rent; t.defaultMess = c.mess; });
      // Rooms too — see _syncRoomsToType().
      let roomsHit = 0;
      DB.settings.roomTypes.forEach(function (t) { roomsHit += _syncRoomsToType(t.id, c.rent); });
      _rtTouch();
      logActivity('Global Charges Update',
        'All ' + count + ' students, ' + roomsHit + ' room(s) → rent ' + fmtPKR(c.rent) + ' + mess ' + fmtPKR(c.mess), 'Finance');
      await saveDB();
      renderPage('settings');
      toast('All ' + count + ' students set to ' + fmtPKR(c.rent + c.mess) + '/mo', 'success');
    }
  );
}
/* ── SYNC ROOMS TO THE HOSTEL DEFAULT ─────────────────────────────────────────
   Repairs rooms whose stored rent has drifted from their type's Room Rent —
   in practice the pre-split all-in figure. Students are not touched: their own
   rent/mess are already correct and are what the bills are built from. This
   only stops the NEXT admission inheriting a wrong number. */
async function syncAllRoomsToDefault() {
  const drift = _roomsOutOfSync();
  if (!drift.length) { toast('All rooms already match the hostel default', 'info'); return; }
  const allIn = drift.filter(d => d.allIn);
  const rows = drift.slice(0, 8).map(d =>
    '<tr><td style="padding:3px 10px 3px 0">Room #' + escHtml(String(d.number)) + '</td>'
    + '<td style="padding:3px 10px 3px 0;color:var(--red)">' + fmtPKR(d.have) + '</td>'
    + '<td style="padding:3px 10px 3px 0">→</td>'
    + '<td style="padding:3px 0;color:var(--green);font-weight:700">' + fmtPKR(d.want) + '</td></tr>').join('');
  showConfirm(
    'Sync ' + drift.length + ' room' + (drift.length === 1 ? '' : 's') + ' to the hostel default?',
    (allIn.length
      ? '<div style="background:var(--amber-dim,rgba(240,160,48,0.12));border:1px solid rgba(240,160,48,0.35);border-radius:8px;padding:9px 12px;margin-bottom:10px;font-size:12px">'
        + '<b>' + allIn.length + ' room' + (allIn.length === 1 ? ' is' : 's are') + ' carrying the old all-in figure</b>'
        + ' — rent and mess added together, from before the two were split. Admitting into '
        + (allIn.length === 1 ? 'it' : 'them') + ' charges the mess twice.</div>'
      : '')
    + '<table style="font-size:12px;margin-bottom:8px">' + rows + '</table>'
    + (drift.length > 8 ? '<div style="font-size:11px;color:var(--text3)">…and ' + (drift.length - 8) + ' more</div>' : '')
    + '<div style="font-size:11px;color:var(--text3);margin-top:8px">Only the rooms change. No student\'s rent, no mess amount, and no payment record is touched.</div>',
    async function () {
      let n = 0;
      DB.settings.roomTypes.forEach(function (t) { n += _syncRoomsToType(t.id, Number(t.defaultRent) || 0); });
      _rtTouch();
      logActivity('Rooms Synced', n + ' room(s) reset to their room type\'s Room Rent', 'Finance');
      await saveDB();
      renderPage('settings');
      toast(n + ' room' + (n === 1 ? '' : 's') + ' synced to the hostel default', 'success');
    }
  );
}

/* ── RESET A STUDENT TO THE HOSTEL DEFAULT ────────────────────────────────────
   Clears a hand-edited override so the student follows Settings again.
   applyRentToStudent() sets _rentManuallySet, which permanently deafens that
   student to later hostel-wide changes; this is the way back. */
async function resetStudentToDefault(studentId) {
  const s = DB.students.find(x => x.id === studentId); if (!s) return;
  const room = DB.rooms.find(r => r.id === s.roomId);
  const type = room ? DB.settings.roomTypes.find(t => t.id === room.typeId) : null;
  if (!type || !(Number(type.defaultRent) > 0)) {
    toast('That room type has no rent configured yet', 'error'); return;
  }
  const rent = Number(type.defaultRent) || 0;
  const mess = Number(type.defaultMess) || 0;
  const before = _messTotal(s);
  const after  = rent + (s.messOptIn !== false ? mess : 0);
  if (before === after && !s._rentManuallySet) { toast(s.name + ' already matches the default', 'info'); return; }
  showConfirm(
    'Reset ' + escHtml(s.name) + ' to the hostel default?',
    '<div style="font-size:13px;line-height:1.9">'
    + 'Now: <b>' + fmtPKR(before) + '</b>/month<br>'
    + 'After: <b style="color:var(--green)">' + fmtPKR(after) + '</b>/month'
    + ' <span style="color:var(--text3)">(' + fmtPKR(rent) + ' rent'
    + (mess ? ' + ' + fmtPKR(mess) + ' mess' : '') + ' — ' + escHtml(type.name) + ')</span></div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:8px">Unpaid records are re-based. Records already marked Paid are receipts and stay as they are.'
    + (s.messOptIn === false ? '<br>They stay off the mess.' : '') + '</div>',
    async function () {
      _applyChargesToStudent(s, rent, mess, s.messOptIn);
      delete s._rentManuallySet;   // follows Settings again from here on
      logActivity('Charges Reset', s.name + ' → hostel default ' + fmtPKR(after) + '/mo', 'Finance');
      await saveDB();
      renderPage('settings');
      toast(s.name + ' reset to ' + fmtPKR(after) + '/mo', 'success');
    }
  );
}

/* Same, for every active student carrying a manual override. */
async function resetAllStudentsToDefault() {
  const overridden = DB.students.filter(function (s) {
    if (s.status !== 'Active') return false;
    const room = DB.rooms.find(r => r.id === s.roomId);
    const type = room ? DB.settings.roomTypes.find(t => t.id === room.typeId) : null;
    if (!type || !(Number(type.defaultRent) > 0)) return false;
    const want = (Number(type.defaultRent) || 0) + (s.messOptIn !== false ? (Number(type.defaultMess) || 0) : 0);
    return s._rentManuallySet || _messTotal(s) !== want;
  });
  if (!overridden.length) { toast('Every student already matches the hostel default', 'info'); return; }
  showConfirm(
    'Reset ' + overridden.length + ' student' + (overridden.length === 1 ? '' : 's') + ' to the hostel default?',
    '<div style="font-size:12px;margin-bottom:8px">These students carry a rent that differs from their room type:</div>'
    + '<div style="font-size:12px;line-height:1.8;max-height:180px;overflow:auto">'
    + overridden.slice(0, 12).map(s => '• ' + escHtml(s.name) + ' — ' + fmtPKR(_messTotal(s))).join('<br>')
    + (overridden.length > 12 ? '<br><span style="color:var(--text3)">…and ' + (overridden.length - 12) + ' more</span>' : '')
    + '</div><div style="font-size:11px;color:var(--text3);margin-top:8px">Unpaid records are re-based; paid ones are left alone. Anyone off the mess stays off it.</div>',
    async function () {
      let n = 0;
      overridden.forEach(function (s) {
        const room = DB.rooms.find(r => r.id === s.roomId);
        const type = room ? DB.settings.roomTypes.find(t => t.id === room.typeId) : null;
        if (!type) return;
        _applyChargesToStudent(s, Number(type.defaultRent) || 0, Number(type.defaultMess) || 0, s.messOptIn);
        delete s._rentManuallySet;
        n++;
      });
      logActivity('Charges Reset', n + ' student(s) reset to the hostel default', 'Finance');
      await saveDB();
      renderPage('settings');
      toast(n + ' student' + (n === 1 ? '' : 's') + ' reset to the hostel default', 'success');
    }
  );
}
// ─────────────────────────────────────────────────────────────────────────────

async function updateRoomType(id, field, val) {
  const t=DB.settings.roomTypes.find(x=>x.id===id); if(!t) return;
  const oldRent = t.defaultRent;
  /* `parseFloat(val)||t[field]` alone let a typed "2.5" through as two-and-a-half
     beds and a typed "-3" through as negative ones, both of which then propagated
     into Total Beds Capacity and Average Rent on the summary strip. Beds are whole
     and positive; rent is not negative. Anything rejected keeps the old value —
     the same thing an empty or unparseable box has always done here. Note 0 is
     still a reject for rent, deliberately: a defaultRent change cascades to every
     room of the type and its active students, and a mistyped 0 would zero them. */
  if(field==='capacity') {
    const n = Math.round(parseFloat(val));
    t.capacity = (!n || n < 1) ? t.capacity : n;
  }
  else if(field==='defaultRent') {
    const n = parseFloat(val);
    t.defaultRent = (!n || n < 0) ? t.defaultRent : n;
  }
  /* Unlike rent, 0 is a legitimate mess charge — a hostel that serves no food,
     or one that has not split its combined figure yet. Only NaN and negatives
     are rejected. Mess is not cascaded onto students from here; that is what
     Rent & Mess → Apply is for, so a bulk food-price change is always a
     deliberate act rather than a side effect of typing in this table. */
  else if(field==='defaultMess') {
    const n = parseFloat(val);
    t.defaultMess = (isNaN(n) || n < 0) ? (Number(t.defaultMess) || 0) : n;
  }
  else t[field]=val;
  // Fix #14: When defaultRent changes, update all rooms of this type AND their active students
  if(field==='defaultRent' && t.defaultRent !== oldRent) {
    const newRent = t.defaultRent;
    DB.rooms.forEach(function(r) {
      if(r.typeId !== id) return;
      r.rent = newRent; // update room default rent
      // Update all active students in this room whose rent matched the old default
      DB.students.forEach(function(s) {
        if(s.roomId === r.id && s.status === 'Active' && (s.rent === oldRent || !s._rentManuallySet)) {
          s.rent = newRent;
          // Also update any pending payments for this student
          DB.payments.forEach(function(p) {
            if(p.studentId === s.id && p.status === 'Pending') {
              p.monthlyRent = newRent; p.totalRent = newRent;
              p.unpaid = Math.max(0, newRent - (p.amount||0));
            }
          });
        }
      });
    });
    toast('Default rent updated to '+fmtPKR(newRent)+' — rooms & students updated', 'success');
  }
  _rtTouch();
  await saveDB();
  rtRefreshStrip();   // no-op unless the Room Types panel is the one on screen
}
async function addRoomType() {
  const id='rt_'+uid();
  // Rent starts at 0 so the warden must enter a real figure — a seeded 16,000
  // reads as a configured price and silently becomes a bill.
  DB.settings.roomTypes.push({id,name:'New Type',capacity:1,defaultRent:0,defaultMess:0,color:'#4a9cf0'});
  _rtTouch();
  await saveDB(); renderPage('settings'); toast('Room type added','success');
}
async function removeRoomType(id) {
  if(DB.settings.roomTypes.length<=1){toast('Must have at least one room type','error');return;}
  if(DB.rooms.some(r=>r.typeId===id)){toast('Cannot remove type: rooms are using it','error');return;}
  DB.settings.roomTypes=DB.settings.roomTypes.filter(x=>x.id!==id);
  _rtTouch();
  await saveDB(); renderPage('settings'); toast('Room type removed','info');
}
async function addPaymentMethod() {
  const val=document.getElementById('new-pm').value.trim();
  if(!val||DB.settings.paymentMethods.includes(val)){toast(val?'Already exists':'Enter a name','error');return;}
  DB.settings.paymentMethods.push(val);
  await saveDB(); renderPage('settings'); toast('Payment method added','success');
}
async function removePaymentMethod(m) {
  if(DB.settings.paymentMethods.length<=1){toast('Must keep at least one method','error');return;}
  // Room types and floors have always refused to be removed while something is
  // using them; payment methods and expense categories did not, and the records
  // left behind became unreachable — the method filter on the Payments page is
  // built from this list, so those payments could no longer be filtered for,
  // and opening one in Edit Payment found no matching option, selected the
  // first, and rewrote the record's method on save.
  const _inUse = (DB.payments||[]).filter(p=>p.method===m).length;
  if(_inUse){toast('Cannot remove "'+m+'" — '+_inUse+' payment(s) were taken by it','error');return;}
  DB.settings.paymentMethods=DB.settings.paymentMethods.filter(x=>x!==m);
  logActivity('Payment Method Removed', m, 'Settings');
  await saveDB(); renderPage('settings');
}
async function addExpenseCategory() {
  const val=document.getElementById('new-ec').value.trim();
  if(!val||DB.settings.expenseCategories.includes(val)){toast(val?'Already exists':'Enter a name','error');return;}
  DB.settings.expenseCategories.push(val);
  await saveDB(); renderPage('settings'); toast('Category added','success');
}
async function removeExpenseCategory(c) {
  if(DB.settings.expenseCategories.length<=1){toast('Must keep at least one category','error');return;}
  const _inUse = (DB.expenses||[]).filter(e=>e.category===c).length;
  if(_inUse){toast('Cannot remove "'+c+'" — '+_inUse+' expense(s) are filed under it','error');return;}
  DB.settings.expenseCategories=DB.settings.expenseCategories.filter(x=>x!==c);
  logActivity('Expense Category Removed', c, 'Settings');
  await saveDB(); renderPage('settings');
}
async function addFloor() {
  const val=document.getElementById('new-fl').value.trim();
  if(!val||DB.settings.floors.includes(val)){toast(val?'Already exists':'Enter a name','error');return;}
  DB.settings.floors.push(val);
  await saveDB(); renderPage('settings'); toast('Floor added','success');
}
async function removeFloor(f) {
  if(DB.settings.floors.length<=1){toast('Must keep at least one floor','error');return;}
  if(DB.rooms.some(r=>r.floor===f)){toast('Cannot remove: rooms are on this floor','error');return;}
  DB.settings.floors=DB.settings.floors.filter(x=>x!==f);
  await saveDB(); renderPage('settings');
}
function exportData() {
  const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`${DB.settings.hostelName.replace(/\s+/g,'_')}_backup_${today()}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500); // FIX 17: revoke blob URL to free memory
  toast('Data exported successfully','success');
}
async function importData(input) {
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const data=JSON.parse(e.target.result);
      showConfirm('Import Data?','This will replace all current data with the imported backup.',async ()=>{
        DB=_initDBFields(data); // FIX 24: normalize schema on import same as restoreBackup
        await saveDB(); navigate('dashboard'); toast('Data imported successfully','success');
      });
    } catch(err){ toast('Invalid backup file','error'); }
  };
  reader.readAsText(file);
}

// ════════════════════════════════════════════════════════════════════════════
// EXCEL / CSV IMPORT
// ════════════════════════════════════════════════════════════════════════════

function _excelTemplateRows() {
  return [
    ['Name*','Father Name*','CNIC','Phone','Email','Occupation / Course','Room Number*','Room Rent*','Join Date (YYYY-MM-DD)*','Payment Method','Status','Amount Paid','Emergency Contact','Notes'],
    ['Muhammad Ali','Muhammad Khan','35201-1234567-1','03001234567','m.ali@example.com','BS Computer Science','A 01','16000',today(),'Cash','Active','0','Guardian — 0300000000','Demo student'],
    ['Ahmed Hassan','Hassan Ali','35202-9876543-2','03119876543','','Teacher','A 02','18000',today(),'JazzCash','Active','18000','','Full first month paid'],
  ];
}

function downloadExcelTemplate() {
  if (typeof XLSX === 'undefined') {
    toast('SheetJS library not loaded — check your internet connection and try again.','error');
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(_excelTemplateRows());
  // Style header row width
  ws['!cols'] = [20,18,18,14,22,20,10,12,18,12,10,14,24,20].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Student');
  XLSX.writeFile(wb, 'HOSTYLLO_Students_Template.xlsx');
  toast('Template downloaded — fill it in and re-upload','success');
}

function downloadCSVTemplate() {
  const rows = _excelTemplateRows();
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'HOSTYLLO_Students_Template.csv';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  toast('CSV template downloaded','success');
}

function importFromExcel(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = ''; // reset so same file can be re-picked

  if (typeof XLSX === 'undefined') {
    toast('SheetJS library not loaded — connect to the internet and reload the page.','error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, {type:'array', cellDates:true});
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});

      if (!rows.length) { toast('Spreadsheet appears empty','error'); return; }

      // Normalize column names: lowercase, strip spaces/asterisks
      function norm(s) { return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
      const firstRow = rows[0];
      const keyMap = {}; // normalized → original key
      Object.keys(firstRow).forEach(k => { keyMap[norm(k)] = k; });

      function getCol(row, ...aliases) {
        for (const a of aliases) {
          const k = keyMap[norm(a)];
          if (k !== undefined && row[k] !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim();
        }
        return '';
      }

      // Parse each row
      const preview = [];
      const errors  = [];

      rows.forEach((row, idx) => {
        const lineNo = idx + 2; // row 1 = header
        const name   = getCol(row,'Name','Full Name','Student Name','Student');
        const roomNo = getCol(row,'Room Number','Room No','Room','RoomNo','Room Name','RoomNumber','Room#','Rm');
        // 'Room Rent' is the current column name; the older 'Monthly Rent' and
        // friends stay accepted so sheets built against the old template import.
        const rent   = parseFloat(getCol(row,'Room Rent','Monthly Rent','Rent','Fee','MonthlyRent','RoomRent')) || 0;

        if (!name)   { errors.push(`Row ${lineNo}: Name is required`); return; }
        if (!roomNo) { errors.push(`Row ${lineNo}: Room Number is required for ${name}`); return; }
        if (!rent)   { errors.push(`Row ${lineNo}: Room Rent is required for ${name}`); return; }

        // Find matching room by number — normalize both sides (strip spaces, lowercase)
        const _normRm = s => String(s).replace(/\s+/g,'').toLowerCase();
        const room = DB.rooms.find(r => _normRm(r.number) === _normRm(roomNo));
        if (!room) { errors.push(`Row ${lineNo}: Room #${roomNo} does not exist in app — skipping ${name}`); return; }

        // Check room capacity
        const rtype = getRoomType(room);
        if (getRoomOccupancy(room) >= rtype.capacity) {
          errors.push(`Row ${lineNo}: Room #${roomNo} is full — skipping ${name}`);
          return;
        }

        const joinDateRaw = getCol(row,'Join Date','JoinDate','Date','Joining Date','Admission Date');
        // Normalize date: try various formats
        let joinDate = today();
        if (joinDateRaw) {
          // SheetJS sometimes gives Date objects formatted as strings already
          const d = new Date(joinDateRaw);
          if (!isNaN(d.getTime())) joinDate = ymd(d);
          else joinDate = today();
        }

        const paidAtAdmission = parseFloat(getCol(row,'Amount Paid','Deposit','Advance','Deposit Paid','InitialPayment','AdvancePaid','Paid','Admission Payment','Paid At Admission')) || 0;
        const method = getCol(row,'Payment Method','Method','PaymentMethod') || DB.settings.paymentMethods[0] || 'Cash';
        const status = getCol(row,'Status','Student Status') || 'Active';

        preview.push({
          name,
          fatherName: getCol(row,'Father Name','FatherName','Father','Guardian'),
          cnic:       getCol(row,'CNIC','NIC','ID'),
          phone:      getCol(row,'Phone','Mobile','Contact','Cell','Phone Number','Contact Number','Tel'),
          email:      getCol(row,'Email','Email Address'),
          occupation: getCol(row,'Occupation','Course','Department','Occupation / Course','Study','Field','Program','Degree'),
          emergencyContact: getCol(row,'Emergency Contact','EmergencyContact','Guardian Contact'),
          notes:      getCol(row,'Notes','Remarks','Note'),
          roomId:     room.id,
          roomNumber: room.number,
          rent,
          joinDate,
          paidAtAdmission,
          paymentMethod: method,
          status: ['Active','Left','Blacklisted'].includes(status) ? status : 'Active',
        });
      });

      if (!preview.length && errors.length) {
        toast('No valid rows found. Check the errors below.','error');
        _showExcelImportResult([], errors);
        return;
      }

      _showExcelImportPreview(preview, errors);
    } catch(err) {
      console.error('Excel import error:', err);
      toast('Could not read file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function _showExcelImportPreview(rows, errors) {
  const errHtml = errors.length
    ? `<div style="background:var(--red-dim);border:1px solid rgba(224,82,82,0.3);border-radius:8px;padding:12px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;display:flex;align-items:center;gap:6px">${icon('warning','sm')} ${errors.length} row${errors.length!==1?'s':''} skipped:</div>
        ${errors.map(e=>`<div style="font-size:11.5px;color:var(--text2);padding:2px 0">• ${escHtml(e)}</div>`).join('')}
       </div>` : '';

  const tableRows = rows.slice(0,20).map(r=>`
    <tr>
      <td class="fw-700" style="color:var(--blue)">${escHtml(r.name)}</td>
      <td style="color:var(--text2)">${escHtml(r.fatherName||'—')}</td>
      <td style="color:var(--accent-strong)">Rm #${escHtml(String(r.roomNumber))}</td>
      <td style="color:var(--green)">${fmtPKR(r.rent)}</td>
      <td style="font-size:11px;color:var(--text3)">${r.joinDate}</td>
      <td>${r.paidAtAdmission>0?`<span style="color:var(--green)">${fmtPKR(r.paidAtAdmission)}</span>`:'<span style="color:var(--text3)">—</span>'}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('');

  showModal('modal-xl', `${icon('chart','sm')} Excel Import Preview`, `
    <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <div style="display:flex;align-items:center;color:var(--green)">${icon('check')}</div>
      <div>
        <div style="font-weight:700;color:var(--green)">${rows.length} student${rows.length!==1?'s':''} ready to import</div>
        <div style="font-size:12px;color:var(--text3)">Review the data below before confirming. Duplicate names in the same room will still be added.</div>
      </div>
    </div>
    ${errHtml}
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--bg4);position:sticky;top:0">
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase">Name</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase">Father</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase">Room</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase">Rent</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase">Join Date</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase">Initial Paid</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase">Status</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${rows.length>20?`<div style="padding:10px;text-align:center;font-size:12px;color:var(--text3)">… and ${rows.length-20} more rows (all will be imported)</div>`:''}
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-primary" onclick="confirmExcelImport()">✅ Import ${rows.length} Students</button>`
  );
  // Store rows in a safe global — avoids JSON-in-onclick breakage on apostrophes/special chars
  window._excelImportRows = rows;
}

async function confirmExcelImport() {
  const rows = window._excelImportRows || [];
  window._excelImportRows = null;
  closeModal();
  let added = 0, skipped = 0;
  rows.forEach(r => {
    // Re-check room capacity at import time
    const room = DB.rooms.find(x => x.id === r.roomId);
    if (!room) { skipped++; return; }
    const rtype = getRoomType(room);
    if (getRoomOccupancy(room) >= rtype.capacity) { skipped++; return; }

    const studentId = nextStudentId();
    const unpaid = Math.max(0, r.rent - r.paidAtAdmission);
    const mo = new Date(r.joinDate).toLocaleString('default',{month:'long',year:'numeric'});

    DB.students.push({
      id: studentId,
      name: r.name,
      fatherName: r.fatherName || '',
      cnic: r.cnic || '',
      phone: r.phone || '',
      email: r.email || '',
      occupation: r.occupation || '',
      emergencyContact: r.emergencyContact || '',
      notes: r.notes || '',
      roomId: r.roomId,
      rent: r.rent,
      deposit: r.paidAtAdmission,
      joinDate: r.joinDate,
      paymentMethod: r.paymentMethod,
      status: r.status,
      createdAt: today(),
      docs: { photo: '' }
    });

    // Create payment record for this student (same as manual admission)
    DB.payments.push({
      id: 'p_' + uid(),
      studentId,
      studentName: r.name,
      roomId: r.roomId,
      roomNumber: room.number,
      amount: r.paidAtAdmission,
      monthlyRent: r.rent,
      unpaid,
      method: r.paymentMethod,
      month: mo,
      date: r.joinDate,
      dueDate: '',
      status: r.paidAtAdmission >= r.rent ? 'Paid' : 'Pending',
      paidDate: r.paidAtAdmission >= r.rent ? r.joinDate : '',
      notes: r.paidAtAdmission > 0 ? 'Paid at admission (imported)' : 'Imported via Excel',
      byWarden: ''
    });
    added++;
  });

  logActivity('Excel Import', `${added} students imported from spreadsheet`, 'Student');
  await saveDB();
  navigate('students');
  toast(`✅ ${added} student${added!==1?'s':''} imported successfully${skipped>0?' ('+skipped+' skipped — room full)':''}`, 'success');
}

function _showExcelImportResult(rows, errors) {
  showModal('modal-sm','Import Result',`
    <div style="text-align:center;padding:20px 0">
      <div style="margin-bottom:10px;color:var(--amber)">${icon('warning','lg')}</div>
      <div style="font-weight:700;font-size:16px;margin-bottom:14px">No rows could be imported</div>
      ${errors.map(e=>`<div style="font-size:12px;color:var(--red);padding:3px 0">${escHtml(e)}</div>`).join('')}
    </div>`,
  `<button class="btn btn-primary" onclick="closeModal()">OK</button>`);
}
// ════════════════════════════════════════════════════════════════════════════
async function resetAllData() {
  showConfirm('⚠️ Reset ALL Data?','This will permanently delete all students, payments, expenses, maintenance, complaints, fines, notices, inspections and bill splits. Rooms will be reset. This CANNOT be undone.',async ()=>{
    // BUG FIX: Previously only cleared students/payments/expenses, leaving
    // maintenance, complaints, fines, notices, activityLog, inspections,
    // billSplits, cancellations, checkinlog as orphaned ghost records.
    DB.students=[];
    DB.payments=[];
    DB.expenses=[];
    DB.cancellations=[];
    DB.maintenance=[];
    DB.complaints=[];
    DB.fines=[];
    DB.notices=[];
    DB.activityLog=[];
    DB.inspections=[];
    DB.billSplits=[];
    DB.checkinlog=[];
    DB.rooms=generateRooms();
    await saveDB(); navigate('dashboard'); toast('All data reset','info');
  });
}


/* uploadLogo() and loadSavedLogo() are GONE.

   They let the customer replace the Hostyllo mark on their own sidebar and
   login screen with any image file, persisted in localStorage. The mark is the
   product's identity and is now hardcoded in index.html; the hostel's own
   identity is the name printed next to it, which Settings still owns.

   Nothing calls these any more — the upload input and its click handler were
   removed with them, so leaving the functions would leave dead code that reads
   as a feature. Existing 'hostel_logo_*' localStorage entries are simply never
   read again. */

// ════════════════════════════════════════════════════════════════════════════
// SIDEBAR CALENDAR (professional compact inline calendar)
// ════════════════════════════════════════════════════════════════════════════
// _sbCalOpen/_sbCalYear/_sbCalMonth defined in sidebar_calendar.js


function enforceDataRetention() {
  // Keep ALL data from the last 6 full months + current month (7 months total).
  // Older records are MOVED into DB.archive — the SQLite `archive` table that
  // backs the Annual Archive page — never deleted outright.
  // IMPORTANT: Pending payments are NEVER archived — they represent active unpaid debt.
  //
  // History: the v3 build round-tripped these records through the
  // `dbh2_archive` localStorage key. The v4 SQLite migration replaced the read
  // with a hardcoded empty object and the write with a comment, but left the
  // pruning intact — so every run silently destroyed the records it claimed to
  // archive. This function is now fail-safe: a record is only ever removed from
  // the live table once it is provably present in DB.archive.
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 6, 1); // 6 months ago start
  const cutoffKey = ym(cutoff);                      // e.g. "2025-09"

  // A record with no id cannot be persisted — saveDB() skips id-less rows on
  // upsert — so archiving one would delete it from the live table and write it
  // nowhere. Those stay put regardless of age.
  const hasId = r => !!r && r.id != null && r.id !== '';

  const isOldPayment = p => {
    if (!hasId(p)) return false;
    if (p.status === 'Pending') return false; // never archive outstanding debt
    const d = p.paidDate||p.date||'';
    return !!d && d.slice(0,7) < cutoffKey;
  };
  const isOldExpense = e => {
    if (!hasId(e)) return false;
    const d = e.date||'';
    return !!d && d.slice(0,7) < cutoffKey;
  };

  const oldPayments = (DB.payments||[]).filter(isOldPayment);
  const oldExpenses = (DB.expenses||[]).filter(isOldExpense);
  if (oldPayments.length === 0 && oldExpenses.length === 0) return;

  if (!Array.isArray(DB.archive)) DB.archive = [];
  // Deduplicate by id against what the archive already holds — repeated saves
  // must not append the same record twice.
  const archivedIds = new Set(DB.archive.filter(hasId).map(r => r.id));

  // `_src` records which live table the row came from, so the Annual Archive
  // classifies it deterministically instead of guessing from field shape.
  oldPayments.forEach(p => {
    if (!archivedIds.has(p.id)) DB.archive.push(Object.assign({}, p, { _src: 'payments' }));
  });
  oldExpenses.forEach(e => {
    if (!archivedIds.has(e.id)) DB.archive.push(Object.assign({}, e, { _src: 'expenses' }));
  });

  // Remove from the live tables ONLY what is now sitting in the archive.
  // If anything above failed to land, the record stays live and is retried on
  // the next save rather than being lost.
  const archivedNow = new Set(DB.archive.filter(hasId).map(r => r.id));
  DB.payments = (DB.payments||[]).filter(p => !isOldPayment(p) || !archivedNow.has(p.id));
  DB.expenses = (DB.expenses||[]).filter(e => !isOldExpense(e) || !archivedNow.has(e.id));
}

// ════════════════════════════════════════════════════════════════════════════
// THEME / ACCENT COLOR
// ════════════════════════════════════════════════════════════════════════════
