// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the three PDF exports, and the order everything comes out in
//
// Students, Payments and Expenses each grew an Export PDF on 2026-08-31. They
// share one export engine (src/export/engine.js) precisely so they cannot
// drift into three documents that look like they came from three products.
//
// The header band is the engine's now: HOSTYLLO and "Hostel Management System"
// on the left, the DOCUMENT's name and the hostel on the right. So .title
// holds the report and .subtitle holds the hostel and the period - the
// opposite of the pre-engine layout, and the reason these assertions moved.
//
// What these tests actually guard:
//
//   1. ROOM ORDER. The owner's rule is that every list, page, CSV and PDF is
//      ordered by room number ascending. A warden reads a printed roster while
//      walking the building, so name order sends them up and down the stairs
//      for every second student. Room numbers are STRINGS here — the Add Room
//      form accepts "A 01" — so this is also the test that `Number(r.number)`
//      never comes back: it would drop lettered rooms to the end and order
//      1, 10, 11, 2.
//
//   2. THE WHOLE MONTHLY CHARGE. Rent and mess live in separate fields and
//      every document used to quote the rent half alone. A sheet that says
//      8,000 next to a 14,500 payment cannot be reconciled by the person
//      holding it.
//
//   3. THE EXPENSES CATEGORY SCOPE. One category selected prints that category;
//      All Categories prints a table per category with its own subtotal, not
//      one flat table that leaves the adding-up to the reader.
//
// `_electronPDF` opens a window, so it is stubbed: what is asserted is the
// document that would have been printed, which is the part that can be wrong.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  };
}

async function openApp() {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1500, height: 950 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForTimeout(700);
  return { app, win };
}

/* Rooms deliberately seeded OUT of order, and deliberately including a
   lettered one. Insertion order is 10, 2, A 01, 1 — so a document that comes
   out in that order is not sorting at all, and one that puts "A 01" last is
   sorting with Number(). */
async function seed(win) {
  await win.evaluate(async () => {
    const d  = new Date();
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    window.__MK = mk;
    DB.settings.hostelName = 'Test Hostel';
    DB.settings.roomTypes = [{ id: 'rt1', name: '2-Seater', capacity: 2, defaultRent: 8000, defaultMess: 6500 }];
    DB.rooms = [
      { id: 'r10', number: '10',   floor: 'Ground', typeId: 'rt1' },
      { id: 'r2',  number: '2',    floor: 'Ground', typeId: 'rt1' },
      { id: 'rA',  number: 'A 01', floor: '1st',    typeId: 'rt1' },
      { id: 'r1',  number: '1',    floor: 'Ground', typeId: 'rt1' },
    ];
    DB.students = [
      { id: 's10', name: 'Ten Room',    roomId: 'r10', status: 'Active', joinDate: mk + '-01', phone: '0300-0000010' },
      { id: 's2',  name: 'Two Room',    roomId: 'r2',  status: 'Active', joinDate: mk + '-01', phone: '0300-0000002' },
      { id: 'sA',  name: 'Lettered',    roomId: 'rA',  status: 'Active', joinDate: mk + '-01', phone: '0300-0000001' },
      { id: 's1',  name: 'One Room',    roomId: 'r1',  status: 'Active', joinDate: mk + '-01', phone: '0300-0000011' },
    ];
    DB.payments = DB.students.map((s, i) => ({
      id: 'p' + i, studentId: s.id, studentName: s.name,
      roomNumber: DB.rooms.find(r => r.id === s.roomId).number,
      monthlyRent: 8000, messCharge: 6500, messIncluded: true,
      amount: 14500, unpaid: 0, admissionFee: 0, extraCharges: [],
      method: 'Cash', month: mk, date: mk + '-05', status: 'Paid',
    }));
    DB.expenses = [
      { id: 'e1', date: mk + '-02', category: 'Electricity', description: 'Bill', amount: 12000 },
      { id: 'e2', date: mk + '-03', category: 'Cleaning',    description: 'Sweeper', amount: 4000 },
      { id: 'e3', date: mk + '-04', category: 'Electricity', description: 'Generator fuel', amount: 8000 },
      { id: 'e4', date: mk + '-05', category: 'Water',       description: 'Tanker', amount: 3000 },
    ];
    await saveDB();
  });
}

