#!/bin/bash
# Deploy Configuration to Raspberry Pi via SCP
# Usage: ./deploy-config-to-pi.sh

PI_HOST="commutai.local"
PI_USER="chichi"
PI_PATH="/home/chichi/raspberry-pi-server"

echo "🚀 Deploying configuration to Raspberry Pi..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found in current directory"
    echo "Please run this script from the raspberry-pi-server directory"
    exit 1
fi

# Copy .env file to Pi
echo "📤 Copying .env to Pi..."
scp ./.env "${PI_USER}@${PI_HOST}:${PI_PATH}/.env"

if [ $? -eq 0 ]; then
    echo "✅ .env deployed successfully!"
    
    # Restart the video server
    echo "🔄 Restarting video server on Pi..."
    ssh "${PI_USER}@${PI_HOST}" "sudo systemctl restart video-server"
    
    if [ $? -eq 0 ]; then
        echo "✅ Video server restarted!"
        echo ""
        echo "📊 Checking logs (Ctrl+C to exit)..."
        ssh "${PI_USER}@${PI_HOST}" "sudo journalctl -u video-server -f"
    else
        echo "⚠️  Failed to restart video server"
    fi
else
    echo "❌ Failed to deploy .env file"
    echo "Make sure you can SSH to ${PI_USER}@${PI_HOST}"
fi
