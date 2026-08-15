# Phase 1 — Foundation

**Spec:** `HOSTYLLO_HOSTIX_ENTERPRISE_UPGRADE_SPEC.md` §47 Phase 1
**Branch:** `feature/phase-1-foundation`, worktree `C:\HOSTIX-APP-phase1`, off `chore/electron-43` @ `2130c4d`
**Date:** 2026-08-15
**Gate (audit §13):** *offline behaviour unchanged; queue survives restart* — **both met, see §5.**

Reported in the §49 shape: changed / preserved / discovered / tested / risks.

---

## 1. What Phase 1 delivers

§47 lists eight items. All eight, plus the redaction layer §25 calls a
prerequisite:

| Spec item | Where | Notes |
|---|---|---|
| Shared online service layer | `services/index.js` | one bootstrap, one `require` in `main.js` |
| Connectivity service (§7) | `services/connectivity.js` | four separate states, not one boolean |
| Secure IPC (§3.5) | `main.js` + `preload.js` | 4 read-only channels + 1 push event |
| API client (§35, §36) | `services/api-client.js` | timeouts, bounded retries, jitter, idempotency |
| Local durable queue (§37) | `services/online-queue.js` | SQLite-backed, survives restart |
| Structured logging (§40) | `services/logger.js` | JSONL, levels, correlation ids, rotation |
| Error handling (§39) | `services/api-client.js` | stable `E_*` codes; no stack traces to users |
| Shared design tokens (§31) | `renderer/tokens.css` | **additive only** — see §2 |
| Redaction (§25) | `services/redact.js` | key pass + value pass, applied to every log line |

---

## 2. Changed

**New — `services/` (7 files, main process only).** Nothing in `renderer/`
gained JavaScript. The renderer's CSP stays `connect-src 'self'`; every
outbound request lives in the main process, which is what §3.5 requires and
what audit §1 identified as architecturally lucky. Do not relax it.

**`main.js` — 5 edits, ~60 lines.**
- requires `./services` and `./services/logger`
- installs crash handlers immediately after the anti-debug block, so a crash
  during database init or window creation is still captured
- starts the services in `whenReady()`, after `initDatabase()` (the queue needs
  the handle) and before `createWindow()` (so `online:*` handlers exist before
  any renderer can call them). Wrapped in try/catch: an online-services failure
  must never stop an offline app from booting.
- `license:check` now reports its result to the connectivity service
- `will-quit` stops the pollers

**`preload.js` — one new namespace, `window.online`.** Five methods, all
read-only. The renderer cannot supply a URL, a method, a header or a payload.
The `IpcRendererEvent` is never handed across — it carries a `sender` that
would widen the bridge far past a status snapshot.

**`package.json`** — `test:services` script, and `services/**/*` added to the
electron-builder `files` allowlist. **That second one is load-bearing:** `files`
is an explicit allowlist, so without it the packaged app would boot straight
into `MODULE_NOT_FOUND` while `npm start` kept working perfectly.

**`renderer/tokens.css` — additive only.** No existing token is redefined, so
no rendered pixel changes. §31's conceptual list was already almost entirely
covered by the existing file; this adds the names that had no token
(`--border-focus`, `--text-disabled`, the `--brand-*` aliases) and the
connectivity palette §29's indicator will need, so no screen invents its own.
CLAUDE.md rule 5 holds — the accent set is still `--accent*`; the new names
alias it.

---

## 3. Preserved

- **No schema version bump.** `online_queue` is a `CREATE TABLE IF NOT EXISTS`
  of a new table. Nothing is altered, nothing is transformed, an older build
  ignores it. The first *altering* change takes v2 (§41, audit M5).
- **The generic `db:*` bridge is frozen, not rewritten** (audit M1, Rule 3).
- **`db:exportFull` / `db:importFull` are untouched**, so `online_queue` is
  deliberately absent from backups: the queue is device-local machine state,
  and restoring a backup onto another machine must not replay the first
  machine's pending uploads.
- **Crash semantics are unchanged.** The handler logs, prints the stack to
  stderr and exits 1 — exactly what Node does with no handler installed.
  Swallowing crashes would change how the app fails on 50+ machines. There is
  a test that asserts the exit code, so a future refactor cannot quietly
  change it.
- **The licence path is untouched.** No change to `license.enc`, machine ID,
  `last_run.dat`, or the AES-256-CBC + HMAC container.

---

## 4. Discovered

**(a) `checkLicenseValidity()` has a side effect — it writes `last_run.dat`.**
`main.js:332`. That file is the anti-clock-rollback watermark. The obvious
wiring (have ConnectivityService poll the licence every 60s) would rewrite it
all day and quietly tighten a tamper check that 50+ machines already depend on.
So the service **never calls it**. `license:check` reports the result of checks
the app was going to make anyway, and the service caches it. Anyone wiring
Phase 2's entitlement service needs to know this before reaching for that
function.

**(b) `online_queue` matches the `db:*` bridge's `/^[a-z_]+$/` table check.**
Renderer code could have read the queue, or wiped it with `db:bulkReplace`.
Fixed with `_assertRendererTable()` and a reserved-table set; there is a
Playwright assertion for each of `dbAll` / `dbUpsert` / `dbBulkReplace`.

**(c) A buffered log stream loses the crash line.** The logger originally used
`fs.createWriteStream`. The uncaughtException handler calls `process.exit(1)`
immediately after logging, so the one line anyone would ever want to read was
still sitting in the buffer. Writes are now `appendFileSync`. Volume is a few
lines per minute, so the cost is irrelevant next to the guarantee — and the
child-process test in the unit suite is what caught it.

