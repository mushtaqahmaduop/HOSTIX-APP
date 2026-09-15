/* ─── HOSTYLLO — AUTH SYSTEM v2.0 ────────────────────────────────────────
   Requires: config.js, utils.js (escHtml, toast).
 
   SECURITY MODEL:
   • PBKDF2-SHA256 (100 000 iterations, 16-byte random salt per password)
   • 32-byte cryptographically-random session token (never "1")
   • Constant-time password comparison — no timing leaks
   • 5-attempt lockout with 5-minute cooldown
   • 8-hour hard session TTL + 30-minute idle auto-logout
   • Smooth v1 (SHA-256) → v2 (PBKDF2) migration on first login
   ─────────────────────────────────────────────────────────────────────────── */
 
'use strict';
 
// ─────────────────────────────────────────────────────────────────────────────
// 0.  TUNABLES
// ─────────────────────────────────────────────────────────────────────────────
const AUTH_CFG = Object.freeze({
  version:       '2.0',
  pbkdf2Iter:    100_000,
  pbkdf2Hash:    'SHA-256',
  saltBytes:     16,
  tokenBytes:    32,
  sessionTTL:    8  * 60 * 60 * 1000,   // 8 h  — full warden shift
  idleTimeout:   30 * 60 * 1000,        // 30 min idle → auto-logout
  maxAttempts:   5,
  lockoutMs:     5  * 60 * 1000,        // 5 min lockout after max attempts
  minPwLen:      6,
  maxPwLen:      128,
});
 
// ─────────────────────────────────────────────────────────────────────────────
// 1.  STORAGE KEY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _hid()           { return sessionStorage.getItem('active_hostel') || 'hostel_1'; }
function _key(suffix)     { return `damam_auth_${_hid()}_${suffix}`; }
function _getJSON(k)      { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function _setJSON(k, v)   { localStorage.setItem(k, JSON.stringify(v)); }
function _ssGet(k)        { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } }
function _ssSet(k, v)     { sessionStorage.setItem(k, JSON.stringify(v)); }
function _ssDel(k)        { sessionStorage.removeItem(k); }
 
// ─────────────────────────────────────────────────────────────────────────────
// 2.  CRYPTO PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: all calls below use `window.crypto` explicitly (never the bare
// `crypto` identifier). Something else loaded on this page declares a
// top-level `let/const/var crypto`, which shadows the real window.crypto
// for every later <script> tag. Using window.crypto. sidesteps that
// shadowing entirely, regardless of what else is on the page.
 
/** Cryptographically-random hex string of `byteLen` bytes. */
function _randomHex(byteLen) {
  const buf = window.crypto.getRandomValues(new Uint8Array(byteLen));
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}
 
/** Convert a hex string back to a Uint8Array. */
function _hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g), h => parseInt(h, 16));
}
 
/**
 * PBKDF2-SHA256 key derivation.
 * Returns a 64-char hex string (256 bits).
 */
async function _pbkdf2(plain, saltHex) {
  const enc    = new TextEncoder();
  const keyMat = await window.crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits   = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: AUTH_CFG.pbkdf2Hash, salt: _hexToBytes(saltHex), iterations: AUTH_CFG.pbkdf2Iter },
    keyMat, 256
  );
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}
 
/**
 * Hash a plaintext password.
 * Returns { hash, salt, v } — all three must be stored together.
 */
async function hashPassword(plain) {
  const salt = _randomHex(AUTH_CFG.saltBytes);
  const hash = await _pbkdf2(plain, salt);
  return { hash, salt, v: AUTH_CFG.version };
}
 
/**
 * Verify a plaintext password against a stored credential object.
 * Accepts v2 (PBKDF2) and v1 (SHA-256 hex string) formats.
 * Always uses constant-time comparison.
 */
async function verifyPassword(plain, stored) {
  // v2 — PBKDF2
  if (stored && typeof stored === 'object' && stored.v === '2.0') {
    const candidate = await _pbkdf2(plain, stored.salt);
    return _ctEqual(candidate, stored.hash);
  }
  // v1 — bare SHA-256 hex string (migration path)
  if (typeof stored === 'string' && /^[0-9a-f]{64}$/.test(stored)) {
    const candidate = await _sha256v1(plain);
    return _ctEqual(candidate, stored);
  }
  // RESCUE — a raw plaintext password got stored by an older buggy change-password
  // modal (it skipped hashing). Such installs are otherwise locked out completely.
  // Accept a direct match here; checkLogin's _migrateIfNeeded() immediately re-hashes
  // it to PBKDF2 v2, so the plaintext exists only until the next successful login.
  if (typeof stored === 'string' && stored.length > 0) {
    return _ctEqual(plain, stored);
  }
  return false;
}
 
