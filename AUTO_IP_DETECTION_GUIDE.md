# Auto IP Detection & Reconnection Guide

## How It Works

The system now automatically detects the Raspberry Pi's IP address from the database and reconnects seamlessly when the network changes.

## Architecture

```
Raspberry Pi (on any network)
    ↓
    Registers IP to Supabase (pi_devices table)
    ↓
    Dashboard watches for IP changes
    ↓
    Auto-reconnects to new IP automatically
    ↓
    Video feed continues without interruption
```

## Key Features

### 1. Auto-Discovery
- The Pi registers its IP in the `pi_devices` table in Supabase
- Dashboard checks this table every 10 seconds
- Automatically switches to the new IP when detected

### 2. Real-time IP Change Detection
- Uses Supabase Realtime to watch `pi_devices` table
- When Pi's IP changes (e.g., WiFi to cellular), Dashboard gets notified
- Automatically disconnects old connection and reconnects to new IP
- Takes 2 seconds to ensure Pi is ready at new IP

### 3. Hybrid Fallback Mode
- If Pi is unreachable (network down, etc.), switches to database mode
- All data (passenger counts, GPS, status) still available via database
- Video temporarily unavailable, but system continues to work
- Auto-switches back to WebSocket when Pi becomes reachable again

### 4. Seamless Reconnection
- No manual intervention needed
- Video feed continues with minimal interruption (2-3 seconds)
- All other data (KPIs, map, status) remains available via database

## Raspberry Pi Setup

Your Pi needs to register its IP in the database. Add this to your Pi code:

```python
import requests
import time

# Supabase configuration
SUPABASE_URL = "https://iyacktzzktwrpeibcena.supabase.co"
SUPABASE_KEY = "YOUR_ANON_KEY"  # Use the anon key from .env
BUS_NUMBER = 1

def register_pi_ip():
    """Register Pi's current IP in Supabase"""
    try:
        # Get current IP
        ip_response = requests.get('https://api.ipify.org')
        current_ip = ip_response.text
        
        # Register in Supabase
        headers = {
            'apikey': SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {SUPABASE_KEY}'
        }
        
        data = {
            bus_number: BUS_NUMBER,
            ip_address: current_ip,
            port: 5000,
            last_seen: time.strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # Try to update existing record
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/pi_devices?bus_number=eq.{BUS_NUMBER}",
            headers=headers
        )
        
        if response.json():
            # Update existing
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/pi_devices?bus_number=eq.{BUS_NUMBER}",
                headers=headers,
                json=data
            )
        else:
            # Insert new
            requests.post(
                f"{SUPABASE_URL}/rest/v1/pi_devices",
                headers=headers,
                json=data
            )
        
        print(f"Registered IP: {current_ip}")
    except Exception as e:
        print(f"Error registering IP: {e}")

# Run every 30 seconds
while True:
    register_pi_ip()
    time.sleep(30)
```

## Dashboard Behavior

### When Pi is reachable:
- **Green badge**: "WebSocket" - Direct connection, live video
- Video streaming works via WebSocket
- Lowest latency
- All data in real-time

### When Pi IP changes:
- Dashboard detects change via Supabase Realtime
- Auto-disconnects old connection
- Auto-reconnects to new IP (2-second delay)
- Video resumes automatically

### When Pi is unreachable:
- **Yellow badge**: "Database mode" - Using database as fallback
- Video temporarily unavailable
- All other data available via database (passenger counts, GPS, status)
- Auto-switches back to WebSocket when Pi returns

## Network Scenarios

### Scenario 1: Same network, stable IP
- Dashboard connects directly to Pi
- WebSocket mode (green badge)
- Live video streaming

### Scenario 2: Pi switches WiFi networks
- Pi registers new IP in database
- Dashboard detects change within 10 seconds
- Auto-reconnects to new IP
- Video continues with 2-second interruption

### Scenario 3: Pi goes offline (network down)
- Dashboard detects connection failure
- Switches to database mode (yellow badge)
- Video unavailable
- Data continues via database
- Auto-reconnects when Pi returns

### Scenario 4: Pi switches to cellular (mobile hotspot)
- Pi registers new cellular IP
- Dashboard detects change
- Auto-reconnects to cellular IP
- Video continues (may have higher latency)

## Configuration

### Pi Side (in .env or environment):
```env
VITE_RASPBERRY_PI_URL=http://192.168.1.45:5000  # Fallback IP
```

### Dashboard Side:
- Automatically uses database-discovered IP
- Falls back to fallback URL if database lookup fails
- Re-checks database every 10 seconds

## Benefits

✅ **No manual IP configuration needed**
✅ **Automatic reconnection on network changes**
✅ **Seamless video with minimal interruption**
✅ **Database fallback ensures system always works**
✅ **Works across WiFi, Ethernet, and cellular**
✅ **No firewall/VPN configuration needed**

## Troubleshooting

### Video not showing:
1. Check if Pi is reachable: `ping <Pi-IP>`
2. Check Pi video server is running: `curl http://<Pi-IP>:5000/health`
3. Check Dashboard shows green "WebSocket" badge
4. If yellow "Database mode", Pi is unreachable - check network

### Video interrupts frequently:
1. Pi's network is unstable
2. Pi keeps changing IP too frequently
3. Check Pi's network connection
4. Consider static IP for Pi

### Dashboard shows "Database mode" always:
1. Pi not registering IP in database
2. Pi unreachable from network
3. Check Pi code has IP registration
4. Check `pi_devices` table in Supabase

## Summary

The system now handles network changes automatically:
- Pi registers IP in database every 30 seconds
- Dashboard auto-detects IP changes
- Seamless reconnection without user intervention
- Database fallback ensures continuous operation
- Video feed continues with minimal interruption

**Result:** The camera feed will NOT be interrupted when the network changes, as long as the Pi can reach the internet to register its new IP.
