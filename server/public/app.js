/* Hostyllo Control Plane — the owner's console.

   Plain browser JS, no build step. One router (location.hash), one API helper,
   one modal, one toast. Every value that came from the database or a person
   goes through esc() before it reaches innerHTML — a hostel name is free text
   typed by whoever sold the licence.

   What it controls (owner's brief, 2026-09-24):
     · issue keys for new hostels (v5: bound to one PC on first activation)
     · the access ladder — active / read-only / restricted / suspended / revoked,
       any of them timed except revoked
     · data entry, printing and exporting, switched off one at a time
     · feature flags per hostel and fleet-wide
     · expiry, extended or shortened
     · devices: release a PC, re-activate it, see who is online
   Every change reaches a connected app in about a second, and the console shows
   whether it has been received. */

'use strict';

// ── Icons (Lucide paths, stroke-only) ───────────────────────────────────────
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  hostels: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01"/>',
  register: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  fleet: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  audit: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  system: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  admins: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  wifi: '<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 20 0M12 20h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>'
};
function icon(name, cls) {
  return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

// ── API ─────────────────────────────────────────────────────────────────────
/** The CSRF cookie is readable on purpose — that is what double-submit means.
    The session cookie is HttpOnly and never visible here. */
function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)cp_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function api(path, options) {
  const opts = Object.assign({ headers: {} }, options || {});
  opts.credentials = 'same-origin';
  if (opts.body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  if ((opts.method || 'GET') !== 'GET') opts.headers['x-csrf-token'] = csrfToken();
  const res = await fetch('/admin/api' + path, opts);
  let body = null;
  try { body = await res.json(); } catch (_) { /* a proxy's 502 is not JSON */ }
  if (!res.ok) {
    if (res.status === 401 && state.user && path !== '/login') { signedOut(); }
    const err = new Error((body && body.message) || 'Request failed (' + res.status + ')');
    err.code = body && body.code;
    err.status = res.status;
    throw err;
  }
  return body ? body.data : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function daysUntil(v) { return v ? Math.ceil((new Date(v).getTime() - Date.now()) / 86400000) : null; }
function ago(v) {
  if (!v) return 'never';
  const s = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  const d = Math.floor(s / 86400);
  if (d < 30) return d + ' d ago';
  if (d < 365) return Math.floor(d / 30) + ' mo ago';
  return Math.floor(d / 365) + ' yr ago';
}
function initials(s) {
  return String(s || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}
function isoDate(d) { return d.toISOString().slice(0, 10); }
function addMonths(n) { const d = new Date(); d.setMonth(d.getMonth() + n); return isoDate(d); }

const LEVELS = {
  active:     { label: 'Active',     chip: 'success', dot: 'var(--success)', desc: 'Everything works.' },
  readonly:   { label: 'Read-only',  chip: 'warning', dot: 'var(--warning)', desc: 'View, search, print and export. No new or changed data.' },
  restricted: { label: 'Restricted', chip: 'orange',  dot: 'var(--orange)',  desc: 'View and search only. No data entry, printing or exporting.' },
  suspended:  { label: 'Suspended',  chip: 'danger',  dot: 'var(--danger)',  desc: 'Locked — the app shows the licence screen only. Can be timed.' },
  revoked:    { label: 'Revoked',    chip: 'danger',  dot: 'var(--danger)',  desc: 'Locked for good. Owner only, with your password.' }
};
function levelChip(l) {
  const m = LEVELS[l.level] || LEVELS.active;
  let until = '';
  if (l.statusUntil && l.level === l.status) until = ' · until ' + fmtDate(l.statusUntil);
  return '<span class="chip chip--' + m.chip + '">' + (l.level === 'suspended' || l.level === 'revoked' ? icon('lock', 'sm') : '')
    + esc(m.label) + esc(until) + '</span>';
}
function expiryCell(l) {
  const d = daysUntil(l.expiresAt);
  let cls = '';
  let txt = d === null ? '' : d < 0 ? Math.abs(d) + ' d ago' : d === 0 ? 'today' : 'in ' + d + ' d';
  if (d !== null && d < 0) cls = 'c-danger'; else if (d !== null && d <= 30) cls = 'c-warning';
  return '<div class="num">' + esc(fmtDate(l.expiresAt)) + '</div><div class="sub ' + cls + '">' + esc(txt) + '</div>';
}
function deliveredCell(l) {
  if (l.delivered === true) return '<span class="chip chip--success">' + icon('check', 'sm') + 'Received</span>';
  if (l.delivered === false) return '<span class="chip chip--warning">' + icon('clock', 'sm') + 'Pending</span>';
  return '<span class="faint">—</span>';
}
function onlineCell(l) {
  const n = l.onlineCount || 0;
  return '<span class="' + (n ? 'dot-on' : 'dot-off') + '"></span> <span class="num">' + n + '/' + (l.deviceCount || 0) + '</span>';
}

// ── Toast ───────────────────────────────────────────────────────────────────
function toast(msg, kind, action) {
  const el = document.createElement('div');
  el.className = 'toast toast--' + (kind || 'info');
  el.innerHTML = icon(kind === 'error' ? 'alert' : 'check') + '<span></span>';
  el.querySelector('span').textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn btn--sm';
    b.textContent = action.label;
    b.onclick = () => { el.remove(); action.run(); };
    el.appendChild(b);
  }
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), action ? 12000 : kind === 'error' ? 7000 : 3500);
}

// ── Modal ───────────────────────────────────────────────────────────────────
/**
 * @param {object} o  {title, body (html), fields:[{name,label,type,value,placeholder,options,hint,required}],
 *                     confirm, danger, typeToConfirm, password}
 * @returns {Promise<object|null>} the field values, or null when cancelled
 */
function modal(o) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const fields = (o.fields || []).slice();
    if (o.password) fields.push({ name: 'password', label: 'Your password', type: 'password', required: true,
      hint: 'Asked again because this can switch off paying customers.' });
    if (o.typeToConfirm) fields.push({ name: '__confirm', label: 'Type "' + o.typeToConfirm + '" to confirm', required: true });
    ov.innerHTML = '<form class="modal" role="dialog" aria-modal="true">'
      + '<div class="modal__t"></div>'
      + (o.body ? '<div class="modal__b">' + o.body + '</div>' : '')
      + fields.map((f, i) => {
        const id = 'mf' + i;
        let input;
        if (f.type === 'select') {
          input = '<select class="select" id="' + id + '" name="' + esc(f.name) + '">' + f.options.map((op) =>
            '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(f.value) ? ' selected' : '') + '>' + esc(op[1]) + '</option>').join('') + '</select>';
        } else if (f.type === 'textarea') {
          input = '<textarea class="textarea" id="' + id + '" name="' + esc(f.name) + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea>';
        } else {
          input = '<input class="input' + (f.mono ? ' mono' : '') + '" id="' + id + '" name="' + esc(f.name) + '" type="' + esc(f.type || 'text') + '" value="' + esc(f.value || '')
            + '" placeholder="' + esc(f.placeholder || '') + '"' + (f.required ? ' required' : '') + (f.type === 'password' ? ' autocomplete="current-password"' : ' autocomplete="off"') + '>';
        }
        return '<label class="field"><span>' + esc(f.label) + '</span>' + input + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
      }).join('')
      + '<div class="alert alert--danger hidden" data-err></div>'
      + '<div class="modal__f"><button type="button" class="btn btn--ghost" data-cancel>Cancel</button>'
      + '<button type="submit" class="btn ' + (o.danger ? 'btn--danger' : 'btn--primary') + '">' + esc(o.confirm || 'Confirm') + '</button></div></form>';
    ov.querySelector('.modal__t').textContent = o.title;
    document.body.appendChild(ov);
    const form = ov.querySelector('form');
    const first = form.querySelector('input,select,textarea');
    (first || form.querySelector('[type=submit]')).focus();
    const close = (v) => { ov.remove(); resolve(v); };
    ov.querySelector('[data-cancel]').onclick = () => close(null);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(null); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    form.onsubmit = (e) => {
      e.preventDefault();
      const vals = {};
      fields.forEach((f, i) => { vals[f.name] = form.querySelector('#mf' + i).value; });
      if (o.typeToConfirm && vals.__confirm.trim() !== o.typeToConfirm) {
        const err = form.querySelector('[data-err]');
        err.textContent = 'That does not match.';
        err.classList.remove('hidden');
        return;
      }
      delete vals.__confirm;
      close(vals);
    };
  });
}

/** Run a mutation; on a wrong-password answer, say so and let the caller retry. */
async function act(fn, okMsg, undo) {
  try {
    const out = await fn();
    if (okMsg) toast(okMsg, 'success', undo);
    return out;
  } catch (e) {
    toast(e.message, 'error');
    return undefined;
  }
}

// ── State and routing ───────────────────────────────────────────────────────
const state = { user: null, meta: null, summary: null, licences: null, filter: 'all', search: '', selected: new Set() };

const VIEWS = {
  overview: { label: 'Overview', icon: 'overview' },
  hostels:  { label: 'Hostels', icon: 'hostels' },
  register: { label: 'Register hostel', icon: 'register' },
  fleet:    { label: 'Fleet controls', icon: 'fleet' },
  audit:    { label: 'Audit log', icon: 'audit' },
  system:   { label: 'System health', icon: 'system' },
  admins:   { label: 'Admins', icon: 'admins' },
  security: { label: 'My security', icon: 'security' }
};

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/');
  if (parts[0] === 'hostel' && parts[1]) return { view: 'hostel', id: parts[1], tab: parts[2] || 'overview' };
  return { view: VIEWS[parts[0]] ? parts[0] : 'overview' };
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
window.addEventListener('hashchange', () => render());

const can = {
  edit: () => state.user && (state.user.role === 'admin' || state.user.role === 'owner'),
  owner: () => state.user && state.user.role === 'owner'
};

// ── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const me = await api('/me');
    signedIn(me);
  } catch (_) {
    showLogin();
  }
}

function showLogin() {
  state.user = null;
  $('app').hidden = true;
  $('login').hidden = false;
  $('login-email').focus();
}

function signedOut() {
  showLogin();
  toast('Your session ended. Sign in again.', 'error');
}

