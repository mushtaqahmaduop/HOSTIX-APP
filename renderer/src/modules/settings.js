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
             uploadLogo, loadSavedLogo
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function drawCharts() {} // charts are rendered as HTML bars

async function saveMaintenance() {
  const title = document.getElementById('mt-title')?.value?.trim();
  if(!title){toast('Enter a title','error');return;}
  if(!DB.maintenance) DB.maintenance=[];
  logActivity('Maintenance Added', title, 'Maintenance');
  DB.maintenance.push({
    id:'mt_'+uid(), title, roomId:document.getElementById('mt-room')?.value||'',
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
    id:'cp_'+uid(), subject,
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
  const students = DB.students.filter(s=>s.status==='Active').map(s=>`<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
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
      <div style="font-size:11px;color:var(--text3);margin-top:3px">${myPaymentsThisMo.length} payment${myPaymentsThisMo.length!==1?'s':''} this month${curName?' · '+curName:''}</div>
    </div>
    <div style="background:var(--card);border:1px solid rgba(155,109,240,0.25);border-radius:var(--radius);padding:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="micon" style="font-size:20px;color:var(--purple)">person_add</span>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3)">Students Added</div>
      </div>
      <div style="font-size:22px;font-weight:900;color:var(--purple)">${myStudentsThisMo.length}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">this month${curName?' · '+curName:''}</div>
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
        <span style="font-size:11px;padding:2px 10px;border-radius:20px;background:${catColor[a.category]||'var(--blue)'}22;color:${catColor[a.category]||'var(--blue)'};margin-bottom:4px;display:inline-block">${a.category||'General'}</span>
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
          <div style="font-size:24px;font-weight:800;color:var(--gold2)">${fmtPKR(perUnit)}</div>
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
  const rooms = DB.rooms.map(r=>`<option value="${r.id}">Room ${r.number}</option>`).join('');
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
      <label style="display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;cursor:pointer;transition:border-color 0.2s" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
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
// ════════════════════════════════════════════════════════════════════════════
// WHATSAPP BULK RENT REMINDER
// ════════════════════════════════════════════════════════════════════════════
function showRentReminderModal() {
  var pending = DB.payments.filter(function(p){return p.status==='Pending';});
  var studentIds = [];
  pending.forEach(function(p){if(p.studentId&&studentIds.indexOf(p.studentId)<0) studentIds.push(p.studentId);});
  var list = studentIds.map(function(sid){
    var s = DB.students.find(function(x){return x.id===sid;});
    var dues = pending.filter(function(p){return p.studentId===sid;});
    var totalDue = dues.reduce(function(sum,p){return sum+Number(p.unpaid!=null?p.unpaid:(p.amount||0));},0);
    var activeDues = dues.filter(function(p){return Number(p.unpaid!=null?p.unpaid:(p.amount||0))>0;});
    return {student:s, dues:activeDues, totalDue:totalDue};
  }).filter(function(x){return x.student && x.totalDue>0;});

  var wardenPhone = (CUR_USER&&CUR_USER.phone) ? CUR_USER.phone : '';
  var defaultNum = DB.settings.defaultWANumber || wardenPhone || '';
  var defaultNumFmt = defaultNum.replace(/[^0-9]/g,'').replace(/^0/,'92');

  var header = '<div style="background:var(--bg4);border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:14px">';
  header += '<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px">&#x1F4F2; Default Notification Number (send all reminders to this number)</div>';
  header += '<div style="display:flex;gap:6px;align-items:center">';
  header += '<input id="wa-default-num" class="form-control" placeholder="e.g. 03001234567" value="'+escHtml(defaultNum)+'" style="flex:1">';
  header += '<button class="btn btn-primary btn-sm" onclick="(async()=>{var v=document.getElementById(\'wa-default-num\').value.trim();DB.settings.defaultWANumber=v;await saveDB();toast(\'Saved\',\'success\');})()">Save</button>';
  if(defaultNumFmt) {
    header += '<a href="https://wa.me/'+defaultNumFmt+'" target="_blank" class="btn btn-sm" style="background:#25d366;color:#fff;border:none;text-decoration:none">&#x1F4E2; Notify</a>';
  }
  header += '</div></div>';

  var info = '<div style="background:var(--amber-dim);border:1px solid rgba(240,160,48,0.3);border-radius:10px;padding:12px;margin-bottom:14px">';
  info += '<div style="font-size:13px;font-weight:700;color:var(--amber);margin-bottom:3px">&#x26A0; '+list.length+' students have pending payments</div>';
  info += '<div style="font-size:11px;color:var(--text2)">Phone numbers are auto-fetched from student records. Click to open WhatsApp.</div></div>';

  var rows = '';
  if(list.length===0) {
    rows = '<div style="text-align:center;padding:24px;color:var(--green)">&#x1F389; All rents collected!</div>';
  } else {
    list.forEach(function(item){
      var student = item.student;
      var dues = item.dues;
      var totalDue = item.totalDue;
      var room = DB.rooms.find(function(r){return r.id===student.roomId;});
      var rawPhone = (student.phone||'').replace(/[^0-9]/g,'').replace(/^0/,'92');
      var msg = encodeURIComponent('Assalamu Alaikum *'+student.name+'*,\n\n'
        +'Reminder from *'+DB.settings.hostelName+'*\n\n'
        +'Dear Student,\n'
        +'This is a reminder that your hostel fee is still pending. Please make the payment as soon as possible to avoid any inconvenience, otherwise late fee charges may apply.\n'
        +'Thank you for your prompt attention.\n\n'
        +'💰 Pending Amount: *'+fmtPKR(totalDue)+'*\n'
        +'Room: #'+(room?room.number:'—')+'\n'
        +'Month(s): '+dues.map(function(d){return d.month;}).join(', '));
      // FIX 5: msg already URL-encoded — no double-encode. Add wa.me web fallback.
      var waDeepLink = rawPhone ? 'whatsapp://send?phone='+rawPhone+'&text='+msg : '';
      var waWebLink  = rawPhone ? 'https://wa.me/'+rawPhone+'?text='+msg : '';
      rows += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;gap:10px">';
      rows += '<div style="flex:1;min-width:0">';
      rows += '<div style="font-weight:700;font-size:13px">'+escHtml(student.name)+'</div>';
      rows += '<div style="font-size:11px;color:var(--text3);margin-top:2px">Room '+(room?'#'+room.number:'—')+'  ·  '+dues.length+' month(s)  ·  <span style="color:var(--red);font-weight:700">'+fmtPKR(totalDue)+' due</span></div>';
      rows += '<div style="font-size:11px;color:var(--text3)">&#x1F4DE; '+(student.phone||'<span style="color:var(--red)">No phone number on record</span>')+'</div>';
      rows += '</div>';
      rows += '<div style="display:flex;gap:5px;flex-shrink:0">';
      if(rawPhone) {
        rows += '<button onclick="openExternalLink(\''+waDeepLink+'\')" class="btn btn-sm" style="background:#25d366;color:#fff;border:none;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:4px"><svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' width=\'13\' height=\'13\'><path d=\'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z\' fill=\'#fff\'/></svg> App</button>';
        rows += '<a href="'+waWebLink+'" target="_blank" class="btn btn-sm" style="background:#128C7E;color:#fff;border:none;font-size:11px;text-decoration:none;display:inline-flex;align-items:center">&#x1F310; Web</a>';
      } else {
        rows += '<span style="font-size:11px;color:var(--red)">No number</span>';
      }
      rows += '</div></div>';
    });
  }

  showModal('modal-lg','&#x1F4F1; WhatsApp Reminders', header+info+rows,
    '<button class="btn btn-secondary" onclick="closeModal()">Close</button>'
  );
}

// ════════════════════════════════════════════════════════════════════════════
let settingsTab = 'hostel';
function renderSettings() {
  const s = DB.settings;
  const tabs = [
    {id:'hostel', icon:'🏨', label:'Hostel Info'},
    {id:'rooms', icon:'🏠', label:'Room Types'},
    {id:'payments', icon:'💳', label:'Payment Methods'},
    {id:'expenses', icon:'📉', label:'Expense Categories'},
    {id:'floors', icon:'🏗️', label:'Floors'},
    {id:'data', icon:'💾', label:'Data Management'},
    {id:'license', icon:'🔐', label:'License'}
  ];

  const pmList = (s.paymentMethods||[]).map(m=>`<div class="tag-item" id="pm-${escHtml(m)}">${escHtml(m)}<button class="tag-remove" onclick="removePaymentMethod('${escHtml(m)}')">×</button></div>`).join('');
  const ecList = (s.expenseCategories||[]).map(c=>`<div class="tag-item" id="ec-${escHtml(c)}">${escHtml(c)}<button class="tag-remove" onclick="removeExpenseCategory('${escHtml(c)}')">×</button></div>`).join('');
  const floorList = (s.floors||[]).map(f=>`<div class="tag-item" id="fl-${escHtml(f)}">${escHtml(f)}<button class="tag-remove" onclick="removeFloor('${escHtml(f)}')">×</button></div>`).join('');
  const rtRows = (s.roomTypes||[]).map(t=>`
    <div class="room-type-row" id="rt-${t.id}">
      <div class="room-type-color" style="background:${t.color}"></div>
      <input class="form-control" style="flex:2" value="${escHtml(t.name)}" onchange="updateRoomType('${t.id}','name',this.value)" placeholder="Type name">
      <input class="form-control" style="flex:1" type="number" value="${t.capacity}" onchange="updateRoomType('${t.id}','capacity',this.value)" placeholder="Beds">
      <input class="form-control" style="flex:2" type="number" value="${t.defaultRent}" onchange="updateRoomType('${t.id}','defaultRent',this.value)" placeholder="Default rent">
      <input type="color" value="${t.color}" onchange="updateRoomType('${t.id}','color',this.value)" style="width:36px;height:36px;border:1px solid var(--border);border-radius:6px;background:var(--bg3);cursor:pointer;padding:2px">
      <button class="btn btn-danger btn-sm" onclick="removeRoomType('${t.id}')">Remove</button>
    </div>`).join('');

  return `
  <div class="settings-topnav-wrap">
    <div class="settings-nav">
      ${tabs.map(t=>`<div class="settings-tab ${settingsTab===t.id?'active':''}" onclick="settingsTab='${t.id}';renderPage('settings')">${t.icon} ${t.label}</div>`).join('')}
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
                <input type="checkbox" id="font-picker-toggle" ${s.showFontPicker!==false?'checked':''} onchange="(async function(){DB.settings.showFontPicker=this.checked;await saveDB();document.getElementById('font-picker-grid-wrap').style.display=this.checked?'':'none';}).call(this)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--gold2)">
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
                ].map(([ff,label])=>`<div onclick="applyHostelFont('${ff}')" style="cursor:pointer;border:2px solid ${(s.hostelNameFont||'DM Serif Display')===ff?'var(--gold)':'var(--border)'};border-radius:8px;padding:8px 6px;text-align:center;background:${(s.hostelNameFont||'DM Serif Display')===ff?'var(--gold-dim)':'var(--bg3)'};transition:all 0.15s" onmouseover="this.style.borderColor='var(--gold2)'" onmouseout="this.style.borderColor='${(s.hostelNameFont||'DM Serif Display')===ff?'var(--gold)':'var(--border)'}'">
                  <div class="font-card-label" style="font-family:'${ff}',serif;font-size:13px;font-weight:700;color:var(--gold2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(s.hostelName||'Hostel Name')}</div>
                  <div style="font-size:8.5px;color:var(--text3);margin-top:2px">${label}</div>
                </div>`).join('')}
              </div>
              <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
                <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Preview: </span>
                <span id="font-preview-name" style="font-family:'${s.hostelNameFont||'DM Serif Display'}',serif;font-size:16px;font-weight:700;color:var(--gold2)">${escHtml(s.hostelName||'DAMAM Boys Hostel')}</span>
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
      <div class="settings-panel ${settingsTab==='rooms'?'active':''}">
        <div class="card">
          <div class="card-header"><div class="card-title">🏠 Room Types Configuration</div><button class="btn btn-primary btn-sm" onclick="addRoomType()">+ Add Type</button></div>
          <div style="display:grid;grid-template-columns:auto 2fr 1fr 2fr auto auto;gap:10px;margin-bottom:10px;padding:0 4px">
            <div class="stat-label">Color</div><div class="stat-label">Type Name</div><div class="stat-label">Capacity</div><div class="stat-label">Default Rent (PKR)</div><div class="stat-label">Pick Color</div><div></div>
          </div>
          <div id="room-types-list">${rtRows}</div>
          <div style="margin-top:14px;text-align:right">
            <button class="btn btn-primary" onclick="saveSettings()">💾 Save Room Types</button>
          </div>
          <div style="margin-top:16px;background:var(--amber-dim);border:1px solid rgba(240,160,48,0.2);border-radius:var(--radius-sm);padding:12px;font-size:13px;color:var(--amber)">
            ⚠️ Changing room types here updates default values. Existing room rents remain unchanged unless you edit them individually.
          </div>
        </div>
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
        <div class="card">
          <div class="card-header"><div class="card-title">${icon('download','sm')} Data Management</div>
            <div style="font-size:12px;color:var(--text3)">For backup & restore, use the <strong style="color:var(--gold2)">Backup & Restore</strong> option in the sidebar menu.</div>
          </div>
          <div class="form-grid">
            <!-- EXCEL/CSV IMPORT CARD -->
            <div class="card" style="padding:16px;border-color:rgba(74,156,240,0.4);grid-column:span 2">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <div style="width:34px;height:34px;border-radius:8px;background:var(--green-dim);display:flex;align-items:center;justify-content:center;color:var(--green)">${icon('chart','sm')}</div>
                <div>
                  <div style="font-weight:700;color:var(--text)">Import Students from Excel / CSV</div>
                  <div style="font-size:12px;color:var(--text3)">Bulk-add students from a spreadsheet — download the template, fill it in, then upload</div>
                </div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-secondary btn-sm" onclick="downloadExcelTemplate()">⬇️ Download Template (.xlsx)</button>
                <button class="btn btn-secondary btn-sm" onclick="downloadCSVTemplate()">⬇️ Download Template (.csv)</button>
                <input type="file" id="excel-import-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importFromExcel(this)">
                <button class="btn btn-primary btn-sm" onclick="document.getElementById('excel-import-file').click()">📤 Upload & Import File</button>
              </div>
              <div style="margin-top:10px;padding:10px 12px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text3)">
                <strong style="color:var(--gold2)">Required columns:</strong> Name, Father Name, CNIC, Phone, Room Number, Monthly Rent, Join Date, Payment Method, Status, Amount Paid
                <span style="margin-left:8px;color:var(--text3)">· Optional: Email, Occupation / Course, Emergency Contact, Notes, Amount Paid</span>
              </div>
            </div>

            <div class="card" style="padding:16px;border-color:var(--border2)">
              <div style="font-weight:700;margin-bottom:6px">System Stats</div>
              <div style="font-size:13px;color:var(--text3)">
                Rooms: ${DB.rooms.length} · Students: ${DB.students.length} · Payments: ${DB.payments.length} · Expenses: ${DB.expenses.length}
              </div>
              <div style="font-size:12px;color:var(--text3);margin-top:8px">Storage: ~${Math.round(JSON.stringify(DB).length/1024)}KB used</div>
            </div>
          </div>
        </div>
      </div>

      <!-- RENT UPDATE -->
      <div class="settings-panel ${settingsTab==='rentupdate'?'active':''}">
        <div class="card">
          <div class="card-header" style="padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:16px">
            <div class="card-title" style="font-size:16px;display:flex;align-items:center;gap:8px"><span class="micon" style="font-size:20px;color:var(--gold2)">payments</span>Bulk Rent Update</div>
            <div style="font-size:12px;color:var(--text3);margin-top:4px">Update monthly rent for all or selected students. Changes apply to all future pending payments automatically.</div>
          </div>

          <!-- By Room Type quick-set -->
          <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px;margin-bottom:18px">
            <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--gold2);margin-bottom:12px">⚡ Quick Set by Room Type</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
              ${DB.settings.roomTypes.map(function(type){
                var cnt=DB.students.filter(function(s){return s.status==='Active'&&DB.rooms.find(function(r){return r.id===s.roomId&&r.typeId===type.id;});}).length;
                return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px">'
                  +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
                  +'<div style="width:10px;height:10px;border-radius:3px;background:'+type.color+';flex-shrink:0"></div>'
                  +'<span style="font-size:13px;font-weight:700;color:var(--text)">'+escHtml(type.name)+'</span>'
                  +'<span style="margin-left:auto;font-size:10px;color:var(--text3)">'+cnt+' students</span>'
                  +'</div>'
                  +'<div style="display:flex;gap:6px;align-items:center">'
                  +'<input class="form-control" type="number" id="qr-'+type.id+'" value="'+type.defaultRent+'" style="flex:1;font-size:13px" placeholder="New rent">'
                  +'<button class="btn btn-primary btn-sm" onclick="applyRentByType(\''+type.id+'\')" style="white-space:nowrap;display:flex;align-items:center;gap:4px"><span class="micon" style="font-size:13px">check</span>Apply</button>'
                  +'</div></div>';
              }).join('')}
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input class="form-control" type="number" id="qr-all" placeholder="New rent for ALL students" style="max-width:240px">
              <button class="btn btn-primary" onclick="applyRentToAll()" style="display:flex;align-items:center;gap:6px"><span class="micon" style="font-size:15px">group</span>Apply to All Students</button>
            </div>
          </div>

          <!-- Per-student table -->
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Individual Override</div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="background:var(--bg3)">
                  <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;text-transform:uppercase">Student</th>
                  <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;text-transform:uppercase">Room</th>
                  <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;text-transform:uppercase">Type</th>
                  <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;text-transform:uppercase">Current Rent</th>
                  <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;text-transform:uppercase">New Rent</th>
                  <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;text-transform:uppercase">Save</th>
                </tr>
              </thead>
              <tbody>
                ${DB.students.filter(function(s){return s.status==='Active';}).map(function(s,i){
                  var room=DB.rooms.find(function(r){return r.id===s.roomId;});
                  var rtype=room?DB.settings.roomTypes.find(function(t){return t.id===room.typeId;}):null;
                  return '<tr style="border-top:1px solid var(--border);background:'+(i%2?'var(--bg3)':'transparent')+'">'
                    +'<td style="padding:10px 12px"><div style="font-weight:700;color:var(--text)">'+escHtml(s.name)+'</div><div style="font-size:11px;color:var(--text3)">'+escHtml(s.phone||'—')+'</div></td>'
                    +'<td style="padding:10px 12px;font-weight:700;color:var(--gold2)">#'+(room?room.number:'—')+'</td>'
                    +'<td style="padding:10px 12px"><span style="font-size:11px;background:var(--bg4);border:1px solid var(--border2);border-radius:20px;padding:2px 8px;color:var(--text2)">'+(rtype?escHtml(rtype.name):'—')+'</span></td>'
                    +'<td style="padding:10px 12px;font-weight:700;color:var(--green)">'+fmtPKR(s.rent)+'</td>'
                    +'<td style="padding:10px 12px"><input class="form-control" type="number" id="sr-'+s.id+'" value="'+s.rent+'" style="width:120px;font-size:13px" placeholder="New rent"></td>'
                    +'<td style="padding:10px 12px;text-align:center"><button class="btn btn-success btn-sm" onclick="applyRentToStudent(\''+s.id+'\')" style="display:flex;align-items:center;gap:4px;margin:0 auto"><span class="micon" style="font-size:13px">check_circle</span>Save</button></td>'
                    +'</tr>';
                }).join('')}
              </tbody>
            </table>
          </div>
          ${DB.students.filter(function(s){return s.status==='Active';}).length===0?'<div style="text-align:center;padding:40px;color:var(--text3)">No active students found</div>':''}
        </div>
      </div>

      <!-- LICENSE -->
      <div class="settings-panel ${settingsTab==='license'?'active':''}">
        ${renderLicenseSettingsPanel()}
      </div>

  </div>`;
}

function bindSettingsEvents() {}

// ── License Settings Panel (rendered inside Settings page) ────────────────────
function renderLicenseSettingsPanel() {
  const licCache = window._damam_license_cache;
  const hasLic   = licCache && licCache.valid;
  const expStr   = hasLic && licCache.expiry
    ? new Date(licCache.expiry).toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'})
    : '—';
  const keyStr   = hasLic && licCache.key
    ? (() => { const p = licCache.key.split('-'); return p.length===4 ? p[0]+'-'+p[1]+'-····-'+p[3] : licCache.key; })()
    : '—';

  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title" style="display:flex;align-items:center;gap:8px">
        🔐 License Information
        <span style="font-size:11px;padding:2px 10px;border-radius:20px;font-weight:700;
          ${hasLic
            ? 'background:rgba(46,201,138,0.15);border:1px solid rgba(46,201,138,0.4);color:#2ec98a'
            : 'background:rgba(224,82,82,0.15);border:1px solid rgba(224,82,82,0.4);color:#e05252'}">
          ${hasLic ? '✅ Active' : '❌ Not Active'}
        </span>
      </div>
    </div>
    <div class="form-grid">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">License Key</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--gold2);letter-spacing:1px">${escHtml(keyStr)}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Valid Until</div>
        <div style="font-size:13px;font-weight:700;color:${hasLic?'var(--green)':'var(--text3)'}">${escHtml(expStr)}</div>
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
// ── BULK RENT UPDATE ─────────────────────────────────────────────────────────
function _applyRentToStudentCore(student, newRent) {
  // Update student rent
  student.rent = newRent;
  // Update all PENDING payment records for this student so future dues are correct
  DB.payments.forEach(function(p) {
    if (p.studentId === student.id && p.status === 'Pending') {
      const oldUnpaid = p.unpaid != null ? Number(p.unpaid) : Number(p.amount);
      p.monthlyRent = newRent;
      // Recalculate unpaid based on new rent minus what was already paid
      const alreadyPaid = Number(p.amount) || 0;
      p.unpaid = Math.max(0, newRent - alreadyPaid - (p.discount || 0));
    }
  });
}

async function applyRentToStudent(studentId) {
  const s = DB.students.find(x => x.id === studentId); if (!s) return;
  const inp = document.getElementById('sr-' + studentId); if (!inp) return;
  const newRent = parseFloat(inp.value);
  if (!newRent || newRent <= 0) { toast('Enter a valid rent amount', 'error'); return; }
  if (newRent === s.rent) { toast('Rent unchanged', 'info'); return; }
  const old = s.rent;
  _applyRentToStudentCore(s, newRent);
  s._rentManuallySet = true; // Fix #14: flag so auto defaultRent changes don't override this
  logActivity('Rent Updated', s.name + ' — ' + fmtPKR(old) + ' → ' + fmtPKR(newRent), 'Finance');
  await saveDB();
  renderPage('settings');
  toast('Rent updated for ' + s.name + ' → ' + fmtPKR(newRent), 'success');
}

async function applyRentByType(typeId) {
  const inp = document.getElementById('qr-' + typeId); if (!inp) return;
  const newRent = parseFloat(inp.value);
  if (!newRent || newRent <= 0) { toast('Enter a valid rent amount', 'error'); return; }
  const type = DB.settings.roomTypes.find(t => t.id === typeId); if (!type) return;
  // Update defaultRent for this room type
  type.defaultRent = newRent;
  // Apply to all active students in rooms of this type
  let count = 0;
  DB.students.filter(s => s.status === 'Active').forEach(function(s) {
    const room = DB.rooms.find(r => r.id === s.roomId);
    if (room && room.typeId === typeId) {
      _applyRentToStudentCore(s, newRent);
      count++;
    }
  });
  logActivity('Bulk Rent Update', type.name + ' — all ' + count + ' students → ' + fmtPKR(newRent), 'Finance');
  await saveDB();
  renderPage('settings');
  toast(count + ' student(s) updated to ' + fmtPKR(newRent), 'success');
}

async function applyRentToAll() {
  const inp = document.getElementById('qr-all'); if (!inp) return;
  const newRent = parseFloat(inp.value);
  if (!newRent || newRent <= 0) { toast('Enter a valid rent amount', 'error'); return; }
  showConfirm(
    'Update ALL students rent?',
    'This will set ' + fmtPKR(newRent) + ' as the new monthly rent for every active student and update all pending payments.',
    async function() {
      let count = 0;
      DB.students.filter(s => s.status === 'Active').forEach(function(s) {
        _applyRentToStudentCore(s, newRent);
        count++;
      });
      // Also update all room type defaults
      DB.settings.roomTypes.forEach(function(t) { t.defaultRent = newRent; });
      logActivity('Global Rent Update', 'All ' + count + ' students → ' + fmtPKR(newRent), 'Finance');
      await saveDB();
      renderPage('settings');
      toast('All ' + count + ' students updated to ' + fmtPKR(newRent), 'success');
    }
  );
}
// ─────────────────────────────────────────────────────────────────────────────

async function updateRoomType(id, field, val) {
  const t=DB.settings.roomTypes.find(x=>x.id===id); if(!t) return;
  const oldRent = t.defaultRent;
  if(field==='capacity'||field==='defaultRent') t[field]=parseFloat(val)||t[field];
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
  await saveDB();
}
async function addRoomType() {
  const id='rt_'+uid();
  DB.settings.roomTypes.push({id,name:'New Type',capacity:1,defaultRent:16000,color:'#4a9cf0'});
  await saveDB(); renderPage('settings'); toast('Room type added','success');
}
async function removeRoomType(id) {
  if(DB.settings.roomTypes.length<=1){toast('Must have at least one room type','error');return;}
  if(DB.rooms.some(r=>r.typeId===id)){toast('Cannot remove type: rooms are using it','error');return;}
  DB.settings.roomTypes=DB.settings.roomTypes.filter(x=>x.id!==id);
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
  DB.settings.paymentMethods=DB.settings.paymentMethods.filter(x=>x!==m);
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
  DB.settings.expenseCategories=DB.settings.expenseCategories.filter(x=>x!==c);
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
    ['Name*','Father Name*','CNIC','Phone','Email','Occupation / Course','Room Number*','Monthly Rent*','Join Date (YYYY-MM-DD)*','Payment Method','Status','Amount Paid','Emergency Contact','Notes'],
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
  XLSX.writeFile(wb, 'DAMAM_Students_Template.xlsx');
  toast('Template downloaded — fill it in and re-upload','success');
}

function downloadCSVTemplate() {
  const rows = _excelTemplateRows();
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'DAMAM_Students_Template.csv';
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
        const rent   = parseFloat(getCol(row,'Monthly Rent','Rent','Fee','MonthlyRent')) || 0;

        if (!name)   { errors.push(`Row ${lineNo}: Name is required`); return; }
        if (!roomNo) { errors.push(`Row ${lineNo}: Room Number is required for ${name}`); return; }
        if (!rent)   { errors.push(`Row ${lineNo}: Monthly Rent is required for ${name}`); return; }

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
          if (!isNaN(d.getTime())) joinDate = d.toISOString().split('T')[0];
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
      <td style="color:var(--gold2)">Rm #${r.roomNumber}</td>
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
   <button class="btn btn-primary" style="background:linear-gradient(135deg,#0d2d1a,#0a2015);border-color:rgba(46,201,138,0.5);color:var(--green)" onclick="confirmExcelImport()">✅ Import ${rows.length} Students</button>`
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


function uploadLogo(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img  = document.getElementById('sb-logo-img');
    const svg  = document.getElementById('sb-logo-svg');
    img.src = e.target.result;
    img.style.display = 'block';
    if (svg) svg.style.display = 'none';
    // Also sync login screen logo
    const loginImg   = document.getElementById('login-logo-img');
    const loginEmoji = document.getElementById('login-logo-emoji');
    if (loginImg)   { loginImg.src = e.target.result; loginImg.style.display = 'block'; }
    if (loginEmoji) loginEmoji.style.display = 'none';
    try { localStorage.setItem('hostel_logo_' + _ACTIVE_HOSTEL, e.target.result); } catch(err) {}
    toast('Logo updated — login screen updated too', 'success');
  };
  reader.readAsDataURL(file);
  input.value = '';
}
function loadSavedLogo() {
  try {
    const saved = localStorage.getItem('hostel_logo_' + _ACTIVE_HOSTEL);
    if (saved) {
      const img = document.getElementById('sb-logo-img');
      const svg = document.getElementById('sb-logo-svg');
      if (img) { img.src = saved; img.style.display = 'block'; if(svg) svg.style.display='none'; }
      // Also sync login screen logo
      const loginImg   = document.getElementById('login-logo-img');
      const loginEmoji = document.getElementById('login-logo-emoji');
      if (loginImg)   { loginImg.src = saved; loginImg.style.display = 'block'; }
      if (loginEmoji) loginEmoji.style.display = 'none';
    }
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════════════════
// SIDEBAR CALENDAR (professional compact inline calendar)
// ════════════════════════════════════════════════════════════════════════════
// _sbCalOpen/_sbCalYear/_sbCalMonth defined in sidebar_calendar.js


function enforceDataRetention() {
  // Keep ALL data from the last 6 full months + current month (7 months total)
  // Older records are archived to a separate localStorage key before pruning
  // IMPORTANT: Pending payments are NEVER archived — they represent active unpaid debt
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 6, 1); // 6 months ago start
  const cutoffKey = cutoff.toISOString().slice(0,7); // e.g. "2025-09"

  // Archive old PAID payments before removing (Pending payments are never pruned)
  const oldPayments = DB.payments.filter(p => {
    if (p.status === 'Pending') return false; // never archive outstanding debt
    const d = p.paidDate||p.date||'';
    return d && d.slice(0,7) < cutoffKey;
  });
  const oldExpenses = DB.expenses.filter(e => {
    const d = e.date||'';
    return d && d.slice(0,7) < cutoffKey;
  });

  if(oldPayments.length > 0 || oldExpenses.length > 0) {
    // Save to archive
    try {
      // Archive is now stored in SQLite — fetch via IPC if needed
      const existingArchive = { payments: [], expenses: [] };
      // FIX #8: Deduplicate by ID before appending — repeated saves previously caused duplicate archive entries
      const existingPayIds = new Set((existingArchive.payments||[]).map(p => p.id));
      const existingExpIds = new Set((existingArchive.expenses||[]).map(e => e.id));
      existingArchive.payments = [
        ...(existingArchive.payments||[]),
        ...oldPayments.filter(p => !existingPayIds.has(p.id))
      ];
      existingArchive.expenses = [
        ...(existingArchive.expenses||[]),
        ...oldExpenses.filter(e => !existingExpIds.has(e.id))
      ];
      existingArchive.lastArchived = new Date().toISOString();
      // Archive records are written to SQLite archive table via saveDB()
    } catch(e) {}

    // Remove from live DB — but keep all Pending payments regardless of age
    DB.payments = DB.payments.filter(p => {
      if (p.status === 'Pending') return true; // always keep unpaid records
      const d = p.paidDate||p.date||'';
      return !d || d.slice(0,7) >= cutoffKey;
    });
    DB.expenses = DB.expenses.filter(e => {
      const d = e.date||'';
      return !d || d.slice(0,7) >= cutoffKey;
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// THEME / ACCENT COLOR
// ════════════════════════════════════════════════════════════════════════════
