#!/usr/bin/env python3
"""
Quick GPS check - reads NMEA data for 10 seconds
"""

import serial
import time

def check_gps():
    print("=" * 60)
    print("🔍 GPS Check - Reading NMEA Data")
    print("=" * 60)
    print()

    port = '/dev/ttyS0'
    baudrate = 9600

    try:
        ser = serial.Serial(port, baudrate, timeout=1)
        print(f"✅ Connected to {port} @ {baudrate} baud")
        print(f"   Reading for 10 seconds...")
        print()
        print("-" * 60)

        count = 0
        start_time = time.time()
        last_location = None

        while time.time() - start_time < 10:
            try:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line and line.startswith('$'):
                    count += 1
                    print(f"[{count:2d}] {line}")

                    # Check for location data
                    if '$GNGGA' in line or '$GPRMC' in line:
                        parts = line.split(',')
                        if '$GNGGA' in line and len(parts) > 6:
                            # GNGGA: time, lat, lat_dir, lon, lon_dir, fix, sats
                            if parts[6] != '0':  # Has fix
                                last_location = line
                                print(f"       ⭐ LOCATION FIX DETECTED!")

            except:
                pass

        ser.close()
        print("-" * 60)
        print()
        print(f"📊 Total NMEA sentences: {count}")

        if last_location:
            print(f"✅ GPS has location fix!")
            print(f"   Last location: {last_location}")
        else:
            print(f"⚠️  No location fix yet")
            print(f"   GPS is working but needs outdoor signal/antenna")

    except Exception as e:
        print(f"❌ Error: {e}")
        print(f"   Check: ls -la {port}")
        print(f"   Check: sudo usermod -a -G dialout $USER")

    print()
    print("=" * 60)

if __name__ == "__main__":
    check_gps()
