-- ============================================================
-- CommutAI · Complete Database Schema
-- Run this in the Supabase SQL Editor on a clean slate.
-- All statements use IF NOT EXISTS / IF EXISTS guards so
-- re-running is safe.
-- ============================================================

-- ── 0. Custom Enum Types ──────────────────────────────────────────────────────
-- Create staff_role enum with all required values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role') THEN
    CREATE TYPE staff_role AS ENUM ('admin', 'operator', 'driver', 'conductor', 'cs_desk');
  END IF;
END $$;

-- Note: If 'driver' needs to be added to an existing enum, this requires manual migration:
-- 1. Backup data: ALTER TABLE staff_users ALTER COLUMN role TYPE TEXT USING role::TEXT;
-- 2. Drop enum: DROP TYPE staff_role;
-- 3. Recreate: CREATE TYPE staff_role AS ENUM ('admin', 'operator', 'driver', 'conductor', 'cs_desk');
-- 4. Restore: ALTER TABLE staff_users ALTER COLUMN role TYPE staff_role USING role::staff_role;

DO $$ BEGIN
  CREATE TYPE bus_status AS ENUM ('active', 'maintenance', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trip_status AS ENUM ('in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qr_card_status AS ENUM ('active', 'lost', 'replaced', 'deactivated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE card_type AS ENUM ('regular', 'student', 'senior_citizen', 'pwd');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('issued', 'validated', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('fare_validation', 'balance_topup', 'card_issuance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE irregularity_type AS ENUM ('double_scan', 'count_mismatch', 'fare_evasion', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cs_action_type AS ENUM ('complaint', 'inquiry', 'refund', 'lost_card', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. Staff Users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_users (
  id          UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  role        staff_role  NOT NULL DEFAULT 'conductor',
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  bus_id      UUID        REFERENCES buses (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create staff_users row when a new auth user is created
CREATE OR REPLACE FUNCTION handle_new_staff_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get role from metadata, default to 'conductor'
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'conductor');
  
  -- Validate role against available enum values
  IF user_role NOT IN ('admin', 'operator', 'driver', 'conductor', 'cs_desk') THEN
    user_role := 'conductor';
  END IF;
  
  INSERT INTO staff_users (id, full_name, email, role, bus_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    user_role::staff_role,
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email     = EXCLUDED.email,
    role      = EXCLUDED.role,
    bus_id    = EXCLUDED.bus_id;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error creating staff_users record for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_staff_user();

-- ── 2. Buses ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number   TEXT        NOT NULL UNIQUE,
  bus_number     INTEGER     UNIQUE,
  route          TEXT        NOT NULL,
  seat_capacity  INTEGER     NOT NULL DEFAULT 50,
  status         bus_status  NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add bus_number column if it doesn't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buses' AND column_name = 'bus_number'
  ) THEN
    ALTER TABLE buses ADD COLUMN bus_number INTEGER UNIQUE;
  END IF;
END $$;

-- Add bus_id column to staff_users if it doesn't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_users' AND column_name = 'bus_id'
  ) THEN
    ALTER TABLE staff_users ADD COLUMN bus_id UUID REFERENCES buses (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add conductor_id and driver_id columns to buses if they don't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buses' AND column_name = 'conductor_id'
  ) THEN
    ALTER TABLE buses ADD COLUMN conductor_id UUID REFERENCES staff_users (id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buses' AND column_name = 'driver_id'
  ) THEN
    ALTER TABLE buses ADD COLUMN driver_id UUID REFERENCES staff_users (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add card_type and purchase_price columns to qr_cards if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'qr_cards' AND column_name = 'card_type'
  ) THEN
    ALTER TABLE qr_cards ADD COLUMN card_type card_type NOT NULL DEFAULT 'regular';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'qr_cards' AND column_name = 'purchase_price'
  ) THEN
    ALTER TABLE qr_cards ADD COLUMN purchase_price NUMERIC(10,2) NOT NULL DEFAULT 100.00;
  END IF;
END $$;

-- Update existing card_type values if enum was changed from old values
DO $$
BEGIN
  -- Update 'elderly' to 'senior_citizen' if it exists
  UPDATE qr_cards SET card_type = 'senior_citizen' WHERE card_type = 'elderly';
  -- Update 'disabled' to 'pwd' if it exists
  UPDATE qr_cards SET card_type = 'pwd' WHERE card_type = 'disabled';
EXCEPTION WHEN others THEN
  -- Ignore errors if the old values don't exist
  NULL;
END $$;

-- Update existing buses to have bus_number values based on plate_number
DO $$
BEGIN
  UPDATE buses SET bus_number = 1001 WHERE plate_number = 'BUS-001' AND bus_number IS NULL;
END $$;

-- ── 3. Trips ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id          UUID        NOT NULL REFERENCES buses (id),
  conductor_id    UUID        NOT NULL REFERENCES staff_users (id),
  driver_id       UUID        REFERENCES staff_users (id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  status          trip_status NOT NULL DEFAULT 'in_progress',
  -- GPS tracking columns (updated in real time by the conductor app)
  current_lat     FLOAT8,
  current_lng     FLOAT8,
  gps_updated_at  TIMESTAMPTZ
);

-- Add driver_id column to existing trips table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'driver_id'
  ) THEN
    ALTER TABLE trips ADD COLUMN driver_id UUID REFERENCES staff_users (id);
  END IF;
END $$;

-- ── 4. QR Cards ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_cards (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid        TEXT           NOT NULL UNIQUE,
  owner_name      TEXT           NOT NULL,
  contact_number  TEXT,
  balance         NUMERIC(10,2)  NOT NULL DEFAULT 0,
  status          qr_card_status NOT NULL DEFAULT 'active',
  card_type       card_type      NOT NULL DEFAULT 'regular',
  purchase_price  NUMERIC(10,2)  NOT NULL DEFAULT 100.00,
  allowed_routes  TEXT[]         DEFAULT '{}',
  passenger_id    UUID,          -- links to a registered passenger if applicable
  issued_by       UUID           REFERENCES staff_users (id),
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── 5. Temporary Tickets ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS temporary_tickets (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_uid      TEXT          NOT NULL UNIQUE,
  fare_amount     NUMERIC(10,2) NOT NULL DEFAULT 12,
  status          ticket_status NOT NULL DEFAULT 'issued',
  allowed_routes  TEXT[]        DEFAULT '{}',
  passenger_id    UUID,
  trip_id         UUID          REFERENCES trips (id),
  issued_by       UUID          REFERENCES staff_users (id),
  issued_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  validated_at    TIMESTAMPTZ
);

-- ── 6. Transactions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id          UUID             REFERENCES qr_cards (id),
  temp_ticket_id   UUID             REFERENCES temporary_tickets (id),
  trip_id          UUID             REFERENCES trips (id),
  type             transaction_type NOT NULL,
  amount           NUMERIC(10,2)    NOT NULL,
  channel          TEXT             NOT NULL, -- 'qr_card', 'temp_ticket', 'cash', 'card'
  staff_id         UUID             REFERENCES staff_users (id),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  -- Baggage-related columns
  baggage_category TEXT,
  baggage_weight   NUMERIC(10,2),
  baggage_fee      NUMERIC(10,2)
);

-- Add baggage columns to existing transactions table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'baggage_category'
  ) THEN
    ALTER TABLE transactions ADD COLUMN baggage_category TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'baggage_weight'
  ) THEN
    ALTER TABLE transactions ADD COLUMN baggage_weight NUMERIC(10,2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'baggage_fee'
  ) THEN
    ALTER TABLE transactions ADD COLUMN baggage_fee NUMERIC(10,2);
  END IF;
