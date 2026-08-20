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
  var why = _enforcement.state === 'SUSPENDED'
    ? 'this licence is suspended'
    : 'this licence has expired';
  if (typeof toast === 'function') {
    toast(noun + ' cannot be saved because ' + why + '. Your existing records are safe and can still be viewed and printed.', 'error');
  }
  return false;
}

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
  expenses: ['expenses']
  // printDocs and multiUser gate actions rather than pages — see below.
};

/** Human labels, for the message a warden actually reads. */
var FEATURE_LABELS = {
  reports:   'Reports & analytics',
  archive:   'Annual archive',
  backup:    'Backup & restore',
  printDocs: 'Printable documents',
  multiUser: 'Multiple staff logins',
  expenses:  'Expenses & fund transfers'
};

/**
 * Is this feature available to this hostel?
 *
 * True unless the entitlement explicitly says false. No entitlement, no
 * connection, an older build of the control plane — all mean yes.
 */
function hasFeature(key) {
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
    toast(label + ' is not included in this hostel’s plan. Contact support to add it.',
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
  // Staff management is a feature as well as a permission.
  if (!hasFeature('multiUser')) {
    var manage = document.getElementById('user-menu-manage');
    if (manage) manage.style.display = 'none';
  }
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

  var msg = null;
  if (decision) {
    if (decision.state === 'GRACE') {
      msg = { tone: 'warn', text: 'Your licence expired on ' + _fmt(decision.expiresAt)
        + '. The app keeps working for now — please renew to avoid interruption.' };
    } else if (decision.state === 'EXPIRED') {
      msg = { tone: 'error', text: 'Your licence expired on ' + _fmt(decision.expiresAt)
        + '. You can still view, search and print everything — new entries and edits are paused until it is renewed.' };
    } else if (decision.state === 'SUSPENDED') {
      msg = { tone: 'error', text: 'This licence has been suspended. You can still view, search and print everything. Contact support to restore full access.' };
    } else if (decision.state === 'ACTIVE' && decision.daysRemaining !== null
               && decision.daysRemaining <= 30) {
      msg = { tone: 'info', text: 'Your licence expires on ' + _fmt(decision.expiresAt)
        + ' — ' + decision.daysRemaining + ' day' + (decision.daysRemaining === 1 ? '' : 's') + ' left.' };
    }
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
}

// ── Boot ────────────────────────────────────────────────────────────────────

function _apply(decision) {
  _enforcement = decision || null;
  try { _renderBanner(_enforcement); } catch (e) { console.error('[licence] banner:', e); }
  try { _applyReadOnly(isReadOnly()); } catch (e) { console.error('[licence] readonly:', e); }
  try { applyFeaturesToChrome(); } catch (e) { console.error('[licence] features:', e); }
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
