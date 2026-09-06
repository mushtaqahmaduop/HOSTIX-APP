// ════════════════════════════════════════════════════════════════════════════
// The four dashboard defects the owner reported on 2026-09-06.
//
//  1. "Today at a Glance" showed six zeros. The arithmetic was right — it was
//     hard-scoped to the literal calendar day on a page where every other card
//     is month-scoped, so on a hostel holding 141 payments and 55 students it
//     printed nothing until somebody recorded something, and went back to
//     nothing the next morning. Six zeros is indistinguishable from a card that
//     is not wired to anything, and that is how it was read.
//  2. Seat Availability's Expand and Print were removed on 2026-09-05. Owner
//     reversed that; they are back, in the footer strip.
//  3. Needs Action dropped rows with a count of 0. Owner: all four rows always
//     present, only the numbers change.
//  4. Quick Actions navigated to a page instead of opening the form the tile is
//     named after. A tile called "Add X" that does not add an X is a link
//     wearing a verb.
//
// The fold test at the end is the constraint all four had to respect: the
// owner's brief is that rows A-C reach the bottom of the screen without
// scrolling, and item 3 adds two rows to a card sitting in row C.
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

const RENT = 8000, MESS = 6500, FULL = RENT + MESS;

/** Seed and wait until it sticks — first-boot seeding can land on top of it. */
async function seed(win, fn, arg) {
  await win.evaluate(fn, arg);
  await win.waitForFunction(() => DB.students.length > 0, null, { timeout: 8000 });
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForSelector('.dl-glance__row', { timeout: 8000 });
  await win.waitForTimeout(400);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 — the glance reports a real day
// ─────────────────────────────────────────────────────────────────────────────
test('with activity today, the glance says Today and counts it', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  const pre = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(pre.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  await seed(win, async ([rent, mess]) => {
    const td = today();
    DB.rooms = [{ id: 'r1', number: '1', floor: 'G', typeId: '2s', studentIds: ['s1'], amenities: [], notes: '' }];
    DB.students = [{ id: 's1', name: 'Today Student', roomId: 'r1', status: 'Active',
                     joinDate: td, messOptIn: true, paymentMethod: 'Cash' }];
    DB.payments = [{ id: 'p1', studentId: 's1', studentName: 'Today Student', month: thisMonth(),
                     date: td, amount: rent + mess, unpaid: 0, overpaid: 0, status: 'Paid', paidDate: td,
                     monthlyRent: rent, messCharge: mess, messIncluded: true, method: 'Cash' }];
    DB.complaints  = [{ id: 'cp1', seq: 1, subject: 'Fan', date: td, status: 'Open' }];
    DB.maintenance = [];
    DB.checkinlog  = [{ id: 'ci1', studentId: 's1', type: 'Check-in', date: td, time: '09:00' }];
    DB.cancellations = [];
    await saveDB();
  }, [RENT, MESS]);

  const g = await win.evaluate(() => {
    const panel = [...document.querySelectorAll('.dl-panel')]
      .find(p => /Glance|Latest Activity/.test(p.innerText));
    return {
      title: panel.querySelector('.dash-sec__title').innerText.trim(),
      pill: panel.querySelector('.dash-pill')?.innerText.trim() || null,
      rows: [...panel.querySelectorAll('.dl-glance__row')].map(r => r.innerText.replace(/\s+/g, ' ').trim()),
    };
  });

  expect(g.title).toBe('Today at a Glance');
  expect(g.pill, 'no date pill is needed when the day IS today').toBeNull();
  expect(g.rows.length).toBe(6);
  // Every figure real, and the two that are zero today say 0 rather than vanish.
  expect(g.rows.join(' | ')).toContain('Check-ins 1');
  expect(g.rows.join(' | ')).toContain('New Admissions 1');
  expect(g.rows.join(' | ')).toContain('Complaints Raised 1');
  expect(g.rows.some(r => /Payments Received .*14,500 1/.test(r))).toBe(true);

  expect(pageErrors).toEqual([]);
  await app.close();
});

test('with nothing today, the glance falls back to the last real day and names it', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  /* THE DEFECT. Before this, all six rows read 0 on a hostel with records —
     because nothing happened on this particular calendar day, which is the
     normal state of affairs most mornings. */
  await seed(win, async ([rent, mess]) => {
    DB.rooms = [{ id: 'r1', number: '1', floor: 'G', typeId: '2s', studentIds: ['s1'], amenities: [], notes: '' }];
    DB.students = [{ id: 's1', name: 'Older Student', roomId: 'r1', status: 'Active',
                     joinDate: '2026-09-05', messOptIn: true, paymentMethod: 'Cash' }];
    DB.payments = [{ id: 'p1', studentId: 's1', studentName: 'Older Student', month: thisMonth(),
                     date: '2026-09-05', amount: rent + mess, unpaid: 0, overpaid: 0,
                     status: 'Paid', paidDate: '2026-09-05',
                     monthlyRent: rent, messCharge: mess, messIncluded: true, method: 'Cash' }];
    DB.complaints = []; DB.maintenance = []; DB.checkinlog = []; DB.cancellations = [];
    await saveDB();
  }, [RENT, MESS]);

  const g = await win.evaluate(() => {
    const panel = [...document.querySelectorAll('.dl-panel')]
      .find(p => /Glance|Latest Activity/.test(p.innerText));
    return {
      title: panel.querySelector('.dash-sec__title').innerText.trim(),
      pill: panel.querySelector('.dash-pill')?.innerText.trim() || null,
      rows: [...panel.querySelectorAll('.dl-glance__row')].map(r => r.innerText.replace(/\s+/g, ' ').trim()),
      day: _dlGlanceDay(),
    };
  });

  // It reports the day it is actually describing. A heading that says "Today"
  // over another day's numbers is worse than the empty card it replaced.
  expect(g.day).toBe('2026-09-05');
  expect(g.title).toBe('Latest Activity');
  expect(g.pill, 'the fallback must name the day').toMatch(/2026/);
  expect(g.rows.join(' | ')).toContain('New Admissions 1');
  expect(g.rows.some(r => /Payments Received .*14,500 1/.test(r))).toBe(true);
  await app.close();
});

