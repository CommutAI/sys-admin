# SCP Deployment Guide for Raspberry Pi

This guide explains how to deploy configuration files to your Raspberry Pi using SCP (Secure Copy Protocol).

## Prerequisites

- SSH access to your Raspberry Pi
- `scp` command available (included with Git Bash, WSL, or Windows OpenSSH)

## Quick Deployment

### Option 1: Using PowerShell Script (Windows)

```powershell
cd C:\Users\joshu\sys-admin\raspberry-pi-server
.\deploy-config-to-pi.ps1
```

### Option 2: Using Bash Script (Git Bash/WSL)

```bash
cd /c/Users/joshu/sys-admin/raspberry-pi-server
./deploy-config-to-pi.sh
```

### Option 3: Manual SCP Commands

```bash
# Copy .env file to Pi
scp ./raspberry-pi-server/.env chichi@commutai.local:/home/chichi/raspberry-pi-server/.env

# Copy multiple files
scp ./raspberry-pi-server/{.env,video_server_fastapi.py} chichi@commutai.local:/home/chichi/raspberry-pi-server/

# Restart service via SSH
ssh chichi@commutai.local "sudo systemctl restart video-server"

# View logs
ssh chichi@commutai.local "sudo journalctl -u video-server -f"
```

## Current Configuration

**Pi Settings (30 FPS with bounding boxes):**
- Resolution: 640x480
- FPS: 30
- JPEG Quality: 40
- Detection: Every 3rd frame
- Bounding Boxes: **ENABLED** (green boxes visible)

**Cloudflare R2 Storage:**
- Account ID: `[configured in backend/.env]`
- API Token: `[configured in backend/.env]`
- Access Key: `[configured in backend/.env]`
- Endpoint: `[configured in backend/.env]`
- Bucket: `commutai-videos`

## Deployment Workflow

### 1. Edit Configuration Locally

```bash
cd C:\Users\joshu\sys-admin\raspberry-pi-server
notepad .env  # or use VS Code
```

### 2. Deploy to Pi

```powershell
.\deploy-config-to-pi.ps1
```

This script will:
1. ✅ Copy `.env` to Pi
2. ✅ Restart the video server
3. ✅ Show live logs

### 3. Verify Deployment

Check the logs for:
```
Performance optimizations: DISABLE_DRAWING=False
640x480 @ 30fps, JPEG_QUALITY=40
[COUNT] X passenger(s) in frame (using ONNX detection)
```

## Troubleshooting

### SSH Connection Issues

If `commutai.local` doesn't resolve:

```bash
# Find Pi's IP address
ping commutai.local

# Or use direct IP
scp ./.env chichi@192.168.1.100:/home/chichi/raspberry-pi-server/.env
```

### Permission Denied

If you get permission errors:

```bash
# SSH into Pi and fix permissions
ssh chichi@commutai.local
cd ~/raspberry-pi-server
chmod 644 .env
```

### Service Restart Fails

```bash
# SSH into Pi
ssh chichi@commutai.local

# Check service status
sudo systemctl status video-server

# View full logs
sudo journalctl -u video-server -n 100
```

## SCP Cheat Sheet

```bash
# Copy file TO Pi
scp local-file.txt chichi@commutai.local:/remote/path/

# Copy file FROM Pi
scp chichi@commutai.local:/remote/file.txt ./local-path/

# Copy directory recursively
scp -r ./local-dir chichi@commutai.local:/remote/path/

# Copy with compression (faster for large files)
scp -C large-file.mp4 chichi@commutai.local:/remote/path/

# Copy with custom SSH port
scp -P 2222 file.txt chichi@commutai.local:/remote/path/
```

## Backend Deployment

The backend is deployed on Render and automatically pulls from Git. To update backend configuration:

1. Update `backend/.env` locally
2. Commit and push to Git
3. Render will auto-deploy

For immediate testing without deployment:
```bash
cd backend
python main.py
```

## Testing the Setup

After deployment, test the system:

1. **Frontend**: https://sys-admin-nine.vercel.app
2. **Backend**: https://sys-admin-my13.onrender.com/health
3. **Pi Status**: `ssh chichi@commutai.local "sudo systemctl status video-server"`

You should see:
- ✅ Green bounding boxes on detected passengers
- ✅ Smooth 30 FPS video stream
- ✅ Passenger count updating in real-time
- ✅ GPS location tracking (if enabled)

## Security Notes

⚠️ **Important**: The `.env` files contain sensitive credentials:
- Never commit `.env` to Git (already in `.gitignore`)
- Keep Cloudflare tokens secure
- Rotate API keys if exposed
- Use environment-specific tokens for dev/prod

## Quick Commands Reference

```bash
# Full deployment workflow
cd C:\Users\joshu\sys-admin\raspberry-pi-server
.\deploy-config-to-pi.ps1

# Manual deployment
scp ./.env chichi@commutai.local:/home/chichi/raspberry-pi-server/.env
ssh chichi@commutai.local "sudo systemctl restart video-server"

# Check logs
ssh chichi@commutai.local "sudo journalctl -u video-server -f"

# Stop/Start service
ssh chichi@commutai.local "sudo systemctl stop video-server"
ssh chichi@commutai.local "sudo systemctl start video-server"
```
