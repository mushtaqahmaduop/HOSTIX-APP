/* ─── HOSTIX — EXPENSES MODULE ─────────────────────────────────────────────
   Contains: renderExpenses, showAddExpenseModal, submitAddExpense,
             showEditExpenseModal, submitEditExpense, deleteExpense,
             showClearAllMenu, clearPayments, clearExpenses, clearStudents,
             clearAllData, clearAllDataWithPassword, confirmClearAllWithPassword
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ════════════════════════════════════════════════════════════════════════════
// EXPENSES v5 — rebuilt to the owner's reference design
// ════════════════════════════════════════════════════════════════════════════

// Categories are owner-configurable, so both the icon and the colour are matched
// on keywords rather than a fixed list — a hostel that renames "Meals" to
// "Staff Nashta" still gets the food icon. One table so the two can never drift.
// `hue` is null where no colour is semantically obvious; those fall through to
// the hash below, which is what keeps two food categories visually distinct.
const _EXP_CATS = [
  [/electric|light|wapda|bulb/i, 'dh-amber',  '<path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/>'],
  [/water|tank|plumb|pipe|tap/i, 'dh-blue',   '<path d="M12 2s6 7.5 6 11.5A6 6 0 0 1 6 13.5C6 9.5 12 2 12 2Z"/>'],
  [/gas|fuel|cylinder/i,         'dh-red',    '<path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 2 0 0-2-1-3 1-5Z"/>'],
  [/maint|repair|fix|tool/i,     'dh-green',  '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-1.4-1.4 2.6-2.6Z"/>'],
  [/clean|wash|soap|sweep/i,     'dh-green',  '<path d="M9 3h6v5H9z"/><path d="M8 8h8l1 13H7L8 8Z"/>'],
  [/secur|guard|chowkidar/i,     'dh-violet', '<path d="M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5l-8-3Z"/>'],
  [/internet|wifi|net|ptcl/i,    'dh-blue',   '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1.2"/>'],
  [/furnit|bed|chair|table/i,    'dh-violet', '<path d="M3 10V6h18v4"/><path d="M3 10h18v6H3z"/><path d="M5 16v3M19 16v3"/>'],
  [/meal|nashta|food|lunch|dinner|chai|tea|breakfast|kitchen|rashan/i,
                                 null,        '<path d="M7 2v9M4 2v6a3 3 0 0 0 3 3M17 2c-1.5 0-2.5 1.5-2.5 4s1 4 2.5 4"/><path d="M7 11v11M17 10v12"/>'],
  [/rent|salary|staff|wage|pay/i, null,       '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 1.6c-3.2 0-6.4 1.6-6.4 4V19a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1v-1.4c0-2.4-3.2-4-6.4-4Z"/>'],
];
const _EXP_ICON_FALLBACK = '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>';

function _expCatMatch(cat) {
  return _EXP_CATS.find(row => row[0].test(String(cat || '')));
}

function expCatIcon(cat) {
  const hit = _expCatMatch(cat);
  return hit ? hit[2] : _EXP_ICON_FALLBACK;
}

// Semantic hue where there is one, otherwise a stable hash of the name — so a
// category keeps the same pill colour between renders and across machines.
// Mirrors payAvatarHue()'s hashing.
function expCatHue(cat) {
  const name = String(cat || '');
  if (/^other$/i.test(name)) return 'dh-slate';   // the catch-all reads as neutral
  const hit = _expCatMatch(name);
  if (hit && hit[1]) return hit[1];
  const hues = ['dh-amber','dh-violet','dh-green','dh-blue','dh-red'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

// Minimal inline sparkline. Chart.js would be four more canvases on this page
// for four decorative 60x26 trends; an SVG polyline costs nothing and cannot
// leak a chart instance on re-render.
function expSpark(values) {
  const w = 62, h = 26, pad = 3;
  const v = (values && values.length) ? values : [0, 0];
  const max = Math.max.apply(null, v), min = Math.min.apply(null, v);
  const span = (max - min) || 1;
  const step = v.length > 1 ? (w - pad * 2) / (v.length - 1) : 0;
  const pts = v.map((n, i) =>
    (pad + i * step).toFixed(1) + ',' + (h - pad - ((n - min) / span) * (h - pad * 2)).toFixed(1)
  ).join(' ');
  return `<svg class="exp-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderExpenses() {
  const mo      = thisMonth();
  const moLabel = thisMonthLabel();

  // Month scope: '' means the current month, 'All' every month, otherwise a
  // specific YYYY-MM picked from the dropdown.
  const scope = expFilter.showAll ? 'All' : (expFilter.month || mo);
  const inScope = e => scope === 'All' || String(e.date || '').startsWith(scope);

  const scoped = DB.expenses.filter(inScope);

  let exps = scoped.filter(e => {
    if (expFilter.cat !== 'All' && e.category !== expFilter.cat) return false;
    if (expFilter.search) {
      const q = expFilter.search.toLowerCase();
      if (!String(e.description || '').toLowerCase().includes(q) &&
          !String(e.category || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  exps = applySort(exps, expFilter, {
    date:        e => e.date || '',
    category:    e => String(e.category || '').toLowerCase(),
    description: e => String(e.description || '').toLowerCase(),
    amount:      e => Number(e.amount) || 0,
  });
  if (!expFilter.sortKey) exps = exps.sort((a, b) => String(b.date||'').localeCompare(String(a.date||'')));

  const total = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
  const _pg   = paginate(exps, expFilter);

  // ── Stat strip ────────────────────────────────────────────────────────────
  const scopedTotal = scoped.reduce((s, e) => s + Number(e.amount || 0), 0);
  // Average per day across the days actually elapsed in the scope, not the
  // calendar month — dividing August's spend by 31 on the 8th reads far too low.
  const now = new Date();
  const daysElapsed = (scope === 'All')
    ? Math.max(1, new Set(scoped.map(e => e.date)).size)
    : (scope === mo ? Math.max(1, now.getDate())
                    : Math.max(1, new Date(Number(scope.slice(0,4)), Number(scope.slice(5,7)), 0).getDate()));
  const avgDaily  = Math.round(scopedTotal / daysElapsed);
  const activeCat = new Set(scoped.map(e => e.category).filter(Boolean)).size;

  // Daily totals across the scope drive every sparkline's shape.
  const byDay = {};
  scoped.forEach(e => { const d = String(e.date||''); if (d) byDay[d] = (byDay[d]||0) + Number(e.amount||0); });
  const days      = Object.keys(byDay).sort();
  const daySeries = days.map(d => byDay[d]);
  const cntSeries = days.map(d => scoped.filter(e => e.date === d).length);

  const scopeLabel = scope === 'All' ? 'All months'
                   : scope === mo    ? 'This Month'
                   : fmtMonthLabel(scope);

  const stat = (hue, icon, label, value, sub, series) => `
    <div class="exp-stat ${hue}">
      <span class="exp-stat__ic">${icon}</span>
      <div class="exp-stat__c">
        <div class="exp-stat__l">${label}</div>
        <div class="exp-stat__v">${value}</div>
        <div class="exp-stat__s">${sub}</div>
      </div>
      ${expSpark(series)}
    </div>`;

  const stats = `
  <div class="exp-stats">
    ${stat('dh-violet','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
          'Total Expenses', fmtPKR(scopedTotal), scopeLabel, daySeries)}
    ${stat('dh-blue','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 15 6-6"/><path d="M15 9h-4"/><path d="M15 9v4"/></svg>',
          'Average Daily', fmtPKR(avgDaily), 'Avg per day', daySeries)}
    ${stat('dh-green','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>',
          'Total Records', String(scoped.length), scopeLabel, cntSeries)}
    ${stat('dh-amber','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
          'Categories', String(activeCat), 'Active', cntSeries)}
  </div>`;

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const catOpts = DB.settings.expenseCategories
    .map(c => `<option value="${escHtml(c)}" ${expFilter.cat===c?'selected':''}>${escHtml(c)}</option>`).join('');

  const monthsPresent = [...new Set(DB.expenses.map(e => String(e.date||'').slice(0,7)).filter(Boolean))]
    .sort().reverse();
  if (!monthsPresent.includes(mo)) monthsPresent.unshift(mo);
  const monthOpts = monthsPresent
    .map(m => `<option value="${m}" ${scope===m?'selected':''}>${fmtMonthLabel(m)}</option>`).join('');

  const th = (key, label, extra) => {
    const on  = expFilter.sortKey === key;
    const arw = on ? (expFilter.sortDir === 'asc' ? '▲' : '▼') : '⇅';
    return `<th class="is-sortable${on?' is-sorted':''}" ${extra||''} onclick="toggleSort(expFilter,'expenses','${key}')" title="Sort by ${label}">${label}<span class="arw">${arw}</span></th>`;
  };

  const toolbar = `
  <div class="exp-tools">
    <div class="exp-search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="search-expenses" placeholder="Search expenses..." value="${escHtml(expFilter.search)}"
             oninput="capFirstChar(this);expFilter.search=this.value;expFilter.page=1;_dExpenses()">
    </div>
    <select class="exp-select${expFilter.cat!=='All'?' is-set':''}" onchange="expFilter.cat=this.value;expFilter.page=1;renderPage('expenses')" title="Filter by category">
      <option value="All">All Categories</option>${catOpts}
    </select>
    <div class="exp-month">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>
      <select onchange="expSetMonth(this.value)" title="Filter by month">
        <option value="All" ${scope==='All'?'selected':''}>All Months</option>
        ${monthOpts}
      </select>
    </div>
    <div class="exp-count">${_pg.total} record${_pg.total!==1?'s':''} &middot; <b>${fmtPKR(total)}</b></div>
  </div>`;

  // ── Table ─────────────────────────────────────────────────────────────────
  const rows = _pg.slice.map(e => {
    const hue = expCatHue(e.category);
    return `<tr>
      <td class="exp-date">${escHtml(fmtDate(e.date))}</td>
      <td>
        <span class="exp-cat ${hue}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">${expCatIcon(e.category)}</svg>
          ${escHtml(e.category || 'Other')}
        </span>
      </td>
      <td class="exp-desc">${e.description ? escHtml(e.description) : '<span class="exp-dash">—</span>'}</td>
      <td class="exp-amt">${fmtPKR(e.amount)}</td>
      <td>
        <div class="exp-acts">
          <button class="exp-act dh-blue" onclick="showEditExpenseModal('${e.id}')" title="Edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="exp-act dh-red" onclick="deleteExpense('${e.id}')" title="Delete"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const table = `
  <div class="exp-shell">
    <div class="exp-table-wrap">
      <table class="exp-table">
        <thead><tr>
          ${th('date','Date')}
          ${th('category','Category')}
          ${th('description','Description')}
          ${th('amount','Amount')}
          <th>Actions</th>
        </tr></thead>
        <tbody>
          ${_pg.total===0
            ? `<tr><td colspan="5"><div class="exp-empty">
                 <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
                 <div>No expenses match these filters.</div></div></td></tr>`
            : rows}
        </tbody>
      </table>
    </div>
    ${expPager(_pg)}
  </div>`;

  return stats + toolbar + table;
}

// Month dropdown → filter state. 'All' switches the page out of month scope.
function expSetMonth(v) {
  if (v === 'All') { expFilter.showAll = true; expFilter.month = ''; }
  else             { expFilter.showAll = false; expFilter.month = v; }
  expFilter.page = 1;
  renderPage('expenses');
}

// 'YYYY-MM' → 'August 2026'. Built from a fixed day so a short month can never
// roll the date into the next one.
function fmtMonthLabel(ym) {
  const y = Number(String(ym).slice(0,4)), m = Number(String(ym).slice(5,7));
  if (!y || !m) return String(ym||'');
  return new Date(y, m-1, 1).toLocaleDateString('en-GB', { month:'long', year:'numeric' });
}

function expPager(pg) {
  const btn = (label, target, o) => {
    o = o || {};
    if (o.disabled) return `<button disabled>${label}</button>`;
    if (o.active)   return `<button class="is-on">${label}</button>`;
    return `<button onclick="gotoPage(expFilter,'expenses',${target})">${label}</button>`;
  };
  const { page, pages } = pg;
  let lo = Math.max(1, page-2), hi = Math.min(pages, lo+4);
  lo = Math.max(1, hi-4);
  let nums = '';
  if (lo > 1) nums += btn('1',1) + (lo>2?'<span class="exp-pager__gap">…</span>':'');
  for (let i=lo;i<=hi;i++) nums += btn(String(i), i, {active:i===page});
  if (hi < pages) nums += (hi<pages-1?'<span class="exp-pager__gap">…</span>':'') + btn(String(pages), pages);

  return `<div class="exp-foot">
    <div class="exp-foot__info">Showing ${pg.from} to ${pg.to} of ${pg.total} record${pg.total!==1?'s':''}</div>
    <div class="exp-pager">
      ${btn('«',1,{disabled:page<=1})}
      ${btn('‹',page-1,{disabled:page<=1})}
      ${nums}
      ${btn('›',page+1,{disabled:page>=pages})}
      ${btn('»',pages,{disabled:page>=pages})}
    </div>
    <div class="exp-foot__size">
      <select onchange="expFilter.pageSize=Number(this.value);expFilter.page=1;renderPage('expenses')" title="Rows per page">
        ${[12,25,50,100].map(n=>`<option value="${n}" ${expFilter.pageSize===n?'selected':''}>${n} / page</option>`).join('')}
      </select>
    </div>
  </div>`;
}
function showAddExpenseModal() {
  const catOpts=DB.settings.expenseCategories.map(c=>`<option>${c}</option>`).join('');
  showModal('modal-md','Add Expense',`
    <div class="form-grid">
      <div class="field"><label>Category *</label><select class="form-control" id="f-ecat">${catOpts}</select></div>
      <div class="field"><label>Amount (PKR) *</label><input class="form-control" id="f-eamt" type="number" placeholder="Enter amount"></div>
      <div class="field col-full"><label>Date</label><input class="form-control cdp-trigger" id="f-edate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${today()}"></div>
      <div class="field col-full"><label>Description</label><textarea class="form-control" id="f-edesc" placeholder="Expense details…"></textarea></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitAddExpense()">Add Expense</button>`);
}
async function submitAddExpense() {
  const cat=document.getElementById('f-ecat').value;
  const amount=parseFloat(document.getElementById('f-eamt').value);
  if(!cat||!amount){toast('Fill required fields','error');return;}
  DB.expenses.push({id:'e_'+uid(),category:cat,amount,date:document.getElementById('f-edate').value,description:document.getElementById('f-edesc').value.trim()});
  logActivity('Expense Added', cat+' — PKR '+amount, 'Finance');
  await saveDB(); closeModal(); renderPage('expenses'); toast('Expense recorded','success');
}
function showEditExpenseModal(id) {
  const e=DB.expenses.find(x=>x.id===id); if(!e) return;
  const catOpts=DB.settings.expenseCategories.map(c=>`<option ${e.category===c?'selected':''}>${c}</option>`).join('');
  showModal('modal-sm',`Edit Expense`,`
    <div class="form-grid">
      <div class="field"><label>Category</label><select class="form-control" id="f-ecat">${catOpts}</select></div>
      <div class="field"><label>Amount (PKR)</label><input class="form-control" id="f-eamt" type="number" value="${e.amount}"></div>
      <div class="field col-full"><label>Date</label><input class="form-control cdp-trigger" id="f-edate" type="text" readonly onclick="showCustomDatePicker(this,event)" value="${e.date||''}"></div>
      <div class="field col-full"><label>Description</label><textarea class="form-control" id="f-edesc">${escHtml(e.description||'')}</textarea></div>
    </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEditExpense('${id}')">Save</button>`);
}
async function submitEditExpense(id) {
  const e=DB.expenses.find(x=>x.id===id); if(!e) return;
  e.category=document.getElementById('f-ecat').value;
  e.amount=parseFloat(document.getElementById('f-eamt').value)||e.amount;
  e.date=document.getElementById('f-edate').value;
  e.description=document.getElementById('f-edesc').value.trim();
  logActivity('Expense Updated', e.category+' — PKR '+e.amount, 'Finance');
  await saveDB(); closeModal(); renderPage('expenses'); toast('Expense updated','success');
}
async function deleteExpense(id) {
  showConfirm('Delete expense?','This cannot be undone.',(async ()=>{
    const _del_e=DB.expenses.find(x=>x.id===id);
    DB.expenses=DB.expenses.filter(x=>x.id!==id);
    if(_del_e) logActivity('Expense Deleted', _del_e.category+' — PKR '+_del_e.amount, 'Finance');
    await saveDB(); renderPage('expenses'); toast('Expense deleted','info');
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// CLEAR DATA FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════
function showClearAllMenu() {
  if (typeof requirePerm === 'function' && !requirePerm('clearall')) return;
  showModal('modal-md','🗑️ Clear Data',`
    <div style="background:var(--red-dim);border:1px solid rgba(224,82,82,0.35);border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:var(--text2)">
      ⚠️ <strong style="color:var(--red)">Warning:</strong> This action is <strong>permanent and cannot be undone</strong>. Export a backup first!
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="background:linear-gradient(135deg,rgba(224,82,82,0.12),rgba(224,82,82,0.06));border:1px solid rgba(224,82,82,0.4);border-radius:10px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div style="font-weight:800;color:var(--red);font-size:14px">☢️ Clear Everything</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">Removes ALL students, payments, expenses &amp; cancellations</div>
        </div>
        <button class="btn btn-danger btn-sm" style="background:var(--red);color:#fff" onclick="clearAllDataWithPassword()">🔒 CLEAR ALL</button>
      </div>
    </div>
  `,`<button class="btn btn-secondary" onclick="closeModal()">Close</button>`);
}

async function clearPayments(fromMenu=false) {
  const doIt = async ()=>{
    DB.payments=[];
    await saveDB();
    if(fromMenu){closeModal();}
    renderPage(currentPage==='payments'?'payments':currentPage);
    toast('All payment records cleared','info');
  };
  if(fromMenu) {
    showConfirm('Clear All Payments?',`This will permanently delete all ${DB.payments.length} payment records.`,doIt);
  } else {
    showConfirm('Clear All Payments?',`This will permanently delete all ${DB.payments.length} payment records. Cannot be undone!`,doIt);
  }
}

async function clearExpenses(fromMenu=false) {
  const doIt = async ()=>{
    DB.expenses=[];
    await saveDB();
    if(fromMenu){closeModal();}
    renderPage(currentPage==='expenses'?'expenses':currentPage);
    toast('All expense records cleared','info');
  };
  if(fromMenu) {
    showConfirm('Clear All Expenses?',`This will permanently delete all ${DB.expenses.length} expense records.`,doIt);
  } else {
    showConfirm('Clear All Expenses?',`This will permanently delete all ${DB.expenses.length} expense records. Cannot be undone!`,doIt);
  }
}

async function clearStudents(fromMenu=false) {
  const doIt = async ()=>{
    DB.students=[];
    DB.payments=[];
    DB.cancellations=[];
    // FIX: DB.transfers are fund-level financial records, NOT student records.
    // Clearing students must NOT wipe transfer history.
    DB.fines=[];
    DB.checkinlog=[];
    await saveDB();
    if(fromMenu){closeModal();}
    renderPage(currentPage==='students'?'students':currentPage);
    toast('All students and their records cleared','info');
  };
  if(fromMenu) {
    showConfirm('Clear All Students?',`This removes ALL ${DB.students.length} students, their payments, fines, check-in log and cancellations permanently. Funds transfers are preserved.`,doIt);
  } else {
    showConfirm('Clear All Students?',`This removes ALL ${DB.students.length} students, their payments, fines, check-in log and cancellations permanently. Funds transfers are preserved. Cannot be undone!`,doIt);
  }
}

async function clearAllData(fromMenu=false) {
  const doIt = async ()=>{
    DB.students=[];
    DB.payments=[];
    DB.expenses=[];
    DB.cancellations=[];
    DB.transfers=[];
    DB.maintenance=[];
    DB.complaints=[];
    DB.activityLog=[];
    DB.fines=[];
    DB.checkinlog=[];
    DB.notices=[];
    DB.inspections=[];
    DB.billSplits=[];
    await saveDB();
    if(fromMenu){closeModal();}
    navigate('dashboard');
    toast('All data cleared successfully','info');
    renderSidebarCalendar();
  };
  showConfirm('☢️ Clear ALL Data?',
    `This will permanently delete ALL students (${DB.students.length}), payments (${DB.payments.length}), expenses (${DB.expenses.length}) and cancellations. This CANNOT be undone! Make sure you have a backup.`,
    doIt
  );
}

// ── PASSWORD-PROTECTED CLEAR ALL (Fix #11) ───────────────────────────────────
function clearAllDataWithPassword() {
  showModal('modal-sm','🔒 Confirm: Clear All Data',`
    <div style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);border-radius:10px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:6px">⚠️ This action cannot be undone!</div>
      <div style="font-size:12px;color:var(--text3)">All students, payments, expenses and cancellations will be permanently deleted. Enter your warden password to proceed.</div>
    </div>
    <div class="field">
      <label>Warden Password</label>
      <input class="form-control" id="clear-all-pwd" type="password" placeholder="Enter your password…" autocomplete="off">
    </div>
    <div id="clear-pwd-err" style="color:var(--red);font-size:12px;margin-top:6px;display:none">❌ Incorrect password. Try again.</div>
  `,`<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="confirmClearAllWithPassword()">Delete Everything</button>`);
  setTimeout(()=>{ const i=document.getElementById('clear-all-pwd'); if(i) i.focus(); },120);
}
async function confirmClearAllWithPassword() {
  const pwd = document.getElementById('clear-all-pwd')?.value||'';
  const errEl = document.getElementById('clear-pwd-err');
  if (!pwd) {
    if(errEl) errEl.style.display='block';
    const inp = document.getElementById('clear-all-pwd');
    if(inp) { inp.value=''; inp.focus(); }
    return;
  }
  const user = CUR_USER;
  if (!user || !user.pw) {
    if(errEl) { errEl.textContent='❌ No user session found. Please re-login.'; errEl.style.display='block'; }
    return;
  }
  const matches = await verifyPassword(pwd, user.pw);
  if (!matches) {
    if(errEl) errEl.style.display='block';
    const inp = document.getElementById('clear-all-pwd');
    if(inp) { inp.value=''; inp.focus(); }
    return;
  }
  closeModal();
  clearAllData(true);
}
// ─────────────────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
let reportPeriod='month';
let reportDetail=null;
let studentReportFilter='All';
// PERF: pagination state for Reports KPI-card detail tables. Rendering EVERY row
// (all payments/students) into the DOM on each card click was the source of the lag;
// we now slice to PAGE_SIZE like the Students/Payments screens. _lastKey lets us reset
// to page 1 only when the detail type or sub-filter changes (not when paging within one).
let reportDetailFilter={page:1,_lastKey:''};

// ════════════════════════════════════════════════════════════════════════════
// REPORT DETAIL RENDERERS
// ════════════════════════════════════════════════════════════════════════════