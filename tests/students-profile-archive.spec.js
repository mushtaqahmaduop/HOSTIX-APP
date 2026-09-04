// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — the students page, the resident record, the avatar, the archive
//
// Four owner items from 2026-08-31, built together because they overlap:
//
//   · the students table gains a Rent + Mess / mo column with a coverage badge,
//     so the whole agreement is readable without opening anybody's profile
//   · one default avatar across the app, instead of three different fallbacks
//     that made the same student "H", "HU" and "Habibullah" by screen
//   · the printed resident record rebuilt to `student profile.png`
//   · the archive answers "was this year better than last" and "who stayed"
//
// The thing most of these tests actually guard is the same as the last two
// commits: a monthly figure that quotes the rent half alone is wrong, and it
// was wrong in every one of these places too.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  };
}

async function openApp() {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1500, height: 950 });
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && Object.keys(WARDENS).length > 0,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForTimeout(700);
  return { app, win };
}

/* Three residents on purpose: one on rent AND mess, one whose mess is switched
   off, and one in a room type that has no mess at all. Those are three
   different agreements with three different families and the column has to tell
   them apart. */
async function seed(win) {
  await win.evaluate(async () => {
    const d  = new Date();
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    window.__MK = mk;
    window.__Y  = String(d.getFullYear());
    DB.settings.hostelName = 'Test Hostel';
    DB.settings.roomTypes = [
      { id: 'rt1', name: '2-Seater', capacity: 2, defaultRent: 8000, defaultMess: 6500 },
      { id: 'rt2', name: '4-Seater', capacity: 4, defaultRent: 5000, defaultMess: 0 },
    ];
    DB.rooms = [
      { id: 'r1', number: '1', floor: 'Ground', typeId: 'rt1', amenities: ['Fan', 'Bed'] },
      { id: 'r2', number: '2', floor: 'Ground', typeId: 'rt1' },
      { id: 'r3', number: '3', floor: '1st',    typeId: 'rt2' },
    ];
    DB.students = [
      { id: 'sBoth', name: 'Both Charges', fatherName: 'Father One', roomId: 'r1',
        status: 'Active', joinDate: mk + '-01', phone: '0300-1111111', nationality: 'Pakistani' },
      { id: 'sOff',  name: 'Mess Off', fatherName: 'Father Two', roomId: 'r2',
        status: 'Active', joinDate: mk + '-01', messOptIn: false, phone: '0300-2222222' },
      { id: 'sRent', name: 'Rent Only', fatherName: 'Father Three', roomId: 'r3',
        status: 'Active', joinDate: mk + '-01', phone: '0300-3333333' },
    ];
    DB.payments = [
      { id: 'pay1', studentId: 'sBoth', studentName: 'Both Charges', roomNumber: '1',
        monthlyRent: 8000, messCharge: 6500, messIncluded: true, admissionFee: 2000,
        extraCharges: [], amount: 16500, unpaid: 0, method: 'Cash',
        month: mk, date: mk + '-05', status: 'Paid' },
    ];
    await saveDB();
  });
}

test('the students table states the whole agreement, not the rent half', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => renderPage('students'));
  await win.waitForTimeout(700);

  const rows = await win.$$eval('.stu-table tbody tr', trs => trs.map(tr => ({
    name:   (tr.querySelector('.stu-who__name') || {}).textContent || '',
    charge: (tr.querySelector('.stu-charge') || {}).textContent || '',
    sub:    (tr.querySelector('.stu-charge__sub') || {}).textContent || '',
    cover:  (tr.querySelector('.stu-cov') || {}).textContent || '',
  })));

  const by = n => rows.find(r => r.name.trim() === n);

  // Rent AND mess: the total is both halves, and the badge says so.
  expect(by('Both Charges').charge).toContain('14,500');       // 8,000 + 6,500
  expect(by('Both Charges').sub).toContain('6,500 mess');
  expect(by('Both Charges').cover.trim()).toBe('Rent + Mess');

  // Mess configured but switched off: the rent alone, and the badge is the
  // thing that distinguishes this from a hostel that serves no food.
  expect(by('Mess Off').charge).toContain('8,000');
  expect(by('Mess Off').sub).toContain('Mess not included');
  expect(by('Mess Off').cover.trim()).toBe('Rent only');

  // No mess in the room type at all — a different fact, and a different badge.
  expect(by('Rent Only').charge).toContain('5,000');
  expect(by('Rent Only').cover.trim()).toBe('Rent');

  await app.close();
});

