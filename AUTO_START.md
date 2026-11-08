# Auto-Start Configuration Guide

This guide explains how to configure the CommutAI backend and Raspberry Pi server to start automatically.

## Quick Start

### Windows Backend (Recommended)

Run the automated setup script as Administrator:

```powershell
cd C:\Users\joshu\sys-admin\backend
.\setup_autostart.bat
```

### Raspberry Pi Server (Recommended)

Run the automated setup script as root:

```bash
cd /home/chichi/raspberry-pi-server
sudo ./setup_pi_autostart.sh
```

---

## Windows Backend Auto-Start

### Method 1: Automated Setup (Recommended)

The easiest way to configure auto-start is using the provided script:

1. **Navigate to backend directory:**
   ```powershell
   cd C:\Users\joshu\sys-admin\backend
   ```

2. **Run setup script as Administrator:**
   - Right-click on `setup_autostart.bat`
   - Select "Run as administrator"
   - Or run from PowerShell: `.\setup_autostart.bat`

3. **Verify:**
   - Restart your computer
   - Check: `curl http://localhost:8000/health`

**To remove auto-start:**
```powershell
# Run as Administrator
.\remove_autostart.bat
```

### Method 2: Task Scheduler (Manual)

1. **Open Task Scheduler:**
   - Press `Win + R`
   - Type: `taskschd.msc`

2. **Create Basic Task:**
   - Click "Create Basic Task"
   - Name: "CommutAI Backend"
   - Trigger: "When I log on"

3. **Action:**
   - "Start a program"
   - Program: `C:\Users\joshu\sys-admin\backend\start_backend.bat nopause`
   - Start in: `C:\Users\joshu\sys-admin\backend`

4. **Finish and test**

### Method 3: Windows Startup Folder (Simple)

1. **Create shortcut:**
   - Right-click on `start_backend.bat`
   - Select "Create shortcut"
   - Rename to "CommutAI Backend"

2. **Copy to Startup:**
   - Press `Win + R`
   - Type: `shell:startup`
   - Copy shortcut to this folder

3. **Test by restarting**

### Method 4: Windows Service (Most Robust)

Requires NSSM (Non-Sucking Service Manager):

1. **Download NSSM:** https://nssm.cc/download

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

---

## Raspberry Pi Server Auto-Start

### Method 1: Automated Setup (Recommended)

The easiest way to configure auto-start is using the provided script:

1. **Navigate to Pi server directory:**
   ```bash
   cd /home/chichi/raspberry-pi-server
   ```

2. **Run setup script as root:**
   ```bash
   sudo ./setup_pi_autostart.sh
   ```

3. **Verify:**
   ```bash
   sudo systemctl status commutai-backend
   curl http://localhost:5000/health
   ```

**To remove auto-start:**
```bash
sudo ./remove_pi_autostart.sh
```

### Method 2: Manual Systemd Service

1. **Edit the service file:**
   ```bash
   nano /home/chichi/raspberry-pi-server/commutai-pi-service.service
   ```

2. **Update paths for your user:**
   ```ini
   [Unit]
   Description=CommutAI Raspberry Pi Video Server
   After=network.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=chichi
   WorkingDirectory=/home/chichi/raspberry-pi-server
   Environment="PATH=/home/chichi/raspberry-pi-server/venv/bin:/usr/local/bin:/usr/bin:/bin"
   ExecStart=/home/chichi/raspberry-pi-server/venv/bin/python /home/chichi/raspberry-pi-server/video_server_fastapi.py
   Restart=always
   RestartSec=10
   StandardOutput=journal
   StandardError=journal

   [Install]
   WantedBy=multi-user.target
   ```

3. **Install the service:**
   ```bash
   sudo cp commutai-pi-service.service /etc/systemd/system/commutai-backend.service
   sudo systemctl daemon-reload
   sudo systemctl enable commutai-backend
   sudo systemctl start commutai-backend
   ```

