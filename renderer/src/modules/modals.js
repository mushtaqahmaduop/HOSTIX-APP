/* ─── HOSTYLLO — MODALS & UI MODULE ───────────────────────────────────────────
   Contains: showModal, closeModal, showConfirm, toast, showCustomDatePicker,
             _cdpClose/_cdpClear/_cdpPrev/_cdpNext/_cdpRender/_cdpPick,
             _showCameraPermBanner, statusBadge, pmBadge,
             showBackupRestoreModal, exportBackup, restoreBackup, restoreFromPaste,
             _initDBFields, showUserMgmt/showUserEditor/saveUser/deleteUser,
             handleWardenPhoto
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ── ICON MAP (Lucide, offline-vendored — see dashboard.js for the original filled-icon
//    system). Named MODAL_ICONS, not ICONS, because all module files share one global
//    script scope and dashboard.js already owns the top-level `ICONS` identifier — a
//    second `const ICONS` here would throw a duplicate-declaration error and break the
//    whole app (the exact collision-bug class already fixed once in this codebase). ──
const MODAL_ICONS = {
  shieldCheck: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>',
  download: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg>',
  clipboardCopy: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M16 4h2a2 2 0 0 1 2 2v4" /><path d="M21 14H11" /><path d="m15 10-4 4 4 4" /></svg>',
  cloud: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>',
  cloudUpload: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8" /><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="m8 17 4-4 4 4" /></svg>',
  lightbulb: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>',
  upload: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12" /><path d="m17 8-5-5-5 5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>',
  alertTriangle: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>',
  clipboardPaste: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 14h10" /><path d="M16 4h2a2 2 0 0 1 2 2v1.344" /><path d="m17 18 4-4-4-4" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113" /><rect x="8" y="2" width="8" height="4" rx="1" /></svg>',
  save: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" /></svg>',
  moon: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg>',
  calendar: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>',
  cameraOff: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.564 14.558a3 3 0 1 1-4.122-4.121" /><path d="m2 2 20 20" /><path d="M20 20H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 .819-.175" /><path d="M9.695 4.024A2 2 0 0 1 10.004 4h3.993a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v7.344" /></svg>',
  smartphone: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>',
  trash: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>',
  statusActive: '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="1" /></svg>',
  statusLeft: '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.1 2.182a10 10 0 0 1 3.8 0" /><path d="M13.9 21.818a10 10 0 0 1-3.8 0" /><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" /><path d="M2.182 13.9a10 10 0 0 1 0-3.8" /><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" /><path d="M21.818 10.1a10 10 0 0 1 0 3.8" /><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" /><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" /></svg>',
  statusX: '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>',
  statusBan: '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M4.929 4.929 19.07 19.071" /></svg>',
  statusCheck: '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>',
  statusClock: '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>',
};

function showModal(size, title, body, footer='') {
  const html=`<div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal ${size}">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="btn btn-secondary btn-icon" onclick="closeModal()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /> <path d="m6 6 12 12" /></svg>
        </button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer?`<div class="modal-footer">${footer}</div>`:''}
    </div>
  </div>`;
  document.getElementById('modal-container').innerHTML=html;
}
function closeModal() {
  // Stop any active camera streams before destroying modal
  ['add-student-cam-video','edit-student-cam-video'].forEach(id=>{
    const vid = document.getElementById(id);
    if(vid?.srcObject){ vid.srcObject.getTracks().forEach(t=>t.stop()); vid.srcObject=null; }
  });
  document.getElementById('modal-container').innerHTML='';
}
let _pendingConfirmCb = null;
let _pendingConfirmCancelCb = null;
function showConfirm(title, text, onConfirm, onCancel) {
  _pendingConfirmCb = onConfirm;
  _pendingConfirmCancelCb = onCancel || null;
  showModal('modal-sm', title,
    `<p class="confirm-text">${text}</p>`,
    `<button class="btn btn-secondary" onclick="closeModal();if(_pendingConfirmCancelCb){_pendingConfirmCancelCb();_pendingConfirmCancelCb=null;}">Cancel</button><button class="btn btn-danger" onclick="closeModal();if(_pendingConfirmCb){_pendingConfirmCb();_pendingConfirmCb=null;}">Confirm</button>`
  );
}
// ════════════════════════════════════════════════════════════════════════════
// BACKUP & RESTORE
// ════════════════════════════════════════════════════════════════════════════
async function showBackupRestoreModal() {
  if (typeof requirePerm === 'function' && !requirePerm('backup')) return;
  const dataSize = (JSON.stringify(DB).length / 1024).toFixed(1);
  const studentCount = DB.students.length;
  const paymentCount = DB.payments.length;
  const roomCount = DB.rooms.length;
  // This line used to read "Last snapshot: <now>" — it formatted the current
  // clock, so it always claimed a fresh backup existed no matter how long it
  // had actually been. It now reports the real last export, recorded by
  // exportBackup(), and says so plainly when there has never been one.
  const lastExport = DB.settings?.lastBackupExport ? new Date(DB.settings.lastBackupExport) : null;
  const lastExportTxt = lastExport
    ? lastExport.toLocaleDateString('en-PK',{year:'numeric',month:'short',day:'2-digit'}) + ' ' +
      lastExport.toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit'})
    : null;

  showModal('modal-md', `<span class="bkp-head">
      <span class="bkp-head__ico">${icon('shieldCheck','sm')}</span>
      <span><span class="bkp-head__t">Backup &amp; Restore Data</span>
      <span class="bkp-head__s">Secure your hostel data with export, backup and restore options</span></span>
    </span>`, `
    <div class="bkp">

      <div class="bkp-safe">
        <span class="bkp-safe__ico">${icon('lock','sm')}</span>
        <div>
          <div class="bkp-safe__t">Your data is stored on this computer</div>
          <div class="bkp-safe__s">Hostyllo runs offline — nothing leaves this machine. Export a backup file to
            a USB or cloud drive so a disk failure can’t take the hostel’s records with it.</div>
        </div>
      </div>

      <!-- Stats row -->
      <div class="bkp-stats">
        <div class="bkp-stat dh-blue">
          <span class="bkp-stat__ico">${icon('users','sm')}</span>
          <span><span class="bkp-stat__v">${studentCount}</span><span class="bkp-stat__k">Students</span></span>
        </div>
        <div class="bkp-stat dh-red">
          <span class="bkp-stat__ico">${icon('bed','sm')}</span>
          <span><span class="bkp-stat__v">${roomCount}</span><span class="bkp-stat__k">Rooms</span></span>
        </div>
        <div class="bkp-stat dh-amber">
          <span class="bkp-stat__ico">${icon('receipt','sm')}</span>
          <span><span class="bkp-stat__v">${paymentCount}</span><span class="bkp-stat__k">Payments</span></span>
        </div>
        <div class="bkp-stat dh-violet">
          <span class="bkp-stat__ico">${icon('database','sm')}</span>
          <span><span class="bkp-stat__v">${dataSize} KB</span><span class="bkp-stat__k">Data Size</span></span>
        </div>
      </div>

      <!-- Export section -->
      <div class="bkp-sec">
        <div class="bkp-sec__head dh-blue">
          <span class="bkp-sec__ico">${icon('download','sm')}</span> Export / Download Backup
        </div>
        <div class="bkp-sec__body">
          <p class="bkp-p">Download a <b>.json</b> backup file containing all your hostel data.
            Store it on your PC, a USB stick, or a cloud drive.</p>
          <div class="bkp-acts">
            <button class="btn btn-primary" onclick="exportBackup('json')">
              ${icon('download','sm')} Download JSON Backup
            </button>
            <button class="btn btn-secondary" onclick="exportBackup('copy')">
              ${icon('copy','sm')} Copy to Clipboard
            </button>
          </div>
          <div class="bkp-last${lastExportTxt ? '' : ' is-never'}">
            ${icon('clock','xs')}
            <span>${lastExportTxt ? 'Last exported: ' + lastExportTxt : 'No backup has been exported yet'}</span>
          </div>
        </div>
      </div>

      <!-- Restore section -->
      <div class="bkp-sec">
        <div class="bkp-sec__head dh-amber">
          <span class="bkp-sec__ico">${icon('refreshCw','sm')}</span> Restore from Backup
        </div>
        <div class="bkp-sec__body">
          <div class="bkp-warn">
            <span class="bkp-warn__ico">${icon('warning','sm')}</span>
            <span>Restoring <b>replaces ALL current data</b>. Export a backup first — this cannot be undone.</span>
          </div>

          <label class="bkp-label" for="restore-file-input">Select backup file (.json)</label>
          <input type="file" id="restore-file-input" accept=".json" class="bkp-file">
          <button class="btn btn-danger bkp-wide" onclick="restoreBackup()">
            ${icon('upload','sm')} Restore Data from File
          </button>

          <div class="bkp-or">
            <label class="bkp-label" for="restore-json-paste">Or paste JSON directly</label>
            <textarea id="restore-json-paste" class="bkp-ta" rows="3" placeholder="Paste JSON backup data here…"></textarea>
            <button class="btn btn-secondary bkp-wide" onclick="restoreFromPaste()">
              ${icon('clipboard','sm')} Restore from Pasted JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">${icon('close','sm')} Close</button>`);
}

async function exportBackup(mode) {
  const json = JSON.stringify(DB, null, 2);
  const now = new Date();
  const filename = 'Hostyllo_Backup_' + now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + '.json';
  if(mode==='json') {
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    // FIX #6: Defer revoke — synchronous revoke can cancel the download before it starts
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Backup downloaded: ' + filename, 'success');
  } else {
    try {
      await navigator.clipboard.writeText(json);
      toast('Data copied to clipboard!', 'success');
    } catch {
      toast('Copy failed — try the Download button instead', 'error');
      return;   // nothing left the app, so don't stamp it as an export
    }
  }
  // Stamp the export so the modal can report when a backup was last taken,
  // instead of formatting the current clock and calling it a snapshot.
  if (DB.settings) {
    DB.settings.lastBackupExport = now.toISOString();
    await saveDB();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (Google Drive backup functions removed — backup is now download-only)
// Stub no-ops to avoid errors from any remaining call sites:
function getNextBackupLabel()        { return ''; }
function updateBackupScheduleLabel() {}
function sendBackupToDrive()         { exportBackup('json'); }
function sendBackupToGmail()         { exportBackup('json'); }
function checkAutoBackupSchedule()   {}
// ─────────────────────────────────────────────────────────────────────────────

function _initDBFields(d) {
  // FIX #14: Canonical single source of truth for all DB field normalisation.
  // Called by loadDB(), restoreBackup(), and restoreFromPaste().
  if (!d) d = {};
  if (!d.students) d.students = [];
  if (!d.payments) d.payments = [];
  if (!d.expenses) d.expenses = [];
  if (!d.cancellations) d.cancellations = [];
  if (!d.maintenance) d.maintenance = [];
  if (!d.complaints) d.complaints = [];
  if (!d.checkinlog) d.checkinlog = [];
  if (!d.notices) d.notices = [];
  if (!d.fines) d.fines = [];
  if (!d.activityLog) d.activityLog = [];
  if (!d.inspections) d.inspections = [];
  if (!d.billSplits) d.billSplits = [];
  if (!d.transfers) d.transfers = [];
  if (!d.roomShifts) d.roomShifts = [];   // Room shift history records
  if (!d.archive) d.archive = [];         // Annual Archive — historical records
  if (!d.settings) d.settings = {};
  // Init roomTypes BEFORE generateRooms so rooms get correct default rents
  // roomTypes already initialized above (before generateRooms)
  if (!d.rooms || d.rooms.length === 0) d.rooms = generateRooms(d.settings.roomTypes);
  // Core identity — previously missing from restoreBackup path
  if (!d.settings.appName) d.settings.appName = 'HOSTYLLO'; // ← Customisable system name
  if (!d.settings.hostelName) d.settings.hostelName = 'DAMAM Boys Hostel';
  if (!d.settings.tagline) d.settings.tagline = 'Safe & Comfortable Living';
  if (!d.settings.location) d.settings.location = '4/1 Kakakhel Street, Danishabad Shaheen Town, Peshawar';
  if (!d.settings.phone) d.settings.phone = '';
  if (!d.settings.email) d.settings.email = '';
  if (!d.settings.version) d.settings.version = 'v1.0';
  // Appearance
  if (!d.settings.hostelNameFont) d.settings.hostelNameFont = 'DM Serif Display';
  if (d.settings.showFontPicker === undefined) d.settings.showFontPicker = true;
  // Behaviour
  if (!d.settings.currency) d.settings.currency = 'PKR';
  // autoMonthGenerate is no longer read by anything: nothing generates payment
  // records on its own. Kept off, and kept at all, only so an older database
  // that has it stored is not silently rewritten. Rent rows come from the
  // warden — Auto-Generate Month on the Payments screen, or a recorded payment.
  d.settings.autoMonthGenerate = false;
  if (!d.settings.defaultWANumber) d.settings.defaultWANumber = '';
  // Collections
  if (!d.settings.roomTypes || !d.settings.roomTypes.length) d.settings.roomTypes = [
    { id:'1s', name:'1-Seater', capacity:1, defaultRent:16000, color:'#4a9cf0' },
    { id:'2s', name:'2-Seater', capacity:2, defaultRent:16000, color:'#9b6df0' },
    { id:'3s', name:'3-Seater', capacity:3, defaultRent:16000, color:'#2ec98a' },
    { id:'4s', name:'4-Seater', capacity:4, defaultRent:16000, color:'#7c3aed' },
    { id:'5s', name:'5-Seater', capacity:5, defaultRent:16000, color:'#f0a030' }
  ];
  /* RENT + MESS SPLIT.
     A hostel's monthly charge is really two charges — the bed and the food —
     and a student may take the bed only. Existing installs stored the two
     added together in defaultRent, so mess starts at 0 everywhere: the split
     is opt-in from Settings → Rent & Mess and nobody's totals move until the
     owner enters one. */
  (d.settings.roomTypes || []).forEach(function (t) {
    if (t.defaultMess == null) t.defaultMess = 0;
  });
  (d.students || []).forEach(function (s) {
    if (s.mess == null)      s.mess = 0;
    if (s.messOptIn == null) s.messOptIn = true;
  });
  if (!d.settings.paymentMethods) d.settings.paymentMethods = ['Cash','JazzCash','EasyPaisa','Bank Transfer','Cheque'];
  if (!d.settings.expenseCategories) d.settings.expenseCategories = ['Electricity','Water','Gas','Maintenance','Cleaning','Security','Internet','Furniture','Plumbing','Fund Transfer','Other'];
  /* FUND TRANSFER BECOMES AN EXPENSE CATEGORY.
     A transfer is money leaving the same till as a gas bill, and it is now
     entered on the Expenses page like one. Existing installs get the category
     added; it goes in before 'Other' so the catch-all stays last. Records
     already in DB.transfers are NOT migrated — they keep their own array and
     are folded into this category wherever outgoings are itemised, so no
     history moves and nothing is rewritten. */
  if (!d.settings.expenseCategories.includes(FUND_TRANSFER_CAT)) {
    const _oi = d.settings.expenseCategories.findIndex(c => /^other$/i.test(String(c)));
    if (_oi >= 0) d.settings.expenseCategories.splice(_oi, 0, FUND_TRANSFER_CAT);
    else          d.settings.expenseCategories.push(FUND_TRANSFER_CAT);
  }
  if (!d.settings.floors) d.settings.floors = ['Ground','1st','2nd','3rd'];
  // FIX #6: Use == null to guard receiptCounter — !0 is truthy so a simple falsy
  // check would reset a valid counter of 0 back to 0, potentially duplicating receipt numbers.
  if (d.settings.receiptCounter == null) d.settings.receiptCounter = 0;
  return d;
}

