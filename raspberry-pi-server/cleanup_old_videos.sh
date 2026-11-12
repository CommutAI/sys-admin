#!/bin/bash
# Automatic video cleanup script for Raspberry Pi
# Deletes videos older than 7 days to prevent SD card from filling up

RECORDINGS_DIR="$HOME/raspberry-pi-server/recordings"
MAX_AGE_DAYS=7

echo "[$(date)] Starting video cleanup..."

# Check if directory exists
if [ ! -d "$RECORDINGS_DIR" ]; then
    echo "Recordings directory not found: $RECORDINGS_DIR"
    exit 0
fi

# Find and delete videos older than MAX_AGE_DAYS
find "$RECORDINGS_DIR" -name "*.mp4" -type f -mtime +$MAX_AGE_DAYS -print -delete | while read file; do
    echo "Deleted: $file"
done

# Check disk usage
DISK_USAGE=$(df -h "$RECORDINGS_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
echo "Current disk usage: ${DISK_USAGE}%"

# Alert if disk usage is above 85%
if [ "$DISK_USAGE" -gt 85 ]; then
    echo "WARNING: Disk usage is above 85%! Consider reducing MAX_AGE_DAYS."
fi

echo "[$(date)] Cleanup complete."
