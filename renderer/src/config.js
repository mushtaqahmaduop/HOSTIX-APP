/* ─── HOSTYLLO — CENTRAL CONFIG ─────────────────────────────────────────
   Loaded FIRST before all other scripts.
   Contains: localStorage key, active hostel ID, default DB schema.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

// ── Active hostel (single-hostel system) ─────────────────────────────────────
const _ACTIVE_HOSTEL = sessionStorage.getItem('active_hostel') || 'hostel_1';
const LS_KEY = 'dbh2_v3_' + _ACTIVE_HOSTEL;

// The expense category a funds transfer is filed under. The standalone Funds
// Transfer feature — its own card, screens and modals — has been removed; a
// transfer is money leaving the same till as a gas bill and is recorded as an
// ordinary expense under this category. Named once so the settings list, the
// Expenses page and every report section agree. Records already in the legacy
// `DB.transfers` array are NOT migrated: they are folded into this same
// category wherever outgoings are itemised, so no history was rewritten.
const FUND_TRANSFER_CAT = 'Fund Transfer';

// ── Default DB schema — used by loadDB() on first run ────────────────────────
let DB = {
  settings: {
    appName:         'HOSTYLLO',              // ← Customisable system/app name shown in UI & reports
    hostelName:      'Hostel Name',
    tagline:         'Safe & Comfortable Living',
    location:        '',
    phone:           '',
    email:           '',
    version:         'v3.0',
    currency:        'PKR',
    receiptCounter:  0,
    // VOCABULARY (used verbatim in every label across the app):
    //   defaultRent → "Room Rent"     — the bed
    //   defaultMess → "Mess"          — the food, billed on top, only for a
    //                                   student who is on the mess
    //   rent + mess → "Monthly Charge" — what the student actually owes
    // Installs that predate the split carry the two ADDED TOGETHER in
    // defaultRent with defaultMess at 0, which is why the seed below has
    // mess at 0: splitting is opt-in from Settings → Rent & Mess and nobody's
    // totals move until the owner enters a mess amount.
    // Never resolve these by hand — call resolveCharges() in utils.js.
    roomTypes: [
      { id: '1s', name: '1-Seater', capacity: 1, defaultRent: 16000, defaultMess: 0, color: '#4a9cf0' },
      { id: '2s', name: '2-Seater', capacity: 2, defaultRent: 16000, defaultMess: 0, color: '#9b6df0' },
      { id: '3s', name: '3-Seater', capacity: 3, defaultRent: 16000, defaultMess: 0, color: '#2ec98a' },
      { id: '4s', name: '4-Seater', capacity: 4, defaultRent: 16000, defaultMess: 0, color: '#c8a84b' },
      { id: '5s', name: '5-Seater', capacity: 5, defaultRent: 16000, defaultMess: 0, color: '#f0a030' }
    ],
    paymentMethods:     ['Cash', 'JazzCash', 'EasyPaisa', 'Bank Transfer', 'Cheque'],
    expenseCategories:  ['Electricity', 'Water', 'Gas', 'Maintenance', 'Cleaning',
                         'Security', 'Internet', 'Furniture', 'Plumbing',
                         'Fund Transfer', 'Other'],
    floors:             ['Ground', '1st', '2nd', '3rd'],
    defaultWANumber:    '',
    hostelNameFont:     'DM Serif Display',
    lastBackupReminder: null,  // ISO string — used by backup reminder toast
    lastBackupExport:   null   // ISO string — when a backup was last written out
  },
  rooms:         [],
  students:      [],
  payments:      [],
  expenses:      [],
  cancellations: [],
  maintenance:   [],
  complaints:    [],
  checkinlog:    [],
  notices:       [],
  fines:         [],
  activityLog:   [],
  inspections:   [],
  billSplits:    [],
  transfers:     [],
  archive:       []   // Annual Archive — historical payment/expense records
};