/** Constant-time string comparison — prevents timing side-channel attacks. */
function _ctEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
 
// v1 legacy hash (SHA-256 + static salt) — migration only, never for new passwords
const _V1_SALT = 'DAMAM_WARDEN_PW_SALT_v1_2025';
async function _sha256v1(plain) {
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain + _V1_SALT));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 3.  USER CONFIG
//
// Was a fixed two-warden map (warden1 / warden2). It is now an open list of
// users, each with its own username and its own permission set. The storage
// key is unchanged so existing installs upgrade in place — see _migrateUsers().
// ─────────────────────────────────────────────────────────────────────────────

/** Every permission the app enforces. Order is the order shown in the UI.
 *
 *  ADD AND EDIT ARE TWO PERMISSIONS SINCE 2026-09-10 (owner: "add edit records
 *  option to the permissions vith user add nev user and make it end to end").
 *  They were one, labelled "Add & edit records", which meant a hostel could not
 *  say the thing it most often wants to say: that a junior warden may admit a
 *  student at the desk but may not go back and change a record that already
 *  exists. `delete` was already its own key for exactly that reason; this is
 *  the same distinction one step earlier.
 *
 *  `edit` KEEPS ITS KEY, so no stored account loses anything: an install where
 *  a warden could edit still has `edit:true` on that account, and _migrateUsers
 *  grants the new `add` from it rather than from the blanket "grant new keys to
 *  everyone" rule, which would have handed adding to a warden explicitly
 *  denied it. */
const PERMS = [
  { key: 'add',      label: 'Add records',          hint: 'Admit students, create rooms and expenses' },
  { key: 'edit',     label: 'Edit records',         hint: 'Change students, rooms and expenses already on file' },
  { key: 'delete',   label: 'Delete records',       hint: 'Remove students, payments and rooms' },
  { key: 'payments', label: 'Collect payments',     hint: 'Record and edit payments' },
  { key: 'reports',  label: 'View reports',         hint: 'Reports page and PDF exports' },
  { key: 'backup',   label: 'Backup & restore',     hint: 'Export and import the database' },
  { key: 'settings', label: 'Change settings',      hint: 'Hostel details, room types, rent' },
  { key: 'users',    label: 'Manage users',         hint: 'Add users and set permissions' },
];
const PERM_KEYS = PERMS.map(p => p.key);

/**
 * Password a brand-new install seeds its built-in account with.
 *
 * Installs created before this was introduced seeded the account's own username
 * as its password instead, so both count as "default" for the weak-password
 * warning in checkDefaultPasswords().
 */
const DEFAULT_PASSWORD = 'admin123';

/** A brand-new install starts with one full-access account. */
const _DEFAULT_META = {
  warden1: {
    username: 'warden1', name: 'Hostyllo', phone: '',
    perms: Object.fromEntries(PERM_KEYS.map(k => [k, true])),
    active: true, builtin: true,
  },
};

/**
 * Bring a stored config up to the current shape.
 *
 * Existing installs hold `{ warden1:{name,phone,canEdit,canDelete,canSettings,pw,photo}, warden2:{...} }`.
 * Two rules govern this migration, because getting it wrong locks a paying
 * hostel out of its own data:
 *   1. `pw` is never touched — their current password must keep working.
 *   2. Access is never silently reduced. The old canEdit/canDelete/canSettings
 *      flags were declared but never actually checked, so every existing user
 *      effectively had full access. Anything not covered by an old flag is
 *      therefore granted, not denied.
 * Returns true if anything changed and the config needs saving.
 */
