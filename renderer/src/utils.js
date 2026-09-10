/* ─── HOSTYLLO — UTILITY FUNCTIONS ──────────────────────────────────────
   Loaded after config.js. No dependencies on auth or storage.
   Contains: formatting helpers, DOM utilities, course autocomplete.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const crypto = typeof require !== 'undefined' ? require('crypto') : null;

// ── Electron external link helper ─────────────────────────────────────────────
function openExternalLink(url) {
  try {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      var a = document.createElement('a');
      a.href = url;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); }, 500);
    }
  } catch (e) {
    console.error('openExternalLink error:', e);
  }
}

// ── ID & date helpers ─────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function nextStudentId() {
  var maxNum = 0;
  DB.students.forEach(function (s) {
    var n = parseInt(String(s.id), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  return String(maxNum + 1).padStart(3, '0');
}

// A student code is a plain number, zero-padded to at least three digits —
// '001', '042', '1204'. That is what is printed on the ID card.
function _isStudentCode(sid) {
  var n = parseInt(String(sid), 10);
  return !isNaN(n) && String(sid) === String(n).padStart(3, '0');
}

/* ── STUDENT CODES ───────────────────────────────────────────────────────────
   Runs at boot to give every student a numeric code. Two things were wrong with
   how it did that, and both only bite on a real hostel's data:

   1. It renumbered EVERYONE by array position the moment a single id looked
      wrong — and one is enough, so an Excel import, a restored backup or one
      legacy record re-issued all 120 students' codes in list order. The number
      on a student's ID card, on their receipts and in the warden's head became
      someone else's. Valid codes are now left exactly as they are; only ids
      that are not codes, or that collide with one already taken, are assigned —
      and they get the next free number rather than a position.

   2. It rewrote the studentId on payments, cancellations, room shifts, check-in
      and fines, but not on DB.archive or DB.complaints. The archive is where
      every payment older than seven months lives, so a renumbering pointed the
      whole of last year's money at whoever now holds that code. The list below
      is every table that stores a studentId.                                 */
function migrateStudentIdsToNumeric() {
  var students = DB.students || [];
  var taken = {}, idMap = {}, maxNum = 0;
  var keeps = [];                       // the students that keep the id they have

  // Pass 1 — claim every code that is already valid, first student to hold it
  // wins. A second student on the same code is a duplicate, not an owner, and
  // falls through to pass 2.
  students.forEach(function (s) {
    var sid = String(s.id);
    if (_isStudentCode(sid) && !taken[sid]) {
      taken[sid] = true;
      keeps.push(s);
      var n = parseInt(sid, 10);
      if (n > maxNum) maxNum = n;
    }
  });

  // Pass 2 — everyone else takes the next free number, in roster order.
  students.forEach(function (s) {
    if (keeps.indexOf(s) !== -1) return;
    var sid = String(s.id);
    var next;
    do { next = String(++maxNum).padStart(3, '0'); } while (taken[next]);
    taken[next] = true;
    if (!(sid in idMap)) idMap[sid] = next;   // first claimant of an ambiguous old id
    s.id = next;
  });

  if (!Object.keys(idMap).length) return;

  // Every table that stores a studentId. DB.archive holds the payments that
  // retention moved out of DB.payments — miss it and the older half of the
  // ledger is re-pointed at the wrong people.
  ['payments', 'cancellations', 'roomShifts', 'checkinlog', 'fines',
   'archive', 'complaints', 'issues', 'billSplits'].forEach(function (col) {
    (DB[col] || []).forEach(function (r) {
      if (r && r.studentId && idMap[r.studentId]) r.studentId = idMap[r.studentId];
    });
  });

  (DB.rooms || []).forEach(function (room) {
    if (Array.isArray(room.studentIds)) {
      room.studentIds = room.studentIds.map(function (sid) { return idMap[sid] || sid; });
    }
  });

  return saveDB();
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function toggleClearBtn(inputId, btnId) {
  const inp = /** @type {HTMLInputElement} */ (document.getElementById(inputId));
  const btn = document.getElementById(btnId);
  if (!inp || !btn) return;
  btn.classList.toggle('visible', inp.value.length > 0);
}

// Safe window.open() wrapper — handles popup blocker gracefully
function safeOpenWindow(width, height) {
  width  = width  || 1000;
  height = height || 720;
  var w = window.open('', '_blank', 'width=' + width + ',height=' + height + ',scrollbars=yes,resizable=yes');
  if (!w) {
    if (typeof toast === 'function')
      toast('⚠️ Popup blocked — allow popups for this page and try again.', 'error');
    return null;
  }
  return w;
}

// ── Date & money formatters ───────────────────────────────────────────────────
/* ── CALENDAR DATES ARE LOCAL, NEVER UTC ─────────────────────────────────────
   toISOString() converts to UTC first. Pakistan is UTC+5, so from 7pm every
   evening the "date" it produced was YESTERDAY — and rent is collected in the
   evening. Receipts, payment dates, leaving dates and the activity log were all
   stamped a day early for the last five hours of every day; a due date built as
   "the 6th" came out as the 5th, and on the 1st of a month before 5am the
   month selectors still read the month that had just ended.

   ymd() reads the calendar the warden is looking at: the local one.          */
function ymd(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}
function ym(d) { return ymd(d).slice(0, 7); }
function today() { return ymd(new Date()); }

/* ── WHO IS STILL LIVING HERE ────────────────────────────────────────────────
   A student put on the cancellation list gets status 'Cancelling' and keeps it
   until they actually leave at the end of the month. Nothing read that status,
   so for three or four weeks they fell through every Active-only filter at
   once: Generate Monthly Rents skipped their last month, the Add Payment search
   could not find them to take it, and their bed read as free while they were
   still sleeping in it.

   'Cancelling' is a leaving date, not a departure. They are resident until it
   arrives, and every screen that asks "is this student still with us" asks
   here.                                                                      */
const RESIDENT_STATUSES = ['Active', 'Cancelling'];
function isResident(t) { return !!t && RESIDENT_STATUSES.indexOf(t.status) !== -1; }
/* Rs., NOT PKR, EVERYWHERE (owner, 2026-09-10: "remove PKR from everywhere and
   use Rs."). The name stays — it is called from several hundred places and a
   rename would be a diff nobody could read — but the string it produces is the
   one the hostels themselves write. `PKR` is the ISO code a bank uses; `Rs.` is
   what goes on a receipt in Peshawar. */
function fmtPKR(n) { return 'Rs. ' + Number(n || 0).toLocaleString('en-PK'); }
function fmtNum(n) { return Number(n || 0).toLocaleString('en-PK'); } // number only — pair with <span class="pkr">Rs.</span>

/* ── BIG NUMBERS, SHORT ENOUGH TO FIT ────────────────────────────────────────
   A KPI tile is about 190px wide with six across, which holds roughly
   "PKR 9,999,999" and no more. A hostel billing in whole rupees reaches eight
   and nine digits easily — a year of a 150-bed house is tens of millions — and
   past that the tile simply clipped: "PKR 1,000,000,17" with the rest of the
   number, and any sense of its size, cut off at the card edge. A figure you
   cannot read the end of is worse than a rounded one.

   So: exact up to 9,999,999, abbreviated above it. The threshold is where the
   tile actually runs out, not a round-looking number — under it nothing
   changes, which is why ordinary hostels see no difference at all.

   Two decimals, because one is not enough at this scale: 1.2B and 1.24B are
   forty million rupees apart.

   THE EXACT FIGURE IS NEVER LOST. Every caller pairs this with a title
   attribute carrying the full number (moneyValue does it automatically), so
   the rounding is a display choice a hover undoes, not a discarded fact. */
function fmtCompact(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs < 1e7) return fmtNum(v);                 // exact while it still fits
  const sign = v < 0 ? '-' : '';
  /* Divisor and suffix as separate values rather than a [suffix, divisor]
     tuple: a mixed array types as (string|number)[], so the division fails
     `npm run typecheck` — utils.js is one of the four files in its scope. */
  const div = abs >= 1e12 ? 1e12 : abs >= 1e9 ? 1e9 : 1e6;
  const suffix = abs >= 1e12 ? 'T' : abs >= 1e9 ? 'B' : 'M';
  /* Trailing zeros trimmed: "5B" reads better than "5.00B", and the two mean
     the same thing. Only the zeros go — 5.20B keeps its 2. */
  const num = (abs / div).toFixed(2).replace(/\.?0+$/, '');
  return sign + num + suffix;
}

