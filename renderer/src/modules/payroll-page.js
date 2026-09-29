/* ─── HOSTYLLO — STAFF & PAYROLL PAGE ─────────────────────────────────────────
   The screens for src/payroll.js, which holds every rule; this file only draws
   and collects. Built to the owner-approved mocks and plan
   (docs/STAFF_PAYROLL_PLAN_2026-09-30.md, 2026-09-30).

     Staff      KPI strip · search and filters · the register · export
                → the employee slide-over (profile, salary + history,
                  advances, payslips, personal, linked login)
     Payroll    one month: every employee on it, gross → deductions → net,
                Pay one / Pay selected, payslips (view, PDF, void)
     Advances   every advance, open first; give one, void one

   Forms: add / edit employee (Personal · Job · Pay), give advance (with the
   consequence spelled out before saving), pay (the payslip before it exists),
   final settlement, and the void dialogs. Admin-only actions (pay, void,
   settle) are shown disabled with the reason to everyone else.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

let prView = { tab: 'staff', status: 'Current', role: 'All', dept: 'All', search: '', month: thisMonth(), advShow: 'Open', page: 1 };
registerFilter('payroll', prView, () => ({ tab: prView.tab, status: 'Current', role: 'All', dept: 'All', search: '',
  month: thisMonth(), advShow: 'Open', page: 1 }));

function prSet(k, v) { prView[k] = v; if (k !== 'page') prView.page = 1; renderPage('payroll'); }
function prTab(t) { prView.tab = t; prView.page = 1; renderPage('payroll'); }

/* ── small drawing helpers ───────────────────────────────────────────────── */
const _prE = s => escHtml(String(s == null ? '' : s));
const _prInit = n => String(n || '?').trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
const PR_DEPT_HUE = { Management: 'violet', Kitchen: 'amber', Security: 'slate', Housekeeping: 'green', Maintenance: 'blue', Office: 'violet' };
function _prAvatar(e, big) {
  const hue = PR_DEPT_HUE[e.department] || 'blue';
  return e.photo
    ? `<img class="pr-av${big ? ' pr-av--lg' : ''}" src="${_prE(e.photo)}" alt="">`
    : `<span class="pr-av pr-av--${hue}${big ? ' pr-av--lg' : ''}">${_prE(_prInit(e.name))}</span>`;
}
function _prStatus(s) {
  const cls = s === 'Active' ? 'ok' : s === 'On leave' ? 'warn' : 'muted';
  return `<span class="pr-st pr-st--${cls}">${_prE(s)}</span>`;
}
const _prMon = m => monthLabel(m);
const _prAdminWhy = 'Paying, voiding and settling need an administrator (Manage users)';

/* Pakistani words for a payslip: "Twenty-Five Thousand", lakh and crore. */
function _prWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (!n) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = x => x < 20 ? a[x] : t[Math.floor(x / 10)] + (x % 10 ? '-' + a[x % 10] : '');
  const three = x => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thou = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(three(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thou) parts.push(two(thou) + ' Thousand');
  if (n) parts.push(three(n));
  return parts.join(' ');
}

/* ══ THE PAGE ═════════════════════════════════════════════════════════════ */
function renderPayroll() {
  if (!prAllowed()) {
    return '<div class="pr-empty"><b>Not permitted</b><span>Your account does not have the Staff &amp; payroll permission.</span></div>';
  }
  prRoles(); prDepartments();
  const openAdv = prAdvances().filter(a => a.status === 'Open' && prAdvanceBalance(a) > 0).length;
  const tabs = [['staff', 'Staff', icon('users', 'xs')], ['run', 'Payroll', icon('wallet', 'xs')],
                ['advances', 'Advances', icon('money', 'xs')]];
  const body = prView.tab === 'run' ? _prRunTab() : prView.tab === 'advances' ? _prAdvTab() : _prStaffTab();
  return `<div class="pr-page">
    <div class="pr-tabs" role="tablist">${tabs.map(([k, l, ic]) => `
      <button type="button" role="tab" aria-selected="${prView.tab === k}" class="pr-tab${prView.tab === k ? ' is-on' : ''}"
        data-tab="${k}" onclick="prTab('${k}')">${ic}${l}${k === 'advances' && openAdv ? `<em>${openAdv}</em>` : ''}</button>`).join('')}
    </div>
    ${body}
  </div>`;
}

/* ── KPIs ────────────────────────────────────────────────────────────────── */
function _prKpis() {
  const all = prEmployees();
  const current = all.filter(e => e.status !== 'Left');
  const active = current.filter(e => e.status === 'Active').length;
  const onLeave = current.filter(e => e.status === 'On leave').length;
  const gross = current.reduce((s, e) => s + prGross(e.pay), 0);
  const m = thisMonth(), sum = prMonthSummary(m);
  const out = prAdvances().filter(a => a.status === 'Open').reduce((s, a) => s + prAdvanceBalance(a), 0);
  const outStaff = new Set(prAdvances().filter(a => a.status === 'Open' && prAdvanceBalance(a) > 0).map(a => a.employeeId)).size;
  const pct = sum.staff ? Math.round(sum.paid / sum.staff * 100) : 0;
  const k = (label, value, sub, cls, extra) => `<div class="pr-k${cls ? ' ' + cls : ''}">
      <span class="pr-k__l">${label}</span><b class="pr-k__v">${value}</b>${extra || ''}<span class="pr-k__s">${sub}</span></div>`;
  return `<div class="pr-kpis">
    ${k('Active staff', active + `<small> / ${current.length}</small>`, onLeave ? onLeave + ' on leave' : (current.length ? 'Everyone at work' : 'No staff yet'))}
    ${k('Monthly payroll', 'Rs. ' + fmtKpi(gross), 'Gross, before advances')}
    ${k('Paid · ' + _prMon(m).split(' ')[0], sum.paid + `<small> of ${sum.staff}</small>`,
        sum.unpaid ? 'Rs. ' + fmtKpi(sum.dueNet) + ' still to pay' : (sum.staff ? 'All paid' : 'Nobody on this month'), '',
        `<div class="pr-bar"><i style="width:${pct}%"></i></div>`)}
    ${k('Advances outstanding', 'Rs. ' + fmtKpi(out), out ? outStaff + ' staff · recovered from salary' : 'None open', out ? 'is-warn' : '')}
  </div>`;
}

/* ══ STAFF TAB ════════════════════════════════════════════════════════════ */
function _prStaffRows() {
  const q = String(prView.search || '').trim().toLowerCase();
  return prEmployees().filter(e => {
    if (prView.status === 'Current' && e.status === 'Left') return false;
    if (prView.status !== 'Current' && prView.status !== 'All' && e.status !== prView.status) return false;
    if (prView.role !== 'All' && e.role !== prView.role) return false;
    if (prView.dept !== 'All' && e.department !== prView.dept) return false;
    if (!q) return true;
    return [e.name, e.ref, e.role, e.department, e.phone, e.cnic, e.cnic && e.cnic.replace(/-/g, '')]
      .some(v => String(v || '').toLowerCase().includes(q));
  }).sort((a, b) => (a.status === 'Left') - (b.status === 'Left') || String(a.ref).localeCompare(String(b.ref)));
}

function _prSelect(key, value, options, label) {
  return `<label class="pr-selw"><span class="sr-only">${label}</span><select class="pr-sel" aria-label="${label}"
    onchange="prSet('${key}', this.value)">${options.map(([v, l]) =>
      `<option value="${_prE(v)}"${String(value) === String(v) ? ' selected' : ''}>${_prE(l)}</option>`).join('')}</select></label>`;
}

function _prStaffTab() {
  const rows = _prStaffRows();
  const pg = paginate(rows, prView);
  const any = prEmployees().length;
  const table = !any ? `<div class="pr-card pr-empty pr-empty--big">
      <span class="pr-empty__ic">${icon('users', 'md')}</span><b>No staff yet</b>
      <span>Add your wardens, cooks, guards and cleaners to run payroll and give salary advances.</span>
      ${canDo('payroll') ? `<button class="btn btn-primary" onclick="showEmployeeForm()">${icon('plus', 'xs')} Add first employee</button>` : ''}</div>`
    : !rows.length ? `<div class="pr-card pr-empty"><b>No one matches</b><span>Try another search or filter.</span>
      <button class="btn btn-secondary btn-sm" onclick="resetFilters('payroll')">Clear filters</button></div>`
    : `<div class="pr-card"><table class="pr-tbl" id="pr-staff">
      <thead><tr><th>Employee</th><th>Role · Department</th><th>Contact</th><th class="n">Monthly salary</th><th class="n">Advance</th><th>Status</th><th></th></tr></thead>
      <tbody>${pg.slice.map(e => {
        const adv = prAdvanceOutstanding(e.id);
        return `<tr data-emp="${_prE(e.id)}" class="${e.status === 'Left' ? 'is-left' : ''}" tabindex="0"
            onclick="showEmployeePanel('${_prE(e.id)}')" onkeydown="if(event.key==='Enter')showEmployeePanel('${_prE(e.id)}')">
          <td><div class="pr-who">${_prAvatar(e)}<div><b>${_prE(e.name)}</b><small>${_prE(e.ref)} · joined ${_prE(fmtDate(e.joinDate))}</small></div></div></td>
          <td><span class="pr-role">${_prE(e.role)}</span><small>${_prE([e.department, e.shift, e.accountId ? 'Linked login' : ''].filter(Boolean).join(' · ') || '—')}</small></td>
          <td>${e.cnic ? `<span class="pr-mono">${cnicHtml(e.cnic)}</span>` : '<span class="pr-dash">No CNIC</span>'}<small>${_prE(e.phone)}</small></td>
          <td class="n"><b>${_prE(fmtPKR(prGross(e.pay)))}</b>${(e.pay.allowances || []).length ? `<small>${_prE(fmtPKR(e.pay.basic))} + allowances</small>` : ''}</td>
          <td class="n">${adv ? `<span class="pr-adv">${_prE(fmtPKR(adv))}</span>` : '<span class="pr-dash">—</span>'}</td>
          <td>${_prStatus(e.status)}</td>
          <td class="pr-more"><button class="lk-kebab" aria-label="Actions for ${_prE(e.name)}" onclick="event.stopPropagation();prRowMenu('${_prE(e.id)}',this)">${icon('moreVert', 'sm')}</button></td>
        </tr>`; }).join('')}</tbody></table>
      <div class="pr-foot"><span>${rows.length} employee${rows.length === 1 ? '' : 's'}</span>
        <span>Total monthly salary <b>${_prE(fmtPKR(rows.filter(e => e.status !== 'Left').reduce((s, e) => s + prGross(e.pay), 0)))}</b></span></div>
      ${renderPager(pg, 'prView', 'payroll')}</div>`;
  const roles = [['All', 'All roles']].concat(prRoles().map(r => [r, r]));
  const depts = [['All', 'All departments']].concat(prDepartments().map(d => [d, d]));
  return `${_prKpis()}
  <div class="pr-tools">
    <div class="pr-search">${icon('search', 'xs')}<input id="pr-search" type="search" placeholder="Search name, role, CNIC or phone…"
      value="${_prE(prView.search)}" oninput="clearTimeout(window.__prQ);window.__prQ=setTimeout(()=>prSet('search',this.value),220)" aria-label="Search staff"></div>
    ${_prSelect('status', prView.status, [['Current', 'Current staff'], ['Active', 'Active'], ['On leave', 'On leave'], ['Left', 'Left'], ['All', 'Everyone']], 'Status')}
    ${_prSelect('role', prView.role, roles, 'Role')}
    ${_prSelect('dept', prView.dept, depts, 'Department')}
    <span class="pr-sp"></span>
    ${any ? tbExport({ id: 'pr-exp', label: 'Export', excel: 'exportStaffExcel()', pdf: 'exportStaffPDF()' }) : ''}
    ${canDo('payroll') ? `<button class="btn btn-primary btn-sm" onclick="showEmployeeForm()">${icon('plus', 'xs')} Add employee</button>` : ''}
  </div>
  ${table}`;
}

