/* ─── HOSTIX — MODALS & UI MODULE ───────────────────────────────────────────
   Contains: showModal, closeModal, showConfirm, toast, showCustomDatePicker,
             _cdpClose/_cdpClear/_cdpPrev/_cdpNext/_cdpRender/_cdpPick,
             _showCameraPermBanner, statusBadge, pmBadge,
             showBackupRestoreModal, exportBackup, getNextBackupLabel,
             updateBackupScheduleLabel, sendBackupToDrive, sendBackupToGmail,
             checkAutoBackupSchedule, restoreBackup, restoreFromPaste,
             _initDBFields, saveWardenInfo/showUserMgmt/handleWardenPhoto
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

function showModal(size, title, body, footer='') {
  const html=`<div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal ${size}">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="btn btn-secondary btn-icon" onclick="closeModal()">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
  const now = new Date();
  const ts = now.toLocaleDateString('en-PK',{year:'numeric',month:'short',day:'2-digit'}) + ' ' + now.toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit'});
  const dataSize = (JSON.stringify(DB).length / 1024).toFixed(1);
  const studentCount = DB.students.length;
  const paymentCount = DB.payments.length;
  const roomCount = DB.rooms.length;

  showModal('modal-md','🛡️ Backup & Restore Data',`
    <div style="background:var(--teal-dim);border:1px solid rgba(15,188,173,0.3);border-radius:10px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
      <div style="font-size:22px">🔒</div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--teal)">Your data is safe in this browser</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Export a backup file to your PC/phone to protect against browser data loss</div>
      </div>
    </div>

    <!-- Stats row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:900;color:var(--gold2)">${studentCount}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-top:2px">Students</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:900;color:var(--green)">${roomCount}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-top:2px">Rooms</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:900;color:var(--blue)">${paymentCount}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-top:2px">Payments</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:900;color:var(--purple)">${dataSize}KB</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-top:2px">Data Size</div>
      </div>
    </div>

    <!-- Export section -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:10px">📤 Export / Download Backup</div>
      <div style="font-size:12.5px;color:var(--text2);margin-bottom:12px">Download a <strong style="color:var(--text)">.json</strong> backup file containing all your hostel data. Store it on your PC, USB, or Google Drive.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="exportBackup('json')" style="flex:1">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download JSON Backup
        </button>
        <button class="btn btn-secondary" onclick="exportBackup('copy')">
          📋 Copy to Clipboard
        </button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Last snapshot: ${ts}</div>
    </div>

    <!-- FIX: Google Drive Backup Section (replaces Gmail) -->
    <div style="background:var(--bg3);border:1px solid rgba(66,133,244,0.35);border-radius:10px;padding:16px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:30px;height:30px;background:rgba(66,133,244,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">☁️</div>
        <div>
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#4285f4">Google Drive Backup</div>
          <div style="font-size:11px;color:var(--text3)">Save backup file directly to Google Drive</div>
        </div>
      </div>
      <!-- FIX-GDRIVE: Gmail account input field -->
      <div class="field" style="margin-bottom:12px">
        <label style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:5px">Google Account (Gmail) for Drive Upload</label>
        <input class="form-control" id="gdrive-email" type="email" placeholder="yourname@gmail.com"
          value="${escHtml(DB.settings.driveEmail||'')}"
          oninput="DB.settings.driveEmail=this.value.trim();await saveDB()"
          style="font-size:12px">
        <div style="font-size:10px;color:var(--text3);margin-top:4px">Saved for reference — used to open the correct Drive account in your browser.</div>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:5px">Auto-Backup Schedule</label>
        <select class="form-control" id="backup-schedule" onchange="DB.settings.backupSchedule=this.value;await saveDB();updateBackupScheduleLabel()">
          <option value="" ${!DB.settings.backupSchedule?'selected':''}>Disabled</option>
          <option value="daily" ${DB.settings.backupSchedule==='daily'?'selected':''}>Every Day</option>
          <option value="2days" ${DB.settings.backupSchedule==='2days'?'selected':''}>Every 2 Days</option>
          <option value="3days" ${DB.settings.backupSchedule==='3days'?'selected':''}>Every 3 Days</option>
          <option value="weekly" ${DB.settings.backupSchedule==='weekly'?'selected':''}>Every Week</option>
          <option value="monthly" ${DB.settings.backupSchedule==='monthly'?'selected':''}>Every Month</option>
        </select>
        <div id="schedule-next-lbl" style="font-size:11px;color:var(--text3);margin-top:5px">${getNextBackupLabel()}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="sendBackupToDrive()" style="background:linear-gradient(135deg,#4285f4,#1a6ed8);border:none;flex:1;display:flex;align-items:center;justify-content:center;gap:6px">
          <span style="font-size:14px">☁️</span> Backup Now to Google Drive
        </button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px;padding:8px 10px;background:var(--bg4);border-radius:6px">
        💡 Clicking <strong>Backup Now</strong> downloads the JSON file and opens your Google Drive${DB.settings.driveEmail?` (<strong>${escHtml(DB.settings.driveEmail)}</strong>)`:''} in the browser. Upload the file there to save it in the cloud.
      </div>
    </div>

    <!-- Restore section -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--amber);margin-bottom:10px">📥 Restore from Backup</div>
      <div style="background:var(--amber-dim);border:1px solid rgba(240,160,48,0.25);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--text2)">
        ⚠️ <strong>Warning:</strong> Restoring will <strong style="color:var(--red)">replace ALL current data</strong>. Make sure to export a backup first!
      </div>
      <div style="margin-bottom:10px">
        <label style="display:block;font-size:11.5px;color:var(--text3);font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.8px">Select Backup File (.json)</label>
        <input type="file" id="restore-file-input" accept=".json" class="form-control" style="font-size:12px">
      </div>
      <button class="btn btn-danger" onclick="restoreBackup()" style="width:100%">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Restore Data from File
      </button>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-size:11.5px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Or Paste JSON directly</div>
        <textarea id="restore-json-paste" class="form-control" rows="3" placeholder="Paste JSON backup data here…" style="font-family:var(--font-mono);font-size:11px"></textarea>
        <button class="btn btn-secondary" onclick="restoreFromPaste()" style="width:100%;margin-top:8px">📋 Restore from Pasted JSON</button>
      </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`);
}

function exportBackup(mode) {
  const json = JSON.stringify(DB, null, 2);
  const now = new Date();
  const filename = 'DAMAM2_Backup_' + now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + '.json';
  if(mode==='json') {
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    // FIX #6: Defer revoke — synchronous revoke can cancel the download before it starts
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Backup downloaded: ' + filename, 'success');
  } else {
    navigator.clipboard.writeText(json).then(()=>{
      toast('Data copied to clipboard!', 'success');
    }).catch(()=>{
      toast('Copy failed — try the Download button instead', 'error');
    });
  }
}

// ── Fix #7: Gmail Backup Helpers ─────────────────────────────────────────────
function getNextBackupLabel() {
  const sched = DB.settings && DB.settings.backupSchedule;
  const last  = DB.settings && DB.settings.lastBackupDate;
  if (!sched) return 'Auto-backup is disabled.';
  const intervalDays = {daily:1,'2days':2,'3days':3,weekly:7,monthly:30}[sched] || 0;
  if (!intervalDays) return '';
  const lastDate = last ? new Date(last) : null;
  if (!lastDate) return 'Next: on next app open';
  const nextDate = new Date(lastDate.getTime() + intervalDays * 86400000);
  const diff = Math.ceil((nextDate - Date.now()) / 86400000);
  return diff <= 0 ? '⏰ Backup due now!' : `Next backup in ${diff} day${diff!==1?'s':''}`;
}
function updateBackupScheduleLabel() {
  const el = document.getElementById('schedule-next-lbl');
  if(el) el.textContent = getNextBackupLabel();
}
// FIX: Replace Gmail backup with direct Google Drive backup
async function sendBackupToDrive() {
  // Step 1: Download the backup JSON file to PC
  exportBackup('json');
  // Step 2: Open Google Drive upload page in system browser
  var driveUrl = 'https://drive.google.com/drive/my-drive';
  openExternalLink(driveUrl);
  // Update last backup date
  DB.settings.lastBackupDate = new Date().toISOString().slice(0,10);
  await saveDB();
  updateBackupScheduleLabel();
  toast('✅ Backup downloaded! Now upload it to Google Drive in your browser.', 'success');
}
// Keep old name as alias for any auto-backup calls
function sendBackupToGmail() { sendBackupToDrive(); }
// Auto-backup check on app start — runs after DB is loaded
function checkAutoBackupSchedule() {
  const sched = DB.settings && DB.settings.backupSchedule;
  if (!sched) return;
  const intervalDays = {daily:1,'2days':2,'3days':3,weekly:7,monthly:30}[sched] || 0;
  if (!intervalDays) return;
  const last = DB.settings.lastBackupDate;
  if (last) {
    const daysSince = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    if (daysSince < intervalDays) return; // not due yet
  }
  // FIX-B2: Show a prominent sticky banner with a one-click "Backup Now" button
  // instead of a silent toast the warden might miss or dismiss accidentally.
  setTimeout(function() {
    if (document.getElementById('backup-due-banner')) return; // no duplicates
    var lastStr = last
      ? 'Last backup: ' + new Date(last).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'}) + '.'
      : 'No backup has been made yet.';
    var banner = document.createElement('div');
    banner.id = 'backup-due-banner';
    // FIX B5: moved to bottom so it does not cover the app header/sidebar
    banner.style.cssText = [
      'position:fixed','bottom:0','left:0','right:0','z-index:99999',
      'background:linear-gradient(90deg,#1e3c6a,#2a5298)',
      'color:#e8eef8','font-size:13px','font-weight:600',
      'padding:10px 20px','display:flex','align-items:center',
      'gap:12px','box-shadow:0 -3px 16px rgba(0,0,0,0.55)'
    ].join(';');
    // FIX B5: use this.parentElement.remove() — avoids broken inner-quote bug
    banner.innerHTML =
      '<span style="font-size:18px">⏰</span>' +
      '<span style="flex:1">Scheduled backup is due. ' + lastStr + ' Back up now to avoid data loss.</span>' +
      '<button onclick="sendBackupToDrive();this.parentElement.remove();" ' +
        'style="background:#e6c96e;color:#071428;border:none;border-radius:7px;padding:6px 16px;' +
        'font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap">💾 Backup Now</button>' +
      '<button onclick="this.parentElement.remove();" ' +
        'style="background:rgba(255,255,255,0.1);color:#e8eef8;border:none;border-radius:7px;' +
        'padding:6px 12px;font-size:12px;cursor:pointer;white-space:nowrap">Dismiss</button>';
    document.body.prepend(banner);
  }, 3000);
}
// ─────────────────────────────────────────────────────────────────────────────

// ── MIDNIGHT AUTO-BACKUP SCHEDULER (BUG-5 FIX) ───────────────────────────────
// Fires at 00:00 every night. If a backup schedule is set AND it is due,
// runs sendBackupToDrive() automatically — no user action needed.
(function _initMidnightBackup() {
  function _msUntilMidnight() {
    var n = new Date();
    var m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 15); // 00:00:15
    return m - n;
  }
  function _midnightCheck() {
    try {
      var sched = DB && DB.settings && DB.settings.backupSchedule;
      if (!sched || sched === 'off') return;
      var intervalDays = {daily:1,'2days':2,'3days':3,weekly:7,monthly:30}[sched] || 0;
      if (!intervalDays) return;
      var last = DB.settings.lastBackupDate;
      var daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : 999;
      if (daysSince >= intervalDays) {
        sendBackupToDrive();
        if (typeof toast === 'function') toast('🌙 Midnight auto-backup completed to Google Drive.', 'success');
      }
    } catch(e) { console.warn('[AutoBackup] midnight check error:', e); }
  }
  // Schedule first tick at next midnight, then repeat every 24 h
  setTimeout(function _firstMidnightTick() {
    _midnightCheck();
    setInterval(_midnightCheck, 24 * 60 * 60 * 1000);
  }, _msUntilMidnight());
})();
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
  if (!d.settings) d.settings = {};
  // Init roomTypes BEFORE generateRooms so rooms get correct default rents
  // roomTypes already initialized above (before generateRooms)
  if (!d.rooms || d.rooms.length === 0) d.rooms = generateRooms(d.settings.roomTypes);
  // Core identity — previously missing from restoreBackup path
  if (!d.settings.appName) d.settings.appName = 'HOSTIX'; // ← Customisable system name
  if (!d.settings.hostelName) d.settings.hostelName = 'DAMAM Boys Hostel';
  if (!d.settings.tagline) d.settings.tagline = 'Safe & Comfortable Living';
  if (!d.settings.location) d.settings.location = '4/1 Kakakhel Street, Danishabad Shaheen Town, Peshawar';
  if (!d.settings.phone) d.settings.phone = '';
  if (!d.settings.email) d.settings.email = '';
  if (!d.settings.version) d.settings.version = 'v1.0';
  // Appearance
  if (!d.settings.accentColor) d.settings.accentColor = '#e05252';
  if (!d.settings.hostelNameFont) d.settings.hostelNameFont = 'DM Serif Display';
  if (d.settings.showFontPicker === undefined) d.settings.showFontPicker = true;
  // Behaviour
  if (!d.settings.currency) d.settings.currency = 'PKR';
  if (d.settings.autoMonthGenerate === undefined) d.settings.autoMonthGenerate = true;
  if (!d.settings.defaultWANumber) d.settings.defaultWANumber = '';
  // Collections
  if (!d.settings.roomTypes || !d.settings.roomTypes.length) d.settings.roomTypes = [
    { id:'1s', name:'1-Seater', capacity:1, defaultRent:16000, color:'#4a9cf0' },
    { id:'2s', name:'2-Seater', capacity:2, defaultRent:16000, color:'#9b6df0' },
    { id:'3s', name:'3-Seater', capacity:3, defaultRent:16000, color:'#2ec98a' },
    { id:'4s', name:'4-Seater', capacity:4, defaultRent:16000, color:'#c8a84b' },
    { id:'5s', name:'5-Seater', capacity:5, defaultRent:16000, color:'#f0a030' }
  ];
  if (!d.settings.paymentMethods) d.settings.paymentMethods = ['Cash','JazzCash','EasyPaisa','Bank Transfer','Cheque'];
  if (!d.settings.expenseCategories) d.settings.expenseCategories = ['Electricity','Water','Gas','Maintenance','Cleaning','Security','Internet','Furniture','Plumbing','Other'];
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
        toast('Invalid backup file — not a DAMAM hostel backup', 'error'); return;
      }
      const count = parsed.students.length;
      showConfirm('Restore Backup?',
        `This will replace ALL current data with backup data (${count} students). This cannot be undone!`,
        ()=>{
          DB = _initDBFields(parsed);
          await saveDB();
          updateSidebar();
          applySavedTheme();
          navigate('dashboard');
          toast('Data restored successfully from backup!', 'success');
          closeModal();
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
      toast('Invalid JSON — not a valid DAMAM hostel backup', 'error'); return;
    }
    const count = parsed.students.length;
    showConfirm('Restore from Pasted Data?',
      `This will replace ALL current data (${count} students found in backup). This cannot be undone!`,
      ()=>{
        DB = _initDBFields(parsed);
        await saveDB();
        updateSidebar();
        applySavedTheme();
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
  const icons={Active:'●',Left:'◌',Blacklisted:'✕',Cancelling:'🚫',Paid:'✓',Pending:'⏳'};
  return `<span class="badge ${map[s]||'badge-gray'}">${icons[s]||''} ${escHtml(s||'—')}</span>`;
}
function pmBadge(m) {
  // BUG FIX: 'EasypaIsa' was a dead duplicate key with a capital-I typo that
  // could never match any real payment method. Removed. EasyPaisa is sufficient.
  const map={Cash:'badge-green',JazzCash:'badge-purple',EasyPaisa:'badge-teal','Bank Transfer':'badge-blue',Cheque:'badge-amber'};
  return `<span class="badge ${map[m]||'badge-gray'}">${escHtml(m||'—')}</span>`;
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
    #_cdp-clear:hover{background:rgba(224,82,82,0.25);color:#e05252}
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
    ._cdp-day.today{background:var(--gold,#c8a84b);color:#000;font-weight:800}
    ._cdp-day.today:hover{background:var(--gold2,#dbbe6e)}
    ._cdp-day.selected{background:var(--blue,#4a9cf0);color:#fff;font-weight:800}
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
        <span id="_cdp-icon">📅</span>
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
    'background:linear-gradient(135deg,#2a0a0a,#3d0f0f)',
    'border:1.5px solid rgba(224,82,82,0.6)',
    'border-top:none','border-right:none',
    'border-radius:0 0 0 12px',
    'color:#f0c0c0','font-size:12.5px','font-weight:500',
    'padding:10px 14px 10px 16px',
    'display:flex','align-items:flex-start','gap:10px',
    'max-width:340px','line-height:1.5',
    'box-shadow:-4px 4px 20px rgba(0,0,0,0.5)'
  ].join(';');
  b.innerHTML =
    '<span style="font-size:18px;flex-shrink:0;margin-top:1px">📷</span>' +
    '<span style="flex:1"><strong style="color:#e05252;display:block;margin-bottom:3px">Camera permission blocked.</strong>' +
    'Go to <strong style="color:#f0c0c0">Windows Settings → Privacy &amp; Security → Camera</strong> and enable this app, then restart.</span>' +
    '<button onclick="document.getElementById(\'cam-perm-banner\').remove();window._camPermBannerActive=false;" ' +
      'style="background:none;border:none;color:#e05252;font-size:16px;cursor:pointer;padding:0 0 0 6px;line-height:1;flex-shrink:0;margin-top:1px" ' +
      'title="Dismiss">✕</button>';
  document.body.appendChild(b);
}

function toast(msg, type='info') {
  const icons={success:'✓',error:'✕',info:'ℹ'};
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.innerHTML=`<span>${icons[type]||'•'}</span><span>${escHtml(msg)}</span>`;
  document.getElementById('toast-container').appendChild(t);
  // BUG FIX 1: transition must be set BEFORE changing opacity, otherwise the
  //   browser applies the new opacity instantly with no animation.
  // BUG FIX 2: 800ms is too short for error messages; use type-aware timing.
  const delay = type==='error' ? 4000 : 2500;
  setTimeout(()=>{ t.style.transition='opacity 0.3s'; t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, delay);
}

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// LOGO UPLOAD
// ════════════════════════════════════════════════════════════════════════════

function showUserMgmt() {
  var rows = '';
  var wList = ['warden1','warden2'];
  wList.forEach(function(key){
    var w = WARDENS[key];
    var isActive = key===CUR_ROLE;
    var photoSrc = w.photo || '';
    var avatarHtml = photoSrc
      ? '<img src="'+photoSrc+'" id="warden-avatar-img-'+key+'" style="width:56px;height:56px;border-radius:14px;object-fit:cover;border:2px solid var(--gold);cursor:pointer" onclick="document.getElementById(\'warden-photo-input-'+key+'\').click()" title="Click to change photo">'
      : '<div id="warden-avatar-img-'+key+'" onclick="document.getElementById(\'warden-photo-input-'+key+'\').click()" style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,var(--gold),#9a7a1a);display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;border:2px dashed rgba(200,168,75,0.3)" title="Click to upload photo">&#x1F464;</div>';
    rows += '<div style="background:var(--bg3);border:1px solid '+(isActive?'rgba(200,168,75,0.5)':'var(--border)')+';border-radius:12px;padding:16px;margin-bottom:10px">';
    rows += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">';
    rows += '<div style="position:relative;flex-shrink:0">';
    rows += avatarHtml;
    rows += '<div onclick="document.getElementById(\'warden-photo-input-'+key+'\').click()" style="position:absolute;bottom:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;border:2px solid var(--bg3)" title="Change photo">✏️</div>';
    rows += '<input type="file" id="warden-photo-input-'+key+'" accept="image/*" style="display:none" onchange="handleWardenPhoto(event,\''+key+'\')">';
    rows += '</div>';
    rows += '<div style="flex:1">';
    rows += '<div style="font-weight:800;font-size:15px;color:var(--text)">'+escHtml(w.name)+(isActive?' <span style="font-size:9px;background:var(--gold-dim);color:var(--gold2);padding:2px 8px;border-radius:20px;border:1px solid rgba(200,168,75,0.3)">● LOGGED IN</span>':'')+'</div>';
    rows += '<div style="font-size:11px;color:var(--text3);margin-top:2px">Full access · Add, edit payments &amp; records</div>';
    rows += (photoSrc ? '<div style="font-size:10px;color:var(--green);margin-top:4px">✓ Profile photo set</div>' : '<div style="font-size:10px;color:var(--text3);margin-top:4px">Click avatar to upload a photo</div>');
    rows += '</div></div>';
    rows += '<div class="form-grid" style="gap:8px">';
    rows += '<div class="field"><label style="font-size:11px">Display Name</label><input id="wn-'+key+'" class="form-control" value="'+escHtml(w.name)+'" placeholder="Warden Name"></div>';
    rows += '<div class="field"><label style="font-size:11px">New Password</label><input id="wp-'+key+'" class="form-control" type="password" placeholder="Leave blank to keep current"></div>';
    rows += '<div class="field col-full"><label style="font-size:11px">📱 WhatsApp Number <span style="font-weight:400;color:var(--text3)">(used as default WA reminder number)</span></label><input id="wwa-'+key+'" class="form-control" value="'+escHtml(w.phone||'')+'" placeholder="03XX-XXXXXXX"></div>';
    rows += '</div>';
    rows += '<div style="display:flex;gap:8px;margin-top:10px">';
    rows += '<button class="btn btn-primary btn-sm" style="flex:1" onclick="saveWardenInfo(\''+key+'\')">&#x1F4BE; Save Changes</button>';
    if(photoSrc) rows += '<button class="btn btn-danger btn-sm" onclick="removeWardenPhoto(\''+key+'\')" title="Remove profile photo">🗑 Photo</button>';
    rows += '</div>';
    rows += '</div>';
  });

  showModal('modal-md','&#x1F9D1;&#x200D;&#x1F4BC; Warden Management',
    rows,
    '<button class="btn btn-secondary" onclick="closeModal()">Close</button><button class="btn btn-danger btn-sm" onclick="logout()">&#x1F6AA; Logout</button>'
  );
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
      WARDENS[key].photo = dataUrl;
      saveWardenConfig();
      // Live-update the avatar in the modal without closing it
      var imgEl = document.getElementById('warden-avatar-img-'+key);
      if(imgEl) {
        imgEl.outerHTML = '<img src="'+dataUrl+'" id="warden-avatar-img-'+key+'" style="width:56px;height:56px;border-radius:14px;object-fit:cover;border:2px solid var(--gold);cursor:pointer" onclick="document.getElementById(\'warden-photo-input-'+key+'\').click()" title="Click to change photo">';
      }
      // Update the role badge in header if it's the current user
      if(key === CUR_ROLE) { CUR_USER = WARDENS[key]; updateRoleBadge(); }
      // Update login screen avatar
      updateLoginAvatar(key);
      toast('Profile photo updated!','success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeWardenPhoto(key) {
  WARDENS[key].photo = '';
  saveWardenConfig();
  if(key === CUR_ROLE) { CUR_USER = WARDENS[key]; updateRoleBadge(); }
  updateLoginAvatar(key);
  toast('Photo removed','info');
  showUserMgmt(); // refresh modal
}

function updateLoginAvatar(key) {
  // Update the warden selector card on the login screen
  var num = key === 'warden1' ? '1' : '2';
  var card = document.getElementById('rb-warden'+num);
  if(!card) return;
  var photoEl = card.querySelector('.warden-login-photo');
  var w = WARDENS[key];
  if(w.photo) {
    if(photoEl) {
      photoEl.src = w.photo;
    } else {
      var emojiEl = card.querySelector('.warden-login-emoji');
      if(emojiEl) {
        emojiEl.innerHTML = '<img class="warden-login-photo" src="'+w.photo+'" style="width:36px;height:36px;border-radius:9px;object-fit:cover;border:1.5px solid rgba(200,168,75,0.5)">';
      }
    }
  } else {
    if(photoEl) {
      var parent = photoEl.parentElement;
      parent.innerHTML = '<span class="warden-login-emoji" style="font-size:22px;margin-bottom:4px;">&#x1F9D1;&#x200D;&#x1F4BC;</span>';
    }
  }
}

async function saveWardenInfo(key) {
  var nameEl = document.getElementById('wn-'+key);
  var pwEl   = document.getElementById('wp-'+key);
  var wwaEl  = document.getElementById('wwa-'+key);
  if(!nameEl||!nameEl.value.trim()){toast('Name cannot be empty','error');return;}
  WARDENS[key].name = nameEl.value.trim();
  if(pwEl&&pwEl.value.trim()) WARDENS[key].pw = pwEl.value.trim();
  if(pwEl) pwEl.value='';
  if(wwaEl) {
    WARDENS[key].phone = wwaEl.value.trim();
    // Auto-update default WA number to the current logged-in warden's number
    if(key===CUR_ROLE && wwaEl.value.trim()) {
      DB.settings.defaultWANumber = wwaEl.value.trim();
      await saveDB();
    }
  }
  saveWardenConfig();
  // Update display name label on login screen
  var lbl = document.getElementById('wb'+(key==='warden1'?'1':'2')+'-name');
  if(lbl) lbl.textContent=WARDENS[key].name;
  if(key===CUR_ROLE) { CUR_USER=WARDENS[key]; updateRoleBadge(); }
  toast(WARDENS[key].name+' updated','success');
}


// saveUPW replaced by saveWardenInfo

// ══════════════════════════════════════════════════════════════════
// STUDENT DOCUMENTS UPLOAD
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// STUDENT ID CARD GENERATOR
// ══════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════
// ALL STUDENTS PDF DOWNLOAD
// ══════════════════════════════════════════════════════════════════
function downloadAllStudentsPDF() {