// ════════════════════════════════════════════════════════════════════════════
// The shared list toolbar — src/toolbar.js and the filter registry in nav.js.
//
// Six screens (Students, Payments, Rooms, Expenses, Cancellations, Complaints)
// each grew their own toolbar, and by 2026-09-08 the same four bugs had to be
// reported once per screen. This file holds the fixes closed ACROSS all six at
// once, because the point of the shared code is that they cannot drift apart
// again — a per-screen test would pass while a seventh screen repeated the bug.
//
//  1. Typing survives the re-render. Filtering rebuilds `#content.innerHTML`,
//     which destroys the box being typed into. Four screens had a private
//     workaround and two did not, so on Cancellations and Complaints the
//     search lost focus on the first keystroke.
//  2. The search input draws no ring of its own. `body.light-theme
//     input:focus` (0,2,2) beat every wrapper's "be invisible" rule (0,1,1)
//     and drew a second rounded box around the placeholder, in light mode only.
//  3. A visit starts clean. `navigate()` reset a hand-written list of fields
//     that had drifted from the filter objects.
//  4. One Export control, two formats inside it — not two buttons.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

/** Every list screen, its search box, and its filter registry key. */
const SCREENS = [
  { page: 'students',      input: 'search-students', key: 'students' },
  { page: 'payments',      input: 'search-payments', key: 'payments' },
  { page: 'rooms',         input: 'search-rooms',    key: 'rooms' },
  { page: 'expenses',      input: 'search-expenses', key: 'expenses' },
  { page: 'cancellations', input: 'canc-search',     key: 'cancellations' },
  { page: 'issues',        input: 'iss-search',      key: 'issues' },
];

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 60000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 60000 });
  await win.evaluate(async () => {
    const r0 = DB.rooms[0];
    for (let i = 1; i <= 6; i++) {
      DB.students.push({ id: 'p' + i, name: 'Student ' + i, phone: '030000000' + i,
        roomId: r0.id, status: 'Active', admissionDate: '2026-02-01', monthlyRent: 12000 });
    }
    DB.expenses = [{ id: 'e1', date: '2026-09-01', category: 'Utilities',
      description: 'Bill', amount: 5000 }];
    DB.maintenance = [{ id: 'mt_1', seq: 1, title: 'Tap', description: 'Leak',
      roomId: r0.id, priority: 'High', date: '2026-09-02', status: 'Open', resolvedDate: '' }];
    DB.cancellations = [{ id: 'canc_1', seq: 1, studentId: 'p1', studentName: 'Student 1',
      roomId: r0.id, roomNumber: r0.number, requestDate: '2026-09-01',
      vacateDate: '2026-09-30', status: 'Pending', reason: '' }];
    await saveDB();
  });
  return { app, win };
}

test('typing in the search box survives the re-render it triggers', async () => {
  test.setTimeout(300000);
  const { app, win } = await launch();

  const lost = [];
  for (const s of SCREENS) {
    await win.evaluate(p => navigate(p), s.page);
    await win.waitForTimeout(400);
    await win.click('#' + s.input);
    // Two characters, typed the way a person does, with the debounce and the
    // 80ms render defer in between. The second one is the one that used to be
    // swallowed: the first keystroke queued the render that stole the focus.
    await win.type('#' + s.input, 'S', { delay: 40 });
    await win.waitForTimeout(600);
    await win.keyboard.type('t', { delay: 40 });
    await win.waitForTimeout(600);

    const state = await win.evaluate(id => {
      const el = document.getElementById(id);
      return {
        value: el ? el.value : null,
        focused: !!el && document.activeElement === el,
        caret: el ? el.selectionStart : null,
      };
    }, s.input);
    if (state.value !== 'St' || !state.focused) lost.push({ page: s.page, ...state });
  }

  expect(lost, 'search boxes that dropped focus or characters').toEqual([]);
  await app.close();
});

