/* Control plane — admin portal
   Plain browser JS, no build step, matching the desktop app this service
   exists for. */

'use strict';

// ── API ─────────────────────────────────────────────────────────────────────

/** The CSRF cookie is deliberately readable here — that is what double-submit
    means. The session cookie is HttpOnly and never visible to this script. */
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
  try { body = await res.json(); } catch (_) { /* a 502 from a proxy is not JSON */ }

  if (!res.ok) {
    // A session that expired while the tab sat open should return the operator
    // to the sign-in screen, not show a red box they cannot act on.
    if (res.status === 401 && state.user) return signedOut();
    const err = new Error((body && body.message) || 'Request failed (' + res.status + ')');
    err.code = body && body.code;
    throw err;
  }
  return body.data;
}

// ── Small helpers ───────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

/** Everything user- or database-supplied goes through here before it reaches
    innerHTML. A hostel name is free text typed by whoever sold the licence. */
function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * What the signed-in account may do — the same ranking the server enforces.
 *
 * This hides buttons; it does not secure anything. The server refuses the call
 * regardless, and that is the check that counts. Mirroring it here only means a
 * support user is not offered actions that would come back 403.
 */
const ROLE_RANK = { support: 1, admin: 2, owner: 3 };
function can(min) {
  return (ROLE_RANK[state.user && state.user.role] || 0) >= ROLE_RANK[min];
}

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function daysUntil(v) {
  if (!v) return null;
  return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
}

/** "3 days ago" reads faster than a timestamp when scanning a column. */
function ago(v) {
  if (!v) return 'never';
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  if (days < 365) return Math.floor(days / 30) + ' mo ago';
  return Math.floor(days / 365) + ' yr ago';
}

let toastTimer = null;
function toast(text, bad) {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast' + (bad ? ' toast--bad' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ── State ───────────────────────────────────────────────────────────────────

const state = {
  user: null,
  catalogue: {},
  signingConfigured: false,
  keyIssuingConfigured: false,
  licenses: [],
  openLicenseId: null
};

// ── Sign in ─────────────────────────────────────────────────────────────────

function signedOut() {
  state.user = null;
  $('app').hidden = true;
  $('login').hidden = false;
  $('drawer').hidden = true;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  const err = $('login-error');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    await api('/login', { method: 'POST', body: { email: $('login-email').value, password: $('login-password').value } });
    $('login-password').value = '';
    await boot();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('logout').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch (_) { /* signing out must always work */ }
  signedOut();
});

// ── Views ───────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    for (const v of ['licenses', 'issue', 'audit']) $('view-' + v).hidden = v !== tab.dataset.view;
    if (tab.dataset.view === 'audit') loadAudit();
  });
});

// ── Licences ────────────────────────────────────────────────────────────────

function statusBadge(lic) {
  if (lic.status === 'revoked') return '<span class="badge badge--bad">Revoked</span>';
  if (lic.status === 'suspended') return '<span class="badge badge--warn">Suspended</span>';
  const d = daysUntil(lic.expiresAt);
  if (d === null) return '';
  if (d < 0) return '<span class="badge badge--bad">Expired</span>';
  if (d <= 30) return '<span class="badge badge--warn">' + d + 'd left</span>';
  return '<span class="badge badge--ok">Active</span>';
}

function verificationBadge(lic) {
  if (lic.verification === 'unverified') return '<span class="badge badge--warn">Unverified</span>';
  if (lic.verification === 'rejected') return '<span class="badge badge--bad">Rejected</span>';
  return '';
}

async function loadSummary() {
  const s = await api('/summary');
  const l = s.licenses;
  const cards = [
    ['Licences', l.total, ''],
    ['Active', l.active, ''],
    ['Unverified', l.unverified, l.unverified > 0 ? 'stat--warn' : ''],
    ['Expiring 30d', l.expiring_soon, l.expiring_soon > 0 ? 'stat--warn' : ''],
    ['Expired', l.expired, l.expired > 0 ? 'stat--bad' : ''],
    ['Suspended', l.suspended, l.suspended > 0 ? 'stat--warn' : ''],
    ['Devices', s.devices.total, ''],
    ['Seen this week', s.devices.seen_week, '']
  ];
  $('stats').innerHTML = cards.map(([label, n, cls]) =>
    '<div class="stat ' + cls + '"><div class="stat__n">' + esc(n) + '</div>'
    + '<div class="stat__l">' + esc(label) + '</div></div>').join('');
}

