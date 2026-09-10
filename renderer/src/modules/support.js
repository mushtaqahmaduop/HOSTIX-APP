/* ═══════════════════════════════════════════════════════════════════════════
   HOSTYLLO — HELP & SUPPORT
   Built 2026-09-10 to the owner's reference, `support.png`, in full.

   ── HOW EVERY BLOCK IS REAL ─────────────────────────────────────────────────
   The control plane's machine-facing surface is four endpoints — healthz,
   device register, device token, entitlement — and none of them is a ticket or
   an article. That is not a reason to draw the page dead; it is a reason to
   build each block out of something that exists on this computer.

     Knowledge base   SUP_ARTICLES below. Real articles about this app, written
                      against what it actually does, searchable, shipped in the
                      asar. No fetch, works with the cable out.
     Support tickets  Real records in DB.settings.supportTickets, with a real
                      reference (HS-####), a real status and a real history.
                      Submitting stores the ticket FIRST — so a warden's problem
                      is never lost to a failed send — then opens WhatsApp or
                      email carrying the ticket and the diagnostics.
     System status    The Connection panel's own four states, painted by
                      connRefresh(), so the two screens can never disagree.
     Get in touch     WhatsApp, email and telephone that really open, with the
                      licence key, Machine ID and version already written in.
     Quick resources  Every one leads somewhere that exists.

   ── THE ONE THING THE REFERENCE DRAWS THAT IS NOT HERE ──────────────────────
   "Video Tutorials · Watch Now". No video is bundled, the app opens no external
   player, and these hostels are frequently offline — so that tile would be a
   button that does nothing on the day it is needed. Its place in the row is
   taken by **Guided setup**, which re-runs first-run setup: the walkthrough
   this app really has. Flagged rather than swapped quietly.

   ── WHY THE SUPPORT NUMBER IS A SETTING AND NOT DISCOVERED ──────────────────
   control-plane.json is fetched from the internet daily and would be the tidy
   place for the vendor's contact details. It is deliberately not used for them:
   its contents would then be rendered into the app, so whoever controls that
   repository could change the number a hostel is told to ring. Its one job is
   naming an https base. Support contacts are local settings.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ── CONTACTS ─────────────────────────────────────────────────────────────── */

const SUP_FIELDS = [
  { key: 'supportWhatsApp', label: 'WhatsApp',  ico: 'phone', ph: '03XX-XXXXXXX' },
  { key: 'supportEmail',    label: 'Email',     ico: 'mail',  ph: 'support@example.com' },
  { key: 'supportPhone',    label: 'Telephone', ico: 'phone', ph: '0XX-XXXXXXX' },
  { key: 'supportHours',    label: 'Hours',     ico: 'clock', ph: 'Mon – Sat, 9am – 7pm' },
];

function supGet(key) { return String((DB.settings && DB.settings[key]) || '').trim(); }
function supAnyContact() {
  return ['supportWhatsApp', 'supportEmail', 'supportPhone'].some(k => supGet(k));
}

/* ── THE KNOWLEDGE BASE ──────────────────────────────────────────────────────
   Shipped, not fetched. Every article is about something this build actually
   does, and the five categories are the reference's own Popular chips.

   Bodies are arrays of plain paragraphs. No markup: they are rendered with
   escHtml(), because an article that could carry markup is an article that
   could carry a script the day somebody makes these editable. */
const SUP_CATS = ['Adding Students', 'Room Allotment', 'Fees & Payments', 'Reports', 'Backup & Restore'];

