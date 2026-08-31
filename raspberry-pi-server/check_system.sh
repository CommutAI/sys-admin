#!/bin/bash
# System check script for Raspberry Pi video server
# Checks camera connection, YOLO model, and service status

echo "=== Bus Monitoring Video Server System Check ==="
echo ""

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ]; then
    echo "⚠️  Warning: This doesn't appear to be a Raspberry Pi"
else
    PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
    echo "✓ Device: $PI_MODEL"
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