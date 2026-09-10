// ════════════════════════════════════════════════════════════════════════════
// The four dashboard defects the owner reported on 2026-09-06.
//
//  1. "Today at a Glance" showed six zeros. The arithmetic was right — it was
//     hard-scoped to the literal calendar day on a page where every other card
//     is month-scoped, so on a hostel holding 141 payments and 55 students it
//     printed nothing until somebody recorded something, and went back to
//     nothing the next morning. Six zeros is indistinguishable from a card that
//     is not wired to anything, and that is how it was read.
//     It now follows the MONTH, which is the same window the KPI row above it
//     uses — and `thisMonth()` reads the sidebar month picker, so the panel
//     moves with it. Owner's direction, replacing a day-fallback that shipped
//     first.
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
// 1 — the glance reports the month, and the same month as everything else
// ─────────────────────────────────────────────────────────────────────────────
/* ════════════════════════════════════════════════════════════════════════════
   THIS CARD HAS BEEN ON BOTH SIDES OF ONE QUESTION, AND THESE THREE TESTS ARE
   THE RECORD OF WHERE IT LANDED.

   On 2026-09-06 it was scoped to the MONTH and renamed "This Month at a
   Glance", because it was headed "Today" over month figures. On 2026-09-09 the
   owner asked for the day instead, and `_dlGlance()` moved back with the name —
   so these tests, written for the month-scoped version, were asserting a decision that had
   been superseded and had not been re-run since.

   They now pin the CURRENT contract, and the invariant that survived both
   swings: THE HEADING NAMES THE WINDOW THE NUMBERS COVER. That is the only
   thing this card has ever got wrong, in either direction.
   ════════════════════════════════════════════════════════════════════════════ */
test('the glance counts today, and the heading says which day', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  const pre = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(pre.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  /* Everything here is in the SAME MONTH, split across today and earlier days.
     That split is the whole fixture: a month-scoped card counts all of it, and
     a day-scoped card counts only the first group. */
  await seed(win, async ([rent, mess]) => {
    const mo = thisMonth();
    const td = today();
    const d = n => mo + '-' + String(n).padStart(2, '0');
    DB.rooms = [{ id: 'r1', number: '1', floor: 'G', typeId: '2s', studentIds: ['s1'], amenities: [], notes: '' }];
    DB.students = [
      { id: 's1', name: 'Today Joiner', roomId: 'r1', status: 'Active', joinDate: td, messOptIn: true, paymentMethod: 'Cash' },
      // Earlier this month, and last month — neither is today.
      { id: 's2', name: 'Early Joiner', roomId: 'r1', status: 'Active', joinDate: d(2), messOptIn: true, paymentMethod: 'Cash' },
      { id: 's3', name: 'Old Joiner',   roomId: 'r1', status: 'Active', joinDate: '2026-07-11', messOptIn: true, paymentMethod: 'Cash' },
    ];
    DB.payments = [
      { id: 'p1', studentId: 's1', studentName: 'Today Joiner', month: mo, date: td,
        amount: rent + mess, unpaid: 0, overpaid: 0, status: 'Paid', paidDate: td,
        monthlyRent: rent, messCharge: mess, messIncluded: true, method: 'Cash' },
      // Settled earlier in the same month — counted by the month card below,
      // NOT by this one.
      { id: 'p2', studentId: 's2', studentName: 'Early Joiner', month: mo, date: d(4),
        amount: rent, unpaid: mess, overpaid: 0, status: 'Paid', paidDate: d(4),
        monthlyRent: rent, messCharge: mess, messIncluded: true, method: 'JazzCash' },
    ];
    DB.complaints  = [{ id: 'cp1', seq: 1, subject: 'Fan', date: td,   status: 'Open' },
                      { id: 'cp2', seq: 2, subject: 'Door', date: d(3), status: 'Open' }];
    DB.maintenance = [{ id: 'mt1', seq: 1, title: 'Tap', date: td, status: 'Open' }];
    DB.checkinlog  = [{ id: 'ci1', studentId: 's1', type: 'Check-in',  date: td,   time: '09:00' },
                      { id: 'ci2', studentId: 's1', type: 'Check-out', date: td,   time: '18:00' },
                      { id: 'ci3', studentId: 's3', type: 'Check-in',  date: d(2), time: '10:00' }];
    DB.cancellations = [];
    await saveDB();
  }, [RENT, MESS]);

  const g = await win.evaluate(() => {
    const panel = [...document.querySelectorAll('.dl-panel')]
      .find(p => /at a Glance/.test(p.innerText));
    return {
      title: panel.querySelector('.dash-sec__title').innerText.trim(),
      pill: panel.querySelector('.dash-pill')?.innerText.trim() || null,
      today: fmtDate(today()),
      computed: _dlGlance(thisMonth()),
    };
  });

  // The heading names the window. It cannot say "This Month" over day figures
  // any more than it could say "Today" over month figures.
  expect(g.title).toBe('Today at a Glance');
  /* THE DATE PILL IS GONE (owner, 2026-09-09) and the title carries the window
     on its own. It was the third place one screen printed today's date — the
     sidebar's date picker and the header both do — so what this now pins is
     that the heading still NAMES the window, which is the invariant this card
     has broken twice. */
  expect(g.pill, 'the date pill was retired; the title names the window').toBeNull();

  const by = k => g.computed.find(r => r.k === k).n;
  expect(by('in')).toBe(1);        // the check-in from earlier in the month is out of scope
  expect(by('out')).toBe(1);
  expect(by('new')).toBe(1);       // one admission today, not the two earlier ones
  expect(by('money')).toBe(1);     // one record settled today
  expect(by('issue')).toBe(1);     // one complaint today, not the one on the 3rd
  expect(by('wrench')).toBe(1);
  expect(g.computed.find(r => r.k === 'money').money).toBe(RENT + MESS);

  expect(pageErrors).toEqual([]);
  await app.close();
});

