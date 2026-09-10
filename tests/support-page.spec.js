// ════════════════════════════════════════════════════════════════════════════
// Help & Support — built 2026-09-10 to the owner's reference, `support.png`.
//
// The control plane's machine-facing surface is four endpoints — healthz,
// device register, device token, entitlement — and none of them is a ticket or
// an article. That is not a reason to draw the page dead; it is a reason to
// build each block out of something that exists on this computer. What this
// file holds is the three promises that makes:
//
//   1. A REQUEST IS NEVER LOST. The ticket is written to the database BEFORE
//      anything is sent, so a warden typing out a problem at 11pm on a bad
//      connection still has it in the morning. And it is stamped "sent" only
//      if something really opened — marking it sent because the attempt was
//      made is how somebody comes to believe support has their problem when
//      nothing ever left the machine.
//   2. THE GUIDES ARE REAL AND OFFLINE. They ship in the asar. No fetch.
//   3. THE DIAGNOSTICS CARRY NO CREDENTIAL. The licence key and Machine ID
//      identify the installation; the device token and the signed entitlement
//      are replayable and must never appear.
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
  await win.setViewportSize({ width: 1366, height: 768 });
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
  await win.evaluate(async () => {
    // Start every test from no tickets and no contacts.
    delete DB.settings.supportTickets;
    delete DB.settings.supportTicketSeq;
    ['supportWhatsApp', 'supportEmail', 'supportPhone', 'supportHours']
      .forEach(k => delete DB.settings[k]);
    await saveDB();
    navigate('support');
  });
  await win.waitForSelector('.sup-hero', { timeout: 20000 });
  await win.waitForTimeout(700);
  return { app, win };
}

test('every block the reference draws is on the page, and each one leads somewhere', async () => {
  const { app, win } = await launch();
  const pageErrors = [];
  win.on('pageerror', e => pageErrors.push(e.message));

  const page = await win.evaluate(() => ({
    hero:    !!document.querySelector('.sup-hero'),
    search:  !!document.getElementById('sup-find'),
    popular: [...document.querySelectorAll('.sup-pop .sup-chip')].map(c => c.textContent.trim()),
    bigs:    [...document.querySelectorAll('.sup-big__t')].map(c => c.textContent.trim()),
    form:    ['sup-t-cat', 'sup-t-prio', 'sup-t-subject', 'sup-t-desc'].every(id => !!document.getElementById(id)),
    tickets: !!document.querySelector('.sup-tix, .sup-empty'),
    status:  !!document.getElementById('conn-body'),
    install: [...document.querySelectorAll('.sup-row__l')].map(c => c.textContent.trim()),
    touch:   !!document.querySelector('.sup-rail .set-card'),
    quick:   [...document.querySelectorAll('.sup-res__t')].map(c => c.textContent.trim()),
    foot:    !!document.querySelector('.sup-foot'),
    // Nothing on the page may be a live-looking control with no handler.
    deadButtons: [...document.querySelectorAll('.sup button')]
      .filter(b => !b.getAttribute('onclick') && !b.disabled).length,
  }));

  expect(page.hero).toBe(true);
  expect(page.search, 'the hero has no search box').toBe(true);
  expect(page.popular, 'the Popular chips are not the knowledge base categories')
    .toEqual(['Adding Students', 'Room Allotment', 'Fees & Payments', 'Reports', 'Backup & Restore']);
  /* The reference's third tile is "Video Tutorials · Watch Now". No video is
     bundled and the app opens no external player, so its place is taken by
     Guided setup — the walkthrough this app really has. */
  expect(page.bigs).toEqual(['Knowledge base', 'Guided setup', 'System status']);
  expect(page.form, 'the request form is missing a field').toBe(true);
  expect(page.tickets).toBe(true);
  expect(page.status, 'the status card is not the Connection panel').toBe(true);
  expect(page.install).toEqual(['Hostel', 'App version', 'Licence key', 'Machine ID',
                                'Licence', 'Entitlement', 'Records on file']);
  expect(page.touch).toBe(true);
  expect(page.quick.length).toBeGreaterThan(3);
  expect(page.foot).toBe(true);
  expect(page.deadButtons, 'a button on this page does nothing when pressed').toBe(0);

  // The four status rows are painted by the Connection panel's own renderer.
  const rows = await win.evaluate(() =>
    document.querySelectorAll('#conn-body .conn-row').length);
  expect(rows, 'four states, shown as four').toBe(4);

  await app.close();
  expect(pageErrors).toEqual([]);
});

