-- 002: access control — levels, timed bans, restrictions, revisions, realtime, 2FA, fleet
--
-- Owner's brief, 2026-09-24 (docs/ADMIN_PANEL_PLAN_2026-09-24.md): full control of every
-- hostel from one panel, with every change reaching a running app in seconds.
--
-- Additive only. Every existing licence keeps exactly the access it has today:
-- status stays what it was, restrictions default to "nothing restricted", and the fleet row
-- starts empty.

-- =====================
-- LICENCES — the access ladder
-- =====================
-- One level per hostel, so "what can this hostel do right now?" has one answer:
--
--   active      everything
--   readonly    view, search, print, export — no new or changed data
--   restricted  view and search only — no data entry, no printing, no exporting
--   suspended   the app is locked (licence screen only) until restored or `status_until`
--   revoked     permanently locked
--
-- readonly and restricted travel to the app as status ACTIVE plus `restrictions` — the app
-- rejects any status it does not know, so a new status word would make every shipped build
-- throw its entitlement away and fall back to the licence file.
ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_status_check;
ALTER TABLE licenses ADD CONSTRAINT licenses_status_check
  CHECK (status IN ('active', 'readonly', 'restricted', 'suspended', 'revoked'));

-- A level can be temporary. When `status_until` passes, the sweeper puts the licence back to
-- `status_before` and writes the audit row itself — a 7-day ban lifts on day 7 with nobody
-- having to remember it.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS status_until  TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS status_before TEXT
  CHECK (status_before IS NULL OR status_before IN ('active', 'readonly', 'restricted', 'suspended'));
-- Shown to the hostel. Written by the owner, so it is plain text and escaped wherever rendered.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- Per-switch overrides on top of the level: {"dataEntry": false, "printing": false,
-- "exporting": false}. Only `false` means anything; a level can never be loosened here.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS restrictions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- A free-text plan name for the owner's own bookkeeping. No behaviour hangs off it.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS plan TEXT;

-- Monotonic. Bumped by the trigger below on EVERY change that alters what the app may do, so a
-- device reporting the revision it last applied tells the portal whether a change has landed.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

-- v5 keys: same layout as v4, checksum under a V5 tag. Issued only by the portal, and they must
-- be activated online once — that is what binds one key to one PC.
ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_key_version_check;
ALTER TABLE licenses ADD CONSTRAINT licenses_key_version_check CHECK (key_version IN (3, 4, 5));

CREATE INDEX IF NOT EXISTS idx_licenses_status_until ON licenses(status_until)
  WHERE status_until IS NOT NULL;

-- =====================
-- DEVICES — presence and delivery
-- =====================
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_revision_applied BIGINT;
-- Set while the app holds the live stream open, cleared when it closes. "Online now" is
-- stream_connected_at IS NOT NULL — not a guess from last_seen.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS stream_connected_at TIMESTAMPTZ;
-- Why a device was removed, shown to that PC when it is locked.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- =====================
-- FLEET — one row, applies to every hostel
-- =====================
-- Fleet features sit between the catalogue default and a licence's own override:
--   catalogue default  <  fleet  <  licence
-- Fleet restrictions are ANDed with each licence's own.
CREATE TABLE IF NOT EXISTS fleet_settings (
  id            BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  features      JSONB NOT NULL DEFAULT '{}'::jsonb,
  restrictions  JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision      BIGINT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO fleet_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- =====================
-- ADMIN 2FA
-- =====================
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_secret  TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
-- Pending (unconfirmed) secret during enrolment, so starting enrolment never disables 2FA.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_pending TEXT;

-- =====================
-- REVISIONS AND NOTIFICATIONS
-- =====================
-- The trigger, not the route handlers, owns the revision: a new admin route that forgets to
-- bump it would otherwise leave running apps holding a stale answer with nothing to say so.
CREATE OR REPLACE FUNCTION licenses_bump_revision() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status, NEW.status_until, NEW.status_reason, NEW.verification, NEW.expires_at,
      NEW.features, NEW.restrictions, NEW.max_devices)
     IS DISTINCT FROM
     (OLD.status, OLD.status_until, OLD.status_reason, OLD.verification, OLD.expires_at,
      OLD.features, OLD.restrictions, OLD.max_devices) THEN
    NEW.revision = OLD.revision + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS licenses_revision ON licenses;
CREATE TRIGGER licenses_revision BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION licenses_bump_revision();

-- One channel, three payload shapes: 'L:<licence id>:<revision>', 'D:<device id>', 'F:<rev>'.
-- NOTIFY is transactional — it is delivered on COMMIT, so a stream never tells an app to fetch
-- a change that was rolled back.
CREATE OR REPLACE FUNCTION licenses_notify() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.revision IS DISTINCT FROM OLD.revision THEN
    PERFORM pg_notify('cp_changes', 'L:' || NEW.id::text || ':' || NEW.revision::text);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS licenses_notify ON licenses;
CREATE TRIGGER licenses_notify AFTER UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION licenses_notify();

CREATE OR REPLACE FUNCTION devices_notify() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pg_notify('cp_changes', 'D:' || NEW.id::text);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS devices_notify ON devices;
CREATE TRIGGER devices_notify AFTER UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION devices_notify();

CREATE OR REPLACE FUNCTION fleet_bump() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.features, NEW.restrictions) IS DISTINCT FROM (OLD.features, OLD.restrictions) THEN
    NEW.revision = OLD.revision + 1;
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fleet_revision ON fleet_settings;
CREATE TRIGGER fleet_revision BEFORE UPDATE ON fleet_settings
  FOR EACH ROW EXECUTE FUNCTION fleet_bump();

CREATE OR REPLACE FUNCTION fleet_notify() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.revision IS DISTINCT FROM OLD.revision THEN
    PERFORM pg_notify('cp_changes', 'F:' || NEW.revision::text);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fleet_notify ON fleet_settings;
CREATE TRIGGER fleet_notify AFTER UPDATE ON fleet_settings
  FOR EACH ROW EXECUTE FUNCTION fleet_notify();