test('the glance and Collection by Method cover different windows, and each says so', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, async ([rent, mess]) => {
    const mo = thisMonth();
    const td = today();
    const d = n => mo + '-' + String(n).padStart(2, '0');
    DB.rooms = [{ id: 'r1', number: '1', floor: 'G', typeId: '2s', studentIds: ['s1'], amenities: [], notes: '' }];
    DB.students = [{ id: 's1', name: 'A', roomId: 'r1', status: 'Active', joinDate: d(1), messOptIn: true, paymentMethod: 'Cash' }];
    DB.payments = [
      { id: 'p1', studentId: 's1', studentName: 'A', month: mo, date: td, amount: rent + mess,
        unpaid: 0, overpaid: 0, status: 'Paid', paidDate: td,
        monthlyRent: rent, messCharge: mess, messIncluded: true, method: 'Cash' },
      // Earlier in the same month: in the month card, not in today's.
      { id: 'p2', studentId: 's1', studentName: 'A', month: mo, date: d(3), amount: 5000,
        unpaid: 0, overpaid: 0, status: 'Paid', paidDate: d(3),
        monthlyRent: rent, messCharge: mess, messIncluded: true, method: 'JazzCash' },
    ];
    DB.complaints = []; DB.maintenance = []; DB.checkinlog = []; DB.cancellations = [];
    await saveDB();
  }, [RENT, MESS]);

  /* TWO FIGURES FOR MONEY ON ONE SCREEN, AND THAT IS NOW CORRECT — which is
     the opposite of what this file used to assert, so it is worth stating why.
     They disagreed before because both claimed the MONTH and computed it
     differently. They differ now because they cover different windows and each
     names its own: "Today at a Glance" carries the date in its pill, and
     Collection by Method is a month card. The thing to guard is not that the
     numbers match — it is that neither is a second answer to the other's
     question. */
  const scopes = await win.evaluate(() => {
    const mo = thisMonth();
    const glancePanel = [...document.querySelectorAll('.dl-panel')]
      .find(p => /at a Glance/.test(p.innerText));
    return {
      dayMoney:   _dlGlance(mo).find(r => r.k === 'money').money,
      monthTotal: _dlMethods(mo).total,
      glanceTitle: glancePanel.querySelector('.dash-sec__title').innerText.trim(),
      glancePill:  glancePanel.querySelector('.dash-pill')?.innerText.trim() || null,
      todayLabel:  fmtDate(today()),
    };
  });

  expect(scopes.dayMoney, "today's collections").toBe(RENT + MESS);
  expect(scopes.monthTotal, "the month's collections").toBe(RENT + MESS + 5000);
  // Each card names the window it covers, which is what stops the two figures
  // reading as a contradiction.
  expect(scopes.glanceTitle).toBe('Today at a Glance');
  // The pill went with the 9 Sep pass; the title is what separates the two
  // cards' windows now, and it says "Today" in as many words.
  expect(scopes.glancePill, 'the date pill was retired').toBeNull();

  await app.close();
});

