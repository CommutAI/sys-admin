#!/usr/bin/env python3
"""
HTTP API Server for SMS Service
Provides REST API endpoints for SMS operations
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv
from sms_service import SMSService

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="SMS Service API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize SMS service
sms_service = SMSService()


# Request Models
class CardApprovalRequest(BaseModel):
    phone_number: str
    card_id: str
    card_holder: str
    status: str  # 'approved' or 'declined'
    reason: Optional[str] = None


class ReservationConfirmationRequest(BaseModel):
    phone_number: str
    reservation_id: str
    passenger_name: str
    route: str
    schedule: str
    seats: int
    total_fare: float


class TripCompletionRequest(BaseModel):
    phone_number: str
    passenger_name: str
    bus_number: str
    route: str
    fare: float
    alighting_stop: str
    distance: Optional[float] = None


class TopUpRequest(BaseModel):
    phone_number: str
    card_id: str
    card_holder: str
    amount: float
    new_balance: float
    transaction_id: Optional[str] = None


class EmergencyAlertRequest(BaseModel):
    message: str
    location: Optional[dict] = None
    bus_number: Optional[str] = None
    driver_name: Optional[str] = None


# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "SMS API Server"}


# Get SMS service status
@app.get("/status")
async def get_status():
    try:
        status = sms_service.check_status()
        return {"status": "success", "data": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Refresh contacts from database
@app.post("/refresh-contacts")
async def refresh_contacts():
    try:
        sms_service.refresh_contacts()
        return {
            "status": "success",
            "message": "Contacts refreshed",
            "emergency_contacts_count": len(sms_service.emergency_contacts),
            "admin_contacts_count": len(sms_service.admin_contacts)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Card approval/decline
@app.post("/card-approval")
async def card_approval(request: CardApprovalRequest):
    try:
        result = sms_service.send_card_approval_notification(
            phone_number=request.phone_number,
            card_id=request.card_id,
            card_holder=request.card_holder,
            status=request.status,
            reason=request.reason
        )
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Reservation confirmation
@app.post("/reservation-confirmation")
async def reservation_confirmation(request: ReservationConfirmationRequest):
    try:
        result = sms_service.send_reservation_confirmation(
            phone_number=request.phone_number,
            reservation_id=request.reservation_id,
            passenger_name=request.passenger_name,
            route=request.route,
            schedule=request.schedule,
            seats=request.seats,
            total_fare=request.total_fare
        )
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Trip completion
@app.post("/trip-completion")
async def trip_completion(request: TripCompletionRequest):
    try:
        result = sms_service.send_trip_completion_confirmation(
            phone_number=request.phone_number,
            passenger_name=request.passenger_name,
            bus_number=request.bus_number,
            route=request.route,
            fare=request.fare,
            alighting_stop=request.alighting_stop,
            distance=request.distance
        )
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Top-up confirmation
@app.post("/topup")
async def topup(request: TopUpRequest):
    try:
        result = sms_service.send_topup_confirmation(
            phone_number=request.phone_number,
            card_id=request.card_id,
            card_holder=request.card_holder,
            amount=request.amount,
            new_balance=request.new_balance,
            transaction_id=request.transaction_id
        )
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Emergency alert
@app.post("/emergency")
async def emergency_alert(request: EmergencyAlertRequest):
    try:
        result = sms_service.send_emergency_alert_from_bus(
            message=request.message,
            location=request.location,
            bus_number=request.bus_number,
            driver_name=request.driver_name
        )
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('SMS_API_PORT', 8001))
    print(f"Starting SMS API Server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
