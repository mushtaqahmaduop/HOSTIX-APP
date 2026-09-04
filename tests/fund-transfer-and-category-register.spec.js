// ════════════════════════════════════════════════════════════════════════════
// HOSTIX — Fund Transfer hiding + the category register + month scoping
//
// Covers the four things the owner asked for:
//   1. The Funds Transfer KPI card is GONE from the Dashboard and from the
//      Reports stat strip — hidden by FEATURES.fundsTransferCard, not deleted,
//      so DB.transfers and the transfer modals are still there.
//   2. Fund Transfer is an ordinary expense category, offered by the Add
//      Expense form, and legacy DB.transfers records show up under it.
//   3. Reports → Expenses is a register grouped BY CATEGORY: every category has
//      its own section with a per-category total, and a grand total closes it.
//      The grand total must equal the Expenses KPI above it.
//   4. No month mixing: a record dated in another month never appears in this
//      month's register, and the Pending detail is scoped to the report period
//      rather than listing every unpaid record ever.
//
// Runs against the ISOLATED throwaway profile (HOSTIX_TEST_PROFILE) like the
// smoke test, and aborts if the DB isn't empty so real client data is safe.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');
const { resetProfile } = require('./_profile');

test.beforeAll(() => {
  resetProfile();   // suite-order independence — see _profile.js
  if (!PROFILE) throw new Error('HOSTIX_TEST_PROFILE env var is not set');
});

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE,
      '--no-sandbox', '--disable-gpu'],
    env,
  };
}

// NOTE: the login form has TWO fields, #login-user and #login-input. Filling
// only the password leaves CUR_USER null — the shell still paints and most
// pages still render, so the failure is invisible until a permission-gated
// page (Reports, Settings) answers "Not permitted". This waits for CUR_USER
// rather than for a selector, so a silent auth failure fails the test instead
// of quietly hollowing out every assertion after it.
async function login(win) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForTimeout(1500);
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.press('#login-input', 'Enter');
  await win.waitForFunction(() => typeof CUR_USER !== 'undefined' && !!CUR_USER, null,
    { timeout: 30000 });
  await win.waitForTimeout(900);
}