END $$;

-- ── 7. Passenger Counts ───────────────────────────────────────────────────────
-- Records periodic headcount snapshots (manual + AI-assisted) for video monitoring.
CREATE TABLE IF NOT EXISTS passenger_counts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  count        INTEGER     NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_count     INTEGER,    -- AI-estimated headcount from camera feed
  source       TEXT        NOT NULL DEFAULT 'manual' -- 'manual' | 'ai' | 'scan'
);

-- Add video monitoring columns if they don't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'passenger_counts' AND column_name = 'ai_count'
  ) THEN
    ALTER TABLE passenger_counts ADD COLUMN ai_count INTEGER;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'passenger_counts' AND column_name = 'source'
  ) THEN
    ALTER TABLE passenger_counts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
  END IF;
END $$;

-- ── 8. Boarded Passengers ─────────────────────────────────────────────────────
-- One row per successful boarding event (QR card or temp ticket validated).
CREATE TABLE IF NOT EXISTS boarded_passengers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  passenger_id    UUID,       -- optional link to a registered passenger profile
  card_id         UUID        REFERENCES qr_cards (id),
  temp_ticket_id  UUID        REFERENCES temporary_tickets (id),
  boarded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_boarding_source CHECK (card_id IS NOT NULL OR temp_ticket_id IS NOT NULL)
);

-- ── 9. GPS Logs ───────────────────────────────────────────────────────────────
-- Periodic position snapshots stored separately from the trip row for history.
CREATE TABLE IF NOT EXISTS gps_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  lat          FLOAT8      NOT NULL,
  lng          FLOAT8      NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. Fare Irregularities ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fare_irregularities (
  id           UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID               NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  type         irregularity_type  NOT NULL,
  description  TEXT               NOT NULL,
  detected_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  resolved     BOOLEAN            NOT NULL DEFAULT FALSE,
  resolved_by  UUID               REFERENCES staff_users (id),
  resolved_at  TIMESTAMPTZ
);

-- ── 11. Emergency Alerts ──────────────────────────────────────────────────────
-- Admin focused for monitoring and response management
CREATE TABLE IF NOT EXISTS emergency_alerts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID        NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  conductor_id     UUID        NOT NULL REFERENCES staff_users (id),
  bus_id           UUID        REFERENCES buses (id),
  lat              FLOAT8,
  lng              FLOAT8,
  status           TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'acknowledged' | 'resolved'
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at  TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  triggered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location_lat     DECIMAL(10, 8),
  location_lng     DECIMAL(11, 8),
  location_source  TEXT, -- 'gps', 'ip_geolocation', 'unknown'
  location_accuracy DECIMAL(10, 2),
  resolved         BOOLEAN DEFAULT FALSE,
  resolved_by      UUID REFERENCES staff_users (id) ON DELETE SET NULL
);

-- Add columns for hardware integration if they don't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'triggered_at'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'location_lat'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN location_lat DECIMAL(10, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'location_lng'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN location_lng DECIMAL(11, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'location_source'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN location_source TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'location_accuracy'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN location_accuracy DECIMAL(10, 2);
  END IF;

  -- Add admin-focused columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'resolved'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN resolved BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_alerts' AND column_name = 'resolved_by'
  ) THEN
    ALTER TABLE emergency_alerts ADD COLUMN resolved_by UUID REFERENCES staff_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 12. Emergency Contacts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  email       TEXT,
  relationship TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_emergency_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_emergency_contacts_updated_at_trigger ON emergency_contacts;
CREATE TRIGGER update_emergency_contacts_updated_at_trigger
  BEFORE UPDATE ON emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_emergency_contacts_updated_at();

-- ── 13. SMS Logs ───────────────────────────────────────────────────────────────
-- Hardware integration for SMS notifications - Admin focused for monitoring
CREATE TABLE IF NOT EXISTS sms_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  sms_type        TEXT        NOT NULL, -- 'transaction', 'topup', 'reload', 'trip', 'emergency'
  status          TEXT        NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'pending'
  trip_id         UUID        REFERENCES trips (id) ON DELETE CASCADE,
  transaction_id  UUID,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns for admin functionality
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_logs' AND column_name = 'transaction_id'
  ) THEN
    ALTER TABLE sms_logs ADD COLUMN transaction_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_logs' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE sms_logs ADD COLUMN sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- ── 14. GPS Locations ───────────────────────────────────────────────────────────
-- Hardware integration for GPS tracking - Admin focused for monitoring
CREATE TABLE IF NOT EXISTS gps_locations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  latitude         DECIMAL(10, 8) NOT NULL,
  longitude        DECIMAL(11, 8) NOT NULL,
  altitude         DECIMAL(10, 2),
  speed            DECIMAL(10, 2),
  accuracy         DECIMAL(10, 2),
  source           TEXT        NOT NULL, -- 'gps', 'ip_geolocation'
  trip_id          UUID        REFERENCES trips (id) ON DELETE CASCADE,
  satellite_count  INTEGER,
  fix_quality      INTEGER,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 15. Hardware Status ───────────────────────────────────────────────────────
