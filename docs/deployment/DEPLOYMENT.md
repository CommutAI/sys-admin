# CommutAI Deployment Guide

## Overview

CommutAI is a comprehensive transportation management system with three main components:
1. **Frontend** - React Admin Dashboard
2. **Backend** - FastAPI Service (Windows/Linux)
3. **Raspberry Pi Server** - Video Processing & Hardware Integration

## Prerequisites

### For All Components
- Supabase project with database
- Node.js 18+ (for frontend)
- Python 3.10+ (for backend and Pi)
- Git

### For Backend (Windows)
- Windows 10/11
- Python 3.10+
- NVIDIA GPU (optional, for AI acceleration)

### For Raspberry Pi
- Raspberry Pi 4 (4GB+ RAM recommended)
- Ubuntu/Debian or Raspberry Pi OS
- USB Camera
- GPS Module (NEO-M8L)
- SIM900A GSM Module (optional)

## Quick Start Deployment

### Step 1: Database Setup

1. Create a Supabase project
2. Run the database migrations in order:
   ```bash
   # In Supabase SQL Editor, run these files in order from migrations/ directory:
   - 001_initial_schema.sql
   - 002_add_branch_to_staff_users.sql
   - 003_add_anomaly_enhancements.sql
   - 004_add_irregularity_enhancements.sql
   - 005_restrict_rls_policies.sql
   - 006_add_password_column.sql
   - 007_add_decline_reason_column.sql
   - 008_create_pi_devices.sql
   - 009_fix_staff_users_rls.sql
   - 010_restore_staff_users_auth_fk.sql
   - 011_update_sms_queue_types.sql
   - 012_update_audit_logs_action_constraint.sql
   - 013_update_card_reservations_status_constraint.sql
   ```

See [migrations/README.md](migrations/README.md) for detailed migration documentation.

### Step 2: Frontend Deployment

```bash
cd src
npm install
npm run build
# Deploy dist/ to your hosting service (Vercel, Netlify, etc.)
```

### Step 3: Backend Deployment (Windows)

```bash
cd backend
pip install -r requirements.txt
# Configure .env with your Supabase credentials
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

For production with auto-start, configure the service:
```bash
# Run as Administrator
cd backend
.\setup_autostart.bat
```

See [AUTO_START.md](AUTO_START.md) for detailed auto-start configuration options.

### Step 4: Raspberry Pi Deployment

```bash
# From Windows, deploy to Pi:
scp raspberry-pi-server/* chichi@commutai.local:/home/chichi/raspberry-pi-server/

# On Pi:
cd /home/chichi/raspberry-pi-server
pip install -r requirements.txt
# Configure .env with your Supabase credentials
sudo ./setup_pi_autostart.sh
sudo systemctl start commutai-backend
```

See [AUTO_START.md](AUTO_START.md) for detailed auto-start configuration options.

## Environment Variables

### Frontend (.env)
```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Backend (backend/.env)
```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_ANON_KEY=your-supabase-anon-key
CORS_ORIGINS=http://localhost:5173,http://your-frontend-domain
```

### Raspberry Pi (raspberry-pi-server/.env)
```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_KEY=your-supabase-anon-key
BUS_NUMBER=1
SERVER_PORT=5000
```

## Service Management

For detailed auto-start configuration, see [AUTO_START.md](AUTO_START.md).

### Windows Backend
```bash
# Start manually
.\start_backend.bat

# Configure auto-start (run as Administrator)
.\setup_autostart.bat

# Remove auto-start (run as Administrator)
.\remove_autostart.bat

# View Task Scheduler
taskschd.msc
```

### Raspberry Pi
```bash
# Start manually
sudo systemctl start commutai-backend

# Configure auto-start
sudo ./setup_pi_autostart.sh

# Remove auto-start
sudo ./remove_pi_autostart.sh

# Check status
sudo systemctl status commutai-backend

# View logs
sudo journalctl -u commutai-backend -f

# Restart
sudo systemctl restart commutai-backend
```

## Cloud Deployment (Render.com)

### Backend
1. Connect GitHub repository to Render
2. Create new Web Service
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from backend/.env
6. Deploy

### Frontend
1. Connect GitHub repository to Vercel/Netlify
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Add environment variables
5. Deploy

## Verification

After deployment, verify:

1. **Backend Health**: `http://your-backend:8000/health`
2. **Frontend**: Access admin dashboard
3. **Pi Connection**: Check Pi logs for successful backend discovery
4. **Database**: Verify trips and passenger counts are being saved
5. **Anomaly Detection**: Check anomaly_detection_snapshots table

## Troubleshooting

### Backend won't start
- Check port 8000 is not in use: `netstat -ano | findstr :8000`
- Verify .env file exists and is configured
- Check Python dependencies: `pip list`

### Pi can't connect to backend
- Verify backend is running and accessible
- Check network connectivity: `ping backend-ip`
- Check Pi logs: `journalctl -u commutai-backend -f`

### Camera not detected on Pi
- Check camera is connected: `ls /dev/video*`
- Kill any processes holding camera: `sudo lsof /dev/video0`
- Restart Pi service: `sudo systemctl restart commutai-backend`

### Anomaly detection not working
- Check backend logs for errors
- Verify database schema has been updated
- Check trip polling is working in Pi logs

## Security Notes

⚠️ **CRITICAL**: Before production deployment:
1. Replace all hardcoded Supabase credentials (see CLEANUP_CREDENTIALS.md)
2. Rotate all exposed Supabase keys
3. Enable Row Level Security (RLS) in Supabase
4. Use strong passwords for all accounts
5. Enable HTTPS in production
6. Implement password hashing for staff_users table

## Monitoring

### Health Check Endpoints
- Backend: `GET /health`
- Pi: `GET /health`

### Logs
- Backend: Console output or Windows Event Viewer
- Pi: `journalctl -u commutai-backend -f`
- Database: Supabase logs

## Backup Strategy

### Database Backup
```bash
# Using Supabase CLI
supabase db dump -f backup-$(date +%Y%m%d).sql
```

### Configuration Backup
Backup all .env files and service configurations.

## Support

For issues or questions:
- Check documentation in `docs/` folder
- Review component-specific README files
- Check GitHub issues

## Architecture Overview

```
┌─────────────┐
│   Frontend   │ React Admin Dashboard
│  (Vercel)    │
└──────┬────────┘
       │ HTTP/WebSocket
       ↓
┌─────────────┐
│   Backend   │ FastAPI Service
│  (Render)    │ - Anomaly Detection
│   / Windows  │ - Video Processing
└──────┬────────┘
       │ Supabase + HTTP
       ↓
┌─────────────┐
│   Database   │ Supabase
│  (Supabase)  │ - Trips, Passengers, Anomalies
└─────────────┘
       ↑
       │ WebSocket + HTTP
       ↓
┌─────────────┐
│  Pi Server   │ Raspberry Pi
│  (On-site)   │ - Camera + GPS + SMS
└─────────────┘
```
