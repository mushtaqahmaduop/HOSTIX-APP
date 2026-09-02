/* ─── HOSTYLLO — FIRST-RUN SETUP ──────────────────────────────────────────────
   Loaded by index.html after settings.js (it calls bulkRoomPlan from rooms.js
   and the auth helpers from auth-nev.js).

   WHAT THIS IS FOR. A brand-new install opens on a login screen, and behind it
   an empty app: hostel called "Hostel Name", no rooms, no charges, and a
   built-in account whose password is printed in the source. That is the first
   thirty seconds a paying customer ever spends with this product, and until
   now nothing in it asked them a single question.

   WHEN IT RUNS. After activation, after login, on an install that has never
   been set up — never in the middle of a session, and never on top of a
   working hostel. See needsSetup(), which is deliberately conservative.

   IT IS NOT A GATE. Every step can be skipped and the whole thing can be
   dismissed; nothing here is required for the app to work, because a warden
   who just wants to get to the dashboard must always be able to. What it
   cannot be is LOSSY: each step saves as it completes, so closing the app
   half-way through resumes where it stopped rather than starting again.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── SHOULD IT RUN AT ALL? ───────────────────────────────────────────────────

   THE DANGEROUS ANSWER IS "yes" ON A HOSTEL THAT IS ALREADY RUNNING. Fifty-odd
   installs in the field have no setupCompletedAt, because the field did not
   exist when they were set up. Keying purely off that flag would put a setup
   wizard in front of every one of them at their next login, on top of live
   data, offering to create rooms they already have.

   So the flag is only half of it: an install holding rooms or students has
   plainly been in use and is never asked. That leaves exactly one population
   getting the wizard — an install with no data and no record of setup, which
   is what a fresh one is. */
function needsSetup() {
  try {
    if (!DB || !DB.settings) return false;
    if (DB.settings.setupCompletedAt) return false;
    if ((DB.rooms || []).length)    return false;
    if ((DB.students || []).length) return false;
    return true;
  } catch (e) { return false; }
}

/* Step the flow resumes at. Stored so a half-finished setup survives a close. */
function _setupStep() {
  const n = Number(DB.settings.setupStep);
  return Number.isFinite(n) && n >= 0 && n < ONB_STEPS.length ? n : 0;
}

let _onbStep = 0;
let _onbBatches = [];      // room batches created during this run, for the summary

/* ── ENTRY POINTS ───────────────────────────────────────────────────────── */

/** Called after login. Runs the wizard only if this install has never been set up. */
function maybeRunSetup() {
  if (!needsSetup()) return false;
  _onbStep = _setupStep();
  _onbBatches = [];
  openSetup();
  return true;
}

/** Settings → "Run setup again". Always opens, from the first step. */
function openSetupAgain() {
  if (typeof requirePerm === 'function' && !requirePerm('settings')) return;
  _onbStep = 0;
  _onbBatches = [];
  openSetup();
}

function openSetup() {
  let host = document.getElementById('onb');
  if (!host) {
    host = document.createElement('div');
    host.id = 'onb';
    document.body.appendChild(host);
  }
  host.style.display = 'flex';
  document.body.classList.add('onb-open');
  renderSetup();
}

async function closeSetup(completed) {
  const host = document.getElementById('onb');
  if (host) host.style.display = 'none';
  document.body.classList.remove('onb-open');
  if (completed) {
    DB.settings.setupCompletedAt = new Date().toISOString();
    DB.settings.setupStep = null;
    await saveDB();
    logActivity('Setup Completed', 'First-run setup finished', 'Settings');
  }
  if (typeof renderPage === 'function') renderPage('dashboard');
}

/** Leave setup without finishing it. The flag is NOT set, so it offers again. */
async function skipSetup() {
  showConfirm('Skip setup?',
    'You can finish this later from Settings, and nothing you have already entered is lost.',
    async () => {
      DB.settings.setupStep = _onbStep;
      await saveDB();
      closeSetup(false);
      toast('Setup skipped — pick it up any time from Settings', 'info');
    });
}

