#!/bin/bash
# Script to restart the Raspberry Pi server
# Usage: ./restart_pi_server.sh

echo "Stopping existing server on port 5000..."
sudo lsof -ti:5000 | xargs kill -9 2>/dev/null || echo "No process found on port 5000"

echo "Waiting for port to be released..."
sleep 2

echo "Starting video server..."
cd /home/chichi/raspberry-pi-server

# Check if virtual environment exists
if [ -d "venv" ]; then
    echo "Using virtual environment..."
    source venv/bin/activate
    python video_server_fastapi.py
else
    echo "Using system Python..."
    python video_server_fastapi.py
fi