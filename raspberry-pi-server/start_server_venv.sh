#!/bin/bash
# Start Raspberry Pi Bus Monitoring Server with virtual environment

echo "Starting Bus Monitoring Server with virtual environment..."

# Activate virtual environment
source venv/bin/activate

# Run the server
python video_server_fastapi.py