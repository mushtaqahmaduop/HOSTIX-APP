# Hostyllo Offline — enterprise audit

**2026-09-10 · v5.0.0 · branch `feature/dashboard-1c`**

Commissioned alongside `Hostyllo_Enterprise_Visual_Design_Direction.md`. This
covers release readiness, correctness, security and the visual quality bar that
document sets.

Everything below is measured, not asserted. Where a finding is a number, the
command that produced it is named so it can be re-run after the work.

---

## The short version

The engine is in good shape. Money, licensing, permissions and data safety are
covered by 700+ assertions that pass, the security posture is deliberate and
documented, and the app boots, packages and runs.

What is not in shape is **the product's presentation of itself** — and that is
measurable, not a matter of taste:

* **84% of all visible text on the average page sits inside a four-pixel band.**
  There is almost no typographic hierarchy left to read.
* **The shipped executable tells Windows it is "Electron", by GitHub, Inc.**
  Right-click → Properties on a paying customer's machine does not say Hostyllo.
* **The 32-bit installer ships a database binding that cannot load** unless one
  undocumented-by-default step is run first.
* **The sunk surface tier is invisible in light mode** — two points off white —
  so the layered surface model §14 asks for has one rung that does not render.

Ranked findings follow. P1 is "a customer sees this"; P2 is "it undermines the
premium claim"; P3 is worth doing.

---

## P1 — release readiness

### P1-1 · The application identifies itself as Electron

```
> (Get-Item 'dist\win-unpacked\Hostyllo Offline.exe').VersionInfo
ProductName : Electron
FileVersion : 43.4.0
Company     : GitHub, Inc.
Description : Electron
```

The executable carried no icon and no version block. Task Manager listed
"Electron"; File Properties named GitHub as the publisher; the taskbar showed
Electron's default icon.

**Cause.** `win.signAndEditExecutable: false` in package.json. That flag turns
off resource *editing* as well as signing — electron-builder says so in the
build log itself:

> executable resource editing and code signing skipped — signAndEditExecutable
> is false. To skip only code signing while keeping icon and metadata applied,
> use signExecutable: false instead.

**Fixed** in this commit: `signAndEditExecutable` → `signExecutable`. The icon
and the version block are applied again; code signing stays off, which is
P1-2's separate problem. Rebuilt and verified:

```
ProductName : Hostyllo Offline
FileVersion : 5.0.0
Company     : MUSHTAQ AHMAD
Description : Hostyllo Offline
```

### P1-2 · Nothing is code-signed

```
Hostyllo-Offline-Setup-5.0.0-x64.exe  →  NotSigned
Hostyllo Offline.exe                  →  NotSigned
```

Every customer installing this sees SmartScreen's blue "Windows protected your
PC" panel and has to click *More info → Run anyway*. For a paid product sold to
fifty-odd hostels that is the first impression, and it is the single loudest
thing on this list that says "not enterprise".

**Not fixable from here.** It needs a code-signing certificate — an OV
certificate is the usual answer, and an EV one clears SmartScreen reputation
immediately rather than after a few hundred installs. Owner's purchase, then
`CSC_LINK` / `CSC_KEY_PASSWORD` in the build environment.

### P1-3 · The 32-bit installer ships a database that cannot open

`better-sqlite3` 12+ publishes no 32-bit prebuild:

```
node_modules/better-sqlite3/prebuilds/
  win32-arm64.node   win32-x64.node        ← no win32-ia32
```

Worse, its `binding.gyp` asks whether a prebuild exists by reading the *host*
process's architecture, so on an x64 build machine
`electron-rebuild --arch ia32` reports "✔ Rebuild Complete" and emits nothing.
A packaged ia32 build therefore ships an app that cannot open its own database,
**with completely clean build logs**.

The trap is already known and `scripts/rebuild-ia32.js` exists to defeat it —
it hides `prebuilds/`, forces a real source compile, and reads the PE header to
assert the output is genuinely i386 rather than trusting node-gyp's exit code.

