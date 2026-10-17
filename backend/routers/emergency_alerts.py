"""
Emergency alerts endpoints - requires authentication
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from datetime import datetime
from database import supabase
from auth import verify_supabase_token

router = APIRouter()


class AcknowledgeAlertRequest(BaseModel):
    """Request to acknowledge an emergency alert"""
    pass


class ResolveAlertRequest(BaseModel):
    """Request to resolve an emergency alert"""
    notes: str = ""


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    request: AcknowledgeAlertRequest,
    user = Depends(verify_supabase_token)
):
    """
    Acknowledge an emergency alert
    Requires authenticated user
    """
    try:
        result = supabase.table('emergency_alerts').update({
            'status': 'acknowledged',
            'acknowledged_at': datetime.utcnow().isoformat()
        }).eq('id', alert_id).execute()
        
        if not result[1]:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        return {"status": "success", "message": "Alert acknowledged"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    request: ResolveAlertRequest,
    user = Depends(verify_supabase_token)
):
    """
    Resolve an emergency alert
    Requires authenticated user
    """
    try:
        result = supabase.table('emergency_alerts').update({
            'status': 'resolved',
            'resolved_at': datetime.utcnow().isoformat(),
            'resolved_by': user.id,
            'resolved': True
        }).eq('id', alert_id).execute()
        
        if not result[1]:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        return {"status": "success", "message": "Alert resolved"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def get_alerts(
    status: Optional[str] = None,
    user = Depends(verify_supabase_token)
):
    """
    Get emergency alerts with optional status filter
    Requires authenticated user
    """
    try:
        query = supabase.table('emergency_alerts').select('*')
        
        if status:
            query = query.eq('status', status)
        
        result = query.order('created_at', desc=True).execute()
        return result[1] if result[1] else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
