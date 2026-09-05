# Script to upload updated files to Raspberry Pi
# Usage: .\upload_to_pi.ps1

$piUser = "chichi"
$piHost = "192.168.1.45"
$localPath = "C:\Users\joshu\sys-admin\raspberry-pi-server"
$remotePath = "/home/chichi/raspberry-pi-server"

Write-Host "Uploading files to Raspberry Pi ($piHost)..." -ForegroundColor Green

$filesToUpload = @(
    "video_server_fastapi.py",
    "hardware_integration.py",
    "requirements.txt"
)

foreach ($file in $filesToUpload) {
    $localFile = Join-Path $localPath $file
    $remoteFile = "$piUser@$piHost:$remotePath/$file"
    
    if (Test-Path $localFile) {
        Write-Host "Uploading $file..." -ForegroundColor Yellow
        scp $localFile $remoteFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ $file uploaded successfully" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to upload $file" -ForegroundColor Red
        }
    } else {
        Write-Host "✗ File not found: $localFile" -ForegroundColor Red
    }
}

# Also upload setup script from parent directory
$setupScript = Join-Path (Split-Path $localPath -Parent) "setup_pi_env.sh"
if (Test-Path $setupScript) {
    Write-Host "Uploading setup_pi_env.sh..." -ForegroundColor Yellow
    scp $setupScript "$piUser@$piHost:$remotePath/"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ setup_pi_env.sh uploaded successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to upload setup_pi_env.sh" -ForegroundColor Red
    }
}

Write-Host "`nUpload complete!" -ForegroundColor Green
Write-Host "Now SSH into your Raspberry Pi and complete the setup:" -ForegroundColor Cyan
Write-Host "ssh $piUser@$piHost" -ForegroundColor White
Write-Host "cd $remotePath" -ForegroundColor White
Write-Host "Quick setup (recommended): chmod +x setup_pi_env.sh && ./setup_pi_env.sh" -ForegroundColor Yellow
Write-Host "Or manual setup:" -ForegroundColor White
Write-Host "  - Virtual Environment: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt" -ForegroundColor White
Write-Host "  - System packages: pip install --break-system-packages -r requirements.txt" -ForegroundColor White
Write-Host "Restart server: python video_server_fastapi.py (activate venv first if using virtual environment)" -ForegroundColor White