/* ── COMPACT MONEY, FROM THE THOUSAND UP ─────────────────────────────────────
   fmtCompact() above stays exact below ten million on purpose: a KPI card that
   rounds PKR 476,700 to "PKR 477K" has thrown away the figure a warden is
   about to reconcile against a cash drawer.

   The dashboard's lower widgets are the other case. The Pending list and the
   Collection donut are SCANNED, not reconciled — the lower-section spec §14
   asks for "PKR 10K / PKR 476.5K / PKR 1.24M" there, and the exact number is
   one click away on Payments. So this is a second formatter rather than a
   change to the first: same rules, different threshold, and each caller picks
   the one that matches what its number is for.

   One decimal, trimmed: "PKR 10K" not "PKR 10.0K", "PKR 476.5K" kept. Below a
   thousand there is nothing to compact and the exact figure is shorter anyway. */
function fmtCompactK(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs < 1000) return fmtNum(v);
  const sign = v < 0 ? '-' : '';
  const div = abs >= 1e12 ? 1e12 : abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : 1e3;
  const suffix = abs >= 1e12 ? 'T' : abs >= 1e9 ? 'B' : abs >= 1e6 ? 'M' : 'K';
  /* ONE DECIMAL AT THOUSANDS, TWO ABOVE. 476.5K needs one to stay useful;
     1.24M needs two, because 1.2M and 1.29M are ninety thousand rupees apart
     and the spec's own example (§6) is "PKR 1.24M". Trailing zeros go either
     way: "10K", not "10.0K". */
  const num = (abs / div).toFixed(div === 1e3 ? 1 : 2).replace(/\.?0+$/, '');
  return sign + num + suffix;
}
/** The same, with the currency word — the lower widgets print it everywhere. */
function fmtPKRk(n) { return 'Rs. ' + fmtCompactK(n); }

/* THE CURRENCY WORD, FROM ONE PLACE (owner, 2026-09-10: "use Rs. instead of
   PKR globally").

   Nine screens read `DB.settings.currency` with their own `|| 'PKR'` fallback,
   so changing the default in config.js moved none of them — and every install
   that already exists has the string 'PKR' stored, which no default can reach.
   This maps that stored value rather than migrating the database: 'PKR' and an
   unset value both read as 'Rs.', and a hostel that has genuinely chosen USD
   or AED keeps it. Nothing has to be written to fix an old install. */
function currencyWord() {
  const c = String((typeof DB !== 'undefined' && DB.settings && DB.settings.currency) || '').trim();
  return (!c || c === 'PKR') ? 'Rs.' : c;
}

/* ── PAYMENT-METHOD COLOUR — THE ONLY PLACE THAT ANSWERS "WHAT COLOUR IS CASH" ─
   Lifted out of renderDashboard(), where it lived as a local, because Reports
   drew the same six wallets from a DIFFERENT ramp and picked BY INDEX rather
   than by name (`_RPT_METHOD_HUES[i % len]`). So Cash was #2563EB on the
   dashboard donut and whatever happened to sit at index 0 on the Reports one,
   and the two screens described the same month in two colour schemes. Worse,
   the Reports allocation moved every time a method was added or reordered in
   Settings, so a wallet could change colour between two visits to the same
   report.

   Same shape of rule as finance.js: one authority, every screen a reader.

   THE HUES. These are the design system's chart tokens (§17.2) plus two
   neighbours, and deliberately NOT the status colours — a payment method is a
   category, not a state, and green here would read as "good". Cash takes the
   strong blue (owner, 7 Sep): it is the method most of the money arrives by in
   this hostel, and the heaviest slice has to carry the heaviest colour or the
   ring reads upside down. */
const METHOD_HUES = {
  'cash':          '#2563EB',
  'easypaisa':     '#93C5FD',
  'jazzcash':      '#16A34A',
  'bank transfer': '#D97706',
  'bank':          '#D97706',
  'cheque':        '#7C3AED',
  'other':         '#94A3B8',
};

/* SPARE HUES FOR METHODS THE OWNER ADDS IN SETTINGS. Every one is far from all
   six named hues above — no second blue, and NO SECOND GREEN, which was the
   bug: 'Crypto' is owner-added, fell to a hashed pick, and drew #65A30D, a lime
   a few degrees off JazzCash's #16A34A. Two wallets in one green is not a
   chart (owner, 7 Sep). */
const METHOD_SPARE = ['#DB2777', '#0891B2', '#EA580C', '#4F46E5', '#0F766E',
                      '#A21CAF', '#B45309', '#334155'];

/* Allocated BY POSITION among the unnamed methods, not by hashing the name. A
   hash can collide however long the spare list is, and the failure is invisible
   until two particular wallets happen to be configured together; walking the
   list cannot collide at all. Order comes from Settings, so a method keeps its
   colour from month to month — only adding or removing one ABOVE it can move
   it, which is the same guarantee the dashboard always gave.

   Recomputed per call rather than cached: Settings can add a method at any
   time, and this runs a handful of times per paint. */
function methodHue(name) {
  const k = String(name || '').trim().toLowerCase();
  if (METHOD_HUES[k]) return METHOD_HUES[k];
  const spare = new Map();
  ((typeof DB !== 'undefined' && DB.settings && DB.settings.paymentMethods) || [])
    .forEach(m => {
      const j = String(m || '').trim().toLowerCase();
      if (!j || METHOD_HUES[j] || spare.has(j)) return;
      spare.set(j, METHOD_SPARE[spare.size % METHOD_SPARE.length]);
    });
  return spare.get(k) || '#94A3B8';
}

/* ── CHARGES RESOLVER — the ONLY place that answers "what is owed per month" ──
   Settings is the writer of price; every screen that shows or bills a monthly
   charge is a reader, and reads it through here.

   The vocabulary, used verbatim in every label from here on:
     Room Rent  — the bed
     Mess       — the food, billed on top, and only for a student on the mess
     Monthly Charge — rent + mess. What the student actually owes.

   SETTINGS IS THE SOURCE, NOT THE FALLBACK.

   The price a student is charged comes from Settings → Rent & Mess, via the
   room type of the room they occupy. student.rent and room.rent are stored
   copies kept for history and display — they are NOT consulted for the live
   charge, because a stale copy is exactly how the same room came to bill two
   different amounts (a room left on the old all-in figure billed the mess
   twice on every new admission).

   Resolution order:
     rent  =  student override (only when the warden explicitly pinned it)
              →  roomType.defaultRent   ← Settings, the normal path
              →  room.rent              ← legacy last resort, type unpriced
     mess  =  student override (same pin)  →  roomType.defaultMess

   A student is "pinned" only by _rentManuallySet, which Settings → Rent & Mess
   → Individual Override → Save sets deliberately. Reset clears it and the
   student follows the hostel default again. Nothing else creates a pin, so a
   number that merely got copied onto the student record long ago no longer
   outranks what the warden has configured.

   messOptIn is NOT a price and is always the student's own: a pinned or
   unpinned student who is off the mess is never billed for food.

   `configured` is false when nothing has a rent set. Callers must show
   "not configured — set it in Settings" rather than inventing a number: a real
   amount on a screen must always trace back to something the warden typed. */
/* -- THE SERVICE MODEL: ONE READER -------------------------------------------

   Every screen that wants to know whether this hostel serves food asks these,
   never DB.settings.serviceModel. An install that predates the setting has no
   value at all, and an unknown value could arrive from a restored backup
   written by a newer build; both must read as the OLD behaviour rather than
   silently switching a paying hostel to a different billing model.

   The rule the rest of the app follows: mess is a SETTING OF THE HOSTEL first
   and a property of the student second. resolveCharges() applies the hostel
   answer over the student one, so no screen can bill food at a hostel that
   does not serve it, whatever is stored on the student record.               */
function serviceModel() {
  const v = DB && DB.settings && DB.settings.serviceModel;
  return SERVICE_MODELS.some(m => m.id === v) ? v : SERVICE_MODEL_DEFAULT;
}

/** Does this hostel serve food at all? */
function hostelServesMess() { return serviceModel() !== 'rent'; }

/** Can an individual student be taken off the mess? */
function messIsOptional() { return serviceModel() === 'rent_mess_optional'; }

/** The chosen model's descriptor, for labels. */
function serviceModelInfo() {
  const id = serviceModel();
  return SERVICE_MODELS.find(m => m.id === id) || SERVICE_MODELS[1];
}

