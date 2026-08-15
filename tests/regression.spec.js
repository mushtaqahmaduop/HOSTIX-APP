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

async function login(win, password = 'warden1') {
  await waitForLoginScreen(win);
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

  // ── Receipt renders with correct data and NO double "PKR PKR" prefix (CLAUDE.md rule #4).
  const receipt = await win.evaluate((pid) => buildReceiptHTML(pid), over.id);
  expect(receipt, 'buildReceiptHTML returned nothing').toBeTruthy();
  expect(receipt).toContain('Reg Test Student');
  expect(receipt).toContain('PKR 20,000');
  expect(receipt, 'receipt has a double PKR prefix').not.toContain('PKR PKR');

  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
test('security: clear-all is blocked without the correct warden password', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length, 'SAFETY ABORT: isolated DB not empty').toBe(0);

  const studentId = await seedRoomAndStudent(win);
  expect(studentId).toBeTruthy();

  // Open the password-gated clear-all modal.
  await win.evaluate(() => clearAllDataWithPassword());
  await win.waitForSelector('#clear-all-pwd');

  // WRONG password → data intact, error shown, and the flow must NOT advance to
  // the final "☢️ Clear ALL Data?" confirmation (clearAllData is never reached).
  const afterWrong = await win.evaluate(async () => {
    document.getElementById('clear-all-pwd').value = 'definitely-wrong';
    await confirmClearAllWithPassword();
    return {
      students: DB.students.length,
      errShown: document.getElementById('clear-pwd-err')?.style.display === 'block',
      stillOnPwStep: !!document.getElementById('clear-all-pwd'), // password modal still open
    };
  });
  expect(afterWrong.students, 'SECURITY REGRESSION: clear-all wiped data with a WRONG password').toBeGreaterThan(0);
  expect(afterWrong.errShown, 'wrong-password error not shown').toBeTruthy();
  expect(afterWrong.stillOnPwStep, 'wrong password must not advance past the password step').toBeTruthy();

  // CORRECT password → the gate passes and clearAllData() opens its final
  // confirmation (proves the password check runs and gates the wipe).
  const afterCorrect = await win.evaluate(async () => {
    document.getElementById('clear-all-pwd').value = 'warden1';
    await confirmClearAllWithPassword();
    return {
      confirmReached: typeof _pendingConfirmCb === 'function', // clearAllData() showed its confirm
      studentsBeforeConfirm: DB.students.length,               // not wiped until confirmed
    };
  });
  expect(afterCorrect.confirmReached, 'correct password should reach the clear-all confirmation').toBeTruthy();
  expect(afterCorrect.studentsBeforeConfirm, 'must not wipe before the final confirm').toBeGreaterThan(0);

  // Confirm the final dialog → data is actually cleared.
  const cleared = await win.evaluate(async () => {
    await _pendingConfirmCb();
    return DB.students.length;
  });
  expect(cleared, 'confirming clear-all should wipe students').toBe(0);

  await app.close();
});

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

  // Populated archive → records render grouped by year, still no error.
  // (renderPage swaps #content inside a setTimeout fade, so wait before reading.)
  await win.evaluate(() => {
    DB.archive = [
      { id: 'a1', studentName: 'Old Student', month: 'January 2024', amount: 16000, date: '2024-01-05', status: 'Paid' },
      { id: 'a2', category: 'Electricity', amount: 5000, date: '2024-02-01', description: 'WAPDA' },
    ];
    renderPage('archive');
  });
  await win.waitForTimeout(400);
  const html = await win.evaluate(() => document.getElementById('content').innerHTML);
  expect(html, 'archive render error with data').not.toContain('Render Error');
  expect(html).toContain('Old Student');
  expect(html).toContain('Electricity');
  expect(html).toContain('2024');

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
      document.getElementById('login-input').value = p;
      await checkLogin();
      return {
        remaining: _remainingAttempts(CUR_ROLE),
        locked: !!_isLockedOut(CUR_ROLE),
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

// ─────────────────────────────────────────────────────────────────────────────
// MONTH ISOLATION — cards and PDFs must never mix data from different months.
//
// Guards the fixes for: the Funds Transfer "this month" card reading the real
// calendar month instead of the header month picker, and the cancellation
// report's payment window having no upper bound (later months leaked in).
test('month isolation: cards and report windows follow the selected month', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length, 'SAFETY ABORT: isolated DB not empty').toBe(0);

  const studentId = await seedRoomAndStudent(win);
  expect(studentId).toBeTruthy();

  // Seed two payments, two expenses and two transfers in two DIFFERENT months.
  await win.evaluate((sid) => {
    DB.payments = [
      { id:'pA', studentId:sid, studentName:'Reg Test Student', roomNumber:'R01',
        amount:5000, unpaid:0,    status:'Paid',    month:'March 2026', date:'2026-03-10' },
      { id:'pB', studentId:sid, studentName:'Reg Test Student', roomNumber:'R01',
        amount:7000, unpaid:0,    status:'Paid',    month:'April 2026', date:'2026-04-10' },
      { id:'pC', studentId:sid, studentName:'Reg Test Student', roomNumber:'R01',
        amount:1000, unpaid:2000, status:'Pending', month:'March 2026', date:'2026-03-20' },
    ];
    DB.expenses  = [ { id:'eA', amount:800, category:'Food', date:'2026-03-05' },
                     { id:'eB', amount:900, category:'Food', date:'2026-04-05' } ];
    DB.transfers = [ { id:'tA', amount:300, method:'Cash', date:'2026-03-15' },
                     { id:'tB', amount:400, method:'Cash', date:'2026-04-15' } ];
  }, studentId);

  // ── Revenue is scoped strictly to the selected month ──────────────────────
  const rev = await win.evaluate(() => ({
    march: calcRevenue('2026-03'),
    april: calcRevenue('2026-04'),
  }));
  expect(rev.march, 'March revenue must exclude April payments').toBe(6000); // 5000 paid + 1000 partial
  expect(rev.april, 'April revenue must exclude March payments').toBe(7000);

  // ── Header month picker drives thisMonth()/thisMonthLabel() ───────────────
  const picker = await win.evaluate(() => {
    _dashboardMonth = '2026-03';
    const march = { key: thisMonth(), label: thisMonthLabel() };
    _dashboardMonth = '2026-04';
    const april = { key: thisMonth(), label: thisMonthLabel() };
    _dashboardMonth = null;
    return { march, april };
  });
  expect(picker.march.key).toBe('2026-03');
  expect(picker.march.label).toContain('March');
  expect(picker.april.key).toBe('2026-04');
  expect(picker.april.label).toContain('April');

  // ── Funds Transfer modal: the month card must follow the picker, not today.
  // Regression: it used new Date(), so it always showed the real current month.
  // The whole-modal HTML is NOT a valid probe: the table below the cards lists all
  // months, so any figure appears somewhere regardless. Read the month card itself.
  for (const [monthKey, expectedAmt, expectedLabel] of
       [['2026-03', 300, 'March'], ['2026-04', 400, 'April']]) {
    const card = await win.evaluate((mk) => {
      _dashboardMonth = mk;
      showTransferRecordsModal();
      // The month card is the one whose heading starts with the calendar emoji.
      const heads = Array.from(document.querySelectorAll('div'))
        .filter(d => (d.textContent || '').trim().startsWith('📅'));
      const head = heads.find(d => d.children.length === 0);
      const out = head
        ? { label: head.textContent.trim(), body: head.parentElement.textContent.trim() }
        : null;
      if (typeof closeModal === 'function') closeModal();
      _dashboardMonth = null;
      return out;
    }, monthKey);

    expect(card, 'could not locate the month card in the transfer modal').toBeTruthy();
    expect(card.label, `month card must be titled for ${expectedLabel}, not the real calendar month`)
      .toContain(expectedLabel);
    expect(card.body, `month card total should be ${expectedAmt} for ${expectedLabel}`)
      .toContain(String(expectedAmt));
    // And it must NOT show the other month's transfer total.
    const otherAmt = expectedAmt === 300 ? '400' : '300';
    expect(card.body, `month card leaked the other month's total (${otherAmt})`)
      .not.toContain(otherAmt);
  }

  // ── _payMatchesMonth never matches across months ──────────────────────────
  const cross = await win.evaluate(() => {
    const march = DB.payments.filter(p => _payMatchesMonth(p, '2026-03')).map(p => p.id);
    const april = DB.payments.filter(p => _payMatchesMonth(p, '2026-04')).map(p => p.id);
    return { march, april, overlap: march.filter(id => april.includes(id)) };
  });
  expect(cross.march.sort()).toEqual(['pA', 'pC']);
  expect(cross.april).toEqual(['pB']);
  expect(cross.overlap, 'no payment may belong to two months at once').toEqual([]);

  await app.close();
});
