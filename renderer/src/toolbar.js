/* ─── HOSTYLLO — SHARED LIST TOOLBAR ─────────────────────────────────────────
   Built 2026-09-08 from the owner's bug list.

   WHY THIS FILE EXISTS
   --------------------
   Six list screens — Students, Payments, Rooms, Expenses, Cancellations and
   Complaints — each grew their own toolbar, and by 8 Sep every one of them
   carried its own copy of the same three controls. Six copies is why the same
   bug had to be reported six times:

     · two export buttons side by side, where the owner asked for one Export
       control with the formats inside it;
     · a month filter on some screens, a date range on others, a room
       dropdown on most, and no agreement about what a fresh visit shows;
     · nothing that clears the whole bar at once.

   The controls below are the one implementation. Each takes the SCREEN'S OWN
   button class, so a shared control still looks native to the toolbar it sits
   in — this file unifies behaviour, not appearance, because the five toolbars
   are deliberately different sizes (Students runs 34px, Payments 40px) and
   flattening that is a redesign, not a bug fix.

   Loaded as a classic script after `utils.js` and before the modules, so
   every screen can call these while rendering.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── The open menu, if any ─────────────────────────────────────────────────
   One at a time, closed by the next click anywhere. A menu that survives a
   click elsewhere is the kind of thing a warden closes by reloading. */
let _tbOpenMenu = null;

function tbCloseMenus() {
  if (!_tbOpenMenu) return;
  const el = document.getElementById(_tbOpenMenu);
  if (el) el.classList.remove('is-open');
  _tbOpenMenu = null;
}

function tbToggleMenu(id, ev) {
  if (ev) ev.stopPropagation();
  const el = document.getElementById(id);
  const wasOpen = _tbOpenMenu === id;
  tbCloseMenus();
  if (wasOpen || !el) return;
  el.classList.add('is-open');
  _tbOpenMenu = id;
}

document.addEventListener('click', tbCloseMenus);
/* Escape closes it too. Capture phase, because app.js:180 binds Escape on the
   bubble phase to close the student panel, and a menu opened over that panel
   must close before the panel does. */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && _tbOpenMenu) { tbCloseMenus(); e.stopPropagation(); }
}, true);

/* ══ EXPORT ════════════════════════════════════════════════════════════════
   One control, both formats inside it (owner, 2026-09-08). Every screen used
   to spend two toolbar slots on this, and on a 1366 window those two slots
   are what pushed the bar onto a second row.

   `.xlsx`, and the menu says so. The label used to read "Excel" on a button
   that once wrote CSV and now writes a real workbook — the format is the
   thing a warden is choosing between, so it is what the row states.

   @param {object} o
   @param {string} o.id     unique per screen — two menus with one id share state
   @param {string} o.excel  the call that writes the workbook
   @param {string} o.pdf    the call that writes the document
   @param {string} [o.cls]  the screen's own button class
   @param {string} [o.label]
*/
function tbExport(o) {
  const cls = o.cls || 'lk-btn';
  const mid = o.id + '-menu';
  return `<div class="tb-wrap">
    <button class="${cls}" id="${o.id}" aria-haspopup="menu" aria-controls="${mid}"
            onclick="tbToggleMenu('${mid}',event)" title="Export the current list">
      ${icon('download','xs')} ${escHtml(o.label || 'Export')} ${icon('chevronDown','xs')}
    </button>
    <div class="tb-menu" id="${mid}" role="menu">
      <button class="tb-menu__i" role="menuitem" onclick="tbCloseMenus();${o.excel}">
        ${icon('fileSpreadsheet','xs')}
        <span><b>Excel workbook</b><i>.xlsx — figures stay numbers</i></span>
      </button>
      <button class="tb-menu__i" role="menuitem" onclick="tbCloseMenus();${o.pdf}">
        ${icon('print','xs')}
        <span><b>PDF document</b><i>A4, ready to print</i></span>
      </button>
    </div>
  </div>`;
}

