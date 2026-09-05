#!/usr/bin/env python3
"""
Hardware Integration Module for Bus Monitoring System
Integrates SIM900A SMS, NEO-6M GPS, Google Maps Geolocation, and Emergency Button
"""

import serial
import time
import threading
import requests
import json
import logging
from typing import Optional, Dict, Callable
from dataclasses import dataclass
import RPi.GPIO as GPIO
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class GPSLocation:
    latitude: float
    longitude: float
    altitude: float
    speed: float
    timestamp: float
    accuracy: float
    source: str  # 'gps' or 'geolocation'

class SIM900A:
    """SIM900A GSM Module for SMS Notifications"""
    
    def __init__(self, port: str = '/dev/ttyS0', baudrate: int = 9600):
        self.port = port
        self.baudrate = baudrate
        self.serial_connection = None
        self.connected = False
        
    def connect(self) -> bool:
        """Connect to SIM900A module"""
        try:
            self.serial_connection = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=1
            )
            # Test connection
            self.serial_connection.write(b'AT\r')
            response = self.serial_connection.read(100).decode()
            if 'OK' in response:
                self.connected = True
                logger.info("SIM900A connected successfully")
                return True
            else:
                logger.error("SIM900A connection failed")
                return False
        except Exception as e:
            logger.error(f"SIM900A connection error: {e}")
            return False
    
    def send_sms(self, phone_number: str, message: str, sms_type: str = 'transaction', 
                  trip_id: Optional[int] = None, transaction_id: Optional[int] = None, 
                  db_client=None) -> bool:
        """Send SMS notification and log to database"""
        if not self.connected:
            logger.error("SIM900A not connected")
            # Log failed attempt to database
            if db_client:
                self._log_sms_to_db(phone_number, message, sms_type, 'failed', trip_id, transaction_id, db_client)
            return False
        
        try:
            # Set SMS mode to text
            self.serial_connection.write(b'AT+CMGF=1\r')
            time.sleep(0.5)
            
            # Set recipient
            self.serial_connection.write(f'AT+CMGS="{phone_number}"\r'.encode())
            time.sleep(0.5)
            
            # Send message
            self.serial_connection.write(f'{message}\x1A\r'.encode())
            time.sleep(2)
            
            response = self.serial_connection.read(100).decode()
            if 'OK' in response:
                logger.info(f"SMS sent to {phone_number}")
                # Log successful SMS to database
                if db_client:
                    self._log_sms_to_db(phone_number, message, sms_type, 'sent', trip_id, transaction_id, db_client)
                return True
            else:
                logger.error(f"Failed to send SMS to {phone_number}")
                # Log failed attempt to database
                if db_client:
                    self._log_sms_to_db(phone_number, message, sms_type, 'failed', trip_id, transaction_id, db_client)
                return False
        except Exception as e:
            logger.error(f"SMS sending error: {e}")
            # Log failed attempt to database
            if db_client:
                self._log_sms_to_db(phone_number, message, sms_type, 'failed', trip_id, transaction_id, db_client)
            return False
    
    def _log_sms_to_db(self, phone_number: str, message: str, sms_type: str, 
                       status: str, trip_id: Optional[int], transaction_id: Optional[int], db_client):
        """Log SMS to database"""
        try:
            data = {
                'phone_number': phone_number,
                'message': message,
                'sms_type': sms_type,
                'status': status,
                'trip_id': trip_id,
                'transaction_id': transaction_id
            }
            # Run in thread to avoid blocking
            import threading
            def log_to_db():
                try:
                    result = db_client.table('sms_logs').insert(data).execute()
                    logger.info(f"SMS logged to database: {sms_type} to {phone_number}")
                except Exception as e:
                    logger.error(f"Failed to log SMS to database: {e}")
            
            threading.Thread(target=log_to_db, daemon=True).start()
        except Exception as e:
            logger.error(f"Failed to start SMS logging thread: {e}")
    
    def send_bulk_sms(self, phone_numbers: list, message: str, sms_type: str = 'emergency',
                     trip_id: Optional[int] = None, db_client=None) -> Dict[str, bool]:
        """Send SMS to multiple recipients"""
        results = {}
        for phone_number in phone_numbers:
            results[phone_number] = self.send_sms(phone_number, message, sms_type, trip_id, None, db_client)
            time.sleep(1)  # Delay between messages
        return results
    
    def disconnect(self):
        """Disconnect from SIM900A"""
        if self.serial_connection:
            self.serial_connection.close()
            self.connected = False
            logger.info("SIM900A disconnected")

