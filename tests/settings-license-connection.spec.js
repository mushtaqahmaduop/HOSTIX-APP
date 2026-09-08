// ════════════════════════════════════════════════════════════════════════════
// Settings → License and Connection — rebuilt 2026-09-08 to `license page2.png`
// and `connectin.png`.
//
// Both references draw more than this build knows, and the whole point of both
// panels is that they are what a warden reads out to support. So the two things
// worth guarding are the two ways they could become useless:
//
//  · A FACT THIS APP DOES NOT HAVE. The licence file carries a key, an expiry,
//    a machine id and an activation date. `Licensed To`, an issue date distinct
//    from activation, and a module list are in the reference and in no record
//    here. The owner's rule of 2026-09-08 is that a row like that is DRAWN and
//    LOCKED, never dropped — so the guard is not "the row is absent" but "the
//    row is present, marked locked, and reads Not recorded". A plausible value
//    in one of them would be read down a phone as if it were true.
//  · A STATUS THAT IS ALWAYS GREEN. The Connection reference's summary reads
//    "All Systems Operational". On a build with no control plane configured
//    that is a claim about a service that does not exist, so the summary has to
//    follow the mode.
//
// The masking of the key is the third: it is masked by POSITION, and the copy
// button — not the printed row — is what hands over the whole thing.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');

const REPO_ROOT = path.join(__dirname, '..');
const ELECTRON = require('electron');

let PROFILE;
test.beforeAll(() => { PROFILE = resetProfile(); });

async function launch(tab) {
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
  await win.evaluate((t) => { navigate('settings'); settingsTab = t; renderPage('settings'); }, tab);
  await win.waitForTimeout(900);          // the panels fill themselves over IPC
  return { app, win };
}

test('the licence card states only what the licence file carries', async () => {
  const { app, win } = await launch('license');

  const seen = await win.evaluate(() => ({
    labels: [...document.querySelectorAll('.lic-row__l')].map(e => e.textContent.trim()),
    values: [...document.querySelectorAll('.lic-row__v')].map(e => e.textContent.trim()),
    rows: [...document.querySelectorAll('.lic-row')].map(r => ({
      label: r.querySelector('.lic-row__l').textContent.trim(),
      value: r.querySelector('.lic-row__v').textContent.trim(),
      locked: r.classList.contains('is-locked'),
    })),
    stats: [...document.querySelectorAll('.lic-stat')].map(t => ({
      label: t.querySelector('.lic-stat__l').textContent.trim(),
      value: t.querySelector('.lic-stat__v').textContent.trim(),
      locked: t.classList.contains('is-locked'),
    })),
    lic: window._hostyllo_license_cache || {},
  }));

  // Every row the reference draws is drawn, in its order.
  expect(seen.labels).toEqual([
    'License key', 'Hostel name', 'Licensed to', 'Issue date',
    'Activated on this computer', 'Expiry date', 'Edition', 'Machine ID',
  ]);

  // The three the licence file cannot answer are locked and say so — never a
  // plausible-looking value, and never quietly missing.
  for (const label of ['Licensed to', 'Issue date']) {
    const row = seen.rows.find(r => r.label === label);
    expect(row).toBeTruthy();
    expect(row.locked).toBe(true);
    expect(row.value).toBe('Not recorded');
  }
  const modules = seen.stats.find(t => /Licensed modules/.test(t.label));
  expect(modules).toBeTruthy();
  expect(modules.locked).toBe(true);
  expect(modules.value).toBe('Not recorded');

  // The key is masked by position: the first two groups and the last survive,
  // every group between them is stars, and the raw key is not in the DOM.
  const key = seen.lic.key || '';
  const printed = seen.values[0];
  expect(printed.startsWith(key.split('-').slice(0, 2).join('-'))).toBe(true);
  expect(printed.endsWith(key.split('-').slice(-1)[0])).toBe(true);
  const middles = key.split('-').slice(2, -1);
  for (const m of middles) expect(printed).not.toContain(m);
  expect(await win.evaluate(() => document.body.innerHTML))
    .not.toContain(key.split('-').slice(2, -1).join('-'));

  await app.close();
});

