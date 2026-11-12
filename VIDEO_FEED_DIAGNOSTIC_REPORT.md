# Video Feed & Passenger Counting Diagnostic Report

## Executive Summary

The camera feed is not showing and passenger counting is not working due to **critical configuration and protocol mismatches** between the Raspberry Pi, Backend, and Frontend components.

---

## Architecture Overview

```
[Raspberry Pi] --[raw frames]--> [Backend] --[processed frames]--> [Frontend]
   (Camera)      WebSocket          (YOLO)       WebSocket           (Display)
```

### Data Flow:
1. **Pi → Backend**: `/ws/video-stream/pi-{BUS_NUMBER}` - Sends raw frames
2. **Backend Processing**: YOLOv8 detection, draws bounding boxes
3. **Backend → Frontend**: `/ws/video-feed` - Broadcasts processed frames

---

## 🔴 Critical Issues Found

### Issue #1: WebSocket Protocol Mismatch for Production Backend

**Location**: `raspberry-pi-server/video_server_stream_only.py` line 85

**Problem**:
```python
BACKEND_WS_URL = BACKEND_URL.replace('http', 'ws')
```

**Why This Fails**:
- Frontend is configured to use: `https://sys-admin-my13.onrender.com` (production HTTPS)
- Pi replaces `http` with `ws`, resulting in `ws://sys-admin-my13.onrender.com`
- **HTTPS backends require WSS (secure WebSocket), not WS**
- The connection is rejected because Render only accepts WSS on HTTPS deployments

**Expected Behavior**:
```python
# Should handle both HTTP → WS and HTTPS → WSS
BACKEND_WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')
```

**Impact**: **HIGH - Pi cannot connect to production backend at all**

---

### Issue #2: Pi Configuration Missing Backend URL

**Location**: `raspberry-pi-server/.env.stream-mode`

**Problem**:
```bash
# BACKEND_URL=http://YOUR_WINDOWS_IP:8000
```

**Why This Fails**:
- The `BACKEND_URL` is commented out
- Auto-discovery only works on **local networks** (scans 192.168.x.x range)
- For production deployment, Pi needs explicit backend URL
- Auto-discovery will **never find** the Render backend at `https://sys-admin-my13.onrender.com`

**Expected Configuration**:
```bash
# For production (connecting to Render)
BACKEND_URL=https://sys-admin-my13.onrender.com

# For local development (connecting to Windows backend)
# BACKEND_URL=http://192.168.1.X:8000
```

**Impact**: **HIGH - Pi uses fallback localhost:8000 or fails discovery**

---

### Issue #3: Supabase Configuration Missing on Pi

**Location**: `raspberry-pi-server/.env.stream-mode`

**Problem**:
```bash
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_key_here
```

**Why This Matters**:
- Pi cannot register its IP in the `pi_devices` table
- Dashboard auto-discovery relies on Pi IP being in database
- GPS data from Pi cannot be stored without Supabase client

**Expected Configuration**:
```bash
SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0
```

**Impact**: **MEDIUM - Pi cannot register with system**

---

### Issue #4: Frontend WebSocket URL Construction

**Location**: `src/hooks/useBackendVideo.js` line 62

**Current Code**:
```javascript
const currentWsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/video-feed';
```

**Why This Works (Surprisingly)**:
- The regex `/^http/` matches both `http` and `https` at the start
- Replaces with `ws`, resulting in:
  - `http://localhost:8000` → `ws://localhost:8000/ws/video-feed` ✅
  - `https://sys-admin-my13.onrender.com` → `wss://sys-admin-my13.onrender.com/ws/video-feed` ✅

**Verdict**: **This is actually CORRECT** (unlike the Pi implementation)

---

### Issue #5: Missing Connection Error Handling

**Observations**:
1. **Pi Server**: No reconnection logic if backend WebSocket drops
2. **Backend**: No heartbeat to Pi (relies on frame stream as keep-alive)
3. **Frontend**: Has 30-second heartbeat, but no exponential backoff on reconnect

**Impact**: **MEDIUM - Unstable connections don't recover gracefully**

---

## ✅ What's Working Correctly

1. **Backend WebSocket Endpoints**: Both `/ws/video-stream/{client_id}` and `/ws/video-feed` are properly registered
2. **YOLOv8 Model**: Backend has detection configured with `DETECTION_METHOD=yolo`
3. **Frontend Hook**: `useBackendVideo.js` correctly handles HTTPS → WSS conversion
4. **Backend Processing Pipeline**: Video processor initializes on startup, draws bounding boxes, broadcasts to frontend
5. **Camera Configuration**: Pi camera settings are optimized (640x480@30fps, JPEG quality 25)

---

## 🔧 Step-by-Step Fix

