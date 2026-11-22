#!/usr/bin/env python3
"""
Raspberry Pi SMS Service for CommutAI
Standalone queue processor for SIM900A GSM modem.
Polls Supabase sms_queue and transmits SMS notifications via hardware.
"""

import os
import sys
import time
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv

# Try multiple .env locations
for env_path in [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raspberry-pi-server', '.env'),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'),
    '/home/chichi/raspberry-pi-server/.env',
    '/home/chichi/.env'
]:
    if os.path.exists(env_path):
        load_dotenv(env_path)
        break

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/chichi/sms_service.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("SMSProcessor")

try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    logger.error("pyserial not installed")

try:
    from supabase import create_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    logger.error("supabase client library not installed")


class SIM900AQueueProcessor:
    """Processes SMS queue from Supabase and sends via SIM900A GSM hardware"""

    def __init__(self):
        self.serial_conn: Optional[serial.Serial] = None
        self.connected = False
        self.supabase = None

        self.port = os.getenv('SIM900A_PORT', '/dev/ttyUSB0')
        self.baudrate = int(os.getenv('SIM900A_BAUDRATE', '9600'))
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')
        self.poll_interval = int(os.getenv('SMS_POLL_INTERVAL', '5'))
        self.batch_limit = int(os.getenv('MAX_CONCURRENT_SMS', '5'))
        self._lock_fp = None

        self._init_supabase()
        self._connect_hardware()

    def _init_supabase(self):
        if not SUPABASE_AVAILABLE:
            logger.error("Supabase module not available")
            return
        if not self.supabase_url or not self.supabase_key:
            logger.error("Supabase credentials missing in environment")
            return
        try:
            self.supabase = create_client(self.supabase_url, self.supabase_key)
            logger.info("Supabase client successfully initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")

    def _connect_hardware(self) -> bool:
        if not SERIAL_AVAILABLE:
            logger.error("Serial module not available")
            return False

        # Acquire exclusive OS lock to prevent concurrent serial access
        if self._lock_fp is None:
            try:
                import fcntl
                self._lock_fp = open('/tmp/sim900a_port.lock', 'w')
                fcntl.flock(self._lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self._lock_fp.write(f"{os.getpid()}\n")
                self._lock_fp.flush()
            except (IOError, BlockingIOError, PermissionError):
                logger.error("Another process is currently holding /tmp/sim900a_port.lock. Aborting hardware connection.")
                return False

        if self.serial_conn:
            try:
                self.serial_conn.close()
            except Exception:
                pass
            self.serial_conn = None
            self.connected = False

        try:
            logger.info(f"Connecting to SIM900A on {self.port} at {self.baudrate} baud...")
            self.serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=5
            )
            time.sleep(1)

            # Cancel any pending / dangling prompts
            self.serial_conn.write(b'\x1B\x1B\r\n')
            time.sleep(0.3)
            if hasattr(self.serial_conn, 'reset_input_buffer'):
                self.serial_conn.reset_input_buffer()

            # Test basic AT communication
            self.serial_conn.write(b'AT\r')
            time.sleep(0.5)
            response = self.serial_conn.read(100).decode('utf-8', errors='ignore')

            if 'OK' in response:
                self.connected = True
                logger.info(f"SIM900A modem successfully connected on {self.port}")

                # Configure modem parameters for reliable SMS:
                commands = [
                    (b'ATE0\r', 0.2),                          # Echo off
                    (b'AT+CMEE=2\r', 0.2),                      # Verbose error messages
                    (b'AT+CGATT=0\r', 0.3),                     # Detach GPRS to eliminate PS Busy conflict
                    (b'AT+CGSMS=1\r', 0.2),                     # Force Circuit-Switched (CS) SMS domain
                    (b'AT+CSCA="+639170000130",145\r', 0.2),    # Configure Globe/TM SMSC
                    (b'AT+CSMP=17,167,0,0\r', 0.2),             # Standard text mode submit parameters
                    (b'AT+CSCS="GSM"\r', 0.2),                  # GSM 7-bit character set
                    (b'AT+CMGF=1\r', 0.3),                      # Set SMS Text Mode
                ]
                for cmd, wait_t in commands:
                    self.serial_conn.write(cmd)
                    time.sleep(wait_t)

                if hasattr(self.serial_conn, 'reset_input_buffer'):
                    self.serial_conn.reset_input_buffer()
                return True
            else:
                logger.error(f"SIM900A did not return OK to AT command. Got: {repr(response)}")
                self.connected = False
                return False

        except serial.SerialException as e:
            logger.error(f"Serial port error on {self.port}: {e}")
            self.connected = False
            return False
        except Exception as e:
            logger.error(f"Unexpected error connecting to hardware: {e}")
            self.connected = False
            return False

    def _format_numbers(self, phone_number: str) -> List[str]:
        """Return list of candidate formats: [E.164 (+639...), National (09...)]"""
        cleaned = phone_number.replace(' ', '').replace('-', '').replace('(', '').replace(')', '').strip()
        candidates = []
        if cleaned.startswith('0'):
            intl = '+63' + cleaned[1:]
            candidates = [intl, cleaned]
        elif cleaned.startswith('+63'):
            nat = '0' + cleaned[3:]
            candidates = [cleaned, nat]
        elif cleaned.startswith('63'):
            intl = '+' + cleaned
            nat = '0' + cleaned[2:]
            candidates = [intl, nat]
        else:
            candidates = ['+63' + cleaned, '0' + cleaned]
        return candidates

    def _send_modem_single(self, target_phone: str, message: str) -> Tuple[bool, str]:
        """Attempt sending to a specific formatted phone number via SIM900A"""
        try:
            # 1. Clear any pending prompts or leftover buffer
            self.serial_conn.write(b'\x1B\x1B\r\n')
            time.sleep(0.3)
            if hasattr(self.serial_conn, 'reset_input_buffer'):
                self.serial_conn.reset_input_buffer()

            # 2. Ensure mode is ready
            self.serial_conn.write(b'AT+CMGF=1\r')
            time.sleep(0.2)
            if hasattr(self.serial_conn, 'reset_input_buffer'):
                self.serial_conn.reset_input_buffer()

            # 3. Send destination number and wait for '>' (allow up to 8s)
            cmd = f'AT+CMGS="{target_phone}"\r'.encode()
            self.serial_conn.write(cmd)

            prompt_found = False
            start_prompt = time.time()
            prompt_buf = ""
            while time.time() - start_prompt < 8.0:
                if self.serial_conn.in_waiting > 0:
                    chunk = self.serial_conn.read(self.serial_conn.in_waiting).decode('utf-8', errors='ignore')
                    prompt_buf += chunk
                    if '>' in prompt_buf:
                        prompt_found = True
                        break
                    if 'ERROR' in prompt_buf:
                        break
                time.sleep(0.1)

            if not prompt_found:
                err = prompt_buf.strip() or "No '>' prompt from modem (timeout)"
                self.serial_conn.write(b'\x1B\x1B\r\n')
                time.sleep(0.3)
                if hasattr(self.serial_conn, 'reset_input_buffer'):
                    self.serial_conn.reset_input_buffer()
                return False, err

            # 4. Write message payload followed by Ctrl+Z (\x1A)
            msg_payload = f"{message}\x1A".encode('utf-8', errors='ignore')
            self.serial_conn.write(msg_payload)

            # 5. Wait for network acknowledgment (up to 20s)
            start_ack = time.time()
            ack_buf = ""
            success = False
            error_reason = ""

            while time.time() - start_ack < 20.0:
                if self.serial_conn.in_waiting > 0:
                    chunk = self.serial_conn.read(self.serial_conn.in_waiting).decode('utf-8', errors='ignore')
                    ack_buf += chunk
                    if '+CMGS:' in ack_buf:
                        success = True
                        break
                    if 'ERROR' in ack_buf:
                        error_reason = ack_buf.strip()
                        break
                time.sleep(0.2)

            if success:
                return True, "Delivered (+CMGS confirmed)"
            else:
                if not error_reason:
                    error_reason = f"Timeout waiting for ACK (got: {repr(ack_buf.strip())})"
                self.serial_conn.write(b'\x1B\x1B\r\n')
                time.sleep(0.3)
                if hasattr(self.serial_conn, 'reset_input_buffer'):
                    self.serial_conn.reset_input_buffer()
                return False, error_reason

        except Exception as e:
            self.connected = False
            return False, str(e)

    def send_sms(self, phone_number: str, message: str) -> Tuple[bool, str]:
        """Send SMS via SIM900A hardware modem"""
        if self.connected or self._connect_hardware():
            candidate_numbers = self._format_numbers(phone_number)
            last_err = ""

            for num in candidate_numbers:
                logger.info(f"Sending via SIM900A to {num}: {message[:50]}...")
                success, reason = self._send_modem_single(num, message)
                if success:
                    logger.info(f"SMS successfully sent to {num} via SIM900A")
                    return True, reason
                last_err = reason
                logger.warning(f"SIM900A send failed for {num}: {reason}")
                time.sleep(1.0)

            return False, f"SIM900A: {last_err}"
        else:
            return False, "SIM900A hardware modem not connected"

    def fetch_pending_sms(self) -> List[Dict]:
        """Fetch pending or failed retriable SMS messages from Supabase"""
        if not self.supabase:
            return []

        try:
            res = self.supabase.table('sms_queue') \
                .select('*') \
                .in_('status', ['pending', 'failed']) \
                .lt('retry_count', 3) \
                .order('priority', desc=True) \
                .order('created_at', desc=False) \
                .limit(self.batch_limit) \
                .execute()

            if res.data:
                logger.info(f"Fetched {len(res.data)} pending/retriable SMS message(s)")
                return res.data
            return []
        except Exception as e:
            logger.error(f"Failed to fetch pending SMS from Supabase: {e}")
            return []

    def update_sms_status(self, sms_id: str, status: str, error_message: Optional[str] = None):
        """Update message status and timestamps in Supabase"""
        if not self.supabase:
            return

        try:
            current = self.supabase.table('sms_queue').select('retry_count').eq('id', sms_id).execute()
            current_retries = current.data[0].get('retry_count', 0) if current.data else 0
            new_retries = current_retries + 1

            update_data = {
                'status': status,
                'retry_count': new_retries
            }

            now_iso = datetime.now().isoformat()
            if status == 'sent':
                update_data['sent_at'] = now_iso
                update_data['error_message'] = None
            elif status == 'failed':
                update_data['failed_at'] = now_iso
                update_data['error_message'] = error_message or 'Transmission failed'
                if new_retries >= 3:
                    update_data['status'] = 'permanently_failed'
                    logger.warning(f"SMS {sms_id} marked as permanently_failed after {new_retries} attempts")

            self.supabase.table('sms_queue').update(update_data).eq('id', sms_id).execute()
            logger.info(f"Updated SMS {sms_id} -> {update_data['status']} (attempt {new_retries})")
        except Exception as e:
            logger.error(f"Failed to update status for SMS {sms_id}: {e}")

    def process_queue(self):
        """Fetch and process the pending queue"""
        messages = self.fetch_pending_sms()
        if not messages:
            return

        for sms in messages:
            sms_id = sms.get('id')
            phone = sms.get('phone_number')
            text = sms.get('message')
            sms_type = sms.get('sms_type', 'reservation_confirmation')

            if not phone or not text:
                logger.warning(f"Skipping malformed SMS {sms_id} (missing phone or message)")
                self.update_sms_status(sms_id, 'permanently_failed', 'Missing phone number or message body')
                continue

            logger.info(f"Processing SMS {sms_id} [{sms_type}] for {phone}")
            success, reason = self.send_sms(phone, text)

            if success:
                self.update_sms_status(sms_id, 'sent')
            else:
                self.update_sms_status(sms_id, 'failed', reason)

            time.sleep(1.5)

    def run(self):
        """Main service polling loop"""
        logger.info(f"SMS Service running. Polling every {self.poll_interval}s on {self.port}...")
        while True:
            try:
                if not self.connected:
                    self._connect_hardware()

                if self.connected:
                    self.process_queue()
                else:
                    logger.warning(f"Modem unavailable on {self.port}. Retrying connection next cycle...")

                time.sleep(self.poll_interval)
            except KeyboardInterrupt:
                logger.info("Service stopping due to keyboard interrupt...")
                break
            except Exception as e:
                logger.error(f"Unexpected error in main polling loop: {e}")
                time.sleep(self.poll_interval)

    def disconnect(self):
        if self._lock_fp:
            try:
                import fcntl
                fcntl.flock(self._lock_fp, fcntl.LOCK_UN)
                self._lock_fp.close()
            except Exception:
                pass
            self._lock_fp = None

        if self.serial_conn:
            try:
                self.serial_conn.close()
            except Exception:
                pass
            self.connected = False
            logger.info("SIM900A disconnected")


def main():
    service = SIM900AQueueProcessor()
    try:
        service.run()
    finally:
        service.disconnect()


if __name__ == "__main__":
    main()