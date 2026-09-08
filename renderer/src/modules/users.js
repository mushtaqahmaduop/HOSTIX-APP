/* ════════════════════════════════════════════════════════════════════════════
   USER MANAGEMENT — the page, built 2026-09-09 to `user managemnt.png`, with
   the form from `add user.png`.

   IT WAS A MODAL reached from the account menu, drawn in inline styles. The
   reference gives it a stat row, filters, a register and a detail rail, none
   of which belongs in a box you dismiss.

   WHAT AN ACCOUNT ACTUALLY IS. `auth-nev.js` stores
   `{ username, name, phone, perms, active, pw, photo, builtin }` per user, and
   enforces SEVEN permissions: edit, delete, payments, reports, backup,
   settings, users. Everything on this page is that, plus four fields added
   today because the reference asks for them and they cost one line each to
   store: `email`, `department`, `role` and `createdAt`. `lastLogin` is stamped
   by the sign-in path.

   WHAT IS LOCKED, per the owner's rule of 2026-09-08 — drawn, disabled, and
   explained rather than dropped:
     · Locked users     — the sign-in lockout is per session, not stored per
                          account, so nothing can be counted.
     · Sessions         — the app has one window on one machine; there is no
                          session list to show.
     · Security tab     — no audit of password changes or failed sign-ins.
     · Login as user    — impersonation with no server to authorise it.
     · Import           — no importer for accounts.
     · The sub-permissions in the form's group cards. The reference draws about
       thirty; this app enforces seven. Each card's master checkbox IS its real
       permission, and the lines under it are what that permission grants —
       drawn as text, not as checkboxes that would do nothing. Inventing 23
       controls to match a picture is how a warden ends up believing they
       revoked something they did not.

   ROLE IS A PRESET, NOT A SECOND SOURCE OF TRUTH. Picking one ticks a set of
   permissions and is stored as a label; the permissions remain the thing the
   app enforces. A role whose ticks are then edited by hand reads "Custom".
   ════════════════════════════════════════════════════════════════════════════ */

let usersFilter = { search: '', role: 'All', status: 'All', dept: 'All', page: 1, sel: null };

/* The presets. Each names a set of the seven real permissions — nothing here
   grants anything the app does not enforce. */
const USER_ROLES = [
  { key: 'Super Admin',  perms: ['edit','delete','payments','reports','backup','settings','users'] },
  { key: 'Admin',        perms: ['edit','delete','payments','reports','backup','settings'] },
  { key: 'Manager',      perms: ['edit','payments','reports','settings'] },
  { key: 'Accountant',   perms: ['payments','reports'] },
  { key: 'Receptionist', perms: ['edit','payments'] },
  { key: 'Warden',       perms: ['edit','payments','reports'] },
  { key: 'Staff',        perms: ['reports'] },
];

const USER_DEPTS = ['Management', 'Administration', 'Finance', 'Front Desk', 'Hostel', 'Maintenance', 'Security'];

/** Which preset a user's ticks match, or Custom. Stored role is a hint only. */
function usrRole(u) {
  const on = PERM_KEYS.filter(k => u.perms && u.perms[k] === true).sort().join(',');
  const hit = USER_ROLES.find(r => r.perms.slice().sort().join(',') === on);
  if (hit) return hit.key;
  return u.role && USER_ROLES.some(r => r.key === u.role) ? 'Custom' : 'Custom';
}

function usrRoleHue(role) {
  return role === 'Super Admin' ? 'dh-violet' : role === 'Admin' ? 'dh-blue'
       : role === 'Manager' ? 'dh-blue' : role === 'Accountant' ? 'dh-amber'
       : role === 'Receptionist' ? 'dh-green' : role === 'Warden' ? 'dh-green' : 'dh-slate';
}

/** Access level, derived from how much of the app the ticks reach. */
function usrLevel(u) {
  const n = PERM_KEYS.filter(k => u.perms && u.perms[k] === true).length;
  return n === PERM_KEYS.length ? 'Full access'
       : u.perms && u.perms.users ? 'Administrator'
       : n === 0 ? 'No access' : 'Limited access';
}

