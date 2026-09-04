/* ─── HOSTYLLO — the fixtures are in the state they claim to be in ───────────

   A fixture that does not reproduce the condition it advertises is worse than
   no fixture, because every test built on it passes for the wrong reason. This
   file asserts the claims `tests/fixtures/make-fixtures.js` makes about its own
   output — that the legacy database really is pre-migration, that the "full"
   room really is full, that the F-1 payment really is missing its `unpaid`
   field, and that the hostile backups are each rejected for the reason they
   were built to trigger.

   `validateBackup()` is not exported from renderer/src/utils.js (it is a
   browser global), so it is sliced out of the source and evaluated — the same
   technique tests/update-url.test.js uses on main.js, anchored on the
   function's own name so a rename fails loudly rather than testing nothing.

   Run:  node tests/fixtures/make-fixtures.js   (build them first)
         node tests/fixtures.test.js
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Database = require('better-sqlite3');
const M = require('../migrations/001-relational-schema');

const OUT = path.join(__dirname, 'fixtures', 'out');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + ((e && e.message) || e)); }
}

if (!fs.existsSync(path.join(OUT, 'manifest.json'))) {
  console.error('\nFixtures are not built. Run: node tests/fixtures/make-fixtures.js\n');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const openRO = (f) => new Database(path.join(OUT, f), { readonly: true, fileMustExist: true });
const rows = (db, t) => db.prepare(`SELECT data FROM ${t}`).all().map(r => JSON.parse(r.data));

// ── Lift validateBackup() out of utils.js ───────────────────────────────────
const UTILS = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', 'utils.js'), 'utf8');
const vbStart = UTILS.indexOf('const BACKUP_COLLECTIONS');
const vbEnd   = UTILS.indexOf('\nfunction ', UTILS.indexOf('function validateBackup'));
assert.ok(vbStart > 0, 'validateBackup() is no longer where this test slices it out of utils.js');
const validateBackup = new Function('fmtNum',
  UTILS.slice(vbStart, vbEnd > vbStart ? vbEnd : UTILS.length) + '\nreturn validateBackup;'
)((n) => String(n));

console.log('\nfixtures — do they hold the states they advertise\n');

// ── The manifest itself ─────────────────────────────────────────────────────

ok('every fixture named in the manifest exists on disk', () => {
  for (const name of Object.keys(manifest.files)) {
    assert.ok(fs.existsSync(path.join(OUT, name)), 'missing: ' + name);
  }
});

ok('the clock is fixed, so fixtures do not age', () => {
  assert.strictEqual(manifest.clock, '2026-09-01T00:00:00.000Z');
});

// ── empty.db ────────────────────────────────────────────────────────────────

ok('empty.db is a migrated schema with no business rows', () => {
  const db = openRO('empty.db');
  try {
    assert.strictEqual(M.currentVersion(db), M.SCHEMA_VERSION, 'not at schema v1');
    for (const t of M.ALL_TABLES) {
      assert.strictEqual(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c, 0, t + ' is not empty');
    }
    assert.ok(db.prepare("SELECT value FROM settings WHERE key='hostelSettings'").get(),
      'settings row missing');
  } finally { db.close(); }
});

// ── legacy-blob.db — the only real test of migration 001 ────────────────────

ok('legacy-blob.db is genuinely PRE-migration', () => {
  const db = openRO('legacy-blob.db');
  try {
    assert.strictEqual(M.currentVersion(db), 0, 'it already reports a schema version');
    const cols = db.pragma('table_info(students)').map(c => c.name);
    assert.deepStrictEqual(cols, ['id', 'data'],
      'students already has promoted columns: ' + cols.join(','));
    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all();
    assert.strictEqual(idx.length, 0, 'promoted indexes already exist');
  } finally { db.close(); }
});

ok('migrating legacy-blob.db is lossless and produces the current schema', () => {
  // On a COPY — a fixture is an input, and a test that mutates its own input
  // passes once and then tests something else forever.
  const src = path.join(OUT, 'legacy-blob.db');
  const tmp = path.join(OUT, '.migrate-check.db');
  fs.copyFileSync(src, tmp);
  try {
    const before = {};
    { const db = new Database(tmp, { readonly: true });
      for (const t of M.ALL_TABLES) before[t] = rows(db, t);
      db.close(); }

    const db = new Database(tmp);
    const res = M.migrateDatabase(db);
    assert.strictEqual(res.migrated, true, 'migration reported no work');
    assert.strictEqual(M.currentVersion(db), M.SCHEMA_VERSION);

    // Every record survives byte-identically.
    for (const t of M.ALL_TABLES) {
      const after = rows(db, t);
      assert.strictEqual(after.length, before[t].length, t + ' changed row count');
      const key = (r) => JSON.stringify(r);
      assert.deepStrictEqual(after.map(key).sort(), before[t].map(key).sort(),
        t + ' records were not preserved byte-identically');
    }
    // And the promoted columns now exist and are populated.
    const cols = db.pragma('table_info(students)').map(c => c.name);
    for (const c of ['name', 'phone', 'cnic', 'roomId', 'status', 'joinDate', 'rent']) {
      assert.ok(cols.includes(c), 'students.' + c + ' was not promoted');
    }
    const withRoom = db.prepare('SELECT COUNT(*) c FROM students WHERE roomId IS NOT NULL').get().c;
    assert.ok(withRoom > 0, 'promoted roomId column is empty after migration');
    db.close();
  } finally { fs.rmSync(tmp, { force: true }); }
});

// ── small / large ───────────────────────────────────────────────────────────

ok('small-hostel.db holds a coherent everyday hostel', () => {
  const db = openRO('small-hostel.db');
  try {
    const rooms = rows(db, 'rooms'), students = rows(db, 'students'), payments = rows(db, 'payments');
    assert.strictEqual(rooms.length, 12);
    assert.strictEqual(students.length, 24);
    assert.ok(payments.length > 0);
    // Every student sits in a room that exists.
    const ids = new Set(rooms.map(r => r.id));
    for (const s of students) assert.ok(!s.roomId || ids.has(s.roomId), 'dangling roomId: ' + s.roomId);
    // Every payment points at a student that exists.
    const sids = new Set(students.map(s => s.id));
    for (const p of payments) assert.ok(sids.has(p.studentId), 'dangling studentId: ' + p.studentId);
  } finally { db.close(); }
});

ok('large-hostel.db is big enough to measure against', () => {
  const db = openRO('large-hostel.db');
  try {
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM students').get().c, 500);
    assert.ok(db.prepare('SELECT COUNT(*) c FROM payments').get().c >= 5000,
      'payments too few to be a scale baseline');
  } finally { db.close(); }
});

// ── edge-money.db ───────────────────────────────────────────────────────────

ok('edge-money.db carries the F-1 record: extras present, `unpaid` absent', () => {
  const db = openRO('edge-money.db');
  try {
    const p = rows(db, 'payments').find(x => x.id === 'm_legacy_no_unpaid');
    assert.ok(p, 'm_legacy_no_unpaid is missing');
    assert.ok(!('unpaid' in p), '`unpaid` is present — this fixture no longer reproduces F-1');
    assert.strictEqual(p.extraTotal, 1500, 'extraTotal must be non-zero or F-1 cannot bite');

    /* The defect, stated as arithmetic so the fixture explains itself.
       The canonical formula (payments.js:2552) includes extraTotal; the
       edit-modal fallback (payments.js:2640) does not. */
    const canonical = Math.max(0, p.monthlyRent + p.messCharge + p.extraTotal
                       + p.admissionFee - p.concession - p.amount);
    const fallback  = Math.max(0, p.monthlyRent + (p.messIncluded ? p.messCharge : 0)
                       + p.admissionFee - p.concession - p.amount);
    assert.strictEqual(canonical, 8500);
    assert.strictEqual(fallback, 7000);
    assert.ok(fallback < canonical,
      'F-1 no longer under-reports — if this failed because the code was fixed, update this test');
  } finally { db.close(); }
});

