// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the paper every PDF is laid out for (owner, 2026-09-15)
//
// "the current pdfs prints size is very small and not fitting to the landscape
// letter paper and also all the pdfs opens upright"
//
// Every page was built for A4 and Chromium shrank it onto Letter. The answers:
//   · one setting, Settings → Paper size, Letter by default;
//   · registers and reports landscape, one-person forms portrait;
//   · type that fills the page.
//
// These assert on the SAVED FILE, not the HTML: a PDF page's /MediaBox is the
// paper it was printed on, in points (Letter 612 × 792, A4 595 × 842). A
// document can say "Letter landscape" in its CSS and still come out portrait A4
// if the window's Save as PDF ignores it — which is what every document outside
// the export engine did.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');
const SHOTS = path.join(REPO_ROOT, '.shots');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); fs.mkdirSync(SHOTS, { recursive: true }); });

async function openApp() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1500, height: 950 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
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

async function seed(win) {
  await win.evaluate(async () => {
    const d = new Date();
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    DB.settings.hostelName = 'Test Hostel';
    DB.settings.roomTypes = [{ id: 'rt1', name: '2-Seater', capacity: 2, defaultRent: 8000, defaultMess: 6500 }];
    DB.rooms = [
      { id: 'r1', number: '1', floor: 'Ground', typeId: 'rt1' },
      { id: 'r2', number: '2', floor: 'Ground', typeId: 'rt1' },
    ];
    DB.students = [
      { id: 's1', name: 'One Room', roomId: 'r1', status: 'Active', joinDate: mk + '-01', phone: '0300-0000011' },
      { id: 's2', name: 'Two Room', roomId: 'r2', status: 'Active', joinDate: mk + '-01', phone: '0300-0000002' },
    ];
    DB.payments = [];
    await saveDB();
  });
}

/* Open a document in the report window, save it through the window's own
   Download PDF with the dialog answered, and read back the page size. */
async function printAndSave(app, win, call, shot, viewport) {
  const target = await app.evaluate(async ({ dialog, app: eapp }) => {
    const out = eapp.getPath('temp').replace(/[\\/]+$/, '') + '\\hx_paper_' + Date.now() + '.pdf';
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: out });
    globalThis.__hxPaperPdf = out;
    return out;
  });
  const reportPromise = app.waitForEvent('window');
  await win.evaluate(call);
  const report = await reportPromise;
  await report.waitForLoadState('domcontentloaded');
  await report.waitForTimeout(600);

  const meta = await report.evaluate(() =>
    JSON.parse((document.querySelector('meta[name="hx-export"]') || {}).content || '{}'));
  /* The page as the printer lays it out: print media, at the paper's printable
     width in CSS px (96 to the inch, less the margins), for the owner to look
     at — and to measure, because Chromium CLIPS what is wider than the page. */
  await report.emulateMedia({ media: 'print' });
  await report.setViewportSize(viewport);
  await report.waitForTimeout(300);
  await report.screenshot({ path: path.join(SHOTS, shot + '.png'), fullPage: true });
  const overflow = await report.evaluate(() => {
    const w = document.documentElement.clientWidth;
    let worst = 0;
    document.querySelectorAll('table, .room-grid, .panels, .stats').forEach(el => {
      worst = Math.max(worst, Math.round(el.getBoundingClientRect().right - w));
    });
    return worst;
  });
  expect(overflow, 'the document is wider than the printable page by ' + overflow + 'px').toBeLessThanOrEqual(1);

  const saved = await report.evaluate(() => window.hostylloPdf.save());
  expect(saved.success, 'the save failed: ' + (saved.reason || '')).toBe(true);
  expect(saved.filePath).toBe(target);

  const box = await app.evaluate(async () => {
    const fs = process.mainModule.require('fs');
    const s = fs.readFileSync(globalThis.__hxPaperPdf).toString('latin1');
    const m = s.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
    return m ? { w: Math.round(Number(m[3]) - Number(m[1])), h: Math.round(Number(m[4]) - Number(m[2])) } : null;
  });
  /* PHOTOCOPY CONTRAST (owner, 2026-09-15: grid lines and card borders "barely
     visible in black and white photostate"). The rules are medium grey #888,
     and a greyscale copy of the page is saved beside the colour one — roughly
     what the photocopier makes of it. */
  const lineColor = await report.evaluate(() => {
    const el = document.querySelector('td, .room-box, .stat');
    return el ? getComputedStyle(el).borderBottomColor : null;
  });
  expect(lineColor, 'the grid / card border is not the #888 photocopy grey').toBe('rgb(136, 136, 136)');
  await report.addStyleTag({ content: 'html{filter:grayscale(1)}' });
  await report.waitForTimeout(200);
  await report.screenshot({ path: path.join(SHOTS, shot + '-bw.png'), fullPage: true });

  await report.close().catch(() => {});
  return { meta, box };
}

