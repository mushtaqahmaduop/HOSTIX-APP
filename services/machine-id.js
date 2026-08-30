/* ─── HOSTYLLO — MACHINE FINGERPRINT ─────────────────────────────────────────

   The licence file is AES-encrypted with a key derived from this machine's
   fingerprint, so this function decides whether a paying customer's licence
   opens or reads as TAMPERED. It has to give the same answer every single
   boot, on the same machine, forever.

   IT DID NOT.

   The fingerprint hashed six facts, three of which shelled out to `wmic` with
   a 2000 ms timeout and a bare `catch { return '' }`:

       os.platform() | os.arch() | cpu model | MachineGuid | drive | BIOS

   An empty string is not an error here — it is a DIFFERENT FACT. A cold WMI
   service, a machine busy at boot, or a Windows build that has finally dropped
   wmic (it is deprecated and already absent from recent images) each produce
   '', the hash changes, and the customer is sent to the activation screen
   holding a licence that is perfectly valid. Nothing in the app explains why.
   Observed on a dev profile on 2026-08-30: a licence written four days earlier
   would not decrypt, while all three probes answered fine seconds later.

   Two defences, in order:

   1. DON'T FAIL. Each fact is asked for twice, by two unrelated mechanisms —
      wmic, then a PowerShell CIM query; the registry via `reg`, then via
      PowerShell. A machine has to lose both to lose the fact.

   2. IF A FACT IS STILL MISSING, REMEMBER IT — BUT ONLY ON PROOF. The last
      clean reading is kept in machine.json beside the licence. A missing fact
      is substituted from it ONLY when at least two of the other hardware facts
      were read fresh AND match what was stored. That bar is the whole security
      of it: copy license.enc and machine.json to another PC and break WMI
      there, and that machine's registry GUID disagrees, so nothing is
      substituted and the licence still refuses. The substitution rescues a
      machine that can prove it is itself; it does not travel.

   A degraded reading is never written back. Persisting '' would teach the
   install that this machine has no BIOS serial, which is the bug wearing a
   hat.

   COMPATIBILITY IS NOT OPTIONAL. 50+ installs hold licences bound to the hash
   the old code produced. When every probe answers — the normal case, every
   boot, on every healthy machine — the string hashed here is byte-for-byte
   what it always was, so every one of those licences keeps opening. The tests
   in tests/services.test.js pin that against a hard-coded expected digest.

   Pure Node on purpose: no electron import, so tests/services.test.js can
   drive it directly instead of test-license.js keeping its own copy that
   nobody could prove matched.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** The three facts that come off the hardware, in hash order. */
const HW = ['guid', 'drive', 'bios'];

/** Matches must be independently corroborated this many times to substitute. */
const CORROBORATION_REQUIRED = 2;

/* Long enough for a cold WMI service, short enough that a machine where every
   probe is broken still boots. Worst case is two probes per fact, so 30s on a
   machine that has lost WMI, the registry AND PowerShell; the healthy case is
   a few hundred milliseconds and never reaches the second attempt. */
const PROBE_TIMEOUT_MS = 5000;

function _exec(cmd) {
  try {
    const { execSync } = require('child_process');
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }) || '';
  } catch (e) {
    return '';
  }
}

/* PowerShell is invoked with -EncodedCommand rather than -Command: the scripts
   below contain quotes and backslashes, and passing them through cmd.exe by
   hand is how quoting bugs get shipped into a licence check. */
function _ps(script) {
  return 'powershell -NoProfile -NonInteractive -EncodedCommand ' +
    Buffer.from(script, 'utf16le').toString('base64');
}

/** Try each [command, pattern] in turn; first non-empty capture wins. */
function _probe(attempts, exec) {
  const run = exec || _exec;
  for (const [cmd, re] of attempts) {
    const out = run(cmd);
    if (!out) continue;
    const m = out.match(re);
    if (m && m[1] && m[1].trim()) return m[1].trim();
  }
  return '';
}

