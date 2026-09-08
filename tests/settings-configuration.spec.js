// ════════════════════════════════════════════════════════════════════════════
// Settings → Configuration — built 2026-09-08 to `hostel configuration.png`.
//
// Room Types, Payment Methods, Expense Categories and Floors were four tabs.
// They are one page now, at the owner's request: "I put all the room types,
// payment methods, expense categories and floors addition here in a single
// place to access."
//
// The reference also asks for three things the data did not carry — an icon on
// every method and category, a live/retired state on every method, and a
// pencil on every row. Those are the ones this file guards, because each of
// them touches records rather than pixels:
//
//  · RETIRING a method must not delete it, must not touch a single payment
//    already taken by it, and must stop it being OFFERED on new ones. A hostel
//    that stops taking cheques still has last year's cheques in its ledger.
//  · EDITING a payment taken by a retired method must not silently rewrite it.
//    A <select> whose value is missing from its options reports the first
//    option instead, and the save writes that.
//  · RENAMING is a rename of the value stored on every record that used it.
//    A rename that updates the list alone orphans them.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 60000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 60000 });

  // One payment taken by cheque and one expense filed under Gas, so retiring
  // and renaming have real records to answer for.
  await win.evaluate(async () => {
    const r0 = DB.rooms[0];
    DB.students.push({ id: 'stu-a', name: 'Test Student', roomId: r0.id, status: 'Active',
      admissionDate: '2026-02-01', monthlyRent: 12000 });
    DB.payments.push({ id: 'pay1', studentId: 'stu-a', studentName: 'Test Student',
      roomId: r0.id, roomNumber: r0.number, month: '2026-09', amount: 12000, unpaid: 0,
      method: 'Cheque', status: 'Paid', date: '2026-09-01' });
    DB.expenses = [{ id: 'e1', date: '2026-09-01', category: 'Gas',
      description: 'Cylinder', amount: 5000 }];
    await saveDB();
  });
  return { app, win };
}

const openConfig = async (win) => {
  await win.evaluate(() => { settingsTab = 'config'; navigate('settings'); });
  await win.waitForTimeout(550);
};

test('four tabs became one page, and an old tab id does not land on a blank one', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await openConfig(win);

  const tabs = await win.evaluate(() =>
    [...document.querySelectorAll('.set-tabs .set-tab')].map(t => t.textContent.trim()));
  expect(tabs).toEqual(['Hostel Info', 'Configuration', 'Rent & Mess',
                        'Data Management', 'License', 'Connection']);

  const shape = await win.evaluate(() => ({
    // FOUR cards, two by two, as `hostel configuration.png` draws them —
    // Room Types is one of them, not a full-width panel above them.
    cards: document.querySelectorAll('#content .cfg-grid > .cfg-card').length,
    roomTypeRows: document.querySelectorAll('#content #room-types-list tr').length,
    methods: document.querySelectorAll('#content .cfg-state').length,
    columns: getComputedStyle(document.querySelector('#content .cfg-grid'))
               .gridTemplateColumns.split(' ').length,
  }));
  expect(shape.cards).toBe(4);
  expect(shape.columns).toBe(2);
  expect(shape.roomTypeRows).toBeGreaterThan(0);
  expect(shape.methods).toBe(5);

  // `settingsTab` lives in memory. A warden sitting on the old Payment Methods
  // tab when the app updates must not find a strip with nothing under it.
  // renderPage() defers its work by 80ms and the correction runs inside
  // renderSettings(), so `settingsTab` has to be read AFTER the render — not
  // in the same turn that asked for it.
  await win.evaluate(() => { settingsTab = 'payments'; renderPage('settings'); });
  await win.waitForTimeout(450);
  expect(await win.evaluate(() => settingsTab)).toBe('config');
  expect(await win.evaluate(() =>
    document.querySelectorAll('#content .cfg-grid > .cfg-card').length)).toBe(4);

  await app.close();
});

test('retiring a payment method keeps every payment that used it', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await openConfig(win);

  await win.evaluate(() => cfgToggleMethod('Cheque'));
  await win.waitForTimeout(500);

  const after = await win.evaluate(() => ({
    active: cfgMethodActive('Cheque'),
    onRecord: DB.payments.find(p => p.id === 'pay1').method,
    stillListed: DB.settings.paymentMethods.includes('Cheque'),
    offeredOnNew: pmOptions().includes('>Cheque<'),
    // …but the record's own method is still offered when editing THAT record,
    // or the select would report the first option and the save would rewrite it.
    offeredOnItsOwnRecord: pmOptions('Cheque').includes('>Cheque<'),
  }));

  expect(after.active).toBe(false);
  expect(after.onRecord).toBe('Cheque');       // untouched
  expect(after.stillListed).toBe(true);        // not deleted
  expect(after.offeredOnNew).toBe(false);      // not offered any more
  expect(after.offeredOnItsOwnRecord).toBe(true);

  // The last active method cannot be retired — a hostel has to be able to take
  // money somehow.
  const guard = await win.evaluate(async () => {
    for (const m of DB.settings.paymentMethods) {
      if (m !== 'Cheque') await cfgToggleMethod(m);
    }
    return DB.settings.paymentMethods.filter(cfgMethodActive).length;
  });
  await win.waitForTimeout(400);
  expect(guard).toBeGreaterThanOrEqual(1);

  await app.close();
});

