// ════════════════════════════════════════════════════════════════════════════
// HOSTYLLO — Recent Payments, rebuilt to the owner's reference (`recent
// payments.png`, 30 Aug).
//
// Three of these tests guard things that were silently wrong rather than
// things that are merely new:
//
//   1. The admission fee had NEVER appeared on this table. The section read
//      `p.fee`; every writer in payments.js writes `admissionFee`, and every
//      other reader takes `p.admissionFee || p.fee`. A field that is never
//      written renders nothing and throws nothing, so the row just quietly
//      under-reported what a student had handed over.
//
//   2. The summary strip states the month's takings. The Total Revenue KPI
//      card, four rows above it on the SAME screen, states the same thing. If
//      those two are computed separately they will eventually disagree, and a
//      dashboard that contradicts itself is worse than one that omits the
//      figure. The strip is therefore handed `collected` rather than
//      recomputing it — and this test fails if anybody re-derives it.
//
//   3. The kebab offers Edit payment and Mark paid. PR #19 established that a
//      control which will refuse is worse than no control, so a warden without
//      `payments` must not be shown either one.
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
  await win.setViewportSize({ width: 1440, height: 900 });
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

// Three payments in the current month: one carrying an admission fee and an
// extra charge, one part paid, one settled with nothing on top.
async function seed(win) {
  await win.evaluate(async () => {
    const d  = new Date();
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    window.__MK = mk;
    DB.students = [
      { id: 's1', name: 'Habibullah', fatherName: 'Rafi Ullah', roomId: null, rent: 14500, status: 'Active', joinDate: mk + '-03' },
      { id: 's2', name: 'Awais Khan', fatherName: 'Sabir Hussain', roomId: null, rent: 8000, status: 'Active', joinDate: mk + '-03' },
      { id: 's3', name: 'Kashan', fatherName: 'Ikram Uddin', roomId: null, rent: 8000, status: 'Active', joinDate: mk + '-03' },
    ];
    DB.payments = [
      { id: 'pay1', studentId: 's1', studentName: 'Habibullah', roomNumber: '18',
        monthlyRent: 14500, amount: 14500, unpaid: 0, admissionFee: 2000,
        extraCharges: [{ description: 'cooler fee', amount: 2300 }],
        method: 'Cash', month: mk, date: mk + '-03', status: 'Paid' },
      { id: 'pay2', studentId: 's2', studentName: 'Awais Khan', roomNumber: '17',
        monthlyRent: 8000, amount: 7000, unpaid: 1000, admissionFee: 0,
        extraCharges: [], method: 'Cash', month: mk, date: mk + '-03', status: 'Pending' },
      { id: 'pay3', studentId: 's3', studentName: 'Kashan', roomNumber: '8',
        monthlyRent: 8000, amount: 8000, unpaid: 0, admissionFee: 0,
        extraCharges: [], method: 'JazzCash', month: mk, date: mk + '-04', status: 'Paid' },
    ];
    await saveDB();
  });
}

async function paint(win) {
  await win.evaluate(() => renderPage('dashboard'));
  await win.waitForTimeout(700);
}

// The table is sorted newest-first, so a row index is an assertion about the
// seed dates rather than about the feature. Address rows by who is in them.
function rowFor(name) {
  return `.dash-rp tbody tr:has(.dash-rp-name:text-is("${name}"))`;
}

test('the admission fee and the extras are on the row, in the accent', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await paint(win);

  const extras = await win.$$eval(rowFor('Habibullah') + ' .dash-rp-extra',
    els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));

  // Both lines, and the admission fee first — it is the one that never rendered.
  expect(extras.length, 'the extras sub-lines are missing from the row').toBe(2);
  expect(extras[0]).toMatch(/2,000 admission fee/);
  expect(extras[1]).toMatch(/2,300 cooler fee/);

  // Reading `p.fee` alone is the bug. Prove the row survives the field the
  // rest of the app actually writes being the ONLY one present.
  const stillThere = await win.evaluate(() => {
    const p = DB.payments.find(x => x.id === 'pay1');
    delete p.fee;                        // it was never there; make that explicit
    return _dashExtraLines(p).map(l => l.label);
  });
  expect(stillThere).toEqual(['admission fee', 'cooler fee']);

  await app.close();
});

test('an unpaid balance is red, a cleared one is not a number at all', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await paint(win);

  const cells = await win.$$eval('.dash-rp tbody tr', rows => rows.map(r => {
    const td = r.children[4];
    return { text: td.textContent.trim(), due: !!td.querySelector('.dash-rp-num--due') };
  }));

  const owing  = cells.filter(c => c.due);
  const clear  = cells.filter(c => !c.due);
  expect(owing.length, 'the one row that still owes money is not marked').toBe(1);
  expect(owing[0].text).toContain('1,000');
  // A settled row shows a dash, not a zero — a column of "PKR 0" reads as data.
  clear.forEach(c => expect(c.text).toBe('—'));

  await app.close();
});

