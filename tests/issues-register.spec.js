// ════════════════════════════════════════════════════════════════════════════
// The Complaints & Maintenance register — redesigned 2026-09-08 to
// `complaints2.png` and `add complaaint and maintinanace.png`.
//
// What this file holds closed, and why each one is here:
//
//  1. The register is a TABLE of ten named columns. The screen was a card feed
//     until this change; a spec that only counts rows would pass on either.
//  2. A record written before the four new fields existed still renders — with
//     a dash in those cells and nothing else different. That is the whole
//     reason the fields were added to the FORM rather than invented into the
//     table, and the legacy shape is the case that proves it.
//  3. Category chips are NEUTRAL. The reference colours them; CLAUDE.md's rule
//     reserves hue for state, and this screen is where that matters most —
//     the red Open pill is the only thing on a row that means "act now".
//     Asserted on computed colour, because the rule is invisible to markup.
//  4. The form both ADDS and EDITS, an edit keeps the record's reference
//     number, and it does not create a second record. There was no edit path
//     at all before; a warden who mistyped a room had to delete and re-add.
//  5. A complaint's room follows its student. It is derived on read, never a
//     stored second copy, so this asserts the form fills it from the picker.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(
    () => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw,
    null, { timeout: 60000 });
  await win.fill('#login-user', 'warden1');
  await win.fill('#login-input', 'admin123');
  await win.click('#login-btn');
  await win.waitForFunction(
    () => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; },
    null, { timeout: 60000 });
  return { app, win };
}

/** Two students and five issues: three carrying the 2026-09-08 fields, two in
 *  the shape records had before them. */
async function seed(win) {
  await win.evaluate(async () => {
    const r0 = DB.rooms[0], r1 = DB.rooms[1] || DB.rooms[0];
    DB.students.push(
      { id: 'stu-a', name: 'Muhammad Safyan', phone: '0300-1112222', cnic: '17301-1234567-1',
        roomId: r0.id, status: 'Active', admissionDate: '2026-02-01', monthlyRent: 12000 },
      { id: 'stu-b', name: 'Asif Raza', phone: '0300-3334444', cnic: '17301-7654321-9',
        roomId: r1.id, status: 'Active', admissionDate: '2026-03-11', monthlyRent: 12000 });

    DB.maintenance = [
      { id: 'mt_1', seq: 1, title: 'Water leakage in bathroom', description: 'Leaking tap.',
        roomId: r0.id, category: 'Plumbing', priority: 'High', location: 'Bathroom',
        date: '2026-09-02', expectedDate: '2026-09-05', assignedTo: 'Azat Ullah',
        status: 'Open', resolvedDate: '' },
      { id: 'mt_2', seq: 2, title: 'Fan not working', description: 'Noisy fan.',
        roomId: r1.id, category: 'Electrical', priority: 'Medium',
        date: '2026-09-05', expectedDate: '2026-09-20', assignedTo: 'Hikmat Ullah',
        status: 'InProgress', resolvedDate: '' },
      // Pre-2026-09-08 shape: no category, no assignee, no expected date.
      { id: 'mt_3', seq: 3, title: 'WiFi dead on first floor', description: 'No internet.',
        roomId: r1.id, priority: 'Low', date: '2026-08-11', status: 'Open', resolvedDate: '' },
    ];

    DB.complaints = [
      { id: 'cp_1', seq: 1, subject: 'No hot water', description: 'Geyser cold before 8am.',
        studentId: 'stu-a', category: 'Plumbing', priority: 'High', assignedTo: 'Azat Ullah',
        date: '2026-09-03', expectedDate: '2026-09-06', status: 'Open', resolvedDate: '', response: '' },
      // Pre-2026-09-08 shape: no category, no priority, no assignee.
      { id: 'cp_2', seq: 2, subject: 'Noise after midnight', description: 'Music late.',
        studentId: 'stu-b', date: '2026-08-20', status: 'Resolved',
        resolvedDate: '2026-08-24', response: 'Warned the residents.' },
    ];
    await saveDB();
  });
  /* The register opens scoped to the CURRENT month (owner, 2026-09-08), and
     these fixtures deliberately straddle August and September so the legacy
     shapes are covered. Every structural test below wants the whole register,
     so the scope is widened here; the default itself is asserted on its own,
     in `the register opens on the current month` at the foot of this file. */
  await win.evaluate(() => {
    issuesTab = 'all';
    navigate('issues');
    issueFilter.month = '';
    renderPage('issues');
  });
  await win.waitForTimeout(500);
}

