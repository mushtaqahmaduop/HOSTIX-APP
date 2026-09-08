/* ════════════════════════════════════════════════════════════════════════════
   BACKUP & RESTORE — the page, built 2026-09-08 to `backup.png` and
   `backup and restore.png`.

   IT WAS A MODAL. Backup & Restore is the only thing in the SYSTEM group of
   the rail that opened a dialog instead of a screen, and a dialog is the wrong
   container for it: the references give it a stat strip, two histories and a
   settings surface, none of which fits in a box you dismiss. `navigate('backup')`
   renders this; the old `showBackupRestoreModal()` is kept and now opens the
   page, because the command palette and two menu items still call it.

   WHAT IS LIVE AND WHAT IS LOCKED. The owner's rule of 2026-09-08: a control
   the reference draws that has no feature behind it is drawn, locked, and
   explained — never dropped.

     Live   · the four counters and the payload size, measured off the same
              serialisation saveDB() writes
            · Create & download backup, and Preview data
            · Restore from a file, by picker or by drop, and from pasted JSON
            · Backup history and restore history — NEW, and recorded from the
              moment this page shipped: every export and every restore writes
              one row. Older activity is not invented; the tables say so.
     Locked · everything about AUTOMATIC backup — frequency, time, keep-last,
              folder, on-failure behaviour, encryption, include/exclude. None
              of it exists: this app writes a backup when a person presses the
              button, and nothing schedules, encrypts or files one. Writing a
              file to a folder of the customer's choosing needs a main-process
              handler this build does not have, which is exactly why the
              reference's own annotation says "Requires implementation".

   THE TABS. `backup.png` draws six and `backup and restore.png` draws four,
   and its "Settings" tab holds the same eight controls as the other's "Auto
   Backup" tab. They are one tab here, named Auto Backup, rather than two tabs
   showing the same locked controls twice.
   ════════════════════════════════════════════════════════════════════════════ */

let backupTab = 'main';

/** How many rows of history to keep. Enough to see a pattern, not a log file. */
const BK_HISTORY_MAX = 50;

function _bkList(key) {
  const v = DB.settings && DB.settings[key];
  return Array.isArray(v) ? v : [];
}

/** One history row, newest first, capped. Written by the two actions below. */
async function bkRecord(key, entry) {
  if (!DB.settings) return;
  const list = _bkList(key);
  list.unshift(entry);
  DB.settings[key] = list.slice(0, BK_HISTORY_MAX);
  await saveDB();
}

function _bkWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
}

/* THE HEALTH LINE. "System Healthy" in the reference is a claim, so it is made
   against something: whether a backup exists at all, and how old it is. A
   hostel that has never exported one is not healthy and is told so. */
function bkHealth() {
  const last = DB.settings && DB.settings.lastBackupExport;
  if (!last) {
    return { hue: 'dh-red', title: 'No backup taken', sub: 'Nothing has been exported from this computer yet.' };
  }
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  const when = _bkWhen(last);
  const stamp = when ? when.date + ', ' + when.time : '—';
  if (days >= 7) {
    return { hue: 'dh-amber', title: 'Backup is ' + days + ' days old', sub: 'Last backup: ' + stamp, days };
  }
  return { hue: 'dh-green', title: 'Your data is protected', sub: 'Last backup: ' + stamp, days };
}

function renderBackupPage() {
  const tabs = [
    { id: 'main',    label: 'Backup & Restore', ico: 'upload' },
    { id: 'auto',    label: 'Auto Backup',      ico: 'clock' },
    { id: 'history', label: 'Backup History',   ico: 'archive' },
    { id: 'restores', label: 'Restore History', ico: 'refreshCw' },
    { id: 'storage', label: 'Storage',          ico: 'database' },
  ];
  const h = bkHealth();

  return `
  <div class="bk-head">
    <div class="set-head__ico dh-blue">${icon('archive', 'md')}</div>
    <div class="set-head__mid">
      <div class="bk-head__t">Backup &amp; Restore</div>
      <div class="bk-head__s">Keep your hostel data safe, secure and always recoverable.</div>
    </div>
    <div class="bk-health ${h.hue}">
      <span class="bk-health__i">${icon(h.hue === 'dh-green' ? 'check' : 'warning', 'sm')}</span>
      <span><b>${escHtml(h.title)}</b><small>${escHtml(h.sub)}</small></span>
    </div>
  </div>

  <div class="set-tabs-wrap">
    <div class="set-tabs" role="tablist" aria-label="Backup sections">
      ${tabs.map(t => `<div class="set-tab ${backupTab === t.id ? 'is-on' : ''}" role="tab" tabindex="0"
             aria-selected="${backupTab === t.id}" title="${escHtml(t.label)}"
             onclick="backupTab='${t.id}';renderPage('backup')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();backupTab='${t.id}';renderPage('backup');}"
        >${icon(t.ico, 'xs')}${escHtml(t.label)}</div>`).join('')}
    </div>
  </div>

  <div class="bk-body">
    ${backupTab === 'main' ? bkMainTab()
    : backupTab === 'auto' ? bkAutoTab()
    : backupTab === 'history' ? bkHistoryTab()
    : backupTab === 'restores' ? bkRestoreTab()
    : bkStorageTab()}
  </div>`;
}

