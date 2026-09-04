/* ─── HOSTYLLO — Enterprise fixture generator (Phase 0) ──────────────────────

   WHY A GENERATOR RATHER THAN COMMITTED .db FILES

   The later phases need databases in specific *states*, not specific bytes: a
   pre-migration blob schema, a hostel large enough to measure against, a
   payment whose `unpaid` is absent, a room whose only occupant has given
   notice. Committing binaries for those would mean nobody can see what is in
   them in a diff, and every schema change would silently invalidate them while
   the tests kept passing against a database the app no longer produces.

   So the states are described in code and built on demand. The DDL comes from
   `migrations/001-relational-schema.js` — the same module the app runs — so a
   fixture can never drift from the schema it is supposed to represent.

   EVERY FIXTURE IS DETERMINISTIC IN ITS CONTENT. A seeded PRNG and a fixed
   clock, so the same command produces the same records on any machine.

   The manifest hashes the CONTENT, not the file. SQLite does not write
   byte-identical files for identical data — page allocation, the freelist and
   an internal change counter all vary, and VACUUM does not normalise them
   (measured: three consecutive VACUUMs of one database produced three
   different digests). A byte hash would therefore report drift on every
   rebuild and teach everyone to ignore it. `contentSha256` is taken over the
   schema version and the sorted records of every table, so it moves when the
   DATA or the SCHEMA moves — which is the only kind of drift worth a review.

   NO REAL PERSON, HOSTEL OR ADDRESS APPEARS HERE. Owner's ruling, 2026-08-30.
   Names are transparently synthetic ("Resident 001"), and the hostel is
   "Fixture Hostel".

   Run:  node tests/fixtures/make-fixtures.js
         node tests/fixtures/make-fixtures.js --verify     (no writes; checks drift)

   Output: tests/fixtures/out/   (gitignored — regenerate, never commit)
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const M = require('../../migrations/001-relational-schema');

const OUT = path.join(__dirname, 'out');
const VERIFY = process.argv.includes('--verify');

// ── Determinism ─────────────────────────────────────────────────────────────
// mulberry32: small, seeded, and stable across Node versions — Math.random()
// would make every regeneration a different file for no reason.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Fixed clock. Fixtures must not age. */
const T0 = new Date('2026-09-01T00:00:00.000Z');
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
const MONTH_LABEL = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const monthLabel = (d) => MONTH_LABEL[new Date(d).getUTCMonth()] + ' ' + new Date(d).getUTCFullYear();

// ── Settings every fixture shares ──────────────────────────────────────────
// Mirrors renderer/src/config.js defaults. serviceModel is left at the default
// so a fixture never silently changes billing behaviour under a test.
const ROOM_TYPES = [
  { id: '1s', name: '1-Seater', capacity: 1, defaultRent: 16000, defaultMess: 0,  color: '#2563eb' },
  { id: '2s', name: '2-Seater', capacity: 2, defaultRent: 12000, defaultMess: 3000, color: '#9b6df0' },
  { id: '3s', name: '3-Seater', capacity: 3, defaultRent: 9000,  defaultMess: 3000, color: '#16a34a' },
  { id: '4s', name: '4-Seater', capacity: 4, defaultRent: 7000,  defaultMess: 3000, color: '#f59e0b' },
];
function baseSettings(over) {
  return Object.assign({
    appName: 'HOSTYLLO',
    hostelName: 'Fixture Hostel',
    tagline: 'Safe & Comfortable Living',
    location: '', phone: '', email: '',
    version: 'v1.0',
    currency: 'PKR',
    receiptCounter: 0,
    roomTypes: ROOM_TYPES,
    paymentMethods: ['Cash', 'Bank Transfer', 'Easypaisa', 'JazzCash'],
    expenseCategories: ['Electricity', 'Gas', 'Water', 'Food', 'Salary',
      'Maintenance', 'Cleaning', 'Security', 'Internet', 'Fund Transfer', 'Other'],
    floors: ['Ground', '1st', '2nd', '3rd'],
    serviceModel: 'rent_mess_optional',
    setupCompletedAt: null,
    setupStep: null,
  }, over || {});
}