test('one avatar everywhere, and a photo always beats the fallback', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => renderPage('students'));
  await win.waitForTimeout(600);

  const out = await win.evaluate(() => {
    const wrap = document.createElement('div');
    const noPhoto = DB.students[0];
    const withPhoto = Object.assign({}, DB.students[0],
      { docs: { photo: 'data:image/png;base64,iVBORw0KGgo=' } });
    wrap.innerHTML = studentAvatar(noPhoto, 30) + studentAvatar(withPhoto, 76);
    const a = wrap.children[0], b = wrap.children[1];
    // A name that yields no letter at all must still draw something.
    const nameless = Object.assign({}, DB.students[0], { name: '—', docs: {} });
    wrap.insertAdjacentHTML('beforeend', studentAvatar(nameless, 30));
    const c = wrap.children[2];
    return {
      // No photo → the student's initials, never a photo and never a glyph.
      fallbackIsInitials: !a.querySelector('svg') && !a.querySelector('img'),
      fallbackText: a.textContent.trim(),
      expectedInitials: String(noPhoto.name || '').trim().split(/\s+/)
        .slice(0, 2).map(w => w[0]).join('').toUpperCase(),
      // …and a name with no letters in it still falls back to the glyph.
      namelessIsGlyph: !!c.querySelector('svg') && c.textContent.trim() === '',
      // A photo → the photo, and no glyph competing with it.
      photoWins: !!b.querySelector('img') && !b.querySelector('svg'),
      // Size is the caller's, so one rule serves a table cell and a print hero.
      sized: [a.style.width, b.style.width],
      // Every row on the page draws through the same helper.
      onPage: document.querySelectorAll('.stu-table .stu-av').length,
      rows: document.querySelectorAll('.stu-table tbody tr').length,
    };
  });

  /* CONTRACT CHANGED 2026-09-03, deliberately. This asserted the fallback was
     a glyph with "nothing that could be mistaken for initials". Reading the
     commit that added it (e6dcd61), the glyph was a stand-in for an unusable
     supplied asset — "a clean image can replace the glyph in one line" — and
     the invariant that actually mattered was ONE helper drawing ONE thing
     everywhere, because three screens had been drawing one initial, two
     initials and the full name for the same person.

     That invariant is untouched and still asserted below (onPage === rows).
     What changed is what the single helper draws: the owner's reference design
     for the students roster uses two-letter initials, and a roster of forty
     students drew forty identical mortarboards, so the avatar column carried
     no information at all. */
  expect(out.fallbackIsInitials, 'no photo → initials, not a glyph').toBe(true);
  expect(out.fallbackText, "and they are this student's initials")
    .toBe(out.expectedInitials);
  expect(out.namelessIsGlyph, 'a name with no letters still draws something')
    .toBe(true);
  expect(out.photoWins).toBe(true);
  expect(out.sized).toEqual(['30px', '76px']);
  expect(out.onPage).toBe(out.rows);

  await app.close();
});

