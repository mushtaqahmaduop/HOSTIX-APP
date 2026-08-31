// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the three PDF exports, and the order everything comes out in
//
// Students, Payments and Expenses each grew an Export PDF on 2026-08-31. They
// share one builder (printListDocument in utils.js) precisely so they cannot
// drift into three documents that look like they came from three products.
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

  expect(doc.name).toMatch(/^Test-Hostel_Student-Roster_\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(doc.landscape, 'eighteen columns need the long edge').toBe(true);
  expect(doc.title).toContain('Test Hostel');
  expect(doc.headers).toContain('Charge / mo');

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
  expect(doc.text, 'the sheet quotes the rent half alone').toContain('14,500');
  expect(doc.text).toContain('8,000 rent + PKR 6,500 mess');
  expect(doc.headers).toContain('Charge / mo');
  // …and it comes out in room order too.
  expect(doc.firstCells).toEqual(['#1', '#2', '#10', '#A 01']);

  await app.close();
});

test('expenses print one category when one is chosen', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => { expFilter.cat = 'Electricity'; renderPage('expenses'); });
  await win.waitForTimeout(600);

  const doc = await capture(win, 'exportExpensesPDF');
  expect(doc).not.toBeNull();

  // printHeader puts the HOSTEL in .title and the document's own name in
  // .subtitle — so this is where "Expenses — Electricity" lands.
  expect(doc.subtitle).toContain('Electricity');
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
