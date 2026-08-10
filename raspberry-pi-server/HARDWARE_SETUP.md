# Hardware Integration Setup Guide

This guide covers the setup and configuration of hardware components for the Bus Monitoring System including SIM900A SMS notifications, NEO-6M GPS tracking, Google Maps geolocation fallback, and emergency button functionality.

## Database Setup

The hardware integration now includes full database persistence for all hardware events. Before setting up the hardware, you need to run the database setup script.

### 1. Run Database Setup Script

In your Supabase SQL Editor, run the complete `supabase_setup.sql` script. This creates the following tables:

#### SMS Logs Table
- Stores all SMS notifications with status tracking
- Includes phone numbers, message content, SMS type, and timestamps
- Links to trips and transactions for complete audit trail

#### GPS Locations Table
- Stores all GPS and geolocation readings
- Includes coordinates, accuracy, speed, and source
- Links to trips for route tracking and analysis

#### Emergency Alerts Table
- Stores all emergency situations
- Includes location data, resolution status, and timestamps
- Supports emergency management and reporting

#### Hardware Status Table
- Monitors hardware component status
- Tracks online/offline status and error conditions
- Enables hardware health monitoring

### 2. Database Views

The setup also creates useful views for statistics:

- `sms_statistics` - Daily SMS usage by type
- `gps_statistics` - Daily GPS accuracy and usage
- `emergency_statistics` - Emergency incident tracking
- `trip_statistics` - Trip passenger data (existing)

### 3. Row Level Security (RLS)

All tables have RLS policies configured:
- Authenticated users can read all data
- Service role (video server) can insert/update data
- Emergency alerts can be resolved by authenticated users

## Hardware Components

### 1. SIM900A GSM Module
- **Purpose**: SMS notifications for transactions, top-ups, reloads, trip completion, and emergencies
- **Connection**: UART serial communication
- **Default Port**: `/dev/ttyS0`
- **Baud Rate**: 9600

### 2. NEO-6M GPS Module
- **Purpose**: Real-time location tracking for bus monitoring
- **Connection**: UART serial communication
- **Default Port**: `/dev/ttyS1`
- **Baud Rate**: 9600
- **Fallback**: Google Maps Geolocation API when GPS is unstable

### 3. Emergency Button
- **Purpose**: Physical emergency trigger for immediate alerts
- **Connection**: GPIO pin
- **Default Pin**: GPIO 18
- **Type**: Momentary push button with pull-up resistor

## Hardware Wiring Diagram

### SIM900A GSM Module Connection
```
SIM900A Module    Raspberry Pi
---------------    ------------
VCC              5V
GND              GND
TXD              GPIO 15 (RXD) - /dev/ttyS0
RXD              GPIO 14 (TXD) - /dev/ttyS0
```

### NEO-6M GPS Module Connection
```
NEO-6M Module     Raspberry Pi
--------------    ------------
VCC              3.3V
GND              GND
TXD              GPIO 15 (RXD) - /dev/ttyS1
RXD              GPIO 14 (TXD) - /dev/ttyS1
PPS              GPIO 16 (optional)
```

### Emergency Button Connection
```
Emergency Button   Raspberry Pi
---------------    ------------
One Terminal      GPIO 18
Other Terminal    GND
(Use 10kΩ pull-up resistor)
```

## Software Setup

### 1. Enable Serial Ports on Raspberry Pi

```bash
# Enable serial interfaces
sudo raspi-config

# Navigate to:
# Interface Options → Serial Port
# - Enable serial port hardware: YES
# - Enable serial console: NO

# Reboot Raspberry Pi
sudo reboot
```

### 2. Install Dependencies

```bash
cd ~/bus-monitoring
pip3 install -r requirements.txt
```

The updated requirements.txt includes:
- `pyserial` - For serial communication with GSM and GPS modules
- `requests` - For Google Maps Geolocation API calls
- `RPi.GPIO` - For emergency button GPIO control
- `gps` - For GPS data processing

### 3. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
nano .env
```

Edit the following variables:

```env
# Hardware Configuration
ENABLE_SMS=true
ENABLE_GPS=true
ENABLE_EMERGENCY_BUTTON=true

# SIM900A Configuration
SIM900A_PORT=/dev/ttyS0
SIM900A_BAUDRATE=9600

