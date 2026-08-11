/* ─── DAMAM HOSTEL — CENTRAL CONFIG ─────────────────────────────────────────
   Loaded FIRST before all other scripts.
   Contains: localStorage key, active hostel ID, default DB schema.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

// ── Active hostel (single-hostel system) ─────────────────────────────────────
const _ACTIVE_HOSTEL = sessionStorage.getItem('active_hostel') || 'hostel_1';
const LS_KEY = 'dbh2_v3_' + _ACTIVE_HOSTEL;

// ── Default DB schema — used by loadDB() on first run ────────────────────────
let DB = {
  settings: {
    appName:         'HOSTYLLO',              // ← Customisable system/app name shown in UI & reports
    hostelName:      'DAMAM Boys Hostel',
    tagline:         'Safe & Comfortable Living',
    location:        '4/1 Kakakhel Street, Danishabad Shaheen Town, Peshawar',
    phone:           '',
    email:           '',
    version:         'v3.0',
    currency:        'PKR',
    receiptCounter:  0,
    roomTypes: [
      { id: '1s', name: '1-Seater', capacity: 1, defaultRent: 16000, color: '#4a9cf0' },
      { id: '2s', name: '2-Seater', capacity: 2, defaultRent: 16000, color: '#9b6df0' },
      { id: '3s', name: '3-Seater', capacity: 3, defaultRent: 16000, color: '#2ec98a' },
      { id: '4s', name: '4-Seater', capacity: 4, defaultRent: 16000, color: '#c8a84b' },
      { id: '5s', name: '5-Seater', capacity: 5, defaultRent: 16000, color: '#f0a030' }
    ],
    paymentMethods:     ['Cash', 'JazzCash', 'EasyPaisa', 'Bank Transfer', 'Cheque'],
    expenseCategories:  ['Electricity', 'Water', 'Gas', 'Maintenance', 'Cleaning',
                         'Security', 'Internet', 'Furniture', 'Plumbing', 'Other'],
    floors:             ['Ground', '1st', '2nd', '3rd'],
    defaultWANumber:    '',
    hostelNameFont:     'DM Serif Display',
    lastBackupReminder: null   // ISO string — used by backup reminder toast
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