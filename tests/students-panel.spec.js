// ════════════════════════════════════════════════════════════════════════════
// The Student Details slide-over (Students spec §22-§30).
//
// The two assertions that matter most are the ones about data the app does NOT
// have. §28 and §29 are explicit — "do not pretend files exist", "do not
// fabricate previous rooms" — and both are easy to violate by accident, because
// a plausible empty row looks like a working feature. So this pins:
//
//   · Documents lists its types as NOT uploaded with the controls disabled,
//     because `docs` holds exactly one key (`photo`) and there is no CNIC scan
//     or admission form anywhere in the data model.
//   · Room History reads DB.roomShifts, which is real, and says so plainly when
//     a student has never moved rather than inventing a first assignment.
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
}

test.beforeAll(() => { resetProfile(); });

/** One student who has moved room once, with the optional fields filled. */
async function seed(win, opts) {
  await win.evaluate(async (o) => {
    const mo = thisMonth();
    const rt = DB.settings.roomTypes.find(x => x.id === '2s') || DB.settings.roomTypes[0];
    rt.defaultRent = 10000; rt.defaultMess = 7000;
    DB.rooms = [{ id:'r5', number:'5', floor:'Ground', typeId: rt.id, studentIds:[], amenities:[], notes:'' },
                { id:'r3', number:'3', floor:'Ground', typeId: rt.id, studentIds:[], amenities:[], notes:'' }];
    DB.students = [{ id:'066', name:'Mushtaq Ahmad', fatherName:'Sultan Muhammad', roomId:'r5',
      status:'Blacklisted', joinDate:'2026-08-12', messOptIn:true, phone:'0318-9981202',
      emergencyContact:'Sultan Muhammad (father)', emergencyPhone:'03428521842',
      cnic:'17101-3012345-6', occupation:'MDCAT Preparation', nationality:'Pakistani',
      address:'House # 12, Street 4, Gulberg', dob:'2004-03-15', gender:'Male',
      bloodGroup:'B+', session:'2026-27', bed:'1', email:'m@example.com' }];
    DB.payments = [{ id:'pa', studentId:'066', month: mo, date:'2026-09-01', paidDate:'2026-09-01',
      amount:17000, unpaid:0, overpaid:0, status:'Paid', dueDate:'', method:'Cash',
      monthlyRent:10000, messCharge:7000, messIncluded:true,
      extraCharges:[], extraTotal:0, admissionFee:0, concession:0 }];
    DB.roomShifts = o.withShift ? [{ id:'rs1', studentId:'066', studentName:'Mushtaq Ahmad',
      fromRoomId:'r3', fromRoomNumber:'3', toRoomId:'r5', toRoomNumber:'5',
      date:'2026-09-01', reason:'Requested a quieter room' }] : [];
    await saveDB();
  }, opts || {});
  await win.evaluate(() => navigate('students'));
  await win.waitForSelector('.stu-table', { timeout: 8000 });
  await win.waitForTimeout(300);
}

async function openPanel(win) {
  await win.evaluate(() => showStudentPanel('066'));
  await win.waitForSelector('.stu-pan.is-open', { timeout: 6000 });
  await win.waitForTimeout(300);
}

test('it opens over the roster with exactly four tabs, and closes again', async () => {
  const pageErrors = [];
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  const pre = await win.evaluate(() => window.electronAPI.dbAll('students'));
  expect(pre.length, 'SAFETY ABORT: expected an EMPTY isolated DB').toBe(0);

  await seed(win, { withShift: true });
  await openPanel(win);

  // §23: exactly four, in this order, and no fifth.
  expect(await win.evaluate(() => [...document.querySelectorAll('.stu-pan__tab')].map(b => b.innerText.trim())))
    .toEqual(['Overview', 'Financial', 'Documents', 'Room History']);

  // §22: a slide-over, not a page — the table is still behind it.
  expect(await win.evaluate(() => !!document.querySelector('.stu-table'))).toBe(true);
  /* 600, WIDENED FROM 440 BY THE OWNER on 2026-09-06 against the reference
     `student detail.png`. The old range here was the written 400-480; this is a
     deliberate overrule, not drift, and the width is load-bearing for the layout
     above — under ~520 the identity and the action tiles cannot share a band and
     the media query stacks them again. */
  const w = await win.evaluate(() => Math.round(document.querySelector('.stu-pan').getBoundingClientRect().width));
  expect(w, 'the panel is 600 wide, and the action band needs it').toBeGreaterThanOrEqual(560);
  expect(w).toBeLessThanOrEqual(640);

  await win.evaluate(() => closeStudentPanel());
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => !document.querySelector('.stu-pan'))).toBe(true);

  expect(pageErrors).toEqual([]);
  await app.close();
});

