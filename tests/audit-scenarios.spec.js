// ════════════════════════════════════════════════════════════════════════════
// Counter scenarios found in the 2026-08-19 walkthrough.
//
// Each one is a thing a warden actually does, that the app got wrong quietly:
// no error, no crash, just a number or a record that ended up different from
// what happened at the desk.
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

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

const RENT = 9000, MESS = 5000, FULL = RENT + MESS;

async function boot() {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  const pageErrors = [];
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);
  return { app, win, pageErrors };
}

// A priced hostel with one room and one student, built the same way each time.
async function seed(win) {
  await win.evaluate(async ([rent, mess]) => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    if (!DB.rooms.some(r => r.id === 'rmA')) {
      DB.rooms.push({ id: 'rmA', number: '7', floor: 'Ground', typeId: '2s',
        studentIds: [], amenities: [], notes: '', rent });
    }
    if (!DB.students.some(s => s.id === '901')) {
      DB.students.push({ id: '901', name: 'Audit Student', roomId: 'rmA',
        messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' });
    }
    await saveDB();
  }, [RENT, MESS]);
}

// ─────────────────────────────────────────────────────────────────────────────
test('calendar dates follow the local clock, not UTC', async () => {
  const { app, win, pageErrors } = await boot();

  const d = await win.evaluate(() => {
    const n = new Date();
    const p = x => String(x).padStart(2, '0');
    return {
      appToday: today(),
      localToday: n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate()),
      appMonth: thisMonth(),
      localMonth: n.getFullYear() + '-' + p(n.getMonth() + 1),
      offsetMinutes: n.getTimezoneOffset(),
      // The default due date on the Add Payment page is meant to be the 6th.
      dueDay: (() => { const x = new Date(); x.setDate(6); return ymd(x); })().slice(-2),
    };
  });
  console.log('\n[dates] ' + JSON.stringify(d));

  expect(d.appToday, 'today() must be the date on the wall').toBe(d.localToday);
  expect(d.appMonth, 'thisMonth() must be the local month').toBe(d.localMonth);
  expect(d.dueDay, 'a due date built as "the 6th" must come out as the 6th').toBe('06');

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('renaming a room carries the new number onto its payments, and duplicates are refused', async () => {
  const { app, win, pageErrors } = await boot();
  await seed(win);

  await win.evaluate(async ([full]) => {
    DB.payments.push({ id: 'pR', studentId: '901', studentName: 'Audit Student',
      roomId: 'rmA', roomNumber: '7', month: 'July 2026', monthlyRent: 9000,
      messCharge: 5000, messIncluded: true, amount: full, unpaid: 0, status: 'Paid',
      date: '2026-07-05', paidDate: '2026-07-05', extraCharges: [], extraTotal: 0 });
    DB.rooms.push({ id: 'rmB', number: '8', floor: 'Ground', typeId: '2s',
      studentIds: [], amenities: [], notes: '', rent: 9000 });
    await saveDB();
  }, [FULL]);

  // Rename room 7 → B7 through the real edit form.
  await win.evaluate(() => showEditRoomModal('rmA'));
  await win.waitForSelector('#f-rnum', { timeout: 8000 });
  await win.fill('#f-rnum', 'B7');
  await win.evaluate(() => submitEditRoom('rmA'));
  await win.waitForTimeout(800);

  const renamed = await win.evaluate(() => ({
    room: DB.rooms.find(r => r.id === 'rmA').number,
    onPayment: DB.payments.find(p => p.id === 'pR').roomNumber,
  }));
  console.log('[rename] ' + JSON.stringify(renamed));
  expect(renamed.room).toBe('B7');
  expect(renamed.onPayment, 'the payment must follow the room it belongs to').toBe('B7');

  // Renaming room 8 onto B7 must be refused.
  await win.evaluate(() => showEditRoomModal('rmB'));
  await win.waitForSelector('#f-rnum', { timeout: 8000 });
  await win.fill('#f-rnum', 'B7');
  await win.evaluate(() => submitEditRoom('rmB'));
  await win.waitForTimeout(600);
  const clash = await win.evaluate(() => DB.rooms.find(r => r.id === 'rmB').number);
  expect(clash, 'two rooms must not answer to the same number').toBe('8');

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('a student on notice is still billed, still findable, and stays on notice', async () => {
  const { app, win, pageErrors } = await boot();
  await seed(win);

  await win.evaluate(async () => {
    DB.students.find(s => s.id === '901').status = 'Cancelling';
    await saveDB();
  });

  // 1. The monthly run still raises their bill.
  await win.evaluate(() => generateMonthlyRents());
  await win.waitForTimeout(1000);
  const billed = await win.evaluate(() => {
    const p = DB.payments.find(x => x.studentId === '901' && x.month === thisMonthLabel());
    return p ? { unpaid: p.unpaid, rent: p.monthlyRent, mess: p.messCharge } : null;
  });
  console.log('\n[on notice, billed] ' + JSON.stringify(billed));
  expect(billed, 'a student leaving at month end still owes this month').not.toBeNull();
  expect(billed.unpaid).toBe(FULL);

  // 2. The Add Payment search can still reach them to take it.
  await win.evaluate(() => openAddPayment());
  await win.waitForSelector('#f-pstudent-search', { timeout: 8000 });
  await win.evaluate(() => filterStudentDropdown('Audit'));
  await win.waitForTimeout(300);
  const hits = await win.evaluate(() =>
    document.getElementById('student-search-results').innerText);
  console.log('[on notice, search] ' + JSON.stringify(hits.slice(0, 120)));
  expect(hits, 'the warden must be able to find them to collect').toContain('Audit Student');

  // 3. Opening and saving their edit form must not quietly un-cancel them.
  await win.evaluate(() => showEditStudentModal('901'));
  await win.waitForSelector('#f-tstat', { timeout: 8000 });
  const selected = await win.evaluate(() => document.getElementById('f-tstat').value);
  expect(selected, 'the form must open on the status they actually have').toBe('Cancelling');
  await win.evaluate(() => submitEditStudent('901'));
  await win.waitForTimeout(800);
  const after = await win.evaluate(() => DB.students.find(s => s.id === '901').status);
  expect(after, 'saving an unrelated edit must not reverse the cancellation').toBe('Cancelling');

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('rents are generated from Settings, and unpriced students are skipped not zero-billed', async () => {
  const { app, win, pageErrors } = await boot();
  await seed(win);

  await win.evaluate(async () => {
    // A second room type with no rent set, and a student in it.
    DB.settings.roomTypes.push({ id: 'zz', name: 'Unpriced', capacity: 2, defaultRent: 0, defaultMess: 0 });
    DB.rooms.push({ id: 'rmZ', number: '99', floor: 'Ground', typeId: 'zz',
      studentIds: [], amenities: [], notes: '', rent: 0 });
    DB.students.push({ id: '902', name: 'Unpriced Student', roomId: 'rmZ',
      messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' });
    // A stale per-student figure that must NOT be what gets billed.
    DB.students.find(s => s.id === '901').rent = 1;
    await saveDB();
  });

  await win.evaluate(() => generateMonthlyRents());
  await win.waitForTimeout(1000);

  const out = await win.evaluate(() => ({
    priced:   DB.payments.find(p => p.studentId === '901' && p.month === thisMonthLabel()) || null,
    unpriced: DB.payments.find(p => p.studentId === '902' && p.month === thisMonthLabel()) || null,
  }));
  console.log('\n[generate] ' + JSON.stringify(out));

  expect(out.priced, 'the priced student is billed').not.toBeNull();
  expect(out.priced.unpaid, 'from Settings, not from the stale copy on the student').toBe(FULL);
  expect(out.unpriced, 'a student with no configured rent gets no bill of zero').toBeNull();

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('money cannot be entered as a negative, and lists in use cannot be removed', async () => {
  const { app, win, pageErrors } = await boot();
  await seed(win);

  await win.evaluate(async () => {
    DB.expenses.push({ id: 'e1', category: DB.settings.expenseCategories[0],
      amount: 1200, date: today(), description: 'seed' });
    DB.payments.push({ id: 'pM', studentId: '901', studentName: 'Audit Student',
      roomId: 'rmA', roomNumber: '7', month: 'June 2026', monthlyRent: 9000,
      amount: 9000, unpaid: 0, status: 'Paid', method: DB.settings.paymentMethods[0],
      date: '2026-06-05', extraCharges: [], extraTotal: 0 });
    await saveDB();
  });

  // A minus sign in the amount box must not become a negative expense.
  const before = await win.evaluate(() => DB.expenses.length);
  await win.evaluate(() => showAddExpenseModal());
  await win.waitForSelector('#f-eamt', { timeout: 8000 });
  await win.fill('#f-eamt', '-5000');
  await win.evaluate(() => submitAddExpense());
  await win.waitForTimeout(600);
  const negative = await win.evaluate(() => ({
    count: DB.expenses.length,
    anyNegative: DB.expenses.some(e => Number(e.amount) <= 0),
  }));
  console.log('\n[negative expense] ' + JSON.stringify(negative));
  expect(negative.count, 'a negative expense must not be written').toBe(before);
  expect(negative.anyNegative).toBe(false);
  await win.evaluate(() => closeModal());

  // A category / method still carrying records must not disappear from Settings.
  const kept = await win.evaluate(async () => {
    const cat = DB.expenses[0].category;
    const pm  = DB.payments.find(p => p.id === 'pM').method;
    await removeExpenseCategory(cat);
    await removePaymentMethod(pm);
    return {
      catStillThere: DB.settings.expenseCategories.includes(cat),
      pmStillThere:  DB.settings.paymentMethods.includes(pm),
    };
  });
  console.log('[in-use lists] ' + JSON.stringify(kept));
  expect(kept.catStillThere, 'removing it would strand every expense filed under it').toBe(true);
  expect(kept.pmStillThere, 'removing it would strand every payment taken by it').toBe(true);

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('a receipt can still be printed once the payment has been archived', async () => {
  const { app, win, pageErrors } = await boot();
  await seed(win);

  const built = await win.evaluate(async () => {
    // Exactly what enforceDataRetention() does to a settled payment older than
    // seven months: out of the live table, into the archive.
    if (!Array.isArray(DB.archive)) DB.archive = [];
    DB.archive.push({ id: 'pOld', _src: 'payments', studentId: '901',
      studentName: 'Audit Student', roomId: 'rmA', roomNumber: '7',
      month: 'January 2026', monthlyRent: 9000, messCharge: 5000, messIncluded: true,
      amount: 14000, unpaid: 0, status: 'Paid', method: 'Cash',
      date: '2026-01-04', paidDate: '2026-01-04', extraCharges: [], extraTotal: 0 });
    await saveDB();
    const html = buildReceiptHTML('pOld');
    return { ok: !!html, hasName: !!html && html.indexOf('Audit Student') !== -1 };
  });
  console.log('\n[archived receipt] ' + JSON.stringify(built));
  expect(built.ok, 'last year’s receipt must still be printable').toBe(true);
  expect(built.hasName).toBe(true);

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('student codes already in use are kept, and every table follows a reassignment', async () => {
  const { app, win, pageErrors } = await boot();

  const out = await win.evaluate(async () => {
    // Two students already carrying printed codes, one carrying a legacy id —
    // an Excel import or a restored backup is how the odd one out arrives.
    DB.students.push(
      { id: '010', name: 'Has A Card',   roomId: '', status: 'Active', joinDate: '2026-01-01' },
      { id: 'LEG-77', name: 'Imported',  roomId: '', status: 'Active', joinDate: '2026-01-01' },
      { id: '011', name: 'Also Carded',  roomId: '', status: 'Active', joinDate: '2026-01-01' });
    // Money for the imported student, on both sides of the retention line.
    DB.payments.push({ id: 'pLive', studentId: 'LEG-77', studentName: 'Imported',
      month: 'August 2026', amount: 500, unpaid: 0, status: 'Paid', date: '2026-08-01' });
    if (!Array.isArray(DB.archive)) DB.archive = [];
    DB.archive.push({ id: 'pArch', _src: 'payments', studentId: 'LEG-77',
      studentName: 'Imported', month: 'January 2026', amount: 700, unpaid: 0,
      status: 'Paid', date: '2026-01-02' });
    await saveDB();

    await migrateStudentIdsToNumeric();

    const imported = DB.students.find(s => s.name === 'Imported');
    return {
      carded:   DB.students.find(s => s.name === 'Has A Card').id,
      carded2:  DB.students.find(s => s.name === 'Also Carded').id,
      imported: imported.id,
      onLive:   DB.payments.find(p => p.id === 'pLive').studentId,
      onArch:   DB.archive.find(p => p.id === 'pArch').studentId,
      dupes:    DB.students.length - new Set(DB.students.map(s => s.id)).size,
    };
  });
  console.log('\n[student codes] ' + JSON.stringify(out));

  expect(out.carded,  'a code already on an ID card must not move').toBe('010');
  expect(out.carded2, 'nor the next one').toBe('011');
  expect(out.imported, 'only the legacy id is reassigned').not.toBe('LEG-77');
  expect(out.onLive, 'live payments follow the student').toBe(out.imported);
  expect(out.onArch, 'and so does everything already archived').toBe(out.imported);
  expect(out.dupes, 'no two students may share a code').toBe(0);

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('the boot repair fixes how records describe themselves without moving money', async () => {
  const { app, win, pageErrors } = await boot();
  await seed(win);

  const r = await win.evaluate(async ([rent, mess, full]) => {
    const n = v => Number(v || 0);
    const base = { studentId: '901', studentName: 'Audit Student', roomId: 'rmA',
      roomNumber: 'B7', extraCharges: [], extraTotal: 0, admissionFee: 0,
      concession: 0, method: 'Cash', date: '2026-05-04' };

    DB.payments.push(
      // 1 ─ pre-split drift: the all-in figure in monthlyRent AND a mess line
      //     beside it, so the month reads rent+mess+mess.
      Object.assign({}, base, { id: 'rDrift', month: 'March 2026',
        monthlyRent: full, totalRent: full, messCharge: mess, messIncluded: true,
        amount: full, unpaid: 0, status: 'Paid', paidDate: '2026-05-04' }),
      // 2 ─ rent half correct, mess ticked, but billed rent-only.
      Object.assign({}, base, { id: 'rRentOnly', month: 'April 2026',
        monthlyRent: rent, totalRent: rent, messCharge: mess, messIncluded: true,
        amount: rent, unpaid: 0, status: 'Paid', paidDate: '2026-05-04' }),
      // 3 ─ nothing collected, yet the trail claims two full collections.
      Object.assign({}, base, { id: 'rGhost', month: 'May 2026',
        monthlyRent: rent, totalRent: rent, messCharge: 0, messIncluded: false,
        amount: 0, unpaid: rent, status: 'Pending',
        partialPayments: [
          { date: '2026-05-01', amount: rent, method: 'Cash', collectedBy: 'W', note: 'Pending cleared' },
          { date: '2026-05-02', amount: rent, method: 'Cash', collectedBy: 'W', note: 'Pending cleared' }] }),
      // 4 ─ the same instalment pushed twice, byte for byte.
      Object.assign({}, base, { id: 'rDup', month: 'June 2026',
        monthlyRent: rent, totalRent: rent, messCharge: 0, messIncluded: false,
        amount: rent, unpaid: 0, status: 'Paid', paidDate: '2026-06-02',
        partialPayments: [
          { date: '2026-06-01', amount: rent, method: 'Cash', collectedBy: 'W', note: 'Instalment' },
          { date: '2026-06-01', amount: rent, method: 'Cash', collectedBy: 'W', note: 'Instalment' }] }),
      // 5 ─ healthy. Must come out untouched.
      Object.assign({}, base, { id: 'rOk', month: 'February 2026',
        monthlyRent: rent, totalRent: rent, messCharge: mess, messIncluded: true,
        amount: full, unpaid: 0, status: 'Paid', paidDate: '2026-02-04' }));
    await saveDB();

    const before = {
      amount: DB.payments.reduce((a, p) => a + n(p.amount), 0),
      unpaid: DB.payments.reduce((a, p) => a + n(p.unpaid), 0),
    };
    const counts = repairPaymentComposition();
    const get = id => DB.payments.find(p => p.id === id);
    return {
      counts, before,
      after: {
        amount: DB.payments.reduce((a, p) => a + n(p.amount), 0),
        unpaid: DB.payments.reduce((a, p) => a + n(p.unpaid), 0),
      },
      drift:    { rent: get('rDrift').monthlyRent, mess: get('rDrift').messCharge,
                  paid: get('rDrift').amount, unpaid: get('rDrift').unpaid },
      rentOnly: { messIncluded: get('rRentOnly').messIncluded, paid: get('rRentOnly').amount },
      ghost:    (get('rGhost').partialPayments || []).length,
      dup:      (get('rDup').partialPayments || []).length,
      ok:       { rent: get('rOk').monthlyRent, messIncluded: get('rOk').messIncluded },
    };
  }, [RENT, MESS, FULL]);
  console.log('\n[repair] ' + JSON.stringify(r));

  // Nothing collected and nothing owed may change. This is the whole contract.
  expect(r.after.amount, 'not one rupee of collected money moves').toBe(r.before.amount);
  expect(r.after.unpaid, 'nor one rupee of outstanding').toBe(r.before.unpaid);

  expect(r.counts.drift).toBe(1);
  expect(r.drift.rent, 'the all-in figure is split back to rent').toBe(RENT);
  expect(r.drift.mess, 'the mess line stays where it was').toBe(MESS);
  expect(r.drift.paid + r.drift.unpaid, 'the month still totals what it did').toBe(FULL);

  expect(r.counts.messFlag).toBe(1);
  expect(r.rentOnly.messIncluded, 'a month billed rent-only says so').toBe(false);

  expect(r.ghost, 'a trail of collections on a record with nothing collected goes').toBe(0);
  expect(r.dup, 'the same instalment counted twice becomes one').toBe(1);

  expect(r.ok.rent, 'a healthy record is left alone').toBe(RENT);
  expect(r.ok.messIncluded).toBe(true);

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('a write that fails says so, and keeps saying so until one succeeds', async () => {
  const { app, win, pageErrors } = await boot();
  await seed(win);

  // A genuine failure, not a stub: contextBridge freezes electronAPI, so the
  // write is broken by giving a record something that cannot be serialised or
  // structured-cloned. Both the surgical path and the full-rewrite fallback
  // fail on it, which is exactly the state the bar exists for.
  const failed = await win.evaluate(async () => {
    const bad = { id: 'p_circular', studentId: '901', studentName: 'Audit Student',
      month: 'March 2026', amount: 1, unpaid: 0, status: 'Paid', date: '2026-03-01' };
    bad.self = bad;                                  // circular
    DB.payments.push(bad);
    const ok = await saveDB();
    const bar = document.getElementById('save-failed-bar');
    return {
      ok,
      barShown: !!bar,
      text: bar ? bar.innerText.replace(/\s+/g, ' ') : '',
      hasRetry:  !!document.getElementById('save-failed-retry'),
      hasExport: !!document.getElementById('save-failed-export'),
    };
  });
  console.log('\n[save failed] ' + JSON.stringify(failed));

  expect(failed.ok, 'saveDB reports the failure').toBe(false);
  expect(failed.barShown, 'and the app says so where it cannot be missed').toBe(true);
  expect(failed.text).toContain('Not saved to disk');
  expect(failed.hasRetry, 'with a way to try again').toBe(true);
  expect(failed.hasExport, 'and a way to get the data out while it exists').toBe(true);

  // A success toast fired by a call site must not bury it.
  const survives = await win.evaluate(() => {
    if (typeof toast === 'function') toast('Payment recorded', 'success');
    return !!document.getElementById('save-failed-bar');
  });
  expect(survives, 'a later success toast does not clear the warning').toBe(true);

  // It clears only when a write actually lands.
  const recovered = await win.evaluate(async () => {
    DB.payments = DB.payments.filter(p => p.id !== 'p_circular');
    const ok = await saveDB();
    return { ok, barShown: !!document.getElementById('save-failed-bar') };
  });
  console.log('[save recovered] ' + JSON.stringify(recovered));
  expect(recovered.ok, 'the next write succeeds').toBe(true);
  expect(recovered.barShown, 'and only then does the warning go').toBe(false);

  expect(pageErrors).toEqual([]);
  await app.close();
});
