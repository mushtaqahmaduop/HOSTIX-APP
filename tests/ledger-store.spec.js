// ════════════════════════════════════════════════════════════════════════════
// The student ledger on disk (warden ledger spec §2.1, §5 step 2).
//
// tests/ledger.test.js proves what is posted. This proves the table keeps the
// spec's promise — "rows are never edited or deleted once created" — at the
// only boundary that counts, the main process (owner, 2026-09-14, schema Q4):
// the generic write channels refuse the table, an existing entry cannot be
// re-sent with different content, a restore replaces the table as a whole, and
// the entries survive a restart in the order they were created.
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
  // Boot has loaded the ledger and run the one-time import.
  await win.waitForFunction(
    () => typeof _ledgerReady !== 'undefined' && _ledgerReady === true && Array.isArray(DB.studentLedger),
    null, { timeout: 30000 });
}

test.beforeAll(() => { resetProfile(); });

const RENT = 8000, MESS = 6500, FULL = RENT + MESS;

/* One student in one priced room and no payment records. Retried until it
   sticks: on a cold profile the first-boot room seeding can save over it. */
async function seed(win) {
  const write = () => win.evaluate(async ([rent, mess]) => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s');
    rt.defaultRent = rent; rt.defaultMess = mess;
    DB.rooms = [{ id: 'rmL', number: 'L1', floor: 'Ground', typeId: '2s',
                  studentIds: [], amenities: [], notes: '', rent }];
    DB.students = [{ id: 'stuL', name: 'Ledger Student', roomId: 'rmL', rent, mess,
                     messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' }];
    DB.payments = [];
    DB.cancellations = [];
    await saveDB();
  }, [RENT, MESS]);
  await write();
  const holds = () => win.evaluate(() =>
    DB.students.length === 1 && DB.students[0].id === 'stuL' && DB.payments.length === 0);
  for (let i = 0; i < 10 && !(await holds()); i++) { await win.waitForTimeout(300); await write(); }
  expect(await holds()).toBe(true);
}

test('entries are posted with the save, refuse change, restore whole, and survive a restart', async () => {
  let app = await electron.launch(launchOpts());
  let win = await app.firstWindow();
  try {
    await login(win);
    await seed(win);

    // Generate the month (a charge), then collect it through Mark Paid (a payment).
    await win.evaluate(async () => {
      await generateMonthlyRents();
      await markPaymentPaid(DB.payments[0].id);
    });

    const disk = await win.evaluate(() => window.electronAPI.ledgerAll());
    expect(disk.ok).toBe(true);
    expect(disk.entries.map(e => e.type)).toEqual(['charge', 'payment']);
    expect(disk.entries.map(e => e.amount)).toEqual([FULL, FULL]);
    expect(disk.entries.map(e => e.runningBalance)).toEqual([FULL, 0]);
    expect(disk.entries[1].createdBy).toBe('warden1');
    expect(await win.evaluate(() => ledgerDrift())).toEqual([]);

    // ── the generic channels refuse the table ─────────────────────────────
    const refused = await win.evaluate(async () => {
      const e = DB.studentLedger[0];
      const api = window.electronAPI;
      return {
        upsert: await api.dbUpsert('student_ledger', e.id, Object.assign({}, e, { amount: 1 })),
        del:    await api.dbDelete('student_ledger', e.id),
        bulk:   await api.dbBulkReplace('student_ledger', []),
        read:   await api.dbAll('student_ledger'),
      };
    });
    expect(refused.upsert.ok).toBe(false);
    expect(refused.del.ok).toBe(false);
    expect(refused.bulk.ok).toBe(false);
    expect(refused.read).toEqual([]);

    // ── append-only: same bytes again is a retry, different bytes is refused ─
    const append = await win.evaluate(async () => {
      const e = DB.studentLedger[0];
      const api = window.electronAPI;
      return {
        retry:   await api.ledgerAppend([e]),
        rewrite: await api.ledgerAppend([Object.assign({}, e, { amount: 1 })]),
        invalid: await api.ledgerAppend([Object.assign({}, e, { id: 'sl_zero', amount: 0 })]),
        after:   (await api.ledgerAll()).entries.map(x => x.amount),
      };
    });
    expect(append.retry.ok).toBe(true);
    expect(append.retry.inserted).toBe(0);
    expect(append.rewrite.ok).toBe(false);
    expect(append.rewrite.code).toBe('LEDGER_IMMUTABLE');
    expect(append.invalid.ok).toBe(false);
    expect(append.invalid.code).toBe('INVALID_LEDGER_ENTRY');
    expect(append.after).toEqual([FULL, FULL]);

    // ── the backup carries the ledger ──────────────────────────────────────
    const exported = await win.evaluate(() => window.electronAPI.dbExportFull());
    expect(exported.ok).toBe(true);
    expect(exported.data.student_ledger.map(e => e.type)).toEqual(['charge', 'payment']);

    // ── restoring a backup from before the ledger empties it; the renderer
    //    rebuilds it from the restored records ────────────────────────────────
    const rebuilt = await win.evaluate(async (data) => {
      delete data.student_ledger;
      const res = await window.electronAPI.dbImportFull(data);
      const emptied = (await window.electronAPI.ledgerAll()).entries.length;
      await loadDB();
      const posted = ledgerImportIfEmpty();
      await saveDB();
      const entries = (await window.electronAPI.ledgerAll()).entries;
      return { ok: res.ok, emptied, posted, entries, drift: ledgerDrift() };
    }, exported.data);
    expect(rebuilt.ok).toBe(true);
    expect(rebuilt.emptied).toBe(0);
    expect(rebuilt.posted).toBe(2);
    expect(rebuilt.entries.every(e => e.imported === true)).toBe(true);
    expect(rebuilt.drift).toEqual([]);

    // After a replace the table is guarded again.
    const guarded = await win.evaluate(async () => {
      const e = (await window.electronAPI.ledgerAll()).entries[0];
      return window.electronAPI.ledgerAppend([Object.assign({}, e, { reason: 'rewritten' })]);
    });
    expect(guarded.code).toBe('LEDGER_IMMUTABLE');

    // Reset All Data's path: a restore to empty, with nothing to rebuild from.
    const reset = await win.evaluate(async () => {
      const keep = DB.payments;
      DB.payments = []; DB.archive = [];
      const ok = await ledgerAdopt([]);
      const n = (await window.electronAPI.ledgerAll()).entries.length;
      DB.payments = keep;
      return { ok, n };
    });
    expect(reset.ok).toBe(true);
    expect(reset.n).toBe(0);

    // Rebuild once more so there is something to survive the restart.
    await win.evaluate(async () => { await ledgerAdopt([]); });
    expect((await win.evaluate(() => window.electronAPI.ledgerAll())).entries.length).toBe(2);
  } finally {
    await app.close();
  }

  // ── a restart loads the same entries, in the same order, and imports nothing ─
  app = await electron.launch(launchOpts());
  win = await app.firstWindow();
  try {
    await login(win);
    const back = await win.evaluate(() => ({
      types: DB.studentLedger.map(e => e.type),
      balances: DB.studentLedger.map(e => e.runningBalance),
      again: ledgerImportIfEmpty(),
      drift: ledgerDrift(),
    }));
    expect(back.types).toEqual(['charge', 'payment']);
    expect(back.balances).toEqual([14500, 0]);
    expect(back.again).toBe(0);
    expect(back.drift).toEqual([]);
  } finally {
    await app.close();
  }
});