/* ── TAB 1 — take one, put one back ─────────────────────────────────────── */
function bkMainTab() {
  const store = _setStoreParts();
  const stat = (ico, hue, value, label) => `
    <div class="bk-stat ${hue}">
      <div class="bk-stat__i">${icon(ico, 'sm')}</div>
      <div style="min-width:0">
        <div class="bk-stat__v">${escHtml(String(value))}</div>
        <div class="bk-stat__l">${escHtml(label)}</div>
      </div>
    </div>`;

  return `
  <div class="set-split">
    <div class="hi-main">

      <div class="bk-stats">
        ${stat('users', 'dh-violet', (DB.students || []).length, 'Students')}
        ${stat('bed', 'dh-green', (DB.rooms || []).length, 'Rooms')}
        ${stat('card', 'dh-blue', (DB.payments || []).length, 'Payments')}
        ${stat('database', 'dh-amber', _setBytes(store.total), 'Current data size')}
      </div>

      <div class="set-card">
        <div class="set-head">
          <div class="set-head__ico dh-blue">${icon('database', 'md')}</div>
          <div class="set-head__mid">
            <div class="set-head__t">Create Backup Now</div>
            <div class="set-head__s">A complete copy of every record this hostel holds — students, rooms, payments, expenses, complaints and settings.</div>
          </div>
        </div>
        <div class="set-note">${icon('info', 'xs')}<span>The backup is a single <b>.json</b> file. Save it to this computer, a USB stick or a cloud drive — the app never sends it anywhere itself.</span></div>
        <div class="bk-acts">
          <button class="set-btn set-btn--go" onclick="bkCreate(this)">${icon('download', 'xs')}Create &amp; download backup</button>
          <button class="set-btn" onclick="bkPreview()">${icon('fileText', 'xs')}Preview data</button>
          <button class="set-btn" onclick="bkCopyClipboard(this)">${icon('copy', 'xs')}Copy to clipboard</button>
        </div>
      </div>

      ${bkAutoCard()}

      <div class="set-card">
        <div class="set-head">
          <div class="set-head__ico dh-amber">${icon('upload', 'md')}</div>
          <div class="set-head__mid">
            <div class="set-head__t">Restore from Backup</div>
            <div class="set-head__s">Put a previously created backup file back into this installation.</div>
          </div>
        </div>
        <div class="bk-warn">${icon('warning', 'xs')}<span><b>Restoring replaces everything currently in the app.</b> It cannot be undone — take a backup first, above, even if you think you do not need one.</span></div>
        <div class="bk-drop" id="bk-drop"
             ondragover="event.preventDefault();this.classList.add('is-over')"
             ondragleave="this.classList.remove('is-over')"
             ondrop="bkDrop(event)"
             onclick="document.getElementById('restore-file-input').click()">
          <div class="bk-drop__i">${icon('upload', 'md')}</div>
          <div class="bk-drop__t">Choose a backup file, or drag one here</div>
          <div class="bk-drop__s">.json files only</div>
          <div class="bk-drop__n" id="bk-drop-name"></div>
          <input type="file" id="restore-file-input" accept=".json,application/json" hidden onchange="bkPicked(this)">
        </div>
        <div class="bk-acts">
          <button class="set-btn" id="bk-restore-btn" disabled onclick="restoreBackup()">${icon('refreshCw', 'xs')}Restore this file</button>
          <button class="set-btn" onclick="bkPasteRestore()">${icon('clipboard', 'xs')}Restore from pasted text</button>
        </div>
      </div>

    </div>

    <aside class="hi-rail">
      ${bkHistoryCard('backupHistory', 'Backup History', 'history', 5)}
      ${bkHistoryCard('restoreHistory', 'Restore History', 'restores', 4)}

      <div class="set-card">
        <div class="hi-id__head"><div class="hi-id__ttl">${icon('shield', 'sm')}Keeping backups safe</div></div>
        <ul class="bk-tips">
          <li>${icon('check', 'xs')}Keep more than one copy — this PC, a USB stick, a cloud drive.</li>
          <li>${icon('check', 'xs')}Test a restore occasionally, on a spare machine.</li>
          <li>${icon('check', 'xs')}Keep at least three months of backups.</li>
          <li>${icon('check', 'xs')}A backup file is plain readable JSON — store it somewhere private.</li>
        </ul>
        <div class="cfg-note">${icon('info', 'xs')}<span>The file is <b>not encrypted</b>. It holds every student's name, phone and payment history, so treat it the way you would treat the register itself.</span></div>
      </div>
    </aside>
  </div>`;
}

