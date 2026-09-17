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
| 5 | Chrome | The sidebar nav should be a neutral colour | todo |
| 6 | Former students | Long reasons push the Export button out of the heading row | todo |
| 7 | Dashboard | Needs Action — keep the row colours; only the numbers change, or lock the button | todo |
| 8 | Students | Remove the Undertaking dropdown; fit the filters and Export in its place | todo |
| 9 | App-wide | Long reasons should be truncated and shown in full on hover | todo |
| 10 | Cancellations | Picking a student in the Add form leaves the search field empty | todo |
| 11 | Payments | Extra charges and concession values should align with the row's values, reason beneath | todo |
| 12 | Expenses | The KPI glyphs should move to the top left of their cards | done |
| 13 | Complaints | The student picker in the Add/Edit form is broken | todo |
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

**Still worth a decision, and not taken here:** the bar covering the header's
one primary action is structural, not a timing problem. The options are to
pin the bar (back to a fixed 40px offset, which is what auto-hide was asked to
remove), to move the primary action off the top-right, or to leave it. Item 1
is closed on the timing; this sentence is the part that is not.

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
