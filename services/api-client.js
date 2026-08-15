// ════════════════════════════════════════════════════════════════════════════
// ApiClient  —  Phase 1  (spec §35 API design, §36 API reliability)
//
// The one place in the application that is allowed to make an outbound HTTP
// request. It lives in the main process because the renderer's CSP is
// `connect-src 'self'` and must stay that way (audit §1) — the renderer
// cannot reach the network at all, which is exactly what §3.5 wants.
//
// §36 requires the client to tolerate: timeout, DNS failure, server outage,
// HTTP 500, authentication failure, rate limiting, partial upload, interrupted
// download, interrupted submission. It does that by never throwing for a
// network condition — every call resolves to a result object with a stable
// `errorCode`, so callers branch on data instead of on exception types.
//
// "Never create infinite retry loops" (§36) is enforced structurally:
// `maxAttempts` is a total attempt count, the loop is a bounded `for`, and
// there is no recursion.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const crypto  = require('crypto');
const config  = require('./config');
const logger  = require('./logger');

const log = logger.forService('api');

// Response bodies are diagnostics, not data feeds. Anything larger than this
// from a control-plane endpoint is a bug or an attack, not a payload.
const MAX_RESPONSE_BYTES = 1024 * 1024;

// ── Error codes (stable; §39 maps these to user-facing copy) ────────────────
const E = {
  NOT_CONFIGURED: 'E_NOT_CONFIGURED', // no control plane URL — see config.js
  OFFLINE:        'E_OFFLINE',        // DNS / connect failure
  TIMEOUT:        'E_TIMEOUT',
  ABORTED:        'E_ABORTED',        // caller cancelled
  SERVER:         'E_SERVER',         // 5xx
  RATE_LIMITED:   'E_RATE_LIMITED',   // 429
  UNAUTHORIZED:   'E_UNAUTHORIZED',   // 401 / 403
  NOT_FOUND:      'E_NOT_FOUND',      // 404
  CLIENT:         'E_CLIENT',         // other 4xx
  BAD_RESPONSE:   'E_BAD_RESPONSE',   // unparseable / oversized body
  UNKNOWN:        'E_UNKNOWN'
};

// DNS and connect-level failures. These are "the network is not there",
// which is a normal state for this product, not an error worth alarming about.
const OFFLINE_SYSCALL_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH',
  'ENETUNREACH', 'ENETDOWN', 'EPIPE', 'UND_ERR_SOCKET',
  // Chromium net errors surfaced by Electron's net.fetch
  'ERR_NAME_NOT_RESOLVED', 'ERR_INTERNET_DISCONNECTED',
  'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_RESET', 'ERR_ADDRESS_UNREACHABLE',
  'ERR_PROXY_CONNECTION_FAILED'
]);

// ── Transport ───────────────────────────────────────────────────────────────
// Electron's net.fetch honours the OS proxy and the app's certificate
// handling; plain global fetch does not. Hostels on institutional networks sit
// behind proxies, so net.fetch is strongly preferred. global fetch is the
// fallback so this module stays unit-testable outside Electron.
let _fetchImpl = null;
function _fetch() {
  if (_fetchImpl) return _fetchImpl;
  try {
    const { net } = require('electron');
    if (net && typeof net.fetch === 'function') {
      _fetchImpl = (url, opts) => net.fetch(url, opts);
      return _fetchImpl;
    }
  } catch (_) { /* not running inside Electron */ }
  if (typeof globalThis.fetch === 'function') {
    _fetchImpl = (url, opts) => globalThis.fetch(url, opts);
    return _fetchImpl;
  }
  return null;
}

/** Test seam. Pass null to restore real transport detection. */
function _setFetch(fn) { _fetchImpl = fn; }

// ── Retry policy ────────────────────────────────────────────────────────────

function isRetryableCode(code) {
  return code === E.OFFLINE || code === E.TIMEOUT ||
         code === E.SERVER  || code === E.RATE_LIMITED;
}

/**
 * A POST is only safe to retry if the server can recognise the duplicate.
 * Without an idempotency key, a retried POST risks creating two support
 * tickets from one click — so we return the failure instead of guessing.
 */
