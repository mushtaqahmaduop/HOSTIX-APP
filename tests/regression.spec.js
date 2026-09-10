// ════════════════════════════════════════════════════════════════════════════
// HOSTIX — Phase 2 §6.2 regression suite
//
// Expands coverage beyond the Phase 0 smoke test (smoke.spec.js) to the flows
// the plan calls out: login-failure states, payment recording edge cases
// (partial payment + overpayment), receipt generation (no "PKR PKR"
// double-prefix), and — most importantly — the showClearAllMenu password
// protection that was a live security bypass (kickoff §5.4).
//
// Like the smoke test, this runs against an ISOLATED throwaway profile
// (HOSTIX_TEST_PROFILE) with a copied license.enc. beforeEach wipes both the
// SQLite DB *and* the Chromium localStorage so every test starts from a fresh,
// unlocked, default-warden state. A safety guard aborts before any write if the
// DB isn't empty, so real client data can never be touched.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // else electron.exe runs as plain Node and main.js crashes
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  };
}

async function waitForLoginScreen(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 30000 });
}

async function login(win, password = 'admin123', username = 'warden1') {
  await waitForLoginScreen(win);
  await win.fill('#login-user', username);
  await win.fill('#login-input', password);
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
}

// Seed a room + student through the app's REAL submit functions (same path the
// smoke test uses), returning the new studentId. Assumes we're logged in.
async function seedRoomAndStudent(win) {
  await win.evaluate(() => showAddRoomModal());
  await win.waitForSelector('#f-rnum');
  await win.fill('#f-rnum', 'R01');
  await win.evaluate(() => {
    document.getElementById('f-rfloor').value = 'Ground';
    document.getElementById('f-rtype').value = '1s';
  });
  await win.evaluate(() => submitAddRoom());
  await win.waitForTimeout(250);
  const roomId = await win.evaluate(() => (DB.rooms[0] || {}).id);

  await win.evaluate(() => showAddStudentModal());
  await win.waitForSelector('#f-tname');
  await win.fill('#f-tname', 'Reg Test Student');
  await win.evaluate((rid) => { document.getElementById('f-troom').value = rid; }, roomId);
  await win.evaluate(() => submitAddStudent('', false, true));
  await win.waitForTimeout(300);
  await win.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
  return await win.evaluate(() =>
    (DB.students.find(s => s.name === 'Reg Test Student') || {}).id);
}

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
});

