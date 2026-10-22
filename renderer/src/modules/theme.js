/* ─── HOSTYLLO — THEME MODULE ─────────────────────────────────────────────────
   Loaded by index.html after storage.js
   Contains: toggleTheme, updateThemeUI, applySavedSidebar, initTheme
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ── THEME SYSTEM ─────────────────────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.add('no-transition');
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  updateThemeUI(isLight);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      document.body.classList.remove('no-transition');
    });
  });
  // The light-theme class is already toggled above, so the CSS tokens the
  // charts read (--border for the grid lines, --green etc.) are live now. A
  // 50ms setTimeout left the canvas grid painted in the old theme for a beat
  // after everything else had switched — redraw on the next frame instead so
  // the grid recolours in step with the rest of the UI.
  /* EVERY CANVAS IN THE APP, not only the dashboard's two (owner, 2026-09-23:
     "remove the grid lines bug in the financial performance card in both
     light/dark mode").

     The Reports page draws four — the financial bars, two rings and the
     collection gauge — and none of them was in this list, so switching theme
     on that page left the grid painted from the OTHER theme's `--border`:
     #E6DFD8 hairlines on a near-black card, which is the bright white grid
     cutting through the bars. The bars and the ring colours were stale with
     it; it looked like a grid bug because the grid is what shows it.

     Each call is guarded, so a page that has not defined its drawer is
     skipped rather than throwing — this runs on every toggle, everywhere. */
  requestAnimationFrame(function() {
    if (typeof drawTrendChart === 'function') drawTrendChart();
    if (typeof drawRoomDonut === 'function') drawRoomDonut();
    if (typeof drawReportCharts === 'function') drawReportCharts();
  });
}
function updateThemeUI(isLight) {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerHTML = isLight ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /> <path d="M12 2v2" /> <path d="M12 20v2" /> <path d="m4.93 4.93 1.41 1.41" /> <path d="m17.66 17.66 1.41 1.41" /> <path d="M2 12h2" /> <path d="M20 12h2" /> <path d="m6.34 17.66-1.41 1.41" /> <path d="m19.07 4.93-1.41 1.41" /></svg>` : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg>`;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
}
// Apply theme immediately.
//
// LIGHT IS THE DEFAULT. The premium enterprise design is a light workspace —
// navy rail, #F4F7FC ground, white cards — so an install with no stored
// preference opens in it. Dark is not going anywhere: it is a click of the
// header toggle, and a warden who has chosen it keeps it, because the check
// below reads the SAVED value first and only falls back when there is none.
(function initTheme() {
  const saved = localStorage.getItem('theme');
  const light = saved ? saved === 'light' : true;
  if (light) {
    document.body.classList.add('light-theme');
    setTimeout(() => updateThemeUI(true), 50);
  }
})();

// ── COURSE AUTOCOMPLETE — defined in src/utils.js (do not redeclare here)

// NOTE: the runtime accent-colour system (applyThemeColor / applySavedTheme,
// which drove the old --gold* variables from DB.settings.accentColor) was
// removed in Phase 1 §5.5b. The app now uses a single static violet --accent
// token set (tokens.css). accentColor in existing client DBs is ignored.

function applySavedSidebar() {
  const w = DB.settings.sidebarWidth;
  if(w && w!==260) {
    document.documentElement.style.setProperty('--sidebar-w', w+'px');
    const main=document.getElementById('main'); if(main) main.style.marginLeft=w+'px';
  }
}

var _hdrDate = document.getElementById('hdr-date');
if(_hdrDate) _hdrDate.textContent = new Date().toLocaleDateString('en-PK',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});