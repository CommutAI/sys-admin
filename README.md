# CommutAI System Admin Dashboard

A comprehensive system administration dashboard for the CommutAI public transportation management system, built with React, Vite, and Supabase. This system includes hardware integration for Raspberry Pi-based bus monitoring with camera, GPS, SMS, and emergency button capabilities.

## Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Hardware Setup](#hardware-setup)
- [Software Setup](#software-setup)
- [User Manual](#user-manual)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Features

### Admin Dashboard
- **Authentication**: Secure login system with Supabase Auth
- **Dashboard**: Real-time overview of passengers, revenue, trips, and active buses
- **Live Map**: Real-time GPS tracking of all buses with passenger counts
- **User Management**: Manage admin, conductor, driver, and customer service accounts
- **Bus Management**: Manage bus fleet, routes, and maintenance status
- **Trip Management**: Monitor and manage active trips
- **Passenger Analytics**: View passenger count trends and statistics with AI-powered anomaly detection
- **Emergency Alerts**: Real-time emergency alert monitoring
- **Fare Irregularities**: Track and resolve fare-related issues with automatic detection
- **Customer Service**: Manage customer service logs and actions
- **GCash Transactions**: View GCash payment transaction history and statistics
- **Reports**: Generate and export various reports with charts and analytics
- **Audit Logs**: Track all system activities and security events
- **Notifications**: Real-time notification system with database integration

### Raspberry Pi Hardware Integration
- **Video Monitoring**: Real-time camera feed with AI passenger counting (YOLO, HOG, MOG2)
- **GPS Tracking**: NEO-6M GPS module for accurate location tracking
- **SMS Notifications**: SIM900A GSM module for emergency alerts and notifications
- **Emergency Button**: Hardware emergency button for instant alert triggering
- **Auto-Discovery**: Dynamic IP registration via Supabase for seamless connectivity
- **Automatic Startup**: Systemd service for auto-start on boot
- **Network Handler**: Automatic reconnection on network changes

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin Dashboard                          │
│                    (React + Vite)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Live Map    │  │  Analytics   │  │  Reports     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │   Supabase     │
                    │  (PostgreSQL)  │
                    │  + Realtime    │
                    └───────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌──────▼────────┐  ┌──────▼────────┐
│  FastAPI       │  │  Raspberry Pi │  │  Mobile Apps │
│  Backend       │  │  Video Server │  │  (Conductor) │
│  (Analytics)   │  │  + Hardware   │  │               │
└────────────────┘  └──────┬────────┘  └────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼───┐  ┌────▼────┐  ┌────▼────┐
        │ Camera  │  │   GPS   │  │   SMS   │
        │ (AI)    │  │ (NEO-6M)│  │(SIM900A)│
        └─────────┘  └─────────┘  └─────────┘
```

## Tech Stack

### Frontend
- **Framework**: React 19, Vite 8
- **Styling**: Tailwind CSS v4
- **Maps**: React Leaflet
- **Charts**: Recharts
- **Icons**: Lucide React
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime subscriptions

### Backend
- **Database**: Supabase (PostgreSQL)
- **API**: FastAPI (Python)
- **Caching**: Redis (optional)
- **Webhooks**: GCash, Stripe integration

### Raspberry Pi Server
- **Video Server**: FastAPI with WebSocket streaming
- **AI Detection**: Ultralytics YOLOv8, OpenCV
- **Hardware**: SIM900A (SMS), NEO-6M (GPS), Emergency Button
- **Service**: Systemd for auto-start
- **Network**: Dynamic IP discovery via Supabase

## Hardware Setup

### Required Hardware Components

#### Raspberry Pi
- **Model**: Raspberry Pi 4 (recommended) or Pi 3B+
- **RAM**: 4GB minimum (8GB recommended for AI processing)
- **Storage**: 32GB+ microSD card (Class 10)
- **Power Supply**: 5V 3A USB-C power supply
- **Cooling**: Active cooling fan recommended

#### Camera Module
- **Type**: USB Webcam or Raspberry Pi Camera Module
- **Resolution**: 640x480 minimum (1280x720 recommended)
- **Frame Rate**: 30fps minimum
- **Connection**: USB or CSI interface

#### GPS Module (NEO-6M)
- **Module**: NEO-6M GPS Module
- **Connection**: UART (GPIO14/GPIO15) or Software Serial (GPIO4/GPIO5)
- **Antenna**: External antenna for better reception
- **Baud Rate**: 9600

#### GSM Module (SIM900A)
- **Module**: SIM900A GSM/GPRS Module
- **Connection**: UART (GPIO14/GPIO15) or Software Serial (GPIO4/GPIO5)
- **Power**: 5V 2A external power supply required
- **SIM Card**: Active SIM card with SMS enabled

#### Emergency Button
- **Type**: Momentary push button
- **Connection**: GPIO 18 (configurable)
- **Wiring**: Pull-up resistor required

### Hardware Connection Diagram

#### Camera Connection
```
USB Webcam → Raspberry Pi USB Port
OR
Pi Camera Module → Camera CSI Port (ribbon cable)
```

#### GPS Module (NEO-6M) - UART Connection
| NEO-6M Pin | Raspberry Pi GPIO | Description |
|------------|------------------|-------------|
| VCC        | 3.3V or 5V      | Power supply |
| GND        | GND             | Ground |
| TX         | GPIO 15 (RX)    | GPS transmit to Pi receive |
| RX         | GPIO 14 (TX)    | GPS receive from Pi transmit |

#### GPS Module (NEO-6M) - Software Serial (GPIO4/GPIO5)
| NEO-6M Pin | Raspberry Pi GPIO | Description |
|------------|------------------|-------------|
| VCC        | 3.3V or 5V      | Power supply |
| GND        | GND             | Ground |
| TX         | GPIO 5 (TXD3)   | GPS transmit to Pi receive |
| RX         | GPIO 4 (RXD3)   | GPS receive from Pi transmit |

#### GSM Module (SIM900A) - UART Connection
| SIM900A Pin | Raspberry Pi GPIO | Description |
|-------------|------------------|-------------|
| VCC         | 5V               | Power supply (2A recommended) |
| GND         | GND              | Ground |
| TXD         | GPIO 15 (RX)     | SIM900A transmit to Pi receive |
| RXD         | GPIO 14 (TX)     | SIM900A receive from Pi transmit |

#### GSM Module (SIM900A) - Software Serial (GPIO4/GPIO5)
| SIM900A Pin | Raspberry Pi GPIO | Description |
|-------------|------------------|-------------|
| VCC         | DC-DC Converter (5V/2A) | Red |
| GND         | Common GND       | Black |
| TX          | Pin 7 (GPIO4, RXD3) | Blue |
| RX          | Pin 29 (GPIO5, TXD3) | Yellow |

#### Emergency Button Connection
| Button Pin | Raspberry Pi GPIO | Description |
|------------|------------------|-------------|
| One Side   | GPIO 18          | Signal pin |
| Other Side | GND              | Ground |
| Resistor   | 10kΩ to 3.3V    | Pull-up resistor |

### Hardware Configuration

#### Enable Serial Port on Raspberry Pi
```bash
# Enable serial port
sudo raspi-config

# Navigate to:
# Interface Options -> Serial Port
# - Enable serial port hardware: YES
# - Enable serial console: NO (to free up the port for GPS/SIM900A)

# Reboot after changes
sudo reboot
```

#### Install pigpio for Software Serial (GPIO4/GPIO5)
```bash
sudo apt-get update
sudo apt-get install pigpio python3-pigpio

# Start pigpio daemon
sudo pigpiod

# Enable pigpio on boot
sudo systemctl enable pigpiod
```

#### Verify Hardware Connections
```bash
# Check camera
ls -la /dev/video*
v4l2-ctl --device=/dev/video0 --info

# Check serial ports
ls -la /dev/ttyS0
ls -la /dev/serial0

# Check GPIO
gpio readall  # Requires wiringPi
```

### Hardware Testing

#### Test Camera
```bash
# Test with v4l2
sudo apt-get install v4l-utils
v4l2-ctl --device=/dev/video0 --info

# Test with Python
python3 -c "import cv2; cap = cv2.VideoCapture(0); print('Camera OK' if cap.isOpened() else 'Camera Failed'); cap.release()"
```

#### Test GPS Module
```python
import serial
ser = serial.Serial('/dev/ttyS0', 9600, timeout=1)
ser.write(b'AT\r')
response = ser.read(100).decode()
print(f"GPS Response: {response}")
ser.close()
```

#### Test SIM900A Module
```python
import serial
ser = serial.Serial('/dev/ttyS0', 9600, timeout=1)
ser.write(b'AT\r')
response = ser.read(100).decode()
print(f"SIM900A Response: {response}")
ser.close()
```

#### Test Emergency Button
```python
import RPi.GPIO as GPIO
GPIO.setmode(GPIO.BCM)
GPIO.setup(18, GPIO.IN, pull_up_down=GPIO.PUD_UP)
print("Press the button...")
while True:
    if GPIO.input(18) == GPIO.LOW:
        print("Button pressed!")
        break
GPIO.cleanup()
```

## Software Setup

### Frontend Setup (Admin Dashboard)

#### 1. Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Supabase account (https://supabase.com)

#### 2. Database Setup
1. Create a new project in Supabase Dashboard
2. Go to the SQL Editor in your Supabase project
3. Copy and run the entire contents of `supabase-schema.sql`
4. This will create all tables, enums, functions, triggers, RLS policies, and seed data

#### 3. Create Test Users
After running the schema, create test users in the Supabase Dashboard:

**Admin User:**
- Email: `admin@commutai.test`
- Password: `Admin123!`
- Auto-confirm: Yes
- Copy the user UUID, then run in SQL Editor:
  ```sql
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  VALUES ('<paste-uuid-here>', 'System Admin', 'admin@commutai.test', 'admin', true);
  ```

**Conductor User:**
- Email: `conductor@commutai.test`
- Password: `Conductor123!`
- Auto-confirm: Yes
- Copy the user UUID, then run in SQL Editor:
  ```sql
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  VALUES ('<paste-uuid-here>', 'Test Conductor', 'conductor@commutai.test', 'conductor', true);
  ```

**Driver User:**
- Email: `driver@commutai.test`
- Password: `Driver123!`
- Auto-confirm: Yes
- Copy the user UUID, then run in SQL Editor:
  ```sql
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  VALUES ('<paste-uuid-here>', 'Test Driver', 'driver@commutai.test', 'driver', true);
  ```

**CS Desk User:**
- Email: `csdesk@commutai.test`
- Password: `CSDesk123!`
- Auto-confirm: Yes
- Copy the user UUID, then run in SQL Editor:
  ```sql
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  VALUES ('<paste-uuid-here>', 'CS Desk Operator', 'csdesk@commutai.test', 'cs_desk', true);
  ```

#### 4. Environment Configuration
1. Get your Supabase credentials from the Supabase Dashboard:
   - Project URL: Settings → API → Project URL
   - Anon Key: Settings → API → anon public key

2. Create a `.env` file in the project root:
   ```env
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

#### 5. Install Dependencies
```bash
npm install
```

#### 6. Run the Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

#### 7. Build for Production
```bash
npm run build
```

The optimized build will be in the `dist` directory.

### Backend Setup (FastAPI)

#### 1. Navigate to Backend Directory
```bash
cd backend
```

#### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

#### 3. Configure Environment
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Edit `.env`:
```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
REDIS_URL=redis://localhost:6379/0  # Optional
JWT_SECRET_KEY=your-jwt-secret-key  # Optional
```

#### 4. Run the Server
```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`

#### 5. Access API Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Raspberry Pi Server Setup

#### 1. Connect to Raspberry Pi
```bash
ssh chichi@commutai.local
# or
ssh chichi@192.168.1.45
```

#### 2. Navigate to Server Directory
```bash
cd /home/chichi/raspberry-pi-server
```

#### 3. Setup Virtual Environment
```bash
# Make setup script executable
chmod +x setup_venv.sh

# Run the setup
./setup_venv.sh
```

#### 4. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```bash
nano .env
```

Required configuration:
```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key

# Hardware Configuration
ENABLE_SMS=true
ENABLE_GPS=true
ENABLE_EMERGENCY_BUTTON=true
ENABLE_GEOLOCATION=true

# SIM900A GSM Module Configuration
SIM900A_PORT=/dev/ttyS0
SIM900A_BAUDRATE=9600

# NEO-6M GPS Module Configuration
NEO6M_PORT=/dev/ttyS1
NEO6M_BAUDRATE=9600

# Emergency Button Configuration
EMERGENCY_BUTTON_PIN=18

# Camera Configuration
CAMERA_ID=0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=15
JPEG_QUALITY=50

# AI Detection Configuration
DISABLE_AI=false
COUNT_METHOD=yolo
MODEL_PATH=yolov8n.pt
CONFIDENCE_THRESHOLD=0.25
IOU_THRESHOLD=0.45

# Backend API Configuration
BACKEND_URL=http://localhost:8000

# Emergency Contacts
EMERGENCY_CONTACTS=+639927268704,+639108945427
ADMIN_CONTACTS=+639108945427
```

#### 5. Download YOLO Model
```bash
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt
```

#### 6. Run System Check
```bash
chmod +x check_system.sh
./check_system.sh
```

#### 7. Setup Automatic Startup
```bash
# Copy automation files (from your local machine)
scp commutai-pi-service.service chichi@commutai.local:/home/chichi/raspberry-pi-server/
scp commutai-network-handler.sh chichi@commutai.local:/home/chichi/raspberry-pi-server/
scp setup-automation.sh chichi@commutai.local:/home/chichi/raspberry-pi-server/

# On Raspberry Pi
cd /home/chichi/raspberry-pi-server
sudo bash setup-automation.sh
```

This will:
- Install a systemd service that starts the server on boot
- Install a network dispatcher that restarts the server when network changes
- Enable and start the service immediately

#### 8. Verify Installation
```bash
# Check service status
sudo systemctl status commutai-pi-service

# View service logs
sudo journalctl -u commutai-pi-service -f

# Test server health
curl http://localhost:5000/health
```

### Database Setup for Pi Devices

For auto-discovery to work, create the `pi_devices` table:

```sql
-- Create the pi_devices table
CREATE TABLE IF NOT EXISTS pi_devices (
  bus_number   INTEGER     PRIMARY KEY,
  bus_id       UUID        REFERENCES buses (id) ON DELETE SET NULL,
  ip_address   TEXT        NOT NULL,
  port         INTEGER     NOT NULL DEFAULT 5000,
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hostname     TEXT
);

-- Enable RLS + allow full access via service role key
ALTER TABLE pi_devices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pi_devices'
      AND policyname = 'pi_devices_service_role'
  ) THEN
    CREATE POLICY "pi_devices_service_role"
      ON pi_devices FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Enable Realtime so the dashboard reacts instantly when Pi changes IP
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pi_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pi_devices;
  END IF;
END $$;
```

## User Manual

### Admin Dashboard

#### Login
1. Navigate to the dashboard URL
2. Enter your email and password
3. Click "Sign In"
4. You will be redirected to the Dashboard

#### Dashboard Overview
The dashboard provides a real-time overview of:
- **Active Buses**: Number of buses currently on trips
- **Total Passengers**: Current passenger count across all buses
- **Today's Revenue**: Total fare revenue for the day
- **Active Emergencies**: Number of unresolved emergency alerts
- **Unresolved Irregularities**: Number of fare irregularities requiring attention

#### Live Map
- View real-time GPS locations of all buses
- Click on bus markers to see:
  - Bus plate number
  - Current passenger count
  - Driver and conductor information
  - Trip status
- Map updates automatically via Supabase Realtime

#### User Management
- **Create Users**: Add new admin, conductor, driver, or CS desk accounts
- **Manage Roles**: Assign appropriate roles to users
- **Activate/Deactivate**: Enable or disable user accounts
- **View Activity**: See user activity and login history

#### Bus Management
- **Add Buses**: Register new buses to the fleet
- **Assign Routes**: Set bus routes and schedules
- **Manage Status**: Mark buses as active, maintenance, or inactive
- **View History**: Track bus usage and maintenance records

#### Trip Management
- **Start Trips**: Begin new trips for conductors
- **Monitor Active Trips**: View ongoing trips with real-time data
- **End Trips**: Complete trips and generate reports
- **Update GPS**: Manually update GPS coordinates if needed

#### Passenger Analytics
- **View Trends**: Analyze passenger count patterns over time
- **Time Range Selection**: Filter by hourly, daily, or monthly data
- **Fare Irregularities**: View and resolve detected anomalies
- **AI Detection**: Automatic detection of fare evasion based on camera count vs boarded passengers

#### Emergency Alerts
- **View Active Alerts**: See all unresolved emergency alerts
- **Acknowledge Alerts**: Mark alerts as acknowledged
- **Resolve Alerts**: Close resolved emergencies
- **View Details**: See GPS location, bus info, and notes

#### Reports
- **Generate Reports**: Create reports for trips, transactions, passengers, and more
- **Export Data**: Export reports as Excel or PDF
- **Schedule Reports**: Set up automated report generation
- **View History**: Access previously generated reports

#### Audit Logs
- **View All Activities**: See comprehensive audit trail
- **Filter by User**: View actions by specific users
- **Filter by Action**: View specific action types (CREATE, UPDATE, DELETE, etc.)
- **Filter by Module**: View activities in specific modules
- **Export Logs**: Download audit logs for compliance

### Raspberry Pi Video Server

#### Starting the Server
The server starts automatically on boot. Manual start:
```bash
cd /home/chichi/raspberry-pi-server
source venv/bin/activate
python video_server_fastapi.py
```

#### Service Management
```bash
# Start service
sudo systemctl start commutai-pi-service

# Stop service
sudo systemctl stop commutai-pi-service

# Restart service
sudo systemctl restart commutai-pi-service

# Check status
sudo systemctl status commutai-pi-service

# View logs
sudo journalctl -u commutai-pi-service -f
```

#### Health Check
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "camera_active": true,
  "passenger_count": 5,
  "connected_clients": 1
}
```

#### Video Monitoring
- Access video feed via WebSocket from admin dashboard
- Real-time passenger counting with AI detection
- Automatic anomaly detection for fare evasion
- Video recording (if enabled)

#### Hardware Status
Check hardware component status:
```bash
curl http://localhost:5000/hardware-status
```

#### Emergency Button
- Press the physical emergency button to trigger an alert
- Alert is sent to all emergency contacts via SMS
- Alert is logged in the database
- Admin dashboard shows the alert immediately

#### GPS Tracking
- GPS coordinates are automatically sent to the database
- Location updates every 30 seconds (configurable)
- Fallback to IP geolocation if GPS fails

#### SMS Notifications
- Automatic SMS on emergency alerts
- Transaction notifications (if enabled)
- Trip completion notifications (if enabled)
- All SMS are logged in the database

## Troubleshooting

### Frontend Issues

#### Tailwind CSS Errors
**Problem**: Tailwind CSS not working correctly

**Solution**:
```bash
# Install @tailwindcss/postcss
npm install @tailwindcss/postcss

# Update postcss.config.js to use @tailwindcss/postcss
# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

#### Supabase Connection Issues
**Problem**: Cannot connect to Supabase

**Solution**:
- Verify `.env` file has correct URL and key
- Check Supabase project is active
- Ensure RLS policies allow the operations
- Test connection: `ping your-project.supabase.co`

#### Real-time Subscriptions Not Working
**Problem**: Real-time updates not appearing

**Solution**:
- Verify tables are published in Supabase Realtime
- Check network connection
- Ensure authenticated with Supabase Auth
- Check browser console for WebSocket errors

#### Build Errors
**Problem**: Build process fails

**Solution**:
```bash
# Clear cache
rm -rf node_modules
rm -rf dist
rm package-lock.json

# Install dependencies
npm install

# Build again
npm run build
```

### Backend Issues

#### Server Won't Start
**Problem**: FastAPI server fails to start

**Solution**:
```bash
# Check if port 8000 is in use
lsof -ti:8000 | xargs kill -9

# Check Python version (3.8+ required)
python --version

# Reinstall dependencies
pip install -r requirements.txt

# Check logs
python main.py
```

#### Database Connection Issues
**Problem**: Cannot connect to Supabase

**Solution**:
- Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in `.env`
- Test network connectivity: `ping your-project.supabase.co`
- Check Supabase project status
- Verify service role key permissions

#### CORS Errors
**Problem**: Frontend cannot access backend API

**Solution**:
- Check CORS configuration in `main.py`
- Ensure frontend URL is in `allowed_origins`
- Verify backend is running on correct port

### Raspberry Pi Issues

#### Camera Not Found
**Problem**: Server reports camera not found

**Solution**:
```bash
# Check camera device
ls -la /dev/video*

# Test camera with v4l2
sudo apt-get install v4l-utils
v4l2-ctl --device=/dev/video0 --info

# Try different camera ID in .env
CAMERA_ID=1  # or 2, 3, etc.

# Reboot Pi
sudo reboot
```

#### YOLO Model Missing
**Problem**: Server reports YOLO model not found

**Solution**:
```bash
cd /home/chichi/raspberry-pi-server
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt
```

#### Service Won't Start
**Problem**: Systemd service fails to start

**Solution**:
```bash
# Check service logs
sudo journalctl -u commutai-pi-service -n 50

# Check if virtual environment exists
ls -la /home/chichi/raspberry-pi-server/venv

# Test manual start
cd /home/chichi/raspberry-pi-server
source venv/bin/activate
python video_server_fastapi.py

# Reinstall service
sudo bash setup-automation.sh
```

#### Network Issues
**Problem**: Server not accessible from other devices

**Solution**:
```bash
# Check if server is running locally
curl http://localhost:5000/health

# Check firewall
sudo ufw status
sudo ufw allow 5000/tcp

# Verify Pi IP address
hostname -I

# Check network handler logs
cat /home/chichi/raspberry-pi-server/network-handler.log
```

#### GPS Not Working
**Problem**: GPS coordinates not updating

**Solution**:
```bash
# Check serial port
ls -la /dev/ttyS0
ls -la /dev/serial0

# Test GPS connection
python3 -c "import serial; ser = serial.Serial('/dev/ttyS0', 9600); print(ser.read(100))"

# Check pigpio daemon (for GPIO4/GPIO5)
sudo systemctl status pigpiod

# Enable serial port in raspi-config
sudo raspi-config
```

#### SIM900A Not Working
**Problem**: SMS not sending

**Solution**:
```bash
# Check serial port permissions
sudo chmod 666 /dev/ttyS0
sudo usermod -a -G dialout chichi

# Test SIM900A connection
python3 -c "import serial; ser = serial.Serial('/dev/ttyS0', 9600); ser.write(b'AT\r'); print(ser.read(100))"

# Check signal strength
# Send AT+CSQ command via serial

# Check SIM card
# Send AT+CPIN? command via serial

# Verify power supply (2A required)
```

#### Emergency Button Not Working
**Problem**: Button press not detected

**Solution**:
```bash
# Test GPIO
python3 -c "import RPi.GPIO as GPIO; GPIO.setmode(GPIO.BCM); GPIO.setup(18, GPIO.IN); print(GPIO.input(18))"

# Check wiring
# Verify pull-up resistor is connected
# Check GPIO pin number in .env

# Test with simple script
python3 test_gpio.py
```

#### High CPU Usage
**Problem**: Raspberry Pi CPU usage is too high

**Solution**:
```bash
# Lower FPS in .env
FPS=10

# Lower resolution
CAMERA_WIDTH=480
CAMERA_HEIGHT=360

# Disable AI if not needed
DISABLE_AI=true

# Use HOG instead of YOLO
COUNT_METHOD=hog

# Increase frame skipping
SKIP_DETECTION_FRAMES=5
```

#### Out of Memory
**Problem**: System runs out of memory

**Solution**:
```bash
# Check memory usage
free -h

# Add swap space
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Set CONF_SWAPSIZE=1024
sudo dphys-swapfile setup
sudo dphys-swapfile swapon

# Reduce video quality
JPEG_QUALITY=40

# Disable video recording
ENABLE_VIDEO_RECORDING=false
```

### Database Issues

#### Connection Timeout
**Problem**: Database queries timing out

**Solution**:
- Check network connectivity to Supabase
- Verify Supabase project is not paused
- Check Supabase status page
- Optimize queries with indexes
- Increase timeout in configuration

#### RLS Policy Errors
**Problem**: Row-Level Security blocking operations

**Solution**:
- Check RLS policies in Supabase Dashboard
- Verify user has correct role
- Check service role key permissions
- Test with service role key

#### Real-time Not Working
**Problem**: Real-time subscriptions not receiving updates

**Solution**:
- Verify tables are published in Supabase Realtime
- Check replication slot status
- Verify WebSocket connection
- Check Supabase Realtime status

## Maintenance

### Regular Tasks

#### Daily
- Check emergency alerts for resolution
- Review fare irregularities
- Monitor system performance
- Check Raspberry Pi service status

#### Weekly
- Review audit logs for suspicious activity
- Check database storage usage
- Review passenger analytics
- Backup database (if not auto-backed by Supabase)

#### Monthly
- Clean old video recordings (if enabled)
- Review and optimize database indexes
- Update software dependencies
- Review hardware status and connections

### Software Updates

#### Frontend Updates
```bash
# Pull latest changes
git pull

# Update dependencies
npm update

# Test locally
npm run dev

# Build for production
npm run build

# Deploy to production
```

#### Backend Updates
```bash
# Pull latest changes
git pull

# Update dependencies
pip install -r requirements.txt --upgrade

# Test locally
python main.py

# Restart service
sudo systemctl restart backend-service
```

#### Raspberry Pi Updates
```bash
# SSH into Pi
ssh chichi@commutai.local

# Navigate to server directory
cd /home/chichi/raspberry-pi-server

# Pull latest changes
git pull

# Update dependencies
source venv/bin/activate
pip install -r requirements.txt --upgrade

# Restart service
sudo systemctl restart commutai-pi-service
```

### Database Maintenance

#### Backup
Supabase provides automatic backups. Manual backup:
```sql
-- Export data
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql
```

#### Cleanup
```sql
-- Remove old video recordings (older than 30 days)
DELETE FROM video_recordings 
WHERE recorded_at < NOW() - INTERVAL '30 days';

-- Remove old GPS logs (older than 90 days)
DELETE FROM gps_logs 
WHERE recorded_at < NOW() - INTERVAL '90 days';

-- Remove old audit logs (older than 180 days)
DELETE FROM audit_logs 
WHERE created_at < NOW() - INTERVAL '180 days';
```

#### Index Optimization
```sql
-- Analyze tables for query optimization
ANALYZE passenger_counts;
ANALYZE boarded_passengers;
ANALYZE transactions;
ANALYZE gps_logs;
```

### Hardware Maintenance

#### Camera
- Clean lens regularly
- Check connections
- Verify focus and exposure
- Test resolution settings

#### GPS Module
- Check antenna connection
- Verify signal strength
- Update position periodically
- Check for interference

#### GSM Module
- Check SIM card status
- Verify signal strength
- Test SMS functionality
- Check power supply

#### Emergency Button
- Test button functionality
- Check wiring connections
- Verify GPIO configuration
- Test alert triggering

#### Raspberry Pi
- Monitor CPU temperature
- Check disk space usage
- Verify power supply
- Update OS regularly

### Security Maintenance

#### Regular Security Checks
- Review audit logs for unauthorized access
- Check for failed login attempts
- Review user permissions
- Update passwords regularly

#### SSL/TLS Configuration
For production use, enable HTTPS:
```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Configure nginx/caddy as reverse proxy with SSL
```

#### Firewall Configuration
```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow video server port
sudo ufw allow 5000/tcp

# Allow backend API port
sudo ufw allow 8000/tcp

# Check status
sudo ufw status
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review relevant documentation files in the `docs/` folder:
   - `docs/VIDEO_MONITORING_SETUP.md` - Video monitoring setup
   - `docs/SIM900A_SETUP.md` - GSM module setup
   - `docs/DEPLOYMENT_GUIDE.md` - Deployment instructions
   - `docs/AUTO_START_GUIDE.md` - Auto-start configuration
   - `docs/ULTRA_LOW_LATENCY_GUIDE.md` - Performance optimization
   - `docs/PI_SETUP_INSTRUCTIONS.md` - Raspberry Pi setup
   - `docs/AUDIT_LOGGING_IMPLEMENTATION.md` - Audit logging details
3. Check system logs:
   - Frontend: Browser console
   - Backend: Application logs
   - Raspberry Pi: `sudo journalctl -u commutai-pi-service -f`
4. Verify configuration files
5. Test with minimal configuration

## License

This project is part of the CommutAI transportation management system.

## Database Schema

The system uses the following main tables:

- **staff_users**: Staff accounts with roles (admin, conductor, cs_desk)
- **buses**: Bus fleet management with routes and status
- **trips**: Trip records with GPS tracking
- **qr_cards**: QR card management for passengers
- **temporary_tickets**: Temporary ticket issuance
- **transactions**: Financial transactions
- **passenger_counts**: Passenger count snapshots
- **boarded_passengers**: Boarding event records
- **gps_logs**: Historical GPS data
- **fare_irregularities**: Fare compliance tracking
- **emergency_alerts**: Emergency incident management
- **customer_service_logs**: Customer service records
- **gcash_transactions**: GCash payment transaction records
- **notifications**: System notifications and alerts
- **audit_logs**: System activity and security event tracking
- **fare_matrix**: Route fare structure with regular and discounted rates
- **bus_schedules**: Bus assignment to trips across 10-day rotation
- **trip_schedules**: Trip timing with arrival and departure windows

## Row-Level Security

The database implements RLS policies to ensure:
- Admins can see all data
- Conductors can only access their own trips
- All authenticated staff can read buses, QR cards, and transactions
- Each role has appropriate write permissions

## Real-time Features

The following tables are published for real-time updates:
- passenger_counts
- fare_irregularities
- emergency_alerts
- trips
- boarded_passengers

## Building for Production

```bash
npm run build
```

The optimized build will be in the `dist` directory.

## Project Structure

```
track2go-systemadmin/
├── src/
│   ├── components/
│   │   └── Layout.jsx          # Main layout with sidebar
│   ├── lib/
│   │   └── supabase.js         # Supabase client configuration
│   ├── pages/
│   │   ├── Dashboard.jsx       # Main dashboard
│   │   ├── LiveMap.jsx         # GPS tracking map
│   │   ├── ManageUsers.jsx     # User management
│   │   ├── BusManagement.jsx   # Bus fleet management
│   │   └── ...                 # Other pages
│   ├── App.jsx                 # Router configuration
│   └── index.css               # Global styles
├── .env                        # Environment variables
├── supabase-schema.sql         # Database schema
└── package.json
```

## Troubleshooting

### Tailwind CSS Issues

If you encounter Tailwind CSS errors, ensure you have:
- Installed `@tailwindcss/postcss` package
- Updated `postcss.config.js` to use `@tailwindcss/postcss`
- Cleared the Vite cache: `rm -rf node_modules/.vite`

### Supabase Connection Issues

- Verify your `.env` file has the correct URL and key
- Check that your Supabase project is active
- Ensure RLS policies allow the operations you're trying to perform

### Real-time Subscriptions Not Working

- Verify the tables are published in Supabase Realtime
- Check your network connection
- Ensure you're authenticated with Supabase Auth

## License

This project is part of the CommutAI transportation management system.
# sys-admin
