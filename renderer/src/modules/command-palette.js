/* ─── HOSTIX — COMMAND PALETTE (Ctrl/Cmd + K) ───────────────────────────────
   Quick keyboard launcher: jump to any page, run an action, or open a student.
   Self-contained overlay (own container), global Ctrl+K toggle, keyboard nav.
   Depends on globals: navigate, showViewStudentModal, escHtml, DB, CUR_USER,
   and the various show* / export* action functions (guarded by typeof).
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

(function () {
  let _open = false, _sel = 0, _results = [];

  function _baseCommands() {
    const navs = [
      ['dashboard', 'Dashboard', '🏠'], ['rooms', 'Rooms', '🚪'], ['students', 'Students', '🎓'],
      ['payments', 'Finance / Payments', '💳'], ['expenses', 'Expenses', '📉'],
      ['cancellations', 'Cancellations', '📋'], ['reports', 'Reports', '📊'],
      ['issues', 'Complaints', '🛠'], ['activitylog', 'Activity Log', '🕑'],
      ['settings', 'Settings', '⚙️'], ['archive', 'Annual Archive', '🗄']
    ];
    const cmds = navs.map(function (n) {
      return { label: 'Go to ' + n[1], icon: n[2], kind: 'Navigate', run: function () { navigate(n[0]); } };
    });
    const act = function (label, icon, fn) {
      if (typeof window[fn] === 'function') cmds.push({ label: label, icon: icon, kind: 'Action', run: function () { window[fn](); } });
    };
    act('Add Student', '➕', 'showAddStudentModal');
    act('Add Room', '➕', 'showAddRoomModal');
    act('Add Payment', '➕', 'openAddPayment');
    act('Add Expense', '➕', 'showAddExpenseModal');
    act('Add Cancellation', '➕', 'showAddCancellationModal');
    act('Add Issue / Complaint', '➕', 'showAddIssueModal');
    act('Export Students CSV', '📥', 'exportStudentsCSV');
    act('Export Payments CSV', '📥', 'exportPaymentsCSV');
    act('Export Rooms CSV', '📥', 'exportRoomsCSV');
    if (typeof toggleTheme === 'function') cmds.push({ label: 'Toggle Dark / Light theme', icon: '🌓', kind: 'Action', run: function () { toggleTheme(); } });
    return cmds;
  }

  function _compute(q) {
    q = (q || '').trim().toLowerCase();
    let base = _baseCommands();
    if (q) base = base.filter(function (c) { return c.label.toLowerCase().indexOf(q) !== -1; });
    let students = [];
    if (q && typeof DB !== 'undefined' && DB.students) {
      students = DB.students.filter(function (s) {
        return (s.name || '').toLowerCase().indexOf(q) !== -1 || String(s.id).toLowerCase().indexOf(q) !== -1;
      }).slice(0, 6).map(function (s) {
        const r = (DB.rooms || []).find(function (x) { return x.id === s.roomId; });
        return {
          label: s.name || ('#' + s.id), sub: 'Student' + (r ? ' · Room #' + r.number : ''),
          icon: '🎓', kind: 'Open', run: function () { showViewStudentModal(s.id); }
        };
      });
    }
    return base.concat(students);
  }

  function _render() {
    const list = document.getElementById('cmdk-list');
    if (!list) return;
    if (!_results.length) { list.innerHTML = '<div class="cmdk-empty">No matches</div>'; return; }
    list.innerHTML = _results.map(function (r, i) {
      return '<div class="cmdk-item' + (i === _sel ? ' active' : '') + '" onmousemove="window._cmdkHover(' + i + ')" onclick="window._cmdkRun(' + i + ')">' +
        '<span class="cmdk-ic">' + r.icon + '</span>' +
        '<span class="cmdk-lbl">' + escHtml(r.label) + (r.sub ? '<span class="cmdk-sub">' + escHtml(r.sub) + '</span>' : '') + '</span>' +
        '<span class="cmdk-kind">' + r.kind + '</span></div>';
    }).join('');
    const a = list.querySelector('.cmdk-item.active');
    if (a) a.scrollIntoView({ block: 'nearest' });
  }

  function _update() {
    const inp = document.getElementById('cmdk-input');
    _results = _compute(inp ? inp.value : '');
    _sel = 0;
    _render();
  }

  function openPalette() {
    if (_open) return;
    if (typeof CUR_USER === 'undefined' || !CUR_USER) return; // only when logged in
    _open = true;
    const el = document.createElement('div');
    el.id = 'cmdk-overlay';
    el.className = 'cmdk-overlay';
    el.innerHTML =
      '<div class="cmdk-box" onclick="event.stopPropagation()">' +
      '<div class="cmdk-search"><span class="cmdk-search-ic">🔍</span>' +
      '<input id="cmdk-input" class="cmdk-input" placeholder="Search actions, pages, students…" autocomplete="off" spellcheck="false"></div>' +
      '<div id="cmdk-list" class="cmdk-list"></div>' +
      '<div class="cmdk-foot"><span>↑ ↓ navigate</span><span>↵ open</span><span>esc close</span></div>' +
      '</div>';
    el.onclick = closePalette;
    document.body.appendChild(el);
    const inp = document.getElementById('cmdk-input');
    inp.addEventListener('input', _update);
    inp.addEventListener('keydown', _onInputKey);
    _update();
    setTimeout(function () { inp.focus(); }, 10);
  }

  function closePalette() {
    _open = false;
    const el = document.getElementById('cmdk-overlay');
    if (el) el.remove();
  }

  function _onInputKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); _sel = Math.min(_sel + 1, _results.length - 1); _render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _sel = Math.max(_sel - 1, 0); _render(); }
    else if (e.key === 'Enter') { e.preventDefault(); _run(_sel); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  }

  function _run(i) {
    const r = _results[i];
    if (!r) return;
    closePalette();
    setTimeout(function () { try { r.run(); } catch (err) { console.error('[cmdk] run failed:', err); } }, 30);
  }

  window._cmdkRun = _run;
  window._cmdkHover = function (i) { if (i !== _sel) { _sel = i; _render(); } };
  window.openCommandPalette = openPalette;

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (_open) closePalette(); else openPalette();
    }
  });
})();