4. **Check status:**
   ```bash
   sudo systemctl status commutai-backend
   ```

---

## Verification

### Windows Backend

```powershell
# Check if backend is running
curl http://localhost:8000/health

# Expected output:
# {"status":"healthy","service":"commutai-backend"}
```

### Raspberry Pi Server

```bash
# Check if service is running
sudo systemctl status commutai-backend

# Check health endpoint
curl http://localhost:5000/health

# View logs
sudo journalctl -u commutai-backend -f
```

---

## Service Management Commands

### Windows (Task Scheduler)

```powershell
# View task
taskschd.msc

# Remove task (run as Administrator)
schtasks /delete /tn "CommutAI Backend" /f
```

### Raspberry Pi (Systemd)

```bash
# Check status
sudo systemctl status commutai-backend

# Start service
sudo systemctl start commutai-backend

# Stop service
sudo systemctl stop commutai-backend

# Restart service
sudo systemctl restart commutai-backend

# Enable auto-start on boot
sudo systemctl enable commutai-backend

# Disable auto-start on boot
sudo systemctl disable commutai-backend

# View logs
sudo journalctl -u commutai-backend -f

# View last 100 log lines
sudo journalctl -u commutai-backend -n 100
```

---

## Troubleshooting

### Windows Backend Not Starting

1. **Check Task Scheduler:**
   - Open `taskschd.msc`
   - Find "CommutAI Backend" task
   - Check last run result

2. **Check manually:**
   ```powershell
   cd C:\Users\joshu\sys-admin\backend
   .\start_backend.bat
   ```

3. **Check port conflicts:**
   ```powershell
   netstat -ano | findstr :8000
   ```

### Raspberry Pi Service Not Starting

1. **Check service status:**
   ```bash
   sudo systemctl status commutai-backend
   ```

2. **View logs:**
   ```bash
   sudo journalctl -u commutai-backend -n 50
   ```

3. **Check camera access:**
   ```bash
   ls -la /dev/video*
   sudo lsof /dev/video0
   ```

4. **Test manually:**
   ```bash
   cd /home/chichi/raspberry-pi-server
   source venv/bin/activate
   python video_server_fastapi.py
   ```

5. **Fix camera permissions:**
   ```bash
   sudo usermod -a -G video chichi
   sudo reboot
   ```

---

## Configuration Files

### Windows

- **Startup script:** `backend/start_backend.bat`
- **Setup script:** `backend/setup_autostart.bat`
- **Remove script:** `backend/remove_autostart.bat`
- **Detailed guide:** `backend/INSTALL_WINDOWS_SERVICE.md`

### Raspberry Pi

- **Service file:** `raspberry-pi-server/commutai-pi-service.service`
- **Setup script:** `raspberry-pi-server/setup_pi_autostart.sh`
- **Remove script:** `raspberry-pi-server/remove_pi_autostart.sh`

---

## Best Practices

1. **Test manually first:** Ensure the service starts correctly before configuring auto-start
2. **Check logs:** Use logs to diagnose startup issues
3. **Environment variables:** Ensure `.env` files are properly configured
4. **Virtual environment:** Use virtual environments for Python dependencies
5. **Restart policy:** Services are configured to restart automatically on failure
6. **Firewall:** Ensure port 8000 (backend) and 5000 (Pi) are not blocked

---

## Security Considerations

1. **Run as appropriate user:**
   - Windows: Your user account (not Administrator ideally)
   - Pi: Non-root user (e.g., `chichi` or `pi`)

2. **Limit privileges:**
   - Only grant necessary permissions
   - Use Task Scheduler's "Run with highest privileges" only if needed

3. **Secure .env files:**
   - Ensure `.env` files are not committed to git
   - Set appropriate file permissions on Pi: `chmod 600 .env`

4. **Monitor logs:**
   - Regularly check service logs for security issues
