# Raspberry Pi Bus Video Monitoring Setup

This guide will help you set up the EMEET C60E Dual Camera 4K Webcam on a Raspberry Pi for live bus video monitoring with optional AI passenger detection.

> **⚠️ Important — OOM / "Killed" on startup**
> Loading the YOLOv8 model requires ~700MB of RAM. On a Pi with 2GB or less (or without swap),
> the OS will kill the process immediately. **Set `DISABLE_AI=true` in your `.env` first** to get
> the camera stream working, then enable AI only after confirming the Pi has enough memory.
> See [Memory Requirements](#memory-requirements) below.

## Hardware Requirements

- Raspberry Pi 4 Model B (8GB RAM)
- 64GB microSD Card (Class 10 or higher)
- EMEET C60E Dual Camera 4K Webcam
- Power supply for Raspberry Pi (USB-C, 5V/3A)
- Network connection (Ethernet or WiFi)

## Software Requirements

- Raspberry Pi OS (64-bit) recommended
- Python 3.9+
- pip package manager

## Installation Steps

### 1. Prepare Raspberry Pi OS

1. Download Raspberry Pi Imager from [official website](https://www.raspberrypi.com/software/)
2. Flash Raspberry Pi OS (64-bit) to the 64GB microSD card
3. Boot the Raspberry Pi and complete initial setup
4. Update the system:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

### 2. Install System Dependencies

Install required system packages for video processing and AI:

```bash
sudo apt install -y python3-pip python3-dev libopencv-dev python3-opencv
sudo apt install -y libatlas-base-dev libjasper-dev libqtgui4 libqt4-dev
sudo apt install -y v4l-utils
```

### 3. Enable Camera and USB

Ensure camera support is enabled:

```bash
sudo raspi-config
```
Navigate to:
- Interface Options → Legacy Camera (enable if available)
- Or ensure USB camera support is enabled

### 4. Verify Camera Connection

Connect the EMEET C60E webcam to a USB 3.0 port (blue) for best performance.

Check if the camera is recognized:

```bash
ls /dev/video*
```

You should see `/dev/video0` (and possibly `/dev/video1` for dual camera).

Test the camera:

```bash
v4l2-ctl --list-devices
```

### 5. Set Up Python Environment

Create a dedicated directory for the video server:

```bash
mkdir -p ~/bus-monitoring
cd ~/bus-monitoring
```

Copy the server files to this directory:
- `video_server.py`
- `requirements.txt`

### 6. Install Python Dependencies

```bash
pip3 install -r requirements.txt
```

If you encounter permission issues, use:

```bash
pip3 install --user -r requirements.txt
```

### 7. Download YOLOv8 Model

Download the lightweight YOLOv8n model (optimized for Raspberry Pi):

```bash
cd ~/bus-monitoring
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt
```

Or download manually from [Ultralytics releases](https://github.com/ultralytics/assets/releases) and place `yolov8n.pt` in the server directory.

### 8. Configure Camera Settings

All camera parameters are now controlled via environment variables in `.env`. The defaults are already tuned for low-RAM Pis:

```env
CAMERA_ID=0         # Change to 1 if using second camera
CAMERA_WIDTH=640    # Increase to 1280 only if Pi has plenty of RAM
CAMERA_HEIGHT=480   # Increase to 720 only if Pi has plenty of RAM
FPS=10              # Increase to 15 on faster hardware
JPEG_QUALITY=60     # Increase to 80 for sharper image (uses more bandwidth)
DISABLE_AI=true     # Set false only on Pi 4 8GB with swap enabled
```

### 9. Test the Server

Start the video server:

```bash
python3 video_server.py
```

You should see output like:
```
Starting Bus Monitoring Video Server...
Camera ID: 0
Resolution: 1280x720
FPS: 15
Camera initialized successfully: 1280x720 @ 15fps
YOLO model loaded from yolov8n.pt
Starting video processing...
```

### 10. Find Raspberry Pi IP Address

Get the IP address of your Raspberry Pi:

```bash
hostname -I
```

Note the IP address (e.g., `192.168.1.100`)

### 11. Configure Firewall (if needed)

If you have a firewall enabled, allow port 5000:

```bash
sudo ufw allow 5000
```

### 12. Run as Background Service (Optional)

To run the server automatically on boot, create a systemd service:

```bash
sudo nano /etc/systemd/system/bus-monitoring.service
```

Add the following content:

```ini
[Unit]
Description=Bus Video Monitoring Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/bus-monitoring
ExecStart=/usr/bin/python3 /home/pi/bus-monitoring/video_server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bus-monitoring.service
sudo systemctl start bus-monitoring.service
```

Check service status:

```bash
sudo systemctl status bus-monitoring.service
```

## Web Interface Setup

### 1. Access the Web Interface

On your computer, open the web application and navigate to "Video Monitoring" in the sidebar.

### 2. Connect to Raspberry Pi

Enter the Raspberry Pi IP address in the server URL field:
- Format: `http://192.168.1.100:5000` (replace with your actual IP)
- Click "Refresh Connection" to connect

### 3. Start Video Stream

Once connected:
- Click "Start Stream" to begin the video feed
- The live video will appear with AI detection overlays
- Passenger counts will update in real-time

## Performance Optimization

If the video is laggy or detection is slow:

1. **Reduce Resolution**: In `video_server.py`, set:
   ```python
   CAMERA_WIDTH = 640
   CAMERA_HEIGHT = 480
   ```

2. **Reduce FPS**: Set:
   ```python
   FPS = 10
   ```

3. **Use Smaller Model**: Download `yolov8n.pt` (already the smallest)

4. **Disable Overlays**: Comment out the `draw_detections` call if needed

5. **Use USB 3.0 Port**: Ensure camera is connected to blue USB 3.0 port

6. **Overclock Raspberry Pi**: Use `sudo raspi-config` to enable overclocking (caution)

## Memory Requirements

| Mode | Min RAM | Notes |
|---|---|---|
| Camera stream only (`DISABLE_AI=true`) | 256 MB | Works on any Pi |
| With YOLO AI detection (`DISABLE_AI=false`) | 1.5 GB free | Pi 4 4GB+ recommended |

If the server is killed immediately on startup (`Killed` in terminal), you are hitting the OOM limit.

**Quick fix — increase swap to 1GB:**
```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
free -h   # verify swap is now 1GB
```

**Verify memory before enabling AI:**
```bash
free -h
# You need at least 1.5GB available (RAM + swap combined) for DISABLE_AI=false
```

## Troubleshooting

### Camera not detected
```bash
# Check if camera is connected
lsusb
# Should show EMEET device

# Check video devices
ls -l /dev/video*
```

### Permission denied accessing camera
```bash
sudo usermod -a -G video $USER
# Log out and log back in
```

### Module import errors
```bash
# Reinstall dependencies
pip3 install --force-reinstall -r requirements.txt
```

### Low memory warnings
```bash
# Check memory usage
free -h

# Add swap space if needed
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Change CONF_SWAPSIZE=1024 (or higher)
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Server won't start
```bash
# Check if port 5000 is already in use
sudo lsof -i :5000

# Kill existing process if needed
sudo kill -9 <PID>
```

### Connection refused from web interface
```bash
# Check if server is running
sudo systemctl status bus-monitoring.service

# Check firewall
sudo ufw status

# Test locally
curl http://localhost:5000/health
```

## Dual Camera Setup

The EMEET C60E has dual cameras. To use both:

1. Check both camera IDs:
   ```bash
   ls /dev/video*
   ```

2. Modify `video_server.py` to use specific camera:
   ```python
   CAMERA_ID = 0  # or 1 for second camera
   ```

3. For simultaneous dual camera usage, you would need to modify the code to initialize two cameras and process both streams (requires more powerful hardware).

## Security Considerations

1. **Network Security**: The server runs on port 5000. Consider:
   - Using a VPN for remote access
   - Setting up firewall rules to restrict access
   - Using HTTPS with a reverse proxy (nginx)

2. **Authentication**: Consider adding authentication to the WebSocket server for production use.

3. **Local Network Only**: For security, keep the server on your local network and avoid exposing it to the internet.

## Maintenance

### Update Dependencies
```bash
cd ~/bus-monitoring
pip3 install --upgrade -r requirements.txt
```

### Update YOLO Model
```bash
cd ~/bus-monitoring
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt -O yolov8n.pt
```

### Check Logs
```bash
# If running as service
sudo journalctl -u bus-monitoring.service -f

# If running manually
# Logs appear in terminal
```

## Specifications

- **Camera**: EMEET C60E Dual Camera 4K Webcam
- **Resolution**: Up to 4K (configured at 1280x720 for performance)
- **AI Model**: YOLOv8n (Nano - optimized for edge devices)
- **Detection**: Person/Passenger counting
- **Streaming**: WebSocket-based real-time video
- **Latency**: < 500ms on local network
- **Power**: ~5W (Raspberry Pi + Camera)

## Support

For issues with:
- **Raspberry Pi**: [Raspberry Pi Forums](https://forums.raspberrypi.com/)
- **OpenCV**: [OpenCV Documentation](https://docs.opencv.org/)
- **YOLO**: [Ultralytics Documentation](https://docs.ultralytics.com/)
- **EMEET Camera**: [EMEET Support](https://emeet.com/support)
