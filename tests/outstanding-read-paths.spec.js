// ════════════════════════════════════════════════════════════════════════════
// §14 — every screen that PRINTS a balance asks calculateOutstanding(p).
//
// This is the §14 recurring bug in its read-path disguise. The write side has
// been fixed twice; the read side kept two habits that quietly under-state what
// a student owes, and both of them look correct:
//
//   · `p.unpaid || 0` — a stored field. It is absent on a legacy record and on
//     anything written before that field existed, so the screen prints an em
//     dash and the student reads as settled.
//   · `.filter(p => p.status === 'Pending')` before summing — which drops a
//     record marked Paid that still carries a balance. outstandingOf() answers
//     a recorded `unpaid` FIRST AND ALWAYS, on purpose (see the note above it
//     in utils.js): the Edit Payment form takes the status from a free dropdown
//     while the balance beside it is readonly, so a warden can mark a part-paid
//     record Paid and save real money with it.
//
// Neither failure throws. Both print a smaller, plausible number. That is why
// these are pinned by comparing the two ledgers against EACH OTHER — the panel
// and the old profile modal describe the same student, and the day they
// disagree one of them is lying about money.
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

/* One student billed 17,000 a month — 10,000 rent + 7,000 mess — and whatever
   payment records the caller hands over. The charge comes from Settings, which
   is what outstandingOf() prices a record against when it has to derive. */
async function seed(win, payments) {
  await win.evaluate(async (pays) => {
    const rt = DB.settings.roomTypes.find(x => x.id === '2s') || DB.settings.roomTypes[0];
    rt.defaultRent = 10000; rt.defaultMess = 7000;
    DB.rooms = [{ id:'r5', number:'5', floor:'Ground', typeId: rt.id, studentIds:[], amenities:[], notes:'' }];
    DB.students = [{ id:'066', name:'Mushtaq Ahmad', fatherName:'Sultan Muhammad', roomId:'r5',
      status:'Active', joinDate:'2026-07-01', messOptIn:true, phone:'0318-9981202', bed:'1' }];
    DB.roomShifts = [];
    DB.payments = pays.map(p => Object.assign({
      studentId:'066', studentName:'Mushtaq Ahmad', roomId:'r5', roomNumber:'5',
      monthlyRent:10000, messCharge:7000, messIncluded:true, method:'Cash',
      extraCharges:[], extraTotal:0, admissionFee:0, concession:0, overpaid:0, dueDate:'',
    }, p));
    await saveDB();
  }, payments);
  await win.evaluate(() => navigate('students'));
  await win.waitForSelector('.stu-table', { timeout: 8000 });
  await win.waitForTimeout(300);
}

/** The nine-column ledger, whoever is rendering it. */
async function readLedger(win) {
  return win.evaluate(() => ({
    bar:  document.querySelector('.svw-card__head--bar').innerText.replace(/\s+/g, ' '),
    unpaid: [...document.querySelectorAll('.svw-t tbody tr')]
              .map(r => r.children[4].innerText.replace(/\s+/g, ' ').trim()),
  }));
}

// ────────────────────────────────────────────────────────────────────────────
test('a record with no stored balance is priced, not written off', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  /* THE LEGACY SHAPE: no `unpaid` key at all. 4,000 came in against a 17,000
     charge, so 13,000 is owed. The old read printed an em dash here and put
     the 4,000 COLLECTED into the Due total, as if what was handed over were
     what was still owing. */
  await seed(win, [
    { id:'legacy', month:'2026-08', amount:4000, status:'Pending', date:'2026-08-04' },
  ]);

  await win.evaluate(() => showStudentPanel('066'));
  await win.waitForSelector('.stu-pan.is-open', { timeout: 6000 });
  await win.evaluate(() => stuPanelTab('financial'));
  await win.waitForTimeout(300);
  const panel = await readLedger(win);

  await win.evaluate(() => closeStudentPanel());
  await win.waitForTimeout(300);
  await win.evaluate(() => showViewStudentModal('066'));
  await win.waitForSelector('.svw-t', { timeout: 6000 });
  await win.waitForTimeout(200);
  const modal = await readLedger(win);

  expect(panel.unpaid).toEqual(['Rs. 13,000']);
  expect(panel.bar).toContain('Due Rs. 13,000');

  /* AND THE SAME FIGURE FROM THE OTHER VIEW. showViewStudentModal is still the
     student view for the dashboard, reports, rooms, the command palette and
     WhatsApp, so a disagreement here is not cosmetic — it is two screens giving
     a warden two different answers to "what does this student owe". */
  expect(modal.unpaid, 'the modal ledger disagrees with the panel').toEqual(panel.unpaid);
  expect(modal.bar).toContain('Due Rs. 13,000');

  await app.close();
});

// ────────────────────────────────────────────────────────────────────────────
test('a balance saved on a record marked Paid is still owed', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  /* 14,500 collected, 2,500 still recorded against it, status Paid — what the
     Edit Payment form lets a warden save. Summing only Pending rows loses the
     2,500 without a trace. */
  await seed(win, [
    { id:'stale', month:'2026-08', amount:14500, unpaid:2500, status:'Paid',
      date:'2026-08-01', paidDate:'2026-08-01' },
  ]);

  await win.evaluate(() => showViewStudentModal('066'));
  await win.waitForSelector('.svw-t', { timeout: 6000 });
  await win.waitForTimeout(200);
  const led = await readLedger(win);

  expect(led.unpaid).toEqual(['Rs. 2,500']);
  expect(led.bar, 'a Paid row carrying a balance was dropped from the total')
    .toContain('Due Rs. 2,500');

  await app.close();
});
