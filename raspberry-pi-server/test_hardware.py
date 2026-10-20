#!/usr/bin/env python3
"""
Test script for GPS and SIM900A hardware connections
Tests NMEA data from GPS and AT commands from SIM900A
"""

import serial
import time
import sys

def test_gps(port='/dev/ttyS0', baudrate=9600, timeout=5):
    """Test GPS connection by reading NMEA data"""
    print(f"🔍 Testing GPS on {port} @ {baudrate} baud...")
    print(f"   (GPIO pins 8 & 10 = UART0)")
    print()

    try:
        ser = serial.Serial(port, baudrate, timeout=timeout)
        print(f"✅ Successfully opened {port}")
        print(f"   Reading NMEA data for {timeout} seconds...")
        print()

        nmea_count = 0
        nmea_sentences = []

        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line and line.startswith('$'):
                    nmea_count += 1
                    nmea_sentences.append(line)
                    print(f"   [{nmea_count}] {line[:60]}...")

                    # If we get a GPGGA or GPRMC, we have a fix
                    if '$GPGGA' in line or '$GPRMC' in line:
                        print()
                        print(f"✅ GPS is working! Got location data")
                        print(f"   Total NMEA sentences: {nmea_count}")
                        print(f"   Sample: {line}")
                        ser.close()
                        return True
            except:
                pass

        ser.close()

        if nmea_count > 0:
            print()
            print(f"⚠️  GPS is sending data but no location fix yet")
            print(f"   Total NMEA sentences: {nmea_count}")
            print(f"   May need to be outdoors or have GPS antenna")
            return True
        else:
            print()
            print(f"❌ No NMEA data received from GPS")
            print(f"   Check:")
            print(f"   - GPS is powered (LED should be blinking)")
            print(f"   - TX/RX pins are connected correctly (8 & 10)")
            print(f"   - UART is enabled: sudo raspi-config")
            return False

    except serial.SerialException as e:
        print(f"❌ Failed to open {port}: {e}")
        print(f"   Check:")
        print(f"   - Port exists: ls -la {port}")
        print(f"   - User has permission: sudo usermod -a -G dialout $USER")
        print(f"   - UART is enabled in config.txt")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_sim900(port='/dev/ttyUSB0', baudrate=9600):
    """Test SIM900A connection by sending AT commands"""
    print(f"🔍 Testing SIM900A on {port} @ {baudrate} baud...")
    print(f"   (USB-TTL adapter)")
    print()

    try:
        ser = serial.Serial(port, baudrate, timeout=2)
        print(f"✅ Successfully opened {port}")
        print(f"   Sending AT command...")
        print()

        # Send AT command
        ser.write(b'AT\r')
        time.sleep(0.5)

        response = ser.read(100).decode('utf-8', errors='ignore').strip()
        print(f"   Response: {response}")

        if 'OK' in response:
            print()
            print(f"✅ SIM900A is working!")
            print(f"   Port: {port}")
            print(f"   Baudrate: {baudrate}")

            # Try to get signal strength
            ser.write(b'AT+CSQ\r')
            time.sleep(0.5)
            csq_response = ser.read(100).decode('utf-8', errors='ignore').strip()
            print(f"   Signal: {csq_response}")

            ser.close()
            return True
        else:
            print()
            print(f"❌ SIM900A did not respond with OK")
            print(f"   Check:")
            print(f"   - SIM900A is powered (check LED)")
            print(f"   - SIM card is inserted and has signal")
            print(f"   - TX/RX are connected correctly to USB-TTL")
            print(f"   - USB-TTL adapter is recognized: lsusb")
            ser.close()
            return False

    except serial.SerialException as e:
        print(f"❌ Failed to open {port}: {e}")
        print(f"   Check:")
        print(f"   - Port exists: ls -la {port}")
        print(f"   - USB-TTL adapter is connected: lsusb")
        print(f"   - User has permission: sudo usermod -a -G dialout $USER")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("=" * 60)
    print("🔧 Hardware Test: GPS (GPIO 8/10) and SIM900A (USB)")
    print("=" * 60)
    print()

    # Test GPS first
    gps_port = '/dev/ttyS0'
    if len(sys.argv) > 1:
        gps_port = sys.argv[1]

    gps_ok = test_gps(gps_port)

    print()
    print("=" * 60)
    print()

    # Test SIM900A
    sim_port = '/dev/ttyUSB0'
    if len(sys.argv) > 2:
        sim_port = sys.argv[2]

    sim_ok = test_sim900(sim_port)

    print()
    print("=" * 60)
    print("📊 Test Summary")
    print("=" * 60)
    print(f"GPS (NEO-6M):  {'✅ OK' if gps_ok else '❌ FAILED'}")
    print(f"SIM900A:       {'✅ OK' if sim_ok else '❌ FAILED'}")
    print()
    print("💡 If GPS failed:")
    print("   - Enable UART: sudo raspi-config → Interface Options → Serial Port")
    print("   - Disable serial console")
    print("   - Reboot and try again")
    print()
    print("💡 If SIM900A failed:")
    print("   - Check USB adapter: lsusb")
    print("   - Try /dev/ttyACM0 if /dev/ttyUSB0 doesn't work")
    print("   - Ensure SIM900A has power and SIM card")
    print("=" * 60)

if __name__ == "__main__":
    main()
