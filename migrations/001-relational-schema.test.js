/* ─── HOSTYLLO — Migration 001 lossless test (pure JS, runs under plain Node) ────
   Verifies the transform layer: every record survives promotion + reconstruction
   byte-identically (lossless), and the promoted columns match the record fields
   with correct coercion. Uses realistic, production-shaped records across all
   collections plus edge cases (unicode, nested arrays, nulls, missing fields).

   Run:  node migrations/001-relational-schema.test.js
   (The SQLite DDL/INSERT path is proven separately end-to-end inside Electron;
   better-sqlite3 is built for the Electron ABI and won't load under Node.)
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const assert = require('assert');
const M = require('./001-relational-schema');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

// Production-shaped fixtures (fields taken from the actual record constructors).
const fixtures = {
  students: [
    { id: '001', name: 'Ali Khan', fatherName: 'Zahid Khan', cnic: '17301-1234567-1',
      phone: '0300-1234567', email: '', occupation: 'Student', roomId: 'room_a1', rent: 16000,
      deposit: 0, admissionFee: 0, joinDate: '2026-07-01', paymentMethod: 'Cash',
      emergencyContact: '0301-0000000', address: 'Peshawar', notes: 'note "with" quotes',
      status: 'Active', createdAt: '2026-07-01', docs: { photo: '' } },
    // unicode + forced flag + missing optional fields
    { id: '002', name: 'محمد بلال', roomId: 'room_a1', rent: 18000, status: 'Left',
      joinDate: '2026-06-15', isForced: true, docs: { photo: 'data:image/png;base64,AAAA' } },
    // missing rent (should coerce to null column but stay in data)
    { id: '003', name: 'No Rent Guy', roomId: 'room_b2', status: 'Active' },
  ],
  payments: [
    { id: 'p_1', collectedBy: 'Warden 1', studentId: '001', studentName: 'Ali Khan',
      roomId: 'room_a1', roomNumber: '101', amount: 10000, monthlyRent: 16000, unpaid: 6000,
      admissionFee: 0, extraCharges: [{ label: 'Fan', amount: 500 }], extraTotal: 500,
      concession: 0, concessionDesc: '', discount: 0, totalRent: 16000, method: 'Cash',
      month: 'July 2026', date: '2026-07-05', dueDate: '', status: 'Pending', notes: '', paidDate: '' },
    { id: 'p_2', studentId: '001', roomId: 'room_a1', amount: 20000, unpaid: 0,
      month: 'August 2026', date: '2026-08-01', status: 'Paid', extraCharges: [] },
  ],
  rooms: [
    { id: 'room_a1', number: '101', floor: 'Ground', typeId: '1s', rent: 16000,
      studentIds: ['001', '002'], amenities: ['Fan', 'Attached Bath'], notes: '' },
    { id: 'room_b2', number: '202', floor: '2nd', typeId: '3s', rent: 16000,
      studentIds: [], amenities: [], notes: 'corner room' },
  ],
  expenses: [
    { id: 'e_1', category: 'Electricity', amount: 12500, date: '2026-07-03', description: 'WAPDA bill' },
    { id: 'e_2', category: 'Water', amount: 0, date: '2026-07-04', description: '' },
  ],
  fines: [{ id: 'f_1', studentId: '001', amount: 500, reason: 'Late', date: '2026-07-10' }],
  cancellations: [{ id: 'c_1', studentId: '002', date: '2026-06-20', refund: 5000, reason: 'Left city' }],
  transfers: [{ id: 't_1', amount: 30000, date: '2026-07-02', from: 'Cash', to: 'Bank' }],
  activitylog: [{ id: 'al_1', action: 'Student Added', details: 'Ali', category: 'Student', by: 'Warden 1', date: '2026-07-01' }],
  maintenance: [{ id: 'm_1', title: 'Leaky tap', status: 'Open', date: '2026-07-08' }],
  complaints: [{ id: 'cm_1', text: 'Wifi down', status: 'Open', date: '2026-07-09' }],
  checkinlog: [{ id: 'ci_1', studentId: '001', ts: '2026-07-01T20:00:00Z' }],
  notices: [{ id: 'n_1', title: 'Holiday', body: 'Closed Friday', date: '2026-07-11' }],
  inspections: [{ id: 'in_1', roomId: 'room_a1', score: 9, date: '2026-07-12' }],
  billsplits: [{ id: 'bs_1', total: 6000, shares: { '001': 3000, '002': 3000 }, month: 'July 2026' }],
  archive: [{ id: 'arch_1', kind: 'payment', amount: 9999, date: '2025-01-01' }],
};

// 1. LOSSLESS round-trip: reconstruct(promote(rec)) deep-equals rec, for every table.
ok('lossless round-trip across all collections', () => {
  for (const [table, records] of Object.entries(fixtures)) {
    for (const rec of records) {
      const row = M.promoteRecord(table, rec);
      const back = M.reconstructRecord(row);
      assert.deepStrictEqual(back, rec, `${table} id=${rec.id} changed through migration`);
    }
  }
});

// 2. Promoted columns match the record fields with correct coercion.
ok('promoted columns match record fields', () => {
  const s = fixtures.students[0];
  const row = M.promoteRecord('students', s);
  assert.strictEqual(row.name, 'Ali Khan');
  assert.strictEqual(row.roomId, 'room_a1');
  assert.strictEqual(row.status, 'Active');
  assert.strictEqual(row.rent, 16000);
  assert.strictEqual(typeof row.rent, 'number');
  const p = fixtures.payments[0];
  const prow = M.promoteRecord('payments', p);
  assert.strictEqual(prow.studentId, '001');
  assert.strictEqual(prow.amount, 10000);
  assert.strictEqual(prow.unpaid, 6000);
  assert.strictEqual(prow.month, 'July 2026');
});

// 3. Missing / null fields coerce to null column (but remain intact in data).
ok('missing fields → null column, still preserved in data blob', () => {
  const row = M.promoteRecord('students', fixtures.students[2]); // no rent, no joinDate
  assert.strictEqual(row.rent, null);
  assert.strictEqual(row.joinDate, null);
  const back = M.reconstructRecord(row);
  assert.ok(!('rent' in back), 'rent should not be invented on the record');
  assert.strictEqual(back.name, 'No Rent Guy');
});

// 4. REAL coercion rejects non-numeric, keeps 0.
ok('REAL coercion: 0 kept, garbage → null', () => {
  assert.strictEqual(M.coerce('REAL', 0), 0);
  assert.strictEqual(M.coerce('REAL', '16000'), 16000);
  assert.strictEqual(M.coerce('REAL', 'abc'), null);
  assert.strictEqual(M.coerce('REAL', undefined), null);
  assert.strictEqual(M.coerce('TEXT', 0), '0');
  assert.strictEqual(M.coerce('TEXT', null), null);
});

// 5. Blob-only tables promote to just {id, data} (no extra columns invented).
ok('blob-only tables keep only id + data', () => {
  const row = M.promoteRecord('maintenance', fixtures.maintenance[0]);
  assert.deepStrictEqual(Object.keys(row).sort(), ['data', 'id']);
});

// 6. DDL sanity: promoted tables carry their columns + indexes; blob tables don't.
ok('DDL contains promoted columns and indexes', () => {
  const ddl = M.buildDDL().join('\n');
  assert.ok(/CREATE TABLE students \([^)]*roomId TEXT/s.test(ddl), 'students.roomId column missing');
  assert.ok(ddl.includes('CREATE INDEX idx_students_status ON students (status)'), 'students status index missing');
  assert.ok(ddl.includes('CREATE INDEX idx_payments_studentId ON payments (studentId)'), 'payments studentId index missing');
  assert.ok(/CREATE TABLE maintenance \(\s*id TEXT PRIMARY KEY,\s*data TEXT NOT NULL\s*\);/s.test(ddl), 'maintenance should be id+data only');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