// ── Schema builders ─────────────────────────────────────────────────────────

/** The CURRENT schema — exactly what migration 001 produces. */
function createMigrated(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  db.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  for (const ddl of M.buildDDL()) db.exec(ddl);
  db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?)").run(String(M.SCHEMA_VERSION));
}

/**
 * The LEGACY schema — every collection as (id, data), no schema_meta.
 *
 * This is what ~50 machines in the field held before the migration, and it is
 * the only shape that exercises `migrateDatabase()` for real. It is
 * reconstructed here rather than copied from a client, because a client's
 * database is their data.
 */
function createLegacy(db) {
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  for (const t of M.ALL_TABLES) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
  }
}

/** Insert records the way the app does — promoted columns plus the blob. */
function insertMigrated(db, table, records) {
  if (!records.length) return;
  const spec = M.PROMOTED[table];
  const cols = ['id'].concat(spec ? spec.columns.map(c => c.name) : []).concat(['data']);
  const ins = db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => '@' + c).join(', ')})`);
  const tx = db.transaction((rows) => { for (const r of rows) ins.run(M.promoteRecord(table, r)); });
  tx(records);
}

/** Insert records the way the PRE-migration app did — id + JSON blob only. */
function insertLegacy(db, table, records) {
  if (!records.length) return;
  const ins = db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`);
  const tx = db.transaction((rows) => { for (const r of rows) ins.run(r.id, JSON.stringify(r)); });
  tx(records);
}

function putSettings(db, settings) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('hostelSettings', JSON.stringify(settings));
}

// ── Record builders ─────────────────────────────────────────────────────────

function makeRooms(count, rand) {
  const floors = ['Ground', '1st', '2nd', '3rd'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const type = ROOM_TYPES[i % ROOM_TYPES.length];
    out.push({
      id: 'room_f' + String(i + 1).padStart(4, '0'),
      number: String(101 + i),
      floor: floors[Math.floor(i / Math.max(1, Math.ceil(count / 4))) % 4],
      typeId: type.id,
      rent: type.defaultRent,
      studentIds: [],                       // written by the app, never read — see the brief
      amenities: ['Fan', 'Bed', 'Wardrobe'],
      notes: '',
    });
  }
  return out;
}

function makeStudents(count, rooms, rand, joinSpreadDays) {
  const out = [];
  const perRoom = new Map();
  for (let i = 0; i < count; i++) {
    // Fill rooms up to capacity, in order, so occupancy is predictable.
    let room = null;
    for (const r of rooms) {
      const cap = ROOM_TYPES.find(t => t.id === r.typeId).capacity;
      const n = perRoom.get(r.id) || 0;
      if (n < cap) { room = r; perRoom.set(r.id, n + 1); break; }
    }
    const type = room ? ROOM_TYPES.find(t => t.id === room.typeId) : ROOM_TYPES[0];
    const joined = addDays(T0, -Math.floor(rand() * (joinSpreadDays || 300)) - 30);
    out.push({
      id: String(i + 1).padStart(3, '0'),
      name: 'Resident ' + String(i + 1).padStart(3, '0'),
      fatherName: 'Guardian ' + String(i + 1).padStart(3, '0'),
      cnic: '00000-0000000-0',              // structurally valid, obviously synthetic
      phone: '0300-0000000',
      email: '', occupation: 'Student',
      roomId: room ? room.id : '',
      rent: type.defaultRent,
      mess: type.defaultMess,
      messOptIn: true,
      deposit: 0, admissionFee: 0, discount: 0,
      joinDate: ymd(joined),
      paymentMethod: 'Cash',
      emergencyContact: '0300-0000000',
      address: '', notes: '',
      status: 'Active',
      createdAt: ymd(joined),
      docs: { photo: '' },
    });
  }
  return out;
}

