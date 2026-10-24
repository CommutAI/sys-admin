#!/usr/bin/env python3
"""
Comprehensive SMS Test Script for SIM900A
Tests connection, signal, SIM status, and sends test SMS
Can fetch recipients from database or use manual phone numbers
"""

import serial
import time
import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Try to import Supabase client
try:
    from supabase import create_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("⚠️  Supabase client not available. Install with: pip install supabase")

def send_at_command(ser, command, timeout=1):
    """Send AT command and return response"""
    ser.write((command + '\r').encode())
    time.sleep(timeout)
    response = ser.read(200).decode('utf-8', errors='ignore').strip()
    return response

def get_emergency_contacts_from_db():
    """Fetch emergency contacts from Supabase database"""
    if not SUPABASE_AVAILABLE:
        print("⚠️  Cannot fetch from database - Supabase client not installed")
        return []

    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')

    if not supabase_url or not supabase_key:
        print("⚠️  SUPABASE_URL or SUPABASE_KEY not set in .env file")
        return []

    try:
        supabase = create_client(supabase_url, supabase_key)
        result = supabase.table('emergency_contacts').select('phone, name').execute()

        if result.data:
            contacts = []
            for contact in result.data:
                phone = contact.get('phone', '').strip()
                name = contact.get('name', '').strip()
                if phone:
                    contacts.append({'phone': phone, 'name': name})
            return contacts
        else:
            print("⚠️  No emergency contacts found in database")
            return []
    except Exception as e:
        print(f"⚠️  Error fetching contacts from database: {e}")
        return []

def get_contacts_from_env():
    """Fetch contacts from environment variable (comma-separated)"""
    emergency_contacts = os.getenv('EMERGENCY_CONTACTS', '')
    if emergency_contacts:
        contacts = []
        for phone in emergency_contacts.split(','):
            phone = phone.strip()
            if phone:
                contacts.append({'phone': phone, 'name': 'From ENV'})
        return contacts
    return []

def test_sms(phone_numbers=None, test_message=None, use_db=False, use_env=False):
    """Test SMS functionality"""
    print("=" * 70)
    print("📱 SIM900A SMS Test")
    print("=" * 70)
    print()

    # Determine recipients
    recipients = []

    if use_db:
        print("📊 Fetching contacts from database...")
        recipients = get_emergency_contacts_from_db()
        if recipients:
            print(f"   Found {len(recipients)} contacts in database:")
            for contact in recipients:
                print(f"   - {contact.get('name', 'Unknown')}: {contact['phone']}")
        else:
            print("   No contacts found in database")
        print()
    elif use_env:
        print("📊 Fetching contacts from environment variable...")
        recipients = get_contacts_from_env()
        if recipients:
            print(f"   Found {len(recipients)} contacts in EMERGENCY_CONTACTS:")
            for contact in recipients:
                print(f"   - {contact['phone']}")
        else:
            print("   No contacts found in EMERGENCY_CONTACTS")
        print()
    elif phone_numbers:
        # Parse manual phone numbers (comma-separated or single)
        if isinstance(phone_numbers, str):
            phone_numbers = [p.strip() for p in phone_numbers.split(',')]
        recipients = [{'phone': p, 'name': 'Manual'} for p in phone_numbers if p.strip()]
        print(f"📊 Using manual phone numbers: {len(recipients)} recipient(s)")
        for contact in recipients:
            print(f"   - {contact['phone']}")
        print()
    else:
        print("⚠️  No recipients specified")
        print("   Use one of:")
        print("   - --db: Fetch from database")
        print("   - --env: Use EMERGENCY_CONTACTS from .env")
        print("   - Phone number: python test_sms_send.py +639123456789")
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
        if recipients:
            print("[6] Sending test SMS...")
            message = test_message or "Test SMS from Bus Monitoring System"
            print(f"    Message: {message}")
            print()

            results = []
            for i, recipient in enumerate(recipients, 1):
                phone_number = recipient['phone']
                name = recipient.get('name', 'Unknown')
                print(f"    [{i}/{len(recipients)}] Sending to {name} ({phone_number})...")

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
                print(f"        Response: {response}")

                if 'OK' in response:
                    print(f"        ✅ SMS sent successfully to {phone_number}")
                    results.append({'phone': phone_number, 'status': 'success'})
                else:
                    print(f"        ❌ Failed to send SMS to {phone_number}")
                    results.append({'phone': phone_number, 'status': 'failed', 'response': response})

                # Delay between messages to avoid rate limiting
                if i < len(recipients):
                    time.sleep(2)
                print()

            # Summary
            print("=" * 70)
            print("📊 SMS Sending Summary")
            print("=" * 70)
            success_count = sum(1 for r in results if r['status'] == 'success')
            print(f"Total recipients: {len(recipients)}")
            print(f"Successful: {success_count}")
            print(f"Failed: {len(recipients) - success_count}")
            print()
        else:
            print("[6] SMS sending test skipped (no recipients provided)")
            print("    Options:")
            print("    - python test_sms_send.py +639123456789")
            print("    - python test_sms_send.py --db")
            print("    - python test_sms_send.py --env")
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
    phone_numbers = None
    test_message = None
    use_db = False
    use_env = False

    # Parse command line arguments
    if len(sys.argv) > 1:
        arg = sys.argv[1]

        if arg == '--db':
            use_db = True
        elif arg == '--env':
            use_env = True
        elif arg.startswith('+'):
            phone_numbers = arg
        else:
            phone_numbers = arg

    if len(sys.argv) > 2:
        test_message = sys.argv[2]

    if not phone_numbers and not use_db and not use_env:
        print("Usage:")
        print("  python test_sms_send.py <phone_number> [message]")
        print("  python test_sms_send.py --db [message]")
        print("  python test_sms_send.py --env [message]")
        print()
        print("Examples:")
        print("  python test_sms_send.py +639123456789 'Test message'")
        print("  python test_sms_send.py --db 'Emergency test'")
        print("  python test_sms_send.py --env 'Test from env'")
        print()
        print("Running connection test only (no SMS will be sent)...")
        print()

    success = test_sms(phone_numbers, test_message, use_db, use_env)
    sys.exit(0 if success else 1)