-- Hardware integration for component monitoring
CREATE TABLE IF NOT EXISTS hardware_status (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  component   TEXT        NOT NULL, -- 'sim900a', 'neo6m', 'emergency_button', 'camera'
  status      TEXT        NOT NULL, -- 'online', 'offline', 'error', 'maintenance'
  details     JSONB,
  last_check  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 16. Customer Service Logs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_service_logs (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID           REFERENCES trips (id),
  handled_by  UUID           REFERENCES staff_users (id),
  action      cs_action_type NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── 17. GCash Transactions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gcash_transactions (
  id                BIGSERIAL PRIMARY KEY,
  phone_number      TEXT        NOT NULL,
  amount            NUMERIC     NOT NULL,
  status            TEXT        NOT NULL CHECK (status IN ('completed', 'failed', 'pending')),
  stripe_payment_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 18. Notifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  message    TEXT        NOT NULL,
  type       TEXT        DEFAULT 'info' CHECK (type IN ('alert', 'success', 'info')),
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 19. Fare Matrix ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fare_matrix (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_from              TEXT        NOT NULL,
  route_to                TEXT        NOT NULL,
  km_distance             NUMERIC     NOT NULL,
  regular_fare            NUMERIC     NOT NULL,
  discounted_fare         NUMERIC     NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_route UNIQUE (route_from, route_to)
);

-- ── 19.1. Baggage Fee Matrix ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS baggage_fee_matrix (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT        NOT NULL,
  max_weight_kg   NUMERIC     NOT NULL,
  fee             NUMERIC     NOT NULL,
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 20. Video Recordings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_recordings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID        REFERENCES trips (id) ON DELETE CASCADE,
  file_name        TEXT        NOT NULL,
  file_path        TEXT        NOT NULL,
  file_size        BIGINT,
  duration         INTEGER,    -- duration in seconds
  format           TEXT        NOT NULL, -- 'mp4', 'avi', etc.
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_type     TEXT        NOT NULL DEFAULT 'local', -- 'local', 'cloud', 'supabase_storage'
  status           TEXT        NOT NULL DEFAULT 'recording', -- 'recording', 'completed', 'failed', 'deleted'
  metadata         JSONB       -- additional metadata like resolution, fps, etc.
);

-- Create indexes for video recordings
CREATE INDEX IF NOT EXISTS idx_video_recordings_trip_id ON video_recordings(trip_id);
CREATE INDEX IF NOT EXISTS idx_video_recordings_recorded_at ON video_recordings(recorded_at);
CREATE INDEX IF NOT EXISTS idx_video_recordings_status ON video_recordings(status);

-- RLS for video recordings
ALTER TABLE video_recordings ENABLE ROW LEVEL SECURITY;

-- Create policies with IF NOT EXISTS pattern
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'video_recordings' AND policyname = 'Allow read access to authenticated users on video_recordings'
  ) THEN
    CREATE POLICY "Allow read access to authenticated users on video_recordings"
      ON video_recordings FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'video_recordings' AND policyname = 'Allow insert for service role on video_recordings'
  ) THEN
    CREATE POLICY "Allow insert for service role on video_recordings"
      ON video_recordings FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'video_recordings' AND policyname = 'Allow update for service role on video_recordings'
  ) THEN
    CREATE POLICY "Allow update for service role on video_recordings"
      ON video_recordings FOR UPDATE
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

-- ── 21. Bus Schedules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bus_schedules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id      UUID        NOT NULL REFERENCES buses (id),
  day_number  INTEGER     NOT NULL CHECK (day_number BETWEEN 1 AND 10),
  trip_number INTEGER     NOT NULL CHECK (trip_number BETWEEN 1 AND 10),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_bus_day_trip UNIQUE (bus_id, day_number, trip_number)
);

-- ── 21. Trip Schedules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_schedules (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_number            INTEGER     NOT NULL CHECK (trip_number BETWEEN 1 AND 10),
  arrival_time_start     TIME        NOT NULL,
  arrival_time_end       TIME        NOT NULL,
  departure_time_start   TIME        NOT NULL,
  departure_time_end     TIME        NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_trip_number UNIQUE (trip_number)
);

-- ── 22. Audit Logs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT        NOT NULL,
  action      TEXT        DEFAULT 'info' CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'EXPORT')),
  module      TEXT,
  details     TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 23. Helper Functions ──────────────────────────────────────────────────────
-- Returns the active trip ID for the currently authenticated conductor
CREATE OR REPLACE FUNCTION conductor_active_trip_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM trips
  WHERE conductor_id = auth.uid()
    AND status = 'in_progress'
  ORDER BY started_at DESC
  LIMIT 1;
$$;

-- Returns the role of the authenticated user
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role::TEXT FROM staff_users WHERE id = auth.uid();
$$;

-- ── 24. Row-Level Security ────────────────────────────────────────────────────
ALTER TABLE staff_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE buses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_cards              ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporary_tickets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE passenger_counts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarded_passengers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_irregularities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_status       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_service_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gcash_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_matrix            ENABLE ROW LEVEL SECURITY;
ALTER TABLE baggage_fee_matrix     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_schedules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_schedules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_recordings       ENABLE ROW LEVEL SECURITY;

-- Staff can view their own profile (admins see all)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_users' AND policyname = 'staff_users_self_select'
  ) THEN
    CREATE POLICY "staff_users_self_select"
      ON staff_users FOR SELECT
      USING (id = auth.uid() OR current_user_role() = 'admin');
  END IF;
END $$;

-- Authenticated staff can read all buses
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'buses' AND policyname = 'buses_read_all'
  ) THEN
    CREATE POLICY "buses_read_all"
      ON buses FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Conductors can read/write their own trips; admins see all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trips' AND policyname = 'trips_conductor_rw'
  ) THEN
    CREATE POLICY "trips_conductor_rw"
      ON trips FOR ALL
      USING (conductor_id = auth.uid() OR current_user_role() = 'admin')
      WITH CHECK (conductor_id = auth.uid());
  END IF;
END $$;

