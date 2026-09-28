/* ─── HOSTYLLO — OWNER FUNDS PAGE (step 3) ───────────────────────────────────

   The screen for renderer/src/owner-funds.js, which holds every rule; this
   file only draws and collects. Reached from the sidebar's Finance group, and
   only where BOTH gates are open (ofAllowed): the hostel has the feature
   switched on from the control plane, and the account has the "Owner funds"
   permission.

   ── WHAT THE PAGE SAYS, TOP TO BOTTOM ───────────────────────────────────────

     four tiles       Owner gave · Owner took · Net owner funding · Movements
     the statement    revenue − expenses = profit / loss (unchanged), then
                      + owner gave − owner took = hostel money after owner.
                      For "All months" there is no profit/loss to state (the
                      app has no all-time revenue), so only the owner lines are.
     by reason        what each category added up to, both directions
     the register     every movement in the period, newest first; reversed
                      ones only when asked, struck through with their reason

   Nothing here writes to a payment or an expense, and nothing reads one except
   through ofStatement(), which reads calcRevenue()/calcExpenses() — the same
   figures every other screen shows.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

let ofFilter = { period: thisMonth(), dir: 'All', search: '', showReversed: false };
registerFilter('ownerfunds', ofFilter, () => ({
  period: thisMonth(), dir: 'All', search: '', showReversed: false,
}));

function ofSet(k, v) { ofFilter[k] = v; renderPage('ownerfunds'); }

/* The rows the register shows: period, direction, search, reversed. */
function ofFiltered() {
  const q = String(ofFilter.search || '').trim().toLowerCase();
  return ofListFor(ofFilter.period, { withReversed: ofFilter.showReversed }).filter(r => {
    if (ofFilter.dir !== 'All' && r.direction !== ofFilter.dir) return false;
    if (!q) return true;
    return [ofCategoryLabel(r.category), r.method, r.refNo, r.note, r.createdByName,
            String(r.amount), r.reversed && r.reversed.reason]
      .some(v => String(v || '').toLowerCase().includes(q));
  });
}

function _ofPeriodLabel(key) {
  if (!key) return 'All months';
  if (/^\d{4}$/.test(key)) return 'The whole of ' + key;
  return monthLabel(key) || key;
}
function _ofSigned(n) {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + fmtPKR(Math.abs(n));
}
function _ofDirChip(dir) {
  return dir === OF_IN
    ? `<span class="ui-chip ui-chip--success of-dir">${icon('arrowDownCircle','xs')} Gave</span>`
    : `<span class="ui-chip ui-chip--warning of-dir">${icon('upload','xs')} Took</span>`;
}

