#!/usr/bin/env python3
"""
Raspberry Pi Video Server for Bus Monitoring - FastAPI Version
Captures video from EMEET C60E Dual Camera 4K Webcam
Performs AI passenger detection and streams via WebSocket
"""

import cv2
import numpy as np
import base64
import json
import time
import asyncio
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import queue
import os
from supabase import create_client, Client
from hardware_integration import HardwareManager

app = FastAPI(title="Bus Monitoring Video Server")

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client initialized successfully")
    except Exception as e:
        print(f"Failed to initialize Supabase client: {e}")
else:
    print("Supabase credentials not provided - database features disabled")

# Hardware Manager configuration
HARDWARE_CONFIG = {
    'enable_sms': os.getenv('ENABLE_SMS', 'true').lower() == 'true',
    'enable_gps': os.getenv('ENABLE_GPS', 'true').lower() == 'true',
    'enable_emergency_button': os.getenv('ENABLE_EMERGENCY_BUTTON', 'true').lower() == 'true',
    'enable_geolocation': os.getenv('ENABLE_GEOLOCATION', 'true').lower() == 'true',
    'sim900a_port': os.getenv('SIM900A_PORT', '/dev/ttyS0'),
    'sim900a_baudrate': int(os.getenv('SIM900A_BAUDRATE', '9600')),
    'neo6m_port': os.getenv('NEO6M_PORT', '/dev/ttyS1'),
    'neo6m_baudrate': int(os.getenv('NEO6M_BAUDRATE', '9600')),
    'emergency_button_pin': int(os.getenv('EMERGENCY_BUTTON_PIN', '18')),
    'osm_user_agent': os.getenv('OSM_USER_AGENT', 'BusMonitoringSystem'),
    'emergency_contacts': os.getenv('EMERGENCY_CONTACTS', '').split(',') if os.getenv('EMERGENCY_CONTACTS') else [],
    'admin_contacts': os.getenv('ADMIN_CONTACTS', '').split(',') if os.getenv('ADMIN_CONTACTS') else []
}

# Initialize Hardware Manager
hardware_manager = None
try:
    hardware_manager = HardwareManager(HARDWARE_CONFIG, db_client=supabase)
    if hardware_manager.initialize():
        print("Hardware manager initialized successfully")
        # Start GPS tracking
        hardware_manager.start_gps_tracking()
    else:
        print("Hardware manager initialization failed - some features may be unavailable")
except Exception as e:
    print(f"Hardware manager initialization error: {e}")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Camera configuration
CAMERA_ID = 0
CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
FPS = 15

# AI Model configuration
MODEL_PATH = 'yolov8n.pt'
CONFIDENCE_THRESHOLD = 0.5
IOU_THRESHOLD = 0.45

# Passenger detection classes (COCO dataset)
PASSENGER_CLASSES = ['person']