function signedIn(me) {
  state.user = me.user;
  state.meta = me;
  $('login').hidden = true;
  $('app').hidden = false;
  paintChrome();
  render();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('login-error');
  err.classList.add('hidden');
  $('login-btn').disabled = true;
  const body = { email: $('login-email').value, password: $('login-password').value };
  const code = $('login-code').value.trim();
  if (code) body.code = code;
  try {
    await api('/login', { method: 'POST', body });
    signedIn(await api('/me'));
    $('login-password').value = '';
    $('login-code').value = '';
    $('login-code-field').classList.add('hidden');
  } catch (ex) {
    if (ex.code === 'TOTP_REQUIRED') {
      $('login-code-field').classList.remove('hidden');
      $('login-code').focus();
    } else {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  } finally {
    $('login-btn').disabled = false;
  }
});

function paintChrome() {
  const u = state.user;
  $('role-badge').innerHTML = icon('zap', 'sm') + esc(u.role === 'owner' ? 'Owner · full control' : u.role === 'admin' ? 'Admin' : 'Support · read-only');
  const pill = $('twofa-pill');
  pill.className = 'twofa' + (u.totpEnabled ? ' on' : '');
  pill.innerHTML = '<span class="dot"></span>' + (u.totpEnabled ? '2FA verified' : '2FA is off — set it up');
  $('me-avatar').textContent = initials(u.name || u.email);
  $('me-name').textContent = u.name || u.email;
  $('me-email').textContent = u.email;
  document.querySelectorAll('.nav-item[data-go]').forEach((b) => {
    const v = VIEWS[b.dataset.go];
    b.innerHTML = icon(v.icon) + '<span>' + esc(v.label) + '</span>' + (b.dataset.go === 'hostels' ? '<span class="nav-badge hidden" id="nav-attn"></span>' : '');
    if (b.dataset.go === 'admins') b.classList.toggle('hidden', !can.owner());
    if (b.dataset.go === 'register') b.classList.toggle('hidden', !can.edit());
    if (b.dataset.go === 'fleet') b.classList.toggle('hidden', !can.edit());
  });
  $('hdr-register').innerHTML = icon('plus') + '<span class="hide-sm">Register hostel</span>';
  $('hdr-register').classList.toggle('hidden', !can.edit());
  $('search-ico').innerHTML = icon('search');
  $('menu-btn').innerHTML = icon('menu');
  paintTheme();
  $('logout-btn').innerHTML = icon('logout', 'sm') + 'Sign out';
}

function paintTheme() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  $('theme-btn').innerHTML = icon(light ? 'moon' : 'sun', 'sm') + (light ? 'Dark' : 'Light');
}

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-go]');
  if (nav) { go('#/' + nav.dataset.go); $('sidebar').classList.remove('is-open'); }
});
$('hdr-register').onclick = () => go('#/register');
$('menu-btn').onclick = () => $('sidebar').classList.toggle('is-open');
$('theme-btn').onclick = () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('cp_theme', next); } catch (_) {}
  paintTheme();
};
$('logout-btn').onclick = async () => {
  try { await api('/logout', { method: 'POST' }); } catch (_) {}
  state.user = null;
  showLogin();
};
$('global-search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  state.search = e.target.value.trim();
  state.filter = 'all';
  go('#/hostels');
});

// ── Render ──────────────────────────────────────────────────────────────────
let _renderSeq = 0;
async function render(silent) {
  if (!state.user) return;
  const r = route();
  const seq = ++_renderSeq;
  document.querySelectorAll('.nav-item[data-go]').forEach((b) => {
    const cur = r.view === 'hostel' ? 'hostels' : r.view;
    if (b.dataset.go === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (!silent) $('view').innerHTML = '<div class="empty">Loading…</div>';
  try {
    const html = await VIEW_RENDER[r.view](r);
    if (seq !== _renderSeq) return;   // a newer render won
    if (html !== undefined) $('view').innerHTML = html;
    if (AFTER[r.view]) AFTER[r.view](r);
  } catch (e) {
    if (seq !== _renderSeq) return;
    $('view').innerHTML = '<div class="alert alert--danger">' + icon('alert') + esc(e.message) + '</div>';
  }
}

function setTitle(t) { $('title').textContent = t; document.title = t + ' — Hostyllo Control Plane'; }

async function loadSummary() {
  state.summary = await api('/summary');
  const s = state.summary.licenses;
  const attn = (s.suspended || 0) + (s.expired || 0) + (s.unverified || 0);
  const b = $('nav-attn');
  if (b) { b.textContent = attn; b.classList.toggle('hidden', !attn); }
  return state.summary;
}

// Auto-refresh: presence and delivery change on their own. Never while the
// owner is typing or a dialog is open.
setInterval(() => {
  if (!state.user || document.hidden) return;
  if (document.querySelector('.overlay')) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.id !== 'global-search') return;
  const v = route().view;
  if (v === 'overview' || v === 'hostels' || v === 'hostel' || v === 'system') render(true);
}, 10000);

const VIEW_RENDER = {};
const AFTER = {};

// ════════════════════════════════════════════════════════════════════════════
// Overview
// ════════════════════════════════════════════════════════════════════════════
VIEW_RENDER.overview = async () => {
  setTitle('Overview');
  const [sum, sys] = await Promise.all([loadSummary(), api('/system').catch(() => null)]);
  const L = sum.licenses, D = sum.devices;
  const alerts = [];
  if (sys && sys.signing !== 'ok') alerts.push(['danger', '<b>Licence signing is off.</b> Apps cannot receive any change until ENTITLEMENT_SIGNING_JWK is set.']);
  if (sys && sys.realtime !== 'listening') alerts.push(['warning', '<b>Live push is not listening.</b> Changes still arrive, but only at each app’s 10-minute check.']);
  if (!state.user.totpEnabled) alerts.push(['warning', '<b>Your account has no second factor.</b> This console can switch off every hostel.', '<button class="btn btn--sm" data-go="security">Set up 2FA</button>']);
  if (L.unverified) alerts.push(['info', '<b>' + L.unverified + ' licence' + (L.unverified === 1 ? '' : 's') + ' to verify</b> — keys this console did not issue registered on their own.', '<button class="btn btn--sm" data-filter="unverified">Review</button>']);
  if (L.expired) alerts.push(['danger', '<b>' + L.expired + ' expired</b> — past their date. Renew or let them go read-only.', '<button class="btn btn--sm" data-filter="expired">View</button>']);
  if (L.expiring_7) alerts.push(['warning', '<b>' + L.expiring_7 + ' expiring within 7 days.</b>', '<button class="btn btn--sm" data-filter="expiring">View</button>']);

  const kpi = (label, val, cls, sub, filter, ic) =>
    '<button class="kpi" data-filter="' + filter + '"><div class="kpi__l">' + icon(ic, 'sm') + esc(label) + '</div>'
    + '<div class="kpi__v ' + cls + '">' + esc(val) + '</div><div class="kpi__s">' + esc(sub) + '</div></button>';

  const total = Math.max(1, L.total);
  const bar = (label, n, color) => '<div><div class="bar__head"><span>' + esc(label) + '</span><span class="num mono">' + n + '</span></div>'
    + '<div class="bar__track"><div class="bar__fill" style="width:' + Math.round(n / total * 100) + '%;background:' + color + '"></div></div></div>';

  const vTotal = Math.max(1, (sum.versions || []).reduce((a, v) => a + v.n, 0));
  const versions = (sum.versions || []).map((v) => '<div><div class="bar__head"><span class="mono">' + esc(v.version) + '</span><span class="num mono">' + v.n + '</span></div>'
    + '<div class="bar__track"><div class="bar__fill" style="width:' + Math.round(v.n / vTotal * 100) + '%;background:var(--accent)"></div></div></div>').join('')
    || '<div class="empty">No devices have connected yet.</div>';

  const expiring = (sum.expiring || []).map((l) => '<tr class="is-click" data-open="' + esc(l.id) + '"><td><div class="name">' + esc(l.hostelName || 'Unnamed hostel') + '</div><div class="sub">' + esc(l.city || '') + '</div></td>'
    + '<td>' + levelChip(l) + '</td><td>' + expiryCell(l) + '</td><td>' + onlineCell(l) + '</td></tr>').join('');

  const recent = (sum.recent || []).map((a) => '<tr><td class="num sub">' + esc(fmtDateTime(a.created_at)) + '</td><td>' + auditLabel(a) + '</td><td class="sub">' + esc(a.actor) + '</td></tr>').join('');

  return '<div class="stack">'
    + alerts.map((a) => '<div class="alert alert--' + a[0] + '">' + icon('alert') + '<span>' + a[1] + '</span>' + (a[2] || '') + '</div>').join('')
    + '<div class="kpis">'
    + kpi('Hostels', L.total, '', (L.timed || 0) + ' on a timed level', 'all', 'hostels')
    + kpi('Online now', D.online || 0, 'c-success', (D.seen_day || 0) + ' PCs seen today', 'online', 'wifi')
    + kpi('Active', L.active, 'c-success', 'full access', 'active', 'check')
    + kpi('Limited', (L.readonly || 0) + (L.restricted || 0), 'c-warning', (L.readonly || 0) + ' read-only · ' + (L.restricted || 0) + ' restricted', 'limited', 'alert')
    + kpi('Locked', (L.suspended || 0) + (L.revoked || 0), 'c-danger', (L.suspended || 0) + ' suspended · ' + (L.revoked || 0) + ' revoked', 'locked', 'lock')
    + kpi('Expiring ≤ 30 d', L.expiring_soon || 0, 'c-warning', (L.expired || 0) + ' already expired', 'expiring', 'clock')
    + '</div>'
    + '<div class="two-col">'
    + '<div class="card card--flush"><div class="card__title">Expiring and recently expired <a href="#/hostels" data-filter="expiring">All hostels</a></div>'
    + (expiring ? '<div class="table-wrap"><table class="t"><thead><tr><th>Hostel</th><th>Access</th><th>Expiry</th><th>Online</th></tr></thead><tbody>' + expiring + '</tbody></table></div>' : '<div class="empty">Nothing expiring in the next 30 days.</div>')
    + '</div>'
    + '<div class="stack"><div class="card"><div class="card__title">Access levels</div><div class="bars">'
    + bar('Active', L.active || 0, 'var(--success)') + bar('Read-only', L.readonly || 0, 'var(--warning)')
    + bar('Restricted', L.restricted || 0, 'var(--orange)') + bar('Suspended', L.suspended || 0, 'var(--danger)')
    + bar('Revoked', L.revoked || 0, 'var(--text-3)') + '</div></div>'
    + '<div class="card"><div class="card__title">App versions in the field</div><div class="bars">' + versions + '</div>'
    + '<div class="faint" style="font-size:11.5px;margin-top:10px">Builds before the 2026-09-24 release ignore read-only, restricted and the print/export switches.</div></div></div>'
    + '</div>'
    + '<div class="card card--flush"><div class="card__title">Recent admin activity <a href="#/audit">Full audit log</a></div>'
    + (recent ? '<div class="table-wrap"><table class="t"><tbody>' + recent + '</tbody></table></div>' : '<div class="empty">No activity yet.</div>') + '</div>'
    + '</div>';
};

document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f && !e.target.closest('#view .filters')) { e.preventDefault(); state.filter = f.dataset.filter; state.search = ''; go('#/hostels'); return; }
  const o = e.target.closest('[data-open]');
  if (o && !e.target.closest('input[type=checkbox]') && !e.target.closest('button')) go('#/hostel/' + o.dataset.open);
});