async function loadLicenses() {
  const params = new URLSearchParams();
  if ($('search').value.trim()) params.set('search', $('search').value.trim());
  if ($('filter-status').value) params.set('status', $('filter-status').value);
  if ($('filter-verification').value) params.set('verification', $('filter-verification').value);
  if ($('filter-expiring').checked) params.set('expiring', 'true');

  state.licenses = await api('/licenses?' + params.toString());

  $('licenses-empty').hidden = state.licenses.length > 0;
  $('licenses-body').innerHTML = state.licenses.map((l) =>
    '<tr data-id="' + esc(l.id) + '">'
    + '<td>' + (l.hostelName ? esc(l.hostelName) : '<span class="dim">Unnamed</span>')
      + (l.city ? ' <span class="dim">· ' + esc(l.city) + '</span>' : '') + '</td>'
    + '<td class="mono">' + esc(l.keyHint) + '</td>'
    + '<td>' + statusBadge(l) + ' ' + verificationBadge(l) + '</td>'
    + '<td>' + esc(fmtDate(l.expiresAt)) + (l.renewed ? ' <span class="badge badge--mute">renewed</span>' : '') + '</td>'
    + '<td>' + esc(l.deviceCount || 0) + (l.maxDevices ? ' / ' + esc(l.maxDevices) : ' <span class="dim">/ ∞</span>') + '</td>'
    + '<td class="dim">' + esc(ago(l.lastSeenAt)) + '</td>'
    + '<td class="mono">' + esc(l.appVersion || '—') + '</td>'
    + '</tr>').join('');

  document.querySelectorAll('#licenses-body tr').forEach((tr) => {
    tr.addEventListener('click', () => openLicense(tr.dataset.id));
  });
}

let searchTimer = null;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadLicenses, 220);
});
['filter-status', 'filter-verification', 'filter-expiring'].forEach((id) => {
  $(id).addEventListener('change', loadLicenses);
});

// ── Licence detail ──────────────────────────────────────────────────────────