**(d) `electron-builder`'s `files` is an allowlist.** See §2. A `npm start`
smoke test would never have found this; only packaging would.

**(e) Running the Playwright suite dirties a tracked binary,**
`undefined/menu-fixed.png` — a screenshot written to a directory literally
named `undefined`, from a path built out of an undefined variable somewhere in
the specs. It shows up as a modification in the owner's tree too. Not touched
here beyond reverting it; worth a one-line fix by whoever owns that spec.

**(f) `CLAUDE.md` line 13 says the CSS accent is "Violet scheme".** It is royal
blue — `tokens.css` was repointed on the owner's call, and the file says so
explicitly. Stale line, not fixed here; it belongs with the D-1 rewrite of the
"Nothing here depends on it" sentence that is already scheduled before Phase 2.

---

## 5. Tested

**Unit suite — `npm run test:services` — 60/60, run 3×.** Plain Node, no
Electron. better-sqlite3 v13 ships an N-API prebuild so it loads under Node as
well as Electron (it did not under v9 — see the note in
`migrations/001-relational-schema.test.js`).

Coverage worth calling out:

- **The gate: durability.** The queue tests use a real on-disk SQLite file and
  genuinely close and reopen it. An in-memory test would have passed for a
  queue that loses everything on exit, which is the exact failure §26 exists to
  prevent. Also covered: a task left `inflight` by a crash is reclaimed with
  its attempt count *and* its idempotency key intact — without the key, a
  resend after a crash creates a second support ticket server-side.
- **No infinite retries** (§36), asserted from three directions: attempts stop
  at `queueMaxAttempts`, a 4xx is never retried, and a task type with no
  handler dead-letters on the first attempt instead of looping forever.
- **A POST without an idempotency key is never replayed** — one click must not
  become two tickets.
- **§7's four states stay separate.** There is a test for the single most
  common real-world state for this product: valid cached licence, unreachable
  API. `licenseValid: true` and `apiReachable: false` must both survive.
- **Network up + API down is DEGRADED, never OFFLINE.** Calling it offline
  would drive the wrong message in the UI (§29, §39).
- **Redaction**, both passes: a `password` key, and a CNIC pasted into a
  free-text `notes` field. Plus circular objects, depth/array/string caps, and
  a getter that throws — which returns `[unredactable]`, never the raw input.
- **Crash handling**, in a real child process, because "the line reached disk"
  and "the process still died with exit 1" cannot both be observed from inside
  the crashing process.

**Playwright suite — 15/15, run 3×.** 14 pre-existing specs plus the new
`online-services.spec.js`. No flakiness across the three runs.

```powershell
$env:HOSTIX_TEST_PROFILE = "<scratch>\p1-profile"   # must contain license.enc
cd C:\HOSTIX-APP-phase1
npm run test:services
npx playwright test
```

**The offline gate, asserted in a real Electron launch:** `configured: false`,
`mode: 'unconfigured'`, `lastSuccessAt: null`, zero fetch calls, and
`window.online`'s key list pinned to exactly five methods so a future addition
to the bridge has to be deliberate.

**Typecheck:** `npx tsc --noEmit` reports the same 2 pre-existing errors in
`renderer/src/storage.js` as `chore/electron-43` does — verified by running it
in both worktrees. `services/` is not in the tsconfig `include` list, which
grows one file at a time by design.

---

## 6. Risks and honest limits

- **No control plane exists, so the ApiClient has never spoken to a real
  server.** Retry, backoff, timeout and idempotency behaviour is proven against
  an injected fake transport, not against Railway. §36's "partial upload" and
  "interrupted download" cases in particular are only reasoned about. Phase 2
  must re-run this against the real `/desktop/v1/*` surface.
- **`/healthz` is an assumed endpoint.** The probe path is a guess until D-1 is
  validated against `C:\hostyllo`, which still has not been inspected.
- **`net.fetch` vs `fetch`.** Electron's proxy-aware `net.fetch` is preferred
  and the fallback exists so the module is testable outside Electron — but the
  unit tests exercise the fallback path, not `net.fetch`. Hostels behind
  institutional proxies are exactly who this matters for, and that has not been
  tested against a real proxy.
- **No packaged build has been produced or launched.** Same standing gap as
  `chore/electron-43`. The `services/**/*` addition to `files` is reasoned from
  the allowlist semantics, not proven by unpacking an asar.
- **The connectivity indicator UI (§29) is not built.** Deliberate: the owner
  has 29 uncommitted entries across `renderer/`, and adding renderer work now
  would create merge pain for no benefit while there is nothing to indicate.
  The data is ready behind `window.online` whenever the UI lands.
- **Unchanged from the audit:** C2 (licensing secret ships in the app), H1
  (expiry trusts the local clock), H4 (inconsistent HTML escaping — must be
  swept before any server-supplied content is rendered), M2 (`'unsafe-eval'`).
  None are Phase 1's scope; all are still open.

---

## 7. What Phase 2 inherits

- `config.js` — set `apiBase` and everything downstream wakes up. Nothing else
  needs to change to go online.
- `ConnectivityService.setAuthProvider()` / `setLicenseProvider()` — the two
  wiring points for device tokens and signed entitlements.
- `OnlineQueue.register(type, handler)` — support tickets, messages,
  attachments and telemetry all attach here rather than growing new queues.
- `api.newIdempotencyKey()` — required for any retryable POST.
- Read §4(a) before touching `checkLicenseValidity()`.
