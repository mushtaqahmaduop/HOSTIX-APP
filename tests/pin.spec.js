// ════════════════════════════════════════════════════════════════════════════
// PIN to confirm money on screen (warden ledger spec §3.5, §5 step 10).
//
// tests/pin.test.js proves the rules. This proves the screens: the tick in the
// user editor, the first posting setting the PIN (and Cancel posting nothing),
// Mark paid asking for it (a wrong PIN changes nothing, no limit), an admin
// clearing it from the account panel, Set / Change my PIN on My Account, and
// that every PIN box has the show/hide eye.
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
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForFunction(
    () => typeof _ledgerReady !== 'undefined' && _ledgerReady === true, null, { timeout: 30000 });
}

const actAs = (win, id) => win.evaluate(id => {
  CUR_ROLE = id; CUR_USER = WARDENS[id];
  if (typeof applyPermissionsToChrome === 'function') applyPermissionsToChrome();
}, id);

const layer = win => win.evaluate(() => {
  const l = document.getElementById('pin-layer');
  if (!l) return null;
  const pw = l.querySelectorAll('input[type="password"], input[data-pw-eye]');
  return { title: l.querySelector('#pin-title').textContent,
           err: l.querySelector('#pin-err').textContent,
           boxes: pw.length, eyes: l.querySelectorAll('.pw-eye__btn').length };
});

test.beforeAll(() => { resetProfile(); });

