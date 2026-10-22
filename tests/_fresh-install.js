'use strict';
/* A test install in the state most specs were written against.

   Until 2026-09-24 the APP filled an empty install with 42 invented rooms. That
   is gone — a real hostel starts with none, and the first-run setup wizard (which
   those rooms had kept from ever appearing) now opens on a fresh install. Specs
   written before that read `DB.rooms[0]` and clicked through a screen with no
   wizard over it.

   This recreates that state as a TEST FIXTURE, where it belongs: setup marked
   done, the wizard closed, and the same 42 rooms the app used to seed (numbers
   1–42 over four floors, types cycling 1- to 5-seater, rent from the room type).
   Call it right after login. Specs about the fresh install itself — the setup
   wizard — must not. */
async function settleFreshInstall(win) {
  await win.evaluate(async () => {
    DB.settings.setupCompletedAt = DB.settings.setupCompletedAt || new Date().toISOString();
    DB.settings.setupStep = null;
    if (!(DB.rooms || []).length) {
      const rtypes = (DB.settings && DB.settings.roomTypes) || [];
      const floors = [
        { name: 'Ground', rooms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
        { name: '1st',    rooms: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21] },
        { name: '2nd',    rooms: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31] },
        { name: '3rd',    rooms: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42] },
      ];
      const typeIds = ['1s', '2s', '3s', '4s', '5s'];
      let idx = 0;
      DB.rooms = [];
      floors.forEach(f => f.rooms.forEach(num => {
        const typeId = typeIds[idx % 5];
        const type = rtypes.find(t => t.id === typeId);
        DB.rooms.push({ id: 'room_' + uid(), number: num, floor: f.name, typeId,
          rent: Number(type && type.defaultRent) || 0, studentIds: [],
          amenities: ['Fan', 'Bed', 'Wardrobe'], notes: '' });
        idx++;
      }));
    }
    await saveDB();
    const host = document.getElementById('onb');
    if (host) host.style.display = 'none';
    document.body.classList.remove('onb-open');
    if (typeof renderPage === 'function') renderPage('dashboard');
  });
  await win.waitForTimeout(300);
}

module.exports = { settleFreshInstall };
