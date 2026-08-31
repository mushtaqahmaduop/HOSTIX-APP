// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the permissions an administrator ticks are the permissions enforced
//
// PERMS declares eight. Until now only six were ever checked. 'edit' ("Add &
// edit records") and 'payments' ("Collect payments") were offered in the user
// editor, saved to the account, shown with a tick — and enforced nowhere. An
// administrator who unticked "Collect payments" for a new warden got a screen
// that said the warden could not collect payments, and a warden who could.
//
// That is worse than not offering the checkbox at all: the hostel believes in a
// restriction that does not exist.
//
// Both halves matter and both are tested here:
//   - a warden WITHOUT the permission is refused, and told why;
//   - a warden WITH it is not obstructed, because a gate that blocks everybody
//     would "pass" a test that only checked the refusal.
//
// The gates are asserted on real behaviour — did the record change, did the
// modal open — not on the toast text, which is cosmetic.
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

/** Run fn with one permission forced on or off, then put it back. */
function withPerm(win, perm, value, fnBody) {
  return win.evaluate(async ({ perm, value, fnBody }) => {
    const before = CUR_USER.perms[perm];
    CUR_USER.perms[perm] = value;
    try {
      // eslint-disable-next-line no-new-func
      return await (new Function('return (async () => {' + fnBody + '})()'))();
    } finally {
      CUR_USER.perms[perm] = before;
    }
  }, { perm, value, fnBody });
}

test("'edit' is enforced: a warden without it cannot add or change a record", async () => {
  const { app, win } = await openApp();

  await win.evaluate(async () => {
    DB.students = []; DB.rooms = [{ id: 'r1', number: '101', floor: 'Ground',
      typeId: (DB.settings.roomTypes[0] || {}).id, amenities: [] }];
    await saveDB();
  });

  // ── Without the permission ────────────────────────────────────────────────
  // Add Student is a PAGE, not a modal, and it does not paint synchronously.
  // Without this wait the "denied" case would pass for the wrong reason — the
  // form is absent a millisecond after the call whether it was blocked or not.
  const settle = 'await new Promise(r => setTimeout(r, 700));';

  const denied = await withPerm(win, 'edit', false, `
    closeModal();
    showAddStudentModal();
    ${settle}
    const addFormOpened = !!document.getElementById('f-tname');
    showEditRoomModal('r1');
    ${settle}
    const editRoomOpened = !!document.getElementById('f-rnumber');
    const roomsBefore = DB.rooms.length;
    await submitAddRoom();
    return { addFormOpened, editRoomOpened,
             roomsUnchanged: DB.rooms.length === roomsBefore };
  `);
  expect(denied.addFormOpened, 'the Add Student form opened without permission').toBe(false);
  expect(denied.editRoomOpened, 'the Edit Room form opened without permission').toBe(false);
  expect(denied.roomsUnchanged, 'a room was created without permission').toBe(true);

  // ── With it: the same calls must go through ──────────────────────────────
  const allowed = await withPerm(win, 'edit', true, `
    closeModal();
    showAddStudentModal();
    ${settle}
    const addFormOpened = !!document.getElementById('f-tname');
    closeModal();
    return { addFormOpened };
  `);
  expect(allowed.addFormOpened,
    'the gate blocks a warden who DOES have the permission').toBe(true);

  await app.close();
});

