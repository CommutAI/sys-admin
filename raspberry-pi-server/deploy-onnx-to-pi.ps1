# Deploy ONNX video server + systemd unit to Pi (IPv4 — avoids commutai.local IPv6 hang)
$ErrorActionPreference = "Stop"
$Pi = "chichi@192.168.1.54"
$Remote = "/home/chichi/raspberry-pi-server"
$LocalPy = Join-Path $PSScriptRoot "video_server_fastapi.py"
$LocalSvc = Join-Path $PSScriptRoot "commutai-pi-service.service"
$LocalFix = Join-Path $PSScriptRoot "fix-port-8080.sh"
$LocalDiag = Join-Path $PSScriptRoot "diagnose-camera.sh"

foreach ($f in @($LocalPy, $LocalSvc, $LocalFix, $LocalDiag)) {
    if (-not (Test-Path $f)) {
        Write-Host "Missing $f" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Copying files to Pi..." -ForegroundColor Cyan
scp -4 -o ConnectTimeout=15 $LocalPy "${Pi}:${Remote}/video_server_fastapi.py"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
scp -4 -o ConnectTimeout=15 $LocalSvc "${Pi}:${Remote}/commutai-pi-service.service"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
scp -4 -o ConnectTimeout=15 $LocalFix "${Pi}:${Remote}/fix-port-8080.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
scp -4 -o ConnectTimeout=15 $LocalDiag "${Pi}:${Remote}/diagnose-camera.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Installing unit, freeing :8080, restarting..." -ForegroundColor Cyan
# Single-quoted remote command — avoids PowerShell mangling of bash flags
ssh -4 -o ConnectTimeout=20 $Pi 'sed -i "s/\r$//" ~/raspberry-pi-server/fix-port-8080.sh ~/raspberry-pi-server/commutai-pi-service.service ~/raspberry-pi-server/diagnose-camera.sh; sudo cp ~/raspberry-pi-server/commutai-pi-service.service /etc/systemd/system/commutai-pi-service.service; sudo systemctl daemon-reload; bash ~/raspberry-pi-server/fix-port-8080.sh'
