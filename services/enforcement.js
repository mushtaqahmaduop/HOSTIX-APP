// ════════════════════════════════════════════════════════════════════════════
// Licence enforcement — the one place that decides what the app may do
//
// Every question of the form "is this hostel allowed to X" is answered here.
// Scattering that across feature files is how a licence system ends up with
// four different opinions and a customer who can add a payment but not edit it.
//
// ── It works with NO server, forever ────────────────────────────────────────
//
// The expiry date is already inside the licence when the customer activates it.
// So a hostel that unplugs the internet does not get free software: their
// licence still ends on its date, because the app already knows the date.
//
// Connectivity only changes three things — revoking someone EARLY, EXTENDING
// after payment, and telling the control plane they exist. None of those are
// needed for expiry to work. This module therefore treats the local licence as
// the baseline and a signed entitlement as an optional, more current opinion.
//
// ── Read-only, never destructive ────────────────────────────────────────────
//
// Past grace the app stops accepting new work. It never deletes, never
// encrypts, never hides history, never touches backups. Every student, payment
// and report stays visible and printable, and export keeps working — a hostel
// that pays late must lose nothing. That is decision D-3, and it is also just
// good business: a warden who can still print last month's receipts while
// payment is sorted out is a customer; one locked out of their own records is
// an ex-customer.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const STATE = {
  ACTIVE:     'ACTIVE',      // full operation
  GRACE:      'GRACE',       // full operation, renewal warning
  EXPIRED:    'EXPIRED',     // read-only
  SUSPENDED:  'SUSPENDED',   // read-only, with the owner's reason
  REVOKED:    'REVOKED',     // blocked — back to the activation screen
  UNLICENSED: 'UNLICENSED'   // no usable licence file at all
};

/** States in which the app runs but refuses new work. */
const READ_ONLY_STATES = new Set([STATE.EXPIRED, STATE.SUSPENDED]);

/** States in which the app does not open at all. */
const BLOCKED_STATES = new Set([STATE.REVOKED, STATE.UNLICENSED]);

const DAY_MS = 86400000;

/**
 * Tables that stay writable even in read-only mode.
 *
 * The activity log is the app's own audit trail. Freezing it would mean the
 * record of what happened during a lockout is the one period with no record —
 * exactly when a support call needs it most.
 */
const ALWAYS_WRITABLE = new Set(['activitylog']);

const DEFAULT_POLICY = { graceDays: 14, readOnlyOnExpiry: true };

// ── Effective time ──────────────────────────────────────────────────────────

/**
 * The time the app should reason about, given that the system clock is the one
 * thing a customer can trivially change.
 *
 * Winding the clock back is THE attack on offline licensing, because expiry is
 * checked locally. So instead of trusting `Date.now()`, take the latest of
 * every time the app or the server has already observed. Time does not run
 * backwards; if the clock is behind a moment we have already lived through, the
 * clock is wrong and the watermark is closer to the truth.
 *
 * Using the watermark AS the clock — rather than raising a tamper error — is
 * deliberate. An error screen is a puzzle to be solved, and a customer who
 * learns to trigger it has learned something useful. A licence that simply
 * carries on expiring teaches nothing and costs the attacker their time.
 *
 * ── Only APP-WRITTEN times are admissible ───────────────────────────────────
 *
 * Every watermark here was written by the app or asserted by the server:
 * `last_run.dat` on each launch, `activatedAt` at activation, `serverTimeSeen`
 * from a signed entitlement. None can be set by a user.
 *
 * User-entered dates are deliberately EXCLUDED, and this is not an oversight to
 * be helpfully corrected later. `payments.date` looks like an ideal watermark —
 * a working hostel writes them constantly — but a warden may legitimately
 * record a payment dated ahead. One future-dated row would push effective time
 * past the licence expiry and lock out a paying customer with a valid licence.
 * A time source a user controls cannot be used to decide whether that user's
 * software still runs.
 *
 * @param {object} w
 * @param {number} [w.systemNow]      Date.now()
 * @param {Date|string|null} [w.lastRun]
 * @param {Date|string|null} [w.activatedAt]
 * @param {Date|string|null} [w.serverTimeSeen]
 * @param {number} [w.toleranceMs]    ignore trivial drift (default 5 minutes)
 */
