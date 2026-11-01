# CommutAI Backend - Auto-Start Setup

This directory contains scripts to automatically start the CommutAI backend service on system boot.

## Overview

The backend will automatically start when the system boots, so you don't need to manually start it every time.

## Windows Setup

### Option 1: Using NSSM (Recommended for Production)

1. **Install NSSM** (Non-Sucking Service Manager):
   ```powershell
   choco install nssm
   ```
   Or download from: https://nssm.cc/download

2. **Run the installation script as Administrator**:
   ```powershell
   # Right-click and "Run as Administrator"
   .\start-backend-as-service.ps1
   ```

3. **The script will**:
   - Install the backend as a Windows service named "CommutAIBackend"
   - Configure it to auto-start on boot
   - Start the service immediately
   - Set up log rotation

4. **Manage the service**:
   ```powershell
   # Check status
   Get-Service CommutAIBackend

   # Start/Stop/Restart
   Start-Service CommutAIBackend
   Stop-Service CommutAIBackend
   Restart-Service CommutAIBackend

   # Remove service
   nssm remove CommutAIBackend confirm
   ```

### Option 2: Using Startup Folder (Development)

1. **Create a shortcut** to `start-backend.bat`
2. **Copy the shortcut** to:
   ```
   C:\Users\<YourUsername>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
   ```
3. **The backend will start** when you log in

### Option 3: Manual Start (Development)

Simply run:
```powershell
.\start-backend.bat
```

## Linux Setup

### Option 1: Using Systemd (Recommended for Production)

1. **Run the installation script**:
   ```bash
   sudo ./install-backend-service.sh
   ```

2. **The script will**:
   - Create a systemd service file
   - Enable auto-start on boot
   - Start the service immediately

3. **Manage the service**:
   ```bash
   # Check status
   sudo systemctl status commutai-backend

   # Start/Stop/Restart
   sudo systemctl start commutai-backend
   sudo systemctl stop commutai-backend
   sudo systemctl restart commutai-backend

   # View logs
   sudo journalctl -u commutai-backend -f

   # Disable auto-start
   sudo systemctl disable commutai-backend
   ```

### Option 2: Using crontab (Alternative)

1. **Edit crontab**:
   ```bash
   sudo crontab -e
   ```

2. **Add this line** (replace with your actual path):
   ```bash
   @reboot cd /path/to/backend && ./start-backend.sh
   ```

### Option 3: Manual Start (Development)

Simply run:
```bash
./start-backend.sh
```

## Raspberry Pi Setup

The backend is separate from the Raspberry Pi video server. The Pi runs its own service:
- See `raspberry-pi-server/video-server.service` for Pi-specific setup

## Troubleshooting

### Windows

**Service won't start:**
```powershell
# Check logs
Get-Content logs\service-error.log

# Check service status
Get-Service CommutAIBackend | Select-Object *
```

**Missing dependencies:**
```powershell
# Install in venv
.\venv\Scripts\pip install -r requirements.txt
```

### Linux

**Service won't start:**
```bash
# Check status
sudo systemctl status commutai-backend

# View logs
sudo journalctl -u commutai-backend -n 50
```

**Permission issues:**
```bash
# Fix permissions
sudo chown -R www-data:www-data /var/www/commutai/backend
```

**Missing dependencies:**
```bash
# Install in venv
source venv/bin/activate
pip install -r requirements.txt
```

## Verification

After setup, verify the backend is running:

```bash
# Windows
curl http://localhost:8000/health

# Linux
curl http://localhost:8000/health
```

You should see:
```json
{
  "status": "healthy",
  "service": "commutai-backend"
}
```

## Environment Variables

Make sure your `.env` file is configured correctly:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anon key
- `FRONTEND_URL` - Frontend URL (default: http://localhost:5173)

## Notes

- The anomaly detection scheduler runs automatically every 30 seconds
- The backend will restart automatically if it crashes
- Logs are rotated to prevent disk space issues
- For production, use systemd (Linux) or NSSM (Windows)
