/* ─── HOSTIX — SHARED SVG ICON SYSTEM ──────────────────────────────────────
   Offline-safe filled SVG icons. No CDN. No emoji fallback needed.
   Sized via CSS utility classes defined in style.css:
     .icon    → --icon-md (20px)  default
     .icon-xs → --icon-xs (14px)
     .icon-sm → --icon-sm (16px)
     .icon-lg → --icon-lg (24px)
     .icon-xl → --icon-xl (32px)

   Usage:
     icon('check')          → <svg class="icon" ...>
     icon('warning', 'sm')  → <svg class="icon icon-sm" ...>
     icon('trash', 'xs')    → <svg class="icon icon-xs" ...>
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

const _ICON_SVG = {
  // ── Navigation & layout ────────────────────────────────────────────────────
  home:      '<path d="m21.71 9.29-9-9a1 1 0 0 0-1.42 0l-9 9a1 1 0 0 0 0 1.42L3 11.41V20a2 2 0 0 0 2 2h4a1 1 0 0 0 1-1v-5h4v5a1 1 0 0 0 1 1h4a2 2 0 0 0 2-2v-8.59l.71-.7a1 1 0 0 0 0-1.42Z"/>',
  menu:      '<path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  settings:  '<path d="M19.14 12.94a7 7 0 0 0 .06-1 7 7 0 0 0-.07-.94l2-1.56a.5.5 0 0 0 .12-.63l-1.89-3.27a.5.5 0 0 0-.61-.22l-2.36.95a7 7 0 0 0-1.61-.94l-.36-2.5A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.36 2.5a7.06 7.06 0 0 0-1.61.94l-2.36-.95a.5.5 0 0 0-.61.22L2.68 8.4a.49.49 0 0 0 .12.63l2 1.56a7.15 7.15 0 0 0 0 1.88l-2 1.56a.49.49 0 0 0-.12.63l1.89 3.27a.5.5 0 0 0 .61.22l2.36-.95a7 7 0 0 0 1.61.94l.36 2.5A.49.49 0 0 0 10 22h4a.49.49 0 0 0 .49-.42l.36-2.5a7 7 0 0 0 1.61-.94l2.36.95a.5.5 0 0 0 .61-.22l1.89-3.27a.49.49 0 0 0-.12-.63ZM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Z"/>',
  logout:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  // ── People ─────────────────────────────────────────────────────────────────
  student:   '<path d="M11.55 2.19a1 1 0 0 1 .9 0l9.5 4.75a1 1 0 0 1 0 1.79l-2.45 1.22V14a1 1 0 0 1-.4.8c-.13.1-3.18 2.45-7.1 2.45s-7-2.35-7.1-2.45A1 1 0 0 1 4.5 14v-4.05L3 9.2v3.55a1 1 0 0 1-2 0V7.75a1 1 0 0 1 .55-.89ZM6.5 10.18V13.5c.74.46 2.78 1.75 5.5 1.75s4.76-1.29 5.5-1.75v-3.32l-5.05 2.52a1 1 0 0 1-.9 0Z"/><path d="M12 19c-3.31 0-6-1.16-6-2.6a1 1 0 0 1 2 0c0 .14.96.6 4 .6s4-.46 4-.6a1 1 0 0 1 2 0c0 1.44-2.69 2.6-6 2.6Z"/>',
  person:    '<path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 1.79-8 4v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.21-3.58-4-8-4Z"/>',
  warden:    '<path d="M12 2a5 5 0 1 0 5 5 5 5 0 0 0-5-5Zm0 8a3 3 0 1 1 3-3 3 3 0 0 1-3 3Zm9 11v-1a7 7 0 0 0-7-7h-4a7 7 0 0 0-7 7v1h2v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1Z"/>',
  // ── Rooms & property ───────────────────────────────────────────────────────
  bed:       '<path d="M19 7h-7a3 3 0 0 0-3 3v3H5V8a1 1 0 0 0-2 0v9a1 1 0 0 0 2 0v-2h14v2a1 1 0 0 0 2 0v-6a4 4 0 0 0-4-4ZM7 9a2 2 0 1 1 2 2 2 2 0 0 1-2-2Z"/>',
  building:  '<path d="M19 2H9a3 3 0 0 0-3 3v4H5a3 3 0 0 0-3 3v9a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a3 3 0 0 0-3-3ZM8 20v-3h4v3Zm12 0h-6v-4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v4H4v-8a1 1 0 0 1 1-1h14Zm0-11H8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1Zm-9 2h2v2h-2Zm4 0h2v2h-2Zm-4-4h2v2h-2Zm4 0h2v2h-2Z"/>',
  key:       '<path d="M21.41 8.59 15.41 2.59a2 2 0 0 0-2.82 0L11 4.18a1 1 0 0 0 0 1.42l7.4 7.4a1 1 0 0 0 1.42 0l1.59-1.59a2 2 0 0 0 0-2.82ZM9.5 11.5a4 4 0 0 0-4 .89l-3.21 3.2a1 1 0 0 0-.29.7v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 .92-.62l.5-1.21A4 4 0 0 0 9.5 11.5Z"/>',
  bath:      '<path d="M19 9V6a3 3 0 0 0-5.62-1.45A1 1 0 1 0 15.1 5.6 1 1 0 0 1 17 6v3H4a1 1 0 0 0-1 1v2a5 5 0 0 0 3 4.58V20a1 1 0 0 0 2 0v-1h8v1a1 1 0 0 0 2 0v-3.42A5 5 0 0 0 21 12v-2a1 1 0 0 0-1-1Z"/>',
  // ── Finance ────────────────────────────────────────────────────────────────
  money:     '<path d="M21 7H6a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-3 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM6 5h13a1 1 0 0 0 0-2H6a6 6 0 0 0-6 6v6a6 6 0 0 0 6 6h14a2 2 0 0 0 2-2v-1a1 1 0 0 0-2 0v1H6a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Z"/>',
  card:      '<path d="M20 4H4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3ZM3 9h18V8H3Zm14 6h-3a1 1 0 0 1 0-2h3a1 1 0 0 1 0 2Z"/>',
  receipt:   '<path d="M19 3H5a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V5a2 2 0 0 0-2-2ZM8 11h8a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2Zm0-4h8a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2Z"/>',
  expense:   '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/>',
  // ── Status indicators ──────────────────────────────────────────────────────
  check:     '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.71 8.71-6 6a1 1 0 0 1-1.42 0l-3-3a1 1 0 1 1 1.42-1.42L11 14.59l5.29-5.3a1 1 0 0 1 1.42 1.42Z"/>',
  checkmark: '<path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  close:     '<path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  warning:   '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 17a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4h-2V9h2Z"/>',
  info:      '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-6h2Zm0-8h-2V7h2Z"/>',
  error:     '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2ZM13 17h-2v-2h2Zm0-4h-2V7h2Z"/>',
  // ── Actions ────────────────────────────────────────────────────────────────
  edit:      '<path d="m20.71 7.04-2.75-2.75a1 1 0 0 0-1.41 0L4.29 16.55a1 1 0 0 0-.29.71V20a1 1 0 0 0 1 1h2.74a1 1 0 0 0 .71-.29L20.71 8.46a1 1 0 0 0 0-1.42Z"/>',
  trash:     '<path d="M21 6h-5V4.33A2.42 2.42 0 0 0 13.5 2h-3A2.42 2.42 0 0 0 8 4.33V6H3a1 1 0 0 0 0 2h1v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8h1a1 1 0 0 0 0-2ZM10 4.33c0-.16.21-.33.5-.33h3c.29 0 .5.17.5.33V6h-4ZM18 19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8h12Zm-7-2a1 1 0 0 0 1-1v-4a1 1 0 0 0-2 0v4a1 1 0 0 0 1 1Zm4 0a1 1 0 0 0 1-1v-4a1 1 0 0 0-2 0v4a1 1 0 0 0 1 1Z"/>',
  plus:      '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  search:    '<path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  download:  '<path d="M19 9h-4V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v6H4a1 1 0 0 0-.71 1.71l8 8a1 1 0 0 0 1.42 0l8-8A1 1 0 0 0 19 9ZM5 19a1 1 0 0 0 0 2h14a1 1 0 0 0 0-2Z"/>',
  upload:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  print:     '<path d="M19 8H5a3 3 0 0 0-3 3v5a1 1 0 0 0 1 1h3v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3h3a1 1 0 0 0 1-1v-5a3 3 0 0 0-3-3ZM7 19v-3h10v3Zm10-14H7a1 1 0 0 0-1 1v1h12V6a1 1 0 0 0-1-1Z"/>',
  // ── Data & reports ─────────────────────────────────────────────────────────
  chart:     '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  trendUp:   '<path d="M22 7 13.5 15.5 8.5 10.5 2 17M22 7h-7M22 7v7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  trendDown: '<path d="M22.92 15.62a1 1 0 0 1-.55.55 1 1 0 0 1-.37.08h-5a1 1 0 0 1 0-2h2.59L14 8.41l-3.29 3.3a1 1 0 0 1-1.42 0l-6-6a1 1 0 1 1 1.42-1.42L10 9.59l3.29-3.3a1 1 0 0 1 1.42 0L20 11.59V9a1 1 0 0 1 2 0v6a1 1 0 0 1-.08.62Z"/>',
  list:      '<path d="M9 6h11M9 12h11M9 18h11M4 6v.01M4 12v.01M4 18v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  // ── Misc ───────────────────────────────────────────────────────────────────
  calendar:  '<path d="M19 4h-1V3a1 1 0 0 0-2 0v1H8V3a1 1 0 0 0-2 0v1H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3ZM4 9h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/>',
  pin:       '<path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11.5 7.3 11.74a1 1 0 0 0 1.4 0C13 21.5 20 15.4 20 10a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z"/>',
  bell:      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  archive:   '<path d="M20 7H4a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1ZM5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8Zm6 2h2v4h-2Z"/>',
  transfer:  '<path d="M17 4v16M17 4l-4 4M17 4l4 4M7 20V4M7 20l-4-4M7 20l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  tool:      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  shield:    '<path d="M12 2 3 7v6c0 5.25 3.75 10.15 9 11.25C17.25 23.15 21 18.25 21 13V7L12 2Z"/>',
  eye:       '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>',
  lock:      '<path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2ZM7 11V7a5 5 0 0 1 10 0v4"/>',
};

/**
 * Returns an inline SVG string for the given icon name and optional size.
 *
 * @param {string} name  — key from _ICON_SVG (e.g. 'check', 'warning')
 * @param {string} [size] — 'xs' | 'sm' | 'md' (default) | 'lg' | 'xl'
 * @returns {string} — ready-to-insert <svg>…</svg> HTML string
 */
