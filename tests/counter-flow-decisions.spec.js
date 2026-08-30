// ════════════════════════════════════════════════════════════════════════════
// The four items the 19 Aug counter-flow audit left as "decisions for you".
// The owner answered all four on 20 Aug; this is the coverage for the answers.
//
//  1. A student on notice keeps their bed, and the Rooms page SAYS when it
//     frees. It used to filter on status==='Active', so raising a cancellation
//     emptied the bed on screen weeks before the student left — and the warden
//     could let it to somebody else.
//  2. The Students strip adds up. 'Cancelling' is a fourth status that no card
//     counted, so Active + Left + Blacklisted stopped summing to Total the
//     moment anybody gave notice.
//  3. Deleting a student no longer deletes the money they paid. The cascade
//     rewrote closed months: last quarter's collected total silently dropped.
//  4. There is a cash-basis figure to count the drawer against, separate from
//     revenue, and the two differ by arrears and by what is still owed.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
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

const RENT = 8000, MESS = 6500, FULL = RENT + MESS;   // 14,500

// ─────────────────────────────────────────────────────────────────────────────
// 1 + 2 — the bed is held and marked, and the strip adds up.
// ─────────────────────────────────────────────────────────────────────────────
test('a student on notice keeps their bed, the room says when it frees, and the cards still sum', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const pre = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(pre.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  // Two students in one 2-bed room. One gives notice; one does not.
  await win.evaluate(async ([rent, mess]) => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    // The app seeds 42 demo rooms on first boot and the Rooms page paginates,
    // so without this the assertions below read whichever demo room sorts first.
    DB.rooms = [];
    DB.rooms.push({ id: 'rmV', number: 'V1', floor: 'Ground', typeId: '2s',
      studentIds: [], amenities: [], notes: '', rent });
    DB.students.push({ id: 'stayer', name: 'Stays Put', roomId: 'rmV', rent, mess,
      messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' });
    DB.students.push({ id: 'leaver', name: 'Gives Notice', roomId: 'rmV', rent, mess,
      messOptIn: true, status: 'Cancelling', joinDate: '2026-01-01', paymentMethod: 'Cash' });
    DB.cancellations = [{ id: 'canc_1', seq: 1, studentId: 'leaver',
      studentName: 'Gives Notice', roomId: 'rmV', roomNumber: 'V1', roomType: '2-Seater',
      requestDate: '2026-08-01', vacateDate: '2026-09-30', reason: 'Course ended',
      status: 'Pending', createdAt: '2026-08-01' }];
    await saveDB();
  }, [RENT, MESS]);

  await win.evaluate(() => navigate('rooms'));
  await win.waitForSelector('.rms-card', { timeout: 8000 });

  const room = await win.evaluate(() => {
    const card = document.querySelector('.rms-card');
    const chips = [...card.querySelectorAll('.rms-occ__chip')];
    return {
      beds:    card.querySelector('.rms-card__beds')?.textContent.trim(),
      state:   card.querySelector('.rms-card__state')?.textContent.trim(),
      vacBadge: card.querySelector('.rms-card__vac')?.textContent.trim() || null,
      chips: chips.map(c => ({
        text: c.innerText.replace(/\s+/g, ' ').trim(),
        vacating: c.classList.contains('is-vacating'),
        opens: /showViewStudentModal/.test(c.getAttribute('onclick') || ''),
      })),
    };
  });

  // THE BED IS STILL THEIRS. Both students count against the room.
  expect(room.beds).toBe('2/2 beds');
  expect(room.state).toBe('Occupied');

  // …and the sheet says which one is leaving, and when.
  expect(room.vacBadge).toBe('1 vacating');
  const leaver = room.chips.find(c => /Gives Notice/.test(c.text));
  const stayer = room.chips.find(c => /Stays Put/.test(c.text));
  expect(leaver, 'the student on notice must still appear in their room').toBeTruthy();
  expect(leaver.vacating).toBe(true);
  // Whatever fmtDate() renders for that day — en-PK gives "30-Sept-2026". The
  // assertion is that the DATE is on the chip, not that it is spelled one way.
  expect(leaver.text).toMatch(/30.?Sep\w*.?2026/);
  expect(stayer.vacating).toBe(false);

  // Both chips open their student. The chip used to re-find the student by NAME
  // and status 'Active', so a student on notice matched nothing and lost its click.
  expect(leaver.opens).toBe(true);
  expect(stayer.opens).toBe(true);

  // The bed strip agrees with the room counts beside it.
  const strip = await win.evaluate(() =>
    [...document.querySelectorAll('.rms-stat')].map(s => s.innerText.replace(/\s+/g, ' ').trim()));
  expect(strip.join(' | ')).toMatch(/2\s*\/\s*2|100%/);

  // ── The Students strip adds up ────────────────────────────────────────────
  await win.evaluate(() => navigate('students'));
  await win.waitForSelector('.stu-stat', { timeout: 8000 });

  const cards = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-stat')].map(c => ({
      label: c.querySelector('.stu-stat__label')?.textContent.trim(),
      val:   Number(c.querySelector('.stu-stat__val')?.textContent.trim()),
    })));
  const by = n => cards.find(c => c.label === n);
  // The first card names the month it is counting once the page is scoped to
  // one ('Students in August'), and reverts to 'Total Students' on All months.
  // Either way it is the roster total the other three have to add up to.
  const total = cards.find(c => /^(Total Students|Students in )/.test(c.label || ''));

  expect(by('On Notice'), 'the On Notice card must appear once somebody is on notice').toBeTruthy();
  expect(by('On Notice').val).toBe(1);
  expect(total, 'no roster-total card on the strip').toBeTruthy();
  expect(total.val).toBe(2);
  expect(by('Active').val + by('On Notice').val + by('Left').val + by('Blacklisted').val)
    .toBe(total.val);

  // Clicking it filters to exactly that student.
  await win.evaluate(() => stuSetStatus('Cancelling'));
  await win.waitForTimeout(300);
  const filtered = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-table tbody tr, table tbody tr')]
      .map(r => r.innerText).filter(t => /Gives Notice|Stays Put/.test(t)));
  expect(filtered.join(' ')).toMatch(/Gives Notice/);
  expect(filtered.join(' ')).not.toMatch(/Stays Put/);

  expect(pageErrors, 'no page errors').toEqual([]);
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 — deleting a student must not delete the money.
// ─────────────────────────────────────────────────────────────────────────────
test('deleting a student keeps every payment they made, and past months do not move', async () => {
  resetProfile();
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  await win.evaluate(async ([rent, mess, full]) => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    DB.rooms.push({ id: 'rmD', number: 'D1', floor: 'Ground', typeId: '2s',
      studentIds: [], amenities: [], notes: '', rent });
    DB.students.push({ id: 'doomed', name: 'To Be Deleted', roomId: 'rmD', rent, mess,
      messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' });
    DB.payments.push({ id: 'p_d1', studentId: 'doomed', studentName: 'To Be Deleted',
      roomId: 'rmD', roomNumber: 'D1', month: 'June 2026', monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: full, unpaid: 0, status: 'Paid',
      date: '2026-06-03', paidDate: '2026-06-03', extraCharges: [], extraTotal: 0 });
    DB.payments.push({ id: 'p_d2', studentId: 'doomed', studentName: 'To Be Deleted',
      roomId: 'rmD', roomNumber: 'D1', month: 'July 2026', monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: 5000, unpaid: full - 5000,
      status: 'Pending', date: '2026-07-04', extraCharges: [], extraTotal: 0 });
    await saveDB();
  }, [RENT, MESS, FULL]);

  const before = await win.evaluate(() => ({
    june: calcRevenue('2026-06'), july: calcRevenue('2026-07'),
  }));
  expect(before.june).toBe(FULL);
  expect(before.july).toBe(5000);

  // Delete, taking the confirm dialog's own action rather than re-implementing it.
  await win.evaluate(() => confirmDeleteStudent('doomed'));
  await win.waitForTimeout(400);
  await win.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const yes = btns.find(b => /remove|delete|confirm|yes/i.test(b.textContent || ''));
    if (yes) yes.click();
  });
  await win.waitForTimeout(700);

  const after = await win.evaluate(() => ({
    students: DB.students.filter(s => s.id === 'doomed').length,
    pays:     DB.payments.filter(p => p.studentId === 'doomed').length,
    marked:   DB.payments.filter(p => p.studentId === 'doomed' && p.studentRemoved).length,
    names:    DB.payments.filter(p => p.studentId === 'doomed').map(p => p.studentName),
    june: calcRevenue('2026-06'), july: calcRevenue('2026-07'),
  }));

  expect(after.students, 'the student is gone from the roster').toBe(0);
  expect(after.pays, 'THE MONEY STAYS — both payment records survive').toBe(2);
  expect(after.marked, 'and each one is stamped as belonging to a removed student').toBe(2);
  // The snapshot is what makes keeping them safe: the name still renders.
  expect(after.names).toEqual(['To Be Deleted', 'To Be Deleted']);
  // Closed months are untouched — the whole point.
  expect(after.june).toBe(before.june);
  expect(after.july).toBe(before.july);

  // It survives a restart, i.e. it really was written and not just held in memory.
  await app.close();
  const app2 = await electron.launch(launchOpts());
  const win2 = await app2.firstWindow();
  await win2.waitForLoadState('domcontentloaded');
  await login(win2);
  await win2.waitForTimeout(500);
  const persisted = await win2.evaluate(() => ({
    pays: DB.payments.filter(p => p.studentId === 'doomed').length,
    june: calcRevenue('2026-06'),
  }));
  expect(persisted.pays).toBe(2);
  expect(persisted.june).toBe(FULL);

  expect(pageErrors, 'no page errors').toEqual([]);
  await app2.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 — the cash-basis figure, and why it differs from revenue.
// ─────────────────────────────────────────────────────────────────────────────
test('cash received counts the drawer, not the books, and money is conserved', async () => {
  resetProfile();
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  // July's rent, part paid in July and cleared in August. August's own rent
  // paid in August. September paid ahead, in August.
  await win.evaluate(async ([rent, mess, full]) => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    DB.rooms.push({ id: 'rmC', number: 'C1', floor: 'Ground', typeId: '2s',
      studentIds: [], amenities: [], notes: '', rent });
    DB.students.push({ id: 'cash1', name: 'Cash Student', roomId: 'rmC', rent, mess,
      messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' });

    // JULY: 4,000 taken in July, the 10,500 balance cleared on 5 August.
    DB.payments.push({ id: 'p_c_jul', studentId: 'cash1', studentName: 'Cash Student',
      roomId: 'rmC', roomNumber: 'C1', month: 'July 2026', monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: full, unpaid: 0, status: 'Paid',
      date: '2026-07-06', paidDate: '2026-08-05', extraCharges: [], extraTotal: 0,
      partialPayments: [
        { date: '2026-07-06', amount: 4000,  method: 'Cash', note: 'Part payment' },
        { date: '2026-08-05', amount: 10500, method: 'Cash', note: 'Pending cleared' },
      ] });

    // AUGUST: its own rent, paid in August. No trail — one cash event on p.date.
    DB.payments.push({ id: 'p_c_aug', studentId: 'cash1', studentName: 'Cash Student',
      roomId: 'rmC', roomNumber: 'C1', month: 'August 2026', monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: 9000, unpaid: full - 9000,
      status: 'Pending', date: '2026-08-10', extraCharges: [], extraTotal: 0 });

    // SEPTEMBER: paid ahead, in August.
    DB.payments.push({ id: 'p_c_sep', studentId: 'cash1', studentName: 'Cash Student',
      roomId: 'rmC', roomNumber: 'C1', month: 'September 2026', monthlyRent: rent,
      messCharge: mess, messIncluded: true, amount: 2000, unpaid: full - 2000,
      status: 'Pending', date: '2026-08-20', extraCharges: [], extraTotal: 0 });
    await saveDB();
  }, [RENT, MESS, FULL]);

  const f = await win.evaluate(() => ({
    julyCash:    calcCashReceived('2026-07'),
    julyRev:     calcRevenue('2026-07'),
    aug:         cashBreakdown('2026-08'),
    augRev:      calcRevenue('2026-08'),
    yearCash:    calcCashReceived('2026'),
    yearBreak:   cashBreakdown('2026'),
    ledgerTotal: DB.payments.reduce((s, p) => s + Number(p.amount || 0), 0),
  }));

  // JULY earned 14,500 but only 4,000 arrived in July.
  expect(f.julyRev).toBe(FULL);
  expect(f.julyCash).toBe(4000);

  // AUGUST: 10,500 arrears + 9,000 its own + 2,000 in advance = 21,500 in the drawer,
  // while August only EARNED 9,000.
  expect(f.aug.total).toBe(21500);
  expect(f.aug.arrears).toBe(10500);
  expect(f.aug.current).toBe(9000);
  expect(f.aug.advance).toBe(2000);
  expect(f.augRev).toBe(9000);

  // The identity the modal prints: revenue − still owed + arrears + advance = cash.
  const stillOwed = f.augRev - f.aug.current;
  expect(f.augRev - stillOwed + f.aug.arrears + f.aug.advance).toBe(f.aug.total);

  // MONEY IS CONSERVED. Every rupee on a record is attributed to exactly one
  // month, so the year's cash equals the ledger. A reconciliation tool that
  // could invent or lose a rupee would be worse than having none.
  expect(f.yearCash).toBe(f.ledgerTotal);
  expect(f.yearBreak.total).toBe(f.ledgerTotal);
  // …and a YEAR key must not throw its own months into "advance" — '2026-08'
  // sorts after '2026' as a string, which is how that bug reads.
  expect(f.yearBreak.advance).toBe(0);
  expect(f.yearBreak.current).toBe(f.ledgerTotal);

  // A corrupt trail claiming more than was collected falls back to the record's
  // own date rather than being partly believed. repairPaymentComposition()
  // documents the two bugs that wrote such trails.
  const bad = await win.evaluate(() => {
    DB.payments.push({ id: 'p_bad', studentId: 'cash1', studentName: 'Cash Student',
      roomId: 'rmC', roomNumber: 'C1', month: 'May 2026', amount: 1000, unpaid: 0,
      status: 'Paid', date: '2026-05-09', extraCharges: [], extraTotal: 0,
      partialPayments: [{ date: '2026-04-01', amount: 900 },
                        { date: '2026-04-02', amount: 900 }] });
    return { may: calcCashReceived('2026-05'), apr: calcCashReceived('2026-04'),
             total: calcCashReceived('2026') };
  });
  expect(bad.may).toBe(1000);
  expect(bad.apr).toBe(0);
  expect(bad.total, 'still exactly what the ledger holds').toBe(f.ledgerTotal + 1000);

  // The tile renders and opens a reconciliation that balances.
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForSelector('.dash-tile-grid', { timeout: 8000 });
  const tile = await win.evaluate(() => {
    const t = [...document.querySelectorAll('.dash-tile-grid .dsh-card')]
      .find(c => /cash received/i.test(c.innerText));   // rendered uppercase by CSS
    return t ? { text: t.innerText.replace(/\s+/g, ' ').trim(),
                 opens: /showCashReceivedModal/.test(t.getAttribute('onclick') || '') } : null;
  });
  expect(tile, 'the Cash Received tile is on the dashboard').toBeTruthy();
  expect(tile.opens).toBe(true);

  await win.evaluate(() => showCashReceivedModal());
  await win.waitForTimeout(400);
  const modal = await win.evaluate(() => {
    const m = document.querySelector('.modal, #modal-container');
    return m ? m.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  expect(modal).toMatch(/cash received/i);
  expect(modal).toMatch(/in the drawer/i);

  expect(pageErrors, 'no page errors').toEqual([]);
  await app.close();
});
