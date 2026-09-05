# Complete remote deployment script for Raspberry Pi
# This script handles everything from Windows without needing physical access to Pi

$piUser = "chichi"
$piHost = "192.168.1.45"
$localPath = "C:\Users\joshu\sys-admin\raspberry-pi-server"
$remotePath = "/home/chichi/raspberry-pi-server"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Remote Raspberry Pi Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Uploading files to Raspberry Pi..." -ForegroundColor Yellow
Write-Host ""

$filesToUpload = @(
    "video_server_fastapi.py",
    "hardware_integration.py", 
    "requirements.txt"
)

foreach ($file in $filesToUpload) {
    $localFile = Join-Path $localPath $file
    $remoteFile = "$piUser@$piHost`:$remotePath/$file"
    
    Write-Host "Uploading $file..." -ForegroundColor Yellow
    scp $localFile $remoteFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] $file uploaded" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Failed to upload $file" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Upload restart script
$restartScript = "C:\Users\joshu\sys-admin\restart_pi_server.sh"
if (Test-Path $restartScript) {
    Write-Host "Uploading restart_pi_server.sh..." -ForegroundColor Yellow
    scp $restartScript "$piUser@$piHost`:$remotePath/"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] restart_pi_server.sh uploaded" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Step 2: Setting up virtual environment remotely..." -ForegroundColor Yellow
Write-Host ""

ssh "$piUser@$piHost" "cd $remotePath && python3 -m venv venv"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Virtual environment created" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to create virtual environment" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Step 3: Installing dependencies remotely..." -ForegroundColor Yellow
Write-Host ""

ssh "$piUser@$piHost" "cd $remotePath && source venv/bin/activate && pip install -r requirements.txt"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Step 4: Stopping existing server..." -ForegroundColor Yellow
Write-Host ""

ssh "$piUser@$piHost" "sudo lsof -ti:5000 | xargs kill -9 2>/dev/null || echo 'No process on port 5000'"
Write-Host "[OK] Port 5000 cleared" -ForegroundColor Green

Write-Host ""
Write-Host "Step 5: Starting the server remotely..." -ForegroundColor Yellow
Write-Host ""

ssh "$piUser@$piHost" "cd $remotePath && nohup bash -c 'source venv/bin/activate && python video_server_fastapi.py > server.log 2>&1' &"
Write-Host "[OK] Server started in background" -ForegroundColor Green

Write-Host ""
Write-Host "Step 6: Waiting for server to start..." -ForegroundColor Yellow
Write-Host ""

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Step 7: Verifying server is running..." -ForegroundColor Yellow
Write-Host ""

ssh "$piUser@$piHost" "curl -s http://localhost:5000/ || echo 'Server not responding yet'"
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The server should now be running on your Raspberry Pi." -ForegroundColor White
Write-Host "You can check the status by running:" -ForegroundColor Cyan
Write-Host "ssh $piUser@$piHost 'cd $remotePath && tail -f server.log'" -ForegroundColor White
Write-Host ""
Write-Host "To stop the server remotely:" -ForegroundColor Cyan
Write-Host "ssh $piUser@$piHost 'sudo lsof -ti:5000 | xargs kill -9'" -ForegroundColor White
Write-Host ""
Write-Host "Your React frontend should now be able to connect to:" -ForegroundColor Cyan
Write-Host "http://$piHost`:5000" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to exit"