test('Overview carries the optional fields, and one guardian pair', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: true });
  await openPanel(win);

  const body = await win.evaluate(() => document.getElementById('stu-panel-body').innerText);

  /* The five the owner asked about. They have been on the record and in the CSV
     all along — students.js says so itself — with nothing rendering them. */
  for (const label of ['Date of birth', 'Gender', 'Marital status', 'Blood group',
                       'Session / semester']) {
    expect(body, 'missing optional field: ' + label).toContain(label);
  }
  expect(body).toContain('15-Mar-2004');
  expect(body).toContain('B+');

  /* ONE PAIR, under the Guardian label (owner). The record carries a single
     emergencyContact/emergencyPhone; §24 lists a guardian AND an emergency
     contact, and inventing the second would put two permanently empty rows on
     screen that no form fills. */
  expect(body).toContain('Guardian name');
  expect(body).toContain('Guardian contact');
  expect(body).not.toContain('Emergency contact');

  // A field with no value reads as not recorded, not as data.
  const empties = await win.evaluate(() =>
    [...document.querySelectorAll('.stu-pan__v.is-empty')].map(e => e.innerText.trim()));
  expect(empties.every(v => v === '—')).toBe(true);

  await app.close();
});

test('Financial reads the real payments, through the §14 layer', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: true });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('financial'));
  await win.waitForTimeout(300);

  const body = await win.evaluate(() => document.getElementById('stu-panel-body').innerText.replace(/\s+/g, ' '));
  expect(body).toContain('PKR 10,000');       // rent
  expect(body).toContain('PKR 7,000');        // mess
  expect(body).toContain('PKR 17,000');       // total, and the payment row
  expect(body).toContain('Rent + Mess');
  expect(body).toMatch(/Payment history/i);   // the heading is uppercased in CSS

  // The figures come from the layer, not from a second calculation here.
  const agree = await win.evaluate(() => {
    const f = calculateFeeStatus('066');
    return { status: f.status, outstanding: f.outstanding, last: f.lastPaymentDate };
  });
  expect(agree.status).toBe('Paid');
  expect(agree.outstanding).toBe(0);
  expect(body).toContain('01-Sept-2026');     // last payment, from the record

  await app.close();
});

test('Documents does not pretend files exist', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: true });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('documents'));
  await win.waitForTimeout(300);

  const doc = await win.evaluate(() => ({
    text: document.getElementById('stu-panel-body').innerText.replace(/\s+/g, ' '),
    rows: [...document.querySelectorAll('.stu-pan__doc__n')].map(n => n.innerText.trim()),
    states: [...document.querySelectorAll('.stu-pan__doc__s')].map(n => n.innerText.trim()),
    disabled: [...document.querySelectorAll('.stu-pan__mini')].map(b => b.disabled),
  }));

  expect(doc.rows).toEqual(['Student photo', 'CNIC / ID document', 'Admission form']);
  /* Nothing is uploaded, because `docs` holds only `photo` and this student has
     none. Every control is disabled and the note says why — §28: show it as a
     planned feature rather than pretend. */
  expect(doc.states.every(s => s === 'Not uploaded')).toBe(true);
  expect(doc.disabled.every(Boolean)).toBe(true);
  expect(doc.text).toMatch(/Document storage is not enabled yet/i);

  await app.close();
});

