# Session handoff — 2026-09-06 — the Students details panel

Branch `feature/dashboard-1c`, **8 ahead of `origin/master` (aaeaba1), 1 behind.**
Merge `origin/master` in before proposing this back — see the stale-ref note in §7.

This session built the Student Details slide-over, gave it every action the old
profile modal had, ported the full payment ledger into it, and fixed the reason
opening a form from it threw the record away. Three commits, all with the
owner's in-flight Add Student work kept out of them.

---

## 1. What shipped

| commit | what |
|---|---|
| `b87303d` | The slide-over itself — 440px, four tabs, replacing `showViewStudentModal` on the students page. Plus the Blacklisted status cell clipping fix and the light-theme focus ring. |
| `8d4c386` | The old profile's whole verb set on the panel, and two layout faults that shipped with it. |
| `0754cb0` | The full nine-column payment ledger, look.png's Overview cards, and forms that open **over** the panel instead of replacing it. |

### The panel, in one paragraph

`showStudentPanel(id, tab)` in `renderer/src/modules/students.js` renders a
440px right-hand panel into `#stu-panel-host`. Four tabs — Overview, Financial,
Documents, Room History — and six actions in a 3×2 grid: Edit, Move Room, Print,
Payment, Cancel Seat (Active only), Delete. `refreshStudentPanel()` re-renders
it in place and is called by `closeModal()`, so anything saved in a form over
the panel appears the moment the form goes.

---

## 2. The three bugs that were worth the session

### 2.1 A form opened from the panel was unreachable — one number

`.modal-overlay` is **z-index 350** (`style.css:1454`). The panel started at
**1401**. So a form opened from the panel rendered *underneath* it. That is why
every action closed the panel first, and why closing the form left the owner
back at the table with the record gone — the symptom they reported.

The panel is **330 (scrim) / 331 (sheet)** now: above the page and the rail
(100), below every modal. **Do not raise it back.** The comment in
`students.css` says the number and why.

### 2.2 One Escape closed both layers

`renderer/app.js:180` binds Escape to "close any open modal", **bubble phase, at
load time** — so it runs before anything registered later. The panel's own
Escape handler fired second, found the container app.js had just emptied,
concluded no form was open, and closed the panel too.

`_stuPanelEsc` is registered with **`capture: true`** now, so it runs first, sees
the form that is actually on screen and yields. If you ever add another
Escape-sensitive overlay, this is the ordering trap it will hit.

### 2.3 The panel's header was under the Windows title bar

`#hz-titlebar` sits at z-index **100000**, deliberately above modals. A centred
modal never reaches it; a panel pinned to `top:0` puts its own title and close
button underneath. Fixed in `titlebar.css`, in the same list that already offsets
`#sidebar`, `#main` and `#login-screen`:

```css
body.has-titlebar .stu-pan,
body.has-titlebar .stu-pan__scrim { top: var(--titlebar-h); }
```

**And a fourth, smaller one:** `.stu-pan` is a column flex container and every
band above the body was at the default `flex-shrink:1`, so when the content ran
taller than the panel the shortest band gave up the most — the tab strip
collapsed 35px → 20 and its own bottom border drew through the middle of the
word "Overview". It looks like a rendering fault, not a layout one. Every band
above the body is `flex: 0 0 auto`; only the body flexes, and it scrolls.

---

## 3. What the panel is allowed to say

Two tabs describe data this app does not hold, and both say so rather than
inventing it. **A plausible empty row looks like a working feature** — that is
the failure mode these guard against, and `tests/students-panel.spec.js` pins
both.

- **Documents** — `docs` holds exactly one key, `photo`. There is no CNIC scan
  and no admission form anywhere in the data model. All three rows read "Not
  uploaded" with the controls disabled and a note saying storage is not enabled
  yet. The reference (`look.png`) shows both as a green "Uploaded" with a working
  View and Download; that is the mock's data, and copying the chrome without the
  storage behind it is exactly what §28 forbids.
- **Room History** — `DB.roomShifts` is real, written by `showRoomShiftModal()`,
  which is what the Move Room button opens. A student who has never moved gets
  one row (where they are now) and a line saying there are no changes — never a
  fabricated first assignment (§29).
- **There is no Block.** The reference's room card opens with "Block A - Room 1,
  Bed 1". This app's rooms carry a number, a floor and a type. A Block row would
  print an em dash on every record for ever, so the panel shows Bed instead.

---

## 4. The financial ledger

`_stuPanelFinancial()` carries the **same markup and the same `.svw-*` classes**
as `showViewStudentModal`'s ledger — nine columns (Month, Monthly Rent,
Concession, Paid (+Extras), Unpaid, Method, Status, Date, Actions), the record
count and totals bar, the "Showing n of n" footer, and four row actions.

One ledger, styled once, so the two views cannot drift into disagreeing about
the same student. Do not "simplify" it back to a digest: the columns a digest
drops — concession, and the extras broken out under the paid figure — are the
ones that answer *why this figure is not the rent*, and the row actions are the
only place a warden can settle a pending record or reprint a receipt without
going to Payments and finding the row again.

**One correction was made crossing over:** the Unpaid column read `p.unpaid || 0`,
a stored field, where the rest of the app asks `calculateOutstanding(p)`. Those
disagree the moment a payment is edited or reversed without the field being
rewritten. This is the §14 recurring bug in its usual disguise — a *read* path
this time rather than a write — and it is worth grepping for again.