function resolveCharges(student, opts) {
  opts = opts || {};
  const s     = student || {};
  const room  = s.roomId ? (DB.rooms || []).find(r => r.id === s.roomId) : null;
  const rtype = room && room.typeId
    ? (DB.settings.roomTypes || []).find(x => x.id === room.typeId) : null;

  // An explicit, deliberate per-student price beats the hostel default.
  const pinned = s._rentManuallySet === true;

  const rentFrom =
    pinned && Number(s.rent) > 0  ? { v: Number(s.rent),            src: 'override' } :
    Number(rtype && rtype.defaultRent) > 0
                                  ? { v: Number(rtype.defaultRent), src: 'settings' } :
    Number(room && room.rent) > 0 ? { v: Number(room.rent),         src: 'room'     } :
                                    { v: 0,                         src: 'none'     };

  // 0 is a legitimate mess charge (a hostel that serves no food, or a student
  // taken off it), so mess falls through on null/undefined — never on 0.
  const messFrom =
    pinned && s.mess != null       ? { v: Number(s.mess) || 0,            src: 'override' } :
    rtype && rtype.defaultMess != null
                                   ? { v: Number(rtype.defaultMess) || 0, src: 'settings' } :
    s.mess != null                 ? { v: Number(s.mess) || 0,            src: 'student'  } :
                                     { v: 0,                              src: 'none'     };

  /* THE HOSTEL'S ANSWER OVERRIDES THE STUDENT'S.

     A rent-only hostel bills no food and shows none, whatever messOptIn says
     on a record written before the setting existed. A bundled hostel bills it
     for everyone, so a stale messOptIn:false cannot quietly under-bill anyone.
     Only an "optional" hostel lets the student record decide.

     `mess` is reported as 0 at a rent-only hostel on purpose: every screen
     prints this value, and a food charge must not appear at a hostel that
     serves no food. The configured amount is untouched in roomTypes, so
     switching the model back restores it. */
  const hostelMess = hostelServesMess();
  const messOptIn =
    !hostelMess       ? false :
    !messIsOptional() ? true  :
                        s.messOptIn !== false;
  const messAmount = hostelMess ? messFrom.v : 0;
  const messBilled = messOptIn ? messAmount : 0;

  return {
    rent:       rentFrom.v,
    mess:       messAmount,      // the configured amount, billed or not
    messBilled,                  // what actually goes into the total
    messOptIn,
    hostelMess,                  // does this hostel serve food at all
    messOptional: hostelMess && messIsOptional(),  // may a student opt out
    total:      rentFrom.v + messBilled,   // the Monthly Charge
    rentSource: rentFrom.src,
    messSource: messFrom.src,
    pinned,
    configured: rentFrom.src !== 'none',
    room, roomType: rtype
  };
}

/* ── WHAT IS STILL OWED ON A PAYMENT ──────────────────────────────────────────
   `amount` is money COLLECTED; `unpaid` is money still owed. Records written
   before `unpaid` existed carry only the first, and every screen invented its
   own answer for the second — 29 sites fell back to `p.amount`, 26 fell back
   to 0, and reports.js did both, so its Pending card and its own transaction
   table disagreed about the same record. A warden chasing arrears from the
   Payments screen therefore collected a different set than one chasing them
   from Reports, and neither figure was labelled as an estimate.

   Neither fallback was right. "Owes exactly what they already paid" is only
   correct when nothing was paid, and "owes nothing" quietly drops real debtors
   off every arrears list.

   The answer comes from the charge authority instead, which is what §14 means
   by reports reconciling against the same financial layer: resolveCharges()
   knows what this student is billed today, and what is owed is that, less what
   came in. This is not a new rule — the Edit Payment form has computed it this
   way all along (payments.js). It was simply never shared, so every other
   screen guessed.

   The payment's own recorded rent/mess are the fallback for a student who has
   since been deleted: the record still has to print a number on a receipt.

   ORDER MATTERS HERE. A recorded `unpaid` is answered first and always, even
   on a record marked Paid. Those two can disagree: every automatic settlement
   writes `unpaid = 0` with the status, but the Edit Payment form takes the
   status from a free dropdown while the balance beside it is readonly, so a
   warden can mark a part-paid record Paid and save a balance with it. That
   balance is money someone is owed. Deriving over it, or zeroing it because
   the status says so, loses it silently.

   The 'Paid' short-circuit therefore guards only the DERIVATION, which is
   where it is actually needed: several call sites sum over lists that were
   never filtered to Pending, and without it a legacy Paid record would
   contribute its whole charge to Outstanding.

   Everything derived is floored at 0 — a record whose collections already
   cover the charge is settled, not in credit. */
function outstandingOf(p) {
  if (!p) return 0;
  if (p.unpaid != null) return Number(p.unpaid) || 0;
  if (p.status === 'Paid') return 0;

  const t = (typeof DB !== 'undefined' && DB.students || []).find(s => s.id === p.studentId);
  const c = t ? resolveCharges(t) : null;
  const rent = (c && c.rent) || Number(p.monthlyRent || p.totalRent || 0);

  /* Mess obeys resolveCharges' own rule: THE HOSTEL'S ANSWER OVERRIDES THE
     RECORD'S. A rent-only hostel bills no food and a bundled one bills it for
     everyone, whatever `messIncluded` a record written under an older setting
     happens to carry — otherwise a hostel that switched to bundled would
     under-state its arrears on every record from before the switch. Only an
     optional hostel lets the record decide, which is the one case where that
     flag is a billing fact rather than a stale preference.

     With no student left to price against, the record is all there is. */
  const mess = c
    ? (c.messOptional && p.messIncluded != null
        ? (p.messIncluded !== false ? c.mess : 0)
        : c.messBilled)
    : (p.messIncluded !== false ? Number(p.messCharge || 0) : 0);

  /* Extra charges are part of the bill. Every place that WRITES a balance
     computes it as monthlyRent + mess + extraTotal + admissionFee − concession
     (payments.js:1816, :2552, :2732), so a derivation that drops extraTotal
     reports less than the record owes. That omission is a real, recorded
     defect — the Phase 0 fixture `m_legacy_no_unpaid` exists to catch it, and
     `payments.js:2640` had it before this helper replaced that expression.

     The recorded total wins; the line items are the fallback for a record that
     carries them without it. */
  const extras = p.extraTotal != null
    ? Number(p.extraTotal) || 0
    : (Array.isArray(p.extraCharges)
        ? p.extraCharges.reduce((s, c) => s + (Number(c && c.amount) || 0), 0)
        : 0);

  return Math.max(0, rent + mess + extras
                   + Number(p.admissionFee || p.fee || 0)
                   - Number(p.concession   || p.discount || 0)
                   - Number(p.amount       || 0));
}

/* ── THE DEFAULT STUDENT AVATAR ───────────────────────────────────────────────
   Every screen that shows a student drew its own fallback when there is no
   photo, and they had drifted: the students table used one initial, the
   dashboard used two, the profile modal used something else again — so the same
   student was "H", "HU" and "Habibullah" depending on which screen you were on.

   The owner asked for one default across the app, supplied as a picture. It is
   drawn here as a VECTOR glyph rather than embedding that file, for three
   reasons worth writing down because they will come up again:

     · The supplied PNG has the words "Student Photo" printed inside it. It is
       a screenshot of a form field, not an asset, and every avatar in the app
       would carry that caption.
     · It is 81x92 raster. The avatar renders at 26-30px in tables and 96px on
       the printed profile; one bitmap cannot serve both without blurring at one
       end or bloating at the other.
     · A glyph takes the theme with it. A baked PNG has one background colour
       forever, and this app has a light mode.

   Swap in a real image here the moment there is a clean one — every caller goes
   through this function, which is the whole point of it existing.

   `size` is the pixel box. The glyph scales with it; nothing else has to.     */