test('fund transfer hidden, expenses grouped by category, no month mixing', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR ' + m.text()); });

  await login(win);

  // Reports sits behind a page-level permission gate. warden1 is the built-in
  // full-access account, so this is an assertion rather than a fix-up: if it
  // ever fails, the Reports assertions below would be checking a
  // "Not permitted" panel instead of the report.
  expect(await win.evaluate(() => canDo('reports'))).toBe(true);

  // ── Seed: two categories this month, one record LAST month, one legacy
  //    transfer this month. Written straight into DB then saved, so the test
  //    exercises the render path rather than the form plumbing.
  const seeded = await win.evaluate(async () => {
    const mo = thisMonth();
    const [y, m] = mo.split('-').map(Number);
    const prev = (m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'));
    DB.expenses = [
      { id: 'e_t1', category: 'Electricity', amount: 5000,  date: mo + '-03', description: 'WAPDA bill' },
      { id: 'e_t2', category: 'Electricity', amount: 2500,  date: mo + '-14', description: 'Generator fuel' },
      { id: 'e_t3', category: 'Cleaning',    amount: 1200,  date: mo + '-09', description: 'Sweeper' },
      // Last month — must NOT appear in this month's register.
      { id: 'e_old', category: 'Cleaning',   amount: 99999, date: prev + '-11', description: 'LAST MONTH ONLY' },
    ];
    DB.transfers = [
      { id: 'tr_t1', method: 'Cash', amount: 8000, date: mo + '-20',
        description: 'Handed to owner', receivedBy: 'Owner' },
    ];
    await saveDB();
    return { mo, prev };
  });

  // ── 1. Dashboard: no Funds Transfer KPI card ─────────────────────────────
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForTimeout(900);
  const dash = await win.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.dash-kpi__label'))
      .map(el => el.textContent.replace(/\s+/g, ' ').trim());
    const expCard = Array.from(document.querySelectorAll('.dsh-card'))
      .find(c => /Expenses/.test(c.querySelector('.dash-kpi__label')?.textContent || ''));
    return {
      renderError: document.body.innerText.includes('Render Error'),
      labels,
      hasTransferCard: labels.some(l => /Funds ?Transfer/i.test(l)),
      // The pill must count the transfer too, since the value beside it does.
      expPill: expCard?.querySelector('.dash-pill')?.textContent.trim(),
      expValue: expCard?.querySelector('.dash-kpi__value')?.textContent.trim(),
      // The standalone feature is gone — no way left to create a transfer
      // outside Add Expense → Fund Transfer.
      addModalGone: typeof showAddTransferModal === 'undefined',
      recordsModalGone: typeof showTransferRecordsModal === 'undefined',
      // …but the records already entered are untouched and still correctable
      // where they now appear, under the Fund Transfer category.
      editStillReachable: typeof showEditTransferModal === 'function',
      transfersStillStored: (DB.transfers || []).length,
    };
  });
  console.log('DASH ' + JSON.stringify(dash));
  expect(dash.renderError).toBe(false);
  expect(dash.hasTransferCard).toBe(false);
  expect(dash.addModalGone).toBe(true);          // feature removed
  expect(dash.recordsModalGone).toBe(true);
  expect(dash.editStillReachable).toBe(true);    // legacy rows stay correctable
  expect(dash.transfersStillStored).toBe(1);     // record preserved, not wiped
  // 3 expenses this month + 1 transfer = 4 items, PKR 16,700
  expect(dash.expPill).toBe('4 items');
  expect(dash.expValue.replace(/[^0-9]/g, '')).toBe('16700');

  // ── 2. Add Expense offers the Fund Transfer category ─────────────────────
  const cats = await win.evaluate(() => {
    showAddExpenseModal();
    const opts = Array.from(document.querySelectorAll('#f-ecat option')).map(o => o.value);
    closeModal();
    return opts;
  });
  console.log('CATS ' + JSON.stringify(cats));
  expect(cats).toContain('Fund Transfer');

  // ── 3. Expenses page lists the legacy transfer as a row ──────────────────
  await win.evaluate(() => navigate('expenses'));
  await win.waitForTimeout(900);
  const expPage = await win.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.exp-table tbody tr'));
    const total = document.querySelector('.exp-stat__v')?.textContent.trim();
    return {
      renderError: document.body.innerText.includes('Render Error'),
      rowCount: rows.length,
      cats: rows.map(r => r.querySelector('.exp-cat')?.textContent.trim()),
      total,
      // Last month's record must not be on this month's page.
      hasLastMonth: document.body.innerText.includes('LAST MONTH ONLY'),
    };
  });
  console.log('EXPPAGE ' + JSON.stringify(expPage));
  expect(expPage.renderError).toBe(false);
  expect(expPage.hasLastMonth).toBe(false);
  expect(expPage.rowCount).toBe(4);                       // 3 expenses + 1 transfer
  expect(expPage.cats.join('|')).toMatch(/Fund Transfer/);
  // Headline total must equal the rows, transfer included, and not double it.
  expect(expPage.total.replace(/[^0-9]/g, '')).toBe('16700');

  // ── 4. Reports: no Transfers stat, expenses grouped by category ──────────
  await win.evaluate(() => { reportPeriod = 'month'; reportDetail = null; navigate('reports'); });
  await win.waitForTimeout(1000);
  const rptStats = await win.evaluate(() => ({
    renderError: document.body.innerText.includes('Render Error'),
    labels: Array.from(document.querySelectorAll('.rpt-stat__label')).map(e => e.textContent.trim()),
  }));
  console.log('RPTSTATS ' + JSON.stringify(rptStats));
  expect(rptStats.renderError).toBe(false);
  expect(rptStats.labels.some(l => /Transfer/i.test(l))).toBe(false);

  const reg = await win.evaluate(() => {
    reportDetail = 'expenses';
    renderPage('reports');
    return new Promise(res => setTimeout(() => {
      const body = document.body.innerText;
      // Each category section closes with a "Total — <cat>" row.
      const subtotals = Array.from(document.querySelectorAll('#content tr'))
        .filter(tr => /^Total — /.test(tr.children[0]?.textContent.trim() || ''))
        .map(tr => ({
          label: tr.children[0].textContent.trim(),
          amount: tr.children[1].textContent.replace(/[^0-9]/g, ''),
        }));
      const grandEl = Array.from(document.querySelectorAll('#content div'))
        .find(d => /^Grand Total/.test(d.textContent.trim()) && d.children.length === 0);
      return res({
        renderError: body.includes('Render Error'),
        subtotals,
        grand: grandEl ? grandEl.parentElement.lastElementChild.textContent.replace(/[^0-9]/g, '') : null,
        hasLastMonth: body.includes('LAST MONTH ONLY'),
        // Every row carries date, description, amount and an action pair.
        actionButtons: document.querySelectorAll('#content .btn-icon').length,
      });
    }, 700));
  });
  console.log('REGISTER ' + JSON.stringify(reg));
  expect(reg.renderError).toBe(false);
  // Three categories: Electricity 7500, Fund Transfer 8000, Cleaning 1200.
  expect(reg.subtotals.length).toBe(3);
  const byCat = Object.fromEntries(reg.subtotals.map(s => [s.label.replace('Total — ', ''), s.amount]));
  expect(byCat['Electricity']).toBe('7500');
  expect(byCat['Fund Transfer']).toBe('8000');
  expect(byCat['Cleaning']).toBe('1200');
  // Grand total closes the register and matches the Expenses KPI.
  expect(reg.grand).toBe('16700');
  // Every one of the 4 records has an edit + delete button.
  expect(reg.actionButtons).toBe(8);
  // No month mixing in the register.
  expect(reg.hasLastMonth).toBe(false);

  // ── 5. Revenue trend: no Transfers line, and Net is not double-deducted ──
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForTimeout(1400);
  const trend = await win.evaluate(() => {
    const chart = (typeof _dashTrendChart !== 'undefined' && _dashTrendChart) ? _dashTrendChart : null;
    const mo = thisMonth();
    return {
      datasets: chart ? chart.data.datasets.map(d => d.label) : null,
      legend: Array.from(document.querySelectorAll('.dash-legend__k')).map(e => e.textContent.trim()),
      // The Net the tooltip shows must be revenue − expenses, with the transfer
      // deducted once. calcExpenses already carries it.
      expectedNet: calcRevenue(mo) - calcExpenses(mo),
      revMinusExp: calcRevenue(mo) - calcExpenses(mo),
      // What the old code computed — kept here so the double-deduction can
      // never quietly come back.
      doubleDeducted: calcRevenue(mo) - calcExpenses(mo) - calcTransfers(mo),
    };
  });
  console.log('TREND ' + JSON.stringify(trend));
  expect(trend.datasets).not.toBeNull();
  // THE POINT OF THIS BLOCK: no Transfers series. calcExpenses() already carries
  // the transfers, so a separate one draws the same money twice and a reader
  // adding the two gets a figure the ledger never held.
  expect(trend.datasets.some(d => /Transfer/i.test(d || ''))).toBe(false);
  /* Updated 2026-09-04: the dashboard trend is now two bars, not three lines
     (design 1c). Pending was dropped deliberately — it is a balance, not a
     monthly flow, so barring it beside collected revenue invited adding them
     together.

     Kept as exact equality rather than loosened to "contains Revenue and
     Expenses". This assertion's neighbour above only rules out a series called
     "Transfer"; exact equality is what would also catch a fourth series
     arriving under any other name, which is the failure this spec exists to
     prevent. Loosening it here would have quietly retired that guard while
     looking like a routine update. */
  expect(trend.datasets).toEqual(['Revenue', 'Expenses']);
  expect(trend.legend.some(l => /Transfer/i.test(l))).toBe(false);
  // The seeded transfer is 8000, so the two must differ — proving the
  // assertion above is actually discriminating.
  expect(trend.expectedNet).not.toBe(trend.doubleDeducted);

  // ── 6. All Students PDF: no transfer badge, grouped register, right Net ──
  // The report goes to a real BrowserWindow through contextBridge. That object
  // is non-configurable, so it cannot be stubbed from the renderer at all —
  // the honest way to read the output is to let the window open and inspect it.
  const pdfWinPromise = app.waitForEvent('window');
  await win.evaluate(() => doGenerateStudentsPDF(thisMonth()));
  const pdfWin = await pdfWinPromise;
  await pdfWin.waitForLoadState('domcontentloaded');
  const captured = await pdfWin.evaluate(() => document.documentElement.outerHTML);
  const expectedNet = await win.evaluate(() => {
    const mo = thisMonth();
    return calcRevenue(mo) - calcExpenses(mo);
  });
  await pdfWin.close();
  const pdf = {
    len: captured.length,
    hasTransferBadge: /Funds<br>Transfer/.test(captured),
    hasSeparateTransferTable: /Funds Transfer —/.test(captured),
    hasByCategory: /Expenses by Category/.test(captured),
    catTotals: (captured.match(/Total — [^<]+/g) || []),
    hasGrandTotal: /GRAND TOTAL/.test(captured),
    // The transfer's description must still be IN the register, under its
    // category — hidden from the KPI strip is not the same as dropped.
    transferRowPresent: /Handed to owner/.test(captured),
    expectedNet,
  };
  console.log('STUDENTPDF ' + JSON.stringify(pdf));
  expect(pdf.len).toBeGreaterThan(1000);
  expect(pdf.hasTransferBadge).toBe(false);        // badge hidden
  expect(pdf.hasSeparateTransferTable).toBe(false); // no duplicate table
  expect(pdf.hasByCategory).toBe(true);
  expect(pdf.hasGrandTotal).toBe(true);
  expect(pdf.catTotals.length).toBe(3);            // one total per category
  expect(pdf.catTotals.join('|')).toMatch(/Fund Transfer/);
  expect(pdf.transferRowPresent).toBe(true);       // preserved, not dropped

  // ── 7. Pending detail is scoped to the period, not "all unpaid ever" ─────
  const pend = await win.evaluate(() => {
    reportDetail = null;
    navigate('reports');
    const mo = thisMonth();
    const [y, m] = mo.split('-').map(Number);
    const prev = (m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'));
    DB.payments = [
      { id: 'p_now', studentName: 'ThisMonth Student', status: 'Pending', amount: 0,
        unpaid: 4000, month: mo, date: mo + '-05' },
      { id: 'p_old', studentName: 'LastMonth Student', status: 'Pending', amount: 0,
        unpaid: 7000, month: prev, date: prev + '-05' },
    ];
    reportDetail = 'pending';
    renderPage('reports');
    return new Promise(res => setTimeout(() => res({
      body: document.body.innerText,
    }), 700));
  });
  expect(pend.body).toContain('ThisMonth Student');
  expect(pend.body).not.toContain('LastMonth Student');

  await app.close();
});
