// ════════════════════════════════════════════════════════════════════════════
// Access — the level ladder, timed levels, restrictions and fleet overrides
//
// One module so the signed entitlement, the portal's preview and the portal's
// register all read ONE answer to "what can this hostel do right now?". Three
// places each deriving it is how the portal ends up showing "Read-only" for a
// hostel whose app is fully open.
//
// ── The ladder (owner, 2026-09-24) ──────────────────────────────────────────
//
//   active      everything
//   readonly    view, search, print, export — no data entry
//   restricted  view and search only — no data entry, printing or exporting
//   suspended   locked: the app shows the licence screen and nothing else
//   revoked     locked, permanently
//
// Suspended and revoked hostels get NO data download (owner's decision D1).
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const features = require('./features');

const LEVELS = Object.freeze(['active', 'readonly', 'restricted', 'suspended', 'revoked']);

/** Levels a timed level may fall back to. Never `revoked` — that is not temporary. */
const RESTORABLE = Object.freeze(['active', 'readonly', 'restricted', 'suspended']);

/**
 * The capabilities a level can switch off. `true` = allowed. Keys are a WIRE
 * CONTRACT with the app (services/entitlement.js validates them).
 */
const RESTRICTION_KEYS = Object.freeze(['dataEntry', 'printing', 'exporting']);

const RESTRICTION_LABELS = Object.freeze({
  dataEntry: 'Adding and editing data',
  printing: 'Printing and PDFs',
  exporting: 'Exporting and backups'
});

/**
 * The level in force at `now`. A timed level whose `status_until` has passed
 * is already over, even if the sweeper has not yet written that down — the
 * entitlement must never keep a hostel banned for the minute between the ban
 * ending and the sweeper noticing.
 *
 * @param {{status:string, status_until?:Date|string|null, status_before?:string|null}} lic
 * @param {Date} [now]
 */
function effectiveLevel(lic, now) {
  const t = (now || new Date()).getTime();
  if (lic.status !== 'revoked' && lic.status_until) {
    const until = new Date(lic.status_until).getTime();
    if (Number.isFinite(until) && t >= until) return lic.status_before || 'active';
  }
  return LEVELS.includes(lic.status) ? lic.status : 'active';
}

/**
 * Validate per-licence (or fleet) restriction overrides. Unknown keys are
 * refused, not stored, for the same reason unknown feature flags are: a switch
 * the app does not read is an admin believing they changed something when
 * nothing happened.
 */
function validateRestrictions(input) {
  if (input === null || input === undefined) return { ok: true, value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'restrictions must be an object' };
  }
  const value = {};
  for (const [key, val] of Object.entries(input)) {
    if (!RESTRICTION_KEYS.includes(key)) {
      return { ok: false, error: 'unknown restriction: ' + key };
    }
    if (typeof val !== 'boolean') {
      return { ok: false, error: 'restriction ' + key + ' must be true or false' };
    }
    // Only `false` is stored. `true` would read as "allowed even if the level
    // forbids it", and nothing here may loosen a level.
    if (val === false) value[key] = false;
  }
  return { ok: true, value };
}

/**
 * What the hostel may do. The level sets the floor; a licence or fleet
 * override can only take more away.
 */
function resolveRestrictions(level, licenceOverrides, fleetOverrides) {
  const out = { dataEntry: true, printing: true, exporting: true };
  if (level === 'readonly') out.dataEntry = false;
  if (level === 'restricted' || level === 'suspended' || level === 'revoked') {
    out.dataEntry = false; out.printing = false; out.exporting = false;
  }
  for (const src of [fleetOverrides, licenceOverrides]) {
    if (!src || typeof src !== 'object') continue;
    for (const k of RESTRICTION_KEYS) if (src[k] === false) out[k] = false;
  }
  return out;
}

/**
 * Features: catalogue default < fleet < licence. Always the complete set — see
 * features.resolve() for why a partial map is dangerous.
 */
function resolveFeatures(licenceOverrides, fleetOverrides) {
  const out = features.defaults();
  for (const src of [fleetOverrides, licenceOverrides]) {
    const checked = features.validateOverrides(src);
    if (checked.ok) Object.assign(out, checked.value);
  }
  return out;
}

module.exports = {
  LEVELS, RESTORABLE, RESTRICTION_KEYS, RESTRICTION_LABELS,
  effectiveLevel, validateRestrictions, resolveRestrictions, resolveFeatures
};
