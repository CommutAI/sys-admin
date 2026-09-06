# Raspberry Pi Video Server - Auto-Start Setup Guide

This guide explains how to configure the Bus Monitoring Video Server to automatically start when the Raspberry Pi boots up.

## Quick Setup

### 1. Initial Setup
```bash
# Navigate to the server directory
cd /home/chichi/raspberry-pi-server

# Run the setup script
./setup_pi_env.sh
```

### 2. System Check
```bash
# Check if everything is configured correctly
./check_system.sh
```

### 3. Install Auto-Start Service
```bash
# Install the systemd service (requires sudo)
sudo ./install_service.sh
```

That's it! The server will now automatically start when the Raspberry Pi boots.

## Manual Control

### Start Server Manually
```bash
# Simple start script
./start_server.sh

# Or using systemd
sudo systemctl start video-server
```

### Stop Server
```bash
# Using systemd
sudo systemctl stop video-server
```

### Restart Server
```bash
# Quick restart script
./restart_pi_server.sh

# Or using systemd
sudo systemctl restart video-server
```

### Check Status
```bash
# Check service status
sudo systemctl status video-server

# View real-time logs
sudo journalctl -u video-server -f
```

## Troubleshooting

### Camera Not Found
**Problem:** Server reports camera not found

**Solutions:**
1. Check camera connection:
   ```bash
   ls -la /dev/video*
   ```
2. Test camera with v4l2:
   ```bash
   sudo apt-get install v4l-utils
   v4l2-ctl --device=/dev/video0 --info
   ```
3. Try different camera ID in `.env`:
   ```
   CAMERA_ID=1  # or 2, 3, etc.
   ```

### YOLO Model Missing
**Problem:** Server reports YOLO model not found

**Solution:**
```bash
cd /home/chichi/raspberry-pi-server
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt
```

### Service Won't Start
**Problem:** Service fails to start

**Solutions:**
1. Check service logs:
   ```bash
   sudo journalctl -u video-server -n 50
   ```
2. Check if virtual environment exists:
   ```bash
   ls -la /home/chichi/raspberry-pi-server/venv
   ```
3. Test manual start:
   ```bash
   cd /home/chichi/raspberry-pi-server
   source venv/bin/activate
   python video_server_fastapi.py
   ```

### Network Issues
**Problem:** Server not accessible from other devices

**Solutions:**
1. Check if server is running locally:
   ```bash
   curl http://localhost:5000/health
   ```
2. Check firewall settings:
   ```bash
   sudo ufw status
   sudo ufw allow 5000/tcp
   ```
3. Verify Raspberry Pi IP address:
   ```bash
   hostname -I
   ```

### Database Connection Issues
**Problem:** Server can't connect to Supabase

**Solutions:**
1. Check `.env` file:
   ```bash
   cat .env | grep SUPABASE
   ```
2. Test network connectivity:
   ```bash
   ping eiajnmocwxarymfdabjv.supabase.co
   ```
3. Verify credentials are correct in Supabase dashboard

## Configuration

### Environment Variables
Edit the `.env` file to configure:

```bash
# Camera Configuration
CAMERA_ID=0                    # Camera device ID
CAMERA_WIDTH=640               # Resolution width
CAMERA_HEIGHT=480              # Resolution height
FPS=15                        # Frames per second
JPEG_QUALITY=50                # JPEG quality (lower = faster)

# Video Recording
ENABLE_VIDEO_RECORDING=true    # Enable/disable recording
VIDEO_STORAGE_PATH=./recordings # Storage path
MAX_VIDEO_DURATION=300         # Max recording duration (seconds)
VIDEO_FORMAT=mp4               # Video format
VIDEO_BITRATE=1000000          # Video bitrate

# AI Detection
DISABLE_AI=false               # Disable AI detection
COUNT_METHOD=yolo              # Detection method: yolo, hog, mog2
MODEL_PATH=yolov8n.pt          # YOLO model path
CONFIDENCE_THRESHOLD=0.25      # Detection confidence
IOU_THRESHOLD=0.45             # IoU threshold

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

### Service Configuration
The systemd service file (`video-server.service`) includes:

- **Auto-restart:** Service restarts automatically if it crashes
- **Auto-start:** Service starts on system boot
- **Logging:** Logs are sent to systemd journal
- **User:** Runs as the `chichi` user

To modify service behavior:
```bash
sudo nano /etc/systemd/system/video-server.service
sudo systemctl daemon-reload
sudo systemctl restart video-server
```

## Advanced Setup

### Custom Startup Script
If you need custom startup logic, modify the service file's `ExecStart`:
```ini
ExecStart=/home/chichi/raspberry-pi-server/start_server.sh
```

### Network Configuration
To bind to specific IP:
```bash
# In video_server_fastapi.py, change:
uvicorn.run(app, host='0.0.0.0', port=5000)
# To:
uvicorn.run(app, host='192.168.1.45', port=5000)
```

### Performance Tuning
For better performance on Raspberry Pi:
```bash
# In .env file:
FPS=10                        # Lower FPS for better performance
CAMERA_WIDTH=480              # Lower resolution
CAMERA_HEIGHT=360
JPEG_QUALITY=40               # Lower quality for faster encoding
DISABLE_AI=true               # Disable AI if not needed
```

## Monitoring

### Health Check
```bash
curl http://192.168.1.45:5000/health
```

### View Logs
```bash
# Real-time logs
sudo journalctl -u video-server -f

# Last 100 lines
sudo journalctl -u video-server -n 100

# Logs since last boot
sudo journalctl -u video-server -b
```

### Performance Monitoring
```bash
# Check CPU usage
top -p $(pgrep -f video_server_fastapi)

# Check memory usage
free -h

# Check disk space
df -h
```

## Security

### Firewall Configuration
```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow video server port
sudo ufw allow 5000/tcp

# Check status
sudo ufw status
```

### SSL/TLS Setup
For production use, consider setting up SSL:
```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Configure nginx/caddy as reverse proxy with SSL
```

## Maintenance

### Update Dependencies
```bash
cd /home/chichi/raspberry-pi-server
source venv/bin/activate
pip install --upgrade -r requirements.txt
```

### Clean Old Recordings
```bash
# Remove recordings older than 30 days
find ./recordings -name "*.mp4" -mtime +30 -delete
```

### Database Cleanup
```sql
-- Remove old video recordings (run in Supabase SQL)
DELETE FROM video_recordings 
WHERE recorded_at < NOW() - INTERVAL '30 days';
```

## Uninstallation

### Remove Auto-Start
```bash
sudo systemctl stop video-server
sudo systemctl disable video-server
sudo rm /etc/systemd/system/video-server.service
sudo systemctl daemon-reload
```

### Complete Removal
```bash
# Stop and disable service
sudo systemctl stop video-server
sudo systemctl disable video-server

# Remove service file
sudo rm /etc/systemd/system/video-server.service
sudo systemctl daemon-reload

# Optionally remove server directory
cd /home/chichi
rm -rf raspberry-pi-server
```

## Support

For issues:
1. Check logs: `sudo journalctl -u video-server -n 50`
2. Run system check: `./check_system.sh`
3. Test manual start: `./start_server.sh`
4. Verify configuration: Check `.env` file

## Useful Commands Reference

```bash
# Service Management
sudo systemctl start video-server      # Start service
sudo systemctl stop video-server       # Stop service
sudo systemctl restart video-server    # Restart service
sudo systemctl status video-server    # Check status
sudo systemctl enable video-server    # Enable auto-start
sudo systemctl disable video-server   # Disable auto-start

# Log Management
sudo journalctl -u video-server -f    # Follow logs
sudo journalctl -u video-server -n 100 # Last 100 lines
sudo journalctl -u video-server -b     # Since boot

# Manual Testing
./start_server.sh                      # Manual start
./check_system.sh                      # System diagnostics
./restart_pi_server.sh                 # Quick restart

# Configuration
nano .env                              # Edit configuration
systemctl edit video-server            # Edit service file
```