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
                    'frame': self.latest_frame
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
        """Broadcast processed video frame to all frontend clients"""
        for connection in self.frontend_connections:
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

                    # Detect passengers (async for Roboflow support)
                    detections = await video_processor.detect_passengers(frame)
                    passenger_count = len(detections)

                    # Draw detection boxes on frame
                    frame_with_boxes = video_processor.draw_detections(frame, detections)

                    # Encode frame with detections - very low quality for maximum speed
                    _, buffer = cv2.imencode('.jpg', frame_with_boxes, [cv2.IMWRITE_JPEG_QUALITY, 40])
                    frame_base64 = base64.b64encode(buffer).decode('utf-8')

                    # Store latest frame for new frontend clients
                    manager.latest_frame = frame_base64

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

                    # Broadcast processed frame to frontend clients
                    await manager.broadcast_to_frontends({
                        'type': 'video_frame',
                        'frame': frame_base64,
                        'count': passenger_count,
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
