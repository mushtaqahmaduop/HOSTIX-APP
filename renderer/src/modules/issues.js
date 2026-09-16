/* ─── HOSTYLLO — ISSUES (Maintenance & Complaints) MODULE ────────────────────
   Contains: renderIssues, showIssueModal, saveIssue,
             resolveMaintenance, progressMaintenance, deleteMaintenance,
             resolveComplaint, deleteComplaint,
             showAddMaintenanceModal, showAddComplaintModal

   REDESIGNED 2026-09-08 to the owner's references `complaints2.png` (the
   register) and `add complaaint and maintinanace.png` (both forms).

   The screen was a feed of cards; the reference is a REGISTER — one row per
   issue, one column per fact, sortable and scannable. That is the right shape:
   a warden's question here is "what is still open, and who has it", which a
   table answers by column and a card feed answers only by reading every card.

   FOUR FIELDS THE REFERENCE ASKS FOR THAT THIS APP DID NOT RECORD
   ---------------------------------------------------------------
   Category, priority-on-a-complaint, assigned staff, and the expected
   completion date. They are not invented into the table — they are now
   CAPTURED BY THE FORM, which is where the owner's own form reference puts
   them. A record written before today has them empty and the cell prints a
   dash, which is honest: nobody ever typed one. That is the distinction
   CLAUDE.md draws — do not invent a COLUMN for a field the app does not
   record; recording it first is the fix, not the violation.

   CATEGORIES ARE NEUTRAL, AND THE REFERENCE COLOURS THEM
   ------------------------------------------------------
   `complaints2.png` paints Plumbing blue, Electrical amber, Furniture violet
   and Network blue. CLAUDE.md's design rule says the opposite in as many
   words — hue is reserved for STATE, categories are neutral — and this screen
   is the strongest case for it: a red "Open" pill is the only thing on the row
   that means act now, and it stops meaning that when four other chips beside
   it are equally loud. So the category chip is neutral and carries a GLYPH
   instead; the icon is what separates Plumbing from Network at a glance.
   Priority keeps its hue, because priority is state.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── Issues v6 — toolbar state ───────────────────────────────────────────────
   `issuesTab` (app.js) still decides which kind is shown, because nav.js sets
   it from the /maintenance and /complaints routes. It also accepts 'all',
   which is the unified register the reference design shows. */
let issueFilter = { search:'', status:'All', priority:'All', category:'All',
                    month:thisMonth(), sort:'newest', page:1, pageSize:30 };

/* A fresh visit starts here — see FILTER_REGISTRY in nav.js.

   THE MONTH DEFAULTS TO THIS MONTH, as the owner asked for every month picker
   on 2026-09-08. Evaluated on each reset rather than captured at load, so a
   session left open past the turn of a month still opens on the month it now
   is.

   The cost is worth stating where the next reader will find it: an August
   complaint nobody answered is still open in September, and this default puts
   it one control away instead of on screen. The stat strip above the table is
   the mitigation — Open, In Progress and Resolved count the WHOLE register,
   not the month, so a warden looking at September still sees that three
   things are open and can widen to All months to find them. Raised with the
   owner; reversing it is `month:''` in both places here. */
registerFilter('issues', issueFilter, () => ({
  search:'', status:'All', priority:'All', category:'All',
  month:thisMonth(), sort:'newest', page:1,
}));

/* ── The category axis ───────────────────────────────────────────────────────
   Nine values, fixed rather than free text so the filter and the register can
   group by them. The first four are the reference's own; the rest are what a
   hostel actually logs. Each carries a glyph because the chip is neutral (see
   the header) and the glyph is doing the work colour does in the reference. */
const ISS_CATS = [
  { key:'Plumbing',    ico:'droplet'  },
  { key:'Electrical',  ico:'zap'      },
  { key:'Furniture',   ico:'armchair' },
  { key:'Network',     ico:'wifi'     },
  { key:'Appliance',   ico:'fan'      },
  { key:'Cleanliness', ico:'bath'     },
  { key:'Mess / Food', ico:'utensils' },
  { key:'Security',    ico:'shield'   },
  { key:'Other',       ico:'tag'      },
];
function _issCatIcon(k) {
  const c = ISS_CATS.find(x => x.key === k);
  return c ? icon(c.ico, 'xs') : icon('tag', 'xs');
}

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

/* Both collections normalised onto one shape so the register, the filters and
   the counters all read from a single list instead of two parallel branches. */
