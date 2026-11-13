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
from datetime import datetime, timedelta
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

from routers import cards, transactions, analytics, reports, webhooks, staff, anomaly_detection, emergency_alerts, video_processing, trips, sms, videos
from database import supabase
from auth import verify_supabase_token, require_admin, require_driver
from video_processor import video_processor

# Import Roboflow client for token monitoring
try:
    from roboflow_client import roboflow_client
    ROBOFLOW_AVAILABLE = True
except ImportError:
    ROBOFLOW_AVAILABLE = False
    print("Warning: roboflow_client not available")

# Rate limiting
limiter = Limiter(key_func=get_remote_address)

# Background task for anomaly detection
_scheduler_task: asyncio.Task = None

async def anomaly_detection_scheduler():
    """Run anomaly detection every 5 minutes"""
    while True:
        try:
            await asyncio.sleep(300)  # sleep FIRST so startup isn't blocked
            print("Running scheduled anomaly detection...")
            from routers.anomaly_detection import run_anomaly_detection
            result = await run_anomaly_detection()
            print(f"Anomaly detection: {result.total_anomalies_detected} anomalies, {result.total_irregularities_created} irregularities")

            # Store snapshot — limit results_summary to avoid huge JSON blobs
            snapshot_data = {
                'checked_at': datetime.utcnow().isoformat(),
                'total_trips_checked': result.total_trips_checked,
                'anomalies_detected': result.total_anomalies_detected,
                'irregularities_created': result.total_irregularities_created,
                'results_summary': [
                    {
                        'trip_id': r.trip_id,
                        'bus_plate': r.bus_plate,
                        'ai_count': r.ai_count,
                        'boarded_count': r.boarded_count,
                        'discrepancy': r.discrepancy,
                        'anomaly_detected': r.total_anomalies > 0
                    }
                    for r in result.results[:20]  # cap at 20 to avoid huge blobs
                ]
            }
            try:
                supabase.table('anomaly_detection_snapshots').insert(snapshot_data).execute()
            except Exception as db_error:
                print(f"Anomaly snapshot error: {db_error}")

        except asyncio.CancelledError:
            print("Anomaly detection scheduler cancelled")
            break
        except Exception as e:
            print(f"Anomaly detection scheduler error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    print("Starting FastAPI backend service...")

    # Validate required environment variables
    required_vars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    missing_vars = [v for v in required_vars if not os.getenv(v)]
    if missing_vars:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing_vars)}. Please set them in backend/.env")
    print("✓ Environment variables validated")

    # Initialize video processor model
    print("Initializing video processor...")
    video_processor.initialize_model()

    # Start anomaly detection scheduler — store handle for clean shutdown
    global _scheduler_task
    _scheduler_task = asyncio.create_task(anomaly_detection_scheduler())
    print("Anomaly detection scheduler started (every 5 min)")

    yield

    # Shutdown — cancel scheduler cleanly
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
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
    "http://localhost:5174",
    "http://localhost:3000",
    "http://localhost:8080",
    frontend_url,
    "https://sys-admin-nine.vercel.app",  # Production Vercel deployment
]

# If in development mode, allow all origins
if os.getenv("ENVIRONMENT", "development") == "development":
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
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
app.include_router(videos.router, tags=["Videos"])

@app.api_route("/", methods=["GET", "HEAD"])
@limiter.limit("100/minute")
async def root(request: Request):
    return {
        "message": "CommutAI Backend API",
        "version": "1.0.0",
        "status": "running"
    }

@app.api_route("/health", methods=["GET", "HEAD"])
@limiter.limit("100/minute")
async def health_check(request: Request):
    return {
        "status": "healthy",
        "service": "commutai-backend"
    }

@app.get("/api/roboflow-stats")
@limiter.limit("30/minute")
async def get_roboflow_stats(request: Request):
    """Get Roboflow API usage statistics for token monitoring"""
    if not ROBOFLOW_AVAILABLE:
        raise HTTPException(status_code=503, detail="Roboflow client not available")

    stats = roboflow_client.get_usage_stats()
    return {
        "service": "roboflow-client",
        "stats": stats
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
