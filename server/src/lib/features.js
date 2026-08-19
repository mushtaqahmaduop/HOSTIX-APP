// ════════════════════════════════════════════════════════════════════════════
// Feature flags — the catalogue
//
// WHY THIS IS CODE AND NOT A DATABASE TABLE
//
// A flag describes something the APP can do. Its meaning is defined by the app
// build that reads it, so it has to be versioned alongside that build. In a
// table, a flag could be invented in the portal that no released app has ever
// heard of — the admin ticks a box, nothing happens, and there is no way to
// tell that from a bug. Here, a flag exists because a build supports it, the
// portal renders exactly this list, and anything not on it is rejected rather
// than stored and silently ignored.
//
// `since` is the app version that first honours the flag. The portal shows it,
// so switching a flag off for a hostel still running an older build is a
// visible fact rather than a surprise.
//
// ── Flags are for entitlement, not for hiding bugs ──────────────────────────
// A flag turns a capability on or off for a CUSTOMER — plan tiers, a feature
// they have not paid for, something being piloted with one hostel. It is not a
// kill switch for broken code; that is what a release is for. Flags that exist
// to work around defects never get removed and the matrix stops meaning
// anything.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

/**
 * The complete set of flags the desktop app understands.
 *
 * `default` is what a licence gets with no override. Defaults are deliberately
 * GENEROUS: the ~50 hostels already in the field paid for the app as it stands
 * today, and a flag defaulting to `false` would silently take something away
 * from them the first time their app asks the control plane a question.
 * Anything restrictive starts as an override on a new licence, never as a
 * default that reaches back into existing customers.
 */
const CATALOGUE = Object.freeze({
  reports: {
    label: 'Reports & analytics',
    description: 'Monthly reports, revenue and expense charts, the fee report PDF.',
    default: true,
    since: '4.0.0'
  },
  archive: {
    label: 'Annual archive',
    description: 'Year-end archive of settled payments, and browsing archived years.',
    default: true,
    since: '4.0.0'
  },
  backup: {
    label: 'Backup & restore',
    description: 'Exporting and importing the full database from Settings.',
    default: true,
    since: '4.0.0'
  },
  printDocs: {
    label: 'Printable documents',
    description: 'Room visit sheet and the student fee report.',
    default: true,
    since: '4.0.0'
  },
  multiUser: {
    label: 'Multiple staff logins',
    description: 'More than one warden account with separate permissions.',
    default: true,
    since: '4.0.0'
  },
  expenses: {
    label: 'Expenses & fund transfers',
    description: 'Expense register, categories, and owner fund transfers.',
    default: true,
    since: '4.0.0'
  }
});

/** Flag keys, sorted, for the portal's checkbox list. */
function catalogueKeys() {
  return Object.keys(CATALOGUE).sort();
}

/** Every flag at its default. */
function defaults() {
  const out = {};
  for (const key of catalogueKeys()) out[key] = CATALOGUE[key].default;
  return out;
}

/**
 * Validate a set of per-licence overrides.
 *
 * Rejects unknown keys rather than storing them. A flag the portal invented and
 * no app reads is worse than an error: the admin believes they changed
 * something, the customer sees no difference, and nothing anywhere says why.
 *
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
function validateOverrides(input) {
  if (input === null || input === undefined) return { ok: true, value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'features must be an object' };
  }
  const known = new Set(catalogueKeys());
  const value = {};
  for (const [key, val] of Object.entries(input)) {
    if (!known.has(key)) {
      return { ok: false, error: 'unknown feature flag: ' + key };
    }
    if (typeof val !== 'boolean') {
      return { ok: false, error: 'feature ' + key + ' must be true or false' };
    }
    value[key] = val;
  }
  return { ok: true, value };
}

/**
 * What this licence actually gets: catalogue defaults with its overrides on top.
 *
 * Always returns every known key, never a partial map. The app should be able to
 * read `features.reports` without checking whether the claim contained it —
 * a missing flag read as `undefined` is falsy, and would switch a feature off
 * for everyone the moment a new flag is added to the catalogue.
 */
function resolve(overrides) {
  const out = defaults();
  const checked = validateOverrides(overrides);
  if (checked.ok) Object.assign(out, checked.value);
  return out;
}

/** Only the flags that differ from their default — what the portal shows as "changed". */
function diffFromDefaults(overrides) {
  const base = defaults();
  const out = {};
  for (const [key, val] of Object.entries(resolve(overrides))) {
    if (base[key] !== val) out[key] = val;
  }
  return out;
}

module.exports = {
  CATALOGUE, catalogueKeys, defaults, validateOverrides, resolve, diffFromDefaults
};
