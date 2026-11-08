@echo off
REM CommutAI Backend Auto-Start Script
REM This script starts the FastAPI backend service

cd /d C:\Users\joshu\sys-admin\backend

REM Check if virtual environment exists
if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
    echo Starting CommutAI Backend Service with virtual environment...
    python -m uvicorn main:app --host 0.0.0.0 --port 8000
) else (
    echo Virtual environment not found, using system Python...
    echo Starting CommutAI Backend Service...
    python -m uvicorn main:app --host 0.0.0.0 --port 8000
)

REM Only pause if running interactively (not from Task Scheduler or Startup)
if /i "%~1" neq "nopause" (
    pause
)
