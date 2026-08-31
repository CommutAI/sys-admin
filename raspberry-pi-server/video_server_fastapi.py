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
import uuid
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import queue
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from hardware_integration import HardwareManager

# Load environment variables from .env file
load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    print("Auto-starting camera on server startup...")
    success, err_msg = video_processor.start()
    if success:
        print("Camera started successfully")
        # Start processing tasks
        asyncio.create_task(video_processor.process_frames())
        asyncio.create_task(video_processor.stream_frames())
        print("Video processing started")
    else:
        print(f"Failed to start camera on startup: {err_msg}")
    
    yield
    
    # Shutdown
    print("Cleaning up hardware resources...")
    video_processor.stop()
    if hardware_manager:
        hardware_manager.cleanup()

app = FastAPI(title="Bus Monitoring Video Server", lifespan=lifespan)

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
    'enable_sms': os.getenv('ENABLE_SMS', 'false').lower() == 'true',  # Disabled by default for testing
    'enable_gps': os.getenv('ENABLE_GPS', 'false').lower() == 'true',  # Disabled by default for testing
    'enable_emergency_button': os.getenv('ENABLE_EMERGENCY_BUTTON', 'false').lower() == 'true',  # Disabled by default for testing
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

# Camera configuration - Ultra-low latency
CAMERA_ID = int(os.getenv('CAMERA_ID', '0'))
CAMERA_WIDTH = int(os.getenv('CAMERA_WIDTH', '320'))   # ultra-low resolution
CAMERA_HEIGHT = int(os.getenv('CAMERA_HEIGHT', '240'))  # ultra-low resolution
FPS = int(os.getenv('FPS', '30'))                        # high frame rate

# Ultra-low latency optimization settings
ENABLE_REALTIME_MODE = os.getenv('ENABLE_REALTIME_MODE', 'true').lower() == 'true'
SKIP_DETECTION_FRAMES = int(os.getenv('SKIP_DETECTION_FRAMES', '5'))  # Skip more frames
FRAME_QUEUE_SIZE = int(os.getenv('FRAME_QUEUE_SIZE', '1'))  # Minimal queue
DISABLE_DRAWING = os.getenv('DISABLE_DRAWING', 'false').lower() == 'true'
DISABLE_DB_WRITES = os.getenv('DISABLE_DB_WRITES', 'true').lower() == 'true'
SKIP_WEBSOCKET_THROTTLE = os.getenv('SKIP_WEBSOCKET_THROTTLE', 'true').lower() == 'true'

# AI Model configuration
DISABLE_AI = os.getenv('DISABLE_AI', 'false').lower() == 'true'
# COUNT_METHOD: read from env first, then fall back based on DISABLE_AI
# Default is 'yolo' — more accurate detection using YOLOv8 model
_count_method_default = 'mog2' if DISABLE_AI else 'yolo'
COUNT_METHOD = os.getenv('COUNT_METHOD', _count_method_default)
MODEL_PATH = os.getenv('MODEL_PATH', 'yolov8n.pt')
CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', '0.25'))
IOU_THRESHOLD = float(os.getenv('IOU_THRESHOLD', '0.45'))
JPEG_QUALITY = int(os.getenv('JPEG_QUALITY', '25'))    # very low quality for speed

# Video Recording configuration
ENABLE_VIDEO_RECORDING = os.getenv('ENABLE_VIDEO_RECORDING', 'false').lower() == 'true'
VIDEO_STORAGE_PATH = os.getenv('VIDEO_STORAGE_PATH', './recordings')
MAX_VIDEO_DURATION = int(os.getenv('MAX_VIDEO_DURATION', '300'))  # 5 minutes max per recording
VIDEO_FORMAT = os.getenv('VIDEO_FORMAT', 'mp4')
VIDEO_BITRATE = int(os.getenv('VIDEO_BITRATE', '1000000'))  # 1 Mbps

# Minimum contour area (pixels²) for MOG2 to count as a person
MOG2_MIN_AREA = int(os.getenv('MOG2_MIN_AREA', '1500'))

# Passenger detection classes (COCO dataset)
PASSENGER_CLASSES = ['person']

print(f"Detection mode: COUNT_METHOD={COUNT_METHOD}, DISABLE_AI={DISABLE_AI}")
print(f"Ultra-low latency settings: ENABLE_REALTIME_MODE={ENABLE_REALTIME_MODE}, SKIP_DETECTION_FRAMES={SKIP_DETECTION_FRAMES}")
print(f"Camera settings: {CAMERA_WIDTH}x{CAMERA_HEIGHT} @ {FPS}fps, JPEG_QUALITY={JPEG_QUALITY}")
print(f"Performance optimizations: DISABLE_DRAWING={DISABLE_DRAWING}, DISABLE_DB_WRITES={DISABLE_DB_WRITES}, FRAME_QUEUE_SIZE={FRAME_QUEUE_SIZE}")

