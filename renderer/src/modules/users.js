/* ════════════════════════════════════════════════════════════════════════════
   USER MANAGEMENT — the page, built 2026-09-09 to `user managemnt.png`, with
   the form from `add user.png`.

   IT WAS A MODAL reached from the account menu, drawn in inline styles. The
   reference gives it a stat row, filters, a register and a detail rail, none
   of which belongs in a box you dismiss.

   WHAT AN ACCOUNT ACTUALLY IS. `auth-nev.js` stores
   `{ username, name, phone, perms, active, pw, photo, builtin }` per user, and
   enforces EIGHT permissions: add, edit, delete, payments, reports, backup,
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
       thirty; this app enforces eight. Each card's master checkbox IS its real
       permission, and the lines under it are what that permission grants —
       drawn as text, not as checkboxes that would do nothing. Inventing 22
       controls to match a picture is how a warden ends up believing they
       revoked something they did not.

       The eighth arrived on 2026-09-10 the right way round: the owner asked
       for it, and the code that enforces it landed with the checkbox that
       offers it. Every line printed on those two cards is a call site.

   ROLE IS A PRESET, NOT A SECOND SOURCE OF TRUTH. Picking one ticks a set of
   permissions and is stored as a label; the permissions remain the thing the
   app enforces. A role whose ticks are then edited by hand reads "Custom".
   ════════════════════════════════════════════════════════════════════════════ */

let usersFilter = { search: '', role: 'All', status: 'All', dept: 'All', page: 1, sel: null };

/* Warden ledger spec §5 step 3 — My Collections and the Wardens view. `usersTab`
   only means anything to an account that can manage users; everyone else has
   exactly one view on this page and no tab row. */
let usersTab = 'users';
let usersColFilter  = { search: '', method: 'All', period: 'All', page: 1, pageSize: 25 };
let usersWardenSel  = null;
let usersRailFilter = { page: 1, pageSize: 25 };

/* The presets. Each names a set of the eight real permissions — nothing here
   grants anything the app does not enforce.

   ADD AND EDIT ARE SEPARATE KEYS SINCE 2026-09-10, so every preset that used
   to say `edit` now says both. One preset does NOT: Receptionist takes `add`
   alone. That is the front desk — the person who admits a student who has
   walked in, and who has no business going back through records that are
   already on file. It is the reason the owner asked for the split, and a set
   of presets where no preset uses it would be a split nobody could reach
   without ticking boxes by hand. */
const USER_ROLES = [
  { key: 'Super Admin',  perms: ['add','edit','delete','payments','reports','backup','settings','users'] },
  { key: 'Admin',        perms: ['add','edit','delete','payments','reports','backup','settings'] },
  { key: 'Manager',      perms: ['add','edit','payments','reports','settings'] },
  { key: 'Accountant',   perms: ['payments','reports'] },
  { key: 'Receptionist', perms: ['add','payments'] },
  { key: 'Warden',       perms: ['add','edit','payments','reports'] },
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
  // An open account panel follows whatever just changed on this page.
  if (_usrPanelId) setTimeout(refreshAccountPanel, 0);
  /* WHO SEES WHAT (owner, 2026-09-14). An account that cannot manage users met a
     lock here, on a page the rail offers to everybody. It now meets the one thing
     on this page that is its own: the money it has collected — with no tab row,
     because a single destination needs no navigation. */
  if (typeof canDo === 'function' && !canDo('users')) {
    if (typeof CUR_ROLE === 'undefined' || !CUR_ROLE || !WARDENS[CUR_ROLE] || !CUR_USER) {
      return `<div class="empty-state"><div class="icon">${icon('lock','sm')}</div>
        <h3>Sign in to see this page</h3>
        <p>This page shows the account that is signed in.</p></div>`;
    }
    return usrCollectionsView('');
  }
  const tabs = usrTabs();
  if (usersTab === 'wardens') return usrWardensView(tabs);
  if (usersTab === 'mine')    return usrCollectionsView(tabs);
  return _usrAccountsView(tabs);
}

