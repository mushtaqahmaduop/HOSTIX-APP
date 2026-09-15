/* ─── HOSTYLLO — APP ENTRY POINT (slim orchestrator) ─────────────────────────
   Modular structure (Phase E refactor):
   ┌─ src/config.js            ─ constants, DB schema default
   ├─ src/utils.js             ─ uid, escHtml, fmtDate, fmtPKR, debounce
   ├─ src/auth.js              ─ warden login, roles, session
   ├─ src/storage.js           ─ loadDB, saveDB (async, SQLite)
   ├─ src/license.js           ─ license check stubs
   ├─ src/receipt.js           ─ PDF receipt builder
   ├─ src/modules/theme.js     ─ toggleTheme, applySavedSidebar
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
/* THE DOCUMENT AND THE WINDOW IT OPENS IN ARE TWO THINGS (2026-09-10).
   Building the print bar into a report and choosing where to show it were one
   function, so the only way to test the bar was to force the transport down its
   popup fallback with a two-megabyte filler string — which stopped working the
   moment that fallback stopped being reachable in Electron, and was never what
   the test was about anyway. `_pdfInject` is the document; `_electronPDF` is
   the window. */
function _pdfInject(html, opts) {
  // Open a print-ready popup window — works in both Electron and browser.
  // User presses Ctrl+P (or the Print button) and selects "Save as PDF".
  // This avoids the native OS Save dialog that blocks the Electron renderer.
  opts = opts || {};
  var isLandscape = !!(opts && opts.landscape);
  /* THE PAPER IS THE HOSTEL'S (owner, 2026-09-15): Settings → Paper size,
     Letter unless another is picked. It used to be A4 here, which Chromium
     shrank onto the Letter paper in the tray. */
  var paper = (opts && typeof opts.pageSize === 'string' && opts.pageSize)
           || (typeof paperSize === 'function' ? paperSize() : 'Letter');
  /* §6 — the export specification's margins: 10–12mm portrait, 8–10mm
     landscape. A document built by the export engine declares its own @page,
     its own margins and its own print setup, so it is left alone. */
  var ownsPage = html.indexOf('name="hx-export"') !== -1;
  var pageCSS = ownsPage ? ''
    : '@page { size: ' + paper + (isLandscape ? ' landscape; margin: 9mm; }' : ' portrait; margin: 12mm; }');
  /* A document that brings no print setup gets one, so the window's Save as PDF
     prints it on the same paper and the same way round as its preview — every
     document outside the engine used to save as portrait A4 ("all the pdfs
     opens upright"). pdf-window-preload.js reads this. */
  var setupMeta = ownsPage ? '' : '<meta name="hx-export" content="' + escHtml(JSON.stringify({
    landscape: isLandscape, pageSize: paper,
    footer: String((opts && opts.footer) || ''), file: String((opts && opts.file) || ''),
  })) + '">';
  // Inject print CSS + a visible Print/Save button into the HTML
  var injected = html.replace('</head>', setupMeta +
    '<style>' + pageCSS +
    '@media print { .no-print { display:none!important; } body { background:#fff!important; } }' +
    /* THE CENTRE OF THE FILE HEADER (owner, 2026-09-09, third pass). Three
       positions in one day, and the reasoning is worth keeping because each
       move was a real fault:

         top-right  — sat on the letterhead's own document title and the
                      right-hand KPI tile, the two things the first glance is
                      for, and covered the closing figure of every register.
         bottom     — clear of the report, but the owner wants the controls
                      where the document announces itself, not at the far edge.
         top-centre — where it is now. The letterhead puts the brand hard left
                      and the document block hard right, so the middle of that
                      band is the one part of a Hostyllo report that is empty by
                      construction, at every size this window opens at.

       STILL `position:fixed`, not inside the header element. The bar has to be
       reachable on page nine of a register, and a control that scrolls away
       with the letterhead is the fault this started with — the button used to
       be appended before </body>, which put the only way to save a nine-page
       report at the end of the ninth page.

       THE CAPTION IS HIDDEN UNTIL IT HAS SOMETHING TO SAY. Standing text made
       the pill ~520px wide, wider than the gap between the brand and the title;
       what it said ("A4 · landscape · headings repeat on every page") is on the
       buttons as a tooltip instead. It reappears for the things that are
       actually news — Generating…, Saved: <path>, or a failure. */
    '@media screen { body { padding-top:56px; } }' +
    '.pdf-bar { position:fixed; left:50%; transform:translateX(-50%); top:12px;' +
      ' z-index:50; display:flex; flex-direction:row; align-items:center; gap:8px;' +
      ' padding:7px 9px; border-radius:999px; background:rgba(255,255,255,.97);' +
      ' border:1px solid #D9E2F2; box-shadow:0 6px 20px rgba(15,23,42,.16);' +
      ' font-family:sans-serif; max-width:calc(100vw - 32px); flex-wrap:nowrap; }' +
    '.pdf-bar__m { min-width:0; max-width:280px; font-size:11px; line-height:1.4;' +
      ' white-space:nowrap; overflow:hidden; text-overflow:ellipsis;' +
      ' color:#6B7A99; padding:0 4px; }' +
    '.pdf-bar__m:empty { display:none; }' +
    '.pdf-print-btn { flex:0 0 auto; }' +
    '.pdf-print-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:9px 16px; background:#155EEF; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:sans-serif; letter-spacing:0.2px; box-shadow:0 4px 14px rgba(21,94,239,.28); }' +
    '.pdf-print-btn--ghost { background:#fff; color:#123B8F; border:1px solid #D9E2F2; }' +
    '.pdf-print-btn[disabled] { opacity:.55; cursor:default; }' +
    /* THE GLYPHS NEED A SIZE HERE, BECAUSE NOTHING ELSE GIVES THEM ONE.
       icon() emits <svg class="icon"> and every dimension it has comes from the
       app's own stylesheet — which this document does not load. Unconstrained,
       an inline SVG takes its default 300×150 and then stretches to the flex
       line, which is why the two buttons filled a third of the window. */
    '.pdf-print-btn svg { width:15px; height:15px; flex:0 0 15px; }' +
    '</style></head>');

  /* The action bar. "Save as PDF" goes through the window's own bridge
     (pdf-window-preload.js), which prints the window from the MAIN process:
     A4, the right orientation, and a footer carrying "Page X of Y" on every
     sheet — none of which Chromium's print dialog can be made to do, and its
     own footer prints the temp file's file:// path across the bottom of an
     owner's report. window.print() stays as the second button, and as the
     only one when this document is open in a browser rather than the app. */
  var setup = 'A4 · ' + (isLandscape ? 'landscape' : 'portrait')
            + ' · headings repeat on every page';
  var btnHtml = '<div class="no-print pdf-bar">'
    + '<button class="pdf-print-btn" title="' + escHtml(setup) + '" onclick="__hxSavePdf(this)">'
    + icon('download','sm') + ' Download PDF</button>'
    + '<button class="pdf-print-btn pdf-print-btn--ghost" title="Open the system print dialog"'
    + ' onclick="window.print()">' + icon('print','sm') + ' Print</button>'
    + '<div id="__hxmsg" class="pdf-bar__m"></div>'
    + '<script>function __hxSavePdf(btn){'
    + 'var m=document.getElementById("__hxmsg");'
    + 'if(!(window.hostylloPdf&&window.hostylloPdf.save)){window.print();return;}'
    + 'btn.disabled=true;m.textContent="Generating PDF\\u2026";'
    + 'window.hostylloPdf.save().then(function(r){btn.disabled=false;'
    + 'm.textContent=r&&r.success?"Saved: "+r.filePath:(r&&r.reason==="cancelled"?"":(r&&r.reason)||"Export could not be generated. Please try again.");'
    + '}).catch(function(){btn.disabled=false;m.textContent="Export could not be generated. Please try again.";});}'
    + '<\/script>'
    + '</div>';
  // FIX-PRINT: Auto-print removed — calling window.print() automatically in a child
  // window.open() window hangs the Electron renderer on Windows. User presses the button.
  /* IN THE MARKUP EARLY, ON SCREEN AT THE BOTTOM. It was appended before </body>,
     which put the only way to save a nine-page register at the end of the ninth
     page. It goes in right after <body> so it exists before the report, and the
     CSS above fixes it under the window's close button; `no-print` keeps it off
     the paper either way. */
  var _bodyAt = injected.search(/<body[^>]*>/i);
  if (_bodyAt !== -1) {
    var _bodyEnd = injected.indexOf('>', _bodyAt) + 1;
    injected = injected.slice(0, _bodyEnd) + btnHtml + injected.slice(_bodyEnd);
  } else {
    injected = btnHtml + injected;
  }
  return injected;
}