/* ── THE STEPS ──────────────────────────────────────────────────────────── */

const ONB_STEPS = [
  { key: 'hostel',  title: 'Your hostel',      sub: 'What should appear on receipts and reports' },
  { key: 'offer',   title: 'What you offer',   sub: 'Rooms only, or rooms and food' },
  { key: 'charges', title: 'Charges',          sub: 'What a bed costs, by room type' },
  { key: 'rooms',   title: 'Rooms',            sub: 'Create your rooms floor by floor' },
  { key: 'account', title: 'Your account',     sub: 'Set a password only you know' },
  { key: 'done',    title: 'Ready',            sub: '' },
];

function renderSetup() {
  const host = document.getElementById('onb');
  if (!host) return;
  const step = ONB_STEPS[_onbStep];
  const last = _onbStep === ONB_STEPS.length - 1;

  host.innerHTML = `
    <div class="onb-box">
      <div class="onb-rail">
        <div class="onb-brand">${escHtml(DB.settings.appName || 'HOSTYLLO')}</div>
        <div class="onb-steps">
          ${ONB_STEPS.map((s, i) => `
            <div class="onb-step${i === _onbStep ? ' is-on' : ''}${i < _onbStep ? ' is-done' : ''}">
              <span class="onb-step__n">${i < _onbStep ? '&#10003;' : i + 1}</span>
              <span class="onb-step__l">${escHtml(s.title)}</span>
            </div>`).join('')}
        </div>
        ${!last ? `<button class="onb-skip" onclick="skipSetup()">Skip for now</button>` : ''}
      </div>

      <div class="onb-main">
        <div class="onb-head">
          <div class="onb-head__t">${escHtml(step.title)}</div>
          ${step.sub ? `<div class="onb-head__s">${escHtml(step.sub)}</div>` : ''}
        </div>
        <div class="onb-body" id="onb-body">${_onbRenderStep(step.key)}</div>
        <div class="onb-foot">
          ${_onbStep > 0 && !last
            ? `<button class="btn btn-secondary" onclick="onbBack()">Back</button>` : '<span></span>'}
          ${last
            ? `<button class="btn btn-primary" onclick="onbFinish()">Start using ${escHtml(DB.settings.appName || 'HOSTYLLO')}</button>`
            : `<button class="btn btn-primary" id="onb-next" onclick="onbNext()">Continue</button>`}
        </div>
      </div>
    </div>`;

  if (typeof _onbAfterRender[step.key] === 'function') _onbAfterRender[step.key]();
}

function _onbRenderStep(key) {
  switch (key) {
    case 'hostel':  return _onbHostel();
    case 'offer':   return _onbOffer();
    case 'charges': return _onbCharges();
    case 'rooms':   return _onbRooms();
    case 'account': return _onbAccount();
    case 'done':    return _onbDone();
  }
  return '';
}

/* Anything that needs to run once the markup is in the DOM. */
const _onbAfterRender = {
  rooms:   () => onbRoomPreview(),
  account: () => onbPwCheck(),
};

/* ── 1. HOSTEL IDENTITY ─────────────────────────────────────────────────── */
function _onbHostel() {
  const s = DB.settings;
  const v = x => escHtml(x || '');
  return `
    <div class="onb-note">This is what prints on every receipt and report. You can change it later in Settings.</div>
    <div class="onb-grid">
      <div class="onb-f onb-f--wide">
        <label for="onb-name">Hostel name <i>*</i></label>
        <input class="form-control" id="onb-name" maxlength="60" value="${v(s.hostelName === 'Hostel Name' ? '' : s.hostelName)}"
               placeholder="The name your students know it by" oninput="onbTouch()">
      </div>
      <div class="onb-f onb-f--wide">
        <label for="onb-loc">Address</label>
        <input class="form-control" id="onb-loc" maxlength="120" value="${v(s.location)}" placeholder="Street and city">
      </div>
      <div class="onb-f">
        <label for="onb-phone">Phone</label>
        <input class="form-control" id="onb-phone" maxlength="30" value="${v(s.phone)}" placeholder="Contact number">
      </div>
      <div class="onb-f">
        <label for="onb-email">Email</label>
        <input class="form-control" id="onb-email" maxlength="60" value="${v(s.email)}" placeholder="Optional">
      </div>
    </div>`;
}