const SUP_ARTICLES = [
  { id: 'a-admit', cat: 'Adding Students', t: 'Admitting a student',
    b: ['Students → Add Student. Name, father\'s name and a room are the only required fields; everything else can be filled in later from the student\'s own record.',
        'The room list only offers rooms with a free bed. If the room you want is full, the form will say so and offer to add the student anyway — that is deliberate, and the room then shows as over capacity on the dashboard until somebody leaves.',
        'Gender is preselected from what the hostel was set up as, and nationality defaults to Pakistani. Change either on the form if the student is the exception.'] },
  { id: 'a-charges', cat: 'Adding Students', t: 'Where a student\'s monthly charge comes from',
    b: ['Nothing on the admission form sets the charge. It is resolved in one order every time: the student\'s own override, then their room type\'s rent and mess from Settings → Rent & Mess.',
        'That is why the Students register can show "not set" for a student in a room whose type has no rent yet. Set the room type\'s rent and every student in it is priced at once.'] },
  { id: 'a-cnic', cat: 'Adding Students', t: 'Why a CNIC shows as 17301-30*******',
    b: ['A CNIC is masked everywhere it is displayed, and on every export and printed sheet. Hold the cursor over it to see the whole number.',
        'The record itself is untouched — this is only how it is shown. The two edit forms show and save the real number.'] },

  { id: 'a-shift', cat: 'Room Allotment', t: 'Moving a student to another room',
    b: ['Open the student and choose Move or shift. The form records the date, the old room, the new one and the reason, and the rent follows the new room\'s type unless the student has an override.',
        'The move is kept in the student\'s room history, so a rent that changed mid-year can always be explained.'] },
  { id: 'a-bulk', cat: 'Room Allotment', t: 'Creating rooms a floor at a time',
    b: ['Rooms → Add in bulk. Give a floor, a room type, an optional prefix and a number range; the preview shows exactly which rooms will be created and which already exist.',
        'Numbers that already exist are skipped rather than duplicated, so the same range can be run twice safely.'] },
  { id: 'a-seats', cat: 'Room Allotment', t: 'Reading seat availability',
    b: ['The dashboard\'s Seat Availability card, and its Expand button, colour every room by one thing: how many beds are left. Green means space, red means full, amber means more students than beds.',
        'Amber is not an error. The app lets a room be over-filled on purpose, after asking — the colour is there so it is never a surprise.'] },

  { id: 'a-collect', cat: 'Fees & Payments', t: 'Recording a payment',
    b: ['Payments → Add Payment, or the Add Payment tile on the dashboard. Search the student by name, room or CNIC.',
        'The month\'s charge is filled in from Settings. Enter what was actually handed over in Amount Paid — a partial payment is normal and the balance is carried as unpaid.',
        'Payment method is Cash unless you change it.'] },
  { id: 'a-arrears', cat: 'Fees & Payments', t: 'Collecting an old month\'s balance',
    b: ['An unpaid record from an earlier month rides along in the current month\'s register, so it can be collected at the desk without going back a month.',
        'Money taken against an earlier month is posted to THAT month, not to this one. The receipt shows both: this month\'s payment, and the arrears received alongside it.'] },
  { id: 'a-receipt', cat: 'Fees & Payments', t: 'Receipts and receipt numbers',
    b: ['A receipt number is assigned the first time a receipt is opened, and never changes afterwards — reprinting the same payment gives the same number.',
        'Search the Payments register by that number to find the payment it belongs to.',
        'The hostel logo, address and phone come from Settings → Hostel Info.'] },

  { id: 'a-export', cat: 'Reports', t: 'Exporting to Excel or PDF',
    b: ['Every register has an Export button offering both. The document carries exactly the rows the filters on screen are showing, and states those filters in its header.',
        'Excel cells hold real numbers, not text, so they sum and sort. Currency is a number format, so the figure is 17000 and the column shows Rs. 17,000.00.'] },
  { id: 'a-pdfopen', cat: 'Reports', t: 'A downloaded PDF will not open',
    b: ['The app writes the file and then asks Windows to open it with whatever is set as the default PDF handler. If nothing opens, the file is still saved — the app shows it in its folder.',
        'An out-of-date browser set as the PDF handler is the usual cause. Updating it, or right-clicking the file and choosing a different application, resolves it.'] },
  { id: 'a-reports', cat: 'Reports', t: 'What the Reports page is counting',
    b: ['Every figure on Reports is derived from the payment records for the month picked at the top of the page. Nothing is stored as a total, so a corrected payment corrects the report immediately.',
        'Collections count money received in that month. Outstanding counts what is still owed on that month\'s records.'] },

  { id: 'a-backup', cat: 'Backup & Restore', t: 'Taking a backup',
    b: ['Backup & Restore → Create backup writes one file containing everything: students, rooms, payments, expenses, settings and users.',
        'Keep it somewhere that is not this computer. A backup on the same disk does not survive the thing backups exist for.'] },
  { id: 'a-restore', cat: 'Backup & Restore', t: 'Restoring, and what it replaces',
    b: ['Restoring REPLACES everything currently in the app with what is in the file. It is not a merge.',
        'Take a fresh backup first. Then, if the restored file turns out to be the wrong one, the current state is still recoverable.'] },
  { id: 'a-where', cat: 'Backup & Restore', t: 'Where the data actually lives',
    b: ['In a database file on this computer, in the application\'s own folder. Nothing about your hostel is stored anywhere else, and nothing is sent anywhere.',
        'Which means the only copy is on this machine until you take a backup.'] },
];

/* ── TICKETS ─────────────────────────────────────────────────────────────────
   Held in DB.settings.supportTickets. Settings is already one JSON document
   that saveDB() persists, so a ticket needs no table and no migration — and a
   handful of tickets per hostel is nothing beside the room list already in
   there.

   THE RECORD IS WRITTEN BEFORE ANYTHING IS SENT. A warden typing out a problem
   at 11pm on a bad connection must not lose it because WhatsApp did not open.
   The send is the second step and can be repeated from the list. */
const SUP_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const SUP_STATES = {
  open:     { label: 'Open',        hue: 'dh-blue' },
  progress: { label: 'In Progress', hue: 'dh-amber' },
  resolved: { label: 'Resolved',    hue: 'dh-green' },
  closed:   { label: 'Closed',      hue: 'dh-slate' },
};

function supTickets() {
  if (!DB.settings.supportTickets) DB.settings.supportTickets = [];
  return DB.settings.supportTickets;
}

/** HS-2478 in the reference. Sequential per install, never reused. */
function supNextRef() {
  const n = Number(DB.settings.supportTicketSeq || 0) + 1;
  DB.settings.supportTicketSeq = n;
  return 'HS-' + String(2400 + n);
}

function supAgo(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return 'Created today';
  if (d === 1) return 'Created yesterday';
  if (d < 7)  return 'Created ' + d + ' days ago';
  if (d < 14) return 'Created 1 week ago';
  if (d < 60) return 'Created ' + Math.floor(d / 7) + ' weeks ago';
  return 'Created ' + fmtDate(iso.slice(0, 10));
}

