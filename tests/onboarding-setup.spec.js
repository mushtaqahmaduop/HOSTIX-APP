// ════════════════════════════════════════════════════════════════════════════
// FIRST-RUN SETUP — the wizard in renderer/src/modules/onboarding.js.
//
// It had no coverage at all until 2026-09-10, which is a strange gap for the
// first thirty seconds a paying customer ever spends with the product. It got
// some when the owner asked for more of the hostel's own details to be
// collected there: "hostel gender type in first run or onboarding, logo, name,
// vhatsapp number, email, number of affordable student for a hostel to
// accomodate and many more".
//
// What is asserted here is the wizard's own contract, not its layout:
//
//  · IT IS NOT LOSSY. Each step commits its answers before the next is drawn,
//    so closing the app half-way resumes rather than restarting. That is the
//    property everything else on this screen depends on.
//  · IT NEVER RUNS ON A HOSTEL THAT IS ALREADY WORKING. Fifty-odd installs in
//    the field have no setupCompletedAt because the field did not exist when
//    they were set up; keying purely off that flag would put a setup wizard in
//    front of every one of them, over live data.
//  · A FIGURE IT COLLECTS AND DOES NOT USE IS A FIGURE IT SHOULD NOT COLLECT.
//    The stated capacity is not a cap and nothing enforces it — the bed count
//    every screen reads comes from the rooms that exist. It earns its place by
//    being compared against those beds on the rooms step.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 60000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 60000 });
  return { app, win };
}

/** Open the wizard at step one, with nothing carried over from a prior test. */
async function openWizard(win) {
  await win.evaluate(async () => {
    delete DB.settings.setupCompletedAt;
    delete DB.settings.capacity;
    DB.settings.setupStep = 0;
    await saveDB();
    openSetupAgain();
  });
  await win.waitForSelector('#onb-name', { timeout: 20000 });
}

test('step one collects every detail the hostel is identified by, and commits them', async () => {
  const { app, win } = await launch();
  await openWizard(win);

  // Every control the owner named is on the step, and the two new text fields
  // open holding whatever is already stored rather than blank.
  const present = await win.evaluate(() => ({
    logo:   !!document.getElementById('onb-logo'),
    file:   !!document.getElementById('onb-logo-file'),
    name:   !!document.getElementById('onb-name'),
    wa:     !!document.getElementById('onb-wa'),
    email:  !!document.getElementById('onb-email'),
    cap:    !!document.getElementById('onb-cap'),
    gender: !!document.getElementById('onb-gender'),
  }));
  expect(present).toEqual({ logo: true, file: true, name: true, wa: true,
                            email: true, cap: true, gender: true });

  await win.evaluate(async () => {
    document.getElementById('onb-name').value  = 'Continental Boys Hostel-2';
    document.getElementById('onb-loc').value   = 'University Road, Peshawar';
    document.getElementById('onb-phone').value = '091-1234567';
    document.getElementById('onb-wa').value    = '0300-9409960';
    document.getElementById('onb-email').value = 'continental@example.com';
    document.getElementById('onb-cap').value   = '120';
    document.getElementById('onb-gender').value = 'girls';
    await onbNext();
  });

  const stored = await win.evaluate(() => ({
    name: DB.settings.hostelName,
    loc: DB.settings.location,
    phone: DB.settings.phone,
    wa: DB.settings.defaultWANumber,
    email: DB.settings.email,
    cap: DB.settings.capacity,
    gender: DB.settings.hostelGender,
    // …and the position moved with them, which is what makes it resumable.
    step: DB.settings.setupStep,
  }));
  expect(stored.name).toBe('Continental Boys Hostel-2');
  expect(stored.loc).toBe('University Road, Peshawar');
  expect(stored.phone).toBe('091-1234567');
  expect(stored.wa, 'the WhatsApp number reminders fall back to was not saved')
    .toBe('0300-9409960');
  expect(stored.email).toBe('continental@example.com');
  expect(stored.cap, 'the stated capacity was not saved as a number').toBe(120);
  expect(stored.gender).toBe('girls');
  expect(stored.step).toBe(1);

  await app.close();
});

