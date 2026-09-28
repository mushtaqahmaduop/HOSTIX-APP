// ════════════════════════════════════════════════════════════════════════════
// The expense form, and the two columns it exists to fill (owner, 2026-09-09).
//
// `expense.png` draws a Payment Method column and a Paid To column. An
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
  await win.selectOption('#login-user', 'warden1');
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
               methodChip: !!td[4].querySelector('.ui-chip'),
               avatar: (td[5].querySelector('.exp-who .ui-avatar') || {}).textContent };
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
             oldWho:    col('Vendor').value(row),
             oldAdded:  col('Added By').value(row),
             // The one definition both this page and the Reports expense
             // section now read — see expExportColumns() in expenses.js.
             shared: typeof expExportColumns === 'function',
             grouped: expExportColumns({ grouped: true }).find(c => c.label === 'Category').pdf };
  });

  expect(def.labels).toContain('Method');
  /* VENDOR AND ADDED BY ARE TWO COLUMNS, because they are two people (owner,
     2026-09-23). `handedTo` has always held the RECEIVER: the heading said
     "Added By" until 2026-09-16, which named whoever entered the record and
     invited a warden to type their own name into it; it became "Paid To" then
     and "Vendor" now — the word a ledger uses, and unambiguous beside a column
     that really is the entering account. */
  expect(def.labels).toContain('Vendor');
  expect(def.labels).toContain('Added By');
  expect(def.labels, 'the old heading came back').not.toContain('Paid To');

  /* BLANK, NOT GUESSED, on a record written before either field was captured —
     §21's dash rather than a guess at who was on shift. */
  expect(def.oldMethod).toBe('');
  expect(def.oldWho).toBe('');
  expect(def.oldAdded).toBe('');

  /* ONE DEFINITION, BOTH EXPORTS. The Reports page printed its own three-column
     expense table — Date, Description, Amount — so the same category exported
     from two screens gave two different documents (owner, 2026-09-23: "there
     is also a difference between the expense page pdf and reports page expense
     pdf"). Both read this now. */
  expect(def.shared, 'the shared column definition is gone').toBe(true);
  /* Grouped by category on the printed page, so the Category column would
     repeat each table's own heading on every row. */
  expect(def.grouped).toBe(false);

  await app.close();
});

/* ── the receipt number (owner, 2026-09-28) ───────────────────────────────────
   "some hostels have a receipt for the expenses or utilities so there should be
   a reference number ... in the receipt column below the eye icon ... and a
   field for it in the form, optional". */
test('the receipt number is optional, sits under the eye, is searchable, and exports', async () => {
  const { app, win } = await launch();

  const r = await win.evaluate(async () => {
    const fill = (desc, ref) => {
      showAddExpenseModal();
      document.getElementById('f-ecat').value = 'Electricity';
      document.getElementById('f-eamt').value = '4500';
      document.getElementById('f-edate').value = thisMonth() + '-09';
      document.getElementById('f-ewho').value = 'PESCO';
      document.getElementById('f-edesc').value = desc;
      document.getElementById('f-eref').value = ref;
    };
    fill('With a bill number', '  INV-20931 \n');
    await submitExpense();
    const withRef = DB.expenses.find(e => e.description === 'With a bill number');
    fill('No bill number', '');
    await submitExpense();
    const noRef = DB.expenses.find(e => e.description === 'No bill number');

    // A file AND a number: the eye first, the number under it.
    withRef.receipt = { name: 'bill.jpg', type: 'image/jpeg', size: 10, data: 'data:image/jpeg;base64,AA==' };
    renderPage('expenses');
    await new Promise(res => setTimeout(res, 300));
    const cellOf = desc => [...document.querySelectorAll('.exp-table tbody tr')]
      .find(tr => tr.textContent.includes(desc)).querySelector('td.exp-rcptc');
    const both = cellOf('With a bill number');
    const kids = [...both.children].map(c => c.className.split(' ').find(k => /^exp-(rcpt-btn|refno)$/.test(k)));

    // Search finds a record by its bill number alone.
    expFilter.search = 'inv-209'; renderPage('expenses');
    await new Promise(res => setTimeout(res, 300));
    const found = [...document.querySelectorAll('.exp-table tbody tr')].map(tr => tr.textContent);
    expFilter.search = ''; renderPage('expenses');
    await new Promise(res => setTimeout(res, 300));

    const cols = expExportColumns({});
    const refCol = cols.find(c => c.label === 'Receipt No.');
    return {
      stored: withRef.refNo,
      noKey: Object.prototype.hasOwnProperty.call(noRef, 'refNo'),
      kids, dash: cellOf('No bill number').textContent.trim(),
      found: found.length === 1 && found[0].includes('With a bill number'),
      exported: refCol && refCol.value(withRef), exportedBlank: refCol && refCol.value(noRef),
      printed: refCol && refCol.pdf !== false,
      oldLabel: cols.some(c => c.label === 'Reference'),
    };
  });

  expect(r.stored, 'whitespace from a pasted number is trimmed').toBe('INV-20931');
  expect(r.noKey, 'a blank number must not be stored as an empty string').toBe(false);
  expect(r.kids).toEqual(['exp-rcpt-btn', 'exp-refno']);
  expect(r.dash).toBe('—');
  expect(r.found).toBe(true);
  expect(r.exported).toBe('INV-20931');
  expect(r.exportedBlank).toBe('');
  expect(r.printed, 'the number is what matches a printed line to the paper bill').toBe(true);
  expect(r.oldLabel, '"Reference" would now mean two different things').toBe(false);

  await app.close();
});

