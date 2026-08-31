// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — one chip for a payment method, on every screen that shows one
//
// There were three renderings of the same fact: `.badge-gray` from pmBadge()
// (archive, reports, students, the dashboard's payments table), `.pay-pill
// dh-slate` hand-written on the payments page, and a dashboard-local chip
// added with the Recent Payments rebuild. Three shapes for "Cash".
//
// pmBadge() is now the only one, and this file holds that closed.
//
// The glyph is chosen by matching the method's NAME, because the method list is
// editable in settings — a hostel that adds "Raast" must not get a blank where
// every other row has an icon. That matching has one trap worth a test of its
// own: 'JazzCash' contains 'cash', so the wallets must be tested before the
// banknote or every mobile wallet in Pakistan draws one.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  };
}

async function openApp() {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1500, height: 950 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForTimeout(700);
  return { app, win };
}

// One payment per default method, plus a method nobody shipped.
async function seed(win) {
  await win.evaluate(async () => {
    const d  = new Date();
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const methods = ['Cash', 'JazzCash', 'EasyPaisa', 'Bank Transfer', 'Cheque', 'Raast'];
    DB.students = methods.map((m, i) => ({ id: 's' + i, name: 'Student ' + i, roomId: null,
      rent: 8000, status: 'Active', joinDate: mk + '-01' }));
    DB.payments = methods.map((m, i) => ({ id: 'p' + i, studentId: 's' + i, studentName: 'Student ' + i,
      roomNumber: String(i + 1), monthlyRent: 8000, amount: 8000, unpaid: 0, admissionFee: 0,
      extraCharges: [], method: m, month: mk, date: mk + '-0' + (i + 1), status: 'Paid' }));
    await saveDB();
  });
}

test('the glyph is chosen by what the method says, and JazzCash is not cash', async () => {
  const { app, win } = await openApp();

  const picked = await win.evaluate(() => ({
    cash:      _pmIcon('Cash'),
    jazz:      _pmIcon('JazzCash'),
    easypaisa: _pmIcon('EasyPaisa'),
    bank:      _pmIcon('Bank Transfer'),
    cheque:    _pmIcon('Cheque'),
    // Not shipped by us — a hostel typed these into settings.
    raast:     _pmIcon('Raast'),
    sadapay:   _pmIcon('SadaPay'),
    unknown:   _pmIcon('Barter'),
    blank:     _pmIcon(''),
  }));

  // The trap: 'JazzCash' ends in 'cash'.
  expect(picked.jazz,      'JazzCash fell through to the banknote').toBe('phone');
  expect(picked.easypaisa).toBe('phone');
  expect(picked.sadapay).toBe('phone');
  expect(picked.raast).toBe('phone');

  expect(picked.cash).toBe('money');
  expect(picked.bank).toBe('building');
  expect(picked.cheque).toBe('receipt');
  // Anything unrecognised still gets a chip, never a gap.
  expect(picked.unknown).toBe('card');
  expect(picked.blank).toBe('card');

  await app.close();
});

test('pmBadge draws a chip with a glyph, and escapes what it is given', async () => {
  const { app, win } = await openApp();

  const out = await win.evaluate(() => {
    const wrap = document.createElement('div');
    wrap.innerHTML = pmBadge('Cash') + pmBadge('') +
                     pmBadge('<img src=x onerror="window.__pwned=1">');
    return {
      chips:   wrap.querySelectorAll('.pm-chip').length,
      svgs:    wrap.querySelectorAll('.pm-chip svg').length,
      empty:   wrap.querySelectorAll('.pm-chip')[1].textContent.trim(),
      injected: !!wrap.querySelector('img'),
      pwned:   !!window.__pwned,
      // The old shapes must be gone from the helper itself.
      legacy:  wrap.querySelectorAll('.badge-gray, .pay-pill').length,
    };
  });

  expect(out.chips).toBe(3);
  expect(out.svgs, 'a chip rendered without its glyph').toBe(3);
  expect(out.empty).toBe('—');
  expect(out.injected, 'markup typed into a method name materialised').toBe(false);
  expect(out.pwned).toBe(false);
  expect(out.legacy).toBe(0);

  await app.close();
});

test('the payments page and the dashboard draw the same chip', async () => {
  const { app, win } = await openApp();
  await seed(win);

  // ── Payments page — was `.pay-pill dh-slate`, hand-written ────────────────
  await win.evaluate(() => renderPage('payments'));
  await win.waitForTimeout(800);
  const pay = await win.evaluate(() => {
    const rows = [...document.querySelectorAll('.pay-table tbody tr, table tbody tr')];
    return {
      chips:   document.querySelectorAll('.pm-chip').length,
      glyphs:  document.querySelectorAll('.pm-chip svg').length,
      labels:  [...document.querySelectorAll('.pm-chip')].map(c => c.textContent.trim()),
      // `.pay-pill` survives — it is the STATUS pill, and a hued pill still
      // means state. It just no longer means "method" as well.
      pills:   document.querySelectorAll('.pay-pill').length,
      rows:    rows.length,
    };
  });

  expect(pay.chips, 'the payments page is not drawing method chips').toBeGreaterThan(0);
  expect(pay.glyphs).toBe(pay.chips);
  expect(pay.labels).toEqual(expect.arrayContaining(['Cash', 'JazzCash', 'Bank Transfer', 'Raast']));
  expect(pay.pills, 'the status pill was removed along with the method pill').toBeGreaterThan(0);

  // ── Dashboard — was a dashboard-local chip class ──────────────────────────
  await win.evaluate(() => renderPage('dashboard'));
  await win.waitForTimeout(800);
  const dash = await win.evaluate(() => ({
    chips:  document.querySelectorAll('.dash-rp .pm-chip').length,
    glyphs: document.querySelectorAll('.dash-rp .pm-chip svg').length,
    local:  document.querySelectorAll('.dash-rp-method').length,
  }));

  expect(dash.chips).toBe(6);
  expect(dash.glyphs).toBe(6);
  expect(dash.local, 'the dashboard kept its own method class').toBe(0);

  await app.close();
});