async function _onbSaveHostel() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const name = g('onb-name').trim();
  if (!name) { toast('Enter your hostel name', 'error'); document.getElementById('onb-name')?.focus(); return false; }
  DB.settings.hostelName = name;
  DB.settings.location   = g('onb-loc').trim();
  DB.settings.phone      = g('onb-phone').trim();
  DB.settings.email      = g('onb-email').trim();
  return true;
}

/* ── 2. WHAT THIS HOSTEL OFFERS ─────────────────────────────────────────── */
function _onbOffer() {
  const cur = serviceModel();
  return `
    <div class="onb-note">This decides whether the app talks about food at all. It is changeable later, and nothing is lost either way.</div>
    <div class="svc-opts onb-offer">
      ${SERVICE_MODELS.map(m => `
        <button class="svc-opt${m.id === cur ? ' is-on' : ''}" onclick="onbPickOffer('${m.id}')">
          <span class="svc-opt__dot"></span>
          <span class="svc-opt__b">
            <span class="svc-opt__l">${escHtml(m.label)}</span>
            <span class="svc-opt__h">${escHtml(m.hint)}</span>
          </span>
        </button>`).join('')}
    </div>`;
}

function onbPickOffer(id) {
  if (!SERVICE_MODELS.some(m => m.id === id)) return;
  DB.settings.serviceModel = id;
  document.getElementById('onb-body').innerHTML = _onbOffer();
}

/* ── 3. CHARGES BY ROOM TYPE ────────────────────────────────────────────── */
function _onbCharges() {
  const mess = hostelServesMess();
  const cur  = DB.settings.currency || 'PKR';
  return `
    <div class="onb-note">Set what you charge for each kind of room. Leave a row at 0 if you do not have that kind${mess ? '. Mess is the food charge, billed on top of the rent' : ''}.</div>
    <div class="onb-rates${mess ? '' : ' onb-rates--nomess'}">
      <div class="onb-rates__h">
        <span>Room type</span><span>Rent / month (${escHtml(cur)})</span>${mess ? `<span>Mess / month (${escHtml(cur)})</span>` : ''}
      </div>
      ${(DB.settings.roomTypes || []).map(t => `
        <div class="onb-rate">
          <span class="onb-rate__n">${escHtml(t.name)}<small>${t.capacity} bed${t.capacity > 1 ? 's' : ''}</small></span>
          <input class="form-control" type="number" min="0" id="onb-rent-${escHtml(t.id)}" value="${Number(t.defaultRent) || ''}" placeholder="0">
          ${mess ? `<input class="form-control" type="number" min="0" id="onb-mess-${escHtml(t.id)}" value="${Number(t.defaultMess) || ''}" placeholder="0">` : ''}
        </div>`).join('')}
    </div>`;
}

function _onbSaveCharges() {
  const mess = hostelServesMess();
  for (const t of (DB.settings.roomTypes || [])) {
    const r = document.getElementById('onb-rent-' + t.id);
    if (r) t.defaultRent = Math.max(0, Number(r.value) || 0);
    if (mess) {
      const m = document.getElementById('onb-mess-' + t.id);
      if (m) t.defaultMess = Math.max(0, Number(m.value) || 0);
    }
  }
  return true;
}

