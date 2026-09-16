// ════════════════════════════════════════════════════════════════════════════
// The 2026-09-09 batch, in one file.
//
// Deliberately small — one assertion per decision the owner asked for, not a
// suite per screen. Each of these is a thing that would be visibly wrong in a
// demo if it regressed, and none of them is checkable by reading the code:
// they are all about what the rendered page actually contains.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch(seed) {
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
  if (seed) {
    await win.evaluate(async () => {
      const r = DB.rooms[0];
      DB.students = [{
        id: '001', name: 'Waseem Ullah', fatherName: 'Sarfraz Khan', roomId: r.id,
        status: 'Active', phone: '0301-9409962', emergencyPhone: '0345-9273348',
        cnic: '17301-3012345-6', nationality: 'Pakistani', occupation: 'MDCAT',
        address: 'Lakki Marwat', gender: 'Male', joinDate: today(),
      }];
      DB.payments = [{
        id: 'p1', studentId: '001', studentName: 'Waseem Ullah', roomNumber: String(r.number),
        month: thisMonth(), monthlyRent: 16000, messCharge: 0, messIncluded: false,
        amount: 16000, unpaid: 0, method: 'Cash', status: 'Paid', date: today(),
      }];
      await saveDB();
    });
  }
  return { app, win };
}

/* STUDENTS. Four of the owner's notes at once: the payment-status column is
   gone, the WhatsApp mark belongs to the student's own number (the first one
   the intake form asks for) and the handset to the guardian's, the room cell
   carries a short floor instead of the seat count, and the action button says
   what it is. */
test('the students register reads the way the owner asked for', async () => {
  const { app, win } = await launch(true);
  await win.evaluate(() => navigate('students'));
  await win.waitForTimeout(700);

  const out = await win.evaluate(() => {
    const heads = [...document.querySelectorAll('.stu-table thead th')].map(h => h.textContent.trim());
    const row = document.querySelector('.stu-table tbody tr');
    return {
      heads,
      waFirst: !!row.querySelector('.stu-contact .stu-wa'),
      phoneSecond: !!row.querySelector('.stu-contact__em .stu-ph'),
      floor: (row.querySelector('.stu-room__t') || {}).textContent || '',
      actionWords: (row.querySelector('.stu-actc .ui-btn') || {}).textContent || '',
      actionName: (row.querySelector('.stu-actc .ui-btn') || {}).getAttribute
        ? row.querySelector('.stu-actc .ui-btn').getAttribute('aria-label') : '',
    };
  });

  expect(out.heads.join(' | ')).not.toMatch(/Fee Status/);
  expect(out.heads.join(' | ')).toMatch(/Status/);          // the student's own, kept
  expect(out.waFirst).toBe(true);
  expect(out.phoneSecond).toBe(true);
  expect(out.floor).toMatch(/-Floor$/);                      // "G-Floor", "1st-Floor"
  expect(out.floor).not.toMatch(/Seater/);
  /* The kebab carries NO word (owner reversed the morning's "labelled" call:
     "the action buttons should be inside 3dots without actions letters"). The
     naming moved to the accessible name and to the menu items. */
  expect(out.actionWords.trim()).toBe('');
  expect(out.actionName).toMatch(/^Actions for /);

  await app.close();
});

/* THE SEARCH CLEARS ITSELF, on every list screen, and the toolbar's "Clear
   all" is gone. The × is hidden by CSS while the field is empty — a rule that
   only works while it is the input's immediate next sibling. */