class VideoProcessor:
    def __init__(self):
        self.camera = None
        self.model = None
        self.frame_queue = queue.Queue(maxsize=30)
        self.running = False
        self.passenger_count = 0
        self.detection_history = []
        self.websocket_clients = set()
        self.current_trip_id = None
        self.last_db_save = 0
        self.db_save_interval = 5  # Save to database every 5 seconds
        
    def initialize_camera(self):
        """Initialize the EMEET C60E webcam"""
        try:
            self.camera = cv2.VideoCapture(CAMERA_ID)
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
            self.camera.set(cv2.CAP_PROP_FPS, FPS)
            
            if not self.camera.isOpened():
                print("Error: Could not open camera")
                return False
                
            print(f"Camera initialized successfully: {CAMERA_WIDTH}x{CAMERA_HEIGHT} @ {FPS}fps")
            return True
        except Exception as e:
            print(f"Camera initialization error: {e}")
            return False
    
    def initialize_model(self):
        """Initialize YOLO model for passenger detection"""
        try:
            self.model = YOLO(MODEL_PATH)
            print(f"YOLO model loaded from {MODEL_PATH}")
            return True
        except Exception as e:
            print(f"Model initialization error: {e}")
            return False
    
    def detect_passengers(self, frame):
        """Detect passengers in frame using YOLO"""
        try:
            results = self.model(frame, conf=CONFIDENCE_THRESHOLD, iou=IOU_THRESHOLD, verbose=False)
            passenger_detections = []
            
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    class_id = int(box.cls[0])
                    class_name = self.model.names[class_id]
                    
                    if class_name in PASSENGER_CLASSES:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                        confidence = float(box.conf[0])
                        
                        passenger_detections.append({
                            'bbox': [int(x1), int(y1), int(x2), int(y2)],
                            'confidence': confidence,
                            'class': class_name
                        })
            
            return passenger_detections
        except Exception as e:
            print(f"Detection error: {e}")
            return []
    
    def draw_detections(self, frame, detections):
        """Draw bounding boxes and labels on frame"""
        for detection in detections:
            x1, y1, x2, y2 = detection['bbox']
            confidence = detection['confidence']
            
            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 165, 255), 2)
            
            # Draw label
            label = f"Person: {confidence:.2f}"
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            cv2.rectangle(frame, (x1, y1 - label_size[1] - 10), 
                         (x1 + label_size[0], y1), (0, 165, 255), -1)
            cv2.putText(frame, label, (x1, y1 - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        
        # Draw passenger count overlay
        count_text = f"Passengers: {len(detections)}"
        cv2.rectangle(frame, (10, 10), (200, 50), (0, 0, 0), -1)
        cv2.putText(frame, count_text, (20, 35), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        return frame
    
    def encode_frame(self, frame):
        """Encode frame to base64 for streaming"""
        try:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
            return frame_base64
        except Exception as e:
            print(f"Frame encoding error: {e}")
            return None
    
    def save_passenger_count_to_db(self, count):
        """Save passenger count to Supabase database"""
        if not supabase or not self.current_trip_id:
            return
        
        try:
            current_time = time.time()
            # Only save if enough time has passed since last save
            if current_time - self.last_db_save < self.db_save_interval:
                return
            
            data = {
                'trip_id': self.current_trip_id,
                'count': count,
                'recorded_at': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(current_time))
            }
            
            result = supabase.table('passenger_counts').insert(data).execute()
            
            if result:
                self.last_db_save = current_time
                print(f"Saved passenger count {count} to database for trip {self.current_trip_id}")
        except Exception as e:
            print(f"Error saving passenger count to database: {e}")
    
    def set_current_trip(self, trip_id):
        """Set the current trip ID for database recording"""
        self.current_trip_id = trip_id
        print(f"Current trip ID set to: {trip_id}")
    
    def clear_current_trip(self):
        """Clear the current trip ID"""
        self.current_trip_id = None
        print("Current trip ID cleared")
    
    async def process_frames(self):
        """Main processing loop"""
        print("Starting video processing...")
        
        while self.running:
            try:
                ret, frame = self.camera.read()
                if not ret:
                    print("Error: Could not read frame")
                    await asyncio.sleep(0.1)
                    continue
                
                # Detect passengers
                detections = self.detect_passengers(frame)
                self.passenger_count = len(detections)
                
                # Store detection history (last 30 frames)
                self.detection_history.append(self.passenger_count)
                if len(self.detection_history) > 30:
                    self.detection_history.pop(0)
                
                # Save passenger count to database
                self.save_passenger_count_to_db(self.passenger_count)
                
                # Draw detections on frame
                annotated_frame = self.draw_detections(frame.copy(), detections)
                
                # Encode frame
                frame_base64 = self.encode_frame(annotated_frame)
                
                if frame_base64:
                    # Put frame in queue for streaming
                    if self.frame_queue.full():
                        self.frame_queue.get_nowait()
                    self.frame_queue.put(frame_base64)
                    
                    # Emit passenger count via WebSocket
                    passenger_data = {
                        'count': self.passenger_count,
                        'timestamp': time.time(),
                        'average_count': sum(self.detection_history) / len(self.detection_history) if self.detection_history else 0
                    }
                    
                    # Send to all connected clients
                    disconnected_clients = set()
                    for client in self.websocket_clients:
                        try:
                            await client.send_json(passenger_data)
                        except:
                            disconnected_clients.add(client)
                    
                    # Remove disconnected clients
                    self.websocket_clients -= disconnected_clients
                
                # Control frame rate
                await asyncio.sleep(1.0 / FPS)
                
            except Exception as e:
                print(f"Processing error: {e}")
                await asyncio.sleep(0.1)
    
    async def stream_frames(self):
        """Background task to stream frames"""
        while self.running:
            try:
                if not self.frame_queue.empty():
                    frame_base64 = self.frame_queue.get_nowait()
                    
                    disconnected_clients = set()
                    for client in self.websocket_clients:
                        try:
                            await client.send_json({'video_frame': frame_base64})
                        except:
                            disconnected_clients.add(client)
                    
                    self.websocket_clients -= disconnected_clients
                await asyncio.sleep(1.0 / FPS)
            except Exception as e:
                print(f"Streaming error: {e}")
                await asyncio.sleep(0.1)
    
    def start(self):
        """Start video processing"""
        if not self.initialize_camera():
            return False
        
        if not self.initialize_model():
            return False
        
        self.running = True
        return True
    
    def stop(self):
        """Stop video processing"""
        self.running = False
        if self.camera:
            self.camera.release()
        print("Video processing stopped")

# Global video processor
video_processor = VideoProcessor()

@app.get("/")
async def index():
    return {"message": "Bus Monitoring Video Server Running (FastAPI)"}

@app.get("/health")
async def health():
    return JSONResponse({
        'status': 'healthy',
        'camera_active': video_processor.camera is not None and video_processor.camera.isOpened(),
        'passenger_count': video_processor.passenger_count,
        'connected_clients': len(video_processor.websocket_clients),
        'current_trip_id': video_processor.current_trip_id
    })

@app.post("/set-trip")
async def set_trip(trip_data: dict):
    """Set the current trip ID for passenger count recording and hardware tracking"""
    trip_id = trip_data.get('trip_id')
    if trip_id:
        video_processor.set_current_trip(trip_id)
        if hardware_manager:
            hardware_manager.set_current_trip(trip_id)
        return JSONResponse({'status': 'success', 'trip_id': trip_id})
    else:
        return JSONResponse({'status': 'error', 'message': 'trip_id is required'}, status_code=400)

@app.post("/clear-trip")
async def clear_trip():
    """Clear the current trip ID"""
    video_processor.clear_current_trip()
    if hardware_manager:
        hardware_manager.clear_current_trip()
    return JSONResponse({'status': 'success', 'message': 'Trip cleared'})

@app.get("/location")
async def get_location():
    """Get current location from GPS or geolocation fallback"""
    if hardware_manager:
        location = hardware_manager.get_location()
        if location:
            return JSONResponse({
                'latitude': location.latitude,
                'longitude': location.longitude,
                'altitude': location.altitude,
                'speed': location.speed,
                'accuracy': location.accuracy,
                'source': location.source,
                'timestamp': location.timestamp
            })
        else:
            return JSONResponse({'status': 'error', 'message': 'Unable to get location'}, status_code=503)
    else:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)

@app.post("/send-sms")
async def send_sms(sms_data: dict):
    """Send SMS notification"""
    if not hardware_manager or not hardware_manager.sim900a:
        return JSONResponse({'status': 'error', 'message': 'SMS not available'}, status_code=503)
    
    phone_number = sms_data.get('phone_number')
    message = sms_data.get('message')
    
    if not phone_number or not message:
        return JSONResponse({'status': 'error', 'message': 'phone_number and message required'}, status_code=400)
    
    success = hardware_manager.sim900a.send_sms(phone_number, message)
    if success:
        return JSONResponse({'status': 'success', 'message': 'SMS sent successfully'})
    else:
        return JSONResponse({'status': 'error', 'message': 'Failed to send SMS'}, status_code=500)

@app.post("/send-transaction-notification")
async def send_transaction_notification(notification_data: dict):
    """Send transaction notification SMS"""
    if not hardware_manager:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)
    
    phone_number = notification_data.get('phone_number')
    transaction_type = notification_data.get('transaction_type')
    amount = notification_data.get('amount')
    details = notification_data.get('details', '')
    
    if not all([phone_number, transaction_type, amount]):
        return JSONResponse({'status': 'error', 'message': 'Missing required fields'}, status_code=400)
    
    success = hardware_manager.send_transaction_notification(phone_number, transaction_type, amount, details)
    if success:
        return JSONResponse({'status': 'success', 'message': 'Transaction notification sent'})
    else:
        return JSONResponse({'status': 'error', 'message': 'Failed to send notification'}, status_code=500)

