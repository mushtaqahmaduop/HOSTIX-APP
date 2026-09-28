// ════════════════════════════════════════════════════════════════════════════
// A deleted student's number — and their payments — never pass to the next
// admission (bug audit BUG-008, 2026-09-28). Reproduced before the fix: delete
// #003, admit someone, the new #003 owed the deleted student's pending 5,000.
// Through the real Add Student form and delete, across a restart.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');
const { settleFreshInstall } = require('./_fresh-install');

const launch = () => { const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env }); };
async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 60000 });
  await win.selectOption('#login-user', 'warden1'); await win.fill('#login-input', 'admin123'); await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 60000 });
}
// Admit one student through the Add Student page; returns the new id.
const admit = (win, name, phone) => win.evaluate(async ([name, phone]) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  navigate('addstudent'); await wait(900);
  const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input')); } };
  set('f-tname', name); set('f-tphone', phone); set('f-troom', DB.rooms.find(r => getRoomOccupancy(r) < getRoomType(r).capacity).id);
  const before = new Set(DB.students.map(s => s.id));
  const _t = []; const _ot = window.toast; window.toast = (m, k) => { _t.push(k + ': ' + m); return _ot && _ot(m, k); };
  await submitAddStudent(); await wait(700);
  window.toast = _ot;
  const modal = ((document.getElementById('modal-container') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 200);
  if (typeof _confirmNo === 'function' && modal) closeModal();
  const s = DB.students.find(x => !before.has(x.id));
  return s ? s.id : ('FAIL ' + JSON.stringify({ toasts: _t, modal }));
}, [name, phone]);

test.beforeAll(() => { resetProfile(); });

test('a deleted student\'s number and payments never pass to the next admission', async () => {
  test.setTimeout(240000);
  let app = await launch(); let win = await app.firstWindow();
  try {
    await login(win); await settleFreshInstall(win);
    await win.evaluate(async () => { DB.students = []; DB.payments = []; if (DB.settings.security) DB.settings.security.pinOn = false; await saveDB(); });
    const a = await admit(win, 'First Student', '3001110001');
    const b = await admit(win, 'Second Student', '3001110002');
    expect([a, b]).toEqual(['001', '002']);

    // #002 gets a pending payment, then is deleted — the payment stays by design.
    await win.evaluate(async (id) => {
      DB.payments.push({ id: 'pOld', studentId: id, studentName: 'Second Student', roomNumber: DB.rooms[0].number, month: thisMonth(), date: '', paidDate: '', amount: 0, unpaid: 5000, overpaid: 0, status: 'Pending', method: 'Cash', monthlyRent: 5000, messCharge: 0, messIncluded: false, extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0 });
      await saveDB();
      await confirmDeleteStudent(id); await new Promise(r => setTimeout(r, 300));
      _confirmYes(); await new Promise(r => setTimeout(r, 600));
    }, b);
    const gone = await win.evaluate(() => ({ students: DB.students.map(s => s.id), kept: DB.payments.filter(p => p.studentId === '002').length }));
    expect(gone).toEqual({ students: ['001'], kept: 1 });
  } finally { await app.close(); }

  // Across a restart, the next admission is a NEW number with nothing attached.
  app = await launch(); win = await app.firstWindow();
  try {
    await login(win);
    await win.evaluate(() => { if (DB.settings.security) DB.settings.security.pinOn = false; });
    const c = await admit(win, 'New Person', '3001110003');
    expect(c, 'the deleted student\'s number was handed out again').toBe('003');
    const inherited = await win.evaluate(id => DB.payments.filter(p => p.studentId === id && p.id === 'pOld').length, c);
    expect(inherited).toBe(0);
    expect(await win.evaluate(() => DB.settings.studentSeq)).toBeGreaterThanOrEqual(3);
  } finally { await app.close(); }
});
