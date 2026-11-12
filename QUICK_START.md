# CommutAI Quick Start Guide

## 🚀 Deploy Config to Pi (After making changes)

```powershell
cd C:\Users\joshu\sys-admin\raspberry-pi-server
.\deploy-config-to-pi.ps1
```

## ✅ Current Setup (30 FPS with Green Boxes)

**Pi Configuration:**
- ✅ Resolution: 640x480
- ✅ FPS: 30
- ✅ JPEG Quality: 40
- ✅ Green Bounding Boxes: **ENABLED**
- ✅ Detection: Every 3rd frame (optimized)
- ✅ Cloudflare R2 Storage: **CONFIGURED**

## 📱 Access Points

- **Frontend**: https://sys-admin-nine.vercel.app
- **Backend**: https://sys-admin-my13.onrender.com
- **Pi SSH**: `ssh chichi@commutai.local`

## 🔧 Common Commands

### Check Pi Status
```bash
ssh chichi@commutai.local "sudo systemctl status video-server"
```

### View Pi Logs
```bash
ssh chichi@commutai.local "sudo journalctl -u video-server -f"
```

### Restart Pi Service
```bash
ssh chichi@commutai.local "sudo systemctl restart video-server"
```

### Copy File to Pi
```bash
scp ./file.txt chichi@commutai.local:/home/chichi/raspberry-pi-server/
```

## 🎯 What You Should See

1. **Green boxes** around detected passengers ✅
2. **30 FPS** smooth video stream ✅
3. **Passenger count** updating in real-time ✅
4. **GPS tracking** (if enabled) ✅

## 🐛 Troubleshooting

**No green boxes?**
- Check: `DISABLE_DRAWING=false` in Pi's `.env`
- Restart: `sudo systemctl restart video-server`

**Lagging video?**
- Current: 640x480 @ 30 FPS
- Lower if needed: 320x240 or reduce FPS to 15

**Can't connect to Pi?**
- Check: `ping commutai.local`
- Alternative: Use IP address directly

## 📝 Configuration Files

- **Pi Config**: `raspberry-pi-server/.env`
- **Backend Config**: `backend/.env`
- **Frontend Config**: `.env` (root)

## 🔐 Cloudflare R2 Storage

✅ **Configured and Ready**
- Account ID: `bbb7bb5bea0da45c5f6a1ecad6827c31`
- Bucket: `commutai-videos`
- Auto-uploads video recordings

## 📚 Documentation

- **SCP Guide**: `docs/deployment/SCP_DEPLOYMENT_GUIDE.md`
- **Bounding Boxes**: `raspberry-pi-server/ENABLE_BOUNDING_BOXES.md`
- **Pi Setup**: `docs/deployment/PI_SETUP_INSTRUCTIONS.md`