function getWinMachineGuid(exec) {
  if (os.platform() !== 'win32') return '';
  return _probe([
    ['reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      /MachineGuid\s+REG_SZ\s+([^\r\n]+)/],
    [_ps("(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid"),
      /([0-9a-fA-F]{8}-[0-9a-fA-F-]{27,})/],
  ], exec);
}

function getDriveSerial(exec) {
  if (os.platform() !== 'win32') return '';
  return _probe([
    ['wmic logicaldisk where "DeviceID=\'C:\'" get VolumeSerialNumber /value',
      /VolumeSerialNumber=(\w+)/],
    [_ps('(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=\'C:\'").VolumeSerialNumber'),
      // Anchored to a whole line. The loose /([0-9A-Za-z]{4,})/ this started as
      // would happily capture the word "VolumeSerialNumber" out of a header or
      // a warning line and hash it as though it were the serial.
      /^[ \t]*([0-9A-Za-z-]{4,32})[ \t]*$/m],
  ], exec);
}

function getBiosSerial(exec) {
  if (os.platform() !== 'win32') return '';
  return _probe([
    ['wmic bios get SerialNumber /value', /SerialNumber=([^\r\n]+)/],
    // Same anchoring: the first line that is entirely the serial, not the first
    // run of non-space characters anywhere in the output.
    [_ps('(Get-CimInstance Win32_BIOS).SerialNumber'), /^[ \t]*(\S[^\r\n]*?)[ \t]*$/m],
  ], exec);
}

/** Read every hardware fact this machine will admit to. */
function probeFactors(exec) {
  return {
    guid:  getWinMachineGuid(exec),
    drive: getDriveSerial(exec),
    bios:  getBiosSerial(exec),
  };
}

function machineFilePath(stateDir) {
  return path.join(stateDir, 'machine.json');
}

function readKnownFactors(stateDir) {
  try {
    const j = JSON.parse(fs.readFileSync(machineFilePath(stateDir), 'utf8'));
    if (!j || j.v !== 1 || !j.factors) return null;
    return j.factors;
  } catch (e) {
    return null;
  }
}

function writeKnownFactors(stateDir, factors) {
  try {
    fs.writeFileSync(machineFilePath(stateDir),
      JSON.stringify({ v: 1, savedAt: new Date().toISOString(), factors }), 'utf8');
    return true;
  } catch (e) {
    return false;                       // never fatal: this is a safety net
  }
}

/**
 * Decide the hardware facts to hash, given what was read now and what this
 * install saw last time.
 *
 * Returned `reason` is for the log, not for control flow:
 *   clean        every fact read fresh
 *   substituted  a fact was missing and the machine proved it is itself
 *   degraded     a fact was missing and it could not, so the id WILL change
 *   changed      a fact genuinely differs — real hardware change, or another PC
 */
function resolveFactors(fresh, known) {
  const used = { guid: fresh.guid || '', drive: fresh.drive || '', bios: fresh.bios || '' };
  const missing = HW.filter(k => !used[k]);
  if (!missing.length) return { used, reason: 'clean', confirmed: HW.length };

  if (!known) return { used, reason: 'degraded', confirmed: 0 };

  const confirmed = HW.filter(k => used[k] && known[k] && used[k] === known[k]).length;
  const changed   = HW.some(k => used[k] && known[k] && used[k] !== known[k]);

  // A fact that disagrees means a different machine (or replaced hardware).
  // Substituting the others would paper over exactly the case this binding
  // exists to catch.
  if (changed) return { used, reason: 'changed', confirmed };

  if (confirmed < CORROBORATION_REQUIRED) return { used, reason: 'degraded', confirmed };

  for (const k of missing) if (known[k]) used[k] = known[k];
  return { used, reason: 'substituted', confirmed };
}

/**
 * The fingerprint.
 *
 * opts.stateDir  where machine.json lives (the app's userData directory)
 * opts.exec      injectable command runner, for tests
 * opts.factors   injectable probe result, for tests
 * opts.system    injectable { platform, arch, cpu }, for tests
 * opts.logger    optional { warn }
 *
 * Returns { id, reason, factors }.
 */
function computeMachineId(opts) {
  const o = opts || {};
  const sys = o.system || {
    platform: os.platform(),
    arch: os.arch(),
    cpu: (os.cpus()[0] && os.cpus()[0].model) || 'cpu',
  };
  const fresh = o.factors || probeFactors(o.exec);
  const known = o.stateDir ? readKnownFactors(o.stateDir) : null;
  const { used, reason, confirmed } = resolveFactors(fresh, known);

  // THE ORDER AND THE SEPARATOR ARE THE COMPATIBILITY CONTRACT. Every licence
  // in the field was sealed against this exact string. Do not reformat it, do
  // not add a factor, do not "tidy" the join.
  const raw = [sys.platform, sys.arch, sys.cpu, used.guid, used.drive, used.bios].join('|');
  const id = crypto.createHash('sha256').update(raw).digest('hex');

  // Only a clean reading is worth remembering.
  if (reason === 'clean' && o.stateDir) writeKnownFactors(o.stateDir, used);

  if (reason !== 'clean' && o.logger && typeof o.logger.warn === 'function') {
    o.logger.warn('[HOSTYLLO] hardware probe ' + reason +
      ' (guid=' + !!fresh.guid + ' drive=' + !!fresh.drive + ' bios=' + !!fresh.bios +
      ', confirmed=' + confirmed + ')' +
      (reason === 'degraded'
        ? ' — the machine id will not match a licence sealed on a clean boot'
        : ''));
  }

  return { id, reason, factors: used };
}

module.exports = {
  HW,
  CORROBORATION_REQUIRED,
  PROBE_TIMEOUT_MS,
  probeFactors,
  getWinMachineGuid,
  getDriveSerial,
  getBiosSerial,
  readKnownFactors,
  writeKnownFactors,
  machineFilePath,
  resolveFactors,
  computeMachineId,
};