/* ── DIAGNOSTICS ─────────────────────────────────────────────────────────────
   One block, one fact per line, plain text — it gets pasted into WhatsApp.

   IT CARRIES NO CREDENTIAL. The licence key identifies the installation and is
   on the customer's own invoice; the Machine ID is a hash. The device token and
   the signed entitlement are not here and must never be — those are replayable,
   which is why window.online hands over a DESCRIPTION of the entitlement rather
   than the entitlement itself.

   Every method on window.online is an IPC bridge and returns a promise, so all
   of this is awaited. Read synchronously they yield undefined for every field,
   which is exactly the sort of thing that gets pasted without being noticed. */
async function supDiagnostics() {
  const lic = window._hostyllo_license_cache || {};
  let st = {}, ent = {};
  try { if (window.online && window.online.getStatus)   st  = (await window.online.getStatus())   || {}; } catch (e) {}
  try { if (window.online && window.online.entitlement) ent = (await window.online.entitlement()) || {}; } catch (e) {}
  return [
    'Hostyllo Offline — support details',
    'Hostel: '      + (DB.settings.hostelName || 'not named'),
    'Version: '     + (window._hostyllo_app_ver || 'unknown'),
    'Licence key: ' + (lic.key || 'not activated'),
    'Machine ID: '  + (window._hostyllo_machine_id || 'unavailable'),
    'Licence: '     + (lic.valid ? 'valid' : ('invalid — ' + (lic.reason || 'unknown')))
                    + (lic.expiry ? ', expires ' + fmtDate(lic.expiry) : ''),
    'Entitlement: ' + (ent.state || 'NONE'),
    'Connection: '  + (st.mode || 'unknown')
                    + (st.lastSuccessAt ? ', last reached ' + supWhen(st.lastSuccessAt) : ', never reached'),
    'Records: '     + (DB.students || []).length + ' students, '
                    + (DB.rooms || []).length + ' rooms, '
                    + (DB.payments || []).length + ' payments',
    'Taken: '       + new Date().toISOString(),
  ].join('\n');
}

function supWhen(ms) {
  if (!ms) return 'never';
  const d = new Date(Number(ms));
  if (isNaN(d.getTime())) return 'never';
  return fmtDate(ymd(d)) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

async function supCopyDiagnostics(btn) {
  try {
    await navigator.clipboard.writeText(await supDiagnostics());
    toast('Support details copied — paste them into your message', 'success');
    if (btn) {
      const was = btn.innerHTML;
      btn.innerHTML = icon('check', 'xs') + 'Copied';
      setTimeout(() => { btn.innerHTML = was; }, 1600);
    }
  } catch (e) {
    toast('Could not reach the clipboard on this machine', 'error');
  }
}

/* Open a channel with a message already in it. The three routes are one
   function so they cannot drift — a WhatsApp message that carries the Machine
   ID and an email that does not is the sort of difference nobody notices until
   support has to ask twice. */
/** @returns {Promise<boolean>} whether a channel was actually opened. The
 *  caller needs to know: a ticket must not be stamped as sent because the
 *  attempt was made, only because something was there to send it with. */
async function supReach(kind, ticketId) {
  const diag = await supDiagnostics();
  const t = ticketId ? supTickets().find(x => x.id === ticketId) : null;
  const body = t
    ? ['Support request ' + t.ref, 'Category: ' + t.category, 'Priority: ' + t.priority,
       'Subject: ' + t.subject, '', t.description, '', '---', diag].join('\n')
    : diag;

  if (kind === 'whatsapp') {
    const raw = supGet('supportWhatsApp');
    if (!raw) { supNoContact(); return false; }
    const num = raw.replace(/[^0-9]/g, '').replace(/^0/, '92');
    openExternalLink('whatsapp://send?phone=' + num + '&text=' + encodeURIComponent(body));
    return true;
  }
  if (kind === 'email') {
    const to = supGet('supportEmail');
    if (!to) { supNoContact(); return false; }
    const subj = t ? ('Hostyllo ' + t.ref + ' — ' + t.subject)
                   : ('Hostyllo support — ' + (DB.settings.hostelName || 'hostel'));
    openExternalLink('mailto:' + encodeURIComponent(to)
      + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body));
    return true;
  }
  if (kind === 'phone') {
    const num = supGet('supportPhone');
    if (!num) { supNoContact(); return false; }
    /* A telephone cannot be handed a diagnostic block, so it goes on the
       clipboard instead and the warden reads it out. */
    await supCopyDiagnostics(null);
    openExternalLink('tel:' + num.replace(/[^0-9+]/g, ''));
    return true;
  }
  return false;
}

/* Says so and stops. It used to open the contacts editor as well, which put a
   modal over the ticket a warden had just submitted — an interruption, at the
   one moment they were least in the mood for one. The empty Get-in-touch card
   already offers the editor, and the request list says "not sent yet". */
function supNoContact() {
  toast('No support contact is set for this installation yet — the request is saved', 'info');
}

/** The first route this installation actually has, in the order a hostel would
 *  reach for them. `null` when none is set. */
function supBestRoute() {
  if (supGet('supportWhatsApp')) return 'whatsapp';
  if (supGet('supportEmail'))    return 'email';
  if (supGet('supportPhone'))    return 'phone';
  return null;
}

/* ── THE CONTACT EDITOR ──────────────────────────────────────────────────────
   On this page rather than buried in Settings, because the person who needs to
   fill it in is the one who just found the card empty. Behind the `settings`
   permission — it changes who a whole hostel is told to telephone. */
