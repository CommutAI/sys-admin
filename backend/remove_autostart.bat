@echo off
REM Remove CommutAI Backend Auto-Start Configuration
REM This script removes the scheduled task that auto-starts the backend

echo ========================================
echo Remove CommutAI Backend Auto-Start
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

REM Remove the scheduled task
echo Removing scheduled task...
schtasks /delete /tn "CommutAI Backend" /f

if %errorLevel% equ 0 (
    echo.
    echo SUCCESS: CommutAI Backend auto-start removed
    echo.
    echo The backend will no longer start automatically on login.
    echo.
) else (
    echo.
    echo INFO: No auto-start task was found (or it was already removed)
    echo.
)

pause
