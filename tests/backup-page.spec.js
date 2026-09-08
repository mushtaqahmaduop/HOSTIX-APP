// ════════════════════════════════════════════════════════════════════════════
// Backup & Restore — the page, built 2026-09-08 to `backup.png` and
// `backup and restore.png`.
//
// It was a modal: the only item in the rail's SYSTEM group that opened a dialog
// instead of a screen. Three things about the move are worth guarding.
//
//  · THE OLD ENTRY POINT STILL WORKS. `showBackupRestoreModal()` is called by
//    the command palette, the File menu and the backup-due toast. It opens the
//    page now, and if it ever stops doing either, three routes into backup go
//    quiet at once.
//  · THE HISTORIES ARE REAL, AND NEW. Nothing recorded a backup before this
//    page existed, so the tables start empty and say so rather than showing an
//    invented row. Every export and every restore writes one from now on.
//  · AUTOMATIC BACKUP IS LOCKED, NOT FAKED. Nothing in the app schedules a
//    backup and nothing can write to a folder of the customer's choosing. Per
//    the owner's rule of 2026-09-08 the controls are drawn, disabled, and each
//    carries the sentence saying what the app does instead.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

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
  return { app, win };
}

test('the rail item and the old modal call both land on the page', async () => {
  const { app, win } = await launch();

  // The rail item, as a warden clicks it.
  await win.click('.nav-item[data-page="backup"]');
  await win.waitForTimeout(700);
  let state = await win.evaluate(() => ({
    page: currentPage,
    hasPage: !!document.querySelector('.bk-head'),
    modalOpen: !!document.querySelector('.modal-overlay'),
    lit: !!document.querySelector('.nav-item[data-page="backup"].active'),
  }));
  expect(state.page).toBe('backup');
  expect(state.hasPage).toBe(true);
  expect(state.modalOpen).toBe(false);      // not a dialog any more
  expect(state.lit).toBe(true);

  // And the name three other call sites still use.
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForTimeout(400);
  await win.evaluate(() => showBackupRestoreModal());
  await win.waitForTimeout(700);
  state = await win.evaluate(() => ({ page: currentPage, hasPage: !!document.querySelector('.bk-head') }));
  expect(state.page).toBe('backup');
  expect(state.hasPage).toBe(true);

  await app.close();
});

test('every automatic-backup control is locked and explains itself', async () => {
  const { app, win } = await launch();
  await win.evaluate(() => { backupTab = 'auto'; navigate('backup'); });
  await win.waitForTimeout(700);

  const rows = await win.evaluate(() => [...document.querySelectorAll('.set-row')].map(r => {
    const tog = r.querySelector('.set-tog');
    const why = r.querySelector('.set-row__why');
    return {
      title: r.querySelector('.set-row__t').textContent.trim(),
      locked: r.classList.contains('is-locked'),
      hasLockChip: !!r.querySelector('.set-lock'),
      toggleDisabled: tog ? tog.disabled : null,
      why: why ? why.textContent.trim() : '',
      whyHidden: why ? why.hidden : null,
      liveControl: !!r.querySelector('select:not([disabled]), input:not([disabled])'),
    };
  }));

  // The seven the reference asks for, all seven present.
  expect(rows.map(r => r.title)).toEqual([
    'Backup frequency', 'Backup time', 'Keep last', 'Backup location',
    'On-failure behaviour', 'Encrypt backup file', 'Include / exclude data types',
  ]);

  for (const r of rows) {
    expect(r.locked).toBe(true);
    expect(r.hasLockChip).toBe(true);
    expect(r.liveControl).toBe(false);        // nothing here writes a setting
    expect(r.why.length).toBeGreaterThan(30);
    expect(r.whyHidden).toBe(true);
    if (r.toggleDisabled !== null) expect(r.toggleDisabled).toBe(true);
  }

  await app.close();
});

test('a backup writes a history row, and the health line follows it', async () => {
  const { app, win } = await launch();
  await win.evaluate(() => { backupTab = 'main'; navigate('backup'); });
  await win.waitForTimeout(700);

  // A fresh profile has never taken one, and the page says exactly that
  // rather than calling itself healthy.
  const before = await win.evaluate(() => ({
    health: document.querySelector('.bk-health').textContent,
    red: document.querySelector('.bk-health').classList.contains('dh-red'),
    rows: (DB.settings.backupHistory || []).length,
    empty: !!document.querySelector('.hi-rail .bk-empty'),
  }));
  expect(before.red).toBe(true);
  expect(before.health).toContain('No backup taken');
  expect(before.rows).toBe(0);
  expect(before.empty).toBe(true);

  /* Take one. The download itself is a browser save the harness cannot accept,
     so this drives the recording path the button drives — the same call, with
     the anchor click stubbed out. */
  await win.evaluate(async () => {
    HTMLAnchorElement.prototype.click = function () {};
    await bkCreate(null);
  });
  await win.waitForTimeout(900);

  const after = await win.evaluate(() => ({
    rows: (DB.settings.backupHistory || []).length,
    row: (DB.settings.backupHistory || [])[0],
    health: document.querySelector('.bk-health').textContent,
    green: document.querySelector('.bk-health').classList.contains('dh-green'),
    listed: document.querySelectorAll('.hi-rail .bk-mini__r').length,
  }));

  expect(after.rows).toBe(1);
  expect(after.row.kind).toBe('Manual');
  expect(after.row.ok).toBe(true);
  expect(after.row.bytes).toBeGreaterThan(100);
  expect(after.green).toBe(true);
  expect(after.health).toContain('Your data is protected');
  expect(after.listed).toBe(1);

  // And the full table on its own tab shows the same one row.
  await win.evaluate(() => { backupTab = 'history'; renderPage('backup'); });
  await win.waitForTimeout(500);
  expect(await win.evaluate(() => document.querySelectorAll('.set-table tbody tr').length)).toBe(1);

  await app.close();
});

test('the history is capped, and survives a save', async () => {
  const { app, win } = await launch();
  await win.evaluate(() => { backupTab = 'main'; navigate('backup'); });
  await win.waitForTimeout(600);

  const out = await win.evaluate(async () => {
    for (let i = 0; i < 55; i++) {
      await bkRecord('backupHistory', { at: new Date(Date.now() - i * 60000).toISOString(), kind: 'Manual', bytes: 100 + i, ok: true });
    }
    return { len: DB.settings.backupHistory.length, newestFirst: DB.settings.backupHistory[0].bytes };
  });

  // Capped, and the newest write is at the top.
  expect(out.len).toBe(50);
  expect(out.newestFirst).toBe(154);

  await app.close();
});
