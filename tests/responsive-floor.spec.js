// ════════════════════════════════════════════════════════════════════════════
// The responsive floor: no page may overflow its window, at any size we ship to.
//
// Renders every page at each display size a hostel PC realistically has, with a
// populated roster, and fails if anything spills past the right edge without a
// scroller around it — or renders an error block.
//
// SIZES ARE CONTENT SIZES (the CSS viewport), NOT MONITOR SIZES. This is the
// distinction that makes the small entries below matter on hardware that looks
// large on paper: Windows display scaling divides a monitor into FEWER CSS
// pixels, so a 1920x1080 screen at 150% is a 1280x720 viewport, and the very
// common 1366x768-at-125% laptop is a 1093x614 one — narrower AND shorter than
// the 1366x768 floor the docs claim, on a machine whose spec sheet says 1366.
//
// A roster is seeded on purpose. An empty table cannot overflow, so measuring
// the app with no data measures nothing.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

const SIZES = [
  { w: 1920, h: 1040, note: '1920x1080 @100%' },
  { w: 1536, h: 816,  note: '1920x1080 @125%' },
  { w: 1366, h: 690,  note: '1366x768  @100%  <- stated QA floor' },
  { w: 1280, h: 660,  note: '1920x1080 @150% / 1280x720 laptop' },
  { w: 1093, h: 614,  note: '1366x768  @125%  (very common OEM default)' },
  { w: 1024, h: 640,  note: '1024x768 / old desktop' },
  { w: 900,  h: 600,  note: 'window minimum from main.js' },
];

const PAGES = ['dashboard', 'students', 'payments', 'rooms', 'expenses',
  'cancellations', 'reports', 'issues', 'activitylog', 'settings',
  'addstudent', 'addpayment'];

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
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

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('no page overflows its window at any shipped display size', async () => {
  test.setTimeout(600000);
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);

  // A roster of 40 is what the layout has to survive, not an empty table.
  await win.evaluate(async () => {
    const first = (DB.rooms && DB.rooms[0]) ? DB.rooms[0].number : '101';
    for (let i = 1; i <= 40; i++) {
      DB.students.push({
        id: 'probe-' + i,
        name: 'Student Number ' + i + ' Longname',
        fatherName: 'Father Of Student ' + i,
        phone: '0300-000' + String(i).padStart(4, '0'),
        room: first, status: 'Active',
        admissionDate: '2026-01-15', monthlyRent: 12000, messIncluded: true,
        cnic: '17301-1234567-' + (i % 10), address: 'Some Street, Some City',
      });
    }
    if (typeof saveDB === 'function') await saveDB();
  });

  const report = [];
  let measured = 0;
  const sample = [];
  for (const size of SIZES) {
    await app.evaluate(({ BrowserWindow }, s) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w.isMaximized()) w.unmaximize();
      w.setContentSize(s.w, s.h);
    }, size);
    await win.waitForTimeout(250);

    const actual = await win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

    for (const page of PAGES) {
      try {
        await win.evaluate(p => { navigate(p); }, page);
      } catch (_) { continue; }
      await win.waitForTimeout(220);

      const m = await win.evaluate(() => {
        const de = document.documentElement;
        const vw = de.clientWidth;
        // Widest element that pushes past the viewport's right edge.
        let worst = null;
        for (const el of document.querySelectorAll('#content *, .chrome *, .sidebar *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const over = Math.round(r.right - vw);
          if (over > 2 && (!worst || over > worst.over)) {
            worst = {
              over,
              tag: el.tagName.toLowerCase(),
              cls: String(el.className || '').split(/\s+/).slice(0, 3).join('.'),
              scrollable: (() => {
                let n = el;
                while (n && n !== document.body) {
                  const ov = getComputedStyle(n).overflowX;
                  if (ov === 'auto' || ov === 'scroll') return true;
                  n = n.parentElement;
                }
                return false;
              })(),
            };
          }
        }
        return {
          docOverflow: Math.round(de.scrollWidth - de.clientWidth),
          bodyOverflow: Math.round(document.body.scrollWidth - document.body.clientWidth),
          worst,
          contentW: Math.round((document.getElementById('content')||{getBoundingClientRect:()=>({width:0})}).getBoundingClientRect().width),
          rows: document.querySelectorAll('#content tbody tr, #content .stu-row, #content .rms-card').length,
          renderError: (document.getElementById('content') || {}).innerHTML
            ? document.getElementById('content').innerHTML.includes('Render Error on') : false,
        };
      });

      measured++;
      if (m.docOverflow > 2 || m.bodyOverflow > 2 || m.renderError || (m.worst && !m.worst.scrollable)) {
        report.push({ size: size.note, viewport: actual, page, ...m });
      }
      if (page === 'payments') sample.push(`${size.note} payments: vw=${actual.w} contentW=${m.contentW} rows=${m.rows}`);
    }
  }

  console.log('\n===== RESOLUTION PROBE =====');
  console.log('page renders measured: ' + measured + ' (expected ' + (SIZES.length * PAGES.length) + ')');
  sample.forEach(l => console.log('  ' + l));
  if (!report.length) console.log('No page overflowed or errored at any tested size.');
  for (const r of report) {
    console.log(
      `[${r.size}] (${r.viewport.w}x${r.viewport.h}) ${r.page}: ` +
      `doc+${r.docOverflow} body+${r.bodyOverflow}` +
      (r.renderError ? ' RENDER-ERROR' : '') +
      (r.worst ? ` | worst: <${r.worst.tag} class="${r.worst.cls}"> +${r.worst.over}px` +
        (r.worst.scrollable ? ' (inside a scroller — ok)' : ' (NOT scrollable)') : ''));
  }
  console.log('===== END PROBE =====\n');

  await app.close();

  /* The message names the size, the page and the element, because "responsive
     test failed" across twelve pages and seven sizes is a bisect nobody wants
     to do by hand. */
  expect(report.map(r => `${r.size} · ${r.page} · doc+${r.docOverflow}` +
    (r.worst ? ` · <${r.worst.tag} class="${r.worst.cls}"> +${r.worst.over}px` : '') +
    (r.renderError ? ' · RENDER ERROR' : ''))).toEqual([]);
});
