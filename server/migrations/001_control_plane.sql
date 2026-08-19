-- 001: the control plane — licences, devices, feature flags, admins, audit
--
-- This database belongs to the OFFLINE product's control plane and to nothing else. It holds
-- licence and device metadata plus feature flags. It does NOT hold hostel business data: no
-- students, no payments, no names. That is a product promise, not an oversight — the offline app
-- keeps a hostel's records on the hostel's own machine, and this schema has nowhere to put them
-- even if something later tried.
--
-- It has no connection to the Hostyllo SaaS: separate service, separate database, separate
-- deploy, no shared tables and no foreign keys across products.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── updated_at ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================
-- LICENCES
-- =====================
CREATE TABLE IF NOT EXISTS licenses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- SHA-256 of the normalised key. The key itself is a credential — anyone holding it can
  -- register a device — so it is never stored, exactly as a password is not.
  key_fingerprint   TEXT NOT NULL UNIQUE,

  key_version       SMALLINT NOT NULL CHECK (key_version IN (3, 4)),

  -- The key's expiry group, kept so a licence can be matched against the issuance log by eye.
  -- Not secret alone: a date in base36, with the checksum deliberately not stored beside it.
  key_expiry_part   TEXT NOT NULL,

  -- v4 only. NULL for every v3 licence, because v3 keys had no serial — which is the whole
  -- problem the max_devices note below exists to handle.
  serial            TEXT,

  -- Decoded from the key, in UTC, so it never depends on where the server runs.
  expires_at        TIMESTAMPTZ NOT NULL,

  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'revoked')),

  -- A key the control plane has never seen registers and is ADMITTED, landing here as
  -- 'unverified' for the owner to confirm. Not refused: ~50 paying hostels hold keys this
  -- database has no record of, and refusing them would lock out the customers it exists to
  -- serve. Not trusted either: the key checksum's secret ships inside app.asar, so it filters
  -- typos and nothing more.
  verification      TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (verification IN ('unverified', 'verified', 'rejected')),

  -- NULL means unlimited, and that is the correct default for a v3 licence.
  --
  -- The v3 key format encoded ONLY the expiry month with no random component, so every customer
  -- whose licence ended in the same month was issued the IDENTICAL key string — the entire
  -- issuance history is 12 strings across ~50 hostels. One v3 key therefore legitimately belongs
  -- to many hostels, and capping it at one device would let whichever hostel registered first
  -- claim the key and lock out every other paying customer sharing it.
  --
  -- v4 keys carry a random serial, so each issuance is unique and one device is right.
  max_devices       INTEGER CHECK (max_devices IS NULL OR max_devices > 0),

  -- Per-licence feature overrides, merged over the catalogue defaults in src/lib/features.js.
  -- A map of flag key -> boolean. The catalogue lives in code rather than in a table because it
  -- describes what the APP can do, and it must be versioned with the app, not edited underneath
  -- a build that has never heard of the flag.
  features          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Who this is. The first per-customer information this product has ever had: a licence key
  -- never identified anybody.
  hostel_name       TEXT,
  contact_name      TEXT,
  contact_phone     TEXT,
  city              TEXT,
  notes             TEXT,

  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_status       ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_verification ON licenses(verification);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at   ON licenses(expires_at);

DROP TRIGGER IF EXISTS licenses_updated_at ON licenses;
CREATE TRIGGER licenses_updated_at BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================
-- DEVICES
-- =====================
CREATE TABLE IF NOT EXISTS devices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,

  -- The app's hardware fingerprint: SHA-256 of platform, arch, CPU model, Windows MachineGuid,
  -- drive serial and BIOS serial. 64 lowercase hex, validated at the endpoint. Note the app
  -- deliberately EXCLUDES hostname from this hash, and this table does not collect it either.
  machine_id      TEXT NOT NULL,

  -- SHA-256 of the device secret. Plain SHA-256 rather than bcrypt is correct here and only
  -- here: the secret is 32 bytes from a CSPRNG, so there is no dictionary to slow down and no
  -- human choice to protect.
  secret_hash     TEXT NOT NULL,

  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'deactivated')),

  app_version     TEXT,
  os              TEXT,

  -- Set by the admin, not reported by the machine — "front office PC", "warden laptop".
  label           TEXT,

  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per machine per licence. Re-registering the same machine UPDATES this row rather
  -- than accumulating a new one every time the app is reinstalled.
  UNIQUE (license_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_license_id ON devices(license_id);
CREATE INDEX IF NOT EXISTS idx_devices_machine_id ON devices(machine_id);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen  ON devices(last_seen_at);

DROP TRIGGER IF EXISTS devices_updated_at ON devices;
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================
-- DEVICE TOKENS
-- =====================
-- Short-lived tokens a device exchanges its secret for. Opaque random bytes, stored hashed, so
-- the table is a lookup rather than something to verify — a token is a device token because it
-- is in here, and it cannot be confused with an admin session because that is a different table.
-- Revocation is a DELETE.
--
-- In Postgres rather than in memory so a deploy does not sign every hostel out. In Postgres
-- rather than Redis because this service does not otherwise need Redis, and one fewer piece of
-- infrastructure to run, pay for and monitor is worth more than the microseconds.
CREATE TABLE IF NOT EXISTS device_tokens (
  token_hash    TEXT PRIMARY KEY,
  device_id     UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_device  ON device_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_expires ON device_tokens(expires_at);

-- =====================
-- RATE LIMITS
-- =====================
-- Per-IP counters for the public, unauthenticated endpoints. In Postgres for the same reason the
-- device tokens are: this service has no Redis, and adding one to count a few hundred requests an
-- hour would be infrastructure to run, pay for and monitor in exchange for microseconds.
--
-- The window is a sliding reset rather than a rolling log — good enough to stop someone grinding
-- licence keys, and it costs one row per IP per bucket instead of one per request.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        TEXT NOT NULL,
  ip            TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hits          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, ip)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- =====================
-- ADMIN USERS
-- =====================
-- Who can operate the portal. Small by design — this is the owner and anyone they trust with
-- the power to switch off a customer's software.
CREATE TABLE IF NOT EXISTS admin_users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT,
  role            TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'support')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS admin_users_updated_at ON admin_users;
CREATE TRIGGER admin_users_updated_at BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================
-- AUDIT LOG
-- =====================
-- INSERT ONLY. Every privileged action lands here, because "who suspended this hostel, and
-- when, and why" is a question that gets asked exactly when the records are most needed. The
-- trigger below is what makes "insert only" a property of the database rather than a convention
-- someone remembers to follow.
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  actor           TEXT NOT NULL,             -- email at the time, kept even if the user is deleted
  action          TEXT NOT NULL,             -- 'license.suspend', 'license.renew', …
  target_type     TEXT,                      -- 'license' | 'device' | 'admin_user'
  target_id       UUID,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip              TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_target     ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is insert-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
