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
SERVICE_FILE="$SCRIPT_DIR/video-server.service"

# Check if service file exists
if [ ! -f "$SERVICE_FILE" ]; then
    echo "Error: video-server.service not found in $SCRIPT_DIR"
    exit 1
fi

# Copy service file to systemd directory
echo "Copying service file to /etc/systemd/system/..."
cp "$SERVICE_FILE" /etc/systemd/system/video-server.service

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