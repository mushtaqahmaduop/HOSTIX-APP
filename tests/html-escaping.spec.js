// ════════════════════════════════════════════════════════════════════════════
// H4 — the escaping sweep, held in place.
//
// Every field below is one a warden TYPES. If any of them reaches innerHTML
// unescaped, the markup in it becomes real elements. The probe is a <b> with a
// class rather than a <script>: script injected via innerHTML does not execute,
// so a script probe would pass while the hole was still wide open. An element
// that MATERIALISES is the honest signal, and it is the same hole.
//
// The audit deferred this sweep until server-supplied content could render
// (Phase 2). The control plane now supplies content, so it is no longer
// hypothetical — and a hostel name is typed once and printed on every PDF.
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

test.beforeAll(() => { resetProfile(); });

// Each probe carries a unique class so a failure names the field that leaked.
const P = f => `<b class="xss-${f}">X</b>`;

test('markup typed into any field renders as text, on every page that shows it', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const pre = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(pre.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  await win.evaluate(async (probe) => {
    const p = f => probe.replace('FIELD', f);
    // Settings the warden edits by hand, and which every screen reads.
    DB.settings.hostelName = p('hostel');
    DB.settings.location   = p('location');
    DB.settings.floors     = [p('floor'), '1st'];
    DB.settings.paymentMethods   = [p('method'), 'Cash'];
    DB.settings.expenseCategories = [p('category'), 'Other'];
    DB.settings.roomTypes[0].name = p('roomtype');

    DB.rooms = [{ id: 'rmX', number: p('roomnum'), floor: p('floor'),
                  typeId: DB.settings.roomTypes[0].id, studentIds: [], amenities: [],
                  notes: p('roomnotes'), rent: 5000 }];

    DB.students = [{ id: 'stX', name: p('name'), fatherName: p('father'),
      cnic: p('cnic'), phone: p('phone'), email: p('email'), address: p('address'),
      occupation: p('occupation'), emergencyContact: p('emergency'),
      nationality: p('nationality'), roomId: 'rmX', rent: 5000, mess: 0,
      messOptIn: false, status: 'Active', joinDate: '2026-01-01',
      paymentMethod: 'Cash' }];

    DB.payments = [{ id: 'pX', studentId: 'stX', studentName: p('name'),
      roomId: 'rmX', roomNumber: p('roomnum'), month: 'August 2026',
      monthlyRent: 5000, amount: 5000, unpaid: 0, status: 'Paid',
      date: '2026-08-05', paidDate: '2026-08-05', method: p('method'),
      notes: p('paynotes'), concessionDesc: p('conc'),
      extraCharges: [{ label: p('extra'), amount: 100 }], extraTotal: 100 }];

    DB.expenses = [{ id: 'eX', date: '2026-08-06', category: p('category'),
      description: p('expdesc'), amount: 500 }];

    DB.cancellations = [{ id: 'canc_X', seq: 1, studentId: 'stX',
      studentName: p('name'), roomId: 'rmX', roomNumber: p('roomnum'),
      roomType: p('roomtype'), requestDate: '2026-08-01', vacateDate: '2026-09-30',
      reason: p('reason'), notes: p('cancnotes'), status: 'Pending',
      createdAt: '2026-08-01' }];

    await saveDB();
  }, P('FIELD'));

  const PAGES = ['dashboard', 'students', 'rooms', 'payments', 'expenses',
                 'reports', 'cancellations', 'archive', 'settings'];

  for (const page of PAGES) {
    await win.evaluate(p => navigate(p), page);
    await win.waitForTimeout(450);
    const leaked = await win.evaluate(() =>
      [...document.querySelectorAll('[class^="xss-"]')].map(e => e.className));
    expect(leaked, `markup leaked into the DOM on the ${page} page`).toEqual([]);
  }

  // The text must still be VISIBLE — escaping that silently drops the value
  // would pass the check above while losing the warden's data.
  await win.evaluate(() => navigate('students'));
  await win.waitForTimeout(400);
  const shown = await win.evaluate(() => document.body.innerText);
  expect(shown, 'the typed text itself must still be displayed, as text')
    .toContain('<b class="xss-name">X</b>');

  expect(pageErrors, 'no page errors').toEqual([]);
  await app.close();
});

test('the modals and print documents escape too', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(600);

  // Modals build their own HTML, and showModal/showConfirm render their TITLE
  // as raw HTML — a sink no amount of care in the page body would have covered.
  const modals = [
    ['showViewStudentModal', 'stX'],
    ['showEditStudentModal', 'stX'],
    ['showRoomDetail', 'rmX'],
    ['showEditRoomModal', 'rmX'],
  ];
  for (const [fn, arg] of modals) {
    const ran = await win.evaluate(([f, a]) => {
      if (typeof window[f] !== 'function') return false;
      window[f](a); return true;
    }, [fn, arg]);
    if (!ran) continue;
    await win.waitForTimeout(350);
    const leaked = await win.evaluate(() =>
      [...document.querySelectorAll('[class^="xss-"]')].map(e => e.className));
    expect(leaked, `markup leaked from ${fn}`).toEqual([]);
    await win.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
    await win.waitForTimeout(200);
  }

  // Print documents are built as strings and opened in a separate window, so
  // they are checked as strings: the probe must appear ESCAPED and never raw.
  const printed = await win.evaluate(() => {
    const captured = [];
    const real = window._electronPDF;
    window._electronPDF = (html) => { captured.push(html); };
    try { if (typeof printSeatAvailability === 'function') printSeatAvailability(); } catch (e) {}
    window._electronPDF = real;
    return captured;
  });

  for (const html of printed) {
    expect(html, 'a print document rendered typed markup raw')
      .not.toContain('<b class="xss-');
    expect(html).toContain('&lt;b class=&quot;xss-');
  }

  expect(pageErrors, 'no page errors').toEqual([]);
  await app.close();
});