test.beforeEach(() => {
  // Fresh SQLite DB + fresh localStorage (clears any lockout / re-seeds default warden).
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
test('payment: partial + overpayment persist correctly; receipt has no PKR-PKR', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  // SAFETY GUARD — refuse to write unless the isolated DB is empty.
  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length, 'SAFETY ABORT: isolated DB not empty — isolation may have failed').toBe(0);

  const studentId = await seedRoomAndStudent(win);
  expect(studentId, 'seeded student missing').toBeTruthy();

  // ── Partial payment: rent 16000, paid 10000 → unpaid 6000, status carries paid amount.
  const partial = await win.evaluate((sid) => {
    DB.payments = []; // avoid the admission auto-Pending duplicate guard
    showAddPaymentForStudent(sid);
    document.getElementById('f-ps-amt').value = '16000';
    document.getElementById('f-ps-paid').value = '10000';
    if (document.getElementById('f-ps-stat')) document.getElementById('f-ps-stat').value = 'Pending';
    submitPaymentForStudent();
    const p = DB.payments[DB.payments.length - 1];
    return { amount: p.amount, unpaid: p.unpaid, monthlyRent: p.monthlyRent, id: p.id };
  }, studentId);
  expect(partial.amount, 'partial paid amount wrong').toBe(10000);
  expect(partial.unpaid, 'partial unpaid should be rent - paid').toBe(6000);
  expect(partial.monthlyRent).toBe(16000);

  // Persisted to SQLite?
  await win.waitForTimeout(200);
  const dbPays = await win.evaluate(() => window.electronAPI.dbAll('payments'));
  expect(dbPays.some(p => p.amount === 10000 && p.unpaid === 6000),
    'partial payment not persisted to SQLite').toBeTruthy();

  // ── Overpayment: rent 16000, paid 20000 → unpaid clamps to 0, amount keeps 20000.
  const over = await win.evaluate((sid) => {
    DB.payments = [];
    showAddPaymentForStudent(sid);
    document.getElementById('f-ps-amt').value = '16000';
    document.getElementById('f-ps-paid').value = '20000';
    submitPaymentForStudent();
    const p = DB.payments[DB.payments.length - 1];
    return { amount: p.amount, unpaid: p.unpaid, id: p.id };
  }, studentId);
  expect(over.amount, 'overpayment amount wrong').toBe(20000);
  expect(over.unpaid, 'overpayment unpaid must clamp to 0').toBe(0);

  /* ── Receipt renders with correct data and NO doubled currency prefix
     (CLAUDE.md rule #4). The currency word became "Rs." on 2026-09-10 — the
     owner's "remove PKR from everywhere" — and fmtPKR() is the one place that
     produces it, so this follows it rather than pinning the old string. The
     bug being guarded is unchanged: one prefix, never two. */
  const receipt = await win.evaluate((pid) => buildReceiptHTML(pid), over.id);
  expect(receipt, 'buildReceiptHTML returned nothing').toBeTruthy();
  expect(receipt).toContain('Reg Test Student');
  expect(receipt).toContain('Rs. 20,000');
  expect(receipt, 'receipt has a doubled currency prefix').not.toContain('Rs. Rs.');
  expect(receipt, 'PKR is back on a receipt').not.toContain('PKR');

  /* ── WHAT THE OWNER TOOK OFF THE SLIP, 2026-09-10 ────────────────────────
     "remove payment history and student signing area and success and pending
     emojis, and laos use hostel logo on it above."

     Each of these is a thing that was on the receipt and is not any more, so
     each is asserted as an absence. A slip that starts re-growing them is the
     regression this guards. */
  expect(receipt, 'the payment history section is back on the receipt')
    .not.toContain('Payment History');
  expect(receipt, 'the instalment list is back under another name')
    .not.toContain('Recorded Instalments');
  expect(receipt, 'the student signature block is back').not.toContain('Student Signature');
  expect(receipt, 'the success emoji is back on the status row').not.toContain('✅');
  expect(receipt, 'the pending emoji is back on the status row').not.toContain('⏳');
  // The hostel still signs it — that is the half that attests anything.
  expect(receipt, 'the warden signature line was removed too').toContain('Authorized Warden');

  /* THE LOGO COMES FROM DB.settings.logo. It was read from a localStorage key
     that Hostel Info stopped writing, so the block was never entered and no
     receipt had carried a logo since that move. */
  const withLogo = await win.evaluate((pid) => {
    DB.settings.logo = 'data:image/png;base64,iVBORw0KGgo=';
    return buildReceiptHTML(pid);
  }, over.id);
  expect(withLogo, 'the hostel logo is not on the receipt')
    .toContain('data:image/png;base64,iVBORw0KGgo=');

  /* THE RECEIPT NUMBER IS ON THE RECEIPT, and it is spent when the receipt is
     OPENED rather than when it is printed — a warden copying the number into a
     register was copying the word PREVIEW. Opening it twice must not spend a
     second number. */
  const nums = await win.evaluate((pid) => {
    printReceipt(pid);
    const first = (DB.payments.find(p => p.id === pid) || {}).receiptNo;
    const counterAfterFirst = DB.settings.receiptCounter;
    closeModal();
    printReceipt(pid);
    const second = (DB.payments.find(p => p.id === pid) || {}).receiptNo;
    const html = document.getElementById('rc-print')
      ? document.getElementById('rc-print').outerHTML : '';
    closeModal();
    return { first, second, counterAfterFirst,
             counterAfterSecond: DB.settings.receiptCounter,
             onSlip: html.indexOf(first) !== -1, saysPreview: html.indexOf('PREVIEW') !== -1 };
  }, over.id);
  expect(nums.first, 'no receipt number was assigned when the receipt opened').toMatch(/^RCP-\d{6}$/);
  expect(nums.second, 'reopening the receipt renumbered it').toBe(nums.first);
  expect(nums.counterAfterSecond, 'reopening the receipt spent a second number')
    .toBe(nums.counterAfterFirst);
  expect(nums.onSlip, 'the receipt number is not printed on the receipt').toBe(true);
  expect(nums.saysPreview, 'the receipt still says PREVIEW where its number goes').toBe(false);

  /* …AND IT FINDS THE RECORD AGAIN. A student comes back holding the slip;
     the number on it has to be a way into the payment. */
  const found = await win.evaluate((rno) => {
    payFilter.search = rno;
    payFilter.month  = 'All';
    return payFiltered().length;
  }, nums.first);
  expect(found, 'searching the payments register by receipt number found nothing')
    .toBeGreaterThan(0);

  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// The clear-all password-gate test that stood here is gone with the feature.
// Clear All Data was retired on 2026-08-31 — the sidebar entry, the functions
// in expenses.js and the `clearall` permission all went together, so there is
// no longer a gate for this to guard. Deleting a security test is only safe
// when the thing it protected no longer exists; that is the case here, and
// tests/permissions.spec.js proves it: its guard reads the PERMS table out of
// the source and fails on any permission declared but checked nowhere, so a
// half-removal — the permission left behind, the feature gone — would have
// failed the suite rather than passed it quietly.

// ─────────────────────────────────────────────────────────────────────────────
test('schema migration: indexed WHERE queries work end-to-end via dbAll', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length, 'SAFETY ABORT: isolated DB not empty').toBe(0);

  const studentId = await seedRoomAndStudent(win); // one Active student in a room
  const roomId = await win.evaluate((sid) => (DB.students.find(s => s.id === sid) || {}).roomId, studentId);
  expect(studentId).toBeTruthy();

  // Add a payment for that student so payments.studentId is exercised.
  await win.evaluate((sid) => {
    DB.payments = [];
    showAddPaymentForStudent(sid);
    document.getElementById('f-ps-amt').value = '16000';
    document.getElementById('f-ps-paid').value = '16000';
    submitPaymentForStudent();
  }, studentId);
  await win.waitForTimeout(250);

  // Filtered reads go through db:all's WHERE path against the migrated,
  // now-indexed columns (status, roomId, studentId).
  const active = await win.evaluate(() => window.electronAPI.dbAll('students', ['status', 'Active']));
  expect(active.some(s => s.id === studentId), 'WHERE status=Active should return the seeded student').toBeTruthy();

  const left = await win.evaluate(() => window.electronAPI.dbAll('students', ['status', 'Left']));
  expect(left.length, 'no students are Left yet').toBe(0);

  const inRoom = await win.evaluate((rid) => window.electronAPI.dbAll('students', ['roomId', rid]), roomId);
  expect(inRoom.some(s => s.id === studentId), 'WHERE roomId should return the seeded student').toBeTruthy();

  const pays = await win.evaluate((sid) => window.electronAPI.dbAll('payments', ['studentId', sid]), studentId);
  expect(pays.length, 'WHERE studentId should return the payment').toBeGreaterThan(0);

  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('archive page renders (regression: renderArchive was undefined → Render Error)', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  // Empty archive → friendly empty state, NOT a render error.
  await win.evaluate(() => navigate('archive'));
  await win.waitForTimeout(300);
  const emptyHtml = await win.evaluate(() => document.getElementById('content').innerHTML);
  expect(emptyHtml, 'archive page threw a render error (renderArchive missing?)').not.toContain('Render Error');
  expect(emptyHtml).toContain('No archived records');

  // Populated archive → the page opens on the newest year that HOLDS records
  // (not simply the current year, which would be empty here) and shows them.
  // (renderPage swaps #content inside a setTimeout fade, so wait before reading.)
  await win.evaluate(() => {
    DB.archive = [
      { id: 'a1', studentName: 'Old Student', month: 'January 2024', amount: 16000, date: '2024-01-05', status: 'Paid' },
      { id: 'a2', category: 'Electricity', amount: 5000, date: '2024-02-01', description: 'WAPDA' },
    ];
    archiveFilter = { year: '', month: '', tab: 'overview' };
    renderPage('archive');
  });
  await win.waitForTimeout(400);
  const html = await win.evaluate(() => document.getElementById('content').innerHTML);
  expect(html, 'archive render error with data').not.toContain('Render Error');
  expect(html, 'archive did not default to the newest year holding records').toContain('2024');
  // The year overview reports the money; the records themselves are one tab in.
  expect(html).toContain('16,000');
  expect(html).toContain('5,000');

  // arcSetTab() goes through renderPage(), which swaps #content inside a
  // setTimeout fade — read after the wait, not in the same evaluate().
  await win.evaluate(() => arcSetTab('payments'));
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => document.getElementById('content').innerText),
    'archived payment missing from the Payments tab').toContain('Old Student');

  await win.evaluate(() => arcSetTab('expenses'));
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => document.getElementById('content').innerText),
    'archived expense missing from the Expenses tab').toContain('Electricity');

  await app.close();
});