/* The auto-backup summary, on the main tab, and the reason it is locked. */
function bkAutoCard() {
  return `
  <div class="set-card">
    <div class="set-head">
      <div class="set-head__ico dh-slate">${icon('clock', 'md')}</div>
      <div class="set-head__mid">
        <div class="set-head__t">Automatic Backup</div>
        <div class="set-head__s">Back up on a schedule, without anyone remembering to.</div>
      </div>
      <div class="set-head__end">
        ${_setTog(false, { lock: true })}
      </div>
    </div>
    <div class="bk-warn is-info">${icon('lock', 'xs')}<span><b>Not in this build.</b> Nothing in the app schedules a backup, and nothing can write a file to a folder you choose — a backup happens when a person presses the button above. The controls are on the <b>Auto Backup</b> tab so you can see exactly what it would take.</span></div>
  </div>`;
}

/* ── TAB 2 — the schedule that does not exist yet ────────────────────────── */
function bkAutoTab() {
  const row = (o) => _setRow(o);
  return `
  <div class="set-split">
    <div class="hi-main">
      <div class="set-card">
        <div class="set-head">
          <div class="set-head__ico dh-slate">${icon('clock', 'md')}</div>
          <div class="set-head__mid">
            <div class="set-head__t">Automatic Backup</div>
            <div class="set-head__s">Every control the design asks for, and what each one would need.</div>
          </div>
          <div class="set-head__end">${_setTog(false, { lock: true })}</div>
        </div>

        <div class="bk-warn">${icon('warning', 'xs')}<span><b>None of this is wired to anything yet.</b> Hostyllo is a desktop application, not a service: it cannot run while it is closed, so an automatic backup would run <b>when the app is next opened</b> and not at the hour you chose. Saving to a folder of your choice needs the main process to write files on the app's behalf, which this build does not do.</span></div>

        <div class="set-rows">
          ${row({ key: 'bk-freq', ico: 'clock', hue: 'dh-blue', title: 'Backup frequency',
            sub: 'How often a backup is created.', control: _setDead('Daily'),
            lock: 'There is no scheduler. Nothing in the app keeps a timetable or checks one on startup.' })}
          ${row({ key: 'bk-time', ico: 'clock', hue: 'dh-blue', title: 'Backup time',
            sub: 'The preferred hour for the backup to run.', control: _setDead('11:00 PM'),
            lock: 'A desktop app cannot run at 11 PM with its window closed. The honest version of this setting is "next time you open the app", which is not a time you pick.' })}
          ${row({ key: 'bk-keep', ico: 'stack', hue: 'dh-violet', title: 'Keep last',
            sub: 'How many recent backups to keep before deleting the oldest.', control: _setDead('30 backups'),
            lock: 'Deleting old backups means the app owning the folder they live in. It does not — every file it has ever produced was saved by you, where you chose.' })}
          ${row({ key: 'bk-loc', ico: 'drive', hue: 'dh-amber', title: 'Backup location',
            sub: 'The folder backup files are written to.', control: _setDead('Chosen at save time'),
            lock: 'Each backup goes wherever your browser save dialog puts it. A fixed folder needs a main-process file writer and a folder picker, neither of which exists here.' })}
          ${row({ key: 'bk-fail', ico: 'info', hue: 'dh-red', title: 'On-failure behaviour',
            sub: 'What happens when a scheduled backup cannot be written.', control: _setDead('—'),
            lock: 'Nothing runs, so nothing can fail. The app does warn you when your last backup is over a week old — that notice is real and it is on by default.' })}
          ${row({ key: 'bk-enc', ico: 'key', hue: 'dh-red', title: 'Encrypt backup file',
            sub: 'Protect the backup with a password.', control: _setTog(false, { lock: true }),
            lock: 'The backup is plain JSON. Encrypting it would mean a password you can lose and a file no other tool can read — a decision worth making deliberately, not by a switch.' })}
          ${row({ key: 'bk-parts', ico: 'layers', hue: 'dh-violet', title: 'Include / exclude data types',
            sub: 'Choose which records go into the file.', control: _setDead('Everything'),
            lock: 'A partial backup restores into a half-empty app: payments reference students, students reference rooms. Everything goes in, on purpose.' })}
        </div>
      </div>
    </div>

    <aside class="hi-rail">
      <div class="set-card">
        <div class="hi-id__head"><div class="hi-id__ttl">${icon('info', 'sm')}What is real today</div></div>
        <ul class="bk-tips">
          <li>${icon('check', 'xs')}A backup you take by hand, whenever you press the button.</li>
          <li>${icon('check', 'xs')}A reminder when the last one is over a week old.</li>
          <li>${icon('check', 'xs')}A record of every backup and restore, on the tabs above.</li>
          <li>${icon('check', 'xs')}Restore from a file or from pasted text.</li>
        </ul>
      </div>
    </aside>
  </div>`;
}