function prRowMenu(id, btn) {
  const e = prFindEmployee(id); if (!e) return;
  const admin = prIsAdmin(), m = thisMonth();
  const paid = prPayslipFor(e.id, m);
  const items = [
    { label: 'View profile', on: `showEmployeePanel('${id}')`, svg: icon('eye', 'sm') },
    { label: 'Edit', on: `showEmployeeForm('${id}')`, svg: icon('edit', 'sm') },
  ];
  if (e.status !== 'Left') {
    items.push({ label: 'Give advance', on: `showAdvanceForm('${id}')`, svg: icon('money', 'sm') });
    items.push(paid ? { label: 'Paid for ' + _prMon(m), disabled: true, hint: paid.ref, svg: icon('check', 'sm') }
      : admin && prOnPayroll(e, m) ? { label: 'Pay ' + _prMon(m), on: `showPayForm('${id}','${m}')`, svg: icon('wallet', 'sm') }
      : { label: 'Pay ' + _prMon(m), disabled: true, hint: admin ? 'Not employed this month' : _prAdminWhy, svg: icon('wallet', 'sm') });
    items.push('sep');
    items.push(admin ? { label: 'Final settlement…', on: `showSettleForm('${id}')`, svg: icon('doorOpen', 'sm'), danger: true }
      : { label: 'Final settlement…', disabled: true, hint: _prAdminWhy, svg: icon('doorOpen', 'sm') });
  }
  lkRowMenu(btn, items);
}

/* ══ THE EMPLOYEE SLIDE-OVER ══════════════════════════════════════════════
   Same shell rules as the student panel: z-index 331 (under a modal's 350, so
   a form opened from it lands on top), Escape handled in the capture phase. */
let _prPanelId = null;
function showEmployeePanel(id) {
  const e = prFindEmployee(id); if (!e) return;
  _prPanelId = id;
  let host = document.getElementById('pr-pan-host');
  if (!host) { host = document.createElement('div'); host.id = 'pr-pan-host'; document.body.appendChild(host); }
  host.innerHTML = `<div class="pr-scrim" onclick="closeEmployeePanel()"></div>
    <aside class="pr-pan" id="pr-panel" role="dialog" aria-modal="true" aria-label="${_prE(e.name)}">${_prPanelHtml(e)}</aside>`;
  document.removeEventListener('keydown', _prPanelEsc, true);
  document.addEventListener('keydown', _prPanelEsc, true);
  requestAnimationFrame(() => { const p = document.getElementById('pr-panel'); if (p) p.classList.add('is-open'); });
}
function closeEmployeePanel() {
  document.removeEventListener('keydown', _prPanelEsc, true);
  _prPanelId = null;
  const p = document.getElementById('pr-panel');
  const host = document.getElementById('pr-pan-host');
  if (p) p.classList.remove('is-open');
  setTimeout(() => { if (host && !_prPanelId) host.innerHTML = ''; }, 200);
}
function _prPanelEsc(ev) {
  if (ev.key !== 'Escape' || document.querySelector('.modal-overlay.show, .modal-overlay.open, #pin-layer')) return;
  ev.stopPropagation(); closeEmployeePanel();
}
function refreshEmployeePanel() {
  if (!_prPanelId) return;
  const e = prFindEmployee(_prPanelId), p = document.getElementById('pr-panel');
  if (e && p) p.innerHTML = _prPanelHtml(e);
}