function renderOwnerFunds() {
  if (!ofAllowed()) {
    return `<div class="ui-empty"><div class="ui-empty__t">Not available</div>
      <div>Owner Funds is not switched on for this hostel, or your account does not have the Owner funds permission.</div></div>`;
  }
  const key  = ofFilter.period;
  const st   = ofStatement(key);
  const rows = ofFiltered();
  const allKeys = (DB.ownerFunds || []).map(r => r.date);

  const tile = (label, value, sub, ico, onclick, on) => {
    const tag = onclick ? 'button' : 'div';
    return `<${tag} ${onclick ? 'type="button" ' : ''}class="ui-card ui-stat${onclick ? ' ui-stat--click' : ''}${on ? ' is-on' : ''}"${onclick ? ` onclick="${onclick}" aria-pressed="${on ? 'true' : 'false'}"` : ''}>
      <span class="ui-stat__ico">${icon(ico,'sm')}</span>
      <span class="ui-stat__body">
        <span class="ui-stat__l">${label}</span>
        <span class="ui-stat__v">${value}</span>
        <span class="ui-stat__s">${sub}</span>
      </span>
    </${tag}>`;
  };

  const line = (label, value, cls) =>
    `<div class="of-st__row${cls ? ' ' + cls : ''}"><span>${label}</span><b>${value}</b></div>`;
  const tone = n => n == null ? '' : n < 0 ? ' is-neg' : ' is-pos';

  const statement = `
    <div class="ui-card of-st">
      <div class="of-st__h">
        <div class="of-st__t">Statement</div>
        <div class="of-st__s">${escHtml(_ofPeriodLabel(key))}</div>
      </div>
      ${st.result != null ? `
        ${line('Revenue', fmtPKR(st.revenue))}
        ${line('Expenses', '−' + fmtPKR(st.expenses))}
        ${line('Profit / Loss', _ofSigned(st.result), 'is-total' + tone(st.result))}
        <div class="of-st__gap"></div>` : `
        <div class="of-st__note">${icon('info','xs')} Profit and loss is stated for a month or a year. Pick one to see it here.</div>`}
      ${line('Owner gave to hostel', '+' + fmtPKR(st.ownerIn), 'is-in')}
      ${line('Owner took from hostel', '−' + fmtPKR(st.ownerOut), 'is-out')}
      ${st.afterOwner != null
        ? line('Hostel money after owner', _ofSigned(st.afterOwner), 'is-total' + tone(st.afterOwner))
        : line('Net owner funding', _ofSigned(st.ownerNet), 'is-total' + tone(st.ownerNet))}
      <div class="of-st__foot">Owner money is shown beside profit and loss, never inside it — it is not revenue and not an expense.</div>
    </div>`;

  const byReason = dir => {
    const cats = OF_CATEGORIES[dir];
    const total = dir === OF_IN ? st.ownerIn : st.ownerOut;
    const items = cats.map(c => ({ c, v: st.byCategory[c.key] || 0 })).filter(x => x.v > 0);
    return `<div class="of-br">
      <div class="of-br__h">${dir === OF_IN ? 'Owner gave' : 'Owner took'}<span>${fmtPKR(total)}</span></div>
      ${items.length ? items.map(x => `
        <div class="of-br__row">
          <span class="of-br__n">${escHtml(x.c.label)}</span>
          <span class="of-br__bar"><i class="${dir === OF_IN ? 'is-in' : 'is-out'}" style="width:${total ? Math.round(x.v / total * 100) : 0}%"></i></span>
          <span class="of-br__v">${fmtPKR(x.v)}</span>
        </div>`).join('') : '<div class="of-br__none">Nothing in this period</div>'}
    </div>`;
  };

  const row = r => {
    const dead = !!r.reversed;
    const who = r.createdByName ? escHtml(typeof ledgerFirstName === 'function' ? ledgerFirstName(r.createdByName) : r.createdByName) : '—';
    return `<tr class="${dead ? 'is-reversed' : ''}" onclick="showOwnerFundDetail('${escHtml(r.id)}')" title="Open this movement">
      <td class="of-c-date">${escHtml(fmtDate(r.date))}</td>
      <td>${_ofDirChip(r.direction)}</td>
      <td class="of-c-reason">${escHtml(ofCategoryLabel(r.category))}${dead ? ` <span class="ui-chip ui-chip--danger of-rev" data-tip="${escHtml(r.reversed.reason)}" data-tip-label="Reversed">Reversed</span>` : ''}</td>
      <td class="of-c-method">${escHtml(r.method || '—')}</td>
      <td class="of-c-ref">${r.refNo ? escHtml(r.refNo) : '<span class="of-dash">—</span>'}</td>
      <td class="of-c-note">${r.note ? `<span data-tip="${escHtml(r.note)}" data-tip-label="Note">${escHtml(r.note)}</span>` : '<span class="of-dash">—</span>'}</td>
      <td class="of-c-amt ${r.direction === OF_IN ? 'is-in' : 'is-out'}">${r.direction === OF_IN ? '+' : '−'}${fmtPKR(r.amount)}</td>
      <td>${who}</td>
      <td class="of-c-act" onclick="event.stopPropagation()">
        ${!dead ? `<button type="button" class="ui-btn ui-btn--secondary ui-btn--sm ui-btn--icon" onclick="showReverseOwnerFund('${escHtml(r.id)}')" title="Reverse this movement" aria-label="Reverse this movement">${icon('refreshCw','xs')}</button>` : ''}
      </td>
    </tr>`;
  };

  return `
  <div class="ui-stats">
    ${tile('Owner gave', fmtPKR(st.ownerIn), 'To the hostel', 'arrowDownCircle',
           `ofSet('dir','${ofFilter.dir === OF_IN ? 'All' : OF_IN}')`, ofFilter.dir === OF_IN)}
    ${tile('Owner took', fmtPKR(st.ownerOut), 'From the hostel', 'upload',
           `ofSet('dir','${ofFilter.dir === OF_OUT ? 'All' : OF_OUT}')`, ofFilter.dir === OF_OUT)}
    ${tile('Net owner funding', _ofSigned(st.ownerNet), st.ownerNet >= 0 ? 'Owner has put in more' : 'Owner has taken more', 'wallet')}
    ${tile('Movements', String(st.count), st.reversed ? st.reversed + ' reversed, not counted' : 'In this period', 'list')}
  </div>

  <div class="of-top">
    ${statement}
    <div class="ui-card of-reasons">
      <div class="of-st__h"><div class="of-st__t">By reason</div><div class="of-st__s">${escHtml(_ofPeriodLabel(key))}</div></div>
      ${byReason(OF_IN)}
      ${byReason(OF_OUT)}
    </div>
  </div>

  <div class="ui-card ui-card--flush">
    <div class="of-tools">
      <div class="ui-search">
        ${icon('search','xs')}
        <input id="of-search" class="ui-search__i" aria-label="Search owner funds"
               placeholder="Search reason, method, reference, note…"
               value="${escHtml(ofFilter.search)}" oninput="ofFilter.search=this.value;_dOwnerFunds()">
      </div>
      <span class="ui-selectw"><select class="ui-select ui-select--sm${ofFilter.dir !== 'All' ? ' is-set' : ''}" aria-label="Direction" onchange="ofSet('dir',this.value)">
        <option value="All">Both directions</option>
        <option value="${OF_IN}" ${ofFilter.dir === OF_IN ? 'selected' : ''}>Owner gave</option>
        <option value="${OF_OUT}" ${ofFilter.dir === OF_OUT ? 'selected' : ''}>Owner took</option>
      </select></span>
      ${tbMonth(allKeys, { value: key, all: true, aria: 'Period', onchange: "ofSet('period',this.value)" })}
      <label class="of-tog"><input type="checkbox" ${ofFilter.showReversed ? 'checked' : ''} onchange="ofSet('showReversed',this.checked)"> Show reversed</label>
      ${tbExport({ id: 'of-export', cls: 'ui-btn ui-btn--secondary ui-btn--sm',
                   excel: 'exportOwnerFundsExcel()', pdf: 'exportOwnerFundsPDF()' })}
      <span class="of-tools__n">${rows.length} ${rows.length === 1 ? 'movement' : 'movements'}</span>
    </div>
    ${rows.length ? `
    <div class="ui-table-wrap">
      <table class="ui-table of-table">
        <thead><tr>
          <th>Date</th><th>Direction</th><th>Reason</th><th>Method</th><th>Reference</th>
          <th>Note</th><th class="of-c-amt">Amount</th><th>Recorded by</th><th></th>
        </tr></thead>
        <tbody>${rows.map(row).join('')}</tbody>
      </table>
    </div>` : `
    <div class="ui-empty">
      ${icon('wallet')}
      <div class="ui-empty__t">${(DB.ownerFunds || []).length ? 'Nothing in this period' : 'No owner fund movements yet'}</div>
      <div>${(DB.ownerFunds || []).length ? 'Try another month, All months, or clear the search.' : 'Money the owner gives to the hostel, or takes from it, is recorded here.'}</div>
      <button class="ui-btn ui-btn--secondary ui-btn--sm" onclick="showOwnerFundModal()">${icon('plus','xs')} Record movement</button>
    </div>`}
  </div>`;
}

