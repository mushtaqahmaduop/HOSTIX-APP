# Warden Ledger — Step 10: PIN toggle + password show/hide (spec §3.5, §5 step 10)

Status: **BUILT** — the owner delegated the two open choices ("decide for me best
option", 2026-09-15); the decisions are recorded below.
Owner answers: `WARDEN_LEDGER_SCHEMA_PROPOSAL.md` → §3.5 row (per account, off by default,
switched on in the Users page; the warden sets their own PIN) and "Step 10 decisions" below.

## Step 10 decisions (owner, 2026-09-15)

| Question | Answer |
|---|---|
| When is the PIN asked? | **When posting a payment** — Post payment / Print & save on Add Payment, and the student row's payment form |
| What kind of PIN? | **Exactly 4 digits** |
| No PIN yet / forgotten | **Set on first use.** An admin can **clear** a PIN (never see or choose it); the warden sets a new one the next time it is needed |
| Wrong PIN | **No limit** — "Wrong PIN", try again |

## What the code does today

- No PIN exists anywhere.
- **The show/hide eye is already app-wide.** `renderer/src/pw-eye.js` (2026-09-14, from this
  same spec line) gives every `input[type=password]` an eye the moment it appears: the user
  editor, Reset password, onboarding. The login field keeps its own eye. Any PIN field built
  as `type=password` gets the eye with no extra code — step 10 only has to keep it that way
  and test it.

## Part A — switching it on (Users → Edit user, section 2 "Role & access")

A second tick under "Account is active":

```
[x] Account is active
    An inactive account cannot sign in
[ ] Require PIN to post payments
    Asked each time this account posts a payment. Off by default.
    PIN: set ✓  (or: not set yet — they set it the first time it is needed)
```

- Saved on the account as `pinRequired: true|false`.
- Available on any account, admin accounts included.

## Part B — the PIN itself

- Stored on the account as `pin` — hashed the same way as the password (PBKDF2, salted),
  never readable. It lives where passwords live: this PC's account store, not in backups.
- **My Account** (the account's own panel — every account, with or without Manage users)
  gets an action: **Set my PIN** / **Change my PIN**. Changing asks for the current PIN first.
- **An admin** looking at someone else's panel gets **Clear PIN** when one is set. Clearing
  never shows or sets a PIN; that account sets a new one the next time it posts.
- Activity log: "PIN set", "PIN changed", "PIN cleared" — never the PIN.

## Part C — asking for it when posting

On **Post payment** / **Print & save** (Add Payment) and on the student row's payment form,
after the form's own checks pass and **before anything is saved**, if the signed-in account
has `pinRequired`:

```
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ 🔒 Confirm with your PIN         │        │ 🔒 Set your PIN                   │
│ Sara Warden · posting Rs. 5,000  │        │ Needed to post payments.          │
│                                  │        │                                  │
│ PIN  [ ••••            👁 ]      │        │ New PIN     [ ••••        👁 ]   │
│      Wrong PIN — try again       │        │ Repeat PIN  [ ••••        👁 ]   │
│                                  │        │ 4 digits. Only you know it.       │
│          [Cancel] [Confirm]      │        │          [Cancel] [Set & post]    │
└──────────────────────────────────┘        └──────────────────────────────────┘
```

- Enter confirms. The box takes digits only, 4 of them.
- **Wrong PIN**: the box clears and says so; no limit (owner).
- **Cancel**: nothing is posted; the form stays as it was.
- **No PIN yet**: the "Set your PIN" box appears instead; setting it counts as the
  confirmation and the payment posts.
- Asked **once per posting** — the "update the existing pending record?" confirmation that
  some postings show does not ask a second time.

## The two choices — decided (owner: "decide for me best option", 2026-09-15)

1. **The PIN guards every action that changes collected money** under the signed-in
   account — otherwise a row's Mark paid would post money with no PIN at all:
   Add Payment and the student row's payment form, **Mark paid**, **Bulk mark paid** (one
   PIN for the batch), **Reverse**, an **Edit payment that changes Amount paid**, and a
   **checkout settlement** that collects or hands money back. Charge-only edits do not
   ask (step 6 already requires a reason for those).
2. **Change my PIN asks for the current PIN first**, so nobody at an unlocked PC can
   change it.

## Files

- `renderer/src/pin.js` (new) — `pinValid`, `pinIsRequired`, `pinHasOne`, `pinConfirm()`
  (the two boxes above), `pinSet`, `pinClear`
- `renderer/index.html` — script tag
- `renderer/src/modules/users.js` — the editor tick, My Account "Set/Change my PIN",
  admin "Clear PIN"
- `renderer/src/modules/modals.js` — `saveUser()` reads the tick
- `renderer/src/modules/payments.js` — the gate in `submitAddPayment()` and
  `submitPaymentForStudent()`
- `renderer/globals.d.ts`
- tests: `tests/pin.test.js` (4-digit rule), `tests/pin.spec.js` (off by default; switched
  on → first posting sets the PIN → next posting asks → wrong PIN posts nothing → right PIN
  posts → Cancel posts nothing → admin clears → next posting sets a new one; Change my PIN;
  every PIN and password field has an eye)