$('drawer-close').addEventListener('click', closeDrawer);
$('drawer-scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

function closeDrawer() {
  $('drawer').hidden = true;
  state.openLicenseId = null;
}

async function openLicense(id) {
  state.openLicenseId = id;
  $('drawer').hidden = false;
  $('drawer-body').innerHTML = '<div class="empty">Loading…</div>';

  const data = await api('/licenses/' + id);
  const l = data.license;
  const preview = await api('/licenses/' + id + '/preview');

  $('d-title').textContent = l.hostelName || 'Unnamed hostel';
  $('d-sub').innerHTML = esc(l.keyHint) + ' · v' + esc(l.keyVersion)
    + (l.city ? ' · ' + esc(l.city) : '');

  const everConnected = !!l.lastSeenAt;
  const days = daysUntil(l.expiresAt);

  $('drawer-body').innerHTML = [
    // What the customer sees right now — the question an admin has immediately
    // after changing anything on this page.
    '<div class="sect">',
    '  <div class="sect__h">What the app sees right now</div>',
    '  <div class="msg msg--info">',
    '    Status <strong>' + esc(preview.status) + '</strong>',
    '    · grace ' + esc(preview.policy.graceDays) + ' days',
    '    · ' + (preview.policy.readOnlyOnExpiry ? 'read-only past grace' : 'no lock past grace'),
    '  </div>',
    '</div>',

    '<div class="sect">',
    '  <div class="sect__h">Licence</div>',
    '  <dl class="kv">',
    '    <dt>Status</dt><dd>' + statusBadge(l) + ' ' + verificationBadge(l) + '</dd>',
    '    <dt>Expires</dt><dd>' + esc(fmtDate(l.expiresAt))
        + (days !== null ? ' <span class="dim">(' + (days < 0 ? Math.abs(days) + ' days ago' : days + ' days left') + ')</span>' : '') + '</dd>',
    l.renewed ? '    <dt>Key\'s own date</dt><dd class="dim">' + esc(fmtDate(l.keyExpiresAt)) + ' — extended since</dd>' : '',
    '    <dt>Computers</dt><dd>' + esc(l.maxDevices === null ? 'Unlimited' : l.maxDevices)
        + (l.keyVersion === 3 ? ' <span class="dim">· v3 keys were shared between hostels, so they are not capped</span>' : '') + '</dd>',
    '    <dt>Contact</dt><dd>' + esc(l.contactName || '—') + (l.contactPhone ? ' · ' + esc(l.contactPhone) : '') + '</dd>',
    '    <dt>First seen</dt><dd>' + esc(fmtDateTime(l.firstSeenAt)) + '</dd>',
    '    <dt>Last seen</dt><dd>' + esc(ago(l.lastSeenAt)) + '</dd>',
    '    <dt>Notes</dt><dd>' + esc(l.notes || '—') + '</dd>',
    '  </dl>',
    '</div>',

    can('admin') ? '<div class="sect">' : '',
    can('admin') ? '  <div class="sect__h">Renew</div>' : '',
    !can('admin') ? '' : everConnected
      ? '<div class="msg msg--info">This hostel\'s app connects, so extending the date reaches them on their next sync.</div>'
      : '<div class="msg msg--info"><strong>This hostel has never connected.</strong> Extending the date here will not reach them — issue a renewal key and send it instead.</div>',
    can('admin') ? '  <div class="actions">' : '',
    can('admin') ? '    <button class="btn" data-act="renew" data-months="1">+1 month</button>' : '',
    can('admin') ? '    <button class="btn" data-act="renew" data-months="6">+6 months</button>' : '',
    can('admin') ? '    <button class="btn" data-act="renew" data-months="12">+1 year</button>' : '',
    can('admin') ? '    <button class="btn" data-act="renew-date">Pick a date…</button>' : '',
    // Issuing a key is the owner's alone, even the renewal kind.
    can('owner') ? '    <button class="btn btn--primary" data-act="renewal-key">Issue renewal key</button>' : '',
    can('admin') ? '  </div>' : '',
    can('admin') ? '</div>' : '',

    can('admin') ? '<div class="sect">' : '',
    can('admin') ? '  <div class="sect__h">Access</div>' : '',
    can('admin') ? '  <div class="actions">' : '',
    can('admin') && l.verification === 'unverified'
      ? '<button class="btn btn--primary" data-act="verify">Confirm this customer</button>'
        + (can('owner') ? '<button class="btn btn--danger" data-act="reject">Not a customer</button>' : '') : '',
    can('admin') && l.status === 'active' ? '<button class="btn" data-act="suspend">Suspend</button>' : '',
    can('admin') && l.status !== 'active' ? '<button class="btn btn--primary" data-act="reactivate">Reactivate</button>' : '',
    // Revoking, and rejecting — which resolves to REVOKED — are owner-only.
    can('owner') && l.status !== 'revoked' ? '<button class="btn btn--danger" data-act="revoke">Revoke</button>' : '',
    can('admin') ? '    <button class="btn" data-act="limit">Set computer limit…</button>' : '',
    can('admin') ? '    <button class="btn" data-act="edit">Edit details…</button>' : '',
    can('admin') ? '  </div>' : '',
    can('admin') ? '</div>' : '',

    // Said once, plainly, rather than leaving a read-only account to wonder
    // where the buttons went.
    can('admin') ? '' :
      '<div class="sect"><div class="msg msg--info">Your account can view licences but not change them.</div></div>',

    '<div class="sect">',
    '  <div class="sect__h">Features</div>',
    '  <div class="flags">',
    Object.keys(state.catalogue).sort().map((key) => {
      const c = state.catalogue[key];
      const on = l.features[key];
      const overridden = Object.prototype.hasOwnProperty.call(l.featureOverrides, key);
      return '<label class="flag">'
        + '<input type="checkbox" data-flag="' + esc(key) + '"' + (on ? ' checked' : '')
          + (can('admin') ? '' : ' disabled') + '>'
        + '<div><div class="flag__t">' + esc(c.label)
        + (overridden ? ' <span class="badge badge--mute">changed</span>' : '') + '</div>'
        + '<div class="flag__d">' + esc(c.description) + '</div>'
        + '<div class="flag__since">Needs app ' + esc(c.since) + ' or newer</div></div></label>';
    }).join(''),
    '  </div>',
    can('admin') ? '  <div class="actions" style="margin-top:12px">' : '',
    can('admin') ? '    <button class="btn btn--primary" data-act="save-flags">Save features</button>' : '',
    can('admin') ? '  </div>' : '',
    '</div>',

    '<div class="sect">',
    '  <div class="sect__h">Computers (' + data.devices.length + ')</div>',
    data.devices.length === 0 ? '<div class="empty">This licence has never been activated.</div>' : [
      '<div class="tablewrap"><table class="table"><thead><tr>',
      '<th>Machine</th><th>Label</th><th>Status</th><th>Version</th><th>Last seen</th><th></th>',
      '</tr></thead><tbody>',
      data.devices.map((d) =>
        '<tr><td class="mono">' + esc(d.machineShort) + '…</td>'
        + '<td>' + esc(d.label || '—') + '</td>'
        + '<td>' + (d.status === 'active'
            ? '<span class="badge badge--ok">Active</span>'
            // A blocked machine will NOT come back on its own — the app is
            // refused at registration — so it must not read the same as one
            // that is merely idle.
            : d.adminBlocked
              ? '<span class="badge badge--mute">Deactivated here</span>'
              : '<span class="badge badge--mute">Off</span>') + '</td>'
        + '<td class="mono">' + esc(d.appVersion || '—') + '</td>'
        + '<td class="dim">' + esc(ago(d.lastSeenAt)) + '</td>'
        + '<td>' + (!can('admin') ? '' : d.status === 'active'
            ? '<button class="btn btn--sm btn--danger" data-device="' + esc(d.id) + '" data-device-act="deactivated">Deactivate</button>'
            : '<button class="btn btn--sm" data-device="' + esc(d.id) + '" data-device-act="active">Reactivate</button>')
          + '</td></tr>').join(''),
      '</tbody></table></div>'
    ].join(''),
    '</div>',

    '<div class="sect">',
    '  <div class="sect__h">History</div>',
    data.audit.length === 0 ? '<div class="empty">Nothing yet.</div>' : [
      '<div class="tablewrap"><table class="table"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>',
      data.audit.map((a) =>
        '<tr><td class="dim">' + esc(fmtDateTime(a.created_at)) + '</td>'
        + '<td>' + esc(a.actor) + '</td>'
        + '<td>' + esc(a.action) + ' <span class="dim">' + esc(summariseDetails(a.details)) + '</span></td></tr>'
      ).join(''),
      '</tbody></table></div>'
    ].join(''),
    '</div>'
  ].filter(Boolean).join('');

  wireDrawer(l);
}

function summariseDetails(d) {
  if (!d || typeof d !== 'object') return '';
  const bits = [];
  if (d.reason) bits.push('“' + d.reason + '”');
  if (d.to && d.to.status) bits.push('→ ' + d.to.status);
  if (d.to && typeof d.to === 'string') bits.push('→ ' + fmtDate(d.to));
  if (d.expiresOn) bits.push('expires ' + d.expiresOn);
  return bits.join(' ');
}

function wireDrawer(lic) {
  const body = $('drawer-body');

  body.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn, lic));
  });

  body.querySelectorAll('[data-device]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.deviceAct;
      if (status === 'deactivated'
        && !confirm('Deactivate this computer?\n\nThe app on it will stop being licensed and any open session ends immediately. The customer can re-activate by entering their key again.')) return;
      try {
        await api('/devices/' + btn.dataset.device + '/status', { method: 'POST', body: { status } });
        toast(status === 'active' ? 'Computer reactivated' : 'Computer deactivated');
        openLicense(lic.id);
      } catch (e) { toast(e.message, true); }
    });
  });
}

