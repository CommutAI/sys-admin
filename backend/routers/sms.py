"""
SMS Router for Bus Monitoring System
Handles SMS notifications for various system events
Queues SMS to Supabase for processing by SMS queue processor
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from supabase import create_client
import os

router = APIRouter(prefix="/api/sms", tags=["SMS"])

# Supabase client
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


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
    Queue SMS notification for card approval/decline
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured")

        # Log the request
        print(f"Card {request.status} notification: {request.card_holder} ({request.phone_number})")

        # Build message
        if request.status.lower() == 'approved':
            message = f"CARD APPROVED. Card ID: {request.card_id}. Holder: {request.card_holder}. Your QR card reservation has been approved. Please claim your card at the pickup terminal within 7 days."
        else:
            message = f"CARD DECLINED. Card ID: {request.card_id}. Holder: {request.card_holder}."
            if request.reason:
                message += f" Reason: {request.reason}."
            message += " Please contact customer service for assistance."

        # Remove newlines
        message = message.replace('\n', ' ')

        # Queue SMS to database
        sms_type = f'card_{request.status.lower()}'
        data = {
            'phone_number': request.phone_number,
            'message': message,
            'type': sms_type,
            'priority': 5,  # Normal priority
            'status': 'pending',
            'retry_count': 0,
            'max_retries': 3,
            'created_at': datetime.now().isoformat()
        }

        response = supabase.table('sms_queue').insert(data).execute()

        if response.data:
            return {
                "status": "success",
                "message": f"Card {request.status} notification queued",
                "phone_number": request.phone_number,
                "sms_id": response.data[0]['id'],
                "sms_sent": True
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to queue SMS")

    except Exception as e:
        print(f"Error queuing SMS: {e}")
        # Don't fail the request - just log and return success
        return {
            "status": "success",
            "message": f"Card {request.status} notification queued (database error)",
            "phone_number": request.phone_number,
            "sms_sent": False
        }


@router.post("/reservation-confirmation")
async def send_reservation_confirmation_sms(request: ReservationConfirmationRequest):
    """
    Queue SMS confirmation for successful reservation
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured")

        print(f"Reservation confirmation: {request.passenger_name} ({request.phone_number})")

        # Build message
        message = f"RESERVATION CONFIRMED. ID: {request.reservation_id}. Passenger: {request.passenger_name}. Route: {request.route}. Schedule: {request.schedule}. Seats: {request.seats}. Total Fare: ₱{request.total_fare:.2f}"

        # Queue SMS to database
        data = {
            'phone_number': request.phone_number,
            'message': message,
            'type': 'reservation_confirmation',
            'priority': 5,  # Normal priority
            'status': 'pending',
            'retry_count': 0,
            'max_retries': 3,
            'created_at': datetime.now().isoformat()
        }

        response = supabase.table('sms_queue').insert(data).execute()

        if response.data:
            return {
                "status": "success",
                "message": "Reservation confirmation queued",
                "phone_number": request.phone_number,
                "sms_id": response.data[0]['id'],
                "sms_sent": True
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to queue SMS")

    except Exception as e:
        print(f"Error queuing SMS: {e}")
        return {
            "status": "success",
            "message": "Reservation confirmation queued (database error)",
            "phone_number": request.phone_number,
            "sms_sent": False
        }


@router.post("/trip-completion")
async def send_trip_completion_sms(request: TripCompletionRequest):
    """
    Queue SMS confirmation for trip completion
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured")

        print(f"Trip completion: {request.passenger_name} ({request.phone_number})")

        # Build message
        message = f"TRIP COMPLETED. Passenger: {request.passenger_name}. Bus: {request.bus_number}. Route: {request.route}. Alighting: {request.alighting_stop}. Fare: ₱{request.fare:.2f}."
        if request.distance:
            message += f" Distance: {request.distance:.1f} km."
        message += " Thank you for riding with us!"

        # Queue SMS to database
        data = {
            'phone_number': request.phone_number,
            'message': message,
            'type': 'trip_completion',
            'priority': 5,  # Normal priority
            'status': 'pending',
            'retry_count': 0,
            'max_retries': 3,
            'created_at': datetime.now().isoformat()
        }

        response = supabase.table('sms_queue').insert(data).execute()

        if response.data:
            return {
                "status": "success",
                "message": "Trip completion confirmation queued",
                "phone_number": request.phone_number,
                "sms_id": response.data[0]['id'],
                "sms_sent": True
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to queue SMS")

    except Exception as e:
        print(f"Error queuing SMS: {e}")
        return {
            "status": "success",
            "message": "Trip completion confirmation queued (database error)",
            "phone_number": request.phone_number,
            "sms_sent": False
        }


@router.post("/topup")
async def send_topup_confirmation_sms(request: TopUpRequest):
    """
    Queue SMS confirmation for card top-up
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured")

        print(f"Top-up confirmation: {request.card_holder} ({request.phone_number})")

        # Build message
        message = f"TOP-UP SUCCESSFUL. Card ID: {request.card_id}. Holder: {request.card_holder}. Amount: ₱{request.amount:.2f}. New Balance: ₱{request.new_balance:.2f}."
        if request.transaction_id:
            message += f" Ref: {request.transaction_id}."
        message += " Thank you for reloading!"

        # Queue SMS to database
        data = {
            'phone_number': request.phone_number,
            'message': message,
            'type': 'topup',
            'priority': 5,  # Normal priority
            'status': 'pending',
            'retry_count': 0,
            'max_retries': 3,
            'created_at': datetime.now().isoformat()
        }

        response = supabase.table('sms_queue').insert(data).execute()

        if response.data:
            return {
                "status": "success",
                "message": "Top-up confirmation queued",
                "phone_number": request.phone_number,
                "sms_id": response.data[0]['id'],
                "sms_sent": True
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to queue SMS")

    except Exception as e:
        print(f"Error queuing SMS: {e}")
        return {
            "status": "success",
            "message": "Top-up confirmation queued (database error)",
            "phone_number": request.phone_number,
            "sms_sent": False
        }


@router.post("/emergency")
async def send_emergency_alert_sms(request: EmergencyAlertRequest):
    """
    Queue emergency alert from bus to all emergency contacts (priority 1 - highest)
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured")

        print(f"Emergency alert: {request.message}")

        # Build message
        message = f"🚨 {request.message}."
        if request.bus_number:
            message += f" Bus: {request.bus_number}."
        if request.driver_name:
            message += f" Driver: {request.driver_name}."
        if request.location:
            message += f" Location: {request.location.get('lat', 'N/A')}, {request.location.get('lng', 'N/A')}"

        # Fetch emergency contacts
        contacts_response = supabase.table('emergency_contacts').select('phone').eq('is_active', True).execute()
        contacts = contacts_response.data if contacts_response.data else []

        if not contacts:
            print("No emergency contacts found")
            return {
                "status": "success",
                "message": "Emergency alert queued (no contacts)",
                "sms_sent": False
            }

        # Queue SMS for each contact
        queued_count = 0
        for contact in contacts:
            phone = contact.get('phone')
            if phone:
                data = {
                    'phone_number': phone,
                    'message': message,
                    'type': 'emergency_bus',
                    'priority': 1,  # Highest priority
                    'status': 'pending',
                    'retry_count': 0,
                    'max_retries': 3,
                    'created_at': datetime.now().isoformat()
                }

                response = supabase.table('sms_queue').insert(data).execute()
                if response.data:
                    queued_count += 1

        return {
            "status": "success",
            "message": f"Emergency alert queued to {queued_count} contacts",
            "queued_count": queued_count,
            "sms_sent": True
        }

    except Exception as e:
        print(f"Error queuing SMS: {e}")
        return {
            "status": "success",
            "message": "Emergency alert queued (database error)",
            "sms_sent": False
        }


@router.get("/status")
async def get_sms_status():
    """
    Get SMS queue status
    """
    try:
        if not supabase:
            return {
                "status": "error",
                "service_available": False,
                "error": "Supabase not configured"
            }

        # Get pending SMS count
        pending_response = supabase.table('sms_queue').select('id', count='exact').eq('status', 'pending').execute()
        pending_count = pending_response.count if hasattr(pending_response, 'count') else 0

        # Get failed SMS count
        failed_response = supabase.table('sms_queue').select('id', count='exact').eq('status', 'failed').execute()
        failed_count = failed_response.count if hasattr(failed_response, 'count') else 0

        # Get sent SMS count (last 24 hours)
        from datetime import timedelta
        cutoff = datetime.now() - timedelta(hours=24)
        sent_response = supabase.table('sms_queue').select('id', count='exact').eq('status', 'sent').gte('created_at', cutoff.isoformat()).execute()
        sent_count = sent_response.count if hasattr(sent_response, 'count') else 0

        return {
            "status": "success",
            "service_available": True,
            "mode": "queue-based",
            "pending_sms": pending_count,
            "failed_sms": failed_count,
            "sent_last_24h": sent_count
        }

    except Exception as e:
        return {
            "status": "error",
            "service_available": False,
            "error": str(e)
        }
