/* ─── HOSTIX — APP ENTRY POINT (slim orchestrator) ─────────────────────────
   Modular structure (Phase E refactor):
   ┌─ src/config.js            ─ constants, DB schema default
   ├─ src/utils.js             ─ uid, escHtml, fmtDate, fmtPKR, debounce
   ├─ src/auth.js              ─ warden login, roles, session
   ├─ src/storage.js           ─ loadDB, saveDB (async, SQLite)
   ├─ src/license.js           ─ license check stubs
   ├─ src/receipt.js           ─ PDF receipt builder
   ├─ src/modules/theme.js     ─ toggleTheme, applySavedTheme
   ├─ src/modules/nav.js       ─ navigate, renderPage, updateSidebar
   ├─ src/modules/dashboard.js ─ renderDashboard, calcRevenue, charts, search
   ├─ src/modules/cancellations.js
   ├─ src/modules/rooms.js
   ├─ src/modules/students.js
   ├─ src/modules/payments.js
   ├─ src/modules/expenses.js
   ├─ src/modules/reports.js
   ├─ src/modules/settings.js
   ├─ src/modules/modals.js
   ├─ src/modules/sidebar_calendar.js
   ├─ src/modules/issues.js
   └─ app.js                   ─ YOU ARE HERE — boot, keyboard shortcuts, misc
   ─────────────────────────────────────────────────────────────────────────── */

// ── SAFE WINDOW HELPER ───────────────────────────────────────────────────────
// safeOpenWindow(width, height) is defined in src/utils.js (loads before app.js).
// Do NOT duplicate here — it opens with scrollbars/resizable and a 1000x720 default.

// ── ELECTRON PDF HELPER (Issue 1) ────────────────────────────────────────────
// Unified PDF function: uses Electron native printToPDF when available (saves
// to a file the user picks), falls back to popup + browser print dialog.
// opts: { landscape: bool, pageSize: 'A4'|'Letter' }
function _electronPDF(html, suggestedName, opts) {
  // Open a print-ready popup window — works in both Electron and browser.
  // User presses Ctrl+P (or the Print button) and selects "Save as PDF".
  // This avoids the native OS Save dialog that blocks the Electron renderer.
  opts = opts || {};
  var isLandscape = !!(opts && opts.landscape);
  var pageCSS = isLandscape
    ? '@page { size: A4 landscape; margin: 10mm; }'
    : '@page { size: A4; margin: 18mm; }';
  // Inject print CSS + a visible Print/Save button into the HTML
  var injected = html.replace('</head>',
    '<style>' + pageCSS +
    '@media print { .no-print { display:none!important; } body { background:#fff!important; } }' +
    '.pdf-print-btn { display:block; margin:16px auto; padding:10px 40px; background:#1e5fd4; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:700; cursor:pointer; font-family:sans-serif; letter-spacing:0.5px; }' +
    '</style></head>');
  // Insert a prominent Save PDF button before </body>
  var btnHtml = '<div class="no-print" style="text-align:center;padding:16px 0 8px">'
    + '<button class="pdf-print-btn" onclick="window.print()">' + icon('print','sm') + ' Print / Save as PDF</button>'
    + '<div style="font-size:11px;color:#888;margin-top:6px;font-family:sans-serif">In the print dialog: set Destination → Save as PDF</div>'
    + '</div>';
  // FIX-PRINT: Auto-print removed — calling window.print() automatically in a child
  // window.open() window hangs the Electron renderer on Windows. User presses the button.
  injected = injected.replace('</body>', btnHtml + '</body>');
  // PERF/UX: open the popup and paint a lightweight "Generating…" placeholder
  // IMMEDIATELY, then write the (potentially large) report HTML on the next tick.
  // Parsing a big document.write blob is what made the window appear ~1s late;
  // showing the shell first makes it feel instant. (Fixes: PDF opens 1s later.)
  var w = window.open('', '_blank', 'width=900,height=800,scrollbars=yes,resizable=yes');
  if (!w) { if (typeof toast === 'function') toast('⚠️ Allow popups for this app to open PDFs.', 'error'); return; }
  w.document.open();
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Generating report…</title></head>'
    + '<body style="margin:0;font-family:Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#555">'
    + '<div style="text-align:center"><div style="font-size:15px;font-weight:600">Generating report…</div>'
    + '<div style="font-size:12px;color:#999;margin-top:6px">Please wait a moment.</div></div></body></html>');
  w.document.close();
  setTimeout(function () {
    if (w.closed) return;
    w.document.open();
    w.document.write(injected);
    w.document.close();
  }, 0);
}
// ─────────────────────────────────────────────────────────────────────────────
// Cancelling students do NOT count toward occupancy — their seat is immediately freed


