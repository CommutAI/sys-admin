# Windows Auto-Start for CommutAI Backend

## Recommended: Automated Setup (Simplest)

Run the provided setup script as Administrator:

```powershell
# Navigate to backend directory
cd C:\Users\joshu\sys-admin\backend

# Run setup script (as Administrator)
.\setup_autostart.bat
```

This will:
- Configure the backend to start automatically when you log in to Windows
- Run with highest privileges
- Restart automatically if it crashes

**To remove auto-start:**
```powershell
# Run as Administrator
.\remove_autostart.bat
```

## Option 1: Add to Windows Startup (Manual)

1. **Create a shortcut to the batch file:**
   - Right-click on `start_backend.bat`
   - Select "Create shortcut"
   - Rename it to "CommutAI Backend"

2. **Copy the shortcut to Startup folder:**
   - Press `Win + R`
   - Type: `shell:startup`
   - Copy the shortcut into this folder

3. **Test:**
   - Restart your computer
   - The backend will start automatically
   - Open a browser and check: http://localhost:8000/health

## Option 2: Use Task Scheduler (Manual)

1. **Open Task Scheduler:**
   - Press `Win + R`
   - Type: `taskschd.msc`

2. **Create a new task:**
   - Click "Create Basic Task"
   - Name: "CommutAI Backend"
   - Trigger: "When I log on"

3. **Action:**
   - "Start a program"
   - Program: `C:\Users\joshu\sys-admin\backend\start_backend.bat nopause`
   - Start in: `C:\Users\joshu\sys-admin\backend`

4. **Finish**

## Option 3: Run as Windows Service (Most Robust)

Requires NSSM (Non-Sucking Service Manager):

1. **Download NSSM:**
   - https://nssm.cc/download
   - Extract and run nssm.exe

2. **Install service:**
   ```cmd
   nssm install CommutAIBackend
   ```
   - Path: `C:\Users\joshu\sys-admin\backend\venv\Scripts\python.exe`
   - Startup directory: `C:\Users\joshu\sys-admin\backend`
   - Arguments: `-m uvicorn main:app --host 0.0.0.0 --port 8000`

3. **Start service:**
   ```cmd
   nssm start CommutAIBackend
   ```

## Verification

After setup, verify the backend is running:
```powershell
curl http://localhost:8000/health
```

Should return: `{"status":"healthy","service":"commutai-backend"}`
