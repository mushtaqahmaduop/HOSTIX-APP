# Hostyllo Offline — Manual QA Checklist (release sign-off)

**Purpose:** the exact flow a human runs to confirm a build is safe to ship to client machines.
This is the source of truth the Phase 0 automated smoke test is built to reproduce. **Draft — pending
Mushtaq's confirmation** (see "Needs confirmation" at the bottom).

**Environment assumptions**
- App boots straight to the **login screen** (license already valid on this machine — not the activation screen).
- Data is stored in SQLite (`hostix.db`) in the app's userData folder; warden logins are in localStorage.

---

## A. Core smoke flow (the critical path — must pass every release)

> Do these in order; each step depends on the previous one.

1. **Launch** — app opens with no error dialog and no red errors in the console. Login screen visible.
2. **Login** — select **Warden 1**, enter the warden password, click Sign In → the login screen disappears
   and the **Dashboard** renders.
3. **Add a room** — go to **Rooms** → add a room (e.g. number `101`, a room type) → it appears in the room list.
4. **Add a student** — go to **Students** → **Add** → fill name + required fields, assign to room `101` →
   student appears in the list and shows the correct room.
5. **Record a payment** — go to **Payments** (or the student's page) → **Add Payment** → enter an amount for
   that student → payment is saved and shows in the payments list with the right amount.
6. **Generate a receipt** — open the receipt/print for that payment → the PDF/preview renders with the correct
   student name, amount, and hostel name (no "PKR PKR" double prefix, no missing fields).
7. **Dashboard reflects it** — return to **Dashboard** → revenue / collected figure for the current month
   includes the payment just recorded.
8. **Persistence** — fully close and reopen the app (or reload) → the room, student, and payment are all still
   there (proves the SQLite write committed).
9. **Export backup** — **Backup & Restore** (or Ctrl+S) → export a `.json` backup → file is written and a
   success toast shows.
10. **Logout** — click Logout → returns to the login screen.

**Pass criteria:** all 10 steps succeed with no console errors and no data loss across the restart in step 8.

---

## B. Extended manual checks (spot-check before a client release; not automated in Phase 0)

- [ ] **Theme toggle** — switch light/dark; layout stays intact, text stays readable.
- [ ] **Wrong password** — a bad password shows the error + decrements the attempt counter (and locks after 5).
- [ ] **Edit student** — edit an existing student; changes save and persist.
- [ ] **Delete flows** — deleting a record asks for confirmation and actually removes it.
- [ ] **Import backup** — import a previously exported `.json`; data loads and the app re-renders.
- [ ] **Reports** — open Reports; a monthly report generates and the PDF renders.
- [ ] **Search** — header search finds a student by name.
- [ ] **License Info** (Help menu) — shows "License Active" with the correct expiry.

---

## C. Known-fragile areas to watch (from the audit — regression-prone)

- **Currency formatting** — never a double "PKR PKR" prefix (audit / CLAUDE.md rule #4).
- **Offline behavior** — charts and Excel import currently depend on CDNs; they break with no internet.
  (Phase 1 task 5.2 fixes this; until then, test the smoke flow *online*.)
- **`saveDB()` diff logic** — the persistence check in step 8 is the guard against a broken save path.

---

## Confirmed (Mushtaq, 2026-07-15)

1. **Flow confirmed** — "test everything." Core path above plus the extended checks (Section B).
2. **Warden 1 real password on this machine = `112233`** (default `warden1` was changed). Note: the automated
   test runs in an *isolated fresh profile*, so it logs in with the auto-seeded default `warden1` and never
   touches the real profile or its `112233` password.
3. **Runs the installed app.** The dev run (`electron .`) uses profile `%APPDATA%\hostix-app`, which already
   holds a valid `license.enc` for this machine. The automated test copies only that `license.enc`
   (+ `last_run.dat`) into a throwaway profile with a **fresh empty database** — real students/payments are
   never read or written by the test.
