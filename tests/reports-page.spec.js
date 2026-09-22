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
//   · The month picker is the ONLY period control since 2026-09-22 — the
//     Month / This Year / Custom Range segment and the month <select> both
//     went, replaced by a year stepper over a twelve-month grid. Half a dozen
//     places read that window — the keys, the previous-period comparison, the
//     trend anchor, the chart header — and a picker that moves only some of
//     them is worse than none.
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
  /* Named, not counted. This asserted `length === 8` and so failed the moment
     Cancellations and Complaints were built (owner ref: reports2.png, which
     draws both) — a count tells you the strip changed but not into what, and
     the next person has to go and look. The list below is the contract: ten
     tabs, this order, these words. Overview leads and the two newest close it.

     The loop under this then opens every one of them, so a tab added to the
     strip without a view behind it fails here rather than in front of a
     warden. */
  expect(tabs, 'the strip is Overview plus the nine detail views').toEqual([
    'Overview', 'Revenue', 'Payments', 'Pending', 'Expenses',
    'Available fund', 'Students', 'Rooms', 'Cancellations', 'Complaints',
  ]);

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

test('the KPI strip belongs to Overview alone', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-tabs', { timeout: 8000 });

  /* Owner, 2026-09-21: "the kpi cards should be only the overview".

     They rendered above all ten tabs, which made them the tallest thing on a
     detail view and gave the page two navigations for the same ten places —
     the tab strip, and a card row where every card opens a tab. */
  expect(await win.evaluate(() => !!document.querySelector('.rpt-stats')),
    'the strip is missing from Overview, where it belongs').toBe(true);

  const tabs = await win.evaluate(() => document.querySelectorAll('.rpt-tab').length);
  for (let i = 1; i < tabs; i++) {
    await win.evaluate(n => document.querySelectorAll('.rpt-tab')[n].click(), i);
    await win.waitForTimeout(300);
    const seen = await win.evaluate(() => ({
      name: (document.querySelector('.rpt-tab.is-on') || {}).textContent?.trim() || '?',
      strip: !!document.querySelector('.rpt-stats'),
      cards: document.querySelectorAll('.rpt-stat').length,
      // The tab strip and the period bar are still there — this removed the
      // duplicate navigation, not the way back.
      tabs: !!document.querySelector('.rpt-tabs'),
      bar: !!document.querySelector('.rpt-bar'),
    }));
    expect(seen.strip, seen.name + ' still shows the KPI strip').toBe(false);
    expect(seen.cards, seen.name + ' still shows KPI cards').toBe(0);
    expect(seen.tabs && seen.bar, seen.name + ' lost the tab strip or the bar').toBe(true);
  }

  // …and it comes back with Overview.
  await win.evaluate(() => document.querySelectorAll('.rpt-tab')[0].click());
  await win.waitForTimeout(300);
  expect(await win.evaluate(() => document.querySelectorAll('.rpt-stat').length),
    'the strip did not come back on Overview').toBeGreaterThan(0);

  await app.close();
});

