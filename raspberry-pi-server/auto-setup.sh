#!/bin/bash
# CommutAI Raspberry Pi - Auto-Configuration Script
# This script automatically configures all services when the Pi boots for the first time

set -e

echo "=========================================="
echo "CommutAI Raspberry Pi - Auto Setup"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PI_USER="pi"
INSTALL_DIR="/home/pi/raspberry-pi-server"
GPS_DEVICE="/dev/ttyS1"  # NEO-M8L uses ttyS1
SERVICES=("video-server.service" "sms-queue-processor.service" "commutai-pi-service.service")

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: This script must be run as root${NC}"
    echo "Run with: sudo ./auto-setup.sh"
    exit 1
fi

# Check if already configured
if [ -f "/etc/commutai/.configured" ]; then
    echo -e "${YELLOW}CommutAI is already configured${NC}"
    echo "To reconfigure, remove: /etc/commutai/.configured"
    exit 0
fi

echo "Step 1: Updating system packages..."
apt-get update -y
apt-get upgrade -y

echo ""
echo "Step 2: Installing system dependencies..."
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    i2c-tools \
    gpsd \
    gpsd-clients \
    libatlas-base-dev \
    libhdf5-dev \
    libilmbase-dev \
    libopenexr-dev \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-doc \
    gstreamer1.0-tools \
    gstreamer1.0-x \
    gstreamer1.0-alsa \
    gstreamer1.0-gl \
    gstreamer1.0-gtk3 \
    gstreamer1.0-pulseaudio \
    v4l-utils \
    ffmpeg \
    supervisor

echo ""
echo "Step 3: Configuring GPIO and Serial..."
# Enable serial port
raspi-config nonint do_serial_hw 0
raspi-config nonint do_serial_cons 1

# Enable I2C
raspi-config nonint do_i2c 0

# Enable camera
raspi-config nonint do_camera 0

echo ""
echo "Step 4: Configuring GPS..."
# Create udev rule for GPS (NEO-M8L on ttyS1)
cat > /etc/udev/rules.d/99-gps.rules <<EOF
KERNEL=="ttyS1", MODE="0666", OWNER="pi", GROUP="dialout"
EOF

# Configure gpsd
systemctl stop gpsd.socket 2>/dev/null || true
systemctl disable gpsd.socket 2>/dev/null || true

cat > /etc/default/gpsd <<EOF
START_DAEMON="true"
GPSD_OPTIONS="-n"
DEVICES="$GPS_DEVICE"
GPSD_SOCKET="/var/run/gpsd.sock"
EOF

systemctl enable gpsd
systemctl start gpsd

echo ""
echo "Step 5: Installing Python dependencies..."
# Create virtual environment if it doesn't exist
if [ ! -d "$INSTALL_DIR/venv" ]; then
    sudo -u $PI_USER python3 -m venv "$INSTALL_DIR/venv"
fi

# Activate venv and install dependencies
sudo -u $PI_USER "$INSTALL_DIR/venv/bin/pip" install --upgrade pip
sudo -u $PI_USER "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

echo ""
echo "Step 6: Configuring systemd services..."
for service in "${SERVICES[@]}"; do
    if [ -f "$INSTALL_DIR/$service" ]; then
        echo "Installing $service..."
        cp "$INSTALL_DIR/$service" /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable "$service"
        systemctl start "$service"
        echo -e "${GREEN}✓ $service installed and started${NC}"
    else
        echo -e "${YELLOW}⚠ $service not found, skipping${NC}"
    fi
done

echo ""
echo "Step 7: Setting up camera configuration..."
# Create camera configuration
cat > "$INSTALL_DIR/camera_config.json" <<EOF
{
  "camera": 0,
  "width": 640,
  "height": 480,
  "fps": 30,
  "format": "MJPG"
}
EOF

chown $PI_USER:$PI_USER "$INSTALL_DIR/camera_config.json"

echo ""
echo "Step 8: Setting up log rotation..."
cat > /etc/logrotate.d/commutai <<EOF
/home/pi/raspberry-pi-server/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 pi pi
}
EOF

mkdir -p "$INSTALL_DIR/logs"
chown $PI_USER:$PI_USER "$INSTALL_DIR/logs"

echo ""
echo "Step 9: Configuring network optimization..."
# Disable WiFi power saving to improve connection stability
if [ -f /etc/modprobe.d/8192cu.conf ]; then
    echo "options 8192cu rtw_power_mgnt=0 rtw_enusbss=0" > /etc/modprobe.d/8192cu.conf
fi

# Set hostname if not set
CURRENT_HOSTNAME=$(hostname)
if [ "$CURRENT_HOSTNAME" = "raspberrypi" ]; then
    echo "commutai-pi" > /etc/hostname
    sed -i "s/raspberrypi/commutai-pi/g" /etc/hosts
    echo -e "${GREEN}✓ Hostname set to commutai-pi${NC}"
fi

echo ""
echo "Step 10: Creating configuration marker..."
mkdir -p /etc/commutai
echo "$(date)" > /etc/commutai/.configured
echo "Configuration completed successfully" >> /etc/commutai/.configured

echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "The following services are now running:"
for service in "${SERVICES[@]}"; do
    if systemctl is-active --quiet "$service"; then
        echo -e "${GREEN}✓ $service is running${NC}"
    else
        echo -e "${RED}✗ $service failed to start${NC}"
    fi
done
echo ""
echo "Hostname: $(hostname)"
echo "GPS Device: $GPS_DEVICE"
echo "Install Directory: $INSTALL_DIR"
echo ""
echo "To manage services:"
echo "  Status:  sudo systemctl status <service-name>"
echo "  Start:   sudo systemctl start <service-name>"
echo "  Stop:    sudo systemctl stop <service-name>"
echo "  Restart: sudo systemctl restart <service-name>"
echo "  Logs:    sudo journalctl -u <service-name> -f"
echo ""
echo "The Pi will now auto-start all services on boot."
echo ""
