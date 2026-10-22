// ════════════════════════════════════════════════════════════════════════════
// The dashboard's month is the dashboard's alone (owner, 2026-09-17).
//
// thisMonth() used to return whatever month was picked for the dashboard, and
// three writes ask it "which month is it?": ending a concession, starting a
// mess exemption, and the Add Payment / Generate Month defaults. Looking at
// August moved all of them into August. These assertions hold the split:
// thisMonth() is always the calendar month, dashMonth() is what the dashboard
// shows, and leaving the dashboard puts the picked month back.
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
  await win.selectOption('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(() => {
    const s = document.getElementById('login-screen');
    return s && s.style.display === 'none';
  }, null, { timeout: 30000 });
}

test.beforeAll(() => { resetProfile(); });

test('a month picked on the dashboard never reaches thisMonth()', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);

  const r = await win.evaluate(() => {
    const real = ym(new Date());
    navigate('dashboard');
    _dashboardMonth = '2026-01';
    const onDash = { this: thisMonth(), dash: dashMonth(), label: dashMonthLabel(),
                     conc: _cnEndOfMonth(thisMonth()) };
    navigate('payments');
    const afterLeaving = { dash: dashMonth(), picked: _dashboardMonth };
    return { real, onDash, afterLeaving };
  });

  expect(r.onDash.this, 'thisMonth() is the calendar month whatever the dashboard shows')
    .toBe(r.real);
  expect(r.onDash.dash).toBe('2026-01');
  expect(r.onDash.label).toMatch(/January 2026/);
  expect(r.onDash.conc.slice(0, 7), 'a concession ended now ends in the real month')
    .toBe(r.real);
  expect(r.afterLeaving.picked, 'leaving the dashboard puts its month back').toBeNull();
  expect(r.afterLeaving.dash).toBe(r.real);

  await app.close();
});
