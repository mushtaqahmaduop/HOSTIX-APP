// ════════════════════════════════════════════════════════════════════════════
// The ledger's immutability, held on the MAIN-PROCESS side of the bridge.
//
// The owner's requirement is that nobody — warden or admin — can quietly alter
// a recorded collection. A rule enforced only by the screens is a rule any
// other screen can forget, so this file skips the renderer entirely and calls
// the bridge the way a bug in another module would:
//
//   electronAPI.dbUpsert('ledger', id, changedRecord)   → refused
//   electronAPI.dbDelete('ledger', id)                   → refused
//   electronAPI.dbBulkReplace('ledger', fewerRows)       → never deletes
//
// Two things must still work, or the guard is a data-loss bug of its own:
// an identical resend (saveDB's full-rewrite fallback sends every row), and a
// restore, which legitimately replaces the whole database and is the one
// sanctioned exception — it takes a pre-restore snapshot first.
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
}

test.describe.configure({ mode: 'serial' });

let app, win;

test.beforeAll(async () => {
  resetProfile();
  app = await electron.launch(launchOpts());
  win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);
});

test.afterAll(async () => { if (app) await app.close(); });

const ENTRY = {
  id: 'lg_guard_1', type: 'payment', paymentId: 'p_guard', studentId: 's_guard',
  month: '2026-09', amount: 5000, method: 'Cash', date: '2026-09-14',
  byId: 'warden1', byName: 'Guard Warden', source: 'collect',
  createdAt: '2026-09-14T09:00:00.000Z',
};

test('a new ledger row is accepted, and an identical resend is harmless', async () => {
  const r = await win.evaluate(async (entry) => {
    const first  = await window.electronAPI.dbUpsert('ledger', entry.id, entry);
    const second = await window.electronAPI.dbUpsert('ledger', entry.id, entry);
    const rows   = await window.electronAPI.dbAll('ledger');
    return { first, second, count: rows.filter(x => x.id === entry.id).length };
  }, ENTRY);

  expect(r.first.ok, 'a brand-new ledger entry was refused').toBe(true);
  expect(r.second.ok, 'an identical resend was refused — saveDB\'s fallback would fail every save').toBe(true);
  expect(r.count).toBe(1);
});

test('changing a recorded amount is refused by the main process', async () => {
  const r = await win.evaluate(async (entry) => {
    const altered = Object.assign({}, entry, { amount: 500 });
    const res  = await window.electronAPI.dbUpsert('ledger', entry.id, altered);
    const rows = await window.electronAPI.dbAll('ledger');
    return { res, stored: rows.find(x => x.id === entry.id) };
  }, ENTRY);

  expect(r.res.ok, 'the main process let a recorded ledger amount be overwritten').toBe(false);
  expect(r.stored.amount, 'the stored amount changed despite the refusal').toBe(5000);
});

test('re-attributing an entry to another warden is refused too', async () => {
  const r = await win.evaluate(async (entry) => {
    const altered = Object.assign({}, entry, { byId: 'u_other', byName: 'Someone Else' });
    const res  = await window.electronAPI.dbUpsert('ledger', entry.id, altered);
    const rows = await window.electronAPI.dbAll('ledger');
    return { res, stored: rows.find(x => x.id === entry.id) };
  }, ENTRY);

  expect(r.res.ok, 'a collection could be moved onto another warden').toBe(false);
  expect(r.stored.byId).toBe('warden1');
});

test('deleting a ledger row is refused', async () => {
  const r = await win.evaluate(async (entry) => {
    const res  = await window.electronAPI.dbDelete('ledger', entry.id);
    const rows = await window.electronAPI.dbAll('ledger');
    return { res, still: rows.some(x => x.id === entry.id) };
  }, ENTRY);

  expect(r.res.ok, 'the main process deleted a ledger entry').toBe(false);
  expect(r.still, 'the entry is gone').toBe(true);
});