test('Room History reads real shifts, and says so when there are none', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);

  // With a recorded shift: the move, its reason and its date, from DB.roomShifts.
  await seed(win, { withShift: true });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('history'));
  await win.waitForTimeout(300);
  let body = await win.evaluate(() => document.getElementById('stu-panel-body').innerText.replace(/\s+/g, ' '));
  expect(body).toContain('Room #5');                     // where they are now
  expect(body).toContain('#3');                          // where they came from
  expect(body).toContain('Requested a quieter room');    // the recorded reason
  expect(body).toContain('01-Sept-2026');

  // With none: a plain statement, never a fabricated first assignment (§29).
  await win.evaluate(() => closeStudentPanel());
  await win.waitForTimeout(300);
  await seed(win, { withShift: false });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('history'));
  await win.waitForTimeout(300);
  const none = await win.evaluate(() => ({
    text: document.getElementById('stu-panel-body').innerText.replace(/\s+/g, ' '),
    nodes: [...document.querySelectorAll('.stu-pan__tl')].map(r => r.className),
    tags:  [...document.querySelectorAll('.stu-pan__tl__tag')].map(r => r.innerText.trim()),
  }));
  expect(none.text).toMatch(/No room changes recorded/i);
  /* EXACTLY ONE NODE ON THE TIMELINE, and it is the current room. What must not
     appear is a SECOND node: a move this student never made, or a first
     assignment inferred from the room they happen to be in (§29). */
  expect(none.nodes).toEqual(['stu-pan__tl is-now']);
  expect(none.tags.map(x => x.toLowerCase())).toEqual(['current']);
  expect(none.text).not.toContain('#3');

  await app.close();
});

test('a Blacklisted student fits their own status cell', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });

  /* "Blacklisted" is the longest word this column holds — nearly twice "Left" —
     and it ran under the actions column. The pill is capped and ellipsises
     inside its cell now, so a longer status added later cannot bring this back. */
  const cell = await win.evaluate(() => {
    const td = document.querySelectorAll('.stu-table tbody tr:first-child td')[11];
    return { text: td.innerText.trim(), overflow: td.scrollWidth - td.clientWidth };
  });
  expect(cell.text).toBe('Blacklisted');
  expect(cell.overflow, 'the status cell is overflowing again').toBeLessThanOrEqual(1);

  await app.close();
});

