// ════════════════════════════════════════════════════════════════════════════
// DeviceService — the client that actually talks to the control plane
//
// Everything else was in place and nothing joined it up: EntitlementService
// could verify and cache a signed entitlement, but nothing ever fetched one,
// because fetching needs a device token, and getting a token needs a device
// secret, and getting a secret needs registration. This is that chain.
//
//   register  →  device secret   (once, kept)
//   token     →  short-lived     (renewed as needed)
//   sync      →  entitlement     (verified, cached, enforced)
//
// ── Offline is the normal case, not the error case ──────────────────────────
//
// Every step here is allowed to fail, quietly, forever. These are Pakistani
// hostels; the internet is frequently absent, and the control plane being
// unreachable must never stop hostel operations. A failure logs at DEBUG and
// the app carries on from the local licence exactly as it did before any of
// this existed.
//
// ── It does nothing at all until configured ─────────────────────────────────
//
// With no `apiBase` this service performs ZERO network requests. That is the
// Phase 1 gate and it still holds: installing this build changes nothing for
// the machines in the field until someone sets the URL.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const logger = require('./logger');
const api = require('./api-client');

const log = logger.forService('device');

const CREDENTIALS_FILE = 'device.enc';

// Renew the token a minute before it lapses, rather than discovering it has
// lapsed mid-request and paying for a second round trip.
const TOKEN_SKEW_MS = 60000;

class DeviceService {
  /**
   * @param {object} opts
   * @param {string}   opts.userDataDir
   * @param {function} opts.machineIdProvider  () => string
   * @param {function} opts.licenceProvider    () => ({ key, valid }) — the licence file
   * @param {object}   opts.entitlement        EntitlementService
   * @param {object}   [opts.cfg]
   * @param {function} [opts.onChanged]        called after the entitlement changes
   */
  constructor(opts) {
    const o = opts || {};
    this.cfg = o.cfg || config.get();
    this.userDataDir = o.userDataDir || null;
    this._machineId = o.machineIdProvider || (() => null);
    this._licence = o.licenceProvider || (() => null);
    this.entitlement = o.entitlement || null;
    this._onChanged = o.onChanged || (() => {});

    this._creds = null;          // { deviceId, deviceSecret }
    this._token = null;          // { value, expiresAt }
    this._timer = null;
    this._syncing = false;
    this._lastSyncAt = null;
    this._lastError = null;
  }

  get credentialsFile() {
    return this.userDataDir ? path.join(this.userDataDir, CREDENTIALS_FILE) : null;
  }

  // ── Credential storage ────────────────────────────────────────────────────
  //
  // Encrypted with a key derived from the machine fingerprint, so the file is
  // not a plaintext credential sitting in a folder the customer browses.
  //
  // This is defence in depth rather than the load-bearing control: an
  // entitlement is bound to a machineId, so a secret copied to another computer
  // buys an entitlement that computer will refuse. The encryption stops casual
  // copying; the binding is what actually enforces it.

  _key() {
    const machineId = this._machineId();
    if (!machineId) return null;
    return crypto.scryptSync(machineId, 'hostyllo_device_v1', 32);
  }