test('the register is a ten-column table, and a legacy record still renders in it', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await seed(win);

  const heads = await win.evaluate(() =>
    [...document.querySelectorAll('#content .iss-table thead th')].map(t => t.textContent.trim()));
  /* "Raised by", not "Student" (owner, 2026-09-10: "add maintinance raised in
     the maintinaance form"). The column has always held whoever reported the
     record; now that a maintenance ticket records one too, and it is often a
     warden or a contractor rather than a resident, the old heading was naming
     the wrong half of what the column holds. */
  expect(heads).toEqual(['#', 'Issue', 'Raised by', 'Room', 'Category', 'Priority',
                         'Status', 'Reported On', 'Assigned To', 'Actions']);

  const rows = await win.evaluate(() =>
    document.querySelectorAll('#content .iss-table tbody tr').length);
  expect(rows).toBe(5);

  // The two legacy records account for every dash in the category and
  // assigned-to columns; nothing is invented to fill them, and nothing else
  // is missing either.
  const gaps = await win.evaluate(() => ({
    category: [...document.querySelectorAll('#content .iss-table tbody tr')]
      .filter(r => r.children[4].querySelector('.lk-dash')).length,
    assigned: [...document.querySelectorAll('#content .iss-table tbody tr')]
      .filter(r => r.children[8].querySelector('.lk-dash')).length,
    /* A record with nobody recorded as having reported it is a dash. These
       seeded maintenance tickets predate the "Raised by" field, so they still
       have nothing to show — and show nothing rather than a guess. A ticket
       written through the form from now on carries a name here. */
    student: [...document.querySelectorAll('#content .iss-table tbody tr')]
      .filter(r => r.children[2].querySelector('.lk-dash')).length,
  }));
  expect(gaps.category).toBe(2);
  expect(gaps.assigned).toBe(2);
  expect(gaps.student).toBe(3);

  // An open ticket past its expected date says so, in the one place on the row
  // that carries a warden's own deadline.
  const late = await win.evaluate(() =>
    [...document.querySelectorAll('#content .iss-late')].map(e => e.textContent.trim()));
  expect(late.length).toBeGreaterThan(0);
  expect(late.every(t => /^Overdue \d+d$/.test(t))).toBe(true);

  await app.close();
});

test('category chips are neutral; priority and status keep their hue', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await seed(win);

  const paint = await win.evaluate(() => {
    const grab = (n) => [...document.querySelectorAll(
      `#content .iss-table tbody tr td:nth-child(${n}) .lk-chip`)]
      .map(c => getComputedStyle(c).backgroundColor + '|' + getComputedStyle(c).color);
    return {
      cat: grab(5), prio: grab(6), status: grab(7),
      // The Kind mark in column 1 is the OTHER category on this row — which
      // register the record belongs to. The first version of this test only
      // looked at column 5, so a violet Maintenance / blue Complaint badge
      // passed it while breaking the same rule.
      kind: [...document.querySelectorAll('#content .iss-table .iss-kind')]
        .map(e => getComputedStyle(e).color),
    };
  });

  // Every category chip paints identically, whatever the category is.
  expect(new Set(paint.cat).size).toBe(1);
  expect(paint.cat.length).toBeGreaterThan(1);

  // And so does the kind mark, across both kinds.
  expect(new Set(paint.kind).size).toBe(1);
  expect(paint.kind.length).toBeGreaterThan(1);

  // Priority and status do not: they are state, and state is what hue is for.
  expect(new Set(paint.prio).size).toBeGreaterThan(1);
  expect(new Set(paint.status).size).toBeGreaterThan(1);
  // …and neither of them paints the same as a category chip.
  expect(paint.prio.includes(paint.cat[0])).toBe(false);
  expect(paint.status.includes(paint.cat[0])).toBe(false);

  await app.close();
});