async function restoreBackup() {
  const input = document.getElementById('restore-file-input');
  if(!input?.files?.length){ toast('Please select a backup .json file first', 'error'); return; }
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      let parsed = JSON.parse(e.target.result);
      // BUG FIX: Support both flat format (direct DB) and old wrapped {db:...,archive:...} format
      if (parsed.db && parsed.db.students) parsed = parsed.db;
      if(!parsed.students || !parsed.rooms || !parsed.settings){
        toast('Invalid backup file — not a HOSTYLLO hostel backup', 'error'); return;
      }
      const count = parsed.students.length;
      showConfirm('Restore Backup?',
        `This will replace ALL current data with backup data (${count} students). This cannot be undone!`,
        async ()=>{
          const btn = document.querySelector('.btn-danger');
          if (btn) { btn.disabled = true; btn.textContent = 'Restoring…'; }
          try {
            DB = _initDBFields(parsed);
            await saveDB();
            updateSidebar();
            navigate('dashboard');
            toast('Data restored successfully from backup!', 'success');
            closeModal();
          } finally {
            if (btn && !btn.closest('#modal-container')) { btn.disabled = false; btn.textContent = 'Restore Data from File'; }
          }
        }
      );
    } catch(err) {
      toast('Could not parse backup file — file may be corrupted', 'error');
    }
  };
  reader.readAsText(file);
}

