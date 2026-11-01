#!/bin/bash
# CommutAI Backend - Linux Systemd Service Installation Script
# This script installs the backend as a systemd service

set -e

echo "=========================================="
echo "CommutAI Backend - Service Installation"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root"
    echo "Run with: sudo ./install-backend-service.sh"
    exit 1
fi

# Configuration
SERVICE_NAME="commutai-backend"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
INSTALL_DIR="/var/www/commutai/backend"
VENV_DIR="${INSTALL_DIR}/venv"
USER="www-data"
GROUP="www-data"

# Get script directory (assuming script is in backend folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# If running from development directory, use current directory
if [ -f "${SCRIPT_DIR}/main.py" ]; then
    INSTALL_DIR="$SCRIPT_DIR"
    USER="$USER"
    # Check if venv exists in current directory
    if [ -d "${SCRIPT_DIR}/venv" ]; then
        VENV_DIR="${SCRIPT_DIR}/venv"
    fi
fi

echo "Installation directory: $INSTALL_DIR"
echo "Virtual environment: $VENV_DIR"
echo "Service user: $USER"
echo ""

# Check if main.py exists
if [ ! -f "${INSTALL_DIR}/main.py" ]; then
    echo "ERROR: main.py not found in $INSTALL_DIR"
    exit 1
fi

# Check if venv exists
if [ ! -d "$VENV_DIR" ]; then
    echo "ERROR: Virtual environment not found at $VENV_DIR"
    echo "Create it with: python3 -m venv $VENV_DIR"
    exit 1
fi

# Check if uvicorn is installed
if [ ! -f "${VENV_DIR}/bin/uvicorn" ]; then
    echo "ERROR: uvicorn not found in virtual environment"
    echo "Install it with: ${VENV_DIR}/bin/pip install uvicorn"
    exit 1
fi

# Create service file
echo "Creating systemd service file..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=CommutAI Backend Service (FastAPI)
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
Group=$GROUP
WorkingDirectory=$INSTALL_DIR
Environment="PATH=${VENV_DIR}/bin:/usr/local/bin:/usr/bin:/bin"
Environment="PYTHONUNBUFFERED=1"
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${VENV_DIR}/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "Service file created at: $SERVICE_FILE"

# Set permissions
chown root:root "$SERVICE_FILE"
chmod 644 "$SERVICE_FILE"

# Reload systemd
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Enable service
echo "Enabling service to start on boot..."
systemctl enable "$SERVICE_NAME"

# Start service
echo "Starting service..."
systemctl start "$SERVICE_NAME"

# Wait a moment for service to start
sleep 3

# Check service status
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo ""
    echo "=========================================="
    echo "SUCCESS: Service installed and running!"
    echo "=========================================="
    echo ""
    echo "Service name: $SERVICE_NAME"
    echo "Service will auto-start on system boot"
    echo ""
    echo "To manage the service:"
    echo "  Start:   sudo systemctl start $SERVICE_NAME"
    echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
    echo "  Restart: sudo systemctl restart $SERVICE_NAME"
    echo "  Status:  sudo systemctl status $SERVICE_NAME"
    echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
    echo ""
    echo "To disable auto-start:"
    echo "  sudo systemctl disable $SERVICE_NAME"
    echo ""
else
    echo ""
    echo "ERROR: Service failed to start"
    echo "Check status with: sudo systemctl status $SERVICE_NAME"
    echo "Check logs with: sudo journalctl -u $SERVICE_NAME"
    exit 1
fi