function isRetryableRequest(method, idempotencyKey) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || m === 'PUT' || m === 'DELETE') return true;
  return !!idempotencyKey;
}

/**
 * Full jitter (AWS' formulation): random between 0 and the capped exponential.
 * Plain exponential backoff synchronises every client that failed at the same
 * moment — 50 hostels retrying in lockstep is a self-inflicted thundering herd
 * against a control plane that just came back up.
 */
function backoffDelay(attempt, cfg) {
  const base = cfg.backoffBaseMs;
  const cap  = cfg.backoffMaxMs;
  const exp  = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  return Math.floor(Math.random() * exp);
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const secs = Number(headerValue);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 300000);
  const when = Date.parse(headerValue);
  if (!Number.isNaN(when)) {
    const delta = when - Date.now();
    if (delta > 0) return Math.min(delta, 300000);
  }
  return null;
}

function classifyStatus(status) {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return E.UNAUTHORIZED;
  if (status === 404) return E.NOT_FOUND;
  if (status === 408) return E.TIMEOUT;
  if (status === 429) return E.RATE_LIMITED;
  if (status >= 500) return E.SERVER;
  return E.CLIENT;
}

function classifyThrown(err, timedOut, callerAborted) {
  if (callerAborted) return E.ABORTED;
  if (timedOut) return E.TIMEOUT;
  const code = err && (err.code || err.errno || err.name);
  if (code && OFFLINE_SYSCALL_CODES.has(String(code))) return E.OFFLINE;
  // Chromium reports these as messages rather than codes.
  const msg = String((err && err.message) || '');
  if (/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|getaddrinfo|ENOTFOUND|fetch failed/i.test(msg)) {
    return E.OFFLINE;
  }
  return E.UNKNOWN;
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function readBody(res) {
  const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  const len  = Number((res.headers && res.headers.get && res.headers.get('content-length')) || 0);
  if (Number.isFinite(len) && len > MAX_RESPONSE_BYTES) {
    return { error: E.BAD_RESPONSE, data: null };
  }
  let text;
  try {
    text = await res.text();
  } catch (_) {
    // A body that dies mid-read is §36's "partial upload"/interrupted transfer.
    return { error: E.BAD_RESPONSE, data: null };
  }
  if (text.length > MAX_RESPONSE_BYTES) return { error: E.BAD_RESPONSE, data: null };
  if (!text) return { error: null, data: null };
  if (/json/i.test(type)) {
    try { return { error: null, data: JSON.parse(text) }; }
    catch (_) { return { error: E.BAD_RESPONSE, data: null }; }
  }
  return { error: null, data: text };
}

/**
 * Perform one HTTP request with timeout, bounded retries and backoff.
 *
 * Resolves — never rejects — with:
 *   { ok, status, data, errorCode, errorMessage, attempts, durationMs, correlationId }
 *
 * @param {object} opts
 * @param {string}  opts.path            e.g. '/desktop/v1/healthz'
 * @param {string}  [opts.method]        default GET
 * @param {object}  [opts.body]          serialised as JSON
 * @param {object}  [opts.headers]
 * @param {string}  [opts.idempotencyKey] required to retry a POST
 * @param {number}  [opts.timeoutMs]     per attempt
 * @param {number}  [opts.maxAttempts]   total attempts, including the first
 * @param {string}  [opts.correlationId]
 * @param {AbortSignal} [opts.signal]    caller cancellation
 */
async function request(opts) {
  const cfg = config.get();
  const o   = opts || {};
  const method = String(o.method || 'GET').toUpperCase();
  const correlationId = o.correlationId || logger.newCorrelationId();
  const started = Date.now();

  const url = config.url(o.path);
  if (!url) {
    // Not an error worth logging at WARN on every call — being unconfigured is
    // the designed Phase 1 state.
    return {
      ok: false, status: 0, data: null,
      errorCode: E.NOT_CONFIGURED,
      errorMessage: 'No control plane is configured.',
      attempts: 0, durationMs: 0, correlationId
    };
  }

  const doFetch = _fetch();
  if (!doFetch) {
    return {
      ok: false, status: 0, data: null,
      errorCode: E.UNKNOWN, errorMessage: 'No HTTP transport available.',
      attempts: 0, durationMs: 0, correlationId
    };
  }

  const timeoutMs   = Number.isFinite(o.timeoutMs)   ? o.timeoutMs   : cfg.requestTimeoutMs;
  const maxAttempts = Math.max(1, Math.min(10,
    Number.isFinite(o.maxAttempts) ? o.maxAttempts : cfg.maxAttempts));
  const retryable   = isRetryableRequest(method, o.idempotencyKey);

  const headers = Object.assign({
    'Accept': 'application/json',
    'X-Correlation-Id': correlationId
  }, o.headers || {});
  if (o.idempotencyKey) headers['Idempotency-Key'] = String(o.idempotencyKey);

  let payload;
  if (o.body !== undefined && o.body !== null) {
    payload = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  let last = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (o.signal && o.signal.aborted) {
      return {
        ok: false, status: 0, data: null, errorCode: E.ABORTED,
        errorMessage: 'Cancelled.', attempts: attempt - 1,
        durationMs: Date.now() - started, correlationId
      };
    }

    const controller = new AbortController();
    let timedOut = false;
    let callerAborted = false;
    const onCallerAbort = () => { callerAborted = true; controller.abort(); };
    if (o.signal) o.signal.addEventListener('abort', onCallerAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

    let res = null, thrown = null;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
        // No cookies, no ambient credentials — the device token is an explicit
        // header supplied by the caller (Phase 2).
        credentials: 'omit',
        redirect: 'follow'
      });
    } catch (e) {
      thrown = e;
    } finally {
      clearTimeout(timer);
      if (o.signal) o.signal.removeEventListener('abort', onCallerAbort);
    }

    let errorCode = null, errorMessage = null, status = 0, data = null, retryAfterMs = null;

    if (thrown) {
      errorCode    = classifyThrown(thrown, timedOut, callerAborted);
      errorMessage = String(thrown.message || thrown);
    } else {
      status = res.status;
      retryAfterMs = parseRetryAfter(res.headers && res.headers.get && res.headers.get('retry-after'));
      const statusCode = classifyStatus(status);
      const body = await readBody(res);
      if (body.error) {
        errorCode = body.error;
        errorMessage = 'Unreadable response body.';
      } else {
        data = body.data;
        if (statusCode) {
          errorCode = statusCode;
          errorMessage = (data && typeof data === 'object' && typeof data.message === 'string')
            ? data.message
            : `HTTP ${status}`;
        }
      }
    }

    last = {
      ok: !errorCode, status, data, errorCode, errorMessage,
      attempts: attempt, durationMs: Date.now() - started, correlationId
    };

    if (!errorCode) {
      log.debug('request_ok', { correlationId, path: o.path, method, status, durationMs: last.durationMs, attempt });
      return last;
    }

    const willRetry = retryable && isRetryableCode(errorCode) && attempt < maxAttempts;
    log[willRetry ? 'debug' : 'warn']('request_failed', {
      correlationId, path: o.path, method, status,
      errorCode, attempt, maxAttempts, willRetry,
      durationMs: last.durationMs
    });

    if (!willRetry) return last;

    // A server that says "wait 30s" is telling us something we cannot infer.
    const delay = retryAfterMs != null ? retryAfterMs : backoffDelay(attempt, cfg);
    await sleep(delay);
  }

  return last;
}

/** Cheap liveness probe used by ConnectivityService. Never retries. */
async function probe(correlationId) {
  const cfg = config.get();
  return request({
    path: '/healthz',
    method: 'GET',
    timeoutMs: cfg.probeTimeoutMs,
    maxAttempts: 1,
    correlationId
  });
}

function newIdempotencyKey() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
}

module.exports = {
  request,
  probe,
  newIdempotencyKey,
  ERRORS: E,
  // exported for the test suite
  _setFetch,
  _internal: { backoffDelay, isRetryableRequest, isRetryableCode, classifyStatus, classifyThrown, parseRetryAfter }
};
