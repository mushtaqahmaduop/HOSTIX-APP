// ════════════════════════════════════════════════════════════════════════════
// Profile, Admission Form and Undertaking on screen (warden ledger spec §2.7,
// §3.7, §3.8, §5 step 11).
//
// tests/undertaking.test.js proves the rules. This proves the screens and the
// printed documents: the starter text blocks an original, Settings saves a
// version, the first Admission Form confirms and records the signing, a later
// print is a REPRINT of the signed version, the profile has no payment table
// or signature line, Payment History prints every ledger entry, the signed
// scan reprints watermarked (images) and not at all (PDF), and the filter.
//
// Printed HTML is captured by replacing _electronPDF for the run and saved to
// .shots/ for review.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');
const SHOTS = path.join(REPO_ROOT, '.shots');

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

const lastPrint = win => win.evaluate(() => window.__printed[window.__printed.length - 1] || null);
const printCount = win => win.evaluate(() => window.__printed.length);

test.beforeAll(() => { resetProfile(); fs.mkdirSync(SHOTS, { recursive: true }); });

test('admission form: rules versions, the original once, reprints watermarked, profile and history', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    await win.evaluate(async () => {
      window.__printed = [];
      _electronPDF = (html, name) => { window.__printed.push({ html, name }); };
      DB.settings.serviceModel = 'rent_mess_optional';
      DB.settings.hostelName = 'Test Hostel';   // a real name, so no print stops to ask for one
      DB.settings.undertaking = undefined;
      const rt = DB.settings.roomTypes.find(x => x.id === '2s');
      rt.defaultRent = 10000; rt.defaultMess = 7000;
      DB.rooms = [{ id: 'rmU', number: 'U1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [
        { id: 'stuU', name: 'Undertaking Student', fatherName: 'Guardian Sahib', roomId: 'rmU', status: 'Active',
          messOptIn: true, joinDate: '2026-01-01', paymentMethod: 'Cash', cnic: '17301-1234567-1' },
        { id: 'stuV', name: 'Second Student', roomId: 'rmU', status: 'Active', messOptIn: true,
          joinDate: '2026-01-01', paymentMethod: 'Cash' },
      ];
      DB.payments = []; DB.cancellations = []; DB.concessions = [];
      await saveDB();
      await generateMonthlyRents();
      const p = DB.payments.find(x => x.studentId === 'stuU');
      applyPayment(p, { amount: 9000, method: 'Cash' });
      ledgerTrack(p);
      await saveDB();
    });

    // ── The starter text blocks an original ────────────────────────────────
    await win.evaluate(() => printAdmissionForm('stuU'));
    expect(await printCount(win), 'an original printed on the starter text').toBe(0);
    expect(await win.evaluate(() => DB.students[0].firstSignedAt || null)).toBeNull();

    // ── Settings → Rules & Undertaking: save version 1 ─────────────────────
    await win.evaluate(() => { settingsTab = 'rules'; navigate('settings'); });
    await win.waitForSelector('#und-rules', { timeout: 15000 });
    expect(await win.locator('#und-state').textContent()).toContain('Starter text');
    await win.locator('.settings-panel.active').screenshot({ path: path.join(SHOTS, 'step11-settings-rules.png') });
    await win.click('#und-save');
    await win.waitForFunction(() => undVersions().length === 1, null, { timeout: 10000 });

    // ── The first Admission Form asks, then records the original ───────────
    await win.evaluate(() => showStudentPanel('stuU'));
    await win.waitForSelector('#stu-panel', { timeout: 15000 });
    await win.click('#stu-panel .stu-pan__act:has-text("Admission Form")');
    await win.waitForSelector('.modal-footer .btn-danger', { timeout: 10000 });
    await win.click('.modal-footer .btn-danger');
    await win.waitForFunction(() => window.__printed.length === 1, null, { timeout: 15000 });
    const signed = await win.evaluate(() => {
      const s = DB.students.find(x => x.id === 'stuU');
      return { at: s.firstSignedAt, v: s.rulesVersionAtSigning, today: today() };
    });
    expect(signed.at).toBe(signed.today);
    expect(signed.v).toBe(1);
    let doc = await lastPrint(win);
    fs.writeFileSync(path.join(SHOTS, 'step11-admission-original.html'), doc.html);
    expect(doc.html).toContain('Rules &amp; Undertaking · Version 1');
    expect(doc.html).toContain('Residents must carry their hostel ID');
    for (const who of ['Student', 'Guardian', 'Warden / Admin']) expect(doc.html).toContain('<b>' + who + '</b>');
    expect(doc.html).toContain('Guardian Sahib');
    expect(doc.html, 'the original is marked as a reprint').not.toContain('REPRINT');

    // ── A new version, then a reprint of the version signed ────────────────
    await win.evaluate(async () => {
      const r = undSave({ rules: 'Version two rule only', declaration: 'Version two declaration' });
      await saveDB();
      return r;
    });
    await win.evaluate(() => printAdmissionForm('stuU'));
    await win.waitForFunction(() => window.__printed.length === 2, null, { timeout: 15000 });
    expect(await win.evaluate(() => !!document.querySelector('.modal-footer .btn-danger')), 'a reprint asked again').toBe(false);
    doc = await lastPrint(win);
    fs.writeFileSync(path.join(SHOTS, 'step11-admission-reprint.html'), doc.html);
    expect(doc.html).toContain('REPRINT — originally signed');
    expect(doc.html).toContain('Version 1');
    expect(doc.html, 'the reprint used the new rules').not.toContain('Version two rule only');

    // ── Print Profile: summary only ────────────────────────────────────────
    await win.evaluate(() => printStudentCard('stuU'));
    doc = await lastPrint(win);
    fs.writeFileSync(path.join(SHOTS, 'step11-profile.html'), doc.html);
    expect(doc.html).toContain('Pending Balance');
    expect(doc.html).toContain('Last Payment');
    expect(doc.html).not.toContain('Full Payment History');
    expect(doc.html).not.toContain('Authorised By');
    expect(doc.html).not.toContain('Rules &amp; Undertaking');
    expect(doc.html).toContain('HOSTYLLO Offline');

    // ── Print Payment History: every ledger entry ──────────────────────────
    await win.evaluate(() => { showStudentPanel('stuU', 'financial'); });
    await win.waitForSelector('#stu-print-history', { timeout: 15000 });
    await win.click('#stu-print-history');
    doc = await lastPrint(win);
    fs.writeFileSync(path.join(SHOTS, 'step11-payment-history.html'), doc.html);
    const want = await win.evaluate(() => ledgerEntriesFor('stuU').length);
    expect(want).toBeGreaterThan(1);
    expect((doc.html.match(/<tr>\s*<td>/g) || []).length).toBe(want);

    // ── The signed scan: image reprints watermarked, PDF does not ──────────
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await win.evaluate(async src => {
      const s = DB.students.find(x => x.id === 'stuU');
      s.docs = { files: [{ id: 'docU', kind: 'undertaking', label: 'Signed undertaking', name: 'scan.png',
                           type: 'image/png', size: 70, data: src, addedAt: today() }] };
      await saveDB();
      showStudentPanel('stuU', 'documents');
    }, png);
    await win.waitForSelector('#stu-und-state', { timeout: 15000 });
    expect(await win.locator('#stu-und-state').textContent()).toContain('rules v1');
    const reprintBtn = win.locator('#stu-panel button:has-text("Reprint")');
    expect(await reprintBtn.isDisabled()).toBe(false);
    await win.locator('#stu-panel').screenshot({ path: path.join(SHOTS, 'step11-documents.png') });
    await reprintBtn.click();
    doc = await lastPrint(win);
    expect(doc.html).toContain('REPRINT — originally signed');
    expect(doc.html).toContain(png.slice(0, 40));

    await win.evaluate(async () => {
      const s = DB.students.find(x => x.id === 'stuU');
      s.docs.files[0].type = 'application/pdf';
      await saveDB();
      showStudentPanel('stuU', 'documents');
    });
    await win.waitForSelector('#stu-und-state', { timeout: 15000 });
    expect(await win.locator('#stu-panel button:has-text("Reprint")').isDisabled(), 'a PDF scan offered a reprint').toBe(true);

    // ── The Students filter ────────────────────────────────────────────────
    await win.evaluate(() => { closeStudentPanel(); navigate('students'); });
    await win.waitForSelector('#stu-und-filter', { timeout: 15000 });
    const shown = await win.evaluate(() => {
      const names = () => [...document.querySelectorAll('#content')].map(n => n.textContent).join(' ');
      studentFilter.month = ''; studentFilter.und = 'noscan'; renderPage('students');
      return new Promise(r => setTimeout(() => {
        const a = names();
        studentFilter.und = 'scan'; renderPage('students');
        setTimeout(() => { const b = names(); studentFilter.und = 'All'; r({ a, b }); }, 300);
      }, 300));
    });
    expect(shown.a).toContain('Second Student');
    expect(shown.a).not.toContain('Undertaking Student');
    expect(shown.b).toContain('Undertaking Student');
    expect(shown.b).not.toContain('Second Student');
  } finally {
    await app.close();
  }
});
