/* Opt-in control-plane features, and the permission that goes with Owner Funds
   (step 2, 2026-09-28).

   Every existing flag fails OPEN: no word from the control plane means "on",
   so ~50 hostels in the field lose nothing. A feature built for one client must
   do the opposite, or it reaches every hostel that is offline. And a permission
   for the owner's own money must not be handed to every warden by the rule that
   grants new permissions to everyone.

     npm run test:featureoptin */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// LF only: a Windows checkout hands us CRLF, and the slicing below looks for '\n}\n'.
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
};

/* ── enforcement-ui.js in a sandbox: no electronAPI, so it only defines ────── */
function sandboxUI() {
  const store = {};
  const sb = {
    console, setInterval() {}, setTimeout, clearTimeout,
    localStorage: {
      getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: { body: { classList: { toggle() {}, add() {}, remove() {} } },
                getElementById: () => null, querySelectorAll: () => [], createElement: () => ({}) },
    toasts: [],
  };
  sb.window = sb;
  sb.toast = (m) => sb.toasts.push(m);
  vm.createContext(sb);
  vm.runInContext(src('renderer/src/enforcement-ui.js'), sb, { filename: 'enforcement-ui.js' });
  // Set the decision the way _apply() would, without the DOM work.
  sb.set = (d) => vm.runInContext('_enforcement = ' + JSON.stringify(d), sb);
  sb.store = store;
  return sb;
}

console.log('\nOpt-in features');

ok('with no word from the control plane, an opt-in feature is OFF (the others stay ON)', () => {
  const s = sandboxUI();
  s.set(null);
  assert.strictEqual(s.hasFeature('ownerFunds'), false);
  assert.strictEqual(s.hasFeature('reports'), true, 'the existing flags must still fail open');
  s.set({ features: null });
  assert.strictEqual(s.hasFeature('ownerFunds'), false);
});

ok('switched on for this hostel, it is on — and remembered', () => {
  const s = sandboxUI();
  s.set({ features: { reports: true, ownerFunds: true } });
  assert.strictEqual(s.hasFeature('ownerFunds'), true);
  assert.strictEqual(s.store.hx_feat_on_ownerFunds, '1');
});

ok('offline later (stale entitlement → features null), the hostel keeps it', () => {
  const s = sandboxUI();
  s.set({ features: { ownerFunds: true } });
  s.hasFeature('ownerFunds');
  s.set({ features: null });
  assert.strictEqual(s.hasFeature('ownerFunds'), true);
  s.set(null);
  assert.strictEqual(s.hasFeature('ownerFunds'), true);
});

ok('switched OFF by the control plane, it goes — and is forgotten', () => {
  const s = sandboxUI();
  s.set({ features: { ownerFunds: true } });
  s.hasFeature('ownerFunds');
  s.set({ features: { ownerFunds: false } });
  assert.strictEqual(s.hasFeature('ownerFunds'), false);
  assert.ok(!('hx_feat_on_ownerFunds' in s.store));
  s.set({ features: null });
  assert.strictEqual(s.hasFeature('ownerFunds'), false, 'a later offline spell does not bring it back');
});

ok('a control plane too old to know the flag is "no news", not "off"', () => {
  const s = sandboxUI();
  s.set({ features: { ownerFunds: true } });
  s.hasFeature('ownerFunds');
  s.set({ features: { reports: true } });            // key absent
  assert.strictEqual(s.hasFeature('ownerFunds'), true);
});

ok('the refusal says it is not switched on, not that it was not bought', () => {
  const s = sandboxUI();
  s.set(null);
  assert.strictEqual(s.requireFeature('ownerFunds'), false);
  assert.ok(/not switched on for this hostel/.test(s.toasts[0]), s.toasts[0]);
});

ok('the page is gated by the flag', () => {
  const s = sandboxUI();
  assert.strictEqual(s.featureForPage('ownerfunds'), 'ownerFunds');
});

/* ── the permission ───────────────────────────────────────────────────────── */

console.log('\nThe Owner funds permission');

/* _migrateUsers() and PERMS lifted out of auth-nev.js, which as a whole needs
   the browser's crypto and storage to load. */
function migrate(cfg) {
  const a = src('renderer/src/auth-nev.js');
  const permsSrc = a.slice(a.indexOf('const PERMS = ['), a.indexOf('const PERM_KEYS'));
  const fnSrc = a.slice(a.indexOf('function _migrateUsers('), a.indexOf('\n}\n', a.indexOf('function _migrateUsers(')) + 3);
  const sb = { console };
  vm.createContext(sb);
  vm.runInContext(permsSrc + 'const PERM_KEYS = PERMS.map(p => p.key);\n' + fnSrc + '\nthis.run = _migrateUsers;', sb);
  sb.run(cfg);
  return cfg;
}

ok('an update gives it to accounts that manage users, and to nobody else', () => {
  const cfg = migrate({
    owner:  { username: 'owner',  perms: { add: true, edit: true, delete: true, payments: true, reports: true,
                                           backup: true, settings: true, users: true } },
    warden: { username: 'warden', perms: { add: true, edit: true, payments: true, reports: true,
                                           delete: false, backup: false, settings: false, users: false } },
  });
  assert.strictEqual(cfg.owner.perms.ownerFunds, true);
  assert.strictEqual(cfg.warden.perms.ownerFunds, false, 'a warden must not start seeing the owner\'s money');
});

ok('an administrator\'s later choice is kept, either way', () => {
  const cfg = migrate({
    a: { username: 'a', perms: { users: true, ownerFunds: false } },
    b: { username: 'b', perms: { users: false, ownerFunds: true } },
  });
  assert.strictEqual(cfg.a.perms.ownerFunds, false);
  assert.strictEqual(cfg.b.perms.ownerFunds, true);
});

ok('other new permissions still follow the grant-to-everyone rule', () => {
  const cfg = migrate({ w: { username: 'w', perms: { users: false } } });
  assert.strictEqual(cfg.w.perms.reports, true, 'the blanket rule itself was not changed');
});

ok('Super Admin includes it; no other preset does', () => {
  const u = src('renderer/src/modules/users.js');
  const roles = u.slice(u.indexOf('const USER_ROLES = ['), u.indexOf('];', u.indexOf('const USER_ROLES = [')));
  const lines = roles.split('\n').filter(l => /key:/.test(l));
  for (const l of lines) {
    const has = /'ownerFunds'/.test(l);
    assert.strictEqual(has, /Super Admin/.test(l), l.trim());
  }
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
