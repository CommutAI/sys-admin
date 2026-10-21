#!/bin/bash
# Patch script to enable GPS and fix port configuration

echo "=========================================="
echo "Patching GPS Configuration"
echo "=========================================="

# File to patch
FILE="video_server_stream_only.py"

# Backup original file
cp $FILE ${FILE}.backup
echo "Backup created: ${FILE}.backup"

# Fix 1: Change GPS port from /dev/serial0 to /dev/ttyS0
sed -i "s|'neo6m_port': os.getenv('NEO6M_PORT', '/dev/serial0')|'neo6m_port': os.getenv('NEO6M_PORT', '/dev/ttyS0')|g" $FILE
echo "✓ Fixed GPS port to /dev/ttyS0"

# Fix 2: Enable GPS by default (change 'false' to 'true')
sed -i "s|'enable_gps': os.getenv('ENABLE_GPS', 'false').lower() == 'true'|'enable_gps': os.getenv('ENABLE_GPS', 'true').lower() == 'true'|g" $FILE
echo "✓ Enabled GPS by default"

echo ""
echo "=========================================="
echo "Patch complete!"
echo "=========================================="
echo ""
echo "To apply changes, restart the video server:"
echo "  python3 video_server_stream_only.py"