const _dOwnerFunds = debounce(() => {
  const el = document.getElementById('content');
  if (!el || currentPage !== 'ownerfunds') return;
  el.innerHTML = renderOwnerFunds();
  const inp = document.getElementById('of-search');
  if (inp) { inp.focus(); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch (_) {} }
});

/* ══ EXPORT COLUMNS ════════════════════════════════════════════════════════
   One definition for every document that lists movements — the Reports tab,
   the whole-period report, and (step 5) this page's own export — so no two of
   them can describe a movement differently. Amount is SIGNED (owner took is
   negative) so the column sums to the net owner funding in a workbook. */
function ofExportColumns() {
  return [
    { label: 'Date',        type: 'date',  width: 12, value: r => r.date || '' },
    { label: 'Direction',   type: 'text',  width: 13, value: r => r.direction === OF_IN ? 'Owner gave' : 'Owner took' },
    { label: 'Reason',      type: 'text',  width: 20, value: r => ofCategoryLabel(r.category) },
    { label: 'Method',      type: 'text',  width: 13, value: r => r.method || '' },
    { label: 'Reference',   type: 'text',  width: 14, value: r => r.refNo || '' },
    { label: 'Note',        type: 'wrap',  width: 28, value: r => r.note || '' },
    { label: 'Recorded by', type: 'text',  width: 14, value: r => r.createdByName || '' },
    { label: 'Amount',      type: 'money', width: 15, total: 'sum',
      value: r => r.direction === OF_IN ? Number(r.amount || 0) : -Number(r.amount || 0),
      get:   r => r.direction === OF_IN
               ? '<span class="pos">+' + fmtPKR(r.amount) + '</span>'
               : '<span class="neg">-' + fmtPKR(r.amount) + '</span>' },
  ];
}

