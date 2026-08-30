# HOSTIX — Senior Audit Report

_Full-codebase audit: tech-stack critique, modern-stack comparison, and a bug / dead-code / quality inventory._

**Audited version:** 4.0.1 · **Date:** 2026-07-15 · **Branch:** `chore/audit-report`

---

## Verdict up front

The app **works and ships**, and for a solo-developer offline desktop tool that's the thing that
matters most. But under the hood it's carrying the scars of an unfinished migration: a dead
architecture living beside a new one, four product names, two color systems, two auth files, an
**end-of-life Electron**, and an "offline" app that quietly depends on the internet. None of these
are fatal. Together they're the difference between "runs on 50 machines" and "maintainable for the
next 5 years." The core stack choice (Electron + vanilla JS + SQLite) is _defensible_; the
**execution** is where the debt is.

---

## 1. Tech stack — what you used vs. what today's stack would be

| Concern | You used | Modern default (2026) | Why it matters here |
|---|---|---|---|
| Desktop runtime | **Electron 22.3.27** (EOL, Chromium 108) | Electron 3x **or Tauri** (Rust) | Electron 22 stopped getting security patches ~late 2023. Tauri would cut the installer from ~150MB to ~10MB and drop the bundled Chromium attack surface. |
| Language | Vanilla JS (ES5-ish, `var`, `function`) | **TypeScript** | TS would have caught _at compile time_ every duplicate-function and typo bug found below. Highest-ROI change. |
| UI rendering | 130KB modules of `innerHTML +=` string concatenation | Components (**Svelte / React / Vue**) or Web Components | String-building HTML is the root cause of the XSS surface and why `students.js` is 136KB. |
| Build/bundler | **None** ("no build step") | **Vite** | No build = can't vendor deps offline, can't use TS, can't tree-shake, can't code-split. It's why libraries load from CDNs (see §3). |
| Data layer | SQLite used as a **JSON-blob key-value store** | SQLite + a real schema via **Drizzle / Kysely / Prisma** | You pay better-sqlite3's price but throw away joins, indexes, and constraints. See §2. |
| App state | One global mutable `DB` object | A store (Zustand / Pinia / Svelte stores) | Every module reaches into and mutates `DB` directly; no single writer, no reactivity. |
| Styling | Two parallel token systems (violet `--accent` **and** orange `--gold`) | One token set + optionally Tailwind | See §4 — the design system is mid-migration and contradicts its own docs. |
| Testing | Only `test-license.js` | Vitest + **Playwright** | Zero UI/flow tests for an app handling people's rent money. |
| Licensing | Symmetric secret **baked into `main.js`** | Server activation + **Ed25519** (private key never ships) | Current scheme is security theater — see §5. |

**The honest take:** you didn't pick _wrong_ tools, you picked _dated_ ones and then stopped halfway
through modernizing. Starting today: **Tauri + TypeScript + Svelte + Vite + Drizzle/SQLite**. Minimal
disruption to what exists: **stay Electron but upgrade it, add TypeScript + Vite, and vendor the CDN libs.**

---

## 2. Architecture: SQLite is being used as a JSON file

In [main.js](main.js) (`initDatabase`, lines 40-73) every table is `(id TEXT, data TEXT)` — the entire
record is a JSON string. Then:

- **The whole database is loaded into memory** on boot ([storage.js](renderer/src/storage.js), lines 91-93)
  and all filtering/searching happens in JS.
- `dbAll()` is called **exactly twice**, and **never with a `where` filter**. That means the generated
  `VIRTUAL` columns (`status`, `roomId`, `studentId`) and the entire `db:all` column-whitelist security
  machinery (`FIX-13`) are **dead** — nothing queries by them.
- **There are no indexes** (`CREATE INDEX` appears nowhere).

So you get none of SQLite's benefits (relational queries, indexed lookups, constraints, partial reads)
and all of its costs (native module, `electron-rebuild`, ABI pinning, asarUnpack). The clever diff-based
`saveDB()` in [storage.js](renderer/src/storage.js) (lines 150-193) is a smart workaround — but it's
solving a performance problem _the architecture created_. Either use SQLite properly (columns + indexes
+ queries) or drop to a flat JSON file and skip the native dependency.

---

## 3. The "offline app" isn't offline

README says _"no internet required."_ But [index.html](renderer/index.html) (lines 11-18) loads at
runtime from the network: Google Fonts, **SheetJS** (`cdn.sheetjs.com`), **Chart.js + datalabels**
(`cdn.jsdelivr.net`).

On a hostel PC with no/poor internet: **charts don't render and Excel import silently dies.** Worse, the
main-process CSP ([main.js](main.js), lines 1016-1023) allows `'unsafe-eval'` **and** remote script hosts
— so a CDN compromise = arbitrary code in the app. Fix: `npm install chart.js xlsx`, bundle locally. A
one-hour change that removes both a reliability failure and a supply-chain risk.

**Bonus bug:** there are **two conflicting CSPs** — a `<meta>` one in
[index.html](renderer/index.html) line 7 (`connect-src 'self'`) and a header one in
[main.js](main.js) line 1012. Browsers enforce the _intersection_, so they partly cancel each other and
make the real policy hard to reason about. Pick one (the header).

---

## 4. Two color systems + four brand names (the migration schism)

- **Colors:** [tokens.css](renderer/tokens.css) defines a violet `--accent-*` system and says the app is
  violet. `CLAUDE.md` rule #5 says _"only `--accent*`; `--gold*`/`--royal*` are DELETED."_ Reality:
  **`--gold` is defined in [style.css](renderer/style.css) line 19 and referenced ~150 times** across the
  modules (29× in `dashboard.js` alone), and it renders **orange** (`#ffb780`). `--royal` is aliased to the
  _same_ orange. The project's own rule is violated everywhere and the "deleted" tokens are load-bearing.
  The token migration is stuck at "Phase 4" ([tokens.css](renderer/tokens.css), lines 203-216).
