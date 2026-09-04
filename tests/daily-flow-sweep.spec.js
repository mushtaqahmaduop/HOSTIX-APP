// ════════════════════════════════════════════════════════════════════════════
// Daily-flow sweep — the screens a warden opens every shift, checked for the
// failures that reach a customer's eyes rather than a stack trace.
//
// The suite already proves each flow WORKS. This asks a different question:
// when it works, does it PRINT something a human should never see? A rendered
// "NaN", "undefined", "[object Object]" or "Invalid Date" is not a crash, so no
// existing assertion catches it — it just quietly appears on a screen during a
// demo and reads as a broken product.
//
// It also fails on any console error raised while navigating, which is the
// cheapest possible regression net across twelve screens.
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path'); const fs = require('fs');
const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts(){ const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON, args:[REPO_ROOT,'--dev','--user-data-dir='+PROFILE,'--no-sandbox','--disable-gpu'], env }; }

// Every screen reachable from the rail.
const SCREENS = ['dashboard','students','rooms','payments','expenses','cancellations',
                 'reports','issues','archive','activitylog','backup','settings'];

// What must never be rendered as text.
//
// Bare "null"/"undefined" are matched with word boundaries so ordinary prose
// and class names cannot trip them. "PKR NaN" is listed separately from "NaN"
// because a money field is the one place it is unambiguous.
const POISON = [
  { re: /\bNaN\b/,            name: 'NaN' },
  { re: /\[object Object\]/,  name: '[object Object]' },
  { re: /\bInvalid Date\b/,   name: 'Invalid Date' },
  { re: /\bundefined\b/,      name: 'undefined' },
  { re: /PKR\s*(NaN|undefined|null)/i, name: 'broken money' },
];

test.beforeAll(() => {
  for (const f of fs.readdirSync(PROFILE)) if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE,f),{force:true});
  fs.rmSync(path.join(PROFILE,'Local Storage'),{recursive:true,force:true});
});

test('no daily screen renders NaN, undefined or a broken date', async () => {
  test.setTimeout(300000);
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();

  const consoleErrors = [];
  win.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  win.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#login-input',{state:'visible',timeout:60000});
  await win.waitForFunction(()=>typeof WARDENS!=='undefined'&&WARDENS.warden1&&WARDENS.warden1.pw,null,{timeout:30000});
  await win.fill('#login-user','warden1'); await win.fill('#login-input','admin123'); await win.click('#login-btn');
  await win.waitForFunction(()=>{const s=document.getElementById('login-screen');return s&&s.style.display==='none';},null,{timeout:30000});

  const findings = [];
  console.log('\n===== DAILY FLOW SWEEP =====');

  for (const page of SCREENS) {
    const ok = await win.evaluate((p) => {
      if (typeof navigate !== 'function') return false;
      navigate(p); return true;
    }, page);
    if (!ok) { console.log('  ' + page.padEnd(13) + 'navigate() unavailable'); continue; }
    await win.waitForTimeout(700);

    // Read the CONTENT area only. The rail and header repeat on every screen,
    // so a single defect there would otherwise be reported twelve times.
    const text = await win.evaluate(() => {
      const el = document.getElementById('content') || document.body;
      return el.innerText || '';
    });

    const hits = [];
    for (const p of POISON) {
      const m = text.match(p.re);
      if (!m) continue;
      // Quote the surrounding line, which is what makes a finding actionable.
      const line = (text.split('\n').find(l => p.re.test(l)) || '').trim().slice(0, 110);
      hits.push(p.name + '  ->  "' + line + '"');
    }

    console.log('  ' + page.padEnd(13) + (hits.length ? 'FOUND ' + hits.length : 'clean'));
    for (const h of hits) { console.log('      ' + h); findings.push(page + ': ' + h); }
  }

  console.log('\n  console errors: ' + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 15)) console.log('      ' + e.slice(0, 200));
  console.log('===== END =====\n');

  await app.close();

  expect(findings, 'screens rendering values no human should see').toEqual([]);
  expect(consoleErrors, 'console errors raised while walking the daily screens').toEqual([]);
});

