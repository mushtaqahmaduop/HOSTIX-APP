/* ─── HOSTYLLO — ROOM INSPECTIONS ──────────────────────────────────────────────
   Owner, 2026-09-29/30. The checklist form had existed for a long time with no
   way in (settings.js, "Room Inspection Checklist"), saving into DB.inspections
   and then returning to an "inspections" page that did not exist. The owner
   approved this design from screenshots:

     · the room's detail shows its CONDITION — the last result, who inspected,
       how many problems are still open — and its history, newest first;
     · "Inspect room" opens the checklist with the room already chosen;
     · every item is OK / Problem / N/A. The old form's tick was ambiguous (a
       tick meant "looked at" to one warden and "fine" to another), and a
       Problem must say what is wrong, in one line;
     · the overall result is worked out from the checklist — no problems Good,
       one or two Fair, three or more Poor — and can be overridden;
     · each problem can be raised as a job in Complaints against this room, on
       by default. The room's "still open" count reads those issues, so fixing
       the job in Complaints clears it here: one list of work, not two.

   The 10 items are fixed (owner: "fixed 10 for now"), so every inspection of a
   room can be compared with the last one.

   THE RECORD
     { id, roomId, roomNumber, date, inspector, inspectorId,
       items: [{ name, status: 'ok'|'problem'|'na', note, issueId }],
       overall: 'Good'|'Fair'|'Poor', overallSetByHand, notes,
       createdAt, createdBy }

   Rows written by the old form carry `checklist: { item: true|false }` and
   `overallCondition`. They are read, never rewritten: a tick is shown as OK and
   an unticked item as "Not marked", because that is all the old form knew.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const INSPECTION_ITEMS = ['Walls & Paint', 'Flooring', 'Windows & Locks', 'Bathroom', 'Plumbing',
  'Electrical Fixtures', 'Fan / AC', 'Beds & Furniture', 'Cleanliness', 'Lighting'];

/* The Complaints category a problem is filed under — one of ISS_CATS. */
const INSP_ITEM_CATEGORY = {
  'Walls & Paint': 'Maintenance', 'Flooring': 'Maintenance', 'Windows & Locks': 'Maintenance',
  'Bathroom': 'Plumbing', 'Plumbing': 'Plumbing', 'Electrical Fixtures': 'Electrical',
  'Fan / AC': 'Appliance', 'Beds & Furniture': 'Furniture', 'Cleanliness': 'Cleanliness',
  'Lighting': 'Electrical',
};

const INSP_STATUS_LABEL = { ok: 'OK', problem: 'Problem', na: 'N/A', unmarked: 'Not marked' };

/* ── RULES (pure; pinned by tests/inspections.test.js) ─────────────────────── */

/** No problems Good, one or two Fair, three or more Poor. */
function inspOverall(items) {
  const n = (items || []).filter(i => i && i.status === 'problem').length;
  return n === 0 ? 'Good' : n <= 2 ? 'Fair' : 'Poor';
}

/** What stops a save, as one sentence, or '' when it may be saved. */
function inspProblemWith(items) {
  const list = items || [];
  const unmarked = list.filter(i => !i || !['ok', 'problem', 'na'].includes(i.status));
  if (unmarked.length) return 'Mark every item — ' + unmarked.length + ' still to go (' + unmarked.map(i => i.name).join(', ') + ')';
  const silent = list.filter(i => i.status === 'problem' && !String(i.note || '').trim());
  if (silent.length) return 'Say what is wrong with ' + silent.map(i => i.name).join(', ');
  return '';
}

/** Any stored row, old or new, in the new shape. Never writes. */
function inspRead(rec) {
  if (!rec) return null;
  if (Array.isArray(rec.items)) return rec;
  const ck = rec.checklist || {};
  return Object.assign({}, rec, {
    items: INSPECTION_ITEMS.map(name => ({ name, status: ck[name] ? 'ok' : 'unmarked', note: '', issueId: '' })),
    overall: rec.overallCondition || 'Good',
    legacy: true,
  });
}

