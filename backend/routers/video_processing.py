"""
Video Processing Router
WebSocket endpoint to receive raw video frames from Raspberry Pi
Processes frames with YOLOv8 and streams results back
"""

import asyncio
import json
import base64
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from typing import Dict, Set
import cv2
import numpy as np
import os
from dotenv import load_dotenv
from fastapi.responses import JSONResponse

from video_processor import video_processor
from database import supabase

load_dotenv()

router = APIRouter()

# Store active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.pi_connections: Set[WebSocket] = set()
        self.frontend_connections: Set[WebSocket] = set()
        self.latest_frame: str = None  # Store latest processed frame for new clients

    async def connect_pi(self, websocket: WebSocket, client_id: str):
        """Connect a Raspberry Pi client"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.pi_connections.add(websocket)
        print(f"[Video Router] Pi connected: {client_id}")

    async def connect_frontend(self, websocket: WebSocket):
        """Connect a frontend client"""
        await websocket.accept()
        self.frontend_connections.add(websocket)
        print(f"[Video Router] Frontend connected")

        # Send latest frame if available
        if self.latest_frame:
            try:
                await websocket.send_json({
                    'type': 'video_frame',
                    'frame': self.latest_frame,
                    'count': getattr(video_processor, 'last_passenger_count', 0),
                    'trip_id': getattr(video_processor, 'current_trip_id', None)
                })
            except:
                pass

    def disconnect_pi(self, websocket: WebSocket, client_id: str):
        """Disconnect a Raspberry Pi client"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if websocket in self.pi_connections:
            self.pi_connections.remove(websocket)
        print(f"[Video Router] Pi disconnected: {client_id}")

    def disconnect_frontend(self, websocket: WebSocket):
        """Disconnect a frontend client"""
        if websocket in self.frontend_connections:
            self.frontend_connections.remove(websocket)
        print(f"[Video Router] Frontend disconnected")

    async def broadcast_to_frontends(self, message: dict):
        """Broadcast to all frontend clients, removing dead connections"""
        dead = set()
        for connection in self.frontend_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead.add(connection)
        # Remove dead connections to prevent unbounded growth
        self.frontend_connections -= dead
        if dead:
            print(f"[Video Router] Removed {len(dead)} dead frontend connection(s)")

manager = ConnectionManager()