/* ── 4. ROOMS ───────────────────────────────────────────────────────────── */
function _onbRooms() {
  const typeOpts  = (DB.settings.roomTypes || []).map(t => `<option value="${escHtml(t.id)}">${escHtml(t.name)}</option>`).join('');
  const floorOpts = (DB.settings.floors || []).map(f => `<option value="${escHtml(f)}">${escHtml(f)} Floor</option>`).join('');
  return `
    <div class="onb-note">Add a floor at a time. Numbers that already exist are skipped, so you can run this as many times as you need.</div>
    <div class="onb-rm">
      <div class="onb-f"><label for="onb-rm-floor">Floor</label>
        <select class="form-control" id="onb-rm-floor">${floorOpts}</select></div>
      <div class="onb-f"><label for="onb-rm-type">Room type</label>
        <select class="form-control" id="onb-rm-type" onchange="onbRoomPreview()">${typeOpts}</select></div>
      <div class="onb-f"><label for="onb-rm-prefix">Prefix</label>
        <input class="form-control" id="onb-rm-prefix" maxlength="4" placeholder="optional" oninput="formatRoomNumber(this);onbRoomPreview()"></div>
      <div class="onb-f"><label for="onb-rm-from">From</label>
        <input class="form-control" id="onb-rm-from" maxlength="5" placeholder="01" inputmode="numeric" oninput="onbRoomPreview()"></div>
      <div class="onb-f"><label for="onb-rm-to">To</label>
        <input class="form-control" id="onb-rm-to" maxlength="5" placeholder="12" inputmode="numeric" oninput="onbRoomPreview()"></div>
      <button class="btn btn-primary onb-rm__go" id="onb-rm-go" onclick="onbAddRooms()" disabled>Add these</button>
    </div>
    <div class="brk-preview" id="onb-rm-preview"></div>
    <div class="onb-made" id="onb-made">${_onbMadeHtml()}</div>`;
}

function _onbMadeHtml() {
  const total = (DB.rooms || []).length;
  if (!total) return '';
  const beds = (DB.rooms || []).reduce((s, r) => {
    const t = (DB.settings.roomTypes || []).find(x => x.id === r.typeId);
    return s + ((t && t.capacity) || 0);
  }, 0);
  return `<div class="onb-made__t"><b>${total}</b> room${total > 1 ? 's' : ''} · <b>${beds}</b> bed${beds !== 1 ? 's' : ''} so far</div>` +
    (_onbBatches.length ? `<div class="onb-made__l">${_onbBatches.map(b => `<span class="brk-chip">${escHtml(b)}</span>`).join('')}</div>` : '');
}

/* Same planner the Rooms page uses, so the preview here and the batch there
   cannot disagree about what a duplicate is. */
function onbRoomPreview() {
  const box = document.getElementById('onb-rm-preview');
  const go  = document.getElementById('onb-rm-go');
  if (!box) return;
  const g = id => (document.getElementById(id) || {}).value || '';
  if (!g('onb-rm-from') && !g('onb-rm-to')) {
    box.innerHTML = '';
    if (go) go.disabled = true;
    return;
  }
  const plan = bulkRoomPlan({ prefix: g('onb-rm-prefix'), from: g('onb-rm-from'), to: g('onb-rm-to') });
  const type = (DB.settings.roomTypes || []).find(t => t.id === g('onb-rm-type'));
  const cap  = (type && type.capacity) || 0;

  if (plan.error || !plan.create.length) {
    box.innerHTML = '<div class="brk-msg is-bad">' +
      escHtml(plan.error || 'Every room in that range already exists.') + '</div>';
    if (go) go.disabled = true;
    return;
  }
  const shown = plan.create.slice(0, 40);
  const more  = plan.create.length - shown.length;
  box.innerHTML =
    '<div class="brk-sum"><b>' + plan.create.length + '</b> room' + (plan.create.length > 1 ? 's' : '') +
      (cap ? ' · <b>' + plan.create.length * cap + '</b> beds' : '') + '</div>' +
    '<div class="brk-chips">' + shown.map(n => '<span class="brk-chip">' + escHtml(n) + '</span>').join('') +
      (more > 0 ? '<span class="brk-chip is-more">+' + more + ' more</span>' : '') + '</div>' +
    (plan.skip.length ? '<div class="brk-msg is-warn"><b>' + plan.skip.length +
      '</b> already exist and will be left alone</div>' : '');
  if (go) go.disabled = false;
}

