// ════════════════════════════════════════════════════════════════════════════
// Rail reach — the screens a warden uses daily must not need a scroll.
//
// The sidebar SCROLLS on every laptop this app ships to. That is not a bug to
// fix; it is arithmetic. At 1366x768 with Windows display scaling at 125% (the
// common OEM default) the scroller is 418px tall and the nav content is ~669px,
// and no amount of grouping fits twelve items into that without a type size the
// brief rules out.
//
// So the thing worth defending is not "everything fits" — it is WHICH items are
// reachable without scrolling. This spec pins that: the daily screens stay above
// the fold at the stated QA floor, and it prints the full budget at every size
// so a regression is legible rather than just red.
//
// It caught its own phase's regression. Regrouping the rail from three sections
// to five added 80px of headers and pushed two more items below the fold (9
// visible -> 7) before the row density was tightened to pay for it.
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path'); const fs = require('fs');
const REPO_ROOT = path.join(__dirname, '..');
const PROFILE = process.env.HOSTIX_TEST_PROFILE;
const ELECTRON = require('electron');
const SIZES = [
  { w: 1920, h: 1040, note: '1920x1080 @100%' },
  { w: 1366, h: 690,  note: '1366x768  @100%  (stated QA floor)' },
  { w: 1280, h: 660,  note: '1920x1080 @150%' },
  { w: 1093, h: 614,  note: '1366x768  @125%  (common OEM default)' },
  { w: 1024, h: 640,  note: '1024x768' },
  { w: 900,  h: 600,  note: 'window minimum' },
];
function launchOpts(){ const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  return { executablePath: ELECTRON, args:[REPO_ROOT,'--dev','--user-data-dir='+PROFILE,'--no-sandbox','--disable-gpu'], env }; }
test.beforeAll(()=>{ for (const f of fs.readdirSync(PROFILE)) if (f.startsWith('hostix.db')) fs.rmSync(path.join(PROFILE,f),{force:true});
  fs.rmSync(path.join(PROFILE,'Local Storage'),{recursive:true,force:true}); });

