// ════════════════════════════════════════════════════════════════════════════
// Room inspections, end to end (owner-approved design, 2026-09-29/30).
//
// Through the real screens: the room's detail offers "Inspect room"; the form
// will not save until every item is marked and every problem says what is
// wrong; saving records the inspection, works out Fair from two problems and
// files each problem in Complaints against the room; the room then shows its
// condition and "2 still open", which drops to 1 when one job is resolved in
// Complaints; it all survives a restart; and deleting the inspection leaves
// the jobs where they are.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const { settleFreshInstall } = require('./_fresh-install');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;

function launchOpts() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: require('electron'),
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'], env };
}

async function login(win, fresh) {
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 30000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 30000 });
  await win.selectOption('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 30000 });
  if (fresh) await settleFreshInstall(win);
}

test.beforeAll(() => { resetProfile(); });

test('inspect a room: checklist, overall, issues in Complaints, history, restart, delete', async () => {
  test.setTimeout(240000);
  let app = await electron.launch(launchOpts());
  let win = await app.firstWindow();
  await login(win, true);

  const roomId = await win.evaluate(async () => {
    const r = DB.rooms[0];
    DB.students = [{ id: 'i1', name: 'Ahmad Khan', roomId: r.id, status: 'Active', joinDate: '2026-01-01' }];
    DB.issues = []; DB.inspections = [];
    await saveDB();
    return r.id;
  });

  // ── The room's detail offers it, and says it has never been inspected ─────
  await win.evaluate((id) => { navigate('rooms'); showRoomDetail(id); }, roomId);
  await win.waitForSelector('#insp-start', { timeout: 8000 });
  expect(await win.evaluate(() => document.querySelector('.insp-cond').textContent)).toContain('Not inspected yet');

  await win.click('#insp-start');
  await win.waitForSelector('#insp-list .insp-it', { timeout: 8000 });
  expect(await win.locator('#insp-list .insp-it').count()).toBe(10);
  expect(await win.inputValue('#insp-by')).toBe(await win.evaluate(() => CUR_USER.name));

  // ── It will not save half-done ─────────────────────────────────────────────
  await win.click('#insp-save');
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => (DB.inspections || []).length)).toBe(0);

  // Everything OK, Lighting N/A, then two problems.
  const items = await win.evaluate(() => INSPECTION_ITEMS.slice());
  for (const name of items) {
    const s = name === 'Lighting' ? 'na' : 'ok';
    await win.click(`.insp-it[data-item="${name}"] button[data-s="${s}"]`);
  }
  await win.click('.insp-it[data-item="Plumbing"] button[data-s="problem"]');
  await win.click('.insp-it[data-item="Fan / AC"] button[data-s="problem"]');

  // A problem with no words stops the save too.
  await win.click('#insp-save');
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => (DB.inspections || []).length)).toBe(0);

  await win.fill('.insp-it[data-item="Plumbing"] .insp-it__note', 'Tap in the attached bath leaks');
  await win.fill('.insp-it[data-item="Fan / AC"] .insp-it__note', 'Fan wobbles at full speed');
  // Two problems read Fair, before anything is saved.
  expect(await win.evaluate(() => document.querySelector('#insp-sum .on').textContent.trim())).toBe('Fair');
  expect(await win.isChecked('#insp-raise')).toBe(true);

  await win.click('#insp-save');
  await win.waitForFunction(() => (DB.inspections || []).length === 1, null, { timeout: 8000 });

  const saved = await win.evaluate(() => {
    const r = DB.inspections[0];
    return {
      overall: r.overall, byHand: r.overallSetByHand,
      problems: r.items.filter(i => i.status === 'problem').map(i => [i.name, i.note, !!i.issueId]),
      na: r.items.filter(i => i.status === 'na').map(i => i.name),
      issues: DB.issues.map(x => ({ title: x.title, category: x.category, roomId: x.roomId, status: x.status,
                                    from: x.fromInspection === r.id, kind: x.kind })),
    };
  });
  expect(saved.overall).toBe('Fair');
  expect(saved.byHand).toBe(false);
  expect(saved.problems).toEqual([['Plumbing', 'Tap in the attached bath leaks', true], ['Fan / AC', 'Fan wobbles at full speed', true]]);
  expect(saved.na).toEqual(['Lighting']);
  expect(saved.issues).toEqual([
    { title: 'Plumbing — Tap in the attached bath leaks', category: 'Plumbing', roomId, status: 'Open', from: true, kind: 'complaint' },
    { title: 'Fan / AC — Fan wobbles at full speed', category: 'Appliance', roomId, status: 'Open', from: true, kind: 'complaint' },
  ]);

  // ── The room shows it: Fair, two open, one history row ─────────────────────
  await win.waitForSelector('.insp-cond .insp-badge', { timeout: 8000 });
  const shown = await win.evaluate(() => ({
    badge: document.querySelector('.insp-last .insp-badge').textContent.trim(),
    line: document.querySelector('.insp-last__t span').textContent.replace(/\s+/g, ' ').trim(),
    rows: document.querySelectorAll('.insp-hist .insp-row').length,
  }));
  expect(shown.badge).toBe('Fair');
  expect(shown.line).toContain('2 problems found');
  expect(shown.line).toContain('2 still open');
  expect(shown.rows).toBe(1);

  // Resolving one job in Complaints clears it here — one list of work.
  await win.evaluate(async () => { closeModal(); DB.issues[0].status = 'Resolved'; DB.issues[0].resolvedDate = today(); await saveDB(); });
  await win.evaluate((id) => showRoomDetail(id), roomId);
  await win.waitForSelector('.insp-last__t span', { timeout: 8000 });
  expect(await win.evaluate(() => document.querySelector('.insp-last__t span').textContent)).toContain('1 still open');

  // ── It survives a restart ─────────────────────────────────────────────────
  await app.close();
  app = await electron.launch(launchOpts());
  win = await app.firstWindow();
  await login(win, false);
  expect(await win.evaluate(() => ({ n: (DB.inspections || []).length, iss: (DB.issues || []).length })))
    .toEqual({ n: 1, iss: 2 });

  // ── The read-only view, then delete: the jobs stay in Complaints ───────────
  await win.evaluate(() => showInspection(DB.inspections[0].id));
  await win.waitForSelector('.insp-view', { timeout: 8000 });
  const view = await win.evaluate(() => document.querySelector('.insp-view').textContent.replace(/\s+/g, ' '));
  expect(view).toContain('Tap in the attached bath leaks');
  expect(view).toMatch(/CO-\d{4} · Resolved/);
  expect(view).toMatch(/CO-\d{4} · Open/);

  await win.evaluate(() => deleteInspection(DB.inspections[0].id));
  await win.waitForTimeout(400);
  await win.click('button[onclick="_confirmYes()"]');   // showConfirm's own Confirm
  await win.waitForFunction(() => (DB.inspections || []).length === 0, null, { timeout: 8000 });
  expect(await win.evaluate(() => (DB.issues || []).length)).toBe(2);

  await app.close();
});
