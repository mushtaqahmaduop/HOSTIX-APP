# Feature roadmap — decided with the owner, 2026-09-30

Sources reviewed:
- **sastybed.com** (live site, 2026-09-30; full audit on file from 2026-09-21);
- **Hostel_Management_Software_Presentation.pdf** (a competing offline product by "Mdahmeddev", 13 modules);
- **design-system-blueprint.pdf** (@designmotionhq — a general design-system checklist).

Rule applied (memory, 2026-09-21): a competitor is input, not a template. Take
the need, then build the enterprise answer, linked to what HOSTIX already has.

## Decided — in this order

1. **Design-system audit** — before new features. Check against the
   blueprint's checklist:
   - the spacing scale (4px base) and type scale;
   - every component state (default / hover / active / disabled / focus);
   - empty and loading screens;
   - tokens only, no raw hex.

   The report comes first; fixes follow on approval.
2. **Repair cost → Expenses.** At present a complaint can carry a repair cost
   that never reaches Expenses, so wardens enter it twice. Closing a complaint
   with a cost will book the expense once. That row will be owned by the
   complaint and locked on the Expenses page, the same pattern as payroll's
   `source: {kind, id}`.

## Not now — kept for later

| Feature | Where it came from | Our version |
|---|---|---|
| Visitor register (Mehmani) | competitor PDF | Linked to the student; CNIC; "inside now" board; exit time; blocked visitors; history on the student panel |
| Staff attendance | SastyBed | Daily Present / Absent / Leave / Half-day. Feeds a *suggested* absence deduction to payroll (plan §9.3) |
| Recurring expenses | SastyBed | Monthly templates with a one-click "record" list. Never auto-booked |
| Inventory & assets | both | Per room and store, condition, value; linked to inspections |
| Rent reminder queue | SastyBed (automatic) | Due-soon / today / overdue list with one-click WhatsApp. Offline cannot auto-send |
| NTN on receipts | SastyBed | Settings field, printed on receipts, payslips and reports |
| Weekly mess menu | SastyBed | Edit, print, share |
| Per-student due day from the admission date | competitor PDF | Option on the student; overdue days counted from it |

Online booking, student and owner mobile apps, multi-branch and automatic
WhatsApp belong to **Hostyllo Cloud**.