class VideoProcessor:
    def __init__(self):
        self.camera = None
        self.model = None
        self.bg_subtractor = None   # used when COUNT_METHOD == 'mog2'
        self.hog = None             # used when COUNT_METHOD == 'hog'
        self.frame_queue = queue.Queue(maxsize=FRAME_QUEUE_SIZE)  # Optimized queue size
        self.running = False
        self.passenger_count = 0
        self.detection_history = []
        self.websocket_clients = set()
        self.current_trip_id = None
        self.last_db_save = 0
        self.db_save_interval = 5  # Save to database every 5 seconds
        self.camera_reconnect_attempts = 0
        self.max_reconnect_attempts = 5
        self.reconnect_delay = 2  # seconds
        
        # Real-time optimization attributes
        self.frame_count = 0
        self.last_detection_count = 0
        self.last_detections = []
        
        # Video recording attributes
        self.video_writer = None
        self.recording = False
        self.recording_start_time = None
        self.current_video_path = None
        self.recording_frame_count = 0
        
    def initialize_camera(self):
        """Initialize the EMEET C60E webcam - Optimized for real-time performance"""
        try:
            if self.camera is not None:
                self.camera.release()

            # Cross-platform camera initialization
            # On Raspberry Pi, use V4L2 backend; on Windows/Mac, use default backend
            import platform
            if platform.system() == 'Linux':
                # On Raspberry Pi, OpenCV must be told to use the V4L2 backend
                # explicitly, otherwise it tries GStreamer/obs-sensor which fails.
                self.camera = cv2.VideoCapture(CAMERA_ID, cv2.CAP_V4L2)
            else:
                # On Windows/Mac, use default backend (DirectShow/MSMF/AVFoundation)
                self.camera = cv2.VideoCapture(CAMERA_ID)

            if not self.camera.isOpened():
                print(f"Error: Could not open camera with ID {CAMERA_ID} (V4L2)")
                self._list_available_cameras()
                return False
            
            # Ultra-low latency: Set camera buffer size to absolute minimum
            self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimal buffer for lowest latency
            
            # Set camera properties
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
            self.camera.set(cv2.CAP_PROP_FPS, FPS)
            
            # Ultra-low latency optimizations
            self.camera.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))  # Use MJPG for fastest capture
            self.camera.set(cv2.CAP_PROP_AUTOFOCUS, 0)  # Disable autofocus
            self.camera.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0)  # Disable auto exposure if supported
            
            # Disable all processing features that add latency
            try:
                self.camera.set(cv2.CAP_PROP_CONVERT_RGB, 0)  # Skip color conversion if possible
            except:
                pass  # Some cameras don't support this
            
            # Verify camera is still open after setting properties
            if not self.camera.isOpened():
                print("Error: Camera closed after setting properties")
                return False
                
            # Test reading a frame
            ret, test_frame = self.camera.read()
            if not ret or test_frame is None:
                print("Error: Could not read test frame from camera")
                self.camera.release()
                return False
            
            # Get actual camera settings
            actual_width = int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.camera.get(cv2.CAP_PROP_FPS))
            buffer_size = int(self.camera.get(cv2.CAP_PROP_BUFFERSIZE))
                
            print(f"Camera initialized successfully: {actual_width}x{actual_height} @ {actual_fps}fps (buffer: {buffer_size})")
            print(f"Real-time mode: {ENABLE_REALTIME_MODE}, Skip frames: {SKIP_DETECTION_FRAMES}")
            self.camera_reconnect_attempts = 0  # Reset counter on successful initialization
            return True
        except Exception as e:
            print(f"Camera initialization error: {e}")
            return False
    
    def _list_available_cameras(self):
        """List available camera devices"""
        print("Attempting to find available cameras...")
        import platform
        for i in range(4):
            try:
                if platform.system() == 'Linux':
                    test_cam = cv2.VideoCapture(i, cv2.CAP_V4L2)
                else:
                    test_cam = cv2.VideoCapture(i)
                    
                if test_cam.isOpened():
                    ret, frame = test_cam.read()
                    if ret:
                        print(f"Found working camera at index {i}")
                    test_cam.release()
            except Exception as e:
                print(f"Error checking camera index {i}: {e}")
    
    def reconnect_camera(self):
        """Attempt to reconnect the camera"""
        if self.camera_reconnect_attempts >= self.max_reconnect_attempts:
            print(f"Max reconnection attempts ({self.max_reconnect_attempts}) reached. Giving up.")
            return False
            
        self.camera_reconnect_attempts += 1
        print(f"Attempting camera reconnection {self.camera_reconnect_attempts}/{self.max_reconnect_attempts}...")
        
        time.sleep(self.reconnect_delay)
        return self.initialize_camera()
    
    def initialize_model(self):
        """Initialize detection backend based on COUNT_METHOD."""
        if COUNT_METHOD == 'mog2':
            # MOG2 background subtraction — detects movement only, not still people
            self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
                history=500, varThreshold=50, detectShadows=False
            )
            print("MOG2 background subtractor initialized (motion-based counting mode)")
            return True
        if COUNT_METHOD == 'hog':
            # HOG person detector — built into OpenCV, detects still people, no model file needed
            self.hog = cv2.HOGDescriptor()
            self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            print("HOG person detector initialized (counts still and moving people, no model file needed)")
            return True
        if DISABLE_AI:
            print("AI detection disabled via DISABLE_AI env var — skipping model load")
            return False
        try:
            self.model = YOLO(MODEL_PATH)
            print(f"YOLO model loaded from {MODEL_PATH}")
            return True
        except Exception as e:
            print(f"Model initialization error: {e}")
            return False

    def detect_passengers(self, frame):
        """Detect/count passengers. Uses HOG, MOG2, or YOLO depending on COUNT_METHOD."""
        if COUNT_METHOD == 'hog' and hasattr(self, 'hog'):
            return self._detect_hog(frame)
        if COUNT_METHOD == 'mog2' and self.bg_subtractor is not None:
            return self._detect_mog2(frame)
        if self.model is None:
            return []
        return self._detect_yolo(frame)

    def _detect_hog(self, frame):
        """HOG-based person detection — built into OpenCV, detects still and moving people.
        No model file required, very low RAM usage (~50MB), works on any Pi.
        Tuned for speed on Pi 4: aggressive downscale + larger winStride.
        """
        try:
            # Downscale to 320x240 — HOG only needs to find rough person shapes
            small = cv2.resize(frame, (320, 240))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            # Equalise histogram so detection works in dim bus lighting
            gray = cv2.equalizeHist(gray)

            # winStride=(16,16) is ~4x faster than (8,8) with minor accuracy loss
            # scale=1.1 fewer pyramid levels = faster
            rects, _ = self.hog.detectMultiScale(
                gray,
                winStride=(16, 16),
                padding=(8, 8),
                scale=1.1,
                hitThreshold=0.0,   # lower = more sensitive, raise to 0.5 if too many false positives
                finalThreshold=2,   # require a rect to appear in >=2 pyramid levels
            )

            # Scale bounding boxes back to original frame dimensions
            scale_x = frame.shape[1] / 320
            scale_y = frame.shape[0] / 240

            detections = []
            for (x, y, w, h) in rects:
                detections.append({
                    'bbox': [int(x * scale_x), int(y * scale_y),
                             int((x + w) * scale_x), int((y + h) * scale_y)],
                    'confidence': 1.0,
                    'class': 'person'
                })
            return detections
        except Exception as e:
            print(f"HOG detection error: {e}")
            return []

    def _detect_mog2(self, frame):
        """Lightweight person counting via background subtraction (MOG2).
        Works on any Pi without loading PyTorch/YOLO.
        Counts moving blobs that are roughly person-shaped.
        """
        try:
            fg_mask = self.bg_subtractor.apply(frame)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
            contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            detections = []
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < MOG2_MIN_AREA:
                    continue
                x, y, w, h = cv2.boundingRect(contour)
                if h > w * 0.8:  # roughly person-shaped (taller than wide)
                    detections.append({
                        'bbox': [x, y, x + w, y + h],
                        'confidence': 1.0,
                        'class': 'person'
                    })
            return detections
        except Exception as e:
            print(f"MOG2 detection error: {e}")
            return []

    def _detect_yolo(self, frame):
        """YOLO-based passenger detection."""
        try:
            # Use original frame for detection to avoid any YOLO drawing
            # Add multiple parameters to completely disable any YOLO visualization
            results = self.model(
                frame, 
                conf=CONFIDENCE_THRESHOLD, 
                iou=IOU_THRESHOLD, 
                verbose=False,
                save=False,
                show=False,
                stream=False,
                show_labels=False,
                show_conf=False,
                line_width=None,
                boxes=False,
                imgsz=320
            )
            passenger_detections = []

            for result in results:
                # Clear any plot/visualization data from result
                if hasattr(result, 'plot'):
                    result.plot = None
                
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

            # Debug: always print count so we know YOLO is running
            if passenger_detections:
                print(f"[YOLO] Detected {len(passenger_detections)} person(s), "
                      f"confidences: {[round(d['confidence'],2) for d in passenger_detections]}")
            else:
                # Print all detected classes so we can see what YOLO is finding
                all_classes = []
                for result in results:
                    for box in result.boxes:
                        all_classes.append(self.model.names[int(box.cls[0])])
                if all_classes:
                    print(f"[YOLO] No persons — detected: {all_classes}")

            return passenger_detections
        except Exception as e:
            print(f"[YOLO] Detection error: {e}")
            return []
    
    def draw_detections(self, frame, detections):
        """Draw bounding boxes on detected passengers.
        The passenger count is NOT rendered onto the frame — it is sent
        as WebSocket JSON data and displayed in the UI panel instead.
        """
        print(f"[DRAW] Drawing {len(detections)} detections with custom labels")
        
        # First, clear any existing text/annotations in the area where we'll draw
        # This removes any YOLO confidence scores that might have been drawn
        for detection in detections:
            x1, y1, x2, y2 = detection['bbox']
            # Clear area above the bounding box where labels typically appear
            clear_height = 30
            if y1 - clear_height >= 0:
                cv2.rectangle(frame, (x1 - 5, y1 - clear_height), 
                            (x2 + 5, y1), (0, 0, 0), -1)
        
        for i, detection in enumerate(detections, 1):
            x1, y1, x2, y2 = detection['bbox']
            confidence = detection['confidence']

            # Bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 165, 255), 2)

            # Person number badge above the box (instead of confidence)
            label = f"Person {i}"
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(frame, (x1, y1 - label_size[1] - 6),
                         (x1 + label_size[0] + 4, y1), (0, 165, 255), -1)
            cv2.putText(frame, label, (x1 + 2, y1 - 3),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

            print(f"[DRAW] Drew label: {label} at position ({x1}, {y1})")
        return frame
    
    def encode_frame(self, frame):
        """Encode frame to base64 for streaming - Ultra-low latency"""
        try:
            # Ultra-low latency: Use fastest possible encoding
            encode_params = [
                cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY,
                cv2.IMWRITE_JPEG_OPTIMIZE, 0,  # Disable optimization
                cv2.IMWRITE_JPEG_PROGRESSIVE, 0,  # Disable progressive
                cv2.IMWRITE_JPEG_LUMA_QUALITY, JPEG_QUALITY  # Set luma quality
            ]
            
            # Try-except for encoding with fallback
            try:
                _, buffer = cv2.imencode('.jpg', frame, encode_params)
            except:
                # Fallback to basic encoding if optimized params fail
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
            return frame_base64
        except Exception as e:
            print(f"Frame encoding error: {e}")
            return None
    
    def save_passenger_count_to_db(self, count):
        """Save passenger count to Supabase database.
        - Sets ai_count and source so the admin dashboard can distinguish
          camera counts from manual ones.
        - Only writes when a trip is active (trip_id NOT NULL constraint).
        - The live WebSocket count is always sent regardless of trip state.
        """
        if not supabase or not self.current_trip_id:
            return  # live count still streams via WebSocket — DB write needs a trip

        try:
            current_time = time.time()
            # Throttle: only write once every db_save_interval seconds
            if current_time - self.last_db_save < self.db_save_interval:
                return

            data = {
                'trip_id': self.current_trip_id,
                'count': count,
                'ai_count': count,          # same value — ai_count is the camera estimate
                'source': COUNT_METHOD,     # 'hog', 'mog2', or 'yolo'
                'recorded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(current_time))
            }

            result = supabase.table('passenger_counts').insert(data).execute()
            if result:
                self.last_db_save = current_time
                print(f"[DB] Saved count={count} source={COUNT_METHOD} trip={self.current_trip_id}")
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
    
    def start_recording(self):
        """Start video recording to file"""
        if not ENABLE_VIDEO_RECORDING:
            print("Video recording is disabled in configuration")
            return False
        
        if self.recording:
            print("Recording already in progress")
            return False
        
        if not self.camera or not self.camera.isOpened():
            print("Camera not available for recording")
            return False
        
        try:
            # Create recordings directory if it doesn't exist
            os.makedirs(VIDEO_STORAGE_PATH, exist_ok=True)
            
            # Generate filename with timestamp
            timestamp = time.strftime('%Y%m%d_%H%M%S')
            trip_suffix = f"_trip_{self.current_trip_id}" if self.current_trip_id else ""
            filename = f"video_{timestamp}{trip_suffix}.{VIDEO_FORMAT}"
            self.current_video_path = os.path.join(VIDEO_STORAGE_PATH, filename)
            
            # Initialize video writer
            fourcc = cv2.VideoWriter_fourcc(*'mp4v') if VIDEO_FORMAT == 'mp4' else cv2.VideoWriter_fourcc(*'XVID')
            self.video_writer = cv2.VideoWriter(
                self.current_video_path,
                fourcc,
                FPS,
                (CAMERA_WIDTH, CAMERA_HEIGHT)
            )
            
            if not self.video_writer.isOpened():
                print("Failed to initialize video writer")
                return False
            
            self.recording = True
            self.recording_start_time = time.time()
            self.recording_frame_count = 0
            print(f"Recording started: {self.current_video_path}")
            return True
            
        except Exception as e:
            print(f"Error starting recording: {e}")
            return False
    
    def stop_recording(self):
        """Stop video recording and save metadata to database"""
        if not self.recording:
            print("No recording in progress")
            return None
        
        try:
            self.recording = False
            
            if self.video_writer:
                self.video_writer.release()
                self.video_writer = None
            
            # Calculate duration
            duration = int(time.time() - self.recording_start_time) if self.recording_start_time else 0
            
            # Get file size
            file_size = 0
            if self.current_video_path and os.path.exists(self.current_video_path):
                file_size = os.path.getsize(self.current_video_path)
            
            print(f"Recording stopped: {self.current_video_path}")
            print(f"Duration: {duration}s, Frames: {self.recording_frame_count}, Size: {file_size} bytes")
            
            # Save metadata to database
            recording_id = self.save_video_metadata(duration, file_size)
            
            result = {
                'file_path': self.current_video_path,
                'duration': duration,
                'frame_count': self.recording_frame_count,
                'file_size': file_size,
                'recording_id': recording_id
            }
            
            self.current_video_path = None
            self.recording_start_time = None
            self.recording_frame_count = 0
            
            return result
            
        except Exception as e:
            print(f"Error stopping recording: {e}")
            return None
    
    def save_video_metadata(self, duration, file_size):
        """Save video recording metadata to Supabase database"""
        if not supabase:
            print("Database not available - skipping metadata save")
            return None
        
        try:
            data = {
                'trip_id': self.current_trip_id,
                'file_name': os.path.basename(self.current_video_path) if self.current_video_path else 'unknown',
                'file_path': self.current_video_path,
                'file_size': file_size,
                'duration': duration,
                'format': VIDEO_FORMAT,
                'storage_type': 'local',
                'status': 'completed',
                'metadata': {
                    'resolution': f"{CAMERA_WIDTH}x{CAMERA_HEIGHT}",
                    'fps': FPS,
                    'frame_count': self.recording_frame_count,
                    'recorded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(self.recording_start_time)) if self.recording_start_time else None
                }
            }
            
            result = supabase.table('video_recordings').insert(data).execute()
            if result and result.data:
                recording_id = result.data[0].get('id')
                print(f"[DB] Video metadata saved with ID: {recording_id}")
                return str(recording_id) if recording_id else None
            else:
                print("[DB] Video metadata save returned no data")
                return None
        except Exception as e:
            print(f"Error saving video metadata to database: {e}")
            return None
    
    def write_frame_to_video(self, frame):
        """Write frame to video file if recording is active"""
        if self.recording and self.video_writer and self.video_writer.isOpened():
            try:
                self.video_writer.write(frame)
                self.recording_frame_count += 1
                
                # Check max duration
                if self.recording_start_time and (time.time() - self.recording_start_time) >= MAX_VIDEO_DURATION:
                    print("Max recording duration reached, stopping recording")
                    self.stop_recording()
                    
            except Exception as e:
                print(f"Error writing frame to video: {e}")
    
    async def process_frames(self):
        """Main processing loop - Optimized for real-time performance"""
        print("Starting video processing (real-time optimized)...")
        
        # Performance monitoring
        last_fps_time = time.time()
        frame_counter = 0
        
        while self.running:
            try:
                ret, frame = self.camera.read()
                if not ret:
                    print("Error: Could not read frame - attempting camera reconnection")
                    if self.reconnect_camera():
                        print("Camera reconnected successfully")
                        continue
                    else:
                        print("Camera reconnection failed, waiting before retry...")
                        await asyncio.sleep(5)
                        continue
                
                self.frame_count += 1
                frame_counter += 1
                
                # Calculate actual FPS for monitoring
                current_time = time.time()
                if current_time - last_fps_time >= 1.0:
                    actual_fps = frame_counter / (current_time - last_fps_time)
                    if self.frame_count % 30 == 0:  # Print every 30 frames
                        print(f"[PERF] Actual FPS: {actual_fps:.1f}, Queue size: {self.frame_queue.qsize()}")
                    frame_counter = 0
                    last_fps_time = current_time
                
                # Real-time optimization: Skip detection on some frames
                if ENABLE_REALTIME_MODE and SKIP_DETECTION_FRAMES > 0:
                    if self.frame_count % (SKIP_DETECTION_FRAMES + 1) == 0:
                        # Detect passengers only on specified frames (use deep copy to prevent YOLO drawing)
                        import copy
                        detection_frame = copy.deepcopy(frame)
                        detections = self.detect_passengers(detection_frame)
                        self.passenger_count = len(detections)
                        self.last_detections = detections
                        self.last_detection_count = self.frame_count
                    else:
                        # Use last known detections
                        detections = self.last_detections
                else:
                    # Detect passengers on every frame (use deep copy to prevent YOLO drawing)
                    import copy
                    detection_frame = copy.deepcopy(frame)
                    detections = self.detect_passengers(detection_frame)
                    self.passenger_count = len(detections)
                    self.last_detections = detections
                
                # Only print passenger count periodically to reduce overhead
                if self.passenger_count > 0 and self.frame_count % 10 == 0:
                    print(f"[COUNT] {self.passenger_count} passenger(s) in frame")
                
                # Store detection history (reduced from 30 to 10 for less memory)
                self.detection_history.append(self.passenger_count)
                if len(self.detection_history) > 10:
                    self.detection_history.pop(0)
                
                # Save passenger count to database (can be disabled for ultra-low latency)
                if not DISABLE_DB_WRITES and self.frame_count % (FPS * self.db_save_interval) == 0:
                    self.save_passenger_count_to_db(self.passenger_count)
                
                # Real-time optimization: Optional drawing
                if DISABLE_DRAWING:
                    print(f"[DRAW] Drawing disabled by config")
                    annotated_frame = frame
                else:
                    print(f"[DRAW] Drawing enabled, applying custom labels")
                    # Always use original clean frame for our custom drawing
                    annotated_frame = self.draw_detections(frame, detections)
                
                # Write frame to video if recording (can be disabled for max speed)
                if ENABLE_VIDEO_RECORDING:
                    self.write_frame_to_video(annotated_frame)
                
                # Encode frame for streaming
                frame_base64 = self.encode_frame(annotated_frame)
                
                if frame_base64:
                    # Put frame in queue for streaming (drop old frames if queue is full)
                    if self.frame_queue.full():
                        try:
                            self.frame_queue.get_nowait()
                        except queue.Empty:
                            pass
                    self.frame_queue.put(frame_base64)
                    
                    # Emit passenger count via WebSocket (throttled unless disabled)
                    if SKIP_WEBSOCKET_THROTTLE or self.frame_count % 5 == 0:
                        passenger_data = {
                            'count': self.passenger_count,
                            'timestamp': time.time(),
                            'average_count': sum(self.detection_history) / len(self.detection_history) if self.detection_history else 0,
                            'fps': FPS,
                            'realtime_mode': ENABLE_REALTIME_MODE
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
                
                # Minimal frame rate control - rely on camera's natural timing
                if ENABLE_REALTIME_MODE:
                    await asyncio.sleep(0.001)  # Minimal sleep for real-time
                else:
                    await asyncio.sleep(1.0 / FPS)
                
            except Exception as e:
                print(f"Processing error: {e}")
                await asyncio.sleep(0.1)
    
    async def stream_frames(self):
        """Background task to stream frames - Optimized for low latency"""
        # Performance monitoring
        last_stream_time = time.time()
        stream_counter = 0
        
        while self.running:
            try:
                if not self.frame_queue.empty():
                    frame_base64 = self.frame_queue.get_nowait()
                    stream_counter += 1
                    
                    # Batch send to all clients to reduce overhead
                    if self.websocket_clients:
                        disconnected_clients = set()
                        for client in self.websocket_clients:
                            try:
                                await client.send_json({'video_frame': frame_base64})
                            except:
                                disconnected_clients.add(client)
                        
                        self.websocket_clients -= disconnected_clients
                    
                    # Calculate streaming FPS for monitoring
                    current_time = time.time()
                    if current_time - last_stream_time >= 1.0:
                        stream_fps = stream_counter / (current_time - last_stream_time)
                        if self.frame_count % 30 == 0:  # Print every 30 frames
                            print(f"[STREAM] Streaming FPS: {stream_fps:.1f}, Clients: {len(self.websocket_clients)}")
                        stream_counter = 0
                        last_stream_time = current_time
                    
                    # In real-time mode, process frames as fast as possible
                    if ENABLE_REALTIME_MODE:
                        continue  # Don't sleep, process next frame immediately
                
                # Only sleep in non-real-time mode
                if not ENABLE_REALTIME_MODE:
                    await asyncio.sleep(1.0 / FPS)
                else:
                    await asyncio.sleep(0.001)  # Minimal sleep for real-time
            except Exception as e:
                print(f"Streaming error: {e}")
                await asyncio.sleep(0.1)
    
    def start(self):
        """Start video processing. Returns (success, error_message)."""
        cam_ok = self.initialize_camera()
        if not cam_ok:
            # Try auto-detecting a working camera index before giving up
            import platform
            for idx in range(4):
                if idx == CAMERA_ID:
                    continue
                if platform.system() == 'Linux':
                    self.camera = cv2.VideoCapture(idx, cv2.CAP_V4L2)
                else:
                    self.camera = cv2.VideoCapture(idx)
                    
                if self.camera.isOpened():
                    ret, _ = self.camera.read()
                    if ret:
                        print(f"Camera found at index {idx} (configured index {CAMERA_ID} failed)")
                        cam_ok = True
                        break
                    self.camera.release()

        if not cam_ok:
            return False, f"Camera not found. Tried indices 0-3. Check USB connection and run: ls /dev/video*"

        # Model is optional - allow streaming without AI detection
        if not self.initialize_model():
            print("Warning: YOLO model not available - streaming without AI detection")

        self.running = True
        return True, None
    
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
    try:
        return {"message": "Bus Monitoring Video Server Running (FastAPI)", "status": "operational"}
    except Exception as e:
        return {"message": "Bus Monitoring Video Server (FastAPI)", "status": "error", "error": str(e)}

@app.get("/health")
async def health():
    try:
        camera_active = False
        if video_processor.camera is not None:
            try:
                camera_active = video_processor.camera.isOpened()
            except:
                camera_active = False
        
        return JSONResponse({
            'status': 'healthy',
            'camera_active': camera_active,
            'passenger_count': video_processor.passenger_count,
            'connected_clients': len(video_processor.websocket_clients),
            'current_trip_id': video_processor.current_trip_id
        })
    except Exception as e:
        return JSONResponse({
            'status': 'error',
            'message': str(e),
            'camera_active': False,
            'passenger_count': 0,
            'connected_clients': 0,
            'current_trip_id': None
        }, status_code=500)

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

@app.post("/start-recording")
async def start_recording():
    """Start video recording"""
    success = video_processor.start_recording()
    if success:
        return JSONResponse({
            'status': 'success', 
            'message': 'Recording started',
            'file_path': video_processor.current_video_path
        })
    else:
        return JSONResponse({
            'status': 'error', 
            'message': 'Failed to start recording'
        }, status_code=500)

@app.post("/stop-recording")
async def stop_recording():
    """Stop video recording"""
    result = video_processor.stop_recording()
    if result:
        return JSONResponse({
            'status': 'success', 
            'message': 'Recording stopped',
            'recording_info': result
        })
    else:
        return JSONResponse({
            'status': 'error', 
            'message': 'Failed to stop recording or no recording in progress'
        }, status_code=500)

@app.get("/recordings")
async def get_recordings(limit: int = 50, offset: int = 0):
    """Get list of video recordings from database"""
    if not supabase:
        return JSONResponse({'status': 'error', 'message': 'Database not available'}, status_code=503)
    
    try:
        loop = asyncio.get_event_loop()
        
        def fetch_data():
            query = supabase.table('video_recordings').select('*').order('recorded_at', {'ascending': False})
            return query.range(offset, offset + limit - 1).execute()
        
        data, error = await loop.run_in_executor(None, fetch_data)
        
        if error:
            return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
        
        return JSONResponse({'status': 'success', 'data': data[1] if data else []})
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.get("/recordings/{recording_id}")
async def get_recording(recording_id: str):
    """Get specific recording details"""
    if not supabase:
        return JSONResponse({'status': 'error', 'message': 'Database not available'}, status_code=503)
    
    try:
        loop = asyncio.get_event_loop()
        data, error = await loop.run_in_executor(
            None,
            lambda: supabase.table('video_recordings').select('*').eq('id', recording_id).execute()
        )
        
        if error:
            return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
        
        if not data or not data[1]:
            return JSONResponse({'status': 'error', 'message': 'Recording not found'}, status_code=404)
        
        return JSONResponse({'status': 'success', 'data': data[1][0]})
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.get("/download-video/{filename}")
async def download_video(filename: str):
    """Download a video file"""
    file_path = os.path.join(VIDEO_STORAGE_PATH, filename)
    
    if not os.path.exists(file_path):
        return JSONResponse({'status': 'error', 'message': 'File not found'}, status_code=404)
    
    try:
        return FileResponse(
            file_path,
            media_type='video/mp4',
            filename=filename
        )
    except Exception as e:
        return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

@app.get("/location")
async def get_location():
    """Get current location from GPS or geolocation fallback"""
    if hardware_manager:
        try:
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
        except Exception as e:
            return JSONResponse({'status': 'error', 'message': f'Location error: {str(e)}'}, status_code=500)
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
    try:
        if hardware_manager and hardware_manager.emergency_button:
            return JSONResponse({
                'emergency_active': hardware_manager.emergency_button.emergency_active,
                'monitoring': hardware_manager.emergency_button.monitoring,
                'last_emergency_time': hardware_manager.emergency_button.last_emergency_time
            })
        else:
            return JSONResponse({
                'emergency_active': False,
                'monitoring': False,
                'last_emergency_time': None,
                'status': 'unavailable'
            })
    except Exception as e:
        return JSONResponse({
            'emergency_active': False,
            'monitoring': False,
            'last_emergency_time': None,
            'status': 'error',
            'message': str(e)
        }, status_code=500)

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
    """Get current hardware status from database or hardware manager"""
    # Return mock data when database is not available or on error
    if hardware_manager:
        return JSONResponse({
            'camera': 'available' if hardware_manager.camera_available else 'unavailable',
            'gps': 'available' if hardware_manager.gps_available else 'unavailable',
            'sms': 'available' if hardware_manager.sms_available else 'unavailable',
            'emergency_button': 'available' if hardware_manager.emergency_button_available else 'unavailable',
            'last_updated': None
        })
    else:
        return JSONResponse({
            'camera': 'unknown',
            'gps': 'unknown',
            'sms': 'unknown',
            'emergency_button': 'unknown',
            'last_updated': None
        })
    
    # Database query logic (commented out for now to prevent 500 errors)
    # try:
    #     loop = asyncio.get_event_loop()
    #     data, error = await loop.run_in_executor(
    #         None,
    #         lambda: supabase.table('hardware_status').select('*').order('last_check', {'ascending': False}).execute()
    #     )
    #     
    #     if error:
    #         return JSONResponse({'status': 'error', 'message': error.message}, status_code=500)
    #     
    #     # Group by component and get latest status
    #     status_by_component = {}
    #     for status in data[1] if data else []:
    #         component = status['component']
    #         if component not in status_by_component:
    #             status_by_component[component] = status
    #     
    #     return JSONResponse({'status': 'success', 'data': list(status_by_component.values())})
    # except Exception as e:
    #     return JSONResponse({'status': 'error', 'message': str(e)}, status_code=500)

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

@app.get("/video_feed")
async def video_feed():
    """MJPEG stream endpoint - simpler alternative to WebSocket for browser display"""
    if not video_processor.running:
        success, err_msg = video_processor.start()
        if not success:
            return JSONResponse({"error": err_msg or "Camera not available"}, status_code=503)
        asyncio.create_task(video_processor.process_frames())
        asyncio.create_task(video_processor.stream_frames())

    async def generate():
        while video_processor.running:
            try:
                if not video_processor.frame_queue.empty():
                    frame_b64 = video_processor.frame_queue.get_nowait()
                    frame_bytes = base64.b64decode(frame_b64)
                    yield (
                        b'--frame\r\n'
                        b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
                    )
                else:
                    await asyncio.sleep(1.0 / FPS)
            except Exception:
                await asyncio.sleep(0.1)

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    video_processor.websocket_clients.add(websocket)

    try:
        # Auto-start stream immediately when a client connects
        if not video_processor.running:
            success, err_msg = video_processor.start()
            if success:
                asyncio.create_task(video_processor.process_frames())
                asyncio.create_task(video_processor.stream_frames())
                ai_available = video_processor.model is not None or hasattr(video_processor, 'hog') and video_processor.hog is not None
                await websocket.send_json({
                    "status": "Video stream started",
                    "ai_detection": ai_available,
                })
            else:
                await websocket.send_json({"error": err_msg or "Failed to start video stream - camera not found"})
        else:
            await websocket.send_json({"status": "Connected to video server"})

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get('action') == 'start_stream':
                if not video_processor.running:
                    success, err_msg = video_processor.start()
                    if success:
                        asyncio.create_task(video_processor.process_frames())
                        asyncio.create_task(video_processor.stream_frames())
                        await websocket.send_json({"status": "Video stream started"})
                    else:
                        await websocket.send_json({"error": err_msg or "Failed to start video stream"})
                else:
                    await websocket.send_json({"status": "Video stream already running"})

            elif message.get('action') == 'stop_stream':
                video_processor.stop()
                await websocket.send_json({"status": "Video stream stopped"})
            
            elif message.get('action') == 'start_recording':
                success = video_processor.start_recording()
                if success:
                    await websocket.send_json({
                        "status": "Recording started",
                        "file_path": video_processor.current_video_path
                    })
                else:
                    await websocket.send_json({"error": "Failed to start recording"})
            
            elif message.get('action') == 'stop_recording':
                result = video_processor.stop_recording()
                if result:
                    await websocket.send_json({
                        "status": "Recording stopped",
                        "recording_info": result
                    })
                else:
                    await websocket.send_json({"error": "Failed to stop recording"})

    except WebSocketDisconnect:
        print("Client disconnected")
        video_processor.websocket_clients.discard(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        video_processor.websocket_clients.discard(websocket)

if __name__ == '__main__':
    import uvicorn
    
    print("Starting Bus Monitoring Video Server (FastAPI)...")
    print(f"Camera ID: {CAMERA_ID}")
    print(f"Resolution: {CAMERA_WIDTH}x{CAMERA_HEIGHT}")
    print(f"FPS: {FPS}")
    
    try:
        uvicorn.run(app, host='0.0.0.0', port=5000)
    except KeyboardInterrupt:
        print("Server shutdown requested")
    except Exception as e:
        print(f"Server error: {e}")