test('every search box carries its own clear, and only clears the search', async () => {
  const { app, win } = await launch(true);

  for (const [page, input] of [['students', 'search-students'], ['payments', 'search-payments'],
                               ['rooms', 'search-rooms'], ['expenses', 'search-expenses']]) {
    await win.evaluate((p) => navigate(p), page);
    await win.waitForTimeout(450);
    const shape = await win.evaluate((id) => {
      const el = document.getElementById(id);
      const x = el && el.nextElementSibling;
      return {
        hasX: !!(x && x.classList.contains('lk-sx')),
        hiddenWhenEmpty: !!(x && getComputedStyle(x).display === 'none'),
        clearAll: !!document.querySelector('.tb-clear'),
      };
    }, input);
    expect(shape.hasX, page).toBe(true);
    expect(shape.hiddenWhenEmpty, page).toBe(true);
    expect(shape.clearAll, page).toBe(false);
  }

  // Typing shows it; pressing it empties the search and nothing else.
  await win.evaluate(() => navigate('students'));
  await win.waitForTimeout(450);
  await win.fill('#search-students', 'zzz');
  await win.waitForTimeout(450);
  expect(await win.evaluate(() =>
    getComputedStyle(document.querySelector('#search-students + .lk-sx')).display)).not.toBe('none');
  await win.evaluate(() => { studentFilter.status = 'Active'; });
  await win.click('#search-students + .lk-sx');
  await win.waitForTimeout(450);
  expect(await win.evaluate(() => ({ q: studentFilter.search, status: studentFilter.status })))
    .toEqual({ q: '', status: 'Active' });

  await app.close();
});

/* PAYMENTS. Four coloured glyphs became one labelled menu, and Delete is
   separated from Edit rather than sitting a pixel from it. */
test('a payment row opens a named menu, with delete set apart', async () => {
  const { app, win } = await launch(true);
  await win.evaluate(() => navigate('payments'));
  await win.waitForTimeout(700);

  await win.click('.pay-col-act button[aria-haspopup="menu"]');
  await win.waitForTimeout(300);
  const menu = await win.evaluate(() => {
    const m = document.getElementById('lk-rmenu');
    return {
      items: [...m.querySelectorAll('button')].map(b => b.textContent.trim()),
      sep: !!m.querySelector('.lk-rmenu__sep'),
      dangerLast: m.querySelector('button:last-child').classList.contains('is-danger'),
    };
  });
  expect(menu.items[0]).toBe('Edit payment');
  expect(menu.items).toContain('Print receipt');
  expect(menu.sep).toBe(true);
  expect(menu.dangerLast).toBe(true);

  await app.close();
});

/* USERS. The page routes from the rail, a role preset ticks the real
   permissions, and the sign-in stamp the Last sign-in column needs is written. */
test('user management is a page, and a role ticks real permissions', async () => {
  const { app, win } = await launch(false);

  await win.click('.nav-item[data-page="users"]');
  await win.waitForTimeout(700);
  expect(await win.evaluate(() => currentPage)).toBe('users');
  expect(await win.evaluate(() => !!document.querySelector('.usr-table'))).toBe(true);
  // Signing in a moment ago stamped the account.
  expect(await win.evaluate(() => !!WARDENS[CUR_ROLE].lastLogin)).toBe(true);

  await win.evaluate(() => showUserEditor(null));
  await win.waitForTimeout(400);
  const applied = await win.evaluate(() => {
    usfApplyRole('Accountant');
    return {
      on: PERM_KEYS.filter(k => document.getElementById('up-' + k).checked).sort(),
      level: document.getElementById('u-level').value,
    };
  });
  expect(applied.on).toEqual(['payments', 'reports']);
  expect(applied.level).toBe('Limited access');

  // Editing a tick by hand stops the role describing the account.
  const custom = await win.evaluate(() => {
    const el = document.getElementById('up-delete');
    el.checked = true; usfTouch();
    return document.getElementById('u-role').value;
  });
  expect(custom).toBe('Custom');

  await app.close();
});

/* CANCELLATIONS. Both dates are fields, and a refund that happened at checkout
   is named on the record rather than living only in the payments ledger. */