function _migrateUsers(cfg) {
  let changed = false;
  for (const [id, u] of Object.entries(cfg)) {
    if (!u || typeof u !== 'object') continue;

    if (!u.username) { u.username = id; changed = true; }
    if (u.active === undefined) { u.active = true; changed = true; }

    if (!u.perms) {
      u.perms = {
        // One old flag, two keys — canEdit covered both halves.
        add:      u.canEdit     !== false,
        edit:     u.canEdit     !== false,
        delete:   u.canDelete   !== false,
        settings: u.canSettings !== false,
        // Never enforced before, so everyone keeps them.
        payments: true, reports: true, backup: true,
        // Only an account that could already reach settings inherits user
        // management — otherwise every warden could grant themselves anything.
        users:    u.canSettings !== false,
      };
      changed = true;
    }
    /* `add` SPLIT OFF `edit` on 2026-09-10 and inherits from it, NOT from the
       blanket rule below. The blanket rule exists so a new permission never
       silently locks someone out, and it is right for a genuinely new
       capability — but adding records is not new here, it is half of one that
       already existed. Granting it to everyone would hand admitting students
       to a warden the hostel had explicitly denied editing. */
    if (u.perms.add === undefined && u.perms.edit !== undefined) {
      u.perms.add = u.perms.edit === true;
      changed = true;
    }
    // A later version may add a permission; grant it rather than silently deny.
    for (const k of PERM_KEYS) {
      if (u.perms[k] === undefined) { u.perms[k] = true; changed = true; }
    }
  }

  // There must always be at least one account that can manage users, or the
  // install becomes unadministrable.
  if (Object.keys(cfg).length && !Object.values(cfg).some(u => u?.perms?.users && u.active !== false)) {
    const first = Object.values(cfg)[0];
    first.perms.users = true;
    first.active = true;
    changed = true;
    console.warn('[Auth] No account could manage users; restored it on', first.username);
  }
  return changed;
}

/**
 * Load the user config from localStorage, or build it fresh on first run.
 * Default password on a fresh install = DEFAULT_PASSWORD. Only fresh installs
 * are affected — an existing install returns its stored config untouched above,
 * so no client's current password ever changes.
 */
async function _loadWardenConfig() {
  const existing = _getJSON(_key('wardens'));
  if (existing && typeof existing === 'object' && Object.keys(existing).length) {
    if (_migrateUsers(existing)) _setJSON(_key('wardens'), existing);
    return existing;
  }

  // First run — hash default passwords with PBKDF2
  const cfg = {};
  for (const [id, meta] of Object.entries(_DEFAULT_META)) {
    cfg[id] = { ...meta, pw: await hashPassword(DEFAULT_PASSWORD) };
  }
  _setJSON(_key('wardens'), cfg);
  return cfg;
}

function saveWardenConfig() {
  _setJSON(_key('wardens'), WARDENS);
}