/* ══ THIS PAGE'S EXPORT (step 5) ══════════════════════════════════════════
   The list as filtered on screen, with the page's own statement as the
   summary. Reversed movements are left out even when "Show reversed" is on:
   they do not count, and a signed Amount column that included them would sum
   to a figure the statement does not state. The filter line says so. */
function _ofExportDef() {
  const key  = ofFilter.period;
  const st   = ofStatement(key);
  const rows = ofFiltered().filter(ofIsLive);
  const net  = rows.reduce((s, r) => s + (r.direction === OF_IN ? 1 : -1) * Number(r.amount || 0), 0);
  const summary = [];
  if (st.result != null) {
    summary.push({ label: 'Revenue',  value: EXPORT.fmt.money(st.revenue), tone: 'pos' });
    summary.push({ label: 'Expenses', value: EXPORT.fmt.money(st.expenses), tone: 'neg' });
    summary.push({ label: 'Profit / loss', value: EXPORT.fmt.money(st.result), tone: st.result >= 0 ? 'pos' : 'neg' });
  }
  summary.push({ label: 'Owner gave', value: EXPORT.fmt.money(st.ownerIn), tone: 'pos' });
  summary.push({ label: 'Owner took', value: EXPORT.fmt.money(st.ownerOut), tone: st.ownerOut > 0 ? 'neg' : '' });
  summary.push(st.afterOwner != null
    ? { label: 'After owner', value: EXPORT.fmt.money(st.afterOwner), tone: st.afterOwner >= 0 ? 'pos' : 'neg' }
    : { label: 'Net owner funding', value: EXPORT.fmt.money(st.ownerNet), tone: st.ownerNet >= 0 ? 'pos' : 'neg' });
  const period = _ofPeriodLabel(key);
  return {
    module: 'Owner Funds',
    title:  'Owner Funds',
    scope:  period,
    sheet:  'Owner Funds',
    filters: [
      ['Period',    period],
      ['Direction', ofFilter.dir === OF_IN ? 'Owner gave' : ofFilter.dir === OF_OUT ? 'Owner took' : null],
      ['Search',    ofFilter.search || null],
      ['Reversed',  ofFilter.showReversed ? 'Not included — reversed movements do not count' : null],
    ],
    summary,
    columns: ofExportColumns(),
    rows,
    grand: { label: 'Net owner funding', value: fmtPKR(net) },
    empty: 'No owner fund movements match the selected filters.',
  };
}
function exportOwnerFundsExcel() {
  if (!ofAllowed()) return;
  const def = _ofExportDef();
  if (!def.rows.length) { toast('No owner fund movements to export', 'error'); return; }
  EXPORT.excel(def);
}
function exportOwnerFundsPDF() {
  if (!ofAllowed()) return;
  const def = _ofExportDef();
  if (!def.rows.length) { toast('No owner fund movements to export', 'error'); return; }
  EXPORT.pdf(def);
}

