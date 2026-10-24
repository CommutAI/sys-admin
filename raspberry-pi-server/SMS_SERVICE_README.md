# Standalone SMS Service

A dedicated, independent SMS service for the Bus Monitoring System that doesn't depend on video/camera modules.

## Features

- **Independent Operation**: Runs as a separate service without dependencies on video/camera modules
- **Database Integration**: Fetches contacts from Supabase `emergency_contacts` table
- **Environment Fallback**: Uses environment variables if database is unavailable
- **Bulk SMS**: Send to multiple recipients
- **SMS Logging**: Logs all SMS to database for tracking
- **Command Line Interface**: Easy to use CLI for testing and operations
- **Systemd Service**: Can run as a background service

## SMS Functionalities

The service provides 5 specific SMS functionalities:

### 1. Reservation Confirmation (Public Dashboard)
Sends confirmation when a passenger successfully makes a pre-reservation.

**Message Template:**
```
RESERVATION CONFIRMED
ID: RES001
Passenger: Juan Dela Cruz
Route: Manila to Baguio
Schedule: 2024-10-25 08:00
Seats: 2
Total Fare: ₱500.00
```

**SMS Type:** `reservation_confirmation`

### 2. Card Approval/Decline (System Admin)
Sends notification when an admin approves or declines a QR card application.

**Approved Message:**
```
CARD APPROVED
Card ID: CARD001
Holder: Juan Dela Cruz
Your QR card reservation has been approved.
Please claim your card at the pickup terminal within 7 days.
```

**Declined Message:**
```
CARD DECLINED
Card ID: CARD001
Holder: Juan Dela Cruz
Reason: Invalid ID documents
Please contact customer service for assistance.
```

**SMS Type:** `card_approved` or `card_declined`

### 3. Emergency Alert (Driver/Conductor)
Sends emergency alert from bus driver or conductor to all emergency contacts.

**Message Template:**
```
🚨 EMERGENCY ALERT
Bus: BUS-123
Driver: Juan Dela Cruz
Location: 16.4023, 120.5960
```

**SMS Type:** `emergency_bus`

### 4. Trip Completion Confirmation (After Alighting)
Sends confirmation when a passenger completes their trip and alights.

**Message Template:**
```
TRIP COMPLETED
Passenger: Juan Dela Cruz
Bus: BUS-123
Route: Manila to Baguio
Alighting: Baguio Terminal
Fare: ₱250.00
Distance: 250.5 km
Thank you for riding with us!
```

**SMS Type:** `trip_completion`

### 5. Top-up Confirmation (Customer Service)
Sends confirmation when a QR card is topped up at customer service.

**Message Template:**
```
TOP-UP SUCCESSFUL
Card ID: CARD001
Holder: Juan Dela Cruz
Amount: ₱500.00
New Balance: ₱1500.00
Ref: TXN12345
Thank you for reloading!
```

**SMS Type:** `topup`

## Installation

### Prerequisites

```bash
# Install Python dependencies
pip install pyserial supabase python-dotenv
```

### Configuration

Create or update `.env` file in `raspberry-pi-server/`:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# SIM900A Configuration
SIM900A_PORT=/dev/ttyUSB0
SIM900A_BAUDRATE=9600

# Fallback Contacts (used if database unavailable)
EMERGENCY_CONTACTS=+639123456789,+639987654321
ADMIN_CONTACTS=+639123456789
```

## Usage

### Command Line Interface

#### Test SMS to single number
```bash
python3 sms_service.py test +639123456789 "Test message"
```

#### Send emergency alert from driver/conductor
```bash
python3 sms_service.py emergency "Emergency situation detected"
```

#### Send admin alert
```bash
python3 sms_service.py admin "System notification"
```

#### Send reservation confirmation (from public dashboard)
```bash
python3 sms_service.py reservation +639123456789 "RES001" "Juan Dela Cruz" "Manila to Baguio" "2024-10-25 08:00" 2 500.00
```

#### Send card approval/decline notification
```bash
# Approved
python3 sms_service.py card +639123456789 "CARD001" "Juan Dela Cruz" "approved"

# Declined with reason
python3 sms_service.py card +639123456789 "CARD001" "Juan Dela Cruz" "declined" "Invalid ID documents"
```

#### Send trip completion confirmation (after alighting)
```bash
python3 sms_service.py trip +639123456789 "Juan Dela Cruz" "BUS-123" "Manila to Baguio" 250.00 "Baguio Terminal" 250.5
```

#### Send top-up confirmation (customer service)
```bash
python3 sms_service.py topup +639123456789 "CARD001" "Juan Dela Cruz" 500.00 1500.00 "TXN12345"
```

#### Refresh contacts from database
```bash
python3 sms_service.py refresh
```

#### Check service status
```bash
python3 sms_service.py status
```

### Running as a Systemd Service

1. Copy the service file:
```bash
sudo cp sms-service.service /etc/systemd/system/
```

2. Update the service file with your user name (change `chichi` to your username):
```bash
sudo nano /etc/systemd/system/sms-service.service
```

3. Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable sms-service
sudo systemctl start sms-service
```

4. Check status:
```bash
sudo systemctl status sms-service
```