-- QR cards: read by any authenticated staff
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qr_cards' AND policyname = 'qr_cards_read_authenticated'
  ) THEN
    CREATE POLICY "qr_cards_read_authenticated"
      ON qr_cards FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qr_cards' AND policyname = 'qr_cards_delete_authenticated'
  ) THEN
    CREATE POLICY "qr_cards_delete_authenticated"
      ON qr_cards FOR DELETE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qr_cards' AND policyname = 'qr_cards_insert_authenticated'
  ) THEN
    CREATE POLICY "qr_cards_insert_authenticated"
      ON qr_cards FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'qr_cards' AND policyname = 'qr_cards_update_authenticated'
  ) THEN
    CREATE POLICY "qr_cards_update_authenticated"
      ON qr_cards FOR UPDATE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Temporary tickets: full access for authenticated staff
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'temporary_tickets' AND policyname = 'temp_tickets_rw_authenticated'
  ) THEN
    CREATE POLICY "temp_tickets_rw_authenticated"
      ON temporary_tickets FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Transactions: insert + select for authenticated staff
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_insert_authenticated'
  ) THEN
    CREATE POLICY "transactions_insert_authenticated"
      ON transactions FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_select_authenticated'
  ) THEN
    CREATE POLICY "transactions_select_authenticated"
      ON transactions FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Passenger counts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'passenger_counts' AND policyname = 'passenger_counts_rw_authenticated'
  ) THEN
    CREATE POLICY "passenger_counts_rw_authenticated"
      ON passenger_counts FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Boarded passengers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'boarded_passengers' AND policyname = 'boarded_passengers_rw_authenticated'
  ) THEN
    CREATE POLICY "boarded_passengers_rw_authenticated"
      ON boarded_passengers FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- GPS logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gps_logs' AND policyname = 'gps_logs_rw_authenticated'
  ) THEN
    CREATE POLICY "gps_logs_rw_authenticated"
      ON gps_logs FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Fare irregularities
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fare_irregularities' AND policyname = 'fare_irregularities_rw_authenticated'
  ) THEN
    CREATE POLICY "fare_irregularities_rw_authenticated"
      ON fare_irregularities FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Emergency alerts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'emergency_alerts_rw_authenticated'
  ) THEN
    CREATE POLICY "emergency_alerts_rw_authenticated"
      ON emergency_alerts FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Emergency contacts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'emergency_contacts' AND policyname = 'emergency_contacts_rw_authenticated'
  ) THEN
    CREATE POLICY "emergency_contacts_rw_authenticated"
      ON emergency_contacts FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- SMS logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sms_logs' AND policyname = 'sms_logs_rw_authenticated'
  ) THEN
    CREATE POLICY "sms_logs_rw_authenticated"
      ON sms_logs FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- GPS locations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gps_locations' AND policyname = 'gps_locations_rw_authenticated'
  ) THEN
    CREATE POLICY "gps_locations_rw_authenticated"
      ON gps_locations FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Hardware status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'hardware_status' AND policyname = 'hardware_status_rw_authenticated'
  ) THEN
    CREATE POLICY "hardware_status_rw_authenticated"
      ON hardware_status FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Customer service logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_service_logs' AND policyname = 'cs_logs_rw_authenticated'
  ) THEN
    CREATE POLICY "cs_logs_rw_authenticated"
      ON customer_service_logs FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- GCash transactions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gcash_transactions' AND policyname = 'gcash_transactions_rw_authenticated'
  ) THEN
    CREATE POLICY "gcash_transactions_rw_authenticated"
      ON gcash_transactions FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Notifications
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_rw_authenticated'
  ) THEN
    CREATE POLICY "notifications_rw_authenticated"
      ON notifications FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Audit logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_rw_authenticated'
  ) THEN
    CREATE POLICY "audit_logs_rw_authenticated"
      ON audit_logs FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Fare matrix
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fare_matrix' AND policyname = 'fare_matrix_rw_authenticated'
  ) THEN
    CREATE POLICY "fare_matrix_rw_authenticated"
      ON fare_matrix FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Baggage fee matrix
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baggage_fee_matrix' AND policyname = 'baggage_fee_matrix_rw_authenticated'
  ) THEN
    CREATE POLICY "baggage_fee_matrix_rw_authenticated"
      ON baggage_fee_matrix FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Bus schedules
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bus_schedules' AND policyname = 'bus_schedules_rw_authenticated'
  ) THEN
    CREATE POLICY "bus_schedules_rw_authenticated"
      ON bus_schedules FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Trip schedules
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trip_schedules' AND policyname = 'trip_schedules_rw_authenticated'
  ) THEN
    CREATE POLICY "trip_schedules_rw_authenticated"
      ON trip_schedules FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Video recordings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'video_recordings' AND policyname = 'video_recordings_rw_authenticated'
  ) THEN
    CREATE POLICY "video_recordings_rw_authenticated"
      ON video_recordings FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── 25. Indexes for Performance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trips_conductor_status
  ON trips(conductor_id, status) WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_qr_cards_uid
  ON qr_cards(card_uid);

CREATE INDEX IF NOT EXISTS idx_temp_tickets_uid
  ON temporary_tickets(ticket_uid);

CREATE INDEX IF NOT EXISTS idx_transactions_trip
  ON transactions(trip_id);

CREATE INDEX IF NOT EXISTS idx_boarded_passengers_trip
  ON boarded_passengers(trip_id);

CREATE INDEX IF NOT EXISTS idx_passenger_counts_trip
  ON passenger_counts(trip_id);

CREATE INDEX IF NOT EXISTS idx_passenger_counts_recorded_at
  ON passenger_counts(recorded_at);

CREATE INDEX IF NOT EXISTS idx_fare_irregularities_trip
  ON fare_irregularities(trip_id);

CREATE INDEX IF NOT EXISTS idx_gps_logs_trip
  ON gps_logs(trip_id);

CREATE INDEX IF NOT EXISTS idx_emergency_alerts_trip
  ON emergency_alerts(trip_id);

CREATE INDEX IF NOT EXISTS idx_emergency_alerts_status
  ON emergency_alerts(status);

CREATE INDEX IF NOT EXISTS idx_emergency_alerts_triggered_at
  ON emergency_alerts(triggered_at);

-- Hardware integration indexes - Admin focused for monitoring
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone_number
  ON sms_logs(phone_number);

CREATE INDEX IF NOT EXISTS idx_sms_logs_sms_type
  ON sms_logs(sms_type);

CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at
  ON sms_logs(sent_at);

CREATE INDEX IF NOT EXISTS idx_sms_logs_trip_id
  ON sms_logs(trip_id);

