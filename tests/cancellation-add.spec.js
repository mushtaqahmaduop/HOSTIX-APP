// ════════════════════════════════════════════════════════════════════════════
// The Add Cancellation Request form (add and edit cancellation.png, 2026-09-09).
//
// Two decisions are pinned here, because both are places where the reference
// and this app disagree and the disagreement was settled deliberately.
//
// 1. WARN, DO NOT BLOCK. The reference disables "Add to Cancellation List"
//    until dues are zero. Owner's call, 2026-09-09: the button stays live. A
//    warden must be able to put a leaver on notice while they still owe money —
//    the bed is held and billed until the vacate date, and the money is settled
//    at Confirm, which is where this app already collects it. Re-disabling the
//    button would make a student who owes PKR 500 impossible to check out.
//
// 2. THE DUES PANEL IS calculateSettlement(), NOT A SECOND SUM. The reference
//    draws Pending Fees / Fine / Other Dues, and this app has no fine field and
//    no way to attribute a part payment to a component of a bill. The four
//    figures shown are the ones the settlement authority already computes, so
//    the figure read when FILING the request cannot disagree with the figure
//    offered when CONFIRMING it. That is the whole reason it is not a local sum.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch() {
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

  // Two students: one owing half a month, one square.
  await win.evaluate(async () => {
    const r = DB.rooms[0];
    const mk = thisMonth();
    DB.students = [
      { id: '001', name: 'Azat Ullah', roomId: r.id, status: 'Active',
        phone: '0301-9409962', cnic: '35202-1234567-1', joinDate: mk + '-01', gender: 'Male' },
      { id: '002', name: 'Bilal Khan', roomId: r.id, status: 'Active',
        phone: '0302-1111111', joinDate: mk + '-01', gender: 'Male' },
    ];
    DB.payments = [
      { id: 'p1', studentId: '001', studentName: 'Azat Ullah', roomNumber: String(r.number),
        month: mk, monthlyRent: 15000, messCharge: 6000, messIncluded: true,
        amount: 9000, unpaid: 12000, method: 'Cash', status: 'Partial', date: mk + '-02' },
      { id: 'p2', studentId: '002', studentName: 'Bilal Khan', roomNumber: String(r.number),
        month: mk, monthlyRent: 15000, messCharge: 6000, messIncluded: true,
        amount: 21000, unpaid: 0, method: 'Cash', status: 'Paid', date: mk + '-02' },
    ];
    DB.cancellations = [];
    await saveDB();
    renderPage('cancellations');
  });
  await win.waitForTimeout(400);
  return { app, win };
}

test('the dues panel states the settlement authority, figure for figure', async () => {
  const { app, win } = await launch();

  const out = await win.evaluate(() => {
    showAddCancellationModal();
    selectCancStudent('001');
    const panel = document.getElementById('canc-dues');
    const boxes = [...panel.querySelectorAll('.cef-dues__b')].map(b => ({
      k: b.querySelector('span').textContent.trim(),
      v: b.querySelector('b').textContent.trim(),
    }));
    const st = calculateSettlement('001');
    return { boxes, st: { billed: st.billed, collected: st.collected, outstanding: st.outstanding },
             fmt: { billed: fmtPKR(st.billed), collected: fmtPKR(st.collected),
                    due: fmtPKR(st.outstanding) },
             banner: !!panel.querySelector('.cef-due'),
             chip: !!document.querySelector('#canc-who .lk-chip') };
  });

  // Four boxes, in the reference's order, and every one traceable.
  expect(out.boxes.map(b => b.k)).toEqual(['Billed', 'Collected', 'Advance credit', 'Total due']);
  expect(out.boxes[0].v).toBe(out.fmt.billed);
  expect(out.boxes[1].v).toBe(out.fmt.collected);
  expect(out.boxes[3].v).toBe(out.fmt.due);
  // The arithmetic the panel is claiming.
  expect(out.st.outstanding).toBe(12000);
  expect(out.banner, 'the outstanding-dues warning is shown').toBe(true);
  expect(out.chip, 'the student card carries the Dues pending chip').toBe(true);

  await app.close();
});

