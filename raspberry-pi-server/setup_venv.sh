#!/bin/bash
# Setup Python virtual environment for Raspberry Pi Bus Monitoring Server

echo "=========================================="
echo "Setting up Python virtual environment"
echo "=========================================="

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install fastapi uvicorn websockets python-multipart pydantic pydantic-settings supabase opencv-python ultralytics numpy pillow python-dotenv requests pyserial RPi.GPIO

echo "=========================================="
echo "Virtual environment setup complete!"
echo "=========================================="
echo "To run the server:"
echo "1. Activate the environment: source venv/bin/activate"
echo "2. Run the server: python video_server_fastapi.py"
echo "3. Deactivate when done: deactivate"