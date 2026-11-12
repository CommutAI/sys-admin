# Storage Management for 64GB SD Card

Your 64GB SD card is sufficient for the CommutAI system, but automatic cleanup is recommended to prevent filling up.

## Storage Breakdown

- **System (Raspberry Pi OS + Apps):** ~8GB
- **Available for videos:** ~55GB
- **Each trip video:** ~500MB - 1GB
- **Capacity:** 50-100 trip recordings

## Automatic Cleanup Setup

### Step 1: Copy cleanup script to Pi

From your Windows machine:

```powershell
scp cleanup_old_videos.sh chichi@192.168.1.54:~/raspberry-pi-server/
```

### Step 2: SSH into Pi and make it executable

```bash
ssh chichi@192.168.1.54
cd ~/raspberry-pi-server
chmod +x cleanup_old_videos.sh
```

### Step 3: Set up automatic daily cleanup (runs at 2 AM)

```bash
# Edit crontab
crontab -e

# Add this line at the end:
0 2 * * * /home/chichi/raspberry-pi-server/cleanup_old_videos.sh >> /home/chichi/raspberry-pi-server/cleanup.log 2>&1
```

Save and exit (Ctrl+X, Y, Enter)

### Step 4: Test the cleanup script

```bash
./cleanup_old_videos.sh
```

## Configuration Options

Edit `cleanup_old_videos.sh` to change settings:

```bash
# Keep videos for 7 days (default)
MAX_AGE_DAYS=7

# Keep videos for 14 days (more storage)
MAX_AGE_DAYS=14

# Keep videos for 3 days (less storage)
MAX_AGE_DAYS=3
```

## Manual Cleanup

If you need to free up space immediately:

```bash
# Delete videos older than 3 days
find ~/raspberry-pi-server/recordings -name "*.mp4" -type f -mtime +3 -delete

# Delete all videos (use with caution!)
rm ~/raspberry-pi-server/recordings/*.mp4
```

## Monitor Disk Usage

Check available space:

```bash
# Check disk usage
df -h ~

# Check recordings directory size
du -sh ~/raspberry-pi-server/recordings

# List largest video files
du -h ~/raspberry-pi-server/recordings/*.mp4 | sort -rh | head -10
```

## Recommended Settings

For a 64GB SD card with regular use:

- **MAX_AGE_DAYS=7** (1 week) - Recommended for daily use
- **MAX_AGE_DAYS=14** (2 weeks) - If you need longer retention
- **MAX_AGE_DAYS=3** (3 days) - If you have many trips per day

## Storage Alerts

The cleanup script will warn you if disk usage exceeds 85%. If you see this warning frequently:

1. Reduce `MAX_AGE_DAYS` to clean up more frequently
2. Manually delete old videos
3. Consider upgrading to a larger SD card (128GB or 256GB)

## Backup Important Videos

Before videos are deleted, you can back them up:

### Option 1: Copy to external USB drive

```bash
# Mount USB drive (usually /media/usb)
sudo mount /dev/sda1 /media/usb

# Copy recordings
cp ~/raspberry-pi-server/recordings/*.mp4 /media/usb/commutai-backups/

# Unmount
sudo umount /media/usb
```

### Option 2: Copy to Windows machine

From Windows:

```powershell
# Create backup directory
New-Item -ItemType Directory -Force -Path "C:\CommutAI-Backups"

# Copy all videos from Pi
scp chichi@192.168.1.54:~/raspberry-pi-server/recordings/*.mp4 C:\CommutAI-Backups\
```

## Troubleshooting

### SD Card Full

If the SD card fills up completely:

```bash
# Free up space immediately by deleting old videos
find ~/raspberry-pi-server/recordings -name "*.mp4" -type f -mtime +1 -delete

# Clear system logs (if needed)
sudo journalctl --vacuum-size=100M

# Clear package cache
sudo apt-get clean
```

### Check What's Using Space

```bash
# See largest directories
du -h ~ | sort -rh | head -20

# See largest files
find ~ -type f -size +100M -exec du -h {} + | sort -rh
```