async function restoreFromPaste() {
  const text = document.getElementById('restore-json-paste')?.value?.trim();
  if(!text){ toast('Please paste JSON data first', 'error'); return; }
  try {
    let parsed = JSON.parse(text);
    // BUG FIX: Support both flat format and old wrapped {db:...,archive:...} format
    if (parsed.db && parsed.db.students) parsed = parsed.db;
    if(!parsed.students || !parsed.rooms || !parsed.settings){
      toast('Invalid JSON — not a valid HOSTYLLO hostel backup', 'error'); return;
    }
    const count = parsed.students.length;
    showConfirm('Restore from Pasted Data?',
      `This will replace ALL current data (${count} students found in backup). This cannot be undone!`,
      async ()=>{
        DB = _initDBFields(parsed);
        await saveDB();
        updateSidebar();
        navigate('dashboard');
        toast('Data restored from pasted backup!', 'success');
        closeModal();
      }
    );
  } catch(err) {
    toast('Invalid JSON — check for errors in pasted data', 'error');
  }
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
function statusBadge(s) {
  const map={Paid:'badge-green',Pending:'badge-gold',Active:'badge-green',Left:'badge-gray',Blacklisted:'badge-red',Cancelling:'badge-red'};
  const icons={Active:MODAL_ICONS.statusActive,Left:MODAL_ICONS.statusLeft,Blacklisted:MODAL_ICONS.statusX,Cancelling:MODAL_ICONS.statusBan,Paid:MODAL_ICONS.statusCheck,Pending:MODAL_ICONS.statusClock};
  return `<span class="badge ${map[s]||'badge-gray'}">${icons[s]||''} ${escHtml(s||'—')}</span>`;
}
function pmBadge(m) {
  // BUG FIX: 'EasypaIsa' was a dead duplicate key with a capital-I typo that
  // could never match any real payment method. Removed. EasyPaisa is sufficient.
  // Payment methods are categories, not status — neutral pills per the rebrand.
  return `<span class="badge badge-gray">${escHtml(m||'—')}</span>`;
}


// ════════════════════════════════════════════════════════════════════════════
// FIX #2 — CUSTOM LIFETIME DATE PICKER (replaces native type="text" readonly onclick="showCustomDatePicker(this,event)" class="cdp-trigger")
// ════════════════════════════════════════════════════════════════════════════
(function _initCustomDatePicker() {
  // Inject picker CSS once
  if (document.getElementById('_cdp-style')) return;
  const s = document.createElement('style');
  s.id = '_cdp-style';
  s.textContent = `
    #_cdp-overlay{position:fixed;inset:0;z-index:9999;display:none}
    #_cdp-overlay.open{display:block}
    #_cdp-box{
      position:fixed;background:var(--card,#1e2533);border:1px solid var(--border2,rgba(255,255,255,0.12));
      border-radius:14px;padding:0;box-shadow:0 12px 40px rgba(0,0,0,0.6);
      width:290px;z-index:10000;font-family:var(--font,'DM Sans',sans-serif);
      overflow:hidden;animation:_cdp-in 0.18s ease;
    }
    @keyframes _cdp-in{from{opacity:0;transform:scale(0.95) translateY(-6px)}to{opacity:1;transform:none}}
    #_cdp-header{
      display:flex;align-items:center;gap:8px;
      background:var(--bg3,#141824);border-bottom:1px solid var(--border,rgba(255,255,255,0.07));
      padding:12px 14px;
    }
    #_cdp-icon{font-size:18px;opacity:0.7}
    #_cdp-display{
      flex:1;font-size:15px;font-weight:700;color:var(--text,#e0e8f0);
      letter-spacing:0.3px;font-family:var(--font-mono,'JetBrains Mono',monospace);
    }
    #_cdp-clear{
      background:rgba(255,255,255,0.08);border:none;border-radius:50%;width:24px;height:24px;
      color:var(--text3,#6b7a99);font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;
      transition:background 0.15s;line-height:1;padding:0;
    }
    #_cdp-clear:hover{background:var(--danger-bg);color:var(--danger-fg)}
    #_cdp-nav{
      display:flex;align-items:center;justify-content:space-between;
      padding:10px 14px;gap:6px;
    }
    #_cdp-nav button{
      background:var(--bg4,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.07));
      border-radius:8px;padding:5px 11px;color:var(--text2,#b0bcd4);font-size:16px;
      cursor:pointer;transition:background 0.15s;
    }
    #_cdp-nav button:hover{background:var(--bg3,#141824)}
    #_cdp-month-lbl{font-size:14px;font-weight:800;color:var(--text,#e0e8f0);display:flex;align-items:center;gap:8px}
    #_cdp-year-sel{
      background:var(--bg4,rgba(255,255,255,0.06));border:1px solid var(--border2,rgba(255,255,255,0.1));
      color:var(--text,#e0e8f0);border-radius:6px;padding:2px 4px;font-size:13px;font-weight:700;cursor:pointer;
    }
    #_cdp-dow{
      display:grid;grid-template-columns:repeat(7,1fr);
      padding:0 10px;margin-bottom:4px;
    }
    #_cdp-dow span{
      font-size:10px;font-weight:800;text-align:center;color:var(--text3,#6b7a99);
      text-transform:uppercase;letter-spacing:0.6px;padding:4px 0;
    }
    #_cdp-days{
      display:grid;grid-template-columns:repeat(7,1fr);
      padding:0 10px 12px;gap:2px;
    }
    ._cdp-day{
      aspect-ratio:1;display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:500;border-radius:8px;cursor:pointer;
      color:var(--text,#e0e8f0);transition:background 0.12s,color 0.12s;
      border:none;background:transparent;
    }
    ._cdp-day:hover{background:var(--bg3,rgba(255,255,255,0.08))}
    /* Today = accent ring, selected = accent fill. Two accent states instead of
       accent-vs-blue, so the picker stops introducing an off-brand hue. */
    ._cdp-day.today{color:var(--accent);font-weight:800;box-shadow:inset 0 0 0 1px var(--accent)}
    ._cdp-day.today:not(.selected):hover{background:var(--bg3,rgba(255,255,255,0.08))}
    ._cdp-day.selected{background:var(--accent);color:#fff;font-weight:800;box-shadow:none}
    ._cdp-day.other-month{color:var(--text3,#6b7a99);opacity:0.45}
    ._cdp-day.other-month:hover{opacity:0.7}
    .cdp-input-wrap{position:relative;display:inline-block;width:100%}
    .cdp-trigger{
      cursor:pointer!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24' stroke='%236b7a99' stroke-width='2'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E") !important;
      background-repeat:no-repeat!important;background-position:calc(100% - 10px) center!important;
      padding-right:36px!important;
    }
  `;
  document.head.appendChild(s);

  // Create picker DOM
  const overlay = document.createElement('div');
  overlay.id = '_cdp-overlay';
  overlay.innerHTML = `
    <div id="_cdp-box">
      <div id="_cdp-header">
        <span id="_cdp-icon">${MODAL_ICONS.calendar}</span>
        <span id="_cdp-display">Select date</span>
        <button id="_cdp-clear" title="Clear date" onclick="_cdpClear()">✕</button>
      </div>
      <div id="_cdp-nav">
        <button onclick="_cdpPrev()">‹</button>
        <div id="_cdp-month-lbl">
          <span id="_cdp-month-name"></span>
          <select id="_cdp-year-sel" onchange="_cdpSetYear(this.value)"></select>
        </div>
        <button onclick="_cdpNext()">›</button>
      </div>
      <div id="_cdp-dow">
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </div>
      <div id="_cdp-days"></div>
    </div>`;
  document.body.appendChild(overlay);

  // Close on outside click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _cdpClose();
  });
})();