/** One payment per student per month since they joined, settled except the last. */
function makePayments(students, rooms, months, rand) {
  const roomById = new Map(rooms.map(r => [r.id, r]));
  const out = [];
  let n = 0;
  for (const s of students) {
    const room = roomById.get(s.roomId);
    const type = room ? ROOM_TYPES.find(t => t.id === room.typeId) : ROOM_TYPES[0];
    const rent = type.defaultRent, mess = type.defaultMess;
    for (let m = months - 1; m >= 0; m--) {
      const when = new Date(Date.UTC(T0.getUTCFullYear(), T0.getUTCMonth() - m, 5));
      if (ymd(when) < s.joinDate) continue;
      const settled = m > 0;                        // the current month is still due
      const due = rent + mess;
      out.push({
        id: 'p_f' + String(++n).padStart(6, '0'),
        collectedBy: settled ? 'Warden 1' : '',
        studentId: s.id, studentName: s.name,
        roomId: s.roomId, roomNumber: room ? room.number : '',
        amount: settled ? due : 0,
        monthlyRent: rent, totalRent: rent,
        messCharge: mess, messIncluded: true,
        unpaid: settled ? 0 : due,
        extraCharges: [], extraTotal: 0,
        admissionFee: 0, concession: 0, concessionDesc: '', discount: 0,
        method: 'Cash',
        month: monthLabel(when),
        date: ymd(when),
        dueDate: '', paidDate: settled ? ymd(when) : '',
        status: settled ? 'Paid' : 'Pending',
        notes: '', partialPayments: [],
      });
    }
  }
  return out;
}

function makeExpenses(count, cats, rand) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: 'e_f' + String(i + 1).padStart(6, '0'),
      category: cats[i % cats.length],
      amount: 1000 + Math.floor(rand() * 20) * 500,
      date: ymd(addDays(T0, -Math.floor(rand() * 200))),
      description: 'Fixture expense ' + (i + 1),
    });
  }
  return out;
}

// ── The fixtures ────────────────────────────────────────────────────────────