test('a payment dated in the future does not drag the glance forward', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, async ([rent, mess]) => {
    DB.rooms = [{ id: 'r1', number: '1', floor: 'G', typeId: '2s', studentIds: ['s1'], amenities: [], notes: '' }];
    DB.students = [{ id: 's1', name: 'Older Student', roomId: 'r1', status: 'Active',
                     joinDate: '2026-09-05', messOptIn: true, paymentMethod: 'Cash' }];
    DB.payments = [{ id: 'p1', studentId: 's1', studentName: 'Older Student', month: '2027-01',
                     date: '2027-01-15', amount: rent + mess, unpaid: 0, overpaid: 0,
                     status: 'Paid', paidDate: '2027-01-15',
                     monthlyRent: rent, messCharge: mess, messIncluded: true, method: 'Cash' }];
    DB.complaints = []; DB.maintenance = []; DB.checkinlog = []; DB.cancellations = [];
    await saveDB();
  }, [RENT, MESS]);

  // A record dated ahead must not make the panel report a day that has not
  // happened. It falls back to the admission instead.
  expect(await win.evaluate(() => _dlGlanceDay())).toBe('2026-09-05');
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2, 3, 4 — the controls
// ─────────────────────────────────────────────────────────────────────────────
test('Needs Action keeps all four rows, and only the numbers change', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  // Nothing outstanding anywhere: the panel used to disappear into one line.
  await seed(win, async () => {
    DB.rooms = [{ id: 'r1', number: '1', floor: 'G', typeId: '2s', studentIds: ['s1'], amenities: [], notes: '' }];
    DB.students = [{ id: 's1', name: 'A', roomId: 'r1', status: 'Active', joinDate: today(), messOptIn: true, paymentMethod: 'Cash' }];
    DB.payments = []; DB.complaints = []; DB.maintenance = []; DB.cancellations = []; DB.checkinlog = [];
    await saveDB();
  });

  let n = await win.evaluate(() => ({
    rows: [...document.querySelectorAll('.dl-need')].map(r => ({
      text: r.innerText.replace(/\s+/g, ' ').trim(), clear: r.classList.contains('is-clear') })),
    pill: [...document.querySelectorAll('.dl-panel')]
      .find(p => /Needs Action/.test(p.innerText))?.querySelector('.dash-pill')?.innerText.trim() || null,
  }));

  expect(n.rows.length, 'all four rows are always present').toBe(4);
  expect(n.rows.every(r => r.clear)).toBe(true);
  expect(n.rows.map(r => r.text)).toEqual([
    '0 pending cancellations Clear',
    '0 pending payments Clear',
    '0 open complaints Clear',
    // "0 open maintenances" — the naive + 's' pluraliser was wrong at every
    // count, not just at zero; it was simply never visible before.
    '0 open maintenance jobs Clear',
  ]);
  expect(n.pill, 'no badge when nothing wants attention').toBeNull();

  // Now give two of them something. The rows must not move.
  await win.evaluate(async () => {
    const td = today();
    DB.payments = [{ id: 'p1', studentId: 's1', studentName: 'A', month: thisMonth(),
                     date: td, amount: 0, unpaid: 14500, status: 'Pending',
                     monthlyRent: 8000, messCharge: 6500, messIncluded: true, method: 'Cash' }];
    DB.complaints = [{ id: 'cp1', seq: 1, subject: 'Fan', date: td, status: 'Open' }];
    await saveDB();
    navigate('dashboard');
  });
  await win.waitForTimeout(700);

  n = await win.evaluate(() => ({
    rows: [...document.querySelectorAll('.dl-need')].map(r => ({
      text: r.innerText.replace(/\s+/g, ' ').trim(), clear: r.classList.contains('is-clear') })),
    pill: [...document.querySelectorAll('.dl-panel')]
      .find(p => /Needs Action/.test(p.innerText))?.querySelector('.dash-pill')?.innerText.trim() || null,
  }));

  expect(n.rows.length).toBe(4);
  // Same order, same positions — the list is scannable because it does not move.
  expect(n.rows[0].text).toBe('0 pending cancellations Clear');
  expect(n.rows[1].text).toBe('1 pending payment Collect');
  expect(n.rows[2].text).toBe('1 open complaint Resolve');
  expect(n.rows[3].text).toBe('0 open maintenance jobs Clear');
  expect(n.rows.map(r => r.clear)).toEqual([true, false, false, true]);
  expect(n.pill, 'the badge counts what wants attention, not the rows').toBe('2');

  await app.close();
});

