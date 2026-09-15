/* ─── HOSTYLLO — PAPER (owner, 2026-09-15) ────────────────────────────────────
   "the current pdfs prints size is very small and not fitting to the landscape
   letter paper and also all the pdfs opens upright".

   Every printed page was laid out for A4, and Chromium shrank it onto the
   Letter paper in the tray. One setting now decides the paper for every PDF,
   register and printout — Settings → Hostel Info → Paper size, Letter unless a
   hostel picks another (owner). The Excel page setup follows it too.

   Orientation is still each document's own decision: registers and reports
   print landscape, one-person forms portrait. The 80mm receipt roll is not a
   sheet of paper and is not affected. */

const PAPER_SIZES = {
  Letter: { label: 'Letter', detail: '8.5 × 11 in',  xlsx: 1 },
  A4:     { label: 'A4',     detail: '210 × 297 mm', xlsx: 9 },
  Legal:  { label: 'Legal',  detail: '8.5 × 14 in',  xlsx: 5 },
};
const PAPER_DEFAULT = 'Letter';

/** The paper every page is laid out for: 'Letter' | 'A4' | 'Legal'. */
function paperSize() {
  const s = (typeof DB !== 'undefined' && DB && DB.settings) ? DB.settings.paperSize : '';
  return Object.prototype.hasOwnProperty.call(PAPER_SIZES, s) ? s : PAPER_DEFAULT;
}

/** The same paper as Excel's pageSetup paperSize code (1 Letter, 9 A4, 5 Legal). */
function paperXlsxCode() { return PAPER_SIZES[paperSize()].xlsx; }

async function setPaperSize(v) {
  if (!Object.prototype.hasOwnProperty.call(PAPER_SIZES, v)) return { ok: false, reason: 'Unknown paper size.' };
  if (DB.settings.paperSize === v) return { ok: true, unchanged: true };
  DB.settings.paperSize = v;
  if (typeof logActivity === 'function') logActivity('Settings Updated', 'Paper size set to ' + v, 'Settings');
  if (typeof saveDB === 'function') await saveDB();
  return { ok: true };
}
