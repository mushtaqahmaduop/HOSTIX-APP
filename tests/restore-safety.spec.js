// ════════════════════════════════════════════════════════════════════════════
// One safe restore, whichever button starts it (bug audit 2026-09-28).
//
//   BUG-009  The Backup page's "Restore this file" (and pasted JSON) replaced
//            the data in memory and saved it like an edit: no pre-restore
//            safety copy, and not the shared validator.
//   BUG-010  A file downloaded from the Backup page (camelCase keys) imported
//            through File → Import said "imported successfully" and emptied
//            Owner Funds, the activity log and bill splits.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { resetProfile } = require('./_profile');
const { settleFreshInstall } = require('./_fresh-install');

const PROFILE = () => process.env.HOSTIX_TEST_PROFILE;
const launch = () => { const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + PROFILE(), '--no-sandbox', '--disable-gpu'], env }); };
async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 60000 });
  await win.selectOption('#login-user', 'warden1'); await win.fill('#login-input', 'admin123'); await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 60000 });
}
const snapshots = () => fs.readdirSync(PROFILE()).filter(f => /\.pre-restore-.*\.bak$/.test(f)).length;
// Put a file into the Backup page's own picker and press its Restore.
const restoreViaPage = (win, text) => win.evaluate(async (text) => {
  navigate('backup'); await new Promise(r => setTimeout(r, 500));
  let input = document.getElementById('restore-file-input');
  if (!input) { input = document.createElement('input'); input.type = 'file'; input.id = 'restore-file-input'; document.body.appendChild(input); }
  const dt = new DataTransfer(); dt.items.add(new File([text], 'hostel-backup.json', { type: 'application/json' }));
  input.files = dt.files;
  await restoreBackup(); await new Promise(r => setTimeout(r, 600));
  if (typeof _pendingConfirmCb === 'function') _confirmYes();
  await new Promise(r => setTimeout(r, 2000));
}, text);

test.beforeAll(() => { resetProfile(); });

test('restore: a safety copy first, every table back, and a hostile file refused', async () => {
  test.setTimeout(300000);
  let app = await launch(); let win = await app.firstWindow();
  let pageJson;
  try {
    await login(win); await settleFreshInstall(win);
    pageJson = await win.evaluate(async () => {
      localStorage.setItem('hx_feat_on_ownerFunds', '1');
      const room = DB.rooms[0];
      DB.students = [{ id: '001', name: 'Backed Up', fatherName: 'F', phone: '0300-0000001', roomId: room.id, status: 'Active', messOptIn: false, joinDate: '2026-01-01' }];
      DB.ownerFunds = []; ofAdd({ direction: 'in', amount: 5000, date: thisMonth() + '-03', category: 'shortfall' });
      DB.billSplits = [{ id: 'bs1', amount: 100 }];
      logActivity('Backup Marker', 'in the backup', 'Settings');
      await saveDB();
      return JSON.stringify(DB);                 // exactly what the Backup page downloads
    });
    // After the backup: a student the restore must take away.
    await win.evaluate(async () => {
      DB.students.push({ id: '002', name: 'After Backup', fatherName: 'F', phone: '0300-0000002', roomId: DB.rooms[0].id, status: 'Active', messOptIn: false, joinDate: '2026-02-01' });
      await saveDB();
    });

    // ── BUG-009: restore through the Backup page ──
    const before = snapshots();
    await restoreViaPage(win, pageJson);
    expect(snapshots(), 'no pre-restore safety copy was written').toBe(before + 1);

    // ── A hostile file through the same button is refused, nothing replaced ──
    const hostile = JSON.stringify(Object.assign(JSON.parse(pageJson), { students: [] }))
      .replace('"students":[]', '"students":[{"id":"666","name":"Evil","__proto__":{"polluted":true}}]');
    await restoreViaPage(win, hostile);
    const afterHostile = await win.evaluate(() => DB.students.map(s => s.name));
    expect(afterHostile, 'a hostile file replaced the data').toEqual(['Backed Up']);
  } finally { await app.close(); }

  // Across a restart: what the database really holds.
  app = await launch(); win = await app.firstWindow();
  try {
    await login(win);
    const held = await win.evaluate(() => ({
      students: DB.students.map(s => s.name),
      ownerFunds: (DB.ownerFunds || []).length,
      billSplits: (DB.billSplits || []).length,
      marker: (DB.activityLog || []).some(a => a.action === 'Backup Marker'),
    }));
    expect(held).toEqual({ students: ['Backed Up'], ownerFunds: 1, billSplits: 1, marker: true });

    // ── BUG-010: the same page-format file through File → Import's path ──
    const imp = await win.evaluate(async (text) => {
      DB.ownerFunds = []; DB.billSplits = []; await saveDB();
      const r = await window.electronAPI.dbImportFull(JSON.parse(text));
      return r && r.ok;
    }, pageJson);
    expect(imp).toBe(true);
  } finally { await app.close(); }

  app = await launch(); win = await app.firstWindow();
  try {
    await login(win);
    const viaImport = await win.evaluate(() => ({
      ownerFunds: (DB.ownerFunds || []).length,
      billSplits: (DB.billSplits || []).length,
      marker: (DB.activityLog || []).some(a => a.action === 'Backup Marker'),
    }));
    expect(viaImport, 'File → Import emptied tables from a Backup-page file').toEqual({ ownerFunds: 1, billSplits: 1, marker: true });
  } finally { await app.close(); }
});