// ════════════════════════════════════════════════════════════════════════════
// Hostels register
// ════════════════════════════════════════════════════════════════════════════
const FILTERS = [
  ['all', 'All', () => true],
  ['online', 'Online now', (l) => l.onlineCount > 0],
  ['active', 'Active', (l) => l.level === 'active'],
  ['limited', 'Read-only / restricted', (l) => l.level === 'readonly' || l.level === 'restricted'],
  ['locked', 'Locked', (l) => l.level === 'suspended' || l.level === 'revoked'],
  ['timed', 'Timed', (l) => !!l.statusUntil && l.level === l.status],
  ['expiring', 'Expiring ≤ 30 d', (l) => { const d = daysUntil(l.expiresAt); return d !== null && d >= 0 && d <= 30; }],
  ['expired', 'Expired', (l) => daysUntil(l.expiresAt) < 0],
  ['stale', 'Not seen 7 d', (l) => !l.lastSeenAt || Date.now() - new Date(l.lastSeenAt).getTime() > 7 * 86400000],
  ['unverified', 'Unverified', (l) => l.verification === 'unverified'],
  ['pending', 'Change pending', (l) => l.delivered === false]
];

function filtered() {
  const f = (FILTERS.find((x) => x[0] === state.filter) || FILTERS[0])[2];
  const q = state.search.toLowerCase();
  return (state.licences || []).filter((l) => f(l) && (!q || [l.hostelName, l.city, l.contactName, l.contactPhone, l.serial, l.plan]
    .some((v) => v && String(v).toLowerCase().includes(q))));
}

VIEW_RENDER.hostels = async (r, fromCache) => {
  setTitle('Hostels');
  if (!fromCache) state.licences = await api('/licenses');
  const all = state.licences;
  const rows = filtered();
  const ids = new Set(all.map((l) => l.id));
  state.selected.forEach((id) => { if (!ids.has(id)) state.selected.delete(id); });
  const counts = Object.fromEntries(FILTERS.map((f) => [f[0], all.filter(f[2]).length]));

  const body = rows.map((l) => '<tr class="is-click' + (state.selected.has(l.id) ? ' is-selected' : '') + '" data-open="' + esc(l.id) + '">'
    + (can.edit() ? '<td><input type="checkbox" data-sel="' + esc(l.id) + '"' + (state.selected.has(l.id) ? ' checked' : '') + ' aria-label="Select"></td>' : '')
    + '<td><div class="name">' + esc(l.hostelName || 'Unnamed hostel') + '</div><div class="sub">' + esc([l.contactName, l.city].filter(Boolean).join(' · ') || l.keyHint) + '</div></td>'
    + '<td>' + levelChip(l) + (l.verification === 'unverified' ? ' <span class="chip chip--violet">Unverified</span>' : '') + '</td>'
    + '<td>' + expiryCell(l) + '</td>'
    + '<td>' + onlineCell(l) + '</td>'
    + '<td class="mono sub">' + esc(l.appVersion || '—') + '</td>'
    + '<td class="sub">' + esc(ago(l.lastSeenAt)) + '</td>'
    + '<td>' + deliveredCell(l) + '</td>'
    + '<td class="sub">' + esc(l.plan || '') + ' <span class="mono">v' + esc(l.keyVersion) + '</span></td></tr>').join('');

  return '<div class="stack">'
    + '<div class="row" style="justify-content:space-between">'
    + '<div class="search" style="flex:1;max-width:420px">' + icon('search') + '<input class="input" id="h-search" placeholder="Search name, city, contact, phone, serial, plan…" value="' + esc(state.search) + '"></div>'
    + '<div class="row"><button class="btn" id="h-csv">' + icon('download', 'sm') + 'Export CSV</button>'
    + '<button class="btn" id="h-refresh">' + icon('refresh', 'sm') + 'Refresh</button></div></div>'
    + '<div class="filters" role="group" aria-label="Filter">' + FILTERS.map((f) => '<button class="filter" data-hfilter="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + esc(f[1]) + ' <span class="n">' + counts[f[0]] + '</span></button>').join('') + '</div>'
    + '<div class="card card--flush"><div class="table-wrap"><table class="t"><thead><tr>'
    + (can.edit() ? '<th><input type="checkbox" id="h-all" aria-label="Select all shown"></th>' : '')
    + '<th>Hostel</th><th>Access</th><th>Expiry</th><th>Online</th><th>App</th><th>Last seen</th><th>Last change</th><th>Plan / key</th></tr></thead>'
    + '<tbody>' + (body || '<tr><td colspan="9"><div class="empty">No hostels match.</div></td></tr>') + '</tbody></table></div></div>'
    + (state.selected.size && can.edit() ? bulkBar() : '')
    + '</div>';
};

function bulkBar() {
  return '<div class="bulkbar"><b>' + state.selected.size + ' selected</b>'
    + '<button class="btn btn--sm" data-bulk="status">' + icon('lock', 'sm') + 'Set access…</button>'
    + '<button class="btn btn--sm" data-bulk="expiry">' + icon('clock', 'sm') + 'Extend / shorten…</button>'
    + '<button class="btn btn--sm" data-bulk="restrictions">Print / export…</button>'
    + '<button class="btn btn--sm" data-bulk="features">Features…</button>'
    + '<button class="btn btn--ghost btn--sm" data-bulk="clear" style="margin-left:auto">Clear</button></div>';
}

AFTER.hostels = () => {
  const s = $('h-search');
  s.oninput = () => { state.search = s.value; rerenderHostels(); };
  $('h-refresh').onclick = () => render();
  $('h-csv').onclick = exportCsv;
  document.querySelectorAll('[data-hfilter]').forEach((b) => { b.onclick = () => { state.filter = b.dataset.hfilter; rerenderHostels(); }; });
  document.querySelectorAll('[data-sel]').forEach((c) => {
    c.onclick = (e) => { e.stopPropagation(); if (c.checked) state.selected.add(c.dataset.sel); else state.selected.delete(c.dataset.sel); rerenderHostels(); };
  });
  const all = $('h-all');
  if (all) {
    const shown = filtered();
    all.checked = shown.length > 0 && shown.every((l) => state.selected.has(l.id));
    all.onclick = () => { shown.forEach((l) => all.checked ? state.selected.add(l.id) : state.selected.delete(l.id)); rerenderHostels(); };
  }
  document.querySelectorAll('[data-bulk]').forEach((b) => { b.onclick = () => bulk(b.dataset.bulk); });
};

async function rerenderHostels() {
  const pos = $('h-search') ? $('h-search').selectionStart : null;
  const focused = document.activeElement && document.activeElement.id === 'h-search';
  $('view').innerHTML = await VIEW_RENDER.hostels(route(), true);
  AFTER.hostels();
  if (focused) { const s = $('h-search'); s.focus(); if (pos !== null) s.setSelectionRange(pos, pos); }
}

function exportCsv() {
  const cell = (v) => { const s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['Hostel', 'Contact', 'Phone', 'City', 'Plan', 'Access', 'Until', 'Reason', 'Expires', 'Devices', 'Online', 'App version', 'Last seen', 'Key version', 'Serial', 'Verification']];
  filtered().forEach((l) => rows.push([l.hostelName, l.contactName, l.contactPhone, l.city, l.plan, (LEVELS[l.level] || {}).label, l.statusUntil ? fmtDate(l.statusUntil) : '',
    l.statusReason, fmtDate(l.expiresAt), l.deviceCount, l.onlineCount, l.appVersion, l.lastSeenAt ? fmtDateTime(l.lastSeenAt) : '', l.keyVersion, l.serial, l.verification]));
  const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hostyllo-hostels-' + isoDate(new Date()) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function bulk(kind) {
  if (kind === 'clear') { state.selected.clear(); return rerenderHostels(); }
  const ids = Array.from(state.selected);
  const n = ids.length;
  let payload = null;
  if (kind === 'status') {
    const opts = Object.keys(LEVELS).filter((k) => k !== 'revoked' || can.owner()).map((k) => [k, LEVELS[k].label]);
    const v = await modal({ title: 'Set access for ' + n + ' hostel' + (n === 1 ? '' : 's'), confirm: 'Apply to ' + n, password: true,
      body: 'Revoked hostels are skipped unless you are revoking — bringing one back is done one hostel at a time.',
      fields: [{ name: 'status', label: 'Access level', type: 'select', options: opts, value: 'readonly' },
        { name: 'hours', label: 'For how long', type: 'select', value: '', options: DURATIONS },
        { name: 'reason', label: 'Reason shown to the hostels', placeholder: 'e.g. Dues outstanding' }] });
    if (!v) return;
    payload = { action: 'status', status: v.status, reason: v.reason || undefined, password: v.password };
    if (v.hours) payload.hours = parseInt(v.hours, 10);
  } else if (kind === 'expiry') {
    const v = await modal({ title: 'Move expiry for ' + n + ' hostel' + (n === 1 ? '' : 's'), confirm: 'Apply to ' + n, password: true,
      body: 'Days are added to each hostel’s current expiry. Use a negative number to shorten.',
      fields: [{ name: 'days', label: 'Days', type: 'number', value: '30', required: true }] });
    if (!v) return;
    payload = { action: 'expiry', days: parseInt(v.days, 10), password: v.password };
  } else if (kind === 'restrictions') {
    const v = await modal({ title: 'Print and export for ' + n + ' hostel' + (n === 1 ? '' : 's'), confirm: 'Apply to ' + n, password: true,
      body: 'This replaces each hostel’s own switches. Their access level still applies on top.',
      fields: [{ name: 'printing', label: 'Printing and PDFs', type: 'select', value: 'on', options: [['on', 'Allowed'], ['off', 'Switched off']] },
        { name: 'exporting', label: 'Exporting and backups', type: 'select', value: 'on', options: [['on', 'Allowed'], ['off', 'Switched off']] },
        { name: 'dataEntry', label: 'Data entry', type: 'select', value: 'on', options: [['on', 'Allowed'], ['off', 'Switched off']] }] });
    if (!v) return;
    const r = {};
    ['printing', 'exporting', 'dataEntry'].forEach((k) => { if (v[k] === 'off') r[k] = false; });
    payload = { action: 'restrictions', restrictions: r, password: v.password };
  } else if (kind === 'features') {
    const cat = state.meta.featureCatalogue;
    const v = await modal({ title: 'Features for ' + n + ' hostel' + (n === 1 ? '' : 's'), confirm: 'Apply to ' + n, password: true,
      body: '“Leave as is” keeps each hostel’s own setting.',
      fields: Object.keys(cat).map((k) => ({ name: k, label: cat[k].label, type: 'select', value: '', options: [['', 'Leave as is'], ['on', 'On'], ['off', 'Off']] })) });
    if (!v) return;
    const f = {};
    Object.keys(cat).forEach((k) => { if (v[k]) f[k] = v[k] === 'on'; });
    if (!Object.keys(f).length) return;
    payload = { action: 'features', features: f, password: v.password };
  }
  const out = await act(() => api('/bulk', { method: 'POST', body: Object.assign({ ids }, payload) }), null);
  if (out) { toast(out.changed + ' hostel' + (out.changed === 1 ? '' : 's') + ' updated. Connected apps are being told now.', 'success'); state.selected.clear(); render(); }
}

const DURATIONS = [['', 'Until I change it'], ['24', '1 day'], ['72', '3 days'], ['168', '7 days'], ['336', '14 days'], ['720', '30 days'], ['2160', '90 days']];

// ════════════════════════════════════════════════════════════════════════════
// Hostel detail
// ════════════════════════════════════════════════════════════════════════════
const TABS = [['overview', 'Overview'], ['access', 'Access'], ['licence', 'Licence'], ['devices', 'Devices'], ['features', 'Features'], ['activity', 'Activity'], ['details', 'Details & notes']];

VIEW_RENDER.hostel = async (r) => {
  const [d, preview] = await Promise.all([api('/licenses/' + r.id), api('/licenses/' + r.id + '/preview')]);
  const l = d.license;
  state.detail = { d, preview };
  setTitle(l.hostelName || 'Unnamed hostel');
  const tab = TABS.find((t) => t[0] === r.tab) ? r.tab : 'overview';
  return '<div class="detail-head">'
    + '<button class="btn" data-go="hostels">' + icon('back', 'sm') + 'Hostels</button>'
    + '<div style="flex:1;min-width:240px"><div class="detail-head__name">' + esc(l.hostelName || 'Unnamed hostel') + ' ' + levelChip(l)
    + (l.verification !== 'verified' ? ' <span class="chip chip--violet">' + esc(l.verification) + '</span>' : '') + '</div>'
    + '<div class="detail-head__meta">' + esc([l.contactName, l.contactPhone, l.city, l.plan].filter(Boolean).join(' · ') || 'No contact details yet')
    + ' · <span class="mono">' + esc(l.keyHint) + '</span> · key v' + esc(l.keyVersion) + '</div></div>'
    + '<div class="row">'
    + (can.edit() ? '<button class="btn" id="d-push" title="Tell every connected PC to re-read its licence now">' + icon('send', 'sm') + 'Push now</button>' : '')
    + (can.edit() && l.level !== 'suspended' && l.level !== 'revoked' ? '<button class="btn btn--danger" data-quick="suspended">' + icon('lock', 'sm') + 'Suspend</button>' : '')
    + (can.edit() && l.level !== 'active' && (l.level !== 'revoked' || can.owner()) ? '<button class="btn btn--primary" data-quick="active">' + icon('unlock', 'sm') + 'Restore full access</button>' : '')
    + '</div></div>'
    + '<div class="tabs" role="tablist">' + TABS.map((t) => '<button class="tab" role="tab" aria-selected="' + (t[0] === tab) + '" data-tab="' + t[0] + '">' + esc(t[1])
      + (t[0] === 'devices' ? ' <span class="faint">' + (d.devices || []).length + '</span>' : '') + '</button>').join('') + '</div>'
    + '<div id="tab">' + TAB_RENDER[tab](l, d, preview) + '</div>';
};

AFTER.hostel = (r) => {
  document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => go('#/hostel/' + r.id + '/' + b.dataset.tab); });
  if ($('d-push')) $('d-push').onclick = () => act(() => api('/licenses/' + r.id + '/push', { method: 'POST' }), 'Sent. Connected PCs re-read their licence now.');
  document.querySelectorAll('[data-quick]').forEach((b) => { b.onclick = () => setLevel(r.id, b.dataset.quick); });
  const tab = (TABS.find((t) => t[0] === r.tab) || TABS[0])[0];
  if (TAB_AFTER[tab]) TAB_AFTER[tab](r.id);
};

