# Quick Fix Guide - Camera Feed & Passenger Counting

## ✅ Fixes Applied

I've fixed the critical issues preventing the camera feed and passenger counting from working:

### 1. **WebSocket Protocol Mismatch** (CRITICAL FIX)
- **Problem**: Pi was using `ws://` to connect to HTTPS backend (requires `wss://`)
- **Fixed in**: 
  - `raspberry-pi-server/video_server_stream_only.py` (line 86, 409, 422)
  - `raspberry-pi-server/gps_simple.py` (line 113)
  - `raspberry-pi-server/gps_only.py` (line 139)
- **What changed**: Now properly converts `https://` → `wss://` and `http://` → `ws://`

### 2. **Backend URL Configuration** (CRITICAL FIX)
- **Updated**: `raspberry-pi-server/.env.stream-mode`
- **Added**: Clear instructions for production vs local development
- **What to do**: Uncomment and set the correct backend URL (see below)

### 3. **Supabase Credentials** (MEDIUM FIX)
- **Updated**: `raspberry-pi-server/.env.stream-mode`
- **Added**: Proper Supabase credentials for Pi registration

### 4. **Reconnection Logic** (STABILITY FIX)
- **Added**: Automatic reconnection with exponential backoff
- **Features**: 
  - 5 retry attempts with increasing delays
  - Automatic backend rediscovery on connection failure
  - Graceful degradation

---

## 🚀 Next Steps - Deploy to Raspberry Pi

### Option A: Production Deployment (Pi → Render Backend)

1. **Edit `.env.stream-mode` on the Raspberry Pi**:
```bash
nano raspberry-pi-server/.env.stream-mode
```

2. **Uncomment and set the backend URL**:
```bash
# Change this line from:
# BACKEND_URL=https://sys-admin-my13.onrender.com

# To (remove the #):
BACKEND_URL=https://sys-admin-my13.onrender.com
```

3. **Save and exit** (Ctrl+X, then Y, then Enter)

4. **Restart the video server**:
```bash
cd raspberry-pi-server
python3 video_server_stream_only.py
```

5. **Verify connection**:
Look for these logs:
```
[Discovery] Using manually configured backend: https://sys-admin-my13.onrender.com
✅ Camera initialized: 640x480 @ 30fps
Connecting to backend: wss://sys-admin-my13.onrender.com/ws/video-stream/pi-1
Connected to backend successfully
Starting video stream...
```

---

### Option B: Local Development (Pi → Windows Backend)

1. **Get your Windows IP address**:
```powershell
# On Windows PowerShell:
ipconfig

# Look for "IPv4 Address" under your network adapter
# Example: 192.168.1.100
```

2. **Edit `.env.stream-mode` on the Raspberry Pi**:
```bash
nano raspberry-pi-server/.env.stream-mode
```

3. **Set the local backend URL**:
```bash
# Replace 192.168.1.100 with YOUR Windows IP:
BACKEND_URL=http://192.168.1.100:8000
```

4. **Make sure Windows backend is running**:
```powershell
# On Windows, in the backend folder:
cd backend
python main.py

# Should see:
# ✓ Environment variables validated
# Initializing video processor...
# [Video Processor] YOLO model loaded...
```

5. **Start the Pi video server**:
```bash
cd raspberry-pi-server
python3 video_server_stream_only.py
```

---

## 🧪 Testing the Fix

### Test 1: Backend Health Check
```bash
# On Raspberry Pi, test connectivity:
curl https://sys-admin-my13.onrender.com/health

# Expected response:
# {"status":"healthy","service":"commutai-backend"}
```

### Test 2: Check Pi Logs
After starting the video server, you should see:
```
[Discovery] Using manually configured backend: https://sys-admin-my13.onrender.com
✅ Camera initialized: 640x480 @ 30fps
Connecting to backend: wss://sys-admin-my13.onrender.com/ws/video-stream/pi-1
Connected to backend successfully
Starting video stream...
[Detection] Passengers: 2
[Detection] Passengers: 3
```

### Test 3: Frontend Display
1. Open the dashboard in your browser
2. Go to "Video Monitoring" page
3. **Expected results**:
   - Progress bar shows "Streaming" at 100%
   - Live video feed with **orange bounding boxes** around people
   - Passenger count updating in real-time
   - Green "LIVE" badge visible

---

## 🔧 Troubleshooting

### Issue: "Connection refused" or "Connection timeout"
**Cause**: Backend URL is wrong or backend is down