test('every Quick Action opens its own form, and Seat Availability can expand and print', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, async () => {
    DB.rooms = [{ id: 'r1', number: '1', floor: 'G', typeId: '2s', studentIds: ['s1'], amenities: [], notes: '' }];
    DB.students = [{ id: 's1', name: 'A', roomId: 'r1', status: 'Active', joinDate: today(), messOptIn: true, paymentMethod: 'Cash' }];
    DB.payments = []; DB.complaints = []; DB.maintenance = []; DB.cancellations = []; DB.checkinlog = [];
    await saveDB();
  });

  const labels = await win.evaluate(() =>
    [...document.querySelectorAll('.dl-act')].map(a => a.innerText.replace(/\s+/g, ' ').trim()));
  expect(labels).toEqual(['Add Payment', 'Add Expense', 'Add Issue', 'Add Cancellation']);

  // Each modal tile opens ITS form — not the page the form lives on.
  // Each id is a VISIBLE field of the form in question — `#canc-student` is the
  // cancellation modal's hidden input, and waiting on it waits for something
  // that is never visible by design.
  for (const [label, id] of [['Add Expense', 'f-ecat'],
                             ['Add Issue', 'if-maint'],
                             ['Add Cancellation', 'canc-search']]) {
    await win.evaluate(l => [...document.querySelectorAll('.dl-act')]
      .find(a => a.innerText.replace(/\s+/g, ' ').trim() === l).click(), label);
    await win.waitForSelector('#' + id, { timeout: 6000 });
    await win.evaluate(() => closeModal());
    await win.waitForTimeout(250);
  }

  // Add Payment is a full page in this app rather than a modal, so the form it
  // opens is a screen — still one click, still the form.
  await win.evaluate(() => [...document.querySelectorAll('.dl-act')]
    .find(a => /Add Payment/.test(a.innerText)).click());
  await win.waitForTimeout(600);
  expect(await win.evaluate(() => currentPage)).toBe('addpayment');

  // ── Seat Availability: Expand and Print are reachable again ───────────────
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForSelector('.seat-foot__b', { timeout: 8000 });
  const seat = await win.evaluate(() =>
    [...document.querySelectorAll('.seat-foot__b')].map(b => ({
      label: b.innerText.trim(), fn: b.getAttribute('onclick') })));
  expect(seat.map(b => b.label)).toEqual(['Expand', 'Print']);
  expect(seat[0].fn).toContain('showSeatDetailModal');
  // printSeatAvailability() was never deleted — only its button was.
  expect(seat[1].fn).toContain('printSeatAvailability');

  await win.evaluate(() => document.querySelectorAll('.seat-foot__b')[0].click());
  await win.waitForTimeout(600);
  const expanded = await win.evaluate(() =>
    (document.querySelector('.modal-title') || {}).innerText || '');
  expect(expanded).toMatch(/All Rooms/i);

  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// The constraint all of the above had to respect