// ════════════════════════════════════════════════════════════════════════════
// The same walk, over the records a real hostel actually accumulates.
//
// The test above passes on seeded demo data, which is the easy case. Every
// record below is one a live install genuinely produces:
//
//   · a student admitted before a room was assigned
//   · a room whose type nobody has priced yet
//   · a payment written BEFORE the rent/mess split existed — the state all
//     ~50 installs in the field are in, and the one most likely to be wrong
//   · a record imported from Excel with no join date
//   · a student on notice
//
// None of it is hostile input; that is what html-escaping.spec.js is for.
// ════════════════════════════════════════════════════════════════════════════
test('the daily screens survive the records a real hostel accumulates', async () => {
  test.setTimeout(300000);
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();

  const consoleErrors = [];
  win.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  win.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#login-input',{state:'visible',timeout:60000});
  await win.waitForFunction(()=>typeof WARDENS!=='undefined'&&WARDENS.warden1&&WARDENS.warden1.pw,null,{timeout:30000});
  await win.fill('#login-user','warden1'); await win.fill('#login-input','admin123'); await win.click('#login-btn');
  await win.waitForFunction(()=>{const s=document.getElementById('login-screen');return s&&s.style.display==='none';},null,{timeout:30000});

  await win.evaluate(async () => {
    // The demo rooms seeded on first boot would mask these; start from ours.
    DB.rooms = []; DB.students = []; DB.payments = []; DB.cancellations = [];

    DB.settings.roomTypes.push({ id: 'zz', name: 'Unpriced', capacity: 2,
      defaultRent: 0, defaultMess: 0, color: '#888888' });

    DB.rooms.push(
      { id: 'rmP', number: '12',   floor: 'Ground', typeId: '2s', studentIds: [], amenities: [], notes: '' },
      { id: 'rmU', number: 'A 01', floor: '1st',    typeId: 'zz', studentIds: [], amenities: [], notes: '' }
    );

    DB.students.push(
      // Priced, ordinary — the control.
      { id: 'S1', name: 'Priced Student', roomId: 'rmP', messOptIn: true,
        status: 'Active', joinDate: '2026-01-10', paymentMethod: 'Cash' },
      // Nobody has set a rent on this room's type yet.
      { id: 'S2', name: 'Unpriced Student', roomId: 'rmU', messOptIn: true,
        status: 'Active', joinDate: '2026-02-01', paymentMethod: 'Cash' },
      // Admitted, no bed allocated yet.
      { id: 'S3', name: 'Unassigned Student', roomId: null, messOptIn: false,
        status: 'Active', joinDate: '2026-03-05', paymentMethod: 'Cash' },
      // Came in from an Excel import with no join date.
      { id: 'S4', name: 'Imported Student', roomId: 'rmP', messOptIn: true,
        status: 'Active', paymentMethod: 'Cash' },
      // Has given notice — still resident, still billed.
      { id: 'S5', name: 'Leaving Student', roomId: 'rmP', messOptIn: true,
        status: 'Active', joinDate: '2026-01-20', paymentMethod: 'Cash',
        noticeDate: '2026-09-01', expectedLeaveDate: '2026-09-30' }
    );
    for (const r of DB.rooms) r.studentIds = DB.students.filter(s => s.roomId === r.id).map(s => s.id);

    const ym = new Date().toISOString().slice(0, 7);
    DB.payments.push(
      // A record written BEFORE the rent/mess split: an amount and nothing to
      // explain it. This is the shape sitting in every install in the field.
      { id: 'P1', studentId: 'S1', studentName: 'Priced Student', month: ym,
        amount: 14500, status: 'Paid', method: 'Cash', date: ym + '-05' },
      // Unpaid, against the student nobody has priced.
      { id: 'P2', studentId: 'S2', studentName: 'Unpriced Student', month: ym,
        amount: 0, status: 'Pending', method: 'Cash' }
    );

    DB.cancellations.push({ id: 'C1', studentId: 'S5', studentName: 'Leaving Student',
      requestDate: '2026-09-01', leaveDate: '2026-09-30', status: 'Pending', reason: 'Graduating' });

    await saveDB();
  });

  const findings = [];
  console.log('\n===== SWEEP WITH REAL-WORLD RECORDS =====');

  for (const page of SCREENS) {
    await win.evaluate((p) => { if (typeof navigate === 'function') navigate(p); }, page);
    await win.waitForTimeout(800);

    const text = await win.evaluate(() => {
      const el = document.getElementById('content') || document.body;
      return el.innerText || '';
    });

    const hits = [];
    for (const p of POISON) {
      if (!p.re.test(text)) continue;
      const line = (text.split('\n').find(l => p.re.test(l)) || '').trim().slice(0, 110);
      hits.push(p.name + '  ->  "' + line + '"');
    }
    console.log('  ' + page.padEnd(13) + (hits.length ? 'FOUND ' + hits.length : 'clean'));
    for (const h of hits) { console.log('      ' + h); findings.push(page + ': ' + h); }
  }

  console.log('\n  console errors: ' + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 15)) console.log('      ' + e.slice(0, 220));
  console.log('===== END =====\n');

  await app.close();

  expect(findings, 'screens rendering values no human should see').toEqual([]);
  expect(consoleErrors, 'console errors raised on real-world records').toEqual([]);
});