/* ── TABS 3 and 4 — what has actually happened ───────────────────────────── */
function bkHistoryCard(key, title, tab, limit) {
  const rows = _bkList(key).slice(0, limit);
  return `
  <div class="set-card">
    <div class="hi-id__head">
      <div class="hi-id__ttl">${icon(key === 'backupHistory' ? 'archive' : 'refreshCw', 'sm')}${escHtml(title)}</div>
      ${rows.length ? `<button class="set-btn set-btn--sm" onclick="backupTab='${tab}';renderPage('backup')">View all</button>` : ''}
    </div>
    ${rows.length ? `<div class="bk-mini">${rows.map(r => bkMiniRow(r, key)).join('')}</div>`
      : `<div class="bk-empty">${icon(key === 'backupHistory' ? 'archive' : 'refreshCw', 'md')}
           <div class="bk-empty__t">Nothing recorded yet</div>
           <div class="bk-empty__s">${key === 'backupHistory'
             ? 'Every backup you take from this page is listed here.'
             : 'Every restore you run from this page is listed here.'}</div>
         </div>`}
  </div>`;
}

function bkMiniRow(r, key) {
  const w = _bkWhen(r.at);
  return `
    <div class="bk-mini__r">
      <div class="bk-mini__d">${escHtml(w ? w.date : '—')}<small>${escHtml(w ? w.time : '')}</small></div>
      <div class="bk-mini__b">
        <div class="bk-mini__t">${escHtml(key === 'backupHistory' ? (r.kind || 'Manual') : (r.file || 'Backup file'))}</div>
        <div class="bk-mini__s">${escHtml(key === 'backupHistory'
          ? _setBytes(Number(r.bytes) || 0)
          : (Number(r.students) || 0) + ' students')}</div>
      </div>
      <span class="lk-chip ${r.ok === false ? 'dh-red' : 'dh-green'}">${icon(r.ok === false ? 'close' : 'check', 'xs')}${r.ok === false ? 'Failed' : 'Success'}</span>
    </div>`;
}

