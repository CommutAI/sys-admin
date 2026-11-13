# Copy tunnel unit + start script to Pi, then print remote commands
$ErrorActionPreference = "Stop"
$Pi = "chichi@192.168.1.54"
$Remote = "/home/chichi/raspberry-pi-server"
$files = @(
    "cloudflared-tunnel.service",
    "start-cloudflare-tunnel.sh",
    "tunnel_sync.py"
)

Write-Host "Copying tunnel files to Pi..." -ForegroundColor Cyan
foreach ($f in $files) {
    $local = Join-Path $PSScriptRoot $f
    if (-not (Test-Path $local)) { Write-Host "Missing $local" -ForegroundColor Red; exit 1 }
    scp -4 -o ConnectTimeout=15 $local "${Pi}:${Remote}/$f"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "`nStarting tunnel on Pi (enter password if asked)..." -ForegroundColor Cyan
ssh -4 -o ConnectTimeout=30 $Pi 'sed -i "s/\r$//" ~/raspberry-pi-server/start-cloudflare-tunnel.sh ~/raspberry-pi-server/cloudflared-tunnel.service; chmod +x ~/raspberry-pi-server/start-cloudflare-tunnel.sh; bash ~/raspberry-pi-server/start-cloudflare-tunnel.sh'
