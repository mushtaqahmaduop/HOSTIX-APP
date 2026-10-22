// ════════════════════════════════════════════════════════════════════════════
// The month report has a way in (2026-09-20).
//
// showMonthDetailModal() — a month's KPIs, its fee records, its expense
// register, Add Fee Record / Add Expense and an Export of the lot — was
// reachable only from a calendar popover that no longer exists. Nothing else
// opened it: navigateToMonth(), which every calendar cell calls, re-filters the
// page you are on and never opens a dialog. A finished screen sat in the build
// with no way in, and the dead-code scan is what surfaced it.
//
// It now opens from the sidebar calendar, beside the name of the month being
// browsed — deliberately NOT from the KPI cards, which the owner locked on
// 7 Sep and counter-flow-decisions.spec.js holds locked.
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
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
  await win.selectOption('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 30000 });
  await win.waitForFunction(
    () => typeof _ledgerReady !== 'undefined' && _ledgerReady === true, null, { timeout: 30000 });
}

test.beforeAll(() => { resetProfile(); });

test('the month report opens from the calendar, for the month being browsed', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await login(win);

    await win.evaluate(async () => {
      window.toast = () => {};
      DB.settings.serviceModel = 'rent_mess_optional';
      DB.rooms = [{ id: 'rmM', number: 'M1', floor: 'Ground', typeId: '2s',
                    studentIds: [], amenities: [], notes: '', rent: 9000 }];
      DB.students = [{ id: 'stuM', name: 'Month Student', roomId: 'rmM', rent: 9000,
                       mess: 0, messOptIn: false, status: 'Active',
                       joinDate: thisMonth() + '-01', paymentMethod: 'Cash' }];
      const mo = thisMonth();
      DB.payments = [{ id: 'p_month', studentId: 'stuM', studentName: 'Month Student',
        month: monthLabel(mo), monthlyRent: 9000, totalRent: 9000, messCharge: 0,
        messIncluded: false, admissionFee: 0, concession: 0, extraCharges: [], extraTotal: 0,
        amount: 4000, unpaid: 5000, status: 'Pending', method: 'Cash', date: mo + '-03',
        partialPayments: [{ amount: 4000, date: mo + '-03', method: 'Cash' }] }];
      // `description`, which is the field the register and this dialog render.
      DB.expenses = [{ id: 'e_month', category: 'Utilities', amount: 1500,
                       date: mo + '-05', description: 'Electricity' }];
      await saveDB();
      navigate('dashboard');
      await new Promise(r => setTimeout(r, 600));
    });

    // ── The control exists, in the calendar, and the calendar opens ────────
    await win.evaluate(() => { const b = document.getElementById('sb-cal-btn'); if (b) b.click(); });
    await win.waitForTimeout(400);
    const control = await win.evaluate(() => {
      const el = document.getElementById('sb-cal-report');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim(), visible: r.width > 0 && r.height > 0,
               title: el.getAttribute('title') || '' };
    });
    expect(control, 'no way into the month report from the calendar').toBeTruthy();
    expect(control.visible).toBe(true);
    expect(control.title).toContain('month');

    // ── Clicking it opens the report for the month being browsed ───────────
    await win.evaluate(() => document.getElementById('sb-cal-report').click());
    await win.waitForSelector('.modal-overlay', { timeout: 15000 });
    await win.waitForTimeout(400);

    const dlg = await win.evaluate(() => {
      const title = document.querySelector('.modal-title');
      const body = document.querySelector('.modal-body');
      return {
        title: title ? title.textContent.replace(/\s+/g, ' ').trim() : null,
        hasStudent: !!(body && body.textContent.includes('Month Student')),
        hasExpense: !!(body && body.textContent.includes('Electricity')),
        exportBtn: !!document.getElementById('dashmo-export'),
        calendarClosed: (document.getElementById('sb-cal-body') || {}).style === undefined
          ? null : document.getElementById('sb-cal-body').style.display === 'none',
      };
    });

    expect(dlg.title, 'the dialog does not name the month').toContain('Full Monthly Report');
    expect(dlg.title).toContain(new Date().toLocaleString('default', { month: 'long' }));
    expect(dlg.hasStudent, 'the month report does not list the month’s fee records').toBe(true);
    expect(dlg.hasExpense, 'the month report does not list the month’s expenses').toBe(true);
    expect(dlg.exportBtn, 'the combined Export control is missing').toBe(true);

    /* A PART PAYMENT IS A PAYMENT. The caption under Total Revenue counted
       records whose status is Paid, under a figure that is calcRevenue() —
       every rupee collected. This month has one student who has paid 4,000 of
       9,000, so it read "Rs. 4,000 - 0 payments". Same fault as the Reports
       donut in 0d02260. */
    const caption = await win.evaluate(() => {
      const t = document.querySelector('.modal-body').textContent.replace(/\s+/g, ' ');
      const m = /([0-9]+) collections?/.exec(t);
      return { n: m ? Number(m[1]) : null, plural: /1 records/.test(t) };
    });
    expect(caption.n, 'the revenue caption does not count the collection behind it').toBe(1);
    expect(caption.plural, '"1 records"').toBe(false);
    expect(dlg.calendarClosed, 'the calendar stayed open behind the dialog').toBe(true);

    // ── It follows the month the calendar is browsing, not today ───────────
    await win.evaluate(() => closeModal());
    const browsed = await win.evaluate(async () => {
      const d = new Date(); d.setMonth(d.getMonth() - 2);
      sbCalSetYear(d.getFullYear());
      _sbCalMonth = d.getMonth();
      renderSidebarCalendar();
      await new Promise(r => setTimeout(r, 300));
      sbCalMonthReport();
      await new Promise(r => setTimeout(r, 500));
      const t = document.querySelector('.modal-title');
      return { want: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
               got: t ? t.textContent.replace(/\s+/g, ' ').trim() : null };
    });
    expect(browsed.got, 'the report opened on the wrong month').toContain(browsed.want);

    // ── Picking a month still just navigates — the cells keep their one job ─
    await win.evaluate(() => closeModal());
    const picked = await win.evaluate(async () => {
      sbCalPickMonth(0);
      await new Promise(r => setTimeout(r, 400));
      return { modal: !!document.querySelector('.modal-overlay'), page: currentPage };
    });
    expect(picked.modal, 'picking a month now opens a dialog it never used to').toBe(false);
  } finally {
    await app.close();
  }
});