test('every verb the old profile modal had is on the panel', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.waitForTimeout(200);

  /* THE PANEL REPLACED showViewStudentModal, whose footer held Print, Shift
     Room, Edit and Cancel Seat. Dropping any of them makes that workflow
     reachable only from the kebab on the row — which is the quiet way a feature
     disappears in a redesign. */
  await win.evaluate(() => { DB.students[0].status = 'Active'; });
  await openPanel(win);
  const acts = await win.evaluate(() => [...document.querySelectorAll('.stu-pan__act')]
    .map(b => ({ label: b.innerText.trim(), call: b.getAttribute('onclick'),
                 h: Math.round(b.getBoundingClientRect().height),
                 clipped: b.scrollWidth - b.clientWidth })));

  /* CANCEL SEAT IS LAST because it is the conditional one: it shows only for an
     Active student, and a conditional cell anywhere else makes the tiles after
     it move when a student's status changes. */
  expect(acts.map(a => a.label))
    .toEqual(['Edit', 'Move Room', 'Print', 'Payment', 'Delete', 'Cancel Seat']);
  // Each hands off to the function that already owns the workflow.
  expect(acts.find(a => a.label === 'Move Room').call).toContain('showRoomShiftModal');
  expect(acts.find(a => a.label === 'Print').call).toContain('printStudentCard');
  /* Cancel Seat OPENS THE FORM. It used to call quickCancelStudent(), which
     wrote a Pending cancellation on the press with an invented date and reason;
     a button that puts a resident on notice without asking anything is the one
     thing this assertion exists to stop coming back. */
  expect(acts.find(a => a.label === 'Cancel Seat').call).toContain('showAddCancellationModal');
  /* AND THE TILES ARE ONE LINE TALL. Stacked glyph-over-label they were 58px
     each, so two rows came to 122 — taller than the identity beside them, which
     let the buttons rather than the person decide where the tabs started. */
  expect(acts.every(a => a.h <= 40), 'the action tiles have grown tall again').toBe(true);
  expect(acts.find(a => a.label === 'Cancel Seat').call).not.toContain('quickCancel');
  // Print renders a PDF rather than opening a modal, so it leaves the panel up.
  expect(acts.find(a => a.label === 'Print').call).not.toContain('closeStudentPanel');
  /* AND NEITHER DOES DELETE, on the way to the confirm. Closing first meant a
     warden who read the dialog and said no lost the record for saying no. */
  expect(acts.find(a => a.label === 'Delete').call).toContain('confirmDeleteStudent');
  expect(acts.find(a => a.label === 'Delete').call).not.toContain('closeStudentPanel');
  // "Cancel Seat" is the longest label and must fit its cell without clipping.
  expect(acts.every(a => a.clipped <= 0), 'an action label is clipped').toBe(true);

  /* FIVE BANDS, AND ONLY THE BODY SCROLLS (owner §24: "do not make the entire
     drawer — including the header — scroll away"). Every band above the body is
     flex:0 0 auto; the moment one is not, the tab strip is the shortest and
     gives up its height first, drawing its own bottom border through the middle
     of the word "Overview". Print Profile is the only verb in the header,
     because it acts on the drawer's contents rather than on the student (§4). */
  const bands = await win.evaluate(() => {
    const h = s => { const e = document.querySelector(s);
                     return e ? Math.round(e.getBoundingClientRect().height) : null; };
    const b = document.getElementById('stu-panel-body');
    return { tabs: h('.stu-pan__tabs'), foot: h('.stu-pan__foot'),
             headVerbs: [...document.querySelectorAll('.stu-pan__head button')]
                          .map(x => x.innerText.trim()).filter(Boolean),
             sub: (document.querySelector('.stu-pan__sub') || {}).innerText,
             closable: !!document.querySelector('.stu-pan__x')
                    && document.querySelector('.stu-pan__x').getBoundingClientRect().width > 10,
             scrolls: getComputedStyle(b).overflowY };
  });
  expect(bands.sub).toBe('Complete profile and information');
  expect(bands.headVerbs, 'the header took on a verb that belongs to the student')
    .toEqual(['Print Profile']);
  /* The close button lost its dimensions once when the header was recomposed
     and collapsed to nothing, which is not a small bug in a modal surface. */
  expect(bands.closable, 'the drawer has no visible way out').toBe(true);
  expect(bands.tabs, 'the tab strip is being squashed again').toBeGreaterThanOrEqual(40);
  expect(bands.foot).toBeGreaterThanOrEqual(24);
  expect(bands.scrolls, 'the body is not the band that scrolls').toBe('auto');

  /* CANCEL SEAT IS CONDITIONAL, as it was in the modal. Offering it to someone
     who has already left either duplicates a cancellation or fails with a
     message the warden cannot act on. */
  await win.evaluate(() => closeStudentPanel());
  await win.waitForTimeout(300);
  await win.evaluate(() => { DB.students[0].status = 'Left'; });
  await openPanel(win);
  expect(await win.evaluate(() => [...document.querySelectorAll('.stu-pan__act')]
    .map(b => b.innerText.trim())))
    .toEqual(['Edit', 'Move Room', 'Print', 'Payment', 'Delete']);

  await app.close();
});

test('the panel clears the title bar, and no band is squashed', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.waitForTimeout(200);
  await openPanel(win);

  const geo = await win.evaluate(() => {
    const box = s => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; };
    return { bar: box('#hz-titlebar'), pan: box('.stu-pan'), scrim: box('.stu-pan__scrim'),
             tabs: box('.stu-pan__tabs'), head: box('.stu-pan__head'),
             tabH: Math.round(document.querySelector('.stu-pan__tab').getBoundingClientRect().height) };
  });

  /* THE BAR SITS AT z-index 100000, above modals on purpose. A panel pinned to
     top:0 therefore put its own header — the title and the close button —
     underneath it, and the panel looked headerless. */
  expect(geo.pan.top).toBe(geo.bar.top + geo.bar.h);
  expect(geo.scrim.top).toBe(geo.pan.top);

  /* AND NO BAND MAY SHRINK. .stu-pan is a column flex container, so a band left
     at the default flex-shrink:1 gives up height when the content is taller
     than the panel. The tab strip lost 13px that way and drew its own bottom
     border through the middle of the word "Overview". */
  expect(geo.tabs.h).toBeGreaterThanOrEqual(geo.tabH);
  expect(geo.head.h).toBeGreaterThanOrEqual(30);

  await app.close();
});

