# Auto-Start Setup Guide

This guide will help you set up automatic startup for all Raspberry Pi services on boot, ensuring the camera, GPS, and SMS work independently and automatically.

## Overview

Once configured, the following will happen automatically when the Raspberry Pi boots:

1. **Video Server** - Starts automatically, initializes camera, and begins streaming
2. **SMS Service** - Starts independently, ready to send SMS notifications
3. **GPS Tracking** - Starts automatically via the hardware integration module
4. **Auto IP Registration** - Pi automatically registers its IP to Supabase every 30 seconds
5. **Dashboard** - Auto-discovers Pi via Supabase and displays video stream

> **No hardcoded IPs needed!** The system uses Supabase's `pi_devices` table for automatic IP discovery.

## Prerequisites

- Raspberry Pi OS installed
- Project files transferred to `~/raspberry-pi-server/`
- Python dependencies installed
- Environment variables configured in `.env` file

## Step 1: Configure Environment Variables

Make sure your `.env` file in `~/raspberry-pi-server/` has the following settings:

```env
# Video Server Settings
ENABLE_CAMERA=true
ENABLE_GPS=true
ENABLE_SMS=false  # SMS runs as separate service
BUS_NUMBER=1

# Camera Settings
CAMERA_DEVICE=/dev/video0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=10
DISABLE_AI=true  # Set to false only if you have enough RAM

# GPS Settings
GPS_PORT=/dev/ttyS1
GPS_BAUDRATE=9600

# SMS Settings (for SMS service)
SIM900A_PORT=/dev/ttyUSB0
SIM900A_BAUDRATE=9600

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Backend URL (auto-discovery recommended)
# BACKEND_URL=auto  # System will auto-discover from Supabase
# Or manually set if needed:
# BACKEND_URL=http://localhost:8000
```

> **Important:** No hardcoded IP addresses needed! The system automatically:
> - Registers the Pi's IP to Supabase `pi_devices` table every 30 seconds
> - Dashboard auto-discovers the Pi from Supabase
> - Backend URL can be auto-discovered or set manually

## Step 2: Copy Systemd Service Files

Copy the service files to the systemd directory:

```bash
# Copy video server service
sudo cp ~/raspberry-pi-server/video-server.service /etc/systemd/system/

# Copy SMS server service
sudo cp ~/raspberry-pi-server/sms-server.service /etc/systemd/system/
```

## Step 3: Update Service Files with Your Username

**Important:** Replace `pi` with your actual Raspberry Pi username in both service files.

```bash
# Check your username
whoami

# Edit video server service
sudo nano /etc/systemd/system/video-server.service
# Change User=pi to User=your_actual_username
# Change WorkingDirectory=/home/pi/raspberry-pi-server to /home/your_actual_username/raspberry-pi-server
# Change ExecStart=/usr/bin/python3 /home/pi/raspberry-pi-server/video_server_fastapi.py to /usr/bin/python3 /home/your_actual_username/raspberry-pi-server/video_server_fastapi.py

# Edit SMS server service
sudo nano /etc/systemd/system/sms-server.service
# Change User=pi to User=your_actual_username
# Change WorkingDirectory=/home/pi/raspberry-pi-server to /home/your_actual_username/raspberry-pi-server
# Change ExecStart=/usr/bin/python3 /home/pi/raspberry-pi-server/sms_api_server.py to /usr/bin/python3 /home/your_actual_username/raspberry-pi-server/sms_api_server.py
```

## Step 4: Enable and Start Services

```bash
# Reload systemd configuration
sudo systemctl daemon-reload

# Enable video server to start on boot
sudo systemctl enable video-server.service

# Enable SMS server to start on boot
sudo systemctl enable sms-server.service

# Start video server immediately
sudo systemctl start video-server.service

# Start SMS server immediately
sudo systemctl start sms-server.service
```

## Step 5: Verify Services are Running

