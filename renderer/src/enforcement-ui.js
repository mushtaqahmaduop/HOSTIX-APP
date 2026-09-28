/* ─── Licence state, as the customer experiences it ──────────────────────────

   A banner that says what is happening, and a read-only mode that greys out
   what would fail anyway.

   THIS IS NOT THE ENFORCEMENT. The real gate is in the main process at the
   database IPC boundary — anything this file can choose not to do, a renderer
   can also choose to do. What lives here is the courtesy: telling the customer
   why, before they lose work typing into a form that will not save.

   ── Nothing here hides data ─────────────────────────────────────────────────
   Read-only means new entries and edits are paused. Every list, every search,
   every report and every print stays exactly as it was, and export keeps
   working. A hostel that pays late must lose nothing (D-3).

   ── Except where the owner says so (2026-09-24) ─────────────────────────────
   The owner can switch printing and exporting off per licence from the
   portal. Then this file greys out Print and Export and says why; the main
   process refuses them regardless.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

var _enforcement = null;

/** The current decision, or null before the first check / outside Electron. */
function licenceState() { return _enforcement; }

/** True when the app is refusing new work. */
function isReadOnly() { return !!(_enforcement && _enforcement.readOnly); }

/**
 * Guard for anything that saves.
 *
 * Call at the TOP of a submit handler, before the form is read. The write would
 * be refused by the main process regardless; catching it here means the message
 * names the licence instead of surfacing a database error, and the customer has
 * not already typed a page of data.
 */
function requireWritable(what) {
  if (!isReadOnly()) return true;
  var noun = what || 'This change';
  var why = _enforcement.state === 'EXPIRED'
    ? 'this licence has expired'
    : 'data entry is switched off for this licence';
  var reason = _enforcement.ownerReason ? ' Reason: ' + _enforcement.ownerReason + '.' : '';
  if (typeof toast === 'function') {
    toast(noun + ' cannot be saved because ' + why + '.' + reason + ' Your existing records are safe.', 'error');
  }
  return false;
}

// ── Printing and exporting (owner, 2026-09-24) ──────────────────────────────

/** 'printing' or 'exporting' — allowed unless the decision explicitly says no. */
function canOutput(kind) {
  if (!_enforcement) return true;
  if (_enforcement.blocked) return false;
  var r = _enforcement.restrictions;
  return !(r && r[kind] === false);
}

/**
 * Guard for Print / PDF / Export entry points:
 *   if (!requireOutput('printing')) return;
 */
function requireOutput(kind) {
  if (canOutput(kind)) return true;
  var what = kind === 'printing' ? 'Printing and PDFs are' : 'Exporting is';
  var reason = _enforcement && _enforcement.ownerReason ? ' Reason: ' + _enforcement.ownerReason + '.' : '';
  if (typeof toast === 'function') {
    toast(what + ' switched off for this licence.' + reason + ' Contact support.', 'error', 'Not available');
  }
  return false;
}

/* window.print() is called from a dozen places (receipts, the visit sheet,
   student cards). One wrapper here covers every one of them and any added
   later; the main process gates the PDF paths itself. */
(function wrapPrint() {
  if (typeof window === 'undefined' || typeof window.print !== 'function' || window.__hxPrintWrapped) return;
  var original = window.print.bind(window);
  window.print = function () { if (requireOutput('printing')) return original(); };
  window.__hxPrintWrapped = true;
})();

// ── Feature flags ───────────────────────────────────────────────────────────
//
// A second axis from permissions, and the two must not be confused.
//
//   canDo(perm)      what THIS WARDEN may do. Per user. Fails CLOSED — an
//                    unknown permission denies.
//   hasFeature(key)  what THIS HOSTEL has bought. Per licence, delivered in
//                    the signed entitlement. Fails OPEN.
//
// Failing open is the important half. Every machine in the field today has no
// entitlement at all, so `features` is null — and a null that disabled things
// would strip Reports, Expenses and Backup from ~50 hostels the moment they
// installed an update. A feature is off only when the control plane has
// explicitly said so for this customer.

/** Which flag gates which nav item and page. Empty means always available. */
var FEATURE_PAGES = {
  reports:  ['reports'],
  archive:  ['archive'],
  backup:   ['backup'],
  expenses: ['expenses'],
  ownerFunds: ['ownerfunds']
  // printDocs and multiUser gate actions rather than pages — see below.
};

/** Human labels, for the message a warden actually reads. */
var FEATURE_LABELS = {
  reports:   'Reports & analytics',
  archive:   'Annual archive',
  backup:    'Backup & restore',
  printDocs: 'Printable documents',
  multiUser: 'Multiple staff logins',
  expenses:  'Expenses & fund transfers',
  ownerFunds: 'Owner Funds'
};