/* NO FUND TRANSFER WHERE OWNER FUNDS IS ON (owner, 2026-09-28). Owner money
   entered as an expense AND in Owner Funds would be counted twice. */
test('with Owner Funds on, "Fund Transfer" is not offered for new expenses; an old one keeps it', async () => {
  const { app, win } = await launch();
  try {
    const r = await win.evaluate(async () => {
      const opts = () => [...document.querySelectorAll('#f-ecat option')].map(o => o.value);
      localStorage.removeItem('hx_feat_on_ownerFunds');
      showAddExpenseModal();
      const offOffers = opts().includes(FUND_TRANSFER_CAT);
      closeModal();

      localStorage.setItem('hx_feat_on_ownerFunds', '1');
      showAddExpenseModal();
      const onOffers = opts().includes(FUND_TRANSFER_CAT);
      const note = (document.querySelector('.hi-note') || {}).textContent || '';
      // Forced through anyway (a form opened before the switch): refused.
      document.getElementById('f-ecat').innerHTML = '<option>' + FUND_TRANSFER_CAT + '</option>';
      document.getElementById('f-eamt').value = '5000';
      document.getElementById('f-edate').value = thisMonth() + '-09';
      document.getElementById('f-ewho').value = 'Owner';
      document.getElementById('f-edesc').value = 'Owner took money';
      const before = DB.expenses.length;
      await submitExpense();
      const refused = DB.expenses.length === before;
      closeModal();

      // An expense ALREADY filed as a transfer still opens and saves as one.
      DB.expenses.push({ id: 'e_tr', category: FUND_TRANSFER_CAT, amount: 700, date: thisMonth() + '-03',
                         description: 'Old transfer', handedTo: 'Owner', method: 'Cash' });
      showEditExpenseModal('e_tr');
      const editKeeps = document.getElementById('f-ecat').value === FUND_TRANSFER_CAT;
      await submitExpense('e_tr');
      const saved = DB.expenses.find(x => x.id === 'e_tr').category;
      localStorage.removeItem('hx_feat_on_ownerFunds');
      return { offOffers, onOffers, note, refused, editKeeps, saved };
    });
    expect(r.offOffers, 'hostels without Owner Funds keep the category').toBe(true);
    expect(r.onOffers).toBe(false);
    expect(r.note).toMatch(/Owner Funds/);
    expect(r.refused).toBe(true);
    expect(r.editKeeps).toBe(true);
    expect(r.saved).toBe('Fund Transfer');
  } finally {
    await app.close();
  }
});

