#!/usr/bin/env python3
"""
Quick SIM900 check - tests AT commands and signal
"""

import serial
import time

def send_at_command(ser, command, timeout=1):
    """Send AT command and return response"""
    ser.write((command + '\r').encode())
    time.sleep(timeout)
    response = ser.read(200).decode('utf-8', errors='ignore').strip()
    return response

def check_sim900():
    print("=" * 60)
    print("🔍 SIM900A Check")
    print("=" * 60)
    print()

    port = '/dev/ttyUSB0'
    baudrate = 9600

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
        print()

        # Test 2: Signal strength
        print("[2] Checking signal strength (CSQ)...")
        response = send_at_command(ser, 'AT+CSQ')
        print(f"    Response: {response}")
        if '+CSQ:' in response:
            print("    ✅ Signal query successful")
            # Parse signal quality
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
        print()

        # Test 5: Operator
        print("[5] Checking network operator...")
        response = send_at_command(ser, 'AT+COPS?')
        print(f"    Response: {response}")
        if '+COPS:' in response:
            print("    ✅ Network operator detected")
        print()

        ser.close()
        print("=" * 60)
        print("✅ SIM900A check complete")
        print("=" * 60)

    except Exception as e:
        print(f"❌ Error: {e}")
        print(f"   Check: ls -la {port}")
        print(f"   Check: lsusb (should show USB-TTL adapter)")

if __name__ == "__main__":
    check_sim900()
