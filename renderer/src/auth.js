/* ─── DAMAM HOSTEL — AUTH / WARDEN SYSTEM ───────────────────────────────────
   Loaded after config.js and utils.js.
   Contains: warden login, role management, session handling.

   BUG FIX (v3): _checkDefaultPasswords now checks the correct pairing:
     warden1.pw === 'warden1'  OR  warden2.pw === 'warden2'
   Previous code incorrectly checked any warden against both default strings.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

// ── Warden config (persisted in localStorage) ────────────────────────────────
function loadWardenConfig() {
  try {
    var _hid  = sessionStorage.getItem('active_hostel') || 'hostel_1';
    var saved = localStorage.getItem('warden_config_' + _hid);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return {
    warden1: { pw: 'warden1', name: 'Faheem Ullah', phone: '', canDelete: true,  canSettings: true,  canEdit: true },
    warden2: { pw: 'warden2', name: 'Warden 2',    phone: '', canDelete: true,  canSettings: false, canEdit: true }
  };
}

function saveWardenConfig() {
  try {
    var _hid = sessionStorage.getItem('active_hostel') || 'hostel_1';
    localStorage.setItem('warden_config_' + _hid, JSON.stringify(WARDENS));
  } catch (e) {}
}

var WARDENS  = loadWardenConfig();
var USERS    = WARDENS; // backwards-compat alias — do not remove
var CUR_ROLE = 'warden1';
var CUR_USER = WARDENS.warden1;

function canDo(p) { return CUR_USER ? CUR_USER[p] !== false : false; }

// ── Default password detection (BUG FIX v3) ──────────────────────────────────
// Each warden is checked against THEIR OWN default, not both defaults.
function _hasDefaultPassword() {
  return WARDENS.warden1.pw === 'warden1' || WARDENS.warden2.pw === 'warden2';
}

function _checkDefaultPasswords() {
  if (!_hasDefaultPassword()) return;
  if (sessionStorage.getItem('pw_warned')) return;
  sessionStorage.setItem('pw_warned', '1');
  setTimeout(function () {
    if (typeof toast === 'function') {
      toast(
        '⚠️ Security: One or more wardens are using default passwords. ' +
        'Please change them in Settings → Wardens.',
        'error',
        8000
      );
    }
  }, 2000);
}

// ── Sync login screen immediately (before first paint) ───────────────────────
(function () {
  try {
    var _hid = sessionStorage.getItem('active_hostel') || 'hostel_1';
    var raw  = localStorage.getItem('dbh2_v3_' + _hid);
    if (raw) {
      var saved = JSON.parse(raw);
      var s     = saved && saved.settings;
      if (s && s.hostelName) {
        var el = document.getElementById('login-hostel-name');
        if (el) el.textContent = s.hostelName;
      }
      if (s && s.location) {
        var addrEl = document.getElementById('login-address');
        if (addrEl) addrEl.innerHTML = '&#x1F4CD; ' + s.location;
      }
    }
    var logo = localStorage.getItem('hostel_logo_' + _hid);
    if (logo) {
      var loginImg   = document.getElementById('login-logo-img');
      var loginEmoji = document.getElementById('login-logo-emoji');
      if (loginImg)   { loginImg.src = logo; loginImg.style.display = 'block'; }
      if (loginEmoji) loginEmoji.style.display = 'none';
    }
  } catch (e) {}
})();

// Apply saved profile photos to login screen cards
setTimeout(function () {
  ['warden1', 'warden2'].forEach(function (k) {
    if (WARDENS[k] && WARDENS[k].photo) {
      if (typeof updateLoginAvatar === 'function') updateLoginAvatar(k);
    }
  });
}, 100);

// Update warden name buttons
(function () {
  var b1 = document.getElementById('wb1-name'); if (b1) b1.textContent = WARDENS.warden1.name;
  var b2 = document.getElementById('wb2-name'); if (b2) b2.textContent = WARDENS.warden2.name;
})();

// ── Warden selector ───────────────────────────────────────────────────────────
function selectWarden(key) {
  CUR_ROLE = key;
  ['warden1', 'warden2'].forEach(function (x) {
    var el = document.getElementById('rb-' + x);
    if (!el) return;
    el.style.border     = x === key ? '2px solid #c8a84b' : '2px solid #1e3050';
    el.style.background = x === key ? 'rgba(200,168,75,0.12)' : 'transparent';
  });
  var w = WARDENS[key];
  var h = document.getElementById('login-hint');
  if (h) h.textContent = 'Logging in as: ' + w.name;
}

// ── Login handler ─────────────────────────────────────────────────────────────
function checkLogin() {
  var u = WARDENS[CUR_ROLE];
  if (document.getElementById('login-input').value.trim() === u.pw) {
    CUR_USER = u;
    document.getElementById('login-screen').style.display = 'none';
    sessionStorage.setItem('h_auth', '1');
    sessionStorage.setItem('h_role', CUR_ROLE);
    updateRoleBadge();
    _checkDefaultPasswords();
    if (typeof showSplashScreen === 'function') showSplashScreen();
  } else {
    var e = document.getElementById('login-error');
    e.style.display = 'block';
    document.getElementById('login-input').value = '';
    document.getElementById('login-input').focus();
    setTimeout(function () { e.style.display = 'none'; }, 2000);
  }
}

// Attach login button + Enter-key events
(function attachLoginHandlers() {
  function _doAttach() {
    var btn = document.getElementById('login-btn');
    var inp = document.getElementById('login-input');
    if (btn) btn.addEventListener('click', checkLogin);
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkLogin(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _doAttach);
  } else {
    _doAttach();
  }
})();

// ── Role badge (header) ───────────────────────────────────────────────────────
function updateRoleBadge() {
  var b = document.getElementById('role-badge');
  if (!b) return;
  var photoHtml = (CUR_USER && CUR_USER.photo)
    ? '<img src="' + CUR_USER.photo + '" style="width:22px;height:22px;border-radius:6px;object-fit:cover;border:1.5px solid rgba(200,168,75,0.5);flex-shrink:0">'
    : '<span style="font-size:14px">&#x1F9D1;&#x200D;&#x1F4BC;</span>';
  b.innerHTML      = photoHtml + '&nbsp;' + escHtml(CUR_USER ? CUR_USER.name : '');
  b.style.display  = 'flex';
  b.style.alignItems = 'center';
  b.style.gap      = '6px';
}

function logout() {
  sessionStorage.removeItem('h_auth');
  sessionStorage.removeItem('h_role');
  location.reload();
}

// ── Restore session on reload ─────────────────────────────────────────────────
var _sr = sessionStorage.getItem('h_role') || 'warden1';
if (!WARDENS[_sr]) _sr = 'warden1';
CUR_ROLE = _sr;
CUR_USER = WARDENS[_sr];

if (sessionStorage.getItem('h_auth') === '1') {
  document.getElementById('login-screen').style.display = 'none';
  selectWarden(_sr);
  setTimeout(updateRoleBadge, 300);
  setTimeout(_checkDefaultPasswords, 2500);
} else {
  selectWarden('warden1');
}
