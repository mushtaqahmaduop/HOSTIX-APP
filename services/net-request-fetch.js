'use strict';
// ════════════════════════════════════════════════════════════════════════════
// A fetch() for Electron builds that have neither net.fetch nor a global fetch.
//
// WHY (2026-09-25, the Windows 7/8/8.1 edition). That edition runs on Electron
// 22 — the last release those Windows versions can run — whose main process is
// Node 16.17: no global fetch (Node 18) and no net.fetch (Electron 28). The two
// callers that talk to the network both fell through to "no transport":
//
//   · api-client.js answered every request "No HTTP transport available", so a
//     v5 key could never activate and a hostel could never sync;
//   · discovery.js returned `no_fetch`, so a fresh install never learned where
//     the control plane is at all.
//
// Neither failure said anything a warden would see. This wraps Electron's own
// net.request — which Electron 22 has, and which, like net.fetch, honours the
// OS proxy — in the small part of the fetch contract those two callers use:
//
//   request:  url, { method, headers, body, signal, redirect: 'follow' }
//   response: status, ok, headers.get(name), text(), json()
//
// No cookies: net.request's useSessionCookies defaults to false, which is the
// same as the credentials:'omit' api-client asks for. A newer Electron never
// reaches this file — api-client prefers net.fetch and discovery prefers the
// global fetch — so the Windows 10/11 edition's behaviour is unchanged.
// ════════════════════════════════════════════════════════════════════════════

/** @returns {function|null} a fetch-shaped function, or null outside Electron */
function netRequestFetch() {
  let net = null;
  try { ({ net } = require('electron')); } catch (_) { return null; }
  if (!net || typeof net.request !== 'function') return null;

  return function fetchViaNetRequest(url, opts) {
    const o = opts || {};
    return new Promise((resolve, reject) => {
      if (o.signal && o.signal.aborted) { reject(_abortError()); return; }

      let req;
      try {
        req = net.request({ url: String(url), method: String(o.method || 'GET').toUpperCase(),
                            redirect: 'follow' });
      } catch (e) { reject(e); return; }

      const headers = o.headers || {};
      for (const k of Object.keys(headers)) {
        // Chromium sets Content-Length itself and refuses it from the caller.
        if (/^content-length$/i.test(k)) continue;
        try { req.setHeader(k, String(headers[k])); } catch (_) { /* a header Chromium owns */ }
      }

      let settled = false;
      const fail = (e) => { if (!settled) { settled = true; reject(e); } };
      const onAbort = () => { try { req.abort(); } catch (_) {} fail(_abortError()); };
      if (o.signal) o.signal.addEventListener('abort', onAbort, { once: true });
      const done = () => { if (o.signal) o.signal.removeEventListener('abort', onAbort); };

      req.on('response', (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('error', (e) => { done(); fail(e); });
        res.on('end', () => {
          done();
          if (settled) return;
          settled = true;
          const buf = Buffer.concat(chunks);
          const h = res.headers || {};
          const status = res.statusCode;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            headers: { get: (name) => {
              const v = h[String(name).toLowerCase()];
              return v == null ? null : Array.isArray(v) ? v.join(', ') : String(v);
            } },
            text: async () => buf.toString('utf8'),
            json: async () => JSON.parse(buf.toString('utf8')),
          });
        });
      });
      // Chromium reports network failures as messages ("net::ERR_NAME_NOT_RESOLVED"),
      // which api-client's classifyThrown() already reads as OFFLINE.
      req.on('error', (e) => { done(); fail(e); });
      req.on('abort', () => { done(); fail(_abortError()); });

      if (o.body != null) req.write(typeof o.body === 'string' ? o.body : String(o.body));
      req.end();
    });
  };
}

function _abortError() {
  const e = new Error('The operation was aborted.');
  e.name = 'AbortError';
  return e;
}

module.exports = { netRequestFetch };
