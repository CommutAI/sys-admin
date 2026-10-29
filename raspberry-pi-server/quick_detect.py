#!/usr/bin/env python3
"""
Quick UART device detection without pyserial dependency
Uses direct system calls to list serial ports
"""

import os
import subprocess

def find_serial_devices():
    """Find all serial device files"""
    devices = []
    
    # Check common serial device patterns
    patterns = ['/dev/ttyUSB*', '/dev/ttyACM*', '/dev/ttyS*']
    
    for pattern in patterns:
        try:
            result = subprocess.run(['ls', pattern], capture_output=True, text=True)
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line:
                        devices.append(line)
        except:
            pass
    
    return devices

def test_port_with_cat(port, timeout=2):
    """Try to read data from a port"""
    try:
        # Use timeout with cat
        result = subprocess.run(
            ['timeout', str(timeout), 'cat', port],
            capture_output=True,
            text=True,
            timeout=timeout + 1
        )
        data = result.stdout
        return data
    except:
        return None

def main():
    print("=" * 60)
    print("🔧 UART Hardware Detection for GPS and SIM900A")
    print("=" * 60)
    print()
    
    devices = find_serial_devices()
    
    if not devices:
        print("❌ No serial devices found!")
        print()
        print("💡 Tips:")
        print("  - Make sure your TTL UART adapter is connected via USB")
        print("  - Check if the adapter is powered (LED on)")
        print("  - Try: lsusb to see connected USB devices")
        return
    
    print(f"📡 Found {len(devices)} serial device(s):")
    for i, dev in enumerate(devices, 1):
        print(f"  {i}. {dev}")
    print()
    
    print("🔍 Testing each port for GPS NMEA data...")
    print()
    
    for dev in devices:
        print(f"--- Testing {dev} ---")
        data = test_port_with_cat(dev, timeout=1)
        
        if data:
            # Check for NMEA sentences
            nmea_keywords = ['$GPGGA', '$GPRMC', '$GPGSA', '$GPGSV', '$GPGLL']
            found = [k for k in nmea_keywords if k in data]
            
            if found:
                print(f"✅ GPS detected on {dev}!")
                print(f"   NMEA sentences: {found}")
                print(f"   Sample: {data[:100]}...")
            else:
                print(f"❓ Data found on {dev}, but not GPS NMEA")
                print(f"   Sample: {data[:100]}...")
        else:
            print(f"❌ No data from {dev}")
        print()
    
    print("=" * 60)
    print("💡 Configuration Tips:")
    print("  - If GPS found: update hardware_integration.py neo6m_port")
    print("  - For SIM900A: may need pyserial to send AT commands")
    print("  - Common ports: /dev/ttyUSB0, /dev/ttyACM0")
    print("=" * 60)

if __name__ == "__main__":
    main()
