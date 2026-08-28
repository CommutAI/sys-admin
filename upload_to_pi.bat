@echo off
REM Script to upload updated files to Raspberry Pi (Windows CMD version)

set PI_USER=chichi
set PI_HOST=192.168.1.45
set LOCAL_PATH=C:\Users\joshu\sys-admin\raspberry-pi-server
set REMOTE_PATH=/home/chichi/raspberry-pi-server

echo Uploading files to Raspberry Pi (%PI_HOST%)...
echo.

REM Upload video_server_fastapi.py
echo Uploading video_server_fastapi.py...
scp "%LOCAL_PATH%\video_server_fastapi.py" %PI_USER%@%PI_HOST%:%REMOTE_PATH%/
if %ERRORLEVEL% EQU 0 (
    echo [OK] video_server_fastapi.py uploaded successfully
) else (
    echo [ERROR] Failed to upload video_server_fastapi.py
)

REM Upload hardware_integration.py
echo Uploading hardware_integration.py...
scp "%LOCAL_PATH%\hardware_integration.py" %PI_USER%@%PI_HOST%:%REMOTE_PATH%/
if %ERRORLEVEL% EQU 0 (
    echo [OK] hardware_integration.py uploaded successfully
) else (
    echo [ERROR] Failed to upload hardware_integration.py
)

REM Upload requirements.txt
echo Uploading requirements.txt...
scp "%LOCAL_PATH%\requirements.txt" %PI_USER%@%PI_HOST%:%REMOTE_PATH%/
if %ERRORLEVEL% EQU 0 (
    echo [OK] requirements.txt uploaded successfully
) else (
    echo [ERROR] Failed to upload requirements.txt
)

REM Upload setup script
echo Uploading setup_pi_env.sh...
scp "C:\Users\joshu\sys-admin\setup_pi_env.sh" %PI_USER%@%PI_HOST%:%REMOTE_PATH%/
if %ERRORLEVEL% EQU 0 (
    echo [OK] setup_pi_env.sh uploaded successfully
) else (
    echo [ERROR] Failed to upload setup_pi_env.sh
)

echo.
echo Upload complete!
echo.
echo Next steps:
echo 1. SSH into your Raspberry Pi: ssh %PI_USER%@%PI_HOST%
echo 2. Navigate to server directory: cd %REMOTE_PATH%
echo 3. Quick setup (recommended): chmod +x setup_pi_env.sh && ./setup_pi_env.sh
echo 4. Or manual setup:
echo    - Virtual Environment: python3 -m venv venv ^&^& source venv/bin/activate ^&^& pip install -r requirements.txt
echo    - System packages: pip install --break-system-packages -r requirements.txt
echo 5. Restart the server: python video_server_fastapi.py (or source venv/bin/activate first if using venv)
echo.
pause