test('Financial carries the old profile ledger, whole', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });

  /* Three records with the shapes the ledger exists to explain: one pending, one
     clean, one with a concession. A digest that drops the concession column
     cannot say why the third row paid 14,000 against a 14,500 charge. */
  await win.evaluate(async () => {
    const base = { monthlyRent: 14500, messCharge: 0, messIncluded: false, method: 'Cash',
                   extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0,
                   studentId: '066', studentName: 'Mushtaq Ahmad' };
    DB.payments = [
      Object.assign({}, base, { id:'q1', month:'2026-09', amount:0, unpaid:14500, overpaid:0,
        status:'Pending', date:'2026-09-02', dueDate:'2026-09-10' }),
      Object.assign({}, base, { id:'q2', month:'2026-08', amount:14500, unpaid:0, overpaid:0,
        status:'Paid', date:'2026-08-01', paidDate:'2026-08-01' }),
      Object.assign({}, base, { id:'q3', month:'2026-07', amount:14000, unpaid:0, overpaid:0,
        status:'Paid', date:'2026-07-03', paidDate:'2026-07-03', concession:500 }),
    ];
    await saveDB();
  });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('financial'));
  await win.waitForTimeout(300);

  const led = await win.evaluate(() => ({
    bar:  document.querySelector('.svw-card__head--bar').innerText.replace(/\s+/g, ' '),
    head: [...document.querySelectorAll('.svw-t thead th')].map(h => h.innerText.trim()),
    rows: [...document.querySelectorAll('.svw-t tbody tr')].map(r =>
            [...r.children].map(c => c.innerText.replace(/\s+/g, ' ').trim())),
    foot: document.querySelector('.svw-tfoot').innerText.trim(),
    acts: [...document.querySelectorAll('.svw-t tbody tr')].map(r =>
            [...r.querySelectorAll('.svw-ia')].map(b => b.title)),
    overflow: (() => { const w = document.querySelector('.svw-tw');
                       return Math.max(0, w.scrollWidth - w.clientWidth); })(),
    kebabs: document.querySelectorAll('.svw-t tbody .svw-kebab').length,
  }));

  // ALL NINE COLUMNS, in the modal's order.
  // Uppercased in CSS, so compare on the words rather than their casing.
  expect(led.head.map(h => h.toLowerCase()))
    .toEqual(['month', 'monthly rent', 'concession', 'paid (+extras)',
              'unpaid', 'method', 'status', 'date', 'actions']);
  expect(led.bar).toContain('Full Payment History (3 records)');
  expect(led.bar).toContain('Total paid: PKR 28,500');
  expect(led.bar).toContain('Due PKR 14,500');
  /* The footer states the count AND carries the way out to the full Payments
     list, which is filtered to this student on the way — getting there used to
     mean closing the drawer and typing the name back in. */
  expect(led.foot.replace(/\s+/g, ' ')).toBe('Showing 3 of 3 records View all payments');

  // The concession is broken out under the paid figure, which is the point.
  expect(led.rows[2][2]).toBe('−PKR 500');
  expect(led.rows[2][3]).toContain('PKR 14,000');
  expect(led.rows[2][3]).toContain('concession');
  // Unpaid comes from calculateOutstanding, not the stored field.
  expect(led.rows[0][4]).toBe('PKR 14,500');
  expect(led.rows[1][4]).toBe('—');

  /* THE FOUR ROW ACTIONS ARE BEHIND A KEBAB in the drawer — one per row, the
     same four verbs, and Mark Paid still only where there is something to
     collect. The four-button cell they replaced was 159px of the table's 1005,
     the single largest reason nine columns would not fit. What the menu holds
     is asserted in "the ledger row menu carries the four verbs"; what matters
     here is that every row still has one, because they are the only place a
     warden can settle a pending record or reprint a receipt without leaving for
     Payments and finding the row again. */
  expect(led.kebabs).toBe(3);
  expect(led.acts.every(a => a.length === 0),
    'the drawer ledger went back to four buttons a row').toBe(true);

  /* NINE COLUMNS NOW ESSENTIALLY FIT. They wanted 1005px when this table was
     the modal's, laid out for a full-width screen; in the panel it is 575
     against a 572 card. Three changes got it there and NONE of them dropped a
     column — dropping columns is what the digest this replaced did, and the two
     it dropped were concession and the extras, the pair that answer "why is
     this figure not the rent": wrapped headers, one kebab instead of four row
     buttons, and the rent split without its repeated unit.

     The assertion is a BUDGET, not a boolean. A longer payment method or a
     wider date will push it a few pixels over on somebody's data, and that is
     what .svw-tw is for; what must never happen is the overflow escaping into
     the panel body, because a horizontally scrolling body moves the content
     under the cursor as you read down it. */
  expect(led.overflow, 'the ledger has grown well past its card again')
    .toBeLessThanOrEqual(40);
  expect(await win.evaluate(() => {
    const b = document.getElementById('stu-panel-body');
    return b.scrollWidth - b.clientWidth;
  }), 'the panel body is being pushed sideways').toBeLessThanOrEqual(1);

  await app.close();
});

