/* ─── DAMAM HOSTEL — UTILITY FUNCTIONS ──────────────────────────────────────
   Loaded after config.js. No dependencies on auth or storage.
   Contains: formatting helpers, DOM utilities, course autocomplete.
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const crypto = typeof require !== 'undefined' ? require('crypto') : null;

// ── Electron external link helper ─────────────────────────────────────────────
function openExternalLink(url) {
  try {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      var a = document.createElement('a');
      a.href = url;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); }, 500);
    }
  } catch (e) {
    console.error('openExternalLink error:', e);
  }
}

// ── ID & date helpers ─────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function nextStudentId() {
  var maxNum = 0;
  DB.students.forEach(function (s) {
    var n = parseInt(String(s.id), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  return String(maxNum + 1).padStart(3, '0');
}

function migrateStudentIdsToNumeric() {
  var needsMigration = DB.students.some(function (s) {
    var sid = String(s.id);
    var n   = parseInt(sid, 10);
    return isNaN(n) || sid !== String(n).padStart(3, '0');
  });
  if (!needsMigration) return;

  var idMap = {};
  DB.students.forEach(function (s, i) { idMap[s.id] = String(i + 1).padStart(3, '0'); });
  DB.students.forEach(function (s) { s.id = idMap[s.id]; });

  ['payments', 'cancellations', 'roomShifts', 'checkinlog', 'fines'].forEach(function (col) {
    (DB[col] || []).forEach(function (r) {
      if (r.studentId && idMap[r.studentId]) r.studentId = idMap[r.studentId];
    });
  });

  (DB.rooms || []).forEach(function (room) {
    if (Array.isArray(room.studentIds)) {
      room.studentIds = room.studentIds.map(function (sid) { return idMap[sid] || sid; });
    }
  });

  saveDB();
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function toggleClearBtn(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!inp || !btn) return;
  btn.classList.toggle('visible', inp.value.length > 0);
}

// Safe window.open() wrapper — handles popup blocker gracefully
function safeOpenWindow(width, height) {
  width  = width  || 1000;
  height = height || 720;
  var w = window.open('', '_blank', 'width=' + width + ',height=' + height);
  if (!w) {
    if (typeof toast === 'function')
      toast('⚠️ Popup blocked — allow popups for this page and try again.', 'error');
    return null;
  }
  return w;
}

// ── Date & money formatters ───────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }
function fmtPKR(n) { return 'PKR ' + Number(n || 0).toLocaleString('en-PK'); }
function fmtNum(n) { return Number(n || 0).toLocaleString('en-PK'); } // number only — pair with <span class="pkr">PKR</span>

// ── MONEYVALUE — single reusable renderer for ALL currency display ───────────
// Currency code renders small & muted, the amount renders large & bold.
// Never produces a duplicated "PKR PKR" prefix — always use this instead of
// hand-rolling fmtPKR()/fmtNum() + a literal "PKR" string in markup.
// size: 'display' (KPI cards, 32-40px) | 'section' (22px) | 'body' (14-16px) | 'label' (11-13px)
function moneyValue(amount, opts) {
  opts = opts || {};
  const size = opts.size || 'body';
  const currency = opts.currency || 'PKR';
  const color = opts.color ? `style="color:${opts.color}"` : '';
  const cls = opts.className ? ' ' + opts.className : '';
  return `<span class="money-value money-value--${size}${cls}" ${color}>`
       + `<span class="money-cur">${currency}</span>`
       + `<span class="money-amt">${fmtNum(amount)}</span>`
       + `</span>`;
}

// ── PRINT / PDF STYLESHEET — single source of truth for ALL printed reports ──
// Printed documents are always white/black-on-paper regardless of the app's
// dark/light theme (correct for print), but every report generator used to
// hand-roll its own near-duplicate <style> block with slightly different
// brand colours, radii, and class names. This is the one place to edit the
// brand look of every PDF (Monthly Report, Rent Summary, Transfers, etc.)
const PRINT_BRAND = {
  gold:  '#c07840',   // matches --gold (light theme)
  green: '#16a34a',
  red:   '#dc2626',
  ink:   '#1a1a2e',
  muted: '#64748b',
  faint: '#94a3b8',
};

function printDocStyles() {
  const b = PRINT_BRAND;
  return `<style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:${b.ink};background:#fff;padding:28px;font-size:12.5px}
    .header,.hdr{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:3px solid ${b.gold};margin-bottom:20px}
    .title,.ht{font-size:21px;font-weight:800}
    .subtitle,.hs{font-size:11px;color:#666;margin-top:3px}
    .badge{padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:${b.gold}22;color:#8b6a00;border:1px solid ${b.gold}55}
    /* KPI grid — supports both .kpi-grid > .kpi and .kg > .kc legacy markup */
    .kpi-grid,.kg{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px}
    .kpi,.kc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center}
    .kpi label,.kl{font-size:9.5px;color:${b.faint};text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px}
    .kpi .val,.kv{font-size:20px;font-weight:900;color:${b.ink}}
    .section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px}
    .section h3,h3{font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${b.muted};margin:16px 0 10px}
    .summary-box{border-radius:12px;padding:18px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse;font-size:11.5px}
    th{background:#f1f5f9;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:${b.muted};font-weight:700;border-bottom:1px solid #e2e8f0}
    td{padding:8px 12px;border-bottom:1px solid #f8fafc}
    .green,.gr{color:${b.green};font-weight:700}
    .red,.re{color:${b.red};font-weight:700}
    .gold,.go{color:#854d0e;font-weight:700}
    .footer,.ft{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:10.5px;color:${b.faint}}
    @media print{body{padding:16px}}
  </style>`;
}

// Renders a row of KPI tiles for a printed report. items: [{label, value, cls}]
// value should already be a formatted string (e.g. fmtPKR(x) or a plain count).
function printKpiGrid(items) {
  return `<div class="kpi-grid">${items.map(it =>
    `<div class="kpi"><label>${it.label}</label><div class="val${it.cls ? ' ' + it.cls : ''}"${it.color ? ` style="color:${it.color}"` : ''}>${it.value}</div></div>`
  ).join('')}</div>`;
}

function printHeader(hostelName, title, subtitle) {
  return `<div class="header"><div><div class="title">${hostelName}</div>` +
    (subtitle ? `<div class="subtitle">${title} · ${subtitle}</div>` : `<div class="subtitle">${title}</div>`) +
    `</div></div>`;
}

// BUG FIX: new Date('YYYY-MM-DD') parses as UTC midnight → wrong day in PKT (UTC+5)
// Appending 'T00:00:00' forces local-time parsing.
function fmtDate(d) {
  if (!d) return '—';
  try {
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
    return dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) { return d; }
}

// Dashboard month selector (null = real current month, 'YYYY-MM' = selected)
let _dashboardMonth = null;
function thisMonth() {
  return _dashboardMonth || new Date().toISOString().slice(0, 7);
}
function thisMonthLabel() {
  const [y, m] = thisMonth().split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function thisYear() { return new Date().getFullYear().toString(); }

// ── String helpers ────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function csvEsc(s) {
  const v = String(s == null ? '' : s);
  return '"' + v.replace(/"/g, '""') + '"';
}

// ── Input formatters ──────────────────────────────────────────────────────────
function formatRoomNumber(inp) {
  let v = inp.value;
  if (v.length > 0) v = v[0].toUpperCase() + v.slice(1);
  inp.value = v;
}
function capFirstChar(inp) {
  if (inp.value.length === 1) inp.value = inp.value.toUpperCase();
}
function formScrollNext(inp) {
  const field = inp.closest ? inp.closest('.field') : null;
  if (!field) return;
  const next = field.nextElementSibling;
  if (next) next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// Capitalize ASCII only — protects Urdu/Arabic names
function autoCapName(inp) {
  const v   = inp.value;
  const pos = inp.selectionStart;
  // Title-case: capitalize first letter of each word only, preserve rest
  inp.value = v.replace(/\b([a-zA-Z])/g, c => c.toUpperCase());
  inp.setSelectionRange(pos, pos);
}

// ── Debounce ──────────────────────────────────────────────────────────────────
function debounce(fn, delay) {
  delay = delay || 220;
  let t;
  return function () {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, delay);
  };
}

// ── Pagination ──────────────────────────────────────────────────────────────────
// Large lists (students/payments/rooms) only render one page of rows at a time so
// the browser isn't asked to build thousands of DOM nodes in one blocking pass.
const PAGE_SIZE = 50;

// Slice a filtered array down to the current page. `filter` is the module's filter
// state object (must have a numeric `.page`). Returns { slice, page, pages, total, from, to }.
function paginate(arr, filter) {
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let page = filter && filter.page ? filter.page : 1;
  if (page > pages) page = pages;
  if (page < 1) page = 1;
  if (filter) filter.page = page; // clamp back so the controls stay in sync
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  return { slice: arr.slice(start, end), page, pages, total, from: total ? start + 1 : 0, to: end };
}

// Jump to a page for a given filter object, then re-render that page (scrolled to top).
function gotoPage(filter, pageName, page) {
  filter.page = page;
  renderPage(pageName, true);
}

// ── Sorting ──────────────────────────────────────────────────────────────────────
// Sort a filtered array by filter.sortKey / filter.sortDir using a map of
// key → accessor(row). Returns a NEW array (or the same array if no active sort).
function applySort(arr, filter, accessors) {
  const key = filter && filter.sortKey;
  if (!key || !accessors || !accessors[key]) return arr;
  const acc = accessors[key];
  const dir = filter.sortDir === 'desc' ? -1 : 1;
  return arr.slice().sort(function (a, b) {
    let va = acc(a), vb = acc(b);
    const na = (va === null || va === undefined || va === '');
    const nb = (vb === null || vb === undefined || vb === '');
    if (na && nb) return 0;
    if (na) return 1;   // blanks always sink to the bottom
    if (nb) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
}

// Build CSV text from an array of row-arrays (first row = headers) and download it.
function downloadCSV(rows, filename) {
  if (!rows || rows.length <= 1) { if (typeof toast === 'function') toast('No data to export', 'error'); return; }
  const csv = rows.map(function (r) {
    return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM → Excel reads UTF-8
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  if (typeof toast === 'function') toast('Downloaded: ' + filename, 'success');
}

// Toggle the sort for a column: first click = asc, second = desc, then re-render.
function toggleSort(filter, pageName, key) {
  if (filter.sortKey === key) {
    filter.sortDir = filter.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    filter.sortKey = key;
    filter.sortDir = 'asc';
  }
  filter.page = 1;
  renderPage(pageName, true);
}

// Render a clickable sortable <th>. `filterName` is the GLOBAL var name of the
// filter object so inline onclick can reference it. `attrs` = extra th attributes.
function sortableTh(filter, filterName, pageName, key, label, attrs) {
  const active = filter.sortKey === key;
  const arrow = active ? (filter.sortDir === 'asc' ? '▲' : '▼') : '⇅';
  return '<th class="th-sortable' + (active ? ' sorted' : '') + '" ' + (attrs || '') +
    ' onclick="toggleSort(' + filterName + ',\'' + pageName + '\',\'' + key + '\')" title="Sort by ' + label + '">' +
    '<span class="th-sort-inner">' + label + '<span class="th-arrow">' + arrow + '</span></span></th>';
}

// Build the pager control bar. `filterName` is the GLOBAL variable name of the
// filter object (e.g. 'studentFilter') so inline onclick can reference it.
function renderPager(info, filterName, pageName) {
  if (info.pages <= 1) {
    return `<div class="pager"><span class="pager-info">${info.total} total</span></div>`;
  }
  const btn = (label, target, opts) => {
    opts = opts || {};
    if (opts.disabled) return `<button class="pager-btn" disabled>${label}</button>`;
    if (opts.active)   return `<button class="pager-btn active">${label}</button>`;
    return `<button class="pager-btn" onclick="gotoPage(${filterName},'${pageName}',${target})">${label}</button>`;
  };
  const { page, pages } = info;
  // Window of page numbers around the current page (max 5).
  let lo = Math.max(1, page - 2), hi = Math.min(pages, lo + 4);
  lo = Math.max(1, hi - 4);
  let nums = '';
  if (lo > 1) nums += btn('1', 1) + (lo > 2 ? '<span class="pager-gap">…</span>' : '');
  for (let i = lo; i <= hi; i++) nums += btn(String(i), i, { active: i === page });
  if (hi < pages) nums += (hi < pages - 1 ? '<span class="pager-gap">…</span>' : '') + btn(String(pages), pages);
  return `<div class="pager">
    <span class="pager-info">Showing ${info.from}–${info.to} of ${info.total}</span>
    <div class="pager-controls">
      ${btn('‹ Prev', page - 1, { disabled: page <= 1 })}
      ${nums}
      ${btn('Next ›', page + 1, { disabled: page >= pages })}
    </div>
  </div>`;
}

// ── Course autocomplete ───────────────────────────────────────────────────────
const COURSE_LIST = [
  // Medical
  'MBBS', 'BDS', 'Pharm-D', 'DPT (Physiotherapy)', 'B.Sc Nursing', 'BS Nursing',
  'BS Health Sciences', 'BS Biomedical Sciences', 'BS Microbiology', 'BS Biochemistry',
  'BS Biotechnology', 'BS Zoology', 'BS Botany', 'MDCAT Preparation', 'Post-MBBS Internship',
  // Engineering
  'BS Civil Engineering', 'BS Electrical Engineering', 'BS Mechanical Engineering',
  'BS Software Engineering', 'BS Computer Engineering', 'BS Electronics Engineering',
  'BS Chemical Engineering', 'BS Environmental Engineering', 'BS Industrial Engineering',
  // Computer & IT
  'BS Computer Science', 'BS Information Technology', 'BS Artificial Intelligence',
  'BS Data Science', 'BS Cyber Security', 'BS Networking', 'BS Game Development',
  'Diploma in IT', 'Web Development Course', 'Android Development Course',
  // Business & Finance
  'BBA', 'MBA', 'BS Commerce', 'B.Com', 'ACCA', 'CA Foundation', 'CMA', 'CFA',
  'BS Accounting & Finance', 'BS Economics', 'BS Banking & Finance',
  // Arts & Humanities
  'BS English Literature', 'BS Urdu', 'BS Islamic Studies', 'BS Psychology',
  'BS Sociology', 'BS Political Science', 'BS International Relations',
  'BS Mass Communication', 'BS Journalism', 'BS Fine Arts', 'BS Architecture',
  // Education
  'BS Education', 'B.Ed', 'ADE', 'M.Ed', 'BS Special Education',
  // Law
  'LLB', 'BS Law', 'Bar-at-Law',
  // Intermediate & Matric
  'FSc Pre-Medical', 'FSc Pre-Engineering', 'ICS', 'I.Com', 'FA', 'Matric (Science)',
  'Matric (Arts)', 'A-Levels', 'O-Levels',
  // Diploma & Short Courses
  'DAE Electrical', 'DAE Civil', 'DAE Mechanical', 'DAE Computer', 'DIT',
  'Diploma in English', 'IELTS Preparation', 'NTS Preparation', 'CSS Preparation',
  'Soft Skills Course', 'English Language Course', 'Graphic Design Course',
  'Digital Marketing Course', 'Content Writing Course'
];

function toggleOccField(val) {
  const custom = document.getElementById('f-tocccustom');
  const wrap   = document.getElementById('f-tocc-wrap');
  const main   = document.getElementById('f-tocc');
  if (val === 'other') {
    if (wrap)   wrap.style.display   = 'none';
    if (custom) { custom.style.display = 'block'; custom.style.marginTop = '0'; }
  } else {
    if (wrap)   wrap.style.display   = 'block';
    if (custom) custom.style.display = 'none';
    if (main)   main.placeholder = val === 'Student'
      ? 'Type course e.g. BS Computer Science…'
      : val === 'Job'      ? 'e.g. Software Engineer, Govt. Teacher…'
      : val === 'Business' ? 'e.g. Shop Owner, Contractor…'
      : 'Describe…';
  }
}

function courseAutocomplete(inp) {
  const val = inp.value.trim().toLowerCase();
  const box = document.getElementById('course-suggestions');
  if (!box) return;
  const matches = val.length === 0
    ? COURSE_LIST
    : COURSE_LIST.filter(c => c.toLowerCase().includes(val));
  if (!matches.length) { box.style.display = 'none'; return; }
  _renderCourseSuggestions(matches, val, -1);
  box.style.display = 'block';
}

function _renderCourseSuggestions(matches, val, activeIdx) {
  const box = document.getElementById('course-suggestions');
  if (!box) return;
  box.innerHTML = matches.slice(0, 12).map((c, i) => {
    const lo = val.toLowerCase();
    const hi = lo ? c.replace(
      new RegExp('(' + lo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
      '<b style="color:var(--gold2)">$1</b>'
    ) : escHtml(c);
    const active = i === activeIdx;
    return `<div class="cs-item${active ? ' cs-active' : ''}" data-idx="${i}" data-val="${c.replace(/"/g, '&quot;')}"
      onclick="pickCourse('${c.replace(/'/g, "\\'")}',this)"
      style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text);border-bottom:1px solid var(--border);${active ? 'background:var(--bg3);' : ''}"
      onmouseover="this.style.background='var(--bg3)'"
      onmouseout="this.style.background='${active ? 'var(--bg3)' : ''}'">${hi}</div>`;
  }).join('');
}

function pickCourse(val) {
  const inp = document.getElementById('f-tocc');
  if (inp) { inp.value = val; inp.focus(); }
  const box = document.getElementById('course-suggestions');
  if (box) box.style.display = 'none';
  setTimeout(() => {
    const wrap = document.getElementById('f-tocc-wrap');
    if (wrap) {
      const next = wrap.closest('.field') && wrap.closest('.field').nextElementSibling;
      if (next) next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 80);
}

function courseKeyNav(e) {
  const box = document.getElementById('course-suggestions');
  if (!box || box.style.display === 'none') return;
  const items = box.querySelectorAll('.cs-item');
  if (!items.length) return;
  let cur = Array.from(items).findIndex(el => el.classList.contains('cs-active'));
  if (e.key === 'ArrowDown') {
    e.preventDefault(); cur = (cur + 1) % items.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); cur = cur <= 0 ? items.length - 1 : cur - 1;
  } else if (e.key === 'Enter' && cur >= 0) {
    e.preventDefault(); pickCourse(items[cur].dataset.val); return;
  } else if (e.key === 'Escape') {
    box.style.display = 'none'; return;
  } else { return; }
  items.forEach((el, i) => {
    el.classList.toggle('cs-active', i === cur);
    el.style.background = i === cur ? 'var(--bg3)' : '';
  });
  if (items[cur]) items[cur].scrollIntoView({ block: 'nearest' });
}

// Centralized utility functions for key validation
function validateKeyFormat(key) {
  return /^HOSTEL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.toUpperCase().trim());
}

function validateKeyChecksum(key, secret) {
  try {
    const parts = key.toUpperCase().trim().split('-');
    const expPart = parts[1];
    const chk = parts[2] + parts[3];
    const expected = crypto.createHmac('sha256', secret)
      .update(expPart).digest('hex').toUpperCase().slice(0, 8);
    return chk === expected;
  } catch (e) {
    console.error('[DAMAM] Key checksum validation failed:', e.message);
    return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateKeyFormat, validateKeyChecksum };
}