const TAB_RENDER = {};
const TAB_AFTER = {};

TAB_RENDER.overview = (l, d, p) => {
  const r = p.restrictions || {};
  const yes = (b) => b ? '<span class="c-success">Allowed</span>' : '<span class="c-danger">Switched off</span>';
  const online = (d.devices || []).filter((x) => x.online).length;
  return '<div class="grid-3">'
    + '<div class="card"><div class="card__title">What the app is told</div><div class="kv">'
    + '<div><span>Status</span><span class="mono">' + esc(p.status) + '</span></div>'
    + '<div><span>Access</span><span>' + levelChip(l) + '</span></div>'
    + '<div><span>Data entry</span><span>' + yes(r.dataEntry) + '</span></div>'
    + '<div><span>Printing and PDFs</span><span>' + yes(r.printing) + '</span></div>'
    + '<div><span>Exporting and backups</span><span>' + yes(r.exporting) + '</span></div>'
    + (p.reason ? '<div><span>Reason shown</span><span>' + esc(p.reason) + '</span></div>' : '')
    + (p.until ? '<div><span>Lifts on its own</span><span>' + esc(fmtDateTime(p.until)) + '</span></div>' : '')
    + '</div></div>'
    + '<div class="card"><div class="card__title">Licence</div><div class="kv">'
    + '<div><span>Expires</span><span>' + expiryCell(l).replace('<div class="num">', '<div class="num" style="text-align:right">') + '</span></div>'
    + '<div><span>Key’s own date</span><span class="mono">' + esc(fmtDate(l.keyExpiresAt)) + '</span></div>'
    + '<div><span>Key type</span><span>' + (l.keyVersion === 5 ? 'v5 · bound to one PC' : l.keyVersion === 4 ? 'v4 · classic' : 'v3 · legacy, shared') + '</span></div>'
    + '<div><span>PC limit</span><span class="mono">' + esc(l.maxDevices === null ? 'unlimited' : l.maxDevices) + '</span></div>'
    + '<div><span>Verification</span><span>' + esc(l.verification) + '</span></div>'
    + '<div><span>First seen</span><span>' + esc(fmtDate(l.firstSeenAt)) + '</span></div>'
    + '</div></div>'
    + '<div class="card"><div class="card__title">Delivery</div><div class="kv">'
    + '<div><span>Online now</span><span><span class="' + (online ? 'dot-on' : 'dot-off') + '"></span> ' + online + ' of ' + (d.devices || []).filter((x) => x.status === 'active').length + ' PCs</span></div>'
    + '<div><span>Last change</span><span>' + deliveredCell(l) + '</span></div>'
    + '<div><span>Revision</span><span class="mono">' + esc(l.revision) + '</span></div>'
    + '<div><span>Last seen</span><span>' + esc(ago(l.lastSeenAt)) + '</span></div>'
    + '<div><span>App version</span><span class="mono">' + esc(l.appVersion || '—') + '</span></div>'
    + '</div>'
    + (!online && l.lastSeenAt ? '<div class="alert alert--warning" style="margin-top:12px">' + icon('clock', 'sm') + '<span>No PC is online. Changes land the next time this hostel connects.</span></div>' : '')
    + (!l.lastSeenAt ? '<div class="alert alert--info" style="margin-top:12px">' + icon('alert', 'sm') + '<span>This hostel has never connected. Until it does, only the key’s own date applies.</span></div>' : '')
    + '</div></div>';
};

TAB_RENDER.access = (l) => {
  const levels = Object.keys(LEVELS);
  return '<div class="stack"><div class="card"><div class="card__title">Access level</div>'
    + '<div class="ladder" role="radiogroup">' + levels.map((k) => {
      const m = LEVELS[k];
      const disabled = !can.edit() || (k === 'revoked' && !can.owner()) || (l.level === 'revoked' && k !== 'revoked' && !can.owner());
      return '<button class="rung' + (l.level === k ? ' is-current' : '') + '" role="radio" aria-checked="' + (l.level === k) + '" data-level="' + k + '"' + (disabled ? ' disabled' : '') + '>'
        + '<span class="rung__t"><span class="sw" style="background:' + m.dot + '"></span>' + esc(m.label) + '</span>'
        + '<span class="rung__d">' + esc(m.desc) + '</span></button>';
    }).join('') + '</div>'
    + (l.statusReason ? '<div class="alert alert--info" style="margin-top:12px">' + icon('alert', 'sm') + '<span>Reason shown to the hostel: <b>' + esc(l.statusReason) + '</b></span></div>' : '')
    + (l.statusUntil && l.level === l.status ? '<div class="alert alert--warning" style="margin-top:8px">' + icon('clock', 'sm') + '<span>Lifts on its own on <b>' + esc(fmtDateTime(l.statusUntil)) + '</b>, back to <b>' + esc((LEVELS[l.statusBefore] || LEVELS.active).label) + '</b>.</span></div>' : '')
    + '</div>'
    + '<div class="card"><div class="card__title">Switch off one thing at a time</div>'
    + restrictionRow('dataEntry', l) + restrictionRow('printing', l) + restrictionRow('exporting', l)
    + '<div class="faint" style="font-size:12px;margin-top:10px">These sit on top of the access level: they can only take away. A Read-only hostel cannot be given data entry here.</div></div></div>';
};

