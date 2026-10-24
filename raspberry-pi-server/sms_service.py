#!/usr/bin/env python3
"""
Standalone SMS Service for Bus Monitoring System
Independent service that handles SMS notifications without depending on video/camera modules
"""

import os
import sys
import time
import logging
from datetime import datetime
from typing import Optional, List, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to import required modules
try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    logger.error("pyserial not installed. Install with: pip install pyserial")

try:
    from supabase import create_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    logger.error("supabase not installed. Install with: pip install supabase")


class SMSService:
    """Standalone SMS Service"""

    def __init__(self):
        self.serial_connection = None
        self.connected = False
        self.supabase = None
        self.emergency_contacts = []
        self.admin_contacts = []

        # Configuration
        self.port = os.getenv('SIM900A_PORT', '/dev/ttyUSB0')
        self.baudrate = int(os.getenv('SIM900A_BAUDRATE', '9600'))
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_KEY')

        # Initialize
        self._init_supabase()
        self._connect_hardware()
        self._fetch_contacts()

    def _init_supabase(self):
        """Initialize Supabase client"""
        if not SUPABASE_AVAILABLE:
            logger.warning("Supabase client not available")
            return

        if not self.supabase_url or not self.supabase_key:
            logger.warning("Supabase credentials not configured")
            return

        try:
            self.supabase = create_client(self.supabase_url, self.supabase_key)
            logger.info("Supabase client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase: {e}")

    def _connect_hardware(self) -> bool:
        """Connect to SIM900A module"""
        if not SERIAL_AVAILABLE:
            logger.error("Serial library not available")
            return False

        try:
            self.serial_connection = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=2
            )

            # Test connection
            self.serial_connection.write(b'AT\r')
            time.sleep(0.5)
            response = self.serial_connection.read(100).decode('utf-8', errors='ignore')

            if 'OK' in response:
                self.connected = True
                logger.info(f"SIM900A connected on {self.port} @ {self.baudrate} baud")
                return True
            else:
                logger.error(f"SIM900A did not respond with OK. Response: {response}")
                return False

        except serial.SerialException as e:
            logger.error(f"Failed to connect to SIM900A: {e}")
            return False
        except Exception as e:
            logger.error(f"Hardware connection error: {e}")
            return False

    def _fetch_contacts(self):
        """Fetch contacts from database"""
        if not self.supabase:
            logger.warning("Cannot fetch contacts - Supabase not initialized")
            # Try fallback from environment
            self._fetch_contacts_from_env()
            return

        try:
            # Fetch emergency contacts
            result = self.supabase.table('emergency_contacts').select('phone').execute()
            if result.data:
                self.emergency_contacts = [c['phone'] for c in result.data if c.get('phone')]
                logger.info(f"Loaded {len(self.emergency_contacts)} emergency contacts from database")
            else:
                logger.warning("No emergency contacts in database, using fallback")
                self._fetch_contacts_from_env()

            # Admin contacts (for now, same as emergency - you can separate later)
            self.admin_contacts = self.emergency_contacts.copy()
            logger.info(f"Loaded {len(self.admin_contacts)} admin contacts")

        except Exception as e:
            logger.error(f"Failed to fetch contacts from database: {e}")
            self._fetch_contacts_from_env()

    def _fetch_contacts_from_env(self):
        """Fallback: fetch contacts from environment variables"""
        emergency_env = os.getenv('EMERGENCY_CONTACTS', '')
        if emergency_env:
            self.emergency_contacts = [p.strip() for p in emergency_env.split(',') if p.strip()]
            logger.info(f"Using {len(self.emergency_contacts)} emergency contacts from ENV")

        admin_env = os.getenv('ADMIN_CONTACTS', '')
        if admin_env:
            self.admin_contacts = [p.strip() for p in admin_env.split(',') if p.strip()]
            logger.info(f"Using {len(self.admin_contacts)} admin contacts from ENV")

    def _send_at_command(self, command: str, timeout: float = 1.0) -> str:
        """Send AT command and return response"""
        if not self.connected or not self.serial_connection:
            logger.error("SIM900A not connected")
            return ""

        try:
            self.serial_connection.write((command + '\r').encode())
            time.sleep(timeout)
            response = self.serial_connection.read(200).decode('utf-8', errors='ignore').strip()
            return response
        except Exception as e:
            logger.error(f"AT command error: {e}")
            return ""

    def send_sms(self, phone_number: str, message: str, sms_type: str = 'test') -> Dict:
        """Send SMS to a single recipient"""
        if not self.connected:
            logger.error("Cannot send SMS - SIM900A not connected")
            return {'success': False, 'error': 'Not connected'}

        try:
            logger.info(f"Sending SMS to {phone_number}: {message[:50]}...")

            # Set SMS mode to text
            self._send_at_command('AT+CMGF=1')
            time.sleep(0.5)

            # Set recipient
            self._send_at_command(f'AT+CMGS="{phone_number}"')
            time.sleep(0.5)

            # Send message
            self.serial_connection.write(f'{message}\x1A\r'.encode())
            time.sleep(3)

            response = self.serial_connection.read(200).decode('utf-8', errors='ignore').strip()

            if 'OK' in response:
                logger.info(f"SMS sent successfully to {phone_number}")
                self._log_sms(phone_number, message, sms_type, 'sent')
                return {'success': True, 'phone': phone_number}
            else:
                logger.error(f"Failed to send SMS to {phone_number}: {response}")
                self._log_sms(phone_number, message, sms_type, 'failed')
                return {'success': False, 'error': response, 'phone': phone_number}

        except Exception as e:
            logger.error(f"SMS sending error: {e}")
            self._log_sms(phone_number, message, sms_type, 'failed')
            return {'success': False, 'error': str(e), 'phone': phone_number}

    def send_bulk_sms(self, phone_numbers: List[str], message: str, sms_type: str = 'emergency') -> Dict:
        """Send SMS to multiple recipients"""
        results = []
        for phone_number in phone_numbers:
            result = self.send_sms(phone_number, message, sms_type)
            results.append(result)
            time.sleep(2)  # Delay between messages

        success_count = sum(1 for r in results if r['success'])
        return {
            'total': len(results),
            'successful': success_count,
            'failed': len(results) - success_count,
            'results': results
        }

    def send_emergency_alert(self, message: str = None, location: Dict = None) -> Dict:
        """Send emergency alert to all emergency contacts"""
        if not message:
            message = "EMERGENCY: Bus system emergency alert!"

        if location:
            message += f" Location: {location.get('lat', 'N/A')}, {location.get('lng', 'N/A')}"

        logger.warning(f"Sending emergency alert to {len(self.emergency_contacts)} contacts")
        return self.send_bulk_sms(self.emergency_contacts, message, 'emergency')

    def send_admin_alert(self, message: str = None, location: Dict = None) -> Dict:
        """Send admin alert to all admin contacts"""
        if not message:
            message = "ADMIN ALERT: System notification"

        if location:
            message += f" Location: {location.get('lat', 'N/A')}, {location.get('lng', 'N/A')}"

        logger.info(f"Sending admin alert to {len(self.admin_contacts)} contacts")
        return self.send_bulk_sms(self.admin_contacts, message, 'admin')

    def _log_sms(self, phone_number: str, message: str, sms_type: str, status: str):
        """Log SMS to database"""
        if not self.supabase:
            return

        try:
            data = {
                'phone_number': phone_number,
                'message': message,
                'sms_type': sms_type,
                'status': status,
                'sent_at': datetime.now().isoformat()
            }
            self.supabase.table('sms_logs').insert(data).execute()
            logger.debug(f"SMS logged to database: {sms_type} to {phone_number}")
        except Exception as e:
            logger.error(f"Failed to log SMS to database: {e}")

    def refresh_contacts(self):
        """Refresh contacts from database"""
        logger.info("Refreshing contacts from database...")
        self._fetch_contacts()
        logger.info(f"Contacts refreshed - Emergency: {len(self.emergency_contacts)}, Admin: {len(self.admin_contacts)}")

    def check_status(self) -> Dict:
        """Check service status"""
        status = {
            'service': 'SMS Service',
            'connected': self.connected,
            'supabase_available': SUPABASE_AVAILABLE and self.supabase is not None,
            'emergency_contacts_count': len(self.emergency_contacts),
            'admin_contacts_count': len(self.admin_contacts),
            'port': self.port,
            'baudrate': self.baudrate
        }

        if self.connected:
            # Check signal
            response = self._send_at_command('AT+CSQ')
            if '+CSQ:' in response:
                try:
                    csq_part = response.split('+CSQ:')[1].split(',')[0].strip()
                    signal = int(csq_part)
                    status['signal'] = signal
                    status['signal_quality'] = 'good' if signal >= 10 else 'weak' if signal > 0 else 'none'
                except:
                    pass

        return status

    def disconnect(self):
        """Disconnect from hardware"""
        if self.serial_connection:
            self.serial_connection.close()
            self.connected = False
            logger.info("SIM900A disconnected")