test('renaming carries every record that used the old name', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await openConfig(win);

  await win.evaluate(() => cfgRenamePrompt('category', 'Gas'));
  await win.waitForSelector('#cfg-rename', { timeout: 15000 });
  await win.evaluate(() => { document.getElementById('cfg-rename').value = 'Gas & Fuel'; });
  await win.evaluate(() => cfgRename('category', 'Gas'));
  await win.waitForTimeout(600);

  const cat = await win.evaluate(() => ({
    added: DB.settings.expenseCategories.includes('Gas & Fuel'),
    removed: !DB.settings.expenseCategories.includes('Gas'),
    record: DB.expenses[0].category,
  }));
  expect(cat).toEqual({ added: true, removed: true, record: 'Gas & Fuel' });

  // The same for a payment method, where the record is a payment.
  await win.evaluate(() => cfgRenamePrompt('method', 'Cheque'));
  await win.waitForSelector('#cfg-rename', { timeout: 15000 });
  await win.evaluate(() => { document.getElementById('cfg-rename').value = 'Bank Cheque'; });
  await win.evaluate(() => cfgRename('method', 'Cheque'));
  await win.waitForTimeout(600);
  expect(await win.evaluate(() => DB.payments.find(p => p.id === 'pay1').method))
    .toBe('Bank Cheque');

  // A duplicate is refused rather than merging two lists silently.
  const dup = await win.evaluate(async () => {
    const before = DB.settings.floors.slice();
    cfgRenamePrompt('floor', before[0]);
    await new Promise(r => setTimeout(r, 120));
    document.getElementById('cfg-rename').value = before[1];
    await cfgRename('floor', before[0]);
    return { before, after: DB.settings.floors };
  });
  expect(dup.after).toEqual(dup.before);

  await app.close();
});

test('an icon choice is remembered, and every card fits the QA floor', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await openConfig(win);

  await win.evaluate(() => cfgSetIcon('method', 'Cash', 'wallet'));
  await win.waitForTimeout(500);
  expect(await win.evaluate(() => cfgIconOf('method', 'Cash'))).toBe('wallet');
  // …and it survives a reload of the page's markup.
  await win.evaluate(() => renderPage('settings'));
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => DB.settings.configMeta.method.Cash.icon)).toBe('wallet');

  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w.isMaximized()) w.unmaximize();
    w.setContentSize(1366, 690);
  });
  await win.waitForTimeout(400);
  await win.evaluate(() => renderPage('settings'));
  await win.waitForTimeout(450);

  const fit = await win.evaluate(() => {
    const grid = document.querySelector('#content .cfg-grid');
    return {
      pageOverflow: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
      // FIT TO PAGE, the owner's words. `cfgFitGrid()` measures the room left
      // and sets the height; the grid must end above the fold, because `html`
      // has overflow:hidden and anything past it is CLIPPED, not scrollable.
      gridBottom: Math.round(grid.getBoundingClientRect().bottom),
      viewport: window.innerHeight,
      // …and no card may scroll SIDEWAYS. Down is the answer to more data;
      // sideways is a column that does not fit.
      sideways: [...document.querySelectorAll('#content .cfg-grid .set-table-wrap')]
        .map(w2 => w2.scrollWidth - w2.clientWidth),
    };
  });
  expect(fit.pageOverflow).toBe(0);
  expect(fit.gridBottom).toBeLessThanOrEqual(fit.viewport);
  expect(fit.sideways).toEqual([0, 0, 0, 0]);

  await app.close();
});

test('a panel with more rows than fit scrolls inside itself, not down the page', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();

  // A hostel with far more expense categories than one card can show.
  await win.evaluate(async () => {
    for (let i = 1; i <= 18; i++) DB.settings.expenseCategories.push('Extra Cat ' + i);
    await saveDB();
  });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w.isMaximized()) w.unmaximize();
    w.setContentSize(1366, 690);
  });
  await win.waitForTimeout(350);
  await openConfig(win);

  const m = await win.evaluate(() => {
    const grid = document.querySelector('#content .cfg-grid');
    const cards = [...document.querySelectorAll('#content .cfg-grid > .cfg-card')];
    const wrapOf = c => c.querySelector('.set-table-wrap');
    return {
      gridBottom: Math.round(grid.getBoundingClientRect().bottom),
      viewport: window.innerHeight,
      // The over-full card scrolls; the page does not grow to hold it.
      overflowing: cards.filter(c => {
        const w2 = wrapOf(c); return w2 && w2.scrollHeight - w2.clientHeight > 40;
      }).length,
      // Every card is still the same height — the grid's rows split the page
      // evenly, so one long list cannot push the others off screen.
      heights: [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().height)))],
      // And the heading stays put while its rows move under it.
      stickyHead: getComputedStyle(
        document.querySelector('#content .cfg-grid .cfg-table thead th')).position,
    };
  });

  expect(m.gridBottom).toBeLessThanOrEqual(m.viewport);
  expect(m.overflowing).toBeGreaterThan(0);
  expect(m.heights.length).toBe(1);
  expect(m.stickyHead).toBe('sticky');

  await app.close();
});