function effectiveNow(w) {
  const o = w || {};
  const systemNow = Number.isFinite(o.systemNow) ? o.systemNow : Date.now();
  const tolerance = Number.isFinite(o.toleranceMs) ? o.toleranceMs : 300000;

  const marks = [];
  const add = (label, v) => {
    if (v === null || v === undefined) return;
    const t = v instanceof Date ? v.getTime() : Date.parse(v);
    if (Number.isFinite(t)) marks.push({ label, t });
  };
  add('last_run', o.lastRun);
  add('activated', o.activatedAt);
  add('server', o.serverTimeSeen);

  let highest = null;
  for (const m of marks) if (!highest || m.t > highest.t) highest = m;

  if (!highest || systemNow >= highest.t) {
    return {
      now: new Date(systemNow), systemNow, source: 'system',
      clockSuspect: false, driftMs: 0,
      watermark: highest ? new Date(highest.t) : null,
      watermarkSource: highest ? highest.label : null
    };
  }

  const driftMs = highest.t - systemNow;
  return {
    now: new Date(highest.t), systemNow, source: highest.label,
    // Small drift is a laptop with a lazy RTC, not an attack. Only report a
    // suspect clock when it is beyond anything ordinary.
    clockSuspect: driftMs > tolerance,
    driftMs,
    watermark: new Date(highest.t),
    watermarkSource: highest.label
  };
}

// ── The decision ────────────────────────────────────────────────────────────

/**
 * @param {object} input
 * @param {object} input.licence      from main.js checkLicenseValidity()
 * @param {object} [input.entitlement] from EntitlementService.getStatus()
 * @param {Date}   [input.now]         effectiveNow().now
 * @param {object} [input.policy]      local fallback policy
 */
function resolve(input) {
  const o = input || {};
  const licence = o.licence || {};
  const ent = o.entitlement || null;
  const now = o.now instanceof Date ? o.now : new Date();

  // A signed entitlement carries the server's policy; without one, use the
  // local default. The server's opinion wins because it is the only one that
  // can have changed since activation.
  //
  // "Fresh" means the entitlement carries one of the five statuses the SERVER
  // issues. It must NOT also exclude the blocking ones: REVOKED is a server
  // decision and the most important one there is. An earlier version tested
  // `!BLOCKED_STATES.has(ent.state)` here, which threw revocations away and
  // fell back to the local licence — so revoking a customer did nothing at all.
  //
  // The states this deliberately ignores are the LOCAL ones the app invents
  // when it has no usable entitlement — NONE and STALE — which mean "ask the
  // licence file", not "the server said so".
  const SERVER_STATES = [STATE.ACTIVE, STATE.GRACE, STATE.EXPIRED, STATE.SUSPENDED, STATE.REVOKED];
  const entFresh = !!(ent && ent.policy && SERVER_STATES.includes(ent.state));
  const policy = Object.assign({}, DEFAULT_POLICY,
    entFresh && ent.policy ? ent.policy : (o.policy || {}));

  // ── 1. No usable licence file ─────────────────────────────────────────────
  // Unchanged from the behaviour 50+ machines already have: these send the
  // customer to the activation screen, and none of them is a licensing policy
  // decision this module should soften.
  if (!licence.valid) {
    return decision({
      state: STATE.UNLICENSED, source: 'local', reason: licence.reason || 'not_activated',
      expiresAt: licence.expiry || null, now, policy
    });
  }

  // ── 2. A fresh entitlement outranks the local file ────────────────────────
  // It is the only thing that can know about a suspension, a revocation or a
  // renewal that happened after this machine activated.
  if (entFresh) {
    return decision({
      state: ent.state, source: 'entitlement', reason: null,
      expiresAt: ent.expiresAt || licence.expiry || null,
      now, policy, features: ent.features || null,
      entitlementIssuedAt: ent.issuedAt || null
    });
  }

  // ── 3. Otherwise the licence file decides, and it always can ──────────────
  // This is the path every machine in the field is on today, and the path a
  // permanently offline hostel stays on forever.
  const expiry = licence.expiry ? new Date(licence.expiry) : null;
  if (!expiry || isNaN(expiry.getTime())) {
    return decision({
      state: STATE.UNLICENSED, source: 'local', reason: 'corrupt',
      expiresAt: null, now, policy
    });
  }

  const graceEnds = expiry.getTime() + policy.graceDays * DAY_MS;
  let state = STATE.ACTIVE;
  if (now.getTime() > graceEnds) state = STATE.EXPIRED;
  else if (now.getTime() > expiry.getTime()) state = STATE.GRACE;

  return decision({
    state, source: 'local', reason: null, expiresAt: expiry.toISOString(), now, policy
  });
}