class NEO6M:
    """NEO-6M GPS Module for Location Tracking"""
    
    def __init__(self, port: str = '/dev/ttyS1', baudrate: int = 9600):
        self.port = port
        self.baudrate = baudrate
        self.serial_connection = None
        self.connected = False
        self.current_location: Optional[GPSLocation] = None
        self.location_history = []
        self.running = False
        self.stability_threshold = 0.0001  # Degrees for stability check
        self.min_fix_time = 10  # Minimum seconds for stable fix
        
    def connect(self) -> bool:
        """Connect to NEO-6M GPS module"""
        try:
            self.serial_connection = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=1
            )
            self.connected = True
            logger.info("NEO-6M GPS connected successfully")
            return True
        except Exception as e:
            logger.error(f"NEO-6M GPS connection error: {e}")
            return False
    
    def parse_nmea_sentence(self, sentence: str) -> Optional[dict]:
        """Parse NMEA sentence from GPS"""
        try:
            if not sentence.startswith('$'):
                return None
            
            parts = sentence.split(',')
            sentence_type = parts[0]
            
            if sentence_type == '$GPGGA':  # Global Positioning System Fix Data
                if len(parts) < 15:
                    return None
                
                # Parse time
                time_str = parts[1]
                # Parse latitude
                lat_str = parts[2]
                lat_dir = parts[3]
                # Parse longitude
                lon_str = parts[4]
                lon_dir = parts[5]
                # Parse fix quality
                fix_quality = int(parts[6])
                # Parse satellites
                satellites = int(parts[7])
                # Parse altitude
                altitude = float(parts[9]) if parts[9] else 0.0
                
                if fix_quality == 0:  # No fix
                    return None
                
                # Convert latitude
                if lat_str:
                    lat_deg = float(lat_str[:2])
                    lat_min = float(lat_str[2:])
                    latitude = lat_deg + (lat_min / 60.0)
                    if lat_dir == 'S':
                        latitude = -latitude
                else:
                    latitude = 0.0
                
                # Convert longitude
                if lon_str:
                    lon_deg = float(lon_str[:3])
                    lon_min = float(lon_str[3:])
                    longitude = lon_deg + (lon_min / 60.0)
                    if lon_dir == 'W':
                        longitude = -longitude
                else:
                    longitude = 0.0
                
                return {
                    'latitude': latitude,
                    'longitude': longitude,
                    'altitude': altitude,
                    'satellites': satellites,
                    'fix_quality': fix_quality,
                    'time': time_str
                }
            
            elif sentence_type == '$GPRMC':  # Recommended Minimum sentence
                if len(parts) < 12:
                    return None
                
                # Parse speed (knots)
                speed_knots = float(parts[7]) if parts[7] else 0.0
                speed_kmh = speed_knots * 1.852
                
                # Parse date
                date_str = parts[9]
                
                return {
                    'speed_kmh': speed_kmh,
                    'date': date_str
                }
            
            return None
        except Exception as e:
            logger.error(f"NMEA parsing error: {e}")
            return None
    
    def read_location(self, trip_id: Optional[int] = None, db_client=None) -> Optional[GPSLocation]:
        """Read current location from GPS and log to database"""
        if not self.connected:
            return None
        
        try:
            # Read data from GPS
            if self.serial_connection.in_waiting > 0:
                nmea_data = self.serial_connection.readline().decode('ascii', errors='ignore')
                
                # Parse NMEA sentence
                parsed_data = self.parse_nmea_sentence(nmea_data)
                if parsed_data:
                    # Create location object
                    location = GPSLocation(
                        latitude=parsed_data.get('latitude', 0.0),
                        longitude=parsed_data.get('longitude', 0.0),
                        altitude=parsed_data.get('altitude', 0.0),
                        speed=parsed_data.get('speed_kmh', 0.0),
                        timestamp=time.time(),
                        accuracy=10.0,  # Default GPS accuracy
                        source='gps'
                    )
                    
                    self.current_location = location
                    self.location_history.append(location)
                    
                    # Keep only last 100 locations
                    if len(self.location_history) > 100:
                        self.location_history.pop(0)
                    
                    # Log location to database
                    if db_client:
                        self._log_location_to_db(location, trip_id, parsed_data, db_client)
                    
                    return location
            
            return None
        except Exception as e:
            logger.error(f"GPS read error: {e}")
            return None
    
    def _log_location_to_db(self, location: GPSLocation, trip_id: Optional[int], 
                           parsed_data: dict, db_client):
        """Log GPS location to database"""
        try:
            data = {
                'latitude': location.latitude,
                'longitude': location.longitude,
                'altitude': location.altitude,
                'speed': location.speed,
                'accuracy': location.accuracy,
                'source': location.source,
                'trip_id': trip_id,
                'satellite_count': parsed_data.get('satellites'),
                'fix_quality': parsed_data.get('fix_quality')
            }
            # Run in thread to avoid blocking
            import threading
            def log_to_db():
                try:
                    db_client.table('gps_locations').insert(data).execute()
                    logger.debug(f"GPS location logged to database")
                except Exception as e:
                    logger.error(f"Failed to log GPS location to database: {e}")
            
            threading.Thread(target=log_to_db, daemon=True).start()
        except Exception as e:
            logger.error(f"Failed to start GPS logging thread: {e}")
    
    def is_location_stable(self) -> bool:
        """Check if GPS location is stable"""
        if len(self.location_history) < 5:
            return False
        
        recent_locations = self.location_history[-5:]
        lat_variance = max(loc.latitude for loc in recent_locations) - min(loc.latitude for loc in recent_locations)
        lon_variance = max(loc.longitude for loc in recent_locations) - min(loc.longitude for loc in recent_locations)
        
        return (lat_variance < self.stability_threshold and 
                lon_variance < self.stability_threshold)
    
    def start_continuous_tracking(self, callback: Callable[[GPSLocation], None], 
                                trip_id: Optional[int] = None, db_client=None):
        """Start continuous GPS tracking"""
        self.running = True
        
        def tracking_loop():
            while self.running:
                location = self.read_location(trip_id, db_client)
                if location and callback:
                    callback(location)
                time.sleep(1)
        
        thread = threading.Thread(target=tracking_loop, daemon=True)
        thread.start()
        logger.info("GPS continuous tracking started")
    
    def stop_continuous_tracking(self):
        """Stop continuous GPS tracking"""
        self.running = False
        logger.info("GPS continuous tracking stopped")
    
    def disconnect(self):
        """Disconnect from NEO-6M GPS"""
        if self.serial_connection:
            self.serial_connection.close()
            self.connected = False
            self.running = False
            logger.info("NEO-6M GPS disconnected")