@app.post("/send-topup-notification")
async def send_topup_notification(topup_data: dict):
    """Send top-up notification SMS"""
    if not hardware_manager:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)
    
    phone_number = topup_data.get('phone_number')
    amount = topup_data.get('amount')
    new_balance = topup_data.get('new_balance')
    
    if not all([phone_number, amount, new_balance]):
        return JSONResponse({'status': 'error', 'message': 'Missing required fields'}, status_code=400)
    
    success = hardware_manager.send_topup_notification(phone_number, amount, new_balance)
    if success:
        return JSONResponse({'status': 'success', 'message': 'Top-up notification sent'})
    else:
        return JSONResponse({'status': 'error', 'message': 'Failed to send notification'}, status_code=500)

@app.post("/send-reload-notification")
async def send_reload_notification(reload_data: dict):
    """Send reload notification SMS"""
    if not hardware_manager:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)
    
    phone_number = reload_data.get('phone_number')
    amount = reload_data.get('amount')
    card_id = reload_data.get('card_id')
    
    if not all([phone_number, amount, card_id]):
        return JSONResponse({'status': 'error', 'message': 'Missing required fields'}, status_code=400)
    
    success = hardware_manager.send_reload_notification(phone_number, amount, card_id)
    if success:
        return JSONResponse({'status': 'success', 'message': 'Reload notification sent'})
    else:
        return JSONResponse({'status': 'error', 'message': 'Failed to send notification'}, status_code=500)

