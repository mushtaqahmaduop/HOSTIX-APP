# Hostyllo Offline — Admin Control Panel: plan

Owner's brief (2026-09-24): full control of every hostel from one panel —
issue keys for new registrations, extend or shorten a licence, make an install
read-only (no adding data, no printing, no exporting), ban for a short time or
permanently, lock and unlock individual features, and have every change reach
the hostel **immediately**. A key, once bound to a PC, must not work on another.
The panel should feel like the Cloud SaaS super-admin prototype: professional,
"god mode".

Nothing below is built yet. This is the plan to agree before any code.

---

## 0. What already exists (so we build on it, not beside it)

The control plane in `server/` (Railway, Postgres) already has most of the
*primitives*. The gap is mostly realtime delivery, finer-grained restrictions,
and the panel itself.

| Need | Today | Gap |
|---|---|---|
| Issue a key | `POST /v1/admin/issue-key` (v4 keys, random serial) | Key is issued bare; the hostel record only appears when the app first registers. |
| Extend / shorten expiry | `POST /licenses/:id/renew` moves `expires_at` | Works only for installs that sync. Shortening is not a first-class action. |
| Suspend / revoke / restore | `POST /licenses/:id/status` | No "until" date — a short ban has to be lifted by hand. No reason shown to the hostel. |
| Read-only | SUSPENDED and EXPIRED = read-only | Read-only still allows **print and export** by design ("you can still view, search and print everything"). No way to block those separately. |
| Feature flags | 6 flags (`reports`, `archive`, `backup`, `printDocs`, `multiUser`, `expenses`), per licence, honoured by `hasFeature()` | No fleet-wide toggle; no restrictions such as "no writes". |
| Device binding | `max_devices`; v4 keys default to 1 device; `UNIQUE(license_id, machine_id)`; entitlement carries `machineId` | Offline activation never asks the server, so a key can be typed into a second PC that never goes online. |
| Speed of change | App polls the entitlement **every hour** (`entitlementSyncIntervalMs`) | Nothing is "instant". |
| Audit | Insert-only `audit_log` | Fine — keep. |
| Admin roles | `owner` / `admin` / `support` in schema | Not enforced per action; no 2FA. |
| Panel UI | 3 tabs (Licences, Issue key, Audit) + a drawer | This is the rebuild. |

**Blocking prerequisite.** Production (`master`, 5.1.0) does not have the three
licence fixes that exist only on the owner's PC: `a33c363` (suspension locks
the app), `0763108` (write gate covers every path), `f79b114` (revocation can
reach the app). Push `feature/students-register-2026-09-22` first; this plan
assumes those are in. **No control-panel change reaches a hostel until a
release carrying the app half ships** — a hostel on 5.1 ignores every new
claim below.

---

## 1. The control model — one ladder, not a pile of switches

Every hostel is at exactly one **access level**, plus optional per-feature
locks. One level at a time is what keeps the panel honest: the admin always
sees one answer to "what can this hostel do right now?".

| Level | App opens | Add/edit data | Print | Export / backup | Hostel sees |
|---|---|---|---|---|---|
| **Active** | yes | yes | yes | yes | nothing |
| **Grace** (auto, after expiry) | yes | yes | yes | yes | renewal warning |
| **Read-only** | yes | **no** | yes | yes | banner with reason |
| **Restricted** | yes | **no** | **no** | **no** | banner with reason — view and search only |
| **Suspended** (locked) | **licence screen only** | no | no | data download only* | reason + contact |
| **Revoked** (permanent ban) | **licence screen only** | no | no | data download only* | "revoked" + contact |

\* **Recommendation: always let a hostel take its own data out, even when
banned.** The records are theirs, the app promises they never leave the PC, and
holding them hostage is the one thing that turns a licence dispute into a legal
one. The current lock screen already offers this. Decision **D1** below.

Every level except Grace can carry an **until** date. A ban "for 7 days" is
Suspended with `until = +7d`; when the date passes the server drops it back to
the previous level on its own, and the audit log records the automatic lift.

**Per-feature locks** sit on top of the level: `reports`, `archive`, `backup`,
`printDocs`, `multiUser`, `expenses` exist today; add `printing` (every
PDF/print path), `exporting` (every Excel/PDF export and backup export) and
`dataEntry` (all writes). The last three are the same switches the levels use,
exposed one at a time so the owner can, for example, block export alone.

---

## 2. Making changes land in seconds, not an hour

Today the app asks once an hour. The plan:

1. **A push channel.** Each running app holds one open connection to
   `GET /v1/devices/stream` (Server-Sent Events, authenticated with the device
   token it already has). It carries **no policy** — only "your licence changed,
   revision N". SSE is plain HTTP, goes through proxies and hostel routers, and
   Railway supports it; a WebSocket is not needed for one-way nudges.
2. **The app then fetches the signed entitlement** it already knows how to
   verify, and calls `refreshEnforcement()`, which already broadcasts to every
   window. The screen locks, a banner appears, or a menu item disappears — no
   restart.
3. **Fan-out across server instances** uses Postgres `LISTEN/NOTIFY`, so no
   Redis is added. Every admin write bumps `licenses.revision` and emits
   `NOTIFY licence_changed`.
4. **Fallback poll** shortens from 60 min to 10 min, for connections a router
   silently drops. The stream reconnects with back-off.
5. **Presence for free:** a device with an open stream is "online now" in the
   panel, and the admin sees whether a change has been *received* (the app
   acknowledges the revision it applied).

**What "instant" cannot mean.** A PC that is switched off or has no internet
cannot be reached. Today it keeps running on its cached entitlement for
`ENTITLEMENT_CACHE_DAYS` (14) and then falls back to its local key. Two
levers, decision **D2**:
- **Check-in deadline:** a licence that has registered once must reconnect
  within N days (suggest 7), or the app goes **read-only** until it does.
  Never locked for being offline — that is what the offline product promises.
- The panel always shows "last seen", so the owner knows which hostels a change
  has not reached yet.

---

## 3. Keys and binding a key to one PC

**Issuing (new registration).** "Register hostel" in the panel creates the
licence record first — hostel name, contact, city, plan, expiry, device limit
(default 1), features — and then produces the key. The hostel exists in the
panel before anyone types the key, instead of appearing as "unverified" later.

**Binding.** Already true when the app is online: v4 keys have `max_devices = 1`,
the server refuses a second machine (409), and the entitlement is signed for
one `machineId`, so copying it to another PC does not verify.

The hole is an **offline first activation**: the key checksum ships inside the
app, so a second PC that never goes online accepts the key. Closing it means
**new keys must be activated online once**. That touches the CLAUDE.md rule
"never make the app require the control plane", so it is scoped narrowly
(decision **D3**):
- Applies to **new-format keys only** (a v5 key, or v4 keys issued after the
  cut-over). The ~50 hostels on v3/v4 keys are untouched.
- Only the **first** activation needs internet. After that the app runs offline
  forever, as now.
- The server answers with a signed activation bound to that machine; the app
  refuses a v5 key without one.

**Moving a hostel to a new PC.** The panel gets "Release device": it
deactivates the old machine and frees the seat, so the same key activates on the
new PC. The old PC is locked at its next sync. Every move is audited.

**Changing expiry.** "Extend" and "Shorten" are one action with a date picker
and a reason. Both move the server's `expires_at`, which binds every install
that syncs. For an install that never syncs, the key's own expiry still
applies — which is why the check-in deadline (D2) matters.

---

## 4. The app side (what the desktop app must enforce)

The app already has one enforcement decision (`currentEnforcement()`), one
write gate at the DB IPC boundary, and one export engine. Build on those:

- **Claims:** add `level`, `until`, `reason` and `restrictions
  {dataEntry, printing, exporting}` to the entitlement as **new fields inside
  `ver: 1`**. The app rejects any `ver` other than 1 (`services/entitlement.js:145`),
  so bumping it would make every shipped build throw the entitlement away. Old
  builds ignore the extra fields; new builds enforce them.
- **Gates live in the main process**, not only in the UI:
  - writes → the existing write gate;
  - printing → `receipt:savePDF`, the print handlers, `window.print` routes;
  - exporting → the export engine's save path (`EXPORT.pdf/excel`), backup
    export (File → Export, Ctrl+S) and CSV saves.
  The UI then greys out and explains ("Printing is disabled for this licence")
  so nothing looks broken.
- **Live apply:** on `license:enforcementChanged`, a screen that just lost a
  capability re-renders (it already does this for features via `nav.js`); a
  lock navigates to the licence screen.
- **Lock-screen hygiene** (from the 09-24 handoff): make sure Ctrl+O Import is
  dead while locked.

---

## 5. The admin panel

Built in `server/public/` (served by the control plane, no build step, same
vanilla stack as the app). Modelled on the Cloud SaaS super-admin prototype
for layout and polish. **The prototype is on the owner's PC
(`C:\Users\PCS\Downloads\Code\admin.html`) and has not been seen by this
plan** — it needs to be committed or uploaded before the UI phase. Rules
carried over: no real hostel names in seeds (it seeds "DAMAM Boys Hostel"), and
no SaaS-only concepts that do not exist here (MRR, trials, impersonation —
see "god mode" below).

