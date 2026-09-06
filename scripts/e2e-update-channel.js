/* ─── HOSTYLLO — the update channel, end to end against the LIVE feed ────────

   Walks the exact sequence electron-updater's GitHubProvider performs on a
   client machine: releases.atom for the newest tag, latest.yml from that tag,
   the up-to-date decision semver makes, and the URL the Download button opens
   for each architecture.

   Read-only, and the reason it exists is that every failure in this chain is
   invisible from here — it surfaces on a hostel's PC, after a release, with
   nobody able to see why. A 404 asset or a mis-pinned fallback would look
   exactly like nothing being wrong.

   Run:  node scripts/e2e-update-channel.js
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const path = require('path');
const semver = require('semver');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const { owner, repo } = pkg.build.publish;
const BASE = 'https://github.com/' + owner + '/' + repo + '/releases';

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  -- ' + detail : '')); }
  else    { fail++; console.log('  FAIL  ' + name + (detail ? '  -- ' + detail : '')); }
}

(async () => {
  console.log('publish config: ' + JSON.stringify(pkg.build.publish));
  console.log('app version:    ' + pkg.version + '\n');

  // ── 1. the Atom feed, which is how the provider learns the newest tag ──────
  console.log('1. Release channel discovery (releases.atom)');
  const atomRes = await fetch(BASE + '.atom', { headers: { accept: 'application/xml, application/atom+xml, text/xml, */*' } });
  check('GET releases.atom 200', atomRes.status === 200, String(atomRes.status));
  const atom = await atomRes.text();
  const hrefs = [...atom.matchAll(/<link[^>]+href="[^"]*\/releases\/tag\/([^"]+)"/g)].map(m => m[1]);
  check('feed lists at least one release', hrefs.length > 0, hrefs.join(', '));
  const tag = hrefs[0];
  check('newest entry is a valid semver tag', !!semver.valid(tag), tag);
  check('newest entry matches the release the owner published', tag === 'v' + pkg.version, tag);

  // ── 2. the channel file ───────────────────────────────────────────────────
  console.log('\n2. Channel file');
  const ymlUrl = BASE + '/download/' + tag + '/latest.yml';
  const ymlRes = await fetch(ymlUrl);
  check('GET ' + tag + '/latest.yml 200', ymlRes.status === 200, String(ymlRes.status));
  const yml = await ymlRes.text();
  const info = {
    version: (yml.match(/^version:\s*(\S+)/m) || [])[1],
    path: (yml.match(/^path:\s*(\S+)/m) || [])[1],
    sha512: (yml.match(/^sha512:\s*(\S+)/m) || [])[1],
    files: [...yml.matchAll(/^\s+- url:\s*(\S+)\s*\r?\n\s+sha512:\s*(\S+)/gm)].map(m => ({ url: m[1], sha512: m[2] }))
  };
  check('feed version parses', !!semver.valid(info.version), info.version);
  check('feed version equals the tag', info.version === tag.replace(/^v/, ''), info.version + ' vs ' + tag);
  check('feed lists installers', info.files.length > 0, info.files.map(f => f.url).join(', '));
  check('fallback path is pinned to x64', /-x64\.exe$/.test(info.path || ''), info.path);
  const fb = info.files.find(f => f.url === info.path);
  check('fallback sha512 matches its own files: entry', !!fb && fb.sha512 === info.sha512);

  // ── 3. the up-to-date / out-of-date decision, as AppUpdater makes it ───────
  console.log('\n3. The decision (semver.eq, AppUpdater.js:345)');
  check('a client on ' + pkg.version + ' is told it is up to date',
        semver.eq(info.version, pkg.version), info.version + ' == ' + pkg.version);
  check('a client on 4.0.0 is offered the update',
        !semver.eq(info.version, '4.0.0') && semver.gt(info.version, '4.0.0'));

  // ── 4. the URL the Download button opens ──────────────────────────────────
  console.log('\n4. The Download button, for both architectures');
  const main = require('fs').readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const src = main.slice(main.indexOf('function updateDownloadUrl'));
  const body = src.slice(0, src.indexOf('\nfunction ', 1));
  const RELEASES_URL = BASE;
  for (const arch of ['x64', 'ia32']) {
    // eslint-disable-next-line no-new-func
    const fn = new Function('RELEASES_URL', 'process', 'console', body + '; return updateDownloadUrl;')(
      RELEASES_URL, { arch }, console);
    const url = fn({ version: info.version, files: info.files, path: info.path });
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    check(arch + ' download URL resolves 200', head.status === 200, url.replace(RELEASES_URL, '…') + '  ' + head.status);
    check(arch + ' gets the ' + arch + ' installer', new RegExp('-' + arch + '\\.exe$').test(url), url.split('/').pop());
  }

  console.log('\n' + '-'.repeat(70));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
})().catch(e => { if (!(e && e._quiet)) { console.error('THREW: ' + ((e && e.stack) || e)); process.exitCode = 2; } });
