// ════════════════════════════════════════════════════════════════════════════
// The expense form, and the two columns it exists to fill (owner, 2026-09-09).
//
// `expense.png` draws a Payment Method column and an Added By column. An
// expense record here was {id, category, amount, date, description} and had
// neither, and spec §21 forbids inventing a creator — so the fields are
// CAPTURED in the form rather than derived, and a record written before the
// capture prints a dash.
//
// What is actually worth guarding, and why each one is here:
//   · A legacy record still saves. Description and payee are required on ADD
//     and NOT on an edit of a record that never carried them — otherwise a
//     warden correcting a July amount is made to invent a payee first.
//   · Nothing is written as ''. The "Not recorded" filter and the export's dash
//     both key off the ABSENT field; a stored empty string makes them disagree.
//   · Delete-from-the-form does not eat the form. showConfirm() replaces the
//     whole modal container, so Cancel has to put the form back.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 60000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 60000 });
  await win.waitForTimeout(600);

  // One expense from before the two fields existed, one written with them.
  await win.evaluate(async () => {
    const mk = thisMonth();
    DB.expenses = [
      { id: 'e_old', category: 'Electricity', amount: 12000, date: mk + '-02',
        description: 'Bill' },
      { id: 'e_new', category: 'Water', amount: 3000, date: mk + '-05',
        description: 'Tanker', method: 'Cash', handedTo: 'Saif Ullah' },
      { id: 'e_bare', category: 'Cleaning', amount: 900, date: mk + '-06' },
    ];
    expFilter.cat = 'All'; expFilter.method = 'All'; expFilter.month = ''; expFilter.showAll = false;
    await saveDB();
    renderPage('expenses');
  });
  await win.waitForTimeout(400);
  return { app, win };
}

/* ── the two columns ──────────────────────────────────────────────────────── */

test('a captured method and payee render as chips; a record without them prints a dash', async () => {
  const { app, win } = await launch();

  const seen = await win.evaluate(() => {
    const rows = [...document.querySelectorAll('.exp-table tbody tr')];
    const read = desc => {
      const tr = rows.find(r => r.textContent.includes(desc));
      if (!tr) return null;
      const td = [...tr.children];
      return { method: td[4].textContent.trim(), who: td[5].textContent.trim(),
               methodChip: !!td[4].querySelector('.exp-meth'),
               avatar: (td[5].querySelector('.exp-who i') || {}).textContent };
    };
    return { withFields: read('Tanker'), without: read('Bill') };
  });

  expect(seen.withFields.methodChip, 'the method is a chip').toBe(true);
  expect(seen.withFields.method).toBe('Cash');
  expect(seen.withFields.who).toContain('Saif Ullah');
  // Initials, first and last word — the reference's [SA] avatar.
  expect(seen.withFields.avatar).toBe('SU');

  // §21: no fabricated administrator on the record that never had one.
  expect(seen.without.method).toBe('—');
  expect(seen.without.who).toBe('—');

  await app.close();
});

test('the method filter finds both a method and the records that never recorded one', async () => {
  const { app, win } = await launch();

  /* renderPage() does not land inside the same evaluate — read the DOM after it,
     or the assertion sees the PREVIOUS render and passes or fails for the wrong
     reason. (It cost this file one red run.) */
  const rows = async () => {
    await win.waitForTimeout(300);
    return win.evaluate(() =>
      [...document.querySelectorAll('.exp-table tbody tr')].map(r => r.textContent));
  };

  await win.evaluate(() => { expFilter.method = 'Cash'; renderPage('expenses'); });
  const cash = await rows();
  expect(cash.length).toBe(1);
  expect(cash[0]).toContain('Tanker');

  /* 'None' is the set a warden would want to go back and complete, so it has to
     be reachable — not merely visible as a column of dashes. */
  await win.evaluate(() => { expFilter.method = 'None'; renderPage('expenses'); });
  const none = await rows();
  expect(none.length).toBe(2);
  expect(none.join(' ')).toContain('Bill');
  expect(none.join(' ')).not.toContain('Tanker');

  await app.close();
});

/* ── the form ─────────────────────────────────────────────────────────────── */