let _cdpTarget = null, _cdpY = new Date().getFullYear(), _cdpM = new Date().getMonth(), _cdpSelected = null;
const _MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function showCustomDatePicker(input, event) {
  if (event) event.stopPropagation();
  _cdpTarget = input;
  // Parse existing value
  const v = input.value;
  let d = v ? new Date(v + 'T00:00:00') : new Date();
  if (isNaN(d.getTime())) d = new Date();
  _cdpSelected = v ? new Date(v + 'T00:00:00') : null;
  _cdpY = d.getFullYear(); _cdpM = d.getMonth();
  _cdpBuildYearSelect();
  _cdpRender();
  // Position box near input
  const box = document.getElementById('_cdp-box');
  const rect = input.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  box.style.top = spaceBelow > 310 ? (rect.bottom + window.scrollY + 4) + 'px' : (rect.top + window.scrollY - 320) + 'px';
  box.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
  document.getElementById('_cdp-overlay').classList.add('open');
}
function _cdpClose() {
  document.getElementById('_cdp-overlay').classList.remove('open');
  _cdpTarget = null;
}
function _cdpClear() {
  if (_cdpTarget) { _cdpTarget.value = ''; _cdpTarget.dispatchEvent(new Event('input',{bubbles:true})); _cdpTarget.dispatchEvent(new Event('change',{bubbles:true})); }
  _cdpSelected = null;
  document.getElementById('_cdp-display').textContent = 'Select date';
  _cdpClose();
}
function _cdpPrev() { _cdpM--; if (_cdpM < 0) { _cdpM = 11; _cdpY--; } _cdpBuildYearSelect(); _cdpRender(); }
function _cdpNext() { _cdpM++; if (_cdpM > 11) { _cdpM = 0; _cdpY++; } _cdpBuildYearSelect(); _cdpRender(); }
function _cdpSetYear(y) { _cdpY = parseInt(y); _cdpRender(); }
function _cdpBuildYearSelect() {
  const sel = document.getElementById('_cdp-year-sel'); if (!sel) return;
  const min = 2015, max = new Date().getFullYear() + 10;
  if (!sel.dataset.min || parseInt(sel.dataset.min) !== min) {
    sel.innerHTML = '';
    for (let y = min; y <= max; y++) { const o = document.createElement('option'); o.value = o.textContent = y; sel.appendChild(o); }
    sel.dataset.min = min;
  }
  sel.value = _cdpY;
}
function _cdpRender() {
  const mn = document.getElementById('_cdp-month-name'); if (mn) mn.textContent = _MN[_cdpM];
  const ysel = document.getElementById('_cdp-year-sel'); if (ysel) ysel.value = _cdpY;
  const now = new Date(), todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();
  const first = new Date(_cdpY, _cdpM, 1).getDay();
  const days = new Date(_cdpY, _cdpM + 1, 0).getDate();
  const prevDays = new Date(_cdpY, _cdpM, 0).getDate();
  const selY = _cdpSelected ? _cdpSelected.getFullYear() : -1;
  const selM = _cdpSelected ? _cdpSelected.getMonth() : -1;
  const selD = _cdpSelected ? _cdpSelected.getDate() : -1;
  let html = '';
  for (let i = 0; i < first; i++) {
    const d = prevDays - first + 1 + i;
    html += `<button class="_cdp-day other-month" onclick="_cdpPrev();_cdpPick(${d})">${d}</button>`;
  }
  for (let d = 1; d <= days; d++) {
    const isToday = d === todayD && _cdpM === todayM && _cdpY === todayY;
    const isSel = d === selD && _cdpM === selM && _cdpY === selY;
    const cls = isToday ? 'today' : isSel ? 'selected' : '';
    html += `<button class="_cdp-day ${cls}" onclick="_cdpPick(${d})">${d}</button>`;
  }
  let extra = 0; while ((first + days + extra) % 7 !== 0) extra++;
  for (let d = 1; d <= extra; d++) html += `<button class="_cdp-day other-month" onclick="_cdpNext();_cdpPick(${d})">${d}</button>`;
  document.getElementById('_cdp-days').innerHTML = html;
  // Update display
  const disp = document.getElementById('_cdp-display');
  if (disp && _cdpSelected) disp.textContent = String(_cdpSelected.getDate()).padStart(2,'0') + '/' + String(_cdpSelected.getMonth()+1).padStart(2,'0') + '/' + _cdpSelected.getFullYear();
  else if (disp) disp.textContent = 'Select date';
}
function _cdpPick(d) {
  _cdpSelected = new Date(_cdpY, _cdpM, d);
  const val = _cdpY + '-' + String(_cdpM + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  if (_cdpTarget) {
    _cdpTarget.value = val;
    _cdpTarget.dispatchEvent(new Event('input', {bubbles:true}));
    _cdpTarget.dispatchEvent(new Event('change', {bubbles:true}));
  }
  _cdpRender();
  setTimeout(_cdpClose, 160);
}
// ─────────────────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// FIX #9 — AUTO CAPITALIZE (fallback if src/utils.js hasn't defined these)
// ════════════════════════════════════════════════════════════════════════════
if (typeof autoCapName === 'undefined') {
  window.autoCapName = function(inp) {
    const v = inp.value;
    // Capitalize first letter of each word
    inp.value = v.replace(/\b\w/g, c => c.toUpperCase());
    // Move caret to end
    try { const len = inp.value.length; inp.setSelectionRange(len, len); } catch(e) {}
  };
}
if (typeof capFirstChar === 'undefined') {
  window.capFirstChar = function(inp) {
    if (inp.value.length === 1) inp.value = inp.value.toUpperCase();
  };
}
// Inject global CSS so name/text columns display capitalized everywhere in app
(function _injectCapCSS() {
  if (document.getElementById('_cap-css')) return;
  const s = document.createElement('style');
  s.id = '_cap-css';
  s.textContent = `
    /* Fix #9: Auto-capitalize student names and text fields throughout app */
    .td-name > div > div:first-child,
    input.form-control[id*="name"], input.form-control[id*="tname"],
    input.form-control[id*="fname"], input.form-control[id*="father"],
    input.form-control[id*="search-students"],
    input.form-control[placeholder*="name"], input.form-control[placeholder*="Name"] {
      text-transform: capitalize;
    }
    /* Prevent ALL-CAPS display in tables – normalize to Title Case via CSS */
    table td { font-variant: normal; text-transform: none; }
    table td .td-name div { text-transform: capitalize; }
  `;
  document.head.appendChild(s);
})();
// ─────────────────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════════════════════
// ── Camera Permission Banner ──────────────────────────────────────────────────
// Shows a persistent, dismissible sticky banner when camera access is blocked.
// Uses a flag so it never appears twice at the same time.
var _camPermBannerActive = false;
function _showCameraPermBanner() {
  if (_camPermBannerActive || document.getElementById('cam-perm-banner')) return;
  _camPermBannerActive = true;
  var b = document.createElement('div');
  b.id = 'cam-perm-banner';
  b.style.cssText = [
    'position:fixed','top:0','right:0','z-index:99998',
    'background:var(--danger-bg)',
    'border:1.5px solid var(--danger-border)',
    'border-top:none','border-right:none',
    'border-radius:0 0 0 12px',
    'color:var(--danger-fg)','font-size:12.5px','font-weight:500',
    'padding:10px 14px 10px 16px',
    'display:flex','align-items:flex-start','gap:10px',
    'max-width:420px','line-height:1.55',
    'box-shadow:-4px 4px 20px rgba(0,0,0,0.5)'
  ].join(';');
/* WHY THIS WORDING CHANGED.
   The old text said "enable this app" in Windows Settings -> Privacy &
   Security -> Camera. Windows lists individual apps there ONLY for Store
   (UWP) apps. Hostyllo is a packaged desktop app, so it never appears in
   that list, and the owner went looking for an entry that cannot exist.
   Desktop apps are governed by the single "Let desktop apps access your
   camera" switch at the BOTTOM of the same page. That is the one to name. */
  b.innerHTML =
    '<span style="display:inline-flex;flex-shrink:0;margin-top:1px">'+MODAL_ICONS.cameraOff+'</span>' +
    '<span style="flex:1"><strong style="color:var(--danger-fg);display:block;margin-bottom:3px">Camera permission blocked.</strong>' +
    'Open <strong style="color:var(--text)">Windows Settings → Privacy &amp; Security → Camera</strong>, turn on <strong style="color:var(--text)">Camera access</strong>, then scroll to the bottom and turn on <strong style="color:var(--text)">Let desktop apps access your camera</strong>. Restart Hostyllo afterwards. (Hostyllo will not appear in the app list above — that list is only for Microsoft Store apps.)</span>' +
    '<button onclick="document.getElementById(\'cam-perm-banner\').remove();window._camPermBannerActive=false;" ' +
      'style="background:none;border:none;color:var(--danger-fg);font-size:16px;cursor:pointer;padding:0 0 0 6px;line-height:1;flex-shrink:0;margin-top:1px" ' +
      'title="Dismiss">✕</button>';
  document.body.appendChild(b);
}

/* Toasts raised while the login screen is up wait here. flushToastQueue() is
   called once the app proper is visible — from BOTH login paths, the typed one
   and the restored-session one. */
const _toastQueue = [];
function flushToastQueue() {
  if (!_toastQueue.length) return;
  const pending = _toastQueue.splice(0, _toastQueue.length);
  // Staggered, so three queued boot warnings do not arrive as one stack the
  // warden dismisses without reading.
  pending.forEach((args, i) => setTimeout(() => toast.apply(null, args), i * 700));
}

function toast(msg, type='info', title='') {
  // Premium toast with icon, title, body, and progress bar
  const svgIcons = {
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>',
    error:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /> <path d="m6 6 12 12" /></svg>',
    info:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /> <path d="M12 16v-4" /> <path d="M12 8h.01" /></svg>',
    // 'warning' has been passed by callers for a long time without existing
    // here, so those toasts came out with no icon and the title "Info".
    warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  };
  const defaultTitles = { success: 'Success', error: 'Error', info: 'Info', warning: 'Heads up' };

  /* DWELL TIME — the owner reported these hanging around far too long.

     A success toast is a GLANCE: the warden already knows what they did, the
     toast only confirms it landed, and 3s of it sitting over the top-right KPI
     card is a nuisance rather than information. 1.5s is enough to register.

     An error or a warning is READ, so it keeps a longer dwell — but 4.5s was
     tuned for nothing in particular and is cut too. Anything that genuinely
     needs more time than this should not be a toast at all; it should be a
     modal the warden dismisses. */
  const delay = (type === 'error' || type === 'warning') ? 2600 : 1500;

  /* NOT OVER THE LOGIN SCREEN.

     Two boot checks fire on timers — the default-password warning at 2s and the
     backup reminder at 4s — and on a cold start those land while the warden is
     still typing their password, on a screen with no context for them. Holding
     them here rather than at those two call sites means any future boot toast
     is covered by the same rule instead of having to remember this. */
  const _login = document.getElementById('login-screen');
  if (_login && _login.style.display !== 'none' && getComputedStyle(_login).display !== 'none') {
    _toastQueue.push([msg, type, title]);
    return;
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.style.cssText = 'position:relative;overflow:hidden;';
  t.innerHTML = `
    <div class="toast-icon">${svgIcons[type] || svgIcons.info}</div>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title || defaultTitles[type] || 'Info')}</div>
      <div class="toast-msg">${escHtml(msg)}</div>
    </div>
    <div class="toast-progress" style="--duration:${delay}ms"></div>
  `;
  const container = document.getElementById('toast-container');
  if (container) container.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s, transform 0.3s';
    t.style.opacity = '0';
    t.style.transform = 'translateX(20px)';
    setTimeout(() => t.remove(), 300);
  }, delay);
}

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// LOGO UPLOAD
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
//
// Was a fixed editor for exactly two wardens. It is now an open user list:
// add, edit, deactivate and delete accounts, each with its own permission set.
// Guarded by the 'users' permission — see requirePerm() in auth-nev.js.
// ════════════════════════════════════════════════════════════════════════════

