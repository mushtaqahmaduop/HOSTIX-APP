// ════════════════════════════════════════════════════════════════════════════
// The lower dashboard — Collection by Method, Pending Payments, Recent
// Payments — against `Hostyllo_Dashboard_Lower_Section_Design_Implementation_
// Spec.md` (owner, 7 Sep 2026), plus the chrome fixes from the same message.
//
// The assertions worth having are the ones about what must NOT appear:
//
//   · §36 — an empty month draws NO ring. A full ring in one colour reads as
//     "one method took everything" when the truth is "nothing came in", and it
//     is the single most plausible-looking lie this screen could tell.
//   · §14 — amounts are compact. The owner's own reference image prints
//     "PKR 100,000,007,000" and the spec explicitly calls that out as the
//     thing not to do.
//   · A stored month key is never printed. "Room 22 · 2026-09" is a database
//     value on a warden's screen.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env };
}

async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 30000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.setViewportSize({ width: 1366, height: 768 });
}

/** Four settled payments across four methods, and three pending. */
async function seed(win, opts) {
  await win.evaluate(async (o) => {
    DB.settings.hostelName = 'Continental Boys Hostel-2';
    const mo = thisMonth();
    DB.rooms = [4, 5, 7, 9].map((n, i) => ({
      id: 'r' + n, number: String(n), floor: 'Ground',
      typeId: DB.settings.roomTypes[i % DB.settings.roomTypes.length].id,
      studentIds: [], amenities: [], notes: '' }));
    const names = ['Mushtaq Ahmad', 'Tariq Aziz', 'Adnan Khan', 'Irfan Pathan',
                   'Salman', 'Awais Khan', 'Mubeen'];
    DB.students = names.map((n, i) => ({
      id: 's' + i, name: n, fatherName: '—', roomId: DB.rooms[i % DB.rooms.length].id,
      status: 'Active', joinDate: '2026-07-02', messOptIn: false, phone: '033188761' + i }));
    DB.payments = [];
    if (!o.empty) {
      const method = ['EasyPaisa', 'Cash', 'JazzCash', 'Bank Transfer'];
      const amt = [40000, 30000, 20000, 10000];      // 100,000 total, tidy percentages
      method.forEach((mth, k) => DB.payments.push({
        id: 'pp' + k, studentId: 's' + k, studentName: names[k],
        roomNumber: DB.rooms[k].number, month: mo, date: '2026-09-0' + (1 + k),
        paidDate: '2026-09-0' + (1 + k), amount: amt[k], unpaid: 0, overpaid: 0,
        status: 'Paid', dueDate: '', method: mth, monthlyRent: amt[k], messCharge: 0,
        messIncluded: false, extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0 }));
      [4, 5, 6].forEach((i, k) => DB.payments.push({
        id: 'pd' + k, studentId: 's' + i, studentName: names[i],
        roomNumber: DB.rooms[i % DB.rooms.length].number, month: mo, date: '', paidDate: '',
        amount: 0, unpaid: 10000, overpaid: 0, status: 'Pending', dueDate: '',
        method: 'Cash', monthlyRent: 10000, messCharge: 0, messIncluded: false,
        extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0 }));
    }
    await saveDB();
  }, opts || {});
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForTimeout(1200);
}

test.beforeAll(() => { resetProfile(); });

test('the donut reports the month, and its slices are the real split', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win, {});

  const d = await win.evaluate(() => ({
    segments: document.querySelectorAll('.dl-coll .dnut__seg').length,
    centre:   (document.querySelector('.dl-coll .dnut__top') || {}).textContent,
    sub:      (document.querySelector('.dl-coll .dnut__sub') || {}).textContent,
    chip:     (document.querySelector('.dl-monthchip') || {}).textContent.trim(),
    rows: [...document.querySelectorAll('.dl-meth__row')].map(r => ({
      name: r.querySelector('.dl-meth__name').textContent,
      pct:  parseFloat(r.querySelector('.dl-meth__pct').textContent),
      amt:  r.querySelector('.dl-meth__amt').textContent,
    })),
  }));

  /* FOUR ARCS FOR FIVE ROWS: the zero row draws no arc, because it has no
     value to draw. That is the whole reason a zero row is safe to show. */
  expect(d.segments).toBe(4);
  expect(d.centre.replace(/\s/g, '')).toBe('PKR100K');
  expect(d.sub).toBe('Total Collected');
  expect(d.chip).toBe(thisMonthLabelIn(d.chip));    // whatever the picker says

  /* EVERY CONFIGURED METHOD IS LISTED, paid or not (owner, 7 Sep) — 'Cheque'
     ships in the default settings and nobody used it this month, so it appears
     last at zero rather than vanishing. A wallet that is enabled and never
     shown looks unwired. */
  expect(d.rows.map(r => r.name)).toEqual(['EasyPaisa', 'Cash', 'JazzCash', 'Bank Transfer', 'Cheque']);
  expect(d.rows.map(r => r.pct)).toEqual([40, 30, 20, 10, 0]);
  /* §8 — the parts sum to the whole. A donut whose slices do not add up to its
     own centre figure is worse than no donut. */
  expect(d.rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 1);
  /* The METHOD list stays compact — `exact .png` shows "PKR 1.02M / PKR 156K"
     there while showing the pending rows in full, and the two are read
     differently: this column is a proportion, that one is a debt. */
  expect(d.rows.map(r => r.amt)).toEqual(['PKR 40K', 'PKR 30K', 'PKR 20K', 'PKR 10K', 'PKR 0']);

  await app.close();
});