/* ── OPT-IN FEATURES: OFF UNLESS THE CONTROL PLANE SAYS ON ────────────────────
   Every flag above fails OPEN, for the reason given at the top of this section.
   A feature built for ONE client cannot: failing open would hand it to every
   hostel that has not heard from the control plane — which is most of them,
   most of the time. Owner Funds (2026-09-28) is the first; the owner switches
   it on per hostel from the portal.

   So an opt-in flag is ON only when the entitlement says `true`. And because
   the entitlement goes stale when a hostel is offline for long enough — and
   stale means `features: null` — the last explicit answer is REMEMBERED on this
   machine: a hostel that had it keeps it while offline, and loses it only when
   the control plane says `false`. An entitlement from a control plane too old
   to know the flag (key absent) reads as "no news", not as "off". */
var OPT_IN_FEATURES = { ownerFunds: true };
var _OPT_IN_MEMO = 'hx_feat_on_';

function _optInRemembered(key) {
  try { return localStorage.getItem(_OPT_IN_MEMO + key) === '1'; } catch (_) { return false; }
}
function _optInRemember(key, on) {
  try {
    if (on) localStorage.setItem(_OPT_IN_MEMO + key, '1');
    else    localStorage.removeItem(_OPT_IN_MEMO + key);
  } catch (_) {}
}
function _optInState(key) {
  var f = _enforcement && _enforcement.features;
  if (f && Object.prototype.hasOwnProperty.call(f, key)) {
    var on = f[key] === true;
    _optInRemember(key, on);
    return on;
  }
  return _optInRemembered(key);
}

/**
 * Is this feature available to this hostel?
 *
 * True unless the entitlement explicitly says false. No entitlement, no
 * connection, an older build of the control plane — all mean yes.
 */
function hasFeature(key) {
  if (Object.prototype.hasOwnProperty.call(OPT_IN_FEATURES, key)) return _optInState(key);
  if (!_enforcement || !_enforcement.features) return true;
  return _enforcement.features[key] !== false;
}

/**
 * Gate an action at its entry point, the way requirePerm does:
 *   if (!requireFeature('printDocs')) return;
 */
function requireFeature(key) {
  if (hasFeature(key)) return true;
  var label = FEATURE_LABELS[key] || key;
  if (typeof toast === 'function') {
    toast(OPT_IN_FEATURES[key]
        ? label + ' is not switched on for this hostel. Contact support to have it added.'
        : label + ' is not included in this hostel’s plan. Contact support to add it.',
      'error', 'Not included');
  }
  return false;
}

/**
 * Hide the rail items for features this hostel does not have.
 *
 * Runs alongside applyPermissionsToChrome() rather than inside it: permissions
 * are known at login, features arrive whenever the control plane answers, and
 * a page hidden by one must not be un-hidden by the other. Each only ever
 * hides — neither reveals something the other took away.
 */
function applyFeaturesToChrome() {
  for (var key in FEATURE_PAGES) {
    if (!Object.prototype.hasOwnProperty.call(FEATURE_PAGES, key)) continue;
    if (hasFeature(key)) continue;
    var pages = FEATURE_PAGES[key];
    for (var i = 0; i < pages.length; i++) {
      document.querySelectorAll('.nav-item[data-page="' + pages[i] + '"]')
        .forEach(function (el) { el.style.display = 'none'; });
    }
  }
  /* The account menu's Manage Users entry this used to hide left the menu on
     2026-09-14 (owner) — staff management is reached from the sidebar only, and
     the menu's remaining entry, My Account, is every account's own. */
}

/** The flag that gates a page, or null. Used by nav.js's page-level check. */
function featureForPage(page) {
  for (var key in FEATURE_PAGES) {
    if (!Object.prototype.hasOwnProperty.call(FEATURE_PAGES, key)) continue;
    if (FEATURE_PAGES[key].indexOf(page) !== -1) return key;
  }
  return null;
}

// ── Banner ──────────────────────────────────────────────────────────────────

function _bannerEl() {
  var el = document.getElementById('licence-banner');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'licence-banner';
  el.className = 'licence-banner';
  // Prepended to the app shell rather than fixed-position: a fixed banner
  // covers whatever sits under it on every screen for the whole session, which
  // is exactly the bug the licence badge caused in the Rooms grid.
  var host = document.getElementById('main') || document.body;
  host.insertBefore(el, host.firstChild);
  return el;
}

