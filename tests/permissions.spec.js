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

/* ADD AND EDIT ARE TWO PERMISSIONS SINCE 2026-09-10 (owner: "add edit records
   option to the permissions vith user add nev user and make it end to end").

   This test used to hold both halves under the single `edit` key. It is now
   two tests, and the pair proves the thing the split exists for: a front-desk
   account can admit a student it cannot afterwards change, and a records clerk
   can correct a record it cannot create. If either gate ever reads the other
   key, one of these fails. */
test("'add' is enforced: a warden without it cannot create a record", async () => {
  const { app, win } = await openApp();

  await win.evaluate(async () => {
    DB.students = []; DB.rooms = [{ id: 'r1', number: '101', floor: 'Ground',
      typeId: (DB.settings.roomTypes[0] || {}).id, amenities: [] }];
    await saveDB();
  });

  // Add Student is a PAGE, not a modal, and it does not paint synchronously.
  // Without this wait the "denied" case would pass for the wrong reason — the
  // form is absent a millisecond after the call whether it was blocked or not.
  const settle = 'await new Promise(r => setTimeout(r, 700));';

  const denied = await withPerm(win, 'add', false, `
    closeModal();
    showAddStudentModal();
    ${settle}
    const addFormOpened = !!document.getElementById('f-tname');
    const roomsBefore = DB.rooms.length;
    await submitAddRoom();
    return { addFormOpened, roomsUnchanged: DB.rooms.length === roomsBefore };
  `);
  expect(denied.addFormOpened, 'the Add Student form opened without permission').toBe(false);
  expect(denied.roomsUnchanged, 'a room was created without permission').toBe(true);

  const allowed = await withPerm(win, 'add', true, `
    closeModal();
    showAddStudentModal();
    ${settle}
    const addFormOpened = !!document.getElementById('f-tname');
    closeModal();
    return { addFormOpened };
  `);
  expect(allowed.addFormOpened,
    'the gate blocks a warden who DOES have the permission').toBe(true);

  // The header's one primary button is an Add button, so it follows 'add'.
  const chrome = await win.evaluate(async () => {
    const before = CUR_USER.perms.add;
    CUR_USER.perms.add = false;
    navigate('students');
    await new Promise(r => setTimeout(r, 500));
    const hidden = (document.getElementById('hdr-action') || {}).style.display;
    CUR_USER.perms.add = before;
    navigate('students');
    await new Promise(r => setTimeout(r, 500));
    const shown = (document.getElementById('hdr-action') || {}).style.display;
    return { hidden, shown };
  });
  expect(chrome.hidden, 'the Add button is offered to a warden who cannot add').toBe('none');
  expect(chrome.shown, 'the Add button is hidden from a warden who can add').not.toBe('none');

  await app.close();
});

