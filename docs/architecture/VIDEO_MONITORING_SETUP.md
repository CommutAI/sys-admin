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

### 2. Setup Raspberry Pi Server with Virtual Environment

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

### 3. Setup Automatic Startup (No Manual Configuration Required)

**IMPORTANT:** This step automates the entire environment setup. The server will now:
- Start automatically on boot
- Restart automatically if it crashes
- Re-register with Supabase when network changes
- No manual configuration needed when connecting to new networks

Copy the automation files to your Raspberry Pi:

```bash
# From your local machine (in the sys-admin directory)
scp commutai-pi-service.service chichi@commutai.local:/home/chichi/raspberry-pi-server/
scp commutai-network-handler.sh chichi@commutai.local:/home/chichi/raspberry-pi-server/
scp setup-automation.sh chichi@commutai.local:/home/chichi/raspberry-pi-server/
```

Then on the Raspberry Pi:

```bash
cd /home/chichi/raspberry-pi-server

# Run the automation setup (requires sudo)
sudo bash setup-automation.sh
```

This will:
- Install a systemd service that starts the server on boot
- Install a network dispatcher that restarts the server when network changes
- Enable and start the service immediately

### 4. Verify Auto-Discovery Works

Once the automation is complete, the server will automatically:
- Register itself in the `pi_devices` table on startup
- The frontend will discover it via Supabase
- Video monitoring will auto-connect
- Re-register with new IP when network changes

### 5. Troubleshooting

**If it still doesn't connect:**

1. **Check service status** on the Pi:
   ```bash
   sudo systemctl status commutai-pi-service
   ```

2. **View service logs**:
   ```bash
   sudo journalctl -u commutai-pi-service -f
   ```

3. **Check network handler logs**:
   ```bash
   cat /home/chichi/raspberry-pi-server/network-handler.log
   ```

4. **Verify the Pi is reachable** - From your computer, run:
   ```bash
   curl http://commutai.local:5000/
   ```

5. **Check browser console** - Look for connection errors

6. **Manual restart** if needed:
   ```bash
   sudo systemctl restart commutai-pi-service
   ```

## How It Works:

1. **Systemd Service** → Starts the video server automatically on boot
2. **Network Dispatcher** → Detects network changes and restarts the server to re-register
3. **Raspberry Pi** → Registers its IP in Supabase `pi_devices` table on startup
4. **Frontend** → Queries `pi_devices` table to get the current Pi IP
5. **Auto-Connect** → Uses discovered IP to establish WebSocket connection
6. **Real-time Updates** → Supabase Realtime instantly updates when Pi changes IP

## Benefits:

- ✅ **Fully automated** - No manual configuration needed
- ✅ **Auto-start on boot** - Server starts automatically when Pi powers on
- ✅ **Auto-reconnect on network change** - Works seamlessly when connecting to new networks
- ✅ **Auto-restart on crash** - Service restarts automatically if it fails
- ✅ **No hardcoded IP addresses** - Uses dynamic IP discovery
- ✅ **Real-time IP updates** - Supabase Realtime for instant updates
- ✅ **Works with dynamic IP assignments** - Handles DHCP and network changes

## Manual Server Start (Only for Testing)

If you need to start the server manually for testing (not recommended for production):

```bash
cd /home/chichi/raspberry-pi-server
source venv/bin/activate
python video_server_fastapi.py
```

**Note:** The automation setup makes manual starts unnecessary. The systemd service handles everything automatically.