test('the glance does NOT follow the sidebar month picker — it is a day card', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, async ([rent, mess]) => {
    DB.rooms = [{ id: 'r1', number: '1', floor: 'G', typeId: '2s', studentIds: ['s1'], amenities: [], notes: '' }];
    DB.students = [
      { id: 's1', name: 'Today Joiner', roomId: 'r1', status: 'Active', joinDate: today(), messOptIn: true, paymentMethod: 'Cash' },
      { id: 's2', name: 'July Joiner',  roomId: 'r1', status: 'Active', joinDate: '2026-07-04', messOptIn: true, paymentMethod: 'Cash' },
      { id: 's3', name: 'Aug Joiner',   roomId: 'r1', status: 'Active', joinDate: '2026-08-06', messOptIn: true, paymentMethod: 'Cash' },
    ];
    DB.payments = []; DB.complaints = []; DB.maintenance = []; DB.checkinlog = []; DB.cancellations = [];
    await saveDB();
  }, [RENT, MESS]);

  /* `_dlGlance()` still TAKES a month, and ignores it. The argument is what a
     later reader will believe the card is scoped by, so the ignoring is pinned
     here: pointing it at July, at August and at this month must give the same
     answer, because the card reads the clock and not the picker. If this ever
     starts varying, either the card went back to being month-scoped and the
     heading is lying again, or the parameter came alive by accident. */
  const answers = await win.evaluate(() => {
    const out = {};
    for (const m of ['2026-07', '2026-08', thisMonth()]) {
      out[m] = _dlGlance(m).find(r => r.k === 'new').n;
    }
    return out;
  });

  const values = Object.values(answers);
  expect(new Set(values).size, 'the month argument must change nothing').toBe(1);
  expect(values[0], 'one admission today').toBe(1);

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
    /* `.dash-pill` again. This selector has now been right, wrong and right
       within one day: the 9 Sep rebuild moved the count into `.dl-head2__pill`,
       and the owner's 9 Sep revert to the old card moved it back. The badge
       itself never went anywhere — it counts the rows that still want
       something, and only the head around it changed. */
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
    /* `.dash-pill` again. This selector has now been right, wrong and right
       within one day: the 9 Sep rebuild moved the count into `.dl-head2__pill`,
       and the owner's 9 Sep revert to the old card moved it back. The badge
       itself never went anywhere — it counts the rows that still want
       something, and only the head around it changed. */
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

  /* ── Seat Availability: Expand and Print, on ONE line ────────────────────
     They were briefly replaced by a "View All Rooms" link on 7 Sep and brought
     back the same day. What matters is not which of the two won but WHERE they
     sit: on their own row they cost 28px, which is the second row of six
     rooms; sharing the foot line with nothing else they cost 4. The legend
     that used to share that line is gone for good — the tiles carry their own
     key (blue has a bed going, grey does not, and each prints its fraction).

     Both assertions below are the record of that: the buttons exist, AND the
     rooms they were nearly traded for are still on screen. */
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForSelector('.seat-foot__b', { timeout: 8000 });
  const seat = await win.evaluate(() =>
    [...document.querySelectorAll('.seat-foot__b')].map(b => ({
      label: b.innerText.trim(), fn: b.getAttribute('onclick') })));
  expect(seat.map(b => b.label)).toEqual(['Expand', 'Print']);
  expect(seat[0].fn).toContain('showSeatDetailModal');
  // printSeatAvailability() was never deleted — only its button ever was.
  expect(seat[1].fn).toContain('printSeatAvailability');
  expect(await win.evaluate(() =>
    document.querySelectorAll('.dash-row-b .dash-key').length)).toBe(0);

  await win.evaluate(() => document.querySelectorAll('.seat-foot__b')[0].click());
  await win.waitForTimeout(600);
  expect(await win.evaluate(() =>
    (document.querySelector('.modal-title') || {}).innerText || '')).toMatch(/All Rooms/i);
  await win.evaluate(() => closeModal());
  await win.waitForTimeout(300);

  expect(pageErrors).toEqual([]);
  await app.close();
});