test('the search box draws no ring of its own, in either theme', async () => {
  test.setTimeout(300000);
  const { app, win } = await launch();

  const bad = [];
  for (const theme of ['light', 'dark']) {
    await win.evaluate(t => {
      const isLight = document.body.classList.contains('light-theme');
      if ((t === 'light') !== isLight && typeof toggleTheme === 'function') toggleTheme();
    }, theme);
    await win.waitForTimeout(300);

    for (const s of SCREENS) {
      await win.evaluate(p => navigate(p), s.page);
      await win.waitForTimeout(380);
      await win.click('#' + s.input);
      await win.waitForTimeout(200);
      const ring = await win.evaluate(id => {
        const c = getComputedStyle(document.getElementById(id));
        return { shadow: c.boxShadow, radius: c.borderRadius, border: c.borderTopStyle };
      }, s.input);
      // The WRAPPER owns the focus ring. The input inside it is a hole.
      if (ring.shadow !== 'none' || ring.border !== 'none') {
        bad.push({ theme, page: s.page, ...ring });
      }
    }
  }

  expect(bad, 'search inputs still drawing their own box').toEqual([]);
  await app.close();
});

test('a fresh visit starts with the filters a fresh visit should have', async () => {
  test.setTimeout(300000);
  const { app, win } = await launch();

  // Dirty every screen: search text plus one dropdown, on each.
  await win.evaluate(() => {
    studentFilter.search = 'zz'; studentFilter.status = 'Left'; studentFilter.fee = 'Unpaid';
    payFilter.search = 'zz';     payFilter.status = 'Unpaid';  payFilter.arrears = false;
    roomFilter.search = 'zz';    roomFilter.type = 'X';        roomFilter.floor = 'Top';
    expFilter.search = 'zz';     expFilter.cat = 'Utilities';
    cancelFilter.search = 'zz';  cancelFilter.type = 'X';      cancelFilter.month = '2020-01';
    issueFilter.search = 'zz';   issueFilter.status = 'open';  issueFilter.month = '2020-01';
  });

  // Leave the section and come back. Any page change is a fresh visit.
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForTimeout(350);
  await win.evaluate(() => navigate('students'));
  await win.waitForTimeout(350);

  const after = await win.evaluate(() => ({
    students: { search: studentFilter.search, status: studentFilter.status,
                fee: studentFilter.fee, month: studentFilter.month },
    payments: { search: payFilter.search, status: payFilter.status, arrears: payFilter.arrears },
    rooms:    { search: roomFilter.search, type: roomFilter.type, floor: roomFilter.floor },
    expenses: { search: expFilter.search, cat: expFilter.cat },
    cancel:   { search: cancelFilter.search, type: cancelFilter.type, month: cancelFilter.month },
    issues:   { search: issueFilter.search, status: issueFilter.status, month: issueFilter.month },
    now: thisMonth(),
  }));

  expect(after.students).toEqual({ search: '', status: 'All', fee: 'All', month: after.now });
  expect(after.payments).toEqual({ search: '', status: 'All', arrears: true });
  expect(after.rooms).toEqual({ search: '', type: 'All', floor: 'All' });
  expect(after.expenses).toEqual({ search: '', cat: 'All' });
  // A DEFAULT IS NOT ALWAYS EMPTY. Every month picker opens on the current
  // month (owner, 2026-09-08), and `thisMonth()` is re-read on each reset so a
  // session left open past midnight on the 30th does not keep restoring the
  // month that has just ended.
  expect(after.cancel).toEqual({ search: '', type: 'All', month: after.now });
  expect(after.issues).toEqual({ search: '', status: 'All', month: after.now });

  await app.close();
});

test('one Export control per screen, with both formats inside it', async () => {
  test.setTimeout(300000);
  const { app, win } = await launch();

  const wrong = [];
  for (const s of SCREENS) {
    await win.evaluate(p => navigate(p), s.page);
    await win.waitForTimeout(400);

    const shape = await win.evaluate(() => {
      const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
      const buttons = [...document.querySelectorAll('#content button')].map(text);
      return {
        // No screen may offer two top-level export buttons any more.
        pairs: buttons.filter(t => /^Export (Excel|PDF)$/.test(t)),
        menus: document.querySelectorAll('#content .tb-menu').length,
        items: [...document.querySelectorAll('#content .tb-menu__i b')].map(text),
        openBefore: document.querySelectorAll('#content .tb-menu.is-open').length,
      };
    });
    if (shape.pairs.length || shape.menus !== 1 ||
        shape.items.join('|') !== 'Excel workbook|PDF document' || shape.openBefore !== 0) {
      wrong.push({ page: s.page, ...shape });
    }
  }
  expect(wrong, 'screens whose export control is not the shared one').toEqual([]);

  // …and it opens, and closes again on a click elsewhere.
  await win.evaluate(() => navigate('issues'));
  await win.waitForTimeout(400);
  await win.click('#iss-export');
  await win.waitForTimeout(200);
  expect(await win.evaluate(() =>
    document.querySelectorAll('#content .tb-menu.is-open').length)).toBe(1);
  await win.click('body', { position: { x: 5, y: 300 } });
  await win.waitForTimeout(200);
  expect(await win.evaluate(() =>
    document.querySelectorAll('#content .tb-menu.is-open').length)).toBe(0);

  await app.close();
});