test('dues warn but never block — the request can still be filed', async () => {
  const { app, win } = await launch();

  const btn = await win.evaluate(() => {
    showAddCancellationModal();
    selectCancStudent('001');                    // owes 12,000
    const b = [...document.querySelectorAll('.modal-footer button')]
      .find(x => x.textContent.includes('Add to Cancellation List'));
    return { disabled: b.disabled, present: !!b };
  });
  expect(btn.present).toBe(true);
  expect(btn.disabled, 'a student who owes money must still be able to go on notice').toBe(false);

  // And it writes, and the bed is HELD rather than freed.
  const after = await win.evaluate(async () => {
    document.getElementById('canc-vacate').value = thisMonth() + '-28';
    document.getElementById('canc-reason').value = 'Shifting to own house';
    await saveCancellation();
    const c = (DB.cancellations || [])[0];
    const s = DB.students.find(x => x.id === '001');
    return { filed: !!c, status: c && c.status, student: s.status, reason: c && c.reason };
  });
  expect(after.filed).toBe(true);
  expect(after.status).toBe('Pending');
  // RESIDENT_STATUSES still counts them — they keep the bed until the vacate date.
  expect(after.student).toBe('Cancelling');
  expect(after.reason).toBe('Shifting to own house');

  await app.close();
});

test('nothing outstanding is stated outright, not left blank', async () => {
  const { app, win } = await launch();

  const out = await win.evaluate(() => {
    showAddCancellationModal();
    selectCancStudent('002');                    // square
    const panel = document.getElementById('canc-dues');
    return { clear: !!panel.querySelector('.caf-clear-note'),
             warn:  !!panel.querySelector('.cef-due'),
             text:  panel.textContent.trim() };
  });

  // A blank where the dues panel would be reads as "not loaded yet", and a
  // warden then opens the ledger to check what the form already knew.
  expect(out.warn).toBe(false);
  expect(out.clear).toBe(true);
  expect(out.text).toContain('Nothing outstanding');

  await app.close();
});

test('the reason picker fills the notes box instead of replacing what was typed', async () => {
  const { app, win } = await launch();

  const out = await win.evaluate(() => {
    showAddCancellationModal();
    selectCancStudent('002');
    const box = document.getElementById('canc-reason');
    box.value = 'family emergency at home';
    cafPickReason('Going back to hometown');
    const kept = box.value;
    cafCount();
    return { kept, counter: document.getElementById('caf-count').textContent,
             options: [...document.getElementById('canc-reason-pick').options].map(o => o.value) };
  });

  expect(out.kept).toContain('Going back to hometown');
  expect(out.kept, 'typing must survive a pick').toContain('family emergency at home');
  expect(out.counter).toBe(out.kept.length + '/500');
  // One list, shared with the edit form — CANC_REASONS.
  expect(out.options).toContain('Course completed');
  expect(out.options).toContain('Discipline');

  await app.close();
});

test('picking a student fills the room, and clearing takes the cards down with it', async () => {
  const { app, win } = await launch();

  const out = await win.evaluate(() => {
    showAddCancellationModal();
    selectCancStudent('001');
    const filled = document.getElementById('canc-room-display').value;
    cafClearStudent();
    return { filled,
             room:  document.getElementById('canc-room-display').value,
             id:    document.getElementById('canc-student').value,
             who:   document.getElementById('canc-who').innerHTML.trim(),
             dues:  document.getElementById('canc-dues').innerHTML.trim() };
  });

  expect(out.filled).toContain('Room #');
  expect(out.room).toBe('');
  expect(out.id).toBe('');
  expect(out.who).toBe('');
  expect(out.dues, 'a stale dues panel under a cleared search is the wrong answer').toBe('');

  await app.close();
});
