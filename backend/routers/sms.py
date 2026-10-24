"""
SMS Router for Bus Monitoring System
Handles SMS notifications for various system events
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel
import os
import httpx
from pi_discovery import get_sms_api_url_sync

router = APIRouter(prefix="/api/sms", tags=["SMS"])

# SMS Service API URL (Raspberry Pi)
# Auto-discovered if not set in environment
SMS_API_URL = os.getenv('SMS_API_URL')


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
async def send_card_approval_sms(request: CardApprovalRequest):
    """
    Send SMS notification for card approval/decline
    """
    try:
        # Log the request
        print(f"Card {request.status} notification: {request.card_holder} ({request.phone_number})")

        # Auto-discover SMS API URL
        sms_api_url = get_sms_api_url_sync()
        print(f"Using SMS API URL: {sms_api_url}")

        # Send HTTP request to SMS service on Raspberry Pi
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{sms_api_url}/card-approval",
                json={
                    "phone_number": request.phone_number,
                    "card_id": request.card_id,
                    "card_holder": request.card_holder,
                    "status": request.status,
                    "reason": request.reason
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                print(f"SMS service returned error: {response.status_code} - {response.text}")
                # Don't fail the request - just log and return success
                return {
                    "status": "success",
                    "message": f"Card {request.status} notification sent (SMS service unavailable)",
                    "phone_number": request.phone_number,
                    "sms_sent": False
                }

    except httpx.RequestError as e:
        print(f"Failed to connect to SMS service: {e}")
        # Don't fail the request - just log and return success
        return {
            "status": "success",
            "message": f"Card {request.status} notification sent (SMS service unavailable)",
            "phone_number": request.phone_number,
            "sms_sent": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reservation-confirmation")
async def send_reservation_confirmation_sms(request: ReservationConfirmationRequest):
    """
    Send SMS confirmation for successful reservation
    """
    try:
        print(f"Reservation confirmation: {request.passenger_name} ({request.phone_number})")

        sms_api_url = get_sms_api_url_sync()
        print(f"Using SMS API URL: {sms_api_url}")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{sms_api_url}/reservation-confirmation",
                json={
                    "phone_number": request.phone_number,
                    "reservation_id": request.reservation_id,
                    "passenger_name": request.passenger_name,
                    "route": request.route,
                    "schedule": request.schedule,
                    "seats": request.seats,
                    "total_fare": request.total_fare
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                print(f"SMS service returned error: {response.status_code}")
                return {
                    "status": "success",
                    "message": "Reservation confirmation sent (SMS service unavailable)",
                    "sms_sent": False
                }

    except httpx.RequestError as e:
        print(f"Failed to connect to SMS service: {e}")
        return {
            "status": "success",
            "message": "Reservation confirmation sent (SMS service unavailable)",
            "sms_sent": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trip-completion")
async def send_trip_completion_sms(request: TripCompletionRequest):
    """
    Send SMS confirmation for trip completion
    """
    try:
        print(f"Trip completion: {request.passenger_name} ({request.phone_number})")

        sms_api_url = get_sms_api_url_sync()
        print(f"Using SMS API URL: {sms_api_url}")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{sms_api_url}/trip-completion",
                json={
                    "phone_number": request.phone_number,
                    "passenger_name": request.passenger_name,
                    "bus_number": request.bus_number,
                    "route": request.route,
                    "fare": request.fare,
                    "alighting_stop": request.alighting_stop,
                    "distance": request.distance
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                print(f"SMS service returned error: {response.status_code}")
                return {
                    "status": "success",
                    "message": "Trip completion confirmation sent (SMS service unavailable)",
                    "sms_sent": False
                }

    except httpx.RequestError as e:
        print(f"Failed to connect to SMS service: {e}")
        return {
            "status": "success",
            "message": "Trip completion confirmation sent (SMS service unavailable)",
            "sms_sent": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/topup")
async def send_topup_confirmation_sms(request: TopUpRequest):
    """
    Send SMS confirmation for card top-up
    """
    try:
        print(f"Top-up confirmation: {request.card_holder} ({request.phone_number})")

        sms_api_url = get_sms_api_url_sync()
        print(f"Using SMS API URL: {sms_api_url}")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{sms_api_url}/topup",
                json={
                    "phone_number": request.phone_number,
                    "card_id": request.card_id,
                    "card_holder": request.card_holder,
                    "amount": request.amount,
                    "new_balance": request.new_balance,
                    "transaction_id": request.transaction_id
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                print(f"SMS service returned error: {response.status_code}")
                return {
                    "status": "success",
                    "message": "Top-up confirmation sent (SMS service unavailable)",
                    "sms_sent": False
                }

    except httpx.RequestError as e:
        print(f"Failed to connect to SMS service: {e}")
        return {
            "status": "success",
            "message": "Top-up confirmation sent (SMS service unavailable)",
            "sms_sent": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emergency")
async def send_emergency_alert_sms(request: EmergencyAlertRequest):
    """
    Send emergency alert from bus
    """
    try:
        print(f"Emergency alert: {request.message}")

        sms_api_url = get_sms_api_url_sync()
        print(f"Using SMS API URL: {sms_api_url}")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{sms_api_url}/emergency",
                json={
                    "message": request.message,
                    "location": request.location,
                    "bus_number": request.bus_number,
                    "driver_name": request.driver_name
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                print(f"SMS service returned error: {response.status_code}")
                return {
                    "status": "success",
                    "message": "Emergency alert sent (SMS service unavailable)",
                    "sms_sent": False
                }

    except httpx.RequestError as e:
        print(f"Failed to connect to SMS service: {e}")
        return {
            "status": "success",
            "message": "Emergency alert sent (SMS service unavailable)",
            "sms_sent": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_sms_status():
    """
    Get SMS service status
    """
    try:
        sms_api_url = get_sms_api_url_sync()
        print(f"Checking SMS API status at: {sms_api_url}")

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{sms_api_url}/status")

            if response.status_code == 200:
                return response.json()
            else:
                return {
                    "status": "error",
                    "service_available": False,
                    "error": f"SMS service returned {response.status_code}"
                }

    except httpx.RequestError as e:
        return {
            "status": "error",
            "service_available": False,
            "error": str(e)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