function _renderBanner(decision) {
  var el = _bannerEl();

  /* THE MESSAGE COMES FROM THE DECISION, NOT FROM HERE.

     This function used to re-derive the wording with its own switch on
     decision.state — a second copy of enforcement.message(), which the main
     process now attaches as decision.banner. The copy handled GRACE, EXPIRED,
     SUSPENDED and near-expiry, and had NO CASE FOR REVOKED: a revoked customer
     got their writes refused with a blank, hidden banner and no explanation.

     Deriving UI text in two places is what produced that. There is one place
     now, and the fallback below exists only for a decision that predates the
     change reaching this window — never as a second opinion. */
  var msg = (decision && decision.banner) ? decision.banner : null;
  if (!msg && decision && decision.state === 'ACTIVE'
      && decision.daysRemaining !== null && decision.daysRemaining <= 30) {
    msg = { tone: 'info', text: 'Your licence expires on ' + _fmt(decision.expiresAt)
      + ' — ' + decision.daysRemaining + ' day' + (decision.daysRemaining === 1 ? '' : 's') + ' left.' };
  }

  if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }

  el.className = 'licence-banner licence-banner--' + msg.tone;
  el.style.display = 'flex';
  el.textContent = '';

  var text = document.createElement('span');
  text.className = 'licence-banner__text';
  text.textContent = msg.text;      // textContent, never innerHTML
  el.appendChild(text);

  // A clock that disagrees with reality is worth naming: the customer may have
  // set it deliberately, but far more often a dead CMOS battery has reset it
  // and everything they enter will carry the wrong date.
  if (decision.clockSuspect) {
    var warn = document.createElement('span');
    warn.className = 'licence-banner__clock';
    warn.textContent = 'This computer’s date looks wrong — please correct it.';
    el.appendChild(warn);
  }
}

function _fmt(iso) {
  if (!iso) return 'an unknown date';
  try {
    return new Date(iso).toLocaleDateString('en-PK',
      { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (e) { return 'an unknown date'; }
}

// ── Read-only affordance ────────────────────────────────────────────────────

/**
 * Marks the document so CSS can grey out what will not work, and disables the
 * obvious entry points. Deliberately coarse: the authoritative list of what is
 * blocked lives in the main process, and duplicating it here would be a second
 * copy to drift.
 */
function _applyReadOnly(readOnly) {
  document.body.classList.toggle('is-readonly', !!readOnly);
  // Separate hooks so a stylesheet can grey out Print and Export buttons
  // without touching data entry, and the other way round.
  document.body.classList.toggle('lic-no-printing', !canOutput('printing'));
  document.body.classList.toggle('lic-no-exporting', !canOutput('exporting'));
}

// ── Boot ────────────────────────────────────────────────────────────────────

function _apply(decision) {
  _enforcement = decision || null;
  try { _renderBanner(_enforcement); } catch (e) { console.error('[licence] banner:', e); }
  try { _applyReadOnly(isReadOnly()); } catch (e) { console.error('[licence] readonly:', e); }
  /* The whole chrome pass when someone is signed in, not only the feature
     pass: features only ever HIDE, and an opt-in feature switched ON while the
     app is open (Owner Funds) has a rail item to REVEAL — which only the
     permission pass does, and it re-applies features last. */
  try {
    if (typeof CUR_USER !== 'undefined' && CUR_USER && typeof applyPermissionsToChrome === 'function') applyPermissionsToChrome();
    else applyFeaturesToChrome();
  } catch (e) { console.error('[licence] features:', e); }
  // A page the customer is standing on may have just been switched off. Send
  // them somewhere that still exists rather than leaving them on a screen that
  // no longer renders.
  try {
    var current = (typeof currentPage !== 'undefined') ? currentPage : null;
    var flag = current ? featureForPage(current) : null;
    if (flag && !hasFeature(flag) && typeof navigate === 'function') navigate('dashboard');
  } catch (_) {}
}

(function initEnforcementUI() {
  if (!window.electronAPI || !window.electronAPI.licenseEnforcement) {
    // Dev mode in a plain browser. Silence rather than a broken banner.
    return;
  }
  window.electronAPI.licenseEnforcement()
    .then(_apply)
    .catch(function (e) { console.warn('[licence] enforcement unavailable:', e && e.message); });

  if (window.electronAPI.onEnforcementChanged) {
    window.electronAPI.onEnforcementChanged(_apply);
  }

  // Re-check on the hour. A licence that expires while the app is open should
  // start warning without the warden restarting — and a suspension applied
  // during the day should not wait for tomorrow.
  setInterval(function () {
    window.electronAPI.licenseEnforcement().then(_apply).catch(function () {});
  }, 3600000);
})();
