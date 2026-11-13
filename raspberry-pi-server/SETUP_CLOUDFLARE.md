# Cloudflare Setup Guide for Raspberry Pi

This guide will help you set up both Cloudflare Tunnel (for remote access) and Cloudflare Stream (for video storage) on your Raspberry Pi.

## Part 1: Get Cloudflare Credentials

### Step 1: Sign up for Cloudflare
1. Go to https://dash.cloudflare.com
2. Sign up for a free account (or login if you have one)

### Step 2: Get Cloudflare Stream Credentials
1. Navigate to **Stream**: https://dash.cloudflare.com/stream
2. **Get your Account ID**:
   - Look in the URL bar: `https://dash.cloudflare.com/<ACCOUNT_ID>/stream`
   - Or check the right sidebar
   - Copy this ID (format: `abc123def456...`)

3. **Create API Token**:
   - Go to: https://dash.cloudflare.com/profile/api-tokens
   - Click **"Create Token"**
   - Use template: **"Edit Cloudflare Stream"**
   - Click **"Continue to summary"**
   - Click **"Create Token"**
   - **IMPORTANT**: Copy the token NOW (you won't see it again!)

## Part 2: Configure Raspberry Pi

### Step 1: SSH into your Raspberry Pi

```bash
ssh chichi@192.168.1.54
```

### Step 2: Update the Pi's .env file

```bash
cd ~/raspberry-pi-server
nano .env
```

Add these lines (replace with your actual credentials):

```bash
# Cloudflare Stream Configuration
CLOUDFLARE_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=your_account_id_from_step2
CLOUDFLARE_API_TOKEN=your_api_token_from_step2
```

Save and exit (Ctrl+X, Y, Enter)

### Step 3: Install Cloudflare Tunnel on Pi

```bash
# Download cloudflared for ARM64 (Raspberry Pi)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared

# Make it executable
chmod +x cloudflared

# Move to system location
sudo mv cloudflared /usr/local/bin/

# Verify installation
cloudflared --version
```

### Step 4: Start Cloudflare Tunnel

```bash
# Start tunnel to expose port 8080 (Pi video server)
cloudflared tunnel --url http://127.0.0.1:8080
# Or: bash ~/raspberry-pi-server/start-cloudflare-tunnel.sh
```

You'll see output like:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://something-random-words.trycloudflare.com                                          |
+--------------------------------------------------------------------------------------------+
```

**Copy this URL!** You'll need it for the next step.

### Step 5: Make Cloudflare Tunnel Run at Startup (Optional but Recommended)

Press Ctrl+C to stop the tunnel, then create a systemd service:

```bash
sudo nano /etc/systemd/system/cloudflared-tunnel.service
```

Paste this:

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=chichi
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Save and exit, then:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable cloudflared-tunnel

# Start the service
sudo systemctl start cloudflared-tunnel

# Check status and get the tunnel URL
sudo journalctl -u cloudflared-tunnel -n 50 --no-pager | grep trycloudflare.com
```

Copy the tunnel URL from the output.

### Step 6: Restart the Pi Service

```bash
sudo systemctl restart commutai-pi-service
sudo systemctl status commutai-pi-service
```

## Part 3: Update Frontend Configuration

### Step 1: Update Database with Pi URL

On your Windows machine, open PowerShell and run:

```powershell
# Replace with your actual tunnel URL
$tunnelUrl = "https://your-tunnel-url.trycloudflare.com"

# This will be done through the dashboard or Supabase directly
```

### Step 2: Update .env on Windows

Edit `c:\Users\joshu\sys-admin\.env`:

```bash
VITE_RASPBERRY_PI_URL=https://your-tunnel-url.trycloudflare.com
```

### Step 3: Update Vercel Environment Variables

1. Go to https://vercel.com → Your project → Settings → Environment Variables
2. Update `VITE_RASPBERRY_PI_URL` to your new tunnel URL
3. Click Save and Redeploy

## Part 4: Update Backend with Cloudflare Credentials

### On Windows:

Edit `c:\Users\joshu\sys-admin\backend\.env`:

```bash
CLOUDFLARE_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
```

Restart your local backend:

```powershell
# Stop current backend (Ctrl+C in the terminal running it)
cd c:\Users\joshu\sys-admin\backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### On Render (Production):

1. Go to https://dashboard.render.com
2. Select your `track2go-backend` service
3. Go to **Environment** tab
4. Add these environment variables:
   - `CLOUDFLARE_ENABLED` = `true`
   - `CLOUDFLARE_ACCOUNT_ID` = `your_account_id`
   - `CLOUDFLARE_API_TOKEN` = `your_api_token`
5. Save - Render will automatically redeploy

## Testing

### Test Pi Tunnel:

```bash
curl https://your-tunnel-url.trycloudflare.com/health
```

Should return: `{"status":"ok"}`

### Test Camera Feed:

1. Open your dashboard: https://sys-admin-nine.vercel.app
2. Start a trip
3. Camera feed should appear
4. Stop the trip
5. Check if video was uploaded to Cloudflare Stream:
   - Go to https://dash.cloudflare.com/stream
   - You should see the recorded video

## Troubleshooting

### Tunnel not working:
```bash
# Check if tunnel is running
sudo systemctl status cloudflared-tunnel

# View logs
sudo journalctl -u cloudflared-tunnel -f
```

### Pi service not working:
```bash
# Check status
sudo systemctl status commutai-pi-service

# View logs
sudo journalctl -u commutai-pi-service -f
```

### Cloudflare upload failing:
```bash
# Check Pi logs
sudo journalctl -u commutai-pi-service -n 100 | grep Cloudflare
```

## Notes

- **Cloudflare Tunnel URL changes** each time you restart it (unless you set up a named tunnel)
- **For production**, consider setting up a named tunnel for a permanent URL
- **Cloudflare Stream** has a free tier with 1000 minutes of storage
- Videos are automatically uploaded after each trip ends