### Fix #1: Update Pi WebSocket URL Construction

**File**: `raspberry-pi-server/video_server_stream_only.py`

**Change Line 85** from:
```python
BACKEND_WS_URL = BACKEND_URL.replace('http', 'ws')
```

To:
```python
# Handle both HTTP and HTTPS protocols correctly
BACKEND_WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')
```

**Also update line 392** in the same file (GPS upload function):
```python
backend_ws_url = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/video-stream/pi-' + str(BUS_NUMBER)
```

---

### Fix #2: Configure Pi Backend URL

**File**: `raspberry-pi-server/.env.stream-mode`

**For Production Deployment** (connecting to Render):
```bash
# Backend Configuration (Production)
BACKEND_URL=https://sys-admin-my13.onrender.com
```

**For Local Development** (connecting to Windows backend):
```bash
# Backend Configuration (Local Development)
BACKEND_URL=http://192.168.1.X:8000  # Replace X with your Windows IP
```

---

### Fix #3: Add Supabase Credentials to Pi

**File**: `raspberry-pi-server/.env.stream-mode`

**Add these lines**:
```bash
# Supabase Configuration
SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0
```

---

### Fix #4: Add Reconnection Logic to Pi Server

**File**: `raspberry-pi-server/video_server_stream_only.py`

**Add this method to VideoStreamer class** (after line 361):

```python
async def stream_with_reconnection(self):
    """Stream frames with automatic reconnection"""
    retry_count = 0
    max_retries = 5
    base_delay = 2  # seconds
    
    while retry_count < max_retries:
        try:
            await self.stream_frames()
            # If we get here, streaming ended normally
            break
        except Exception as e:
            retry_count += 1
            delay = min(base_delay * (2 ** retry_count), 60)  # Exponential backoff, max 60s
            print(f"[Video Streamer] Connection lost: {e}")
            print(f"[Video Streamer] Retry {retry_count}/{max_retries} in {delay}s...")
            await asyncio.sleep(delay)
            
            # Try to rediscover backend if connection fails
            global BACKEND_URL, BACKEND_WS_URL
            discovered = discover_backend_ip()
            if discovered:
                BACKEND_URL = discovered
                BACKEND_WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')
                print(f"[Video Streamer] Rediscovered backend: {BACKEND_URL}")
    
    if retry_count >= max_retries:
        print(f"[Video Streamer] Failed after {max_retries} retries")
```

**Update the startup code** (around line 458) to use the new method:

```python
# Change from:
# await streamer.stream_frames()

# To:
await streamer.stream_with_reconnection()
```

---

## 🧪 Testing Checklist

### Test 1: Backend Connectivity
```bash
# From Raspberry Pi, test backend connection:
curl https://sys-admin-my13.onrender.com/health

# Expected output:
# {"status":"healthy","service":"commutai-backend"}
```

### Test 2: WebSocket Connection
```bash
# Check if backend is accepting WSS connections:
wscat -c wss://sys-admin-my13.onrender.com/ws/video-feed

# Expected: Connection established (Ctrl+C to exit)
```

### Test 3: Pi Camera
```bash
# On Raspberry Pi, test camera access:
ls -la /dev/video*

# Expected: /dev/video0 should exist
# If not, enable camera:
sudo raspi-config
# → Interface Options → Camera → Enable
```

### Test 4: Pi Video Server Startup
```bash
# On Raspberry Pi, start the video server:
cd raspberry-pi-server
python3 video_server_stream_only.py

# Expected logs:
# [Discovery] Using manually configured backend: https://sys-admin-my13.onrender.com
# ✅ Camera initialized: 640x480 @ 30fps
# Connecting to backend: wss://sys-admin-my13.onrender.com/ws/video-stream/pi-1
# Connected to backend successfully
# Starting video stream...
```

### Test 5: Frontend Video Display
1. Open browser to frontend: `https://sys-admin-nine.vercel.app` (or local dev)
2. Navigate to "Video Monitoring" page
3. **Expected behavior**:
   - Connection progress bar shows "Streaming" at 100%
   - Live video feed displays with green "LIVE" badge
   - Passenger count updates in real-time
   - Orange bounding boxes appear around detected passengers

---

## 🎯 Expected Results After Fixes

### Raspberry Pi Logs:
```
[Discovery] Using manually configured backend: https://sys-admin-my13.onrender.com
✅ Camera initialized: 640x480 @ 30fps
Connecting to backend: wss://sys-admin-my13.onrender.com/ws/video-stream/pi-1
Connected to backend successfully
Starting video stream...
[Detection] Passengers: 3
[Detection] Passengers: 2
[Detection] Passengers: 4
```

