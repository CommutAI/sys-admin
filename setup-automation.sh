#!/bin/bash
# Setup script to automate CommutAI Pi server startup
# This script installs systemd service and network handlers for automatic startup

set -e

echo "=== CommutAI Pi Automation Setup ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}This script needs to be run with sudo${NC}"
    echo "Please run: sudo bash setup-automation.sh"
    exit 1
fi

PI_USER="chichi"
PI_HOME="/home/$PI_USER"
SERVER_DIR="$PI_HOME/raspberry-pi-server"

echo "Step 1: Copying systemd service file..."
cp commutai-pi-service.service /etc/systemd/system/
systemctl daemon-reload
echo -e "${GREEN}✓ Systemd service installed${NC}"

echo ""
echo "Step 2: Setting up network dispatcher..."
mkdir -p /etc/networkd-dispatcher/routable.d
cp commutai-network-handler.sh /etc/networkd-dispatcher/routable.d/commutai-network-handler
chmod +x /etc/networkd-dispatcher/routable.d/commutai-network-handler
echo -e "${GREEN}✓ Network handler installed${NC}"

echo ""
echo "Step 3: Enabling and starting the service..."
systemctl enable commutai-pi-service
systemctl start commutai-pi-service
echo -e "${GREEN}✓ Service enabled and started${NC}"

echo ""
echo "Step 4: Checking service status..."
sleep 3
systemctl status commutai-pi-service --no-pager

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "The CommutAI Pi server will now:"
echo "  • Automatically start on boot"
echo "  • Restart if it crashes"
echo "  • Re-register with Supabase when network changes"
echo ""
echo "To view logs:"
echo "  sudo journalctl -u commutai-pi-service -f"
echo ""
echo "To restart manually:"
echo "  sudo systemctl restart commutai-pi-service"