/* ── WHAT THE EXPANDED GRID SAYS ─────────────────────────────────────────────
   Rebuilt 2026-09-10 to `seat availability expand button.png`. The old tiles
   painted two states in this app's ACCENT colour, which carries no state at
   all, and answered "Occ: 2/4" without saying which of those a warden should
   act on.

   THE THIRD STATE IS WHY THIS TEST EXISTS. A room can be over-filled on
   purpose — submitAddStudent asks and then force-adds — and the old tile drew
   that as an ordinary full room with a bar running past 100%. It is the single
   most useful thing this modal can tell anyone. */
test('the expanded seat grid separates rooms with space, full rooms and over-filled ones', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, async () => {
    const t1 = DB.settings.roomTypes.find(t => t.capacity >= 2) || DB.settings.roomTypes[0];
    DB.rooms = [
      { id: 'sr1', number: '1', floor: 'Ground', typeId: t1.id, amenities: [] },
      { id: 'sr2', number: '2', floor: 'Ground', typeId: t1.id, amenities: [] },
      { id: 'sr3', number: '3', floor: '1st',    typeId: t1.id, amenities: [] },
    ];
    const cap = t1.capacity;
    DB.students = [];
    const mk = (room, n, tag) => { for (let i = 0; i < n; i++)
      DB.students.push({ id: tag + i, name: tag + i, roomId: room, status: 'Active', joinDate: today() }); };
    mk('sr1', 1, 'a');          // space left
    mk('sr2', cap, 'b');        // exactly full
    mk('sr3', cap + 2, 'c');    // deliberately over-filled
    DB.payments = []; DB.complaints = []; DB.maintenance = []; DB.cancellations = [];
    await saveDB();
  });

  await win.evaluate(() => showSeatDetailModal('rooms'));
  await win.waitForSelector('.sxp-card', { timeout: 8000 });

  const cards = await win.evaluate(() =>
    [...document.querySelectorAll('.sxp-card')].map(c => ({
      state: c.className.replace(/.*\bis-(\w+)\b.*/, '$1'),
      name:  c.querySelector('.sxp-n').textContent.trim(),
      chip:  c.querySelector('.sxp-chip').textContent.trim(),
      foot:  c.querySelector('.sxp-foot').textContent.trim(),
      figsOn: c.querySelectorAll('.sxp-fig.is-on').length,
      barPct: c.querySelector('.sxp-bar__f').style.width,
      // The card must be reachable by keyboard, which the old div was not.
      tag: c.tagName,
    })));

  expect(cards.length).toBe(3);
  expect(cards.map(c => c.state)).toEqual(['free', 'full', 'over']);
  expect(cards.map(c => c.tag)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);

  expect(cards[0].chip).toMatch(/Free$/);
  expect(cards[0].foot).toMatch(/seats? available$/);

  expect(cards[1].chip).toBe('Full');
  expect(cards[1].foot).toBe('No seats available');

  expect(cards[2].chip).toMatch(/Over Capacity/);
  expect(cards[2].foot, 'an over-filled room does not say by how much').toBe('+2 over capacity');
  // The bar cannot show more than the room has, whatever is in it.
  expect(cards[2].barPct).toBe('100%');

  // One figure per bed taken — the half of the reference that is read at a
  // glance in a way a fraction is not.
  expect(cards[0].figsOn).toBe(1);

  /* THREE COLOURS, NOT ONE. Whatever the tokens resolve to, the three states
     must not paint the same — that was the whole fault of the tiles this
     replaced. */
  const hues = await win.evaluate(() =>
    [...document.querySelectorAll('.sxp-card')].map(c => getComputedStyle(c).borderColor));
  expect(new Set(hues).size, 'the three states paint the same border').toBe(3);

  // And the strip above the grid counts them.
  const sum = await win.evaluate(() =>
    (document.querySelector('.sxp-sum') || {}).innerText || '');
  expect(sum).toMatch(/3\s+rooms/);
  expect(sum).toMatch(/1\s+full/);
  expect(sum).toMatch(/1\s+over capacity/);

  await win.evaluate(() => closeModal());
  expect(pageErrors).toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// THE FOLD, WITH 40 ROOMS
