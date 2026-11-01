@echo off
REM CommutAI Backend - Startup Script (Windows)
REM This script starts the backend server

echo ==========================================
echo CommutAI Backend - Starting Server
echo ==========================================

REM Get the script directory
set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%

REM Check if venv exists
if not exist "%BACKEND_DIR%venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found
    echo Please create it first: python -m venv venv
    pause
    exit /b 1
)

REM Activate virtual environment
call "%BACKEND_DIR%venv\Scripts\activate.bat"

REM Check if .env exists
if not exist "%BACKEND_DIR%.env" (
    echo WARNING: .env file not found
    echo Creating from .env.example if it exists...
    if exist "%BACKEND_DIR%.env.example" (
        copy "%BACKEND_DIR%.env.example" "%BACKEND_DIR%.env"
        echo Please configure your .env file with proper credentials
        pause
    )
)

REM Start the backend server
echo Starting backend server on http://localhost:8000
echo Press Ctrl+C to stop
echo.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
