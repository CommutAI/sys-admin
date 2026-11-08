# Minimal Setup Instructions (No AI)

This guide is for when you have limited disk space on your Raspberry Pi.

## Quick Start

### 1. Clean up previous failed installation

```bash
cd ~/raspberry-pi-server
rm -rf venv
```

### 2. Run minimal setup

```bash
chmod +x setup_venv_minimal.sh
./setup_venv_minimal.sh
```

This will install only the essential packages without the heavy AI/PyTorch dependencies (~200MB vs ~500MB+).

### 3. Create .env file

```bash
nano .env
```

Add these settings:
```env
DISABLE_AI=true
ENABLE_CAMERA=true
CAMERA_ID=0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=10
JPEG_QUALITY=60
```

### 4. Start the server

```bash
source venv/bin/activate
python video_server_fastapi.py
```

### 5. Test the video stream

The server will run without AI detection but will still stream the camera feed.

## What's Different in Minimal Mode?

- **No AI detection**: Passenger counting will be manual or use basic motion detection (MOG2) if you set `COUNT_METHOD=mog2`
- **Camera streaming still works**: You can view the live video feed
- **Supabase integration still works**: GPS and other data can be logged
- **Much smaller footprint**: ~200MB vs 500MB+ with AI

## To Enable AI Later (When You Have More Space)

Once you have enough disk space (or a larger SD card), you can:

1. Delete the venv: `rm -rf venv`
2. Run the full setup: `./setup_venv.sh`
3. Set `DISABLE_AI=false` in .env
4. Download the YOLO model: `wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt`

## Troubleshooting

### "No space left on device" error

Check disk space:
```bash
df -h
```

Free up space:
```bash
# Clean apt cache
sudo apt clean
sudo apt autoremove

# Remove old venv
rm -rf venv

# Check for large files
du -h ~ | sort -h | tail -20
```

### Increase swap for more effective memory

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
free -h
```

## Alternative: Use External Storage

If you have a USB drive:
```bash
# Mount USB drive
sudo mkdir /mnt/usb
sudo mount /dev/sda1 /mnt/usb

# Move venv to USB
mv ~/raspberry-pi-server/venv /mnt/usb/
ln -s /mnt/usb/venv ~/raspberry-pi-server/venv
```
