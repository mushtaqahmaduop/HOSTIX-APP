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
  await win.selectOption('#login-user', 'warden1');
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

  /* Every column the spec's §5-§14 require is still present…

     TWO WERE RENAMED ON 2026-09-22, not removed: "Contact / emergency" is
     Contacts (the cell's two glyphs already say which number is which, and the
     heading was the one that had to wrap), and "Charges / month" is Monthly
     Charges. Both are asserted by their NEW names here rather than loosened to
     a substring — a heading is what the warden reads, and a test that accepts
     either name is a test that would not notice the next silent change. */
  for (const col of ['ID', 'STUDENT', 'ROOM', 'CONTACTS',
                     'COURSE', 'ADDRESS', 'MONTHLY CHARGES', 'ADMITTED', 'STATUS']) {
    expect(headers, 'missing column: ' + col).toContain(col);
  }
  /* ADMITTED SITS BESIDE STATUS (owner, 2026-09-22). Asserted as an ORDER, not
     just as presence: the colgroup and the body cells have to move with the
     heading, and a `<col>` left behind in the old place is exactly the mistake
     that silently hands one column's width to another. */
  expect(headers.indexOf('ADMITTED'), 'Admitted must sit directly before Status')
    .toBe(headers.indexOf('STATUS') - 1);
  expect(await win.evaluate(() => document.querySelectorAll('.stu-table col').length),
    'one <col> per column, or the widths drift').toBe(headers.length);
  // Nationality left the register on 2026-09-15 (owner: "so that the CNIC,
  // course and address should relax a little"); it stays on the form and the PDF.
  expect(headers, 'Nationality was removed on 2026-09-15').not.toContain('NATIONALITY');
  // CNIC left on 2026-09-21 (owner: "remove the cnic entire column because if a
  // warden needs a student full detail it is already in the student profile").
  // Still on the profile, the PDF and the Excel export — only the register
  // column went, and its 10.6% went back to Student, Contact, Course, Address.
  expect(headers, 'CNIC was removed on 2026-09-21').not.toContain('CNIC');
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
    DB.students.map(t => ({ id: t.id, fee: _stuFee(t.id).status, role: stuFeeRole(_stuFee(t.id).status) })));
  expect(states).toEqual([
    // The five chip roles replaced the dh-* hues on 2026-09-16 (design spec Part 4).
    { id: '001', fee: 'Paid',    role: 'ui-chip--success' },
    { id: '002', fee: 'Pending', role: 'ui-chip--warning' },
    { id: '003', fee: 'Overdue', role: 'ui-chip--danger'  },
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
    [...document.querySelectorAll('.stu-tools .ui-select')].some(s => /Fee Status/i.test(s.options[0].text)));
  expect(onBar, 'fee status must not crowd the primary filter bar').toBe(false);

  await win.evaluate(() => stuTogglePop(new Event('click')));
  await win.waitForSelector('.stu-pop__fee .ui-btn', { timeout: 6000 });
  const chips = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-pop__fee .ui-btn')].map(b => b.innerText.trim()));
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

// ════════════════════════════════════════════════════════════════════════════
// THE REGISTER'S OWN CELLS — owner requests of 2026-09-23.
//
// Five small rules, each of which reads fine in a screenshot and fails
// silently in data:
//
//   · the room label carries no hash, so a room numbered "A 214" fits;
//   · an address prints with a capital first letter, WITHOUT rewriting what
//     the warden typed into the record;
//   · the admission date carries its YEAR, or a 2025 intake and a 2026 one are
//     the same string;
//   · a clipped value opens the app's own hover card, not the OS tooltip that
//     cannot follow the theme;
//   · the Active card names both charge plans.
// ════════════════════════════════════════════════════════════════════════════
test('the register cells follow the 2026-09-23 rules', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  const out = await win.evaluate(async () => {
    DB.settings.serviceModel = 'rent_mess_optional';
    DB.settings.roomTypes = [{ id: 'rt', name: '3-Seater', capacity: 3,
                               defaultRent: 8000, defaultMess: 6500, color: '#2ec98a' }];
    // A LETTERED, LONG room number: the case the hash was costing room for.
    DB.rooms = [{ id: 'rmA', number: 'A 214', floor: 'Ground', typeId: 'rt' }];
    DB.students = [
      { id: '001', name: 'Salman', fatherName: 'Dahrmand', roomId: 'rmA', status: 'Active',
        joinDate: '2025-07-04', phone: '0314-5698125', address: 'charsadda',
        occupation: 'MDCAT Preparation', messOptIn: false, mess: 6500,
        admittedBy: 'warden1', admittedByName: 'Mushtaq Ahmad' },
      { id: '002', name: 'Hamid Din', fatherName: 'Muhammad Din', roomId: 'rmA', status: 'Active',
        joinDate: '2026-09-04', phone: '0326-6489880', address: 'D.I. Khan',
        occupation: 'ADCA', messOptIn: true, mess: 6500 },
    ];
    DB.payments = []; await saveDB();
    navigate('students');
    await new Promise(r => setTimeout(r, 900));

    const rows = [...document.querySelectorAll('.stu-table tbody tr')];
    const at = (i, s) => { const e = rows[i].querySelector(s); return e ? e.textContent.trim() : null; };
    /* CASE-INSENSITIVE, because the KPI labels are set in caps via
       `text-transform` (owner, 2026-09-23) — innerText reports the RENDERED
       text, so a case-sensitive match here breaks on a styling change that did
       not touch the markup. The same trap `.dash-kpi__label` documents. */
    const active = [...document.querySelectorAll('.stu-stat')]
      .find(c => /^active/i.test(c.innerText.trim()));
    return {
      roomLabel: at(0, '.ui-room__n'),
      roomTip:   rows[0].querySelector('.ui-room__n').getAttribute('data-tip'),
      address:   at(0, '.stu-addr__t'),
      stored:    DB.students[0].address,
      admitted:  [at(0, '.stu-adm'), at(1, '.stu-adm')],
      admittedBy: [at(0, '.stu-adm__by'), at(1, '.stu-adm__by')],
      charge:    [at(0, '.stu-charge'), at(0, '.stu-charge__plan')],
      planHints: [...active.querySelectorAll('.stu-plan-hint')].map(e => e.textContent.trim()),
      kpiCards:  document.querySelectorAll('.stu-stat').length,
      /* Every clipped VALUE goes through the app's card. Controls keep their
         native title — that is what a title is for on a button, and the OS
         tooltip is the right surface for "Open student details". So this looks
         only at non-interactive elements. */
      tips:      document.querySelectorAll('.stu-table tbody [data-tip]').length,
      bodyTitles: [...document.querySelectorAll('.stu-table tbody [title]')]
                    .filter(e => !e.closest('button') && !e.matches('button, input, a, select'))
                    .map(e => (e.className || e.tagName) + '="' + e.getAttribute('title') + '"'),
    };
  });

  // The hash is gone from the LABEL and kept in the hover, where it reads as a
  // sentence rather than costing a character of a 34px box.
  expect(out.roomLabel, 'the room label still carries a hash').toBe('A 214');
  expect(out.roomTip).toBe('Room A 214');

  // Presentation only — the record keeps exactly what was typed.
  expect(out.address, 'the address prints with a capital').toBe('Charsadda');
  expect(out.stored, 'the stored address must not be rewritten').toBe('charsadda');

  /* THE YEAR IS THE POINT. These two admissions are both "04" of a month; only
     the year tells them apart, which is the whole reason the column changed. */
  expect(out.admitted[0]).toBe('04 Jul 2025');
  expect(out.admitted[1]).toBe('04 Sep 2026');
  expect(out.admittedBy[0], 'the admitting account, first name').toBe('Mushtaq');
  expect(out.admittedBy[1], 'a record with no admittedBy invents nobody').toBeNull();

  // The plan is a caption under the amount, not a second chip beside a status.
  expect(out.charge[0]).toBe('Rs. 8,000');
  expect(out.charge[1]).toBe('Rent only');

  // Both plans named on the Active card — one student is off the mess.
  expect(out.planHints.length, 'both charge plans are named').toBe(2);
  expect(out.planHints.join(' ')).toMatch(/Rent only/);
  expect(out.planHints.join(' ')).toMatch(/Rent \+ mess/);
  expect(out.kpiCards, 'five cards: students, active, cancelling, blacklisted, rooms').toBe(5);

  // The hover card replaced the OS tooltip on every value cell.
  expect(out.tips).toBeGreaterThan(8);
  expect(out.bodyTitles, 'a value cell still carries the OS tooltip').toEqual([]);

  await app.close();
});
