/* ─── HOSTYLLO — CUSTOM TITLE BAR ────────────────────────────────────────────
   Renders the frameless window's own title bar: brand, File / View / Help
   menus, and the min / max / close controls. Every menu item and the window
   controls call window.titlebar (preload) → main, which runs the SAME actions
   as the native keyboard accelerators, so nothing behaves differently whether
   you click here or press the shortcut.

   Loaded on index.html (full menus) and license.html (Help only, via
   body[data-titlebar="minimal"]). If the preload bridge is missing (e.g. opened
   outside Electron) it renders nothing and adds no layout offset.
   ─────────────────────────────────────────────────────────────────────────── */
(async function initTitlebar() {
  var api = window.titlebar;
  if (!api || !document.body) return;              // no bridge → no bar, no offset
  if (document.getElementById('hz-titlebar')) return;   // already mounted

  var minimal = document.body.getAttribute('data-titlebar') === 'minimal';

  var dev = false;
  try { dev = await api.isDev(); } catch (_) { dev = false; }

  // ── Icons ──────────────────────────────────────────────────────────────────
  var I = {
    brand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>',
    min:   '<svg viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>',
    max:   '<svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    restore: '<svg viewBox="0 0 12 12"><rect x="3.6" y="1.6" width="6.4" height="6.4" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="1.6" y="3.6" width="6.4" height="6.4" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
    close: '<svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.25" fill="none"/></svg>'
  };

  // ── Menu model ─────────────────────────────────────────────────────────────
  var viewItems = [];
  if (dev) {
    viewItems.push(
      { label: 'Reload',          acc: 'Ctrl+R',       action: 'reload' },
      { label: 'Force Reload',    acc: 'Ctrl+Shift+R', action: 'forceReload' },
      { label: 'Developer Tools', acc: 'F12',          action: 'devTools' },
      { sep: true }
    );
  }
  viewItems.push(
    { label: 'Reset Zoom',  action: 'resetZoom' },
    { label: 'Zoom In',     acc: 'Ctrl +', action: 'zoomIn' },
    { label: 'Zoom Out',    acc: 'Ctrl −', action: 'zoomOut' },
    { sep: true },
    { label: 'Full Screen', acc: 'F11',   action: 'fullScreen' }
  );

  var helpMenu = { label: 'Help', items: [
    { label: 'About Hostyllo',    action: 'about' },
    { label: 'License Settings',  action: 'licenseSettings' },
    { label: 'Check for Updates', action: 'checkUpdates' },
    { label: 'License Info',      action: 'licenseInfo' }
  ]};

  var menus = minimal ? [helpMenu] : [
    { label: 'File', items: [
      { label: 'Export Backup…', acc: 'Ctrl+S', action: 'exportBackup' },
      { label: 'Import Backup…', acc: 'Ctrl+O', action: 'importBackup' },
      { sep: true },
      { label: 'Quit', acc: 'Ctrl+Q', action: 'quit' }
    ]},
    { label: 'View', items: viewItems },
    helpMenu
  ];

  // ── Build DOM ──────────────────────────────────────────────────────────────
  var bar = document.createElement('div');
  bar.id = 'hz-titlebar';

  var menusHtml = menus.map(function (m) {
    var itemsHtml = m.items.map(function (it) {
      if (it.sep) return '<hr>';
      var acc = it.acc ? '<span class="hz-acc">' + it.acc + '</span>' : '';
      return '<button type="button" data-action="' + it.action + '"><span>' + it.label + '</span>' + acc + '</button>';
    }).join('');
    return '<div class="hz-menu"><button type="button" class="hz-menu-btn">' + m.label + '</button>' +
           '<div class="hz-drop">' + itemsHtml + '</div></div>';
  }).join('');

  bar.innerHTML =
    '<div class="hz-tb-brand"><span class="hz-tb-logo">' + I.brand + '</span>' +
      '<span class="hz-tb-word">Hostyllo</span></div>' +
    '<div class="hz-tb-menus">' + menusHtml + '</div>' +
    '<div class="hz-tb-spacer"></div>' +
    '<div class="hz-tb-win">' +
      '<button type="button" class="hz-min"   title="Minimize" aria-label="Minimize">' + I.min + '</button>' +
      '<button type="button" class="hz-max"   title="Maximize" aria-label="Maximize">' + I.max + '</button>' +
      '<button type="button" class="hz-close" title="Close"    aria-label="Close">' + I.close + '</button>' +
    '</div>';

  document.body.insertAdjacentElement('afterbegin', bar);
  document.body.classList.add('has-titlebar');

  // ── Menu open/close ────────────────────────────────────────────────────────
  var openMenu = null;
  function closeMenus() {
    if (openMenu) { openMenu.classList.remove('hz-open'); openMenu = null; }
  }
  bar.querySelectorAll('.hz-menu').forEach(function (menuEl) {
    var btn = menuEl.querySelector('.hz-menu-btn');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openMenu === menuEl) { closeMenus(); return; }
      closeMenus();
      menuEl.classList.add('hz-open'); openMenu = menuEl;
    });
    // Hovering another menu while one is open switches to it (native-menu feel).
    btn.addEventListener('mouseenter', function () {
      if (openMenu && openMenu !== menuEl) {
        closeMenus(); menuEl.classList.add('hz-open'); openMenu = menuEl;
      }
    });
  });
  bar.querySelectorAll('.hz-drop button[data-action]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenus();
      api.menu(b.getAttribute('data-action'));
    });
  });
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });

  // ── Window controls ────────────────────────────────────────────────────────
  var maxBtn = bar.querySelector('.hz-max');
  bar.querySelector('.hz-min').addEventListener('click', function () { api.minimize(); });
  bar.querySelector('.hz-close').addEventListener('click', function () { api.close(); });
  maxBtn.addEventListener('click', function () { api.toggleMaximize(); });

  function paintMaxState(isMax) {
    maxBtn.innerHTML = isMax ? I.restore : I.max;
    maxBtn.title = isMax ? 'Restore' : 'Maximize';
    maxBtn.setAttribute('aria-label', isMax ? 'Restore' : 'Maximize');
  }
  try { api.isMaximized().then(paintMaxState); } catch (_) {}
  api.onMaximizeChange(paintMaxState);
})();