/** Count users who can still manage users and are not deactivated. */
function _adminCount() {
  return Object.values(WARDENS).filter(function (u) {
    return u && u.active !== false && u.perms && u.perms.users === true;
  }).length;
}

function showUserMgmt() {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;

  var rows = Object.keys(WARDENS).map(function (id) {
    var u = WARDENS[id] || {};
    var isMe = id === CUR_ROLE;
    var perms = u.perms || {};
    var granted = PERM_KEYS.filter(function (k) { return perms[k] === true; }).length;
    var initials = (u.name || u.username || '?').trim().charAt(0).toUpperCase();

    var av = u.photo
      ? '<img src="' + u.photo + '" style="width:40px;height:40px;border-radius:11px;object-fit:cover;flex-shrink:0">'
      : '<div style="width:40px;height:40px;border-radius:11px;background:var(--bg4);color:var(--text2);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0">' + escHtml(initials) + '</div>';

    return '<div style="display:flex;align-items:center;gap:12px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px">'
      + av
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-weight:700;font-size:14px;color:var(--text)">' + escHtml(u.name || '(no name)')
      + (isMe ? ' <span style="font-size:10px;font-weight:700;color:var(--text3)">&middot; you</span>' : '')
      + (u.active === false ? ' <span class="badge badge-gray" style="font-size:10px">Inactive</span>' : '')
      + '</div>'
      + '<div style="font-size:12px;color:var(--text3);margin-top:2px">'
      + escHtml(u.username || id) + ' &middot; ' + granted + ' of ' + PERM_KEYS.length + ' permissions'
      + '</div>'
      + '</div>'
      + '<button class="btn btn-secondary btn-sm" onclick="showUserEditor(\'' + id + '\')">Edit</button>'
      + '</div>';
  }).join('');

  showModal('modal-md', 'User Management',
    rows
    + '<button class="btn btn-primary btn-sm" style="width:100%;margin-top:6px" onclick="showUserEditor(null)">+ Add User</button>'
    + '<div style="font-size:11.5px;color:var(--text3);margin-top:12px;line-height:1.6">'
    + 'Permissions control what each person can reach in this app. They are enforced '
    + 'on this machine &mdash; anyone with the Windows account and the database file '
    + 'can still read the data directly.'
    + '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Close</button>'
    + '<button class="btn btn-danger btn-sm" onclick="logout()">Logout</button>'
  );
}

