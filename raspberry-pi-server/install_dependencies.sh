#!/bin/bash
# Install dependencies for Raspberry Pi Bus Monitoring Server

echo "=========================================="
echo "Installing Python dependencies for Bus Monitoring Server"
echo "=========================================="

# Update pip
echo "Updating pip..."
python3 -m pip install --upgrade pip

# Install dependencies
echo "Installing dependencies from requirements.txt..."
pip3 install -r requirements.txt

# Install system dependencies if needed
echo "Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y python3-opencv python3-numpy

echo "=========================================="
echo "Installation complete!"
echo "=========================================="
echo "You can now run the server with:"
echo "python3 video_server_fastapi.py"