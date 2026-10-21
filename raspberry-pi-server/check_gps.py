#!/usr/bin/env python3
"""
Quick GPS check - reads NMEA data for 10 seconds
"""

import serial
import time

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

            # Parse and display decimal coordinates
            parts = last_location.split(',')
            if '$GNGGA' in last_location and len(parts) > 6:
                lat_nmea = parts[2]
                lat_dir = parts[3]
                lon_nmea = parts[4]
                lon_dir = parts[5]

                lat_decimal = nmea_to_decimal(lat_nmea, lat_dir)
                lon_decimal = nmea_to_decimal(lon_nmea, lon_dir)

                print()
                print("   📍 Decimal Coordinates:")
                print(f"      Latitude:  {lat_decimal:.6f}° {lat_dir}")
                print(f"      Longitude: {lon_decimal:.6f}° {lon_dir}")
                print(f"      Altitude:  {parts[9]} meters")
                print(f"      Satellites: {parts[7]}")
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
