// ════════════════════════════════════════════════════════════════════════════
// The Student Details slide-over (Students spec §22-§30).
//
// The two assertions that matter most are the ones about data the app does NOT
// have. §28 and §29 are explicit — "do not pretend files exist", "do not
// fabricate previous rooms" — and both are easy to violate by accident, because
// a plausible empty row looks like a working feature. So this pins:
//
//   · Documents lists its types as NOT uploaded with the controls disabled,
//     because `docs` holds exactly one key (`photo`) and there is no CNIC scan
//     or admission form anywhere in the data model.
//   · Room History reads DB.roomShifts, which is real, and says so plainly when
//     a student has never moved rather than inventing a first assignment.
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

/** One student who has moved room once, with the optional fields filled. */
async function seed(win, opts) {
  await win.evaluate(async (o) => {
    const mo = thisMonth();
    const rt = DB.settings.roomTypes.find(x => x.id === '2s') || DB.settings.roomTypes[0];
    rt.defaultRent = 10000; rt.defaultMess = 7000;
    DB.rooms = [{ id:'r5', number:'5', floor:'Ground', typeId: rt.id, studentIds:[], amenities:[], notes:'' },
                { id:'r3', number:'3', floor:'Ground', typeId: rt.id, studentIds:[], amenities:[], notes:'' }];
    DB.students = [{ id:'066', name:'Mushtaq Ahmad', fatherName:'Sultan Muhammad', roomId:'r5',
      status:'Blacklisted', joinDate:'2026-08-12', messOptIn:true, phone:'0318-9981202',
      emergencyContact:'Sultan Muhammad (father)', emergencyPhone:'03428521842',
      cnic:'17101-3012345-6', occupation:'MDCAT Preparation', nationality:'Pakistani',
      address:'House # 12, Street 4, Gulberg', dob:'2004-03-15', gender:'Male',
      bloodGroup:'B+', session:'2026-27', bed:'1', email:'m@example.com' }];
    DB.payments = [{ id:'pa', studentId:'066', month: mo, date:'2026-09-01', paidDate:'2026-09-01',
      amount:17000, unpaid:0, overpaid:0, status:'Paid', dueDate:'', method:'Cash',
      monthlyRent:10000, messCharge:7000, messIncluded:true,
      extraCharges:[], extraTotal:0, admissionFee:0, concession:0 }];
    DB.roomShifts = o.withShift ? [{ id:'rs1', studentId:'066', studentName:'Mushtaq Ahmad',
      fromRoomId:'r3', fromRoomNumber:'3', toRoomId:'r5', toRoomNumber:'5',
      date:'2026-09-01', reason:'Requested a quieter room' }] : [];
    await saveDB();
  }, opts || {});
  await win.evaluate(() => navigate('students'));
  await win.waitForSelector('.stu-table', { timeout: 8000 });
  await win.waitForTimeout(300);
}

async function openPanel(win) {
  await win.evaluate(() => showStudentPanel('066'));
  await win.waitForSelector('.stu-pan.is-open', { timeout: 6000 });
  await win.waitForTimeout(300);
}

test('it opens over the roster with exactly four tabs, and closes again', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  const pre = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(pre.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  await seed(win, { withShift: true });
  await openPanel(win);

  // §23: exactly four, in this order, and no fifth.
  expect(await win.evaluate(() => [...document.querySelectorAll('.stu-pan__tab')].map(b => b.innerText.trim())))
    .toEqual(['Overview', 'Financial', 'Documents', 'Room History']);

  // §22: a slide-over, not a page — the table is still behind it.
  expect(await win.evaluate(() => !!document.querySelector('.stu-table'))).toBe(true);
  const w = await win.evaluate(() => Math.round(document.querySelector('.stu-pan').getBoundingClientRect().width));
  expect(w, 'width must stay inside the 400-480 the spec asks for').toBeGreaterThanOrEqual(400);
  expect(w).toBeLessThanOrEqual(480);

  await win.evaluate(() => closeStudentPanel());
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => !document.querySelector('.stu-pan'))).toBe(true);

  expect(pageErrors).toEqual([]);
  await app.close();
});

test('Overview carries the optional fields, and one guardian pair', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: true });
  await openPanel(win);

  const body = await win.evaluate(() => document.getElementById('stu-panel-body').innerText);

  /* The five the owner asked about. They have been on the record and in the CSV
     all along — students.js says so itself — with nothing rendering them. */
  for (const label of ['Date of birth', 'Gender', 'Marital status', 'Blood group',
                       'Session / semester']) {
    expect(body, 'missing optional field: ' + label).toContain(label);
  }
  expect(body).toContain('15-Mar-2004');
  expect(body).toContain('B+');

  /* ONE PAIR, under the Guardian label (owner). The record carries a single
     emergencyContact/emergencyPhone; §24 lists a guardian AND an emergency
     contact, and inventing the second would put two permanently empty rows on
     screen that no form fills. */
  expect(body).toContain('Guardian name');
  expect(body).toContain('Guardian contact');
  expect(body).not.toContain('Emergency contact');

  // A field with no value reads as not recorded, not as data.
  const empties = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-pan__v.is-empty')].map(e => e.innerText.trim()));
  expect(empties.every(v => v === '—')).toBe(true);

  await app.close();
});

