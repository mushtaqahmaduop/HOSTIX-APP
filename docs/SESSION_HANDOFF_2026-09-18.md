# Session handoff — 2026-09-18

Branch **`design/dashboard`**, tree clean. Nothing pushed — `master` is still
~100 commits ahead of `origin/master`, and this branch is ahead of `master`.

## What landed today, in order

| Commit | What |
|---|---|
| `fa9f5ac` | Review #1, #5 — 30px titlebar; neutral active nav pill |
| `1cbf4ca` | Review #2 — sidebar month picker is a dropdown and shows the SELECTED month |
| `13dc89c` | Review #6, #9 — former-students reason filter capped, reason cell truncated |
| `4e78191` | Review #9 sweep — cancellations reason column |
| `2d770c9` | **Finance Phase 1** — one collection path (see below) |
| `0a02fe9` | **Phase 2** — review #7, #8, #11, #15, #16 |
| `82031ee` | **Phase 3** — Available Fund is cash; Earned stated beside it |
| `0d02260` | Reports payment-method donut counts every rupee, by trail method |
| `7503623` | **Phase 4 / G7** — month-domain layer moved to `src/periods.js` |
| `00e0031` | **Phase 4 / G9** — Active speaks for today only (`tests/periods.test.js`) |

## Finance — read `docs/FINANCE_AUDIT_2026-09-18.md` first

The owner's `HOSTYLLO_FINANCE_SYSTEM_PLAN.md` (in Downloads, not the repo) was
audited against the code. ~70% of it already existed. The one defect it named,
§19, was real: both Add Payment merge paths wrote the amount box straight over
`p.amount` as a running total, so entering the money actually received erased
the earlier collection.

**Phase 1 is closed.** Every collection now goes through `applyPayment()`; the
box is "Money received now" and starts empty; a first collection leaves a trail
entry; records holding money keep their date/method/collector. The engine
itself was restamping `p.method` on every collection — fixed in `finance.js`.
Regression cover: `tests/payment-collection-path.spec.js` (5 tests).

**The principle, agreed with the owner's other agent:** `payments.js` is a
client of `finance.js`, not a second engine. Nothing else writes `p.amount`.

## Phases still to run — do NOT mix them

The owner was explicit: one phase at a time, stop and report after each.

1. ~~Collection-path integrity~~ — done.
2. ~~UI punch list~~ — done except **#10** (below).
3. ~~Available Fund~~ — done (`82031ee`), twelve sites.
4. ~~Month-domain layer~~ — done. The money/month functions now live in
   `src/periods.js`, not the dashboard screen; G9 fixed. Details in the audit doc.
5. **Next:** Historical room/status — **none is stored anywhere**. Needs a real
   assignment model; do not infer. Also owns the open case found in Phase 4: a
   Left student with a join date but no `leftDate` is on every later roster.
6. Bill immutability — owner chose: `p.generated` snapshot, frozen once money
   is held, later changes in `p.adjustments[]`.
7. `saveDB()` atomicity — row-by-row IPC upsert. Its own phase.

Receipt identity: owner chose to stamp `receiptId` + `allocatedTo` on trail
entries, **no new table**. Lands with 4 or 6.

## Owner review 2026-09-17 — status

15 of 16 done. **#10 is open:** both routes into the cancellation form
(preselected, and picked from the dropdown) measured correct. Nothing changed.
Ask the owner for the exact steps before touching it.

## Traps hit today

- **Mixed line endings.** `renderer/dashboard.css` is 22 CRLF / ~1990 LF. A
  patch script that picks `\r\n` because it saw one fails to match. Check with
  a byte count first; `core.autocrlf=true`, so the diff stays clean either way.
- **`style.css` loads after `css/base.css`.** A base rule loses to `.form-control`
  at equal specificity — hence `.is-bidi.is-bidi`.
- **The sidebar is `overflow: hidden`.** A popover inside it is clipped to 212px;
  the month picker is `position: fixed`, placed from JS.
- **The dev profile boots LIGHT.** Remove `light-theme` explicitly for a dark
  screenshot, or the "dark" shot is light.
- **Specs encode old behaviour.** Four were updated today, each to assert the
  new guarantee while keeping every other assertion: `partial-and-arrears`,
  `dashboard-cards`, `undertaking`, and (earlier) `issues-register`.

## Scratch files (untracked, never commit)

`tests/tmp-*.spec.js` — `tmp-mo`, `tmp-fm`, `tmp-canc`, `tmp-p2probe`,
`tmp-p2verify` and older ones. `.shots/` is not gitignored either — never
`git add -A`.

## Running tests

Playwright: 6–8 files per run,
`NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=2"`,
`HOSTIX_TEST_PROFILE` holding a `license.enc`.
Node: `node --test tests/finance.test.js tests/ledger.test.js …`.

`tests/handovers.test.js` is flaky — 2 of 14 fail about one run in five,
before and after Phase 4 (it never loads `periods.js`). Not investigated.
