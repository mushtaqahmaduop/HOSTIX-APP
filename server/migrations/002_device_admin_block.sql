-- 002: tell "an admin switched this machine off" apart from "this machine reinstalled"
--
-- Registration upserts the device row and sets status = 'active' on conflict, because a reinstall
-- or a wiped profile is the common case and must not need a support ticket. The cost was that an
-- ADMIN deactivating a device was undone the next time that machine's app phoned home: status went
-- straight back to 'active', and nothing recorded that it had. The one deliberate way to switch a
-- customer's computer off did not stay switched off.
--
-- Both cases write status = 'deactivated', so status alone cannot separate them. This flag carries
-- the INTENT: set only by the portal, never by registration, and the registration path refuses a
-- device that carries it instead of quietly reactivating it.
--
-- A blocked device still does not hold a seat — the cap counts status = 'active' — so deactivating
-- to free a computer for a replacement machine keeps working exactly as before. What changes is
-- that the blocked machine cannot take the seat back on its own.

ALTER TABLE devices ADD COLUMN IF NOT EXISTS admin_blocked BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill. Today the ONLY thing that writes 'deactivated' is the portal's device-status route, so
-- every already-deactivated row is by definition an admin decision — and reading them as anything
-- else would silently reactivate them on the next sync, which is the bug this migration closes.
UPDATE devices SET admin_blocked = TRUE WHERE status = 'deactivated';

CREATE INDEX IF NOT EXISTS idx_devices_admin_blocked ON devices(admin_blocked) WHERE admin_blocked;
