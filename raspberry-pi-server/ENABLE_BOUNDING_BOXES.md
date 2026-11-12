# How to Enable Green Bounding Boxes in Passenger Counting

## Problem
The passenger counting system is working (showing correct count) but no green bounding boxes are visible on the camera feed.

## Solution

The bounding boxes are controlled by the `DISABLE_DRAWING` environment variable on the Raspberry Pi.

### Step 1: Check Current Setting

On your Raspberry Pi, check if a `.env` file exists:
```bash
ls -la /home/pi/sys-admin/raspberry-pi-server/.env
```

### Step 2: Enable Bounding Boxes

Edit or create the `.env` file:
```bash
nano /home/pi/sys-admin/raspberry-pi-server/.env
```

Add or update this line:
```bash
DISABLE_DRAWING=false
```

### Step 3: Restart the Pi Server

Restart the video server for changes to take effect:
```bash
sudo systemctl restart video-server
```

Or if running manually:
```bash
cd /home/pi/sys-admin/raspberry-pi-server
./restart_pi_server.sh
```

## How It Works

The video processing pipeline in `video_server_fastapi.py` has this logic:

```python
if DISABLE_DRAWING:
    annotated_frame = frame  # No boxes drawn
else:
    annotated_frame = self.draw_detections(frame, detections)  # Boxes drawn
```

When `DISABLE_DRAWING=false` (or not set), the system will:
1. Detect passengers using YOLO
2. Draw green bounding boxes around each detected person
3. Label each box with "Person N: confidence"
4. Stream the annotated frame to the frontend

## Performance Impact

- **With bounding boxes** (`DISABLE_DRAWING=false`): ~25-30 FPS, better visualization
- **Without bounding boxes** (`DISABLE_DRAWING=true`): ~30-60 FPS, maximum performance

For most use cases, the small performance impact of drawing boxes is negligible and greatly improves the user experience.

## Verification

After restarting, you should see:
1. Green rectangles around detected passengers
2. Labels showing "Person 1: 0.85" (confidence score)
3. The passenger count still updating correctly

## Troubleshooting

If bounding boxes still don't appear:

1. Check the Pi server logs:
   ```bash
   sudo journalctl -u video-server -f
   ```

2. Look for this line in the logs:
   ```
   Performance optimizations: DISABLE_DRAWING=false
   ```

3. Verify the frontend is connected to the correct WebSocket endpoint:
   - Check browser console for WebSocket connection status
   - Verify `VITE_BACKEND_URL` in frontend `.env` points to the backend

4. Check if AI detection is working:
   ```bash
   # Should show passenger count updates
   grep "passenger(s)" /var/log/video-server.log
   ```

## Related Files

- Pi Server: `raspberry-pi-server/video_server_fastapi.py` (line ~1755)
- Frontend Hook: `src/hooks/useBackendVideo.js`
- Backend Router: `backend/routers/video_processing.py`
- Drawing Function: `video_server_fastapi.py` - `draw_detections()` method (line ~1241)
