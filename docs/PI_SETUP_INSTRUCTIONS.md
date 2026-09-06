# Raspberry Pi Setup Instructions

The scripts need to be created directly on your Raspberry Pi. Here are the commands to create them:

## Navigate to Server Directory
```bash
cd /home/chichi/raspberry-pi-server
```

## Create the Scripts

### 1. Create start_server.sh
```bash
cat > start_server.sh << 'EOF'
#!/bin/bash
# Simple start script for the video server (without systemd)
# Usage: ./start_server.sh

echo "Starting Bus Monitoring Video Server..."

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Activate virtual environment
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
else
    echo "Error: Virtual environment not found"
    echo "Run: python3 -m venv venv"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found"
    echo "The server will use default configuration"
fi

# Start the server
echo "Starting video server on http://0.0.0.0:5000"
echo "Press Ctrl+C to stop the server"
echo ""

python video_server_fastapi.py
EOF

chmod +x start_server.sh
```

### 2. Create check_system.sh
```bash
cat > check_system.sh << 'EOF'
#!/bin/bash
# System check script for Raspberry Pi video server
# Checks camera connection, YOLO model, and service status

echo "=== Bus Monitoring Video Server System Check ==="
echo ""

# Check if running on Raspberry Pi
if [ -f /proc/device-tree/model ]; then
    PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
    echo "✓ Device: $PI_MODEL"
else
    echo "⚠️  This doesn't appear to be a Raspberry Pi"
fi

# Check Python version
echo ""
echo "=== Python Environment ==="
PYTHON_VERSION=$(python3 --version 2>&1)
echo "Python: $PYTHON_VERSION"

# Check virtual environment
if [ -d "venv" ]; then
    echo "✓ Virtual environment exists"
    source venv/bin/activate
    echo "✓ Virtual environment activated"
else
    echo "✗ Virtual environment not found"
    echo "  Run: python3 -m venv venv"
fi

# Check required Python packages
echo ""
echo "=== Python Packages ==="
REQUIRED_PACKAGES=("fastapi" "uvicorn" "opencv-python" "ultralytics" "supabase" "python-dotenv")

for package in "${REQUIRED_PACKAGES[@]}"; do
    if python3 -c "import $package" 2>/dev/null; then
        echo "✓ $package is installed"
    else
        echo "✗ $package is NOT installed"
    fi
done

# Check camera connection
echo ""
echo "=== Camera Check ==="
if [ -e /dev/video0 ]; then
    echo "✓ Camera device found at /dev/video0"
    
    # Try to get camera info
    if command -v v4l2-ctl &> /dev/null; then
        echo "Camera info:"
        v4l2-ctl --device=/dev/video0 --info 2>/dev/null || echo "  (Could not get detailed info)"
    fi
else
    echo "✗ Camera device NOT found at /dev/video0"
    echo "  Check camera connection and USB ports"
    echo "  Available video devices:"
    ls -la /dev/video* 2>/dev/null || echo "  No video devices found"
fi

# Check YOLO model
echo ""
echo "=== YOLO Model Check ==="
if [ -f "yolov8n.pt" ]; then
    echo "✓ YOLO model found: yolov8n.pt"
    MODEL_SIZE=$(du -h yolov8n.pt | cut -f1)
    echo "  Size: $MODEL_SIZE"
else
    echo "✗ YOLO model NOT found: yolov8n.pt"
    echo "  Download with: wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt"
fi

# Check environment file
echo ""
echo "=== Configuration Check ==="
if [ -f ".env" ]; then
    echo "✓ .env file exists"
    
    # Check for critical environment variables
    if grep -q "SUPABASE_URL=" .env; then
        echo "✓ SUPABASE_URL configured"
    else
        echo "✗ SUPABASE_URL not configured"
    fi
    
    if grep -q "SUPABASE_KEY=" .env; then
        echo "✓ SUPABASE_KEY configured"
    else
        echo "✗ SUPABASE_KEY not configured"
    fi
    
    if grep -q "CAMERA_ID=" .env; then
        CAMERA_ID=$(grep "CAMERA_ID=" .env | cut -d'=' -f2)
        echo "✓ CAMERA_ID configured: $CAMERA_ID"
    else
        echo "✗ CAMERA_ID not configured (will use default 0)"
    fi
else
    echo "✗ .env file NOT found"
    echo "  Create .env file with configuration"
fi

# Check service status
echo ""
echo "=== Service Status ==="
if systemctl is-active --quiet video-server; then
    echo "✓ video-server service is running"
    systemctl status video-server --no-pager -l
else
    echo "✗ video-server service is NOT running"
    if systemctl is-enabled video-server &>/dev/null; then
        echo "  Service is enabled but not running"
        echo "  Start with: sudo systemctl start video-server"
    else
        echo "  Service is not enabled"
        echo "  Install with: sudo ./install_service.sh"
    fi
fi

# Check network connectivity
echo ""
echo "=== Network Check ==="
if ping -c 1 192.168.1.45 &> /dev/null; then
    echo "✓ Network interface is responsive"
else
    echo "⚠️  Cannot ping local interface (this may be normal)"
fi

# Check if server is accessible
echo ""
echo "=== Server Accessibility ==="
if curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo "✓ Server is responding on http://localhost:5000"
    curl -s http://localhost:5000/health | python3 -m json.tool 2>/dev/null || echo "  (Could not parse health check response)"
else
    echo "✗ Server is NOT responding on http://localhost:5000"
    echo "  Check if service is running: sudo systemctl status video-server"
fi

# Check disk space
echo ""
echo "=== Disk Space ==="
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}')
echo "Disk usage: $DISK_USAGE"

# Check memory
echo ""
echo "=== Memory Usage ==="
FREE_MEM=$(free -h | awk 'NR==2 {print $7}')
echo "Available memory: $FREE_MEM"

echo ""
echo "=== System Check Complete ==="
echo ""
echo "If all checks pass, the system should be ready to run."
echo "If there are issues, address them before starting the service."
EOF

chmod +x check_system.sh
```