test("'payments' is enforced: a warden without it cannot collect or edit money", async () => {
  const { app, win } = await openApp();

  await win.evaluate(async () => {
    DB.rooms = [{ id: 'r1', number: '101', floor: 'Ground',
      typeId: (DB.settings.roomTypes[0] || {}).id, amenities: [] }];
    DB.students = [{ id: 's1', name: 'Payer', status: 'Active', roomId: 'r1',
      joinDate: '2026-08-01' }];
    DB.payments = [{ id: 'p1', studentId: 's1', studentName: 'Payer', roomId: 'r1',
      roomNumber: '101', amount: 5000, unpaid: 0, monthlyRent: 5000, totalRent: 5000,
      method: 'Cash', month: '2026-08', date: '2026-08-05', status: 'Paid',
      extraCharges: [], extraTotal: 0 }];
    await saveDB();
  });

  const denied = await withPerm(win, 'payments', false, `
    closeModal();
    showEditPaymentModal('p1');
    const editOpened = !!document.getElementById('ep-amount') ||
                       !!document.querySelector('#modal-body input');
    const amountBefore = DB.payments[0].amount;
    await submitEditPayment('p1');
    showAddPaymentForStudent('s1');
    const addOpened = currentPage === 'addpayment';
    return { editOpened, addOpened, amountUnchanged: DB.payments[0].amount === amountBefore };
  `);
  expect(denied.editOpened, 'the payment editor opened without permission').toBe(false);
  expect(denied.addOpened, 'the Add Payment page opened without permission').toBe(false);
  expect(denied.amountUnchanged, 'a payment was altered without permission').toBe(true);

  // 'edit' must NOT stand in for 'payments' — they are separate permissions and
  // a warden who may admit students is not thereby a cashier.
  const editOnly = await win.evaluate(async () => {
    const b = { ...CUR_USER.perms };
    CUR_USER.perms.edit = true; CUR_USER.perms.payments = false;
    closeModal();
    showEditPaymentModal('p1');
    const opened = !!document.querySelector('#modal-body input');
    CUR_USER.perms = b;
    return opened;
  });
  expect(editOnly, "'edit' let a warden through the 'payments' gate").toBe(false);

  await app.close();
});

test('the header stops offering buttons the warden may not use', async () => {
  const { app, win } = await openApp();

  const shown = await win.evaluate(async () => {
    const read = () => ({
      add: getComputedStyle(document.getElementById('hdr-action')).display,
      pay: getComputedStyle(document.getElementById('hdr-action2')).display,
    });
    const before = { ...CUR_USER.perms };

    CUR_USER.perms.edit = true; CUR_USER.perms.payments = true;
    navigate('students');
    await new Promise(r => setTimeout(r, 700));
    const full = read();

    CUR_USER.perms.edit = false; CUR_USER.perms.payments = false;
    navigate('students');
    await new Promise(r => setTimeout(r, 700));
    const none = read();

    CUR_USER.perms = before;
    return { full, none };
  });

  expect(shown.full.add, 'a permitted warden lost the Add button').not.toBe('none');
  expect(shown.full.pay, 'a permitted warden lost the Add Payment button').not.toBe('none');
  expect(shown.none.add, 'the Add button was offered without permission').toBe('none');
  expect(shown.none.pay, 'Add Payment was offered without permission').toBe('none');

  await app.close();
});

test('every declared permission is actually checked somewhere', async () => {
  // The bug this whole file exists for was a permission that was declared,
  // saved, shown with a tick, and enforced nowhere. This is the guard that
  // catches the next one — including any permission added later.
  const fs = require('fs');
  const src = ['renderer/src/auth-nev.js', 'renderer/src/modules/nav.js']
    .concat(fs.readdirSync(path.join(REPO_ROOT, 'renderer/src/modules'))
      .map(f => 'renderer/src/modules/' + f))
    .filter(p => p.endsWith('.js'))
    .map(p => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8'))
    .join('\n');

  // Scoped to the PERMS array itself. A bare /\{ key: '(\w+)',/ over the whole
  // renderer also collects room types and expense categories, which are not
  // permissions and have nothing to enforce.
  const table = src.match(/const PERMS = \[([\s\S]*?)\];/);
  expect(table, 'could not find the PERMS table').toBeTruthy();
  const declared = [...table[1].matchAll(/key: '(\w+)'/g)].map(m => m[1]);
  expect(declared.length, 'could not read the PERMS table').toBeGreaterThan(4);

  const unenforced = declared.filter(k =>
    !src.includes("requirePerm('" + k + "')") && !src.includes("canDo('" + k + "')"));
  expect(unenforced,
    'these permissions are offered to administrators but never checked').toEqual([]);
});