function _prPanelHtml(e) {
  const admin = prIsAdmin(), m = thisMonth();
  const paid = prPayslipFor(e.id, m), left = e.status === 'Left';
  const acc = e.accountId && typeof WARDENS !== 'undefined' ? WARDENS[e.accountId] : null;
  const hist = (e.payHistory || []).slice().sort((a, b) => b.from.localeCompare(a.from));
  const last = hist.find(h => h.reason && h.reason !== 'Joining salary');
  const advs = prAdvances().filter(a => a.employeeId === e.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const slips = prPayslips().filter(p => p.employeeId === e.id).sort((a, b) => b.month.localeCompare(a.month) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const payBtn = left ? '' : paid ? `<span class="pr-chip pr-chip--ok">${icon('check', 'xs')} ${_prE(_prMon(m))} paid</span>`
    : !prOnPayroll(e, m) ? '' : admin ? `<button class="btn btn-primary btn-sm" onclick="showPayForm('${e.id}','${m}')">${icon('wallet', 'xs')} Pay ${_prE(_prMon(m).split(' ')[0])}</button>`
    : `<button class="btn btn-primary btn-sm" disabled title="${_prAdminWhy}">Pay ${_prE(_prMon(m).split(' ')[0])}</button>`;
  const fact = (l, v) => `<div><span>${l}</span><b>${v || '<i class="pr-dash">—</i>'}</b></div>`;
  return `
    <header class="pr-pan__h"><span>Employee</span><button class="pr-x" onclick="closeEmployeePanel()" aria-label="Close">${icon('close', 'sm')}</button></header>
    <div class="pr-pan__id">${_prAvatar(e, true)}<div>
      <b>${_prE(e.name)}</b><small>${_prE([e.ref, e.role, e.department].filter(Boolean).join(' · '))}</small>
      <div class="pr-pan__chips">${_prStatus(e.status)}<span class="pr-chip">${_prE(e.employmentType)}</span>
        <span class="pr-chip">Since ${_prE(fmtDate(e.joinDate))}</span>${left && e.leftDate ? `<span class="pr-chip">Left ${_prE(fmtDate(e.leftDate))}</span>` : ''}</div></div></div>
    <div class="pr-pan__acts">${payBtn}
      ${left ? '' : `<button class="btn btn-secondary btn-sm" onclick="showAdvanceForm('${e.id}')">${icon('money', 'xs')} Give advance</button>`}
      <button class="btn btn-secondary btn-sm" onclick="showEmployeeForm('${e.id}')">${icon('edit', 'xs')} Edit</button>
      ${left ? '' : `<button class="btn btn-secondary btn-sm" ${admin ? `onclick="showSettleForm('${e.id}')"` : `disabled title="${_prAdminWhy}"`}>${icon('doorOpen', 'xs')} Settle</button>`}
    </div>
    <div class="pr-pan__b">
      <div class="pr-sec">Salary structure</div>
      <div class="pr-lines"><div><span>Basic</span><b>${_prE(fmtPKR(e.pay.basic))}</b></div>
        ${(e.pay.allowances || []).map(a => `<div><span>${_prE(a.label)}</span><b>${_prE(fmtPKR(a.amount))}</b></div>`).join('')}
        <div class="is-tot"><span>Monthly gross</span><b>${_prE(fmtPKR(prGross(e.pay)))}</b></div></div>
      <div class="pr-note">Paid on day ${_prE(e.pay.payDay)} · ${_prE(e.pay.method)}${e.pay.accountNo ? ' · ' + _prE(e.pay.accountNo) : ''}${last
        ? ` · last changed ${_prE(_prMon(last.from))} ("${_prE(last.reason)}")` : ''}</div>
      ${hist.length > 1 ? `<details class="pr-hist"><summary>Salary history (${hist.length})</summary>${hist.map(h =>
        `<div><b>${_prE(_prMon(h.from))}</b><span>${_prE(fmtPKR(prGross(h)))}</span><em>${_prE(h.reason || '')}${h.by ? ' · ' + _prE(h.by) : ''}</em></div>`).join('')}</details>` : ''}

      <div class="pr-sec">Advances${prAdvanceOutstanding(e.id) ? ` <em>${_prE(fmtPKR(prAdvanceOutstanding(e.id)))} open</em>` : ''}</div>
      ${advs.length ? advs.slice(0, 6).map(a => `<div class="pr-advbox is-${a.status.toLowerCase()}">
          <div><b>${_prE(fmtPKR(a.amount))}</b>${a.status === 'Open' && prAdvanceBalance(a) < a.amount ? ` <span class="pr-dim">· ${_prE(fmtPKR(prAdvanceBalance(a)))} left</span>` : ''}
            <small>${_prE(a.ref)} · ${_prE(fmtDate(a.date))} · "${_prE(a.reason)}"${a.givenByName ? ' · by ' + _prE(a.givenByName) : ''}</small></div>
          <span class="pr-chip pr-chip--${a.status === 'Open' ? 'warn' : a.status === 'Void' ? 'muted' : 'ok'}">${a.status === 'Open'
            ? (a.recovery.mode === 'instalments' ? a.recovery.instalments + ' instalments' : 'Off next salary') : _prE(a.status)}</span></div>`).join('')
        : '<div class="pr-none">No advances.</div>'}

      <div class="pr-sec">Payslips</div>
      ${slips.length ? `<div class="pr-slips">${slips.slice(0, 8).map(p => `<button type="button" class="pr-hrow${p.status === 'Void' ? ' is-void' : ''}" onclick="showPayslip('${p.id}')">
          <b>${_prE(_prMon(p.month))}</b><span class="pr-mono">${_prE(p.ref)}</span>
          <span>${p.status === 'Void' ? 'Voided' : p.totalDeductions ? '− ' + _prE(fmtPKR(p.totalDeductions)) + ' deducted' : 'No deductions'}</span>
          <b class="n">${_prE(fmtPKR(p.net))}</b></button>`).join('')}</div>` : '<div class="pr-none">Nothing paid yet.</div>'}

      <div class="pr-sec">Personal</div>
      <div class="pr-facts">
        ${fact('CNIC', e.cnic ? `<span class="pr-mono" title="${_prE(e.cnic)}">${_prE(maskCnic(e.cnic))}</span>` : '')}
        ${fact('Phone', _prE(e.phone))}
        ${fact("Father's name", _prE(e.fatherName))}
        ${fact('Emergency contact', _prE(e.emergency))}
        ${fact('Shift', _prE(e.shift))}
        ${fact('App login', acc ? _prE(acc.name || e.accountId) + (acc.lastLogin ? ' · last in ' + _prE(fmtDate(String(acc.lastLogin).slice(0, 10))) : '') : 'Not linked')}
      </div>
      ${e.address ? `<div class="pr-note">${_prE(e.address)}</div>` : ''}
      ${e.notes ? `<div class="pr-sec">Notes</div><div class="pr-note">${_prE(e.notes)}</div>` : ''}
      <div class="pr-note pr-note--foot">Added ${e.addedByName ? 'by ' + _prE(e.addedByName) + ' · ' : ''}${_prE(fmtDate(String(e.createdAt || '').slice(0, 10)))}</div>
    </div>`;
}

/* ══ ADD / EDIT EMPLOYEE ══════════════════════════════════════════════════ */
let _prFormPhoto = null, _prFormId = null;
function showEmployeeForm(id) {
  if (!prAllowed()) { toast('Your account does not have the Staff & payroll permission', 'error'); return; }
  const e = id ? prFindEmployee(id) : null;
  if (id && !e) return;
  _prFormId = id || null;
  _prFormPhoto = e ? (e.photo || '') : '';
  const v = e || { pay: { basic: '', allowances: [], payDay: 1, method: 'Cash' }, employmentType: 'Full-time', status: 'Active', joinDate: today() };
  const nextRef = 'EMP-' + String(Math.max(Number((DB.settings.refSeq || {}).emp) || 0,
    prEmployees().reduce((mx, x) => Math.max(mx, Number(String(x.ref || '').replace(/\D/g, '')) || 0), 0)) + 1).padStart(4, '0');
  const opt = (list, sel) => list.map(x => `<option value="${_prE(x)}"${x === sel ? ' selected' : ''}>${_prE(x)}</option>`).join('');
  const roles = prRoles().slice(); if (v.role && !roles.includes(v.role)) roles.unshift(v.role);
  const depts = [''].concat(prDepartments()); if (v.department && !depts.includes(v.department)) depts.push(v.department);
  const accounts = typeof WARDENS !== 'undefined' ? Object.keys(WARDENS).filter(k => WARDENS[k] && !WARDENS[k].deleted) : [];
  const fld = (label, inner, cls) => `<label class="pr-fld${cls ? ' ' + cls : ''}"><span>${label}</span>${inner}</label>`;
  const inp = (fid, val, ph, extra) => `<input class="form-control" id="${fid}" value="${_prE(val == null ? '' : val)}" placeholder="${_prE(ph || '')}" ${extra || ''}>`;
  showModal('modal-form', '', `
    <div class="hf-mh"><span class="hf-mh__ico">${icon(e ? 'edit' : 'plus', 'sm')}</span><div>
      <div class="hf-mh__t">${e ? 'Edit ' + _prE(e.name) : 'Add employee'}</div>
      <div class="hf-mh__s">${e ? _prE(e.ref) + ' · ' + _prE(e.role) : _prE(nextRef) + ' will be assigned on save'}</div></div></div>
    <div class="pr-form" id="pr-form">
      <section class="pr-fsec"><div class="pr-fsec__h"><b>1</b> Personal</div>
        <div class="pr-fsec__row">
          <div class="pr-grid">
            ${fld('Full name *', inp('prf-name', v.name, 'e.g. Imran Yousaf', 'maxlength="80"'))}
            ${fld("Father's name", inp('prf-father', v.fatherName, '', 'maxlength="80"'))}
            ${fld('CNIC', inp('prf-cnic', v.cnic, '12345-1234567-1', 'maxlength="15" oninput="fmtCnic(this)"'))}
            ${fld('Phone *', inp('prf-phone', v.phone, '03XX-XXXXXXX', 'maxlength="12" oninput="fmtPhone(this)"'))}
            ${fld('Emergency contact', inp('prf-emergency', v.emergency, 'Name (relation) · phone', 'maxlength="120"'))}
            ${fld('Address', inp('prf-address', v.address, '', 'maxlength="200"'))}
          </div>
          <div class="pr-photo" id="prf-photo">${_prPhotoInner()}</div>
          <input type="file" id="prf-photo-file" accept="image/png,image/jpeg,image/webp" hidden onchange="prPhotoLoad(this)">
        </div></section>
      <section class="pr-fsec"><div class="pr-fsec__h"><b>2</b> Job</div>
        <div class="pr-grid pr-grid--3">
          ${/* Pick from the list or type a new one — a new role is remembered
                for the next employee (DB.settings.staffRoles). */''}
          ${fld('Role *', `<input class="form-control" id="prf-role" list="prf-roles" value="${_prE(v.role || '')}" placeholder="Pick or type a role" maxlength="60">
            <datalist id="prf-roles">${roles.map(x => `<option value="${_prE(x)}">`).join('')}</datalist>`)}
          ${fld('Department', `<input class="form-control" id="prf-dept" list="prf-depts" value="${_prE(v.department || '')}" placeholder="Pick or type" maxlength="60">
            <datalist id="prf-depts">${depts.filter(Boolean).map(x => `<option value="${_prE(x)}">`).join('')}</datalist>`)}
          ${fld('Employment', `<select class="form-control" id="prf-type">${opt(PR_TYPES, v.employmentType)}</select>`)}
          ${fld('Joining date *', `<input class="form-control cdp-trigger" id="prf-join" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${_prE(v.joinDate)}">`)}
          ${fld('Shift', inp('prf-shift', v.shift, 'e.g. Night', 'maxlength="40"'))}
          ${e && e.status !== 'Left' ? fld('Status', `<select class="form-control" id="prf-status">${opt(['Active', 'On leave'], e.status)}</select>`) : ''}
          ${fld('App login', `<select class="form-control" id="prf-account"><option value="">No login (most staff)</option>${accounts.map(k =>
            `<option value="${_prE(k)}"${v.accountId === k ? ' selected' : ''}>${_prE((WARDENS[k].name || k) + ' — ' + (WARDENS[k].username || k))}</option>`).join('')}</select>`)}
        </div></section>
      <section class="pr-fsec"><div class="pr-fsec__h"><b>3</b> Pay</div>
        <div class="pr-grid pr-grid--3">
          ${fld('Basic salary *', inp('prf-basic', v.pay.basic === '' ? '' : Number(v.pay.basic).toLocaleString('en-PK'), '0', 'inputmode="numeric" class="form-control pr-num" oninput="prFormRecalc()"'))}
          ${fld('Pay day', `<select class="form-control" id="prf-payday">${Array.from({ length: 28 }, (_, i) => i + 1).map(d =>
            `<option value="${d}"${Number(v.pay.payDay) === d ? ' selected' : ''}>${d === 1 ? '1st of the month' : d === 2 ? '2nd' : d === 3 ? '3rd' : d + 'th'}</option>`).join('')}</select>`)}
          ${fld('Paid by', `<select class="form-control" id="prf-method">${typeof pmOptions === 'function' ? pmOptions(v.pay.method) : `<option>${_prE(v.pay.method)}</option>`}</select>`)}
          ${fld('Account title', inp('prf-acctitle', v.pay.accountTitle, 'For bank / wallet', 'maxlength="80"'))}
          ${fld('Account / wallet no.', inp('prf-accno', v.pay.accountNo, '', 'maxlength="40"'))}
        </div>
        <div class="pr-allow"><div class="pr-allow__h"><span>Allowances</span><em>added to the basic every month</em></div>
          <div id="prf-allow">${(v.pay.allowances || []).map(a => _prAllowRow(a.label, a.amount)).join('')}</div>
          <button type="button" class="pr-link" onclick="prFormAddAllowance()">${icon('plus', 'xs')} Add allowance</button></div>
        ${e ? `<div class="pr-change" id="prf-change" hidden>
          <div class="pr-change__h">${icon('info', 'xs')} The salary is changing — it is kept in the history</div>
          <div class="pr-grid">${fld('Applies from *', `<input class="form-control" id="prf-from" type="month" value="${_prE(_prNextOpenMonth(e))}">`)}
            ${fld('Reason *', inp('prf-reason', '', 'e.g. Annual increment', 'maxlength="120"'))}</div></div>` : ''}
        <div class="pr-sumline">Monthly gross <b id="prf-gross">—</b></div></section>
      <section class="pr-fsec">${fld('Notes', `<textarea class="form-control" id="prf-notes" rows="2" maxlength="500">${_prE(v.notes || '')}</textarea>`, 'pr-fld--wide')}</section>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="prf-save" onclick="submitEmployee()">${e ? 'Save changes' : 'Save employee'}</button>`);
  prFormRecalc();
}
function _prNextOpenMonth(e) {
  const paid = prPayslips().filter(p => p.employeeId === e.id && p.status !== 'Void').map(p => p.month).sort();
  const m = paid.length ? paid[paid.length - 1] : thisMonth();
  if (!paid.length) return thisMonth();
  const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function _prAllowRow(label, amount) {
  return `<div class="pr-arow"><input class="form-control" data-a="label" value="${_prE(label || '')}" placeholder="e.g. Transport" maxlength="60" oninput="prFormRecalc()">
    <input class="form-control pr-num" data-a="amount" inputmode="numeric" value="${amount === '' || amount == null ? '' : Number(amount).toLocaleString('en-PK')}" placeholder="0" oninput="prFormRecalc()">
    <button type="button" class="pr-arow__x" aria-label="Remove allowance" onclick="this.parentNode.remove();prFormRecalc()">${icon('close', 'xs')}</button></div>`;
}
function prFormAddAllowance() {
  const box = document.getElementById('prf-allow'); if (!box) return;
  box.insertAdjacentHTML('beforeend', _prAllowRow('', ''));
  const last = box.lastElementChild; if (last) last.querySelector('input').focus();
}
const _prNum = v => Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')) || 0;
function _prFormAllowances() {
  return [...document.querySelectorAll('#prf-allow .pr-arow')].map(r => ({
    label: r.querySelector('[data-a="label"]').value, amount: String(r.querySelector('[data-a="amount"]').value).replace(/,/g, '') }));
}
function prFormRecalc() {
  const basic = _prNum((document.getElementById('prf-basic') || {}).value);
  const gross = basic + _prFormAllowances().reduce((s, a) => s + _prNum(a.amount), 0);
  const g = document.getElementById('prf-gross'); if (g) g.textContent = fmtPKR(gross);
  const e = _prFormId ? prFindEmployee(_prFormId) : null;
  const ch = document.getElementById('prf-change');
  if (e && ch) {
    const changed = basic !== e.pay.basic || JSON.stringify(_prFormAllowances().filter(a => a.label || _prNum(a.amount))
      .map(a => [a.label.trim(), _prNum(a.amount)])) !== JSON.stringify((e.pay.allowances || []).map(a => [a.label, a.amount]));
    ch.hidden = !changed;
  }
}
function _prPhotoInner() {
  return _prFormPhoto
    ? `<img src="${_prE(_prFormPhoto)}" alt="Photo"><div class="pr-photo__acts"><button type="button" onclick="document.getElementById('prf-photo-file').click()">Change</button>
       <button type="button" onclick="prPhotoRemove()">Remove</button></div>`
    : `<button type="button" class="pr-photo__add" onclick="document.getElementById('prf-photo-file').click()">${icon('upload', 'sm')}<b>Photo</b><small>JPG or PNG</small></button>`;
}
function prPhotoLoad(input) {
  const f = input.files && input.files[0]; if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast('Choose a JPG, PNG or WebP image', 'error'); return; }
  if (f.size > 8 * 1024 * 1024) { toast('That image is larger than 8 MB', 'error'); return; }
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      /* Kept small: a 240px square is plenty for a card and a panel, and the
         photo lives inside the database and every backup. */
      const S = 240, c = document.createElement('canvas'); c.width = S; c.height = S;
      const k = Math.max(S / img.width, S / img.height), w = img.width * k, h = img.height * k;
      c.getContext('2d').drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      _prFormPhoto = c.toDataURL('image/jpeg', 0.85);
      const box = document.getElementById('prf-photo'); if (box) box.innerHTML = _prPhotoInner();
    };
    img.src = r.result;
  };
  r.readAsDataURL(f);
  input.value = '';
}
function prPhotoRemove() { _prFormPhoto = ''; const box = document.getElementById('prf-photo'); if (box) box.innerHTML = _prPhotoInner(); }

function _prVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function _prShowFail(r, map) {
  toast(r.reason || 'Could not save', 'error');
  const fid = r.field && map[r.field];
  const el = fid && document.getElementById(fid);
  if (el) { el.classList.add('is-invalid'); el.focus(); setTimeout(() => el.classList.remove('is-invalid'), 2400); }
}
async function submitEmployee() { return submitOnce('payroll:employee', _submitEmployee); }
async function _submitEmployee() {
  if (typeof requireWritable === 'function' && !requireWritable('This employee')) return;
  const input = {
    name: _prVal('prf-name'), fatherName: _prVal('prf-father'), cnic: _prVal('prf-cnic'), phone: _prVal('prf-phone'),
    emergency: _prVal('prf-emergency'), address: _prVal('prf-address'), role: _prVal('prf-role'), department: _prVal('prf-dept'),
    employmentType: _prVal('prf-type'), joinDate: _prVal('prf-join'), shift: _prVal('prf-shift'),
    status: _prVal('prf-status') || 'Active', accountId: _prVal('prf-account'),
    basic: String(_prVal('prf-basic')).replace(/,/g, ''), allowances: _prFormAllowances(),
    payDay: _prVal('prf-payday'), method: _prVal('prf-method'), accountTitle: _prVal('prf-acctitle'), accountNo: _prVal('prf-accno'),
    notes: _prVal('prf-notes'), photo: _prFormPhoto || '',
  };
  const map = { name: 'prf-name', cnic: 'prf-cnic', phone: 'prf-phone', role: 'prf-role', joinDate: 'prf-join', basic: 'prf-basic',
                accountId: 'prf-account', payFrom: 'prf-from', payReason: 'prf-reason', allowances: 'prf-allow' };
  const r = _prFormId ? prUpdateEmployee(_prFormId, input, { from: _prVal('prf-from'), reason: _prVal('prf-reason') }) : prAddEmployee(input);
  if (!r.ok) { _prShowFail(r, map); return; }
  // A role or department typed for the first time joins its list.
  if (r.record.role && !prRoles().includes(r.record.role)) prRoles().push(r.record.role);
  if (r.record.department && !prDepartments().includes(r.record.department)) prDepartments().push(r.record.department);
  await saveDB();
  closeModal();
  renderPage('payroll');
  if (_prPanelId === r.record.id) refreshEmployeePanel(); else if (!_prFormId) showEmployeePanel(r.record.id);
  toast(_prFormId ? 'Changes saved' : r.record.name + ' added as ' + r.record.ref, 'success');
}

/* ══ GIVE ADVANCE ═════════════════════════════════════════════════════════ */
let _prAdvOver = false;
function showAdvanceForm(empId) {
  if (!prAllowed()) { toast('Your account does not have the Staff & payroll permission', 'error'); return; }
  const staff = prEmployees().filter(e => e.status !== 'Left');
  if (!staff.length) { toast('Add an employee first', 'info'); return; }
  _prAdvOver = false;
  const sel = empId || '';
  showModal('modal-md', '', `
    <div class="hf-mh"><span class="hf-mh__ico">${icon('money', 'sm')}</span><div><div class="hf-mh__t">Give advance</div>
      <div class="hf-mh__s">Paid out now, recovered from salary</div></div></div>
    <div class="pr-form">
      <div class="pr-grid">
        <label class="pr-fld"><span>Employee *</span><select class="form-control" id="pra-emp" onchange="prAdvRecalc()">
          <option value="">Select employee</option>${staff.map(e => `<option value="${_prE(e.id)}"${e.id === sel ? ' selected' : ''}>${_prE(e.name + ' — ' + e.role)}</option>`).join('')}</select></label>
        <label class="pr-fld"><span>Amount *</span><input class="form-control pr-num" id="pra-amount" inputmode="numeric" placeholder="0" oninput="prAdvRecalc()"></label>
        <label class="pr-fld"><span>Date</span><input class="form-control cdp-trigger" id="pra-date" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></label>
        <label class="pr-fld"><span>Paid by</span><select class="form-control" id="pra-method">${typeof pmOptions === 'function' ? pmOptions('Cash') : '<option>Cash</option>'}</select></label>
      </div>
      <label class="pr-fld pr-fld--wide"><span>Reason *</span><input class="form-control" id="pra-reason" maxlength="120" placeholder="e.g. Family emergency"></label>
      <div class="pr-seg2" role="radiogroup" aria-label="Recovery"><span>Recover</span>
        <button type="button" role="radio" class="is-on" data-mode="next" onclick="prAdvMode('next')">All from next salary</button>
        <button type="button" role="radio" data-mode="instalments" onclick="prAdvMode('instalments')">In instalments</button>
        <select class="form-control pr-inst" id="pra-inst" hidden onchange="prAdvRecalc()">${[2, 3, 4, 5, 6, 8, 10, 12].map(n => `<option value="${n}">${n} months</option>`).join('')}</select></div>
      <div class="pr-conseq" id="pra-conseq"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="pra-save" onclick="submitAdvance()">Give advance</button>`);
  prAdvRecalc();
}
function prAdvMode(mode) {
  document.querySelectorAll('.pr-seg2 [data-mode]').forEach(b => b.classList.toggle('is-on', b.dataset.mode === mode));
  const inst = document.getElementById('pra-inst'); if (inst) inst.hidden = mode !== 'instalments';
  prAdvRecalc();
}
function _prAdvMode() { const b = document.querySelector('.pr-seg2 .is-on[data-mode]'); return b ? b.dataset.mode : 'next'; }
function prAdvRecalc() {
  const box = document.getElementById('pra-conseq'); if (!box) return;
  const e = prFindEmployee(_prVal('pra-emp'));
  const amt = _prNum(_prVal('pra-amount'));
  const btn = document.getElementById('pra-save');
  if (btn) btn.textContent = amt > 0 ? 'Give ' + fmtPKR(amt) : 'Give advance';
  if (!e || !(amt > 0)) { box.innerHTML = '<div class="pr-conseq__h">What happens when you save</div><div class="pr-dim">Pick the employee and the amount.</div>'; return; }
  const gross = prGross(e.pay), open = prAdvanceOutstanding(e.id);
  const mode = _prAdvMode(), n = Number(_prVal('pra-inst')) || 2;
  const per = mode === 'instalments' ? Math.ceil(amt / n) : amt;
  const nextDeduct = Math.min(gross, per + (open ? prOpenAdvances(e.id).reduce((s, a) => s + prAdvanceDue(a), 0) : 0));
  const over = amt + open > gross;
  box.innerHTML = `<div class="pr-conseq__h">What happens when you save</div>
    <div><i>1</i><span><b>${_prE(fmtPKR(amt))}</b> is added to <b>today's expenses</b> — ${_prE(PR_EXPENSE_CAT)}, "Advance — ${_prE(e.name)}".</span></div>
    <div><i>2</i><span>Next salary: ${_prE(fmtPKR(gross))} − ${_prE(fmtPKR(nextDeduct))}${open ? ' (including ' + _prE(fmtPKR(open)) + ' already open)' : ''} = <b>${_prE(fmtPKR(Math.max(0, gross - nextDeduct)))}</b> to pay${mode === 'instalments' ? `, then ${_prE(fmtPKR(per))} a month for ${n - 1} more` : ''}.</span></div>
    <div><i>3</i><span>Payroll money never touches a warden's handover.</span></div>
    ${over ? `<div class="pr-conseq__warn">${icon('warning', 'xs')}<span>This takes ${_prE(e.name)}'s advances to ${_prE(fmtPKR(amt + open))}, above one month's salary.
      ${prIsAdmin() ? `<label><input type="checkbox" id="pra-over" ${_prAdvOver ? 'checked' : ''} onchange="_prAdvOver=this.checked"> Allow it</label>` : 'Only an administrator can allow that.'}</span></div>` : ''}`;
}
async function submitAdvance() { return submitOnce('payroll:advance', _submitAdvance); }
async function _submitAdvance() {
  if (typeof requireWritable === 'function' && !requireWritable('This advance')) return;
  const input = { employeeId: _prVal('pra-emp'), amount: String(_prVal('pra-amount')).replace(/,/g, ''), date: _prVal('pra-date'),
    method: _prVal('pra-method'), reason: _prVal('pra-reason'), recoveryMode: _prAdvMode(), instalments: _prVal('pra-inst'), overLimit: _prAdvOver };
  const v = prValidateAdvance(input);
  if (!v.ok) { _prShowFail(v, { employeeId: 'pra-emp', amount: 'pra-amount', date: 'pra-date', reason: 'pra-reason', instalments: 'pra-inst' }); return; }
  if (typeof pinNeeded === 'function' && pinNeeded() && !(await pinConfirm({ what: 'giving an advance of ' + fmtPKR(v.value.amount) }))) return;
  const r = prGiveAdvance(input);
  if (!r.ok) { _prShowFail(r, {}); return; }
  await saveDB();
  closeModal();
  renderPage('payroll');
  refreshEmployeePanel();
  toast(r.record.ref + ' — ' + fmtPKR(r.record.amount) + ' given to ' + r.record.employeeName + ', added to expenses', 'success');
}

/* ══ ADVANCES TAB ═════════════════════════════════════════════════════════ */
function _prAdvTab() {
  const list = prAdvances().filter(a => prView.advShow === 'All' || (prView.advShow === 'Open' ? a.status === 'Open' : a.status === prView.advShow))
    .sort((a, b) => (a.status !== 'Open') - (b.status !== 'Open') || String(b.date).localeCompare(String(a.date)));
  const open = prAdvances().filter(a => a.status === 'Open');
  const outstanding = open.reduce((s, a) => s + prAdvanceBalance(a), 0);
  const month = thisMonth();
  const givenThis = prAdvances().filter(a => a.status !== 'Void' && String(a.date).startsWith(month)).reduce((s, a) => s + a.amount, 0);
  const admin = prIsAdmin();
  return `<div class="pr-kpis pr-kpis--3">
      <div class="pr-k is-warn"><span class="pr-k__l">Outstanding</span><b class="pr-k__v">Rs. ${fmtKpi(outstanding)}</b><span class="pr-k__s">${open.length} open advance${open.length === 1 ? '' : 's'}</span></div>
      <div class="pr-k"><span class="pr-k__l">Given · ${_prE(_prMon(month))}</span><b class="pr-k__v">Rs. ${fmtKpi(givenThis)}</b><span class="pr-k__s">Already in this month's expenses</span></div>
      <div class="pr-k"><span class="pr-k__l">Recovered to date</span><b class="pr-k__v">Rs. ${fmtKpi(prAdvances().filter(a => a.status !== 'Void').reduce((s, a) => s + (a.recovered || []).reduce((x, r) => x + r.amount, 0), 0))}</b><span class="pr-k__s">From salaries paid</span></div>
    </div>
    <div class="pr-tools">${_prSelect('advShow', prView.advShow, [['Open', 'Open'], ['Recovered', 'Recovered'], ['Void', 'Voided'], ['All', 'All advances']], 'Show')}
      <span class="pr-sp"></span><button class="btn btn-primary btn-sm" onclick="showAdvanceForm()">${icon('plus', 'xs')} Give advance</button></div>
    ${list.length ? `<div class="pr-card"><table class="pr-tbl" id="pr-adv"><thead><tr><th>Advance</th><th>Employee</th><th>Given</th><th>Recovery</th>
      <th class="n">Amount</th><th class="n">Balance</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(a => { const e = prFindEmployee(a.employeeId) || { name: a.employeeName, department: '' };
        return `<tr data-adv="${_prE(a.id)}" class="${a.status === 'Void' ? 'is-left' : ''}">
          <td><b class="pr-mono">${_prE(a.ref)}</b><small>"${_prE(a.reason)}"</small></td>
          <td><div class="pr-who">${_prAvatar(e)}<div><b>${_prE(e.name)}</b><small>${_prE(e.role || '')}</small></div></div></td>
          <td>${_prE(fmtDate(a.date))}<small>${_prE(a.method)}${a.givenByName ? ' · ' + _prE(a.givenByName) : ''}</small></td>
          <td>${a.recovery.mode === 'instalments' ? a.recovery.instalments + ' instalments' : 'Next salary'}<small>${(a.recovered || []).length ? (a.recovered || []).map(r => _prMon(r.month).split(' ')[0] + ' ' + fmtPKR(r.amount)).join(', ') : 'Nothing recovered yet'}${a.writtenOff ? ' · written off ' + fmtPKR(a.writtenOff) : ''}</small></td>
          <td class="n"><b>${_prE(fmtPKR(a.amount))}</b></td>
          <td class="n">${a.status === 'Open' ? `<span class="pr-adv">${_prE(fmtPKR(prAdvanceBalance(a)))}</span>` : '<span class="pr-dash">—</span>'}</td>
          <td><span class="pr-st pr-st--${a.status === 'Open' ? 'warn' : a.status === 'Void' ? 'muted' : 'ok'}">${_prE(a.status)}</span>${a.status === 'Void' ? `<small>${_prE(a.voidReason)}</small>` : ''}</td>
          <td>${a.status === 'Open' && !(a.recovered || []).length ? (admin ? `<button class="btn btn-secondary btn-sm" onclick="showVoidAdvance('${a.id}')">Void</button>`
            : `<button class="btn btn-secondary btn-sm" disabled title="${_prAdminWhy}">Void</button>`) : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`
      : `<div class="pr-card pr-empty"><b>${prView.advShow === 'Open' ? 'No open advances' : 'Nothing here'}</b><span>An advance is booked as an expense the day it is given and comes off the next salary.</span></div>`}`;
}
function showVoidAdvance(id) {
  const a = prFindAdvance(id); if (!a) return;
  _prVoidDialog('Void advance ' + a.ref, `${fmtPKR(a.amount)} to ${a.employeeName} on ${fmtDate(a.date)}. Its expense is removed from ${_prMon(a.date.slice(0, 7))}.`,
    `submitVoid('advance','${id}')`);
}
function showVoidPayslip(id) {
  const p = prFindPayslip(id); if (!p) return;
  _prVoidDialog('Void payslip ' + p.ref, `${p.employeeName} · ${_prMon(p.month)} · net ${fmtPKR(p.net)}. Its expense is removed, any advance it recovered is open again, and the month can be paid again.`,
    `submitVoid('payslip','${id}')`);
}
function _prVoidDialog(title, what, action) {
  showModal('modal-sm', '', `<div class="hf-mh"><span class="hf-mh__ico pr-ico--danger">${icon('warning', 'sm')}</span><div><div class="hf-mh__t">${_prE(title)}</div></div></div>
    <p class="pr-p">${_prE(what)}</p><p class="pr-p pr-dim">The record stays on file, marked void, with your reason.</p>
    <label class="pr-fld pr-fld--wide"><span>Reason *</span><input class="form-control" id="prv-reason" maxlength="120" placeholder="e.g. Entered twice"></label>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="${action}">Void</button>`);
  setTimeout(() => { const i = document.getElementById('prv-reason'); if (i) i.focus(); }, 60);
}
async function submitVoid(kind, id) { return submitOnce('payroll:void', () => _submitVoid(kind, id)); }
async function _submitVoid(kind, id) {
  if (typeof requireWritable === 'function' && !requireWritable('This change')) return;
  const why = _prVal('prv-reason');
  if (!String(why).trim()) { _prShowFail({ reason: 'Give a reason', field: 'r' }, { r: 'prv-reason' }); return; }
  if (typeof pinNeeded === 'function' && pinNeeded() && !(await pinConfirm({ what: 'voiding a payroll record' }))) return;
  const r = kind === 'advance' ? prVoidAdvance(id, why) : prVoidPayslip(id, why);
  if (!r.ok) { _prShowFail(r, { reason: 'prv-reason' }); return; }
  await saveDB();
  closeModal();
  renderPage('payroll');
  refreshEmployeePanel();
  toast(r.record.ref + ' voided', 'info');
}

/* ══ PAYROLL RUN ══════════════════════════════════════════════════════════ */
let _prSel = new Set();
function _prRunTab() {
  const m = prView.month;
  const staff = prEmployees().filter(e => prOnPayroll(e, m))
    .sort((a, b) => String(a.ref).localeCompare(String(b.ref)));
  const sum = prMonthSummary(m), admin = prIsAdmin();
  _prSel = new Set([..._prSel].filter(id => staff.some(e => e.id === id) && !prPayslipFor(id, m)));
  const selNet = [..._prSel].reduce((s, id) => s + ((prDraft(id, m) || {}).net || 0), 0);
  const months = []; { const d = new Date(); d.setDate(1); for (let i = 0; i < 12; i++) { months.push(ymd(d).slice(0, 7)); d.setMonth(d.getMonth() - 1); } }
  if (!months.includes(m)) months.push(m);
  const pct = sum.staff ? Math.round(sum.paid / sum.staff * 100) : 0;
  const unpaid = staff.filter(e => !prPayslipFor(e.id, m));
  const rows = staff.map(e => {
    const ps = prPayslipFor(e.id, m), d = ps || prDraft(e.id, m);
    const adv = d.deductions.filter(x => x.kind === 'advance').reduce((s, x) => s + x.amount, 0);
    const other = d.deductions.filter(x => x.kind !== 'advance').reduce((s, x) => s + x.amount, 0);
    return `<tr data-emp="${_prE(e.id)}" class="${ps ? 'is-paid' : ''}">
      <td>${ps ? '' : `<input type="checkbox" class="pr-cb" aria-label="Select ${_prE(e.name)}" ${_prSel.has(e.id) ? 'checked' : ''} ${admin ? '' : 'disabled'} onchange="prToggleSel('${e.id}',this.checked)">`}</td>
      <td><div class="pr-who">${_prAvatar(e)}<div><b>${_prE(e.name)}</b><small>${_prE(e.role)}${e.status === 'On leave' ? ' · on leave' : ''}</small></div></div></td>
      <td class="n">${_prE(fmtPKR(d.gross))}</td>
      <td class="n">${adv ? `<span class="pr-adv">− ${_prE(fmtPKR(adv))}</span>` : '<span class="pr-dash">—</span>'}</td>
      <td class="n">${other ? `<span title="${_prE(d.deductions.filter(x => x.kind !== 'advance').map(x => x.label).join(', '))}">− ${_prE(fmtPKR(other))}</span>` : '<span class="pr-dash">—</span>'}</td>
      <td class="n"><b>${_prE(fmtPKR(d.net))}</b></td>
      <td>${ps ? `<span class="pr-st pr-st--ok">Paid ${_prE(fmtDate(ps.paidDate).replace(/-\d{4}$/, ''))}</span>` : '<span class="pr-st pr-st--muted">Unpaid</span>'}</td>
      <td class="pr-rowact">${ps ? `<button class="pr-link" onclick="showPayslip('${ps.id}')">${icon('receipt', 'xs')} ${_prE(ps.ref)}</button>`
        : admin ? `<button class="btn btn-secondary btn-sm" onclick="showPayForm('${e.id}','${m}')">Pay</button>`
        : `<button class="btn btn-secondary btn-sm" disabled title="${_prAdminWhy}">Pay</button>`}</td></tr>`;
  }).join('');
  return `<div class="pr-runhead">
      <label class="pr-selw"><select class="pr-sel" aria-label="Month" onchange="prSet('month', this.value)">${months.map(x =>
        `<option value="${x}"${x === m ? ' selected' : ''}>${_prE(_prMon(x))}</option>`).join('')}</select></label>
      <span class="pr-runs">${sum.paid} of ${sum.staff} paid · ${_prE(fmtPKR(sum.paidNet))} of ${_prE(fmtPKR(sum.net))} net</span>
      <div class="pr-bar pr-bar--wide"><i style="width:${pct}%"></i></div>
      <span class="pr-sp"></span>
      ${sum.paid ? tbExport({ id: 'pr-run-exp', label: 'Export', excel: 'exportPayrollExcel()', pdf: 'exportPayrollPDF()' }) : ''}
      ${sum.paid ? `<button class="btn btn-secondary btn-sm" onclick="printMonthPayslips()">${icon('print', 'xs')} Payslips</button>` : ''}
      <button class="btn btn-primary btn-sm" id="pr-paysel" ${admin && _prSel.size ? '' : 'disabled'} ${admin ? '' : `title="${_prAdminWhy}"`}
        onclick="prPaySelected()">Pay selected${_prSel.size ? ' (' + _prSel.size + ') · ' + _prE(fmtPKR(selNet)) : ''}</button>
    </div>
    ${staff.length ? `<div class="pr-card"><table class="pr-tbl" id="pr-run"><thead><tr>
      <th style="width:30px">${unpaid.length && admin ? `<input type="checkbox" class="pr-cb" aria-label="Select all unpaid" ${_prSel.size === unpaid.length ? 'checked' : ''} onchange="prToggleAll(this.checked)">` : ''}</th>
      <th>Employee</th><th class="n">Gross</th><th class="n">Advance recovery</th><th class="n">Other</th><th class="n">Net to pay</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="pr-foot"><span>Each payment creates its payslip and its expense together</span><span>Net payroll <b>${_prE(fmtPKR(sum.net))}</b> · gross ${_prE(fmtPKR(sum.gross))}</span></div></div>`
      : `<div class="pr-card pr-empty"><b>Nobody on the payroll for ${_prE(_prMon(m))}</b><span>Staff appear from the month they join until the month they leave.</span></div>`}`;
}
function prToggleSel(id, on) { if (on) _prSel.add(id); else _prSel.delete(id); renderPage('payroll'); }
function prToggleAll(on) {
  const m = prView.month;
  _prSel = on ? new Set(prEmployees().filter(e => prOnPayroll(e, m) && !prPayslipFor(e.id, m)).map(e => e.id)) : new Set();
  renderPage('payroll');
}

/* ── pay one: the payslip before it exists ── */
let _prPay = null;
function showPayForm(empId, m) {
  if (!prIsAdmin()) { toast(_prAdminWhy, 'error'); return; }
  const e = prFindEmployee(empId); if (!e) return;
  if (prPayslipFor(empId, m)) { toast(e.name + ' is already paid for ' + _prMon(m), 'info'); return; }
  _prPay = { empId, m, other: [], prorate: true };
  showModal('modal-md', '', `
    <div class="hf-mh">${_prAvatar(e)}<div><div class="hf-mh__t">Pay ${_prE(e.name)} · ${_prE(_prMon(m))}</div>
      <div class="hf-mh__s">${_prE(e.ref)} · ${_prE(e.role)} · paid by ${_prE(e.pay.method)}</div></div></div>
    <div class="pr-form">
      <div class="pr-slip" id="prp-slip"></div>
      <div class="pr-grid">
        <label class="pr-fld"><span>Payment date</span><input class="form-control cdp-trigger" id="prp-date" type="text" readonly onclick="showCustomDatePicker(this,event)" onchange="prPayRecalc()" value="${today()}"></label>
        <label class="pr-fld"><span>Paid by</span><select class="form-control" id="prp-method">${typeof pmOptions === 'function' ? pmOptions(e.pay.method) : ''}</select></label>
      </div>
      <label class="pr-fld pr-fld--wide"><span>Note</span><input class="form-control" id="prp-note" maxlength="200" placeholder="Optional — printed on the payslip"></label>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="prp-save" onclick="submitPay()">Pay</button>`);
  prPayRecalc();
}
function prPayRecalc() {
  const p = _prPay, box = document.getElementById('prp-slip'); if (!p || !box) return;
  const d = prDraft(p.empId, p.m, { prorate: p.prorate, other: p.other, date: _prVal('prp-date') || today() });
  if (!d) return;
  const e = prFindEmployee(p.empId), days = prUnemployedDays(e, p.m);
  box.innerHTML = `
    <div class="pr-slip__cols">
      <div><div class="pr-slip__h">Earnings</div>
        <div class="pr-slip__r"><span>Basic</span><b>${_prE(fmtPKR(d.basic))}</b></div>
        ${d.allowances.map(a => `<div class="pr-slip__r"><span>${_prE(a.label)}</span><b>${_prE(fmtPKR(a.amount))}</b></div>`).join('')}
        <div class="pr-slip__r is-tot"><span>Gross</span><b>${_prE(fmtPKR(d.gross))}</b></div></div>
      <div><div class="pr-slip__h">Deductions</div>
        ${(() => { let oi = -1; return d.deductions.map(x => { if (x.kind === 'other') oi++;
          return `<div class="pr-slip__r"><span>${_prE(x.label)}${x.kind === 'other' ? ` <button class="pr-x2" aria-label="Remove ${_prE(x.label)}" onclick="prPayDelOther(${oi})">${icon('close', 'xs')}</button>` : ''}</span><b>− ${_prE(fmtPKR(x.amount))}</b></div>`; }).join(''); })()
          || '<div class="pr-slip__r pr-dim"><span>None</span><b>—</b></div>'}
        <div class="pr-slip__add"><input class="form-control" id="prp-olabel" placeholder="Other deduction, e.g. breakage" maxlength="60">
          <input class="form-control pr-num" id="prp-oamt" inputmode="numeric" placeholder="0"><button type="button" class="btn btn-secondary btn-sm" onclick="prPayAddOther()">Add</button></div>
        <div class="pr-slip__r is-tot"><span>Total deductions</span><b>− ${_prE(fmtPKR(d.totalDeductions))}</b></div></div>
    </div>
    ${days > 0 ? `<label class="pr-slip__opt"><input type="checkbox" ${p.prorate ? 'checked' : ''} onchange="_prPay.prorate=this.checked;prPayRecalc()">
      Take off the ${days} day${days === 1 ? '' : 's'} not employed this month</label>` : ''}
    <div class="pr-slip__net"><span>Net to pay</span><b>${_prE(fmtPKR(d.net))}</b><em>${_prE(_prWords(d.net))} Rupees only</em></div>
    ${d.carriedAdvance > 0 ? `<div class="pr-conseq__warn">${icon('info', 'xs')}<span>${_prE(fmtPKR(d.carriedAdvance))} of advances stays open for the next salary.</span></div>` : ''}
    <div class="pr-dim pr-small">Saving books ${_prE(fmtPKR(d.net))} to ${_prE(PR_EXPENSE_CAT)} on the payment date${d.deductions.some(x => x.kind === 'advance') ? '; the advance was booked when it was given' : ''}.</div>`;
  const btn = document.getElementById('prp-save'); if (btn) btn.textContent = 'Pay ' + fmtPKR(d.net);
}
function prPayAddOther() {
  const label = _prVal('prp-olabel').trim(), amt = _prNum(_prVal('prp-oamt'));
  if (!(amt > 0)) { toast('Enter the deduction amount', 'error'); return; }
  _prPay.other.push({ label: label || 'Other deduction', amount: Math.round(amt) });
  prPayRecalc();
}
function prPayDelOther(i) { if (i >= 0) { _prPay.other.splice(i, 1); prPayRecalc(); } }
async function submitPay() { return submitOnce('payroll:pay', _submitPay); }
async function _submitPay() {
  if (typeof requireWritable === 'function' && !requireWritable('This payment')) return;
  const p = _prPay; if (!p) return;
  const d = prDraft(p.empId, p.m, { prorate: p.prorate, other: p.other, date: _prVal('prp-date') });
  if (typeof pinNeeded === 'function' && pinNeeded() && !(await pinConfirm({ what: 'paying a salary of ' + fmtPKR(d ? d.net : 0) }))) return;
  const r = prPay(p.empId, p.m, { date: _prVal('prp-date'), method: _prVal('prp-method'), note: _prVal('prp-note'), prorate: p.prorate, other: p.other });
  if (!r.ok) { _prShowFail(r, { date: 'prp-date' }); return; }
  _prSel.delete(p.empId);
  await saveDB();
  closeModal();
  renderPage('payroll');
  refreshEmployeePanel();
  toast(r.record.ref + ' — ' + r.record.employeeName + ' paid ' + fmtPKR(r.record.net), 'success');
}

/* ── pay selected ── */
function prPaySelected() {
  if (!prIsAdmin()) { toast(_prAdminWhy, 'error'); return; }
  const m = prView.month, ids = [..._prSel].filter(id => !prPayslipFor(id, m));
  if (!ids.length) return;
  const drafts = ids.map(id => ({ e: prFindEmployee(id), d: prDraft(id, m) })).filter(x => x.e && x.d);
  const total = drafts.reduce((s, x) => s + x.d.net, 0);
  showModal('modal-md', '', `
    <div class="hf-mh"><span class="hf-mh__ico">${icon('wallet', 'sm')}</span><div><div class="hf-mh__t">Pay ${drafts.length} salar${drafts.length === 1 ? 'y' : 'ies'} · ${_prE(_prMon(m))}</div>
      <div class="hf-mh__s">Each is paid as its own payslip, with its own expense</div></div></div>
    <div class="pr-form">
      <div class="pr-batch">${drafts.map(x => `<div><span>${_prE(x.e.name)}<small>${_prE(x.e.role)}${x.d.totalDeductions ? ' · − ' + _prE(fmtPKR(x.d.totalDeductions)) : ''}</small></span><b>${_prE(fmtPKR(x.d.net))}</b></div>`).join('')}
        <div class="is-tot"><span>Total</span><b>${_prE(fmtPKR(total))}</b></div></div>
      <div class="pr-grid"><label class="pr-fld"><span>Payment date</span><input class="form-control cdp-trigger" id="prb-date" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></label>
        <label class="pr-fld"><span>Paid by</span><select class="form-control" id="prb-method"><option value="">Each employee's own method</option>${typeof pmOptions === 'function' ? pmOptions('') : ''}</select></label></div>
      <div class="pr-dim pr-small">Joining and leaving months are prorated and open advances recovered, exactly as each row shows. To add a one-off deduction, pay that person on their own.</div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="prb-save" onclick="submitPaySelected()">Pay ${_prE(fmtPKR(total))}</button>`);
}
async function submitPaySelected() { return submitOnce('payroll:paybatch', _submitPaySelected); }
async function _submitPaySelected() {
  if (typeof requireWritable === 'function' && !requireWritable('These payments')) return;
  const m = prView.month, ids = [..._prSel].filter(id => !prPayslipFor(id, m));
  const total = ids.reduce((s, id) => s + ((prDraft(id, m) || {}).net || 0), 0);
  if (typeof pinNeeded === 'function' && pinNeeded() && !(await pinConfirm({ what: 'paying ' + ids.length + ' salaries, ' + fmtPKR(total) }))) return;
  const date = _prVal('prb-date'), method = _prVal('prb-method');
  const done = [], failed = [];
  for (const id of ids) {
    const e = prFindEmployee(id);
    const r = prPay(id, m, { date, method: method || (e && e.pay.method) });
    (r.ok ? done : failed).push(r.ok ? r.record : (e ? e.name : id) + ': ' + r.reason);
  }
  _prSel = new Set();
  await saveDB();
  closeModal();
  renderPage('payroll');
  if (failed.length) toast(done.length + ' paid; ' + failed.length + ' not: ' + failed.join('; '), 'error');
  else toast(done.length + ' salar' + (done.length === 1 ? 'y' : 'ies') + ' paid — ' + fmtPKR(done.reduce((s, p) => s + p.net, 0)), 'success');
}

/* ══ PAYSLIP ══════════════════════════════════════════════════════════════ */
function showPayslip(id) {
  const p = prFindPayslip(id); if (!p) return;
  const admin = prIsAdmin();
  showModal('modal-md', '', `<div class="pr-psview">${_prPayslipBody(p, false)}</div>`,
    `${p.status !== 'Void' ? (admin ? `<button class="btn btn-danger" onclick="showVoidPayslip('${p.id}')">Void</button>`
      : `<button class="btn btn-danger" disabled title="${_prAdminWhy}">Void</button>`) : ''}
     <button class="btn btn-secondary" onclick="closeModal()">Close</button>
     <button class="btn btn-primary" onclick="payslipPDF('${p.id}')">${icon('print', 'xs')} Print / PDF</button>`);
}
function _prPayslipBody(p, paper) {
  const s = DB.settings || {};
  const e = prFindEmployee(p.employeeId) || {};
  const row = (l, v, cls) => `<tr class="${cls || ''}"><td>${_prE(l)}</td><td class="n">${v}</td></tr>`;
  return `
    <div class="ps-head">
      <div>${paper && s.logo && /^data:image\//.test(s.logo) ? `<img class="ps-logo" src="${_prE(s.logo)}" alt="">` : ''}
        <b class="ps-hostel">${_prE(s.hostelName || 'Hostel')}</b><span class="ps-sub">${_prE([s.location, s.phone].filter(Boolean).join(' · '))}</span></div>
      <div class="ps-title"><b>Payslip</b><span>${_prE(_prMon(p.month))}</span><span class="ps-ref">${_prE(p.ref)}</span></div>
    </div>
    ${p.status === 'Void' ? `<div class="ps-void">VOID — ${_prE(p.voidReason || '')}${p.voidedBy ? ' · ' + _prE(p.voidedBy) : ''}</div>` : ''}
    <div class="ps-who">
      <div><span>Employee</span><b>${_prE(p.employeeName)}</b></div><div><span>Employee ID</span><b>${_prE(p.employeeRef || '')}</b></div>
      <div><span>Role</span><b>${_prE(p.role || '')}${p.department ? ' · ' + _prE(p.department) : ''}</b></div><div><span>CNIC</span><b>${e.cnic ? _prE(maskCnic(e.cnic)) : '—'}</b></div>
      <div><span>Paid on</span><b>${_prE(fmtDate(p.paidDate))}</b></div><div><span>Paid by</span><b>${_prE(p.method)}${e.pay && e.pay.accountNo ? ' · ' + _prE(e.pay.accountNo) : ''}</b></div>
    </div>
    <div class="ps-cols">
      <table class="ps-tbl"><thead><tr><th>Earnings</th><th class="n">Rs.</th></tr></thead><tbody>
        ${row('Basic', fmtNum(p.basic))}${(p.allowances || []).map(a => row(a.label, fmtNum(a.amount))).join('')}
        ${row('Gross', fmtNum(p.gross), 'is-tot')}</tbody></table>
      <table class="ps-tbl"><thead><tr><th>Deductions</th><th class="n">Rs.</th></tr></thead><tbody>
        ${(p.deductions || []).map(x => row(x.label, fmtNum(x.amount))).join('') || row('None', '—')}
        ${row('Total deductions', fmtNum(p.totalDeductions), 'is-tot')}</tbody></table>
    </div>
    <div class="ps-net"><span>Net pay</span><b>Rs. ${_prE(fmtNum(p.net))}</b><em>${_prE(_prWords(p.net))} Rupees only</em></div>
    ${p.note ? `<div class="ps-note">${_prE(p.note)}</div>` : ''}
    <div class="ps-sign"><div><span></span>Paid by — ${_prE(p.paidByName || '')}</div><div><span></span>Received by — ${_prE(p.employeeName)}</div></div>`;
}
function _prPayslipCss() {
  return `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#111827;font-size:12px;padding:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ps{max-width:720px;margin:0 auto 18px;border:1px solid #888;border-radius:8px;padding:18px 20px;page-break-inside:avoid;break-inside:avoid}
  .ps+.ps{page-break-before:always;break-before:page}
  .ps-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111827;padding-bottom:10px;margin-bottom:12px}
  .ps-logo{width:34px;height:34px;object-fit:contain;display:block;margin-bottom:4px}.ps-hostel{font-size:17px;display:block}.ps-sub{font-size:10.5px;color:#374151}
  .ps-title{text-align:right}.ps-title b{display:block;font-size:18px;color:#1D4ED8}.ps-title span{display:block;font-size:11.5px;color:#374151}.ps-ref{font-family:monospace}
  .ps-void{border:2px solid #9F1C12;color:#9F1C12;font-weight:800;text-align:center;padding:6px;margin-bottom:10px;letter-spacing:.06em}
  .ps-who{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin-bottom:12px}.ps-who span{display:block;font-size:9.5px;color:#4B5563;text-transform:uppercase;letter-spacing:.05em;font-weight:700}.ps-who b{font-size:12px}
  .ps-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ps-tbl{width:100%;border-collapse:collapse}.ps-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#374151;border-bottom:1px solid #888;padding:5px 4px}
  .ps-tbl td{padding:5px 4px;border-bottom:1px solid #E5E7EB}.ps-tbl .n{text-align:right;font-variant-numeric:tabular-nums}.ps-tbl .is-tot td{font-weight:800;border-top:1px solid #888}
  .ps-net{margin-top:12px;border:1px solid #111827;border-radius:6px;padding:10px 12px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px}.ps-net span{font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:.05em}
  .ps-net b{font-size:20px}.ps-net em{flex-basis:100%;font-style:normal;font-size:11px;color:#374151}.ps-note{margin-top:8px;font-size:11px;color:#374151}
  .ps-sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:34px;font-size:10.5px;color:#374151}.ps-sign span{display:block;border-top:1px solid #111827;margin-bottom:4px}
  .n{text-align:right}@page{margin:10mm}`;
}
function _prPayslipDoc(slips, title) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${_prE(title)}</title><style>${_prPayslipCss()}</style></head><body>
    ${slips.map(p => `<div class="ps">${_prPayslipBody(p, true)}</div>`).join('')}</body></html>`;
}
function payslipPDF(id) {
  if (typeof hostelNameGate === 'function' && hostelNameGate(() => payslipPDF(id))) return;
  if (typeof requireOutput === 'function' && !requireOutput('printing')) return;
  const p = prFindPayslip(id); if (!p) return;
  _electronPDF(_prPayslipDoc([p], 'Payslip ' + p.ref + ' — ' + p.employeeName),
    printFileName('Payslip-' + p.ref + '-' + String(p.employeeName).replace(/\s+/g, '-'), _prMon(p.month)), { pageSize: paperSize(), landscape: false });
}
function printMonthPayslips() {
  if (typeof hostelNameGate === 'function' && hostelNameGate(() => printMonthPayslips())) return;
  if (typeof requireOutput === 'function' && !requireOutput('printing')) return;
  const m = prView.month;
  const slips = prPayslips().filter(p => p.month === m && p.status !== 'Void').sort((a, b) => String(a.employeeRef).localeCompare(String(b.employeeRef)));
  if (!slips.length) { toast('Nothing paid for ' + _prMon(m) + ' yet', 'info'); return; }
  _electronPDF(_prPayslipDoc(slips, 'Payslips — ' + _prMon(m)), printFileName('Payslips', _prMon(m)), { pageSize: paperSize(), landscape: false });
}

/* ══ FINAL SETTLEMENT ═════════════════════════════════════════════════════ */
let _prSettleId = null;
function showSettleForm(empId) {
  if (!prIsAdmin()) { toast(_prAdminWhy, 'error'); return; }
  const e = prFindEmployee(empId); if (!e || e.status === 'Left') return;
  _prSettleId = empId;
  showModal('modal-md', '', `
    <div class="hf-mh">${_prAvatar(e)}<div><div class="hf-mh__t">Final settlement · ${_prE(e.name)}</div>
      <div class="hf-mh__s">${_prE(e.ref)} · ${_prE(e.role)} · since ${_prE(fmtDate(e.joinDate))}</div></div></div>
    <div class="pr-form">
      <div class="pr-grid">
        <label class="pr-fld"><span>Last working day *</span><input class="form-control cdp-trigger" id="prs-left" type="text" readonly onclick="showCustomDatePicker(this,event)" onchange="prSettleRecalc()" value="${today()}"></label>
        <label class="pr-fld"><span>Reason for leaving</span><select class="form-control" id="prs-reason">${['Resigned', 'Contract ended', 'Terminated', 'Retired', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></label>
      </div>
      <div class="pr-conseq" id="prs-conseq"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-danger" id="prs-save" onclick="submitSettle()">Settle and mark as left</button>`);
  prSettleRecalc();
  const inp = document.getElementById('prs-left');
  if (inp) new MutationObserver(prSettleRecalc).observe(inp, { attributes: true, attributeFilter: ['value'] });
  if (inp) inp.addEventListener('input', prSettleRecalc);
}
function prSettleRecalc() {
  const box = document.getElementById('prs-conseq'), e = prFindEmployee(_prSettleId); if (!box || !e) return;
  const left = _prVal('prs-left');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(left)) { box.innerHTML = ''; return; }
  const m = left.slice(0, 7), already = prPayslipFor(e.id, m);
  const open = prAdvanceOutstanding(e.id);
  let lines = '';
  if (already) {
    lines = `<div><i>1</i><span>${_prE(_prMon(m))} is already paid (${_prE(already.ref)}), so no final payslip is made.</span></div>`;
  } else {
    const save = e.leftDate; e.leftDate = left;
    const d = prDraft(e.id, m, { recoverAll: true, prorate: true });
    if (save) e.leftDate = save; else delete e.leftDate;
    if (d) lines = `<div><i>1</i><span>Final payslip for ${_prE(_prMon(m))}: gross ${_prE(fmtPKR(d.gross))} − ${_prE(fmtPKR(d.totalDeductions))}
      (${_prE(d.deductions.map(x => x.label).join(', ') || 'no deductions')}) = <b>${_prE(fmtPKR(d.net))}</b> to pay now.</span></div>`;
    const rec = d ? d.deductions.filter(x => x.kind === 'advance').reduce((s, x) => s + x.amount, 0) : 0;
    if (open - rec > 0) lines += `<div><i>2</i><span><b>${_prE(fmtPKR(open - rec))}</b> of advances cannot be recovered and is written off — it was booked as an expense when it was given, so nothing more is booked.</span></div>`;
  }
  box.innerHTML = `<div class="pr-conseq__h">What happens when you settle</div>${lines}
    <div><i>${open ? 3 : 2}</i><span>${_prE(e.name)} is marked <b>Left</b> and leaves the payroll after ${_prE(_prMon(m))}. Their record and payslips stay.</span></div>`;
}
async function submitSettle() { return submitOnce('payroll:settle', _submitSettle); }
async function _submitSettle() {
  if (typeof requireWritable === 'function' && !requireWritable('This settlement')) return;
  const e = prFindEmployee(_prSettleId); if (!e) return;
  if (typeof pinNeeded === 'function' && pinNeeded() && !(await pinConfirm({ what: 'settling ' + e.name }))) return;
  const r = prSettle(e.id, { leftDate: _prVal('prs-left'), date: _prVal('prs-left') > today() ? today() : _prVal('prs-left'), reason: _prVal('prs-reason') });
  if (!r.ok) { _prShowFail(r, { leftDate: 'prs-left' }); return; }
  await saveDB();
  closeModal();
  renderPage('payroll');
  refreshEmployeePanel();
  toast(e.name + ' settled' + (r.payslip ? ' — ' + fmtPKR(r.payslip.net) + ' paid (' + r.payslip.ref + ')' : ''), 'success');
}

/* ══ EXPORTS (the one engine) ═════════════════════════════════════════════ */
function _prStaffDef() {
  const rows = _prStaffRows();
  return {
    module: 'Staff', title: 'Staff Register', scope: prView.status === 'Current' ? 'Current staff' : prView.status,
    filters: [['Status', prView.status], ['Role', prView.role], ['Department', prView.dept]].concat(prView.search ? [['Search', prView.search]] : []),
    summary: [{ label: 'Employees', value: String(rows.length) },
              { label: 'Monthly payroll', value: EXPORT.fmt.money(rows.filter(e => e.status !== 'Left').reduce((s, e) => s + prGross(e.pay), 0)) },
              { label: 'Advances open', value: EXPORT.fmt.money(rows.reduce((s, e) => s + prAdvanceOutstanding(e.id), 0)) }],
    columns: [
      { label: 'ID', type: 'id', width: 10, value: e => e.ref },
      { label: 'Name', type: 'text', width: 24, value: e => e.name, sub: e => e.fatherName ? 's/o ' + e.fatherName : '' },
      { label: 'Role', type: 'text', width: 20, value: e => e.role, sub: e => e.department || '' },
      { label: 'Phone', type: 'text', width: 14, value: e => e.phone },
      { label: 'CNIC', type: 'text', width: 17, value: e => e.cnic || '', pdf: false },
      { label: 'Joined', type: 'date', width: 13, value: e => e.joinDate },
      { label: 'Status', type: 'status', width: 10, value: e => e.status },
      { label: 'Monthly salary', type: 'money', width: 14, value: e => prGross(e.pay), total: 'sum' },
      { label: 'Advance open', type: 'money', width: 14, value: e => prAdvanceOutstanding(e.id), total: 'sum' },
    ],
    rows, empty: 'No staff match the selected filters.',
  };
}
function exportStaffPDF() { EXPORT.pdf(_prStaffDef()); }
function exportStaffExcel() { EXPORT.excel(_prStaffDef()); }

function _prPayrollDef() {
  const m = prView.month;
  const rows = prEmployees().filter(e => prOnPayroll(e, m)).map(e => ({ e, ps: prPayslipFor(e.id, m), d: prPayslipFor(e.id, m) || prDraft(e.id, m) }));
  const paid = rows.filter(r => r.ps);
  return {
    module: 'Payroll', title: 'Payroll', scope: _prMon(m), filters: [['Month', _prMon(m)]],
    summary: [{ label: 'Staff', value: String(rows.length) }, { label: 'Paid', value: paid.length + ' of ' + rows.length },
              { label: 'Gross', value: EXPORT.fmt.money(rows.reduce((s, r) => s + r.d.gross, 0)) },
              { label: 'Net paid', value: EXPORT.fmt.money(paid.reduce((s, r) => s + r.ps.net, 0)), tone: 'pos' }],
    columns: [
      { label: 'ID', type: 'id', width: 10, value: r => r.e.ref },
      { label: 'Employee', type: 'text', width: 24, value: r => r.e.name, sub: r => r.e.role },
      { label: 'Gross', type: 'money', width: 13, value: r => r.d.gross, total: 'sum' },
      { label: 'Advance recovered', type: 'money', width: 14, value: r => r.d.deductions.filter(x => x.kind === 'advance').reduce((s, x) => s + x.amount, 0), total: 'sum' },
      { label: 'Other deductions', type: 'money', width: 14, value: r => r.d.deductions.filter(x => x.kind !== 'advance').reduce((s, x) => s + x.amount, 0), total: 'sum' },
      { label: 'Net', type: 'money', width: 13, value: r => r.d.net, total: 'sum' },
      { label: 'Status', type: 'status', width: 10, value: r => r.ps ? 'Paid' : 'Unpaid' },
      { label: 'Paid on', type: 'date', width: 13, value: r => r.ps ? r.ps.paidDate : '' },
      { label: 'Method', type: 'text', width: 12, value: r => r.ps ? r.ps.method : '' },
      { label: 'Payslip', type: 'id', width: 11, value: r => r.ps ? r.ps.ref : '' },
    ],
    rows, grand: { label: 'Net payroll', value: fmtPKR(rows.reduce((s, r) => s + r.d.net, 0)) },
    note: 'Salaries are booked to ' + PR_EXPENSE_CAT + ' at the net paid; advances were booked when given.',
    empty: 'Nobody on the payroll for this month.',
  };
}
function exportPayrollPDF() { EXPORT.pdf(_prPayrollDef()); }
function exportPayrollExcel() { EXPORT.excel(_prPayrollDef()); }