async function handleAction(act, btn, lic) {
  try {
    if (act === 'verify' || act === 'reject') {
      const verification = act === 'verify' ? 'verified' : 'rejected';
      if (act === 'reject' && !confirm('Mark this as NOT a customer?\n\nTheir app will be treated as revoked the next time it connects.')) return;
      await api('/licenses/' + lic.id + '/status', { method: 'POST', body: { verification } });
      toast(act === 'verify' ? 'Customer confirmed' : 'Marked as not a customer');

    } else if (act === 'suspend' || act === 'revoke' || act === 'reactivate') {
      const status = act === 'reactivate' ? 'active' : act === 'suspend' ? 'suspended' : 'revoked';
      let reason = '';
      if (status !== 'active') {
        reason = prompt(status === 'suspended'
          ? 'Why is this hostel being suspended?\n\nTheir app goes read-only — they keep every record and can still print.'
          : 'Why is this licence being revoked?\n\nThis is the strongest step. Their app stops being licensed.') || '';
        if (!reason.trim()) return;
      }
      await api('/licenses/' + lic.id + '/status', { method: 'POST', body: { status, reason: reason || undefined } });
      toast('Status updated');

    } else if (act === 'renew') {
      const months = parseInt(btn.dataset.months, 10);
      const out = await api('/licenses/' + lic.id + '/renew', { method: 'POST', body: { addMonths: months } });
      toast(out.reachesCustomerOnline
        ? 'Renewed to ' + fmtDate(out.license.expiresAt)
        : 'Renewed — but this hostel has never connected, so send them a new key');

    } else if (act === 'renew-date') {
      const v = prompt('New expiry date (YYYY-MM-DD):');
      if (!v) return;
      const out = await api('/licenses/' + lic.id + '/renew', { method: 'POST', body: { expiresAt: v } });
      toast('Renewed to ' + fmtDate(out.license.expiresAt));

    } else if (act === 'renewal-key') {
      const v = prompt('Expiry date for the new key (YYYY-MM-DD):');
      if (!v) return;
      const out = await api('/issue-key', {
        method: 'POST',
        body: {
          expiresOn: v, renewalOf: lic.id,
          hostelName: lic.hostelName || undefined,
          contactName: lic.contactName || undefined,
          contactPhone: lic.contactPhone || undefined,
          city: lic.city || undefined
        }
      });
      // A prompt would be dismissed and the key lost; this stays until copied.
      showIssuedKey(out.key, out.license);
      return;

    } else if (act === 'limit') {
      const v = prompt('How many computers may use this licence?\n\nLeave blank for unlimited.',
        lic.maxDevices === null ? '' : String(lic.maxDevices));
      if (v === null) return;
      const maxDevices = v.trim() === '' ? null : parseInt(v, 10);
      if (maxDevices !== null && (!Number.isFinite(maxDevices) || maxDevices < 1)) {
        return toast('Give a whole number, or leave it blank', true);
      }
      await api('/licenses/' + lic.id + '/devices-limit', { method: 'POST', body: { maxDevices } });
      toast('Computer limit updated');

    } else if (act === 'edit') {
      const hostelName = prompt('Hostel name:', lic.hostelName || '');
      if (hostelName === null) return;
      const contactName = prompt('Contact name:', lic.contactName || '') || '';
      const contactPhone = prompt('Phone:', lic.contactPhone || '') || '';
      const city = prompt('City:', lic.city || '') || '';
      const notes = prompt('Notes:', lic.notes || '') || '';
      await api('/licenses/' + lic.id, {
        method: 'PATCH', body: { hostelName, contactName, contactPhone, city, notes }
      });
      toast('Details saved');

    } else if (act === 'save-flags') {
      const featuresBody = {};
      $('drawer-body').querySelectorAll('[data-flag]').forEach((cb) => {
        featuresBody[cb.dataset.flag] = cb.checked;
      });
      await api('/licenses/' + lic.id + '/features', { method: 'PUT', body: { features: featuresBody } });
      toast('Features saved — they reach the app on its next sync');
    }

    await openLicense(lic.id);
    await loadLicenses();
    await loadSummary();
  } catch (e) {
    toast(e.message, true);
  }
}

