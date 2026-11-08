# Auto-Start Configuration - Summary

## ✅ Auto-Start Configuration Complete

Both the Windows backend and Raspberry Pi server can now be configured to start automatically using the provided scripts.

## Windows Backend

### Files Created
- `backend/setup_autostart.bat` - Automated setup script
- `backend/remove_autostart.bat` - Automated removal script
- Updated `backend/start_backend.bat` - Enhanced with virtual environment support

### Quick Setup
```powershell
# Run as Administrator
cd C:\Users\joshu\sys-admin\backend
.\setup_autostart.bat
```

This creates a Windows Task Scheduler task that:
- Starts the backend when you log in
- Runs with highest privileges
- Passes `nopause` argument to prevent console blocking
- Can be removed with `.\remove_autostart.bat`

### Enhanced start_backend.bat
The startup script now:
- Checks for virtual environment and activates it if present
- Falls back to system Python if no venv
- Accepts `nopause` argument for non-interactive mode (Task Scheduler)
- Still prompts for input when run manually

## Raspberry Pi Server

### Files Created
- `raspberry-pi-server/setup_pi_autostart.sh` - Automated setup script
- `raspberry-pi-server/remove_pi_autostart.sh` - Automated removal script

### Quick Setup
```bash
# Run as root
cd /home/chichi/raspberry-pi-server
sudo ./setup_pi_autostart.sh
```

This:
- Updates the systemd service file with actual username
- Installs the service to `/etc/systemd/system/commutai-backend.service`
- Enables the service to start on boot
- Starts the service immediately
- Shows service status

### Service Details
- **Service name:** `commutai-backend`
- **Type:** systemd service
- **Restart policy:** always (restarts on failure)
- **Restart delay:** 10 seconds
- **Logs:** systemd journal

## Documentation

### Main Guide
- **AUTO_START.md** - Comprehensive auto-start configuration guide
  - Quick start for both platforms
  - Multiple configuration methods
  - Verification steps
  - Troubleshooting
  - Security considerations

### Updated Files
- **DEPLOYMENT.md** - Updated to reference AUTO_START.md
- **backend/INSTALL_WINDOWS_SERVICE.md** - Updated with automated setup as recommended method

## Verification

### Windows Backend
```powershell
# Check health
curl http://localhost:8000/health

# Expected output:
# {"status":"healthy","service":"commutai-backend"}

# View Task Scheduler
taskschd.msc
```

### Raspberry Pi Server
```bash
# Check status
sudo systemctl status commutai-backend

# Check health
curl http://localhost:5000/health

# View logs
sudo journalctl -u commutai-backend -f
```

## Service Management Commands

### Windows
```powershell
# Setup auto-start (as Administrator)
.\setup_autostart.bat

# Remove auto-start (as Administrator)
.\remove_autostart.bat

# View Task Scheduler
taskschd.msc

# Manual start
.\start_backend.bat
```

### Raspberry Pi
```bash
# Setup auto-start
sudo ./setup_pi_autostart.sh

# Remove auto-start
sudo ./remove_pi_autostart.sh

# Start service
sudo systemctl start commutai-backend

# Stop service
sudo systemctl stop commutai-backend

# Restart service
sudo systemctl restart commutai-backend

# Check status
sudo systemctl status commutai-backend

# View logs
sudo journalctl -u commutai-backend -f
```

## Benefits

1. **Automated startup** - Services start automatically on boot/login
2. **Auto-restart** - Services restart automatically if they crash
3. **Simple setup** - One script to configure auto-start
4. **Easy removal** - One script to remove auto-start
5. **Proper logging** - Logs are captured and can be viewed
6. **Production-ready** - Suitable for production deployment

## Configuration Options

### Windows
- **Task Scheduler (Recommended)** - Simple, reliable, runs on login
- **Startup Folder** - Simplest, runs on login
- **Windows Service (NSSM)** - Most robust, runs as system service

### Raspberry Pi
- **Systemd Service (Recommended)** - Standard Linux service management
- **Manual Start** - For development/testing

## Next Steps

1. **Test manual startup first** - Ensure services start correctly before configuring auto-start
2. **Configure environment variables** - Ensure `.env` files are properly configured
3. **Run setup scripts** - Use the provided setup scripts
4. **Verify** - Check that services start automatically after reboot
5. **Monitor logs** - Check logs for any issues during startup

## Files Modified/Created

### Windows
- Created: `backend/setup_autostart.bat`
- Created: `backend/remove_autostart.bat`
- Updated: `backend/start_backend.bat`
- Updated: `backend/INSTALL_WINDOWS_SERVICE.md`
- Created: `AUTO_START.md`
- Updated: `DEPLOYMENT.md`

### Raspberry Pi
- Created: `raspberry-pi-server/setup_pi_autostart.sh`
- Created: `raspberry-pi-server/remove_pi_autostart.sh`
- Created: `AUTO_START.md`
- Updated: `DEPLOYMENT.md`

## Troubleshooting

### Windows
- Run Task Scheduler to check if task is enabled
- Check Windows Event Viewer for errors
- Test with manual start first
- Ensure running as Administrator for setup

### Raspberry Pi
- Check service status: `sudo systemctl status commutai-backend`
- View logs: `sudo journalctl -u commutai-backend -n 50`
- Test manual start: `python video_server_fastapi.py`
- Check camera permissions: `sudo usermod -a -G video chichi`

## Security Notes

1. **Run as appropriate user** - Not as root/Administrator unless necessary
2. **Secure .env files** - Ensure credentials are not exposed
3. **Monitor logs** - Regularly check for security issues
4. **Firewall** - Ensure ports are properly configured
5. **Limit privileges** - Only grant necessary permissions

The auto-start configuration is now complete and ready for use! 🎉
