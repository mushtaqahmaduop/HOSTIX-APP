/* ─── FIT FIGURES — an amount is never shown cut off ─────────────────────────
   Owner, 2026-09-28, from a client's screen: the Payments cards read
   "Rs. 8,016,6…" and "Rs. 47…". Every KPI strip in the app sets its figure to
   one line with an ellipsis, which is right for a label and wrong for money —
   a truncated amount is a different amount, and the full one was only in a
   hover title nobody knows is there.

   So a figure in one of these slots is never allowed to overflow: when its
   text is wider than its box, its font steps down until the whole figure fits,
   to no less than FIT_MIN of the designed size. Short figures are left exactly
   as designed; only the one that would be cut changes, and only as much as it
   has to. The ellipsis stays as the last resort below the floor.

   It runs whenever the page's DOM changes (every render) and on resize, batched
   to one pass per frame. It only ever reads the slots listed in FIT_SELECTOR. */
(function () {
  'use strict';

  var FIT_SELECTOR = [
    '.pay-kpi__v',       // Payments
    '.svw-stat__v',      // Student view
    '.lk-kpi__v',        // listkit registers
    '.rpt-stat__val',    // Reports KPI strip
    '.rpt-mv__v',        // Reports movement tiles
    '.bkp-stat__v',      // Backup
    '.rpt-of__v',        // Reports → Owner funds
    '.ui-stat__v',       // every register's stat strip (Owner Funds, Issues, …)
    '[data-fit]'         // anything else that opts in
  ].join(',');
  var FIT_MIN = 0.6;

  function fit(el) {
    el.style.fontSize = '';                       // back to the designed size
    var avail = el.clientWidth;
    if (!avail || el.scrollWidth <= avail + 1) return;
    var base = parseFloat(getComputedStyle(el).fontSize) || 16;
    var size = Math.max(base * FIT_MIN, Math.floor(base * (avail / el.scrollWidth) * 10) / 10);
    el.style.fontSize = size + 'px';
    // Rounding and kerning can leave it a pixel over; step down until it fits.
    while (el.scrollWidth > el.clientWidth + 1 && size > base * FIT_MIN) {
      size = Math.max(base * FIT_MIN, size - 0.5);
      el.style.fontSize = size + 'px';
    }
  }

  var queued = false;
  function fitAll() {
    queued = false;
    var els = document.querySelectorAll(FIT_SELECTOR);
    for (var i = 0; i < els.length; i++) {
      if (els[i].getClientRects().length) fit(els[i]);
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(fitAll);
  }

  function start() {
    // Our own font-size writes are attribute changes, not childList changes,
    // so observing childList + characterData cannot loop on itself.
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    schedule();
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  window.fitFigures = schedule;
})();
