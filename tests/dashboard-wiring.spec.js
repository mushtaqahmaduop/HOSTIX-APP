// ════════════════════════════════════════════════════════════════════════════
// Where the dashboard's controls actually GO — the owner's report of 7 Sep.
//
// Six faults, and five of them were the same shape: a control that looked
// wired and was not. The screen showed a link, a filter, a chart slice and a
// Back route; pressing them landed somewhere adjacent to the answer.
//
//   · Collection by Method grouped on the raw `p.method` string, so 'Cash',
//     'cash ' and 'CASH' were three slices of one wallet.
//   · View All opened the whole Payments table, not the pending rows.
//   · The donut was inert.
//   · Mark Paid fired an un-awaited async mutation and then re-rendered, so
//     the screen repainted with stale data and repainted again.
//   · A jump from a widget could not be undone.
//   · Rooms still opened the OLD profile modal.
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
  await win.setViewportSize({ width: 1366, height: 768 });
}

/** Deliberately dirty method strings — three spellings of one wallet, and one
    name Settings has never heard of. */
async function seed(win) {
  await win.evaluate(async () => {
    DB.settings.hostelName = 'Continental Boys Hostel-2';
    const mo = thisMonth();
    DB.rooms = [4, 5, 7].map((n, i) => ({ id: 'r' + n, number: String(n), floor: 'Ground',
      typeId: DB.settings.roomTypes[i % DB.settings.roomTypes.length].id,
      studentIds: [], amenities: [], notes: '' }));
    const names = ['Mushtaq Ahmad', 'Tariq Aziz', 'Adnan Khan', 'Salman', 'Awais Khan'];
    DB.students = names.map((n, i) => ({ id: 's' + i, name: n, fatherName: '—',
      roomId: DB.rooms[i % DB.rooms.length].id, status: 'Active',
      joinDate: '2026-07-02', messOptIn: false, phone: '033188761' + i }));
    const pay = (id, si, amt, method, status) => ({
      id, studentId: 's' + si, studentName: names[si], roomNumber: DB.rooms[si % 3].number,
      month: mo, date: status === 'Paid' ? '2026-09-01' : '', paidDate: status === 'Paid' ? '2026-09-01' : '',
      amount: status === 'Paid' ? amt : 0, unpaid: status === 'Paid' ? 0 : amt, overpaid: 0,
      status, dueDate: '', method, monthlyRent: amt, messCharge: 0, messIncluded: false,
      extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0 });
    DB.payments = [
      pay('a', 0, 40000, 'Cash',      'Paid'),
      pay('b', 1, 20000, 'cash ',     'Paid'),   // trailing space
      pay('c', 2, 20000, 'CASH',      'Paid'),   // upper case
      pay('d', 0, 15000, 'EasyPaisa', 'Paid'),
      pay('e', 1,  5000, 'Barter',    'Paid'),   // not a configured method
      pay('p1', 3, 10000, 'Cash', 'Pending'),
      pay('p2', 4, 17000, 'Cash', 'Pending'),
    ];
    await saveDB();
  });
  await win.evaluate(() => navRail('dashboard'));
  await win.waitForTimeout(1400);
  await win.evaluate(() => document.querySelectorAll('#toast-container .toast').forEach(t => t.remove()));
}

test.beforeAll(() => { resetProfile(); });

test('one wallet is one slice, however it was spelled', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win);

  const rows = await win.evaluate(() =>
    [...document.querySelectorAll('.dl-meth__row')].map(r => ({
      name: r.querySelector('.dl-meth__name').textContent,
      amt:  r.querySelector('.dl-meth__amt').textContent })));

  /* THREE SPELLINGS, ONE ROW, and the money all of them carried. Grouping on
     the raw field gave three rows of 40K/20K/20K in three different colours. */
  /* Configured methods that took nothing this month are listed at zero
     (owner, 7 Sep) — JazzCash, Bank Transfer and Cheque here. The point of
     this case is the first row: three spellings, ONE wallet, all the money. */
  expect(rows.map(r => r.name)).toEqual(
    ['Cash', 'EasyPaisa', 'JazzCash', 'Bank Transfer', 'Cheque', 'Other']);
  expect(rows[0].amt).toBe('PKR 80K');
  expect(rows.filter(r => r.amt === 'PKR 0').map(r => r.name))
    .toEqual(['JazzCash', 'Bank Transfer', 'Cheque']);

  /* AND THE STRANGER IS NOT DISCARDED. 'Barter' is not a configured method,
     but PKR 5,000 of real money arrived under it; dropping the row would leave
     a total the slices no longer add up to. It is folded into one 'Other'
     rather than given a name of its own. */
  expect(rows[rows.length - 1].name).toBe('Other');
  expect(rows[rows.length - 1].amt).toBe('PKR 5K');

  const centre = await win.evaluate(() => document.querySelector('.dl-coll .dnut__fig').textContent);
  expect(centre).toBe('100K');           // 80 + 15 + 5, nothing lost or doubled

  await app.close();
});

