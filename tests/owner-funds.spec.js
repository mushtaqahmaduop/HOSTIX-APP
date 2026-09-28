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

/* ── step 3: the page ─────────────────────────────────────────────────────── */
test('the page: hidden when switched off; with it on, record, reverse and the statement', async () => {
  const app = await launch();
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', e => errors.push(e.message));
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);
    await win.evaluate(async () => {
      DB.ownerFunds = []; DB.expenses = []; DB.payments = [];
      if (DB.settings.security) DB.settings.security.pinOn = false;
      localStorage.removeItem('hx_feat_on_ownerFunds');
      await saveDB();
      applyPermissionsToChrome();
    });
    // Switched off: no rail item, and a direct visit is refused.
    const off = await win.evaluate(async () => {
      const nav = document.querySelector('.nav-item[data-page="ownerfunds"]');
      navigate('ownerfunds');
      await new Promise(r => setTimeout(r, 600));
      return { navShown: !!(nav && nav.offsetParent), page: document.getElementById('content').textContent };
    });
    expect(off.navShown).toBe(false);
    expect(off.page).toMatch(/Not included/);

    // Switched on.
    await win.evaluate(() => { localStorage.setItem('hx_feat_on_ownerFunds', '1'); applyPermissionsToChrome(); navigate('ownerfunds'); });
    await win.waitForTimeout(600);
    expect(await win.evaluate(() => !!document.querySelector('.nav-item[data-page="ownerfunds"]').offsetParent)).toBe(true);
    expect(await win.evaluate(() => document.getElementById('hdr-action-text').textContent)).toBe('Record Movement');

    // Record through the form: owner gave 100,000 for an emergency, by bank.
    const mo = await win.evaluate(() => thisMonth());
    await win.evaluate(() => headerAction());
    await win.waitForSelector('#of-amt');
    await win.fill('#of-amt', '100000');
    await win.selectOption('#of-cat', 'emergency');
    await win.selectOption('#of-method', 'Bank Transfer');
    await win.fill('#of-ref', 'TXN-9912');
    await win.evaluate(() => submitOwnerFund());
    await win.waitForTimeout(500);

    // …and owner took 40,000 pocket money: pick the direction card first.
    await win.evaluate(() => showOwnerFundModal());
    await win.waitForSelector('#of-amt');
    await win.click('.of-dirc[data-dir="out"]');
    expect(await win.evaluate(() => [...document.querySelectorAll('#of-cat option')].map(o => o.value)))
      .toEqual(['pocket', 'investment_out', 'own_bill', 'other_out']);
    await win.fill('#of-amt', '40000');
    await win.evaluate(() => submitOwnerFund());
    await win.waitForTimeout(500);

    // A bad amount is refused and nothing is written.
    await win.evaluate(() => showOwnerFundModal());
    await win.waitForSelector('#of-amt');
    await win.fill('#of-amt', '0');
    await win.evaluate(() => submitOwnerFund());
    expect(await win.evaluate(() => DB.ownerFunds.length)).toBe(2);
    await win.evaluate(() => closeModal());

    const page = await win.evaluate(() => ({
      rows: document.querySelectorAll('.of-table tbody tr').length,
      tiles: [...document.querySelectorAll('.ui-stat__v')].map(e => e.textContent.trim()),
      after: [...document.querySelectorAll('.of-st__row')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    }));
    expect(page.rows).toBe(2);
    expect(page.tiles.slice(0, 3)).toEqual(['Rs. 100,000', 'Rs. 40,000', '+Rs. 60,000']);
    expect(page.after.join(' | ')).toContain('Hostel money after owner+Rs. 60,000');

    // Reverse the pocket money through the window.
    const outId = await win.evaluate(() => DB.ownerFunds.find(r => r.direction === 'out').id);
    await win.evaluate(id => showReverseOwnerFund(id), outId);
    await win.waitForSelector('#of-rev-reason');
    await win.fill('#of-rev-reason', 'Entered by mistake');
    await win.evaluate(id => submitReverseOwnerFund(id), outId);
    await win.waitForTimeout(500);
    const afterRev = await win.evaluate(() => ({
      stored: DB.ownerFunds.length,
      took: document.querySelectorAll('.ui-stat__v')[1].textContent.trim(),
      rows: document.querySelectorAll('.of-table tbody tr').length,
    }));
    expect(afterRev).toEqual({ stored: 2, took: 'Rs. 0', rows: 1 });
    await win.evaluate(() => ofSet('showReversed', true));
    await win.waitForTimeout(500);
    expect(await win.evaluate(() => document.querySelectorAll('.of-table tr.is-reversed').length)).toBe(1);

    // The dashboard's money did not move.
    expect(await win.evaluate(mo => calcAvailableFund(mo), mo)).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

/* ── step 4: the reports ──────────────────────────────────────────────────── */
test('reports: an Owner funds tab, owner lines under Available Fund, and both exports — only where it is on', async () => {
  const app = await launch();
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', e => errors.push(e.message));
  try {
    await login(win);
    const r = await win.evaluate(async () => {
      const mo = thisMonth();
      DB.ownerFunds = []; DB.payments = [];
      DB.expenses = [{ id: 'e1', date: mo + '-10', category: 'Electricity', amount: 30000, description: 'Bill', method: 'Cash' }];
      localStorage.setItem('hx_feat_on_ownerFunds', '1');
      ofAdd({ direction: 'in', amount: 100000, date: mo + '-05', category: 'emergency', method: 'Bank Transfer' });
      ofAdd({ direction: 'out', amount: 40000, date: mo + '-06', category: 'pocket' });
      await saveDB();
      const tabs = () => [...document.querySelectorAll('.rpt-tab')].map(t => t.textContent.trim());
      reportMonth = mo; reportYearly = false; reportDetail = null;
      navigate('reports');
      await new Promise(res => setTimeout(res, 900));
      const onTabs = tabs();
      reportDetail = 'netprofit'; renderPage('reports');
      await new Promise(res => setTimeout(res, 700));
      const lines = (document.querySelector('.rpt-owner') || {}).textContent || '';
      reportDetail = 'ownerfunds'; renderPage('reports');
      await new Promise(res => setTimeout(res, 700));
      const tiles = [...document.querySelectorAll('.rpt-of__v')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
      const rows = document.querySelectorAll('#content tbody tr').length;
      const tabDef = _rptDetailDef('ownerfunds');
      const whole = _rptOverviewDef();
      const on = {
        onTabs, lines, tiles, rows,
        tabRows: tabDef.rows.length, tabGrand: tabDef.grand.value,
        tabSummary: tabDef.summary.map(x => x.label),
        wholeSection: whole.sections.some(x => x.title === 'Owner funds'),
        wholeSummary: whole.summary.map(x => x.label),
        fund: calcAvailableFund(mo),
      };
      // The documents themselves build — the PDF's HTML and the workbook.
      const tabHtml = exDocument(tabDef).html, wholeHtml = exDocument(whole).html;
      on.docs = {
        tabHtml: /Owner took/.test(tabHtml) && /Net owner funding/.test(tabHtml),
        wholeHtml: /Owner funds/.test(wholeHtml),
        tabBook: !!exWorkbook(_rptDetailDef('ownerfunds')),
        wholeBook: !!exWorkbook(_rptOverviewDef()),
      };
      // Switched off: none of it.
      localStorage.removeItem('hx_feat_on_ownerFunds');
      reportDetail = null; renderPage('reports');
      await new Promise(res => setTimeout(res, 700));
      const off = { tabs: tabs(), wholeSection: _rptOverviewDef().sections.some(x => x.title === 'Owner funds') };
      reportDetail = 'netprofit'; renderPage('reports');
      await new Promise(res => setTimeout(res, 700));
      off.lines = !!document.querySelector('.rpt-owner');
      return { on, off };
    });
    expect(r.on.onTabs).toContain('Owner funds');
    expect(r.on.lines).toMatch(/Owner gave \+Rs\. 100,000/);
    expect(r.on.lines).toMatch(/Hostel money after owner \+Rs\. 30,000/);   // -30,000 + 100,000 - 40,000
    expect(r.on.tiles[0]).toBe('−Rs. 30,000');
    expect(r.on.tiles[2]).toBe('+Rs. 30,000');
    expect(r.on.rows).toBe(2);
    expect(r.on.tabRows).toBe(2);
    expect(r.on.tabGrand).toBe('Rs. 60,000');
    expect(r.on.tabSummary).toEqual(['Revenue', 'Expenses', 'Profit / loss', 'Owner gave', 'Owner took', 'After owner']);
    expect(r.on.wholeSection).toBe(true);
    expect(r.on.wholeSummary).toContain('After owner');
    expect(r.on.wholeSummary).toContain('Available fund');
    expect(r.on.fund, 'Available Fund must not move').toBe(-30000);
    expect(r.on.docs).toEqual({ tabHtml: true, wholeHtml: true, tabBook: true, wholeBook: true });
    expect(r.off.tabs).not.toContain('Owner funds');
    expect(r.off.wholeSection).toBe(false);
    expect(r.off.lines).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