// The Annual Archive was fully built — renderArchive(), pageConfig entry, router
// branch, permission gate, stylesheet, icon — but had no sidebar item, so the
// only way in was the Ctrl+K palette. This guards the way in, not the page.
test('archive is reachable from the sidebar and hides with the reports permission', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  const railItem = win.locator('.nav-item[data-page="archive"]');
  await expect(railItem, 'no Annual Archive item in the sidebar').toHaveCount(1);
  await expect(railItem).toBeVisible();
  await expect(railItem).toContainText('Annual Archive');

  // Navigate by clicking the rail, not by calling navigate() directly.
  await railItem.click();
  await win.waitForTimeout(400);

  expect(await win.evaluate(() => document.getElementById('hdr-title').textContent))
    .toBe('Annual Archive');
  expect(await win.evaluate(() => currentPage)).toBe('archive');
  await expect(railItem, 'rail item did not light up').toHaveClass(/active/);

  const html = await win.evaluate(() => document.getElementById('content').innerHTML);
  expect(html, 'archive threw a render error when reached via the sidebar').not.toContain('Render Error');
  expect(html).toContain('No archived records');

  // The rail item and the page gate (nav.js renderPage) must agree: both key off
  // 'reports'. If they drift, the rail offers a page that then refuses to render.
  const hidden = await win.evaluate(() => {
    const realCanDo = window.canDo;
    window.canDo = p => (p === 'reports' ? false : realCanDo(p));
    applyPermissionsToChrome();
    const el = document.querySelector('.nav-item[data-page="archive"]');
    const rep = document.querySelector('.nav-item[data-page="reports"]');
    const out = { archive: el.style.display, reports: rep.style.display };
    window.canDo = realCanDo;
    applyPermissionsToChrome();
    return out;
  });
  expect(hidden.archive, 'archive rail item stayed visible without reports permission').toBe('none');
  expect(hidden.reports).toBe('none');

  await app.close();
});