**What is missing is the wiring.** `npm run build` and `npm run build:installer`
both build `--x64 --ia32` and neither runs `rebuild:ia32` first. Nothing fails.
The x64 artefact is correct and the ia32 one is quietly broken.

**Recommendation.** Either make the ia32 targets depend on the rebuild, or drop
ia32 from the default build. 32-bit Windows is a rounding error in 2026, and
shipping a target that needs a manual step nobody remembers is worse than not
shipping it. This audit built **x64 only**, deliberately.

### P1-4 · `tests/fee-status.test.js` had not run since payments.js grew a filter registration

```
ReferenceError: registerFilter is not defined
    at modules/payments.js:3687
```

`registerFilter()` lives in nav.js; the harness loads config, utils, finance,
dashboard and payments, and payments.js calls it at module scope. Every one of
the 18 assertions in that file died at load — and it reads as a broken module
rather than a missing stub, which is why it survived.

**Fixed** in this commit: the registry is stubbed in the sandbox, next to the
`Chart` and `document` stubs that are there for the same reason.

### P1-5 · `npm run typecheck` was failing

Four `TS2304: Cannot find name 'roomText'` errors — globals added to utils.js
earlier today without a matching declaration in `renderer/globals.d.ts`.
**Fixed**; `roomText`, `roomLabel`, `floorShort`, `maskCnic` and `cnicHtml` are
declared. The suite is green.

---

## P2 — the visual quality bar

Measured with `tests/tmp-audit.spec.js`, which reads **computed styles from the
running app** — what a customer actually sees, not what the stylesheets say.

### P2-1 · The typographic hierarchy is flat, and this is the headline number

For each page: the share of all visible text sitting inside a single four-pixel
band, and the share set at weight 600 or heavier.

| Page | text in a 4px band | band | ≥600 weight | max ÷ min size |
|---|---|---|---|---|
| Dashboard | **85%** | 10–13px | **88%** | 4.1× |
| Payments | **85%** | 10–13px | 62% | 2.9× |
| Students | **87%** | 9.5–12.5px | 53% | 3.1× |
| Rooms | **89%** | 10.5–13.5px | 79% | **1.9×** |
| Expenses | 76% | 10–13px | 79% | 2.1× |
| Reports | 76% | 9.5–12.5px | 60% | 4.3× |
| Complaints | 79% | 11–14px | 74% | 2.6× |
| Cancellations | 77% | 11–14px | 68% | 2.7× |
| Settings | **91%** | 10.5–13.5px | 61% | 2.5× |
| Help & Support | **95%** | 11–14px | 61% | 2.0× |

Across the stylesheets, the same shape:

```
font-size   1143 uses, 31 distinct — top 7 values (10–13px) are 861 of them (75%)
                                     only 19 uses are ≥16px (1.7%)
font-weight  754 uses,  9 distinct — 657 are 600/700/800 (87%)
                                     400/500 together are 71 (9%)
```

This is §5 and §7 of the direction document, quantified. There is no display
register, no quiet register, and on the Rooms page the largest text on screen is
less than twice the size of the smallest. Nothing can be a focal point when
everything is the same size and everything is bold.

**This is the foundation to fix first.** Almost every other visual complaint in
the direction document is downstream of it.

### P2-2 · Twenty-six border radii

```
border-radius  677 uses, 26 distinct values
               9px(78) 8px(77) 12px(67) 10px(66) 11px(66) 50%(60) 999px(50)
               7px(37) 14px(35) 6px(23) 16px(20) 2px(18) 3px(18) 4px(13) …
```

Six values between 6px and 12px doing the same job. §38 asks for a coherent
family with distinct levels — surfaces, controls, pills, avatars, dialogs — not
twenty-six near-identical curves.

### P2-3 · Borders are carrying structure that spacing should carry

`414` `border: 1px solid` declarations. Rendered, 8–19% of elements on a page
carry a visible border. The count is not itself damning — what it produces is
the §12 "card → inner card → icon tile → pill → bordered control" stack, and
that is visible on the dashboard: five nested outlines between the page and a
number.