function _issAll() {
  const rooms  = DB.rooms || [];
  const roomNo = id => { const r = rooms.find(x => x.id === id); return r ? String(r.number) : ''; };

  const m = (DB.maintenance||[]).map(x => {
    /* RAISED BY A STUDENT (owner, 2026-09-14): `raisedById` links the resident
       who reported it, so the register shows them like a complaint's student.
       A ticket raised by staff keeps the typed name and no link. */
    const s = x.raisedById ? ((DB.students||[]).find(t => t.id === x.raisedById) || null) : null;
    return {
    kind:'maintenance', raw:x, id:x.id, title:x.title||'',
    desc:x.description||'', date:x.date||'', resolved:x.resolvedDate||'',
    status:x.status||'Open', priority:x.priority||'Medium',
    category:x.category||'', assigned:x.assignedTo||'',
    expected:x.expectedDate||'', location:x.location||'', cost:Number(x.cost)||0,
    /* `by` is who REPORTED it. It was hardcoded blank until 2026-09-10 because
       the maintenance form never asked — so every maintenance row printed an
       empty Student cell. Tickets written before the field existed still have
       nothing to show, and show nothing rather than a guess. */
    roomNo: roomNo(x.roomId), by: s ? s.name : (x.raisedBy||''), student: s, response:'',
    };
  });

  const c = (DB.complaints||[]).map(x => {
    const s = (DB.students||[]).find(t => t.id === x.studentId) || null;
    return { kind:'complaint', raw:x, id:x.id, title:x.subject||'',
      desc:x.description||'', date:x.date||'', resolved:x.resolvedDate||'',
      status:x.status||'Open', priority:x.priority||'',
      category:x.category||'', assigned:x.assignedTo||'',
      expected:x.expectedDate||'', location:'', cost:0,
      /* A complaint is filed BY a student, and its room is the room that
         student lives in — derived on read, never a second stored copy that
         drifts the first time somebody is moved. */
      roomNo: s ? roomNo(s.roomId) : '',
      by: s ? s.name : '', student: s, response:x.response||'' };
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

/* Whole days between two ISO dates, or null if either is missing or unparseable. */
function _issDays(from, to) {
  if (!from || !to) return null;
  const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/* ── THE ISSUE FEED EVERY READER SEES ────────────────────────────────────────
   Shared by the screen and by both exports. Maintenance and complaints are two
   collections normalised onto one shape by _issAll(); the tab, the toolbar
   filters and the sort all apply here so an exported register is the feed that
   was on screen (§44). */
function issuesFiltered() {
  const all = _issAll();
  const tab = (issuesTab === 'maintenance' || issuesTab === 'complaints') ? issuesTab : 'all';
  const wantKind = tab === 'complaints' ? 'complaint' : tab === 'maintenance' ? 'maintenance' : null;
  const q = (issueFilter.search || '').trim().toLowerCase();

  const feed = all.filter(i => {
    if (wantKind && i.kind !== wantKind) return false;
    if (issueFilter.status   !== 'All' && _issBucket(i.status) !== issueFilter.status) return false;
    if (issueFilter.priority !== 'All' && i.priority !== issueFilter.priority) return false;
    if (issueFilter.category !== 'All' && i.category !== issueFilter.category) return false;
    /* One month, or a whole year. Both are a string prefix of the ISO date, so
       '2026-09' and '2026' need no separate branch — the same trick the
       Cancellations month filter uses. This replaced a From/To range and a
       room dropdown on 2026-09-08 at the owner's request. */
    if (issueFilter.month && !String(i.date).startsWith(issueFilter.month)) return false;
    if (!q) return true;
    return [i.title, i.desc, i.roomNo, i.by, i.category, i.assigned,
            _issStatusLabel(i.status), _issSeq(i)]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const prank = { High: 0, Medium: 1, Low: 2, '': 3 };
  return feed.sort((a, b) =>
    issueFilter.sort === 'oldest'   ? String(a.date).localeCompare(String(b.date))
  : issueFilter.sort === 'priority' ? ((prank[a.priority] ?? 3) - (prank[b.priority] ?? 3))
  : String(b.date).localeCompare(String(a.date)));
}

/* ══ THE COMPLAINTS / MAINTENANCE EXPORT ═══════════════════════════════════
   §38. This screen had no export at all: a warden with a month of complaints
   to answer for could show an owner the screen or nothing.

   The two kinds are one register with a Kind column rather than two documents,
   because that is how the feed reads on screen and how the question is asked
   ("what is still open?"), and because a complaint and a broken geyser sit in
   the same weekly review.

   §38's category and assigned-staff columns ARE carried now. They were left
   out when this export was written because the app recorded neither; the form
   captures both since 2026-09-08, so the columns describe a field a warden
   actually filled in rather than a page of em dashes. Records written before
   that date export empty in those two columns, which is the truth about them.
   §41 still applies to everything else — a complaint carries only what the
   warden typed into it, and no internal field is exposed.                  */
function _issExportDef(list) {
  const open  = list.filter(i => _issBucket(i.status) === 'open').length;
  const prog  = list.filter(i => _issBucket(i.status) === 'progress').length;
  const done  = list.filter(i => _issBucket(i.status) === 'resolved').length;
  const high  = list.filter(i => i.priority === 'High').length;

  /* How long the resolved ones took, in days. A register of complaints with no
     sense of turnaround answers "what happened" but not "how are we doing". */
  const spans = list.map(i => _issDays(i.date, i.resolved)).filter(n => n !== null);
  const avg = spans.length ? Math.round(spans.reduce((s, n) => s + n, 0) / spans.length) : null;

  const tab = (issuesTab === 'maintenance' || issuesTab === 'complaints') ? issuesTab : 'all';

  return {
    module: tab === 'complaints' ? 'Complaints' : tab === 'maintenance' ? 'Maintenance' : 'Issues',
    title:  tab === 'complaints' ? 'Complaints Register'
          : tab === 'maintenance' ? 'Maintenance Register'
          : 'Complaints & Maintenance Register',
    scope: '',
    sheet: 'Issues',

    filters: [
      ['Kind',     tab === 'all' ? 'Complaints and maintenance' : _issExportKindLabel(tab)],
      ['Status',   issueFilter.status   !== 'All' ? _issExportBucketLabel(issueFilter.status) : null],
      ['Priority', issueFilter.priority !== 'All' ? issueFilter.priority : null],
      ['Category', issueFilter.category !== 'All' ? issueFilter.category : null],
      ['Month',    issueFilter.month ? tbMonthLabel(issueFilter.month) : null],
      ['Search',   issueFilter.search || null],
      ['Sorted',   issueFilter.sort === 'oldest' ? 'Oldest first'
                 : issueFilter.sort === 'priority' ? 'Priority' : 'Newest first'],
    ],

    summary: [
      { label: 'Records',      value: String(list.length) },
      { label: 'Open',         value: String(open), tone: open ? 'neg' : '' },
      { label: 'In progress',  value: String(prog), tone: prog ? 'warn' : '' },
      { label: 'Resolved',     value: String(done), tone: 'pos' },
      { label: 'High priority', value: String(high), tone: high ? 'neg' : '' },
      { label: 'Avg. to resolve', value: avg === null ? '—' : avg + ' day' + (avg === 1 ? '' : 's') },
    ],

    columns: [
      { label: 'Ref',  type: 'id',   width: 11, value: i => _issSeq(i) },
      { label: 'Kind', type: 'text', width: 14,
        value: i => i.kind === 'maintenance' ? 'Maintenance' : 'Complaint' },
      { label: 'Room', type: 'id', width: 9,
        value: i => i.roomNo || '',
        get:   i => i.roomNo ? '<b>#' + escHtml(i.roomNo) + '</b>' : '—' },
      { label: 'Raised by', type: 'text', width: 20, value: i => i.by || '' },
      { label: 'Subject', type: 'text', width: 26,
        value: i => i.title || '',
        get:   i => '<b>' + escHtml(i.title || '—') + '</b>' },
      { label: 'Category', type: 'text', width: 14, value: i => i.category || '' },
      { label: 'Description', type: 'wrap', width: 40, value: i => i.desc || '' },
      { label: 'Priority', type: 'status', width: 11, value: i => i.priority || '' },
      { label: 'Assigned to', type: 'text', width: 18, value: i => i.assigned || '' },
      { label: 'Raised',   type: 'date', width: 13, value: i => i.date || '' },
      { label: 'Status',   type: 'status', width: 13, value: i => _issStatusLabel(i.status) },
      { label: 'Resolved', type: 'date', width: 13, value: i => i.resolved || '' },
      { label: 'Days open', type: 'number', width: 11, pdf: false,
        value: i => _issDays(i.date, i.resolved) },
      { label: 'Resolution', type: 'wrap', width: 34, pdf: false, value: i => i.response || '' },
    ],

    rows: list,
    empty: 'No complaints or maintenance records match the selected filters.',
  };
}

function _issExportKindLabel(tab) {
  return tab === 'complaints' ? 'Complaints only' : 'Maintenance only';
}
function _issExportBucketLabel(b) {
  return b === 'open' ? 'Open' : b === 'progress' ? 'In progress' : 'Resolved';
}

function exportIssuesPDF() {
  const list = issuesFiltered();
  if (!list.length) { toast('Nothing to export', 'error'); return; }
  EXPORT.pdf(_issExportDef(list));
}

function exportIssuesExcel() {
  const list = issuesFiltered();
  if (!list.length) { toast('Nothing to export', 'error'); return; }
  EXPORT.excel(_issExportDef(list));
}

/* ══ THE REGISTER ══════════════════════════════════════════════════════════
   Ten columns. At the 1366 QA floor the content box is ~1060px and the table
   measures ~1190, so it scrolls horizontally inside `.lk-table-wrap` — the
   same resolution Payments took for the same reason, and the one §41 of the
   export spec allows below 1280. Nothing is hidden; the alternative was to
   drop a column, and every one of the ten answers a question a warden asks.
   It fits whole at 1440 and with the rail collapsed.                       */
function renderIssues() {
  const all = _issAll();
  const nOpen = all.filter(i=>_issBucket(i.status)==='open').length;
  const nProg = all.filter(i=>_issBucket(i.status)==='progress').length;
  const nDone = all.filter(i=>_issBucket(i.status)==='resolved').length;

  const mActive = (DB.maintenance||[]).filter(x=>x.status!=='Resolved').length;
  const cOpen   = (DB.complaints||[]).filter(x=>x.status!=='Resolved').length;

  const tab = (issuesTab==='maintenance'||issuesTab==='complaints') ? issuesTab : 'all';
  const q   = (issueFilter.search||'').trim().toLowerCase();

  // Shared with the exports, so the register and the document cannot disagree.
  const feed = issuesFiltered();

  const _pg = paginate(feed, issueFilter);
  const rooms    = DB.rooms || [];
  const nActive  = [issueFilter.status!=='All', issueFilter.priority!=='All',
                    issueFilter.category!=='All', !!issueFilter.month, !!q]
                   .filter(Boolean).length;

  const SH = { open:'ui-chip--danger', progress:'ui-chip--warning', resolved:'ui-chip--success' };
  /* Low was blue. Blue is the ACCENT in this system and the accent means "act",
     so a low-priority ticket was the most action-coloured thing on its row.
     Success, not neutral: neutral is what a CATEGORY chip wears, and a Low
     chip in the same grey would be indistinguishable from the Plumbing chip
     beside it — which is the invariant issues-register.spec.js protects.
     Green is the honest reading of low urgency anyway: nothing to chase. */
  const PH = { High:'ui-chip--danger', Medium:'ui-chip--warning', Low:'ui-chip--success' };
  /* No hue here. Which register a row belongs to is a CATEGORY — the same
     kind of fact as its category chip, and the header above argues at length
     that categories are neutral. The first pass gave Maintenance violet and
     Complaint blue anyway, which is the rule broken in the one file that
     states it. The glyph and the MA-/CO- prefix carry the distinction. */
  const KIND = {
    maintenance: { label:'Maintenance', ico:'tool' },
    complaint:   { label:'Complaint',   ico:'helpCircle' },
  };

  /* Each of the three sets the status filter, so each is a <button> that says
     whether it is the active one. The `hue` argument is gone with `.lk-stat`:
     red/amber/green per tile made the STRIP look like a status legend when the
     status is in the table, one column wide, on every row. */
  const card = (key, label, sub, value, ico) => `
    <button type="button" class="ui-card ui-stat ui-stat--click${issueFilter.status===key?' is-on':''}" onclick="issSet('status','${issueFilter.status===key?'All':key}')" title="Show ${label.toLowerCase()} issues" aria-pressed="${issueFilter.status===key?'true':'false'}">
      <span class="ui-stat__ico">${icon(ico,'sm')}</span>
      <span class="ui-stat__body">
        <span class="ui-stat__l">${label}</span>
        <span class="ui-stat__v">${value}</span>
        <span class="ui-stat__s">${issueFilter.status===key?'Showing these':sub}</span>
      </span>
    </button>`;

  /* One row of the register. Every cell is either a field the record holds or
     a dash — nothing here is computed to fill a column. */
  const mkRow = (i) => {
    const k  = KIND[i.kind];
    const bk = _issBucket(i.status);
    const rm = i.roomNo ? rooms.find(r => String(r.number) === i.roomNo) : null;
    const held = _issDays(i.date, today());
    const took = _issDays(i.date, i.resolved);

    /* Reported-on sub-line. Resolved records say how long they took; open ones
       say how long they have been waiting, which is the number that matters —
       and if a target date was set and has passed, that is what it says
       instead, in red, because an overdue ticket is the one thing on this
       screen a warden is answerable for. */
    const overdue = !i.resolved && i.expected && i.expected < today();
    const age = i.resolved
      ? (took === null ? '' : 'Closed in ' + took + 'd')
      : overdue ? 'Overdue ' + _issDays(i.expected, today()) + 'd'
      : i.expected ? 'Due ' + fmtDate(i.expected)
      : (held === null ? '' : held === 0 ? 'Today' : 'Open ' + held + 'd');

    return `<tr>
      <td class="iss-c-ref">
        <div class="iss-ref">${_issSeq(i)}</div>
        <div class="iss-kind" title="${escHtml(k.label)}">${icon(k.ico,'xs')}</div>
      </td>
      <td class="iss-c-title">
        <div class="iss-t">${escHtml(i.title||'Untitled')}</div>
        ${i.desc?`<div class="iss-d" title="${escHtml(i.desc)}">${escHtml(i.desc)}</div>`:''}
        ${i.location?`<div class="iss-d">${icon('pin','xs')} ${escHtml(i.location)}</div>`:''}
      </td>
      <td class="iss-c-by">
        ${i.student ? `<div class="iss-who">
            <span class="ui-avatar">${escHtml((i.by||'?').trim().charAt(0).toUpperCase()||'?')}</span>
            <div class="iss-who__b">
              <div class="iss-who__n">${escHtml(i.by)}</div>
              ${/* THE PHONE, NEVER THE CNIC (owner, 2026-09-14: "remove cnic
                    from complaints page"). A complaint needs a number a warden
                    can dial; the identity number is on the student's record. */''}
              <div class="iss-who__s">${escHtml(i.student.phone || '')}</div>
            </div>
          </div>`
        : i.by ? `${/* A maintenance ticket now records who reported it (owner,
                       2026-09-10), and that is often not a resident at all —
                       a warden, the cook, a contractor. So: the name, with no
                       contact sub-line, because there is no record behind it
                       to read one from. */''}
            <div class="iss-who">
              <span class="ui-avatar">${escHtml(i.by.trim().charAt(0).toUpperCase()||'?')}</span>
              <div class="iss-who__b"><div class="iss-who__n">${escHtml(i.by)}</div>
                <div class="iss-who__s">Reported by</div></div>
            </div>`
        : `<span class="iss-dash" title="Nobody was recorded as having reported this">—</span>`}
      </td>
      <td>
        ${i.roomNo ? roomLabel(i.roomNo, rm && rm.floor, true)
                   : '<span class="iss-dash">—</span>'}
      </td>
      ${''/* CATEGORY IS NEUTRAL. It is a kind of thing, not a state — the rule
             this file's own comment states and the first pass broke. Priority
             and status are states and keep their roles. */}
      <td>${i.category
            ? `<span class="ui-chip ui-chip--neutral">${_issCatIcon(i.category)}${escHtml(i.category)}</span>`
            : '<span class="iss-dash">—</span>'}</td>
      <td>${i.priority
            ? `<span class="ui-chip ${PH[i.priority]||'ui-chip--warning'}">${escHtml(i.priority)}</span>`
            : '<span class="iss-dash">—</span>'}</td>
      <td><span class="ui-chip ${SH[bk]}">${icon(bk==='resolved'?'check':bk==='progress'?'clock':'warning','xs')}${escHtml(_issStatusLabel(i.status))}</span></td>
      <td>
        <div class="iss-when">${icon('calendar','xs')}${fmtDate(i.date)}</div>
        ${age?`<div class="iss-sub${overdue?' iss-late':''}">${escHtml(age)}</div>`:''}
      </td>
      <td>${i.assigned
            ? `<div class="iss-asg">${icon('person','xs')}${escHtml(i.assigned)}</div>`
            : '<span class="iss-dash" title="Nobody has been assigned to this yet">—</span>'}</td>
      <td>
      ${''/* FOUR ICON BUTTONS, AND ONLY ONE OF THEM IS COLOURED. They were green,
             amber, plain and red — a row of traffic lights per row, which on a
             full page is forty coloured marks that all mean "you may press
             this". Delete keeps the danger INK because it is the one that
             cannot be undone, but not the fill: a filled red button once per
             row is forty red marks on a full page. It fills on hover. Each has an aria-label:
             a title alone is not an accessible name for an icon button. */}
        <div class="iss-acts">
          ${i.status!=='Resolved'?`<button class="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" onclick="${i.kind==='maintenance'?`resolveMaint('${i.id}')`:`resolveComp('${i.id}')`}" title="Mark resolved" aria-label="Mark resolved">${icon('check','xs')}</button>`:''}
          ${i.kind==='maintenance'&&i.status==='Open'?`<button class="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" onclick="progressMaint('${i.id}')" title="Mark in progress" aria-label="Mark in progress">${icon('clock','xs')}</button>`:''}
          <button class="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" onclick="showIssueModal('${i.id}')" title="Edit this issue" aria-label="Edit this issue">${icon('edit','xs')}</button>
          <button class="ui-btn ui-btn--ghost-danger ui-btn--icon ui-btn--sm" onclick="${i.kind==='maintenance'?`delMaint('${i.id}')`:`delComp('${i.id}')`}" title="Delete" aria-label="Delete this issue">${icon('trash','xs')}</button>
        </div>
      </td>
    </tr>`;
  };

  return `
  <!-- ══ STAT STRIP ══ -->
  <div class="ui-stats">
    ${card('open','Open','Needs attention',nOpen,'warning')}
    ${card('progress','In progress','Being worked on',nProg,'clock')}
    ${card('resolved','Resolved','Completed',nDone,'check')}
    ${''/* The fourth is a total, not a filter, so it stays a <div>. */}
    <div class="ui-card ui-stat" title="Every complaint and maintenance request on record">
      <span class="ui-stat__ico">${icon('list','sm')}</span>
      <span class="ui-stat__body">
        <span class="ui-stat__l">Total issues</span>
        <span class="ui-stat__v">${all.length}</span>
        <span class="ui-stat__s">All issues on record</span>
      </span>
    </div>
  </div>

  <!-- ══ TABS ══ -->
  ${''/* A tab is a <button role="tab"> in a <div role="tablist">, and which one
         is current is `aria-selected`, not a class. It was three buttons in a
         segmented box with `.is-on` filling the active one in the accent — a
         filled pill reads as a primary action, which a tab is not. */}
  <div class="ui-tabs iss-tabs" role="tablist" aria-label="Issue type">
    <button type="button" role="tab" class="ui-tab" aria-selected="${tab==='all'}" onclick="issSetTab('all')">
      ${icon('list','sm')} All issues (${all.length})
    </button>
    <button type="button" role="tab" class="ui-tab" aria-selected="${tab==='maintenance'}" onclick="issSetTab('maintenance')">
      ${icon('tool','sm')} Maintenance (${mActive} active)
    </button>
    <button type="button" role="tab" class="ui-tab" aria-selected="${tab==='complaints'}" onclick="issSetTab('complaints')">
      ${icon('helpCircle','sm')} Complaints (${cOpen} open)
    </button>
  </div>

  <!-- ══ TOOLBAR + REGISTER ══ -->
  <div class="ui-card ui-card--flush">
    <div class="iss-tools">
      <div class="ui-search">
        ${icon('search','xs')}
        <input id="iss-search" class="ui-search__i" aria-label="Search issues"
               placeholder="Search issues, rooms, students, staff, issue ID…"
               value="${escHtml(issueFilter.search)}" oninput="issSearch(this.value)">
        ${lkSearchX('iss-search','issueFilter','issues')}
      </div>

      <span class="ui-selectw"><select class="ui-select ui-select--sm${issueFilter.status!=='All'?' is-set':''}" aria-label="Status" onchange="issSet('status',this.value)" title="Filter by status">
        <option value="All">All statuses</option>
        <option value="open"     ${issueFilter.status==='open'?'selected':''}>Open</option>
        <option value="progress" ${issueFilter.status==='progress'?'selected':''}>In Progress</option>
        <option value="resolved" ${issueFilter.status==='resolved'?'selected':''}>Resolved</option>
      </select></span>

      <span class="ui-selectw"><select class="ui-select ui-select--sm${issueFilter.priority!=='All'?' is-set':''}" aria-label="Priority" onchange="issSet('priority',this.value)" title="Filter by priority">
        <option value="All">All priorities</option>
        ${['High','Medium','Low'].map(p=>`<option value="${p}" ${issueFilter.priority===p?'selected':''}>${p}</option>`).join('')}
      </select></span>

      <span class="ui-selectw"><select class="ui-select ui-select--sm${issueFilter.category!=='All'?' is-set':''}" aria-label="Category" onchange="issSet('category',this.value)" title="Filter by category">
        <option value="All">All categories</option>
        ${ISS_CATS.map(c=>`<option value="${escHtml(c.key)}" ${issueFilter.category===c.key?'selected':''}>${escHtml(c.key)}</option>`).join('')}
      </select></span>

      ${/* One month picker where a room dropdown and a From/To range used to
            be (owner, 2026-09-08). Month and year are one control: the list
            carries every month the register touches plus a whole-year entry
            per year, and both match as a string prefix. */''}
      ${tbMonth(all.map(i=>i.date), {
        value: issueFilter.month, all: true, aria: 'Month',
        onchange: "issSet('month',this.value)" })}

      <!-- No Add button here on purpose: the page header already carries one
           (nav.js, issues.action), and two accent-filled buttons doing the
           identical thing on one screen is the "one primary action" rule
           broken twice over. The empty state keeps its own, because there is
           no table under it to act on. -->
      <div class="iss-tools__end">
        <span class="ui-selectw"><select class="ui-select ui-select--sm" aria-label="Sort the register" onchange="issSet('sort',this.value)" title="Sort the register">
          <option value="newest"   ${issueFilter.sort==='newest'?'selected':''}>Newest first</option>
          <option value="oldest"   ${issueFilter.sort==='oldest'?'selected':''}>Oldest first</option>
          <option value="priority" ${issueFilter.sort==='priority'?'selected':''}>Priority</option>
        </select></span>
        ${tbExport({ id:'iss-export', cls:'ui-btn ui-btn--secondary ui-btn--sm', excel:'exportIssuesExcel()', pdf:'exportIssuesPDF()' })}
      </div>
    </div>

    ${_pg.total===0?`
      <div class="ui-empty">
        ${icon('tool')}
        <div class="ui-empty__t">${all.length===0?'No issues logged yet':nActive?'Nothing matches those filters':'Nothing here'}</div>
        <div>${all.length===0?'Complaints and maintenance requests will appear here.':nActive?'Try clearing a filter or widening the search.':'This tab has no records.'}</div>
        ${all.length===0
          /* NOT lk-btn--go. The page header's own Add Issue button is shown on
             permission, not on whether the register has rows, so on an empty
             database both are on screen at once — and an accent fill here makes
             that two primary actions, the rule this file already removed the
             toolbar's button for. The header keeps the accent; this one is the
             same action, stated again where the reader is looking. */
          ? `<button class="ui-btn ui-btn--secondary ui-btn--sm" onclick="showIssueModal()">${icon('plus','xs')} Add issue</button>`
          : nActive?`<button class="ui-btn ui-btn--secondary ui-btn--sm" onclick="tbClearAll('issues')">Clear all filters</button>`:''}
      </div>`
    : `<div class="ui-table-wrap iss-wrap">
        <table class="ui-table ui-table--dense iss-table">
          <thead><tr>
            ${''/* "Raised by", not "Student": the column has always held who
                   reported the record, and since 2026-09-10 a maintenance
                   ticket has one too — often a warden or a contractor rather
                   than a resident. */}
            <th>#</th><th>Issue</th><th>Raised by</th><th>Room</th><th>Category</th>
            <th>Priority</th><th>Status</th><th>Reported on</th><th>Assigned to</th><th>Actions</th>
          </tr></thead>
          <tbody>${_pg.slice.map(mkRow).join('')}</tbody>
        </table>
      </div>
      ${issPager(_pg)}`}
  </div>`;
}

/* ── Issues v6 — toolbar behaviour ───────────────────────────────────────── */
function issSet(key, val) { issueFilter[key] = val; issueFilter.page = 1; renderPage('issues'); }
const issSearch = debounce(function (v) { issSet('search', v); }, 220);
function issSetTab(t) {
  issuesTab = t;
  issueFilter.page = 1;
  renderPage('issues');
}
/* Kept as a name because older call sites use it; the registry is the one
   definition of what "cleared" means, so this cannot drift from the Clear
   button beside it. */
function issClearFilters() { tbClearAll('issues'); }
function issPager(pg) {
  const btn = (label, target, o) => {
    o = o || {};
    const C = 'ui-btn ui-btn--secondary ui-btn--sm';
    const aria = o.aria || label;
    if (o.disabled) return `<button class="${C}" disabled aria-label="${aria}">${label}</button>`;
    if (o.active)   return `<button class="${C} is-on" aria-current="page">${label}</button>`;
    return `<button class="${C}" onclick="gotoPage(issueFilter,'issues',${target})" aria-label="${aria}">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1,{aria:'Page 1'}) + (lo>2?'<span class="ui-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page, aria:'Page '+i});
  if (hi < pages) nums += (hi<pages-1?'<span class="ui-pager__gap">…</span>':'') + btn(String(pages), pages, {aria:'Page '+pages});

  return `<div class="ui-pagebar">
    <div class="ui-pagebar__info">Showing ${pg.from}–${pg.to} of ${pg.total} issue${pg.total!==1?'s':''}</div>
    <div class="iss-foot__size">
      <span>Rows per page</span>
      <span class="ui-selectw">
        <select class="ui-select ui-select--sm" aria-label="Rows per page"
                onchange="issueFilter.pageSize=Number(this.value);issueFilter.page=1;renderPage('issues')">
          ${[10,30,50,100].map(n=>`<option value="${n}" ${issueFilter.pageSize===n?'selected':''}>${n}</option>`).join('')}
        </select>
      </span>
    </div>
    <div class="ui-pager">
      ${btn('‹',page-1,{disabled:page<=1, aria:'Previous page'})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages, aria:'Next page'})}
    </div>
  </div>`;
}

/* ══ THE ADD / EDIT FORM ═══════════════════════════════════════════════════
   Built 2026-09-08 to `add complaaint and maintinanace.png`, on the global
   form system in `forms.css` — numbered sections, icon-prefixed controls, a
   compact header, and a body that scrolls while the header and the action bar
   stay put. It replaces a modal of inline `style="…"` attributes and two
   emoji-labelled toggle buttons that wrote their own colours.

   IT ALSO EDITS. There was no way to change an issue at all: a warden who
   mistyped a room had to delete the record and lose its reference number. The
   same form serves both, because an add form and an edit form that drift apart
   is how a field ends up writable in one and not the other.

   TWO THINGS THE REFERENCE ASKS FOR THAT ARE DELIBERATELY NOT HERE
   -----------------------------------------------------------------
   • **Attachments** ("drag & drop images, PDF, max 5MB"). Storing files needs a
     place to put them, a size budget inside the backup, and a main-process
     handler — a feature, not a form field. Owner's call.
   • **Estimated Cost (PKR)** on maintenance. Money in this app has exactly one
     home, and it is Expenses. An estimate parked on a ticket becomes a second,
     unreconciled answer to "what did maintenance cost this month", which is
     the failure CLAUDE.md's finance rule exists to prevent. The right shape is
     a resolved ticket that WRITES an expense; that is a piece of work, not a
     text box. Owner's call.                                                */

/** Staff names offered for "Assigned To" — the app's own user accounts. The
 *  control is a free-text input backed by a datalist, not a select, because
 *  half of what a hostel assigns goes to an outside plumber who will never
 *  have a login. */
function _issStaffList() {
  return Object.values(typeof WARDENS === 'object' && WARDENS ? WARDENS : {})
    .filter(u => u && u.active !== false)
    .map(u => String(u.name || u.username || '').trim())
    .filter(Boolean);
}

function _issSecHead(n, title, hint) {
  return `<div class="hf-sec__h">
    <span class="hf-num">${n}</span>
    <span class="hf-sec__t">${escHtml(title)}</span>
    ${hint ? `<span class="hf-sec__s">${escHtml(hint)}</span>` : ''}
  </div>`;
}

/** One icon-prefixed control. `ctrl` is the raw <input>/<select>/<textarea>. */
function _issField(label, ico, ctrl, o) {
  o = o || {};
  return `<div class="field${o.full ? ' col-full' : ''}">
    <label>${escHtml(label)}${o.req ? '<span class="req"> *</span>' : ''}</label>
    <div class="hf-in${o.top ? ' hf-in--top' : ''}${o.readonly ? ' is-readonly' : ''}">
      <span class="hf-in__i">${icon(ico, 'xs')}</span>${ctrl}
    </div>
  </div>`;
}

/**
 * Add or edit a complaint / maintenance record.
 * @param {string} [id] existing record id; omit to add a new one.
 */
/* ══ A SEARCHABLE STUDENT PICKER ═══════════════════════════════════════════
   Owner, 2026-09-16: "in complaints page in add forms the student field should
   be a search bar because in a hostel of thousand student it will be hard to
   find".

   Both forms asked for the student through a <select>. A native select offers
   type-ahead only on the first letters of an option, and this app's options
   read "Name — Room 12", so a warden who knows the ROOM but not the spelling
   of the name had nothing to type and a thousand-row scroll to do instead.

   THE <select> SURVIVES, HIDDEN. It keeps the options, it keeps the value, and
   it keeps its own onchange — so _issSyncCompRoom(), _issSyncMtRoom(), the
   submit paths and the edit-time preselection all read exactly what they read
   before, and none of them had to learn about this control. The search box is
   a way of setting it, not a replacement for it.

   The list is read off the select rather than passed in again, so the two can
   never disagree about who is on the roster. */
function _issStuPicker(selectId, placeholder, selectEl) {
  return `<div class="iss-pick" id="${selectId}-pick">
    <div class="hf-in">
      <span class="hf-in__i">${icon('search', 'xs')}</span>
      <input class="form-control" id="${selectId}-q" autocomplete="off" role="combobox"
             aria-expanded="false" aria-controls="${selectId}-drop" aria-autocomplete="list"
             placeholder="${escHtml(placeholder)}"
             oninput="issPickSearch('${selectId}')"
             onfocus="issPickSearch('${selectId}')"
             onkeydown="issPickKey(event,'${selectId}')"
             onblur="setTimeout(()=>issPickClose('${selectId}'),200)">
      <button type="button" class="caf-clear" title="Clear" aria-label="Clear the student"
              onclick="issPickClear('${selectId}')">${icon('close', 'xs')}</button>
    </div>
    <div id="${selectId}-drop" class="caf-drop" role="listbox" style="display:none"></div>
    ${selectEl}
  </div>`;
}

/* The options the select is holding, as data. */
function _issPickRows(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return [];
  return [...sel.options].filter(o => o.value).map(o => ({ v: o.value, t: o.text }));
}

function issPickSearch(selectId) {
  const drop = document.getElementById(selectId + '-drop');
  const q    = (document.getElementById(selectId + '-q') || {}).value || '';
  if (!drop) return;
  const needle = q.trim().toLowerCase();
/* The option text is "Name — Room 12", so one contains() covers searching by
     name and by room number, which is the pair a warden actually has. */
  const rows = _issPickRows(selectId).filter(r => !needle || r.t.toLowerCase().includes(needle));
  if (!rows.length) {
    drop.innerHTML = '<div class="caf-opt__empty">No students found</div>';
  } else {
    drop.innerHTML = rows.slice(0, 12).map((r, i) =>
      `<div class="caf-opt" role="option" tabindex="-1" data-v="${escHtml(r.v)}"${i === 0 ? ' data-first="1"' : ''}
            onmousedown="event.preventDefault()" onclick="issPickChoose('${selectId}','${escHtml(r.v)}')">
         <div class="caf-opt__av">${escHtml((r.t || '?').trim()[0].toUpperCase())}</div>
         <div class="caf-opt__b"><div class="caf-opt__n">${escHtml(r.t)}</div></div>
       </div>`).join('')
      + (rows.length > 12 ? `<div class="caf-opt__empty">${rows.length - 12} more — keep typing</div>` : '');
  }
  drop.style.display = 'block';
  const inp = document.getElementById(selectId + '-q');
  if (inp) inp.setAttribute('aria-expanded', 'true');
}

function issPickClose(selectId) {
  const drop = document.getElementById(selectId + '-drop');
  if (drop) drop.style.display = 'none';
  const inp = document.getElementById(selectId + '-q');
  if (inp) inp.setAttribute('aria-expanded', 'false');
}

/* Enter takes the first match, so the whole control is reachable from the
   keyboard without a mouse ever touching the list. Escape closes it. */
function issPickKey(e, selectId) {
  if (e.key === 'Escape') { issPickClose(selectId); return; }
  if (e.key !== 'Enter') return;
  const first = document.querySelector('#' + selectId + '-drop .caf-opt[data-first]');
  if (first) { e.preventDefault(); issPickChoose(selectId, first.getAttribute('data-v')); }
}

function issPickChoose(selectId, value) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.value = value;
  const inp = document.getElementById(selectId + '-q');
  const opt = [...sel.options].find(o => o.value === value);
  if (inp) inp.value = opt ? opt.text : '';
  issPickClose(selectId);
/* The select's own handler is what fills the room box. Firing the event
     rather than calling the handler by name keeps this control ignorant of
     which form it is in. */
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function issPickClear(selectId) {
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(selectId + '-q');
  if (sel) { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  if (inp) { inp.value = ''; inp.focus(); }
  issPickSearch(selectId);
}

/* On an EDIT the select already carries the recorded student, so the search box
   has to open showing their name rather than empty — an empty box over a filled
   select reads as "nobody chosen" and invites the warden to choose again. */
function issPickSync(selectId) {
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(selectId + '-q');
  if (!sel || !inp) return;
  const opt = sel.options[sel.selectedIndex];
  inp.value = (opt && opt.value) ? opt.text : '';
}

function showIssueModal(id) {
  const rec  = id ? _issAll().find(x => x.id === id) : null;
  const kind = rec ? rec.kind
             : (issuesTab === 'complaints' ? 'complaint' : 'maintenance');

  const roomOpts = roomsByNumber(DB.rooms || []).map(r =>
    `<option value="${escHtml(r.id)}" ${rec && rec.raw.roomId === r.id ? 'selected' : ''}>Room ${escHtml(String(r.number))}</option>`).join('');

  /* Complaints are raised by residents. On an EDIT the recorded student is
     offered even if they have since left, so re-saving an old complaint cannot
     silently blank the person it was about. */
  const stuPool = (DB.students || []).filter(s =>
    s.status === 'Active' || (rec && rec.raw.studentId === s.id));
  const stuOpts = studentsByRoom(stuPool).map(s => {
    const r = (DB.rooms || []).find(x => x.id === s.roomId);
    return `<option value="${escHtml(s.id)}" ${rec && rec.raw.studentId === s.id ? 'selected' : ''}>`
         + `${escHtml(s.name)}${r ? ' — Room ' + escHtml(String(r.number)) : ''}</option>`;
  }).join('');

  /* The maintenance form's student list — same pool, selected by the ticket's
     `raisedById` rather than a complaint's `studentId`. */
  const mtByStu = !!(rec && rec.kind === 'maintenance' && rec.raw.raisedById);
  const mtStuPool = (DB.students || []).filter(s =>
    s.status === 'Active' || (rec && rec.raw.raisedById === s.id));
  const mtStuOpts = studentsByRoom(mtStuPool).map(s => {
    const r = (DB.rooms || []).find(x => x.id === s.roomId);
    return `<option value="${escHtml(s.id)}" ${rec && rec.raw.raisedById === s.id ? 'selected' : ''}>`
         + `${escHtml(s.name)}${r ? ' — Room ' + escHtml(String(r.number)) : ''}</option>`;
  }).join('');

  const catOpts = ISS_CATS.map(c =>
    `<option value="${escHtml(c.key)}" ${rec && rec.category === c.key ? 'selected' : ''}>${escHtml(c.key)}</option>`).join('');

  const prioOpts = (sel) => ['High','Medium','Low'].map(p =>
    `<option value="${p}" ${p === sel ? 'selected' : ''}>${p}</option>`).join('');

  const staff = _issStaffList();
  /* "Raised by" offers staff AND residents — see the field for why it is a
     datalist rather than a select. Names only; the ticket records who said it,
     not a link to a record that may be deleted years later. */
  const raisers = staff.concat(
    (DB.students || []).filter(s => s.status === 'Active')
      .map(s => String(s.name || '').trim()).filter(Boolean));
  const dlist = `<datalist id="iss-staff">${staff.map(n => `<option value="${escHtml(n)}"></option>`).join('')}</datalist>`
    + `<datalist id="iss-raisers">${[...new Set(raisers)].map(n => `<option value="${escHtml(n)}"></option>`).join('')}</datalist>`;

  const dateCtrl = (fid, val, ph) =>
    `<input id="${fid}" class="form-control cdp-trigger" type="text" readonly placeholder="${ph}"`
    + ` onclick="showCustomDatePicker(this,event)" value="${escHtml(val || '')}">`;

/* ── Maintenance ───────────────────────────────────────────────────────── */
  const maint = `
    <div id="if-maint" class="hf-form"${kind === 'complaint' ? ' hidden' : ''}>
      <div class="hf-sec">
        ${_issSecHead(1, 'The issue', 'What is broken, and where')}
        <div class="hf-g2">
          ${_issField('Issue title', 'tool',
            `<input id="mt-title" class="form-control" placeholder="e.g. Broken fan, Leaking pipe" value="${rec ? escHtml(rec.title) : ''}">`,
            { req: true, full: true })}
          ${''/* RAISED BY, BESIDE THE TITLE (owner, 2026-09-16: "move the
                 student selection field in add maintenance to the above beside
                 the issue title"). It used to sit in section 3 under
                 Description, two sections below the Room box it fills in — so
                 choosing the student silently changed a field the warden had
                 already scrolled past, and the answer to "whose room is this"
                 arrived after the question had been asked.

                 A STUDENT OR STAFF (owner, 2026-09-14: "maintenance should
                 also be raised by student and its room number"). Student:
                 picked from the residents, and the ticket's room becomes the
                 room on their record (the Room box locks to it). Staff: the
                 free-text name, and the room is chosen by hand — a burst pipe
                 is reported by a student, a warden, the cook, or the man who
                 came to read the meter, and a dropdown of logins holds three
                 of those four badly. */}
          <div class="field">
            <label>Raised by</label>
            <div class="hf-switch hf-switch--in" role="tablist">
              <button type="button" id="mt-by-stu" role="tab" class="hf-switch__b${mtByStu ? ' is-on' : ''}"
                      onclick="_issMtRaiser('student')">${icon('student','xs')} Student</button>
              <button type="button" id="mt-by-staff" role="tab" class="hf-switch__b${mtByStu ? '' : ' is-on'}"
                      onclick="_issMtRaiser('staff')">${icon('person','xs')} Staff</button>
            </div>
            <div id="mt-by-stu-box"${mtByStu ? '' : ' style="display:none"'}>
              ${_issStuPicker('mt-raised-stu', 'Search by name or room number…',
                `<select id="mt-raised-stu" class="form-control" hidden onchange="_issSyncMtRoom()"><option value="">Select student</option>${mtStuOpts}</select>`)}
            </div>
            <div class="hf-in" id="mt-by-staff-box"${mtByStu ? ' style="display:none"' : ''}>
              <span class="hf-in__i">${icon('person', 'xs')}</span>
              <input id="mt-raised" class="form-control" list="iss-raisers" placeholder="Who reported it"
                     value="${rec ? (mtByStu ? '' : escHtml(rec.by)) : escHtml((typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) || '')}">
            </div>
          </div>
          ${_issField('Category', 'tag',
            `<select id="mt-category" class="form-control"><option value="">Select category</option>${catOpts}</select>`)}
          ${_issField('Room', 'bed',
            `<select id="mt-room" class="form-control"><option value="">Select room</option>${roomOpts}</select>`)}
          ${_issField('Priority', 'warning',
            `<select id="mt-priority" class="form-control">${prioOpts(rec ? rec.priority : 'Medium')}</select>`)}
          ${_issField('Location / area', 'pin',
            `<input id="mt-location" class="form-control" placeholder="e.g. Bathroom, Kitchen, Common area" value="${rec ? escHtml(rec.location) : ''}">`)}
        </div>
      </div>

      <div class="hf-sec">
        ${_issSecHead(2, 'Timing & status', 'When it was reported, when it is due, where it stands')}
        <div class="hf-g3">
          ${_issField('Reported date', 'calendar', dateCtrl('mt-date', rec ? rec.date : today(), 'Select date'), { req: true })}
          ${_issField('Expected completion', 'clock', dateCtrl('mt-expected', rec ? rec.expected : '', 'Optional'))}
          ${/* A status a warden can only move FORWARD is a status they cannot
                correct. The row's buttons resolve and progress a ticket; this
                is the only way back from a Resolved marked by mistake, and it
                is why the complaint form has carried one from the start. */''}
          ${_issField('Status', 'check',
            `<select id="mt-status" class="form-control">
               <option value="Open"       ${!rec || rec.status === 'Open' ? 'selected' : ''}>Open</option>
               <option value="InProgress" ${rec && rec.status === 'InProgress' ? 'selected' : ''}>In Progress</option>
               <option value="Resolved"   ${rec && rec.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
             </select>`)}
        </div>
      </div>

      <div class="hf-sec">
        ${_issSecHead(3, 'Details & assignment', 'Describe the work and who is doing it')}
        <div class="hf-g2">
          ${_issField('Description', 'fileText',
            `<textarea id="mt-desc" class="form-control" placeholder="Describe the issue and the work required…">${rec ? escHtml(rec.desc) : ''}</textarea>`,
            { full: true, top: true })}
          ${/* The reference marks this required. It is not, here: a ticket is
                logged the moment a warden hears about it, and who will do the
                work is often the next day's question. A required field that
                stands between a hostel and recording a burst pipe is a field
                that gets filled with a full stop. */''}
          ${''/* RAISED BY (owner, 2026-09-10: "add maintinance raised in the
                 maintinaance form"). Every maintenance ticket printed a blank
                 in the register's Student column, because nothing on the form
                 ever asked who reported it — a complaint records the student
                 who filed it, and maintenance recorded nobody.

                 FREE TEXT WITH A DATALIST OF BOTH STAFF AND RESIDENTS, not a
                 select: a burst pipe is reported by a student, a warden, the
                 cook, or the man who came to read the meter, and a dropdown
                 that only offers logins cannot hold three of those four. It
                 defaults to whoever is signed in, since that is who is at the
                 keyboard writing the ticket. */}
          ${_issField('Assigned to', 'person',
            `<input id="mt-assigned" class="form-control" list="iss-staff" placeholder="Staff member or contractor" value="${rec ? escHtml(rec.assigned) : ''}">`)}
        </div>
      </div>
    </div>`;

  /* ── Complaint ─────────────────────────────────────────────────────────── */
  const comp = `
    <div id="if-comp" class="hf-form"${kind === 'complaint' ? '' : ' hidden'}>
      <div class="hf-sec">
        ${_issSecHead(1, 'Student & room', 'Who raised it — the room follows the student')}
        <div class="hf-g2">
          ${_issField('Student', 'student',
            _issStuPicker('cp-student', 'Search by name or room number…',
              `<select id="cp-student" class="form-control" hidden onchange="_issSyncCompRoom()"><option value="">Select student</option>${stuOpts}</select>`),
            { req: true })}
          ${_issField('Room', 'bed',
            `<input id="cp-room" class="form-control" readonly value="${rec && rec.roomNo ? '#' + escHtml(rec.roomNo) : ''}" placeholder="From the student's record">`,
            { readonly: true })}
        </div>
      </div>

      <div class="hf-sec">
        ${_issSecHead(2, 'Complaint details', 'What the complaint is about')}
        <div class="hf-g3">
          ${_issField('Category', 'tag',
            `<select id="cp-category" class="form-control"><option value="">Select category</option>${catOpts}</select>`)}
          ${_issField('Priority', 'warning',
            `<select id="cp-priority" class="form-control">${prioOpts(rec && rec.priority ? rec.priority : 'Medium')}</select>`)}
          ${_issField('Status', 'check',
            `<select id="cp-status" class="form-control">
               <option value="Open"        ${rec && rec.status === 'Open' ? 'selected' : ''}>Open</option>
               <option value="UnderReview" ${rec && rec.status === 'UnderReview' ? 'selected' : ''}>Under Review</option>
               <option value="Resolved"    ${rec && rec.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
             </select>`)}
          ${_issField('Complaint date', 'calendar', dateCtrl('cp-date', rec ? rec.date : today(), 'Select date'), { req: true })}
          ${_issField('Expected resolution', 'clock', dateCtrl('cp-expected', rec ? rec.expected : '', 'Optional'))}
          ${_issField('Assigned to', 'person',
            `<input id="cp-assigned" class="form-control" list="iss-staff" placeholder="Staff member" value="${rec ? escHtml(rec.assigned) : ''}">`)}
          ${_issField('Subject', 'fileText',
            `<input id="cp-subject" class="form-control" placeholder="e.g. No water in bathroom" value="${rec ? escHtml(rec.title) : ''}">`,
            { req: true, full: true })}
          ${_issField('Description', 'fileText',
            `<textarea id="cp-desc" class="form-control" placeholder="Describe the complaint in detail…">${rec ? escHtml(rec.desc) : ''}</textarea>`,
            { full: true, top: true })}
        </div>
      </div>
    </div>`;

  /* The kind switch. Neutral, not accent-filled: it selects which form is on
     screen, and the one saturated action on this modal is Save. Hidden on an
     edit — a complaint cannot become a maintenance ticket. */
  const switcher = rec ? '' : `
    <div class="hf-switch" role="tablist">
      <button type="button" id="ib-maint" role="tab" class="hf-switch__b${kind === 'maintenance' ? ' is-on' : ''}"
              onclick="_issPickKind('maintenance')">${icon('tool','xs')} Maintenance</button>
      <button type="button" id="ib-comp" role="tab" class="hf-switch__b${kind === 'complaint' ? ' is-on' : ''}"
              onclick="_issPickKind('complaint')">${icon('helpCircle','xs')} Complaint</button>
    </div>`;

  const heading = rec
    ? (kind === 'maintenance' ? 'Edit Maintenance — ' + _issSeq(rec) : 'Edit Complaint — ' + _issSeq(rec))
    : 'Add Complaint / Maintenance';
  const sub = rec
    ? 'Update this record. Its reference number does not change.'
    : 'Record a maintenance task or register a complaint from a student.';

  showModal('modal-form', `
    <div class="hf-mh">
      <span class="hf-mh__ico">${icon(kind === 'maintenance' ? 'tool' : 'helpCircle', 'sm')}</span>
      <span style="min-width:0">
        <span class="hf-mh__t">${escHtml(heading)}</span>
        <span class="hf-mh__s">${escHtml(sub)}</span>
      </span>
    </div>`,
    dlist + switcher + maint + comp,
    `<div class="hf-actions">
       <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="saveIssue(${id ? `'${escHtml(id)}'` : ''})">
         ${icon('save','xs')} ${rec ? 'Save changes' : 'Save issue'}</button>
     </div>`);

  if (kind === 'complaint' && !rec) _issSyncCompRoom();
  if (mtByStu) _issSyncMtRoom();
  /* On an edit the hidden select already holds the recorded student, so the
     search box has to open showing their name — an empty box over a filled
     select reads as "nobody chosen" and invites choosing again. */
  issPickSync('cp-student');
  issPickSync('mt-raised-stu');
}

/** Is the maintenance form's "Raised by" on Student? */
function _issMtByStudent() {
  const b = document.getElementById('mt-by-stu');
  return !!(b && b.classList.contains('is-on'));
}

/** Switch "Raised by" between a resident and a staff name (owner, 2026-09-14). */
function _issMtRaiser(mode) {
  const stu = mode === 'student';
  const bs = document.getElementById('mt-by-stu'), bf = document.getElementById('mt-by-staff');
  if (bs) bs.classList.toggle('is-on', stu);
  if (bf) bf.classList.toggle('is-on', !stu);
  const boxS = document.getElementById('mt-by-stu-box'), boxF = document.getElementById('mt-by-staff-box');
  if (boxS) boxS.style.display = stu ? '' : 'none';
  if (boxF) boxF.style.display = stu ? 'none' : '';
  _issSyncMtRoom();
}

/** A student's ticket is for the room on their record — shown in the Room box
 *  and locked there. Staff pick the room themselves. */
function _issSyncMtRoom() {
  const room = document.getElementById('mt-room');
  if (!room) return;
  const byStu = _issMtByStudent();
  room.disabled = byStu;
  if (byStu) {
    const sel = document.getElementById('mt-raised-stu');
    const s = sel ? (DB.students || []).find(t => t.id === sel.value) : null;
    room.value = s && s.roomId ? s.roomId : '';
  }
}

/** Swap which of the two forms is on screen. */
function _issPickKind(kind) {
  const m = document.getElementById('if-maint');
  const c = document.getElementById('if-comp');
  const bm = document.getElementById('ib-maint');
  const bc = document.getElementById('ib-comp');
  if (!m || !c) return;
  const wantComp = kind === 'complaint';
  m.hidden = wantComp;
  c.hidden = !wantComp;
  if (bm) bm.classList.toggle('is-on', !wantComp);
  if (bc) bc.classList.toggle('is-on', wantComp);
  /* The modal header carries the kind's glyph. Rendered once at open time, it
     went on showing a wrench over a complaint form. */
  const mh = document.querySelector('.hf-mh__ico');
  if (mh) mh.innerHTML = icon(wantComp ? 'helpCircle' : 'tool', 'sm');
  if (wantComp) _issSyncCompRoom();
}

/** The complaint's room is the room its student lives in — shown, never typed. */
function _issSyncCompRoom() {
  const sel = document.getElementById('cp-student');
  const out = document.getElementById('cp-room');
  if (!sel || !out) return;
  const s = (DB.students || []).find(t => t.id === sel.value);
  const r = s ? (DB.rooms || []).find(x => x.id === s.roomId) : null;
  out.value = r ? '#' + String(r.number) : '';
}

/** Which form is showing. `hidden` rather than an inline display style, so the
 *  answer does not depend on how the element was last written to. */
function _issFormIsComplaint() {
  const c = document.getElementById('if-comp');
  return !!(c && !c.hidden);
}

const _issVal = (id) => String((document.getElementById(id) || {}).value || '').trim();

async function saveIssue(id) {
  const isComp = _issFormIsComplaint();

  if (!isComp) {
    const title = _issVal('mt-title');
    if (!title) { toast('Enter an issue title', 'error'); return; }
    if (!DB.maintenance) DB.maintenance = [];

    /* Raised by a student: their name and link are recorded, and the room is
       the one on their record — not whatever the room box says. */
    const byStudent = _issMtByStudent();
    const byStu = byStudent
      ? ((DB.students || []).find(s => s.id === _issVal('mt-raised-stu')) || null) : null;
    if (byStudent && !byStu) { toast('Select the student who raised it', 'error'); return; }

    const status = _issVal('mt-status') || 'Open';
    const fields = {
      title,
      roomId:       byStu ? (byStu.roomId || '') : _issVal('mt-room'),
      category:     _issVal('mt-category'),
      priority:     _issVal('mt-priority') || 'Medium',
      location:     _issVal('mt-location'),
      description:  _issVal('mt-desc'),
      date:         _issVal('mt-date') || today(),
      expectedDate: _issVal('mt-expected'),
      assignedTo:   _issVal('mt-assigned'),
      // Who reported it (owner, 2026-09-10). Read back by _issAll() as `by`.
      raisedBy:     byStu ? byStu.name : _issVal('mt-raised'),
      raisedById:   byStu ? byStu.id : '',
      status,
    };

    const existing = id ? DB.maintenance.find(x => x.id === id) : null;
    if (existing) {
      Object.assign(existing, fields);
      /* Moving a ticket OFF Resolved has to take the closing date with it, or
         the register shows an open ticket that also states the day it closed.
         Moving it ON keeps a date already stamped by the row's button. */
      if (status === 'Resolved') { if (!existing.resolvedDate) existing.resolvedDate = today(); }
      else existing.resolvedDate = '';
      logActivity('Maintenance Updated', title, 'Maintenance');
    } else {
      DB.maintenance.push(Object.assign({
        id: 'mt_' + uid(), seq: _issNextSeq(DB.maintenance),
        resolvedDate: status === 'Resolved' ? today() : '',
      }, fields));
      logActivity('Maintenance Added', title, 'Maintenance');
    }
    issuesTab = 'maintenance';

  } else {
    const subject = _issVal('cp-subject');
    if (!subject) { toast('Enter a subject', 'error'); return; }
    if (!DB.complaints) DB.complaints = [];

    const status = _issVal('cp-status') || 'Open';
    const fields = {
      subject,
      studentId:    _issVal('cp-student'),
      category:     _issVal('cp-category'),
      priority:     _issVal('cp-priority') || 'Medium',
      description:  _issVal('cp-desc'),
      date:         _issVal('cp-date') || today(),
      expectedDate: _issVal('cp-expected'),
      assignedTo:   _issVal('cp-assigned'),
      status,
    };

    const existing = id ? DB.complaints.find(x => x.id === id) : null;
    if (existing) {
      Object.assign(existing, fields);
      /* Resolving from the form must stamp the date the resolve BUTTON stamps,
         and clearing the status must take it back off — otherwise a record can
         read Open while still carrying the day it was closed. */
      if (status === 'Resolved') { if (!existing.resolvedDate) existing.resolvedDate = today(); }
      else existing.resolvedDate = '';
      logActivity('Complaint Updated', subject, 'Complaint');
    } else {
      DB.complaints.push(Object.assign({
        id: 'cp_' + uid(), seq: _issNextSeq(DB.complaints),
        resolvedDate: status === 'Resolved' ? today() : '', response: '',
      }, fields));
      logActivity('Complaint Added', subject, 'Complaint');
    }
    issuesTab = 'complaints';
  }

  await saveDB();
  closeModal();
  renderPage('issues');
  toast(id ? 'Changes saved' : 'Saved', 'success');
}

async function resolveMaint(id){var m=DB.maintenance.find(function(x){return x.id===id;});if(m){m.status='Resolved';m.resolvedDate=today();await saveDB();renderPage('issues');toast('Resolved','success');}}
async function progressMaint(id){var m=DB.maintenance.find(function(x){return x.id===id;});if(m){m.status='InProgress';await saveDB();renderPage('issues');toast('In Progress','info');}}
/* THE DELETE PERMISSION REACHES MAINTENANCE AND COMPLAINTS TOO (owner,
   2026-09-10). Both of these destroyed a record with no permission check of any
   kind, which is why an account created with the delete box unticked could
   still empty the issues register. */
async function delMaint(id){
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  showConfirm('Delete?','',async function(){DB.maintenance=DB.maintenance.filter(function(x){return x.id!==id;});await saveDB();renderPage('issues');toast('Deleted','info');});}
async function resolveComp(id) {
  // FIX #7: Replace blocking native prompt() with an in-app modal dialog
  var cc = DB.complaints.find(function(x){return x.id===id;}); if(!cc) return;
  showModal('modal-sm', 'Resolve Complaint',
    '<div class="field"><label>Optional Response</label>' +
    '<textarea id="comp-resolve-text" class="form-control" rows="3" placeholder="Enter a response or leave blank…"></textarea></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-success" onclick="(async function(){' +
      'var cc=DB.complaints.find(function(x){return x.id===\'' + id + '\';});' +
      'if(cc){cc.status=\'Resolved\';cc.resolvedDate=today();cc.response=(document.getElementById(\'comp-resolve-text\')||{}).value||\'\';}' +
      'await saveDB();closeModal();renderPage(\'issues\');toast(\'Complaint resolved\',\'success\');' +
    '})()">Mark Resolved</button>'
  );
}
async function delComp(id){
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  showConfirm('Delete?','',async function(){DB.complaints=DB.complaints.filter(function(x){return x.id!==id;});await saveDB();renderPage('issues');toast('Deleted','info');});}

/* The pre-v5 names. Nothing in the app calls them today — verified 2026-09-08
   across the whole renderer — but they are the names every older call site and
   any hand-written onclick used, and they cost four lines. Do not add a comment
   claiming a caller without checking: the previous one said "so dashboard
   alerts still work", and the dashboard navigates to this page instead. */
function resolveMaintenance(id){resolveMaint(id);}
function progressMaintenance(id){progressMaint(id);}
function deleteMaintenance(id){delMaint(id);}
function resolveComplaint(id){resolveComp(id);}
function deleteComplaint(id){delComp(id);}
// `showAddIssueModal` is what the older call sites and the keyboard shortcut
// use; it is the add form, which is showIssueModal with no record.
function showAddIssueModal(){showIssueModal();}
function showAddMaintenanceModal(){issuesTab='maintenance';showIssueModal();}
function showAddComplaintModal(){issuesTab='complaints';showIssueModal();}


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