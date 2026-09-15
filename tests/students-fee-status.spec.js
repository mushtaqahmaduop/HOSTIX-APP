// ════════════════════════════════════════════════════════════════════════════
// Fee Status on the Students directory (Students spec §13, §17, §42).
//
// The spec is emphatic that this is SEPARATE from the Rent + Mess cell beside
// it: that cell answers "what is this student charged and on what plan", this
// one answers "have they paid". §12: "It does NOT answer whether the student
// has paid." Reading one as the other is how a warden chases somebody who is
// paid up.
//
// The status itself is calculateFeeStatus() in finance.js, which aggregates
// calculateOutstanding() and payments.js's payIsOverdue() rather than deciding
// anything of its own — so the column cannot disagree with the Payments screen
// about the same student. tests/fee-status.test.js covers that arithmetic; this
// covers the screen.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env };
}

async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
}

test.beforeAll(() => { resetProfile(); });

/** One paid student, one pending, one overdue — the three states, from records. */
async function seed(win) {
  await win.evaluate(async () => {
    const mo = thisMonth();
    DB.settings.roomTypes.find(x => x.id === '2s').defaultRent = 8000;
    DB.settings.roomTypes.find(x => x.id === '2s').defaultMess = 6500;
    DB.rooms = [{ id: 'r1', number: '1', floor: 'Ground', typeId: '2s',
                  studentIds: [], amenities: [], notes: '' }];
    DB.students = [
      { id: '001', name: 'Paid Student',    fatherName: 'F One',   roomId: 'r1', status: 'Active',
        joinDate: mo + '-01', messOptIn: true, phone: '0333-1', cnic: '35202-1-1',
        occupation: 'MDCAT', nationality: 'Pakistani' },
      { id: '002', name: 'Pending Student', fatherName: 'F Two',   roomId: 'r1', status: 'Active',
        joinDate: mo + '-01', messOptIn: true, phone: '0333-2' },
      { id: '003', name: 'Overdue Student', fatherName: 'F Three', roomId: 'r1', status: 'Active',
        joinDate: mo + '-01', messOptIn: true, phone: '0333-3' },
    ];
    const base = { monthlyRent: 8000, messCharge: 6500, messIncluded: true, month: mo,
                   method: 'Cash', extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0 };
    DB.payments = [
      Object.assign({ id: 'pa', studentId: '001', amount: 14500, unpaid: 0, overpaid: 0,
                      status: 'Paid', date: mo + '-02', paidDate: mo + '-02', dueDate: '' }, base),
      // Owed, but the due date has not arrived.
      Object.assign({ id: 'pb', studentId: '002', amount: 0, unpaid: 14500,
                      status: 'Pending', date: mo + '-02', dueDate: '2099-01-01' }, base),
      // Part paid, and the due date is long past.
      Object.assign({ id: 'pc', studentId: '003', amount: 4000, unpaid: 10500,
                      status: 'Pending', date: mo + '-02', dueDate: '2020-01-01' }, base),
    ];
    await saveDB();
  });
  await win.evaluate(() => navigate('students'));
  await win.waitForSelector('.stu-table', { timeout: 8000 });
  await win.waitForTimeout(300);
}

/* THE COLUMN IS GONE; THE ANSWER IS NOT (owner, 2026-09-09: "remove payment
   status"). This test was written when Fee Status was a column between Charges
   and Status. students.js records the removal and the reason: whether a month
   is paid is a question about a PAYMENT, the payments register answers it with
   the record attached, and as a pill here it went stale the moment money was
   taken on another screen — in a table already short of width.

   So the assertions moved to where the answer still lives. `_stuFee()`,
   `stuFeeHue()` and `stuFeeTitle()` are untouched and still drive the Advanced
   Filters filter and the sort, which the three tests below this one cover; what
   this one now pins is that the arithmetic still reports all three states, that
   the figure is still on the hover text, and that the column really is absent
   rather than accidentally still rendering. */