function _electronPDF(html, suggestedName, opts) {
  opts = opts || {};
  // The suggested name travels with the print setup, for the window's Save as PDF.
  if (!opts.file && /\.pdf$/i.test(String(suggestedName || ''))) {
    opts = Object.assign({}, opts, { file: String(suggestedName).slice(0, 160) });
  }
  var injected = _pdfInject(html, opts);

  /* ── THE WINDOW IS OPENED BY THE MAIN PROCESS, NOT BY THIS ONE ────────────
     window.open() from the renderer is the one strategy this codebase has
     already learned hangs Electron on Windows, and it had been left here after
     being removed everywhere else: receipt.js says so in as many words ("No
     window.open() — that hangs the Electron renderer on Windows") and prints
     from the main window through an injected overlay instead, and
     doGenerateStudentsPDF() goes through electronAPI.openPdfWindow. This
     function is what every OTHER Print in the app calls — the student card,
     payments, expenses, reports, the archive, the visit sheet — so the hang
     the owner reported on the panel's Print button was every one of them.

     openPdfWindow writes the HTML to a temp file and loads it into a real
     top-level BrowserWindow, so the Print / Save as PDF button inside it is a
     window printing itself rather than a renderer printing a popup it owns.
     The renderer never blocks, which is why the app froze with the print.

     The popup stays as the browser fallback, and as the fallback for a
     document over the bridge's 2MB guard — silently dropping a report that is
     merely large would be worse than a slow window. */
  var _title = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1]
            || String(suggestedName || 'Report').replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
  /* IN ELECTRON THIS IS THE ONLY PATH, WHATEVER THE SIZE (owner brief,
     2026-09-10). The `&& injected.length <= 2MB` that used to be on this
     condition is the bug the brief describes: a complete register is bigger
     than 2MB of HTML, so the biggest and most-wanted reports — All Students,
     All Payments — skipped the bridge and fell through to the window.open()
     below, which the comment above says in as many words hangs the Electron
     renderer on Windows. "Blank page, half-loaded viewer, or no response" is
     that hang.

     The popup is the BROWSER fallback now, and only that: if the bridge is
     there we use it, and if it refuses we say why rather than reaching for the
     thing that freezes the app. */
  if (window.electronAPI && typeof window.electronAPI.openPdfWindow === 'function') {
    var _r = window.electronAPI.openPdfWindow(injected, _title);
    if (!_r || _r.ok !== false) return;
    if (typeof toast === 'function') toast(_r.reason, 'error');
    return;
  }

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
applySavedSidebar();
// loadSavedLogo() removed with the logo uploader — the mark is fixed in the markup.
updateSidebar(); // shows zeros/defaults until boot() completes

