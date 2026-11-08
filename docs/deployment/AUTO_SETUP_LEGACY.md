# CommutAI Raspberry Pi - Auto-Setup Guide

This guide explains the automatic configuration of all CommutAI services on the Raspberry Pi.

## Overview

When the Raspberry Pi boots for the first time, it will automatically:
- Install all system dependencies
- Configure GPIO, serial, I2C, and camera
- Set up GPS (NEO-M8L on ttyS1)
- Install Python dependencies
- Configure all systemd services
- Optimize network settings
- Set hostname to `commutai-pi`
- Enable log rotation

## Services Configured

1. **video-server.service** - FastAPI video streaming server
2. **sms-queue-processor.service** - SMS queue processor
3. **commutai-pi-service.service** - Main CommutAI service

## How It Works

### First Boot Setup

1. **commutai-setup.service** runs on first boot
   - Checks if `/etc/commutai/.configured` exists
   - If not, runs `auto-setup.sh`
   - Only runs once (unless marker file is removed)

2. **auto-setup.sh** performs all configuration
   - Updates system packages
   - Installs dependencies
   - Configures hardware
   - Sets up services
   - Creates configuration marker

3. **All services start automatically**
   - After setup completes, all services start
   - Services auto-restart on failure
   - Services auto-start on subsequent boots

## Manual Setup

If you need to reconfigure the Pi:

```bash
# Remove configuration marker
sudo rm /etc/commutai/.configured

# Reboot the Pi
sudo reboot

# The setup will run again on next boot
```

## Service Management

### Check Status
```bash
# Check all CommutAI services
sudo systemctl status video-server.service
sudo systemctl status sms-queue-processor.service
sudo systemctl status commutai-pi-service.service

# Or check all at once
systemctl | grep commutai
```

### Start/Stop/Restart
```bash
sudo systemctl start video-server.service
sudo systemctl stop video-server.service
sudo systemctl restart video-server.service
```

### View Logs
```bash
# Real-time logs
sudo journalctl -u video-server.service -f
sudo journalctl -u sms-queue-processor.service -f

# Last 100 lines
sudo journalctl -u video-server.service -n 100
```

## Configuration Files

### GPS Configuration
- Device: `/dev/ttyS1` (NEO-M8L)
- Config file: `/etc/default/gpsd`
- Udev rule: `/etc/udev/rules.d/99-gps.rules`

### Camera Configuration
- Config file: `/home/pi/raspberry-pi-server/camera_config.json`
- Resolution: 640x480
- FPS: 30
- Format: MJPG

### Services
- Service files: `/etc/systemd/system/*.service`
- Working directory: `/home/pi/raspberry-pi-server`
- Logs: `/home/pi/raspberry-pi-server/logs/`

## Network Configuration

### Hostname
- Default: `commutai-pi`
- Access via: `http://commutai-pi:5000` or `http://commutai-pi.local:5000`

### WiFi Power Saving
- Disabled for stable connection
- Configuration: `/etc/modprobe.d/8192cu.conf`

## Troubleshooting

### Setup Didn't Run

Check if the setup service exists:
```bash
sudo systemctl status commutai-setup.service
```

If it failed, run manually:
```bash
sudo /home/pi/raspberry-pi-server/auto-setup.sh
```

### Service Won't Start

Check service status:
```bash
sudo systemctl status <service-name>
```

Check logs:
```bash
sudo journalctl -u <service-name> -n 50
```

### GPS Not Working

Check GPS device:
```bash
ls -l /dev/ttyS1
sudo gpsmon /dev/ttyS1
```

Check gpsd:
```bash
sudo systemctl status gpsd
```

### Camera Not Working

Check camera is enabled:
```bash
sudo raspi-config
# Enable: Interface Options -> Camera
```

Test camera:
```bash
libcamera-hello
```

### Revert Configuration

To completely reset the Pi configuration:
```bash
# Remove configuration marker
sudo rm /etc/commutai/.configured

# Remove systemd services
sudo systemctl disable commutai-setup.service
sudo rm /etc/systemd/system/commutai-setup.service

# Reboot
sudo reboot
```

## Development

### During Development

To prevent auto-setup from interfering:
```bash
# Create the marker file manually
sudo mkdir -p /etc/commutai
sudo touch /etc/commutai/.configured
```

### Test Setup Without Reboot

```bash
# Run setup manually
sudo /home/pi/raspberry-pi-server/auto-setup.sh
```

## Updating Services

When you update the code:

```bash
# Restart the specific service
sudo systemctl restart video-server.service

# Or restart all CommutAI services
for service in video-server sms-queue-processor commutai-pi-service; do
    sudo systemctl restart ${service}.service
done
```

## System Requirements

- Raspberry Pi 4 (recommended) or Pi 3
- Raspberry Pi OS (64-bit recommended)
- Minimum 8GB SD card
- Internet connection for first-time setup
- Supabase credentials in `.env` file

## Security Notes

- Services run as `pi` user (not root)
- GPS device permissions set to `0666`
- Log rotation prevents disk fill
- Network services listen on `0.0.0.0` (all interfaces)

## Next Steps

After setup is complete:

1. **Verify services are running:**
   ```bash
   systemctl | grep commutai
   ```

2. **Test the API:**
   ```bash
   curl http://localhost:5000/health
   ```

3. **Check GPS:**
   ```bash
   gpsmon /dev/ttyS1
   ```

4. **Check camera:**
   ```bash
   curl http://localhost:5000/video-feed
   ```

5. **Configure frontend** to connect to the Pi