/* ══ RECORD A MOVEMENT ════════════════════════════════════════════════════ */

let _ofProof = null;

function _ofCatOptions(dir, pick) {
  return OF_CATEGORIES[dir].map(c =>
    `<option value="${c.key}" ${c.key === pick ? 'selected' : ''}>${escHtml(c.label)}</option>`).join('');
}
function ofFormDir(dir) {
  const sel = document.getElementById('of-cat');
  if (sel) sel.innerHTML = _ofCatOptions(dir, OF_CATEGORIES[dir][0].key);
  document.querySelectorAll('.of-dirc').forEach(el => el.classList.toggle('is-on', el.dataset.dir === dir));
  const who = document.getElementById('of-who-l');
  if (who) who.textContent = dir === OF_IN ? 'Given by' : 'Taken by';
}

function _ofProofPanel() {
  if (!_ofProof) {
    return `<div class="exf-rcpt">
      <span class="exf-rcpt__i">${icon('clipboard','sm')}</span>
      <div class="exf-rcpt__b">
        <div class="exf-rcpt__t">Attach proof <span>(optional)</span></div>
        <div class="exf-rcpt__s">A bank slip, a transfer screenshot or a signed note. Images are scaled down before they are stored.</div>
      </div>
      <button type="button" class="set-btn" onclick="document.getElementById('of-proof-file').click()">${icon('upload','xs')} Choose file</button>
    </div>`;
  }
  const isImg = String(_ofProof.type || '').indexOf('image/') === 0;
  return `<div class="exf-rcpt is-set">
    <span class="exf-rcpt__i">${icon('clipboard','sm')}</span>
    <div class="exf-rcpt__b">
      <div class="exf-rcpt__t">Attached proof</div>
      <div class="exf-rcpt__n">${escHtml(_ofProof.name || 'proof')}</div>
      <div class="exf-rcpt__s">${Math.max(1, Math.round((_ofProof.size || 0) / 1024))} KB &middot; ${isImg ? 'Image' : 'PDF'}</div>
    </div>
    <button type="button" class="set-btn" onclick="_expReceiptShow(_ofProof)">${icon('eye','xs')} View</button>
    <button type="button" class="set-btn set-btn--danger" onclick="_ofProof=null;_ofRepaintProof()">${icon('trash','xs')} Remove</button>
  </div>`;
}
function _ofRepaintProof() {
  const host = document.getElementById('of-proof');
  if (host) host.innerHTML = _ofProofPanel();
}
function ofProofLoad(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  input.value = '';
  expReadReceiptFile(file, rec => { _ofProof = rec; _ofRepaintProof(); });
}