test('a register saves as Letter landscape by default', async () => {
  const { app, win } = await openApp();
  await seed(win);
  expect(await win.evaluate(() => paperSize())).toBe('Letter');
  await win.evaluate(() => renderPage('students'));
  await win.waitForTimeout(500);

  const { meta, box } = await printAndSave(app, win, () => exportStudentsPDF(),
    'paper-register-letter', { width: 988, height: 729 });
  expect(meta.pageSize).toBe('Letter');
  expect(meta.landscape).toBe(true);
  expect(box, 'no /MediaBox in the saved PDF').not.toBeNull();
  expect(box).toEqual({ w: 792, h: 612 });

  await app.close();
});

/* The widest register in the app: sixteen columns. It came out ~45px wider
   than a Letter landscape page at the larger type, which clips the Remarks
   column off the printed sheet. printAndSave() fails on any overflow. */
test('the payment register fits a Letter landscape page, charges emphasised', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(async () => {
    const d = new Date();
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    DB.payments = DB.students.map((s, i) => ({
      id: 'p' + i, studentId: s.id, studentName: s.name + ' Rehman',
      roomNumber: DB.rooms.find(r => r.id === s.roomId).number,
      monthlyRent: 8000, messCharge: 6500, messIncluded: true,
      amount: i ? 14500 : 5000, unpaid: i ? 0 : 9500, admissionFee: 0, extraCharges: [],
      method: 'Cash', month: mk, date: mk + '-05', status: i ? 'Paid' : 'Pending',
    }));
    await saveDB();
    renderPage('payments');
  });
  await win.waitForTimeout(500);

  const { meta, box } = await printAndSave(app, win, () => exportPaymentsPDF(),
    'paper-payments-letter', { width: 988, height: 729 });
  expect(meta.landscape).toBe(true);
  expect(box).toEqual({ w: 792, h: 612 });

  await app.close();
});

test('the room visit sheet is a register too — landscape, not upright', async () => {
  const { app, win } = await openApp();
  await seed(win);

  const { meta, box } = await printAndSave(app, win, () => printSeatAvailability(),
    'paper-visit-sheet-letter', { width: 988, height: 729 });
  // It is built outside the export engine, so its print setup comes from _pdfInject().
  expect(meta.pageSize).toBe('Letter');
  expect(meta.landscape, 'the visit sheet still opens upright').toBe(true);
  expect(box).toEqual({ w: 792, h: 612 });

  await app.close();
});

test('Settings → Paper size A4 reaches a portrait form', async () => {
  const { app, win } = await openApp();
  await seed(win);

  // The control is on the Hostel Info panel, and lists the three papers.
  const opts = await win.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = renderHostelInfoPanel();
    const sel = host.querySelector('#hi-paper');
    return sel ? [...sel.options].map(o => o.value) : null;
  });
  expect(opts).toEqual(['Letter', 'A4', 'Legal']);

  await win.evaluate(() => setPaperSize('A4'));
  expect(await win.evaluate(() => DB.settings.paperSize)).toBe('A4');

  const { meta, box } = await printAndSave(app, win, () => printStudentCard('s1'),
    'paper-profile-a4', { width: 703, height: 1003 });
  expect(meta.pageSize).toBe('A4');
  expect(meta.landscape, 'a one-person form stays portrait').toBe(false);
  // Chromium's A4 is 595.92 × 842.88pt, so allow the point either side.
  expect(Math.abs(box.w - 595), 'not A4 wide: ' + box.w).toBeLessThanOrEqual(1);
  expect(Math.abs(box.h - 842), 'not A4 tall: ' + box.h).toBeLessThanOrEqual(1);

  await win.evaluate(() => setPaperSize('Letter'));
  await app.close();
});
