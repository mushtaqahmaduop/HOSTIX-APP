// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — a month's data belongs to that month
//
// Two complaints from the owner, both about the Cancellations page:
//
//   1. "students left in july still prints and shows in august" — the page had
//      no month scope at all. Every count on it was a count of the whole
//      database, so a hostel two years old answered "who is going this month"
//      with a two-year total.
//
//   2. "you are telling that 20 are going this month but the blinking only
//      shows 15, because the blinking number decreases as the student is
//      marked left" — the strip counted Pending, and Pending drains into
//      Confirmed as wardens work through the month. The month's real answer
//      never changed; the number the owner was reading did.
//
// Both are invisible to a unit test of the filter, because what broke was
// which set the page counted. So this drives the real page.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
}

async function openApp() {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForTimeout(700);
  return { app, win };
}

test('a month shows its own departures, and its total does not shrink as they leave', async () => {
  const { app, win } = await openApp();

  // Two departures in the scoped month and one in the month before it. The
  // dates are computed from the app's own clock so the spec cannot rot.
  await win.evaluate(async () => {
    const d = new Date();
    const mk = n => {                      // n months back from today
      const x = new Date(d.getFullYear(), d.getMonth() - n, 1);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
    };
    window.__THIS = mk(0);
    window.__PREV = mk(1);
    DB.cancellations = [
      { id: 'c1', seq: 1, studentId: 's1', studentName: 'Scoped One',
        roomNumber: '101', roomType: '', reason: 'course over',
        requestDate: window.__PREV + '-20', vacateDate: window.__THIS + '-28',
        status: 'Pending' },
      { id: 'c2', seq: 2, studentId: 's2', studentName: 'Scoped Two',
        roomNumber: '102', roomType: '', reason: 'course over',
        requestDate: window.__PREV + '-21', vacateDate: window.__THIS + '-28',
        status: 'Pending' },
      { id: 'c3', seq: 3, studentId: 's3', studentName: 'Last Month Leaver',
        roomNumber: '103', roomType: '', reason: 'course over',
        requestDate: window.__PREV + '-02', vacateDate: window.__PREV + '-28',
        status: 'Confirmed' },
    ];
    await saveDB();
  });

  // renderPage() does not paint synchronously — reading the DOM in the same
  // evaluate() returns the page as it was before the call, which looks exactly
  // like the filter having dropped everything.
  const read = async () => {
    await win.evaluate(() => renderPage('cancellations_All'));
    await win.waitForTimeout(600);
    return win.evaluate(() => {
      const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
      return {
        // The banner is two lines: the total on top, the breakdown under it.
        headline: txt(document.querySelector('.lk-banner__t')) + ' — ' +
                  txt(document.querySelector('.lk-banner__s')),
        rows: [...document.querySelectorAll('.lk-panel tbody tr')]
          .map(r => r.textContent.replace(/\s+/g, ' ').trim()),
        month: cancelFilter.month,
      };
    });
  };

  // ── The previous month's leaver must not be in this month's list ──────────
  let view = await read();
  expect(view.month, 'the page did not default to the current month').toBeTruthy();
  const namesIn = s => ({
    one: s.some(r => r.includes('Scoped One')),
    two: s.some(r => r.includes('Scoped Two')),
    old: s.some(r => r.includes('Last Month Leaver')),
  });
  expect(namesIn(view.rows)).toEqual({ one: true, two: true, old: false });
  expect(view.headline).toContain('2 leaving');

  // ── Confirming one must NOT move the headline ────────────────────────────
  await win.evaluate(async () => {
    DB.cancellations.find(c => c.id === 'c1').status = 'Confirmed';
    await saveDB();
  });
  view = await read();
  expect(view.headline, 'the month total moved when a departure merely progressed')
    .toContain('2 leaving');
  expect(view.headline).toContain('1 already left');
  expect(view.headline).toContain('1 still in');

  // ── Restoring one IS a real change, and must move it ─────────────────────
  await win.evaluate(async () => {
    DB.cancellations.find(c => c.id === 'c2').status = 'Restored';
    await saveDB();
  });
  view = await read();
  expect(view.headline, 'a withdrawn notice should leave the month total')
    .toContain('1 leaving');

  // ── The previous month still has its own leaver ──────────────────────────
  await win.evaluate(() => canSetMonth(window.__PREV));
  await win.waitForTimeout(600);
  const prev = await win.evaluate(() => ({
    headline: document.querySelector('.lk-banner__t').textContent.replace(/\s+/g, ' ').trim() +
              ' — ' + document.querySelector('.lk-banner__s').textContent.replace(/\s+/g, ' ').trim(),
    rows: [...document.querySelectorAll('.lk-panel tbody tr')]
      .map(r => r.textContent.replace(/\s+/g, ' ').trim()),
  }));
  expect(prev.headline).toContain('1 leaving');
  expect(namesIn(prev.rows)).toEqual({ one: false, two: false, old: true });

  await app.close();
});