CREATE INDEX IF NOT EXISTS idx_sms_logs_status
  ON sms_logs(status);

CREATE INDEX IF NOT EXISTS idx_gps_locations_trip_id
  ON gps_locations(trip_id);

CREATE INDEX IF NOT EXISTS idx_gps_locations_recorded_at
  ON gps_locations(recorded_at);

CREATE INDEX IF NOT EXISTS idx_gps_locations_source
  ON gps_locations(source);

CREATE INDEX IF NOT EXISTS idx_hardware_status_component
  ON hardware_status(component);

CREATE INDEX IF NOT EXISTS idx_hardware_status_last_check
  ON hardware_status(last_check);

-- Hardware integration views - Admin focused for monitoring dashboards
CREATE OR REPLACE VIEW trip_statistics AS
SELECT
  trip_id,
  COUNT(*) as total_recordings,
  AVG(count) as average_passengers,
  MAX(count) as max_passengers,
  MIN(count) as min_passengers,
  MIN(recorded_at) as first_recording,
  MAX(recorded_at) as last_recording
FROM passenger_counts
GROUP BY trip_id;

CREATE OR REPLACE VIEW sms_statistics AS
SELECT
  DATE(sent_at) as date,
  sms_type,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE status = 'sent') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'pending') as pending
FROM sms_logs
GROUP BY DATE(sent_at), sms_type
ORDER BY date DESC, sms_type;

CREATE OR REPLACE VIEW emergency_statistics AS
SELECT
  COALESCE(DATE(triggered_at), DATE(created_at)) as date,
  COUNT(*) as total_emergencies,
  COUNT(*) FILTER (WHERE resolved = TRUE) as resolved,
  COUNT(*) FILTER (WHERE resolved = FALSE) as unresolved,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged
FROM emergency_alerts
GROUP BY COALESCE(DATE(triggered_at), DATE(created_at))
ORDER BY date DESC;

CREATE OR REPLACE VIEW gps_statistics AS
SELECT
  DATE(recorded_at) as date,
  source,
  COUNT(*) as total_readings,
  AVG(accuracy) as avg_accuracy,
  AVG(speed) as avg_speed,
  MAX(accuracy) as worst_accuracy,
  MIN(accuracy) as best_accuracy
FROM gps_locations
GROUP BY DATE(recorded_at), source
ORDER BY date DESC, source;

CREATE OR REPLACE VIEW video_statistics AS
SELECT
  DATE(recorded_at) as date,
  storage_type,
  format,
  COUNT(*) as total_recordings,
  SUM(file_size) as total_storage_bytes,
  AVG(duration) as avg_duration_seconds,
  MAX(duration) as max_duration_seconds,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'recording') as recording
FROM video_recordings
GROUP BY DATE(recorded_at), storage_type, format
ORDER BY date DESC, storage_type, format;

CREATE INDEX IF NOT EXISTS idx_gcash_transactions_created_at
  ON gcash_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gcash_transactions_status
  ON gcash_transactions(status);

CREATE INDEX IF NOT EXISTS idx_gcash_transactions_phone_number
  ON gcash_transactions(phone_number);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_read
  ON notifications(read);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_username
  ON audit_logs(username);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_fare_matrix_route
  ON fare_matrix(route_from, route_to);

CREATE INDEX IF NOT EXISTS idx_baggage_fee_matrix_category
  ON baggage_fee_matrix(category);

CREATE INDEX IF NOT EXISTS idx_bus_schedules_bus_day
  ON bus_schedules(bus_id, day_number);

CREATE INDEX IF NOT EXISTS idx_bus_schedules_day_trip
  ON bus_schedules(day_number, trip_number);

CREATE INDEX IF NOT EXISTS idx_video_recordings_trip_id
  ON video_recordings(trip_id);

CREATE INDEX IF NOT EXISTS idx_video_recordings_recorded_at
  ON video_recordings(recorded_at);

CREATE INDEX IF NOT EXISTS idx_video_recordings_status
  ON video_recordings(status);

CREATE INDEX IF NOT EXISTS idx_trip_schedules_trip_number
  ON trip_schedules(trip_number);

-- ── 26. Realtime Publications ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'passenger_counts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE passenger_counts;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'fare_irregularities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fare_irregularities;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emergency_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'trips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trips;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'boarded_passengers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE boarded_passengers;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emergency_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_contacts;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sms_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sms_logs;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'gps_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gps_locations;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'hardware_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hardware_status;
  END IF;
END $$;

-- ============================================================
-- Schema complete.
-- ============================================================

