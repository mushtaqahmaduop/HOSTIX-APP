/* ─── HOSTYLLO — NO PLACEHOLDER NAME ON PAPER (owner, 2026-09-15) ────────────
   config.js seeds `hostelName: 'Hostel Name'` and modals.js writes the same
   words into any install that lacks one, so the setting is never empty — every
   `hostelName || '…'` fallback was skipped and receipts, profiles and registers
   printed the literal words "Hostel Name" as their masthead.

   Owner's call: ask before printing. Every print and export starts with
   hostelNameGate(); while the name is missing it asks once, saves it exactly
   where Settings → Hostel Info keeps it, and then runs the print. A hostel
   with a real name prints exactly as before — the gate returns false at once
   and the print carries on synchronously.

   Its own layer, appended after #modal-container, so it opens over the receipt
   preview or any other modal instead of replacing it. */

const HOSTEL_NAME_PLACEHOLDER = 'Hostel Name';

/** True while the hostel has no real name: empty, or still the seeded placeholder. */
function hostelNameMissing() {
  const n = String((typeof DB !== 'undefined' && DB.settings && DB.settings.hostelName) || '').trim();
  return !n || n.toLowerCase() === HOSTEL_NAME_PLACEHOLDER.toLowerCase();
}

/**
 * Prints call this first: `if (hostelNameGate(() => printX(id))) return;`.
 * Returns false when a name is set, so the print carries on. Otherwise it asks,
 * returns true, and runs `retry` once the name is saved (never on Cancel).
 */
function hostelNameGate(retry) {
  if (!hostelNameMissing()) return false;
  ensureHostelName().then(ok => { if (ok && typeof retry === 'function') retry(); });
  return true;
}

/** Saves the name where Settings → Hostel Info keeps it, and repaints where it shows. */
async function hostelNameSave(name) {
  const n = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  if (!n) return { ok: false, reason: 'Enter the hostel name.' };
  if (n.toLowerCase() === HOSTEL_NAME_PLACEHOLDER.toLowerCase()) return { ok: false, reason: "Enter your hostel's own name." };
  if (n.length > 60) return { ok: false, reason: 'Keep the name to 60 characters.' };
  DB.settings.hostelName = n;
  if (typeof document !== 'undefined') {
    const sb = document.getElementById('sb-hostel-name');
    if (sb) sb.textContent = n;
    const ln = document.getElementById('login-hostel-name');
    if (ln) ln.textContent = n;
  }
  if (typeof window !== 'undefined' && typeof window.setTitlebarHostel === 'function') window.setTitlebarHostel();
  if (typeof logActivity === 'function') logActivity('Hostel Info Updated', n + ' (asked before printing)', 'Settings');
  if (typeof saveDB === 'function') await saveDB();
  return { ok: true, name: n };
}

/** Asks for the name. Resolves true once saved, false on Cancel. */
function ensureHostelName() {
  if (!hostelNameMissing()) return Promise.resolve(true);
  const stale = document.getElementById('hostel-name-layer');
  if (stale) stale.remove();

  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.id = 'hostel-name-layer';
    layer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="hostel-name-title">
          <div class="modal-header"><div class="modal-title">
            <div class="hf-mh"><div class="hf-mh__ico">${icon('building', 'sm')}</div>
              <div><div class="hf-mh__t" id="hostel-name-title">What is your hostel's name?</div>
              <div class="hf-mh__s">It goes at the top of every receipt and printed document.</div></div></div>
          </div></div>
          <div class="modal-body">
            <div class="field"><label for="hostel-name-in">Hostel name</label>
              <div class="hf-in"><span class="hf-in__i">${icon('building', 'sm')}</span>
                <input class="form-control" id="hostel-name-in" maxlength="60" autocomplete="off" placeholder="Your hostel's name"></div></div>
            <div class="cfg-note">${icon('info', 'xs')}<span>Saved in Settings &rarr; Hostel Info, where it can be changed later. You are asked only once.</span></div>
            <div id="hostel-name-err" role="alert" style="display:none;margin-top:8px;font-size:12px;font-weight:600;color:var(--red)"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-hn="cancel">Cancel</button>
            <button type="button" class="btn btn-primary" data-hn="ok">Save &amp; continue</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(layer);

    const $ = sel => layer.querySelector(sel);
    const okBtn = $('[data-hn="ok"]');
    const err = msg => { const e = $('#hostel-name-err'); e.textContent = msg; e.style.display = msg ? '' : 'none'; };
    $('#hostel-name-in').addEventListener('input', () => err(''));

    let busy = false;
    const finish = ok => {
      document.removeEventListener('keydown', onKey, true);
      layer.remove();
      resolve(ok);
    };
    const submit = async () => {
      if (busy) return;
      busy = true; okBtn.disabled = true;
      const r = await hostelNameSave($('#hostel-name-in').value);
      busy = false; okBtn.disabled = false;
      if (!r.ok) { err(r.reason); $('#hostel-name-in').focus(); return; }
      if (typeof toast === 'function') toast('Hostel name saved — ' + r.name, 'success');
      finish(true);
    };
    // Capture phase: app.js handles Escape on the bubble phase for the page.
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
    };
    document.addEventListener('keydown', onKey, true);
    okBtn.addEventListener('click', submit);
    $('[data-hn="cancel"]').addEventListener('click', () => finish(false));
    setTimeout(() => { const f = $('#hostel-name-in'); if (f) f.focus(); }, 30);
  });
}