**Screens**

1. **Overview** — KPIs: hostels, online now, active / grace / read-only /
   suspended / revoked, expiring in 7 / 30 days, not seen for 7+ days, app
   versions in the field (who is still on a build that cannot enforce), recent
   admin actions.
2. **Hostels** — searchable, filterable register (level, expiry window, city,
   version, online). Bulk actions: extend, set level, lock a feature.
3. **Hostel detail** — tabs:
   - *Overview*: level with a one-click ladder, until, reason, expiry,
     last seen, online dot, "change received ✓" for the last action.
   - *Licence*: extend/shorten, re-issue key, device limit.
   - *Devices*: each PC, version, OS, last seen, online; release / block.
   - *Features & restrictions*: every flag as a switch, with "this build
     supports it" from the catalogue's `since`.
   - *Activity*: this hostel's audit trail.
   - *Notes*: contact, city, internal notes.
4. **Register hostel** — the issuing flow in §3, ends with the key and a
   copy/WhatsApp-ready message.
5. **Fleet controls** — a feature switch or a message for *every* hostel at
   once (e.g. switch `backup` off fleet-wide), with a count and a typed
   confirmation.
6. **Audit log** — every action, who, when, why; filter and export.
7. **System** — DB and signing health, stream connections, the
   `control-plane.json` kill-switch state (read-only display — editing it stays
   a git change on purpose).
8. **Admins** — users, roles, sessions, sign out everywhere.

**"God mode", defined honestly.** The owner can do everything to a licence, a
device and a feature, instantly, with an audit trail. It can **not** see a
hostel's students or payments: the control plane holds no hostel data by design
(`001_control_plane.sql`), and that is the product promise sold to 50 hostels.
The SaaS prototype's "impersonate tenant" has no equivalent here. Decision **D4**
if the owner wants usage telemetry (counts only, e.g. number of students) —
it would be a new, disclosed data collection.

**Safety for a panel that can switch off paying customers**

- Roles enforced per action: `support` views and notes, `admin` changes
  levels and features, `owner` revokes, releases devices, runs fleet actions and
  manages admins.
- TOTP 2FA for every admin; re-enter the password for revoke and fleet actions.
- Revoke and fleet actions need the hostel name typed to confirm, and a reason.
- Every action shows an **undo** for 30 seconds before it is sent.
- Rate limit and alert on mass changes (e.g. >10 revokes in an hour).

---

## 6. Data model changes (server, migration `002`)

`licenses`: add `level` (active/readonly/restricted/suspended/revoked —
replaces `status`, which is kept in sync for one release), `level_until`,
`level_reason`, `previous_level`, `restrictions JSONB`, `revision INT`,
`plan`, `checkin_days`.
`devices`: add `last_revision_applied`, `stream_connected_at`.
New `fleet_settings` (fleet-wide feature overrides, single row).
New `admin_totp` (secret, enabled). A scheduled job lifts expired `until`
levels and writes the audit row.

---

## 7. Phases

| # | Phase | Delivers | Reaches hostels |
|---|---|---|---|
| 0 | Land the pending fixes | push the local branch, split commits, PR to master | at release |
| 1 | Server model + API | migration 002, levels with `until`, restrictions, revision, roles, 2FA, tests | server deploy |
| 2 | Realtime | SSE stream, LISTEN/NOTIFY, ack, 10-min fallback | needs app release |
| 3 | App enforcement | new claims, print/export gates, live apply, lock-screen import check | **release 5.2** |
| 4 | Admin panel | the screens in §5 | server deploy |
| 5 | Key binding | online first activation for new keys, release-device flow, check-in deadline | release 5.2 or 5.3 |
| 6 | Proof | E2E against a **local** Postgres (never production): issue → activate → lock → unlock → revoke → release → re-activate on a second profile; the 09-24 lock-probe as a real spec | — |

Phases 1–3 are the minimum for "instant, fine-grained control". The panel (4)
can start in parallel against the phase-1 API.

---

## 8. Decisions for the owner

- **D1** Banned hostel can still download its own data? *Recommended: yes.*
- **D2** Check-in deadline for installs that stop connecting: 7 days, and then
  read-only (not locked)? *Recommended: 7 days → read-only.*
- **D3** New keys need internet for the first activation only, and existing
  keys are untouched? *Recommended: yes — the only way to bind a key to one PC.*
- **D4** Any usage telemetry (counts only) to the panel? *Recommended: not now.*
- **D5** Should the SaaS prototype be committed to this repo (for example
  `docs/reference/`) so the panel can be modelled on it?
