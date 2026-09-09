/* ════════════════════════════════════════════════════════════════════════════
   ACTIVITY LOG — rebuilt 2026-09-08 to `audit logs.png` and `activity logs.png`.

   WHAT THE LOG ACTUALLY HOLDS. `logActivity()` (storage.js) writes one row per
   action: `{ id, action, details, category, by, date, time }`, newest first,
   trimmed to the last 200. That is the whole record. Everything on this page is
   computed from those six fields — the counters, the daily trend, the split by
   type, the busiest users and the table.

   THE TWO COLUMNS THE REFERENCE DRAWS THAT NOTHING CAN FILL, per the owner's
   rule of 2026-09-08, are DRAWN AND LOCKED rather than dropped:

     · IP ADDRESS. This is a desktop application with no server and no network
       (`connect-src 'self'`). There is one machine, it is the one you are
       sitting at, and an address column would either be blank or invented.
     · STATUS. A row is written AFTER the action succeeded, so every row would
       say Success — a column with one value in it is decoration. What a real
       audit trail would add is the failures, and those are not recorded.

   LOGIN EVENTS are the third: the reference counts them and this app does not
   record them. The counter is drawn, reads zero, and says so. Adding it is one
   line in the sign-in path and it is deliberately not being slipped into a
   redesign — see the note on the tile.

   ACTION TYPE IS DERIVED, AND ONLY FROM THE APP'S OWN VERBS. Every action
   string this app logs ends in one: Added, Collected, Updated, Deleted,
   Removed, Reversed, Changed… `alType()` maps those verbs and nothing else; an
   action it does not recognise is "Other", never guessed into a bucket.
   ════════════════════════════════════════════════════════════════════════════ */

const AL_PAGE_SIZE = 12;

let alFilters = { q: '', user: 'All', type: 'All', module: 'All', from: '', to: '' };
let alPage = 1;
let alSelected = null;

/* The four kinds of change, read off the verb the app itself logged. */
const AL_TYPES = {
  Created: { hue: 'dh-green',  ico: 'plus',      test: /\b(Added|Collected|Generated|Completed|Import|Created|Saved|Split)\b/i },
  Updated: { hue: 'dh-blue',   ico: 'edit',      test: /\b(Updated|Changed|Synced|Renamed|Reset|Inspected|Update)\b/i },
  Deleted: { hue: 'dh-red',    ico: 'trash',     test: /\b(Deleted|Removed|Reversed|Rejected|Cancelled)\b/i },
  Other:   { hue: 'dh-slate',  ico: 'info',      test: null },
};

function alType(entry) {
  const a = String((entry && entry.action) || '');
  for (const k of ['Deleted', 'Updated', 'Created']) {
    if (AL_TYPES[k].test.test(a)) return k;
  }
  return 'Other';
}

function alAll() { return Array.isArray(DB.activityLog) ? DB.activityLog : []; }

