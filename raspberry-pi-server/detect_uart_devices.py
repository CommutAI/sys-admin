#!/usr/bin/env python3
"""
Hardware Detection Script for GPS and SIM900A UART Devices
Detects all serial ports and tests for SIM900A (AT commands) and GPS (NMEA data)
"""

import serial
import serial.tools.list_ports
import time
import sys

def list_serial_ports():
    """List all available serial ports"""
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("❌ No serial ports found!")
        return []
    
    print(f"\n📡 Found {len(ports)} serial port(s):")
    for i, port in enumerate(ports, 1):
        print(f"  {i}. {port.device}")
        print(f"     Description: {port.description}")
        print(f"     HWID: {port.hwid}")
        print(f"     Manufacturer: {port.manufacturer if port.manufacturer else 'Unknown'}")
        print()
    
    return ports

def test_sim900a(port_device, baudrate=9600, timeout=2):
    """Test if SIM900A is connected on this port"""
    print(f"🔍 Testing SIM900A on {port_device} @ {baudrate} baud...")
    try:
        ser = serial.Serial(port_device, baudrate, timeout=timeout)
        time.sleep(0.5)
        
        # Send AT command
        ser.write(b'AT\r')
        time.sleep(0.5)
        response = ser.read(100).decode('utf-8', errors='ignore')
        ser.close()
        
        if 'OK' in response:
            print(f"✅ SIM900A detected on {port_device}!")
            print(f"   Response: {response.strip()}")
            return True
        else:
            print(f"❌ No SIM900A response on {port_device}")
            return False
    except Exception as e:
        print(f"❌ Error testing {port_device}: {e}")
        return False

def test_gps(port_device, baudrate=9600, timeout=3):
    """Test if GPS (NEO-6M) is connected on this port"""
    print(f"🔍 Testing GPS on {port_device} @ {baudrate} baud...")
    try:
        ser = serial.Serial(port_device, baudrate, timeout=timeout)
        time.sleep(0.5)
        
        # Read NMEA data
        data = ser.read(500).decode('utf-8', errors='ignore')
        ser.close()
        
        # Check for NMEA sentences
        nmea_sentences = ['$GPGGA', '$GPRMC', '$GPGSA', '$GPGSV', '$GPGLL']
        found = [s for s in nmea_sentences if s in data]
        
        if found:
            print(f"✅ GPS detected on {port_device}!")
            print(f"   NMEA sentences found: {found}")
            if data.strip():
                print(f"   Sample data: {data.strip()[:100]}...")
            return True
        else:
            print(f"❌ No GPS NMEA data on {port_device}")
            return False
    except Exception as e:
        print(f"❌ Error testing {port_device}: {e}")
        return False

def test_all_baudrates(port_device):
    """Test common baudrates for SIM900A and GPS"""
    baudrates = [9600, 115200, 57600, 38400, 19200, 4800]
    
    print(f"\n🔄 Testing all baudrates on {port_device}...")
    
    for baud in baudrates:
        print(f"  Testing {baud} baud...")
        
        # Test SIM900A
        if test_sim900a(port_device, baud, timeout=1):
            print(f"  ⭐ SIM900A found at {baud} baud on {port_device}")
            return ('sim900a', baud)
        
        # Test GPS
        if test_gps(port_device, baud, timeout=1):
            print(f"  ⭐ GPS found at {baud} baud on {port_device}")
            return ('gps', baud)
    
    print(f"  ❌ No device found on {port_device}")
    return (None, None)

def main():
    print("=" * 60)
    print("🔧 UART Hardware Detection for GPS and SIM900A")
    print("=" * 60)
    
    # List all serial ports
    ports = list_serial_ports()
    
    if not ports:
        print("\n💡 Tips:")
        print("  - Make sure your TTL UART adapter is connected via USB")
        print("  - Check if the adapter is powered (LED on)")
        print("  - Try: ls /dev/ttyUSB* or ls /dev/ttyACM* on the Pi")
        return
    
    # Auto-detect by default (no prompts)
    print("\n🚀 Auto-detecting all ports...")
    results = {}
    
    for port in ports:
        print(f"\n--- Testing {port.device} ---")
        
        # Test SIM900A first (common baudrate)
        if test_sim900a(port.device, 9600):
            results[port.device] = 'SIM900A'
            continue
        
        # Test GPS (common baudrate)
        if test_gps(port.device, 9600):
            results[port.device] = 'GPS'
            continue
        
        # Try other baudrates
        device_type, baud = test_all_baudrates(port.device)
        if device_type:
            results[port.device] = f"{device_type.upper()} @ {baud} baud"
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Detection Summary")
    print("=" * 60)
    if results:
        for port, device in results.items():
            print(f"✅ {port}: {device}")
    else:
        print("❌ No devices detected")
    
    print("\n💡 Configuration Tips:")
    print("  - If SIM900A found: update hardware_integration.py sim900a_port")
    print("  - If GPS found: update hardware_integration.py neo6m_port")
    print("  - Common USB-TTL adapters: CP2102, FT232, CH340")

if __name__ == "__main__":
    main()