### P2-4 · 85 uppercase micro-labels

`text-transform: uppercase` × 85 in the stylesheets; 31 rendered on the
dashboard alone, 27 on Students, 26 on Payments. §6: uppercase is for very small
utility labels, not for every section heading and every card title. Rooms,
Settings and Support already use none, which shows the app does not need them.

### P2-5 · Dark mode's three text tiers are not on one temperature axis

Read live from both themes:

| token | light | dark |
|---|---|---|
| `--bg` | `#F5F6F9` | `#181715` |
| `--card` | `#FFFFFF` | `#1F1E1B` |
| `--bg3` | `#E7EBF2` | `#252320` |
| `--bg4` | `#DCE1EA` | `#2F2C28` |
| `--dash-sunk` | `#FAFBFD` | `rgba(255,255,255,.055)` |
| `--text` | `#17233A` cool | `#E7EAF0` cool |
| `--text2` | `#52627A` cool | `#A8B0BE` cool |
| `--text3` | `#677187` cool | `#A09D96` **warm** |

**A correction to my own first reading, recorded rather than quietly removed.**
I initially wrote this up as an inverted surface ladder, on the grounds that
`--bg3`/`--bg4` sit *above* `--card` in dark and *below* it in light. That is
wrong. Those two are progress tracks and hover grounds, not content surfaces —
and a track has to be visible against the card it sits on, which means darker
than the card on white and lighter than the card on black. The ladder is
consistent; I had mistaken utility fills for surface tiers.

What does stand: **the dark theme's three text tiers run cool, cool, warm**,
over a deliberately warm neutral ladder and under a cool blue accent. `--text3`
is warm for a documented reason — the cool value it replaced measured 4.18:1 on
`--card`, below AA for the 9.5–12px metadata it carries, and it was lifted until
it cleared 4.5:1. So this is a real coherence question with a real constraint
behind it, not a slip.

There is headroom to resolve it either way: the current `#A09D96` measures
**6.16:1** on `#1F1E1B`, and a cool grey of the same lightness — `#98A0AE` —
measures **6.33:1**. So the tier can be brought onto the same axis as its two
siblings without touching contrast at all. **Whether it should is the owner's
call**, because the alternative reading is equally defensible: warm text on a
warm ground, with the cool primary and the cool accent as the deliberate
contrast. Flagged, not unilaterally changed.

Separately: **`--dash-sunk` is an opaque hex in one theme and a translucent
white overlay in the other**, so the same token composites differently depending
on what is behind it.

### P2-6 · `--dash-sunk` is invisible in light mode

`#FAFBFD` against `#FFFFFF` is a two-point difference. Every register's odd-row
tint, every sunk well and every inner track is drawn with a colour that does not
survive a normal monitor at normal brightness. §14's layered surface model needs
the sunk tier to actually be a tier.

### P2-7 · The dashboard is the §1 recipe, eleven times

Counted on the rendered dashboard: 901 elements, 11 box-shadows, 12 distinct
radii, 31 uppercase labels, 88% of text at weight ≥600. Every module is
`bordered card → coloured icon tile → uppercase eyebrow → semibold title →
muted metadata`. §40 names this exact pattern as the thing that produces the
"admin template" appearance.

---

## P3 — worth doing

* **`build/Release/better_sqlite3.node` is referenced by `extraResources` and
  does not exist** on a clean x64 tree. The copy silently matches nothing.
  Harmless today because the x64 runtime loads from `prebuilds/`, but it is a
  configuration line that describes a file the build does not produce.
* **`@electron/rebuild` is a direct devDependency** and electron-builder already
  bundles it — its own log asks for the duplicate to be removed.
* **The `publish` block points at a GitHub repo** with `releaseType: release`. It
  does not fire without `-p`, but it means an absent-minded `--publish always`
  cuts a public release from a working tree.
* **`'unsafe-inline'` in `script-src`.** Deliberate, documented, and correct for
  now — the UI is built from inline handlers in generated HTML and the escaping
  sweep is what protects them. Worth revisiting only as part of a larger
  event-wiring change, never as a drive-by.