class OpenStreetMapGeolocation:
    """OpenStreetMap-based geolocation using multiple free services"""
    
    def __init__(self, user_agent: str = "BusMonitoringSystem"):
        self.user_agent = user_agent
        self.ips = [
            "https://ipapi.co/json/",  # Free IP geolocation
            "https://ipinfo.io/json",   # Free IP geolocation (1k requests/month)
            "https://ip-api.com/json/"  # Free IP geolocation (45 requests/minute)
        ]
        self.current_ip_index = 0
        
    def get_ip_location(self) -> Optional[GPSLocation]:
        """Get location using IP-based geolocation services"""
        for attempt in range(len(self.ips)):
            try:
                ip_service = self.ips[(self.current_ip_index + attempt) % len(self.ips)]
                headers = {'User-Agent': self.user_agent}
                
                response = requests.get(ip_service, headers=headers, timeout=5)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Parse different API response formats
                    if 'lat' in data and 'lon' in data:
                        # ipapi.co format
                        lat = float(data['lat'])
                        lon = float(data['lon'])
                        accuracy = 1000.0  # IP-based accuracy is typically lower
                    elif 'loc' in data:
                        # ipinfo.io format
                        loc = data['loc'].split(',')
                        lat = float(loc[0])
                        lon = float(loc[1])
                        accuracy = 1000.0
                    elif 'latitude' in data and 'longitude' in data:
                        # ip-api.com format
                        lat = float(data['latitude'])
                        lon = float(data['longitude'])
                        accuracy = 1000.0
                    else:
                        logger.warning(f"Unknown response format from {ip_service}")
                        continue
                    
                    logger.info(f"IP geolocation successful using {ip_service}")
                    return GPSLocation(
                        latitude=lat,
                        longitude=lon,
                        altitude=0.0,
                        speed=0.0,
                        timestamp=time.time(),
                        accuracy=accuracy,
                        source='ip_geolocation'
                    )
                    
            except Exception as e:
                logger.warning(f"IP geolocation attempt {attempt + 1} failed: {e}")
                continue
        
        logger.error("All IP geolocation services failed")
        return None
    
    def get_location(self) -> Optional[GPSLocation]:
        """Get location using IP-based geolocation"""
        return self.get_ip_location()

