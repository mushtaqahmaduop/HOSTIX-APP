/* ─── HOSTYLLO — ISSUES (Maintenance & Complaints) MODULE ────────────────────
   Contains: renderIssues, showAddIssueModal, saveIssue (wrapper),
             resolveMaintenance, progressMaintenance, deleteMaintenance,
             resolveComplaint, deleteComplaint,
             showAddMaintenanceModal, showAddComplaintModal
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── Issues v5 — toolbar state ───────────────────────────────────────────────
   `issuesTab` (app.js) still decides which kind is shown, because nav.js sets
   it from the /maintenance and /complaints routes. It now also accepts 'all',
   which is the unified feed the reference design shows. */
let issueFilter = { search:'', status:'All', priority:'All', room:'All',
                    sort:'newest', page:1, pageSize:30 };

/* Display reference. Maintenance is MA-####, complaints CO-####, matching the
   reference. New records carry a persistent `seq`; anything created before
   that falls back to its position within its own collection. */
function _issSeq(it) {
  const pre  = it.kind === 'maintenance' ? 'MA' : 'CO';
  const coll = it.kind === 'maintenance' ? (DB.maintenance||[]) : (DB.complaints||[]);
  const n    = it.raw.seq || (coll.indexOf(it.raw) + 1);
  return pre + '-' + String(n).padStart(4, '0');
}
function _issNextSeq(coll) {
  return (coll || []).reduce((m, x) => Math.max(m, Number(x.seq) || 0), 0) + 1;
}

/* Both collections normalised onto one shape so the feed, the filters and the
   counters all read from a single list instead of two parallel branches. */
function _issAll() {
  const rooms = DB.rooms || [];
  const m = (DB.maintenance||[]).map(x => {
    const room = rooms.find(r => r.id === x.roomId);
    return { kind:'maintenance', raw:x, id:x.id, title:x.title||'',
             desc:x.description||'', date:x.date||'', resolved:x.resolvedDate||'',
             status:x.status||'Open', priority:x.priority||'Medium',
             roomNo: room ? String(room.number) : '', by:'', response:'' };
  });
  const c = (DB.complaints||[]).map(x => {
    const s = (DB.students||[]).find(t => t.id === x.studentId);
    return { kind:'complaint', raw:x, id:x.id, title:x.subject||'',
             desc:x.description||'', date:x.date||'', resolved:x.resolvedDate||'',
             status:x.status||'Open', priority:'',
             roomNo:'', by: s ? s.name : '', response:x.response||'' };
  });
  return m.concat(c);
}

// Open / working / done, collapsed across both collections. 'UnderReview' is a
// complaint being worked on, which is the same state as maintenance
// 'InProgress' — the reference shows one "In Progress" counter for both.
function _issBucket(st) {
  if (st === 'Resolved') return 'resolved';
  if (st === 'InProgress' || st === 'UnderReview') return 'progress';
  return 'open';
}
function _issStatusLabel(st) {
  return st === 'InProgress' ? 'In Progress' : st === 'UnderReview' ? 'Under Review' : st;
}

