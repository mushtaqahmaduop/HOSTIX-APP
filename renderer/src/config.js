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

/* ── WHAT THIS HOSTEL SELLS ──────────────────────────────────────────────────

   Three kinds of hostel turned up in the field and the app only ever modelled
   one of them:

     rent                 a bed, and no food. Every mess control in the app is
                          noise, and an "On Mess: 0" strip reads as a product
                          built for somebody else.
     rent_mess_optional   food is offered and the student chooses. This is what
                          the app has always done, per student, via messOptIn.
     rent_mess_bundled    food is not optional. Everyone pays one combined
                          charge, so a per-student toggle is not a feature here
                          -- it is a way for a warden to quietly under-bill
                          somebody, with no rule saying they should not.

   THE DEFAULT IS rent_mess_optional AND MUST STAY THAT WAY. It is exactly what
   every install already does, so no hostel in the field changes behaviour when
   this setting appears underneath it. A missing value reads as optional too --
   see serviceModel() in utils.js, which is the ONLY function allowed to answer
   this question.

   Nothing here deletes a mess amount. Switching a hostel to `rent` stops mess
   being billed or shown; the configured figure stays in roomTypes so switching
   back restores what it was.                                                  */
const SERVICE_MODELS = [
  { id: 'rent', label: 'Rent only',
    short: 'Rooms only',
    hint:  'You rent beds. No food is served.' },
  { id: 'rent_mess_optional', label: 'Rent + mess, student chooses',
    short: 'Mess optional',
    hint:  'Food is offered. Each student is put on or off the mess individually.' },
  { id: 'rent_mess_bundled', label: 'Rent + mess together',
    short: 'Mess included',
    hint:  'Every student pays one combined charge. Nobody can be taken off the mess.' },
];
const SERVICE_MODEL_DEFAULT = 'rent_mess_optional';

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
    // Which of SERVICE_MODELS this hostel runs. Read it through
    // serviceModel() -- never DB.settings.serviceModel directly.
    serviceModel:    SERVICE_MODEL_DEFAULT,
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
    lastBackupExport:   null,  // ISO string — when a backup was last written out
    // First-run setup. `setupCompletedAt` is only ever written by the wizard
    // finishing; an install in the field has neither field and is recognised
    // as already-set-up by its DATA, not by these. See needsSetup().
    setupCompletedAt:   null,
    setupStep:          null
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