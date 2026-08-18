'use strict';
const { test, _electron: electron } = require('@playwright/test');
const path = require('path');
const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');
const OUT = process.env.SHOT_DIR || '.';

const probe = () => ({
  wrap: (() => { const w = document.getElementById('trend-chart-wrap');
    if (!w) return null; const r = w.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
  canvasAttr: (() => { const c = document.getElementById('trend-canvas');
    return c ? { w: c.width, h: c.height, sw: c.style.width, sh: c.style.height } : null; })(),
  canvasBox: (() => { const c = document.getElementById('trend-canvas');
    if (!c) return null; const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
  chart: (typeof _dashTrendChart !== 'undefined' && _dashTrendChart) ? {
    w: Math.round(_dashTrendChart.width), h: Math.round(_dashTrendChart.height),
    area: _dashTrendChart.chartArea ? {
      l: Math.round(_dashTrendChart.chartArea.left), r: Math.round(_dashTrendChart.chartArea.right),
      t: Math.round(_dashTrendChart.chartArea.top), b: Math.round(_dashTrendChart.chartArea.bottom) } : null,
  } : null,
  dpr: window.devicePixelRatio,
});

test('trend chart first open vs re-render', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env });
  const win = await app.firstWindow();
  win.on('pageerror', e => console.log('PAGEERROR ' + e.message));
  await win.setViewportSize({ width: 1400, height: 800 });

  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForTimeout(1500);
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.press('#login-input', 'Enter');
  await win.waitForFunction(() => typeof CUR_USER !== 'undefined' && !!CUR_USER, null, { timeout: 30000 });

  // Seed BEFORE the first dashboard paint would be unrealistic — the real app
  // boots straight onto the dashboard with data already in the DB. Seed, then
  // reload the window so this is a genuine cold first open.
  await win.evaluate(async () => {
    DB.rooms = []; DB.students = []; DB.payments = []; DB.expenses = [];
    DB.transfers = []; DB.cancellations = [];
    for (let i = 0; i < 8; i++) DB.rooms.push({ id: 'r'+i, number: String(100+i),
      floor: 'Ground', typeId: DB.settings.roomTypes[i % 5].id, rent: 16000 });
    for (let i = 0; i < 20; i++) DB.students.push({ id: 's'+i, name: 'Student ' + i,
      roomId: 'r' + (i % 8), status: 'Active', rent: 16000, mess: 0, messOptIn: true,
      joinDate: '2026-0' + (1 + (i % 7)) + '-05' });
    for (let m = 1; m <= 8; m++) {
      const k = '2026-' + String(m).padStart(2, '0');
      DB.payments.push({ id: 'p'+m, studentId: 's0', studentName: 'Student 0', roomNumber: '100',
        month: k, date: k + '-05', status: 'Paid', amount: 90000 + m * 60000, unpaid: null, method: 'Cash' });
      DB.expenses.push({ id: 'e'+m, date: k + '-08', category: 'Electricity',
        description: 'WAPDA', amount: 70000 + m * 55000 });
    }
    await saveDB();
  });

  await win.reload();
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 }).catch(() => {});
  // A restored session skips the login screen; handle both.
  const needsLogin = await win.evaluate(() => !!document.getElementById('login-input')
    && getComputedStyle(document.getElementById('login-screen')).display !== 'none');
  if (needsLogin) {
    await win.waitForTimeout(1400);
    await win.fill('#login-user', 'warden1');
    await win.fill('#login-input', 'admin123');
    await win.press('#login-input', 'Enter');
  }
  await win.waitForFunction(() => typeof CUR_USER !== 'undefined' && !!CUR_USER, null, { timeout: 30000 });

  // ── FIRST OPEN — sample repeatedly as it settles.
  for (const ms of [300, 700, 1500, 2500]) {
    await win.waitForTimeout(ms === 300 ? 300 : ms - 0);
    const p = await win.evaluate(probe);
    console.log('FIRST@' + ms + ' ' + JSON.stringify(p));
    if (ms !== 300) break;
  }
  await win.waitForTimeout(1200);
  const first = await win.evaluate(probe);
  console.log('FIRST-SETTLED ' + JSON.stringify(first));
  await win.screenshot({ path: OUT + '/trend-first.png' });

  // ── RE-RENDER (what the owner does when they "refresh")
  await win.evaluate(() => renderPage('dashboard'));
  await win.waitForTimeout(1500);
  const second = await win.evaluate(probe);
  console.log('AFTER-RERENDER ' + JSON.stringify(second));
  await win.screenshot({ path: OUT + '/trend-second.png' });

  console.log('DIFFERS ' + JSON.stringify({
    canvasAttr: JSON.stringify(first.canvasAttr) !== JSON.stringify(second.canvasAttr),
    chart: JSON.stringify(first.chart) !== JSON.stringify(second.chart),
  }));

  await app.close();
});
