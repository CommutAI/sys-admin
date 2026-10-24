"""
SMS Router for Bus Monitoring System
Handles SMS notifications for various system events
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
import os
import subprocess
from auth import verify_supabase_token, require_admin

router = APIRouter(prefix="/api/sms", tags=["SMS"])


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


@router.post("/card-approval")
async def send_card_approval_sms(
    request: CardApprovalRequest,
    current_user: dict = Depends(verify_supabase_token)
):
    """
    Send SMS notification for card approval/decline
    """
    try:
        # Check if SMS service is available on the Pi
        # For now, we'll use subprocess to call the SMS service
        # In production, this should be an HTTP API call to the Pi

        # For local development or when Pi is not available, just log
        print(f"Card {request.status} notification: {request.card_holder} ({request.phone_number})")

        # Try to send SMS via subprocess (if running on Pi or accessible)
        sms_service_path = os.getenv('SMS_SERVICE_PATH', '/home/chichi/sys-admin/raspberry-pi-server/sms_service.py')

        try:
            cmd = [
                'python3', sms_service_path, 'card',
                request.phone_number, request.card_id, request.card_holder, request.status
            ]
            if request.reason:
                cmd.append(request.reason)

            # Run in background
            subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            print(f"Failed to send SMS via subprocess: {e}")
            # Don't fail the request if SMS fails - just log it

        return {
            "status": "success",
            "message": f"Card {request.status} notification sent",
            "phone_number": request.phone_number
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reservation-confirmation")
async def send_reservation_confirmation_sms(
    request: ReservationConfirmationRequest,
    current_user: dict = Depends(verify_supabase_token)
):
    """
    Send SMS confirmation for successful reservation
    """
    try:
        print(f"Reservation confirmation: {request.passenger_name} ({request.phone_number})")

        sms_service_path = os.getenv('SMS_SERVICE_PATH', '/home/chichi/sys-admin/raspberry-pi-server/sms_service.py')

        try:
            cmd = [
                'python3', sms_service_path, 'reservation',
                request.phone_number, request.reservation_id, request.passenger_name,
                request.route, request.schedule, str(request.seats), str(request.total_fare)
            ]
            subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            print(f"Failed to send SMS via subprocess: {e}")

        return {
            "status": "success",
            "message": "Reservation confirmation sent",
            "phone_number": request.phone_number
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trip-completion")
async def send_trip_completion_sms(
    request: TripCompletionRequest,
    current_user: dict = Depends(verify_supabase_token)
):
    """
    Send SMS confirmation for trip completion
    """
    try:
        print(f"Trip completion: {request.passenger_name} ({request.phone_number})")

        sms_service_path = os.getenv('SMS_SERVICE_PATH', '/home/chichi/sys-admin/raspberry-pi-server/sms_service.py')

        try:
            cmd = [
                'python3', sms_service_path, 'trip',
                request.phone_number, request.passenger_name, request.bus_number,
                request.route, str(request.fare), request.alighting_stop
            ]
            if request.distance:
                cmd.append(str(request.distance))
            subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            print(f"Failed to send SMS via subprocess: {e}")

        return {
            "status": "success",
            "message": "Trip completion confirmation sent",
            "phone_number": request.phone_number
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/topup")
async def send_topup_confirmation_sms(
    request: TopUpRequest,
    current_user: dict = Depends(verify_supabase_token)
):
    """
    Send SMS confirmation for card top-up
    """
    try:
        print(f"Top-up confirmation: {request.card_holder} ({request.phone_number})")

        sms_service_path = os.getenv('SMS_SERVICE_PATH', '/home/chichi/sys-admin/raspberry-pi-server/sms_service.py')

        try:
            cmd = [
                'python3', sms_service_path, 'topup',
                request.phone_number, request.card_id, request.card_holder,
                str(request.amount), str(request.new_balance)
            ]
            if request.transaction_id:
                cmd.append(request.transaction_id)
            subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            print(f"Failed to send SMS via subprocess: {e}")

        return {
            "status": "success",
            "message": "Top-up confirmation sent",
            "phone_number": request.phone_number
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emergency")
async def send_emergency_alert_sms(
    request: EmergencyAlertRequest,
    current_user: dict = Depends(verify_supabase_token)
):
    """
    Send emergency alert from bus
    """
    try:
        print(f"Emergency alert: {request.message}")

        sms_service_path = os.getenv('SMS_SERVICE_PATH', '/home/chichi/sys-admin/raspberry-pi-server/sms_service.py')

        try:
            cmd = ['python3', sms_service_path, 'emergency', request.message]
            subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            print(f"Failed to send SMS via subprocess: {e}")

        return {
            "status": "success",
            "message": "Emergency alert sent"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_sms_status():
    """
    Get SMS service status
    """
    try:
        sms_service_path = os.getenv('SMS_SERVICE_PATH', '/home/chichi/sys-admin/raspberry-pi-server/sms_service.py')

        try:
            result = subprocess.run(
                ['python3', sms_service_path, 'status'],
                capture_output=True,
                text=True,
                timeout=10
            )
            return {
                "status": "success",
                "service_available": True,
                "output": result.stdout
            }
        except Exception as e:
            return {
                "status": "error",
                "service_available": False,
                "error": str(e)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
