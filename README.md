# CommutAI System Admin Dashboard

A comprehensive system administration dashboard for the **CommutAI** public transportation management system, built with React, Vite, and Supabase. The system integrates with Raspberry Pi hardware installed on each bus for real-time video monitoring, AI passenger counting, GPS tracking, SMS alerts, and emergency notifications.

**Live backend:** [https://sys-admin-62ro.onrender.com](https://sys-admin-62ro.onrender.com)
**Supabase project:** `iyacktzzktwrpeibcena.supabase.co`

---

## Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Hardware Setup](#hardware-setup)
- [Software Setup](#software-setup)
- [Video Recording & Playback](#video-recording--playback)
- [Remote Pi Management](#remote-pi-management)
- [QR Card System](#qr-card-system)
- [Database Migrations](#database-migrations)
- [User Manual](#user-manual)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

---

## Features

### Admin Dashboard (React Frontend)
- **Authentication** — Secure login via Supabase Auth
- **Dashboard** — Real-time overview: passengers, revenue, trips, active buses, emergencies
- **Live Map** — Real-time GPS tracking of all buses with passenger counts (react-leaflet)
- **User Management** — Manage admin, conductor, driver, and CS desk accounts
- **Bus Management** — Fleet management, route/schedule assignment, maintenance status
- **Trip Management** — Monitor and manage active trips; view trip history
- **Card Management** — Issue, reload, and manage QR smart cards (regular, student, senior, PWD, temporary)
- **Fare Matrix** — Configure point-to-point fares with regular and discounted rates
- **Passenger Analytics** — Trends, AI-powered anomaly detection for fare irregularities
- **Emergency Alerts** — Real-time emergency alert monitoring and resolution
- **Fare Irregularities** — Auto-detected and manually reportable fare issues
- **Customer Service** — Manage CS logs and actions
- **GCash Top-Up** — QR card top-up via GCash with webhook integration
- **Reports** — Trip detail modals with:
  - GPS route map panel synced to video playback
  - Recorded video feed (Supabase Storage URL or Pi proxy)
  - Passenger boarding manifest (FIFO From→To estimation)
  - Transactions, irregularities, emergency alerts
  - Excel and PDF export (PDF uses list format)
- **Audit Logs** — Full system activity trail; export as PDF (list format) or Excel
- **Notifications** — Real-time notification system with database integration
- **Video Monitoring** — Live camera feed from connected Pi bus

### Raspberry Pi Hardware Integration
- **Video Recording** — Records trip footage locally during the trip, then auto-uploads to Supabase Storage after the trip ends (or when internet becomes available)
- **GPS Tracking** — NEO-6M GPS module; track position in real-time and store GPS points per trip
- **SMS Notifications** — SIM900A GSM module for emergency alerts
- **Emergency Button** — Hardware button triggers instant database alert + SMS
- **AI Passenger Counting** — YOLOv8n / HOG / MOG2 detection models
- **Auto-Discovery** — Pi registers its IP/port to `pi_devices` table on boot and every 5 minutes
- **Automatic Startup** — Systemd service (`commutai-pi-service`) auto-starts on boot
- **Offline Recording** — Videos recorded without internet are stored locally (SD card) and auto-uploaded on reconnect
- **Remote Command Relay** — Admin can send whitelisted shell commands to the Pi via Render WebSocket (even without direct network access)

### Backend (FastAPI on Render)
- **Video Proxy** — Streams Pi video to dashboard when Pi is on a different network
- **Remote Command Queue** — `POST /api/pi/command` queues commands; Pi executes and returns results
- **Pi Status** — `GET /api/pi/status` checks if Pi WebSocket is connected
- **Analytics** — Passenger count aggregation, anomaly detection
- **Webhooks** — GCash payment processing
- **Trip/Transaction APIs** — CRUD for trips, transactions, cards, staff, buses

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   Admin Dashboard (React + Vite)               │
│  Live Map │ Reports │ Trips │ Cards │ Analytics │ Video Mon.   │
└───────────────────────┬────────────────────────────────────────┘
                        │ Supabase Realtime + REST
              ┌─────────▼──────────┐
              │     Supabase       │
              │  PostgreSQL + Auth │
              │  + Realtime + RLS  │
              │  + Storage (videos)│
              └────┬──────────┬────┘
                   │          │
      ┌────────────▼──┐   ┌──▼─────────────────┐
      │  FastAPI       │   │  Raspberry Pi       │
      │  Backend       │◄──┤  (on bus)           │
      │  (Render.com)  │   │  video_server_      │
      │                │   │  fastapi.py         │
      │  - Video proxy │   │  Port :8080         │
      │  - Pi command  │   │                     │
      │    relay       │   │  Camera (OpenCV)    │
      │  - Analytics   │   │  GPS (NEO-6M)       │
      │  - Webhooks    │   │  SMS (SIM900A)      │
      └────────────────┘   │  Emergency Button   │
                           └─────────────────────┘
```

**Video storage flow:**
```
Trip starts → Pi records locally (SD card)
Trip ends   → Pi transcodes to H.264 (ffmpeg)
            → Pi uploads to Supabase Storage bucket "trip-videos"
            → DB updated: file_path = https://...supabase.co/...
            → Video playable from anywhere, no Pi needed

If Pi had no internet during trip:
            → retry_pending_uploads() fires on boot + reconnect
            → Uploads all missed recordings automatically
```

---

## Tech Stack

### Frontend
| Package | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 8 | Build tool |
| Tailwind CSS | v4 | Styling |
| react-leaflet | 5 | GPS maps |
| Recharts | 3 | Charts |
| Lucide React | 1 | Icons |
| jsPDF + autotable | 4/5 | PDF export |
| xlsx | 0.18 | Excel export |
| socket.io-client | 4 | Real-time (backend) |
| @supabase/supabase-js | 2 | Database + Auth + Storage |

### Backend (FastAPI — `backend/`)
| Package | Purpose |
|---|---|
| FastAPI + uvicorn | API server |
| websockets | Pi WebSocket relay |
| httpx | HTTP client for Pi proxy |
| supabase | Supabase client |
| Deployed on | Render.com (`render.yaml`) |

### Raspberry Pi Server (`raspberry-pi-server/`)
| Component | Details |
|---|---|
| Main server | `video_server_fastapi.py` (FastAPI, port 8080) |
| AI detection | YOLOv8n (`yolov8n.pt`) via Ultralytics |
| Camera | OpenCV (`cv2`) |
| GPS | NEO-6M via UART |
| SMS | SIM900A via UART |
| Supabase upload | `requests` (direct HTTP, no extra lib) |
| Service | `commutai-pi-service.service` (systemd) |
| Python packages | `supabase>=2.3.0,<3.0.0`, `postgrest-py>=0.16.0,<1.0.0` |

---

## Hardware Setup

### Required Hardware

| Component | Spec |
|---|---|
| Raspberry Pi | Pi 4 Model B, 4GB+ RAM (8GB recommended) |
| Storage | 64GB+ microSD (Class 10) |
| Camera | USB Webcam or Pi Camera Module (640×480 min) |
| GPS | NEO-6M GPS Module |
| GSM | SIM900A GSM/GPRS Module + active SIM |
| Emergency Button | Momentary push button |
| Power | 5V/3A USB-C for Pi; 5V/2A external for SIM900A |

### Pin Connections

#### GPS (NEO-6M) — Software Serial GPIO4/GPIO5
| NEO-6M | Raspberry Pi | Wire |
|---|---|---|
| VCC | 3.3V or 5V | Red |
| GND | GND | Black |
| TX | GPIO5 (Pin 29, TXD3) | Blue |
| RX | GPIO4 (Pin 7, RXD3) | Yellow |

#### GSM (SIM900A) — Software Serial GPIO4/GPIO5
| SIM900A | Raspberry Pi | Wire |
|---|---|---|
| VCC | DC-DC 5V/2A external | Red |
| GND | Common GND | Black |
| TX | GPIO4 (Pin 7, RXD3) | Blue |
| RX | GPIO5 (Pin 29, TXD3) | Yellow |

#### Emergency Button
| Button | Raspberry Pi |
|---|---|
| Signal | GPIO 18 |
| Other | GND |
| Pull-up resistor | 10kΩ to 3.3V |

### Hardware Setup Commands
```bash
# Enable serial port
sudo raspi-config
# Interface Options → Serial Port
# - Enable hardware: YES   - Enable console: NO

# Install pigpio for software serial
sudo apt-get install pigpio python3-pigpio
sudo systemctl enable pigpiod && sudo systemctl start pigpiod

# Check camera
ls -la /dev/video*
v4l2-ctl --device=/dev/video0 --info

# Check serial ports
ls -la /dev/ttyS0 /dev/serial0
```

---

## Software Setup

### 1. Frontend (Admin Dashboard)

#### Prerequisites
- Node.js 18+
- Supabase project

#### Install & Run
```bash
# Clone repo
git clone https://github.com/CommutAI/sys-admin.git
cd sys-admin

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env:
#   VITE_SUPABASE_URL=https://your-project.supabase.co
#   VITE_SUPABASE_ANON_KEY=your-anon-key
#   VITE_BACKEND_URL=https://sys-admin-62ro.onrender.com

# Development
npm run dev          # → http://localhost:5173

# Production build
npm run build        # → dist/
```

#### Database Setup
Run all migrations in order:
```bash
# In Supabase SQL Editor, run each file in migrations/ in order:
# 001_initial_schema.sql through 017_add_video_recording_to_trips.sql
```

#### Create Staff Users
In Supabase Dashboard → Authentication → Users, create users then link them:
```sql
INSERT INTO staff_users (id, full_name, email, role, is_active)
VALUES ('<auth-user-uuid>', 'System Admin', 'admin@example.com', 'admin', true);
```
Roles: `admin`, `conductor`, `driver`, `cs_desk`

---

### 2. Backend (FastAPI)

The backend is deployed on **Render** via `backend/render.yaml`. To run locally:

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env:
#   SUPABASE_URL=https://your-project.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Run locally
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Key endpoints:**
- `GET  /health` — Health check
- `POST /api/pi/command` — Queue a shell command for the Pi
- `GET  /api/pi/command/{id}` — Poll command result
- `GET  /api/pi/status` — Check if Pi WebSocket is connected
- `GET  /api/video-processing/download-video/{filename}` — Proxy video from Pi
- `WS   /ws/video-stream/{client_id}` — WebSocket relay for live video

---

### 3. Raspberry Pi Server

#### First-Time Setup

```bash
# SSH into the Pi
ssh chichi@<pi-ip-address>

# Navigate to server directory
cd ~/raspberry-pi-server

# Install system dependencies
sudo apt install -y ffmpeg v4l-utils v4l2loopback-dkms \
  libopencv-dev python3-opencv python3-venv pigpio python3-pigpio

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python packages (use pinned versions)
pip install -r requirements.txt
# IMPORTANT: supabase and postgrest-py must be pinned:
pip install "supabase>=2.3.0,<3.0.0" "postgrest-py>=0.16.0,<1.0.0"

# Download YOLO model
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt
```

#### Configure Environment
```bash
cp .env.example .env
nano .env
```

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key

# Backend relay (Render)
BACKEND_URL=https://sys-admin-62ro.onrender.com

# Hardware
ENABLE_SMS=true
ENABLE_GPS=true
ENABLE_EMERGENCY_BUTTON=true

# SIM900A (GPIO4/GPIO5 software serial)
SIM900A_PORT=GPIO4_GPIO5
SIM900A_BAUDRATE=9600

# NEO-6M GPS (GPIO4/GPIO5)
NEO6M_PORT=GPIO4_GPIO5
NEO6M_BAUDRATE=9600

EMERGENCY_BUTTON_PIN=18

# Camera
CAMERA_ID=0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=15
JPEG_QUALITY=50

# AI
DISABLE_AI=false
COUNT_METHOD=yolo
MODEL_PATH=yolov8n.pt
CONFIDENCE_THRESHOLD=0.25

# Emergency contacts
EMERGENCY_CONTACTS=+63XXXXXXXXXX,+63XXXXXXXXXX
```

#### Install as System Service
```bash
# Install and enable systemd service
sudo cp commutai-pi-service.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable commutai-pi-service
sudo systemctl start commutai-pi-service

# Verify
sudo systemctl status commutai-pi-service
sudo journalctl -u commutai-pi-service -f
```

#### Firewall
```bash
sudo ufw allow 8080
```

---

## Video Recording & Playback

### How It Works

1. **During trip** — Pi records video to SD card (`./recordings/video_<timestamp>_trip_<id>.mp4`)
2. **After trip ends** — Pi transcodes to H.264 via ffmpeg, then uploads to Supabase Storage bucket `trip-videos`
3. **DB updated** — `video_recordings.file_path` = public Supabase Storage URL; `video_recordings.storage_type` = `supabase_storage`
4. **Playback** — Dashboard plays from Supabase URL directly (no Pi needed)

### Offline Recording Recovery

If the Pi had no internet during the trip:
- Video stays as `storage_type: local` on the SD card
- On **next boot** or **backend WebSocket reconnect**, `retry_pending_uploads()` automatically scans for unuploaded recordings and uploads them
- Runs at startup (after 30s delay) and every hour as a safety net

### Dashboard Video States

| State | Meaning |
|---|---|
| ▶ Playing | Video loaded from Supabase Storage URL |
| **Pi Required** | Recording still on SD card; Pi must reconnect and upload |
| No Recording | Trip was not recorded |
| Processing | Recording exists but not yet transcoded |

### Supabase Storage

- **Bucket:** `trip-videos` (public)
- **Path:** `trip-videos/{trip_id}/{filename}`
- **URL pattern:** `https://iyacktzzktwrpeibcena.supabase.co/storage/v1/object/public/trip-videos/{trip_id}/{filename}`

---

## Remote Pi Management

When the Pi is on a mobile hotspot (not directly reachable), use the backend command relay:

### Check Pi Status
```bash
curl https://sys-admin-62ro.onrender.com/api/pi/status
# → {"pi_connected": true/false, "last_seen": "..."}
```

### Send Command to Pi
```bash
curl -X POST https://sys-admin-62ro.onrender.com/api/pi/command \
  -H "Content-Type: application/json" \
  -d '{"command": "sudo systemctl status commutai-pi-service"}'
# → {"command_id": "abc123"}

# Poll for result
curl https://sys-admin-62ro.onrender.com/api/pi/command/abc123
# → {"status": "completed", "output": "...", "exit_code": 0}
```

### Whitelisted Commands
- `pip install <package>`
- `pip show <package>`
- `python --version`
- `sudo systemctl restart/status/stop/start commutai-pi-service`
- `sudo reboot`
- `echo <text>`
- `ls <path>`
- `cat /proc/version`

### Fix Supabase Client on Pi (after deploy)
When Pi reconnects, run:
```bash
# Via remote command relay:
POST /api/pi/command
{"command": "pip install \"supabase>=2.3.0,<3.0.0\" \"postgrest-py>=0.16.0,<1.0.0\""}

# Then restart:
POST /api/pi/command
{"command": "sudo systemctl restart commutai-pi-service"}
```

---

## QR Card System

Cards are stored in the `qr_cards` table. Each card has:

| Field | Description |
|---|---|
| `card_uid` | Physical card ID (e.g., `RC-578-10-569`) |
| `card_type` | `regular`, `student`, `senior_citizen`, `pwd` |
| `passenger_type` | `regular`, `student`, `senior_citizen`, `pwd` |
| `balance` | Current balance (PHP) |
| `status` | `active`, `suspended`, `expired` |

**Card prefix convention:**
- `RC-` Regular Card
- `SC-` Student Card
- `SCC-` Senior Citizen Card
- `PC-` PWD Card
- `TRC-` Temporary Regular Card
- `TSC-` Temporary Student Card
- etc.

**Payment methods:** `qr_card`, `cash`
**Channel must match payment_method** (never use `pos` for cash)

---

## Database Migrations

Migrations are in `migrations/` and must be run in order via Supabase SQL Editor.

| File | Description |
|---|---|
| `001_initial_schema.sql` | Base tables, enums, RLS, seed data |
| `002` | Add `branch` to `staff_users` |
| `003` | Anomaly detection enhancements |
| `004` | Irregularity enhancements |
| `005` | Restrict RLS policies |
| `006` | Add `password` column |
| `007` | Add `decline_reason` column |
| `008` | Create `pi_devices` table |
| `009` | Fix `staff_users` RLS |
| `010` | Restore `staff_users` auth FK |
| `011` | Update SMS queue types |
| `012` | Update `audit_logs` action constraint |
| `013` | Update `card_reservations` status constraint |
| `014` | Add anomaly types to irregularity enum |
| `015` | Drop duplicate FK constraints |
| `016` | Add connect/disconnect to audit logs |
| `016b` | Audit logs security definer |
| `017` | Add video recording fields to `trips` |

---

## User Manual

### Admin Dashboard Pages

#### Dashboard
Real-time summary: active buses, total passengers, today's revenue, active emergencies, unresolved irregularities.

#### Live Map
- Real-time GPS bus locations (auto-updates via Supabase Realtime)
- Click bus marker: plate, passengers, driver, conductor, trip status

#### Trip Management
- Monitor active trips; view GPS track, passengers, revenue
- Start/end trips manually

#### Reports (Trip Detail Modal)
Click any completed trip to open the detail modal:
- **GPS Map** — Route plotted with start/end markers; moving marker synced to video timestamp
- **Video** — Plays from Supabase Storage if uploaded; shows "Pi Required" if still on SD card
- **Segments** — List of recording segments; green badge = cloud, yellow badge = local SD
- **Passengers / Transactions / Irregularities / Alerts** — Tabbed detail

#### Card Management
- Issue new QR cards (regular, student, senior, PWD, temporary)
- View balance, top-up history, card status
- Suspend/reactivate cards

#### Fare Matrix
- Configure point-to-point regular and discounted fares
- Used for transaction fare calculation

#### Audit Logs
- Filter by user, action, module, date range
- Export as PDF (list format) or Excel

### Raspberry Pi Service

```bash
# Start
sudo systemctl start commutai-pi-service

# Stop
sudo systemctl stop commutai-pi-service

# Restart
sudo systemctl restart commutai-pi-service

# Status
sudo systemctl status commutai-pi-service

# Logs (live)
sudo journalctl -u commutai-pi-service -f

# Health check
curl http://localhost:8080/health
```

Expected health response:
```json
{
  "status": "healthy",
  "camera_active": true,
  "passenger_count": 5,
  "connected_clients": 1
}
```

---

## Troubleshooting

### Frontend

| Problem | Solution |
|---|---|
| Tailwind not working | `npm install @tailwindcss/postcss` → delete `.vite` cache → restart |
| Supabase connection | Check `.env` URL/key, verify RLS policies |
| Realtime not updating | Check table is published in Supabase Realtime; check browser WebSocket |
| `ERR_BLOCKED_BY_CLIENT` on Render | Ad blocker blocking `onrender.com` — whitelist in browser |
| Build fails | `rm -rf node_modules dist package-lock.json` → `npm install` → `npm run build` |

### Backend

| Problem | Solution |
|---|---|
| Server won't start | `lsof -ti:8000 \| xargs kill -9` → `python main.py` |
| Cannot reach Supabase | Verify `SUPABASE_SERVICE_ROLE_KEY` in `.env` |
| CORS errors | Add frontend URL to `allowed_origins` in `main.py` |
| Render cold start delay | First request wakes the dyno; pre-warm by visiting `/health` |

### Raspberry Pi

| Problem | Solution |
|---|---|
| `'SingleAPIResponse[TypeVar]' object is not subscriptable` | `pip install "supabase>=2.3.0,<3.0.0" "postgrest-py>=0.16.0,<1.0.0"` |
| Camera not found | `ls /dev/video*`; try `CAMERA_ID=1`; run `diagnose-camera.sh` |
| OOM / `Killed` on startup | Set `DISABLE_AI=true` or increase swap to 1GB (see below) |
| GPS not reading | `python3 check_gps.py`; verify `pigpiod` is running |
| SMS not sending | `python3 check_sim900.py`; verify SIM card is active |
| Video not uploading | Check `SUPABASE_URL`/`SUPABASE_KEY` in `.env`; check disk space |
| Pi not reachable remotely | Use `POST /api/pi/command` relay via Render backend |

**Increase swap (fix OOM):**
```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
free -h
```

**Memory requirements:**
| Mode | Min RAM |
|---|---|
| `DISABLE_AI=true` (stream only) | 256 MB |
| `DISABLE_AI=false` (YOLO) | 1.5 GB free |

---

## Maintenance

### Update Pi Server Files
```bash
# From Windows, push to Pi via SCP
scp -r raspberry-pi-server/* chichi@<pi-ip>:~/raspberry-pi-server/

# Or pull from git on Pi
cd ~/raspberry-pi-server
git pull origin main

# Restart service
sudo systemctl restart commutai-pi-service
```

### Update Python Dependencies on Pi
```bash
source ~/raspberry-pi-server/venv/bin/activate
pip install -r requirements.txt
# Always re-pin supabase
pip install "supabase>=2.3.0,<3.0.0" "postgrest-py>=0.16.0,<1.0.0"
```

### Storage Management
Videos are stored at `~/raspberry-pi-server/recordings/`. The Pi auto-manages disk:
- Deletes recordings older than `MAX_RECORDING_DAYS` (configurable)
- Frees space when less than `MIN_FREE_DISK_GB` remains (FIFO — oldest first)
- Once uploaded to Supabase Storage, local copies can be safely deleted

```bash
# Check disk usage
df -h ~/raspberry-pi-server/recordings

# Manual cleanup
./cleanup_old_videos.sh
```

### Deploy Frontend Changes
```bash
# Changes auto-deploy to Render on push to main
git add .
git commit -m "feat: your change"
git push origin main
# Render rebuilds and deploys (~2 min)
```

### Backup Database
In Supabase Dashboard → Settings → Database → Backups. Point-in-time recovery is available on Pro plan.

---

## Project Structure

```
sys-admin/
├── src/
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── LiveMap.jsx
│   │   ├── TripManagement.jsx
│   │   ├── Reports.jsx           ← GPS map, video playback, trip details
│   │   ├── CardManagement.jsx
│   │   ├── FareMatrix.jsx
│   │   ├── PassengerAnalytics.jsx
│   │   ├── EmergencyAlerts.jsx
│   │   ├── ManageUsers.jsx
│   │   ├── BusManagement.jsx
│   │   ├── AuditLogs.jsx
│   │   ├── Notifications.jsx
│   │   ├── VideoMonitoring.jsx   ← Live Pi camera feed
│   │   ├── GcashTopUp.jsx
│   │   └── CustomerService.jsx
│   ├── App.jsx
│   └── main.jsx
├── backend/
│   ├── main.py                   ← FastAPI app entry point
│   ├── routers/
│   │   ├── video_processing.py   ← Video proxy + Pi command relay
│   │   ├── trips.py
│   │   ├── transactions.py
│   │   ├── cards.py
│   │   ├── analytics.py
│   │   ├── reports.py
│   │   └── ...
│   ├── render.yaml               ← Render deploy config
│   └── requirements.txt
├── raspberry-pi-server/
│   ├── video_server_fastapi.py   ← Main Pi server (FastAPI, port 8080)
│   ├── sync_worker.py            ← SQLite-backed GPS/passenger sync buffer
│   ├── requirements.txt          ← Pinned Python deps
│   ├── requirements-minimal.txt  ← Minimal deps (no AI)
│   ├── commutai-pi-service.service ← Systemd unit file
│   └── ...
├── migrations/                   ← SQL migration files (run in order)
├── public/
├── package.json
└── vite.config.js
```
