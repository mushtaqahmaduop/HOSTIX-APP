# Staff & Payroll — enterprise plan (2026-09-30)

Owner's request: an **Employees & Payroll** page in the sidebar — staff details,
adding and managing staff, and salary advances given by an admin or warden that
show **directly in Expenses**. A competitor screenshot (`25.png`: a staff table
with a "Pending advance" column) was given as **the idea only — not to copy**.

This is the plan for approval. **Nothing is built yet.** Once the decisions in
§9 are answered, the screens are mocked for sign-off (as the room inspections
were), then built in the steps of §8.

---

## 1. Principles

1. **One money truth.** A salary or an advance that is paid out becomes an
   ordinary record in `DB.expenses`, so the Expenses page, the dashboard,
   Reports, the Owner Summary and Available Fund all include it with no second
   calculation. Payroll never keeps a separate "total paid" that could disagree
   with the expense list.
2. **Payroll owns its expense records.** An expense created by payroll carries
   `source: { kind: 'salary' | 'advance', id }`. On the Expenses page it shows a
   **Payroll** badge and is read-only there. It is changed or reversed from
   Payroll only, so the two screens can never drift apart.
3. **Nothing is ever silently deleted.** A payslip or advance is **voided** with a
   reason, and its expense is reversed at the same moment. Both stay on file and
   in the activity log.
4. **Integer rupees**, rounded the finance.js way (half away from zero). Every
   reference is **never reused** (EMP-0001, ADV-0001, PS-2026-09-0001) through
   `refSeqTake()` and the restore high-water list.
5. **An enterprise answer, not a copy.** The reference shows a list of people
   with one advance figure. The enterprise version adds salary structure, a
   monthly payroll run, recovery schedules, payslips, history and audit.

## 2. How the money works (the core rule)

| Event | What is recorded | Expense entry |
|---|---|---|
| Advance given (e.g. Rs 5,000 on 10 Sep) | Advance ADV-0007, balance 5,000 | **Rs 5,000 on 10 Sep**, category *Salaries & Wages*, "Advance — [name]" |
| Salary paid for September (gross Rs 30,000) | Payslip: gross 30,000 − advance recovered 5,000 = **net 25,000** | **Rs 25,000 on the pay date** |
| Total cost of this employee for September | | **30,000 = 5,000 + 25,000**, exactly the gross |

- The advance is an expense **the day the cash leaves**, as you asked. The
  salary expense is the **net** actually paid, so nothing is counted twice.
- **Recovery:** by default the whole balance comes off the next salary. The
  person giving the advance can instead choose **N equal instalments**. Recovery
  can never take pay below zero; anything not recovered carries to the next month.
- **Leaving:** a final settlement pays the days worked, minus any balance still
  owed, and shows the result before it is confirmed.

## 3. Data model

New collections, each with its own SQLite table, included in `BACKUP_TABLES`,
restore, and the migration test:

- **`employees`** — `id, ref (EMP-0001), name, fatherName, cnic, phone,
  altPhone, emergencyContact, address, photo, role, department, employmentType
  (full-time / part-time / contract), shift, joinDate, leftDate, status (Active /
  On leave / Left), accountId (optional link to an app login), pay: { basic,
  allowances[{label, amount}], payDay, method, accountTitle, accountNo },
  documents[], notes, addedBy/addedByName, createdAt`, plus a salary-change
  history `payHistory[{from, basic, allowances, reason, by}]`.
- **`salaryAdvances`** — `id, ref, employeeId, amount, date, method, reason,
  recovery: { mode: 'next' | 'instalments', instalments }, recovered[{payslipId,
  amount}], balance, expenseId, status (Open / Recovered / Void), voidReason,
  givenBy/givenByName`.
- **`payslips`** — `id, ref, employeeId, month, gross (basic + allowances),
  deductions[{label, amount}] (advance recovery, absence, other), net, paidDate,
  method, expenseId, status (Draft / Paid / Void), paidBy, voidReason`.

Settings gain **Roles** and **Departments** lists (edited like the other lists),
seeded with Warden, Assistant Warden, Cook, Kitchen Helper, Security Guard,
Cleaner, Electrician/Plumber, Accountant. No real names in seeds.

## 4. Screens

**A. Staff & Payroll page** (sidebar, under OPERATIONS), with three tabs:

1. **Staff** — the directory.
   - KPI strip: Active staff · Monthly payroll (gross) · Paid this month
     (x of y) · Advances outstanding.
   - Table: person (photo/initial, name, EMP ref, joined), role chip, department,
     contact (CNIC masked like students), monthly salary, advance balance, status,
     row menu.
   - Filters: status, role, department, search. Export PDF/Excel through the
     export engine.
   - Clicking a row opens the **employee slide-over**: profile, salary structure
     and its history, payslips, advances with balance, documents, and activity.
2. **Payroll** — one month at a time, a grid of every active employee: gross,
   advance recovery, other deductions, **net**, status.
   - **Pay** per row or **Pay selected**, with the total shown before
     confirming. PIN-confirmed above a threshold, using the existing PIN.
   - Each payment creates its payslip and its expense together.
   - Print or save each payslip as PDF, or all of them for the month.
3. **Advances** — every advance, open first, with balance and recovery plan.
   - **Give advance** button.
   - Void (with reason), which reverses its expense.

**B. Add / Edit employee** (the large form style Add Student uses), in
sections: Personal (with photo), Job, Pay (basic plus a list of allowances, pay
day, method and account), Documents. Changing salary asks for a reason and an
effective month, and is kept in the salary history.

**C. Give advance** (modal): employee, amount, date, method, reason, recovery
(next salary or N instalments). It shows the consequence before saving: *"Rs
5,000 is added to today's expenses. Next salary: Rs 30,000 − 5,000 = Rs 25,000."*
It blocks an advance larger than the salary unless an admin overrides it.

**D. Payslip** — A4 PDF and 80mm receipt, carrying the hostel's logo, the PS-
reference, earnings, deductions, net, method, and paid-by.

## 5. Everything it touches

- **Expenses:** payroll rows get a Payroll badge and are locked. A new category,
  **Salaries & Wages**, is added for new installs and existing ones, and is
  protected from deletion while in use.
- **Reports / Owner Summary / Dashboard:** included automatically through the
  expenses. Reports gain a *Payroll* view: the month's payroll by role, and
  advances outstanding.
- **Permissions:** a new **Payroll** permission (view and manage staff, pay,
  give advances). It is **not auto-granted**, the same as Owner Funds. Salary
  figures are hidden from accounts without it.
- **Feature switch:** control-plane flag `payroll`, on for every hostel and
  switchable off per hostel (§9.4). The control plane needs a redeploy for the
  portal to show it; the app treats an unknown flag as on.
- **Warden ledger:** untouched. Payroll payments are admin payments (§9.1).
- **Backups, restore, activity log, retention:** included. Payslips and
  advances are never archived.

## 6. Premium look and feel

Built in the app's current design system: warm tokens, both themes, fitting the
client's 1120 width. The patterns are ones owners already know from Students:
KPI strip, the list toolkit, slide-over, section forms. Status chips use role
colours only. Numbers use the tabular font and whole rupees on KPIs. Row menus
and empty states are designed, not bare. Screens are mocked for approval before
any code.

## 7. Out of scope for the first version (can follow)

Attendance and leave tracking, overtime, EOBI / social-security deductions and
tax, bank transfer files, payroll for more than one hostel.

## 8. Build order (one step at a time, each tested before the next)

1. Data model, rules (net pay, recovery, final settlement) and unit tests.
2. Staff directory, employee form and slide-over.
3. Advances, with their expense link and void.
4. Payroll run and payslips (PDF / 80mm).
5. Expenses lock and badge, the Reports payroll view, exports.
6. End-to-end tests, both themes, the 1120 fit, full regression run.

## 9. Decisions (owner, 2026-09-30)

1. **Warden cash — ADMIN PAYS ONLY.** Payroll money never touches the warden
   ledger or any handover. Paying salaries is an admin action. A warden account
   holding the Payroll permission may *record* an advance, but it is not taken
   out of the cash that warden hands over.
2. **Recovery default — ALL FROM THE NEXT SALARY.** The person giving the
   advance can switch it to N instalments.
3. **Absence deductions — later**, together with attendance (§7). The payslip's
   free "other deductions" line covers a one-off until then.
4. **Availability — EVERY HOSTEL.** A standard control-plane flag `payroll`,
   `default: true`, which can be switched off per hostel from the portal.
5. **Logins — OPTIONAL LINK.** An employee may be linked to one app account
   (`accountId`). Name, photo and role are then read from one place. Staff with
   no login are unaffected, and deleting an account keeps the employee record.
