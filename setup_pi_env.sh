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

echo "Setup complete!"
echo "To start the server, run: source venv/bin/activate && python video_server_fastapi.py"
echo "Or use: ./restart_pi_server.sh"