/** Add (id === null) or edit one user. */
function showUserEditor(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;

  var isNew = !id;
  var u = isNew ? { username: '', name: '', phone: '', perms: {}, active: true } : (WARDENS[id] || {});
  var perms = u.perms || {};
  // A new account starts with the everyday permissions ticked and the dangerous
  // ones clear, so a mis-click cannot hand out clear-all by default.
  var defaultOn = { edit: true, payments: true, reports: true };

  var permRows = PERMS.map(function (p) {
    var on = isNew ? (defaultOn[p.key] === true) : (perms[p.key] === true);
    return '<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:9px;background:var(--bg3);border:1px solid var(--border);margin-bottom:6px;cursor:pointer">'
      + '<input type="checkbox" id="up-' + p.key + '"' + (on ? ' checked' : '') + ' style="margin-top:2px;flex-shrink:0">'
      + '<span style="flex:1"><span style="display:block;font-size:13px;font-weight:600;color:var(--text)">' + escHtml(p.label) + '</span>'
      + '<span style="display:block;font-size:11.5px;color:var(--text3);margin-top:1px">' + escHtml(p.hint) + '</span></span>'
      + '</label>';
  }).join('');

  // Photo is offered only when editing: a new user has no storage key yet to
  // attach the image to. It saves immediately, unlike the fields below it.
  var avatarHtml = isNew ? '' :
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">'
    + _userAvatarNode(id, u.photo || '')
    + '<input type="file" id="u-photo-input" accept="image/*" style="display:none" onchange="handleWardenPhoto(event,\'' + id + '\')">'
    + '<div style="flex:1">'
    +   '<div style="font-size:12.5px;font-weight:600;color:var(--text)">Profile photo</div>'
    +   '<div style="font-size:11.5px;color:var(--text3);margin-top:2px">Saved as soon as you choose it</div>'
    + '</div>'
    + (u.photo ? '<button class="btn btn-secondary btn-sm" onclick="removeWardenPhoto(\'' + id + '\')">Remove</button>' : '')
    + '</div>';

  var body =
    avatarHtml
    + '<div class="form-grid" style="gap:10px">'
    + '<div class="field"><label style="font-size:11px">Full Name</label>'
    + '<input id="u-name" class="form-control" value="' + escHtml(u.name || '') + '" placeholder="e.g. Faheem Ullah"></div>'
    + '<div class="field"><label style="font-size:11px">Username</label>'
    + '<input id="u-username" class="form-control" autocapitalize="none" spellcheck="false" value="' + escHtml(u.username || '') + '" placeholder="e.g. faheem"></div>'
    + '<div class="field"><label style="font-size:11px">' + (isNew ? 'Password' : 'New Password') + '</label>'
    + '<input id="u-pw" class="form-control" type="password" placeholder="' + (isNew ? 'At least ' + AUTH_CFG.minPwLen + ' characters' : 'Leave blank to keep current') + '"></div>'
    + '<div class="field"><label style="font-size:11px">WhatsApp Number</label>'
    + '<input id="u-phone" class="form-control" value="' + escHtml(u.phone || '') + '" placeholder="03XX-XXXXXXX"></div>'
    + '</div>'
    + '<label style="display:flex;gap:9px;align-items:center;margin:12px 0 4px;cursor:pointer">'
    + '<input type="checkbox" id="u-active"' + (u.active !== false ? ' checked' : '') + '>'
    + '<span style="font-size:13px;font-weight:600;color:var(--text)">Account is active</span>'
    + '<span style="font-size:11.5px;color:var(--text3)">&mdash; inactive accounts cannot sign in</span>'
    + '</label>'
    + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin:16px 0 8px">Permissions</div>'
    + permRows;

  var canDelete = !isNew && !(WARDENS[id] && WARDENS[id].builtin) && id !== CUR_ROLE;
  var footer =
    '<button class="btn btn-secondary" onclick="showUserMgmt()">Back</button>'
    + (canDelete ? '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + id + '\')">Delete</button>' : '')
    + '<button class="btn btn-primary" onclick="saveUser(' + (isNew ? 'null' : '\'' + id + '\'') + ')">Save</button>';

  showModal('modal-md', isNew ? 'Add User' : 'Edit User', body, footer);
}

