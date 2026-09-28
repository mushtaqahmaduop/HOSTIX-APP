// ════════════════════════════════════════════════════════════════════════════
// A backup written before the issues merge keeps its issues across a restart
// (bug audit BUG-013, 2026-09-28). Reproduced before the fix: the restore showed
// the folded maintenance/complaints, the restart showed none — the fold's rows
// were never written, but its "done" stamp was, so it never ran again.
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path'); const { resetProfile } = require('./_profile');
const { settleFreshInstall } = require('./_fresh-install');
const launch = () => { const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env }); };
async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 60000 });
  await win.selectOption('#login-user', 'warden1'); await win.fill('#login-input', 'admin123'); await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 60000 });
}
test.beforeAll(() => { resetProfile(); });
test('a pre-merge backup keeps its maintenance and complaints across a restart', async () => {
  test.setTimeout(240000);
  let app = await launch(); let win = await app.firstWindow(); let r1;
  try {
    await login(win); await settleFreshInstall(win);
    r1 = await win.evaluate(async () => {
      const old = JSON.parse(JSON.stringify(DB));
      delete old.issues; delete old.settings.issuesMergedAt;
      old.maintenance = [{ id: 'm1', title: 'Leaking tap', roomNumber: DB.rooms[0].number, status: 'Open', date: '2026-08-01' }];
      old.complaints = [{ id: 'c1', subject: 'Noise', status: 'UnderReview', date: '2026-08-02' }, { id: 'c2', subject: 'Wifi', status: 'Resolved', date: '2026-08-03' }];
      DB.issues = [{ id: 'live1', kind: 'complaint', title: 'Live one', status: 'Open', seq: 1 }]; await saveDB();
      navigate('backup'); await new Promise(r => setTimeout(r, 500));
      let input = document.getElementById('restore-file-input');
      if (!input) { input = document.createElement('input'); input.type = 'file'; input.id = 'restore-file-input'; document.body.appendChild(input); }
      const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(old)], 'old.json', { type: 'application/json' }));
      input.files = dt.files;
      await restoreBackup(); await new Promise(r => setTimeout(r, 600));
      if (typeof _pendingConfirmCb === 'function') _confirmYes();
      await new Promise(r => setTimeout(r, 2500));
      return (DB.issues || []).map(i => i.id + ':' + i.kind + ':' + i.title + ':' + i.status + ':' + i.seq);
    });
  } finally { await app.close(); }
  app = await launch(); win = await app.firstWindow();
  try {
    await login(win);
    const r2 = await win.evaluate(async () => { navigate('issues'); await new Promise(r => setTimeout(r, 800));
      return { issues: (DB.issues || []).map(i => i.id + ':' + i.kind + ':' + i.title + ':' + i.status + ':' + i.seq), merged: DB.settings.issuesMergedAt || null,
        rows: document.querySelectorAll('#page-content tbody tr').length }; });
    const want = ['m1:maintenance:Leaking tap:Open:1', 'c1:complaint:Noise:InProgress:1', 'c2:complaint:Wifi:Resolved:2'];
    expect(r1).toEqual(want);
    expect(r2.issues.sort(), 'the restored issues were lost on restart').toEqual(want.slice().sort());
    expect(r2.merged).toBeTruthy();
  } finally { await app.close(); }
});
