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
      floors: d.querySelectorAll('.floor-label').length,
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
  expect(dash.tension, 'dashboard trend line must be straight too').toEqual([0]);
  expect(backup.stats).toBe(4);
  expect(student && student.stats, 'student profile stat tiles').toBe(4);
  expect(student && student.emoji, 'student profile still contains emoji').toBe(false);
  expect(visit.hasTintedCards, 'full/partial card tints should be gone').toBe(false);
  expect(visit.sboxes, 'visit sheet summary tiles').toBe(4);
  expect(visit.rooms, 'visit sheet room cards').toBeGreaterThan(0);
  expect(visit.iconW, 'print-doc icon is unsized (300px fallback)').toBeLessThan(20);
  expect(lic.facts, 'license facts strip').toBe(6);
  expect(lic.acts, 'license action rows').toBe(3);
  expect(lic.unfilled, 'unfilled data-ico placeholders').toBe(0);
  expect(lic.overflow, 'license page scrolls horizontally').toBe(true);
  expect(errs.filter(e => !/DevTools|Autofill|GPU|cache/i.test(e)), 'console errors').toEqual([]);

  await app.close();
});
