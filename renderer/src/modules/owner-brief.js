/* ─── OWNER SUMMARY — THE HOSTEL ON THREE PAGES ────────────────────────────────
   Owner, 2026-09-29: "in reports there should be a maximum two to three pages
   summary for short briefs for owners with visuals, an enterprise level
   summary of the hostel, monthly or yearly, whichever one he wants."

   The full report (printReport) is every register in full — the document a
   warden files. This is the other one: what an owner reads in two minutes.

     page 1  AT A GLANCE   headline facts, six KPIs against the last period,
                           revenue and expenses month by month
     page 2  MONEY         collection rate, payment methods, what was billed,
                           where the money went, owner funds
     page 3  PEOPLE        occupancy by room type, student movement, who owes
                           the most, cancellations and issues

   NO NEW ARITHMETIC. Every figure is read from the functions the Reports page
   itself draws with — _rptTotals(), _rptMethodSplit(), _rptRevParts(),
   _rptCollect(), _rptTrend(), _rptByCategory(), _buildRoomStudentIndex(),
   ofStatement() — so this document and the screen cannot disagree about a
   rupee. Those functions read the page's period from `reportMonth` and
   `reportYearly`; _obWithPeriod() sets both for the build and puts them back,
   so printing a year's summary does not move the page the owner is looking at.

   NO INVENTED WORDS. The headline sentences state facts the figures already
   hold ("collected 92% of what was billed"). They never advise, predict or
   judge, and a sentence with no figure behind it is left out, not guessed.

   Money on the tiles follows the KPI rule (fmtKpi: whole rupees, millions from
   ten million); chart labels the chart rule (fmtChart); tables the exact
   figure (fmtPKR). Colours are dark enough to survive a black-and-white
   photocopy (the export engine's rule, owner 2026-09-15), and every chart
   carries its numbers in text, so no fact is told by colour alone.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const OB_C = {
  ink: '#111827', muted: '#374151', faint: '#6B7280', line: '#9CA3AF', soft: '#F3F4F6',
  rev: '#1D4ED8', exp: '#B42318', net: '#05603A', pend: '#8A4B00', accent: '#4338CA',
};

/** Build with the Reports page set to `key` (YYYY-MM, or YYYY for a year), then restore it. */
function _obWithPeriod(key, yearly, fn) {
  const m0 = reportMonth, y0 = reportYearly;
  reportMonth  = yearly ? String(key).slice(0, 4) + '-01' : String(key);
  reportYearly = !!yearly;
  try { return fn(); } finally { reportMonth = m0; reportYearly = y0; }
}

const _obRs  = n => 'Rs. ' + fmtKpi(n);
const _obPct = (n, d) => (d > 0 ? Math.round(n / d * 1000) / 10 : null);