5. View logs:
```bash
sudo journalctl -u sms-service -f
```

## API Endpoints (if running with FastAPI)

You can integrate this service with FastAPI by wrapping it in a simple API server. Example endpoints:

- `POST /sms/send` - Send SMS to single number
- `POST /sms/emergency` - Send emergency alert
- `POST /sms/admin` - Send admin alert
- `POST /sms/refresh` - Refresh contacts
- `GET /sms/status` - Get service status

## Database Schema

The service uses the `emergency_contacts` table:

```sql
CREATE TABLE emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

SMS logs are stored in `sms_logs`:

```sql
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  sms_type TEXT NOT NULL, -- 'reservation_confirmation', 'card_approved', 'card_declined',
                          -- 'emergency_bus', 'trip_completion', 'topup', 'emergency', 'admin'
  status TEXT NOT NULL, -- 'sent', 'failed'
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

**SMS Types:**
- `reservation_confirmation` - Pre-reservation confirmation from public dashboard
- `card_approved` - Card approved by admin
- `card_declined` - Card declined by admin
- `emergency_bus` - Emergency alert from driver/conductor
- `trip_completion` - Trip completion after alighting
- `topup` - QR card top-up confirmation
- `emergency` - General emergency alert
- `admin` - Admin notification

## Integration with Main System

### Option 1: Use as Standalone Service

Run SMS service independently and call it via subprocess or HTTP API.

```python
import subprocess

# Send reservation confirmation
subprocess.run([
    'python3', 'sms_service.py', 'reservation',
    '+639123456789', 'RES001', 'Juan Dela Cruz',
    'Manila to Baguio', '2024-10-25 08:00', '2', '500.00'
])

# Send emergency alert
subprocess.run([
    'python3', 'sms_service.py', 'emergency',
    'Medical emergency on board'
])
```

### Option 2: Import as Module

```python
from sms_service import SMSService

# Initialize
sms = SMSService()

# 1. Send reservation confirmation
result = sms.send_reservation_confirmation(
    phone_number='+639123456789',
    reservation_id='RES001',
    passenger_name='Juan Dela Cruz',
    route='Manila to Baguio',
    schedule='2024-10-25 08:00',
    seats=2,
    total_fare=500.00
)

# 2. Send card approval notification
result = sms.send_card_approval_notification(
    phone_number='+639123456789',
    card_id='CARD001',
    card_holder='Juan Dela Cruz',
    status='approved'
)

# 3. Send emergency alert from bus
result = sms.send_emergency_alert_from_bus(
    message='Medical emergency on board',
    location={'lat': 16.4023, 'lng': 120.5960},
    bus_number='BUS-123',
    driver_name='Juan Dela Cruz'
)

# 4. Send trip completion confirmation
result = sms.send_trip_completion_confirmation(
    phone_number='+639123456789',
    passenger_name='Juan Dela Cruz',
    bus_number='BUS-123',
    route='Manila to Baguio',
    fare=250.00,
    alighting_stop='Baguio Terminal',
    distance=250.5
)

# 5. Send top-up confirmation
result = sms.send_topup_confirmation(
    phone_number='+639123456789',
    card_id='CARD001',
    card_holder='Juan Dela Cruz',
    amount=500.00,
    new_balance=1500.00,
    transaction_id='TXN12345'
)

# Check status
status = sms.check_status()
```

### Option 3: Replace HardwareManager SMS

You can modify `hardware_integration.py` to use `SMSService` instead of the integrated `SIM900A` class:

```python
from sms_service import SMSService

class HardwareManager:
    def __init__(self, config, db_client=None):
        # ... existing code ...
        self.sms_service = SMSService()

    def send_transaction_notification(self, phone_number, message):
        return self.sms_service.send_sms(phone_number, message, 'transaction')
```

## Troubleshooting

### SIM900A not connecting
- Check port: `ls -la /dev/ttyUSB*`
- Check permissions: `sudo usermod -a -G dialout $USER`
- Try alternative port: `/dev/ttyACM0`

### Database connection failed
- Check SUPABASE_URL and SUPABASE_KEY in .env
- Verify network connectivity
- Check Supabase project status

### No contacts loaded
- Check `emergency_contacts` table has data
- Verify RLS policies allow reads
- Check environment variable fallback

### SMS not sending
- Check signal strength: `python3 sms_service.py status`
- Verify SIM card has credit/balance
- Check network registration
- Verify phone number format (include country code: +63...)

## Advantages Over Integrated Approach

1. **Independence**: No dependency on video/camera modules
2. **Reliability**: Video service crash doesn't affect SMS
3. **Flexibility**: Can run on separate device if needed
4. **Testing**: Easy to test SMS without video system
5. **Maintenance**: Easier to debug and maintain
6. **Scalability**: Can be scaled independently

## Logs

Service logs are written to:
- Systemd journal: `sudo journalctl -u sms-service -f`
- Application logs: Configured in logging setup

## Next Steps

1. Test the service: `python3 sms_service.py test +639123456789 "Test"`
2. Set up as systemd service for production
3. Integrate with your existing system
4. Monitor SMS logs in database
5. Set up alerts for failed SMS
