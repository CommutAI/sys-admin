# CommutAI Raspberry Pi - Deployment Guide

This guide explains how to deploy the CommutAI system to a Raspberry Pi with automatic service configuration.

## Quick Start

### Prerequisites

1. Raspberry Pi 4 (recommended) or Pi 3
2. Raspberry Pi OS (64-bit recommended)
3. SSH enabled on the Pi
4. Same network as your development machine
5. Supabase credentials

### Deploy to Pi

1. **Configure connection** (if needed):
   ```bash
   # Edit deploy-to-pi.sh if your Pi hostname is different
   PI_HOST="commutai-pi.local"  # or use IP like "192.168.1.100"
   ```

2. **Run deployment script**:
   ```bash
   ./deploy-to-pi.sh
   ```

3. **First boot auto-setup**:
   - On first boot, `commutai-setup.service` runs automatically
   - It installs all dependencies and configures services
   - You can also run it manually: `sudo /home/pi/raspberry-pi-server/auto-setup.sh`

## What Gets Deployed

### Files
- All Python scripts
- Configuration files
- Service files (systemd)
- Auto-setup script
- Requirements file

### Services Configured
1. **video-server.service** - FastAPI video streaming
2. **sms-queue-processor.service** - SMS queue processing
3. **commutai-pi-service.service** - Main CommutAI service
4. **commutai-setup.service** - Auto-setup (runs once)

### System Configuration
- GPS (NEO-M8L on ttyS1)
- Camera (libcamera)
- GPIO/I2C/Serial
- Network optimization
- Hostname (commutai-pi)
- Log rotation

## Manual Deployment Steps

If you prefer manual deployment:

### 1. SSH into Pi
```bash
ssh pi@commutai-pi.local
```

### 2. Clone or copy files
```bash
# If using git
cd /home/pi
git clone <your-repo-url> raspberry-pi-server

# Or copy from local machine
rsync -avz ./ pi@commutai-pi.local:/home/pi/raspberry-pi-server/
```

### 3. Set up virtual environment
```bash
cd /home/pi/raspberry-pi-server
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Run auto-setup
```bash
sudo ./auto-setup.sh
```

### 5. Verify services
```bash
systemctl | grep commutai
```

## Environment Configuration

Create `.env` file on the Pi:
```bash
cd /home/pi/raspberry-pi-server
nano .env
```

Add your Supabase credentials:
```env
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
FRONTEND_URL=http://localhost:5173
```

## Service Management

### Check Status
```bash
ssh pi@commutai-pi.local
systemctl status video-server.service
systemctl status sms-queue-processor.service
```

### View Logs
```bash
# Real-time
sudo journalctl -u video-server.service -f

# Last 100 lines
sudo journalctl -u video-server.service -n 100
```

### Restart Services
```bash
sudo systemctl restart video-server.service
sudo systemctl restart sms-queue-processor.service
```

## Testing

### Health Check
```bash
curl http://commutai-pi.local:5000/health
```

### GPS Test
```bash
ssh pi@commutai-pi.local
gpsmon /dev/ttyS1
```

### Camera Test
```bash
curl http://commutai-pi.local:5000/video-feed
```

## Troubleshooting

### Deployment Fails

**Connection issue:**
```bash
# Try using IP address instead
PI_HOST=192.168.1.100 ./deploy-to-pi.sh
```

**SSH key issue:**
```bash
# Copy SSH key to Pi
ssh-copy-id pi@commutai-pi.local
```

### Services Won't Start

**Check service status:**
```bash
sudo systemctl status video-server.service
```

**Check logs:**
```bash
sudo journalctl -u video-server.service -n 50
```

**Re-run auto-setup:**
```bash
sudo rm /etc/commutai/.configured
sudo /home/pi/raspberry-pi-server/auto-setup.sh
```

### GPS Not Working

**Check device:**
```bash
ls -l /dev/ttyS1
```

**Test GPS:**
```bash
sudo gpsmon /dev/ttyS1
```

**Check gpsd:**
```bash
sudo systemctl status gpsd
```

### Camera Not Working

**Enable camera:**
```bash
sudo raspi-config
# Interface Options -> Camera -> Enable
```

**Test camera:**
```bash
libcamera-hello
```

## Updating

To update the code on the Pi:

```bash
# Re-run deployment script
./deploy-to-pi.sh

# Or manually
rsync -avz ./ pi@commutai-pi.local:/home/pi/raspberry-pi-server/
ssh pi@commutai-pi.local "cd /home/pi/raspberry-pi-server && source venv/bin/activate && pip install -r requirements.txt"
ssh pi@commutai-pi.local "sudo systemctl restart video-server.service"
```

## Rollback

If something goes wrong:

```bash
ssh pi@commutai-pi.local
cd /home/pi
# Find backup
ls -la | grep raspberry-pi-server.backup
# Restore
cp -r raspberry-pi-server.backup.YYYYMMDD_HHMMSS raspberry-pi-server
sudo systemctl restart video-server.service
```

## Security Notes

- Change default Pi password
- Use SSH keys instead of password authentication
- Keep system updated: `sudo apt update && sudo apt upgrade`
- Use firewall if needed: `sudo ufw enable`

## Network Configuration

### Static IP (Optional)

To set a static IP on the Pi:

```bash
sudo nano /etc/dhcpcd.conf
```

Add:
```
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1
```

Reboot:
```bash
sudo reboot
```

### Access from Internet (Optional)

Use a reverse proxy or VPN for remote access. Do not expose services directly to the internet.

## Performance Tuning

### Overclocking (Pi 4)

```bash
sudo raspi-config
# Performance Options -> Overclock
```

### Reduce CPU Usage

- Lower camera resolution in `camera_config.json`
- Reduce FPS in `camera_config.json`
- Use video compression

### SD Card Life

- Use external SSD if possible
- Reduce log rotation frequency
- Move `/var/log` to external storage

## Support

For issues:
1. Check logs: `sudo journalctl -u <service-name> -n 100`
2. Check this guide's troubleshooting section
3. Review AUTO_SETUP.md for service details