/** Find a user id by username, case-insensitively. Returns the id or null. */
function findUserByUsername(username) {
  const want = String(username || '').trim().toLowerCase();
  if (!want) return null;
  for (const [id, u] of Object.entries(WARDENS)) {
    if (String(u?.username || id).toLowerCase() === want) return id;
  }
  return null;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 4.  BRUTE-FORCE PROTECTION
// ─────────────────────────────────────────────────────────────────────────────
function _attempts()          { return _getJSON(_key('attempts')) || {}; }
function _saveAttempts(data)  { _setJSON(_key('attempts'), data); }
 
/** Returns the lockout expiry timestamp if currently locked, or false. */
function _isLockedOut(role) {
  const entry = _attempts()[role];
  if (!entry?.lockedUntil) return false;
  if (Date.now() < entry.lockedUntil) return entry.lockedUntil;
  // Expired — clear it
  const data = _attempts();
  delete data[role];
  _saveAttempts(data);
  return false;
}
 
/** Record a failed attempt. Returns updated entry (with lockedUntil if just locked). */
function _recordFail(role) {
  const data  = _attempts();
  const entry = data[role] || { count: 0 };
  entry.count++;
  entry.lastFail = Date.now();
  if (entry.count >= AUTH_CFG.maxAttempts) {
    entry.lockedUntil = Date.now() + AUTH_CFG.lockoutMs;
    entry.count = 0; // reset counter so it restarts cleanly after unlock
  }
  data[role] = entry;
  _saveAttempts(data);
  return entry;
}
 
function _clearAttempts(role) {
  const data = _attempts();
  delete data[role];
  _saveAttempts(data);
}
 
function _remainingAttempts(role) {
  return AUTH_CFG.maxAttempts - (_attempts()[role]?.count || 0);
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 5.  SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
/*
 * REMEMBER ME.
 *
 * Owner's calls: 2026-08-30 added the box; 2026-09-15 narrowed it, after an
 * installed app kept opening with no password asked. What is remembered is
 * USERNAMES, never a session and never a password:
 *
 *   - Every launch asks for the password. The session lives in sessionStorage
 *     only, so closing the app ends it. (The 2026-08-30 version kept the
 *     session in localStorage for up to 8h, which is what let the app open
 *     straight in.)
 *   - The 8h sessionTTL and the 30min idle logout still bound a running app.
 *   - Each account that signs in with the box ticked goes to the front of this
 *     PC's list, and signing in unticked takes it off. "Switch account" on the
 *     login screen steps through that list and only ever fills the username;
 *     × in the username box forgets the name shown. See loginSwitchAccount().
 */
/* The usernames remembered on this PC, newest first. Older installs stored one
   name as { user }; that shape reads as a list of one. */
function _rememberedUsers() {
  const r = _getJSON(_key('remember'));
  if (!r) return [];
  const list = Array.isArray(r.users) ? r.users : (typeof r.user === 'string' ? [r.user] : []);
  return list
    .filter(u => typeof u === 'string' && u.trim())
    .filter((u, i, a) => a.findIndex(x => x.toLowerCase() === u.toLowerCase()) === i);
}
function _rememberedUser() { return _rememberedUsers()[0] || ''; }
function _saveRememberedUsers(list) {
  if (list.length) _setJSON(_key('remember'), { users: list, user: list[0] });
  else localStorage.removeItem(_key('remember'));
}

function _createSession(role, remember) {
  const now     = Date.now();
  const session = {
    token:      _randomHex(AUTH_CFG.tokenBytes),   // 64 hex chars = 256 bits of entropy
    role,
    name:       WARDENS[role].name,
    createdAt:  now,
    expiresAt:  now + AUTH_CFG.sessionTTL,
    lastActive: now,
  };
  // This run only. Nothing about the session is written where the next launch
  // can read it, so closing the app always ends it.
  _ssSet(_key('session'), session);
  localStorage.removeItem(_key('session'));
  const uname  = String(WARDENS[role].username || role);
  const others = _rememberedUsers().filter(u => u.toLowerCase() !== uname.toLowerCase());
  // Ticked: this username goes to the front. Unticked: it leaves the list — how
  // a warden revokes an earlier tick — and everyone else's name stays.
  _saveRememberedUsers(remember ? [uname].concat(others) : others);
  return session;
}

/** This run's session. */
function _getSession()  { return _ssGet(_key('session')); }

/**
 * End the session everywhere. The remembered USERNAME survives on purpose:
 * signing out should not make a warden retype who they are, only prove again
 * that they are them.
 */
function _killSession() {
  _ssDel(_key('session'));
  localStorage.removeItem(_key('session'));
}
 
/**
 * Validate the current session.
 * Returns the session object if valid, or null (and destroys the session).
 */
function _validateSession() {
  // sessionStorage only: a session a previous launch left in localStorage is
  // never restored, and _killSession() below clears it off the disk.
  const s = _ssGet(_key('session'));
  if (!s?.token) return null;
  const now = Date.now();
  if (now > s.expiresAt) { _killSession(); return null; }
  if (now - s.lastActive > AUTH_CFG.idleTimeout) { _killSession(); return null; }
  s.lastActive = now;
  _ssSet(_key('session'), s);
  return s;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 6.  IDLE TIMEOUT
// ─────────────────────────────────────────────────────────────────────────────
let _idleTimer = null;
 
function _resetIdle() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    _killSession();
    if (typeof toast === 'function') toast('Session expired due to inactivity.', 'info', 'Signed out');
    setTimeout(() => location.reload(), 1200);
  }, AUTH_CFG.idleTimeout);
}
 
