"""
FastAPI Backend Service for CommutAI System
Handles complex operations, aggregations, and business logic
"""

from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional
import os
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

from routers import cards, transactions, analytics, reports, webhooks, staff, anomaly_detection, emergency_alerts, video_processing
from database import supabase
from auth import verify_supabase_token, require_admin
from video_processor import video_processor

# Rate limiting
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    print("Starting FastAPI backend service...")
    # Initialize video processor model
    print("Initializing video processor...")
    video_processor.initialize_model()
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

# Authentication dependency
async def verify_supabase_token(request: Request):
    """Verify Supabase JWT token from Authorization header"""
    auth_header = request.headers.get("Authorization")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header"
        )
    
    token = auth_header.split(" ")[1]
    
    try:
        # Verify token with Supabase
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        return user_response.user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}"
        )

# Role-based authorization
async def require_admin(user = Depends(verify_supabase_token)):
    """Require admin role"""
    # Fetch user role from staff_users
    staff_response = supabase.table('staff_users').select('role').eq('id', user.id).single().execute()
    
    if not staff_response.data or staff_response.data.get('role') != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    
    return user

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