/** The filtered set, in the order the log keeps (newest first). */
function alRows() {
  const f = alFilters;
  const q = f.q.trim().toLowerCase();
  return alAll().filter(e => {
    if (f.user !== 'All' && (e.by || '—') !== f.user) return false;
    if (f.module !== 'All' && (e.category || 'General') !== f.module) return false;
    if (f.type !== 'All' && alType(e) !== f.type) return false;
    if (f.from && (e.date || '') < f.from) return false;
    if (f.to && (e.date || '') > f.to) return false;
    if (q) {
      const hay = [(e.action || ''), (e.details || ''), (e.by || ''), (e.category || '')].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function alUsers() {
  const seen = new Map();
  for (const e of alAll()) {
    const k = e.by || '—';
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]);
}

function alModules() {
  return [...new Set(alAll().map(e => e.category || 'General'))].sort();
}

/* Month over month, from the dates on the rows themselves. The reference shows
   "+12% vs Aug"; this shows the same comparison and names the month it is
   comparing against, because a percentage with no baseline named is a number
   nobody can check. */
function alMonthSplit() {
  const now = new Date();
  const thisKey = ymd(now).slice(0, 7);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = ymd(prev).slice(0, 7);
  const inMonth = k => alAll().filter(e => (e.date || '').slice(0, 7) === k);
  return {
    thisKey, prevKey,
    prevLabel: prev.toLocaleDateString('en-IN', { month: 'short' }),
    cur: inMonth(thisKey), prv: inMonth(prevKey),
  };
}

function alDelta(cur, prv) {
  if (!prv) return null;                     // no baseline — say nothing
  return Math.round((cur - prv) / prv * 100);
}

function renderActivityLog() {
  const all = alAll();
  const rows = alRows();
  const m = alMonthSplit();

  const counts = { Created: 0, Updated: 0, Deleted: 0, Other: 0 };
  for (const e of all) counts[alType(e)]++;
  const changes = counts.Created + counts.Updated + counts.Deleted;
  const curChanges = m.cur.filter(e => alType(e) !== 'Other').length;
  const prvChanges = m.prv.filter(e => alType(e) !== 'Other').length;

  const users = alUsers();

  const kpi = (ico, hue, label, value, sub, lock) => `
    <div class="al-kpi ${hue}${lock ? ' is-locked' : ''}">
      <div class="al-kpi__i">${icon(ico, 'md')}</div>
      <div style="min-width:0">
        <div class="al-kpi__l">${escHtml(label)}${lock ? ` <span class="al-lock" title="${escHtml(lock)}">${icon('lock', 'xs')}</span>` : ''}</div>
        <div class="al-kpi__v">${escHtml(String(value))}</div>
        <div class="al-kpi__s">${sub}</div>
      </div>
    </div>`;

  const delta = (cur, prv) => {
    const d = alDelta(cur, prv);
    if (d === null) return `<span class="al-flat">no ${escHtml(m.prevLabel)} to compare</span>`;
    return `<span class="al-delta ${d >= 0 ? 'is-up' : 'is-down'}">${icon(d >= 0 ? 'trendUp' : 'trendDown', 'xs')}${Math.abs(d)}% vs ${escHtml(m.prevLabel)}</span>`;
  };

  return `
  <div class="bk-head">
    <div class="set-head__ico dh-blue">${icon('list', 'md')}</div>
    <div class="set-head__mid">
      <div class="bk-head__t">Activity Log</div>
      <div class="bk-head__s">Who did what, when — every action this app recorded, newest first.</div>
    </div>
    <div class="al-head__acts">
      <button class="set-btn" onclick="alExport('excel')">${icon('fileSpreadsheet', 'xs')}Export Excel</button>
      <button class="set-btn" onclick="alExport('pdf')">${icon('print', 'xs')}Export PDF</button>
      <button class="set-btn set-btn--danger" onclick="alClear()">${icon('trash', 'xs')}Clear log</button>
    </div>
  </div>

  <div class="al-kpis">
    ${kpi('list', 'dh-blue', 'Total activities', all.length,
      `<span class="al-flat">last ${all.length ? Math.min(200, all.length) : 200} kept</span>`)}
    ${kpi('edit', 'dh-violet', 'Data changes', changes, delta(curChanges, prvChanges))}
    ${kpi('users', 'dh-green', 'People active', users.length,
      `<span class="al-flat">${users.length ? escHtml(users[0][0]) + ' busiest' : 'nobody yet'}</span>`)}
    ${kpi('lock', 'dh-slate', 'Login events', 0,
      `<span class="al-flat">not recorded</span>`,
      'Signing in and out is not written to this log. Adding it is one line in the sign-in path, and it is not being slipped in under a redesign — ask for it and it is a five-minute change.')}
  </div>

  <div class="al-charts">
    <div class="set-card al-trend">
      <div class="hi-id__head"><div class="hi-id__ttl">${icon('chart', 'sm')}Activity trend</div>
        <span class="al-sub">last 14 days</span></div>
      ${alTrend()}
    </div>
    <div class="set-card">
      <div class="hi-id__head"><div class="hi-id__ttl">${icon('pieChart', 'sm')}By type</div></div>
      ${alTypeDonut(counts, all.length)}
    </div>
    <div class="set-card">
      <div class="hi-id__head"><div class="hi-id__ttl">${icon('users', 'sm')}Top users</div></div>
      ${alTopUsers(users)}
    </div>
  </div>

  <div class="set-card al-table-card">
    <div class="al-filters">
      <div class="al-search">
        ${icon('search', 'xs')}
        <input class="form-control" id="al-q" placeholder="Search by user, action or details…"
               value="${escHtml(alFilters.q)}" oninput="alSet('q',this.value)">
      </div>
      <select class="set-sel" onchange="alSet('user',this.value)">
        <option value="All">All users</option>
        ${alUsers().map(([u]) => `<option ${alFilters.user === u ? 'selected' : ''}>${escHtml(u)}</option>`).join('')}
      </select>
      <select class="set-sel" onchange="alSet('type',this.value)">
        <option value="All">All actions</option>
        ${Object.keys(AL_TYPES).map(t => `<option ${alFilters.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <select class="set-sel" onchange="alSet('module',this.value)">
        <option value="All">All modules</option>
        ${alModules().map(c => `<option ${alFilters.module === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}
      </select>
      <input type="date" class="set-sel" value="${escHtml(alFilters.from)}" onchange="alSet('from',this.value)" title="From">
      <input type="date" class="set-sel" value="${escHtml(alFilters.to)}" onchange="alSet('to',this.value)" title="To">
      <button class="set-btn" onclick="alClearFilters()">${icon('close', 'xs')}Clear filters</button>
    </div>

    ${rows.length ? alTable(rows) : `
      <div class="bk-empty">${icon('list', 'md')}
        <div class="bk-empty__t">${all.length ? 'Nothing matches those filters' : 'No activity recorded yet'}</div>
        <div class="bk-empty__s">${all.length
          ? 'Clear the filters to see the whole log.'
          : 'Admitting a student, taking a payment or changing a setting each writes a row here.'}</div>
      </div>`}
  </div>

  ${alSelected ? alDetailPanel(alSelected) : ''}`;
}

/* ── The daily trend, fourteen bars ──────────────────────────────────────── */
function alTrend() {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(ymd(d));
  }
  const byDay = {};
  for (const e of alAll()) byDay[e.date] = (byDay[e.date] || 0) + 1;
  const max = Math.max(1, ...days.map(d => byDay[d] || 0));

  return `
    <div class="al-bars">
      ${days.map(d => {
        const n = byDay[d] || 0;
        const label = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `<div class="al-bar" title="${escHtml(label)} — ${n} ${n === 1 ? 'entry' : 'entries'}">
          <div class="al-bar__f" style="height:${Math.round(n / max * 100)}%"></div>
        </div>`;
      }).join('')}
    </div>
    <div class="al-bars__ax">
      <span>${escHtml(new Date(days[0] + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}</span>
      <span>today</span>
    </div>`;
}

/* ── The split by type ───────────────────────────────────────────────────── */
function alTypeDonut(counts, total) {
  const parts = Object.keys(AL_TYPES)
    .map(k => ({ key: k, hue: AL_TYPES[k].hue, n: counts[k] }))
    .filter(p => p.n > 0);
  const R = 32, C = 2 * Math.PI * R;
  let at = 0;
  const arcs = parts.map(p => {
    const frac = total ? p.n / total : 0;
    const seg = `<circle class="hi-ring__s ${p.hue}" cx="40" cy="40" r="${R}"
      stroke-dasharray="${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}"
      stroke-dashoffset="${(-at * C).toFixed(2)}"></circle>`;
    at += frac;
    return seg;
  }).join('');

  return `
    <div class="hi-store">
      <div class="hi-ring">
        <svg viewBox="0 0 80 80" width="88" height="88" aria-hidden="true">
          <circle class="hi-ring__t" cx="40" cy="40" r="${R}"></circle>
          ${arcs}
        </svg>
        <div class="hi-ring__c">
          <div class="hi-ring__v">${total}</div>
          <div class="hi-ring__l">total</div>
        </div>
      </div>
      <div class="hi-store__b">
        ${parts.length ? parts.map(p => `
          <div class="hi-store__r">
            <span class="hi-store__d ${p.hue}"></span>
            <span class="hi-store__k">${escHtml(p.key)}</span>
            <span class="hi-store__v">${p.n}</span>
          </div>`).join('')
        : '<div class="al-none">Nothing logged yet</div>'}
      </div>
    </div>`;
}

/* ── Who is busiest ──────────────────────────────────────────────────────── */
function alTopUsers(users) {
  if (!users.length) return '<div class="al-none">Nothing logged yet</div>';
  const max = users[0][1];
  return `<div class="al-users">
    ${users.slice(0, 5).map(([name, n]) => `
      <div class="al-user">
        <span class="al-user__n">${escHtml(name)}</span>
        <span class="al-user__t"><span class="al-user__f" style="width:${Math.round(n / max * 100)}%"></span></span>
        <span class="al-user__v">${n}</span>
      </div>`).join('')}
  </div>`;
}

/* ── The register ────────────────────────────────────────────────────────── */
function alTable(rows) {
  const pages = Math.max(1, Math.ceil(rows.length / AL_PAGE_SIZE));
  if (alPage > pages) alPage = pages;
  const start = (alPage - 1) * AL_PAGE_SIZE;
  const page = rows.slice(start, start + AL_PAGE_SIZE);

  return `
  <div class="set-table-wrap">
    <table class="set-table al-table">
      <thead><tr>
        <th class="cfg-n">#</th>
        <th>Date &amp; time</th>
        <th>User</th>
        <th>Action</th>
        <th>Module</th>
        <th>Details</th>
        <th class="al-th-lock" title="This app runs on one computer with no server, so there is no address to record.">IP address ${icon('lock', 'xs')}</th>
        <th class="al-th-lock" title="A row is written after the action succeeded, so every row would say Success. Failures are not recorded.">Status ${icon('lock', 'xs')}</th>
      </tr></thead>
      <tbody>
        ${page.map((e, i) => {
          const t = alType(e);
          const T = AL_TYPES[t];
          return `<tr class="${alSelected === e.id ? 'is-on' : ''}" onclick="alOpen('${escHtml(e.id)}')">
            <td class="cfg-n">${start + i + 1}</td>
            <td class="al-when">${escHtml(fmtDate(e.date))}<small>${escHtml(e.time || '')}</small></td>
            <td>${escHtml(e.by || '—')}</td>
            <td><span class="lk-chip ${T.hue}">${icon(T.ico, 'xs')}${escHtml(t)}</span>
                <div class="al-act">${escHtml(e.action)}</div></td>
            <td>${escHtml(e.category || 'General')}</td>
            <td class="al-det">${escHtml(e.details || '—')}</td>
            <td class="lk-dash">—</td>
            <td class="lk-dash">—</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  <div class="al-foot">
    <span>Showing ${start + 1}–${Math.min(start + AL_PAGE_SIZE, rows.length)} of ${rows.length}${rows.length !== alAll().length ? ' filtered' : ''} entries</span>
    <div class="al-pager">
      <button class="set-btn" ${alPage <= 1 ? 'disabled' : ''} onclick="alGo(${alPage - 1})">${icon('arrowLeft', 'xs')}</button>
      <span class="al-pager__n">${alPage} / ${pages}</span>
      <button class="set-btn" ${alPage >= pages ? 'disabled' : ''} onclick="alGo(${alPage + 1})">${icon('arrowLeft', 'xs')}</button>
    </div>
  </div>`;
}

/* ── One entry, in full ──────────────────────────────────────────────────── */
function alDetailPanel(id) {
  const e = alAll().find(x => x.id === id);
  if (!e) return '';
  const t = alType(e);
  const T = AL_TYPES[t];
  const row = (label, value) => `
    <div class="hi-fact"><span class="hi-fact__i">${icon('list', 'xs')}</span>
      <span class="hi-fact__l">${escHtml(label)}</span>
      <span class="hi-fact__v">${escHtml(value)}</span></div>`;

  return `
  <div class="al-panel-wrap" onclick="if(event.target===this)alClose()">
    <aside class="al-panel" role="dialog" aria-label="Log entry">
      <div class="al-panel__h">
        <div class="al-panel__i ${T.hue}">${icon(T.ico, 'sm')}</div>
        <div style="min-width:0">
          <div class="al-panel__t">${escHtml(e.action)}</div>
          <div class="al-panel__s">${escHtml(e.details || 'No further detail was recorded.')}</div>
        </div>
        <button class="set-rowbtn" onclick="alClose()" title="Close">${icon('close', 'xs')}</button>
      </div>
      <div class="al-panel__b">
        <div class="hi-facts" style="border-top:none;margin-top:0;padding-top:0">
          ${row('Date & time', fmtDate(e.date) + ', ' + (e.time || '—'))}
          ${row('User', e.by || 'Not recorded')}
          ${row('Module', e.category || 'General')}
          ${row('Type', t)}
          ${row('Entry id', e.id)}
        </div>
        <div class="cfg-note">${icon('info', 'xs')}<span>The reference shows a before-and-after of the record that changed. This log stores <b>what happened</b>, not the row it happened to — there is no old value to show, and inventing one would be worse than saying so.</span></div>
        <div class="al-raw__h">${icon('code', 'xs')}Raw entry</div>
        <pre class="hi-pre">${escHtml(JSON.stringify(e, null, 2))}</pre>
      </div>
    </aside>
  </div>`;
}

/* ── Controls ────────────────────────────────────────────────────────────── */
function alSet(key, value) {
  alFilters[key] = value;
  alPage = 1;
  const focusQ = key === 'q';
  renderPage('activitylog');
  if (focusQ) {
    const el = document.getElementById('al-q');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }
}
function alClearFilters() {
  alFilters = { q: '', user: 'All', type: 'All', module: 'All', from: '', to: '' };
  alPage = 1;
  renderPage('activitylog');
}
function alGo(p) { alPage = Math.max(1, p); renderPage('activitylog'); }
function alOpen(id) { alSelected = id; renderPage('activitylog'); }
function alClose() { alSelected = null; renderPage('activitylog'); }

function alClear() {
  if (typeof requirePerm === 'function' && !requirePerm('delete')) return;
  showConfirm('Clear the activity log?',
    'Every entry is deleted permanently. Export it first if you need the record — this is the only copy.',
    async () => {
      DB.activityLog = [];
      await saveDB();
      alClearFilters();
      toast('Activity log cleared', 'info');
    });
}

/** The filtered view, as the document. Same engine every other screen uses. */
function _alExportDef() {
  const rows = alRows();
  const f = alFilters;
  const bits = [];
  if (f.q) bits.push('matching "' + f.q + '"');
  if (f.user !== 'All') bits.push('by ' + f.user);
  if (f.type !== 'All') bits.push(f.type.toLowerCase());
  if (f.module !== 'All') bits.push('in ' + f.module);
  if (f.from) bits.push('from ' + f.from);
  if (f.to) bits.push('to ' + f.to);

  return {
    module: 'Activity-Log',
    title: 'Activity Log',
    scope: bits.length ? bits.join(', ') : 'All entries',
    columns: [
      { key: 'date',     label: 'Date',    width: 74 },
      { key: 'time',     label: 'Time',    width: 58 },
      { key: 'by',       label: 'User',    width: 100 },
      { key: 'type',     label: 'Type',    width: 66 },
      { key: 'action',   label: 'Action',  width: 130 },
      { key: 'category', label: 'Module',  width: 92 },
      { key: 'details',  label: 'Details', width: 240 },
    ],
    rows: rows.map(e => ({
      date: fmtDate(e.date), time: e.time || '', by: e.by || '—',
      type: alType(e), action: e.action, category: e.category || 'General',
      details: e.details || '',
    })),
    empty: 'No activity matched this view.',
  };
}

function alExport(kind) {
  if (!alRows().length) { toast('There is nothing to export in this view', 'info'); return; }
  if (kind === 'excel') EXPORT.excel(_alExportDef());
  else EXPORT.pdf(_alExportDef());
}