/* The account register — the page as it was before step 3, now the Users tab. */
function _usrAccountsView(tabs) {
  const all = usrList();
  const rows = usrFiltered();
  const nActive = all.filter(u => u.active !== false).length;
  const nAdmin  = all.filter(u => u.active !== false && u.perms && u.perms.users).length;
  const recent  = all.filter(u => {
    if (!u.createdAt) return false;
    return (Date.now() - new Date(u.createdAt).getTime()) < 30 * 86400000;
  }).length;

  const kpi = usrKpi;

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
  ${tabs}

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

/* One counter tile, in the page's own shape. */
function usrKpi(ico, hue, label, value, sub, lock) {
  return `
    <div class="usr-kpi ${hue}${lock ? ' is-locked' : ''}">
      <div class="usr-kpi__i">${icon(ico, 'md')}</div>
      <div style="min-width:0">
        <div class="usr-kpi__l">${escHtml(label)}${lock ? ` <span class="al-lock" title="${escHtml(lock)}">${icon('lock','xs')}</span>` : ''}</div>
        <div class="usr-kpi__v">${escHtml(String(value))}</div>
        <div class="usr-kpi__s">${escHtml(sub)}</div>
      </div>
    </div>`;
}

/* ══ MY COLLECTIONS AND THE WARDENS VIEW — warden ledger spec §5 step 3 ═══════

   READ-ONLY, built to docs/WARDEN_LEDGER_STEP3_DESIGN.md. Every figure comes
   from ledgerCollections() / ledgerCollectionTotals() in ledger.js, which read
   the student ledger and nothing else:

     collections  the payment entries this account created
     reductions   reversals and amounts edited down that this account RECORDED
     holding      the two together, since the ledger started

   Imported history carries no account and is in nobody's figures; a deleted
   record's money stays, tagged. Newest first — the owner's stated exception to
   room-number ordering, for this list of cash only.

   Handing over and approval (step 4) are drawn here too; their rules live in
   handovers.js and are only called from these screens. */

function usrTabs() {
  const tabs = [
    { id: 'users',   label: 'Users',          ico: 'users'  },
    { id: 'wardens', label: 'Wardens',        ico: 'wallet' },
    { id: 'mine',    label: 'My Collections', ico: 'card'   },
  ];
  return `
  <div class="set-tabs-wrap">
    <div class="set-tabs" role="tablist" aria-label="User management sections">
      ${tabs.map(t => `<div class="set-tab ${usersTab === t.id ? 'is-on' : ''}" role="tab" tabindex="0"
             aria-selected="${usersTab === t.id}" title="${escHtml(t.label)}" data-tab="${t.id}"
             onclick="usrTab('${t.id}')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();usrTab('${t.id}');}"
        >${icon(t.ico, 'xs')}${escHtml(t.label)}</div>`).join('')}
    </div>
  </div>`;
}

function usrTab(id) { usersTab = id; renderPage('users'); }

/* The student and room an entry belongs to. The month record first — it holds
   the room the student was in THAT month — then the student, because a deleted
   month record leaves only the student behind. */
function _usrColLookup() {
  const pays = new Map();
  (DB.payments || []).forEach(p => { if (p && p.id) pays.set(p.id, p); });
  (DB.archive || []).forEach(p => { if (p && p.id && p._src !== 'expenses' && !pays.has(p.id)) pays.set(p.id, p); });
  const studs = new Map((DB.students || []).map(s => [s.id, s]));
  const rooms = new Map((DB.rooms || []).map(r => [r.id, r]));
  return function (e) {
    const p = pays.get(e.paymentRecordId) || null;
    const s = studs.get(e.studentId) || null;
    const r = s ? rooms.get(s.roomId) : null;
    return {
      name: (s && s.name) || (p && p.studentName) || '—',
      room: (p && p.roomNumber) || (r && r.number) || '',
    };
  };
}

/* The reason as the ledger stored it repeats what the row already says — the
   word Reversed and the month billed. The row keeps the rest: the words the
   person typed, or what an edit changed from and to. */
function _usrReason(e) {
  let s = String((e && e.reason) || '');
  if (e.month) s = s.split(' · ' + e.month).join('');
  return s.replace(/^Collection reversed:?\s*/, '')
          .replace(/^Amount collected changed\s*/, 'Changed ')
          .trim();
}

function _usrColKind(r) {
  return r.kind === 'reversed' ? 'Reversed' : r.kind === 'edited' ? 'Amount corrected' : 'Collected';
}

/* A signed amount. A reduction carries a minus sign AND is coloured, so it is
   never told by colour alone. */
function _usrAmt(n) {
  return `<span class="usr-amt${n < 0 ? ' is-neg' : ''}">${n < 0 ? '−' : ''}${escHtml(fmtPKR(Math.abs(n)))}</span>`;
}

function _usrColFiltered(rows, look) {
  const f = usersColFilter;
  const q = String(f.search || '').trim().toLowerCase();
  const td = today(), mo = td.slice(0, 7);
  return rows.filter(r => {
    const e = r.entry;
    const day = ymd(new Date(e.createdAt));
    if (f.period === 'Today' && day !== td) return false;
    if (f.period === 'This month' && day.slice(0, 7) !== mo) return false;
    if (f.method !== 'All' && (e.method || 'Not recorded') !== f.method) return false;
    if (q) {
      const who = look(e);
      const hay = [who.name, who.room, e.month, e.reason].filter(Boolean).join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* The register. `compact` is the Wardens rail: month and method fold under the
   name so the table fits a 400px column. */
function _usrColTable(pageRows, look, compact, statusOf) {
  const withStatus = !compact && typeof statusOf === 'function';
  return `
  <div class="set-table-wrap">
    <table class="set-table usr-coltable${compact ? ' is-compact' : ''}">
      <thead><tr>
        <th>When</th><th>${compact ? 'Student' : 'Student · Room'}</th>
        ${compact ? '' : '<th>Month billed</th><th>Method</th>'}
        ${withStatus ? '<th>Status</th>' : ''}
        <th class="is-num">Amount</th>
      </tr></thead>
      <tbody>
        ${pageRows.map(r => {
          const e = r.entry, who = look(e), when = _usrWhen(e.createdAt);
          const adj = r.kind !== 'collected';
          return `<tr class="${adj ? 'is-adj' : ''}" data-kind="${r.kind}">
            <td>${when ? `<div class="al-when">${escHtml(when.top)}<small>${escHtml(when.sub)}</small></div>` : '<span class="lk-dash">—</span>'}</td>
            <td>
              <div class="usr-colwho">${adj ? `<span class="usr-kind">${escHtml(_usrColKind(r))}</span>` : ''}<b>${escHtml(who.name)}</b>${who.room && !compact ? `<span class="usr-colroom">Room ${escHtml(roomText(who.room))}</span>` : ''}</div>
              ${adj && _usrReason(e) ? `<span class="usr-reason">${escHtml(_usrReason(e))}</span>` : ''}
              ${compact ? `<span class="usr-reason">${escHtml([e.month, e.method || 'Method not recorded'].filter(Boolean).join(' · '))}</span>` : ''}
              ${r.deleted ? '<span class="lk-chip dh-slate usr-deleted">Record deleted</span>' : ''}
            </td>
            ${compact ? '' : `<td>${e.month ? escHtml(e.month) : '<span class="lk-dash">—</span>'}</td>
            <td>${e.method ? pmBadge(e.method) : '<span class="lk-dash">Not recorded</span>'}</td>`}
            ${withStatus ? `<td>${_usrLineStatus(statusOf(e))}</td>` : ''}
            <td class="is-num">${_usrAmt(r.amount)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ── MY COLLECTIONS ───────────────────────────────────────────────────────── */
function usrCollectionsView(tabs) {
  // Owner, 2026-09-14: an account that manages users hands nothing over.
  const noHandover = !hoNeedsHandover(CUR_ROLE);
  const rows  = ledgerCollections(CUR_ROLE);
  const tot   = ledgerCollectionTotals(rows);
  const look  = _usrColLookup();
  const shown = _usrColFiltered(rows, look);
  const pg    = paginate(shown, usersColFilter);
  const shownTotal = shown.reduce((s, r) => s + r.amount, 0);
  const f = usersColFilter;
  const methodNames = [...new Set(rows.map(r => r.entry.method || 'Not recorded'))];
  const count = n => n + ' collection' + (n === 1 ? '' : 's');
  const lineN = n => n + ' line' + (n === 1 ? '' : 's');

  // Step 4 — what is still held, and what is sent and waiting.
  const pending  = noHandover ? [] : hoPendingLines(CUR_ROLE);
  const toHand   = hoSum(pending);
  const open     = noHandover ? null : hoOpenFor(CUR_ROLE);
  const statusOf = noHandover ? null : _usrLineStatusMap();
  const why      = noHandover ? '' : _usrHandoverBlock(pending, toHand, open);
  // Opening this page is how a warden sees an outcome, so the bell stops repeating it.
  if (!noHandover && hoMarkSeen(CUR_ROLE) > 0) {
    setTimeout(() => { saveDB(); if (typeof refreshNotifBell === 'function') refreshNotifBell(); }, 0);
  }

  return `
  <div class="bk-head">
    <div class="set-head__ico dh-green">${icon('wallet', 'md')}</div>
    <div class="set-head__mid">
      <div class="bk-head__t">My Collections</div>
      <div class="bk-head__s">${noHandover
        ? 'Money you have collected. An account that manages users has nothing to hand over.'
        : 'Money you have collected and not yet handed over.'}</div>
    </div>
    <div class="al-head__acts">
      <button class="set-btn" onclick="exportMyCollectionsExcel()">${icon('fileSpreadsheet','xs')}Export Excel</button>
      <button class="set-btn" onclick="exportMyCollectionsPDF()">${icon('print','xs')}Export PDF</button>
      ${noHandover ? '' : `<button class="set-btn set-btn--go" id="usr-handover" ${why ? 'disabled' : ''}
          title="${escHtml(why || 'Send the money you hold to an administrator to count and approve.')}"
          onclick="usrHoShowSend()">${icon(why ? 'lock' : 'wallet','xs')}Hand over cash</button>`}
    </div>
  </div>
  ${tabs}

  <div class="usr-kpis ${noHandover ? 'usr-kpis--3' : 'usr-kpis--4'}">
    ${noHandover
      ? usrKpi('wallet', 'dh-blue', 'Collected', fmtPKR(tot.holding), count(tot.count) + ' since the ledger started')
      : usrKpi('wallet', 'dh-blue', 'To hand over', fmtPKR(toHand), lineN(pending.length))
        + usrKpi('clock', 'dh-amber', 'Waiting approval', open ? fmtPKR(open.totalAmount) : '—',
                 open ? hoLabel(open) + ' · ' + lineN(open.lineCount) : 'nothing sent')}
    ${usrKpi('calendar', 'dh-green', 'Today', fmtPKR(tot.today), count(tot.todayCount))}
    ${usrKpi('chart', 'dh-violet', 'This month', fmtPKR(tot.month), count(tot.monthCount))}
  </div>

  ${noHandover ? '' : _usrHandoverHistory()}

  <div class="set-card">
    ${tot.byMethod.length ? `
    <div class="usr-methods">
      <span class="usr-methods__l">By method</span>
      ${tot.byMethod.map(m => `<span class="usr-method">${pmBadge(m.method)}${_usrAmt(m.amount)}</span>`).join('')}
    </div>` : ''}

    ${rows.length ? `
    <div class="al-filters">
      <div class="stu-search">
        ${icon('search','xs')}
        <input id="usr-col-search" class="lk-sin" placeholder="Search student, room or month…"
               value="${escHtml(f.search)}"
               oninput="usersColFilter.search=this.value;usersColFilter.page=1;renderPage('users')">
        ${lkSearchX('usr-col-search','usersColFilter','users')}
      </div>
      <select class="set-sel" aria-label="Method" onchange="usersColFilter.method=this.value;usersColFilter.page=1;renderPage('users')">
        <option value="All">All methods</option>
        ${methodNames.map(m => `<option ${f.method === m ? 'selected' : ''}>${escHtml(m)}</option>`).join('')}
      </select>
      <select class="set-sel" aria-label="Period" onchange="usersColFilter.period=this.value;usersColFilter.page=1;renderPage('users')">
        ${['All', 'Today', 'This month'].map(p => `<option value="${p}" ${f.period === p ? 'selected' : ''}>${p === 'All' ? 'All time' : p}</option>`).join('')}
      </select>
      <button class="set-btn" onclick="usrColReset()">${icon('refreshCw','xs')}Reset</button>
    </div>

    ${shown.length ? `
      ${_usrColTable(pg.slice, look, false, statusOf)}
      <div class="al-foot">
        <span>${pg.from}–${pg.to} of ${shown.length}</span>
        <span>Total shown ${_usrAmt(shownTotal)}</span>
      </div>
      ${pg.pages > 1 ? renderPager(pg, 'usersColFilter', 'users') : ''}`
    : `<div class="bk-empty">${icon('search','md')}
        <div class="bk-empty__t">Nothing matches those filters</div>
        <div class="bk-empty__s">Reset the filters to see all ${rows.length}.</div></div>`}`
    : `<div class="bk-empty">${icon('wallet','md')}
        <div class="bk-empty__t">No collections yet</div>
        <div class="bk-empty__s">Money you collect from now on appears here, newest first.</div></div>`}

    <div class="cfg-note">${icon('info','xs')}<span>Counted from the day the ledger started — earlier payments stay on each student's record. A payment typed against a name with no student record is not counted here.</span></div>
  </div>`;
}

function usrColReset() {
  usersColFilter = { search: '', method: 'All', period: 'All', page: 1, pageSize: 25 };
  renderPage('users');
}

/* ══ HANDOVERS — warden ledger spec §5 step 4 ═════════════════════════════════
   Built to docs/WARDEN_LEDGER_STEP4_DESIGN.md. The rules are handovers.js; this
   is only what the warden and the administrator see and press. */

let usersHoFilter = { page: 1, pageSize: 10 };
let _hoRev = null;   // the open review: { id, ticked: Set, counted: {}, how: {}, methods: [] }

/* A line's handover status, as a word in a chip. */
function _usrLineStatusMap() {
  const m = new Map((DB.wardenCollections || []).map(r => [r.ledgerEntryId, r.status]));
  return e => m.get(e.id) || '';
}
function _usrLineStatus(s) {
  const hit = ({ pending_handover: ['dh-slate', 'To hand over'], handed_over: ['dh-amber', 'Sent'],
                 approved: ['dh-green', 'Approved'], disputed: ['dh-red', 'Disputed'] })[s];
  return hit ? `<span class="lk-chip ${hit[0]}">${hit[1]}</span>` : '<span class="lk-dash">—</span>';
}

function _usrWhenText(v) { const w = _usrWhen(v); return w ? w.top + ', ' + w.sub : ''; }

/* Why this account cannot hand over right now, or '' when it can. */
function _usrHandoverBlock(pending, toHand, open) {
  if (typeof isReadOnly === 'function' && isReadOnly()) {
    const st = typeof licenceState === 'function' ? licenceState() : null;
    return (st && st.state === 'SUSPENDED' ? 'This licence is suspended' : 'This licence has expired')
         + ' — handing over is paused.';
  }
  if (open) return 'Your handover of ' + fmtPKR(open.totalAmount) + ' is '
         + (open.status === 'discrepancy' ? 'in discrepancy' : 'waiting for approval')
         + '. The next one can be sent after that.';
  if (!pending.length || toHand <= 0) return 'There is nothing to hand over.';
  return '';
}

/* The month record's receipt number, per payment record id. */
function _usrReceiptLookup() {
  const m = new Map();
  (DB.payments || []).forEach(p => { if (p && p.id) m.set(p.id, p.receiptNo || ''); });
  (DB.archive || []).forEach(p => { if (p && p.id && !m.has(p.id)) m.set(p.id, p.receiptNo || ''); });
  return e => (e && m.get(e.paymentRecordId)) || '';
}

/* ── the warden's history ── */
function _usrHandoverHistory() {
  const all = (DB.handovers || []).filter(h => h.wardenId === CUR_ROLE)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!all.length) return '';
  const pg = paginate(all, usersHoFilter);
  return `
  <div class="set-card usr-ho-card">
    <div class="usr-ho-head"><div class="usr-sec">Handovers</div></div>
    <div class="set-table-wrap">
      <table class="set-table usr-coltable usr-hohist">
        <thead><tr><th>Sent</th><th class="is-num">Lines</th><th class="is-num">Amount</th><th>Status</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${pg.slice.map(h => {
            const when = _usrWhen(h.createdAt);
            const note = Array.isArray(h.notes) && h.notes.length ? h.notes[h.notes.length - 1] : null;
            const part = h.status === 'approved' && money(h.approvedAmount) < money(h.totalAmount);
            const id = escHtml(h.id);
            return `<tr data-handover="${id}">
              <td>${when ? `<div class="al-when">${escHtml(when.top)}<small>${escHtml(when.sub)}</small></div>` : '<span class="lk-dash">—</span>'}</td>
              <td class="is-num">${escHtml(String(h.lineCount))}</td>
              <td class="is-num">${_usrAmt(h.status === 'approved' ? money(h.approvedAmount) : money(h.totalAmount))}
                ${part ? `<span class="usr-reason">of ${escHtml(fmtPKR(h.totalAmount))}</span>` : ''}</td>
              <td><span class="lk-chip ${hoHue(h)}">${escHtml(hoLabel(h))}</span></td>
              <td>${note ? `<div class="usr-ho-note">${escHtml(note.text)}<small>${escHtml((note.byName || '') + ' · ' + _usrWhenText(note.at))}</small></div>` : '<span class="lk-dash">—</span>'}</td>
              <td class="usr-ho-acts">
                ${h.status === 'pending' && !h.reviewedAt ? `<button class="set-btn set-btn--sm" onclick="usrHoTakeBack('${id}')">${icon('refreshCw','xs')}Take back</button>` : ''}
                <button class="set-btn set-btn--sm" onclick="exportHandoverPDF('${id}')" title="Export this handover as PDF">${icon('print','xs')}PDF</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${pg.pages > 1 ? renderPager(pg, 'usersHoFilter', 'users') : ''}
  </div>`;
}

/* ── sending ── */
function usrHoShowSend() {
  if (typeof requireWritable === 'function' && !requireWritable('Handing over cash')) return;
  const pending = hoPendingLines(CUR_ROLE);
  const total   = hoSum(pending);
  const block   = _usrHandoverBlock(pending, total, hoOpenFor(CUR_ROLE));
  if (block) { toast(block, 'info'); return; }
  const look = _usrColLookup();
  const by   = hoByMethod(pending);
  const n    = pending.length;

  showModal('modal-md',
    `<div class="hf-mh"><div class="hf-mh__ico">${icon('wallet','sm')}</div>
       <div><div class="hf-mh__t">Hand over cash</div>
       <div class="hf-mh__s">Everything you hold now goes to an administrator to count.</div></div></div>`,
    `<div class="usr-ho-send">
       <div class="usr-ho-list">
         <table class="set-table usr-coltable is-compact">
           <thead><tr><th>When</th><th>Student · Room</th><th>Method</th><th class="is-num">Amount</th></tr></thead>
           <tbody>
             ${pending.map(x => {
               const e = x.entry, who = look(e), when = _usrWhen(e.createdAt), neg = money(x.row.amount) < 0;
               return `<tr data-entry="${escHtml(e.id)}">
                 <td>${when ? `<div class="al-when">${escHtml(when.top)}<small>${escHtml(when.sub)}</small></div>` : '<span class="lk-dash">—</span>'}</td>
                 <td><div class="usr-colwho">${neg ? '<span class="usr-kind">Reversed</span>' : ''}<b>${escHtml(who.name)}</b>${who.room ? `<span class="usr-colroom">Room ${escHtml(roomText(who.room))}</span>` : ''}</div></td>
                 <td>${e.method ? pmBadge(e.method) : '<span class="lk-dash">Not recorded</span>'}</td>
                 <td class="is-num">${_usrAmt(money(x.row.amount))}</td>
               </tr>`;
             }).join('')}
           </tbody>
         </table>
       </div>
       <div class="usr-methods usr-ho-methods">
         ${Object.keys(by).map(m => `<span class="usr-method">${pmBadge(m || 'Not recorded')}${_usrAmt(by[m])}</span>`).join('')}
       </div>
       <div class="usr-ho-summary" id="ho-send-sum">You are handing over <b>${escHtml(fmtPKR(total))}</b> in ${n} line${n === 1 ? '' : 's'} to the administrator. You can take it back until they act on it.</div>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="ho-send-btn" onclick="usrHoDoSend()">Send ${escHtml(fmtPKR(total))}</button>`);
}

async function usrHoDoSend() {
  const r = hoSend(CUR_ROLE);
  if (!r.ok) { toast(r.reason, 'error'); return; }
  await saveDB();
  closeModal();
  renderPage('users');
  if (typeof refreshNotifBell === 'function') refreshNotifBell();
  toast('Sent ' + fmtPKR(r.handover.totalAmount) + ' to the administrator', 'success', 'Handover sent');
}

function usrHoTakeBack(id) {
  if (typeof requireWritable === 'function' && !requireWritable('Taking a handover back')) return;
  const h = hoFind(id);
  if (!h) return;
  showConfirm('Take this handover back?',
    'The ' + escHtml(fmtPKR(h.totalAmount)) + ' goes back to your list to hand over.',
    async () => {
      const r = hoTakeBack(id, CUR_ROLE);
      if (!r.ok) { toast(r.reason, 'error'); return; }
      await saveDB();
      renderPage('users');
      if (typeof refreshNotifBell === 'function') refreshNotifBell();
      toast('Handover taken back', 'success');
    });
}

/* ── the administrator's queue ── */
function _usrHandoverQueue() {
  const q = (DB.handovers || []).filter(h => h.status === 'pending' || h.status === 'discrepancy')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));   // oldest first
  return `
  <div class="set-card usr-ho-card usr-hoq">
    <div class="usr-ho-head">
      <div class="usr-sec">Waiting for approval</div>
      ${q.length ? `<span class="lk-chip dh-amber">${q.length} waiting</span>` : ''}
    </div>
    ${q.length ? `
    <div class="set-table-wrap">
      <table class="set-table usr-coltable usr-hoqt">
        <thead><tr><th>Warden</th><th>Sent</th><th class="is-num">Lines</th><th class="is-num">Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${q.map(h => {
            const when = _usrWhen(h.createdAt);
            const id = escHtml(h.id);
            return `<tr data-handover="${id}">
              <td><b>${escHtml(h.wardenName || h.wardenId)}</b></td>
              <td>${when ? `<div class="al-when">${escHtml(when.top)}<small>${escHtml(when.sub)}</small></div>` : '<span class="lk-dash">—</span>'}</td>
              <td class="is-num">${escHtml(String(h.lineCount))}</td>
              <td class="is-num">${_usrAmt(money(h.totalAmount))}</td>
              <td><span class="lk-chip ${hoHue(h)}">${escHtml(hoLabel(h))}</span></td>
              <td class="usr-ho-acts"><button class="set-btn usr-hoq-review" onclick="usrHoShowReview('${id}')">${icon('eye','xs')}Review</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '<div class="usr-none">Nothing is waiting for approval.</div>'}
  </div>`;
}

/* ── MESS EXEMPTIONS WAITING (warden ledger spec §2.6, step 7) ─────────────────
   Beside the handovers, because it is the same kind of thing: a warden asked,
   and an admin has to say yes or no. Rules in messExempt.js. Drawn only in a
   "rent + mess together" hostel; empty, it says so, like the handover card. */
function _usrMessQueue() {
  if (typeof meApplies !== 'function' || !meApplies()) return '';
  const q = meQueue();
  return `
  <div class="set-card usr-ho-card usr-hoq usr-meq">
    <div class="usr-ho-head">
      <div class="usr-sec">Mess exemptions</div>
      ${q.length ? `<span class="lk-chip dh-amber">${q.length} waiting</span>` : ''}
    </div>
    ${!q.length ? '<div class="usr-none">No mess exemption requests are waiting.</div>' : `
    <div class="set-table-wrap">
      <table class="set-table usr-coltable usr-hoqt">
        <thead><tr><th>Student</th><th>Room</th><th>Asked by</th><th>Request</th><th>Reason</th><th></th></tr></thead>
        <tbody>
          ${q.map(s => {
            const r = s.messExemptRequest;
            const room = (DB.rooms || []).find(x => x.id === s.roomId);
            const id = escHtml(s.id);
            return `<tr data-mess-request="${id}">
              <td><b>${escHtml(s.name || '—')}</b></td>
              <td>${room ? escHtml(roomText(room)) : '<span class="lk-dash">—</span>'}</td>
              <td>${escHtml(r.requestedByName || r.requestedBy || '—')}</td>
              <td><span class="lk-chip ${r.kind === 'start' ? 'dh-amber' : 'dh-slate'}">${r.kind === 'start' ? 'Start' : 'End'}</span></td>
              <td>${escHtml(r.reason || '')}</td>
              <td class="usr-ho-acts">
                <button class="set-btn" onclick="usrMeApprove('${id}')">${icon('check','xs')}Approve</button>
                <button class="set-btn" onclick="usrMeShowDecline('${id}')">Decline</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;
}

async function usrMeApprove(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  if (typeof requireWritable === 'function' && !requireWritable('Approving a mess exemption')) return;
  const r = meApprove(id);
  if (!r.ok) { toast(r.reason, 'error'); return; }
  await saveDB();
  if (typeof refreshNotifBell === 'function') refreshNotifBell();
  renderPage('users');
  toast(r.adjusted ? "Approved — this month's unpaid bill no longer carries the mess" : 'Approved', 'success');
}

function usrMeShowDecline(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  if (typeof requireWritable === 'function' && !requireWritable('Declining a mess exemption')) return;
  const s = (DB.students || []).find(x => x.id === id);
  if (!s || !s.messExemptRequest) return;
  showModal('modal-sm', 'Decline the request',
    `<div class="usr-me-dec">
       <p style="margin:0 0 10px;color:var(--text2)">${escHtml(s.name || '')} — ${s.messExemptRequest.kind === 'start' ? 'mess exemption' : 'end of exemption'}, asked by ${escHtml(s.messExemptRequest.requestedByName || 'a warden')}.</p>
       <div class="field"><label for="me-decline-note">Why <span class="req">*</span></label>
         <textarea class="form-control" id="me-decline-note" rows="3" maxlength="200" placeholder="The warden sees this"></textarea></div>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="usrMeDoDecline('${escHtml(id)}')">Decline</button>`);
}

async function usrMeDoDecline(id) {
  const note = document.getElementById('me-decline-note')?.value || '';
  const r = meDecline(id, note);
  if (!r.ok) { toast(r.reason, 'error'); return; }
  await saveDB();
  closeModal();
  if (typeof refreshNotifBell === 'function') refreshNotifBell();
  renderPage('users');
  toast('Request declined', 'info');
}

/* ── reviewing ── */
function usrHoShowReview(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  if (typeof requireWritable === 'function' && !requireWritable('Reviewing a handover')) return;
  const h = hoFind(id);
  if (!h) return;
  const items = hoItems(id);
  const ev0 = hoEvaluate(h, items.map(x => x.item.ledgerEntryId), {});
  _hoRev = { id, ticked: new Set(items.map(x => x.item.ledgerEntryId)), counted: {}, how: {},
             methods: ev0.rows.map(r => r.method) };
  const look = _usrColLookup();
  const rcpt = _usrReceiptLookup();
  const mi   = m => _hoRev.methods.indexOf(m || '');
  const disc = h.status === 'discrepancy';

  showModal('modal-lg',
    `<div class="hf-mh"><div class="hf-mh__ico">${icon('wallet','sm')}</div>
       <div><div class="hf-mh__t">Review handover — ${escHtml(h.wardenName || h.wardenId)}</div>
       <div class="hf-mh__s">Sent ${escHtml(_usrWhenText(h.createdAt))} · ${escHtml(String(h.lineCount))} lines · ${escHtml(fmtPKR(h.totalAmount))}${disc ? ' · in discrepancy' : ''}</div></div></div>`,
    `<div class="usr-ho-rev">
       <div class="usr-ho-bulk">
         <span>Tick what you received:</span>
         <button type="button" class="set-btn set-btn--sm" onclick="usrHoBulk(-1)">${icon('check','xs')}All</button>
         ${_hoRev.methods.map((m, i) => `<button type="button" class="set-btn set-btn--sm" onclick="usrHoBulk(${i})">${escHtml(m || 'Not recorded')}</button>`).join('')}
       </div>
       <div class="usr-ho-review">
         <div class="usr-ho-lines">
           <table class="set-table usr-coltable is-compact">
             <thead><tr><th></th><th>When</th><th>Student</th><th>Receipt</th><th>Method</th><th class="is-num">Amount</th></tr></thead>
             <tbody>
               ${items.map(x => {
                 const e = x.entry || {}, who = look(e), when = _usrWhen(e.createdAt);
                 const neg = money(x.item.amount) < 0;
                 const eid = escHtml(x.item.ledgerEntryId);
                 return `<tr data-line="${eid}">
                   <td>${neg
                     ? `<input type="checkbox" checked disabled title="A reversal is money already given back — it is always included." aria-label="Reversal, always included">`
                     : `<input type="checkbox" checked data-entry="${eid}" data-mi="${mi(x.item.method)}" aria-label="Received" onchange="usrHoTick('${eid}', this.checked)">`}</td>
                   <td>${when ? `<div class="al-when">${escHtml(when.top)}<small>${escHtml(when.sub)}</small></div>` : '<span class="lk-dash">—</span>'}</td>
                   <td><div class="usr-colwho">${neg ? '<span class="usr-kind">Reversed</span>' : ''}<b>${escHtml(who.name)}</b></div></td>
                   <td>${rcpt(e) ? escHtml(rcpt(e)) : '<span class="lk-dash">—</span>'}</td>
                   <td>${x.item.method ? pmBadge(x.item.method) : '<span class="lk-dash">Not recorded</span>'}</td>
                   <td class="is-num">${_usrAmt(money(x.item.amount))}</td>
                 </tr>`;
               }).join('')}
             </tbody>
           </table>
         </div>
         <div class="usr-ho-count">
           <div class="usr-sec">Count</div>
           <table class="usr-ho-ctable">
             <thead><tr><th>Method</th><th class="is-num">Expected</th><th class="is-num">Counted</th><th class="is-num">Difference</th></tr></thead>
             <tbody>
               ${ev0.rows.map((r, i) => `<tr>
                 <td>${escHtml(r.label)}</td>
                 <td class="is-num" id="ho-exp-${i}">${_usrAmt(r.expected)}</td>
                 <td class="is-num"><div class="usr-ho-cin">
                   <input class="form-control" type="number" inputmode="numeric" step="1" id="ho-cnt-${i}"
                          aria-label="${escHtml(r.label)} counted" oninput="usrHoCount(${i}, this.value)">
                   <button type="button" class="set-btn set-btn--sm" onclick="usrHoMatch(${i})" title="Copy the expected amount — use it only after counting">Matches</button>
                 </div></td>
                 <td class="is-num" id="ho-diff-${i}"><span class="lk-dash">—</span></td>
               </tr>`).join('')}
             </tbody>
             <tfoot><tr><td>Total</td><td class="is-num" id="ho-exp-total"></td><td class="is-num" id="ho-cnt-total"></td><td></td></tr></tfoot>
           </table>
           <div class="field" style="margin-top:12px">
             <label for="ho-note">${disc ? 'How was it settled? (needed to approve)' : 'Note (needed to flag a discrepancy)'}</label>
             <textarea class="form-control" id="ho-note" rows="3" maxlength="400" oninput="usrHoRefresh()"
                       placeholder="${disc ? 'e.g. Sara brought the missing Rs 1,000' : 'e.g. Cash short by Rs 1,000'}"></textarea>
           </div>
           ${Array.isArray(h.notes) && h.notes.length ? `<div class="usr-ho-notes">
             ${h.notes.map(nt => `<div class="usr-ho-note">${escHtml(nt.text)}<small>${escHtml((nt.byName || '') + ' · ' + _usrWhenText(nt.at))}</small></div>`).join('')}
           </div>` : ''}
         </div>
       </div>
       <div class="usr-ho-summary" id="ho-summary" aria-live="polite"></div>
     </div>`,
    `<button class="btn btn-secondary" onclick="_hoRev=null;closeModal()">Cancel</button>
     <button class="btn btn-secondary" onclick="exportHandoverPDF('${escHtml(id)}')">${icon('print','xs')} Export PDF</button>
     <button class="btn btn-secondary usr-ho-flagbtn" id="ho-flag" onclick="usrHoDoFlag()" disabled>Flag discrepancy</button>
     <button class="btn btn-primary" id="ho-approve" onclick="usrHoDoApprove()" disabled>Approve</button>`);
  usrHoRefresh();
}

function usrHoRefresh() {
  if (!_hoRev) return;
  const h = hoFind(_hoRev.id);
  if (!h) return;
  const ev = hoEvaluate(h, _hoRev.ticked, _hoRev.counted);
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  let cTotal = 0, cAny = false;
  ev.rows.forEach((r, i) => {
    set('ho-exp-' + i, _usrAmt(r.expected));
    if (r.counted !== null) { cTotal += r.counted; cAny = true; }
    set('ho-diff-' + i, r.difference === null ? '<span class="lk-dash">—</span>'
      : r.difference === 0 ? '<span class="usr-ho-diff is-ok">No difference</span>'
      : `<span class="usr-ho-diff is-bad">${r.difference > 0 ? 'Over ' : 'Short '}${escHtml(fmtPKR(Math.abs(r.difference)))}</span>`);
  });
  set('ho-exp-total', _usrAmt(ev.rows.reduce((s, r) => s + r.expected, 0)));
  set('ho-cnt-total', cAny ? _usrAmt(cTotal) : '<span class="lk-dash">—</span>');
  document.querySelectorAll('.usr-ho-lines tr[data-line]').forEach(tr => {
    tr.classList.toggle('is-off', !ev.ticked.has(tr.getAttribute('data-line')));
  });

  const note = String((document.getElementById('ho-note') || {}).value || '').trim();
  const disc = h.status === 'discrepancy';
  const who  = h.wardenName || 'the warden';
  let say = ev.returnedCount
    ? `Approving <b>${escHtml(fmtPKR(ev.approvedAmount))}</b> of ${escHtml(fmtPKR(ev.total))}. `
      + `${ev.returnedCount} line${ev.returnedCount === 1 ? '' : 's'} (${escHtml(fmtPKR(ev.returnedAmount))}) go${ev.returnedCount === 1 ? 'es' : ''} back to ${escHtml(who)}.`
    : `Approving <b>${escHtml(fmtPKR(ev.approvedAmount))}</b> — all ${ev.approvedCount} lines.`;
  if (!ev.allMatch) say += ' Count every method to approve; if the money does not match, flag a discrepancy.';
  else if (disc && !note) say += ' Write how the discrepancy was settled to approve.';
  set('ho-summary', say);

  const approve = /** @type {HTMLButtonElement|null} */ (document.getElementById('ho-approve'));
  if (approve) {
    approve.disabled = !(ev.canApprove && (!disc || note));
    approve.textContent = 'Approve ' + fmtPKR(ev.approvedAmount);
  }
  const flag = /** @type {HTMLButtonElement|null} */ (document.getElementById('ho-flag'));
  if (flag) flag.disabled = !note;
}

function usrHoTick(entryId, on) {
  if (!_hoRev) return;
  if (on) _hoRev.ticked.add(entryId); else _hoRev.ticked.delete(entryId);
  usrHoRefresh();
}

/* Tick or untick every line of one method at once (-1 = all methods). */
function usrHoBulk(i) {
  if (!_hoRev) return;
  const boxes = Array.from(document.querySelectorAll('.usr-ho-lines input[data-entry]'))
    .filter(b => i < 0 || b.getAttribute('data-mi') === String(i));
  const allOn = boxes.every(b => /** @type {HTMLInputElement} */ (b).checked);
  boxes.forEach(b => {
    const box = /** @type {HTMLInputElement} */ (b);
    box.checked = !allOn;
    const id = box.getAttribute('data-entry');
    if (box.checked) _hoRev.ticked.add(id); else _hoRev.ticked.delete(id);
  });
  usrHoRefresh();
}

function usrHoCount(i, value) {
  if (!_hoRev) return;
  const m = _hoRev.methods[i];
  _hoRev.counted[m] = value;
  _hoRev.how[m] = 'typed';
  usrHoRefresh();
}

/* Owner, 2026-09-14: a Matches button may copy the expected amount. The handover
   records that the figure was confirmed this way rather than typed. */
function usrHoMatch(i) {
  if (!_hoRev) return;
  const h = hoFind(_hoRev.id);
  if (!h) return;
  const m = _hoRev.methods[i];
  const row = hoEvaluate(h, _hoRev.ticked, _hoRev.counted).rows[i];
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById('ho-cnt-' + i));
  if (input) input.value = String(row.expected);
  _hoRev.counted[m] = String(row.expected);
  _hoRev.how[m] = 'matched';
  usrHoRefresh();
}

async function _usrHoFinish(fn, done) {
  if (!_hoRev) return;
  const note = String((document.getElementById('ho-note') || {}).value || '');
  const r = fn(_hoRev.id, { ticked: _hoRev.ticked, counted: _hoRev.counted, how: _hoRev.how, note });
  if (!r.ok) { toast(r.reason, 'error'); return; }
  _hoRev = null;
  await saveDB();
  closeModal();
  renderPage('users');
  if (typeof refreshNotifBell === 'function') refreshNotifBell();
  done(r);
}
function usrHoDoApprove() {
  _usrHoFinish(hoApprove, r => toast(
    fmtPKR(r.handover.approvedAmount) + ' approved from ' + (r.handover.wardenName || 'the warden')
    + (r.evaluation.returnedCount ? ' · ' + fmtPKR(r.evaluation.returnedAmount) + ' returned to their list' : ''),
    'success', hoLabel(r.handover)));
}
function usrHoDoFlag() {
  _usrHoFinish(hoFlag, r => toast('Flagged — the handover stays in the queue with your note',
    'warning', 'Discrepancy'));
}

/* ── export of one handover ── */
function _usrHandoverExportDef(id) {
  const h = hoFind(id);
  const items = hoItems(id);
  const look = _usrColLookup();
  const rcpt = _usrReceiptLookup();
  const time = v => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  const summary = [
    { label: 'Status', value: hoLabel(h) },
    { label: 'Handed over', value: fmtPKR(h.totalAmount) },
  ];
  if (h.status === 'approved') summary.push({ label: 'Approved', value: fmtPKR(h.approvedAmount) });
  Object.keys(h.expected || {}).forEach(m => {
    const c = h.counted ? h.counted[m] : null;
    const how = h.countedHow && h.countedHow[m] === 'matched' ? ' (confirmed with Matches)' : c != null ? ' (typed)' : '';
    summary.push({ label: (m || 'Not recorded') + ' counted',
                   value: c == null ? 'Not counted' : fmtPKR(c) + how });
  });
  return {
    module: 'Handover',
    title:  'Cash Handover',
    scope:  (h.wardenName || h.wardenId) + ' · sent ' + _usrWhenText(h.createdAt),
    filters: [['Reviewed by', h.adminName || 'Not yet reviewed']],
    summary,
    columns: [
      { label: 'Date',     type: 'date',  width: 13, value: x => x.entry ? ymd(new Date(x.entry.createdAt)) : '' },
      { label: 'Time',     type: 'text',  width: 9,  value: x => x.entry ? time(x.entry.createdAt) : '' },
      { label: 'Student',  type: 'text',  width: 22, value: x => x.entry ? look(x.entry).name : '' },
      { label: 'Room',     type: 'id',    width: 9,  value: x => x.entry ? look(x.entry).room : '' },
      { label: 'Receipt',  type: 'id',    width: 12, value: x => x.entry ? rcpt(x.entry) : '' },
      { label: 'Method',   type: 'text',  width: 14, value: x => x.item.method || 'Not recorded' },
      { label: 'Outcome',  type: 'text',  width: 12, value: x => x.item.outcome === 'approved' ? 'Approved'
                                                          : x.item.outcome === 'returned' ? 'Returned' : '—' },
      { label: 'Amount (Rs.)', type: 'money', width: 14, value: x => money(x.item.amount), total: 'sum' },
    ],
    rows: items,
    note: (Array.isArray(h.notes) && h.notes.length
      ? 'Notes — ' + h.notes.map(nt => (nt.byName || '') + ', ' + _usrWhenText(nt.at) + ': ' + nt.text).join(' | ')
      : 'No notes.'),
    empty: 'This handover has no lines.',
  };
}

function exportHandoverPDF(id) {
  const h = hoFind(id);
  if (!h) return;
  const mayRead = h.wardenId === CUR_ROLE || (typeof canDo === 'function' && canDo('users'));
  if (!mayRead) { toast('Only the warden or an administrator can export this handover', 'error'); return; }
  EXPORT.pdf(_usrHandoverExportDef(id));
}

/* ── THE WARDENS VIEW ─────────────────────────────────────────────────────── */
function _usrWardenAccounts() {
  const known = usrList();
  const ids = new Set(known.map(u => u.id));
  /* AN ACCOUNT DELETED AFTER IT COLLECTED keeps a row, under the name it last
     collected with (owner, 2026-09-14). Its ledger entries outlive it; a table
     built from today's accounts alone would drop that money from the Total. */
  const gone = new Map();
  (DB.studentLedger || []).forEach(e => {
    if (!e || e.imported || !e.createdBy || ids.has(e.createdBy)) return;
    gone.set(e.createdBy, { id: e.createdBy, name: e.createdByName || '(deleted account)',
                            active: false, deleted: true, perms: {} });
  });
  return known.concat([...gone.values()]).map(u => {
    const rows = ledgerCollections(u.id);
    const tot  = ledgerCollectionTotals(rows);
    const noHandover = !!(u.perms && u.perms.users === true);
    const open = noHandover ? null : hoOpenFor(u.id);
    return { u, rows, tot, noHandover, open,
             // Step 4: what is still with the account, and what is sent and waiting.
             toHand:  noHandover ? tot.holding : hoSum(hoPendingLines(u.id)),
             waiting: open ? money(open.totalAmount) : 0 };
  }).filter(a => a.rows.length || a.u.active !== false)
    .sort((a, b) => b.tot.holding - a.tot.holding
                 || String(a.u.name || '').localeCompare(String(b.u.name || '')));
}

/* Only methods that hold money get a column, in the order Settings lists them. */
function _usrWardenMethods(accounts) {
  const order = (DB.settings && Array.isArray(DB.settings.paymentMethods)) ? DB.settings.paymentMethods : [];
  const seen = new Set();
  accounts.forEach(a => a.tot.byMethod.forEach(m => seen.add(m.method)));
  return order.filter(m => seen.has(m))
    .concat([...seen].filter(m => order.indexOf(m) === -1 && m !== 'Not recorded').sort())
    .concat(seen.has('Not recorded') ? ['Not recorded'] : []);
}

function _usrMethodAmt(a, m) {
  const hit = a.tot.byMethod.find(x => x.method === m);
  return hit ? hit.amount : 0;
}

/* WHERE AN ACCOUNT'S MONEY STANDS, as a word (owner, 2026-09-14: after an
   approval the column showed a dash, which explained nothing). */
function _usrHandoverState(a) {
  if (a.noHandover) return { label: 'Not needed', hue: 'dh-slate',
    title: 'An account that manages users has nothing to hand over.' };
  if (a.open) return { label: hoLabel(a.open), hue: hoHue(a.open),
    title: 'Sent ' + _usrWhenText(a.open.createdAt) };
  const last = (DB.handovers || []).filter(h => h.wardenId === a.u.id && h.status === 'approved')
    .sort((x, y) => String(y.approvedAt).localeCompare(String(x.approvedAt)))[0] || null;
  if (a.toHand > 0) return { label: 'To hand over', hue: 'dh-slate',
    title: fmtPKR(a.toHand) + ' collected and not handed over yet'
         + (last ? ' · last cleared ' + _usrWhenText(last.approvedAt) : '') };
  if (last) return { label: 'Cleared', hue: 'dh-green',
    title: 'Everything handed over has been received · ' + _usrWhenText(last.approvedAt)
         + (last.adminName ? ' by ' + last.adminName : '') };
  return { label: '', hue: '', title: 'Nothing collected yet' };
}
function _usrHandoverCell(a) {
  const s = _usrHandoverState(a);
  return s.label
    ? `<span class="lk-chip ${s.hue}" title="${escHtml(s.title)}">${escHtml(s.label)}</span>`
    : `<span class="lk-dash" title="${escHtml(s.title)}">—</span>`;
}

function usrWardensView(tabs) {
  const accounts = _usrWardenAccounts();
  const selAcc = usersWardenSel ? accounts.find(a => a.u.id === usersWardenSel) || null : null;
  const sel  = selAcc ? selAcc.u.id : null;
  /* With an account open beside it the table keeps about 700px at 1366×768.
     The per-method split moves into the rail then, rather than scrolling Today
     and Handover out of sight. */
  const cols = sel ? [] : _usrWardenMethods(accounts);
  const sum  = get => accounts.reduce((s, a) => s + get(a), 0);
  const cell = v => v ? _usrAmt(v) : '<span class="lk-dash">—</span>';

  return `
  <div class="bk-head">
    <div class="set-head__ico dh-blue">${icon('wallet', 'md')}</div>
    <div class="set-head__mid">
      <div class="bk-head__t">Wardens' collections</div>
      <div class="bk-head__s">What each account holds, and the handovers waiting for you to count.</div>
    </div>
    <div class="al-head__acts">
      <button class="set-btn" onclick="exportWardensExcel()">${icon('fileSpreadsheet','xs')}Export Excel</button>
      <button class="set-btn" onclick="exportWardensPDF()">${icon('print','xs')}Export PDF</button>
    </div>
  </div>
  ${tabs}

  ${_usrHandoverQueue()}
  ${_usrMessQueue()}

  <div class="usr-split${sel ? ' is-open' : ''}">
    <div class="set-card usr-listcard">
      <div class="set-table-wrap">
        <table class="set-table usr-table usr-wtable">
          <thead><tr>
            <th>Account</th><th class="is-num">To hand over</th><th class="is-num">Waiting</th>
            ${cols.map(m => `<th class="is-num">${escHtml(m)}</th>`).join('')}
            <th class="is-num">Today</th><th>Last collection</th><th>Handover</th>
          </tr></thead>
          <tbody>
            ${accounts.map(a => {
              const when = _usrWhen(a.tot.last);
              const id = escHtml(a.u.id);
              return `<tr class="${sel === a.u.id ? 'is-on' : ''}" data-account="${id}" tabindex="0"
                          onclick="usrWardenOpen('${id}')"
                          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();usrWardenOpen('${id}')}">
                <td>
                  <div class="usr-who">${usrAvatar(a.u, 32)}
                    <div style="min-width:0">
                      <div class="usr-who__n">${escHtml(a.u.name || '(no name)')}${a.u.id === CUR_ROLE ? '<span class="usr-you">you</span>' : ''}</div>
                      <div class="usr-who__s">${a.u.deleted ? '<span class="lk-chip dh-slate">Account deleted</span>' : escHtml(usrRole(a.u))}</div>
                    </div>
                  </div>
                </td>
                <td class="is-num usr-hold">${_usrAmt(a.toHand)}</td>
                <td class="is-num usr-wait">${cell(a.waiting)}</td>
                ${cols.map(m => `<td class="is-num">${cell(_usrMethodAmt(a, m))}</td>`).join('')}
                <td class="is-num">${cell(a.tot.today)}</td>
                <td>${when ? `<div class="al-when">${escHtml(when.top)}<small>${escHtml(when.sub)}</small></div>` : '<span class="lk-dash">None yet</span>'}</td>
                <td>${_usrHandoverCell(a)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr>
            <td>Total</td>
            <td class="is-num usr-hold">${_usrAmt(sum(a => a.toHand))}</td>
            <td class="is-num usr-wait">${_usrAmt(sum(a => a.waiting))}</td>
            ${cols.map(m => `<td class="is-num">${_usrAmt(sum(a => _usrMethodAmt(a, m)))}</td>`).join('')}
            <td class="is-num">${_usrAmt(sum(a => a.tot.today))}</td>
            <td></td><td></td>
          </tr></tfoot>
        </table>
      </div>
      <div class="cfg-note">${icon('info','xs')}<span>Each account's own collections, less the reversals it recorded. Payments imported from before the ledger started carry no account and are in none of these figures.</span></div>
    </div>

    ${''/* An account opens in the slide-over now (showWardenPanel), not beside the table. */}
  </div>`;
}

/* `u` is the account row — a deleted account is not in WARDENS any more. */
function usrWardenRail(u) {
  const rows = ledgerCollections(u.id);
  const tot  = ledgerCollectionTotals(rows);
  const pg   = paginate(rows, usersRailFilter);
  const fact = (label, value) => `
    <div class="hi-fact"><span class="hi-fact__l">${escHtml(label)}</span><span class="hi-fact__v">${escHtml(value)}</span></div>`;

  /* The account slide-over's shell, like student details (owner, 2026-09-14). */
  return `
  <div class="stu-pan__scrim" onclick="closeAccountPanel()"></div>
  <aside class="stu-pan usr-pan usr-wrail" id="usr-panel" role="dialog" aria-modal="true"
         aria-label="Collections of ${escHtml(u.name || u.id)}">
    <header class="stu-pan__head">
      <div class="stu-pan__headtext">
        <span class="stu-pan__title">Collections</span>
        <span class="stu-pan__sub">What this account holds, newest first</span>
      </div>
      <button class="stu-pan__x" onclick="closeAccountPanel()" aria-label="Close">${icon('close','sm')}</button>
    </header>
    <div class="stu-pan__id">
      ${usrAvatar(u, 54)}
      <div class="stu-pan__idtext">
        <div class="stu-pan__name">${escHtml(u.name || '(no name)')}</div>
        <div class="stu-pan__meta">${escHtml(u.deleted ? 'Account deleted — its collections are kept' : usrRole(u))}</div>
      </div>
    </div>
    <div class="usr-pan__body">
      <div class="usr-sec">Collections</div>
      <div class="hi-facts" style="border-top:none;margin-top:0;padding-top:0">
        ${u.perms && u.perms.users
          ? fact('Collected', fmtPKR(tot.holding))
          : fact('To hand over', fmtPKR(hoSum(hoPendingLines(u.id))))
            + fact('Waiting approval', hoOpenFor(u.id) ? fmtPKR(hoOpenFor(u.id).totalAmount) : '—')}
        ${fact('Today', fmtPKR(tot.today))}
        ${fact('This month', fmtPKR(tot.month))}
        ${fact('Collections', String(tot.count))}
      </div>
      ${tot.byMethod.length ? `
      <div class="usr-sec">By method</div>
      <div class="hi-facts" style="border-top:none;margin-top:0;padding-top:0">
        ${tot.byMethod.map(m => fact(m.method, (m.amount < 0 ? '−' : '') + fmtPKR(Math.abs(m.amount)))).join('')}
      </div>` : ''}
      <div class="usr-sec">Newest first</div>
      ${rows.length
        ? _usrColTable(pg.slice, _usrColLookup(), true) + (pg.pages > 1 ? renderPager(pg, 'usersRailFilter', 'users') : '')
        : '<div class="usr-none">Nothing collected by this account since the ledger started.</div>'}
    </div>
  </aside>`;
}

function usrWardenOpen(id)  { usersRailFilter.page = 1; showWardenPanel(id); }
function usrWardenClose()   { closeAccountPanel(); }

/* ── EXPORTS — through the one engine (export/engine.js) ─────────────────────
   The document is the list on screen: the same rows, the same filters. */
function _usrCollectionsExportDef() {
  const rows  = ledgerCollections(CUR_ROLE);
  const tot   = ledgerCollectionTotals(rows);
  const look  = _usrColLookup();
  const shown = _usrColFiltered(rows, look);
  const f  = usersColFilter;
  const me = WARDENS[CUR_ROLE] || {};
  const time = r => new Date(r.entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return {
    module: 'Collections',
    title:  'My Collections',
    scope:  (me.name || CUR_ROLE) + ' · since the ledger started',
    filters: [
      ['Period', f.period === 'All' ? 'All time' : f.period],
      ['Method', f.method === 'All' ? 'All methods' : f.method],
      ['Search', f.search || 'None'],
    ],
    summary: [
      { label: me.perms && me.perms.users ? 'Collected' : 'Holding', value: fmtPKR(tot.holding) },
      { label: 'Today',       value: fmtPKR(tot.today) },
      { label: 'This month',  value: fmtPKR(tot.month) },
      { label: 'Collections', value: String(tot.count) },
    ],
    columns: [
      { label: 'Date',         type: 'date',  width: 13, value: r => ymd(new Date(r.entry.createdAt)) },
      { label: 'Time',         type: 'text',  width: 9,  value: time },
      { label: 'Student',      type: 'text',  width: 22, value: r => look(r.entry).name },
      { label: 'Room',         type: 'id',    width: 9,  value: r => look(r.entry).room },
      { label: 'Month billed', type: 'text',  width: 16, value: r => r.entry.month || '' },
      { label: 'Method',       type: 'text',  width: 14, value: r => r.entry.method || 'Not recorded' },
      { label: 'Type',         type: 'text',  width: 18, value: r => _usrColKind(r) + (r.deleted ? ' (record deleted)' : '') },
      { label: 'Reason',       type: 'wrap',  width: 34, value: r => r.kind === 'collected' ? '' : _usrReason(r.entry) },
      { label: 'Amount (Rs.)', type: 'money', width: 14, value: r => r.amount, total: 'sum' },
    ],
    rows: shown,
    note: 'Read from the student ledger. Payments imported from before the ledger started, and payments typed against a name with no student record, are not included.',
    empty: 'No collections match the selected filters.',
  };
}

function exportMyCollectionsPDF() {
  if (typeof requirePerm === 'function' && !requirePerm('reports')) return;
  EXPORT.pdf(_usrCollectionsExportDef());
}
function exportMyCollectionsExcel() {
  if (typeof requirePerm === 'function' && !requirePerm('reports')) return;
  EXPORT.excel(_usrCollectionsExportDef());
}

function _usrWardensExportDef() {
  const accounts = _usrWardenAccounts();
  const cols = _usrWardenMethods(accounts);
  const holding = accounts.reduce((s, a) => s + a.toHand + a.waiting, 0);
  return {
    module: 'Collections',
    title:  "Wardens' Collections",
    scope:  'Since the ledger started',
    filters: [['Accounts', 'Active accounts, and any account with collections']],
    summary: [
      { label: 'Accounts', value: String(accounts.length) },
      { label: 'Holding, all accounts', value: fmtPKR(holding) },
    ],
    columns: [
      { label: 'Account', type: 'text', width: 22, value: a => a.u.name || '(no name)' },
      { label: 'Role',    type: 'text', width: 14, value: a => a.u.deleted ? 'Account deleted' : usrRole(a.u) },
      { label: 'To hand over (Rs.)', type: 'money', width: 15, value: a => a.toHand, total: 'sum' },
      { label: 'Waiting (Rs.)',      type: 'money', width: 13, value: a => a.waiting, total: 'sum' },
    ].concat(cols.map(m => ({ label: m + ' (Rs.)', type: 'money', width: 13, value: a => _usrMethodAmt(a, m), total: 'sum' })))
     .concat([
      { label: 'Today (Rs.)', type: 'money', width: 13, value: a => a.tot.today, total: 'sum' },
      { label: 'Collections', type: 'number', width: 12, value: a => a.tot.count },
      { label: 'Last collection', type: 'date', width: 15, value: a => a.tot.last ? ymd(new Date(a.tot.last)) : '' },
      { label: 'Handover', type: 'text', width: 18, value: a => _usrHandoverState(a).label || 'Nothing collected' },
    ]),
    rows: accounts,
    note: 'Read from the student ledger. Each account\'s collections less the reversals it recorded. Imported history carries no account and is not included.',
    empty: 'No accounts have collections.',
  };
}

function exportWardensPDF() {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  EXPORT.pdf(_usrWardensExportDef());
}
function exportWardensExcel() {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  EXPORT.excel(_usrWardensExportDef());
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

  const self   = id === CUR_ROLE;
  const manage = typeof canDo === 'function' && canDo('users');

  /* THE STUDENT DRAWER'S SHELL (owner, 2026-09-14: "just like the student
     details"). .stu-pan* is students.css; .usr-pan narrows it to an account. */
  return `
  <div class="stu-pan__scrim" onclick="closeAccountPanel()"></div>
  <aside class="stu-pan usr-pan" id="usr-panel" role="dialog" aria-modal="true"
         aria-label="Account details for ${escHtml(u.name || id)}">
    <header class="stu-pan__head">
      <div class="stu-pan__headtext">
        <span class="stu-pan__title">${self ? 'My Account' : 'Account Details'}</span>
        <span class="stu-pan__sub">Profile, access and recent activity</span>
      </div>
      ${manage ? `<button class="stu-pan__print" id="usr-panel-edit" onclick="showUserEditor('${escHtml(id)}')">${icon('edit','xs')}${self ? 'Edit my details' : 'Edit user'}</button>` : ''}
      <button class="stu-pan__x" onclick="closeAccountPanel()" aria-label="Close">${icon('close','sm')}</button>
    </header>
    <div class="stu-pan__id">
      ${usrAvatar(user, 54)}
      <div class="stu-pan__idtext">
        <div class="stu-pan__name">${escHtml(u.name || '(no name)')}${self ? '<span class="usr-you">you</span>' : ''}</div>
        <div class="stu-pan__meta">${escHtml(u.email || u.username || id)}</div>
      </div>
    </div>
    <div class="usr-rail__chips">
      <span class="lk-chip ${usrRoleHue(role)}">${escHtml(role)}</span>
      <span class="lk-chip ${u.active === false ? 'dh-slate' : 'dh-green'}">${icon(u.active === false ? 'close' : 'check','xs')}${u.active === false ? 'Inactive' : 'Active'}</span>
      ${u.builtin ? `<span class="lk-chip dh-slate">${icon('shield','xs')}Built-in</span>` : ''}
    </div>
    ${''/* THE ACTIONS SIT AT THE TOP, under Edit (owner, 2026-09-14) — the
           student drawer's action grid, not a section at the bottom. */}
    ${manage ? `
    <div class="stu-pan__acts usr-pan__acts">
      <button class="stu-pan__act" onclick="usrResetPassword('${escHtml(id)}')">${icon('key','xs')}Reset password</button>
      <button class="stu-pan__act" disabled title="Impersonation needs a server to authorise it and an audit trail to record it. Neither exists in the offline edition.">${icon('userCheck','xs')}Sign in as user</button>
      ${self ? '' : `<button class="stu-pan__act${u.active === false ? '' : ' is-danger'}" onclick="usrToggleActive('${escHtml(id)}')">${icon(u.active === false ? 'check' : 'lock','xs')}${u.active === false ? 'Reactivate' : 'Deactivate'}</button>`}
    </div>` : ''}

    <div class="usr-pan__body">
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

      ${manage ? '' : `
      <div class="cfg-note">${icon('info','xs')}<span>An administrator changes the details of this account. Ask one if anything here is wrong.</span></div>`}
    </div>
  </aside>`;
}

/* ── CONTROLS ─────────────────────────────────────────────────────────────── */
/* ── THE ACCOUNT SLIDE-OVER ───────────────────────────────────────────────────
   Opened from a Users row, from "View account", and from My Account in the
   account menu. Same layering as the student drawer (331, under modals), so
   the editor opens over it and the panel is still there when it closes. */
let _usrPanelId   = null;
let _usrPanelMode = 'account';   // 'account' (details) or 'collections' (Wardens tab)

function _usrPanelHtml() {
  if (_usrPanelMode === 'collections') {
    const acc = _usrWardenAccounts().find(a => a.u.id === _usrPanelId);
    return acc ? usrWardenRail(acc.u) : '';
  }
  return WARDENS[_usrPanelId] ? usrDetail(_usrPanelId) : '';
}

function _usrPanelMount() {
  let host = document.getElementById('usr-panel-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'usr-panel-host';
    document.body.appendChild(host);
  }
  host.innerHTML = _usrPanelHtml();
  requestAnimationFrame(() => {
    const p = document.getElementById('usr-panel');
    if (p) p.classList.add('is-open');
  });
  document.addEventListener('keydown', _usrPanelEsc, true);
}

function showAccountPanel(id) {
  if (!id || typeof WARDENS === 'undefined' || !WARDENS[id]) { toast('Account not found', 'error'); return; }
  // Anyone may read their own account; another account's is for administrators.
  if (id !== CUR_ROLE && typeof requirePerm === 'function' && !requirePerm('users')) return;
  _usrPanelId = id;
  _usrPanelMode = 'account';
  _usrPanelMount();
}

/* An account's collections from the Wardens tab — including an account that was
   deleted after it collected, which is no longer in WARDENS. */
function showWardenPanel(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  if (!_usrWardenAccounts().some(a => a.u.id === id)) { toast('Account not found', 'error'); return; }
  _usrPanelId = id;
  _usrPanelMode = 'collections';
  _usrPanelMount();
}

function closeAccountPanel() {
  const p = document.getElementById('usr-panel');
  const host = document.getElementById('usr-panel-host');
  document.removeEventListener('keydown', _usrPanelEsc, true);
  _usrPanelId = null;
  if (!p) { if (host) host.innerHTML = ''; return; }
  p.classList.remove('is-open');
  setTimeout(() => { if (host && !_usrPanelId) host.innerHTML = ''; }, 200);
}

/* Capture phase, for the reason students.js gives: app.js's Escape empties the
   modal container first when bubbling, and one key press would shut both. */
function _usrPanelEsc(e) {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('modal-container');
  if (m && m.firstElementChild) return;
  closeAccountPanel();
}

/* Re-read what is open after an edit, a password reset or a deactivation. */
function refreshAccountPanel() {
  if (!_usrPanelId) return false;
  const host = document.getElementById('usr-panel-host');
  if (!host) { _usrPanelId = null; return false; }
  const html = _usrPanelHtml();
  if (!html) { closeAccountPanel(); return false; }
  host.innerHTML = html;
  const el = document.getElementById('usr-panel');
  if (el) el.classList.add('is-open');
  return true;
}

function usrOpen(id) { showAccountPanel(id); }
function usrClose() { closeAccountPanel(); }
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

/* What each of the eight permissions actually reaches, in the reference's
   grouped shape. Every line here is a real consequence of the tick above it. */
const PERM_GROUPS = {
  add:      { ico: 'plus',     hue: 'dh-green',  title: 'Add records',
              lines: ['Admit a student', 'Create rooms, singly or in bulk',
                      'Record an expense', 'Add an expense category'] },
  edit:     { ico: 'edit',     hue: 'dh-violet', title: 'Edit records',
              lines: ['Change a student already on file', 'Change a room',
                      'Change an expense', 'Move or shift a student'] },
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

/* ── THE PHOTO CONTROL ───────────────────────────────────────────────────────
   Owner, 2026-09-10: "the add user profile picture could not uploads at the
   time of ading user."

   TWO THINGS WERE WRONG, AND THE SECOND WAS WORSE.

   1. The Add form did not offer the control at all. It drew a dead box reading
      "Add after saving", because handleWardenPhoto() writes straight into
      WARDENS[key] and a user being created has no key yet. That is now held in
      _uPendingPhoto until saveUser() has an account to put it on.

   2. The control that WAS offered, on the Edit form, was also broken. Both
      states of it call `document.getElementById('u-photo-input').click()`, and
      nothing in this app has ever rendered an element with that id — so
      clicking the avatar threw on a null and did nothing at all, silently.
      The input is below, next to the control that opens it.

   The node is built here rather than in modals.js so it matches the 96px round
   frame this form's CSS draws; modals.js swaps it through _userAvatarNode(),
   which now delegates to this. */
function usfPhotoNode(photo) {
  const open = "document.getElementById('u-photo-input').click()";
  if (photo) {
    return '<div class="usf-photo__box has-img" id="u-avatar" onclick="' + open + '"'
         + ' title="Click to choose a different photo">'
         + '<img src="' + escHtml(photo) + '" alt=""></div>';
  }
  return '<div class="usf-photo__box is-empty" id="u-avatar" onclick="' + open + '"'
       + ' title="Click to upload a photo">'
       + icon('person', 'md') + '<span>Add photo</span></div>';
}

function showUserEditor(id) {
  if (typeof requirePerm === 'function' && !requirePerm('users')) return;
  // A photo chosen in one editor session must not leak into the next one.
  if (typeof _uPendingPhoto !== 'undefined') _uPendingPhoto = null;
  const isNew = !id;
  const u = isNew ? { username: '', name: '', phone: '', perms: {}, active: true } : (WARDENS[id] || {});
  const perms = u.perms || {};
  /* A new account starts with the everyday permissions ticked and the
     dangerous ones clear, so a mis-click cannot hand out delete or user
     management by default. */
  const defaultOn = { add: true, edit: true, payments: true, reports: true };
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
              ${usfPhotoNode(u.photo || '')}
              ${''/* The input the avatar's onclick has always tried to open.
                     It did not exist until 2026-09-10, so every click on the
                     avatar threw on a null and the upload appeared to do
                     nothing. `key` is '' while the account is being created;
                     handleWardenPhoto() holds the image until there is one. */}
              <input type="file" id="u-photo-input" accept="image/*" style="display:none"
                     onchange="handleWardenPhoto(event, '${escHtml(String(id || ''))}')">
              ${(u.photo || isNew)
                ? `<button type="button" class="usf-photo__x" id="u-photo-x"
                           style="${u.photo ? '' : 'display:none'}"
                           onclick="removeWardenPhoto('${escHtml(String(id || ''))}')">Remove</button>`
                : ''}
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
        ${''/* The count is read off PERMS rather than written out, so the
               eighth permission cannot arrive with the sentence still saying
               seven — which is exactly what happened on 2026-09-10. */}
        <div class="cfg-note">${icon('info', 'xs')}<span>This app enforces <b>these ${PERMS.length}</b>. The lines inside each card are what its tick grants — they are not separate switches, so nothing here can be half-granted. Permissions can be changed later from this page.</span></div>
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
