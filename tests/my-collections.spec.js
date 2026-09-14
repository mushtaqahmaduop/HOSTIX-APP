// ════════════════════════════════════════════════════════════════════════════
// My Collections and the Wardens view (warden ledger spec §5 step 3).
//
// tests/ledger.test.js proves what ledgerCollections() returns. This proves the
// Users page shows it to the right person: a warden without Manage users gets
// their own collections and no tabs instead of a lock; an administrator keeps
// the account list and gains the Wardens table; a reversal counts against the
// account that recorded it; every figure on screen is the helper's figure.
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

test.beforeAll(() => { resetProfile(); });

async function seed(win) {
  const write = () => win.evaluate(async () => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = 8000; rt.defaultMess = 6500;
    DB.rooms = [{ id: 'rmC', number: 'C1', floor: 'Ground', typeId: '2s',
                  studentIds: [], amenities: [], notes: '', rent: 8000 }];
    DB.students = [{ id: 'stuC', name: 'Collections Student', roomId: 'rmC', rent: 8000, mess: 6500,
                     messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' }];
    DB.payments = []; DB.cancellations = [];
    await saveDB();
  });
  await write();
  const holds = () => win.evaluate(() => DB.students.length === 1 && DB.students[0].id === 'stuC');
  for (let i = 0; i < 10 && !(await holds()); i++) { await win.waitForTimeout(300); await write(); }
  expect(await holds()).toBe(true);
}

/** Act as another account without going through the sign-in screen. */
const actAs = (win, id) => win.evaluate(id => {
  CUR_ROLE = id; CUR_USER = WARDENS[id];
  if (typeof applyPermissionsToChrome === 'function') applyPermissionsToChrome();
}, id);

const kpis = win => win.evaluate(() =>
  [...document.querySelectorAll('.usr-kpi__v')].map(e => e.textContent.trim()));

test('a warden sees their own collections; an administrator sees every account', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);
    await seed(win);

    // A warden account without Manage users.
    await win.evaluate(async () => {
      WARDENS.w_sara = { username: 'sara', name: 'Sara Warden', phone: '', active: true,
        perms: { add: true, edit: true, payments: true, reports: true },
        pw: await hashNewPassword('Sara@12345') };
      saveWardenConfig();
    });

    // Sara generates the month and collects twice.
    await actAs(win, 'w_sara');
    await win.evaluate(async () => {
      await generateMonthlyRents();
      const p = DB.payments[0];
      applyPayment(p, { amount: 5000, method: 'JazzCash' });
      applyPayment(p, { amount: 3000, method: 'Cash' });
      await saveDB();
    });

    // The administrator reverses 1,000 of it.
    await actAs(win, 'warden1');
    await win.evaluate(async () => {
      reversePayment(DB.payments[0], { amount: 1000, reason: 'Wrong amount keyed' });
      await saveDB();
    });

    // ── as Sara: her collections, no tabs, no lock ─────────────────────────
    await actAs(win, 'w_sara');
    await win.evaluate(() => navigate('users'));
    await win.waitForSelector('.usr-coltable', { timeout: 15000 });
    const sara = await win.evaluate(() => ({
      tabs: document.querySelectorAll('.set-tabs').length,
      lock: !!document.querySelector('.empty-state'),
      title: document.querySelector('.bk-head__t').textContent.trim(),
      rows: [...document.querySelectorAll('.usr-coltable tbody tr')].map(tr => tr.dataset.kind),
      amounts: [...document.querySelectorAll('.usr-coltable tbody .usr-amt')].map(e => e.textContent.trim()),
      handover: (() => { const b = document.getElementById('usr-handover'); return b ? b.disabled : null; })(),
      methods: [...document.querySelectorAll('.usr-method')].map(e =>
        e.querySelector('.pm-chip').textContent.trim() + '=' + e.querySelector('.usr-amt').textContent.trim()),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    expect(sara.tabs).toBe(0);
    expect(sara.lock).toBe(false);
    expect(sara.title).toBe('My Collections');
    expect(sara.rows).toEqual(['collected', 'collected']);
    expect(sara.amounts).toEqual(['Rs. 3,000', 'Rs. 5,000']);
    expect(sara.handover).toBe(true);
    expect(sara.methods).toEqual(['Cash=Rs. 3,000', 'JazzCash=Rs. 5,000']);
    expect(sara.overflow).toBe(false);
    expect(await kpis(win)).toEqual(['Rs. 8,000', 'Rs. 8,000', 'Rs. 8,000']);

    // The figures on screen are the helper's figures.
    const helper = await win.evaluate(() => ledgerCollectionTotals(ledgerCollections('w_sara')).holding);
    expect(helper).toBe(8000);

    // ── as the administrator: the account list is still the first tab ─────
    await actAs(win, 'warden1');
    await win.evaluate(() => { usersTab = 'users'; navigate('users'); });
    await win.waitForSelector('.set-tabs .set-tab', { timeout: 15000 });
    expect(await win.evaluate(() =>
      [...document.querySelectorAll('.set-tabs .set-tab')].map(t => t.textContent.trim())))
      .toEqual(['Users', 'Wardens', 'My Collections']);
    expect(await win.evaluate(() => !!document.querySelector('.usr-table:not(.usr-wtable)'))).toBe(true);

    // Wardens tab.
    await win.click('.set-tab[data-tab="wardens"]');
    await win.waitForSelector('.usr-wtable', { timeout: 15000 });
    const board = await win.evaluate(() => {
      const row = id => document.querySelector(`.usr-wtable tbody tr[data-account="${id}"]`);
      const text = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
      return {
        saraHold: text(row('w_sara') && row('w_sara').querySelector('.usr-hold')),
        adminHold: text(row('warden1') && row('warden1').querySelector('.usr-hold')),
        adminHandover: text(row('warden1') && row('warden1').lastElementChild),
        total: text(document.querySelector('.usr-wtable tfoot .usr-hold')),
        heads: [...document.querySelectorAll('.usr-wtable thead th')].map(th => th.textContent.trim()),
      };
    });
    expect(board.saraHold).toBe('Rs. 8,000');
    expect(board.adminHold).toBe('−Rs. 1,000');
    expect(board.adminHandover).toBe('Not needed');
    expect(board.total).toBe('Rs. 7,000');
    expect(board.heads).toEqual(['Account', 'Holding', 'Cash', 'JazzCash', 'Today', 'Last collection', 'Handover']);

    // Opening Sara shows her register in the rail.
    await win.click('.usr-wtable tbody tr[data-account="w_sara"]');
    await win.waitForSelector('.usr-wrail .usr-coltable', { timeout: 15000 });
    expect(await win.evaluate(() => document.querySelectorAll('.usr-wrail .usr-coltable tbody tr').length)).toBe(2);

    // The administrator's own list carries the reversal as its own row, with its reason.
    await win.click('.set-tab[data-tab="mine"]');
    // Wait for the redraw itself: the rail's register matches `.usr-coltable` too.
    await win.waitForFunction(() => {
      const t = document.querySelector('.bk-head__t');
      return t && t.textContent.trim() === 'My Collections' && !document.querySelector('.usr-wrail');
    }, null, { timeout: 8000 });
    const mine = await win.evaluate(() => {
      const tr = document.querySelector('.usr-coltable tbody tr');
      return {
        kind: tr.dataset.kind,
        text: tr.textContent.replace(/\s+/g, ' ').trim(),
        neg: !!tr.querySelector('.usr-amt.is-neg'),
        handover: !!document.getElementById('usr-handover'),
      };
    });
    expect(mine.kind).toBe('reversed');
    expect(mine.text).toContain('Reversed');
    expect(mine.text).toContain('Wrong amount keyed');
    expect(mine.text).toContain('−Rs. 1,000');
    expect(mine.neg).toBe(true);
    expect(mine.handover).toBe(false);
    expect(await win.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    // An account deleted after collecting keeps its row, and the Total does not move.
    await win.evaluate(() => {
      delete WARDENS.w_sara; saveWardenConfig();
      usersWardenSel = null; usersTab = 'wardens'; navigate('users');
    });
    await win.waitForSelector('.usr-wtable tbody tr[data-account="w_sara"]', { timeout: 15000 });
    const gone = await win.evaluate(() => {
      const row = document.querySelector('.usr-wtable tbody tr[data-account="w_sara"]');
      return {
        row: !!row,
        text: row ? row.textContent.replace(/\s+/g, ' ').trim() : '',
        total: document.querySelector('.usr-wtable tfoot .usr-hold').textContent.trim(),
      };
    });
    expect(gone.row).toBe(true);
    expect(gone.text).toContain('Sara Warden');
    expect(gone.text).toContain('Account deleted');
    expect(gone.total).toBe('Rs. 7,000');
  } finally {
    await app.close();
  }
});
