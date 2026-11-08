#!/bin/bash
# Setup CommutAI Pi Server as Auto-Start Service
# This script installs the systemd service for automatic startup on boot

set -e

echo "========================================"
echo "CommutAI Pi Server Auto-Start Setup"
echo "========================================"
echo

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)"
    echo "Run: sudo ./setup_pi_autostart.sh"
    exit 1
fi

# Get the actual username (not root)
USERNAME=${SUDO_USER:-$(whoami)}
if [ "$USERNAME" = "root" ]; then
    echo "ERROR: Cannot determine user. Please run with sudo from a non-root user."
    exit 1
fi

echo "Installing service for user: $USERNAME"
echo

# Path to service file
SERVICE_DIR="/home/$USERNAME/raspberry-pi-server"
SERVICE_FILE="$SERVICE_DIR/commutai-pi-service.service"

# Check if service file exists
if [ ! -f "$SERVICE_FILE" ]; then
    echo "ERROR: Service file not found at $SERVICE_FILE"
    echo "Make sure you're in the correct directory."
    exit 1
fi

# Update service file with actual username
echo "Updating service file with user: $USERNAME"
sed -i "s|User=chichi|User=$USERNAME|g" "$SERVICE_FILE"
sed -i "s|WorkingDirectory=/home/chichi/raspberry-pi-server|WorkingDirectory=/home/$USERNAME/raspberry-pi-server|g" "$SERVICE_FILE"
sed -i "s|PATH=/home/chichi/raspberry-pi-server/venv/bin|PATH=/home/$USERNAME/raspberry-pi-server/venv/bin|g" "$SERVICE_FILE"
sed -i "s|ExecStart=/home/chichi/raspberry-pi-server/venv/bin/python|ExecStart=/home/$USERNAME/raspberry-pi-server/venv/bin/python|g" "$SERVICE_FILE"

# Copy service file to systemd directory
echo "Installing systemd service..."
cp "$SERVICE_FILE" /etc/systemd/system/commutai-backend.service

# Reload systemd
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Enable service to start on boot
echo "Enabling service to start on boot..."
systemctl enable commutai-backend.service

# Start the service
echo "Starting service..."
systemctl start commutai-backend.service

# Wait a moment for service to start
sleep 2

# Check service status
echo
echo "Service status:"
systemctl status commutai-backend.service --no-pager

echo
echo "========================================"
echo "SUCCESS: CommutAI Pi Server configured for auto-start"
echo "========================================"
echo
echo "The service will automatically start on boot."
echo
echo "Useful commands:"
echo "  - Check status: sudo systemctl status commutai-backend"
echo "  - View logs: sudo journalctl -u commutai-backend -f"
echo "  - Restart service: sudo systemctl restart commutai-backend"
echo "  - Stop service: sudo systemctl stop commutai-backend"
echo "  - Disable auto-start: sudo systemctl disable commutai-backend"
echo
echo "To verify the service is running:"
echo "  curl http://localhost:5000/health"
echo
