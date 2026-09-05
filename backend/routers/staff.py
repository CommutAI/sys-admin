"""
Staff management endpoints - conductor assignment and staff operations
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from database import supabase

router = APIRouter()


class StaffUser(BaseModel):
    """Staff user model"""
    id: str
    full_name: str
    email: str
    role: str
    is_active: bool
    bus_id: Optional[str] = None
    created_at: datetime


class ConductorAssignment(BaseModel):
    """Conductor assignment model"""
    staff_id: str
    bus_id: str


@router.get("/conductors", response_model=List[StaffUser])
async def get_conductors():
    """
    Get all active conductors
    """
    try:
        result = supabase.table('staff_users').select('*').eq('role', 'conductor').eq('is_active', True).execute()
        data = result[1] if result[1] else []
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conductors/available", response_model=List[StaffUser])
async def get_available_conductors():
    """
    Get conductors who are not currently assigned to a bus
    """
    try:
        result = supabase.table('staff_users').select('*').eq('role', 'conductor').eq('is_active', True).is_('bus_id', 'null').execute()
        data = result[1] if result[1] else []
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/conductors/assign")
async def assign_conductor(assignment: ConductorAssignment):
    """
    Assign a conductor to a bus
    First removes any existing bus assignment from the conductor
    """
    try:
        # First, remove conductor from any existing bus
        supabase.table('staff_users').update({'bus_id': None}).eq('id', assignment.staff_id).execute()
        
        # Assign conductor to the new bus
        result = supabase.table('staff_users').update({'bus_id': assignment.bus_id}).eq('id', assignment.staff_id).execute()
        data = result[1] if result[1] else []
        
        if not data:
            raise HTTPException(status_code=404, detail="Conductor not found")
        
        return {"message": "Conductor assigned successfully", "conductor": data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/conductors/unassign/{staff_id}")
async def unassign_conductor(staff_id: str):
    """
    Remove a conductor from their assigned bus
    """
    try:
        result = supabase.table('staff_users').update({'bus_id': None}).eq('id', staff_id).execute()
        data = result[1] if result[1] else []
        
        if not data:
            raise HTTPException(status_code=404, detail="Conductor not found")
        
        return {"message": "Conductor unassigned successfully", "conductor": data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/buses/{bus_id}/conductor", response_model=Optional[StaffUser])
async def get_bus_conductor(bus_id: str):
    """
    Get the conductor assigned to a specific bus
    """
    try:
        result = supabase.table('staff_users').select('*').eq('bus_id', bus_id).eq('role', 'conductor').execute()
        data = result[1] if result[1] else []
        
        if not data:
            return None
        
        return data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/staff", response_model=List[StaffUser])
async def get_all_staff(role: Optional[str] = None, is_active: Optional[bool] = None):
    """
    Get all staff members with optional filtering
    """
    try:
        query = supabase.table('staff_users').select('*')
        
        if role:
            query = query.eq('role', role)
        if is_active is not None:
            query = query.eq('is_active', is_active)
        
        result = query.execute()
        data = result[1] if result[1] else []
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class StaffUserCreate(BaseModel):
    """Staff user creation model"""
    full_name: str
    email: str
    role: str
    password: str


class StaffUserUpdate(BaseModel):
    """Staff user update model"""
    full_name: str
    email: str
    role: str
    is_active: bool


@router.post("/staff")
async def create_staff_user(user: StaffUserCreate):
    """
    Create a new staff user (requires admin privileges)
    """
    try:
        # Create auth user first
        auth_result = supabase.auth.sign_up({
            "email": user.email,
            "password": user.password,
            "options": {
                "data": {
                    "full_name": user.full_name,
                    "role": user.role
                }
            }
        })
        
        if auth_result[1] is None:
            raise HTTPException(status_code=400, detail="Failed to create auth user")
        
        return {"message": "Staff user created successfully", "user": auth_result[1]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/staff/{staff_id}")
async def update_staff_user(staff_id: str, user: StaffUserUpdate):
    """
    Update an existing staff user
    """
    try:
        result = supabase.table('staff_users').update({
            'full_name': user.full_name,
            'email': user.email,
            'role': user.role,
            'is_active': user.is_active
        }).eq('id', staff_id).execute()
        
        data = result[1] if result[1] else []
        
        if not data:
            raise HTTPException(status_code=404, detail="Staff user not found")
        
        return {"message": "Staff user updated successfully", "user": data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/staff/{staff_id}")
async def delete_staff_user(staff_id: str):
    """
    Delete a staff user (requires admin privileges)
    """
    try:
        # Delete from staff_users table
        result = supabase.table('staff_users').delete().eq('id', staff_id).execute()
        
        data = result[1] if result[1] else []
        
        if not data:
            raise HTTPException(status_code=404, detail="Staff user not found")
        
        # Note: Auth user deletion requires admin privileges and should be handled separately
        # via Supabase auth admin API
        
        return {"message": "Staff user deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/staff/{staff_id}", response_model=StaffUser)
async def get_staff_user(staff_id: str):
    """
    Get a specific staff user by ID
    """
    try:
        result = supabase.table('staff_users').select('*').eq('id', staff_id).execute()
        data = result[1] if result[1] else []
        
        if not data:
            raise HTTPException(status_code=404, detail="Staff user not found")
        
        return data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