### Backend Logs:
```
[Video Router] Pi connected: pi-1
[Video Processor] YOLO model loaded from ./yolov8m.pt
[Video Processor] Raw: 5, After confidence filter: 3, After NMS: 3
[Video Processor] Saved count=3 trip=abc123
[Video Router] Frontend connected
```

### Frontend Display:
- Video feed showing with **orange bounding boxes** around passengers
- "LIVE" badge visible in top-left
- Passenger count updating (e.g., "3")
- Connection status: "Streaming" (green, 100%)

---

## 📊 System Status Summary

| Component | Status | Issue | Priority |
|-----------|--------|-------|----------|
| Backend YOLOv8 Model | ✅ Working | None | - |
| Backend WebSocket Endpoints | ✅ Working | None | - |
| Frontend WebSocket Hook | ✅ Working | None | - |
| Pi WebSocket Protocol | 🔴 Broken | HTTP/HTTPS conversion | **CRITICAL** |
| Pi Backend Configuration | 🔴 Missing | No production URL | **CRITICAL** |
| Pi Supabase Config | 🟡 Missing | No credentials | MEDIUM |
| Pi Reconnection Logic | 🟡 Missing | No auto-retry | MEDIUM |

---

## 🚀 Deployment Recommendations

### For Production (Pi → Render Backend):
1. Apply Fix #1 (WebSocket protocol handling)
2. Apply Fix #2 (set `BACKEND_URL=https://sys-admin-my13.onrender.com`)
3. Apply Fix #3 (add Supabase credentials)
4. Apply Fix #4 (reconnection logic)
5. Test with checklist above

### For Local Development (Pi → Windows Backend):
1. Apply Fix #1 (WebSocket protocol handling)
2. Set `BACKEND_URL=http://192.168.1.X:8000` (your Windows IP)
3. Ensure Windows firewall allows port 8000
4. Run backend with: `cd backend && python main.py`

### For Hybrid Setup (Frontend → Render, Pi → Local Backend):
- Frontend `.env`: `VITE_BACKEND_URL=https://sys-admin-my13.onrender.com`
- Pi `.env.stream-mode`: `BACKEND_URL=http://192.168.1.X:8000`
- **This won't work** - Frontend and Pi must use the same backend

---

## 🐛 Additional Debugging Commands

### Check if backend is receiving frames:
```bash
# SSH into Render backend (if possible) or check logs:
# Look for: "[Video Router] Pi connected: pi-1"
```

### Monitor Pi network traffic:
```bash
# On Raspberry Pi:
sudo tcpdump -i any port 8000 -A

# Should show WebSocket handshake and frame data
```

### Test backend locally:
```bash
# On Windows:
cd backend
python main.py

# Open another terminal:
curl http://localhost:8000/api/video-processing/status

# Expected: {"model_loaded": true, ...}
```

---

## 📝 Root Cause Analysis

### Why the camera feed wasn't showing:

1. **Primary Cause**: Raspberry Pi couldn't establish WebSocket connection to backend
   - Used `ws://` instead of `wss://` for HTTPS backend
   - Connection rejected by Render (requires secure WebSocket)

2. **Secondary Cause**: Backend URL not configured on Pi
   - Auto-discovery only works on local network
   - Cannot find Render backend at `sys-admin-my13.onrender.com`
   - Falls back to `localhost:8000` which doesn't exist on Pi

3. **Result**: No frames sent from Pi → No processing on backend → No broadcast to frontend → Blank screen

### Why passenger counting wasn't working:

1. **Direct Result**: No video frames means no detection
2. **Pipeline Dependency**: Passenger counting happens in backend's `video_processor.detect_passengers()`
3. **Cascade Effect**: No Pi connection → No frames → No YOLO inference → No counts saved to database

---

## 🎓 Lessons Learned

1. **Protocol Mismatch**: Simple string replacement (`'http' → 'ws'`) fails for HTTPS
2. **Environment Configuration**: Auto-discovery doesn't work across internet, needs explicit config
3. **Error Visibility**: Silent WebSocket failures are hard to debug without proper logging
4. **Testing Gaps**: Local development (HTTP) worked but production (HTTPS) failed due to protocol mismatch

---

## Next Steps

1. **Immediate**: Apply Fix #1 and Fix #2 to get basic connectivity working
2. **Short-term**: Add Fix #3 for Pi registration and Fix #4 for stability
3. **Long-term**: 
   - Add comprehensive logging to Pi server
   - Implement health checks and alerting
   - Consider using a message queue (Redis) for frame buffering
   - Add authentication to WebSocket connections

---

**Report Generated**: 2026-11-12  
**Diagnosis By**: Kiro AI System Analysis  
**Codebase**: CommutAI Bus Monitoring System