test('the form adds, edits in place, and fills a complaint room from its student', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await seed(win);

  // ── Add a complaint through the new form ──────────────────────────────────
  await win.evaluate(() => { issuesTab = 'complaints'; showIssueModal(); });
  await win.waitForSelector('#cp-subject', { timeout: 15000 });

  const room = await win.evaluate(() => {
    const sel = document.getElementById('cp-student');
    sel.value = 'stu-a';
    sel.dispatchEvent(new Event('change'));
    return document.getElementById('cp-room').value;
  });
  const expectedRoom = await win.evaluate(() => {
    const s = DB.students.find(t => t.id === 'stu-a');
    const r = DB.rooms.find(x => x.id === s.roomId);
    return '#' + String(r.number);
  });
  expect(room).toBe(expectedRoom);

  await win.evaluate(async () => {
    document.getElementById('cp-subject').value = 'Broken window latch';
    document.getElementById('cp-desc').value = 'The latch will not close.';
    document.getElementById('cp-category').value = 'Furniture';
    document.getElementById('cp-assigned').value = 'Azat Ullah';
    await saveIssue();
  });
  await win.waitForTimeout(450);

  const added = await win.evaluate(() => {
    const c = DB.complaints.find(x => x.subject === 'Broken window latch');
    return c && { cat: c.category, prio: c.priority, asg: c.assignedTo,
                  stu: c.studentId, status: c.status, count: DB.complaints.length };
  });
  expect(added).toMatchObject({ cat: 'Furniture', prio: 'Medium', asg: 'Azat Ullah',
                                stu: 'stu-a', status: 'Open', count: 3 });

  // ── Edit an existing maintenance record ───────────────────────────────────
  await win.evaluate(() => showIssueModal('mt_1'));
  await win.waitForSelector('#mt-title', { timeout: 15000 });

  const prefill = await win.evaluate(() => ({
    title: document.getElementById('mt-title').value,
    cat: document.getElementById('mt-category').value,
    prio: document.getElementById('mt-priority').value,
    loc: document.getElementById('mt-location').value,
    exp: document.getElementById('mt-expected').value,
    asg: document.getElementById('mt-assigned').value,
    /* WHO REPORTED IT (owner, 2026-09-10: "add maintinance raised in the
       maintinaance form"). This ticket was seeded before the field existed, so
       it has nothing recorded and the box opens empty rather than inventing a
       name for a record nobody signed. */
    raised: document.getElementById('mt-raised').value,
    // A complaint cannot become a maintenance ticket, so the kind switch is
    // not offered on an edit.
    // The KIND switch specifically: since 2026-09-14 the form also carries a
    // Student / Staff switch on "Raised by", drawn with the same component.
    hasSwitch: !!document.getElementById('ib-maint'),
  }));
  expect(prefill).toEqual({ title: 'Water leakage in bathroom', cat: 'Plumbing',
    prio: 'High', loc: 'Bathroom', exp: '2026-09-05', asg: 'Azat Ullah',
    raised: '', hasSwitch: false });

  await win.evaluate(async () => {
    document.getElementById('mt-title').value = 'Water leakage in bathroom (re-checked)';
    document.getElementById('mt-raised').value = 'Gul Nawaz';
    await saveIssue('mt_1');
  });
  await win.waitForTimeout(450);

  const edited = await win.evaluate(() => {
    const m = DB.maintenance.find(x => x.id === 'mt_1');
    return { title: m.title, seq: m.seq, cat: m.category, raisedBy: m.raisedBy,
             count: DB.maintenance.length };
  });
  // Edited in place: same record, same reference number, no duplicate.
  expect(edited).toEqual({ title: 'Water leakage in bathroom (re-checked)',
                           seq: 1, cat: 'Plumbing', raisedBy: 'Gul Nawaz', count: 3 });

  /* …and it reaches the register, the search and the export — the three
     surfaces that were printing a blank for every maintenance ticket because
     nothing ever recorded who raised one. */
  await win.evaluate(() => {
    closeModal();
    issuesTab = 'maintenance'; issueFilter.search = ''; issueFilter.month = '';
    renderPage('issues');
  });
  // renderPage() defers its work by 80ms, so the DOM has to be read after it.
  await win.waitForTimeout(450);

  const reaches = await win.evaluate(() => {
    const cell = [...document.querySelectorAll('#content .iss-table tbody tr')]
      .map(r => r.children[2].textContent).join(' | ');
    issueFilter.search = 'Gul Nawaz';
    const hits = issuesFiltered().length;
    issueFilter.search = '';
    const col = _issExportDef(issuesFiltered()).columns.find(c => c.label === 'Raised by');
    const rec = _issAll().find(i => i.id === 'mt_1');
    return { cell, hits, exported: col.value(rec) };
  });
  expect(reaches.cell, 'the register does not name who raised the ticket')
    .toContain('Gul Nawaz');
  expect(reaches.hits, 'searching for who raised it found nothing').toBe(1);
  expect(reaches.exported, 'the export still has a blank Raised by for maintenance')
    .toBe('Gul Nawaz');

  /* A NEW ticket defaults to whoever is signed in — they are the one at the
     keyboard writing it. */
  await win.evaluate(() => { issuesTab = 'maintenance'; showIssueModal(); });
  await win.waitForSelector('#mt-raised', { timeout: 15000 });
  const dflt = await win.evaluate(() => document.getElementById('mt-raised').value);
  expect(dflt, 'a new maintenance ticket does not default to the signed-in user')
    .toBeTruthy();

  await app.close();
});