// The chip prints whatever the sidebar month picker is set to; this only
// asserts it is a month NAME and a year, never the stored 'YYYY-MM' key.
function thisMonthLabelIn(actual) {
  expect(actual).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  return actual;
}

test('an empty month says so, and draws no ring at all', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win, { empty: true });

  const d = await win.evaluate(() => ({
    segments: document.querySelectorAll('.dl-coll .dnut__seg').length,
    donut:    document.querySelectorAll('.dl-coll .dnut').length,
    title:    (document.querySelector('.dl-empty__t') || {}).textContent,
    sub:      (document.querySelector('.dl-empty__s') || {}).textContent,
    reminder: document.querySelectorAll('.dl-remind').length,
  }));

  /* §36 — NOT a 100% ring in one colour. There is no ring. */
  expect(d.segments).toBe(0);
  expect(d.donut).toBe(0);
  expect(d.title).toBe('No collections yet');
  expect(d.sub).toContain('No payments recorded for');
  /* §36 again — "do not show the reminder button if there are zero eligible
     recipients". */
  expect(d.reminder).toBe(0);

  await app.close();
});

test('a pending row carries the three verbs, and never a stored month key', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win, {});

  const d = await win.evaluate(() => {
    const rows = [...document.querySelectorAll('.dash-pay')];
    return {
      n: rows.length,
      rooms: rows.map(r => (r.querySelector('.dash-pay__room') || {}).textContent),
      amts:  rows.map(r => (r.querySelector('.dash-pay__amt') || {}).textContent),
      wa:    document.querySelectorAll('.dash-icon-btn--wa').length,
      waLabelled: [...document.querySelectorAll('.dash-icon-btn--wa')]
                    .every(b => !!b.getAttribute('aria-label')),
      reminder: ((document.querySelector('.dl-remind') || {}).textContent || '').trim(),
    };
  });

  expect(d.n).toBe(3);
  /* §16 — mark paid, WhatsApp, edit. The WhatsApp button is new; it is also
     icon-only, so §43 requires it carry a name. */
  expect(d.wa).toBe(3);
  expect(d.waLabelled).toBe(true);
  /* §18 — the count is IN the label, so the warden knows the size of the send
     before they press it. */
  expect(d.reminder).toContain('(3 pending)');
  /* THE AMOUNT IS THE REAL FIGURE up to a crore, compact past it (owner, 7 Sep,
     settling `exact .png` against spec §14). A warden reconciles PKR 10,000
     against a cash drawer; nobody reconciles PKR 100,000,007,000, and that one
     compacts instead. */
  expect(d.amts).toEqual(['PKR 10,000', 'PKR 10,000', 'PKR 10,000']);
  /* NEVER the raw key. 'Room 4 · September 2026', not 'Room 4 · 2026-09'. */
  d.rooms.forEach(r => {
    expect(r).not.toMatch(/\d{4}-\d{2}/);
    expect(r).toMatch(/^Room .+ · [A-Z][a-z]+ \d{4}$/);
  });

  await app.close();
});

test('the identity chrome: name centred above, gone from the rail, toggle on the left', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await login(win);
  await seed(win, {});

  const d = await win.evaluate(() => {
    const tb  = document.getElementById('hz-tb-title');
    const bar = document.getElementById('hz-titlebar');
    const sub = document.getElementById('sb-hostel-name');
    const btn = document.querySelector('.sidebar-collapse-btn');
    const mark = document.querySelector('.sb-logo-icon');
    const tr = tb && tb.getBoundingClientRect(), bb = bar && bar.getBoundingClientRect();
    const br = btn && btn.getBoundingClientRect(), mr = mark && mark.getBoundingClientRect();
    return {
      name: tb && tb.textContent,
      offCentre: (tr && bb) ? Math.abs((tr.left + tr.right) / 2 - (bb.left + bb.right) / 2) : null,
      railShows: sub ? !(sub.hidden || getComputedStyle(sub).display === 'none') : 'missing',
      btnRight: br && Math.round(br.right),
      markLeft: mr && Math.round(mr.left),
      greeting: (document.querySelector('.hdr-greet__hi') || {}).textContent,
      hour: new Date().getHours(),
      clock: typeof _clockTimer !== 'undefined' && !!_clockTimer,
    };
  });

  expect(d.name).toBe('Continental Boys Hostel-2');
  expect(d.offCentre).toBeLessThan(2);        // centred on the BAR, not the gap
  expect(d.railShows).toBe(false);            // no longer under HOSTYLLO
  /* The toggle moved to the opposite side, and must clear the product mark —
     it was drawn straight on top of it until the padding was moved to the rule
     that actually wins the cascade. */
  expect(d.btnRight).toBeLessThanOrEqual(d.markLeft);
  expect(d.clock).toBe(true);

  /* The greeting names the hour it is actually in. */
  const h = d.hour;
  const want = h < 1 ? 'Good night' : h < 5 ? 'Late night' : h < 12 ? 'Good morning'
             : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
  expect(d.greeting).toContain(want);

  await app.close();
});