Nine columns do not fit 440px, so `.svw-tw` scrolls inside its card. The spec
asserts the panel body itself is **not** pushed sideways.

---

## 5. Where the refresh goes

`refreshStudentView(id)` returns `true` when the panel is the thing on screen
and has been re-rendered, `false` otherwise. Three payment paths use it and fall
back to the old modal:

- `markPaymentPaidFromStudentView` (payments.js)
- `deletePaymentFromStudentView` (payments.js)
- the `_returnStudentId` hop after an edit (payments.js:~2866) and the receipt's
  "← Back to Student" button (receipt.js)

`showViewStudentModal` is **still the student view for the dashboard, reports,
rooms, the command palette and WhatsApp**, which all call it directly and were
deliberately left alone. If the panel is ever made the app-wide student view,
those are the call sites, and several specs assert on `.svw-*` inside a modal.

---

## 6. Tests

`tests/students-panel.spec.js` — **10 specs, all green.** The ones that matter
most assert absences: every document control disabled; exactly one history row
when there are no shifts; the panel body not scrolling horizontally.

Regression batch run green this session (28 specs): `students-fee-status`,
`students-profile-archive`, `students-export`, `theme-parity`,
`responsive-floor`, `payment-redesign`, `partial-and-arrears`, `chrome`,
`titlebar-keyboard`, `rail-reach`.

### Two traps when running them

1. **`HOSTIX_TEST_PROFILE` must hold a `license.enc`**, or every spec times out
   at `#login-input` looking like a boot regression. Copy it from `.devdata`.
2. **The Playwright worker OOMs on this machine** — it reports as
   `worker process exited unexpectedly (code=134)` with a V8 "Zone Allocation
   failed" dump, which reads like a code fault and is not one. There was ~600MB
   free of 6GB with the owner's `npm start` running. This fixes it:

   ```
   export NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=2"
   ```

   Still run 6–8 spec files at a time, per the existing note.

---

## 7. State of the working tree — read before committing anything

Three files are **modified and deliberately uncommitted**. They carry the
owner's in-flight work:

| file | what is in it |
|---|---|
| `renderer/chrome.css` | Owner's Phase 4 chrome cleanup (`--sb-bg` removed, the navy gradient removed) **entangled with** my light-theme grey rail, which overwrote tokens their change had just set. **Not separable.** |
| `renderer/src/modules/students.js` | Owner's `renderAddStudent()` redesign — section renumbering, "Guardian" rename, footer spacer. |
| `renderer/students.css` | Owner's `.asf-*` redesign — the rail ratio, the 4:3 photo well, the record density, the sticky action bar and its responsive ladder. |

**Use the split script.** It holds the working bytes, writes a HEAD-plus-my-hunks
version, and restores byte-exactly afterwards with an assertion:

```
python <scratch>/split_panel.py stage     # then git add / git commit
python <scratch>/split_panel.py restore   # always, immediately after
```

It aborts and restores rather than staging if any owner marker leaks into the
diff. It has been used for `68daa87`, `691ea17`, `44b46f3`, `b87303d`, `8d4c386`
and `0754cb0`. Two gotchas already fixed in it: `git diff` output must be decoded
as UTF-8 (cp1252 dies on the first `§`), and "Guardian name" is not a unique
marker because the panel renders that label too — the marker is
`for="f-temerg">Guardian`.

---

## 8. Still outstanding — the owner's earlier batch

None of these were touched this session:

1. **FOUT** — a second typeface loads for a fraction of a second on hard reload.
2. **Sidebar blur** — page names in the rail blur briefly in light mode on
   heavy pages when selected.
3. **Search bars show inconsistent colours** across the app.
4. **Search hidden by the hover overlay** when selected with the cursor
   (`ser.png`).
5. **Ctrl+K palette is pure white** — should take the sidebar colour.
6. **Default student avatar** — the owner supplied `student profile.png` for
   students, payments, reports and PDFs. **Read `studentAvatar()`'s comment in
   `renderer/src/utils.js` before acting on this**: that exact PNG has the words
   "Student Photo" printed inside it, is 81×92 raster against a 26–96px range of
   uses, and cannot take the theme. It currently draws initials, which is what
   the reference designs show. This needs a decision or a vector redraw, not a
   swap.
7. **Search bar hover redesign** per `search bar.png` — a Quick Navigation
   palette with coloured icon tiles.

---

## 9. Things that will bite

- **The panel's z-index is load-bearing.** 331, under `.modal-overlay`'s 350.
  Raising it makes every form opened from the panel unreachable again.
- **Escape ordering.** `app.js:180` is bubble-phase and registered at load; any
  overlay that wants Escape before it must use the capture phase.
- **`table-layout: fixed` on the students table** means a `<colgroup>` whose
  widths must sum to exactly 100%. They currently do. A mismatch does not warn —
  it silently shrinks a column, which is how the row actions once ended up 10px
  wide with the kebab clipped away.
- **`saveDB()` archives settled payments older than six months.** A spec seeded
  with last year's dates will find an empty ledger and look like a bug in the
  ledger. Seed within six months of today.
- **`theme-parity.spec.js` enforces a 4.5:1 contrast floor** and has caught two
  regressions in this branch already. Run it after any colour change.