def main():
    """Main entry point for standalone SMS service"""
    print("=" * 70)
    print("📱 SMS Service - Standalone")
    print("=" * 70)
    print()

    # Initialize service
    sms_service = SMSService()

    # Check status
    status = sms_service.check_status()
    print("Service Status:")
    print(f"  Connected: {status['connected']}")
    print(f"  Port: {status['port']} @ {status['baudrate']} baud")
    print(f"  Emergency Contacts: {status['emergency_contacts_count']}")
    print(f"  Admin Contacts: {status['admin_contacts_count']}")
    if 'signal' in status:
        print(f"  Signal: {status['signal']} ({status['signal_quality']})")
    print()

    # Command line interface
    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == 'test':
            # Test with single number
            if len(sys.argv) > 2:
                phone = sys.argv[2]
                message = sys.argv[3] if len(sys.argv) > 3 else "Test SMS from SMS Service"
                result = sms_service.send_sms(phone, message, 'test')
                print(f"Result: {result}")
            else:
                print("Usage: python sms_service.py test <phone_number> [message]")

        elif command == 'emergency':
            # Send emergency alert
            message = sys.argv[2] if len(sys.argv) > 2 else None
            result = sms_service.send_emergency_alert(message)
            print(f"Emergency alert sent: {result['successful']}/{result['total']} successful")

        elif command == 'admin':
            # Send admin alert
            message = sys.argv[2] if len(sys.argv) > 2 else None
            result = sms_service.send_admin_alert(message)
            print(f"Admin alert sent: {result['successful']}/{result['total']} successful")

        elif command == 'refresh':
            # Refresh contacts
            sms_service.refresh_contacts()
            print("Contacts refreshed")

        elif command == 'status':
            # Show detailed status
            print(json.dumps(status, indent=2))

        else:
            print(f"Unknown command: {command}")
            print("Available commands: test, emergency, admin, refresh, status")
    else:
        print("Available commands:")
        print("  python sms_service.py test <phone> [message]  - Send test SMS")
        print("  python sms_service.py emergency [message]      - Send emergency alert")
        print("  python sms_service.py admin [message]          - Send admin alert")
        print("  python sms_service.py refresh                  - Refresh contacts from DB")
        print("  python sms_service.py status                   - Show service status")

    sms_service.disconnect()


if __name__ == "__main__":
    import json
    main()
