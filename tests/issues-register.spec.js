// ════════════════════════════════════════════════════════════════════════════
// The Complaints register — ONE register, ONE form (owner, 2026-09-21).
//
// Maintenance and complaints were two collections behind a three-tab strip and
// two forms. They are one `issues` collection now, and the CATEGORY decides
// which kind a new record is: Maintenance numbers MA-, everything else CO-.
// Redesigned 2026-09-08 to `complaints2.png`; merged 2026-09-21.
//
// What this file holds closed, and why each one is here:
//
//  0. The merge itself: one list carrying both kinds, both reference series
//     intact, the category deciding the kind of a NEW record and never
//     renumbering an existing one, and a staff-raised job still loggable
//     without a student.
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

    /* ONE collection, both kinds, in the shape migration 003 leaves them:
       `kind` stamped, `title` for what a complaint used to call `subject`. The
       two series are independent, so MA-0001 and CO-0001 both exist. */
    DB.issues = [
      { id: 'mt_1', kind: 'maintenance', seq: 1, title: 'Water leakage in bathroom',
        description: 'Leaking tap.', roomId: r0.id, category: 'Plumbing', priority: 'High',
        location: 'Bathroom', date: '2026-09-02', expectedDate: '2026-09-05',
        assignedTo: 'Azat Ullah', status: 'Open', resolvedDate: '' },
      { id: 'mt_2', kind: 'maintenance', seq: 2, title: 'Fan not working',
        description: 'Noisy fan.', roomId: r1.id, category: 'Electrical', priority: 'Medium',
        date: '2026-09-05', expectedDate: '2026-09-20', assignedTo: 'Hikmat Ullah',
        status: 'InProgress', resolvedDate: '' },
      // Pre-2026-09-08 shape: no category, no assignee, no expected date.
      { id: 'mt_3', kind: 'maintenance', seq: 3, title: 'WiFi dead on first floor',
        description: 'No internet.', roomId: r1.id, priority: 'Low', date: '2026-08-11',
        status: 'Open', resolvedDate: '' },
      { id: 'cp_1', kind: 'complaint', seq: 1, title: 'No hot water',
        description: 'Geyser cold before 8am.', studentId: 'stu-a', category: 'Plumbing',
        priority: 'High', assignedTo: 'Azat Ullah', date: '2026-09-03',
        expectedDate: '2026-09-06', status: 'Open', resolvedDate: '', response: '' },
      // Pre-2026-09-08 shape: no category, no priority, no assignee.
      { id: 'cp_2', kind: 'complaint', seq: 2, title: 'Noise after midnight',
        description: 'Music late.', studentId: 'stu-b', date: '2026-08-20', status: 'Resolved',
        resolvedDate: '2026-08-24', response: 'Warned the residents.' },
    ];
    DB.maintenance = [];        // migration 003's rollback copies; nothing reads them
    DB.complaints = [];
    await saveDB();
  });
  /* The register opens scoped to the CURRENT month (owner, 2026-09-08), and
     these fixtures deliberately straddle August and September so the legacy
     shapes are covered. Every structural test below wants the whole register,
     so the scope is widened here; the default itself is asserted on its own,
     in `the register opens on the current month` at the foot of this file. */
  await win.evaluate(() => {
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
  /* Sentence case since the stage-4 rebuild: the spec's table rule is
     sentence-case headers, and "Reported On" / "Assigned To" were the last two
     Title Case ones on the register. The COLUMNS are what this asserts, and
     they are unchanged. */
  expect(heads).toEqual(['#', 'Issue', 'Raised by', 'Room', 'Category', 'Priority',
                         'Status', 'Reported on', 'Assigned to', 'Actions']);

  const rows = await win.evaluate(() =>
    document.querySelectorAll('#content .iss-table tbody tr').length);
  expect(rows).toBe(5);

  // The two legacy records account for every dash in the category and
  // assigned-to columns; nothing is invented to fill them, and nothing else
  // is missing either.
  const gaps = await win.evaluate(() => ({
    category: [...document.querySelectorAll('#content .iss-table tbody tr')]
      .filter(r => r.children[4].querySelector('.iss-dash')).length,
    assigned: [...document.querySelectorAll('#content .iss-table tbody tr')]
      .filter(r => r.children[8].querySelector('.iss-dash')).length,
    /* A record with nobody recorded as having reported it is a dash. These
       seeded maintenance tickets predate the "Raised by" field, so they still
       have nothing to show — and show nothing rather than a guess. A ticket
       written through the form from now on carries a name here. */
    student: [...document.querySelectorAll('#content .iss-table tbody tr')]
      .filter(r => r.children[2].querySelector('.iss-dash')).length,
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

test('a category is coloured but outlined; priority and status stay solid', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await seed(win);

  const paint = await win.evaluate(() => {
    const grab = (n) => [...document.querySelectorAll(
      `#content .iss-table tbody tr td:nth-child(${n}) .ui-chip`)]
      .map(c => getComputedStyle(c).backgroundColor + '|' + getComputedStyle(c).color);
    const border = (n) => [...document.querySelectorAll(
      `#content .iss-table tbody tr td:nth-child(${n}) .ui-chip`)]
      .map(c => getComputedStyle(c).borderTopWidth);
    return {
      cat: grab(5), prio: grab(6), status: grab(7),
      catBorder: border(5), prioBorder: border(6), statusBorder: border(7),
      /* The Kind mark in column 1 marked which register a row belonged to. It
         was REMOVED on 2026-09-23, when Maintenance became a category — the
         Category chip already shows it, and the page no longer makes the
         distinction. Asserted at zero so it cannot come back as a second
         classification of the row. */
      kind: [...document.querySelectorAll('#content .iss-table .iss-kind')]
        .map(e => getComputedStyle(e).color),
    };
  });

  /* ── A CATEGORY CARRIES ITS OWN COLOUR NOW (owner, 2026-09-23) ────────────
     This asserted that every category chip painted identically — the
     2026-09-16 ruling that hue is reserved for state. The owner reversed it
     after their own expense reference drew categories coloured, and the
     scanning it buys on an eleven-category register is real.

     WHAT REPLACES THE OLD GUARANTEE IS THE SHAPE. Hue alone no longer
     separates "Groceries" from "High priority", so the chip does: a CATEGORY
     is a light tint inside a ruled edge, a ROLE chip is a solid tint with no
     border. That is the property worth pinning, because it is the one that
     keeps a red category from reading as a red state. */
  expect(new Set(paint.cat).size, 'categories no longer carry their own colour')
    .toBeGreaterThan(1);
  expect(paint.cat.length).toBeGreaterThan(1);

  // The category is outlined; priority and status are not.
  expect(new Set(paint.catBorder), 'a category chip lost its outline')
    .toEqual(new Set(['1px']));
  expect(new Set([...paint.prioBorder, ...paint.statusBorder]),
    'a role chip grew an outline and now looks like a category')
    .toEqual(new Set(['0px']));

  // The kind mark is gone — Maintenance is a category now, not a second class.
  expect(paint.kind, 'the kind glyph came back beside the category chip').toEqual([]);

  // Priority and status do not: they are state, and state is what hue is for.
  expect(new Set(paint.prio).size).toBeGreaterThan(1);
  expect(new Set(paint.status).size).toBeGreaterThan(1);
  // …and neither of them paints the same as a category chip.
  expect(paint.prio.includes(paint.cat[0])).toBe(false);
  expect(paint.status.includes(paint.cat[0])).toBe(false);

  await app.close();
});

test('ONE form: the category decides the kind, and an edit never renumbers', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await seed(win);

  // -- There is no kind to choose any more ----------------------------------
  await win.evaluate(() => showIssueModal());
  await win.waitForSelector('#mt-title', { timeout: 15000 });

  const formShape = await win.evaluate(() => ({
    // The Maintenance / Complaint switcher is gone: the category decides.
    kindSwitch: !!document.getElementById('ib-maint') || !!document.getElementById('ib-comp'),
    // The second form is gone with it.
    secondForm: !!document.getElementById('if-comp'),
    // Maintenance is a CATEGORY now, and it is offered.
    cats: [...document.getElementById('mt-category').options].map(o => o.value),
    // "Raised by" survives, and it asks a different question: WHO reported it.
    raisedBy: !!document.getElementById('mt-by-stu') && !!document.getElementById('mt-by-staff'),
  }));
  expect(formShape.kindSwitch, 'the old kind switcher is still on the form').toBe(false);
  expect(formShape.secondForm, 'the second form is still in the DOM').toBe(false);
  expect(formShape.cats).toContain('Maintenance');
  expect(formShape.cats).toContain('Plumbing');
  expect(formShape.raisedBy, 'a staff-raised job can no longer be logged').toBe(true);

  // -- A student-raised issue, category Furniture -> a COMPLAINT, CO- --------
  const room = await win.evaluate(() => {
    const sel = document.getElementById('mt-raised-stu');
    sel.value = 'stu-a';
    sel.dispatchEvent(new Event('change'));
    return document.getElementById('mt-room').value;
  });
  const expectedRoom = await win.evaluate(() =>
    DB.students.find(t => t.id === 'stu-a').roomId);
  expect(room, 'the room does not follow the student who raised it').toBe(expectedRoom);

  await win.evaluate(async () => {
    document.getElementById('mt-title').value = 'Broken window latch';
    document.getElementById('mt-desc').value = 'The latch will not close.';
    document.getElementById('mt-category').value = 'Furniture';
    document.getElementById('mt-assigned').value = 'Azat Ullah';
    await saveIssue();
  });
  await win.waitForTimeout(450);

  const added = await win.evaluate(() => {
    const c = (DB.issues || []).find(x => x.title === 'Broken window latch');
    const shown = _issAll().find(i => i.id === c.id);
    return { kind: c.kind, cat: c.category, prio: c.priority, asg: c.assignedTo,
             stu: c.studentId, raisedById: c.raisedById, status: c.status,
             seq: c.seq, ref: _issSeq(shown), count: DB.issues.length };
  });
  /* A complaint, because Furniture is not Maintenance. It takes the NEXT
     complaint number - CO-0003 after the two seeded - and the maintenance
     series is untouched. The resident is stored as `studentId`, the key a
     complaint has always used. */
  expect(added).toMatchObject({ kind: 'complaint', cat: 'Furniture', prio: 'Medium',
    asg: 'Azat Ullah', stu: 'stu-a', raisedById: '', status: 'Open',
    seq: 3, ref: 'CO-0003', count: 6 });

  /* ── CATEGORY MAINTENANCE IS NOW AN ORDINARY COMPLAINT ────────────────────
     Owner, 2026-09-23: "the maintenance be treated as a category just like
     plumbing or electrical and should be labelled as a complaint, because we
     are building a separate maintenance page later".

     `_issKindFor()` returned 'maintenance' for this one category name, which
     gave those records their own MA- series and a different room rule. Every
     NEW record is a complaint now; the category is just a category.

     WHAT MUST NOT CHANGE, and is asserted below: records already filed as
     maintenance keep `kind:'maintenance'`, keep their MA- references and keep
     counting in their own series. A reference is identity — it has been
     printed and quoted — and renumbering one to tidy a label would break every
     record that names it. */
  await win.evaluate(() => showIssueModal());
  await win.waitForSelector('#mt-title', { timeout: 15000 });
  await win.evaluate(() => _issMtRaiser('staff'));
  await win.waitForSelector('#mt-raised', { timeout: 15000 });

  /* Choosing Staff pre-fills whoever is signed in - they are the one at the
     keyboard writing it. The guarantee predates the merge and survives it. */
  expect(await win.evaluate(() => document.getElementById('mt-raised').value),
    'choosing Staff does not pre-fill the signed-in user').toBeTruthy();

  await win.evaluate(async () => {
    document.getElementById('mt-title').value = 'Burst pipe in the kitchen';
    document.getElementById('mt-category').value = 'Maintenance';
    document.getElementById('mt-raised').value = 'Gul Nawaz';
    document.getElementById('mt-location').value = 'Kitchen';
    await saveIssue();
  });
  await win.waitForTimeout(450);

  const job = await win.evaluate(() => {
    const m = (DB.issues || []).find(x => x.title === 'Burst pipe in the kitchen');
    return { kind: m.kind, seq: m.seq, ref: _issSeq(_issAll().find(i => i.id === m.id)),
             raisedBy: m.raisedBy, studentId: m.studentId, loc: m.location,
             idPrefix: m.id.slice(0, 3) };
  });
  /* THE RECORD NOBODY COULD HAVE LOGGED without the Raised by switch: a job
     reported by the cook, with no student behind it at all. It is a COMPLAINT
     now, in the complaint series — CO-0004, after the CO-0003 above. */
  expect(job).toMatchObject({ kind: 'complaint', seq: 4, ref: 'CO-0004',
    raisedBy: 'Gul Nawaz', studentId: '', loc: 'Kitchen', idPrefix: 'cp_' });

  /* THE ROOM SURVIVES THE CHANGE, and this is the regression the change could
     have caused. `_issAll()` used to read a complaint's room from its STUDENT
     and a maintenance ticket's from its stored `roomId`; a staff-raised job
     has no student, so as a complaint its room would have resolved to '' and
     vanished from the register. The stored roomId is the fallback now. */
  const jobRoom = await win.evaluate(() => {
    const m = (DB.issues || []).find(x => x.title === 'Burst pipe in the kitchen');
    m.roomId = (DB.rooms[0] || {}).id;
    const shown = _issAll().find(i => i.id === m.id);
    return { stored: String((DB.rooms[0] || {}).number), shown: shown.roomNo };
  });
  expect(jobRoom.shown, 'a staff-raised job lost the room it was filed against')
    .toBe(jobRoom.stored);

  // -- Editing keeps the record, its number AND its kind --------------------
  await win.evaluate(() => showIssueModal('mt_1'));
  await win.waitForSelector('#mt-title', { timeout: 15000 });

  const prefill = await win.evaluate(() => ({
    title: document.getElementById('mt-title').value,
    cat: document.getElementById('mt-category').value,
    prio: document.getElementById('mt-priority').value,
    loc: document.getElementById('mt-location').value,
    exp: document.getElementById('mt-expected').value,
    asg: document.getElementById('mt-assigned').value,
  }));
  expect(prefill).toEqual({ title: 'Water leakage in bathroom', cat: 'Plumbing',
    prio: 'High', loc: 'Bathroom', exp: '2026-09-05', asg: 'Azat Ullah' });

  /* RE-CATEGORISING MUST NOT REISSUE THE NUMBER. mt_1 is a maintenance record
     filed under Plumbing; moving it to a category that would make a NEW record
     a complaint has to leave it MA-0001, because that number may already be on
     a printed sheet. The kind is set once, at creation. */
  await win.evaluate(async () => {
    document.getElementById('mt-title').value = 'Water leakage in bathroom (re-checked)';
    document.getElementById('mt-category').value = 'Cleanliness';
    document.getElementById('mt-raised').value = 'Gul Nawaz';
    await saveIssue('mt_1');
  });
  await win.waitForTimeout(450);

  const edited = await win.evaluate(() => {
    const m = (DB.issues || []).find(x => x.id === 'mt_1');
    return { title: m.title, kind: m.kind, seq: m.seq, cat: m.category,
             raisedBy: m.raisedBy, ref: _issSeq(_issAll().find(i => i.id === 'mt_1')),
             count: DB.issues.length };
  });
  expect(edited).toEqual({ title: 'Water leakage in bathroom (re-checked)',
    kind: 'maintenance', seq: 1, cat: 'Cleanliness', raisedBy: 'Gul Nawaz',
    ref: 'MA-0001', count: 7 });

  /* ...and who raised it reaches the register, the search and the export - the
     three surfaces that printed a blank for every maintenance ticket before
     the field existed. */
  await win.evaluate(() => {
    closeModal();
    issueFilter.search = ''; issueFilter.month = '';
    renderPage('issues');
  });
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
  expect(reaches.hits, 'searching for who raised it found nothing').toBe(2);
  expect(reaches.exported, 'the export still has a blank Raised by for maintenance')
    .toBe('Gul Nawaz');

  await app.close();
});

test('the register is ONE list: both kinds together, and no tab strip', async () => {
  test.setTimeout(240000);
  const { app, win } = await launch();
  await seed(win);

  const one = await win.evaluate(() => ({
    // The three-tab strip went with the merge.
    tabs: document.querySelectorAll('#content .iss-tabs [role="tab"]').length,
    // Both kinds are on screen at once, under both reference series.
    refs: [...document.querySelectorAll('#content .iss-table tbody tr')]
      .map(r => r.children[0].textContent.trim()),
  }));

  expect(one.tabs, 'the tab strip is still there, so this is not one register').toBe(0);
  expect(one.refs.some(r => /MA-\d{4}/.test(r)), 'no maintenance record on screen').toBe(true);
  expect(one.refs.some(r => /CO-\d{4}/.test(r)), 'no complaint on screen').toBe(true);
  /* Both series START AT 1 and do not collide - they are independent, which is
     the whole reason the merge kept two prefixes instead of renumbering. */
  expect(one.refs).toContain('MA-0001');
  expect(one.refs).toContain('CO-0001');

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
  await win.evaluate(() => navigate('issues'));
  await win.waitForTimeout(450);

  const opened = await win.evaluate(() => ({
    month: issueFilter.month,
    now: thisMonth(),
    rows: document.querySelectorAll('#content .iss-table tbody tr').length,
    // The stat strip counts the WHOLE register, not the month on screen. That
    // is what stops the month default from hiding an August complaint nobody
    // has answered: the Open card still says it is there.
    stats: [...document.querySelectorAll('#content .ui-stat__v')].map(e => e.textContent.trim()),
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
