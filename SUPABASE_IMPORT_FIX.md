# Supabase Import Fix - Render Backend Error

## 🔴 Error in Render Logs

```
[Video Status] Error fetching active trip: name 'supabase' is not defined
```

## 🐛 Root Cause

The error occurred in `backend/routers/video_processing.py` at the `get_status()` endpoint (line 275).

**The Problem:**
```python
@router.get("/api/video-processing/status")
async def get_status():
    """Get video processing service status"""
    if not video_processor.current_trip_id:
        try:
            # ❌ Using 'supabase' here but it was never imported!
            trip_result = supabase.table('trips').select('id')...
```

The function was trying to use `supabase` to fetch active trips from the database, but the module didn't import the `supabase` client at the top of the file.

## ✅ Fix Applied

**File**: `backend/routers/video_processing.py`

**Added import at line 20**:
```python
from video_processor import video_processor
from database import supabase  # ← Added this line
```

This imports the global Supabase client from the `database` module, which is properly initialized with credentials from the environment variables.

## 📊 How Supabase is Used in the Codebase

### 1. **Central Database Module** (`backend/database.py`)
```python
from supabase import create_client, Client
from config import settings

def get_supabase_client() -> Optional[Client]:
    """Get Supabase client with service role key"""
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key
    )

# Global Supabase client
supabase = get_supabase_client()
```

This is the **recommended** way to use Supabase - import from the `database` module.

### 2. **Video Processor** (`backend/video_processor.py`)
```python
# Has its own Supabase client initialization
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", ""))
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
```

The video processor has its own client because it needs to work independently.

### 3. **Video Processing Router** (NOW FIXED)
```python
from database import supabase  # ✅ Now properly imported

@router.get("/api/video-processing/status")
async def get_status():
    if not video_processor.current_trip_id:
        try:
            # ✅ Can now use supabase safely
            trip_result = supabase.table('trips').select('id')...
```

## 🧪 Testing the Fix

### 1. Deploy to Render
Push the changes to your repository. Render will automatically redeploy.

### 2. Check Render Logs
After deployment, look for:
```
✓ Environment variables validated
Initializing video processor...
Video processor: Supabase client initialized
[Video Processor] YOLO model loaded from ./yolov8m.pt
```

### 3. Test the Status Endpoint
```bash
curl https://sys-admin-my13.onrender.com/api/video-processing/status
```

**Expected response**:
```json
{
  "model_loaded": true,
  "current_trip_id": null,
  "yolo_available": true
}
```

If there's an active trip, it will auto-fetch it:
```json
{
  "model_loaded": true,
  "current_trip_id": "abc123...",
  "yolo_available": true
}
```

### 4. Error Should Be Gone
The error message `[Video Status] Error fetching active trip: name 'supabase' is not defined` should no longer appear in Render logs.

## 🔍 Why This Error Only Showed in Production

This error likely only appeared in Render logs because:

1. **Local Development**: The endpoint might not have been called during local testing
2. **Timing**: The error only occurs when `video_processor.current_trip_id` is `None` AND someone hits the `/api/video-processing/status` endpoint
3. **Health Checks**: Render or monitoring services might be calling this endpoint automatically

## 📝 Related Files

### Files Modified:
- ✅ `backend/routers/video_processing.py` - Added `from database import supabase`

### Files Checked (No Changes Needed):
- ✅ `backend/database.py` - Already exports `supabase` correctly
- ✅ `backend/video_processor.py` - Has its own independent `supabase` client
- ✅ `backend/main.py` - Imports and registers the video_processing router

## 🚀 Deployment

### Option 1: Git Push (Recommended)
```bash
git add backend/routers/video_processing.py
git commit -m "Fix: Add missing supabase import in video_processing router"
git push origin main
```

Render will automatically detect the push and redeploy.

### Option 2: Manual Deploy
1. Go to Render Dashboard
2. Select your backend service
3. Click "Manual Deploy" → "Deploy latest commit"

## ✅ Verification Checklist

After deployment:
- [ ] Render logs show no `name 'supabase' is not defined` errors
- [ ] `/api/video-processing/status` endpoint returns valid JSON
- [ ] Video processing continues to work normally
- [ ] Pi can still connect and stream video
- [ ] Frontend can still receive video feed

---

## 💡 Why This Matters

This fix ensures that the video processing status endpoint can:
1. Auto-detect active trips from the database
2. Set the current trip ID for video recording
3. Properly report system status to monitoring tools
4. Prevent error spam in Render logs

Without this fix, the status endpoint would crash every time it tried to fetch an active trip, preventing proper system monitoring and auto-configuration.

---

**Fix Applied**: 2026-11-12  
**Status**: ✅ Ready for Deployment  
**Impact**: LOW (fixes error logging, improves reliability)
