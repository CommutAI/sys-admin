#!/usr/bin/env python3
"""
Comprehensive SMS Test Script for SIM900A
Tests connection, signal, SIM status, and sends test SMS
"""

import serial
import time
import sys
import os

def send_at_command(ser, command, timeout=1):
    """Send AT command and return response"""
    ser.write((command + '\r').encode())
    time.sleep(timeout)
    response = ser.read(200).decode('utf-8', errors='ignore').strip()
    return response

def test_sms(phone_number=None, test_message=None):
    """Test SMS functionality"""
    print("=" * 70)
    print("📱 SIM900A SMS Test")
    print("=" * 70)
    print()

    # Configuration
    port = '/dev/ttyUSB0'
    baudrate = 9600

    # If you're using GPIO4/GPIO5, change port to None and use SIM900A_GPIO class
    # from sim900a_gpio4_gpio5.py instead

    try:
        ser = serial.Serial(port, baudrate, timeout=2)
        print(f"✅ Connected to {port} @ {baudrate} baud")
        print()

        # Test 1: Basic AT
        print("[1] Testing AT command...")
        response = send_at_command(ser, 'AT')
        print(f"    Response: {response}")
        if 'OK' in response:
            print("    ✅ SIM900A is responding")
        else:
            print("    ❌ No OK response")
            ser.close()
            return False
        print()

        # Test 2: Signal strength
        print("[2] Checking signal strength (CSQ)...")
        response = send_at_command(ser, 'AT+CSQ')
        print(f"    Response: {response}")
        if '+CSQ:' in response:
            print("    ✅ Signal query successful")
            try:
                csq_part = response.split('+CSQ:')[1].split(',')[0].strip()
                signal = int(csq_part)
                if signal == 0:
                    print("    ⚠️  Signal: 0 (very weak or no signal)")
                elif signal < 10:
                    print(f"    ⚠️  Signal: {signal} (weak)")
                elif signal < 20:
                    print(f"    ✅ Signal: {signal} (good)")
                else:
                    print(f"    ✅ Signal: {signal} (excellent)")
            except:
                print("    Could not parse signal value")
        else:
            print("    ❌ Could not read signal")
        print()

        # Test 3: SIM card status
        print("[3] Checking SIM card status...")
        response = send_at_command(ser, 'AT+CPIN?')
        print(f"    Response: {response}")
        if 'READY' in response:
            print("    ✅ SIM card is ready")
        elif 'SIM PIN' in response:
            print("    ⚠️  SIM card requires PIN")
        else:
            print("    ❌ SIM card not detected or error")
            ser.close()
            return False
        print()

        # Test 4: Network registration
        print("[4] Checking network registration...")
        response = send_at_command(ser, 'AT+CREG?')
        print(f"    Response: {response}")
        if '+CREG:' in response:
            if ',1' in response or ',5' in response:
                print("    ✅ Registered to network")
            else:
                print("    ⚠️  Not registered to network")
                print("    ⚠️  Cannot send SMS without network registration")
                ser.close()
                return False
        print()

        # Test 5: Operator
        print("[5] Checking network operator...")
        response = send_at_command(ser, 'AT+COPS?')
        print(f"    Response: {response}")
        if '+COPS:' in response:
            print("    ✅ Network operator detected")
        print()

        # Test 6: Send SMS
        if phone_number:
            print("[6] Sending test SMS...")
            message = test_message or "Test SMS from Bus Monitoring System"
            print(f"    To: {phone_number}")
            print(f"    Message: {message}")
            print()

            # Set SMS mode to text
            ser.write(b'AT+CMGF=1\r')
            time.sleep(0.5)

            # Set recipient
            ser.write(f'AT+CMGS="{phone_number}"\r'.encode())
            time.sleep(0.5)

            # Send message
            ser.write(f'{message}\x1A\r'.encode())
            time.sleep(3)

            response = ser.read(200).decode('utf-8', errors='ignore').strip()
            print(f"    Response: {response}")

            if 'OK' in response:
                print("    ✅ SMS sent successfully!")
            else:
                print("    ❌ Failed to send SMS")
                print(f"    Check response above for error details")
        else:
            print("[6] SMS sending test skipped (no phone number provided)")
            print("    To test SMS sending, run with: python test_sms_send.py +639123456789")
        print()

        ser.close()
        print("=" * 70)
        print("✅ SMS test complete")
        print("=" * 70)
        return True

    except serial.SerialException as e:
        print(f"❌ Failed to open {port}: {e}")
        print()
        print("Troubleshooting:")
        print(f"   - Check port exists: ls -la {port}")
        print(f"   - Try alternative port: /dev/ttyACM0")
        print(f"   - Check USB-TTL adapter: lsusb")
        print(f"   - Check permissions: sudo usermod -a -G dialout $USER")
        print(f"   - Reboot after adding user to dialout group")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    phone_number = None
    test_message = None

    if len(sys.argv) > 1:
        phone_number = sys.argv[1]
    if len(sys.argv) > 2:
        test_message = sys.argv[2]

    if not phone_number:
        print("Usage: python test_sms_send.py <phone_number> [message]")
        print("Example: python test_sms_send.py +639123456789 'Test message'")
        print()
        print("Running connection test only (no SMS will be sent)...")
        print()

    success = test_sms(phone_number, test_message)
    sys.exit(0 if success else 1)