function supEditContacts() {
  if (typeof requirePerm === 'function' && !requirePerm('settings')) return;
  showModal('modal-sm',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('helpCircle', 'sm')}</div>
       <div><div class="hf-mh__t">Support contacts</div>
       <div class="hf-mh__s">Who this hostel reaches when something is wrong. Set once, per installation.</div></div>
     </div>`,
    `<div class="hf-form">
      ${SUP_FIELDS.map(f => `
        <div class="field">
          <label for="sup-${f.key}">${escHtml(f.label)}</label>
          <div class="hf-in"><span class="hf-in__i">${icon(f.ico, 'sm')}</span>
            <input class="form-control" id="sup-${f.key}" maxlength="80"
                   value="${escHtml(supGet(f.key))}" placeholder="${escHtml(f.ph)}"></div>
        </div>`).join('')}
      <div class="hi-note">Leave any of them blank and the page simply does not offer that route.</div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="supSaveContacts()">Save</button>`);
}

async function supSaveContacts() {
  if (typeof requirePerm === 'function' && !requirePerm('settings')) return;
  SUP_FIELDS.forEach(f => {
    const el = document.getElementById('sup-' + f.key);
    if (!el) return;
    const v = String(el.value || '').trim();
    if (v) DB.settings[f.key] = v; else delete DB.settings[f.key];
  });
  await saveDB();
  logActivity('Support Contacts Updated', DB.settings.hostelName || '', 'Settings');
  closeModal();
  renderPage('support');
  toast('Support contacts saved', 'success');
}

/* ── ARTICLES ────────────────────────────────────────────────────────────── */

let supQuery = '';
let supCat   = 'All';

function supSearch(v) { supQuery = String(v || ''); supBrowse(); }

function supMatches() {
  const q = supQuery.trim().toLowerCase();
  return SUP_ARTICLES.filter(a => {
    if (supCat !== 'All' && a.cat !== supCat) return false;
    if (!q) return true;
    return (a.t + ' ' + a.cat + ' ' + a.b.join(' ')).toLowerCase().includes(q);
  });
}

/** The article list, as a modal. `cat` preselects one of the Popular chips. */
function supBrowse(cat) {
  if (cat !== undefined) { supCat = cat; supQuery = ''; }
  const hits = supMatches();
  const body = `
    <div class="sup-kb">
      <div class="lk-search sup-kb__s">
        ${icon('search', 'xs')}
        <input id="sup-kb-q" class="lk-sin" placeholder="Search the guides…"
               value="${escHtml(supQuery)}" oninput="supSearch(this.value)">
      </div>
      <div class="sup-chips">
        <button class="sup-chip${supCat === 'All' ? ' is-on' : ''}" onclick="supBrowse('All')">All</button>
        ${SUP_CATS.map(c => `<button class="sup-chip${supCat === c ? ' is-on' : ''}"
            onclick="supBrowse('${escHtml(c)}')">${escHtml(c)}</button>`).join('')}
      </div>
      <div class="sup-kb__list">
        ${hits.length ? hits.map(a => `
          <button type="button" class="sup-art" onclick="supArticle('${escHtml(a.id)}')">
            <span class="sup-art__i">${icon('fileText', 'sm')}</span>
            <span class="sup-art__b">
              <span class="sup-art__t">${escHtml(a.t)}</span>
              <span class="sup-art__s">${escHtml(a.cat)}</span>
            </span>
          </button>`).join('')
        : `<div class="sup-empty__s">Nothing matches “${escHtml(supQuery)}”. Try a shorter word, or ask support — the button is on the page behind this one.</div>`}
      </div>
    </div>`;

  const open = document.getElementById('sup-kb-q');
  if (open) {
    /* Re-rendering the whole modal on every keystroke would take the focus out
       of the box being typed in. Only the list and the chips are replaced. */
    const host = document.querySelector('.sup-kb');
    if (host) {
      const q = document.getElementById('sup-kb-q');
      const at = q ? q.selectionStart : null;
      host.outerHTML = body;
      const q2 = document.getElementById('sup-kb-q');
      if (q2) { q2.focus(); if (at !== null) q2.setSelectionRange(at, at); }
      return;
    }
  }

  showModal('modal-md',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('fileText', 'sm')}</div>
       <div><div class="hf-mh__t">Knowledge base</div>
       <div class="hf-mh__s">${SUP_ARTICLES.length} guides, shipped with the app — they work with the cable out.</div></div>
     </div>`,
    body,
    `<button class="btn btn-primary" onclick="closeModal()">Close</button>`);
}

function supArticle(id) {
  const a = SUP_ARTICLES.find(x => x.id === id);
  if (!a) return;
  showModal('modal-md',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('fileText', 'sm')}</div>
       <div><div class="hf-mh__t">${escHtml(a.t)}</div>
       <div class="hf-mh__s">${escHtml(a.cat)}</div></div>
     </div>`,
    `<div class="sup-doc">${a.b.map(p => `<p>${escHtml(p)}</p>`).join('')}</div>`,
    `<button class="btn btn-secondary" onclick="supBrowse()">${icon('arrowLeft', 'xs')}All guides</button>
     <button class="btn btn-primary" onclick="closeModal()">Close</button>`);
}

/* ── KEYBOARD SHORTCUTS ──────────────────────────────────────────────────────
   Every line is a key this build really listens for. */
const SUP_KEYS = [
  ['Ctrl + K', 'Open the command palette'],
  ['Escape',   'Close whatever is open — a modal, a slide-over, a menu'],
  ['Ctrl + P', 'Print the document a report window is showing'],
  ['Tab',      'Move through a form in the order it reads'],
];

function supShortcuts() {
  showModal('modal-sm',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('code', 'sm')}</div>
       <div><div class="hf-mh__t">Keyboard shortcuts</div>
       <div class="hf-mh__s">Every one of these is bound in this build.</div></div>
     </div>`,
    `<div class="sup-keys">${SUP_KEYS.map(k =>
      `<div class="sup-key"><kbd>${escHtml(k[0])}</kbd><span>${escHtml(k[1])}</span></div>`).join('')}</div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Close</button>`);
}