// ── Issue key ───────────────────────────────────────────────────────────────

function isoPlus(months, days) {
  const d = new Date();
  if (months) d.setMonth(d.getMonth() + months);
  if (days) d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
}

const PRESETS = [
  ['7 days', () => isoPlus(0, 7)],
  ['14 days', () => isoPlus(0, 14)],
  ['1 month', () => isoPlus(1)],
  ['3 months', () => isoPlus(3)],
  ['6 months', () => isoPlus(6)],
  ['1 year', () => isoPlus(12)],
  ['2 years', () => isoPlus(24)]
];

$('issue-presets').innerHTML = PRESETS
  .map((p, i) => '<button type="button" class="btn" data-preset="' + i + '">' + esc(p[0]) + '</button>').join('');
$('issue-presets').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (btn) $('issue-expires').value = PRESETS[+btn.dataset.preset][1]();
});
$('issue-expires').value = isoPlus(12);

function showIssuedKey(key, license) {
  $('issue-key').textContent = key;
  $('issue-meta').innerHTML = 'Expires ' + esc(fmtDate(license.expiresAt))
    + ' · serial ' + esc(license.serial)
    + ' · ' + esc(license.maxDevices === null ? 'unlimited computers' : license.maxDevices + ' computer(s)')
    + '<br>Recorded as <strong>verified</strong>. It will link to this hostel the moment they activate it.';
  $('issue-result').hidden = false;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === 'issue'));
  for (const v of ['licenses', 'issue', 'audit']) $('view-' + v).hidden = v !== 'issue';
  closeDrawer();
  $('issue-result').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('issue-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('issue-error');
  err.hidden = true;
  try {
    const out = await api('/issue-key', {
      method: 'POST',
      body: {
        expiresOn: $('issue-expires').value,
        hostelName: $('issue-hostel').value.trim() || undefined,
        contactName: $('issue-contact').value.trim() || undefined,
        contactPhone: $('issue-phone').value.trim() || undefined,
        city: $('issue-city').value.trim() || undefined,
        notes: $('issue-notes').value.trim() || undefined,
        maxDevices: parseInt($('issue-devices').value, 10) || 1
      }
    });
    showIssuedKey(out.key, out.license);
    $('issue-form').reset();
    $('issue-expires').value = isoPlus(12);
    $('issue-devices').value = '1';
    loadLicenses();
    loadSummary();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  }
});

