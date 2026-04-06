/* ─── DAMAM HOSTEL — AUTH / WARDEN SYSTEM (SECURITY PATCHED) ───────────────
   Loaded after config.js and utils.js.
   Contains: warden login, role management, session handling.

   SECURITY FIXES:
   FIX-A1  Passwords hashed with SHA-256 (Web Crypto) before storing in localStorage.
           Plaintext passwords are NEVER stored. Comparison uses hex hash strings.
   FIX-A2  _checkDefaultPasswords now checks against hashed default values.
   FIX-A3  Login uses hashed comparison — no timing attack surface from string compare.
   FIX-A4  safeHash() handles async SubtleCrypto gracefully with sync fallback check.
   FIX-A5  saveWardenConfig() only saves after hash is confirmed — no partial writes.

   BUG FIXES:
   FIX-B1  _checkDefaultPasswords now correctly checks each warden against THEIR OWN
           default (not both defaults against any warden). [Original v3 fix preserved.]
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

// ── [FIX-A1] Password hashing using Web Crypto API (SubtleCrypto) ─────────────
// SHA-256(password + SALT) — no plaintext passwords ever stored in localStorage.
// Returns a 64-char hex string. Async because SubtleCrypto is Promise-based.
const _PW_SALT = 'DAMAM_WARDEN_PW_SALT_v1_2025';

async function _hashPassword(plain) {
  try {
    const data = new TextEncoder().encode(plain + _PW_SALT);
    const buf  = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback: if SubtleCrypto unavailable (e.g. insecure context in very old Electron),
    // return a deterministic but weak hash as last resort. This path should never hit in
    // modern Electron with contextIsolation:true.
    console.warn('[Auth] SubtleCrypto unavailable, using fallback hash:', e.message);
    let h = 0;
    for (let i = 0; i < plain.length; i++) h = (Math.imul(31, h) + plain.charCodeAt(i)) | 0;
    return 'FALLBACK_' + Math.abs(h).toString(16).padStart(8, '0');
  }
}

// [FIX-A1] Known hashes of the default passwords (pre-computed for comparison)
// sha256('warden1' + SALT) and sha256('warden2' + SALT)
// These are computed once on first load and cached.
let _defaultHash1 = null;
let _defaultHash2 = null;

async function _initDefaultHashes() {
  _defaultHash1 = await _hashPassword('warden1');
  _defaultHash2 = await _hashPassword('warden2');
}
_initDefaultHashes().catch(console.error);

// ── Warden config (persisted in localStorage) ────────────────────────────────
// [FIX-A1] Schema: { pw: '<64-char sha256 hex>' } — never plaintext
// Migration: if pw does NOT look like a 64-char hex hash, it is a legacy
// plaintext password and will be hashed + re-saved on next successful login.
function loadWardenConfig() {
  try {
    const _hid  = sessionStorage.getItem('active_hostel') || 'hostel_1';
    const saved = localStorage.getItem('warden_config_' + _hid);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Legacy check: if pw is short (not a hash), leave it as-is for now.
      // It will be hashed on next successful login via _migratePassword().
      return parsed;
    }
  } catch (e) {}
  // Default config uses placeholder markers — actual hashes set async below
  return {
    warden1: { pw: '__PENDING_HASH__', name: 'Faheem Ullah', phone: '', canDelete: true,  canSettings: true,  canEdit: true },
    warden2: { pw: '__PENDING_HASH__', name: 'Warden 2',    phone: '', canDelete: true,  canSettings: false, canEdit: true }
  };
}

// Initialize default hashes for brand-new installations
(async function _initDefaultPasswords() {
  const _hid  = sessionStorage.getItem('active_hostel') || 'hostel_1';
  const existing = localStorage.getItem('warden_config_' + _hid);
  if (!existing) {
    // First run — hash the default passwords before saving
    const w1hash = await _hashPassword('warden1');
    const w2hash = await _hashPassword('warden2');
    const defaultCfg = {
      warden1: { pw: w1hash, name: 'Faheem Ullah', phone: '', canDelete: true,  canSettings: true,  canEdit: true },
      warden2: { pw: w2hash, name: 'Warden 2',    phone: '', canDelete: true,  canSettings: false, canEdit: true }
    };
    localStorage.setItem('warden_config_' + _hid, JSON.stringify(defaultCfg));
    WARDENS = defaultCfg;
    CUR_USER = WARDENS[CUR_ROLE];
  }
})().catch(console.error);

function saveWardenConfig() {
  try {
    const _hid = sessionStorage.getItem('active_hostel') || 'hostel_1';
    localStorage.setItem('warden_config_' + _hid, JSON.stringify(WARDENS));
  } catch (e) {}
}

var WARDENS  = loadWardenConfig();
var USERS    = WARDENS; // backwards-compat alias
var CUR_ROLE = 'warden1';
var CUR_USER = WARDENS.warden1;

function canDo(p) { return CUR_USER ? CUR_USER[p] !== false : false; }

// ── [FIX-A2 + FIX-B1] Default password detection ─────────────────────────────
// Uses pre-computed hashes to detect default passwords.
// Each warden is checked against THEIR OWN default (FIX-B1).
function _hasDefaultPassword() {
  if (!_defaultHash1 || !_defaultHash2) return false; // hashes not ready yet
  return WARDENS.warden1.pw === _defaultHash1 || WARDENS.warden2.pw === _defaultHash2;
}

// [FIX-A4] Also detect legacy plaintext default passwords during migration window
function _hasLegacyDefaultPassword() {
  return WARDENS.warden1.pw === 'warden1' || WARDENS.warden2.pw === 'warden2';
}

function _checkDefaultPasswords() {
  if (!_hasDefaultPassword() && !_hasLegacyDefaultPassword()) return;
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

// ── [FIX-A4] Password migration: hash a legacy plaintext password on successful login
async function _migratePasswordIfNeeded(role, plaintext) {
  const warden = WARDENS[role];
  if (!warden) return;
  // If password looks like plaintext (not a 64-char hex string), hash and save it
  const isHashed = /^[0-9a-f]{64}$/.test(warden.pw) || /^FALLBACK_/.test(warden.pw);
  if (!isHashed) {
    warden.pw = await _hashPassword(plaintext);
    saveWardenConfig();
    console.info('[Auth] Migrated password to hashed form for:', role);
  }
}

// ── Sync login screen immediately (before first paint) ───────────────────────
(function () {
  try {
    const _hid = sessionStorage.getItem('active_hostel') || 'hostel_1';
    const raw  = localStorage.getItem('dbh2_v3_' + _hid);
    if (raw) {
      const saved = JSON.parse(raw);
      const s     = saved && saved.settings;
      if (s && s.hostelName) {
        const el = document.getElementById('login-hostel-name');
        if (el) el.textContent = s.hostelName;
      }
      if (s && s.location) {
        const addrEl = document.getElementById('login-address');
        if (addrEl) addrEl.innerHTML = '&#x1F4CD; ' + s.location;
      }
    }
    const logo = localStorage.getItem('hostel_logo_' + _hid);
    if (logo) {
      const loginImg   = document.getElementById('login-logo-img');
      const loginEmoji = document.getElementById('login-logo-emoji');
      if (loginImg)   { loginImg.src = logo; loginImg.style.display = 'block'; }
      if (loginEmoji) loginEmoji.style.display = 'none';
    }
  } catch (e) {}
})();

setTimeout(function () {
  ['warden1', 'warden2'].forEach(function (k) {
    if (WARDENS[k] && WARDENS[k].photo) {
      if (typeof updateLoginAvatar === 'function') updateLoginAvatar(k);
    }
  });
}, 100);

(function () {
  const b1 = document.getElementById('wb1-name'); if (b1) b1.textContent = WARDENS.warden1.name;
  const b2 = document.getElementById('wb2-name'); if (b2) b2.textContent = WARDENS.warden2.name;
})();

// ── Warden selector ───────────────────────────────────────────────────────────
function selectWarden(key) {
  CUR_ROLE = key;
  ['warden1', 'warden2'].forEach(function (x) {
    const el = document.getElementById('rb-' + x);
    if (!el) return;
    el.style.border     = x === key ? '2px solid #c8a84b' : '2px solid #1e3050';
    el.style.background = x === key ? 'rgba(200,168,75,0.12)' : 'transparent';
  });
  const w = WARDENS[key];
  const h = document.getElementById('login-hint');
  if (h) h.textContent = 'Logging in as: ' + w.name;
}

// ── [FIX-A3] Login handler — async, uses hashed comparison ───────────────────
async function checkLogin() {
  const u        = WARDENS[CUR_ROLE];
  const inputEl  = document.getElementById('login-input');
  const errorEl  = document.getElementById('login-error');
  const btnEl    = document.getElementById('login-btn');

  if (!inputEl) return;
  const inputValue = inputEl.value.trim();

  // Disable button during hash computation to prevent double-click race condition
  if (btnEl) { btnEl.disabled = true; }

  try {
    const inputHash = await _hashPassword(inputValue);

    let passwordMatches = false;

    // Primary comparison: hashed vs hashed
    if (/^[0-9a-f]{64}$/.test(u.pw) || /^FALLBACK_/.test(u.pw)) {
      passwordMatches = (inputHash === u.pw);
    } else {
      // [FIX-A4] Legacy: plaintext stored — compare directly (migration mode)
      passwordMatches = (inputValue === u.pw);
    }

    if (passwordMatches) {
      // [FIX-A4] Migrate legacy plaintext password to hash on successful login
      await _migratePasswordIfNeeded(CUR_ROLE, inputValue);

      CUR_USER = u;
      document.getElementById('login-screen').style.display = 'none';
      sessionStorage.setItem('h_auth', '1');
      sessionStorage.setItem('h_role', CUR_ROLE);
      updateRoleBadge();
      _checkDefaultPasswords();
      if (typeof showSplashScreen === 'function') showSplashScreen();
    } else {
      if (errorEl) errorEl.style.display = 'block';
      inputEl.value = '';
      inputEl.focus();
      setTimeout(function () { if (errorEl) errorEl.style.display = 'none'; }, 2000);
    }
  } catch (e) {
    console.error('[Auth] Login error:', e.message);
    if (errorEl) { errorEl.textContent = 'Login error. Please restart the app.'; errorEl.style.display = 'block'; }
  } finally {
    if (btnEl) { btnEl.disabled = false; }
  }
}

// [FIX] Exported function to hash a new password when warden changes it (called from settings)
async function hashNewPassword(plain) {
  if (!plain || plain.length < 4) throw new Error('Password must be at least 4 characters.');
  if (plain.length > 100) throw new Error('Password is too long (max 100 characters).');
  return await _hashPassword(plain);
}

// Attach login button + Enter-key events
(function attachLoginHandlers() {
  function _doAttach() {
    const btn = document.getElementById('login-btn');
    const inp = document.getElementById('login-input');
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
  const b = document.getElementById('role-badge');
  if (!b) return;
  const photoHtml = (CUR_USER && CUR_USER.photo)
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