---

## What is in good shape, and should not be disturbed

Worth stating plainly, because the redesign that follows this audit must not
break any of it.

* **Money.** `finance.js` is the single authority — 70 assertions in
  `test:finance`, 21 in `test:outstanding`, 12 in `test:cashevents`, 14 in
  `test:reporttotals`, 18 in `test:feestatus`. Integer rupees, half away from
  zero, reversals in `p.reversals`, and no second answer to "what is owed".
* **Security.** `contextIsolation: true` and `nodeIntegration: false` on every
  window; a CSP without `unsafe-eval`; a permission allow-list that grants video
  but not audio because nothing records audio; a preload bridge of exactly six
  read-only methods, asserted as an exact set so widening it fails the build.
* **Licensing.** Expiry goes read-only rather than locking a hostel out; a
  machine that cannot reach the control plane falls back to its local licence
  and always can; the entitlement key map is addressed by `kid` so a rotation
  strands nobody.
* **Data safety.** Corrupt-database recovery, an EBUSY handle-leak fix on
  Windows, retention that archives rather than deletes, and a restore that says
  it replaces rather than merges.
* **Coverage.** 45 Playwright spec files and 13 node suites, and they are
  specific — they assert behaviour and say why in the failure message.

---

## Order of work for the redesign

The direction document is 61 sections. This is the order that makes each step
possible rather than the order the document is written in.

1. **Typography and numerals** (§3–§9). The band measurement above is the
   acceptance test: no page should have more than ~55% of its text inside a
   four-pixel band, and every page should have a display register.
2. **Surfaces, radii, borders, spacing** (§12–§16, §37–§39). Fix the dark ladder
   inversion, the warm/cool grey disagreement and the invisible sunk tier first
   — they are token changes and they lift every screen at once.
3. **KPI and numeric hierarchy** (§19–§22). The number becomes the anchor.
4. **Page personalities** (§41). Dashboard as command centre, payments dense and
   numerical, students a people workspace, the drawer a profile, reports
   editorial, forms focused, settings administrative.
5. **Exports** (§43–§46). PDF and Excel already carry their own document
   hierarchy after the September work; they need the typography pass, not a
   rebuild.

§56 is the constraint over all of it: **no calculation, status, formula or data
relationship changes to achieve a visual result.** The 700+ assertions above are
what proves that, and they run before and after every step.

---

## The build that came out of this

`npx electron-builder --win nsis portable --x64`

```
dist\Hostyllo-Offline-Setup-5.0.0-x64.exe        109.2 MB
dist\Hostyllo-Offline-Portable-5.0.0-x64.exe     108.9 MB
```

**Verified by running the packaged build, not by trusting the exit code.** A
package that was produced is not a package that works: the asar, the native
binding and the licence path are all different from the source tree, and each
has broken a release before. Launched against a fresh profile it:

* stayed up rather than exiting;
* wrote `hostix.db` with a 410 KB WAL — so the native `better-sqlite3` binding
  loaded out of the unpacked asar and the schema ran;
* computed a machine id (`machine.json`) and cached discovery
  (`control-plane.json`);
* reached the control plane and reported `online`;
* logged no error at any level.

```
{"service":"discovery","event":"discovery_changed","meta":{"to":"https://control-plane-production-924b.up.railway.app/v1"}}
{"service":"connectivity","event":"status_changed","meta":{"from":"unconfigured","to":"online","reason":"ok"}}
```

ia32 was **not** built — see P1-3. It would have produced a broken artefact.

---

## Re-running these numbers

```powershell
npm run typecheck
npm run test:finance ; npm run test:outstanding ; npm run test:feestatus
npx playwright test                     # 45 spec files, 6–8 at a time
npx playwright test tests/tmp-audit.spec.js   # the rendered typography table
```

Stylesheet counts: the regex tallies in this document's P2-1 to P2-4 are one
PowerShell pass over `renderer/*.css`; the command is in the session log and
worth keeping as a script if these become tracked metrics.
