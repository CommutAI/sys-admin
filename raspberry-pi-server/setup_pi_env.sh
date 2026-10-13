#!/bin/bash
# Quick setup script for Raspberry Pi environment
# Usage: ./setup_pi_env.sh

echo "Setting up Raspberry Pi environment for video server..."

cd /home/chichi/raspberry-pi-server

# Check if venv already exists
if [ -d "venv" ]; then
    echo "Virtual environment already exists."
    echo "Activating virtual environment..."
    source venv/bin/activate
else
    echo "Creating virtual environment..."
    python3 -m venv venv
    
    echo "Activating virtual environment..."
    source venv/bin/activate
    
    echo "Installing dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
fi

# Make scripts executable
echo "Making scripts executable..."
chmod +x install_service.sh
chmod +x check_system.sh
chmod +x restart_pi_server.sh
chmod +x start_server.sh

# Download YOLO model if not present
if [ ! -f "yolov8n.pt" ]; then
    echo "Downloading YOLO model..."
    wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt
else
    echo "YOLO model already present."
fi

# Create recordings directory
if [ ! -d "recordings" ]; then
    echo "Creating recordings directory..."
    mkdir recordings
fi

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Check system: ./check_system.sh"
echo "2. Install auto-start service: sudo ./install_service.sh"
echo "3. Or start manually: ./start_server.sh"
echo ""
echo "To start the server manually, run: source venv/bin/activate && python video_server_fastapi.py"
echo "Or use: ./start_server.sh"