const FIXTURES = {

  /** A fresh install immediately after migration: schema v1, nothing in it. */
  'empty.db'(db) {
    createMigrated(db);
    putSettings(db, baseSettings());
    return { note: 'fresh install, schema v1, zero business rows' };
  },

  /**
   * The PRE-migration shape. No schema_meta, every table (id, data).
   * `migrateDatabase()` run against this is the only real test of migration
   * 001, and of the `.pre-v1.bak` snapshot path in main.js.
   */
  'legacy-blob.db'(db) {
    createLegacy(db);
    const rand = rng(1001);
    const rooms = makeRooms(8, rand);
    const students = makeStudents(12, rooms, rand);
    const payments = makePayments(students, rooms, 3, rand);
    const expenses = makeExpenses(10, baseSettings().expenseCategories, rand);
    insertLegacy(db, 'rooms', rooms);
    insertLegacy(db, 'students', students);
    insertLegacy(db, 'payments', payments);
    insertLegacy(db, 'expenses', expenses);
    putSettings(db, baseSettings());
    return { note: 'pre-migration blob schema, no schema_meta',
      rooms: rooms.length, students: students.length, payments: payments.length };
  },

  /** The everyday case. Small enough to reason about by hand. */
  'small-hostel.db'(db) {
    createMigrated(db);
    const rand = rng(2002);
    const rooms = makeRooms(12, rand);
    const students = makeStudents(24, rooms, rand);
    const payments = makePayments(students, rooms, 4, rand);
    const expenses = makeExpenses(30, baseSettings().expenseCategories, rand);
    insertMigrated(db, 'rooms', rooms);
    insertMigrated(db, 'students', students);
    insertMigrated(db, 'payments', payments);
    insertMigrated(db, 'expenses', expenses);
    putSettings(db, baseSettings({ receiptCounter: 40 }));
    return { rooms: rooms.length, students: students.length,
      payments: payments.length, expenses: expenses.length };
  },

  /**
   * The scale baseline. §30 of the spec asks for performance requirements and
   * the brief records that NOTHING is currently measured — this is the input
   * those measurements need. 500 students is well beyond any hostel seen, on
   * purpose: a limit is only useful if the fixture can reach it.
   */
  'large-hostel.db'(db) {
    createMigrated(db);
    const rand = rng(3003);
    const rooms = makeRooms(200, rand);
    // A three-year join spread with 24 months of history, so most residents
    // carry a full ledger rather than a few months — a scale baseline is only
    // useful if the rows actually exist.
    const students = makeStudents(500, rooms, rand, 1000);
    const payments = makePayments(students, rooms, 24, rand);
    const expenses = makeExpenses(1200, baseSettings().expenseCategories, rand);
    insertMigrated(db, 'rooms', rooms);
    insertMigrated(db, 'students', students);
    insertMigrated(db, 'payments', payments);
    insertMigrated(db, 'expenses', expenses);
    putSettings(db, baseSettings({ receiptCounter: 5000 }));
    return { rooms: rooms.length, students: students.length,
      payments: payments.length, expenses: expenses.length };
  },

  /**
   * Every money shape the codebase can produce, including the ones that only
   * exist in old data. Phase 2 (financial correctness) has to keep all of
   * these giving the same answers it gives today, or it has changed a
   * customer's ledger.
   */
  'edge-money.db'(db) {
    createMigrated(db);
    const rooms = makeRooms(4, rng(4004));
    const students = makeStudents(6, rooms, rng(4004));
    insertMigrated(db, 'rooms', rooms);
    insertMigrated(db, 'students', students);

    const base = { roomId: rooms[0].id, roomNumber: rooms[0].number, method: 'Cash',
      date: '2026-08-05', dueDate: '', notes: '', partialPayments: [], extraCharges: [] };
    const payments = [
      // 1. clean settled month
      Object.assign({}, base, { id: 'm_paid', studentId: '001', studentName: 'Resident 001',
        amount: 16000, monthlyRent: 16000, totalRent: 16000, messCharge: 0, messIncluded: false,
        unpaid: 0, extraTotal: 0, admissionFee: 0, concession: 0, discount: 0,
        month: 'August 2026', status: 'Paid', paidDate: '2026-08-05' }),
      // 2. partial — the arrears path
      Object.assign({}, base, { id: 'm_partial', studentId: '002', studentName: 'Resident 002',
        amount: 6000, monthlyRent: 12000, totalRent: 12000, messCharge: 3000, messIncluded: true,
        unpaid: 9000, extraTotal: 0, admissionFee: 0, concession: 0, discount: 0,
        month: 'August 2026', status: 'Pending', paidDate: '',
        partialPayments: [{ amount: 6000, date: '2026-08-05', method: 'Cash' }] }),
      // 3. concession applied (and its legacy `discount` twin, as the app writes both)
      Object.assign({}, base, { id: 'm_concession', studentId: '003', studentName: 'Resident 003',
        amount: 10000, monthlyRent: 12000, totalRent: 12000, messCharge: 3000, messIncluded: true,
        unpaid: 0, extraTotal: 0, admissionFee: 0, concession: 5000, concessionDesc: 'Sibling',
        discount: 5000, discountDesc: 'Sibling', month: 'August 2026', status: 'Paid',
        paidDate: '2026-08-05' }),
      // 4. extra charges present AND `unpaid` recorded — the correct modern shape
      Object.assign({}, base, { id: 'm_extras', studentId: '004', studentName: 'Resident 004',
        amount: 5000, monthlyRent: 9000, totalRent: 9000, messCharge: 3000, messIncluded: true,
        extraCharges: [{ label: 'Laundry', amount: 800 }, { label: 'Fan', amount: 700 }],
        extraTotal: 1500, admissionFee: 0, concession: 0, discount: 0,
        unpaid: 8500, month: 'August 2026', status: 'Pending', paidDate: '' }),
      /* 5. THE F-1 RECORD. Extra charges, and NO `unpaid` field at all.
            The edit-payment modal recomputes the fallback without extraTotal
            (payments.js:2640), so this record is the one that reads a smaller
            balance than it owes. Phase 2 must change what this shows — and
            this fixture is how anyone proves it did. */
      Object.assign({}, base, { id: 'm_legacy_no_unpaid', studentId: '005',
        studentName: 'Resident 005', amount: 5000, monthlyRent: 9000, totalRent: 9000,
        messCharge: 3000, messIncluded: true,
        extraCharges: [{ label: 'Laundry', amount: 1500 }], extraTotal: 1500,
        admissionFee: 0, concession: 0, discount: 0,
        month: 'August 2026', status: 'Pending', paidDate: '' }),
      // 6. admission fee on the first month
      Object.assign({}, base, { id: 'm_admission', studentId: '006', studentName: 'Resident 006',
        amount: 20000, monthlyRent: 12000, totalRent: 12000, messCharge: 3000, messIncluded: true,
        unpaid: 0, extraTotal: 0, admissionFee: 5000, concession: 0, discount: 0,
        month: 'August 2026', status: 'Paid', paidDate: '2026-08-05' }),
      /* 7. OVERPAYMENT. `unpaid` clamps at 0 (F-3) so the surplus is nowhere.
            Recorded as a fixture because Phase 2's credit-balance work has to
            decide what this record means. */
      Object.assign({}, base, { id: 'm_overpaid', studentId: '001', studentName: 'Resident 001',
        amount: 20000, monthlyRent: 16000, totalRent: 16000, messCharge: 0, messIncluded: false,
        unpaid: 0, extraTotal: 0, admissionFee: 0, concession: 0, discount: 0,
        month: 'July 2026', date: '2026-07-05', status: 'Paid', paidDate: '2026-07-05' }),
    ];
    insertMigrated(db, 'payments', payments);
    putSettings(db, baseSettings({ receiptCounter: 7 }));
    return { payments: payments.length, note: 'includes the F-1 legacy record and an overpayment' };
  },

  /**
   * The three definitions of "occupied", as data.
   *
   * Room A: 1-seater, occupant on notice with a PENDING cancellation
   *         → occupancy 1, vacating 1, freeBeds 1  ("reservable")
   * Room B: 1-seater, occupant on notice with a CONFIRMED cancellation
   *         → occupancy 1, vacating 0, freeBeds 0  (genuinely FULL)
   *           This is the room the edit path will still move a student into.
   * Room C: 2-seater, 1 resident on notice
   *         → label says "2 free" for a room with 1 empty bed (B-2)
   * Room D: 2-seater, force-added third student (isForced)
   */
  'edge-occupancy.db'(db) {
    createMigrated(db);
    const rooms = [
      { id: 'room_A', number: '301', floor: 'Ground', typeId: '1s', rent: 16000, studentIds: [], amenities: [], notes: 'pending notice' },
      { id: 'room_B', number: '302', floor: 'Ground', typeId: '1s', rent: 16000, studentIds: [], amenities: [], notes: 'confirmed notice — genuinely full' },
      { id: 'room_C', number: '303', floor: 'Ground', typeId: '2s', rent: 12000, studentIds: [], amenities: [], notes: 'partial + notice' },
      { id: 'room_D', number: '304', floor: 'Ground', typeId: '2s', rent: 12000, studentIds: [], amenities: [], notes: 'over capacity' },
      { id: 'room_E', number: '305', floor: 'Ground', typeId: '2s', rent: 12000, studentIds: [], amenities: [], notes: 'empty' },
    ];
    const stu = (id, roomId, status, extra) => Object.assign({
      id, name: 'Resident ' + id, roomId, rent: 12000, mess: 3000, messOptIn: true,
      status, joinDate: '2026-06-01', createdAt: '2026-06-01', docs: {},
      cnic: '00000-0000000-0', phone: '0300-0000000',
    }, extra || {});
    const students = [
      stu('001', 'room_A', 'Cancelling'),
      stu('002', 'room_B', 'Cancelling'),
      stu('003', 'room_C', 'Cancelling'),
      stu('004', 'room_D', 'Active'),
      stu('005', 'room_D', 'Active'),
      stu('006', 'room_D', 'Active', { isForced: true }),
      stu('007', '',        'Left', { leftDate: '2026-08-31' }),
    ];
    const canc = (id, studentId, roomId, roomNumber, status) => ({
      id, studentId, studentName: 'Resident ' + studentId, roomId, roomNumber,
      roomType: '', requestDate: '2026-08-20', vacateDate: '2026-09-30',
      reason: 'fixture', status, createdAt: '2026-08-20T00:00:00.000Z',
    });
    const cancellations = [
      canc('c_A', '001', 'room_A', '301', 'Pending'),
      canc('c_B', '002', 'room_B', '302', 'Confirmed'),
      canc('c_C', '003', 'room_C', '303', 'Pending'),
    ];
    insertMigrated(db, 'rooms', rooms);
    insertMigrated(db, 'students', students);
    insertMigrated(db, 'cancellations', cancellations);
    putSettings(db, baseSettings());
    return { rooms: rooms.length, students: students.length,
      cancellations: cancellations.length,
      note: 'room_B is the double-booking case; room_C is the mislabelled one' };
  },
};

