/* ─── HOSTIX — THEME MODULE ─────────────────────────────────────────────────
   Loaded by index.html after storage.js
   Contains: toggleTheme, updateThemeUI, applyThemeColor, applySavedTheme,
             applySavedSidebar, initTheme
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ── THEME SYSTEM ─────────────────────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  updateThemeUI(isLight);
  // Re-draw charts if needed for contrast
  if (typeof drawTrendChart === 'function') drawTrendChart();
}
function updateThemeUI(isLight) {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerHTML = isLight ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /> <path d="M12 2v2" /> <path d="M12 20v2" /> <path d="m4.93 4.93 1.41 1.41" /> <path d="m17.66 17.66 1.41 1.41" /> <path d="M2 12h2" /> <path d="M20 12h2" /> <path d="m6.34 17.66-1.41 1.41" /> <path d="m19.07 4.93-1.41 1.41" /></svg>` : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg>`;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
}
// Apply theme immediately
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.add('light-theme');
    setTimeout(() => updateThemeUI(true), 50);
  }
})();

// ── COURSE AUTOCOMPLETE — defined in src/utils.js (do not redeclare here)

async function applyThemeColor(hex) {
  DB.settings.accentColor = hex;
  // FIX #12: Derive --gold2 as a lighter tint (not identical to --gold) for proper text contrast
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  // Lighten by blending toward white by ~30%
  const lighten = (ch) => Math.round(Math.min(255, ch + (255 - ch) * 0.30));
  const gold2Hex = '#' + [r,g,b].map(c => lighten(c).toString(16).padStart(2,'0')).join('');
  document.documentElement.style.setProperty('--gold', hex);
  document.documentElement.style.setProperty('--gold2', gold2Hex);
  document.documentElement.style.setProperty('--gold3', '#' + [r,g,b].map(c => Math.round(Math.min(255, c + (255-c)*0.55)).toString(16).padStart(2,'0')).join(''));
  document.documentElement.style.setProperty('--gold-dim', `rgba(${r},${g},${b},0.15)`);
  document.documentElement.style.setProperty('--shadow-gold', `0 4px 20px rgba(${r},${g},${b},0.25)`);
  await saveDB();
  const lbl=document.getElementById('accent-hex-label'); if(lbl) lbl.textContent=hex;
  renderPage('settings');
  toast('Theme color updated','success');
}

function applySavedTheme() {
  var hex = DB.settings.accentColor || '#e05252';
  if (!hex || hex.length !== 7) return;
  var r = parseInt(hex.slice(1,3), 16);
  var g = parseInt(hex.slice(3,5), 16);
  var b = parseInt(hex.slice(5,7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return;
  var lighten = function(ch) { return Math.round(Math.min(255, ch + (255 - ch) * 0.30)); };
  var gold2Hex = '#' + [r,g,b].map(function(c){ return lighten(c).toString(16).padStart(2,'0'); }).join('');
  document.documentElement.style.setProperty('--gold', hex);
  document.documentElement.style.setProperty('--gold2', gold2Hex);
}

function applySavedSidebar() {
  const w = DB.settings.sidebarWidth;
  if(w && w!==260) {
    document.documentElement.style.setProperty('--sidebar-w', w+'px');
    const main=document.getElementById('main'); if(main) main.style.marginLeft=w+'px';
  }
}

document.getElementById('hdr-date').textContent = new Date().toLocaleDateString('en-PK',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});