test('the register and its exports read the same filtered feed', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await seed(win);

  // renderPage() defers its work by 80ms, so the DOM has to be read after it,
  // not in the same turn — reading it synchronously counts the previous render.
  await win.evaluate(() => { issueFilter.category = 'Plumbing'; renderPage('issues'); });
  await win.waitForTimeout(400);

  const same = await win.evaluate(() => ({
    onScreen: document.querySelectorAll('#content .iss-table tbody tr').length,
    inExport: issuesFiltered().length,
    cols: _issExportDef(issuesFiltered()).columns.map(c => c.label),
  }));
  await win.evaluate(() => { issueFilter.category = 'All'; renderPage('issues'); });
  await win.waitForTimeout(300);

  expect(same.onScreen).toBe(2);          // one complaint, one maintenance
  expect(same.inExport).toBe(same.onScreen);
  // The fields the form started capturing are carried by the document too.
  expect(same.cols).toContain('Category');
  expect(same.cols).toContain('Assigned to');

  await app.close();
});

test('the register opens on the current month, and can be widened off it', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await seed(win);

  // seed() widens the scope, so come back through a real navigation — which is
  // what resets the filters to a fresh visit.
  await win.evaluate(() => navigate('dashboard'));
  await win.waitForTimeout(350);
  await win.evaluate(() => { issuesTab = 'all'; navigate('issues'); });
  await win.waitForTimeout(450);

  const opened = await win.evaluate(() => ({
    month: issueFilter.month,
    now: thisMonth(),
    rows: document.querySelectorAll('#content .iss-table tbody tr').length,
    // The stat strip counts the WHOLE register, not the month on screen. That
    // is what stops the month default from hiding an August complaint nobody
    // has answered: the Open card still says it is there.
    stats: [...document.querySelectorAll('#content .lk-stat__val')].map(e => e.textContent.trim()),
  }));
  expect(opened.month).toBe(opened.now);
  expect(opened.rows).toBe(3);            // the September fixtures
  expect(opened.stats[3]).toBe('5');      // Total Issues — all five, both months

  await win.evaluate(() => { issueFilter.month = ''; renderPage('issues'); });
  await win.waitForTimeout(400);
  expect(await win.evaluate(() =>
    document.querySelectorAll('#content .iss-table tbody tr').length)).toBe(5);

  await app.close();
});