function showOwnerFundModal(dir) {
  if (!ofAllowed()) { if (typeof requireFeature === 'function' && !requireFeature('ownerFunds')) return; requirePerm('ownerFunds'); return; }
  _ofProof = null;
  const d = dir === OF_OUT ? OF_OUT : OF_IN;
  const methods = (DB.settings.paymentMethods || ['Cash', 'Bank Transfer', 'EasyPaisa', 'JazzCash', 'Cheque']);
  const card = (value, title, sub, ico) => `
    <button type="button" class="of-dirc${value === d ? ' is-on' : ''}" data-dir="${value}" onclick="ofFormDir('${value}')">
      <span class="of-dirc__i">${icon(ico,'sm')}</span>
      <span class="of-dirc__b"><span class="of-dirc__t">${title}</span><span class="of-dirc__s">${sub}</span></span>
    </button>`;

  showModal('modal-form',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('wallet','sm')}</div>
       <div><div class="hf-mh__t">Record fund movement</div>
       <div class="hf-mh__s">Money between the owner and the hostel. It is not revenue and not an expense.</div></div>
     </div>`,
    `<div class="of-dirs" role="radiogroup" aria-label="Who provided the money">
       ${card(OF_IN,  'Owner gave money to the hostel', 'The hostel was short, had no budget, or the owner invested', 'arrowDownCircle')}
       ${card(OF_OUT, 'Owner took money from the hostel', 'Pocket money, his own investment or his own bill', 'upload')}
     </div>
     <div class="hf-g2">
       ${_expField('Amount (PKR)', 'money',
         `<input class="form-control" id="of-amt" type="number" min="1" step="1" placeholder="Enter amount">`, { req: true, for: 'of-amt' })}
       ${_expField('Date', 'calendar',
         `<input class="form-control cdp-trigger" id="of-date" type="text" readonly
                 onclick="showCustomDatePicker(this,event)" value="${escHtml(today())}">`, { req: true, for: 'of-date' })}
       ${_expField('Reason', 'tag',
         `<select class="form-control" id="of-cat">${_ofCatOptions(d, OF_CATEGORIES[d][0].key)}</select>`, { req: true, for: 'of-cat' })}
       ${_expField('Payment method', 'card',
         `<select class="form-control" id="of-method">${methods.map(m =>
            `<option value="${escHtml(m)}" ${m === 'Cash' ? 'selected' : ''}>${escHtml(m)}</option>`).join('')}</select>`,
         { for: 'of-method' })}
       ${_expField('Reference no.', 'receipt',
         `<input class="form-control" id="of-ref" type="text" maxlength="40" autocomplete="off"
                 placeholder="Bank or wallet transaction ID, cheque number…">`,
         { full: true, for: 'of-ref', note: 'Optional. So this entry can be matched to the bank or wallet record.' })}
       ${_expField('Note', 'fileText',
         `<textarea class="form-control" id="of-note" rows="2" maxlength="250"
                    placeholder="e.g. Electricity and salaries were due and the hostel had no cash"></textarea>`,
         { full: true, top: true, for: 'of-note' })}
     </div>
     <div id="of-proof">${_ofProofPanel()}</div>
     <input type="file" id="of-proof-file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onchange="ofProofLoad(this)">`,
    `<div class="hf-actions">
       <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="submitOwnerFund()">${icon('save','xs')} Record movement</button>
     </div>`);
}

/* One press, one save (submitOnce, utils.js — bug audit BUG-006). */
async function submitOwnerFund(...a) { return submitOnce('ownerfund:add', () => _submitOwnerFund(...a)); }
async function _submitOwnerFund() {
  if (typeof requireWritable === 'function' && !requireWritable('An owner fund movement')) return;
  const on = document.querySelector('.of-dirc.is-on');
  const input = {
    direction: on ? on.dataset.dir : null,
    amount:    document.getElementById('of-amt')?.value,
    date:      document.getElementById('of-date')?.value,
    category:  document.getElementById('of-cat')?.value,
    method:    document.getElementById('of-method')?.value,
    refNo:     document.getElementById('of-ref')?.value,
    note:      document.getElementById('of-note')?.value,
    receipt:   _ofProof,
  };
  const check = ofValidate(input);
  if (!check.ok) {
    toast(check.reason, 'error');
    const focus = { amount: 'of-amt', date: 'of-date', category: 'of-cat', note: 'of-note' }[check.field];
    if (focus) document.getElementById(focus)?.focus();
    return;
  }
  // Money moving is confirmed with the PIN, like a collection (pin.js).
  if (typeof pinNeeded === 'function' && pinNeeded()
      && !(await pinConfirm({ what: 'recording ' + fmtPKR(check.value.amount) }))) return;
  const r = ofAdd(input);
  if (!r.ok) { toast(r.reason, 'error'); return; }
  _ofProof = null;
  await saveDB();
  closeModal();
  renderPage('ownerfunds');
  toast(ofDirectionLabel(r.record.direction) + ' — ' + fmtPKR(r.record.amount) + ' recorded', 'success');
}

/* ══ ONE MOVEMENT ═════════════════════════════════════════════════════════ */

