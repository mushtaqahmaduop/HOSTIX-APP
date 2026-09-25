// ════════════════════════════════════════════════════════════════════════════
// better-sqlite3 for a SPEC, on the Windows 7/8 edition.
//
// A few specs open the database straight from the Playwright runner, which is
// the build PC's own Node. On the main edition that works: better-sqlite3 13
// is a Node-API module and one binary loads in Node and in Electron alike. The
// legacy edition pins better-sqlite3 9 for Electron 22, and 9 is built for ONE
// runtime — so under the runner the require fails and the spec dies before it
// has tested anything.
//
// This returns the real module when it loads. When it does not, it returns a
// stand-in with the small synchronous surface those specs use —
// new Database(file, {readonly}), exec, prepare(sql).run/get/all, close — that
// runs each call through Electron 22 itself (ELECTRON_RUN_AS_NODE), i.e. with
// the very binary the app uses. Every call opens and closes the file, which is
// slow and irrelevant: these specs make a handful of calls. Not named
// *.spec.js on purpose — Playwright's testMatch would try to run it.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

function real() {
  try { const D = require('better-sqlite3'); new D(':memory:').close(); return D; } catch (_) { return null; }
}

const MOD = path.join(__dirname, '..', 'node_modules', 'better-sqlite3').replace(/\\/g, '/');

function viaElectron(file, readonly, op) {
  const script =
    'const D=require(' + JSON.stringify(MOD) + ');' +
    'const d=new D(' + JSON.stringify(file) + ',{readonly:' + !!readonly + '});' +
    'let r=null;try{const o=' + JSON.stringify(op) + ';' +
    'if(o.kind==="exec")d.exec(o.sql);' +
    'else{const s=d.prepare(o.sql);r=s[o.kind](...o.args);}' +
    '}finally{d.close();}' +
    'process.stdout.write(JSON.stringify(r===undefined?null:r));';
  // NODE_OPTIONS is dropped: the runner's memory flags (--max-semi-space-size)
  // are not allowed in NODE_OPTIONS by Electron 22's Node 16, which then exits.
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  delete env.NODE_OPTIONS;
  const out = execFileSync(require('electron'), ['-e', script], { env, encoding: 'utf8' });
  return out ? JSON.parse(out) : null;
}

class ElectronDatabase {
  constructor(file, opts) { this.file = file; this.readonly = !!(opts && opts.readonly); }
  exec(sql) { viaElectron(this.file, this.readonly, { kind: 'exec', sql }); return this; }
  prepare(sql) {
    const call = (kind) => (...args) => viaElectron(this.file, this.readonly, { kind, sql, args });
    return { run: call('run'), get: call('get'), all: call('all') };
  }
  close() {}
}

module.exports = real() || ElectronDatabase;