### 3. Create install_service.sh
```bash
cat > install_service.sh << 'EOF'
#!/bin/bash
# Installation script for auto-starting the video server as a systemd service
# Usage: sudo ./install_service.sh

echo "Installing Bus Monitoring Video Server as systemd service..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create service file directly
cat > /etc/systemd/system/video-server.service << 'SERVICE_EOF'
[Unit]
Description=Bus Monitoring Video Server
After=network.target

[Service]
Type=simple
User=chichi
WorkingDirectory=/home/chichi/raspberry-pi-server
Environment="PATH=/home/chichi/raspberry-pi-server/venv/bin"
ExecStart=/home/chichi/raspberry-pi-server/venv/bin/python video_server_fastapi.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Set proper permissions
chmod 644 /etc/systemd/system/video-server.service

# Reload systemd daemon
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Enable the service to start on boot
echo "Enabling video-server service to start on boot..."
systemctl enable video-server.service

# Start the service immediately
echo "Starting video-server service..."
systemctl start video-server.service

# Check service status
echo "Checking service status..."
sleep 3
systemctl status video-server.service

echo ""
echo "Installation complete!"
echo "The video server will now automatically start on system boot."
echo ""
echo "Useful commands:"
echo "  sudo systemctl status video-server    - Check service status"
echo "  sudo systemctl restart video-server   - Restart the service"
echo "  sudo systemctl stop video-server      - Stop the service"
echo "  sudo systemctl disable video-server  - Disable auto-start"
echo "  journalctl -u video-server -f          - View service logs"
echo ""
echo "To view logs in real-time:"
echo "  sudo journalctl -u video-server -f"
EOF

chmod +x install_service.sh
```

### 4. Create restart_pi_server.sh
```bash
cat > restart_pi_server.sh << 'EOF'
#!/bin/bash
# Quick restart script for the video server
# Usage: ./restart_pi_server.sh

echo "Restarting Bus Monitoring Video Server..."

# Stop the service if it's running
if systemctl is-active --quiet video-server; then
    echo "Stopping video-server service..."
    sudo systemctl stop video-server
fi

# Start the service
echo "Starting video-server service..."
sudo systemctl start video-server

# Wait a moment for the service to start
sleep 3

# Check status
echo "Checking service status..."
sudo systemctl status video-server --no-pager

echo ""
echo "Server restart complete!"
echo "Check logs with: sudo journalctl -u video-server -f"
EOF

chmod +x restart_pi_server.sh
```

## Now Run These Commands

```bash
# 1. Navigate to server directory
cd /home/chichi/raspberry-pi-server

# 2. Make sure you're in the right place
pwd

# 3. Check what files exist
ls -la

# 4. Run system check
./check_system.sh

# 5. If check passes, try manual start first
./start_server.sh

# 6. If manual start works, install the service
sudo ./install_service.sh
```

## Troubleshooting

### If scripts still not found:
```bash
# Check current directory
pwd

# List files
ls -la

# Make sure you're in the right directory
cd /home/chichi/raspberry-pi-server
```

### If virtual environment doesn't exist:
```bash
# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### If .env file doesn't exist:
```bash
# Create .env file with your configuration
cat > .env << 'EOF'
SUPABASE_URL=https://eiajnmocwxarymfdabjv.supabase.co
SUPABASE_KEY=your_service_role_key_here

CAMERA_ID=0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=15
JPEG_QUALITY=50

ENABLE_VIDEO_RECORDING=true
VIDEO_STORAGE_PATH=./recordings
MAX_VIDEO_DURATION=300
VIDEO_FORMAT=mp4
VIDEO_BITRATE=1000000

DISABLE_AI=false
COUNT_METHOD=yolo
MODEL_PATH=yolov8n.pt
CONFIDENCE_THRESHOLD=0.25
IOU_THRESHOLD=0.45
EOF
```

Replace `your_service_role_key_here` with your actual Supabase service role key.