function restrictionRow(key, l) {
  const labels = state.meta.restrictionCatalogue || {};
  const own = l.restrictionOverrides || {};
  const effective = l.restrictions[key];
  const byLevel = (key === 'dataEntry' && ['readonly', 'restricted', 'suspended', 'revoked'].includes(l.level))
    || (key !== 'dataEntry' && ['restricted', 'suspended', 'revoked'].includes(l.level));
  const byFleet = !byLevel && own[key] !== false && effective === false;
  const note = byLevel ? 'Off because of the access level.' : byFleet ? 'Off fleet-wide (Fleet controls).' : own[key] === false ? 'Switched off for this hostel.' : 'Allowed.';
  return '<div class="flag"><div><div class="flag__n">' + esc(labels[key] || key) + '</div><div class="flag__s">' + esc(note) + '</div></div>'
    + '<button class="switch" role="switch" aria-checked="' + (effective !== false) + '" data-restr="' + key + '"' + (byLevel || byFleet || !can.edit() ? ' disabled' : '') + ' aria-label="' + esc(labels[key] || key) + '"></button></div>';
}

TAB_AFTER.access = (id) => {
  document.querySelectorAll('[data-level]').forEach((b) => { b.onclick = () => setLevel(id, b.dataset.level); });
  document.querySelectorAll('[data-restr]').forEach((b) => {
    b.onclick = async () => {
      const l = state.detail.d.license;
      const next = Object.assign({}, l.restrictionOverrides || {});
      const turningOff = b.getAttribute('aria-checked') === 'true';
      if (turningOff) next[b.dataset.restr] = false; else delete next[b.dataset.restr];
      const before = l.restrictionOverrides || {};
      const ok = await act(() => api('/licenses/' + id + '/restrictions', { method: 'PUT', body: { restrictions: next } }),
        (turningOff ? 'Switched off' : 'Allowed again') + '. Connected PCs update now.',
        { label: 'Undo', run: () => act(() => api('/licenses/' + id + '/restrictions', { method: 'PUT', body: { restrictions: before } }), 'Undone.').then(() => render(true)) });
      if (ok) render(true);
    };
  });
};

async function setLevel(id, level) {
  const l = state.detail.d.license;
  const name = l.hostelName || 'this hostel';
  const m = LEVELS[level];
  if (level === l.level && level === 'active') return;
  const fields = [];
  if (level !== 'active') fields.push({ name: 'reason', label: 'Reason shown to the hostel', placeholder: level === 'suspended' ? 'e.g. Fees two months overdue' : 'e.g. Dues outstanding', value: l.level === level ? (l.statusReason || '') : '' });
  if (level !== 'active' && level !== 'revoked') fields.push({ name: 'hours', label: 'For how long', type: 'select', value: '', options: DURATIONS.concat([['custom', 'Until a date…']]) });
  if (level !== 'active' && level !== 'revoked') fields.push({ name: 'until', label: 'Until (only for “Until a date…”)', type: 'datetime-local' });
  const needPw = level === 'revoked' || l.level === 'revoked';
  const v = await modal({
    title: (level === 'active' ? 'Restore full access to ' : 'Set ' + name + ' to ') + (level === 'active' ? name : m.label),
    body: esc(m.desc) + (level === 'suspended' || level === 'revoked' ? ' A PC that is open right now switches to the lock screen within seconds.' : ''),
    fields, confirm: level === 'active' ? 'Restore' : 'Set ' + m.label, danger: level === 'suspended' || level === 'revoked',
    password: needPw, typeToConfirm: level === 'revoked' ? (l.hostelName || 'REVOKE') : null
  });
  if (!v) return;
  const body = { status: level };
  if (v.reason) body.reason = v.reason;
  if (v.hours === 'custom') { if (!v.until) return toast('Pick the date it should lift.', 'error'); body.until = new Date(v.until).toISOString(); }
  else if (v.hours) body.hours = parseInt(v.hours, 10);
  if (v.password) body.password = v.password;
  const prev = { status: l.level, reason: l.statusReason };
  const undo = !needPw && prev.status !== 'revoked' ? { label: 'Undo', run: async () => {
    await act(() => api('/licenses/' + id + '/status', { method: 'POST', body: Object.assign({ status: prev.status }, prev.status !== 'active' && prev.reason ? { reason: prev.reason } : {}) }), 'Undone.');
    render(true);
  } } : null;
  const ok = await act(() => api('/licenses/' + id + '/status', { method: 'POST', body }),
    (level === 'active' ? 'Full access restored' : m.label + ' applied') + '. Connected PCs update now.', undo);
  if (ok) render(true);
}

TAB_RENDER.licence = (l) => {
  const e = can.edit();
  return '<div class="grid-2">'
    + '<div class="card"><div class="card__title">Expiry</div>'
    + '<div class="kv" style="margin-bottom:14px"><div><span>Current expiry</span><span class="mono">' + esc(fmtDateTime(l.expiresAt)) + '</span></div>'
    + '<div><span>Key’s own date</span><span class="mono">' + esc(fmtDate(l.keyExpiresAt)) + '</span></div></div>'
    + (e ? '<div class="row" style="margin-bottom:12px">'
      + [['+30 d', 30], ['+90 d', 90], ['+6 mo', 182], ['+1 yr', 365], ['−7 d', -7], ['−30 d', -30]].map((x) => '<button class="btn btn--sm" data-days="' + x[1] + '">' + x[0] + '</button>').join('')
      + '</div><div class="row"><input class="input" type="date" id="exp-date" style="max-width:180px" value="' + esc(isoDate(new Date(l.expiresAt))) + '"><button class="btn" id="exp-set">Set date</button></div>' : '')
    + '<div class="faint" style="font-size:12px;margin-top:12px">Moving the date reaches a hostel when its app connects. A hostel that never connects runs to its key’s own date — issue it a new key instead.</div></div>'
    + '<div class="card"><div class="card__title">PCs and verification</div>'
    + '<div class="field" style="margin-bottom:14px"><span>How many PCs this licence may run on</span><div class="row"><input class="input" type="number" min="1" id="max-dev" style="max-width:120px" value="' + esc(l.maxDevices === null ? '' : l.maxDevices) + '" placeholder="unlimited"' + (e ? '' : ' disabled') + '>'
    + (e ? '<button class="btn" id="max-set">Save</button>' : '') + '</div><small>Empty means unlimited — only right for an old v3 key several hostels share.</small></div>'
    + '<div class="field"><span>Verification</span><div class="seg" id="verif">' + ['verified', 'unverified', 'rejected'].map((v) => '<button data-verif="' + v + '" aria-pressed="' + (l.verification === v) + '"' + (e ? '' : ' disabled') + '>' + esc(v) + '</button>').join('') + '</div>'
    + '<small>Rejected is treated as revoked by the app.</small></div></div></div>';
};
TAB_AFTER.licence = (id) => {
  const moved = (out) => { if (!out) return; toast(out.reachesCustomerOnline ? 'Expiry moved. Connected PCs update now.' : 'Expiry moved — but this hostel has never connected, so it will not see it until it does.', 'success'); render(true); };
  document.querySelectorAll('[data-days]').forEach((b) => { b.onclick = async () => moved(await act(() => api('/licenses/' + id + '/expiry', { method: 'POST', body: { days: parseInt(b.dataset.days, 10) } }))); });
  if ($('exp-set')) $('exp-set').onclick = async () => moved(await act(() => api('/licenses/' + id + '/expiry', { method: 'POST', body: { expiresAt: $('exp-date').value } })));
  if ($('max-set')) $('max-set').onclick = async () => {
    const v = $('max-dev').value.trim();
    if (await act(() => api('/licenses/' + id + '/devices-limit', { method: 'POST', body: { maxDevices: v ? parseInt(v, 10) : null } }), 'PC limit saved.')) render(true);
  };
  document.querySelectorAll('[data-verif]').forEach((b) => {
    b.onclick = async () => {
      const body = { verification: b.dataset.verif };
      if (b.dataset.verif === 'rejected') {
        const v = await modal({ title: 'Reject this licence?', body: 'The app treats a rejected licence as revoked and locks.', password: true, danger: true, confirm: 'Reject' });
        if (!v) return; body.password = v.password;
      }
      if (await act(() => api('/licenses/' + id + '/status', { method: 'POST', body }), 'Verification saved.')) render(true);
    };
  });
};

TAB_RENDER.devices = (l, d) => {
  const rows = (d.devices || []).map((x) => '<tr>'
    + '<td><div class="name">' + esc(x.label || 'PC ' + x.machineShort) + '</div><div class="sub mono">' + esc(x.machineShort) + '…</div></td>'
    + '<td>' + (x.status === 'active' ? '<span class="chip chip--success">On licence</span>' : '<span class="chip chip--danger">Released</span>' + (x.statusReason ? '<div class="sub">' + esc(x.statusReason) + '</div>' : '')) + '</td>'
    + '<td><span class="' + (x.online ? 'dot-on' : 'dot-off') + '"></span> ' + (x.online ? 'Online' : 'Offline') + '</td>'
    + '<td>' + (x.upToDate ? '<span class="chip chip--success">' + icon('check', 'sm') + 'Up to date</span>' : x.lastRevisionApplied == null ? '<span class="faint">—</span>' : '<span class="chip chip--warning">Behind</span>') + '</td>'
    + '<td class="mono sub">' + esc(x.appVersion || '—') + '</td><td class="sub">' + esc(x.os || '—') + '</td>'
    + '<td class="sub">' + esc(ago(x.lastSeenAt)) + '<div class="faint">since ' + esc(fmtDate(x.firstSeenAt)) + '</div></td>'
    + '<td>' + (can.edit() ? '<div class="row"><button class="btn btn--sm" data-label="' + esc(x.id) + '">Label</button>'
      + (x.status === 'active' ? '<button class="btn btn--danger btn--sm" data-release="' + esc(x.id) + '">Release</button>' : '<button class="btn btn--sm" data-reactivate="' + esc(x.id) + '">Re-activate</button>') + '</div>' : '') + '</td></tr>').join('');
  return '<div class="stack"><div class="alert alert--info">' + icon('monitor', 'sm') + '<span>'
    + (l.keyVersion === 5 ? 'This key is bound to its PC. To move the hostel to a new PC, <b>release</b> the old one — it locks at once, and the key can then be activated on the new PC.'
      : 'Releasing a PC locks it at its next sync and frees its seat.') + '</span></div>'
    + '<div class="card card--flush"><div class="table-wrap"><table class="t"><thead><tr><th>PC</th><th>Licence</th><th>Now</th><th>Last change</th><th>App</th><th>OS</th><th>Last seen</th><th></th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="8"><div class="empty">No PC has activated this key yet.</div></td></tr>') + '</tbody></table></div></div></div>';
};
TAB_AFTER.devices = () => {
  document.querySelectorAll('[data-release]').forEach((b) => {
    b.onclick = async () => {
      const v = await modal({ title: 'Release this PC?', danger: true, confirm: 'Release and lock it',
        body: 'The PC switches to the lock screen within seconds if it is online, otherwise the next time it connects. Its seat becomes free for another PC.',
        fields: [{ name: 'reason', label: 'Message shown on that PC', value: 'This computer has been removed from the licence.' }] });
      if (!v) return;
      if (await act(() => api('/devices/' + b.dataset.release + '/status', { method: 'POST', body: { status: 'deactivated', reason: v.reason || undefined } }), 'PC released.')) render(true);
    };
  });
  document.querySelectorAll('[data-reactivate]').forEach((b) => {
    b.onclick = async () => { if (await act(() => api('/devices/' + b.dataset.reactivate + '/status', { method: 'POST', body: { status: 'active' } }), 'PC is back on the licence.')) render(true); };
  });
  document.querySelectorAll('[data-label]').forEach((b) => {
    b.onclick = async () => {
      const v = await modal({ title: 'Label this PC', fields: [{ name: 'label', label: 'Label', placeholder: 'e.g. Front office PC' }], confirm: 'Save' });
      if (!v) return;
      if (await act(() => api('/devices/' + b.dataset.label, { method: 'PATCH', body: { label: v.label } }), 'Saved.')) render(true);
    };
  });
};