// ─────────────────────────────────────────────────────────────────────────────
test('rows A-C reach the fold at every shipped size, on a 40-room hostel', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  await seed(win, async () => {
    const td = today(), mo = thisMonth();
    DB.rooms = []; DB.students = []; DB.payments = [];
    for (let i = 1; i <= 40; i++)
      DB.rooms.push({ id: 'r' + i, number: String(i), floor: 'G', typeId: '2s',
                      studentIds: [], amenities: [], notes: '' });
    for (let i = 1; i <= 30; i++) {
      DB.students.push({ id: 's' + i, name: 'Student ' + i, roomId: 'r' + ((i % 40) + 1),
                         status: 'Active', joinDate: mo + '-02', messOptIn: true, paymentMethod: 'Cash' });
      DB.payments.push({ id: 'p' + i, studentId: 's' + i, studentName: 'Student ' + i,
                         month: mo, date: td, amount: i % 3 ? 14500 : 4000,
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

  /* The five screen/scaling combinations the app is actually used at. All five
     now fit — the 2026-09-05 handoff recorded four, with 1093x614 written off
     as impossible ("the last 43 would have to come out of the chart and the
     card padding, past the point where either is worth showing").

     What made it possible was finding the real constraint rather than trimming
     everything a little. Row B's three cards stretch to the tallest of them,
     and only ONE of them cannot shrink: the chart flexes and the room grid
     scrolls, so the glance sets the row. Hiding it dropped row B from 275px to
     156px. Its labels were wrapping to two lines at one-tile width; one-word
     labels and the short-height density rules gave back ~90px, and no figure
     and no label was lost to get it. */
  /* THESE ARE CONTENT-BOX HEIGHTS, NOT SCREEN HEIGHTS, and the first one was
     not. `1366x768 @100%` was tested at a 768px viewport — which is the whole
     SCREEN. Take the taskbar off and the web contents are ~730-740, so the one
     size the owner names as the floor ("if it fails at 1366x768 it does not
     ship") was being measured 30px more generously than it ever gets in use.

     It mattered: there was no height tier anywhere between 720px and unlimited,
     so every viewport in that band drew the full-height layout, and on a hostel
     with five room types row C ended 21px below the bottom of the screen. The
     spec passed the whole time, because at 768 the same layout clears by 9.

     Every other row here was already a content box (the note above explains the
     660 and 614), which is why they were the only sizes the tiers ever covered.
     1040 for 1920x1080 follows the same reasoning and stays. */
  const SIZES = [
    { label: '1366x768 @100%',  width: 1366, height: 738 },
    { label: '1920x1080 @100%', width: 1920, height: 1040 },
    { label: '1920x1080 @125%', width: 1536, height: 824 },
    { label: '1920x1080 @150%', width: 1280, height: 660 },
    { label: '1366x768 @125%',  width: 1093, height: 614 },
  ];

  const misses = [];
  for (const s of SIZES) {
    await win.setViewportSize({ width: s.width, height: s.height });
    await win.evaluate(() => navigate('dashboard'));
    await win.waitForSelector('.dl-need', { timeout: 8000 });
    await win.waitForTimeout(700);
    const m = await win.evaluate(() => ({
      bottom: Math.round(document.querySelector('.dash-row-c').getBoundingClientRect().bottom),
      top: Math.round(document.querySelector('.dash-row-c').getBoundingClientRect().top),
      vp: window.innerHeight,
      // Every glance row must be ONE line. A re-wrap is ~65px of fold going
      // quietly missing, so it is asserted rather than left to be noticed.
      rows: [...document.querySelectorAll('.dash-row-b .dl-glance__row')]
              .map(r => Math.round(r.getBoundingClientRect().height)),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      /* HOW FAR THE GLANCE'S LAST ELEMENT OVERRUNS ITS OWN CARD. Row B is
         `height:254px` and `.dash-row-b > .dash-sec` is `overflow:hidden`, so
         this card cannot report a fault the way everything else on the page
         does — it does not push the fold down, it silently swallows whatever
         does not fit, bottom edge first. The seventh glance row did exactly
         that to the closing line before the row padding came down. */
      glanceCut: (() => {
        const card = [...document.querySelectorAll('.dash-row-b > .dash-sec')]
          .find(c => c.querySelector('.dl-glance'));
        if (!card) return 0;
        const last = card.lastElementChild;
        const pad = parseFloat(getComputedStyle(card).paddingBottom) || 0;
        return Math.round(last.getBoundingClientRect().bottom
                          - (card.getBoundingClientRect().bottom - pad));
      })(),
    }));
    /* ROW C NOW STARTS ABOVE THE FOLD RATHER THAN ENDING ABOVE IT, and that is
       a decision, not a regression. On 2026-09-09 the owner locked row B to
       311px — "enlarge the height of the row B so that the row C moves little
       lower" — and added a closing line to the glance, a tagline and a badge to
       Needs Action and Quick Actions, and colour to their rows. All of it is
       content above row C, and it does not fit in 738px with row C whole.

       What the guard protects is unchanged in spirit: a warden must be able to
       SEE that Needs Action and Quick Actions are there without scrolling for
       them. So the assertion follows the top edge of row C instead of the
       bottom. If row C ever stops starting on screen, the dashboard has gone
       back to burying its two action panels, which is what this test has always
       been about. */
    if (m.top > m.vp - 40) misses.push(`${s.label}: row C starts at ${m.top}, viewport ${m.vp}`);
    expect(m.overflowX, `${s.label} must not scroll sideways`).toBe(false);
    expect(m.glanceCut, `${s.label}: the glance's closing line is cut by its own card`)
      .toBeLessThanOrEqual(0);
    // SEVEN rows since 2026-09-10 — Cancellations joined the glance, directly
    // under Admissions, because filing a departure is the other half of the
    // counter's day. The count is asserted rather than left open: row B is
    // `height:254px` and its cards are `overflow:hidden`, so an eighth row
    // would not fail by growing the page — it would quietly cut the card's
    // closing line off at the bottom edge, which is exactly what the seventh
    // did until the row padding came down to 2px.
    //
    // The tallest is no more than a line and a half — the money row carries a
    // second line at full height and drops it under 700px.
    expect(m.rows.length).toBe(7);
    expect(Math.max(...m.rows), `${s.label}: a glance label has wrapped again`)
      .toBeLessThanOrEqual(50);
  }
  expect(misses, 'row C must at least START above the fold at every shipped size').toEqual([]);

  // The seat header carries a title, a subtitle and three bed counts; it is
  // allowed two lines for them and no more.
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForSelector('.seat-foot__b', { timeout: 8000 });
  await win.waitForTimeout(400);
  const headH = await win.evaluate(() =>
    Math.round(document.querySelectorAll('.dash-row-b .dash-sec__head')[1].getBoundingClientRect().height));
  expect(headH, 'the seat header must not run past two lines at 1366').toBeLessThan(58);

  await app.close();
});
