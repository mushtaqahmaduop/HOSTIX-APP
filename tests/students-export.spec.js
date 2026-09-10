// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the Students export is a workbook, not a CSV
//
// The owner's reference (`rrr.pdf`) is a sheet with a title band, a line
// stating how many students it holds, and columns wide enough to read. A CSV
// cannot carry any of that, so the export writes a real .xlsx.
//
// It is written by the app's OWN writer now (src/export/xlsx-writer.js) rather
// than by the vendored SheetJS community build, because four things the export
// specification treats as non-negotiable are things that build cannot write: a
// branded header row (§23), frozen panes (§24), A4 fit-to-width print setup
// (§27) and column headings that repeat on every printed page (§28). Those
// four are asserted here; the writer's own OOXML is covered in depth by
// tests/export-engine.test.js, which needs no Electron.
//
// The layout is the visible half. The half that quietly ruins a roster is the
// typing, and that is what most of this file still tests:
//
//   · `03310045835` written as a NUMBER comes back as 3,310,045,835. Every
//     phone and CNIC must leave as text.
//   · A join date built from a UTC-parsed string lands on the day before, five
//     hours east of Greenwich. Dates are built from LOCAL calendar parts for
//     exactly the reason `today()` was fixed in the 19 Aug audit.
//
// HXW.save() is stubbed so the workbook can be inspected in memory — asserting
// on a real download tells you a file arrived, not what is in it.
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
  await win.setViewportSize({ width: 1440, height: 900 });
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

// Seed two students and export, returning the workbook the writer was handed
// plus the filename it was given.
async function exportAndCapture(win) {
  return win.evaluate(async () => {
    const d  = new Date();
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    DB.settings.hostelName = 'Continental Boys Hostel - 2';
    DB.rooms = [{ id: 'r9', number: 9, floor: 'Ground', typeId: null }];
    DB.students = [
      { id: 25, name: 'Hikmat Ullah', fatherName: 'Khona Din', roomId: 'r9',
        phone: '0326-2060904', emergencyPhone: '03310045835', cnic: '',
        address: 'South Waziristan,', occupation: 'MDCAT Preparation',
        joinDate: mk + '-03', status: 'Active' },
      { id: 53, name: 'Salman', fatherName: 'Aslam Khan', roomId: 'r9',
        phone: '0371-0501031', emergencyPhone: '03420949083',
        cnic: '11102-0386165-3', dob: '2007-03-01', gender: 'Male',
        nationality: 'Pakistani', address: 'DI khan', occupation: 'FSc Pre-Medical',
        session: '2026', bloodGroup: 'B+', joinDate: mk + '-03', status: 'Left' },
    ];
    await saveDB();

    const real = HXW.save;
    let captured = null;
    HXW.save = async (spec, name) => { captured = { spec, name }; return name; };
    try {
      studentFilter.status = 'All';
      studentFilter.month  = '';
      await exportStudentsExcel();
    } finally {
      HXW.save = real;
    }
    if (!captured) return null;

    const S = HXW.S;
    const sheet = captured.spec.sheets[0];
    const cellAt = (r, c) => (sheet.rows[r - 1] && sheet.rows[r - 1].cells[c - 1]) || null;
    const headerRow = sheet.freeze.row;
    const headers = (sheet.rows[headerRow - 1].cells || []).map(c => c.v);
    const colOf = label => headers.indexOf(label) + 1;
    const rowOf = name => {
      // 'Student' became 'Student Name' with the owner's sheet, 2026-09-10.
      // Missing it returned -1 for every row and nulled every cell below.
      const nameCol = colOf('Student Name');
      for (let r = headerRow + 1; r <= sheet.rows.length; r++) {
        const c = cellAt(r, nameCol);
        if (c && c.v === name) return r;
      }
      return -1;
    };

    const rHikmat = rowOf('Hikmat Ullah');
    const rSalman = rowOf('Salman');
    const cell = (r, label) => {
      const c = cellAt(r, colOf(label));
      return c ? { v: c.v instanceof Date ? c.v.toISOString() : c.v, t: c.t || 'text', s: c.s } : null;
    };

    // The title band: every line above the header row, as text.
    const band = sheet.rows.slice(0, headerRow - 1)
      .map(r => (r.cells[0] ? String(r.cells[0].v == null ? '' : r.cells[0].v) : ''))
      .filter(Boolean);

    return {
      name: captured.name,
      sheets: captured.spec.sheets.map(s => s.name),
      band,
      headers,
      headerRow,
      freeze: sheet.freeze,
      autofilter: sheet.autofilter,
      printTitleRow: sheet.printTitleRow,
      printArea: sheet.printArea,
      landscape: sheet.landscape,
      footer: sheet.footer,
      header: sheet.header,
      merges: sheet.merges,
      cols: sheet.cols,
      rowCount: sheet.rows.length,
      headStyles: (sheet.rows[headerRow - 1].cells || []).map(c => c.s),
      styleNames: { HEAD: S.HEAD, TEXT: S.TEXT, DATE: S.DATE, MONEY: S.MONEY, WRAP: S.WRAP },
      /* THE HEADINGS ARE THE OWNER'S SHEET NOW (`student excel sheet.png`,
         2026-09-10): Phone is Contact, Emergency Phone is Emergency Contact,
         Room is Room No. Date of Birth and Join are not on the sheet at all —
         a roster is read for who is here and when they LEFT — so the two date
         assertions below move to the column that survives. */
      phone: cell(rHikmat, 'Contact'),
      emerg: cell(rHikmat, 'Emergency Contact'),
      cnic:  cell(rSalman, 'CNIC'),
      charge: cell(rHikmat, 'Charges (Rs.)'),
      room:  cell(rHikmat, 'Room No.'),
      address: cell(rHikmat, 'Address'),
    };
  });
}