/* ════════════════════════════════════════════════════════════════════════════
   This test used to assert the "Clear all" button. That button is GONE, on the
   owner's call of 2026-09-09: it sat at the far end of the bar when what you
   wanted was to stop searching, and it reset every filter on the page to do it.
   The × moved INTO the search box on all six screens, and the whole-bar reset
   is now the filter lifecycle — a fresh visit starts fresh, which is where the
   owner reported wanting it ("when the page is closed and reopened the search
   bar is still with the data you entered").

   So the assertions follow the behaviour, not the control: the button is not
   there, the × clears the SEARCH ALONE, and leaving the page and coming back
   is what puts everything else down.
   ════════════════════════════════════════════════════════════════════════════ */
test('the search × clears the search alone, and a fresh visit clears the rest', async () => {
  test.setTimeout(300000);
  const { app, win } = await launch();

  await win.evaluate(() => navigate('students'));
  await win.waitForTimeout(400);

  expect(await win.evaluate(() => document.querySelectorAll('#content .tb-clear').length),
    'Clear all was retired on 2026-09-09').toBe(0);

  // Two things set: a search and a status filter.
  await win.evaluate(() => {
    studentFilter.search = 'azat';
    studentFilter.status = 'Left';
    renderPage('students');
  });
  await win.waitForTimeout(400);

  const hasX = await win.evaluate(() => !!document.querySelector('#content .lk-sx'));
  expect(hasX, 'every list screen carries the × in its search box').toBe(true);

  await win.click('#content .lk-sx');
  await win.waitForTimeout(450);

  const afterX = await win.evaluate(() => ({
    search: studentFilter.search,
    status: studentFilter.status,
    box: (document.getElementById('search-students') || {}).value,
  }));
  expect(afterX.search).toBe('');
  expect(afterX.box).toBe('');
  // The × is not the old Clear all: the status filter is deliberately untouched.
  expect(afterX.status, 'the × clears the search, not the bar').toBe('Left');

  // Leaving and coming back IS the reset, defaults included.
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForTimeout(300);
  await win.evaluate(() => navigate('students'));
  await win.waitForTimeout(400);

  const fresh = await win.evaluate(() => ({
    status: studentFilter.status, month: studentFilter.month, now: thisMonth(),
  }));
  // "Fresh" still scopes to this month — it is not "everything emptied".
  expect(fresh.status).toBe('All');
  expect(fresh.month).toBe(fresh.now);

  await app.close();
});

test('Complaints filters by month, not by a room list and a date range', async () => {
  test.setTimeout(300000);
  const { app, win } = await launch();

  await win.evaluate(() => navigate('issues'));
  await win.waitForTimeout(400);

  const bar = await win.evaluate(() => ({
    ranges: document.querySelectorAll('#content .lk-range').length,
    chosen: [...document.querySelectorAll('#content .lk-tools select')]
      .map(s => s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''),
    everyOption: [...document.querySelectorAll('#content .lk-tools select option')]
      .map(o => o.text),
    // Computed in the page, where the app's own helpers live.
    thisMonthLabel: tbMonthLabel(thisMonth()),
  }));
  expect(bar.ranges, 'the From/To range should be gone').toBe(0);
  expect(bar.chosen.some(t => /Room/i.test(t)), 'the room dropdown should be gone').toBe(false);
  // The picker offers whole months and whole years, and opens on this month.
  expect(bar.everyOption).toContain('All months');
  expect(bar.chosen).toContain(bar.thisMonthLabel);

  // Narrowing to a month narrows the register, and the export follows it.
  await win.evaluate(() => { issueFilter.month = '2026-09'; renderPage('issues'); });
  await win.waitForTimeout(400);
  const scoped = await win.evaluate(() => ({
    rows: document.querySelectorAll('#content .iss-table tbody tr').length,
    feed: issuesFiltered().length,
    stated: _issExportDef(issuesFiltered()).filters.find(f => f[0] === 'Month'),
  }));
  expect(scoped.rows).toBe(scoped.feed);
  expect(scoped.stated[1]).toBe('September 2026');

  await app.close();
});
