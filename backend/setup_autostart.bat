@echo off
REM Setup CommutAI Backend as Auto-Start Service using Task Scheduler
REM This script creates a scheduled task that runs the backend on Windows startup

echo ========================================
echo CommutAI Backend Auto-Start Setup
echo ========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Remove existing task if it exists
echo Removing existing scheduled task (if any)...
schtasks /delete /tn "CommutAI Backend" /f >nul 2>&1

REM Create new scheduled task
echo Creating scheduled task for auto-start...
schtasks /create /tn "CommutAI Backend" /tr "C:\Users\joshu\sys-admin\backend\start_backend.bat nopause" /sc onlogon /rl highest /f

if %errorLevel% equ 0 (
    echo.
    echo SUCCESS: CommutAI Backend configured for auto-start
    echo.
    echo The backend will automatically start when you log in to Windows.
    echo.
    echo To test immediately:
    echo   1. Run: C:\Users\joshu\sys-admin\backend\start_backend.bat
    echo   2. Or restart your computer
    echo.
    echo To view task details:
    echo   - Press Win+R, type: taskschd.msc
    echo   - Find "CommutAI Backend" in the task list
    echo.
    echo To remove auto-start:
    echo   - Run: schtasks /delete /tn "CommutAI Backend" /f
    echo.
) else (
    echo.
    echo ERROR: Failed to create scheduled task
    echo.
    echo Troubleshooting:
    echo   - Make sure you're running as Administrator
    echo   - Check that start_backend.bat exists at the correct path
    echo.
)

pause