```bash
# Check video server status
sudo systemctl status video-server.service

# Check SMS server status
sudo systemctl status sms-server.service

# View video server logs
sudo journalctl -u video-server.service -f

# View SMS server logs
sudo journalctl -u sms-server.service -f
```

Press `Ctrl+C` to exit the log view.

## Step 6: Test Auto-Start

Reboot your Raspberry Pi to test automatic startup:

```bash
sudo reboot
```

After reboot, check that services started automatically:

```bash
# Check if services are running
sudo systemctl status video-server.service
sudo systemctl status sms-server.service
```

## Step 7: Verify Dashboard Auto-Connection

The Dashboard has been updated to automatically connect to the Raspberry Pi. When you open the Dashboard:

1. It will automatically try to connect to the Pi (via WebSocket)
2. If the Pi is online, it will start the video stream automatically
3. GPS data will be displayed on the map
4. SMS service will be ready to send notifications

## How It Works

### Video Server Auto-Start
- systemd starts `video_server_fastapi.py` on boot
- The server's `lifespan` function automatically:
  - Initializes the camera
  - Starts video processing
  - Registers the Pi's IP to Supabase (every 30 seconds)
  - Starts GPS tracking via `hardware_manager.start_gps_tracking()`

### SMS Service Auto-Start
- systemd starts `sms_api_server.py` on boot
- The service independently:
  - Connects to SIM900A module
  - Fetches contacts from database
  - Provides REST API for SMS operations
  - Does NOT depend on video/camera modules

### GPS Auto-Start
- GPS tracking is started by the video server's hardware manager
- Location data is automatically logged to the database
- Dashboard receives GPS updates via Supabase Realtime

### Dashboard Auto-Connection
- The `useRaspberryPi` hook now has `autoConnect: true`
- When the Dashboard loads, it automatically connects to the Pi
- Video stream starts automatically when Pi is detected
- No manual "Refresh Connection" button press needed

## Troubleshooting

### Service fails to start

```bash
# Check logs for errors
sudo journalctl -u video-server.service -n 50
sudo journalctl -u sms-server.service -n 50
```

### Camera not starting

```bash
# Check if camera is detected
ls /dev/video*

# Check video server logs
sudo journalctl -u video-server.service -f
```

### GPS not working

```bash
# Check GPS port
ls /dev/ttyS*

# Check video server logs for GPS errors
sudo journalctl -u video-server.service -f | grep -i gps
```

### SMS not working

```bash
# Check SIM900A connection
ls /dev/ttyUSB*

# Check SMS service logs
sudo journalctl -u sms-server.service -f
```

### Dashboard not auto-connecting

1. Check that the Pi is registered in Supabase `pi_devices` table
2. Verify the Pi's IP address is correct
3. Check browser console for WebSocket connection errors
4. Ensure the video server is running and accessible

## Service Management Commands

```bash
# Start services
sudo systemctl start video-server.service
sudo systemctl start sms-server.service

# Stop services
sudo systemctl stop video-server.service
sudo systemctl stop sms-server.service

# Restart services
sudo systemctl restart video-server.service
sudo systemctl restart sms-server.service

# Disable auto-start on boot
sudo systemctl disable video-server.service
sudo systemctl disable sms-server.service

# Enable auto-start on boot
sudo systemctl enable video-server.service
sudo systemctl enable sms-server.service
```

## Independence Confirmation

After setup, each component operates independently:

✅ **Camera/Video** - Works even if GPS or SMS fails
✅ **GPS** - Works even if camera or SMS fails
✅ **SMS** - Works as separate service, doesn't depend on video/camera
✅ **Dashboard** - Shows video when Pi is online, falls back to database data when offline

## Summary

With this setup:
- Raspberry Pi boots → All services start automatically
- Dashboard opens → Auto-connects to Pi and shows video
- GPS tracking → Runs continuously in background
- SMS service → Ready to send notifications at any time
- Each component → Independent and fault-tolerant
