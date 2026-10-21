#!/usr/bin/env python3
"""
GPS-Only Server
Sends GPS data to backend independently without camera
GPS will work even if camera is disconnected
"""

import json
import time
import asyncio
import websockets
import os
import socket
import httpx
from dotenv import load_dotenv
from hardware_integration import HardwareManager
from supabase import create_client, Client

load_dotenv()

def discover_backend_ip():
    """
    Auto-discover Windows backend IP address on the local network
    Returns the backend URL if found, None otherwise
    """
    # Check if BACKEND_URL is manually set in .env
    manual_backend = os.getenv('BACKEND_URL')
    if manual_backend and manual_backend != 'http://localhost:8000':
        print(f"[Discovery] Using manually configured backend: {manual_backend}")
        return manual_backend

    print("[Discovery] Auto-discovering backend on local network...")

    # Get local network interface
    try:
        # Get Pi's IP and network
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()

        # Extract network (e.g., 192.168.1.35 -> 192.168.1)
        network = '.'.join(local_ip.split('.')[:-1])
        print(f"[Discovery] Local IP: {local_ip}, Network: {network}")

        # Scan common IP range for port 8000
        for i in range(1, 255):
            target_ip = f"{network}.{i}"
            if target_ip == local_ip:
                continue

            try:
                # Quick port check for port 8000
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.1)
                result = sock.connect_ex((target_ip, 8000))
                sock.close()

                if result == 0:
                    # Verify it's actually our backend by checking health endpoint
                    try:
                        response = httpx.get(f"http://{target_ip}:8000/health", timeout=1.0)
                        if response.status_code == 200:
                            backend_url = f"http://{target_ip}:8000"
                            print(f"[Discovery] Found backend at: {backend_url}")
                            return backend_url
                    except:
                        continue

            except:
                continue

        print("[Discovery] Backend not found on local network")
        return None

    except Exception as e:
        print(f"[Discovery] Error during discovery: {e}")
        return None

# Backend configuration - auto-discover or use manual setting
BACKEND_URL = discover_backend_ip() or os.getenv('BACKEND_URL', 'http://localhost:8000')

# Bus configuration
BUS_NUMBER = int(os.getenv('BUS_NUMBER', '1'))
ASSIGNED_BUS_ID = os.getenv('ASSIGNED_BUS_ID')

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client initialized")
    except Exception as e:
        print(f"Failed to initialize Supabase: {e}")

# Hardware Manager configuration - GPS only
HARDWARE_CONFIG = {
    'enable_sms': False,  # Disable SMS for GPS-only mode
    'enable_gps': True,   # Enable GPS
    'enable_emergency_button': False,  # Disable emergency button
    'enable_geolocation': False,  # Disable geolocation (use GPS only)
    'neo6m_port': os.getenv('NEO6M_PORT', '/dev/ttyS0'),  # GPS on ttyS0
    'neo6m_baudrate': int(os.getenv('NEO6M_BAUDRATE', '9600')),
    'emergency_contacts': [],
    'admin_contacts': []
}

hardware_manager = None

# Callback to update current_location when GPS data is received
def gps_callback(location):
    """Callback function to receive GPS updates"""
    hardware_manager.current_location = location
    print(f"[GPS Callback] Received: {location.latitude:.6f}, {location.longitude:.6f}")

try:
    hardware_manager = HardwareManager(HARDWARE_CONFIG, db_client=supabase)
    if hardware_manager.initialize():
        print("✓ Hardware manager initialized (GPS only)")
        hardware_manager.start_gps_tracking(callback=gps_callback)
        print("✓ GPS tracking started with callback")
except Exception as e:
    print(f"✗ Hardware manager initialization error: {e}")
    print("GPS tracking will not be available")
    exit(1)

print(f"[GPS Only Mode] Backend URL: {BACKEND_URL}")
print(f"[GPS Only Mode] Bus Number: {BUS_NUMBER}")
print(f"[GPS Only Mode] GPS Port: {HARDWARE_CONFIG['neo6m_port']}")
print("")


async def send_gps_to_backend():
    """Send GPS data to backend continuously"""
    client_id = f"pi-{BUS_NUMBER}"
    backend_ws_url = BACKEND_URL.replace('http://', 'ws://') + '/ws/video-stream/' + client_id

    print(f"[GPS Upload] Connecting to backend: {backend_ws_url}")

    while True:
        try:
            if hardware_manager and hardware_manager.current_location:
                loc = hardware_manager.current_location
                gps_data = {
                    'latitude': loc.latitude,
                    'longitude': loc.longitude,
                    'altitude': loc.altitude,
                    'speed': loc.speed,
                    'accuracy': loc.accuracy,
                    'source': loc.source
                }

                message = {
                    'type': 'gps_update',
                    'gps': gps_data,
                    'bus_number': BUS_NUMBER,
                    'timestamp': time.time()
                }

                # Send GPS update
                async with websockets.connect(backend_ws_url) as ws:
                    await ws.send(json.dumps(message))
                    print(f"[GPS Upload] ✓ Sent GPS: {loc.latitude:.6f}, {loc.longitude:.6f} (alt: {loc.altitude}m, speed: {loc.speed}km/h)")
            else:
                print("[GPS Upload] ⏳ Waiting for GPS fix...")

        except Exception as e:
            print(f"[GPS Upload] ✗ Error: {e}")
            print(f"[GPS Upload] Retrying in 5 seconds...")

        # Send GPS every 5 seconds
        await asyncio.sleep(5)


async def main():
    """Main entry point - GPS only"""
    print("=" * 60)
    print("GPS-Only Server Started")
    print("=" * 60)
    print("GPS will send updates to backend every 5 seconds")
    print("Press Ctrl+C to stop")
    print("=" * 60)
    print()

    try:
        await send_gps_to_backend()
    except KeyboardInterrupt:
        print("\nShutting down GPS server...")
        if hardware_manager:
            hardware_manager.stop_gps_tracking()
        print("GPS server stopped")


if __name__ == "__main__":
    asyncio.run(main())