test('PIN: switched on per account, set on first use, asked for money, cleared by an admin', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    await win.evaluate(async () => {
      DB.settings.serviceModel = 'rent_mess_optional';
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 10000; rt.defaultMess = 7000;
      DB.rooms = [{ id: 'rmN', number: 'N1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuN', name: 'Pin Student', roomId: 'rmN', status: 'Active', messOptIn: true,
                       joinDate: '2026-01-01', paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = []; DB.concessions = [];
      await saveDB();
      WARDENS.w_sara = { username: 'sara', name: 'Sara Warden', active: true,
        perms: { add: true, edit: true, payments: true, reports: true },
        pw: await hashNewPassword('Sara@12345') };
      saveWardenConfig();
    });

    // ── The admin ticks "Require PIN" in the user editor ───────────────────
    await win.evaluate(() => { navigate('users'); showUserEditor('w_sara'); });
    await win.waitForSelector('#u-pin-req', { state: 'attached', timeout: 15000 });
    expect(await win.evaluate(() => document.getElementById('u-pin-req').checked), 'PIN was on by default').toBe(false);
    await win.evaluate(() => { document.getElementById('u-pin-req').checked = true; });
    await win.locator('#u-pin-req').scrollIntoViewIfNeeded();
    await win.locator('.modal').screenshot({ path: path.join(REPO_ROOT, '.shots', 'step10-user-editor.png') });
    await win.evaluate(() => saveUser('w_sara'));
    await win.waitForFunction(() => WARDENS.w_sara.pinRequired === true, null, { timeout: 10000 });

    // ── Sara's first posting: Set your PIN; Cancel posts nothing ───────────
    await actAs(win, 'w_sara');
    await win.evaluate(() => navigate('addpayment'));
    await win.waitForSelector('#f-pro-seg', { state: 'visible', timeout: 15000 });
    await win.evaluate(() => selectStudentForPayment('stuN'));
    await win.fill('#f-ppaid', '5000');
    await win.evaluate(() => { submitAddPayment(); });
    await win.waitForSelector('#pin-layer', { state: 'attached', timeout: 10000 });
    let l = await layer(win);
    expect(l.title).toBe('Set your PIN');
    expect(l.eyes, 'a PIN box has no show/hide eye').toBe(l.boxes);
    await win.click('#pin-layer [data-pin="cancel"]');
    await win.waitForTimeout(400);
    expect(await win.evaluate(() => DB.payments.length), 'Cancel posted the payment').toBe(0);

    await win.evaluate(() => { submitAddPayment(); });
    await win.waitForSelector('#pin-layer', { state: 'attached', timeout: 10000 });
    await win.fill('#pin-new', '12');
    await win.click('#pin-layer [data-pin="ok"]');
    expect((await layer(win)).err).toContain('4 digits');
    await win.fill('#pin-new', '4821');
    await win.fill('#pin-again', '4821');
    await win.click('#pin-layer [data-pin="ok"]');
    await win.waitForFunction(() => DB.payments.length === 1, null, { timeout: 15000 });
    const stored = await win.evaluate(() => JSON.stringify(WARDENS.w_sara.pin || null));
    expect(stored).not.toBe('null');
    expect(stored.includes('4821'), 'the PIN was stored as typed').toBe(false);

    // ── Mark paid asks; a wrong PIN changes nothing, the right one collects ─
    const pid = await win.evaluate(() => DB.payments[0].id);
    await win.evaluate(id => { navigate('payments'); markPaymentPaid(id); }, pid);
    await win.waitForSelector('#pin-layer', { state: 'attached', timeout: 10000 });
    expect((await layer(win)).title).toBe('Confirm with your PIN');
    await win.locator('#pin-layer .modal').screenshot({ path: path.join(REPO_ROOT, '.shots', 'step10-pin-confirm.png') });
    for (const wrong of ['0000', '1111', '2222']) {
      await win.fill('#pin-new', wrong);
      await win.click('#pin-layer [data-pin="ok"]');
      await win.waitForFunction(() => /Wrong PIN/.test(document.getElementById('pin-err').textContent), null, { timeout: 10000 });
    }
    expect(await win.evaluate(() => DB.payments[0].status), 'a wrong PIN collected the money').toBe('Pending');
    await win.fill('#pin-new', '4821');
    await win.click('#pin-layer [data-pin="ok"]');
    await win.waitForFunction(() => DB.payments[0].status === 'Paid', null, { timeout: 15000 });
    expect(await win.evaluate(() => !!document.getElementById('pin-layer'))).toBe(false);

    // ── The admin clears it from Sara's account panel ──────────────────────
    await actAs(win, 'warden1');
    await win.evaluate(() => { navigate('users'); showAccountPanel('w_sara'); });
    await win.waitForSelector('#usr-pin-clear', { timeout: 15000 });
    await win.click('#usr-pin-clear');
    await win.click('.modal-footer .btn-danger');
    await win.waitForFunction(() => !WARDENS.w_sara.pin, null, { timeout: 10000 });
    await win.evaluate(() => closeAccountPanel());

    // ── My Account: Set my PIN, then Change my PIN asks for the current one ─
    await actAs(win, 'w_sara');
    await win.evaluate(() => showAccountPanel('w_sara'));
    await win.waitForSelector('#usr-pin-set', { timeout: 15000 });
    expect(await win.locator('#usr-pin-set').textContent()).toContain('Set my PIN');
    await win.click('#usr-pin-set');
    await win.waitForSelector('#usr-pin-1', { state: 'attached', timeout: 10000 });
    expect(await win.evaluate(() => document.querySelectorAll('.modal .pw-eye__btn').length)).toBe(2);
    await win.fill('#usr-pin-1', '5555');
    await win.fill('#usr-pin-2', '5555');
    await win.click('#usr-pin-save');
    await win.waitForFunction(() => pinHasOne(WARDENS.w_sara), null, { timeout: 10000 });

    await win.evaluate(() => usrPinShowSet());
    await win.waitForSelector('#usr-pin-cur', { state: 'attached', timeout: 10000 });
    await win.fill('#usr-pin-cur', '9999');
    await win.fill('#usr-pin-1', '6666');
    await win.fill('#usr-pin-2', '6666');
    await win.click('#usr-pin-save');
    await win.waitForTimeout(600);
    expect(await win.evaluate(() => pinCheck('w_sara', '5555')), 'a wrong current PIN changed it').toBe(true);
    await win.fill('#usr-pin-cur', '5555');
    await win.click('#usr-pin-save');
    await win.waitForFunction(() => pinCheck('w_sara', '6666'), null, { timeout: 10000 });

    // An account without the tick is never asked.
    await actAs(win, 'warden1');
    expect(await win.evaluate(() => pinConfirm({ what: 'x' }))).toBe(true);
  } finally {
    await app.close();
  }
});
