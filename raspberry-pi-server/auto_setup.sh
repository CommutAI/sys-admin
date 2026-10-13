#!/bin/bash
# Quick inline setup for Raspberry Pi - copy and paste this directly

echo "=== Quick Auto Setup for Bus Monitoring Server ==="

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install fastapi uvicorn websockets python-multipart pydantic pydantic-settings supabase opencv-python ultralytics numpy pillow python-dotenv requests pyserial RPi.GPIO

echo "=== Setup Complete ==="
echo "Run: source venv/bin/activate && python video_server_fastapi.py"