// ════════════════════════════════════════════════════════════════════════════
// Handing over cash and approving it (warden ledger spec §3.3, §5 step 4).
//
// tests/handovers.test.js proves the rules. This proves the screens drive them:
// a warden sends what they hold from My Collections; the administrator finds it
// in the Wardens queue and in the bell, unticks a line, counts per method, and
// can only approve once the count matches; the warden then sees the outcome.
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
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForFunction(
    () => typeof _ledgerReady !== 'undefined' && _ledgerReady === true, null, { timeout: 30000 });
}

test.beforeAll(() => { resetProfile(); });

async function seed(win) {
  const write = () => win.evaluate(async () => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = 8000; rt.defaultMess = 6500;
    DB.rooms = [{ id: 'rmH', number: 'H1', floor: 'Ground', typeId: '2s',
                  studentIds: [], amenities: [], notes: '', rent: 8000 }];
    DB.students = [{ id: 'stuH', name: 'Handover Student', roomId: 'rmH', rent: 8000, mess: 6500,
                     messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' }];
    DB.payments = []; DB.cancellations = [];
    DB.wardenCollections = []; DB.handovers = []; DB.handoverItems = [];
    await saveDB();
  });
  await write();
  const holds = () => win.evaluate(() => DB.students.length === 1 && DB.students[0].id === 'stuH');
  for (let i = 0; i < 10 && !(await holds()); i++) { await win.waitForTimeout(300); await write(); }
  expect(await holds()).toBe(true);
}

const actAs = (win, id) => win.evaluate(id => {
  CUR_ROLE = id; CUR_USER = WARDENS[id];
  if (typeof applyPermissionsToChrome === 'function') applyPermissionsToChrome();
}, id);

test('a warden hands over; the administrator counts, unticks a line and approves', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);
    await seed(win);
    await win.evaluate(async () => {
      WARDENS.w_sara = { username: 'sara', name: 'Sara Warden', phone: '', active: true,
        perms: { add: true, edit: true, payments: true, reports: true },
        pw: await hashNewPassword('Sara@12345') };
      saveWardenConfig();
    });

    // ── Sara collects and hands over from My Collections ─────────────────────
    await actAs(win, 'w_sara');
    await win.evaluate(async () => {
      await generateMonthlyRents();
      const p = DB.payments[0];
      applyPayment(p, { amount: 5000, method: 'Cash' });
      applyPayment(p, { amount: 3000, method: 'JazzCash' });
      await saveDB();
      navigate('users');
    });
    await win.waitForSelector('#usr-handover:not([disabled])', { timeout: 15000 });
    await win.click('#usr-handover');
    await win.waitForSelector('#ho-send-btn', { timeout: 10000 });
    const send = await win.evaluate(() => ({
      lines: document.querySelectorAll('.usr-ho-send tbody tr').length,
      say: document.getElementById('ho-send-sum').textContent.replace(/\s+/g, ' ').trim(),
      button: document.getElementById('ho-send-btn').textContent.trim(),
    }));
    expect(send.lines).toBe(2);
    expect(send.say).toContain('Rs. 8,000');
    expect(send.button).toBe('Send Rs. 8,000');
    await win.click('#ho-send-btn');
    await win.waitForSelector('.usr-hohist tbody tr', { timeout: 10000 });
    const sent = await win.evaluate(() => ({
      chip: document.querySelector('.usr-hohist tbody tr .lk-chip').textContent.trim(),
      kpis: [...document.querySelectorAll('.usr-kpi__v')].map(e => e.textContent.trim()),
      blocked: document.getElementById('usr-handover').disabled,
      takeBack: !!document.querySelector('.usr-hohist tbody tr .usr-ho-acts button'),
    }));
    expect(sent.chip).toBe('Waiting');
    expect(sent.kpis.slice(0, 2)).toEqual(['Rs. 0', 'Rs. 8,000']);
    expect(sent.blocked).toBe(true);
    expect(sent.takeBack).toBe(true);

    // ── the administrator: bell, queue, review ───────────────────────────────
    await actAs(win, 'warden1');
    expect(await win.evaluate(() => chromeAlerts().map(a => a.msg).join(' | ')))
      .toContain('Handover waiting from Sara Warden — Rs. 8,000');
    await win.evaluate(() => { usersTab = 'wardens'; navigate('users'); });
    await win.waitForSelector('.usr-hoq .usr-hoq-review', { timeout: 15000 });
    const saraWait = await win.evaluate(() =>
      document.querySelector('.usr-wtable tbody tr[data-account="w_sara"] .usr-wait').textContent.trim());
    expect(saraWait).toBe('Rs. 8,000');
    await win.click('.usr-hoq .usr-hoq-review');
    await win.waitForSelector('#ho-approve', { timeout: 10000 });

    // Untick the JazzCash line.
    await win.evaluate(() => {
      const box = [...document.querySelectorAll('.usr-ho-lines input[data-entry]')]
        .find(b => b.closest('tr').textContent.includes('JazzCash'));
      box.click();
    });
    const methods = await win.evaluate(() => _hoRev.methods);
    const iCash = methods.indexOf('Cash'), iJazz = methods.indexOf('JazzCash');
    expect(await win.evaluate(() => document.getElementById('ho-approve').disabled)).toBe(true);

    // A wrong count keeps Approve off and says so.
    await win.fill('#ho-cnt-' + iCash, '4500');
    await win.click('#ho-cnt-' + iJazz);
    await win.fill('#ho-cnt-' + iJazz, '0');
    const wrong = await win.evaluate(i => ({
      approve: document.getElementById('ho-approve').disabled,
      diff: document.getElementById('ho-diff-' + i).textContent.trim(),
    }), iCash);
    expect(wrong.approve).toBe(true);
    expect(wrong.diff).toBe('Short Rs. 500');

    // The right count — typed for Cash, Matches for JazzCash.
    await win.fill('#ho-cnt-' + iCash, '5000');
    await win.evaluate(i => usrHoMatch(i), iJazz);
    const ready = await win.evaluate(() => ({
      approve: document.getElementById('ho-approve').disabled,
      label: document.getElementById('ho-approve').textContent.trim(),
      say: document.getElementById('ho-summary').textContent.replace(/\s+/g, ' ').trim(),
    }));
    expect(ready.approve).toBe(false);
    expect(ready.label).toBe('Approve Rs. 5,000');
    expect(ready.say).toContain('1 line (Rs. 3,000) goes back to Sara Warden');
    await win.click('#ho-approve');
    await win.waitForSelector('.usr-hoq .usr-none', { timeout: 10000 });

    const after = await win.evaluate(() => {
      const h = DB.handovers[0];
      return {
        label: hoLabel(h), approved: h.approvedAmount, admin: h.adminName, how: h.countedHow,
        saraToHand: document.querySelector('.usr-wtable tbody tr[data-account="w_sara"] .usr-hold').textContent.trim(),
        disk: null,
      };
    });
    expect(after.label).toBe('Part approved');
    expect(after.approved).toBe(5000);
    expect(after.how).toEqual({ Cash: 'typed', JazzCash: 'matched' });
    expect(after.saraToHand).toBe('Rs. 3,000');

    // Saved, not only in memory.
    const onDisk = await win.evaluate(async () => {
      const rows = await window.electronAPI.dbAll('handovers');
      return rows.map(h => h.status + ':' + h.approvedAmount);
    });
    expect(onDisk).toEqual(['approved:5000']);

    // ── Sara sees the outcome, and the bell stops once she has ───────────────
    await actAs(win, 'w_sara');
    expect(await win.evaluate(() => chromeAlerts().map(a => a.msg).join(' | ')))
      .toContain('Your handover of Rs. 8,000 was part approved');
    await win.evaluate(() => navigate('users'));
    await win.waitForSelector('.usr-hohist tbody tr', { timeout: 10000 });
    expect(await win.evaluate(() => document.querySelector('.usr-hohist tbody tr .lk-chip').textContent.trim()))
      .toBe('Part approved');
    await win.waitForFunction(() => !chromeAlerts().some(a => /part approved/.test(a.msg)), null, { timeout: 5000 });
    expect(await win.evaluate(() => document.getElementById('usr-handover').disabled)).toBe(false);
    expect(await win.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    // ── the Handover column says where the money stands (owner, 2026-09-14) ──
    const handoverCell = () => win.evaluate(() => {
      const row = document.querySelector('.usr-wtable tbody tr[data-account="w_sara"]');
      return row ? row.lastElementChild.textContent.trim() : null;
    });
    await actAs(win, 'warden1');
    await win.evaluate(() => { usersTab = 'wardens'; usersWardenSel = null; navigate('users'); });
    await win.waitForSelector('.usr-wtable tbody tr[data-account="w_sara"]', { timeout: 10000 });
    expect(await handoverCell()).toBe('To hand over');   // the returned Rs 3,000

    await actAs(win, 'w_sara');
    await win.evaluate(async () => { const r = hoSend('w_sara'); if (!r.ok) throw new Error(r.reason); await saveDB(); });
    await actAs(win, 'warden1');
    await win.evaluate(async () => {
      const h = DB.handovers.find(x => x.wardenId === 'w_sara' && x.status === 'pending');
      const r = hoApprove(h.id, { ticked: hoItems(h.id).map(x => x.item.ledgerEntryId),
                                  counted: { JazzCash: '3000' }, how: { JazzCash: 'typed' } });
      if (!r.ok) throw new Error(r.reason);
      await saveDB();
      usersTab = 'wardens'; usersWardenSel = null; navigate('users');
    });
    await win.waitForFunction(() => {
      const row = document.querySelector('.usr-wtable tbody tr[data-account="w_sara"]');
      return row && row.lastElementChild.textContent.trim() === 'Cleared';
    }, null, { timeout: 10000 });
    expect(await win.evaluate(() => document.querySelector(
      '.usr-wtable tbody tr[data-account="w_sara"] td:last-child .lk-chip').className)).toContain('dh-green');
  } finally {
    await app.close();
  }
});
