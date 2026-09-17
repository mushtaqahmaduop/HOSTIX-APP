# Owner review — 2026-09-17 (second)

Punch list from the owner's walkthrough of the warm-palette build
(`975759d`), in the order given. Follows the same shape as
`docs/OWNER_REVIEW_2026-09-16.md`: this file is the record, and it grows —
add to the table rather than starting a third list.

Status: `todo` · `doing` · `done` · `answered` (a question, no code change)

| # | Screen | Item | Status |
|---|--------|------|--------|
| 1 | Chrome | The Windows titlebar drops over the header when the cursor goes to Add Student, and is slow to go back | done |
| 2 | Dashboard | The month selector is a left/right stepper; it should be a dropdown, and it does not show the month | todo |
| 3 | Dashboard | "Today at a Glance" — the closing line ("2 open jobs to clear today") is too large | done |
| 4 | Dashboard | The `Rs.` mark on the KPI figures is too small | done |
| 5 | Chrome | The sidebar nav should be a neutral colour | done |
| 6 | Former students | Long reasons push the Export button out of the heading row | todo |
| 7 | Dashboard | Needs Action — keep the row colours; only the numbers change, or lock the button | todo |
| 8 | Students | Remove the Undertaking dropdown; fit the filters and Export in its place | todo |
| 9 | App-wide | Long reasons should be truncated and shown in full on hover | todo |
| 10 | Cancellations | Picking a student in the Add form leaves the search field empty | todo |
| 11 | Payments | Extra charges and concession values should align with the row's values, reason beneath | todo |
| 12 | Expenses | The KPI glyphs should move to the top left of their cards | done |
| 13 | Complaints | The student picker in the Add/Edit form is broken | done — it was hidden, see #14 |
| 14 | Maintenance | "Raised by" should default to Student | done |
| 15 | Complaints | Move the "Assigned to" field up | todo |
| 16 | Settings | The rules and regulations must accept Urdu, typed and pasted | todo |

---

## #1 — the titlebar drops over the header (root cause)

Not a hover effect on the button, and nothing in the page moves: measured
under Playwright, `#header` is 56px tall at y=0 before, during and after the
hover, and the button never transforms.

What actually happens is the **auto-hide titlebar** (owner, 2026-09-14:
"remove the windows header bar and show close/minimize and reduce buttons when
cursor moves there"). `titlebar.js` shows it whenever the cursor reaches
`clientY <= 4`, and it slides down **over** the page — `--titlebar-offset` is
`0` in auto-hide mode, so nothing moves aside to make room for it.

Three things made it feel broken rather than deliberate:

1. **The bar covers the primary action.** The bar is 40px and the header is
   56px, so the Add Student button — 40px tall, vertically centred, y 8 to 48 —
   is entirely underneath it.
2. **A dead band pinned it open.** The hide branch only fired above
   `h + 8` = 48px, and a third branch cancelled the hide timer for everything
   between 4 and 48. The button sits inside that band, so hovering it held the
   bar down indefinitely.
3. **The grace was 300ms** on top of a 160ms slide.

Fixed by narrowing all three: the trigger is `<= 2`, the hide fires as soon as
the cursor is below the bar's own height rather than 8px under it, and the
grace is 120ms. Hovering the button still holds the bar down — the cursor is
genuinely on top of the bar at that point, and hiding it under the pointer
would be worse — but it now leaves the moment the cursor drops below 40px.

**The structural half, answered 2026-09-17: make the bar 30px.** The height is
how much of the header the bar swallows while it is down — at 40 it covered the
whole of a 40px button centred in a 56px header. At 30 the button's lower edge
clears it. The drag region, the menus and both window buttons size off the same
token, so they follow.

The short-screen override went with it. `@media (max-height:700px)` set 32px,
which was smaller than the old 40 and is LARGER than the new 30 — so on the
screens with the least height to spare it would have grown the bar.

---

## #13 — the complaint/maintenance student picker was not broken, it was hidden

Measured rather than read: the `<select>` behind it carries all seven students
and the search input exists. What it did not have was a size — `qBox` and
`pickBox` both measured 0x0.

The cause is #14. `Raised by` defaulted to **Staff**, so `#mt-by-stu-box` —
the div the picker lives in — opened with `display:none`. Defaulting to
Student gives it 423x38 and the picker works. One fix closed both items.

A spec had encoded the old default and failed on the change:
`issues-register.spec.js` waited on `#mt-raised`, the STAFF text box, and
`waitForSelector` waits for visibility. It now asserts the new guarantee — a
new ticket opens on Student — and keeps the old one, that choosing Staff
still pre-fills whoever is signed in.

---

## #5 — the active nav pill

Measured, because "neutral" could have meant four different things in that
rail: the pill was a flat `--gray-600` / `--gray-500` fill —
`rgb(115,115,115)` in light — carrying near-white text.

Two things were wrong with it. Grey is outside the warm family the rest of
the app moved into on 2026-09-17, and a filled pill with its own inverted
ink is the loudest object in the rail for something that only says "you are
here".

It is one tone step now — the rail's own hover surface with the ink it
already had, which is what this system uses for a selected row.
`--text-primary` measures 13.3:1 on the oat fill in light and 13.2:1 on the
warm step in dark.
