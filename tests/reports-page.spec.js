// ════════════════════════════════════════════════════════════════════════════
// REPORTS — the tab strip, the month picker and Quick Reports.
//
// Built 2026-09-10 with the redesign to `reports2.png`. Three things needed a
// guard and none of them had one:
//
//   · The seven detail views have existed since long before the redesign and
//     the only way into one was to click the right KPI card. The tab strip
//     names them; if a tab ever stops rendering its view, the page looks like
//     it has eight tabs and one screen.
//
//   · The month picker made `reportPeriod === 'month'` mean a month you choose
//     rather than always the current one. Half a dozen places read that window
//     — the keys, the previous-period comparison, the trend anchor, the chart
//     header — and a picker that moves only some of them is worse than none.
//
//   · Quick Reports calls seven functions by name from an onclick string. A
//     renamed export would fail silently at the click, which is exactly the
//     kind of thing nobody finds until a warden needs the file.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function openApp() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0, null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForTimeout(700);
  return { app, win };
}

/** Two months of real money, so the window actually has something to move. */
async function seed(win) {
  await win.evaluate(async () => {
    const room = DB.rooms[0] || {};
    DB.students = [{ id: '001', name: 'Seed Student', roomId: room.id, status: 'Active',
                     joinDate: '2026-07-01', phone: '0300-0000000' }];
    const mk = (id, mon, amt, unpaid, date) => ({
      id, studentId: '001', studentName: 'Seed Student', roomNumber: String(room.number || '1'),
      month: mon, monthlyRent: amt, messCharge: 0, amount: amt - unpaid, unpaid,
      method: 'Cash', status: unpaid > 0 ? 'Pending' : 'Paid', date });
    const now = new Date();
    const key = off => { const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    const day = off => key(off) + '-05';
    DB.payments = [mk('p1', key(0), 20000, 5000, day(0)), mk('p2', key(-1), 30000, 0, day(-1))];
    DB.expenses = [{ id: 'e1', category: 'Electricity', amount: 4000, date: day(0), description: 'Bill' }];
    await saveDB();
    window.__k = { cur: key(0), prev: key(-1) };
  });
}

test('every tab on the strip opens the view it names', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-tabs', { timeout: 8000 });

  const tabs = await win.evaluate(() =>
    [...document.querySelectorAll('.rpt-tab')].map(b => b.textContent.trim()));
  expect(tabs[0]).toBe('Overview');
  expect(tabs.length, 'the strip is Overview plus the seven detail views').toBe(8);

  // Clicking each one must light that tab AND replace the page body. The
  // overview's own Quick Reports block is the marker: it is on the overview
  // and on none of the details.
  for (let i = 1; i < tabs.length; i++) {
    await win.evaluate(n => document.querySelectorAll('.rpt-tab')[n].click(), i);
    await win.waitForTimeout(320);
    const m = await win.evaluate(() => ({
      on: (document.querySelector('.rpt-tab.is-on') || {}).textContent?.trim() || null,
      quick: !!document.querySelector('.rpt-quick'),
      body: document.querySelectorAll('.card, .rpt-card').length,
    }));
    expect(m.on, 'the clicked tab is the lit one').toBe(tabs[i]);
    expect(m.quick, `${tabs[i]} still shows the overview`).toBe(false);
    expect(m.body, `${tabs[i]} rendered nothing`).toBeGreaterThan(0);
  }

  // …and Overview comes back.
  await win.evaluate(() => document.querySelectorAll('.rpt-tab')[0].click());
  await win.waitForTimeout(320);
  expect(await win.evaluate(() => !!document.querySelector('.rpt-quick'))).toBe(true);

  await app.close();
});

test('the month picker moves the whole window, not just the heading', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-mo', { timeout: 8000 });

  const cur = await win.evaluate(() => ({
    picked: document.querySelector('.rpt-mo').value,
    keys: _rptKeys(),
    label: document.querySelector('.mov__period')?.textContent.trim() || '',
    revenue: document.querySelector('.rpt-stat .rpt-stat__val')?.textContent.replace(/\s+/g, '') || '',
  }));
  expect(cur.picked, 'the picker opens on this month').toBe(await win.evaluate(() => thisMonth()));
  expect(cur.keys).toEqual([cur.picked]);

  // Move it back one month. The seed put 30,000 there and 20,000 here, so the
  // headline figure has to change — a heading that changes on its own would
  // pass a weaker assertion.
  const prev = await win.evaluate(() => window.__k.prev);
  await win.selectOption('.rpt-mo', prev);
  await win.waitForTimeout(420);

  const then = await win.evaluate(() => ({
    keys: _rptKeys(),
    prevKeys: _rptPrevKeys(),
    label: document.querySelector('.mov__period')?.textContent.trim() || '',
    revenue: document.querySelector('.rpt-stat .rpt-stat__val')?.textContent.replace(/\s+/g, '') || '',
    lastTrend: (_rptTrendData || []).slice(-1)[0]?.key || null,
  }));
  expect(then.keys, 'the report window followed the picker').toEqual([prev]);
  expect(then.prevKeys[0], 'the comparison window followed it too').not.toBe(cur.keys[0]);
  expect(then.revenue).not.toBe(cur.revenue);
  expect(then.label, 'the chart header names the month it is drawing').toContain('2026');
  expect(then.lastTrend, 'the trend chart ends on the month being reported').toBe(prev);

  await app.close();
});

test('every Quick Report calls something that exists', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-quick', { timeout: 8000 });

  /* The onclick is a string of JS naming a function. A renamed export fails
     silently at the click; this reads the name back out and asks whether the
     renderer actually has it. */
  const calls = await win.evaluate(() =>
    [...document.querySelectorAll('.rpt-quick__b')].map(b => {
      const src = b.getAttribute('onclick') || '';
      const fn = (src.match(/^([A-Za-z_$][\w$]*)\s*\(/) || [])[1] || null;
      return { label: b.querySelector('.rpt-quick__t').textContent.trim(), fn,
               exists: !!fn && typeof window[fn] === 'function' };
    }));

  expect(calls.length, 'seven documents this app can produce').toBe(7);
  expect(calls.filter(c => !c.exists), 'these Quick Reports call a function that is gone').toEqual([]);

  await app.close();
});

test('the report KPI strip is still the students card height', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-stat', { timeout: 8000 });

  /* 94px, settled on 2026-09-10 across all six registers. The sparkline added
     on the same day is absolutely placed for exactly this reason: laid out in
     flow it took the card to 124, and a KPI row that grows every time a
     graphic is added is how that budget gets lost. */
  const m = await win.evaluate(() => {
    const c = document.querySelector('.rpt-stat');
    const sp = c.querySelector('.rpt-stat__spark');
    return { h: Math.round(c.getBoundingClientRect().height),
             sparks: document.querySelectorAll('.rpt-stat__spark').length,
             sparkPos: sp ? getComputedStyle(sp).position : null };
  });
  expect(m.h, 'the reports KPI card is no longer the students card height').toBeLessThanOrEqual(96);
  expect(m.sparkPos, 'a sparkline in flow costs the card its height').toBe('absolute');
  /* Four of the six have a month-by-month history this app can honestly draw.
     Occupancy and the roster are standing figures — nothing records what
     occupancy was in June — so they get no line rather than an invented one. */
  expect(m.sparks).toBe(4);

  await app.close();
});
