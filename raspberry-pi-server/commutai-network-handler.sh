#!/bin/bash
# Network dispatcher script for CommutAI Pi
# This script runs when network interface changes
# It restarts the video server to ensure it registers with the new IP

LOG_FILE="/home/chichi/raspberry-pi-server/network-handler.log"
SERVICE_NAME="commutai-pi-service"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "Network change detected. Interface: $1, Action: $2"

# Give the network a moment to stabilize
sleep 5

# Check if we have network connectivity
if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
    log "Network connectivity confirmed. Restarting video server..."
    
    # Restart the service to re-register with new IP
    systemctl restart "$SERVICE_NAME"
    
    if [ $? -eq 0 ]; then
        log "Video server restarted successfully"
    else
        log "Failed to restart video server"
    fi
else
    log "No network connectivity. Skipping restart."
fi
