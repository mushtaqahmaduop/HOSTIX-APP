// ════════════════════════════════════════════════════════════════════════════
// Amount lock and ownership on the payment screens (warden ledger spec §3.2,
// §5 step 6).
//
// tests/ownership.test.js proves the rules in ownership.js. This proves the
// screens ask them AND that every submit refuses on its own: a warden who did
// not collect sees the form view-only and cannot save it from the console; the
// collector's Amount paid, method and date are locked and a changed charge
// needs a reason; a reversal stays within what that warden collected; a record
// holding money cannot be deleted; the dashboard's month view no longer types
// over collected money.
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

const actAs = (win, id) => win.evaluate(id => {
  CUR_ROLE = id; CUR_USER = WARDENS[id];
  if (typeof applyPermissionsToChrome === 'function') applyPermissionsToChrome();
}, id);

test('collected money is locked, and only its collector or an admin may change it', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    // One student, one month; Sara collects 5,000, then Ali 3,000 — Ali owns it.
    const pid = await win.evaluate(async () => {
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 10000; rt.defaultMess = 7000;
      DB.rooms = [{ id: 'rmO', number: 'O1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuO', name: 'Owned Student', roomId: 'rmO', rent: 10000, mess: 7000,
                       messOptIn: true, status: 'Active', joinDate: '2026-01-01', paymentMethod: 'Cash' }];
      DB.payments = []; DB.cancellations = [];
      await saveDB();
      const perms = { add: true, edit: true, payments: true, reports: true, delete: true };
      WARDENS.w_sara = { username: 'sara', name: 'Sara Warden', active: true, perms: { ...perms },
                         pw: await hashNewPassword('Sara@12345') };
      WARDENS.w_ali  = { username: 'ali',  name: 'Ali Warden',  active: true, perms: { ...perms },
                         pw: await hashNewPassword('Ali@123456') };
      saveWardenConfig();
      CUR_ROLE = 'w_sara'; CUR_USER = WARDENS.w_sara;
      await generateMonthlyRents();
      const p = DB.payments[0];
      applyPayment(p, { amount: 5000, method: 'Cash' });
      CUR_ROLE = 'w_ali'; CUR_USER = WARDENS.w_ali;
      applyPayment(p, { amount: 3000, method: 'JazzCash' });
      await saveDB();
      return p.id;
    });

    // ── Sara did not take the latest money: view-only, and the submit refuses ──
    await actAs(win, 'w_sara');
    await win.evaluate(pid => showEditPaymentModal(pid), pid);
    await win.waitForSelector('#pef-lock');
    await win.waitForFunction(() => document.getElementById('f-pamt') && document.getElementById('f-pamt').disabled);
    const saraView = await win.evaluate(() => ({
      view:  document.getElementById('pef-lock').classList.contains('is-view'),
      text:  document.getElementById('pef-lock').textContent,
      save:  [...document.querySelectorAll('.modal-overlay button')].some(b => /Save Changes/.test(b.textContent)),
      rent:  document.getElementById('f-pamt').disabled,
    }));
    expect(saraView.view, 'the form is not view-only for a warden who did not collect last').toBe(true);
    expect(saraView.text).toContain('Collected by Ali Warden');
    expect(saraView.save, 'Save is offered on a view-only form').toBe(false);
    expect(saraView.rent).toBe(true);
    const saraForced = await win.evaluate(async pid => {
      document.getElementById('f-pamt').disabled = false;
      document.getElementById('f-pamt').value = '1';
      await submitEditPayment(pid);
      return DB.payments.find(p => p.id === pid).monthlyRent;
    }, pid);
    expect(saraForced, 'submitEditPayment let a non-owner change the bill').toBe(10000);
    await win.evaluate(() => closeModal());

    // ── Sara's row menu: view, reverse her own, delete disabled ─────────────
    const menu = await win.evaluate(pid => {
      const btn = document.createElement('button'); document.body.appendChild(btn);
      payRowMenu(pid, btn);
      const items = [...document.querySelectorAll('#lk-rmenu button')].map(b => ({
        t: b.querySelector('.lk-rmenu__lbl') ? b.querySelector('.lk-rmenu__lbl').firstChild.textContent : b.textContent.trim(),
        off: b.disabled }));
      lkCloseRowMenu(); btn.remove();
      return items;
    }, pid);
    expect(menu).toEqual([
      { t: 'View payment', off: false }, { t: 'Print receipt', off: false },
      { t: 'Reverse a collection', off: false }, { t: 'Delete payment', off: true },
    ]);

    // ── Reverse: within what the warden collected, and with a reason ─────────
    await actAs(win, 'w_ali');
    await win.evaluate(pid => showReversePaymentModal(pid), pid);
    await win.waitForSelector('#f-prev-amt');
    expect(await win.evaluate(() => document.getElementById('f-prev-amt').max)).toBe('3000');
    const rev = await win.evaluate(async pid => {
      const p = () => DB.payments.find(x => x.id === pid);
      document.getElementById('f-prev-amt').value = '4000';
      document.getElementById('f-prev-reason').value = 'Too much';
      await submitReversePayment(pid);
      const afterTooMuch = p().amount;
      document.getElementById('f-prev-amt').value = '1000';
      document.getElementById('f-prev-reason').value = '';
      await submitReversePayment(pid);
      const afterNoReason = p().amount;
      document.getElementById('f-prev-reason').value = 'Keyed 1,000 too much';
      await submitReversePayment(pid);
      return { afterTooMuch, afterNoReason, afterOk: p().amount };
    }, pid);
    expect(rev.afterTooMuch, 'a warden reversed more than they collected').toBe(8000);
    expect(rev.afterNoReason, 'a reversal went through without a reason').toBe(8000);
    expect(rev.afterOk).toBe(7000);

    // ── Ali (owner): Amount paid, method, month, date locked; a charge needs a reason
    await win.evaluate(() => closeModal());
    await win.evaluate(pid => showEditPaymentModal(pid), pid);
    await win.waitForSelector('#f-pedit-reason');
    const locks = await win.evaluate(() => ({
      paid:   document.getElementById('f-ppaid').readOnly,
      method: document.getElementById('f-pmethod').disabled,
      month:  document.getElementById('f-pmonth').disabled,
      date:   !document.getElementById('f-pdate').getAttribute('onclick'),
      view:   document.getElementById('pef-lock').classList.contains('is-view'),
      rent:   document.getElementById('f-pamt').value,
    }));
    expect(locks).toEqual({ paid: true, method: true, month: true, date: true, view: false, rent: '10000' });

    const edit = await win.evaluate(async pid => {
      const p = () => DB.payments.find(x => x.id === pid);
      document.getElementById('f-ppaid').value = '99999';          // ignored — locked
      document.getElementById('f-pamt').value = '9000'; recalcUnpaid();
      await submitEditPayment(pid);
      const noReason = p().monthlyRent;
      document.getElementById('f-pedit-reason').value = 'Rent lowered for a shared room';
      await submitEditPayment(pid);
      const adj = DB.studentLedger.filter(e => e.paymentRecordId === pid && e.type === 'adjustment').pop();
      return { noReason, rent: p().monthlyRent, amount: p().amount, method: p().method, reason: adj && adj.reason };
    }, pid);
    expect(edit.noReason, 'a charge changed without a reason').toBe(10000);
    expect(edit.rent).toBe(9000);
    expect(edit.amount, 'the locked Amount paid was saved over').toBe(7000);
    expect(edit.method, 'the locked method changed').toBe('JazzCash');
    expect(edit.reason).toContain('Rent lowered for a shared room');

    // ── Delete: refused for a record holding money, admin included ──────────
    await actAs(win, 'warden1');
    const del = await win.evaluate(async pid => {
      closeModal();
      await deletePayment(pid);
      await new Promise(r => setTimeout(r, 300));
      const asked = !!document.querySelector('.modal-overlay');
      closeModal();
      return { asked, still: DB.payments.some(p => p.id === pid) };
    }, pid);
    expect(del.asked, 'a delete confirmation opened for a record holding money').toBe(false);
    expect(del.still).toBe(true);

    // ── The dashboard month view does not type over collected money ─────────
    const cell = await win.evaluate(async pid => {
      const span = document.createElement('span'); document.body.appendChild(span);
      await editMonthFeeField(pid, 'amount', span);
      const typed = !!document.querySelector('input.editing-cell');
      span.remove();
      return { typed, amount: DB.payments.find(p => p.id === pid).amount };
    }, pid);
    expect(cell.typed, 'the month view opened an editor on collected money').toBe(false);
    expect(cell.amount).toBe(7000);
  } finally {
    await app.close();
  }
});
