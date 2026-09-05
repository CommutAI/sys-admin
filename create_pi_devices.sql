-- ============================================================
-- Run this ONCE in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/eiajnmocwxarymfdabjv/sql
-- ============================================================

-- 1. Create the pi_devices table
CREATE TABLE IF NOT EXISTS pi_devices (
  bus_number   INTEGER     PRIMARY KEY,
  bus_id       UUID        REFERENCES buses (id) ON DELETE SET NULL,
  ip_address   TEXT        NOT NULL,
  port         INTEGER     NOT NULL DEFAULT 5000,
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hostname     TEXT
);

-- 2. Enable RLS + allow full access via service role key
ALTER TABLE pi_devices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pi_devices'
      AND policyname = 'pi_devices_service_role'
  ) THEN
    CREATE POLICY "pi_devices_service_role"
      ON pi_devices FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 3. Enable Realtime so the dashboard reacts instantly when Pi changes IP
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pi_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pi_devices;
  END IF;
END $$;

-- 4. Seed with current IP (update 192.168.1.45 if your Pi has a different IP right now)
INSERT INTO pi_devices (bus_number, ip_address, port)
VALUES (1, '192.168.1.45', 5000)
ON CONFLICT (bus_number) DO UPDATE
  SET ip_address = EXCLUDED.ip_address,
      port       = EXCLUDED.port,
      last_seen  = NOW();