test('adding an expense captures the method and the payee, and neither is stored empty', async () => {
  const { app, win } = await launch();

  const rec = await win.evaluate(async () => {
    showAddExpenseModal();
    document.getElementById('f-ecat').value = 'Electricity';
    document.getElementById('f-eamt').value = '4500';
    document.getElementById('f-edate').value = thisMonth() + '-09';
    document.getElementById('f-emethod').value = 'Bank Transfer';
    document.getElementById('f-ewho').value = 'Mushtaq Ahmad';
    document.getElementById('f-edesc').value = 'September electricity';
    await submitExpense();
    return DB.expenses.find(e => e.description === 'September electricity') || null;
  });

  expect(rec).not.toBeNull();
  expect(rec.method).toBe('Bank Transfer');
  expect(rec.handedTo).toBe('Mushtaq Ahmad');

  // Left blank, the keys are ABSENT rather than ''. Everything downstream —
  // the "Not recorded" filter, the export's dash — reads absence.
  const blank = await win.evaluate(async () => {
    showAddExpenseModal();
    document.getElementById('f-ecat').value = 'Water';
    document.getElementById('f-eamt').value = '700';
    document.getElementById('f-edate').value = thisMonth() + '-09';
    document.getElementById('f-emethod').value = '';
    document.getElementById('f-ewho').value = 'Someone';
    document.getElementById('f-edesc').value = 'No method recorded';
    await submitExpense();
    const e = DB.expenses.find(x => x.description === 'No method recorded');
    return { hasKey: Object.prototype.hasOwnProperty.call(e, 'method') };
  });
  expect(blank.hasKey, 'a blank method must not be stored as an empty string').toBe(false);

  await app.close();
});

test('a record written before the fields existed can still be edited and saved', async () => {
  const { app, win } = await launch();

  const out = await win.evaluate(async () => {
    showEditExpenseModal('e_bare');            // no description, no payee
    const marks = [...document.querySelectorAll('.hf-g2 .req')].length;
    document.getElementById('f-eamt').value = '1100';
    await submitExpense('e_bare');
    const e = DB.expenses.find(x => x.id === 'e_bare');
    return { marks, amount: e.amount, saved: !document.querySelector('.modal-overlay') };
  });

  // Category, amount and date stay required; description and payee do not, on a
  // record that never carried them.
  expect(out.marks).toBe(3);
  expect(out.amount).toBe(1100);
  expect(out.saved, 'the edit saved and the modal closed').toBe(true);

  await app.close();
});

test('cancelling the delete confirmation puts the edit form back', async () => {
  const { app, win } = await launch();

  const state = await win.evaluate(() => {
    showEditExpenseModal('e_new');
    document.getElementById('f-eamt').value = '3333';       // an unsaved correction
    expDeleteFromForm('e_new');
    const confirming = !!document.querySelector('.confirm-text');
    // Answer Cancel exactly as the button does.
    closeModal();
    if (typeof _pendingConfirmCancelCb === 'function') { _pendingConfirmCancelCb(); }
    return { confirming, backOnScreen: !!document.getElementById('f-eamt'),
             stillThere: !!DB.expenses.find(e => e.id === 'e_new') };
  });

  expect(state.confirming, 'the confirmation was raised').toBe(true);
  expect(state.backOnScreen, 'cancelling must not leave the warden staring at the register').toBe(true);
  expect(state.stillThere).toBe(true);

  await app.close();
});

/* ── the export ───────────────────────────────────────────────────────────── */

test('the export carries both columns, and leaves them blank rather than guessing', async () => {
  const { app, win } = await launch();

  const def = await win.evaluate(() => {
    const d = _expExportDef(expensesFiltered());
    const labels = d.columns.map(c => c.label);
    const row = expensesFiltered().find(e => e.id === 'e_old');
    const col = l => d.columns.find(c => c.label === l);
    return { labels,
             oldMethod: col('Method').value(row),
             oldWho:    col('Added By').value(row) };
  });

  expect(def.labels).toContain('Method');
  expect(def.labels).toContain('Added By');
  expect(def.oldMethod).toBe('');
  expect(def.oldWho).toBe('');

  await app.close();
});