function renderIssues() {
  const all = _issAll();
  const nOpen = all.filter(i=>_issBucket(i.status)==='open').length;
  const nProg = all.filter(i=>_issBucket(i.status)==='progress').length;
  const nDone = all.filter(i=>_issBucket(i.status)==='resolved').length;

  const mActive = (DB.maintenance||[]).filter(x=>x.status!=='Resolved').length;
  const cOpen   = (DB.complaints||[]).filter(x=>x.status!=='Resolved').length;

  const tab = (issuesTab==='maintenance'||issuesTab==='complaints') ? issuesTab : 'all';
  // The tab is named for the collection ('complaints'); a row's kind is named
  // for the record ('complaint'). Comparing the two directly matched nothing
  // and emptied the complaints tab.
  const wantKind = tab==='complaints' ? 'complaint' : tab==='maintenance' ? 'maintenance' : null;
  const q   = issueFilter.search.trim().toLowerCase();

  let feed = all.filter(i => {
    if (wantKind && i.kind !== wantKind) return false;
    if (issueFilter.status   !== 'All' && _issBucket(i.status) !== issueFilter.status) return false;
    if (issueFilter.priority !== 'All' && i.priority !== issueFilter.priority) return false;
    if (issueFilter.room     !== 'All' && i.roomNo !== issueFilter.room) return false;
    if (!q) return true;
    return [i.title, i.desc, i.roomNo, i.by, _issStatusLabel(i.status), _issSeq(i)]
      .some(v => String(v||'').toLowerCase().includes(q));
  });

  const prank = { High:0, Medium:1, Low:2, '':3 };
  feed.sort((a,b) => issueFilter.sort==='oldest' ? String(a.date).localeCompare(String(b.date))
                   : issueFilter.sort==='priority' ? (prank[a.priority]??3)-(prank[b.priority]??3)
                   : String(b.date).localeCompare(String(a.date)));

  const _pg = paginate(feed, issueFilter);
  const roomNums = [...new Set(all.map(i=>i.roomNo).filter(Boolean))].sort(cmpRoomNo);
  const nActive  = [issueFilter.status!=='All', issueFilter.priority!=='All',
                    issueFilter.room!=='All', !!q].filter(Boolean).length;

  const SH = { open:'dh-red', progress:'dh-amber', resolved:'dh-green' };
  const PH = { High:'dh-red', Medium:'dh-amber', Low:'dh-blue' };
  const KIND = {
    maintenance: { hue:'dh-violet', label:'Maintenance',
      svg:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
    complaint:   { hue:'dh-blue', label:'Complaint',
      svg:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>' }
  };

  const card = (key, hue, label, sub, value, svg) => `
    <div class="lk-stat lk-stat--click ${hue}${issueFilter.status===key?' is-on':''}" onclick="issSet('status','${issueFilter.status===key?'All':key}')" title="Show ${label.toLowerCase()} issues">
      <div class="lk-stat__top">
        <div class="lk-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></div>
        <div class="lk-stat__label">${label}</div>
      </div>
      <div class="lk-stat__val">${value}</div>
      <div class="lk-stat__sub">${issueFilter.status===key?'Showing these':sub}</div>
    </div>`;

  const mkRow = (i) => {
    const k  = KIND[i.kind];
    const bk = _issBucket(i.status);
    return `<div class="iss-row">
      <div class="iss-row__i ${SH[bk]}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${k.svg}</svg>
      </div>
      <div class="iss-row__m">
        <div class="iss-row__top">
          <span class="iss-row__t">${escHtml(i.title||'Untitled')}</span>
          <span class="iss-pill ${SH[bk]}">${escHtml(_issStatusLabel(i.status))}</span>
          ${i.priority?`<span class="iss-pill ${PH[i.priority]||'dh-amber'}">${escHtml(i.priority)} Priority</span>`:''}
        </div>
        <div class="iss-row__meta">
          ${i.roomNo?`<b>Room ${escHtml(i.roomNo)}</b><i>•</i>`:''}
          <span>${fmtDate(i.date)}</span>
          ${i.resolved?`<i>•</i><span>Resolved on ${fmtDate(i.resolved)}</span>`:''}
          ${i.by?`<i>•</i><span>By <b>${escHtml(i.by)}</b></span>`:''}
        </div>
        ${i.desc?`<div class="iss-row__d">${escHtml(i.desc)}</div>`:''}
        ${i.response?`<div class="iss-row__r dh-green"><b>Response:</b> ${escHtml(i.response)}</div>`:''}
      </div>
      <div class="iss-row__e">
        <div class="iss-row__acts">
          <span class="lk-chip ${k.hue}">${escHtml(k.label)}</span>
          ${i.status!=='Resolved'?`<button class="lk-act lk-act--icon lk-act--hue dh-green" onclick="${i.kind==='maintenance'?`resolveMaint('${i.id}')`:`resolveComp('${i.id}')`}" title="Mark resolved">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></button>`:''}
          ${i.kind==='maintenance'&&i.status==='Open'?`<button class="lk-act lk-act--icon lk-act--hue dh-amber" onclick="progressMaint('${i.id}')" title="Mark in progress">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg></button>`:''}
          <button class="lk-act lk-act--icon lk-act--hue dh-red" onclick="${i.kind==='maintenance'?`delMaint('${i.id}')`:`delComp('${i.id}')`}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
        </div>
        <div class="iss-row__id">Issue ID: <b>${_issSeq(i)}</b></div>
      </div>
    </div>`;
  };

  return `
  <!-- ══ STAT STRIP ══ -->
  <div class="lk-stats">
    ${card('open','dh-red','Open','Needs attention',nOpen,'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>')}
    ${card('progress','dh-amber','In Progress','Being worked on',nProg,'<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>')}
    ${card('resolved','dh-green','Resolved','Completed',nDone,'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>')}
    <div class="lk-stat dh-violet" title="Every complaint and maintenance request on record">
      <div class="lk-stat__top">
        <div class="lk-stat__chip"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg></div>
        <div class="lk-stat__label">Total</div>
      </div>
      <div class="lk-stat__val">${all.length}</div>
      <div class="lk-stat__sub">All issues on record</div>
    </div>
  </div>

  <!-- ══ TABS ══ -->
  <div class="iss-tabs">
    <button class="iss-tab${tab==='all'?' is-on':''}" onclick="issSetTab('all')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
      All Issues (${all.length})
    </button>
    <button class="iss-tab${tab==='maintenance'?' is-on':''}" onclick="issSetTab('maintenance')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${KIND.maintenance.svg}</svg>
      Maintenance (${mActive} active)
    </button>
    <button class="iss-tab${tab==='complaints'?' is-on':''}" onclick="issSetTab('complaints')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${KIND.complaint.svg}</svg>
      Complaints (${cOpen} open)
    </button>
  </div>

  <!-- ══ TOOLBAR + FEED ══ -->
  <div class="lk-panel">
    <div class="lk-tools">
      <div class="lk-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
        <input id="iss-search" placeholder="Search issues, rooms, reporters, issue ID…"
               value="${escHtml(issueFilter.search)}" oninput="issSearch(this.value)">
      </div>

      <select class="lk-select${issueFilter.status!=='All'?' is-set':''}" onchange="issSet('status',this.value)" title="Filter by status">
        <option value="All">All Status</option>
        <option value="open"     ${issueFilter.status==='open'?'selected':''}>Open</option>
        <option value="progress" ${issueFilter.status==='progress'?'selected':''}>In Progress</option>
        <option value="resolved" ${issueFilter.status==='resolved'?'selected':''}>Resolved</option>
      </select>

      ${tab!=='complaints'?`
      <select class="lk-select${issueFilter.priority!=='All'?' is-set':''}" onchange="issSet('priority',this.value)" title="Filter by priority — maintenance only">
        <option value="All">All Priority</option>
        ${['High','Medium','Low'].map(p=>`<option value="${p}" ${issueFilter.priority===p?'selected':''}>${p}</option>`).join('')}
      </select>`:''}

      ${roomNums.length?`
      <select class="lk-select${issueFilter.room!=='All'?' is-set':''}" onchange="issSet('room',this.value)" title="Filter by room">
        <option value="All">All Rooms</option>
        ${roomNums.map(r=>`<option value="${escHtml(r)}" ${issueFilter.room===r?'selected':''}>Room ${escHtml(r)}</option>`).join('')}
      </select>`:''}

      <div class="lk-tools__end">
        ${nActive?`<button class="lk-btn lk-btn--on" onclick="issClearFilters()" title="Clear the toolbar filters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          Clear<span class="lk-btn__count">${nActive}</span></button>`:''}
        <select class="lk-select" onchange="issSet('sort',this.value)" title="Sort the feed">
          <option value="newest"   ${issueFilter.sort==='newest'?'selected':''}>Newest First</option>
          <option value="oldest"   ${issueFilter.sort==='oldest'?'selected':''}>Oldest First</option>
          <option value="priority" ${issueFilter.sort==='priority'?'selected':''}>Priority</option>
        </select>
        <button class="lk-btn lk-btn--go" onclick="showAddIssueModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Add Issue</button>
      </div>
    </div>

    ${_pg.total===0?`
      <div class="lk-empty">
        <div class="lk-empty__i"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${KIND.maintenance.svg}</svg></div>
        <div class="lk-empty__t">${all.length===0?'No issues logged yet':nActive?'Nothing matches those filters':'Nothing here'}</div>
        <div class="lk-empty__s">${all.length===0?'Complaints and maintenance requests will appear here.':nActive?'Try clearing a filter or widening the search.':'This tab has no records.'}</div>
        ${all.length===0
          ? `<button class="lk-btn lk-btn--go" onclick="showAddIssueModal()">+ Add Issue</button>`
          : nActive?`<button class="lk-btn" onclick="issClearFilters()">Clear filters</button>`:''}
      </div>`
    : `<div class="iss-list">${_pg.slice.map(mkRow).join('')}</div>
       ${issPager(_pg)}`}
  </div>`;
}

/* ── Issues v5 — toolbar behaviour ───────────────────────────────────────── */
function issSet(key, val) { issueFilter[key] = val; issueFilter.page = 1; renderPage('issues'); }
const issSearch = debounce(function (v) { issSet('search', v); }, 220);
function issSetTab(t) {
  issuesTab = t;
  // Priority only exists on maintenance — leaving a stale one set would silently
  // empty the complaints tab with no visible control to undo it.
  if (t === 'complaints') issueFilter.priority = 'All';
  issueFilter.page = 1;
  renderPage('issues');
}
function issClearFilters() {
  issueFilter.search = ''; issueFilter.status = 'All';
  issueFilter.priority = 'All'; issueFilter.room = 'All';
  issSet('page', 1);
}
function issPager(pg) {
  const btn = (label, target, o) => {
    o = o || {};
    if (o.disabled) return `<button disabled>${label}</button>`;
    if (o.active)   return `<button class="is-on">${label}</button>`;
    return `<button onclick="gotoPage(issueFilter,'issues',${target})">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1) + (lo>2?'<span class="lk-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page});
  if (hi < pages) nums += (hi<pages-1?'<span class="lk-pager__gap">…</span>':'') + btn(String(pages), pages);

  return `<div class="lk-foot">
    <div class="lk-foot__size">
      Show
      <select onchange="issueFilter.pageSize=Number(this.value);issueFilter.page=1;renderPage('issues')">
        ${[10,30,50,100].map(n=>`<option value="${n}" ${issueFilter.pageSize===n?'selected':''}>${n}</option>`).join('')}
      </select>
      entries
    </div>
    <div class="lk-foot__info">Showing ${pg.from} to ${pg.to} of ${pg.total} issue${pg.total!==1?'s':''}</div>
    <div class="lk-pager">
      ${btn('«',1,{disabled:page<=1})}
      ${btn('‹',page-1,{disabled:page<=1})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages})}
      ${btn('»',pages,{disabled:page>=pages})}
    </div>
  </div>`;
}

function showAddIssueModal() {
  var rooms = roomsByNumber(DB.rooms).map(function(r){return '<option value="'+r.id+'">Room '+r.number+'</option>';}).join('');
  var students = studentsByRoom(DB.students.filter(function(s){return s.status==='Active';})).map(function(s){return '<option value="'+s.id+'">'+escHtml(s.name)+'</option>';}).join('');
  showModal('modal-md','Add Complaint / Maintenance',
    '<div style="display:flex;gap:8px;margin-bottom:18px">'+
    '<button type="button" id="ib-maint" onclick="document.getElementById(\'if-maint\').style.display=\'block\';document.getElementById(\'if-comp\').style.display=\'none\';this.style.background=\'var(--accent-dim)\';this.style.color=\'var(--accent-strong)\';document.getElementById(\'ib-comp\').style.background=\'var(--bg3)\';document.getElementById(\'ib-comp\').style.color=\'var(--text2)\'" class="btn" style="flex:1;background:var(--accent-dim);color:var(--accent-strong);">&#x1F527; Maintenance</button>'+
    '<button type="button" id="ib-comp" onclick="document.getElementById(\'if-comp\').style.display=\'block\';document.getElementById(\'if-maint\').style.display=\'none\';this.style.background=\'var(--accent-dim)\';this.style.color=\'var(--accent-strong)\';document.getElementById(\'ib-maint\').style.background=\'var(--bg3)\';document.getElementById(\'ib-maint\').style.color=\'var(--text2)\'" class="btn btn-secondary" style="flex:1">&#x1F4AC; Complaint</button>'+
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

async function saveIssue() {
  var isComp = document.getElementById('if-comp') && document.getElementById('if-comp').style.display!=='none';
  if(!isComp) {
    var title = (document.getElementById('mt-title')||{}).value||''; title=title.trim();
    if(!title){toast('Enter a title','error');return;}
    if(!DB.maintenance) DB.maintenance=[];
    logActivity('Maintenance Added',title,'Maintenance');
    DB.maintenance.push({id:'mt_'+uid(),seq:_issNextSeq(DB.maintenance),title:title,roomId:(document.getElementById('mt-room')||{}).value||'',
      priority:(document.getElementById('mt-priority')||{}).value||'Medium',
      description:((document.getElementById('mt-desc')||{}).value||'').trim(),
      date:(document.getElementById('mt-date')||{}).value||today(),status:'Open',resolvedDate:''});
    issuesTab='maintenance';
  } else {
    var subj = (document.getElementById('cp-subject')||{}).value||''; subj=subj.trim();
    if(!subj){toast('Enter a subject','error');return;}
    if(!DB.complaints) DB.complaints=[];
    DB.complaints.push({id:'cp_'+uid(),seq:_issNextSeq(DB.complaints),subject:subj,resolvedDate:'',
      studentId:(document.getElementById('cp-student')||{}).value||'',
      description:((document.getElementById('cp-desc')||{}).value||'').trim(),
      date:(document.getElementById('cp-date')||{}).value||today(),status:'Open',response:''});
    issuesTab='complaints';
  }
  await saveDB(); closeModal(); renderPage('issues'); toast('Saved','success');
}

async function resolveMaint(id){var m=DB.maintenance.find(function(x){return x.id===id;});if(m){m.status='Resolved';m.resolvedDate=today();await saveDB();renderPage('issues');toast('Resolved','success');}}
async function progressMaint(id){var m=DB.maintenance.find(function(x){return x.id===id;});if(m){m.status='InProgress';await saveDB();renderPage('issues');toast('In Progress','info');}}
async function delMaint(id){showConfirm('Delete?','',async function(){DB.maintenance=DB.maintenance.filter(function(x){return x.id!==id;});await saveDB();renderPage('issues');toast('Deleted','info');});}
async function resolveComp(id) {
  // FIX #7: Replace blocking native prompt() with an in-app modal dialog
  var cc = DB.complaints.find(function(x){return x.id===id;}); if(!cc) return;
  showModal('modal-sm', '✅ Resolve Complaint',
    '<div class="field"><label>Optional Response</label>' +
    '<textarea id="comp-resolve-text" class="form-control" rows="3" placeholder="Enter a response or leave blank…"></textarea></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-success" onclick="(async function(){' +
      'var cc=DB.complaints.find(function(x){return x.id===\''+id+'\';});' +
      'if(cc){cc.status=\'Resolved\';cc.resolvedDate=today();cc.response=(document.getElementById(\'comp-resolve-text\')||{}).value||\'\';}' +
      'await saveDB();closeModal();renderPage(\'issues\');toast(\'Complaint resolved\',\'success\');' +
    '})()">Mark Resolved</button>'
  );
}
async function delComp(id){showConfirm('Delete?','',async function(){DB.complaints=DB.complaints.filter(function(x){return x.id!==id;});await saveDB();renderPage('issues');toast('Deleted','info');});}

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