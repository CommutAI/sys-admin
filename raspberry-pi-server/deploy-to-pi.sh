#!/bin/bash
# CommutAI Raspberry Pi - Deployment Script
# This script deploys the project to the Raspberry Pi

set -e

echo "=========================================="
echo "CommutAI Raspberry Pi - Deployment"
echo "=========================================="
echo ""

# Configuration
PI_USER="pi"
PI_HOST="commutai-pi.local"  # Change this if hostname is different
PI_DIR="/home/pi/raspberry-pi-server"

# Check if we can connect to the Pi
echo "Checking connection to Pi..."
if ! ssh -o ConnectTimeout=5 ${PI_USER}@${PI_HOST} "echo 'Connected to Pi'" 2>/dev/null; then
    echo "ERROR: Cannot connect to ${PI_USER}@${PI_HOST}"
    echo "Make sure:"
    echo "  1. The Pi is on the same network"
    echo "  2. SSH is enabled on the Pi"
    echo "  3. You can ping the Pi: ping ${PI_HOST}"
    echo ""
    echo "Try using IP address instead:"
    echo "  PI_HOST=192.168.1.X ./deploy-to-pi.sh"
    exit 1
fi

echo -e "${GREEN}✓ Connected to Pi${NC}"
echo ""

# Create backup
echo "Creating backup on Pi..."
ssh ${PI_USER}@${PI_HOST} "if [ -d '$PI_DIR' ]; then cp -r $PI_DIR ${PI_DIR}.backup.$(date +%Y%m%d_%H%M%S); fi"
echo -e "${GREEN}✓ Backup created${NC}"
echo ""

# Create directories
echo "Creating directories on Pi..."
ssh ${PI_USER}@${PI_HOST} "mkdir -p $PI_DIR/logs"
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Copy files
echo "Copying files to Pi..."
rsync -avz --progress \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'venv' \
    --exclude '.DS_Store' \
    --exclude '*.backup.*' \
    ./ ${PI_USER}@${PI_HOST}:${PI_DIR}/
echo -e "${GREEN}✓ Files copied${NC}"
echo ""

# Set up virtual environment
echo "Setting up virtual environment on Pi..."
ssh ${PI_USER}@${PI_HOST} << EOF
cd $PI_DIR

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created"
fi

# Activate venv and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "Dependencies installed"
EOF
echo -e "${GREEN}✓ Virtual environment ready${NC}"
echo ""

# Install setup service
echo "Installing auto-setup service..."
scp commutai-setup.service ${PI_USER}@${PI_HOST}:/tmp/
ssh ${PI_USER}@${PI_HOST} "sudo mv /tmp/commutai-setup.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable commutai-setup.service"
echo -e "${GREEN}✓ Auto-setup service installed${NC}"
echo ""

# Check if auto-setup should run
echo "Checking if auto-setup should run..."
if ssh ${PI_USER}@${PI_HOST} "[ ! -f /etc/commutai/.configured ]"; then
    echo -e "${YELLOW}Auto-setup will run on next boot${NC}"
    echo "Run manually now with: sudo $PI_DIR/auto-setup.sh"
else
    echo -e "${GREEN}Already configured, skipping auto-setup${NC}"
fi
echo ""

# Restart services
echo "Restarting services..."
ssh ${PI_USER}@${PI_HOST} << EOF
sudo systemctl daemon-reload
sudo systemctl restart video-server.service || true
sudo systemctl restart sms-queue-processor.service || true
sudo systemctl restart commutai-pi-service.service || true
EOF
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

echo "=========================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Check service status: ssh ${PI_USER}@${PI_HOST} 'systemctl | grep commutai'"
echo "  2. View logs: ssh ${PI_USER}@${PI_HOST} 'sudo journalctl -u video-server.service -f'"
echo "  3. Test API: curl http://${PI_HOST}:5000/health"
echo ""
