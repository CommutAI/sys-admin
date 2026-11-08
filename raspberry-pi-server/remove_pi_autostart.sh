#!/bin/bash
# Remove CommutAI Pi Server Auto-Start Service
# This script removes the systemd service

set -e

echo "========================================"
echo "Remove CommutAI Pi Server Auto-Start"
echo "========================================"
echo

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)"
    echo "Run: sudo ./remove_pi_autostart.sh"
    exit 1
fi

# Stop the service if running
echo "Stopping service (if running)..."
systemctl stop commutai-backend.service 2>/dev/null || true

# Disable the service
echo "Disabling service..."
systemctl disable commutai-backend.service 2>/dev/null || true

# Remove the service file
echo "Removing service file..."
rm -f /etc/systemd/system/commutai-backend.service

# Reload systemd
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Reset failed units
systemctl reset-failed 2>/dev/null || true

echo
echo "========================================"
echo "SUCCESS: CommutAI Pi Server auto-start removed"
echo "========================================"
echo
echo "The service will no longer start automatically on boot."
echo
echo "To manually start the service in the future:"
echo "  cd /home/\$(whoami)/raspberry-pi-server"
echo "  source venv/bin/activate"
echo "  python video_server_fastapi.py"
echo