class NominatimGeocoding:
    """OpenStreetMap Nominatim API for reverse geocoding"""
    
    def __init__(self, user_agent: str = "BusMonitoringSystem"):
        self.user_agent = user_agent
        self.base_url = "https://nominatim.openstreetmap.org/reverse"
        
    def get_address_from_coordinates(self, lat: float, lon: float) -> Optional[dict]:
        """Get address information from coordinates using Nominatim"""
        try:
            params = {
                'lat': lat,
                'lon': lon,
                'format': 'json'
            }
            headers = {'User-Agent': self.user_agent}
            
            response = requests.get(self.base_url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'address': data.get('display_name', ''),
                    'city': data.get('address', {}).get('city', ''),
                    'country': data.get('address', {}).get('country', ''),
                    'postcode': data.get('address', {}).get('postcode', '')
                }
            else:
                logger.error(f"Nominatim API error: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Nominatim geocoding error: {e}")
            return None

class EmergencyButton:
    """Emergency Button Handler using GPIO"""
    
    def __init__(self, gpio_pin: int = 18, emergency_callback: Optional[Callable] = None):
        self.gpio_pin = gpio_pin
        self.emergency_callback = emergency_callback
        self.emergency_active = False
        self.last_emergency_time = 0
        self.debounce_time = 2.0  # Seconds
        self.monitoring = False
        
    def setup_gpio(self):
        """Setup GPIO for emergency button"""
        try:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.gpio_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            logger.info(f"Emergency button GPIO setup on pin {self.gpio_pin}")
        except Exception as e:
            logger.error(f"GPIO setup error: {e}")
    
    def emergency_triggered(self, channel):
        """Handle emergency button press"""
        current_time = time.time()
        
        # Debounce check
        if current_time - self.last_emergency_time < self.debounce_time:
            return
        
        self.last_emergency_time = current_time
        self.emergency_active = True
        
        logger.warning("EMERGENCY BUTTON TRIGGERED!")
        
        if self.emergency_callback:
            self.emergency_callback()
    
    def start_monitoring(self):
        """Start monitoring emergency button"""
        if not self.monitoring:
            GPIO.add_event_detect(
                self.gpio_pin,
                GPIO.FALLING,
                callback=self.emergency_triggered,
                bouncetime=200
            )
            self.monitoring = True
            logger.info("Emergency button monitoring started")
    
    def stop_monitoring(self):
        """Stop monitoring emergency button"""
        if self.monitoring:
            GPIO.remove_event_detect(self.gpio_pin)
            self.monitoring = False
            logger.info("Emergency button monitoring stopped")
    
    def reset_emergency(self):
        """Reset emergency state"""
        self.emergency_active = False
        logger.info("Emergency state reset")
    
    def cleanup(self):
        """Cleanup GPIO resources"""
        self.stop_monitoring()
        GPIO.cleanup()
        logger.info("Emergency button GPIO cleanup completed")

