// ════════════════════════════════════════════════════════════════════════════
// Admission → Payment handoff
//
// Fills the Add Student form with FULL detail, submits through the real
// submitAddStudent() path (saveOnly=false, i.e. "proceed to payment"), and
// asserts the Add Payment modal it hands off to is actually usable: student
// selected, charge resolved from Settings, totals correct, no console errors.
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
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  };
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

test('admit a student with full detail, then proceed to payment', async () => {
  const consoleErrors = [];
  const pageErrors = [];

  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  // SAFETY GUARD — never write into a non-empty (i.e. real) database.
  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  // ── Price the hostel from Settings, rent split from mess ──────────────────
  await win.evaluate(async () => {
    const t = DB.settings.roomTypes.find(x => x.id === '2s');
    t.defaultRent = 10000;
    t.defaultMess = 7000;
    await saveDB();
  });

  // ── A room of that type ───────────────────────────────────────────────────
  await win.evaluate(() => showAddRoomModal());
  await win.waitForSelector('#f-rnum');
  await win.fill('#f-rnum', 'B12');
  await win.evaluate(() => {
    document.getElementById('f-rfloor').value = '1st';
    document.getElementById('f-rtype').value = '2s';
  });
  await win.evaluate(() => submitAddRoom());
  await win.waitForTimeout(400);
  const roomId = await win.evaluate(() => (DB.rooms.find(r => r.number === 'B12') || {}).id);
  expect(roomId, 'room B12 was not created').toBeTruthy();

  // Room inherited its rent from the room type in Settings.
  const roomRent = await win.evaluate(rid => DB.rooms.find(r => r.id === rid).rent, roomId);
  expect(roomRent, 'room did not take its rent from Settings').toBe(10000);

  // ── Add Student, every field the form offers ──────────────────────────────
  await win.evaluate(() => navigate('students'));
  await win.waitForTimeout(300);
  await win.evaluate(() => showAddStudentModal());
  await win.waitForSelector('#f-tname');

  await win.fill('#f-tname',        'Bilal Ahmad Khan');
  await win.fill('#f-tfname',       'Ikram Ullah Khan');
  await win.fill('#f-tcnic',        '3520212345671');
  await win.fill('#f-tdob',         '2003-04-17');
  await win.fill('#f-tocc',         'BS Computer Science');
  await win.fill('#f-tsession',     'Fall 2026 / 3rd Semester');
  await win.fill('#f-tphone',       '3011234567');
  await win.fill('#f-temerg',       'Ikram Ullah (Father)');
  await win.fill('#f-temergphone',  '03009876543');
  await win.fill('#f-temail',       'bilal.ahmad');
  await win.fill('#f-taddress',     'House 25, Street 4, Hayatabad, Peshawar');
  await win.fill('#f-tallergies',   'Penicillin');
  await win.fill('#f-tnotes',       'Transferred from Block A. Quiet, no complaints.');
  await win.evaluate(() => {
    document.getElementById('f-tgender').value      = 'Male';
    document.getElementById('f-tmarital').value     = 'Single';
    document.getElementById('f-tnationality').value = 'Pakistani';
    document.getElementById('f-tjoin').value        = today();
    document.getElementById('f-texpstay').value     = '12 Months';
    document.getElementById('f-tpm').value          = 'JazzCash';
  });
  // Pick the room the way the warden does — through the room search dropdown.
  await win.evaluate(rid => {
    const r = DB.rooms.find(x => x.id === rid);
    pickRoomSearch(rid, r.rent, 'Room #' + r.number);
  }, roomId);
  await win.waitForTimeout(200);

  // ── Submit and PROCEED TO PAYMENT (saveOnly = false) ──────────────────────
  await win.evaluate(() => submitAddStudent('', false, false));
  // submitAddStudent defers openPaymentForNewStudent by 350ms, which then
  // defers selectStudentForPayment by a further 120ms.
  await win.waitForTimeout(1500);

  const student = await win.evaluate(() => DB.students.find(s => s.name === 'Bilal Ahmad Khan'));
  expect(student, 'student was not admitted').toBeTruthy();
  expect(student.rent, 'student rent not taken from the room').toBe(10000);
  expect(student.mess, 'student mess not taken from the room type').toBe(7000);

  // ── The Add Payment modal must have opened AND be populated ───────────────
  const modal = await win.evaluate(() => {
    const q = id => document.getElementById(id);
    return {
      modalOpen:     !!q('f-pcharge'),
      studentHidden: q('f-pstudent') ? q('f-pstudent').value : null,
      searchBox:     q('f-pstudent-search') ? q('f-pstudent-search').value : null,
      infoVisible:   q('selected-student-info') ? q('selected-student-info').style.display : null,
      infoText:      q('selected-student-info') ? q('selected-student-info').innerText : null,
      rent:          q('f-prent')  ? q('f-prent').value  : null,
      mess:          q('f-pmess')  ? q('f-pmess').value  : null,
      charge:        q('f-pcharge')? q('f-pcharge').value: null,
      messOn:        q('f-pmess-on') ? q('f-pmess-on').checked : null,
      unpaid:        q('f-punpaid') ? q('f-punpaid').value : null,
      sumRent:       q('pf-sum-rent') ? q('pf-sum-rent').textContent : null,
      sumMess:       q('pf-sum-mess') ? q('pf-sum-mess').textContent : null,
      sumDue:        q('pf-sum-due')  ? q('pf-sum-due').textContent  : null,
    };
  });
  console.log('\n[payment modal after admission]\n' + JSON.stringify(modal, null, 2));

  expect(modal.modalOpen, 'Add Payment modal did not open after admission').toBeTruthy();
  expect(modal.studentHidden, 'student was not pre-selected in the payment modal').toBe(student.id);
  expect(modal.rent,   'Room Rent not pre-filled from Settings').toBe('10000');
  expect(modal.mess,   'Mess not pre-filled from Settings').toBe('7000');
  expect(modal.messOn, 'mess tick should default on').toBe(true);
  expect(modal.unpaid, 'unpaid should be the full monthly charge (10000 + 7000)').toBe('17000');
  expect(modal.charge.replace(/,/g, ''), 'Monthly Charge box').toBe('17000');
  expect(modal.infoText, 'info strip missing the monthly charge').toContain('17,000');

  // ── Record the payment in full through the real submit path ───────────────
  await win.evaluate(() => { document.getElementById('f-ppaid').value = '17000'; recalcUnpaid(); });
  await win.evaluate(() => submitAddPayment());
  await win.waitForTimeout(800);

  const pay = await win.evaluate(() => DB.payments[DB.payments.length - 1]);
  console.log('\n[saved payment record]\n' + JSON.stringify({
    monthlyRent: pay.monthlyRent, messCharge: pay.messCharge, messIncluded: pay.messIncluded,
    amount: pay.amount, unpaid: pay.unpaid, status: pay.status, month: pay.month
  }, null, 2));
  expect(pay.monthlyRent, 'saved rent').toBe(10000);
  expect(pay.messCharge,  'saved mess').toBe(7000);
  expect(pay.amount,      'saved paid').toBe(17000);
  expect(pay.unpaid,      'should be fully settled').toBe(0);
  expect(pay.status,      'should be Paid').toBe('Paid');

  // ── The receipt must total the same 17,000 ────────────────────────────────
  const receipt = await win.evaluate(pid => {
    const html = buildReceiptHTML ? buildReceiptHTML(pid) : null;
    return html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : null;
  }, pay.id).catch(() => null);
  if (receipt) console.log('\n[receipt text] ' + receipt.slice(0, 600));

  // ── Screen 2: Add Payment from the student row, same student ──────────────
  await win.evaluate(() => navigate('students'));
  await win.waitForTimeout(400);
  await win.evaluate(sid => showAddPaymentForStudent(sid), student.id);
  await win.waitForSelector('#f-ps-amt', { timeout: 8000 });
  const screen2 = await win.evaluate(() => {
    const q = id => document.getElementById(id);
    return {
      rent: q('f-ps-amt').value,
      mess: q('f-ps-mess') ? q('f-ps-mess').value : 'NO MESS FIELD',
      messOn: q('f-ps-mess-on') ? q('f-ps-mess-on').checked : null,
      unpaid: q('f-ps-unpaid').value,
      header: q('f-ps-studentId') ? document.querySelector('.modal-body').innerText.slice(0, 200) : null,
    };
  });
  console.log('\n[screen 2 — Add Payment for student]\n' + JSON.stringify(screen2, null, 2));
  expect(screen2.rent, 'screen 2 rent').toBe('10000');
  expect(screen2.mess, 'screen 2 mess').toBe('7000');
  expect(screen2.unpaid, 'screen 2 monthly charge').toBe('17000');
  await win.evaluate(() => closeModal());
  await win.waitForTimeout(300);

  // ── Screen 3: Edit the payment we just saved ──────────────────────────────
  await win.evaluate(pid => showEditPaymentModal(pid), pay.id);
  await win.waitForSelector('#f-pamt', { timeout: 8000 });
  const screen3 = await win.evaluate(() => {
    const q = id => document.getElementById(id);
    return {
      rent: q('f-pamt').value,
      mess: q('f-pmess') ? q('f-pmess').value : 'NO MESS FIELD',
      messOn: q('f-pmess-on') ? q('f-pmess-on').checked : null,
      paid: q('f-ppaid').value,
      unpaid: q('f-punpaid').value,
    };
  });
  console.log('\n[screen 3 — Edit Payment]\n' + JSON.stringify(screen3, null, 2));
  expect(screen3.rent, 'screen 3 rent').toBe('10000');
  expect(screen3.mess, 'screen 3 mess').toBe('7000');

  // Saving the edit unchanged must not move the balance or drop the mess.
  await win.evaluate(pid => submitEditPayment(pid), pay.id);
  await win.waitForTimeout(600);
  const after = await win.evaluate(pid => DB.payments.find(p => p.id === pid), pay.id);
  console.log('\n[after a no-op edit]\n' + JSON.stringify({
    monthlyRent: after.monthlyRent, messCharge: after.messCharge,
    amount: after.amount, unpaid: after.unpaid, status: after.status
  }, null, 2));
  expect(after.messCharge, 'no-op edit dropped the mess charge').toBe(7000);
  expect(after.unpaid, 'no-op edit changed the balance').toBe(0);

  // The student's standing rent must be untouched by all of that.
  const stAfter = await win.evaluate(sid => DB.students.find(s => s.id === sid), student.id);
  expect(stAfter.rent, 'payment screens re-priced the student').toBe(10000);
  expect(stAfter.mess, 'payment screens changed the student mess').toBe(7000);

  console.log('\n[console errors] ' + consoleErrors.length);
  consoleErrors.slice(0, 30).forEach(e => console.log('  - ' + e));
  console.log('[uncaught page errors] ' + pageErrors.length);
  pageErrors.slice(0, 30).forEach(e => console.log('  - ' + e));

  await app.close();

  expect(pageErrors, 'uncaught JS error during admission → payment').toEqual([]);
});