test('a blank capacity is stored as nothing, not as a zero', async () => {
  const { app, win } = await launch();
  await openWizard(win);

  const out = await win.evaluate(async () => {
    document.getElementById('onb-name').value = 'No Figure Hostel';
    document.getElementById('onb-cap').value  = '';
    await onbNext();
    return { has: 'capacity' in DB.settings, value: DB.settings.capacity };
  });
  /* Blank and 0 both mean "no figure given". Storing "" or 0 would put a value
     where every reader expects a number, and would make the rooms step compare
     the beds against nothing. */
  expect(out.has, 'a blank capacity was stored as a value').toBe(false);
  expect(out.value).toBeUndefined();

  await app.close();
});

test('the rooms step measures the beds created against the capacity stated', async () => {
  const { app, win } = await launch();
  await openWizard(win);

  const lines = await win.evaluate(async () => {
    const type = DB.settings.roomTypes[0];
    const cap  = type.capacity || 1;
    const mk = n => { DB.rooms = []; for (let i = 0; i < n; i++)
      DB.rooms.push({ id: 'r' + i, number: String(i + 1), floor: 'Ground',
                      typeId: type.id, amenities: [] }); };

    DB.settings.capacity = cap * 10;
    mk(4);  const short = _onbMadeHtml();      // fewer beds than stated
    mk(10); const exact = _onbMadeHtml();      // exactly the stated figure
    mk(14); const over  = _onbMadeHtml();      // more than stated
    delete DB.settings.capacity;
    const none = _onbMadeHtml();               // no figure given
    DB.rooms = [];
    return { short, exact, over, none, beds: cap * 10 };
  });

  expect(lines.short, 'a hostel short of its own target is not told')
    .toContain('still to create');
  expect(lines.exact, 'hitting the stated figure is not acknowledged')
    .toContain('matches');
  expect(lines.over, 'building past the stated figure is not flagged')
    .toContain('more than the');
  /* NOT AN ERROR, and it must not read like one — a hostel is allowed to build
     more beds than it first said. */
  expect(lines.over).toContain('Nothing is blocked');
  expect(lines.none, 'a comparison was made against a figure nobody gave')
    .not.toContain('you said');

  await app.close();
});

test('the wizard never opens on an install that is already in use', async () => {
  const { app, win } = await launch();

  const answers = await win.evaluate(async () => {
    const type = DB.settings.roomTypes[0];
    const out = {};

    // A fresh install: no flag, no data.
    DB.rooms = []; DB.students = []; delete DB.settings.setupCompletedAt;
    out.fresh = needsSetup();

    // The same install once somebody has finished setup.
    DB.settings.setupCompletedAt = new Date().toISOString();
    out.done = needsSetup();

    /* THE POPULATION THAT MATTERS: fifty-odd installs in the field have no
       setupCompletedAt, because the field did not exist when they were set up.
       Rooms or students on file is what proves an install has been in use. */
    delete DB.settings.setupCompletedAt;
    DB.rooms = [{ id: 'r1', number: '1', floor: 'Ground', typeId: type.id, amenities: [] }];
    out.hasRooms = needsSetup();

    DB.rooms = [];
    DB.students = [{ id: 's1', name: 'Already Here', status: 'Active' }];
    out.hasStudents = needsSetup();

    DB.students = [];
    await saveDB();
    return out;
  });

  expect(answers.fresh, 'a brand-new install is not offered setup').toBe(true);
  expect(answers.done, 'setup is offered again after it was finished').toBe(false);
  expect(answers.hasRooms, 'a hostel with rooms on file was offered a setup wizard').toBe(false);
  expect(answers.hasStudents, 'a hostel with students on file was offered a setup wizard').toBe(false);

  await app.close();
});