test('every Add button opens a form — the click, not the function', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await openConfig(win);

  /* CLICKED, not called. The three Add buttons shipped broken on 2026-09-08
     because the handler was written as `onclick="cfgAddPrompt("method")"` —
     the inner double quotes closed the HTML attribute, so the browser parsed
     the handler as the fragment `cfgAddPrompt(` and the click did nothing at
     all. A test that calls cfgAddPrompt() directly passes over that; only a
     real click sees it. */
  const cards = ['Add room type', 'Add method', 'Add category', 'Add floor'];
  for (const label of cards) {
    const opened = await win.evaluate(async (text) => {
      const btn = [...document.querySelectorAll('#content .cfg-grid .set-btn--go')]
        .find(b => b.textContent.trim() === text);
      if (!btn) return 'no button: ' + text;
      btn.click();
      await new Promise(r => setTimeout(r, 200));
      const modal = document.querySelector('#modal-container .modal');
      if (!modal) return 'no modal for: ' + text;
      const title = (modal.querySelector('.hf-mh__t') || {}).textContent || '';
      const input = modal.querySelector('input');
      closeModal();
      return { title: title.trim(), hasInput: !!input };
    }, label);
    expect(opened, label).toMatchObject({ hasInput: true });
    expect(String(opened.title).length, label + ' has a heading').toBeGreaterThan(3);
  }

  await app.close();
});

test('a room type is created by a form, filled in before it exists', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await openConfig(win);

  const before = await win.evaluate(() => DB.settings.roomTypes.length);

  // Opening the form must NOT create anything — that was the old behaviour.
  await win.evaluate(() => showRoomTypeModal());
  await win.waitForSelector('#rtf-name', { timeout: 15000 });
  expect(await win.evaluate(() => DB.settings.roomTypes.length)).toBe(before);

  // A blank name is refused rather than saved as a placeholder.
  await win.evaluate(() => saveRoomTypeForm());
  await win.waitForTimeout(300);
  expect(await win.evaluate(() => DB.settings.roomTypes.length)).toBe(before);

  // Zero rent is refused too: it cascades onto every room of the type.
  await win.evaluate(() => {
    document.getElementById('rtf-name').value = '6-Seater';
    document.getElementById('rtf-cap').value = '6';
    document.getElementById('rtf-rent').value = '0';
  });
  await win.evaluate(() => saveRoomTypeForm());
  await win.waitForTimeout(300);
  expect(await win.evaluate(() => DB.settings.roomTypes.length)).toBe(before);

  await win.evaluate(async () => {
    document.getElementById('rtf-rent').value = '9000';
    document.getElementById('rtf-mess').value = '3000';
    await saveRoomTypeForm();
  });
  await win.waitForTimeout(700);

  const made = await win.evaluate(() => {
    const t = DB.settings.roomTypes.find(x => x.name === '6-Seater');
    return t && { cap: t.capacity, rent: t.defaultRent, mess: t.defaultMess,
                  count: DB.settings.roomTypes.length };
  });
  expect(made).toMatchObject({ cap: 6, rent: 9000, mess: 3000, count: before + 1 });
  // No "New Type" placeholder was ever written.
  expect(await win.evaluate(() =>
    DB.settings.roomTypes.some(t => t.name === 'New Type'))).toBe(false);

  // The same form edits, prefilled, and a duplicate name is refused.
  const id = await win.evaluate(() =>
    DB.settings.roomTypes.find(t => t.name === '6-Seater').id);
  await win.evaluate(i => showRoomTypeModal(i), id);
  await win.waitForSelector('#rtf-name', { timeout: 15000 });
  const prefill = await win.evaluate(() => ({
    name: document.getElementById('rtf-name').value,
    cap: document.getElementById('rtf-cap').value,
    rent: document.getElementById('rtf-rent').value,
    mess: document.getElementById('rtf-mess').value,
  }));
  expect(prefill).toEqual({ name: '6-Seater', cap: '6', rent: '9000', mess: '3000' });

  await win.evaluate(async () => {
    document.getElementById('rtf-name').value = '1-Seater';   // already exists
    await saveRoomTypeForm(DB.settings.roomTypes.find(t => t.name === '6-Seater').id);
  });
  await win.waitForTimeout(400);
  expect(await win.evaluate(() =>
    DB.settings.roomTypes.filter(t => t.name === '1-Seater').length)).toBe(1);

  await app.close();
});