test('a request is stored before it is sent, and is not marked sent when it could not be', async () => {
  const { app, win } = await launch();

  // No contacts are configured — this is the case the promise is about.
  const out = await win.evaluate(async () => {
    document.getElementById('sup-t-subject').value = 'Unable to generate fee receipt';
    document.getElementById('sup-t-desc').value = 'The Print button on a payment does nothing.';
    document.getElementById('sup-t-cat').value = 'Fees & Payments';
    document.getElementById('sup-t-prio').value = 'High';
    await supSubmitTicket();
    await new Promise(r => setTimeout(r, 400));
    const t = (DB.settings.supportTickets || [])[0];
    return t ? { ref: t.ref, subject: t.subject, cat: t.category, prio: t.priority,
                 status: t.status, sentAt: t.sentAt, diag: t.diagnostics } : null;
  });

  expect(out, 'the request was not stored at all').toBeTruthy();
  expect(out.ref, 'a request has no reference').toMatch(/^HS-\d+$/);
  expect(out.subject).toBe('Unable to generate fee receipt');
  expect(out.cat).toBe('Fees & Payments');
  expect(out.prio).toBe('High');
  expect(out.status).toBe('open');
  expect(out.sentAt, 'a request was marked sent with nothing to send it with').toBeNull();

  /* THE DIAGNOSTICS ARE CAPTURED WITH THE TICKET, and they are what support
     asks for — but never a credential. */
  expect(out.diag).toContain('Machine ID:');
  expect(out.diag).toContain('Licence key:');
  expect(out.diag).toContain('Version:');
  expect(out.diag, 'a diagnostics field was read off a promise')
    .not.toMatch(/undefined|\[object Promise\]/);
  expect(out.diag, 'the signed entitlement is in the diagnostics').not.toMatch(/eyJ[A-Za-z0-9_-]{6,}/);
  expect(out.diag.toLowerCase(), 'a device token is in the diagnostics').not.toContain('token');

  // It is on the page, with its reference and its status.
  const shown = await win.evaluate(() => ({
    text: (document.querySelector('.sup-tix') || {}).innerText || '',
    rows: document.querySelectorAll('.sup-tix__r').length,
  }));
  expect(shown.rows).toBe(1);
  expect(shown.text).toContain(out.ref);
  expect(shown.text).toContain('Unable to generate fee receipt');
  expect(shown.text, 'the list does not say the request has not gone anywhere')
    .toContain('not sent yet');

  // And it survives a restart, because it is in the database and not in a variable.
  await app.close();

  const again = await launchAgain();
  const kept = await again.win.evaluate(() => (DB.settings.supportTickets || []).length);
  expect(kept, 'the request did not survive a restart').toBe(1);
  await again.app.close();

  async function launchAgain() {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const a = await electron.launch({
      executablePath: ELECTRON,
      args: [REPO_ROOT, '--dev', '--user-data-dir=' + PROFILE, '--no-sandbox', '--disable-gpu'],
      env,
    });
    const w = await a.firstWindow();
    await w.waitForLoadState('domcontentloaded');
    await w.waitForFunction(() => typeof DB !== 'undefined' && !!DB.settings, null, { timeout: 60000 });
    return { app: a, win: w };
  }
});

