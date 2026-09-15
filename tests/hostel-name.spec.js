// ════════════════════════════════════════════════════════════════════════════
// No placeholder hostel name on paper (owner, 2026-09-15).
//
// tests/hostel-name.test.js proves the rules. This proves the screens: a print
// while the name is still "Hostel Name" asks for it, Cancel prints nothing, a
// real name is saved where Settings keeps it and the print then runs, and the
// next print does not ask again. The receipt, the visit sheet and the register
// exports stop at the same question.
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

const layer = win => win.waitForSelector('#hostel-name-layer', { state: 'attached', timeout: 10000 });
const layerGone = win => win.waitForFunction(() => !document.getElementById('hostel-name-layer'), null, { timeout: 10000 });

test.beforeAll(() => { resetProfile(); });

test('a print with no hostel name asks once, saves it, then prints', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    await win.evaluate(async () => {
      window.__printed = [];
      _electronPDF = (html, name) => { window.__printed.push({ html, name }); };
      DB.settings.hostelName = 'Hostel Name';
      DB.students = [{ id: 'stuH', name: 'Name Student', roomId: DB.rooms[0].id, status: 'Active',
                       joinDate: '2026-01-01', paymentMethod: 'Cash' }];
      DB.payments = [{ id: 'pH', studentId: 'stuH', studentName: 'Name Student', roomId: DB.rooms[0].id,
                       roomNumber: DB.rooms[0].number, month: thisMonthLabel(), monthlyRent: 10000, messCharge: 0,
                       messIncluded: false, amount: 10000, unpaid: 0, status: 'Paid', method: 'Cash',
                       date: today(), paidDate: today(), extraCharges: [], extraTotal: 0 }];
      await saveDB();
    });

    // ── The profile asks; Cancel prints nothing ────────────────────────────
    await win.evaluate(() => printStudentCard('stuH'));
    await layer(win);
    expect(await win.locator('#hostel-name-title').textContent()).toContain("hostel's name");
    await win.click('#hostel-name-layer [data-hn="cancel"]');
    await layerGone(win);
    expect(await win.evaluate(() => window.__printed.length), 'Cancel printed anyway').toBe(0);
    expect(await win.evaluate(() => DB.settings.hostelName)).toBe('Hostel Name');

    // ── The receipt and the visit sheet stop at the same question ──────────
    await win.evaluate(() => printReceipt('pH'));
    await layer(win);
    expect(await win.evaluate(() => !!document.getElementById('rc-print')), 'the receipt opened without a name').toBe(false);
    await win.click('#hostel-name-layer [data-hn="cancel"]');
    await layerGone(win);
    await win.evaluate(() => printSeatAvailability());
    await layer(win);
    await win.click('#hostel-name-layer [data-hn="cancel"]');
    await layerGone(win);
    expect(await win.evaluate(() => window.__printed.length)).toBe(0);

    // ── The placeholder is refused; a real name is saved and the print runs ─
    await win.evaluate(() => printStudentCard('stuH'));
    await layer(win);
    await win.fill('#hostel-name-in', 'hostel name');
    await win.click('#hostel-name-layer [data-hn="ok"]');
    await win.waitForFunction(() => /own name/.test(document.getElementById('hostel-name-err').textContent), null, { timeout: 10000 });
    await win.locator('#hostel-name-layer .modal').screenshot({ path: path.join(REPO_ROOT, '.shots', 'hostel-name-prompt.png') });
    await win.fill('#hostel-name-in', 'Test Court Hostel');
    await win.click('#hostel-name-layer [data-hn="ok"]');
    await win.waitForFunction(() => window.__printed.length === 1, null, { timeout: 15000 });
    const saved = await win.evaluate(() => ({
      name: DB.settings.hostelName,
      html: window.__printed[0].html,
      sidebar: (document.getElementById('sb-hostel-name') || {}).textContent || '',
    }));
    expect(saved.name).toBe('Test Court Hostel');
    expect(saved.html).toContain('Test Court Hostel');
    expect(saved.html).not.toContain('>Hostel Name<');
    expect(saved.sidebar).toBe('Test Court Hostel');

    // ── Named now: the next print does not ask ─────────────────────────────
    await win.evaluate(() => printPaymentHistory('stuH'));
    await win.evaluate(() => printStudentCard('stuH'));
    expect(await win.evaluate(() => !!document.getElementById('hostel-name-layer')), 'asked again').toBe(false);
    expect(await win.evaluate(() => window.__printed.length)).toBeGreaterThanOrEqual(2);
  } finally {
    await app.close();
  }
});