test('the three fee states are still computed, and the column really is gone', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  const pre = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(pre.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  await seed(win);

  const headers = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-table thead th')]
      .map(t => t.innerText.replace(/[⇅▲▼]/g, '').trim().toUpperCase()));

  // Every column the spec's §5-§14 require is still present…
  for (const col of ['ID', 'STUDENT', 'ROOM', 'CONTACT / EMERGENCY', 'CNIC',
                     'COURSE', 'ADDRESS', 'CHARGES / MONTH', 'STATUS']) {
    expect(headers, 'missing column: ' + col).toContain(col);
  }
  // Nationality left the register on 2026-09-15 (owner: "so that the CNIC,
  // course and address should relax a little"); it stays on the form and the PDF.
  expect(headers, 'Nationality was removed on 2026-09-15').not.toContain('NATIONALITY');
  // …and Fee Status is not one of them any more. Asserted, not merely dropped:
  // a column removed by deleting one <th> and leaving its <td> behind is a
  // table whose header and body disagree from that row on.
  expect(headers, 'Fee Status was removed on 2026-09-09').not.toContain('FEE STATUS');
  const cellCount = await win.evaluate(() => {
    const r = document.querySelector('.stu-table tbody tr');
    return { cells: r.querySelectorAll('td').length,
             heads: document.querySelectorAll('.stu-table thead th').length };
  });
  expect(cellCount.cells, 'header and body must agree on the column count')
    .toBe(cellCount.heads);

  const states = await win.evaluate(() =>
    DB.students.map(t => ({ id: t.id, fee: _stuFee(t.id).status, hue: stuFeeHue(_stuFee(t.id).status) })));
  expect(states).toEqual([
    { id: '001', fee: 'Paid',    hue: 'dh-green' },
    { id: '002', fee: 'Pending', hue: 'dh-amber' },
    { id: '003', fee: 'Overdue', hue: 'dh-red'   },
  ]);

  // The hover text carries the figure — a badge reading "Overdue" with no
  // number sends the warden to another screen to find out how much.
  const titles = await win.evaluate(() => DB.students.map(t => stuFeeTitle(_stuFee(t.id))));
  expect(titles[0]).toMatch(/Nothing outstanding/);
  expect(titles[1]).toMatch(/14,500 outstanding/);
  expect(titles[2]).toMatch(/10,500 outstanding/);
  expect(titles[2]).toMatch(/past the due date/);

  /* The charge cell still says what it always said, on the same row.
     `Rs.`, not `PKR` — the currency word changed on 2026-09-10 ("remove PKR
     from everywhere and use Rs."), and this assertion was only ever a way of
     saying "the charge is still printed here". It says that against the word
     the app now uses, and against the figure too, so it cannot pass on a
     currency symbol over an empty cell. */
  const row0 = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-table tbody tr')[0].querySelectorAll('td')]
      .map(td => td.innerText.replace(/\s+/g, ' ').trim()));
  expect(row0.join(' | ')).toMatch(/Rs\.\s*14,500/);
  expect(row0.join(' | '), 'PKR is back on the students register').not.toMatch(/PKR/);

  expect(pageErrors).toEqual([]);
  await app.close();
});

test('the fee filter narrows the table, and Reset clears it with the rest', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win);

  /* The control lives in ADVANCED FILTERS, not on the primary bar — spec §17
     keeps that button "for secondary filters rather than making the primary
     filter bar too crowded", and student22.png draws eight controls on one row
     with no fee select among them. An inline ninth wrapped the bar onto a
     second line at 1054px and cost the table 44px. */
  const onBar = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-select')].some(s => /Fee Status/.test(s.options[0].text)));
  expect(onBar, 'fee status must not crowd the primary filter bar').toBe(false);

  await win.evaluate(() => stuTogglePop(new Event('click')));
  await win.waitForSelector('.stu-pop__chip', { timeout: 6000 });
  const chips = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-pop__chip')].map(b => b.innerText.trim()));
  expect(chips, 'the four fee states must be reachable from Advanced Filters')
    .toEqual(['Any', 'Paid', 'Pending', 'Overdue']);

  for (const [state, expected] of [['Overdue', ['003']], ['Pending', ['002']], ['Paid', ['001']]]) {
    await win.evaluate(s => { studentFilter.fee = s; studentFilter.page = 1; renderPage('students'); }, state);
    await win.waitForTimeout(300);
    const ids = await win.evaluate(() =>
      [...document.querySelectorAll('.stu-table tbody tr')]
        .map(r => (r.innerText.match(/#(\d+)/) || [])[1]).filter(Boolean));
    expect(ids, state + ' filter').toEqual(expected);
  }

  // Reset must clear the fee filter too, or the roster stays hidden behind a
  // control the warden has already stopped looking at.
  await win.evaluate(() => stuResetFilters());
  await win.waitForTimeout(300);
  expect(await win.evaluate(() => studentFilter.fee)).toBe('All');
  const all = await win.evaluate(() => document.querySelectorAll('.stu-table tbody tr').length);
  expect(all).toBe(3);

  await app.close();
});

test('sorting by fee orders by urgency, not alphabetically', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win);

  await win.evaluate(() => toggleSort(studentFilter, 'students', 'fee'));
  await win.waitForTimeout(300);
  const order = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-table tbody tr')]
      .map(r => (r.innerText.match(/(Paid|Pending|Overdue) Student/) || [''])[0]));

  /* Alphabetically this is Overdue, Paid, Pending — which puts the one state
     that needs no action in the middle of the two that do. Urgency is the only
     ordering that makes the column worth sorting. */
  expect(order).toEqual(['Overdue Student', 'Pending Student', 'Paid Student']);

  await app.close();
});

test('a student with no payment records at all does not read as unpaid', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win);

  await win.evaluate(async () => {
    const mo = thisMonth();
    DB.students.push({ id: '004', name: 'Brand New', fatherName: 'F Four', roomId: 'r1',
                       status: 'Active', joinDate: mo + '-01', messOptIn: true, phone: '0333-4' });
    await saveDB();
    renderPage('students');
  });
  await win.waitForTimeout(400);

  /* They owe nothing because nothing has been raised against them yet. The
     status says Paid, and `records: 0` is on the return so a caller can say
     "no records" rather than claim they have paid something. */
  const f = await win.evaluate(() => _stuFee('004'));
  expect(f.status).toBe('Paid');
  expect(f.records).toBe(0);
  expect(await win.evaluate(() => stuFeeTitle(_stuFee('004')))).toMatch(/No payment records/i);

  await app.close();
});