function usrList() {
  return Object.keys(WARDENS).map(id => Object.assign({ id }, WARDENS[id] || {}));
}

function usrFiltered() {
  const f = usersFilter;
  const q = f.search.trim().toLowerCase();
  return usrList().filter(u => {
    if (f.status === 'Active' && u.active === false) return false;
    if (f.status === 'Inactive' && u.active !== false) return false;
    if (f.role !== 'All' && usrRole(u) !== f.role) return false;
    if (f.dept !== 'All' && (u.department || '') !== f.dept) return false;
    if (q) {
      const hay = [u.name, u.username, u.email, u.phone, u.department, usrRole(u)]
        .filter(Boolean).join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function _usrWhen(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const td = today();
  const day = ymd(d);
  const t = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (day === td) return { top: 'Today', sub: t };
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (day === ymd(y)) return { top: 'Yesterday', sub: t };
  return { top: fmtDate(day), sub: t };
}

function usrAvatar(u, size) {
  const s = size || 38;
  if (u.photo) return `<img class="usr-av" src="${escHtml(u.photo)}" alt="" style="width:${s}px;height:${s}px">`;
  const ini = String(u.name || u.username || '?').trim().charAt(0).toUpperCase();
  return `<div class="usr-av usr-av--ini ${usrRoleHue(usrRole(u))}" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px">${escHtml(ini)}</div>`;
}

/* ── THE PAGE ─────────────────────────────────────────────────────────────── */
function renderUsers() {
  if (typeof canDo === 'function' && !canDo('users')) {
    return `<div class="empty-state"><div class="icon">${icon('lock','sm')}</div>
      <h3>You cannot manage users</h3>
      <p>Ask an administrator for the “Manage users” permission.</p></div>`;
  }

  const all = usrList();
  const rows = usrFiltered();
  const nActive = all.filter(u => u.active !== false).length;
  const nAdmin  = all.filter(u => u.active !== false && u.perms && u.perms.users).length;
  const recent  = all.filter(u => {
    if (!u.createdAt) return false;
    return (Date.now() - new Date(u.createdAt).getTime()) < 30 * 86400000;
  }).length;

  const kpi = (ico, hue, label, value, sub, lock) => `
    <div class="usr-kpi ${hue}${lock ? ' is-locked' : ''}">
      <div class="usr-kpi__i">${icon(ico, 'md')}</div>
      <div style="min-width:0">
        <div class="usr-kpi__l">${escHtml(label)}${lock ? ` <span class="al-lock" title="${escHtml(lock)}">${icon('lock','xs')}</span>` : ''}</div>
        <div class="usr-kpi__v">${escHtml(String(value))}</div>
        <div class="usr-kpi__s">${escHtml(sub)}</div>
      </div>
    </div>`;

  return `
  <div class="bk-head">
    <div class="set-head__ico dh-blue">${icon('users', 'md')}</div>
    <div class="set-head__mid">
      <div class="bk-head__t">User Management</div>
      <div class="bk-head__s">The people who can sign in to this copy, and what each of them may do.</div>
    </div>
    <div class="al-head__acts">
      <button class="set-btn set-btn--go" onclick="showUserEditor(null)">${icon('plus','xs')}Add user</button>
      <button class="set-btn" onclick="exportUsersExcel()">${icon('fileSpreadsheet','xs')}Export Excel</button>
      <button class="set-btn" onclick="exportUsersPDF()">${icon('print','xs')}Export PDF</button>
      <button class="set-btn" onclick="navigate('activitylog')">${icon('list','xs')}Audit log</button>
      <button class="set-btn" disabled title="There is no importer for accounts. Each one is created here, because a password has to be set for it.">${icon('upload','xs')}Import</button>
    </div>
  </div>

  <div class="usr-kpis">
    ${kpi('users','dh-blue','Total users',all.length, all.length === 1 ? 'one account' : 'accounts on this machine')}
    ${kpi('shieldCheck','dh-green','Active users',nActive, all.length ? Math.round(nActive / all.length * 100) + '% of total' : '—')}
    ${kpi('key','dh-violet','Administrators',nAdmin,'can manage users')}
    ${kpi('lock','dh-slate','Locked users',0,'not recorded',
      'The sign-in lockout counts failed attempts for the session at the keyboard; it is not stored against the account, so there is no locked-account list to count.')}
    ${kpi('clock','dh-amber','Recently joined',recent,'added in the last 30 days')}
  </div>

  <div class="usr-split${usersFilter.sel ? ' is-open' : ''}">
    <div class="set-card usr-listcard">
      <div class="al-filters">
        <div class="stu-search">
          ${icon('search','xs')}
          <input id="usr-search" class="lk-sin" placeholder="Search by name, username, email or role…"
                 value="${escHtml(usersFilter.search)}"
                 oninput="usersFilter.search=this.value;usersFilter.page=1;renderPage('users')">
          ${lkSearchX('usr-search','usersFilter','users')}
        </div>
        <select class="set-sel" onchange="usersFilter.role=this.value;usersFilter.page=1;renderPage('users')">
          <option value="All">All roles</option>
          ${USER_ROLES.map(r => `<option ${usersFilter.role === r.key ? 'selected' : ''}>${escHtml(r.key)}</option>`).join('')}
          <option ${usersFilter.role === 'Custom' ? 'selected' : ''}>Custom</option>
        </select>
        <select class="set-sel" onchange="usersFilter.status=this.value;usersFilter.page=1;renderPage('users')">
          ${['All','Active','Inactive'].map(s => `<option ${usersFilter.status === s ? 'selected' : ''}>${s === 'All' ? 'All status' : s}</option>`).join('')}
        </select>
        <select class="set-sel" onchange="usersFilter.dept=this.value;usersFilter.page=1;renderPage('users')">
          <option value="All">All departments</option>
          ${USER_DEPTS.map(d => `<option ${usersFilter.dept === d ? 'selected' : ''}>${escHtml(d)}</option>`).join('')}
        </select>
        <button class="set-btn" onclick="usrReset()">${icon('refreshCw','xs')}Reset</button>
      </div>

      ${rows.length ? `
      <div class="set-table-wrap">
        <table class="set-table usr-table">
          <thead><tr>
            <th>User</th><th>Role</th><th>Department</th><th>Status</th><th>Last sign-in</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${rows.map(u => {
              const role = usrRole(u);
              const when = _usrWhen(u.lastLogin);
              return `<tr class="${usersFilter.sel === u.id ? 'is-on' : ''}" onclick="usrOpen('${escHtml(u.id)}')">
                <td>
                  <div class="usr-who">${usrAvatar(u, 36)}
                    <div style="min-width:0">
                      <div class="usr-who__n">${escHtml(u.name || '(no name)')}${u.id === CUR_ROLE ? '<span class="usr-you">you</span>' : ''}</div>
                      <div class="usr-who__s">${escHtml(u.email || u.username || u.id)}</div>
                    </div>
                  </div>
                </td>
                <td><span class="lk-chip ${usrRoleHue(role)}">${escHtml(role)}</span></td>
                <td>${u.department ? escHtml(u.department) : '<span class="lk-dash">—</span>'}</td>
                <td><span class="lk-chip ${u.active === false ? 'dh-slate' : 'dh-green'}">${icon(u.active === false ? 'close' : 'check','xs')}${u.active === false ? 'Inactive' : 'Active'}</span></td>
                <td>${when ? `<div class="al-when">${escHtml(when.top)}<small>${escHtml(when.sub)}</small></div>`
                            : '<span class="lk-dash">never</span>'}</td>
                <td onclick="event.stopPropagation()">${lkKebab("usrRowMenu('" + escHtml(u.id) + "',this)", 'Actions for this user')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="al-foot"><span>${rows.length} of ${all.length} account${all.length === 1 ? '' : 's'}</span></div>`
      : `<div class="bk-empty">${icon('users','md')}
          <div class="bk-empty__t">No account matches those filters</div>
          <div class="bk-empty__s">Reset the filters to see all ${all.length}.</div></div>`}

      <div class="cfg-note">${icon('info','xs')}<span>Permissions are enforced <b>inside this app</b>. Anyone with the Windows account and the database file can still read the data directly — these accounts separate duties, they are not disk security.</span></div>
    </div>

    ${usersFilter.sel ? usrDetail(usersFilter.sel) : ''}
  </div>`;
}

/* ── THE DETAIL RAIL ──────────────────────────────────────────────────────── */
function usrDetail(id) {
  const u = WARDENS[id];
  if (!u) return '';
  const user = Object.assign({ id }, u);
  const role = usrRole(user);
  const joined = _usrWhen(u.createdAt);
  const seen = _usrWhen(u.lastLogin);
  const granted = PERM_KEYS.filter(k => u.perms && u.perms[k] === true);

  const row = (label, value, lock) => `
    <div class="hi-fact${lock ? ' is-locked' : ''}">
      <span class="hi-fact__l">${escHtml(label)}</span>
      <span class="hi-fact__v">${escHtml(value)}</span>
      ${lock ? `<span class="hi-fact__lock" title="${escHtml(lock)}">${icon('lock','xs')}</span>` : ''}
    </div>`;

  /* The account's own trail, out of the activity log. `by` holds the name the
     action was taken under, which is the only join this log supports. */
  const mine = (DB.activityLog || []).filter(a => a.by && a.by === u.name).slice(0, 6);

  return `
  <aside class="set-card usr-rail">
    <div class="usr-rail__h">
      ${usrAvatar(user, 48)}
      <div style="min-width:0">
        <div class="usr-rail__n">${escHtml(u.name || '(no name)')}</div>
        <div class="usr-rail__s">${escHtml(u.email || u.username || id)}</div>
      </div>
      <button class="set-rowbtn" onclick="usrClose()" title="Close">${icon('close','xs')}</button>
    </div>
    <div class="usr-rail__chips">
      <span class="lk-chip ${usrRoleHue(role)}">${escHtml(role)}</span>
      <span class="lk-chip ${u.active === false ? 'dh-slate' : 'dh-green'}">${icon(u.active === false ? 'close' : 'check','xs')}${u.active === false ? 'Inactive' : 'Active'}</span>
      ${u.builtin ? `<span class="lk-chip dh-slate">${icon('shield','xs')}Built-in</span>` : ''}
    </div>

    <div class="usr-rail__b">
      <div class="usr-sec">User information</div>
      <div class="hi-facts" style="border-top:none;margin-top:0;padding-top:0">
        ${row('Full name', u.name || 'Not set')}
        ${row('Username', u.username || id)}
        ${row('Email', u.email || 'Not recorded')}
        ${row('Phone', u.phone || 'Not recorded')}
        ${row('Department', u.department || 'Not set')}
        ${row('Joined', joined ? joined.top + ', ' + joined.sub : 'Not recorded',
          u.createdAt ? '' : 'Accounts created before 2026-09-09 were not stamped with a date. New ones are.')}
        ${row('Last sign-in', seen ? seen.top + ', ' + seen.sub : 'Never signed in')}
      </div>

      <div class="usr-sec">Role &amp; access</div>
      <div class="hi-facts" style="border-top:none;margin-top:0;padding-top:0">
        ${row('Role', role)}
        ${row('Access level', usrLevel(user))}
        ${row('Permissions', granted.length + ' of ' + PERM_KEYS.length)}
        ${row('Sessions', 'Not recorded',
          'One window on one machine. There is no session list to end, and nothing to sign out remotely.')}
      </div>
      <div class="usr-perms">
        ${PERMS.map(p => `
          <div class="usr-perm${u.perms && u.perms[p.key] ? ' is-on' : ''}">
            ${icon(u.perms && u.perms[p.key] ? 'check' : 'close','xs')}
            <span>${escHtml(p.label)}</span>
          </div>`).join('')}
      </div>

      <div class="usr-sec">Recent activity</div>
      ${mine.length ? `<div class="usr-acts">${mine.map(a => `
        <div class="usr-act">
          <span class="usr-act__d">${escHtml(fmtDate(a.date))}<small>${escHtml(a.time || '')}</small></span>
          <span class="usr-act__t">${escHtml(a.action)}</span>
        </div>`).join('')}</div>`
        : `<div class="usr-none">Nothing in the activity log under this name yet. The log records the NAME an action was taken under, so renaming an account leaves its older entries behind.</div>`}

      <div class="usr-sec">Quick actions</div>
      <div class="hi-quick">
        <button class="set-btn" onclick="showUserEditor('${escHtml(id)}')">${icon('edit','xs')}Edit user</button>
        <button class="set-btn" onclick="usrResetPassword('${escHtml(id)}')">${icon('key','xs')}Reset password</button>
        <button class="set-btn" disabled title="Impersonation needs a server to authorise it and an audit trail to record it. Neither exists in the offline edition.">${icon('userCheck','xs')}Sign in as user</button>
        <button class="set-btn set-btn--danger" onclick="usrToggleActive('${escHtml(id)}')">
          ${icon(u.active === false ? 'check' : 'lock','xs')}${u.active === false ? 'Reactivate' : 'Deactivate'}</button>
      </div>
    </div>
  </aside>`;
}

/* ── CONTROLS ─────────────────────────────────────────────────────────────── */
function usrOpen(id) { usersFilter.sel = id; renderPage('users'); }
function usrClose() { usersFilter.sel = null; renderPage('users'); }
function usrReset() {
  usersFilter = { search: '', role: 'All', status: 'All', dept: 'All', page: 1, sel: usersFilter.sel };
  renderPage('users');
}

function usrRowMenu(id, btn) {
  const u = WARDENS[id];
  if (!u) return;
  const items = [
    { label: 'View account', svg: icon('eye','xs'), on: "usrOpen('" + id + "')" },
    { label: 'Edit user', svg: icon('edit','xs'), on: "showUserEditor('" + id + "')" },
    { label: 'Reset password', svg: icon('key','xs'), on: "usrResetPassword('" + id + "')" },
    'sep',
    { label: u.active === false ? 'Reactivate account' : 'Deactivate account',
      svg: icon(u.active === false ? 'check' : 'lock','xs'),
      danger: u.active !== false, on: "usrToggleActive('" + id + "')" },
  ];
  if (!u.builtin && id !== CUR_ROLE) {
    items.push({ label: 'Delete user', svg: icon('trash','xs'), danger: true, on: "deleteUser('" + id + "')" });
  }
  lkRowMenu(btn, items);
}

/* Deactivating is the reversible half of deleting, and it runs the same
   last-administrator guard: an install with nobody who can manage users cannot
   be repaired from inside the app. */
async function usrToggleActive(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  const u = WARDENS[id];
  if (!u) return;
  const turningOff = u.active !== false;
  if (turningOff) {
    if (id === CUR_ROLE) { toast('You cannot deactivate the account you are signed in as', 'error'); return; }
    if (u.perms && u.perms.users === true && _adminCount() <= 1) {
      toast('This is the only account that can manage users. Give another user that permission first.', 'error', 'Cannot deactivate');
      return;
    }
  }
  u.active = !turningOff;
  saveWardenConfig();
  if (typeof USERS !== 'undefined') USERS = WARDENS;
  logActivity(turningOff ? 'User Deactivated' : 'User Reactivated', u.name || u.username || id, 'Settings');
  await saveDB();
  toast((u.name || 'Account') + (turningOff ? ' deactivated' : ' reactivated'), 'success');
  renderPage('users');
}

/** Set a new password without touching anything else on the account. */
function usrResetPassword(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  const u = WARDENS[id];
  if (!u) return;
  showModal('modal-sm',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('key','sm')}</div>
       <div><div class="hf-mh__t">Reset password</div>
       <div class="hf-mh__s">${escHtml(u.name || u.username || id)}</div></div>
     </div>`,
    `<div class="field"><label for="usr-pw1">New password</label>
       <div class="hf-in"><span class="hf-in__i">${icon('lock','sm')}</span>
       <input class="form-control" id="usr-pw1" type="password" autocomplete="new-password"
              placeholder="At least ${AUTH_CFG.minPwLen} characters"></div></div>
     <div class="field"><label for="usr-pw2">Repeat it</label>
       <div class="hf-in"><span class="hf-in__i">${icon('lock','sm')}</span>
       <input class="form-control" id="usr-pw2" type="password" autocomplete="new-password"
              placeholder="Type it again"></div></div>
     <div class="cfg-note">${icon('info','xs')}<span>The password is stored as a hash — nobody, including you, can read the old one back. Tell the user their new password directly.</span></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="usrDoResetPassword('${escHtml(id)}')">Set password</button>`);
}

async function usrDoResetPassword(id) {
  const u = WARDENS[id];
  if (!u) return;
  const a = (document.getElementById('usr-pw1') || {}).value || '';
  const b = (document.getElementById('usr-pw2') || {}).value || '';
  if (a !== b) { toast('The two passwords do not match', 'error'); return; }
  let hash;
  try { hash = await hashNewPassword(a.trim()); }
  catch (e) { toast(e.message || 'Invalid password', 'error'); return; }
  u.pw = hash;
  saveWardenConfig();
  logActivity('Password Reset', u.name || u.username || id, 'Settings');
  await saveDB();
  closeModal();
  toast('Password set for ' + (u.name || u.username), 'success');
}

/* ── THE FORM ─────────────────────────────────────────────────────────────────
   `add user.png`, with the permission model this app actually enforces.

   The reference draws eight group cards each holding three to five
   sub-permissions — about thirty checkboxes. This app enforces seven
   permissions. Each card's checkbox IS one of those seven; the lines beneath
   it say what that one permission grants, as text. Thirty checkboxes of which
   twenty-three did nothing would tell a warden they had revoked something they
   had not, which is the worst lie an access screen can tell.

   The element ids are the ones saveUser() already reads (`u-name`,
   `u-username`, `u-pw`, `u-phone`, `u-active`, `up-<perm>`), plus the three
   fields added today.                                                        */

/* What each of the seven permissions actually reaches, in the reference's
   grouped shape. Every line here is a real consequence of the tick above it. */
const PERM_GROUPS = {
  edit:     { ico: 'users',    hue: 'dh-violet', title: 'Records',
              lines: ['Add and edit students', 'Add and edit rooms', 'Add and edit expenses', 'Move or shift a student'] },
  delete:   { ico: 'trash',    hue: 'dh-red',    title: 'Deletion',
              lines: ['Delete students', 'Delete payments', 'Delete rooms and expenses'] },
  payments: { ico: 'card',     hue: 'dh-green',  title: 'Finance',
              lines: ['Collect and record payments', 'Edit a payment', 'Reverse a collection', 'Print receipts'] },
  reports:  { ico: 'chart',    hue: 'dh-blue',   title: 'Reports',
              lines: ['Open the Reports page', 'Export PDF and Excel', 'Open the Annual Archive'] },
  backup:   { ico: 'archive',  hue: 'dh-amber',  title: 'Backup & restore',
              lines: ['Create and download a backup', 'Restore the database from a file'] },
  settings: { ico: 'settings', hue: 'dh-slate',  title: 'Settings',
              lines: ['Hostel details and logo', 'Room types, methods, categories, floors', 'Rent and mess charges'] },
  users:    { ico: 'shield',   hue: 'dh-violet', title: 'User management',
              lines: ['Add and edit users', 'Set permissions', 'Reset passwords and deactivate accounts'] },
};

function showUserEditor(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  const isNew = !id;
  const u = isNew ? { username: '', name: '', phone: '', perms: {}, active: true } : (WARDENS[id] || {});
  const perms = u.perms || {};
  /* A new account starts with the everyday permissions ticked and the
     dangerous ones clear, so a mis-click cannot hand out delete or user
     management by default. */
  const defaultOn = { edit: true, payments: true, reports: true };
  const on = k => (isNew ? defaultOn[k] === true : perms[k] === true);
  const role = isNew ? '' : usrRole(Object.assign({ id }, u));

  const groups = PERMS.map(p => {
    const g = PERM_GROUPS[p.key] || { ico: 'info', hue: 'dh-slate', title: p.label, lines: [] };
    return `
      <div class="usf-grp ${g.hue}">
        <label class="usf-grp__h">
          <span class="usf-grp__i">${icon(g.ico, 'sm')}</span>
          <input type="checkbox" id="up-${p.key}" ${on(p.key) ? 'checked' : ''} onchange="usfTouch()">
          <span class="usf-grp__t">${escHtml(g.title)}</span>
        </label>
        <div class="usf-grp__b">
          ${g.lines.map(l => `<div class="usf-line">${icon('check', 'xs')}<span>${escHtml(l)}</span></div>`).join('')}
        </div>
      </div>`;
  }).join('');

  showModal('modal-lg',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('userCheck', 'sm')}</div>
       <div><div class="hf-mh__t">${isNew ? 'Add New User' : 'Edit User'}</div>
       <div class="hf-mh__s">${isNew ? 'Create an account, give it a role, and set what it may reach.'
                                     : 'Change this account&rsquo;s details, role and permissions.'}</div></div>
     </div>`,
    `<div class="usf">
      <div class="usf-top">
        <div class="hf-sec">
          <div class="hf-sec__h">
            <span class="hf-num">1</span>
            <span class="hf-sec__t">Basic information</span>
            <span class="hf-sec__s">Who this is, and how they sign in</span>
          </div>
          <div class="usf-basic">
            <div class="usf-photo">
              ${isNew
                ? `<div class="usf-photo__box is-empty" title="A photo can be added once the account exists">
                     ${icon('person', 'md')}<span>Add after saving</span></div>`
                : _userAvatarNode(id, u.photo || '')}
            </div>
            <div class="hf-g2" style="flex:1;min-width:0">
              <div class="field col-full"><label for="u-name">Full name<span class="req">*</span></label>
                <div class="hf-in"><span class="hf-in__i">${icon('person', 'sm')}</span>
                <input class="form-control" id="u-name" value="${escHtml(u.name || '')}" placeholder="Enter full name" maxlength="60"></div></div>
              <div class="field"><label for="u-username">Username<span class="req">*</span></label>
                <div class="hf-in"><span class="hf-in__i">${icon('userCheck', 'sm')}</span>
                <input class="form-control" id="u-username" autocapitalize="none" spellcheck="false"
                       value="${escHtml(u.username || '')}" placeholder="e.g. warden2" maxlength="30"></div></div>
              <div class="field"><label for="u-pw">Password${isNew ? '<span class="req">*</span>' : ''}</label>
                <div class="hf-in"><span class="hf-in__i">${icon('lock', 'sm')}</span>
                <input class="form-control" id="u-pw" type="password" autocomplete="new-password"
                       placeholder="${isNew ? 'At least ' + AUTH_CFG.minPwLen + ' characters' : 'Leave blank to keep the current one'}"></div></div>
              <div class="field"><label for="u-email">Email address</label>
                <div class="hf-in"><span class="hf-in__i">${icon('mail', 'sm')}</span>
                <input class="form-control" id="u-email" type="email" value="${escHtml(u.email || '')}"
                       placeholder="user@hostel.com" maxlength="60"></div></div>
              <div class="field"><label for="u-phone">Phone / WhatsApp</label>
                <div class="hf-in"><span class="hf-in__i">${icon('phone', 'sm')}</span>
                <input class="form-control" id="u-phone" value="${escHtml(u.phone || '')}"
                       placeholder="03XX-XXXXXXX" maxlength="20"></div></div>
            </div>
          </div>
        </div>

        <div class="hf-sec">
          <div class="hf-sec__h">
            <span class="hf-num">2</span>
            <span class="hf-sec__t">Role &amp; access</span>
            <span class="hf-sec__s">A role ticks a set of the permissions below</span>
          </div>
          <div class="field"><label for="u-role">Role</label>
            <div class="hf-in"><span class="hf-in__i">${icon('shield', 'sm')}</span>
            <select class="form-control" id="u-role" onchange="usfApplyRole(this.value)">
              <option value="">Select a role&hellip;</option>
              ${USER_ROLES.map(r => `<option ${role === r.key ? 'selected' : ''}>${escHtml(r.key)}</option>`).join('')}
              <option value="Custom" ${role === 'Custom' ? 'selected' : ''}>Custom</option>
            </select></div>
            <div class="hi-note">Picking one ticks its permissions. Change a tick afterwards and the role reads Custom.</div>
          </div>
          <div class="field"><label for="u-department">Department</label>
            <div class="hf-in"><span class="hf-in__i">${icon('building', 'sm')}</span>
            <select class="form-control" id="u-department">
              <option value="">Not set</option>
              ${USER_DEPTS.map(d => `<option ${u.department === d ? 'selected' : ''}>${escHtml(d)}</option>`).join('')}
            </select></div></div>
          <div class="field"><label for="u-level">Access level</label>
            <div class="hf-in is-readonly"><span class="hf-in__i">${icon('chart', 'sm')}</span>
            <input class="form-control" id="u-level" readonly value="${escHtml(usrLevel({ perms: isNew ? { edit: true, payments: true, reports: true } : perms }))}"></div>
            <div class="hi-note">Derived from the ticks below — a summary, not a separate setting.</div>
          </div>
          <label class="usf-active">
            <input type="checkbox" id="u-active" ${u.active !== false ? 'checked' : ''}>
            <span><b>Account is active</b><small>An inactive account cannot sign in</small></span>
          </label>
        </div>
      </div>

      <div class="hf-sec">
        <div class="hf-sec__h">
          <span class="hf-num">3</span>
          <span class="hf-sec__t">Permissions</span>
          <span class="hf-sec__s">What this account may reach</span>
          <span class="usf-bulk">
            <button type="button" class="set-btn set-btn--sm" onclick="usfAll(true)">${icon('check', 'xs')}Select all</button>
            <button type="button" class="set-btn set-btn--sm" onclick="usfAll(false)">${icon('close', 'xs')}Clear all</button>
          </span>
        </div>
        <div class="usf-grps">${groups}</div>
        <div class="cfg-note">${icon('info', 'xs')}<span>This app enforces <b>these seven</b>. The lines inside each card are what its tick grants — they are not separate switches, so nothing here can be half-granted. Permissions can be changed later from this page.</span></div>
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveUser('${isNew ? '' : escHtml(id)}')">${isNew ? 'Create user' : 'Save changes'}</button>`);
}

/** Ticking a role's set. Leaves everything else alone. */
function usfApplyRole(key) {
  const r = USER_ROLES.find(x => x.key === key);
  if (!r) return;
  PERM_KEYS.forEach(k => {
    const el = /** @type {HTMLInputElement|null} */ (document.getElementById('up-' + k));
    if (el) el.checked = r.perms.indexOf(k) !== -1;
  });
  usfTouch(true);
}

function usfAll(on) {
  PERM_KEYS.forEach(k => {
    const el = /** @type {HTMLInputElement|null} */ (document.getElementById('up-' + k));
    if (el) el.checked = !!on;
  });
  usfTouch();
}

/* Editing a tick by hand means the role no longer describes the account, so the
   field says Custom rather than keeping a label that has stopped being true.
   The access level follows the ticks the same way. */
function usfTouch(fromRole) {
  const perms = {};
  PERM_KEYS.forEach(k => {
    const el = /** @type {HTMLInputElement|null} */ (document.getElementById('up-' + k));
    perms[k] = !!(el && el.checked);
  });
  const lvl = /** @type {HTMLInputElement|null} */ (document.getElementById('u-level'));
  if (lvl) lvl.value = usrLevel({ perms });
  if (fromRole) return;
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('u-role'));
  if (!sel) return;
  const on = PERM_KEYS.filter(k => perms[k]).sort().join(',');
  const hit = USER_ROLES.find(r => r.perms.slice().sort().join(',') === on);
  sel.value = hit ? hit.key : 'Custom';
}