/* ── SUBMITTING A TICKET ─────────────────────────────────────────────────── */

async function supSubmitTicket() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const subject = g('sup-t-subject').trim();
  if (!subject) { toast('Give it a short subject', 'error'); document.getElementById('sup-t-subject')?.focus(); return; }
  const category = g('sup-t-cat') || 'General';
  const priority = g('sup-t-prio') || 'Medium';
  const description = g('sup-t-desc').trim();

  const t = {
    id: 'st_' + uid(),
    ref: supNextRef(),
    category, priority, subject, description,
    status: 'open',
    createdAt: new Date().toISOString(),
    createdBy: (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) || '',
    sentAt: null, sentVia: '',
    /* The diagnostics AS THEY WERE when the problem happened. Reading them
       again a week later describes a machine that has since been restarted,
       reconnected and updated — which is not the machine the ticket is about. */
    diagnostics: await supDiagnostics(),
  };
  supTickets().unshift(t);
  await saveDB();
  logActivity('Support Ticket Raised', t.ref + ' — ' + subject, 'Settings');
  renderPage('support');
  toast('Ticket ' + t.ref + ' saved on this computer', 'success');

  /* Saved first, sent second. If nothing is configured to send it with, the
     ticket still exists, the list says "not sent yet", and every row offers
     Send again once a contact is set. */
  await supSendTicket(t.id);
}

async function supSendTicket(id, kind) {
  const t = supTickets().find(x => x.id === id);
  if (!t) return false;
  const route = kind || supBestRoute();
  if (!route) { supNoContact(); return false; }
  /* STAMPED ONLY IF SOMETHING OPENED. Marking a ticket sent because the
     attempt was made is how a warden ends up believing support has their
     problem when nothing ever left the machine. */
  const opened = await supReach(route, id);
  if (!opened) return false;
  t.sentAt = new Date().toISOString();
  t.sentVia = route;
  await saveDB();
  return true;
}