TAB_RENDER.features = (l) => {
  const cat = state.meta.featureCatalogue;
  const own = l.featureOverrides || {};
  return '<div class="card"><div class="card__title">Features for this hostel</div>'
    + Object.keys(cat).map((k) => '<div class="flag"><div><div class="flag__n">' + esc(cat[k].label) + '</div><div class="flag__d">' + esc(cat[k].description) + '</div>'
      + '<div class="flag__s">' + (k in own ? 'Set for this hostel' : 'Default') + ' · needs app ' + esc(cat[k].since) + '+</div></div>'
      + '<button class="switch" role="switch" aria-checked="' + (l.features[k] !== false) + '" data-feat="' + esc(k) + '"' + (can.edit() ? '' : ' disabled') + ' aria-label="' + esc(cat[k].label) + '"></button></div>').join('')
    + (Object.keys(own).length && can.edit() ? '<div class="row" style="margin-top:12px"><button class="btn btn--sm" id="feat-reset">Reset all to default</button></div>' : '')
    + '</div>';
};
TAB_AFTER.features = (id) => {
  const l = state.detail.d.license;
  const save = async (next, msg) => {
    const before = l.featureOverrides || {};
    if (await act(() => api('/licenses/' + id + '/features', { method: 'PUT', body: { features: next } }), msg,
      { label: 'Undo', run: () => act(() => api('/licenses/' + id + '/features', { method: 'PUT', body: { features: before } }), 'Undone.').then(() => render(true)) })) render(true);
  };
  document.querySelectorAll('[data-feat]').forEach((b) => {
    b.onclick = () => {
      const next = Object.assign({}, l.featureOverrides || {});
      const on = b.getAttribute('aria-checked') !== 'true';
      const def = state.meta.featureCatalogue[b.dataset.feat].default;
      if (on === def) delete next[b.dataset.feat]; else next[b.dataset.feat] = on;
      save(next, (on ? 'Unlocked' : 'Locked') + ': ' + state.meta.featureCatalogue[b.dataset.feat].label + '. Connected PCs update now.');
    };
  });
  if ($('feat-reset')) $('feat-reset').onclick = () => save({}, 'Features reset to default.');
};

TAB_RENDER.activity = (l, d) => {
  const rows = (d.audit || []).map((a) => '<div class="tl"><div class="tl__when">' + esc(fmtDateTime(a.created_at)) + '</div><div><div class="tl__what">' + auditLabel(a) + '</div><div class="tl__who">'
    + esc(a.actor) + (a.ip ? ' · ' + esc(a.ip) : '') + '</div></div></div>').join('');
  return '<div class="card">' + (rows ? '<div class="timeline">' + rows + '</div>' : '<div class="empty">No activity yet.</div>') + '</div>';
};