// Stub the PDF window and hand back the document that would have been printed.
async function capture(win, fn) {
  return win.evaluate((call) => {
    const real = window._electronPDF;
    let got = null;
    window._electronPDF = (html, name, opts) => { got = { html, name, opts }; };
    try { window[call](); } finally { window._electronPDF = real; }
    if (!got) return null;
    // Row order as the reader sees it: the first cell of every body row.
    const doc = new DOMParser().parseFromString(got.html, 'text/html');
    return {
      name: got.name,
      landscape: !!(got.opts && got.opts.landscape),
      title: (doc.querySelector('.title') || {}).textContent || '',
      subtitle: (doc.querySelector('.subtitle') || {}).textContent || '',
      headers: [...doc.querySelectorAll('thead th')].map(t => t.textContent.trim()),
      firstCells: [...doc.querySelectorAll('tbody tr')].map(
        r => (r.children[0] ? r.children[0].textContent.trim() : '')),
      secondCells: [...doc.querySelectorAll('tbody tr')].map(
        r => (r.children[1] ? r.children[1].textContent.trim() : '')),
      groups: [...doc.querySelectorAll('.group__t')].map(g => g.textContent.trim()),
      subtotals: [...doc.querySelectorAll('tr.subtotal')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
      grand: (doc.querySelector('.grand__v') || {}).textContent || '',
      text: doc.body.textContent.replace(/\s+/g, ' '),
    };
  }, fn);
}

test('the student roster prints in room order, lettered rooms included', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => renderPage('students'));
  await win.waitForTimeout(600);

  const doc = await capture(win, 'exportStudentsPDF');
  expect(doc, 'no document was produced').not.toBeNull();

  // Seeded 10, 2, A 01, 1. Ascending is 1, 2, 10, then the lettered room.
  const rooms = await win.evaluate(() =>
    studentsFiltered().map(t => { const r = DB.rooms.find(x => x.id === t.roomId); return r ? r.number : ''; }));
  expect(rooms, 'the roster is not in ascending room order').toEqual(['1', '2', '10', 'A 01']);

  // Section 32: Hostyllo_<Module>_<Scope>_<Date>
  expect(doc.name).toMatch(/^Hostyllo_Students_.*\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(doc.landscape, 'eighteen columns need the long edge').toBe(true);
  expect(doc.title).toBe('Student Roster');
  expect(doc.subtitle).toContain('Test Hostel');
  /* 'Charge / mo' became 'Charges (Rs.)' — the owner's sheet, then the brief of
     2026-09-10, which asks for Rs. rather than PKR in a currency heading. */
  expect(doc.headers).toContain('Charges (Rs.)');
  // Section 16: an export must state the scope it was taken under.
  expect(doc.text).toContain('Scope');
  expect(doc.text).toContain('Generated');

  await app.close();
});

test('every printed monthly charge carries the mess, not just the rent', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => renderPage('payments'));
  await win.waitForTimeout(600);

  const doc = await capture(win, 'exportPaymentsPDF');
  expect(doc).not.toBeNull();

  // 8,000 rent + 6,500 mess = 14,500 — the figure that was missing everywhere.
  /* "14,500.00": the owner's edits of 2026-09-10 set the money shape to two
     decimals with a thousands separator, and moved the currency to the heading
     rather than the cell. */
  expect(doc.text, 'the sheet quotes the rent half alone').toContain('14,500.00');
  /* THE TWO HALVES ARE COLUMNS NOW (`payments excel redesign.png`,
     2026-09-10), which is a stronger form of the same fact than the coverage
     label that briefly replaced the sub-line: the printed register reconciles
     cell by cell, and 8,000 + 6,500 has to come to the 14,500 asserted above.

     The bug this test exists for is unchanged and still asserted on the line
     above: the printed charge is the ALL-IN figure, never the rent alone. */
  /* NO SEPARATE RENT AND MESS COLUMNS (owner, 2026-09-14, replacing the
     2026-09-10 split): the Charges column carries the month's whole
     "Rent + Mess" charge, and the split lives in Settings and the form. */
  expect(doc.headers).toContain('Charges (Rs.)');
  expect(doc.headers).not.toContain('Rent (Rs.)');
  expect(doc.headers).not.toContain('Mess (Rs.)');
  expect(doc.text, 'the old two-number sub-line is back').not.toContain('rent + PKR');
  /* …and it comes out in room order too. The FIRST cell is the row's number
     since the owner's sheet added a `#` column, so room order is read from the
     second — which is the column the ordering is actually about. */
  expect(doc.secondCells).toEqual(['1', '2', '10', 'A 01']);

  await app.close();
});

test('expenses print one category when one is chosen', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => { expFilter.cat = 'Electricity'; renderPage('expenses'); });
  await win.waitForTimeout(600);

  const doc = await capture(win, 'exportExpensesPDF');
  expect(doc).not.toBeNull();

  // The document's own name is .title now, and the category rides in the
  // filename as part of the scope - a file holding only the electricity rows,
  // named for the month alone, gets forwarded as if it were the whole spend.
  expect(doc.title).toContain('Electricity');
  expect(doc.name).toContain('Electricity');
  // Only that category's two records, and only its total.
  expect(doc.firstCells.length).toBe(3);          // 2 records + the subtotal row
  expect(doc.text).not.toContain('Tanker');
  expect(doc.grand).toContain('20,000');          // 12,000 + 8,000

  await win.evaluate(() => { expFilter.cat = 'All'; });
  await app.close();
});

