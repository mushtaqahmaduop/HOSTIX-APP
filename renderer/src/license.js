/* ─── DAMAM HOSTEL — LICENSE SYSTEM (renderer side — PATCHED) ───────────────
   Communicates with main process via window.electronAPI (preload.js).
   Runs at startup: if license invalid → shows activation screen, blocks app.
   Also provides deactivateLicense() for the Settings page.

   FIXES:
   FIX-L1  maxlength corrected to 21 (HOSTEL-XXXX-XXXX-XXXX = 6+1+4+1+4+1+4 = 21 chars).
   FIX-L2  licDoActivate validates key length using 21.
   FIX-L3  Activate button double-click race condition fixed — disable on click.
   FIX-L4  licFormatKey rewritten — handles partial input and paste correctly.
   FIX-L5  Machine ID shown as truncated (first 16 chars + …) for privacy.
   ─────────────────────────────────────────────────────────────────────────── */

// Phase 7 stubs
function checkOnlineLicense() { return Promise.resolve({ valid: true, mode: 'offline' }); }
function syncLicense()        { return Promise.resolve({ synced: false, reason: 'offline' }); }
function checkUpdates()       { return Promise.resolve({ hasUpdate: false }); }

// ── STARTUP LICENSE CHECK ─────────────────────────────────────────────────────
(async function initLicenseCheck() {
  if (!window.electronAPI || !window.electronAPI.licenseCheck) {
    console.warn('[License] electronAPI not available — skipping (dev mode).');
    return;
  }
  let status;
  try {
    status = await window.electronAPI.licenseCheck();
    window._damam_license_cache = status;
  } catch(e) {
    status = { valid: false, reason: 'ipc_error' };
  }
  if (status.valid) {
    _injectLicenseBadge(status);
    return;
  }
  console.warn('[License] Invalid:', status.reason);
  _showActivationScreen(status.reason, status.expiry);
})();

// ── INJECT SMALL BADGE INTO LOGIN SCREEN (when valid) ────────────────────────
function _injectLicenseBadge(status) {
  try {
    const exp   = new Date(status.expiry).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'});
    const badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;bottom:10px;right:12px;z-index:99990;'
      + 'font-size:9px;color:#2ec98a;font-family:monospace;opacity:0.6;pointer-events:none;';
    badge.textContent = '✅ Licensed · Exp: ' + exp;
    document.body.appendChild(badge);
  } catch(e) {}
}