test('the printed resident record carries the charge, its split, and a history', async () => {
  const { app, win } = await openApp();
  await seed(win);

  const doc = await win.evaluate(() => {
    const real = window._electronPDF;
    let got = null;
    window._electronPDF = (html, name) => { got = { html, name }; };
    try { printStudentCard('sBoth'); } finally { window._electronPDF = real; }
    if (!got) return null;
    const d = new DOMParser().parseFromString(got.html, 'text/html');
    return {
      name: got.name,
      rentPanel: (d.querySelector('.rent__v') || {}).textContent || '',
      coverage:  (d.querySelector('.rent__s') || {}).textContent || '',
      stats: [...d.querySelectorAll('.stat__l')].map(e => e.textContent.trim()),
      panels: [...d.querySelectorAll('.panel__t')].map(e => e.textContent.trim()),
      historyCols: [...d.querySelectorAll('.hist thead th')].map(e => e.textContent.trim()),
      hasSignature: !!d.querySelector('.sig'),
      text: d.body.textContent.replace(/\s+/g, ' '),
    };
  });

  expect(doc, 'no document was produced').not.toBeNull();

  // The headline figure is the CHARGE. Printing 8,000 above a history of
  // 16,500s is the bug this document had.
  expect(doc.rentPanel).toContain('14,500');
  expect(doc.coverage).toContain('Rent + mess');

  // The reference's four figures, its two panels, and somewhere to sign.
  expect(doc.stats).toEqual(['Total Paid', 'Outstanding', 'Join Date', 'Payments Made']);
  expect(doc.panels).toEqual(['Personal Information', 'Room & Accommodation']);
  expect(doc.historyCols).toContain('Charge / mo');
  expect(doc.hasSignature, 'a record a warden hands over needs a signature line').toBe(true);
  expect(doc.text).toContain('Admission');
  expect(doc.name).toMatch(/^Test-Hostel_Resident-Both-Charges_\d{4}-\d{2}-\d{2}\.pdf$/);

  await app.close();
});

test('the archive compares one year with the last, and says who stayed', async () => {
  const { app, win } = await openApp();
  await seed(win);

  // Give last year some money so there is something to compare against.
  await win.evaluate(async () => {
    const prev = String(Number(window.__Y) - 1);
    DB.payments.push({ id: 'old1', studentId: 'sBoth', studentName: 'Both Charges',
      roomNumber: '1', monthlyRent: 8000, messCharge: 6500, messIncluded: true,
      amount: 10000, unpaid: 0, admissionFee: 0, extraCharges: [],
      method: 'Cash', month: prev + '-06', date: prev + '-06-05', status: 'Paid' });
    DB.expenses = [{ id: 'ex1', date: prev + '-06-10', category: 'Electricity',
                     description: 'Bill', amount: 4000 }];
    await saveDB();
    archiveFilter.year = window.__Y; archiveFilter.month = ''; archiveFilter.tab = 'overview';
    renderPage('archive');
  });
  await win.waitForTimeout(800);

  const seen = await win.evaluate(() => ({
    panels: [...document.querySelectorAll('.arc-panel__t')].map(e => e.textContent.trim()),
    deltas: [...document.querySelectorAll('.arc-d')].map(e => e.textContent.trim()),
    retention: [...document.querySelectorAll('.arc-kpi__l')].map(e => e.textContent.trim()),
    figures: _arcYearFigures(String(new Date().getFullYear())),
    // Growth from nothing must not be printed as a percentage.
    fromZero: _arcDelta(500, 0),
    flat: _arcDelta(0, 0),
    real: _arcDelta(150, 100),
  }));

  expect(seen.panels.some(p => /against/.test(p)), 'no year-over-year panel').toBe(true);
  expect(seen.panels.some(p => /Who was here/.test(p)), 'no retention panel').toBe(true);
  expect(seen.retention).toEqual(expect.arrayContaining(
    ['Carried in', 'Admitted', 'Left', 'Still resident']));
  expect(seen.deltas.length, 'nothing was compared').toBeGreaterThan(0);

  // 16,500 collected this year against 10,000 last year.
  expect(seen.figures.rev).toBe(16500);
  expect(Math.round(seen.real.pct)).toBe(50);
  // A first year is a first year, not infinite growth.
  expect(seen.fromZero.from0).toBe(true);
  expect(seen.fromZero.pct).toBeNull();
  expect(seen.flat.pct).toBe(0);

  await app.close();
});

test('a single month shows no year-over-year, because a month has none', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await win.evaluate(() => {
    archiveFilter.year = window.__Y;
    archiveFilter.month = window.__MK.slice(5);
    archiveFilter.tab = 'overview';
    renderPage('archive');
  });
  await win.waitForTimeout(700);

  const panels = await win.$$eval('.arc-panel__t', els => els.map(e => e.textContent.trim()));
  expect(panels.some(p => /against/.test(p))).toBe(false);
  expect(panels.some(p => /Who was here/.test(p))).toBe(false);

  await app.close();
});