-- ── 27. Seed: Test Bus Data ───────────────────────────────────────────────────
INSERT INTO buses (plate_number, bus_number, route, seat_capacity, status) VALUES
  ('BUS-001', 1001, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-002', 1002, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-003', 1003, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-004', 1004, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-005', 1005, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-006', 1006, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-007', 1007, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-008', 1008, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-009', 1009, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active'),
  ('BUS-010', 1010, 'Manalo Fortich Terminal ↔ Agora Terminal', 35, 'active')
ON CONFLICT (plate_number) DO UPDATE SET
  bus_number = EXCLUDED.bus_number,
  route = EXCLUDED.route,
  seat_capacity = EXCLUDED.seat_capacity,
  status = EXCLUDED.status;

-- ── 28. Seed: Fare Matrix Data ─────────────────────────────────────────────────
INSERT INTO fare_matrix (route_from, route_to, km_distance, regular_fare, discounted_fare) VALUES
  ('Agora Terminal', 'Puerto', 13, 34.75, 27.75),
  ('Agora Terminal', 'Ba-e', 16, 41.50, 33.00),
  ('Agora Terminal', 'Mambatangan', 20, 50.25, 40.25),
  ('Agora Terminal', 'Maitom', 24, 59.00, 47.25),
  ('Agora Terminal', 'Ala-e', 26, 63.50, 50.75),
  ('Agora Terminal', 'Lonocan', 27, 65.50, 52.50),
  ('Agora Terminal', 'San Miguel', 31, 74.50, 59.50),
  ('Agora Terminal', 'Diclum', 35, 83.25, 66.50),
  ('Agora Terminal', 'Manolo Fortich', 36, 85.50, 68.25),
  ('Puerto', 'Agora Terminal', 13, 34.75, 27.75),
  ('Ba-e', 'Agora Terminal', 16, 41.50, 33.00),
  ('Mambatangan', 'Agora Terminal', 20, 50.25, 40.25),
  ('Maitom', 'Agora Terminal', 24, 59.00, 47.25),
  ('Ala-e', 'Agora Terminal', 26, 63.50, 50.75),
  ('Lonocan', 'Agora Terminal', 27, 65.50, 52.50),
  ('San Miguel', 'Agora Terminal', 31, 74.50, 59.50),
  ('Diclum', 'Agora Terminal', 35, 83.25, 66.50),
  ('Manolo Fortich', 'Agora Terminal', 36, 85.50, 68.25)
ON CONFLICT (route_from, route_to) DO NOTHING;

-- ── 28.1. Seed: Baggage Fee Matrix Data ─────────────────────────────────────────────
INSERT INTO baggage_fee_matrix (category, max_weight_kg, fee, remarks) VALUES
  ('Free Carry-on', 7, 0, 'Included in passenger fare'),
  ('Small', 10, 20, 'Fits under seat or overhead area'),
  ('Medium', 20, 40, 'Stored in baggage compartment'),
  ('Large', 30, 60, 'Requires larger storage space'),
  ('Oversized', 31, 100, 'Subject to conductor approval')
ON CONFLICT DO NOTHING;

-- ── 29. Seed: Trip Schedule Data ─────────────────────────────────────────────────
INSERT INTO trip_schedules (trip_number, arrival_time_start, arrival_time_end, departure_time_start, departure_time_end) VALUES
  (1, '04:15:00', '04:25:00', '04:30:00', '04:30:00')
ON CONFLICT (trip_number) DO NOTHING;

-- ── 30. Seed: Bus Schedule Data ───────────────────────────────────────────────────
-- Get bus IDs for scheduling
DO $$
DECLARE
  bus_1001_id UUID;
BEGIN
  SELECT id INTO bus_1001_id FROM buses WHERE bus_number = 1001;

  -- Insert bus schedules for Day 1
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 1, 9)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 2
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 2, 8)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 3
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 3, 7)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 4
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 4, 6)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 5
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 5, 5)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 6
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 6, 4)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 7
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 7, 3)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 8
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 8, 2)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 9
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
    (bus_1001_id, 9, 1)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;

  -- Insert bus schedules for Day 10
  INSERT INTO bus_schedules (bus_id, day_number, trip_number) VALUES
     (bus_1001_id, 10, 10)
  ON CONFLICT (bus_id, day_number, trip_number) DO NOTHING;
END $$;

-- ── 31. Seed: Staff Users ───────────────────────────────────────────────────────
-- Note: These INSERT statements should be run after creating the auth users in Supabase Dashboard
-- First, create the auth users, then use their UUIDs in these INSERT statements
-- IMPORTANT: Make sure the staff_role enum includes 'operator' before running this

-- Get the first bus ID for conductor assignment
DO $$
DECLARE
  conductor_bus_id UUID;
BEGIN
  SELECT id INTO conductor_bus_id FROM buses WHERE bus_number = 1001 LIMIT 1;
  
  -- Check if operator role exists in enum
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'operator' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'staff_role')) THEN
    RAISE NOTICE 'operator role not found in staff_role enum. Please add it manually.';
    -- Skip the operator user if the role doesn't exist
    INSERT INTO "public"."staff_users" ("id", "full_name", "email", "role", "is_active", "created_at", "bus_id") VALUES 
    ('1654f098-c2b0-4ab3-9f59-6cf6fb2fafba', 'Customer Service', 'admin@commutai.test', 'admin', true, '2026-08-06 03:02:29.393078+00', null),
    ('902d50ff-a73b-49d7-86bb-5123b37cbc93', 'CS Desk Operator', 'csdesk@commutai.test', 'cs_desk', true, '2026-07-15 06:34:52.182164+00', null),
    ('a9237386-bd65-4a7d-9272-53869ce039e1', 'Conductor', 'conductor@commutai.test', 'conductor', true, '2026-07-14 13:47:51.245941+00', conductor_bus_id)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active,
      bus_id = EXCLUDED.bus_id;
  ELSE
    -- Insert all staff users including operator
    INSERT INTO "public"."staff_users" ("id", "full_name", "email", "role", "is_active", "created_at", "bus_id") VALUES 
    ('1654f098-c2b0-4ab3-9f59-6cf6fb2fafba', 'Customer Service', 'admin@commutai.test', 'admin', true, '2026-08-06 03:02:29.393078+00', null),
    ('8fddab1b-7ded-45e9-aab5-3f56ee50d5fc', 'System Operator', 'operator@commutai.test', 'operator', true, '2026-08-20 02:01:32.697754+00', null),
    ('902d50ff-a73b-49d7-86bb-5123b37cbc93', 'CS Desk Operator', 'csdesk@commutai.test', 'cs_desk', true, '2026-07-15 06:34:52.182164+00', null),
    ('a9237386-bd65-4a7d-9272-53869ce039e1', 'Conductor', 'conductor@commutai.test', 'conductor', true, '2026-07-14 13:47:51.245941+00', conductor_bus_id)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active,
      bus_id = EXCLUDED.bus_id;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error inserting staff users: %', SQLERRM;
END $$;

