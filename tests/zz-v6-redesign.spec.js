// ════════════════════════════════════════════════════════════════════════════
// HOSTIX — v6 redesign check
//
// Covers the six screens redesigned against the owner's mockups:
//   1. Add Room modal      — guide banner, amenity toggles, live room preview,
//                            and that a toggle still reaches submitAddRoom().
//   2. Edit Room modal     — the same picker, pre-checked from stored data.
//   3. Student profile     — hero/stats/cards render and carry no emoji.
//   4. Backup & Restore    — tiles, sections, honest last-export line.
//   5. Reports overview    — Monthly Overview, peaks strip, Profit series.
//   6. Room Visit Sheet    — print doc sizes its icons (300px fallback bug).
//   7. License Settings    — facts strip, action rows, icons, no overflow.
//
// Like smoke.spec.js this WRITES (a room, a payment, an expense), so it runs
// only against the isolated throwaway profile and refuses to start if that
// profile holds real data.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

test.beforeAll(() => {
  const fs = require('fs');
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
  // Same isolation guard as smoke.spec.js: start from a fresh DB so this spec
  // can never append its seed rows to a real client ledger.
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('v6 redesign: add-room, student view, backup, reports overview all render', async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  const errs = [];
  win.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  win.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });

  // ── 1. Add Room modal ──────────────────────────────────────────────────────
  await win.evaluate(() => showAddRoomModal());
  await win.waitForSelector('#f-rnum');
  const addRoom = await win.evaluate(() => {
    document.getElementById('f-rnum').value = 'V6a';
    syncRoomPreview();
    return {
      guide:   !!document.querySelector('.arm-guide'),
      amenity: document.querySelectorAll('.arm-amen').length,
      ramen:   document.getElementById('f-ramen')?.value,
      count:   document.getElementById('f-ramen-count')?.textContent,
      code:    document.getElementById('f-rcode')?.textContent,
      meta:    document.getElementById('f-rcode-meta')?.textContent,
      // toggling a box must flow through to the hidden input the submitter reads
      afterToggle: (() => {
        const wifi = [...document.querySelectorAll('.arm-amen input')]
          .find(i => i.value === 'Wi-Fi');
        wifi.checked = true; syncRoomAmenities();
        return document.getElementById('f-ramen').value;
      })(),
    };
  });
  console.log('ADDROOM ' + JSON.stringify(addRoom));

  // Save it through the real submitter, so the data contract is proven.
  await win.evaluate(() => submitAddRoom());
  await win.waitForTimeout(500);
  const savedRoom = await win.evaluate(() =>
    DB.rooms.filter(r => String(r.number).toUpperCase() === 'V6A').map(r => r.amenities)[0]);
  console.log('SAVEDROOM ' + JSON.stringify(savedRoom));

  // ── 2. Edit Room modal (same picker, pre-checked from stored data) ─────────
  const rid = await win.evaluate(() =>
    DB.rooms.find(r => String(r.number).toUpperCase() === 'V6A')?.id);
  await win.evaluate(id => showEditRoomModal(id), rid);
  await win.waitForSelector('.arm-amen-grid');
  const editRoom = await win.evaluate(() => ({
    on: document.querySelectorAll('.arm-amen.is-on').length,
    ramen: document.getElementById('f-ramen').value,
  }));
  console.log('EDITROOM ' + JSON.stringify(editRoom));
  await win.evaluate(() => closeModal());

  // ── 3. Student profile modal ───────────────────────────────────────────────
  // Fresh profile, so seed the occupant this modal is meant to describe.
  const sid = await win.evaluate(async () => {
    if (DB.students[0]) return DB.students[0].id;
    const room = DB.rooms.find(r => String(r.number).toUpperCase() === 'V6A');
    DB.students.push({ id: 's_v6', name: 'Test Occupant', status: 'Active',
      roomId: room?.id, rent: 16000, joinDate: new Date().toISOString().slice(0, 10),
      fatherName: 'Test Guardian', occupation: 'FSc Pre-Medical',
      phone: '03001234567', paymentMethod: 'Cash' });
    await saveDB();
    return 's_v6';
  });
  let student = null;
  if (sid) {
    await win.evaluate(id => showViewStudentModal(id), sid);
    await win.waitForSelector('.svw');
    student = await win.evaluate(() => ({
      hero:   !!document.querySelector('.svw-hero__rentv'),
      stats:  document.querySelectorAll('.svw-stat').length,
      cards:  document.querySelectorAll('.svw-card').length,
      rows:   document.querySelectorAll('.svw-row').length,
      emoji:  /[\u{1F300}-\u{1FAFF}]/u.test(document.querySelector('.svw').innerText),
    }));
    await win.evaluate(() => closeModal());
  }
  console.log('STUDENT ' + JSON.stringify(student));

  // ── 4. Backup & Restore modal ──────────────────────────────────────────────
  await win.evaluate(() => showBackupRestoreModal());
  await win.waitForSelector('.bkp');
  const backup = await win.evaluate(() => ({
    stats: document.querySelectorAll('.bkp-stat').length,
    secs:  document.querySelectorAll('.bkp-sec').length,
    last:  document.querySelector('.bkp-last')?.innerText.trim(),
    warn:  !!document.querySelector('.bkp-warn'),
  }));
  console.log('BACKUP ' + JSON.stringify(backup));
  await win.evaluate(() => closeModal());

  // ── 5. Reports → Monthly Overview ──────────────────────────────────────────
  // The throwaway profile has no ledger, so seed one paid month and one expense
  // — otherwise the trend correctly renders its empty state and never builds
  // the chart, and the Profit series would go unverified.
  await win.evaluate(async () => {
    const k = new Date().toISOString().slice(0, 7);
    DB.payments.push({ id: 'p_v6', studentId: DB.students[0]?.id || 's_x', amount: 20000,
      status: 'Paid', method: 'Cash', date: k + '-05', month: k, monthlyRent: 16000 });
    DB.expenses.push({ id: 'e_v6', amount: 5000, category: 'Electricity', date: k + '-06' });
    await saveDB();
  });
  await win.evaluate(() => navigate('reports'));
  await win.waitForTimeout(1200);
  const reports = await win.evaluate(() => ({
    renderError: document.body.innerText.includes('Render Error'),
    mov:     !!document.querySelector('.mov'),
    legend:  document.querySelectorAll('.mov__k').length,
    cells:   document.querySelectorAll('.mov__cell').length,
    period:  document.querySelector('.mov__period')?.innerText.trim(),
    foot:    document.querySelector('.mov__foot')?.innerText.replace(/\s+/g, ' ').trim(),
    canvas:  !!document.getElementById('rpt-trend'),
    series:  (typeof _rptTrendChart !== 'undefined' && _rptTrendChart)
               ? _rptTrendChart.data.datasets.map(d => d.label) : null,
    // Straight segments: a curved line would imply mid-month figures the
    // ledger never recorded.
    tension: (typeof _rptTrendChart !== 'undefined' && _rptTrendChart)
               ? _rptTrendChart.data.datasets.map(d => d.tension) : null,
  }));
  console.log('REPORTS ' + JSON.stringify(reports));

  // Dashboard trend must be flat too — the two charts show the same money and
  // would otherwise disagree on how it moved between months.
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForTimeout(1200);
  const dash = await win.evaluate(() => ({
    renderError: document.body.innerText.includes('Render Error'),
    tension: (typeof _dashTrendChart !== 'undefined' && _dashTrendChart)
               ? _dashTrendChart.data.datasets.map(d => d.tension) : null,
    // The legend advertises four series; the chart must actually draw four.
    series: (typeof _dashTrendChart !== 'undefined' && _dashTrendChart)
               ? _dashTrendChart.data.datasets.map(d => d.label) : null,
    legend: [...document.querySelectorAll('.dash-legend__k')].map(e => e.textContent.trim()),
    // KPI row order is the argument the row makes: people, money in, money out,
    // what is left, what is owed. Available Fund states itself as
    // "collected − expenses" and must not precede the expenses it subtracts.
    kpiOrder: [...document.querySelectorAll('.dash-kpi-grid .dash-kpi__label')]
      .map(l => l.textContent.replace(/\s+/g, '')),
    // Every money card carries its own 12-month history; the first (a headcount
    // with a fill bar) does not.
    kpiSparks: [...document.querySelectorAll('.dash-kpi-grid .dsh-card')]
      .map(c => !!c.querySelector('.dash-spark')),
    // Months that have not happened must be null (line stops), not 0 (line
    // runs flat along the axis claiming a year of zero revenue).
    futureNulls: (typeof _dashTrendChart !== 'undefined' && _dashTrendChart)
      ? (() => {
          const m = new Date().getMonth();          // 0-based; months after it are future
          return _dashTrendChart.data.datasets.map(d => ({
            past:   d.data.slice(0, m + 1).every(v => v !== null),
            future: d.data.slice(m + 1).every(v => v === null),
          }));
        })()
      : null,
  }));
  console.log('DASHTREND ' + JSON.stringify(dash));

  // ── 6. Room Visit Sheet print document ─────────────────────────────────────
  // Capture the HTML printSeatAvailability hands to the PDF writer, render it
  // in an iframe, and measure an icon. The print doc loads none of the app's
  // stylesheets, so an unsized <svg class="icon"> falls back to 300×150 and
  // wrecks the layout — that is what the svg.icon rules in it are for.
  const visit = await win.evaluate(async () => {
    const real = window._electronPDF;
    let captured = '';
    window._electronPDF = (html) => { captured = html; };
    try { printSeatAvailability(); } finally { window._electronPDF = real; }

    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;width:900px;height:1200px';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(captured); f.contentDocument.close();
    await new Promise(r => setTimeout(r, 300));
    const d = f.contentDocument;
    const anyIcon = d.querySelector('svg.icon');
    const out = {
      len: captured.length,
      hasTintedCards: /room-box\.full|room-box\.partial/.test(captured),  // must be gone
      sboxes: d.querySelectorAll('.sbox').length,
      floors: d.querySelectorAll('.floor-head').length,
      // Each floor header carries that floor's own seat maths. Unstyled spans
      // would still be *present*, so measure one — a styled .fstat pill is
      // inline-flex with padding, a bare span collapses to the text box.
      fstats: d.querySelectorAll('.floor-head .fstat').length,
      fstatDisplay: (() => { const s = d.querySelector('.floor-head .fstat');
        return s ? getComputedStyle(s).display : null; })(),
      fbadgeW: (() => { const b = d.querySelector('.floor-head .fbadge');
        return b ? Math.round(b.getBoundingClientRect().width) : null; })(),
      rooms:  d.querySelectorAll('.room-box').length,
      iconW:  anyIcon ? Math.round(anyIcon.getBoundingClientRect().width) : null,
      bodyW:  d.body ? Math.round(d.body.scrollWidth) : null,
    };
    f.remove();
    return out;
  });
  console.log('VISITSHEET ' + JSON.stringify(visit));

  // ── 7. License Settings window ─────────────────────────────────────────────
  await app.evaluate(async ({ BrowserWindow }, p) => {
    const w = new BrowserWindow({
      width: 780, height: 760, show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: p.preload },
    });
    await w.loadFile(p.page);
  }, { page: path.join(REPO_ROOT, 'renderer', 'license-settings.html'),
       preload: path.join(REPO_ROOT, 'preload.js') });

  const licPage = (await app.windows()).find(w => w.url().includes('license-settings'));
  await licPage.waitForSelector('.facts');
  await licPage.waitForFunction(
    () => document.getElementById('status-badge').textContent !== 'Loading…', null, { timeout: 15000 });
  const lic = await licPage.evaluate(() => ({
    badge:   document.getElementById('status-badge').textContent.trim(),
    facts:   document.querySelectorAll('.fact').length,
    acts:    document.querySelectorAll('.act').length,
    // every data-ico placeholder must have been filled by icons.js
    unfilled: [...document.querySelectorAll('[data-ico]')].filter(e => !e.querySelector('svg')).length,
    machine: document.getElementById('val-machine').textContent.trim().slice(0, 20),
    expiry:  document.getElementById('val-expiry').textContent.trim(),
    days:    document.getElementById('fact-days').textContent.trim(),
    note:    document.getElementById('status-note').textContent.trim().slice(0, 40),
    overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  console.log('LICENSE ' + JSON.stringify(lic));

  // ── 8. Students Fee Report print document ──────────────────────────────────
  // This one cannot be captured like the visit sheet: it goes out through
  // electronAPI.openPdfWindow, and contextBridge freezes that object, so the
  // stub-and-read trick above is impossible. Let the real window open instead.
  const monthKey = await win.evaluate(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  });
  const [feePage] = await Promise.all([
    app.waitForEvent('window'),
    win.evaluate((k) => doGenerateStudentsPDF(k), monthKey),
  ]);
  await feePage.waitForLoadState('domcontentloaded');
  await feePage.waitForSelector('.summary .sbox', { timeout: 15000 });
  const fee = await feePage.evaluate(() => ({
    tiles: document.querySelectorAll('.summary .sbox').length,
    // Print docs load none of the app's stylesheets, so an unsized icon() SVG
    // falls back to 300×150 — the same trap the visit sheet has rules for.
    iconW: (() => { const s = document.querySelector('svg.icon');
      return s ? Math.round(s.getBoundingClientRect().width) : null; })(),
    blankIcons: document.querySelectorAll('.sbox .ico:empty').length,
    // Every tile label used to break mid-phrase on a <br>; one line each now.
    labelH: (() => { const l = document.querySelector('.sbox .l');
      return l ? Math.round(l.getBoundingClientRect().height) : null; })(),
    // The roster's cells are styled by class. A drift back to per-cell inline
    // styles is what made a colour change a fourteen-place edit.
    inlineCells: document.querySelectorAll('tbody td[style]').length,
    // Header tints were once picked for a dark strip; on the light one they
    // have to stay dark enough to read. Reject anything above 60% lightness.
    paleHeaders: [...document.querySelectorAll('thead th[style]')].filter(th => {
      const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(getComputedStyle(th).color);
      if (!m) return false;
      const [r, g, b] = [+m[1], +m[2], +m[3]];
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
    }).length,
    totalsRow: document.querySelectorAll('tr.totals').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  console.log('FEEREPORT ' + JSON.stringify(fee));

  console.log('ERRORS ' + JSON.stringify(errs));

  expect(addRoom.guide, 'add-room guide banner missing').toBe(true);
  expect(addRoom.amenity, 'amenity toggles missing').toBeGreaterThan(10);
  expect(addRoom.afterToggle, 'toggle did not reach #f-ramen').toContain('Wi-Fi');
  expect(savedRoom, 'amenities did not persist through submitAddRoom').toContain('Wi-Fi');
  expect(editRoom.on, 'edit modal did not pre-check stored amenities').toBeGreaterThan(0);
  expect(reports.renderError, 'reports render error').toBe(false);
  expect(reports.mov, 'monthly overview missing').toBe(true);
  expect(reports.cells, 'peaks strip missing').toBe(4);
  expect(reports.series, 'profit series missing').toEqual(['Collection', 'Expenses', 'Profit']);
  expect(reports.tension, 'trend line must be straight, not curved').toEqual([0, 0, 0]);
  expect(dash.renderError, 'dashboard render error').toBe(false);
  // Series COUNT is not the assertion — the properties are. The Transfers line
  // is drawn only while FEATURES.fundsTransferCard is on (it plots money that
  // calcExpenses, and so the Expenses line, already carries), so hard-coding
  // four datasets made this fail for a deliberate change rather than a defect.
  /* THE DASHBOARD TREND IS BARS NOW (design 1c, "bars instead of lines").
     Updated 2026-09-04 for a deliberate design change, not to quiet a failure.

     `tension` was asserted as all-zero to keep the line straight — a bar
     dataset has no tension at all, so the property reads null and the old
     assertion failed on the absence of a thing that no longer applies. The
     straightness it was defending is now structural: bars cannot interpolate
     between months, which was the whole reason the line had to be pinned flat.

     Pending is deliberately no longer drawn. It is not a monthly flow like the
     other two — it is what has NOT arrived — so a third bar beside collected
     revenue invited adding them into a figure the ledger never held. It keeps
     its KPI card and its line in the hover badge.

     The assertion that MATTERS is the last one, and it is unchanged: whatever
     is drawn, the legend must say exactly that. A legend describing a series
     that is not on screen is how a reader stops trusting the panel, and this
     chart has had that bug before. */
  expect(dash.series, 'dashboard must draw Revenue and Expenses')
    .toEqual(expect.arrayContaining(['Revenue', 'Expenses']));
  expect(dash.series, 'Pending is a balance, not a monthly flow — do not bar it')
    .not.toContain('Pending');
  expect(dash.legend, 'legend must match the drawn series').toEqual(dash.series);
  expect(dash.kpiOrder, 'KPI row order: people, in, out, left, owed')
    .toEqual(['TotalResidents', 'TotalRevenue', 'Expenses', 'AvailableFund', 'Pending']);
  expect(dash.kpiSparks, 'Available Fund lost its history sparkline')
    .toEqual([false, false, true, true, true]);
  expect(dash.futureNulls, 'past months must plot, future months must be null')
    .toEqual(dash.series.map(() => ({ past: true, future: true })));
  expect(backup.stats).toBe(4);
  expect(student && student.stats, 'student profile stat tiles').toBe(4);
  expect(student && student.emoji, 'student profile still contains emoji').toBe(false);
  expect(visit.hasTintedCards, 'full/partial card tints should be gone').toBe(false);
  expect(visit.sboxes, 'visit sheet summary tiles').toBe(4);
  expect(visit.rooms, 'visit sheet room cards').toBeGreaterThan(0);
  expect(visit.floors, 'visit sheet floor headers').toBeGreaterThan(0);
  expect(visit.fstats, 'per-floor seat stats (3 per floor)').toBe(visit.floors * 3);
  // .fstat is declared inline-flex but sits in a flex row, so it blockifies to
  // 'flex'. An unstyled <span> in that same row would blockify to 'block', so
  // this still tells the two apart.
  expect(visit.fstatDisplay, 'floor stat pill is unstyled').toBe('flex');
  expect(visit.fbadgeW, 'floor badge is unstyled').toBe(22);
  expect(visit.iconW, 'print-doc icon is unsized (300px fallback)').toBeLessThan(20);
  expect(fee.tiles, 'fee report summary tiles').toBe(8);
  expect(fee.iconW, 'fee report icon is unsized (300px fallback)').toBeLessThan(20);
  expect(fee.blankIcons, 'empty tile icon chips (bad icon name)').toBe(0);
  expect(fee.labelH, 'tile label wrapped onto a second line').toBeLessThan(14);
  expect(fee.inlineCells, 'roster cells drifted back to inline styles').toBeLessThan(8);
  expect(fee.paleHeaders, 'column header too pale to read on the light strip').toBe(0);
  expect(fee.totalsRow, 'fee report totals band').toBe(1);
  expect(fee.overflow, 'fee report scrolls horizontally').toBe(false);
  expect(lic.facts, 'license facts strip').toBe(6);
  expect(lic.acts, 'license action rows').toBe(3);
  expect(lic.unfilled, 'unfilled data-ico placeholders').toBe(0);
  expect(lic.overflow, 'license page scrolls horizontally').toBe(true);
  expect(errs.filter(e => !/DevTools|Autofill|GPU|cache/i.test(e)), 'console errors').toEqual([]);

  await app.close();
});