- **Branding:** the app calls itself **HOSTYLLO** (UI title + `hostyllo.com/support` link), **HOSTIX**
  (package/productName), **DAMAM Boys Hostel** (every main-process dialog, About box, default config), and
  **Zeerak Hostix** (package description). Four identities in one binary shipped to paying clients.
  > **RESOLVED 2026-08-30** (commit `04e73f2`). The canonical brand is **Hostyllo Offline** — note this
  > *reverses* the 2026-07-15 answer recorded in `REMEDIATION_KICKOFF.md`, which made HOSTIX canonical.
  > Zeerak Hostix is gone entirely; HOSTIX and DAMAM survive only as frozen identifiers (userData folder,
  > db filename, appId, repo name, crypto salts, auth storage keys) and as the sample hostel name.
  > See `CLAUDE.md` for the table of what may never be renamed and why.

Neither breaks functionality, but both signal that documentation and code have drifted apart — which is
exactly how the next regression sneaks in.

---

## 5. Security findings

1. **Electron 22 is EOL** — no Chromium security updates since ~2023. For software on 50+ machines, this is
   the #1 liability. Upgrade to a supported Electron major.
2. **License scheme is bypassable.** `_SECRET` is embedded in [main.js](main.js) (lines 95-97) and ships in
   `app.asar`; the checksum ([utils.js](renderer/src/utils.js), lines 469-481) is HMAC over the expiry field
   only, with a symmetric key everyone has. Anyone who extracts the secret can mint unlimited keys. Inherent
   to offline licensing, but the current build gives a _false_ sense of security. If revenue protection
   matters, sign licenses with an asymmetric key (Ed25519) so the private key never leaves your server.
3. **Stored-XSS surface into a privileged API.** The renderer builds HTML by concatenating user data, and
   `escHtml()` is applied _inconsistently_ (many `${s.name}` / `${p.roomNumber}` interpolations are
   unescaped). Because [preload.js](renderer/preload.js) exposes `dbDelete`, `dbUpsert`, `openExternal`,
   etc. to the renderer, a malicious student name (`<img onerror=...>`) could in principle drive the DB API
   or exfiltrate via `openExternal`. contextIsolation limits the blast radius, but the exposed DB surface
   makes escaping non-optional. Route _all_ dynamic values through `escHtml` (a component framework would
   do this for free).

**Credit where due:** `contextIsolation:true` + `nodeIntegration:false`, protocol whitelisting on
`open-external`, path allow-listing on `write-file`, HMAC tamper detection, and rate-limited activation are
all done correctly. The security _fundamentals_ are here; the _maintenance_ (Electron) and _encoding
discipline_ are the gaps.

---

## 6. Bugs, dead code & duplication

**Dead files (~24KB of stale code):**

- [renderer/src/auth.js](renderer/src/auth.js) (14KB) — **not loaded**; index.html loads `auth-nev.js`.
  It's a stale mirror that still defines `canDo`, `logout`, `selectWarden`, `updateRoleBadge`,
  `saveWardenConfig`. Dangerous because it looks live.
- [renderer/license.js](renderer/license.js) (10.6KB, root) — **not loaded**; index.html loads
  `src/license.js`. Dead.

**Live duplicate function definitions** (no build step = the last one silently wins):

- `safeOpenWindow` — defined in [utils.js](renderer/src/utils.js) line 76 **and** [app.js](renderer/app.js)
  line 27 with _different signatures/behavior_. app.js loads last, so utils.js's version is silently ignored.
- `fmtPhone` — defined in both [students.js](renderer/src/modules/students.js) and
  [app.js](renderer/app.js). If they ever diverge, phone formatting changes based on load order, not intent.
  Precisely the class of bug TypeScript/modules eliminate.

**Documentation contradicting code:** `CLAUDE.md` says "SQLite… 13 modular feature files" while
[README.md](README.md) still describes "localStorage… `renderer/src/app.js`." The README is a full major
version behind (documents v3/localStorage; you're on v4/SQLite). Anyone onboarding — human or AI — starts
from a false map.

---

## 7. Prioritized recommendations

You're not going to rewrite a shipping product, so here's the order to actually do it in:

**Do now (days, high value / low risk):**

1. **Upgrade Electron** to a supported major (test the better-sqlite3 rebuild). Biggest security win.
2. **Vendor the CDN libraries** (Chart.js, SheetJS, fonts) into the app. Makes "offline" actually true.
3. **Delete the two dead files** and de-duplicate `safeOpenWindow` / `fmtPhone`. Pure debt removal.
4. **Pick one brand name** and one accent color; update README to match the v4/SQLite reality.

**Do next (weeks, structural):**

5. Introduce **Vite + TypeScript** incrementally (TS allows `.js` alongside `.ts`; convert
   `utils.js` / `storage.js` first). Prevents the duplicate-function and encoding bugs from recurring.
6. Add a **Playwright smoke test** for the documented flow (login → add student → payment → receipt) so
   refactors stop causing regressions.
7. Decide SQLite's fate: either **add real columns + indexes + `where` queries**, or drop to flat JSON and
   remove the native dependency.

**Later (months, only if it pays off):**

8. Move HTML-string modules to components (Svelte is the lightest lift for a no-framework codebase).
9. Consider **Tauri** if install size / footprint becomes a selling point.

---

_Generated by Claude Code (Opus 4.8) as a static audit. Line references are accurate as of version 4.0.1._