test('a form opens over the panel, and the panel is still there after it', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });
  await openPanel(win);

  /* THE BUG THIS PINS: every action used to close the panel first, because the
     panel sat at z-index 1401 and .modal-overlay sits at 350 — a form opened
     from here rendered underneath it. So closing the form left the warden back
     at the table, having to find the student and click again. */
  const opened = await win.evaluate(() => {
    const b = [...document.querySelectorAll('.stu-pan__act')].find(x => x.innerText.trim() === 'Edit');
    if (!b) return 'no Edit button';
    b.click();
    return b.getAttribute('onclick');
  });
  await win.waitForTimeout(700);
  expect(opened, 'Edit did not fire').toContain('showEditStudentModal');

  const layered = await win.evaluate(() => ({
    modal: !!document.querySelector('.modal-overlay'),
    panel: !!document.querySelector('.stu-pan'),
    modalZ: +getComputedStyle(document.querySelector('.modal-overlay')).zIndex,
    panelZ: +getComputedStyle(document.querySelector('.stu-pan')).zIndex,
  }));
  expect(layered.modal && layered.panel, 'both must be on screen at once').toBe(true);
  expect(layered.modalZ, 'the form must render above the panel').toBeGreaterThan(layered.panelZ);

  // Escape belongs to the form while one is open, not to the panel behind it.
  await win.keyboard.press('Escape');
  await win.waitForTimeout(300);
  expect(await win.evaluate(() => !!document.querySelector('.stu-pan'))).toBe(true);

  // And closing the form leaves the record exactly where it was.
  await win.evaluate(() => closeModal());
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => !!document.querySelector('.stu-pan.is-open'))).toBe(true);
  expect(await win.evaluate(() => !document.querySelector('.modal-overlay'))).toBe(true);

  /* closeModal() re-reads the record on its way out, so an edit saved in the
     form is on the panel immediately rather than a reopen later. */
  await win.evaluate(async () => { DB.students[0].bloodGroup = 'O−'; await saveDB(); closeModal(); });
  await win.waitForTimeout(300);
  expect(await win.evaluate(() => document.getElementById('stu-panel-body').innerText))
    .toContain('O−');

  // Escape with no form up still closes the panel.
  await win.keyboard.press('Escape');
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => !document.querySelector('.stu-pan'))).toBe(true);

  await app.close();
});

/* ════════════════════════════════════════════════════════════════════════════
   THE DENSITY PASS (owner, 2026-09-06, against `error1.png` and
   `financial section vievport.png`): "the overview detail should be all
   available to see at once without much dragging … reduce the size of the
   buttons … and then look at the financial section, very much free space".

   Both tabs were a column of label/value rows with an empty half beside every
   value. The fix is the same in both — the card body pairs its fields — and
   these assertions pin the SHAPE rather than a pixel count, because a pixel
   count is a promise about somebody else's data.
   ════════════════════════════════════════════════════════════════════════════ */