test('a bulk rewrite adds new rows but never removes or alters existing ones', async () => {
  const r = await win.evaluate(async (entry) => {
    const extra = Object.assign({}, entry, { id: 'lg_guard_2', amount: 700 });
    // Leaves the first entry out entirely: a plain DELETE-then-INSERT would lose it.
    const res  = await window.electronAPI.dbBulkReplace('ledger', [extra]);
    const rows = await window.electronAPI.dbAll('ledger');
    const altered = Object.assign({}, entry, { amount: 1 });
    const res2 = await window.electronAPI.dbBulkReplace('ledger', [altered]);
    const rows2 = await window.electronAPI.dbAll('ledger');
    return {
      res, ids: rows.map(x => x.id).sort(),
      res2, firstAmount: rows2.find(x => x.id === entry.id).amount,
    };
  }, ENTRY);

  expect(r.res.ok, 'a bulk write of new rows was refused').toBe(true);
  expect(r.ids, 'a bulk rewrite removed an existing ledger entry').toEqual(['lg_guard_1', 'lg_guard_2']);
  expect(r.res2.ok, 'a bulk rewrite that alters an entry was accepted').toBe(false);
  expect(r.firstAmount).toBe(5000);
});

test('the other tables are untouched by the guard', async () => {
  const r = await win.evaluate(async () => {
    const rec = { id: 'guard_exp', date: '2026-09-14', category: 'Other', amount: 100 };
    const a = await window.electronAPI.dbUpsert('expenses', rec.id, rec);
    const b = await window.electronAPI.dbUpsert('expenses', rec.id, Object.assign({}, rec, { amount: 200 }));
    const c = await window.electronAPI.dbDelete('expenses', rec.id);
    return [a.ok, b.ok, c.ok];
  });
  expect(r, 'the ledger guard leaked onto an ordinary table').toEqual([true, true, true]);
});

test('a full backup carries the ledger', async () => {
  const r = await win.evaluate(async () => {
    const out = await window.electronAPI.dbExportFull();
    return Array.isArray(out.data.ledger) ? out.data.ledger.map(x => x.id).sort() : null;
  });
  expect(r, 'dbExportFull has no ledger table').not.toBeNull();
  expect(r).toContain('lg_guard_1');
});

test('a restore replaces the ledger — the one sanctioned exception — with a snapshot first', async () => {
  const r = await win.evaluate(async () => {
    const doc = {
      students: [], rooms: [{ id: 'gr1', number: '1', typeId: '2s' }], payments: [],
      ledger: [{ id: 'lg_restored', type: 'payment', paymentId: 'px', amount: 42,
                 byId: null, byName: 'From Backup', createdAt: '2026-01-01T00:00:00.000Z' }],
    };
    const res  = await window.electronAPI.dbImportFull(doc);
    const rows = await window.electronAPI.dbAll('ledger');
    return { res, ids: rows.map(x => x.id) };
  });
  expect(r.res.ok, 'a genuine restore carrying a ledger was refused').toBe(true);
  expect(r.res.preRestoreBackup, 'a restore replaced the ledger without a snapshot').toBeTruthy();
  expect(r.ids).toEqual(['lg_restored']);
});

test('a collection recorded in the app reaches the ledger on disk, attributed to the session', async () => {
  const r = await win.evaluate(async () => {
    await loadDB();
    DB.students.push({ id: 's_live', name: 'Live Student', roomId: DB.rooms[0].id, status: 'Active' });
    const p = { id: 'p_live', studentId: 's_live', studentName: 'Live Student', month: '2026-09',
                amount: 0, monthlyRent: 8000, unpaid: 8000, status: 'Pending', method: 'Cash',
                date: '2026-09-14' };
    DB.payments.push(p);
    applyPayment(p, { amount: 3000, method: 'Cash', note: 'guard' });
    await saveDB();
    // A second path, outside applyPayment: the Edit form raising the amount.
    p.amount = 5000;
    await saveDB();
    const rows = (await window.electronAPI.dbAll('ledger')).filter(x => x.paymentId === 'p_live');
    return { rows: rows.map(x => ({ type: x.type, amount: x.amount, byId: x.byId, source: x.source })),
             role: CUR_ROLE };
  });

  expect(r.rows.length, 'the collections did not reach the ledger table').toBe(2);
  const net = r.rows.reduce((s, x) => s + (x.type === 'payment' ? x.amount : -x.amount), 0);
  expect(net, 'the ledger on disk does not add up to the record').toBe(5000);
  r.rows.forEach(x => expect(x.byId, 'an entry is not attributed to the logged-in account').toBe(r.role));
  expect(r.rows.map(x => x.source).sort()).toEqual(['collect', 'sync']);
});