-- ── 31. Development Helper Functions ───────────────────────────────────────────
-- Function to create users directly bypassing email validation (for development/testing)
CREATE OR REPLACE FUNCTION create_user_direct(
  user_id UUID,
  user_email TEXT,
  user_password TEXT,
  user_full_name TEXT,
  user_role TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Insert into auth.users bypassing email validation
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  VALUES (
    user_id,
    user_email,
    crypt(user_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('full_name', user_full_name, 'role', user_role)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;
  
  -- Insert into staff_users
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  VALUES (
    user_id,
    user_full_name,
    user_email,
    user_role::staff_role,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;
    
  RETURN user_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in create_user_direct: %', SQLERRM;
    RAISE;
END;
$$;

-- ── 31.1. Fix Existing Auth Users Missing staff_users Records ───────────────────────
-- Run this to create staff_users records for existing auth users that are missing them
-- This is useful when users were created via auth but staff_users wasn't created

-- Fix the specific driver user you mentioned
INSERT INTO staff_users (id, full_name, email, role, is_active)
VALUES (
  '2c12d26a-efbd-463a-b060-32bf4de9afa7',
  'driver01',
  'driver@commutai.test',
  'driver',
  true
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role;

-- Generic function to fix all missing staff_users records
CREATE OR REPLACE FUNCTION fix_missing_staff_users()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  SELECT 
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
    u.email,
    COALESCE((u.raw_user_meta_data->>'role')::staff_role, 'conductor'),
    true
  FROM auth.users u
  LEFT JOIN staff_users s ON u.id = s.id
  WHERE s.id IS NULL;
  
  GET DIAGNOSTICS user_count = ROW_COUNT;
  RETURN user_count;
END;
$$;

-- Run this to fix all missing records
-- SELECT fix_missing_staff_users();

-- ── 31.2. Create Admin Test User Instructions ─────────────────────────────────────
-- To create test users, follow these steps in the Supabase Dashboard:
--
-- 1. Go to Supabase Dashboard → Authentication → Users → Add user
-- 2. Email: admin@commutai.test  Password: Admin123!  Auto-confirm: Yes
-- 3. Copy the user UUID from the users table, then run:
--
--    INSERT INTO staff_users (id, full_name, email, role, is_active)
--    VALUES (
--      '<paste-uuid-here>',
--      'System Admin',
--      'admin@commutai.test',
--      'admin',
--      true
--    );
--
-- 4. Repeat for conductor:
--    Email: conductor@commutai.test  Password: Conductor123!
--    Role: conductor
--
-- 5. Repeat for CS Desk:
--    Email: csdesk@commutai.test  Password: CSDesk123!
--    Role: cs_desk

-- ── 32. Admin Monitoring & Analytics Queries ──────────────────────────────────────
-- These queries are focused on admin dashboard functionality and system monitoring

-- ── 32.1. Real-time System Status Overview ────────────────────────────────────────
-- Get current system status for admin dashboard
CREATE OR REPLACE FUNCTION admin_system_status()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
SELECT jsonb_build_object(
  'timestamp', NOW(),
  'active_trips', (SELECT COUNT(*) FROM trips WHERE status = 'in_progress'),
  'active_emergencies', (SELECT COUNT(*) FROM emergency_alerts WHERE resolved = FALSE),
  'total_staff', (SELECT COUNT(*) FROM staff_users WHERE is_active = TRUE),
  'active_buses', (SELECT COUNT(*) FROM buses WHERE status = 'active'),
  'today_sms', (SELECT COUNT(*) FROM sms_logs WHERE DATE(sent_at) = CURRENT_DATE),
  'today_gps_readings', (SELECT COUNT(*) FROM gps_locations WHERE DATE(recorded_at) = CURRENT_DATE),
  'hardware_status', (
    SELECT jsonb_agg(jsonb_build_object(
      'component', component,
      'status', status,
      'last_check', last_check
    ))
    FROM hardware_status
    WHERE last_check > NOW() - INTERVAL '1 hour'
  )
);
$$;

-- ── 32.2. Trip Performance Analytics ───────────────────────────────────────────────
-- Get detailed trip analytics for admin monitoring
CREATE OR REPLACE FUNCTION admin_trip_analytics(days_range INTEGER DEFAULT 7)
RETURNS TABLE (
  trip_date DATE,
  total_trips BIGINT,
  completed_trips BIGINT,
  cancelled_trips BIGINT,
  avg_passengers NUMERIC,
  total_revenue NUMERIC,
  avg_trip_duration NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(t.started_at) as trip_date,
    COUNT(*) as total_trips,
    COUNT(*) FILTER (WHERE t.status = 'completed') as completed_trips,
    COUNT(*) FILTER (WHERE t.status = 'cancelled') as cancelled_trips,
    COALESCE(AVG(pc.average_passengers), 0) as avg_passengers,
    COALESCE(SUM(tr.amount), 0) as total_revenue,
    COALESCE(AVG(EXTRACT(EPOCH FROM (t.ended_at - t.started_at))/3600), 0) as avg_trip_duration
  FROM trips t
  LEFT JOIN trip_statistics pc ON t.id = pc.trip_id
  LEFT JOIN transactions tr ON tr.trip_id = t.id
  WHERE t.started_at >= CURRENT_DATE - (days_range || ' days')::INTERVAL
  GROUP BY DATE(t.started_at)
  ORDER BY trip_date DESC;
END;
$$;

-- ── 32.3. Emergency Response Analytics ────────────────────────────────────────────
-- Get emergency response metrics for admin monitoring
CREATE OR REPLACE FUNCTION admin_emergency_analytics(days_range INTEGER DEFAULT 30)
RETURNS TABLE (
  emergency_date DATE,
  total_emergencies BIGINT,
  resolved_emergencies BIGINT,
  avg_response_time NUMERIC,
  critical_emergencies BIGINT,
  by_emergency_type JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(ea.triggered_at) as emergency_date,
    COUNT(*) as total_emergencies,
    COUNT(*) FILTER (WHERE ea.resolved = TRUE) as resolved_emergencies,
    COALESCE(AVG(EXTRACT(EPOCH FROM (ea.resolved_at - ea.triggered_at))/60), 0) as avg_response_time,
    COUNT(*) FILTER (WHERE ea.status = 'active' AND ea.triggered_at < NOW() - INTERVAL '1 hour') as critical_emergencies,
    jsonb_build_object(
      'active', COUNT(*) FILTER (WHERE ea.status = 'active'),
      'acknowledged', COUNT(*) FILTER (WHERE ea.status = 'acknowledged'),
      'resolved', COUNT(*) FILTER (WHERE ea.status = 'resolved')
    ) as by_emergency_type
  FROM emergency_alerts ea
  WHERE ea.triggered_at >= CURRENT_DATE - (days_range || ' days')::INTERVAL
  GROUP BY DATE(ea.triggered_at)
  ORDER BY emergency_date DESC;
END;
$$;

-- ── 32.4. Hardware Health Monitoring ───────────────────────────────────────────────
-- Get hardware component health status for admin monitoring
CREATE OR REPLACE FUNCTION admin_hardware_health()
RETURNS TABLE (
  component TEXT,
  current_status TEXT,
  uptime_percentage NUMERIC,
  last_check TIMESTAMPTZ,
  issues_count BIGINT,
  avg_response_time NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    hs.component,
    hs.status as current_status,
    CASE
      WHEN hs.status = 'online' THEN 100.0
      WHEN hs.status = 'offline' THEN 0.0
      ELSE 50.0
    END as uptime_percentage,
    hs.last_check,
    (SELECT COUNT(*) FROM hardware_status WHERE component = hs.component AND status = 'error' AND last_check > NOW() - INTERVAL '24 hours') as issues_count,
    COALESCE(AVG(EXTRACT(EPOCH FROM (hs.last_check - LAG(hs.last_check) OVER (PARTITION BY hs.component ORDER BY hs.last_check)))), 0) as avg_response_time
  FROM hardware_status hs
  WHERE hs.last_check > NOW() - INTERVAL '24 hours'
  GROUP BY hs.component, hs.status, hs.last_check
  ORDER BY hs.component;
END;
$$;

-- ── 32.5. Video Storage Analytics ──────────────────────────────────────────────────
-- Get video storage analytics for admin monitoring
CREATE OR REPLACE FUNCTION admin_video_analytics(days_range INTEGER DEFAULT 30)
RETURNS TABLE (
  recording_date DATE,
  total_recordings BIGINT,
  total_storage_gb NUMERIC,
  avg_duration_seconds NUMERIC,
  storage_by_type JSONB,
  recording_success_rate NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(vr.recorded_at) as recording_date,
    COUNT(*) as total_recordings,
    COALESCE(SUM(vr.file_size) / 1024.0 / 1024.0 / 1024.0, 0) as total_storage_gb,
    COALESCE(AVG(vr.duration), 0) as avg_duration_seconds,
    jsonb_build_object(
      'local', COUNT(*) FILTER (WHERE vr.storage_type = 'local'),
      'cloud', COUNT(*) FILTER (WHERE vr.storage_type = 'cloud'),
      'supabase_storage', COUNT(*) FILTER (WHERE vr.storage_type = 'supabase_storage')
    ) as storage_by_type,
    CASE
      WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE vr.status = 'completed')::NUMERIC / COUNT(*) * 100)
      ELSE 0
    END as recording_success_rate
  FROM video_recordings vr
  WHERE vr.recorded_at >= CURRENT_DATE - (days_range || ' days')::INTERVAL
  GROUP BY DATE(vr.recorded_at)
  ORDER BY recording_date DESC;
END;
$$;

-- ── 32.6. SMS Performance Analytics ────────────────────────────────────────────────
-- Get SMS delivery performance for admin monitoring
CREATE OR REPLACE FUNCTION admin_sms_analytics(days_range INTEGER DEFAULT 30)
RETURNS TABLE (
  sms_date DATE,
  total_sent BIGINT,
  successful_deliveries BIGINT,
  failed_deliveries BIGINT,
  delivery_rate NUMERIC,
  avg_delivery_time NUMERIC,
  by_type JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(sl.sent_at) as sms_date,
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE sl.status = 'sent') as successful_deliveries,
    COUNT(*) FILTER (WHERE sl.status = 'failed') as failed_deliveries,
    CASE
      WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE sl.status = 'sent')::NUMERIC / COUNT(*) * 100)
      ELSE 0
    END as delivery_rate,
    0 as avg_delivery_time, -- Would need actual delivery timestamps
    jsonb_build_object(
      'transaction', COUNT(*) FILTER (WHERE sl.sms_type = 'transaction'),
      'topup', COUNT(*) FILTER (WHERE sl.sms_type = 'topup'),
      'reload', COUNT(*) FILTER (WHERE sl.sms_type = 'reload'),
      'trip', COUNT(*) FILTER (WHERE sl.sms_type = 'trip'),
      'emergency', COUNT(*) FILTER (WHERE sl.sms_type = 'emergency')
    ) as by_type
  FROM sms_logs sl
  WHERE sl.sent_at >= CURRENT_DATE - (days_range || ' days')::INTERVAL
  GROUP BY DATE(sl.sent_at)
  ORDER BY sms_date DESC;
END;
$$;

-- ── 32.7. Staff Activity Monitoring ───────────────────────────────────────────────
-- Get staff activity metrics for admin monitoring
CREATE OR REPLACE FUNCTION admin_staff_activity(days_range INTEGER DEFAULT 7)
RETURNS TABLE (
  staff_name TEXT,
  role TEXT,
  trips_conducted BIGINT,
  transactions_processed BIGINT,
  emergencies_resolved BIGINT,
  last_activity TIMESTAMPTZ,
  activity_score NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    su.full_name as staff_name,
    su.role::TEXT,
    COUNT(DISTINCT t.id) FILTER (WHERE t.conductor_id = su.id) as trips_conducted,
    COUNT(DISTINCT tr.id) FILTER (WHERE tr.staff_id = su.id) as transactions_processed,
    COUNT(DISTINCT ea.id) FILTER (WHERE ea.resolved_by = su.id) as emergencies_resolved,
    GREATEST(
      COALESCE(MAX(t.started_at) FILTER (WHERE t.conductor_id = su.id), '1970-01-01'::TIMESTAMPTZ),
      COALESCE(MAX(tr.created_at) FILTER (WHERE tr.staff_id = su.id), '1970-01-01'::TIMESTAMPTZ),
      COALESCE(MAX(ea.resolved_at) FILTER (WHERE ea.resolved_by = su.id), '1970-01-01'::TIMESTAMPTZ)
    ) as last_activity,
    (
      (COUNT(DISTINCT t.id) FILTER (WHERE t.conductor_id = su.id) * 10) +
      (COUNT(DISTINCT tr.id) FILTER (WHERE tr.staff_id = su.id) * 5) +
      (COUNT(DISTINCT ea.id) FILTER (WHERE ea.resolved_by = su.id) * 20)
    ) as activity_score
  FROM staff_users su
  LEFT JOIN trips t ON t.conductor_id = su.id AND t.started_at >= CURRENT_DATE - (days_range || ' days')::INTERVAL
  LEFT JOIN transactions tr ON tr.staff_id = su.id AND tr.created_at >= CURRENT_DATE - (days_range || ' days')::INTERVAL
  LEFT JOIN emergency_alerts ea ON ea.resolved_by = su.id AND ea.resolved_at >= CURRENT_DATE - (days_range || ' days')::INTERVAL
  WHERE su.is_active = TRUE
  GROUP BY su.id, su.full_name, su.role
  ORDER BY activity_score DESC;
END;
$$;
