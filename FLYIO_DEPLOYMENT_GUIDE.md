# Fly.io Deployment Guide for CommutAI Backend

This guide will help you deploy the backend to Fly.io with 3GB RAM (perfect for YOLOv8n).

## Prerequisites

1. **Install Fly.io CLI**
   - Windows: Download from https://fly.io/docs/hands-on/install-flyctl/
   - Or run: `powershell -c "iwr https://fly.io/install.ps1 | iex"`

2. **Sign up for Fly.io**
   - Go to https://fly.io and create a free account
   - Run: `flyctl auth signup`

## Deployment Steps

### 1. Navigate to backend directory
```bash
cd backend
```

### 2. Login to Fly.io
```bash
flyctl auth login
```

### 3. Create a new Fly.io app
```bash
flyctl launch
```

When prompted:
- App name: `commutai-backend` (or choose your own)
- Region: `sin` (Singapore - closest to Philippines) or `nrt` (Tokyo)
- Use existing Dockerfile: **Yes**
- Use existing fly.toml: **Yes**

### 4. Set environment variables
```bash
flyctl secrets set SUPABASE_URL="https://iyacktzzktwrpeibcena.supabase.co"
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA3MDEzMywiZXhwIjoyMTA2NjQ2MTMzfQ.5-RIUyTvWz5yE6VaqMCD8DRvaLejY8wroJjBCdYiA4A"
flyctl secrets set FRONTEND_URL="https://sys-admin-nine.vercel.app"
flyctl secrets set ENVIRONMENT="production"
flyctl secrets set DETECTION_METHOD="yolo"
```

### 5. Deploy
```bash
flyctl deploy
```

This will:
- Build the Docker image
- Upload to Fly.io
- Deploy to their infrastructure
- Allocate 3GB RAM (configured in fly.toml)

### 6. Get the deployed URL
```bash
flyctl info
```

You'll see output like:
```
App Name: commutai-backend
Hostname: commutai-backend.fly.dev
```

Your backend URL will be: `https://commutai-backend.fly.dev`

## Update Configuration

### 1. Update Frontend Environment Variable
In your frontend project (Vercel/Netlify/Render), update:
```
VITE_BACKEND_URL=https://commutai-backend.fly.dev
```

### 2. Update Raspberry Pi Configuration
In the Pi's `.env` file, update:
```
BACKEND_URL=https://commutai-backend.fly.dev
```

### 3. Restart the Pi server
```bash
# On the Raspberry Pi
cd raspberry-pi-server
sudo systemctl restart video-server
# Or if running manually:
# Kill the process and restart it
```

## Verify Deployment

### Check backend health
```bash
curl https://commutai-backend.fly.dev/health
```

Should return:
```json
{
  "status": "healthy",
  "service": "commutai-backend"
}
```

### Check video processing status
```bash
curl https://commutai-backend.fly.dev/api/video-processing/status
```

### View logs
```bash
flyctl logs
```

## Troubleshooting

### If deployment fails
```bash
flyctl deploy --verbose
```

### If memory issues persist
Edit `fly.toml` and increase memory:
```toml
[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 4096  # 4GB
```

### Check resource usage
```bash
flyctl status
```

### Scale up if needed
```bash
flyctl scale memory 4096
```

## Cost

Fly.io free tier includes:
- 3 shared-cpu-1x VMs
- 3GB RAM per VM
- 160GB volume storage
- **No monthly cost** for this usage

If you need more resources:
- Extra 1GB RAM: ~$3/month
- More CPU: ~$5-10/month

## Monitor

### View live metrics
```bash
flyctl monitor
```

### View app dashboard
```bash
flyctl dashboard
```

## Next Steps

1. ✅ Deploy backend to Fly.io
2. ✅ Update frontend VITE_BACKEND_URL
3. ✅ Update Pi BACKEND_URL
4. ✅ Restart Pi server
5. ✅ Test video feed in dashboard

The Pi should now connect to Fly.io backend, send frames, and receive YOLO-processed video with passenger counts!