function bkTable(key) {
  const rows = _bkList(key);
  const isBackup = key === 'backupHistory';
  if (!rows.length) {
    return `<div class="bk-empty">${icon(isBackup ? 'archive' : 'refreshCw', 'md')}
      <div class="bk-empty__t">Nothing recorded yet</div>
      <div class="bk-empty__s">This list starts the first time you ${isBackup ? 'take a backup' : 'restore one'} from this page. Backups taken before this version are not in it — the app was not keeping a record.</div></div>`;
  }
  return `
  <div class="set-table-wrap">
    <table class="set-table">
      <thead><tr>
        <th class="cfg-n">#</th><th>Date &amp; time</th>
        <th>${isBackup ? 'Type' : 'File'}</th>
        <th>${isBackup ? 'Size' : 'Students restored'}</th>
        <th>Status</th>
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => {
          const w = _bkWhen(r.at);
          return `<tr>
            <td class="cfg-n">${i + 1}</td>
            <td>${escHtml(w ? w.date : '—')} <span class="bk-t">${escHtml(w ? w.time : '')}</span></td>
            <td>${escHtml(isBackup ? (r.kind || 'Manual') : (r.file || 'Backup file'))}</td>
            <td>${escHtml(isBackup ? _setBytes(Number(r.bytes) || 0) : String(Number(r.students) || 0))}</td>
            <td><span class="lk-chip ${r.ok === false ? 'dh-red' : 'dh-green'}">${icon(r.ok === false ? 'close' : 'check', 'xs')}${r.ok === false ? 'Failed' : 'Success'}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function bkHistoryTab() {
  return `
  <div class="set-card">
    <div class="set-head">
      <div class="set-head__ico dh-violet">${icon('archive', 'md')}</div>
      <div class="set-head__mid">
        <div class="set-head__t">Backup History</div>
        <div class="set-head__s">Every backup taken from this computer, newest first. The last ${BK_HISTORY_MAX} are kept.</div>
      </div>
    </div>
    ${bkTable('backupHistory')}
    <div class="cfg-note">${icon('info', 'xs')}<span>This is a record that a backup was <b>taken</b>, not a copy of it. The app cannot see where you saved the file or whether it is still there.</span></div>
  </div>`;
}

function bkRestoreTab() {
  return `
  <div class="set-card">
    <div class="set-head">
      <div class="set-head__ico dh-amber">${icon('refreshCw', 'md')}</div>
      <div class="set-head__mid">
        <div class="set-head__t">Restore History</div>
        <div class="set-head__s">Every time this installation's data was replaced from a backup file.</div>
      </div>
    </div>
    ${bkTable('restoreHistory')}
    <div class="cfg-note">${icon('info', 'xs')}<span>A restore replaces everything, so this list belongs to the data that is here <b>now</b> — restoring an older backup brings that backup's history with it.</span></div>
  </div>`;
}

/* ── TAB 5 — what the file is made of ───────────────────────────────────── */
function bkStorageTab() {
  const store = _setStoreParts();
  return `
  <div class="set-split">
    <div class="hi-main">
      <div class="set-card">
        <div class="set-head">
          <div class="set-head__ico dh-green">${icon('database', 'md')}</div>
          <div class="set-head__mid">
            <div class="set-head__t">Storage</div>
            <div class="set-head__s">What the backup file will weigh, and what makes up the weight.</div>
          </div>
        </div>
        <div class="hi-store">
          ${hiStoreRing(store)}
          <div class="hi-store__b">
            ${store.segs.map(p => `
              <div class="hi-store__r">
                <span class="hi-store__d ${p.hue}"></span>
                <span class="hi-store__k">${escHtml(p.key)}</span>
                <span class="hi-store__v">${_setBytes(p.n)}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="cfg-note">${icon('info', 'xs')}<span>The database is a file on this computer's own disk, so there is no quota and no percentage to show — the ring is what the payload is <b>made of</b>, not how full anything is. A backup is this same payload, written out.</span></div>
      </div>
    </div>
    <aside class="hi-rail">
      <div class="set-card">
        <div class="hi-id__head"><div class="hi-id__ttl">${icon('info', 'sm')}Row counts</div></div>
        <div class="hi-facts">
          ${[['Students', (DB.students || []).length], ['Rooms', (DB.rooms || []).length],
             ['Payments', (DB.payments || []).length], ['Expenses', (DB.expenses || []).length],
             ['Complaints', (DB.complaints || []).length + (DB.maintenance || []).length],
             ['Archived years', (DB.archive || []).length]].map(([k, v]) => `
            <div class="hi-fact"><span class="hi-fact__i">${icon('list', 'xs')}</span>
              <span class="hi-fact__l">${escHtml(k)}</span>
              <span class="hi-fact__v">${v}</span></div>`).join('')}
        </div>
      </div>
    </aside>
  </div>`;
}

/* ── ACTIONS ─────────────────────────────────────────────────────────────── */

/** Create the file, and record that it happened. */
async function bkCreate(btn) {
  if (btn) btn.disabled = true;
  const bytes = JSON.stringify(DB).length;
  try {
    await exportBackup('json');
    await bkRecord('backupHistory', { at: new Date().toISOString(), kind: 'Manual', bytes, ok: true });
  } catch (e) {
    await bkRecord('backupHistory', { at: new Date().toISOString(), kind: 'Manual', bytes, ok: false });
    toast('The backup could not be created', 'error');
  }
  if (btn) btn.disabled = false;
  renderPage('backup');
}

async function bkCopyClipboard(btn) {
  if (btn) btn.disabled = true;
  const bytes = JSON.stringify(DB).length;
  await exportBackup('clip');
  /* exportBackup only stamps lastBackupExport when the copy actually
     succeeded, so the stamp is what decides whether this counts as a backup. */
  const stamped = DB.settings && DB.settings.lastBackupExport
    && Date.now() - new Date(DB.settings.lastBackupExport).getTime() < 5000;
  if (stamped) await bkRecord('backupHistory', { at: new Date().toISOString(), kind: 'Clipboard', bytes, ok: true });
  if (btn) btn.disabled = false;
  if (stamped) renderPage('backup');
}

/** What is in the file, before it is written. */
function bkPreview() {
  const store = _setStoreParts();
  const counts = [
    ['Students', (DB.students || []).length],
    ['Rooms', (DB.rooms || []).length],
    ['Payments', (DB.payments || []).length],
    ['Expenses', (DB.expenses || []).length],
    ['Cancellations', (DB.cancellations || []).length],
    ['Complaints', (DB.complaints || []).length],
    ['Maintenance', (DB.maintenance || []).length],
    ['Activity log', (DB.activityLog || []).length],
    ['Archived years', (DB.archive || []).length],
  ];
  showModal('modal-sm',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('fileText', 'sm')}</div>
       <div><div class="hf-mh__t">What the backup contains</div>
       <div class="hf-mh__s">${escHtml(_setBytes(store.total))} of JSON, written as one file.</div></div>
     </div>`,
    `<div class="hi-facts" style="margin-top:0;padding-top:0;border-top:none">
       ${counts.map(([k, v]) => `<div class="hi-fact">
         <span class="hi-fact__i">${icon('list', 'xs')}</span>
         <span class="hi-fact__l">${escHtml(k)}</span>
         <span class="hi-fact__v">${v}</span></div>`).join('')}
       <div class="hi-fact"><span class="hi-fact__i">${icon('settings', 'xs')}</span>
         <span class="hi-fact__l">Settings</span>
         <span class="hi-fact__v">included</span></div>
     </div>
     <div class="cfg-note">${icon('warning', 'xs')}<span>Every one of these carries real names, phone numbers and amounts. The file is not encrypted.</span></div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Close</button>`);
}