test('the slice is a control: it answers the pointer and opens the page', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win);

  const d = await win.evaluate(() => {
    const seg = document.querySelector('.dl-coll .dnut__seg');
    const cs = getComputedStyle(seg);
    return { clickable: seg.classList.contains('is-clickable'),
             cursor: cs.cursor, onclick: seg.getAttribute('onclick'),
             tip: (seg.querySelector('title') || {}).textContent,
             transitions: cs.transitionProperty };
  });
  expect(d.clickable).toBe(true);
  expect(d.cursor).toBe('pointer');
  expect(d.onclick).toContain('openPaymentsByMethod');
  expect(d.tip).toContain('Open Payments');
  /* It was `static` — no transition at all, so hovering did nothing (owner:
     "the pie chart is static ... not move out when cursor is placed"). */
  expect(d.transitions).toContain('stroke-width');

  await app.close();
});

test('every jump lands on the answer, and can be undone', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win);

  /* A RAIL CLICK IS NOT A STEP — Back stays hidden, because offering to return
     to a page the warden deliberately left is noise. */
  expect(await win.evaluate(() =>
    getComputedStyle(document.getElementById('hdr-back')).display)).toBe('none');

  // ── View All -> the PENDING rows, not the whole table ────────────────────
  await win.evaluate(() => openPaymentsPending());
  await win.waitForTimeout(700);
  let s = await win.evaluate(() => ({ page: currentPage, status: payFilter.status,
    back: getComputedStyle(document.getElementById('hdr-back')).display }));
  expect(s.page).toBe('payments');
  /* THE ORDER MATTERS AND IS THE WHOLE BUG: navigate() clears status on every
     change of page, so a filter set BEFORE it is wiped a millisecond later. */
  expect(s.status).toBe('Pending');
  expect(s.back).toBe('flex');

  await win.evaluate(() => goBack());
  await win.waitForTimeout(700);
  expect(await win.evaluate(() => currentPage)).toBe('dashboard');

  // ── a slice -> that one wallet ───────────────────────────────────────────
  await win.evaluate(() => openPaymentsByMethod('EasyPaisa'));
  await win.waitForTimeout(700);
  s = await win.evaluate(() => ({ page: currentPage, method: payFilter.method }));
  expect(s.page).toBe('payments');
  expect(s.method).toBe('EasyPaisa');

  await win.evaluate(() => goBack());
  await win.waitForTimeout(700);
  expect(await win.evaluate(() => currentPage)).toBe('dashboard');

  await app.close();
});

test('Mark Paid settles the record once, without repainting stale figures', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win);

  const before = await win.evaluate(() => document.querySelectorAll('.dash-pay').length);
  expect(before).toBe(2);

  await win.evaluate(async () => { await markPaymentPaid('p1'); });
  await win.waitForTimeout(800);

  const after = await win.evaluate(() => ({
    rows: document.querySelectorAll('.dash-pay').length,
    page: currentPage,
    status: (DB.payments.find(p => p.id === 'p1') || {}).status,
    outstanding: outstandingOf(DB.payments.find(p => p.id === 'p1')),
  }));

  /* THE ROW IS GONE BECAUSE THE RECORD IS SETTLED — not because the screen was
     redrawn twice. The button used to call the async mutation without awaiting
     it and then re-render, so the first paint showed the row still pending and
     a second paint arrived behind it. */
  expect(after.status).toBe('Paid');
  expect(after.outstanding).toBe(0);
  expect(after.rows).toBe(1);
  expect(after.page).toBe('dashboard');     // and it does not navigate away

  await app.close();
});

test('no route in the app opens the old profile modal any more', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win);

  await win.evaluate(() => navRail('rooms'));
  await win.waitForTimeout(900);
  const chip = await win.evaluate(() => {
    const c = document.querySelector('.rms-occ__chip');
    return c ? c.getAttribute('onclick') : null;
  });
  expect(chip).toBeTruthy();
  /* Owner, 7 Sep: "the student old profile is still rendering from some points,
     like from rooms and seats portion view student option". */
  expect(chip).toContain('showStudentPanel');
  expect(chip).not.toContain('showViewStudentModal');

  /* AND IT OPENS. A chip wired to a function that throws is the same bug in a
     better disguise. */
  await win.evaluate(() => showStudentPanel('s0'));
  await win.waitForSelector('.stu-pan.is-open', { timeout: 6000 });
  expect(await win.locator('.stu-pan .stu-pan__name').first().textContent())
    .toContain('Mushtaq Ahmad');

  await app.close();
});