test('the roster carries living students forward and leaves departed ones behind', async () => {
  const { app, win } = await openApp();

  // The owner's rule, as four students:
  //   carried   — joined two months ago, still here      -> in BOTH months
  //   newcomer  — joined this month                      -> this month only
  //   departed  — left last month                        -> last month only
  //   onNotice  — joined last month, leaving this month   -> in BOTH months
  //               (on notice is still living here, which is the whole point of
  //                the 'Cancelling' status)
  await win.evaluate(async () => {
    const d = new Date();
    const mk = n => {
      const x = new Date(d.getFullYear(), d.getMonth() - n, 1);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
    };
    window.__THIS = mk(0);
    window.__PREV = mk(1);
    const older = mk(2);
    DB.students = [
      { id: 'st1', name: 'Carried Forward', status: 'Active',     joinDate: older + '-05', roomId: '' },
      { id: 'st2', name: 'Newcomer',        status: 'Active',     joinDate: window.__THIS + '-03', roomId: '' },
      { id: 'st3', name: 'Departed',        status: 'Left',       joinDate: older + '-05',
        leftDate: window.__PREV + '-20', roomId: '' },
      { id: 'st4', name: 'On Notice',       status: 'Cancelling', joinDate: window.__PREV + '-01', roomId: '' },
    ];
    DB.cancellations = [];
    await saveDB();
  });

  const roster = async (monthKey) => {
    await win.evaluate(m => { studentFilter.month = m; renderPage('students'); }, monthKey);
    await win.waitForTimeout(700);
    return win.evaluate(() => {
      const rows = [...document.querySelectorAll('.stu-table-wrap tbody tr')]
        .map(r => r.textContent.replace(/\s+/g, ' ').trim());
      const has = n => rows.some(r => r.includes(n));
      const strip = document.querySelector('.stu-stat');
      return {
        carried: has('Carried Forward'), newcomer: has('Newcomer'),
        departed: has('Departed'), onNotice: has('On Notice'),
        total: strip ? strip.querySelector('.stu-stat__val').textContent.trim() : null,
        label: strip ? strip.querySelector('.stu-stat__label').textContent.trim() : null,
      };
    });
  };

  const now = await roster(await win.evaluate(() => window.__THIS));
  expect({ carried: now.carried, newcomer: now.newcomer,
           departed: now.departed, onNotice: now.onNotice })
    .toEqual({ carried: true, newcomer: true, departed: false, onNotice: true });
  expect(now.total).toBe('3');
  expect(now.label, 'the card should name the month it is counting').toContain('Students in');

  const before = await roster(await win.evaluate(() => window.__PREV));
  expect({ carried: before.carried, newcomer: before.newcomer,
           departed: before.departed, onNotice: before.onNotice })
    .toEqual({ carried: true, newcomer: false, departed: true, onNotice: true });
  expect(before.total).toBe('3');

  // And "All months" still shows the whole history, for the reports that need it.
  const all = await roster('');
  expect({ carried: all.carried, newcomer: all.newcomer,
           departed: all.departed, onNotice: all.onNotice })
    .toEqual({ carried: true, newcomer: true, departed: true, onNotice: true });
  expect(all.total).toBe('4');
  expect(all.label).toBe('Total Students');

  await app.close();
});
