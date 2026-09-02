/* --- HOSTYLLO -- the service model, through resolveCharges() ----------------

   Three kinds of hostel, one function that decides what a student owes. These
   tests load config.js and utils.js as the app loads them and drive the real
   resolveCharges(), so what is asserted here is what the screens will print.

   The property that matters most is the LAST one: the hostel's answer beats
   whatever is stored on the student. A record written before this setting
   existed carries messOptIn from the old world, and neither a rent-only nor a
   bundled hostel may let that record change what it bills.

   Run:  node tests/service-model.test.js
   -------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const R = f => fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', f), 'utf8');

// A sandbox with just enough browser for these two files to evaluate.
const sandbox = {
  console,
  sessionStorage: { getItem: () => null, setItem: () => {} },
  localStorage:   { getItem: () => null, setItem: () => {} },
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null,
              querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }) },
  navigator: { userAgent: 'node' },
  setTimeout, clearTimeout, Intl, Date, Math, JSON,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(R('config.js'), sandbox, { filename: 'config.js' });
vm.runInContext(R('utils.js'),  sandbox, { filename: 'utils.js' });

/* config.js declares DB with `let` and SERVICE_MODELS with `const`, so they
   live in the context's lexical scope and never become properties of the
   sandbox object. Function declarations do. Evaluating one more expression in
   the same context is what reaches both. */
const { DB, resolveCharges, serviceModel, hostelServesMess, messIsOptional } =
  vm.runInContext('({ DB, resolveCharges, serviceModel, hostelServesMess, messIsOptional })', sandbox);

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

/** Put the hostel into a known shape: one room type at 8000 rent + 6500 mess. */
function setup(model) {
  DB.settings.serviceModel = model;
  DB.settings.roomTypes = [{ id: 't1', name: '2-Seater', capacity: 2, defaultRent: 8000, defaultMess: 6500 }];
  DB.rooms = [{ id: 'r1', number: '1', typeId: 't1' }];
}
const student = extra => Object.assign({ id: 's1', roomId: 'r1' }, extra || {});

console.log('\nserviceModel() -- the reader');

ok('an install with no setting reads as the old behaviour', () => {
  setup(undefined);
  delete DB.settings.serviceModel;
  assert.strictEqual(serviceModel(), 'rent_mess_optional');
  assert.strictEqual(hostelServesMess(), true);
  assert.strictEqual(messIsOptional(), true);
});

ok('a value from a newer build is not trusted blindly', () => {
  setup('rent_and_laundry_and_wifi');
  assert.strictEqual(serviceModel(), 'rent_mess_optional',
    'an unknown model must fall back, never switch a hostel to something unmodelled');
});

console.log('\nrent only');

ok('no food is billed', () => {
  setup('rent');
  const c = resolveCharges(student());
  assert.strictEqual(c.rent, 8000);
  assert.strictEqual(c.messBilled, 0);
  assert.strictEqual(c.total, 8000);
});

ok('and none is SHOWN -- mess reads 0, so no screen can print a food charge', () => {
  setup('rent');
  assert.strictEqual(resolveCharges(student()).mess, 0);
});

ok('the configured amount survives, so switching back restores it', () => {
  setup('rent');
  resolveCharges(student());
  assert.strictEqual(DB.settings.roomTypes[0].defaultMess, 6500,
    'reading charges must never edit settings');
  DB.settings.serviceModel = 'rent_mess_optional';
  assert.strictEqual(resolveCharges(student()).mess, 6500);
});

ok('THE HOLE IT CLOSES: a student marked on the mess is still not billed', () => {
  setup('rent');
  const c = resolveCharges(student({ messOptIn: true }));
  assert.strictEqual(c.messBilled, 0);
  assert.strictEqual(c.total, 8000);
  assert.strictEqual(c.messOptIn, false);
});

ok('the UI flags say to hide the mess controls', () => {
  setup('rent');
  const c = resolveCharges(student());
  assert.strictEqual(c.hostelMess, false);
  assert.strictEqual(c.messOptional, false);
});

console.log('\nrent + mess, student chooses (the old behaviour)');

ok('a student on the mess pays both', () => {
  setup('rent_mess_optional');
  const c = resolveCharges(student({ messOptIn: true }));
  assert.strictEqual(c.total, 14500);
  assert.strictEqual(c.messBilled, 6500);
});

ok('a student off the mess pays rent alone, and keeps the amount', () => {
  setup('rent_mess_optional');
  const c = resolveCharges(student({ messOptIn: false }));
  assert.strictEqual(c.total, 8000);
  assert.strictEqual(c.messBilled, 0);
  assert.strictEqual(c.mess, 6500, 'the figure is kept so turning it back on restores it');
});

ok('a record with no messOptIn is on the mess, as it always was', () => {
  setup('rent_mess_optional');
  assert.strictEqual(resolveCharges(student()).total, 14500);
});

ok('the toggle is offered', () => {
  setup('rent_mess_optional');
  assert.strictEqual(resolveCharges(student()).messOptional, true);
});

console.log('\nrent + mess together');

ok('everyone pays the combined charge', () => {
  setup('rent_mess_bundled');
  assert.strictEqual(resolveCharges(student()).total, 14500);
});

ok('THE HOLE IT CLOSES: a stale opt-out cannot under-bill anyone', () => {
  setup('rent_mess_bundled');
  const c = resolveCharges(student({ messOptIn: false }));
  assert.strictEqual(c.messBilled, 6500, 'a bundled hostel bills food to everybody');
  assert.strictEqual(c.total, 14500);
  assert.strictEqual(c.messOptIn, true);
});

ok('the toggle is not offered', () => {
  setup('rent_mess_bundled');
  const c = resolveCharges(student());
  assert.strictEqual(c.hostelMess, true);
  assert.strictEqual(c.messOptional, false);
});

console.log('\ninteraction with a per-student price override');

ok('a pinned student keeps their own rent under every model', () => {
  for (const m of ['rent', 'rent_mess_optional', 'rent_mess_bundled']) {
    setup(m);
    const c = resolveCharges(student({ _rentManuallySet: true, rent: 9500, mess: 1000 }));
    assert.strictEqual(c.rent, 9500, m + ': the override must survive');
  }
});

ok('but a pinned mess is still refused by a rent-only hostel', () => {
  setup('rent');
  const c = resolveCharges(student({ _rentManuallySet: true, rent: 9500, mess: 1000 }));
  assert.strictEqual(c.mess, 0);
  assert.strictEqual(c.total, 9500);
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