async function saveUser(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;

  var isNew = !id;
  var name = (document.getElementById('u-name') || {}).value || '';
  var username = (document.getElementById('u-username') || {}).value || '';
  var pw = (document.getElementById('u-pw') || {}).value || '';
  var phone = (document.getElementById('u-phone') || {}).value || '';
  var active = !!(document.getElementById('u-active') || {}).checked;

  name = name.trim();
  username = username.trim().toLowerCase();
  phone = phone.trim();

  if (!name) { toast('Name cannot be empty', 'error'); return; }
  if (!username) { toast('Username cannot be empty', 'error'); return; }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    toast('Username can use letters, numbers, dot, dash and underscore only', 'error'); return;
  }
  var clash = findUserByUsername(username);
  if (clash && clash !== id) { toast('That username is already taken', 'error'); return; }

  var perms = {};
  PERM_KEYS.forEach(function (k) {
    var el = document.getElementById('up-' + k);
    perms[k] = !!(el && el.checked);
  });

  // Never let the last administrator be demoted or switched off — that would
  // leave the install with no way to manage users at all.
  if (!isNew) {
    var was = WARDENS[id] || {};
    var wasAdmin = was.active !== false && was.perms && was.perms.users === true;
    var stillAdmin = active && perms.users === true;
    if (wasAdmin && !stillAdmin && _adminCount() <= 1) {
      toast('This is the only account that can manage users. Give another user that permission first.',
        'error', 'Cannot remove');
      return;
    }
  }

  var newHash = null;
  if (pw.trim()) {
    try { newHash = await hashNewPassword(pw.trim()); }
    catch (e) { toast(e.message || 'Invalid password', 'error'); return; }
  } else if (isNew) {
    toast('Set a password for the new user', 'error'); return;
  }

  if (isNew) {
    // The storage key is independent of the username, so renaming a user later
    // never orphans their session or their lockout record.
    var newId = 'u' + Date.now().toString(36);
    WARDENS[newId] = {
      username: username, name: name, phone: phone,
      perms: perms, active: active, pw: newHash, photo: ''
    };
  } else {
    var t = WARDENS[id];
    t.name = name; t.username = username; t.phone = phone;
    t.perms = perms; t.active = active;
    if (newHash) t.pw = newHash;
    if (id === CUR_ROLE) {
      CUR_USER = t;
      if (typeof updateRoleBadge === 'function') updateRoleBadge();
      if (typeof applyPermissionsToChrome === 'function') applyPermissionsToChrome();
    }
  }

  saveWardenConfig();
  if (typeof USERS !== 'undefined') USERS = WARDENS;
  toast(name + (isNew ? ' added' : ' updated'), 'success');
  showUserMgmt();
}