test('all categories print as a table each, with a subtotal and a grand total', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => { expFilter.cat = 'All'; renderPage('expenses'); });
  await win.waitForTimeout(600);

  const doc = await capture(win, 'exportExpensesPDF');
  expect(doc).not.toBeNull();

  // A table per category, largest spend first — the order the question
  // "where did the money go" is asked in.
  expect(doc.groups).toEqual(['Electricity', 'Cleaning', 'Water']);
  expect(doc.subtotals.length, 'each category needs its own total').toBe(3);
  expect(doc.subtotals[0]).toContain('20,000');
  expect(doc.grand).toContain('27,000');          // 12,000 + 8,000 + 4,000 + 3,000

  await app.close();
});

/* ════════════════════════════════════════════════════════════════════════════
   THE PRINT WINDOW IS OPENED BY THE MAIN PROCESS (owner, 2026-09-06:
   "print button hangs the print and also the app").

   window.open() from the renderer is the one strategy this codebase has already
   learned hangs Electron on Windows. It had been removed twice — receipt.js
   says so in as many words and prints from the main window through an injected
   overlay, and doGenerateStudentsPDF() goes through electronAPI.openPdfWindow —
   but _electronPDF() still had it, and _electronPDF is what every OTHER Print
   in the app calls: the student card, payments, expenses, reports, the archive,
   the visit sheet. One popup, every Print button.

   This pins the transport rather than the document: openPdfWindow is called,
   window.open is NOT, and the HTML that goes over the bridge is the real
   report and not the "Generating report…" placeholder the popup path painted
   first. The fallback stays for a browser, which is why the assertion is on
   the Electron path being PREFERRED, not on window.open being deleted.
   ════════════════════════════════════════════════════════════════════════════ */
test('every Print opens its window through the main process, never window.open', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => { expFilter.cat = 'All'; renderPage('expenses'); });
  await win.waitForTimeout(600);

  /* The bridge CANNOT be stubbed — contextBridge.exposeInMainWorld defines
     electronAPI non-writable AND non-configurable, so both a property
     assignment and a defineProperty shadow fail (the first silently, which is
     worse: the test then reads a 0 that means "not stubbed", not "not called").
     So this asserts the real thing instead, which is the better evidence
     anyway: window.open is never called, and a second REAL BrowserWindow
     appears carrying the report. Only the main process can produce that. */
  const before = app.windows().length;
  const out = await win.evaluate(() => {
    const realOpen = window.open;
    let opened = 0;
    window.open = function () { opened++; return null; };
    try { exportExpensesPDF(); } finally { window.open = realOpen; }
    return { opened,
      hasBridge: !!(window.electronAPI && typeof window.electronAPI.openPdfWindow === 'function') };
  });

  expect(out.hasBridge, 'the main-process PDF bridge is missing').toBe(true);
  expect(out.opened, 'window.open is the call that hangs the renderer').toBe(0);

  await expect.poll(() => app.windows().length, { timeout: 10000 })
    .toBeGreaterThan(before);

  const pdfWin = app.windows().find(w => w !== win);
  await pdfWin.waitForLoadState('domcontentloaded');
  const html = await pdfWin.content();
  // The real document, not the "Generating report…" shell the popup path painted.
  /* The bar carries TWO controls now, and this used to name a third that no
     longer exists: the single "Print / Save as PDF" button was split on
     2026-09-09 into "Download PDF" (main-process printToPDF, which is the only
     path that can put "Page X of Y" on every sheet) and "Print" (Chromium's own
     dialog, kept as the second button). The assertion is on the save control
     being present, so it follows the control that does the saving. */
  expect(html).toContain('Download PDF');
  expect(html).not.toContain('Generating report');
  expect(html).toContain('Electricity');

  await app.close();
});

/* ════════════════════════════════════════════════════════════════════════════
   THE REPORT WINDOW CAN SAVE A REAL PDF

   The window opened by `open-pdf-window` is a plain BrowserWindow loading a
   temp file, and its only exit used to be `window.print()` — Chromium's print
   dialog, whose page numbering is a checkbox the user has to find and whose
   footer prints the temp file's file:// path across the bottom of an owner's
   report. It has a preload now (pdf-window-preload.js) so it can ask the MAIN
   process to print ITSELF: A4, the right orientation, and the export
   specification's footer (hostel, and "Page X of Y" on every sheet).

   If the preload is ever dropped from the BrowserWindow options this does not
   throw — the button silently falls back to window.print() and the footer
   quietly reverts. Hence a test that looks for the bridge itself.
   ════════════════════════════════════════════════════════════════════════════ */