function _startIdleTracking() {
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, _resetIdle, { passive: true });
  });
  _resetIdle();
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 7.  DEFAULT-PASSWORD CHECK
// ─────────────────────────────────────────────────────────────────────────────
async function _checkDefaultPasswords() {
  if (sessionStorage.getItem('pw_warned')) return;
  for (const [id, warden] of Object.entries(WARDENS)) {
    try {
      // Two passwords count as default: DEFAULT_PASSWORD (what fresh installs
      // seed today) and the account's own username (what older installs seeded).
      // Both populations exist in the field, so both must be warned about.
      // Checking the storage id instead of the username only worked while the
      // two were the same string, which stopped being true once users could be
      // added (their id is generated, e.g. u1a2b3c).
      const weak = [DEFAULT_PASSWORD, warden.username || id];
      let isWeak = false;
      for (const w of weak) {
        if (await verifyPassword(w, warden.pw)) { isWeak = true; break; }
      }
      if (warden.active !== false && isWeak) {
        sessionStorage.setItem('pw_warned', '1');
        setTimeout(() => {
          if (typeof toast === 'function') {
            // toast() is (msg, type, title) — the third arg used to be 8000,
            // meant as a duration, so this warning rendered with the literal
            // title "8000". There is no duration parameter to pass.
            toast(
              'One or more accounts are still using their default password. ' +
              'Change them in the account menu → Manage Users.',
              'error', 'Security'
            );
          }
        }, 2000);
        return;
      }
    } catch { /* ignore */ }
  }
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 8.  PASSWORD MIGRATION  (v1 SHA-256 → v2 PBKDF2)
// ─────────────────────────────────────────────────────────────────────────────
async function _migrateIfNeeded(role, plain) {
  const w  = WARDENS[role];
  if (!w)  return;
  const isV2 = w.pw && typeof w.pw === 'object' && w.pw.v === '2.0';
  if (isV2)  return;
  w.pw = await hashPassword(plain);
  saveWardenConfig();
  console.info('[Auth] Password migrated to PBKDF2 for:', role);
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 9.  UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _ui(id) { return document.getElementById(id); }
 
function _setLoginState(state, payload) {
  const btn  = _ui('login-btn');
  const err  = _ui('login-error');
  const inp  = _ui('login-input');
 
  const _showErr = (msg) => {
    if (!err) return;
    err.textContent   = msg;
    err.style.display = 'flex';
    setTimeout(() => { if (err) err.style.display = 'none'; }, 4000);
  };
 
  switch (state) {
 
    case 'loading':
      if (btn) { btn.disabled = true; btn.classList.add('loading'); }
      break;
 
    case 'success':
      if (btn) {
        btn.classList.remove('loading');
        btn.classList.add('success');
        btn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="20 6 9 17 4 12"/></svg>' +
          ' Welcome, ' + (typeof escHtml === 'function' ? escHtml(CUR_USER?.name || '') : (CUR_USER?.name || '')) + '!';
      }
      break;
 
    case 'error': {
      _showErr(payload || 'Incorrect password.');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.classList.add('error-shake');
        setTimeout(() => btn && btn.classList.remove('error-shake'), 500);
      }
      if (inp) { inp.value = ''; inp.focus(); }
      break;
    }
 
    case 'locked': {
      const mins = Math.ceil((payload - Date.now()) / 60_000);
      _showErr(`Account locked — ${mins} minute${mins !== 1 ? 's' : ''} remaining.`);
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
      break;
    }
 
    case 'reset':
      if (btn) { btn.disabled = false; btn.classList.remove('loading', 'success', 'error-shake'); }
      if (err) err.style.display = 'none';
      break;
  }
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 10. CORE LOGIN FLOW
// ─────────────────────────────────────────────────────────────────────────────
async function checkLogin() {
  const uinp = _ui('login-user');
  const inp  = _ui('login-input');
  if (!inp) return;
  const plain    = inp.value.trim();
  const typedUsr = uinp ? uinp.value.trim() : '';

  if (!typedUsr) { if (uinp) uinp.focus(); _setLoginState('error', 'Enter your username.'); return; }
  if (!plain)    { inp.focus(); return; }

  const id = findUserByUsername(typedUsr);

  // Lockout is keyed on what was typed, so hammering an unknown username is
  // rate-limited too and cannot be used to probe which accounts exist.
  const lockKey = id || ('~' + typedUsr.toLowerCase());
  const lockedUntil = _isLockedOut(lockKey);
  if (lockedUntil) {
    _setLoginState('locked', lockedUntil);
    return;
  }

  _setLoginState('loading');

  try {
    const warden = id ? WARDENS[id] : null;

    // Unknown username and wrong password fail identically — same message,
    // same lockout path — so the screen never reveals which accounts exist.
    const ok = !!warden && warden.active !== false && await verifyPassword(plain, warden.pw);

    if (ok) {
      // ── Successful login ──────────────────────────────────────────────────
      CUR_ROLE = id;
      _clearAttempts(lockKey);
      await _migrateIfNeeded(CUR_ROLE, plain);
      CUR_USER = WARDENS[CUR_ROLE];

      /* WHEN THIS ACCOUNT LAST SIGNED IN. Nothing recorded it before, so the
         User Management page had a Last sign-in column it could only fill with
         'never'. It is written here — after the password verified and before
         the screen goes — so a failed attempt never stamps one. */
      try {
        CUR_USER.lastLogin = new Date().toISOString();
        saveWardenConfig();
      } catch (e) { /* a stamp is never worth failing a sign-in for */ }

      const rememberEl = _ui('login-remember');
      _createSession(CUR_ROLE, !!(rememberEl && rememberEl.checked));
      _setLoginState('success');
 
      const screen = _ui('login-screen');
      if (screen) screen.classList.add('logging-in');
 
      setTimeout(() => {
        if (screen) screen.style.display = 'none';
        updateRoleBadge();
        applyPermissionsToChrome();
        /* Set the header for the page we are landing on. Login does not go
           through navigate(), so without this the title, the hostel name and
           the primary button keep index.html's placeholders until the warden
           clicks something in the rail. */
        if (typeof applyHeaderChrome === 'function') {
          try { applyHeaderChrome(typeof currentPage !== 'undefined' ? currentPage : 'dashboard'); }
          catch (e) { console.error('[chrome]', e); }
        }
        _startIdleTracking();
        _checkDefaultPasswords();
        // Anything raised while the login screen was up has been held; the app
        // is visible now, so it has somewhere to land.
        if (typeof flushToastQueue === 'function') flushToastQueue();
        if (typeof startChromeClock === 'function') startChromeClock();
        if (typeof showSplashScreen === 'function') showSplashScreen();
        /* First-run setup, after activation and after login -- never mid-session
           and never over a hostel that already has data. maybeRunSetup() decides;
           see needsSetup() in onboarding.js for why the flag alone is not enough. */
        if (typeof maybeRunSetup === 'function') maybeRunSetup();
      }, 420);
 
    } else {
      // ── Failed attempt ────────────────────────────────────────────────────
      const entry = _recordFail(lockKey);
      if (entry.lockedUntil) {
        _setLoginState('locked', entry.lockedUntil);
      } else {
        const rem = _remainingAttempts(lockKey);
        _setLoginState('error',
          `Incorrect username or password. ${rem} attempt${rem !== 1 ? 's' : ''} remaining.`);
      }
    }
 
  } catch (e) {
    console.error('[Auth] Login error:', e);
    _setLoginState('error', 'Login error — please restart the app.');
  }
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 11. PUBLIC API  (called from settings, etc.)
// ─────────────────────────────────────────────────────────────────────────────
 
/** Hash a new password for storage. Call from the settings page when a warden changes their PW. */
async function hashNewPassword(plain) {
  if (!plain || plain.length < AUTH_CFG.minPwLen)
    throw new Error(`Password must be at least ${AUTH_CFG.minPwLen} characters.`);
  if (plain.length > AUTH_CFG.maxPwLen)
    throw new Error(`Password is too long (max ${AUTH_CFG.maxPwLen} characters).`);
  return await hashPassword(plain); // { hash, salt, v }
}
 
/**
 * Permission check — the single gate the whole app asks.
 *
 * Reads the user's own permission set. Fails CLOSED: no session, no user, or
 * an unknown permission name all deny. The old version read CUR_USER[p] and
 * defaulted to allow, which is why nothing was ever actually restricted.
 */
function canDo(p) {
  if (!CUR_USER || !CUR_USER.perms) return false;
  return CUR_USER.perms[p] === true;
}

/**
 * Gate an action at its entry point. Returns true if allowed; otherwise tells
 * the user why and returns false, so callers read as:
 *   if (!requirePerm('delete')) return;
 */
function requirePerm(p) {
  if (canDo(p)) return true;
  const label = (PERMS.find(x => x.key === p) || {}).label || p;
  if (typeof toast === 'function') {
    toast('Your account does not have permission to: ' + label.toLowerCase() +
          '. Ask an administrator.', 'error', 'Not permitted');
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. USER-AWARE UI
//
// The two-card warden picker is gone — login is username + password, so the
// screen no longer advertises the staff list. Kept as a no-op-safe helper
// because the boot path and older call sites still reference it.
// ─────────────────────────────────────────────────────────────────────────────
function selectWarden(key) {
  if (!key || !WARDENS[key]) return;
  CUR_ROLE = key;
}

/**
 * Show or hide chrome the current user may not use. Called after login and on
 * every session restore. UI-level enforcement — an offline single-machine app
 * has no server to enforce against, so this is the honest boundary: it stops
 * staff from using what they should not, not a determined attacker with the
 * machine and devtools.
 */
function applyPermissionsToChrome() {
  const show = (id, ok) => { const el = _ui(id); if (el) el.style.display = ok ? '' : 'none'; };
  const showNav = (page, ok) => {
    document.querySelectorAll('.nav-item[data-page="' + page + '"]').forEach(el => {
      el.style.display = ok ? '' : 'none';
    });
  };
  showNav('settings', canDo('settings'));
  showNav('backup',   canDo('backup'));
  showNav('reports',  canDo('reports'));
  // Annual Archive is gated on 'reports' — same as the page-level check in
  // nav.js renderPage(). Keep the two in step or the rail offers a page that
  // then refuses to render.
  showNav('archive',  canDo('reports'));
  // Settings is no longer in the account menu — showNav('settings') above is
  // the only gate it needs now that the rail item is the single entry point.

  // Features LAST, and this order is load-bearing. Every showNav() above sets
  // display back to '' for anything the user is permitted, which would
  // un-hide a rail item the hostel's licence does not include. Permissions
  // decide what this warden may reach; features decide what exists at all.
  if (typeof applyFeaturesToChrome === 'function') {
    try { applyFeaturesToChrome(); } catch (e) { console.error('[features]', e); }
  }
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 13. ROLE BADGE
// ─────────────────────────────────────────────────────────────────────────────
function updateRoleBadge() {
  const b = _ui('role-badge');
  if (!b) return;
  const safe = typeof escHtml === 'function' ? escHtml : (s) => s;
  const photo = CUR_USER?.photo
    ? `<img src="${CUR_USER.photo}" style="width:22px;height:22px;border-radius:6px;object-fit:cover;border:1.5px solid rgba(37,99,235,.5);flex-shrink:0">`
    : (typeof icon === 'function' ? icon('warden', 'sm') : '');
  b.innerHTML  = `${photo}&nbsp;${safe(CUR_USER?.name || '')}`;
  b.style.cssText = 'display:flex;align-items:center;gap:6px;';
  // Chrome v5: the warden's identity now lives in the header user chip and the
  // sidebar user card. #role-badge is kept (and kept hidden by chrome.css) so
  // the existing showUserMgmt() entry point is undisturbed.
  if (typeof refreshChromeUser === 'function') refreshChromeUser();
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 14. LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
function logout() {
  _killSession();
  clearTimeout(_idleTimer);
  location.reload();
}

/* ── SWITCH ACCOUNT (owner, 2026-09-15) ─────────────────────────────────────
   Steps through the usernames remembered on this PC. It only ever fills the
   username: the password box is emptied and focused, so whoever is switching
   still types their own password. Shown while Remember me is ticked and more
   than one name is remembered. × in the username box forgets the name shown,
   on this PC only — the account itself is not touched. */
function loginPaintRemembered() {
  const list   = _rememberedUsers();
  const uinp   = _ui('login-user');
  const box    = _ui('login-remember');
  const swap   = _ui('login-swap');
  const forget = _ui('login-forget');
  const typed  = uinp ? uinp.value.trim().toLowerCase() : '';
  const known  = !!typed && list.some(u => u.toLowerCase() === typed);
  if (swap)   swap.hidden   = !(box && box.checked && list.length > 1);
  if (forget) forget.hidden = !known;
}

function loginSwitchAccount() {
  const list = _rememberedUsers();
  const uinp = _ui('login-user');
  const pinp = _ui('login-input');
  if (!uinp || list.length < 2) return;
  const at = list.findIndex(u => u.toLowerCase() === uinp.value.trim().toLowerCase());
  uinp.value = list[(at + 1) % list.length];
  if (pinp) { pinp.value = ''; pinp.type = 'password'; pinp.focus(); }
  _setLoginState('reset');
  loginPaintRemembered();
}

function loginForgetUser() {
  const uinp = _ui('login-user');
  const pinp = _ui('login-input');
  if (!uinp) return;
  const name = uinp.value.trim().toLowerCase();
  const rest = _rememberedUsers().filter(u => u.toLowerCase() !== name);
  _saveRememberedUsers(rest);
  uinp.value = rest[0] || '';
  if (pinp) pinp.value = '';
  const box = _ui('login-remember');
  if (box && !rest.length) box.checked = false;
  loginPaintRemembered();
  ((rest.length && pinp) ? pinp : uinp).focus();
}
 
// ─────────────────────────────────────────────────────────────────────────────
// 15. LOGIN SCREEN — BRANDING SYNC  (runs before first paint)
// ─────────────────────────────────────────────────────────────────────────────
;(function _syncBranding() {
  try {
    const raw = localStorage.getItem('dbh2_v3_' + _hid());
    if (raw) {
      const { settings: s } = JSON.parse(raw);
      const el   = _ui('login-hostel-name');
      const addr = _ui('login-address');
      if (el   && s?.hostelName) el.textContent = s.hostelName;
      if (addr && s?.location)   addr.innerHTML  = (typeof icon === 'function' ? icon('pin', 'xs') : '') + ' ' + s.location;
    }
    const logo = localStorage.getItem('hostel_logo_' + _hid());
    if (logo) {
      const img   = _ui('login-logo-img');
      const emoji = _ui('login-logo-emoji');
      if (img)   { img.src = logo; img.style.display = 'block'; }
      if (emoji) emoji.style.display = 'none';
    }
  } catch { /* non-fatal */ }
})();
 
// ─────────────────────────────────────────────────────────────────────────────
// 16. EVENT BINDING
// ─────────────────────────────────────────────────────────────────────────────
;(function _attachLoginHandlers() {
  function _bind() {
    const btn = _ui('login-btn');
    const inp = _ui('login-input');
    if (btn) btn.addEventListener('click', checkLogin);
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') checkLogin(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bind);
  else _bind();
})();
 
// ─────────────────────────────────────────────────────────────────────────────
// 17. ASYNC BOOT  — single authoritative startup sequence
// ─────────────────────────────────────────────────────────────────────────────
var WARDENS  = {};
var USERS    = WARDENS;   // backwards-compat alias
var CUR_ROLE = 'warden1';
var CUR_USER = null;
 
;(async function _boot() {
 
  // 1. Load (or initialise) warden config
  WARDENS = await _loadWardenConfig();
  USERS   = WARDENS;
 
  // 2. Attempt session restore. The login screen no longer names any account,
  //    so there is nothing to pre-populate before this point.
  const session = _validateSession();

  if (session && WARDENS[session.role] && WARDENS[session.role].active !== false) {
    // ── Valid existing session — skip login screen ─────────────────────────
    CUR_ROLE = session.role;
    CUR_USER = WARDENS[session.role];
    const screen = _ui('login-screen');
    if (screen) screen.style.display = 'none';
    setTimeout(updateRoleBadge,        300);
    setTimeout(applyPermissionsToChrome, 320);
    setTimeout(_checkDefaultPasswords, 2500);
    // The login screen is hidden immediately on this path, but the boot timers
    // can still fire before it is, so the queue has to be drained here too.
    setTimeout(() => { if (typeof flushToastQueue === 'function') flushToastQueue(); }, 600);
    if (typeof startChromeClock === 'function') startChromeClock();
    _startIdleTracking();

  } else {
    // ── No valid session — show login ─────────────────────────────────────
    _killSession(); // clear any stale/invalid session data
    // A remembered warden gets their name back, and the cursor goes to the one
    // box they still have to fill.
    const uinp = _ui('login-user');
    const pinp = _ui('login-input');
    const remembered = _rememberedUser();
    const rememberEl = _ui('login-remember');
    if (rememberEl) rememberEl.checked = !!remembered;
    if (uinp && remembered) uinp.value = remembered;
    loginPaintRemembered();
    const focusTarget = (remembered && pinp) ? pinp : uinp;
    if (focusTarget) setTimeout(() => focusTarget.focus(), 120);
  }
 
})().catch(err => {
  console.error('[Auth] Boot failed:', err);
  // Fail-safe: ensure login screen is visible so user is never locked out of UI
  const screen = _ui('login-screen');
  if (screen) screen.style.display = '';
});