**Fix**:
1. Test backend: `curl https://sys-admin-my13.onrender.com/health`
2. If it fails, check if Render backend is running
3. Check firewall settings (for local development)

### Issue: "Camera not found" or "Could not open camera"
**Cause**: Camera not enabled or wrong device

**Fix**:
```bash
# Check available cameras:
ls -la /dev/video*

# If no /dev/video0, enable camera:
sudo raspi-config
# → Interface Options → Camera → Enable
# → Reboot

# If using USB camera, try /dev/video1 or /dev/video2
```

### Issue: Logs show "ws://" instead of "wss://" for HTTPS backend
**Cause**: Old code still running

**Fix**:
1. Make sure you deployed the fixed code to the Pi
2. Stop any running processes: `pkill -f video_server_stream_only`
3. Start fresh: `python3 video_server_stream_only.py`

### Issue: Video connects but no detections
**Cause**: Backend YOLO model not loaded

**Fix**:
1. Check backend logs for model loading errors
2. Verify `yolov8m.pt` or `yolov8n.pt` exists in backend folder
3. Check backend `.env` has `DETECTION_METHOD=yolo`

---

## 📊 Expected Behavior After Fix

### Raspberry Pi Terminal:
```
[Discovery] Using manually configured backend: https://sys-admin-my13.onrender.com
✅ Camera initialized: 640x480 @ 30fps
Connecting to backend: wss://sys-admin-my13.onrender.com/ws/video-stream/pi-1
Connected to backend successfully
Starting video stream...
[Detection] Passengers: 3
[GPS Upload] Sent GPS: 14.599512, 120.984222
[Detection] Passengers: 2
[Detection] Passengers: 4
```

### Backend Logs (Render or Windows):
```
[Video Router] Pi connected: pi-1
[Video Processor] Raw: 5, After confidence filter: 3, After NMS: 3
[Video Processor] Saved count=3 trip=abc123
[Video Router] Frontend connected
```

### Frontend Display:
- ✅ Video stream visible with orange bounding boxes
- ✅ "LIVE" badge in top-left corner
- ✅ Passenger count: "3" (updates in real-time)
- ✅ Connection status: "Streaming" (green, 100%)
- ✅ Stream status: "Active" (green)

---

## 📝 Configuration Summary

### Files Modified:
1. ✅ `raspberry-pi-server/video_server_stream_only.py` - Fixed WebSocket protocol handling
2. ✅ `raspberry-pi-server/gps_simple.py` - Fixed WebSocket protocol handling
3. ✅ `raspberry-pi-server/gps_only.py` - Fixed WebSocket protocol handling
4. ✅ `raspberry-pi-server/.env.stream-mode` - Added Supabase credentials and better documentation

### What You Need to Do:
1. **REQUIRED**: Edit `.env.stream-mode` and uncomment/set `BACKEND_URL`
2. **REQUIRED**: Deploy fixed Python files to Raspberry Pi
3. **REQUIRED**: Restart the video server
4. **OPTIONAL**: Test with local backend first before production

---

## 🎯 Why This Fixes the Problem

### Before (Broken):
```
Pi: http://backend:8000 → ws://backend:8000  ✅ Works for HTTP
Pi: https://backend:8000 → ws://backend:8000  ❌ FAILS! (needs wss://)
                           ^^^ Wrong protocol for HTTPS
```

### After (Fixed):
```
Pi: http://backend:8000 → ws://backend:8000   ✅ Works for HTTP
Pi: https://backend:8000 → wss://backend:8000 ✅ Works for HTTPS
                            ^^^ Correct secure WebSocket
```

The simple change from `.replace('http', 'ws')` to `.replace('https://', 'wss://').replace('http://', 'ws://')` makes it work for both local (HTTP) and production (HTTPS) backends!

---

## 🆘 Need More Help?

### Check Detailed Report:
See `VIDEO_FEED_DIAGNOSTIC_REPORT.md` for:
- Complete architecture explanation
- Detailed debugging commands
- Root cause analysis
- Additional troubleshooting

### Common Commands:
```bash
# Check if backend is reachable:
curl https://sys-admin-my13.onrender.com/health

# Check Pi camera:
ls -la /dev/video*

# Check running processes:
ps aux | grep python3

# Kill video server:
pkill -f video_server_stream_only

# Start video server:
cd raspberry-pi-server
python3 video_server_stream_only.py

# View live logs:
cd raspberry-pi-server
python3 video_server_stream_only.py 2>&1 | tee video_server.log
```

---

**Last Updated**: 2026-11-12  
**Status**: ✅ Fixes Applied - Ready for Deployment