test('the copy button hands over the whole key, not the masked one', async () => {
  const { app, win } = await launch('license');

  const copied = await win.evaluate(async () => {
    let got = null;
    const real = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (v) => { got = v; return real(v).catch(() => {}); };
    document.querySelector('.lic-copy').click();
    await new Promise(r => setTimeout(r, 250));
    return { got, key: (window._hostyllo_license_cache || {}).key };
  });

  expect(copied.got).toBe(copied.key);
  expect(copied.got).not.toContain('·');

  await app.close();
});

test('the enforcement readout says whether the app is accepting writes', async () => {
  const { app, win } = await launch('license');

  const out = await win.evaluate(async () => {
    const d = await window.electronAPI.licenseEnforcement();
    const box = document.getElementById('lic-enforce');
    return { state: d.state, readOnly: !!(d.readOnly || d.blocked), text: box.textContent };
  });

  expect(out.text).toContain('Enforcement');
  expect(out.text).toContain('Saving');
  // The words follow the decision rather than being fixed to "Active/Enabled".
  expect(out.text).toContain(out.readOnly ? 'Read-only' : 'Enabled');
  if (out.state === 'ACTIVE') expect(out.text).toContain('Active');

  await app.close();
});

test('Connection never claims a service that is not configured', async () => {
  const { app, win } = await launch('connection');

  const out = await win.evaluate(async () => {
    const st = await window.online.getStatus();
    return {
      unconfigured: st.configured === false || st.mode === 'unconfigured',
      mode: st.mode,
      summary: (document.querySelector('.conn-sum') || {}).textContent || '',
      rows: [...document.querySelectorAll('.conn-row__t')].map(e => e.textContent.trim()),
      greens: [...document.querySelectorAll('.conn-row.is-online')].length,
      accentPills: [...document.querySelectorAll('.conn-pill')]
        .filter(e => getComputedStyle(e).color === getComputedStyle(document.querySelector('.set-btn--go')).backgroundColor).length,
    };
  });

  // §29's four lines, still four and still separate.
  expect(out.rows).toEqual(['Internet', 'Hostyllo API', 'License', 'Application']);

  if (out.unconfigured) {
    expect(out.summary).toContain('Running offline');
    expect(out.summary.toLowerCase()).not.toContain('all systems operational');
    // Only the internet line may be green on an unconfigured build: the other
    // three describe services this installation does not talk to.
    expect(out.greens).toBeLessThanOrEqual(1);
    // And no status pill wears the accent: on this panel the accent is the
    // Check-again button, and colour on a status must not read as 'act'.
    expect(out.accentPills).toBe(0);
  } else if (out.mode === 'online') {
    expect(out.summary).toContain('All systems operational');
  }

  await app.close();
});

/* THREE BUTTONS, ONE OPERATION. In main.js, `license:deactivateWithDialog` and
   `license:reset` both call deactivateLicense(), and `license:prepareUninstall`
   unlinks the same two files by hand: all three delete license.enc and
   last_run.dat. The reference grades them green / amber / red and the licence
   window grades the same three warn / danger / plain — two surfaces telling a
   warden a different story about which button does the most damage, for three
   buttons that do exactly the same damage. All three are kept, because they are
   in the owner's design and each opens a differently-worded dialog; what is not
   kept is the pretence that one is milder. */
test('the licence actions do not pretend one is milder than another', async () => {
  const { app, win } = await launch('license');

  const acts = await win.evaluate(() => [...document.querySelectorAll('.lic-acts .lic-act')].map(a => ({
    title: a.querySelector('.lic-act__t').textContent.trim(),
    hue: getComputedStyle(a.querySelector('.lic-act__i')).color,
    btn: getComputedStyle(a.querySelector('.lic-act__go')).color,
  })));

  expect(acts.map(a => a.title)).toEqual([
    'Deactivate license', 'Reset license', 'Full reset — prepare for uninstall',
  ]);
  // Same severity, drawn the same, because they are the same operation.
  expect(new Set(acts.map(a => a.hue)).size).toBe(1);
  expect(new Set(acts.map(a => a.btn)).size).toBe(1);

  await app.close();
});
