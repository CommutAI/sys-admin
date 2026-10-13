# Raspberry Pi Server Deployment Guide

## Issue
The frontend is getting CORS errors and 500 errors because the Raspberry Pi server is running the old version of the code.

## Solution
Upload the updated files and restart the server.

## Step 1: Upload Files to Raspberry Pi

### Option A: Using the PowerShell script (Recommended)
```powershell
cd C:\Users\joshu\sys-admin
.\upload_to_pi.ps1
```

### Option B: Manual SCP commands
```powershell
scp C:\Users\joshu\sys-admin\raspberry-pi-server\video_server_fastapi.py chichi@192.168.1.45:/home/chichi/raspberry-pi-server/
scp C:\Users\joshu\sys-admin\raspberry-pi-server\hardware_integration.py chichi@192.168.1.45:/home/chichi/raspberry-pi-server/
```

## Step 2: SSH into Raspberry Pi

```bash
ssh chichi@192.168.1.45
```

## Step 3: Install Dependencies (First Time Only)

The Raspberry Pi OS requires using a virtual environment. Here are two options:

### Option A: Using Virtual Environment (Recommended)
```bash
cd /home/chichi/raspberry-pi-server

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Option B: Using System Packages (Quick Fix)
```bash
cd /home/chichi/raspberry-pi-server

# Install with system package override
pip install --break-system-packages -r requirements.txt
```

**For Option A**, you'll need to activate the virtual environment every time before running the server:
```bash
cd /home/chichi/raspberry-pi-server
source venv/bin/activate
python video_server_fastapi.py
```

## Step 4: Restart the Server

### If using Virtual Environment (Option A):
```bash
cd /home/chichi/raspberry-pi-server
source venv/bin/activate

# Stop existing server
sudo lsof -ti:5000 | xargs kill -9

# Start new server
python video_server_fastapi.py
```

### If using System Packages (Option B):
```bash
# Stop existing server
sudo lsof -ti:5000 | xargs kill -9

# Start new server
cd /home/chichi/raspberry-pi-server
python video_server_fastapi.py
```

## Step 5: Verify the Server is Running

The server should start without the previous errors. You should see:
- No "address already in use" error
- Better camera initialization (with fallback to other camera IDs)
- No 500 errors on hardware-status endpoint

## Step 6: Test from Frontend

Refresh your React application at `http://localhost:5174` and check:
- CORS errors should be gone
- Hardware status should load without 500 errors
- WebSocket connection should establish successfully

## Troubleshooting

### If camera still fails:
```bash
# Try different camera ID
export CAMERA_ID=1
python video_server_fastapi.py
```

### If port still in use:
```bash
# More aggressive port cleanup
sudo fuser -k 5000/tcp
sudo lsof -ti:5000 | xargs kill -9
```

### If SCP fails:
- Make sure SSH is enabled on Raspberry Pi
- Check network connectivity: `ping 192.168.1.45`
- Verify username/password: `ssh chichi@192.168.1.45`

## What Was Fixed

1. **Hardware Status Endpoint**: Now returns data from hardware manager instead of failing database queries
2. **Camera Initialization**: Enhanced error handling with automatic camera detection
3. **Hardware Availability Flags**: Added proper status tracking for all hardware components
4. **Error Handling**: Improved error handling across all endpoints
5. **WebSocket Timeout**: Increased from 5s to 15s for better connection stability