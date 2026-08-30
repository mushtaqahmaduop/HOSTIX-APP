// ════════════════════════════════════════════════════════════════════════════
// Room-rent drift → double-counted mess, and the repair.
//
// Reproduces the shape found on a live install: the hostel splits its charge
// into Room Rent + Mess in Settings, but room.rent is left holding the OLD
// ALL-IN figure (rent + mess added together) because applyRentByType() never
// wrote through to rooms. When billing read rent off the room and mess off the
// room type, a new student was charged the mess twice.
//
// Asserts: the stale figure no longer affects what anyone is charged (Settings
// is the source), an explicit per-student rate still wins, the drift is still
// detected and tidied, Settings writes through to rooms, and neither student
// totals nor Paid records are disturbed by the tidy-up.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

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

test.beforeAll(() => {
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
  if (!fs.existsSync(path.join(PROFILE, 'license.enc')))
    throw new Error('Isolated profile is missing license.enc: ' + PROFILE);
  for (const f of fs.readdirSync(PROFILE)) {
    if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE, f), { force: true });
  }
  fs.rmSync(path.join(PROFILE, 'Local Storage'), { recursive: true, force: true });
});

test('a room left on the pre-split all-in rent is detected and repaired', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(500);

  const preStuds = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(preStuds.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  // ── Fixture: split charge in Settings, room still on the all-in figure ─────
  const RENT = 8000, MESS = 6500, ALL_IN = RENT + MESS;   // 14,500
  await win.evaluate(async ([rent, mess, allIn]) => {
    const t = DB.settings.roomTypes.find(x => x.id === '2s');
    t.defaultRent = rent;
    t.defaultMess = mess;
    DB.rooms.push({ id: 'room_drift', number: 'D1', floor: 'Ground', typeId: '2s',
      rent: allIn, studentIds: [], amenities: [], notes: '' });
    // A student already living there, correctly on the split.
    DB.students.push({ id: '900', name: 'Sitting Student', roomId: 'room_drift',
      rent: rent, mess: mess, messOptIn: true, status: 'Active',
      joinDate: today(), paymentMethod: 'Cash' });
    // A Paid receipt that must never be rewritten.
    DB.payments.push({ id: 'p_paid', studentId: '900', studentName: 'Sitting Student',
      roomId: 'room_drift', roomNumber: 'D1', amount: allIn, monthlyRent: rent,
      messCharge: mess, messIncluded: true, unpaid: 0, status: 'Paid',
      month: 'July 2026', date: today(), paidDate: today(), extraCharges: [], extraTotal: 0 });
    await saveDB();
  }, [RENT, MESS, ALL_IN]);

  // ── The drift exists, but billing no longer reads it ──────────────────────
  // This is the regression guard: with Settings as the source, a room (or a
  // student) still holding the all-in figure must NOT change what is charged.
  const before = await win.evaluate(() => ({
    newAdmission: resolveCharges({ roomId: 'room_drift' }).total,
    sitting:      resolveCharges(DB.students.find(s => s.id === '900')).total,
    // A student whose own record still carries the stale all-in rent.
    staleCopy:    resolveCharges({ roomId: 'room_drift', rent: 14500, mess: 6500 }).total,
    rentSource:   resolveCharges({ roomId: 'room_drift' }).rentSource,
    drift:        _roomsOutOfSync().length,
    driftAllIn:   _roomsOutOfSync().filter(d => d.allIn).length,
  }));
  expect(before.rentSource, 'the charge must come from Settings').toBe('settings');
  expect(before.newAdmission, 'a drifted room must not change the charge').toBe(ALL_IN);
  expect(before.sitting, 'the sitting student is billed correctly').toBe(ALL_IN);
  expect(before.staleCopy, 'a stale rent on the student record must be ignored').toBe(ALL_IN);
  expect(before.drift, 'drift not detected').toBeGreaterThan(0);
  expect(before.driftAllIn, 'the all-in signature was not recognised').toBeGreaterThan(0);

  // An explicit per-student rate is still honoured.
  const pinned = await win.evaluate(() =>
    resolveCharges({ roomId: 'room_drift', rent: 12000, mess: 0, _rentManuallySet: true }).total);
  expect(pinned, 'an explicit override must still win').toBe(12000);

  // ── Repair ────────────────────────────────────────────────────────────────
  const synced = await win.evaluate(async () => {
    let n = 0;
    DB.settings.roomTypes.forEach(t => { n += _syncRoomsToType(t.id, Number(t.defaultRent) || 0); });
    await saveDB();
    return n;
  });
  expect(synced).toBeGreaterThan(0);

  const after = await win.evaluate(() => ({
    newAdmission: resolveCharges({ roomId: 'room_drift' }).total,
    sitting:      resolveCharges(DB.students.find(s => s.id === '900')).total,
    drift:        _roomsOutOfSync().length,
    paid:         DB.payments.find(p => p.id === 'p_paid'),
  }));
  expect(after.drift, 'drift survived the repair').toBe(0);
  expect(after.newAdmission, 'new admission still overcharged').toBe(ALL_IN);
  expect(after.newAdmission, 'new admission disagrees with the sitting student').toBe(after.sitting);
  expect(after.sitting, 'the repair moved a sitting student').toBe(ALL_IN);
  expect(after.paid.amount, 'the repair rewrote a Paid receipt').toBe(ALL_IN);
  expect(after.paid.monthlyRent, 'the repair rewrote a Paid receipt').toBe(RENT);

  // ── Settings must now write through to rooms, so it cannot drift again ─────
  await win.evaluate(async () => {
    const t = DB.settings.roomTypes.find(x => x.id === '2s');
    t.defaultRent = 9000;
    _syncRoomsToType('2s', 9000);
    await saveDB();
  });
  const roomRent = await win.evaluate(() => DB.rooms.find(r => r.id === 'room_drift').rent);
  expect(roomRent, 'a rent change in Settings did not reach the room').toBe(9000);

  await app.close();
  expect(pageErrors, 'uncaught JS error').toEqual([]);
});