function deleteUser(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  var u = WARDENS[id];
  if (!u) return;
  if (id === CUR_ROLE) { toast('You cannot delete the account you are signed in as', 'error'); return; }
  if (u.builtin) { toast('The built-in account cannot be deleted', 'error'); return; }
  if (u.active !== false && u.perms && u.perms.users === true && _adminCount() <= 1) {
    toast('This is the only account that can manage users', 'error', 'Cannot delete'); return;
  }
  showConfirm('Delete user?',
    'Remove ' + escHtml(u.name || u.username) + '? They will no longer be able to sign in. '
    + 'Records they already created are not affected.',
    function () {
      delete WARDENS[id];
      saveWardenConfig();
      if (typeof USERS !== 'undefined') USERS = WARDENS;
      toast('User deleted', 'info');
      showUserMgmt();
    });
}

function handleWardenPhoto(event, key) {
  var file = event.target.files[0];
  if(!file) return;
  if(file.size > 2 * 1024 * 1024) { toast('Photo must be under 2MB','error'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    // Resize to max 200x200 before storing
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var MAX = 200;
      var scale = Math.min(MAX/img.width, MAX/img.height, 1);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      if(!WARDENS[key]) return;
      WARDENS[key].photo = dataUrl;
      saveWardenConfig();
      if(key === CUR_ROLE) { CUR_USER = WARDENS[key]; updateRoleBadge(); }
      toast('Profile photo updated','success');
      // The editor is rebuilt rather than patched in place: it now carries
      // unsaved field values, so re-rendering would discard them — instead only
      // the avatar node is swapped.
      var imgEl = document.getElementById('u-avatar');
      if(imgEl) imgEl.outerHTML = _userAvatarNode(key, dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeWardenPhoto(key) {
  if(!WARDENS[key]) return;
  WARDENS[key].photo = '';
  saveWardenConfig();
  if(key === CUR_ROLE) { CUR_USER = WARDENS[key]; updateRoleBadge(); }
  toast('Photo removed','info');
  var imgEl = document.getElementById('u-avatar');
  if(imgEl) imgEl.outerHTML = _userAvatarNode(key, '');
}

/**
 * The avatar control inside the user editor. Clicking it opens the file picker.
 * Kept as one function so handleWardenPhoto/removeWardenPhoto can swap the node
 * without re-rendering the whole editor and losing unsaved input.
 */
function _userAvatarNode(key, photo) {
  var open = 'document.getElementById(\'u-photo-input\').click()';
  if (photo) {
    return '<img id="u-avatar" src="' + photo + '" onclick="' + open + '" title="Click to change photo"'
      + ' style="width:56px;height:56px;border-radius:14px;object-fit:cover;border:2px solid var(--accent);cursor:pointer">';
  }
  return '<div id="u-avatar" onclick="' + open + '" title="Click to upload a photo"'
    + ' style="width:56px;height:56px;border-radius:14px;background:var(--bg4);color:var(--text3);display:flex;'
    + 'align-items:center;justify-content:center;cursor:pointer;border:2px dashed var(--border2);font-size:22px">+</div>';
}


// saveUPW and saveWardenInfo were both superseded by saveUser() above.

// ══════════════════════════════════════════════════════════════════
// STUDENT DOCUMENTS UPLOAD
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// STUDENT ID CARD GENERATOR
// ══════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════
// ALL STUDENTS PDF DOWNLOAD
// ══════════════════════════════════════════════════════════════════
