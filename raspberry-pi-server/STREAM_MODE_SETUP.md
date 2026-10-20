# Raspberry Pi Stream-Only Mode Setup

This guide explains how to configure the Raspberry Pi to stream raw video frames to the Windows backend for processing, achieving 90%+ accuracy with YOLOv8.

## Architecture Overview

**Previous Architecture:**
- Raspberry Pi: Captures video + runs YOLOv8 (CPU-only, slow, lower accuracy)
- Windows System: Receives processed results via WebSocket

**New Architecture:**
- Raspberry Pi: Captures video + streams raw frames to backend (no AI processing)
- Windows System: Receives raw frames + runs YOLOv8 with larger model (higher accuracy)

## Why This Change?

1. **Higher Accuracy**: Windows system can use YOLOv8m (medium model) instead of YOLOv8n (nano)
2. **Better Performance**: Pi doesn't struggle with AI processing, focuses on streaming
3. **90%+ Accuracy Target**: Optimized confidence thresholds and NMS on backend
4. **Scalability**: Can upgrade backend hardware without changing Pi code

## Setup Instructions

### Step 1: Update Raspberry Pi .env Configuration

On the Raspberry Pi, edit the `.env` file in `raspberry-pi-server/`:

```bash
nano ~/raspberry-pi-server/.env
```

Add/update these settings:

```env
# Disable local AI processing - Pi will stream only
DISABLE_AI=true
COUNT_METHOD=none

# Backend URL (Windows system IP)
BACKEND_URL=http://192.168.1.XX:8000

# Camera settings (lower for faster streaming)
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=10
JPEG_QUALITY=60

# Bus number
BUS_NUMBER=1

# Supabase credentials (same as before)
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

**Important**: Replace `192.168.1.XX` with your Windows system's actual IP address.

### Step 2: Install WebSocket Dependencies on Pi

The new stream-only mode requires `websockets` library:

```bash
cd ~/raspberry-pi-server
pip3 install websockets
```

### Step 3: Test the Stream-Only Server

Start the stream-only server on the Pi:

```bash
cd ~/raspberry-pi-server
python3 video_server_stream_only.py
```

You should see output like:
```
Supabase client initialized
[Bus] Assigned to bus_number=1 | id=xxx | plate=xxx
[Device] Registered: bus=1 ip=192.168.1.45:5000
[Stream Mode] Backend URL: http://192.168.1.XX:8000
[Stream Mode] Camera: 640x480 @ 10fps
Camera initialized: 640x480 @ 10fps
Connecting to backend: ws://192.168.1.XX:8000/ws/video-stream/pi-1
Connected to backend successfully
Starting video stream...
[Detection] Passengers: 3
```

### Step 4: Setup Windows Backend

#### 4.1 Install Python Dependencies

On your Windows system, in the `backend/` directory:

```bash
cd backend
pip install -r requirements.txt
```

This will install:
- opencv-python
- numpy
- ultralytics (YOLOv8)
- torch (PyTorch for CPU)
- torchvision

#### 4.2 Download YOLOv8m Model

Download the medium YOLOv8 model for better accuracy:

```bash
cd backend
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m.pt
```

Or download manually from [Ultralytics releases](https://github.com/ultralytics/assets/releases) and place `yolov8m.pt` in the `backend/` directory.

#### 4.3 Start the Backend Server

```bash
cd backend
python main.py
```

You should see:
```
Starting FastAPI backend service...
Initializing video processor...
[Video Processor] Model: yolov8m.pt
[Video Processor] Confidence threshold: 0.7
[Video Processor] Detection size: 640px
[Video Processor] YOLO model loaded from yolov8m.pt
```

### Step 5: Configure Firewall (Windows)

Allow Python through Windows Firewall:

1. Open Windows Security
2. Go to Firewall & network protection
3. Click "Allow an app through firewall"
4. Find Python and allow it on Private networks
5. Or manually allow port 8000

### Step 6: Test the Full Pipeline

1. Start the Windows backend server
2. Start the Raspberry Pi stream-only server
3. Check backend logs for detection results:
   ```
   [Video Processor] Raw: 5, After confidence filter: 3, After NMS: 2
   [Video Processor] Saved count=2 trip=xxx
   ```

## Configuration Tuning for 90%+ Accuracy

The backend `.env` file contains these accuracy-optimized settings:

```env
# Use medium model (better accuracy than nano)
MODEL_PATH=yolov8m.pt

# General confidence threshold
CONFIDENCE_THRESHOLD=0.50

# Strict YOLO confidence for person detection (reduces false positives)
YOLO_CONFIDENCE_THRESHOLD=0.70

# Detection size (larger = more accurate but slower)
DETECTION_SIZE=640

# NMS threshold
IOU_THRESHOLD=0.45
```

### Tuning Guidelines:

- **If accuracy is still low (<90%)**: Increase `YOLO_CONFIDENCE_THRESHOLD` to 0.75 or 0.80
- **If too many false positives**: Increase `YOLO_CONFIDENCE_THRESHOLD` and `IOU_THRESHOLD`
- **If detection is too slow**: Reduce `DETECTION_SIZE` to 512 or use `yolov8n.pt` instead
- **If missing people**: Decrease `YOLO_CONFIDENCE_THRESHOLD` to 0.65

## Troubleshooting

### Pi cannot connect to backend

1. Check Windows IP address:
   ```bash
   # On Windows
   ipconfig
   # Look for IPv4 Address (e.g., 192.168.1.100)
   ```

2. Test connectivity from Pi:
   ```bash
   # On Pi
   ping 192.168.1.100
   curl http://192.168.1.100:8000/health
   ```

3. Check Windows Firewall is allowing port 8000

### Backend cannot load model

1. Verify `yolov8m.pt` exists in `backend/` directory
2. Check PyTorch installation:
   ```bash
   python -c "import torch; print(torch.__version__)"
   ```

### Detection accuracy is low

1. Check camera lighting and positioning
2. Ensure camera is at the right angle (not too high/low)
3. Try increasing `YOLO_CONFIDENCE_THRESHOLD` in backend `.env`
4. Consider using `yolov8l.pt` (large model) if performance allows

### Stream is laggy

1. Reduce FPS on Pi (set `FPS=5` in Pi `.env`)
2. Reduce JPEG quality (set `JPEG_QUALITY=50`)
3. Reduce resolution (set `CAMERA_WIDTH=480`, `CAMERA_HEIGHT=360`)

## Performance Benchmarks

Expected performance on typical hardware:

**Raspberry Pi 4 (streaming only):**
- Resolution: 640x480
- FPS: 10
- CPU usage: ~15-20%
- Network bandwidth: ~2-3 Mbps

**Windows System (Intel i5/i7, no GPU):**
- Model: YOLOv8m
- Detection size: 640
- Processing time: ~100-200ms per frame
- Effective FPS: 5-8
- Accuracy: 90%+ (with proper tuning)

## Switching Back to Local Processing

If you need to switch back to local Pi processing:

1. On Pi `.env`:
   ```env
   DISABLE_AI=false
   COUNT_METHOD=yolo
   MODEL_PATH=yolov8n.pt
   ```

2. Use `video_server_fastapi.py` instead of `video_server_stream_only.py`

## Next Steps

1. Test the stream-only mode with your bus setup
2. Monitor detection accuracy in the dashboard
3. Adjust confidence thresholds based on real-world performance
4. Consider collecting labeled data to fine-tune the model further