$('issue-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('issue-key').textContent);
    toast('Key copied');
  } catch (_) {
    toast('Select the key and copy it manually', true);
  }
});

// ── Audit ───────────────────────────────────────────────────────────────────

async function loadAudit() {
  const rows = await api('/audit?limit=200');
  $('audit-body').innerHTML = rows.length === 0
    ? '<tr><td colspan="4" class="empty">Nothing yet.</td></tr>'
    : rows.map((a) =>
        '<tr><td class="dim">' + esc(fmtDateTime(a.created_at)) + '</td>'
        + '<td>' + esc(a.actor) + '</td>'
        + '<td>' + esc(a.action) + '</td>'
        + '<td class="dim">' + esc(summariseDetails(a.details)) + '</td></tr>').join('');
}

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  let me;
  try {
    me = await api('/me');
  } catch (_) {
    return signedOut();
  }

  state.user = me.user;
  state.catalogue = me.featureCatalogue;
  state.signingConfigured = me.signingConfigured;
  state.keyIssuingConfigured = me.keyIssuingConfigured;

  $('login').hidden = true;
  $('app').hidden = false;
  $('who').textContent = me.user.name || me.user.email;

  // Issuing a key is owner-only on the server, so a tab that always 403s is
  // just a trap. Hidden, not disabled — there is nothing to explain on a
  // screen an account can never use.
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.view === 'issue') t.hidden = !can('owner');
  });

  // A control plane that cannot sign entitlements looks perfectly healthy —
  // devices register, tokens issue — and only fails at the one endpoint that
  // matters. Say so where the operator will see it rather than leaving them to
  // discover it from a customer.
  const warnings = [];
  if (!me.signingConfigured) warnings.push('Entitlement signing is OFF — apps cannot receive licence updates. Set ENTITLEMENT_SIGNING_JWK.');
  if (!me.keyIssuingConfigured) warnings.push('Key issuing is OFF — set LEGACY_KEY_SECRET.');
  $('warnbar').innerHTML = warnings.map(esc).join(' · ');
  $('warnbar').hidden = warnings.length === 0;

  await Promise.all([loadSummary(), loadLicenses()]);
}

boot();
