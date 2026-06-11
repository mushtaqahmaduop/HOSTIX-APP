/* ─── HOSTIX — ISSUES (Maintenance & Complaints) MODULE ────────────────────
   Contains: renderIssues, showAddIssueModal, saveIssue (wrapper),
             resolveMaintenance, progressMaintenance, deleteMaintenance,
             resolveComplaint, deleteComplaint,
             showAddMaintenanceModal, showAddComplaintModal
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function renderIssues() {
  var mlist = DB.maintenance || [];
  var clist = DB.complaints || [];
  var mOpen = mlist.filter(function(m){return m.status==='Open';}).length;
  var mIP   = mlist.filter(function(m){return m.status==='InProgress';}).length;
  var mRes  = mlist.filter(function(m){return m.status==='Resolved';}).length;
  var cOpen = clist.filter(function(c){return c.status==='Open';}).length;
  var cRev  = clist.filter(function(c){return c.status==='UnderReview';}).length;
  var cRes  = clist.filter(function(c){return c.status==='Resolved';}).length;

  var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">';
  html += '<div style="background:var(--card);border:1px solid rgba(224,82,82,0.3);border-radius:var(--radius);padding:14px;text-align:center"><div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:4px">&#x1F527; Open</div><div style="font-size:26px;font-weight:800;color:var(--red)">'+mOpen+'</div></div>';
  html += '<div style="background:var(--card);border:1px solid rgba(240,160,48,0.3);border-radius:var(--radius);padding:14px;text-align:center"><div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:4px">In Progress</div><div style="font-size:26px;font-weight:800;color:var(--amber)">'+mIP+'</div></div>';
  html += '<div style="background:var(--card);border:1px solid rgba(46,201,138,0.3);border-radius:var(--radius);padding:14px;text-align:center"><div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:4px">&#x1F4AC; Complaints</div><div style="font-size:26px;font-weight:800;color:var(--purple)">'+cOpen+'</div></div>';
  html += '</div>';

  // Tab bar
  var mActive = issuesTab==='maintenance';
  html += '<div style="display:flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:18px">';
  html += '<button onclick="issuesTab=\'maintenance\';renderPage(\'issues\')" style="flex:1;padding:11px;border:none;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;background:'+(mActive?'var(--gold-dim)':'var(--bg3)')+';color:'+(mActive?'var(--gold2)':'var(--text2)')+'">&#x1F527; Maintenance ('+(mlist.filter(function(x){return x.status!=='Resolved';}).length)+' active)</button>';
  html += '<div style="width:1px;background:var(--border)"></div>';
  var cActive = issuesTab==='complaints';
  html += '<button onclick="issuesTab=\'complaints\';renderPage(\'issues\')" style="flex:1;padding:11px;border:none;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;background:'+(cActive?'var(--gold-dim)':'var(--bg3)')+';color:'+(cActive?'var(--gold2)':'var(--text2)')+'">&#x1F4AC; Complaints ('+(clist.filter(function(x){return x.status!=='Resolved';}).length)+' open)</button>';
  html += '</div>';

  if(issuesTab==='maintenance') {
    if(mlist.length===0) {
      html += '<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px;margin-bottom:12px">&#x1F527;</div><div style="font-size:15px">No maintenance requests yet</div><button class="btn btn-primary" style="margin-top:14px" onclick="showAddIssueModal()">+ Add Request</button></div>';
    } else {
      var sList = mlist.slice().reverse();
      for(var i=0;i<sList.length;i++) {
        var m = sList[i];
        var room = DB.rooms.find(function(r){return r.id===m.roomId;});
        var sc = m.status==='Open'?'var(--red)':m.status==='InProgress'?'var(--amber)':'var(--green)';
        var pc = m.priority==='High'?'var(--red)':m.priority==='Low'?'var(--teal)':'var(--amber)';
        html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:10px;display:flex;align-items:flex-start;gap:14px">';
        html += '<div style="width:40px;height:40px;border-radius:9px;background:'+sc+'22;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">&#x1F527;</div>';
        html += '<div style="flex:1;min-width:0">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">';
        html += '<span style="font-weight:700;font-size:14px">'+escHtml(m.title)+'</span>';
        html += '<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:'+sc+'22;color:'+sc+'">'+m.status+'</span>';
        html += '<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:'+pc+'22;color:'+pc+'">'+((m.priority||'Medium')+' Priority')+'</span>';
        html += '</div>';
        html += '<div style="font-size:12px;color:var(--text2);margin-bottom:4px">'+escHtml(m.description||'')+'</div>';
        html += '<div style="font-size:11px;color:var(--text3)">Room '+(room?room.number:'N/A')+' &nbsp;·&nbsp; '+fmtDate(m.date)+(m.resolvedDate?' &nbsp;·&nbsp; &#x2705; '+fmtDate(m.resolvedDate):'')+'</div>';
        html += '</div>';
        html += '<div style="display:flex;gap:4px;flex-shrink:0">';
        if(m.status!=='Resolved') html += '<button class="btn btn-sm" style="background:var(--green-dim);color:var(--green);border:1px solid rgba(46,201,138,0.3)" onclick="resolveMaint(\''+m.id+'\')"><span class=\"micon\" style=\"font-size:14px\">check_circle</span></button>';
        if(m.status==='Open') html += '<button class="btn btn-sm" style="background:var(--amber-dim);color:var(--amber);border:1px solid rgba(240,160,48,0.3)" onclick="progressMaint(\''+m.id+'\')">&#x23F3;</button>';
        html += '<button class="btn btn-sm btn-danger" onclick="delMaint(\''+m.id+'\')"><span class=\"micon\" style=\"font-size:14px\">delete</span></button>';
        html += '</div></div>';
      }
    }
  } else {
    if(clist.length===0) {
      html += '<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px;margin-bottom:12px">&#x1F4AC;</div><div>No complaints yet</div><button class="btn btn-primary" style="margin-top:14px" onclick="showAddIssueModal()">+ Add Complaint</button></div>';
    } else {
      var csl = clist.slice().reverse();
      for(var j=0;j<csl.length;j++) {
        var cc = csl[j];
        var student = DB.students.find(function(s){return s.id===cc.studentId;});
        var csc = cc.status==='Open'?'var(--red)':cc.status==='UnderReview'?'var(--amber)':'var(--green)';
        html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:10px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">';
        html += '<div><div style="font-weight:700;font-size:14px;margin-bottom:3px">'+escHtml(cc.subject)+'</div><div style="font-size:11px;color:var(--text3)">By: '+(student?escHtml(student.name):'Unknown')+' &nbsp;·&nbsp; '+fmtDate(cc.date)+'</div></div>';
        html += '<div style="display:flex;gap:6px;align-items:center">';
        html += '<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:'+csc+'22;color:'+csc+'">'+((cc.status==='UnderReview'?'Under Review':cc.status))+'</span>';
        if(cc.status!=='Resolved') html += '<button class="btn btn-sm" style="background:var(--green-dim);color:var(--green)" onclick="resolveComp(\''+cc.id+'\')">Resolve</button>';
        html += '<button class="btn btn-sm btn-danger" onclick="delComp(\''+cc.id+'\')"><span class=\"micon\" style=\"font-size:14px\">delete</span></button>';
        html += '</div></div>';
        html += '<div style="font-size:13px;color:var(--text2);background:var(--bg3);border-radius:8px;padding:10px">'+escHtml(cc.description||'')+'</div>';
        if(cc.response) html += '<div style="font-size:12px;color:var(--teal);background:var(--teal-dim);border-radius:8px;padding:8px;margin-top:6px">Response: '+escHtml(cc.response)+'</div>';
        html += '</div>';
      }
    }
  }
  return html;
}

function showAddIssueModal() {
  var rooms = DB.rooms.map(function(r){return '<option value="'+r.id+'">Room '+r.number+'</option>';}).join('');
  var students = DB.students.filter(function(s){return s.status==='Active';}).map(function(s){return '<option value="'+s.id+'">'+escHtml(s.name)+'</option>';}).join('');
  showModal('modal-md','Add Complaint / Maintenance',
    '<div style="display:flex;gap:8px;margin-bottom:18px">'+
    '<button type="button" id="ib-maint" onclick="document.getElementById(\'if-maint\').style.display=\'block\';document.getElementById(\'if-comp\').style.display=\'none\';this.style.background=\'var(--gold-dim)\';this.style.color=\'var(--gold2)\';document.getElementById(\'ib-comp\').style.background=\'var(--bg3)\';document.getElementById(\'ib-comp\').style.color=\'var(--text2)\'" class="btn" style="flex:1;background:var(--gold-dim);color:var(--gold2);">&#x1F527; Maintenance</button>'+
    '<button type="button" id="ib-comp" onclick="document.getElementById(\'if-comp\').style.display=\'block\';document.getElementById(\'if-maint\').style.display=\'none\';this.style.background=\'var(--gold-dim)\';this.style.color=\'var(--gold2)\';document.getElementById(\'ib-maint\').style.background=\'var(--bg3)\';document.getElementById(\'ib-maint\').style.color=\'var(--text2)\'" class="btn btn-secondary" style="flex:1">&#x1F4AC; Complaint</button>'+
    '</div>'+
    '<div id="if-maint"><div class="form-grid">'+
    '<div class="field col-full"><label>Issue Title *</label><input id="mt-title" class="form-control" placeholder="e.g. Broken fan, Leaking pipe"></div>'+
    '<div class="field"><label>Room</label><select id="mt-room" class="form-control"><option value="">Select Room</option>'+rooms+'</select></div>'+
    '<div class="field"><label>Priority</label><select id="mt-priority" class="form-control"><option>High</option><option selected>Medium</option><option>Low</option></select></div>'+
    '<div class="field"><label>Date</label><input id="mt-date" class="form-control cdp-trigger" type="text" readonly onclick="showCustomDatePicker(this,event)" value="'+today()+'"></div>'+
    '<div class="field col-full"><label>Description</label><textarea id="mt-desc" class="form-control" placeholder="Describe the issue..."></textarea></div>'+
    '</div></div>'+
    '<div id="if-comp" style="display:none"><div class="form-grid">'+
    '<div class="field col-full"><label>Student</label><select id="cp-student" class="form-control"><option value="">Select Student</option>'+students+'</select></div>'+
    '<div class="field col-full"><label>Subject *</label><input id="cp-subject" class="form-control" placeholder="Brief subject"></div>'+
    '<div class="field"><label>Date</label><input id="cp-date" class="form-control cdp-trigger" type="text" readonly onclick="showCustomDatePicker(this,event)" value="'+today()+'"></div>'+
    '<div class="field col-full"><label>Description</label><textarea id="cp-desc" class="form-control" placeholder="Describe the complaint..."></textarea></div>'+
    '</div></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveIssue()">Submit</button>'
  );
}

function saveIssue() {
  var isComp = document.getElementById('if-comp') && document.getElementById('if-comp').style.display!=='none';
  if(!isComp) {
    var title = (document.getElementById('mt-title')||{}).value||''; title=title.trim();
    if(!title){toast('Enter a title','error');return;}
    if(!DB.maintenance) DB.maintenance=[];
    logActivity('Maintenance Added',title,'Maintenance');
    DB.maintenance.push({id:'mt_'+uid(),title:title,roomId:(document.getElementById('mt-room')||{}).value||'',
      priority:(document.getElementById('mt-priority')||{}).value||'Medium',
      description:((document.getElementById('mt-desc')||{}).value||'').trim(),
      date:(document.getElementById('mt-date')||{}).value||today(),status:'Open',resolvedDate:''});
    issuesTab='maintenance';
  } else {
    var subj = (document.getElementById('cp-subject')||{}).value||''; subj=subj.trim();
    if(!subj){toast('Enter a subject','error');return;}
    if(!DB.complaints) DB.complaints=[];
    DB.complaints.push({id:'cp_'+uid(),subject:subj,
      studentId:(document.getElementById('cp-student')||{}).value||'',
      description:((document.getElementById('cp-desc')||{}).value||'').trim(),
      date:(document.getElementById('cp-date')||{}).value||today(),status:'Open',response:''});
    issuesTab='complaints';
  }
  await saveDB(); closeModal(); renderPage('issues'); toast('Saved','success');
}

async function resolveMaint(id){var m=DB.maintenance.find(function(x){return x.id===id;});if(m){m.status='Resolved';m.resolvedDate=today();await saveDB();renderPage('issues');toast('Resolved','success');}}
async function progressMaint(id){var m=DB.maintenance.find(function(x){return x.id===id;});if(m){m.status='InProgress';await saveDB();renderPage('issues');toast('In Progress','info');}}
async function delMaint(id){showConfirm('Delete?','',function(){DB.maintenance=DB.maintenance.filter(function(x){return x.id!==id;});await saveDB();renderPage('issues');toast('Deleted','info');});}
async function resolveComp(id) {
  // FIX #7: Replace blocking native prompt() with an in-app modal dialog
  var cc = DB.complaints.find(function(x){return x.id===id;}); if(!cc) return;
  showModal('modal-sm', '✅ Resolve Complaint',
    '<div class="field"><label>Optional Response</label>' +
    '<textarea id="comp-resolve-text" class="form-control" rows="3" placeholder="Enter a response or leave blank…"></textarea></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-success" onclick="(function(){' +
      'var cc=DB.complaints.find(function(x){return x.id===\''+id+'\';});' +
      'if(cc){cc.status=\'Resolved\';cc.response=(document.getElementById(\'comp-resolve-text\')||{}).value||\'\';}' +
      'await saveDB();closeModal();renderPage(\'issues\');toast(\'Complaint resolved\',\'success\');' +
    '})()">Mark Resolved</button>'
  );
}
async function delComp(id){showConfirm('Delete?','',function(){DB.complaints=DB.complaints.filter(function(x){return x.id!==id;});await saveDB();renderPage('issues');toast('Deleted','info');});}

// Keep original function names as aliases so dashboard alerts still work
function resolveMaintenance(id){resolveMaint(id);}
function progressMaintenance(id){progressMaint(id);}
function deleteMaintenance(id){delMaint(id);}
function resolveComplaint(id){resolveComp(id);}
function deleteComplaint(id){delComp(id);}
function showAddMaintenanceModal(){issuesTab='maintenance';showAddIssueModal();}
function showAddComplaintModal(){issuesTab='complaints';showAddIssueModal();}


// ══════════════════════════════════════════════════════════════════
// RECEIPT GENERATOR
// ══════════════════════════════════════════════════════════════════
// printReceipt() — moved to src/receipt.js

// doPrintReceipt() — moved to src/receipt.js

// sendWA() — moved to src/receipt.js

// ── Fix #8: Patch window.open so receipt windows never show LICENSE INFO ──────
// This intercepts any popup opened by printReceipt/doPrintReceipt in receipt.js
// and strips the "SOFTWARE LICENSE INFO" block before the user sees it.
(function _patchReceiptLicenseStrip() {
  const _origOpen = window.open.bind(window);
  window.open = function(url, target, features) {
    const w = _origOpen(url, target, features);
    if (!w) return w;
    // Patch document.write on the new window to strip license sections
    const _origWrite = w.document.write.bind(w.document);
    w.document.write = function(html) {
      if (typeof html === 'string') {
        // Remove any block containing "SOFTWARE LICENSE INFO" or license key patterns
        html = html.replace(/[\s\S]*?SOFTWARE\s+LICENSE\s+INFO[\s\S]*?(?=<(?:div|table|tr|section|footer)|$)/gi, '');
        // Remove license key rows with HOSTEL- prefix pattern
        html = html.replace(/<tr[^>]*>[\s\S]*?H[O0]STEL[-_][\w-]+[\s\S]*?<\/tr>/gi, '');
        // Remove "Machine:" rows
        html = html.replace(/<tr[^>]*>[\s\S]*?Machine\s*:[\s\S]*?<\/tr>/gi, '');
        // Remove "Valid Until" rows that appear in license section (not in student info)
        html = html.replace(/<tr[^>]*>[\s\S]*?Valid\s+Until[\s\S]*?<\/tr>/gi, function(m) {
          // Keep if it looks like a student/payment row, remove if it's license-related
          if (m.includes('May-') || m.includes('2026') || m.includes('2027')) return '';
          return m;
        });
        // Strip any <div> block that contains "SOFTWARE LICENSE" text
        html = html.replace(/<div[^>]*>(?:[^<]|<(?!\/div>))*?SOFTWARE LICENSE[^<]*<\/div>/gi, '');
      }
      return _origWrite(html);
    };
    return w;
  };
})();
// ─────────────────────────────────────────────────────────────────────────────


// ── SETTINGS DROPDOWN ────────────────────────────────────────────────────────