// ── ACTIVATION SCREEN ─────────────────────────────────────────────────────────
function _showActivationScreen(reason, expiry) {
  const msgs = {
    not_activated: 'This software is not yet activated. Enter your license key to continue.',
    expired:       'Your license expired on ' + (expiry ? new Date(expiry).toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'}) : 'an unknown date') + '. Contact support for renewal.',
    wrong_machine: 'This license is bound to a different computer. Deactivate it there first or contact support.',
    tampered:      '⚠️ License file has been tampered with. The application cannot start.',
    corrupt:       '⚠️ License file is corrupted. Please re-activate or contact support.',
    ipc_error:     '⚠️ Could not verify license. Please restart the application.',
    time_cheat:    '⚠️ System time manipulation detected. Set your clock to the correct time and restart.'
  };
  const msg        = msgs[reason] || 'License verification failed. Please contact support.';
  const canActivate = ['not_activated','expired','corrupt'].includes(reason);

  // [FIX-L5] Show truncated machine ID (first 16 chars only for privacy)
  if (window.electronAPI && window.electronAPI.licenseMachineId) {
    window.electronAPI.licenseMachineId().then(function(id) {
      const el = document.getElementById('lic-machine-id');
      if (el) el.textContent = id ? (id.slice(0, 16) + '…' + id.slice(-8)) : '—';
    }).catch(function(){});
  }

  const screen = document.getElementById('license-screen');
  if (!screen) { console.error('[License] #license-screen missing from index.html'); return; }

  screen.innerHTML = '<div style="background:#071428;border:1px solid #1e3c6a;border-radius:22px;'
    + 'padding:42px 38px;width:100%;max-width:460px;box-shadow:0 24px 80px rgba(0,0,0,0.85);'
    + 'text-align:center;position:relative;overflow:hidden;">'
    + '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#e05252,#7c3aed,#e05252);border-radius:22px 22px 0 0;"></div>'
    + '<div style="width:68px;height:68px;border-radius:17px;background:linear-gradient(135deg,#1e3c6a,#2a5298);'
    + 'display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:30px;">🔐</div>'
    + '<div style="font-size:20px;font-weight:900;color:#a78bfa;margin-bottom:6px;font-family:\'DM Serif Display\',serif;">License Activation</div>'
    + '<div style="font-size:10px;color:#4d6a90;margin-bottom:20px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">HOSTIX — Hostel Management</div>'
    + '<div style="background:' + (canActivate ? 'rgba(30,60,106,0.4)' : 'rgba(224,82,82,0.15)') + ';'
    + 'border:1px solid ' + (canActivate ? '#1e3c6a' : 'rgba(224,82,82,0.4)') + ';'
    + 'border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;'
    + 'color:' + (canActivate ? '#8fa5c8' : '#e05252') + ';line-height:1.6;text-align:left;">'
    + msg + '</div>'
    + (canActivate
      ? '<div style="margin-bottom:10px;text-align:left;">'
        + '<div style="font-size:11px;color:#4d6580;margin-bottom:6px;font-weight:700;">LICENSE KEY</div>'
        // [FIX-L1] maxlength corrected to 21 (HOSTEL-XXXX-XXXX-XXXX = 6+1+4+1+4+1+4 = 21 chars)
        + '<input id="lic-key-input" type="text" maxlength="21" placeholder="HOSTEL-XXXX-XXXX-XXXX"'
        + ' oninput="licFormatKey(this)"'
        + ' style="width:100%;box-sizing:border-box;padding:12px 16px;background:#0f1a2e;'
        + 'border:1px solid #1e3050;border-radius:10px;color:#e8eef8;font-size:15px;'
        + 'font-family:\'JetBrains Mono\',\'Courier New\',monospace;outline:none;letter-spacing:1px;text-transform:uppercase;"'
        + ' onfocus="this.style.borderColor=\'#7c3aed\'" onblur="this.style.borderColor=\'#1e3050\'"'
        + ' onkeydown="if(event.key===\'Enter\')licDoActivate()">'
        + '</div>'
        + '<div id="lic-error" style="color:#e05252;font-size:12px;margin-bottom:8px;min-height:16px;display:none;"></div>'
        + '<div id="lic-success" style="color:#2ec98a;font-size:12px;margin-bottom:8px;min-height:16px;display:none;"></div>'
        + '<button id="lic-activate-btn" onclick="licDoActivate()"'
        + ' style="width:100%;padding:13px;background:linear-gradient(135deg,#1e5fd4,#2a7aed);'
        + 'color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;'
        + 'font-family:inherit;cursor:pointer;margin-bottom:14px;">🔑 Activate License</button>'
      : '')
    + '<div style="background:#0a1525;border-radius:8px;padding:10px 14px;text-align:left;">'
    + '<div style="font-size:10px;color:#4d6580;margin-bottom:4px;font-weight:700;">MACHINE ID (share with support)</div>'
    + '<div id="lic-machine-id" style="font-size:11px;color:#8fa5c8;font-family:\'JetBrains Mono\',\'Courier New\',monospace;'
    + 'word-break:break-all;letter-spacing:0.5px;">Loading…</div>'
    + '</div></div>';

  screen.style.display = 'flex';

  const ls = document.getElementById('login-screen');
  if (ls) ls.style.display = 'none';

  // Auto-focus the key input
  if (canActivate) {
    setTimeout(function () {
      const inp = document.getElementById('lic-key-input');
      if (inp) inp.focus();
    }, 150);
  }
}

// ── [FIX-L4] FORMAT KEY INPUT (auto-insert dashes, handles paste & backspace) ─
// [FIX-L7] Handles paste of already-formatted keys (e.g. HOSTEL-ABCD-EFGH-IJKL)
function licFormatKey(inp) {
  // Strip everything except alphanumeric — handles pasted keys with dashes/spaces
  var raw   = inp.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Ensure HOSTEL prefix
  var body  = raw.startsWith('HOSTEL') ? raw.slice(6) : raw;

  // Build formatted parts (max 12 body chars = 3 groups of 4)
  // This correctly reformats both partial input and fully-pasted keys
  var parts = [];
  for (var i = 0; i < body.length && i < 12; i += 4) {
    parts.push(body.slice(i, i + 4));
  }

  var formatted = 'HOSTEL' + (parts.length ? '-' + parts.join('-') : '');

  // Only update if different to preserve cursor on non-modifying keys
  if (inp.value !== formatted) {
    inp.value = formatted;
  }
}

// ── [FIX-L3] ACTIVATE BUTTON — disable on click, prevent double-submit ────────
async function licDoActivate() {
  const inp   = /** @type {HTMLInputElement} */ (document.getElementById('lic-key-input'));
  const errEl = document.getElementById('lic-error');
  const okEl  = document.getElementById('lic-success');
  const btn   = /** @type {HTMLButtonElement} */ (document.getElementById('lic-activate-btn'));
  if (!inp) return;

  // [FIX-L3] Prevent double-click activation
  if (btn && btn.disabled) return;

  const key = inp.value.trim();
  if (errEl) errEl.style.display = 'none';
  if (okEl)  okEl.style.display  = 'none';

  // [FIX-L2] Correct length check: HOSTEL-XXXX-XXXX-XXXX = 6+1+4+1+4+1+4 = 21 characters
  if (!key || key.length < 21) {
    if (errEl) { errEl.textContent = 'Please enter a complete license key (HOSTEL-XXXX-XXXX-XXXX).'; errEl.style.display = 'block'; }
    return;
  }

  // Basic format check before sending to main process
  if (!/^HOSTEL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
    if (errEl) { errEl.textContent = 'Key format is invalid. Expected: HOSTEL-XXXX-XXXX-XXXX'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Activating…'; }
  try {
    const result = await window.electronAPI.licenseActivate(key);
    if (result.success) {
      if (okEl) { okEl.textContent = '✅ ' + result.message + ' Expires: ' + result.expiry; okEl.style.display = 'block'; }
      if (btn)  btn.textContent = '✅ Activated! Reloading…';
      setTimeout(function(){ location.reload(); }, 1800);
    } else {
      if (errEl) { errEl.textContent = '❌ ' + result.reason; errEl.style.display = 'block'; }
      if (btn) { btn.disabled = false; btn.textContent = '🔑 Activate License'; }
    }
  } catch(e) {
    if (errEl) { errEl.textContent = '❌ Error communicating with the app. Please restart.'; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = '🔑 Activate License'; }
  }
}

// ── DEACTIVATE (called from Settings page) ────────────────────────────────────
async function deactivateLicense() {
  if (!window.electronAPI || !window.electronAPI.licenseDeactivate) {
    if(typeof toast==='function') toast('Not available in dev mode.','error'); return;
  }
  if (!confirm('Deactivate this license?\nThe app will require re-activation on next launch.')) return;
  try {
    const result = await window.electronAPI.licenseDeactivate();
    if (result.success) {
      if(typeof toast==='function') toast('License deactivated. Reloading…','info');
      setTimeout(function(){ location.reload(); }, 1500);
    } else {
      if(typeof toast==='function') toast('Failed: '+(result.message||'unknown error'),'error');
    }
  } catch(e) {
    if(typeof toast==='function') toast('Error communicating with app. Please restart.','error');
  }
}

// ── GET LICENSE INFO (for settings page display) ──────────────────────────────
async function getLicenseInfo() {
  if (!window.electronAPI || !window.electronAPI.licenseCheck) return null;
  try { return await window.electronAPI.licenseCheck(); } catch(e) { return null; }
}