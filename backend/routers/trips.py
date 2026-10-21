"""
Trips Router - Role-based trip management
Only drivers can create trips, system admins can only read trip data
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from pydantic import BaseModel
from auth import verify_supabase_token, require_driver, require_admin
from database import supabase

router = APIRouter()

class TripCreate(BaseModel):
    bus_id: str
    conductor_id: str
    driver_id: str
    route: str
    status: str = "in_progress"

class TripUpdate(BaseModel):
    status: Optional[str] = None
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None

@router.post("/api/trips")
async def create_trip(
    trip: TripCreate,
    user = Depends(require_driver)
):
    """
    Create a new trip. Only drivers can create trips.
    """
    try:
        trip_data = {
            "bus_id": trip.bus_id,
            "conductor_id": trip.conductor_id,
            "driver_id": trip.driver_id,
            "route": trip.route,
            "status": trip.status,
            "started_at": supabase.auth.get_current_user().created_at if supabase.auth.get_current_user() else None
        }

        response = supabase.table('trips').insert(trip_data).execute()

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create trip"
            )

        return {"message": "Trip created successfully", "trip": response.data[0]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating trip: {str(e)}"
        )

@router.get("/api/trips")
async def get_trips(
    user = Depends(verify_supabase_token)
):
    """
    Get all trips. All authenticated users can read trip data.
    """
    try:
        response = supabase.table('trips').select('*, buses(*), conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*)').order('started_at', {'ascending': False}).execute()
        return {"trips": response.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching trips: {str(e)}"
        )

@router.get("/api/trips/{trip_id}")
async def get_trip(
    trip_id: str,
    user = Depends(verify_supabase_token)
):
    """
    Get a specific trip by ID. All authenticated users can read trip data.
    """
    try:
        response = supabase.table('trips').select('*, buses(*), conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*)').eq('id', trip_id).single().execute()
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Trip not found"
            )
        return {"trip": response.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching trip: {str(e)}"
        )

@router.patch("/api/trips/{trip_id}")
async def update_trip(
    trip_id: str,
    trip_update: TripUpdate,
    user = Depends(verify_supabase_token)
):
    """
    Update trip status or location. Available to all authenticated users.
    (You may want to restrict this further based on your requirements)
    """
    try:
        update_data = {}
        if trip_update.status:
            update_data['status'] = trip_update.status
        if trip_update.current_lat is not None:
            update_data['current_lat'] = trip_update.current_lat
        if trip_update.current_lng is not None:
            update_data['current_lng'] = trip_update.current_lng

        if trip_update.status in ['completed', 'cancelled']:
            update_data['ended_at'] = supabase.auth.get_current_user().created_at if supabase.auth.get_current_user() else None

        response = supabase.table('trips').update(update_data).eq('id', trip_id).execute()

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Trip not found"
            )

        return {"message": "Trip updated successfully", "trip": response.data[0]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating trip: {str(e)}"
        )

@router.delete("/api/trips/{trip_id}")
async def delete_trip(
    trip_id: str,
    user = Depends(require_admin)
):
    """
    Delete a trip. Only admins can delete trips.
    """
    try:
        response = supabase.table('trips').delete().eq('id', trip_id).execute()

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Trip not found"
            )

        return {"message": "Trip deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting trip: {str(e)}"
        )
