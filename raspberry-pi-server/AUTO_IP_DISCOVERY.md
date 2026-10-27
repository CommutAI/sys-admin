# Automatic IP Discovery System

## Overview

The bus monitoring system uses a **fully automatic IP discovery mechanism** that eliminates the need for hardcoded IP addresses. This makes the system resilient to network changes (DHCP re-leases, WiFi reconnection, etc.) and much easier to set up.

## How It Works

### 1. Raspberry Pi Auto-Registration

When the video server starts, it automatically:

1. **Detects its own LAN IP** - Uses the network interface that can reach the internet
2. **Registers to Supabase** - Upserts the IP to the `pi_devices` table
3. **Updates every 30 seconds** - Keeps the IP current even after network changes

```python
# From video_server_fastapi.py
def register_device():
    """Upsert this Pi's current LAN IP into pi_devices"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
    finally:
        s.close()

    supabase.table("pi_devices").upsert({
        "bus_number": BUS_NUMBER,
        "bus_id": ASSIGNED_BUS_ID,
        "ip_address": lan_ip,
        "port": server_port,
        "last_seen": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "hostname": hostname,
    }, on_conflict="bus_number").execute()
```

### 2. Dashboard Auto-Discovery

The dashboard (`useRaspberryPi` hook) automatically:

1. **Queries Supabase** - Reads the Pi's IP from `pi_devices` table
2. **Connects via WebSocket** - Uses the auto-discovered IP
3. **Monitors for changes** - Subscribes to `pi_devices` changes for reconnection

```javascript
// From useRaspberryPi.js
const { resolvePiUrl } = await import('../services/raspberryPiApi');
httpBase = await resolvePiUrl();  // Auto-discover from Supabase
wsUrl = httpBase.replace(/^http/, 'ws').replace(/\/?$/, '/ws');
```

### 3. Backend Auto-Discovery (Optional)

For stream-only mode, the system can:

1. **Auto-discover backend IP** - Scan common network ranges
2. **Fallback to manual config** - Use `BACKEND_URL` from `.env` if auto-discovery fails
3. **Support both modes** - `BACKEND_URL=auto` for auto, or manual IP for fixed setup

## Database Schema

### `pi_devices` Table

```sql
CREATE TABLE pi_devices (
  bus_number INTEGER PRIMARY KEY,
  bus_id UUID REFERENCES buses(id),
  ip_address VARCHAR(45),  -- IPv4 or IPv6
  port INTEGER DEFAULT 5000,
  last_seen TIMESTAMP WITH TIME ZONE,
  hostname VARCHAR(255)
);
```

## Benefits

### ✅ No Hardcoded IPs
- Pi IP changes automatically reflected in dashboard
- DHCP re-leases don't break the system
- WiFi reconnection handled seamlessly

### ✅ Network Independence
- Works on any network (192.168.x.x, 10.x.x.x, etc.)
- No need to know network configuration in advance
- Supports dynamic IP assignments

### ✅ Fault Tolerance
- Dashboard falls back to database mode if Pi is offline
- Pi re-registers automatically after network outage
- No manual intervention needed

### ✅ Scalability
- Easy to add multiple buses to the system
- Each Pi auto-registers independently
- Central management via Supabase

## Configuration

### Environment Variables

```env
# Supabase (required for auto-discovery)
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Bus number (identifies this Pi in pi_devices)
BUS_NUMBER=1

# Backend URL (for stream-only mode)
# Option 1: Auto-discovery (recommended)
BACKEND_URL=auto
# Option 2: Manual (if auto-discovery fails)
BACKEND_URL=http://localhost:8000
```

### When to Use Manual IP Configuration

Only use manual IP configuration if:

1. **Development/Testing** - Local development with fixed network
2. **Auto-discovery fails** - Network segmentation prevents discovery
3. **Special network setup** - VPN, custom routing, etc.

For production, always use auto-discovery.

## Troubleshooting

### Dashboard Can't Find Pi

1. **Check Pi is running:**
   ```bash
   sudo systemctl status video-server.service
   ```

2. **Check Supabase pi_devices table:**
   ```sql
   SELECT * FROM pi_devices WHERE bus_number = 1;
   ```

3. **Verify Pi is registering:**
   ```bash
   sudo journalctl -u video-server.service -f | grep "Registered"
   ```

4. **Check network connectivity:**
   - Pi can reach Supabase (internet access)
   - Dashboard can reach Supabase
   - Pi and Dashboard are on same network (for direct connection)

### Pi IP Not Updating

1. **Check registration interval:**
   - Should update every 30 seconds
   - Check `periodic_register()` is running

2. **Network changes not detected:**
   - Pi may need to restart service after major network change
   - Or wait for next 30-second registration cycle

3. **Database write permission:**
   - Ensure Supabase key has write access to `pi_devices`

### Backend Auto-Discovery Fails

1. **Check network range:**
   - Backend must be on same network as Pi
   - Or within discoverable range

2. **Use manual configuration:**
   ```env
   BACKEND_URL=http://actual_backend_ip:8000
   ```

3. **Check firewall:**
   - Backend port 8000 must be accessible from Pi
   - Windows Firewall may block connections

## Migration from Hardcoded IPs

If you have existing hardcoded IPs:

1. **Remove hardcoded IPs from code:**
   - Dashboard: Already using `useRaspberryPi` with auto-discovery
   - Video server: Already using `register_device()`
   - Services: Remove any `http://192.168.x.x` references

2. **Update environment files:**
   - Set `BACKEND_URL=auto` (or remove for default)
   - Ensure `SUPABASE_URL` and `SUPABASE_KEY` are set

3. **Test auto-discovery:**
   - Restart video server
   - Check `pi_devices` table for registration
   - Open dashboard and verify auto-connection

4. **Remove IP documentation:**
   - Update READMEs to mention auto-discovery
   - Remove IP examples from setup guides
   - Keep manual IP as fallback option only

## Summary

The auto-discovery system provides:

- ✅ **Zero-configuration** - No manual IP entry needed
- ✅ **Dynamic adaptation** - Handles network changes automatically
- ✅ **Centralized management** - All Pi IPs in one database table
- ✅ **Fault tolerance** - Fallback modes for when auto-discovery fails
- ✅ **Scalability** - Easy to add/remove buses

This is the recommended configuration for production deployments.