ok('edge-money.db carries an overpayment whose surplus is nowhere (F-3)', () => {
  const db = openRO('edge-money.db');
  try {
    const p = rows(db, 'payments').find(x => x.id === 'm_overpaid');
    assert.ok(p, 'm_overpaid is missing');
    const due = p.monthlyRent + (p.messIncluded ? p.messCharge : 0);
    assert.ok(p.amount > due, 'not actually an overpayment');
    assert.strictEqual(p.unpaid, 0, 'unpaid should be clamped to 0');
    // The surplus exists in no field.
    assert.ok(!('credit' in p) && !('surplus' in p),
      'a credit field appeared — F-3 may have been addressed; update this test');
  } finally { db.close(); }
});

ok('edge-money.db covers partial, concession and admission-fee shapes', () => {
  const db = openRO('edge-money.db');
  try {
    const byId = new Map(rows(db, 'payments').map(p => [p.id, p]));
    const partial = byId.get('m_partial');
    assert.ok(partial.unpaid > 0 && partial.amount > 0 && partial.status === 'Pending');
    const conc = byId.get('m_concession');
    assert.strictEqual(conc.concession, conc.discount, 'the legacy discount twin must be written too');
    assert.strictEqual(byId.get('m_admission').admissionFee, 5000);
  } finally { db.close(); }
});

// ── edge-occupancy.db — the three definitions, as data ──────────────────────

// Reimplemented from renderer/src/modules/rooms.js, which is a browser global
// and cannot be required. Kept literal so a change there shows up as a
// disagreement here rather than a silent pass.
const RESIDENT = new Set(['Active', 'Cancelling']);
function occupancyOf(students, roomId) {
  return students.filter(s => s.roomId === roomId && RESIDENT.has(s.status)).length;
}
function vacatingOf(students, cancellations, roomId) {
  const onNotice = new Set(cancellations.filter(c => c.status === 'Pending').map(c => c.studentId));
  return students.filter(s => s.roomId === roomId && RESIDENT.has(s.status) && onNotice.has(s.id)).length;
}
const CAP = { '1s': 1, '2s': 2, '3s': 3, '4s': 4 };

