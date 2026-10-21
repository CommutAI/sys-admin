#!/usr/bin/env python3
"""
Simple GPS-Only Server
Reads GPS directly from serial port and sends to backend
Works independently of camera and hardware integration
"""

import serial
import json
import time
import asyncio
import websockets
import os
import socket
import httpx
from dotenv import load_dotenv

load_dotenv()

def nmea_to_decimal(nmea_str, direction):
    """Convert NMEA coordinate to decimal degrees"""
    if not nmea_str:
        return 0.0

    # Determine degrees and minutes based on coordinate type
    if direction in ['N', 'S']:
        # Latitude: first 2 digits are degrees
        degrees = float(nmea_str[:2])
        minutes = float(nmea_str[2:])
    else:
        # Longitude: first 3 digits are degrees
        degrees = float(nmea_str[:3])
        minutes = float(nmea_str[3:])

    decimal = degrees + (minutes / 60.0)

    # Make negative if South or West
    if direction in ['S', 'W']:
        decimal = -decimal

    return decimal

def discover_backend_ip():
    """Auto-discover Windows backend IP address"""
    manual_backend = os.getenv('BACKEND_URL')
    if manual_backend and manual_backend != 'http://localhost:8000':
        print(f"[Discovery] Using manually configured backend: {manual_backend}")
        return manual_backend

    print("[Discovery] Auto-discovering backend on local network...")

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()

        network = '.'.join(local_ip.split('.')[:-1])
        print(f"[Discovery] Local IP: {local_ip}, Network: {network}")

        for i in range(1, 255):
            target_ip = f"{network}.{i}"
            if target_ip == local_ip:
                continue

            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.1)
                result = sock.connect_ex((target_ip, 8000))
                sock.close()

                if result == 0:
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
        print(f"[Discovery] Error: {e}")
        return None

# Configuration
BACKEND_URL = discover_backend_ip() or os.getenv('BACKEND_URL', 'http://localhost:8000')
BUS_NUMBER = int(os.getenv('BUS_NUMBER', '1'))
GPS_PORT = os.getenv('NEO6M_PORT', '/dev/ttyS0')
GPS_BAUDRATE = int(os.getenv('NEO6M_BAUDRATE', '9600'))

print(f"[Simple GPS] Backend URL: {BACKEND_URL}")
print(f"[Simple GPS] Bus Number: {BUS_NUMBER}")
print(f"[Simple GPS] GPS Port: {GPS_PORT}")
print()

# Connect to GPS
try:
    ser = serial.Serial(GPS_PORT, GPS_BAUDRATE, timeout=2)
    ser.reset_input_buffer()
    print(f"✓ Connected to GPS at {GPS_PORT}")
except Exception as e:
    print(f"✗ Failed to connect to GPS: {e}")
    exit(1)

async def send_gps_to_backend():
    """Read GPS and send to backend"""
    client_id = f"pi-{BUS_NUMBER}"
    backend_ws_url = BACKEND_URL.replace('http://', 'ws://') + '/ws/video-stream/' + client_id

    print(f"[GPS Upload] Connecting to backend: {backend_ws_url}")

    last_gps_data = None

    # Keep WebSocket connection open
    async with websockets.connect(backend_ws_url) as ws:
        print(f"[GPS Upload] Connected to backend")

        while True:
            try:
                # Read NMEA sentences for 2 seconds
                ser.reset_input_buffer()
                nmea_lines = []
                start_time = time.time()

                while time.time() - start_time < 2:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    if line and line.startswith('$'):
                        nmea_lines.append(line)

                # Parse GNGGA for location
                for line in nmea_lines:
                    if '$GNGGA' in line:
                        parts = line.split(',')
                        if len(parts) > 6 and parts[6] != '0':  # Has fix
                            lat_nmea = parts[2]
                            lat_dir = parts[3]
                            lon_nmea = parts[4]
                            lon_dir = parts[5]
                            altitude = parts[9] if len(parts) > 9 else '0'
                            satellites = parts[7] if len(parts) > 7 else '0'

                            lat_decimal = nmea_to_decimal(lat_nmea, lat_dir)
                            lon_decimal = nmea_to_decimal(lon_nmea, lon_dir)

                            gps_data = {
                                'latitude': lat_decimal,
                                'longitude': lon_decimal,
                                'altitude': float(altitude) if altitude else 0.0,
                                'speed': 0.0,
                                'accuracy': 10.0,
                                'source': 'gps'
                            }

                            # Only send if location changed significantly
                            if last_gps_data is None or \
                               abs(gps_data['latitude'] - last_gps_data['latitude']) > 0.0001 or \
                               abs(gps_data['longitude'] - last_gps_data['longitude']) > 0.0001:

                                message = {
                                    'type': 'gps_update',
                                    'gps': gps_data,
                                    'bus_number': BUS_NUMBER,
                                    'timestamp': time.time()
                                }

                                await ws.send(json.dumps(message))
                                print(f"[GPS Upload] ✓ Sent: {lat_decimal:.6f}, {lon_decimal:.6f} (sat: {satellites}, alt: {altitude}m)")

                                last_gps_data = gps_data
                                break

            except Exception as e:
                print(f"[GPS Upload] ✗ Error: {e}")

            # Send GPS every 5 seconds
            await asyncio.sleep(5)


async def main():
    """Main entry point"""
    print("=" * 60)
    print("Simple GPS-Only Server Started")
    print("=" * 60)
    print("Reading GPS from serial port and sending to backend")
    print("Press Ctrl+C to stop")
    print("=" * 60)
    print()

    try:
        await send_gps_to_backend()
    except KeyboardInterrupt:
        print("\nShutting down...")
        ser.close()
        print("GPS server stopped")


if __name__ == "__main__":
    asyncio.run(main())