@app.post("/send-trip-notification")
async def send_trip_notification(trip_data: dict):
    """Send trip completion notification SMS"""
    if not hardware_manager:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)
    
    phone_number = trip_data.get('phone_number')
    trip_details = trip_data.get('trip_details', {})
    
    if not phone_number:
        return JSONResponse({'status': 'error', 'message': 'phone_number required'}, status_code=400)
    
    success = hardware_manager.send_trip_completion_notification(phone_number, trip_details)
    if success:
        return JSONResponse({'status': 'success', 'message': 'Trip notification sent'})
    else:
        return JSONResponse({'status': 'error', 'message': 'Failed to send notification'}, status_code=500)

@app.get("/emergency-status")
async def get_emergency_status():
    """Get emergency button status"""
    if hardware_manager and hardware_manager.emergency_button:
        return JSONResponse({
            'emergency_active': hardware_manager.emergency_button.emergency_active,
            'monitoring': hardware_manager.emergency_button.monitoring,
            'last_emergency_time': hardware_manager.emergency_button.last_emergency_time
        })
    else:
        return JSONResponse({'status': 'error', 'message': 'Emergency button not available'}, status_code=503)

@app.post("/reset-emergency")
async def reset_emergency():
    """Reset emergency state"""
    if hardware_manager and hardware_manager.emergency_button:
        hardware_manager.emergency_button.reset_emergency()
        return JSONResponse({'status': 'success', 'message': 'Emergency state reset'})
    else:
        return JSONResponse({'status': 'error', 'message': 'Emergency button not available'}, status_code=503)

@app.post("/trigger-emergency")
async def trigger_emergency():
    """Manually trigger emergency (for testing)"""
    if hardware_manager:
        hardware_manager.handle_emergency()
        return JSONResponse({'status': 'success', 'message': 'Emergency triggered'})
    else:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)

# Hardware Data Retrieval Endpoints