async function processAutoCancellations() {
  var todayStr = today(); // returns "YYYY-MM-DD"
  var count = 0;
  (DB.cancellations||[]).forEach(function(c) {
    if (c.status !== 'Pending') return;
    if (!c.vacateDate)          return;
    if (c.vacateDate > todayStr) return; // future — not yet
    // Vacate date reached or passed → auto-confirm
    c.status          = 'Confirmed';
    c.autoConfirmedAt = todayStr;
    var student = DB.students.find(function(s){ return s.id === c.studentId; });
    if (student && student.status !== 'Left' && student.status !== 'Transferred') {
      student.status   = 'Left';
      student.leftDate = c.vacateDate;
    }
    count++;
  });
  if (count > 0) {
    await saveDB();
    console.log('[Auto-Confirm] '+count+' cancellation(s) auto-confirmed on boot.');
  }
}
// ── Pre-boot: theme/logo/sidebar don't need DB — run immediately ─────────────
applySavedTheme();
applySavedSidebar();
loadSavedLogo();
updateSidebar(); // shows zeros/defaults until boot() completes
// ─────────────────────────────────────────────────────────────────────────────


// ── BOOT — async startup ─────────────────────────────────────────────────────
(async function boot() {
  await loadDB();
  // After DB loads: migrate IDs, run auto-cancellations, refresh all UI
  if (typeof migrateStudentIdsToNumeric === 'function') migrateStudentIdsToNumeric();
  await processAutoCancellations();
  // Sync login screen hostel name now that DB is loaded
  const loginNameEl = document.getElementById('login-hostel-name');
  if (loginNameEl && DB.settings && DB.settings.hostelName) {
    loginNameEl.textContent = DB.settings.hostelName;
  }
  // Update header date
  const hdrDate = document.getElementById('hdr-date');
  if (hdrDate) {
    hdrDate.textContent =
      new Date().toLocaleDateString('en-PK', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  }
  // Refresh sidebar counts and calendar now that data is loaded
  if (typeof updateSidebar         === 'function') updateSidebar();
  if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
  // Run scheduled checks
  if (typeof checkAutoMonthAdvance    === 'function') checkAutoMonthAdvance();
  if (typeof checkAutoBackupSchedule  === 'function') checkAutoBackupSchedule();
  // Navigate to dashboard last (after all data is ready)
  if (typeof navigate === 'function') navigate('dashboard');
})();


// ── KEYBOARD SHORTCUTS: Escape = close modal, Enter = save form ───────────────
document.addEventListener('keydown', function(e) {
  // Escape: close any open modal
  if (e.key === 'Escape') {
    const modal = document.querySelector('.modal-overlay');
    if (modal) { closeModal(); return; }
    // Also clear global search if open
    const srch = document.getElementById('dash-global-search');
    if (srch && document.activeElement === srch) { srch.value=''; dashGlobalSearchClear(); }
    return;
  }

  // Enter: click the primary save/submit button inside the active modal
  if (e.key === 'Enter') {
    const active = document.activeElement;
    // Don't intercept Enter inside textareas (multi-line) or selects
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
    // Don't intercept Enter when already on a button
    if (active && active.tagName === 'BUTTON') return;
    const modal = document.querySelector('.modal');
    if (!modal) return;
    // Find the last .btn-primary in the modal footer — that's always the Save/Submit button
    const footer = modal.querySelector('.modal-footer');
    if (!footer) return;
    const primaryBtn = Array.from(footer.querySelectorAll('.btn-primary')).pop();
    if (primaryBtn && !primaryBtn.disabled) { e.preventDefault(); primaryBtn.click(); }
    return;
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// ── ARROW KEY NAVIGATION IN FORMS ────────────────────────────────────────────
// ArrowDown / ArrowUp moves focus to the next/previous focusable field inside
// any modal or filter-bar form. Works on input, select, and textarea elements.
document.addEventListener('keydown', function(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const active = document.activeElement;
  if (!active) return;
  const tag = active.tagName;
  // Only trigger inside input/select/textarea — but not multi-line textarea scrolling
  if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;
  // For inputs with type text/number/date/password, not range/checkbox/radio
  const skipTypes = ['range','checkbox','radio','file','hidden','submit','button','reset'];
  if (tag === 'INPUT' && skipTypes.includes(active.type)) return;
  // Find all focusable fields in the closest modal or form container
  const container = active.closest('.modal, .filter-bar, #content') || document;
  const fields = Array.from(container.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])'))
    .filter(el => el.offsetParent !== null); // only visible elements
  const idx = fields.indexOf(active);
  if (idx === -1) return;
  let next = -1;
  if (e.key === 'ArrowDown') next = idx + 1 < fields.length ? idx + 1 : 0;
  if (e.key === 'ArrowUp')   next = idx - 1 >= 0 ? idx - 1 : fields.length - 1;
  if (next !== -1) {
    e.preventDefault();
    fields[next].focus();
    // Select text in inputs for easy overwrite
    if (fields[next].tagName === 'INPUT' && fields[next].select) {
      try { fields[next].select(); } catch(_) {}
    }
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// COMBINED ISSUES PAGE (Complaints & Maintenance tabs)
// ══════════════════════════════════════════════════════════════════
var issuesTab = 'maintenance';


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
function toggleSettingsDropdown() {
  const dd = document.getElementById('settings-dropdown');
  const ch = document.getElementById('settings-chevron');
  if (!dd) return;
  const open = dd.style.display === 'block';
  dd.style.display = open ? 'none' : 'block';
  if (ch) ch.style.transform = open ? '' : 'rotate(180deg)';
}

// ── FORMER STUDENTS — search & restore ─────────────────────────────────────
// NOTE: showFormerStudentsModal() is defined in src/modules/students.js


// ── CLEAR ALL DATA ───────────────────────────────────────────────────────────
// Defined in expenses.js (password-protected). Do NOT duplicate here.
// ─────────────────────────────────────────────────────────────────────────────

// ── INPUT AUTO-FORMAT ────────────────────────────────────────────────────────
// fmtPhone / fmtCnic / fmtEmail / getEmailValue are defined in
// src/modules/students.js (loads before app.js). Do NOT duplicate here.
// ─────────────────────────────────────────────────────────────────────────────

// ── CANCELLATION DOWNLOAD REPORT ─────────────────────────────────────────────

// ── CITY AUTOCOMPLETE ────────────────────────────────────────────────────────
const PK_CITIES = [
  // KPK & FATA (primary — hostel is in Peshawar)
  'Peshawar','Mardan','Nowshera','Charsadda','Swabi','Swat','Mingora','Abbottabad',
  'Mansehra','Haripur','Kohat','Hangu','Karak','Bannu','Lakki Marwat','Tank',
  'Dera Ismail Khan','Chitral','Dir','Lower Dir','Upper Dir','Shangla','Buner',
  'Malakand','Batkhela','Timergara','Matta','Kabal','Barikot','Daggar','Alpuri',
  'Chakdara','Parachinar','Kurram','North Waziristan','South Waziristan','Mohmand',
  'Bajaur','Khyber','Landi Kotal','Jamrud','Bara','Wana','Razmak','Miranshah',
  'Orakzai','Darra Adam Khel','Khar','Nawagai','Ghazi','Havelian','Doaba',
  // Punjab
  'Lahore','Faisalabad','Rawalpindi','Gujranwala','Multan','Sialkot','Bahawalpur',
  'Sargodha','Sheikhupura','Jhang','Rahim Yar Khan','Gujrat','Kasur','Dera Ghazi Khan',
  'Sahiwal','Okara','Wah Cantonment','Mianwali','Pakpattan','Attock','Muzaffargarh',
  'Khanewal','Chiniot','Jhelum','Hafizabad','Chakwal','Khushab','Mandi Bahauddin',
  'Narowal','Toba Tek Singh','Vehari','Lodhran','Bahawalnagar','Layyah',
  // Sindh
  'Karachi','Hyderabad','Sukkur','Larkana','Nawabshah','Mirpur Khas','Jacobabad',
  'Shikarpur','Khairpur','Dadu','Badin','Thatta','Umerkot','Sanghar','Tando Allahyar',
  // Balochistan
  'Quetta','Turbat','Khuzdar','Gwadar','Hub','Chaman','Sibi','Dera Murad Jamali',
  'Loralai','Kharan','Nushki','Panjgur','Mastung','Kalat',
  // Islamabad & AJK & GB
  'Islamabad','Muzaffarabad','Mirpur','Rawalakot','Gilgit','Skardu','Hunza',
  'Ghanche','Ghizer','Astore','Chilas',
];

function cityAutocomplete(input) {
  const val = input.value.trim().toLowerCase();
  const box = document.getElementById('f-taddress-suggestions');
  if (!box) return;
  if (val.length < 2) { box.classList.remove('open'); box.innerHTML=''; return; }
  const matches = PK_CITIES.filter(c => c.toLowerCase().includes(val)).slice(0, 8);
  if (!matches.length) { box.classList.remove('open'); box.innerHTML=''; return; }
  box.innerHTML = matches.map(c => {
    const hi = c.replace(new RegExp('('+val.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')', 'gi'), '<b>$1</b>');
    return `<div class="city-suggestion-item" onmousedown="pickCity('${c.replace(/'/g,"\\'")}','${input.id}')">${hi}</div>`;
  }).join('');
  box.classList.add('open');
  // Position relative to parent field
  const parent = input.parentElement;
  if(parent) parent.style.position = 'relative';
}

function pickCity(city, inputId) {
  const inp = document.getElementById(inputId);
  if (inp) {
    // Append city to existing text if there's already something typed, else just set city
    const cur = inp.value.trim();
    // If user typed a partial word, replace that last word with the city
    const words = cur.split(',');
    words[words.length-1] = ' ' + city;
    inp.value = words.join(',').replace(/^\s*,\s*/,'').trim() + ', ';
    inp.focus();
  }
  hideCitySuggestions();
}

function hideCitySuggestions() {
  setTimeout(()=>{
    const box = document.getElementById('f-taddress-suggestions');
    if(box){ box.classList.remove('open'); box.innerHTML=''; }
  }, 150);
}
// ─────────────────────────────────────────────────────────────────────────────

