// Temporary UI check for the new Rent & Mess tab and the mess row in the
// payment modal. Delete after use.
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

test('new UI renders', async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  const errs = [];
  win.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  win.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 30000 });
  await win.waitForTimeout(700);

  // Settings → Rent & Mess
  await win.evaluate(() => { navigate('settings'); });
  await win.waitForTimeout(700);
  const tabs = await win.evaluate(() => Array.from(document.querySelectorAll('.set-tab')).map(t => t.textContent.trim()));
  console.log('TABS ' + JSON.stringify(tabs));

  await win.evaluate(() => { settingsTab = 'rentupdate'; renderPage('settings'); });
  await win.waitForTimeout(800);
  const rm = await win.evaluate(() => {
    const panel = document.querySelector('.settings-panel.active');
    return {
      renderError: document.body.innerText.includes('Render Error'),
      hasTypes: !!document.querySelector('.rm-type'),
      hasTable: !!document.querySelector('.set-table'),
      headings: Array.from(document.querySelectorAll('.set-head__t')).map(e => e.textContent.trim()),
      text: panel ? panel.innerText.slice(0, 220).replace(/\n/g, ' | ') : 'NO PANEL',
    };
  });
  console.log('RENTMESS ' + JSON.stringify(rm, null, 1));

  // Room Types panel — new Mess column
  await win.evaluate(() => { settingsTab = 'rooms'; renderPage('settings'); });
  await win.waitForTimeout(700);
  const rt = await win.evaluate(() => ({
    renderError: document.body.innerText.includes('Render Error'),
    headers: Array.from(document.querySelectorAll('.set-table thead th')).map(t => t.textContent.trim()),
    cellsPerRow: (document.querySelector('.set-table tbody tr') || { children: [] }).children.length,
  }));
  console.log('ROOMTYPES ' + JSON.stringify(rt));

  // Payment modal — mess row, ticked by default
  await win.evaluate(() => { navigate('payments'); });
  await win.waitForTimeout(700);
  await win.evaluate(() => openAddPayment());
  await win.waitForTimeout(700);
  const pm = await win.evaluate(() => {
    const on = document.getElementById('f-pmess-on');
    const amt = document.getElementById('f-pmess');
    // Type a rent + mess and confirm the total follows the tick.
    document.getElementById('f-pamt').value = 10000;
    amt.value = 7000;
    recalcUnpaid();
    const dueOn = document.getElementById('f-punpaid').value;
    on.checked = false; pfMessToggle();
    const dueOff = document.getElementById('f-punpaid').value;
    on.checked = true; pfMessToggle();
    return {
      exists: !!on && !!amt,
      checkedByDefault: !!on && on.checked,
      dueWithMess: dueOn,
      dueWithoutMess: dueOff,
      messSumCard: document.getElementById('pf-sum-mess')?.textContent,
    };
  });
  console.log('PAYMODAL ' + JSON.stringify(pm));

  console.log('ERRORS ' + JSON.stringify(errs));
  expect(rm.renderError).toBe(false);
  expect(rt.renderError).toBe(false);
  await app.close();
});
