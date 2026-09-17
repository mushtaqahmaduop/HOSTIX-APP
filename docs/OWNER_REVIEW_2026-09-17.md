# Owner review — 2026-09-17 (second)

Punch list from the owner's walkthrough of the warm-palette build
(`975759d`), in the order given. Follows the same shape as
`docs/OWNER_REVIEW_2026-09-16.md`: this file is the record, and it grows —
add to the table rather than starting a third list.

Status: `todo` · `doing` · `done` · `answered` (a question, no code change)

| # | Screen | Item | Status |
|---|--------|------|--------|
| 1 | Chrome | The Windows titlebar drops over the header when the cursor goes to Add Student, and is slow to go back | done |
| 2 | Dashboard | The month selector is a left/right stepper; it should be a dropdown, and it does not show the month | done |
| 3 | Dashboard | "Today at a Glance" — the closing line ("2 open jobs to clear today") is too large | done |
| 4 | Dashboard | The `Rs.` mark on the KPI figures is too small | done |
| 5 | Chrome | The sidebar nav should be a neutral colour | done |
| 6 | Former students | Long reasons push the Export button out of the heading row | done |
| 7 | Dashboard | Needs Action — keep the row colours; only the numbers change, or lock the button | todo |
| 8 | Students | Remove the Undertaking dropdown; fit the filters and Export in its place | todo |
| 9 | App-wide | Long reasons should be truncated and shown in full on hover | done |
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

---

## #2 — the month selector

Both halves of this had one cause each, and looking for them turned up three
more faults in the same control that nothing had ever shown.

**"It does not show the selected month."** The collapsed label was written
unconditionally from `new Date()`:

    todayLbl.textContent = now.toLocaleString(...{weekday,day,month})

Not from `dashMonth()`. So stepping back to August moved every figure on the
dashboard and the picker still read "Thu, 18 Sep" — the one part of the control
visible without opening it was the one part that could not change. It is
`dashMonthLabel()` now and cannot disagree with the screen. `navigate()` also
repaints it, because leaving the dashboard resets the month and nothing else
was telling the picker.

**"Not like a dropdown."** Two arrows, one month per click — up to six to reach
a month inside the year, eleven to cross one. One button now, carrying the
selected month, opening a 12-month grid in four columns: any month in the
browsed year is one click. The year stays the `<select>` it already was.

### Three things found on the way

1. **Browsing was picking.** `sbCalSetYear()` wrote `_dashboardMonth`, so
   opening 2025 in the year dropdown *to look* silently moved the dashboard to
   September 2025. The browse position and the selected month are separate
   now; only clicking a month moves the dashboard.

2. **The picker was a child of `.sb-logo`.** That block carries
   `padding: 18px 16px 16px 44px` so the product mark clears the collapse
   button, and the picker inherited the 44px: 151px of a 212px rail, a 135px
   button, 85px for the label — and "September 2026" needs 103. The control
   looked like it needed a shorter label; it needed to not be inside the logo.
   Out of it, the button is 195px and the label has 42px to spare. It was also
   putting a second hairline under `.sb-logo`'s own, indented 44px, so the rail
   had a short floating line in it.

3. **The popover could never be seen whole.** `#sidebar` is `overflow: hidden`,
   so a 280px panel anchored inside a 212px rail is clipped to the rail. At
   `right: 0`, which is how it shipped, its left edge sat at −69px: the first
   column of months, the year dropdown and the reset button were off the left
   of the window. It is `position: fixed` now, placed off the button's own rect
   by `_sbCalChrome()` and held inside the viewport — fixed escapes ancestor
   overflow, and nothing in the chain sets transform, filter, will-change or
   contain, which is what would make it clip anyway (checked, not assumed).

Also: today's day cell filled with `--accent` and inked with `#000` — black on
#2451D6, 2.1:1. It is `--on-accent`. And the day cells were 380 characters of
inline style each, rebuilt every render with two inline mouse handlers faking
`:hover`; they are four CSS classes.

Measured at 1366x768, both themes: button 195x30, label fits, popover 280x402
at x=8. Selected month #FAF9F5 on #2451D6 is 6.2:1 light, #181715 on #7BA0FF
is 7.1:1 dark. Picking August moves the dashboard to August and the label with
it; browsing 2027 leaves both alone; "This month" returns both. No page errors.

---

## #6 and #9 — one cause, two symptoms

A reason is free text typed into a cancellation, with no length limit, and
nothing downstream assumed one.

**#6.** A `<select>` is as wide as its widest OPTION. One reason of
"Shifted to a hostel closer to the university campus after the semester ended"
stretched the reason filter until `.fm-tools__end` wrapped and Export left the
toolbar row. The filter is capped at 180px with the overflow ellipsised - the
full text is still there in the open list.

That alone fixed 1366. 1093 - a 1366 screen at 125% - needed a second step:
the panel is 794px inside its padding and the bar wanted 858, because the
search box had grown back to its cap on a row that had spare width. Two tiers
now, the same shape payments.css already uses: 1440 takes width off the search
box and the selects, 1200 takes a little more. Measured 782px at 1093, so the
four filters and both actions hold one line at every tier down to the floor.
No filter and no action leaves the bar.

**#9.** The reason cell was `white-space: normal`, so a long one wrapped to
three lines and set the height of every other cell in its row. One line now,
ellipsised, with the full reason as the title - which is the hover. The cap is
on the span rather than the cell, so the column still takes the table's slack;
it just stops claiming more than it can use.

Measured at 1366 and 1093, six records, three reasons over 70 characters:
toolbar 56px (one row) at both, Export inside the bar at both, every reason
cell one 20px line, long ones reporting truncated with the title set.

**The sweep, done.** #9 asked for this app-wide, so the other two reason
columns were checked rather than assumed:

- **Cancellations** had the same fault - `.canc-reason` was
  `white-space: normal` inside a 190px cap, so a long reason wrapped and set
  its row's height. Same treatment: one ellipsised line, full text as the
  title. Measured with five records, three reasons over 65 characters: every
  cell one 20px line, rows a uniform 65px, long ones truncated and titled.
- **Complaints and maintenance** already had it. `.iss-d` clamps to two lines
  with `-webkit-line-clamp` and the description already carried its own
  `title`. Left alone.