/** A room's inspections, newest first. */
function inspForRoom(roomId) {
  return (DB.inspections || []).filter(x => x && x.roomId === roomId).map(inspRead)
    .sort((a, b) => String(b.date).localeCompare(String(a.date))
                 || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/** The issues an inspection raised, and how many are not yet resolved. */
function inspIssues(rec) {
  const ids = (rec && rec.items || []).map(i => i.issueId).filter(Boolean);
  const all = (DB.issues || []).filter(x => ids.includes(x.id));
  const open = all.filter(x => (typeof _issBucket === 'function' ? _issBucket(x.status) : (x.status === 'Resolved' ? 'resolved' : 'open')) !== 'resolved');
  return { all, open };
}

/* ── THE ROOM'S CONDITION (drawn inside showRoomDetail) ───────────────────── */
function _inspBadge(overall) {
  const cls = overall === 'Good' ? 'is-good' : overall === 'Poor' ? 'is-poor' : 'is-fair';
  return `<span class="insp-badge ${cls}">${escHtml(overall)}</span>`;
}

function inspRoomSection(room) {
  if (!room) return '';
  const list = inspForRoom(room.id);
  const last = list[0];
  const btn = `<button type="button" class="btn btn-primary btn-sm" id="insp-start"
                 onclick="closeModal();showInspectRoom('${escHtml(room.id)}')">${icon('check', 'xs')} Inspect room</button>`;
  if (!last) {
    return `<div class="insp-cond"><div class="insp-h">Condition</div>
      <div class="insp-last"><div class="insp-last__t"><b>Not inspected yet</b>
        <span>Record what the room is like, and anything that needs fixing.</span></div>${btn}</div></div>`;
  }
  const probs = last.items.filter(i => i.status === 'problem').length;
  const open = inspIssues(last).open.length;
  const sub = [last.inspector ? 'by ' + escHtml(last.inspector) : '',
               probs ? probs + ' problem' + (probs === 1 ? '' : 's') + ' found' : 'no problems found',
               open ? open + ' still open' : ''].filter(Boolean).join(' · ');
  const MAX = 5;
  const rows = list.slice(0, MAX).map(r => {
    const p = r.items.filter(i => i.status === 'problem').map(i => i.name);
    return `<button type="button" class="insp-row" onclick="closeModal();showInspection('${escHtml(r.id)}')">
      <span class="insp-dot ${r.overall === 'Good' ? 'is-good' : r.overall === 'Poor' ? 'is-poor' : 'is-fair'}"></span>
      <span class="insp-row__d">${escHtml(fmtDate(r.date))}</span>
      <span class="insp-row__w">${escHtml(r.overall)}${r.inspector ? ' · ' + escHtml(r.inspector) : ''}</span>
      <span class="insp-row__p">${p.length ? escHtml(p.join(' · ')) : (r.legacy ? 'Older checklist' : 'No problems')}</span>
      <span class="insp-row__go">View ›</span></button>`;
  }).join('');
  return `<div class="insp-cond"><div class="insp-h">Condition</div>
    <div class="insp-last">${_inspBadge(last.overall)}
      <div class="insp-last__t"><b>Last inspected ${escHtml(fmtDate(last.date))}</b><span>${sub}</span></div>${btn}</div>
    <div class="insp-h insp-h--sub">History${list.length > MAX ? ` <em>latest ${MAX} of ${list.length}</em>` : ''}</div>
    <div class="insp-hist">${rows}</div></div>`;
}

/* ── THE FORM ─────────────────────────────────────────────────────────────── */
let _inspDraft = null;

function showInspectRoom(roomId) {
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const room = (DB.rooms || []).find(r => r.id === roomId);
  if (!room) { toast('That room could not be found', 'error'); return; }
  _inspDraft = {
    roomId,
    items: INSPECTION_ITEMS.map(name => ({ name, status: '', note: '' })),
    overallByHand: null,
  };
  const type = typeof getRoomType === 'function' ? getRoomType(room) : null;
  const living = (DB.students || []).filter(s => s.roomId === room.id && typeof isResident === 'function' && isResident(s)).length;
  const who = (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) || '';
  showModal('modal-md', '', `
    <div class="hf-mh"><span class="hf-mh__ico">${icon('check', 'sm')}</span><div>
      <div class="hf-mh__t">Inspect Room ${escHtml(roomText(room.number, room.floor))}</div>
      <div class="hf-mh__s">${escHtml([type && type.name, room.floor ? room.floor + ' floor' : '',
        living + ' student' + (living === 1 ? '' : 's') + ' living here'].filter(Boolean).join(' · '))}</div></div></div>
    <div class="insp-f__top">
      <label class="insp-f__fld"><span>Date</span>
        <input id="insp-date" class="form-control cdp-trigger" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${escHtml(today())}"></label>
      <label class="insp-f__fld"><span>Inspected by</span>
        <input id="insp-by" class="form-control" value="${escHtml(who)}" placeholder="Name"></label>
    </div>
    <div class="insp-h">Checklist <em>Mark every item. A problem needs a line saying what is wrong.</em></div>
    <div class="insp-list" id="insp-list"></div>
    <div class="insp-f__sum" id="insp-sum"></div>
    <div class="field" style="margin-top:10px"><label for="insp-notes">Notes</label>
      <textarea id="insp-notes" class="form-control" rows="2" placeholder="Anything else worth recording"></textarea></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="insp-save" onclick="submitInspection()">Save inspection</button>`);
  _inspPaint();
}

function _inspPaint() {
  const d = _inspDraft; if (!d) return;
  const list = document.getElementById('insp-list');
  if (list) list.innerHTML = d.items.map((it, i) => `
    <div class="insp-it${it.status === 'problem' ? ' is-bad' : ''}" data-item="${escHtml(it.name)}">
      <span class="insp-it__n">${escHtml(it.name)}</span>
      <span class="insp-seg" role="radiogroup" aria-label="${escHtml(it.name)}">
        ${['ok', 'problem', 'na'].map(s => `<button type="button" role="radio" aria-checked="${it.status === s}"
            class="${it.status === s ? 'on ' + s : ''}" data-s="${s}" onclick="inspSet(${i},'${s}')">${INSP_STATUS_LABEL[s]}</button>`).join('')}
      </span>
      ${it.status === 'problem' ? `<input class="form-control insp-it__note" id="insp-note-${i}" placeholder="What is wrong?"
          value="${escHtml(it.note)}" oninput="inspNote(${i}, this.value)">` : ''}
    </div>`).join('');
  _inspPaintSum();
}

function _inspPaintSum() {
  const d = _inspDraft; const el = document.getElementById('insp-sum'); if (!d || !el) return;
  const auto = inspOverall(d.items), overall = d.overallByHand || auto;
  const probs = d.items.filter(i => i.status === 'problem').length;
  const raise = document.getElementById('insp-raise');
  const raiseOn = raise ? raise.checked : true;
  el.innerHTML = `
    <div><span>Overall</span>
      <span class="insp-seg insp-seg--overall" role="radiogroup" aria-label="Overall condition">
        ${['Good', 'Fair', 'Poor'].map(o => `<button type="button" role="radio" aria-checked="${overall === o}"
          class="${overall === o ? 'on ' + (o === 'Good' ? 'ok' : o === 'Poor' ? 'problem' : 'fair') : ''}"
          onclick="inspSetOverall('${o}')">${o}</button>`).join('')}
      </span>
      <em>${d.overallByHand ? 'set by you — the checklist says ' + auto + ' · <a href="#" onclick="inspSetOverall(null);return false">use ' + auto + '</a>'
                            : 'from the checklist: no problems Good, 1–2 Fair, 3+ Poor'}</em></div>
    <label class="insp-f__raise"><input type="checkbox" id="insp-raise" ${raiseOn ? 'checked' : ''} ${probs ? '' : 'disabled'}>
      Raise a maintenance issue for each problem${probs ? ' (' + probs + ')' : ''} — they appear in Complaints, filed against this room</label>`;
}

function inspSet(i, status) {
  const d = _inspDraft; if (!d || !d.items[i]) return;
  d.items[i].status = status;
  _inspPaint();
  if (status === 'problem') { const n = document.getElementById('insp-note-' + i); if (n) n.focus(); }
}
function inspNote(i, v) { if (_inspDraft && _inspDraft.items[i]) _inspDraft.items[i].note = v; }
function inspSetOverall(o) { if (_inspDraft) { _inspDraft.overallByHand = o || null; _inspPaintSum(); } }

async function submitInspection() {
  return (typeof submitOnce === 'function')
    ? submitOnce('inspection:save', _submitInspection)
    : _submitInspection();
}
async function _submitInspection() {
  if (typeof requireWritable === 'function' && !requireWritable('This inspection')) return;
  if (typeof requirePerm === 'function' && !requirePerm('edit')) return;
  const d = _inspDraft; if (!d) return;
  const room = (DB.rooms || []).find(r => r.id === d.roomId);
  if (!room) { toast('That room could not be found', 'error'); return; }
  const stop = inspProblemWith(d.items);
  if (stop) { toast(stop, 'error'); return; }

  const date = (document.getElementById('insp-date') || {}).value || today();
  const inspector = String((document.getElementById('insp-by') || {}).value || '').trim()
    || ((typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) || '');
  const raise = !!(document.getElementById('insp-raise') || {}).checked;
  const id = 'ins_' + uid();
  const items = d.items.map(it => ({ name: it.name, status: it.status, note: String(it.note || '').trim(), issueId: '' }));

  if (raise) {
    items.filter(it => it.status === 'problem').forEach(it => {
      const iss = issueNew({
        title: it.name + ' — ' + it.note,
        category: INSP_ITEM_CATEGORY[it.name] || 'Maintenance',
        roomId: room.id,
        priority: 'Medium',
        location: '',
        description: 'Found in the room inspection of ' + fmtDate(date) + (inspector ? ' by ' + inspector : '') + '.',
        date,
        expectedDate: '',
        assignedTo: '',
        raisedBy: inspector,
        raisedById: '',
        studentId: '',
        status: 'Open',
        fromInspection: id,
      });
      it.issueId = iss.id;
    });
  }

  if (!Array.isArray(DB.inspections)) DB.inspections = [];
  DB.inspections.push({
    id, roomId: room.id, roomNumber: String(room.number), date, inspector,
    inspectorId: (typeof CUR_ROLE !== 'undefined' && CUR_ROLE) || null,
    items,
    overall: d.overallByHand || inspOverall(items),
    overallSetByHand: !!d.overallByHand,
    notes: String((document.getElementById('insp-notes') || {}).value || '').trim(),
    createdAt: new Date().toISOString(),
    createdBy: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) || '',
  });
  const raised = items.filter(it => it.issueId).length;
  logActivity('Room Inspected', 'Room ' + room.number + ' · ' + (d.overallByHand || inspOverall(items))
    + (raised ? ' · ' + raised + ' issue' + (raised === 1 ? '' : 's') + ' raised' : ''), 'Room');
  await saveDB();
  _inspDraft = null;
  closeModal();
  if (typeof showRoomDetail === 'function') showRoomDetail(room.id);
  toast('Inspection saved' + (raised ? ' — ' + raised + ' issue' + (raised === 1 ? '' : 's') + ' raised in Complaints' : ''), 'success');
}

/* ── ONE INSPECTION, READ-ONLY ────────────────────────────────────────────── */
function showInspection(id) {
  const rec = inspRead((DB.inspections || []).find(x => x.id === id));
  if (!rec) { toast('That inspection could not be found', 'error'); return; }
  const room = (DB.rooms || []).find(r => r.id === rec.roomId);
  const issues = new Map((DB.issues || []).map(x => [x.id, x]));
  const chip = s => `<span class="insp-chip is-${s}">${INSP_STATUS_LABEL[s] || s}</span>`;
  const issueTag = iid => {
    const x = issues.get(iid);
    if (!x) return '';
    const done = (typeof _issBucket === 'function' ? _issBucket(x.status) : '') === 'resolved';
    const ref = typeof _issSeq === 'function' ? _issSeq({ kind: x.kind || 'complaint', raw: x }) : '';
    return `<span class="insp-iss${done ? ' is-done' : ''}">${escHtml(ref)} · ${escHtml(x.status || 'Open')}</span>`;
  };
  showModal('modal-md', '', `
    <div class="hf-mh"><span class="hf-mh__ico">${icon('check', 'sm')}</span><div>
      <div class="hf-mh__t">Room ${escHtml(room ? roomText(room.number, room.floor) : (rec.roomNumber || '—'))} · ${escHtml(fmtDate(rec.date))}</div>
      <div class="hf-mh__s">${escHtml(rec.inspector ? 'Inspected by ' + rec.inspector : 'Inspector not recorded')}${rec.legacy ? ' · recorded on the older checklist' : ''}</div></div>
      <span style="margin-left:auto">${_inspBadge(rec.overall)}</span></div>
    <div class="insp-view">${rec.items.map(it => `
      <div class="insp-view__r${it.status === 'problem' ? ' is-bad' : ''}"><span class="insp-view__n">${escHtml(it.name)}</span>${chip(it.status)}
        ${it.note ? `<span class="insp-view__note">${escHtml(it.note)}</span>` : ''}${it.issueId ? issueTag(it.issueId) : ''}</div>`).join('')}
    </div>
    ${rec.notes ? `<div class="insp-view__notes"><div class="insp-h">Notes</div>${escHtml(rec.notes)}</div>` : ''}`,
    `${typeof canDo !== 'function' || canDo('delete') ? `<button class="btn btn-danger" onclick="deleteInspection('${escHtml(rec.id)}')">Delete</button>` : ''}
     <button class="btn btn-secondary" onclick="closeModal();${room ? `showRoomDetail('${escHtml(room.id)}')` : ''}">Back to room</button>`);
}

async function deleteInspection(id) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  const rec = (DB.inspections || []).find(x => x.id === id);
  if (!rec) return;
  showConfirm('Delete this inspection?',
    'The issues it raised stay in Complaints — they are real jobs, and deleting the inspection does not undo them.',
    async () => {
      DB.inspections = (DB.inspections || []).filter(x => x.id !== id);
      logActivity('Inspection Deleted', 'Room ' + (rec.roomNumber || '') + ' · ' + (rec.date || ''), 'Room');
      await saveDB();
      closeModal();
      if (typeof showRoomDetail === 'function' && rec.roomId) showRoomDetail(rec.roomId);
      toast('Inspection deleted', 'info');
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { INSPECTION_ITEMS, INSP_ITEM_CATEGORY, inspOverall, inspProblemWith, inspRead };
}