// ── JSON backup fixtures ────────────────────────────────────────────────────
// Small, exact, and committed as data rather than generated shapes, because
// what makes a hostile backup hostile is the exact bytes.

function backupFixtures() {
  const rand = rng(5005);
  const rooms = makeRooms(3, rand);
  const students = makeStudents(4, rooms, rand);
  const payments = makePayments(students, rooms, 2, rand);
  const valid = {
    rooms, students, payments,
    expenses: makeExpenses(5, baseSettings().expenseCategories, rand),
    cancellations: [], maintenance: [], complaints: [], checkinlog: [], notices: [],
    fines: [], activityLog: [], inspections: [], billSplits: [], transfers: [],
    roomShifts: [], archive: [],
    settings: baseSettings(),
  };

  // A __proto__ key nested inside a record. JSON.parse itself is safe; the
  // danger is the merges and spreads downstream, which is why validateBackup()
  // walks the whole document.
  const hostile = JSON.parse(JSON.stringify(valid));
  hostile.students[0].docs = JSON.parse('{"photo":"","__proto__":{"isAdmin":true}}');

  // A collection that is TRUTHY but not an array — _initDBFields' `if (!d.students)`
  // guard lets this through, and then every .filter/.map on it throws.
  const damaged = JSON.parse(JSON.stringify(valid));
  damaged.students = 'abc';

  // A record with no id. db:importFull binds r.id into an INSERT; undefined
  // fails the transaction AFTER the renderer replaced its in-memory DB.
  const missingId = JSON.parse(JSON.stringify(valid));
  delete missingId.payments[0].id;

  // Deeper than BACKUP_MAX_DEPTH (24).
  let deep = { end: true };
  for (let i = 0; i < 30; i++) deep = { nest: deep };
  const tooDeep = JSON.parse(JSON.stringify(valid));
  tooDeep.settings = Object.assign(baseSettings(), { deep });

  // Valid JSON that is simply not ours.
  const notOurs = { some: 'other', product: [1, 2, 3] };

  return {
    'backup-valid.json': valid,
    'backup-hostile-proto.json': hostile,
    'backup-damaged-collection.json': damaged,
    'backup-missing-id.json': missingId,
    'backup-too-deep.json': tooDeep,
    'backup-not-ours.json': notOurs,
  };
}