async function onbAddRooms() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const floor = g('onb-rm-floor');
  const type  = (DB.settings.roomTypes || []).find(t => t.id === g('onb-rm-type'));
  if (!floor || !type) { toast('Pick a floor and a room type', 'error'); return; }
  const plan = bulkRoomPlan({ prefix: g('onb-rm-prefix'), from: g('onb-rm-from'), to: g('onb-rm-to') });
  if (plan.error || !plan.create.length) { toast(plan.error || 'Nothing to add', 'error'); return; }

  const rent = Number(type.defaultRent) || 0;
  for (const num of plan.create) {
    DB.rooms.push({ id: 'room_' + uid(), number: num, floor, typeId: type.id, rent,
                    studentIds: [], amenities: ROOM_AMENITY_DEFAULTS.slice(), notes: '' });
  }
  DB.rooms.sort((a, b) => cmpRoomNo(a.number, b.number));
  _onbBatches.push(floor + ': ' + plan.create[0] + '-' + plan.create[plan.create.length - 1]);
  logActivity('Rooms Added', plan.create.length + ' rooms on ' + floor + ' Floor (setup)', 'Room');
  await saveDB();

  for (const id of ['onb-rm-from', 'onb-rm-to']) { const el = document.getElementById(id); if (el) el.value = ''; }
  onbRoomPreview();
  const made = document.getElementById('onb-made');
  if (made) made.innerHTML = _onbMadeHtml();
  toast(plan.create.length + ' rooms added', 'success');
}

/* ── 5. THE ACCOUNT ─────────────────────────────────────────────────────── */
function _onbAccount() {
  const u = (CUR_USER && CUR_USER.username) || 'warden1';
  return `
    <div class="onb-note" id="onb-pw-note">Checking this account…</div>
    <div class="onb-grid">
      <div class="onb-f onb-f--wide">
        <label>Signed in as</label>
        <input class="form-control" value="${escHtml(u)}" readonly>
      </div>
      <div class="onb-f onb-f--wide">
        <label for="onb-pw">New password</label>
        <input class="form-control" id="onb-pw" type="password" autocomplete="new-password"
               placeholder="At least 6 characters" oninput="onbPwSync()">
      </div>
      <div class="onb-f onb-f--wide">
        <label for="onb-pw2">Repeat it</label>
        <input class="form-control" id="onb-pw2" type="password" autocomplete="new-password"
               placeholder="Type it again" oninput="onbPwSync()">
        <div class="onb-err" id="onb-pw-err"></div>
      </div>
    </div>`;
}

/* Is this account still on the password the installer shipped? If so the step
   stops being optional — that password is printed in the source of an app
   anyone can download. */
let _onbPwIsDefault = false;
async function onbPwCheck() {
  _onbPwIsDefault = false;
  try {
    if (CUR_USER && CUR_USER.pw && typeof verifyPassword === 'function')
      _onbPwIsDefault = await verifyPassword(DEFAULT_PASSWORD, CUR_USER.pw);
  } catch (e) { /* treat an unreadable hash as "not default" and let them skip */ }
  const note = document.getElementById('onb-pw-note');
  if (note) {
    note.innerHTML = _onbPwIsDefault
      ? 'This account still uses the password the app ships with, which is the same on every install. Set your own before anyone else uses this computer.'
      : 'Your password is already your own. You can change it here or leave it as it is.';
    note.classList.toggle('is-warn', _onbPwIsDefault);
  }
  onbPwSync();
}

