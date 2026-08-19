/**
 * ════════════════════════════════════════════════════════════════════════════
 * Ed25519 entitlement signing keypair  —  Phase 2
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/gen-entitlement-keypair.js <private-key-output-dir> [kid]
 *
 * This is the trust root for the whole online-licensing design, and the fix for
 * audit C2. Today `_SECRET` is symmetric and packed into `app.asar`, so anyone
 * who unpacks the app can mint licences. With this keypair:
 *
 *   • the SERVER holds the private key and is the only thing that can sign an
 *     entitlement;
 *   • the APP ships only the public key, and unpacking the asar yields nothing
 *     an attacker can sign with.
 *
 * The script writes two things:
 *
 *   <output-dir>/entitlement-<kid>.private.pem   NEVER commit. NEVER ship.
 *   services/entitlement-keys.js                 public keys, committed, shipped
 *
 * The private key is written OUTSIDE the repo on purpose, and the script
 * refuses to write it anywhere inside the repo — see _assertOutsideRepo. Move
 * it into the Railway secret store and delete the file; it is not a thing to
 * keep lying around on a laptop.
 *
 * ── Rotation ────────────────────────────────────────────────────────────────
 * Keys are addressed by `kid`, and `services/entitlement-keys.js` holds a MAP,
 * not a single key. Run this again with a new kid to add one: old entitlements
 * signed by the old kid keep verifying, so a fleet of 50+ machines on mixed app
 * versions does not break the moment a key is rotated. Remove a key from the
 * map only once nothing in the field can still be holding one it signed.
 * ════════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PUBLIC_MODULE = path.join(REPO_ROOT, 'services', 'entitlement-keys.js');

/**
 * The one guard that matters here. A private key written into the repo would
 * be committed by the next `git add -A`, and `services/**` is in the
 * electron-builder allowlist, so it could ship to 50+ machines inside the
 * asar — which is exactly the vulnerability this keypair exists to close.
 */
function _assertOutsideRepo(dir) {
  const resolved = path.resolve(dir);
  const rel = path.relative(REPO_ROOT, resolved);
  const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  if (inside) {
    throw new Error(
      'Refusing to write a private key inside the repo (' + resolved + ').\n' +
      'Pass a directory outside ' + REPO_ROOT + ' — e.g. C:\\Users\\PCS\\HOSTIX-backups\\entitlement-keys'
    );
  }
  return resolved;
}

/** A short, stable, human-quotable key id. Date-based so ordering is obvious. */
function defaultKid() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return 'ent-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

function generate(outDir, kid) {
  const dir = _assertOutsideRepo(outDir);
  fs.mkdirSync(dir, { recursive: true });

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem  = publicKey.export({ type: 'spki',  format: 'pem' });

  // Also emit the public key as a JWK — that is the shape `jose` wants on the
  // server, so the control plane can import it without a conversion step.
  const publicJwk = publicKey.export({ format: 'jwk' });

  const privatePath = path.join(dir, 'entitlement-' + kid + '.private.pem');
  if (fs.existsSync(privatePath)) {
    throw new Error('Refusing to overwrite an existing private key: ' + privatePath);
  }
  // 0o600 is advisory on Windows — the real protection is that this path is
  // outside the repo and outside any sync folder. Set it anyway for the day
  // this runs on a POSIX build host.
  fs.writeFileSync(privatePath, privatePem, { mode: 0o600 });

  const privateJwk = privateKey.export({ format: 'jwk' });
  const privateJwkPath = path.join(dir, 'entitlement-' + kid + '.private.jwk.json');
  fs.writeFileSync(privateJwkPath,
    JSON.stringify({ kid, alg: 'EdDSA', use: 'sig', ...privateJwk }, null, 2) + '\n',
    { mode: 0o600 });

  return { kid, privatePem, publicPem, publicJwk, privatePath, privateJwkPath };
}

/** Read the committed public-key map, so a second run ADDS rather than replaces. */
function readExistingKeys() {
  try {
    delete require.cache[require.resolve(PUBLIC_MODULE)];
    const mod = require(PUBLIC_MODULE);
    return Object.assign({}, mod.KEYS);
  } catch (_) {
    return {};
  }
}

function writePublicModule(keys, activeKid) {
  const entries = Object.keys(keys).sort().map(kid => {
    // Each line keeps its own trailing newline. A PEM whose armour and body run
    // together on one line is not a PEM — crypto.createPublicKey rejects it.
    const pem = keys[kid].trim().split('\n')
      .map(l => '    ' + JSON.stringify(l + '\n'))
      .join(' +\n');
    return '  ' + JSON.stringify(kid) + ':\n' + pem;
  }).join(',\n\n');

  const body = `// ════════════════════════════════════════════════════════════════════════════
// Entitlement signing PUBLIC keys  —  Phase 2
//
// GENERATED by scripts/gen-entitlement-keypair.js. Do not hand-edit.
//
// These are PUBLIC keys. They are meant to ship inside app.asar; there is
// nothing here an attacker gains anything from. The matching private keys live
// in the control plane's secret store and must never appear in this repo.
//
// A MAP, not a single key, because entitlements are addressed by \`kid\`. An app
// build keeps verifying entitlements signed by any key it knows, so rotating
// the signing key does not strand machines running an older build. Drop a key
// from this map only when nothing in the field can still hold one it signed.
//
// ACTIVE_KID is what the control plane is expected to be signing with today.
// It is a hint for diagnostics only — verification always goes by the \`kid\` in
// the token header, never by this constant.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const KEYS = {
${entries}
};

const ACTIVE_KID = ${JSON.stringify(activeKid)};

module.exports = { KEYS, ACTIVE_KID };
`;
  fs.writeFileSync(PUBLIC_MODULE, body);
}

function main() {
  const outDir = process.argv[2];
  const kid    = process.argv[3] || defaultKid();

  if (!outDir) {
    console.error('usage: node scripts/gen-entitlement-keypair.js <private-key-output-dir> [kid]');
    console.error('       the directory MUST be outside ' + REPO_ROOT);
    process.exit(2);
  }

  const result = generate(outDir, kid);

  const keys = readExistingKeys();
  if (keys[kid]) throw new Error('kid "' + kid + '" is already in the public key map');
  keys[kid] = result.publicPem;
  writePublicModule(keys, kid);

  console.log('');
  console.log('  Ed25519 entitlement keypair — kid: ' + kid);
  console.log('  ────────────────────────────────────────────────────────────');
  console.log('  PRIVATE (never commit, never ship):');
  console.log('    ' + result.privatePath);
  console.log('    ' + result.privateJwkPath);
  console.log('');
  console.log('  PUBLIC (committed, shipped in the asar):');
  console.log('    ' + PUBLIC_MODULE);
  console.log('    keys in map: ' + Object.keys(keys).sort().join(', '));
  console.log('');
  console.log('  Public JWK for the control plane:');
  console.log('    ' + JSON.stringify({ kid, alg: 'EdDSA', use: 'sig', ...result.publicJwk }));
  console.log('');
  console.log('  NEXT: put the private JWK in the Railway secret store as');
  console.log('        ENTITLEMENT_SIGNING_JWK, then delete both private files.');
  console.log('');
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error('\n  ' + e.message + '\n'); process.exit(1); }
}

module.exports = { generate, defaultKid, _assertOutsideRepo };