// #main must never scroll. `overflow:hidden` stops the user scrolling it but
// NOT the browser: focusing a control low in a long page makes Chromium scroll
// every ancestor that can move, hidden or not, and #main sliding up takes the
// header with it — under the fixed title bar, which is opaque and sits above
// everything. #content is the real scroller, so anything #main does is spurious.
(function pinMain() {
  const main = document.getElementById('main');
  if (!main) return;
  main.addEventListener('scroll', function () {
    if (main.scrollTop) main.scrollTop = 0;
    if (main.scrollLeft) main.scrollLeft = 0;
  }, { passive: true });
})();
// ─────────────────────────────────────────────────────────────────────────────


// ── BOOT — async startup ─────────────────────────────────────────────────────
(async function boot() {
  await loadDB();
  // After DB loads: migrate IDs, run auto-cancellations, refresh all UI
  if (typeof migrateStudentIdsToNumeric === 'function') migrateStudentIdsToNumeric();
  // One-off repair of student-name snapshots frozen into payment/cancellation
  // rows before an edit could push the correction down. Writes only when it
  // actually found something stale, so a healthy database costs one scan.
  if (typeof repairStudentSnapshots === 'function') {
    const _fixed = repairStudentSnapshots();
    if (_fixed > 0) {
      await saveDB();
      console.info('[HOSTYLLO] Re-synced ' + _fixed + ' stale student name(s) on payment records.');
    }
  }
  // Records that describe themselves wrongly — mess counted twice inside a
  // pre-split rent, a mess tick left on a month billed rent-only, and instalment
  // trails claiming collections that never happened. Money is never moved; see
  // repairPaymentComposition() for what each case proves before it touches
  // anything. Silent on a healthy database.
  if (typeof repairPaymentComposition === 'function') {
    const _rp = repairPaymentComposition();
    const _rpTotal = _rp.drift + _rp.messFlag + _rp.students + _rp.dupEntries + _rp.ghostTrails;
    if (_rpTotal > 0) {
      // A repaired record is a changed record, so the ledger hears of it. On the
      // first boot this posts nothing: the import below has not run yet.
      if (typeof ledgerTrackAll === 'function') ledgerTrackAll('Record repaired at start-up');
      await saveDB();
      console.info('[HOSTYLLO] Repaired payment composition: ' + JSON.stringify(_rp));
    }
  }
  // Existing payment history enters the student ledger once — AFTER the repairs
  // above, so it is imported as repaired (warden ledger schema Q17).
  if (typeof ledgerImportIfEmpty === 'function' && ledgerImportIfEmpty() > 0) await saveDB();
  // Every collection line gets its handover status row once (warden ledger step 4).
  if (typeof handoverSync === 'function' && handoverSync() > 0) await saveDB();
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
  // Run scheduled checks.
  //
  // Payment records are NOT among them. Booting the app used to raise a Pending
  // row against every active student for any month that had rolled over since
  // the last launch — money the warden had never entered, appearing in the
  // ledger and in every total that reads it. Rent records are now created only
  // when the warden asks for them, with Auto-Generate Month on the Payments
  // screen (generateMonthlyRents) or by recording a payment.
  if (typeof checkAutoBackupSchedule  === 'function') checkAutoBackupSchedule();
  // Navigate to dashboard last (after all data is ready)
  if (typeof navigate === 'function') navigate('dashboard');
})();


// ── KEYBOARD SHORTCUTS: Escape = close modal, Enter = save form ───────────────
document.addEventListener('keydown', function(e) {
  /* ALT+LEFT GOES BACK — the shortcut every browser and file manager on this
     platform uses for it, so it needs no teaching. It defers to a modal: while
     one is open, Back would step the page out from under it. It also stays out
     of text fields, where Alt+Left is a word-wise cursor move. */
  if (e.altKey && e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
    if (document.querySelector('.modal-overlay')) return;
    const t = document.activeElement;
    const tag = t ? (t.tagName || '').toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    if (typeof goBack === 'function') { e.preventDefault(); goBack(); }
    return;
  }

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
// 'all' | 'maintenance' | 'complaints'. v5 lands on the unified feed the
// reference design shows; nav.js still forces a single kind for the
// /maintenance and /complaints routes.
var issuesTab = 'all';


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

