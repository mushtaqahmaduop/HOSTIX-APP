/* ─── HOSTYLLO — PIN TO CONFIRM MONEY (warden ledger spec §3.5, §5 step 10) ───
   Owner, 2026-09-15. Off by default; an admin switches it on per account in
   Users → Edit user. Once on, the account confirms with its own 4-digit PIN
   every time it changes collected money: Add Payment, the student row's payment
   form, Mark paid, Bulk mark paid, Reverse, an Edit that changes Amount paid,
   and a checkout settlement. Wrong PINs have no limit (owner).

   The PIN is the account's own. It is hashed exactly like the password
   (hashPassword / verifyPassword in auth-nev.js) and kept beside it in the
   account store, so nobody — an admin included — can read one back. An admin
   can only CLEAR a PIN; the account sets a new one the next time it is needed.

   Every PIN box is type=password, so pw-eye.js gives it the show/hide eye. */

function pinValid(s) { return /^\d{4}$/.test(String(s == null ? '' : s)); }
function pinIsRequired(u) { return !!(u && u.pinRequired === true); }
function pinHasOne(u) { return !!(u && u.pin && typeof u.pin === 'object' && u.pin.hash); }

/* Does the signed-in account confirm money with a PIN? The money paths test
   this BEFORE awaiting pinConfirm(), so an account without PIN switched on
   saves exactly as it did before step 10 — synchronously, with no extra tick
   between the click and the record being written. */
function pinNeeded() {
  const id = typeof CUR_ROLE !== 'undefined' ? CUR_ROLE : '';
  return pinIsRequired(id && typeof WARDENS !== 'undefined' ? WARDENS[id] : null);
}

/** True when `plain` is this account's PIN. */
async function pinCheck(accountId, plain) {
  const u = WARDENS[accountId];
  if (!pinValid(plain) || !pinHasOne(u)) return false;
  return !!(await verifyPassword(String(plain), u.pin));
}

/** Sets or changes a PIN. Only the signed-in account sets its own. */
async function pinSet(accountId, plain) {
  const u = WARDENS[accountId];
  if (!u) return { ok: false, reason: 'Account not found.' };
  if (accountId !== CUR_ROLE) return { ok: false, reason: 'Only the account itself can set its PIN.' };
  if (!pinValid(plain)) return { ok: false, reason: 'The PIN is exactly 4 digits.' };
  const had = pinHasOne(u);
  u.pin = await hashPassword(String(plain));
  saveWardenConfig();
  logActivity(had ? 'PIN Changed' : 'PIN Set', u.name || u.username || accountId, 'Settings');
  await saveDB();
  return { ok: true };
}

/** An administrator clears a forgotten PIN. It never sees or chooses one. */
async function pinClear(accountId) {
  const u = WARDENS[accountId];
  if (!u) return { ok: false, reason: 'Account not found.' };
  if (!(typeof canDo === 'function' && canDo('users'))) return { ok: false, reason: 'Only an administrator can clear a PIN.' };
  if (!pinHasOne(u)) return { ok: false, reason: 'This account has no PIN.' };
  delete u.pin;
  saveWardenConfig();
  logActivity('PIN Cleared', u.name || u.username || accountId, 'Settings');
  await saveDB();
  return { ok: true };
}

/**
 * Asks the signed-in account for its PIN when it has to. Resolves true when the
 * action may go ahead — no PIN required, the right PIN, or (no PIN yet) a new
 * one set there and then — and false on Cancel. `what` names the action, e.g.
 * "posting Rs. 5,000".
 *
 * Its own layer, appended after #modal-container, so it opens OVER a payment
 * form that is itself a modal instead of replacing it.
 */
function pinConfirm(opts) {
  const id = typeof CUR_ROLE !== 'undefined' ? CUR_ROLE : '';
  const u  = id ? WARDENS[id] : null;
  if (!pinIsRequired(u)) return Promise.resolve(true);
  const stale = document.getElementById('pin-layer');
  if (stale) stale.remove();

  const setting = !pinHasOne(u);
  const what = opts && opts.what ? String(opts.what) : 'posting a payment';
  const box = (fid, label, ph) => `
    <div class="field"><label for="${fid}">${label}</label>
      <div class="hf-in"><span class="hf-in__i">${icon('lock', 'sm')}</span>
        <input class="form-control" id="${fid}" type="password" inputmode="numeric" maxlength="4"
               autocomplete="off" placeholder="${ph}"></div></div>`;

  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.id = 'pin-layer';
    layer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="pin-title">
          <div class="modal-header"><div class="modal-title">
            <div class="hf-mh"><div class="hf-mh__ico">${icon('lock', 'sm')}</div>
              <div><div class="hf-mh__t" id="pin-title">${setting ? 'Set your PIN' : 'Confirm with your PIN'}</div>
              <div class="hf-mh__s">${escHtml((u.name || u.username || id) + ' · ' + what)}</div></div></div>
          </div></div>
          <div class="modal-body">
            ${setting
              ? box('pin-new', 'New PIN', '4 digits') + box('pin-again', 'Repeat PIN', 'Type it again')
                + `<div class="cfg-note">${icon('info', 'xs')}<span>This account confirms payments with a PIN. 4 digits — only you know it.</span></div>`
              : box('pin-new', 'PIN', 'Your 4-digit PIN')}
            <div id="pin-err" role="alert" style="display:none;margin-top:8px;font-size:12px;font-weight:600;color:var(--red)"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-pin="cancel">Cancel</button>
            <button type="button" class="btn btn-primary" data-pin="ok">${setting ? 'Set &amp; continue' : 'Confirm'}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(layer);

    const $ = sel => layer.querySelector(sel);
    const okBtn = $('[data-pin="ok"]');
    const err = msg => { const e = $('#pin-err'); e.textContent = msg; e.style.display = msg ? '' : 'none'; };
    layer.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
      const v = inp.value.replace(/\D/g, '').slice(0, 4);
      if (v !== inp.value) inp.value = v;
      err('');
    }));

    let busy = false;
    const finish = ok => {
      document.removeEventListener('keydown', onKey, true);
      layer.remove();
      resolve(ok);
    };
    const submit = async () => {
      if (busy) return;
      const a = $('#pin-new').value;
      if (setting) {
        const b = $('#pin-again').value;
        if (!pinValid(a)) { err('The PIN is exactly 4 digits.'); $('#pin-new').focus(); return; }
        if (a !== b) { err('The two PINs do not match.'); $('#pin-again').value = ''; $('#pin-again').focus(); return; }
        busy = true; okBtn.disabled = true;
        const r = await pinSet(id, a);
        busy = false; okBtn.disabled = false;
        if (!r.ok) { err(r.reason); return; }
        if (typeof toast === 'function') toast('PIN set', 'success');
        finish(true);
      } else {
        if (!pinValid(a)) { err('Enter your 4-digit PIN.'); $('#pin-new').focus(); return; }
        busy = true; okBtn.disabled = true;
        const good = await pinCheck(id, a);
        busy = false; okBtn.disabled = false;
        if (good) { finish(true); return; }
        err('Wrong PIN — try again.');
        $('#pin-new').value = '';
        $('#pin-new').focus();
      }
    };
    // Capture phase: app.js handles Escape on the bubble phase for the page.
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
    };
    document.addEventListener('keydown', onKey, true);
    okBtn.addEventListener('click', submit);
    $('[data-pin="cancel"]').addEventListener('click', () => finish(false));
    setTimeout(() => { const f = $('#pin-new'); if (f) f.focus(); }, 30);
  });
}