test('the tabs pair their fields instead of stacking them', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.waitForTimeout(200);
  await openPanel(win);

  const ov = await win.evaluate(() => {
    const cols = [...document.querySelectorAll('.stu-pan__cols > .stu-pan__col')];
    const body = document.getElementById('stu-panel-body');
    const titles = c => [...c.querySelectorAll('.stu-pan__card__h')]
                          .map(h => h.childNodes[1].textContent.trim());
    return {
      colCount: cols.length,
      left:  cols[0] ? titles(cols[0]) : [],
      right: cols[1] ? titles(cols[1]) : [],
      skew: cols.length === 2
        ? Math.abs(Math.round(cols[0].getBoundingClientRect().height
                            - cols[1].getBoundingClientRect().height)) : 9999,
      edits: document.querySelectorAll('.stu-pan__cedit').length,
      notesWide: !!document.querySelector('.stu-pan__card.is-wide'),
      overflow: body.scrollHeight - body.clientHeight,
      sideways: body.scrollWidth - body.clientWidth,
    };
  });

  /* TWO COLUMNS OF CARDS, NOT SIX FULL-WIDTH SECTIONS (§17). §10-§12 name the
     right column for Contact, Academic and Current Room; §9 and §13 name the
     left for Personal and Status & Fee. */
  expect(ov.colCount).toBe(2);
  expect(ov.left).toEqual(['Personal Information', 'Status & Fee']);
  expect(ov.right).toEqual(['Contact & Guardian', 'Academic Information', 'Current Room']);
  /* Balance is the point of the split. A column running far past its neighbour
     puts the drawer back to scrolling through white space, which is the exact
     fault §17 describes. */
  expect(ov.skew, 'the two columns are badly out of balance').toBeLessThanOrEqual(220);
  // Every card can correct itself without a trip back to the action grid.
  expect(ov.edits).toBe(6);
  expect(ov.notesWide, 'Notes should be the full-width card at the bottom').toBe(true);
  expect(ov.sideways, 'the Overview must never scroll sideways').toBeLessThanOrEqual(1);
  /* A budget, not a boundary. 34 facts and six headings do not fit the ~420px a
     768-tall window leaves under the header, the profile, the actions and the
     tabs — but the Overview was ~520px of scroll before this and is under 200
     now. This catches a return to anything like the old shape. */
  expect(ov.overflow, 'the Overview is back to being a long scroll')
    .toBeLessThanOrEqual(230);

  await win.evaluate(() => stuPanelTab('financial'));
  await win.waitForTimeout(300);
  const fin = await win.evaluate(() => {
    const rows = [...document.querySelectorAll('.stu-pan__card__b.is-2col .stu-pan__f')]
      .map(f => Math.round(f.getBoundingClientRect().left));
    return { cols: new Set(rows).size,
             labels: [...document.querySelectorAll('.stu-pan__card__b.is-2col .stu-pan__k')]
                       .map(k => k.innerText.trim()) };
  });
  /* Charges & Balance is FULL WIDTH here, so unlike the Overview's half-width
     cards it has the room to pair its fields. */
  expect(fin.cols, 'Charges & Balance is still one column').toBe(2);
  /* The column break is the meaning: what is billed on the left, where the
     student stands against it on the right. */
  expect(fin.labels.slice(0, 4))
    .toEqual(['Monthly rent', 'Outstanding', 'Mess charge', 'Last payment']);

  await app.close();
});