test('the daily screens are reachable without scrolling the rail', async () => {
  test.setTimeout(300000);
  const app = await electron.launch(launchOpts());
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#login-input',{state:'visible',timeout:30000});
  await win.waitForFunction(()=>typeof WARDENS!=='undefined'&&WARDENS.warden1&&WARDENS.warden1.pw,null,{timeout:30000});
  await win.fill('#login-user','warden1'); await win.fill('#login-input','admin123'); await win.click('#login-btn');
  await win.waitForFunction(()=>{const s=document.getElementById('login-screen');return s&&s.style.display==='none';},null,{timeout:30000});

  // size note -> the data-page keys that did NOT fit. Filled per size below,
  // asserted after the loop so the budget for EVERY size is printed first: a
  // failure you can only see one line of is a failure you debug by re-running.
  const reach = {};

  console.log('\n===== RAIL BUDGET =====');
  for (const s of SIZES) {
    await app.evaluate(({BrowserWindow}, sz) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w.isMaximized()) w.unmaximize();
      w.setContentSize(sz.w, sz.h);
    }, s);
    await win.waitForTimeout(300);
    const m = await win.evaluate(() => {
      const sb = document.getElementById('sidebar');
      if (!sb) return null;
      const px = el => el ? Math.round(el.getBoundingClientRect().height) : 0;
      const items = [...sb.querySelectorAll('.nav-item')];
      const heads = [...sb.querySelectorAll('.sb-section')];
      const nav = sb.querySelector('.sb-nav');
      const navBox = nav ? nav.getBoundingClientRect() : null;
      // How many nav items are fully visible inside the scroller?
      let visible = 0, belowFold = [], belowFoldKeys = [];
      if (nav) {
        for (const it of items) {
          const r = it.getBoundingClientRect();
          if (r.bottom <= navBox.bottom + 1) visible++;
          else {
            belowFold.push((it.querySelector('.nav-label') || it).textContent.trim().slice(0, 18));
            // The label is for reading; the assertion reads THIS. Labels are
            // copy and get reworded, and a rename must not quietly turn the
            // check green by no longer matching the name it was watching.
            belowFoldKeys.push(it.dataset.page || '');
          }
        }
      }
      return {
        navScroll: nav ? nav.scrollHeight : 0,
        navClient: nav ? nav.clientHeight : 0,
        navOverflow: nav ? nav.scrollHeight - nav.clientHeight : 0,
        visible, belowFold, belowFoldKeys,
        viewportH: window.innerHeight,
        railH: Math.round(sb.getBoundingClientRect().height),
        contentH: sb.scrollHeight,
        overflow: sb.scrollHeight - sb.clientHeight,
        logo: px(sb.querySelector('.sb-logo')),
        nav: px(sb.querySelector('.sb-nav')),
        chip: px(sb.querySelector('.sb-warden')) || px(sb.querySelector('.user-chip')) || 0,
        itemCount: items.length,
        itemH: items.length ? Math.round(items[0].getBoundingClientRect().height) : 0,
        headCount: heads.length,
        headH: heads.length ? Math.round(heads[0].getBoundingClientRect().height) : 0,
      };
    });
    if (!m) { console.log('  ' + s.note + ': no #sidebar'); continue; }
    reach[s.note] = m.belowFoldKeys;
    const perHead = m.headH;
    const headroom = m.railH - m.contentH;
    console.log('\n  ' + s.note + '   viewport ' + m.viewportH + 'px');
    console.log('    rail ' + m.railH + 'px   content ' + m.contentH + 'px   ' +
      (m.overflow > 0 ? 'OVERFLOWS by ' + m.overflow + 'px (scrolls)' : 'headroom ' + headroom + 'px'));
    console.log('    logo ' + m.logo + '  nav ' + m.nav + '  chip ' + m.chip +
      '   items ' + m.itemCount + ' x ' + m.itemH + '   headers ' + m.headCount + ' x ' + perHead);
    console.log('    NAV scroller: content ' + m.navScroll + ' in ' + m.navClient + 'px  -> ' +
      (m.navOverflow > 0 ? 'OVERFLOWS by ' + m.navOverflow + 'px' : 'fits, ' + (-m.navOverflow) + 'px spare'));
    console.log('    items fully visible: ' + m.visible + ' of ' + m.itemCount +
      (m.belowFold.length ? '   BELOW THE FOLD: ' + m.belowFold.join(', ') : ''));
    const spare = -m.navOverflow;
    console.log('    cost of 2 MORE section headers: ' + (perHead * 2) + 'px -> ' +
      (spare - perHead * 2 >= 0
        ? 'still fits, ' + (spare - perHead * 2) + 'px spare'
        : 'pushes ' + (perHead * 2 - Math.max(spare, 0)) + 'px more below the fold'));
  }
  console.log('\n===== END =====\n');
  await app.close();

  // ── The actual claim ──────────────────────────────────────────────────────
  // Everything above is a report; this is the part that can fail.
  //
  // Twelve items do not fit, and the header explains why chasing that is the
  // wrong goal. What must hold is that the five screens a warden touches every
  // shift are reachable without scrolling — the rail may scroll to reach
  // Archive or the Activity Log, never to record a payment.
  //
  // Gated at EVERY size, not just the stated QA floor.
  //
  // This began as a QA-floor-only assertion because 1366x768 @125% could not
  // hold the daily five and pinning it would have frozen the design against
  // the hardest case. That is no longer the trade: on 2026-09-04 the group gap
  // stopped being paid for twice and Annual Archive — a yearly screen — moved
  // out of the fold it was occupying, and the daily five now fit everywhere
  // measured, 125% included.
  //
  // So the claim is now the plain one, which is also the one worth defending:
  // the rail may scroll to reach Archive or the Activity Log, never to record
  // a payment or look up a room.
  const DAILY = ['dashboard', 'students', 'rooms', 'payments', 'expenses'];
  const lost = {};
  for (const s of SIZES) {
    expect(reach[s.note], 'size never measured — did #sidebar render? ' + s.note).toBeDefined();
    const missing = (reach[s.note] || []).filter(k => DAILY.includes(k));
    if (missing.length) lost[s.note] = missing;
  }
  expect(lost, 'daily screens pushed below the fold').toEqual({});
});