// The three secondary money columns sit past the right edge. They must be
// reachable by dragging, and the CSV must list columns in the on-screen order.
test('payments: table pans by dragging, and CSV column order matches the table', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  await win.evaluate(() => {
    DB.rooms = [{ id: 'r1', number: '101', floor: 'Ground', typeId: '2s', rent: 16000 }];
    DB.students = [{ id: 's1', name: 'Ali Khan', roomId: 'r1', rent: 16000, status: 'Active' }];
    DB.payments = [{
      id: 'p1', studentId: 's1', studentName: 'Ali Khan', roomNumber: '101',
      month: thisMonthLabel(), monthlyRent: 16000, amount: 12000, unpaid: 4000,
      method: 'Cash', status: 'Pending', admissionFee: 5000,
      extraCharges: [{ label: 'Laundry', amount: 800 }], concession: 1000,
      concessionDesc: 'Sibling', date: today(), paidDate: today(),
    }];
    navigate('payments');
  });
  await win.waitForTimeout(700);

  // The secondary columns exist in the DOM — a display:none column could never
  // be scrolled into view, which is the whole point of panning.
  expect(await win.locator('.pay-table th.pay-col-x').count(),
    'secondary columns missing from the table').toBe(3);

  /* A width where the table genuinely overflows. The 2026-09-07 density pass
     brought the payments table down to ~1065px, which FITS the 1366 default —
     an improvement, and one that left this test with nothing to pan and
     failing on a table that pans perfectly at any narrower window. The
     behaviour under test is the drag, not the column widths, so the window is
     pinned here rather than the padding being put back. 1366 stays the layout
     QA floor and is covered by responsive-floor.spec.js. */
  await win.setViewportSize({ width: 1100, height: 760 });
  await win.waitForTimeout(400);

  const wrap = win.locator('.pay-table-wrap');
  const canPan = await wrap.evaluate(el => el.scrollWidth > el.clientWidth + 1);
  expect(canPan, 'table does not overflow, so there is nothing to pan to').toBe(true);
  expect(await wrap.evaluate(el => el.scrollLeft), 'should rest at the left edge').toBe(0);

  // Drag leftwards across an inert part of a row.
  const box = await wrap.boundingBox();
  const y = box.y + box.height - 18;
  await win.mouse.move(box.x + box.width * 0.55, y);
  await win.mouse.down();
  await win.mouse.move(box.x + box.width * 0.55 - 60, y, { steps: 6 });
  await win.mouse.move(box.x + box.width * 0.55 - 200, y, { steps: 12 });
  await win.mouse.up();
  await win.waitForTimeout(200);

  /* PANS TO THE END, rather than "past 30px". The literal 30 was written when
     this table was ~225px wider than its container; the 2026-09-07 density pass
     (compact currency, tighter cells) brought the overflow down to ~11px on
     this one-row fixture, so the drag now reaches the right edge after 11 and
     the old assertion failed on a table that pans perfectly.

     Asserting against the container's own maximum keeps the test about the
     behaviour — a drag moves the table as far as it can go — and stops it
     being a hidden assertion about column widths, which is what made it fail
     for a change that improved the thing it was guarding. */
  const panned = await wrap.evaluate(el => ({
    left: el.scrollLeft, max: el.scrollWidth - el.clientWidth }));
  expect(panned.max, 'nothing to pan to').toBeGreaterThan(0);
  expect(panned.left, 'dragging did not pan the table to its end')
    .toBeGreaterThanOrEqual(Math.min(30, panned.max));

  // Dragging must not have triggered anything underneath it.
  expect(await win.evaluate(() => document.querySelectorAll('.modal-overlay').length),
    'the pan opened a modal — the trailing click was not swallowed').toBe(0);

  /* The workbook follows the table. exportPaymentsCSV is the same button it
     always was and the same name the keyboard shortcut calls, but it writes a
     real .xlsx through the global export engine now: a CSV cannot carry the
     hostel, the period, the filters, a number format or a print setup, which
     is most of what the export standard is about.

     HXW.save is stubbed, so what is asserted is the workbook that would have
     been written — the part that can actually be wrong. */
  const book = await win.evaluate(async () => {
    let captured = null;
    const real = HXW.save;
    HXW.save = async (spec, name) => { captured = { spec, name }; return name; };
    try { await exportPaymentsCSV(); } finally { HXW.save = real; }
    if (!captured) return null;
    const sheet = captured.spec.sheets[0];
    const headerRow = sheet.freeze.row;
    const headers = sheet.rows[headerRow - 1].cells.map(c => c.v);
    const row = sheet.rows[headerRow].cells.map(c => (c ? c.v : ''));
    return { name: captured.name, headers, row,
             numeric: sheet.rows[headerRow].cells.map(c => (c ? c.t : '')) };
  });

  expect(book, 'the payments export produced nothing').toBeTruthy();
  expect(book.name).toMatch(/^Hostyllo_Payments_.*\.xlsx$/);

  /* THE HEADINGS ARE THE OWNER'S SHEET AND HIS BRIEF (2026-09-10): the
     register's columns are `payments excel redesign.png`, and currency
     headings say Rs. rather than PKR. Every figure this test was written for
     is still a column — the brief's §5 forbids removing one — under the name
     the sheet gives it. */
  const at = name => book.headers.indexOf(name);
  for (const col of ['Room', 'Student Name', 'Month', 'Charges (Rs.)', 'Rent (Rs.)',
                     'Mess (Rs.)', 'Paid (Rs.)', 'Unpaid (Rs.)', 'Pay Mode',
                     'Status', 'Date', 'Admission (Rs.)', 'Extra charges (detail)',
                     'Discount (Rs.)', 'Refund (Rs.)']) {
    expect(book.headers, col + ' is missing from the workbook').toContain(col);
  }

  // Rent and mess joined the export on 2026-08-31: a sheet that quoted the rent
  // half alone could not be reconciled against what the student actually paid,
  // because the mess is a separate field on the record.
  expect(book.row[at('Rent (Rs.)')] + book.row[at('Mess (Rs.)')],
    'the two halves must make the charge').toBe(book.row[at('Charges (Rs.)')]);

  // §62 — amounts are NUMBERS, not "Rs. 12,000" strings nobody can sum.
  expect(book.row[at('Paid (Rs.)')], 'Paid column').toBe(12000);
  expect(book.numeric[at('Paid (Rs.)')], 'Paid must be a number cell').toBe('money');
  expect(book.row[at('Unpaid (Rs.)')], 'Unpaid column').toBe(4000);
  expect(book.row[at('Pay Mode')], 'Pay Mode column').toBe('Cash');
  expect(book.row[at('Admission (Rs.)')], 'Admission fee column').toBe(5000);
  expect(String(book.row[at('Extra charges (detail)')]), 'Extra charges column').toContain('Laundry');
  expect(book.row[at('Discount (Rs.)')], 'Concession column').toBe(1000);

  await app.close();
});

