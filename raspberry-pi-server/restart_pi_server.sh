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