/* ══ MONTH ═════════════════════════════════════════════════════════════════
   One month picker for every screen that scopes by month, replacing the room
   dropdown and the From/To range the owner asked to remove. Month AND year in
   one control: the list carries every month the data touches plus a whole-year
   entry for each year, so "all of 2026" needs no second control.

   Defaults to the current month — and stays defaulted to it, because
   `FILTER_REGISTRY` re-evaluates `thisMonth()` on every reset rather than
   capturing it when the module loaded.

   @param {string[]} keys  'YYYY-MM' keys the data actually contains
   @param {object} o  {value, onchange, cls, all}  `all` adds an "All months" row
*/
function tbMonthOptions(keys) {
  const months = new Set([thisMonth()]);
  (keys || []).forEach(k => { if (k) months.add(String(k).slice(0, 7)); });
  const years = new Set([...months].map(m => m.slice(0, 4)));
  return [...months, ...years].sort().reverse();
}

function tbMonthLabel(key) {
  if (!key) return 'All months';
  if (/^\d{4}$/.test(String(key))) return 'All of ' + key;
  return monthLabel(key) || String(key);
}

function tbMonth(keys, o) {
  o = o || {};
  const cls = o.cls || 'lk-select';
  const cur = o.value == null ? thisMonth() : o.value;
  const opts = tbMonthOptions(keys);
  const isDefault = String(cur) === thisMonth();
  return `<select class="${cls}${isDefault ? '' : ' is-set'}" title="Show one month, or a whole year"
                  onchange="${o.onchange}">
    ${o.all ? `<option value="" ${!cur ? 'selected' : ''}>All months</option>` : ''}
    ${opts.map(k => `<option value="${escHtml(k)}" ${String(cur) === k ? 'selected' : ''}>${escHtml(tbMonthLabel(k))}</option>`).join('')}
  </select>`;
}

/* ══ CLEAR ═════════════════════════════════════════════════════════════════
   One button that puts the whole bar back where a fresh visit would leave it,
   defaults included — so clearing Payments in October still leaves October
   selected, not "All months". Shown only when something is actually set,
   because a Clear button that is always there stops meaning anything.

   Reads the same registry `navigate()` resets from, so a filter added to a
   screen tomorrow is covered by both without being mentioned in either.
*/
function tbClear(page, o) {
  o = o || {};
  if (typeof filtersAreSet !== 'function' || !filtersAreSet(page)) return '';
  return `<button class="${o.cls || 'lk-btn'} tb-clear" onclick="tbClearAll('${page}')"
                  title="Clear every filter and search on this page">
    ${icon('close','xs')} Clear all
  </button>`;
}

function tbClearAll(page) {
  resetFilters(page);
  renderPage(page);
}

/* ══ SEARCH CLEAR ══════════════════════════════════════════════════════════
   Every list screen's search box is an `.lk-sin`, and none of them could be
   emptied without selecting the text and deleting it. The toolbar's "Clear all"
   was the nearest thing, and it was the wrong thing twice over: it lived at the
   far end of the bar rather than in the field, and it reset every filter on the
   page when what you wanted was to stop searching. So the × goes IN the box, on
   all six screens, and Clear all is gone (owner, 2026-09-09).

   Visibility is CSS, not script: `.lk-sin:placeholder-shown + .lk-sx` hides it
   while the field is empty, which is live as you type and cannot fall out of
   step with a debounced re-render the way a JS toggle would. It works because
   every one of the six has a placeholder — a search box without one would show
   a × over an empty field, so keep the placeholders.                         */
function lkSearchX(inputId, filterVar, page) {
  return `<button type="button" class="lk-sx" tabindex="-1" title="Clear search"
    aria-label="Clear search"
    onclick="lkClearSearch('${inputId}',${filterVar},'${page}')">${icon('close','xs')}</button>`;
}

