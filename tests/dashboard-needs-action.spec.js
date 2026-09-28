// ════════════════════════════════════════════════════════════════════════════
// Needs Action: each verb lands on exactly the rows it counted (owner,
// 2026-09-28): "the pending cancellation View button should redirect to the
// pending cancellations, the pending payments Collect button should redirect to
// the Still owing category, and so on". They all used to open the whole
// register, unfiltered.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');
const { settleFreshInstall } = require('./_fresh-install');

const REPO = path.join(__dirname, '..');
const ELECTRON = require('electron');

test.beforeAll(() => { resetProfile(); });

test('View, Collect, Resolve and Assign open their own filtered lists', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: ELECTRON,
    args: [REPO, '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env });
  const win = await app.firstWindow();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1366, 768));
    await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
    await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
    await win.selectOption('#login-user', 'warden1');
    await win.fill('#login-input', 'admin123');
    await win.click('#login-btn');
    await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 30000 });
    await settleFreshInstall(win);

    await win.evaluate(async () => {
      const mo = thisMonth(), td = today();
      const r0 = DB.rooms[0], r1 = DB.rooms[1];
      // A pending cancellation from an EARLIER month: the count is every month,
      // so the list it opens must not hide it behind this month's filter.
      DB.cancellations = [
        { id: 'c1', seq: 1, studentId: 's1', studentName: 'Leaver One', roomNumber: r0.number,
          requestDate: '2026-01-10', vacateDate: '2026-01-31', status: 'Pending', reason: 'x', createdAt: '2026-01-10' },
        { id: 'c2', seq: 2, studentId: 's2', studentName: 'Done Two', roomNumber: r1.number,
          requestDate: td, vacateDate: td, status: 'Confirmed', reason: 'x', createdAt: td },
      ];
      DB.issues = [
        { id: 'co1', kind: 'complaint',   seq: 1, title: 'Noisy neighbour', category: 'Noise', priority: 'Low',
          roomId: r0.id, date: '2026-02-03', status: 'Open', resolvedDate: '' },
        { id: 'co2', kind: 'complaint',   seq: 2, title: 'Settled complaint', category: 'Noise', priority: 'Low',
          roomId: r0.id, date: td, status: 'Resolved', resolvedDate: td },
        { id: 'mt1', kind: 'maintenance', seq: 1, title: 'Tap leaking', category: 'Plumbing', priority: 'High',
          roomId: r1.id, date: td, status: 'Open', resolvedDate: '' },
      ];
      DB.students = [{ id: 'sp', name: 'Owing Student', fatherName: 'G', phone: '0300-1234567',
                       roomId: r0.id, status: 'Active', messOptIn: true, joinDate: mo + '-01' }];
      DB.payments = [{ id: 'pp', studentId: 'sp', studentName: 'Owing Student', roomNumber: r0.number,
        month: mo, date: '', paidDate: '', amount: 0, unpaid: 10000, overpaid: 0, status: 'Pending',
        method: 'Cash', monthlyRent: 10000, messCharge: 0, messIncluded: false, extraCharges: [],
        extraTotal: 0, admissionFee: 0, concession: 0 }];
      await saveDB();
      navigate('dashboard');
    });
    await win.waitForTimeout(800);

    const click = async (verb) => {
      await win.evaluate(() => navigate('dashboard'));
      await win.waitForTimeout(500);
      await win.evaluate(v => [...document.querySelectorAll('.dl-need')]
        .find(b => b.querySelector('.dl-need__verb').textContent === v).click(), verb);
      await win.waitForTimeout(700);
    };

    await click('View');
    const canc = await win.evaluate(() => ({ page: currentPage, status: cancelFilter.status, month: cancelFilter.month,
      rows: [...document.querySelectorAll('#content tbody tr')].map(t => t.textContent).filter(t => /Leaver|Done/.test(t)) }));
    expect(canc.page).toBe('cancellations');
    expect(canc.status).toBe('Pending');
    expect(canc.month, 'an earlier month\'s pending request was hidden').toBe('');
    expect(canc.rows.length).toBe(1);
    expect(canc.rows[0]).toContain('Leaver One');

    await click('Collect');
    const pay = await win.evaluate(() => ({ page: currentPage, status: payFilter.status }));
    expect(pay).toEqual({ page: 'payments', status: 'Owing' });

    await click('Resolve');
    const co = await win.evaluate(() => ({ page: currentPage, ids: issuesFiltered().map(i => i.id) }));
    expect(co).toEqual({ page: 'issues', ids: ['co1'] });

    await click('Assign');
    const mt = await win.evaluate(() => ({ page: currentPage, ids: issuesFiltered().map(i => i.id) }));
    expect(mt).toEqual({ page: 'issues', ids: ['mt1'] });

    // A plain rail visit afterwards is unfiltered again.
    await win.evaluate(() => { navigate('dashboard'); navigate('issues'); });
    await win.waitForTimeout(500);
    expect(await win.evaluate(() => issueFilter.kind)).toBe('All');
  } finally {
    await app.close();
  }
});