# NEO-6M Configuration
NEO6M_PORT=/dev/ttyS1
NEO6M_BAUDRATE=9600

# Emergency Button
EMERGENCY_BUTTON_PIN=18

# Google Maps API
GOOGLE_API_KEY=your-google-maps-api-key-here

# Emergency Contacts
EMERGENCY_CONTACTS=+639123456789,+639987654321
ADMIN_CONTACTS=+639111222333
```

### 4. OpenStreetMap Geolocation Setup (Free)

The system now uses free OpenStreetMap-based services instead of Google Maps API:

**IP Geolocation Services Used:**
- ipapi.co (free, no rate limit)
- ipinfo.io (free, 1,000 requests/month)
- ip-api.com (free, 45 requests/minute)

**Reverse Geocoding:**
- OpenStreetMap Nominatim API (free, 1 request/second)

**Configuration:**
```env
ENABLE_GEOLOCATION=true
OSM_USER_AGENT=BusMonitoringSystem
```

**Usage Policy:**
- These services are free but have rate limits
- Nominatim requires a unique User-Agent string
- Consider caching results to reduce API calls
- For commercial use, check individual service terms

### 5. Test Hardware Connections

#### Test SIM900A Connection
```python
# Test script
import serial
ser = serial.Serial('/dev/ttyS0', 9600, timeout=1)
ser.write(b'AT\r')
response = ser.read(100).decode()
print(response)  # Should return "OK"
ser.close()
```

#### Test NEO-6M GPS Connection
```python
# Test script
import serial
ser = serial.Serial('/dev/ttyS1', 9600, timeout=1)
while True:
    if ser.in_waiting > 0:
        data = ser.readline().decode('ascii', errors='ignore')
        print(data.strip())  # Should show NMEA sentences
ser.close()
```

#### Test Emergency Button
```python
# Test script
import RPi.GPIO as GPIO
GPIO.setmode(GPIO.BCM)
GPIO.setup(18, GPIO.IN, pull_up_down=GPIO.PUD_UP)

def callback(channel):
    print("Emergency button pressed!")

GPIO.add_event_detect(18, GPIO.FALLING, callback=callback, bouncetime=200)

# Keep script running
input("Press Enter to exit...")
GPIO.cleanup()
```

## API Endpoints

### Hardware Data Retrieval

#### Get SMS Logs
```bash
GET /sms-logs?limit=100&offset=0
```
Returns SMS notification history:
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "phone_number": "+639123456789",
      "message": "Transaction Successful...",
      "sms_type": "transaction",
      "status": "sent",
      "trip_id": 123,
      "sent_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get GPS Locations
```bash
GET /gps-locations?trip_id=123&limit=100&offset=0
```
Returns GPS location history:
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "latitude": 14.5995,
      "longitude": 120.9842,
      "altitude": 50.0,
      "speed": 45.5,
      "accuracy": 10.0,
      "source": "gps",
      "trip_id": 123,
      "recorded_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Emergency Alerts
```bash
GET /emergency-alerts?resolved=false&limit=100&offset=0
```
Returns emergency alert history:
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "location_lat": 14.5995,
      "location_lng": 120.9842,
      "location_source": "gps",
      "trip_id": 123,
      "resolved": false,
      "triggered_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Resolve Emergency Alert
```bash
POST /resolve-emergency
Content-Type: application/json

