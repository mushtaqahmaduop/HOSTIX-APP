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
      if (it.sep) return '<hr role="separator">';
      var acc = it.acc ? '<span class="hz-acc">' + it.acc + '</span>' : '';
      // tabindex="-1": items are reached with the arrow keys once the menu is
      // open, not by tabbing through every hidden item on the page.
      return '<button type="button" role="menuitem" tabindex="-1" data-action="' + it.action +
             '"><span>' + it.label + '</span>' + acc + '</button>';
    }).join('');
    // Mnemonic = the label's first letter; File / View / Help are unique on it.
    // Underlined only while Alt is held, which is what Windows does.
    var mn  = m.label.charAt(0);
    var lbl = '<u>' + mn + '</u>' + m.label.slice(1);
    return '<div class="hz-menu" data-mn="' + mn.toLowerCase() + '">' +
             '<button type="button" class="hz-menu-btn" aria-haspopup="true" aria-expanded="false">' +
               lbl + '</button>' +
             '<div class="hz-drop" role="menu">' + itemsHtml + '</div>' +
           '</div>';
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

  // ── Menu open/close, and the keyboard access frame:false took away ───────
  // Dropping the native menu bar dropped Alt+F, the arrow keys and Escape with
  // it. The accelerators in main.js survived (Ctrl+S/O/Q, F11, zoom) but the bar
  // itself was mouse-only, so Export Backup and About had no keyboard route at
  // all. What follows puts the menu-bar interaction model back on top of it.
  var menuEls  = Array.prototype.slice.call(bar.querySelectorAll('.hz-menu'));
  var openMenu = null;

  function itemsOf(menuEl) {
    return Array.prototype.slice.call(menuEl.querySelectorAll('.hz-drop button[data-action]'));
  }
  function btnOf(menuEl) { return menuEl.querySelector('.hz-menu-btn'); }

  function openMenuEl(menuEl, focusFirst) {
    if (openMenu && openMenu !== menuEl) {
      openMenu.classList.remove('hz-open');
      btnOf(openMenu).setAttribute('aria-expanded', 'false');
    }
    menuEl.classList.add('hz-open');
    btnOf(menuEl).setAttribute('aria-expanded', 'true');
    openMenu = menuEl;
    if (focusFirst) { var it = itemsOf(menuEl)[0]; if (it) it.focus(); }
  }

  // returnFocus is opt-in: the document click handler must NOT pull focus back
  // into the bar every time the user clicks somewhere else in the app.
  function closeMenus(returnFocus) {
    if (openMenu) {
      var btn = btnOf(openMenu);
      openMenu.classList.remove('hz-open');
      btn.setAttribute('aria-expanded', 'false');
      openMenu = null;
      if (returnFocus === true) btn.focus();
    }
    hideHints();
  }

  /** Step to the menu `dir` places away, wrapping — ArrowLeft/Right along the bar. */
  function stepMenu(fromEl, dir, focusFirst) {
    var i = menuEls.indexOf(fromEl);
    if (i < 0 || menuEls.length < 2) return;
    var next = menuEls[(i + dir + menuEls.length) % menuEls.length];
    openMenuEl(next, focusFirst);
    if (!focusFirst) btnOf(next).focus();
  }

  menuEls.forEach(function (menuEl) {
    var btn = btnOf(menuEl);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openMenu === menuEl) { closeMenus(false); return; }
      openMenuEl(menuEl, false);
    });
    // Hovering another menu while one is open switches to it (native-menu feel).
    btn.addEventListener('mouseenter', function () {
      if (openMenu && openMenu !== menuEl) openMenuEl(menuEl, false);
    });
    // On the menu button: Down/Up drops the panel with an item focused, the
    // side arrows move along the bar. Enter/Space are the button's own click.
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenuEl(menuEl, true);
        if (e.key === 'ArrowUp') {
          var last = itemsOf(menuEl);
          if (last.length) last[last.length - 1].focus();
        }
      } else if (e.key === 'ArrowRight') { e.preventDefault(); stepMenu(menuEl,  1, false); }
      else if (e.key === 'ArrowLeft')    { e.preventDefault(); stepMenu(menuEl, -1, false); }
      // Escape is deliberately absent here and below: the document listener
      // handles it in the capture phase and stops propagation, so a branch on
      // the element would be dead code that reads like a second implementation.
    });

    // Inside the panel: the standard menu keys. Enter and Space already fire a
    // <button>'s click, which the handler below turns into the action.
    var list = itemsOf(menuEl);
    list.forEach(function (item, idx) {
      item.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown')       { e.preventDefault(); list[(idx + 1) % list.length].focus(); }
        else if (e.key === 'ArrowUp')    { e.preventDefault(); list[(idx - 1 + list.length) % list.length].focus(); }
        else if (e.key === 'Home')       { e.preventDefault(); list[0].focus(); }
        else if (e.key === 'End')        { e.preventDefault(); list[list.length - 1].focus(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); stepMenu(menuEl,  1, true); }
        else if (e.key === 'ArrowLeft')  { e.preventDefault(); stepMenu(menuEl, -1, true); }
        else if (e.key === 'Tab')        { closeMenus(false); }   // let Tab leave the bar
      });
    });
  });

  bar.querySelectorAll('.hz-drop button[data-action]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenus(false);
      api.menu(b.getAttribute('data-action'));
    });
  });
  document.addEventListener('click', function () { closeMenus(false); });

  // ── Alt: mnemonic hints, and Alt+F / Alt+V / Alt+H to open a menu ────────
  function showHints() { document.body.classList.add('hz-alt-hints'); }
  function hideHints() { document.body.classList.remove('hz-alt-hints'); }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      // Only swallow Escape while a menu is actually open — the app uses it to
      // close modals, and stealing it here would strand a warden in a dialog.
      if (openMenu) { e.stopPropagation(); closeMenus(true); }
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'Alt') { showHints(); return; }   // holding Alt reveals them
    if (!e.altKey) return;
    // Single letters only: Alt+F4, Alt+Tab and the rest belong to the OS.
    var k = (e.key || '').toLowerCase();
    if (k.length !== 1) return;
    for (var i = 0; i < menuEls.length; i++) {
      if (menuEls[i].getAttribute('data-mn') === k) {
        e.preventDefault();
        showHints();
        openMenuEl(menuEls[i], true);
        return;
      }
    }
  }, true);
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Alt' && !openMenu) hideHints();
  });
  // Alt-Tabbing away with the hints up left them underlined until the next
  // keystroke, and an open menu floating over an unfocused window.
  window.addEventListener('blur', function () { closeMenus(false); });

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