/** "▲ 12.5% vs Aug 2026". Empty when there is nothing honest to compare with. */
function _obDelta(cur, prev, label, mode) {
  if (mode === 'abs') {
    const d = cur - prev;
    if (!prev && !cur) return '';
    return d === 0 ? 'Same as ' + label : (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + ' vs ' + label;
  }
  if (!prev) return '';
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  return pct === 0 ? 'Same as ' + label : (pct > 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '% vs ' + label;
}

/* ── THE FIGURES ──────────────────────────────────────────────────────────── */
function ownerBriefData(key, yearly) {
  return _obWithPeriod(key, yearly, () => {
    const keys = _rptKeys(), prevKeys = _rptPrevKeys();
    const cur  = _rptTotals(keys), prev = _rptTotals(prevKeys);
    const idx  = _buildRoomStudentIndex(keys), pIdx = _buildRoomStudentIndex(prevKeys);
    const rooms = DB.rooms || [];
    const occ   = rooms.filter(r => idx.occ(r) > 0).length;
    const pOcc  = rooms.filter(r => pIdx.occ(r) > 0).length;

    // Who owes the most — the same records, and the same outstandingOf(), as Pending.
    const owe = new Map();
    cur.pays.filter(p => p.status === 'Pending').forEach(p => {
      const o = outstandingOf(p);
      if (!(o > 0.5)) return;
      const k = p.studentId || p.id;
      const s = (DB.students || []).find(t => t.id === p.studentId);
      const a = owe.get(k) || { name: (s && s.name) || p.studentName || '—', room: p.roomNumber || '', amt: 0, months: new Set() };
      a.amt += o; if (p.month) a.months.add(p.month);
      owe.set(k, a);
    });
    const owing = [...owe.values()].sort((a, b) => b.amt - a.amt);

    const residents = idx.residents;
    const joined = residents.filter(r => r.joined).length, left = residents.filter(r => r.left).length;
    const starting = residents.filter(r => !r.joined).length;

    const byType = (DB.settings.roomTypes || []).map(t => {
      const tr = rooms.filter(r => r.typeId === t.id);
      const o = tr.filter(r => idx.occ(r) > 0).length;
      return { name: t.name, rooms: tr.length, occ: o, pct: _obPct(o, tr.length) };
    }).filter(t => t.rooms > 0);

    /* MONTHS THAT HAVE MOVED TO THE ARCHIVE. Settled records older than six
       full months leave DB.payments/DB.expenses for DB.archive (settings.js,
       enforceDataRetention), and calcRevenue()/calcExpenses() read the live
       lists only — so on a year's summary, and on the Reports page's year view,
       those months read 0. A silent 0 on an owner's page is a false figure, so
       the months are named and marked instead. Whether the year totals should
       read the archive is the owner's decision (raised 2026-09-29). */
    const inArchive = k => (DB.archive || []).some(r =>
      String(r.month || '').indexOf(k) === 0 || String(r.date || '').indexOf(k) === 0);
    const trend = _rptTrend(keys[0], yearly).map(t => Object.assign(t, { archived: inArchive(t.key) }));

    const issues = _rptIssues();
    const bucket = s => (typeof _issBucket === 'function' ? _issBucket(s) : (s === 'Resolved' ? 'resolved' : 'open'));
    const ofOn = typeof ofAllowed === 'function' && ofAllowed();

    return {
      key: keys[0], yearly: !!yearly,
      label: yearly ? 'Year ' + keys[0] : monthLabel(keys[0]),
      prevLabel: yearly ? String(prevKeys[0]) : monthLabel(prevKeys[0]),
      cur, prev,
      collect: _rptCollect(cur), prevCollect: _rptCollect(prev),
      methods: _rptMethodSplit(cur.pays),
      revParts: _rptRevParts(cur.pays),
      cats: _rptByCategory(cur.exps),
      trend,
      archivedMonths: trend.filter(t => t.archived).map(t => t.key),
      rooms: rooms.length, occ, pOcc,
      occRate: _obPct(occ, rooms.length), pOccRate: _obPct(pOcc, rooms.length),
      byType, owing,
      move: { starting, joined, left, ending: starting + joined - left, residents: residents.length },
      cancels: _rptCancels().length,
      issues: {
        total: issues.length,
        open: issues.filter(i => bucket(i.status) === 'open').length,
        progress: issues.filter(i => bucket(i.status) === 'progress').length,
        resolved: issues.filter(i => bucket(i.status) === 'resolved').length,
      },
      owner: ofOn ? ofStatement(keys[0], { revenue: cur.rev, expenses: cur.totalExp }) : null,
    };
  });
}

/* ── HEADLINES — facts only ───────────────────────────────────────────────── */
function _obHeadlines(d) {
  const out = [], c = d.cur;
  if (d.archivedMonths && d.archivedMonths.length) {
    const n = d.archivedMonths.length;
    out.push(`<b>Totals leave out ${n} month${n === 1 ? '' : 's'}</b> now in the Annual Archive — see the note under the chart.`);
  }
  if (d.collect.rate != null) {
    out.push(`Collected <b>${escHtml(fmtPKR(c.collected))}</b> of <b>${escHtml(fmtPKR(c.billed))}</b> billed — <b>${Math.round(d.collect.rate * 10) / 10}%</b>.`);
  }
  if (c.rev || c.totalExp) {
    out.push(`Net result <b>${escHtml((c.net < 0 ? '−' : '') + fmtPKR(Math.abs(c.net)))}</b> — revenue less expenses${d.prev.net ? ', ' + escHtml(_obDelta(c.net, d.prev.net, d.prevLabel)) : ''}.`);
  }
  if (c.pending > 0) {
    out.push(`<b>${escHtml(fmtPKR(c.pending))}</b> still owed by <b>${d.owing.length}</b> student${d.owing.length === 1 ? '' : 's'}.`);
  }
  if (d.rooms) out.push(`<b>${d.occ}</b> of <b>${d.rooms}</b> rooms lived in (<b>${d.occRate}%</b>).`);
  if (d.cats.length && c.totalExp > 0) {
    const top = d.cats[0];
    out.push(`Largest expense: <b>${escHtml(top.cat)}</b>, ${escHtml(fmtPKR(top.total))} (${Math.round(top.total / c.totalExp * 100)}% of spending).`);
  }
  if (d.move.joined || d.move.left) {
    out.push(`<b>${d.move.joined}</b> admission${d.move.joined === 1 ? '' : 's'} and <b>${d.move.left}</b> departure${d.move.left === 1 ? '' : 's'}.`);
  }
  return out;
}

/* ── CHARTS (inline SVG, print-safe) ──────────────────────────────────────── */
function _obNiceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Revenue and expenses, bar pairs per month, with gridlines and labels. */
function _obTrendSvg(trend) {
  const W = 700, H = 230, L = 58, R = 10, T = 14, B = 34;
  const max = _obNiceMax(Math.max(1, ...trend.map(t => Math.max(t.rev, t.exp))));
  const n = trend.length, slot = (W - L - R) / n;
  const bw = Math.min(26, slot * 0.34);
  const y = v => T + (H - T - B) * (1 - v / max);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${i ? '#D1D5DB' : OB_C.line}" stroke-width="${i ? .6 : 1}"/>`
       + `<text x="${L - 6}" y="${yy + 3}" text-anchor="end" font-size="9" fill="${OB_C.muted}">${escHtml(fmtChart(v))}</text>`;
  }
  trend.forEach((t, i) => {
    const cx = L + slot * i + slot / 2;
    const bar = (v, x, col) => v > 0
      ? `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(.5, y(0) - y(v))}" fill="${col}"/>` : '';
    g += bar(t.rev, cx - bw - 1, OB_C.rev) + bar(t.exp, cx + 1, OB_C.exp);
    if (n <= 12 && t.rev > 0) g += `<text x="${cx - bw / 2 - 1}" y="${y(t.rev) - 3}" text-anchor="middle" font-size="7.5" fill="${OB_C.ink}">${escHtml(fmtChart(t.rev))}</text>`;
    // An archived month is not a zero month — say where its figures went.
    if (t.archived && !t.rev && !t.exp) g += `<text x="${cx}" y="${y(0) - 6}" text-anchor="middle" font-size="7.5" font-style="italic" fill="${OB_C.muted}">in archive</text>`;
    g += `<text x="${cx}" y="${H - B + 14}" text-anchor="middle" font-size="9" fill="${OB_C.muted}">${escHtml(t.lbl)}${t.archived ? '*' : ''}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Revenue and expenses by month">${g}</svg>`;
}

/** A ring of slices with the total in the middle. */
function _obDonutSvg(rows, total, caption) {
  const S = 150, r = 54, sw = 22, C = 2 * Math.PI * r;
  let off = 0, arcs = '';
  rows.forEach(x => {
    const len = total > 0 ? C * x.value / total : 0;
    arcs += `<circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" stroke="${x.color}" stroke-width="${sw}"
               stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${S / 2} ${S / 2})"/>`;
    off += len;
  });
  if (!rows.length) arcs = `<circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" stroke="#E5E7EB" stroke-width="${sw}"/>`;
  return `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="${escHtml(caption)}">${arcs}
    <text x="${S / 2}" y="${S / 2 - 2}" text-anchor="middle" font-size="15" font-weight="800" fill="${OB_C.ink}">${escHtml(total > 0 ? 'Rs. ' + fmtChart(total) : '—')}</text>
    <text x="${S / 2}" y="${S / 2 + 14}" text-anchor="middle" font-size="8.5" fill="${OB_C.muted}">${escHtml(caption)}</text></svg>`;
}

/** Horizontal bars: label, bar, exact amount, share. */
function _obBars(rows, total, empty) {
  if (!rows.length) return `<div class="ob-none">${escHtml(empty)}</div>`;
  const max = Math.max(...rows.map(r => r.value), 1);
  return '<div class="ob-bars">' + rows.map(r => `
    <div class="ob-bar">
      <span class="ob-bar__n">${escHtml(r.label)}</span>
      <span class="ob-bar__t"><i style="width:${(r.value / max * 100).toFixed(1)}%;background:${r.color || OB_C.accent}"></i></span>
      <span class="ob-bar__v">${escHtml(fmtPKR(r.value))}</span>
      <span class="ob-bar__p">${total > 0 ? Math.round(r.value / total * 100) + '%' : ''}</span>
    </div>`).join('') + '</div>';
}

/* The four parts of a bill in dark print colours — the screen's tokens are
   theme-dependent and light, and this is paper. Matched by label. */
const OB_PART_COLOR = { 'Rent': OB_C.rev, 'Mess': OB_C.net, 'Extra charges': '#6D28D9', 'Admission fee': OB_C.pend };

/* ── THE DOCUMENT ─────────────────────────────────────────────────────────── */
function ownerBriefHTML(d) {
  const c = d.cur, s = DB.settings || {};
  const hostel = s.hostelName || 'Hostel';
  const logo = typeof s.logo === 'string' && /^data:image\//.test(s.logo) ? s.logo : '';
  const stamp = typeof EXPORT !== 'undefined' ? EXPORT.fmt.stamp(new Date()) : new Date().toLocaleString('en-PK');
  const by = (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : '';

  const head = (title, n) => `
    <header class="ob-h">
      <div class="ob-h__l">
        ${logo ? `<img class="ob-logo" src="${escHtml(logo)}" alt="">` : ''}
        <div><div class="ob-hostel">${escHtml(hostel)}</div>
             <div class="ob-sub">Owner Summary · ${escHtml(d.label)}</div></div>
      </div>
      <div class="ob-h__r"><div class="ob-title">${escHtml(title)}</div><div class="ob-pg">Page ${n} of 3</div></div>
    </header>`;
  const foot = `<footer class="ob-f"><span>Generated ${escHtml(stamp)}${by ? ' by ' + escHtml(by) : ''}</span>
    <span>Figures from the same calculations as the Reports page · Hostyllo Offline</span></footer>`;

  const kpi = (label, value, sub, tone) => `
    <div class="ob-k ${tone || ''}"><div class="ob-k__l">${escHtml(label)}</div>
      <div class="ob-k__v">${value}</div><div class="ob-k__s">${escHtml(sub || ' ')}</div></div>`;
  const rateTxt = d.collect.rate == null ? '—' : (Math.round(d.collect.rate * 10) / 10) + '%';

  /* ── Page 1 ── */
  const heads = _obHeadlines(d);
  const trendRows = [['Revenue', 'rev'], ['Expenses', 'exp']].map(([l, k]) =>
    `<tr><th>${l}</th>${d.trend.map(t => `<td>${escHtml(fmtChart(t[k]))}</td>`).join('')}</tr>`).join('')
    + `<tr class="ob-net"><th>Net</th>${d.trend.map(t => { const n = t.rev - t.exp;
        return `<td class="${n < 0 ? 'is-neg' : ''}">${n < 0 ? '−' : ''}${escHtml(fmtChart(Math.abs(n)))}</td>`; }).join('')}</tr>`;
  const page1 = `
  <section class="ob-page">${head('At a glance', 1)}
    ${heads.length ? `<div class="ob-heads">${heads.map(h => `<div class="ob-hl">${h}</div>`).join('')}</div>`
                   : '<div class="ob-none">No records in this period.</div>'}
    <div class="ob-kpis">
      ${kpi('Revenue', _obRs(c.rev), _obDelta(c.rev, d.prev.rev, d.prevLabel), 'is-rev')}
      ${kpi('Expenses', _obRs(c.totalExp), _obDelta(c.totalExp, d.prev.totalExp, d.prevLabel), 'is-exp')}
      ${kpi('Net result', (c.net < 0 ? '−' : '') + _obRs(Math.abs(c.net)), _obDelta(c.net, d.prev.net, d.prevLabel), c.net < 0 ? 'is-exp' : 'is-net')}
      ${kpi('Pending', _obRs(c.pending), d.owing.length + ' student' + (d.owing.length === 1 ? '' : 's') + ' owe', 'is-pend')}
      ${kpi('Collection rate', rateTxt, d.prevCollect.rate == null ? 'Collected ÷ billed'
            : (Math.round(d.prevCollect.rate * 10) / 10) + '% in ' + d.prevLabel, '')}
      ${kpi('Occupancy', d.occRate == null ? '—' : d.occRate + '%', d.occ + ' of ' + d.rooms + ' rooms'
            + (d.pOccRate != null ? ' · ' + d.pOccRate + '% in ' + d.prevLabel : ''), '')}
    </div>
    <div class="ob-card">
      <div class="ob-card__h">Revenue and expenses — ${d.yearly ? 'each month of ' + escHtml(d.key) : 'the six months to ' + escHtml(d.label)}
        <span class="ob-key"><i style="background:${OB_C.rev}"></i>Revenue <i style="background:${OB_C.exp}"></i>Expenses</span></div>
      ${_obTrendSvg(d.trend)}
      <table class="ob-tt"><thead><tr><th></th>${d.trend.map(t => `<th>${escHtml(t.lbl)}${t.archived ? '*' : ''}</th>`).join('')}</tr></thead>
        <tbody>${trendRows}</tbody></table>
      ${d.archivedMonths.length ? `<div class="ob-note">* ${escHtml(d.archivedMonths.map(monthLabel).join(', '))}: settled records
        older than six months have moved to the Annual Archive and are not counted in this summary's figures.
        The Annual Archive page holds them.</div>` : ''}
    </div>
    ${foot}
  </section>`;

  /* ── Page 2 ── */
  const methodRows = d.methods.map(m => ({ label: m.m, value: m.amt, color: m.color }));
  const methodTotal = methodRows.reduce((s2, x) => s2 + x.value, 0);
  const parts = d.revParts.slices.map(x => ({ label: x.label, value: x.value, color: OB_PART_COLOR[x.label] || OB_C.accent }));
  const CAT_MAX = 7;
  const catRows = d.cats.slice(0, CAT_MAX).map(x => ({ label: x.cat, value: x.total, color: OB_C.exp }));
  if (d.cats.length > CAT_MAX) {
    const rest = d.cats.slice(CAT_MAX);
    catRows.push({ label: rest.length + ' more categories', value: _rptGroupsTotal(rest), color: OB_C.line });
  }
  const own = d.owner;
  const page2 = `
  <section class="ob-page">${head('Money', 2)}
    <div class="ob-card">
      <div class="ob-card__h">Collection performance</div>
      <div class="ob-rate">
        <div class="ob-rate__big">${rateTxt}<small>of the amount billed was collected</small></div>
        <div class="ob-rate__bar"><i style="width:${Math.min(100, d.collect.rate || 0)}%"></i></div>
      </div>
      <div class="ob-facts">
        <div><span>Billed</span><b>${escHtml(fmtPKR(c.billed))}</b></div>
        <div><span>Collected</span><b>${escHtml(fmtPKR(c.collected))}</b></div>
        <div><span>Pending</span><b class="is-pend">${escHtml(fmtPKR(c.pending))}</b></div>
        <div><span>Paid in full</span><b>${d.collect.paid}</b></div>
        <div><span>Part paid</span><b>${d.collect.part}</b></div>
        <div><span>Not paid</span><b>${d.collect.unpaid}</b></div>
      </div>
    </div>
    <div class="ob-two">
      <div class="ob-card">
        <div class="ob-card__h">How the money came in</div>
        <div class="ob-donut">${_obDonutSvg(methodRows, methodTotal, 'Collected')}
          <div class="ob-legend">${methodRows.length ? methodRows.map(x => `
            <div><i style="background:${x.color}"></i><span>${escHtml(x.label)}</span>
              <b>${escHtml(fmtPKR(x.value))}</b><em>${methodTotal ? (x.value / methodTotal * 100).toFixed(1) : '0.0'}%</em></div>`).join('')
            : '<div class="ob-none">Nothing collected.</div>'}</div>
        </div>
      </div>
      <div class="ob-card">
        <div class="ob-card__h">What was billed</div>
        ${_obBars(parts, d.revParts.gross, 'Nothing billed in this period.')}
        ${d.revParts.conc > 0 ? `<div class="ob-line"><span>Less concessions</span><b class="is-exp">−${escHtml(fmtPKR(d.revParts.conc))}</b></div>` : ''}
        <div class="ob-line ob-line--tot"><span>Total billed</span><b>${escHtml(fmtPKR(d.revParts.total))}</b></div>
      </div>
    </div>
    <div class="ob-card">
      <div class="ob-card__h">Where the money went <span class="ob-card__m">${escHtml(fmtPKR(c.totalExp))} in all</span></div>
      ${_obBars(catRows, c.totalExp, 'Nothing was spent in this period.')}
    </div>
    ${own ? `
    <div class="ob-card">
      <div class="ob-card__h">Owner funds <span class="ob-card__m">beside profit and loss, never inside it</span></div>
      <div class="ob-facts">
        <div><span>Profit / loss</span><b class="${own.result < 0 ? 'is-exp' : ''}">${own.result < 0 ? '−' : ''}${escHtml(fmtPKR(Math.abs(own.result)))}</b></div>
        <div><span>Owner gave</span><b>+${escHtml(fmtPKR(own.ownerIn))}</b></div>
        <div><span>Owner took</span><b>−${escHtml(fmtPKR(own.ownerOut))}</b></div>
        <div><span>After owner</span><b class="${own.afterOwner < 0 ? 'is-exp' : ''}">${own.afterOwner < 0 ? '−' : ''}${escHtml(fmtPKR(Math.abs(own.afterOwner)))}</b></div>
      </div>
    </div>` : ''}
    ${foot}
  </section>`;

  /* ── Page 3 ── */
  const OWE_MAX = 10;
  const m = d.move;
  const page3 = `
  <section class="ob-page">${head('People and rooms', 3)}
    <div class="ob-two">
      <div class="ob-card">
        <div class="ob-card__h">Occupancy by room type <span class="ob-card__m">${d.occ} of ${d.rooms} rooms</span></div>
        ${d.byType.length ? '<div class="ob-bars">' + d.byType.map(t => `
          <div class="ob-bar">
            <span class="ob-bar__n">${escHtml(t.name)}</span>
            <span class="ob-bar__t"><i style="width:${t.pct || 0}%;background:${OB_C.rev}"></i></span>
            <span class="ob-bar__v">${t.occ} / ${t.rooms}</span>
            <span class="ob-bar__p">${t.pct == null ? '—' : t.pct + '%'}</span>
          </div>`).join('') + '</div>' : '<div class="ob-none">No rooms configured.</div>'}
      </div>
      <div class="ob-card">
        <div class="ob-card__h">Student movement</div>
        <div class="ob-move">
          <div><span>At the start</span><b>${m.starting}</b></div><em>+</em>
          <div><span>Admissions</span><b>${m.joined}</b></div><em>−</em>
          <div><span>Departures</span><b>${m.left}</b></div><em>=</em>
          <div class="is-end"><span>At the end</span><b>${m.ending}</b></div>
        </div>
        <div class="ob-facts ob-facts--3">
          <div><span>Lived here in the period</span><b>${m.residents}</b></div>
          <div><span>Cancellations filed</span><b>${d.cancels}</b></div>
          <div><span>Issues raised</span><b>${d.issues.total}</b></div>
          <div><span>Issues open</span><b class="${d.issues.open ? 'is-exp' : ''}">${d.issues.open}</b></div>
          <div><span>In progress</span><b>${d.issues.progress}</b></div>
          <div><span>Resolved</span><b>${d.issues.resolved}</b></div>
        </div>
      </div>
    </div>
    <div class="ob-card">
      <div class="ob-card__h">Who owes the most <span class="ob-card__m">${escHtml(fmtPKR(c.pending))} pending in all</span></div>
      ${d.owing.length ? `<table class="ob-tbl"><thead><tr><th>#</th><th>Student</th><th>Room</th><th>Months</th><th class="is-num">Owed</th></tr></thead><tbody>
        ${d.owing.slice(0, OWE_MAX).map((o, i) => `<tr><td>${i + 1}</td><td>${escHtml(o.name)}</td>
          <td>${o.room ? escHtml(roomText(o.room)) : '—'}</td><td>${[...o.months].sort().map(k => escHtml(monthLabel(k))).join(', ') || '—'}</td>
          <td class="is-num">${escHtml(fmtPKR(o.amt))}</td></tr>`).join('')}
        </tbody></table>
        ${d.owing.length > OWE_MAX ? `<div class="ob-more">and ${d.owing.length - OWE_MAX} more student${d.owing.length - OWE_MAX === 1 ? '' : 's'} — the full list is in Reports → Pending.</div>` : ''}`
        : '<div class="ob-none">Nobody owes anything for this period.</div>'}
    </div>
    ${foot}
  </section>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${escHtml(hostel)} — Owner Summary · ${escHtml(d.label)}</title>
  <style>${_obCss()}</style></head><body>${page1}${page2}${page3}</body></html>`;
}

function _obCss() {
  const C = OB_C;
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:${C.ink};background:#fff;font-size:11px;line-height:1.4;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ob-page{position:relative;min-height:268mm;padding:0 0 26px;page-break-after:always;break-after:page}
  .ob-page:last-child{page-break-after:auto;break-after:auto}
  .ob-h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid ${C.ink};padding-bottom:8px;margin-bottom:12px}
  .ob-h__l{display:flex;align-items:center;gap:10px}
  .ob-logo{width:38px;height:38px;object-fit:contain}
  .ob-hostel{font-size:17px;font-weight:800;letter-spacing:-.01em}
  .ob-sub{font-size:11px;color:${C.muted};font-weight:600}
  .ob-h__r{text-align:right}
  .ob-title{font-size:15px;font-weight:800;color:${C.accent}}
  .ob-pg{font-size:9.5px;color:${C.faint}}
  .ob-f{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;border-top:1px solid ${C.line};
        padding-top:5px;font-size:8.5px;color:${C.faint}}
  .ob-heads{display:grid;grid-template-columns:1fr 1fr;gap:5px 16px;margin-bottom:12px;padding:10px 12px;
            border:1px solid ${C.line};border-left:4px solid ${C.accent};border-radius:6px}
  .ob-hl{font-size:11px;color:${C.muted}} .ob-hl b{color:${C.ink}}
  .ob-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  .ob-k{border:1px solid ${C.line};border-top:4px solid ${C.line};border-radius:6px;padding:8px 10px}
  .ob-k.is-rev{border-top-color:${C.rev}} .ob-k.is-exp{border-top-color:${C.exp}}
  .ob-k.is-net{border-top-color:${C.net}} .ob-k.is-pend{border-top-color:${C.pend}}
  .ob-k__l{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${C.muted}}
  .ob-k__v{font-size:21px;font-weight:800;letter-spacing:-.02em;margin:2px 0;font-variant-numeric:tabular-nums}
  .ob-k__s{font-size:9.5px;color:${C.muted};min-height:13px}
  .ob-card{border:1px solid ${C.line};border-radius:6px;padding:10px 12px;margin-bottom:12px;break-inside:avoid}
  .ob-card__h{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;font-weight:800;margin-bottom:8px}
  .ob-card__m{font-size:9.5px;font-weight:600;color:${C.muted}}
  .ob-key{font-size:9.5px;font-weight:600;color:${C.muted}}
  .ob-key i{display:inline-block;width:9px;height:9px;margin:0 4px 0 10px;vertical-align:-1px}
  .ob-tt{width:100%;border-collapse:collapse;margin-top:6px;font-size:9px;font-variant-numeric:tabular-nums}
  .ob-tt th,.ob-tt td{padding:3px 4px;text-align:right;border-top:1px solid #E5E7EB}
  .ob-tt thead th{color:${C.muted};font-weight:700;border-top:none}
  .ob-tt tbody th{text-align:left;color:${C.muted}}
  .ob-tt .ob-net td,.ob-tt .ob-net th{font-weight:800;color:${C.ink};border-top:1px solid ${C.line}}
  .is-neg,.is-exp{color:${C.exp}!important} .is-pend{color:${C.pend}!important}
  .ob-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .ob-two>.ob-card{margin-bottom:12px}
  .ob-rate{display:flex;align-items:center;gap:16px;margin-bottom:10px}
  .ob-rate__big{font-size:28px;font-weight:800;min-width:200px} .ob-rate__big small{display:block;font-size:9.5px;font-weight:600;color:${C.muted}}
  .ob-rate__bar{flex:1;height:14px;border:1px solid ${C.line};border-radius:7px;overflow:hidden;background:${C.soft}}
  .ob-rate__bar i{display:block;height:100%;background:${C.net}}
  .ob-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .ob-facts--3{margin-top:10px}
  .ob-facts div{border:1px solid #E5E7EB;border-radius:5px;padding:5px 8px}
  .ob-facts span{display:block;font-size:9px;color:${C.muted};font-weight:600}
  .ob-facts b{font-size:13px;font-variant-numeric:tabular-nums}
  .ob-donut{display:flex;align-items:center;gap:12px}
  .ob-legend{flex:1;display:flex;flex-direction:column;gap:5px;font-size:10px}
  .ob-legend div{display:grid;grid-template-columns:10px 1fr auto 38px;gap:6px;align-items:center}
  .ob-legend i{width:10px;height:10px;border:1px solid ${C.ink}}
  .ob-legend b{font-variant-numeric:tabular-nums} .ob-legend em{font-style:normal;color:${C.muted};text-align:right}
  .ob-bars{display:flex;flex-direction:column;gap:6px}
  .ob-bar{display:grid;grid-template-columns:118px 1fr 92px 32px;gap:8px;align-items:center;font-size:10px}
  .ob-bar__n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
  .ob-bar__t{height:10px;background:${C.soft};border:1px solid #D1D5DB;border-radius:5px;overflow:hidden}
  .ob-bar__t i{display:block;height:100%}
  .ob-bar__v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
  .ob-bar__p{text-align:right;color:${C.muted}}
  .ob-line{display:flex;justify-content:space-between;font-size:10.5px;margin-top:7px;padding-top:5px;border-top:1px solid #E5E7EB}
  .ob-line--tot{font-weight:800;border-top:1px solid ${C.line}}
  .ob-move{display:flex;align-items:center;gap:6px}
  .ob-move div{flex:1;border:1px solid #E5E7EB;border-radius:5px;padding:6px;text-align:center}
  .ob-move div.is-end{border-color:${C.ink}}
  .ob-move span{display:block;font-size:9px;color:${C.muted};font-weight:600}
  .ob-move b{font-size:17px} .ob-move em{font-style:normal;font-weight:800;color:${C.muted}}
  .ob-tbl{width:100%;border-collapse:collapse;font-size:10px}
  .ob-tbl th{text-align:left;font-size:9px;color:${C.muted};font-weight:700;border-bottom:1px solid ${C.line};padding:4px 6px}
  .ob-tbl td{padding:4px 6px;border-bottom:1px solid #E5E7EB}
  .ob-tbl .is-num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
  .ob-more{font-size:9.5px;color:${C.muted};margin-top:6px}
  .ob-note{font-size:9px;color:${C.muted};margin-top:6px;padding-top:5px;border-top:1px dashed ${C.line}}
  .ob-none{font-size:10.5px;color:${C.muted};padding:8px 0}
  @page{margin:12mm}`;
}

/* ── ENTRY POINTS ─────────────────────────────────────────────────────────── */
/** Print the summary for a month (YYYY-MM) or a year (YYYY). */
function ownerBriefPDF(key, yearly) {
  if (typeof hostelNameGate === 'function' && hostelNameGate(() => ownerBriefPDF(key, yearly))) return;
  if (typeof requireOutput === 'function' && !requireOutput('printing')) return;
  try {
    const d = ownerBriefData(key, yearly);
    _electronPDF(ownerBriefHTML(d),
      printFileName('Owner-Summary', yearly ? String(key).slice(0, 4) : monthLabel(key)),
      { pageSize: paperSize(), landscape: false });
  } catch (e) {
    console.error('[HOSTYLLO] Owner summary failed:', e);
    if (typeof toast === 'function') toast('The owner summary could not be generated. Please try again.', 'error');
  }
}

/** The Reports page's own period — month or year, whichever the picker is on. */
function ownerBriefForPage(yearly) {
  const m = reportMonth || thisMonth();
  ownerBriefPDF(yearly ? m.slice(0, 4) : m, !!yearly);
}
