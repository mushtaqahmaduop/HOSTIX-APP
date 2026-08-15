// Settings is the source of the monthly charge. A stale rent copied onto a
// student or a room must not outrank the rate configured in Settings, and no
// repair action should be needed to make the payment screen correct.
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_REAL_PROFILE;
const ELECTRON = require('electron');

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_REAL_PROFILE env var is not set');
  const pristine = process.env.HOSTIX_REAL_DB_PRISTINE;
  if (pristine && fs.existsSync(pristine)) {
    for (const f of fs.readdirSync(PROFILE)) {
      if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
    }
    fs.copyFileSync(pristine, path.join(PROFILE, 'hostix.db'));
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('the payment screen is correct on untouched real data, with no repair', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForFunction(() => typeof DB !== 'undefined' && DB.rooms && DB.rooms.length > 0,
    null, { timeout: 30000 });
  await win.evaluate(() => {
    const s = document.getElementById('login-screen'); if (s) s.style.display = 'none';
    CUR_USER = { id: 'warden1', name: 'Diag', role: 'admin',
      perms: PERM_KEYS.reduce(function (a, k) { a[k] = true; return a; }, {}) };
  });

  // The data is deliberately NOT repaired: rooms still hold 14,500 and student
  // 065 still has rent 14,500 on their record.
  const raw = await win.evaluate(() => {
    const s = DB.students.find(x => x.id === '065');
    const room = DB.rooms.find(r => r.id === (s && s.roomId));
    const t = room ? DB.settings.roomTypes.find(x => x.id === room.typeId) : null;
    return { studentRent: s && s.rent, studentMess: s && s.mess, pinned: !!(s && s._rentManuallySet),
             roomRent: room && room.rent, typeRent: t && t.defaultRent, typeMess: t && t.defaultMess };
  });
  console.log('\n[untouched stored values]\n' + JSON.stringify(raw, null, 2));
  expect(raw.studentRent, 'fixture: student 065 should still hold the stale rent').toBe(14500);
  expect(raw.roomRent,    'fixture: room should still hold the all-in rent').toBe(14500);

  // What the payment form now shows for that student.
  await win.evaluate(() => openAddPayment('065'));
  await win.waitForSelector('#f-pcharge', { timeout: 8000 });
  await win.waitForFunction(
    () => document.getElementById('f-pstudent') &&
          document.getElementById('f-pstudent').value === '065',
    null, { timeout: 8000 });
  const modal = await win.evaluate(() => {
    const q = id => document.getElementById(id);
    return { rent: q('f-prent').value, mess: q('f-pmess').value, unpaid: q('f-punpaid').value,
             strip: q('selected-student-info').innerText.replace(/\n+/g, ' | ') };
  });
  console.log('\n[payment modal, no repair run]\n' + JSON.stringify(modal, null, 2));

  expect(modal.rent,   'Room Rent must come from Settings').toBe(String(raw.typeRent));
  expect(modal.mess,   'Mess must come from Settings').toBe(String(raw.typeMess));
  expect(Number(modal.unpaid), 'monthly charge').toBe(raw.typeRent + raw.typeMess);
  expect(modal.strip).toContain('hostel default');

  // Every active student now resolves to the configured rate.
  const off = await win.evaluate(() => {
    const out = [];
    DB.students.filter(s => s.status === 'Active').forEach(s => {
      const room = DB.rooms.find(r => r.id === s.roomId);
      const t = room ? DB.settings.roomTypes.find(x => x.id === room.typeId) : null;
      if (!t || !(Number(t.defaultRent) > 0)) return;
      const want = (Number(t.defaultRent) || 0) + (s.messOptIn !== false ? (Number(t.defaultMess) || 0) : 0);
      const c = resolveCharges(s);
      if (c.total !== want && !c.pinned) out.push({ id: s.id, name: s.name, got: c.total, want });
    });
    return out;
  });
  console.log('[unpinned students off the hostel default] ' + off.length);
  expect(off, 'an unpinned student is not following Settings').toEqual([]);

  // A brand-new admission into any free room matches too.
  const newAdm = await win.evaluate(() => {
    const room = DB.rooms.find(r => {
      const t = DB.settings.roomTypes.find(x => x.id === r.typeId);
      return t && getRoomOccupancy(r) < t.capacity;
    });
    const t = DB.settings.roomTypes.find(x => x.id === room.typeId);
    return { got: resolveCharges({ roomId: room.id }).total,
             want: Number(t.defaultRent) + Number(t.defaultMess) };
  });
  console.log('[new admission] got ' + newAdm.got + ' want ' + newAdm.want);
  expect(newAdm.got, 'a new admission is still overcharged').toBe(newAdm.want);

  await app.close();
});