  _loadCredentials() {
    if (this._creds) return this._creds;
    const file = this.credentialsFile;
    const key = this._key();
    if (!file || !key || !fs.existsSync(file)) return null;
    try {
      const buf = Buffer.from(fs.readFileSync(file, 'utf8'), 'base64');
      const iv = buf.slice(0, 16);
      const tag = buf.slice(16, 32);
      const enc = buf.slice(32);
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      this._creds = JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString());
      return this._creds;
    } catch (e) {
      // A credentials file this machine cannot read is a credentials file it
      // does not have. Registering again is cheap and always correct.
      log.warn('device_credentials_unreadable', { message: e.message });
      return null;
    }
  }

  _saveCredentials(creds) {
    const file = this.credentialsFile;
    const key = this._key();
    if (!file || !key) return;
    try {
      const iv = crypto.randomBytes(16);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(JSON.stringify(creds), 'utf8'), c.final()]);
      fs.writeFileSync(file,
        Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64'), 'utf8');
      this._creds = creds;
    } catch (e) {
      // Losing the file costs one re-registration on next launch, never a boot.
      log.warn('device_credentials_unwritable', { message: e.message });
    }
  }

  clearCredentials() {
    this._creds = null;
    this._token = null;
    try {
      const file = this.credentialsFile;
      if (file && fs.existsSync(file)) fs.unlinkSync(file);
    } catch (_) {}
  }

  // ── The chain ─────────────────────────────────────────────────────────────

  /**
   * Bind this machine to its licence. Idempotent on the server: re-registering
   * the same machine rotates the secret rather than creating a second device,
   * which is exactly what a reinstall needs.
   */
  async register() {
    if (!config.isConfigured()) return { ok: false, errorCode: 'E_NOT_CONFIGURED' };

    const licence = this._licence();
    const machineId = this._machineId();
    if (!licence || !licence.key || !machineId) {
      return { ok: false, errorCode: 'E_NO_LICENCE' };
    }

    const res = await api.request({
      method: 'POST',
      path: '/devices/register',
      body: {
        licenseKey: licence.key,
        machineId,
        appVersion: this.cfg.appVersion || undefined,
        os: process.platform
      }
    });

    if (!res.ok) {
      this._lastError = res.errorCode;
      log.info('device_register_failed', { errorCode: res.errorCode, status: res.status });
      return { ok: false, errorCode: res.errorCode, status: res.status };
    }

    const data = (res.data && res.data.data) || res.data || {};
    if (!data.deviceId || !data.deviceSecret) {
      return { ok: false, errorCode: 'E_BAD_RESPONSE' };
    }

    this._saveCredentials({ deviceId: data.deviceId, deviceSecret: data.deviceSecret });
    this._token = null;
    log.info('device_registered', { deviceId: data.deviceId, verification: data.verification });
    return { ok: true, deviceId: data.deviceId };
  }

  /** A live token, registering and exchanging as needed. */
  async _ensureToken() {
    if (this._token && this._token.expiresAt - TOKEN_SKEW_MS > Date.now()) {
      return this._token.value;
    }

    let creds = this._loadCredentials();
    if (!creds) {
      const reg = await this.register();
      if (!reg.ok) return null;
      creds = this._creds;
    }

    const res = await api.request({
      method: 'POST',
      path: '/devices/token',
      body: { deviceId: creds.deviceId, deviceSecret: creds.deviceSecret }
    });

    if (!res.ok) {
      // 401 means the server no longer accepts this secret — the device was
      // deactivated, or an admin rotated it. Registering again is the
      // documented way back, and it is what the customer would otherwise have
      // to call support for.
      if (res.errorCode === 'E_UNAUTHORIZED') {
        log.info('device_secret_rejected_reregistering');
        this.clearCredentials();
        const reg = await this.register();
        if (!reg.ok) return null;
        return this._ensureToken();
      }
      this._lastError = res.errorCode;
      return null;
    }

    const data = (res.data && res.data.data) || res.data || {};
    if (!data.token) return null;

    this._token = {
      value: data.token,
      expiresAt: Date.now() + (data.expiresIn || 900) * 1000
    };
    return this._token.value;
  }

  /**
   * Fetch and cache a fresh entitlement. This is the call that carries a
   * suspension, a revocation, a renewal or a feature-flag change from the
   * control plane to the app.
   */
  async sync() {
    if (!config.isConfigured()) return { ok: false, errorCode: 'E_NOT_CONFIGURED' };
    if (this._syncing) return { ok: false, errorCode: 'E_BUSY' };
    this._syncing = true;
    try {
      const token = await this._ensureToken();
      if (!token) {
        // Record it: without this the status showed lastError null after a
        // failed sync, which reads as "nothing went wrong" on the connection
        // panel a support call is being read from.
        this._lastError = this._lastError || 'E_NO_TOKEN';
        return { ok: false, errorCode: this._lastError };
      }

      // Compare everything that changes what the app DOES, not just the state.
      // Comparing state alone missed a feature flag being switched off and a
      // renewal date moving — both leave the state ACTIVE, so nothing was
      // pushed to the windows and the change sat invisible until the hourly
      // poll. A licence change the customer cannot see is a support call.
      const signature = (st) => st && JSON.stringify({
        state: st.state, features: st.features, expiresAt: st.expiresAt, policy: st.policy
      });
      const before = this.entitlement ? signature(this.entitlement.getStatus()) : null;
      const result = await this.entitlement.refresh(token);
      this._lastSyncAt = Date.now();

      if (result.ok) {
        this._lastError = null;
        const after = signature(result.status);
        log.info('entitlement_synced', { state: result.status.state, changed: before !== after });
        // Tell the app immediately rather than at the next poll. A suspension
        // that takes an hour to bite is a suspension the customer notices at a
        // random moment with no explanation on screen.
        if (before !== after) { try { this._onChanged(result.status); } catch (_) {} }
      } else {
        this._lastError = result.errorCode;
        log.debug('entitlement_sync_failed', { errorCode: result.errorCode });
      }
      return result;
    } catch (e) {
      // Never let a sync take the app down. This runs on a timer, unattended,
      // on machines nobody is watching.
      log.warn('entitlement_sync_threw', { message: e.message });
      return { ok: false, errorCode: 'E_UNKNOWN' };
    } finally {
      this._syncing = false;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    if (!config.isConfigured()) {
      log.info('device_service_idle', { reason: 'not_configured' });
      return;
    }
    // A short delay so a cold boot renders the app before it reaches for the
    // network. The licence already works offline; nothing here is urgent.
    setTimeout(() => { this.sync().catch(() => {}); }, 5000);

    const every = this.cfg.entitlementSyncIntervalMs || 6 * 3600 * 1000;
    this._timer = setInterval(() => { this.sync().catch(() => {}); }, every);
    if (this._timer.unref) this._timer.unref();
    log.info('device_service_started', { syncIntervalMs: every });
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  /** Diagnostics for the connection panel and support calls. */
  getStatus() {
    const creds = this._loadCredentials();
    return {
      configured: config.isConfigured(),
      registered: !!creds,
      deviceId: creds ? creds.deviceId : null,
      hasToken: !!(this._token && this._token.expiresAt > Date.now()),
      lastSyncAt: this._lastSyncAt ? new Date(this._lastSyncAt).toISOString() : null,
      lastError: this._lastError
    };
  }
}

module.exports = { DeviceService, CREDENTIALS_FILE };