test('the month picker moves the whole window, not just the heading', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-mp__btn', { timeout: 8000 });

  const cur = await win.evaluate(() => ({
    label: document.querySelector('.rpt-mp__lbl').textContent.trim(),
    keys: _rptKeys(),
    revenue: document.querySelector('.rpt-stat .rpt-stat__val')?.textContent.replace(/\s+/g, '') || '',
  }));
  expect(cur.keys, 'the picker opens on this month')
    .toEqual([await win.evaluate(() => thisMonth())]);
  expect(cur.label, 'the button names the month it is reporting')
    .toBe(await win.evaluate(() => monthLabel(thisMonth())));

  /* THROUGH THE PANEL, NOT THE STATE. The point of this test is that the
     CONTROL moves the window, so it opens the panel and clicks a cell the way
     a warden does — calling rptSetMonth() directly would pass even if the grid
     were painting the wrong keys onto its buttons. */
  const prev = await win.evaluate(() => window.__k.prev);
  await win.click('.rpt-mp__btn');
  await win.waitForSelector('#rpt-mp-pop:not([hidden])', { timeout: 4000 });

  const grid = await win.evaluate(() => {
    const cells = [...document.querySelectorAll('.rpt-mp__m')];
    return { count: cells.length,
             year: document.getElementById('rpt-mp-y').textContent.trim(),
             on: cells.filter(c => c.classList.contains('is-on')).map(c => c.dataset.k),
             dimmed: cells.filter(c => c.classList.contains('is-empty')).map(c => c.dataset.k) };
  });
  expect(grid.count, 'a year is twelve months').toBe(12);
  expect(grid.year, 'the panel opens on the reported month\'s own year')
    .toBe(String(new Date().getFullYear()));
  expect(grid.on, 'exactly one cell is the selected month')
    .toEqual([await win.evaluate(() => thisMonth())]);
  /* THE MONTHS THE SEED WROTE INTO ARE NOT DIMMED, and the rest are. Asserted
     by NAME rather than by counting: a month a student merely JOINED in counts
     as recorded (finance Phase 5 — a month somebody lived here is a month to
     report on, whether or not money moved), so the seed's join date makes the
     count 9 rather than the 10 a payments-only reading would predict. Naming
     the months tests the rule; counting them tested my arithmetic. */
  const seeded = await win.evaluate(() => [window.__k.cur, window.__k.prev]);
  for (const k of seeded) {
    expect(grid.dimmed, k + ' has records and must not be dimmed').not.toContain(k);
  }
  expect(grid.dimmed.length, 'the empty months of the year are dimmed').toBeGreaterThan(6);

  // Move it back one month. The seed put 30,000 there and 20,000 here, so the
  // headline figure has to change — a heading that changes on its own would
  // pass a weaker assertion.
  await win.click(`.rpt-mp__m[data-k="${prev}"]`);
  await win.waitForTimeout(500);

  const then = await win.evaluate(() => ({
    keys: _rptKeys(),
    prevKeys: _rptPrevKeys(),
    label: document.querySelector('.rpt-mp__lbl').textContent.trim(),
    popOpen: !document.getElementById('rpt-mp-pop').hasAttribute('hidden'),
    revenue: document.querySelector('.rpt-stat .rpt-stat__val')?.textContent.replace(/\s+/g, '') || '',
    lastTrend: (_rptTrendData || []).slice(-1)[0]?.key || null,
  }));
  expect(then.keys, 'the report window followed the picker').toEqual([prev]);
  expect(then.prevKeys[0], 'the comparison window followed it too').not.toBe(cur.keys[0]);
  expect(then.revenue).not.toBe(cur.revenue);
  expect(then.label, 'the button names the month it is drawing').toContain('2026');
  expect(then.lastTrend, 'the trend chart ends on the month being reported').toBe(prev);
  expect(then.popOpen, 'the panel closed when a month was chosen').toBe(false);

  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
// THE THREE CONTROLS THE PICKER REPLACED ARE GONE, AND SO IS THEIR STATE.
// `reportPeriod` and `reportRange` were read by eight places in reports.js and
// written from dashboard.js; a leftover reference would throw on a page that
// otherwise renders, which is the failure mode this catches.
// ════════════════════════════════════════════════════════════════════════════
test('the period segment and the custom range are gone', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-mp__btn', { timeout: 8000 });

  const gone = await win.evaluate(() => ({
    segment: document.querySelectorAll('.rpt-seg').length,
    range:   document.querySelectorAll('.rpt-range').length,
    select:  document.querySelectorAll('.rpt-mo').length,
    picker:  document.querySelectorAll('.rpt-mp__btn').length,
    period:  typeof reportPeriod,
    setter:  typeof rptSetPeriod,
  }));
  expect(gone.segment, 'the Month / This Year / Custom Range segment').toBe(0);
  expect(gone.range,   'the custom range inputs').toBe(0);
  expect(gone.select,  'the month <select>').toBe(0);
  expect(gone.picker,  'one month picker, and only one').toBe(1);
  expect(gone.period,  'reportPeriod is not a variable any more').toBe('undefined');
  expect(gone.setter,  'rptSetPeriod is not a function any more').toBe('undefined');

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

  /* 94px, settled on 2026-09-10 across all six registers. This is the budget a
     KPI row loses one graphic at a time, so it is asserted rather than trusted:
     the sparklines were absolutely placed to stay inside it, and when the
     occupancy bar replaced them it was put in FLOW and took the card to 106
     before this test caught it.

     The bar now shares the caption's line, which costs nothing. `sameLine` is
     what stops it being quietly moved back underneath — that arrangement reads
     fine in a screenshot and only shows up as +12px here. */
  const m = await win.evaluate(() => {
    const cards = [...document.querySelectorAll('.rpt-stat')];
    const occ = cards.find(c => /Occupancy/.test(c.textContent));
    const bar = occ.querySelector('.rpt-stat__bar');
    const cap = occ.querySelector('.rpt-stat__subt');
    const br = bar.getBoundingClientRect(), cr = cap.getBoundingClientRect();
    return { h: Math.round(cards[0].getBoundingClientRect().height),
             cards: cards.length,
             sparks: document.querySelectorAll('.rpt-stat__spark').length,
             coversCaption: br.left < cr.right - 1,
             sameLine: Math.abs(br.top + br.height / 2 - (cr.top + cr.height / 2)) < 4,
             caption: cap.textContent.trim() };
  });
  expect(m.h, 'the reports KPI card is no longer the students card height').toBeLessThanOrEqual(96);
  /* THE SPARKLINES ARE GONE (owner, 2026-09-23: "in kpi cards remove the zig
     zag lines"). They drew six months of movement with no axis and no scale
     behind the figure, which the delta line under it already states as a
     number. Asserted at zero so they cannot drift back in one card at a time. */
  expect(m.sparks, 'the KPI sparklines were removed on 2026-09-23').toBe(0);
  expect(m.cards, 'five cards: revenue, expenses, net result, pending, occupancy').toBe(5);
  /* The bar covered "18 / 22 rooms occupied" when it was absolutely placed —
     the fact its own percentage is about (owner, 2026-09-23). */
  expect(m.caption, 'the occupancy caption still states the rooms').toMatch(/\d+ \/ \d+ rooms? occupied/);
  expect(m.coversCaption, 'the occupancy bar is back on top of its caption').toBe(false);
  expect(m.sameLine, 'the bar moved off the caption line and will cost 12px').toBe(true);

  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
// THE WHOLE-REPORT EXPORTS, WITH THE REGISTERS THEY PRINT
//
// Export Excel and Print / PDF both died the moment the reported month held a
// single complaint or maintenance ticket. `_rptIssues()` returned raw
// DB.issues records; `_issExportDef()` is written for the register's own
// _issAll() views, and its Ref column dereferences `i.raw.seq` — so the first
// issue row threw inside the export engine's try/catch, which logged to a
// console nobody had open and toasted "Export could not be generated."
//
// It arrived with the 2026-09-21 merge of the two registers into one, and it
// only showed on hostels that had raised an issue that month, which is why it
// read as intermittent rather than as broken.
//
// The guard is deliberately about the DOCUMENT, not the definition: building
// `_rptOverviewDef()` never threw — rendering its rows did.
// ════════════════════════════════════════════════════════════════════════════
test('the whole-report exports survive a month holding complaints', async () => {
  const { app, win } = await openApp();
  await seed(win);

  const out = await win.evaluate(async () => {
    const k = thisMonth();
    DB.settings.hostelName = 'Continental Boys Hostel';
    const room = DB.rooms[0] || {};
    // One of each KIND, because the two derive their room differently and the
    // Ref column numbers them in two independent series.
    DB.issues = [
      { id: 'iss_c', seq: 1, kind: 'complaint', category: 'Noise',
        title: 'Loud at night', description: 'Corridor noise after 11pm',
        studentId: '001', raisedBy: 'Seed Student', status: 'Open',
        priority: 'High', date: k + '-05', createdAt: k + '-05' },
      { id: 'iss_m', seq: 1, kind: 'maintenance', category: 'Maintenance',
        title: 'Leaking tap', description: 'Tap in the washroom drips',
        roomId: room.id, status: 'InProgress',
        priority: 'Normal', date: k + '-06', createdAt: k + '-06' },
      // A record written with no `seq` at all: _issSeq falls back to the
      // record's position in its own series, which needs `.raw` to be the
      // stored object and not a copy of it.
      { id: 'iss_n', kind: 'complaint', category: 'Water',
        title: 'No hot water', description: '', status: 'Open',
        priority: 'Low', date: k + '-07', createdAt: k + '-07' },
    ];
    DB.cancellations = [{ id: 'canc_1', seq: 1, studentId: '001',
      studentName: 'Seed Student', roomId: room.id, roomNumber: String(room.number || '1'),
      roomType: '2-Seater', requestDate: k + '-02', vacateDate: k + '-28',
      reason: 'Going home', status: 'Pending', createdAt: k + '-02' }];
    await saveDB();

    const errs = [];
    const realErr = console.error;
    console.error = (...a) => { errs.push(a.map(String).join(' ')); realErr(...a); };

    const realPDF = window._electronPDF; let pdf = null;
    window._electronPDF = (html, name) => { pdf = { name, html }; };
    try { printReport(); } finally { window._electronPDF = realPDF; }

    const realSave = HXW.save; let xls = null;
    HXW.save = async (spec, name) => { xls = { name, sheets: spec.sheets.map(s => s.name) }; return name; };
    try { await exportReportExcel(); } finally { HXW.save = realSave; }

    console.error = realErr;
    // The Ref column's own output, read back out of the printed document.
    const refs = pdf ? (pdf.html.match(/\b(?:CO|MA)-\d{4}\b/g) || []) : [];
    return { pdf: pdf && pdf.name, xls, errs, refs,
             issueRows: _rptIssues().length };
  });

  expect(out.errs, 'the export engine caught and swallowed an error').toEqual([]);
  expect(out.pdf, 'Print / PDF produced no document').toBeTruthy();
  expect(out.xls, 'Export Excel produced no workbook').toBeTruthy();
  expect(out.issueRows, 'all three issues are inside the reported month').toBe(3);
  /* The references actually rendered — the assertion that fails if the rows
     are ever handed over raw again, because `_issSeq` is the line that threw. */
  expect(out.refs, 'the Ref column did not render the issue references')
    .toEqual(expect.arrayContaining(['CO-0001', 'MA-0001']));
  expect(out.xls.sheets, 'the workbook is missing the issues sheet')
    .toEqual(expect.arrayContaining([expect.stringMatching(/Complaint/i)]));

  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
// THE WHOLE-YEAR SWITCH, AND THE PERIOD RESETTING ON ARRIVAL
//
// Both are owner requests of 2026-09-23 and both are easy to break silently:
// a year is expressed as a shorter key prefix ('2026' rather than '2026-09')
// that every matcher on the page already accepts, so a half-applied change
// reports a month under a heading naming the year; and the reset lives in
// navigate(), which nothing on the page calls, so a later refactor that moved
// the page onto navigate() for re-rendering would wipe the picker mid-use.
// ════════════════════════════════════════════════════════════════════════════
test('the whole-year switch widens the window, and a month narrows it back', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-mp__btn', { timeout: 8000 });

  await win.click('.rpt-mp__btn');
  await win.waitForSelector('#rpt-mp-pop:not([hidden])', { timeout: 4000 });
  await win.check('#rpt-mp-all');
  await win.waitForTimeout(600);

  const year = String(new Date().getFullYear());
  const y = await win.evaluate(() => ({
    keys: _rptKeys(), yearly: reportYearly,
    label: document.querySelector('.rpt-mp__lbl').textContent.trim(),
    word: _rptExportWord(), words: _rptPeriodWords(),
    prev: _rptPrevKeys(), bars: (_rptTrendData || []).length,
    popOpen: !document.getElementById('rpt-mp-pop').hasAttribute('hidden'),
  }));
  expect(y.keys, 'a whole year is one prefix key').toEqual([year]);
  expect(y.yearly).toBe(true);
  expect(y.label, 'the button says which window it is').toBe('Year ' + year);
  expect(y.word, 'the export is filed as Annual').toBe('Annual');
  expect(y.words).toBe(year);
  expect(y.prev, 'the comparison is the year before').toEqual([String(Number(year) - 1)]);
  expect(y.bars, 'a year draws its own twelve months').toBe(12);
  expect(y.popOpen, 'the panel closed on the choice').toBe(false);

  /* THE FIGURES HAVE TO MOVE WITH IT. The seed writes into two months, so a
     year total is strictly greater than either — a label that changed while
     the totals did not would pass everything above this line. */
  const sums = await win.evaluate(() => {
    const t = _rptTotals(_rptKeys());
    return { rev: t.rev, collected: t.collected };
  });
  await win.click('.rpt-mp__btn');
  await win.waitForSelector('#rpt-mp-pop:not([hidden])', { timeout: 4000 });
  const cur = await win.evaluate(() => window.__k.cur);
  await win.click(`.rpt-mp__m[data-k="${cur}"]`);
  await win.waitForTimeout(600);

  const m = await win.evaluate(() => ({
    keys: _rptKeys(), yearly: reportYearly, word: _rptExportWord(),
    rev: _rptTotals(_rptKeys()).rev, bars: (_rptTrendData || []).length,
  }));
  expect(m.keys, 'picking a month narrows the window back').toEqual([cur]);
  expect(m.yearly, 'picking a month clears the year switch').toBe(false);
  expect(m.word).toBe('Monthly');
  expect(m.bars, 'a month draws the six ending on it').toBe(6);
  expect(sums.rev, 'the year total must exceed the single month it contains')
    .toBeGreaterThan(m.rev);

  await app.close();
});

test('a visit to Reports starts on this month', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('.rpt-mp__btn', { timeout: 8000 });

  const prev = await win.evaluate(() => window.__k.prev);
  await win.evaluate((p) => rptSetMonth(p), prev);
  await win.waitForTimeout(500);
  expect(await win.evaluate(() => _rptKeys()), 'the picker moved').toEqual([prev]);

  // Leave, and come back the way a warden does — the rail.
  await win.evaluate(() => navRail('students'));
  await win.waitForTimeout(500);
  await win.evaluate(() => navRail('reports'));
  await win.waitForTimeout(700);

  const back = await win.evaluate(() => ({
    keys: _rptKeys(), yearly: reportYearly,
    label: document.querySelector('.rpt-mp__lbl').textContent.trim(),
  }));
  expect(back.keys, 'the period is a property of the visit, not the session')
    .toEqual([await win.evaluate(() => thisMonth())]);
  expect(back.yearly, 'the whole-year switch comes off with it').toBe(false);
  expect(back.label).toBe(await win.evaluate(() => monthLabel(thisMonth())));

  await app.close();
});
