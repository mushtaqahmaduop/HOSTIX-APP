// ════════════════════════════════════════════════════════════════════════════
// Finance Phase 7 (audit G10) — one save, one transaction.
//
// saveDB() used to walk the tables and await an IPC call PER CHANGED ROW, then
// the settings, then the ledger. Every one of those was its own implicit
// transaction, so a failure partway through left part of a save on disk and
// lost the rest: a payment written while the student's balance was not, or
// money recorded with no ledger entry behind it.
//
// The whole save now goes as one changeset applied inside a single
// db.transaction(). These tests drive a REFUSAL the main process is guaranteed
// to make — the ledger's append-only guard — and then read the database back
// through db:all to prove nothing from that save survived.
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

/** What is actually on disk for one table, by id. */
const onDisk = (win, table, id) => win.evaluate(async ([t, i]) => {
  const res = await window.electronAPI.dbAll(t);
  const rows = (res && res.rows) || res || [];
  const list = Array.isArray(rows) ? rows : [];
  const hit = list.find(r => r && (r.id === i));
  return hit || null;
}, [table, id]);

test.beforeAll(() => { resetProfile(); });

test('a save is all of it or none of it', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    // The channel has to exist, or the rest of this test proves nothing.
    const wired = await win.evaluate(() => !!(window.electronAPI && window.electronAPI.dbApplyChangeset));
    expect(wired, 'db:applyChangeset is not exposed — the save is still per-row').toBe(true);

    // ── A committed starting point ─────────────────────────────────────────
    await win.evaluate(async () => {
      window.toast = () => {};
      DB.rooms = [{ id: 'rmA', number: 'A1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuA', name: 'Atomic Student', roomId: 'rmA', rent: 10000,
                       mess: 0, messOptIn: false, status: 'Active',
                       joinDate: thisMonth() + '-01', paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = [];
      await saveDB();
    });
    expect(await onDisk(win, 'students', 'stuA'), 'the starting point never committed').toBeTruthy();

    // ── A save the main process will refuse, carrying record changes too ───
    //
    // The ledger is append-only: an entry whose id already exists with
    // DIFFERENT bytes is rewriting history, and the main process refuses it.
    // The same save also renames a student and adds a payment. Neither may
    // survive the refusal.
    const refused = await win.evaluate(async () => {
      // One real entry, committed, so its id is on disk.
      const real = {
        id: 'sl_atomic_1', studentId: 'stuA', type: 'charge', amount: 5000,
        reason: 'Original entry', createdBy: null, createdByName: 'Test',
        approvedBy: null, receiptId: null, runningBalance: 5000,
        createdAt: new Date().toISOString(), month: thisMonth(),
        paymentRecordId: 'pAtomic', part: 'monthly',
      };
      let r = await window.electronAPI.ledgerAppend([real]);
      if (!r || r.ok === false) return { setup: false, error: r && r.error };

      // Now: change records in memory AND queue an entry that rewrites that id.
      DB.students[0].name = 'Renamed In A Doomed Save';
      DB.payments.push({ id: 'pAtomic', studentId: 'stuA', studentName: 'Atomic Student',
        month: monthLabel(thisMonth()), monthlyRent: 10000, totalRent: 10000, messCharge: 0,
        messIncluded: false, admissionFee: 0, concession: 0, extraCharges: [], extraTotal: 0,
        amount: 0, unpaid: 10000, status: 'Pending', method: 'Cash',
        date: thisMonth() + '-01', partialPayments: [] });

      const clash = Object.assign({}, real, { amount: 9999, reason: 'History rewritten' });
      const res = await window.electronAPI.dbApplyChangeset({
        tables: {
          students: { upsert: [DB.students[0]], remove: [] },
          payments: { upsert: [DB.payments[0]], remove: [] },
        },
        settings: DB.settings,
        ledger: [clash],
      });
      return { setup: true, ok: res && res.ok, code: res && res.code, error: res && res.error };
    });

    expect(refused.setup, 'could not seed the committed ledger entry: ' + refused.error).toBe(true);
    expect(refused.ok, 'the ledger let an existing entry be rewritten').toBe(false);

    // ── Nothing from that save is on disk ──────────────────────────────────
    const student = await onDisk(win, 'students', 'stuA');
    expect(student.name, 'the student rename committed although the save was refused')
      .toBe('Atomic Student');
    expect(await onDisk(win, 'payments', 'pAtomic'),
      'a payment row committed although the save was refused').toBeNull();

    // ── …and the ledger entry it tried to rewrite is untouched ─────────────
    const entry = await win.evaluate(async () => {
      const res = await window.electronAPI.ledgerAll();
      return ((res && res.entries) || []).find(e => e.id === 'sl_atomic_1') || null;
    });
    expect(entry, 'the committed ledger entry vanished').toBeTruthy();
    expect(entry.amount, 'the ledger entry was rewritten').toBe(5000);
    expect(entry.reason).toBe('Original entry');

    // ── A good save still commits, records and ledger together ─────────────
    const good = await win.evaluate(async () => {
      DB.students[0].name = 'Committed Student';
      const ok = await saveDB();
      return { ok, name: DB.students[0].name };
    });
    expect(good.ok).toBe(true);
    const after = await onDisk(win, 'students', 'stuA');
    expect(after.name).toBe('Committed Student');
    expect(await onDisk(win, 'payments', 'pAtomic'),
      'the payment queued earlier never reached disk on the next good save').toBeTruthy();
  } finally {
    await app.close();
  }
});

test('the ledger commits with the records that explain it, not after them', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    const out = await win.evaluate(async () => {
      window.toast = () => {};
      DB.settings.serviceModel = 'rent_mess_optional';
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 12000; rt.defaultMess = 0;
      DB.rooms = [{ id: 'rmB', number: 'B1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 12000 }];
      DB.students = [{ id: 'stuB', name: 'Ledger Student', roomId: 'rmB', rent: 12000,
                       mess: 0, messOptIn: false, status: 'Active',
                       joinDate: thisMonth() + '-01', paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = [];
      await saveDB();

      // Raising a bill queues ledger entries; the save must carry them.
      await generateMonthlyRents();
      const p = DB.payments[0];
      const res = await window.electronAPI.ledgerAll();
      const mine = ((res && res.entries) || []).filter(e => e.paymentRecordId === p.id);
      return { id: p.id, queued: (typeof ledgerPending === 'function') ? ledgerPending().length : -1,
               onDisk: mine.length };
    });

    expect(out.queued, 'entries were left queued after a successful save').toBe(0);
    expect(out.onDisk, 'the month was billed but nothing explains it in the ledger')
      .toBeGreaterThan(0);
    expect(await onDisk(win, 'payments', out.id),
      'the payment record did not reach disk').toBeTruthy();
  } finally {
    await app.close();
  }
});
