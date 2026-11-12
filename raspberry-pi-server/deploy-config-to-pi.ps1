# Deploy Configuration to Raspberry Pi via SCP
# Usage: .\deploy-config-to-pi.ps1

$PI_HOST = "commutai.local"
$PI_USER = "chichi"
$PI_PATH = "/home/chichi/raspberry-pi-server"

Write-Host "🚀 Deploying configuration to Raspberry Pi..." -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path ".\.env")) {
    Write-Host "❌ Error: .env file not found in current directory" -ForegroundColor Red
    Write-Host "Please run this script from the raspberry-pi-server directory" -ForegroundColor Yellow
    exit 1
}

# Copy .env file to Pi
Write-Host "📤 Copying .env to Pi..." -ForegroundColor Yellow
scp .\.env "${PI_USER}@${PI_HOST}:${PI_PATH}/.env"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ .env deployed successfully!" -ForegroundColor Green
    
    # Restart the video server
    Write-Host "🔄 Restarting video server on Pi..." -ForegroundColor Yellow
    ssh "${PI_USER}@${PI_HOST}" "sudo systemctl restart video-server"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Video server restarted!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Checking logs (Ctrl+C to exit)..." -ForegroundColor Cyan
        ssh "${PI_USER}@${PI_HOST}" "sudo journalctl -u video-server -f"
    } else {
        Write-Host "⚠️  Failed to restart video server" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Failed to deploy .env file" -ForegroundColor Red
    Write-Host "Make sure you can SSH to ${PI_USER}@${PI_HOST}" -ForegroundColor Yellow
}