{
  "emergency_id": 1,
  "resolved_by": 5,
  "notes": "Emergency resolved - false alarm"
}
```

#### Get Hardware Status
```bash
GET /hardware-status
```
Returns current hardware component status:
```json
{
  "status": "success",
  "data": [
    {
      "component": "sim900a",
      "status": "online",
      "last_check": "2024-01-15T10:30:00Z"
    },
    {
      "component": "neo6m",
      "status": "online",
      "last_check": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get SMS Statistics
```bash
GET /sms-statistics?days=7
```
Returns SMS usage statistics:
```json
{
  "status": "success",
  "data": {
    "total_sent": 150,
    "successful": 145,
    "failed": 5,
    "by_type": {
      "transaction": {"total": 100, "successful": 98, "failed": 2},
      "emergency": {"total": 5, "successful": 5, "failed": 0}
    }
  }
}
```

#### Get GPS Statistics
```bash
GET /gps-statistics?days=7
```
Returns GPS performance statistics:
```json
{
  "status": "success",
  "data": {
    "total_readings": 5000,
    "avg_accuracy": 8.5,
    "avg_speed": 35.2,
    "by_source": {
      "gps": 4500,
      "ip_geolocation": 500
    }
  }
}
```

#### Get Address from Coordinates
```bash
GET /address-lookup?lat=14.5995&lon=120.9842
```
Returns address information using OpenStreetMap Nominatim:
```json
{
  "status": "success",
  "data": {
    "address": "123 Main Street, Manila, Metro Manila, Philippines",
    "city": "Manila",
    "country": "Philippines",
    "postcode": "1000"
  }
}
```

### Location Services

#### Get Current Location
```bash
GET /location
```
Returns current GPS or geolocation data:
```json
{
  "latitude": 14.5995,
  "longitude": 120.9842,
  "altitude": 0.0,
  "speed": 0.0,
  "accuracy": 10.0,
  "source": "gps",
  "timestamp": 1691234567.89
}
```

### SMS Services

#### Send Custom SMS
```bash
POST /send-sms
Content-Type: application/json

{
  "phone_number": "+639123456789",
  "message": "Your message here"
}
```

#### Send Transaction Notification
```bash
POST /send-transaction-notification
Content-Type: application/json

{
  "phone_number": "+639123456789",
  "transaction_type": "Wallet Top-up",
  "amount": 100.00,
  "details": "New Balance: ₱500.00"
}
```

#### Send Top-up Notification
```bash
POST /send-topup-notification
Content-Type: application/json

{
  "phone_number": "+639123456789",
  "amount": 100.00,
  "new_balance": 500.00
}
```

#### Send Reload Notification
```bash
POST /send-reload-notification
Content-Type: application/json

{
  "phone_number": "+639123456789",
  "amount": 50.00,
  "card_id": "QR123456"
}
```

#### Send Trip Completion Notification
```bash
POST /send-trip-notification
Content-Type: application/json

{
  "phone_number": "+639123456789",
  "trip_details": {
    "bus_number": "BUS001",
    "route": "Manila to Quezon City",
    "fare": 25.00
  }
}
```

### Emergency Services

#### Get Emergency Status
```bash
GET /emergency-status
```
Returns:
```json
{
  "emergency_active": false,
  "monitoring": true,
  "last_emergency_time": 0
}
```

#### Reset Emergency State
```bash
POST /reset-emergency
```

#### Manually Trigger Emergency (Testing)
```bash
POST /trigger-emergency
```

## Usage Examples

### 1. Database Setup First

Before using hardware features, ensure the database is set up:

```bash
# Run the SQL setup script in Supabase SQL Editor
# Copy contents of supabase_setup.sql and execute
```

### 2. Starting the Server with Hardware Support

```bash
cd ~/bus-monitoring
python3 video_server_fastapi.py
```

The server will automatically:
- Initialize SIM900A for SMS
- Initialize NEO-6M GPS for location tracking
- Set up emergency button monitoring
- Start continuous GPS tracking
- Enable geolocation fallback

### 2. Sending SMS Notifications

From your web application, call the appropriate endpoint when transactions occur:

```javascript
// Example: Send top-up notification
fetch('http://raspberry-pi-ip:5000/send-topup-notification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone_number: '+639123456789',
    amount: 100.00,
    new_balance: 500.00
  })
});
```

### 3. Getting Bus Location

```javascript
// Get current bus location
fetch('http://raspberry-pi-ip:5000/location')
  .then(response => response.json())
  .then(data => {
    console.log('Bus Location:', data);
    // Update map with coordinates
  });
```

### 4. Handling Emergency Situations

When the emergency button is pressed:
1. System automatically gets current location
2. Sends emergency SMS to all configured contacts
3. Sends admin alert to admin contacts
4. Logs the emergency event

## Troubleshooting

### SIM900A Issues

**Problem**: SIM900A not connecting
- **Solution**: 
  - Check physical connections
  - Verify port: `ls /dev/ttyS*`
  - Test with minicom: `minicom -D /dev/ttyS0 -b 9600`
  - Check SIM card insertion and network signal

**Problem**: SMS not sending
- **Solution**:
  - Check SIM card has credit/balance
  - Verify network registration: `AT+CREG?`
  - Check signal strength: `AT+CSQ`

### NEO-6M GPS Issues

**Problem**: GPS not getting fix
- **Solution**:
  - Ensure GPS has clear view of sky
  - Wait longer for initial fix (can take 5-10 minutes)
  - Check baud rate matches module configuration
  - Verify antenna connection

**Problem**: GPS data unstable
- **Solution**:
  - System automatically falls back to Google Maps Geolocation
  - Check GPS antenna quality
  - Ensure module has stable power supply

### Emergency Button Issues

**Problem**: Button not triggering
- **Solution**:
  - Check GPIO pin configuration
  - Verify pull-up resistor is connected
  - Test with multimeter for proper voltage levels
  - Check button functionality

**Problem**: False triggers
- **Solution**:
  - Increase debounce time in configuration
  - Check for loose connections
  - Add capacitor for debouncing

### OpenStreetMap Geolocation Issues

**Problem**: IP geolocation not working
- **Solution**:
  - Check network connectivity
  - Verify which IP service is responding
  - Check service rate limits
  - Try different IP service manually

**Problem**: Nominatim reverse geocoding failing
- **Solution**:
  - Ensure User-Agent is set correctly
  - Check rate limit (1 request/second)
  - Verify coordinates are valid
  - Check Nominatim service status

## System Integration

### Database Integration with Hardware

All hardware operations are now automatically logged to the database:

#### SMS Logging
- Every SMS sent is logged with status (sent/failed)
- Includes phone number, message content, and type
- Links to trips and transactions for complete audit trail
- Failed SMS attempts are also logged for troubleshooting

#### GPS Location Logging
- GPS readings are automatically logged when tracking is active
- Includes coordinates, accuracy, speed, and satellite data
- IP geolocation fallback readings are also logged
- Links to current trip for route analysis

#### Emergency Alert Logging
- All emergency triggers are logged with location data
- Includes resolution status and timestamps
- Supports notes and resolution tracking
- Enables emergency reporting and analysis

#### Hardware Status Monitoring
- Component status is logged on initialization
- Tracks online/offline status and errors
- Enables hardware health monitoring
- Supports predictive maintenance

### Leaflet and OpenStreetMap Integration

The location data from this system works perfectly with Leaflet and OpenStreetMap:

#### Frontend Integration Example
```javascript
// Using Leaflet with OpenStreetMap tiles
const map = L.map('map').setView([14.5995, 120.9842], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Get bus location from API
fetch('http://raspberry-pi-ip:5000/location')
  .then(response => response.json())
  .then(data => {
    // Update bus marker on map
    if (data.latitude && data.longitude) {
      const busIcon = L.icon({
        iconUrl: 'bus-icon.png',
        iconSize: [32, 32]
      });
      
      L.marker([data.latitude, data.longitude], {icon: busIcon})
        .addTo(map)
        .bindPopup(`Bus Location<br>Source: ${data.source}<br>Accuracy: ${data.accuracy}m`);
    }
  });

// Get address for location
fetch(`http://raspberry-pi-ip:5000/address-lookup?lat=${lat}&lon=${lon}`)
  .then(response => response.json())
  .then(data => {
    if (data.status === 'success') {
      console.log('Address:', data.data.address);
    }
  });
```

#### GPS History Visualization
```javascript
// Get GPS history for a trip
fetch(`http://raspberry-pi-ip:5000/gps-locations?trip_id=123`)
  .then(response => response.json())
  .then(data => {
    if (data.status === 'success') {
      // Create polyline for route
      const latlngs = data.data.map(loc => [loc.latitude, loc.longitude]);
      L.polyline(latlngs, {color: 'blue'}).addTo(map);
      
      // Add markers for GPS vs IP geolocation
      data.data.forEach(loc => {
        const color = loc.source === 'gps' ? 'green' : 'orange';
        L.circleMarker([loc.latitude, loc.longitude], {
          radius: 5,
          fillColor: color,
          color: color,
          weight: 1
        }).addTo(map);
      });
    }
  });
```

#### Real-time Bus Tracking
```javascript
// Update bus location every 5 seconds
setInterval(() => {
  fetch('http://raspberry-pi-ip:5000/location')
    .then(response => response.json())
    .then(data => {
      if (data.latitude && data.longitude) {
        // Update existing marker position
        busMarker.setLatLng([data.latitude, data.longitude]);
        map.panTo([data.latitude, data.longitude]);
      }
    });
}, 5000);

### Integration with Video Server

The hardware integration is automatically available in the video server:

```python
# Location data is available during video processing
location = hardware_manager.get_location()
if location:
    print(f"Bus at: {location.latitude}, {location.longitude}")
```

### Integration with Trip Management

When starting a trip, you can automatically enable location tracking:

```bash
# Set trip ID for location recording
curl -X POST http://raspberry-pi-ip:5000/set-trip \
  -H "Content-Type: application/json" \
  -d '{"trip_id": 123}'
```

### Integration with Emergency Alerts

Emergency button triggers automatic SMS to contacts:

1. Emergency contacts receive: "EMERGENCY: Bus system emergency alert! Location: lat, lng"
2. Admin contacts receive: "ADMIN ALERT: Emergency situation detected on bus system. Location: lat, lng"

## Security Considerations

1. **API Keys**: Never commit Google Maps API key to version control
2. **Phone Numbers**: Validate and sanitize phone numbers before sending SMS
3. **Emergency Contacts**: Configure trusted contacts only
4. **Rate Limiting**: Implement rate limiting for SMS to prevent abuse
5. **Physical Security**: Protect emergency button from accidental triggers

## Performance Optimization

1. **GPS Update Rate**: Adjust GPS polling frequency based on requirements
2. **SMS Batching**: Batch multiple notifications when possible
3. **Geolocation Caching**: Cache geolocation results to reduce API calls
4. **Emergency Debounce**: Configure appropriate debounce time for button

## Maintenance

### Regular Checks

1. **Signal Strength**: Monitor GSM signal quality regularly
2. **GPS Accuracy**: Check GPS fix quality and satellite count
3. **Button Functionality**: Test emergency button periodically
4. **API Quotas**: Monitor Google Maps API usage

### Updating Configuration

To update hardware configuration:

```bash
# Edit .env file
nano .env

# Restart server
sudo systemctl restart bus-monitoring
```

## Advanced Configuration

### Custom GPS Polling Rate

Edit `hardware_integration.py` to adjust GPS polling frequency:

```python
# In NEO6M class
def start_continuous_tracking(self, callback, poll_interval=1.0):
    """Start continuous GPS tracking with custom interval"""
    self.poll_interval = poll_interval
    # ... rest of implementation
```

### Custom SMS Templates

Modify SMS templates in `HardwareManager` class:

```python
def send_transaction_notification(self, phone_number, transaction_type, amount, details=""):
    message = f"Custom message: {transaction_type}"
    # ... customize as needed
```

### Multiple Emergency Buttons

To add multiple emergency buttons:

```python
# Initialize multiple buttons
emergency_buttons = [
    EmergencyButton(gpio_pin=18, emergency_callback=self.handle_emergency),
    EmergencyButton(gpio_pin=19, emergency_callback=self.handle_emergency)
]
```

## Support and Resources

- **SIM900A Datasheet**: [SIMCom Documentation](https://www.simcom.com/)
- **NEO-6M Datasheet**: [u-blox Documentation](https://www.u-blox.com/)
- **OpenStreetMap Nominatim**: [OSM Documentation](https://nominatim.org/release-docs/latest/api/Overview/)
- **ipapi.co**: [IP Geolocation API](https://ipapi.co/)
- **ipinfo.io**: [IP Geolocation API](https://ipinfo.io/)
- **ip-api.com**: [IP Geolocation API](http://ip-api.com/)
- **Leaflet.js**: [Leaflet Documentation](https://leafletjs.com/)
- **OpenStreetMap**: [OSM Wiki](https://wiki.openstreetmap.org/)
- **RPi.GPIO Documentation**: [RPi.GPIO Wiki](https://sourceforge.net/p/raspberry-gpio-python/wiki/)

## License

This hardware integration is part of the Bus Monitoring System. Ensure compliance with:
- SIM900A regulatory requirements in your region
- Google Maps API terms of service
- Local emergency communication regulations
