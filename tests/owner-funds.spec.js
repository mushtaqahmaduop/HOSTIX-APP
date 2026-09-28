// ════════════════════════════════════════════════════════════════════════════
// Owner Funds, step 1: a recorded movement survives a restart, a reversal is
// kept, and the dashboard's money does not move (renderer/src/owner-funds.js).
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');
const { settleFreshInstall } = require('./_fresh-install');

const REPO = path.join(__dirname, '..');
const ELECTRON = require('electron');

function launch() {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: ELECTRON,
    args: [REPO, '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env });
}
async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
  await win.selectOption('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 30000 });
}

test.beforeAll(() => { resetProfile(); });

test('a movement and its reversal are saved, and survive a restart', async () => {
  let app = await launch();
  let win = await app.firstWindow();
  try {
    await login(win);
    await settleFreshInstall(win);
    // The feature is opt-in (step 2): as if the control plane had switched it on.
    await win.evaluate(() => localStorage.setItem('hx_feat_on_ownerFunds', '1'));
    const r = await win.evaluate(async () => {
      const mo = thisMonth();
      const fundBefore = calcAvailableFund(mo);
      const a = ofAdd({ direction: 'in', amount: 100000, date: mo + '-05', category: 'emergency', method: 'Bank Transfer', refNo: 'TXN-1' });
      const b = ofAdd({ direction: 'out', amount: 40000, date: mo + '-06', category: 'pocket' });
      ofReverse(b.record, { reason: 'Recorded by mistake' });
      const saved = await saveDB();
      return { ok: a.ok && b.ok, saved, fundBefore, fundAfter: calcAvailableFund(mo) };
    });
    expect(r.ok).toBe(true);
    expect(r.saved).not.toBe(false);
    expect(r.fundAfter, 'Available Fund moved').toBe(r.fundBefore);
  } finally {
    await app.close();
  }

  app = await launch();
  win = await app.firstWindow();
  try {
    await login(win);
    const back = await win.evaluate(() => ({
      n: (DB.ownerFunds || []).length,
      live: ofTotals(thisMonth()),
      rev: (DB.ownerFunds || []).filter(r => r.reversed).map(r => r.reversed.reason),
      ref: ((DB.ownerFunds || []).find(r => r.direction === 'in') || {}).refNo,
    }));
    expect(back.n).toBe(2);
    expect(back.live.in).toBe(100000);
    expect(back.live.out, 'the reversed movement came back counting').toBe(0);
    expect(back.rev).toEqual(['Recorded by mistake']);
    expect(back.ref).toBe('TXN-1');
  } finally {
    await app.close();
  }
});

test('the Users page offers the permission only where the feature is on', async () => {
  const app = await launch();
  const win = await app.firstWindow();
  try {
    await login(win);
    const read = () => win.evaluate(() => {
      showUserEditor('warden1');
      const box = document.getElementById('up-ownerFunds');
      const card = box && box.closest('.usf-grp');
      const r = { exists: !!box, shown: !!(card && card.offsetParent), checked: !!(box && box.checked),
                  admin: WARDENS.warden1.perms.ownerFunds, role: usrRole(Object.assign({ id: 'warden1' }, WARDENS.warden1)) };
      closeModal();
      return r;
    });
    await win.evaluate(() => localStorage.removeItem('hx_feat_on_ownerFunds'));
    const off = await read();
    expect(off.exists, 'the box must still exist for the presets and the save').toBe(true);
    expect(off.shown).toBe(false);
    expect(off.admin, 'the built-in admin account holds the permission').toBe(true);
    expect(off.role).toBe('Super Admin');

    await win.evaluate(() => localStorage.setItem('hx_feat_on_ownerFunds', '1'));
    const on = await read();
    expect(on.shown).toBe(true);
    expect(on.checked).toBe(true);
  } finally {
    await app.close();
  }
});
