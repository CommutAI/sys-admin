@echo off
REM Quick deployment script for Fly.io backend

echo ========================================
echo CommutAI Backend - Fly.io Deployment
echo ========================================
echo.

REM Check if flyctl is installed
where flyctl >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: flyctl is not installed
    echo Please install from: https://fly.io/docs/hands-on/install-flyctl/
    pause
    exit /b 1
)

echo [1/5] Checking Fly.io authentication...
flyctl auth whoami
if %ERRORLEVEL% NEQ 0 (
    echo Not logged in. Opening browser for authentication...
    flyctl auth login
)

echo.
echo [2/5] Navigating to backend directory...
cd backend
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: backend directory not found
    pause
    exit /b 1
)

echo.
echo [3/5] Creating Fly.io app (if not exists)...
flyctl launch --name commutai-backend --region sin --no-deploy --copy-config

echo.
echo [4/5] Setting environment variables...
flyctl secrets set SUPABASE_URL="https://iyacktzzktwrpeibcena.supabase.co"
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA3MDEzMywiZXhwIjoyMTA2NjQ2MTMzfQ.5-RIUyTvWz5yE6VaqMCD8DRvaLejY8wroJjBCdYiA4A"
flyctl secrets set FRONTEND_URL="https://sys-admin-nine.vercel.app"
flyctl secrets set ENVIRONMENT="production"
flyctl secrets set DETECTION_METHOD="yolo"

echo.
echo [5/5] Deploying to Fly.io...
flyctl deploy

echo.
echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Getting app info...
flyctl info

echo.
echo ========================================
echo Next Steps:
echo ========================================
echo 1. Update frontend VITE_BACKEND_URL to: https://commutai-backend.fly.dev
echo 2. Update Pi BACKEND_URL to: https://commutai-backend.fly.dev
echo 3. Restart the Pi server
echo 4. Test the video feed in dashboard
echo.
echo View logs: flyctl logs
echo View metrics: flyctl monitor
echo.
pause