function showOwnerFundDetail(id) {
  const r = ofFind(id);
  if (!r) return;
  const f = (label, value) => `<div class="of-dt__r"><span>${label}</span><b>${value}</b></div>`;
  const rev = r.reversed;
  showModal('modal-md',
    `<div class="hf-mh">
       <div class="hf-mh__ico">${icon('wallet','sm')}</div>
       <div><div class="hf-mh__t">${escHtml(ofDirectionLabel(r.direction))}</div>
       <div class="hf-mh__s">${escHtml(fmtDate(r.date))} · ${escHtml(ofCategoryLabel(r.category))}</div></div>
     </div>`,
    `<div class="of-dt">
       <div class="of-dt__amt ${r.direction === OF_IN ? 'is-in' : 'is-out'}${rev ? ' is-reversed' : ''}">${r.direction === OF_IN ? '+' : '−'}${fmtPKR(r.amount)}</div>
       ${rev ? `<div class="of-dt__rev">${icon('info','xs')} <span><b>Reversed</b> on ${escHtml(fmtDate(rev.date))}${rev.byName ? ' by ' + escHtml(rev.byName) : ''} — ${escHtml(rev.reason)}. It no longer counts in any total.</span></div>` : ''}
       ${f('Direction', escHtml(ofDirectionLabel(r.direction)))}
       ${f('Reason', escHtml(ofCategoryLabel(r.category)))}
       ${f('Method', escHtml(r.method || '—'))}
       ${f('Reference no.', r.refNo ? escHtml(r.refNo) : '—')}
       ${f('Note', r.note ? escHtml(r.note) : '—')}
       ${f('Recorded by', escHtml(r.createdByName || '—'))}
       ${f('Recorded on', r.createdAt ? escHtml(fmtDate(String(r.createdAt).slice(0, 10))) : '—')}
       ${f('Proof', r.receipt ? `<button type="button" class="set-btn" onclick="_expReceiptShow(ofFind('${escHtml(r.id)}').receipt)">${icon('eye','xs')} View</button>` : '—')}
     </div>`,
    `<div class="hf-actions">
       <button class="btn btn-secondary" onclick="closeModal()">Close</button>
       ${!rev && ofAllowed() ? `<span class="hf-actions__spacer"></span>
         <button class="btn btn-danger" onclick="showReverseOwnerFund('${escHtml(r.id)}')">Reverse…</button>` : ''}
     </div>`);
}

/* ══ REVERSE ══════════════════════════════════════════════════════════════
   Never delete: the record stays, marked reversed with who, when and why, and
   stops counting in the month it was dated in (owner-funds.js, ofReverse). */
function showReverseOwnerFund(id) {
  const r = ofFind(id);
  if (!r || r.reversed) return;
  if (!ofAllowed()) { requirePerm('ownerFunds'); return; }
  showModal('modal-sm', 'Reverse this movement?',
    `<div class="of-revm">
       <div class="of-revm__who"><b>${escHtml(ofDirectionLabel(r.direction))}</b>
         <span>${escHtml(fmtDate(r.date))} · ${escHtml(ofCategoryLabel(r.category))} · ${fmtPKR(r.amount)}</span></div>
       <div class="of-revm__note">For a movement recorded by mistake. It stays on the list, marked reversed with your reason, and stops counting in ${escHtml(monthLabel(String(r.date).slice(0, 7)) || 'its month')}.</div>
       <div class="field">
         <label for="of-rev-reason">Reason <span class="req">*</span></label>
         <input class="form-control" id="of-rev-reason" type="text" maxlength="250" placeholder="e.g. Entered twice, wrong amount">
       </div>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="submitReverseOwnerFund('${escHtml(r.id)}')">Reverse</button>`);
  setTimeout(() => document.getElementById('of-rev-reason')?.focus(), 30);
}

/* One press, one save (submitOnce, utils.js — bug audit BUG-006). */
async function submitReverseOwnerFund(...a) { return submitOnce('ownerfund:reverse:' + a[0], () => _submitReverseOwnerFund(...a)); }
async function _submitReverseOwnerFund(id) {
  if (typeof requireWritable === 'function' && !requireWritable('Reversing an owner fund movement')) return;
  const reason = (document.getElementById('of-rev-reason')?.value || '').trim();
  if (!reason) { toast('Give a reason for the reversal', 'error'); document.getElementById('of-rev-reason')?.focus(); return; }
  if (typeof pinNeeded === 'function' && pinNeeded()
      && !(await pinConfirm({ what: 'reversing an owner fund movement' }))) return;
  const r = ofReverse(id, { reason });
  if (!r.ok) { toast(r.reason, 'error'); return; }
  await saveDB();
  closeModal();
  renderPage('ownerfunds');
  toast('Movement reversed — it no longer counts', 'success');
}