test("'edit' is enforced: a warden without it cannot change a record that exists", async () => {
  const { app, win } = await openApp();

  await win.evaluate(async () => {
    DB.rooms = [{ id: 'r1', number: '101', floor: 'Ground',
      typeId: (DB.settings.roomTypes[0] || {}).id, amenities: [] }];
    DB.students = [{ id: 's1', name: 'Shift Me', roomId: 'r1', status: 'Active',
                     joinDate: today() }];
    await saveDB();
  });

  const settle = 'await new Promise(r => setTimeout(r, 700));';

  const denied = await withPerm(win, 'edit', false, `
    closeModal();
    showEditRoomModal('r1');
    ${settle}
    const editRoomOpened = !!document.getElementById('f-rnumber');
    ${/* "Move or shift a student" is a line the Edit-records card prints, and
          this path asked for nothing at all until 2026-09-10 — the same shape
          of gap as the delete bug the owner reported the day before. */''}
    closeModal();
    showRoomShiftModal('s1');
    ${settle}
    const shiftOpened = !!document.querySelector('.msf-cur__n, #msf-room, #shift-room');
    closeModal();
    return { editRoomOpened, shiftOpened };
  `);
  expect(denied.editRoomOpened, 'the Edit Room form opened without permission').toBe(false);
  expect(denied.shiftOpened, 'the room-shift form opened without permission').toBe(false);

  // A warden who may ADD but not EDIT keeps the add half — that is the split.
  const split = await win.evaluate(async () => {
    const b = { add: CUR_USER.perms.add, edit: CUR_USER.perms.edit };
    CUR_USER.perms.add = true; CUR_USER.perms.edit = false;
    closeModal();
    showAddStudentModal();
    await new Promise(r => setTimeout(r, 700));
    const addFormOpened = !!document.getElementById('f-tname');
    closeModal();
    showEditRoomModal('r1');
    await new Promise(r => setTimeout(r, 700));
    const editRoomOpened = !!document.getElementById('f-rnumber');
    closeModal();
    CUR_USER.perms.add = b.add; CUR_USER.perms.edit = b.edit;
    return { addFormOpened, editRoomOpened };
  });
  expect(split.addFormOpened, 'add was refused to an account that holds it').toBe(true);
  expect(split.editRoomOpened, 'edit was granted by holding add').toBe(false);

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

  /* The header's second button, "Add Payment" (#hdr-action2), was removed on
     2026-09-05 — the sketch gives the header one primary action and Add Payment
     is the first tile in the dashboard's Quick Actions. This test now asserts
     the remaining button, which is the claim that still has teeth: the chrome
     must not offer an action the warden's permissions will refuse.

     The 'payments' permission is still gated, and still tested — by "'payments'
     is enforced" above, which drives the actual entry point rather than the
     button that used to lead to it. That is the stronger of the two checks: a
     hidden button is a courtesy, the gate is the boundary. */
  const shown = await win.evaluate(async () => {
    const read = () => {
      const el = document.getElementById('hdr-action');
      return { add: el ? getComputedStyle(el).display : 'missing',
               pay2: !!document.getElementById('hdr-action2') };
    };
    const before = { ...CUR_USER.perms };

    /* 'add', not 'edit': the two split on 2026-09-10 and this button only ever
       opens an Add form, so it follows the half that names what it does. Both
       are set here so the test cannot pass on the wrong one. */
    CUR_USER.perms.add = true; CUR_USER.perms.edit = true; CUR_USER.perms.payments = true;
    navigate('students');
    await new Promise(r => setTimeout(r, 700));
    const full = read();

    CUR_USER.perms.add = false; CUR_USER.perms.edit = false; CUR_USER.perms.payments = false;
    navigate('students');
    await new Promise(r => setTimeout(r, 700));
    const none = read();

    CUR_USER.perms = before;
    return { full, none };
  });

  expect(shown.full.add, 'a permitted warden lost the Add button').not.toBe('none');
  expect(shown.none.add, 'the Add button was offered without permission').toBe('none');
  expect(shown.full.pay2, 'the Add Payment header button is gone — see the comment above').toBe(false);

  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
// 'delete' — DECLARED, TICKED, AND CHECKED IN EXACTLY ONE PLACE
//
// The owner found this on 2026-09-10: an account created with "Delete records"
// unticked could still delete payments, cancellations, expenses, maintenance
// jobs and complaints. Only the student register refused.
//
// It is the same class of bug this file was written for, and it slipped past
// the coverage test below because that test asks whether a permission is
// enforced SOMEWHERE. 'delete' was — `confirmDeleteStudent` was its one and
// only call site in the entire renderer. So this file now asks the sharper
// question of the one permission that destroys data: is it enforced on EVERY
// path that destroys data.
//
// The refusal is asserted on the record still being there AND on the
// confirmation never opening. A warden who may not delete should not be asked
// to confirm a deletion — being asked and then refused is how a person learns
// to distrust the dialog.
// ════════════════════════════════════════════════════════════════════════════
test("'delete' is enforced on every register, not only on students", async () => {
  const { app, win } = await openApp();

  await win.evaluate(async () => {
    const t = today();
    DB.rooms = [{ id: 'rEmpty', number: '901', floor: 'Ground',
                  typeId: (DB.settings.roomTypes[0] || {}).id, amenities: [] }];
    DB.students = [];
    DB.payments = [{ id: 'p1', studentId: 's1', studentName: 'Seed', roomNumber: '901',
                     month: thisMonth(), monthlyRent: 1000, amount: 1000, unpaid: 0,
                     status: 'Paid', method: 'Cash', date: t }];
    DB.cancellations = [{ id: 'c1', studentId: 's1', studentName: 'Seed', roomNumber: '901',
                          status: 'Pending', requestDate: t, vacateDate: t, reason: 'Seed' }];
    DB.expenses    = [{ id: 'e1', category: 'Utilities', amount: 500, date: t, description: 'Seed' }];
    DB.maintenance = [{ id: 'm1', title: 'Seed', status: 'Open', date: t }];
    DB.complaints  = [{ id: 'k1', title: 'Seed', status: 'Open', date: t }];
    DB.transfers   = [{ id: 'x1', amount: 100, date: t, note: 'Seed' }];
    await saveDB();
  });

  const CALLS = `
    const calls = [
      ['payment',      () => deletePayment('p1')],
      ['cancellation', () => deleteCancellationRecord('c1')],
      ['expense',      () => deleteExpense('e1')],
      ['maintenance',  () => delMaint('m1')],
      ['complaint',    () => delComp('k1')],
      ['room',         () => confirmDeleteRoom('rEmpty')],
      ['transfer',     () => deleteTransfer('x1')],
    ];
    const asked = [];
    for (const [name, fn] of calls) {
      closeModal();
      await new Promise(r => setTimeout(r, 120));
      await fn();
      await new Promise(r => setTimeout(r, 250));
      if (document.querySelector('.modal-overlay')) asked.push(name);
      closeModal();
    }
    const left = {
      payment:      DB.payments.length,
      cancellation: (DB.cancellations || []).length,
      expense:      DB.expenses.length,
      maintenance:  DB.maintenance.length,
      complaint:    DB.complaints.length,
      room:         DB.rooms.length,
      transfer:     (DB.transfers || []).length,
    };
    return { asked, left };
  `;

  const denied = await withPerm(win, 'delete', false, CALLS);
  expect(denied.asked,
    'these registers asked a warden with no delete permission to confirm a deletion')
    .toEqual([]);
  // Nothing may go. The confirm never opened, so nothing should have run — but
  // it is the record count that matters, not the dialog.
  expect(denied.left).toEqual({
    payment: 1, cancellation: 1, expense: 1, maintenance: 1,
    complaint: 1, room: 1, transfer: 1,
  });

  // ── With the permission, every one of them must still work ───────────────
  // A gate that refuses everybody would pass the half above on its own.
  const allowed = await withPerm(win, 'delete', true, CALLS);
  expect(allowed.asked.sort(), 'the gate blocks a warden who DOES have the permission')
    .toEqual(['cancellation', 'complaint', 'expense', 'maintenance', 'payment',
              'room', 'transfer'].sort());

  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
// THE STATIC HALF. The test above names seven registers; the next register
// added will not be in it. This one reads the source instead: every function
// that removes rows from a DB collection must ask for a permission first.
//
// It is deliberately crude — nearest enclosing `function` above the removal —
// because the precise thing it guards is crude too: somebody writes a new
// `DB.things = DB.things.filter(...)` and does not think about who is allowed
// to run it. That is exactly how five of these came to exist.
// ════════════════════════════════════════════════════════════════════════════
test('every path that destroys records asks for a permission first', async () => {
  const fs = require('fs');
  const dir = path.join(REPO_ROOT, 'renderer/src/modules');
  const misses = [];
  /* THE ONE EXEMPTION, AND IT IS NOT A USER ACTION. enforceDataRetention() runs
     on save and moves settled records past the retention window out of the live
     tables; nobody is pressing anything, so there is no permission to ask for.
     Adding a name here needs that same sentence: who is not pressing it. */
  const EXEMPT = ['enforceDataRetention'];

  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    // Split on function starts so each chunk is one function body (near enough).
    const parts = src.split(/(?=(?:^|\n)\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\()/);
    for (const part of parts) {
      const name = (part.match(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/) || [])[1];
      if (!name || EXEMPT.includes(name)) continue;
      if (/requirePerm\('\w+'\)/.test(part)) continue;

      /* A removal: a collection reassigned to a filtered copy of itself, or
         emptied outright — and the collection's NAME is captured, because half
         the hits are not deletions at all. Every upsert in this app filters the
         old row out and pushes the new one straight back, so a function that
         puts rows into the same collection it filtered is editing it. */
      const gone = new Set();
      for (const m of part.matchAll(/DB\.(\w+)\s*=\s*\(?\s*(?:DB\.\1|\(DB\.\1\s*\|\|\s*\[\]\))\s*\)?\s*\.filter\(/g)) gone.add(m[1]);
      for (const m of part.matchAll(/DB\.(\w+)\s*=\s*\[\s*\]\s*;/g)) gone.add(m[1]);
      for (const coll of gone) {
        if (part.includes('DB.' + coll + '.push(') ||
            part.includes('DB.' + coll + '.unshift(')) continue;
        misses.push(file + ' → ' + name + '() removes DB.' + coll);
      }
    }
  }

  expect(misses,
    'these functions destroy records with no permission check at all').toEqual([]);
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
