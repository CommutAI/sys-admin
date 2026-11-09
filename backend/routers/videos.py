"""
Video Recording Router
API endpoints for managing trip video recordings
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel
import os
from datetime import datetime
from supabase import create_client, Client

router = APIRouter()

# Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)


class VideoRecordCreate(BaseModel):
    trip_id: str
    storage_type: str = "local"
    file_path: Optional[str] = None
    status: str = "recording"
    start_time: Optional[str] = None


class VideoRecordUpdate(BaseModel):
    trip_id: str
    file_size: Optional[int] = None
    duration_seconds: Optional[int] = None
    frame_count: Optional[int] = None
    status: Optional[str] = None
    upload_progress: Optional[int] = None
    storage_url: Optional[str] = None
    error_message: Optional[str] = None


@router.post("/api/videos/create")
async def create_video_record(record: VideoRecordCreate):
    """Create a new video record for a trip"""
    try:
        video_data = {
            "trip_id": record.trip_id,
            "storage_type": record.storage_type,
            "file_path": record.file_path,
            "status": record.status,
            "start_time": record.start_time or datetime.now().isoformat(),
        }

        response = supabase.table("trip_videos").insert(video_data).execute()

        if response.data:
            return {"status": "success", "video_id": response.data[0]["id"]}
        else:
            raise HTTPException(status_code=500, detail="Failed to create video record")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/api/videos/update")
async def update_video_record(update: VideoRecordUpdate):
    """Update a video record"""
    try:
        update_data = {k: v for k, v in update.dict().items() if v is not None and k != "trip_id"}

        response = (
            supabase.table("trip_videos")
            .update(update_data)
            .eq("trip_id", update.trip_id)
            .execute()
        )

        if response.data:
            return {"status": "success", "updated": len(response.data)}
        else:
            raise HTTPException(status_code=404, detail="Video record not found")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/videos/trip/{trip_id}")
async def get_trip_video(trip_id: str):
    """Get video record for a specific trip"""
    try:
        response = (
            supabase.table("trip_videos")
            .select("*")
            .eq("trip_id", trip_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if response.data:
            return {"status": "success", "video": response.data[0]}
        else:
            return {"status": "success", "video": None}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/videos")
async def list_videos(
    status: Optional[str] = None,
    trip_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List video records with optional filters"""
    try:
        query = supabase.table("trip_videos").select("*")

        if status:
            query = query.eq("status", status)
        if trip_id:
            query = query.eq("trip_id", trip_id)

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)

        response = query.execute()

        return {
            "status": "success",
            "videos": response.data,
            "count": len(response.data),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/videos/{video_id}")
async def delete_video(video_id: str):
    """Delete a video record"""
    try:
        response = (
            supabase.table("trip_videos")
            .delete()
            .eq("id", video_id)
            .execute()
        )

        if response.data:
            return {"status": "success", "deleted": len(response.data)}
        else:
            raise HTTPException(status_code=404, detail="Video record not found")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
