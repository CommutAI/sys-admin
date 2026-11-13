# Raspberry Pi Deployment Guide - Cloud Video Streaming

## Overview

The system now uses a cloud video streaming architecture where:
- **Raspberry Pi**: Streams raw video frames to backend
- **Backend**: Processes frames with YOLOv8 and saves passenger counts to Supabase
- **Supabase**: Stores all data (passenger counts from backend, GPS from Pi)

## Changes Made

### 1. `video_server_stream_only.py`
- Removed local SQLite buffering of passenger counts
- Pi now only streams raw video frames
- Backend handles all passenger detection and database storage

### 2. `sync_worker.py`
- Disabled passenger count syncing (handled by backend)
- Only syncs GPS locations from Pi to Supabase

### 3. `local_store.py`
- Updated documentation to reflect new architecture
- `passenger_counts_raw` table deprecated (retained for backward compatibility)

## Deployment Steps

### On Your Windows Machine

1. **Commit the changes:**
```bash
git add raspberry-pi-server/video_server_stream_only.py
git add raspberry-pi-server/sync_worker.py
git add raspberry-pi-server/local_store.py
git commit -m "Disable Pi passenger count buffering - backend handles detection"
```

2. **Push to your repository:**
```bash
git push
```

### On the Raspberry Pi

3. **Pull the latest changes:**
```bash
cd ~/raspberry-pi-server
git pull
```

4. **Stop the current stream:**
```bash
# Press Ctrl+C in the terminal running video_server_stream_only.py
```

5. **Clear the old SQLite data (optional but recommended):**
```bash
rm -f ~/raspberry-pi-server/local_data.db
```

6. **Start the stream server:**
```bash
cd ~/raspberry-pi-server
python3 video_server_stream_only.py
```

## Expected Behavior

After deployment, you should see:

```
[Stream Mode] Backend URL: https://sys-admin-62ro.onrender.com
[Stream Mode] Camera: 640x480 @ 30fps
[LocalStore] SQLite database ready at /home/chichi/raspberry-pi-server/local_data.db
[SyncWorker] Started — interval=60s, gateway=NOT CONFIGURED
[Stream Mode] SQLite local storage initialized
[SyncWorker] passenger_counts: handled by backend, skipping Pi sync
[SyncWorker] gps_locations: nothing pending
✅ Camera initialized: 640x480 @ 30fps
Connecting to backend: wss://sys-admin-62ro.onrender.com/ws/video-stream/pi-1
Connected to backend successfully
Starting video stream...
[Detection] Passengers: X
```

**Key indicators:**
- ✅ No more "Gateway not configured — 28 passenger_counts rows buffered locally" errors
- ✅ `[Detection] Passengers: X` shows passenger counts from backend
- ✅ Backend saves passenger counts to Supabase with `source: 'yolo_backend'`
- ✅ GPS data still buffers locally and syncs to Supabase

## Verification

### Check Backend Processing
1. Look at the backend console for detection logs
2. Check Supabase `passenger_counts` table for new entries with `source: 'yolo_backend'`

### Check Dashboard
1. Passenger counts should appear in the dashboard
2. Real-time video feed should show detection boxes
3. GPS locations should be tracking correctly

## Troubleshooting

### If passenger counts don't appear:
1. Check backend is running and has YOLOv8 model loaded
2. Check WebSocket connection is established: `wss://sys-admin-62ro.onrender.com/ws/video-stream/pi-1`
3. Check backend logs for detection errors

### If GPS doesn't sync:
1. Ensure `SUPABASE_URL` and `PI_TOKEN` are set in `.env.stream-mode`
2. Check hardware manager is initialized
3. Check GPS hardware is connected

### If video stream fails:
1. Verify backend URL is accessible from Pi
2. Check camera is not in use by another process
3. Try auto-discovery or manually set `BACKEND_URL` in `.env.stream-mode`

## Architecture Diagram

```
┌─────────────────┐
│  Raspberry Pi   │
│                 │
│  Camera ────────┼─────► Raw Frames ────┐
│                 │                      │
│  GPS Module ────┼─────► SQLite GPS ────┼──► Supabase (gps_locations)
│                 │                      │
└─────────────────┘                      │
                                         │
                    ┌────────────────────┘
                    │
                    ▼
         ┌────────────────────┐
         │   Backend Server   │
         │                    │
         │  WebSocket Endpoint │
         │  Video Processor   │
         │  (YOLOv8)          │
         │                    │
         │  Passenger Count   │──────► Supabase (passenger_counts)
         └────────────────────┘
```