test('the knowledge base is real, searchable and works offline', async () => {
  const { app, win } = await launch();

  const kb = await win.evaluate(() => {
    supBrowse('All');
    return {
      count: SUP_ARTICLES.length,
      // Every article belongs to one of the five chips the hero offers.
      strays: SUP_ARTICLES.filter(a => SUP_CATS.indexOf(a.cat) === -1).map(a => a.id),
      // And every one has a body worth opening.
      thin: SUP_ARTICLES.filter(a => !a.b || !a.b.length || a.b.join('').length < 80).map(a => a.id),
      listed: document.querySelectorAll('.sup-art').length,
    };
  });
  expect(kb.count, 'too few guides to call it a knowledge base').toBeGreaterThan(9);
  expect(kb.strays, 'an article is in a category no chip offers').toEqual([]);
  expect(kb.thin, 'an article is a title with nothing behind it').toEqual([]);
  expect(kb.listed).toBe(kb.count);

  // Searching narrows it, and the search reads the BODY, not just the title.
  const found = await win.evaluate(() => {
    supQuery = 'arrears'; supCat = 'All'; supBrowse();
    return [...document.querySelectorAll('.sup-art__t')].map(e => e.textContent.trim());
  });
  expect(found.length).toBeGreaterThan(0);
  expect(found.join(' ').toLowerCase(), 'the search does not read article bodies')
    .toContain('old month');

  // A category chip filters to that category and nothing else.
  const cat = await win.evaluate(() => {
    supBrowse('Backup & Restore');
    return [...document.querySelectorAll('.sup-art__s')].map(e => e.textContent.trim());
  });
  expect(cat.length).toBeGreaterThan(1);
  expect([...new Set(cat)]).toEqual(['Backup & Restore']);

  // An article opens and prints its paragraphs.
  const doc = await win.evaluate(() => {
    supArticle('a-backup');
    return (document.querySelector('.sup-doc') || {}).innerText || '';
  });
  expect(doc).toContain('Backup & Restore');
  expect(doc.length).toBeGreaterThan(80);

  await win.evaluate(() => closeModal());
  await app.close();
});

test('setting a contact turns the routes on, and every one carries the details', async () => {
  const { app, win } = await launch();

  // Empty: the rail says so rather than offering a button that refuses.
  const before = await win.evaluate(() => ({
    empty: !!document.querySelector('.sup-rail .sup-empty'),
    routes: document.querySelectorAll('.sup-touch').length,
    best: supBestRoute(),
  }));
  expect(before.empty, 'an unconfigured install does not say so').toBe(true);
  expect(before.routes).toBe(0);
  expect(before.best).toBeNull();

  const after = await win.evaluate(async () => {
    supEditContacts();
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('sup-supportWhatsApp').value = '0300-1234567';
    document.getElementById('sup-supportEmail').value = 'support@example.com';
    document.getElementById('sup-supportHours').value = 'Mon – Sat, 9am – 7pm';
    await supSaveContacts();
    await new Promise(r => setTimeout(r, 500));
    return {
      stored: { wa: DB.settings.supportWhatsApp, em: DB.settings.supportEmail,
                hrs: DB.settings.supportHours, ph: DB.settings.supportPhone },
      routes: document.querySelectorAll('.sup-touch').length,
      best: supBestRoute(),
      text: (document.querySelector('.sup-rail') || {}).innerText || '',
    };
  });
  expect(after.stored.wa).toBe('0300-1234567');
  expect(after.stored.em).toBe('support@example.com');
  expect(after.stored.hrs).toBe('Mon – Sat, 9am – 7pm');
  // A field left blank stores nothing rather than an empty string.
  expect(after.stored.ph).toBeUndefined();
  expect(after.routes, 'two contacts were set and fewer than two routes appeared').toBe(2);
  expect(after.best).toBe('whatsapp');
  expect(after.text).toContain('0300-1234567');

  await app.close();
});