test('the ledger row menu carries the four verbs, and only what applies', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });

  await win.evaluate(async () => {
    const base = { monthlyRent: 14500, messCharge: 0, messIncluded: false, method: 'Cash',
                   extraCharges: [], extraTotal: 0, admissionFee: 0, concession: 0,
                   studentId: '066', studentName: 'Mushtaq Ahmad' };
    DB.payments = [
      Object.assign({}, base, { id: 'q1', month: '2026-09', amount: 0, unpaid: 14500,
        status: 'Pending', date: '2026-09-02' }),
      Object.assign({}, base, { id: 'q2', month: '2026-08', amount: 14500, unpaid: 0,
        status: 'Paid', date: '2026-08-01', paidDate: '2026-08-01' }),
    ];
    await saveDB();
  });
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('financial'));
  await win.waitForTimeout(300);

  /* ONE KEBAB PER ROW, NOT FOUR BUTTONS. The four-button cell was 159px of the
     table's 1005 — the single largest reason nine columns would not fit. */
  expect(await win.evaluate(() => document.querySelectorAll('.svw-t tbody .svw-kebab').length))
    .toBe(2);

  // The pending row offers Mark paid; the settled row must not.
  await win.evaluate(() => document.querySelectorAll('.svw-t tbody .svw-kebab')[0].click());
  await win.waitForSelector('#stu-rmenu', { timeout: 4000 });
  expect(await win.evaluate(
    () => [...document.querySelectorAll('#stu-rmenu button')].map(b => b.innerText.trim())))
    .toEqual(['Mark paid', 'Print receipt', 'Edit payment', 'Delete payment']);

  await win.evaluate(() => closeStuRowMenu());
  await win.evaluate(() => document.querySelectorAll('.svw-t tbody .svw-kebab')[1].click());
  await win.waitForSelector('#stu-rmenu', { timeout: 4000 });
  expect(await win.evaluate(
    () => [...document.querySelectorAll('#stu-rmenu button')].map(b => b.innerText.trim())),
    'a settled record was offered Mark paid')
    .toEqual(['Print receipt', 'Edit payment', 'Delete payment']);

  await win.evaluate(() => closeStuRowMenu());
  await app.close();
});

test('Documents offers Download only where there is a file', async () => {
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await login(win);
  await win.waitForTimeout(400);
  await seed(win, { withShift: false });

  // No photo on the record yet: every control stays disabled (§28).
  await openPanel(win);
  await win.evaluate(() => stuPanelTab('documents'));
  await win.waitForTimeout(300);
  expect(await win.evaluate(
    () => [...document.querySelectorAll('.stu-pan__doc__a button')]
            .map(b => b.innerText.trim() + ':' + (b.disabled ? 'off' : 'on'))))
    .toEqual(['View:off', 'Download:off', 'View:off', 'Download:off', 'View:off', 'Download:off']);

  /* WITH a photo, the photo's two controls come alive and the other two rows do
     not — there is still no CNIC scan and no admission form in the data model,
     and a Download that produces no file is worse than one visibly not ready. */
  await win.evaluate(async () => {
    DB.students[0].docs = { photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
      + 'CAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
    await saveDB();
  });
  await win.evaluate(() => { refreshStudentPanel(); stuPanelTab('documents'); });
  await win.waitForTimeout(300);
  expect(await win.evaluate(
    () => [...document.querySelectorAll('.stu-pan__doc__a button')]
            .map(b => b.innerText.trim() + ':' + (b.disabled ? 'off' : 'on'))))
    .toEqual(['View:on', 'Download:on', 'View:off', 'Download:off', 'View:off', 'Download:off']);

  /* The file it would save: named for the student, and carrying the extension
     the data URI's own MIME type declares. Renaming a PNG to .jpg produces a
     file Windows Photos refuses to open, which is why the type is read rather
     than assumed. And it goes out as a blob: a multi-megabyte data URI on an
     href is where a real photo silently fails to save. */
  const saved = await win.evaluate(() => {
    const real = HTMLAnchorElement.prototype.click;
    let got = null;
    HTMLAnchorElement.prototype.click = function () { got = { name: this.download, href: this.href }; };
    try { stuDownloadDoc('066'); } finally { HTMLAnchorElement.prototype.click = real; }
    return got;
  });
  expect(saved, 'Download produced no file at all').not.toBeNull();
  expect(saved.name).toBe('Photo-Mushtaq-Ahmad-066.png');
  expect(saved.href.startsWith('blob:')).toBe(true);

  await app.close();
});