/* `filter` is the OBJECT, not its name. Every screen declares its filter with
   `let`, which does NOT put it on `window` — so the first cut looked up
   window['studentFilter'], found nothing, emptied the input and left the filter
   holding the old search, which the next render put straight back into the box.
   An inline handler is evaluated with the global lexical scope in view, so the
   identifier resolves where a property lookup could not. */
function lkClearSearch(inputId, filter, page) {
  const f = filter;
  if (f) { f.search = ''; if ('page' in f) f.page = 1; }
  const el = /** @type {HTMLInputElement|null} */ (document.getElementById(inputId));
  if (el) el.value = '';
  renderPage(page);
  /* Put the cursor back where it was. Clearing a search and losing the field is
     how you end up typing the next query into the page behind it. */
  const back = document.getElementById(inputId);
  if (back) back.focus();
}

/* ══ ROW ACTIONS ═══════════════════════════════════════════════════════════
   `items` is a list of { label, svg, on, danger } and the literal string 'sep'.
   The menu is appended to <body> and positioned from the button's viewport
   rect, so it escapes the table's horizontal scroll; it flips above the button
   when there is no room below.                                              */
let _lkMenuBtn = null;

/* THREE DOTS, NO WORD (owner, 2026-09-09: "the action buttons should be inside
   3dots without actions letters"). The words that matter are on the menu ITEMS,
   which is where someone who opens it needs them; the word on the button cost
   ~46px on every row of every table that uses this. The accessible name still
   carries the whole sentence, so a screen reader is not reading "button". */
function lkKebab(onclick, label) {
  return `<button class="lk-kebab" onclick="${onclick}" aria-haspopup="menu"
      title="Actions" aria-label="${escHtml(label || 'Actions')}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
      </button>`;
}

function lkRowMenu(btn, items) {
  /* A SECOND CLICK ON THE SAME ⋮ CLOSES IT (owner, 2026-09-14). This used to
     close and reopen in one step, so a menu could not be put away the way it
     was taken out. */
  const wasOpen = _lkMenuBtn === btn && !!document.getElementById('lk-rmenu');
  lkCloseRowMenu();
  if (wasOpen) return;
  const el = document.createElement('div');
  el.className = 'lk-rmenu';
  el.id = 'lk-rmenu';
  el.setAttribute('role', 'menu');
  el.innerHTML = items.map(function (it) {
    if (it === 'sep') return '<div class="lk-rmenu__sep"></div>';
    return '<button role="menuitem"' + (it.danger ? ' class="is-danger"' : '')
      + ' onclick="lkCloseRowMenu();' + it.on + '">' + (it.svg || '') + escHtml(it.label) + '</button>';
  }).join('');
  document.body.appendChild(el);

  const r = btn.getBoundingClientRect();
  const h = el.offsetHeight || 132;
  const below = window.innerHeight - r.bottom;
  el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8)) + 'px';
  el.style.top  = (below < h + 12 ? r.top - h - 6 : r.bottom + 6) + 'px';
  btn.classList.add('is-on');
  _lkMenuBtn = btn;
}

function lkCloseRowMenu() {
  const m = document.getElementById('lk-rmenu');
  if (m) m.remove();
  document.querySelectorAll('.lk-kebab.is-on, .stu-kebab.is-on').forEach(function (b) { b.classList.remove('is-on'); });
  _lkMenuBtn = null;
}

/* One document listener for every screen that draws a menu. Capture phase, so
   a click on a row underneath closes the menu before the row's own handler
   opens a panel behind it. */
document.addEventListener('mousedown', function (e) {
  const m = document.getElementById('lk-rmenu');
  if (!m) return;
  const t = /** @type {Node} */ (e.target);
  if (m.contains(t) || (_lkMenuBtn && _lkMenuBtn.contains(t))) return;
  lkCloseRowMenu();
}, true);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lkCloseRowMenu(); });
window.addEventListener('resize', lkCloseRowMenu);
