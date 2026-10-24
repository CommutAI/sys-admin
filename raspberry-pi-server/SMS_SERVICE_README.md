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

#### Send emergency alert to all emergency contacts
```bash
python3 sms_service.py emergency "Emergency situation detected"
```

#### Send admin alert to all admin contacts
```bash
python3 sms_service.py admin "System notification"
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
  sms_type TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Integration with Main System

### Option 1: Use as Standalone Service

Run SMS service independently and call it via subprocess or HTTP API.

### Option 2: Import as Module

```python
from sms_service import SMSService

# Initialize
sms = SMSService()

# Send SMS
result = sms.send_sms('+639123456789', 'Test message')

# Send emergency alert
result = sms.send_emergency_alert('Emergency!')

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
