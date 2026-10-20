"""
Video Processing Router
WebSocket endpoint to receive raw video frames from Raspberry Pi
Processes frames with YOLOv8 and streams results back
"""

import asyncio
import json
import base64
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import cv2
import numpy as np
import os
from dotenv import load_dotenv

from video_processor import video_processor

load_dotenv()

router = APIRouter()

# Store active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.pi_connections: Set[WebSocket] = set()
    
    async def connect_pi(self, websocket: WebSocket, client_id: str):
        """Connect a Raspberry Pi client"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.pi_connections.add(websocket)
        print(f"[Video Router] Pi connected: {client_id}")
    
    def disconnect_pi(self, websocket: WebSocket, client_id: str):
        """Disconnect a Raspberry Pi client"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if websocket in self.pi_connections:
            self.pi_connections.remove(websocket)
        print(f"[Video Router] Pi disconnected: {client_id}")
    
    async def broadcast_detections(self, message: dict):
        """Broadcast detection results to all connected Pi clients"""
        for connection in self.pi_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()


@router.websocket("/ws/video-stream/{client_id}")
async def video_stream_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket endpoint to receive raw video frames from Raspberry Pi
    and return processed detection results
    """
    await manager.connect_pi(websocket, client_id)
    
    # Initialize model if not already done
    if video_processor.model is None:
        print("[Video Router] Initializing YOLO model...")
        video_processor.initialize_model()
    
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
                    
                    # Decode frame
                    frame = video_processor.decode_frame(frame_data)
                    if frame is None:
                        continue
                    
                    # Detect passengers
                    detections = video_processor.detect_passengers(frame)
                    passenger_count = len(detections)
                    
                    # Save to database if trip is active
                    video_processor.save_passenger_count_to_db(passenger_count)
                    
                    # Send detection results back to Pi
                    response = {
                        'type': 'detection',
                        'count': passenger_count,
                        'detections': detections,
                        'timestamp': message.get('timestamp')
                    }
                    await websocket.send_json(response)
                    
                elif message.get('type') == 'set_trip':
                    # Set current trip ID
                    trip_id = message.get('trip_id')
                    if trip_id:
                        video_processor.set_current_trip(trip_id)
                        await websocket.send_json({'type': 'trip_set', 'trip_id': trip_id})
                
                elif message.get('type') == 'clear_trip':
                    # Clear current trip ID
                    video_processor.clear_current_trip()
                    await websocket.send_json({'type': 'trip_cleared'})
                
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
    return {
        'model_loaded': video_processor.model is not None,
        'current_trip_id': video_processor.current_trip_id,
        'yolo_available': video_processor.model is not None
    }