// ── A deliberately corrupt database ─────────────────────────────────────────
/**
 * A real SQLite header followed by garbage. Opening it succeeds; the first
 * query fails. That is the shape of the failure the brief records as having no
 * recovery path (§24.1), so Phase 1's DB health check needs it to fail against.
 */
function writeCorrupt(file) {
  const header = Buffer.from('SQLite format 3\0', 'binary');
  const junk = Buffer.alloc(4096 - header.length, 0x5a);
  fs.writeFileSync(file, Buffer.concat([header, junk]));
}

// ── Build ───────────────────────────────────────────────────────────────────

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * A digest of what a database MEANS rather than how SQLite laid it out.
 *
 * Schema version, then every table's records sorted by their serialised form,
 * then the settings rows. Two databases with this digest hold the same data,
 * whatever their page layout.
 */
function contentDigest(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const h = crypto.createHash('sha256');
    let version = 0;
    try { version = M.currentVersion(db); } catch (_) {}
    h.update('schema:' + version + '\n');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    for (const t of tables) {
      if (t === 'settings' || t === 'schema_meta' || t.startsWith('sqlite_')) continue;
      let recs = [];
      try { recs = db.prepare('SELECT data FROM "' + t + '"').all().map(r => r.data); }
      catch (_) { continue; }
      recs.sort();
      h.update('table:' + t + ':' + recs.length + '\n');
      for (const r of recs) h.update(r + '\n');
    }
    try {
      const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all();
      for (const r of rows) h.update('setting:' + r.key + ':' + r.value + '\n');
    } catch (_) {}
    return h.digest('hex');
  } finally { db.close(); }
}