function studentAvatar(student, size, extraClass) {
  const s   = student || {};
  const px  = Number(size) || 30;
  const cls = 'stu-av' + (extraClass ? ' ' + extraClass : '');
  const box = `width:${px}px;height:${px}px`;

  // A real photograph always wins. It is the thing the fallback stands in for.
  const photo = s.docs && s.docs.photo;
  if (photo) {
    return `<span class="${cls}" style="${box}"><img src="${escHtml(photo)}" alt="" ` +
           `style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></span>`;
  }
  /* INITIALS, not a glyph. Every student without a photo drew the identical
     mortarboard, so a roster of forty read as forty copies of one icon and the
     avatar column carried no information at all. Initials distinguish rows at
     a glance and are what the reference design uses.

     Falls back to the glyph only when the name yields no letter — a record
     named "—" or "123" would otherwise show an empty tile. */
  const initials = String(s.name || '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map(w => w[0]).join('').toUpperCase();

  if (initials) {
    return `<span class="${cls} is-initials" style="${box};font-size:${Math.round(px * 0.37)}px" ` +
           `aria-label="${escHtml(s.name || '')}">${escHtml(initials)}</span>`;
  }
  const g = Math.round(px * 0.58);
  return `<span class="${cls} is-empty" style="${box}" aria-label="No photo">` +
         `<svg viewBox="0 0 24 24" width="${g}" height="${g}" fill="none" stroke="currentColor" ` +
         `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
         `<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>` +
         `<path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg></span>`;
}

/* ── WHAT A PAYMENT RECORD SAYS THE MONTH COST ────────────────────────────────
   resolveCharges() above answers "what does this student owe per month",
   from settings. This answers "what did THIS RECORD bill" — from the record's
   own fields, because a record is a historical fact and settings have moved
   since it was written.

   THE BUG THIS EXISTS TO CLOSE. A record stores the two halves separately:
   `monthlyRent` is the rent ALONE, and `messCharge` + `messIncluded` sit beside
   it (see repairPaymentComposition in payments.js, which spent a whole boot
   pass getting that split right). Every screen that quoted a monthly figure
   then quoted `monthlyRent` on its own — `p.monthlyRent || p.totalRent ||
   t.rent`, copied into five files.

   So a student on 8,000 rent and 6,500 mess, with the mess ticked in Settings
   AND on the form, read:

       Room Rent   PKR 8,000
       Paid        PKR 14,500

   and the 6,500 that explains the difference appeared nowhere on the screen.
   Nothing was mis-billed — `amount` and `unpaid` were always right — but every
   screen described the month wrongly, which is indistinguishable from a
   collection error to the person reading it.

   One reader now, so a screen cannot quote half a charge by accident. It falls
   back to the student's current charges only when the record predates the
   split and carries nothing of its own.                                     */
function paymentCharges(p, student) {
  const num = v => Number(v || 0);
  const rec = p || {};

  const rent = num(rec.monthlyRent) || num(rec.totalRent) ||
               (student ? num(resolveCharges(student).rent) : 0);

  // `messIncluded` is a tri-state in the data: true, false, or absent on
  // records written before the flag existed. Absent-with-an-amount means the
  // mess WAS billed — that is what those records meant — so only an explicit
  // false turns it off. Same convention as repairPaymentComposition().
  const mess        = num(rec.messCharge);
  const messIncluded = mess > 0 && rec.messIncluded !== false;

  return {
    rent,
    mess,
    messIncluded,
    /** The monthly charge — the figure a warden means by "how much per month". */
    monthly: rent + (messIncluded ? mess : 0),
    /** True when this record has a mess line at all, billed or not. */
    hasMess: mess > 0,
  };
}

/* The badge a row shows for what a month covers. Four states, and they are
   genuinely four: a hostel that serves no food never sets a mess charge, which
   is not the same fact as a student who has been taken off it. */
function chargeCoverage(c) {
  if (c.rent > 0 && c.messIncluded) return { key: 'both',     label: 'Rent + Mess', hue: 'dh-green' };
  if (c.rent > 0 && c.hasMess)      return { key: 'rent',     label: 'Rent only',   hue: 'dh-amber' };
  if (c.rent > 0)                   return { key: 'rentonly', label: 'Rent',        hue: 'dh-slate' };
  if (c.messIncluded)               return { key: 'mess',     label: 'Mess only',   hue: 'dh-blue'  };
  return { key: 'none', label: 'Not set', hue: 'dh-slate' };
}

/* One-line summary for the info strips.

   IT USED TO SPELL OUT THE ARITHMETIC — "PKR 16,000 rent + PKR 2,000 mess" —
   next to the total those two numbers add up to (owner, 2026-09-09: "remove
   the +10000 rent +7000 mess included from everywhere and just label there
   Rent+mess or Rent or Mess"). The reader of this line is the same person who
   set both figures in Settings; what they cannot see from the total alone is
   WHICH plan it covers, and that is the one thing this now says. The split
   itself is still on the student's own profile and in Rent & Mess.

   chargeCoverage() already names the four cases, so the phrasing comes from
   there rather than being written a second time here. */
function chargesBreakdown(c) {
  if (!c.configured) return 'No rent configured — set it in Settings → Rent &amp; Mess';
  let out = chargeCoverage({ rent: c.rent, mess: c.mess,
                             messIncluded: c.messOptIn && c.mess > 0,
                             hasMess: c.mess > 0 }).label;
  // Say where the price came from — the whole bug was not being able to tell.
  out += c.rentSource === 'override' ? ' · custom rate for this student'
       : c.rentSource === 'room'     ? ' · from room (type has no rent set)'
       : ' · hostel default';
  return out;
}

// ── MONEYVALUE — single reusable renderer for ALL currency display ───────────
// Currency code renders small & muted, the amount renders large & bold.
// Never produces a duplicated "PKR PKR" prefix — always use this instead of
// hand-rolling fmtPKR()/fmtNum() + a literal "PKR" string in markup.
// size: 'display' (KPI cards, 32-40px) | 'section' (22px) | 'body' (14-16px) | 'label' (11-13px)
function moneyValue(amount, opts) {
  opts = opts || {};
  const size = opts.size || 'body';
  const currency = opts.currency || 'Rs.';   // owner, 2026-09-10 — see fmtPKR
  const color = opts.color ? `style="color:${opts.color}"` : '';
  const cls = opts.className ? ' ' + opts.className : '';
  /* `compact` shortens the digits and keeps the exact figure in the title, so
     a clipped card becomes a readable one without the precise number going
     anywhere. Used by the KPI row, where the space is fixed and the values are
     unbounded. */
  const shown = opts.compact ? fmtCompact(amount) : fmtNum(amount);
  const exact = opts.compact && shown !== fmtNum(amount)
    ? ` title="${currency} ${fmtNum(amount)}"` : '';
  return `<span class="money-value money-value--${size}${cls}" ${color}${exact}>`
       + `<span class="money-cur">${currency}</span>`
       + `<span class="money-amt">${shown}</span>`
       + `</span>`;
}

/* ── THE PRINTED DOCUMENTS LIVE IN src/export/ NOW ───────────────────────────
   printDocStyles(), printHeader(), printKpiGrid() and printListDocument() were
   this file's answer to "a header, some totals and a table", and every module
   that grew an export grew a variant of them anyway. They are replaced by the
   global export engine (src/export/engine.js), which renders the SAME
   definition as a PDF and as a workbook so the two cannot drift apart — see
   the export design specification, sections 58 to 61.

   Two printed artefacts deliberately do NOT go through it, and are not
   regressions: the room visit sheet and the student card. Those are physical
   objects with a design the owner signed off, not data exports, and each keeps
   its own stylesheet inside the module that builds it.                      */

/* The filename these documents get. One rule, so a folder of them sorts by
   hostel then by what they are then by date, instead of three conventions. */
function printFileName(what, scope) {
  const hostel = ((typeof DB !== 'undefined' && DB.settings && DB.settings.hostelName) || 'Hostel')
    .replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
  const bit = scope ? '_' + String(scope).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '') : '';
  return hostel + '_' + what + bit + '_' + today() + '.pdf';
}

// BUG FIX: new Date('YYYY-MM-DD') parses as UTC midnight → wrong day in PKT (UTC+5)
// Appending 'T00:00:00' forces local-time parsing.
function fmtDate(d) {
  if (!d) return '—';
  try {
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
    return dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) { return d; }
}

// Dashboard month selector (null = real current month, 'YYYY-MM' = selected)
let _dashboardMonth = null;
function thisMonth() {
  return _dashboardMonth || ym(new Date());
}
function thisMonthLabel() {
  const [y, m] = thisMonth().split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function thisYear() { return new Date().getFullYear().toString(); }

/* A stored month key rendered for a person. `p.month` is 'YYYY-MM' on newer
   records and the older 'August 2026' shape on ones written before that, so
   this takes either and returns the readable form - printing the raw key put
   "Room 22 · 2026-09" on the dashboard, which is a database value on a screen.

   en-IN, not en-PK: the app already uses it everywhere for dates. */
function monthLabel(key) {
  const s = String(key || '').trim();
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return s;                       // already a label, or something else
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

// ── String helpers ────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function csvEsc(s) {
  const v = String(s == null ? '' : s);
  return '"' + v.replace(/"/g, '""') + '"';
}

// ── Input formatters ──────────────────────────────────────────────────────────
function formatRoomNumber(inp) {
  let v = inp.value;
  if (v.length > 0) v = v[0].toUpperCase() + v.slice(1);
  inp.value = v;
}
function capFirstChar(inp) {
  if (inp.value.length === 1) inp.value = inp.value.toUpperCase();
}
function formScrollNext(inp) {
  const field = inp.closest ? inp.closest('.field') : null;
  if (!field) return;
  const next = field.nextElementSibling;
  if (next) next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// Capitalize ASCII only — protects Urdu/Arabic names
function autoCapName(inp) {
  const v   = inp.value;
  const pos = inp.selectionStart;
  // Title-case: capitalize first letter of each word only, preserve rest
  inp.value = v.replace(/\b([a-zA-Z])/g, c => c.toUpperCase());
  inp.setSelectionRange(pos, pos);
}

// ── Debounce ──────────────────────────────────────────────────────────────────
function debounce(fn, delay) {
  delay = delay || 220;
  let t;
  return function () {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, delay);
  };
}

// ── Pagination ──────────────────────────────────────────────────────────────────
// Large lists (students/payments/rooms) only render one page of rows at a time so
// the browser isn't asked to build thousands of DOM nodes in one blocking pass.
const PAGE_SIZE = 30;

// Slice a filtered array down to the current page. `filter` is the module's filter
// state object (must have a numeric `.page`). Returns { slice, page, pages, total, from, to }.
function paginate(arr, filter) {
  const total = arr.length;
  // A filter may carry its own page size (the payments screen lets the user
  // pick one). Everything else keeps the module-wide PAGE_SIZE default.
  const size = (filter && Number(filter.pageSize)) || PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / size));
  let page = filter && filter.page ? filter.page : 1;
  if (page > pages) page = pages;
  if (page < 1) page = 1;
  if (filter) filter.page = page; // clamp back so the controls stay in sync
  const start = (page - 1) * size;
  const end = Math.min(start + size, total);
  return { slice: arr.slice(start, end), page, pages, total, from: total ? start + 1 : 0, to: end };
}

// Jump to a page for a given filter object, then re-render that page (scrolled to top).
function gotoPage(filter, pageName, page) {
  filter.page = page;
  renderPage(pageName, true);
}

// ── Sorting ──────────────────────────────────────────────────────────────────────
// Sort a filtered array by filter.sortKey / filter.sortDir using a map of
// key → accessor(row). Returns a NEW array (or the same array if no active sort).
/* An accessor may be a plain getter, or `{ get, cmp }` when the column needs a
   comparator of its own. Room numbers need one: `Number('A 01')` is NaN and a
   plain string compare puts "10" before "2", so both of the obvious readings
   are wrong for the one column every list in this app is now ordered by. */
function applySort(arr, filter, accessors) {
  const key = filter && filter.sortKey;
  if (!key || !accessors || !accessors[key]) return arr;
  const spec = accessors[key];
  const acc  = typeof spec === 'function' ? spec : spec.get;
  const cmp  = typeof spec === 'function' ? null : spec.cmp;
  const dir = filter.sortDir === 'desc' ? -1 : 1;
  return arr.slice().sort(function (a, b) {
    let va = acc(a), vb = acc(b);
    const na = (va === null || va === undefined || va === '');
    const nb = (vb === null || vb === undefined || vb === '');
    if (na && nb) return 0;
    if (na) return 1;   // blanks always sink to the bottom
    if (nb) return -1;
    if (cmp) return cmp(va, vb) * dir;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
}

// Build CSV text from an array of row-arrays (first row = headers) and download it.
function downloadCSV(rows, filename) {
  if (!rows || rows.length <= 1) { if (typeof toast === 'function') toast('No data to export', 'error'); return; }
  const csv = rows.map(function (r) {
    return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM → Excel reads UTF-8
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  if (typeof toast === 'function') toast('Downloaded: ' + filename, 'success');
}

// Toggle the sort for a column: first click = asc, second = desc, then re-render.
function toggleSort(filter, pageName, key) {
  if (filter.sortKey === key) {
    filter.sortDir = filter.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    filter.sortKey = key;
    filter.sortDir = 'asc';
  }
  filter.page = 1;
  renderPage(pageName, true);
}

// Render a clickable sortable <th>. `filterName` is the GLOBAL var name of the
// filter object so inline onclick can reference it. `attrs` = extra th attributes.
function sortableTh(filter, filterName, pageName, key, label, attrs) {
  const active = filter.sortKey === key;
  const arrow = active ? (filter.sortDir === 'asc' ? '▲' : '▼') : '⇅';
  return '<th class="th-sortable' + (active ? ' sorted' : '') + '" ' + (attrs || '') +
    ' onclick="toggleSort(' + filterName + ',\'' + pageName + '\',\'' + key + '\')" title="Sort by ' + label + '">' +
    '<span class="th-sort-inner">' + label + '<span class="th-arrow">' + arrow + '</span></span></th>';
}

// Build the pager control bar. `filterName` is the GLOBAL variable name of the
// filter object (e.g. 'studentFilter') so inline onclick can reference it.
function renderPager(info, filterName, pageName) {
  if (info.pages <= 1) {
    return `<div class="pager"><span class="pager-info">${info.total} total</span></div>`;
  }
  const btn = (label, target, opts) => {
    opts = opts || {};
    if (opts.disabled) return `<button class="pager-btn" disabled>${label}</button>`;
    if (opts.active)   return `<button class="pager-btn active">${label}</button>`;
    return `<button class="pager-btn" onclick="gotoPage(${filterName},'${pageName}',${target})">${label}</button>`;
  };
  const { page, pages } = info;
  // Window of page numbers around the current page (max 5).
  let lo = Math.max(1, page - 2), hi = Math.min(pages, lo + 4);
  lo = Math.max(1, hi - 4);
  let nums = '';
  if (lo > 1) nums += btn('1', 1) + (lo > 2 ? '<span class="pager-gap">…</span>' : '');
  for (let i = lo; i <= hi; i++) nums += btn(String(i), i, { active: i === page });
  if (hi < pages) nums += (hi < pages - 1 ? '<span class="pager-gap">…</span>' : '') + btn(String(pages), pages);
  return `<div class="pager">
    <span class="pager-info">Showing ${info.from}–${info.to} of ${info.total}</span>
    <div class="pager-controls">
      ${btn('‹ Prev', page - 1, { disabled: page <= 1 })}
      ${nums}
      ${btn('Next ›', page + 1, { disabled: page >= pages })}
    </div>
  </div>`;
}

// ── Course autocomplete ───────────────────────────────────────────────────────
const COURSE_LIST = [
  // Medical
  'MBBS', 'BDS', 'Pharm-D', 'DPT (Physiotherapy)', 'B.Sc Nursing', 'BS Nursing',
  'BS Health Sciences', 'BS Biomedical Sciences', 'BS Microbiology', 'BS Biochemistry',
  'BS Biotechnology', 'BS Zoology', 'BS Botany', 'MDCAT Preparation', 'Post-MBBS Internship',
  // Engineering
  'BS Civil Engineering', 'BS Electrical Engineering', 'BS Mechanical Engineering',
  'BS Software Engineering', 'BS Computer Engineering', 'BS Electronics Engineering',
  'BS Chemical Engineering', 'BS Environmental Engineering', 'BS Industrial Engineering',
  // Computer & IT
  'BS Computer Science', 'BS Information Technology', 'BS Artificial Intelligence',
  'BS Data Science', 'BS Cyber Security', 'BS Networking', 'BS Game Development',
  'Diploma in IT', 'Web Development Course', 'Android Development Course',
  // Business & Finance
  'BBA', 'MBA', 'BS Commerce', 'B.Com', 'ACCA', 'CA Foundation', 'CMA', 'CFA',
  'BS Accounting & Finance', 'BS Economics', 'BS Banking & Finance',
  // Arts & Humanities
  'BS English Literature', 'BS Urdu', 'BS Islamic Studies', 'BS Psychology',
  'BS Sociology', 'BS Political Science', 'BS International Relations',
  'BS Mass Communication', 'BS Journalism', 'BS Fine Arts', 'BS Architecture',
  // Education
  'BS Education', 'B.Ed', 'ADE', 'M.Ed', 'BS Special Education',
  // Law
  'LLB', 'BS Law', 'Bar-at-Law',
  // Intermediate & Matric
  'FSc Pre-Medical', 'FSc Pre-Engineering', 'ICS', 'I.Com', 'FA', 'Matric (Science)',
  'Matric (Arts)', 'A-Levels', 'O-Levels',
  // Diploma & Short Courses
  'DAE Electrical', 'DAE Civil', 'DAE Mechanical', 'DAE Computer', 'DIT',
  'Diploma in English', 'IELTS Preparation', 'NTS Preparation', 'CSS Preparation',
  'Soft Skills Course', 'English Language Course', 'Graphic Design Course',
  'Digital Marketing Course', 'Content Writing Course'
];

function toggleOccField(val) {
  const custom = document.getElementById('f-tocccustom');
  const wrap   = document.getElementById('f-tocc-wrap');
  const main   = /** @type {HTMLInputElement} */ (document.getElementById('f-tocc'));
  if (val === 'other') {
    if (wrap)   wrap.style.display   = 'none';
    if (custom) { custom.style.display = 'block'; custom.style.marginTop = '0'; }
  } else {
    if (wrap)   wrap.style.display   = 'block';
    if (custom) custom.style.display = 'none';
    if (main)   main.placeholder = val === 'Student'
      ? 'Type course e.g. BS Computer Science…'
      : val === 'Job'      ? 'e.g. Software Engineer, Govt. Teacher…'
      : val === 'Business' ? 'e.g. Shop Owner, Contractor…'
      : 'Describe…';
  }
}

function courseAutocomplete(inp) {
  const val = inp.value.trim().toLowerCase();
  const box = document.getElementById('course-suggestions');
  if (!box) return;
  const matches = val.length === 0
    ? COURSE_LIST
    : COURSE_LIST.filter(c => c.toLowerCase().includes(val));
  if (!matches.length) { box.style.display = 'none'; return; }
  _renderCourseSuggestions(matches, val, -1);
  box.style.display = 'block';
}

function _renderCourseSuggestions(matches, val, activeIdx) {
  const box = document.getElementById('course-suggestions');
  if (!box) return;
  box.innerHTML = matches.slice(0, 12).map((c, i) => {
    const lo = val.toLowerCase();
    const hi = lo ? c.replace(
      new RegExp('(' + lo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
      '<b style="color:var(--accent-strong)">$1</b>'
    ) : escHtml(c);
    const active = i === activeIdx;
    return `<div class="cs-item${active ? ' cs-active' : ''}" data-idx="${i}" data-val="${c.replace(/"/g, '&quot;')}"
      onclick="pickCourse('${c.replace(/'/g, "\\'")}',this)"
      style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text);border-bottom:1px solid var(--border);${active ? 'background:var(--bg3);' : ''}"
      onmouseover="this.style.background='var(--bg3)'"
      onmouseout="this.style.background='${active ? 'var(--bg3)' : ''}'">${hi}</div>`;
  }).join('');
}

function pickCourse(val) {
  const inp = /** @type {HTMLInputElement} */ (document.getElementById('f-tocc'));
  if (inp) { inp.value = val; inp.focus(); }
  const box = document.getElementById('course-suggestions');
  if (box) box.style.display = 'none';
  setTimeout(() => {
    const wrap = document.getElementById('f-tocc-wrap');
    if (wrap) {
      const next = wrap.closest('.field') && wrap.closest('.field').nextElementSibling;
      if (next) next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 80);
}

function courseKeyNav(e) {
  const box = document.getElementById('course-suggestions');
  if (!box || box.style.display === 'none') return;
  const items = /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('.cs-item'));
  if (!items.length) return;
  let cur = Array.from(items).findIndex(el => el.classList.contains('cs-active'));
  if (e.key === 'ArrowDown') {
    e.preventDefault(); cur = (cur + 1) % items.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); cur = cur <= 0 ? items.length - 1 : cur - 1;
  } else if (e.key === 'Enter' && cur >= 0) {
    e.preventDefault(); pickCourse(items[cur].dataset.val); return;
  } else if (e.key === 'Escape') {
    box.style.display = 'none'; return;
  } else { return; }
  items.forEach((el, i) => {
    el.classList.toggle('cs-active', i === cur);
    el.style.background = i === cur ? 'var(--bg3)' : '';
  });
  if (items[cur]) items[cur].scrollIntoView({ block: 'nearest' });
}

// ── License key format ───────────────────────────────────────────────────────
// Two formats are in circulation. Both validate; only v4 is issued.
//
//   v3  HOSTEL-EEEE-CCCC-CCCC          (21 chars, 3 groups)
//       EEEE = base36(year*12 + month-1). Expiry is a whole MONTH, and the key
//       is a pure function of that month — so every client whose licence ended
//       in the same month was handed the SAME key, and no key could ever be
//       cut for a trial shorter than a month. Those two facts are why the
//       format is retired. It is still ACCEPTED, because the licence files on
//       the 50+ machines already activated re-check their key at every startup.
//
//   v4  HOSTEL-EEEE-SSSS-CCCC-CCCC     (26 chars, 5 groups)
//       EEEE = base36(days since 1970-01-01 UTC) — expiry is an exact DAY, so
//              7-day and 14-day keys are expressible.
//       SSSS = random base36 serial — two keys cut for the same expiry date
//              still differ.
//       CCCC-CCCC = HMAC-SHA256('V4:EEEE:SSSS', SECRET) hex, first 8.
//
// A v4 licence runs to the END of its expiry day (23:59:59.999 local).
const LICENSE_KEY_RE_V3 = /^HOSTEL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const LICENSE_KEY_RE_V4 = /^HOSTEL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function parseLicenseKey(key) {
  const k = String(key == null ? '' : key).toUpperCase().trim();
  if (LICENSE_KEY_RE_V4.test(k)) {
    const p = k.split('-');
    return { version: 4, key: k, expPart: p[1], serial: p[2], checksum: p[3] + p[4] };
  }
  if (LICENSE_KEY_RE_V3.test(k)) {
    const p = k.split('-');
    return { version: 3, key: k, expPart: p[1], serial: '', checksum: p[2] + p[3] };
  }
  return null;
}

// What the checksum is taken over. The 'V4:' tag stops a v4 key from ever
// colliding with the v3 key that happens to share its first group.
function licenseChecksumPayload(parsed) {
  return parsed.version === 4
    ? 'V4:' + parsed.expPart + ':' + parsed.serial
    : parsed.expPart;
}

function licenseChecksum(parsed, secret) {
  return crypto.createHmac('sha256', secret)
    .update(licenseChecksumPayload(parsed)).digest('hex').toUpperCase().slice(0, 8);
}

// Days between the Unix epoch and a calendar date, counted in UTC so the number
// a key carries does not shift with the machine's timezone.
function licenseDayNumber(year, month, day) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function licenseDayToDate(dayNumber) {
  const utc = new Date(dayNumber * 86400000);
  // Same calendar date, but ending a millisecond before local midnight: the
  // client's last day is the whole day, not the instant it starts.
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 23, 59, 59, 999);
}

function validateKeyFormat(key) {
  return parseLicenseKey(key) !== null;
}

function validateKeyChecksum(key, secret) {
  try {
    const parsed = parseLicenseKey(key);
    if (!parsed) return false;
    return parsed.checksum === licenseChecksum(parsed, secret);
  } catch (e) {
    console.error('[HOSTYLLO] Key checksum validation failed:', e.message);
    return false;
  }
}

// The expiry instant a key encodes. v3 keys keep their original meaning to the
// millisecond — midnight at the start of the month's last day — because moving
// it would move the expiry date under licences already activated in the field.
function licenseKeyExpiry(key) {
  const parsed = parseLicenseKey(key);
  if (!parsed) return null;
  const n = parseInt(parsed.expPart, 36);
  if (isNaN(n)) return null;
  if (parsed.version === 4) return licenseDayToDate(n);
  return new Date(Math.floor(n / 12), (n % 12) + 1, 0);
}

// Rejection-sampled so every base36 character is equally likely: 256 is not a
// multiple of 36, and a plain modulo would favour 0-3 in every position.
function licenseSerial() {
  const A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  while (out.length < 4) {
    const n = crypto ? crypto.randomBytes(1)[0] : Math.floor(Math.random() * 256);
    if (n >= 252) continue;                     // 252 = 36 * 7 — drop the biased tail
    out += A[n % 36];
  }
  return out;
}

// Issue a key. `serial` is injectable for the tests only; every production
// caller omits it and gets a fresh random one.
function buildLicenseKey(year, month, day, secret, serial) {
  const expPart = licenseDayNumber(year, month, day).toString(36).toUpperCase().padStart(4, '0');
  const ser     = String(serial || licenseSerial()).toUpperCase();
  const chk     = licenseChecksum({ version: 4, expPart: expPart, serial: ser }, secret);
  return 'HOSTEL-' + expPart + '-' + ser + '-' + chk.slice(0, 4) + '-' + chk.slice(4, 8);
}

// Legacy issuer — month granularity, no serial, identical output for identical
// input. Only for topping up a client still running a build that predates v4
// and would reject the longer key outright.
function buildLegacyLicenseKey(year, month, secret) {
  const expPart = (year * 12 + (month - 1)).toString(36).toUpperCase().padStart(4, '0');
  const chk     = licenseChecksum({ version: 3, expPart: expPart }, secret);
  return 'HOSTEL-' + expPart + '-' + chk.slice(0, 4) + '-' + chk.slice(4, 8);
}

// ── Room ordering ────────────────────────────────────────────────────────────
// Every dropdown and picker that lists rooms — or students, which a warden
// thinks of by room — is ordered by room number ascending.
//
// A plain string sort puts "10" before "2", and Number() alone drops schemes
// like "A1" or "1-B" to NaN and shuffles them arbitrarily. So: compare the
// leading numeric part first, keep non-numeric room numbers after numeric ones,
// and fall back to a natural-order string compare within each group.
function cmpRoomNo(a, b) {
  const sa = String(a == null ? '' : a).trim();
  const sb = String(b == null ? '' : b).trim();
  // Only a LEADING digit run counts as the room's number. Stripping letters
  // instead would read "A1" as 1 and interleave a lettered wing through the
  // numbered rooms — A1, 2, A2, 10.
  const ma = sa.match(/^(\d+(?:\.\d+)?)/);
  const mb = sb.match(/^(\d+(?:\.\d+)?)/);
  const na = ma ? parseFloat(ma[1]) : NaN;
  const nb = mb ? parseFloat(mb[1]) : NaN;
  const aNum = !isNaN(na), bNum = !isNaN(nb);
  if (aNum && bNum) {
    if (na !== nb) return na - nb;
  } else if (aNum !== bNum) {
    return aNum ? -1 : 1;                       // numeric rooms first
  }
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

// Room objects in ascending room-number order. Returns a NEW array — callers
// pass DB.rooms straight in, and sorting that in place would reorder the
// database itself.
function roomsByNumber(list) {
  return (list || DB.rooms || []).slice().sort((a, b) => cmpRoomNo(a && a.number, b && b.number));
}

// Students ordered by their room number, then by name inside a room.
function studentsByRoom(list) {
  const byId = new Map((DB.rooms || []).map(r => [r.id, r]));
  return (list || DB.students || []).slice().sort((a, b) => {
    const ra = byId.get(a && a.roomId), rb = byId.get(b && b.roomId);
    const c = cmpRoomNo(ra && ra.number, rb && rb.number);
    if (c !== 0) return c;
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''));
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateKeyFormat, validateKeyChecksum, parseLicenseKey, licenseKeyExpiry,
    licenseDayNumber, licenseDayToDate, licenseSerial,
    buildLicenseKey, buildLegacyLicenseKey, cmpRoomNo
  };
}
/* ─── BACKUP VALIDATION ──────────────────────────────────────────────────────
   A backup file is the ONE arbitrary document this app ingests. It arrives from
   a file picker, so its contents are entirely outside our control, and what it
   becomes is the whole database — `DB = _initDBFields(data)`.

   Two import paths existed and they did not agree. restoreBackup() in
   storage.js checked a size cap, that rooms/students were arrays, and that each
   record had an id. importData() in settings.js did `JSON.parse` and handed the
   result straight to _initDBFields(). Both now come through here.

   WHAT A HOSTILE OR BROKEN FILE COULD DO BEFORE THIS

   * PROTOTYPE POLLUTION. JSON.parse() itself is safe — it defines __proto__ as
     an ordinary own property rather than invoking the setter — but the object
     then gets merged, spread and assigned all over the app, and any one of
     those re-introduces the pollution. A "__proto__": {"isAdmin": true} in a
     backup should never have got as far as those merges.

   * A TRUTHY NON-ARRAY COLLECTION. _initDBFields guards with `if (!d.students)
     d.students = []`, so a students value of "" or 0 is replaced — but the
     string "abc" is truthy and survives, and then every .filter/.map/.reduce
     on DB.students throws. The app boots into a broken state with the real
     database already overwritten.

   * A RECORD WITH NO id. db:importFull binds r.id into an INSERT; undefined
     fails the whole transaction AFTER the renderer has already replaced its
     in-memory DB, which is the worst ordering: memory says one thing, disk
     says another.

   * RUNAWAY NESTING. A deeply nested document blows the stack in JSON.stringify
     during save, not during parse, so it fails late and half-applied.

   Returns { ok: true } or { ok: false, reason: '<human sentence>' }. The reason
   is shown to the warden, so it says what is wrong with THEIR file rather than
   naming an internal field.                                                  */
const BACKUP_COLLECTIONS = [
  'students', 'rooms', 'payments', 'expenses', 'cancellations', 'maintenance',
  'complaints', 'checkinlog', 'notices', 'fines', 'activityLog', 'inspections',
  'billSplits', 'transfers', 'roomShifts', 'archive',
];
// Collections whose records are written to SQLite by id, so an id is mandatory.
const BACKUP_ID_REQUIRED = [
  'students', 'rooms', 'payments', 'expenses', 'cancellations', 'transfers', 'archive',
];
const BACKUP_MAX_RECORDS = 200000;   // ~40x the largest real hostel seen
const BACKUP_MAX_DEPTH   = 24;

function _isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Any __proto__ / constructor / prototype key, at any depth. Also depth-caps. */
function _findPollution(node, depth) {
  if (depth > BACKUP_MAX_DEPTH) return 'nested too deeply';
  if (Array.isArray(node)) {
    for (const v of node) {
      const hit = _findPollution(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!_isPlainObject(node)) return null;
  for (const k of Object.keys(node)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype')
      return 'contains a reserved key ("' + k + '")';
    const hit = _findPollution(node[k], depth + 1);
    if (hit) return hit;
  }
  return null;
}

function validateBackup(data) {
  if (!_isPlainObject(data))
    return { ok: false, reason: 'This file is not a Hostyllo backup — it does not contain a data object.' };

  const polluted = _findPollution(data, 0);
  if (polluted)
    return { ok: false, reason: 'This backup was rejected because it ' + polluted + '. A genuine backup never does.' };

  // It must look like OUR backup, not merely like valid JSON.
  const looksLikeOurs = BACKUP_COLLECTIONS.some(k => k in data) || _isPlainObject(data.settings);
  if (!looksLikeOurs)
    return { ok: false, reason: 'This file is valid JSON but is not a Hostyllo backup.' };

  let total = 0;
  for (const key of BACKUP_COLLECTIONS) {
    if (!(key in data) || data[key] == null) continue;   // absent is fine — it gets defaulted
    if (!Array.isArray(data[key]))
      return { ok: false, reason: 'The "' + key + '" section of this backup is damaged — it should be a list.' };
    total += data[key].length;
    if (total > BACKUP_MAX_RECORDS)
      return { ok: false, reason: 'This backup holds more than ' + fmtNum(BACKUP_MAX_RECORDS) + ' records, which is beyond what this app can restore.' };
    for (const rec of data[key]) {
      if (!_isPlainObject(rec))
        return { ok: false, reason: 'The "' + key + '" section contains an entry that is not a record.' };
    }
    if (BACKUP_ID_REQUIRED.indexOf(key) !== -1) {
      const bad = data[key].findIndex(r => r.id === undefined || r.id === null || r.id === '');
      if (bad !== -1)
        return { ok: false, reason: 'A record in "' + key + '" (number ' + (bad + 1) + ') has no id, so it cannot be restored.' };
    }
  }

  if ('settings' in data && data.settings != null && !_isPlainObject(data.settings))
    return { ok: false, reason: 'The settings section of this backup is damaged.' };

  return { ok: true };
}


/* ════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP MARK, IN ONE PLACE (owner, 2026-09-10: "use official whatsapp
   logo").

   There were three marks in this app: the brand's own outline on the students
   register, a filled variant on the dashboard's reminder button, and — on the
   Payments toolbar, the one button whose whole job is to say which channel the
   reminder goes out on — a bare speech bubble with no handset in it, which
   reads as "a chat app" rather than as WhatsApp.

   This is the brand outline: the bubble with the tail bottom-left and the
   handset inside it. It takes `currentColor` rather than the brand green, so a
   register with forty of them in it does not become forty saturated green marks
   competing with the column beside them; a caller that wants the green sets the
   colour on the button.
   ════════════════════════════════════════════════════════════════════════════ */
function waMark(size) {
  const s = size || 15;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    + '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24Z"/>'
    + '<path d="M9.36 7.2c-.19-.42-.38-.43-.56-.44h-.47c-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.05s.89 2.38 1.01 2.54c.12.17 1.71 2.74 4.22 3.73 2.09.82 2.51.66 2.97.62.46-.04 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.06-.1-.23-.16-.47-.29-.25-.12-1.48-.73-1.71-.81-.23-.09-.4-.13-.56.12-.17.25-.64.81-.79.98-.14.16-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.55-1.34-.75-1.83Z"/></svg>';
}


/* ════════════════════════════════════════════════════════════════════════════
   THE CNIC, MASKED ON SCREEN AND REVEALED ON HOVER
   Owner, 2026-09-10: "make the cnic detail in pages as it is in the pdf and
   only should be shovn vhen cursor is placed upon it."

   WHY THE PDF'S MASK AND NOT THE PAYMENTS PAGE'S
   There were two masks in the codebase and they disagreed: the exports showed
   `17300-30*******` and the payments register showed `17300-*******-6`. The
   owner's instruction names the PDF as the one to match, so this is that one,
   and payMaskCnic() now delegates here. A CNIC is a national identity number
   on a screen a warden shares with whoever walks up to the desk; two different
   partial views of it are also two different leaks.

   IT IS THE SAME WIDTH AS THE FULL NUMBER — five digits, a hyphen, two digits,
   seven asterisks — which is 15 characters, exactly what `17300-3012345-6` is.
   That is deliberate: the hover reveal swaps the text in place and the row
   must not reflow under the cursor, or the thing being read moves while it is
   being read.

   ANYTHING THAT IS NOT CNIC-SHAPED IS PASSED THROUGH. A hostel that types a
   passport number or a B-Form into this field gets its value back untouched
   rather than a mask that hides a shape this function guessed wrong.
   ════════════════════════════════════════════════════════════════════════════ */
function maskCnic(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (digits.length < 13) return s;
  return digits.slice(0, 5) + '-' + digits.slice(5, 7) + '*'.repeat(7);
}

/** The masked CNIC as a cell, with the full number underneath it revealed on
 *  hover. Two spans rather than a `title` tooltip: a tooltip needs a second of
 *  dwell, sits away from the value and cannot be read from a screenshot, and
 *  "shown when the cursor is placed upon it" is what the owner asked for.
 *  Returns '' for an empty value so the caller can fall back to its own dash.
 *  Both halves are escaped — this is rendered into innerHTML. */
function cnicHtml(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const m = maskCnic(s);
  if (m === s) return '<span class="cnic-r">' + escHtml(s) + '</span>';  // not CNIC-shaped
  return '<span class="cnic-r" aria-label="' + escHtml(s) + '">'
       +   '<span class="cnic-r__m">' + escHtml(m) + '</span>'
       +   '<span class="cnic-r__f">' + escHtml(s) + '</span>'
       + '</span>';
}

/* ════════════════════════════════════════════════════════════════════════════
   THE ROOM CELL, IN ONE PLACE (owner, 2026-09-10: "label room number and floor
   just like the students page room number globally").

   Four registers print a room and every one of them printed it differently:
   Students in a pale box, Payments as three loose lines ("#1", "1-Seater",
   "Ground Floor"), Complaints and Cancellations as two. The box is the one the
   owner drew and the one that works — two loose lines of text in the middle of
   a wide row do not group, and the number is the thing being scanned for.

   PALE, NOT TINTED. What sits under the number is a category, and CLAUDE.md
   keeps hue for state.

   The floor is SHORTENED, never truncated: "Ground" becomes "G-Floor", "1st"
   becomes "1st-Floor", and a name a hostel typed for itself is passed through
   with the same suffix rather than guessed at.
   ════════════════════════════════════════════════════════════════════════════ */
function floorShort(floor) {
  const f = String(floor || '').trim();
  if (!f) return '';
  const low = f.toLowerCase();
  if (low.startsWith('base') || low.startsWith('cellar')) return 'Base-Floor';
  if (low.startsWith('ground') || low === 'g')            return 'G-Floor';
  const m = f.match(/^(\d+)(st|nd|rd|th)?/i);
  if (m) {
    const n = Number(m[1]);
    const suf = n % 10 === 1 && n % 100 !== 11 ? 'st'
              : n % 10 === 2 && n % 100 !== 12 ? 'nd'
              : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
    return n + suf + '-Floor';
  }
  return f + '-Floor';
}

/**
 * The boxed room label: the number, with the floor under it when there is one.
 * `number` may be a room object or a bare number/string.
 */
function roomLabel(number, floor) {
  const room = (number && typeof number === 'object') ? number : null;
  const n = room ? room.number : number;
  const f = floorShort(room ? room.floor : floor);
  const shown = (n === 0 || n) && String(n).trim() !== '' ? '#' + escHtml(String(n)) : '—';
  return '<span class="lk-room">'
       + '<span class="lk-room__n">' + shown + '</span>'
       + (f ? '<span class="lk-room__t">' + escHtml(f) + '</span>' : '')
       + '</span>';
}


/* ════════════════════════════════════════════════════════════════════════════
   "LEFT" AND "ON NOTICE" NAME A DATE — SO PRINT IT (owner, 2026-09-10:
   "mention labelled left or vacate date with the left status globally to have
   clarification").

   Both statuses are about a moment, and neither said which one. "Left" on a
   register of two hundred students answers nothing a warden asks next — left
   when? — and "On Notice" is worse, because the bed is still occupied and the
   only useful fact is the day it frees.

   THE DATE COMES FROM A DIFFERENT PLACE FOR EACH. A departed student carries
   their own `leftDate`; a student on notice does not carry a vacate date at all
   — it lives on their PENDING cancellation record, and there can be more than
   one if a request was filed, restored and filed again. The soonest is the one
   that matters: it is the day the bed actually frees.

   Returns '' for Active and Blacklisted, which name no date.
   ════════════════════════════════════════════════════════════════════════════ */
function statusDate(t) {
  if (!t) return '';
  const st = String(t.status || '');
  if (st === 'Left') return t.leftDate || '';
  if (st === 'Cancelling' || st === 'On Notice') {
    const mine = (DB.cancellations || [])
      .filter(c => c && c.status === 'Pending' && String(c.studentId) === String(t.id) && c.vacateDate)
      .map(c => c.vacateDate).sort();
    return mine[0] || '';
  }
  return '';
}

/* THE YEAR IS DROPPED WHEN IT IS THIS YEAR, and that is a width decision made
   against a measurement: the status column on the students register is 74px,
   and "Left 10-Sept-2026" is 95. Clipped, it read "Left 10-Sept-20", which is a
   wrong date rather than a short one. Everything from an earlier year keeps its
   year, because that is exactly when the year is the part you need. */
function fmtDateShort(d) {
  if (!d) return '';
  try {
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    /* Two literal calls rather than one options object: a `{day, month}` object
       widens to `{day: string, month: string}` and stops satisfying
       DateTimeFormatOptions, which `npm run typecheck` covers this file for. */
    return dt.getFullYear() === new Date().getFullYear()
      ? dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })
      : dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) { return String(d); }
}

/** "Left 10-Sept" / "Vacates 30-Sept", or '' when the status names no date. */
function statusDateText(t) {
  const d = statusDate(t);
  if (!d) return '';
  return (String(t.status) === 'Left' ? 'Left ' : 'Vacates ') + fmtDateShort(d);
}

/** The same, as the small line that sits under a status pill. The full date
    stays on the title, so a shortened one is never the only copy. */
function statusDateNote(t) {
  const s = statusDateText(t);
  if (!s) return '';
  const full = (String(t.status) === 'Left' ? 'Left ' : 'Vacates ') + fmtDate(statusDate(t));
  return '<div class="lk-statdate" title="' + escHtml(full) + '">' + escHtml(s) + '</div>';
}
