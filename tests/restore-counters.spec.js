// ════════════════════════════════════════════════════════════════════════════
// A restore never hands out a receipt number (or a student number) twice
// (bug audit BUG-014, 2026-09-28). Restoring an older file put the counters
// back to the file's values, so the next receipt reused a printed number.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');
const { settleFreshInstall } = require('./_fresh-install');

const launch = () => { const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env }); };
async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 60000 });
  await win.selectOption('#login-user', 'warden1'); await win.fill('#login-input', 'admin123'); await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 60000 });
}

test.beforeAll(() => { resetProfile(); });

test('restoring an older backup does not reissue receipt or student numbers', async () => {
  test.setTimeout(240000);
  let app = await launch(); let win = await app.firstWindow();
  try {
    await login(win); await settleFreshInstall(win);
    const r = await win.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const pay = id => ({ id, studentId: '001', studentName: 'A', roomNumber: DB.rooms[0].number, month: thisMonth(), date: today(), paidDate: today(), amount: 1000, unpaid: 0, overpaid: 0, status: 'Paid', method: 'Cash', monthlyRent: 1000, messCharge: 0, extraCharges: [], extraTotal: 0 });
      DB.settings.receiptCounter = 5; DB.settings.studentSeq = 3;
      DB.payments = [pay('pA')]; await saveDB();
      const older = JSON.stringify(DB);                       // the backup: counters 5 / 3
      // After the backup: three more receipts printed, two more students admitted.
      DB.payments.push(pay('pB'), pay('pC'), pay('pD'));
      const printed = ['pB', 'pC', 'pD'].map(_assignReceiptNo);
      DB.settings.studentSeq = 5; await saveDB();
      // Restore the older file through the Backup page.
      navigate('backup'); await wait(500);
      let input = document.getElementById('restore-file-input');
      if (!input) { input = document.createElement('input'); input.type = 'file'; input.id = 'restore-file-input'; document.body.appendChild(input); }
      const dt = new DataTransfer(); dt.items.add(new File([older], 'older.json', { type: 'application/json' }));
      input.files = dt.files;
      await restoreBackup(); await wait(600);
      if (typeof _pendingConfirmCb === 'function') _confirmYes();
      await wait(2500);
      DB.payments.push(pay('pE'));
      return { printed, next: _assignReceiptNo('pE'), nextStudent: nextStudentId() };
    });
    expect(r.printed).toEqual(['RCP-000006', 'RCP-000007', 'RCP-000008']);
    expect(r.next, 'a printed receipt number was issued again').toBe('RCP-000009');
    expect(r.nextStudent).toBe('006');
  } finally { await app.close(); }
});