TAB_RENDER.details = (l) => {
  const sup = !can.edit();
  const f = (name, label, v) => '<label class="field"><span>' + esc(label) + '</span><input class="input" name="' + name + '" value="' + esc(v || '') + '"' + (sup ? ' disabled' : '') + '></label>';
  return '<form class="card" id="details-form"><div class="grid-2">'
    + f('hostelName', 'Hostel name', l.hostelName) + f('contactName', 'Contact person', l.contactName)
    + f('contactPhone', 'Phone', l.contactPhone) + f('city', 'City', l.city) + f('plan', 'Plan', l.plan) + '</div>'
    + '<label class="field" style="margin-top:14px"><span>Internal notes</span><textarea class="textarea" name="notes" placeholder="Calls, promises, payment history…">' + esc(l.notes || '') + '</textarea><small>Never shown to the hostel.</small></label>'
    + '<div class="row" style="margin-top:14px"><button class="btn btn--primary" type="submit">Save</button></div></form>';
};
TAB_AFTER.details = (id) => {
  $('details-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {};
    new FormData(e.target).forEach((v, k) => { body[k] = String(v); });
    if (!can.edit()) { Object.keys(body).forEach((k) => { if (k !== 'notes') delete body[k]; }); }
    if (await act(() => api('/licenses/' + id, { method: 'PATCH', body }), 'Saved.')) render(true);
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Register hostel
// ════════════════════════════════════════════════════════════════════════════
VIEW_RENDER.register = async () => {
  setTitle('Register hostel');
  if (!state.meta.keyIssuingConfigured) return '<div class="alert alert--danger">' + icon('alert') + '<span>Key issuing is not configured on this server (LEGACY_KEY_SECRET).</span></div>';
  const cat = state.meta.featureCatalogue;
  return '<form class="stack" id="reg-form" style="max-width:860px">'
    + '<div class="card"><div class="card__title">Hostel</div><div class="grid-2">'
    + '<label class="field"><span>Hostel name</span><input class="input" name="hostelName" required placeholder="Hostel name"></label>'
    + '<label class="field"><span>Contact person</span><input class="input" name="contactName" placeholder="Full name"></label>'
    + '<label class="field"><span>Phone</span><input class="input" name="contactPhone" placeholder="03XX-XXXXXXX"></label>'
    + '<label class="field"><span>City</span><input class="input" name="city" placeholder="City"></label>'
    + '<label class="field"><span>Plan</span><input class="input" name="plan" placeholder="e.g. Standard"></label>'
    + '<label class="field"><span>Notes</span><input class="input" name="notes" placeholder="Internal only"></label>'
    + '</div></div>'
    + '<div class="card"><div class="card__title">Licence</div><div class="grid-2">'
    + '<label class="field"><span>Expires on</span><input class="input" type="date" name="expiresOn" required value="' + addMonths(12) + '">'
    + '<div class="row" style="margin-top:4px">' + [['1 mo', 1], ['3 mo', 3], ['6 mo', 6], ['1 yr', 12], ['2 yr', 24]].map((x) => '<button type="button" class="btn btn--sm" data-months="' + x[1] + '">' + x[0] + '</button>').join('') + '</div></label>'
    + '<label class="field"><span>PCs allowed</span><input class="input" type="number" min="1" name="maxDevices" value="1"><small>One PC is right for almost every hostel.</small></label>'
    + '</div>'
    + '<div class="field" style="margin-top:14px"><span>Key type</span><div class="seg" id="kv">'
    + '<button type="button" data-kv="5" aria-pressed="true">Bound to one PC (v5) — recommended</button><button type="button" data-kv="4" aria-pressed="false">Classic (v4)</button></div>'
    + '<small id="kv-hint">Needs internet for the first activation only. Once activated on a PC, the key will not work on any other. Needs the 2026-09-24 app release or later.</small></div></div>'
    + '<div class="card"><div class="card__title">Features from day one</div>'
    + Object.keys(cat).map((k) => '<div class="flag"><div><div class="flag__n">' + esc(cat[k].label) + '</div><div class="flag__d">' + esc(cat[k].description) + '</div></div>'
      + '<button type="button" class="switch" role="switch" aria-checked="' + (cat[k].default !== false) + '" data-rfeat="' + esc(k) + '" aria-label="' + esc(cat[k].label) + '"></button></div>').join('')
    + '</div>'
    + '<div class="row"><button class="btn btn--primary" type="submit" id="reg-btn">' + icon('register', 'sm') + 'Register and issue key</button></div>'
    + '</form>';
};
AFTER.register = () => {
  let kv = 5;
  const form = $('reg-form');
  if (!form) return;
  form.querySelectorAll('[data-months]').forEach((b) => { b.onclick = () => { form.expiresOn.value = addMonths(parseInt(b.dataset.months, 10)); }; });
  form.querySelectorAll('[data-kv]').forEach((b) => {
    b.onclick = () => {
      kv = parseInt(b.dataset.kv, 10);
      form.querySelectorAll('[data-kv]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('kv-hint').textContent = kv === 5
        ? 'Needs internet for the first activation only. Once activated on a PC, the key will not work on any other. Needs the 2026-09-24 app release or later.'
        : 'Activates offline on any build. Cannot be held to one PC until that PC connects — use only for a hostel with no internet or an old build.';
    };
  });
  form.querySelectorAll('[data-rfeat]').forEach((b) => { b.onclick = () => b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = { keyVersion: kv };
    ['hostelName', 'contactName', 'contactPhone', 'city', 'plan', 'notes', 'expiresOn'].forEach((k) => { const v = form[k].value.trim(); if (v) body[k] = v; });
    const md = parseInt(form.maxDevices.value, 10);
    if (md) body.maxDevices = md;
    const feats = {};
    form.querySelectorAll('[data-rfeat]').forEach((b) => {
      const on = b.getAttribute('aria-checked') === 'true';
      if (on !== state.meta.featureCatalogue[b.dataset.rfeat].default) feats[b.dataset.rfeat] = on;
    });
    if (Object.keys(feats).length) body.features = feats;
    $('reg-btn').disabled = true;
    const out = await act(() => api('/issue-key', { method: 'POST', body }));
    $('reg-btn').disabled = false;
    if (out) showIssuedKey(out, body);
  };
};

function showIssuedKey(out, body) {
  const l = out.license;
  const msg = 'Assalam o Alaikum' + (body.contactName ? ' ' + body.contactName : '') + ',\n\nYour Hostyllo Offline licence key'
    + (body.hostelName ? ' for ' + body.hostelName : '') + ':\n\n' + out.key + '\n\nValid until ' + fmtDate(l.expiresAt) + '.'
    + (l.keyVersion === 5 ? '\nPlease connect the PC to the internet for the first activation. After that the app works offline, on that PC only.' : '')
    + '\n\n— Hostyllo';
  $('view').innerHTML = '<div class="stack" style="max-width:720px">'
    + '<div class="alert alert--success">' + icon('check') + '<span><b>' + esc(l.hostelName || 'Hostel') + ' is registered.</b> The key is shown once — copy it now.</span></div>'
    + '<div class="card"><div class="card__title">Licence key</div><div class="keybox" id="key-out"></div>'
    + '<div class="row" style="margin-top:12px"><button class="btn btn--primary" id="copy-key">' + icon('copy', 'sm') + 'Copy key</button>'
    + '<button class="btn" id="copy-msg">' + icon('copy', 'sm') + 'Copy message for WhatsApp</button>'
    + '<button class="btn" id="open-h">Open hostel</button><button class="btn btn--ghost" id="another">Register another</button></div></div>'
    + '<div class="card"><div class="card__title">Message</div><pre class="code" id="msg-out"></pre></div></div>';
  $('key-out').textContent = out.key;
  $('msg-out').textContent = msg;
  const copy = (t, m) => navigator.clipboard.writeText(t).then(() => toast(m, 'success'), () => toast('Copy failed — select the text and copy it.', 'error'));
  $('copy-key').onclick = () => copy(out.key, 'Key copied.');
  $('copy-msg').onclick = () => copy(msg, 'Message copied.');
  $('open-h').onclick = () => go('#/hostel/' + l.id);
  $('another').onclick = () => render();
}

// ════════════════════════════════════════════════════════════════════════════
// Fleet controls
// ════════════════════════════════════════════════════════════════════════════
VIEW_RENDER.fleet = async () => {
  setTitle('Fleet controls');
  const f = await api('/fleet');
  state.fleet = f;
  const owner = can.owner();
  const tri = (k, cur) => '<div class="seg" data-ffeat="' + esc(k) + '">' + [['', 'Default'], ['on', 'On'], ['off', 'Off']].map((o) =>
    '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '"' + (owner ? '' : ' disabled') + '>' + o[1] + '</button>').join('') + '</div>';
  const cat = f.catalogue;
  return '<div class="stack" style="max-width:900px">'
    + '<div class="alert alert--warning">' + icon('alert') + '<span><b>These apply to every hostel at once.</b> Connected PCs update within seconds. A hostel’s own setting beats the fleet setting for features; for printing, exporting and data entry, either one can switch it off.</span></div>'
    + '<div class="card"><div class="card__title">Features — every hostel</div>'
    + Object.keys(cat).map((k) => { const cur = k in f.features ? (f.features[k] ? 'on' : 'off') : '';
      return '<div class="flag"><div><div class="flag__n">' + esc(cat[k].label) + '</div><div class="flag__d">' + esc(cat[k].description) + '</div><div class="flag__s">Catalogue default: ' + (cat[k].default ? 'on' : 'off') + '</div></div>' + tri(k, cur) + '</div>'; }).join('')
    + '</div>'
    + '<div class="card"><div class="card__title">Switch off for every hostel</div>'
    + Object.keys(f.restrictionCatalogue).map((k) => '<div class="flag"><div><div class="flag__n">' + esc(f.restrictionCatalogue[k]) + '</div></div>'
      + '<button type="button" class="switch" role="switch" aria-checked="' + (f.restrictions[k] !== false) + '" data-frestr="' + esc(k) + '"' + (owner ? '' : ' disabled') + '></button></div>').join('')
    + '</div>'
    + (owner ? '<div class="row"><button class="btn btn--primary" id="fleet-save">Review and apply to every hostel</button><span class="faint" style="font-size:12px">Revision ' + esc(f.revision) + ' · updated ' + esc(fmtDateTime(f.updatedAt)) + '</span></div>'
      : '<div class="faint">Only the owner can change fleet-wide settings.</div>')
    + '</div>';
};
AFTER.fleet = () => {
  document.querySelectorAll('[data-ffeat] button').forEach((b) => {
    b.onclick = () => b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  document.querySelectorAll('[data-frestr]').forEach((b) => { b.onclick = () => b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); });
  if (!$('fleet-save')) return;
  $('fleet-save').onclick = async () => {
    const features = {}, restrictions = {};
    document.querySelectorAll('[data-ffeat]').forEach((g) => { const v = g.querySelector('[aria-pressed="true"]').dataset.v; if (v) features[g.dataset.ffeat] = v === 'on'; });
    document.querySelectorAll('[data-frestr]').forEach((b) => { if (b.getAttribute('aria-checked') !== 'true') restrictions[b.dataset.frestr] = false; });
    const n = state.summary ? state.summary.licenses.total : 'every';
    const v = await modal({ title: 'Apply to all ' + n + ' hostels?', danger: true, confirm: 'Apply fleet-wide', password: true, typeToConfirm: 'EVERY HOSTEL',
      body: 'Features: ' + esc(Object.keys(features).map((k) => k + ' ' + (features[k] ? 'on' : 'off')).join(', ') || 'all default')
        + '<br>Switched off: ' + esc(Object.keys(restrictions).join(', ') || 'nothing'),
      fields: [{ name: 'reason', label: 'Reason (for the audit log)' }] });
    if (!v) return;
    if (await act(() => api('/fleet', { method: 'PUT', body: { features, restrictions, reason: v.reason || undefined, password: v.password } }), 'Applied to every hostel. Connected PCs update now.')) render();
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Audit
// ════════════════════════════════════════════════════════════════════════════
const AUDIT_LABELS = {
  'license.issue': 'Registered hostel and issued key', 'license.status': 'Changed access', 'license.level_auto_lift': 'Timed level lifted on its own',
  'license.expiry': 'Moved expiry', 'license.renew': 'Renewed', 'license.features': 'Changed features', 'license.restrictions': 'Changed print / export / data entry',
  'license.update': 'Edited details', 'license.device_limit': 'Changed PC limit', 'license.bulk_status': 'Bulk: access', 'license.bulk_expiry': 'Bulk: expiry',
  'license.bulk_features': 'Bulk: features', 'license.bulk_restrictions': 'Bulk: print / export', 'device.release': 'Released a PC', 'device.reactivate': 'Re-activated a PC',
  'device.status': 'Changed a PC', 'fleet.update': 'Changed fleet-wide settings', 'admin.login': 'Signed in', 'admin.logout': 'Signed out', 'admin.create': 'Added an admin',
  'admin.update': 'Changed an admin', 'admin.password': 'Changed password', 'admin.totp_enable': 'Turned on 2FA', 'admin.totp_disable': 'Turned off 2FA'
};
function auditLabel(a) {
  const d = a.details || {};
  let extra = '';
  if (a.action === 'license.status' && d.to) {
    extra = [d.to.status && (LEVELS[d.to.status] || {}).label, d.to.until && 'until ' + fmtDate(d.to.until), d.to.verification, d.reason && '“' + d.reason + '”'].filter(Boolean).join(' · ');
  } else if (a.action === 'license.expiry' || a.action === 'license.renew') extra = (d.direction === 'shorten' ? 'shortened' : 'extended') + ' to ' + fmtDate(d.to);
  else if (a.action === 'license.level_auto_lift') extra = 'back to ' + ((LEVELS[d.to] || {}).label || d.to);
  else if (a.action === 'device.release' && d.reason) extra = '“' + d.reason + '”';
  else if (a.action.startsWith('license.bulk_') && d.batch) extra = d.batch + ' hostels' + (d.status ? ' → ' + ((LEVELS[d.status] || {}).label || d.status) : '') + (d.days ? ' · ' + d.days + ' d' : '');
  const who = a.hostel_name ? ' — <a href="#/hostel/' + esc(a.target_id) + '">' + esc(a.hostel_name) + '</a>' : '';
  return '<b>' + esc(AUDIT_LABELS[a.action] || a.action) + '</b>' + (extra ? ' <span class="muted">' + esc(extra) + '</span>' : '') + who;
}

VIEW_RENDER.audit = async () => {
  setTitle('Audit log');
  state.audit = { rows: await api('/audit?limit=200'), action: '', actor: '' };
  return auditHtml();
};
function auditHtml() {
  const rows = state.audit.rows.map((a) => '<tr><td class="num sub" style="white-space:nowrap">' + esc(fmtDateTime(a.created_at)) + '</td><td>' + auditLabel(a) + '</td><td class="sub">' + esc(a.actor) + '</td><td class="sub mono">' + esc(a.ip || '') + '</td></tr>').join('');
  return '<div class="stack"><div class="row">'
    + '<select class="select" id="au-action" style="max-width:240px"><option value="">Every action</option>'
    + [['license.status', 'Access changes'], ['license.issue', 'Keys issued'], ['license.expiry', 'Expiry moves'], ['license.features', 'Feature changes'], ['license.restrictions', 'Print / export'], ['device.', 'PCs'], ['fleet.', 'Fleet'], ['license.bulk', 'Bulk'], ['admin.', 'Admins and sign-ins']]
      .map((o) => '<option value="' + o[0] + '"' + (state.audit.action === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>'
    + '<input class="input" id="au-actor" style="max-width:220px" placeholder="Actor email" value="' + esc(state.audit.actor) + '">'
    + '<button class="btn" id="au-go">Filter</button><button class="btn" id="au-csv">' + icon('download', 'sm') + 'Export CSV</button></div>'
    + '<div class="card card--flush"><div class="table-wrap"><table class="t"><thead><tr><th>When</th><th>What</th><th>Who</th><th>IP</th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="4"><div class="empty">Nothing matches.</div></td></tr>') + '</tbody></table></div></div>'
    + '<div class="faint" style="font-size:12px">Insert-only: the database refuses to edit or delete a row.</div></div>';
}
AFTER.audit = () => {
  $('au-go').onclick = async () => {
    state.audit.action = $('au-action').value; state.audit.actor = $('au-actor').value.trim();
    const q = new URLSearchParams({ limit: '500' });
    if (state.audit.action) q.set('action', state.audit.action);
    if (state.audit.actor) q.set('actor', state.audit.actor);
    state.audit.rows = await api('/audit?' + q.toString());
    $('view').innerHTML = auditHtml(); AFTER.audit();
  };
  $('au-csv').onclick = () => {
    const cell = (v) => { const s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['When', 'Action', 'Hostel', 'Actor', 'IP', 'Details']].concat(state.audit.rows.map((a) => [fmtDateTime(a.created_at), a.action, a.hostel_name || '', a.actor, a.ip || '', JSON.stringify(a.details || {})]));
    const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
    const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'hostyllo-audit-' + isoDate(new Date()) + '.csv'; el.click();
  };
};

// ════════════════════════════════════════════════════════════════════════════
// System
// ════════════════════════════════════════════════════════════════════════════
VIEW_RENDER.system = async () => {
  setTitle('System health');
  const s = await api('/system');
  const card = (label, ok, main, sub) => '<div class="card"><div class="kpi__l">' + esc(label) + '</div>'
    + '<div class="row" style="margin:10px 0 6px"><span class="' + (ok ? 'dot-on' : 'dot-off') + '" style="' + (ok ? '' : 'background:var(--danger);opacity:1') + '"></span><b class="' + (ok ? 'c-success' : 'c-danger') + '">' + esc(main) + '</b></div>'
    + '<div class="faint" style="font-size:12px">' + esc(sub) + '</div></div>';
  return '<div class="stack"><div class="grid-3">'
    + card('Database', s.db === 'ok', s.db === 'ok' ? 'Operational' : 'Down', s.dbLatencyMs + ' ms round trip')
    + card('Licence signing', s.signing === 'ok', s.signing === 'ok' ? 'Signing' : 'Not configured', 'ENTITLEMENT_SIGNING_JWK')
    + card('Live push', s.realtime === 'listening', s.realtime === 'listening' ? 'Listening' : 'Not listening', s.streamsThisInstance + ' app streams on this instance · ' + s.devicesOnline + ' PCs online')
    + card('Key issuing', s.keyIssuing === 'ok', s.keyIssuing === 'ok' ? 'Enabled' : 'Not configured', 'LEGACY_KEY_SECRET')
    + card('Process', true, 'Up ' + Math.floor(s.uptimeSeconds / 3600) + ' h ' + Math.floor(s.uptimeSeconds % 3600 / 60) + ' min', s.node + ' · ' + s.env)
    + card('Licence policy', true, s.policy.graceDays + ' days grace', 'Offline cache ' + s.policy.cacheDays + ' days · read-only on expiry: ' + (s.policy.readOnlyOnExpiry ? 'yes' : 'no'))
    + '</div><div class="card"><div class="card__title">GET /admin/api/system</div><pre class="code"></pre></div></div>';
};
AFTER.system = () => { const pre = document.querySelector('#view pre.code'); if (pre) api('/system').then((s) => { pre.textContent = JSON.stringify(s, null, 2); }).catch(() => {}); };

// ════════════════════════════════════════════════════════════════════════════
// Admins
// ════════════════════════════════════════════════════════════════════════════
VIEW_RENDER.admins = async () => {
  setTitle('Admins');
  if (!can.owner()) return '<div class="alert alert--warning">' + icon('lock') + '<span>Only the owner manages admins.</span></div>';
  const rows = (await api('/admins')).map((u) => '<tr><td><div class="name">' + esc(u.name || u.email) + '</div><div class="sub">' + esc(u.email) + '</div></td>'
    + '<td><span class="chip chip--' + (u.role === 'owner' ? 'violet' : u.role === 'admin' ? 'accent' : '') + '">' + esc(u.role) + '</span></td>'
    + '<td>' + (u.is_active ? '<span class="chip chip--success">Active</span>' : '<span class="chip chip--danger">Disabled</span>') + '</td>'
    + '<td>' + (u.totp_enabled ? '<span class="chip chip--success">On</span>' : '<span class="chip chip--warning">Off</span>') + '</td>'
    + '<td class="sub">' + esc(u.last_login_at ? ago(u.last_login_at) : 'never') + '</td><td class="num">' + esc(u.sessions) + '</td>'
    + '<td>' + (u.id === state.user.id ? '<span class="faint">You</span>' : '<button class="btn btn--sm" data-admin="' + esc(u.id) + '" data-role="' + esc(u.role) + '" data-active="' + u.is_active + '">Manage</button>') + '</td></tr>').join('');
  return '<div class="stack"><div class="row" style="justify-content:flex-end"><button class="btn btn--primary" id="add-admin">' + icon('plus', 'sm') + 'Add admin</button></div>'
    + '<div class="card card--flush"><div class="table-wrap"><table class="t"><thead><tr><th>Person</th><th>Role</th><th>Account</th><th>2FA</th><th>Last sign-in</th><th>Sessions</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
    + '<div class="card"><div class="card__title">Roles</div><div class="kv">'
    + '<div><span>Support</span><span>Reads everything, keeps notes. Changes nothing.</span></div>'
    + '<div><span>Admin</span><span>Access levels (not revoke), expiry, features, print/export, PCs, bulk, issuing keys.</span></div>'
    + '<div><span>Owner</span><span>Everything, plus revoke, fleet-wide switches and admins.</span></div></div></div></div>';
};
AFTER.admins = () => {
  if ($('add-admin')) $('add-admin').onclick = async () => {
    const v = await modal({ title: 'Add an admin', confirm: 'Add', password: true, fields: [
      { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'name', label: 'Name' },
      { name: 'role', label: 'Role', type: 'select', value: 'support', options: [['support', 'Support — read only'], ['admin', 'Admin'], ['owner', 'Owner']] },
      { name: 'tempPassword', label: 'Temporary password (12+ characters)', type: 'text', required: true, mono: true, value: Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''),
        hint: 'Send it to them privately. They should change it and turn on 2FA at first sign-in.' }] });
    if (!v) return;
    if (await act(() => api('/admins', { method: 'POST', body: { email: v.email, name: v.name || undefined, role: v.role, tempPassword: v.tempPassword, password: v.password } }), 'Admin added.')) render();
  };
  document.querySelectorAll('[data-admin]').forEach((b) => {
    b.onclick = async () => {
      const v = await modal({ title: 'Manage admin', confirm: 'Apply', password: true, fields: [
        { name: 'role', label: 'Role', type: 'select', value: b.dataset.role, options: [['support', 'Support'], ['admin', 'Admin'], ['owner', 'Owner']] },
        { name: 'active', label: 'Account', type: 'select', value: b.dataset.active, options: [['true', 'Active'], ['false', 'Disabled']] },
        { name: 'extra', label: 'Also', type: 'select', value: '', options: [['', 'Nothing else'], ['signOut', 'Sign them out everywhere'], ['resetTotp', 'Reset their 2FA (lost phone)']] }] });
      if (!v) return;
      const body = { password: v.password };
      if (v.role !== b.dataset.role) body.role = v.role;
      if (v.active !== b.dataset.active) body.isActive = v.active === 'true';
      if (v.extra) body[v.extra] = true;
      if (await act(() => api('/admins/' + b.dataset.admin, { method: 'PATCH', body }), 'Saved.')) render();
    };
  });
};

// ════════════════════════════════════════════════════════════════════════════
// My security
// ════════════════════════════════════════════════════════════════════════════
VIEW_RENDER.security = async () => {
  setTitle('My security');
  const me = await api('/me');
  state.user = me.user; paintChrome();
  const on = me.user.totpEnabled;
  return '<div class="grid-2" style="max-width:980px">'
    + '<div class="card"><div class="card__title">Two-factor sign-in ' + (on ? '<span class="chip chip--success">On</span>' : '<span class="chip chip--warning">Off</span>') + '</div>'
    + (on ? '<p class="muted" style="margin-bottom:14px">Signing in needs your password and a 6-digit code from your authenticator app.</p><button class="btn btn--danger" id="totp-off">Turn off 2FA</button>'
      : '<p class="muted" style="margin-bottom:14px">Add Google Authenticator, Microsoft Authenticator or any TOTP app. Anyone who learns your password still cannot sign in without your phone.</p>'
        + '<button class="btn btn--primary" id="totp-setup">' + icon('security', 'sm') + 'Set up 2FA</button><div id="totp-flow"></div>')
    + '</div>'
    + '<form class="card" id="pw-form"><div class="card__title">Password</div><div class="stack">'
    + '<label class="field"><span>Current password</span><input class="input" type="password" name="password" required autocomplete="current-password"></label>'
    + '<label class="field"><span>New password</span><input class="input" type="password" name="newPassword" minlength="12" required autocomplete="new-password"><small>12 characters or more. Signs out your other sessions.</small></label>'
    + '<div><button class="btn btn--primary" type="submit">Change password</button></div></div></form></div>';
};
AFTER.security = () => {
  $('pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (await act(() => api('/me/password', { method: 'POST', body: { password: f.password.value, newPassword: f.newPassword.value } }), 'Password changed. Other sessions were signed out.')) f.reset();
  };
  if ($('totp-setup')) $('totp-setup').onclick = async () => {
    const s = await act(() => api('/me/totp/setup', { method: 'POST' }));
    if (!s) return;
    $('totp-flow').innerHTML = '<div class="stack" style="margin-top:14px">'
      + '<div class="field"><span>1. In your authenticator app choose “Enter a setup key” and type this key</span><div class="keybox" style="font-size:16px" id="totp-secret"></div></div>'
      + '<div class="field"><span>Or paste this link into an app that accepts one</span><pre class="code" id="totp-uri"></pre></div>'
      + '<label class="field"><span>2. Enter the 6-digit code it shows</span><div class="row"><input class="input mono" id="totp-code" inputmode="numeric" maxlength="6" style="max-width:140px" placeholder="123456"><button class="btn btn--primary" id="totp-enable">Turn on</button></div></label></div>';
    $('totp-secret').textContent = s.secret.replace(/(.{4})/g, '$1 ').trim();
    $('totp-uri').textContent = s.uri;
    $('totp-enable').onclick = async () => {
      if (await act(() => api('/me/totp/enable', { method: 'POST', body: { code: $('totp-code').value.trim() } }), '2FA is on. You will need your phone to sign in.')) render();
    };
  };
  if ($('totp-off')) $('totp-off').onclick = async () => {
    const v = await modal({ title: 'Turn off 2FA?', danger: true, confirm: 'Turn off', password: true, fields: [{ name: 'code', label: 'Current 6-digit code', mono: true, required: true }] });
    if (!v) return;
    if (await act(() => api('/me/totp/disable', { method: 'POST', body: { password: v.password, code: v.code } }), '2FA is off.')) render();
  };
};

boot();
