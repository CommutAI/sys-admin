# CommutAI Backend - Windows Service Installation Script
# This script installs the backend as a Windows service using NSSM (Non-Sucking Service Manager)

Write-Host "CommutAI Backend - Windows Service Installation" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if NSSM is installed
$nssmPath = "C:\Program Files\NSSM\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    Write-Host "NSSM not found. Installing NSSM..." -ForegroundColor Yellow
    Write-Host "Please download NSSM from https://nssm.cc/download" -ForegroundColor Yellow
    Write-Host "Or install via: choco install nssm" -ForegroundColor Yellow
    exit 1
}

# Get the script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Split-Path -Parent $scriptPath

# Check if venv exists
$venvPath = Join-Path $backendPath "venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "Virtual environment not found at: $venvPath" -ForegroundColor Red
    Write-Host "Please create it first: python -m venv venv" -ForegroundColor Yellow
    exit 1
}

# Check if main.py exists
$mainPath = Join-Path $backendPath "main.py"
if (-not (Test-Path $mainPath)) {
    Write-Host "main.py not found at: $mainPath" -ForegroundColor Red
    exit 1
}

# Define service parameters
$serviceName = "CommutAIBackend"
$displayName = "CommutAI Backend Service"
$description = "CommutAI Backend API Service - FastAPI"
$uvicornPath = Join-Path $venvPath "Scripts\uvicorn.exe"
$appPath = "main:app"
$port = 8000

Write-Host "Installing service..." -ForegroundColor Green
Write-Host "Service Name: $serviceName" -ForegroundColor White
Write-Host "Backend Path: $backendPath" -ForegroundColor White
Write-Host "Uvicorn Path: $uvicornPath" -ForegroundColor White

# Stop existing service if running
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Stopping existing service..." -ForegroundColor Yellow
    Stop-Service -Name $serviceName -Force
    Start-Sleep -Seconds 2
    & $nssmPath remove $serviceName confirm
}

# Install service
& $nssmPath install $serviceName $uvicornPath $appPath --host 0.0.0.0 --port $port
& $nssmPath set $serviceName DisplayName $displayName
& $nssmPath set $serviceName Description $description
& $nssmPath set $serviceName AppDirectory $backendPath
& $nssmPath set $serviceName AppEnvironmentExtra "PYTHONUNBUFFERED=1"
& $nssmPath set $serviceName AppStdout "$backendPath\logs\service-out.log"
& $nssmPath set $serviceName AppStderr "$backendPath\logs\service-error.log"
& $nssmPath set $serviceName AppRotateFiles 1
& $nssmPath set $serviceName AppRotateBytes 1048576

# Create logs directory if it doesn't exist
$logPath = Join-Path $backendPath "logs"
if (-not (Test-Path $logPath)) {
    New-Item -ItemType Directory -Path $logPath -Force
}

# Set service to auto-start
& $nssmPath set $serviceName Start SERVICE_AUTO_START

# Start the service
Write-Host "Starting service..." -ForegroundColor Green
Start-Service -Name $serviceName

# Verify service is running
$service = Get-Service -Name $serviceName
if ($service.Status -eq "Running") {
    Write-Host "SUCCESS: Service installed and running!" -ForegroundColor Green
    Write-Host "Service will auto-start on system boot" -ForegroundColor Green
    Write-Host ""
    Write-Host "To manage the service:" -ForegroundColor Cyan
    Write-Host "  Start:    Start-Service $serviceName" -ForegroundColor White
    Write-Host "  Stop:     Stop-Service $serviceName" -ForegroundColor White
    Write-Host "  Restart:  Restart-Service $serviceName" -ForegroundColor White
    Write-Host "  Status:   Get-Service $serviceName" -ForegroundColor White
    Write-Host "  Remove:   nssm remove $serviceName confirm" -ForegroundColor White
    Write-Host ""
    Write-Host "Logs are at: $logPath" -ForegroundColor Yellow
} else {
    Write-Host "ERROR: Service failed to start" -ForegroundColor Red
    Write-Host "Check logs at: $logPath" -ForegroundColor Yellow
    exit 1
}
