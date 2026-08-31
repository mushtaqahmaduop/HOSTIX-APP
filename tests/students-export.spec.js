// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the Students export is a workbook, not a CSV
//
// The owner's reference (`rrr.pdf`) is a sheet with a title band, a line
// stating how many students it holds, and columns wide enough to read. A CSV
// cannot carry any of that, so the export writes a real .xlsx.
//
// The layout is the visible half. The half that quietly ruins a roster is the
// typing, and that is what most of this file tests:
//
//   · `03310045835` written as a NUMBER comes back as 3,310,045,835. Every
//     phone and CNIC must leave as text.
//   · A join date built with `new Date('2026-07-03')` is parsed as UTC, and
//     five hours east of Greenwich Excel shows 02-Jul. Dates are built at LOCAL
//     midnight for exactly the reason `today()` was fixed in the 19 Aug audit.
//
// XLSX.writeFile() is stubbed so the workbook can be inspected in memory —
// asserting on a real download tells you a file arrived, not what is in it.
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

// Seed two students and export, returning the workbook the writer produced
// plus the filename it chose.
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

    const real = XLSX.writeFile;
    let captured = null;
    XLSX.writeFile = (wb, name) => { captured = { wb, name }; };
    try {
      studentFilter.status = 'All';
      studentFilter.month  = '';
      exportStudentsExcel();
    } finally {
      XLSX.writeFile = real;
    }
    if (!captured) return null;

    const ws = captured.wb.Sheets.Students;
    const cell = ref => (ws[ref] ? { t: ws[ref].t, v: ws[ref].v, w: ws[ref].w, z: ws[ref].z } : null);
    return {
      name:    captured.name,
      sheets:  captured.wb.SheetNames,
      title:   ws.A1 && ws.A1.v,
      meta:    ws.A2 && ws.A2.v,
      header:  ['A4', 'B4', 'D4', 'I4', 'Q4', 'R4'].map(r => ws[r] && ws[r].v),
      phone:   cell('F5'),
      emerg:   cell('H5'),
      cnic:    cell('I6'),
      join:    cell('Q5'),
      dob:     cell('J6'),
      // What the owner actually opens. The in-memory cell carries `z`; the
      // display string only exists once the workbook has been through the
      // writer, so the round trip is the only honest place to assert it.
      reopened: (() => {
        const back = XLSX.read(XLSX.write(captured.wb, { bookType: 'xlsx', type: 'binary' }),
                               { type: 'binary', cellDates: true });
        const s2 = back.Sheets.Students;
        return { dob: s2.J6 && s2.J6.w, join: s2.Q5 && s2.Q5.w,
                 phone: s2.F5 && { t: s2.F5.t, v: s2.F5.v } };
      })(),
      room:    cell('D5'),
      merges:  ws['!merges'],
      filter:  ws['!autofilter'],
      cols:    (ws['!cols'] || []).length,
      colsAll: (ws['!cols'] || []).every(c => c && c.wch > 0),
      ref:     ws['!ref'],
      headers: STU_EXPORT_COLUMNS.length,
    };
  });
}

test('the sheet opens with a title band that says what it holds', async () => {
  const { app, win } = await openApp();
  const out = await exportAndCapture(win);

  expect(out, 'nothing was written').not.toBeNull();
  expect(out.name).toMatch(/^Students_All_AllMonths_\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(out.sheets).toEqual(['Students']);

  expect(out.title).toBe('STUDENT RECORDS — All months');
  // Counted from the rows written, never from DB totals the file does not hold.
  expect(out.meta).toContain('Continental Boys Hostel - 2');
  expect(out.meta).toContain('Total Students: 2');
  expect(out.meta).toContain('1 active, 1 left');

  // Both band rows span the full table, so neither sits in column A alone.
  expect(out.merges).toEqual([
    { s: { r: 0, c: 0 }, e: { r: 0, c: 17 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 17 } },
  ]);

  // The header is row 4, and the filter covers it and the data — not the band.
  expect(out.header).toEqual(['ID', 'Name', 'Room', 'CNIC', 'Join Date', 'Status']);
  expect(out.filter.ref).toBe('A4:R6');
  expect(out.ref).toBe('A1:R6');

  await app.close();
});

test('phones and CNICs stay text, and dates stay on their own day', async () => {
  const { app, win } = await openApp();
  const out = await exportAndCapture(win);

  // 's' = string. As a number this is 3,310,045,835 and the leading zero is gone.
  expect(out.phone.t).toBe('s');
  expect(out.phone.v).toBe('0326-2060904');
  expect(out.emerg.t).toBe('s');
  expect(out.emerg.v).toBe('03310045835');
  expect(out.cnic.t).toBe('s');
  expect(out.cnic.v).toBe('11102-0386165-3');

  // 'd' = a real date cell carrying the app's own date format, and no stale
  // display string left behind by the default one.
  expect(out.dob.t).toBe('d');
  expect(out.dob.z).toBe('dd-mmm-yyyy');
  expect(out.dob.w, 'the default display string was left on the cell').toBeUndefined();

  // Reopened, the sheet reads the way the app prints dates — and 01-Mar, not
  // the 28-Feb a UTC-parsed date would land on east of Greenwich.
  expect(out.reopened.dob).toBe('01-Mar-2007');
  expect(out.reopened.join).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{4}$/);
  expect(out.reopened.phone).toEqual({ t: 's', v: '0326-2060904' });

  // The room reads as it does on screen.
  expect(out.room.v).toBe('#9');

  await app.close();
});

test('every column declared is a column given a width', async () => {
  const { app, win } = await openApp();
  const out = await exportAndCapture(win);

  // STU_EXPORT_COLUMNS pairs each header with its width precisely so a column
  // cannot be added to the sheet without one. This is the test that says so.
  expect(out.headers).toBe(18);
  expect(out.cols).toBe(out.headers);
  expect(out.colsAll, 'a column was declared with no width').toBe(true);

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

    const real = XLSX.writeFile;
    let got = null;
    XLSX.writeFile = (wb, name) => { got = { wb, name }; };
    try {
      studentFilter.status = 'Active';
      studentFilter.month  = mk;
      exportStudentsExcel();
    } finally {
      XLSX.writeFile = real;
      studentFilter.status = 'All';
      studentFilter.month  = '';
    }
    return got && { name: got.name, title: got.wb.Sheets.Students.A1.v,
                    meta: got.wb.Sheets.Students.A2.v, ref: got.wb.Sheets.Students['!ref'] };
  });

  // A file holding one month's Active students must not be named, or titled,
  // as though it held everybody — it gets mailed to an owner as if it did.
  expect(captured.name).toMatch(/^Students_Active_\d{4}-\d{2}_/);
  expect(captured.title).toMatch(/^STUDENT RECORDS — \w+ \d{4} · Active only$/);
  expect(captured.meta).toContain('Total Students: 1');
  expect(captured.ref).toBe('A1:R5');     // band + blank + header + one row

  await app.close();
});