// ─────────────────────────────────────────────────────────────────────────────
test('two extra Needs Action rows cost the fold nothing', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, async () => {
    const td = today();
    DB.rooms = []; DB.students = []; DB.payments = [];
    for (let i = 1; i <= 40; i++)
      DB.rooms.push({ id: 'r' + i, number: String(i), floor: 'G', typeId: '2s',
                      studentIds: [], amenities: [], notes: '' });
    for (let i = 1; i <= 30; i++) {
      DB.students.push({ id: 's' + i, name: 'Student ' + i, roomId: 'r' + ((i % 40) + 1),
                         status: 'Active', joinDate: '2026-01-10', messOptIn: true, paymentMethod: 'Cash' });
      DB.payments.push({ id: 'p' + i, studentId: 's' + i, studentName: 'Student ' + i,
                         month: thisMonth(), date: td, amount: i % 3 ? 14500 : 4000,
                         unpaid: i % 3 ? 0 : 10500, overpaid: 0,
                         status: i % 3 ? 'Paid' : 'Pending', paidDate: i % 3 ? td : '',
                         monthlyRent: 8000, messCharge: 6500, messIncluded: true, method: 'Cash' });
    }
    DB.complaints = [{ id: 'cp1', seq: 1, subject: 'Fan', date: td, status: 'Open' }];
    DB.maintenance = [{ id: 'mt1', seq: 1, title: 'Tap', date: td, status: 'Open' }];
    DB.cancellations = [{ id: 'c1', seq: 1, studentId: 's1', studentName: 'Student 1',
                          roomNumber: '2', requestDate: td, vacateDate: '2026-09-30',
                          status: 'Pending', reason: 'x', createdAt: td }];
    await saveDB();
  });

  /* Measured against the card drawn with two rows instead of four — which is
     what it did before — rather than against a number copied from a handoff.
     A fixture is not the owner's data, so the absolute figures move with it;
     what must not move is the DIFFERENCE the two extra rows make.

     They make none at any constrained size, because the density blocks take the
     height back out of the icon tile and the padding, and because the room-type
     card is the tallest thing in row C anyway. */
  const measure = async (twoRows) => {
    await win.evaluate(two => {
      let st = document.getElementById('fold-probe');
      if (!st) { st = document.createElement('style'); st.id = 'fold-probe'; document.head.appendChild(st); }
      st.textContent = two ? '.dl-need:nth-child(n+3){display:none!important}' : '';
    }, twoRows);
    await win.waitForTimeout(250);
    return win.evaluate(() => {
      const c = document.querySelector('.dash-row-c');
      return c ? Math.round(c.getBoundingClientRect().bottom) : null;
    });
  };

  for (const s of [{ width: 1366, height: 768 }, { width: 1920, height: 1040 },
                   { width: 1536, height: 824 }, { width: 1280, height: 660 }]) {
    await win.setViewportSize(s);
    await win.evaluate(() => navigate('dashboard'));
    await win.waitForSelector('.dl-need', { timeout: 8000 });
    await win.waitForTimeout(500);
    const four = await measure(false);
    const two  = await measure(true);
    expect(four, `${s.width}x${s.height}: four rows must not push row C below two`)
      .toBeLessThanOrEqual(two + 20);
  }

  // And the seat header must not have wrapped: the buttons live in the footer
  // precisely so the room grid keeps its height.
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForSelector('.seat-foot__b', { timeout: 8000 });
  await win.waitForTimeout(400);
  const headH = await win.evaluate(() =>
    Math.round(document.querySelectorAll('.dash-row-b .dash-sec__head')[1].getBoundingClientRect().height));
  expect(headH, 'the seat header must stay one line at 1366').toBeLessThan(45);

  await app.close();
});
