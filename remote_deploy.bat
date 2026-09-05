@echo off
REM Complete remote deployment script for Raspberry Pi
REM This script handles everything from Windows without needing physical access to Pi

set PI_USER=chichi
set PI_HOST=192.168.1.45
set LOCAL_PATH=C:\Users\joshu\sys-admin\raspberry-pi-server
set REMOTE_PATH=/home/chichi/raspberry-pi-server

echo ========================================
echo Remote Raspberry Pi Deployment Script
echo ========================================
echo.

echo Step 1: Uploading files to Raspberry Pi...
echo.

REM Upload main files
echo Uploading video_server_fastapi.py...
scp "%LOCAL_PATH%\video_server_fastapi.py" %PI_USER%@%PI_HOST%:%REMOTE_PATH%/
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to upload video_server_fastapi.py
    pause
    exit /b 1
)
echo [OK] video_server_fastapi.py uploaded

echo Uploading hardware_integration.py...
scp "%LOCAL_PATH%\hardware_integration.py" %PI_USER%@%PI_HOST%:%REMOTE_PATH%/
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to upload hardware_integration.py
    pause
    exit /b 1
)
echo [OK] hardware_integration.py uploaded

echo Uploading requirements.txt...
scp "%LOCAL_PATH%\requirements.txt" %PI_USER%@%PI_HOST%:%REMOTE_PATH%/
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to upload requirements.txt
    pause
    exit /b 1
)
echo [OK] requirements.txt uploaded

echo Uploading restart script...
scp "C:\Users\joshu\sys-admin\restart_pi_server.sh" %PI_USER%@%PI_HOST%:%REMOTE_PATH%/
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Failed to upload restart script (will use manual commands)
)

echo.
echo Step 2: Setting up virtual environment remotely...
echo.

REM Create virtual environment remotely
ssh %PI_USER%@%PI_HOST% "cd %REMOTE_PATH% && python3 -m venv venv"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to create virtual environment
    pause
    exit /b 1
)
echo [OK] Virtual environment created

echo.
echo Step 3: Installing dependencies remotely...
echo.

REM Install dependencies remotely
ssh %PI_USER%@%PI_HOST% "cd %REMOTE_PATH% && source venv/bin/activate && pip install -r requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed

echo.
echo Step 4: Stopping existing server...
echo.

REM Stop existing server
ssh %PI_USER%@%PI_HOST% "sudo lsof -ti:5000 | xargs kill -9 2>/dev/null || echo 'No process on port 5000'"
echo [OK] Port 5000 cleared

echo.
echo Step 5: Starting the server remotely...
echo.

REM Start server in background with nohup
ssh %PI_USER%@%PI_HOST% "cd %REMOTE_PATH% && nohup bash -c 'source venv/bin/activate && python video_server_fastapi.py > server.log 2>&1' &"
echo [OK] Server started in background

echo.
echo Step 6: Waiting for server to start...
echo.

timeout /t 5 /nobreak

echo.
echo Step 7: Verifying server is running...
echo.

REM Check if server is running
ssh %PI_USER%@%PI_HOST% "curl -s http://localhost:5000/ || echo 'Server not responding yet'"
echo.

echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo The server should now be running on your Raspberry Pi.
echo You can check the status by running:
echo ssh %PI_USER%@%PI_HOST% "cd %REMOTE_PATH% && tail -f server.log"
echo.
echo To stop the server remotely:
echo ssh %PI_USER%@%PI_HOST% "sudo lsof -ti:5000 | xargs kill -9"
echo.
echo Your React frontend should now be able to connect to:
echo http://%PI_HOST%:5000
echo.
pause