test('the sheet opens with a title band that says what it holds', async () => {
  const { app, win } = await openApp();
  const out = await exportAndCapture(win);

  expect(out, 'nothing was written').not.toBeNull();
  // §32 — Hostyllo_<Module>_<Scope>_<Date>.xlsx
  expect(out.name).toMatch(/^Hostyllo_Students_.*\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(out.sheets).toEqual(['Students']);

  /* §22 — the product, the hostel, the document and when it was made, all
     still stated. THREE LINES, NOT SIX (owner brief, 2026-09-10): "do NOT
     create a large vertical report header … the table must appear near the top
     of the worksheet so the user gets maximum usable viewport". The band was
     six lines plus a stacked label/value pair per summary figure; every fact
     it carried is still here, on rows 1-3. */
  expect(out.band[0]).toBe('HOSTYLLO  |  Hostel Management System');
  expect(out.band[1]).toContain('Continental Boys Hostel - 2');
  expect(out.band[1]).toContain('Student Roster');
  expect(out.band.some(l => /Generated: \d{2}-[A-Z][a-z]{2}-\d{4}/.test(l))).toBe(true);
  // Counted from the rows written, never from DB totals the file does not hold.
  expect(out.band.some(l => /1 active, 1 left/.test(l))).toBe(true);

  /* THE TABLE STARTS ON ROW 5, which is the whole point of the brief: three
     band rows, one spacer, then the headings. */
  expect(out.headerRow, 'the table must be near the top of the sheet').toBe(5);

  // Every band line spans the table's left-hand columns, so none sits alone.
  expect(out.merges.length).toBeGreaterThanOrEqual(3);

  await app.close();
});

test('the print setup the specification calls non-negotiable is actually written', async () => {
  const { app, win } = await openApp();
  const out = await exportAndCapture(win);

  // §24 — frozen on the ACTUAL header row, not an arbitrary one.
  expect(out.freeze.row).toBe(out.headerRow);
  // §25 — the filter covers the header and the data, not the title band.
  expect(out.autofilter.r1).toBe(out.headerRow);
  expect(out.autofilter.r2).toBeGreaterThan(out.headerRow);
  // §28 — the headings repeat on every printed page.
  expect(out.printTitleRow).toBe(out.headerRow);
  // §30 — the print area is exactly the export.
  expect(out.printArea.r1).toBe(1);
  expect(out.printArea.c2).toBe(out.headers.length);
  // §27 — a roster this wide prints landscape.
  expect(out.landscape).toBe(true);
  // §31 — a page number on every printed sheet.
  expect(out.footer.right).toContain('&P');
  expect(out.header.left).toContain('HOSTYLLO');
  // §23 — the header row is the branded one.
  expect(new Set(out.headStyles).size).toBeLessThanOrEqual(3);
  expect(out.headStyles).toContain(out.styleNames.HEAD);

  await app.close();
});

test('phones and CNICs stay text, and a long address wraps', async () => {
  const { app, win } = await openApp();
  const out = await exportAndCapture(win);

  // As a number this is 3,310,045,835 and the leading zero is gone.
  expect(out.phone.t).toBe('text');
  expect(out.phone.v).toBe('0326-2060904');
  expect(out.emerg.v).toBe('03310045835');
  expect(out.cnic.v).toBe('11102-0386165-3');

  /* THE DATE HALF OF THIS TEST IS GONE, and the test is renamed with it. It
     asserted Date of Birth and Join — the UTC-parse bug that lands 01-Mar on
     28-Feb east of Greenwich — and neither column is on the owner's sheet
     (`student excel sheet.png`, 2026-09-10). The sheet's one date column is
     about DEPARTURE and is empty for a student who is still here, which is the
     wrong cell to assert a date format on.

     THE BUG ITSELF IS STILL COVERED: exFmtDate() is one function and
     export-engine.test.js asserts it directly, on a date, without needing a
     student who has left. */

  // The room reads as it does on screen.
  expect(out.room.v).toBe('9');
  // A long address wraps in its own cell rather than widening the sheet.
  expect(out.address.s).toBe(out.styleNames.WRAP);

  await app.close();
});

test('every column declared is a column given a width', async () => {
  const { app, win } = await openApp();
  const out = await exportAndCapture(win);

  // §12/§26 — sized by what they hold. A column with no width, or every column
  // the same width, is the spreadsheet nobody can read.
  expect(out.cols.length).toBe(out.headers.length);
  expect(out.cols.every(c => c.width > 0)).toBe(true);
  expect(new Set(out.cols.map(c => c.width)).size).toBeGreaterThan(3);

  /* THE WORKBOOK AND THE PRINTED ROSTER ARE THE SAME FIFTEEN COLUMNS NOW
     (`student excel sheet.png`, 2026-09-10). They were not: nine fields were
     `pdf:false`, so the printed roster was missing exactly the identity fields
     a hostel gets asked for. This list is the sheet's, in the sheet's words. */
  for (const label of ['#', 'Room No.', 'Student Name', 'Father Name', 'Contact',
                       'Emergency Contact', 'CNIC', 'Course / Study / Profession',
                       'Gender', 'Address', 'Nationality', 'Charges (Rs.)',
                       'Status', 'Date (Left / Cancelling / Expelled)', 'Remarks']) {
    expect(out.headers, label + ' is missing from the workbook').toContain(label);
  }
  expect(out.headers.length, 'the sheet is fifteen columns, no more').toBe(15);

  await app.close();
});

test('the filename and the title band both state the filter, not just the date', async () => {
  const { app, win } = await openApp();
  const captured = await win.evaluate(async () => {
    const d  = new Date();
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    DB.rooms = [{ id: 'r9', number: 9, floor: 'Ground', typeId: null }];
    DB.students = [
      { id: 1, name: 'Active One', roomId: 'r9', joinDate: mk + '-01', status: 'Active' },
      { id: 2, name: 'Left One',   roomId: 'r9', joinDate: mk + '-01', status: 'Left' },
    ];
    await saveDB();

    const real = HXW.save;
    let got = null;
    HXW.save = async (spec, name) => { got = { spec, name }; return name; };
    try {
      studentFilter.status = 'Active';
      studentFilter.month  = mk;
      await exportStudentsExcel();
    } finally {
      HXW.save = real;
      studentFilter.status = 'All';
      studentFilter.month  = '';
    }
    if (!got) return null;
    const sheet = got.spec.sheets[0];
    return {
      name: got.name,
      band: sheet.rows.slice(0, sheet.freeze.row - 1)
        .map(r => (r.cells[0] ? String(r.cells[0].v == null ? '' : r.cells[0].v) : ''))
        .filter(Boolean),
      dataRows: sheet.autofilter.r2 - sheet.freeze.row,
    };
  });

  // A file holding one month's Active students must not be named, or titled,
  // as though it held everybody — it gets mailed to an owner as if it did.
  expect(captured.name).toMatch(/^Hostyllo_Students_[A-Za-z]+-\d{4}_/);
  expect(captured.band.some(l => /Status: Active/.test(l)),
    'the scope line does not name the status filter').toBe(true);
  expect(captured.band.some(l => /Total Students|1 active/.test(l) || /Student Roster/.test(l))).toBe(true);
  expect(captured.dataRows).toBe(1);

  await app.close();
});