test('the report window gets its save bridge', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => renderPage('students'));
  await win.waitForTimeout(500);

  const pdfWinPromise = app.waitForEvent('window');
  await win.evaluate(() => exportStudentsPDF());
  const pdfWin = await pdfWinPromise;
  await pdfWin.waitForLoadState('domcontentloaded');
  await pdfWin.waitForTimeout(500);

  const bridge = await pdfWin.evaluate(() => ({
    hasBridge: typeof window.hostylloPdf === 'object' && typeof window.hostylloPdf.save === 'function',
    meta: (document.querySelector('meta[name="hx-export"]') || {}).content || null,
    buttons: [...document.querySelectorAll('.pdf-print-btn')].map(b => b.textContent.trim()),
  }));
  expect(bridge.hasBridge, 'the report window has no save bridge').toBe(true);
  expect(JSON.parse(bridge.meta).landscape).toBe(true);
  expect(JSON.parse(bridge.meta).file).toMatch(/^Hostyllo_Students_.*\.pdf$/);
  await pdfWin.close();
  await app.close();
});

/* ════════════════════════════════════════════════════════════════════════════
   DOWNLOAD PDF WRITES A COMPLETE PDF, AND HANDS IT TO THE SYSTEM VIEWER.

   The owner reported the button "producing a blank page, half-loaded viewer,
   or no response". The document and the save were never the problem — this
   test proves both — and the ending was the fault: the handler wrote the file
   and called `shell.showItemInFolder`, which pops Explorer with the file
   highlighted and leaves the opening to the user.

   ONE WRONG TURN ON THE WAY, WORTH RECORDING. A pass in between opened the PDF
   in an Electron BrowserWindow instead, on the reading that this machine had
   no PDF handler at all — `assoc .pdf` reported none. That reading was wrong:
   `assoc` only sees the classic HKCR table, not the per-user UserChoice
   association Edge registers, and openPath resolves to '' here. And the window
   did not work: Chromium's PDF viewer is an extension, not something a plain
   BrowserWindow gets from `plugins:true`, so it rendered a body of ten
   characters with no <embed> — a dark, empty window carrying only the
   document's name, which is what the owner saw after every download.

   So: `shell.openPath`. What this test can assert without the OS is everything
   up to that point, which is where every real failure has been — a complete,
   valid, reopenable file, and no window left showing nothing.
   ════════════════════════════════════════════════════════════════════════════ */
test('Download PDF writes a complete, valid PDF and opens no empty window', async () => {
  const { app, win } = await openApp();
  await seed(win);

  const target = await app.evaluate(async ({ dialog, app: eapp }) => {
    const out = eapp.getPath('temp').replace(/[\\/]+$/, '') + '\\hx_test_' + Date.now() + '.pdf';
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: out });
    globalThis.__hxTestPdf = out;
    return out;
  });

  await win.evaluate(() => renderPage('students'));
  await win.waitForTimeout(400);
  const reportPromise = app.waitForEvent('window');
  await win.evaluate(() => exportStudentsPDF());
  const report = await reportPromise;
  await report.waitForLoadState('domcontentloaded');
  await report.waitForTimeout(400);

  const saved = await report.evaluate(() => window.hostylloPdf.save());
  expect(saved.success, 'the save failed: ' + (saved.reason || '')).toBe(true);
  expect(saved.filePath).toBe(target);
  expect(saved.opened, 'the PDF was saved but nothing opened it').toBe(true);

  await report.waitForTimeout(1200);

  const out = await app.evaluate(async ({ BrowserWindow }) => {
    const fs = process.mainModule ? process.mainModule.require('fs') : null;
    const fp = globalThis.__hxTestPdf;
    let head = '', tail = '', size = -1, pages = 0;
    try {
      const b = fs.readFileSync(fp);
      size = b.length;
      head = b.slice(0, 5).toString('latin1');
      tail = b.slice(Math.max(0, b.length - 1024)).toString('latin1');
      pages = (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    } catch (e) {}
    return { size, head, hasEof: tail.indexOf('%%EOF') !== -1, pages,
      /* Nothing may be left on screen pointing at a .pdf — the empty-window
         failure the owner reported. */
      pdfWindows: BrowserWindow.getAllWindows()
        .filter(w => /\.pdf$/i.test(w.webContents.getURL() || '')).length };
  });

  /* The owner's validation list, asserted on the file the app actually wrote. */
  expect(out.head, 'what was written is not a PDF').toBe('%PDF-');
  expect(out.size, 'the PDF is empty').toBeGreaterThan(1000);
  expect(out.hasEof, 'the PDF is truncated — no %%EOF').toBe(true);
  expect(out.pages, 'the PDF has no pages').toBeGreaterThan(0);
  expect(out.pdfWindows, 'an empty Electron window was left showing the PDF').toBe(0);

  await app.close();
});