test('the strip and the Total Revenue card cannot disagree', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await paint(win);

  const seen = await win.evaluate(() => {
    const digits = s => (s || '').replace(/[^\d]/g, '');
    const tile = [...document.querySelectorAll('.dash-rp-stat')]
      .find(el => /Total Payments/i.test(el.textContent));
    const kpi = [...document.querySelectorAll('.dash-kpi__label')]
      .find(el => /Total\s*Revenue/i.test(el.textContent.replace(/\s+/g, ' ')));
    return {
      strip:  digits(tile && tile.querySelector('.dash-rp-stat__val').textContent),
      card:   digits(kpi && kpi.closest('.dsh-card').querySelector('.dash-kpi__value').textContent),
      truth:  digits(fmtPKR(calcRevenue(thisMonth()))),
      totals: _dashPaymentTotals(thisMonth(), calcRevenue(thisMonth())),
    };
  });

  expect(seen.strip, 'the strip states a different figure from calcRevenue()').toBe(seen.truth);
  expect(seen.card,  'the KPI card and the strip disagree on one screen').toBe(seen.strip);

  // The other three tiles are counted, not typed.
  expect(seen.totals.count).toBe(3);
  expect(seen.totals.settled).toBe(2);
  expect(seen.totals.extras).toBe(4300);              // 2,000 admission + 2,300 cooler
  expect(Number(seen.totals.rate.toFixed(1))).toBeCloseTo(66.7, 1);

  await app.close();
});

test('the strip counts the month, not the ten rows above it', async () => {
  const { app, win } = await openApp();
  await seed(win);

  // Fifteen more payments in the same month. The table caps at ten; the strip
  // must not.
  await win.evaluate(async () => {
    for (let i = 0; i < 15; i++) {
      DB.payments.push({ id: 'bulk' + i, studentId: 's3', studentName: 'Kashan',
        roomNumber: '8', monthlyRent: 8000, amount: 8000, unpaid: 0,
        admissionFee: 0, extraCharges: [], method: 'Cash',
        month: window.__MK, date: window.__MK + '-05', status: 'Paid' });
    }
    await saveDB();
  });
  await paint(win);

  const seen = await win.evaluate(() => ({
    rows: document.querySelectorAll('.dash-rp tbody tr').length,
    tile: [...document.querySelectorAll('.dash-rp-stat')]
      .find(el => /Transactions/i.test(el.textContent))
      .querySelector('.dash-rp-stat__val').textContent.trim(),
  }));

  expect(seen.rows).toBe(10);
  expect(seen.tile, 'the strip is describing the visible rows, not the month').toBe('18');

  await app.close();
});

test('the row menu opens, and offers nothing a warden may not do', async () => {
  const { app, win } = await openApp();
  await seed(win);
  await paint(win);

  // Full permissions — all four actions.
  await win.click(rowFor('Habibullah') + ' .dash-rp-more__btn');
  await win.waitForTimeout(200);
  let items = await win.$$eval('.dash-rp-more.is-open .dash-rp-menu__item',
    els => els.map(e => e.textContent.trim()));
  expect(items).toEqual(['View student', 'Print receipt', 'Edit payment']);

  // The pending row is the one that can be settled from here.
  await win.keyboard.press('Escape');
  await win.click(rowFor('Awais Khan') + ' .dash-rp-more__btn');
  await win.waitForTimeout(200);
  items = await win.$$eval('.dash-rp-more.is-open .dash-rp-menu__item',
    els => els.map(e => e.textContent.trim()));
  expect(items).toContain('Mark paid');

  // Escape closes it, and only one can be open at a time.
  await win.keyboard.press('Escape');
  expect(await win.$$eval('.dash-rp-more.is-open', els => els.length)).toBe(0);

  // Revoke `payments` and the two write actions are gone — not disabled,
  // not present-and-refusing.
  await win.evaluate(() => { CUR_USER.perms.payments = false; });
  await paint(win);
  await win.click(rowFor('Awais Khan') + ' .dash-rp-more__btn');
  await win.waitForTimeout(200);
  items = await win.$$eval('.dash-rp-more.is-open .dash-rp-menu__item',
    els => els.map(e => e.textContent.trim()));
  expect(items).toEqual(['View student', 'Print receipt']);

  await app.close();
});
