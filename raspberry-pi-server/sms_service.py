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

    # ==================== SPECIFIC SMS FUNCTIONALITIES ====================

    def send_reservation_confirmation(self, phone_number: str, reservation_id: str,
                                     passenger_name: str, route: str, schedule: str,
                                     seats: int, total_fare: float) -> Dict:
        """
        Send confirmation SMS for successful pre-reservation from public dashboard
        """
        message = f"RESERVATION CONFIRMED\n"
        message += f"ID: {reservation_id}\n"
        message += f"Passenger: {passenger_name}\n"
        message += f"Route: {route}\n"
        message += f"Schedule: {schedule}\n"
        message += f"Seats: {seats}\n"
        message += f"Total Fare: ₱{total_fare:.2f}\n"
        message += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}"

        logger.info(f"Sending reservation confirmation to {phone_number}")
        return self.send_sms(phone_number, message, 'reservation_confirmation')

    def send_card_approval_notification(self, phone_number: str, card_id: str,
                                       card_holder: str, status: str,
                                       reason: str = None) -> Dict:
        """
        Send SMS notification for card approval/decline by system admin
        """
        if status.lower() == 'approved':
            message = f"CARD APPROVED\n"
            message += f"Card ID: {card_id}\n"
            message += f"Holder: {card_holder}\n"
            message += f"Your QR card reservation has been approved.\n"
            message += f"Please claim your card at the pickup terminal within 7 days.\n"
            message += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        else:
            message = f"CARD DECLINED\n"
            message += f"Card ID: {card_id}\n"
            message += f"Holder: {card_holder}\n"
            if reason:
                message += f"Reason: {reason}\n"
            message += f"Please contact customer service for assistance.\n"
            message += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}"

        logger.info(f"Sending card {status} notification to {phone_number}")
        return self.send_sms(phone_number, message, f'card_{status.lower()}')

    def send_emergency_alert_from_bus(self, message: str = None, location: Dict = None,
                                      bus_number: str = None, driver_name: str = None) -> Dict:
        """
        Send emergency SMS from driver and conductor
        Goes to all emergency contacts
        """
        if not message:
            message = "EMERGENCY ALERT"

        emergency_msg = f"🚨 {message}\n"
        if bus_number:
            emergency_msg += f"Bus: {bus_number}\n"
        if driver_name:
            emergency_msg += f"Driver: {driver_name}\n"
        if location:
            emergency_msg += f"Location: {location.get('lat', 'N/A')}, {location.get('lng', 'N/A')}\n"
        emergency_msg += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}"

        logger.warning(f"Sending emergency alert from bus to {len(self.emergency_contacts)} contacts")
        return self.send_bulk_sms(self.emergency_contacts, emergency_msg, 'emergency_bus')

    def send_trip_completion_confirmation(self, phone_number: str, passenger_name: str,
                                         bus_number: str, route: str, fare: float,
                                         alighting_stop: str, distance: float = None) -> Dict:
        """
        Send confirmation SMS after successful trip completion (alighting)
        """
        message = f"TRIP COMPLETED\n"
        message += f"Passenger: {passenger_name}\n"
        message += f"Bus: {bus_number}\n"
        message += f"Route: {route}\n"
        message += f"Alighting: {alighting_stop}\n"
        message += f"Fare: ₱{fare:.2f}\n"
        if distance:
            message += f"Distance: {distance:.1f} km\n"
        message += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
        message += f"Thank you for riding with us!"

        logger.info(f"Sending trip completion confirmation to {phone_number}")
        return self.send_sms(phone_number, message, 'trip_completion')

    def send_topup_confirmation(self, phone_number: str, card_id: str,
                                 card_holder: str, amount: float,
                                 new_balance: float, transaction_id: str = None) -> Dict:
        """
        Send SMS confirmation for QR card top-up in customer service
        """
        message = f"TOP-UP SUCCESSFUL\n"
        message += f"Card ID: {card_id}\n"
        message += f"Holder: {card_holder}\n"
        message += f"Amount: ₱{amount:.2f}\n"
        message += f"New Balance: ₱{new_balance:.2f}\n"
        if transaction_id:
            message += f"Ref: {transaction_id}\n"
        message += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
        message += f"Thank you for reloading!"

        logger.info(f"Sending top-up confirmation to {phone_number}")
        return self.send_sms(phone_number, message, 'topup')

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
            # Send emergency alert from bus
            message = sys.argv[2] if len(sys.argv) > 2 else None
            result = sms_service.send_emergency_alert_from_bus(message)
            print(f"Emergency alert sent: {result['successful']}/{result['total']} successful")

        elif command == 'admin':
            # Send admin alert
            message = sys.argv[2] if len(sys.argv) > 2 else None
            result = sms_service.send_admin_alert(message)
            print(f"Admin alert sent: {result['successful']}/{result['total']} successful")

        elif command == 'reservation':
            # Send reservation confirmation
            if len(sys.argv) > 7:
                phone = sys.argv[2]
                reservation_id = sys.argv[3]
                passenger_name = sys.argv[4]
                route = sys.argv[5]
                schedule = sys.argv[6]
                seats = int(sys.argv[7])
                fare = float(sys.argv[8]) if len(sys.argv) > 8 else 0
                result = sms_service.send_reservation_confirmation(
                    phone, reservation_id, passenger_name, route, schedule, seats, fare
                )
                print(f"Reservation confirmation sent: {result}")
            else:
                print("Usage: python sms_service.py reservation <phone> <id> <name> <route> <schedule> <seats> <fare>")

        elif command == 'card':
            # Send card approval/decline notification
            if len(sys.argv) > 5:
                phone = sys.argv[2]
                card_id = sys.argv[3]
                card_holder = sys.argv[4]
                status = sys.argv[5]
                reason = sys.argv[6] if len(sys.argv) > 6 else None
                result = sms_service.send_card_approval_notification(
                    phone, card_id, card_holder, status, reason
                )
                print(f"Card {status} notification sent: {result}")
            else:
                print("Usage: python sms_service.py card <phone> <card_id> <holder> <approved|declined> [reason]")

        elif command == 'trip':
            # Send trip completion confirmation
            if len(sys.argv) > 6:
                phone = sys.argv[2]
                passenger_name = sys.argv[3]
                bus_number = sys.argv[4]
                route = sys.argv[5]
                fare = float(sys.argv[6])
                alighting_stop = sys.argv[7]
                distance = float(sys.argv[8]) if len(sys.argv) > 8 else None
                result = sms_service.send_trip_completion_confirmation(
                    phone, passenger_name, bus_number, route, fare, alighting_stop, distance
                )
                print(f"Trip completion confirmation sent: {result}")
            else:
                print("Usage: python sms_service.py trip <phone> <name> <bus> <route> <fare> <stop> [distance]")

        elif command == 'topup':
            # Send top-up confirmation
            if len(sys.argv) > 5:
                phone = sys.argv[2]
                card_id = sys.argv[3]
                card_holder = sys.argv[4]
                amount = float(sys.argv[5])
                new_balance = float(sys.argv[6])
                transaction_id = sys.argv[7] if len(sys.argv) > 7 else None
                result = sms_service.send_topup_confirmation(
                    phone, card_id, card_holder, amount, new_balance, transaction_id
                )
                print(f"Top-up confirmation sent: {result}")
            else:
                print("Usage: python sms_service.py topup <phone> <card_id> <holder> <amount> <new_balance> [transaction_id]")

        elif command == 'refresh':
            # Refresh contacts
            sms_service.refresh_contacts()
            print("Contacts refreshed")

        elif command == 'status':
            # Show detailed status
            print(json.dumps(status, indent=2))

        else:
            print(f"Unknown command: {command}")
            print("Available commands: test, emergency, admin, reservation, card, trip, topup, refresh, status")
    else:
        print("Available commands:")
        print("  python sms_service.py test <phone> [message]                    - Send test SMS")
        print("  python sms_service.py emergency [message]                        - Send emergency alert")
        print("  python sms_service.py admin [message]                            - Send admin alert")
        print("  python sms_service.py reservation <phone> <id> <name> <route> <schedule> <seats> <fare>")
        print("                                                            - Send reservation confirmation")
        print("  python sms_service.py card <phone> <card_id> <holder> <approved|declined> [reason]")
        print("                                                            - Send card approval/decline")
        print("  python sms_service.py trip <phone> <name> <bus> <route> <fare> <stop> [distance]")
        print("                                                            - Send trip completion")
        print("  python sms_service.py topup <phone> <card_id> <holder> <amount> <new_balance> [ref]")
        print("                                                            - Send top-up confirmation")
        print("  python sms_service.py refresh                                    - Refresh contacts from DB")
        print("  python sms_service.py status                                     - Show service status")

    sms_service.disconnect()


if __name__ == "__main__":
    import json
    main()