function onbPwSync() {
  const a = (document.getElementById('onb-pw')  || {}).value || '';
  const b = (document.getElementById('onb-pw2') || {}).value || '';
  const err = document.getElementById('onb-pw-err');
  const btn = document.getElementById('onb-next');
  let msg = '';
  if (a && a.length < 6)      msg = 'At least 6 characters.';
  else if (a && b && a !== b) msg = 'The two do not match.';
  if (err) err.textContent = msg;
  // Blocked only while the shipped password is still in place and nothing valid
  // has been typed. Otherwise Continue means "leave it alone".
  if (btn) btn.disabled = !!msg || (_onbPwIsDefault && !a);
  if (btn) btn.textContent = _onbPwIsDefault && !a ? 'Set a password to continue' : 'Continue';
}

async function _onbSaveAccount() {
  const a = (document.getElementById('onb-pw')  || {}).value || '';
  const b = (document.getElementById('onb-pw2') || {}).value || '';
  if (!a) {
    if (_onbPwIsDefault) { toast('Set a password before continuing', 'error'); return false; }
    return true;                                   // left deliberately unchanged
  }
  if (a !== b)      { toast('The two passwords do not match', 'error'); return false; }
  try {
    WARDENS[CUR_ROLE].pw = await hashNewPassword(a);
    saveWardenConfig();
    sessionStorage.setItem('pw_warned', '1');       // it is no longer the default
    logActivity('Password Changed', 'Account password set during setup', 'Settings');
    return true;
  } catch (e) {
    toast(e.message || 'Could not set that password', 'error');
    return false;
  }
}

/* ── 6. DONE ────────────────────────────────────────────────────────────── */
function _onbDone() {
  const rooms = (DB.rooms || []).length;
  const beds  = (DB.rooms || []).reduce((s, r) => {
    const t = (DB.settings.roomTypes || []).find(x => x.id === r.typeId);
    return s + ((t && t.capacity) || 0);
  }, 0);
  const info = serviceModelInfo();
  return `
    <div class="onb-done">
      <div class="onb-done__m">${escHtml(DB.settings.hostelName || 'Your hostel')} is set up.</div>
      <div class="onb-sum">
        <div class="onb-sum__c"><span class="onb-sum__v">${rooms}</span><span class="onb-sum__l">Rooms</span></div>
        <div class="onb-sum__c"><span class="onb-sum__v">${beds}</span><span class="onb-sum__l">Beds</span></div>
        <div class="onb-sum__c"><span class="onb-sum__v onb-sum__v--txt">${escHtml(info.short)}</span><span class="onb-sum__l">Billing</span></div>
      </div>
      <div class="onb-next">
        <div class="onb-next__t">Adding your students</div>
        <div class="onb-next__b">Add them one at a time from the Students page, or bring a whole list in at once from
          <b>Settings &rarr; Import Students from Excel / CSV</b>, which has a template to fill in.</div>
      </div>
    </div>`;
}

/* ── NAVIGATION ─────────────────────────────────────────────────────────── */

/* Each step commits its own answers before the next one is drawn, and the
   position is stored with them. That is what makes closing the app mid-setup
   resumable rather than a restart. */
const _onbSavers = {
  hostel:  _onbSaveHostel,
  charges: _onbSaveCharges,
  account: _onbSaveAccount,
};

async function onbNext() {
  const key = ONB_STEPS[_onbStep].key;
  const save = _onbSavers[key];
  if (save) {
    const ok = await save();
    if (!ok) return;
  }
  _onbStep = Math.min(_onbStep + 1, ONB_STEPS.length - 1);
  DB.settings.setupStep = _onbStep;
  await saveDB();
  renderSetup();
}

function onbBack() {
  _onbStep = Math.max(0, _onbStep - 1);
  renderSetup();
}

async function onbFinish() {
  await closeSetup(true);
  toast('Setup complete — welcome to ' + (DB.settings.appName || 'HOSTYLLO'), 'success');
}

function onbTouch() { /* placeholder for per-field validation hooks */ }
