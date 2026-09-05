# Video Monitoring Auto-Connect Setup Guide

## Problem: Video Monitoring Not Auto-Connecting

The video monitoring system has been upgraded to use **Supabase-based auto-discovery**. This requires proper setup of both the database and Raspberry Pi server.

## Solution Steps:

### 1. Set Up the Database Table

Run this SQL in your Supabase SQL Editor:
https://supabase.com/dashboard/project/eiajnmocwxarymfdabjv/sql

```sql
-- Create the pi_devices table
CREATE TABLE IF NOT EXISTS pi_devices (
  bus_number   INTEGER     PRIMARY KEY,
  bus_id       UUID        REFERENCES buses (id) ON DELETE SET NULL,
  ip_address   TEXT        NOT NULL,
  port         INTEGER     NOT NULL DEFAULT 5000,
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hostname     TEXT
);

-- Enable RLS + allow full access via service role key
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

-- Enable Realtime so the dashboard reacts instantly when Pi changes IP
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pi_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pi_devices;
  END IF;
END $$;

-- Seed with current hostname
INSERT INTO pi_devices (bus_number, ip_address, port)
VALUES (1, 'commutai.local', 5000)
ON CONFLICT (bus_number) DO UPDATE
  SET ip_address = EXCLUDED.ip_address,
      port       = EXCLUDED.port,
      last_seen  = NOW();
```

### 2. Start Raspberry Pi Server with Virtual Environment

Connect to your Raspberry Pi:

```bash
ssh chichi@commutai.local
cd raspberry-pi-server
```

Setup virtual environment:

```bash
# Make setup script executable
chmod +x setup_venv.sh

# Run the setup
./setup_venv.sh
```

Start the server:

```bash
# Activate virtual environment
source venv/bin/activate

# Start the server
python video_server_fastapi.py
```

### 3. Verify Auto-Discovery Works

Once the server is running, it will automatically:
- Register itself in the `pi_devices` table
- The frontend will discover it via Supabase
- Video monitoring will auto-connect

### 4. Troubleshooting

**If it still doesn't connect:**

1. **Check the fallback URL** - I've updated it to `commutai.local:5000` which should work
2. **Verify the Pi is reachable** - From your computer, run:
   ```bash
   curl http://commutai.local:5000/
   ```
3. **Check browser console** - Look for connection errors
4. **Manual IP fallback** - If needed, set `VITE_RASPBERRY_PI_URL` in your frontend `.env`

## How It Works:

1. **Raspberry Pi** → Registers its IP in Supabase `pi_devices` table on startup
2. **Frontend** → Queries `pi_devices` table to get the current Pi IP
3. **Auto-Connect** → Uses discovered IP to establish WebSocket connection
4. **Real-time Updates** → Supabase Realtime instantly updates when Pi changes IP

## Benefits:

- ✅ No hardcoded IP addresses needed
- ✅ Automatic reconnection when Pi changes network
- ✅ Real-time IP updates via Supabase
- ✅ Works with dynamic IP assignments