// The payment form's student box auto-selected as soon as one student matched,
// overwriting what was being typed and rewriting the label faster than
// backspace could delete it — the field could not be cleared or typed into.
test('payment student search: types cleanly, clears on backspace, orders by room', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  await win.evaluate(() => {
    // Deliberately out of order, with a two-digit and a lettered room.
    DB.rooms = [{ id:'r10', number:'10', floor:'1st',    typeId:'2s', rent:16000 },
                { id:'rA1', number:'A1', floor:'1st',    typeId:'2s', rent:16000 },
                { id:'r2',  number:'2',  floor:'Ground', typeId:'2s', rent:16000 }];
    DB.students = [{ id:'s1', name:'Zed Khan', roomId:'r10', rent:16000, status:'Active' },
                   { id:'s2', name:'Abid Ali', roomId:'r2',  rent:16000, status:'Active' },
                   { id:'s3', name:'Mid Wing', roomId:'rA1', rent:16000, status:'Active' }];
    navigate('payments');
  });
  await win.waitForTimeout(400);

  // Numeric rooms in numeric order, lettered wings after them — not "1, 10, 2"
  // and not "A1" interleaved as if it were 1.
  expect(await win.evaluate(() => roomsByNumber(DB.rooms).map(r => r.number)))
    .toEqual(['2', '10', 'A1']);
  expect(await win.evaluate(() => studentsByRoom(DB.students).map(s => s.name)))
    .toEqual(['Abid Ali', 'Zed Khan', 'Mid Wing']);

  await win.evaluate(() => openAddPayment());
  await win.waitForSelector('#f-pstudent-search');
  await win.click('#f-pstudent-search');
  await win.type('#f-pstudent-search', 'Abid Ali');
  await win.waitForTimeout(300);

  // Typing must leave exactly what was typed. The old auto-select rewrote the
  // box to "Abid Ali — Room #2" partway through, so the tail of the name landed
  // on the end: "Abid Ali — Room #2Ali".
  expect(await win.inputValue('#f-pstudent-search'),
    'typing was overwritten by an auto-selection').toBe('Abid Ali');

  for (let i = 0; i < 12; i++) { await win.keyboard.press('Backspace'); await win.waitForTimeout(30); }
  expect(await win.inputValue('#f-pstudent-search'),
    'backspace could not clear the search box').toBe('');
  expect(await win.inputValue('#f-pstudent'),
    'editing the text left the hidden student id pointing at the old pick').toBe('');

  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// Runs last: it drives repeated failures and ends with the account locked.
test('login: wrong password is rejected, decrements attempts, locks after 5', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await waitForLoginScreen(win);

  // Drive the real login handler and read the brute-force state directly, so the
  // assertions don't race the login-error text's 4-second auto-hide.
  async function failOnce(pw) {
    return await win.evaluate(async (p) => {
      document.getElementById('login-user').value = 'warden1';
      document.getElementById('login-input').value = p;
      await checkLogin();
      // Lockout is keyed on the typed username, not on CUR_ROLE — CUR_ROLE is
      // only set once a login actually succeeds.
      return {
        remaining: _remainingAttempts('warden1'),
        locked: !!_isLockedOut('warden1'),
        loggedIn: document.getElementById('login-screen').style.display === 'none',
      };
    }, pw);
  }

  // 1st wrong attempt: rejected (not logged in), one attempt consumed (4 remain).
  const a1 = await failOnce('nope-1');
  expect(a1.loggedIn, 'wrong password must NOT log in').toBeFalsy();
  expect(a1.locked, 'should not be locked after 1 attempt').toBeFalsy();
  expect(a1.remaining, 'first wrong attempt should leave 4 remaining').toBe(4);

  // Attempts 2-4 keep decrementing, still not locked.
  expect((await failOnce('nope-2')).remaining).toBe(3);
  expect((await failOnce('nope-3')).remaining).toBe(2);
  expect((await failOnce('nope-4')).remaining).toBe(1);

  // 5th wrong attempt trips the lockout.
  const a5 = await failOnce('nope-5');
  expect(a5.locked, 'account should lock after 5 failed attempts').toBeTruthy();
  expect(a5.loggedIn).toBeFalsy();

  await app.close();
});