function build() {
  if (!VERIFY) {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
  } else if (!fs.existsSync(OUT)) {
    console.error('--verify: no fixtures built yet. Run without --verify first.');
    process.exit(2);
  }

  const manifest = { generatedFrom: 'tests/fixtures/make-fixtures.js', clock: T0.toISOString(), files: {} };

  for (const [name, fn] of Object.entries(FIXTURES)) {
    const file = path.join(OUT, name);
    if (!VERIFY) {
      const db = new Database(file);
      // WAL leaves sidecar files that would make the hash unstable; a fixture
      // is a single artefact, so checkpoint and drop back to the default.
      const meta = fn(db);
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.pragma('journal_mode = DELETE');
      db.close();
      manifest.files[name] = Object.assign({ contentSha256: contentDigest(file) }, meta);
    } else {
      manifest.files[name] = { contentSha256: contentDigest(file) };
    }
    console.log('  ' + (VERIFY ? 'check ' : 'build ') + name.padEnd(22) +
      (fs.statSync(file).size / 1024).toFixed(0).padStart(6) + ' KB');
  }

  // JSON IS byte-stable — JSON.stringify with a fixed key order and a fixed
  // clock produces the same file every time — so these keep a byte hash. It
  // matters for the hostile ones: what makes them hostile is the exact bytes.
  for (const [name, obj] of Object.entries(backupFixtures())) {
    const file = path.join(OUT, name);
    if (!VERIFY) fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
    manifest.files[name] = { sha256: sha256(file), bytes: fs.statSync(file).size };
    console.log('  ' + (VERIFY ? 'check ' : 'build ') + name.padEnd(22) +
      (fs.statSync(file).size / 1024).toFixed(0).padStart(6) + ' KB');
  }

  const corrupt = path.join(OUT, 'corrupt.db');
  if (!VERIFY) writeCorrupt(corrupt);
  // The one fixture that cannot yield a content digest, because reading it is
  // the thing it exists to make fail. Its bytes ARE stable — it is written by
  // hand, not by SQLite.
  manifest.files['corrupt.db'] = { sha256: sha256(corrupt), bytes: fs.statSync(corrupt).size,
    note: 'valid header, garbage body — opens, then fails on first query' };
  console.log('  ' + (VERIFY ? 'check ' : 'build ') + 'corrupt.db'.padEnd(22) +
    (fs.statSync(corrupt).size / 1024).toFixed(0).padStart(6) + ' KB');

  const manifestPath = path.join(OUT, 'manifest.json');
  const body = JSON.stringify(manifest, null, 2);

  if (VERIFY) {
    /* Compare DIGESTS ONLY. The rest of a manifest entry is description —
       row counts and notes — which the verify pass does not recompute, so a
       whole-document comparison reports drift on a run where nothing changed.
       What must match is the digest, and which files exist. */
    const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const drift = [];
    for (const [name, cur] of Object.entries(manifest.files)) {
      const was = prev.files[name];
      if (!was) { drift.push(name + ': not in the manifest'); continue; }
      const a = cur.contentSha256 || cur.sha256;
      const b = was.contentSha256 || was.sha256;
      if (a !== b) drift.push(name + ': ' + String(b).slice(0, 12) + ' -> ' + String(a).slice(0, 12));
    }
    for (const name of Object.keys(prev.files)) {
      if (!manifest.files[name]) drift.push(name + ': in the manifest but no longer built');
    }
    if (drift.length) {
      console.error('\nFIXTURE DRIFT:\n  ' + drift.join('\n  ') + '\n');
      process.exit(1);
    }
    console.log('\n  ' + Object.keys(manifest.files).length + ' fixtures match the manifest');
  } else {
    fs.writeFileSync(manifestPath, body, 'utf8');
    console.log('\n  ' + Object.keys(manifest.files).length + ' fixtures + manifest.json in tests/fixtures/out/');
  }
}

build();