@router.websocket("/ws/video-stream/{client_id}")
async def video_stream_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket endpoint to receive raw video frames from Raspberry Pi
    and return processed detection results
    """
    await manager.connect_pi(websocket, client_id)

    try:
        while True:
            # Receive frame data from Pi
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                # Handle different message types
                if message.get('type') == 'frame':
                    # Process video frame
                    frame_data = message.get('frame')
                    if not frame_data:
                        continue

                    # Extract GPS data if available
                    gps_data = message.get('gps')
                    trip_id = message.get('trip_id')

                    # Set trip ID if provided
                    if trip_id:
                        video_processor.set_current_trip(trip_id)

                    # Save GPS location to database if available (now works without trip_id)
                    if gps_data:
                        video_processor.save_gps_to_db(gps_data, trip_id)

                    # Decode frame
                    frame = video_processor.decode_frame(frame_data)
                    if frame is None:
                        continue

                    # Start recording if not started and trip is active
                    if video_processor.current_trip_id and video_processor.video_writer is None:
                        height, width = frame.shape[:2]
                        video_processor.start_recording(width, height)

                    # Detect passengers (async for Roboflow support)
                    detections = await video_processor.detect_passengers(frame)
                    passenger_count = len(detections)
                    video_processor.last_passenger_count = passenger_count
                    active_trip = trip_id or video_processor.get_or_fetch_active_trip()

                    # Draw detection boxes on frame
                    frame_with_boxes = video_processor.draw_detections(frame, detections)

                    # Write frame to recording if recording is active
                    if video_processor.video_writer is not None:
                        video_processor.write_frame_to_recording(frame_with_boxes)

                    # Encode frame — low quality to save memory and bandwidth
                    _, buffer = cv2.imencode('.jpg', frame_with_boxes, [cv2.IMWRITE_JPEG_QUALITY, 30])
                    frame_base64 = base64.b64encode(buffer).decode('utf-8')

                    # Explicitly release large objects to help GC
                    del frame, frame_with_boxes, buffer

                    # Store latest frame for new frontend clients
                    manager.latest_frame = frame_base64

                    # Save to database if trip is active
                    video_processor.save_passenger_count_to_db(passenger_count)

                    # Send detection results back to Pi
                    response = {
                        'type': 'detection',
                        'count': passenger_count,
                        'trip_id': active_trip,
                        'detections': detections,
                        'timestamp': message.get('timestamp')
                    }
                    await websocket.send_json(response)

                    # Broadcast processed frame to frontend clients
                    await manager.broadcast_to_frontends({
                        'type': 'video_frame',
                        'frame': frame_base64,
                        'count': passenger_count,
                        'trip_id': active_trip,
                        'timestamp': message.get('timestamp')
                    })

                elif message.get('type') == 'gps_update':
                    # Handle standalone GPS update (works without camera)
                    gps_data = message.get('gps')
                    trip_id = message.get('trip_id')

                    # Set trip ID if provided
                    if trip_id:
                        video_processor.set_current_trip(trip_id)

                    # Save GPS location to database if available (now works without trip_id)
                    if gps_data:
                        video_processor.save_gps_to_db(gps_data, trip_id)
                        print(f"[Backend] GPS update received (trip_id: {trip_id}): {gps_data['latitude']:.6f}, {gps_data['longitude']:.6f}")
                    else:
                        print(f"[Backend] GPS update received but no gps_data")

                elif message.get('type') == 'set_trip':
                    # Set current trip ID
                    trip_id = message.get('trip_id')
                    if trip_id:
                        video_processor.set_current_trip(trip_id)
                        await websocket.send_json({'type': 'trip_set', 'trip_id': trip_id})

                elif message.get('type') == 'start_recording':
                    # Start video recording for current trip
                    trip_id = message.get('trip_id')
                    frame_data = message.get('frame')
                    if trip_id and frame_data:
                        video_processor.set_current_trip(trip_id)
                        frame = video_processor.decode_frame(frame_data)
                        if frame:
                            height, width = frame.shape[:2]
                            success = video_processor.start_recording(width, height)
                            await websocket.send_json({
                                'type': 'recording_started',
                                'success': success
                            })
                    else:
                        await websocket.send_json({
                            'type': 'recording_started',
                            'success': False,
                            'error': 'Missing trip_id or frame'
                        })

                elif message.get('type') == 'stop_recording':
                    # Stop video recording
                    video_info = video_processor.stop_recording()
                    response = {'type': 'recording_stopped'}
                    if video_info:
                        response['video_info'] = video_info
                    await websocket.send_json(response)

                elif message.get('type') == 'clear_trip':
                    # Clear current trip ID and stop recording
                    video_info = video_processor.stop_recording()
                    video_processor.clear_current_trip()

                    response = {'type': 'trip_cleared'}
                    if video_info:
                        response['video_info'] = video_info

                    await websocket.send_json(response)
                
                elif message.get('type') == 'ping':
                    # Keep-alive ping
                    await websocket.send_json({'type': 'pong'})
                    
            except json.JSONDecodeError:
                print("[Video Router] Invalid JSON received")
                continue
            except Exception as e:
                print(f"[Video Router] Error processing message: {e}")
                continue
                
    except WebSocketDisconnect:
        manager.disconnect_pi(websocket, client_id)
        print(f"[Video Router] Pi {client_id} disconnected")
    except Exception as e:
        print(f"[Video Router] WebSocket error: {e}")
        manager.disconnect_pi(websocket, client_id)


@router.post("/api/video-processing/set-trip")
async def set_trip(trip_data: dict):
    """Set the current trip ID for video processing"""
    trip_id = trip_data.get('trip_id')
    if trip_id:
        video_processor.set_current_trip(trip_id)
        return {'status': 'success', 'trip_id': trip_id}
    return {'status': 'error', 'message': 'trip_id required'}


@router.post("/api/video-processing/clear-trip")
async def clear_trip():
    """Clear the current trip ID"""
    video_processor.clear_current_trip()
    return {'status': 'success'}


@router.get("/api/video-processing/status")
async def get_status():
    """Get video processing service status"""
    # Fetch active trip from database if none is set
    if not video_processor.current_trip_id:
        try:
            trip_result = supabase.table('trips').select('id').eq('status', 'in_progress').order('started_at', desc=True).limit(1).execute()
            if trip_result.data and len(trip_result.data) > 0:
                video_processor.current_trip_id = trip_result.data[0]['id']
                print(f"[Video Status] Auto-set active trip: {video_processor.current_trip_id}")
        except Exception as e:
            print(f"[Video Status] Error fetching active trip: {e}")

    return {
        'model_loaded': video_processor.model is not None,
        'current_trip_id': video_processor.current_trip_id,
        'yolo_available': video_processor.model is not None
    }


@router.get("/api/video-processing/trip-video/{trip_id}")
async def get_trip_video(trip_id: str):
    """
    Get video recording information for a specific trip
    Returns the video URL and metadata if available
    """
    try:
        result = supabase.table('trips').select(
            'id, video_recording_url, video_recording_duration, video_recording_status, video_recording_file_size, video_recording_uploaded_at'
        ).eq('id', trip_id).single().execute()

        if not result.data:
            return {'status': 'error', 'message': 'Trip not found'}

        trip = result.data
        return {
            'status': 'success',
            'video_url': trip.get('video_recording_url'),
            'duration': trip.get('video_recording_duration'),
            'recording_status': trip.get('video_recording_status'),
            'file_size': trip.get('video_recording_file_size'),
            'uploaded_at': trip.get('video_recording_uploaded_at')
        }
    except Exception as e:
        print(f"[Video Router] Error fetching trip video: {e}")
        return {'status': 'error', 'message': str(e)}


@router.websocket("/ws/video-feed")
async def video_feed_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for frontend clients to receive processed video frames
    """
    await manager.connect_frontend(websocket)

    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get('type') == 'ping':
                    await websocket.send_json({'type': 'pong'})
            except:
                pass
    except WebSocketDisconnect:
        manager.disconnect_frontend(websocket)
    except Exception as e:
        print(f"[Video Router] Frontend error: {e}")
        manager.disconnect_frontend(websocket)


@router.get("/api/video-processing/download-video/{filename}")
async def download_video(filename: str):
    """
    Download a video file from the backend's recordings directory
    """
    VIDEO_OUTPUT_DIR = os.getenv('VIDEO_OUTPUT_DIR', './recordings')
    file_path = os.path.join(VIDEO_OUTPUT_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail='File not found')

    try:
        return FileResponse(
            file_path,
            media_type='video/mp4',
            filename=filename
        )
    except Exception as e:
        print(f"[Video Router] Error serving video file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/video-processing/recordings")
async def get_recordings(trip_id: str = None, limit: int = 50, offset: int = 0):
    """
    Get list of video recordings from video_recordings table
    Optionally filter by trip_id
    """
    try:
        query = supabase.table('video_recordings').select('*')
        if trip_id:
            query = query.eq('trip_id', trip_id)
        result = query.order('recorded_at', {'ascending': False}).range(offset, offset + limit - 1).execute()
        return {'status': 'success', 'data': result.data or []}
    except Exception as e:
        print(f"[Video Router] Error fetching recordings: {e}")
        return {'status': 'error', 'message': str(e)}