function icon(name, size) {
  const path = _ICON_SVG[name];
  if (!path) {
    console.warn('[Icons] Unknown icon:', name);
    return '';
  }
  const cls = size && size !== 'md' ? `icon icon-${size}` : 'icon';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${path}</svg>`;
}

// Legacy object used by dashboard.js — keep identical shape so dashboard.js
// can drop its local ICONS definition and use this global instead.
const ICONS = {
  bed:      icon('bed'),
  home:     icon('home'),
  key:      icon('key'),
  student:  icon('student'),
  card:     icon('card'),
  money:    icon('money'),
  trendDown:icon('trendDown'),
  calendar: icon('calendar'),
  download: icon('download'),
  print:    icon('print'),
  check:    icon('check'),
  trash:    icon('trash', 'sm'),
  pin:      icon('pin', 'sm'),
  edit:     icon('edit', 'xs'),
  bath:     icon('bath', 'xs'),
  // Extended set
  warning:  icon('warning'),
  error:    icon('error'),
  info:     icon('info'),
  person:   icon('person'),
  warden:   icon('warden'),
  chart:    icon('chart'),
  trendUp:  icon('trendUp'),
  search:   icon('search'),
  plus:     icon('plus'),
  list:     icon('list'),
  receipt:  icon('receipt'),
  archive:  icon('archive'),
  transfer: icon('transfer'),
  building: icon('building'),
  bell:     icon('bell'),
  settings: icon('settings'),
  logout:   icon('logout'),
  upload:   icon('upload'),
  tool:     icon('tool'),
  shield:   icon('shield'),
};