/** A file arrived by drop rather than by picker. */
function bkDrop(ev) {
  ev.preventDefault();
  const zone = document.getElementById('bk-drop');
  if (zone) zone.classList.remove('is-over');
  const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (!file) return;
  if (!/\.json$/i.test(file.name)) { toast('Only .json backup files can be restored', 'error'); return; }
  const input = document.getElementById('restore-file-input');
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    bkPicked(input);
  } catch (e) {
    toast('That file could not be read — use Choose file instead', 'error');
  }
}

/** Name the chosen file and arm the restore button. */
function bkPicked(input) {
  const f = input && input.files && input.files[0];
  const label = document.getElementById('bk-drop-name');
  const btn = document.getElementById('bk-restore-btn');
  if (label) label.textContent = f ? f.name : '';
  if (btn) btn.disabled = !f;
}

/** Restore from text, for a backup that arrived in a message rather than a file. */
function bkPasteRestore() {
  showModal('modal-sm',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('clipboard', 'sm')}</div>
       <div><div class="hf-mh__t">Restore from pasted text</div>
       <div class="hf-mh__s">Paste the whole contents of a backup file.</div></div>
     </div>`,
    `<div class="bk-warn">${icon('warning', 'xs')}<span><b>This replaces everything currently in the app</b> and cannot be undone.</span></div>
     <textarea class="form-control" id="restore-json-paste" rows="8" placeholder='{"students":[…]}'></textarea>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="restoreFromPaste()">Restore</button>`);
}

/* The page the old modal used to be. Kept because the command palette, the
   File menu and the backup-due toast all still call it by this name. */
function showBackupRestorePage() {
  backupTab = 'main';
  navigate('backup');
}
