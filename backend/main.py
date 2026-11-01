"""
FastAPI Backend Service for CommutAI System
Handles complex operations, aggregations, and business logic
"""

from fastapi import FastAPI, HTTPException, Depends, status, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional
import os
import asyncio
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

from routers import cards, transactions, analytics, reports, webhooks, staff, anomaly_detection, emergency_alerts, video_processing, trips, sms
from database import supabase
from auth import verify_supabase_token, require_admin, require_driver
from video_processor import video_processor

# Rate limiting
limiter = Limiter(key_func=get_remote_address)

# Background task for anomaly detection
async def anomaly_detection_scheduler():
    """Run anomaly detection every 30 seconds"""
    while True:
        try:
            print("Running scheduled anomaly detection...")
            # Import and call the function
            from routers.anomaly_detection import run_anomaly_detection
            result = await run_anomaly_detection()
            print(f"Anomaly detection completed: {result.anomalies_detected} anomalies detected, {result.irregularities_created} irregularities created")
        except Exception as e:
            print(f"Error in anomaly detection scheduler: {e}")
        
        # Wait 30 seconds before next run
        await asyncio.sleep(30)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    print("Starting FastAPI backend service...")
    # Initialize video processor model
    print("Initializing video processor...")
    video_processor.initialize_model()
    
    # Start anomaly detection scheduler as background task
    asyncio.create_task(anomaly_detection_scheduler())
    print("Anomaly detection scheduler started (every 30s)")
    
    yield
    # Shutdown
    print("Shutting down FastAPI backend service...")

app = FastAPI(
    title="CommutAI Backend API",
    description="FastAPI backend service for complex operations and aggregations",
    version="1.0.0",
    lifespan=lifespan
)

# Rate limiting setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware - configurable via environment
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
    frontend_url,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
    max_age=600,
)

# Include routers
app.include_router(cards.router, prefix="/api/cards", tags=["Cards"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(staff.router, prefix="/api/staff", tags=["Staff"])
app.include_router(anomaly_detection.router, prefix="/api/anomaly-detection", tags=["Anomaly Detection"])
app.include_router(emergency_alerts.router, prefix="/api/emergency-alerts", tags=["Emergency Alerts"])
app.include_router(video_processing.router, tags=["Video Processing"])
app.include_router(trips.router, tags=["Trips"])
app.include_router(sms.router, tags=["SMS"])

@app.get("/")
@limiter.limit("100/minute")
async def root(request: Request):
    return {
        "message": "CommutAI Backend API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
@limiter.limit("100/minute")
async def health_check(request: Request):
    return {
        "status": "healthy",
        "service": "commutai-backend"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