function decision(d) {
  const expiresAt = d.expiresAt || null;
  const expiryMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const daysRemaining = Number.isFinite(expiryMs)
    ? Math.ceil((expiryMs - d.now.getTime()) / DAY_MS)
    : null;

  // readOnlyOnExpiry is server-configurable (D-3). With it off, an expired
  // licence still warns but does not lock — for a customer being given room to
  // pay.
  const readOnly = READ_ONLY_STATES.has(d.state)
    && (d.state === STATE.SUSPENDED || d.policy.readOnlyOnExpiry !== false);

  return {
    state: d.state,
    source: d.source,
    reason: d.reason || null,
    readOnly,
    blocked: BLOCKED_STATES.has(d.state),
    expiresAt,
    daysRemaining,
    graceDays: d.policy.graceDays,
    graceEndsAt: Number.isFinite(expiryMs)
      ? new Date(expiryMs + d.policy.graceDays * DAY_MS).toISOString()
      : null,
    features: d.features || null,
    entitlementIssuedAt: d.entitlementIssuedAt || null,
    evaluatedAt: d.now.toISOString()
  };
}

// ── The write gate ──────────────────────────────────────────────────────────

/**
 * Whether a write to `table` must be refused.
 *
 * Called in the MAIN process, at the IPC boundary. Gating in the renderer alone
 * would be decoration — the renderer is the untrusted side, and anything it can
 * choose not to do it can also choose to do. The renderer gets the same
 * decision so it can grey out buttons and explain itself, but this is the one
 * that counts.
 */
function writeBlocked(decision, table) {
  if (!decision) return false;
  if (!decision.readOnly && !decision.blocked) return false;
  return !ALWAYS_WRITABLE.has(String(table));
}

/** What to tell the customer. Plain, specific, and always with a way out. */
function message(decision, opts) {
  const d = decision || {};
  const support = (opts && opts.supportContact) || 'your provider';
  const on = d.expiresAt
    ? new Date(d.expiresAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  switch (d.state) {
    case STATE.ACTIVE:
      return d.daysRemaining !== null && d.daysRemaining <= 30
        ? { tone: 'info', text: 'Your licence expires on ' + on + ' — ' + d.daysRemaining + ' days left. Contact ' + support + ' to renew.' }
        : null;
    case STATE.GRACE:
      return { tone: 'warn', text: 'Your licence expired on ' + on + '. The app keeps working for now — contact ' + support + ' to renew.' };
    case STATE.EXPIRED:
      return { tone: 'error', text: 'Your licence expired on ' + on + '. You can still view, search and print everything, but new entries and edits are paused until it is renewed.' };
    case STATE.SUSPENDED:
      return { tone: 'error', text: 'This licence has been suspended. You can still view, search and print everything. Contact ' + support + ' to restore full access.' };
    case STATE.REVOKED:
      return { tone: 'error', text: 'This licence has been revoked. Contact ' + support + '.' };
    default:
      return null;
  }
}

module.exports = {
  STATE, READ_ONLY_STATES, BLOCKED_STATES, ALWAYS_WRITABLE, DEFAULT_POLICY,
  effectiveNow, resolve, writeBlocked, message
};