test('a cancellation shows its refund, and both its dates can be corrected', async () => {
  const { app, win } = await launch(true);

  await win.evaluate(async () => {
    const r = DB.rooms[0];
    DB.cancellations = [{
      id: 'c1', studentId: '001', studentName: 'Waseem Ullah', roomId: r.id,
      roomNumber: String(r.number), roomType: '3-Seater',
      requestDate: today(), vacateDate: today(), status: 'Confirmed', reason: 'Course completed',
      settlement: { on: today(), billed: 16000, collected: 19000, outstanding: 0, credit: 3000,
                    net: -3000, action: 'refund', settledNow: 3000, method: 'Cash' },
    }];
    await saveDB();
    navigate('cancellations');
  });
  await win.waitForTimeout(700);

  // The register names it, in the column the room type used to occupy.
  const cell = await win.evaluate(() => document.querySelector('.canc-table tbody tr').textContent);
  expect(cell).toMatch(/Refunded/);

  await win.evaluate(() => showEditCancellationModal('c1'));
  await win.waitForTimeout(400);
  const form = await win.evaluate(() => ({
    request: !!document.getElementById('f-crequest'),
    vacate: !!document.getElementById('f-cvacate'),
    settle: (document.querySelector('.cef-settle') || {}).textContent || '',
  }));
  expect(form.request).toBe(true);
  expect(form.vacate).toBe(true);
  expect(form.settle).toMatch(/Refunded at checkout/);
  expect(form.settle).toMatch(/Cash/);

  await app.close();
});

/* THE GLANCE CARD COUNTS TODAY, which is what its name now claims — this file
   has been on the wrong side of that once already, in the other direction. */
test('Today at a Glance counts today, not the month', async () => {
  const { app, win } = await launch(true);

  await win.evaluate(async () => {
    // A payment collected last month, in the month the sidebar is showing.
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    DB.payments.push({ id: 'p-old', studentId: '001', studentName: 'Waseem Ullah',
      roomNumber: '1', month: thisMonth(), monthlyRent: 16000, messCharge: 0,
      amount: 16000, unpaid: 0, method: 'Cash', status: 'Paid', date: ymd(d) });
    await saveDB();
    navigate('dashboard');
  });
  await win.waitForTimeout(900);

  const glance = await win.evaluate(() => {
    const rows = _dlGlance(thisMonth());
    const money = rows.find(r => r.k === 'money');
    return { n: money.n, label: money.full,
             title: (document.querySelector('.dash-sec__title') || {}).textContent || '' };
  });
  // One payment was taken today; the other was taken last month and is not counted.
  expect(glance.n).toBe(1);
  expect(glance.label).toMatch(/today/i);

  await app.close();
});

/* EVERY PRINTED DOCUMENT OFFERS ITS ACTIONS AT THE TOP. The bar used to be
   appended before </body> — at the end of the ninth page of a register. */
test('a generated document carries Download and Print, top right', async () => {
  const { app, win } = await launch(true);

  /* THE DOCUMENT, ASKED FOR DIRECTLY (2026-09-10). This used to build a
     two-megabyte filler string to push _electronPDF() past its bridge guard
     and down the popup fallback, then stub `window.open` and read what was
     written to it — because `window.electronAPI` is a contextBridge object and
     cannot be stubbed.

     None of that was what the test is about, and all of it stopped working
     when the popup stopped being reachable in Electron: the 2MB ceiling was
     the bug behind "the PDF button does nothing", so the bridge now takes a
     document of any size and the fallback is for browsers only.

     `_pdfInject` is the document-building half of _electronPDF, split out for
     exactly this. The assertions below are unchanged — they are about the bar
     and where it sits in the markup. */
  const doc = await win.evaluate(() =>
    _pdfInject('<html><head></head><body><p>report</p></body></html>', {}).slice(0, 4000));

  /* The MARKUP, not the rule — `.pdf-bar { … }` is in the injected <style> in
     the head, which is before <body> and would pass a naive search. */
  expect(doc).toContain('class="no-print pdf-bar"');
  const barAt = doc.indexOf('class="no-print pdf-bar"');
  const bodyAt = doc.search(/<body[^>]*>/i);
  /* Immediately after <body>, not at the end of the document — the CSS then
     fixes it to the top-right corner, under the window close button. */
  expect(barAt).toBeGreaterThan(bodyAt);
  expect(barAt - bodyAt).toBeLessThan(400);
  expect(doc).toContain('Download PDF');
  expect(doc).toContain('Print</button>');

  await app.close();
});
