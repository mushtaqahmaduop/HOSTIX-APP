// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — a bed on notice is spoken for, and bookable
//
// The owner's account of a normal week, 2026-08-30:
//
//   "today a student come to office and ask for his seat cancellation for the
//    next [month] and then some student came and likes the same room and want
//    to reserve it — as here in our hostel region it is a rule that you inform
//    warden about 5 or 10 days earlier about your cancellation, or 25th of the
//    month"
//
// So both students have a claim on one bed at once, and both claims are real:
//   - the leaving student is still sleeping in it, and is still billed for it;
//   - the arriving student has been promised it from the vacate date.
//
// The app could not express that. getRoomOccupancy() counted status==='Active'
// while renderRooms() counted isResident(), so the two disagreed by exactly the
// students on notice: the Rooms page drew the room full, and the Add Student
// picker offered the same room as having a free bed. Whichever screen the
// warden happened to be on decided what was true.
//
// Now there is one occupancy (beds slept in) and one allowance (beds on notice
// may be reserved), and this spec pins both.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

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

async function openApp() {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
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

/** A two-bed room with both beds slept in, and nobody leaving yet. */
async function seedFullRoom(win) {
  return win.evaluate(async () => {
    const type = (DB.settings.roomTypes || [])[0];
    const typeId = type ? type.id : null;
    // Give the type a known capacity so the arithmetic in the spec is readable.
    if (type) type.capacity = 2;
    DB.rooms = [{ id: 'r1', number: '101', floor: 'Ground', typeId, amenities: [] }];
    DB.students = [
      { id: 'sA', name: 'Staying Student', status: 'Active', roomId: 'r1', joinDate: '2026-01-05' },
      { id: 'sB', name: 'Leaving Student', status: 'Active', roomId: 'r1', joinDate: '2026-02-05' },
    ];
    DB.cancellations = [];
    await saveDB();
    const room = DB.rooms[0];
    return {
      capacity: getRoomType(room).capacity,
      occupancy: getRoomOccupancy(room),
      vacating: getRoomVacating(room),
      free: roomFreeBeds(room),
      label: roomAvailLabel(room),
    };
  });
}

test('a full room is full, and one bed on notice makes exactly one reservable', async () => {
  const { app, win } = await openApp();

  // ── Both beds slept in, nobody leaving: no room for anybody ───────────────
  const full = await seedFullRoom(win);
  expect(full.capacity).toBe(2);
  expect(full.occupancy).toBe(2);
  expect(full.vacating).toBe(0);
  expect(full.free, 'a genuinely full room offered a bed').toBe(0);
  expect(full.label).toContain('FULL');

  // ── One student gives notice ─────────────────────────────────────────────
  const onNotice = await win.evaluate(async () => {
    const d = new Date();
    const vacate = new Date(d.getFullYear(), d.getMonth() + 1, 0);   // end of this month
    const ymdOf = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') +
                       '-' + String(x.getDate()).padStart(2, '0');
    DB.cancellations = [{
      id: 'c1', seq: 1, studentId: 'sB', studentName: 'Leaving Student',
      roomId: 'r1', roomNumber: '101', reason: 'course over',
      requestDate: ymdOf(d), vacateDate: ymdOf(vacate), status: 'Pending',
    }];
    DB.students.find(t => t.id === 'sB').status = 'Cancelling';
    await saveDB();
    const room = DB.rooms[0];
    return {
      occupancy: getRoomOccupancy(room),
      vacating: getRoomVacating(room),
      free: roomFreeBeds(room),
      label: roomAvailLabel(room),
      nextFree: roomNextFreeDate(room),
    };
  });

  // The bed is STILL occupied — they are still sleeping in it and still billed.
  expect(onNotice.occupancy, 'the leaving student lost their bed the moment they gave notice')
    .toBe(2);
  expect(onNotice.vacating).toBe(1);
  // …and exactly one bed may now be reserved. Not two, and not none.
  expect(onNotice.free, 'notice did not make the bed reservable').toBe(1);
  expect(onNotice.label).toContain('reservable');
  expect(onNotice.nextFree).toBeTruthy();

  // ── Reserving it uses the allowance up ───────────────────────────────────
  const afterBooking = await win.evaluate(async () => {
    DB.students.push({ id: 'sC', name: 'Incoming Student', status: 'Active',
                       roomId: 'r1', joinDate: '2026-08-30' });
    await saveDB();
    const room = DB.rooms[0];
    return { occupancy: getRoomOccupancy(room), free: roomFreeBeds(room),
             label: roomAvailLabel(room) };
  });
  expect(afterBooking.occupancy).toBe(3);          // three claims on two beds, briefly
  expect(afterBooking.free, 'the room took a second reservation against one bed').toBe(0);
  expect(afterBooking.label).toContain('FULL');

  // ── And when the leaver actually goes, the books balance again ───────────
  const afterLeaving = await win.evaluate(async () => {
    DB.cancellations[0].status = 'Confirmed';
    const t = DB.students.find(x => x.id === 'sB');
    t.status = 'Left'; t.leftDate = DB.cancellations[0].vacateDate;
    await saveDB();
    const room = DB.rooms[0];
    return { occupancy: getRoomOccupancy(room), vacating: getRoomVacating(room),
             free: roomFreeBeds(room) };
  });
  expect(afterLeaving.occupancy).toBe(2);
  expect(afterLeaving.vacating).toBe(0);
  expect(afterLeaving.free).toBe(0);

  await app.close();
});

test('the Rooms page and the capacity gate agree about the same room', async () => {
  // This is the actual defect: two definitions of "occupied" in one app. The
  // Rooms page counted isResident(), every capacity gate counted 'Active', and
  // they differed by precisely the students on notice.
  const { app, win } = await openApp();
  await seedFullRoom(win);

  const agreement = await win.evaluate(async () => {
    DB.cancellations = [{ id: 'c1', seq: 1, studentId: 'sB', studentName: 'Leaving Student',
      roomId: 'r1', roomNumber: '101', reason: 'x', requestDate: '2026-08-20',
      vacateDate: '2026-08-31', status: 'Pending' }];
    DB.students.find(t => t.id === 'sB').status = 'Cancelling';
    await saveDB();
    renderPage('rooms');
    await new Promise(r => setTimeout(r, 600));
    const room = DB.rooms[0];
    // What the Rooms card says, and what the gate believes, for one room.
    const card = document.querySelector('.rms-card');
    return {
      gateOccupancy: getRoomOccupancy(room),
      cardText: card ? card.textContent.replace(/\s+/g, ' ').trim() : null,
    };
  });

  expect(agreement.gateOccupancy).toBe(2);
  // The card reports the same two beds, and says one of them is on its way out.
  expect(agreement.cardText).toContain('2');
  expect(agreement.cardText).toContain('vacating');

  await app.close();
});