function supTicketMenu(id) {
  const t = supTickets().find(x => x.id === id);
  if (!t) return;
  const st = SUP_STATES[t.status] || SUP_STATES.open;
  showModal('modal-sm',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('list', 'sm')}</div>
       <div><div class="hf-mh__t">${escHtml(t.ref)} — ${escHtml(t.subject)}</div>
       <div class="hf-mh__s">${escHtml(t.category)} · ${escHtml(t.priority)} priority · ${escHtml(supAgo(t.createdAt))}</div></div>
     </div>`,
    `<div class="sup-doc">
       ${t.description ? `<p>${escHtml(t.description)}</p>` : '<p class="is-empty">No description was written.</p>'}
       <div class="sup-tstate">
         <span class="sup-row__l">Status</span>
         <select class="form-control" id="sup-t-state">
           ${Object.keys(SUP_STATES).map(k =>
             `<option value="${k}" ${t.status === k ? 'selected' : ''}>${escHtml(SUP_STATES[k].label)}</option>`).join('')}
         </select>
       </div>
       <div class="hi-note">${t.sentAt
          ? 'Sent ' + escHtml(supAgo(t.sentAt).replace('Created ', '')) + ' by ' + escHtml(t.sentVia)
          : 'Not sent yet — this ticket exists only on this computer.'}</div>
       <details class="sup-diag"><summary>Details recorded with this ticket</summary><pre>${escHtml(t.diagnostics || '')}</pre></details>
     </div>`,
    `<button class="btn btn-secondary" onclick="supDeleteTicket('${escHtml(t.id)}')">${icon('trash', 'xs')}Delete</button>
     <button class="btn btn-secondary" onclick="supSendTicket('${escHtml(t.id)}')">${icon('upload', 'xs')}Send again</button>
     <button class="btn btn-primary" onclick="supSaveTicketState('${escHtml(t.id)}')">Save</button>`);
}

async function supSaveTicketState(id) {
  const t = supTickets().find(x => x.id === id);
  if (!t) return;
  const v = (document.getElementById('sup-t-state') || {}).value;
  if (v && SUP_STATES[v]) t.status = v;
  await saveDB();
  closeModal();
  renderPage('support');
  toast('Ticket updated', 'success');
}

function supDeleteTicket(id) {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  const t = supTickets().find(x => x.id === id);
  if (!t) return;
  showConfirm('Delete ' + t.ref + '?', 'The record of this request is removed from this computer. Anything already sent to support is unaffected.',
    async () => {
      DB.settings.supportTickets = supTickets().filter(x => x.id !== id);
      await saveDB();
      closeModal();
      renderPage('support');
      toast('Ticket deleted', 'info');
    });
}

let supShowAllTickets = false;
function supToggleAllTickets() { supShowAllTickets = !supShowAllTickets; renderPage('support'); }

/* ── THE PAGE ───────────────────────────────────────────────────────────── */

function renderSupport() {
  // The main-process facts land through supRefresh(); the frame does not wait.
  setTimeout(supRefresh, 40);

  const lic  = window._hostyllo_license_cache || {};
  const s    = DB.settings;
  const all  = supTickets();
  const list = supShowAllTickets ? all : all.slice(0, 4);
  const hours = supGet('supportHours');

  const row = (label, value, o) => {
    o = o || {};
    return `<div class="sup-row"${o.id ? ` id="${o.id}"` : ''}>
      <span class="sup-row__l">${escHtml(label)}</span>
      <span class="sup-row__v${o.mono ? ' is-mono' : ''}">${escHtml(value)}</span>
    </div>`;
  };

  const bigCard = (ico, hue, title, sub, cta, onclick) => `
    <button type="button" class="sup-big" onclick="${onclick}">
      <span class="sup-big__i ${hue}">${icon(ico, 'md')}</span>
      <span class="sup-big__t">${escHtml(title)}</span>
      <span class="sup-big__s">${escHtml(sub)}</span>
      <span class="sup-big__a">${escHtml(cta)} ${icon('chevronDown', 'xs')}</span>
    </button>`;

  const contact = (kind, label, value, sub) => `
    <button type="button" class="sup-touch" onclick="supReach('${kind}')">
      <span class="sup-touch__i">${kind === 'whatsapp' ? waMark(16) : icon(kind === 'email' ? 'mail' : 'phone', 'sm')}</span>
      <span class="sup-touch__b">
        <span class="sup-touch__t">${escHtml(label)}</span>
        <span class="sup-touch__v">${escHtml(value)}</span>
        ${sub ? `<span class="sup-touch__s">${escHtml(sub)}</span>` : ''}
      </span>
      ${''/* No right-facing chevron in the icon set, and one row is not a
             reason to add one — chevronDown, turned. */}
      <span class="sup-touch__go">${icon('chevronDown', 'xs')}</span>
    </button>`;

  const quick = (ico, title, sub, onclick) => `
    <button type="button" class="sup-res" onclick="${onclick}">
      <span class="sup-res__i">${icon(ico, 'sm')}</span>
      <span class="sup-res__b">
        <span class="sup-res__t">${escHtml(title)}</span>
        <span class="sup-res__s">${escHtml(sub)}</span>
      </span>
    </button>`;

  return `
  <div class="sup">

    <!-- ══ HERO ══ -->
    <div class="sup-hero">
      <div class="sup-hero__b">
        <span class="sup-hero__k">How can we help?</span>
        <div class="sup-hero__t">Hello, how can we assist you today?</div>
        <div class="sup-hero__s">Search the guides, contact support, or raise a request.</div>
        <div class="sup-hero__find">
          ${icon('search', 'sm')}
          <input class="sup-hero__in" id="sup-find" placeholder="Search for articles, topics or guides…"
                 onkeydown="if(event.key==='Enter'){supQuery=this.value;supCat='All';supBrowse();}">
          <button class="sup-hero__go" onclick="supQuery=document.getElementById('sup-find').value;supCat='All';supBrowse()">
            ${icon('search', 'xs')}</button>
        </div>
        <div class="sup-pop">
          <span class="sup-pop__l">Popular:</span>
          ${SUP_CATS.map(c => `<button class="sup-chip" onclick="supBrowse('${escHtml(c)}')">${escHtml(c)}</button>`).join('')}
        </div>
      </div>
      <div class="sup-hero__art" aria-hidden="true">${icon('helpCircle', 'lg')}</div>
    </div>

    <!-- ══ THE THREE CARDS ══ -->
    <div class="sup-bigs">
      ${bigCard('fileText', 'dh-blue', 'Knowledge base',
        'Browse our guides and step-by-step articles', 'Browse articles', 'supBrowse("All")')}
      ${''/* THE REFERENCE DRAWS "Video Tutorials · Watch Now" HERE. No video is
             bundled, the app opens no external player, and these hostels are
             frequently offline — so that tile would be a button that does
             nothing on the day it is needed. Guided setup is the walkthrough
             this app really has. Owner told, not swapped quietly. */}
      ${bigCard('check', 'dh-violet', 'Guided setup',
        'Walk through hostel details, charges and rooms again', 'Start walkthrough', 'openSetupAgain()')}
      ${bigCard('shieldCheck', 'dh-green', 'System status',
        'Check this installation and whether services are reachable', 'View status',
        "document.getElementById('sup-status-card').scrollIntoView({behavior:'smooth',block:'center'})")}
    </div>

    <div class="sup-split">
      <div class="sup-main">

        <!-- ══ RAISE A REQUEST ══ -->
        <div class="set-card">
          <div class="set-head">
            <div class="set-head__ico dh-blue">${icon('upload', 'md')}</div>
            <div class="set-head__mid">
              <div class="set-head__t">Submit a support request</div>
              <div class="set-head__s">Saved on this computer first, then sent — so nothing is lost if the message will not go.</div>
            </div>
          </div>
          <div class="hf-g2">
            <div class="field">
              <label for="sup-t-cat">Category</label>
              <div class="hf-in"><span class="hf-in__i">${icon('tag', 'sm')}</span>
                <select class="form-control" id="sup-t-cat">
                  ${SUP_CATS.concat(['Licensing', 'Something else']).map(c =>
                    `<option>${escHtml(c)}</option>`).join('')}
                </select></div>
            </div>
            <div class="field">
              <label for="sup-t-prio">Priority</label>
              <div class="hf-in"><span class="hf-in__i">${icon('warning', 'sm')}</span>
                <select class="form-control" id="sup-t-prio">
                  ${SUP_PRIORITIES.map(p =>
                    `<option ${p === 'Medium' ? 'selected' : ''}>${escHtml(p)}</option>`).join('')}
                </select></div>
            </div>
            <div class="field col-full">
              <label for="sup-t-subject">Subject<span class="req"> *</span></label>
              <div class="hf-in"><span class="hf-in__i">${icon('edit', 'sm')}</span>
                <input class="form-control" id="sup-t-subject" maxlength="90"
                       placeholder="Short description of your issue"></div>
            </div>
            <div class="field col-full">
              <label for="sup-t-desc">Description</label>
              <div class="hf-in hf-in--top"><span class="hf-in__i">${icon('fileText', 'sm')}</span>
                <textarea class="form-control" id="sup-t-desc" rows="4" maxlength="2000"
                          placeholder="What happened, and what you were doing when it did"></textarea></div>
            </div>
          </div>
          ${''/* THE REFERENCE HAS AN ATTACH FILE BUTTON. There is nowhere to
                 put a file — no ticket API and no attachment store — and a
                 screenshot that silently goes nowhere is worse than no button.
                 What the ticket DOES carry is the diagnostics, automatically,
                 which is what most attachments would have been for. */}
          <div class="sup-note">${icon('info', 'xs')}<span>Your licence key, Machine ID, version
            and connection state are attached automatically. Nothing else about your hostel is sent.</span></div>
          <div class="sup-actions">
            <button class="btn btn-primary" onclick="supSubmitTicket()">${icon('upload', 'xs')}Submit request</button>
          </div>
        </div>

        <!-- ══ MY REQUESTS ══ -->
        <div class="set-card">
          <div class="set-head">
            <div class="set-head__ico dh-violet">${icon('list', 'md')}</div>
            <div class="set-head__mid">
              <div class="set-head__t">My support requests</div>
              <div class="set-head__s">Every request raised on this computer, and where each one stands.</div>
            </div>
            ${all.length > 4 ? `<div class="set-head__end">
              <button class="set-btn" onclick="supToggleAllTickets()">
                ${supShowAllTickets ? 'Show recent' : 'View all (' + all.length + ')'}</button>
            </div>` : ''}
          </div>
          ${list.length ? `<div class="sup-tix">${list.map(t => {
            const st = SUP_STATES[t.status] || SUP_STATES.open;
            return `<button type="button" class="sup-tix__r" onclick="supTicketMenu('${escHtml(t.id)}')">
              <span class="sup-tix__i">${icon('fileText', 'sm')}</span>
              <span class="sup-tix__b">
                <span class="sup-tix__h"><b>#${escHtml(t.ref)}</b><span>${escHtml(t.category)}</span></span>
                <span class="sup-tix__t">${escHtml(t.subject)}</span>
                <span class="sup-tix__s">${escHtml(supAgo(t.createdAt))}${t.sentAt ? '' : ' · not sent yet'}</span>
              </span>
              <span class="lk-chip ${st.hue}">${escHtml(st.label)}</span>
              <span class="sup-touch__go">${icon('chevronDown', 'xs')}</span>
            </button>`;
          }).join('')}</div>`
          : `<div class="sup-empty">
               <div class="sup-empty__t">Nothing raised yet</div>
               <div class="sup-empty__s">Requests you submit above are kept here, with their reference and status, whether or not they have been sent.</div>
             </div>`}
        </div>

        ${''/* ══ SYSTEM STATUS ══
               THE CONNECTION PANEL ITSELF, not a copy. connRefresh() paints
               `#conn-sum` and `#conn-body`, so this card declares those two ids
               and calls it. Only one page is in the DOM at a time, so the ids
               cannot collide — and reusing the renderer is the only way to be
               sure two screens describing the same four states can never start
               describing them differently. */}
        <div class="set-card" id="sup-status-card">
          <div class="set-head">
            <div class="set-head__ico dh-green">${setIco(SET_ICO.wifi, 17)}</div>
            <div class="set-head__mid">
              <div class="set-head__t">System status</div>
              <div class="set-head__s">Four separate questions, answered separately. One light could not tell you which of them is the problem.</div>
            </div>
            <div class="set-head__end" id="conn-sum"></div>
          </div>
          <div id="conn-body"><div class="lic-enforce__wait">Checking…</div></div>
        </div>

        <!-- ══ THIS INSTALLATION ══ -->
        <div class="set-card">
          <div class="set-head">
            <div class="set-head__ico dh-slate">${icon('shieldCheck', 'md')}</div>
            <div class="set-head__mid">
              <div class="set-head__t">This installation</div>
              <div class="set-head__s">The facts a support call opens with. One button copies all of them.</div>
            </div>
            <div class="set-head__end">
              <button class="set-btn" onclick="supCopyDiagnostics(this)">${icon('copy', 'xs')}Copy</button>
            </div>
          </div>
          <div class="sup-grid">
            ${row('Hostel', s.hostelName || 'Not named yet')}
            ${row('App version', 'Reading…', { id: 'sup-ver' })}
            ${row('Licence key', lic.key ? _licMaskKey(lic.key) : 'Not activated', { mono: true })}
            ${row('Machine ID', 'Reading…', { mono: true, id: 'sup-machine' })}
            ${row('Licence', lic.valid
                ? ('Valid' + (lic.expiry ? ' until ' + fmtDate(lic.expiry) : ''))
                : ('Not valid — ' + (lic.reason || 'unknown')))}
            ${row('Entitlement', 'Reading…', { id: 'sup-ent' })}
            ${row('Records on file',
                (DB.students || []).length + ' students · ' +
                (DB.rooms || []).length + ' rooms · ' +
                (DB.payments || []).length + ' payments')}
          </div>
        </div>
      </div>

      <!-- ══ RAIL ══ -->
      <aside class="sup-rail">
        <div class="set-card">
          <div class="hi-id__head">
            <div class="hi-id__ttl">${icon('phone', 'sm')}Get in touch</div>
            <button class="set-btn set-btn--sm" onclick="supEditContacts()">${icon('edit', 'xs')}${supAnyContact() ? 'Edit' : 'Set'}</button>
          </div>
          ${supAnyContact() ? `
            ${supGet('supportWhatsApp') ? contact('whatsapp', 'WhatsApp support', supGet('supportWhatsApp'), hours) : ''}
            ${supGet('supportEmail')    ? contact('email',    'Email support',    supGet('supportEmail'), 'Your details are written into the message') : ''}
            ${supGet('supportPhone')    ? contact('phone',    'Telephone',        supGet('supportPhone'), hours) : ''}
          ` : `
            <div class="sup-empty">
              <div class="sup-empty__t">No support contact is set yet</div>
              <div class="sup-empty__s">Whoever installed Hostyllo here can add the number and email this hostel should reach. Requests you raise are still kept until then.</div>
              <button class="set-btn hi-wide" onclick="supEditContacts()">${icon('settings', 'xs')}Set them now</button>
            </div>`}
        </div>

        <div class="set-card">
          <div class="hi-id__head"><div class="hi-id__ttl">${icon('zap', 'sm')}Quick resources</div></div>
          <div class="sup-res-list">
            ${quick('fileText', 'Getting started guide', 'Learn the basics of Hostyllo', "supBrowse('Adding Students')")}
            ${quick('key', 'Licence and Machine ID', 'The License tab, in full', "settingsTab='license';navigate('settings')")}
            ${quick('code', 'Keyboard shortcuts', 'The four this build listens for', 'supShortcuts()')}
            ${quick('archive', 'Backup and restore', 'Take a copy before you change anything', "navigate('backup')")}
            ${quick('list', 'Activity log', 'What this hostel did, and who did it', "navigate('activitylog')")}
          </div>
        </div>

        <div class="set-card sup-urgent">
          <div class="hi-id__head"><div class="hi-id__ttl">${icon('warning', 'sm')}Need urgent help?</div></div>
          ${supGet('supportPhone') ? `
            <button class="sup-urgent__n" onclick="supReach('phone')">${icon('phone', 'sm')}${escHtml(supGet('supportPhone'))}</button>
            ${hours ? `<div class="sup-urgent__h">${escHtml(hours)}</div>` : ''}
          ` : `<p class="sup-urgent__p">No priority line is set for this installation yet.</p>`}
          <p class="sup-urgent__p">Press <b>Copy</b> on <b>This installation</b> before you call. Those
            three facts are what every call opens with, and they are the difference between one call
            and three.</p>
          <p class="sup-urgent__p">If the app is refusing to save, open the <b>License tab</b>: an expired
            licence goes read-only on purpose and says so. Nothing has been lost.</p>
        </div>
      </aside>
    </div>

    <div class="sup-foot">
      ${icon('shieldCheck', 'sm')}
      <span>Everything on this page is read from this computer. Nothing about your hostel leaves it
        unless you press Submit, WhatsApp, email or telephone.</span>
    </div>
  </div>`;
}

/* The facts that live outside the renderer. Painted after the frame so a slow
   IPC call cannot hold up the page, and each one replaces its own row so a
   failure leaves the rest of the card intact — the same shape licRefresh()
   uses on the License tab, for the same reason. */
async function supRefresh() {
  const put = (id, text) => {
    const host = document.getElementById(id);
    if (!host) return;
    const el = host.querySelector('.sup-row__v');
    if (el) el.textContent = text;
  };

  let v = 'Unavailable';
  try { if (typeof appVersionString === 'function') v = await appVersionString(); } catch (e) {}
  window._hostyllo_app_ver = v;
  put('sup-ver', v);

  let shown = 'Unavailable in this build';
  if (window.licenseAPI && window.licenseAPI.getMachineId) {
    try {
      const id = await window.licenseAPI.getMachineId();
      window._hostyllo_machine_id = id || '';
      shown = id ? (id.length > 20 ? id.slice(0, 20) + '…' : id) : 'Unavailable';
    } catch (e) { shown = 'Unavailable'; }
  }
  put('sup-machine', shown);

  let word = 'Unavailable';
  try {
    // Awaited — window.online is an IPC bridge; see supDiagnostics().
    const e = (window.online && window.online.entitlement)
      ? await window.online.entitlement() : null;
    /* NONE is not a fault. It is what a machine that has never reached the
       control plane holds, and that machine is running perfectly on its local
       licence file — so it must not read as an error. */
    word = !e || !e.state ? 'Unavailable'
         : e.state === 'NONE'  ? 'None yet — running on the local licence'
         : e.state === 'STALE' ? 'Cached, past its window — running on the local licence'
         : e.state;
  } catch (e) {}
  put('sup-ent', word);

  // The Connection panel's own renderer paints the four states — see the card.
  if (typeof connRefresh === 'function') { try { await connRefresh(); } catch (e) {} }
}
