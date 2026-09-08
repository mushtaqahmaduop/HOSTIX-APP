// ════════════════════════════════════════════════════════════════════════════
// Activity Log — rebuilt 2026-09-08 to `audit logs.png` / `activity logs.png`.
//
// The log holds six fields per row: action, details, category, by, date, time.
// Everything on the page is computed from those, and the three things the
// reference asks for that they cannot answer are DRAWN AND LOCKED, per the
// owner's rule — an IP address column, a Status column, and a Login events
// counter. This file guards the two ways that arrangement could rot:
//
//  · A LOCKED COLUMN QUIETLY FILLING UP with a plausible value. Both stay
//    dashes; the counter stays zero and keeps its lock.
//  · THE DERIVED TYPE DRIFTING. Created / Updated / Deleted are read off the
//    verb the app itself logged — "Payment Collected" is a Create, "Payment
//    Reversed" is a Delete. An action the map does not recognise must land in
//    Other rather than be guessed into a bucket.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch(seed) {
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

  if (seed) {
    await win.evaluate(async () => {
      const mk = (action, details, category, by, dayAgo) => {
        const d = new Date();
        d.setDate(d.getDate() - dayAgo);
        return { id: 'al_' + Math.random().toString(36).slice(2), action, details, category, by,
                 date: ymd(d), time: '10:0' + (dayAgo % 10) + ' AM' };
      };
      DB.activityLog = [
        mk('Student Added', 'Ali Raza admitted to room 12', 'Student', 'Warden One', 0),
        mk('Payment Collected', 'PKR 16,000 from Ali Raza', 'Finance', 'Warden One', 0),
        mk('Payment Reversed', 'Receipt 44 reversed', 'Finance', 'Warden Two', 1),
        mk('Room Updated', 'Room 12 marked occupied', 'Room', 'Warden One', 2),
        mk('Settings Changed', 'Currency set to PKR', 'Settings', 'Warden Two', 3),
        mk('Student Deleted', 'Record removed', 'Student', 'Warden Two', 4),
        mk('Room Inspected', 'Quarterly check', 'Room', 'Warden One', 5),
        mk('Something Unmapped', 'A verb the map does not know', 'General', 'Warden One', 6),
      ];
      await saveDB();
    });
  }

  await win.evaluate(() => { alClearFilters(); navigate('activitylog'); });
  await win.waitForTimeout(700);
  return { app, win };
}

test('the log reads its own verbs, and never guesses one', async () => {
  const { app, win } = await launch(true);

  const seen = await win.evaluate(() =>
    (DB.activityLog || []).map(e => ({ action: e.action, type: alType(e) })));

  const by = {};
  for (const s of seen) by[s.action] = s.type;

  expect(by['Student Added']).toBe('Created');
  expect(by['Payment Collected']).toBe('Created');
  expect(by['Payment Reversed']).toBe('Deleted');
  expect(by['Student Deleted']).toBe('Deleted');
  expect(by['Room Updated']).toBe('Updated');
  expect(by['Settings Changed']).toBe('Updated');
  expect(by['Room Inspected']).toBe('Updated');
  // The one the map does not know lands in Other rather than a bucket.
  expect(by['Something Unmapped']).toBe('Other');

  await app.close();
});

test('the two columns nothing can fill stay empty, and say why', async () => {
  const { app, win } = await launch(true);

  const out = await win.evaluate(() => {
    const heads = [...document.querySelectorAll('.al-table thead th')].map(h => ({
      label: h.textContent.trim(), locked: h.classList.contains('al-th-lock'), title: h.title,
    }));
    const firstRow = [...document.querySelectorAll('.al-table tbody tr')][0];
    const cells = [...firstRow.querySelectorAll('td')].map(td => td.textContent.trim());
    const kpi = [...document.querySelectorAll('.al-kpi')].map(k => ({
      label: k.querySelector('.al-kpi__l').textContent.trim(),
      value: k.querySelector('.al-kpi__v').textContent.trim(),
      locked: k.classList.contains('is-locked'),
      title: (k.querySelector('.al-lock') || {}).title || '',
    }));
    return { heads, cells, kpi };
  });

  const ip = out.heads.find(h => /IP address/.test(h.label));
  const st = out.heads.find(h => /Status/.test(h.label));
  expect(ip.locked).toBe(true);
  expect(st.locked).toBe(true);
  expect(ip.title.length).toBeGreaterThan(30);
  expect(st.title.length).toBeGreaterThan(30);
  // …and every one of their cells is a dash, not a value.
  expect(out.cells[6]).toBe('—');
  expect(out.cells[7]).toBe('—');

  const logins = out.kpi.find(k => /Login events/.test(k.label));
  expect(logins.locked).toBe(true);
  expect(logins.value).toBe('0');
  expect(logins.title.length).toBeGreaterThan(30);

  await app.close();
});

test('filters narrow the register, the charts, and the export together', async () => {
  const { app, win } = await launch(true);

  const before = await win.evaluate(() => ({
    rows: document.querySelectorAll('.al-table tbody tr').length,
    exportRows: _alExportDef().rows.length,
  }));
  expect(before.rows).toBe(8);
  expect(before.exportRows).toBe(8);

  // One user.
  await win.evaluate(() => alSet('user', 'Warden Two'));
  await win.waitForTimeout(500);
  const byUser = await win.evaluate(() => ({
    rows: [...document.querySelectorAll('.al-table tbody tr td:nth-child(3)')].map(td => td.textContent.trim()),
    exportRows: _alExportDef().rows.length,
    scope: _alExportDef().scope,
  }));
  expect(byUser.rows).toEqual(['Warden Two', 'Warden Two', 'Warden Two']);
  expect(byUser.exportRows).toBe(3);
  // The document says which view it is, so a printed page can be checked.
  expect(byUser.scope).toContain('Warden Two');

  // …and one type on top of it.
  await win.evaluate(() => alSet('type', 'Deleted'));
  await win.waitForTimeout(500);
  expect(await win.evaluate(() => document.querySelectorAll('.al-table tbody tr').length)).toBe(2);

  // Clearing puts everything back.
  await win.evaluate(() => alClearFilters());
  await win.waitForTimeout(500);
  expect(await win.evaluate(() => document.querySelectorAll('.al-table tbody tr').length)).toBe(8);

  await app.close();
});

test('a row opens its own entry, raw, and says what it cannot show', async () => {
  const { app, win } = await launch(true);

  await win.click('.al-table tbody tr');
  await win.waitForTimeout(500);

  const panel = await win.evaluate(() => {
    const p = document.querySelector('.al-panel');
    return {
      open: !!p,
      title: p.querySelector('.al-panel__t').textContent.trim(),
      raw: p.querySelector('.hi-pre').textContent,
      note: p.querySelector('.cfg-note').textContent,
      z: getComputedStyle(document.querySelector('.al-panel-wrap')).zIndex,
    };
  });

  expect(panel.open).toBe(true);
  expect(panel.title).toBe('Student Added');
  // The raw entry is the record itself, not a rendering of it.
  const parsed = JSON.parse(panel.raw);
  expect(parsed.action).toBe('Student Added');
  expect(parsed.by).toBe('Warden One');
  // The before/after the reference shows does not exist, and the panel says so
  // rather than inventing an old value.
  expect(panel.note.toLowerCase()).toContain('no old value');
  // Under .modal-overlay (350) so a dialog opened from here stays reachable.
  expect(Number(panel.z)).toBeLessThan(350);

  await win.evaluate(() => alClose());
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => !!document.querySelector('.al-panel'))).toBe(false);

  await app.close();
});