@app.get("/sms-logs")
async def get_sms_logs(limit: int = 100, offset: int = 0):
    """Get SMS logs from database"""
    if not supabase:
        return JSONResponse({'status': 'error', 'message': 'Database not available'}, status_code=503)
    
    try:
        # Run synchronous database call in thread pool
        loop = asyncio.get_event_loop()
        data, error = await loop.run_in_executor(
            None,
            lambda: supabase.table('sms_logs').select('*').order('sent_at', {'ascending': False}).range(offset, offset + limit - 1).execute()
        )
        
        if error:
            return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
        
        return JSONResponse({'status': 'success', 'data': data[1] if data else []})
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.get("/gps-locations")
async def get_gps_locations(trip_id: Optional[int] = None, limit: int = 100, offset: int = 0):
    """Get GPS location history from database"""
    if not supabase:
        return JSONResponse({'status': 'error', 'message': 'Database not available'}, status_code=503)
    
    try:
        loop = asyncio.get_event_loop()
        
        def fetch_data():
            query = supabase.table('gps_locations').select('*').order('recorded_at', {'ascending': False})
            if trip_id:
                query = query.eq('trip_id', trip_id)
            return query.range(offset, offset + limit - 1).execute()
        
        data, error = await loop.run_in_executor(None, fetch_data)
        
        if error:
            return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
        
        return JSONResponse({'status': 'success', 'data': data[1] if data else []})
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.get("/emergency-alerts")
async def get_emergency_alerts(resolved: Optional[bool] = None, limit: int = 100, offset: int = 0):
    """Get emergency alerts from database"""
    if not supabase:
        return JSONResponse({'status': 'error', 'message': 'Database not available'}, status_code=503)
    
    try:
        loop = asyncio.get_event_loop()
        
        def fetch_data():
            query = supabase.table('emergency_alerts').select('*').order('triggered_at', {'ascending': False})
            if resolved is not None:
                query = query.eq('resolved', resolved)
            return query.range(offset, offset + limit - 1).execute()
        
        data, error = await loop.run_in_executor(None, fetch_data)
        
        if error:
            return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
        
        return JSONResponse({'status': 'success', 'data': data[1] if data else []})
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.post("/resolve-emergency")
async def resolve_emergency_alert(emergency_data: dict):
    """Resolve an emergency alert"""
    if not hardware_manager:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)
    
    emergency_id = emergency_data.get('emergency_id')
    resolved_by = emergency_data.get('resolved_by')
    notes = emergency_data.get('notes', '')
    
    if not all([emergency_id, resolved_by]):
        return JSONResponse({'status': 'error', 'message': 'emergency_id and resolved_by required'}, status_code=400)
    
    success = hardware_manager.resolve_emergency(emergency_id, resolved_by, notes)
    if success:
        return JSONResponse({'status': 'success', 'message': 'Emergency resolved'})
    else:
        return JSONResponse({'status': 'error', 'message': 'Failed to resolve emergency'}, status_code=500)

