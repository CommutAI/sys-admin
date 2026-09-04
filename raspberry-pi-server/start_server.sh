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