class HardwareManager:
    """Main Hardware Manager integrating all hardware components"""
    
    def __init__(self, config: dict, db_client=None):
        self.config = config
        self.db_client = db_client
        self.sim900a: Optional[SIM900A] = None
        self.neo6m: Optional[NEO6M] = None
        self.osm_geolocation: Optional[OpenStreetMapGeolocation] = None
        self.nominatim: Optional[NominatimGeocoding] = None
        self.emergency_button: Optional[EmergencyButton] = None
        
        self.current_location: Optional[GPSLocation] = None
        self.emergency_contacts = config.get('emergency_contacts', [])
        self.admin_contacts = config.get('admin_contacts', [])
        self.current_trip_id: Optional[int] = None
        
        # Hardware availability flags
        self.camera_available = True  # Camera is managed by video processor
        self.gps_available = False
        self.sms_available = False
        self.emergency_button_available = False
        
    def initialize(self) -> bool:
        """Initialize all hardware components"""
        success = True
        
        # Initialize SIM900A
        if self.config.get('enable_sms', True):
            self.sim900a = SIM900A(
                port=self.config.get('sim900a_port', '/dev/ttyS0'),
                baudrate=self.config.get('sim900a_baudrate', 9600)
            )
            if self.sim900a.connect():
                self.sms_available = True
                self._update_hardware_status('sim900a', 'online')
            else:
                logger.error("Failed to initialize SIM900A")
                self.sms_available = False
                self._update_hardware_status('sim900a', 'offline')
                success = False
        
        # Initialize NEO-6M GPS
        if self.config.get('enable_gps', True):
            self.neo6m = NEO6M(
                port=self.config.get('neo6m_port', '/dev/ttyS1'),
                baudrate=self.config.get('neo6m_baudrate', 9600)
            )
            if self.neo6m.connect():
                self.gps_available = True
                self._update_hardware_status('neo6m', 'online')
            else:
                logger.error("Failed to initialize NEO-6M GPS")
                self.gps_available = False
                self._update_hardware_status('neo6m', 'offline')
                success = False
        
        # Initialize OpenStreetMap Geolocation (free alternative)
        if self.config.get('enable_geolocation', True):
            self.osm_geolocation = OpenStreetMapGeolocation(
                user_agent=self.config.get('osm_user_agent', 'BusMonitoringSystem')
            )
            self.nominatim = NominatimGeocoding(
                user_agent=self.config.get('osm_user_agent', 'BusMonitoringSystem')
            )
            logger.info("OpenStreetMap geolocation services initialized")
        
        # Initialize Emergency Button
        if self.config.get('enable_emergency_button', True):
            self.emergency_button = EmergencyButton(
                gpio_pin=self.config.get('emergency_button_pin', 18),
                emergency_callback=self.handle_emergency
            )
            self.emergency_button.setup_gpio()
            self.emergency_button.start_monitoring()
            self.emergency_button_available = True
            self._update_hardware_status('emergency_button', 'online')
            logger.info("Emergency button initialized")
        
        return success
    
    def get_location(self) -> Optional[GPSLocation]:
        """Get current location with GPS fallback to geolocation"""
        # Try GPS first
        if self.neo6m and self.neo6m.connected:
            location = self.neo6m.read_location(self.current_trip_id, self.db_client)
            if location:
                # Check if GPS is stable
                if self.neo6m.is_location_stable():
                    self.current_location = location
                    return location
                else:
                    logger.warning("GPS location unstable, using geolocation fallback")
        
        # Fallback to OpenStreetMap IP-based geolocation
        if self.osm_geolocation:
            location = self.osm_geolocation.get_location()
            if location:
                self.current_location = location
                # Log geolocation to database
                if self.db_client:
                    self._log_location_to_db(location, self.current_trip_id, self.db_client)
                return location
        
        logger.error("Unable to get location from any source")
        return None
    
    def get_address_from_location(self, lat: float, lon: float) -> Optional[dict]:
        """Get address information from coordinates using OpenStreetMap Nominatim"""
        if self.nominatim:
            return self.nominatim.get_address_from_coordinates(lat, lon)
        return None
    
    def handle_emergency(self):
        """Handle emergency situation"""
        logger.warning("EMERGENCY SITUATION DETECTED!")
        
        # Get current location
        location = self.get_location()
        
        # Log emergency to database
        emergency_id = self._log_emergency_to_db(location)
        
        # Send emergency SMS to contacts
        if self.sim900a and self.emergency_contacts:
            message = f"EMERGENCY: Bus system emergency alert!"
            if location:
                message += f" Location: {location.latitude}, {location.longitude}"
            
            results = self.sim900a.send_bulk_sms(
                self.emergency_contacts, message, 'emergency', 
                self.current_trip_id, self.db_client
            )
            logger.info(f"Emergency SMS sent: {results}")
        
        # Send to admin contacts
        if self.sim900a and self.admin_contacts:
            admin_message = f"ADMIN ALERT: Emergency situation detected on bus system."
            if location:
                admin_message += f" Location: {location.latitude}, {location.longitude}"
            
            self.sim900a.send_bulk_sms(
                self.admin_contacts, admin_message, 'emergency', 
                self.current_trip_id, self.db_client
            )
    
    def send_transaction_notification(self, phone_number: str, transaction_type: str, amount: float, details: str = "", transaction_id: Optional[int] = None):
        """Send SMS notification for successful transaction"""
        if not self.sim900a or not self.sim900a.connected:
            logger.warning("SIM900A not available for transaction notification")
            return False
        
        message = f"Transaction Successful: {transaction_type}"
        message += f"\nAmount: ₱{amount:.2f}"
        if details:
            message += f"\n{details}"
        message += f"\nTime: {time.strftime('%Y-%m-%d %H:%M:%S')}"
        
        return self.sim900a.send_sms(phone_number, message, 'transaction', self.current_trip_id, transaction_id, self.db_client)
    
    def send_topup_notification(self, phone_number: str, amount: float, new_balance: float, transaction_id: Optional[int] = None):
        """Send SMS notification for successful top-up"""
        return self.send_transaction_notification(
            phone_number,
            "Wallet Top-up",
            amount,
            f"New Balance: ₱{new_balance:.2f}",
            transaction_id
        )
    
    def send_reload_notification(self, phone_number: str, amount: float, card_id: str, transaction_id: Optional[int] = None):
        """Send SMS notification for successful card reload"""
        return self.send_transaction_notification(
            phone_number,
            "Card Reload",
            amount,
            f"Card ID: {card_id}",
            transaction_id
        )
    
    def send_trip_completion_notification(self, phone_number: str, trip_details: dict):
        """Send SMS notification for successful bus trip completion"""
        if not self.sim900a or not self.sim900a.connected:
            logger.warning("SIM900A not available for trip notification")
            return False
        
        message = f"Trip Completed Successfully"
        message += f"\nBus: {trip_details.get('bus_number', 'N/A')}"
        message += f"\nRoute: {trip_details.get('route', 'N/A')}"
        message += f"\nFare: ₱{trip_details.get('fare', 0):.2f}"
        message += f"\nTime: {time.strftime('%Y-%m-%d %H:%M:%S')}"
        
        return self.sim900a.send_sms(phone_number, message, 'trip', self.current_trip_id, None, self.db_client)
    
    def start_gps_tracking(self, callback: Optional[Callable[[GPSLocation], None]] = None):
        """Start continuous GPS tracking"""
        if self.neo6m and self.neo6m.connected:
            self.neo6m.start_continuous_tracking(callback, self.current_trip_id, self.db_client)
    
    def stop_gps_tracking(self):
        """Stop continuous GPS tracking"""
        if self.neo6m:
            self.neo6m.stop_continuous_tracking()
    
    def set_current_trip(self, trip_id: int):
        """Set the current trip ID for database recording"""
        self.current_trip_id = trip_id
        logger.info(f"Current trip ID set to: {trip_id}")
    
    def clear_current_trip(self):
        """Clear the current trip ID"""
        self.current_trip_id = None
        logger.info("Current trip ID cleared")
    
    def _log_emergency_to_db(self, location: Optional[GPSLocation]) -> Optional[int]:
        """Log emergency to database"""
        if not self.db_client:
            return None
        
        try:
            data = {
                'location_lat': location.latitude if location else None,
                'location_lng': location.longitude if location else None,
                'location_source': location.source if location else 'unknown',
                'location_accuracy': location.accuracy if location else None,
                'trip_id': self.current_trip_id
            }
            # Run in thread to avoid blocking
            import threading
            emergency_id_container = [None]
            
            def log_to_db():
                try:
                    result = self.db_client.table('emergency_alerts').insert(data).execute()
                    emergency_id_container[0] = result.data[0]['id'] if result.data else None
                    logger.info(f"Emergency logged to database with ID: {emergency_id_container[0]}")
                except Exception as e:
                    logger.error(f"Failed to log emergency to database: {e}")
            
            threading.Thread(target=log_to_db, daemon=True).start()
            return emergency_id_container[0]
        except Exception as e:
            logger.error(f"Failed to start emergency logging thread: {e}")
            return None
    
    def _log_location_to_db(self, location: GPSLocation, trip_id: Optional[int], db_client):
        """Log geolocation fallback to database"""
        try:
            data = {
                'latitude': location.latitude,
                'longitude': location.longitude,
                'altitude': location.altitude,
                'speed': location.speed,
                'accuracy': location.accuracy,
                'source': location.source,
                'trip_id': trip_id
            }
            # Run in thread to avoid blocking
            import threading
            def log_to_db():
                try:
                    db_client.table('gps_locations').insert(data).execute()
                    logger.debug(f"Geolocation logged to database")
                except Exception as e:
                    logger.error(f"Failed to log geolocation to database: {e}")
            
            threading.Thread(target=log_to_db, daemon=True).start()
        except Exception as e:
            logger.error(f"Failed to start geolocation logging thread: {e}")
    
    def _update_hardware_status(self, component: str, status: str, details: Optional[dict] = None):
        """Update hardware status in database"""
        if not self.db_client:
            return
        
        try:
            data = {
                'component': component,
                'status': status,
                'details': details or {}
            }
            # Run in thread to avoid blocking
            import threading
            def update_status():
                try:
                    self.db_client.table('hardware_status').insert(data).execute()
                    logger.info(f"Hardware status updated: {component} - {status}")
                except Exception as e:
                    logger.error(f"Failed to update hardware status: {e}")
            
            threading.Thread(target=update_status, daemon=True).start()
        except Exception as e:
            logger.error(f"Failed to start hardware status update thread: {e}")
    
    def resolve_emergency(self, emergency_id: int, resolved_by: int, notes: str = ""):
        """Resolve an emergency alert"""
        if not self.db_client:
            return False
        
        try:
            data = {
                'resolved': True,
                'resolved_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                'resolved_by': resolved_by,
                'notes': notes
            }
            self.db_client.table('emergency_alerts').update(data).eq('id', emergency_id).execute()
            logger.info(f"Emergency {emergency_id} resolved by user {resolved_by}")
            return True
        except Exception as e:
            logger.error(f"Failed to resolve emergency: {e}")
            return False
    
    def cleanup(self):
        """Cleanup all hardware resources"""
        if self.sim900a:
            self.sim900a.disconnect()
        if self.neo6m:
            self.neo6m.disconnect()
        if self.emergency_button:
            self.emergency_button.cleanup()
        logger.info("Hardware manager cleanup completed")