ok('edge-occupancy room_B is GENUINELY full — the double-booking case (B-1)', () => {
  const db = openRO('edge-occupancy.db');
  try {
    const students = rows(db, 'students'), canc = rows(db, 'cancellations');
    const room = rows(db, 'rooms').find(r => r.id === 'room_B');
    const cap = CAP[room.typeId];
    const occ = occupancyOf(students, 'room_B');
    const vac = vacatingOf(students, canc, 'room_B');
    const free = Math.max(0, cap - occ + vac);
    const activeOnly = students.filter(s => s.roomId === 'room_B' && s.status === 'Active').length;

    assert.strictEqual(cap, 1);
    assert.strictEqual(occ, 1, 'occupancy must be 1');
    assert.strictEqual(vac, 0, 'a CONFIRMED cancellation must not count as vacating');
    assert.strictEqual(free, 0, 'the room must be genuinely full');
    assert.strictEqual(activeOnly, 0,
      'the `status===Active` count must read 0 — that is exactly what lets the edit path in');
  } finally { db.close(); }
});

ok('edge-occupancy room_C is the mislabelled case (B-2)', () => {
  const db = openRO('edge-occupancy.db');
  try {
    const students = rows(db, 'students'), canc = rows(db, 'cancellations');
    const cap = CAP['2s'];
    const occ = occupancyOf(students, 'room_C');
    const vac = vacatingOf(students, canc, 'room_C');
    const free = Math.max(0, cap - occ + vac);
    assert.strictEqual(occ, 1);
    assert.strictEqual(vac, 1);
    assert.strictEqual(free, 2, 'freeBeds must be 2 while only one bed is physically empty');
    assert.ok(occ < cap, 'occ < cap is what routes roomAvailLabel away from the "reservable" wording');
  } finally { db.close(); }
});

ok('edge-occupancy room_D is over capacity via a forced admission', () => {
  const db = openRO('edge-occupancy.db');
  try {
    const students = rows(db, 'students');
    const inD = students.filter(s => s.roomId === 'room_D');
    assert.strictEqual(inD.length, 3, 'room_D should hold 3 in a 2-seater');
    assert.ok(inD.some(s => s.isForced === true), 'no forced student — the override is not represented');
  } finally { db.close(); }
});

// ── corrupt.db ──────────────────────────────────────────────────────────────

ok('corrupt.db opens and then fails on the first query', () => {
  const file = path.join(OUT, 'corrupt.db');
  let opened = false, threw = null;
  let db;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    opened = true;
    db.prepare('SELECT COUNT(*) c FROM students').get();
  } catch (e) { threw = e; }
  finally { try { if (db) db.close(); } catch (_) {} }
  assert.ok(threw, 'a corrupt database was read successfully — the fixture is not corrupt');
  assert.ok(opened || /file is not a database|malformed|disk image/i.test(threw.message),
    'unexpected failure shape: ' + threw.message);
});

// ── backup JSON fixtures ────────────────────────────────────────────────────

const readBackup = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));

ok('backup-valid.json is accepted', () => {
  const r = validateBackup(readBackup('backup-valid.json'));
  assert.strictEqual(r.ok, true, 'rejected: ' + r.reason);
});

ok('backup-hostile-proto.json is rejected for a reserved key', () => {
  const r = validateBackup(readBackup('backup-hostile-proto.json'));
  assert.strictEqual(r.ok, false);
  assert.ok(/reserved key/.test(r.reason), 'wrong reason: ' + r.reason);
});

ok('backup-damaged-collection.json is rejected as a damaged list', () => {
  const r = validateBackup(readBackup('backup-damaged-collection.json'));
  assert.strictEqual(r.ok, false);
  assert.ok(/should be a list/.test(r.reason), 'wrong reason: ' + r.reason);
});

ok('backup-missing-id.json is rejected and names the record', () => {
  const r = validateBackup(readBackup('backup-missing-id.json'));
  assert.strictEqual(r.ok, false);
  assert.ok(/has no id/.test(r.reason), 'wrong reason: ' + r.reason);
});

ok('backup-too-deep.json is rejected for nesting', () => {
  const r = validateBackup(readBackup('backup-too-deep.json'));
  assert.strictEqual(r.ok, false);
  assert.ok(/nested too deeply/.test(r.reason), 'wrong reason: ' + r.reason);
});

ok('backup-not-ours.json is rejected as not a Hostyllo backup', () => {
  const r = validateBackup(readBackup('backup-not-ours.json'));
  assert.strictEqual(r.ok, false);
  assert.ok(/not a Hostyllo backup/.test(r.reason), 'wrong reason: ' + r.reason);
});

ok('no fixture names a real hostel, person or address', () => {
  // Owner's ruling, 2026-08-30. A fixture is the easiest place for a real
  // customer's name to leak into the repository.
  const banned = /damam|kakakhel|zeerak/i;
  for (const name of Object.keys(manifest.files)) {
    if (!name.endsWith('.json')) continue;
    const body = fs.readFileSync(path.join(OUT, name), 'utf8');
    assert.ok(!banned.test(body), name + ' contains a real-world identifier');
  }
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
