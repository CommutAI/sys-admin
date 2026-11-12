# Camera Troubleshooting Guide - Raspberry Pi

## 🔴 Current Error
```
❌ CAMERA ERROR: Could not open camera at /dev/video0
```

## 🔍 Step-by-Step Diagnosis

### Step 1: Check Available Camera Devices
```bash
ls -la /dev/video*
```

**Expected output**:
- If camera exists: `/dev/video0` (or `/dev/video1`, `/dev/video2`)
- If no camera: `No such file or directory`

---

### Step 2: Check Camera Connection

#### For Raspberry Pi Camera Module (CSI):
```bash
# Check if camera is detected by hardware
vcgencmd get_camera

# Expected output:
# supported=1 detected=1
```

**If you see `detected=0`**:
1. Camera is not connected properly
2. Camera cable is loose or reversed
3. Camera needs to be enabled in raspi-config

#### For USB Webcam:
```bash
# List USB devices
lsusb

# You should see your camera in the list
# Example: "Bus 001 Device 003: ID 046d:0825 Logitech, Inc. Webcam C270"
```

---

### Step 3: Enable Camera Interface

```bash
# Open Raspberry Pi configuration
sudo raspi-config
```

**Navigation**:
1. Select **"3 Interface Options"**
2. Select **"I1 Camera"** (or "Legacy Camera")
3. Select **"Yes"** to enable
4. Select **"Finish"**
5. **Reboot**: `sudo reboot`

---

### Step 4: Load Camera Modules

#### For Raspberry Pi Camera Module:

**Try Legacy Driver (bcm2835-v4l2)**:
```bash
# Load the legacy camera driver
sudo modprobe bcm2835-v4l2

# Make it load on boot
echo "bcm2835-v4l2" | sudo tee -a /etc/modules

# Check if it loaded
lsmod | grep bcm2835
```

**OR Try Libcamera (Modern, Recommended for Pi 4/5)**:
```bash
# Test with libcamera
libcamera-hello --list-cameras

# If cameras detected, use libcamera-vid
libcamera-vid -t 5000 -o test.h264

# If this works, you need to use libcamera for OpenCV
```

---

### Step 5: Test Camera with Simple Command

#### Test with libcamera:
```bash
libcamera-hello --timeout 5000
```

#### Test with raspistill (legacy):
```bash
raspistill -o test.jpg
```

#### Test with v4l2 (what OpenCV uses):
```bash
v4l2-ctl --list-devices
```

---

## 🔧 Solutions Based on Camera Type

### Solution A: Using Raspberry Pi Camera Module (CSI)

#### Option 1: Force Legacy Mode (Easier, Works with OpenCV)
```bash
# Edit boot config
sudo nano /boot/config.txt

# Find this line and make sure it's commented:
# camera_auto_detect=1

# Add these lines:
start_x=1
gpu_mem=128

# Save and reboot
sudo reboot
```

After reboot:
```bash
# Load driver
sudo modprobe bcm2835-v4l2

# Test
ls -la /dev/video0

# Start video server
cd ~/raspberry-pi-server
python3 video_server_stream_only.py
```

#### Option 2: Use Libcamera with OpenCV (Advanced)
If you're on Pi 4/5 with Bullseye/Bookworm OS, you need libcamera:

```bash
# Install picamera2 (modern Python camera interface)
sudo apt update
sudo apt install -y python3-picamera2

# You'll need to modify video_server_stream_only.py to use picamera2 instead of cv2.VideoCapture
```

---

### Solution B: Using USB Webcam

If using USB webcam, check which device it's on:

```bash
# List video devices
ls -la /dev/video*

# If you see /dev/video1 or /dev/video2, update .env.stream-mode:
nano raspberry-pi-server/.env.stream-mode

# Change:
CAMERA_DEVICE=/dev/video1  # or /dev/video2

# Save and restart
```

---

## 🎯 Quick Fix Commands

### If camera exists but OpenCV can't access it:

```bash
# Add user to video group
sudo usermod -a -G video $USER

# Give permissions
sudo chmod 666 /dev/video0

# Reboot
sudo reboot
```

### If camera doesn't exist at all:

```bash
# Enable camera and legacy mode
sudo raspi-config
# → Interface Options → Legacy Camera → Enable → Reboot

# After reboot:
sudo modprobe bcm2835-v4l2
ls -la /dev/video0  # Should now exist

# Start server
cd ~/raspberry-pi-server
python3 video_server_stream_only.py
```

---

## 🔍 Common Issues & Solutions

### Issue: "detected=0" from vcgencmd
**Cause**: Camera cable not connected or loose
**Fix**: 
1. Power off Pi completely
2. Disconnect camera cable
3. Reconnect firmly (blue side faces ethernet port on Pi)
4. Power on and test

### Issue: Camera worked before, suddenly stopped
**Cause**: OS update changed camera drivers
**Fix**: Enable legacy camera mode (see Solution A, Option 1)

### Issue: /dev/video0 exists but OpenCV fails to open
**Cause**: Permissions or another process using camera
**Fix**:
```bash
# Check what's using camera
sudo fuser /dev/video0

# Kill that process if needed
sudo fuser -k /dev/video0

# Try again
python3 video_server_stream_only.py
```

### Issue: Using Raspberry Pi OS Bookworm (latest)
**Cause**: Bookworm uses libcamera by default, no legacy support
**Fix**: You need to use picamera2 library instead of OpenCV VideoCapture
(See "Creating picamera2 Compatible Script" below)

---

## 📝 What to Try First (Priority Order)

1. ✅ **Check if camera device exists**: `ls -la /dev/video*`
2. ✅ **Enable legacy camera**: `sudo raspi-config` → Interface → Legacy Camera
3. ✅ **Load driver**: `sudo modprobe bcm2835-v4l2`
4. ✅ **Reboot**: `sudo reboot`
5. ✅ **Test**: `python3 video_server_stream_only.py`

---

## 🆘 If Nothing Works

### Last Resort: Create Test Script

Create `test_camera.py`:
```python
import cv2
import sys

print("Testing camera access...")
print(f"OpenCV version: {cv2.__version__}")

# Try different camera indices
for i in range(4):
    print(f"\nTrying /dev/video{i}...")
    cap = cv2.VideoCapture(i)
    
    if cap.isOpened():
        print(f"✅ Successfully opened /dev/video{i}")
        ret, frame = cap.read()
        if ret:
            print(f"✅ Successfully read frame: {frame.shape}")
            cap.release()
            print(f"\n🎯 USE THIS: CAMERA_DEVICE=/dev/video{i}")
            sys.exit(0)
        else:
            print(f"❌ Could not read frame from /dev/video{i}")
        cap.release()
    else:
        print(f"❌ Could not open /dev/video{i}")

print("\n❌ No working camera found")
```

Run it:
```bash
python3 test_camera.py
```

---

## 📞 Next Steps After Camera Works

Once you see:
```
✅ Camera initialized: 640x480 @ 30fps
Connecting to backend: wss://sys-admin-my13.onrender.com/ws/video-stream/pi-1
```

Then the camera is working and connecting to backend!

---

## 🔗 Useful References

- [Raspberry Pi Camera Docs](https://www.raspberrypi.com/documentation/computers/camera_software.html)
- [Troubleshooting Camera](https://www.raspberrypi.com/documentation/accessories/camera.html#troubleshooting)
- [OpenCV VideoCapture](https://docs.opencv.org/4.x/d8/dfe/classcv_1_1VideoCapture.html)