@app.get("/hardware-status")
async def get_hardware_status():
    """Get current hardware status from database"""
    if not supabase:
        return JSONResponse({'status': 'error', 'message': 'Database not available'}, status_code=503)
    
    try:
        loop = asyncio.get_event_loop()
        data, error = await loop.run_in_executor(
            None,
            lambda: supabase.table('hardware_status').select('*').order('last_check', {'ascending': False}).execute()
        )
        
        if error:
            return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
        
        # Group by component and get latest status
        status_by_component = {}
        for status in data[1] if data else []:
            component = status['component']
            if component not in status_by_component:
                status_by_component[component] = status
        
        return JSONResponse({'status': 'success', 'data': list(status_by_component.values())})
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.get("/sms-statistics")
async def get_sms_statistics(days: int = 7):
    """Get SMS statistics for the specified number of days"""
    if not supabase:
        return JSONResponse({'status': 'error', 'message': 'Database not available'}, status_code=503)
    
    try:
        from datetime import datetime, timedelta
        
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        
        loop = asyncio.get_event_loop()
        data, error = await loop.run_in_executor(
            None,
            lambda: supabase.table('sms_logs').select('*').gte('sent_at', start_date).execute()
        )
        
        if error:
            return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
        
        sms_data = data[1] if data else []
        
        # Calculate statistics
        stats = {
            'total_sent': len(sms_data),
            'successful': len([s for s in sms_data if s['status'] == 'sent']),
            'failed': len([s for s in sms_data if s['status'] == 'failed']),
            'by_type': {}
        }
        
        for sms in sms_data:
            sms_type = sms['sms_type']
            if sms_type not in stats['by_type']:
                stats['by_type'][sms_type] = {'total': 0, 'successful': 0, 'failed': 0}
            stats['by_type'][sms_type]['total'] += 1
            if sms['status'] == 'sent':
                stats['by_type'][sms_type]['successful'] += 1
            else:
                stats['by_type'][sms_type]['failed'] += 1
        
        return JSONResponse({'status': 'success', 'data': stats})
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.get("/gps-statistics")
async def get_gps_statistics(days: int = 7):
    """Get GPS statistics for the specified number of days"""
    if not supabase:
        return JSONResponse({'status': 'error', 'message': 'Database not available'}, status_code=503)
    
    try:
        from datetime import datetime, timedelta
        
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        
        loop = asyncio.get_event_loop()
        data, error = await loop.run_in_executor(
            None,
            lambda: supabase.table('gps_locations').select('*').gte('recorded_at', start_date).execute()
        )
        
        if error:
            return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
        
        gps_data = data[1] if data else []
        
        # Calculate statistics
        if gps_data:
            valid_accuracy = [loc['accuracy'] for loc in gps_data if loc['accuracy']]
            valid_speed = [loc['speed'] for loc in gps_data if loc['speed']]
            
            stats = {
                'total_readings': len(gps_data),
                'avg_accuracy': sum(valid_accuracy) / len(valid_accuracy) if valid_accuracy else 0,
                'avg_speed': sum(valid_speed) / len(valid_speed) if valid_speed else 0,
                'by_source': {}
            }
            
            for loc in gps_data:
                source = loc['source']
                if source not in stats['by_source']:
                    stats['by_source'][source] = 0
                stats['by_source'][source] += 1
        else:
            stats = {
                'total_readings': 0,
                'avg_accuracy': 0,
                'avg_speed': 0,
                'by_source': {}
            }
        
        return JSONResponse({'status': 'success', 'data': stats})
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.get("/address-lookup")
async def get_address_from_coordinates(lat: float, lon: float):
    """Get address information from coordinates using OpenStreetMap Nominatim"""
    if not hardware_manager:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)
    
    try:
        address_data = hardware_manager.get_address_from_location(lat, lon)
        if address_data:
            return JSONResponse({'status': 'success', 'data': address_data})
        else:
            return JSONResponse({'status': 'error', 'message': 'Unable to get address'}, status_code=500)
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    video_processor.websocket_clients.add(websocket)
    
    try:
        await websocket.send_json({"status": "Connected to video server"})
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get('action') == 'start_stream':
                if not video_processor.running:
                    if video_processor.start():
                        # Start processing tasks
                        asyncio.create_task(video_processor.process_frames())
                        asyncio.create_task(video_processor.stream_frames())
                        await websocket.send_json({"status": "Video stream started"})
                    else:
                        await websocket.send_json({"error": "Failed to start video stream"})
                else:
                    await websocket.send_json({"status": "Video stream already running"})
            
            elif message.get('action') == 'stop_stream':
                video_processor.stop()
                await websocket.send_json({"status": "Video stream stopped"})
                
    except WebSocketDisconnect:
        print("Client disconnected")
        video_processor.websocket_clients.discard(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        video_processor.websocket_clients.discard(websocket)

if __name__ == '__main__':
    import uvicorn
    import atexit
    
    print("Starting Bus Monitoring Video Server (FastAPI)...")
    print(f"Camera ID: {CAMERA_ID}")
    print(f"Resolution: {CAMERA_WIDTH}x{CAMERA_HEIGHT}")
    print(f"FPS: {FPS}")
    
    # Cleanup function
    def cleanup():
        print("Cleaning up hardware resources...")
        if hardware_manager:
            hardware_manager.cleanup()
    
    # Register cleanup function
    atexit.register(cleanup)
    
    try:
        uvicorn.run(app, host='0.0.0.0', port=5000)
    except KeyboardInterrupt:
        print("Server shutdown requested")
        cleanup()
    except Exception as e:
        print(f"Server error: {e}")
        cleanup()
