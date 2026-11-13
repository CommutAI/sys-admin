# Camera Fix Summary - 2026-11-12

## Problem
The `video_server_stream_only.py` script was failing to initialize the camera with the error:
```
❌ CAMERA ERROR: Could not open camera at /dev/video0
```

## Root Cause
The camera initialization code was missing the explicit V4L2 backend specification:

**Before (Line 206):**
```python
self.camera = cv2.VideoCapture(CAMERA_DEVICE)
```

**After (Line 207):**
```python
# Open with explicit V4L2 backend — required for USB cameras on Raspberry Pi/OpenCV builds
self.camera = cv2.VideoCapture(CAMERA_DEVICE, cv2.CAP_V4L2)
```

The V4L2 (Video4Linux2) backend is required for USB cameras on Raspberry Pi with OpenCV. Without it, OpenCV cannot properly access the camera device.

## Changes Made to `video_server_stream_only.py`

### 1. Added V4L2 Backend (Line 207)
```python
self.camera = cv2.VideoCapture(CAMERA_DEVICE, cv2.CAP_V4L2)
```

### 2. Added Camera Discovery Function (Lines 250-263)
```python
def _list_available_cameras(self):
    """List available camera devices"""
    print("Attempting to find available cameras...")
    for i in range(4):
        path = f'/dev/video{i}'
        try:
            test_cam = cv2.VideoCapture(path, cv2.CAP_V4L2)
            if test_cam.isOpened():
                ret, frame = test_cam.read()
                if ret and frame is not None:
                    print(f"Found working camera at {path}")
                test_cam.release()
        except Exception as e:
            print(f"Error checking {path}: {e}")
```

### 3. Added Fallback Mechanism (Lines 311-354)
If the configured camera device fails, the script now automatically tries other video devices (/dev/video0-3) to find a working camera.

### 4. Enhanced Error Reporting (Line 211)
Added call to `_list_available_cameras()` to show which cameras are available when initialization fails.

## Codebase Analysis

### Architecture Overview
This is a bus monitoring system with the following components:

**Backend (Node.js/Express):**
- Located in `backend/` directory
- Handles AI detection, video processing, and database operations
- Runs on Render (https://sys-admin-62ro.onrender.com)
- Uses Supabase for database
- WebSocket endpoint: `/ws/video-stream/pi-{BUS_NUMBER}`

**Raspberry Pi Server (Python):**
- Located in `raspberry-pi-server/` directory
- Captures video from camera and streams to backend
- GPS tracking via hardware_integration.py
- SMS capabilities via SIM900A module
- Emergency button support

**Frontend:**
- Located in `src/` directory
- React-based dashboard for monitoring buses
- Displays passenger counts, GPS locations, and video feeds

### Key Files

**Raspberry Pi:**
- `video_server_stream_only.py` - Stream-only mode (fixed)
- `video_server_fastapi.py` - Full AI processing mode (already had V4L2)
- `hardware_integration.py` - GPS, SMS, emergency button
- `.env.stream-mode` - Configuration for stream mode

**Backend:**
- `backend/video_processor.py` - Video processing logic
- `backend/routes/` - API endpoints
- `backend/services/` - Business logic

### Camera Configuration
The camera settings are configured in `.env.stream-mode`:
```
CAMERA_DEVICE=/dev/video0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=30
JPEG_QUALITY=25
```

## Testing the Fix

On the Raspberry Pi, run:
```bash
cd ~/raspberry-pi-server
python3 video_server_stream_only.py
```

Expected output:
```
[Discovery] Using manually configured backend: https://sys-admin-62ro.onrender.com
Hardware manager initialized
[Stream Mode] Backend URL: https://sys-admin-62ro.onrender.com
[Stream Mode] Camera: 640x480 @ 30fps
✅ Camera initialized: 640x480 @ 30fps
Connecting to backend: wss://sys-admin-62ro.onrender.com/ws/video-stream/pi-1
Connected to backend successfully
Starting video stream...
```

## If Camera Still Fails

1. Check if camera device exists:
   ```bash
   ls -la /dev/video*
   ```

2. Test camera directly:
   ```bash
   libcamera-hello --timeout 5000
   ```

3. Enable legacy camera mode if needed:
   ```bash
   sudo raspi-config
   # → Interface Options → Legacy Camera → Enable
   sudo reboot
   ```

4. Load camera driver:
   ```bash
   sudo modprobe bcm2835-v4l2
   ```

See `CAMERA_TROUBLESHOOTING.md` for detailed troubleshooting steps.