test('Financial reads the real payments, through the §14 layer', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: true });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('financial'));
  await win.waitForTimeout(300);

  const body = await win.evaluate(() => document.getElementById('stu-panel-body').innerText.replace(/\s+/g, ' '));
  expect(body).toContain('PKR 10,000');       // rent
  expect(body).toContain('PKR 7,000');        // mess
  expect(body).toContain('PKR 17,000');       // total, and the payment row
  expect(body).toContain('Rent + Mess');
  expect(body).toMatch(/Payment history/i);   // the heading is uppercased in CSS

  // The figures come from the layer, not from a second calculation here.
  const agree = await win.evaluate(() => {
    const f = calculateFeeStatus('066');
    return { status: f.status, outstanding: f.outstanding, last: f.lastPaymentDate };
  });
  expect(agree.status).toBe('Paid');
  expect(agree.outstanding).toBe(0);
  expect(body).toContain('01-Sept-2026');     // last payment, from the record

  await app.close();
});

test('Documents does not pretend files exist', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: true });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('documents'));
  await win.waitForTimeout(300);

  const doc = await win.evaluate(() => ({
    text: document.getElementById('stu-panel-body').innerText.replace(/\s+/g, ' '),
    rows: [...document.querySelectorAll('.stu-pan__doc__n')].map(n => n.innerText.trim()),
    states: [...document.querySelectorAll('.stu-pan__doc__s')].map(n => n.innerText.trim()),
    disabled: [...document.querySelectorAll('.stu-pan__mini')].map(b => b.disabled),
  }));

  expect(doc.rows).toEqual(['Student photo', 'CNIC / ID document', 'Admission form']);
  /* Nothing is uploaded, because `docs` holds only `photo` and this student has
     none. Every control is disabled and the note says why — §28: show it as a
     planned feature rather than pretend. */
  expect(doc.states.every(s => s === 'Not uploaded')).toBe(true);
  expect(doc.disabled.every(Boolean)).toBe(true);
  expect(doc.text).toMatch(/Document storage is not enabled yet/i);

  await app.close();
});

test('Room History reads real shifts, and says so when there are none', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  // With a recorded shift: the move, its reason and its date, from DB.roomShifts.
  await seed(win, { withShift: true });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('history'));
  await win.waitForTimeout(300);
  let body = await win.evaluate(() => document.getElementById('stu-panel-body').innerText.replace(/\s+/g, ' '));
  expect(body).toContain('Room #5');                     // where they are now
  expect(body).toContain('#3');                          // where they came from
  expect(body).toContain('Requested a quieter room');    // the recorded reason
  expect(body).toContain('01-Sept-2026');

  // With none: a plain statement, never a fabricated first assignment (§29).
  await win.evaluate(() => closeStudentPanel());
  await win.waitForTimeout(300);
  await seed(win, { withShift: false });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('history'));
  await win.waitForTimeout(300);
  const none = await win.evaluate(() => ({
    text: document.getElementById('stu-panel-body').innerText.replace(/\s+/g, ' '),
    rows: [...document.querySelectorAll('.stu-pan__hrow')].map(r => r.className),
  }));
  expect(none.text).toMatch(/No room changes recorded/i);
  /* EXACTLY ONE ROW, and it is the current room. The row does carry an arrow —
     "12-Aug-2026 → present" — but that arrow spans the join date to now, which
     is on the record. What must not appear is a SECOND row: a move this student
     never made, or a first assignment inferred from the room they are in. */
  expect(none.rows).toEqual(['stu-pan__hrow is-now']);
  expect(none.text).not.toContain('#3');

  await app.close();
});

test('a Blacklisted student fits their own status cell', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });

  /* "Blacklisted" is the longest word this column holds — nearly twice "Left" —
     and it ran under the actions column. The pill is capped and ellipsises
     inside its cell now, so a longer status added later cannot bring this back. */
  const cell = await win.evaluate(() => {
    const td = document.querySelectorAll('.stu-table tbody tr:first-child td')[11];
    return { text: td.innerText.trim(), overflow: td.scrollWidth - td.clientWidth };
  });
  expect(cell.text).toBe('Blacklisted');
  expect(cell.overflow, 'the status cell is overflowing again').toBeLessThanOrEqual(1);

  await app.close();
});
